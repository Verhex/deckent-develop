// tests/cli/messages-completeness.test.ts
//
// Structural guard: ensures the MESSAGES i18n dictionary stays consistent.
// Catches drift when new keys are added with missing translations, empty
// values, or mismatched {param} placeholders.
//
// 2026-08-25: messages.ts split its single literal into BASE_MESSAGES plus
// merged catalog-family files under src/cli/helpers/message-catalog/. The
// parser now covers the base block AND every family file, so the guard spans
// the full merged MESSAGES surface (mergeMessageFamilies is collision-checked
// in source; parity/emptiness/placeholder checks live here).
//
// Hermetic: reads committed source files only — no gitignored state.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

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

function parseEntriesFromBody(body: string, entries: MessageEntry[]): void {
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
}

type ReadSource = (path: string) => string;

const SOURCE_ROOT = join(process.cwd(), 'src');

function isInSourceRoot(path: string): boolean {
  const pathFromSourceRoot = relative(SOURCE_ROOT, path);
  return pathFromSourceRoot !== ''
    && !isAbsolute(pathFromSourceRoot)
    && pathFromSourceRoot !== '..'
    && !pathFromSourceRoot.startsWith(`..${sep}`)
    && !pathFromSourceRoot.startsWith('..');
}

function sourceWithoutComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
    .trim();
}

function parseFrozenFamily(
  source: string,
  exportName: string,
  label: string,
  allowCanonicalReadonly = false,
): MessageEntry[] | null {
  const escapedName = exportName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const type = allowCanonicalReadonly ? '(?:MessageFamily|Readonly<[^=]+?>)' : 'MessageFamily';
  const familyStart = source.search(
    new RegExp(`export const ${escapedName}\\s*:\\s*${type}\\s*=\\s*Object\\.freeze\\(\\{`),
  );
  if (familyStart === -1) return null;
  const familyEnd = source.indexOf('\n});', familyStart);
  if (familyEnd === -1) {
    throw new Error(`Could not locate frozen MessageFamily body in ${label}`);
  }
  const entries: MessageEntry[] = [];
  parseEntriesFromBody(source.slice(familyStart, familyEnd), entries);
  if (entries.length === 0) {
    throw new Error(`Frozen MessageFamily in ${label} is empty`);
  }
  return entries;
}

function parseStaticNamedReexport(source: string, label: string): { name: string; specifier: string } | null {
  const compactSource = sourceWithoutComments(source);
  const match = compactSource.match(/^export\s*\{\s*(\w+)\s*\}\s*from\s*'(\.[^']+)'\s*;$/);
  if (!match) return null;
  const [, name, specifier] = match;
  if (!name || !specifier) throw new Error(`Malformed static named re-export in ${label}`);
  return { name, specifier };
}

