import { spawnSync } from 'node:child_process';
import { writeFileSync, unlinkSync, mkdirSync, existsSync, renameSync } from 'node:fs';
import { join, basename } from 'node:path';
import { randomBytes } from 'node:crypto';
import type { ModelType } from '../core/types.js';
import type { ProviderAdapter } from '../core/provider.js';
import { debugLog } from '../core/utils.js';
import { validateTaskId } from '../core/validators.js';
import { modelRegistry } from '../core/model-registry.js';
import type { RegistryProviderName } from '../core/model-registry.js';
import { resolveReasoningEffort } from '../core/reasoning-effort.js';
import { getProviderCommandSpec, buildProviderCommand } from '../core/provider-command-spec.js';
import { installGitGuard, resolveHostGitPath, buildGitGuardPathExport, buildGitGuardDir } from './git-worker-guard.js';
import {
  TMUX_SESSION_NAME,
  TMUX_AUDITOR_WINDOW,
  TMUX_WORKER_PREFIX,
  TASKS_DIR,
} from '../core/constants.js';

// ─── SpawnOptions ───────────────────────────────────────────────────
export interface SpawnOptions {
  allowedTools?: string;
  autoApprove?: boolean;
  /** F1-RE: native model reasoning-effort (e.g. claude `--effort high`). Opt-in. */
  reasoningEffort?: string;
  /** F3.1: add claude `--exclude-dynamic-system-prompt-sections` (prefix-stable cache). Opt-in. */
  excludeDynamicPromptSections?: boolean;
  /** 7094-F3 (flag-gated): worker core for `claude --bare --system-prompt-file`. */
  systemPromptCore?: string;
}

// ─── TmuxError ──────────────────────────────────────────────────────
export class TmuxError extends Error {
  constructor(
    message: string,
    public readonly command?: string,
  ) {
    super(message);
    this.name = 'TmuxError';
  }
}

// ─── Internal Helpers ───────────────────────────────────────────────

function run(args: string[]): string {
  const result = spawnSync('tmux', args, { encoding: 'utf-8' });
  if (result.status !== 0) {
    const cmd = `tmux ${args.join(' ')}`;
    throw new TmuxError(
      result.stderr?.trim() || `tmux command failed with status ${result.status}`,
      cmd,
    );
  }
  return (result.stdout ?? '').trim();
}

function workerWindowName(taskId: string): string {
  return `${TMUX_WORKER_PREFIX}${taskId}`;
}

/**
 * Write prompt to a temp file and pass via stdin redirection.
 * This eliminates shell injection risk — no prompt content is ever
 * interpreted by the shell.
 *
 * Sprint 168 C0e Cross-Backend Contract: tmpfiles persist until sprint cleanup,
 * archived together by archivePromptFiles() during sprint cleanup phase.
 * (Same lifecycle as Docker backend spawn-backend-docker.ts:941-942 — Sprint 156 Task 4.)
 *
 * Sprint 170 P0-3 (ADR-048 §Negative closure): when taskId is provided the filename
 * mirrors the Docker convention: `.prompt-${taskId}-${hash}.txt`. This lets
 * `ClaudeAdapter._cleanupOrphanedPromptFiles()` — which filters via
 * `file.includes(\`-\${id}-\`)` — protect active tmux worker prompts the same way
 * it protects Docker prompts. Auditor (no taskId) keeps the legacy hex-only name.
 */
function writePromptFile(projectRoot: string, prompt: string, taskId?: string): string {
  const tmpDir = join(projectRoot, TASKS_DIR);
  if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true });
  const id = randomBytes(8).toString('hex');
  const filename = taskId ? `.prompt-${taskId}-${id}.txt` : `.prompt-${id}.txt`;
  const promptPath = join(tmpDir, filename);
  writeFileSync(promptPath, prompt, 'utf-8');
  return promptPath;
}

/** Exported for testing */
export function cleanupPromptFile(promptPath: string): void {
  try { unlinkSync(promptPath); } catch (e) { debugLog('cleanupPromptFile:unlinkSync', e); }
}

