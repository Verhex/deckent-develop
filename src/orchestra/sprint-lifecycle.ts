// ═══ Sprint Lifecycle ══════════════════════════════════════════════
// Extracted from sprint-controller.ts — lifecycle management functions:
//   BrainError, PauseState, interrupt state management,
//   cleanup(), pauseSprint(), resumeSprint(), waitForHumanApproval(),
//   safeDashboardUpdate()

// ─── Node Builtins ─────────────────────────────────────────────────
import {
  readFileSync, writeFileSync, existsSync,
  mkdirSync, readdirSync, unlinkSync,
} from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// ─── Core (value imports — enums used at runtime) ──────────────────
import {
  TaskStatus, SprintPhase,
  SprintStatus, AlertLevel,
} from '../core/types.js';

// ─── Core (type imports) ───────────────────────────────────────────
import type {
  Sprint, Task, PlannerProof,
} from '../core/types.js';

import {
  TASKS_DIR, TASK_FILE_EXTENSIONS,
  LOCKS_DIR, DECISIONS_LOG_DIR,
} from '../core/constants.js';

// ─── Core — utils ─────────────────────────────────────────────────
import { readJsonSafe, debugLog } from '../core/utils.js';
import { DECKENT_DIR, DASHBOARD_FILE } from '../core/constants.js';

// ─── Notify (DECKENT→USER:NOTIFY — Hot Fix H6) ────────────────────
import { notify } from '../core/notify.js';

// ─── Sprint Utilities ─────────────────────────────────────────────
import {
  now, isStaleTaskFile,
  isTmuxProvider, resolveTaskProvider, getProviderAdapterForTask,
  PAUSE_STATE_FILE, writeSprintState,
} from './sprint-utils.js';
import {
  computeEventStreamOffset,
  writeCheckpoint,
} from './sprint-checkpoint.js';
import { writeEvent, CHANNELS } from './event-stream.js';
import { getMessage } from '../cli/helpers/messages.js';
import { detectLang } from '../cli/helpers/i18n.js';
import {
  dismissRecommendationByKey,
  recordRecommendationOnce,
} from '../nervous/recommendation-log.js';

// ─── Core — sprint lock ───────────────────────────────────────────
import { isSprintLocked, releaseSprintLock } from '../core/multi-ide.js';
import { pruneExpiredNervousPending } from '../core/pending-approvals.js';
import { isExecutionLockAuthorityArtifactName } from '../core/file-lock.js';
import { clearProviderExecutionHolds } from '../core/provider-execution-hold.js';
import { publishCanonicalRunStatusReadModel } from '../core/run-status-read-model.js';

// ─── Spawn backend abstraction ───────────────────────────────────
import type { SpawnBackend } from './spawn-backend.js';

// ─── Spawn backend tmpfile archive ────────────────────────────────
import { archivePromptFiles } from './spawn-backend-docker.js';

// ─── Tmux ────────────────────────────────────────────────────────
import { killWorker, listWorkers } from './tmux.js';

// ─── Auditor ──────────────────────────────────────────────────────
import { updateDashboard } from '../monitor/auditor.js';

// ─── Worker ──────────────────────────────────────────────────────
import { releaseAllLocks } from '../agents/worker.js';

// ─── IPC Registry ────────────────────────────────────────────────
import { getChannelRegistry } from './ipc-registry.js';

// ─── Plugin Hooks ─────────────────────────────────────────────────
import { clearHooks } from '../core/plugin-hooks.js';
import { DeckentError } from '../core/errors.js';

// ═══ Types ═════════════════════════════════════════════════════════

export class BrainError extends Error {
  public readonly phase?: SprintPhase;
  /** Optional machine-readable proof for failures before a Sprint can be persisted. */
  public readonly plannerProof?: PlannerProof;
  constructor(message: string, phase?: SprintPhase, plannerProof?: PlannerProof) {
    super(message);
    this.name = 'BrainError';
    this.phase = phase;
    this.plannerProof = plannerProof;
  }
}

export interface PauseState {
  schemaVersion: 2;
  sprintId: string;
  pausedAt: string;
  pausedTaskIds: string[];
  reason: string;
  reasonCode: string;
  phase: SprintPhase;
  status: 'PAUSED';
  recoveryCommand: string;
  finalizeCommand: string;
}

/** Valid checkpoint phases that can require human approval. */
export type CheckpointPhase = 'plan' | 'evaluate' | 'fix';

interface CheckpointFile {
  phase: string;
  summary: string;
  /**
   * 'timeout' (LIFECYCLE-CRITICAL-2, sprint-380 task 380-002): the bounded
   * approval wait expired with no human decision — distinct from an explicit
   * human 'rejected' so `deckent checkpoint list` / the MCP checkpoint tool
   * can tell a lost/forgotten approval apart from a real rejection. Every
   * other reader of this file (cli/commands/checkpoint.ts,
   * mcp/tools/checkpoint.ts, connectors/bot-agentic.ts) only ever compares
   * `status === 'pending'`, so this addition is non-breaking there.
   */
  status: 'pending' | 'approved' | 'rejected' | 'timeout';
  createdAt: string;
}

// ═══ Interrupt State ════════════════════════════════════════════════

/** Tracks the currently active sprint for SIGINT/interrupt cleanup. */
interface ActiveSprintRef {
  projectRoot: string;
  sprint: Sprint;
  spawnBackend?: SpawnBackend;
}

let _activeSprint: ActiveSprintRef | null = null;
let _isInterrupted = false;

