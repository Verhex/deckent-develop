// ═══ Structured Event Stream ══════════════════════════════════════════
// Append-only JSONL event log for Brain ↔ Worker ↔ Auditor communication.
// Protocol Version 1.0 — ADR-035 (Sprint 138)
//
// Location: lives in core/ (Sprint 279, WK-import) — writeEvent/readEvents/
// DeckentEvent are core-level primitives consumed by core/audit-* modules.
// `orchestra/event-stream.ts` is a backward-compatible re-export shim so the
// existing orchestra-side importers (worker, auditor, brain, cli) keep working.
// This placement removes the ADR-008 core→orchestra reverse-dependency.
//
// Design:
//   - .deckent/sprint-NNN-events.jsonl — one JSON object per line
//   - Fail-safe: write failure → console.warn + no crash
//   - Backward compat: .hb/.result files continue in parallel
//   - Sequence: monotonic per-sprint, stored in .deckent/sprint-NNN-seq

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { RECENT_WORKS_DIR, SPRINT_STATE_FILE, SPRINT_ACTIVE_FILE } from './constants.js';
import { debugLog } from './utils.js';

// ─── Types ───────────────────────────────────────────────────────

/** Audit lineage fields carried from ExecutionRequest (ENT-3, SOC2/ISO traceability). */
export interface AuditLineage {
  /** Groups all events belonging to the same logical request flow. */
  correlationId?: string;
  /** Identifies the upstream request that caused this event to be emitted. */
  causationId?: string;
}

/** Protocol Version 1.0 event structure (ADR-035). */
export interface DeckentEvent {
  timestamp: string;
  sequence: number;
  protocol_version: '1.0';
  source: 'brain' | 'worker' | 'auditor' | 'deckent' | string;
  target: 'brain' | 'worker' | 'auditor' | 'user' | '*' | string;
  channel: string;
  payload: unknown;
  /** Optional — absent when the event was not initiated by a tracked ExecutionRequest. */
  correlationId?: string;
  /** Optional — absent when the event was not initiated by a tracked ExecutionRequest. */
  causationId?: string;
}

/** Filter criteria for readEvents(). */
export interface EventFilter {
  source?: string;
  target?: string;
  channel?: string;
  /** Only events with sequence >= afterSequence */
  afterSequence?: number;
}

/** Reconstructed sprint state from event stream. */
export interface ReconstructedState {
  sprintId: string;
  totalEvents: number;
  lastSequence: number;
  phaseChanges: Array<{ phase: string; timestamp: string }>;
  taskResults: Map<string, { verdict: string; timestamp: string }>;
  collisions: Array<{ taskIds: string[]; files: string[]; timestamp: string }>;
  metrics: Array<{ name: string; value: number; timestamp: string }>;
}

// ─── Lineage Helper ──────────────────────────────────────────────

/**
 * Extract `correlationId` + `causationId` from any object that carries them
 * (e.g. `ExecutionRequest`). Returns an `AuditLineage` ready to pass as the
 * optional `lineage` argument of `writeEvent`.
 *
 * Absent fields propagate as `undefined` — backward-safe.
 */
export function extractLineage(src: AuditLineage | undefined): AuditLineage {
  return {
    correlationId: src?.correlationId,
    causationId: src?.causationId,
  };
}

// ─── Channel Constants ───────────────────────────────────────────

