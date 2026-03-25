import { existsSync, mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import type { Command } from 'commander';
import type { ModelType, TaskResult } from '../../core/types.js';
import { TaskStatus, ALL_MODELS } from '../../core/types.js';
import { TASKS_DIR } from '../../core/constants.js';
import { ensureSession, spawnWorker } from '../../orchestra/tmux.js';
import { buildWorkerPrompt } from '../../orchestra/brain.js';
import { print, printError } from '../helpers/output.js';
import { resolveProjectRoot } from '../helpers/process.js';

// ─── Types ──────────────────────────────────────────────────────────

export interface RunCommandOpts {
  model?: string;
  scope?: string;
}

export interface SingleTaskResult {
  taskId: string;
  selfAssessment: string;
  testsPassed: boolean;
  filesChanged: string[];
  notes: string;
}

// ─── Helpers ────────────────────────────────────────────────────────

function now(): string {
  return new Date().toISOString();
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

import { readJsonSafe } from '../../core/utils.js';

let _runTaskCounter = 0;
export function createRunTaskId(): string {
  return `run-${Date.now()}-${_runTaskCounter++}`;
}

export function buildRunTask(
  taskId: string,
  description: string,
  model: ModelType,
  scopeDir: string,
) {
  return {
    id: taskId,
    title: description.slice(0, 80),
    description,
    model,
    effort: 'normal' as const,
    priority: 'NORMAL' as const,
    reason: 'One-shot run command',
    scope: {
      directories: [scopeDir],
      filesRead: [],
      filesWrite: [],
    },
    dependencies: [],
    goNogo: {
      goCriteria: 'Task completed successfully',
      noGoCriteria: 'Task failed or errored',
      techDebtAcceptable: 'Minor issues acceptable',
    },
    status: TaskStatus.PENDING,
    createdAt: now(),
  };
}

export function cleanupRunTask(projectRoot: string, taskId: string): void {
  const extensions = ['.json', '.hb', '.result', '.plan', '.log'];
  for (const ext of extensions) {
    const filePath = join(projectRoot, TASKS_DIR, `task-${taskId}${ext}`);
    if (existsSync(filePath)) {
      try { unlinkSync(filePath); } catch { /* ignore */ }
    }
  }
}

export async function waitForRunResult(
  projectRoot: string,
  taskId: string,
  timeoutMs: number,
): Promise<TaskResult | null> {
  const resultPath = join(projectRoot, TASKS_DIR, `task-${taskId}.result`);
  const pollInterval = 5_000;
  const startTime = Date.now();

  // Check immediately first
  if (existsSync(resultPath)) {
    return readJsonSafe<TaskResult>(resultPath);
  }

  while (Date.now() - startTime < timeoutMs) {
    const remaining = timeoutMs - (Date.now() - startTime);
    await sleep(Math.min(pollInterval, remaining));
    if (existsSync(resultPath)) {
      return readJsonSafe<TaskResult>(resultPath);
    }
  }

  return null;
}

// ─── Command Registration ────────────────────────────────────────────

export function registerRun(program: Command): void {
  program
    .command('run <description>')
    .description('Run a single one-shot task without a sprint cycle')
    .option('--model <model>', 'Model to use (default: sonnet). Options: opus, sonnet, haiku, gpt-4.1, o3, o4-mini, gemini-2.5-pro, gemini-2.5-flash', 'sonnet')
    .option('--scope <dir>', 'Worker scope directory (default: ./)', './')
    .action(async (description: string, opts: RunCommandOpts) => {
      const root = resolveProjectRoot();
      const model = (opts.model ?? 'sonnet') as ModelType;
      const scopeDir = opts.scope ?? './';

      if (!(ALL_MODELS as readonly string[]).includes(model)) {
        printError(new Error(`Invalid model: ${model}. Must be one of: ${ALL_MODELS.join(', ')}`));
        process.exitCode = 1;
        return;
      }

      const taskId = createRunTaskId();
      const task = buildRunTask(taskId, description, model, scopeDir);

      // Write task file
      const tasksDir = join(root, TASKS_DIR);
      mkdirSync(tasksDir, { recursive: true });
      writeFileSync(join(tasksDir, `task-${taskId}.json`), JSON.stringify(task, null, 2), 'utf-8');

      print(`Running task ${taskId} (model: ${model}, scope: ${scopeDir})`);
      print(`Description: ${description}`);

      try {
        // Spawn worker
        ensureSession();
        const prompt = buildWorkerPrompt(task);
        spawnWorker(taskId, model, prompt, root, { autoApprove: false });
        print(`Worker spawned in tmux window w-${taskId}`);

        // Wait for result
        const timeoutMs = 5 * 60 * 1000; // 5 minutes
        print('Waiting for result...');
        const result = await waitForRunResult(root, taskId, timeoutMs);

        if (!result) {
          print('Task timed out without producing a result.');
          cleanupRunTask(root, taskId);
          process.exitCode = 1;
          return;
        }

        // Report
        const assessment = result.selfAssessment ?? 'NO_GO';
        print(`\nResult: ${assessment}`);
        if (result.notes) print(`Notes: ${result.notes}`);
        if (result.filesChanged?.length) {
          print(`Files changed: ${result.filesChanged.join(', ')}`);
        }
        print(`Tests passed: ${result.testsPassed ? 'yes' : 'no'}`);

        // Cleanup
        cleanupRunTask(root, taskId);

        // Exit code
        if (assessment === 'DONE' || assessment === 'GO_WITH_TECH_DEBT') {
          process.exitCode = 0;
        } else {
          process.exitCode = 1;
        }
      } catch (error) {
        cleanupRunTask(root, taskId);
        printError(error);
        process.exitCode = 1;
      }
    });
}
