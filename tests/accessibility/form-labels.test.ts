/**
 * Accessibility tests for TopBar.tsx QuickConnect form labels.
 *
 * Verifies WCAG 2.1 SC 1.3.1 (Info and Relationships) and SC 3.3.2 (Labels
 * or Instructions) compliance for the five QuickConnect inputs:
 *   Host · Port · Protocol · Username · Password
 *
 * We parse the TSX source directly (no DOM rendering needed) so the tests
 * are deterministic, fast, and work on every platform without a jsdom setup.
 */

import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Resolve relative to the repo root (project root is two levels above tests/)
const _repoRoot = join(import.meta.dir, '..', '..');
const SOURCE = readFileSync(
  join(_repoRoot, 'src/ui/src/components/TopBar.tsx'),
  'utf-8',
);

// ── Parsers ──────────────────────────────────────────────────────────────────

/** Extract the value of a named attribute from an opening JSX tag. */
function attr(tag: string, name: string): string | null {
  // Matches: name="value"  or  name='value'  or  name={`value`}
  const re = new RegExp(
    `\\b${name}=` +
    '(?:' +
      '"([^"]*)"|' +          // double-quoted
      "'([^']*)'|" +          // single-quoted
      '`([^`]*)`|' +          // template-literal
      '{\\`([^\\}]*)\\`}' +    // {`...`} (already inside {})
    ')',
  );
  const m = re.exec(tag);
  if (!m) return null;
  return m[1] ?? m[2] ?? m[3] ?? m[4] ?? null;
}

/** Yield the `htmlFor` value of every <label …> tag. */
function* labelHtmlFors(src: string): Generator<{ label: string; htmlFor: string }> {
  // Match full opening <label …> tag (self-closing labels not valid HTML but handle them)
  const re = /<label\b([^>]*?)(?:\/?>)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const tag = m[0];
    const htmlFor = attr(tag, 'htmlFor');
    if (htmlFor !== null) {
      yield { label: tag, htmlFor };
    }
  }
}