/** Register the active sprint so SIGINT handler can clean it up. @internal */
export function setActiveSprint(projectRoot: string, sprint: Sprint, spawnBackend?: SpawnBackend): void {
  _activeSprint = { projectRoot, sprint, spawnBackend };
}

/** Clear the active sprint reference (called on sprint completion). @internal */
export function clearActiveSprint(): void {
  _activeSprint = null;
}

/** Reset interrupt flag — for use in tests only. @internal */
export function resetInterruptState(): void {
  _isInterrupted = false;
  _activeSprint = null;
}

/** Returns true if the sprint was interrupted via SIGINT. */
export function isInterrupted(): boolean {
  return _isInterrupted;
}

/**
 * Interrupt the active sprint: marks in-progress tasks as INTERRUPTED,
 * writes ABORTED status to heartbeat files, releases locks, and kills workers.
 * Called from the SIGINT handler in entry.ts.
 */
export function interruptActiveSprint(): void {
  if (_isInterrupted || !_activeSprint) return;
  _isInterrupted = true;

  const { projectRoot, sprint, spawnBackend } = _activeSprint;
  const tasksDir = join(projectRoot, TASKS_DIR);

  const activeStatuses = new Set([
    TaskStatus.PENDING,
    TaskStatus.CLAIMED,
    TaskStatus.EXECUTING,
    TaskStatus.TESTING,
    TaskStatus.DOCUMENTING,
  ]);

  for (const task of sprint.tasks) {
    if (!activeStatuses.has(task.status)) continue;

    // Mark task file as INTERRUPTED
    try {
      const taskPath = join(tasksDir, `task-${task.id}.json`);
      if (existsSync(taskPath)) {
        const raw = readFileSync(taskPath, 'utf-8');
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        parsed['status'] = 'INTERRUPTED';
        writeFileSync(taskPath, JSON.stringify(parsed, null, 2), 'utf-8');
      }
    } catch (e) { debugLog('interruptActiveSprint:markTaskInterrupted', e); }

    // Mark heartbeat as ABORTED
    try {
      const hbPath = join(tasksDir, `task-${task.id}.hb`);
      if (existsSync(hbPath)) {
        const raw = readFileSync(hbPath, 'utf-8');
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        parsed['status'] = 'ABORTED';
        parsed['timestamp'] = new Date().toISOString();
        writeFileSync(hbPath, JSON.stringify(parsed, null, 2), 'utf-8');
      }
    } catch (e) { debugLog('interruptActiveSprint:markHeartbeatAborted', e); }

    // Release locks for assigned workers
    if (task.assignedWorker) {
      try { releaseAllLocks(projectRoot, task.assignedWorker); } catch (e) { debugLog('interruptActiveSprint:releaseAllLocks', e); }
    }
  }

  // Kill all active workers
  try {
    const workers = spawnBackend ? spawnBackend.list() : listWorkers();
    for (const taskId of workers) {
      try {
        if (spawnBackend) spawnBackend.kill(taskId);
        else killWorker(taskId);
      } catch (e) { debugLog('interruptActiveSprint:killWorker', e); }
    }
  } catch (e) { debugLog('interruptActiveSprint:listWorkers', e); }

  // Release sprint lock on interrupt
  try { releaseSprintLock(projectRoot); } catch (e) { debugLog('interruptActiveSprint:releaseSprintLock', e); }
}

// ═══ Internal Helpers ══════════════════════════════════════════════

/** Write error dashboard state -- centralizes the repeated boilerplate in runSprint phases */
export function safeDashboardUpdate(
  projectRoot: string,
  sprint: Sprint,
  errorMessage: string,
): void {
  try {
    updateDashboard(projectRoot, {
      sprint: { id: sprint.id, number: sprint.number, phase: sprint.phase, status: sprint.status },
      agents: [],
      progress: { done: 0, active: 0, blocked: 0, total: sprint.tasks.length },
      alerts: [{ level: AlertLevel.WARNING, message: errorMessage, timestamp: new Date().toISOString() }],
      updatedAt: new Date().toISOString(),
    });
  } catch (e) { debugLog('safeDashboardUpdate:updateDashboard', e); }
}

// ═══ Cross-Sprint Orphan Handling (Sprint 168 C0e) ══════════════════

/**
 * Sprint startup hook — archives orphan prompt files left behind by a
 * previous sprint that did not run its cleanup phase (e.g. crash, kill -9,
 * power loss).
 *
 * Sprint 168 C0e (ADR-048 Prompt Lifecycle Contract — clause 5
 * "Cross-sprint orphan cleanup"): when a new sprint starts, any
 * `.prompt-*.txt` / `.worker-*.sh` tmpfiles still sitting in `.tasks/` from
 * the previous sprint MUST be archived (not deleted) so post-mortem forensic
 * evidence is preserved while not polluting the active sprint's working set.
 *
 * This is a thin wrapper around `archivePromptFiles()` (the same operation
 * cleanup() runs at sprint-end). Idempotent and safe to call when `.tasks/`
 * is empty or missing.
 *
 * @param projectRoot Project root directory (parent of `.tasks/`)
 * @param previousSprintId Identifier of the sprint whose orphans should be
 *   archived (used as the archive subdirectory name, e.g. `"sprint-167"`).
 */
