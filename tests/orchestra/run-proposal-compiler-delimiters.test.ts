// ═══ run-proposal-compiler — goal-flow delimiter safety (452-004, born-677) ═══
//
// born-677 (.analysis/born-backlog.json born_id 677, resolved sprint-429/429-003): a raw NL
// goal containing ';' hard-errored because the OLD TODO-scaffold compiler embedded the goal
// verbatim into a task's goCriteria string, and directives-builder.ts's
// assertNoDelimiterCollision rejected any ';'-bearing item. That was fixed with a reversible
// backslash-escape scoped to goCriteria/nogo items.
//
// Since then the TODO-scaffold died (born-678) and `compileRunProposalIntent` gained a NEW
// embedding point that did not exist when born-677 was first fixed:
// `intent.goal = proposal.intentSummary.trim()` (the `## Goal` section of the compiled
// markdown). This suite proves the same delimiter corpus born-677 named — ';', '"', '`',
// newline, '&&', and a mixed combination — flows through THIS embedding point end to end
// (goal -> compileRunProposal -> directivesMarkdown) without a hard-error, and round-trips
// byte-for-byte verbatim (never escaped-looking, never stripped/lossy).
//
// It also proves the one real throw-path the added `escapeGoalHeadingCollisions` guard closes
// (a goal that quotes a "## Task N:"-style line, which is the sole condition
// directives-builder's assertNoHeadingCollision applies to `intent.goal`) — otherwise the
// guard would be untested dead code.

import { describe, it, expect } from 'vitest';
import {
  compileRunProposal,
  compileRunProposalIntent,
  type RunProposalPlanner,
} from '../../src/orchestra/run-proposal-compiler.js';
import type { RunProposal } from '../../src/core/run-flow-contract.js';
import type { PlannerResult, PlannerTask } from '../../src/core/types.js';

// ─── Fixtures (mirrors the sibling run-proposal-*.test.ts files' convention) ──

function makeProposal(overrides: Partial<RunProposal> = {}): RunProposal {
  return {
    flowId: 'flow-452-004',
    tenant: 'local',
    project: 'deckent',
    actor: { id: 'native-agent', role: 'operator' },
    origin: 'chat',
    revision: 1,
    intentSummary: 'placeholder goal',
    ...overrides,
  };
}

function makePlannerTask(overrides: Partial<PlannerTask> = {}): PlannerTask {
  return {
    title: 'Delimiter-safe goal fixture task',
    description: 'Fixture task — the goal-delimiter corpus lives in intentSummary, not here.',
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'Fixture task for the goal-flow delimiter-safety suite.',
    scope: { directories: ['src/orchestra/'], filesRead: [], filesWrite: ['src/orchestra/run-proposal-compiler.ts'] },
    dependencies: [],
    goNogo: { goCriteria: 'g', noGoCriteria: 'n', techDebtAcceptable: '' },
    ...overrides,
  };
}

function makeFakePlanner(overrides: Partial<PlannerTask> = {}): RunProposalPlanner {
  return () => ({ reasoning: 'single fixture task', tasks: [makePlannerTask(overrides)] });
}

// ─── born-677 named delimiter corpus (goal text, not task fields) ──────────────

const CORPUS: Record<string, string> = {
  semicolon: 'Ship the loud-log feature; add the missing eklensin step; verify it',
  doubleQuote: 'Ship the "loud-log" feature exactly as described',
  backtick: 'Run `npm test` before shipping the loud-log feature',
  newline: 'Ship the loud-log feature\nthen add the missing eklensin step',
  ampAmp: 'Build && deploy the loud-log feature',
  mixed: 'Ship "loud-log"; run `npm test && npm run build`\nthen ship it',
};

describe('compileRunProposalIntent/compileRunProposal — goal-flow delimiter safety (born-677)', () => {
  for (const [name, goal] of Object.entries(CORPUS)) {
    it(`does not throw for a "${name}" goal and intent.goal round-trips it verbatim`, async () => {
      const proposal = makeProposal({ intentSummary: goal });
      const fakePlanner = makeFakePlanner();

      const intent = await compileRunProposalIntent(proposal, fakePlanner);

      expect(intent.goal).toBe(goal);
    });

    it(`does not throw for a "${name}" goal and directivesMarkdown contains it verbatim`, async () => {
      const proposal = makeProposal({ intentSummary: goal });
      const fakePlanner = makeFakePlanner();

      const { directivesMarkdown, intent } = await compileRunProposal(proposal, fakePlanner);

      expect(intent.goal).toBe(goal);
      expect(directivesMarkdown).toContain(goal);
      expect(directivesMarkdown).toContain('## Goal');
    });
  }

  it('a delimiter-free goal is completely unaffected (byte-for-byte, no regression)', async () => {
    const proposal = makeProposal({ intentSummary: 'Ship the CSV export feature end to end' });
    const fakePlanner = makeFakePlanner();

    const intent = await compileRunProposalIntent(proposal, fakePlanner);
    expect(intent.goal).toBe(proposal.intentSummary);

    const { directivesMarkdown } = await compileRunProposal(proposal, fakePlanner);
    expect(directivesMarkdown).toContain(proposal.intentSummary);
  });

  it('trims surrounding whitespace exactly like the pre-existing (non-corpus) behavior', async () => {
    const proposal = makeProposal({ intentSummary: '  Ship feature A; then feature B  ' });
    const fakePlanner = makeFakePlanner();

    const intent = await compileRunProposalIntent(proposal, fakePlanner);
    expect(intent.goal).toBe('Ship feature A; then feature B');
  });

  // ─── The one real throw-path the added guard closes (not itself part of the named
  //     corpus, but the exact condition escapeGoalHeadingCollisions exists for — proves
  //     the guard is not untested dead code) ──────────────────────────────────────────

  it('a goal quoting a "## Task N:"-style line no longer hard-errors (assertNoHeadingCollision guard)', async () => {
    const goal = 'Please reorganize it like:\n## Task 2: implement the caching layer\nthanks';
    const proposal = makeProposal({ intentSummary: goal });
    const fakePlanner = makeFakePlanner();

    const { directivesMarkdown } = await compileRunProposal(proposal, fakePlanner);
    // The visible text still reads exactly like the original heading line — the escape
    // (a zero-width space) is invisible — even though the raw bytes now differ from the
    // literal "## Task 2:" pattern that would otherwise collide.
    expect(directivesMarkdown).toContain('Task 2: implement the caching layer');
  });

  it('a goal quoting a "### goNogo"-style line no longer hard-errors (assertNoHeadingCollision guard)', async () => {
    const goal = 'The doc should end with:\n### goNogo\n- goCriteria: done\nplease match that format';
    const proposal = makeProposal({ intentSummary: goal });
    const fakePlanner = makeFakePlanner();

    const { directivesMarkdown } = await compileRunProposal(proposal, fakePlanner);
    expect(directivesMarkdown).toContain('goNogo');
  });
});
