// tests/cli/messages-completeness.test.ts
//
// Structural guard: ensures the MESSAGES i18n dictionary in messages.ts stays
// consistent. Catches drift when new keys are added with missing translations,
// empty values, or mismatched {param} placeholders.
//
// Hermetic: reads committed source file only — no gitignored state.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ─── Source parser ───────────────────────────────────────────────────────────

interface MessageEntry {
  key: string;
  hasEn: boolean;
  hasTr: boolean;
  /** null = complex value (array/computed) — skip for empty/placeholder checks */
  enText: string | null;
  trText: string | null;
}

function extractLiteralValue(block: string, language: 'en' | 'tr'): string | null {
  const expression = block.match(
    new RegExp(`\\b${language}:\\s*((?:'(?:[^'\\\\]|\\\\.)*'\\s*(?:\\+\\s*)?)+)`),
  )?.[1];
  if (!expression) return null;

  return [...expression.matchAll(/'((?:[^'\\]|\\.)*)'/g)]
    .map(match => match[1])
    .join('');
}

function parseMessageEntries(): MessageEntry[] {
  const sourcePath = join(process.cwd(), 'src/cli/helpers/messages.ts');
  const source = readFileSync(sourcePath, 'utf-8');

  const bodyStart = source.indexOf('const MESSAGES: MessageMap = {');
  const bodyEnd = source.indexOf('\nexport function getMessage', bodyStart);
  if (bodyStart === -1 || bodyEnd === -1) {
    throw new Error('Could not locate MESSAGES block in src/cli/helpers/messages.ts');
  }
  const body = source.slice(bodyStart, bodyEnd);

  const entries: MessageEntry[] = [];
  // Match lines: "  'key': {" (2-space indent, single-quoted key, opening brace)
  const keyRe = /^  '([^']+)':\s*\{(.*)/gm;
  let keyMatch: RegExpExecArray | null;

  while ((keyMatch = keyRe.exec(body)) !== null) {
    const key = keyMatch[1];
    const inlineRest = keyMatch[2]; // rest of the line after opening brace

    // Bound this entry to just before the next "  'key': {" line
    const nextKeyPos = body.indexOf("\n  '", keyMatch.index + 1);
    const blockEnd = nextKeyPos !== -1 ? nextKeyPos : body.length;
    const block = inlineRest + body.slice(keyMatch.index + keyMatch[0].length, blockEnd);

    const hasEn = /\ben:/.test(block);
    const hasTr = /\btr:/.test(block);

    entries.push({
      key,
      hasEn,
      hasTr,
      enText: extractLiteralValue(block, 'en'),
      trText: extractLiteralValue(block, 'tr'),
    });
  }

  return entries;
}

function extractPlaceholders(text: string): Set<string> {
  const result = new Set<string>();
  for (const m of text.matchAll(/\{(\w+)\}/g)) {
    result.add(m[1]);
  }
  return result;
}

// Parse once at module load (reads committed source, not gitignored state)
const ENTRIES = parseMessageEntries();

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('messages.ts i18n completeness', () => {
  it('parses a non-trivial number of MESSAGES entries (parser sanity)', () => {
    // If this fails the parser is broken, not the dictionary
    expect(ENTRIES.length).toBeGreaterThan(50);
  });

  it('every key has both en and tr translations (key set parity)', () => {
    const missingEn = ENTRIES.filter(e => !e.hasEn).map(e => e.key);
    const missingTr = ENTRIES.filter(e => !e.hasTr).map(e => e.key);
    expect(missingEn, `Keys missing "en" translation: [${missingEn.join(', ')}]`).toHaveLength(0);
    expect(missingTr, `Keys missing "tr" translation: [${missingTr.join(', ')}]`).toHaveLength(0);
  });

  it('no empty string values in either language', () => {
    // Only checks extractable (simple quoted) values; complex array values are skipped
    const emptyEn = ENTRIES.filter(e => e.enText === '').map(e => e.key);
    const emptyTr = ENTRIES.filter(e => e.trText === '').map(e => e.key);
    expect(emptyEn, `Keys with empty en value: [${emptyEn.join(', ')}]`).toHaveLength(0);
    expect(emptyTr, `Keys with empty tr value: [${emptyTr.join(', ')}]`).toHaveLength(0);
  });

  it('{param} placeholder sets match between en and tr for each key', () => {
    // Catches interpolation bugs like the {n} incident: en has {n}, tr has {count}
    const mismatches: string[] = [];
    for (const entry of ENTRIES) {
      // Skip entries where value is complex/not extractable
      if (entry.enText === null || entry.trText === null) continue;
      const enParams = extractPlaceholders(entry.enText);
      const trParams = extractPlaceholders(entry.trText);
      const enOnly = [...enParams].filter(p => !trParams.has(p));
      const trOnly = [...trParams].filter(p => !enParams.has(p));
      if (enOnly.length > 0 || trOnly.length > 0) {
        mismatches.push(
          `  ${entry.key}: en-only=[${enOnly.join(',')}] tr-only=[${trOnly.join(',')}]`,
        );
      }
    }
    expect(
      mismatches,
      `Placeholder mismatches:\n${mismatches.join('\n')}`,
    ).toHaveLength(0);
  });
});
