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
import { spawn } from 'node:child_process';

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

/**
 * Token-usage block written to `.result`. Matches api-surface.md `tokenUsage`.
 * `cacheReadTokens` is 0 for Ollama (no remote cache); kept for shape parity
 * with claude/codex .result files Brain ingests.
 */
export interface EntryTokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  provider: string;
  model: string;
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
  tokenUsage: EntryTokenUsage;
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

function zeroTokenUsage(model: string): EntryTokenUsage {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    provider: 'ollama',
    model,
  };
}

function buildNoGoResult(
  taskId: string,
  reason: string,
  model: string,
): EntryResultFile {
  return {
    taskId,
    filesChanged: [],
    linesAdded: 0,
    linesRemoved: 0,
    testsPassed: false,
    coverage: 0,
    selfAssessment: 'NO_GO',
    notes: reason,
    tokenUsage: zeroTokenUsage(model),
    evaluationDecision: 'NO_GO',
  };
}

/**
 * Count lines in a file from disk (newline-delimited). Treats a trailing
 * newline as not adding an extra line. Used for the new-untracked-file
 * fallback when `git diff --numstat` omits files that don't yet exist in HEAD.
 */
function countFileLines(absPath: string): number {
  try {
    const content = readFileSync(absPath, 'utf-8');
    if (content.length === 0) return 0;
    const trimmed = content.endsWith('\n') ? content.slice(0, -1) : content;
    if (trimmed.length === 0) return 0;
    return trimmed.split('\n').length;
  } catch {
    return 0;
  }
}

interface NumstatResult {
  linesAdded: number;
  linesRemoved: number;
  /** Set when git is unavailable, not a repo, or numstat failed; appended honestly to notes. */
  diffNote?: string;
}

/**
 * Run `git diff --numstat HEAD -- <files>` from `projectRoot` (async spawn —
 * spawnSync is FORBIDDEN per hermetic rules) and sum +/- columns. Files in
 * `filesChanged` not seen in numstat output (new untracked files) fall back
 * to a disk line-count as `linesAdded`. If git is missing, the directory is
 * not a repo, or any spawn error fires, returns zeros plus a `diffNote` so the
 * caller can fold an honest reason into `.result.notes` (no silent debt).
 */
export function computeNumstat(
  projectRoot: string,
  filesChanged: string[],
): Promise<NumstatResult> {
  if (filesChanged.length === 0) {
    return Promise.resolve({ linesAdded: 0, linesRemoved: 0 });
  }
  return new Promise<NumstatResult>(resolve => {
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(
        'git',
        ['diff', '--numstat', 'HEAD', '--', ...filesChanged],
        { cwd: projectRoot, stdio: ['ignore', 'pipe', 'pipe'] },
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      resolve({
        linesAdded: 0,
        linesRemoved: 0,
        diffNote: `git diff --numstat unavailable (spawn error): ${msg}; linesAdded/Removed defaulted to 0`,
      });
      return;
    }
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (d: Buffer | string) => { stdout += String(d); });
    child.stderr?.on('data', (d: Buffer | string) => { stderr += String(d); });
    child.on('error', (err: Error) => {
      resolve({
        linesAdded: 0,
        linesRemoved: 0,
        diffNote: `git diff --numstat unavailable (${err.message}); linesAdded/Removed defaulted to 0`,
      });
    });
    child.on('close', (code: number | null) => {
      if (code !== 0) {
        resolve({
          linesAdded: 0,
          linesRemoved: 0,
          diffNote: `git diff --numstat exited ${code ?? 'null'}: ${stderr.slice(0, 200).trim() || 'not a git repo or no HEAD'}; linesAdded/Removed defaulted to 0`,
        });
        return;
      }
      let added = 0;
      let removed = 0;
      const seen = new Set<string>();
      for (const rawLine of stdout.split('\n')) {
        const line = rawLine.trim();
        if (!line) continue;
        const parts = line.split('\t');
        if (parts.length < 3) continue;
        const a = Number(parts[0]);
        const r = Number(parts[1]);
        if (Number.isFinite(a)) added += a;
        if (Number.isFinite(r)) removed += r;
        seen.add(parts[2] ?? '');
      }
      // New (untracked) files don't show in `git diff HEAD` — fall back to
      // counting the file on disk as fully added so honest line totals reach
      // Brain even on greenfield writes.
      for (const f of filesChanged) {
        if (seen.has(f)) continue;
        added += countFileLines(join(projectRoot, f));
      }
      resolve({ linesAdded: added, linesRemoved: removed });
    });
  });
}

async function buildResultFromRunner(
  runResult: AgenticRunnerResult,
  projectDir: string,
  model: string,
): Promise<EntryResultFile> {
  const { linesAdded, linesRemoved, diffNote } = await computeNumstat(
    projectDir,
    runResult.filesChanged,
  );
  const notes = diffNote
    ? `${runResult.notes}\n[diff] ${diffNote}`
    : runResult.notes;
  return {
    taskId: runResult.taskId,
    filesChanged: runResult.filesChanged,
    linesAdded,
    linesRemoved,
    testsPassed: runResult.testsPassed ?? false,
    coverage: 0,
    selfAssessment: runResult.selfAssessment,
    notes,
    tokenUsage: {
      // Runner always sets tokenUsage (every return path); the `??` is a seam
      // for legacy/partial test mocks that pre-date T-234-002.
      inputTokens: runResult.tokenUsage?.inputTokens ?? 0,
      outputTokens: runResult.tokenUsage?.outputTokens ?? 0,
      cacheReadTokens: 0,
      provider: runResult.tokenUsage?.provider ?? 'ollama',
      model,
    },
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
    const r = buildNoGoResult(fallbackId, reason, model ?? 'unknown');
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
    const r = buildNoGoResult(taskId, reason, model);
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
    const r = buildNoGoResult(taskId, reason, model);
    const p = writeResultFile(taskId, projectDir, r);
    writeHeartbeat(taskId, projectDir, 'NO_GO', 2, 0);
    return { exitCode: 1, resultPath: p, result: r };
  }

  const result = await buildResultFromRunner(runResult, projectDir, model);
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
