/**
 * Accessibility tests for TransferQueue.tsx progress bar ARIA attributes — Task 1.10
 *
 * Verifies that the progress bar div rendered by TransferRow exposes the correct
 * ARIA accessibility attributes:
 *   role="progressbar"
 *   aria-valuenow  (numeric, clamped to [0, 100])
 *   aria-valuemin="0"
 *   aria-valuemax="100"
 *   aria-valuetext (descriptive string)
 *
 * We parse the TSX source directly so the tests are deterministic, fast,
 * and work on every platform without a jsdom or react-dom/server setup.
 * This matches the source-analysis strategy used by the other accessibility
 * tests in this directory (bottompanel-tab-roles.test.ts,
 * error-banner-aria.test.tsx).
 */

import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// tests/accessibility/transferqueue-progressbar.test.ts
// → join(import.meta.dir, '..', '..') = C:\opencode\zaxbyftp (repo root)
const _repoRoot = join(import.meta.dir, '..', '..');
const SOURCE = readFileSync(
  join(_repoRoot, 'src', 'ui', 'src', 'components', 'TransferQueue.tsx'),
  'utf-8',
);

// ── Source-extraction helpers ────────────────────────────────────────────────────

/**
 * Isolate the progress bar JSX block inside TransferRow.
 * Starts at <div className="progress-bar ml-4"> and ends at the matching </div>.
 * Handles multi-line JSX open tags (attributes on subsequent lines).
 */
function getProgressBarBlock(): string {
  const marker = 'className="progress-bar ml-4"';
  const start = SOURCE.indexOf(marker);
  if (start === -1) return '';
  // The opening <div> begins on the same line as the marker (or earlier on the same line)
  // Walk backward from marker to find the start of the opening <div...> tag
  const lineStart = SOURCE.lastIndexOf('\n', start) + 1;
  const divTagStart = SOURCE.lastIndexOf('<div', start);
  if (divTagStart === -1 || divTagStart < lineStart - 10) {
    // Fallback: search forward for <div that starts on the marker line
    const lineEnd = SOURCE.indexOf('\n', start);
    const nextLineStart = lineEnd + 1;
    const divForward = SOURCE.indexOf('<div', nextLineStart);
    if (divForward === -1) return '';
    return extractBlockFrom(divForward);
  }
  return extractBlockFrom(divTagStart);
}

/** Walk from an opening <div...> forward to the matching </div>. */
function extractBlockFrom(openIdx: number): string {
  // Find the closing > of the opening <div...>
  const closeTag = SOURCE.indexOf('>', openIdx);
  if (closeTag === -1) return '';
  let depth = 1; // the opening <div> itself
  let i = closeTag + 1;
  for (; i < SOURCE.length; i++) {
    if (SOURCE.slice(i, i + 5) === '<div ') {
      depth++;
      i += 4; // skip past 'div '
    } else if (SOURCE.slice(i, i + 5) === '<div>') {
      depth++;
      i += 4;
    } else if (SOURCE.slice(i, i + 6) === '</div>') {
      depth--;
      if (depth === 0) return SOURCE.slice(openIdx, i + 6);
      i += 5;
    }
  }
  return '';
}

/**
 * Extract all values of a named JSX attribute from a source snippet.
 * Handles:
 *   - double-quoted:  attr="value"
 *   - single-quoted:  attr='value'
 *   - template-literal: attr={`value`}
 *   - raw JSX expression: attr={value} or attr={0}  <-- numeric/string literals without quotes
 */
function attrValues(src: string, attrName: string): string[] {
  const re = new RegExp(
    `\\b${attrName}=` +
    '(?:' +
      '"([^"]*)"|' +           // double-quoted: attr="value"
      "'([^']*)'|" +           // single-quoted: attr='value'
      '`([^`]*)`|' +           // template-literal: attr={`value`}
      '{\\`([^\\}]*)\\`}|' +   // {`...`} (already inside {})
      '\\{([^}]*)\\}' +         // raw expression: attr={0} or attr={someVar}
    ')',
    'g',
  );
  const values: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    values.push(m[1] ?? m[2] ?? m[3] ?? m[4] ?? m[5] ?? '');
  }
  return values;
}

