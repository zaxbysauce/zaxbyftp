---
name: csharp-cancellation-patterns
description: >
  Apply when modifying any async method in the Adapters/ layer (FtpFileClient, SftpFileClient),
  the IFileClient interface, or AppBridge file-operation calls. Also apply when adding new async
  methods that interact with FTP/SFTP libraries or when reviewing cancellation correctness.
  Covers FluentFTP, SSH.NET, and SemaphoreSlim patterns specific to this codebase.
effort: medium
---

# CancellationToken Patterns for FtpFileClient / SftpFileClient

## Three-Layer Architecture

Every file operation flows through three layers. Each layer has its own cancellation rules:

```
Frontend (JS AbortController)
  → AppBridge (forwards CancellationToken)
    → IFileClient interface (declares CancellationToken parameter)
      → FtpFileClient / SftpFileClient (implements cancellation)
        → FluentFTP / SSH.NET (actual library calls)
```

**Every layer must propagate the token. Breaking the chain at any point defeats cancellation.**

## Rule 1 — IFileClient Interface

All async interface methods MUST accept `CancellationToken` as a named parameter with `= default`:

```csharp
Task ConnectAsync(ConnectionProfile profile, CancellationToken cancellationToken = default);
Task<List<RemoteItem>> ListDirectoryAsync(string path, CancellationToken cancellationToken = default);
Task UploadAsync(string localPath, string remotePath, IProgress<TransferProgress>? progress = null,
                 CancellationToken cancellationToken = default);
// etc.
```

Never omit the parameter — callers depend on it being there.

## Rule 2 — FtpFileClient (FluentFTP)

FluentFTP uses `token` as the named parameter, NOT `cancellationToken`.

```csharp
// CORRECT — 'token:' not 'cancellationToken:'
await ftp.UploadFile(localPath, remotePath,
    FtpRemoteExists.Overwrite, createRemoteDir: false, FtpVerify.None,
    ftpProgress,
    token: cancellationToken);

// WRONG — fluentFTP does not have a parameter named 'cancellationToken'
await ftp.UploadFile(..., cancellationToken: cancellationToken); // compile error or ignored
```

**Always check the FluentFTP API signature** before adding named arguments. The parameter
name is `token` across all overloads that accept cancellation.

### Serialization with SemaphoreSlim

Use `_sem.WaitAsync(cancellationToken)` to serialize concurrent operations AND gate cancellation:

```csharp
await _sem.WaitAsync(cancellationToken);  // cancels immediately if already cancelled
try
{
    // actual I/O here
}
finally { _sem.Release(); }
```

Do NOT use `_sem.Wait()` (synchronous, blocks) or `_sem.WaitAsync()` without the token.

### Supported FluentFTP Overloads

These FluentFTP methods accept a `CancellationToken token` parameter:

| Method | Token support |
|--------|--------------|
| `UploadFile` | `token:` — use this named form |
| `DownloadFile` | `token:` — use this named form |
| `CreateDirectory` | `token:` — use this named form |
| `GetObjectInfo` | `token:` — use this named form |
| `Rename` | positional `CancellationToken` |
| `DeleteDirectory` | positional `CancellationToken` |
| `DeleteFile` | positional `CancellationToken` |
| `GetListing` | positional `CancellationToken` |

For methods that don't accept a token directly, rely on `_sem.WaitAsync(token)` for
cancellation — the semaphore will abort before the blocking call starts.

## Rule 3 — SftpFileClient (SSH.NET)

SSH.NET 2025.x provides two API styles. This codebase uses `Task.Run` over the sync API as the primary
pattern (simpler callback integration with `IProgress<T>`). Both approaches are valid:

### Option A — Task.Run over sync API (used in this codebase)

SSH.NET 2025.x has synchronous APIs (`ListDirectory`, `UploadFile`, `DownloadFile`) that require
`Task.Run` to make them cancellable:

```csharp
// CORRECT — Task.Run makes the sync API cancellable
return Task.Run(() =>
{
    cancellationToken.ThrowIfCancellationRequested(); // checkpoint before I/O
    var items = sftp.ListDirectory(path);
    return items.Where(i => i.Name is not ("." or ".."))
        .Select(i => new RemoteItem { ... })
        .ToList();
}, cancellationToken);

// WRONG — sync API without Task.Run cannot be cancelled
var items = sftp.ListDirectory(path); // cannot be cancelled
```

### Option B — Native async API (SSH.NET 2025.x)

SSH.NET 2025.1.0 introduced native async methods with `CancellationToken` support:

```csharp
// Available in SSH.NET 2025.1.0+
IAsyncEnumerable<ISftpFile> ListDirectoryAsync(string path, CancellationToken cancellationToken);
// Returns IAsyncEnumerable — enumerate with await foreach
```

Prefer native async for operations that support it. Use `Task.Run` when you need progress callbacks
or other features only available on the sync API.

### ThrowIfCancellationRequested() Checkpoints

Place `ThrowIfCancellationRequested()` BEFORE blocking I/O operations inside `Task.Run`:

```csharp
public async Task UploadAsync(string localPath, string remotePath,
                              IProgress<TransferProgress>? progress,
                              CancellationToken cancellationToken = default)
{
    var sftp = RequireConnected();

    // Check before starting the I/O-bound work
    cancellationToken.ThrowIfCancellationRequested();

    await Task.Run(() =>
    {
        cancellationToken.ThrowIfCancellationRequested(); // before each blocking call
        using var input = File.OpenRead(localPath);
        sftp.UploadFile(input, remotePath, progress: p => progress?.Report(...));
        cancellationToken.ThrowIfCancellationRequested(); // after upload
    }, cancellationToken);
}
```

### Disconnect() Pattern

`Disconnect()` requires special handling — it must abort in-flight operations AND clean up:

