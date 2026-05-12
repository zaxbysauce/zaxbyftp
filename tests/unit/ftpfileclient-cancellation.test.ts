/**
 * Verification tests for Task 2.2 — FtpFileClient CancellationToken
 *
 * Verifies:
 * - All 7 async methods declare CancellationToken cancellationToken = default
 * - All _sem.WaitAsync calls pass cancellationToken
 * - All FluentFTP calls pass cancellationToken
 * - Task.Run in ConnectAsync passes cancellationToken
 */
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const sourcePath = join(import.meta.dir, '../../Adapters/FtpFileClient.cs');
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
  // Locate the opening brace after the method signature.
  // Use a pattern that handles Task<T> and Task<List<T>> return types.
  const genericType = String.raw`Task(?:<\w+(?:<[^>]+>)?>)?`;
  const sigPattern = new RegExp(
    String.raw`(?:public\s+async\s+${genericType}\s+${methodName}|(?:public\s+)?async\s+${genericType}\s+${methodName})\s*\(`,
  );
  const sigMatch = source.match(sigPattern);
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

describe('Task 2.2 — FtpFileClient CancellationToken', () => {
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

  // ── 2. All _sem.WaitAsync calls use cancellationToken ─────────────────────

  describe('_sem.WaitAsync uses cancellationToken', () => {
    for (const method of METHODS) {
      test(`${method} calls _sem.WaitAsync with cancellationToken`, () => {
        const body = extractMethodBody(method);
        expect(body).not.toBe('');
        const waitMatch = body.match(/_sem\.WaitAsync\(\s*cancellationToken\s*\)/);
        expect(waitMatch).not.toBeNull();
      });
    }
  });

  // ── 3. All FluentFTP calls pass cancellationToken ────────────────────────

  describe('FluentFTP calls pass cancellationToken', () => {
    test('ConnectAsync: Task.Run passes cancellationToken to client.Connect()', () => {
      const body = extractMethodBody('ConnectAsync');
      expect(body).not.toBe('');
      const taskRunMatch = body.match(
        /Task\.Run\(\s*\(\s*\)\s*=>\s*client\.Connect\(\s*\)\s*,\s*cancellationToken\s*\)/,
      );
      expect(taskRunMatch).not.toBeNull();
    });

    test('ListDirectoryAsync: GetListing passes cancellationToken', () => {
      const body = extractMethodBody('ListDirectoryAsync');
      expect(body).not.toBe('');
      expect(body.match(/ftp\.GetListing\([^)]*cancellationToken[^)]*\)/)).not.toBeNull();
    });

    test('UploadAsync: UploadFile passes cancellationToken', () => {
      const body = extractMethodBody('UploadAsync');
      expect(body).not.toBe('');
      expect(body.match(/ftp\.UploadFile\([^)]*token\s*:\s*cancellationToken[^)]*\)/)).not.toBeNull();
    });

    test('DownloadAsync: GetObjectInfo passes cancellationToken', () => {
      const body = extractMethodBody('DownloadAsync');
      expect(body).not.toBe('');
      expect(body.match(/ftp\.GetObjectInfo\([^)]*token\s*:\s*cancellationToken[^)]*\)/)).not.toBeNull();
    });

    test('DownloadAsync: DownloadFile passes cancellationToken', () => {
      const body = extractMethodBody('DownloadAsync');
      expect(body).not.toBe('');
      expect(body.match(/ftp\.DownloadFile\([^)]*token\s*:\s*cancellationToken[^)]*\)/)).not.toBeNull();
    });

    test('MkdirAsync: CreateDirectory passes cancellationToken', () => {
      const body = extractMethodBody('MkdirAsync');
      expect(body).not.toBe('');
      expect(body.match(/ftp\.CreateDirectory\([^)]*token\s*:\s*cancellationToken[^)]*\)/)).not.toBeNull();
    });

    test('RenameAsync: Rename passes cancellationToken', () => {
      const body = extractMethodBody('RenameAsync');
      expect(body).not.toBe('');
      expect(body.match(/ftp\.Rename\([^)]*cancellationToken[^)]*\)/)).not.toBeNull();
    });

    test('DeleteAsync: GetObjectInfo passes cancellationToken', () => {
      const body = extractMethodBody('DeleteAsync');
      expect(body).not.toBe('');
      expect(body.match(/ftp\.GetObjectInfo\([^)]*token\s*:\s*cancellationToken[^)]*\)/)).not.toBeNull();
    });

    test('DeleteAsync: DeleteDirectory passes cancellationToken', () => {
      const body = extractMethodBody('DeleteAsync');
      expect(body).not.toBe('');
      expect(body.match(/ftp\.DeleteDirectory\([^)]*cancellationToken[^)]*\)/)).not.toBeNull();
    });

    test('DeleteAsync: DeleteFile passes cancellationToken', () => {
      const body = extractMethodBody('DeleteAsync');
      expect(body).not.toBe('');
      expect(body.match(/ftp\.DeleteFile\([^)]*cancellationToken[^)]*\)/)).not.toBeNull();
    });
  });

  // ── 4. Task.Run in ConnectAsync passes cancellationToken ──────────────────

  describe('Task.Run in ConnectAsync passes cancellationToken', () => {
    test('await Task.Run(() => client.Connect(), cancellationToken) pattern is present', () => {
      const pattern = /await\s+Task\.Run\(\s*\(\s*\)\s*=>\s*client\.Connect\(\s*\)\s*,\s*cancellationToken\s*\)/;
      expect(source.match(pattern)).not.toBeNull();
    });
  });
});
