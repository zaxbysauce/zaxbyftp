using FtpClient.Models;

namespace FtpClient.Adapters;

/// <summary>
/// Protocol-agnostic file-transfer abstraction.
/// One instance = one active session.
/// FtpFileClient and SftpFileClient implement this interface.
/// AppBridge maps session GUIDs to IFileClient instances.
/// </summary>
public interface IFileClient : IDisposable
{
    /// <summary>Opens the connection. Throws on failure.</summary>
    Task ConnectAsync(ConnectionProfile profile);

    /// <summary>Lists the contents of <paramref name="path"/>.</summary>
    Task<List<RemoteItem>> ListDirectoryAsync(string path);

    /// <summary>
    /// Uploads <paramref name="localPath"/> to <paramref name="remotePath"/>.
    /// <paramref name="progress"/> receives snapshots during transfer; may be null.
    /// </summary>
    Task UploadAsync(string localPath, string remotePath,
                     IProgress<TransferProgress>? progress);

    /// <summary>
    /// Downloads <paramref name="remotePath"/> to <paramref name="localPath"/>.
    /// <paramref name="progress"/> receives snapshots during transfer; may be null.
    /// </summary>
    Task DownloadAsync(string remotePath, string localPath,
                       IProgress<TransferProgress>? progress);

    Task MkdirAsync(string path);
    Task RenameAsync(string oldPath, string newPath);

    /// <summary>Deletes a file or directory at <paramref name="path"/>.</summary>
    Task DeleteAsync(string path);

    /// <summary>Closes the connection gracefully. Safe to call multiple times.</summary>
    void Disconnect();
}