export const CHANNELS = {
  // Brain ↔ Worker
  TASK_ASSIGN: 'BRAIN→WORKER:TASK_ASSIGN',
  HEARTBEAT: 'WORKER→BRAIN:HEARTBEAT',
  RESULT: 'WORKER→BRAIN:RESULT',
  QUESTION: 'WORKER→BRAIN:QUESTION',
  ANSWER: 'BRAIN→WORKER:ANSWER',

  // Worker ↔ Auditor
  CODE_VERIFY_REQUEST: 'WORKER→AUDITOR:CODE_VERIFY_REQUEST',
  VERIFICATION_RESULT: 'AUDITOR→BRAIN:VERIFICATION_RESULT',
  SCOPE_COLLISION_DETECTED: 'AUDITOR→BRAIN:SCOPE_COLLISION_DETECTED',
  ADR_VIOLATION: 'AUDITOR→BRAIN:ADR_VIOLATION',
  GATE_COMPUTED: 'AUDITOR→BRAIN:GATE_COMPUTED',
  LOAD_REPORT_WRITTEN: 'AUDITOR→BRAIN:LOAD_REPORT_WRITTEN',

  // Broadcast
  // WORKER-LIVE-LOG (#582, SURF-1c): live worker activity — ≤80-char line +
  // detail payload per emission; consumed by status --follow, deckent_watch,
  // the terminal feed and the Desktop console. Flag-gated (live_trace.enabled).
  ACTIVITY: 'WORKER→*:ACTIVITY',
  METRIC_EMITTED: 'BRAIN→*:METRIC_EMITTED',
  FIX_REQUEST: 'BRAIN→WORKER:FIX_REQUEST',
  SPRINT_PHASE_CHANGE: 'BRAIN→*:SPRINT_PHASE_CHANGE',

  // Completed-checkpoint recovery does not replay EXECUTE/EVALUATE/RETRO.
  // These durable events expose the terminalization-only path without
  // fabricating ordinary lifecycle transitions that did not run again.
  RECOVERY_TERMINALIZATION_STARTED: 'BRAIN→*:RECOVERY_TERMINALIZATION_STARTED',
  RECOVERY_EVIDENCE_REUSED: 'BRAIN→*:RECOVERY_EVIDENCE_REUSED',
  RECOVERY_RECEIPT_AUTHORIZED: 'BRAIN→*:RECOVERY_RECEIPT_AUTHORIZED',
  RECOVERY_CLEANUP_SETTLED: 'BRAIN→*:RECOVERY_CLEANUP_SETTLED',
  RECOVERY_TERMINALIZATION_COMPLETED: 'BRAIN→*:RECOVERY_TERMINALIZATION_COMPLETED',
  RECOVERY_TERMINALIZATION_HELD: 'BRAIN→*:RECOVERY_TERMINALIZATION_HELD',

  // User notification (Sprint 139 seed)
  NOTIFY: 'DECKENT→USER:NOTIFY',

  // Sprint 288 — W3 (cross-surface live-tail). Emitted by nervous/bootstrap when
  // an approval parks awaiting a human decision. Carries the EXACT
  // `deckent nervous accept <id>` command (payload matches core/pending-approvals
  // PendingApproval) so `deckent_watch` (MCP) + `status --follow` surface the ask
  // live, while `.deckent/nervous-pending.json` stays the snapshot for plain
  // `deckent status`. Additive — never the source of truth, only the live signal.
  NERVOUS_NOTIFICATION: 'DECKENT→USER:NERVOUS_NOTIFICATION',

  // FIX-1 (B-COLLISION-HANG cross-source approval): emitted by the nervous IPC
  // poller when an approval (from ANY surface — bot / CLI / MCP) is actually
  // consumed by the running executor. This is the Brain-ack: it proves in the
  // flow (jsonl) that the decision was received + applied, so a resolved ask is
  // not re-asked. Pairs with the resolved/ IPC dir (the on-disk record).
  NERVOUS_APPROVAL_CONSUMED: 'DECKENT→USER:NERVOUS_APPROVAL_CONSUMED',

  // Orphan HB cleanup (Sprint 139 — Task 016)
  ORPHAN_HB_DETECTED: 'AUDITOR→BRAIN:ORPHAN_HB_DETECTED',

  // Authority enforcement (Sprint 139 — Task 035, ADR-037)
  AUTHORITY_VIOLATION: 'AUDITOR→BRAIN:AUTHORITY_VIOLATION',

  // Timeout events (Sprint 145 — Task 017)
  TIMEOUT_ASSIGN: 'BRAIN→WORKER:TIMEOUT_ASSIGN',
  TIMEOUT_WARNING: 'WORKER→BRAIN:TIMEOUT_WARNING',
  TIMEOUT_CAP_EXCEEDED: 'AUDITOR→BRAIN:TIMEOUT_CAP_EXCEEDED',

  // Timeout extension (Sprint 145 — Task 019)
  TIMEOUT_EXTEND: 'BRAIN→WORKER:TIMEOUT_EXTEND',

  // Sprint 191 hotfix (07f07c9a) — emitted by runEvaluatePhase when the
  // 5-layer worker-liveness gate reports `never-spawned`. The literal
  // string is already used at the emit site; this constant pins the
  // contract so retro consumers (sprint-reporter) can readEvents() by
  // channel without re-deriving the string.
  NEVER_DISPATCHED: 'BRAIN→WORKER:NEVER_DISPATCHED',

  // Sprint 168 C0c RC2 — scope collision spawn blocker
  // Emitted by sprint-controller / spawn pipeline when handleScopeCollision()
  // returns action='block'. Consumes AUDITOR→BRAIN:SCOPE_COLLISION_DETECTED.
  SPAWN_BLOCKED: 'BRAIN→SPAWN:BLOCKED',

  // Sprint 179 W0-1 — Bug A foundation
  // Emitted by result-collector when a fix-task DONE supersedes its
  // original task NO_GO; downstream consumers learn that the dependency
  // is now aggregate-DONE without polling the disk.
  DEPENDENCY_RESOLVED_BY_FIX: 'BRAIN→*:DEPENDENCY_RESOLVED_BY_FIX',

  // Sprint 183 W1-2 — DEPENDENCY_BLOCKED event spam debounce (P0-2)
  // Emitted by sprint-spawner.respawnEligibleTasks() when enforceWaveDependency
  // reports a task is still blocked on unresolved deps. State-change-only
  // semantics live inside writeEvent (channel-aware dedupe).
  DEPENDENCY_BLOCKED: 'BRAIN→WORKER:DEPENDENCY_BLOCKED',

  // Sprint 194 W-AUTH A-1 — worker pre-spawn auth health check failure.
  // Emitted by worker.authHealthCheck() when `claude --version` fails (non-zero
  // exit, empty stdout, or spawn error). Brain treats this as a real worker
  // result (not synthetic NO_GO) so /login auth-loss during a sprint becomes a
  // diagnosable failure mode instead of silent exit 0.
  AUTH_FAILED: 'WORKER→BRAIN:AUTH_FAILED',

  // Sprint 201 — container-path leakage Layer-2 gate. Emitted by
  // result-collector after sanitizeHostFacingFiles() rewrites a leaked
  // container `/workspace` path in a host-facing config file. The canonical
  // string is also exported as CONTAINER_PATH_SANITIZED_CHANNEL from
  // container-path-sanitizer.ts (mirroring disk-verify's own channel const).
  CONTAINER_PATH_SANITIZED: 'BRAIN→AUDITOR:CONTAINER_PATH_SANITIZED',

  // Sprint 280 — PLANOBS-001: plan/execute progress observability.
  // Emitted by emitProgress() helper; emit-sites wired by Task 5.
  PROGRESS: 'PROGRESS',
} as const;

