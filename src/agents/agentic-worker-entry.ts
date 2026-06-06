// ═══ agentic-worker-entry — subprocess shim for the Ollama harness (T-233-002) ═══
//
// Thin subprocess wrapper that the OllamaAdapter launches per task. Reads the
// task JSON, drives the agentic loop (`agentic-worker-runner.ts`, T-233-001)
// with real fs/network deps, and writes the structured `.result` Brain reads.
//
// Spec §3.1.2: this file is intentionally narrow. Everything substantive —
// system prompt, tool dispatch, scope guard, termination matrix — lives in
// the runner. The shim only:
//   1. Parses `argv = [taskId, model, host]`.
//   2. Writes EXECUTING heartbeat.
//   3. Reads `.tasks/task-{id}.json`.
//   4. Calls the runner with the task scope / goNogo.
//   5. Writes `.tasks/task-{id}.result` in the api-surface format.
//   6. Writes terminal heartbeat (DONE / NO_GO).
//   7. Exits 0 on DONE/GO_WITH_TECH_DEBT, 1 on NO_GO / thrown error.
//
// The exported `runWorkerEntry` is dependency-injectable (runner, fetchImpl)
// so tests can verify the task.json → .result flow without spawning subprocesses
// or hitting the network. The CLI shim at the bottom only fires when the file
// is launched directly (canonical ESM main-guard) — importing it in tests is safe.

import { fileURLToPath } from 'node:url';
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
} from 'node:fs';
import { join } from 'node:path';

import {
  runAgenticWorker,
  type AgenticRunnerOptions,
  type AgenticRunnerResult,
  type SelfAssessment,
} from './agentic-worker-runner.js';

// ─── Constants ──────────────────────────────────────────────────────────────

const TASKS_DIR_NAME = '.tasks';

// ─── Types ──────────────────────────────────────────────────────────────────

interface TaskJson {
  id?: string;
  description?: string;
  scope?: {
    directories?: string[];
    filesRead?: string[];
    filesWrite?: string[];
  };
  goNogo?: {
    goCriteria?: string;
    noGoCriteria?: string;
    techDebtAcceptable?: string;
  };
}

/** api-surface `.result` shape — keep field names + types stable for Brain. */
export interface EntryResultFile {
  taskId: string;
  filesChanged: string[];
  linesAdded: number;
  linesRemoved: number;
  testsPassed: boolean;
  coverage: number;
  selfAssessment: SelfAssessment;
  notes: string;
  evaluationDecision: SelfAssessment;
}

export interface RunWorkerEntryDeps {
  /** Override the runner — tests inject a scripted result; prod uses runAgenticWorker. */
  runner?: (opts: AgenticRunnerOptions) => Promise<AgenticRunnerResult>;
  /** Inject a fetch impl all the way down to the runner. */
  fetchImpl?: typeof fetch;
}

