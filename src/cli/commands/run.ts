import { existsSync, mkdirSync, writeFileSync, unlinkSync, createReadStream, watch as fsWatch } from 'node:fs';
import { join } from 'node:path';
import type { Command } from 'commander';
import type { ModelType, TaskResult } from '../../core/types.js';
import { TaskStatus, ALL_MODELS } from '../../core/types.js';
import { TASKS_DIR } from '../../core/constants.js';
import { buildWorkerPrompt } from '../../orchestra/brain.js';
import { resolveAgentPrompt, resolveSkillPrompts } from '../../orchestra/sprint-controller.js';
import { print, printError } from '../helpers/output.js';
import { resolveProjectRoot } from '../helpers/process.js';
import { spawnWorkerMultiProvider } from './spawn.js';
import { loadConfig } from '../../core/config.js';
import { buildExecutionRequest, resolveToTask } from '../../orchestra/execution-request-builder.js';

// ─── Types ──────────────────────────────────────────────────────────

export interface RunCommandOpts {
  model?: string;
  /** F1-RE (268-003): native model reasoning-effort level (`--model-effort`). */
  modelEffort?: string;
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

import { readJsonSafe, debugLog } from '../../core/utils.js';
import { AgentPoolManager } from '../../core/agent-pool.js';
import { SkillPoolManager } from '../../core/skill-pool.js';
import { detectProjectStack } from '../../core/stack-detector.js';
import { routeTaskV2 } from '../../core/routing-engine.js';
import type { UserOverride } from '../../core/routing-types.js';
import { normalizeTaskResultShape } from '../../core/task-result-schema.js';
import { getMessage, getLanguage } from '../helpers/messages.js';

let _runTaskCounter = 0;
export function createRunTaskId(): string {
  return `run-${Date.now()}-${_runTaskCounter++}`;
}

/**
 * @deprecated WM-1: superseded by `buildExecutionRequest` + `resolveToTask`
 * (orchestra/execution-request-builder.ts), which set `task.type` + the canonical
 * fields. No production caller remains (all 3 paths migrated); retained only for
 * existing test fixtures. Remove + migrate those fixtures when the test window reopens.
 */
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
    return normalizeTaskResultShape(readJsonSafe<TaskResult>(resultPath));
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
        resolve(normalizeTaskResultShape(readJsonSafe<TaskResult>(resultPath)));
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
  const runCmd = program
    .command('run')
    .argument('<description>')
    .description('Run a single one-shot task without a sprint cycle')
    .option('--model <model>', `Model to use (default: sonnet). Options: ${ALL_MODELS.join(', ')}`, 'sonnet')
    .option('--model-effort <level>', 'Native model reasoning-effort (claude: low|medium|high|xhigh|max, codex: minimal|low|medium|high). Opt-in; unsupported/invalid levels are ignored')
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
      // CLI/MCP parity (ADR-022-V2, born-561): honor the --auto-approve flag —
      // commander leaves opts.autoApprove undefined when absent, so this
      // normalizes to a strict boolean, default false — same semantics as
      // `deckent start` / deckent_start.
      const autoApprove = opts.autoApprove === true;
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
      // WM-1: unify on the canonical ExecutionRequest contract — sets task.type
      // (TaskKind) + resolves provider from config + tags origin='cli'.
      const cfg = await loadConfig(root).catch(() => undefined);
      const execReq = buildExecutionRequest({
        description,
        model: model as ModelType,
        // F1-RE (268-003): forward --model-effort into the canonical request so
        // task.modelEffort is set (resolveToTask) and spawn emits the flag.
        modelEffort: opts.modelEffort,
        scope: { directories: [scopeDir] },
        projectRoot: root,
        config: cfg,
        autoApprove,
        origin: 'cli',
        timeoutMs,
      });
      const task = resolveToTask(execReq, taskId);

