/**
 * TransferQueue — shows active + completed transfers with progress bars.
 */

import {
  ArrowUp,
  ArrowDown,
  CheckCircle2,
  XCircle,
  Clock,
} from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import type { TransferItem } from '../types';

function formatBytes(n: number): string {
  if (n <= 0) return '0 B';
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

function formatSpeed(bps: number): string {
  if (bps <= 0) return '';
  return `${formatBytes(bps)}/s`;
}

function TransferRow({ t }: { t: TransferItem }) {
  const pct = Math.min(100, Math.max(0, t.percentComplete));
  const isActive = t.status === 'active';
  const isDone = t.status === 'complete';
  const isError = t.status === 'error';

  return (
    <div className="px-3 py-2 border-b border-gray-800 hover:bg-gray-800/50">
      <div className="flex items-center gap-2 mb-1">
        {/* Direction icon */}
        {t.direction === 'upload'
          ? <ArrowUp size={12} className="text-blue-400 flex-shrink-0" />
          : <ArrowDown size={12} className="text-green-400 flex-shrink-0" />}

        {/* Status icon */}
        {isDone && <CheckCircle2 size={12} className="text-green-400 flex-shrink-0" />}
        {isError && <XCircle size={12} className="text-red-400 flex-shrink-0" />}
        {t.status === 'pending' && <Clock size={12} className="text-gray-500 flex-shrink-0" />}

        {/* Filename */}
        <span className="flex-1 text-xs text-gray-200 truncate" title={t.filename}>
          {t.filename}
        </span>

        {/* Size */}
        <span className="text-xs text-gray-400 flex-shrink-0">
          {t.totalBytes > 0
            ? `${formatBytes(t.bytesTransferred)} / ${formatBytes(t.totalBytes)}`
            : formatBytes(t.bytesTransferred)}
        </span>

        {/* Speed */}
        {isActive && t.speedBytesPerSecond > 0 && (
          <span className="text-xs text-blue-400 flex-shrink-0 w-20 text-right">
            {formatSpeed(t.speedBytesPerSecond)}
          </span>
        )}

        {/* Status label */}
        <span
          className={`text-xs flex-shrink-0 w-14 text-right ${
            isDone ? 'text-green-400' : isError ? 'text-red-400' : 'text-gray-400'
          }`}
        >
          {t.status === 'pending'
            ? 'Pending'
            : isDone
              ? 'Done'
              : isError
                ? 'Error'
                : `${pct.toFixed(0)}%`}
        </span>
      </div>

      {/* Progress bar */}
      {(isActive || isDone) && (
        <div className="progress-bar ml-4">
          <div
            className={`progress-bar-fill ${isDone ? 'complete' : ''}`}
            style={{ width: `${isDone ? 100 : pct}%` }}
          />
        </div>
      )}

      {/* Error message */}
      {isError && t.error && (
        <div className="mt-0.5 ml-4 text-xs text-red-400">{t.error}</div>
      )}
    </div>
  );
}

export function TransferQueue() {
  const { state } = useApp();

  if (state.transfers.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-gray-600">
        No transfers
      </div>
    );
  }

  return (
    <div className="overflow-y-auto h-full">
      {state.transfers.map(t => (
        <TransferRow key={t.transferId} t={t} />
      ))}
    </div>
  );
}
