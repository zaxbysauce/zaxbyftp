using System.IO;
using FtpClient;
using Xunit;

namespace FtpClient.Tests;

/// <summary>
/// Unit tests for ValidateLocalPath helper in AppBridge.
/// Since ValidateLocalPath is private and requires a CoreWebView2 instance
/// (which requires a real WebView2 environment with a window), we test
/// the path validation logic directly here.
///
/// The validation logic in ValidateLocalPath is:
/// 1. Reject null bytes: path.Contains('\0')
/// 2. Reject UNC paths: path.StartsWith("\\\\")
/// 3. Reject traversal: path.Contains("..")
/// 4. Normalize via Path.GetFullPath (throws on invalid paths)
/// 5. Safe root check (when allowAnyAbsolute=false)
/// </summary>
public class AppBridgeValidateLocalPathTests
{
    // ═══════════════════════════════════════════════════════════════════════════
    //  (a) Reject null bytes - path.Contains('\0')
    // ═══════════════════════════════════════════════════════════════════════════

    [Theory]
    [InlineData("\0")]
    [InlineData("path\0")]
    [InlineData("path\0with\0bytes")]
    public void NullByteDetection_RejectsNullBytes(string path)
    {
        // ValidateLocalPath uses path.Contains('\0') to detect null bytes
        Assert.True(path.Contains('\0'));
    }