export interface RunWorkerEntryReturn {
  exitCode: number;
  resultPath: string;
  result: EntryResultFile;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function ensureTasksDir(projectDir: string): string {
  const dir = join(projectDir, TASKS_DIR_NAME);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

function writeResultFile(
  taskId: string,
  projectDir: string,
  result: EntryResultFile,
): string {
  const tasksDir = ensureTasksDir(projectDir);
  const resultPath = join(tasksDir, `task-${taskId}.result`);
  writeFileSync(resultPath, JSON.stringify(result, null, 2), 'utf-8');
  return resultPath;
}

function writeHeartbeat(
  taskId: string,
  projectDir: string,
  status: string,
  sequence: number,
  filesChangedCount: number,
): void {
  const tasksDir = ensureTasksDir(projectDir);
  const hb = {
    workerId: `ollama-${taskId}`,
    taskId,
    status,
    currentAction: 'agentic-worker-entry',
    timestamp: new Date().toISOString(),
    filesChangedCount,
    sequence,
  };
  try {
    writeFileSync(join(tasksDir, `task-${taskId}.hb`), JSON.stringify(hb, null, 2), 'utf-8');
  } catch {
    // Non-fatal: heartbeat write failure should not stop the worker.
  }
}

function buildNoGoResult(taskId: string, reason: string): EntryResultFile {
  return {
    taskId,
    filesChanged: [],
    linesAdded: 0,
    linesRemoved: 0,
    testsPassed: false,
    coverage: 0,
    selfAssessment: 'NO_GO',
    notes: reason,
    evaluationDecision: 'NO_GO',
  };
}

function buildResultFromRunner(runResult: AgenticRunnerResult): EntryResultFile {
  return {
    taskId: runResult.taskId,
    filesChanged: runResult.filesChanged,
    // v1 placeholders — runner does not yet compute disk-diff metrics.
    // Brain can derive these via `git diff --numstat` over filesChanged.
    linesAdded: 0,
    linesRemoved: 0,
    testsPassed: runResult.testsPassed ?? false,
    coverage: 0,
    selfAssessment: runResult.selfAssessment,
    notes: runResult.notes,
    evaluationDecision: runResult.selfAssessment,
  };
}

// ─── Public entrypoint ──────────────────────────────────────────────────────

/**
 * Drive a single task end-to-end. Intended invocation:
 *   `node dist/agents/agentic-worker-entry.js <taskId> <model> <host>`
 *
 * Returns `{ exitCode, resultPath, result }` so tests can assert without
 * inspecting `process.exit`. Production CLI shim translates `exitCode` to
 * `process.exit()`.
 */
export async function runWorkerEntry(
  argv: string[],
  projectDir: string,
  deps: RunWorkerEntryDeps = {},
): Promise<RunWorkerEntryReturn> {
  const runner = deps.runner ?? runAgenticWorker;

  const taskId = argv[0];
  const model = argv[1];
  const host = argv[2];

  if (!taskId || !model || !host) {
    const reason = `agentic-worker-entry: missing argv (got [${argv.join(', ')}]; expected <taskId> <model> <host>)`;
    const fallbackId = taskId && taskId.length > 0 ? taskId : 'unknown';
    const r = buildNoGoResult(fallbackId, reason);
    const p = writeResultFile(fallbackId, projectDir, r);
    return { exitCode: 1, resultPath: p, result: r };
  }

  writeHeartbeat(taskId, projectDir, 'EXECUTING', 1, 0);

  let taskJson: TaskJson;
  try {
    const taskPath = join(projectDir, TASKS_DIR_NAME, `task-${taskId}.json`);
    const raw = readFileSync(taskPath, 'utf-8');
    taskJson = JSON.parse(raw) as TaskJson;
  } catch (err) {
    const reason = `agentic-worker-entry: failed to read task json: ${err instanceof Error ? err.message : String(err)}`;
    const r = buildNoGoResult(taskId, reason);
    const p = writeResultFile(taskId, projectDir, r);
    writeHeartbeat(taskId, projectDir, 'NO_GO', 2, 0);
    return { exitCode: 1, resultPath: p, result: r };
  }

  const runnerOpts: AgenticRunnerOptions = {
    taskId,
    model,
    host,
    prompt: taskJson.description ?? '',
    scope: {
      directories: taskJson.scope?.directories ?? [],
      filesRead: taskJson.scope?.filesRead ?? [],
      filesWrite: taskJson.scope?.filesWrite ?? [],
    },
    goNogo: {
      goCriteria: taskJson.goNogo?.goCriteria ?? '',
      noGoCriteria: taskJson.goNogo?.noGoCriteria ?? '',
      techDebtAcceptable: taskJson.goNogo?.techDebtAcceptable,
    },
    projectRoot: projectDir,
  };
  if (deps.fetchImpl) runnerOpts.fetchImpl = deps.fetchImpl;

  let runResult: AgenticRunnerResult;
  try {
    runResult = await runner(runnerOpts);
  } catch (err) {
    const reason = `agentic-worker-entry: runner threw: ${err instanceof Error ? err.message : String(err)}`;
    const r = buildNoGoResult(taskId, reason);
    const p = writeResultFile(taskId, projectDir, r);
    writeHeartbeat(taskId, projectDir, 'NO_GO', 2, 0);
    return { exitCode: 1, resultPath: p, result: r };
  }

  const result = buildResultFromRunner(runResult);
  const resultPath = writeResultFile(taskId, projectDir, result);
  writeHeartbeat(
    taskId,
    projectDir,
    result.selfAssessment === 'NO_GO' ? 'NO_GO' : 'DONE',
    2,
    result.filesChanged.length,
  );

  return {
    exitCode: result.selfAssessment === 'NO_GO' ? 1 : 0,
    resultPath,
    result,
  };
}

// ─── CLI shim (canonical ESM main-guard) ────────────────────────────────────

function isInvokedAsMain(): boolean {
  try {
    if (!process.argv[1]) return false;
    return process.argv[1] === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
}

if (isInvokedAsMain()) {
  runWorkerEntry(process.argv.slice(2), process.cwd())
    .then(({ exitCode }) => {
      process.exit(exitCode);
    })
    .catch((err: unknown) => {
      // Last-resort safety net — runWorkerEntry already writes NO_GO .result
      // on any caught error. This catch covers unhandled rejections at the
      // shim boundary so the process still terminates with a non-zero code.
      // eslint-disable-next-line no-console
      console.error('[agentic-worker-entry] fatal:', err);
      process.exit(1);
    });
}
