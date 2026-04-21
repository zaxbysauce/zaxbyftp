namespace FtpClient.Models;

/// <summary>
/// Wire-protocol variant selected by the user.
/// Matches the string literals sent by AppBridge.Connect().
/// </summary>
public enum FtpProtocol
{
    Ftp,            // plain FTP, no TLS
    FtpsExplicit,   // FTPS STARTTLS (port 21)
    FtpsImplicit,   // FTPS implicit TLS (port 990)
    Sftp            // SSH File Transfer Protocol (port 22)
}

/// <summary>
/// All parameters required to open a connection.
/// Constructed by AppBridge from the JS Connect() call.
/// </summary>
public sealed class ConnectionProfile
{
    public string Host { get; init; } = string.Empty;
    public int    Port { get; init; }

    public string   Username             { get; init; } = string.Empty;
    public string?  Password             { get; init; }

    // SFTP private-key auth (mutually exclusive with Password for SFTP)
    public string?  PrivateKeyPath       { get; init; }
    public string?  PrivateKeyPassphrase { get; init; }

    public FtpProtocol Protocol { get; init; }

    /// <summary>Returns the default port for this protocol if none was supplied.</summary>
    public int EffectivePort => Port > 0 ? Port : Protocol switch
    {
        FtpProtocol.FtpsImplicit => 990,
        FtpProtocol.Sftp         => 22,
        _                        => 21   // Ftp and FtpsExplicit
    };
}
