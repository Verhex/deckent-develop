// ═══ Sprint Reporter — Prompt Evolution Retro Wire Tests ══════════════
// Sprint 212 Task 212-001 — verifies the F5 evolution loop becomes a real
// retro consumer via `sprint-reporter.ts`. Before this wire,
// `wirePromptEvolutionFromOutcomes` had zero external callers (dormant).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  collectPromptEvolutionSuggestion,
  buildPromptEvolutionSection,
  type PromptEvolutionResult,
} from '../../src/orchestra/sprint-reporter.js';
import type { RoutingOutcome } from '../../src/orchestra/outcome-tracker.js';
import { createDefaultTaskDNA } from '../../src/core/routing-types.js';

function makeOutcome(
  taskId: string,
  evaluation: RoutingOutcome['evaluation'],
  agentId: string | null = 'refactorer',
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

function makeTempRoot(): string {
  const root = join(
    tmpdir(),
    `sprint-reporter-pe-wire-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(join(root, '.deckent', 'routing', 'outcomes'), { recursive: true });
  return root;
}

function writeOutcomesFile(root: string, sprintId: string, outcomes: RoutingOutcome[]): void {
  writeFileSync(
    join(root, '.deckent', 'routing', 'outcomes', `${sprintId}.json`),
    JSON.stringify(outcomes),
    'utf-8',
  );
}

describe('sprint-reporter — prompt evolution retro wire', () => {
  let testRoot: string;
  const sprintId = 'sprint-212';

  beforeEach(() => {
    testRoot = makeTempRoot();
  });

  afterEach(() => {
    try {
      rmSync(testRoot, { recursive: true, force: true });
    } catch {
      // cleanup best-effort
    }
  });

  // ─── collectPromptEvolutionSuggestion (caller side) ─────────────

  it('caller tetikler: reads outcome file from disk and returns a non-empty suggestion', () => {
    writeOutcomesFile(testRoot, sprintId, [
      makeOutcome('212-001', 'DONE'),
      makeOutcome('212-002', 'DONE'),
      makeOutcome('212-003', 'DONE'),
      makeOutcome('212-004', 'DONE'),
    ]);

    const result = collectPromptEvolutionSuggestion({
      projectRoot: testRoot,
      sprintId,
      basePrompt: 'Base prompt.',
    });

    expect(result.outcomeCount).toBe(4);
    expect(result.changes.length).toBeGreaterThan(0);
    expect(result.changes).toContain('reinforced-success-pattern');
    expect(result.evolvedPrompt).toContain('Başarı Pattern');
    expect(result.successRate).toBe(1);
  });

  it('boş outcome no-op: returns the base prompt unchanged when no outcome file exists', () => {
    const result = collectPromptEvolutionSuggestion({
      projectRoot: testRoot,
      sprintId: 'sprint-does-not-exist',
      basePrompt: 'Base prompt.',
    });

    expect(result.outcomeCount).toBe(0);
    expect(result.changes).toEqual([]);
    expect(result.evolvedPrompt).toBe('Base prompt.');
    expect(result.successRate).toBe(0);
  });

  it('defaults basePrompt to empty string when omitted (caller convenience)', () => {
    writeOutcomesFile(testRoot, sprintId, []);
    const result = collectPromptEvolutionSuggestion({
      projectRoot: testRoot,
      sprintId,
    });

    expect(result.outcomeCount).toBe(0);
    expect(result.evolvedPrompt).toBe('');
  });

  it('does not mutate the outcome file on disk (suggestion-only contract)', () => {
    const baseline = [
      makeOutcome('212-001', 'DONE'),
      makeOutcome('212-002', 'DONE'),
      makeOutcome('212-003', 'DONE'),
    ];
    writeOutcomesFile(testRoot, sprintId, baseline);

    collectPromptEvolutionSuggestion({
      projectRoot: testRoot,
      sprintId,
      basePrompt: 'Base.',
    });

    const after = JSON.parse(
      readFileSync(
        join(testRoot, '.deckent', 'routing', 'outcomes', `${sprintId}.json`),
        'utf-8',
      ),
    ) as RoutingOutcome[];
    expect(after).toEqual(baseline);
  });

  // ─── buildPromptEvolutionSection (formatter side) ───────────────

  it('retro çıktısına yazılır: formats a non-empty suggestion as markdown', () => {
    const result: PromptEvolutionResult = {
      evolvedPrompt: 'Base.\n\n## Başarı Pattern (Outcome-Driven)\nGeçmiş 4 task...',
      changes: ['reinforced-success-pattern'],
      outcomeCount: 4,
      successRate: 1,
    };
    const md = buildPromptEvolutionSection(result);

    expect(md).toContain('## Prompt Evolution Suggestion');
    expect(md).toContain('Outcomes considered: 4');
    expect(md).toContain('Success rate: 100%');
    expect(md).toContain('Suggested changes: reinforced-success-pattern');
    expect(md).toContain('### Evolved Prompt (suggestion — not applied)');
    expect(md).toContain('Başarı Pattern');
    expect(md.endsWith('\n')).toBe(true);
  });

  it('renders the heading + "none" line even when there are no suggested changes', () => {
    const result: PromptEvolutionResult = {
      evolvedPrompt: '',
      changes: [],
      outcomeCount: 0,
      successRate: 0,
    };
    const md = buildPromptEvolutionSection(result);

    expect(md).toContain('## Prompt Evolution Suggestion');
    expect(md).toContain('Outcomes considered: 0');
    expect(md).toContain('Success rate: 0%');
    expect(md).toContain('Suggested changes: none');
    // No "Evolved Prompt" sub-section when there are no changes.
    expect(md).not.toContain('### Evolved Prompt');
  });

  // ─── end-to-end pipeline (caller → formatter) ────────────────────

  it('end-to-end: disk outcomes → caller → formatter produces a retro-ready section', () => {
    writeOutcomesFile(testRoot, sprintId, [
      makeOutcome('212-001', 'NO_GO', 'bug-fixer'),
      makeOutcome('212-002', 'NO_GO', 'bug-fixer'),
      makeOutcome('212-003', 'DONE', 'refactorer'),
    ]);

    const result = collectPromptEvolutionSuggestion({
      projectRoot: testRoot,
      sprintId,
      basePrompt: 'Base.',
    });
    const md = buildPromptEvolutionSection(result);

    expect(result.changes).toContain('added-failure-warning');
    expect(md).toContain('## Prompt Evolution Suggestion');
    expect(md).toContain('Suggested changes: added-failure-warning');
    expect(md).toContain('Risk Uyarısı');
    expect(md).toContain('bug-fixer');
  });
});