/**
 * Check whether a specific attribute name appears with a literal value
 * anywhere in the source snippet (exact string match, not regex).
 */
function attrHasValue(src: string, attrName: string, value: string): boolean {
  // Match: attrName={0} or attrName={100} — static numeric or string literal
  const re = new RegExp(
    `\\b${attrName}=\\{${value}\\}`, // e.g.  aria-valuemin={0}
  );
  return re.test(src);
}

// ── Tests ───────────────────────────────────────────────────────────────────────

describe('TransferQueue progress bar — WCAG 4.1.3 (Status Messages) / ARIA progressbar', () => {

  test('progress bar container div exists with className="progress-bar ml-4"', () => {
    expect(
      SOURCE.includes('className="progress-bar ml-4"'),
      'TransferQueue.tsx must render a div with className="progress-bar ml-4"',
    ).toBe(true);
  });

  test('progress bar inner div has role="progressbar"', () => {
    const block = getProgressBarBlock();
    expect(block, 'progress bar block must be found in TransferQueue.tsx').toBeTruthy();
    expect(block.length > 0, 'progress bar block must be non-empty').toBe(true);

    const roles = attrValues(block, 'role');
    expect(
      roles,
      'progress bar must have role="progressbar"',
    ).toContain('progressbar');
  });

  test('progress bar has aria-valuemin="0" and aria-valuemax="100"', () => {
    const block = getProgressBarBlock();
    expect(block, 'progress bar block must be found').toBeTruthy();

    const valuemin = attrValues(block, 'aria-valuemin');
    const valuemax = attrValues(block, 'aria-valuemax');

    expect(valuemin, 'aria-valuemin must be defined').toHaveLength(1);
    expect(valuemin[0], 'aria-valuemin must be "0"').toBe('0');

    expect(valuemax, 'aria-valuemax must be defined').toHaveLength(1);
    expect(valuemax[0], 'aria-valuemax must be "100"').toBe('100');
  });

  test('progress bar has aria-valuenow present', () => {
    const block = getProgressBarBlock();
    expect(block, 'progress bar block must be found').toBeTruthy();

    const valuenow = attrValues(block, 'aria-valuenow');
    expect(
      valuenow.length,
      'aria-valuenow must be defined on the progress bar',
    ).toBeGreaterThan(0);
  });

  test('aria-valuenow is derived from pct (clamped to [0, 100]) and handles isDone=100', () => {
    const block = getProgressBarBlock();
    expect(block, 'progress bar block must be found').toBeTruthy();

    // aria-valuenow must use pct or {isDone ? 100 : pct}
    const hasPctBasedValue = /\baria-valuenow=\{/.test(block);
    expect(
      hasPctBasedValue,
      'aria-valuenow must be set via an expression (pct or ternary with isDone)',
    ).toBe(true);

    // The template must also handle isDone case explicitly (isDone ? 100 : pct)
    const hasDoneHandling = /isDone\s*\?\s*100\s*:\s*pct/.test(block);
    expect(
      hasDoneHandling,
      'aria-valuenow must use ternary isDone ? 100 : pct to handle completed transfers',
    ).toBe(true);
  });

  test('aria-valuenow expression produces values within [0, 100]', () => {
    // Verify pct is clamped: Math.min(100, Math.max(0, t.percentComplete))
    const hasClamp = /Math\.min\s*\(\s*100\s*,\s*Math\.max\s*\(\s*0/.test(SOURCE);
    expect(
      hasClamp,
      'pct must be clamped with Math.min(100, Math.max(0, ...)) to ensure [0,100] range',
    ).toBe(true);
  });

  test('aria-valuetext is present on the progress bar', () => {
    const block = getProgressBarBlock();
    expect(block, 'progress bar block must be found').toBeTruthy();

    const valuetext = attrValues(block, 'aria-valuetext');
    expect(
      valuetext.length,
      'aria-valuetext must be defined on the progress bar',
    ).toBeGreaterThan(0);
  });

  test('aria-valuetext includes a percentage string template', () => {
    const block = getProgressBarBlock();
    expect(block, 'progress bar block must be found').toBeTruthy();

    // aria-valuetext should contain a string template like `${isDone ? 100 : pct}% complete`
    const hasPercentTemplate = /aria-valuetext=\{`\$\{[^}]*\}\s*%\s*complete`\}/.test(block)
      || /aria-valuetext=\{`[^`]*% complete`\}/.test(block);
    expect(
      hasPercentTemplate,
      'aria-valuetext must use a template string with a percentage value and "complete" label',
    ).toBe(true);
  });

  test('aria-valuetext uses the same pct / isDone logic as aria-valuenow', () => {
    const block = getProgressBarBlock();
    expect(block, 'progress bar block must be found').toBeTruthy();

    // Both aria-valuenow and aria-valuetext should appear in the same element
    const hasBoth = /\baria-valuenow=\{/.test(block) && /\baria-valuetext=\{/.test(block);
    expect(
      hasBoth,
      'aria-valuenow and aria-valuetext must both be present on the same progress bar div',
    ).toBe(true);

    // aria-valuetext should also use isDone ? 100 : pct pattern
    const hasDoneInText = /aria-valuetext=\{`\$\{isDone\s*\?\s*100\s*:\s*pct\}/.test(block);
    expect(
      hasDoneInText,
      'aria-valuetext must use the same isDone ? 100 : pct expression as aria-valuenow',
    ).toBe(true);
  });

  test('all five ARIA attributes appear on the same progress bar div element', () => {
    const block = getProgressBarBlock();
    expect(block, 'progress bar block must be found').toBeTruthy();

    // Extract the inner <div ... /> (the progress bar fill)
    const fillRe = /<div\b[^>]*?role="progressbar"[^>]*?\/>/s;
    const match = block.match(fillRe);
    expect(
      match,
      'progress bar fill <div> with role="progressbar" must exist as a self-closing or paired tag',
    ).not.toBeNull();

    const fillTag = match![0];
    expect(fillTag).toContain('role="progressbar"');
    expect(fillTag).toContain('aria-valuenow=');
    expect(fillTag).toContain('aria-valuemin=');
    expect(fillTag).toContain('aria-valuemax=');
    expect(fillTag).toContain('aria-valuetext=');
  });

  test('aria-valuemin is static {0} and aria-valuemax is static {100} (raw numeric literals)', () => {
    const block = getProgressBarBlock();
    expect(block, 'progress bar block must be found').toBeTruthy();

    // aria-valuemin={0} — raw numeric literal 0
    expect(attrHasValue(block, 'aria-valuemin', '0')).toBe(true);
    // aria-valuemax={100} — raw numeric literal 100
    expect(attrHasValue(block, 'aria-valuemax', '100')).toBe(true);

    // Neither uses a dynamic expression (no variable names or complex expressions)
    // e.g. aria-valuemin={someVar} or aria-valuemin={pct} would be dynamic
    const valueminIsRaw0 = /\baria-valuemin=\{0\}/.test(block);
    const valuemaxIsRaw100 = /\baria-valuemax=\{100\}/.test(block);
    expect(
      valueminIsRaw0,
      'aria-valuemin must be the static literal {0}, not a dynamic expression',
    ).toBe(true);
    expect(
      valuemaxIsRaw100,
      'aria-valuemax must be the static literal {100}, not a dynamic expression',
    ).toBe(true);
  });

  test('progress bar is only rendered for active or completed transfers', () => {
    // {(isActive || isDone) && ( ... progress bar ... )}
    const conditionRe = /\{[\s\n]*\(\s*isActive\s*\|\|\s*isDone\s*\)\s*&&/;
    expect(
      conditionRe.test(SOURCE),
      'progress bar must be conditionally rendered only when isActive || isDone',
    ).toBe(true);
  });

  test('width style matches aria-valuenow (pixel-accurate visual representation)', () => {
    const block = getProgressBarBlock();
    expect(block, 'progress bar block must be found').toBeTruthy();

    // style={{ width: `${isDone ? 100 : pct}%` }}
    const hasWidthStyle = /style=\{\{\s*width:\s*`\$\{isDone\s*\?\s*100\s*:\s*pct\}%`\s*\}\}/.test(block);
    expect(
      hasWidthStyle,
      'the progress bar width style must use the same isDone ? 100 : pct expression as aria-valuenow',
    ).toBe(true);
  });
});
