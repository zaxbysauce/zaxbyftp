/**
 * Verification tests for SftpFileClient.Disconnect() cancellation behavior.
 *
 * Verifies that CancellationToken.ThrowIfCancellationRequested() is called at
 * appropriate checkpoints inside Disconnect():
 *   - Checkpoint 1 : at method entry, before clearing state
 *   - Checkpoint 2 : after nulling _sftp / _profile, before sftp.Disconnect()
 *
 * These are source-code verification tests.  SftpFileClient is a WPF/Windows
 * desktop adapter backed by SSH.NET and cannot be executed on the cross-platform
 * bun:test runner, so we validate the source text directly.
 */
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const sourcePath = join(import.meta.dir, '../../Adapters/SftpFileClient.cs');
const source = readFileSync(sourcePath, 'utf-8');

/**
 * Extract a method body by locating its opening brace and counting nested
 * braces to find the matching closing brace.
 */
function extractMethodBody(methodName: string): string {
  const sigPatterns = [
    // Covers "public void Disconnect(...)"
    new RegExp(`public\\s+void\\s+${methodName}\\s*\\(`),
  ];
  let sigMatch: RegExpMatchArray | null = null;
  for (const p of sigPatterns) {
    sigMatch = source.match(p);
    if (sigMatch && sigMatch.index !== undefined) break;
  }
  if (!sigMatch || sigMatch.index === undefined) return '';

  const openIdx = source.indexOf('{', sigMatch.index + sigMatch[0].length);
  if (openIdx === -1) return '';

  let depth = 0;
  let i = openIdx;
  while (i < source.length) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) return source.slice(openIdx + 1, i);
    }
    i++;
  }
  return '';
}

/**
 * Returns all 0-based line numbers within the body where the given needle
 * appears, or an empty array if absent.
 */
function linesContaining(body: string, needle: string): number[] {
  const result: number[] = [];
  body.split('\n').forEach((line, i) => {
    if (line.includes(needle)) result.push(i);
  });
  return result;
}

