/**
 * RemotePane — right pane showing the remote filesystem.
 *
 * Only active when a session is connected.  Allows dragging items out (download)
 * and dropping local items in (upload).
 */

import { Wifi, WifiOff } from 'lucide-react';
import { FilePane } from './FilePane';
import { useApp } from '../contexts/AppContext';
import type { FileItem } from '../types';

export function RemotePane() {
  const { state, navigateRemote, startUpload } = useApp();

  const isConnected = state.connectionStatus === 'connected';

  const handleNavigate = (item: FileItem) => {
    if (item.isDirectory) {
      void navigateRemote(item.fullPath);
    }
  };

  const handlePathChange = (path: string) => {
    void navigateRemote(path);
  };

  // Items dropped here are local items being uploaded.
  const handleDrop = (droppedItems: FileItem[], targetPath: string) => {
    for (const item of droppedItems) {
      if (!item.isDirectory) {
        const remoteDest = targetPath.replace(/\/$/, '') + '/' + item.name;
        startUpload(item.fullPath, remoteDest);
      }
    }
  };

  if (!isConnected) {
    return (
      <div className="flex flex-col h-full bg-gray-900 border border-gray-700 rounded overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-1 px-2 py-1 bg-gray-800 border-b border-gray-700 flex-shrink-0">
          <span className="text-xs font-semibold text-gray-300">Remote</span>
        </div>

        {/* Placeholder */}
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

  return (
    <FilePane
      title="Remote"
      path={state.remotePath}
      items={state.remoteItems}
      loading={state.remoteLoading}
      error={state.remoteError}
      onNavigate={handleNavigate}
      onPathChange={handlePathChange}
      onDrop={handleDrop}
      isDragSource
    />
  );
}
