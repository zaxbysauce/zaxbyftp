namespace FtpClient.Models;

/// <summary>
/// A single entry returned by IFileClient.ListDirectoryAsync().
/// Serialised to JSON by AppBridge and handed to the React pane.
/// </summary>
public sealed class RemoteItem
{
    public string   Name        { get; init; } = string.Empty;
    public string   FullPath    { get; init; } = string.Empty;
    public long     Size        { get; init; }          // bytes; -1 if unknown
    public DateTime Modified    { get; init; }
    public bool     IsDirectory { get; init; }
    public string   Permissions { get; init; } = string.Empty; // e.g. "rwxr-xr-x"

    /// <summary>"dir" | "file" | "link" — convenience discriminator for the React layer.</summary>
    public string Type => IsDirectory ? "dir" : "file";
}
