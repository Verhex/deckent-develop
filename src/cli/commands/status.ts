import { readFileSync, existsSync, readdirSync, watch } from 'node:fs';
import { join } from 'node:path';
import type { Command } from 'commander';
import { SprintPhase, SprintStatus, TaskStatus } from '../../core/types.js';
import type { DashboardState, Task } from '../../core/types.js';
import { DASHBOARD_FILE, TASKS_DIR, DECKENT_DIR } from '../../core/constants.js';
import { print, printError, formatDashboard, formatTable, formatHumanStatus, formatStandaloneStatus, isNoColor, stripAnsi , isDashboardOrphaned } from '../helpers/output.js';
import type { CIBaseline, CIReport } from '../helpers/output.js';
import { resolveProjectRoot } from '../helpers/process.js';
import { getMessage } from '../helpers/messages.js';
import { getCurrentSprintId } from '../../monitor/sprint-state.js';
import { formatStatus, resolveOutputMode } from '../../core/output-formatter.js';
import { eventBus } from '../../orchestra/event-bus.js';
import { StatusRenderer } from '../helpers/status-renderer.js';
import { readPendingApprovals } from '../../core/pending-approvals.js';
import { hideCursor, showCursor, clearScreen } from '../helpers/ansi.js';
import { registerShutdownHook } from '../helpers/shutdown-hooks.js';
import {
  type OpenTaskSettlementProjectionResult,
  type TaskSettlementProjection,
} from '../../core/task-settlement-authority.js';
import { resolveTenant } from '../../core/tenant-context.js';
import {
  formatTaskSettlementProjection,
  settlementProjectionDto,
} from './task-settlement.js';
import { readCanonicalRunStatus } from '../../core/run-status-authority.js';
import type { CanonicalRunStatus } from '../../core/run-status-authority.js';
import {
  foldTaskLineages,
  resolveTaskLineageRootId,
} from '../../core/task-lineage.js';
import { classifyTaskArtifact } from '../../core/task-artifact-classifier.js';
import {
  projectLogicalProgress,
  type LogicalProgressStatus,
} from '../../core/logical-progress-projection.js';
import { projectTerminalPublicationStatus as projectSharedTerminalPublicationStatus } from '../../core/sprint-terminal-publication-status.js';
import type { ProviderConcurrencyRuntimeProjection } from '../../core/provider-limit-admission.js';
import {
  readCanonicalRunStatusReadModel,
  runStatusReadModelMatchesAuthority,
  type CanonicalRunStatusReadModel,
} from '../../core/run-status-read-model.js';
import { DeckentError } from '../../core/errors.js';

interface StatusOpts {
  watch?: boolean;
  follow?: boolean;
  json?: boolean;
  verbose?: boolean;
  raw?: boolean;
  noColor?: boolean;
  graph?: boolean;
  mode?: string;
}

/**
 * Write one terminal-control frame and wait until Node confirms both the
 * frame callback and any backpressure drain. stdout is asynchronous for
 * Windows pipes, so the shared shutdown authority must await this before it
 * closes the process.
 */
function writeStdoutAndDrain(value: string): Promise<boolean> {
  const stdout = process.stdout;
  if (!stdout.writable || stdout.destroyed) return Promise.resolve(false);

  return new Promise<boolean>((resolve) => {
    let settled = false;
    let writeReturned = false;
    let callbackCompleted = false;
    let backpressured = false;
    let drainCompleted = false;

    const removeListeners = (): void => {
      stdout.off('error', onError);
      stdout.off('close', onClose);
      stdout.off('drain', onDrain);
    };
    const settle = (drained: boolean): void => {
      if (settled) return;
      settled = true;
      removeListeners();
      resolve(drained);
    };
    const maybeSettle = (): void => {
      if (
        writeReturned
        && callbackCompleted
        && (!backpressured || drainCompleted)
      ) {
        settle(true);
      }
    };
    const onError = (): void => settle(false);
    const onClose = (): void => settle(false);
    const onDrain = (): void => {
      drainCompleted = true;
      maybeSettle();
    };

    stdout.once('error', onError);
    stdout.once('close', onClose);
    stdout.once('drain', onDrain);
    try {
      const accepted = stdout.write(value, (error) => {
        if (error) {
          settle(false);
          return;
        }
        callbackCompleted = true;
        maybeSettle();
      });
      backpressured = !accepted;
      drainCompleted = accepted;
      writeReturned = true;
      maybeSettle();
    } catch {
      settle(false);
    }
  });
}

interface CoalescingFrameWriter {
  enqueue(frame: string): void;
  close(finalFrame: string): Promise<boolean>;
}

/**
 * Bounded live-output writer: at most one frame is in flight and one latest
 * frame is retained. Event bursts replace the pending frame instead of
 * growing an unbounded stdout queue. Shutdown drains the in-flight frame and
 * the retained latest frame before writing its terminal sentinel.
 */
function createCoalescingFrameWriter(
  onWriteFailure: () => void,
): CoalescingFrameWriter {
  let accepting = true;
  let failed = false;
  let inFlight: Promise<void> | undefined;
  let latestFrame: string | undefined;
  const idleWaiters = new Set<(drained: boolean) => void>();

  const resolveIdleWaiters = (): void => {
    if (inFlight || latestFrame !== undefined) return;
    for (const resolve of idleWaiters) resolve(!failed);
    idleWaiters.clear();
  };

  const startWrite = (frame: string): void => {
    const operation = writeStdoutAndDrain(frame)
      .then((drained) => {
        if (drained) return;
        failed = true;
        latestFrame = undefined;
        onWriteFailure();
      })
      .catch(() => {
        failed = true;
        latestFrame = undefined;
        onWriteFailure();
      })
      .finally(() => {
        if (inFlight === operation) inFlight = undefined;
        if (!failed && latestFrame !== undefined) {
          const next = latestFrame;
          latestFrame = undefined;
          startWrite(next);
          return;
        }
        resolveIdleWaiters();
      });
    inFlight = operation;
  };

  const waitForIdle = (): Promise<boolean> => {
    if (!inFlight && latestFrame === undefined) return Promise.resolve(!failed);
    return new Promise<boolean>((resolve) => {
      idleWaiters.add(resolve);
    });
  };

  return {
    enqueue(frame: string): void {
      if (!accepting || failed) return;
      if (inFlight) {
        latestFrame = frame;
        return;
      }
      startWrite(frame);
    },
    async close(finalFrame: string): Promise<boolean> {
      accepting = false;
      const liveFramesDrained = await waitForIdle();
      const finalFrameDrained = await writeStdoutAndDrain(finalFrame);
      return liveFramesDrained && finalFrameDrained;
    },
  };
}

export interface StatusCommandDeps {
  readonly openTaskSettlementProjection?: (
    projectRoot: string,
  ) => OpenTaskSettlementProjectionResult;
  /** Canonical provider admission plus direct execution-observation projection. */
  readonly providerConcurrencyRuntime?: (
    projectRoot: string,
    options?: { readonly currentTaskIds?: ReadonlySet<string> },
  ) => readonly ProviderConcurrencyRuntimeProjection[];
}

function matchingRunStatusReadModel(
  root: string,
  authority: CanonicalRunStatus,
): CanonicalRunStatusReadModel | null {
  try {
    const model = readCanonicalRunStatusReadModel(root);
    return model && runStatusReadModelMatchesAuthority(model, authority) ? model : null;
  } catch {
    return null;
  }
}

