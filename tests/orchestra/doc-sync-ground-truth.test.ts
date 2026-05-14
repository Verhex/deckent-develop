// Sprint 166 Task 4 (Bug Y2) — Doc-Sync Ground-Truth Verification 3-Layer Defense
//
// Validates the 3-layer defense-in-depth that prevents stale numeric claims
// (e.g. "16 agents" when the codebase ships 15) from leaking into prompts:
//   Layer 1 — plan-time: planner.auditPlanGroundTruth + task-builder.validateGroundTruthClaims
//   Layer 2 — integration: regex-aware verifyDocSyncGroundTruth
//   Layer 3 — runtime: auditor.scanTasksForGroundTruthMismatches → BoundaryViolation
//
// Falsifiable predicate: any (metric, claimed) where claimed !== measured AND
// no active whitelist override applies must produce exactly one violation.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  parseAgentsClaims,
  measureAgentsCount,
  loadGroundTruthOverrides,
  overrideApplies,
  verifyDocSyncGroundTruth,
  scanTasksForGroundTruthMismatches,
  groundTruthMismatchesToViolations,
} from '../../src/monitor/auditor.js';
import { validateGroundTruthClaims } from '../../src/orchestra/task-builder.js';
import { auditPlanGroundTruth } from '../../src/orchestra/planner.js';
import type { PlannerResult } from '../../src/core/types.js';

// ─── Test Harness ──────────────────────────────────────────────────

interface Harness {
  root: string;
  withAgents(count: number): Harness;
  withOverrides(overrides: Array<{ metric: string; expected: number; approvedBy?: string; until_sprint: number; reason?: string }>): Harness;
  withTask(id: string, description: string, title?: string): Harness;
  cleanup(): void;
}

