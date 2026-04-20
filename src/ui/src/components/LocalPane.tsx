/**
 * LocalPane — left pane showing the local filesystem.
 *
 * Wired to AppContext.navigateLocal and allows dragging items out (for upload)
 * and dropping items in (triggers download from remote → local).
 */

import { FilePane } from './FilePane';
import { useApp } from '../contexts/AppContext';
import type { FileItem } from '../types';

export function LocalPane() {
  const { state, navigateLocal, startDownload } = useApp();

  const handleNavigate = (item: FileItem) => {
    if (item.isDirectory) {
      void navigateLocal(item.fullPath);
    }
  };

  const handlePathChange = (path: string) => {
    void navigateLocal(path);
  };

  // Items dropped here are remote items being downloaded.
  const handleDrop = (droppedItems: FileItem[], _targetPath: string) => {
    for (const item of droppedItems) {
      if (!item.isDirectory) {
        const filename = item.name;
        const localDest = state.localPath.replace(/[/\\]$/, '') + '\\' + filename;
        startDownload(item.fullPath, localDest);
      }
    }
  };

  return (
    <FilePane
      title="Local"
      path={state.localPath}
      items={state.localItems}
      loading={state.localLoading}
      error={state.localError}
      onNavigate={handleNavigate}
      onPathChange={handlePathChange}
      onDrop={handleDrop}
      isDragSource
    />
  );
}