function runStatusReadModelSurface(
  model: CanonicalRunStatusReadModel | null,
): Record<string, unknown> {
  return model
    ? {
        state: 'persisted',
        schemaVersion: model.schemaVersion,
        revision: model.revision,
        runGeneration: model.runGeneration,
        modelDigest: model.modelDigest,
        holds: model.holds,
      }
    : { state: 'unavailable-or-stale' };
}

export function requiresPersistedRunStatusReadModel(authority: CanonicalRunStatus): boolean {
  // RECOVERY-PAUSE-STATUS-001 (smoke 2026-08-07): PAUSED is intentionally NOT
  // here. A typed-PAUSED authority is a RECONCILED state that already carries
  // lifecycle/reason/recoveryCommand — requiring a republished read-model only
  // produced RUN_STATUS_READ_MODEL_UNAVAILABLE and hid the recover remedy. The
  // JSON fall-through renders the authority (with recoveryCommand); the human
  // paths short-circuit to a paused banner (below). ORPHANED stays — it is a
  // CONTESTED state (the authority emits conflicts[]) where the born-688
  // read-model safety still earns its keep.
  // An ACTIVE lifecycle claim alone is not enough: stale sprint residue can
  // retain it after its process has died. The authority's `alive` coordinator
  // verdict is the sole exception, because it is derived from canonical PID
  // evidence.
  const hasProvenActiveLiveness = authority.active && authority.coordinator === 'alive';
  return !hasProvenActiveLiveness && (
    authority.active
    || authority.resumable
    || authority.lifecycle === 'ORPHANED'
  );
}

/**
 * RECOVERY-PAUSE-STATUS-001: the run-level paused banner for the human status
 * surface. formatHumanStatus only renders paused TASKS; a typed PAUSE also
 * needs the run-level reason + the exact recover command, sourced from the
 * authority (never guessed). Mirrors start.ts's renderPausedRun contract.
 */
export function formatPausedRunBanner(authority: CanonicalRunStatus, lang: string): string {
  const sprintId = authority.sprintId ?? '';
  const title = getMessage('pause.notification_title', lang, { sprintId });
  const summary = getMessage('pause.notification_summary', lang, {
    reason: authority.reason ?? authority.status ?? '',
    command: authority.recoveryCommand ?? `deckent recover ${sprintId} --resume`,
  });
  return `${title}
${summary}`;
}

function isQuiescentRunAuthority(authority: CanonicalRunStatus): boolean {
  return !authority.active
    && !authority.resumable
    && (
      authority.lifecycle === 'IDLE'
      || authority.lifecycle === 'COMPLETE'
      || authority.lifecycle === 'ABORTED'
    );
}

export interface StatusTaskSettlementDto
  extends ReturnType<typeof settlementProjectionDto> {
  /** Logical root task id; FIX attempts never create a second status row. */
  readonly taskId: string;
  /** Attempt whose current raw/effective settlement is projected. */
  readonly resolvedTaskId: string;
  readonly attemptIds: readonly string[];
  readonly attemptCount: number;
}

export function loadStatusTaskSettlements(
  root: string,
  tasks: readonly Task[],
  deps: StatusCommandDeps,
): readonly StatusTaskSettlementDto[] {
  if (tasks.length === 0 || !deps.openTaskSettlementProjection) return [];
  const lineages = foldTaskLineages(tasks);
  const opened = deps.openTaskSettlementProjection(root);
  try {
    const inputs = lineages.map(lineage => {
      const task = lineage.resolvedTask;
      const tenantId = resolveTenant(root, {
        ...(task.actor?.tenantId ? { tenantId: task.actor.tenantId } : {}),
      }).tenantId;
      return { taskId: task.id, rawStatus: task.status, tenantId };
    });
    const projections = opened.projectTaskExecutionStates(inputs);
    if (projections.length !== lineages.length) {
      throw new Error('TASK_SETTLEMENT_PROJECTION_CARDINALITY_MISMATCH');
    }
    return lineages.map((lineage, index) => {
      const projection = projections[index];
      if (!projection) {
        throw new Error('TASK_SETTLEMENT_PROJECTION_CARDINALITY_MISMATCH');
      }
      return {
        taskId: lineage.rootId,
        resolvedTaskId: lineage.resolvedTask.id,
        attemptIds: lineage.attemptIds,
        attemptCount: lineage.attempts.length,
        ...settlementProjectionDto(projection),
      };
    });
  } finally {
    opened.close();
  }
}

function formatStatusTaskSettlements(
  settlements: readonly StatusTaskSettlementDto[],
  lang: string,
): string | null {
  const material = settlements.filter(
    settlement =>
      settlement.receiptRef !== null
      || settlement.rawStatus !== settlement.effectiveStatus
      || settlement.evidenceRefs.length > 0
      || settlement.reasonCode === 'open-receipt'
      || settlement.reasonCode === 'ambiguous-receipts'
      || settlement.reasonCode === 'binding-absent',
  );
  if (material.length === 0) return null;
  const lines = [getMessage('status.task_settlements.header', lang)];
  for (const settlement of material) {
    const projection: TaskSettlementProjection = {
      rawStatus: settlement.rawStatus,
      effectiveStatus: settlement.effectiveStatus,
      evidenceRefs: settlement.evidenceRefs,
      reasonCode: settlement.reasonCode,
      ...(settlement.receiptRef ? { receiptRef: settlement.receiptRef } : {}),
    };
    lines.push(`  ${settlement.taskId} · ${formatTaskSettlementProjection(projection, lang)}`);
  }
  return lines.join('\n');
}

export function appendTaskSettlementsToFollowSnapshot(
  snapshot: string,
  root: string,
  tasks: readonly Task[],
  deps: StatusCommandDeps,
  lang: string,
): string {
  const settlements = formatStatusTaskSettlements(
    loadStatusTaskSettlements(root, tasks, deps),
    lang,
  );
  return settlements ? `${snapshot}\n${settlements}` : snapshot;
}

/**
 * Load Mermaid dependency graph from disk.
 * File-system based to avoid ADR-008 import cycle (status.ts must not import orchestra/).
 * Returns null if no persisted graph exists.
 */
export function loadDepGraphForSprint(root: string, sprintId: string): string | null {
  const mmdPath = join(root, DECKENT_DIR, `${sprintId}-depgraph.mmd`);
  if (!existsSync(mmdPath)) return null;
  try {
    return readFileSync(mmdPath, 'utf-8');
  } catch {
    return null;
  }
}

interface SprintMeta {
  title?: string;
  startedAt?: string;
}

function readCIData(root: string, sprintId?: string): { baseline?: CIBaseline; report?: CIReport } {
  let baseline: CIBaseline | undefined;
  const baselinePath = join(root, '.deckent', 'ci-baseline.json');
  if (existsSync(baselinePath)) {
    try {
      baseline = JSON.parse(readFileSync(baselinePath, 'utf-8')) as CIBaseline;
    } catch { /* ignore malformed */ }
  }

  let report: CIReport | undefined;
  if (sprintId) {
    const reportPath = join(root, '.brain', `ci-report-${sprintId}.json`);
    if (existsSync(reportPath)) {
      try {
        report = JSON.parse(readFileSync(reportPath, 'utf-8')) as CIReport;
      } catch { /* ignore malformed */ }
    }
  }

  return { baseline, report };
}

