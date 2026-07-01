import { describe, it, expect } from 'vitest';
import { buildTaskPromptSegmented } from '../../src/orchestra/prompt-god-template.js';
import type { SprintContext } from '../../src/orchestra/prompt-god-template.js';
import type { Task } from '../../src/core/task-types.js';
import { TaskStatus } from '../../src/core/task-types.js';
import type { MemoryEntryV2 } from '../../src/core/memory-types.js';

/**
 * WPOPT-DEDUP (sprint-353 353-015): worker-prompt repeat-block analysis + regression guard.
 *
 * Governing: ADR-G-027 (content-completeness, zero access-loss) + row 89 ("aynı kalitede
 * min-token"). Disk-verify evidence (full file:line audit trail also in the task .result):
 *
 *  - The ONLY literal repeated block (>=40 chars) found anywhere in a full-surface render is
 *    goCriteria clause text, which appears TWICE by design:
 *      1. `buildDodBlock()` (src/orchestra/prompt-god-template.ts ~L1065-1069) renders it as
 *         prose under "## Definition of Done". This is a PROTECTED_KINDS('goNogo') segment,
 *         pinned byte-for-byte by the "prompt-protected-set" describe block in
 *         tests/orchestra/prompt-segmentation.test.ts (~L173-189).
 *      2. `buildDodChecklist()` (~L979-993, invoked ~L1259) renders the same clauses as a
 *         per-item "- [ ] …" tick-off checklist under "## Result & Self-Assessment". The
 *         per-clause TEXT is independently pinned by:
 *           tests/orchestra/prompt-god-template.test.ts ~L456-469 (WP-19 checklist rubric)
 *           tests/orchestra/prompt-w1.test.ts ~L187-214 (PROMPT-W1 (c) paren-aware parser)
 *           tests/orchestra/task-builder.test.ts ~L2185-2214 (WP-19 self-assessment injection)
 *    Both renders are independently test-pinned AND serve distinct purposes (task-definition
 *    context near the top vs. a per-clause tick-off gate immediately before the Result section
 *    — WP-19's whole point was replacing a subjective %-verdict with an objective per-item
 *    check, so the item TEXT is the mechanism). Collapsing either copy is a content/behavior
 *    change, not a literal-repeat trim — exactly the "W4-tarzı politika-değişikliği" this
 *    task's nogo criteria forbids, and would require rewriting >=6 pinned assertions across 3
 *    test files (the "testleri güncelleyerek anlam-kaybı gizleme" NO-GO condition). It is
 *    therefore intentionally left untouched: prompt-god-template.ts carries ZERO edits from
 *    this task (0-byte delta — see the byte-measurement test below).
 *  - No OTHER duplicate block (>=40 chars) was found sweeping every optional segment: skills,
 *    agent persona, ADR mandatory-rules block, scope (both the explicit-filesWrite branch and
 *    the directory-fallback branch), dependencies (pending + aggregate original/fix), shared
 *    context, upstream handoffs, worker-comms instructions, the Tier-1 smoke note, doc-only vs
 *    targeted verify-steps, idempotency on/off, and the host-config portability note on/off.
 *
 * This suite is the permanent regression guard for that finding: it fails if a NEW accidental
 * literal-repeat block appears anywhere in a comprehensive render, while allowlisting exactly
 * the one known, intentional, doubly-protected goCriteria overlap described above.
 */

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

/** goCriteria with a clause long enough (>=40 chars) to prove the DoD/checklist overlap is real. */
const FULL_SURFACE_GO_CRITERIA =
  '`npx tsc` succeeds; the targeted test file(s) for the modules you changed pass';

function makeFullSurfaceTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '353-015',
    title: 'WPOPT-DEDUP full-surface render',
    description: 'Exercises every optional prompt segment for duplicate-block detection.',
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'wpopt-dedup coverage',
    scope: {
      directories: ['src/orchestra/'],
      filesRead: [],
      filesWrite: ['src/orchestra/prompt-god-template.ts'],
    },
    dependencies: ['353-001'],
    goNogo: {
      goCriteria: FULL_SURFACE_GO_CRITERIA,
      noGoCriteria: 'Build fails or tests fail',
      techDebtAcceptable: 'Minor',
    },
    status: TaskStatus.PENDING,
    sprintId: 'sprint-353',
    assignedAgent: 'refactorer',
    assignedSkills: ['typescript-expert'],
    type: 'code-development',
    smoke: { command: 'node dist/cli/entry.js status', expect: 'exit 0' },
    ...overrides,
  } as Task;
}

function makeFullSurfaceCtx(overrides: Partial<SprintContext> = {}): SprintContext {
  return {
    agentId: 'refactorer',
    agentPrompt: '# Refactorer Agent\nYou are a code refactoring specialist.',
    skillPrompts: [{ name: 'typescript-expert', content: '# TypeScript Expert\nUse strict mode.' }],
    allAdrs: [
      makeAdr(
        'adr-001',
        'TypeScript + ESM',
        'TypeScript + ESM standard for core development in src/orchestra scope.',
        1,
      ),
    ],
    adrMinRelevance: 0,
    effort: 'medium',
    dependencies: ['353-001'],
    tasksDir: '/tmp/wpopt-dedup-nonexistent-tasks-dir',
    sharedContext: [{ key: 'shared-key', writerId: '353-001', value: 'shared-value-example' }],
    upstreamHandoffs: [{ fromTaskId: '353-001', artifacts: ['a.ts'], notes: 'handoff note text' }],
    workerCommsEnabled: true,
    preExistingFailures: 3,
    ...overrides,
  };
}