/**
 * Archive an orphaned prompt tmpfile instead of deleting it (F0.3).
 *
 * The (prompt → result) pair is the unit the training-trace pipeline consumes;
 * deleting the prompt mid-sprint — on kill()/health-check, before the sprint-end
 * archivePromptFiles() runs — systematically destroyed the prompt half (every
 * pre-F0.3 sprint archive had zero worker prompts). Moving it to a sprint-agnostic
 * `.tasks/archive/_orphaned/` staging bucket preserves it, and makes a stale-hb
 * misclassification (a still-running worker's prompt cleaned early) NON-destructive
 * rather than a permanent loss. The sprint-end archivePromptFiles() drains this
 * bucket into the sprint dir, so it inherits the same retention. Best-effort:
 * falls back to unlink only if the move itself fails, and never throws.
 */
export function archiveOrphanPromptFile(promptPath: string, tasksDir: string): void {
  try {
    const stagingDir = join(tasksDir, 'archive', '_orphaned');
    if (!existsSync(stagingDir)) mkdirSync(stagingDir, { recursive: true });
    renameSync(promptPath, join(stagingDir, basename(promptPath)));
  } catch (e) {
    debugLog('archiveOrphanPromptFile:rename', e);
    try { unlinkSync(promptPath); } catch (e2) { debugLog('archiveOrphanPromptFile:unlink', e2); }
  }
}

/** @deprecated Use adaptive timeout via brainEstimateTimeout() + SpawnBackendOptions.taskTimeoutSeconds instead. Kept for backward compat fallback. */
export const WORKER_TIMEOUT_SECONDS = 1200;

// ─── Provider→CLI Resolution (TMUX-PROVIDER-CLI, 364-003) ─────────────
//
// born-481 parity (Yasa #2 / 364-002): TmuxBackend.spawn() (spawn-backend.ts)
// calls spawnWorker()/buildWorkerCommand() with NO ProviderAdapter, so every
// task routed onto `spawn_backend: 'tmux'` (still supported — see
// resolveBackend()) used to hit a hardcoded `claude -p - --model <apiId>`
// build regardless of the model's actual provider — a codex-provider task's
// apiId (e.g. gpt-5.5) would be fed to the `claude` CLI's `--model` flag,
// exactly the bug 364-002 fixed for SubprocessBackend.
//
// Fix: resolve the CLI-binary + flag table FROM THE PROVIDER, reusing
// PROVIDER_COMMAND_SPECS (core/provider-command-spec.ts) — the SAME shared
// selection-table spawn-backend.ts (364-002) and spawn-backend-docker.ts
// already consume, imported here rather than re-implemented — so tmux,
// docker, and subprocess can never drift apart on provider→CLI mapping.
// Unlike SubprocessSpawnBackend, buildWorkerCommand() already receives
// promptFilePath directly, so buildProviderCommand() can be used generically
// for ANY registered provider (stdin or inline promptFeed), not just codex.

/**
 * Build the worker-CLI invocation for a model when no ProviderAdapter is
 * supplied. 'claude' keeps the exact pre-364-003 hardcoded shape
 * (byte-identical — PROVIDER_COMMAND_SPECS.claude's baseArgs additionally
 * carry `--output-format json`, which would change the historical claude
 * tmux command). Every other registered provider is built from the shared
 * PROVIDER_COMMAND_SPECS table. An unregistered provider (e.g. ollama,
 * host-only) is an honest TmuxError — never a silent claude-CLI fallback.
 */
