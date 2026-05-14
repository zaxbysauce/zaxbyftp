/**
 * Accessibility tests for CSS focus-visible and reduced-motion support (Task 1.12).
 *
 * Verifies that:
 *   1. :focus-visible styles exist with an `outline` property (keyboard focus rings).
 *   2. @media (prefers-reduced-motion: reduce) block exists.
 *   3. .animate-pulse has `animation: none` inside the media query.
 *
 * Tests are source-only (no DOM rendering) for determinism and cross-platform
 * compatibility.
 */

import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const _repoRoot = join(import.meta.dir, '..', '..');
const SOURCE = readFileSync(
  join(_repoRoot, 'src/ui/src/index.css'),
  'utf-8',
);

// ── Source extraction helpers ─────────────────────────────────────────────────

/** Extract the full text of a named CSS block (e.g. ':focus-visible'). */
function extractCssBlock(selector: string): string | null {
  // Escape regex special chars in selector
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\}`, 'm');
  const m = re.exec(SOURCE);
  return m ? m[1] : null;
}

/** Returns true when the media query block exists in the source. */
function hasMediaQuery(query: string): boolean {
  return SOURCE.includes(query);
}

/** Extract the body of a named CSS block inside a @media query. */
function extractInsideMediaQuery(mediaQuery: string, selector: string): string | null {
  const queryIdx = SOURCE.indexOf(mediaQuery);
  if (queryIdx === -1) return null;
  const afterQuery = SOURCE.slice(queryIdx);
  const blockEnd = afterQuery.indexOf('}');
  if (blockEnd === -1) return null;
  const mediaBlock = afterQuery.slice(0, blockEnd + 1);
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\}`, 'm');
  const m = re.exec(mediaBlock);
  return m ? m[1] : null;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('CSS :focus-visible — keyboard focus rings', () => {

  test(':focus-visible block exists', () => {
    const block = extractCssBlock(':focus-visible');
    expect(block, ':focus-visible block must exist').not.toBeNull();
  });

  test(':focus-visible has outline property', () => {
    const block = extractCssBlock(':focus-visible');
    expect(block).not.toBeNull();
    expect(
      block!.includes('outline'),
      ':focus-visible must declare an outline property',
    ).toBe(true);
  });

  test(':focus-visible outline includes a valid CSS value (color or style)', () => {
    const block = extractCssBlock(':focus-visible')!;
    // Should have outline: <value> — accept any non-zero width, any color
    const outlineRe = /outline\s*:\s*[^;]+;/;
    expect(
      outlineRe.test(block),
      ':focus-visible outline must be a valid CSS declaration (outline: <value>;)',
    ).toBe(true);
  });

  test(':focus has outline: none (mouse clicks suppress rings)', () => {
    const block = extractCssBlock('*:focus');
    expect(block).not.toBeNull();
    expect(
      block!.includes('outline: none') || block!.includes('outline:none'),
      '*:focus must have outline: none to suppress rings on mouse click',
    ).toBe(true);
  });

  test(':focus-visible appears after :focus in source order', () => {
    const focusIdx = SOURCE.indexOf('*:focus');
    const focusVisibleIdx = SOURCE.indexOf('*:focus-visible');
    expect(focusIdx, '*:focus block must exist').toBeGreaterThan(-1);
    expect(focusVisibleIdx, '*:focus-visible block must exist').toBeGreaterThan(-1);
    expect(
      focusVisibleIdx,
      '*:focus-visible must appear after :focus in the source',
    ).toBeGreaterThan(focusIdx);
  });
});

describe('CSS prefers-reduced-motion — motion safety', () => {

  test('@media (prefers-reduced-motion: reduce) block exists', () => {
    const exists = hasMediaQuery('@media (prefers-reduced-motion: reduce)');
    expect(
      exists,
      '@media (prefers-reduced-motion: reduce) block must exist',
    ).toBe(true);
  });

  test('.animate-pulse is defined inside the reduced-motion media query', () => {
    const pulseInMedia = extractInsideMediaQuery(
      '@media (prefers-reduced-motion: reduce)',
      '.animate-pulse',
    );
    expect(
      pulseInMedia,
      '.animate-pulse must be defined inside the @media (prefers-reduced-motion: reduce) block',
    ).not.toBeNull();
  });

  test('.animate-pulse inside media query disables animation with animation: none', () => {
    const pulseInMedia = extractInsideMediaQuery(
      '@media (prefers-reduced-motion: reduce)',
      '.animate-pulse',
    );
    expect(pulseInMedia).not.toBeNull();
    expect(
      pulseInMedia!.includes('animation: none') || pulseInMedia!.includes('animation:none'),
      '.animate-pulse inside reduced-motion must set animation: none',
    ).toBe(true);
  });

  test('reduced-motion media query block is non-empty', () => {
    const queryIdx = SOURCE.indexOf('@media (prefers-reduced-motion: reduce)');
    expect(queryIdx, 'media query must exist').toBeGreaterThan(-1);
    const afterQuery = SOURCE.slice(queryIdx);
    const blockEnd = afterQuery.indexOf('}');
    expect(blockEnd, 'media query must have closing brace').toBeGreaterThan(0);
    const blockContent = afterQuery.slice(0, blockEnd + 1);
    // Block should contain more than just the opening declaration
    expect(
      blockContent.length > '@media (prefers-reduced-motion: reduce) {}'.length,
      'media query block must contain at least one rule inside the braces',
    ).toBe(true);
  });
});

describe('CSS accessibility — structural integrity', () => {

  test('source file is not empty', () => {
    expect(SOURCE.trim().length, 'index.css must not be empty').toBeGreaterThan(0);
  });

  test('all Tailwind directives are present at the top', () => {
    expect(SOURCE, 'file must start with @tailwind directives').toMatch(/^@tailwind/);
  });

  test(':focus-visible section is commented with accessibility intent', () => {
    const commentIdx = SOURCE.indexOf('Focus-visible');
    expect(
      commentIdx,
      'index.css should have a comment section for :focus-visible accessibility styles',
    ).toBeGreaterThan(-1);
  });

  test('reduced-motion section is commented with accessibility intent', () => {
    const commentIdx = SOURCE.indexOf('Reduced motion');
    expect(
      commentIdx,
      'index.css should have a comment section for reduced motion styles',
    ).toBeGreaterThan(-1);
  });
});
