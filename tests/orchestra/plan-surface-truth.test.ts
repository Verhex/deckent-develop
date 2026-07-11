// born-629 (404-003 PLAN-SURFACE-TRUTH) — DIRECTIVES.md `- Model: X | Agent: Y`
// combined-line hints were being dropped during parse, never reaching
// task.forceModel/task.forceAgent.
//
// RED evidence (captured against the pre-fix source, sprint-404's own Task 3
// header text): `parseStructuredDirectives('## Task 1: X\n- Model: sonnet |
// Agent: bug-fixer\n...')` returned `forceModel: undefined, forceAgent:
// undefined` for BOTH fields — the exact line shape DIRECTIVES.md's real task
// headers use. Root cause: `Model:`/`Agent:` extraction anchored a regex at
// the START of the whole line and captured everything to the end of the line
// as the value, so on a combined line: (a) Model's captured value included
// the trailing "| Agent: ..." text, failing ALL_MODELS validation and
// silently dropping; (b) Agent's anchored-at-line-start regex never matched
// at all, since the line starts with "Model:", not "Agent:".
//
// Fix: task-builder.ts now splits each directive line on `|` before matching
// a `key: value` shape per-segment (`splitDirectiveLineSegments` /
// `findDirectiveValue`), so combined and separate-line forms parse identically.

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  parseStructuredDirectives,
  parseBulletOrNumberedTasks,
  splitDirectiveLineSegments,
  findDirectiveValue,
} from '../../src/orchestra/task-builder.js';
import { routeTaskV2 } from '../../src/core/routing-engine.js';
import { createAgentDefinition } from '../../src/core/agent-types.js';
import type { AgentDefinition, AgentPool } from '../../src/core/agent-types.js';
import type { TaskScope } from '../../src/core/task-types.js';
import type { ActivationConfig } from '../../src/core/routing-types.js';

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── splitDirectiveLineSegments / findDirectiveValue — unit-level ───────────

describe('splitDirectiveLineSegments', () => {
  it('splits a combined "- Model: X | Agent: Y" line into two segments', () => {
    const segs = splitDirectiveLineSegments('- Model: sonnet | Agent: bug-fixer');
    expect(segs).toEqual([
      { key: 'model', value: 'sonnet' },
      { key: 'agent', value: 'bug-fixer' },
    ]);
  });

  it('is order-independent ("- Agent: X | Model: Y" also splits cleanly)', () => {
    const segs = splitDirectiveLineSegments('- Agent: bug-fixer | Model: sonnet');
    expect(segs).toEqual([
      { key: 'agent', value: 'bug-fixer' },
      { key: 'model', value: 'sonnet' },
    ]);
  });

  it('behaves identically to a single directive on its own line (no pipe)', () => {
    expect(splitDirectiveLineSegments('- Model: opus')).toEqual([{ key: 'model', value: 'opus' }]);
    expect(splitDirectiveLineSegments('Model: opus')).toEqual([{ key: 'model', value: 'opus' }]);
  });

  it('does not mistake prose containing a colon for a directive segment', () => {
    // No colon immediately after the first word → no segment produced.
    expect(splitDirectiveLineSegments('This task requires the model to behave.')).toEqual([]);
  });

  it('returns empty array for a blank line', () => {
    expect(splitDirectiveLineSegments('   ')).toEqual([]);
  });
});

describe('findDirectiveValue', () => {
  it('finds a value on a combined line', () => {
    const lines = ['- Model: sonnet | Agent: bug-fixer', '- Scope: src/orchestra/'];
    expect(findDirectiveValue(lines, 'model')).toBe('sonnet');
    expect(findDirectiveValue(lines, 'agent')).toBe('bug-fixer');
  });

  it('first occurrence wins across multiple lines', () => {
    const lines = ['- Model: opus', '- Model: haiku'];
    expect(findDirectiveValue(lines, 'model')).toBe('opus');
  });

  it('returns undefined when the key never appears', () => {
    expect(findDirectiveValue(['- Scope: src/'], 'model')).toBeUndefined();
  });
});

// ─── parseStructuredDirectives — combined-line Model+Agent capture (born-629) ──

