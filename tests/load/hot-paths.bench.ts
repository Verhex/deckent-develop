// ═══════════════════════════════════════════════════════════════════════
// Hot Paths Benchmark — vitest bench mode
// Sprint 133 Task 9: spawnWorkers, waitForResults, evaluateResult mock harness
// Run with: npx vitest bench tests/load/hot-paths.bench.ts
// ═══════════════════════════════════════════════════════════════════════

import { bench, describe } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// ─── Mock Data Factories ─────────────────────────────────────────────

function createMockTaskResult(taskId: string) {
  return {
    taskId,
    workerId: `w-${taskId}`,
    filesChanged: [`src/file-${taskId}.ts`, `tests/file-${taskId}.test.ts`],
    linesAdded: 50 + Math.floor(Math.random() * 100),
    linesRemoved: 10 + Math.floor(Math.random() * 30),
    testsPassed: true,
    coverage: 80 + Math.floor(Math.random() * 20),
    selfAssessment: 'DONE' as const,
    notes: `Task ${taskId} completed`,
  };
}

function createMockTask(taskId: string) {
  return {
    id: taskId,
    title: `Task ${taskId}`,
    description: `Mock task for benchmark ${taskId}`,
    model: 'sonnet' as const,
    effort: 'normal' as const,
    priority: 'NORMAL' as const,
    reason: 'benchmark',
    scope: {
      directories: ['src/'],
      filesRead: [],
      filesWrite: [`src/file-${taskId}.ts`],
    },
    dependencies: [],
    goNogo: {
      goCriteria: 'tests pass',
      noGoCriteria: 'tests fail',
      techDebtAcceptable: 'minor issues',
    },
    status: 'DONE' as const,
    sprintId: 'sprint-bench',
    assignedAgent: 'generic',
    assignedSkills: [],
  };
}

function createTmpProjectForBench(): string {
  const dir = mkdtempSync(join(tmpdir(), 'deckent-bench-'));
  const deckentDir = join(dir, '.deckent');
  mkdirSync(deckentDir, { recursive: true });
  mkdirSync(join(dir, '.tasks'), { recursive: true });

  writeFileSync(
    join(deckentDir, 'config.json'),
    JSON.stringify({
      mode: 'performance',
      language: 'en',
      modes: {
        performance: { max_workers: 8, brain_model: 'opus', default_model: 'opus', haiku_allowed: true, brain_planning: 'auto' },
        balanced: { max_workers: 5, brain_model: 'sonnet', default_model: 'opus', haiku_allowed: true, brain_planning: 'auto' },
        economic: { max_workers: 3, brain_model: 'sonnet', default_model: 'sonnet', haiku_allowed: false, brain_planning: 'auto' },
        api: { max_workers: 10, brain_model: 'opus', default_model: 'sonnet', haiku_allowed: true, budget_per_sprint: 5.0, requires: 'ANTHROPIC_API_KEY', brain_planning: 'auto' },
      },
    }),
  );

  return dir;
}

// ─── Pre-generate data ──────────────────────────────────────────────

const RESULT_COUNT = 200;
const mockResults = Array.from({ length: RESULT_COUNT }, (_, i) =>
  createMockTaskResult(`${String(i).padStart(3, '0')}-001`),
);
const mockTasks = Array.from({ length: RESULT_COUNT }, (_, i) =>
  createMockTask(`${String(i).padStart(3, '0')}-001`),
);

// Build Map index
const resultsMap = new Map(mockResults.map(r => [r.taskId, r]));

// Random lookup targets
const lookupTargets = Array.from({ length: 1000 }, () =>
  `${String(Math.floor(Math.random() * RESULT_COUNT)).padStart(3, '0')}-001`,
);

// ═══════════════════════════════════════════════════════════════════════
// Benchmarks
// ═══════════════════════════════════════════════════════════════════════

describe('Hot Path: Result Lookup', () => {
  bench('Map.get() × 1000 lookups', () => {
    for (const target of lookupTargets) {
      resultsMap.get(target);
    }
  });

  bench('Array.find() × 1000 lookups', () => {
    for (const target of lookupTargets) {
      mockResults.find(r => r.taskId === target);
    }
  });

  bench('buildResultsMap() from 200 results', () => {
    const map = new Map<string, typeof mockResults[0]>();
    for (const r of mockResults) {
      map.set(r.taskId, r);
    }
  });
});

