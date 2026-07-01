import { describe, it, expect } from 'vitest';
import {
  buildDirectives,
  extractGoNogo,
  reconstructBuildTask,
  type DirectiveBuildIntent,
  type DirectiveBuildTask,
} from '../../src/orchestra/directives-builder.js';
import { parseStructuredDirectives } from '../../src/orchestra/task-builder.js';

// ─── Fixtures ────────────────────────────────────────────────────────────

function makeIntent(): DirectiveBuildIntent {
  return {
    title: 'Round-trip fixture',
    goal: 'Prove buildDirectives → parseStructuredDirectives → reconstructBuildTask is lossless.',
    tasks: [
      {
        title: "DIR-1 — NL→DIRECTIVES üretici çekirdeği",
        desc:
          'Deterministic builder that turns structured intent into canonical DIRECTIVES.md text.\n' +
          'Round-trip guarantee: parseStructuredDirectives reads the output back losslessly.',
        files: ['src/orchestra/directives-builder.ts', 'tests/orchestra/directives-builder.test.ts'],
        scope: ['src/orchestra/', 'src/core/', 'tests/orchestra/', 'docs/adr/'],
        deps: [],
        model: 'sonnet',
        effort: 'high',
        skills: ['typescript-expert'],
        goCriteria: ['round-trip build→parse→deep-equal holds', 'parser is never edited', '`tsc` temiz'],
        nogo: ['editing the parser', 'calling an LLM'],
      },
      {
        title: 'DIR-2 — follow-up smoke',
        desc: 'Second fixture task exercising dependencies and an explicit empty skills list.',
        files: ['src/orchestra/directives-builder-followup.ts'],
        scope: ['src/orchestra/'],
        deps: ['DIR-1'],
        skills: [],
        goCriteria: ['depends on Task 1 output existing'],
        nogo: ['skipping the dependency check'],
      },
      {
        title: 'DIR-3 — minimal task',
        desc: 'Third fixture task with no Skills line at all (auto-select) and no dependencies.',
        files: ['src/core/example-widget.ts'],
        scope: ['src/core/'],
        deps: [],
        goCriteria: ['minimal path stays parseable'],
        nogo: ['adding scope creep'],
      },
    ],
  };
}

// `scope.directories` accumulates from BOTH the `Files:` line (auto-derived parent
// dirs) and the `Scope:` line, processed in on-page order (Files: precedes Scope:
// in the canonical format — see task-builder.ts:894-909). That interleaving does
// not preserve the caller's original `scope` array order, so round-trip equality
// on `scope` is set-based, not positional.
function sortScope(task: DirectiveBuildTask): DirectiveBuildTask {
  return { ...task, scope: [...task.scope].sort() };
}

// ─── Round-trip ──────────────────────────────────────────────────────────

