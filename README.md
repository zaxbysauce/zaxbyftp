# FTP Client

A modern, accessible desktop FTP/FTPS/SFTP client for Windows, built with WPF and React.

## Key Features

- **Dual-pane file browser** with virtualized lists for local and remote filesystems.
- **Drag-and-drop** transfers between panes with visual feedback.
- **Transfer queue** with real-time progress bars, speeds, and status indicators.
- **Cancellable transfers** — active uploads and downloads can be cancelled via the frontend (CancellationToken propagated through the entire async stack).
- **Context menus** for common actions (download, upload, new folder, rename, delete).
- **Site Manager** with secure credential storage (Windows PasswordVault).
- **Security prompts** for SSH host-key changes and FTPS certificates.
- **Comprehensive logging** with a dedicated Log panel.
- **Messages panel** for security prompts and warnings.
- **Keyboard shortcuts** (F5 refresh, Backspace up, Enter activate).
- **Accessibility** (see below).
- **Error resilience** (see below).

## Accessibility

FTP Client strives to be usable by everyone, including keyboard-only and screen reader users:

- **ARIA throughout**: Dialogs (`role="dialog"`, `aria-modal`), tabs (`tablist`, `tab`, `tabpanel`), alerts (`role="alert"`), progress bars (`role="progressbar"` with numeric values), log region (`role="log"`), and icon buttons (`aria-label`).
- **Focus management**: Focus traps in modal dialogs keep Tab navigation contained and automatically return focus to the triggering element when closed.
- **Form labels**: All inputs in the QuickConnect bar have associated labels for screen reader clarity.
- **Keyboard focus visibility**: `:focus-visible` styles show a clear outline only when navigating with the keyboard (not mouse).
- **Reduced motion**: Animations such as pulsing are disabled when the user enables `prefers-reduced-motion`.
- **Screen reader announcements**: Error banners use `aria-live="assertive"` to interrupt; the Log panel uses `aria-live="polite"` to politely announce new entries; progress bars provide `aria-valuetext` descriptions.

## Error Handling

- **ErrorBoundary**: Unhandled JavaScript errors are caught by an ErrorBoundary component, which displays a fallback UI with the error message and a "Try Again" button instead of a blank window.
- **Better feedback**: Errors when saving sites (e.g., credential persistence failures) are now posted to the Log panel so the user is informed.
- **Graceful degradation**: Modal content remains accessible even if individual components encounter errors.

## Quick Start

1. Launch the application (`FtpClient.exe`).
2. Fill in the QuickConnect form:
   - **Host**: server address
   - **Port**: port number (defaults based on protocol)
   - **Protocol**: FTP, FTPS (Explicit), FTPS (Implicit), or SFTP
   - **Username** and **Password** (if required)
3. Click **Connect**.
4. Navigate the remote directory; use drag-and-drop to transfer files between panes.
5. Monitor transfers in the **Transfers** tab; view logs in the **Log** tab; respond to security prompts in the **Messages** tab.
6. Save frequently used sites via the **Sites** dropdown → **Save**.

## Building from Source

Prerequisites:
- .NET SDK 8.0+
- Node.js 18+ and npm 9+
- Windows 10/11 (WPF + WebView2)

Run:

```powershell
dotnet publish -c Release -r win-x64 -o ./publish
```

For faster rebuilds when only C# changes:

```powershell
dotnet publish -c Release -r win-x64 -o ./publish -p:SkipUiBuild=true
```

See [build.md](build.md) for detailed instructions, development builds, and troubleshooting.

## Known Limitations

- **Breadcrumb navigation** is read-only; clickable segments deferred due to Windows path parsing complexities.
- **Multi-select** (Ctrl/Shift) is not currently supported.
- **TopBar layout** may be reorganized in a future release for improved grouping.

## Support & Contribution

Report issues on GitHub. Contributions welcome!
