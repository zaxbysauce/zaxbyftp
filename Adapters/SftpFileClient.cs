using System.Diagnostics;
using System.IO;
using System.Text.Json;
using FtpClient.Models;
using Renci.SshNet;

namespace FtpClient.Adapters;

/// <summary>
/// IFileClient implementation for SFTP, backed by SSH.NET.
///
/// Host-key verification
/// ─────────────────────
/// On first connect to a host:port the SHA-256 fingerprint is stored in
/// %LOCALAPPDATA%\FtpClient\known_hosts.json and the connection is trusted.
///
/// On subsequent connects the stored fingerprint is compared.  If it differs
/// <see cref="HostKeyMismatch"/> is raised.  Callers (AppBridge in Phase 3)
/// must wire this to a UI confirmation before awaiting ConnectAsync.
///
/// Threading note
/// ──────────────
/// SSH.NET's SftpClient.Connect() is synchronous.  We run it inside
/// Task.Run() so it executes on a ThreadPool thread with NO synchronisation
/// context.  This makes calling .GetAwaiter().GetResult() inside the
/// HostKeyReceived handler safe — no deadlock risk.
/// </summary>
public sealed class SftpFileClient : IFileClient
{
    // ── Host-key mismatch event ───────────────────────────────────────────
    /// <summary>
    /// Raised when a known host presents a different fingerprint than stored.
    /// Parameters: (host, newFingerprint).
    /// Return true to trust-and-update, false to abort.
    /// Phase 3 (AppBridge) wires this to a WebView2 PostWebMessageAsJson call.
    /// </summary>
    public Func<string, string, Task<bool>>? HostKeyMismatch { get; set; }

    // ── Internal state ────────────────────────────────────────────────────
    private SftpClient? _sftp;
    private ConnectionProfile? _profile;

    private static readonly string KnownHostsPath =
        Path.Combine(MainWindow.AppDataDir, "known_hosts.json");

    // In-memory cache; loaded once per process, persisted after each change.
    // _knownHostsLock guards every read AND write — multiple SftpFileClient
    // instances can connect simultaneously to different hosts.
    private static Dictionary<string, string> _knownHosts    = LoadKnownHosts();
    private static readonly object            _knownHostsLock = new();

    // ── Connect ───────────────────────────────────────────────────────────
    public async Task ConnectAsync(ConnectionProfile profile)
    {
        Disconnect();
        _profile = profile;

        _sftp = BuildClient(profile);

        // Register host-key handler BEFORE connecting.
        _sftp.HostKeyReceived += OnHostKeyReceived;

        // Connect() is synchronous — run on ThreadPool to avoid blocking the
        // WPF dispatcher AND to ensure no SynchronizationContext is present on
        // the thread (required for safe .GetAwaiter().GetResult() inside the
        // HostKeyReceived handler).
        await Task.Run(() => _sftp.Connect());
    }

    // ── ListDirectory ─────────────────────────────────────────────────────
    public Task<List<RemoteItem>> ListDirectoryAsync(string path)
    {
        var sftp = RequireConnected();
        return Task.Run(() =>
        {
            var items = sftp.ListDirectory(path);
            return items
                .Where(i => i.Name is not ("." or ".."))
                .Select(i => new RemoteItem
                {
                    Name        = i.Name,
                    FullPath    = i.FullName,
                    Size        = i.Attributes.Size,
                    Modified    = i.LastWriteTime,
                    IsDirectory = i.IsDirectory,
                    Permissions = FormatPermissions(i.Attributes)
                })
                .ToList();
        });
    }

    // ── Upload ────────────────────────────────────────────────────────────
    public Task UploadAsync(string localPath, string remotePath,
                            IProgress<TransferProgress>? progress)
    {
        var sftp = RequireConnected();
        var totalBytes = new FileInfo(localPath).Length;
        var sw = Stopwatch.StartNew();

        return Task.Run(() =>
        {
            using var stream = File.OpenRead(localPath);
            sftp.UploadFile(stream, remotePath, uploadCallback: bytesUploaded =>
            {
                if (progress is null) return;
                var elapsed = sw.Elapsed.TotalSeconds;
                progress.Report(new TransferProgress
                {
                    BytesTransferred    = (long)bytesUploaded,
                    TotalBytes          = totalBytes,
                    SpeedBytesPerSecond = elapsed > 0.001 ? bytesUploaded / elapsed : 0
                });
            });
        });
    }

    // ── Download ──────────────────────────────────────────────────────────
    public Task DownloadAsync(string remotePath, string localPath,
                              IProgress<TransferProgress>? progress)
    {
        var sftp = RequireConnected();
        var sw = Stopwatch.StartNew();

        return Task.Run(() =>
        {
            var totalBytes = sftp.GetAttributes(remotePath).Size;

            // Ensure the local directory exists.
            var dir = Path.GetDirectoryName(localPath);
            if (!string.IsNullOrEmpty(dir))
                Directory.CreateDirectory(dir);

            using var stream = File.Create(localPath);
            sftp.DownloadFile(remotePath, stream, bytesDownloaded =>
            {
                if (progress is null) return;
                var elapsed = sw.Elapsed.TotalSeconds;
                progress.Report(new TransferProgress
                {
                    BytesTransferred    = (long)bytesDownloaded,
                    TotalBytes          = totalBytes,
                    SpeedBytesPerSecond = elapsed > 0.001 ? bytesDownloaded / elapsed : 0
                });
            });
        });
    }