describe('buildDirectives round-trip', () => {
  it('build → parseStructuredDirectives → reconstructBuildTask deep-equals the original intent', () => {
    const intent = makeIntent();
    const text = buildDirectives(intent);

    const parsed = parseStructuredDirectives(text);
    expect(parsed).toHaveLength(intent.tasks.length);

    parsed.forEach((parsedTask, i) => {
      const reconstructed = reconstructBuildTask(parsedTask);
      expect(sortScope(reconstructed)).toEqual(sortScope(intent.tasks[i]!));
    });
  });

  it('produces a document header + goal that the parser ignores (no phantom tasks)', () => {
    const intent = makeIntent();
    const text = buildDirectives(intent);
    expect(text).toMatch(/^# DIRECTIVES — Round-trip fixture/);
    expect(text).toContain('## Goal');
    expect(parseStructuredDirectives(text)).toHaveLength(3);
  });

  it('is deterministic — identical input produces byte-identical output', () => {
    const intent = makeIntent();
    expect(buildDirectives(intent)).toBe(buildDirectives(makeIntent()));
  });

  it('round-trips a task with no Model/Effort/Skills lines at all', () => {
    const intent: DirectiveBuildIntent = {
      tasks: [
        {
          title: 'Bare task',
          desc: 'No model, no effort, no skills, no deps.',
          files: ['src/core/bare.ts'],
          scope: ['src/core/'],
          deps: [],
          goCriteria: ['stays parseable'],
          nogo: ['nothing'],
        },
      ],
    };
    const parsed = parseStructuredDirectives(buildDirectives(intent));
    expect(parsed).toHaveLength(1);
    expect(reconstructBuildTask(parsed[0]!)).toEqual(intent.tasks[0]);
    expect(parsed[0]!.forceModel).toBeUndefined();
    expect(parsed[0]!.forceEffort).toBeUndefined();
    expect(parsed[0]!.forceSkills).toBeUndefined();
  });

  it('distinguishes Skills: none ([]) from an omitted Skills line (undefined)', () => {
    const base: Omit<DirectiveBuildTask, 'skills' | 'title' | 'files' | 'scope'> = {
      desc: 'skills variant',
      deps: [],
      goCriteria: ['ok'],
      nogo: ['nope'],
    };
    const intent: DirectiveBuildIntent = {
      tasks: [
        { ...base, title: 'Explicit none', files: ['src/core/a.ts'], scope: ['src/core/'], skills: [] },
        { ...base, title: 'Omitted', files: ['src/core/b.ts'], scope: ['src/core/'], skills: undefined },
      ],
    };
    const parsed = parseStructuredDirectives(buildDirectives(intent));
    expect(parsed[0]!.forceSkills).toEqual([]);
    expect(parsed[1]!.forceSkills).toBeUndefined();
  });
});

// ─── extractGoNogo (reader, independent of the writer) ────────────────────

describe('extractGoNogo', () => {
  it('parses a hand-written ### goNogo block', () => {
    const description = [
      'Some prose describing the task.',
      'More prose on a second line.',
      '### goNogo',
      '- goCriteria: first criterion; second criterion',
      '- nogo: first nogo; second nogo',
    ].join('\n');

    expect(extractGoNogo(description)).toEqual({
      goCriteria: ['first criterion', 'second criterion'],
      nogo: ['first nogo', 'second nogo'],
    });
  });

  it('returns empty arrays when there is no ### goNogo heading', () => {
    expect(extractGoNogo('Just prose, no goNogo section.')).toEqual({ goCriteria: [], nogo: [] });
  });
});

// ─── Fragility guards (0-kırılganlık) ──────────────────────────────────────

describe('buildDirectives fragility guards', () => {
  it('throws when intent.tasks is empty', () => {
    expect(() => buildDirectives({ tasks: [] })).toThrow(/at least one task/);
  });

  it('throws on an empty title', () => {
    const intent = makeIntent();
    intent.tasks[0]!.title = '   ';
    expect(() => buildDirectives(intent)).toThrow(/title/);
  });

  it('throws on an empty files list (DISTINCT-FILE)', () => {
    const intent = makeIntent();
    intent.tasks[0]!.files = [];
    expect(() => buildDirectives(intent)).toThrow(/files/);
  });

  it('throws on empty goCriteria or nogo', () => {
    const noGo = makeIntent();
    noGo.tasks[0]!.goCriteria = [];
    expect(() => buildDirectives(noGo)).toThrow(/goCriteria/);

    const noNogo = makeIntent();
    noNogo.tasks[0]!.nogo = [];
    expect(() => buildDirectives(noNogo)).toThrow(/nogo/);
  });

  it('throws when desc smuggles a "## Task N:" heading (would fracture the block split)', () => {
    const intent = makeIntent();
    intent.tasks[0]!.desc = 'Normal text\n## Task 2: hijacked heading\nmore text';
    expect(() => buildDirectives(intent)).toThrow(/heading/);
  });

  it('throws when desc smuggles a reserved directive-label line (e.g. "Model:")', () => {
    const intent = makeIntent();
    intent.tasks[0]!.desc = 'Normal text\nModel: haiku\nmore text';
    expect(() => buildDirectives(intent)).toThrow(/reserved directive-label/);
  });

  it('throws when desc smuggles a "### goNogo" heading', () => {
    const intent = makeIntent();
    intent.tasks[0]!.desc = 'Normal text\n### goNogo\nmore text';
    expect(() => buildDirectives(intent)).toThrow(/reserved/);
  });

  it('throws when a files/scope/deps/skills item contains the "," join delimiter', () => {
    const intent = makeIntent();
    intent.tasks[0]!.files = ['src/a,b.ts'];
    expect(() => buildDirectives(intent)).toThrow(/join delimiter/);
  });

  it('throws when a goCriteria/nogo item contains the ";" join delimiter', () => {
    const intent = makeIntent();
    intent.tasks[0]!.goCriteria = ['first; second'];
    expect(() => buildDirectives(intent)).toThrow(/join delimiter/);
  });

  it('throws when the top-level title/goal would fracture the first block split', () => {
    const intent = makeIntent();
    intent.goal = 'Legit goal text\n## Task 5: hijack';
    expect(() => buildDirectives(intent)).toThrow(/heading/);
  });
});