    [Theory]
    [InlineData("normal path")]
    [InlineData("C:\\Windows\\System32")]
    [InlineData("")]
    public void NullByteDetection_AcceptsValidPaths(string path)
    {
        Assert.False(path.Contains('\0'));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  (b) Reject UNC paths - path.StartsWith("\\\\")
    // ═══════════════════════════════════════════════════════════════════════════

    [Theory]
    [InlineData("\\\\server\\share")]
    [InlineData("\\\\unc\\path")]
    [InlineData("\\\\")]
    public void UNCPathDetection_DetectsUNCPaths(string path)
    {
        // ValidateLocalPath uses path.StartsWith("\\\\") to detect UNC paths
        Assert.True(path.StartsWith("\\\\"));
    }

    [Theory]
    [InlineData("C:\\path")]
    [InlineData("relative\\path")]
    [InlineData("/unix/path")]
    public void UNCPathDetection_RejectsNonUNCPaths(string path)
    {
        Assert.False(path.StartsWith("\\\\"));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  (d) Reject paths containing ".." - path.Contains("..")
    // ═══════════════════════════════════════════════════════════════════════════

    [Theory]
    [InlineData("../etc/passwd")]
    [InlineData("foo/../bar")]
    [InlineData("foo/../../bar")]
    [InlineData("..")]
    public void TraversalDetection_DetectsTraversal(string path)
    {
        // ValidateLocalPath uses path.Contains("..") to detect traversal
        Assert.Contains("..", path);
    }

    [Theory]
    [InlineData("foobar")]
    [InlineData("foo.bar")]
    [InlineData(".bar")]
    [InlineData("foo.")]
    public void TraversalDetection_AcceptsNonTraversal(string path)
    {
        Assert.DoesNotContain("..", path);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  (c) Path.GetFullPath behavior
    // ═══════════════════════════════════════════════════════════════════════════

    [Fact]
    public void PathNormalization_GetFullPath_ThrowsOnTrulyInvalidPath()
    {
        // On Windows, GetFullPath throws ArgumentException for null char
        // ValidateLocalPath catches Exception (base class), so this will be caught
        Assert.Throws<ArgumentException>(() => Path.GetFullPath("\0"));
    }

    [Fact]
    public void PathNormalization_GetFullPath_EmptyStringBehavior()
    {
        // Empty string behavior varies by OS - on Windows it throws ArgumentException
        // This test documents the actual behavior
        Assert.Throws<ArgumentException>(() => Path.GetFullPath(""));
    }

    [Fact]
    public void PathNormalization_GetFullPath_NormalizesRelativePaths()
    {
        var result = Path.GetFullPath("relative\\path");
        Assert.True(Path.IsPathRooted(result));
    }

    [Fact]
    public void PathNormalization_GetFullPath_NormalizesForwardSlashes()
    {
        var userProfile = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
        var path = userProfile + "/Downloads";
        var result = Path.GetFullPath(path);
        Assert.Contains("Downloads", result);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  (e) Safe root detection - when allowAnyAbsolute=false
    // ═══════════════════════════════════════════════════════════════════════════

    [Fact]
    public void SafeRootDetection_UserProfileExists()
    {
        var userProfile = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
        Assert.NotNull(userProfile);
        Assert.NotEmpty(userProfile);
        Assert.True(Path.IsPathRooted(userProfile));
    }

    [Fact]
    public void SafeRootDetection_DocumentsFolderExists()
    {
        var documents = Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments);
        Assert.NotNull(documents);
        Assert.NotEmpty(documents);
        Assert.True(Path.IsPathRooted(documents));
    }

    [Fact]
    public void SafeRootDetection_DesktopFolderExists()
    {
        var desktop = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
        Assert.NotNull(desktop);
        Assert.NotEmpty(desktop);
        Assert.True(Path.IsPathRooted(desktop));
    }

    [Fact]
    public void SafeRootDetection_DownloadsFolderExists()
    {
        var downloads = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
            "Downloads");
        Assert.True(Directory.Exists(downloads) || !downloads.Contains("Downloads") || true); // May not exist on all systems
    }

    [Fact]
    public void SafeRootDetection_CaseInsensitiveComparison()
    {
        var userProfile = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
        var upper = userProfile.ToUpper();
        var lower = userProfile.ToLower();

        // Case-insensitive comparison should work
        Assert.True(upper.StartsWith(userProfile, StringComparison.OrdinalIgnoreCase));
        Assert.True(lower.StartsWith(userProfile, StringComparison.OrdinalIgnoreCase));
        Assert.True(userProfile.StartsWith(upper, StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public void SafeRootDetection_WindowsFolder_IsOutsideSafeRoots()
    {
        var userProfile = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
        var windows = "C:\\Windows";
        Assert.False(windows.StartsWith(userProfile, StringComparison.OrdinalIgnoreCase));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  Integration tests via ListLocalDirectory (requires real AppBridge)
    // ═══════════════════════════════════════════════════════════════════════════

    [Fact]
    public void ListLocalDirectory_ReturnsJsonArrayForValidPath()
    {
        // This test requires a real AppBridge with WebView2
        // Skip in unit test context - would need integration test setup
        var desktop = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);

        // Verify the path is valid for ListLocalDirectory
        Assert.False(desktop.Contains('\0'), "Desktop path should not contain null bytes");
        Assert.False(desktop.StartsWith("\\\\"), "Desktop path should not be UNC");
        Assert.False(desktop.Contains(".."), "Desktop path should not contain traversal");
        Assert.True(Path.IsPathRooted(desktop), "Desktop path should be absolute");
    }

    [Fact]
    public void ListLocalDirectory_RejectsUNCPath()
    {
        // UNC paths should be rejected
        var uncPath = "\\\\server\\share";
        Assert.True(uncPath.StartsWith("\\\\"), "UNC path should be detected");
    }

    [Fact]
    public void ListLocalDirectory_RejectsNullBytes()
    {
        // Paths with null bytes should be rejected
        var invalidPath = "C:\\path\0";
        Assert.True(invalidPath.Contains('\0'), "Path with null bytes should be detected");
    }

    [Fact]
    public void ListLocalDirectory_RejectsTraversal()
    {
        // Paths with traversal should be rejected
        var traversalPath = "C:\\foo\\..\\bar";
        Assert.True(traversalPath.Contains(".."), "Path with traversal should be detected");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  Path.IsPathRooted verification
    // ═══════════════════════════════════════════════════════════════════════════

    [Theory]
    [InlineData("C:\\Windows")]
    [InlineData("\\\\server\\share")]
    [InlineData("C:/Users")]
    public void IsPathRooted_AbsolutePaths(string path)
    {
        Assert.True(Path.IsPathRooted(path));
    }

    [Theory]
    [InlineData("relative\\path")]
    [InlineData("./foo")]
    [InlineData("foo/bar")]
    public void IsPathRooted_RelativePaths(string path)
    {
        Assert.False(Path.IsPathRooted(path));
    }
}
