import type { Command } from 'commander';
import { readFileSync, writeFileSync, existsSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { killWorker, TmuxError, cleanupTmuxSocket } from '../../orchestra/tmux.js';
import { print, printError } from '../helpers/output.js';
import { resolveProjectRoot } from '../helpers/process.js';
import { loadConfig } from '../../core/config.js';
import { getMessage } from '../helpers/messages.js';
import { promptConfirm } from '../helpers/prompt.js';
import { TASKS_DIR, LOCKS_DIR } from '../../core/constants.js';
import { SpawnBackendFactory } from '../../orchestra/spawn-backend.js';
import { getProviderForModel } from '../../core/task-types.js';
import type { ModelType } from '../../core/types.js';
import {
  listPidFiles, readPid, isProcessAlive, verifySprintOwnership,
} from '../../orchestra/sprint-pid-manager.js';
import { cleanupSprintMetadata } from '../../orchestra/sprint-controller.js';
import { writeEvent } from '../../orchestra/event-stream.js';

/** Find the task JSON file matching a taskId (handles sprint prefix patterns). */
function findTaskFile(root: string, taskId: string): string | null {
  const tasksDir = join(root, TASKS_DIR);
  if (!existsSync(tasksDir)) return null;
  const files = readdirSync(tasksDir);
  // Try exact match first: task-{taskId}.json
  const exact = `task-${taskId}.json`;
  if (files.includes(exact)) return join(tasksDir, exact);
  // Try pattern: task-*-{taskId}.json (sprint prefix)
  const match = files.find(f => f.endsWith(`-${taskId}.json`) && f.startsWith('task-'));
  return match ? join(tasksDir, match) : null;
}

/** Update task status to PAUSED after kill. */
function updateTaskStatus(root: string, taskId: string, lang: string): void {
  const taskFile = findTaskFile(root, taskId);
  if (!taskFile) {
    print(getMessage('kill.task_not_found', lang, { taskId }));
    return;
  }
  try {
    const data = JSON.parse(readFileSync(taskFile, 'utf-8'));
    data.status = 'PAUSED';
    writeFileSync(taskFile, JSON.stringify(data, null, 2) + '\n', 'utf-8');
    print(getMessage('kill.task_status_updated', lang, { taskId }));
  } catch {
    print(getMessage('kill.task_not_found', lang, { taskId }));
  }
}

/** Release locks owned by the killed worker. */
function releaseLocks(root: string, taskId: string, lang: string): void {
  const locksDir = join(root, LOCKS_DIR);
  if (!existsSync(locksDir)) return;
  const files = readdirSync(locksDir);
  let released = 0;
  for (const file of files) {
    try {
      const lockPath = join(locksDir, file);
      const lock = JSON.parse(readFileSync(lockPath, 'utf-8'));
      if (lock.ownerWorkerId === `w-${taskId}` || lock.taskId === taskId) {
        unlinkSync(lockPath);
        released++;
      }
    } catch {
      // Skip unreadable lock files
    }
  }
  if (released > 0) {
    print(getMessage('kill.locks_released', lang, { count: String(released), taskId }));
  }
}

/** Clean up prompt files for the killed task. */
function cleanPromptFiles(root: string, taskId: string, lang: string): void {
  const tasksDir = join(root, TASKS_DIR);
  if (!existsSync(tasksDir)) return;
  const files = readdirSync(tasksDir);
  let cleaned = 0;
  for (const file of files) {
    if (file.startsWith('.prompt-') && file.includes(taskId)) {
      try {
        unlinkSync(join(tasksDir, file));
        cleaned++;
      } catch {
        // Skip
      }
    }
  }
  if (cleaned > 0) {
    print(getMessage('kill.prompts_cleaned', lang, { count: String(cleaned), taskId }));
  }
}

/**
 * Detect the provider for a task by reading its JSON file and checking the model.
 * Returns 'claude' as default if task file cannot be read.
 */
function detectTaskProvider(root: string, taskId: string): string {
  const taskFile = findTaskFile(root, taskId);
  if (!taskFile) return 'claude';
  try {
    const data = JSON.parse(readFileSync(taskFile, 'utf-8'));
    if (data.provider) return data.provider;
    if (data.model) {
      try {
        return getProviderForModel(data.model as ModelType);
      } catch { /* unknown model */ }
    }
  } catch { /* unreadable */ }
  return 'claude';
}

/** Kill a single worker and clean up its resources. Exported (born-610): the
 * finalize --force worker-sweep reuses this SAME backend-aware composition
 * (subprocess/docker-first for non-claude, tmux with subprocess-fallback, plus
 * status/lock/prompt cleanup) instead of a tmux-only kill that silently no-ops
 * on other backends (Law #2 — every environment). */
export function killSingle(root: string, taskId: string, lang: string): boolean {
  const provider = detectTaskProvider(root, taskId);

  // For non-claude providers, try subprocess kill first
  if (provider !== 'claude') {
    try {
      const backend = SpawnBackendFactory.create({
        backend: 'subprocess',
        projectDir: root,
      });
      backend.kill(taskId);
      print(getMessage('kill.worker_killed', lang, { taskId }));
      updateTaskStatus(root, taskId, lang);
      releaseLocks(root, taskId, lang);
      cleanPromptFiles(root, taskId, lang);
      return true;
    } catch {
      // Subprocess kill failed, fall through to tmux attempt
    }
  }

  // Try tmux kill (default for claude or fallback)
  try {
    killWorker(taskId);
    print(getMessage('kill.worker_killed', lang, { taskId }));
    updateTaskStatus(root, taskId, lang);
    releaseLocks(root, taskId, lang);
    cleanPromptFiles(root, taskId, lang);
    return true;
  } catch (error) {
    if (error instanceof TmuxError) {
      // Last resort: try subprocess kill if we haven't already
      if (provider === 'claude') {
        try {
          const backend = SpawnBackendFactory.create({
            backend: 'subprocess',
            projectDir: root,
          });
          backend.kill(taskId);
          print(getMessage('kill.worker_killed', lang, { taskId }));
          updateTaskStatus(root, taskId, lang);
          releaseLocks(root, taskId, lang);
          cleanPromptFiles(root, taskId, lang);
          return true;
        } catch { /* subprocess also failed */ }
      }
      printError(new Error(getMessage('kill.worker_not_found', lang, { taskId })));
      process.exitCode = 1;
      return false;
    }
    throw error;
  }
}

/** Find all active task IDs (EXECUTING or CLAIMED). */
function findActiveTaskIds(root: string): string[] {
  const tasksDir = join(root, TASKS_DIR);
  if (!existsSync(tasksDir)) return [];
  const files = readdirSync(tasksDir);
  const ids: string[] = [];
  for (const file of files) {
    if (!file.startsWith('task-') || !file.endsWith('.json')) continue;
    try {
      const data = JSON.parse(readFileSync(join(tasksDir, file), 'utf-8'));
      if (data.status === 'EXECUTING' || data.status === 'CLAIMED') {
        ids.push(data.id);
      }
    } catch {
      // Skip unreadable
    }
  }
  return ids;
}

// ═══ Sprint 177 Task 177-003 — Kill Cascade ═══════════════════════════
//
// `deckent kill --all` must leave ZERO stale state:
//   1. SIGTERM each worker (tmux/docker/subprocess via existing path).
//   2. SIGTERM the controller PID from .deckent/pids/.
//   3. 5-second grace period.
//   4. SIGKILL any controller still alive.
//   5. Remove sprint-state.json + {id}-checkpoint.json + {id}-gate.json
//      + PID/snapshot (via cleanupSprintMetadata).
//   6. Remove the tmux socket file (cleanupTmuxSocket).
//   7. Emit BRAIN→*:SPRINT_KILLED for each affected sprint.
//
// Sprint 176 evidence: controller PID stayed alive 43 minutes after kill,
// metadata + tmux socket survived. This cascade closes the gap.

/** Grace period (ms) between SIGTERM and SIGKILL for the controller process. */
const CONTROLLER_GRACE_MS = 5_000;

/** Send a signal to a PID; swallow ESRCH/EPERM (already dead / not ours). */
function safeSignal(pid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(pid, signal);
  } catch {
    // Already dead or not owned — both acceptable for kill cascade.
  }
}

