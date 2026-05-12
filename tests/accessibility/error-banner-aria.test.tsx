/**
 * Error banner ARIA attribute verification — Task 1.8
 *
 * Verifies that the error banner div rendered by FilePane exposes the
 * correct ARIA accessibility attributes:
 *   role="alert"
 *   aria-live="assertive"
 *
 * These attributes ensure screen readers announce error messages immediately
 * and without delay, meeting WCAG 2.1 SC 4.1.3 (Status Messages).
 *
 * We parse the TSX source directly so the tests are deterministic, fast,
 * and work on every platform without a jsdom or react-dom/server setup.
 */

import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Resolve relative to the repo root (tests/ is two levels below the root)
const _repoRoot = join(import.meta.dir, '..', '..');
const SOURCE = readFileSync(
  join(_repoRoot, 'src/ui/src/components/FilePane.tsx'),
  'utf-8',
);

// ── Parser ────────────────────────────────────────────────────────────────────

/** Extract all values of a named attribute from JSX opening tags in source. */
function attrValues(src: string, attrName: string): string[] {
  // Matches: attrName="value"  or  attrName='value'  or  attrName={`value`}
  const re = new RegExp(
    `\\b${attrName}=` +
    '(?:' +
      '"([^"]*)"|' +         // double-quoted
      "'([^']*)'|" +         // single-quoted
      '`([^`]*)`|' +         // template-literal
      '{\\`([^\\}]*)\\`}' +   // {`...`} (already inside {})
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

/** Isolate the error banner JSX block — from {error && ( to the closing ); */
function errorBannerBlock(src: string): string {
  const marker = '{error && (';
  const start = src.indexOf(marker);
  if (start === -1) return '';
  const end = src.indexOf(');', start);
  if (end === -1) return '';
  return src.slice(start + marker.length, end);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('FilePane error banner — WCAG 4.1.3 (Status Messages)', () => {

  test('error banner div has role="alert"', () => {
    const block = errorBannerBlock(SOURCE);
    expect(block, 'error banner block must exist in FilePane.tsx').toBeTruthy();

    const roles = attrValues(block, 'role');
    expect(roles, 'error banner must have role="alert"').toContain('alert');
  });

  test('error banner div has aria-live="assertive"', () => {
    const block = errorBannerBlock(SOURCE);
    expect(block, 'error banner block must exist in FilePane.tsx').toBeTruthy();

    const ariaLiveValues = attrValues(block, 'aria-live');
    expect(ariaLiveValues, 'error banner must have aria-live="assertive"').toContain('assertive');
  });

  test('error banner div has both role="alert" and aria-live="assertive" on the same element', () => {
    const block = errorBannerBlock(SOURCE);
    expect(block, 'error banner block must exist in FilePane.tsx').toBeTruthy();

    // Find the <div> that contains the banner — it must have both attributes
    const divRe = /<div\b([^>]*?)(?:\/?>)/g;
    let m: RegExpExecArray | null;
    let found = false;
    while ((m = divRe.exec(block)) !== null) {
      const tag = m[0];
      const hasRole    = /\brole="alert"/.test(tag);
      const hasAriaLive = /\baria-live="assertive"/.test(tag);
      if (hasRole && hasAriaLive) {
        found = true;
        break;
      }
    }
    expect(found, 'error banner <div> must carry both role="alert" and aria-live="assertive"').toBe(true);
  });

  test('error banner block contains the error message text', () => {
    const block = errorBannerBlock(SOURCE);
    expect(block, 'error banner block must exist in FilePane.tsx').toBeTruthy();

    // The block must contain {error} — the interpolated error prop
    expect(block).toContain('{error}');
  });

  test('error banner is conditionally rendered with {error && ( ... )}', () => {
    // The error banner must be gated behind a truthy error prop
    expect(SOURCE).toContain('{error && (');
    expect(SOURCE).toContain('aria-live="assertive"');
  });

  test('no other element in the error banner block has conflicting aria-live', () => {
    const block = errorBannerBlock(SOURCE);
    expect(block, 'error banner block must exist in FilePane.tsx').toBeTruthy();

    const ariaLiveValues = attrValues(block, 'aria-live');
    // Only one aria-live value should be present in the block
    expect(
      ariaLiveValues.filter(v => v !== '').length,
      'error banner block should have exactly one aria-live attribute',
    ).toBe(1);
    expect(ariaLiveValues[0]).toBe('assertive');
  });
});