```csharp
public void Disconnect(CancellationToken cancellationToken = default)
{
    cancellationToken.ThrowIfCancellationRequested(); // before touching state

    var sftp = _sftp;
    _sftp    = null;  // idempotent — prevents reuse
    _profile = null;

    if (sftp is null) return; // already disconnected

    cancellationToken.ThrowIfCancellationRequested(); // before blocking disconnect

    try { sftp.Disconnect(); } catch { /* best-effort */ }
    sftp.Dispose();
}

public void Dispose() => Disconnect(); // Dispose() has no cancellation — pass default
```

Key points:
- Null the connection field BEFORE calling `sftp.Disconnect()` so a racing `UploadAsync`
  sees `_sftp == null` and throws `InvalidOperationException` instead of corrupting state
- Two `ThrowIfCancellationRequested()` calls: one before state mutation, one before the
  blocking disconnect
- `Dispose()` passes `default(CancellationToken)` — no user cancellation during shutdown

## Rule 4 — AppBridge (Frontend Bridge)

AppBridge MUST propagate the `CancellationToken` from the method parameter to adapter calls:

```csharp
// CORRECT
public async Task ConnectAsync(ConnectionProfile profile,
                               CancellationToken cancellationToken = default)
{
    await client.ConnectAsync(profile, cancellationToken); // real token propagated
}

// WRONG — CancellationToken.None defeats the entire cancellation feature
public async Task ConnectAsync(ConnectionProfile profile,
                               CancellationToken cancellationToken = default)
{
    await client.ConnectAsync(profile, CancellationToken.None); // cancellation blocked
}
```

Check every adapter call site. A single hardcoded `CancellationToken.None` in the call
chain negates cancellation for the entire operation.

## Common Mistakes

### Mistake 1 — Wrong named parameter for FluentFTP
```csharp
// WRONG — won't compile or will be ignored
ftp.UploadFile(path, remote, token: someToken); // 'token' not 'cancellationToken'

// CORRECT
ftp.UploadFile(path, remote, token: cancellationToken);
```

### Mistake 2 — Missing Task.Run wrapper for SSH.NET sync API
```csharp
// WRONG — sync API without Task.Run cannot be cancelled
var items = sftp.ListDirectory(path);

// CORRECT — Task.Run over sync API
return Task.Run(() => sftp.ListDirectory(path), cancellationToken);

// OR — native async API (SSH.NET 2025.1.0+)
await foreach (var file in sftp.ListDirectoryAsync(path, cancellationToken))
    yield return new RemoteItem { ... };
```

### Mistake 3 — Hardcoded CancellationToken.None in AppBridge
```csharp
// WRONG — breaks the cancellation chain
await client.UploadAsync(localPath, remotePath, progress, CancellationToken.None);

// CORRECT
await client.UploadAsync(localPath, remotePath, progress, cancellationToken);
```

### Mistake 4 — Missing ThrowIfCancellationRequested() before blocking I/O
```csharp
// RISKY — long I/O operation with no cancellation checkpoint
await Task.Run(() =>
{
    sftp.UploadFile(input, remotePath); // cannot be cancelled mid-flight
}, cancellationToken);

// BETTER — checkpoint before and after
await Task.Run(() =>
{
    cancellationToken.ThrowIfCancellationRequested();
    sftp.UploadFile(input, remotePath);
    cancellationToken.ThrowIfCancellationRequested();
}, cancellationToken);
```

### Mistake 5 — Disconnect called without token during cleanup
```csharp
// WRONG in AppBridge.Disconnect(sessionId) — no token forwarded
client.Disconnect(); // best-effort only

// CORRECT
client.Disconnect(cancellationToken); // or client.Disconnect(default) for cleanup
```

### Mistake 6 — No cleanup of partial files on cancellation

When a transfer is cancelled mid-flight, the partial file remains on disk:

```csharp
// RISKY — partial file left behind on cancellation
await Task.Run(() =>
{
    sftp.UploadFile(localStream, remotePath);
}, cancellationToken);

// BETTER — use a temporary name, clean up on cancellation
var tempPath = remotePath + ".tmp";
try
{
    await Task.Run(() =>
    {
        cancellationToken.ThrowIfCancellationRequested();
        sftp.UploadFile(localStream, tempPath);
    }, cancellationToken);
    // Only rename on success
    if (File.Exists(remotePath)) File.Delete(remotePath);
    sftp.RenameFile(tempPath, remotePath);
}
catch (OperationCanceledException)
{
    // Best-effort cleanup of the temp file
    try { sftp.DeleteFile(tempPath); } catch { }
    throw;
}
```

For downloads, consider deleting the partial local file on cancellation:
```csharp
catch (OperationCanceledException)
{
    // Clean up partial download
    if (File.Exists(localPath)) File.Delete(localPath);
    throw;
}
```

## Review Checklist

When reviewing any change to the adapter layer, verify:

- [ ] Every `IFileClient` async method declares `CancellationToken cancellationToken = default`
- [ ] Every `AppBridge` adapter call passes the method's `cancellationToken` (not `CancellationToken.None`)
- [ ] `FluentFTP` calls use `token:` as the named parameter, not `cancellationToken:`
- [ ] `SSH.NET` sync calls are wrapped in `Task.Run(..., cancellationToken)` OR native async methods are used
- [ ] `Task.Run` bodies call `ThrowIfCancellationRequested()` before blocking I/O
- [ ] `Disconnect()` has two `ThrowIfCancellationRequested()` calls (before nulling state, before disconnect)
- [ ] No `CancellationToken.None` appears in the adapter call chain
- [ ] Long-running transfers consider partial-file cleanup on cancellation
- [ ] Tests verify token propagation (check `cancellationToken` variable used, not `CancellationToken.None`)