function parseCatalogFamily(
  sourcePath: string,
  source: string,
  readSource: ReadSource,
  expectedName?: string,
  allowCanonicalReadonly = false,
  ancestry: readonly string[] = [],
): MessageEntry[] {
  if (ancestry.includes(sourcePath)) {
    throw new Error(`Cyclic message-catalog re-export: ${[...ancestry, sourcePath].join(' -> ')}`);
  }
  const label = relative(process.cwd(), sourcePath);
  const directName = expectedName
    ?? source.match(/export const\s+(\w+)\s*:\s*MessageFamily\s*=\s*Object\.freeze\(\{/s)?.[1];
  if (directName) {
    const directEntries = parseFrozenFamily(source, directName, label, allowCanonicalReadonly);
    if (directEntries) return directEntries;
  }

  const reexport = parseStaticNamedReexport(source, label);
  if (!reexport) {
    if (expectedName) {
      throw new Error(`Static message-catalog re-export target must export ${expectedName} as a frozen catalog`);
    }
    throw new Error(`Message catalog family ${label} must be a frozen MessageFamily or static named relative re-export`);
  }
  if (!reexport.specifier.endsWith('.js')) {
    throw new Error(`Static message-catalog re-export in ${label} must target a .js module specifier`);
  }
  if (expectedName && reexport.name !== expectedName) {
    throw new Error(`Static message-catalog re-export in ${label} must preserve export name ${expectedName}`);
  }
  const targetPath = resolve(dirname(sourcePath), `${reexport.specifier.slice(0, -3)}.ts`);
  if (!isInSourceRoot(targetPath)) {
    throw new Error(`Static message-catalog re-export in ${label} escapes src`);
  }
  if ([...ancestry, sourcePath].includes(targetPath)) {
    throw new Error(`Cyclic message-catalog re-export: ${[...ancestry, sourcePath, targetPath].join(' -> ')}`);
  }
  let targetSource: string;
  try {
    targetSource = readSource(targetPath);
  } catch {
    throw new Error(`Static message-catalog re-export target is missing for ${label}`);
  }
  return parseCatalogFamily(
    targetPath,
    targetSource,
    readSource,
    reexport.name,
    true,
    [...ancestry, sourcePath],
  );
}

function parseMessageEntries(): MessageEntry[] {
  const entries: MessageEntry[] = [];

  // 1) BASE_MESSAGES literal in messages.ts (up to its top-level closing "};")
  const sourcePath = join(process.cwd(), 'src/cli/helpers/messages.ts');
  const source = readFileSync(sourcePath, 'utf-8');
  const bodyStart = source.indexOf('const BASE_MESSAGES: MessageMap = {');
  const bodyEnd = source.indexOf('\n};', bodyStart);
  if (bodyStart === -1 || bodyEnd === -1) {
    throw new Error('Could not locate BASE_MESSAGES block in src/cli/helpers/messages.ts');
  }
  parseEntriesFromBody(source.slice(bodyStart, bodyEnd), entries);

  // 2) Every catalog-family file merged into MESSAGES at load time.
  //    readdirSync (not a hardcoded list) so a newly registered family is
  //    guarded automatically.
  const catalogDir = join(process.cwd(), 'src/cli/helpers/message-catalog');
  const familyFiles = readdirSync(catalogDir).filter(f => f.endsWith('.ts')).sort();
  if (familyFiles.length === 0) {
    throw new Error('No message-catalog family files found in src/cli/helpers/message-catalog');
  }
  for (const file of familyFiles) {
    const familyPath = join(catalogDir, file);
    entries.push(...parseCatalogFamily(familyPath, readFileSync(familyPath, 'utf-8'), path => readFileSync(path, 'utf-8')));
  }

  // The merge in messages.ts throws on collisions at runtime; mirror that
  // structural property here so the static parse cannot double-count a key.
  const seen = new Set<string>();
  const duplicates: string[] = [];
  for (const entry of entries) {
    if (seen.has(entry.key)) duplicates.push(entry.key);
    seen.add(entry.key);
  }
  if (duplicates.length > 0) {
    throw new Error(`Duplicate message keys across base+families: ${duplicates.join(', ')}`);
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
  it('follows a static named relative re-export only to a frozen in-repo catalog', () => {
    const shimPath = join(SOURCE_ROOT, 'cli/helpers/message-catalog/synthetic-shim.ts');
    const targetPath = join(SOURCE_ROOT, 'core/synthetic-catalog.ts');
    const files = new Map<string, string>([
      [shimPath, "export { SYNTHETIC_MESSAGES } from '../../../core/synthetic-catalog.js';"],
      [targetPath, "export const SYNTHETIC_DEFAULT_LANGUAGE = 'en';\n\nexport const SYNTHETIC_MESSAGES: Readonly<Record<string, Readonly<Record<string, string>>>> = Object.freeze({\n  'synthetic.key': { en: 'Value {id}', tr: 'Değer {id}' },\n});\n"],
    ]);
    const entries = parseCatalogFamily(shimPath, files.get(shimPath)!, path => {
      const source = files.get(path);
      if (source === undefined) throw new Error('missing');
      return source;
    });
    expect(entries).toEqual([expect.objectContaining({ key: 'synthetic.key', hasEn: true, hasTr: true })]);
    expect(extractPlaceholders(entries[0]?.enText ?? '')).toEqual(extractPlaceholders(entries[0]?.trText ?? ''));
  });

  it('rejects malformed, non-frozen, empty, missing, and cyclic static re-export targets', () => {
    const shimPath = join(SOURCE_ROOT, 'cli/helpers/message-catalog/synthetic-shim.ts');
    const targetPath = join(SOURCE_ROOT, 'core/synthetic-catalog.ts');
    const read = (target: string, source: string): ReadSource => path => {
      if (path === target) return source;
      throw new Error('missing');
    };
    expect(() => parseCatalogFamily(shimPath, "export { SYNTHETIC_MESSAGES } from '../../../core/missing.js';", read(targetPath, ''))).toThrow(/missing/u);
    expect(() => parseCatalogFamily(shimPath, "export { SYNTHETIC_MESSAGES } from '../../../core/synthetic-catalog.js';", read(targetPath, "export const SYNTHETIC_MESSAGES = {};"))).toThrow(/frozen catalog/u);
    expect(() => parseCatalogFamily(shimPath, "export { SYNTHETIC_MESSAGES } from '../../../core/synthetic-catalog.js';", read(targetPath, "export const SYNTHETIC_MESSAGES: Record<string, Record<string, string>> = {\n  'synthetic.key': { en: 'Value', tr: 'Değer' },\n};"))).toThrow(/frozen catalog/u);
    expect(() => parseCatalogFamily(shimPath, "export { SYNTHETIC_MESSAGES } from '../../../core/synthetic-catalog.js';", read(targetPath, "export const SYNTHETIC_MESSAGES: Readonly<Record<string, Readonly<Record<string, string>>>> = Object.freeze({\n});"))).toThrow(/empty/u);
    expect(() => parseCatalogFamily(shimPath, "export { SYNTHETIC_MESSAGES } from '../../../core/synthetic-catalog.js';", read(targetPath, "export const DECOY_MESSAGES: Readonly<Record<string, Readonly<Record<string, string>>>> = Object.freeze({\n  'decoy.key': { en: 'Value', tr: 'Değer' },\n});\nexport const SYNTHETIC_MESSAGES = {};"))).toThrow(/SYNTHETIC_MESSAGES/u);
    expect(() => parseCatalogFamily(shimPath, "export { SYNTHETIC_MESSAGES } from '../../../core/synthetic-catalog.js';", read(targetPath, "export { SYNTHETIC_MESSAGES } from '../cli/helpers/message-catalog/synthetic-shim.js';"))).toThrow(/Cyclic/u);
    expect(() => parseCatalogFamily(shimPath, 'export { SYNTHETIC_MESSAGES as OTHER } from \'../../../core/synthetic-catalog.js\';', read(targetPath, ''))).toThrow(/frozen MessageFamily or static named relative re-export/u);
  });
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