export type ChannelCode = typeof CHANNELS[keyof typeof CHANNELS];

// ─── Path Helpers ────────────────────────────────────────────────

function eventsFilePath(projectRoot: string, sprintId: string): string {
  return join(projectRoot, RECENT_WORKS_DIR, `${sprintId}-events.jsonl`);
}

function sequenceFilePath(projectRoot: string, sprintId: string): string {
  return join(projectRoot, RECENT_WORKS_DIR, `${sprintId}-seq`);
}

// B-AUTONOMOUS-LOG (Sprint 318): per-sprint event files are small + retention-managed,
// but the long-lived 'autonomous' stream (sprintId='autonomous') appends to ONE file
// forever — it grew to 19MB / 56,920 lines over 12 days with no rotation. Cap each
// event file: when it exceeds MAX_EVENT_FILE_BYTES, rotate to `.1` (overwriting the
// previous rotation) and start fresh. Standard 2-file log rotation → bounded at
// ~2×cap, recent history preserved. Per-sprint files (KBs) never trigger.
const MAX_EVENT_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
const SEQUENCE_LOCK_ATTEMPTS = 20;
const SEQUENCE_LOCK_RETRY_MS = 5;
const SEQUENCE_LOCK_STALE_MS = 30_000;

function sequencePathForEventPath(path: string): string | null {
  const suffix = '-events.jsonl';
  return path.endsWith(suffix) ? `${path.slice(0, -suffix.length)}-seq` : null;
}

function maxSequenceInFile(path: string): number {
  let max = 0;
  for (const line of readFileSync(path, 'utf-8').split('\n')) {
    if (line.trim().length === 0) continue;
    try {
      const parsed = JSON.parse(line) as { sequence?: unknown };
      if (
        typeof parsed.sequence === 'number'
        && Number.isFinite(parsed.sequence)
        && parsed.sequence > max
      ) {
        max = parsed.sequence;
      }
    } catch {
      // Malformed rows do not prevent rotation of the remaining valid history.
    }
  }
  return max;
}

/**
 * Rotate an event file to `<path>.1` when it exceeds `maxBytes`. Returns true if a
 * rotation happened. Fail-safe: never throws (event I/O must not crash a sprint).
 * `maxBytes` is injectable for tests.
 */
