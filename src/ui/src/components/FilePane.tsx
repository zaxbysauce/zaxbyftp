/**
 * FilePane — generic virtualized file / directory listing.
 *
 * Used by LocalPane and RemotePane.  Renders a path breadcrumb bar above a
 * react-arborist tree used as a flat, virtualized list (childrenAccessor
 * always returns null so no items are expandable; navigation is done by
 * double-clicking a directory, which calls onNavigate).
 */

import React, { useCallback, useRef, useState } from 'react';
import { Tree } from 'react-arborist';
import type { NodeRendererProps } from 'react-arborist';
import {
  File,
  Folder,
  ArrowUp,
  RefreshCw,
  Loader2,
} from 'lucide-react';
import type { FileItem } from '../types';

interface FilePaneProps {
  title: string;
  path: string;
  items: FileItem[];
  loading: boolean;
  error: string | null;
  onNavigate: (item: FileItem) => void;
  onPathChange?: (path: string) => void;
  /** Items dropped here trigger this callback (upload or download). */
  onDrop?: (items: FileItem[], targetPath: string) => void;
  /** Items dragged out from here. */
  isDragSource?: boolean;
  /** Extra toolbar slot (e.g. remote pane "Refresh" can be placed here). */
  extraActions?: React.ReactNode;
}

interface TreeNode extends FileItem {
  id: string;
}

// Column widths (flex-basis)
const COL_NAME = 'flex-1 min-w-0';
const COL_SIZE = 'w-20 text-right flex-shrink-0';
const COL_TYPE = 'w-16 flex-shrink-0';
const COL_DATE = 'w-32 flex-shrink-0';

