// born-594 — TESTING-INTENT: test-dominant tasks get testing ownership + classification.
//
// Audit root-cause #3 (sprint-agent-skill-prompt-audit-2026-07-10.md §0/A1/E-P1#8):
// a task whose write scope is majority test-file writes, with a test-fix-flavored
// title/description, classifies as `implementation` intent (Sprint 148 retired the
// standalone 'testing' IntentType). ci-guardian's manifest EXCLUDES
// intent.primary==='implementation' outright; bug-fixer's sole rule
// (intent.primary==='bugfix') never fires for 'implementation' — so forcing either
// agent onto a test-sweep task tripped an overrideWarning every time (9/9 in
// sprint-391). This suite pins the routing-engine-only fix: a test-dominant signal
// (routing-engine.ts's `isTestDominantTask`) grants ci-guardian/bug-fixer an
// ownership bonus, WITHOUT adding a 'testing' member to the shared IntentType union
// (routing-types.ts is out of this task's single-writer scope) and WITHOUT touching
// any agent manifest (that vocabulary work is born-601's).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  routeTaskV2,
  isTestDominantTask,
  getTestOwnershipBonus,
  TEST_OWNERSHIP_AGENTS,
  TEST_OWNERSHIP_BONUS,
} from '../../src/core/routing-engine.js';
import type { AgentDefinition, AgentPool } from '../../src/core/agent-types.js';
import { createAgentDefinition } from '../../src/core/agent-types.js';
import type { ActivationConfig, IntentType } from '../../src/core/routing-types.js';
import { createDefaultTaskDNA } from '../../src/core/routing-types.js';
import type { SkillDefinition } from '../../src/core/skill-types.js';
import { OutcomeTracker, type RoutingOutcome } from '../../src/orchestra/outcome-tracker.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeAgent(id: string, activation: ActivationConfig): AgentDefinition {
  return createAgentDefinition({ id, name: id, activation });
}

function makePool(...agents: AgentDefinition[]): AgentPool {
  return new Map(agents.map(a => [a.id, a]));
}

function makeSkillPool(): Map<string, SkillDefinition> {
  return new Map();
}

/** Real manifest shapes (.deckent/agents/ci-guardian, bug-fixer, refactorer) — kept
 *  in sync by hand since this task must not read/edit the manifest files themselves
 *  (born-601's job). */
function buildCiGuardian(): AgentDefinition {
  return makeAgent('ci-guardian', {
    rules: [{ when: { 'intent.primary': 'devops' }, score: 10 }],
    exclude: [{ when: { 'intent.primary': 'implementation' }, reason: 'Not for impl' }],
    minScore: 5,
  });
}

function buildBugFixer(): AgentDefinition {
  return makeAgent('bug-fixer', {
    rules: [{ when: { 'intent.primary': 'bugfix' }, score: 10 }],
    exclude: [],
    minScore: 5,
  });
}

function buildRefactorer(): AgentDefinition {
  return makeAgent('refactorer', {
    rules: [
      { when: { 'intent.primary': 'refactor' }, score: 10 },
      { when: { 'intent.primary': 'implementation' }, score: 7 },
    ],
    exclude: [],
    minScore: 5,
  });
}

/** Sprint-391-style test-sweep fixture: 50/50 src+tests write ratio (matches the
 *  routingMeta.taskDNA.scope.testWriteRatio=0.5 this very task (395-004) itself
 *  shipped with), title/description carries the "test" + "fix"/"flaky" pattern. */
const testSweepTask = {
  title: 'Sprint-391-style test sweep: fix flaky routing tests',
  description: 'Fix a flaky test suite regression in the routing test sweep; add a regression test.',
  scope: {
    directories: ['src/core/', 'tests/core/'],
    filesRead: [],
    filesWrite: ['src/core/routing-engine.ts', 'tests/core/routing-engine.test.ts'],
  },
};

/** A plain implementation task with no test-dominant signal — regression guard. */
const plainImplTask = {
  title: 'Implement feature',
  description: 'Add a new CLI command to display project status',
  scope: {
    directories: ['src/cli/'],
    filesRead: [],
    filesWrite: ['src/cli/cmd.ts'],
  },
};

// ─── isTestDominantTask (unit) ──────────────────────────────────────────────

describe('isTestDominantTask', () => {
  it('true: majority test-file writes + test-fix text pattern', () => {
    const dna = { ...createDefaultTaskDNA(), scope: { writeRatio: {}, primaryWriteTarget: '', testWriteRatio: 0.5 } };
    expect(isTestDominantTask(dna, 'Fix flaky test suite regression')).toBe(true);
  });

  it('false: majority test-file writes but no fix-verb text (plain test-authoring task)', () => {
    const dna = { ...createDefaultTaskDNA(), scope: { writeRatio: {}, primaryWriteTarget: '', testWriteRatio: 1 } };
    expect(isTestDominantTask(dna, 'Write unit tests for auth module')).toBe(false);
  });

  it('false: fix-flavored text but minority test-file writes (a real src/ bugfix)', () => {
    const dna = { ...createDefaultTaskDNA(), scope: { writeRatio: {}, primaryWriteTarget: '', testWriteRatio: 0 } };
    expect(isTestDominantTask(dna, 'Fix regression in payment flow')).toBe(false);
  });
});

describe('getTestOwnershipBonus', () => {
  it('grants TEST_OWNERSHIP_BONUS to ci-guardian/bug-fixer only, and only when test-dominant', () => {
    expect(TEST_OWNERSHIP_AGENTS.has('ci-guardian')).toBe(true);
    expect(TEST_OWNERSHIP_AGENTS.has('bug-fixer')).toBe(true);
    expect(getTestOwnershipBonus('ci-guardian', true)).toBe(TEST_OWNERSHIP_BONUS);
    expect(getTestOwnershipBonus('bug-fixer', true)).toBe(TEST_OWNERSHIP_BONUS);
    expect(getTestOwnershipBonus('ci-guardian', false)).toBe(0);
    expect(getTestOwnershipBonus('refactorer', true)).toBe(0);
  });
});