function readSprintMeta(root: string, _sprintId: string): SprintMeta {
  const result: SprintMeta = {};

  // Extract title from DIRECTIVES.md — tolerant regex
  try {
    const directivesPath = join(root, 'DIRECTIVES.md');
    if (existsSync(directivesPath)) {
      const content = readFileSync(directivesPath, 'utf-8');
      // Match various formats:
      // # DIRECTIVES — Sprint 040 (Title)
      // # DIRECTIVES — Sprint 040: Title
      // # DIRECTIVES: Sprint 040 — Title
      // # Sprint 040 — Title
      const titleMatch = content.match(
        /^#\s+(?:DIRECTIVES\s*[—:\-]\s*)?Sprint\s+\d+\s*[—:(]\s*([^)\n]+)/m,
      );
      if (titleMatch?.[1]) {
        result.title = titleMatch[1].replace(/\)\s*$/, '').trim();
      }
    }
  } catch {
    // ignore
  }

  // Read startedAt from config
  try {
    const configPath = join(root, '.deckent', 'config.json');
    if (existsSync(configPath)) {
      const cfg = JSON.parse(readFileSync(configPath, 'utf-8')) as { sprint_started_at?: string };
      if (cfg.sprint_started_at) {
        result.startedAt = cfg.sprint_started_at;
      }
    }
  } catch {
    // ignore
  }

  return result;
}

function readDashboard(dashPath: string): DashboardState | null {
  if (!existsSync(dashPath)) return null;
  try {
    return JSON.parse(readFileSync(dashPath, 'utf-8')) as DashboardState;
  } catch {
    return null;
  }
}

/**
 * Reads the language setting from the project config synchronously.
 * Falls back to 'en' if the config is missing or unreadable.
 */
export function getLangFromRoot(root: string): string {
  try {
    const configPath = join(root, '.deckent', 'config.json');
    if (!existsSync(configPath)) return 'en';
    const raw = readFileSync(configPath, 'utf-8');
    const cfg = JSON.parse(raw) as { language?: string };
    return cfg.language === 'tr' ? 'tr' : 'en';
  } catch {
    return 'en';
  }
}

export function loadTaskFiles(root: string): Task[] {
  const tasksDir = join(root, TASKS_DIR);
  if (!existsSync(tasksDir)) return [];
  const files = readdirSync(tasksDir)
    .sort((left, right) => left.localeCompare(right));
  const tasks: Task[] = [];
  for (const f of files) {
    try {
      const content = readFileSync(join(tasksDir, f), 'utf-8');
      const artifact = classifyTaskArtifact(f, content);
      if (artifact.kind !== 'task-record') continue;
      const parsed: unknown = JSON.parse(content);
      if (typeof parsed !== 'object' || parsed === null) continue;
      const data = parsed as Partial<Task>;
      if (
        data.id !== artifact.taskId
        || typeof data.title !== 'string'
        || data.status !== artifact.record.status
      ) continue;
      tasks.push(data as Task);
    } catch {
      // Skip malformed task files
    }
  }
  const activeSprintId = getCurrentSprintId(root);
  const scopedTasks = activeSprintId
    ? tasks.filter(task => task.sprintId === activeSprintId)
    : tasks;
  return scopedTasks.sort((left, right) => left.id.localeCompare(right.id));
}

function loadStatusSurfaceTasks(root: string): Task[] {
  return isQuiescentRunAuthority(readCanonicalRunStatus(root))
    ? []
    : loadTaskFiles(root);
}

function logicalProgressStatus(status: Task['status']): LogicalProgressStatus {
  if (status === TaskStatus.DONE) return 'done';
  if (status === TaskStatus.CLAIMED
    || status === TaskStatus.EXECUTING
    || status === TaskStatus.TESTING
    || status === TaskStatus.DOCUMENTING) return 'active';
  return 'blocked';
}

function taskSequence(task: Task): number | undefined {
  const timestamp = task.updatedAt ?? task.createdAt;
  if (!timestamp) return undefined;
  const value = Date.parse(timestamp);
  return Number.isSafeInteger(value) ? value : undefined;
}

/**
 * Status consumes the canonical logical-task projection rather than counting
 * directory entries or raw attempts. A malformed lineage is an explicit read
 * failure, never a presentation-time clamp.
 */
export function projectStatusLogicalProgress(tasks: readonly Task[]): {
  readonly done: number;
  readonly active: number;
  readonly blocked: number;
  readonly total: number;
  readonly attemptCount: number;
} {
  const tasksById = new Map(tasks.map(task => [task.id, task]));
  const result = projectLogicalProgress({
    attempts: tasks.map(task => {
      const sequence = taskSequence(task);
      return {
        id: task.id,
        logicalTaskId: resolveTaskLineageRootId(task, tasksById),
        status: logicalProgressStatus(task.status),
        ...(task.isPriorityFix && task.fixForTaskId
          ? { fixForAttemptId: task.fixForTaskId }
          : {}),
        ...(sequence !== undefined ? { sequence } : {}),
      };
    }),
  });
  if (!result.ok) {
    throw new DeckentError('E_STATUS_LOGICAL_PROGRESS', `STATUS_LOGICAL_PROGRESS_${result.diagnostic}`);
  }
  return result.projection;
}

export function projectTerminalPublicationStatus(
  root: string,
  authority: CanonicalRunStatus,
): ReturnType<typeof projectSharedTerminalPublicationStatus> {
  return projectSharedTerminalPublicationStatus(root, authority);
}

/**
 * Detect sprint ID from task files when no dashboard is available.
 */
function detectSprintId(tasks: Task[]): string | undefined {
  for (const t of tasks) {
    if (t.sprintId) return t.sprintId;
  }
  return undefined;
}

export function formatAgentAssignments(tasks: Task[], verbose: boolean): string {
  const lines: string[] = [];
  lines.push('\n--- Agent Assignments ---');
  const agentMap = new Map<string, string[]>();
  for (const t of tasks) {
    const agent = t.assignedAgent ?? 'generic';
    if (!agentMap.has(agent)) agentMap.set(agent, []);
    const agentTasks = agentMap.get(agent);
    if (agentTasks) agentTasks.push(t.id); // narrowed: set() called above
  }
  if (agentMap.size === 0) {
    lines.push('No agent assignments found.');
    return lines.join('\n');
  }
  if (verbose) {
    const headers = ['Agent', 'Tasks', 'Count'];
    const rows = Array.from(agentMap.entries()).map(([agent, taskIds]) => [
      agent,
      taskIds.join(', '),
      String(taskIds.length),
    ]);
    lines.push(formatTable(headers, rows));
  } else {
    for (const [agent, taskIds] of agentMap) {
      lines.push(`  ${agent}: ${taskIds.length} task(s)`);
    }
  }
  return lines.join('\n');
}

