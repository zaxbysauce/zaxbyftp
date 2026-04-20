/**
 * FilePane — generic virtualized file / directory listing.
 *
 * Used by LocalPane and RemotePane.  Renders a path breadcrumb bar above a
 * react-arborist tree used as a flat, virtualized list (childrenAccessor
 * always returns null so no items are expandable; navigation is done by
 * double-clicking a directory, which calls onNavigate).
 *
 * Drag-and-drop
 * ─────────────
 * react-arborist's built-in DnD is disabled (disableDrag/disableDrop) so it
 * does not conflict with native HTML5 drag events.  When isDragSource is true,
 * each non-directory row is natively draggable; the data is serialised as:
 *   application/ftp-items  →  { pane: 'local' | 'remote', items: FileItem[] }
 *
 * Context menus
 * ─────────────
 * Callers supply a contextMenuItems callback; FilePane handles rendering and
 * positioning via a fixed-positioned ContextMenu overlay.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from 'react';
import { Tree } from 'react-arborist';
import type { NodeRendererProps } from 'react-arborist';
import { ArrowUp, File, Folder, Loader2, RefreshCw } from 'lucide-react';
import type { FileItem } from '../types';
import type { ContextMenuAction } from './ContextMenu';
import { ContextMenu } from './ContextMenu';

// ── Per-pane context (passed from FilePane → NodeRow without prop-drilling) ──

interface PaneCtxValue {
  isDragSource: boolean;
  paneId: 'local' | 'remote';
  onContextMenuRequest: (item: FileItem, x: number, y: number) => void;
}

const PaneCtx = createContext<PaneCtxValue>({
  isDragSource: false,
  paneId: 'local',
  onContextMenuRequest: () => { /* no-op */ },
});

// ── Column definitions ───────────────────────────────────────────────────────

const COL_NAME = 'flex-1 min-w-0';
const COL_SIZE = 'w-20 text-right flex-shrink-0';
const COL_TYPE = 'w-14 flex-shrink-0';
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
    return (
      d.toLocaleDateString() +
      ' ' +
      d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    );
  } catch {
    return iso;
  }
}

// ── TreeNode shape used by react-arborist ────────────────────────────────────

interface TreeNode extends FileItem {
  id: string;
}

// ── Row renderer ─────────────────────────────────────────────────────────────

function NodeRow({ node, style, dragHandle }: NodeRendererProps<TreeNode>) {
  const { isDragSource, paneId, onContextMenuRequest } = useContext(PaneCtx);
  const item = node.data;

  return (
    <div
      ref={dragHandle}
      style={style}
      className={`file-row ${node.isSelected ? 'selected' : ''} ${node.isFocused ? 'focused' : ''}`}
      // ── Native HTML5 drag source ──────────────────────────────────────
      draggable={isDragSource && !item.isDirectory}
      onDragStart={(e) => {
        if (!isDragSource || item.isDirectory) return;
        e.dataTransfer.setData(
          'application/ftp-items',
          JSON.stringify({ pane: paneId, items: [item] }),
        );
        e.dataTransfer.effectAllowed = 'copy';
      }}
      // ── Context menu trigger ──────────────────────────────────────────
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenuRequest(item, e.clientX, e.clientY);
      }}
    >
      {/* Icon + name */}
      <div className={`${COL_NAME} flex items-center gap-1 overflow-hidden`}>
        {item.isDirectory
          ? <Folder size={13} className="text-yellow-400 flex-shrink-0" />
          : <File    size={13} className="text-gray-400  flex-shrink-0" />}
        <span className="truncate text-gray-100 text-xs">{item.name}</span>
      </div>
      {/* Size */}
      <div className={`${COL_SIZE} text-xs text-gray-400`}>
        {formatSize(item.size)}
      </div>
      {/* Type */}
      <div className={`${COL_TYPE} text-xs text-gray-500 truncate pl-1`}>
        {item.isDirectory
          ? 'Dir'
          : item.name.includes('.')
            ? item.name.split('.').pop()?.toUpperCase()
            : 'File'}
      </div>
      {/* Modified */}
      <div className={`${COL_DATE} text-xs text-gray-500 pl-1`}>
        {formatDate(item.modified)}
      </div>
    </div>
  );
}

// ── FilePane component ───────────────────────────────────────────────────────

export interface FilePaneProps {
  title: string;
  /** 'local' or 'remote' — used to tag drag payloads and prevent self-drops. */
  paneId: 'local' | 'remote';
  path: string;
  items: FileItem[];
  loading: boolean;
  error: string | null;
  /** Called when the user activates (double-clicks) a directory row. */
  onNavigate: (item: FileItem) => void;
  /** Called when the user navigates up or refreshes.  Path arg = target path. */
  onPathChange: (path: string) => void;
  /**
   * Called when the user drops items from the OTHER pane onto this pane.
   * The items array contains whatever was serialised in the drag payload from
   * the source pane — treat them accordingly (remote items for local pane = download,
   * local items for remote pane = upload).
   */
  onDrop?: (items: FileItem[], targetPath: string) => void;
  /** When true, non-directory rows are natively draggable. */
  isDragSource?: boolean;
  /** Returns context-menu items for a right-clicked file/directory. */
  contextMenuItems?: (item: FileItem) => ContextMenuAction[];
  /** Optional extra controls inserted into the header toolbar. */
  extraActions?: React.ReactNode;
}

