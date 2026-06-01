// ═══ Prompt Evolution — Rollback Wire Tests ════════════════════════════════
// Sprint 212 Task 212-006 — verifies that prompt-evolution.ts is a real
// external caller of prompt-rollback.ts via evolvePromptCheckRollback().
// Before this wire, PromptRollback had zero external callers (dormant).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PromptVersionManager } from '../../src/agents/prompt-version.js';
import {
  evolvePromptCheckRollback,
  type PromptEvolutionWithRollback,
} from '../../src/orchestra/prompt-evolution.js';
import type { RoutingOutcome } from '../../src/orchestra/outcome-tracker.js';
import { createDefaultTaskDNA } from '../../src/core/routing-types.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'pe-rollback-wire-'));
}

function makeOutcome(
  taskId: string,
  evaluation: RoutingOutcome['evaluation'],
  agentId = 'test-agent',
): RoutingOutcome {
  return {
    taskId,
    sprintId: 'sprint-212',
    taskDNA: createDefaultTaskDNA(),
    agentId,
    skillIds: ['typescript-expert'],
    evaluation,
    coverage: 80,
    routingVersion: 'v2',
  };
}

function setupTwoVersions(projectRoot: string, agentId: string): void {
  const mgr = new PromptVersionManager(projectRoot);
  mgr.createVersion(agentId, 'v1 prompt', 'initial');
  mgr.updateVersionStats(agentId, 1, 'DONE');
  mgr.createVersion(agentId, 'v2 prompt — current', 'second');
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('evolvePromptCheckRollback — rollback wire', () => {
  let tmpDir: string;
  const agentId = 'test-agent';

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // best-effort cleanup
    }
  });

  it('düşük-perf rollback: low success rate triggers rollback suggestion', () => {
    setupTwoVersions(tmpDir, agentId);

    const outcomes: RoutingOutcome[] = [
      makeOutcome('t1', 'NO_GO'),
      makeOutcome('t2', 'NO_GO'),
      makeOutcome('t3', 'NO_GO'),
    ];

    const result: PromptEvolutionWithRollback = evolvePromptCheckRollback(
      'Base prompt.',
      outcomes,
      agentId,
      tmpDir,
    );

    expect(result.rollbackSuggestion).toBeDefined();
    expect(result.rollbackSuggestion!.agentId).toBe(agentId);
    expect(result.rollbackSuggestion!.rolledBackTo).toBe(1);
    expect(result.rollbackSuggestion!.reason).toContain('Rolled back to version 1');
  });

  it('iyi-perf koru: high success rate preserves current prompt (no rollback)', () => {
    setupTwoVersions(tmpDir, agentId);

    const outcomes: RoutingOutcome[] = [
      makeOutcome('t1', 'DONE'),
      makeOutcome('t2', 'DONE'),
      makeOutcome('t3', 'DONE'),
      makeOutcome('t4', 'DONE'),
    ];

    const result = evolvePromptCheckRollback('Base.', outcomes, agentId, tmpDir);

    expect(result.rollbackSuggestion).toBeUndefined();
    expect(result.successRate).toBe(1);
  });

  it('versiyon zinciri: rollback picks best historical version from version chain', () => {
    const mgr = new PromptVersionManager(tmpDir);
    mgr.createVersion(agentId, 'v1 prompt — old', 'initial');
    // v1 has decent stats
    mgr.updateVersionStats(agentId, 1, 'DONE');
    mgr.updateVersionStats(agentId, 1, 'DONE');
    mgr.createVersion(agentId, 'v2 prompt — better', 'improved');
    // v2 has better stats
    mgr.updateVersionStats(agentId, 2, 'DONE');
    mgr.updateVersionStats(agentId, 2, 'DONE');
    mgr.updateVersionStats(agentId, 2, 'DONE');
    mgr.createVersion(agentId, 'v3 prompt — current bad', 'latest');
    // v3 is current but performing poorly — don't update its stats

    const outcomes: RoutingOutcome[] = [
      makeOutcome('t1', 'NO_GO'),
      makeOutcome('t2', 'NO_GO'),
      makeOutcome('t3', 'NO_GO'),
    ];

    const result = evolvePromptCheckRollback('Base.', outcomes, agentId, tmpDir);

    expect(result.rollbackSuggestion).toBeDefined();
    // Should roll back to a historical version (not v3)
    expect(result.rollbackSuggestion!.rolledBackTo).toBeLessThan(3);
  });

  it('boş: empty outcomes produce no rollback suggestion', () => {
    setupTwoVersions(tmpDir, agentId);

    const result = evolvePromptCheckRollback('Base.', [], agentId, tmpDir);

    expect(result.rollbackSuggestion).toBeUndefined();
    expect(result.outcomeCount).toBe(0);
    expect(result.evolvedPrompt).toBe('Base.');
  });
});