export function formatSkillAssignments(tasks: Task[], verbose: boolean): string {
  const lines: string[] = [];
  lines.push('\n--- Skill Assignments ---');
  const skillMap = new Map<string, string[]>();
  for (const t of tasks) {
    if (t.assignedSkills && t.assignedSkills.length > 0) {
      for (const skill of t.assignedSkills) {
        if (!skillMap.has(skill)) skillMap.set(skill, []);
        const skillTasks = skillMap.get(skill);
        if (skillTasks) skillTasks.push(t.id); // narrowed: set() called above
      }
    }
  }
  if (skillMap.size === 0) {
    lines.push('No skill assignments found.');
    return lines.join('\n');
  }
  if (verbose) {
    const headers = ['Skill', 'Tasks', 'Count'];
    const rows = Array.from(skillMap.entries()).map(([skill, taskIds]) => [
      skill,
      taskIds.join(', '),
      String(taskIds.length),
    ]);
    lines.push(formatTable(headers, rows));
  } else {
    for (const [skill, taskIds] of skillMap) {
      lines.push(`  ${skill}: ${taskIds.length} task(s)`);
    }
  }
  return lines.join('\n');
}

/** Output helper that respects NO_COLOR */
function output(message: string): void {
  print(isNoColor() ? stripAnsi(message) : message);
}

/**
 * Read and format the Worker Comms section for `deckent status`.
 * Returns null when worker_comms is disabled or config is unreadable (section hidden, no regression).
 * File-system based to avoid ADR-008 import cycle (matches loadDepGraphForSprint pattern).
 */
export function buildWorkerCommsSection(root: string, lang: string): string | null {
  // Check config — only render when worker_comms.enabled = true
  try {
    const configPath = join(root, '.deckent', 'config.json');
    if (!existsSync(configPath)) return null;
    const cfg = JSON.parse(readFileSync(configPath, 'utf-8')) as { worker_comms?: { enabled?: boolean } };
    if (!cfg.worker_comms?.enabled) return null;
  } catch {
    return null;
  }

  // Read shared memory entries from .tasks/shared/*.json
  const sharedDir = join(root, '.tasks', 'shared');
  const sharedEntries: Array<{ key: string; writerId: string }> = [];
  if (existsSync(sharedDir)) {
    try {
      const files = readdirSync(sharedDir).filter(f => typeof f === 'string' && (f as string).endsWith('.json'));
      for (const file of files) {
        try {
          const raw = JSON.parse(readFileSync(join(sharedDir, file as string), 'utf-8')) as {
            writerId?: unknown; writtenAt?: string; ttlMs?: number;
          };
          if (!raw?.writerId || typeof raw.writerId !== 'string') continue;
          if (raw.ttlMs !== undefined && raw.writtenAt) {
            const age = Date.now() - new Date(raw.writtenAt).getTime();
            if (age > raw.ttlMs) continue;
          }
          sharedEntries.push({ key: (file as string).replace(/\.json$/, ''), writerId: raw.writerId });
        } catch { /* skip malformed */ }
      }
    } catch { /* ignore dir read error */ }
  }

  // Read handoff counts from .tasks/handoffs/*.json
  const handoffsDir = join(root, '.tasks', 'handoffs');
  let pending = 0, executed = 0;
  if (existsSync(handoffsDir)) {
    try {
      const files = readdirSync(handoffsDir).filter(f => typeof f === 'string' && (f as string).endsWith('.json'));
      for (const file of files) {
        try {
          const h = JSON.parse(readFileSync(join(handoffsDir, file as string), 'utf-8')) as { status?: string };
          if (h?.status === 'pending') pending++;
          else executed++;
        } catch { /* skip malformed */ }
      }
    } catch { /* ignore dir read error */ }
  }

  // Format section
  const lines: string[] = [];
  lines.push(getMessage('status.worker_comms.header', lang));
  if (sharedEntries.length === 0) {
    lines.push('  ' + getMessage('status.worker_comms.no_shared', lang));
  } else {
    lines.push('  ' + getMessage('status.worker_comms.shared_keys', lang).replace('{count}', String(sharedEntries.length)));
    for (const e of sharedEntries.slice(-5)) {
      lines.push(`    - ${e.key} (by ${e.writerId})`);
    }
  }
  const totalHandoffs = pending + executed;
  if (totalHandoffs > 0) {
    lines.push(
      '  ' + getMessage('status.worker_comms.handoffs', lang)
        .replace('{pending}', String(pending))
        .replace('{executed}', String(executed)),
    );
  }
  return lines.join('\n');
}

/**
 * W4 — render the cross-surface "Pending approvals" section from the durable hub
 * (readPendingApprovals). Independent of sprint state: a parked nervous approval
 * surfaces in `deckent status` with the EXACT accept command, so the operator
 * never has to guess what to run. Returns null when nothing is parked.
 */
export function buildPendingApprovalsSection(root: string, lang: string): string | null {
  // born-698c: same read-path pattern for detached-run deaths — a flow whose
  // run process died without finalizing gets an honest RUN_FAILED closure
  // the moment ANY surface reads status (never a silent limbo).
  void import('../../orchestra/run-flow-death-sweep.js')
    .then(({ sweepDeadDetachedRuns }) => sweepDeadDetachedRuns(root))
    .catch(() => { /* fail-soft: status must render even if the sweep cannot run */ });
  const pending = readPendingApprovals(root);
  if (pending.length === 0) return null;
  const lines: string[] = [getMessage('status.pending_approvals.header', lang, { count: String(pending.length) })];
  for (const p of pending.slice(0, 5)) {
    lines.push(`  ⏳ ${p.title}  →  ${p.acceptCommand}`);
  }
  if (pending.length > 5) {
    lines.push('  ' + getMessage('status.pending_approvals.more', lang, { count: String(pending.length - 5) }));
  }
  return lines.join('\n');
}

/**
 * Canonical `deckent status --json` payload for every "no active run" state
 * (no dashboard at all, or a dashboard whose writer died — isDashboardOrphaned).
 * Both call sites must emit this exact shape so a JSON consumer never has to
 * special-case which branch produced it (born-688 contract).
 */
export function buildNoActiveStatusJson(
  root: string,
  _deps: StatusCommandDeps = {},
): Record<string, unknown> {
  const authority = readCanonicalRunStatus(root);
  const readModel = matchingRunStatusReadModel(root, authority);
  if (requiresPersistedRunStatusReadModel(authority) && !readModel) {
    return {
      active: false,
      lifecycle: 'UNAVAILABLE',
      resumable: authority.resumable,
      sprintId: authority.sprintId,
      authority,
      logicalProgress: null,
      terminalPublication: null,
      providerConcurrency: [],
      statusReadModel: runStatusReadModelSurface(null),
      error: {
        code: 'RUN_STATUS_READ_MODEL_UNAVAILABLE',
        disposition: 'HOLD',
      },
      pendingApprovals: readPendingApprovals(root),
    };
  }
  return {
    active: authority.active,
    lifecycle: authority.lifecycle,
    resumable: authority.resumable,
    sprintId: authority.sprintId,
    phase: authority.phase,
    status: authority.status,
    reason: authority.reason,
    recoveryCommand: authority.recoveryCommand,
    finalizeCommand: authority.finalizeCommand,
    authority,
    terminalPublication: readModel?.terminalPublication ?? null,
    providerConcurrency: readModel?.providerConcurrency ?? [],
    statusReadModel: runStatusReadModelSurface(readModel),
    pendingApprovals: readPendingApprovals(root),
  };
}

