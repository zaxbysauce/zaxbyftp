/**
 * LogPanel log container ARIA attribute verification — Task 1.11
 *
 * Verifies that the log container div rendered by LogPanel.tsx exposes the
 * correct ARIA accessibility attributes:
 *   role="log"
 *   aria-live="polite"
 *
 * These attributes ensure screen readers announce new log entries politely and
 * in order, meeting WCAG 2.1 SC 4.1.3 (Status Messages).
 *
 * We parse the TSX source directly so the tests are deterministic, fast,
 * and work on every platform without a jsdom or react-dom/server setup.
 */

import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// import.meta.dir = C:\opencode\zaxbyftp\tests\accessibility
// join(import.meta.dir, '..', '..') = C:\opencode\zaxbyftp (repo root)
const _repoRoot = join(import.meta.dir, '..', '..');
const SOURCE = readFileSync(
  join(_repoRoot, 'src', 'ui', 'src', 'components', 'LogPanel.tsx'),
  'utf-8',
);

// ── Source-extraction helpers ─────────────────────────────────────────────────

/**
 * Extract the JSX opening tag for the log container div.
 * The container is the first <div role="log" ...> in the component body.
 */
function getLogContainerTag(): string | null {
  const marker = 'role="log"';
  const idx = SOURCE.indexOf(marker);
  if (idx === -1) return null;
  // Walk backward to the opening '<'
  let start = idx;
  while (start > 0 && SOURCE[start - 1] !== '<') start--;
  // Walk forward to find the closing '>' of the opening tag
  let end = idx;
  while (end < SOURCE.length && SOURCE[end] !== '>') end++;
  return SOURCE.slice(start, end + 1);
}

/**
 * Isolate the log container JSX block — from <div role="log" to its closing </div>.
 */
function getLogContainerBlock(): string | null {
  const marker = '<div role="log"';
  const start = SOURCE.indexOf(marker);
  if (start === -1) return null;
  // Walk forward counting open/close div tags to find the matching </div>
  let depth = 0;
  let i = start;
  for (; i < SOURCE.length; i++) {
    if (SOURCE.slice(i, i + 5) === '<div ') depth++;
    else if (SOURCE.slice(i, i + 6) === '</div>') {
      depth--;
      if (depth === 0) return SOURCE.slice(start, i + 6);
    }
  }
  return null;
}

/** Extract all values of a named attribute from JSX opening tags in source. */
function attrValues(src: string, attrName: string): string[] {
  const re = new RegExp(
    `\\b${attrName}=` +
    '(?:' +
      '"([^"]*)"|' +
      "'([^']*)'|" +
      '`([^`]*)`|' +
      '{\\`([^\\}]*)\\`}' +
    ')',
    'g',
  );
  const values: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    values.push(m[1] ?? m[2] ?? m[3] ?? m[4] ?? '');
  }
  return values;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('LogPanel log container ARIA — WCAG 4.1.3 (Status Messages)', () => {

  test('LogPanel.tsx source contains the log container div with role="log"', () => {
    expect(
      SOURCE,
      'LogPanel.tsx source must contain the log container div',
    ).toContain('role="log"');
  });

  test('log container div has role="log"', () => {
    const tag = getLogContainerTag();
    expect(tag, 'log container <div role="log" ...> must be found').not.toBeNull();
    expect(
      /role="log"/.test(tag!),
      'the log container div must have role="log"',
    ).toBe(true);
  });

  test('log container div has aria-live="polite"', () => {
    const tag = getLogContainerTag();
    expect(tag, 'log container <div role="log" ...> must be found').not.toBeNull();
    expect(
      /aria-live="polite"/.test(tag!),
      'the log container div must have aria-live="polite"',
    ).toBe(true);
  });

  test('log container div has both role="log" and aria-live="polite" on the same element', () => {
    const tag = getLogContainerTag();
    expect(tag, 'log container <div role="log" ...> must be found').not.toBeNull();
    const hasRole    = /\brole="log"/.test(tag!);
    const hasAriaLive = /\baria-live="polite"/.test(tag!);
    expect(
      hasRole && hasAriaLive,
      'log container <div> must carry both role="log" and aria-live="polite"',
    ).toBe(true);
  });

  test('no other element in LogPanel has aria-live="polite" (uniqueness)', () => {
    const ariaLiveValues = attrValues(SOURCE, 'aria-live');
    const politeValues = ariaLiveValues.filter(v => v === 'polite');
    expect(
      politeValues.length,
      'aria-live="polite" must appear exactly once in LogPanel.tsx',
    ).toBe(1);
  });

  test('no other element in LogPanel has role="log" (uniqueness)', () => {
    const roles = attrValues(SOURCE, 'role');
    const logRoles = roles.filter(v => v === 'log');
    expect(
      logRoles.length,
      'role="log" must appear exactly once in LogPanel.tsx',
    ).toBe(1);
  });

  test('log container block contains the log entries map', () => {
    const block = getLogContainerBlock();
    expect(block, 'log container block must be found').not.toBeNull();
    expect(block!).toContain('state.logs.map');
  });

  test('log container has overflow-y-auto class for scroll behavior', () => {
    const tag = getLogContainerTag();
    expect(tag, 'log container <div role="log" ...> must be found').not.toBeNull();
    expect(
      /className="[^"]*overflow-y-auto/.test(tag!),
      'log container div should have overflow-y-auto for scroll behavior',
    ).toBe(true);
  });
});
