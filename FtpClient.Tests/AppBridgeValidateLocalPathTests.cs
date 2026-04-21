using System.IO;
using System.Reflection;
using System.Runtime.Serialization;
using FtpClient;
using Xunit;

namespace FtpClient.Tests;

/// <summary>
/// Behavioral tests for ValidateLocalPath helper in AppBridge.
/// Invokes the private method via reflection on an uninitialized AppBridge instance.
/// </summary>
public class AppBridgeValidateLocalPathTests
{
    private static readonly AppBridge Instance =
        (AppBridge)FormatterServices.GetUninitializedObject(typeof(AppBridge));

    private static readonly MethodInfo ValidateMethod =
        typeof(AppBridge).GetMethod("ValidateLocalPath", BindingFlags.NonPublic | BindingFlags.Instance)
        ?? throw new InvalidOperationException("ValidateLocalPath method not found");

    /// <summary>
    /// Invokes ValidateLocalPath(path, allowAnyAbsolute) and returns the error string (null on success).
    /// </summary>
    private static string? Validate(string path, bool allowAnyAbsolute = false)
    {
        return (string?)ValidateMethod.Invoke(Instance, new object[] { path, allowAnyAbsolute });
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  Null and empty paths
    // ═══════════════════════════════════════════════════════════════════════════

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void Rejects_NullAndEmptyPaths(string? path)
    {
        var error = Validate(path!);
        Assert.NotNull(error);
        Assert.Contains("empty", error);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  Null bytes
    // ═══════════════════════════════════════════════════════════════════════════

    [Theory]
    [InlineData("path\0with\0bytes")]
    [InlineData("C:\\Users\0\\foo")]
    public void Rejects_NullBytes(string path)
    {
        var error = Validate(path);
        Assert.NotNull(error);
        Assert.Contains("null bytes", error);
    }

    [Fact]
    public void Accepts_PathWithoutNullBytes()
    {
        var safePath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Documents");
        var error = Validate(safePath, allowAnyAbsolute: false);
        Assert.Null(error);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  Traversal sequences
    // ═══════════════════════════════════════════════════════════════════════════

    [Theory]
    [InlineData("..\\Windows\\System32")]
    [InlineData("foo\\..\\bar")]
    [InlineData("..")]
    [InlineData("../etc/passwd")]
    public void Rejects_TraversalSequences(string path)
    {
        var error = Validate(path);
        Assert.NotNull(error);
        Assert.Contains("traversal", error.ToLower());
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  UNC and device paths
    // ═══════════════════════════════════════════════════════════════════════════

    [Theory]
    [InlineData("\\\\server\\share")]
    [InlineData("\\\\?\\C:\\temp")]
    [InlineData("\\\\.\\COM1")]
    [InlineData("//server/share")]
    [InlineData("//?/C:/temp")]
    public void Rejects_UncAndDevicePaths(string path)
    {
        var error = Validate(path);
        Assert.NotNull(error);
        Assert.Contains("UNC", error);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  Safe root acceptance (allowAnyAbsolute: false)
    // ═══════════════════════════════════════════════════════════════════════════

    [Fact]
    public void Accepts_UserProfile()
    {
        var path = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
        var error = Validate(path, allowAnyAbsolute: false);
        Assert.Null(error);
    }

    [Fact]
    public void Accepts_UserProfile_Subdirectory()
    {
        var path = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Documents", "test.txt");
        var error = Validate(path, allowAnyAbsolute: false);
        Assert.Null(error);
    }

    [Fact]
    public void Accepts_Desktop()
    {
        var path = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
        var error = Validate(path, allowAnyAbsolute: false);
        Assert.Null(error);
    }

    [Fact]
    public void Accepts_Documents()
    {
        var path = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Documents");
        var error = Validate(path, allowAnyAbsolute: false);
        Assert.Null(error);
    }

    [Fact]
    public void Accepts_Downloads()
    {
        var path = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Downloads");
        var error = Validate(path, allowAnyAbsolute: false);
        Assert.Null(error);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  Safe root rejection (allowAnyAbsolute: false)
    // ═══════════════════════════════════════════════════════════════════════════

    [Theory]
    [InlineData("C:\\Windows\\System32")]
    [InlineData("C:\\Program Files")]
    [InlineData("C:\\")]
    public void Rejects_UnsafeRoots(string path)
    {
        var error = Validate(path, allowAnyAbsolute: false);
        Assert.NotNull(error);
        Assert.Contains("outside", error);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  allowAnyAbsolute: true
    // ═══════════════════════════════════════════════════════════════════════════

    [Fact]
    public void Accepts_AnyAbsolute_WhenAllowAnyAbsolute()
    {
        var error = Validate("C:\\Windows\\System32", allowAnyAbsolute: true);
        Assert.Null(error);
    }

    [Fact]
    public void StillRejects_Traversal_WhenAllowAnyAbsolute()
    {
        var error = Validate("C:\\Windows\\..\\..\\System32", allowAnyAbsolute: true);
        Assert.NotNull(error);
    }

    [Fact]
    public void StillRejects_Unc_WhenAllowAnyAbsolute()
    {
        var error = Validate("\\\\server\\share", allowAnyAbsolute: true);
        Assert.NotNull(error);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  Case insensitivity
    // ═══════════════════════════════════════════════════════════════════════════

    [Fact]
    public void SafeRootComparison_IsCaseInsensitive()
    {
        var profile = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
        var upper = profile.ToUpper();
        var error = Validate(upper, allowAnyAbsolute: false);
        Assert.Null(error);
    }
}
