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
import { ArrowUp, Loader2, RefreshCw } from 'lucide-react';
import { getFileIcon, FOLDER_ICON } from '../utils/fileIcons';
import type { FileItem } from '../types';
import type { ContextMenuAction } from './ContextMenu';
import { ContextMenu } from './ContextMenu';

// ── Per-pane context (passed from FilePane → NodeRow without prop-drilling) ──

interface PaneCtxValue {
  isDragSource: boolean;
  paneId: 'local' | 'remote';
  onContextMenuRequest: (item: FileItem, x: number, y: number) => void;
  colWidths: { size: number; type: number; date: number };
}

const PaneCtx = createContext<PaneCtxValue>({
  isDragSource: false,
  paneId: 'local',
  onContextMenuRequest: () => { /* no-op */ },
  colWidths: { size: 80, type: 56, date: 128 },
});

// ── Column resize handle ─────────────────────────────────────────────────────

function ColResizeHandle({
  onMouseDown,
  onKeyDown,
  label,
  currentWidth,
}: {
  onMouseDown: (e: React.MouseEvent) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  label: string;
  currentWidth: number;
}) {
  return (
    <div
      role="separator"
      aria-label={`Resize ${label} column`}
      aria-orientation="vertical"
      aria-valuenow={currentWidth}
      aria-valuemin={40}
      aria-valuemax={500}
      tabIndex={0}
      className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-400 focus:bg-blue-500 focus:outline-none z-10"
      onMouseDown={onMouseDown}
      onKeyDown={onKeyDown}
    />
  );
}

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
  const { isDragSource, paneId, onContextMenuRequest, colWidths } = useContext(PaneCtx);
  const item = node.data;

  return (
    <div
      ref={dragHandle}
      style={style}
      className={`file-row ${node.isSelected ? 'selected' : ''} ${node.isFocused ? 'focused' : ''} ${isDragSource && !item.isDirectory ? 'cursor-grab active:cursor-grabbing' : ''}`}
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
      {/* Icon + name — minimum 100px so it never collapses to a single letter */}
      <div style={{ flex: 1, minWidth: 100, overflow: 'hidden' }} className="flex items-center gap-1">
        {(() => {
          const { icon: FileIcon, color } = item.isDirectory
            ? FOLDER_ICON
            : getFileIcon(item.name);
          return <FileIcon size={13} className={`${color} flex-shrink-0`} />;
        })()}
        <span className="truncate text-gray-100 text-xs" title={item.name}>{item.name}</span>
      </div>
      {/* Size */}
      <div style={{ width: colWidths.size, flexShrink: 0 }} className="text-xs text-gray-400 text-right">
        {formatSize(item.size)}
      </div>
      {/* Type */}
      <div style={{ width: colWidths.type, flexShrink: 0 }} className="text-xs text-gray-500 truncate pl-1">
        {item.isDirectory
          ? 'Dir'
          : item.name.includes('.')
            ? item.name.split('.').pop()?.toUpperCase()
            : 'File'}
      </div>
      {/* Modified */}
      <div style={{ width: colWidths.date, flexShrink: 0 }} className="text-xs text-gray-500 pl-1">
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
  /** Called when the user double-clicks (or presses Enter on) a non-directory file. */
  onFileDoubleClick?: (item: FileItem) => void;
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
  onFileDoubleClick,
  onPathChange,
  onDrop,
  isDragSource = false,
  contextMenuItems,
  extraActions,
}: FilePaneProps) {
  const [treeHeight, setTreeHeight] = useState(300);
  const [isDragOver, setIsDragOver] = useState(false);
  const [selectedItem, setSelectedItem] = useState<FileItem | null>(null);
  const [colWidths, setColWidths] = useState({ size: 80, type: 56, date: 128 });
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

  // Column resize via keyboard — arrow keys nudge by 10px.
  const keyResize = (e: React.KeyboardEvent, col: 'size' | 'type' | 'date') => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      setColWidths(prev => ({ ...prev, [col]: Math.max(40, prev[col] - 10) }));
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      setColWidths(prev => ({ ...prev, [col]: Math.min(500, prev[col] + 10) }));
    }
  };

  // Column resize — captures start position and adjusts the named column on mousemove.
  const startResize = (e: React.MouseEvent, col: 'size' | 'type' | 'date') => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = colWidths[col];
    const onMove = (ev: MouseEvent) => {
      setColWidths(prev => ({
        ...prev,
        [col]: Math.min(500, Math.max(40, startW + (ev.clientX - startX))),
      }));
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

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
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    // Only clear if leaving the pane entirely, not entering a child element
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    setIsDragOver(false);
    if (!onDrop) return;
    e.preventDefault();
    const raw = e.dataTransfer.getData('application/ftp-items');
    if (!raw) return;
    try {
      const payload = JSON.parse(raw) as { pane: string; items: FileItem[] };
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
        colWidths,
      }}
    >
      <div
        className={`flex flex-col h-full bg-gray-900 border rounded overflow-hidden transition-colors ${
          isDragOver ? 'file-pane-drop-active' : 'border-gray-700'
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
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

        {/* ── Column headers — resize handles sit on the left edge of each resizable column ── */}
        <div className="flex items-center px-1 py-0.5 bg-gray-800 border-b border-gray-700 flex-shrink-0 select-none">
          <div style={{ flex: 1, minWidth: 100 }} className="text-xs text-gray-500 font-medium px-1">Name</div>
          <div style={{ width: colWidths.size, flexShrink: 0, position: 'relative' }} className="text-xs text-gray-500 font-medium text-right">
            <ColResizeHandle onMouseDown={(e) => startResize(e, 'size')} onKeyDown={(e) => keyResize(e, 'size')} label="Size" currentWidth={colWidths.size} />
            Size
          </div>
          <div style={{ width: colWidths.type, flexShrink: 0, position: 'relative' }} className="text-xs text-gray-500 font-medium pl-1">
            <ColResizeHandle onMouseDown={(e) => startResize(e, 'type')} onKeyDown={(e) => keyResize(e, 'type')} label="Type" currentWidth={colWidths.type} />
            Type
          </div>
          <div style={{ width: colWidths.date, flexShrink: 0, position: 'relative' }} className="text-xs text-gray-500 font-medium pl-1">
            <ColResizeHandle onMouseDown={(e) => startResize(e, 'date')} onKeyDown={(e) => keyResize(e, 'date')} label="Modified" currentWidth={colWidths.date} />
            Modified
          </div>
        </div>

        {/* ── Error banner ── */}
        {error && (
          <div className="px-2 py-1 text-xs text-red-400 bg-red-900/20 border-b border-red-800/30 flex-shrink-0">
            {error}
          </div>
        )}

        {/* ── Tree / empty state ── */}
        <div
          ref={treeContainerRef}
          className="flex-1 overflow-hidden outline-none"
          tabIndex={0}
          onKeyDown={(e: React.KeyboardEvent) => {
            // Don't steal shortcuts from input fields
            if ((e.target as HTMLElement).matches('input, textarea, select')) return;
            if (e.key === 'F5') {
              e.preventDefault();
              onPathChange(path);
            }
            if (e.key === 'Backspace') {
              e.preventDefault();
              goUp();
            }
            if (selectedItem && e.key === 'Enter') {
              e.preventDefault();
              if (selectedItem.isDirectory) {
                onNavigate(selectedItem);
              } else {
                onFileDoubleClick?.(selectedItem);
              }
            }
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
              rowHeight={24}
              indent={0}
              // Disable react-arborist's internal DnD; we use native HTML5 DnD.
              disableDrag
              disableDrop
              onSelect={(nodes) => setSelectedItem(nodes[0]?.data ?? null)}
              onActivate={(node) => {
                if (node.data.isDirectory) {
                  onNavigate(node.data);
                } else {
                  onFileDoubleClick?.(node.data);
                }
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
