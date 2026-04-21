using System.Reflection;
using System.Text.RegularExpressions;
using FtpClient;
using Xunit;

namespace FtpClient.Tests;

/// <summary>
/// Unit tests for SanitizeErrorMessage helper in AppBridge.
/// Tests IPv4 address and Windows absolute path redaction.
/// </summary>
public class AppBridgeSanitizeErrorMessageTests
{
    private static readonly MethodInfo SanitizeMethod =
        typeof(AppBridge).GetMethod(
            "SanitizeErrorMessage",
            BindingFlags.NonPublic | BindingFlags.Static)
        ?? throw new InvalidOperationException("SanitizeErrorMessage method not found");

    private static string Sanitize(string message)
    {
        return (string)SanitizeMethod.Invoke(null, new object[] { message })!;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  HAPPY PATH: IPv4 Address Redaction
    // ═══════════════════════════════════════════════════════════════════════════

    [Theory]
    [InlineData("192.168.1.1",        "[redacted]")]
    [InlineData("10.0.0.100",         "[redacted]")]
    [InlineData("255.255.255.0",      "[redacted]")]
    [InlineData("0.0.0.0",            "[redacted]")]
    [InlineData("127.0.0.1",          "[redacted]")]
    public void IPv4_RedactsValidAddresses(string ip, string expected)
    {
        var result = Sanitize($"Connection to {ip} failed");
        Assert.Contains(expected, result);
        Assert.DoesNotContain(ip, result);
    }

    [Fact]
    public void IPv4_RedactsMultipleAddresses()
    {
        var input = "Failed to connect to 192.168.1.1 and 10.0.0.100";
        var result = Sanitize(input);
        Assert.Equal("Failed to connect to [redacted] and [redacted]", result);
    }

    [Fact]
    public void IPv4_RedactsInRealisticFtpError()
    {
        var input = "FTP connection failed: unable to reach server at 192.168.1.50:21";
        var result = Sanitize(input);
        Assert.Equal("FTP connection failed: unable to reach server at [redacted]:21", result);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  HAPPY PATH: Windows Path Redaction
    // ═══════════════════════════════════════════════════════════════════════════

    [Theory]
    [InlineData("C:\\Users\\foo")]
    [InlineData("D:\\path")]
    [InlineData("E:\\very\\long\\path\\to\\file.txt")]
    [InlineData("c:\\lowercase\\drive")]
    public void WindowsPath_RedactsAbsolutePaths(string path)
    {
        var result = Sanitize($"Error accessing {path}");
        Assert.Contains("[path redacted]", result);
        Assert.DoesNotContain(path, result);
    }

    [Fact]
    public void WindowsPath_RedactsMultiplePaths()
    {
        var input = "Cannot access C:\\Users\\test and D:\\Data\\file.txt";
        var result = Sanitize(input);
        Assert.Equal("Cannot access [path redacted] and [path redacted]", result);
    }

    [Fact]
    public void WindowsPath_RedactsInRealisticFtpError()
    {
        var input = "File not found on remote server. Local path: C:\\Users\\john\\Documents";
        var result = Sanitize(input);
        Assert.Equal("File not found on remote server. Local path: [path redacted]", result);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  HAPPY PATH: Combined Redaction
    // ═══════════════════════════════════════════════════════════════════════════

    [Fact]
    public void Combined_RedactsBothIPsAndPaths()
    {
        var input = "Failed: connected to 192.168.1.1 but cannot access C:\\Users\\admin";
        var result = Sanitize(input);
        Assert.Contains("[redacted]", result);
        Assert.Contains("[path redacted]", result);
        Assert.DoesNotContain("192.168.1.1", result);
        Assert.DoesNotContain("C:\\Users\\admin", result);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  EDGE CASES: Empty and No-Match Inputs
    // ═══════════════════════════════════════════════════════════════════════════

    [Fact]
    public void EdgeCase_EmptyString_ReturnsEmpty()
    {
        var result = Sanitize("");
        Assert.Equal("", result);
    }

    [Fact]
    public void EdgeCase_NullLikeEmptyString()
    {
        var result = Sanitize("   ");
        Assert.Equal("   ", result); // whitespace preserved
    }

    [Fact]
    public void EdgeCase_NoIPOrPath_ReturnsUnchanged()
    {
        var input = "Connection refused. Please check your username and password.";
        var result = Sanitize(input);
        Assert.Equal(input, result);
    }

    [Fact]
    public void EdgeCase_OrdinaryNumbers_NotRedacted()
    {
        // Numbers that don't match IPv4 pattern should be preserved
        var input = "Error code: 404 and count: 12345";
        var result = Sanitize(input);
        Assert.Equal(input, result);
        Assert.DoesNotContain("[redacted]", result);
    }

    [Fact]
    public void EdgeCase_PortNumber_NotRedacted()
    {
        // Port after IP redaction should remain
        var input = "Connected to 192.168.1.1 on port 21";
        var result = Sanitize(input);
        Assert.Equal("Connected to [redacted] on port 21", result);
        Assert.Contains("port 21", result);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  EDGE CASES: IPv4 Boundary Values
    // ═══════════════════════════════════════════════════════════════════════════

    [Theory]
    [InlineData("0.0.0.0")]
    [InlineData("255.255.255.255")]
    [InlineData("128.128.128.128")]
    public void IPv4_BoundaryValues_AllRedacted(string ip)
    {
        var result = Sanitize(ip);
        Assert.Equal("[redacted]", result);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  EDGE CASES: Path with Special Characters
    // ═══════════════════════════════════════════════════════════════════════════

    [Fact]
    public void WindowsPath_PathWithSpaces_Redacted()
    {
        // Note: The regex pattern [^\\s\"']* stops at spaces
        // So "C:\\Program Files\\App" would only redact "C:\\Program"
        // This is actual behavior based on the regex used
        var input = "Error at C:\\Users\\John Doe\\File.txt";
        var result = Sanitize(input);
        // The regex stops at space, so only C:\\Users\\John is redacted
        Assert.Contains("[path redacted]", result);
    }

    [Fact]
    public void WindowsPath_PathWithQuotes_Handled()
    {
        var input = "Error at C:\\path\\\"quoted\"\\file";
        var result = Sanitize(input);
        Assert.Contains("[path redacted]", result);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  PRESERVATION: User-Actionable Text
    // ═══════════════════════════════════════════════════════════════════════════

    [Fact]
    public void Preservation_ErrorMessages_KeepsUserGuidance()
    {
        var input = "Connection refused. Please verify your credentials and try again.";
        var result = Sanitize(input);
        Assert.Equal(input, result);
        Assert.Contains("please verify your credentials", result.ToLower());
    }

    [Fact]
    public void Preservation_FtpResponseCodes_Preserved()
    {
        var input = "FTP error 530: User cannot log in. Please check username.";
        var result = Sanitize(input);
        Assert.Equal(input, result);
        Assert.Contains("530", result);
    }

    [Fact]
    public void Preservation_MixedContent_PreservesNonSensitiveParts()
    {
        var input = "Error: failed to connect to 192.168.1.1. Please check your network settings. Log file: C:\\Logs\\error.log";
        var result = Sanitize(input);
        Assert.Contains("Please check your network settings", result);
        Assert.Contains("Log file:", result);
        Assert.DoesNotContain("192.168.1.1", result);
        Assert.DoesNotContain("C:\\Logs\\error.log", result);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  REALISTIC FTP ERROR SCENARIOS
    // ═══════════════════════════════════════════════════════════════════════════

    [Fact]
    public void RealisticFtp_CannotConnectToServer()
    {
        var input = "Unable to establish connection to FTP server at 10.0.0.50:21 - connection timed out";
        var result = Sanitize(input);
        Assert.Equal("Unable to establish connection to FTP server at [redacted]:21 - connection timed out", result);
    }

    [Fact]
    public void RealisticFtp_PermissionDenied()
    {
        var input = "Permission denied accessing C:\\FTP\\uploads\\file.zip on server 192.168.1.100";
        var result = Sanitize(input);
        Assert.Contains("[redacted]", result);
        Assert.Contains("[path redacted]", result);
        Assert.Contains("Permission denied accessing", result);
    }

    [Fact]
    public void RealisticFtp_FileNotFound()
    {
        var input = "550 File not found: /remote/path/file.txt. Local reference: D:\\downloads";
        var result = Sanitize(input);
        Assert.Contains("[path redacted]", result);
        Assert.Contains("550 File not found", result);
    }

    [Fact]
    public void RealisticSftp_HostKeyVerification()
    {
        var input = "SSH host key verification failed for 10.0.0.25. Expected fingerprint SHA256:abc123";
        var result = Sanitize(input);
        Assert.Equal("SSH host key verification failed for [redacted]. Expected fingerprint SHA256:abc123", result);
    }
}