function formatSize(n: number): string {
  if (n < 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

function formatDate(iso: string): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

function NodeRow({ node, style, dragHandle }: NodeRendererProps<TreeNode>) {
  const item = node.data;
  return (
    <div
      ref={dragHandle}
      style={style}
      className={`file-row ${node.isSelected ? 'selected' : ''} ${node.isFocused ? 'focused' : ''}`}
    >
      {/* Icon + name */}
      <div className={`${COL_NAME} flex items-center gap-1 overflow-hidden`}>
        {item.isDirectory
          ? <Folder size={13} className="text-yellow-400 flex-shrink-0" />
          : <File size={13} className="text-gray-400 flex-shrink-0" />}
        <span className="truncate text-gray-100 text-xs">{item.name}</span>
      </div>
      {/* Size */}
      <div className={`${COL_SIZE} text-xs text-gray-400`}>
        {formatSize(item.size)}
      </div>
      {/* Type */}
      <div className={`${COL_TYPE} text-xs text-gray-500 truncate`}>
        {item.isDirectory ? 'Dir' : (item.name.includes('.') ? item.name.split('.').pop()?.toUpperCase() : 'File')}
      </div>
      {/* Modified */}
      <div className={`${COL_DATE} text-xs text-gray-500`}>
        {formatDate(item.modified)}
      </div>
    </div>
  );
}

export function FilePane({
  title,
  path,
  items,
  loading,
  error,
  onNavigate,
  onPathChange,
  onDrop,
  isDragSource,
  extraActions,
}: FilePaneProps) {
  const [treeHeight, setTreeHeight] = useState(300);
  // Holds the active ResizeObserver so it can be disconnected on unmount.
  const observerRef = useRef<ResizeObserver | null>(null);

  // Callback ref — attaches a ResizeObserver to measure tree container height.
  // When React calls this with null (unmount), the observer is disconnected to
  // avoid accumulating detached observers across mounts/unmounts.
  const treeContainerRef = useCallback((node: HTMLDivElement | null) => {
    if (!node) {
      observerRef.current?.disconnect();
      observerRef.current = null;
      return;
    }
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        setTreeHeight(entry.contentRect.height);
      }
    });
    ro.observe(node);
    observerRef.current = ro;
  }, []);

  // Navigate up one level
  const goUp = () => {
    if (!onPathChange) return;
    const sep = path.includes('/') && !path.includes('\\') ? '/' : '\\';
    const parts = path.replace(/[/\\]+$/, '').split(/[/\\]/);
    if (parts.length <= 1) return;
    parts.pop();
    const parent = parts.join(sep) || sep;
    onPathChange(parent);
  };

  // Drag-and-drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    if (!onDrop) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleDrop = (e: React.DragEvent) => {
    if (!onDrop) return;
    e.preventDefault();
    const raw = e.dataTransfer.getData('application/ftp-items');
    if (!raw) return;
    try {
      const droppedItems = JSON.parse(raw) as FileItem[];
      onDrop(droppedItems, path);
    } catch { /* ignore */ }
  };

  const treeData: TreeNode[] = items.map(i => ({ ...i, id: i.fullPath }));

  return (
    <div
      className="flex flex-col h-full bg-gray-900 border border-gray-700 rounded overflow-hidden"
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Pane header */}
      <div className="flex items-center gap-1 px-2 py-1 bg-gray-800 border-b border-gray-700 flex-shrink-0">
        <span className="text-xs font-semibold text-gray-300 flex-shrink-0">{title}</span>
        <div className="flex-1 flex items-center gap-1 min-w-0">
          <button
            onClick={goUp}
            disabled={!onPathChange}
            className="p-0.5 rounded hover:bg-gray-700 text-gray-400 hover:text-gray-100 disabled:opacity-30"
            title="Go up"
          >
            <ArrowUp size={12} />
          </button>
          {/* Path bar */}
          <div
            className="flex-1 min-w-0 px-1 py-0.5 rounded text-xs text-gray-300 bg-gray-700 truncate"
            title={path}
          >
            {path}
          </div>
        </div>
        {loading && <Loader2 size={12} className="animate-spin text-blue-400 flex-shrink-0" />}
        {extraActions}
        <button
          onClick={() => onPathChange?.(path)}
          className="p-0.5 rounded hover:bg-gray-700 text-gray-400 hover:text-gray-100"
          title="Refresh"
        >
          <RefreshCw size={12} />
        </button>
      </div>

      {/* Column headers */}
      <div className="flex items-center px-1 py-0.5 bg-gray-800 border-b border-gray-700 flex-shrink-0">
        <div className={`${COL_NAME} text-xs text-gray-500 font-medium px-1`}>Name</div>
        <div className={`${COL_SIZE} text-xs text-gray-500 font-medium`}>Size</div>
        <div className={`${COL_TYPE} text-xs text-gray-500 font-medium pl-1`}>Type</div>
        <div className={`${COL_DATE} text-xs text-gray-500 font-medium pl-1`}>Modified</div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="px-2 py-1 text-xs text-red-400 bg-red-900/20 border-b border-red-800/30 flex-shrink-0">
          {error}
        </div>
      )}

      {/* Tree / empty state */}
      <div
        ref={treeContainerRef}
        className="flex-1 overflow-hidden"
        onDoubleClick={() => {
          // Double-click on a directory navigates into it.
          // react-arborist fires onActivate but we also listen here as fallback.
        }}
      >
        {loading && items.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-500 text-xs">
            <Loader2 size={16} className="animate-spin mr-2" /> Loading…
          </div>
        ) : items.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-600 text-xs">
            Empty directory
          </div>
        ) : (
          <Tree<TreeNode>
            data={treeData}
            idAccessor="id"
            childrenAccessor={() => null}
            height={treeHeight}
            rowHeight={22}
            indent={0}
            onActivate={(node) => {
              const item = node.data;
              if (item.isDirectory) {
                onNavigate(item);
              }
            }}
            disableDrop
            {...(isDragSource ? {
              onMove: () => { /* no internal moves */ },
            } : {})}
          >
            {NodeRow}
          </Tree>
        )}
      </div>
    </div>
  );
}
