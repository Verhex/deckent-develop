import { describe, it, expect } from 'vitest';
import {
  buildDirectives,
  extractGoNogo,
  extractStructuredGoNogo,
  reconstructBuildTask,
  type DirectiveBuildIntent,
} from '../../src/orchestra/directives-builder.js';
import { parseStructuredDirectives } from '../../src/orchestra/task-builder.js';
import { createGoNoGoCriterionItem } from '../../src/core/task-types.js';

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

// RECOVERY-DO-DOGFOOD plan-compile wall (measured 2026-08-09): the first re-run of
// dogfood never reached SPAWN — it died in PLAN-compile because the AI planner wrote
// an ordinary evidence phrase, "file:line citation of the subcommand registration in
// <a source path>", and RESERVED_LABEL_RE matched it against the `Files?` label. The
// guard was applied to the wrong channel: goCriteria/nogo items are emitted through
// escapeListItem onto ONE line (`- goCriteria: a; b`) and criteriaItems through
// JSON.stringify onto ONE line, so no item content can ever begin a physical line and
// none of it can be mis-parsed as a directive. Only `title` and `desc` are emitted raw
// (desc across multiple lines), so those keep the guard. Same shape as born-677 above:
// NL-authored free text must round-trip, not be rejected.
const RESERVED_LABEL_PHRASES = [
  'file:line citation of the subcommand registration',
  'test: unit coverage report',
  'Scope: files touched by the diff',
  'agent: reviewer sign-off',
  'smoke: CLI output line',
  'Dosya: degisiklik listesi',
  'priority: high-risk paths first',
  'Model: which model actually ran',
];

describe('directives-builder reserved-label safety on single-line encoded fields', () => {
  it('does not reject a goCriteria item that opens with a reserved directive label', () => {
    for (const phrase of RESERVED_LABEL_PHRASES) {
      expect(() => buildDirectives(makeIntent([phrase], ['baseline nogo']))).not.toThrow();
    }
  });

  it('does not reject a nogo item that opens with a reserved directive label', () => {
    for (const phrase of RESERVED_LABEL_PHRASES) {
      expect(() => buildDirectives(makeIntent(['baseline goCriteria'], [phrase]))).not.toThrow();
    }
  });

  it('round-trips reserved-label goCriteria items losslessly (proof they cannot be mis-parsed)', () => {
    const { reconstructed, text } = roundTrip(makeIntent(RESERVED_LABEL_PHRASES, ['baseline nogo']));
    expect(reconstructed.goCriteria).toEqual(RESERVED_LABEL_PHRASES);
    // Every phrase stays inside the single goCriteria line — none starts a line of its own.
    expect(text.split('\n').filter(l => l.trimStart().startsWith('- goCriteria:'))).toHaveLength(1);
  });

  it('does not reject a criteriaItems evidence requirement that opens with a reserved label', () => {
    for (const phrase of RESERVED_LABEL_PHRASES) {
      const intent = makeIntent(['baseline goCriteria'], ['baseline nogo']);
      intent.tasks[0]!.criteriaItems = [createGoNoGoCriterionItem({
        polarity: 'go',
        statement: 'The registration is cited',
        evidenceRequirements: [phrase],
      })];
      expect(() => buildDirectives(intent)).not.toThrow();
    }
  });

  it('does not reject a criteriaItems statement that opens with a reserved label', () => {
    const intent = makeIntent(['baseline goCriteria'], ['baseline nogo']);
    intent.tasks[0]!.criteriaItems = [createGoNoGoCriterionItem({
      polarity: 'go',
      statement: 'Files: the diff shows the new subcommand',
      evidenceRequirements: ['the diff'],
    })];
    expect(() => buildDirectives(intent)).not.toThrow();
  });

  it('round-trips a reserved-label evidence requirement losslessly through the JSON channel', () => {
    const requirement = RESERVED_LABEL_PHRASES[0]!;
    const intent = makeIntent(['baseline goCriteria'], ['baseline nogo']);
    intent.tasks[0]!.criteriaItems = [createGoNoGoCriterionItem({
      polarity: 'go',
      statement: 'The registration is cited',
      evidenceRequirements: [requirement],
    })];
    const text = buildDirectives(intent);
    const criteriaLines = text.split('\n').filter(l => l.trimStart().startsWith('- criteriaItems:'));
    expect(criteriaLines).toHaveLength(1);
    expect(extractStructuredGoNogo(text).items[0]!.evidenceRequirements).toEqual([requirement]);
  });

  it('round-trips Unicode line and paragraph separators through the criteriaItems JSON channel', () => {
    const statement = 'Statement before\u2028line separator and after\u2029paragraph separator';
    const evidenceRequirements = [
      'Evidence before\u2028line separator',
      'Evidence before\u2029paragraph separator',
    ];
    const item = createGoNoGoCriterionItem({
      polarity: 'go',
      statement,
      evidenceRequirements,
    });
    const intent = makeIntent(['baseline goCriteria'], ['baseline nogo']);
    intent.tasks[0]!.criteriaItems = [item];

    const { text, reconstructed } = roundTrip(intent);
    const criteriaLine = text.split('\n').find(line => line.trimStart().startsWith('- criteriaItems:'));
    expect(criteriaLine).toContain('\\u2028');
    expect(criteriaLine).toContain('\\u2029');
    expect(criteriaLine).not.toContain('\u2028');
    expect(criteriaLine).not.toContain('\u2029');
    expect(reconstructed.criteriaItems).toEqual([item]);
  });

  it('still rejects a reserved directive label in desc — that field is emitted raw', () => {
    const intent = makeIntent(['baseline goCriteria'], ['baseline nogo']);
    intent.tasks[0]!.desc = 'Normal text\nModel: haiku\nmore text';
    expect(() => buildDirectives(intent)).toThrow(/reserved directive-label/);
  });

  it('still rejects a "## Task N:" heading smuggled into desc', () => {
    const intent = makeIntent(['baseline goCriteria'], ['baseline nogo']);
    intent.tasks[0]!.desc = 'Normal text\n## Task 2: hijacked\nmore text';
    expect(() => buildDirectives(intent)).toThrow(/heading/);
  });
});

describe('scope entry rendering', () => {
  it('keeps a file path intact while a directory still gains its trailing slash', () => {
    // A re-plan proposal reported `src/core/run-status-authority.ts/` among a
    // task's directories; unconditional slash-appending invents a path that
    // cannot exist, and any consumer reading that list inherits it.
    const doc = buildDirectives({
      title: 'T', goal: 'G',
      tasks: [{
        title: 'x', desc: 'y', files: ['src/core/a.ts'],
        scope: ['src/core', 'src/core/a.ts', 'tests/core/'],
        deps: [], goCriteria: ['g'], nogo: ['n'],
      }],
    });
    const scopeLine = doc.split('\n').find(l => l.startsWith('- Scope:'));
    expect(scopeLine).toBe('- Scope: src/core/, src/core/a.ts, tests/core/');
  });
});