export interface CanonicalDashboardProjection {
  readonly dashboard: DashboardState;
  readonly metadata: {
    readonly schemaVersion: 1;
    readonly lifecycleAuthority: 'run-status-authority-v1';
    readonly dashboardLifecycleNormalized: boolean;
    readonly progressAdjusted: boolean;
  };
}

/**
 * A dashboard is not lifecycle authority when durable authority exists. When
 * no durable run identity exists at all, however, retain the dashboard's
 * display data as an explicitly lower-priority discovery fallback. This keeps
 * legacy status consumers useful without allowing stale residue to override a
 * terminal, paused, orphaned, or otherwise identified canonical run.
 */
function hasNoDurableRunIdentity(authority: CanonicalRunStatus): boolean {
  return authority.lifecycle === 'IDLE' && authority.sprintId === null;
}

function boundedDashboardProgress(
  progress: DashboardState['progress'],
): DashboardState['progress'] {
  const total = Math.max(0, Math.trunc(progress.total));
  const done = Math.min(total, Math.max(0, Math.trunc(progress.done)));
  const active = Math.min(total - done, Math.max(0, Math.trunc(progress.active)));
  const blocked = Math.min(
    total - done - active,
    Math.max(0, Math.trunc(progress.blocked)),
  );
  return { done, active, blocked, total };
}

/**
 * Project presentation-only dashboard bytes through the canonical lifecycle
 * authority. Every status renderer consumes this shape, so a stale dashboard
 * can be recorded as a conflict but can never publish a competing phase/status
 * or an impossible `done > total` aggregate.
 */
export function projectDashboardThroughRunAuthority(
  state: DashboardState,
  tasks: readonly Task[],
  authority: CanonicalRunStatus,
  canonicalProgress?: CanonicalRunStatusReadModel['logicalProgress'],
): CanonicalDashboardProjection {
  const taskProgress = canonicalProgress ?? (
    hasNoDurableRunIdentity(authority)
      ? (tasks.length > 0 ? projectStatusLogicalProgress(tasks) : state.progress)
      : state.progress
  );
  const progress = boundedDashboardProgress(taskProgress);
  const phase = authority.phase
    && Object.values(SprintPhase).includes(authority.phase as SprintPhase)
      ? authority.phase as SprintPhase
      : state.sprint.phase;
  const status = authority.status
    && Object.values(SprintStatus).includes(authority.status as SprintStatus)
      ? authority.status as SprintStatus
      : state.sprint.status;
  const sprintId = authority.sprintId ?? state.sprint.id;
  const dashboardLifecycleNormalized = sprintId !== state.sprint.id
    || phase !== state.sprint.phase
    || status !== state.sprint.status;
  const progressAdjusted = progress.done !== taskProgress.done
    || progress.active !== taskProgress.active
    || progress.blocked !== taskProgress.blocked
    || progress.total !== taskProgress.total;

  return {
    dashboard: {
      ...state,
      sprint: {
        ...state.sprint,
        id: sprintId,
        number: Number.parseInt(sprintId.replace(/^sprint-/u, ''), 10)
          || state.sprint.number,
        phase,
        status,
      },
      // Orphaned agents remain observable residue; lifecycle still comes from
      // canonical authority and terminal runs never render live workers.
      agents: authority.active
        || authority.lifecycle === 'ORPHANED'
        || hasNoDurableRunIdentity(authority)
        ? state.agents
        : [],
      progress,
    },
    metadata: {
      schemaVersion: 1,
      lifecycleAuthority: 'run-status-authority-v1',
      dashboardLifecycleNormalized,
      progressAdjusted,
    },
  };
}

function statusFormatterData(
  state: DashboardState,
  tasks: readonly Task[],
): Record<string, unknown> {
  const lineages = foldTaskLineages(tasks);
  const progress = {
    done: state.progress?.done ?? 0,
    active: state.progress?.active ?? 0,
    blocked: state.progress?.blocked ?? 0,
    total: state.progress?.total ?? 0,
  };
  return {
    sprintId: state.sprint.id,
    phase: state.sprint.phase as string | undefined,
    totalTasks: progress.total,
    completedTasks: progress.done,
    failedTasks: lineages.filter(
      lineage => (lineage.resolvedTask.status as string) === 'NO_GO',
    ).length,
    techDebtTasks: lineages.filter(
      lineage => ((lineage.resolvedTask as unknown as Record<string, unknown>)['evaluationDecision'] as string)
        === 'GO_WITH_TECH_DEBT',
    ).length,
    activeWorkers: state.agents?.length ?? 0,
  };
}

/**
 * One immutable read-set for every machine status surface. Streaming callers
 * serialize each returned value as one NDJSON record; one-shot callers pretty
 * print exactly one document.
 */
export function buildStatusJsonSnapshot(
  root: string,
  dashPath: string,
  deps: StatusCommandDeps,
  verbose = false,
): Record<string, unknown> {
  const authority = readCanonicalRunStatus(root);
  const tasks = isQuiescentRunAuthority(authority) ? [] : loadTaskFiles(root);
  const readModel = matchingRunStatusReadModel(root, authority);
  if (requiresPersistedRunStatusReadModel(authority) && !readModel) {
    return buildNoActiveStatusJson(root, deps);
  }
  if (isQuiescentRunAuthority(authority)) {
    return buildNoActiveStatusJson(root, deps);
  }
  if (!existsSync(dashPath)) {
    if (tasks.length === 0) return buildNoActiveStatusJson(root, deps);
    const sprintId = authority.sprintId ?? getCurrentSprintId(root) ?? detectSprintId(tasks);
    const lineages = foldTaskLineages(tasks);
    return {
      standalone: true,
      active: authority.active,
      lifecycle: authority.lifecycle,
      resumable: authority.resumable,
      sprintId,
      authority,
      terminalPublication: readModel?.terminalPublication ?? null,
      providerConcurrency: readModel?.providerConcurrency ?? [],
      statusReadModel: runStatusReadModelSurface(readModel),
      pendingApprovals: readPendingApprovals(root),
      progress: readModel?.logicalProgress ?? null,
      tasks: lineages.map(lineage => ({
        id: lineage.rootId,
        title: lineage.rootTask.title,
        status: lineage.resolvedTask.status,
        model: lineage.resolvedTask.model,
        resolvedTaskId: lineage.resolvedTask.id,
        attemptIds: lineage.attemptIds,
        attemptCount: lineage.attempts.length,
      })),
      taskSettlements: loadStatusTaskSettlements(root, tasks, deps),
      ...(verbose
        ? {
            agents: tasks.map(task => ({
              taskId: task.id,
              agent: task.assignedAgent ?? 'generic',
              skills: task.assignedSkills ?? [],
            })),
          }
        : {}),
    };
  }
  if (
    !authority.active
    && !authority.resumable
    && !hasNoDurableRunIdentity(authority)
    && (
      authority.lifecycle === 'IDLE'
      || authority.lifecycle === 'COMPLETE'
      || authority.lifecycle === 'ABORTED'
    )
  ) {
    return buildNoActiveStatusJson(root, deps);
  }

  const state = JSON.parse(readFileSync(dashPath, 'utf-8')) as DashboardState;
  const isOrphaned = isDashboardOrphaned(state, {
    hasLiveSprint: getCurrentSprintId(root) !== null,
    hasTasks: tasks.length > 0,
    nowMs: Date.now(),
  });
  const sprint = state.sprint as { status?: string; phase?: string };
  if (
    isOrphaned
    || sprint.status === 'COMPLETE'
    || sprint.phase === 'COMPLETE'
  ) {
    return buildNoActiveStatusJson(root, deps);
  }

  const taskSettlements = loadStatusTaskSettlements(root, tasks, deps);
  const logicalProgress = tasks.length > 0 ? readModel?.logicalProgress ?? null : null;
  const projection = projectDashboardThroughRunAuthority(
    state,
    tasks,
    authority,
    readModel?.logicalProgress,
  );
  const projectedState = projection.dashboard;
  const snapshot = verbose
    ? {
        ...projectedState,
        taskSettlements,
        _verbose: {
          agents: tasks.map(task => ({
            id: task.id,
            agent: task.assignedAgent ?? 'generic',
            skills: task.assignedSkills ?? [],
          })),
        },
      }
    : { ...projectedState, taskSettlements };
  return {
    ...snapshot,
    active: authority.active,
    lifecycle: authority.lifecycle,
    resumable: authority.resumable,
    sprintId: authority.sprintId,
    phase: authority.phase,
    status: authority.status,
    recoveryCommand: authority.recoveryCommand,
    finalizeCommand: authority.finalizeCommand,
    authority,
    terminalPublication: readModel?.terminalPublication ?? null,
    providerConcurrency: readModel?.providerConcurrency ?? [],
    statusReadModel: runStatusReadModelSurface(readModel),
    logicalProgress,
    statusProjection: projection.metadata,
    pendingApprovals: readPendingApprovals(root),
  };
}

