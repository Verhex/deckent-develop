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
  DEFAULT_PROMPT_TENANT_ID,
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
    for (const k of ['worker-contract', 'verify-precedence', 'karpathy']) {
      expect(classifyTier(k)).toBe('T0');
    }
  });

  it('classifies tenant-project stable persona/skills/context/policy kinds as T1', () => {
    for (const k of ['skills', 'persona', 'project-context', 'run-policy']) {
      expect(classifyTier(k)).toBe('T1');
    }
  });

  it('classifies the volatile task/scope/goNogo (and id-bearing) kinds as T2', () => {
    for (const k of [
      'adr', 'verify-steps', 'task', 'scope', 'goNogo', 'what-to-do', 'heartbeat',
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
      goNogo: buildDodBlock({ items: buildTaskPromptSegmented(task, ctx).compilePlan.criteria }),
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

// ─── NPM-Advisory (born-454) — dependency-mutation escalation block ─────────

describe('npm-advisory block — static T0, present in every compiled prompt', () => {
  it('every compiled prompt carries the dependency-mutation advisory', () => {
    const { prompt } = buildTaskPromptSegmented(makeTask(), makeCtx());
    expect(prompt).toContain('## Dependency-Mutation Advisory');
    expect(prompt).toContain('[NPM-ADVISORY]');
    expect(prompt).toContain('.question');
  });

  it('is a T0 segment with static content (no task.id interpolation)', () => {
    const a = buildTaskPromptSegmented(makeTask({ id: 'npm-A' }), makeCtx());
    const b = buildTaskPromptSegmented(makeTask({ id: 'npm-B' }), makeCtx());
    const segA = a.segments.find(s => s.kind === 'npm-advisory');
    const segB = b.segments.find(s => s.kind === 'npm-advisory');
    expect(segA?.tier).toBe('T0');
    expect(segA?.content).toBe(segB?.content);
    expect(segA?.content).not.toContain('npm-A');
  });

  it('classifyTier maps npm-advisory to T0', () => {
    expect(classifyTier('npm-advisory')).toBe('T0');
  });
});

// ─── (5) Leading-T0+T1 prefix is the production default ─────────────────────

describe('leading-T0 reorder — production default with an explicit legacy escape hatch', () => {
  it('the default constant is ON', () => {
    expect(DEFAULT_LEADING_T0_REORDER).toBe(true);
  });

  it('default compilation leads with the worker contract and a contiguous T0+T1 prefix', () => {
    const { prompt, segments } = buildTaskPromptSegmented(makeTask(), makeCtx());
    expect(prompt.startsWith('You are a Deckent worker agent.')).toBe(true);
    const prefix = computeStablePrefix(segments);
    expect(prompt.startsWith(`${prefix}\n\n`)).toBe(true);
  });

  it('buildTaskPrompt is byte-identical to the default segmented assembly', () => {
    const task = makeTask();
    const ctx = makeCtx();
    expect(buildTaskPrompt(task, ctx).prompt).toBe(buildTaskPromptSegmented(task, ctx).prompt);
  });

  it('reorder ON still keeps Skills before Agent (within-tier order preserved)', () => {
    const { prompt } = buildTaskPromptSegmented(makeTask(), makeCtx({ leadingT0Reorder: true }));
    expect(prompt.indexOf('=== Skills ===')).toBeLessThan(prompt.indexOf('=== Agent:'));
  });

  it('never emits an invariant tier after the first task-specific segment', () => {
    const { segments } = buildTaskPromptSegmented(makeTask(), makeCtx());
    const firstTaskSpecific = segments.findIndex(segment => segment.tier === 'T2');
    expect(firstTaskSpecific).toBeGreaterThan(-1);
    expect(segments.slice(0, firstTaskSpecific).every(segment => segment.tier !== 'T2')).toBe(true);
    expect(segments.slice(firstTaskSpecific).every(segment => segment.tier === 'T2')).toBe(true);
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

// ─── (7b) stablePrefixKey is WIRED to production (593-002) ──────────────────
//
// Before 593-002 `stablePrefixKey` had no production caller — the cache-key seam
// was dead. `buildTaskPromptSegmented` now emits it, keyed on the canonical
// task-class profile (`resolveTaskPromptProfile`) + agent. These pins lock the
// wire itself AND its central safety property: computing the key must not move a
// single byte of the compiled prompt.

describe('stablePrefixKey — production wiring via buildTaskPromptSegmented', () => {
  it('emits the (tenant, profile::agent) key for a code task', () => {
    const out = buildTaskPromptSegmented(makeTask({ type: 'code-development' }), makeCtx());
    expect(out.promptProfile).toBe('code');
    expect(out.cachePrefixKey).toBe(stablePrefixKey('local', 'code::architect'));
  });

  it('keys a doc-only task apart from a code task (different T0 composition)', () => {
    const doc = buildTaskPromptSegmented(makeTask({ type: 'documentation' }), makeCtx());
    const code = buildTaskPromptSegmented(makeTask({ type: 'code-development' }), makeCtx());
    expect(doc.promptProfile).toBe('doc-only');
    expect(doc.cachePrefixKey).toBe(stablePrefixKey('local', 'doc-only::architect'));
    expect(doc.cachePrefixKey).not.toBe(code.cachePrefixKey);
  });

  it('keys an inspection-only task apart (read-only discipline composition)', () => {
    const inspection = buildTaskPromptSegmented(
      makeTask({ scope: { directories: ['src/core/'], filesRead: ['src/core/config.ts'], filesWrite: [] } }),
      makeCtx(),
    );
    expect(inspection.promptProfile).toBe('inspection-only');
    expect(inspection.cachePrefixKey).toBe(stablePrefixKey('local', 'inspection-only::architect'));
  });

  it('honors the caller-supplied tenant and falls back to the local sentinel', () => {
    const tenant = buildTaskPromptSegmented(makeTask(), makeCtx({ tenantId: 'tenant-7' }));
    const local = buildTaskPromptSegmented(makeTask(), makeCtx());
    expect(tenant.cachePrefixKey.startsWith('tenant-7::')).toBe(true);
    expect(local.cachePrefixKey.startsWith(`${DEFAULT_PROMPT_TENANT_ID}::`)).toBe(true);
    expect(tenant.cachePrefixKey).not.toBe(local.cachePrefixKey);
  });

  it('two tasks of the same class share the key AND the byte-stable prefix', () => {
    const a = buildTaskPromptSegmented(makeTask({ id: 'aaa-001' }), makeCtx());
    const b = buildTaskPromptSegmented(makeTask({ id: 'bbb-002' }), makeCtx());
    expect(a.cachePrefixKey).toBe(b.cachePrefixKey);
    expect(computeStablePrefix(a.segments)).toBe(computeStablePrefix(b.segments));
  });

  it('is metadata-only — the compiled prompt is unchanged by the key/profile', () => {
    const task = makeTask();
    expect(buildTaskPromptSegmented(task, makeCtx()).prompt)
      .toBe(buildTaskPrompt(task, makeCtx()).prompt);
    // A different tenant changes the KEY but never the prompt bytes.
    expect(buildTaskPromptSegmented(task, makeCtx({ tenantId: 'tenant-9' })).prompt)
      .toBe(buildTaskPromptSegmented(task, makeCtx()).prompt);
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