export function cleanupPreviousSprintOrphans(
  projectRoot: string,
  previousSprintId: string,
): void {
  const tasksDir = join(projectRoot, TASKS_DIR);
  if (!existsSync(tasksDir)) return;
  try {
    archivePromptFiles(tasksDir, previousSprintId);
  } catch (e) {
    debugLog('cleanupPreviousSprintOrphans:archivePromptFiles', e);
  }
  sweepOrphanHeartbeats(tasksDir, previousSprintId);
}

/** Marker/heartbeat file suffixes a crashed worker can leave behind (BORN-486). */
const ORPHAN_HEARTBEAT_SUFFIXES = ['.hb', '.timeout', '.partial-result'] as const;

/**
 * BORN-486 — Sweep `task-*.hb` / `.timeout` / `.partial-result` files left
 * behind by `previousSprintId`.
 *
 * These markers survive when a sprint dies during spawn: `cleanup()` runs
 * with `cleanupPhase='spawn-fail'`, which deliberately PRESERVES
 * `task-*.json`/`.plan`/`.hb`/`.result` for post-mortem forensics (see
 * `CleanupPhaseKind` doc above). If the next sprint never revisits them, each
 * leftover `.hb` is picked up by `scanHeartbeats()` (monitor/auditor.ts) as a
 * "foreign task" on every 30s scan for that sprint's entire lifetime — a real
 * incident: sprint 365's preserved `task-365-001.hb` fired repeated CRITICAL
 * `hb.stale` alerts throughout sprint 366.
 *
 * Safety ("canlı-sprint'e ait olanlara dokunmadan" — never touch a live
 * sprint's files): a file is deleted only when it can be positively
 * attributed to `previousSprintId` —
 *   - its sidecar `task-<id>.json` is missing/unparseable (a live task always
 *     still has its json; absence means it is already orphaned), OR
 *   - the sidecar's `sprintId` matches `previousSprintId` exactly.
 * Any other (or missing) `sprintId` — including the sprint currently
 * starting — leaves the file untouched. Mirrors the
 * `archivePromptFiles(tasksDir, previousSprintId)` call above: same input,
 * same previous-sprint-id attribution, no new abstraction.
 */
function sweepOrphanHeartbeats(tasksDir: string, previousSprintId: string): void {
  let files: string[];
  try {
    files = readdirSync(tasksDir);
  } catch (e) {
    debugLog('sweepOrphanHeartbeats:readdir', e);
    return;
  }

  for (const file of files) {
    if (!file.startsWith('task-')) continue;
    const suffix = ORPHAN_HEARTBEAT_SUFFIXES.find((s) => file.endsWith(s));
    if (!suffix) continue;
    const taskId = file.slice('task-'.length, file.length - suffix.length);
    if (!taskId) continue;

    const sidecar = readJsonSafe<Task>(join(tasksDir, `task-${taskId}.json`));
    const isOrphanOfPreviousSprint = sidecar === null || sidecar.sprintId === previousSprintId;
    if (!isOrphanOfPreviousSprint) continue;

    try { unlinkSync(join(tasksDir, file)); } catch (e) { debugLog('sweepOrphanHeartbeats:unlink', e); }
  }
}

// ═══ Cleanup ══════════════════════════════════════════════════════

/**
 * Indicates which lifecycle event triggered a cleanup() invocation.
 *
 * - `sprint-end`: Normal sprint completion or CLI-driven cleanup. Tmpfiles
 *   (.prompt-*.txt, .worker-*.sh) are archived to .tasks/archive/sprint-{id}/.
 * - `spawn-fail`: Cleanup invoked from runSpawnPhase retry-failure path. The
 *   sprint did not reach its execution lifecycle, so tmpfiles are preserved
 *   in-place for post-mortem debugging — they are NOT archived or deleted.
 *
 * Sprint 156 Task 4 audit: previously, cleanup() unconditionally deleted
 * .prompt-* and .worker-*.sh tmpfiles (sprint-lifecycle.ts:266-272), even
 * when called from spawn-fail retry. This destroyed forensic evidence before
 * archival could run. The `cleanupPhase` parameter gates tmpfile handling.
 */
export type CleanupPhaseKind = 'sprint-end' | 'spawn-fail';

/**
 * Clean up all sprint resources: kill workers, release locks, remove task files
 * (.json, .plan, .hb, .result, .paused, .log), stale files, and lock files.
 *
 * Tmpfile handling (.prompt-*.txt, .worker-*.sh) is gated by `cleanupPhase`:
 * - `sprint-end` (default): tmpfiles archived via archivePromptFiles().
 * - `spawn-fail`: tmpfiles preserved in .tasks/ for post-mortem debugging.
 *
 * @param projectRoot - Project root directory
 * @param sprint - Sprint whose resources should be cleaned up
 * @param spawnBackend - Optional spawn backend for killing workers
 * @param cleanupPhase - Which lifecycle event triggered cleanup. Default `'sprint-end'`.
 */
