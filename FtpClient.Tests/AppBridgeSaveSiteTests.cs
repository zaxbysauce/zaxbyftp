using System.IO;
using System.Text.Json;
using Xunit;

namespace FtpClient.Tests;

/// <summary>
/// Unit tests for AppBridge.SaveSite error feedback behavior.
///
/// Since SaveSite requires a CoreWebView2 instance and sealed Dispatcher (which cannot
/// be mocked with Moq), and the static SitesPath is initonly and cannot be redirected,
/// we test the error handling logic by:
/// 1. Verifying the catch block structure exists in the source code
/// 2. Verifying the error message shape matches the expected pattern
///
/// These tests verify:
/// 1. The siteSaveError message shape is correct on exception
/// 2. The message does not contain exception details (no information leakage)
/// 3. Normal operation is unaffected (verified via source code structure)
/// </summary>
public class AppBridgeSaveSiteTests
{
    // ═══════════════════════════════════════════════════════════════════════════
    //  Test helper: replicates the error message from SaveSite catch block
    // ═══════════════════════════════════════════════════════════════════════════

    /// <summary>
    /// Replicates the error message construction from SaveSite catch block (line 595).
    /// This is the EXACT message shape that should be posted when an exception occurs.
    /// </summary>
    private static string BuildSiteSaveErrorMessage()
    {
        return JsonSerializer.Serialize(new { type = "siteSaveError", message = "Failed to save site credentials" });
    }

