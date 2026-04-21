using System.Collections.Concurrent;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using System.Windows;
using System.Windows.Threading;
using FtpClient.Adapters;
using FtpClient.Models;
using Microsoft.Web.WebView2.Core;
using Windows.Security.Credentials;

namespace FtpClient;

// ── COM requirements for WebView2 AddHostObjectToScript ─────────────────────
// AutoDual: exposes all public members via IDispatch (required by WebView2).
// ComVisible: marks the class for COM registration.
//
// All methods are synchronous from the COM perspective.  Async operations
// are started fire-and-forget; results are delivered back to JavaScript via
// CoreWebView2.PostWebMessageAsJson({ type:"response", requestId, result }).
//
// This avoids the known WebView2 Task<T> null-return issue (#822) where
// async methods returning Task<string> may resolve to null in JavaScript.
[ComVisible(true)]
[ClassInterface(ClassInterfaceType.AutoDual)]
public sealed class AppBridge
{
    // ── State ────────────────────────────────────────────────────────────────
    private readonly CoreWebView2 _core;
    private readonly Dispatcher   _dispatcher;

    /// <summary>Live sessions keyed by GUID string returned to JavaScript.</summary>
    private readonly ConcurrentDictionary<string, IFileClient> _sessions = new();

    /// <summary>
    /// Pending host-key confirmation prompts.
    /// Key = SHA-256 fingerprint string (unique per prompt).
    /// Value = TCS awaited by SftpFileClient.OnHostKeyReceived on a ThreadPool thread.
    /// </summary>
    private readonly ConcurrentDictionary<string, TaskCompletionSource<bool>>
        _pendingHostKeyPrompts = new();

    // ── File paths ───────────────────────────────────────────────────────────
    private static readonly string SitesPath =
        Path.Combine(MainWindow.AppDataDir, "sites.json");

    private static readonly string TrustedCertsPath =
        Path.Combine(MainWindow.AppDataDir, "trusted_certs.json");

    // ── FTPS trusted certificates ────────────────────────────────────────────
    // Keyed by "host|SHA256fingerprint" — same TOFU pattern used for SFTP host keys.
    private HashSet<string>? _trustedCerts;
    private readonly object  _trustedCertsLock = new();

    /// <summary>Pending FTPS certificate confirmation prompts.</summary>
    private readonly ConcurrentDictionary<string, TaskCompletionSource<bool>>
        _pendingCertPrompts = new();

    // ── Path validation helper ─────────────────────────────────────────────

    /// <summary>
    /// Validates a local file path for safety.
    /// Returns null on success, or an error string describing the failure.
    /// </summary>
    /// <param name="path">The path to validate.</param>
    /// <param name="allowAnyAbsolute">
    /// If true, any absolute path is allowed. If false, the path must resolve
    /// to one of the safe user directories (UserProfile, Personal, Desktop, Downloads, Documents).
    /// </param>
    private string? ValidateLocalPath(string path, bool allowAnyAbsolute = false)
    {
        // (a) Reject empty or whitespace paths
        if (string.IsNullOrWhiteSpace(path))
            return "Path cannot be empty";

        // (b) Reject null bytes
        if (path.Contains('\0'))
            return "Path contains null bytes";

        // (c) Reject traversal sequences in the ORIGINAL input
        if (path.Contains(".."))
            return "Path traversal (..) is not allowed";

        // (d) Reject UNC and device paths (\\, //, \\?\, \\.\, //?/, //./)
        if (path.Length >= 2 && (path[0] == '\\' || path[0] == '/') && (path[1] == '\\' || path[1] == '/'))
            return "UNC and device paths are not allowed";

        // (e) Normalize via GetFullPath — throws on invalid path
        string normalized;
        try
        {
            normalized = Path.GetFullPath(path);
        }
        catch (Exception ex)
        {
            return $"Invalid path: {ex.Message}";
        }

        // (f) If allowAnyAbsolute is false, check against safe roots
        if (!allowAnyAbsolute)
        {
            var userProfile = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
            var personal    = Environment.GetFolderPath(Environment.SpecialFolder.Personal);
            var desktop     = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
            var downloads   = Path.Combine(userProfile, "Downloads");
            var documents   = Path.Combine(userProfile, "Documents");

            var safeRoots = new[] { userProfile, personal, desktop, downloads, documents };

            bool isSafe = safeRoots.Any(root =>
                normalized.Equals(root, StringComparison.OrdinalIgnoreCase) ||
                normalized.StartsWith(root + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase) ||
                normalized.StartsWith(root + Path.AltDirectorySeparatorChar, StringComparison.OrdinalIgnoreCase));

            if (!isSafe)
                return "Path is outside allowed user directories";
        }

        return null; // success
    }

