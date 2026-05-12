/**
 * Verification tests for Task 2.3 — SftpFileClient ThrowIfCancellationRequested checkpoints.
 *
 * Verifies that CancellationToken.ThrowIfCancellationRequested() calls are placed
 * at the required checkpoints inside Task.Run lambdas:
 *  - ConnectAsync  : inside Task.Run, after Connect()
 *  - UploadAsync  : at lambda start AND after File.OpenRead() stream creation
 *  - DownloadAsync : at lambda start AND after File.Create() stream creation
 *
 * These are source-code verification tests, not runtime behavior tests.
 * The C# file is a WPF/Windows desktop app and cannot be executed on the
 * cross-platform bun:test runner, so we validate the source text directly.
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
  // ConnectAsync uses the "public async Task" pattern.
  // All others use "public Task<T>" pattern (no async keyword).
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

/**
 * Extract the Task.Run lambda body (the code between the => and the closing
 * token of the lambda expression, accounting for nesting).
 *
 * For `Task.Run(() => { ... }, token)` returns the content inside the braces.
 * For `Task.Run(() => expr, token)` returns the trailing expression text.
 */
function extractTaskRunLambdaBody(methodBody: string): string {
  // Find Task.Run( — skip the opening paren and any whitespace
  const taskRunStart = methodBody.indexOf('Task.Run(');
  if (taskRunStart === -1) return '';

  const arrowIdx = methodBody.indexOf('=>', taskRunStart);
  if (arrowIdx === -1) return '';

  let i = arrowIdx + 2;
  // Skip whitespace after =>
  while (i < methodBody.length && /\s/.test(methodBody[i])) i++;

  if (i >= methodBody.length) return '';

  if (methodBody[i] === '{') {
    // Block lambda: collect until matching }
    let depth = 0;
    const start = i + 1;
    while (i < methodBody.length) {
      if (methodBody[i] === '{') depth++;
      else if (methodBody[i] === '}') {
        depth--;
        if (depth === 0) return methodBody.slice(start, i);
      }
      i++;
    }
  } else {
    // Expression lambda — collect until the first comma that closes the
    // Task.Run call (accounting for nested parens).
    let parenDepth = 0;
    const start = i;
    while (i < methodBody.length) {
      const ch = methodBody[i];
      if (ch === '(' || ch === '[' || ch === '<') parenDepth++;
      else if (ch === ')' || ch === ']' || ch === '>') {
        if (parenDepth === 0) return methodBody.slice(start, i);
        parenDepth--;
      } else if (ch === ',' && parenDepth === 0) {
        return methodBody.slice(start, i);
      }
      i++;
    }
    return methodBody.slice(start, i);
  }

  return '';
}

/** Returns true if the lambda body contains a ThrowIfCancellationRequested call. */
function hasThrowIfCancellationRequested(lambdaBody: string): boolean {
  return lambdaBody.includes('ThrowIfCancellationRequested()');
}

/**
 * Returns the 0-based line number within lambdaBody where the first
 * ThrowIfCancellationRequested() call appears, or -1 if absent.
 */
function lineOfThrowInLambda(lambdaBody: string): number {
  const lines = lambdaBody.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('ThrowIfCancellationRequested()')) return i;
  }
  return -1;
}

/**
 * Returns the 0-based line number within lambdaBody where a line containing
 * the given needle appears, or -1 if absent.
 */
