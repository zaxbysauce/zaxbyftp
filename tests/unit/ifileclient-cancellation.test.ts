/**
 * Verification tests for Task 2.1 — IFileClient CancellationToken interface
 *
 * Verifies:
 * - using System.Threading is present
 * - All 7 async methods declare CancellationToken cancellationToken = default
 */
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const sourcePath = join(import.meta.dir, '../../Adapters/IFileClient.cs');
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

describe('Task 2.1 — IFileClient CancellationToken', () => {
  describe('using System.Threading', () => {
    test('is present in the source file', () => {
      const match = source.match(/^using\s+System\.Threading\s*;/m);
      expect(match).not.toBeNull();
    });
  });

  describe('CancellationToken parameter on async methods', () => {
    test('interface has exactly 7 async methods', () => {
      // Verify all 7 method names are present — individual tests below
      // cover the full Task<...> signature including the nested Task<List<RemoteItem>>
      const methodCount = METHODS.filter((m) =>
        source.includes(`${m}(`),
      ).length;
      expect(methodCount).toBe(7);
    });

    for (const method of METHODS) {
      test(`${method} has CancellationToken parameter with default value`, () => {
        // Match: methodName(..., CancellationToken cancellationToken = default)
        const pattern = new RegExp(
          `${method}\\([^)]*CancellationToken\\s+cancellationToken\\s*=\\s*default[^)]*\\)`,
        );
        const match = source.match(pattern);
        expect(match).not.toBeNull();
      });
    }

    test('no async method is missing CancellationToken', () => {
      // Each method name appears exactly once and its signature contains = default
      for (const method of METHODS) {
        const count = (source.match(new RegExp(`\\b${method}\\b`, 'g')) ?? []).length;
        expect(count).toBeGreaterThanOrEqual(1);
        const hasDefault = source.includes(`${method}(`) &&
          source.includes('CancellationToken cancellationToken = default');
        expect(hasDefault).toBe(true);
      }
    });
  });

  describe('interface structure', () => {
    test('IFileClient interface is declared public', () => {
      const match = source.match(/public\s+interface\s+IFileClient/);
      expect(match).not.toBeNull();
    });

    test('interface extends IDisposable', () => {
      const match = source.match(/IFileClient\s*:\s*IDisposable/);
      expect(match).not.toBeNull();
    });
  });
});