    // ── Mkdir / Rename / Delete ───────────────────────────────────────────
    public Task MkdirAsync(string path)
    {
        var sftp = RequireConnected();
        return Task.Run(() => sftp.CreateDirectory(path));
    }

    public Task RenameAsync(string oldPath, string newPath)
    {
        var sftp = RequireConnected();
        return Task.Run(() => sftp.RenameFile(oldPath, newPath));
    }

    public Task DeleteAsync(string path)
    {
        var sftp = RequireConnected();
        return Task.Run(() =>
        {
            var attrs = sftp.GetAttributes(path);
            if (attrs.IsDirectory)
                sftp.DeleteDirectory(path);
            else
                sftp.DeleteFile(path);
        });
    }

    // ── Disconnect / Dispose ──────────────────────────────────────────────
    public void Disconnect()
    {
        var sftp = _sftp;
        _sftp    = null;
        _profile = null;
        if (sftp is null) return;
        try { sftp.Disconnect(); } catch { /* best-effort */ }
        sftp.Dispose();
    }

    public void Dispose() => Disconnect();

    // ── Host-key handler (runs on ThreadPool via Task.Run — no sync ctx) ──
    private void OnHostKeyReceived(object? sender, Renci.SshNet.Common.HostKeyEventArgs e)
    {
        // FingerPrintSHA256 is a pre-formatted string in SSH.NET 2025.x
        var fingerprint = e.FingerPrintSHA256;
        var hostKey     = $"{_profile!.Host}:{_profile.EffectivePort}";

        // Snapshot the stored entry under the lock, then release before any
        // potentially blocking call (the user-prompt async delegate).
        string? stored;
        lock (_knownHostsLock)
            _knownHosts.TryGetValue(hostKey, out stored);

        if (stored is null)
        {
            // ── First connection to this host (TOFU) ─────────────────────
            lock (_knownHostsLock)
            {
                _knownHosts[hostKey] = fingerprint;
                PersistKnownHosts();
            }
            e.CanTrust = true;
            return;
        }

        if (stored == fingerprint)
        {
            e.CanTrust = true;
            return;
        }

        // ── Fingerprint mismatch ──────────────────────────────────────────
        // Safe to block here: we're on a ThreadPool thread (started by Task.Run
        // in ConnectAsync) with no SynchronizationContext, so
        // GetAwaiter().GetResult() won't deadlock.
        var trust = HostKeyMismatch
                    ?.Invoke(_profile.Host, fingerprint)
                    .GetAwaiter().GetResult()
                    ?? false; // no handler = reject by default (safe)

        e.CanTrust = trust;
        if (trust)
        {
            lock (_knownHostsLock)
            {
                _knownHosts[hostKey] = fingerprint;
                PersistKnownHosts();
            }
        }
    }

    // ── Client factory ────────────────────────────────────────────────────
    private static SftpClient BuildClient(ConnectionProfile profile)
    {
        // Private-key auth takes priority when a key path is provided.
        if (!string.IsNullOrEmpty(profile.PrivateKeyPath))
        {
            IPrivateKeySource keySource;
            try
            {
                keySource = string.IsNullOrEmpty(profile.PrivateKeyPassphrase)
                    ? new PrivateKeyFile(profile.PrivateKeyPath)
                    : new PrivateKeyFile(profile.PrivateKeyPath,
                                         profile.PrivateKeyPassphrase);
            }
            catch (Exception ex)
            {
                throw new InvalidOperationException(
                    $"Failed to load private key from '{profile.PrivateKeyPath}': {ex.Message}", ex);
            }

            return new SftpClient(
                profile.Host,
                profile.EffectivePort,
                profile.Username,
                keySource);
        }

        return new SftpClient(
            profile.Host,
            profile.EffectivePort,
            profile.Username,
            profile.Password ?? string.Empty);
    }

    // ── Known-hosts persistence ────────────────────────────────────────────
    private static Dictionary<string, string> LoadKnownHosts()
    {
        try
        {
            if (File.Exists(KnownHostsPath))
            {
                var json = File.ReadAllText(KnownHostsPath);
                return JsonSerializer.Deserialize<Dictionary<string, string>>(json)
                       ?? new Dictionary<string, string>();
            }
        }
        catch { /* corrupt or missing — start fresh */ }
        return new Dictionary<string, string>();
    }

    private static void PersistKnownHosts()
    {
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(KnownHostsPath)!);
            var json = JsonSerializer.Serialize(
                _knownHosts,
                new JsonSerializerOptions { WriteIndented = true });
            File.WriteAllText(KnownHostsPath, json);
        }
        catch { /* best-effort — non-fatal */ }
    }

    // ── Helpers ───────────────────────────────────────────────────────────
    private static string FormatPermissions(Renci.SshNet.Sftp.SftpFileAttributes a) =>
        new(new[]
        {
            a.OwnerCanRead    ? 'r' : '-',
            a.OwnerCanWrite   ? 'w' : '-',
            a.OwnerCanExecute ? 'x' : '-',
            a.GroupCanRead    ? 'r' : '-',
            a.GroupCanWrite   ? 'w' : '-',
            a.GroupCanExecute ? 'x' : '-',
            a.OthersCanRead   ? 'r' : '-',
            a.OthersCanWrite  ? 'w' : '-',
            a.OthersCanExecute? 'x' : '-',
        });

    private SftpClient RequireConnected()
    {
        if (_sftp is not { IsConnected: true })
            throw new InvalidOperationException("SFTP client is not connected.");
        return _sftp;
    }
}
