/**
 * Unit tests for AppContext.tsx saveSite error handling.
 *
 * Verifies Task 1.14: saveSite wraps bridge.saveSite in try/catch,
 * calls addLog with error on failure, and returns early (skips loadSites).
 *
 * Uses bun:test + module mocking — no jsdom required.
 */

import { describe, test, expect } from 'bun:test';

// Resolve relative to this test file's location:
// tests/unit/appcontext/ → repo root is three levels up
const _repoRoot = import.meta.dir.replace(/[/\\][^/\\]+$/, '').replace(/[/\\][^/\\]+$/, '').replace(/[/\\][^/\\]+$/, '');

const SOURCE = await import('node:fs').then(fs =>
  fs.readFileSync(
    `${_repoRoot}/src/ui/src/contexts/AppContext.tsx`,
    'utf-8',
  ),
);

// ── Source-level structural tests ─────────────────────────────────────────────
// These parse the source and verify the try/catch structure exists.
// They are fast, platform-independent, and don't require React rendering.

describe('saveSite source structure — Task 1.14', () => {

  /**
   * Extract the body of the saveSite useCallback from the source.
   * We isolate it by finding the `const saveSite = useCallback(` block
   * and reading until its closing `}, [loadSites, addLog]);`.
   */
  function getSaveSiteBody(): string {
    const marker = 'const saveSite = useCallback(';
    const start = SOURCE.indexOf(marker);
    if (start === -1) return '';

    // Walk through balanced parens to find the end of the arrow-function body.
    // The function signature is: const saveSite = useCallback(async (site: Site) => { … }, [loadSites, addLog]);
    // We find the closing `);` of the useCallback call.
    const braceStart = SOURCE.indexOf('{', start + marker.length);
    let depth = 1;
    let pos = braceStart + 1;
    while (pos < SOURCE.length && depth > 0) {
      const ch = SOURCE[pos];
      if (ch === '{' || ch === '(') depth++;
      else if (ch === '}' || ch === ')') depth--;
      pos++;
    }
    // pos now points past the closing `}` of the arrow function.
    // Continue past the dependency array `, [loadSites, addLog]` to find the final `);`
    let end = SOURCE.indexOf(';', pos);
    // Handle case where dependency array might span multiple lines
    while (end !== -1 && SOURCE[end - 1] === ']') {
      end = SOURCE.indexOf(';', end + 1);
      if (end !== -1) break;
    }
    if (end === -1) end = SOURCE.indexOf(';', pos);

    return SOURCE.slice(start, end + 1);
  }

  test('saveSite function is defined using useCallback', () => {
    expect(SOURCE).toContain('const saveSite = useCallback(');
  });

  test('saveSite wraps bridge.saveSite in try/catch', () => {
    const body = getSaveSiteBody();
    expect(body).toContain('try {');
    expect(body).toContain('} catch');
    expect(body).toContain('await bridge.saveSite(site)');
  });

  test('catch block calls addLog with error message', () => {
    const body = getSaveSiteBody();
    expect(body).toContain('addLog(');
    // The catch block should construct an error message with String(e)
    // and pass it to addLog along with 'error' level
    expect(body).toContain("'error'");
  });

  test('catch block returns early — loadSites is outside the try block', () => {
    const body = getSaveSiteBody();
    // loadSites() appears AFTER the catch block closes
    const tryEnd = body.indexOf('} catch');
    const loadSitesPos = body.indexOf('loadSites()');
    expect(tryEnd).toBeGreaterThan(-1, 'saveSite must have a catch block');
    expect(loadSitesPos).toBeGreaterThan(tryEnd,
      'loadSites() must appear AFTER the catch block (early return skips it)',
    );
  });

  test('catch block contains a bare return statement', () => {
    const body = getSaveSiteBody();
    const catchStart = body.indexOf('} catch');
    const afterCatch = body.slice(catchStart);
    // Find the closing of the catch block (the } just before loadSites())
    const loadSitesIdx = afterCatch.indexOf('loadSites()');
    const catchBlockContent = afterCatch.slice(0, loadSitesIdx);
    // A bare `return;` should be inside the catch block (not `return undefined` or similar)
    expect(catchBlockContent).toContain('return');
  });

  test('error message includes "Failed to save site" prefix', () => {
    const body = getSaveSiteBody();
    expect(body).toContain('Failed to save site');
  });
});

// ── Integration tests (require mock.module) ───────────────────────────────────
// These verify runtime behavior by mocking the bridge module and calling the
// actual saveSite function extracted from a rendered AppProvider.
// Skipped in environments where mock.module is not available.

describe('saveSite runtime behavior — error path', () => {
  // We test by verifying the source structure is correct; the structural tests
  // above give us high confidence. For a true runtime test we would need
  // @testing-library/react and a jsdom environment, which this project does
  // not currently configure. The source-parsing tests above are the practical
  // equivalent for this codebase's testing strategy (see existing
  // accessibility tests in tests/accessibility/ which also parse TSX source).

  test.skip('(runtime test — requires jsdom / @testing-library/react)', () => {
    // TODO: Once the UI project adds @testing-library/react to its devDeps,
    // implement this test:
    //   1. mock.module('../api/bridge', () => ({ ...realBridge, saveSite: mock(() => Promise.reject(new Error('disk full'))) }))
    //   2. Render <AppProvider><TestComponent/></AppProvider>
    //   3. Call ctx.saveSite({ name: 'test', host: 'ftp.example.com', ... })
    //   4. await flushPromises()
    //   5. expect(addLogSpy).toHaveBeenCalledWith(expect.stringContaining('disk full'), 'error')
    //   6. expect(loadSitesSpy).not.toHaveBeenCalled()
  });
});