function buildProviderWorkerCommand(
  model: ModelType,
  promptFilePath: string,
  opts?: SpawnOptions,
): string {
  const definition = modelRegistry.get(model);
  if (!definition) throw new TmuxError(`E_UNKNOWN_MODEL: ${model}`);
  const provider = definition.provider;

  if (provider === 'claude') {
    // Default: Claude CLI syntax (backward compat)
    // Use stdin redirection from file — no shell metacharacter risk
    let cmd = `claude -p - --model ${definition.apiId}`;
    if (opts?.allowedTools) {
      // allowedTools is a controlled string (never user input)
      cmd += ` --allowedTools '${opts.allowedTools}'`;
    }
    if (opts?.autoApprove) {
      cmd += ' --dangerously-skip-permissions';
    }
    // F1-RE: native reasoning-effort, opt-in + validated against claude's vocabulary.
    const effort = resolveReasoningEffort('claude', opts?.reasoningEffort);
    if (effort) {
      cmd += ` --effort ${effort}`;
    }
    // F3.1: stabilize the system-prompt prefix (per-machine sections → first user
    // message) for cross-spawn cache reuse. Default system prompt only — deckent
    // never passes --system-prompt, so the flag always applies here.
    if (opts?.excludeDynamicPromptSections) {
      cmd += ' --exclude-dynamic-system-prompt-sections';
    }
    cmd += ` < ${promptFilePath}`;
    return cmd;
  }

  const spec = getProviderCommandSpec(provider);
  if (!spec) {
    throw new TmuxError(
      `No worker-CLI mapping for provider "${provider}" (no ProviderCommandSpec registered) `
      + `— refusing to silently spawn the claude CLI for a mismatched provider (Yasa #2 / born-481 parity).`,
    );
  }

  const apiId = definition.apiId;
  let cmd = buildProviderCommand(spec, apiId, promptFilePath, {
    allowedTools: opts?.allowedTools,
    autoApprove: opts?.autoApprove,
    reasoningEffort: resolveReasoningEffort(provider, opts?.reasoningEffort),
    excludeDynamicPromptSections: opts?.excludeDynamicPromptSections,
  });
  // PSL-1 convention (spawn-backend-docker.ts): 'stdin' providers pipe the
  // prompt file in; 'inline' providers (gemini) already embed it via
  // buildProviderCommand()'s PROMPT_CAT_TOKEN substitution.
  if (spec.promptFeed === 'stdin') {
    cmd += ` < ${promptFilePath}`;
  }
  return cmd;
}

/**
 * Build the shell command to invoke a worker.
 * If a ProviderAdapter is supplied, delegates to adapter.buildCommand().
 * Otherwise falls back to the default Claude CLI syntax wrapped with a
 * `timeout` guard. When the timeout fires, a `.timeout` marker file is
 * written so result-collector can detect the failure immediately.
 */
export function buildWorkerCommand(
  model: ModelType,
  promptFilePath: string,
  opts?: SpawnOptions,
  adapter?: ProviderAdapter,
  taskId?: string,
  timeoutSeconds?: number,
): string {
  const definition = modelRegistry.get(model);
  if (!definition) throw new TmuxError(`E_UNKNOWN_MODEL: ${model}`);
  // Delegate to provider adapter when available
  if (adapter) {
    if (adapter.name !== definition.provider) {
      throw new TmuxError(
        `E_MODEL_PROVIDER_MISMATCH: model=${model} provider=${definition.provider} adapter=${adapter.name}`,
      );
    }
    return adapter.buildCommand(definition.apiId as ModelType, promptFilePath, {
      allowedTools: opts?.allowedTools,
      autoApprove: opts?.autoApprove,
      reasoningEffort: opts?.reasoningEffort,
      excludeDynamicPromptSections: opts?.excludeDynamicPromptSections,
    });
  }

  // Validate taskId if provided — it gets interpolated into shell commands and file paths
  if (taskId) {
    validateTaskId(taskId);
  }

  let cmd = buildProviderWorkerCommand(model, promptFilePath, opts);

  // Wrap with timeout + EXIT trap — guarantees .result file is ALWAYS written.
  // Without this, workers can exit without writing .result (crash, permission error, etc.)
  // causing the entire sprint to stall waiting for a result that will never come.
  const tSec = timeoutSeconds ?? WORKER_TIMEOUT_SECONDS;
  if (tSec > 0 && taskId) {
    const tasksDir = join(promptFilePath, '..'); // .tasks/ dir (prompt is inside .tasks/)
    const resultFile = join(tasksDir, `task-${taskId}.result`);
    const timeoutMarker = join(tasksDir, `task-${taskId}.timeout`);
    const fallbackJson = JSON.stringify({
      taskId, workerId: `w-${taskId}`, filesChanged: [], linesAdded: 0,
      linesRemoved: 0, testsPassed: false, coverage: 0,
      selfAssessment: 'NO_GO', notes: 'Worker exited without writing result file',
    });
    // RFILE env var avoids nested quoting issues; trap fires on ANY exit (normal, crash, timeout)
    // Use single-quoted JSON to prevent bash brace expansion on { }
    const trap = `RFILE=${resultFile}; trap '[ -f $RFILE ] || echo '"'"'${fallbackJson}'"'"' > $RFILE' EXIT`;
    // born-466 parity (spawn-backend-docker.ts): -k 30 hard-KILLs a TERM-swallowing
    // worker; the exit code is captured explicitly instead of being masked by a
    // blind `|| echo`. The .timeout marker is timeout-PURE — only 124 (TERM-timeout)
    // / 137 (KILL) qualify, and never when a real .result already exists.
    cmd = `${trap}; timeout -k 30 ${tSec} sh -c '${cmd.replace(/'/g, "'\\''")}'; CLAUDE_EXIT=$?; if [ "$CLAUDE_EXIT" -eq 124 ] || [ "$CLAUDE_EXIT" -eq 137 ]; then [ ! -f "${resultFile}" ] && echo "WORKER_TIMEOUT" > "${timeoutMarker}"; fi`;
  }
  return cmd;
}

