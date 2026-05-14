/**
 * Accessibility tests for BottomPanel.tsx tab ARIA roles.
 *
 * Verifies that:
 *   1. The tab container has role="tablist"
 *   2. Each tab button has role="tab" and aria-selected
 *   3. aria-controls links each tab button to the corresponding tabpanel ID
 *   4. tabIndex is 0 for the active tab, -1 for inactive tabs
 *
 * Uses source-analysis (regex) for determinism and cross-platform compatibility.
 *
 * Strategy: The three tab buttons are rendered by a single JSX .map() over the
 * TABS array. Attributes appear once in the source (in the template) but render
 * three times. We verify:
 *   - The tab container has role="tablist"
 *   - The button TEMPLATE declares all required attributes (role="tab", aria-selected,
 *     id, aria-controls, tabIndex) — these appear once in source but produce 3 buttons
 *   - All 3 tabpanel divs have correct id + aria-labelledby linking back to tab buttons
 */

import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// import.meta.dir = C:\opencode\zaxbyftp\tests\accessibility
// join(import.meta.dir, '..', '..') = C:\opencode\zaxbyftp (repo root)
const _repoRoot = join(import.meta.dir, '..', '..');
const SOURCE = readFileSync(
  join(_repoRoot, 'src', 'ui', 'src', 'components', 'BottomPanel.tsx'),
  'utf-8',
);

// ── Source-extraction helpers ────────────────────────────────────────────────────

/** The full BottomPanel function body (return statement onwards). */
function getBottomPanelBody(): string | null {
  const start = SOURCE.indexOf('export function BottomPanel()');
  if (start === -1) return null;
  return SOURCE.slice(start);
}

/** The tab-bar section: from role="tablist" to the end of the tab-bar container. */
function getTabBarSection(): string | null {
  const marker = 'role="tablist"';
  const idx = SOURCE.indexOf(marker);
  if (idx === -1) return null;
  const fnEnd = SOURCE.indexOf('\n// ── Messages panel', idx);
  if (fnEnd === -1) return null;
  return SOURCE.slice(idx, fnEnd);
}

/** The tab-content section (tabpanel divs). */
function getTabContentSection(): string | null {
  const marker = 'role="tabpanel"';
  const first = SOURCE.indexOf(marker);
  if (first === -1) return null;
  const outer = SOURCE.lastIndexOf('<div className="flex-1 overflow-hidden">', first);
  if (outer === -1) return null;
  // Walk forward to find the matching </div> for this outer div
  let depth = 0;
  let i = outer;
  for (; i < SOURCE.length; i++) {
    if (SOURCE.slice(i, i + 5) === '<div ') depth++;
    if (SOURCE.slice(i, i + 6) === '</div>') {
      depth--;
      if (depth === 0) return SOURCE.slice(outer, i + 6);
    }
  }
  return null;
}