describe('parseStructuredDirectives — combined "- Model: X | Agent: Y" line (born-629 fix)', () => {
  it('captures BOTH forceModel and forceAgent from the exact DIRECTIVES.md task-header shape', () => {
    // This is the literal line shape used by sprint-404's own DIRECTIVES.md task
    // headers (e.g. "## Task 3: ... \n- Model: sonnet | Agent: bug-fixer").
    const content = '## Task 1: PLAN-SURFACE-TRUTH\n- Model: sonnet | Agent: bug-fixer\n- Scope: src/orchestra/\n\n### Description\nFix the hint-drop.';
    const tasks = parseStructuredDirectives(content);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]!.forceModel).toBe('sonnet');
    expect(tasks[0]!.forceAgent).toBe('bug-fixer');
  });

  it('captures both hints regardless of Model/Agent order on the combined line', () => {
    const content = '## Task 1: Order Test\n- Agent: doc-writer | Model: haiku\n\n### Description\nOrder independence.';
    const tasks = parseStructuredDirectives(content);
    expect(tasks[0]!.forceAgent).toBe('doc-writer');
    expect(tasks[0]!.forceModel).toBe('haiku');
  });

  it('still supports the separate-line variant (no regression)', () => {
    const content = '## Task 1: Separate Lines\n- Model: opus\n- Agent: security-auditor\n\n### Description\nClassic form.';
    const tasks = parseStructuredDirectives(content);
    expect(tasks[0]!.forceModel).toBe('opus');
    expect(tasks[0]!.forceAgent).toBe('security-auditor');
  });

  it('combines Model+Agent+Effort on one line', () => {
    const content = '## Task 1: Triple Combo\n- Model: opus | Agent: refactorer | Effort: high\n\n### Description\nAll three.';
    const tasks = parseStructuredDirectives(content);
    expect(tasks[0]!.forceModel).toBe('opus');
    expect(tasks[0]!.forceAgent).toBe('refactorer');
    expect(tasks[0]!.forceEffort).toBe('high');
  });

  it('"Agent: none" on a combined line still maps to generic (no WARN)', () => {
    const writeSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const content = '## Task 1: None Agent\n- Model: sonnet | Agent: none\n\n### Description\nNo agent wanted.';
    const tasks = parseStructuredDirectives(content);
    expect(tasks[0]!.forceAgent).toBe('generic');
    expect(writeSpy).not.toHaveBeenCalled();
  });

  it('"Agent: auto" on a combined line still maps to undefined (no WARN — deliberate no-op)', () => {
    const writeSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const content = '## Task 1: Auto Agent\n- Model: sonnet | Agent: auto\n\n### Description\nLet the router pick.';
    const tasks = parseStructuredDirectives(content);
    expect(tasks[0]!.forceAgent).toBeUndefined();
    expect(writeSpy).not.toHaveBeenCalled();
  });
});

// ─── stderr-WARN on truly uncaptured hints (born-458 precedent) ─────────────

describe('parseStructuredDirectives — uncaptured-hint stderr WARN (born-458 precedent)', () => {
  it('WARNs when Model: is present but resolves to an unrecognized model id', () => {
    const writeSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const content = '## Task 1: Bad Model Combo\n- Model: gpt4 | Agent: refactorer\n\n### Description\nTypo model.';
    const tasks = parseStructuredDirectives(content);
    expect(tasks[0]!.forceModel).toBeUndefined();
    expect(tasks[0]!.forceAgent).toBe('refactorer');
    expect(writeSpy).toHaveBeenCalledTimes(1);
    expect(writeSpy.mock.calls[0]![0]).toContain('gpt4');
    expect(writeSpy.mock.calls[0]![0]).toContain('WARN');
  });

  it('does not WARN when Model: resolves to a valid model', () => {
    const writeSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const content = '## Task 1: Good Model\n- Model: opus | Agent: refactorer\n\n### Description\nValid.';
    parseStructuredDirectives(content);
    expect(writeSpy).not.toHaveBeenCalled();
  });

  it('does not WARN when no Model:/Agent: directive is present at all', () => {
    const writeSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const content = '## Task 1: No Hints\n- Scope: src/\n\n### Description\nNothing forced.';
    parseStructuredDirectives(content);
    expect(writeSpy).not.toHaveBeenCalled();
  });
});

