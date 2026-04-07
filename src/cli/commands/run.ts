import { existsSync, mkdirSync, writeFileSync, unlinkSync, createReadStream, watch as fsWatch } from 'node:fs';
import { join } from 'node:path';
import type { Command } from 'commander';
import type { ModelType, TaskResult, Task } from '../../core/types.js';
import { TaskStatus, ALL_MODELS } from '../../core/types.js';
import { TASKS_DIR } from '../../core/constants.js';
import { buildWorkerPrompt } from '../../orchestra/brain.js';
import { resolveAgentPrompt, resolveSkillPrompts } from '../../orchestra/sprint-controller.js';
import { print, printError } from '../helpers/output.js';
import { resolveProjectRoot } from '../helpers/process.js';
import { spawnWorkerMultiProvider } from './spawn.js';

// ─── Types ──────────────────────────────────────────────────────────

export interface RunCommandOpts {
  model?: string;
  scope?: string;
  timeout?: string;
  keep?: boolean;
  autoApprove?: boolean;
  verbose?: boolean;
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

/**
 * E) Read the worker heartbeat file. Returns null if file missing or malformed.
 */
export function readHeartbeat(projectRoot: string, taskId: string): { sequence: number; status: string; timestamp: string } | null {
  const hbPath = join(projectRoot, TASKS_DIR, `task-${taskId}.hb`);
  if (!existsSync(hbPath)) return null;
  try {
    const data = readJsonSafe<{ sequence?: number; status?: string; timestamp?: string }>(hbPath);
    if (!data) return null;
    return {
      sequence: data.sequence ?? 0,
      status: data.status ?? 'UNKNOWN',
      timestamp: data.timestamp ?? new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

/**
 * D) Wait for the task result file using fs.watch for instant detection.
 * Falls back to 5s polling if fs.watch is unavailable.
 * E) Also monitors the heartbeat to detect stale workers.
 */
export async function waitForRunResult(
  projectRoot: string,
  taskId: string,
  timeoutMs: number,
): Promise<TaskResult | null> {
  const resultPath = join(projectRoot, TASKS_DIR, `task-${taskId}.result`);
  const tasksDir = join(projectRoot, TASKS_DIR);

  // Check immediately first
  if (existsSync(resultPath)) {
    return readJsonSafe<TaskResult>(resultPath);
  }

  return new Promise<TaskResult | null>((resolve) => {
    let watcher: ReturnType<typeof fsWatch> | null = null;
    let fallbackTimer: ReturnType<typeof setInterval> | null = null;
    let timeoutTimer: ReturnType<typeof setTimeout> | null = null;
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    let lastHbSeq = -1;
    let staleCount = 0;
    const STALE_THRESHOLD = 3;

    const cleanup = (): void => {
      watcher?.close();
      if (fallbackTimer !== null) clearInterval(fallbackTimer);
      if (timeoutTimer !== null) clearTimeout(timeoutTimer);
      if (heartbeatTimer !== null) clearInterval(heartbeatTimer);
    };

    const checkResult = (): void => {
      if (existsSync(resultPath)) {
        cleanup();
        resolve(readJsonSafe<TaskResult>(resultPath));
      }
    };

    // E) Heartbeat monitoring — detect stale workers
    const checkHeartbeat = (): void => {
      const hb = readHeartbeat(projectRoot, taskId);
      if (!hb) return;
      if (hb.sequence === lastHbSeq) {
        staleCount++;
        if (staleCount >= STALE_THRESHOLD) checkResult();
      } else {
        lastHbSeq = hb.sequence;
        staleCount = 0;
      }
    };

    timeoutTimer = setTimeout(() => { cleanup(); resolve(null); }, timeoutMs);
    heartbeatTimer = setInterval(checkHeartbeat, 30_000);

    // D) Use fs.watch for instant result detection
    mkdirSync(tasksDir, { recursive: true });
    try {
      watcher = fsWatch(tasksDir, { persistent: false }, (_event, filename) => {
        if (filename === `task-${taskId}.result`) checkResult();
      });
      watcher.on('error', () => {
        watcher?.close();
        watcher = null;
        fallbackTimer = setInterval(checkResult, 5_000);
      });
    } catch {
      fallbackTimer = setInterval(checkResult, 5_000);
    }
  });
}

/**
 * Stream worker log file to stdout until the result file appears or timeout.
 */
export async function streamWorkerLog(
  projectRoot: string,
  taskId: string,
  timeoutMs: number,
): Promise<void> {
  const logPath = join(projectRoot, TASKS_DIR, `task-${taskId}.log`);
  const resultPath = join(projectRoot, TASKS_DIR, `task-${taskId}.result`);
  const pollInterval = 500;
  const startTime = Date.now();

  // Wait for log file to appear (up to min(10s, timeoutMs/2))
  const logWaitMax = Math.min(10_000, Math.floor(timeoutMs / 2));
  let waited = 0;
  while (!existsSync(logPath) && waited < logWaitMax) {
    await sleep(500);
    waited += 500;
  }

  if (!existsSync(logPath)) return;

  let offset = 0;
  while (Date.now() - startTime < timeoutMs) {
    if (existsSync(logPath)) {
      const stream = createReadStream(logPath, { start: offset, encoding: 'utf-8' });
      await new Promise<void>((resolve) => {
        stream.on('data', (chunk) => {
          process.stdout.write(chunk as string);
          offset += Buffer.byteLength(chunk as string, 'utf-8');
        });
        stream.on('end', resolve);
        stream.on('error', resolve);
      });
    }
    if (existsSync(resultPath)) break;
    await sleep(pollInterval);
  }
}

// ─── Command Registration ────────────────────────────────────────────

export function registerRun(program: Command): void {
  program
    .command('run <description>')
    .description('Run a single one-shot task without a sprint cycle')
    .option('--model <model>', `Model to use (default: sonnet). Options: ${ALL_MODELS.join(', ')}`, 'sonnet')
    .option('--scope <dir>', 'Worker scope directory (default: ./)', './')
    .option('--timeout <ms>', 'Maximum wait time in milliseconds (default: 300000)', '300000')
    .option('--keep', 'Keep task files after completion (skip cleanup)')
    .option('--auto-approve', 'Pass auto-approve flag to the worker')
    .option('--verbose', 'Stream worker log output to stdout in real-time')
    .action(async (description: string, opts: RunCommandOpts) => {
      const root = resolveProjectRoot();
      const model = (opts.model ?? 'sonnet') as ModelType;
      const scopeDir = opts.scope ?? './';
      const timeoutMs = opts.timeout ? parseInt(opts.timeout, 10) : 300_000;
      const keepFiles = opts.keep ?? false;
      const autoApprove = true; // Deckent standard: workers MUST have full write permissions
      const verbose = opts.verbose ?? false;

      if (!(ALL_MODELS as readonly string[]).includes(model)) {
        printError(new Error(`Invalid model: ${model}. Must be one of: ${ALL_MODELS.join(', ')}`));
        process.exitCode = 1;
        return;
      }

      if (isNaN(timeoutMs) || timeoutMs <= 0) {
        printError(new Error(`Invalid timeout value: ${opts.timeout}`));
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
      if (timeoutMs !== 300_000) print(`Timeout: ${timeoutMs}ms`);

      try {
        // Resolve agent and skill prompts if available (task may have assignedAgent/assignedSkills)
        const agentPrompt = resolveAgentPrompt(root, task as Task);
        const skillPrompts = resolveSkillPrompts(root, task as Task);

        // Spawn worker via appropriate backend based on model's provider
        const prompt = buildWorkerPrompt(task, agentPrompt, skillPrompts);
        const { backend } = spawnWorkerMultiProvider(taskId, model, prompt, root, { autoApprove });
        print(`Worker spawned via ${backend} (w-${taskId})`);

        // Stream logs or wait for result
        if (verbose) {
          print('--- Worker output ---');
          await streamWorkerLog(root, taskId, timeoutMs);
          print('--- End of worker output ---');
        }

        // Wait for result
        print('Waiting for result...');
        const result = await waitForRunResult(root, taskId, timeoutMs);

        if (!result) {
          print('Task timed out without producing a result.');
          if (!keepFiles) cleanupRunTask(root, taskId);
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

        // Cleanup (unless --keep)
        if (!keepFiles) {
          cleanupRunTask(root, taskId);
        } else {
          print(`Task files preserved (--keep): task-${taskId}.*`);
        }

        // Exit code
        if (assessment === 'DONE' || assessment === 'GO_WITH_TECH_DEBT') {
          process.exitCode = 0;
        } else {
          process.exitCode = 1;
        }
      } catch (error) {
        if (!keepFiles) cleanupRunTask(root, taskId);
        printError(error);
        process.exitCode = 1;
      }
    });
}