function lineOfInLambda(lambdaBody: string, needle: string): number {
  const lines = lambdaBody.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(needle)) return i;
  }
  return -1;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('Task 2.3 — SftpFileClient ThrowIfCancellationRequested checkpoints', () => {
  // ── 1. ConnectAsync ────────────────────────────────────────────────────────

  describe('ConnectAsync ThrowIfCancellationRequested', () => {
    test('has ThrowIfCancellationRequested inside the Task.Run lambda', () => {
      const body = extractMethodBody('ConnectAsync');
      expect(body).not.toBe('');
      const lambda = extractTaskRunLambdaBody(body);
      expect(lambda).not.toBe('');
      expect(hasThrowIfCancellationRequested(lambda)).toBe(true);
    });

    test('ThrowIfCancellationRequested comes AFTER _sftp.Connect() in the lambda', () => {
      const body = extractMethodBody('ConnectAsync');
      const lambda = extractTaskRunLambdaBody(body);
      const connectLine = lineOfInLambda(lambda, '_sftp.Connect()');
      const throwLine = lineOfThrowInLambda(lambda);
      expect(connectLine).not.toBe(-1);
      expect(throwLine).not.toBe(-1);
      expect(throwLine).toBeGreaterThan(connectLine);
    });

    test('exactly one ThrowIfCancellationRequested call in ConnectAsync lambda', () => {
      const body = extractMethodBody('ConnectAsync');
      const lambda = extractTaskRunLambdaBody(body);
      const matches = lambda.match(/ThrowIfCancellationRequested\(\)/g) ?? [];
      expect(matches).toHaveLength(1);
    });
  });

  // ── 2. UploadAsync ─────────────────────────────────────────────────────────

  describe('UploadAsync ThrowIfCancellationRequested checkpoints', () => {
    test('has ThrowIfCancellationRequested inside the Task.Run lambda', () => {
      const body = extractMethodBody('UploadAsync');
      expect(body).not.toBe('');
      const lambda = extractTaskRunLambdaBody(body);
      expect(lambda).not.toBe('');
      expect(hasThrowIfCancellationRequested(lambda)).toBe(true);
    });

    test('has ThrowIfCancellationRequested at the START of the lambda (first statement)', () => {
      const body = extractMethodBody('UploadAsync');
      const lambda = extractTaskRunLambdaBody(body);
      const firstNonEmptyLine = lambda.split('\n').find((l) => l.trim() !== '');
      expect(firstNonEmptyLine).toBeDefined();
      expect(firstNonEmptyLine!.trim()).toMatch(/^\s*cancellationToken\.ThrowIfCancellationRequested\(\);?\s*$/);
    });

    test('has ThrowIfCancellationRequested AFTER File.OpenRead stream creation', () => {
      const body = extractMethodBody('UploadAsync');
      const lambda = extractTaskRunLambdaBody(body);
      const openReadLine = lineOfInLambda(lambda, 'File.OpenRead');
      const throwLine = lineOfThrowInLambda(lambda);
      // There are 2 ThrowIf calls; the second one must be after OpenRead.
      // Count ThrowIf lines and find the last one.
      const throwLines: number[] = [];
      lambda.split('\n').forEach((l, i) => {
        if (l.includes('ThrowIfCancellationRequested()')) throwLines.push(i);
      });
      const lastThrowLine = throwLines[throwLines.length - 1];
      expect(openReadLine).not.toBe(-1);
      expect(lastThrowLine).not.toBe(-1);
      expect(lastThrowLine).toBeGreaterThan(openReadLine);
    });

    test('has exactly TWO ThrowIfCancellationRequested calls in UploadAsync lambda', () => {
      const body = extractMethodBody('UploadAsync');
      const lambda = extractTaskRunLambdaBody(body);
      const matches = lambda.match(/ThrowIfCancellationRequested\(\)/g) ?? [];
      expect(matches).toHaveLength(2);
    });

    test('first ThrowIf is before File.OpenRead, second is after', () => {
      const body = extractMethodBody('UploadAsync');
      const lambda = extractTaskRunLambdaBody(body);
      const lines = lambda.split('\n');
      const throwLines: number[] = [];
      lines.forEach((l, i) => {
        if (l.includes('ThrowIfCancellationRequested()')) throwLines.push(i);
      });
      const openReadLine = lineOfInLambda(lambda, 'File.OpenRead');
      expect(throwLines[0]).toBeLessThan(openReadLine);
      expect(throwLines[1]).toBeGreaterThan(openReadLine);
    });
  });

  // ── 3. DownloadAsync ───────────────────────────────────────────────────────

  describe('DownloadAsync ThrowIfCancellationRequested checkpoints', () => {
    test('has ThrowIfCancellationRequested inside the Task.Run lambda', () => {
      const body = extractMethodBody('DownloadAsync');
      expect(body).not.toBe('');
      const lambda = extractTaskRunLambdaBody(body);
      expect(lambda).not.toBe('');
      expect(hasThrowIfCancellationRequested(lambda)).toBe(true);
    });

    test('has ThrowIfCancellationRequested at the START of the lambda (first statement)', () => {
      const body = extractMethodBody('DownloadAsync');
      const lambda = extractTaskRunLambdaBody(body);
      const firstNonEmptyLine = lambda.split('\n').find((l) => l.trim() !== '');
      expect(firstNonEmptyLine).toBeDefined();
      expect(firstNonEmptyLine!.trim()).toMatch(/^\s*cancellationToken\.ThrowIfCancellationRequested\(\);?\s*$/);
    });

    test('has ThrowIfCancellationRequested AFTER File.Create stream creation', () => {
      const body = extractMethodBody('DownloadAsync');
      const lambda = extractTaskRunLambdaBody(body);
      const createLine = lineOfInLambda(lambda, 'File.Create');
      // Count ThrowIf lines and find the last one.
      const throwLines: number[] = [];
      lambda.split('\n').forEach((l, i) => {
        if (l.includes('ThrowIfCancellationRequested()')) throwLines.push(i);
      });
      const lastThrowLine = throwLines[throwLines.length - 1];
      expect(createLine).not.toBe(-1);
      expect(lastThrowLine).not.toBe(-1);
      expect(lastThrowLine).toBeGreaterThan(createLine);
    });

    test('has exactly TWO ThrowIfCancellationRequested calls in DownloadAsync lambda', () => {
      const body = extractMethodBody('DownloadAsync');
      const lambda = extractTaskRunLambdaBody(body);
      const matches = lambda.match(/ThrowIfCancellationRequested\(\)/g) ?? [];
      expect(matches).toHaveLength(2);
    });

    test('first ThrowIf is before File.Create, second is after', () => {
      const body = extractMethodBody('DownloadAsync');
      const lambda = extractTaskRunLambdaBody(body);
      const lines = lambda.split('\n');
      const throwLines: number[] = [];
      lines.forEach((l, i) => {
        if (l.includes('ThrowIfCancellationRequested()')) throwLines.push(i);
      });
      const createLine = lineOfInLambda(lambda, 'File.Create');
      expect(throwLines[0]).toBeLessThan(createLine);
      expect(throwLines[1]).toBeGreaterThan(createLine);
    });
  });

  // ── 4. Sanity: total ThrowIf counts ────────────────────────────────────────

  describe('total ThrowIfCancellationRequested count in the file', () => {
    test('file contains exactly 5 ThrowIfCancellationRequested calls', () => {
      // ConnectAsync : 1
      // UploadAsync  : 2
      // DownloadAsync: 2
      // Total        : 5
      const nonCommentSource = source.replace(/\/\/\/[^\n]*/g, '');
      const matches =
        nonCommentSource.match(/cancellationToken\.ThrowIfCancellationRequested\(\)/g) ?? [];
      expect(matches).toHaveLength(5);
    });

    test('all ThrowIfCancellationRequested calls are inside Task.Run lambdas', () => {
      // Verify no ThrowIfCancellationRequested exists outside a Task.Run.
      // We check that each method body that contains ThrowIf also contains Task.Run.
      const methodsWithThrow = ['ConnectAsync', 'UploadAsync', 'DownloadAsync'];
      for (const method of methodsWithThrow) {
        const body = extractMethodBody(method);
        expect(body).not.toBe('');
        expect(body).toContain('Task.Run');
        expect(body).toContain('ThrowIfCancellationRequested');
      }
    });
  });
});
