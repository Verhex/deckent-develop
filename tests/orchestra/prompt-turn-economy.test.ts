// born-636-K1 (Sprint 407 Task 407-002) — locks the Turn Economy directive:
//   born-636 measured a code task at $2.38 total, $1.05 (44%) of which was
//   cacheRead across ~25-30 turns × ~135k context — turn COUNT, not per-turn
//   token size, is the dominant cost multiplier. Fix is prompt-layer only: a
//   compact, static (task-invariant) T0 block on tool-call batching + verify-
//   loop discipline, emitted UNCONDITIONALLY (every task, doc or code) —
//   unlike NPM_ADVISORY_BLOCK, which is skipped for doc-only tasks.
//
// This test pins:
//   - composition: the block's header + all 4 directives are present verbatim
//     in the compiled prompt, for BOTH a doc-only task and a code task.
//   - ordering: the block lands after '## Karpathy Discipline' and before the
//     Shared Context / Upstream Handoffs / Worker Communications tail blocks.
//   - size-increase cap: the block's own footprint (content + one
//     SEGMENT_SEPARATOR) stays under 1200 chars — an anti-bloat clamp so this
//     "compact, static" directive cannot silently grow into a second essay.

import { describe, it, expect } from 'vitest';
import { buildTaskPrompt } from '../../src/orchestra/prompt-god-template.js';
import type { SprintContext } from '../../src/orchestra/prompt-god-template.js';
import { SEGMENT_SEPARATOR } from '../../src/orchestra/prompt-segmentation.js';
import type { Task } from '../../src/core/task-types.js';
import { TaskStatus } from '../../src/core/task-types.js';

// ─── Test Helpers ──────────────────────────────────────────────────────

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '407-002',
    title: 'Test task',
    description: 'A test task for prompt generation',
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
    sprintId: 'sprint-407',
    assignedAgent: 'architect',
    assignedSkills: ['typescript-expert'],
    ...overrides,
  };
}

function makeCtx(overrides: Partial<SprintContext> = {}): SprintContext {
  return {
    agentId: 'architect',
    agentPrompt: '# Architect Agent\nYou are a system architect.',
    skillPrompts: [
      { name: 'typescript-expert', content: '# TypeScript Expert\nUse strict mode.' },
    ],
    effort: 'high',
    ...overrides,
  };
}

// Byte-exact mirror of the private `TURN_ECONOMY_BLOCK` constant in
// prompt-god-template.ts. Kept literal (not imported — the const is
// module-private by design, matching the KARPATHY_ESSENCE/NPM_ADVISORY_BLOCK
// precedent) so this test proves the COMPILED PROMPT carries the exact,
// unshortened text rather than merely a loosely-matching substring.
const TURN_ECONOMY_TEXT = `## Turn Economy
Every conversation turn re-sends cached context — fewer turns beats fewer tokens per turn.
1. Batch independent read/search tool calls (Read + Grep + Glob) into the SAME turn — never issue them one-by-one across turns when none depends on another's output.
2. Do not re-read a file already in your context unless its on-disk state changed since your last read.
3. Run lint/build + targeted tests once per logical block of edits, not after every micro-edit — the max-3-attempt verify rule above already caps retries; do not burn turns on early, incomplete verify runs.
4. When drafting your .plan file, gather every target file's content in ONE turn (parallel reads) before writing the plan.`;

// ─── Composition-pin ─────────────────────────────────────────────────────

describe('born-636-K1: Turn Economy directive — composition', () => {
  it('renders the exact block verbatim in a code task prompt', () => {
    const { prompt } = buildTaskPrompt(makeTask({ type: 'code-development' }), makeCtx());
    expect(prompt).toContain(TURN_ECONOMY_TEXT);
  });

  it('renders the exact block verbatim in a doc-only task prompt (unconditional, unlike npm-advisory)', () => {
    const { prompt } = buildTaskPrompt(
      makeTask({
        type: 'documentation',
        scope: { directories: ['scratch/'], filesRead: [], filesWrite: ['scratch/note.md'] },
      }),
      makeCtx(),
    );
    // npm-advisory is gated OFF for doc-only tasks (LP-6) — turn-economy is NOT.
    expect(prompt).not.toContain('Dependency-Mutation Advisory');
    expect(prompt).toContain(TURN_ECONOMY_TEXT);
  });

  it('covers all 4 directives: parallel batching, no stale re-read, block-level verify, single-turn plan gather', () => {
    const { prompt } = buildTaskPrompt(makeTask(), makeCtx());
    expect(prompt).toMatch(/Batch independent read\/search tool calls.*SAME turn/);
    expect(prompt).toMatch(/Do not re-read a file already in your context/);
    expect(prompt).toMatch(/Run lint\/build \+ targeted tests once per logical block of edits/);
    expect(prompt).toMatch(/gather every target file's content in ONE turn/);
  });
});

// ─── Ordering-pin ─────────────────────────────────────────────────────────

describe('born-636-K1: Turn Economy directive — ordering', () => {
  it('appears after the Karpathy Discipline anchor', () => {
    const { prompt } = buildTaskPrompt(makeTask(), makeCtx());
    const karpathyIdx = prompt.indexOf('## Karpathy Discipline');
    const turnEconomyIdx = prompt.indexOf('## Turn Economy');
    expect(karpathyIdx).toBeGreaterThan(-1);
    expect(turnEconomyIdx).toBeGreaterThan(-1);
    expect(turnEconomyIdx).toBeGreaterThan(karpathyIdx);
  });

  it('appears before the Shared Context / Upstream Handoffs / Worker Communications tail blocks', () => {
    const { prompt } = buildTaskPrompt(
      makeTask(),
      makeCtx({
        sharedContext: [{ key: 'plan', writerId: '407-001', value: 'config-first' }],
        upstreamHandoffs: [{ fromTaskId: '407-001', artifacts: ['src/core/config.ts'] }],
        workerCommsEnabled: true,
      }),
    );
    const turnEconomyIdx = prompt.indexOf('## Turn Economy');
    expect(turnEconomyIdx).toBeGreaterThan(-1);
    expect(turnEconomyIdx).toBeLessThan(prompt.indexOf('=== Shared Context (other workers) ==='));
    expect(turnEconomyIdx).toBeLessThan(prompt.indexOf('=== Upstream Handoffs ==='));
    expect(turnEconomyIdx).toBeLessThan(prompt.indexOf('=== Worker Communications ==='));
  });
});

// ─── Size-increase pin (anti-bloat clamp) ──────────────────────────────────

describe('born-636-K1: Turn Economy directive — size-increase cap', () => {
  it('the block stays compact: ≤15 lines', () => {
    const lineCount = TURN_ECONOMY_TEXT.split('\n').length;
    expect(lineCount).toBeLessThanOrEqual(15);
  });

  it('the block\'s prompt-size footprint (content + one segment separator) stays ≤ 1200 chars', () => {
    // This is the exact delta this feature adds to the compiled prompt: the
    // segment's own content plus the SEGMENT_SEPARATOR that joins it to the
    // preceding segment (mirrors how buildTaskPromptSegmented assembles
    // `segments.map(s => s.content).join(SEGMENT_SEPARATOR)`).
    const footprint = TURN_ECONOMY_TEXT.length + SEGMENT_SEPARATOR.length;
    expect(footprint).toBeLessThanOrEqual(1200);
  });
});