export function cleanup(
  projectRoot: string,
  sprint: Sprint,
  spawnBackend?: SpawnBackend,
  cleanupPhase: CleanupPhaseKind = 'sprint-end',
): void {
  // Kill all active workers via backend or direct tmux calls
  const workers = spawnBackend ? spawnBackend.list() : listWorkers();
  for (const taskId of workers) {
    try {
      if (spawnBackend) spawnBackend.kill(taskId);
      else killWorker(taskId);
    } catch (e) { debugLog('cleanup:killWorker', e); }
  }

  // Kill workers on non-tmux provider adapters
  for (const task of sprint.tasks) {
    const provider = resolveTaskProvider(task);
    if (!isTmuxProvider(provider)) {
      const adapter = getProviderAdapterForTask(provider);
      if (adapter) {
        try { adapter.kill(task.id); } catch (e) { debugLog('cleanup:adapterKill', e); }
      }
    }
  }

  for (const task of sprint.tasks) {
    if (task.assignedWorker) {
      try { releaseAllLocks(projectRoot, task.assignedWorker); } catch (e) { debugLog('cleanup:releaseAllLocks', e); }
    }
  }

  const tasksDir = join(projectRoot, TASKS_DIR);
  // Task files are named from the sprint ID's padded segment (`task-001-001.json`,
  // see task-builder createTask); `sprint.number` is numeric and unpadded, so a
  // number-derived prefix (`task-1-`) never matches for sprints < 100 and cleanup
  // silently no-ops (PROD-SPRINT-PREFIX-PAD-001).
  const sprintTaskPrefix = `task-${sprint.id.replace(/^sprint-/, '')}-`;
  // Sprint 156 Task 4 follow-up (Sprint 157 hot fix, 2026-05-12):
  // TASK_FILE_EXTENSIONS unlink is now gated by cleanupPhase. On 'spawn-fail'
  // the task .json/.plan/.hb/.result files are PRESERVED for post-mortem
  // forensic — they would otherwise be wiped before any retry/recover. Stale
  // task file pruning still runs (always safe — only old-mtime files match).
  if (cleanupPhase === 'sprint-end' && existsSync(tasksDir)) {
    for (const file of readdirSync(tasksDir).filter(
      f => f.startsWith(sprintTaskPrefix)
        && TASK_FILE_EXTENSIONS.some(ext => f.endsWith(ext)),
    )) {
      try { unlinkSync(join(tasksDir, file)); } catch (e) { debugLog('cleanup:unlinkTaskFile', e); }
    }
    // Atomic writers may leave a process-suffixed temp after a crash
    // (`.result.tmp.<pid>` / `.landing-proposal.json.tmp.<pid>`). Finalize
    // preserves this evidence until terminal settlement; sprint-end cleanup
    // then retires only residue owned by the sprint being cleaned. Never use a
    // repository-wide tmp glob because another run may share the workspace.
    for (const file of readdirSync(tasksDir)) {
      if (
        file.startsWith(sprintTaskPrefix)
        && /\.(?:result|landing-proposal\.json)\.tmp(?:\.\d+)?$/u.test(file)
      ) {
        try { unlinkSync(join(tasksDir, file)); } catch (e) { debugLog('cleanup:unlinkTaskTempResidue', e); }
      }
    }
  }

  // ─── W0-TRUTH (#491, 2026-07-06 live lie) ──────────────────────────────
  // Per-sprint DISPLAY artifacts must die with the sprint, or `deckent status`
  // keeps rendering a ghost: `.dashboard` (auditor's final scan — its progress
  // numbers are a mid-close snapshot, not the sprint's true result) and
  // `.deckent/ci-baseline.json` (stale "0 tests" line). Also prune parked
  // nervous approvals whose own timeoutMs deadline passed — they can never be
  // meaningfully accepted and only make the pending-section lie. All fail-soft;
  // 'spawn-fail' preserves everything for post-mortem.
  if (cleanupPhase === 'sprint-end') {
    try { unlinkSync(join(projectRoot, DASHBOARD_FILE)); } catch (e) { debugLog('cleanup:unlinkDashboard', e); }
    try { unlinkSync(join(projectRoot, DECKENT_DIR, 'ci-baseline.json')); } catch (e) { debugLog('cleanup:unlinkCiBaseline', e); }
    try {
      const pruned = pruneExpiredNervousPending(projectRoot, Date.now());
      if (pruned.length > 0) debugLog('cleanup:pruneExpiredPending', `${pruned.length} expired approval(s) pruned: ${pruned.join(', ')}`);
    } catch (e) { debugLog('cleanup:pruneExpiredPending', e); }
  }

  // BORN-486: TASK_FILE_EXTENSIONS (core/constants.ts) predates the '.timeout'/
  // '.partial-result' worker-crash markers, so this always-on (phase-agnostic)
  // stale sweep never considered them — they could linger past their mtime
  // indefinitely. Extended locally (not in shared TASK_FILE_EXTENSIONS, which
  // other call sites depend on unchanged) to include them here too.
  const STALE_SWEEP_EXTENSIONS: readonly string[] = [...TASK_FILE_EXTENSIONS, '.timeout', '.partial-result'];
  if (existsSync(tasksDir)) {
    for (const file of readdirSync(tasksDir)) {
      if (
        (cleanupPhase !== 'sprint-end' || file.startsWith(sprintTaskPrefix))
        && STALE_SWEEP_EXTENSIONS.some(ext => file.endsWith(ext))
      ) {
        const fullPath = join(tasksDir, file);
        if (isStaleTaskFile(fullPath)) {
          try { unlinkSync(fullPath); } catch (e) { debugLog('cleanup:unlinkStaleTaskFile', e); }
        }
      }
    }
  }

  // Sprint 156 Task 4: Tmpfile handling is gated by cleanupPhase.
  // sprint-end → archive .prompt-*.txt and .worker-*.sh into .tasks/archive/sprint-{id}/.
  // spawn-fail → preserve tmpfiles in-place (post-mortem debugging value).
  // Previously (pre-Sprint 156) cleanup() unconditionally deleted these files, which
  // (a) destroyed forensic evidence on spawn-fail and (b) raced ahead of CLI cleanup's
  // own archivePromptFiles() call, leaving the archive directory empty.
  if (cleanupPhase === 'sprint-end' && existsSync(tasksDir)) {
    try {
      // Prompt tmpfiles embed the task id (`.prompt-001-001-<hash>.txt`), whose sprint
      // segment is the padded ID string — same authority as sprintTaskPrefix above.
      archivePromptFiles(tasksDir, sprint.id, 5, `${sprint.id.replace(/^sprint-/, '')}-`);
    } catch (e) { debugLog('cleanup:archivePromptFiles', e); }
  }

  // Clean up decision trail files from .deckent/runtime/decisions/
  const decisionsDir = join(projectRoot, DECISIONS_LOG_DIR);
  if (existsSync(decisionsDir)) {
    for (const file of readdirSync(decisionsDir)) {
      if (file.startsWith('decision-') && file.endsWith('.json')) {
        try { unlinkSync(join(decisionsDir, file)); } catch (e) { debugLog('cleanup:unlinkDecisionFile', e); }
      }
    }
  }

  // Sprint 157 hot fix (2026-05-12): also clean up .spawnlock files written by
  // Sprint 156 acquireSpawnLocks. Previously only .lock extension was cleaned,
  // leaving orphan .spawnlock files that blocked next sprint's spawn-time locks
  // when the Brain runner crashed mid-sprint without releasing them.
  const locksDir = join(projectRoot, LOCKS_DIR);
  if (existsSync(locksDir)) {
    for (const file of readdirSync(locksDir).filter(
      f => (f.endsWith('.lock') || f.endsWith('.spawnlock'))
        && !isExecutionLockAuthorityArtifactName(f),
    )) {
      try { unlinkSync(join(locksDir, file)); } catch (e) { debugLog('cleanup:unlinkLockFile', e); }
    }
  }

  // Release sprint lock on cleanup
  try { releaseSprintLock(projectRoot); } catch (e) { debugLog('cleanup:releaseSprintLock', e); }
  // A finalize/cleanup command runs in a different process from the original
  // coordinator, so owner-only release is intentionally a no-op there. Follow
  // it with the canonical liveness check: it removes only a dead/corrupt stale
  // lock and preserves a genuinely live foreign owner.
  try {
    const lock = isSprintLocked(projectRoot);
    if (lock.locked) {
      debugLog(
        'cleanup:preserveLiveSprintLock',
        `Preserved live sprint lock ${lock.sprintId} owned by PID ${lock.pid}`,
      );
    }
  } catch (e) { debugLog('cleanup:clearStaleSprintLock', e); }

  // Clear plugin hooks so they don't persist across sprints
  clearHooks();
}

