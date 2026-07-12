import { describe, it, expect } from 'vitest';
import {
  buildDirectives,
  extractGoNogo,
  reconstructBuildTask,
  type DirectiveBuildIntent,
} from '../../src/orchestra/directives-builder.js';
import { parseStructuredDirectives } from '../../src/orchestra/task-builder.js';

// born-677 (.analysis/born-backlog.json born_id 677): buildDirectives hard-errored
// ("contains the \";\" join delimiter — would not round-trip") whenever a goCriteria/
// nogo item — often NL-authored free text embedded verbatim by a caller — happened to
// contain the '; ' join delimiter. The fix escapes the delimiter (and '\n'/'\r'/'\\')
// instead of rejecting it; these tests prove the hard-error is gone AND the round-trip
// contract (buildDirectives → parseStructuredDirectives → reconstructBuildTask) holds
// for the exact character classes born-677 named: ';', ',', newline, backtick.

function makeIntent(goCriteria: string[], nogo: string[]): DirectiveBuildIntent {
  return {
    title: 'Delimiter-safety fixture',
    tasks: [
      {
        title: 'N677 fixture task',
        desc: 'Fixture task proving delimiter-laden goCriteria/nogo items round-trip.',
        files: ['src/orchestra/directives-builder.ts'],
        scope: ['src/orchestra/'],
        deps: [],
        goCriteria,
        nogo,
      },
    ],
  };
}

function roundTrip(intent: DirectiveBuildIntent) {
  const text = buildDirectives(intent);
  const parsed = parseStructuredDirectives(text);
  expect(parsed).toHaveLength(1);
  return { text, reconstructed: reconstructBuildTask(parsed[0]!) };
}

// born-677 fixture "üçlü" (triple): one NL-target item per named character class.
const SEMICOLON_ITEM = 'Kullanıcı girişini doğrula; parola alanı boş bırakılmasın';
const COMMA_ITEM = 'Değişiklik özeti: başlık, tarih ve yazar bilgisini ekle';
const NEWLINE_BACKTICK_ITEM = 'Kod bloğunu güncelle:\nfonksiyon `calculateTotal()` satırını düzelt';
const NL_TARGET_TRIPLE = [SEMICOLON_ITEM, COMMA_ITEM, NEWLINE_BACKTICK_ITEM];

describe('directives-builder delimiter safety (born-677)', () => {
  it('does not throw when a goCriteria item contains the ";" join delimiter (live case)', () => {
    const intent = makeIntent(['first; second'], ['no-op']);
    expect(() => buildDirectives(intent)).not.toThrow();
  });

  it('does not throw when a nogo item contains the ";" join delimiter', () => {
    const intent = makeIntent(['ok'], ['first; second']);
    expect(() => buildDirectives(intent)).not.toThrow();
  });

  it('round-trips the born-677 NL-target triple (";", ",", newline+backtick) in goCriteria', () => {
    const intent = makeIntent(NL_TARGET_TRIPLE, ['baseline nogo']);
    const { reconstructed } = roundTrip(intent);
    expect(reconstructed.goCriteria).toEqual(NL_TARGET_TRIPLE);
  });

  it('round-trips the born-677 NL-target triple in nogo', () => {
    const intent = makeIntent(['baseline goCriteria'], NL_TARGET_TRIPLE);
    const { reconstructed } = roundTrip(intent);
    expect(reconstructed.nogo).toEqual(NL_TARGET_TRIPLE);
  });

  it('keeps the emitted goCriteria/nogo line as a single physical line despite an embedded newline', () => {
    const intent = makeIntent([NEWLINE_BACKTICK_ITEM], ['baseline nogo']);
    const { text } = roundTrip(intent);
    const goCriteriaLine = text.split('\n').find(l => l.trimStart().startsWith('- goCriteria:'));
    expect(goCriteriaLine).toBeDefined();
    expect(goCriteriaLine).toContain('\\n');
    // The real newline inside the item must not have leaked into the document structure —
    // exactly one line starts with the goCriteria label.
    expect(text.split('\n').filter(l => l.trimStart().startsWith('- goCriteria:'))).toHaveLength(1);
  });

  it('round-trips an item containing a literal backslash', () => {
    const intent = makeIntent(['escape hatch: C\\Users\\alperen\\path'], ['baseline nogo']);
    const { reconstructed } = roundTrip(intent);
    expect(reconstructed.goCriteria).toEqual(['escape hatch: C\\Users\\alperen\\path']);
  });

  it('round-trips multiple delimiter-laden items in the same list without cross-contamination', () => {
    const items = ['a; b', 'c; d; e', 'plain item', 'trailing semicolon;'];
    const intent = makeIntent(items, ['baseline nogo']);
    const { reconstructed } = roundTrip(intent);
    expect(reconstructed.goCriteria).toEqual(items);
  });

  it('still round-trips plain items with no special characters (no regression)', () => {
    const items = ['round-trip build→parse→deep-equal holds', 'parser is never edited'];
    const intent = makeIntent(items, ['editing the parser']);
    const { reconstructed } = roundTrip(intent);
    expect(reconstructed.goCriteria).toEqual(items);
    expect(reconstructed.nogo).toEqual(['editing the parser']);
  });

  it('extractGoNogo recovers the NL-target triple directly from a hand-assembled description', () => {
    const description = [
      'Some prose.',
      '### goNogo',
      `- goCriteria: ${NL_TARGET_TRIPLE.map(s => s.replace(/\\/g, '\\\\').replace(/\r/g, '\\r').replace(/\n/g, '\\n').replace(/;/g, '\\;')).join('; ')}`,
      '- nogo: baseline nogo',
    ].join('\n');

    expect(extractGoNogo(description)).toEqual({
      goCriteria: NL_TARGET_TRIPLE,
      nogo: ['baseline nogo'],
    });
  });
});