// ─── routeTaskV2 — reasoning surfaces the signal ────────────────────────────

describe('routeTaskV2 — test-dominant reasoning (born-594)', () => {
  it('surfaces the test-dominant signal with an intent=testing label for the fixture', () => {
    const decision = routeTaskV2(testSweepTask, makePool(buildRefactorer()), makeSkillPool());
    expect(decision.taskDNA.intent.primary).toBe('implementation');
    expect(decision.reasoning.some(r => r.includes("intent='testing'"))).toBe(true);
  });

  it('reports false for a non-test-dominant task', () => {
    const decision = routeTaskV2(plainImplTask, makePool(buildRefactorer()), makeSkillPool());
    expect(decision.reasoning.some(r => r.includes('Test-dominant signal (born-594): false'))).toBe(true);
  });
});

// ─── forceAgent path — no overrideWarnings for the live owners ─────────────

describe('routeTaskV2 — ci-guardian/bug-fixer ownership (forceAgent path)', () => {
  it('forceAgent=ci-guardian on a test-sweep task: no overrideWarnings (was: excluded by own rules)', () => {
    const decision = routeTaskV2(
      testSweepTask,
      makePool(buildCiGuardian(), buildBugFixer(), buildRefactorer()),
      makeSkillPool(),
      { overrides: [{ source: 'task-directive', forceAgent: 'ci-guardian', priority: 3 }] },
    );
    expect(decision.agentId).toBe('ci-guardian');
    expect(decision.overrideWarnings ?? []).toEqual([]);
  });

  it('forceAgent=bug-fixer on a test-sweep task: no overrideWarnings (was: score=0 < threshold)', () => {
    const decision = routeTaskV2(
      testSweepTask,
      makePool(buildCiGuardian(), buildBugFixer(), buildRefactorer()),
      makeSkillPool(),
      { overrides: [{ source: 'task-directive', forceAgent: 'bug-fixer', priority: 3 }] },
    );
    expect(decision.agentId).toBe('bug-fixer');
    expect(decision.overrideWarnings ?? []).toEqual([]);
  });

  it('regression guard: forceAgent=ci-guardian on a plain (non-test-dominant) impl task still warns', () => {
    const decision = routeTaskV2(
      plainImplTask,
      makePool(buildCiGuardian()),
      makeSkillPool(),
      { overrides: [{ source: 'task-directive', forceAgent: 'ci-guardian', priority: 3 }] },
    );
    expect(decision.overrideWarnings?.length ?? 0).toBeGreaterThan(0);
    expect(decision.overrideWarnings?.some(w => w.includes('excluded by its own activation rules'))).toBe(true);
  });
});

// ─── Unforced routing — ci-guardian/bug-fixer are live owners, not just bypassed ──

describe('routeTaskV2 — ci-guardian/bug-fixer selectable without forcing (unforced path)', () => {
  it('a test-sweep task naturally routes to ci-guardian or bug-fixer over generic refactorer', () => {
    const decision = routeTaskV2(
      testSweepTask,
      makePool(buildCiGuardian(), buildBugFixer(), buildRefactorer()),
      makeSkillPool(),
    );
    expect(['ci-guardian', 'bug-fixer']).toContain(decision.agentId);
  });

  it('regression guard: a plain (non-test-dominant) implementation task still routes to refactorer', () => {
    const decision = routeTaskV2(
      plainImplTask,
      makePool(buildCiGuardian(), buildBugFixer(), buildRefactorer()),
      makeSkillPool(),
    );
    expect(decision.agentId).toBe('refactorer');
  });
});

// ─── outcome-tracker — unseen intent-key tolerance (advisor-note pin) ──────
//
// Advisor-note: stats accumulated under the old wrong intent stay dormant, and
// 'testing'-keyed learning starts cold — no backfill (that's an accepted, noted
// gap, not this task's job). What IS this task's job: pin that
// `updateEntityPerformance` (private, exercised via the public `recordOutcome`)
// tolerates a not-yet-seen intent key at runtime without throwing, so a future
// vocabulary change (born-601) can start writing 'testing'-keyed stats safely.

describe('OutcomeTracker — tolerates a previously-unseen intent key (born-594 advisor-note)', () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), 'outcome-testing-intent-'));
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it('recordOutcome does not throw and records byIntent stats for an unforeseen intent string', () => {
    const tracker = new OutcomeTracker(projectRoot);

    // 'testing' is not a member of the IntentType union (Sprint 148 retired it) —
    // this cast simulates a future/foreign runtime value flowing through
    // updateEntityPerformance's `byIntent[intent]` object-key access, which is not
    // constrained by the compile-time union. Pinning tolerance, not endorsing the
    // cast as a routing-engine output.
    const foreignIntent = 'testing' as unknown as IntentType;
    const taskDNA = { ...createDefaultTaskDNA(), intent: { primary: foreignIntent, secondary: [], confidence: 0.9 } };

    const outcome: RoutingOutcome = {
      taskId: 'fixture-395-004',
      sprintId: 'sprint-fixture-395',
      taskDNA,
      agentId: 'ci-guardian',
      skillIds: ['testing-expert'],
      evaluation: 'DONE',
      coverage: 1,
      routingVersion: 'v2',
    };

    expect(() => tracker.recordOutcome(outcome)).not.toThrow();

    const perf = tracker.getLearnings().agentPerformance['ci-guardian'];
    expect(perf?.byIntent['testing']).toEqual({ tasks: 1, successRate: 1 });
  });
});
