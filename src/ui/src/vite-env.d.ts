/// <reference types="vite/client" />

// ── WebView2 host-object type declarations ───────────────────────────────────
// These APIs are only available when the app runs inside the WPF WebView2 host.
// The bridge module guards against their absence for dev-mode hot-reload.

declare global {
  interface Window {
    chrome: {
      webview: ChromeWebView;
    };
  }

  interface ChromeWebView {
    hostObjects: {
      /** COM-visible AppBridge instance registered via AddHostObjectToScript. */
      api: BridgeApi;
    };
    addEventListener(type: 'message', listener: (event: MessageEvent) => void): void;
    removeEventListener(type: 'message', listener: (event: MessageEvent) => void): void;
    /** Send an action message to AppBridge.OnWebMessageReceived. */
    postMessage(message: string): void;
  }

  interface BridgeApi {
    // All async operations are void in C#; results arrive via PostWebMessageAsJson.
    Connect(requestId: string, host: string, port: number, user: string, pass: string, protocol: string): Promise<void>;
    ListDirectory(requestId: string, sessionId: string, path: string): Promise<void>;
    Upload(sessionId: string, localPath: string, remotePath: string, transferId: string): Promise<void>;
    Download(sessionId: string, remotePath: string, localPath: string, transferId: string): Promise<void>;
    Mkdir(requestId: string, sessionId: string, path: string): Promise<void>;
    Rename(requestId: string, sessionId: string, oldPath: string, newPath: string): Promise<void>;
    Delete(requestId: string, sessionId: string, path: string): Promise<void>;
    Disconnect(sessionId: string): Promise<void>;
    SaveSite(siteJson: string): Promise<void>;
    DeleteSite(name: string): Promise<void>;
    // Synchronous string-returning methods — still await the COM dispatch.
    ListLocalDirectory(path: string): Promise<string>;
    GetSavedSites(): Promise<string>;
  }
}

export {};