// ═══ Human Checkpoint Support ═════════════════════════════════════

/**
 * Bounded ceiling for a human sprint-checkpoint approval wait before it times
 * out and the sprint parks (aborts cleanly) instead of polling forever.
 *
 * LIFECYCLE-CRITICAL-2 (sprint-380 task 380-002): `waitForHumanApproval` used
 * to `while(true)` poll with NO bound — a lost, forgotten, or misrouted
 * approval request hung the sprint indefinitely. 4h is a meaningful bound:
 * long enough to survive a normal work interruption (meeting, end of day)
 * without prematurely aborting a legitimate slow approval; short enough that
 * a truly lost request surfaces the same day instead of hanging for days.
 */
export const CHECKPOINT_APPROVAL_TIMEOUT_MS = 4 * 60 * 60 * 1000;

/**
 * Re-escalation cadence while a checkpoint is still pending — re-fires the
 * `human-checkpoint-required` notification so a missed/dismissed alert isn't
 * the operator's only chance to notice before the hard timeout parks the
 * sprint. Mirrors the re-notify-then-escalate shape already used by
 * `AskBrainEscalationTracker` (nervous/ask-brain-escalation.ts).
 */
export const CHECKPOINT_ESCALATION_INTERVAL_MS = 30 * 60 * 1000;

const CHECKPOINT_POLL_INTERVAL_MS = 5_000;

export interface WaitForHumanApprovalOptions {
  /** Overall wait ceiling before giving up and parking. Default {@link CHECKPOINT_APPROVAL_TIMEOUT_MS}. */
  timeoutMs?: number;
  /** Re-notify cadence while pending. Default {@link CHECKPOINT_ESCALATION_INTERVAL_MS}. */
  escalationIntervalMs?: number;
  /** Poll cadence. Default 5s — test seam only; production call sites never override this. */
  pollIntervalMs?: number;
}

/**
 * Wait for human approval at a sprint checkpoint.
 * Writes a checkpoint JSON file to `.deckent/checkpoints/` and polls until the
 * status is changed to 'approved' or 'rejected' — or the bounded timeout is
 * reached (LIFECYCLE-CRITICAL-2), in which case the checkpoint is marked
 * 'timeout', a final critical escalation notification fires, and the wait
 * resolves to `false` so the caller parks the sprint cleanly
 * (`SprintStatus.ABORTED`) instead of hanging forever on a lost/forgotten
 * approval request.
 * @returns true if approved, false if rejected, timed out, or interrupted
 */