export function registerStatus(
  program: Command,
  deps: StatusCommandDeps = {},
): void {
  const registerLang = getLangFromRoot(resolveProjectRoot());
  program
    .command('status')
    .description(getMessage('status.desc', registerLang))
    .option('--watch', 'Auto-refresh every 2 seconds')
    .option('-f, --follow', 'Follow mode: snapshot + live event tail')
    .option('--json', 'Output raw JSON instead of formatted dashboard')
    .option('--raw', 'Show legacy raw dashboard (box format)')
    .option('--verbose', 'Show detailed agent and skill assignment info')
    .option('--no-color', 'Disable colored output')
    .option('--graph', 'Display dependency graph as Mermaid diagram')
    .option('--mode <mode>', 'Output render mode: explainatory | standart | verbose | json')
    .action((opts: StatusOpts) => {
      const root = resolveProjectRoot();
      const dashPath = join(root, DASHBOARD_FILE);
      const lang = getLangFromRoot(root);
      const resolvedMode = opts.mode ? resolveOutputMode(opts.mode) : undefined;
      const jsonMode = opts.json === true || resolvedMode === 'json';

      // RECOVERY-PAUSE-STATUS-001: a typed-PAUSED run is rendered from the
      // authority BEFORE any dashboard/task-file branching. Earlier the
      // no-dashboard path printed "No active run" and swallowed the paused
      // state + recover command entirely (measured: pause-state.json present,
      // no .dashboard). The human banner carries the run-level remedy
      // formatHumanStatus does not; the JSON path already renders the paused
      // authority (recoveryCommand included) via buildStatusJsonSnapshot below.
      if (!jsonMode && !opts.watch && !opts.follow && !opts.graph && !opts.raw) {
        const pausedAuthority = readCanonicalRunStatus(root);
        if (pausedAuthority.lifecycle === 'PAUSED') {
          print(formatPausedRunBanner(pausedAuthority, lang));
          const pendingPaused = buildPendingApprovalsSection(root, lang);
          if (pendingPaused) print(pendingPaused);
          return;
        }
      }

      if (opts.graph && jsonMode) {
        const sprintId = getCurrentSprintId(root);
        const graph = sprintId ? loadDepGraphForSprint(root, sprintId) : null;
        output(JSON.stringify({
          schemaVersion: 1,
          command: 'status.graph',
          active: sprintId !== null,
          sprintId,
          graph,
          reasonCode: sprintId === null
            ? 'no-active-run'
            : graph === null
              ? 'graph-not-found'
              : 'ready',
        }, null, 2));
        return;
      }

      // --follow: live event-driven refresh using EventBus
      if (opts.follow) {
        const renderer = new StatusRenderer({
          projectRoot: root,
          noColor: opts.noColor ?? isNoColor(),
        });
        const followSnapshot = (): string => {
          const tasks = loadStatusSurfaceTasks(root);
          if (opts.raw) {
            const state = readDashboard(dashPath);
            const snapshot = state
              ? formatDashboard(state)
              : tasks.length > 0
                ? formatStandaloneStatus(
                    tasks,
                    getCurrentSprintId(root) ?? detectSprintId(tasks),
                  )
                : getMessage('status.no_active_sprint', lang);
            return appendTaskSettlementsToFollowSnapshot(
              snapshot,
              root,
              tasks,
              deps,
              lang,
            );
          }
          if (resolvedMode && resolvedMode !== 'json') {
            const state = readDashboard(dashPath);
            const snapshot = state
              ? formatStatus(statusFormatterData(state, tasks), resolvedMode)
              : tasks.length > 0
                ? formatStandaloneStatus(
                    tasks,
                    getCurrentSprintId(root) ?? detectSprintId(tasks),
                  )
                : getMessage('status.no_active_sprint', lang);
            return appendTaskSettlementsToFollowSnapshot(
              snapshot,
              root,
              tasks,
              deps,
              lang,
            );
          }
          return appendTaskSettlementsToFollowSnapshot(
            renderer.snapshot(),
            root,
            tasks,
            deps,
            lang,
          );
        };

        const sprintId = getCurrentSprintId(root);
        let unsubscribe: (() => void) | undefined;
        let fallbackTimer: ReturnType<typeof setInterval> | undefined;
        let unregisterShutdown: (() => void) | undefined;
        let cleanupPromise: Promise<void> | undefined;
        let cleanup: (requestedExitCode?: number) => Promise<void>;
        const writer = createCoalescingFrameWriter(() => {
          void cleanup(1);
        });
        cleanup = (requestedExitCode?: number): Promise<void> => {
          if (cleanupPromise) return cleanupPromise;

          let finishCleanup: (() => void) | undefined;
          cleanupPromise = new Promise<void>((resolve) => {
            finishCleanup = resolve;
          });

          let cleanupFailed = false;
          try {
            unsubscribe?.();
          } catch {
            cleanupFailed = true;
          }
          try {
            eventBus.unwatchAll();
          } catch {
            cleanupFailed = true;
          }
          if (fallbackTimer) clearInterval(fallbackTimer);

          void (async () => {
            let outputDrained = false;
            try {
              outputDrained = await writer.close(
                jsonMode ? '' : showCursor() + '\n',
              );
            } catch {
            } finally {
              // Unregister only after the first await: runShutdownHooks() maps
              // the live registry synchronously, and splicing this hook during
              // that map could otherwise skip a sibling shutdown hook.
              try {
                unregisterShutdown?.();
              } catch {
                cleanupFailed = true;
              }
              if (requestedExitCode !== undefined) {
                process.exitCode = cleanupFailed || !outputDrained
                  ? 1
                  : requestedExitCode;
              }
              finishCleanup?.();
            }
          })();
          return cleanupPromise;
        };

        const renderFollow = (): void => {
          if (cleanupPromise) return;
          try {
            if (jsonMode) {
              writer.enqueue(
                `${JSON.stringify(buildStatusJsonSnapshot(root, dashPath, deps, !!opts.verbose))}\n`,
              );
              return;
            }
            const next = followSnapshot();
            writer.enqueue(clearScreen() + next);
          } catch {
            printError(new Error(getMessage('status.dashboard_read_failed', lang)));
            void cleanup(1);
          }
        };

        unregisterShutdown = registerShutdownHook(async () => {
          await cleanup();
        });
        try {
          if (jsonMode) {
            writer.enqueue(
              `${JSON.stringify(buildStatusJsonSnapshot(root, dashPath, deps, !!opts.verbose))}\n`,
            );
          } else {
            writer.enqueue(hideCursor() + clearScreen() + followSnapshot());
          }
          if (sprintId) {
            eventBus.watchFile(root, sprintId);
            unsubscribe = eventBus.subscribe(sprintId, undefined, renderFollow);
          }
          fallbackTimer = setInterval(renderFollow, 5000);
        } catch {
          printError(new Error(getMessage('status.dashboard_read_failed', lang)));
          void cleanup(1);
        }
        return;
      }

      // --graph: display Mermaid dependency graph (reads .deckent/sprint-NNN-depgraph.mmd)
      // Checked before dashboard existence so it works even when no dashboard is active.
      if (opts.graph) {
        const sprintId = getCurrentSprintId(root);
        if (!sprintId) {
          output(getMessage('status.graph_no_active_run', lang));
          return;
        }
        const mmd = loadDepGraphForSprint(root, sprintId);
        if (!mmd) {
          output(getMessage('status.graph_not_found', lang, { id: sprintId }));
          return;
        }
        output(`\n--- Dependency Graph (${sprintId}) ---\n`);
        output(mmd);
        output('\n--- End of Dependency Graph ---');
        return;
      }

      if (jsonMode && !opts.watch) {
        try {
          output(JSON.stringify(
            buildStatusJsonSnapshot(root, dashPath, deps, !!opts.verbose),
            null,
            2,
          ));
        } catch {
          printError(new Error(getMessage('status.dashboard_read_failed', lang)));
          process.exitCode = 1;
        }
        return;
      }

      // (A) Standalone mode: if no dashboard, try task files
      if (!existsSync(dashPath)) {
        const tasks = loadStatusSurfaceTasks(root);
        if (tasks.length > 0) {
          const authority = readCanonicalRunStatus(root);
          if (
            requiresPersistedRunStatusReadModel(authority)
            && !matchingRunStatusReadModel(root, authority)
          ) {
            printError(new Error(getMessage('status.read_model_hold', lang)));
            process.exitCode = 2;
            return;
          }
          // Use canonical sprint-state.json as source of truth; fall back to task file scan
          const sprintId = getCurrentSprintId(root) ?? detectSprintId(tasks);
          const taskSettlements = loadStatusTaskSettlements(root, tasks, deps);
          if (jsonMode) {
            const standaloneData = {
              standalone: true,
              sprintId,
              tasks: tasks.map(t => ({ id: t.id, title: t.title, status: t.status, model: t.model })),
              taskSettlements,
              ...(opts.verbose ? { agents: tasks.map(t => ({ taskId: t.id, agent: t.assignedAgent ?? 'generic', skills: t.assignedSkills ?? [] })) } : {}),
            };
            output(JSON.stringify(standaloneData, null, 2));
          } else {
            output(formatStandaloneStatus(tasks, sprintId));
            const settlementsStandalone = formatStatusTaskSettlements(taskSettlements, lang);
            if (settlementsStandalone) output(settlementsStandalone);
            const commsStandalone = buildWorkerCommsSection(root, lang);
            if (commsStandalone) output(commsStandalone);
            const pendingStandalone = buildPendingApprovalsSection(root, lang);
            if (pendingStandalone) output(pendingStandalone);
          }
          return;
        }
        if (jsonMode) {
          output(JSON.stringify(buildNoActiveStatusJson(root, deps), null, 2));
          return;
        }
        print(getMessage('status.no_active_sprint', lang));
        const pendingNoSprint = buildPendingApprovalsSection(root, lang);
        if (pendingNoSprint) print(pendingNoSprint);
        return;
      }

      if (opts.watch) {
        let watcher: ReturnType<typeof watch> | undefined;
        let timer: ReturnType<typeof setInterval> | undefined;
        let unregisterShutdown: (() => void) | undefined;
        let cleanupPromise: Promise<void> | undefined;
        let cleanup: (requestedExitCode?: number) => Promise<void>;
        const writer = createCoalescingFrameWriter(() => {
          void cleanup(1);
        });

        cleanup = (requestedExitCode?: number): Promise<void> => {
          if (cleanupPromise) return cleanupPromise;

          let finishCleanup: (() => void) | undefined;
          cleanupPromise = new Promise<void>((resolve) => {
            finishCleanup = resolve;
          });

          let cleanupFailed = false;
          try {
            watcher?.close();
          } catch {
            cleanupFailed = true;
          }
          if (timer) clearInterval(timer);

          void (async () => {
            let outputDrained = false;
            try {
              outputDrained = await writer.close(jsonMode ? '' : '\n');
            } catch {
            } finally {
              try {
                unregisterShutdown?.();
              } catch {
                cleanupFailed = true;
              }
              if (requestedExitCode !== undefined) {
                process.exitCode = cleanupFailed || !outputDrained
                  ? 1
                  : requestedExitCode;
              }
              finishCleanup?.();
            }
          })();
          return cleanupPromise;
        };

        const watchFrame = (): string | null => {
          if (jsonMode) {
            return `${JSON.stringify(
              buildStatusJsonSnapshot(root, dashPath, deps, !!opts.verbose),
            )}\n`;
          }
          const rawState = readDashboard(dashPath);
          if (!rawState) return null;

          const tasks = loadStatusSurfaceTasks(root);
          const authority = readCanonicalRunStatus(root);
          const readModel = matchingRunStatusReadModel(root, authority);
          if (requiresPersistedRunStatusReadModel(authority) && !readModel) {
            return `\x1Bc${getMessage('status.read_model_hold', lang)}\n`;
          }
          const state = opts.raw
            ? rawState
            : projectDashboardThroughRunAuthority(
                rawState,
                tasks,
                authority,
                readModel?.logicalProgress,
              ).dashboard;
          const taskSettlements = loadStatusTaskSettlements(root, tasks, deps);
          const sections: string[] = [];
          if (opts.raw) {
            sections.push(formatDashboard(state));
            const settlementsRaw = formatStatusTaskSettlements(taskSettlements, lang);
            if (settlementsRaw) sections.push(settlementsRaw);
          } else if (resolvedMode) {
            sections.push(formatStatus(statusFormatterData(state, tasks), resolvedMode));
            if (opts.verbose) {
              sections.push(formatAgentAssignments(tasks, true));
              sections.push(formatSkillAssignments(tasks, true));
            }
            const settlementsMode = formatStatusTaskSettlements(taskSettlements, lang);
            if (settlementsMode) sections.push(settlementsMode);
          } else {
            const meta = readSprintMeta(root, state.sprint.id);
            const ci = readCIData(root, state.sprint.id);
            sections.push(formatHumanStatus({
              dashboard: state,
              tasks,
              sprintTitle: meta.title,
              sprintStartedAt: meta.startedAt,
              projectRoot: root,
              verbose: opts.verbose,
              ciBaseline: ci.baseline,
              ciReport: ci.report,
            }));
            const settlementsWatch = formatStatusTaskSettlements(taskSettlements, lang);
            if (settlementsWatch) sections.push(settlementsWatch);
            const commsWatch = buildWorkerCommsSection(root, lang);
            if (commsWatch) sections.push(commsWatch);
            const pendingWatch = buildPendingApprovalsSection(root, lang);
            if (pendingWatch) sections.push(pendingWatch);
          }
          const frame = sections
            .map(section => isNoColor() ? stripAnsi(section) : section)
            .join('\n');
          return `\x1Bc${frame}\n`;
        };

        const render = (): boolean => {
          if (cleanupPromise) return false;
          try {
            const frame = watchFrame();
            if (frame !== null) writer.enqueue(frame);
            return true;
          } catch {
            printError(new Error(getMessage('status.dashboard_read_failed', lang)));
            void cleanup(1);
            return false;
          }
        };

        unregisterShutdown = registerShutdownHook(async () => {
          await cleanup();
        });
        if (!render()) return;

        // (D) Use fs.watch when available, fallback to setInterval
        try {
          watcher = watch(dashPath, { persistent: true }, () => {
            render();
          });
          // Also set a fallback interval for resilience
          timer = setInterval(render, 5000);
        } catch {
          // Fallback to polling if fs.watch fails
          timer = setInterval(render, 2000);
        }
        return;
      }

      try {
        const rawData = readFileSync(dashPath, 'utf-8');
        const rawState = JSON.parse(rawData) as DashboardState;
        const tasks = loadStatusSurfaceTasks(root);
        const authority = readCanonicalRunStatus(root);
        const readModel = matchingRunStatusReadModel(root, authority);
        if (requiresPersistedRunStatusReadModel(authority) && !readModel) {
          printError(new Error(getMessage('status.read_model_hold', lang)));
          process.exitCode = 2;
          return;
        }
        const state = opts.raw
          ? rawState
          : projectDashboardThroughRunAuthority(
              rawState,
              tasks,
              authority,
              readModel?.logicalProgress,
            ).dashboard;
        // ─── W0-TRUTH (#491) orphan-gate ─────────────────────────────
        // Crash-case: an ACTIVE-shaped .dashboard whose writer died must not be
        // presented as live. Stale + no live sprint + no task files → honest
        // no-sprint view (the COMPLETE case is handled inside formatHumanStatus).
        const isOrphaned = !opts.raw && isDashboardOrphaned(state, {
          hasLiveSprint: getCurrentSprintId(root) !== null,
          hasTasks: tasks.length > 0,
          nowMs: Date.now(),
        });
        if (isOrphaned) {
          if (jsonMode) {
            output(JSON.stringify(buildNoActiveStatusJson(root, deps), null, 2));
            return;
          }
          print(getMessage('status.no_active_sprint', lang));
          const pendingOrphan = buildPendingApprovalsSection(root, lang);
          if (pendingOrphan) print(pendingOrphan);
          return;
        }
        // ─── 455-003 (TERMINAL-LIFECYCLE-TRUTH): JSON COMPLETE-gate ──────────
        // The human path gates a COMPLETE/terminal dashboard inside
        // formatHumanStatus (an honest "completed → no active run" block, never
        // the live Progress/Active lines). The --json surface used to dump the RAW
        // state instead — presenting a completed sprint's stale, live-shaped
        // progress (the auditor's final-scan garbage: active:N/done:0) as if it
        // were live. That is the JSON twin of the 2026-07-06 human lie and makes
        // the two surfaces DISAGREE. Apply the same terminal gate here so human +
        // JSON agree: a COMPLETE dashboard reports the honest no-active shape on
        // BOTH surfaces.
        const spTerminal = state.sprint as { status?: string; phase?: string };
        if (jsonMode && !opts.raw && (spTerminal.status === 'COMPLETE' || spTerminal.phase === 'COMPLETE')) {
          output(JSON.stringify(buildNoActiveStatusJson(root, deps), null, 2));
          return;
        }
        if (jsonMode) {
          // (E) --json + --verbose: include agent/skill info
          const taskSettlements = loadStatusTaskSettlements(root, tasks, deps);
          const jsonData = opts.verbose
            ? { ...state, taskSettlements, _verbose: { agents: tasks.map(t => ({ id: t.id, agent: t.assignedAgent ?? 'generic', skills: t.assignedSkills ?? [] })) } }
            : { ...state, taskSettlements };
          output(JSON.stringify(jsonData, null, 2));
        } else if (opts.raw) {
          output(formatDashboard(state));
          // Show agent and skill assignments in raw mode
          if (tasks.length > 0) {
            output(formatAgentAssignments(tasks, !!opts.verbose));
            output(formatSkillAssignments(tasks, !!opts.verbose));
          }
          const settlementsRaw = formatStatusTaskSettlements(
            loadStatusTaskSettlements(root, tasks, deps),
            lang,
          );
          if (settlementsRaw) output(settlementsRaw);
          const pendingRaw = buildPendingApprovalsSection(root, lang);
          if (pendingRaw) output(pendingRaw);
        } else {
          // Human-friendly output (default)
          const taskSettlements = loadStatusTaskSettlements(root, tasks, deps);
          const meta = readSprintMeta(root, state.sprint.id);
          const ci = readCIData(root, state.sprint.id);

          // --mode flag: use output-formatter if mode is specified
          if (resolvedMode) {
            output(formatStatus(statusFormatterData(state, tasks), resolvedMode));
            if (opts.verbose) {
              output(formatAgentAssignments(tasks, true));
              output(formatSkillAssignments(tasks, true));
            }
            const commsMode = buildWorkerCommsSection(root, lang);
            if (commsMode) output(commsMode);
            const settlementsMode = formatStatusTaskSettlements(taskSettlements, lang);
            if (settlementsMode) output(settlementsMode);
            const pendingMode = buildPendingApprovalsSection(root, lang);
            if (pendingMode) output(pendingMode);
          } else {
            output(formatHumanStatus({
              dashboard: state,
              tasks,
              sprintTitle: meta.title,
              sprintStartedAt: meta.startedAt,
              projectRoot: root,
              verbose: opts.verbose,
              ciBaseline: ci.baseline,
              ciReport: ci.report,
            }));
            if (opts.verbose) {
              output(formatAgentAssignments(tasks, true));
              output(formatSkillAssignments(tasks, true));
            }
            const settlementsDefault = formatStatusTaskSettlements(taskSettlements, lang);
            if (settlementsDefault) output(settlementsDefault);
            const commsDefault = buildWorkerCommsSection(root, lang);
            if (commsDefault) output(commsDefault);
            const pendingDefault = buildPendingApprovalsSection(root, lang);
            if (pendingDefault) output(pendingDefault);
          }
        }
      } catch (error) {
        printError(new Error(getMessage('status.dashboard_read_failed', lang)));
        process.exitCode = 1;
      }
    });
}
