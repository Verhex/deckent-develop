// tests/core/routing-decision-journal.test.ts
// ROUTING-DECISION-JOURNAL (born-622, Sprint 402 Task 402-003) — proves
// selectBestAgent's per-candidate signal breakdown is persisted to
// `.deckent/routing/decisions/sprint-<id>.jsonl` at the decision moment
// (real selectBestAgent run, agent-selection-cache hit, and fail-soft when
// the journal directory cannot be created).
//
// RED-kanit: before this task, routeTaskV2 NEVER wrote anything under
// `.deckent/routing/decisions/` — selectBestAgent's scoring was computed and
// then discarded (only free-text `reasoning` strings survived). This file's
// first test ("real selectBestAgent run") is the RED->GREEN pin: it would
// have failed (no directory ever created) on the pre-fix code.

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  routeTaskV2,
  routingDecisionJournalPath,
  agentSelectionCache,
  type RoutingDecisionRecord,
} from '../../src/core/routing-engine.js';
import type { AgentDefinition, AgentPool } from '../../src/core/agent-types.js';
import { createAgentDefinition } from '../../src/core/agent-types.js';
import type { SkillDefinition } from '../../src/core/skill-types.js';
import type { ActivationConfig } from '../../src/core/routing-types.js';

// ─── Test Helpers ───────────────────────────────────────────────────────────

function makeAgent(id: string, overrides?: Partial<AgentDefinition> & { activation?: ActivationConfig }): AgentDefinition {
  const base = createAgentDefinition({ id, name: id });
  return { ...base, ...overrides } as AgentDefinition;
}

function makePool(...agents: AgentDefinition[]): AgentPool {
  return new Map(agents.map(a => [a.id, a]));
}

function makeSkillPool(): Map<string, SkillDefinition> {
  return new Map();
}

const dirs: string[] = [];
afterEach(() => {
  agentSelectionCache.clear();
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function makeProjectRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'routing-decision-'));
  dirs.push(root);
  return root;
}

