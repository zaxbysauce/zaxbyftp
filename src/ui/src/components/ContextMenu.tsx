/**
 * ContextMenu — generic floating right-click menu rendered via a fixed-
 * position overlay.  Closes on outside click, Escape, or when any item
 * is activated.
 */

import { useEffect, useRef, useState } from 'react';

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
  const [focusedIdx, setFocusedIdx] = useState(-1);
  // Only non-separator items are keyboard-navigable
  const actionItems = items.filter(item => !item.separator);

  // Keep a stable ref to the latest onClose so the listeners (added once on
  // mount) always call the current handler without re-registering on every
  // render.  Without this pattern, an inline `() => setCtxMenu(null)` would
  // be a new function identity on each parent render, causing the effect to
  // re-run and re-register listeners unnecessarily.
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }); // runs every render, no cleanup needed

  // Ref-based mirror of focusedIdx so the keydown handler (registered once on
  // mount) can read the current value without going stale.
  const focusedIdxRef = useRef(-1);
  useEffect(() => { focusedIdxRef.current = focusedIdx; });

  useEffect(() => {
    const onPointer = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onCloseRef.current();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onCloseRef.current(); return; }
      if (e.key === 'ArrowDown' || e.key === 'Tab') {
        e.preventDefault();
        setFocusedIdx(i => {
          const next = i + 1;
          return next >= actionItems.length ? 0 : next;
        });
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusedIdx(i => {
          const prev = i - 1;
          return prev < 0 ? actionItems.length - 1 : prev;
        });
      }
      if (e.key === 'Enter' && focusedIdxRef.current >= 0) {
        e.preventDefault();
        const action = actionItems[focusedIdxRef.current];
        if (action && !action.disabled) {
          action.onClick();
          onCloseRef.current();
        }
      }
      if (e.key === 'Home') {
        e.preventDefault();
        setFocusedIdx(0);
      }
      if (e.key === 'End') {
        e.preventDefault();
        setFocusedIdx(actionItems.length - 1);
      }
    };
    // Capture phase: fires before any internal handler that might stopPropagation.
    document.addEventListener('mousedown', onPointer, true);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onPointer, true);
      document.removeEventListener('keydown', onKey, true);
    };
  }, []); // Empty deps: register once on mount, remove on unmount.

  // Auto-focus the menu on mount so keyboard events are captured immediately
  useEffect(() => {
    menuRef.current?.focus();
  }, []);

  // Scroll the focused item into view when focusedIdx changes
  useEffect(() => {
    if (focusedIdx < 0 || !menuRef.current) return;
    const buttons = menuRef.current.querySelectorAll('button:not(:disabled)');
    buttons[focusedIdx]?.scrollIntoView({ block: 'nearest' });
  }, [focusedIdx]);

  // Nudge the menu back into the viewport if it would overflow.
  const safeX = Math.min(x, window.innerWidth  - 180);
  const safeY = Math.min(y, window.innerHeight - items.length * 28 - 8);

  return (
    <div
      ref={menuRef}
      tabIndex={-1}
      role="menu"
      style={{ position: 'fixed', left: safeX, top: safeY, zIndex: 9999 }}
      className="bg-gray-800 border border-gray-600 rounded shadow-2xl py-1 min-w-[140px] outline-none"
      // Prevent the browser's native context menu from appearing.
      onContextMenu={(e) => e.preventDefault()}
    >
      {(() => {
        let actionIdx = -1;
        return items.map((item, i) => {
          if (item.separator) {
            return <div key={i} className="border-t border-gray-700 my-1" />;
          }
          actionIdx++;
          const isFocused = actionIdx === focusedIdx;
          const currentActionIdx = actionIdx;
          return (
            <button
              key={i}
              role="menuitem"
              aria-selected={isFocused}
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
                ${isFocused ? 'bg-gray-700' : ''}
                disabled:opacity-40 disabled:cursor-not-allowed`}
              onMouseEnter={() => setFocusedIdx(currentActionIdx)}
            >
              {item.label}
            </button>
          );
        });
      })()}
    </div>
  );
}
