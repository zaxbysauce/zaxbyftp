/**
 * Accessibility / memory-leak tests for App.tsx splitter useEffect cleanup.
 *
 * Verifies that:
 *   1. useEffect has an empty dependency array so cleanup runs on unmount.
 *   2. The cleanup function removes mousemove and mouseup listeners from window.
 *   3. The cleanup resets the dragging ref and cursor/userSelect styles.
 *
 * Tests are source-only (no DOM rendering) for determinism and cross-platform
 * compatibility.
 */

import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const _repoRoot = join(import.meta.dir, '..', '..');
const SOURCE = readFileSync(
  join(_repoRoot, 'src/ui/src/App.tsx'),
  'utf-8',
);

// ── Source extraction helpers ─────────────────────────────────────────────────

/** Extract the body of a named useEffect call from the Layout function. */
function extractUseEffect(name: string): string | null {
  // Find the Layout function body
  const layoutStart = SOURCE.indexOf('function Layout()');
  const layoutEnd = SOURCE.indexOf('\nexport function App()');
  if (layoutStart === -1 || layoutEnd === -1) return null;
  const layoutBody = SOURCE.slice(layoutStart, layoutEnd);

  // Find the useEffect
  const useEffectRe = /useEffect\s*\(\s*\(\s*\)\s*=>\s*\{([\s\S]*?)\n\s*\}\s*,\s*\[\]\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = useEffectRe.exec(layoutBody)) !== null) {
    const body = m[1];
    if (body.includes(name)) {
      return body;
    }
  }
  return null;
}

/** Returns true when `removeEventListener` is called for `eventName`. */
function removesListener(effectBody: string, eventName: string): boolean {
  return effectBody.includes(`removeEventListener('${eventName}'`)
    || effectBody.includes(`removeEventListener("${eventName}"`);
}

/** Returns true when `ref.current = false` appears in the body. */
function resetsDraggingRef(effectBody: string): boolean {
  return /dragging\.current\s*=\s*false/.test(effectBody);
}