function readDecisionLines(root: string, sprintId: string): RoutingDecisionRecord[] {
  const file = routingDecisionJournalPath(root, sprintId);
  return readFileSync(file, 'utf-8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as RoutingDecisionRecord);
}

const securityAgent = () => makeAgent('security-auditor', {
  activation: {
    rules: [{ when: { 'intent.primary': 'security' }, score: 10 }],
    exclude: [],
    minScore: 5,
  },
});

const testTask = {
  title: 'Security audit for auth',
  description: 'Check JWT vulnerabilities and XSS',
  scope: { directories: ['src/auth/'], filesRead: [], filesWrite: ['src/auth/jwt.ts'] },
};

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('ROUTING-DECISION-JOURNAL (born-622)', () => {
  it('real selectBestAgent run: writes one jsonl line with full schema (candidates+signals+winner+reason)', () => {
    const root = makeProjectRoot();

    const decision = routeTaskV2(
      testTask,
      makePool(securityAgent()),
      makeSkillPool(),
      { sprintId: 'sprint-402', taskId: '402-003', projectRoot: root },
    );

    expect(decision.agentId).toBe('security-auditor');

    const file = routingDecisionJournalPath(root, 'sprint-402');
    expect(existsSync(file)).toBe(true);

    const records = readDecisionLines(root, 'sprint-402');
    expect(records).toHaveLength(1);
    const record = records[0]!;

    // Required schema fields (goCriteria: "semada candidates+signals+winner+reason zorunlu")
    expect(record.taskId).toBe('402-003');
    expect(record.sprintId).toBe('sprint-402');
    expect(typeof record.ts).toBe('string');
    expect(record.winner).toBe('security-auditor');
    expect(typeof record.reason).toBe('string');
    expect(record.reason.length).toBeGreaterThan(0);
    expect(record.cached).toBe(false);
    expect(Array.isArray(record.candidates)).toBe(true);
    expect(record.candidates.length).toBeGreaterThan(0);

    const winnerCandidate = record.candidates.find((c) => c.agentId === 'security-auditor');
    expect(winnerCandidate).toBeDefined();
    expect(typeof winnerCandidate!.totalScore).toBe('number');
    expect(typeof winnerCandidate!.signals).toBe('object');
    expect(winnerCandidate!.signals).toHaveProperty('activation');
    expect(typeof winnerCandidate!.bypass).toBe('boolean');
  });

  it('candidates include below-threshold agents too (auditable "why did X lose")', () => {
    const root = makeProjectRoot();
    // design-agent's rule never matches this task's intent -> excluded, never scored.
    // A second security-flavored agent with a lower score than security-auditor
    // should still appear in candidates even though it does not win.
    const weakerSecurityAgent = makeAgent('weak-security-agent', {
      activation: {
        rules: [{ when: { 'intent.primary': 'security' }, score: 1 }],
        exclude: [],
        minScore: 0,
      },
    });

    routeTaskV2(
      testTask,
      makePool(securityAgent(), weakerSecurityAgent),
      makeSkillPool(),
      { sprintId: 'sprint-402', taskId: '402-004', projectRoot: root },
    );

    const records = readDecisionLines(root, 'sprint-402');
    const ids = records[0]!.candidates.map((c) => c.agentId);
    expect(ids).toContain('security-auditor');
    expect(ids).toContain('weak-security-agent');
  });

  it('agent-selection-cache hit: records a second decision line with cached=true (no invisible decisions)', () => {
    const root = makeProjectRoot();
    const pool = makePool(securityAgent());
    const options = { sprintId: 'sprint-402', taskId: '402-005', projectRoot: root, agentCache: true };

    const first = routeTaskV2(testTask, pool, makeSkillPool(), options);
    const second = routeTaskV2(testTask, pool, makeSkillPool(), { ...options, taskId: '402-006' });

    expect(first.agentId).toBe('security-auditor');
    expect(second.agentId).toBe('security-auditor');

    const records = readDecisionLines(root, 'sprint-402');
    expect(records).toHaveLength(2);
    expect(records[0]!.cached).toBe(false);
    expect(records[1]!.cached).toBe(true);
    expect(records[1]!.winner).toBe('security-auditor');
    expect(records[1]!.taskId).toBe('402-006');
  });

  it('scores are NOT recomputed for the journal — decision.agentScore matches the winning candidate totalScore', () => {
    const root = makeProjectRoot();

    const decision = routeTaskV2(
      testTask,
      makePool(securityAgent()),
      makeSkillPool(),
      { sprintId: 'sprint-402', taskId: '402-007', projectRoot: root },
    );

    const records = readDecisionLines(root, 'sprint-402');
    const winnerCandidate = records[0]!.candidates.find((c) => c.agentId === decision.agentId);
    expect(winnerCandidate!.totalScore).toBe(decision.agentScore);
  });

  it('fail-soft: an unwritable decisions path never breaks routing (ADR-G-009)', () => {
    const root = makeProjectRoot();
    // Create a FILE at the path where the decisions directory needs to be —
    // mkdirSync(..., {recursive:true}) will throw ENOTDIR, exercised by the
    // fail-soft try/catch in appendRoutingDecisionRecord.
    mkdirSync(join(root, '.deckent', 'routing'), { recursive: true });
    writeFileSync(join(root, '.deckent', 'routing', 'decisions'), 'not a directory', 'utf-8');

    expect(() => routeTaskV2(
      testTask,
      makePool(securityAgent()),
      makeSkillPool(),
      { sprintId: 'sprint-402', taskId: '402-008', projectRoot: root },
    )).not.toThrow();

    const decision = routeTaskV2(
      testTask,
      makePool(securityAgent()),
      makeSkillPool(),
      { sprintId: 'sprint-402', taskId: '402-009', projectRoot: root },
    );
    expect(decision.agentId).toBe('security-auditor');
  });

  it('missing decision-trail context (no sprintId/taskId/projectRoot): no file written, no throw', () => {
    const decision = routeTaskV2(testTask, makePool(securityAgent()), makeSkillPool());
    expect(decision.agentId).toBe('security-auditor');
    // No projectRoot supplied -> nothing to assert on disk; the absence of a
    // throw plus the correct decision is the whole contract here.
  });
});