export function FilePane({
  title,
  paneId,
  path,
  items,
  loading,
  error,
  onNavigate,
  onPathChange,
  onDrop,
  isDragSource = false,
  contextMenuItems,
  extraActions,
}: FilePaneProps) {
  const [treeHeight, setTreeHeight] = useState(300);
  const observerRef = useRef<ResizeObserver | null>(null);

  // Context menu state
  const [ctxMenu, setCtxMenu] = useState<{
    x: number;
    y: number;
    item: FileItem;
  } | null>(null);

  // Callback ref — attaches a ResizeObserver to measure the tree container.
  // Disconnected on unmount to avoid observer accumulation.
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

  // Context menu request from NodeRow
  const handleContextMenuRequest = useCallback(
    (item: FileItem, x: number, y: number) => {
      if (!contextMenuItems) return;
      setCtxMenu({ x, y, item });
    },
    [contextMenuItems],
  );

  // Navigate up one directory level
  const goUp = () => {
    const sep = !path.includes('\\') ? '/' : '\\';
    const trimmed = path.replace(/[/\\]+$/, '');
    const lastSep = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'));
    if (lastSep <= 0) {
      onPathChange(sep);
      return;
    }
    onPathChange(trimmed.slice(0, lastSep) || sep);
  };

  // Drop handler — ignore drops from the same pane
  const handleDragOver = (e: React.DragEvent) => {
    if (!onDrop) return;
    const raw = e.dataTransfer.types.includes('application/ftp-items');
    if (!raw) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleDrop = (e: React.DragEvent) => {
    if (!onDrop) return;
    e.preventDefault();
    const raw = e.dataTransfer.getData('application/ftp-items');
    if (!raw) return;
    try {
      const payload = JSON.parse(raw) as { pane: string; items: FileItem[] };
      // Ignore drops from the same pane (can't upload to yourself, etc.)
      if (payload.pane === paneId) return;
      onDrop(payload.items, path);
    } catch { /* ignore malformed payload */ }
  };

  const treeData: TreeNode[] = items.map(i => ({ ...i, id: i.fullPath }));

  const ctxItems = ctxMenu && contextMenuItems ? contextMenuItems(ctxMenu.item) : [];

  return (
    <PaneCtx.Provider
      value={{
        isDragSource,
        paneId,
        onContextMenuRequest: handleContextMenuRequest,
      }}
    >
      <div
        className="flex flex-col h-full bg-gray-900 border border-gray-700 rounded overflow-hidden"
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {/* ── Header ── */}
        <div className="flex items-center gap-1 px-2 py-1 bg-gray-800 border-b border-gray-700 flex-shrink-0">
          <span className="text-xs font-semibold text-gray-300 flex-shrink-0">
            {title}
          </span>
          <div className="flex-1 flex items-center gap-1 min-w-0">
            <button
              onClick={goUp}
              className="p-0.5 rounded hover:bg-gray-700 text-gray-400 hover:text-gray-100"
              title="Go up"
            >
              <ArrowUp size={12} />
            </button>
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
            onClick={() => onPathChange(path)}
            className="p-0.5 rounded hover:bg-gray-700 text-gray-400 hover:text-gray-100"
            title="Refresh"
          >
            <RefreshCw size={12} />
          </button>
        </div>

        {/* ── Column headers ── */}
        <div className="flex items-center px-1 py-0.5 bg-gray-800 border-b border-gray-700 flex-shrink-0">
          <div className={`${COL_NAME} text-xs text-gray-500 font-medium px-1`}>Name</div>
          <div className={`${COL_SIZE} text-xs text-gray-500 font-medium`}>Size</div>
          <div className={`${COL_TYPE} text-xs text-gray-500 font-medium pl-1`}>Type</div>
          <div className={`${COL_DATE} text-xs text-gray-500 font-medium pl-1`}>Modified</div>
        </div>

        {/* ── Error banner ── */}
        {error && (
          <div className="px-2 py-1 text-xs text-red-400 bg-red-900/20 border-b border-red-800/30 flex-shrink-0">
            {error}
          </div>
        )}

        {/* ── Tree / empty state ── */}
        <div ref={treeContainerRef} className="flex-1 overflow-hidden">
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
              // Disable react-arborist's internal DnD; we use native HTML5 DnD.
              disableDrag
              disableDrop
              onActivate={(node) => {
                if (node.data.isDirectory) onNavigate(node.data);
              }}
            >
              {NodeRow}
            </Tree>
          )}
        </div>
      </div>

      {/* ── Context menu (rendered outside the overflow-hidden container) ── */}
      {ctxMenu && ctxItems.length > 0 && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          items={ctxItems}
          onClose={() => setCtxMenu(null)}
        />
      )}
    </PaneCtx.Provider>
  );
}
