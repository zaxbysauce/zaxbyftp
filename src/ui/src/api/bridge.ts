/**
 * bridge.ts — typed wrapper around the WebView2 hostObjects.api COM bridge.
 *
 * Two communication channels:
 *   1. JS → C#  via  window.chrome.webview.hostObjects.api.MethodName(...)
 *      (returns Promise<void> or Promise<string> for sync string methods)
 *   2. C# → JS  via  window.chrome.webview 'message' event
 *      (JSON payloads with type:"response"|"error"|"ack"|"progress"|"hostKeyPrompt")
 *
 * All async C# operations are void; results arrive as 'response'/'error'/'ack'
 * messages matched by requestId. Synchronous C# methods (ListLocalDirectory,
 * GetSavedSites) return their string value directly through the COM dispatch.
 */

import type { FileItem, InboundMessage, Site, TransferItem } from '../types';

// ── Global message router ────────────────────────────────────────────────────
// Maps requestId → [resolve, reject].  Populated before each COM call so the
// response handler is already registered when the C# callback fires.

type Resolver = [(v: string) => void, (e: Error) => void];
const pendingRequests = new Map<string, Resolver>();
type GlobalListener = (msg: InboundMessage) => void;
const globalListeners = new Set<GlobalListener>();

let routerInstalled = false;

function ensureRouter(): void {
  if (routerInstalled || !window.chrome?.webview) return;
  routerInstalled = true;

  window.chrome.webview.addEventListener('message', (e: MessageEvent) => {
    const raw = typeof e.data === 'string' ? e.data : JSON.stringify(e.data);
    let msg: InboundMessage;
    try { msg = JSON.parse(raw) as InboundMessage; }
    catch { return; }

    // Dispatch to per-request resolver first.
    if ('requestId' in msg && msg.requestId) {
      const pair = pendingRequests.get(msg.requestId);
      if (pair) {
        pendingRequests.delete(msg.requestId);
        if (msg.type === 'error') {
          pair[1](new Error(msg.message));
        } else if (msg.type === 'response') {
          pair[0](msg.result);
        } else {
          // 'ack' — no result value
          pair[0]('');
        }
      }
    }

    // Also broadcast to all global listeners (progress, hostKeyPrompt, etc.).
    globalListeners.forEach(l => l(msg));
  });
}

/** Subscribe to ALL inbound C# messages (progress, hostKeyPrompt, etc.). */
export function addGlobalListener(fn: GlobalListener): () => void {
  ensureRouter();
  globalListeners.add(fn);
  return () => globalListeners.delete(fn);
}

// ── Core COM call helpers ────────────────────────────────────────────────────

function getApi(): BridgeApi {
  const api = window.chrome?.webview?.hostObjects?.api;
  if (!api) throw new Error('WebView2 bridge not available');
  return api;
}

/**
 * Call a void async C# method that posts a response/error/ack back.
 * Registers the request listener BEFORE the COM call to avoid a race.
 */
function invokeAsync(method: string, ...args: unknown[]): Promise<string> {
  ensureRouter();
  const api = getApi();
  const requestId = crypto.randomUUID();

  return new Promise<string>((resolve, reject) => {
    pendingRequests.set(requestId, [resolve, reject]);

    // Fire-and-forget from JS perspective; result comes back via message event.
    (api as unknown as Record<string, (...a: unknown[]) => Promise<void>>)
      [method](requestId, ...args)
      .catch((e: unknown) => {
        // COM-level failure (not an application error) — clean up and reject.
        pendingRequests.delete(requestId);
        reject(e instanceof Error ? e : new Error(String(e)));
      });
  });
}

/**
 * Call a C# method that returns a string directly (synchronous on C# side).
 * The COM dispatch is still async from JS; we just await the resolved value.
 *
 * The C# implementation (AppBridge) always returns valid JSON.  We guard
 * against unexpected values defensively.
 */