describe('Hot Path: evaluateResult mock harness', () => {
  bench('evaluateResult() × 200 tasks (mock)', () => {
    // Inline mock of evaluateResult logic to benchmark the evaluation path
    // without importing the real function (which has heavy deps)
    for (let i = 0; i < RESULT_COUNT; i++) {
      const result = mockResults[i];
      const task = mockTasks[i];

      // Mimic core evaluation logic from sprint-controller.ts
      let evaluation: string;
      if (result.selfAssessment === 'NO_GO') {
        evaluation = 'NO_GO';
      } else if (result.selfAssessment === 'GO_WITH_TECH_DEBT') {
        evaluation = 'GO_WITH_TECH_DEBT';
      } else if (!result.testsPassed) {
        evaluation = 'NO_GO';
      } else if (result.coverage < 90) {
        evaluation = 'GO_WITH_TECH_DEBT';
      } else {
        evaluation = 'DONE';
      }

      // Use task to prevent tree-shaking
      if (task.id && evaluation) {
        // noop — prevents dead code elimination
      }
    }
  });
});

describe('Hot Path: spawnWorkers mock harness', () => {
  bench('prompt building simulation × 50 tasks', () => {
    // Mock the prompt building path (agent prompt + skill prompts + worker prompt)
    for (let i = 0; i < 50; i++) {
      const task = mockTasks[i % RESULT_COUNT];
      const agentPrompt = `You are a ${task.assignedAgent} agent. Your expertise: testing.`;
      const skillPrompts = (task.assignedSkills || []).map(
        (s: string) => `Skill: ${s}\nUse best practices.`,
      );

      // Simulate buildWorkerPrompt() — string concatenation
      const sections = [
        `# Task: ${task.title}`,
        `## Description\n${task.description}`,
        `## Scope\nDirectories: ${task.scope.directories.join(', ')}`,
        agentPrompt,
        ...skillPrompts,
        `## Files to write: ${task.scope.filesWrite.join(', ')}`,
      ];
      const _prompt = sections.join('\n\n');
    }
  });
});

describe('Hot Path: waitForResults mock harness', () => {
  bench('result file JSON parse × 200', () => {
    // Simulate the JSON.parse path in waitForResults
    for (const result of mockResults) {
      const json = JSON.stringify(result);
      JSON.parse(json);
    }
  });

  bench('result file check + parse simulation × 100', () => {
    // Simulate the polling loop: check existence + parse
    for (let i = 0; i < 100; i++) {
      const taskId = `${String(i % RESULT_COUNT).padStart(3, '0')}-001`;
      const result = resultsMap.get(taskId);
      if (result) {
        JSON.stringify(result); // Simulate write
      }
    }
  });
});

describe('Hot Path: deepMerge simulation', () => {
  const baseConfig = {
    mode: 'performance',
    language: 'en',
    modes: {
      performance: { max_workers: 8, brain_model: 'opus', default_model: 'opus', haiku_allowed: true },
      balanced: { max_workers: 5, brain_model: 'sonnet', default_model: 'opus', haiku_allowed: true },
    },
    routing_engine: 'v2',
    coverage_threshold: 80,
    max_reroutes: 2,
  };

  const override = {
    mode: 'balanced',
    coverage_threshold: 90,
    modes: {
      performance: { max_workers: 4 },
    },
  };

  bench('structuredClone + deepMerge × 100', () => {
    for (let i = 0; i < 100; i++) {
      const result = structuredClone(baseConfig);
      // Inline merge
      Object.assign(result, override);
      if (override.modes) {
        for (const [key, val] of Object.entries(override.modes)) {
          if ((result.modes as any)[key]) {
            Object.assign((result.modes as any)[key], val);
          }
        }
      }
    }
  });

  bench('JSON.parse(JSON.stringify()) clone × 100', () => {
    for (let i = 0; i < 100; i++) {
      JSON.parse(JSON.stringify(baseConfig));
    }
  });
});