/** @deprecated Use buildWorkerCommand instead. Kept for backward compatibility. */
export const buildClaudeCommand = buildWorkerCommand;

// ─── Public API ─────────────────────────────────────────────────────

export function isSessionActive(): boolean {
  const result = spawnSync('tmux', ['has-session', '-t', TMUX_SESSION_NAME], {
    encoding: 'utf-8',
  });
  return result.status === 0;
}

export function ensureSession(): void {
  if (isSessionActive()) return;
  run(['new-session', '-d', '-s', TMUX_SESSION_NAME]);
}

export function spawnWorker(
  taskId: string,
  model: ModelType,
  prompt: string,
  projectDir: string,
  opts?: SpawnOptions & { taskTimeoutSeconds?: number },
  adapter?: ProviderAdapter,
): void {
  validateTaskId(taskId);
  const windowName = workerWindowName(taskId);
  run([
    'new-window',
    '-t', TMUX_SESSION_NAME,
    '-n', windowName,
    '-c', projectDir,
  ]);
  const promptPath = writePromptFile(projectDir, prompt, taskId);
  const cmd = buildWorkerCommand(model, promptPath, opts, adapter, taskId, opts?.taskTimeoutSeconds);
  // WORKER-GIT-GUARD (381-001): shadow `git` with a denylist shim for this
  // worker's tmux window (stash/reset/checkout/clean/rebase/commit/revert ->
  // exit 97). Host real-git resolved via a PATH scan (no spawnSync — tmux.ts
  // is a no-new-spawnSync hot-path file, see git-worker-guard.ts).
  const gitGuardDir = buildGitGuardDir(taskId);
  installGitGuard(gitGuardDir, resolveHostGitPath());
  const guardedCmd = `${buildGitGuardPathExport(gitGuardDir)}; ${cmd}`;
  run([
    'send-keys',
    '-t', `${TMUX_SESSION_NAME}:${windowName}`,
    guardedCmd,
    'Enter',
  ]);

  // Capture worker output to a log file via pipe-pane
  const logPath = join(projectDir, TASKS_DIR, `task-${taskId}.log`);
  run([
    'pipe-pane',
    '-t', `${TMUX_SESSION_NAME}:${windowName}`,
    '-o',
    `cat >> ${logPath}`,
  ]);
}

export function killWorker(taskId: string): void {
  validateTaskId(taskId);
  const windowName = workerWindowName(taskId);
  run(['kill-window', '-t', `${TMUX_SESSION_NAME}:${windowName}`]);
}

