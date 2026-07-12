import { describe, it, expect } from 'vitest';
import {
  computeToolAllowlist,
  evaluateEscalationRequest,
  DEFAULT_WORKER_TOOL_CATALOG,
  type WorkerToolDescriptor,
  type WorkerToolGroup,
} from '../../src/core/tool-allowlist.js';
import type { TaskKind } from '../../src/core/work-model.js';

// Every canonical TaskKind — kept in sync with work-model.ts by the exhaustive
// Record<TaskKind,…> in the module (a missing kind there is a compile error).
const ALL_KINDS: readonly TaskKind[] = [
  'code-development',
  'test',
  'documentation',
  'audit',
  'security',
  'refactor',
  'devops',
  'config',
  'design',
  'data',
  'generic',
];

/** Kinds that get a shell by default (independent of scope). Complement = doc/audit. */
const EXECUTE_KINDS = new Set<TaskKind>([
  'code-development',
  'test',
  'security',
  'refactor',
  'devops',
  'config',
  'design',
  'data',
  'generic',
]);

const SURFACE_RISK_GROUPS: readonly WorkerToolGroup[] = ['web', 'connector', 'mcp', 'orchestration'];

describe('computeToolAllowlist — group policy table', () => {
  it('every kind always grants read/search/planning and NEVER a surface-risk group by default', () => {
    for (const kind of ALL_KINDS) {
      for (const filesWrite of [[], ['src/x.ts']]) {
        const r = computeToolAllowlist({ taskType: kind, scope: { filesWrite } });
        expect(r.allowedGroups).toEqual(expect.arrayContaining(['read', 'search', 'planning']));
        for (const risky of SURFACE_RISK_GROUPS) {
          expect(r.allowedGroups).not.toContain(risky);
        }
      }
    }
  });

  it('edit group ⟺ scope declares writable paths (the two-layer interaction) for every kind', () => {
    for (const kind of ALL_KINDS) {
      const empty = computeToolAllowlist({ taskType: kind, scope: { filesWrite: [] } });
      const withWrite = computeToolAllowlist({ taskType: kind, scope: { filesWrite: ['out.txt'] } });
      expect(empty.allowedGroups).not.toContain('edit');
      expect(withWrite.allowedGroups).toContain('edit');
    }
  });

  it('execute group depends on taskType, not on scope', () => {
    for (const kind of ALL_KINDS) {
      const expected = EXECUTE_KINDS.has(kind);
      for (const filesWrite of [[], ['a.ts']]) {
        const r = computeToolAllowlist({ taskType: kind, scope: { filesWrite } });
        expect(r.allowedGroups.includes('execute')).toBe(expected);
      }
    }
  });

  it('documentation and audit never get execute (read/write, no shell)', () => {
    for (const kind of ['documentation', 'audit'] as const) {
      const r = computeToolAllowlist({ taskType: kind, scope: { filesWrite: ['doc.md'] } });
      expect(r.allowedGroups).not.toContain('execute');
    }
  });
});

describe('computeToolAllowlist — concrete tool sets on the reference catalog', () => {
  it('code-development with writes → exactly the native read/search/edit/execute/plan tools', () => {
    const r = computeToolAllowlist({ taskType: 'code-development', scope: { filesWrite: ['src/x.ts'] } });
    expect(r.allowed).toEqual([
      'Bash',
      'BashOutput',
      'Edit',
      'Glob',
      'Grep',
      'KillShell',
      'MultiEdit',
      'NotebookEdit',
      'Read',
      'TodoWrite',
      'Write',
    ]);
    // typical ~10-15, not the full 20-entry reference surface
    expect(r.allowed.length).toBe(11);
    expect(r.allowed.length).toBeLessThan(DEFAULT_WORKER_TOOL_CATALOG.length);
  });

  it('audit with NO writable path → read-only (4 tools, no edit/execute)', () => {
    const r = computeToolAllowlist({ taskType: 'audit', scope: { filesWrite: [] } });
    expect(r.allowed).toEqual(['Glob', 'Grep', 'Read', 'TodoWrite']);
  });

  it('audit WITH a report path → edit surfaces (8 tools, still no execute)', () => {
    const r = computeToolAllowlist({ taskType: 'audit', scope: { filesWrite: ['report.md'] } });
    expect(r.allowed).toEqual([
      'Edit',
      'Glob',
      'Grep',
      'MultiEdit',
      'NotebookEdit',
      'Read',
      'TodoWrite',
      'Write',
    ]);
    expect(r.allowed).not.toContain('Bash');
  });

  it('excludes connector / web / mcp / orchestration tools by default', () => {
    const r = computeToolAllowlist({ taskType: 'code-development', scope: { filesWrite: ['x.ts'] } });
    for (const denied of ['WebFetch', 'WebSearch', 'Task', 'mcp__telegram__send', 'deckent_start']) {
      expect(r.allowed).not.toContain(denied);
      expect(r.escalatable).toContain(denied);
    }
  });
});