/** Number of entries in the TABS array (determines how many tab buttons render). */
function getTabCount(): number {
  const tabsStart = SOURCE.indexOf('const TABS = [');
  if (tabsStart === -1) return 0;
  const tabsEnd = SOURCE.indexOf('];', tabsStart);
  if (tabsEnd === -1) return 0;
  const section = SOURCE.slice(tabsStart, tabsEnd);
  return (section.match(/\{ key: '[^']+'/g) ?? []).length;
}

// ── Tests ───────────────────────────────────────────────────────────────────────

describe('BottomPanel tab ARIA roles — tab container', () => {

  test('tab container div has role="tablist"', () => {
    const tabBar = getTabBarSection();
    expect(tabBar, 'tab bar section must be found').not.toBeNull();
    expect(
      /role="tablist"/.test(tabBar!),
      'the tab container div must have role="tablist"',
    ).toBe(true);
  });

  test('role="tablist" appears before the first role="tab" button', () => {
    const tabBar = getTabBarSection()!;
    const tablistIdx = tabBar.indexOf('role="tablist"');
    const tabIdx = tabBar.indexOf('role="tab"');
    expect(tablistIdx, 'role="tablist" must exist').toBeGreaterThan(-1);
    expect(tabIdx, 'role="tab" must exist').toBeGreaterThan(-1);
    expect(
      tablistIdx,
      'role="tablist" must appear before the first role="tab" button',
    ).toBeLessThan(tabIdx);
  });
});

describe('BottomPanel tab ARIA roles — tab button attributes (template)', () => {

  test('TABS array defines exactly 3 tab entries', () => {
    expect(
      getTabCount(),
      'TABS array must define 3 entries: transfers, log, messages',
    ).toBe(3);
  });

  test('tab button template declares role="tab"', () => {
    const body = getBottomPanelBody()!;
    expect(
      /role="tab"/.test(body),
      'the <button> template must declare role="tab"',
    ).toBe(true);
  });

  test('tab button template declares aria-selected={isActive}', () => {
    const body = getBottomPanelBody()!;
    expect(
      /aria-selected=\{isActive\}/.test(body),
      'the <button> template must have aria-selected={isActive}',
    ).toBe(true);
  });

  test('tab button template declares id={`tab-${key}`}', () => {
    const body = getBottomPanelBody()!;
    expect(
      /id=\{`tab-\$\{key\}`\}/.test(body),
      'the <button> template must have id={`tab-${key}`}',
    ).toBe(true);
  });

  test('tab button template declares aria-controls={`tabpanel-${key}`}', () => {
    const body = getBottomPanelBody()!;
    expect(
      /aria-controls=\{`tabpanel-\$\{key\}`\}/.test(body),
      'the <button> template must have aria-controls={`tabpanel-${key}`}',
    ).toBe(true);
  });

  test('tab button template declares tabIndex={isActive ? 0 : -1}', () => {
    const body = getBottomPanelBody()!;
    expect(
      /tabIndex=\{isActive\s*\?\s*0\s*:\s*-1\}/.test(body),
      'the <button> template must have tabIndex={isActive ? 0 : -1}',
    ).toBe(true);
  });

  test('isActive is derived from activeBottomTab === key inside the .map()', () => {
    const tabBar = getTabBarSection()!;
    expect(
      /const isActive = activeBottomTab === key/.test(tabBar),
      'isActive must be computed as activeBottomTab === key inside the .map() callback',
    ).toBe(true);
  });
});

describe('BottomPanel tab ARIA roles — tabpanel linking', () => {

  test('all three role="tabpanel" divs exist with id and aria-labelledby', () => {
    const content = getTabContentSection();
    expect(content, 'tab content section must be found').not.toBeNull();
    const matches = [...content!.matchAll(/role="tabpanel"\s+id="(tabpanel-[^"]+)"\s+aria-labelledby="(tab-[^"]+)"/g)];
    expect(
      matches.length,
      'all 3 tabpanel divs must exist with role="tabpanel", id, and aria-labelledby',
    ).toBe(3);
  });

  test('tabpanel ids follow the pattern id="tabpanel-{key}"', () => {
    const content = getTabContentSection()!;
    for (const key of ['transfers', 'log', 'messages']) {
      expect(
        new RegExp(`id="tabpanel-${key}"`).test(content),
        `tabpanel for "${key}" must have id="tabpanel-${key}"`,
      ).toBe(true);
    }
  });

  test('each tabpanel aria-labelledby references the corresponding tab button id', () => {
    const content = getTabContentSection()!;
    const matches = [...content.matchAll(/role="tabpanel"\s+id="(tabpanel-[^"]+)"\s+aria-labelledby="(tab-[^"]+)"/g)];
    for (const m of matches) {
      const panelId = m[1];
      const labelledBy = m[2];
      const expectedTabId = panelId.replace('tabpanel-', 'tab-');
      expect(
        labelledBy,
        `tabpanel "${panelId}" aria-labelledby must be "${expectedTabId}", got "${labelledBy}"`,
      ).toBe(expectedTabId);
    }
  });
});

describe('BottomPanel tab ARIA roles — full round-trip consistency', () => {

  test('every tab button id appears in exactly one aria-labelledby', () => {
    const content = getTabContentSection()!;
    const matches = [...content.matchAll(/role="tabpanel"\s+id="(tabpanel-[^"]+)"\s+aria-labelledby="(tab-[^"]+)"/g)];
    const labelledByIds = matches.map(m => m[2]);
    for (const tabId of ['tab-transfers', 'tab-log', 'tab-messages']) {
      const count = labelledByIds.filter(id => id === tabId).length;
      expect(
        count,
        `tab button id "${tabId}" must appear in exactly one aria-labelledby, got ${count}`,
      ).toBe(1);
    }
  });

  test('every aria-controls tabpanel-{key} value has a matching tabpanel id (round-trip)', () => {
    const tabBar = getTabBarSection()!;
    const content = getTabContentSection()!;
    // aria-controls uses the template {`tabpanel-${key}`} — verify each key has a panel
    for (const key of ['transfers', 'log', 'messages']) {
      const ariaControls = `tabpanel-${key}`;
      const hasPanel = new RegExp(`id="${ariaControls}"`).test(content);
      expect(
        hasPanel,
        `aria-controls="${ariaControls}" must have a matching tabpanel id="${ariaControls}"`,
      ).toBe(true);
    }
  });

  test('aria-controls and aria-labelledby form a consistent bidirectional link for all 3 tabs', () => {
    const content = getTabContentSection()!;
    const matches = [...content.matchAll(/role="tabpanel"\s+id="(tabpanel-[^"]+)"\s+aria-labelledby="(tab-[^"]+)"/g)];
    expect(matches.length, 'all 3 tabpanel entries must be found').toBe(3);

    // Verify each tab button id maps to exactly one panel and vice versa
    const tabIds = matches.map(m => m[2]);
    const panelIds = matches.map(m => m[1]);
    expect(new Set(tabIds).size, 'all 3 tab IDs must be unique').toBe(3);
    expect(new Set(panelIds).size, 'all 3 panel IDs must be unique').toBe(3);

    for (const m of matches) {
      const panelId = m[1];
      const tabId = m[2];
      expect(panelId).toBe(tabId.replace('tab-', 'tabpanel-'));
    }
  });
});