export function rotateEventFileIfLarge(path: string, maxBytes: number = MAX_EVENT_FILE_BYTES): boolean {
  try {
    if (!existsSync(path)) return false;
    if (statSync(path).size <= maxBytes) return false;
    const seqPath = sequencePathForEventPath(path);
    if (seqPath && existsSync(seqPath)) {
      const parsedSidecar = Number.parseInt(readFileSync(seqPath, 'utf-8').trim(), 10);
      const markerSequence = Math.max(
        Number.isFinite(parsedSidecar) ? parsedSidecar : 0,
        maxSequenceInFile(path),
      ) + 1;
      const marker: DeckentEvent = {
        timestamp: new Date().toISOString(),
        sequence: markerSequence,
        protocol_version: '1.0',
        source: 'deckent',
        target: '*',
        channel: 'EVENT_LOG_ROTATED',
        payload: { rotatedTo: `${path}.1` },
      };
      appendFileSync(path, `${JSON.stringify(marker)}\n`, 'utf-8');
      writeFileSync(seqPath, String(markerSequence), 'utf-8');
    }
    rmSync(`${path}.1`, { force: true });
    renameSync(path, `${path}.1`);
    return true;
  } catch (err) {
    debugLog('event-stream:rotateEventFileIfLarge', err);
    return false;
  }
}

// ─── Sequence Counter ────────────────────────────────────────────

/**
 * Read the current sequence number for a sprint.
 * Returns 0 if no sequence file exists.
 */
export function readSequence(projectRoot: string, sprintId: string): number {
  const seqPath = sequenceFilePath(projectRoot, sprintId);
  if (!existsSync(seqPath)) return 0;
  try {
    const raw = readFileSync(seqPath, 'utf-8').trim();
    const num = parseInt(raw, 10);
    return Number.isNaN(num) ? 0 : num;
  } catch {
    return 0;
  }
}

/**
 * High-water mark of the sequences already recorded in the canonical event log.
 * Returns 0 when the log is absent, empty or unreadable (fail-safe).
 *
 * Only consulted when the `<sprint>-seq` sidecar is missing or unusable, so the
 * common write path never pays for this scan.
 */
function maxSequenceInEventLog(projectRoot: string, sprintId: string): number {
  const filePath = eventsFilePath(projectRoot, sprintId);
  if (!existsSync(filePath)) return 0;
  try {
    return maxSequenceInFile(filePath);
  } catch (err) {
    debugLog('event-stream:maxSequenceInEventLog', err);
    return 0;
  }
}

/**
 * Increment and persist the sequence number atomically.
 * Returns the new sequence value.
 *
 * Self-healing (671-008): the `<sprint>-seq` sidecar can disappear while the
 * canonical `<sprint>-events.jsonl` survives (retention deletes the sidecar, a
 * late emitter then writes again). Restarting at 1 would re-issue sequence numbers
 * that already exist in the log. When the sidecar is missing or holds an unusable
 * value we therefore recover the counter from the log's own maximum, which makes
 * that collision structurally impossible rather than merely unlikely.
 */
export function nextSequence(projectRoot: string, sprintId: string): number {
  const seqPath = sequenceFilePath(projectRoot, sprintId);
  const lockPath = `${seqPath}.lock`;
  let locked = false;
  try {
    for (let attempt = 0; attempt < SEQUENCE_LOCK_ATTEMPTS; attempt += 1) {
      try {
        mkdirSync(lockPath);
        locked = true;
        break;
      } catch (error: unknown) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        try {
          if (Date.now() - statSync(lockPath).mtimeMs > SEQUENCE_LOCK_STALE_MS) {
            rmSync(lockPath, { recursive: true, force: true });
            continue;
          }
        } catch (staleError: unknown) {
          if ((staleError as NodeJS.ErrnoException).code !== 'ENOENT') throw staleError;
        }
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, SEQUENCE_LOCK_RETRY_MS);
      }
    }

    let current = readSequence(projectRoot, sprintId);
    if (current <= 0) current = maxSequenceInEventLog(projectRoot, sprintId);
    const next = current + 1;
    if (!locked) {
      debugLog('event-stream:nextSequence', 'Failed to acquire sequence counter lock');
      return next;
    }
    const tmpPath = `${seqPath}.tmp.${process.pid}`;
    writeFileSync(tmpPath, String(next), 'utf-8');
    renameSync(tmpPath, seqPath);
    return next;
  } catch (error: unknown) {
    debugLog('event-stream:nextSequence', error);
    const current = Math.max(readSequence(projectRoot, sprintId), maxSequenceInEventLog(projectRoot, sprintId));
    return current + 1;
  } finally {
    if (locked) {
      try { rmSync(lockPath, { recursive: true, force: true }); } catch { /* fail-safe */ }
    }
  }
}

// ─── Core API ────────────────────────────────────────────────────