    /// <summary>
    /// Sanitizes an error message by redacting IP addresses and Windows absolute paths.
    /// Preserves the overall error structure and user-actionable text.
    /// </summary>
    private static string SanitizeErrorMessage(string message)
    {
        // Redact IPv4 addresses (e.g., 192.168.1.1, 10.0.0.1)
        message = Regex.Replace(message, @"\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b", "[redacted]");

        // Redact Windows absolute paths (e.g., C:\Users\foo, D:\path\file.ext)
        message = Regex.Replace(message, "[A-Za-z]:\\\\[^\\s\"']*", "[path redacted]");

        return message;
    }

    // ── PasswordVault ────────────────────────────────────────────────────────
    private const string VaultResource = "FtpClient";
    private static readonly PasswordVault _vault = new();

    // ── Origin validation ────────────────────────────────────────────────────

    /// <summary>
    /// Validates that a message source URI originates from the expected host (ftpclient.local).
    /// Returns null if valid, or an error description if invalid.
    /// </summary>
    private static string? ValidateOrigin(string? sourceUri)
    {
        if (string.IsNullOrEmpty(sourceUri))
            return "null or empty";

        if (!Uri.TryCreate(sourceUri, UriKind.Absolute, out var uri) ||
            !uri.Host.Equals("ftpclient.local", StringComparison.OrdinalIgnoreCase))
            return sourceUri;

        return null;
    }

