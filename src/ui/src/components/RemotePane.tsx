/**
 * RemotePane — right pane showing the remote filesystem.
 *
 * Drop target: accepts local items dragged from LocalPane → triggers upload
 *              to the currently displayed remote directory.
 * Drag source: remote non-directory files can be dragged to LocalPane → download.
 * Context menu: Download, ─── , New Folder, Rename, ─── , Delete.
 * Modals: mkdir (overlay), rename (overlay) — inline within this component.
 */

import React, { useState } from 'react';
import { FolderPlus, Wifi, WifiOff } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import type { FileItem } from '../types';
import type { ContextMenuAction } from './ContextMenu';
import { FilePane } from './FilePane';
import { ConfirmDialog } from './ConfirmDialog';

// ── Modal helpers ────────────────────────────────────────────────────────────

interface ModalInputProps {
  title: string;
  label: string;
  defaultValue?: string;
  confirmLabel: string;
  /** May be async; any thrown error is silently caught (AppContext logs it). */
  onConfirm: (value: string) => void | Promise<void>;
  onCancel: () => void;
}

function ModalInput({
  title,
  label,
  defaultValue = '',
  confirmLabel,
  onConfirm,
  onCancel,
}: ModalInputProps) {
  const [value, setValue] = useState(defaultValue);

  // Async submit: awaits the onConfirm Promise so errors surface in the log
  // rather than being silently dropped by an unhandled Promise rejection.
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    void Promise.resolve(onConfirm(trimmed)).catch(() => {
      // AppContext already logs the error via addLog; swallow here to prevent
      // an unhandled rejection that would surface as a console error.
    });
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <form
        className="bg-gray-800 border border-gray-600 rounded p-4 w-72 shadow-xl"
        onSubmit={submit}
      >
        <h3 className="text-sm font-semibold text-gray-100 mb-3">{title}</h3>
        <label className="block text-xs text-gray-400 mb-1">{label}</label>
        <input
          autoFocus
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="w-full px-2 py-1 rounded text-xs bg-gray-700 border border-gray-600
                     text-gray-100 focus:outline-none focus:border-blue-500 mb-3"
        />
        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1 rounded text-xs bg-gray-700 hover:bg-gray-600 text-gray-300"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!value.trim()}
            className="px-3 py-1 rounded text-xs bg-blue-600 hover:bg-blue-500
                       disabled:opacity-50 text-white"
          >
            {confirmLabel}
          </button>
        </div>
      </form>
    </div>
  );
}

// ── RemotePane ────────────────────────────────────────────────────────────────