// ─── parseBulletOrNumberedTasks — same combined-line fix, fallback path ─────

describe('parseBulletOrNumberedTasks — combined "- Model: X | Agent: Y" line (born-629 fix)', () => {
  it('captures both forceModel and forceAgent at the bullet-list parse site', () => {
    const content = [
      '- Task: Fix the routing bug',
      '  - Model: sonnet | Agent: bug-fixer',
    ].join('\n');
    const tasks = parseBulletOrNumberedTasks(content);
    expect(tasks[0]!.forceModel).toBe('sonnet');
    expect(tasks[0]!.forceAgent).toBe('bug-fixer');
  });

  it('WARNs when the bullet-list Model: value is unrecognized', () => {
    const writeSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const content = [
      '- Task: Bad model in bullet form',
      '  - Model: totallybogus | Agent: refactorer',
    ].join('\n');
    const tasks = parseBulletOrNumberedTasks(content);
    expect(tasks[0]!.forceModel).toBeUndefined();
    expect(tasks[0]!.forceAgent).toBe('refactorer');
    expect(writeSpy).toHaveBeenCalledTimes(1);
  });
});

// ─── End-to-end: parse → task-directive override → routeTaskV2 honors it ───
// Mirrors the existing pattern in tests/orchestra/route-v2-integration.test.ts
// (c) force-* overrides preserved — building the SAME { source: 'task-directive',
// forceAgent, priority: 3 } shape sprint-planner.ts:676-685 builds from
// task.forceAgent, then calling the real routeTaskV2.

function makeAgent(id: string, activation: ActivationConfig): AgentDefinition {
  return createAgentDefinition({
    id,
    name: id,
    description: `${id} fixture agent`,
    manifestVersion: 2,
    activation,
  });
}

function buildFixturePool(): AgentPool {
  const pool: AgentPool = new Map();
  pool.set('refactorer', makeAgent('refactorer', {
    rules: [{ name: 'intent-implementation', when: { 'intent.primary': 'implementation' }, score: 8 }],
    exclude: [],
    minScore: 5,
  }));
  pool.set('doc-writer', makeAgent('doc-writer', {
    rules: [{ name: 'weak-fallback', when: { 'intent.primary': 'implementation' }, score: 1 }],
    exclude: [],
    minScore: 5,
  }));
  return pool;
}

const FIXTURE_TASK = {
  title: 'Fix task-builder directive parsing',
  description: 'Repair the combined Model/Agent hint parsing in task-builder.ts.',
  scope: { directories: ['src/orchestra/'], filesRead: [], filesWrite: ['src/orchestra/task-builder.ts'] } satisfies TaskScope,
};

describe('end-to-end: DIRECTIVES text → parse → task-directive override → routeTaskV2', () => {
  it('parses forceAgent=doc-writer from directive text and routeTaskV2 honors it', () => {
    const content = '## Task 1: PLAN-SURFACE-TRUTH\n- Model: sonnet | Agent: doc-writer\n- Scope: src/orchestra/\n\n### Description\nFix it.';
    const [parsed] = parseStructuredDirectives(content);
    expect(parsed!.forceAgent).toBe('doc-writer');

    const pool = buildFixturePool();

    // Baseline sanity: without the override, the stronger-scoring agent wins.
    const baseline = routeTaskV2(FIXTURE_TASK, pool, new Map());
    expect(baseline.agentId).toBe('refactorer');

    // Same override shape sprint-planner.ts builds from task.forceAgent
    // (sprint-planner.ts ~676-685: { source: 'task-directive', forceAgent, priority: 3 }).
    const decision = routeTaskV2(FIXTURE_TASK, pool, new Map(), {
      overrides: [{ source: 'task-directive', forceAgent: parsed!.forceAgent, priority: 3 }],
    });
    expect(decision.agentId).toBe('doc-writer');
    expect(decision.overrideSource).toBe('task-directive');
  });
});
