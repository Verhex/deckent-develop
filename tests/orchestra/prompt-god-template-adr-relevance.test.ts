// ─── Sprint 182 PQ-5 (F7) — ADR Relevance Threshold ────────────────────
// Verifies that buildTaskPrompt drops ADRs scoring below the configured
// minimum relevance and omits the entire `=== Mandatory Architecture Rules
// (ADR) ===` block (including its header) when no ADR survives the filter.
// Locked decision: default 0.3, overrideable via SprintContext.adrMinRelevance
// (which `task-builder.buildWorkerPrompt` resolves from
// `.deckent/config.json::prompt.adr_min_relevance`).

import { describe, it, expect } from 'vitest';
import {
  buildTaskPrompt,
  DEFAULT_ADR_MIN_RELEVANCE,
} from '../../src/orchestra/prompt-god-template.js';
import type { SprintContext } from '../../src/orchestra/prompt-god-template.js';
import type { Task } from '../../src/core/task-types.js';
import { TaskStatus } from '../../src/core/task-types.js';
import type { MemoryEntryV2 } from '../../src/core/memory-types.js';
import {
  selectRelevantAdrs,
  type AdrRelevance,
} from '../../src/orchestra/adr-selector.js';

// ─── Test Helpers ──────────────────────────────────────────────────────

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '182-011',
    title: 'ADR relevance threshold test',
    description: 'Verify F7 threshold filtering drops low-relevance ADRs',
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
    sprintId: 'sprint-182',
    assignedAgent: 'refactorer',
    assignedSkills: [],
    ...overrides,
  };
}

function makeAdr(
  id: string,
  title: string,
  content: string,
  sprintNum = 50,
): MemoryEntryV2 {
  return {
    id,
    title,
    content,
    type: 'adr',
    status: 'accepted',
    sprint_id: `sprint-${sprintNum}`,
    sprint_num: sprintNum,
    tags: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    decay_exempt: false,
  } as MemoryEntryV2;
}

function makeCtx(overrides: Partial<SprintContext> = {}): SprintContext {
  return {
    agentId: 'refactorer',
    agentPrompt: '# Refactorer Agent\nYou clean up code.',
    skillPrompts: [],
    allAdrs: [],
    effort: 'normal',
    ...overrides,
  };
}

const ADR_HEADER = '=== Mandatory Architecture Rules (ADR) ===';

/**
 * Build a task tuned to score adr-001 and adr-002 strongly while leaving
 * adr-xyz (a fabricated unrelated id) with no scope-, intent-, preset-, or
 * keyword-based hits — its only path to non-zero is the keyword scorer, which
 * the helper deliberately starves.
 */
function highRelevanceCoreTask(): Task {
  return makeTask({
    title: 'core config refactor for memory provider model',
    description:
      'Update src/core/config types, memory store, provider registry and model selection.',
  });
}

// ─── Tests ─────────────────────────────────────────────────────────────