export async function waitForHumanApproval(
  projectRoot: string,
  sprintId: string,
  phase: CheckpointPhase,
  summary: string,
  opts: WaitForHumanApprovalOptions = {},
): Promise<boolean> {
  const timeoutMs = Math.max(1, opts.timeoutMs ?? CHECKPOINT_APPROVAL_TIMEOUT_MS);
  const escalationIntervalMs = Math.max(1, opts.escalationIntervalMs ?? CHECKPOINT_ESCALATION_INTERVAL_MS);
  const pollIntervalMs = Math.max(1, opts.pollIntervalMs ?? CHECKPOINT_POLL_INTERVAL_MS);

  const checkpointsDir = join(projectRoot, '.deckent', 'checkpoints');
  mkdirSync(checkpointsDir, { recursive: true });

  const checkpointPath = join(checkpointsDir, `checkpoint-${sprintId}-${phase}.json`);
  const checkpoint: CheckpointFile = {
    phase,
    summary,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };

  await writeFile(checkpointPath, JSON.stringify(checkpoint, null, 2), 'utf-8');
  debugLog('waitForHumanApproval', `Checkpoint written: ${checkpointPath} — waiting for approval (timeout ${timeoutMs}ms)`);

  const lang = detectLang(projectRoot);

  // DECKENT→USER:NOTIFY (Hot Fix H6) — human-checkpoint-required (critical, immediate)
  try {
    void notify(
      'human-checkpoint-required',
      sprintId,
      getMessage('checkpoint.notify_pending_title', lang, { phase }),
      summary,
    );
  } catch (e) { debugLog('waitForHumanApproval:notify', e); }

  // Bounded poll loop (LIFECYCLE-CRITICAL-2): never wait unbounded. A
  // re-escalation notice fires every `escalationIntervalMs` while still
  // pending; reaching `timeoutMs` breaks out of the loop and falls through to
  // the timeout-park path below instead of looping forever.
  const startedAt = Date.now();
  let lastEscalationAt = startedAt;

  while (Date.now() - startedAt < timeoutMs) {
    await new Promise(resolve => setTimeout(resolve, pollIntervalMs));

    // Check for interrupt
    if (_isInterrupted) return false;

    try {
      const raw = await readFile(checkpointPath, 'utf-8');
      const current = JSON.parse(raw) as CheckpointFile;
      if (current.status === 'approved') {
        debugLog('waitForHumanApproval', `Checkpoint ${phase} approved`);
        return true;
      }
      if (current.status === 'rejected') {
        debugLog('waitForHumanApproval', `Checkpoint ${phase} rejected`);
        return false;
      }
    } catch (e) {
      debugLog('waitForHumanApproval:readCheckpoint', e);
    }

    const nowMs = Date.now();
    if (nowMs - lastEscalationAt >= escalationIntervalMs) {
      lastEscalationAt = nowMs;
      const elapsedMinutes = Math.round((nowMs - startedAt) / 60_000);
      try {
        void notify(
          'human-checkpoint-required',
          sprintId,
          getMessage('checkpoint.notify_escalation_title', lang, { phase }),
          getMessage('checkpoint.notify_escalation_summary', lang, {
            summary,
            elapsedMinutes: String(elapsedMinutes),
          }),
        );
      } catch (e) { debugLog('waitForHumanApproval:escalationNotify', e); }
    }
  }

  // Bounded timeout reached — park instead of hanging (LIFECYCLE-CRITICAL-2).
  // Mark the checkpoint 'timeout' (distinct from an explicit human
  // 'rejected') so `deckent checkpoint list` / the MCP checkpoint tool can
  // tell a lost approval apart from a real rejection, fire a final critical
  // escalation, and resolve false: every existing call site
  // (sprint-controller.ts PLAN/EVALUATE/FIX checkpoints) already treats
  // `false` as "stop cleanly" (`sprint.status = SprintStatus.ABORTED`) —
  // never as license to hang.
  try {
    const raw = await readFile(checkpointPath, 'utf-8');
    const current = JSON.parse(raw) as CheckpointFile;
    if (current.status === 'pending') {
      current.status = 'timeout';
      await writeFile(checkpointPath, JSON.stringify(current, null, 2), 'utf-8');
    }
  } catch (e) { debugLog('waitForHumanApproval:markTimeout', e); }

  try {
    void notify(
      'human-checkpoint-required',
      sprintId,
      getMessage('checkpoint.notify_timeout_title', lang, { phase }),
      getMessage('checkpoint.notify_timeout_summary', lang, {
        summary,
        timeoutMinutes: String(Math.round(timeoutMs / 60_000)),
      }),
    );
  } catch (e) { debugLog('waitForHumanApproval:timeoutNotify', e); }

  debugLog('waitForHumanApproval', `Checkpoint ${phase} timed out after ${timeoutMs}ms — parking sprint`);
  return false;
}

// ═══ Pause / Resume ════════════════════════════════════════════════

/**
 * Transitions active/pending tasks to PAUSED status, writes a .paused marker
 * file for each task, saves pause state, and updates the dashboard.
 * @internal Used only within orchestra/ — not part of the public API surface.
 */