/** Yield { id, tag, type } for every <input …> and <select …> tag. */
function* formControls(
  src: string,
): Generator<{ id: string | null; tag: string; type: string }> {
  const inputRe = /<input\b([^>]*?)\/?>/g;
  let m: RegExpExecArray | null;
  while ((m = inputRe.exec(src)) !== null) {
    yield { id: attr(m[0], 'id'), tag: m[0], type: attr(m[0], 'type') ?? 'text' };
  }
  const selectRe = /<select\b([^>]*?)\/?>/g;
  while ((m = selectRe.exec(src)) !== null) {
    yield { id: attr(m[0], 'id'), tag: m[0], type: 'select' };
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Isolate the QuickConnect <form> block (from its opening tag to the </form>). */
function quickConnectFormBlock(src: string): string {
  // Anchor on the className unique to the QuickConnect form
  const classMarker = 'overflow-hidden cursor-default"';
  const start = src.indexOf('<form\n        className="flex items-center gap-1 flex-1 min-w-0 ' + classMarker);
  if (start === -1) {
    // Fallback: find first <form with that class pattern anywhere
    const fallback = src.indexOf('overflow-hidden cursor-default"');
    const formTag = src.lastIndexOf('<form', fallback);
    return src.slice(formTag, src.indexOf('</form>', formTag) + '</form>'.length);
  }
  return src.slice(start, src.indexOf('</form>', start) + '</form>'.length);
}

/** All htmlFor values defined within the QuickConnect form. */
function qcLabelHtmlFors(src: string): string[] {
  const block = quickConnectFormBlock(src);
  return [...labelHtmlFors(block)].map(l => l.htmlFor);
}

/** All input/select controls within the QuickConnect form. */
function qcControls(src: string) {
  const block = quickConnectFormBlock(src);
  return [...formControls(block)];
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('QuickConnect form — label accessibility (WCAG 1.3.1 / 3.3.2)', () => {
  const expected = ['qc-host', 'qc-port', 'qc-protocol', 'qc-username', 'qc-password'] as const;

  test('every expected input id has a corresponding <label htmlFor>', () => {
    const htmlFors = qcLabelHtmlFors(SOURCE);
    for (const id of expected) {
      expect(htmlFors, `"${id}" must appear as label htmlFor`).toContain(id);
    }
  });

  test('every label htmlFor in the form references an existing input id', () => {
    const controls = qcControls(SOURCE);
    const ids = controls.map(c => c.id).filter((id): id is string => id !== null);
    const uniqueIds = new Set(ids);
    expect(ids.length, 'all control ids must be unique').toBe(uniqueIds.size);

    const htmlFors = qcLabelHtmlFors(SOURCE);
    for (const htmlFor of htmlFors) {
      expect(uniqueIds, `label htmlFor="${htmlFor}" must reference an existing input id`).toContain(htmlFor);
    }
  });

  test('each label htmlFor matches exactly one input id (1:1 relationship)', () => {
    const controls = qcControls(SOURCE);
    const ids = controls.map(c => c.id).filter((id): id is string => id !== null);
    const htmlFors = qcLabelHtmlFors(SOURCE);

    // Every label's htmlFor appears in the controls
    for (const htmlFor of htmlFors) {
      const matches = ids.filter(id => id === htmlFor);
      expect(matches.length, `htmlFor="${htmlFor}" must match exactly one input id`).toBe(1);
    }

    // Every control id appears as a label htmlFor (no orphan inputs)
    for (const id of ids) {
      const matches = htmlFors.filter(f => f === id);
      expect(matches.length, `input id="${id}" must have exactly one label htmlFor`).toBe(1);
    }
  });

  test('all control ids within the form are unique', () => {
    const controls = qcControls(SOURCE);
    const ids = controls.map(c => c.id).filter((id): id is string => id !== null);
    const seen = new Set<string>();
    const duplicates: string[] = [];
    for (const id of ids) {
      if (seen.has(id)) duplicates.push(id);
      seen.add(id);
    }
    expect(duplicates, 'no duplicate ids allowed in the form').toHaveLength(0);
  });

  test('Host input is text type with correct id and label', () => {
    const block = quickConnectFormBlock(SOURCE);
    const hostControl = [...formControls(block)].find(c => c.id === 'qc-host');
    expect(hostControl, 'qc-host input must exist').toBeDefined();
    expect(hostControl!.id).toBe('qc-host');
    expect(hostControl!.type).toBe('text');
    expect(qcLabelHtmlFors(SOURCE)).toContain('qc-host');
  });

  test('Port input is number type with correct id and label', () => {
    const block = quickConnectFormBlock(SOURCE);
    const portControl = [...formControls(block)].find(c => c.id === 'qc-port');
    expect(portControl, 'qc-port input must exist').toBeDefined();
    expect(portControl!.id).toBe('qc-port');
    expect(portControl!.type).toBe('number');
    expect(qcLabelHtmlFors(SOURCE)).toContain('qc-port');
  });

  test('Protocol control is a select element with correct id and label', () => {
    const block = quickConnectFormBlock(SOURCE);
    const protoControl = [...formControls(block)].find(c => c.id === 'qc-protocol');
    expect(protoControl, 'qc-protocol select must exist').toBeDefined();
    expect(protoControl!.id).toBe('qc-protocol');
    expect(protoControl!.type).toBe('select');
    expect(qcLabelHtmlFors(SOURCE)).toContain('qc-protocol');
  });

  test('Username input is text type with correct id and label', () => {
    const block = quickConnectFormBlock(SOURCE);
    const userControl = [...formControls(block)].find(c => c.id === 'qc-username');
    expect(userControl, 'qc-username input must exist').toBeDefined();
    expect(userControl!.id).toBe('qc-username');
    expect(userControl!.type).toBe('text');
    expect(qcLabelHtmlFors(SOURCE)).toContain('qc-username');
  });

  test('Password input is password type with correct id and label', () => {
    const block = quickConnectFormBlock(SOURCE);
    const pwControl = [...formControls(block)].find(c => c.id === 'qc-password');
    expect(pwControl, 'qc-password input must exist').toBeDefined();
    expect(pwControl!.id).toBe('qc-password');
    expect(pwControl!.type).toBe('password');
    expect(qcLabelHtmlFors(SOURCE)).toContain('qc-password');
  });
});

describe('Save-site modal — label coverage', () => {
  test('site-name input is wrapped by an implicit <label> (no htmlFor needed)', () => {
    // The save modal site-name uses wrapping <label> with text "Site name" (WCAG 1.3.1 compliant).
    // The label appears on line 274: <label className="block text-xs text-gray-400 mb-1">Site name</label>
    // The input follows immediately after the </label> closing tag.
    const labelMarker = 'mb-1">Site name</label>';
    const labelOpenIdx = SOURCE.indexOf('<label className="block text-xs text-gray-400 ' + labelMarker);
    expect(labelOpenIdx, '"Site name" wrapping label must exist in TopBar.tsx').toBeGreaterThan(-1);

    const afterLabel = SOURCE.indexOf('</label>', labelOpenIdx) + '</label>'.length;
    const inputIdx = SOURCE.indexOf('<input', afterLabel);
    expect(inputIdx, '<input must appear after the wrapping </label> in the save modal').toBeGreaterThan(-1);

    // The input should be the site-name input (first input after the wrapping label in the modal)
    const inputSnippet = SOURCE.slice(inputIdx, inputIdx + 60);
    expect(inputSnippet, 'input after "Site name" label should be the site-name input').toContain('type="text"');
  });
});