describe('buildTaskPrompt — ADR relevance threshold (F7, Sprint 182 PQ-5)', () => {
  // ── T1: threshold filter drops low-scoring ADRs while keeping high ones ──
  it('drops ADRs whose relevance score is below the active threshold', () => {
    const task = highRelevanceCoreTask();

    // Two well-targeted ADRs (core-dev preset + scope match) and one stranger
    // (irrelevant scope, no preset, no intent, no keyword overlap).
    const adrs: MemoryEntryV2[] = [
      makeAdr(
        'adr-001',
        'TypeScript + ESM core configuration',
        '**Context:** core config types and provider model registry.\n**Decision:** apply ESM.',
        140,
      ),
      makeAdr(
        'adr-002',
        'Node16 Module Resolution',
        '**Context:** core config memory provider types.\n**Decision:** use Node16.',
        140,
      ),
      // Deliberately weak signal — accessibility/UI domain, fabricated id so no
      // preset/intent ever boosts it, no scope keyword overlap.
      makeAdr(
        'adr-zzz',
        'WCAG color contrast tokens',
        '**Context:** dashboard accessibility palette tokens for screen readers.\n**Decision:** adopt AAA contrast.',
        140,
      ),
    ];

    // Sanity: scoring confirms the gap (adr-zzz scores 0; if this ever flips
    // the test premise is broken and we want to know loudly).
    const ranked: AdrRelevance[] = selectRelevantAdrs(task, adrs, 10);
    const zzz = ranked.find(r => r.adrId === 'adr-zzz');
    expect(zzz === undefined || zzz.score < 0.3).toBe(true);
    const a001 = ranked.find(r => r.adrId === 'adr-001');
    expect(a001 && a001.score >= 0.3).toBe(true);

    const result = buildTaskPrompt(task, makeCtx({ allAdrs: adrs }));

    expect(result.metadata.adrIds).not.toContain('adr-zzz');
    expect(result.metadata.adrIds).toContain('adr-001');
    expect(result.prompt).not.toContain('adr-zzz');
    expect(result.prompt).not.toContain('WCAG color contrast tokens');
    // The mandatory header should still appear because high-scoring ADRs survived.
    expect(result.prompt).toContain(ADR_HEADER);
  });

  // ── T2: every ADR below threshold → block (header included) omitted ─────
  it('omits the entire ADR block (header included) when no ADR meets the threshold', () => {
    const task = makeTask({
      // Title/description deliberately drift from every preset/intent/scope
      // keyword so no ADR earns a meaningful score.
      title: 'rotate decorative iconography',
      description: 'adjust marketing illustrations only',
      scope: {
        directories: ['assets/'],
        filesRead: [],
        filesWrite: ['assets/icons.svg'],
      },
    });

    const adrs: MemoryEntryV2[] = [
      // Real-id ADRs but with content that has zero overlap with the task —
      // they should still rank low enough to be filtered out by the F7 threshold.
      makeAdr(
        'adr-001',
        'TypeScript + ESM',
        '**Context:** TS ESM.\n**Decision:** use it.',
        1,
      ),
      makeAdr(
        'adr-002',
        'Node16 Module Resolution',
        '**Context:** node16.\n**Decision:** use it.',
        1,
      ),
    ];

    // Use a deliberately high custom threshold so every ADR is filtered out
    // (works regardless of preset/age penalty drift across sprints).
    const result = buildTaskPrompt(
      task,
      makeCtx({ allAdrs: adrs, adrMinRelevance: 0.99 }),
    );

    expect(result.metadata.adrIds).toEqual([]);
    expect(result.prompt).not.toContain(ADR_HEADER);
    expect(result.prompt).not.toContain('Mandatory Architecture Rules');
    expect(result.prompt).not.toContain('Violating an accepted ADR requires');
  });

  // ── T3: explicit SprintContext override changes the cutoff ──────────────
  it('honors a custom adrMinRelevance over the default 0.3', () => {
    const task = highRelevanceCoreTask();

    // Construct a mid-scoring ADR by giving it title keywords that hit the
    // scope-path matcher (+0.4) and the keyword matcher, but no preset/intent
    // boost. We then check both sides of an aggressive threshold.
    const adrs: MemoryEntryV2[] = [
      makeAdr(
        'adr-mid',
        'core memory provider notes',
        '**Context:** core config memory provider model snippet.\n**Decision:** noted.',
        140,
      ),
    ];

    const ranked = selectRelevantAdrs(task, adrs, 10);
    const mid = ranked.find(r => r.adrId === 'adr-mid');
    expect(mid).toBeDefined();
    expect(mid!.score).toBeGreaterThan(0);

    // Pick a threshold strictly above the mid-score → ADR must be dropped.
    const tooHigh = Math.min(1, mid!.score + 0.1);
    const dropped = buildTaskPrompt(
      task,
      makeCtx({ allAdrs: adrs, adrMinRelevance: tooHigh }),
    );
    expect(dropped.metadata.adrIds).not.toContain('adr-mid');
    expect(dropped.prompt).not.toContain(ADR_HEADER);

    // Pick a threshold strictly below the mid-score → ADR must be kept,
    // even when the default 0.3 would normally clear it. The override is
    // what proves the wiring honors caller-supplied values.
    const lenient = Math.max(0, mid!.score - 0.05);
    const kept = buildTaskPrompt(
      task,
      makeCtx({ allAdrs: adrs, adrMinRelevance: lenient }),
    );
    expect(kept.metadata.adrIds).toContain('adr-mid');
    expect(kept.prompt).toContain(ADR_HEADER);
    expect(kept.prompt).toContain('adr-mid');
  });

  // ── Smoke: default constant value matches the locked spec decision ─────
  it('exposes DEFAULT_ADR_MIN_RELEVANCE = 0.3 (locked spec value)', () => {
    expect(DEFAULT_ADR_MIN_RELEVANCE).toBe(0.3);
  });
});
