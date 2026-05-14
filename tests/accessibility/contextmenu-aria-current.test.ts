/**
 * ContextMenu aria-current attribute verification — Task 1.13
 *
 * Verifies that the ContextMenu component applies the correct ARIA accessibility
 * attributes for keyboard focus management:
 *
 *   • Focused menu item button  →  aria-current="true"
 *   • Non-focused menu item     →  no aria-selected attribute present
 *
 * WCAG 2.1 SC 4.1.2 (Name, Role, Value) requires that interactive elements
 * expose their state to assistive technology.  Using aria-current="true" on the
 * focused item (rather than aria-selected) correctly communicates keyboard focus
 * within a menu widget to screen readers.
 *
 * Source-parsing approach: tests are deterministic, fast, and work on every
 * platform without a jsdom / react-dom/server setup.
 */

import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Resolve relative to the repo root (tests/ is two levels below the root)
const _repoRoot = join(import.meta.dir, '..', '..');
const SOURCE = readFileSync(
  join(_repoRoot, 'src/ui/src/components/ContextMenu.tsx'),
  'utf-8',
);

// ── Parser ────────────────────────────────────────────────────────────────────

/**
 * Extract all aria-current attribute strings from the source.
 * Handles both static:  aria-current="true"
 * and expression form:  aria-current={isFocused ? "true" : undefined}
 *
 * In the expression form the "true" literal appears inside the JSX expression
 * block { ... }, so we strip everything before the opening { and extract the
 * quoted token that represents the true-branch of the ternary.
 */
function ariaCurrentValues(src: string): string[] {
  const values: string[] = [];
  // Match static: aria-current="true"
  const quoted = /aria-current="([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = quoted.exec(src)) !== null) values.push(m[1] ?? '');
  // Match JSX expression: aria-current={...} — extract the "true" string literal
  // Pattern breakdown:
  //   aria-current=         attribute name + =
  //   \{                   opening JSX brace {
  //   [^{]*                any chars up to the ? (non-{, non-})
  //   \?                   the ternary operator ?
  //   [^{]*                chars between ? and " (e.g. space)
  //   "([^"]*)"            the "true" string literal (captured)
  const expr = /\baria-current=\{\s*[^{]*\?\s*"([^"]*)"/g;
  while ((m = expr.exec(src)) !== null) values.push(m[1] ?? '');
  return values;
}

/**
 * Extract all aria-selected values found in JSX opening tags in source.
 * Matches: aria-selected="value"  (single- or double-quoted)
 */
function ariaSelectedValues(src: string): string[] {
  const re = /aria-selected=(?:"([^"]*)"|'([^']*)')/g;
  const values: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    values.push(m[1] ?? m[2] ?? '');
  }
  return values;
}

/**
 * Check whether aria-selected appears anywhere in the source as an attribute
 * (including bare attr without a value, e.g. aria-selected).
 */
function hasAriaSelectedAttribute(src: string): boolean {
  return /\baria-selected\b/.test(src);
}

/**
 * Extract all aria-current attribute declarations including bare form (no value).
 * This catches both aria-current="true" and aria-current={...} forms.
 */
function ariaCurrentDeclarations(src: string): string[] {
  const values: string[] = [];
  // Match static: aria-current="true"
  const quoted = /\baria-current="[^"]*"/g;
  let m: RegExpExecArray | null;
  while ((m = quoted.exec(src)) !== null) values.push(m[0]);
  // Match JSX expression: aria-current={...}
  const expr = /\baria-current=\{[^}]*\}/g;
  while ((m = expr.exec(src)) !== null) values.push(m[0]);
  return values;
}

/**
 * Isolate the button-mapping section of ContextMenu — from
 * `return items.map(` to the closing `})`
 * so we only analyse the rendered menu items, not surrounding JSX.
 */
function buttonMapBlock(src: string): string {
  const marker = 'return items.map(';
  const start = src.indexOf(marker);
  if (start === -1) return '';
  // Walk forward to find the matching close for the map
  let depth = 0;
  let end = start;
  for (let i = start; i < src.length; i++) {
    if (src[i] === '(' || src[i] === '{') depth++;
    if (src[i] === ')' || src[i] === '}') {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }
  return src.slice(start, end + 1);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ContextMenu aria-current — WCAG 4.1.2 (Name, Role, Value)', () => {

  test('button map block is present in ContextMenu.tsx', () => {
    const block = buttonMapBlock(SOURCE);
    expect(block, 'items.map block must exist in ContextMenu.tsx').toBeTruthy();
    expect(block.length, 'button map block must not be empty').toBeGreaterThan(0);
  });

  // ── aria-current ─────────────────────────────────────────────────────────────

  test('focused item has aria-current="true" in the JSX', () => {
    // The component must set aria-current="true" when isFocused is true
    const block = buttonMapBlock(SOURCE);
    expect(block).toContain('aria-current=');
  });

  test('aria-current is set conditionally on isFocused', () => {
    // The aria-current attribute must use isFocused as its condition
    const block = buttonMapBlock(SOURCE);
    // aria-current={isFocused ? "true" : undefined}
    const re = /aria-current=\{isFocused\s*\?\s*["']true["']\s*:\s*(?:undefined|null)/;
    expect(block, 'aria-current must be set to "true" when isFocused is true').toMatch(re);
  });

  test('aria-current="true" appears in the source', () => {
    const values = ariaCurrentValues(SOURCE);
    expect(values, 'aria-current="true" must be present').toContain('true');
  });

  test('only one aria-current attribute is declared in the button map block', () => {
    // There should be exactly one aria-current= declaration (on the <button> inside the map)
    const block = buttonMapBlock(SOURCE);
    const decls = ariaCurrentDeclarations(block);
    expect(decls.length, 'exactly one aria-current attribute should be declared on the menuitem button').toBe(1);
  });

  // ── aria-selected ────────────────────────────────────────────────────────────

  test('no aria-selected attribute is present anywhere in ContextMenu.tsx', () => {
    const hasAriaSelected = hasAriaSelectedAttribute(SOURCE);
    expect(
      hasAriaSelected,
      'ContextMenu must not use aria-selected — use aria-current for focus indication',
    ).toBe(false);
  });

  test('aria-selected values list is empty', () => {
    const values = ariaSelectedValues(SOURCE);
    expect(values, 'ContextMenu must not set any aria-selected values').toHaveLength(0);
  });

  // ── Combined correctness ─────────────────────────────────────────────────────

  test('the same button element carries both aria-current and role="menuitem"', () => {
    const block = buttonMapBlock(SOURCE);
    // The <button role="menuitem" aria-current={...} ...> must appear in the button map
    // We check the whole button tag spans (multi-line JSX tags are unlikely here)
    // Look for button opening tags that contain both role="menuitem" and aria-current
    const found = /<button\b[^>]*\brole="menuitem"[^>]*\baria-current\b|<button\b[^>]*\baria-current\b[^>]*\brole="menuitem"/.test(block);
    expect(
      found,
      'the <button role="menuitem"> element must carry the aria-current attribute',
    ).toBe(true);
  });

  test('aria-current="true" is the evaluated value on the button with role="menuitem"', () => {
    const block = buttonMapBlock(SOURCE);
    // aria-current={isFocused ? "true" : undefined} — "true" appears inside the ternary
    const hasTernaryWithTrue = /aria-current=\{\s*[^{]*\?\s*"true"/.test(block);
    expect(
      hasTernaryWithTrue,
      'aria-current on the menuitem button must evaluate to "true" when isFocused is true',
    ).toBe(true);
  });
});
