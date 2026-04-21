using System.Reflection;
using System.Runtime.Serialization;
using FtpClient;
using Xunit;

namespace FtpClient.Tests;

/// <summary>
/// Behavioral tests for origin validation in AppBridge.OnWebMessageReceived.
/// Invokes the private static ValidateOrigin method via reflection.
/// </summary>
public class AppBridgeOriginValidationTests
{
    private static readonly MethodInfo ValidateOriginMethod =
        typeof(AppBridge).GetMethod("ValidateOrigin", BindingFlags.NonPublic | BindingFlags.Static)
        ?? throw new InvalidOperationException("ValidateOrigin method not found");

    /// <summary>
    /// Invokes ValidateOrigin(sourceUri) and returns true if the origin is valid.
    /// </summary>
    private static bool IsValidOrigin(string? sourceUri)
    {
        var result = (string?)ValidateOriginMethod.Invoke(null, new object?[] { sourceUri });
        return result is null;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  Valid origins
    // ═══════════════════════════════════════════════════════════════════════════

    [Fact]
    public void Accepts_Https_FtpClientLocal()
    {
        Assert.True(IsValidOrigin("https://ftpclient.local/index.html"));
    }

    [Fact]
    public void Accepts_Http_FtpClientLocal()
    {
        Assert.True(IsValidOrigin("http://ftpclient.local/"));
    }

    [Fact]
    public void Accepts_FtpClientLocal_WithPort()
    {
        Assert.True(IsValidOrigin("https://ftpclient.local:443/path"));
    }

    [Fact]
    public void Accepts_FtpClientLocal_CaseInsensitive()
    {
        Assert.True(IsValidOrigin("https://FTPCLIENT.LOCAL/index.html"));
    }

    [Fact]
    public void Accepts_FtpClientLocal_WithQuery()
    {
        Assert.True(IsValidOrigin("https://ftpclient.local/page?q=1"));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  Invalid origins — null and empty
    // ═══════════════════════════════════════════════════════════════════════════

    [Fact]
    public void Rejects_Null()
    {
        Assert.False(IsValidOrigin(null));
    }

    [Fact]
    public void Rejects_Empty()
    {
        Assert.False(IsValidOrigin(""));
    }

    [Fact]
    public void Rejects_Whitespace()
    {
        Assert.False(IsValidOrigin("   "));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  Invalid origins — wrong host
    // ═══════════════════════════════════════════════════════════════════════════

    [Theory]
    [InlineData("https://evil.com")]
    [InlineData("https://ftpclient.local.evil.com")]
    [InlineData("https://notftpclient.local/")]
    [InlineData("https://localhost")]
    [InlineData("https://127.0.0.1")]
    [InlineData("https://192.168.1.1")]
    public void Rejects_WrongHost(string source)
    {
        Assert.False(IsValidOrigin(source));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  Invalid origins — malformed URI
    // ═══════════════════════════════════════════════════════════════════════════

    [Theory]
    [InlineData("not a url")]
    [InlineData("://missing-scheme")]
    [InlineData("ftpclient.local")]  // no scheme
    public void Rejects_MalformedUri(string source)
    {
        Assert.False(IsValidOrigin(source));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  Edge cases
    // ═══════════════════════════════════════════════════════════════════════════

    [Fact]
    public void Accepts_UserInfoWithValidHost()
    {
        // Uri.Host correctly returns ftpclient.local (the host after @)
        Assert.True(IsValidOrigin("https://evil.com@ftpclient.local/"));
    }

    [Fact]
    public void Rejects_Subdomain()
    {
        Assert.False(IsValidOrigin("https://sub.ftpclient.local/"));
    }

    [Fact]
    public void Rejects_FileScheme()
    {
        Assert.False(IsValidOrigin("file:///C:/path/index.html"));
    }
}