async function invokeDirect<T>(method: string, ...args: unknown[]): Promise<T> {
  const api = getApi();
  const raw = await (api as unknown as Record<string, (...a: unknown[]) => Promise<string>>)
    [method](...args);

  if (typeof raw !== 'string' || raw.length === 0) {
    throw new Error(`Bridge method '${method}' returned an empty or non-string response`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Bridge method '${method}' returned invalid JSON: ${raw.slice(0, 80)}`);
  }

  // C# AppBridge serialises errors as { "error": "message" }.
  if (
    parsed !== null &&
    typeof parsed === 'object' &&
    !Array.isArray(parsed) &&
    'error' in parsed
  ) {
    throw new Error((parsed as { error: string }).error);
  }
  return parsed as T;
}

// ── Public API ───────────────────────────────────────────────────────────────

/** Begin connecting; resolves with a session GUID on success. */
export async function connect(
  host: string,
  port: number,
  user: string,
  pass: string,
  protocol: string,
): Promise<string> {
  return invokeAsync('Connect', host, port, user, pass, protocol);
}

/** Disconnect and discard a session. */
export async function disconnect(sessionId: string): Promise<void> {
  const api = getApi();
  await api.Disconnect(sessionId);
}

/** List a remote directory; resolves with a FileItem array. */
export async function listDirectory(
  sessionId: string,
  path: string,
): Promise<FileItem[]> {
  const json = await invokeAsync('ListDirectory', sessionId, path);
  const items = JSON.parse(json) as RawRemoteItem[];
  return items.map(normaliseRemote);
}

/** List a local directory; resolves with a FileItem array. */
export async function listLocalDirectory(path: string): Promise<FileItem[]> {
  return invokeDirect<FileItem[]>('ListLocalDirectory', path);
}

/** Start an upload; progress events arrive via addGlobalListener. */
export function startUpload(
  sessionId: string,
  localPath: string,
  remotePath: string,
  transferId: string,
): void {
  const api = getApi();
  void api.Upload(sessionId, localPath, remotePath, transferId);
}

/** Start a download; progress events arrive via addGlobalListener. */
export function startDownload(
  sessionId: string,
  remotePath: string,
  localPath: string,
  transferId: string,
): void {
  const api = getApi();
  void api.Download(sessionId, remotePath, localPath, transferId);
}

export async function mkdir(sessionId: string, path: string): Promise<void> {
  await invokeAsync('Mkdir', sessionId, path);
}

export async function rename(
  sessionId: string,
  oldPath: string,
  newPath: string,
): Promise<void> {
  await invokeAsync('Rename', sessionId, oldPath, newPath);
}

export async function deleteItem(sessionId: string, path: string): Promise<void> {
  await invokeAsync('Delete', sessionId, path);
}

/** Retrieve all saved sites (passwords injected from PasswordVault). */
export async function getSavedSites(): Promise<Site[]> {
  return invokeDirect<Site[]>('GetSavedSites');
}

export async function saveSite(site: Site): Promise<void> {
  const api = getApi();
  await api.SaveSite(JSON.stringify(site));
}

export async function deleteSite(name: string): Promise<void> {
  const api = getApi();
  await api.DeleteSite(name);
}

/** Notify C# that the user trusted a host key mismatch. */
export function trustHost(fingerprint: string): void {
  window.chrome.webview.postMessage(JSON.stringify({ action: 'trustHost', fingerprint }));
}

/** Notify C# that the user rejected a host key mismatch. */
export function rejectHost(fingerprint: string): void {
  window.chrome.webview.postMessage(JSON.stringify({ action: 'rejectHost', fingerprint }));
}

/** Notify C# that the user trusted an FTPS certificate (stores to trusted_certs.json). */
export function trustCert(host: string, fingerprint: string): void {
  window.chrome.webview.postMessage(JSON.stringify({ action: 'trustCert', host, fingerprint }));
}

/** Notify C# that the user rejected an FTPS certificate (aborts connection). */
export function rejectCert(fingerprint: string): void {
  window.chrome.webview.postMessage(JSON.stringify({ action: 'rejectCert', fingerprint }));
}

/** Send a window chrome action (dragWindow / closeWindow / minimizeWindow / maximizeWindow). */
export function windowAction(action: string): void {
  window.chrome.webview.postMessage(JSON.stringify({ action }));
}

// ── Helpers ──────────────────────────────────────────────────────────────────

interface RawRemoteItem {
  name: string;
  fullPath: string;
  size: number;
  modified: string;
  isDirectory: boolean;
  permissions: string;
}

function normaliseRemote(r: RawRemoteItem): FileItem {
  return {
    id: r.fullPath,
    name: r.name,
    fullPath: r.fullPath,
    size: r.size,
    modified: r.modified,
    isDirectory: r.isDirectory,
    permissions: r.permissions ?? '',
  };
}

/** Build a pending TransferItem for display before the first progress event. */
export function makePendingTransfer(
  transferId: string,
  filename: string,
  direction: 'upload' | 'download',
): TransferItem {
  return {
    transferId,
    filename,
    direction,
    totalBytes: 0,
    bytesTransferred: 0,
    speedBytesPerSecond: 0,
    percentComplete: 0,
    status: 'pending',
  };
}