/**
 * Kill all active worker windows. Returns the count of workers killed.
 * Individual kill failures are swallowed so one bad window does not abort the rest.
 */
export function killAllWorkers(): number {
  const workers = listWorkers();
  let killed = 0;
  for (const taskId of workers) {
    try {
      killWorker(taskId);
      killed++;
    } catch {
      // best-effort: skip failed individual kills
    }
  }
  return killed;
}

/**
 * @internal Lists active worker windows in tmux. Used only within orchestra/.
 * Not part of the public API surface.
 */
export function listWorkers(): string[] {
  try {
    const output = run([
      'list-windows',
      '-t', TMUX_SESSION_NAME,
      '-F', '#{window_name}',
    ]);
    if (!output) return [];
    return output
      .split('\n')
      .filter((name) => name.startsWith(TMUX_WORKER_PREFIX))
      .map((name) => name.slice(TMUX_WORKER_PREFIX.length));
  } catch {
    return [];
  }
}

function windowExists(windowName: string): boolean {
  const result = spawnSync('tmux', [
    'list-windows', '-t', TMUX_SESSION_NAME, '-F', '#{window_name}',
  ], { encoding: 'utf-8' });
  if (result.status !== 0) return false;
  return (result.stdout ?? '').split('\n').some(name => name.trim() === windowName);
}

/**
 * @internal Used only within orchestra/ — spawns auditor in a tmux window.
 * Not part of the public API surface.
 */
export function startAuditor(projectDir: string, opts?: SpawnOptions, adapter?: ProviderAdapter): void {
  if (!windowExists(TMUX_AUDITOR_WINDOW)) {
    run([
      'new-window',
      '-t', TMUX_SESSION_NAME,
      '-n', TMUX_AUDITOR_WINDOW,
      '-c', projectDir,
    ]);
  }
  const promptPath = writePromptFile(projectDir, 'auditor');
  const provider = adapter?.name as RegistryProviderName | undefined;
  const model = provider
    ? modelRegistry.getByProviderAndTier(provider, 'standard')
    : modelRegistry.getByTier('standard').find(candidate => candidate.status === 'ga');
  if (!model) throw new TmuxError(`E_AUDITOR_MODEL_UNAVAILABLE: provider=${provider ?? 'registry'}`);
  const cmd = buildWorkerCommand(model.id as ModelType, promptPath, opts, adapter);
  run([
    'send-keys',
    '-t', `${TMUX_SESSION_NAME}:${TMUX_AUDITOR_WINDOW}`,
    cmd,
    'Enter',
  ]);
}

export function attach(): void {
  spawnSync('tmux', ['attach', '-t', TMUX_SESSION_NAME], {
    encoding: 'utf-8',
    stdio: 'inherit',
  });
}

export function destroy(): void {
  try {
    run(['kill-session', '-t', TMUX_SESSION_NAME]);
  } catch (e) {
    debugLog('destroy:killSession', e);
  }
}

/**
 * Kill all deckent tmux sessions. Called on SIGINT for graceful shutdown.
 * Equivalent to destroy() but named explicitly for SIGINT/interrupt use cases.
 */
export function killAllSessions(): void {
  try {
    run(['kill-session', '-t', TMUX_SESSION_NAME]);
  } catch (e) {
    debugLog('killAllSessions:killSession', e);
  }
}

/**
 * Sprint 177 Task 177-003 — full tmux socket cleanup for `deckent kill --all`.
 *
 * Sprint 176 evidence: after `deckent kill --all`, the deckent tmux session was
 * gone but the on-disk socket file (`$TMUX_TMPDIR/tmux-<uid>/deckent`, default
 * `/tmp/tmux-<uid>/deckent`) survived, leaving a re-attach surface that could
 * resurrect a stale server. This helper:
 *
 *   1. Calls `tmux kill-session -t deckent` (idempotent — safe if session is gone).
 *   2. Removes the residual socket file so no client can re-attach.
 *
 * Fail-safe: any spawn / fs error is swallowed (logged via debugLog) so the
 * cascade never aborts on a missing tmux binary or read-only /tmp.
 */