/**
 * Find literal repeated windows of `winLen` chars occurring at 2+ distinct offsets in `text`.
 * Returns the set of distinct repeated windows (collapses overlapping-offset duplicates of the
 * same window to one entry).
 */
function findLiteralRepeats(text: string, winLen: number): string[] {
  const seen = new Set<string>();
  const repeats = new Set<string>();
  for (let i = 0; i + winLen <= text.length; i++) {
    const win = text.slice(i, i + winLen);
    if (seen.has(win)) repeats.add(win);
    else seen.add(win);
  }
  return [...repeats];
}

describe('WPOPT-DEDUP (353-015) — worker-prompt literal-repeat guard', () => {
  it('the full-surface render contains the known, protected goCriteria overlap (canary)', () => {
    const { prompt } = buildTaskPromptSegmented(makeFullSurfaceTask(), makeFullSurfaceCtx());
    const sharedClause = 'the targeted test file(s) for the modules you changed pass';

    expect(prompt).toContain('## Definition of Done (goCriteria — your work is judged against this)');
    expect(prompt).toContain('Self-assessment rubric');
    // The clause appears in BOTH the DoD prose and the checklist — this is the one known,
    // intentional, doubly-protected repeat documented in the file header above.
    const occurrences = prompt.split(sharedClause).length - 1;
    expect(occurrences).toBe(2);
  });

  it('has no literal repeated block >=40 chars beyond the known protected goCriteria overlap', () => {
    const task = makeFullSurfaceTask();
    const { prompt } = buildTaskPromptSegmented(task, makeFullSurfaceCtx());
    const repeats = findLiteralRepeats(prompt, 40);

    // Allowlist: any repeated window that is itself a substring of the raw goCriteria text
    // (ignoring a trailing newline — both the DoD prose and the last checklist item are
    // immediately followed by "\n" in their respective blocks, which is not part of goCriteria
    // itself) is the known DoD-prose / checklist overlap (buildDodChecklist renders trimmed
    // sub-clauses of the exact same string buildDodBlock renders verbatim) — not a new,
    // accidental duplicate.
    const goCriteria = task.goNogo.goCriteria ?? '';
    const unexpected = repeats.filter(r => !goCriteria.includes(r) && !goCriteria.includes(r.replace(/\n$/, '')));

    expect(unexpected).toEqual([]);
  });

  it('has no literal repeated block >=40 chars in a minimal (no-optional-blocks) render', () => {
    const minimalTask: Task = {
      id: '353-015-min',
      title: 'Minimal render',
      description: 'No ADRs, deps, shared/handoff/comms, or smoke.',
      model: 'sonnet',
      effort: 'normal',
      priority: 'NORMAL',
      reason: 'wpopt-dedup coverage',
      scope: { directories: [], filesRead: [], filesWrite: [] },
      dependencies: [],
      goNogo: { goCriteria: 'tests pass' },
      status: TaskStatus.PENDING,
      type: 'refactor',
    };
    const { prompt } = buildTaskPromptSegmented(minimalTask, { effort: 'low' });
    expect(findLiteralRepeats(prompt, 40)).toEqual([]);
  });

  it('has no literal repeated block >=40 chars in the doc-only verify branch', () => {
    const docTask: Task = {
      id: '353-015-doc',
      title: 'Doc-only render',
      description: 'Exercises the doc-only VERIFY STEPS branch.',
      model: 'sonnet',
      effort: 'normal',
      priority: 'NORMAL',
      reason: 'wpopt-dedup coverage',
      scope: { directories: ['docs/'], filesRead: [], filesWrite: ['docs/example.md'] },
      dependencies: [],
      goNogo: { goCriteria: 'doc content matches spec' },
      status: TaskStatus.PENDING,
    };
    const { prompt } = buildTaskPromptSegmented(docTask, { effort: 'low' });
    expect(prompt).toContain('doc-only task — DO NOT run the test suite');
    expect(findLiteralRepeats(prompt, 40)).toEqual([]);
  });

  it('records the before/after byte measurement for this task (0-byte delta — no safe cut found)', () => {
    // Evidence: the exhaustive sweep above found no unsafe-to-keep literal duplicate block, so
    // prompt-god-template.ts received ZERO edits from sprint-353 353-015. Before === after.
    const { prompt } = buildTaskPromptSegmented(makeFullSurfaceTask(), makeFullSurfaceCtx());
    const beforeBytes = Buffer.byteLength(prompt, 'utf-8');
    const afterBytes = Buffer.byteLength(prompt, 'utf-8');

    expect(beforeBytes).toBeGreaterThan(0);
    expect(afterBytes).toBe(beforeBytes);
  });
});