      // WM-1b: V2 routing — assign the right agent + skills (fail-safe: any error keeps 'generic')
      try {
        const routingVersion = cfg?.routing_engine ?? 'v2';
        if (routingVersion === 'v2') {
          const agentPool = new AgentPoolManager(root);
          const pool = agentPool.loadAgents();
          const projectStack = detectProjectStack(root);
          const skillPool = new SkillPoolManager(root);
          const skills = skillPool.loadSkills();

          const overrides: UserOverride[] = [];
          if (task.forceAgent || task.forceSkills || task.excludeSkills || task.excludeAgent) {
            overrides.push({
              source: 'task-directive',
              forceAgent: task.forceAgent,
              forceSkills: task.forceSkills,
              excludeSkills: task.excludeSkills,
              excludeAgents: task.excludeAgent,
              priority: 3,
            });
          }

          const decision = routeTaskV2(task, pool, skills, {
            projectStack,
            overrides,
            learningData: [],
            config: cfg ? { ...cfg.routing_config, agentMinScore: cfg.agent_min_score } : undefined,
            // ADR-075 (343-007): thread the skill→agent affinity flag. Default-off →
            // option is false → byte-identical routing (engine already guards on it).
            skillAgentAffinity: cfg?.routing?.skill_agent_affinity ?? false,
            sprintId: '',
            taskId: task.id,
            projectRoot: root,
          });

          task.assignedAgent = decision.agentId ?? 'generic';
          task.assignedSkills = decision.skillIds;
        }
      } catch (routingErr) {
        debugLog('run:routing', `V2 routing failed, using generic fallback: ${routingErr}`);
      }

      // Write task file
      const tasksDir = join(root, TASKS_DIR);
      mkdirSync(tasksDir, { recursive: true });
      writeFileSync(join(tasksDir, `task-${taskId}.json`), JSON.stringify(task, null, 2), 'utf-8');

      print(`Running task ${taskId} (model: ${model}, scope: ${scopeDir})`);
      print(`Description: ${description}`);
      if (timeoutMs !== 300_000) print(`Timeout: ${timeoutMs}ms`);

      try {
        // Resolve agent and skill prompts if available (task may have assignedAgent/assignedSkills)
        const agentPrompt = await resolveAgentPrompt(root, task);
        const skillPrompts = await resolveSkillPrompts(root, task);

        // Spawn worker via config-aware backend (provider resolved in the request)
        const prompt = buildWorkerPrompt(task, agentPrompt, skillPrompts);
        const { backend } = await spawnWorkerMultiProvider(taskId, model, prompt, root, {
          autoApprove,
          spawnBackend: cfg?.spawn_backend,
          dockerImage: cfg?.docker_image,
          dockerTimeout: cfg?.docker_timeout,
          provider: execReq.provider,
          // F1-RE (268-003): task.modelEffort (from --model-effort) is validated
          // per-provider inside spawnWorkerMultiProvider via resolveReasoningEffort.
          modelEffort: task.modelEffort,
        });
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

  // ── RUN-RENAME dilim-1 (Alperen 2026-07-06, ADR-G-024): `run start|status|retro|history`
  // aliases delegate to the EXACT top-level lifecycle commands (same handlers, no copies).
  // The legacy one-shot `run "<description>"` signature above is untouched — a first
  // positional that is not one of these four reserved names still runs a single task.
  const RUN_ALIAS_TARGETS = ['start', 'status', 'retro', 'history'] as const;
  for (const target of RUN_ALIAS_TARGETS) {
    runCmd
      .command(target)
      .description(getMessage('run.alias_note', getLanguage(undefined)))
      .argument('[args...]')
      // passThroughOptions would demand enablePositionalOptions on the SHARED
      // root program (global parse-semantics change — too risky). Empirically
      // verified: allowUnknownOption + variadic capture keeps raw tokens in
      // order inside this.args, so the delegated parse reproduces the exact
      // handler+options of the top-level command.
      .allowUnknownOption()
      .allowExcessArguments()
      .action(async function (this: Command) {
        await program.parseAsync([target, ...this.args], { from: 'user' });
      });
  }
}