export function cleanupTmuxSocket(): void {
  // 1. kill-session — bypass `run()` because we don't want to throw on
  //    "session not found"; that's the success case for cleanup.
  try {
    spawnSync('tmux', ['kill-session', '-t', TMUX_SESSION_NAME], {
      encoding: 'utf-8',
      timeout: 5_000,
    });
  } catch (e) {
    debugLog('cleanupTmuxSocket:killSession', e);
  }

  // 2. Remove the socket file. tmux stores sockets at
  //    $TMUX_TMPDIR/tmux-<uid>/<session-name> (default $TMUX_TMPDIR=/tmp).
  try {
    const uid = typeof process.getuid === 'function' ? process.getuid() : 0;
    const baseDir = process.env.TMUX_TMPDIR ?? '/tmp';
    const socketPath = join(baseDir, `tmux-${uid}`, TMUX_SESSION_NAME);
    if (existsSync(socketPath)) {
      unlinkSync(socketPath);
    }
  } catch (e) {
    debugLog('cleanupTmuxSocket:unlinkSocket', e);
  }
}

/**
 * @internal Sends keys to a tmux pane. Used only within orchestra/.
 * Not part of the public API surface.
 */
export function sendKeys(target: string, keys: string): void {
  run([
    'send-keys',
    '-t', `${TMUX_SESSION_NAME}:${target}`,
    keys,
    'Enter',
  ]);
}

export function setupWatchWindow(sessionName: string, projectRoot: string): void {
  const watchWindow = 'watch';

  // Check if watch window already exists
  const hasWindow = spawnSync('tmux', [
    'list-windows', '-t', sessionName, '-F', '#{window_name}',
  ], { encoding: 'utf-8' });

  if (!hasWindow.stdout?.includes(watchWindow)) {
    spawnSync('tmux', [
      'new-window', '-t', sessionName, '-n', watchWindow,
      `watch -n 2 cat ${join(projectRoot, '.dashboard')}`,
    ], { encoding: 'utf-8' });

    spawnSync('tmux', [
      'split-window', '-t', `${sessionName}:${watchWindow}`, '-h', '-p', '40',
      `watch -n 3 "ls -la ${join(projectRoot, '.tasks')}/*.hb 2>/dev/null | tail -20"`,
    ], { encoding: 'utf-8' });
  }
}

export function createWatchLayout(projectRoot: string): void {
  const watchWindow = 'watch';

  // Check if watch window already exists
  if (!windowExists(watchWindow)) {
    // Create new window with dashboard watch
    run([
      'new-window', '-t', TMUX_SESSION_NAME, '-n', watchWindow,
      `watch -n 2 cat ${join(projectRoot, '.dashboard')}`,
    ]);

    // Split right pane (40%) for worker heartbeat list
    spawnSync('tmux', [
      'split-window', '-t', `${TMUX_SESSION_NAME}:${watchWindow}`, '-h', '-p', '40',
      `watch -n 3 "ls -la ${join(projectRoot, '.tasks')}/*.hb 2>/dev/null | tail -20"`,
    ], { encoding: 'utf-8' });
  }

  // Select watch window and attach
  spawnSync('tmux', ['select-window', '-t', `${TMUX_SESSION_NAME}:${watchWindow}`], {
    encoding: 'utf-8',
  });
  spawnSync('tmux', ['attach-session', '-t', TMUX_SESSION_NAME], {
    encoding: 'utf-8',
    stdio: 'inherit',
  });
}

export function attachToWorkerPane(taskId: string): void {
  validateTaskId(taskId);
  const windowName = workerWindowName(taskId);

  // Check if worker window exists
  if (!windowExists(windowName)) {
    throw new TmuxError(`Worker window ${windowName} not found`);
  }

  spawnSync('tmux', ['select-window', '-t', `${TMUX_SESSION_NAME}:${windowName}`], {
    encoding: 'utf-8',
  });
  spawnSync('tmux', ['attach-session', '-t', TMUX_SESSION_NAME], {
    encoding: 'utf-8',
    stdio: 'inherit',
  });
}