/**
 * Canonical single source of truth for the current active sprint ID.
 *
 * Resolution order (R4-SPRINTID — Sprint 318):
 *   1. `.deckent/sprint-active.json` — explicit override (if present + parseable
 *      with a non-empty `sprintId`)
 *   2. `.deckent/sprint-state.json` — persisted by writeSprintState during execution
 *   3. null — no active sprint detected
 *
 * The `active→state` fallback was previously unique to `monitor/sprint-state.ts`;
 * it is now the canonical behavior so every consumer (core/monitor/cli/orchestra)
 * agrees. The prior core version read sprint-state.json ONLY and silently ignored
 * the sprint-active.json override — honoring it here closes that latent divergence.
 * `.dashboard` is intentionally NOT consulted (display-only).
 */
export function getCurrentSprintId(projectRoot: string): string | null {
  // Source 1: sprint-active.json (explicit override / new format)
  const activePath = join(projectRoot, SPRINT_ACTIVE_FILE);
  if (existsSync(activePath)) {
    try {
      const data = JSON.parse(readFileSync(activePath, 'utf-8')) as { sprintId?: string };
      if (typeof data.sprintId === 'string' && data.sprintId.length > 0) {
        return data.sprintId;
      }
    } catch {
      // parse fail → fall through to sprint-state.json
    }
  }

  // Source 2: sprint-state.json (written by writeSprintState during execution)
  const statePath = join(projectRoot, SPRINT_STATE_FILE);
  if (existsSync(statePath)) {
    try {
      const data = JSON.parse(readFileSync(statePath, 'utf-8')) as { sprintId?: string };
      if (typeof data.sprintId === 'string' && data.sprintId.length > 0) {
        return data.sprintId;
      }
    } catch {
      // parse fail → return null
    }
  }

  return null;
}

/** A writeEvent attempt whose event was lost to an I/O failure (671-008). */
export interface EventWriteFailure {
  kind: 'failed';
  sprintId: string;
  channel: string;
  /** Message of the underlying I/O error. */
  reason: string;
  /** ISO-8601 timestamp of the failed attempt. */
  at: string;
}

/**
 * Typed outcome of an event write. `writeEvent` projects this down to
 * `DeckentEvent | null` for its existing callers; `writeEventDetailed` exposes it
 * so a caller that cares can tell a dropped duplicate from a lost write.
 */
export type EventWriteResult =
  | { kind: 'written'; event: DeckentEvent }
  | { kind: 'suppressed'; sprintId: string; channel: string }
  | EventWriteFailure;

/** Last write lost to I/O — visibility for callers that only ever see `null`. */
let lastEventWriteFailure: EventWriteFailure | null = null;

/**
 * The most recent `writeEvent` I/O failure, or null if none happened in this
 * process. Lets a `null`-receiving caller inspect what was lost.
 */
export function getLastEventWriteFailure(): EventWriteFailure | null {
  return lastEventWriteFailure;
}

/**
 * Write a single event to the sprint event stream.
 * Fail-safe: never throws — logs warning on failure.
 *
 * @param projectRoot - Project root directory
 * @param sprintId - Sprint identifier (e.g. "sprint-138")
 * @param source - Event source component
 * @param target - Event target component
 * @param channel - Channel code from CHANNELS
 * @param payload - Event-specific data
 * @returns The written event, or null on failure (contract unchanged)
 */
export function writeEvent(
  projectRoot: string,
  sprintId: string,
  source: DeckentEvent['source'],
  target: DeckentEvent['target'],
  channel: string,
  payload: unknown,
  lineage?: AuditLineage,
): DeckentEvent | null {
  const result = writeEventDetailed(projectRoot, sprintId, source, target, channel, payload, lineage);
  return result.kind === 'written' ? result.event : null;
}

/**
 * Same write as `writeEvent`, but returns the typed outcome instead of collapsing
 * failure and suppression into `null`. Fail-safe: never throws.
 */