export function pauseSprint(
  projectRoot: string,
  sprint: Sprint,
  reason: string = 'Manual pause',
  reasonCode: string = 'manual-pause',
): PauseState {
  const tasksPath = join(projectRoot, TASKS_DIR);
  const pausedTaskIds: string[] = [];

  for (const task of sprint.tasks) {
    if (
      task.status === TaskStatus.PENDING ||
      task.status === TaskStatus.CLAIMED ||
      task.status === TaskStatus.EXECUTING ||
      task.status === TaskStatus.TESTING ||
      task.status === TaskStatus.DOCUMENTING
    ) {
      const prevStatus = task.status;
      task.status = TaskStatus.PAUSED;

      // Write updated task JSON
      try {
        writeFileSync(
          join(tasksPath, `task-${task.id}.json`),
          JSON.stringify(task, null, 2),
          'utf-8',
        );
      } catch (e) { debugLog('pauseSprint:writeTaskFile', e); }

      // Write .paused marker with previous status for resume
      try {
        writeFileSync(
          join(tasksPath, `task-${task.id}.paused`),
          JSON.stringify({ taskId: task.id, previousStatus: prevStatus, pausedAt: now() }, null, 2),
          'utf-8',
        );
      } catch (e) { debugLog('pauseSprint:writePausedMarker', e); }

      pausedTaskIds.push(task.id);

      // Send PAUSE via IPC if a channel is registered for this task (subprocess backend)
      const channel = getChannelRegistry().get(task.id);
      if (channel) {
        try { channel.pause(); } catch (e) { debugLog('pauseSprint:channelPause', e); }
      } else {
        // No IPC channel -> tmux backend worker -- kill the session to stop execution
        try { killWorker(task.id); } catch (e) { debugLog('pauseSprint:killWorker', e); }
      }
    }
  }

  sprint.status = SprintStatus.PAUSED;

  const pauseState: PauseState = {
    schemaVersion: 2,
    sprintId: sprint.id,
    pausedAt: now(),
    pausedTaskIds,
    reason,
    reasonCode,
    phase: sprint.phase,
    status: 'PAUSED',
    recoveryCommand: `deckent recover ${sprint.id} --resume`,
    finalizeCommand: `deckent finalize --sprint ${sprint.id} --force`,
  };

  // Persist pause state
  try {
    const deckentDir = join(projectRoot, '.deckent');
    mkdirSync(deckentDir, { recursive: true });
    writeFileSync(
      join(projectRoot, PAUSE_STATE_FILE),
      JSON.stringify(pauseState, null, 2),
      'utf-8',
    );
  } catch (e) { debugLog('pauseSprint:writePauseState', e); }

  // Persist the same PAUSED truth to the canonical run-state authority and
  // capture a continuation checkpoint after task markers are committed.
  try { writeSprintState(projectRoot, sprint); } catch (e) { debugLog('pauseSprint:writeSprintState', e); }
  try {
    writeCheckpoint(projectRoot, sprint, computeEventStreamOffset(projectRoot, sprint.id));
  } catch (e) { debugLog('pauseSprint:writeCheckpoint', e); }

  // Update dashboard to reflect PAUSED status
  try {
    updateDashboard(projectRoot, {
      sprint: { id: sprint.id, number: sprint.number, phase: sprint.phase, status: SprintStatus.PAUSED },
      agents: [],
      progress: {
        done: sprint.tasks.filter(t => t.status === TaskStatus.DONE).length,
        active: 0,
        blocked: pausedTaskIds.length,
        total: sprint.tasks.length,
      },
        alerts: [{ level: AlertLevel.WARNING, message: reason, timestamp: now() }],
      updatedAt: now(),
    });
  } catch (e) { debugLog('pauseSprint:updateDashboard', e); }

  let statusReadModelPublicationError: unknown = null;
  try {
    const model = publishCanonicalRunStatusReadModel(projectRoot);
    if (model.authority.sprintId !== sprint.id || model.authority.lifecycle !== 'PAUSED') {
      throw new DeckentError('E_PAUSE_STATUS_READ_MODEL_AUTHORITY_MISMATCH', 'PAUSE_STATUS_READ_MODEL_AUTHORITY_MISMATCH');
    }
  } catch (e) {
    statusReadModelPublicationError = e;
    debugLog('pauseSprint:publishRunStatusReadModel', e);
  }

  // A parked run is an actionable human gate. Emit through both the general
  // notification dispatcher and Nervous live channel; plain status projects
  // the durable pause-state into its pending-approval list.
  const lang = detectLang(projectRoot);
  const title = getMessage('pause.notification_title', lang, { sprintId: sprint.id });
  const summary = getMessage('pause.notification_summary', lang, {
    reason,
    command: pauseState.recoveryCommand,
  });
  try {
    void notify('human-checkpoint-required', sprint.id, title, summary, undefined, {
      actions: [
        {
          label: getMessage('pause.action_resume', lang),
          cliCommand: pauseState.recoveryCommand,
        },
        {
          label: getMessage('pause.action_finalize', lang),
          cliCommand: pauseState.finalizeCommand,
        },
      ],
    });
  } catch (e) { debugLog('pauseSprint:notify', e); }
  try {
    writeEvent(projectRoot, sprint.id, 'deckent', 'user', CHANNELS.NERVOUS_NOTIFICATION, {
      kind: 'recovery',
      id: `resume:${sprint.id}`,
      title,
      acceptCommand: pauseState.recoveryCommand,
      rejectCommand: pauseState.finalizeCommand,
      reason,
      reasonCode,
    });
  } catch (e) { debugLog('pauseSprint:nervousNotification', e); }
  try {
    recordRecommendationOnce(
      projectRoot,
      'SPRINT_START',
      `resume:${sprint.id}`,
      {
        operation: 'resume-paused-run',
        sprintId: sprint.id,
        reasonCode,
        recoveryCommand: pauseState.recoveryCommand,
        finalizeCommand: pauseState.finalizeCommand,
      },
    );
  } catch (e) { debugLog('pauseSprint:nervousRecommendation', e); }

  if (statusReadModelPublicationError) throw statusReadModelPublicationError;

  return pauseState;
}

