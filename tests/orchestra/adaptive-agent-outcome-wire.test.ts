import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { OutcomeTracker, type RoutingOutcome } from '../../src/orchestra/outcome-tracker.js';
import { createDefaultTaskDNA } from '../../src/core/routing-types.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeOutcome(overrides: Partial<RoutingOutcome> = {}): RoutingOutcome {
  const dna = createDefaultTaskDNA();
  dna.intent.primary = 'implementation';
  return {
    taskId: 'wire-task',
    sprintId: 'sprint-001',
    taskDNA: dna,
    agentId: 'wire-agent',
    skillIds: ['typescript-expert'],
    evaluation: 'DONE',
    coverage: 90,
    routingVersion: 'v2',
    ...overrides,
  };
}

function readSprintOutcomes(root: string, sprintId: string): RoutingOutcome[] {
  const filePath = join(root, '.deckent/routing/outcomes', `${sprintId}.json`);
  if (!existsSync(filePath)) return [];
  return JSON.parse(readFileSync(filePath, 'utf-8')) as RoutingOutcome[];
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('adaptive-agent → outcome-tracker wire (212-002)', () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), 'deckent-212002-'));
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it('triggers adaptAgentRuntime: recordOutcome attaches skillAdaptation metadata to persisted outcome', () => {
    const tracker = new OutcomeTracker(projectRoot);

    tracker.recordOutcome(
      makeOutcome({ taskId: 't1', sprintId: 'sprint-100', agentId: 'bug-fixer', evaluation: 'DONE' }),
    );

    const persisted = readSprintOutcomes(projectRoot, 'sprint-100');
    expect(persisted).toHaveLength(1);
    const adaptation = persisted[0]!.skillAdaptation;
    expect(adaptation).toBeDefined();
    expect(adaptation!.agentId).toBe('bug-fixer');
    expect(Array.isArray(adaptation!.suggestAdd)).toBe(true);
    expect(Array.isArray(adaptation!.suggestRemove)).toBe(true);
    expect(typeof adaptation!.reason).toBe('string');
    expect(adaptation!.reason.length).toBeGreaterThan(0);
  });

  it('successful agent: no skill changes suggested (suggestAdd is empty)', () => {
    const tracker = new OutcomeTracker(projectRoot);

    for (let i = 1; i <= 4; i++) {
      tracker.recordOutcome(
        makeOutcome({
          taskId: `ok-${i}`,
          sprintId: `sprint-2${i}`,
          agentId: 'code-reviewer',
          skillIds: ['typescript-expert', 'testing-expert'],
          evaluation: 'DONE',
          coverage: 90,
        }),
      );
    }

    const last = readSprintOutcomes(projectRoot, 'sprint-24').at(-1)!;
    expect(last.skillAdaptation).toBeDefined();
    expect(last.skillAdaptation!.suggestAdd).toEqual([]);
    expect(last.skillAdaptation!.suggestRemove).toEqual([]);
  });

  it('failing agent (low coverage GO_WITH_TECH_DEBT history): suggests testing-expert skill', () => {
    const tracker = new OutcomeTracker(projectRoot);

    for (let i = 1; i <= 3; i++) {
      tracker.recordOutcome(
        makeOutcome({
          taskId: `td-${i}`,
          sprintId: `sprint-3${i}`,
          agentId: 'refactorer',
          skillIds: [], // testing-expert not yet present
          evaluation: 'GO_WITH_TECH_DEBT',
          coverage: 30,
        }),
      );
    }

    const last = readSprintOutcomes(projectRoot, 'sprint-33').at(-1)!;
    expect(last.skillAdaptation).toBeDefined();
    expect(last.skillAdaptation!.suggestAdd).toContain('testing-expert');
    expect(last.skillAdaptation!.agentId).toBe('refactorer');
  });

  it('idempotent: same history produces the same skillAdaptation across separate trackers', () => {
    const trackerA = new OutcomeTracker(projectRoot);
    for (let i = 1; i <= 3; i++) {
      trackerA.recordOutcome(
        makeOutcome({
          taskId: `a-${i}`,
          sprintId: `sprint-4${i}`,
          agentId: 'doc-writer',
          skillIds: [],
          evaluation: 'NO_GO',
          coverage: 0,
        }),
      );
    }
    const firstLast = readSprintOutcomes(projectRoot, 'sprint-43').at(-1)!;

    // Re-run identical sequence into a fresh project — same inputs, same output.
    const projectRoot2 = mkdtempSync(join(tmpdir(), 'deckent-212002b-'));
    try {
      const trackerB = new OutcomeTracker(projectRoot2);
      for (let i = 1; i <= 3; i++) {
        trackerB.recordOutcome(
          makeOutcome({
            taskId: `a-${i}`,
            sprintId: `sprint-4${i}`,
            agentId: 'doc-writer',
            skillIds: [],
            evaluation: 'NO_GO',
            coverage: 0,
          }),
        );
      }
      const secondLast = readSprintOutcomes(projectRoot2, 'sprint-43').at(-1)!;

      expect(firstLast.skillAdaptation).toBeDefined();
      expect(secondLast.skillAdaptation).toBeDefined();
      expect(secondLast.skillAdaptation!.agentId).toBe(firstLast.skillAdaptation!.agentId);
      expect(secondLast.skillAdaptation!.suggestAdd).toEqual(firstLast.skillAdaptation!.suggestAdd);
      expect(secondLast.skillAdaptation!.suggestRemove).toEqual(firstLast.skillAdaptation!.suggestRemove);
      expect(secondLast.skillAdaptation!.reason).toBe(firstLast.skillAdaptation!.reason);
    } finally {
      rmSync(projectRoot2, { recursive: true, force: true });
    }
  });

  it('generic agent: no skillAdaptation attached (advisory short-circuit)', () => {
    const tracker = new OutcomeTracker(projectRoot);
    tracker.recordOutcome(makeOutcome({ taskId: 'g1', sprintId: 'sprint-500', agentId: 'generic' }));
    const persisted = readSprintOutcomes(projectRoot, 'sprint-500');
    expect(persisted).toHaveLength(1);
    expect(persisted[0]!.skillAdaptation).toBeUndefined();
  });
});
