// ═══ run-proposal-compiler — boundary-invariant regression lock (435-003) ══
//
// Companion to tests/orchestra/run-proposal-planner.test.ts (which proves the
// injectable-planner-seam contract). This file locks the two compiler-owned
// boundary invariants `toDirectiveTask` enforces BEFORE a RunProposal-derived
// intent can reach directives-builder (born-691 / born-692):
//   - Case A: a task with an empty `scope.filesWrite` is a typed
//     RunProposalPlanError naming the OFFENDING task's original title, never
//     a silent TODO scaffold (born-691).
//   - Case B: a comma-bearing task title AND a dependency ref pointing at
//     that same raw title both round-trip through the SAME canonicalTaskTitle
//     sanitizer, so the compiled DIRECTIVES markdown -- read back through the
//     UNCHANGED parseStructuredDirectives parser (task-builder.ts) -- still
//     resolves the dependency edge to the identical canonical title the
//     depended-on task carries (born-692).
//
// Neither `canonicalTaskTitle` nor `toDirectiveTask` is exported from
// run-proposal-compiler.ts -- both cases exercise them ONLY through the
// public compileRunProposalIntent/compileRunProposal API, matching the
// existing test file's convention of never reaching into module internals.

import { describe, it, expect } from 'vitest';
import {
  compileRunProposal,
  compileRunProposalIntent,
  RunProposalPlanError,
  type RunProposalPlanner,
} from '../../src/orchestra/run-proposal-compiler.js';
import { parseStructuredDirectives } from '../../src/orchestra/task-builder.js';
import { reconstructBuildTask, type DirectiveBuildTask } from '../../src/orchestra/directives-builder.js';
import type { RunProposal } from '../../src/core/run-flow-contract.js';
import type { PlannerResult, PlannerTask } from '../../src/core/types.js';

// ─── Fixtures (self-contained -- mirrors tests/orchestra/run-proposal-planner.test.ts) ──

function makeProposal(overrides: Partial<RunProposal> = {}): RunProposal {
  return {
    flowId: 'flow-435-1',
    tenant: 'local',
    project: 'deckent',
    actor: { id: 'native-agent', role: 'operator' },
    origin: 'chat',
    revision: 1,
    intentSummary: 'Ship the two boundary-invariant regression-lock cases',
    ...overrides,
  };
}

function makePlannerTask(overrides: Partial<PlannerTask> = {}): PlannerTask {
  return {
    title: 'Backend export endpoints',
    description: 'Add POST /export/csv and /export/json handlers.',
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'Single-module CRUD change, follows existing route pattern.',
    scope: { directories: ['src/api/'], filesRead: ['src/api/router.ts'], filesWrite: ['src/api/export.ts'] },
    dependencies: [],
    goNogo: {
      goCriteria: 'POST /export/csv and /export/json both return 200 with correct content-type.',
      noGoCriteria: 'Either endpoint 500s or returns the wrong content-type.',
      techDebtAcceptable: 'Streaming for very large exports can follow up later.',
    },
    ...overrides,
  };
}

// `scope` accumulates from BOTH `Files:` (auto-derived parent dirs) and `Scope:`
// on-page order, not the caller's original array order -- same non-issue this
// fixture sidesteps by keeping `files`/`scope` parent dirs aligned, but round-trip
// equality is still asserted set-based to match the established project pattern
// (tests/orchestra/directives-builder.test.ts:60).
function sortScope(task: DirectiveBuildTask): DirectiveBuildTask {
  return { ...task, scope: [...task.scope].sort() };
}

// ─── Case A: empty scope.filesWrite -> typed error naming the OFFENDING task ──