/** Sleep helper; uses real setTimeout so vitest fake timers can advance it. */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => { setTimeout(resolve, ms); });
}

/** Outcome of a sprint-targeted kill. */
export type KillSprintResult =
  | { readonly status: 'killed'; readonly sprintId: string; readonly pid: number }
  | { readonly status: 'reused'; readonly sprintId: string }
  | { readonly status: 'already-stopped'; readonly sprintId: string };

/**
 * Kill EXACTLY one sprint's coordinator, ownership-validated — the precise
 * primitive the bot uses instead of `--all` so a stale/approved kill can never
 * hit a different sprint. 'reused' (pid recycled) → REFUSE, signal nothing.
 * 'dead' → already stopped (clean up the stale pid). 'owned'/'unknown' → SIGTERM,
 * grace, SIGKILL straggler, then cleanup THIS sprint's metadata only.
 */
export async function killSprintById(
  root: string,
  sprintId: string,
  opts: { graceMs?: number } = {},
): Promise<KillSprintResult> {
  const ownership = verifySprintOwnership(root, sprintId);
  if (ownership === 'reused') {
    // The recorded coordinator is gone and the pid now belongs to a foreign
    // process — refuse. Drop the misleading pid file so it can't mislead again.
    try { cleanupSprintMetadata(root, sprintId); } catch { /* fail-safe */ }
    return { status: 'reused', sprintId };
  }
  if (ownership === 'dead') {
    try { cleanupSprintMetadata(root, sprintId); } catch { /* fail-safe */ }
    return { status: 'already-stopped', sprintId };
  }

  const pid = readPid(root, sprintId);
  if (pid === null || !isProcessAlive(pid)) {
    try { cleanupSprintMetadata(root, sprintId); } catch { /* fail-safe */ }
    return { status: 'already-stopped', sprintId };
  }

  safeSignal(pid, 'SIGTERM');
  await delay(opts.graceMs ?? CONTROLLER_GRACE_MS);
  if (isProcessAlive(pid)) safeSignal(pid, 'SIGKILL');
  try { cleanupSprintMetadata(root, sprintId); } catch { /* fail-safe */ }
  try {
    writeEvent(root, sprintId, 'brain', '*', 'BRAIN→*:SPRINT_KILLED', {
      killedAt: new Date().toISOString(),
      controllerPids: [pid],
      targeted: true,
    });
  } catch { /* fail-safe */ }
  return { status: 'killed', sprintId, pid };
}

