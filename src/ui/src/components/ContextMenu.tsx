/**
 * ContextMenu — generic floating right-click menu rendered via a fixed-
 * position overlay.  Closes on outside click, Escape, or when any item
 * is activated.
 */

import { useEffect, useRef } from 'react';

export interface ContextMenuAction {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  /** Red destructive styling. */
  danger?: boolean;
  /** Renders a thin divider before this item instead of a button. */
  separator?: boolean;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuAction[];
  onClose: () => void;
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Keep a stable ref to the latest onClose so the listeners (added once on
  // mount) always call the current handler without re-registering on every
  // render.  Without this pattern, an inline `() => setCtxMenu(null)` would
  // be a new function identity on each parent render, causing the effect to
  // re-run and re-register listeners unnecessarily.
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }); // runs every render, no cleanup needed

  useEffect(() => {
    const onPointer = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onCloseRef.current();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    // Capture phase: fires before any internal handler that might stopPropagation.
    document.addEventListener('mousedown', onPointer, true);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onPointer, true);
      document.removeEventListener('keydown', onKey, true);
    };
  }, []); // Empty deps: register once on mount, remove on unmount.

  // Nudge the menu back into the viewport if it would overflow.
  const safeX = Math.min(x, window.innerWidth  - 180);
  const safeY = Math.min(y, window.innerHeight - items.length * 28 - 8);

  return (
    <div
      ref={menuRef}
      style={{ position: 'fixed', left: safeX, top: safeY, zIndex: 9999 }}
      className="bg-gray-800 border border-gray-600 rounded shadow-2xl py-1 min-w-[140px]"
      // Prevent the browser's native context menu from appearing.
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item, i) =>
        item.separator ? (
          <div key={i} className="border-t border-gray-700 my-1" />
        ) : (
          <button
            key={i}
            disabled={item.disabled}
            onClick={() => {
              item.onClick();
              onClose();
            }}
            className={`w-full text-left px-3 py-1.5 text-xs transition-colors
              ${item.danger
                ? 'text-red-400 hover:bg-red-900/40 hover:text-red-300'
                : 'text-gray-200 hover:bg-gray-700'
              }
              disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            {item.label}
          </button>
        ),
      )}
    </div>
  );
}
