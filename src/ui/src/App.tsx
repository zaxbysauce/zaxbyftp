/**
 * App — root layout: TopBar / dual-pane / BottomPanel.
 *
 * The dual-pane split is horizontally resizable via a drag handle.
 * The bottom panel height is fixed (resizable in Phase 5).
 */

import React, { useCallback, useRef, useState } from 'react';
import { TopBar } from './components/TopBar';
import { LocalPane } from './components/LocalPane';
import { RemotePane } from './components/RemotePane';
import { BottomPanel } from './components/BottomPanel';
import { AppProvider } from './contexts/AppContext';

const BOTTOM_HEIGHT = 180; // px — fixed for Phase 4
const MIN_PANE_WIDTH = 200; // px

function Layout() {
  // Horizontal split ratio (0–1): fraction for the left (local) pane.
  const [splitRatio, setSplitRatio] = useState(0.5);
  const mainRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const onSplitterMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    dragging.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMove = (ev: MouseEvent) => {
      if (!dragging.current || !mainRef.current) return;
      const rect = mainRef.current.getBoundingClientRect();
      const totalWidth = rect.width;
      const localX = ev.clientX - rect.left;
      const ratio = Math.min(
        1 - MIN_PANE_WIDTH / totalWidth,
        Math.max(MIN_PANE_WIDTH / totalWidth, localX / totalWidth),
      );
      setSplitRatio(ratio);
    };

    const onUp = () => {
      dragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, []);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-gray-900">
      {/* Top bar — fixed height */}
      <TopBar />

      {/* Main content — grows to fill remaining height */}
      <div
        ref={mainRef}
        className="flex flex-1 min-h-0 gap-0 overflow-hidden"
        style={{ height: `calc(100% - 44px - ${BOTTOM_HEIGHT}px)` }}
      >
        {/* Local pane */}
        <div
          className="min-w-0 h-full p-1"
          style={{ width: `${splitRatio * 100}%` }}
        >
          <LocalPane />
        </div>

        {/* Splitter */}
        <div
          className="splitter"
          onMouseDown={onSplitterMouseDown}
        />

        {/* Remote pane */}
        <div
          className="min-w-0 h-full p-1 flex-1"
          style={{ width: `${(1 - splitRatio) * 100}%` }}
        >
          <RemotePane />
        </div>
      </div>

      {/* Bottom panel — fixed height */}
      <div style={{ height: BOTTOM_HEIGHT, minHeight: BOTTOM_HEIGHT }}>
        <BottomPanel />
      </div>
    </div>
  );
}

export function App() {
  return (
    <AppProvider>
      <Layout />
    </AppProvider>
  );
}