/** Returns true when cursor style is reset (cursor = ''). */
function resetsCursor(effectBody: string): boolean {
  return /document\.body\.style\.cursor\s*=\s*['"]['"]/.test(effectBody);
}

/** Returns true when userSelect style is reset. */
function resetsUserSelect(effectBody: string): boolean {
  return /document\.body\.style\.userSelect\s*=\s*['"]['"]/.test(effectBody);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('splitter useEffect cleanup — memory leak prevention', () => {

  test('useEffect has an empty dependency array (runs on unmount)', () => {
    // Must have exactly one useEffect with deps [...], which is []
    // The splitter cleanup effect contains the text "removeEventListener"
    const effectBody = extractUseEffect('removeEventListener');
    expect(effectBody, 'useEffect with removeEventListener cleanup must exist').not.toBeNull();
  });

  test('cleanup removes mousemove listener from window', () => {
    const effectBody = extractUseEffect('removeEventListener');
    expect(effectBody).not.toBeNull();
    expect(
      removesListener(effectBody!, 'mousemove'),
      'cleanup must call window.removeEventListener("mousemove", …)',
    ).toBe(true);
  });

  test('cleanup removes mouseup listener from window', () => {
    const effectBody = extractUseEffect('removeEventListener');
    expect(effectBody).not.toBeNull();
    expect(
      removesListener(effectBody!, 'mouseup'),
      'cleanup must call window.removeEventListener("mouseup", …)',
    ).toBe(true);
  });

  test('cleanup resets dragging.current ref to false', () => {
    const effectBody = extractUseEffect('removeEventListener');
    expect(effectBody).not.toBeNull();
    expect(
      resetsDraggingRef(effectBody!),
      'cleanup must reset dragging.current = false',
    ).toBe(true);
  });

  test('cleanup resets document.body.style.cursor to empty string', () => {
    const effectBody = extractUseEffect('removeEventListener');
    expect(effectBody).not.toBeNull();
    expect(
      resetsCursor(effectBody!),
      'cleanup must reset document.body.style.cursor = ""',
    ).toBe(true);
  });

  test('cleanup resets document.body.style.userSelect to empty string', () => {
    const effectBody = extractUseEffect('removeEventListener');
    expect(effectBody).not.toBeNull();
    expect(
      resetsUserSelect(effectBody!),
      'cleanup must reset document.body.style.userSelect = ""',
    ).toBe(true);
  });

  test('cleanup only removes listeners when dragging.current is true (guard)', () => {
    const effectBody = extractUseEffect('removeEventListener');
    expect(effectBody).not.toBeNull();
    // The cleanup should be wrapped in: if (dragging.current) { ... }
    const guarded = /if\s*\(\s*dragging\.current\s*\)/.test(effectBody!);
    expect(
      guarded,
      'cleanup body should be guarded by if (dragging.current) { … } to avoid removing stale listeners',
    ).toBe(true);
  });

  test('useEffect return value is an anonymous cleanup function (arrow fn return)', () => {
    const layoutStart = SOURCE.indexOf('function Layout()');
    const layoutEnd = SOURCE.indexOf('\nexport function App()');
    const layoutBody = SOURCE.slice(layoutStart, layoutEnd);

    // The cleanup useEffect should have: return () => { ... }
    const cleanupReturnRe =
      /useEffect\s*\(\s*\(\s*\)\s*=>\s*\{\s*return\s+\(\s*\)\s*=>\s*\{/;
    expect(
      cleanupReturnRe.test(layoutBody),
      'useEffect cleanup must return an arrow function: return () => { … }',
    ).toBe(true);
  });

  test('cleanup removes listeners stored via refs (onMoveRef / onUpRef)', () => {
    const effectBody = extractUseEffect('removeEventListener');
    expect(effectBody).not.toBeNull();
    // Cleanup uses refs to access the bound listeners, not inline closures
    expect(effectBody!).toContain('onMoveRef.current');
    expect(effectBody!).toContain('onUpRef.current');
  });

  test('onMoveRef and onUpRef are declared before useEffect (refs exist for cleanup)', () => {
    const layoutStart = SOURCE.indexOf('function Layout()');
    const layoutEnd = SOURCE.indexOf('\nexport function App()');
    const layoutBody = SOURCE.slice(layoutStart, layoutEnd);

    const useEffectIdx = layoutBody.indexOf('useEffect');
    const onMoveRefIdx = layoutBody.indexOf('const onMoveRef');
    const onUpRefIdx = layoutBody.indexOf('const onUpRef');

    expect(onMoveRefIdx, 'onMoveRef must be declared').toBeGreaterThan(-1);
    expect(onUpRefIdx, 'onMoveRef must be declared').toBeGreaterThan(-1);

    // Both refs must be declared before useEffect so the cleanup can access them
    expect(onMoveRefIdx, 'onMoveRef must be declared before useEffect').toBeLessThan(useEffectIdx);
    expect(onUpRefIdx, 'onUpRef must be declared before useEffect').toBeLessThan(useEffectIdx);
  });
});

describe('splitter — runtime listener registration', () => {

  test('onSplitterMouseDown registers mousemove and mouseup on mousedown', () => {
    // Verify the mousedown handler calls addEventListener for both events
    const layoutStart = SOURCE.indexOf('function Layout()');
    const layoutEnd = SOURCE.indexOf('\nexport function App()');
    const layoutBody = SOURCE.slice(layoutStart, layoutEnd);

    expect(
      layoutBody.includes("addEventListener('mousemove'"),
      'onSplitterMouseDown must call addEventListener("mousemove", …)',
    ).toBe(true);

    expect(
      layoutBody.includes("addEventListener('mouseup'"),
      'onSplitterMouseDown must call addEventListener("mouseup", …)',
    ).toBe(true);
  });

  test('splitter div has onMouseDown handler attached', () => {
    const splitterTag = SOURCE.match(/<div\s+[^>]*className="splitter"[^>]*>/);
    expect(splitterTag, '<div className="splitter"> must exist').not.toBeNull();
    expect(splitterTag![0], 'splitter div must have onMouseDown').toContain('onMouseDown');
    expect(
      splitterTag![0].includes('onSplitterMouseDown'),
      'splitter onMouseDown must bind onSplitterMouseDown',
    ).toBe(true);
  });
});