describe('SftpFileClient.Disconnect Cancellation Behavior', () => {
  const body = extractMethodBody('Disconnect');

  test('Disconnect method exists and is public void', () => {
    expect(body).not.toBe('');
    const sigMatch = source.match(/public\s+void\s+Disconnect\s*\(/);
    expect(sigMatch).not.toBeNull();
  });

  test('Disconnect declares CancellationToken parameter with default', () => {
    const match = source.match(
      /Disconnect\s*\(\s*CancellationToken\s+cancellationToken\s*=\s*default\s*\)/,
    );
    expect(match).not.toBeNull();
  });

  // ── Checkpoint 1 : entry ThrowIf ──────────────────────────────────────────

  describe('Checkpoint 1 — ThrowIfCancellationRequested at entry', () => {
    test('has ThrowIfCancellationRequested() call in method body', () => {
      const matches = body.match(/ThrowIfCancellationRequested\(\)/g) ?? [];
      expect(matches.length).toBeGreaterThan(0);
    });

    test('first ThrowIfCancellationRequested() appears BEFORE _sftp = null', () => {
      const throwLines = linesContaining(body, 'ThrowIfCancellationRequested()');
      const nullLine = linesContaining(body, '_sftp    = null')[0] ??
                       linesContaining(body, '_sftp = null')[0] ??
                       -1;
      expect(throwLines[0]).toBeDefined();
      expect(throwLines[0]).not.toBe(-1);
      expect(nullLine).not.toBe(-1);
      expect(throwLines[0]).toBeLessThan(nullLine);
    });

    test('first ThrowIfCancellationRequested() appears BEFORE _profile = null', () => {
      const throwLines = linesContaining(body, 'ThrowIfCancellationRequested()');
      const nullLine = linesContaining(body, '_profile = null')[0] ??
                       linesContaining(body, '_profile= null')[0] ??
                       -1;
      expect(throwLines[0]).toBeDefined();
      expect(throwLines[0]).not.toBe(-1);
      expect(nullLine).not.toBe(-1);
      expect(throwLines[0]).toBeLessThan(nullLine);
    });

    test('entry ThrowIf is the FIRST statement in the method body', () => {
      const firstNonEmpty = body.split('\n').find((l) => l.trim() !== '');
      expect(firstNonEmpty).toBeDefined();
      expect(firstNonEmpty!.trim()).toMatch(
        /^\s*cancellationToken\.ThrowIfCancellationRequested\(\);?\s*$/,
      );
    });
  });

  // ── Checkpoint 2 : pre-disconnect ThrowIf ─────────────────────────────────

  describe('Checkpoint 2 — ThrowIfCancellationRequested before sftp.Disconnect()', () => {
    test('has at least two ThrowIfCancellationRequested() calls (entry + pre-disconnect)', () => {
      const matches = body.match(/ThrowIfCancellationRequested\(\)/g) ?? [];
      expect(matches.length).toBeGreaterThanOrEqual(2);
    });

    test('second ThrowIfCancellationRequested() appears BEFORE sftp.Disconnect()', () => {
      const throwLines = linesContaining(body, 'ThrowIfCancellationRequested()');
      const disconnectLines = linesContaining(body, 'sftp.Disconnect()');
      expect(throwLines[0]).not.toBe(-1);
      expect(throwLines[1]).toBeDefined();
      expect(throwLines[1]).not.toBe(-1);
      expect(disconnectLines[0]).not.toBe(-1);
      expect(throwLines[1]).toBeLessThan(disconnectLines[0]);
    });

    test('ThrowIf appears AFTER state nulling (_sftp = null / _profile = null)', () => {
      const throwLines = linesContaining(body, 'ThrowIfCancellationRequested()');
      const stateNullLines = [
        ...linesContaining(body, '_sftp    = null'),
        ...linesContaining(body, '_sftp = null'),
        ...linesContaining(body, '_profile = null'),
      ];
      const lastNullLine = Math.max(...stateNullLines);
      expect(throwLines[1]).toBeDefined();
      expect(throwLines[1]).toBeGreaterThan(lastNullLine);
    });
  });

  // ── sftp.Disconnect() call exists ─────────────────────────────────────────

  describe('sftp.Disconnect() call', () => {
    test('sftp.Disconnect() is called inside the method body', () => {
      expect(body).toContain('sftp.Disconnect()');
    });

    test('sftp.Disconnect() is wrapped in a try-catch (best-effort)', () => {
      expect(body).toContain('try');
      expect(body).toContain('catch');
    });

    test('sftp.Dispose() is called after Disconnect()', () => {
      const disconnectLine = linesContaining(body, 'sftp.Disconnect()')[0] ?? -1;
      const disposeLine = linesContaining(body, 'sftp.Dispose()')[0] ?? -1;
      expect(disconnectLine).not.toBe(-1);
      expect(disposeLine).not.toBe(-1);
      expect(disposeLine).toBeGreaterThan(disconnectLine);
    });
  });

  // ── No ThrowIf after state is cleared ─────────────────────────────────────

  describe('state is nulled before the blocking Disconnect() call', () => {
    test('_sftp is nulled before sftp.Disconnect()', () => {
      const nullLines = [
        ...linesContaining(body, '_sftp    = null'),
        ...linesContaining(body, '_sftp = null'),
      ];
      const disconnectLine = linesContaining(body, 'sftp.Disconnect()')[0] ?? -1;
      expect(nullLines[0]).toBeDefined();
      expect(nullLines[0]).not.toBe(-1);
      expect(disconnectLine).not.toBe(-1);
      expect(nullLines[0]).toBeLessThan(disconnectLine);
    });

    test('_profile is nulled before sftp.Disconnect()', () => {
      const nullLines = linesContaining(body, '_profile = null');
      const disconnectLine = linesContaining(body, 'sftp.Disconnect()')[0] ?? -1;
      expect(nullLines[0]).toBeDefined();
      expect(nullLines[0]).not.toBe(-1);
      expect(disconnectLine).not.toBe(-1);
      expect(nullLines[0]).toBeLessThan(disconnectLine);
    });
  });

  // ── Exactly two ThrowIf calls ───────────────────────────────────────────────

  describe('total ThrowIfCancellationRequested count', () => {
    test('Disconnect has exactly 2 ThrowIfCancellationRequested calls', () => {
      const matches = body.match(/ThrowIfCancellationRequested\(\)/g) ?? [];
      expect(matches).toHaveLength(2);
    });

    test('the 2 ThrowIf calls are at entry and pre-disconnect (not inside if/try blocks)', () => {
      // Both calls should appear before the "if (sftp is null) return" guard.
      const throwLines = linesContaining(body, 'ThrowIfCancellationRequested()');
      const guardLine = linesContaining(body, 'if (sftp is null) return')[0] ?? -1;

      expect(throwLines[0]).toBeLessThan(guardLine);
      // Second ThrowIf is after the guard's closing brace (depth 0 again),
      // which lands between the guard and sftp.Disconnect().
      expect(throwLines[1]).toBeGreaterThan(guardLine);
    });
  });

  // ── Disconnect early-exit when not connected ───────────────────────────────

  describe('early exit when _sftp is null', () => {
    test('has "if (sftp is null) return" guard after state is cleared', () => {
      expect(body).toContain('if (sftp is null) return');
    });

    test('ThrowIf at entry is BEFORE the null guard (so cancellation before clear is rejected)', () => {
      const throwLine = linesContaining(body, 'ThrowIfCancellationRequested()')[0];
      const guardLine = linesContaining(body, 'if (sftp is null) return')[0];
      expect(throwLine).toBeLessThan(guardLine);
    });
  });

  // ── Disposal guard: Dispose() calls Disconnect() ───────────────────────────

  describe('Dispose() wires to Disconnect()', () => {
    test('Dispose() exists and calls Disconnect()', () => {
      // Check the source directly: "public void Dispose() => Disconnect();"
      // or "public void Dispose() { Disconnect(); }" — either form is valid.
      // "public void Dispose() => Disconnect();"  — lambda expression form
      expect(source).toMatch(/public\s+void\s+Dispose\s*\(\s*\)\s*=>\s*Disconnect\s*\(\s*\)\s*;/);
    });
  });
});