async function killAllCascade(
  root: string,
  lang: string,
): Promise<void> {
  // ─── Phase 1: SIGTERM workers ─────────────────────────────────────
  const activeIds = findActiveTaskIds(root);
  let workersKilled = 0;
  for (const id of activeIds) {
    try {
      killWorker(id);
      print(getMessage('kill.worker_killed', lang, { taskId: id }));
      workersKilled++;
    } catch {
      // Worker may have already exited (tmux window gone, docker container
      // already stopped, subprocess exited) — not a cascade failure.
    }
    updateTaskStatus(root, id, lang);
    releaseLocks(root, id, lang);
    cleanPromptFiles(root, id, lang);
  }

  // ─── Phase 2: SIGTERM controllers ─────────────────────────────────
  let sprintIds: string[] = [];
  try { sprintIds = listPidFiles(root); } catch { sprintIds = []; }
  const sigTermedPids: number[] = [];
  for (const sid of sprintIds) {
    try {
      const pid = readPid(root, sid);
      if (pid === null) continue;
      if (!isProcessAlive(pid)) continue;
      // 🔴 pid-reuse catastrophe guard (B2): never signal a pid that the OS
      // recycled to a DIFFERENT process. 'reused' → skip (the recorded sprint
      // is already gone; the live pid belongs to someone else). 'owned' and
      // 'unknown' (old pid file / non-Linux) preserve prior behavior.
      if (verifySprintOwnership(root, sid) === 'reused') continue;
      safeSignal(pid, 'SIGTERM');
      sigTermedPids.push(pid);
    } catch {
      // PID file unreadable — skip this sprint.
    }
  }

  // ─── Phase 3: Grace period ────────────────────────────────────────
  if (sigTermedPids.length > 0) {
    await delay(CONTROLLER_GRACE_MS);

    // ─── Phase 4: SIGKILL stragglers ────────────────────────────────
    for (const pid of sigTermedPids) {
      try {
        if (isProcessAlive(pid)) {
          safeSignal(pid, 'SIGKILL');
        }
      } catch { /* fail-safe */ }
    }
  }

  // ─── Phase 5: Per-sprint metadata cleanup ─────────────────────────
  for (const sid of sprintIds) {
    try { cleanupSprintMetadata(root, sid); } catch { /* fail-safe */ }
  }

  // ─── Phase 6: tmux socket cleanup ─────────────────────────────────
  // Always run — even with no active sprint — so residual sockets from
  // prior aborted sessions are cleared. Fail-safe so a missing tmux
  // binary or mock surface doesn't abort the cascade's final reporting.
  try { cleanupTmuxSocket(); } catch { /* fail-safe */ }

  // ─── Phase 7: SPRINT_KILLED event emission ────────────────────────
  for (const sid of sprintIds) {
    try {
      writeEvent(root, sid, 'brain', '*', 'BRAIN→*:SPRINT_KILLED', {
        killedAt: new Date().toISOString(),
        workersKilled,
        controllerPids: sigTermedPids,
      });
    } catch {
      // event-stream.writeEvent is already fail-safe; double-guard for paranoia.
    }
  }

  if (workersKilled > 0) {
    print(getMessage('kill.all_killed', lang, { count: String(workersKilled) }));
  } else if (sprintIds.length === 0) {
    print(getMessage('kill.no_active_workers', lang));
  }
}

