using System.IO;
using FluentFTP;
using FtpClient.Models;

namespace FtpClient.Adapters;

/// <summary>
/// IFileClient implementation for plain FTP, FTPS Explicit (STARTTLS), and
/// FTPS Implicit (TLS-first on port 990), backed by FluentFTP.AsyncFtpClient.
///
/// FTP does not support parallel operations on a single control connection.
/// ALL public methods serialise through <see cref="_sem"/> (SemaphoreSlim(1,1)).
/// </summary>
public sealed class FtpFileClient : IFileClient
{
    private AsyncFtpClient? _ftp;
    private readonly SemaphoreSlim _sem = new(1, 1);

    // ── Connect ──────────────────────────────────────────────────────────
    public async Task ConnectAsync(ConnectionProfile profile)
    {
        Disconnect(); // clean up any previous connection

        var encMode = profile.Protocol switch
        {
            FtpProtocol.FtpsExplicit => FtpEncryptionMode.Explicit,
            FtpProtocol.FtpsImplicit => FtpEncryptionMode.Implicit,
            _                        => FtpEncryptionMode.None
        };

        var config = new FtpConfig
        {
            EncryptionMode = encMode,

            // TODO Phase 3: surface the certificate details to the UI via AppBridge
            // instead of blanket-trusting.  This mirrors FileZilla's "accept unknown
            // certificate" prompt.
            ValidateAnyCertificate = (profile.Protocol is
                FtpProtocol.FtpsExplicit or FtpProtocol.FtpsImplicit),

            ConnectTimeout     = 15_000,
            ReadTimeout        = 30_000,
            DataConnectionType = FtpDataConnectionType.AutoPassive,
        };

        var client = new AsyncFtpClient(
            profile.Host,
            profile.Username,
            profile.Password ?? string.Empty,
            profile.EffectivePort,
            config);

        // Serialise Connect() through the semaphore like every other operation.
        // FTP doesn't support parallel commands — a concurrent Reconnect during
        // an active operation would corrupt the control-channel state.
        await _sem.WaitAsync();
        try
        {
            _ftp = client;
            await client.Connect();
        }
        catch
        {
            _ftp = null;
            client.Dispose();
            throw;
        }
        finally { _sem.Release(); }
    }

    // ── ListDirectory ────────────────────────────────────────────────────
    public async Task<List<RemoteItem>> ListDirectoryAsync(string path)
    {
        var ftp = RequireConnected();
        await _sem.WaitAsync();
        try
        {
            var items = await ftp.GetListing(path);
            return items.Select(i => new RemoteItem
            {
                Name        = i.Name,
                FullPath    = i.FullName,
                Size        = i.Size,
                Modified    = i.Modified,
                IsDirectory = i.Type == FtpObjectType.Directory,
                Permissions = i.Chmod > 0 ? Convert.ToString(i.Chmod, 8) : string.Empty
            }).ToList();
        }
        finally { _sem.Release(); }
    }

    // ── Upload ───────────────────────────────────────────────────────────
    public async Task UploadAsync(string localPath, string remotePath,
                                  IProgress<TransferProgress>? progress)
    {
        var ftp = RequireConnected();

        // Pre-fetch local size so we can populate TotalBytes in every tick.
        var totalBytes = new FileInfo(localPath).Length;

        IProgress<FtpProgress>? ftpProgress = progress is null ? null
            : new Progress<FtpProgress>(p =>
                progress.Report(new TransferProgress
                {
                    BytesTransferred    = p.TransferredBytes,
                    TotalBytes          = totalBytes,
                    SpeedBytesPerSecond = p.TransferSpeed
                }));

        await _sem.WaitAsync();
        try
        {
            await ftp.UploadFile(
                localPath, remotePath,
                FtpRemoteExists.Overwrite,
                createRemoteDir: false,
                FtpVerify.None,
                ftpProgress);
        }
        finally { _sem.Release(); }
    }

    // ── Download ─────────────────────────────────────────────────────────
    public async Task DownloadAsync(string remotePath, string localPath,
                                    IProgress<TransferProgress>? progress)
    {
        var ftp = RequireConnected();

        // Single semaphore acquisition covers both the GetObjectInfo probe and the
        // actual download.  Releasing between the two would allow another operation
        // to alter server state (delete/replace the file) between our size query
        // and the transfer start.
        await _sem.WaitAsync();
        try
        {
            var info       = await ftp.GetObjectInfo(remotePath, dateModified: false);
            var totalBytes = info?.Size ?? -1L;

            IProgress<FtpProgress>? ftpProgress = progress is null ? null
                : new Progress<FtpProgress>(p =>
                    progress.Report(new TransferProgress
                    {
                        BytesTransferred    = p.TransferredBytes,
                        TotalBytes          = totalBytes,
                        SpeedBytesPerSecond = p.TransferSpeed
                    }));

            await ftp.DownloadFile(
                localPath, remotePath,
                FtpLocalExists.Overwrite,
                FtpVerify.None,
                ftpProgress);
        }
        finally { _sem.Release(); }
    }

    // ── Mkdir / Rename / Delete ──────────────────────────────────────────
    public async Task MkdirAsync(string path)
    {
        var ftp = RequireConnected();
        await _sem.WaitAsync();
        try   { await ftp.CreateDirectory(path, force: true); }
        finally { _sem.Release(); }
    }

    public async Task RenameAsync(string oldPath, string newPath)
    {
        var ftp = RequireConnected();
        await _sem.WaitAsync();
        try   { await ftp.Rename(oldPath, newPath); }
        finally { _sem.Release(); }
    }

    public async Task DeleteAsync(string path)
    {
        var ftp = RequireConnected();
        await _sem.WaitAsync();
        try
        {
            // Determine type first; if GetObjectInfo returns null we attempt
            // file deletion and let FluentFTP surface the error.
            var info = await ftp.GetObjectInfo(path, dateModified: false);
            if (info?.Type == FtpObjectType.Directory)
                await ftp.DeleteDirectory(path);
            else
                await ftp.DeleteFile(path);
        }
        finally { _sem.Release(); }
    }

    // ── Disconnect / Dispose ─────────────────────────────────────────────
    public void Disconnect()
    {
        var ftp = _ftp;
        _ftp = null;
        if (ftp is null) return;
        try { ftp.Disconnect(); } catch { /* best-effort */ }
        ftp.Dispose();
    }

    public void Dispose() => Disconnect();

    // ── Helpers ──────────────────────────────────────────────────────────
    private AsyncFtpClient RequireConnected()
    {
        if (_ftp is not { IsConnected: true })
            throw new InvalidOperationException("FTP client is not connected.");
        return _ftp;
    }
}