/**
 * Transitions PAUSED tasks back to PENDING, removes .paused marker files,
 * clears the pause state, and restores the dashboard to ACTIVE status.
 * @internal Used only within orchestra/ — not part of the public API surface.
 */
export function resumeSprint(
  projectRoot: string,
  sprint: Sprint,
): PauseState | null {
  const tasksPath = join(projectRoot, TASKS_DIR);

  // Load saved pause state (if available)
  const pauseState = readJsonSafe<PauseState>(join(projectRoot, PAUSE_STATE_FILE));

  const resumedTaskIds: string[] = [];

  for (const task of sprint.tasks) {
    if (task.status === TaskStatus.PAUSED) {
      task.status = TaskStatus.PENDING;

      // Write updated task JSON
      try {
        writeFileSync(
          join(tasksPath, `task-${task.id}.json`),
          JSON.stringify(task, null, 2),
          'utf-8',
        );
      } catch (e) { debugLog('resumeSprint:writeTaskFile', e); }

      // Remove .paused marker
      const pausedMarker = join(tasksPath, `task-${task.id}.paused`);
      if (existsSync(pausedMarker)) {
        try { unlinkSync(pausedMarker); } catch (e) { debugLog('resumeSprint:unlinkPausedMarker', e); }
      }

      resumedTaskIds.push(task.id);

      // Send RESUME via IPC if a channel is registered for this task (subprocess backend).
      const channel = getChannelRegistry().get(task.id);
      if (channel) {
        try { channel.resume(); } catch (e) { debugLog('resumeSprint:channelResume', e); }
      }
    }
  }

  sprint.status = SprintStatus.ACTIVE;

  // A deliberate resume is the authority transition that re-opens provider
  // admission after the operator fixed auth/quota. Preserve the historical hold
  // evidence and append explicit clear events; never make old evidence disappear.
  if (pauseState?.reasonCode === 'provider-execution-hold') {
    try {
      clearProviderExecutionHolds(projectRoot, sprint.id);
    } catch (e) { debugLog('resumeSprint:clearProviderExecutionHolds', e); }
  }

  // Remove pause state file
  const pauseStatePath = join(projectRoot, PAUSE_STATE_FILE);
  if (existsSync(pauseStatePath)) {
    try { unlinkSync(pauseStatePath); } catch (e) { debugLog('resumeSprint:unlinkPauseState', e); }
  }

  // Persist ACTIVE to the same canonical authorities that pauseSprint writes.
  // Without this, deleting pause-state exposed a stale PAUSED sprint-state and
  // status/recover disagreed immediately after a successful resume.
  try { writeSprintState(projectRoot, sprint); } catch (e) { debugLog('resumeSprint:writeSprintState', e); }
  try {
    writeCheckpoint(projectRoot, sprint, computeEventStreamOffset(projectRoot, sprint.id));
  } catch (e) { debugLog('resumeSprint:writeCheckpoint', e); }

  // Update dashboard to reflect ACTIVE status
  try {
    updateDashboard(projectRoot, {
      sprint: { id: sprint.id, number: sprint.number, phase: sprint.phase, status: SprintStatus.ACTIVE },
      agents: [],
      progress: {
        done: sprint.tasks.filter(t => t.status === TaskStatus.DONE).length,
        active: resumedTaskIds.length,
        blocked: 0,
        total: sprint.tasks.length,
      },
        alerts: [],
      updatedAt: now(),
    });
  } catch (e) { debugLog('resumeSprint:updateDashboard', e); }
  try {
    const model = publishCanonicalRunStatusReadModel(projectRoot);
    if (model.authority.sprintId !== sprint.id || model.authority.lifecycle !== 'ACTIVE') {
      throw new DeckentError('E_RESUME_STATUS_READ_MODEL_AUTHORITY_MISMATCH', 'RESUME_STATUS_READ_MODEL_AUTHORITY_MISMATCH');
    }
  } catch (e) {
    // Resume is transactional with its durable PAUSED authority. If the new
    // read model cannot be published, restore task markers + pause/state bytes
    // so recover remains possible and no half-resumed run is advertised.
    sprint.status = SprintStatus.PAUSED;
    for (const taskId of resumedTaskIds) {
      const task = sprint.tasks.find(candidate => candidate.id === taskId);
      if (!task) continue;
      task.status = TaskStatus.PAUSED;
      writeFileSync(
        join(tasksPath, `task-${task.id}.json`),
        JSON.stringify(task, null, 2),
        'utf-8',
      );
      writeFileSync(
        join(tasksPath, `task-${task.id}.paused`),
        JSON.stringify({ taskId: task.id, previousStatus: TaskStatus.PENDING, pausedAt: now() }, null, 2),
        'utf-8',
      );
    }
    if (pauseState) {
      writeFileSync(
        join(projectRoot, PAUSE_STATE_FILE),
        JSON.stringify(pauseState, null, 2),
        'utf-8',
      );
    }
    writeSprintState(projectRoot, sprint);
    try { publishCanonicalRunStatusReadModel(projectRoot); } catch { /* preserve primary failure */ }
    throw e;
  }
  try {
    dismissRecommendationByKey(
      projectRoot,
      'SPRINT_START',
      `resume:${sprint.id}`,
    );
  } catch (e) { debugLog('resumeSprint:dismissNervousRecommendation', e); }

  return pauseState;
}