describe('compileRunProposalIntent — empty scope.filesWrite (born-691 regression lock)', () => {
  it('throws RunProposalPlanError naming the offending task\'s original title, not the valid sibling\'s', async () => {
    const proposal = makeProposal({ flowId: 'flow-435-empty-files' });
    const validTask = makePlannerTask({ title: 'Valid backend task' });
    const emptyFilesTask = makePlannerTask({
      title: 'Broken export UI task',
      scope: { directories: ['src/dashboard/'], filesRead: [], filesWrite: [] },
      reason: 'Frontend piece — forgot to declare a write target.',
    });
    const fakePlanner: RunProposalPlanner = () => ({
      reasoning: 'One valid task, one with an empty filesWrite.',
      tasks: [validTask, emptyFilesTask],
    });

    let caught: unknown;
    try {
      await compileRunProposalIntent(proposal, fakePlanner);
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(RunProposalPlanError);
    const err = caught as RunProposalPlanError;
    expect(err.flowId).toBe(proposal.flowId);
    expect(err.message).toContain('"Broken export UI task"');
    expect(err.message).toContain('scope.filesWrite is empty');
    expect(err.message).toContain(emptyFilesTask.reason);
    // Proves the message identifies the correct (offending) task, not the valid one.
    expect(err.message).not.toContain('Valid backend task');
  });

  it('treats a whitespace-only filesWrite entry as empty (no blank-string escape hatch)', async () => {
    const proposal = makeProposal({ flowId: 'flow-435-blank-file' });
    const blankFileTask = makePlannerTask({
      title: 'Whitespace-only write target',
      scope: { directories: ['src/api/'], filesRead: [], filesWrite: ['   '] },
    });
    const fakePlanner: RunProposalPlanner = () => ({
      reasoning: 'Single task whose only filesWrite entry is blank.',
      tasks: [blankFileTask],
    });

    await expect(compileRunProposalIntent(proposal, fakePlanner)).rejects.toThrow(RunProposalPlanError);
    try {
      await compileRunProposalIntent(proposal, fakePlanner);
    } catch (e) {
      expect(e).toBeInstanceOf(RunProposalPlanError);
      expect((e as Error).message).toContain('"Whitespace-only write target"');
    }
  });

  it('compileRunProposal (markdown entrypoint) surfaces the same typed error for an empty-filesWrite task', async () => {
    const proposal = makeProposal({ flowId: 'flow-435-empty-files-md' });
    const emptyFilesTask = makePlannerTask({
      title: 'No write target',
      scope: { directories: ['src/api/'], filesRead: [], filesWrite: [] },
    });
    const fakePlanner: RunProposalPlanner = () => ({ reasoning: 'r', tasks: [emptyFilesTask] });

    await expect(compileRunProposal(proposal, fakePlanner)).rejects.toThrow(RunProposalPlanError);
  });
});

// ─── Case B: comma-bearing title + dependency ref -> consistent canonicalization,
//             proven through a REAL parseStructuredDirectives round-trip ──────────

describe('compileRunProposalIntent/compileRunProposal — comma-bearing title + dependency (born-692 regression lock)', () => {
  const COMMA_TITLE = 'Fix login bug, add regression test';

  function makeCommaTitlePlan(): PlannerResult {
    return {
      reasoning: 'Backend fix task with a comma in its title, plus a dependent verification task.',
      tasks: [
        makePlannerTask({ title: COMMA_TITLE }),
        makePlannerTask({
          title: 'Verify the fix',
          scope: { directories: ['tests/api/'], filesRead: [], filesWrite: ['tests/api/login.test.ts'] },
          // Raw dependency ref exactly matches the OTHER task's raw (unsanitized) title —
          // this is what a real AI planner emits (it cannot know the sanitized form yet).
          dependencies: [COMMA_TITLE],
        }),
      ],
    };
  }

  it('compiles successfully and canonicalizes the title + dependency ref to the IDENTICAL sanitized string', async () => {
    const proposal = makeProposal({ flowId: 'flow-435-comma-title' });
    const fakePlanner: RunProposalPlanner = () => makeCommaTitlePlan();

    const intent = await compileRunProposalIntent(proposal, fakePlanner);

    expect(intent.tasks).toHaveLength(2);
    // Comma folded to ' - ', never rejected, never left verbatim.
    expect(intent.tasks[0]!.title).toBe('Fix login bug - add regression test');
    expect(intent.tasks[0]!.title).not.toContain(',');
    // The dependency ref (raw, comma-bearing) canonicalizes to the SAME string as
    // the depended-on task's own canonicalized title — the born-692 invariant.
    expect(intent.tasks[1]!.deps).toEqual([intent.tasks[0]!.title]);
  });

  it('round-trips the sanitized title and dependency reference through the REAL DIRECTIVES parser', async () => {
    const proposal = makeProposal({ flowId: 'flow-435-comma-title-roundtrip' });
    const fakePlanner: RunProposalPlanner = () => makeCommaTitlePlan();

    const { directivesMarkdown, intent } = await compileRunProposal(proposal, fakePlanner);

    // The heading and the Dependencies: line both carry the canonicalized title —
    // a stray ',' in either would have fractured directives-builder's own
    // ','-delimited Dependencies line (assertNoDelimiterCollision), so successfully
    // reaching markdown at all is already part of the proof.
    expect(directivesMarkdown).toContain('## Task 1: Fix login bug - add regression test');
    expect(directivesMarkdown).toContain('- Dependencies: Fix login bug - add regression test');

    const parsed = parseStructuredDirectives(directivesMarkdown);
    expect(parsed).toHaveLength(2);

    parsed.forEach((parsedTask, i) => {
      const reconstructed = reconstructBuildTask(parsedTask);
      expect(sortScope(reconstructed)).toEqual(sortScope(intent.tasks[i]!));
    });

    // Explicit, human-legible assertion on top of the deep-equal above: the
    // dependent task's parsed `dependencies` resolves to the EXACT canonical
    // title the first task's parsed `title` carries.
    expect(parsed[1]!.dependencies).toEqual([parsed[0]!.title]);
  });
});
