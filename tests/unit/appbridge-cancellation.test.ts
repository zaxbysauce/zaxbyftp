/**
 * Verification tests for Task 2.4 — AppBridge CancellationToken wiring.
 *
 * These tests assert static properties of AppBridge.cs:
 *  1. The `using System.Threading;` directive is present.
 *  2. All 7 IFileClient async calls pass the `cancellationToken` parameter.
 *
 * These are source-code verification tests, not runtime behavior tests.
 * The C# file is a WPF/Windows desktop app and cannot be executed on the
 * cross-platform bun:test runner, so we validate the source text directly.
 */

import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Resolve AppBridge.cs once relative to the workspace root.
const APPBRIDGE_PATH = resolve(import.meta.dir, '../../AppBridge.cs');

function getSource(): string {
  return readFileSync(APPBRIDGE_PATH, 'utf-8');
}

describe('AppBridge CancellationToken wiring — Task 2.4', () => {
  describe('using System.Threading directive', () => {
    test('is present in AppBridge.cs', () => {
      const source = getSource();
      expect(source).toContain('using System.Threading;');
    });

    test('appears only once', () => {
      const source = getSource();
      const matches = source.match(/using System\.Threading;/g);
      expect(matches).toHaveLength(1);
    });
  });

  describe('IFileClient calls with cancellationToken parameter', () => {
    const CTS_PATTERN = /\bcancellationToken\b/g;
    const IFILE_METHODS = [
      'ConnectAsync',
      'ListDirectoryAsync',
      'UploadAsync',
      'DownloadAsync',
      'MkdirAsync',
      'RenameAsync',
      'DeleteAsync',
    ] as const;

    // Find all line numbers that contain the `cancellationToken` identifier
    function linesWithCts(source: string): Array<{ line: number; text: string }> {
      return source
        .split('\n')
        .map((text, i) => ({ line: i + 1, text })) // 1-indexed line numbers
        .filter(({ text }) => CTS_PATTERN.test(text));
    }

    // NOTE: The "every cancellationToken occurrence belongs to an IFileClient"
    // check was removed because helper methods (ConnectCoreAsync, ListDirectoryCoreAsync,
    // TransferCoreAsync, AckOpAsync) also pass cancellationToken as an argument,
    // causing false positives.  The per-method spot-checks below provide complete
    // coverage of all 7 IFileClient calls.

    // Confirms each IFileClient method has cancellationToken in scope by checking
    // that the method call and cancellationToken appear within a 6-line window.
    test('all 7 IFileClient methods are confirmed with cancellationToken', () => {
      const source = getSource();
      const srcLines = source.split('\n');
      for (const method of IFILE_METHODS) {
        const methodPattern = new RegExp(method);
        const callLineIdx = srcLines.findIndex(line => methodPattern.test(line));
        expect(callLineIdx).not.toBe(-1);
        // Check cancellationToken within a 5-line window around the call
        const windowStart = Math.max(0, callLineIdx - 3);
        const windowEnd = Math.min(srcLines.length - 1, callLineIdx + 2);
        const window = srcLines.slice(windowStart, windowEnd + 1).join('\n');
        expect(window).toContain('cancellationToken');
      }
    });

    // ── Per-method spot-checks ──────────────────────────────────────────────

    test('ConnectAsync uses cancellationToken', () => {
      const source = getSource();
      // Scan a 4-line window around the call to find both ConnectAsync and cancellationToken
      const srcLines = source.split('\n');
      // ConnectAsync is on line 219 (0-indexed 218)
      const window = srcLines.slice(216, 222).join('\n');
      expect(window).toContain('ConnectAsync');
      expect(window).toContain('cancellationToken');
    });

    test('ListDirectoryAsync uses cancellationToken', () => {
      const source = getSource();
      const srcLines = source.split('\n');
      // ListDirectoryAsync call spans lines 377-379
      const window = srcLines.slice(375, 382).join('\n');
      expect(window).toContain('ListDirectoryAsync');
      expect(window).toContain('cancellationToken');
    });

    test('UploadAsync uses cancellationToken', () => {
      const source = getSource();
      const srcLines = source.split('\n');
      // UploadAsync call spans lines 459-460
      const window = srcLines.slice(457, 463).join('\n');
      expect(window).toContain('UploadAsync');
      expect(window).toContain('cancellationToken');
    });

    test('DownloadAsync uses cancellationToken', () => {
      const source = getSource();
      const srcLines = source.split('\n');
      // DownloadAsync call spans lines 479-480
      const window = srcLines.slice(477, 483).join('\n');
      expect(window).toContain('DownloadAsync');
      expect(window).toContain('cancellationToken');
    });

    test('MkdirAsync uses cancellationToken', () => {
      const source = getSource();
      const srcLines = source.split('\n');
      // MkdirAsync call is on line 548
      const window = srcLines.slice(546, 551).join('\n');
      expect(window).toContain('MkdirAsync');
      expect(window).toContain('cancellationToken');
    });

    test('RenameAsync uses cancellationToken', () => {
      const source = getSource();
      const srcLines = source.split('\n');
      // RenameAsync call is on line 555
      const window = srcLines.slice(553, 558).join('\n');
      expect(window).toContain('RenameAsync');
      expect(window).toContain('cancellationToken');
    });

    test('DeleteAsync uses cancellationToken', () => {
      const source = getSource();
      const srcLines = source.split('\n');
      // DeleteAsync call is on line 562
      const window = srcLines.slice(560, 565).join('\n');
      expect(window).toContain('DeleteAsync');
      expect(window).toContain('cancellationToken');
    });

    // ── Negative: no IFileClient call omits cancellationToken ───────────────

    test('no IFileClient async call omits cancellationToken', () => {
      const source = getSource();
      const srcLines = source.split('\n');

      for (const method of IFILE_METHODS) {
        // Find all code-line call-sites for this method (skip comment-only lines).
        // A line is "code" if it contains the method name before any `//` comment.
        const codePattern = new RegExp(
          `^\\s*[^/]*${method.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
        );

        for (let i = 0; i < srcLines.length; i++) {
          const line = srcLines[i];
          if (!codePattern.test(line)) continue;

          // Collect continuation lines (lines indented beyond the base call line).
          const baseIndent = line.search(/\S/);
          let callText = line;
          for (let j = i + 1; j < srcLines.length; j++) {
            const contLine = srcLines[j];
            const contIndent = contLine.search(/\S/);
            if (contIndent <= baseIndent && contLine.trim() !== '') break;
            callText += '\n' + contLine;
          }

          // Verify this call contains cancellationToken
          expect(callText).toContain('cancellationToken');
        }
      }
    });
  });
});
