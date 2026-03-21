import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import os from 'node:os';

// Parallel Pipeline
import { ParallelPipelineManager } from '../../src/orchestra/parallel-pipeline.js';
import type { PipelineTask, ExecutionWave } from '../../src/orchestra/parallel-pipeline.js';

// Adaptive Agent
import { AdaptiveAgent } from '../../src/agents/adaptive-agent.js';
import type { ResultEntry } from '../../src/agents/adaptive-agent.js';

// Prompt Version
import { PromptVersionManager } from '../../src/agents/prompt-version.js';

// Prompt Rollback
import { PromptRollback } from '../../src/agents/prompt-rollback.js';

// Prompt A/B Test
import { PromptABTester } from '../../src/agents/prompt-ab-test.js';

// Prompt Metrics
import { PromptMetrics } from '../../src/agents/prompt-metrics.js';

// ─── Helpers ────────────────────────────────────────────────────────

let tmpDir: string;

function setup(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'collab-adapt-'));
}

function cleanup(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

// ─── Scenario A: Parallel Pipeline ──────────────────────────────────

describe('Scenario A: Parallel Pipeline', () => {
  it('creates 3 waves from 5 tasks with deps (A->B, C->D, E independent)', () => {
    const mgr = new ParallelPipelineManager();
    const tasks: PipelineTask[] = [
      { id: 'A', dependencies: [] },
      { id: 'B', dependencies: ['A'] },
      { id: 'C', dependencies: [] },
      { id: 'D', dependencies: ['C'] },
      { id: 'E', dependencies: [] },
    ];

    const waves = mgr.createPipeline(tasks);

    // Wave 0: A, C, E (no deps)
    // Wave 1: B (depends on A), D (depends on C)
    expect(waves.length).toBe(2);
    expect(waves[0]!.taskIds).toContain('A');
    expect(waves[0]!.taskIds).toContain('C');
    expect(waves[0]!.taskIds).toContain('E');
    expect(waves[1]!.taskIds).toContain('B');
    expect(waves[1]!.taskIds).toContain('D');
  });

  it('creates 3 waves from chained tasks A->B->C', () => {
    const mgr = new ParallelPipelineManager();
    const tasks: PipelineTask[] = [
      { id: 'A', dependencies: [] },
      { id: 'B', dependencies: ['A'] },
      { id: 'C', dependencies: ['B'] },
    ];

    const waves = mgr.createPipeline(tasks);

    expect(waves.length).toBe(3);
    expect(waves[0]!.taskIds).toEqual(['A']);
    expect(waves[1]!.taskIds).toEqual(['B']);
    expect(waves[2]!.taskIds).toEqual(['C']);
  });

  it('wave order is deterministic (sorted)', () => {
    const mgr = new ParallelPipelineManager();
    const tasks: PipelineTask[] = [
      { id: 'Z', dependencies: [] },
      { id: 'A', dependencies: [] },
      { id: 'M', dependencies: [] },
    ];

    const waves = mgr.createPipeline(tasks);
    expect(waves.length).toBe(1);
    expect(waves[0]!.taskIds).toEqual(['A', 'M', 'Z']);
  });

  it('throws on circular dependencies', () => {
    const mgr = new ParallelPipelineManager();
    const tasks: PipelineTask[] = [
      { id: 'A', dependencies: ['B'] },
      { id: 'B', dependencies: ['A'] },
    ];

    expect(() => mgr.createPipeline(tasks)).toThrow('Circular dependency');
  });

  it('handles empty task list', () => {
    const mgr = new ParallelPipelineManager();
    const waves = mgr.createPipeline([]);
    expect(waves).toEqual([]);
  });

  it('handles single task with no deps', () => {
    const mgr = new ParallelPipelineManager();
    const waves = mgr.createPipeline([{ id: 'X', dependencies: [] }]);
    expect(waves.length).toBe(1);
    expect(waves[0]!.taskIds).toEqual(['X']);
  });

  it('ignores unknown dependencies', () => {
    const mgr = new ParallelPipelineManager();
    const tasks: PipelineTask[] = [
      { id: 'A', dependencies: ['unknown'] },
      { id: 'B', dependencies: [] },
    ];

    const waves = mgr.createPipeline(tasks);
    // 'unknown' is not in task list, so A has 0 valid deps
    expect(waves.length).toBe(1);
    expect(waves[0]!.taskIds).toContain('A');
    expect(waves[0]!.taskIds).toContain('B');
  });

  it('getExecutionPlan returns readable string', () => {
    const mgr = new ParallelPipelineManager();
    const tasks: PipelineTask[] = [
      { id: 'A', dependencies: [] },
      { id: 'B', dependencies: ['A'] },
    ];
    const waves = mgr.createPipeline(tasks);
    const plan = mgr.getExecutionPlan(waves);

    expect(plan).toContain('Wave 0');
    expect(plan).toContain('Wave 1');
    expect(plan).toContain('Total waves: 2');
  });
});

// ─── Scenario B: Conflict Resolution ────────────────────────────────

describe('Scenario B: Conflict Resolution', () => {
  interface TaskResultForConflict {
    taskId: string;
    filesChanged: string[];
  }

  function detectConflicts(results: TaskResultForConflict[]): Array<{ file: string; taskIds: string[] }> {
    const fileMap = new Map<string, string[]>();
    for (const result of results) {
      for (const file of result.filesChanged) {
        const existing = fileMap.get(file) ?? [];
        existing.push(result.taskId);
        fileMap.set(file, existing);
      }
    }

    const conflicts: Array<{ file: string; taskIds: string[] }> = [];
    for (const [file, taskIds] of fileMap) {
      if (taskIds.length > 1) {
        conflicts.push({ file, taskIds });
      }
    }
    return conflicts;
  }

  function resolveConflict(
    conflict: { file: string; taskIds: string[] },
    strategy: 'last_writer_wins' | 'first_writer_wins' | 'manual',
  ): { winner: string; strategy: string } {
    if (strategy === 'first_writer_wins') {
      return { winner: conflict.taskIds[0]!, strategy };
    }
    if (strategy === 'last_writer_wins') {
      return { winner: conflict.taskIds[conflict.taskIds.length - 1]!, strategy };
    }
    return { winner: conflict.taskIds[0]!, strategy: 'manual' };
  }

  it('detects conflict when two tasks modify same file', () => {
    const results: TaskResultForConflict[] = [
      { taskId: 'task-1', filesChanged: ['src/auth.ts', 'src/config.ts'] },
      { taskId: 'task-2', filesChanged: ['src/auth.ts', 'src/utils.ts'] },
    ];

    const conflicts = detectConflicts(results);
    expect(conflicts.length).toBe(1);
    expect(conflicts[0]!.file).toBe('src/auth.ts');
    expect(conflicts[0]!.taskIds).toEqual(['task-1', 'task-2']);
  });

  it('returns no conflicts when tasks touch different files', () => {
    const results: TaskResultForConflict[] = [
      { taskId: 'task-1', filesChanged: ['src/a.ts'] },
      { taskId: 'task-2', filesChanged: ['src/b.ts'] },
    ];

    const conflicts = detectConflicts(results);
    expect(conflicts.length).toBe(0);
  });

  it('detects multiple conflicts', () => {
    const results: TaskResultForConflict[] = [
      { taskId: 'task-1', filesChanged: ['src/a.ts', 'src/b.ts'] },
      { taskId: 'task-2', filesChanged: ['src/a.ts', 'src/b.ts'] },
    ];

    const conflicts = detectConflicts(results);
    expect(conflicts.length).toBe(2);
  });

  it('resolves with last_writer_wins strategy', () => {
    const conflict = { file: 'src/auth.ts', taskIds: ['task-1', 'task-2'] };
    const result = resolveConflict(conflict, 'last_writer_wins');
    expect(result.winner).toBe('task-2');
    expect(result.strategy).toBe('last_writer_wins');
  });

  it('resolves with first_writer_wins strategy', () => {
    const conflict = { file: 'src/auth.ts', taskIds: ['task-1', 'task-2'] };
    const result = resolveConflict(conflict, 'first_writer_wins');
    expect(result.winner).toBe('task-1');
    expect(result.strategy).toBe('first_writer_wins');
  });

  it('resolves with manual strategy', () => {
    const conflict = { file: 'src/auth.ts', taskIds: ['task-1', 'task-2'] };
    const result = resolveConflict(conflict, 'manual');
    expect(result.strategy).toBe('manual');
  });
});

// ─── Scenario C: Adaptive Agent Pipeline ────────────────────────────

describe('Scenario C: Adaptive Agent Pipeline', () => {
  beforeEach(() => {
    tmpDir = setup();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  it('full adaptive flow: analyze -> suggest -> version -> canRollback', () => {
    const adaptive = new AdaptiveAgent();
    const versionMgr = new PromptVersionManager(tmpDir);
    const rollback = new PromptRollback(tmpDir);

    // Step 1: Create initial prompt version
    const v1 = versionMgr.createVersion('agent-1', '# Generic Prompt\nDo tasks.', 'initial');
    expect(v1.version).toBe(1);

    // Step 2: Simulate poor results
    const poorResults: ResultEntry[] = [
      { evaluation: 'NO_GO', coverage: 20, sprintId: 'sprint-028' },
      { evaluation: 'NO_GO', coverage: 15, sprintId: 'sprint-029' },
      { evaluation: 'GO_WITH_TECH_DEBT', coverage: 40, sprintId: 'sprint-030' },
    ];

    // Step 3: Analyze effectiveness
    const analysis = adaptive.analyzePromptEffectiveness('agent-1', poorResults);
    expect(analysis.needsImprovement).toBe(true);
    expect(analysis.successRate).toBeCloseTo(0.333, 2);
    expect(analysis.weaknesses.length).toBeGreaterThan(0);

    // Step 4: Suggest prompt change
    const diff = adaptive.suggestPromptChange('agent-1', v1.content, analysis.weaknesses);
    expect(diff.suggested).not.toBe(diff.original);
    expect(diff.changedSections.length).toBeGreaterThan(0);

    // Step 5: Create new version with suggestion
    const v2 = versionMgr.createVersion('agent-1', diff.suggested, diff.reasoning);
    expect(v2.version).toBe(2);

    // Step 6: Verify canRollback is now true
    expect(rollback.canRollback('agent-1')).toBe(true);
  });

  it('adaptive flow with experiment', () => {
    const adaptive = new AdaptiveAgent();
    const versionMgr = new PromptVersionManager(tmpDir);
    const abTester = new PromptABTester(tmpDir);

    // Create base version
    versionMgr.createVersion('agent-1', '# Base Prompt', 'initial');

    // Analyze and get suggestion
    const results: ResultEntry[] = [
      { evaluation: 'NO_GO', coverage: 30, sprintId: 'sprint-029' },
      { evaluation: 'NO_GO', coverage: 25, sprintId: 'sprint-030' },
      { evaluation: 'DONE', coverage: 70, sprintId: 'sprint-031' },
    ];
    const analysis = adaptive.analyzePromptEffectiveness('agent-1', results);
    const diff = adaptive.suggestPromptChange('agent-1', '# Base Prompt', analysis.weaknesses);

    // Create A/B experiment
    const experiment = abTester.createExperiment('agent-1', '# Base Prompt', diff.suggested);
    expect(experiment.status).toBe('active');

    // Assign variant
    const variant = abTester.assignVariant(experiment.id);
    expect(['A', 'B']).toContain(variant);
  });

  it('metrics collection after versioning', () => {
    const versionMgr = new PromptVersionManager(tmpDir);
    const metrics = new PromptMetrics();

    // Create multiple versions
    versionMgr.createVersion('agent-1', 'v1 prompt', 'initial');
    versionMgr.updateVersionStats('agent-1', 1, 'DONE');
    versionMgr.updateVersionStats('agent-1', 1, 'DONE');

    versionMgr.createVersion('agent-1', 'v2 prompt', 'improvement');
    versionMgr.updateVersionStats('agent-1', 2, 'NO_GO');

    versionMgr.createVersion('agent-1', 'v3 prompt', 'fix');
    versionMgr.updateVersionStats('agent-1', 3, 'DONE');
    versionMgr.updateVersionStats('agent-1', 3, 'DONE');
    versionMgr.updateVersionStats('agent-1', 3, 'DONE');

    const versions = versionMgr.listVersions('agent-1');
    const report = metrics.collectMetrics('agent-1', versions);

    expect(report.totalVersions).toBe(3);
    expect(report.currentVersion).toBe(3);
    expect(report.bestVersion.successRate).toBeGreaterThan(0);
    expect(report.worstVersion.successRate).toBeLessThanOrEqual(report.bestVersion.successRate);
  });

  it('rollback triggers when version underperforms', () => {
    const versionMgr = new PromptVersionManager(tmpDir);
    const rb = new PromptRollback(tmpDir);

    // Create v1 with good stats
    versionMgr.createVersion('agent-1', 'good prompt', 'initial');
    versionMgr.updateVersionStats('agent-1', 1, 'DONE');
    versionMgr.updateVersionStats('agent-1', 1, 'DONE');

    // Create v2 with bad stats
    versionMgr.createVersion('agent-1', 'bad prompt', 'experiment');
    versionMgr.updateVersionStats('agent-1', 2, 'NO_GO');
    versionMgr.updateVersionStats('agent-1', 2, 'NO_GO');
    versionMgr.updateVersionStats('agent-1', 2, 'NO_GO');

    // Check if should rollback
    const v2 = versionMgr.getVersion('agent-1', 2)!;
    expect(rb.shouldRollback('agent-1', v2.stats)).toBe(true);

    // Execute rollback
    const result = rb.rollbackPrompt('agent-1');
    expect(result).not.toBeNull();
    expect(result!.rolledBackTo).toBe(1);

    // Verify PROMPT.md is now v1 content
    const promptPath = path.join(tmpDir, '.deckent', 'agents', 'agent-1', 'PROMPT.md');
    expect(fs.readFileSync(promptPath, 'utf-8')).toBe('good prompt');
  });

  it('full pipeline: analyze -> version -> experiment -> metrics -> rollback', () => {
    const adaptive = new AdaptiveAgent();
    const versionMgr = new PromptVersionManager(tmpDir);
    const abTester = new PromptABTester(tmpDir);
    const rb = new PromptRollback(tmpDir);
    const metrics = new PromptMetrics();

    // 1. Create initial version
    versionMgr.createVersion('agent-1', '# Original Prompt', 'initial');
    versionMgr.updateVersionStats('agent-1', 1, 'DONE');
    versionMgr.updateVersionStats('agent-1', 1, 'DONE');

    // 2. Analyze: poor recent results
    const results: ResultEntry[] = [
      { evaluation: 'NO_GO', coverage: 30, sprintId: 'sprint-029' },
      { evaluation: 'NO_GO', coverage: 25, sprintId: 'sprint-030' },
    ];
    const analysis = adaptive.analyzePromptEffectiveness('agent-1', results);
    expect(analysis.needsImprovement).toBe(true);

    // 3. Suggest and create new version
    const diff = adaptive.suggestPromptChange('agent-1', '# Original Prompt', analysis.weaknesses);
    versionMgr.createVersion('agent-1', diff.suggested, diff.reasoning);

    // 4. Start A/B experiment
    const exp = abTester.createExperiment('agent-1', '# Original Prompt', diff.suggested);
    abTester.recordResult(exp.id, 'A', 'DONE', 85, 'sprint-031');
    abTester.recordResult(exp.id, 'B', 'NO_GO', 30, 'sprint-031');
    abTester.recordResult(exp.id, 'A', 'DONE', 90, 'sprint-032');
    abTester.recordResult(exp.id, 'B', 'NO_GO', 25, 'sprint-032');

    // 5. Analyze experiment
    const expAnalysis = abTester.analyzeExperiment(exp.id);
    expect(expAnalysis.winner).toBe('A');

    // 6. Collect metrics
    const versions = versionMgr.listVersions('agent-1');
    const report = metrics.collectMetrics('agent-1', versions, exp);
    expect(report.experimentStatus).toBe('active');
    expect(report.totalVersions).toBe(2);

    // 7. Format report
    const formatted = metrics.formatMetricsReport(report);
    expect(formatted).toContain('agent-1');

    // 8. Rollback is available
    expect(rb.canRollback('agent-1')).toBe(true);
  });

  it('adaptive agent detects multiple weakness types', () => {
    const adaptive = new AdaptiveAgent();

    const results: ResultEntry[] = [
      { evaluation: 'NO_GO', coverage: 10, sprintId: 'sprint-001' },
      { evaluation: 'NO_GO', coverage: 15, sprintId: 'sprint-001' },
      { evaluation: 'GO_WITH_TECH_DEBT', coverage: 40, sprintId: 'sprint-002' },
      { evaluation: 'GO_WITH_TECH_DEBT', coverage: 45, sprintId: 'sprint-003' },
    ];

    const analysis = adaptive.analyzePromptEffectiveness('agent-1', results);
    expect(analysis.needsImprovement).toBe(true);
    // Should detect at least NO_GO rate and low coverage
    expect(analysis.weaknesses.length).toBeGreaterThanOrEqual(2);
  });

  it('version pruning works when creating many versions', () => {
    const versionMgr = new PromptVersionManager(tmpDir);

    for (let i = 0; i < 12; i++) {
      versionMgr.createVersion('agent-1', `prompt v${i + 1}`, `version ${i + 1}`);
    }

    const versions = versionMgr.listVersions('agent-1');
    expect(versions.length).toBe(10);
    expect(versions[0]!.version).toBe(3); // v1 and v2 pruned
  });
});
