/**
 * TopBar — title-bar chrome + site manager dropdown + QuickConnect form.
 *
 * The entire row is draggable (fires the WPF DragMove action) except for
 * interactive controls.  Window chrome buttons sit at the far right.
 */

import React, { useState } from 'react';
import {
  ChevronDown,
  Globe,
  Loader2,
  Minus,
  Maximize2,
  X,
} from 'lucide-react';
import { windowAction } from '../api/bridge';
import { useApp } from '../contexts/AppContext';
import type { Protocol, Site } from '../types';

const PROTOCOLS: { value: Protocol; label: string }[] = [
  { value: 'ftp', label: 'FTP' },
  { value: 'ftps-explicit', label: 'FTPS (Explicit)' },
  { value: 'ftps-implicit', label: 'FTPS (Implicit)' },
  { value: 'sftp', label: 'SFTP' },
];

export function TopBar() {
  const { state, connect, disconnect, saveSite } = useApp();

  // QuickConnect form state
  const [host, setHost] = useState('');
  const [port, setPort] = useState('');
  const [protocol, setProtocol] = useState<Protocol>('ftp');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [siteName, setSiteName] = useState('');
  const [showSites, setShowSites] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);

  const isConnecting = state.connectionStatus === 'connecting';
  const isConnected = state.connectionStatus === 'connected';

  // Default port when protocol changes
  const handleProtocolChange = (p: Protocol) => {
    setProtocol(p);
    if (!port || isDefaultPort(port, protocol)) {
      setPort(defaultPort(p));
    }
  };

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!host) return;
    const portNum = parseInt(port || defaultPort(protocol), 10);
    await connect(host, portNum, username, password, protocol);
  };

  const handleDisconnect = async () => {
    await disconnect();
  };

  const handleSelectSite = (site: Site) => {
    setHost(site.host);
    setPort(site.port);
    setProtocol(site.protocol);
    setUsername(site.username);
    setPassword(site.password ?? '');
    setShowSites(false);
  };

  const handleSaveSite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!siteName || !host) return;
    await saveSite({
      name: siteName,
      host,
      port: port || defaultPort(protocol),
      protocol,
      username,
      password,
    });
    setShowSaveModal(false);
    setSiteName('');
  };

  return (
    <div
      className="flex items-center gap-2 px-2 py-1 bg-gray-900 border-b border-gray-700 select-none"
      style={{ height: 44, minHeight: 44 }}
      onMouseDown={(e) => {
        // Drag window from the bar background (not from inputs/buttons).
        if ((e.target as HTMLElement).closest('input,button,select,a')) return;
        if (e.button !== 0) return;
        windowAction('dragWindow');
      }}
    >
      {/* App icon + title */}
      <Globe size={16} className="text-blue-400 flex-shrink-0" />
      <span className="text-xs font-semibold text-gray-300 mr-2 flex-shrink-0 hidden sm:block">
        FTP Client
      </span>

      {/* Site Manager dropdown */}
      <div className="relative flex-shrink-0">
        <button
          className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-600"
          onClick={() => setShowSites(v => !v)}
        >
          Sites <ChevronDown size={12} />
        </button>
        {showSites && (
          <div className="absolute top-full left-0 mt-1 w-56 bg-gray-800 border border-gray-600 rounded shadow-lg z-50">
            {state.sites.length === 0 ? (
              <div className="px-3 py-2 text-xs text-gray-400">No saved sites</div>
            ) : (
              state.sites.map(s => (
                <button
                  key={s.name}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-gray-700 text-gray-200 truncate"
                  onClick={() => handleSelectSite(s)}
                >
                  <span className="text-blue-400">[{s.protocol.toUpperCase()}]</span>{' '}
                  {s.name}
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* QuickConnect form */}
      <form
        className="flex items-center gap-1 flex-1 min-w-0"
        onSubmit={handleConnect}
      >
        <input
          type="text"
          placeholder="Host"
          value={host}
          onChange={e => setHost(e.target.value)}
          className="flex-1 min-w-0 px-2 py-1 rounded text-xs bg-gray-800 border border-gray-600 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500"
          style={{ minWidth: 80 }}
        />
        <input
          type="number"
          placeholder={defaultPort(protocol)}
          value={port}
          onChange={e => setPort(e.target.value)}
          className="w-14 px-2 py-1 rounded text-xs bg-gray-800 border border-gray-600 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500"
        />
        <select
          value={protocol}
          onChange={e => handleProtocolChange(e.target.value as Protocol)}
          className="px-1 py-1 rounded text-xs bg-gray-800 border border-gray-600 text-gray-100 focus:outline-none focus:border-blue-500"
        >
          {PROTOCOLS.map(p => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Username"
          value={username}
          onChange={e => setUsername(e.target.value)}
          className="w-24 px-2 py-1 rounded text-xs bg-gray-800 border border-gray-600 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500"
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          className="w-24 px-2 py-1 rounded text-xs bg-gray-800 border border-gray-600 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500"
        />

        {isConnected ? (
          <button
            type="button"
            onClick={handleDisconnect}
            className="px-3 py-1 rounded text-xs bg-red-700 hover:bg-red-600 text-white font-medium flex-shrink-0"
          >
            Disconnect
          </button>
        ) : (
          <button
            type="submit"
            disabled={isConnecting || !host}
            className="px-3 py-1 rounded text-xs bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium flex-shrink-0 flex items-center gap-1"
          >
            {isConnecting && <Loader2 size={10} className="animate-spin" />}
            {isConnecting ? 'Connecting…' : 'Connect'}
          </button>
        )}

        {/* Save current connection as site */}
        {host && (
          <button
            type="button"
            onClick={() => setShowSaveModal(true)}
            className="px-2 py-1 rounded text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 flex-shrink-0"
            title="Save current connection"
          >
            Save
          </button>
        )}
      </form>

      {/* Connection status badge */}
      {state.connectionStatus === 'error' && (
        <span className="text-xs text-red-400 flex-shrink-0 max-w-32 truncate" title={state.connectionError ?? ''}>
          Error
        </span>
      )}
      {isConnected && (
        <span className="text-xs text-green-400 flex-shrink-0">Connected</span>
      )}

      {/* Window chrome buttons */}
      <div className="flex items-center gap-0.5 ml-2 flex-shrink-0">
        <button
          className="p-1.5 rounded hover:bg-gray-700 text-gray-400 hover:text-gray-100"
          onClick={() => windowAction('minimizeWindow')}
          title="Minimize"
        >
          <Minus size={12} />
        </button>
        <button
          className="p-1.5 rounded hover:bg-gray-700 text-gray-400 hover:text-gray-100"
          onClick={() => windowAction('maximizeWindow')}
          title="Maximize / Restore"
        >
          <Maximize2 size={12} />
        </button>
        <button
          className="p-1.5 rounded hover:bg-red-600 text-gray-400 hover:text-white"
          onClick={() => windowAction('closeWindow')}
          title="Close"
        >
          <X size={12} />
        </button>
      </div>

      {/* Save-site modal */}
      {showSaveModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <form
            className="bg-gray-800 border border-gray-600 rounded p-4 w-72 shadow-xl"
            onSubmit={handleSaveSite}
          >
            <h3 className="text-sm font-semibold text-gray-100 mb-3">Save Site</h3>
            <label className="block text-xs text-gray-400 mb-1">Site name</label>
            <input
              autoFocus
              type="text"
              value={siteName}
              onChange={e => setSiteName(e.target.value)}
              placeholder={host}
              className="w-full px-2 py-1 rounded text-xs bg-gray-700 border border-gray-600 text-gray-100 focus:outline-none focus:border-blue-500 mb-3"
            />
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setShowSaveModal(false)}
                className="px-3 py-1 rounded text-xs bg-gray-700 hover:bg-gray-600 text-gray-300"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!siteName}
                className="px-3 py-1 rounded text-xs bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white"
              >
                Save
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function defaultPort(p: Protocol): string {
  switch (p) {
    case 'ftps-implicit': return '990';
    case 'sftp':          return '22';
    default:              return '21';
  }
}

function isDefaultPort(p: string, proto: Protocol): boolean {
  return p === defaultPort(proto);
}
