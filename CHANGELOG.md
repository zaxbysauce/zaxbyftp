# Changelog

All notable changes to FTP Client are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

### Added
- **CancellationToken support** — All async file operations (Connect, ListDirectory, Upload, Download, Mkdir, Rename, Delete) now accept a CancellationToken parameter, enabling cancellation of in-progress operations from the frontend. Implemented through the entire stack: IFileClient interface, FtpFileClient and SftpFileClient adapters (with FluentFTP and SSH.NET token propagation), and AppBridge (which forwards JavaScript cancellation requests to the .NET layer).
- **ErrorBoundary** — Added to catch unhandled JavaScript errors and display a fallback UI with a "Try Again" button, preventing white screens.
- **Focus trapping** — Implemented in `ConfirmDialog` and `ModalInput` to contain focus, enable Tab cycling, close on Escape, and return focus to the trigger element.
- **ARIA labels for icon buttons** — All icon-only buttons now include `aria-label` attributes for screen reader users.
- **Form labels** — QuickConnect inputs (Host, Port, Protocol, Username, Password) now have associated `<label>` elements with `htmlFor` identifiers.
- **Site dropdown click-outside** — The site manager dropdown now closes when clicking outside of it.
- **Error banner ARIA** — Error banners use `role="alert"` and `aria-live="assertive"` for immediate screen reader announcements.
- **BottomPanel tab roles** — Tabs now implement the ARIA tab pattern (`role="tablist"`, `role="tab"`, `role="tabpanel"`) with proper attributes.
- **Transfer progress ARIA** — Progress bars include `role="progressbar"` with `aria-valuenow`, `aria-valuemin`, `aria-valuemax`, and `aria-valuetext`.
- **LogPanel ARIA** — The log container uses `role="log"` with `aria-live="polite"` to announce new entries.
- **Focus-visible styles** — Global CSS now shows focus rings only for keyboard navigation.
- **Reduced motion support** — `@media (prefers-reduced-motion)` disables animations like `animate-pulse`.
- **ContextMenu aria-current** — Focused items use `aria-current="true"` instead of `aria-selected`.
- **saveSite error logging** — Errors are now caught and posted to the Log panel for visibility.
- **Splitter cleanup** — Event listeners removed on unmount to prevent memory leaks.

## [1.0.1.0] - 2026-04-20

### Added
- **FTPS certificate TOFU validation** — FTPS connections now prompt the user to
  trust/reject the server certificate on first use (SHA-256 fingerprint displayed).
  Trusted fingerprints are persisted to `%LOCALAPPDATA%\FtpClient\trusted_certs.json`
  and auto-accepted on subsequent connections. Matches the existing SFTP host-key flow.
- `CertPrompt` type and `certPrompt` state in React context for the new prompt card.
- `trustCert` / `rejectCert` bridge functions and `AppContext` callbacks.
- Blue-styled certificate prompt card in the Messages tab (alongside existing SSH
  host-key mismatch card). Messages tab badge now counts both prompt types.

### Fixed
- **FTPS deadlock prevention** — `FtpFileClient.ConnectAsync` now wraps
  `client.Connect()` in `Task.Run()`, ensuring FluentFTP's `ValidateCertificate`
  event fires on a ThreadPool thread with no `SynchronizationContext`. Without this,
  the `.GetAwaiter().GetResult()` call in the cert validator could deadlock against
  the WPF UI dispatcher if the semaphore completed synchronously on the UI thread.
- **`ValidateAnyCertificate = true` removed** — plain-accept of any FTPS certificate
  replaced with the new user-confirmation flow. FTPS certificates are rejected by
  default unless a validator is wired (it always is via `BuildFtpClient()`).
- **`ui-bundle.zip` not embedded when `SkipUiBuild=true`** — split the csproj into
  a static `ItemGroup` (always embeds the zip if present on disk) and a `BuildReactUi`
  target (only runs npm). Fixes a startup crash where `ExtractUiIfNeeded()` threw
  `InvalidOperationException("Embedded resource 'ui-bundle.zip' not found")` on every
  build that used `-p:SkipUiBuild=true`.
- **Vault ordering documentation** — added comment explaining why `Remove`-then-`Add`
  ordering in `SaveSite()` is acceptable and what the recovery path is.
- **`BuildFtpClient()` unused parameter** — removed superfluous `host` parameter
  (the cert validator callback already receives the host as its first argument).

### Changed
- `UiDir` and `UiBundleZip` MSBuild properties promoted to project-level
  `PropertyGroup` (were local to the `BuildReactUi` target) for consistency.
- `MessagesPanel` props renamed from `onTrust`/`onReject` to
  `onTrustHost`/`onRejectHost` for clarity as cert prompt callbacks were added.

## [1.0.0.0] - 2026-04-18

### Added
- Initial release: single-file WPF + WebView2 FTP/FTPS/SFTP desktop client.
- Dual-pane file browser (local + remote) with virtualized react-arborist tree.
- Native HTML5 drag-and-drop upload/download between panes.
- Context menus: Download, New Folder, Rename, Delete (remote); Upload, Open (local).
- Transfer queue with real-time progress bars and speed display.
- Log tab with append-only server response log.
- Messages tab for SSH host-key mismatch prompts.
- Site Manager with PasswordVault-backed credential storage (no plaintext on disk).
- SFTP TOFU host-key fingerprint verification with `known_hosts.json` persistence.
- FluentFTP adapter (FTP / FTPS Explicit+Implicit) with `SemaphoreSlim(1,1)` serialization.
- SSH.NET adapter (SFTP) with password and private-key authentication.
- `app.manifest`: `asInvoker`, PerMonitorV2 DPI, longPathAware, Windows 10/11 GUIDs.
- MSBuild `BuildReactUi` target: `npm ci` → `npm run build` → `ZipDirectory` → embed.