export function writeEventDetailed(
  projectRoot: string,
  sprintId: string,
  source: DeckentEvent['source'],
  target: DeckentEvent['target'],
  channel: string,
  payload: unknown,
  lineage?: AuditLineage,
): EventWriteResult {
  try {
    // Sprint 183 W1-2 — DEPENDENCY_BLOCKED spam debounce.
    // Channel-aware suppression: when the same taskId has the same set of
    // unresolved deps as the last emitted event for this sprint, drop the
    // duplicate. This transparently de-spams the existing sprint-spawner
    // wave.respawn tick emission without changing any call site.
    if (channel === CHANNELS.DEPENDENCY_BLOCKED) {
      const decision = applyDependencyBlockedDedupe(sprintId, payload);
      if (decision === 'suppress') {
        debugLog('event-stream:writeEvent', `Suppressed duplicate DEPENDENCY_BLOCKED for sprint=${sprintId}`);
        return { kind: 'suppressed', sprintId, channel };
      }
    }

    const recentWorksDir = join(projectRoot, RECENT_WORKS_DIR);
    if (!existsSync(recentWorksDir)) {
      mkdirSync(recentWorksDir, { recursive: true });
    }

    const eventsPath = eventsFilePath(projectRoot, sprintId);
    // Rotate before reserving this event's sequence so the marker is ordered first.
    rotateEventFileIfLarge(eventsPath);
    const sequence = nextSequence(projectRoot, sprintId);
    const event: DeckentEvent = {
      timestamp: new Date().toISOString(),
      sequence,
      protocol_version: '1.0',
      source,
      target,
      channel,
      payload,
      ...(lineage?.correlationId !== undefined && { correlationId: lineage.correlationId }),
      ...(lineage?.causationId !== undefined && { causationId: lineage.causationId }),
    };

    const line = JSON.stringify(event) + '\n';
    appendFileSync(eventsPath, line, 'utf-8');
    return { kind: 'written', event };
  } catch (err) {
    // Fail-safe: NEVER crash the sprint due to event stream I/O — but never lose the
    // write silently either (671-008): record a typed failure and emit a debugLog
    // record so the dropped event stays visible after the fact.
    const reason = err instanceof Error ? err.message : String(err);
    // Under the test runner, stay silent: partial node:fs mocks (no appendFileSync
    // export) make this path noisy and can flake tests that assert on console.warn.
    if (!process.env.VITEST) {
      console.warn(`[event-stream] writeEvent failed: ${reason}`);
    }
    const failure: EventWriteFailure = {
      kind: 'failed',
      sprintId,
      channel,
      reason,
      at: new Date().toISOString(),
    };
    lastEventWriteFailure = failure;
    debugLog('event-stream:writeEvent', `write failed sprint=${sprintId} channel=${channel}: ${reason}`);
    return failure;
  }
}

/**
 * Read events from the sprint event stream with optional filtering.
 * Returns empty array on failure (fail-safe).
 */
export function readEvents(
  projectRoot: string,
  sprintId: string,
  filter?: EventFilter,
): DeckentEvent[] {
  const filePath = eventsFilePath(projectRoot, sprintId);
  if (!existsSync(filePath)) return [];

  try {
    const raw = readFileSync(filePath, 'utf-8');
    const lines = raw.split('\n').filter(l => l.trim().length > 0);
    let events: DeckentEvent[] = [];

    for (const line of lines) {
      try {
        const event = JSON.parse(line) as DeckentEvent;
        events.push(event);
      } catch {
        // Skip malformed lines — partial writes happen
        debugLog('event-stream:readEvents', `Skipping malformed line: ${line.slice(0, 80)}`);
      }
    }

    // Apply filters
    if (filter) {
      if (filter.source) {
        events = events.filter(e => e.source === filter.source);
      }
      if (filter.target) {
        events = events.filter(e => e.target === filter.target);
      }
      if (filter.channel) {
        events = events.filter(e => e.channel === filter.channel);
      }
      if (filter.afterSequence !== undefined) {
        events = events.filter(e => e.sequence > filter.afterSequence!);
      }
    }

    return events;
  } catch (err) {
    console.warn(`[event-stream] readEvents failed: ${err instanceof Error ? err.message : String(err)}`);
    debugLog('event-stream:readEvents', err);
    return [];
  }
}

/**
 * Reconstruct sprint state from the event stream.
 * Aggregates phase changes, task results, collisions, and metrics.
 */
export function reconstructState(
  projectRoot: string,
  sprintId: string,
): ReconstructedState {
  const events = readEvents(projectRoot, sprintId);

  const state: ReconstructedState = {
    sprintId,
    totalEvents: events.length,
    lastSequence: events.length > 0 ? events[events.length - 1]!.sequence : 0,
    phaseChanges: [],
    taskResults: new Map(),
    collisions: [],
    metrics: [],
  };

  for (const event of events) {
    switch (event.channel) {
      case CHANNELS.SPRINT_PHASE_CHANGE: {
        const p = event.payload as { phase?: string; toPhase?: string };
        const phase = p?.phase ?? p?.toPhase;
        if (phase) {
          state.phaseChanges.push({ phase, timestamp: event.timestamp });
        }
        break;
      }

      case CHANNELS.VERIFICATION_RESULT: {
        const p = event.payload as { taskId?: string; verdict?: string };
        if (p?.taskId && p?.verdict) {
          state.taskResults.set(p.taskId, { verdict: p.verdict, timestamp: event.timestamp });
        }
        break;
      }

      case CHANNELS.SCOPE_COLLISION_DETECTED: {
        const p = event.payload as { taskIds?: string[]; files?: string[] };
        if (p?.taskIds && p?.files) {
          state.collisions.push({ taskIds: p.taskIds, files: p.files, timestamp: event.timestamp });
        }
        break;
      }

      case CHANNELS.METRIC_EMITTED: {
        const p = event.payload as { name?: string; value?: number };
        if (p?.name !== undefined && p?.value !== undefined) {
          state.metrics.push({ name: p.name, value: p.value, timestamp: event.timestamp });
        }
        break;
      }

      case CHANNELS.RESULT: {
        const p = event.payload as { taskId?: string; selfAssessment?: string };
        if (p?.taskId && p?.selfAssessment) {
          state.taskResults.set(p.taskId, { verdict: p.selfAssessment, timestamp: event.timestamp });
        }
        break;
      }
    }
  }

  return state;
}

