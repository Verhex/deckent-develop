// ─── Decision Log Rehabilitation Tests ──────────────────────────────────────
// Tests for SDL decision log filtering, v2-only logging, and explain integration.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { DecisionLogger, filterMeaningfulSteps } from '../../src/orchestra/decision-logger.js';
import { buildTaskDecisionOutput } from '../../src/cli/commands/explain.js';
import type { DecisionLogEntry } from '../../src/core/decision-types.js';

// ─── Test Helpers ───────────────────────────────────────────────────────────

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'decision-log-test-'));
}

function cleanupDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

function makeEntry(step: number, reasoning: string, input?: Record<string, unknown>, output?: Record<string, unknown>): DecisionLogEntry {
  return {
    step,
    name: `routing-step-${step}`,
    input: input ?? {},
    output: output ?? {},
    durationMs: 0,
    reasoning,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('Decision Log Rehabilitation', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTempDir();
    // Create .deckent/decisions/ directory
    fs.mkdirSync(path.join(tmpDir, '.deckent', 'runtime', 'decisions'), { recursive: true });
  });

  afterEach(() => {
    cleanupDir(tmpDir);
  });

  // ─── Test 1: v2 routing → log is written ──────────────────────────────
  it('writes decision log for v2 routing with meaningful steps', () => {
    const logger = new DecisionLogger(tmpDir);
    const entries: DecisionLogEntry[] = [
      makeEntry(1, 'Intent: core-dev (confidence: 0.8)', { taskId: '146-001', title: 'Test Task', scope: ['src/core/'], intent: 'core-dev' }, { agent: 'architect', skills: ['typescript-expert'], confidence: 'high' }),
      makeEntry(2, "Agent selected: 'architect' (score=8, rules=[scope-match])", { taskId: '146-001' }, { agent: 'architect' }),
      makeEntry(3, 'Skill budget: max 3 (medium task, 2 module(s), effort=normal)', {}, {}),
      makeEntry(4, "Skill selected: 'typescript-expert' (score=7, rules=[lang-match])", {}, {}),
    ];

    // Filter meaningful steps (simulating what sprint-planner does)
    const meaningful = filterMeaningfulSteps(entries);
    expect(meaningful.length).toBeGreaterThan(0);

    logger.log('sprint-146', '146-001', meaningful);

    const logPath = path.join(tmpDir, '.deckent', 'runtime', 'decisions', 'decision-146-001.json');
    expect(fs.existsSync(logPath)).toBe(true);

    const persisted = JSON.parse(fs.readFileSync(logPath, 'utf-8'));
    expect(persisted.taskId).toBe('146-001');
    expect(persisted.sprintId).toBe('sprint-146');
    expect(persisted.steps.length).toBeGreaterThan(0);

    // Verify input and output are populated (not empty {})
    const firstStep = persisted.steps[0];
    expect(Object.keys(firstStep.input).length).toBeGreaterThan(0);
    expect(Object.keys(firstStep.output).length).toBeGreaterThan(0);
  });

  // ─── Test 2: v1 routing → no log ─────────────────────────────────────
  it('does not write decision log for v1 routing (no meaningful steps)', () => {
    // v1 routing produces entries without v2-specific patterns
    const v1Entries: DecisionLogEntry[] = [
      makeEntry(1, 'Task type detected: code'),
      makeEntry(2, 'Provider resolved: claude'),
      makeEntry(3, 'Default routing applied'),
    ];

    const meaningful = filterMeaningfulSteps(v1Entries);
    // v1 steps should not match any meaningful patterns
    expect(meaningful.length).toBe(0);
  });

  // ─── Test 3: Trivial routing → no log (empty filter) ─────────────────
  it('filters out trivial routing steps that provide no debug value', () => {
    const trivialEntries: DecisionLogEntry[] = [
      makeEntry(1, 'Intent: code (confidence: 0.5)'),
      makeEntry(2, 'No relevant override found'),
      makeEntry(3, 'Default config applied'),
    ];

    const meaningful = filterMeaningfulSteps(trivialEntries);
    expect(meaningful.length).toBe(0);
  });

  // ─── Test 4: Agent exclusion rule match → excluded: true ──────────────
  it('preserves agent exclusion steps with exclusion reason', () => {
    const entries: DecisionLogEntry[] = [
      makeEntry(1, 'Intent: testing (confidence: 0.7)'),
      makeEntry(2, "Agent 'architecture-planner' excluded: Architecture planner designs systems, does not write tests"),
      makeEntry(3, "Agent 'frontend-designer' excluded: Excluded by rule"),
      makeEntry(4, 'Dynamic exclusions: [migration-specialist, devops-engineer]'),
      makeEntry(5, "Agent selected: 'test-writer' (score=9, rules=[intent-match])"),
    ];

    const meaningful = filterMeaningfulSteps(entries);
    // Should keep exclusion steps, dynamic exclusions, and agent selected
    expect(meaningful.length).toBe(4);
    expect(meaningful.some(e => e.reasoning.includes('excluded'))).toBe(true);
    expect(meaningful.some(e => e.reasoning.includes('Dynamic exclusions'))).toBe(true);
    expect(meaningful.some(e => e.reasoning.includes('Agent selected'))).toBe(true);
  });

  // ─── Test 5: Skill budget exceed → output populated ───────────────────
  it('preserves skill budget and skill selection steps with populated output', () => {
    const entries: DecisionLogEntry[] = [
      makeEntry(1, 'Intent: implementation (confidence: 0.9)'),
      makeEntry(2, "Agent selected: 'architect' (score=8, rules=[scope-match])",
        { taskId: '146-005' },
        { agent: 'architect', skills: ['typescript-expert', 'system-architect'], confidence: 'high' },
      ),
      makeEntry(3, 'Skill budget: max 2 (small task, 1 module(s), effort=low)', {}, {}),
      makeEntry(4, "Skill selected: 'typescript-expert' (score=7, rules=[lang-match])", {}, {}),
      makeEntry(5, "Skill 'docker-expert' excluded: Low relevance for this scope", {}, {}),
      makeEntry(6, "Skill 'testing-expert' learning bonus: +3 (sprint recency)", {}, {}),
    ];

    const meaningful = filterMeaningfulSteps(entries);
    // Should keep: agent selected, skill budget, skill selected, skill excluded, learning bonus
    expect(meaningful.length).toBe(5);
    expect(meaningful.some(e => e.reasoning.includes('Skill budget'))).toBe(true);

    // Verify output is populated on the agent step
    const agentStep = meaningful.find(e => e.reasoning.includes('Agent selected'));
    expect(agentStep).toBeDefined();
    expect(agentStep!.output.agent).toBe('architect');
  });

  // ─── Test 6: deckent explain --task reads decision log ────────────────
  it('buildTaskDecisionOutput reads and formats decision log for a task', () => {
    // Write a decision log file
    const decisionDir = path.join(tmpDir, '.deckent', 'runtime', 'decisions');
    const logData = {
      taskId: '146-001',
      sprintId: 'sprint-146',
      steps: [
        {
          step: 1,
          name: 'routing-step-1',
          input: { taskId: '146-001', title: 'Agent Truncation Bug Fix', scope: ['src/core/'], intent: 'bug-fix' },
          output: { agent: 'bug-fixer', skills: ['typescript-expert'], confidence: 'high' },
          durationMs: 0,
          reasoning: "Agent selected: 'bug-fixer' (score=9, rules=[intent-match, scope-match])",
        },
        {
          step: 2,
          name: 'routing-step-2',
          input: { taskId: '146-001' },
          output: {},
          durationMs: 0,
          reasoning: 'Skill budget: max 3 (medium task, 2 module(s), effort=normal)',
        },
        {
          step: 3,
          name: 'routing-step-3',
          input: {},
          output: {},
          durationMs: 0,
          reasoning: "Skill selected: 'typescript-expert' (score=7, rules=[lang-match])",
        },
      ],
      decidedAt: '2026-04-20T07:00:00.000Z',
    };

    fs.writeFileSync(
      path.join(decisionDir, 'decision-146-001.json'),
      JSON.stringify(logData, null, 2),
      'utf-8',
    );

    const output = buildTaskDecisionOutput('146-001', tmpDir, 'en');
    expect(output).not.toBeNull();
    expect(output).toContain('146-001');
    expect(output).toContain('sprint-146');
    expect(output).toContain('Agent Truncation Bug Fix');
    expect(output).toContain('bug-fixer');
    expect(output).toContain('typescript-expert');
    expect(output).toContain('Routing Steps');

    // Also test that non-existent task returns null
    const missing = buildTaskDecisionOutput('999-999', tmpDir, 'en');
    expect(missing).toBeNull();

    // Test Turkish output
    const outputTr = buildTaskDecisionOutput('146-001', tmpDir, 'tr');
    expect(outputTr).toContain('Routing Kararları');
    expect(outputTr).toContain('Giriş:');
    expect(outputTr).toContain('Sonuç:');
  });
});
