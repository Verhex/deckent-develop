// ─── Mock Spawn Backend ───────────────────────────────────────────────────
// Simulates worker execution for E2E testing.
// Workers instantly write .result files without actually running Claude CLI.
// Supports DONE, GO_WITH_TECH_DEBT, NO_GO, and TIMEOUT scenarios.

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { ModelType } from '../core/types.js';
import { TASKS_DIR } from '../core/constants.js';
import type { SpawnBackend, SpawnBackendOptions } from './spawn-backend.js';

// ─── Mock Scenario ────────────────────────────────────────────────────────

export type MockScenario = 'DONE' | 'GO_WITH_TECH_DEBT' | 'NO_GO' | 'TIMEOUT';

export interface MockWorkerConfig {
  /** Default scenario for all workers */
  defaultScenario?: MockScenario;
  /** Per-task scenario overrides */
  taskScenarios?: Record<string, MockScenario>;
  /** Delay before writing result (ms, default: 100) */
  delayMs?: number;
}

// ─── Mock Spawn Backend ───────────────────────────────────────────────────

export class MockSpawnBackend implements SpawnBackend {
  readonly name = 'mock';

  private readonly projectDir: string;
  private readonly config: MockWorkerConfig;
  private readonly activeWorkers = new Set<string>();

  constructor(projectDir: string, config?: MockWorkerConfig) {
    this.projectDir = projectDir;
    this.config = config ?? { defaultScenario: 'DONE' };
  }

  spawn(taskId: string, model: ModelType, _prompt: string, opts?: SpawnBackendOptions): void {
    const dir = opts?.projectDir ?? this.projectDir;
    const tasksDir = join(dir, TASKS_DIR);
    mkdirSync(tasksDir, { recursive: true });

    this.activeWorkers.add(taskId);

    const scenario = this.config.taskScenarios?.[taskId] ?? this.config.defaultScenario ?? 'DONE';
    const delay = this.config.delayMs ?? 100;

    // Write heartbeat immediately
    writeFileSync(join(tasksDir, `task-${taskId}.hb`), JSON.stringify({
      workerId: `mock-${taskId}`,
      taskId,
      status: 'EXECUTING',
      sequence: 1,
      timestamp: new Date().toISOString(),
      backend: 'mock',
    }, null, 2), 'utf-8');

    // Simulate worker execution with delay
    setTimeout(() => {
      if (scenario === 'TIMEOUT') {
        // Write .timeout marker
        writeFileSync(join(tasksDir, `task-${taskId}.timeout`), 'mock_timeout', 'utf-8');
      } else {
        // Write .result file
        const result = {
          taskId,
          filesChanged: scenario === 'NO_GO' ? [] : [`src/mock-${taskId}.ts`],
          linesAdded: scenario === 'NO_GO' ? 0 : 42,
          linesRemoved: scenario === 'NO_GO' ? 0 : 5,
          testsPassed: scenario !== 'NO_GO',
          coverage: scenario === 'DONE' ? 95 : scenario === 'GO_WITH_TECH_DEBT' ? 70 : 0,
          selfAssessment: scenario,
          notes: `Mock worker: ${scenario} for task ${taskId} (model: ${model})`,
        };
        writeFileSync(join(tasksDir, `task-${taskId}.result`), JSON.stringify(result, null, 2), 'utf-8');
      }

      // Update heartbeat to DONE
      writeFileSync(join(tasksDir, `task-${taskId}.hb`), JSON.stringify({
        workerId: `mock-${taskId}`,
        taskId,
        status: scenario === 'TIMEOUT' ? 'TIMEOUT' : 'DONE',
        sequence: 99,
        timestamp: new Date().toISOString(),
        backend: 'mock',
      }, null, 2), 'utf-8');

      this.activeWorkers.delete(taskId);
    }, delay);
  }

  kill(taskId: string): void {
    this.activeWorkers.delete(taskId);
  }

  list(): string[] {
    return [...this.activeWorkers];
  }

  async isAvailable(): Promise<boolean> {
    return true; // Mock is always available
  }
}
