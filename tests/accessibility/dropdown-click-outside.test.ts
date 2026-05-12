/**
 * Accessibility / memory-leak tests for TopBar.tsx site dropdown click-outside handler.
 *
 * Verifies that:
 *   1. useEffect has `showSites` in its dependency array so it re-runs on toggle.
 *   2. Document-level click listener is added (capture phase) when showSites is true.
 *   3. Cleanup removes the listener when showSites changes.
 *   4. The handler only calls setShowSites(false) when the click target is outside
 *      the dropdown ref — clicks inside should NOT close the dropdown.
 *   5. The early-return guard (`if (!showSites) return;`) prevents stale listeners.
 *
 * Tests are source-only (no DOM rendering) for determinism and cross-platform
 * compatibility.
 */

import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// import.meta.dir = C:\opencode\zaxbyftp\tests\accessibility
// join(import.meta.dir, '..', '..') = C:\opencode\zaxbyftp (repo root)
const _repoRoot = join(import.meta.dir, '..', '..');
const SOURCE = readFileSync(
  join(_repoRoot, 'src', 'ui', 'src', 'components', 'TopBar.tsx'),
  'utf-8',
);

// ── Source extraction helpers ─────────────────────────────────────────────────

/**
 * Extract the body of a named useEffect call from the TopBar function.
 * Finds the useEffect whose body contains the given identifier keyword.
 */
function extractUseEffect(keyword: string): string | null {
  const topBarStart = SOURCE.indexOf('export function TopBar()');
  if (topBarStart === -1) return null;

  // The TopBar function ends at the first top-level helper function (defaultPort)
  // Use '// ── Helpers' as the boundary marker (works with any line-ending format)
  const topBarEnd = SOURCE.indexOf('// ── Helpers');
  if (topBarEnd === -1) return null;

  const topBarBody = SOURCE.slice(topBarStart, topBarEnd);

  // Match useEffect with arbitrary body, ending with a dependency array
  // Handles: useEffect(() => { ... }, [deps])
  // \r?\n handles both LF (Unix) and CRLF (Windows) line endings
  const useEffectRe = /useEffect\s*\(\s*\(\s*\)\s*=>\s*\{([\s\S]*?)\r?\n\s*\}\s*,\s*\[([^\]]*)\]\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = useEffectRe.exec(topBarBody)) !== null) {
    const body = m[1];
    if (body.includes(keyword)) {
      return body;
    }
  }
  return null;
}

/** Returns true when the dependency array contains `showSites`. */
function hasShowSitesDependency(deps: string): boolean {
  return /\bshowSites\b/.test(deps);
}

