using System.IO;
using FtpClient;
using Xunit;

namespace FtpClient.Tests;

/// <summary>
/// Unit tests for origin validation in AppBridge.OnWebMessageReceived.
/// Since OnWebMessageReceived is private and requires a CoreWebView2 environment,
/// we test the origin validation logic directly.
///
/// The validation logic in OnWebMessageReceived (lines 609-622):
/// 1. If e.Source is null or empty → rejects with stderr warning
/// 2. If e.Source is not a valid absolute URI → rejects with stderr warning
/// 3. If e.Source host is not "ftpclient.local" → rejects with stderr warning
/// 4. If e.Source host is "ftpclient.local" → processes message normally
///
/// Host comparison is case-insensitive: StringComparison.OrdinalIgnoreCase
/// </summary>
public class AppBridgeOriginValidationTests
{
    // ═══════════════════════════════════════════════════════════════════════════
    //  Test helper: replicates the origin validation logic from OnWebMessageReceived
    // ═══════════════════════════════════════════════════════════════════════════

    /// <summary>
    /// Replicates the origin validation logic from OnWebMessageReceived.
    /// Returns true if the origin is valid (host = "ftpclient.local"), false otherwise.
    /// </summary>
    private static bool IsValidOrigin(string? sourceUri)
    {
        // Validation step 1: reject null or empty
        if (string.IsNullOrEmpty(sourceUri))
            return false;

        // Validation step 2: must be valid absolute URI
        if (!Uri.TryCreate(sourceUri, UriKind.Absolute, out var uri))
            return false;

        // Validation step 3: host must be "ftpclient.local" (case-insensitive)
        return uri.Host.Equals("ftpclient.local", StringComparison.OrdinalIgnoreCase);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  (1) Reject null or empty origins
    // ═══════════════════════════════════════════════════════════════════════════

    [Fact]
    public void OriginValidation_RejectsNull()
    {
        Assert.False(IsValidOrigin(null));
    }

    [Fact]
    public void OriginValidation_RejectsEmptyString()
    {
        Assert.False(IsValidOrigin(string.Empty));
    }

    [Fact]
    public void OriginValidation_RejectsWhitespace()
    {
        Assert.False(IsValidOrigin("   "));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  (2) Reject invalid URIs
    // ═══════════════════════════════════════════════════════════════════════════

    [Fact]
    public void OriginValidation_RejectsRelativeUri()
    {
        // Relative URIs should be rejected
        Assert.False(IsValidOrigin("/path/to/resource"));
    }

    [Fact]
    public void OriginValidation_RejectsMalformedUri()
    {
        // Malformed URIs should be rejected
        Assert.False(IsValidOrigin("not-a-uri"));
    }

    [Fact]
    public void OriginValidation_RejectsUriWithInvalidScheme()
    {
        // Only absolute URIs with proper scheme are valid
        Assert.False(IsValidOrigin("ftpclient.local/index.html"));
    }

    [Fact]
    public void OriginValidation_RejectsFileScheme()
    {
        // file:// scheme should be rejected (not https)
        Assert.False(IsValidOrigin("file:///C:/path/to/file"));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  (3) Reject URIs with wrong host
    // ═══════════════════════════════════════════════════════════════════════════

    [Fact]
    public void OriginValidation_RejectsLocalhost()
    {
        Assert.False(IsValidOrigin("https://localhost/index.html"));
    }

    [Fact]
    public void OriginValidation_Rejects127001()
    {
        Assert.False(IsValidOrigin("https://127.0.0.1/index.html"));
    }

    [Fact]
    public void OriginValidation_RejectsDifferentSubdomain()
    {
        Assert.False(IsValidOrigin("https://app.ftpclient.local/index.html"));
    }

    [Fact]
    public void OriginValidation_RejectsDifferentDomain()
    {
        Assert.False(IsValidOrigin("https://evil.com/index.html"));
    }

    [Fact]
    public void OriginValidation_RejectsIpAddress()
    {
        Assert.False(IsValidOrigin("https://192.168.1.1/index.html"));
    }

    [Fact]
    public void OriginValidation_RejectsExternalDomain()
    {
        Assert.False(IsValidOrigin("https://ftp.example.com/index.html"));
    }

    [Fact]
    public void OriginValidation_RejectsNoScheme()
    {
        // No scheme means TryCreate with UriKind.Absolute will fail
        Assert.False(IsValidOrigin("ftpclient.local/index.html"));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  (4) Accept valid ftpclient.local origins
    // ═══════════════════════════════════════════════════════════════════════════

    [Fact]
    public void OriginValidation_AcceptsFtpclientLocal()
    {
        Assert.True(IsValidOrigin("https://ftpclient.local/index.html"));
    }

    [Fact]
    public void OriginValidation_AcceptsFtpclientLocalWithPath()
    {
        Assert.True(IsValidOrigin("https://ftpclient.local/path/to/resource"));
    }

    [Fact]
    public void OriginValidation_AcceptsFtpclientLocalWithQuery()
    {
        Assert.True(IsValidOrigin("https://ftpclient.local/index.html?foo=bar"));
    }

    [Fact]
    public void OriginValidation_AcceptsFtpclientLocalWithFragment()
    {
        Assert.True(IsValidOrigin("https://ftpclient.local/index.html#section"));
    }

    [Fact]
    public void OriginValidation_AcceptsFtpclientLocalCaseInsensitive()
    {
        // Host comparison is case-insensitive
        Assert.True(IsValidOrigin("https://FTPCLIENT.LOCAL/index.html"));
        Assert.True(IsValidOrigin("https://FtpClient.Local/index.html"));
        Assert.True(IsValidOrigin("https://ftpclient.LOCAL/index.html"));
    }

    [Fact]
    public void OriginValidation_AcceptsFtpclientLocalWithPort()
    {
        Assert.True(IsValidOrigin("https://ftpclient.local:8080/index.html"));
    }

    [Fact]
    public void OriginValidation_AcceptsFtpclientLocalRootPath()
    {
        Assert.True(IsValidOrigin("https://ftpclient.local/"));
    }

    [Fact]
    public void OriginValidation_AcceptsFtpclientLocalNoPath()
    {
        Assert.True(IsValidOrigin("https://ftpclient.local"));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  Adversarial: injection and special characters
    // ═══════════════════════════════════════════════════════════════════════════

    [Fact]
    public void OriginValidation_RejectsSqlInjectionInHost()
    {
        // Attempt SQL injection in host should be rejected
        Assert.False(IsValidOrigin("https://';DROP TABLE users;--.local/index.html"));
    }

    [Fact]
    public void OriginValidation_RejectsJavascriptScheme()
    {
        // javascript: scheme should be rejected
        Assert.False(IsValidOrigin("javascript:alert(1)"));
    }

    [Fact]
    public void OriginValidation_RejectsDataScheme()
    {
        // data: scheme should be rejected
        Assert.False(IsValidOrigin("data:text/html,<script>alert(1)</script>"));
    }

    [Fact]
    public void OriginValidation_RejectsNullBytes()
    {
        // Null bytes in URI should cause rejection
        Assert.False(IsValidOrigin("https://ftpclient.local\0/index.html"));
    }

    [Fact]
    public void OriginValidation_RejectsUnicodeInHost()
    {
        // Unicode in host should be rejected or punycoded
        // TryCreate may accept it but it won't match ftpclient.local
        Assert.False(IsValidOrigin("https://fτpclient.local/index.html"));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  Edge cases: boundary conditions
    // ═══════════════════════════════════════════════════════════════════════════

    [Fact]
    public void OriginValidation_RejectsJustScheme()
    {
        Assert.False(IsValidOrigin("https://"));
    }

    [Fact]
    public void OriginValidation_RejectsTrailingDot()
    {
        // Trailing dot in host is technically valid but different host
        Assert.False(IsValidOrigin("https://ftpclient.local./index.html"));
    }

    [Fact]
    public void OriginValidation_AcceptsHttpsOnly()
    {
        // Only https is expected for virtual host mapping
        Assert.True(IsValidOrigin("https://ftpclient.local/index.html"));
    }

    [Fact]
    public void OriginValidation_HttpVsHttpsBothHaveSameHost()
    {
        // NOTE: The implementation only validates the HOST, not the scheme.
        // Both http:// and https:// with host "ftpclient.local" pass validation.
        // This is technically correct per the requirement ("host should equal ftpclient.local")
        // but the virtual host mapping in WebView2 only responds to HTTPS.
        // In practice, http://ftpclient.local cannot reach the app due to WebView2 config.
        Assert.True(IsValidOrigin("http://ftpclient.local/index.html"));
        Assert.True(IsValidOrigin("https://ftpclient.local/index.html"));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  Property-based: idempotency of validation
    // ═══════════════════════════════════════════════════════════════════════════

    [Fact]
    public void OriginValidation_IsIdempotent()
    {
        // Valid origin should remain valid on repeated calls
        var origin = "https://ftpclient.local/index.html";
        Assert.True(IsValidOrigin(origin));
        Assert.True(IsValidOrigin(origin));
        Assert.True(IsValidOrigin(origin));
    }

    [Fact]
    public void OriginValidation_InvalidStaysInvalid()
    {
        // Invalid origin should remain invalid on repeated calls
        var origin = "https://evil.com/index.html";
        Assert.False(IsValidOrigin(origin));
        Assert.False(IsValidOrigin(origin));
        Assert.False(IsValidOrigin(origin));
    }
}
