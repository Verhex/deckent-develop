import { describe, it, expect } from 'vitest';
import {
  classifyTier,
  segmentByTier,
  reorderLeadingT0,
  computeStablePrefix,
  findUnprotected,
  extractProtectedSegments,
  stablePrefixKey,
  PROTECTED_KINDS,
  DEFAULT_LEADING_T0_REORDER,
  type PromptSegment,
} from '../../src/orchestra/prompt-segmentation.js';
import {
  buildTaskPrompt,
  buildTaskPromptSegmented,
  buildVerifyPrecedenceNote,
  buildScopeBlock,
  buildDodBlock,
  conditionalBoilerplate,
} from '../../src/orchestra/prompt-god-template.js';
import type { SprintContext } from '../../src/orchestra/prompt-god-template.js';
import type { Task } from '../../src/core/task-types.js';
import { TaskStatus } from '../../src/core/task-types.js';
import type { MemoryEntryV2 } from '../../src/core/memory-types.js';

// ─── Test Helpers (mirrors prompt-determinism.test.ts so the two guards agree) ──

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '330-019',
    title: 'Test task',
    description: 'A test task for prompt segmentation',
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'Testing',
    scope: {
      directories: ['src/core/'],
      filesRead: [],
      filesWrite: ['src/core/config.ts'],
    },
    dependencies: [],
    goNogo: { goCriteria: 'Pass', noGoCriteria: 'Fail', techDebtAcceptable: 'Minor' },
    status: TaskStatus.PENDING,
    sprintId: 'sprint-330',
    assignedAgent: 'architect',
    assignedSkills: ['typescript-expert'],
    ...overrides,
  };
}

function makeAdr(id: string, title: string, content: string, sprintNum: number): MemoryEntryV2 {
  return {
    id,
    title,
    content,
    type: 'adr',
    status: 'accepted',
    sprint_id: `sprint-${sprintNum}`,
    sprint_num: sprintNum,
    tags: [],
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    decay_exempt: false,
  } as MemoryEntryV2;
}

function makeCtx(overrides: Partial<SprintContext> = {}): SprintContext {
  return {
    agentId: 'architect',
    agentPrompt: '# Architect Agent\nYou are a system architect.',
    skillPrompts: [
      { name: 'typescript-expert', content: '# TypeScript Expert\nUse strict mode.' },
    ],
    allAdrs: [
      makeAdr('adr-001', 'TypeScript + ESM', 'TypeScript + ESM standard for core development.', 1),
      makeAdr('adr-008', 'Brain Merkezi Import', 'Brain central import pattern for orchestra modules.', 72),
      makeAdr('adr-015', 'TaskRouter Module', 'TaskRouter 6-level routing for task-to-provider assignment.', 44),
      makeAdr('adr-003', 'vitest over Jest', 'vitest chosen as test framework for speed and ESM compat.', 1),
      makeAdr('adr-029', 'Managed-Docs', 'Managed-Docs Universalization for sprint document generation.', 131),
    ],
    effort: 'high',
    ...overrides,
  };
}

// A synthetic, deliberately tier-interleaved segment list for the pure helpers.
const SAMPLE: PromptSegment[] = [
  { tier: 'T1', kind: 'skills', content: 'S' },
  { tier: 'T1', kind: 'persona', content: 'P' },
  { tier: 'T0', kind: 'worker-contract', content: 'W' },
  { tier: 'T2', kind: 'task', content: 'TASK' },
  { tier: 'T0', kind: 'karpathy', content: 'K' },
  { tier: 'T2', kind: 'scope', content: 'SCOPE' },
];

// ─── (1) Tier classification ───────────────────────────────────────────────

describe('classifyTier — T0/T1/T2 classification', () => {
  it('classifies the global worker-contract/verify/karpathy kinds as T0', () => {
    for (const k of ['worker-contract', 'verify-steps', 'verify-precedence', 'karpathy']) {
      expect(classifyTier(k)).toBe('T0');
    }
  });

  it('classifies the tenant-project persona/skills/ADR kinds as T1', () => {
    for (const k of ['skills', 'persona', 'adr']) {
      expect(classifyTier(k)).toBe('T1');
    }
  });

  it('classifies the volatile task/scope/goNogo (and id-bearing) kinds as T2', () => {
    for (const k of [
      'task', 'scope', 'goNogo', 'what-to-do', 'heartbeat',
      'result-contract', 'deps', 'smoke', 'shared', 'handoff', 'comms',
    ]) {
      expect(classifyTier(k)).toBe('T2');
    }
  });

  it('an unknown kind falls back to T2 so it can never poison the shared prefix', () => {
    expect(classifyTier('some-future-kind')).toBe('T2');
  });
});

// ─── (2) Tier grouping + leading-T0 reorder ─────────────────────────────────

