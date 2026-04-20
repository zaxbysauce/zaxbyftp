using System.IO;
using System.Reflection;
using System.Windows;
using Microsoft.Web.WebView2.Core;

namespace FtpClient;

public partial class MainWindow : Window
{
    // ── App data directories ─────────────────────────────────────────────
    //    All state lives under %LOCALAPPDATA%\FtpClient\ per spec.
    internal static readonly string AppDataDir =
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                     "FtpClient");

    private static readonly string UiDir         = Path.Combine(AppDataDir, "ui");
    private static readonly string WebView2Cache  = Path.Combine(AppDataDir, "webview2-cache");

    // Virtual hostname served to WebView2 — must be a syntactically valid hostname.
    private const string VirtualHost = "ftpclient.local";

    // ── Constructor ──────────────────────────────────────────────────────
    public MainWindow()
    {
        InitializeComponent();
        Loaded += OnWindowLoaded;

        // Allow JS→WPF messages (used by Phase 3 AppBridge and the drag/resize
        // workaround described in MainWindow.xaml comments).
        WebView.WebMessageReceived += OnWebMessageReceived;
    }

    // ── Window loaded: async WebView2 init ──────────────────────────────
    private async void OnWindowLoaded(object sender, RoutedEventArgs e)
    {
        try
        {
            Directory.CreateDirectory(AppDataDir);
            Directory.CreateDirectory(UiDir);

            // Extract embedded UI resources to disk if version changed.
            ExtractUiIfNeeded();

            // Create the WebView2 environment with a fixed user-data folder so
            // cookies/cache survive restarts and don't land in a temp path.
            var env = await CoreWebView2Environment.CreateAsync(
                browserExecutableFolder: null,
                userDataFolder: WebView2Cache);

            await WebView.EnsureCoreWebView2Async(env);

            // Map the virtual hostname to the extracted UI directory.
            // Using a virtual host (https://) instead of file:// avoids CORS
            // restrictions and matches the behaviour expected by the React app.
            WebView.CoreWebView2.SetVirtualHostNameToFolderMapping(
                VirtualHost, UiDir, CoreWebView2HostResourceAccessKind.Allow);

            // Phase 3 hook: AppBridge is registered here.
            // var bridge = new AppBridge(WebView.CoreWebView2);
            // WebView.CoreWebView2.AddHostObjectToScript("api", bridge);

            // Phase 1: navigate to the hello page.
            WebView.Source = new Uri($"https://{VirtualHost}/index.html");
        }
        catch (Exception ex)
        {
            // Likely cause: WebView2 Runtime not installed.
            // WebView2 ships with Windows 11 and is available as a standalone
            // evergreen installer for Windows 10.
            MessageBox.Show(
                $"WebView2 initialisation failed.\n\n{ex.Message}\n\n" +
                "Ensure the Microsoft Edge WebView2 Runtime is installed:\n" +
                "https://developer.microsoft.com/microsoft-edge/webview2/",
                "FTP Client — Startup Error",
                MessageBoxButton.OK,
                MessageBoxImage.Error);

            Application.Current.Shutdown(1);
        }
    }

    // ── WebView2 → WPF message handler ──────────────────────────────────
    //    Phase 1: handles window drag/close gestures from JS.
    //    Phase 3: AppBridge responses are also posted via this channel.
    private void OnWebMessageReceived(object? sender,
        CoreWebView2WebMessageReceivedEventArgs e)
    {
        try
        {
            var json = e.TryGetWebMessageAsString();
            // Minimal routing — Phase 3 will replace this with a proper dispatcher.
            if (json == "{\"action\":\"dragWindow\"}")
            {
                // Must be called on the UI thread; this handler already is.
                DragMove();
            }
            else if (json == "{\"action\":\"closeWindow\"}")
            {
                Close();
            }
            else if (json == "{\"action\":\"minimizeWindow\"}")
            {
                WindowState = WindowState.Minimized;
            }
            else if (json == "{\"action\":\"maximizeWindow\"}")
            {
                WindowState = WindowState == WindowState.Maximized
                    ? WindowState.Normal
                    : WindowState.Maximized;
            }
        }
        catch
        {
            // Swallow parse errors — JS may send non-string messages.
        }
    }

    // ── Embedded resource extraction ────────────────────────────────────
    //    Resources are embedded with LogicalName = "ui/<relative-path>"
    //    (see FtpClient.csproj).  That preserves forward-slash separators
    //    so GetManifestResourceNames() returns "ui/index.html" etc. without
    //    the namespace-dot mangling that the default MSBuild naming applies.
    //
    //    Version check: assembly version is written to ui/.version on first
    //    extraction; subsequent launches skip extraction unless the version
    //    string changes (i.e., a new build is run).
    private static void ExtractUiIfNeeded()
    {
        var assembly       = Assembly.GetExecutingAssembly();
        var currentVersion = assembly.GetName().Version?.ToString() ?? "0.0.0.0";
        var versionFile    = Path.Combine(UiDir, ".version");

        // Defensive read: another process (e.g., a second instance launching
        // simultaneously) may be writing the file. If reading fails we re-extract.
        try
        {
            if (File.Exists(versionFile) &&
                File.ReadAllText(versionFile).Trim() == currentVersion)
            {
                return; // Already up to date.
            }
        }
        catch (IOException)
        {
            // Fall through and re-extract.
        }

        // Wipe stale UI files before extracting fresh ones.
        // If two instances race here, one will fail Directory.Delete with an
        // IOException; the catch in OnWindowLoaded will show a clear error rather
        // than a silent partial-extract.
        if (Directory.Exists(UiDir))
            Directory.Delete(UiDir, recursive: true);
        Directory.CreateDirectory(UiDir);

        const string Prefix = "ui/";

        foreach (var resourceName in assembly.GetManifestResourceNames())
        {
            if (!resourceName.StartsWith(Prefix, StringComparison.Ordinal))
                continue;

            // Strip the "ui/" prefix to get the relative path.
            // Forward slashes in LogicalName are preserved as-is, so we
            // normalise to the OS separator for Directory.CreateDirectory.
            var relative = resourceName[Prefix.Length..]
                               .Replace('/', Path.DirectorySeparatorChar);
            var dest = Path.Combine(UiDir, relative);

            var dir = Path.GetDirectoryName(dest);
            if (!string.IsNullOrEmpty(dir))
                Directory.CreateDirectory(dir);

            using var src = assembly.GetManifestResourceStream(resourceName)
                            ?? throw new InvalidOperationException(
                                   $"Embedded resource '{resourceName}' not found.");
            using var dst = File.Create(dest);
            src.CopyTo(dst);
        }

        File.WriteAllText(versionFile, currentVersion);
    }
}