/**
 * Interactive confirmation for the destructive `--all` cascade. A non-interactive
 * session (no TTY) returns false so the operator must opt in explicitly via
 * --force / --user-explicit rather than have a scripted run cascade-kill silently.
 */
async function interactiveKillAllConfirm(lang: string): Promise<boolean> {
  if (!process.stdin.isTTY) return false;
  print(getMessage('kill.all_confirm_warning', lang));
  return promptConfirm(getMessage('kill.all_confirm_prompt', lang), false);
}

/**
 * Decide whether `kill --all` may proceed (CONFIRM-001, §4G). An explicit flag
 * (--force / --user-explicit) bypasses the prompt; otherwise the confirm callback
 * decides. ADR-040 no-silent-destructive: cascade-killing all workers + the
 * controller must be human-confirmed.
 */
export async function shouldProceedKillAll(
  opts: { force?: boolean; userExplicit?: boolean },
  confirm: () => Promise<boolean>,
): Promise<boolean> {
  if (opts.force || opts.userExplicit) return true;
  return confirm();
}

export function registerKill(program: Command): void {
  program
    .command('kill [taskId]')
    .description('Kill a running worker')
    .option('--all', 'Kill all active workers')
    .option('--force', 'Force kill (bypass panic guard)')
    .option('--user-explicit', 'Explicit user confirmation for panic kill override')
    .action(async (taskId: string | undefined, opts: { all?: boolean; force?: boolean; userExplicit?: boolean }) => {
      const root = resolveProjectRoot();
      const config = await loadConfig(root).catch(() => ({ language: 'en' }));
      const lang = config.language ?? 'en';

      if (opts.all) {
        const proceed = await shouldProceedKillAll(opts, () =>
          interactiveKillAllConfirm(lang),
        );
        if (!proceed) {
          print(getMessage('kill.all_aborted', lang));
          return;
        }
        await killAllCascade(root, lang);
        return;
      }

      if (!taskId) {
        printError(new Error('taskId is required (or use --all)'));
        process.exitCode = 1;
        return;
      }

      killSingle(root, taskId, lang);
    });
}
