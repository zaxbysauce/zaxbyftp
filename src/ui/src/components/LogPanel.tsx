/**
 * LogPanel — append-only scrolling log of all API calls and events.
 */

import { useEffect, useRef } from 'react';
import { useApp } from '../contexts/AppContext';

export function LogPanel() {
  const { state } = useApp();
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new entries.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [state.logs.length]);

  if (state.logs.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-gray-600">
        No log entries
      </div>
    );
  }

  return (
    <div className="overflow-y-auto h-full font-mono text-xs p-2 space-y-0.5">
      {state.logs.map(entry => (
        <div
          key={entry.id}
          className={`flex gap-2 ${
            entry.level === 'error'
              ? 'text-red-400'
              : entry.level === 'warn'
                ? 'text-yellow-400'
                : 'text-gray-300'
          }`}
        >
          <span className="text-gray-600 flex-shrink-0">
            {entry.timestamp.toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            })}
          </span>
          <span className="break-all">{entry.message}</span>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