describe('computeToolAllowlist — determinism', () => {
  it('allowed/escalatable are sorted and stable regardless of universe input order', () => {
    const shuffled = [...DEFAULT_WORKER_TOOL_CATALOG].reverse();
    const a = computeToolAllowlist({ taskType: 'code-development', scope: { filesWrite: ['x.ts'] } });
    const b = computeToolAllowlist({
      taskType: 'code-development',
      scope: { filesWrite: ['x.ts'] },
      universe: shuffled,
    });
    expect(b.allowed).toEqual(a.allowed);
    expect(b.escalatable).toEqual(a.escalatable);
    expect([...a.allowed]).toEqual([...a.allowed].sort((x, y) => x.localeCompare(y)));
  });

  it('deduplicates repeated tool names in the universe', () => {
    const dupUniverse: WorkerToolDescriptor[] = [
      { name: 'Read', group: 'read' },
      { name: 'Read', group: 'read' },
      { name: 'Grep', group: 'search' },
    ];
    const r = computeToolAllowlist({ taskType: 'audit', scope: { filesWrite: [] }, universe: dupUniverse });
    expect(r.allowed).toEqual(['Grep', 'Read']);
  });

  it('allowed and escalatable partition the (unique) universe — no overlap, full cover', () => {
    const r = computeToolAllowlist({ taskType: 'generic', scope: { filesWrite: ['x.ts'] } });
    const overlap = r.allowed.filter((t) => r.escalatable.includes(t));
    expect(overlap).toEqual([]);
    const union = new Set([...r.allowed, ...r.escalatable]);
    const uniqueUniverse = new Set(DEFAULT_WORKER_TOOL_CATALOG.map((t) => t.name));
    expect(union).toEqual(uniqueUniverse);
  });
});

describe('computeToolAllowlist — agent narrow-only refinement', () => {
  it('subtracts agent.deniedTools and never adds tools', () => {
    const base = computeToolAllowlist({ taskType: 'code-development', scope: { filesWrite: ['x.ts'] } });
    const constrained = computeToolAllowlist({
      taskType: 'code-development',
      scope: { filesWrite: ['x.ts'] },
      agent: { id: 'code-reviewer', deniedTools: ['Write', 'Edit'] },
    });
    expect(constrained.allowed).not.toContain('Write');
    expect(constrained.allowed).not.toContain('Edit');
    expect(constrained.escalatable).toContain('Write');
    // narrow-only: constrained ⊆ base
    for (const t of constrained.allowed) expect(base.allowed).toContain(t);
    expect(constrained.rationale).toContain('code-reviewer');
  });

  it('unknown agent id with no deniedTools is a no-op', () => {
    const withAgent = computeToolAllowlist({
      taskType: 'test',
      scope: { filesWrite: ['t.test.ts'] },
      agent: { id: 'some-future-agent' },
    });
    const without = computeToolAllowlist({ taskType: 'test', scope: { filesWrite: ['t.test.ts'] } });
    expect(withAgent.allowed).toEqual(without.allowed);
  });
});

describe('computeToolAllowlist — custom universe injection', () => {
  it('selects from a caller-supplied universe (Task 14 wiring path)', () => {
    const universe: WorkerToolDescriptor[] = [
      { name: 'Read', group: 'read' },
      { name: 'Bash', group: 'execute' },
      { name: 'mcp__erp__query', group: 'connector' },
    ];
    const r = computeToolAllowlist({ taskType: 'devops', scope: { filesWrite: [] }, universe });
    expect(r.allowed).toEqual(['Bash', 'Read']);
    expect(r.escalatable).toEqual(['mcp__erp__query']);
  });
});

describe('evaluateEscalationRequest — typed escape-hatch contract', () => {
  const result = computeToolAllowlist({ taskType: 'code-development', scope: { filesWrite: ['x.ts'] } });

  it('admits a well-formed request for a real, currently-denied tool', () => {
    const verdict = evaluateEscalationRequest(
      { taskId: '427-013', tool: 'WebFetch', justification: 'fetch upstream API docs' },
      result,
    );
    expect(verdict).toEqual({ admissible: true, tool: 'WebFetch' });
  });

  it('rejects a tool that is already allowed', () => {
    const verdict = evaluateEscalationRequest(
      { taskId: 't', tool: 'Read', justification: 'x' },
      result,
    );
    expect(verdict).toEqual({ admissible: false, tool: 'Read', reason: 'already-allowed' });
  });

  it('rejects a tool that is not in the universe', () => {
    const verdict = evaluateEscalationRequest(
      { taskId: 't', tool: 'TotallyFakeTool', justification: 'x' },
      result,
    );
    expect(verdict).toEqual({ admissible: false, tool: 'TotallyFakeTool', reason: 'unknown-tool' });
  });

  it('rejects an empty or whitespace-only justification before anything else', () => {
    for (const justification of ['', '   ', '\n\t']) {
      const verdict = evaluateEscalationRequest({ taskId: 't', tool: 'WebFetch', justification }, result);
      expect(verdict).toEqual({ admissible: false, tool: 'WebFetch', reason: 'missing-justification' });
    }
  });

  it('honors a caller-supplied universe when checking unknown-tool', () => {
    const universe: WorkerToolDescriptor[] = [{ name: 'mcp__erp__query', group: 'connector' }];
    const r = computeToolAllowlist({ taskType: 'audit', scope: { filesWrite: [] }, universe });
    const verdict = evaluateEscalationRequest(
      { taskId: 't', tool: 'mcp__erp__query', justification: 'read ledger' },
      r,
      universe,
    );
    expect(verdict).toEqual({ admissible: true, tool: 'mcp__erp__query' });
  });
});