describe('segmentByTier + reorderLeadingT0', () => {
  it('partitions segments by tier, preserving within-tier order', () => {
    const { T0, T1, T2 } = segmentByTier(SAMPLE);
    expect(T0.map(s => s.content)).toEqual(['W', 'K']);
    expect(T1.map(s => s.content)).toEqual(['S', 'P']);
    expect(T2.map(s => s.content)).toEqual(['TASK', 'SCOPE']);
  });

  it('reorders T0 → T1 → T2 while preserving within-tier order', () => {
    const out = reorderLeadingT0(SAMPLE);
    expect(out.map(s => s.content)).toEqual(['W', 'K', 'S', 'P', 'TASK', 'SCOPE']);
  });

  it('is pure — never mutates the input array', () => {
    const before = SAMPLE.map(s => ({ ...s }));
    reorderLeadingT0(SAMPLE);
    expect(SAMPLE).toEqual(before);
  });
});

// ─── (3) Per-(tenant,task-class) byte-stable prefix ─────────────────────────

describe('computeStablePrefix — same task-class ⇒ byte-identical prefix, variation only in T2', () => {
  it('two same-class tasks (differ only in id) share a byte-identical T0+T1 prefix', () => {
    const ctx = makeCtx();
    const a = buildTaskPromptSegmented(makeTask({ id: 'cls-A' }), ctx);
    const b = buildTaskPromptSegmented(makeTask({ id: 'cls-B' }), ctx);

    // Prefix (T0 global + T1 project) is byte-identical.
    expect(computeStablePrefix(a.segments)).toBe(computeStablePrefix(b.segments));

    // T0 and T1 segment contents match exactly…
    const at = segmentByTier(a.segments);
    const bt = segmentByTier(b.segments);
    expect(at.T0.map(s => s.content)).toEqual(bt.T0.map(s => s.content));
    expect(at.T1.map(s => s.content)).toEqual(bt.T1.map(s => s.content));

    // …and ALL variation is confined to the T2 tail (task body differs by id).
    expect(at.T2.map(s => s.content)).not.toEqual(bt.T2.map(s => s.content));
  });
});

// ─── (4) Protected-set diff (scope / goNogo / verify-precedence) ────────────

describe('prompt-protected-set — scope/goNogo/verify survive compilation diff-equal with source', () => {
  it('the compiled prompt carries every protected element byte-for-byte from its source builder', () => {
    const task = makeTask();
    const ctx = makeCtx();
    const { prompt } = buildTaskPromptSegmented(task, ctx);

    const bp = conditionalBoilerplate(task);
    const sources = {
      scope: buildScopeBlock(task.scope, [], bp.hostConfig),
      goNogo: buildDodBlock(task.goNogo),
      verifyPrecedence: buildVerifyPrecedenceNote(),
    };

    // Diff-equal: every protected source string is present verbatim → nothing
    // was reworded or dropped during compilation.
    expect(findUnprotected(prompt, sources)).toEqual([]);
  });

  it('PROTECTED_KINDS pins exactly scope / goNogo / verify-precedence', () => {
    expect([...PROTECTED_KINDS].sort()).toEqual(['goNogo', 'scope', 'verify-precedence']);
  });

  it('findUnprotected reports a reworded/dropped protected element', () => {
    const sources = { scope: 'SCOPE-SRC', goNogo: 'GONOGO-SRC', verifyPrecedence: 'VP-SRC' };
    // scope reworded away, the other two intact.
    expect(findUnprotected('keeps GONOGO-SRC and VP-SRC', sources)).toEqual(['scope']);
    // Nothing present → all three flagged.
    expect(findUnprotected('', sources).sort()).toEqual(['goNogo', 'scope', 'verify-precedence']);
  });

  it('exposes the scope protected segment as a standalone segment', () => {
    const { segments } = buildTaskPromptSegmented(makeTask(), makeCtx());
    expect(extractProtectedSegments(segments).map(s => s.kind)).toContain('scope');
  });
});

// ─── (5) Leading-T0 reorder is flag-gated, default OFF ──────────────────────