function createHarness(): Harness {
  const root = join(tmpdir(), `gt-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(root, { recursive: true });

  const h: Harness = {
    root,
    withAgents(count: number) {
      const agentsDir = join(root, 'src/core/builtins/agents');
      mkdirSync(agentsDir, { recursive: true });
      for (let i = 0; i < count; i++) {
        mkdirSync(join(agentsDir, `agent-${i}`), { recursive: true });
      }
      return h;
    },
    withOverrides(overrides) {
      const deckent = join(root, '.deckent');
      mkdirSync(deckent, { recursive: true });
      writeFileSync(
        join(deckent, 'ground-truth-overrides.json'),
        JSON.stringify({
          version: '1.0',
          overrides: overrides.map((o) => ({
            metric: o.metric,
            expected: o.expected,
            approvedBy: o.approvedBy ?? 'test',
            until_sprint: o.until_sprint,
            reason: o.reason ?? 'test',
          })),
        }, null, 2),
      );
      return h;
    },
    withTask(id, description, title = 'Test task') {
      const tasksDir = join(root, '.tasks');
      mkdirSync(tasksDir, { recursive: true });
      const task = {
        id,
        title,
        description,
        model: 'sonnet',
        effort: 'normal',
        priority: 'NORMAL',
        reason: 't',
        scope: { directories: [], filesRead: [], filesWrite: [] },
        dependencies: [],
        goNogo: { goCriteria: 'g', noGoCriteria: 'n', techDebtAcceptable: 't' },
        status: 'PENDING',
        sprintId: 'sprint-166',
        createdAt: new Date().toISOString(),
      };
      writeFileSync(join(tasksDir, `task-${id}.json`), JSON.stringify(task, null, 2));
      return h;
    },
    cleanup() {
      if (existsSync(root)) rmSync(root, { recursive: true, force: true });
    },
  };
  return h;
}

// ─── Helpers ───────────────────────────────────────────────────────

describe('parseAgentsClaims (helper)', () => {
  it('extracts every "N agents" / "N agent" occurrence', () => {
    const claims = parseAgentsClaims('We have 16 agents and 15 built-in agents and 1 agent');
    expect(claims.length).toBe(3);
    expect(claims.map((c) => c.claimed).sort()).toEqual([1, 15, 16]);
    for (const c of claims) expect(c.metric).toBe('agents_count');
  });

  it('returns no claims when text has no agent count', () => {
    expect(parseAgentsClaims('No relevant numbers here.')).toEqual([]);
  });

  it('does not partial-match digits embedded in larger numbers', () => {
    // "1160 agents" should NOT match: regex caps at 3 digits and \b prevents
    // partial capture of the trailing "60 agents". Counts above 999 are
    // outside the realistic agent-count range and intentionally ignored.
    const claims = parseAgentsClaims('We benchmarked 1160 agents in production');
    expect(claims.length).toBe(0);
  });
});

describe('measureAgentsCount (filesystem source of truth)', () => {
  let h: Harness;
  afterEach(() => h?.cleanup());

  it('counts directory children under src/core/builtins/agents/', () => {
    h = createHarness().withAgents(15);
    expect(measureAgentsCount(h.root)).toBe(15);
  });

  it('returns -1 when the agents directory does not exist', () => {
    h = createHarness();
    expect(measureAgentsCount(h.root)).toBe(-1);
  });
});

describe('loadGroundTruthOverrides + overrideApplies', () => {
  let h: Harness;
  afterEach(() => h?.cleanup());

  it('returns empty list when the overrides file is missing', () => {
    h = createHarness();
    expect(loadGroundTruthOverrides(h.root)).toEqual([]);
  });

  it('loads valid overrides from .deckent/ground-truth-overrides.json', () => {
    h = createHarness().withOverrides([
      { metric: 'agents_count', expected: 15, until_sprint: 170 },
    ]);
    const o = loadGroundTruthOverrides(h.root);
    expect(o.length).toBe(1);
    expect(o[0]!.expected).toBe(15);
  });

  it('overrideApplies respects metric, value, and sprint window', () => {
    const overrides = [
      { metric: 'agents_count', expected: 15, approvedBy: 'a', until_sprint: 170, reason: '' },
    ];
    expect(overrideApplies(overrides, 'agents_count', 15, 'sprint-166')).toBe(true);
    expect(overrideApplies(overrides, 'agents_count', 16, 'sprint-166')).toBe(false);
    expect(overrideApplies(overrides, 'agents_count', 15, 'sprint-170')).toBe(false);
    expect(overrideApplies(overrides, 'other_metric', 15, 'sprint-166')).toBe(false);
  });
});

// ─── Layer 2 / Layer 3: verifyDocSyncGroundTruth + scanTasks... ────

describe('verifyDocSyncGroundTruth (runtime mismatch detection)', () => {
  let h: Harness;
  afterEach(() => h?.cleanup());

  it('TEST 1 — flags mismatch when claim 16 != measured 15 and no override exists', () => {
    h = createHarness().withAgents(15);
    const issues = verifyDocSyncGroundTruth(
      h.root,
      { id: 't1', title: 'Coordinator', description: 'Pick from 16 agents in pool' },
      'sprint-166',
    );
    expect(issues.length).toBe(1);
    expect(issues[0]!.claimed).toBe(16);
    expect(issues[0]!.measured).toBe(15);
    expect(issues[0]!.metric).toBe('agents_count');
  });

  it('TEST 2 — active whitelist override suppresses mismatch', () => {
    h = createHarness()
      .withAgents(15)
      .withOverrides([
        { metric: 'agents_count', expected: 15, until_sprint: 170 },
      ]);
    // Claim of 15 matches measured 15 — but to prove override path, claim != measured
    // would normally fire. Re-test: claim 15, override expected 15, measured 15 → no issue.
    const a = verifyDocSyncGroundTruth(
      h.root,
      { id: 't2', title: 'Doc', description: 'We have 15 agents' },
      'sprint-166',
    );
    expect(a.length).toBe(0);

    // And with an override that whitelists 16 even though measured is 15:
    h.cleanup();
    h = createHarness()
      .withAgents(15)
      .withOverrides([
        { metric: 'agents_count', expected: 16, until_sprint: 170 },
      ]);
    const b = verifyDocSyncGroundTruth(
      h.root,
      { id: 't2b', title: 'Doc', description: 'We have 16 agents' },
      'sprint-166',
    );
    expect(b.length).toBe(0);
  });

  it('TEST 3 — no claim in task description yields no false positive', () => {
    h = createHarness().withAgents(15);
    const issues = verifyDocSyncGroundTruth(
      h.root,
      { id: 't3', title: 'Refactor', description: 'Refactor the dispatcher module without touching counts' },
      'sprint-166',
    );
    expect(issues.length).toBe(0);
  });

  it('zero-tolerance: threshold is 1 (any single mismatch produces a violation)', () => {
    h = createHarness().withAgents(15);
    const issues = verifyDocSyncGroundTruth(
      h.root,
      { id: 't', title: 'x', description: 'One mention of 16 agents only' },
      'sprint-166',
    );
    const violations = groundTruthMismatchesToViolations('t', issues);
    expect(violations.length).toBe(1);
    expect(violations[0]!.type).toBe('doc_sync_ground_truth_mismatch');
  });

  it('scanTasksForGroundTruthMismatches integrates with .tasks/ directory', () => {
    h = createHarness()
      .withAgents(15)
      .withTask('001', 'Coordinator agent dispatch across 16 agents in pool');
    const violations = scanTasksForGroundTruthMismatches(h.root, 'sprint-166');
    expect(violations.length).toBeGreaterThanOrEqual(1);
    expect(violations[0]!.type).toBe('doc_sync_ground_truth_mismatch');
  });

  it('scan returns empty when ground truth not measurable (no agents dir)', () => {
    h = createHarness().withTask('001', 'mentions 16 agents');
    const violations = scanTasksForGroundTruthMismatches(h.root, 'sprint-166');
    expect(violations.length).toBe(0);
  });
});

// ─── Layer 1: Plan-time validators ────────────────────────────────

describe('validateGroundTruthClaims (task-builder, plan-time)', () => {
  let h: Harness;
  afterEach(() => h?.cleanup());

  it('detects mismatches in directive descriptions before worker spawn', () => {
    h = createHarness().withAgents(15);
    const issues = validateGroundTruthClaims(
      h.root,
      'Build coordinator across 16 agents',
      'sprint-166',
    );
    expect(issues.length).toBe(1);
    expect(issues[0]!.measured).toBe(15);
  });

  it('respects whitelist overrides', () => {
    h = createHarness()
      .withAgents(15)
      .withOverrides([{ metric: 'agents_count', expected: 16, until_sprint: 170 }]);
    const issues = validateGroundTruthClaims(
      h.root,
      'Legacy reference to 16 agents kept until sprint 170',
      'sprint-166',
    );
    expect(issues).toEqual([]);
  });
});

describe('auditPlanGroundTruth (planner, plan-time)', () => {
  let h: Harness;
  afterEach(() => h?.cleanup());

  it('audits every task in a planner result and reports stale numeric claims', () => {
    h = createHarness().withAgents(15);
    const plan: PlannerResult = {
      tasks: [
        {
          title: 'Bad',
          description: 'Spawn 16 agents from coordinator',
          model: 'sonnet',
          effort: 'normal',
          priority: 'NORMAL',
          reason: 'r',
          scope: { directories: [], filesRead: [], filesWrite: [] },
          dependencies: [],
          goNogo: { goCriteria: 'g', noGoCriteria: 'n', techDebtAcceptable: 't' },
        },
        {
          title: 'Good',
          description: 'Touch 15 agents in pool',
          model: 'sonnet',
          effort: 'normal',
          priority: 'NORMAL',
          reason: 'r',
          scope: { directories: [], filesRead: [], filesWrite: [] },
          dependencies: [],
          goNogo: { goCriteria: 'g', noGoCriteria: 'n', techDebtAcceptable: 't' },
        },
      ],
      reasoning: 'test',
    };
    const issues = auditPlanGroundTruth(h.root, plan, 'sprint-166');
    expect(issues.length).toBe(1);
    expect(issues[0]!.taskIndex).toBe(0);
    expect(issues[0]!.claimed).toBe(16);
    expect(issues[0]!.measured).toBe(15);
  });
});
