// ─── Docker Spawn Backend ─────────────────────────────────────────────────
// Spawns workers in isolated Docker containers.
// Each worker gets its own filesystem namespace — no cross-worker interference.
// Results collected via shared .tasks/ volume mount.

import { spawnSync, spawn as nodeSpawn } from 'node:child_process';
import { writeFileSync, readFileSync, mkdirSync, existsSync, unlinkSync, openSync, fsyncSync, closeSync, readdirSync, renameSync, rmdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { homedir, totalmem } from 'node:os';
import type { ModelType } from '../core/types.js';
import { getProviderForModel, UnknownModelError } from '../core/task-types.js';
import { TASKS_DIR } from '../core/constants.js';
import { debugLog } from '../core/utils.js';
import {
  acquireSpawnLocks,
  releaseAllSpawnLocks,
  releaseStaleSpawnLocksForTask,
  SpawnLockError,
} from '../core/file-lock.js';
import { markPending, markActive, clearPending } from '../core/active-workers.js';
import type { SpawnBackend, SpawnBackendOptions } from './spawn-backend.js';
import { SpawnBackendError } from './spawn-backend.js';

// ─── Constants ────────────────────────────────────────────────────────────

const DEFAULT_IMAGE = 'deckent-worker:latest';
/** @deprecated Use adaptive timeout via brainEstimateTimeout() + SpawnBackendOptions.taskTimeoutSeconds instead. Kept for backward compat fallback. */
const DEFAULT_TIMEOUT_SECONDS = 1200; // 20 minutes
const CONTAINER_WORKSPACE = '/workspace';
const DEFAULT_GRACEFUL_TIMEOUT_SECONDS = 15;
const CONTAINER_PREFIX = 'deckent-w-';

/**
 * Sprint 191 T-001: WSL2-safe memory defaults. Pre-191 hardcoded `8g/12g` proved
 * OOM-hostile on WSL2 hosts (~12-14GB total); cut to 4g/6g to break the exit-137
 * cycle. Cross-checked with `.deckent/config.json` worker_memory_limit/swap.
 */
export const DEFAULT_WORKER_MEMORY_LIMIT = '4g';
export const DEFAULT_WORKER_MEMORY_SWAP = '6g';

/**
 * Sprint 191 T-001: pure helper to normalize docker memory strings (e.g. `4g`,
 * `4096m`, `4194304k`, `0.5g`, `4294967296`, `4294967296b`) into bytes for
 * comparison. Returns null for malformed/missing/non-positive input.
 *
 * Exported for unit tests; backend internals use it to guard against config
 * drift between `--memory` and `--memory-swap`.
 */
export function parseMemoryString(value: string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  const match = trimmed.match(/^([0-9]*\.?[0-9]+)\s*([kmgtb]?)$/i);
  if (!match) return null;
  const num = Number.parseFloat(match[1]!);
  if (!Number.isFinite(num) || num <= 0) return null;
  const unit = (match[2] ?? '').toLowerCase();
  const multipliers: Record<string, number> = {
    '': 1,
    b: 1,
    k: 1024,
    m: 1024 ** 2,
    g: 1024 ** 3,
    t: 1024 ** 4,
  };
  const mul = multipliers[unit];
  if (mul === undefined) return null;
  return Math.floor(num * mul);
}

// ─── Sprint 163 T-002: Health Check + Retry Policy ──────────────────────────
// container_start_failed previously masked four distinct failure modes
// (image-missing, port-collision, resource-limit, instant-exit-success).
// We retry transient failures up to MAX_SPAWN_ATTEMPTS times and surface a
// stable error code so Brain/Auditor can act on it.

/** How long to wait (ms) after `docker run -d` before inspecting state. */
export const HEALTH_CHECK_DELAY_MS = 3_000;
/** Maximum number of spawn attempts (1 = no retry). */
export const MAX_SPAWN_ATTEMPTS = 2;
/** Delay (ms) between consecutive spawn attempts. */
export const SPAWN_RETRY_DELAY_MS = 5_000;

/** Stable error codes for container_start_failed root causes. */
export const DOCKER_ERROR_CODES = {
  IMAGE_NOT_FOUND: 'DECKENT_E081',
  PORT_COLLISION: 'DECKENT_E082',
  RESOURCE_LIMIT: 'DECKENT_E083',
  UNKNOWN: 'DECKENT_E084',
} as const;

export type DockerErrorCode = (typeof DOCKER_ERROR_CODES)[keyof typeof DOCKER_ERROR_CODES];

// Sprint 194 T-004 (W-M M-2): tell V8 inside the worker container to size its
// max old-space heap as a percentage of the container's memory cgroup, rather
// than the host RAM. Requires Node ≥20.6 (`--max-old-space-size-percentage`
// landed in Node 20.6; Deckent runtime is Node ≥24).
export const WORKER_NODE_OPTIONS = 'NODE_OPTIONS=--max-old-space-size-percentage=75';

/**
 * Returns the CLI binary name for a given model.
 * Ollama is HTTP-based and not available in Docker containers — falls back to 'claude'.
 * Unknown models also fall back to 'claude' as a safe default.
 */
export function getProviderBinaryForModel(model: ModelType): string {
  let provider: string;
  try {
    provider = getProviderForModel(model);
  } catch (e) {
    if (e instanceof UnknownModelError) {
      provider = 'claude';
    } else {
      throw e;
    }
  }
  if (provider === 'codex') return 'codex';
  if (provider === 'gemini') return 'gemini';
  // ollama is HTTP-based; Docker containers use claude CLI as fallback
  return 'claude';
}

// Sprint 196 T-196-003 (WP-5): Anthropic prompt-cache identity forwarded to
// the worker container via env. `buildWorkerPrompt()` (task-builder.ts)
// embeds `<!--DECKENT_CACHE_KEY:<hex>-->` at the head of the prompt; we
// extract it here without a cross-module import so this backend stays
// independent of orchestra/task-builder. The regex is intentionally a literal
// duplicate of `PROMPT_CACHE_KEY_MARKER_RE` in task-builder.ts — if the format
// ever changes, both sites must be updated.
const PROMPT_CACHE_KEY_MARKER_RE = /<!--DECKENT_CACHE_KEY:([a-f0-9]{16,64})-->/;

/**
 * Pull the embedded prompt-cache identity tag out of a worker prompt string.
 * Returns the hex key when present, undefined otherwise. Inspects only the
 * first 512 chars (the marker is always at the head of the prompt) so this
 * is O(1) regardless of prompt size.
 */
export function extractPromptCacheKey(prompt: string): string | undefined {
  if (!prompt) return undefined;
  const m = PROMPT_CACHE_KEY_MARKER_RE.exec(prompt.slice(0, 512));
  return m?.[1];
}

/** Result of a single health-check inspect call. */
export interface HealthCheckResult {
  /** Container is running normally — proceed with monitor. */
  healthy: boolean;
  /** Container started then exited with code 0 (gracefully). */
  instantExitSuccess: boolean;
  /** Exit code reported by docker inspect, -1 if inspect failed entirely. */
  exitCode: number;
  /** Raw inspect stdout (debug). */
  raw: string;
}

/**
 * Classify a docker stderr blob into a stable error code.
 * Pure function — exported for unit tests.
 */
export function classifyDockerError(stderr: string, exitCode: number): {
  code: DockerErrorCode;
  message: string;
} {
  const s = (stderr ?? '').toLowerCase();
  if (
    s.includes('pull access denied') ||
    s.includes('image not found') ||
    s.includes('unable to find image') ||
    s.includes('no such image') ||
    s.includes('manifest unknown')
  ) {
    return {
      code: DOCKER_ERROR_CODES.IMAGE_NOT_FOUND,
      message: `${DOCKER_ERROR_CODES.IMAGE_NOT_FOUND}: Docker image bulunamadı`,
    };
  }
  if (
    s.includes('port is already allocated') ||
    s.includes('address already in use') ||
    s.includes('bind: address already in use') ||
    s.includes('port already in use')
  ) {
    return {
      code: DOCKER_ERROR_CODES.PORT_COLLISION,
      message: `${DOCKER_ERROR_CODES.PORT_COLLISION}: Port çakışması`,
    };
  }
  if (
    s.includes('cannot allocate memory') ||
    s.includes('resource temporarily unavailable') ||
    s.includes('no space left on device') ||
    s.includes('memory limit') ||
    s.includes('oom')
  ) {
    return {
      code: DOCKER_ERROR_CODES.RESOURCE_LIMIT,
      message: `${DOCKER_ERROR_CODES.RESOURCE_LIMIT}: Docker resource limit`,
    };
  }
  const stderrSummary = (stderr ?? '').trim().slice(0, 200);
  return {
    code: DOCKER_ERROR_CODES.UNKNOWN,
    message: `${DOCKER_ERROR_CODES.UNKNOWN}: container_start_failed (exitCode=${exitCode}, stderr=${stderrSummary})`,
  };
}

/**
 * Parse `docker inspect --format '{{.State.Running}}|{{.State.ExitCode}}'` output.
 * Format: "true|0" or "false|137". Returns null on malformed input.
 */
export function parseInspectOutput(stdout: string): { running: boolean; exitCode: number } | null {
  const trimmed = (stdout ?? '').trim();
  if (!trimmed) return null;
  const parts = trimmed.split('|');
  if (parts.length !== 2) return null;
  const runningRaw = parts[0];
  const exitCodeRaw = parts[1];
  if (runningRaw === undefined || exitCodeRaw === undefined) return null;
  const running = runningRaw.trim() === 'true';
  const exitCode = parseInt(exitCodeRaw.trim(), 10);
  if (Number.isNaN(exitCode)) return null;
  return { running, exitCode };
}

// ─── Docker Spawn Backend ─────────────────────────────────────────────────

export class DockerSpawnBackend implements SpawnBackend {
  readonly name = 'docker';

  private readonly projectDir: string;
  private readonly image: string;
  private readonly timeoutSeconds: number;
  private readonly gracefulTimeoutSeconds: number;
  private readonly memoryLimit: string;
  private readonly memorySwap: string;
  private readonly containers = new Map<string, { containerId: string; model: string }>(); // taskId → container info

  constructor(projectDir: string, opts?: { image?: string; timeoutSeconds?: number; gracefulTimeoutSeconds?: number; memoryLimit?: string; memorySwap?: string }) {
    this.projectDir = resolve(projectDir);
    this.image = opts?.image ?? DEFAULT_IMAGE;
    this.timeoutSeconds = opts?.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS;
    this.gracefulTimeoutSeconds = opts?.gracefulTimeoutSeconds ?? DEFAULT_GRACEFUL_TIMEOUT_SECONDS;
    this.memoryLimit = opts?.memoryLimit ?? DEFAULT_WORKER_MEMORY_LIMIT;
    this.memorySwap = opts?.memorySwap ?? DEFAULT_WORKER_MEMORY_SWAP;
  }

  /**
   * Spawn a worker in an isolated Docker container.
   *
   * Container setup:
   * - Project directory mounted read-only at /workspace
   * - .tasks/ mounted read-write (shared volume for results)
   * - Claude auth cache mounted read-only
   * - API keys passed as env vars if available
   * - timeout wrapper kills container after limit
   */
  spawn(taskId: string, model: ModelType, prompt: string, opts?: SpawnBackendOptions): void {
    const dir = opts?.projectDir ?? this.projectDir;
    // Adaptive timeout: prefer per-task override from brainEstimateTimeout(),
    // fall back to constructor value, then DEFAULT_TIMEOUT_SECONDS
    const effectiveTimeout = opts?.taskTimeoutSeconds ?? this.timeoutSeconds;
    const tasksDir = join(dir, TASKS_DIR);
    mkdirSync(tasksDir, { recursive: true });

    // Sprint 170 P0-5: mark as pending BEFORE prompt write + lock acquisition.
    // Bridges the ~3s race window between prompt write and .hb creation during
    // which a concurrent cleanup (sibling kill()) would see no .hb and delete
    // the new worker's prompt file. clearPending is called on all error paths.
    markPending(taskId);

    // Sprint 156 Task 10: spawn-time per-file lock acquisition.
    // Reject the spawn if any file in this task's scope.filesWrite is already
    // claimed by a different active task — prevents concurrent worker writes
    // to the same file. Acquired locks are released on container exit
    // (monitorContainer) or forced kill().
    this.acquireSpawnTimeLocks(dir, taskId);

    // Sprint 156 Task 10 (fix): every code path between here and the
    // successful handoff to monitorContainer() must release the spawn locks
    // if it fails — otherwise a transient docker error permanently blocks
    // the file scope for the next worker. monitorContainer's exit handler
    // is what releases on the happy path.
    try {
      this.runSpawn(taskId, model, prompt, opts, dir, effectiveTimeout, tasksDir);
    } catch (err) {
      clearPending(taskId);
      try { releaseAllSpawnLocks(dir, taskId); } catch (e) { debugLog('docker-backend:spawn-lock-release', e); }
      throw err;
    }
  }

  private runSpawn(
    taskId: string,
    model: ModelType,
    prompt: string,
    opts: SpawnBackendOptions | undefined,
    dir: string,
    effectiveTimeout: number,
    tasksDir: string,
  ): void {
    // Guard: verify Docker image exists before attempting spawn
    const imageCheck = spawnSync('docker', ['images', '-q', this.image], {
      encoding: 'utf-8', timeout: 5_000, stdio: ['pipe', 'pipe', 'pipe'],
    });
    if (!imageCheck.stdout?.trim()) {
      throw new SpawnBackendError(
        `Docker image '${this.image}' not found. Run: docker build -f Dockerfile.worker -t ${this.image} .`,
        'docker',
      );
    }

    // WSL2 memory warning — Docker containers share WSL2 memory pool
    if (process.platform === 'linux') {
      try {
        const procVersion = readFileSync('/proc/version', 'utf-8');
        if (procVersion.includes('microsoft') || procVersion.includes('WSL')) {
          const totalGB = Math.round(totalmem() / (1024 * 1024 * 1024));
          if (totalGB < 6) {
            debugLog('docker-backend:wsl2-memory',
              `WSL2 total memory ${totalGB}GB — Docker workers need ~4GB each. Consider increasing .wslconfig memory.`);
          }
        }
      } catch { /* /proc/version not readable — skip WSL2 check */ }
    }

    // Write prompt to shared .tasks/ volume
    // Hash-based naming: .prompt-{taskId}-{hash} for initial workers,
    // .prompt-{taskId}-{hash}-fix for fix/retry workers (isPriorityFix flag)
    const promptId = randomBytes(8).toString('hex');
    const fixSuffix = opts?.isPriorityFix ? '-fix' : '';
    const promptFileName = `.prompt-${taskId}-${promptId}${fixSuffix}.txt`;
    const promptHostPath = join(tasksDir, promptFileName);
    writeFileSync(promptHostPath, prompt, 'utf-8');

    // Build provider CLI command inside container
    const providerBinary = getProviderBinaryForModel(model);
    const claudeArgs: string[] = ['-p', '-', '--model', model];
    if (opts?.allowedTools) {
      // Double-quote the value — allowedTools contains parentheses like Write(.tasks/)
      // which sh (dash) interprets as subshell syntax without quoting
      claudeArgs.push('--allowedTools', `"${opts.allowedTools}"`);
    }
    // IMMUTABLE — Deckent standard: workers MUST have full write permissions
    claudeArgs.push('--dangerously-skip-permissions');

    const claudeCmd = `${providerBinary} ${claudeArgs.join(' ')}`;
    const resultPath = `${CONTAINER_WORKSPACE}/${TASKS_DIR}/task-${taskId}.result`;
    const timeoutPath = `${CONTAINER_WORKSPACE}/${TASKS_DIR}/task-${taskId}.timeout`;
    // Build docker run args
    // Run as host user to avoid root — Claude CLI blocks --dangerously-skip-permissions as root
    const uid = process.getuid?.() ?? 1000;
    const gid = process.getgid?.() ?? 1000;
    const home = homedir();

    // Container HOME: use /tmp/deckent-home to avoid missing host HOME directory
    // Host HOME (e.g. /home/alperen) doesn't exist in container filesystem.
    // Claude CLI needs a writable HOME for config + cache.
    const containerHome = '/tmp/deckent-home';

    // Write worker script to .tasks/ — avoids shell quoting issues with allowedTools parentheses
    const scriptFileName = `.worker-${taskId}.sh`;
    const scriptHostPath = join(tasksDir, scriptFileName);
    const hbContainerPath = `${CONTAINER_WORKSPACE}/${TASKS_DIR}/task-${taskId}.hb`;
    // Sprint 139: fsync_file helper ensures data hits disk before SIGKILL arrives.
    // Uses dd + sync as POSIX-portable fsync (no Python/perl dependency in Alpine).
    // Sprint 145: TIMEOUT_WITH_WORK EXIT trap function — detects partial work via git diff
    // When worker is killed (non-zero exit) but has modified files, writes TIMEOUT_WITH_WORK
    // result instead of blind NO_GO. Brain can then reconcile via Spurious NO_GO helper.
    const onExitFn = [
      'on_exit() {',
      '  local exit_code=$?',
      // If .result already exists (worker wrote it normally), just fsync and exit
      '  if [ -f "$RFILE" ]; then',
      '    fsync_file "$RFILE"',
      '    fsync_file "$HBFILE"',
      // Sprint 151: Clean up .partial-result — no longer needed when .result is present
      '    rm -f "$PRFILE" 2>/dev/null',
      '    kill $HB_PID 2>/dev/null',
      '    return',
      '  fi',
      // Non-zero exit: check git diff for partial work
      `  cd "${CONTAINER_WORKSPACE}" 2>/dev/null || true`,
      '  local changed_files=""',
      '  changed_files=$(git diff --name-only 2>/dev/null || true)',
      '  if [ -n "$changed_files" ] && [ "$exit_code" -ne 0 ]; then',
      // Build JSON array from changed files using pure POSIX sh (no jq dependency)
      '    local json_array="["',
      '    local first=1',
      '    local count=0',
      // Process each line — handles filenames with spaces via IFS
      '    while IFS= read -r f; do',
      '      [ -z "$f" ] && continue',
      '      count=$((count + 1))',
      '      if [ "$first" -eq 1 ]; then',
      '        first=0',
      '      else',
      '        json_array="$json_array,"',
      '      fi',
      // Escape double quotes and backslashes in filenames for valid JSON
      '      local escaped=$(printf "%s" "$f" | sed \'s/\\\\/\\\\\\\\/g; s/"/\\\\"/g\')',
      '      json_array="$json_array\\"$escaped\\""',
      '    done <<GITEOF',
      '$changed_files',
      'GITEOF',
      '    json_array="$json_array]"',
      // Sprint 149: Add signal_info for signal-killed containers
      '    local signal_info=""',
      '    [ "$exit_code" -gt 128 ] && signal_info=" signal=$((exit_code - 128))"',
      `    cat > "$RFILE" <<RESULTEOF`,
      `{"taskId":"${taskId}","selfAssessment":"TIMEOUT_WITH_WORK","filesChanged":$json_array,"exitCode":$exit_code,"notes":"Worker timeout/killed (exitCode=$exit_code$signal_info) but git diff shows $count files modified. Brain should reconcile via Spurious NO_GO helper.","tokenUsage":{"inputTokens":0,"outputTokens":0,"cacheReadTokens":0,"provider":"claude","model":"${model}"}}`,
      'RESULTEOF',
      '  else',
      // No partial work AND no result written — fall back to NO_GO
      // Sprint 150: use cat heredoc instead of echo to include signal_info + exit_code
      '    local signal_info_nw=""',
      '    [ "$exit_code" -gt 128 ] && signal_info_nw=" signal=$((exit_code - 128))"',
      `    cat > "$RFILE" <<NORESULTEOF`,
      `{"taskId":"${taskId}","workerId":"docker-${taskId}","filesChanged":[],"linesAdded":0,"linesRemoved":0,"testsPassed":false,"coverage":0,"selfAssessment":"NO_GO","exitCode":$exit_code,"notes":"Worker exited without writing result (exitCode=$exit_code$signal_info_nw)","tokenUsage":{"inputTokens":0,"outputTokens":0,"cacheReadTokens":0,"provider":"claude","model":"${model}"}}`,
      'NORESULTEOF',
      '  fi',
      '  fsync_file "$RFILE"',
      '  fsync_file "$HBFILE"',
      // Sprint 151: Clean up .partial-result — EXIT trap wrote a proper .result
      '  rm -f "$PRFILE" 2>/dev/null',
      '  kill $HB_PID 2>/dev/null',
      '}',
    ].join('\n');

    // Sprint 151: .partial-result path — intermediate checkpoint for OOM kill recovery
    const partialResultPath = `${CONTAINER_WORKSPACE}/${TASKS_DIR}/task-${taskId}.partial-result`;
    const scriptContent = [
      '#!/bin/sh',
      `RFILE="${resultPath}"`,
      `HBFILE="${hbContainerPath}"`,
      `PRFILE="${partialResultPath}"`,
      // POSIX-portable fsync: copy file to itself via dd conv=fsync
      // This forces OS buffer cache → disk. Survives SIGKILL after return.
      'fsync_file() { [ -f "$1" ] && dd if="$1" of="$1.fsync" bs=4096 conv=fsync 2>/dev/null && mv "$1.fsync" "$1" 2>/dev/null; }',
      // Sprint 145: git-diff-aware EXIT trap function
      onExitFn,
      // Ensure session-env exists (Claude CLI requires it)
      `mkdir -p "${containerHome}/.claude" 2>/dev/null || true`,
      `touch "${containerHome}/.claude/session-env" 2>/dev/null || true`,
      // Sprint 151: Write .partial-result BEFORE Claude CLI starts — OOM kill safety net.
      // If container is SIGKILL'd (OOM), this file survives on the shared volume.
      // Host-side monitorContainer promotes it to .result with NO_GO_PARTIAL assessment.
      `cat > "$PRFILE" <<PARTIALEOF`,
      `{"taskId":"${taskId}","selfAssessment":"NO_GO","notes":"Worker started but did not complete — partial-result written at startup. If you see this, the container was likely OOM-killed or force-stopped before Claude CLI could write a .result.","partialMarker":true,"tokenUsage":{"inputTokens":0,"outputTokens":0,"cacheReadTokens":0,"provider":"claude","model":"${model}"}}`,
      'PARTIALEOF',
      'fsync_file "$PRFILE"',
      // EXIT trap: Sprint 145 — calls on_exit() which detects partial work via git diff
      'trap on_exit EXIT',
      // SIGTERM trap: on graceful stop, fsync .result immediately (before grace period expires)
      `trap 'fsync_file "$RFILE"; fsync_file "$HBFILE"; exit 0' TERM`,
      // Heartbeat update loop (every 15s) — prevents false stale alerts
      `( SEQ=2; while true; do sleep 15; SEQ=$((SEQ+1)); echo "{\\"workerId\\":\\"docker-${taskId}\\",\\"taskId\\":\\"${taskId}\\",\\"status\\":\\"EXECUTING\\",\\"sequence\\":$SEQ,\\"timestamp\\":\\"$(date -u +%Y-%m-%dT%H:%M:%S.000Z)\\",\\"backend\\":\\"docker\\"}" > "$HBFILE"; done ) &`,
      'HB_PID=$!',
      `TIMEOUT=\${TASK_TIMEOUT:-${effectiveTimeout}}`,
      `timeout $TIMEOUT ${claudeCmd} < "${CONTAINER_WORKSPACE}/${TASKS_DIR}/${promptFileName}" || echo "WORKER_TIMEOUT" > "${timeoutPath}"`,
      // Sprint 151: Clean up .partial-result on normal exit — on_exit/EXIT trap handles abnormal exit
      'rm -f "$PRFILE" 2>/dev/null',
    ].join('\n');
    writeFileSync(scriptHostPath, scriptContent, { mode: 0o755 });

    const containerCmd = `sh ${CONTAINER_WORKSPACE}/${TASKS_DIR}/${scriptFileName}`;

    const containerName = `${CONTAINER_PREFIX}${taskId}`;

    // Per-task auth mode override (Sprint 193+: feedback_container_auth_precedence wire).
    // task.authMode === 'api' → skip ~/.claude mount, REQUIRE ANTHROPIC_API_KEY in env.
    // Anything else (undefined/'subscription') → default subscription behavior.
    const taskAuthMode = this.readTaskAuthMode(dir, taskId);
    const useApiOnly = taskAuthMode === 'api';
    if (useApiOnly && !process.env.ANTHROPIC_API_KEY) {
      throw new SpawnBackendError(
        `Task ${taskId} declares "Auth: api" but ANTHROPIC_API_KEY is not set in env. ` +
        `Either set the env var or change the task to "Auth: subscription".`,
        'docker',
      );
    }

    const dockerArgs: string[] = [
      'run', '-d',
      '--name', containerName,
      // Run as host user (non-root) — required for --dangerously-skip-permissions
      '--user', `${uid}:${gid}`,
      // HOME must point to a directory that EXISTS in the container
      '-e', `HOME=${containerHome}`,
      // Memory limits — Claude CLI peak ~4-6GB (Sprint 166 Bug G OOM forensic), 8g + 12g headroom
      '--memory', this.memoryLimit,
      '--memory-swap', this.memorySwap,
      // Writable HOME via tmpfs — Claude CLI needs to write config/cache here
      '--tmpfs', `${containerHome}:size=100m,uid=${uid},gid=${gid}`,
      // Project mounted read-write — workers need to create/edit files in scope
      '-v', `${dir}:${CONTAINER_WORKSPACE}`,
      // .tasks/ mounted read-write (results, heartbeats, prompts)
      '-v', `${tasksDir}:${CONTAINER_WORKSPACE}/${TASKS_DIR}`,
      // .locks/ mounted read-write (file locking)
      '-v', `${join(dir, '.locks')}:${CONTAINER_WORKSPACE}/.locks`,
      // provider-aware auth: claude→~/.claude mount, codex/gemini→API key env only.
      // Skip mount when api auth mode or non-claude provider binary.
      ...(useApiOnly || providerBinary !== 'claude'
        ? []
        : [
            '-v', `${join(home, '.claude')}:${containerHome}/.claude`,
            ...(existsSync(join(home, '.claude.json'))
              ? ['-v', `${join(home, '.claude.json')}:${containerHome}/.claude.json`]
              : []),
          ]),
      // Working directory
      '-w', CONTAINER_WORKSPACE,
    ];

    // Pass Deckent worker context env vars (for SIGTERM handler in worker.ts)
    dockerArgs.push('-e', `DECKENT_TASK_ID=${taskId}`);
    dockerArgs.push('-e', `DECKENT_PROJECT_ROOT=${CONTAINER_WORKSPACE}`);
    // Adaptive timeout: pass computed timeout to container as env var
    dockerArgs.push('-e', `TASK_TIMEOUT=${effectiveTimeout}`);
    // Sprint 156 T-006: stable per-spawn idempotency key — promptId is already a fresh
    // 16-hex-char random token unique to this worker invocation. Workers should use this
    // value as the `Idempotency-Key` header for any external API call so retries are safe.
    dockerArgs.push('-e', `IDEMPOTENCY_KEY=${promptId}`);
    // Surface effective auth mode to the container (used by worker prompt for
    // model self-awareness; not required by Claude CLI itself).
    dockerArgs.push('-e', `DECKENT_AUTH_MODE=${useApiOnly ? 'api' : 'subscription'}`);
    // Sprint 194 W-AUTH A-1: tell the container's worker to run authHealthCheck
    // (claude --version) before doing any task work, so a /login auth-loss
    // during a sprint produces a real AUTH_FAILED .result instead of a silent
    // exit 0. Skipped when worker.ts sees DECKENT_AUTH_SKIP=1 (test env).
    dockerArgs.push('-e', 'CLAUDE_AUTH_REQUIRED=1');
    // Sprint 194 T-004 (W-M M-2): bind V8 heap to the container memory cap.
    // Explicit -e overrides any leaked process.env.NODE_OPTIONS — workers must
    // get the deterministic Deckent value, not whatever the host shell carries.
    dockerArgs.push('-e', WORKER_NODE_OPTIONS);

    // Sprint 196 T-196-003 (WP-5): forward Anthropic prompt-cache identity
    // when the worker prompt advertises one (HTML-comment marker prepended by
    // buildWorkerPrompt). Worker uses DECKENT_PROMPT_CACHE_KEY when invoking
    // Anthropic SDK directly so cache_control: ephemeral binds to the same
    // logical "frozen system prompt" across workers in the cluster.
    const promptCacheKey = extractPromptCacheKey(prompt);
    if (promptCacheKey) {
      dockerArgs.push('-e', `DECKENT_PROMPT_CACHE_KEY=${promptCacheKey}`);
      dockerArgs.push('-e', 'DECKENT_PROMPT_CACHE_ENABLED=1');
    }

    // Sprint 214 T-214-001 — provider + auth-aware env forwarding.
    //
    // ANTHROPIC_API_KEY MUST NOT leak into the container when the worker is a
    // claude provider in subscription mode: the claude CLI prefers the env var
    // over the mounted ~/.claude session, so forwarding the host key silently
    // demotes `auth_mode: subscription` into API mode → Tier-1 timeout under
    // post-beta budgets. Forward Anthropic key ONLY when useApiOnly === true
    // (line 474 already requires it for that branch). For non-claude providers
    // the key is irrelevant — strip it to avoid cross-provider auth confusion.
    //
    // OPENAI_API_KEY / GOOGLE_API_KEY are forwarded only when the spawned
    // provider can actually use them (codex/gemini). DECKENT_DEBUG is auth-
    // orthogonal and always forwarded when set on the host.
    if (useApiOnly && process.env.ANTHROPIC_API_KEY) {
      dockerArgs.push('-e', `ANTHROPIC_API_KEY=${process.env.ANTHROPIC_API_KEY}`);
    }
    if (providerBinary !== 'claude' && process.env.OPENAI_API_KEY) {
      dockerArgs.push('-e', `OPENAI_API_KEY=${process.env.OPENAI_API_KEY}`);
    }
    if (providerBinary !== 'claude' && process.env.GOOGLE_API_KEY) {
      dockerArgs.push('-e', `GOOGLE_API_KEY=${process.env.GOOGLE_API_KEY}`);
    }
    if (process.env.DECKENT_DEBUG) {
      dockerArgs.push('-e', `DECKENT_DEBUG=${process.env.DECKENT_DEBUG}`);
    }

    // Container image and command
    dockerArgs.push(this.image, 'sh', '-c', containerCmd);

    debugLog('docker-backend:spawn', `taskId=${taskId} container=${containerName} model=${model}`);

    // Sprint 163 T-002: retry spawn with health check.
    // Each attempt: docker run + 3s wait + docker inspect. If inspect reports
    // Running=true OR Running=false+ExitCode=0 (instant-exit success), proceed.
    // Otherwise, classify stderr and retry up to MAX_SPAWN_ATTEMPTS.
    const spawnOutcome = this.runDockerWithRetry(taskId, containerName, dockerArgs);

    if (!spawnOutcome.ok) {
      debugLog('docker-backend:spawn-error', `taskId=${taskId} ${spawnOutcome.error.message}`);
      // Write .timeout marker with the stable error code so result-collector and
      // downstream tools can act on the failure category, not the bare string.
      // Marker payload is 'container_start_failed' base + ":<code>:<message>" suffix
      // so legacy substring grep ('container_start_failed') still matches.
      const baseMarker = 'container_start_failed';
      writeFileSync(
        join(tasksDir, `task-${taskId}.timeout`),
        `${baseMarker}:${spawnOutcome.error.code}:${spawnOutcome.error.message}`,
        'utf-8',
      );
      // Sprint 156 Task 10 (fix): release spawn locks so a retry / fix-worker
      // for this scope is not permanently blocked by a transient docker error.
      try { releaseAllSpawnLocks(dir, taskId); } catch (e) { debugLog('docker-backend:spawn-lock-release', e); }
      // Sprint 170 P0-5: spawn failed — clear pending so Set doesn't leak
      clearPending(taskId);
      return;
    }

    const { containerId, instantExitSuccess } = spawnOutcome;
    this.containers.set(taskId, { containerId, model });
    debugLog(
      'docker-backend:spawn-ok',
      `taskId=${taskId} containerId=${containerId.slice(0, 12)} instantExit=${instantExitSuccess}`,
    );

    // Write initial heartbeat
    const hbPath = join(tasksDir, `task-${taskId}.hb`);
    writeFileSync(hbPath, JSON.stringify({
      workerId: `docker-${taskId}`,
      taskId,
      status: 'EXECUTING',
      sequence: 1,
      timestamp: new Date().toISOString(),
      startedAt: new Date().toISOString(),
      backend: 'docker',
      containerId: containerId.slice(0, 12),
    }, null, 2), 'utf-8');

    // Sprint 170 P0-5: .hb is now on disk — heartbeat is authoritative, race window closed
    markActive(taskId);

    // Set up container monitoring (async, fire-and-forget)
    this.monitorContainer(taskId, containerName, tasksDir, model);
  }

  /**
   * Sprint 163 T-002: attempt `docker run` up to MAX_SPAWN_ATTEMPTS times,
   * verifying container health after each attempt via `docker inspect`.
   *
   * Returns:
   * - `{ ok: true, containerId, instantExitSuccess: false }` — container is running
   * - `{ ok: true, containerId, instantExitSuccess: true }` — container started and gracefully exited (ExitCode 0)
   * - `{ ok: false, error }` — all attempts failed, error classified into a stable code
   *
   * Between attempts the previous container is force-removed so the name slot
   * is free for the next try.
   */
  private runDockerWithRetry(
    taskId: string,
    containerName: string,
    dockerArgs: string[],
  ): { ok: true; containerId: string; instantExitSuccess: boolean }
    | { ok: false; error: { code: DockerErrorCode; message: string; exitCode: number; stderr: string } } {
    let lastStderr = '';
    let lastExitCode = -1;

    for (let attempt = 1; attempt <= MAX_SPAWN_ATTEMPTS; attempt++) {
      debugLog('docker-backend:spawn-attempt', `taskId=${taskId} attempt=${attempt}/${MAX_SPAWN_ATTEMPTS}`);

      const result = spawnSync('docker', dockerArgs, {
        encoding: 'utf-8',
        timeout: 30_000, // 30s to start container
      });

      if (result.status !== 0) {
        // docker run itself failed (image missing, syntax error, daemon down, …)
        lastStderr = result.stderr ?? '';
        lastExitCode = result.status ?? -1;
        debugLog(
          'docker-backend:spawn-attempt-fail',
          `taskId=${taskId} attempt=${attempt} status=${result.status} stderr=${lastStderr.trim().slice(0, 200)}`,
        );
        // Force-remove the (probably non-existent) container in case it was
        // half-created, then retry.
        this.forceRemoveContainer(containerName);
        if (attempt < MAX_SPAWN_ATTEMPTS) {
          this.sleepSync(SPAWN_RETRY_DELAY_MS);
        }
        continue;
      }

      const containerId = result.stdout?.trim() ?? '';

      // docker run succeeded — now confirm the container is actually alive.
      const health = this.healthCheckContainer(containerName);
      if (health.healthy) {
        return { ok: true, containerId, instantExitSuccess: false };
      }
      if (health.instantExitSuccess) {
        // Container started and gracefully exited with code 0 — this is not a
        // failure. Workers that complete inside the health-check window are rare
        // but legitimate.
        return { ok: true, containerId, instantExitSuccess: true };
      }

      // Real container_start_failed: container died with a non-zero exit code.
      // Pull docker logs to capture stderr for classification before removing.
      const logResult = spawnSync('docker', ['logs', containerName], {
        encoding: 'utf-8',
        timeout: 5_000,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      lastStderr = `${logResult.stdout ?? ''}${logResult.stderr ?? ''}`;
      lastExitCode = health.exitCode;
      debugLog(
        'docker-backend:spawn-health-fail',
        `taskId=${taskId} attempt=${attempt} exitCode=${lastExitCode} stderr=${lastStderr.trim().slice(0, 200)}`,
      );
      this.forceRemoveContainer(containerName);
      if (attempt < MAX_SPAWN_ATTEMPTS) {
        this.sleepSync(SPAWN_RETRY_DELAY_MS);
      }
    }

    const classification = classifyDockerError(lastStderr, lastExitCode);
    return {
      ok: false,
      error: {
        code: classification.code,
        message: classification.message,
        exitCode: lastExitCode,
        stderr: lastStderr,
      },
    };
  }

  /**
   * Sprint 163 T-002: after `docker run -d` returns successfully, wait
   * HEALTH_CHECK_DELAY_MS then ask docker about the container's real state.
   *
   * - Running=true             → healthy (proceed)
   * - Running=false, exit=0    → graceful instant exit (proceed, no error)
   * - Running=false, exit>0    → real container_start_failed (retry candidate)
   * - inspect fails / malformed → fail-open: assume healthy. We have a clean
   *   `docker run` ack already; optimistically hand off to monitorContainer
   *   instead of burning a retry on inspect noise. Real failures still trip
   *   the `Running=false + ExitCode>0` branch because docker inspect emits
   *   exactly that format in real environments.
   */
  healthCheckContainer(containerName: string, delayMs: number = HEALTH_CHECK_DELAY_MS): HealthCheckResult {
    if (delayMs > 0) this.sleepSync(delayMs);

    const inspect = spawnSync(
      'docker',
      ['inspect', containerName, '--format', '{{.State.Running}}|{{.State.ExitCode}}'],
      { encoding: 'utf-8', timeout: 5_000, stdio: ['pipe', 'pipe', 'pipe'] },
    );

    if (inspect.status !== 0) {
      // inspect command itself failed — fail-open. `docker wait` in the
      // monitor will catch genuine container death.
      return { healthy: true, instantExitSuccess: false, exitCode: 0, raw: inspect.stderr ?? '' };
    }

    const parsed = parseInspectOutput(inspect.stdout ?? '');
    if (!parsed) {
      // Malformed inspect output — same reasoning, fail-open.
      return { healthy: true, instantExitSuccess: false, exitCode: 0, raw: inspect.stdout ?? '' };
    }

    if (parsed.running) {
      return { healthy: true, instantExitSuccess: false, exitCode: parsed.exitCode, raw: inspect.stdout ?? '' };
    }
    if (parsed.exitCode === 0) {
      return { healthy: false, instantExitSuccess: true, exitCode: 0, raw: inspect.stdout ?? '' };
    }
    return { healthy: false, instantExitSuccess: false, exitCode: parsed.exitCode, raw: inspect.stdout ?? '' };
  }

  /**
   * Sprint 163 T-002 helper: force-remove a container by name. Used between
   * retry attempts so the container-name slot is free for the next `docker run`.
   * Errors are swallowed — the next `docker run` will fail loudly if removal
   * really did not work, and we already log via debugLog.
   */
  private forceRemoveContainer(containerName: string): void {
    try {
      spawnSync('docker', ['rm', '-f', containerName], {
        encoding: 'utf-8',
        timeout: 5_000,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (e) {
      debugLog('docker-backend:force-remove-error', e);
    }
  }

  /**
   * Blocking sleep using `spawnSync('sleep', …)` so the retry loop stays
   * synchronous (matches the rest of this file's spawn-time path).
   */
  private sleepSync(ms: number): void {
    if (ms <= 0) return;
    const seconds = (ms / 1000).toFixed(3);
    spawnSync('sleep', [seconds], { timeout: ms + 2_000 });
  }

  /**
   * Gracefully stop a running worker container.
   *
   * Sprint 139 fix: increased grace period from 10s to 15s and added post-stop
   * result file verification. The sequence:
   * 1. `docker stop --time=15` sends SIGTERM → worker's trap runs fsync_file
   * 2. If .result exists after stop, verify it's readable (fsync confirmation)
   * 3. If .result missing + non-zero exit, write fallback NO_GO result
   * 4. Remove container
   *
   * This closes the 5-sprint exit-137 bug: even if SIGKILL fires after 15s,
   * the SIGTERM trap has already fsync'd .result to disk.
   */
  kill(taskId: string): void {
    const containerName = `${CONTAINER_PREFIX}${taskId}`;
    const grace = this.gracefulTimeoutSeconds;
    debugLog('docker-backend:kill', `taskId=${taskId} (graceful stop --time=${grace})`);

    try {
      // Graceful: SIGTERM + configurable grace period (Sprint 151: was hardcoded 15s, now configurable)
      const stopResult = spawnSync('docker', ['stop', `--time=${grace}`, containerName], {
        encoding: 'utf-8', timeout: (grace + 5) * 1000, // grace + 5s buffer to avoid race
      });
      if (stopResult.status !== 0) {
        // Fallback: send SIGTERM (not SIGKILL) so EXIT trap can still run
        // Sprint 149: changed from bare `docker kill` (SIGKILL) to --signal=SIGTERM
        debugLog('docker-backend:stop-failed', `Falling back to docker kill --signal=SIGTERM: ${stopResult.stderr?.trim()}`);
        spawnSync('docker', ['kill', '--signal=SIGTERM', containerName], { encoding: 'utf-8', timeout: 10_000 });
      }
    } catch (e) { debugLog('docker-backend:kill-error', e); }

    // Sprint 149: Poll for .result file after stop (max 5s, 500ms intervals)
    // Gives EXIT trap time to write result after SIGTERM
    const resultPath = join(this.projectDir, TASKS_DIR, `task-${taskId}.result`);
    if (!existsSync(resultPath)) {
      for (let i = 0; i < 10; i++) {
        spawnSync('sleep', ['0.5'], { timeout: 2_000 });
        if (existsSync(resultPath)) break;
      }
    }

    // Post-stop verification: ensure .result was persisted to disk
    this.verifyResultAfterStop(taskId);

    try {
      spawnSync('docker', ['rm', '-f', containerName], { encoding: 'utf-8', timeout: 10_000 });
    } catch (e) { debugLog('docker-backend:rm-error', e); }

    // Sprint 156 Task 10: forced shutdown — release any spawn locks left over
    try {
      const released = releaseAllSpawnLocks(this.projectDir, taskId);
      if (released > 0) debugLog('docker-backend:spawn-lock', `taskId=${taskId} released ${released} spawn lock(s) on kill`);
    } catch (e) { debugLog('docker-backend:spawn-lock-release', e); }

    this.containers.delete(taskId);
  }

  /**
   * Verify .result file exists and is readable after container stop.
   * If the file exists, fsync it from host side as belt-and-suspenders.
   * If missing, log a warning (monitorContainer EXIT trap should have written fallback).
   */
  private verifyResultAfterStop(taskId: string): void {
    const resultPath = join(this.projectDir, TASKS_DIR, `task-${taskId}.result`);
    try {
      if (existsSync(resultPath)) {
        // Belt-and-suspenders: fsync from host side to ensure container writes are flushed
        const fd = openSync(resultPath, 'r');
        try { fsyncSync(fd); } finally { closeSync(fd); }
        debugLog('docker-backend:post-stop-verify', `taskId=${taskId} .result verified + fsynced`);
      } else {
        debugLog('docker-backend:post-stop-verify', `taskId=${taskId} .result MISSING after stop — EXIT trap should write fallback`);
      }
    } catch (e) {
      debugLog('docker-backend:post-stop-verify-error', `taskId=${taskId} ${e}`);
    }
  }

  /**
   * List currently active worker task IDs.
   */
  list(): string[] {
    return [...this.containers.keys()];
  }

  /**
   * Check if Docker is available.
   */
  async isAvailable(): Promise<boolean> {
    const result = spawnSync('docker', ['info'], {
      encoding: 'utf-8',
      timeout: 5_000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return result.status === 0;
  }

  /**
   * Acquire spawn-time `.spawnlock` files for every entry in the task's
   * `scope.filesWrite`. Reads `<tasksDir>/task-<taskId>.json` to recover
   * the file list — if the JSON is missing or malformed, locking is
   * silently skipped (graceful degradation; we never block a spawn over
   * a parse failure). Throws `SpawnBackendError` on a real conflict so
   * the caller can surface the conflicting task id.
   */
  /**
   * Read the per-task auth mode override from `task-<taskId>.json`.
   * Returns 'api' or 'subscription' when explicitly set on the task, or
   * undefined when missing/malformed (caller treats undefined as subscription
   * for backward compatibility).
   */
  private readTaskAuthMode(projectDir: string, taskId: string): 'subscription' | 'api' | undefined {
    const taskJsonPath = join(projectDir, TASKS_DIR, `task-${taskId}.json`);
    if (!existsSync(taskJsonPath)) return undefined;
    try {
      const raw = readFileSync(taskJsonPath, 'utf-8');
      const parsed = JSON.parse(raw) as { authMode?: unknown };
      if (parsed.authMode === 'api' || parsed.authMode === 'subscription') {
        return parsed.authMode;
      }
    } catch (err) {
      debugLog('docker-backend:auth-mode', `taskId=${taskId} failed to read authMode: ${(err as Error).message}`);
    }
    return undefined;
  }

  private acquireSpawnTimeLocks(projectDir: string, taskId: string): void {
    const taskJsonPath = join(projectDir, TASKS_DIR, `task-${taskId}.json`);
    if (!existsSync(taskJsonPath)) {
      debugLog('docker-backend:spawn-lock', `taskId=${taskId} no task JSON found at ${taskJsonPath} — skipping spawn locks`);
      return;
    }

    let filesWrite: string[] = [];
    try {
      const raw = readFileSync(taskJsonPath, 'utf-8');
      const parsed = JSON.parse(raw) as { scope?: { filesWrite?: unknown } };
      const candidate = parsed.scope?.filesWrite;
      if (Array.isArray(candidate)) {
        filesWrite = candidate.filter((f): f is string => typeof f === 'string' && f.length > 0);
      }
    } catch (err) {
      debugLog('docker-backend:spawn-lock', `taskId=${taskId} failed to parse task JSON: ${(err as Error).message}`);
      return;
    }

    if (filesWrite.length === 0) return;

    try {
      acquireSpawnLocks(projectDir, taskId, filesWrite);
      debugLog('docker-backend:spawn-lock', `taskId=${taskId} acquired ${filesWrite.length} spawn lock(s)`);
    } catch (err) {
      if (err instanceof SpawnLockError) {
        throw new SpawnBackendError(
          `Spawn lock conflict on ${err.filePath}: file is currently held by task ${err.conflictingTaskId}`,
          'docker',
        );
      }
      throw err;
    }
  }

  /**
   * Monitor container until it exits, then update heartbeat and cleanup.
   */
  private monitorContainer(taskId: string, containerName: string, tasksDir: string, model: string): void {
    const child = nodeSpawn('docker', ['wait', containerName], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    child.stdout?.on('data', (data: Buffer) => {
      const exitCode = parseInt(data.toString().trim(), 10);
      debugLog('docker-backend:exit', `taskId=${taskId} exitCode=${exitCode}`);

      // Sprint 139: fsync .result from host side before reading
      // Container's fsync_file trap may have run, but belt-and-suspenders from host
      const resultPath = join(tasksDir, `task-${taskId}.result`);
      try {
        if (existsSync(resultPath)) {
          const fd = openSync(resultPath, 'r');
          try { fsyncSync(fd); } finally { closeSync(fd); }
        }
      } catch { /* fsync best-effort — continue with reconciliation */ }

      // Determine heartbeat status: check .result file for reconciliation
      // If .result exists with DONE/GO_WITH_TECH_DEBT, treat as DONE regardless of exitCode
      // This prevents false "FAILED exitCode 137" alerts when container was SIGKILL'd
      // after worker already wrote a successful result
      let hbStatus: string = exitCode === 0 ? 'DONE' : 'FAILED';
      let hbExitCode = exitCode;

      if (exitCode !== 0) {
        try {
          if (existsSync(resultPath)) {
            const raw = readFileSync(resultPath, 'utf-8');
            // safe: result files written by writeResult with TaskResult shape
            const result = JSON.parse(raw) as { selfAssessment?: string };
            if (result.selfAssessment === 'DONE' || result.selfAssessment === 'GO_WITH_TECH_DEBT') {
              hbStatus = 'DONE';
              hbExitCode = 0;
              debugLog('docker-backend:reconcile', `taskId=${taskId} exitCode=${exitCode} but .result=${result.selfAssessment} → HB DONE`);
            } else if (result.selfAssessment === 'TIMEOUT_WITH_WORK') {
              // Sprint 145: partial work detected — not DONE but not a clean failure either
              hbStatus = 'TIMEOUT_WITH_WORK';
              debugLog('docker-backend:reconcile', `taskId=${taskId} exitCode=${exitCode} .result=TIMEOUT_WITH_WORK → partial work, Brain reconciles`);
            }
          }
        } catch {
          // JSON parse fail or fs error → keep honest FAILED status
        }
      }

      // Update heartbeat
      const hbPath = join(tasksDir, `task-${taskId}.hb`);
      try {
        writeFileSync(hbPath, JSON.stringify({
          workerId: `docker-${taskId}`,
          taskId,
          status: hbStatus,
          sequence: 99,
          timestamp: new Date().toISOString(),
          exitCode: hbExitCode,
          backend: 'docker',
        }, null, 2), 'utf-8');
      } catch (e) { debugLog('docker-backend:hb-update', e); }

      // If no .result file and exit != 0, write fallback result + timeout marker.
      // Sprint 148 root cause fix: SIGKILL (exit 137, OOM kill) bypasses all shell
      // traps — the container's EXIT trap never runs. The host-side monitor must
      // write the fallback .result so Brain's result-collector doesn't wait forever.
      const timeoutPath = join(tasksDir, `task-${taskId}.timeout`);
      // Sprint 149: Partial write detection — .result exists but corrupt JSON
      // This catches cases where container was SIGKILL'd mid-write
      if (existsSync(resultPath) && exitCode !== 0) {
        try {
          const raw = readFileSync(resultPath, 'utf-8');
          JSON.parse(raw); // Just validate — if corrupt, overwrite below
        } catch {
          debugLog('docker-backend:partial-write', `taskId=${taskId} .result exists but corrupt JSON — overwriting with NO_GO`);
          try { unlinkSync(resultPath); } catch { /* ok */ }
          // Fall through to the fallback writer below
        }
      }

      // Sprint 151: Promote .partial-result → .result when container died without writing .result
      // This catches OOM kills (exit 137) where SIGKILL bypasses all shell traps but the
      // .partial-result file written at script start survives on the shared volume.
      const partialPath = join(tasksDir, `task-${taskId}.partial-result`);
      if (!existsSync(resultPath) && exitCode !== 0 && existsSync(partialPath)) {
        try {
          const partialRaw = readFileSync(partialPath, 'utf-8');
          const partial = JSON.parse(partialRaw) as Record<string, unknown>;
          // Enrich with exit code and signal info
          const signalInfo = exitCode > 128 ? ` signal=${exitCode - 128}` : '';
          const isOom = exitCode === 137;
          partial.notes = isOom
            ? `Container OOM-killed (exit 137, SIGKILL). Partial-result promoted by host monitor. No .result was written by worker.`
            : `Container killed (exitCode=${exitCode}${signalInfo}). Partial-result promoted by host monitor.`;
          partial.exitCode = exitCode;
          partial.selfAssessment = 'NO_GO';
          const enrichedResult = JSON.stringify(partial);
          writeFileSync(resultPath, enrichedResult, 'utf-8');
          const fd = openSync(resultPath, 'r');
          try { fsyncSync(fd); } finally { closeSync(fd); }
          try { unlinkSync(partialPath); } catch { /* ok */ }
          debugLog('docker-backend:partial-promote', `taskId=${taskId} exitCode=${exitCode} → promoted .partial-result to .result`);
        } catch (e) {
          debugLog('docker-backend:partial-promote-error', `taskId=${taskId} ${e}`);
          // Fall through to host fallback below
          try { unlinkSync(partialPath); } catch { /* ok */ }
        }
      }

      // Clean up .partial-result if .result already exists (normal exit or promoted above)
      if (existsSync(partialPath)) {
        try { unlinkSync(partialPath); } catch { /* ok */ }
      }

      if (!existsSync(resultPath) && exitCode !== 0) {
        // Sprint 149: Add signal_info for signal-killed containers (exit > 128)
        const signalInfo = exitCode > 128 ? ` signal=${exitCode - 128}` : '';
        // Host-side fallback result — ensures result-collector always finds a .result file
        const hostFallbackResult = JSON.stringify({
          taskId,
          workerId: `docker-${taskId}`,
          filesChanged: [],
          linesAdded: 0,
          linesRemoved: 0,
          testsPassed: false,
          coverage: 0,
          selfAssessment: 'NO_GO',
          notes: `Worker exited (code=${exitCode}${signalInfo}) without writing result. Host-side fallback.`,
          exitCode,
          tokenUsage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, provider: 'claude', model },
        });
        try {
          writeFileSync(resultPath, hostFallbackResult, 'utf-8');
          // fsync from host side to ensure data hits disk
          const fd = openSync(resultPath, 'r');
          try { fsyncSync(fd); } finally { closeSync(fd); }
          debugLog('docker-backend:host-fallback', `taskId=${taskId} exitCode=${exitCode} → wrote fallback .result`);
        } catch (e) {
          debugLog('docker-backend:host-fallback-error', `taskId=${taskId} ${e}`);
        }
        // Also write .timeout marker for backward compat
        if (!existsSync(timeoutPath)) {
          writeFileSync(timeoutPath, `container_exit_${exitCode}`, 'utf-8');
        }
      }

      // Extract container logs BEFORE removal (docker logs requires container to exist)
      try {
        const logResult = spawnSync('docker', ['logs', containerName], {
          encoding: 'utf-8', timeout: 10_000, stdio: ['pipe', 'pipe', 'pipe'],
        });
        const logContent = (logResult.stdout ?? '') + (logResult.stderr ?? '');
        if (logContent.trim()) {
          const logPath = join(tasksDir, `task-${taskId}.log`);
          writeFileSync(logPath, logContent, 'utf-8');
        }
      } catch (e) { debugLog('docker-backend:log-extract', e); }

      // Cleanup container
      try {
        spawnSync('docker', ['rm', '-f', containerName], { encoding: 'utf-8', timeout: 10_000 });
      } catch (e) { debugLog('docker-backend:cleanup', e); }

      // Sprint 156 Task 10: release every spawn lock owned by this task
      try {
        const released = releaseAllSpawnLocks(this.projectDir, taskId);
        if (released > 0) debugLog('docker-backend:spawn-lock', `taskId=${taskId} released ${released} spawn lock(s) on exit`);
      } catch (e) { debugLog('docker-backend:spawn-lock-release', e); }

      // Sprint 168 C0b: defensive sad-path safety net — releaseStaleSpawnLocksForTask
      // catches any spawnlock missed by releaseAllSpawnLocks (e.g. corrupted file,
      // partial unlink). Both helpers are idempotent and cheap when no locks remain.
      try {
        releaseStaleSpawnLocksForTask(this.projectDir, taskId);
      } catch (e) { debugLog('docker-backend:spawn-lock-stale-release', e); }

      this.containers.delete(taskId);

      // Sprint 156 Task 4: .prompt-*.txt AND .worker-*.sh tmpfiles persist until sprint cleanup.
      // Both are archived together by archivePromptFiles() during sprint cleanup phase.
      // Rationale: worker scripts (.worker-*.sh) contain spawn invocation and env state useful for
      // post-mortem debugging when a container fails mid-execution. Previous behavior deleted them
      // immediately after each container exit, losing forensic value.
    });

    child.on('error', (err) => {
      debugLog('docker-backend:monitor-error', `taskId=${taskId} ${err.message}`);
      this.containers.delete(taskId);
    });
  }
}

// ─── Docker Availability Check (sync) ─────────────────────────────────────

export function isDockerAvailable(): boolean {
  const result = spawnSync('docker', ['info'], {
    encoding: 'utf-8',
    timeout: 5_000,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  return result.status === 0;
}

// ─── Prompt File Archive ───────────────────────────────────────────────────

/**
 * Archive .prompt-*.txt AND .worker-*.sh tmpfiles from .tasks/ into .tasks/archive/sprint-{sprintId}/.
 *
 * Called during sprint finalize/cleanup — tmpfiles persist during the sprint
 * for analysis, then are moved to the archive directory on completion.
 *
 * Sprint 156 Task 4 extension: worker scripts (.worker-*.sh) are archived alongside
 * prompt files. They contain spawn invocation context (env, claude args, taskId) that is
 * essential for post-mortem debugging when a container fails mid-execution.
 *
 * @param tasksDir  Absolute path to .tasks/ directory
 * @param sprintId  Sprint identifier (e.g. "sprint-139")
 * @param retentionSprints  How many past sprint archives to keep (default 5)
 */
export function archivePromptFiles(
  tasksDir: string,
  sprintId: string,
  retentionSprints = 5,
): { archived: number; cleaned: number } {
  let archived = 0;
  let cleaned = 0;

  if (!existsSync(tasksDir)) return { archived, cleaned };

  // Create archive directory for this sprint
  const archiveDir = join(tasksDir, 'archive', sprintId);
  mkdirSync(archiveDir, { recursive: true });

  // Move all .prompt-*.txt AND .worker-*.sh tmpfiles to archive
  try {
    const files = readdirSync(tasksDir) as string[];
    for (const f of files) {
      const isPromptFile = f.startsWith('.prompt-') && f.endsWith('.txt');
      const isWorkerScript = f.startsWith('.worker-') && f.endsWith('.sh');
      if (isPromptFile || isWorkerScript) {
        const src = join(tasksDir, f);
        const dst = join(archiveDir, f);
        try {
          renameSync(src, dst);
          archived++;
        } catch { /* skip files that can't be moved */ }
      }
    }
  } catch { /* ok — tasksDir may be empty */ }

  // Apply retention policy: remove old sprint archives beyond retentionSprints
  if (retentionSprints > 0) {
    const archiveRoot = join(tasksDir, 'archive');
    try {
      const sprintDirs = (readdirSync(archiveRoot) as string[])
        .filter(d => d.startsWith('sprint-'))
        .sort(); // alphabetical sort = chronological for sprint-NNN format
      const toRemove = sprintDirs.slice(0, Math.max(0, sprintDirs.length - retentionSprints));
      for (const dir of toRemove) {
        const dirPath = join(archiveRoot, dir);
        try {
          // Remove all files in the old archive sprint dir
          const oldFiles = readdirSync(dirPath) as string[];
          for (const f of oldFiles) {
            try { unlinkSync(join(dirPath, f)); cleaned++; } catch { /* ok */ }
          }
          // Remove the now-empty directory
          rmdirSync(dirPath);
        } catch { /* ok */ }
      }
    } catch { /* archive root may not exist yet */ }
  }

  return { archived, cleaned };
}
