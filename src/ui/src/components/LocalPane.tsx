/**
 * LocalPane — left pane showing the local filesystem.
 *
 * Drop target: accepts remote items dragged from RemotePane → triggers download
 *              to the currently displayed local directory.
 * Drag source: local non-directory files can be dragged to RemotePane → upload.
 * Context menu: Upload to remote (when connected), Open Directory.
 */

import { useApp } from '../contexts/AppContext';
import type { FileItem } from '../types';
import type { ContextMenuAction } from './ContextMenu';
import { FilePane } from './FilePane';

export function LocalPane() {
  const { state, navigateLocal, startUpload, startDownload } = useApp();

  const isConnected = state.connectionStatus === 'connected';

  const handleNavigate = (item: FileItem) => {
    if (item.isDirectory) void navigateLocal(item.fullPath);
  };

  const handlePathChange = (path: string) => void navigateLocal(path);

  // Items dropped here are remote items (drag originates from RemotePane).
  // Initiate a download for each non-directory.
  const handleDrop = (droppedItems: FileItem[], _targetPath: string) => {
    for (const item of droppedItems) {
      if (!item.isDirectory) {
        const dest =
          state.localPath.replace(/[/\\]+$/, '') + '\\' + item.name;
        startDownload(item.fullPath, dest);
      }
    }
  };

  const contextMenuItems = (item: FileItem): ContextMenuAction[] => {
    const actions: ContextMenuAction[] = [];

    if (!item.isDirectory && isConnected) {
      actions.push({
        label: '↑  Upload to Remote',
        onClick: () => {
          const dest =
            state.remotePath.replace(/\/+$/, '') + '/' + item.name;
          startUpload(item.fullPath, dest);
        },
      });
      actions.push({ label: '', separator: true, onClick: () => { /* sep */ } });
    }

    if (item.isDirectory) {
      actions.push({
        label: 'Open',
        onClick: () => void navigateLocal(item.fullPath),
      });
    } else {
      actions.push({
        label: 'Open Containing Folder',
        onClick: () => {
          const parent =
            item.fullPath.replace(/[/\\][^/\\]+$/, '') || 'C:\\';
          void navigateLocal(parent);
        },
      });
    }

    return actions;
  };

  return (
    <FilePane
      title="Local"
      paneId="local"
      path={state.localPath}
      items={state.localItems}
      loading={state.localLoading}
      error={state.localError}
      onNavigate={handleNavigate}
      onPathChange={handlePathChange}
      onDrop={handleDrop}
      isDragSource={isConnected}
      contextMenuItems={contextMenuItems}
    />
  );
}