// ─── Bug A: DEPENDENCY_RESOLVED_BY_FIX (Sprint 179 W0-1) ────────────

/**
 * Payload emitted on {@link CHANNELS.DEPENDENCY_RESOLVED_BY_FIX}.
 *
 * Downstream consumers (auditor/dashboard/Brain depStatuses cache) use
 * this signal to flip a dependency's effective status to DONE the moment
 * a fix-retry succeeds — closing the Sprint 178 22-minute polling gap.
 */
export interface DependencyResolvedByFixEvent {
  type: typeof CHANNELS.DEPENDENCY_RESOLVED_BY_FIX;
  originalTaskId: string;
  fixTaskId: string;
  emittedAt: string;
}

/**
 * Emit a {@link DependencyResolvedByFixEvent} via an injected sink.
 *
 * The sink-based shape keeps this function pure: callers in
 * result-collector wire it to `writeEvent`, tests pass a `vi.fn()` spy.
 * Wiring is intentionally explicit (no module-level singleton) so the
 * honest-gate audit trail records exactly which call site fired the
 * resolution event.
 */
export function emitDependencyResolvedByFix(
  payload: { originalTaskId: string; fixTaskId: string },
  emit: (event: DependencyResolvedByFixEvent) => void,
): void {
  emit({
    type: CHANNELS.DEPENDENCY_RESOLVED_BY_FIX,
    originalTaskId: payload.originalTaskId,
    fixTaskId: payload.fixTaskId,
    emittedAt: new Date().toISOString(),
  });
}

// ─── Sprint 183 W1-2: DEPENDENCY_BLOCKED Spam Debounce ──────────────
//
// Sprint 182 dogfood emitted 550+ events; 95% were duplicate
// BRAIN→WORKER:DEPENDENCY_BLOCKED on every wave.respawn tick. Root cause:
// sprint-spawner.respawnEligibleTasks() re-emits one event per still-blocked
// task each tick regardless of state change.
//
// Fix: state-change-only semantics. We track the last emitted blocked state
// (taskId → hash of sorted unresolvedDeps) per sprint at the event-stream
// boundary, so existing callers (sprint-spawner is out of W1-2 scope) are
// transparently de-spammed via the writeEvent hook above.

/**
 * Payload shape expected for a DEPENDENCY_BLOCKED event.
 * `unresolvedDeps` is the set of task IDs that prevent `taskId` from spawning.
 */
export interface DependencyBlockedPayload {
  taskId: string;
  unresolvedDeps: string[];
  reason?: string;
  [extra: string]: unknown;
}

/** Module-level state: sprintId → (taskId → hash). Cleared on sprint end. */
const previousBlockedState: Map<string, Map<string, string>> = new Map();

/** Deterministic hash for a list of unresolved deps (order-independent). */
function hashUnresolvedDeps(deps: ReadonlyArray<string>): string {
  return [...deps].sort().join(',');
}

/**
 * Apply state-change-only dedupe for DEPENDENCY_BLOCKED payloads.
 *
 * Returns `'emit'` when the event should proceed (and updates the cache),
 * `'suppress'` when the same blocked state was already emitted for this
 * (sprintId, taskId), and `'emit'` for malformed payloads (fail-open — we
 * never silently drop unfamiliar shapes).
 *
 * Side effects:
 *   - On `'emit'`: stores the new hash in `previousBlockedState`.
 *   - When `unresolvedDeps.length === 0`: clears the cache entry so a later
 *     re-block on the same task always emits a fresh event.
 */
