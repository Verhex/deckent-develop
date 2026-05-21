// ═══ Structured Event Stream ══════════════════════════════════════════
// Append-only JSONL event log for Brain ↔ Worker ↔ Auditor communication.
// Protocol Version 1.0 — ADR-035 (Sprint 138)
//
// Design:
//   - .deckent/sprint-NNN-events.jsonl — one JSON object per line
//   - Fail-safe: write failure → console.warn + no crash
//   - Backward compat: .hb/.result files continue in parallel
//   - Sequence: monotonic per-sprint, stored in .deckent/sprint-NNN-seq

import { appendFileSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { DECKENT_DIR } from '../core/constants.js';
import { debugLog } from '../core/utils.js';

// ─── Types ───────────────────────────────────────────────────────

/** Protocol Version 1.0 event structure (ADR-035). */
export interface DeckentEvent {
  timestamp: string;
  sequence: number;
  protocol_version: '1.0';
  source: 'brain' | 'worker' | 'auditor' | 'deckent' | string;
  target: 'brain' | 'worker' | 'auditor' | 'user' | '*' | string;
  channel: string;
  payload: unknown;
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
  METRIC_EMITTED: 'BRAIN→*:METRIC_EMITTED',
  FIX_REQUEST: 'BRAIN→WORKER:FIX_REQUEST',
  SPRINT_PHASE_CHANGE: 'BRAIN→*:SPRINT_PHASE_CHANGE',

  // User notification (Sprint 139 seed)
  NOTIFY: 'DECKENT→USER:NOTIFY',

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
} as const;

export type ChannelCode = typeof CHANNELS[keyof typeof CHANNELS];

// ─── Path Helpers ────────────────────────────────────────────────

function eventsFilePath(projectRoot: string, sprintId: string): string {
  return join(projectRoot, DECKENT_DIR, `${sprintId}-events.jsonl`);
}

function sequenceFilePath(projectRoot: string, sprintId: string): string {
  return join(projectRoot, DECKENT_DIR, `${sprintId}-seq`);
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
 * Increment and persist the sequence number atomically.
 * Returns the new sequence value.
 */
function nextSequence(projectRoot: string, sprintId: string): number {
  const current = readSequence(projectRoot, sprintId);
  const next = current + 1;
  const seqPath = sequenceFilePath(projectRoot, sprintId);
  try {
    writeFileSync(seqPath, String(next), 'utf-8');
  } catch {
    // Fail-safe: if we can't persist, use in-memory increment
    debugLog('event-stream:nextSequence', 'Failed to persist sequence counter');
  }
  return next;
}

// ─── Core API ────────────────────────────────────────────────────

/**
 * Get current sprint ID from sprint-state.json.
 * Returns null if not found.
 */
export function getCurrentSprintId(projectRoot: string): string | null {
  const statePath = join(projectRoot, DECKENT_DIR, 'sprint-state.json');
  if (!existsSync(statePath)) return null;
  try {
    const raw = readFileSync(statePath, 'utf-8');
    const state = JSON.parse(raw) as { sprintId?: string };
    return state.sprintId ?? null;
  } catch {
    return null;
  }
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
 * @returns The written event, or null on failure
 */
export function writeEvent(
  projectRoot: string,
  sprintId: string,
  source: DeckentEvent['source'],
  target: DeckentEvent['target'],
  channel: string,
  payload: unknown,
): DeckentEvent | null {
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
        return null;
      }
    }

    const deckentDir = join(projectRoot, DECKENT_DIR);
    if (!existsSync(deckentDir)) {
      mkdirSync(deckentDir, { recursive: true });
    }

    const sequence = nextSequence(projectRoot, sprintId);
    const event: DeckentEvent = {
      timestamp: new Date().toISOString(),
      sequence,
      protocol_version: '1.0',
      source,
      target,
      channel,
      payload,
    };

    const line = JSON.stringify(event) + '\n';
    appendFileSync(eventsFilePath(projectRoot, sprintId), line, 'utf-8');
    return event;
  } catch (err) {
    // Fail-safe: NEVER crash the sprint due to event stream I/O
    console.warn(`[event-stream] writeEvent failed: ${err instanceof Error ? err.message : String(err)}`);
    debugLog('event-stream:writeEvent', err);
    return null;
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
        const p = event.payload as { phase?: string };
        if (p?.phase) {
          state.phaseChanges.push({ phase: p.phase, timestamp: event.timestamp });
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
