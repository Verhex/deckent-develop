// ═══ run-proposal-compiler — baseline public-API contract ══════════════════
//
// The compiler's specialized invariants already have dedicated coverage:
//   - run-proposal-planner.test.ts: the injectable planner seam, planner-failure
//     typing, production-default wiring, model resolution.
//   - run-proposal-compiler-sanitization.test.ts: the two compiler-owned
//     boundary invariants toDirectiveTask enforces (empty filesWrite, comma-title
//     canonicalization).
//   - run-proposal-compiler-delimiters.test.ts: goal-flow delimiter safety
//     (born-677 goal-flow slice, 452-004).
//
// This file is the small baseline smoke suite for the public API itself — a
// clean, delimiter-free, single-task compile, proving the plumbing produces a
// well-formed DirectiveBuildIntent and DIRECTIVES markdown end to end.

import { describe, it, expect } from 'vitest';
import { compileRunProposal, compileRunProposalIntent, type RunProposalPlanner } from '../../src/orchestra/run-proposal-compiler.js';
import { parseStructuredDirectives } from '../../src/orchestra/task-builder.js';
import type { RunProposal } from '../../src/core/run-flow-contract.js';
import type { PlannerTask } from '../../src/core/types.js';

function makeProposal(overrides: Partial<RunProposal> = {}): RunProposal {
  return {
    flowId: 'flow-baseline-1',
    tenant: 'local',
    project: 'deckent',
    actor: { id: 'native-agent', role: 'operator' },
    origin: 'chat',
    revision: 1,
    intentSummary: 'Ship the CSV export feature end to end',
    ...overrides,
  };
}

function makePlannerTask(overrides: Partial<PlannerTask> = {}): PlannerTask {
  return {
    title: 'Backend export endpoint',
    description: 'Add a POST /export/csv handler.',
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'Single-module CRUD change, follows existing route pattern.',
    scope: { directories: ['src/api/'], filesRead: ['src/api/router.ts'], filesWrite: ['src/api/export.ts'] },
    dependencies: [],
    goNogo: {
      goCriteria: 'POST /export/csv returns 200 with the correct content-type.',
      noGoCriteria: 'The endpoint 500s or returns the wrong content-type.',
      techDebtAcceptable: '',
    },
    ...overrides,
  };
}

describe('compileRunProposalIntent/compileRunProposal — baseline contract', () => {
  it('compiles a clean single-task proposal into a well-formed DirectiveBuildIntent', async () => {
    const proposal = makeProposal();
    const fakePlanner: RunProposalPlanner = () => ({ reasoning: 'r', tasks: [makePlannerTask()] });

    const intent = await compileRunProposalIntent(proposal, fakePlanner);

    expect(intent.title).toBe(`RunProposal ${proposal.flowId}`);
    expect(intent.goal).toBe(proposal.intentSummary);
    expect(intent.tasks).toHaveLength(1);
    expect(intent.tasks[0]!.title).toBe('Backend export endpoint');
    expect(intent.tasks[0]!.files).toEqual(['src/api/export.ts']);
  });

  it('compiles straight to DIRECTIVES markdown that the real parser reads back correctly', async () => {
    const proposal = makeProposal();
    const fakePlanner: RunProposalPlanner = () => ({ reasoning: 'r', tasks: [makePlannerTask()] });

    const { directivesMarkdown } = await compileRunProposal(proposal, fakePlanner);

    expect(directivesMarkdown).toContain(`# DIRECTIVES — RunProposal ${proposal.flowId}`);
    expect(directivesMarkdown).toContain('## Goal');
    expect(directivesMarkdown).toContain(proposal.intentSummary);
    expect(directivesMarkdown).toContain('## Task 1: Backend export endpoint');

    const parsed = parseStructuredDirectives(directivesMarkdown);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]!.title).toBe('Backend export endpoint');
    expect(parsed[0]!.scope.filesWrite).toEqual(['src/api/export.ts']);
  });
});
