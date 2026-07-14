import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  wirePromptEvolutionFromOutcomes,
  evolvePromptFromSprintOutcomes,
} from '../../src/orchestra/prompt-evolution.js';
import type { RoutingOutcome } from '../../src/orchestra/outcome-tracker.js';
import { createDefaultTaskDNA } from '../../src/core/routing-types.js';

function makeOutcome(
  taskId: string,
  evaluation: RoutingOutcome['evaluation'],
  agentId: string | null = 'refactorer',
): RoutingOutcome {
  return {
    taskId,
    sprintId: 'sprint-wire-test',
    taskDNA: createDefaultTaskDNA(),
    agentId,
    skillIds: ['typescript-expert'],
    evaluation,
    coverage: 80,
    routingVersion: 'v2',
  };
}

describe('wirePromptEvolutionFromOutcomes', () => {
  let projectRoot: string;
  const sprintId = 'sprint-wire-test';

  beforeEach(() => {
    projectRoot = join(tmpdir(), `deckent-pe-wire-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(join(projectRoot, '.deckent', 'routing', 'outcomes'), { recursive: true });
  });

  afterEach(() => {
    try {
      rmSync(projectRoot, { recursive: true, force: true });
    } catch {
      // best-effort cleanup
    }
  });

  function writeOutcomes(outcomes: RoutingOutcome[]): void {
    writeFileSync(
      join(projectRoot, '.deckent', 'routing', 'outcomes', `${sprintId}.json`),
      JSON.stringify(outcomes),
      'utf-8',
    );
  }

  it('produces an evolved-prompt suggestion from a sprint outcome file (outcome → öneri)', () => {
    writeOutcomes([
      makeOutcome('t1', 'DONE'),
      makeOutcome('t2', 'DONE'),
      makeOutcome('t3', 'DONE'),
      makeOutcome('t4', 'DONE'),
    ]);

    const result = wirePromptEvolutionFromOutcomes({
      projectRoot,
      sprintId,
      basePrompt: 'Base prompt.',
    });

    expect(result.outcomeCount).toBe(4);
    expect(result.changes.length).toBeGreaterThan(0);
    expect(result.evolvedPrompt).not.toBe('Base prompt.');
  });

  it('reinforces a success pattern when the sprint file shows mostly DONE outcomes (başarı pattern)', () => {
    writeOutcomes([
      makeOutcome('t1', 'DONE'),
      makeOutcome('t2', 'DONE'),
      makeOutcome('t3', 'GO_WITH_TECH_DEBT'),
      makeOutcome('t4', 'DONE'),
    ]);

    const result = wirePromptEvolutionFromOutcomes({
      projectRoot,
      sprintId,
      basePrompt: 'Base prompt.',
    });

    expect(result.changes).toContain('reinforced-success-pattern');
    expect(result.evolvedPrompt).toContain('Success Pattern');
    expect(result.evolvedPrompt).toContain('refactorer');
    expect(result.successRate).toBeGreaterThanOrEqual(0.75);
  });

  it('adds a risk warning when the sprint file contains repeated NO_GO outcomes (başarısızlık pattern)', () => {
    writeOutcomes([
      makeOutcome('t1', 'NO_GO', 'bug-fixer'),
      makeOutcome('t2', 'NO_GO', 'bug-fixer'),
      makeOutcome('t3', 'DONE', 'refactorer'),
    ]);

    const result = wirePromptEvolutionFromOutcomes({
      projectRoot,
      sprintId,
      basePrompt: 'Base prompt.',
    });

    expect(result.changes).toContain('added-failure-warning');
    expect(result.evolvedPrompt).toContain('Risk Warning');
    expect(result.evolvedPrompt).toContain('bug-fixer (2x)');
  });

  it('is a no-op when the outcome file is missing or empty (boş)', () => {
    // No file written — directory exists, file does not.
    const missing = wirePromptEvolutionFromOutcomes({
      projectRoot,
      sprintId: 'sprint-does-not-exist',
      basePrompt: 'Base prompt.',
    });
    expect(missing.outcomeCount).toBe(0);
    expect(missing.changes).toEqual([]);
    expect(missing.evolvedPrompt).toBe('Base prompt.');

    // Empty array stored — same no-op semantics.
    writeOutcomes([]);
    const empty = wirePromptEvolutionFromOutcomes({
      projectRoot,
      sprintId,
      basePrompt: 'Base prompt.',
    });
    expect(empty.outcomeCount).toBe(0);
    expect(empty.changes).toEqual([]);
    expect(empty.evolvedPrompt).toBe('Base prompt.');
  });

  it('degrades gracefully when the outcome file is malformed JSON', () => {
    writeFileSync(
      join(projectRoot, '.deckent', 'routing', 'outcomes', `${sprintId}.json`),
      '{not valid json',
      'utf-8',
    );

    const result = wirePromptEvolutionFromOutcomes({
      projectRoot,
      sprintId,
      basePrompt: 'Base prompt.',
    });

    expect(result.outcomeCount).toBe(0);
    expect(result.changes).toEqual([]);
    expect(result.evolvedPrompt).toBe('Base prompt.');
  });

  it('does not mutate any disk state — purely a suggestion (no-apply contract)', () => {
    const baseline = [
      makeOutcome('t1', 'DONE'),
      makeOutcome('t2', 'DONE'),
      makeOutcome('t3', 'DONE'),
    ];
    writeOutcomes(baseline);

    wirePromptEvolutionFromOutcomes({
      projectRoot,
      sprintId,
      basePrompt: 'Base prompt.',
    });

    const after = JSON.parse(
      readFileSync(
        join(projectRoot, '.deckent', 'routing', 'outcomes', `${sprintId}.json`),
        'utf-8',
      ),
    );
    expect(after).toEqual(baseline);
  });
});

describe('evolvePromptFromSprintOutcomes', () => {
  it('delegates to evolvePrompt for in-memory outcomes (companion helper)', () => {
    const outcomes = [
      makeOutcome('t1', 'DONE'),
      makeOutcome('t2', 'DONE'),
      makeOutcome('t3', 'DONE'),
    ];
    const result = evolvePromptFromSprintOutcomes('Base.', outcomes);
    expect(result.outcomeCount).toBe(3);
    expect(result.successRate).toBe(1);
  });

  it('returns a no-op shape for an empty outcome list', () => {
    const result = evolvePromptFromSprintOutcomes('Base.', []);
    expect(result.evolvedPrompt).toBe('Base.');
    expect(result.changes).toEqual([]);
  });
});