    // ── JSON options ─────────────────────────────────────────────────────────
    private static readonly JsonSerializerOptions _json =
        new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };

    // ── Constructor ──────────────────────────────────────────────────────────
    public AppBridge(CoreWebView2 core, Dispatcher dispatcher)
    {
        _core       = core;
        _dispatcher = dispatcher;
        _core.WebMessageReceived += OnWebMessageReceived;
    }

    // ════════════════════════════════════════════════════════════════════════
    //  CONNECTION
    // ════════════════════════════════════════════════════════════════════════

    /// <summary>
    /// Begin an async connect.  Result is delivered via:
    ///   { type:"response", requestId, result: sessionGuid }  on success
    ///   { type:"error",    requestId, message }              on failure
    /// </summary>
    public void Connect(string requestId, string host, int port,
                        string user, string pass, string protocol)
    {
        _ = ConnectCoreAsync(requestId, host, port, user, pass, protocol);
    }

    private async Task ConnectCoreAsync(string requestId, string host, int port,
                                        string user, string pass, string protocol)
    {
        try
        {
            var ftpProtocol = protocol switch
            {
                "ftp"           => FtpProtocol.Ftp,
                "ftps-explicit" => FtpProtocol.FtpsExplicit,
                "ftps-implicit" => FtpProtocol.FtpsImplicit,
                "sftp"          => FtpProtocol.Sftp,
                _               => throw new ArgumentException($"Unknown protocol: '{protocol}'")
            };

            var profile = new ConnectionProfile
            {
                Host     = host,
                Port     = port,
                Username = user,
                Password = pass,
                Protocol = ftpProtocol
            };

            IFileClient client = ftpProtocol == FtpProtocol.Sftp
                ? BuildSftpClient()
                : BuildFtpClient();

            await client.ConnectAsync(profile);

            var sessionId = Guid.NewGuid().ToString("N");
            _sessions[sessionId] = client;
            PostResponse(requestId, sessionId);
        }
        catch (Exception ex)
        {
            PostError(requestId, ex.Message);
        }
    }

    /// <summary>
    /// Creates an SftpFileClient wired with the host-key mismatch callback.
    /// The callback posts a hostKeyPrompt message to JS and awaits user decision.
    /// </summary>
    private SftpFileClient BuildSftpClient()
    {
        var sftp = new SftpFileClient();

        sftp.HostKeyMismatch = async (hostName, fingerprint) =>
        {
            var tcs = new TaskCompletionSource<bool>(
                          TaskCreationOptions.RunContinuationsAsynchronously);
            _pendingHostKeyPrompts[fingerprint] = tcs;

            // PostWebMessageAsJson must be called on the UI thread.
            // At this point we're on a ThreadPool thread (Task.Run inside
            // SftpFileClient.ConnectAsync), so we dispatch.
            await _dispatcher.InvokeAsync(() =>
                _core.PostWebMessageAsJson(
                    JsonSerializer.Serialize(new
                    {
                        type        = "hostKeyPrompt",
                        fingerprint,
                        host        = hostName
                    })));

            // Block this ThreadPool thread until JS replies or the window closes.
            return await tcs.Task;
        };

        sftp.HostKeyFirstTrust = (hostName, fingerprint) =>
        {
            // Post notification to JS — must dispatch to UI thread
            _ = _dispatcher.InvokeAsync(() =>
                _core.PostWebMessageAsJson(
                    JsonSerializer.Serialize(new
                    {
                        type        = "hostKeyTrusted",
                        host        = hostName,
                        fingerprint
                    })));
        };

        return sftp;
    }

    /// <summary>
    /// Creates an FtpFileClient wired with the FTPS certificate validation callback.
    /// First connection: if the SHA-256 fingerprint is already in trusted_certs.json,
    /// it is auto-accepted.  Otherwise a "certPrompt" message is sent to JS and the
    /// connection thread blocks until the user confirms or rejects.
    /// </summary>
    private FtpFileClient BuildFtpClient()
    {
        var ftp = new FtpFileClient();

        ftp.CertificateValidator = async (h, fingerprint) =>
        {
            var key = $"{h}|{fingerprint}";

            // Auto-trust if we have a stored record for this exact host+cert.
            lock (_trustedCertsLock)
            {
                _trustedCerts ??= LoadTrustedCerts();
                if (_trustedCerts.Contains(key)) return true;
            }

            // Unknown cert — prompt the user.
            var tcs = new TaskCompletionSource<bool>(
                          TaskCreationOptions.RunContinuationsAsynchronously);
            _pendingCertPrompts[fingerprint] = tcs;

            await _dispatcher.InvokeAsync(() =>
                _core.PostWebMessageAsJson(
                    JsonSerializer.Serialize(new
                    {
                        type        = "certPrompt",
                        fingerprint,
                        host        = h
                    })));

            return await tcs.Task;
        };

        return ftp;
    }

    /// <summary>Closes a session and disposes its client.</summary>
    public void Disconnect(string sessionId)
    {
        if (_sessions.TryRemove(sessionId, out var client))
            client.Disconnect();
    }

    /// <summary>
    /// Called by MainWindow.OnWindowClosing to unblock any ThreadPool threads
    /// that are blocked on a host-key prompt TCS.  Without this, those threads
    /// would leak if the user closes the window while an SFTP connect is pending
    /// a host-key confirmation in the UI.
    /// Resolves all pending prompts with <c>false</c> (reject), causing the SFTP
    /// connect to fail cleanly rather than hang.
    /// </summary>
    public void CancelPendingPrompts()
    {
        foreach (var key in _pendingHostKeyPrompts.Keys.ToList())
        {
            if (_pendingHostKeyPrompts.TryRemove(key, out var tcs))
                tcs.TrySetResult(false);
        }

        foreach (var key in _pendingCertPrompts.Keys.ToList())
        {
            if (_pendingCertPrompts.TryRemove(key, out var tcs))
                tcs.TrySetResult(false);
        }

        // Also gracefully disconnect all active sessions.
        foreach (var key in _sessions.Keys.ToList())
        {
            if (_sessions.TryRemove(key, out var client))
            {
                try { client.Disconnect(); } catch { /* best-effort */ }
            }
        }
    }

    // ════════════════════════════════════════════════════════════════════════
    //  DIRECTORY LISTING
    // ════════════════════════════════════════════════════════════════════════

    /// <summary>
    /// Lists a remote directory.  Result delivered via:
    ///   { type:"response", requestId, result: JSON-array-of-RemoteItem }
    /// </summary>
    public void ListDirectory(string requestId, string sessionId, string path)
    {
        _ = ListDirectoryCoreAsync(requestId, sessionId, path);
    }

    private async Task ListDirectoryCoreAsync(string requestId,
                                              string sessionId, string path)
    {
        try
        {
            var client = RequireSession(sessionId);
            var items  = await client.ListDirectoryAsync(path);
            PostResponse(requestId, JsonSerializer.Serialize(items, _json));
        }
        catch (Exception ex) { PostError(requestId, ex.Message); }
    }

    /// <summary>
    /// Lists a local directory synchronously.
    /// Returns a JSON array directly (no async needed — fast local I/O).
    /// </summary>
    public string ListLocalDirectory(string path)
    {
        var validationResult = ValidateLocalPath(path, allowAnyAbsolute: false);
        if (validationResult is not null)
            return JsonSerializer.Serialize(new { error = validationResult });

        try
        {
            var entries = new List<object>();

            foreach (var d in Directory.GetDirectories(path).OrderBy(x => x))
            {
                var di = new DirectoryInfo(d);
                entries.Add(new
                {
                    name        = di.Name,
                    fullPath    = di.FullName,
                    size        = -1L,
                    modified    = di.LastWriteTime,
                    isDirectory = true,
                    type        = "dir",
                    permissions = string.Empty
                });
            }
            foreach (var f in Directory.GetFiles(path).OrderBy(x => x))
            {
                var fi = new FileInfo(f);
                entries.Add(new
                {
                    name        = fi.Name,
                    fullPath    = fi.FullName,
                    size        = fi.Length,
                    modified    = fi.LastWriteTime,
                    isDirectory = false,
                    type        = "file",
                    permissions = string.Empty
                });
            }

            return JsonSerializer.Serialize(entries, _json);
        }
        catch (Exception ex)
        {
            return JsonSerializer.Serialize(new { error = ex.Message });
        }
    }

    // ════════════════════════════════════════════════════════════════════════
    //  TRANSFERS
    // ════════════════════════════════════════════════════════════════════════

    /// <summary>
    /// Starts an upload.  Progress and completion posted as:
    ///   { type:"progress", transferId, bytesTransferred, totalBytes,
    ///                      speedBytesPerSecond, percentComplete, status }
    ///   status: "active" | "complete" | "error"
    /// </summary>
    public void Upload(string sessionId, string localPath,
                       string remotePath, string transferId)
    {
        var validationResult = ValidateLocalPath(localPath, allowAnyAbsolute: true);
        if (validationResult is not null)
        {
            PostTransferEvent(transferId, 0, 0, 0, -1, "error", validationResult);
            return;
        }

        _ = TransferCoreAsync(
                transferId,
                () => RequireSession(sessionId)
                          .UploadAsync(localPath, remotePath,
                                       MakeProgress(transferId)));
    }

    /// <summary>Same event shape as Upload.</summary>
    public void Download(string sessionId, string remotePath,
                         string localPath, string transferId)
    {
        var validationResult = ValidateLocalPath(localPath, allowAnyAbsolute: true);
        if (validationResult is not null)
        {
            PostTransferEvent(transferId, 0, 0, 0, -1, "error", validationResult);
            return;
        }

        _ = TransferCoreAsync(
                transferId,
                () => RequireSession(sessionId)
                          .DownloadAsync(remotePath, localPath,
                                         MakeProgress(transferId)));
    }

    private async Task TransferCoreAsync(string transferId,
                                         Func<Task> doTransfer)
    {
        try
        {
            await doTransfer();
            PostTransferEvent(transferId, 0, 0, 0, 100, "complete");
        }
        catch (Exception ex)
        {
            PostTransferEvent(transferId, 0, 0, 0, -1, "error", ex.Message);
        }
    }

    /// <summary>
    /// Creates an IProgress<TransferProgress> that is bound to the UI thread's
    /// SynchronizationContext (Progress<T> captures it at construction time).
    /// Since Upload/Download are called from WebView2 COM callbacks on the UI
    /// thread, the progress handler automatically runs on the UI thread.
    /// </summary>
    private IProgress<TransferProgress> MakeProgress(string transferId) =>
        new Progress<TransferProgress>(p =>
            PostTransferEvent(
                transferId,
                p.BytesTransferred,
                p.TotalBytes,
                p.SpeedBytesPerSecond,
                p.PercentComplete,
                "active"));

    private void PostTransferEvent(string transferId, long bytes, long total,
                                   double speed, double pct, string status,
                                   string? errorMessage = null)
    {
        var payload = errorMessage is null
            ? JsonSerializer.Serialize(new
              {
                  type                = "progress",
                  transferId,
                  bytesTransferred    = bytes,
                  totalBytes          = total,
                  speedBytesPerSecond = speed,
                  percentComplete     = pct,
                  status
              })
            : JsonSerializer.Serialize(new
              {
                  type       = "progress",
                  transferId,
                  status,
                  message    = errorMessage
              });

        PostJson(payload);
    }

    // ════════════════════════════════════════════════════════════════════════
    //  FILE OPERATIONS  (void: result posted as { type:"ack", requestId })
    // ════════════════════════════════════════════════════════════════════════

    public void Mkdir(string requestId, string sessionId, string path)
        => _ = AckOpAsync(requestId, () => RequireSession(sessionId).MkdirAsync(path));

    public void Rename(string requestId, string sessionId,
                       string oldPath, string newPath)
        => _ = AckOpAsync(requestId,
                           () => RequireSession(sessionId).RenameAsync(oldPath, newPath));

    public void Delete(string requestId, string sessionId, string path)
        => _ = AckOpAsync(requestId, () => RequireSession(sessionId).DeleteAsync(path));

    private async Task AckOpAsync(string requestId, Func<Task> op)
    {
        try
        {
            await op();
            PostJson(JsonSerializer.Serialize(new { type = "ack", requestId }));
        }
        catch (Exception ex) { PostError(requestId, ex.Message); }
    }

    // ════════════════════════════════════════════════════════════════════════
    //  SITE MANAGER
    // ════════════════════════════════════════════════════════════════════════

    /// <summary>
    /// Returns a JSON array of saved sites.  Passwords are retrieved from
    /// PasswordVault and included (in-process transmission is acceptable;
    /// no plaintext is written to disk).
    /// </summary>
    public string GetSavedSites()
    {
        try
        {
            var sites = LoadSitesFromDisk();
            foreach (var site in sites)
            {
                var vaultKey = site["name"]?.GetValue<string>();
                if (vaultKey is null) continue;
                try
                {
                    var cred = _vault.Retrieve(VaultResource, vaultKey);
                    cred.RetrievePassword();
                    site["password"] = cred.Password;
                }
                catch { /* no saved password for this site */ }
            }
            return JsonSerializer.Serialize(sites, _json);
        }
        catch (Exception ex)
        {
            return JsonSerializer.Serialize(new { error = ex.Message });
        }
    }

    /// <summary>
    /// Persists a site.  The JSON may include a "password" field; if present
    /// it is extracted and stored in PasswordVault — never written to disk.
    /// </summary>
    public void SaveSite(string siteJson)
    {
        try
        {
            var node = JsonNode.Parse(siteJson)?.AsObject()
                       ?? throw new ArgumentException("Invalid site JSON");
            var name = node["name"]?.GetValue<string>()
                       ?? throw new ArgumentException("Site must have a 'name'");

            // Extract and vault the password before writing to disk.
            if (node["password"]?.GetValue<string>() is { Length: > 0 } pw)
            {
                // PasswordVault does not support in-place update; we must Remove
                // then Add.  PasswordVault.Add() is effectively infallible for
                // valid non-empty arguments (only fails on OOM or corrupt vault
                // state — neither realistic for a handful of FTP credentials).
                // If the vault is corrupt enough to fail Add(), the user will
                // need to re-enter the password on next connect, which is a
                // tolerable recovery path.
                try { _vault.Remove(_vault.Retrieve(VaultResource, name)); }
                catch { /* no prior entry — Remove is best-effort */ }
                _vault.Add(new PasswordCredential(VaultResource, name, pw));
                node.Remove("password");
            }

            var sites  = LoadSitesFromDisk();
            var idx    = sites.FindIndex(s =>
                             s["name"]?.GetValue<string>() == name);
            if (idx >= 0) sites[idx] = node;
            else          sites.Add(node);

            SaveSitesToDisk(sites);
        }
        catch
        {
            PostJson(JsonSerializer.Serialize(new { type = "siteSaveError", message = "Failed to save site credentials" }));
        }
    }

    /// <summary>Removes a site from disk and PasswordVault.</summary>
    public void DeleteSite(string name)
    {
        try
        {
            var sites = LoadSitesFromDisk();
            sites.RemoveAll(s => s["name"]?.GetValue<string>() == name);
            SaveSitesToDisk(sites);

            try { _vault.Remove(_vault.Retrieve(VaultResource, name)); }
            catch { /* no vault entry */ }
        }
        catch { /* swallow */ }
    }

    // ════════════════════════════════════════════════════════════════════════
    //  INBOUND WEB MESSAGES (JS → WPF)
    // ════════════════════════════════════════════════════════════════════════

    private void OnWebMessageReceived(object? sender,
        CoreWebView2WebMessageReceivedEventArgs e)
    {
        string json;
        try { json = e.TryGetWebMessageAsString(); }
        catch { return; }

        // Origin validation: reject messages from unexpected hosts
        var originError = ValidateOrigin(e.Source);
        if (originError is not null)
        {
            Console.Error.WriteLine($"[AppBridge] Rejected message from unexpected origin: {originError}");
            return;
        }

        try
        {
            var doc    = JsonDocument.Parse(json);
            var root   = doc.RootElement;
            var action = root.TryGetProperty("action", out var a)
                         ? a.GetString() : null;

            switch (action)
            {
                // ── Host-key prompt responses ────────────────────────────
                case "trustHost":
                case "rejectHost":
                {
                    var fp = root.GetProperty("fingerprint").GetString()!;
                    if (_pendingHostKeyPrompts.TryRemove(fp, out var tcs))
                        tcs.SetResult(action == "trustHost");
                    break;
                }

                // ── FTPS certificate prompt responses ─────────────────
                case "trustCert":
                {
                    var fp   = root.GetProperty("fingerprint").GetString()!;
                    var h    = root.GetProperty("host").GetString()!;
                    AddTrustedCert(h, fp);
                    if (_pendingCertPrompts.TryRemove(fp, out var tcs))
                        tcs.SetResult(true);
                    break;
                }

                case "rejectCert":
                {
                    var fp = root.GetProperty("fingerprint").GetString()!;
                    if (_pendingCertPrompts.TryRemove(fp, out var tcs))
                        tcs.SetResult(false);
                    break;
                }

                // ── Window chrome ────────────────────────────────────────
                case "dragWindow":
                    _dispatcher.InvokeAsync(() =>
                        Application.Current.MainWindow?.DragMove());
                    break;

                case "closeWindow":
                    _dispatcher.InvokeAsync(() =>
                        Application.Current.MainWindow?.Close());
                    break;

                case "minimizeWindow":
                    _dispatcher.InvokeAsync(() =>
                    {
                        if (Application.Current.MainWindow is { } w)
                            w.WindowState = WindowState.Minimized;
                    });
                    break;

                case "maximizeWindow":
                    _dispatcher.InvokeAsync(() =>
                    {
                        if (Application.Current.MainWindow is { } w)
                            w.WindowState = w.WindowState == WindowState.Maximized
                                ? WindowState.Normal
                                : WindowState.Maximized;
                    });
                    break;
            }
        }
        catch { /* malformed message — ignore */ }
    }

    // ════════════════════════════════════════════════════════════════════════
    //  HELPERS
    // ════════════════════════════════════════════════════════════════════════

    private IFileClient RequireSession(string sessionId)
    {
        if (!_sessions.TryGetValue(sessionId, out var client))
            throw new InvalidOperationException(
                $"No active session '{sessionId}'.");
        return client;
    }

    private void PostResponse(string requestId, string result) =>
        PostJson(JsonSerializer.Serialize(new
        {
            type = "response",
            requestId,
            result
        }));

    private void PostError(string requestId, string message) =>
        PostJson(JsonSerializer.Serialize(new
        {
            type = "error",
            requestId,
            message = SanitizeErrorMessage(message)
        }));

    /// <summary>
    /// Thread-safe PostWebMessageAsJson: dispatches to the UI thread if needed.
    /// </summary>
    private void PostJson(string json)
    {
        if (_dispatcher.CheckAccess())
            _core.PostWebMessageAsJson(json);
        else
            _dispatcher.InvokeAsync(() => _core.PostWebMessageAsJson(json));
    }

    /// <summary>
    /// Returns the user profile path for use as a safe default local directory.
    /// </summary>
    public string GetUserProfilePath()
    {
        return Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
    }

    // ── Trusted FTPS certificates ─────────────────────────────────────────

    private static HashSet<string> LoadTrustedCerts()
    {
        try
        {
            if (!File.Exists(TrustedCertsPath)) return new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var json = File.ReadAllText(TrustedCertsPath);
            var arr  = JsonSerializer.Deserialize<string[]>(json);
            return arr is null
                ? new HashSet<string>(StringComparer.OrdinalIgnoreCase)
                : new HashSet<string>(arr, StringComparer.OrdinalIgnoreCase);
        }
        catch { return new HashSet<string>(StringComparer.OrdinalIgnoreCase); }
    }

    private void AddTrustedCert(string host, string fingerprint)
    {
        var key = $"{host}|{fingerprint}";
        lock (_trustedCertsLock)
        {
            _trustedCerts ??= LoadTrustedCerts();
            if (!_trustedCerts.Add(key)) return; // already trusted
            try
            {
                Directory.CreateDirectory(Path.GetDirectoryName(TrustedCertsPath)!);
                File.WriteAllText(TrustedCertsPath,
                    JsonSerializer.Serialize(
                        _trustedCerts.ToArray(),
                        new JsonSerializerOptions { WriteIndented = true }));
            }
            catch { /* best-effort — cert is trusted in-memory even if disk write fails */ }
        }
    }

    // ── Sites JSON persistence ────────────────────────────────────────────
    private static List<JsonObject> LoadSitesFromDisk()
    {
        try
        {
            if (!File.Exists(SitesPath)) return new List<JsonObject>();
            var json  = File.ReadAllText(SitesPath);
            var array = JsonNode.Parse(json)?.AsArray();
            return array?
                .OfType<JsonObject>()
                .ToList()
                ?? new List<JsonObject>();
        }
        catch { return new List<JsonObject>(); }
    }

    private static void SaveSitesToDisk(List<JsonObject> sites)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(SitesPath)!);
        File.WriteAllText(SitesPath,
            JsonSerializer.Serialize(sites,
                new JsonSerializerOptions { WriteIndented = true }));
    }
}
