// ── File system items ──────────────────────────────────────────────────────

export interface FileItem {
  /** Unique identifier — equals fullPath. */
  id: string;
  name: string;
  fullPath: string;
  /** Bytes; -1 for directories. */
  size: number;
  /** ISO-8601 string (from C# DateTime serialisation). */
  modified: string;
  isDirectory: boolean;
  permissions: string;
}

// ── Connection ─────────────────────────────────────────────────────────────

export type Protocol = 'ftp' | 'ftps-explicit' | 'ftps-implicit' | 'sftp';

export interface Site {
  name: string;
  host: string;
  port: string;
  protocol: Protocol;
  username: string;
  password?: string;
}

// ── Transfers ──────────────────────────────────────────────────────────────

export type TransferStatus = 'pending' | 'active' | 'complete' | 'error';

export interface TransferItem {
  transferId: string;
  filename: string;
  direction: 'upload' | 'download';
  totalBytes: number;
  bytesTransferred: number;
  speedBytesPerSecond: number;
  percentComplete: number;
  status: TransferStatus;
  error?: string;
}

// ── Logging ────────────────────────────────────────────────────────────────

export type LogLevel = 'info' | 'warn' | 'error';

export interface LogEntry {
  id: string;
  timestamp: Date;
  message: string;
  level: LogLevel;
}

// ── Host-key prompt ────────────────────────────────────────────────────────

export interface HostKeyPrompt {
  host: string;
  fingerprint: string;
}

// ── Inbound WebView2 messages ──────────────────────────────────────────────

export type InboundMessage =
  | { type: 'response'; requestId: string; result: string }
  | { type: 'error'; requestId: string; message: string }
  | { type: 'ack'; requestId: string }
  | {
      type: 'progress';
      transferId: string;
      bytesTransferred: number;
      totalBytes: number;
      speedBytesPerSecond: number;
      percentComplete: number;
      status: string;
      message?: string;
    }
  | { type: 'hostKeyPrompt'; host: string; fingerprint: string };
