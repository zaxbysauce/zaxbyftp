/**
 * BottomPanel — tabbed panel: Transfers | Log | Messages.
 *
 * "Messages" tab shows host-key mismatch prompts and warnings.
 */

import {
  ArrowLeftRight,
  ScrollText,
  AlertTriangle,
  ShieldAlert,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { TransferQueue } from './TransferQueue';
import { LogPanel } from './LogPanel';

const TABS = [
  { key: 'transfers' as const, label: 'Transfers', Icon: ArrowLeftRight },
  { key: 'log'       as const, label: 'Log',       Icon: ScrollText },
  { key: 'messages'  as const, label: 'Messages',  Icon: AlertTriangle },
];

export function BottomPanel() {
  const { state, setBottomTab, trustHost, rejectHost, trustCert, rejectCert } = useApp();
  const { activeBottomTab, hostKeyPrompt, certPrompt, transfers } = state;

  const activeCount = transfers.filter(t => t.status === 'active').length;
  const hasPrompt = !!hostKeyPrompt || !!certPrompt;

  return (
    <div className="flex flex-col h-full bg-gray-900 border-t border-gray-700">
      {/* Tab bar */}
      <div className="flex items-center gap-0 border-b border-gray-700 flex-shrink-0 bg-gray-800">
        {TABS.map(({ key, label, Icon }) => {
          const isActive = activeBottomTab === key;
          const badge =
            key === 'transfers' && activeCount > 0
              ? activeCount
              : key === 'messages' && hasPrompt
                ? '!'
                : null;
          return (
            <button
              key={key}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs border-r border-gray-700 transition-colors ${
                isActive
                  ? 'bg-gray-900 text-blue-400 border-b-2 border-b-blue-400'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700'
              }`}
              onClick={() => setBottomTab(key)}
            >
              <Icon size={12} />
              {label}
              {badge !== null && (
                <span className="ml-0.5 px-1 py-0.5 rounded-full bg-blue-600 text-white text-[10px] leading-none">
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden">
        {activeBottomTab === 'transfers' && <TransferQueue />}
        {activeBottomTab === 'log' && <LogPanel />}
        {activeBottomTab === 'messages' && (
          <MessagesPanel
            hostKeyPrompt={hostKeyPrompt}
            certPrompt={certPrompt}
            onTrustHost={trustHost}
            onRejectHost={rejectHost}
            onTrustCert={trustCert}
            onRejectCert={rejectCert}
          />
        )}
      </div>
    </div>
  );
}

// ── Messages panel ───────────────────────────────────────────────────────────

interface MessagesPanelProps {
  hostKeyPrompt: { host: string; fingerprint: string } | null;
  certPrompt: { host: string; fingerprint: string } | null;
  onTrustHost: () => void;
  onRejectHost: () => void;
  onTrustCert: () => void;
  onRejectCert: () => void;
}

function MessagesPanel({
  hostKeyPrompt,
  certPrompt,
  onTrustHost,
  onRejectHost,
  onTrustCert,
  onRejectCert,
}: MessagesPanelProps) {
  if (!hostKeyPrompt && !certPrompt) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-gray-600">
        No pending messages
      </div>
    );
  }

  return (
    <div className="p-3 space-y-2 overflow-y-auto h-full">

      {/* ── SSH host key mismatch ── */}
      {hostKeyPrompt && (
        <div className="flex items-start gap-3 p-3 rounded bg-yellow-900/20 border border-yellow-700/40">
          <ShieldAlert size={20} className="text-yellow-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-yellow-300 mb-1">
              Host Key Changed — {hostKeyPrompt.host}
            </p>
            <p className="text-xs text-gray-300 mb-1">
              The server's SSH fingerprint has changed since your last connection.
              This could indicate a man-in-the-middle attack.
            </p>
            <p className="text-xs font-mono text-gray-400 break-all mb-2">
              {hostKeyPrompt.fingerprint}
            </p>
            <div className="flex gap-2">
              <button
                className="flex items-center gap-1 px-3 py-1 rounded text-xs bg-green-700 hover:bg-green-600 text-white font-medium"
                onClick={onTrustHost}
              >
                <CheckCircle size={12} /> Trust and Continue
              </button>
              <button
                className="flex items-center gap-1 px-3 py-1 rounded text-xs bg-red-700 hover:bg-red-600 text-white font-medium"
                onClick={onRejectHost}
              >
                <XCircle size={12} /> Reject
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── FTPS certificate prompt ── */}
      {certPrompt && (
        <div className="flex items-start gap-3 p-3 rounded bg-blue-900/20 border border-blue-700/40">
          <ShieldAlert size={20} className="text-blue-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-blue-300 mb-1">
              Untrusted FTPS Certificate — {certPrompt.host}
            </p>
            <p className="text-xs text-gray-300 mb-1">
              The server presented a certificate that has not been seen before.
              Verify the fingerprint with your server administrator before trusting.
            </p>
            <p className="text-xs font-mono text-gray-400 break-all mb-2">
              SHA-256: {certPrompt.fingerprint}
            </p>
            <div className="flex gap-2">
              <button
                className="flex items-center gap-1 px-3 py-1 rounded text-xs bg-green-700 hover:bg-green-600 text-white font-medium"
                onClick={onTrustCert}
              >
                <CheckCircle size={12} /> Trust and Continue
              </button>
              <button
                className="flex items-center gap-1 px-3 py-1 rounded text-xs bg-red-700 hover:bg-red-600 text-white font-medium"
                onClick={onRejectCert}
              >
                <XCircle size={12} /> Reject
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