/** Returns true when `addEventListener('click', …, { capture: true })` is present. */
function addsClickCaptureListener(effectBody: string): boolean {
  return /addEventListener\s*\(\s*['"]click['"]\s*,/.test(effectBody)
    && effectBody.includes('{ capture: true }');
}

/** Returns true when `removeEventListener('click', …, { capture: true })` is present. */
function removesClickCaptureListener(effectBody: string): boolean {
  return /removeEventListener\s*\(\s*['"]click['"]\s*,/.test(effectBody)
    && effectBody.includes('{ capture: true }');
}

/**
 * Returns true when the effect has an early-return guard: `if (!showSites) return;`.
 * This prevents the listener from being added when the dropdown is closed.
 */
function hasEarlyReturnGuard(effectBody: string): boolean {
  return /if\s*\(\s*!\s*showSites\s*\)\s*return/.test(effectBody);
}

/**
 * Returns true when the click handler calls setShowSites(false) only when
 * the click target is outside the dropdownRef — i.e. it checks
 * `!dropdownRef.current.contains(e.target)`.
 */
function onlyClosesOnOutsideClick(effectBody: string): boolean {
  // The handler should:
  // 1. Check dropdownRef.current exists
  // 2. Use .contains() to verify the click target is OUTSIDE the ref
  // 3. Only then call setShowSites(false)
  return /dropdownRef\.current\s*&&.*!dropdownRef\.current\.contains\s*\(/.test(effectBody)
    && /setShowSites\s*\(\s*false\s*\)/.test(effectBody);
}

/**
 * Returns the dependency array string from the useEffect that contains `keyword`.
 */
function getEffectDeps(keyword: string): string | null {
  const topBarStart = SOURCE.indexOf('export function TopBar()');
  if (topBarStart === -1) return null;

  const topBarEnd = SOURCE.indexOf('// ── Helpers');
  if (topBarEnd === -1) return null;

  const topBarBody = SOURCE.slice(topBarStart, topBarEnd);

  // \r?\n handles both LF (Unix) and CRLF (Windows) line endings
  const useEffectRe = /useEffect\s*\(\s*\(\s*\)\s*=>\s*\{([\s\S]*?)\r?\n\s*\}\s*,\s*\[([^\]]*)\]\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = useEffectRe.exec(topBarBody)) !== null) {
    const body = m[1];
    const deps = m[2];
    if (body.includes(keyword)) {
      return deps;
    }
  }
  return null;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('TopBar site dropdown click-outside — useEffect structure', () => {

  test('click-outside useEffect exists in TopBar', () => {
    const effectBody = extractUseEffect('handleClickOutside');
    expect(effectBody, 'useEffect with handleClickOutside must exist').not.toBeNull();
  });

  test('useEffect has showSites in its dependency array', () => {
    const deps = getEffectDeps('handleClickOutside');
    expect(deps, 'dependency array must not be null').not.toBeNull();
    expect(
      hasShowSitesDependency(deps!),
      `useEffect deps must include showSites, got: [${deps}]`,
    ).toBe(true);
  });

  test('useEffect has early-return guard when showSites is false', () => {
    const effectBody = extractUseEffect('handleClickOutside');
    expect(effectBody).not.toBeNull();
    expect(
      hasEarlyReturnGuard(effectBody!),
      'useEffect must have "if (!showSites) return;" guard to avoid adding stale listeners',
    ).toBe(true);
  });

  test('document.addEventListener is called with "click" event', () => {
    const effectBody = extractUseEffect('handleClickOutside');
    expect(effectBody).not.toBeNull();
    expect(
      effectBody!.includes("addEventListener('click'"),
      'useEffect must call document.addEventListener("click", …)',
    ).toBe(true);
  });

  test('addEventListener uses capture phase ({ capture: true })', () => {
    const effectBody = extractUseEffect('handleClickOutside');
    expect(effectBody).not.toBeNull();
    expect(
      addsClickCaptureListener(effectBody!),
      'addEventListener must pass { capture: true } to intercept clicks in capture phase',
    ).toBe(true);
  });

  test('cleanup calls document.removeEventListener for "click"', () => {
    const effectBody = extractUseEffect('handleClickOutside');
    expect(effectBody).not.toBeNull();
    expect(
      effectBody!.includes("removeEventListener('click'"),
      'cleanup must call document.removeEventListener("click", …)',
    ).toBe(true);
  });

  test('cleanup removeEventListener also uses capture: true (must match registration)', () => {
    const effectBody = extractUseEffect('handleClickOutside');
    expect(effectBody).not.toBeNull();
    expect(
      removesClickCaptureListener(effectBody!),
      'removeEventListener must also pass { capture: true } to correctly remove the listener',
    ).toBe(true);
  });

  test('cleanup is returned as an anonymous arrow function', () => {
    const effectBody = extractUseEffect('handleClickOutside');
    expect(effectBody).not.toBeNull();
    // The cleanup must be: return () => { ... }  OR  return () => expr;
    // Handles both braced bodies (return () => { ... }) and concise bodies (return () => expr;)
    const cleanupReturnRe = /return\s+\(\s*\)\s*=>\s*(?:\{|[\s\S]*?;)/;
    expect(
      cleanupReturnRe.test(effectBody!),
      'useEffect must return an anonymous arrow cleanup: return () => { … } or return () => expr;',
    ).toBe(true);
  });
});

describe('TopBar site dropdown click-outside — handler logic', () => {

  test('handler checks dropdownRef.current before calling contains', () => {
    const effectBody = extractUseEffect('handleClickOutside');
    expect(effectBody).not.toBeNull();
    expect(
      effectBody!.includes('dropdownRef.current'),
      'handler must check dropdownRef.current before calling contains()',
    ).toBe(true);
  });

  test('handler uses contains() to detect click target', () => {
    const effectBody = extractUseEffect('handleClickOutside');
    expect(effectBody).not.toBeNull();
    expect(
      effectBody!.includes('.contains('),
      'handler must call dropdownRef.current.contains(target) to check if click is inside',
    ).toBe(true);
  });

  test('handler only closes dropdown when click target is OUTSIDE the ref (!contains)', () => {
    const effectBody = extractUseEffect('handleClickOutside');
    expect(effectBody).not.toBeNull();
    expect(
      onlyClosesOnOutsideClick(effectBody!),
      'handler must call setShowSites(false) only when !dropdownRef.current.contains(target) — ' +
      'clicks inside the dropdown must NOT trigger closure',
    ).toBe(true);
  });

  test('handler type-casts e.target to Node (required for contains())', () => {
    const effectBody = extractUseEffect('handleClickOutside');
    expect(effectBody).not.toBeNull();
    // e.target is cast as Node: e.target as Node
    expect(
      /e\.target\s+as\s+Node/.test(effectBody!),
      'e.target must be cast to Node: e.target as Node',
    ).toBe(true);
  });
});

describe('TopBar site dropdown click-outside — memory leak prevention', () => {

  test('showSites dependency ensures cleanup runs when dropdown is closed', () => {
    // When showSites goes true→false, the effect re-runs:
    //   1. The new effect body runs: !showSites is true, so it returns early (no new listener added)
    //   2. The OLD effect's cleanup runs: removeEventListener is called, removing the stale listener
    // This is the core memory-leak prevention mechanism.
    const deps = getEffectDeps('handleClickOutside');
    expect(deps).not.toBeNull();
    expect(
      hasShowSitesDependency(deps!),
      'showSites dep ensures cleanup runs on state change, preventing orphaned listeners',
    ).toBe(true);
  });

  test('early return prevents listener addition when dropdown is closed', () => {
    // When showSites is false, the effect returns immediately without calling addEventListener.
    // Combined with showSites dep, this means:
    //   - showSites=true: listener added
    //   - showSites=false: early return (no new listener) + cleanup (removes old listener)
    const effectBody = extractUseEffect('handleClickOutside');
    expect(effectBody).not.toBeNull();
    expect(
      hasEarlyReturnGuard(effectBody!),
      'early return prevents listener from being added when showSites is false',
    ).toBe(true);
  });

  test('handleClickOutside is defined inline inside the effect (not module-scoped)', () => {
    // Inline definition ensures the handler closure captures the current dropdownRef.
    // If defined outside the effect, the ref could go stale.
    const effectBody = extractUseEffect('handleClickOutside');
    expect(effectBody).not.toBeNull();
    expect(
      effectBody!.includes('const handleClickOutside'),
      'handler must be declared inside the useEffect to close over the current dropdownRef',
    ).toBe(true);
  });
});

describe('TopBar site dropdown click-outside — integration contract', () => {

  test('dropdownRef is declared before the click-outside useEffect', () => {
    const topBarStart = SOURCE.indexOf('export function TopBar()');
    const topBarEnd = SOURCE.indexOf('\n\n// ── Helpers ─────────────────────────');
    const topBarBody = SOURCE.slice(topBarStart, topBarEnd);

    const useEffectIdx = topBarBody.indexOf('useEffect');
    const dropdownRefIdx = topBarBody.indexOf('const dropdownRef');

    expect(dropdownRefIdx, 'dropdownRef must be declared').toBeGreaterThan(-1);
    expect(useEffectIdx, 'useEffect must exist').toBeGreaterThan(-1);
    expect(
      dropdownRefIdx,
      'dropdownRef must be declared BEFORE the useEffect so the ref is available',
    ).toBeLessThan(useEffectIdx);
  });

  test('showSites state is declared before the click-outside useEffect', () => {
    const topBarStart = SOURCE.indexOf('export function TopBar()');
    const topBarEnd = SOURCE.indexOf('\n\n// ── Helpers ─────────────────────────');
    const topBarBody = SOURCE.slice(topBarStart, topBarEnd);

    const useEffectIdx = topBarBody.indexOf('useEffect');
    const showSitesIdx = topBarBody.indexOf('const [showSites, setShowSites]');

    expect(showSitesIdx, 'const [showSites, setShowSites] must be declared').toBeGreaterThan(-1);
    expect(useEffectIdx, 'useEffect must exist').toBeGreaterThan(-1);
    expect(
      showSitesIdx,
      'showSites state must be declared BEFORE the useEffect so the dep is valid',
    ).toBeLessThan(useEffectIdx);
  });

  test('Sites button onClick toggles showSites (setShowSites)', () => {
    // Verify the Sites button exists and calls setShowSites
    const sitesButtonMatch = SOURCE.match(
      /<button[^>]*\n?\s*onClick=\{\(\)\s*=>\s*setShowSites/,
    );
    expect(sitesButtonMatch, 'Sites button must have onClick that toggles showSites').not.toBeNull();
  });

  test('dropdown div has the dropdownRef attached', () => {
    // The div wrapping the dropdown panel must have ref={dropdownRef}.
    // Approach: verify the div with ref={dropdownRef} exists and that the
    // Sites button appears AFTER it (indicating it is nested inside).
    const divRefIdx = SOURCE.indexOf('ref={dropdownRef}');
    expect(
      divRefIdx,
      'dropdownRef must be declared on the dropdown container div',
    ).toBeGreaterThan(-1);

    // The Sites button's onClick references setShowSites and the text is "Sites <ChevronDown"
    const sitesIdx = SOURCE.indexOf('Sites <ChevronDown');
    expect(
      sitesIdx,
      '"Sites <ChevronDown" text must exist (Sites button text content)',
    ).toBeGreaterThan(-1);
    expect(
      sitesIdx,
      'Sites button must appear after the dropdownRef div (i.e., be nested inside it)',
    ).toBeGreaterThan(divRefIdx);
  });

  test('dropdown panel is conditionally rendered only when showSites is true', () => {
    // The dropdown panel div should be inside {showSites && (…)}
    const conditionalRenderMatch = SOURCE.match(
      /\{showSites\s*&&\s*\(/,
    );
    expect(
      conditionalRenderMatch,
      'dropdown panel must be conditionally rendered: {showSites && (…)}',
    ).not.toBeNull();
  });
});