function applyDependencyBlockedDedupe(
  sprintId: string,
  payload: unknown,
): 'emit' | 'suppress' {
  if (!payload || typeof payload !== 'object') return 'emit';
  const p = payload as Partial<DependencyBlockedPayload>;
  if (typeof p.taskId !== 'string' || !Array.isArray(p.unresolvedDeps)) {
    // Unknown shape — fail-open, emit (caller chose this channel deliberately).
    return 'emit';
  }

  const unresolvedDeps = p.unresolvedDeps.filter((d): d is string => typeof d === 'string');

  // Auto-clear semantics: zero unresolved deps means the dep set fully
  // resolved, so the next time this task is blocked again (rare but
  // possible if a downstream cascade re-blocks) we MUST emit fresh.
  if (unresolvedDeps.length === 0) {
    const sprintMap = previousBlockedState.get(sprintId);
    if (sprintMap) {
      sprintMap.delete(p.taskId);
      if (sprintMap.size === 0) previousBlockedState.delete(sprintId);
    }
    return 'emit';
  }

  const hash = hashUnresolvedDeps(unresolvedDeps);

  let sprintMap = previousBlockedState.get(sprintId);
  if (!sprintMap) {
    sprintMap = new Map();
    previousBlockedState.set(sprintId, sprintMap);
  }

  const previousHash = sprintMap.get(p.taskId);
  if (previousHash === hash) {
    return 'suppress';
  }

  sprintMap.set(p.taskId, hash);
  return 'emit';
}

/**
 * Public API — explicit state-change emit helper.
 *
 * Equivalent to calling `writeEvent(... CHANNELS.DEPENDENCY_BLOCKED, payload)`
 * directly (since the same dedupe logic is wired into writeEvent), but offers
 * a typed call site that consumers can prefer for clarity. Returns the
 * written event, or `null` if suppressed.
 */
export function emitDependencyBlockedIfChanged(
  projectRoot: string,
  sprintId: string,
  source: DeckentEvent['source'],
  target: DeckentEvent['target'],
  payload: DependencyBlockedPayload,
): DeckentEvent | null {
  return writeEvent(projectRoot, sprintId, source, target, CHANNELS.DEPENDENCY_BLOCKED, payload);
}

/**
 * Clear cached blocked state.
 *
 * - `clearDependencyBlockedState()` — clear all sprints (used by tests).
 * - `clearDependencyBlockedState(sprintId)` — clear all entries for one sprint
 *   (call this on sprint completion to free memory).
 * - `clearDependencyBlockedState(sprintId, taskId)` — clear a single (sprint,
 *   task) entry (call this when a task is being spawned, so a subsequent
 *   re-block emits fresh).
 */
export function clearDependencyBlockedState(sprintId?: string, taskId?: string): void {
  if (sprintId === undefined) {
    previousBlockedState.clear();
    return;
  }
  if (taskId === undefined) {
    previousBlockedState.delete(sprintId);
    return;
  }
  const sprintMap = previousBlockedState.get(sprintId);
  if (!sprintMap) return;
  sprintMap.delete(taskId);
  if (sprintMap.size === 0) previousBlockedState.delete(sprintId);
}

/**
 * Test-only introspection of the dedupe cache.
 *
 * The underscore prefix signals "internal — for tests" so production code
 * isn't tempted to depend on its shape. Returns the live `Map` so writes
 * from test code would affect production state — callers must treat this
 * as read-only.
 */
export function _getDependencyBlockedStateForTest(): Map<string, Map<string, string>> {
  return previousBlockedState;
}

// ─── Sprint 280 PLANOBS-001: emitProgress helper ─────────────────────

/**
 * Emit a PROGRESS event to the producer-owned sprint's event stream.
 *
 * Thin wrapper over writeEvent — fail-safe (never throws).
 * Emit-sites (result-collector, plugin-hooks) are wired by Task 5.
 *
 * @param opts.root    - Project root; defaults to process.cwd()
 * @param opts.sprintId - Explicit run identity owned by the producer
 * @param opts.phase   - Sprint/task phase label (e.g. 'EXECUTE', 'SPAWN', 'PLAN')
 * @param opts.pct     - Completion percentage 0–100 (optional)
 * @param opts.detail  - Human-readable detail string (optional)
 * @param opts.source  - Event source component; defaults to 'brain'
 * @returns The written DeckentEvent, or null if the write failed
 */
export function emitProgress(opts: {
  root?: string;
  sprintId: string;
  phase: string;
  pct?: number;
  detail?: string;
  source?: string;
}): DeckentEvent | null {
  try {
    const projectRoot = opts.root ?? process.cwd();
    const source = (opts.source ?? 'brain') as DeckentEvent['source'];
    return writeEvent(
      projectRoot,
      opts.sprintId,
      source,
      '*',
      CHANNELS.PROGRESS,
      { phase: opts.phase, pct: opts.pct, detail: opts.detail },
    );
  } catch {
    return null;
  }
}