describe('leading-T0 reorder — flag-gated, default OFF (determinism preserved)', () => {
  it('the default constant is OFF', () => {
    expect(DEFAULT_LEADING_T0_REORDER).toBe(false);
  });

  it('default compilation preserves production order — Skills lead, not the worker-contract', () => {
    const { prompt } = buildTaskPrompt(makeTask(), makeCtx());
    expect(prompt.startsWith('=== Skills ===')).toBe(true);
  });

  it('buildTaskPrompt is byte-identical to the default segmented assembly', () => {
    const task = makeTask();
    const ctx = makeCtx();
    expect(buildTaskPrompt(task, ctx).prompt).toBe(buildTaskPromptSegmented(task, ctx).prompt);
  });

  it('reorder ON leads with the global T0 worker-contract', () => {
    const { prompt } = buildTaskPromptSegmented(makeTask(), makeCtx({ leadingT0Reorder: true }));
    expect(prompt.startsWith('You are a Deckent worker agent.')).toBe(true);
  });

  it('reorder ON changes only segment ORDER, not the set of segment contents', () => {
    const off = buildTaskPromptSegmented(makeTask(), makeCtx());
    const on = buildTaskPromptSegmented(makeTask(), makeCtx({ leadingT0Reorder: true }));
    expect(on.segments.map(s => s.content).sort()).toEqual(off.segments.map(s => s.content).sort());
    expect(on.segments.map(s => s.kind)).not.toEqual(off.segments.map(s => s.kind));
  });

  it('reorder ON still keeps Skills before Agent (within-tier order preserved)', () => {
    const { prompt } = buildTaskPromptSegmented(makeTask(), makeCtx({ leadingT0Reorder: true }));
    expect(prompt.indexOf('=== Skills ===')).toBeLessThan(prompt.indexOf('=== Agent:'));
  });

  it('segmented build is idempotent (no Date/random leakage)', () => {
    const task = makeTask();
    const ctx = makeCtx({ leadingT0Reorder: true });
    expect(buildTaskPromptSegmented(task, ctx).prompt).toBe(buildTaskPromptSegmented(task, ctx).prompt);
  });
});

// ─── (6) Verify-precedence — unconditional / protected ──────────────────────

describe('buildVerifyPrecedenceNote — unconditional / protected', () => {
  it('emits for the default (no-arg) call and the targeted mode', () => {
    expect(buildVerifyPrecedenceNote()).toContain('single authority');
    expect(buildVerifyPrecedenceNote('targeted')).toContain('single authority');
  });

  it('suppresses ONLY the doc path (a doc task runs no tests)', () => {
    expect(buildVerifyPrecedenceNote('doc')).toBe('');
  });

  it('a targeted (code) prompt always carries the protected precedence note', () => {
    const { prompt } = buildTaskPrompt(makeTask(), makeCtx());
    expect(prompt).toContain('Verify-precedence (this task overrides your persona)');
  });
});

// ─── (7) Stable prefix cache key ────────────────────────────────────────────

describe('stablePrefixKey', () => {
  it('is deterministic per (tenant, task-class) and distinguishes tenants', () => {
    expect(stablePrefixKey('tenant-1', 'code-development::architect'))
      .toBe(stablePrefixKey('tenant-1', 'code-development::architect'));
    expect(stablePrefixKey('tenant-1', 'x')).not.toBe(stablePrefixKey('tenant-2', 'x'));
  });
});

// ─── (8) Tier-tag ↔ classifyTier SSOT consistency + prefix purity (xfix hardening) ──
//
// The compiler (renderSegments) hand-assigns a `tier` to every `push(tier, kind, …)`,
// while `classifyTier`/`TIER_BY_KIND` is the independent SSOT the cache reorder and
// stable-prefix helpers key on. Nothing previously asserted the two AGREE — a future
// edit could tag a kind 'T0' in renderSegments while TIER_BY_KIND still says 'T2' (or
// vice-versa), silently splitting cache semantics from compile-time tags. These guards
// lock that consistency, plus the central cache-correctness claim: no per-task (T2)
// token may ever leak into the shared T0+T1 prefix.

describe('segment tier tags agree with the classifyTier SSOT (no silent drift)', () => {
  it('every emitted segment is tagged with exactly classifyTier(kind) — default order', () => {
    const { segments } = buildTaskPromptSegmented(makeTask(), makeCtx());
    expect(segments.length).toBeGreaterThan(0);
    for (const seg of segments) {
      expect(seg.tier).toBe(classifyTier(seg.kind));
    }
  });

  it('still holds under the leading-T0 reorder (reorder preserves each tag)', () => {
    const { segments } = buildTaskPromptSegmented(makeTask(), makeCtx({ leadingT0Reorder: true }));
    for (const seg of segments) {
      expect(seg.tier).toBe(classifyTier(seg.kind));
    }
  });

  it('the byte-stable prefix excludes every per-task (T2) token — no cache poisoning', () => {
    const uniqueId = 'XFIX-UNIQUE-TASK-TOKEN';
    const { segments } = buildTaskPromptSegmented(makeTask({ id: uniqueId }), makeCtx());
    const prefix = computeStablePrefix(segments);
    // The task id is a volatile per-task token: it MUST live only in the T2 tail, never
    // in the shared T0+T1 cache prefix — otherwise two tasks could never share a hit.
    expect(prefix).not.toContain(uniqueId);
    // Sanity: the id really is emitted somewhere (so the assertion above is meaningful).
    expect(segments.some(s => s.content.includes(uniqueId))).toBe(true);
  });
});