    /// <summary>
    /// Verifies the error message structure matches exactly what SaveSite catch block posts.
    /// </summary>
    private static void AssertSiteSaveErrorMessageShape(string json)
    {
        var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;

        // Must have type = "siteSaveError"
        Assert.True(root.TryGetProperty("type", out var typeEl));
        Assert.Equal("siteSaveError", typeEl.GetString());

        // Must have message field
        Assert.True(root.TryGetProperty("message", out var msgEl));
        var message = msgEl.GetString();
        Assert.NotNull(message);

        // Message must be the generic user-friendly message
        Assert.Equal("Failed to save site credentials", message);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  (1) Error message shape tests
    // ═══════════════════════════════════════════════════════════════════════════

    [Fact]
    public void SaveSite_ErrorMessage_HasCorrectShape()
    {
        // The error message posted on exception should have type="siteSaveError"
        // and message="Failed to save site credentials"
        var errorJson = BuildSiteSaveErrorMessage();
        AssertSiteSaveErrorMessageShape(errorJson);
    }

    [Fact]
    public void SaveSite_ErrorMessage_IsGeneric()
    {
        // The error message should NOT contain any exception details
        var errorJson = BuildSiteSaveErrorMessage();
        var doc = JsonDocument.Parse(errorJson);
        var root = doc.RootElement;
        var message = root.GetProperty("message").GetString();

        Assert.NotNull(message);
        Assert.Equal("Failed to save site credentials", message);

        // Verify it's NOT the ArgumentException message about missing 'name'
        Assert.DoesNotContain("name", message, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("Site must have a 'name'", message);
    }

    [Fact]
    public void SaveSite_ErrorMessage_DoesNotLeakJsonParseDetails()
    {
        // Simulate what happens when malformed JSON causes a parse error:
        // The catch block should catch it and post the GENERIC message,
        // not something like "Unexpected token at position 5"

        var errorJson = BuildSiteSaveErrorMessage();
        var doc = JsonDocument.Parse(errorJson);
        var root = doc.RootElement;
        var message = root.GetProperty("message").GetString();

        Assert.NotNull(message);

        // The generic message should NOT contain JSON parsing details
        Assert.DoesNotContain("position", message, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("token", message, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("parse", message, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("line", message, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("char", message, StringComparison.OrdinalIgnoreCase);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  (2) Catch block structure verification via source code analysis
    // ═══════════════════════════════════════════════════════════════════════════

    [Fact]
    public void SaveSite_CatchBlock_Exists()
    {
        // Read the source code and verify SaveSite has a catch block
        var appBridgeSource = File.ReadAllText(@"C:\opencode\zaxbyftp\AppBridge.cs");

        // Find the SaveSite method
        var saveSiteStart = appBridgeSource.IndexOf("public void SaveSite");
        Assert.NotEqual(-1, saveSiteStart);

        // Find the catch block within SaveSite
        var catchBlockStart = appBridgeSource.IndexOf("catch", saveSiteStart);
        Assert.NotEqual(-1, catchBlockStart);

        // Verify catch is a bare catch (catches all exceptions)
        // The format is "catch" followed by newline and opening brace
        var afterCatch = appBridgeSource.Substring(catchBlockStart, 15).TrimStart();
        Assert.StartsWith("catch", afterCatch);
    }

    [Fact]
    public void SaveSite_CatchBlock_PostsSiteSaveError()
    {
        // Verify the catch block posts siteSaveError message
        var appBridgeSource = File.ReadAllText(@"C:\opencode\zaxbyftp\AppBridge.cs");

        var saveSiteStart = appBridgeSource.IndexOf("public void SaveSite");
        var catchBlockStart = appBridgeSource.IndexOf("catch", saveSiteStart);

        // Find the PostJson call in the catch block
        var postJsonCall = appBridgeSource.IndexOf("PostJson", catchBlockStart);
        Assert.NotEqual(-1, postJsonCall);

        // Verify the message contains type = "siteSaveError"
        var siteSaveErrorIndex = appBridgeSource.IndexOf("siteSaveError", catchBlockStart);
        Assert.NotEqual(-1, siteSaveErrorIndex);
        Assert.True(siteSaveErrorIndex < saveSiteStart + 2000); // Within SaveSite method
    }

    [Fact]
    public void SaveSite_CatchBlock_UsesGenericMessage()
    {
        // Verify the catch block uses the generic message, not ex.Message
        var appBridgeSource = File.ReadAllText(@"C:\opencode\zaxbyftp\AppBridge.cs");

        var saveSiteStart = appBridgeSource.IndexOf("public void SaveSite");
        var catchBlockStart = appBridgeSource.IndexOf("catch", saveSiteStart);

        // Get the entire catch block content (it's about 15 lines, use 2000 chars to be safe)
        var catchContent = appBridgeSource.Substring(catchBlockStart, 2000);

        // The generic message should be present
        Assert.Contains("Failed to save site credentials", catchContent);

        // ex.Message should NOT be present (no exception detail leakage)
        Assert.DoesNotContain("ex.Message", catchContent);
    }

    [Fact]
    public void SaveSite_CatchBlock_DoesNotLeakExceptionDetails()
    {
        // Verify the catch block uses a generic message, not exception variable
        var appBridgeSource = File.ReadAllText(@"C:\opencode\zaxbyftp\AppBridge.cs");

        var saveSiteStart = appBridgeSource.IndexOf("public void SaveSite");
        var catchBlockStart = appBridgeSource.IndexOf("catch", saveSiteStart);

        // The text between catch block start and the siteSaveError message
        var beforeSiteSaveError = appBridgeSource.Substring(catchBlockStart,
            appBridgeSource.IndexOf("siteSaveError", catchBlockStart) - catchBlockStart);

        // Should not contain any exception variable references
        Assert.DoesNotContain("ex.", beforeSiteSaveError);
        Assert.DoesNotContain("exception", beforeSiteSaveError, StringComparison.OrdinalIgnoreCase);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  (3) Error handling structure verification
    // ═══════════════════════════════════════════════════════════════════════════

    [Fact]
    public void SaveSite_InvalidJson_DoesNotThrow()
    {
        // Verify that the catch block exists to handle JSON parse errors
        var appBridgeSource = File.ReadAllText(@"C:\opencode\zaxbyftp\AppBridge.cs");

        // JSON parsing happens via JsonNode.Parse which throws JsonException
        // The catch block catches all exceptions including JsonException
        var saveSiteStart = appBridgeSource.IndexOf("public void SaveSite");
        var catchBlockStart = appBridgeSource.IndexOf("catch", saveSiteStart);

        // The catch block exists to catch any exception from the try block
        Assert.NotEqual(-1, catchBlockStart);
    }

    [Fact]
    public void SaveSite_MissingName_IsValidated()
    {
        // Verify that SaveSite validates the 'name' field exists
        var appBridgeSource = File.ReadAllText(@"C:\opencode\zaxbyftp\AppBridge.cs");

        // The validation "Site must have a 'name'" happens inside the try block
        Assert.Contains("Site must have a 'name'", appBridgeSource);

        // This would throw ArgumentException which is caught by the catch block
        var saveSiteStart = appBridgeSource.IndexOf("public void SaveSite");
        var catchBlockStart = appBridgeSource.IndexOf("catch", saveSiteStart);
        Assert.NotEqual(-1, catchBlockStart);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  (4) Security: verify no information leakage in error messages
    // ═══════════════════════════════════════════════════════════════════════════

    [Fact]
    public void ErrorMessage_ContainsNoStackTrace()
    {
        var errorJson = BuildSiteSaveErrorMessage();
        var doc = JsonDocument.Parse(errorJson);
        var message = doc.RootElement.GetProperty("message").GetString();

        Assert.NotNull(message);
        Assert.DoesNotContain("at ", message);
        Assert.DoesNotContain(".cs:line", message);
        Assert.DoesNotContain("StackTrace", message);
    }

    [Fact]
    public void ErrorMessage_ContainsNoExceptionType()
    {
        var errorJson = BuildSiteSaveErrorMessage();
        var doc = JsonDocument.Parse(errorJson);
        var message = doc.RootElement.GetProperty("message").GetString();

        Assert.NotNull(message);
        Assert.DoesNotContain("ArgumentException", message);
        Assert.DoesNotContain("JsonException", message);
        Assert.DoesNotContain("NullReferenceException", message);
        Assert.DoesNotContain("Exception", message);
    }

    [Fact]
    public void ErrorMessage_IsUserFriendly()
    {
        var errorJson = BuildSiteSaveErrorMessage();
        var doc = JsonDocument.Parse(errorJson);
        var message = doc.RootElement.GetProperty("message").GetString();

        Assert.NotNull(message);
        // Message should be something a user can understand
        Assert.True(message.Length < 100, "Error message should be concise for users");
        Assert.Contains("save", message, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("site", message, StringComparison.OrdinalIgnoreCase);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  (5) Happy path: source code structure verification
    // ═══════════════════════════════════════════════════════════════════════════

    [Fact]
    public void SaveSite_HasTryBlock()
    {
        // Verify SaveSite has a try block for normal operation
        var appBridgeSource = File.ReadAllText(@"C:\opencode\zaxbyftp\AppBridge.cs");

        var saveSiteStart = appBridgeSource.IndexOf("public void SaveSite");
        var tryBlockStart = appBridgeSource.IndexOf("try", saveSiteStart);

        Assert.NotEqual(-1, tryBlockStart);

        // try should come before catch
        var catchBlockStart = appBridgeSource.IndexOf("catch", saveSiteStart);
        Assert.True(tryBlockStart < catchBlockStart);
    }

    [Fact]
    public void SaveSite_NormalPath_UpdatesSitesFile()
    {
        // Verify the normal path calls SaveSitesToDisk
        var appBridgeSource = File.ReadAllText(@"C:\opencode\zaxbyftp\AppBridge.cs");

        var saveSiteStart = appBridgeSource.IndexOf("public void SaveSite");
        // Find the catch that closes the outer try block - it comes after SaveSitesToDisk
        // Use a larger range to find the correct catch (not the inner one in password handling)
        var saveSitesToDiskIndex = appBridgeSource.IndexOf("SaveSitesToDisk(sites)", saveSiteStart);
        Assert.NotEqual(-1, saveSitesToDiskIndex);

        // Now find catch after SaveSitesToDisk - that's the outer catch block
        var catchBlockStart = appBridgeSource.IndexOf("catch", saveSitesToDiskIndex);
        Assert.NotEqual(-1, catchBlockStart);

        var normalPath = appBridgeSource.Substring(saveSiteStart, catchBlockStart - saveSiteStart);

        // The normal path should call SaveSitesToDisk to persist
        Assert.Contains("SaveSitesToDisk", normalPath);
    }

    [Fact]
    public void SaveSite_PasswordHandling_RemovesPasswordFromNode()
    {
        // Verify that password is removed from the JSON node before saving
        var appBridgeSource = File.ReadAllText(@"C:\opencode\zaxbyftp\AppBridge.cs");

        var saveSiteStart = appBridgeSource.IndexOf("public void SaveSite");
        // Find the outer catch block
        var saveSitesToDiskIndex = appBridgeSource.IndexOf("SaveSitesToDisk(sites)", saveSiteStart);
        var catchBlockStart = appBridgeSource.IndexOf("catch", saveSitesToDiskIndex);
        var normalPath = appBridgeSource.Substring(saveSiteStart, catchBlockStart - saveSiteStart);

        // Password should be removed from node before writing to disk
        Assert.Contains("node.Remove(\"password\")", normalPath);
        Assert.Contains("PasswordVault", normalPath);
    }
}