export function RemotePane() {
  const {
    state,
    navigateRemote,
    startUpload,
    startDownload,
    mkdirRemote,
    renameRemote,
    deleteRemote,
  } = useApp();

  const isConnected = state.connectionStatus === 'connected';

  // Modal state
  const [mkdirOpen, setMkdirOpen]   = useState(false);
  const [renaming, setRenaming]     = useState<FileItem | null>(null);
  const [pendingDelete, setPendingDelete] = useState<FileItem | null>(null);

  // ── Navigation ──────────────────────────────────────────────────────────
  const handleNavigate = (item: FileItem) => {
    if (item.isDirectory) void navigateRemote(item.fullPath);
  };

  const handlePathChange = (path: string) => void navigateRemote(path);

  // ── Drag-and-drop ────────────────────────────────────────────────────────
  // Items dropped here are local items (drag originates from LocalPane).
  const handleDrop = (droppedItems: FileItem[], targetPath: string) => {
    for (const item of droppedItems) {
      if (!item.isDirectory) {
        const dest = targetPath.replace(/\/+$/, '') + '/' + item.name;
        startUpload(item.fullPath, dest);
      }
    }
  };

  // ── Context menu ──────────────────────────────────────────────────────────
  const contextMenuItems = (item: FileItem): ContextMenuAction[] => {
    const actions: ContextMenuAction[] = [];

    if (!item.isDirectory) {
      actions.push({
        label: '↓  Download',
        onClick: () => {
          const dest =
            state.localPath.replace(/[/\\]+$/, '') + '\\' + item.name;
          startDownload(item.fullPath, dest);
        },
      });
    } else {
      actions.push({
        label: 'Open',
        onClick: () => void navigateRemote(item.fullPath),
      });
    }

    actions.push({ label: '', separator: true, onClick: () => { /* sep */ } });

    actions.push({
      label: '📁  New Folder Here',
      onClick: () => setMkdirOpen(true),
    });

    actions.push({
      label: 'Rename…',
      onClick: () => setRenaming(item),
    });

    actions.push({ label: '', separator: true, onClick: () => { /* sep */ } });

    actions.push({
      label: 'Delete',
      danger: true,
      onClick: () => {
        setPendingDelete(item);
      },
    });

    return actions;
  };

  // ── Not-connected placeholder ─────────────────────────────────────────────
  if (!isConnected) {
    return (
      <div className="flex flex-col h-full bg-gray-900 border border-gray-700 rounded overflow-hidden">
        <div className="flex items-center gap-1 px-2 py-1 bg-gray-800 border-b border-gray-700 flex-shrink-0">
          <span className="text-xs font-semibold text-gray-300">Remote</span>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center gap-2 text-gray-600">
          {state.connectionStatus === 'connecting' ? (
            <>
              <Wifi size={32} className="text-blue-500 animate-pulse" />
              <span className="text-xs">Connecting…</span>
            </>
          ) : (
            <>
              <WifiOff size={32} />
              <span className="text-xs">Not connected</span>
              {state.connectionError && (
                <span className="text-xs text-red-400 max-w-48 text-center">
                  {state.connectionError}
                </span>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  // ── Connected ─────────────────────────────────────────────────────────────
  return (
    <>
      <FilePane
        title="Remote"
        paneId="remote"
        path={state.remotePath}
        items={state.remoteItems}
        loading={state.remoteLoading}
        error={state.remoteError}
        onNavigate={handleNavigate}
        onPathChange={handlePathChange}
        onDrop={handleDrop}
        isDragSource
        onFileDoubleClick={(item) => startDownload(item.fullPath, state.localPath)}
        contextMenuItems={contextMenuItems}
        extraActions={
          <button
            onClick={() => setMkdirOpen(true)}
            className="p-0.5 rounded hover:bg-gray-700 text-gray-400 hover:text-gray-100"
            title="New Folder"
          >
            <FolderPlus size={12} />
          </button>
        }
      />

      {/* ── Mkdir modal ── */}
      {mkdirOpen && (
        <ModalInput
          title="New Folder"
          label="Folder name"
          confirmLabel="Create"
          onConfirm={async (name) => {
            setMkdirOpen(false);
            await mkdirRemote(state.remotePath, name);
          }}
          onCancel={() => setMkdirOpen(false)}
        />
      )}

      {/* ── Rename modal ── */}
      {renaming && (
        <ModalInput
          title="Rename"
          label="New name"
          defaultValue={renaming.name}
          confirmLabel="Rename"
          onConfirm={async (newName) => {
            const dir = renaming.fullPath.replace(/\/[^/]+$/, '') || '/';
            const newPath = dir.replace(/\/+$/, '') + '/' + newName;
            setRenaming(null);
            await renameRemote(renaming.fullPath, newPath);
          }}
          onCancel={() => setRenaming(null)}
        />
      )}

      {/* ── Delete confirmation ── */}
      {pendingDelete && (
        <ConfirmDialog
          title="Delete Item"
          message={`Delete "${pendingDelete.name}"${
            pendingDelete.isDirectory ? ' and all its contents' : ''
          }? This cannot be undone.`}
          confirmLabel="Delete"
          danger
          onConfirm={() => {
            void deleteRemote(pendingDelete.fullPath);
            setPendingDelete(null);
          }}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </>
  );
}
