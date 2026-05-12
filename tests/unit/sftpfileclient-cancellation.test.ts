/**
 * Verification tests for Task 2.3 — SftpFileClient CancellationToken
 *
 * Verifies:
 * - All 7 async methods declare CancellationToken cancellationToken = default
 * - All Task.Run calls pass cancellationToken
 */
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const sourcePath = join(import.meta.dir, '../../Adapters/SftpFileClient.cs');
const source = readFileSync(sourcePath, 'utf-8');

const METHODS = [
  'ConnectAsync',
  'ListDirectoryAsync',
  'UploadAsync',
  'DownloadAsync',
  'MkdirAsync',
  'RenameAsync',
  'DeleteAsync',
] as const;

// Extract a method body by locating its opening brace and counting
// nested braces to find the matching closing brace.
function extractMethodBody(methodName: string): string {
  // Two patterns in SftpFileClient:
  //   1. public async Task MethodName(...)   — ConnectAsync
  //   2. public Task<T> MethodName(...)      — all others (no async keyword)
  // The generic return type can be Task or Task<List<T>> or Task<T>.
  const sigPatterns = [
    new RegExp(`public\\s+async\\s+Task\\s+${methodName}\\s*\\(`),
    new RegExp(`public\\s+Task(?:<[^)]+>)?\\s+${methodName}\\s*\\(`),
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

describe('Task 2.3 — SftpFileClient CancellationToken', () => {
  // ── 1. All 7 async methods have CancellationToken parameter ───────────────

  describe('CancellationToken parameter on async methods', () => {
    test('class has exactly 7 async methods', () => {
      const methodCount = METHODS.filter((m) =>
        source.includes(`${m}(`),
      ).length;
      expect(methodCount).toBe(7);
    });

    for (const method of METHODS) {
      test(`${method} has CancellationToken cancellationToken = default parameter`, () => {
        const pattern = new RegExp(
          `${method}\\([^)]*CancellationToken\\s+cancellationToken\\s*=\\s*default[^)]*\\)`,
        );
        const match = source.match(pattern);
        expect(match).not.toBeNull();
      });
    }

    test('no async method is missing CancellationToken', () => {
      for (const method of METHODS) {
        const hasDefault = source.includes(`${method}(`) &&
          source.includes('CancellationToken cancellationToken = default');
        expect(hasDefault).toBe(true);
      }
    });
  });

  // ── 2. All Task.Run calls pass cancellationToken ──────────────────────────

  describe('Task.Run calls pass cancellationToken', () => {
    // ConnectAsync: Task.Run(() => _sftp.Connect(), cancellationToken)
    test('ConnectAsync: Task.Run passes cancellationToken to _sftp.Connect()', () => {
      const body = extractMethodBody('ConnectAsync');
      expect(body).not.toBe('');
      const taskRunMatch = body.match(
        /Task\.Run\(\s*\(\s*\)\s*=>\s*_sftp\.Connect\(\s*\)\s*,\s*cancellationToken\s*\)/,
      );
      expect(taskRunMatch).not.toBeNull();
    });

    // ListDirectoryAsync: Task.Run(..., cancellationToken)
    // Lambda body spans multiple lines and contains commas, so use [\s\S]*? (non-greedy multiline).
    test('ListDirectoryAsync: Task.Run passes cancellationToken', () => {
      const body = extractMethodBody('ListDirectoryAsync');
      expect(body).not.toBe('');
      const taskRunMatch = body.match(
        /Task\.Run\([\s\S]*?,\s*cancellationToken\s*\)/,
      );
      expect(taskRunMatch).not.toBeNull();
    });

    // UploadAsync: Task.Run(..., cancellationToken)
    test('UploadAsync: Task.Run passes cancellationToken', () => {
      const body = extractMethodBody('UploadAsync');
      expect(body).not.toBe('');
      const taskRunMatch = body.match(
        /Task\.Run\([\s\S]*?,\s*cancellationToken\s*\)/,
      );
      expect(taskRunMatch).not.toBeNull();
    });

    // DownloadAsync: Task.Run(..., cancellationToken)
    test('DownloadAsync: Task.Run passes cancellationToken', () => {
      const body = extractMethodBody('DownloadAsync');
      expect(body).not.toBe('');
      const taskRunMatch = body.match(
        /Task\.Run\([\s\S]*?,\s*cancellationToken\s*\)/,
      );
      expect(taskRunMatch).not.toBeNull();
    });

    // MkdirAsync: Task.Run(..., cancellationToken)
    test('MkdirAsync: Task.Run passes cancellationToken', () => {
      const body = extractMethodBody('MkdirAsync');
      expect(body).not.toBe('');
      const taskRunMatch = body.match(
        /Task\.Run\([\s\S]*?,\s*cancellationToken\s*\)/,
      );
      expect(taskRunMatch).not.toBeNull();
    });

    // RenameAsync: Task.Run(..., cancellationToken)
    test('RenameAsync: Task.Run passes cancellationToken', () => {
      const body = extractMethodBody('RenameAsync');
      expect(body).not.toBe('');
      const taskRunMatch = body.match(
        /Task\.Run\([\s\S]*?,\s*cancellationToken\s*\)/,
      );
      expect(taskRunMatch).not.toBeNull();
    });

    // DeleteAsync: Task.Run(..., cancellationToken)
    test('DeleteAsync: Task.Run passes cancellationToken', () => {
      const body = extractMethodBody('DeleteAsync');
      expect(body).not.toBe('');
      const taskRunMatch = body.match(
        /Task\.Run\([\s\S]*?,\s*cancellationToken\s*\)/,
      );
      expect(taskRunMatch).not.toBeNull();
    });

    // ── Sanity: total Task.Run count in the file ─────────────────────────
    test('every non-comment Task.Run call passes cancellationToken', () => {
      // Exclude /// doc-comment mentions of Task.Run (the comment text
      // "/// Task.Run() so it executes on a ThreadPool thread" would
      // otherwise be counted as a code call without cancellationToken).
      const nonCommentSource = source.replace(/\/\/\/[^\n]*/g, '');
      const taskRunMatches = nonCommentSource.match(/Task\.Run\(/g) ?? [];
      expect(taskRunMatches.length).toBeGreaterThan(0);
      const allTaskRunsWithToken = nonCommentSource.match(
        /Task\.Run\([\s\S]*?,\s*cancellationToken\s*\)/g,
      ) ?? [];
      expect(allTaskRunsWithToken.length).toBe(taskRunMatches.length);
    });
  });
});
