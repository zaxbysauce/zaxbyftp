# Building FtpClient

## Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| .NET SDK | 8.0+ | `dotnet --version` |
| Node.js | 18+ | Required for the React UI build |
| npm | 9+ | Comes with Node.js |
| OS | Windows 10 1809+ (x64) | WPF + WebView2 target |

## Full build (UI + executable)

```powershell
dotnet publish -c Release -r win-x64 -o ./publish
```

Output: `publish\FtpClient.exe` — a single self-contained executable with no sidecars.

What this does under the hood:

1. Runs `npm ci` then `npm run build` inside `src/ui/`, producing the minified React app in `src/ui/dist/`.
2. Zips `dist/` into `src/ui/ui-bundle.zip` and embeds it as a managed resource.
3. Compiles all C# code, resolves NuGet packages, and bundles the .NET 8 runtime and all native libraries into one compressed binary.

## Incremental rebuild (skip UI)

If the React source hasn't changed, skip the npm steps to save time:

```powershell
dotnet publish -c Release -r win-x64 -o ./publish -p:SkipUiBuild=true
```

This re-embeds `src/ui/ui-bundle.zip` from disk as-is. The zip must already exist (run a full build first).

## Development build

For a debug build that skips publish optimizations:

```powershell
dotnet build
```

The resulting binary is in `bin\Debug\net8.0-windows10.0.17763.0\win-x64\`. The UI is still built and embedded unless `-p:SkipUiBuild=true` is passed.

To iterate on the React UI alone without rebuilding C#:

```powershell
cd src/ui
npm ci          # first time only
npm run build
cd ../..
dotnet build -p:SkipUiBuild=true
```

## Runtime behavior

On first launch, `FtpClient.exe` extracts `ui-bundle.zip` from its embedded resources to `%LOCALAPPDATA%\FtpClient\ui\` and serves it to the embedded WebView2 control over the virtual host `ftpclient.local`. Subsequent launches skip extraction unless the embedded bundle version changes.

## Notes

- The publish profile is fully defined in `FtpClient.csproj` — no separate `.pubxml` file is needed.
- `FtpClient.Tests/` is excluded from publish via a `Exclude` glob in the csproj; running `dotnet test` from the repo root targets the test project directly.
- Only `win-x64` is supported; the project uses WPF and WebView2, both of which are Windows-only.
