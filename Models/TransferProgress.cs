namespace FtpClient.Models;

/// <summary>
/// Snapshot of an in-flight transfer, posted to the React layer via
/// CoreWebView2.PostWebMessageAsJson each time the underlying library
/// calls its progress callback.
/// </summary>
public sealed class TransferProgress
{
    /// <summary>Opaque ID assigned by AppBridge.Upload/Download — echoed back here.</summary>
    public string TransferId            { get; init; } = string.Empty;

    public long   BytesTransferred      { get; init; }
    /// <summary>Total file size in bytes. -1 when unknown (e.g. FTP with no SIZE command).</summary>
    public long   TotalBytes            { get; init; } = -1;
    public double SpeedBytesPerSecond   { get; init; }

    /// <summary>0–100, or -1 for indeterminate.</summary>
    public double PercentComplete =>
        TotalBytes > 0
            ? Math.Clamp(BytesTransferred * 100.0 / TotalBytes, 0, 100)
            : -1;
}
