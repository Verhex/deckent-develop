/**
 * Spawn Coordinator — Adaptive max_workers wire-point (Sprint 194 Task 194-005).
 *
 * Bridges the pure host-detector helpers (src/core/host-detector.ts) with
 * the spawn pipeline. The intent expressed in the W-M M-3 task is "startup
 * tespit → suggestMaxWorkers if config max_workers is missing/auto", which
 * this module realises as a callable function rather than an implicit
 * side-effect; that keeps the wire testable.
 *
 * The legacy auto-resolution path
 * (`sprint-utils.ts::resolveMaxWorkersNumeric` →
 * `system-profile.ts::getSystemProfile`) is intentionally untouched in this
 * task — that file is outside the task's filesWrite scope. A follow-up
 * sprint can swap the formula by routing the same call through
 * {@link resolveAutoMaxWorkers}. Until then, this module is the canonical
 * entry-point for callers that want WSL2-aware sizing (such as
 * `deckent doctor --memory`).
 */

import {
  DEFAULT_WORKER_MEM_GB,
  detectHostMemory,
  suggestMaxWorkers,
  type HostMemoryDetection,
} from '../core/host-detector.js';
import {
  inspectStaleSpawnLocks,
  releaseInspectedSpawnLock,
  type StaleSpawnLockCandidate,
} from '../core/file-lock.js';
import { writeAuditEvent, type AuditEvent } from '../core/audit-writer.js';
import { readAuthoritativeTaskResult } from './task-result-authority.js';

/**
 * Cached detection — `/proc/meminfo` does not change during a process
 * lifetime, so we read once and reuse. Tests can reset via
 * {@link _resetSpawnCoordinatorCache} (underscored to signal "test seam").
 */
let cachedDetection: HostMemoryDetection | null = null;

export const STALE_SPAWNLOCK_MAX_AGE_MS = 5 * 60 * 1_000;
export const STALE_SPAWNLOCK_MAX_FILES_PER_DISPATCH = 64;
export const STALE_SPAWNLOCK_RELEASE_AUDIT_ACTION = 'spawnlock.stale_released' as const;

export interface StaleSpawnLockEvidence {
  ageExceeded: true;
  ownerPidDead: true;
  taskResultTerminal: true;
}

export interface StaleSpawnLockReleaseAuditMetadata extends Record<string, unknown> {
  lockPath: string;
  ownerPid: number;
  taskId: string;
  filePath: string;
  ageMs: number;
  maxAgeMs: number;
  evidence: StaleSpawnLockEvidence;
}

export interface StaleSpawnLockWatchdogOptions {
  sprintId?: string;
  tenantId?: string;
  maxFiles?: number;
  nowMs?: number;
}

export interface StaleSpawnLockWatchdogReport {
  inspected: number;
  eligible: number;
  released: number;
}

interface StaleSpawnLockWatchdogDeps {
  isOwnerPidAlive(pid: number): boolean;
  isTaskResultTerminal(projectRoot: string, taskId: string): boolean;
  writeReleaseAudit(projectRoot: string, sprintId: string, event: AuditEvent): boolean;
  inspect(
    projectRoot: string,
    options: { maxAgeMs: number; maxFiles: number; nowMs?: number },
  ): StaleSpawnLockCandidate[];
  release(candidate: StaleSpawnLockCandidate): boolean;
}

function isOwnerPidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return true;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

function isTaskResultTerminal(projectRoot: string, taskId: string): boolean {
  const authority = readAuthoritativeTaskResult<{ selfAssessment?: unknown }>(projectRoot, taskId);
  if (authority.state === 'settled') return true;
  if (authority.state !== 'legacy') return false;
  const assessment = authority.result?.selfAssessment;
  return assessment === 'DONE' || assessment === 'GO_WITH_TECH_DEBT' || assessment === 'NO_GO';
}

const defaultStaleSpawnLockWatchdogDeps: StaleSpawnLockWatchdogDeps = {
  isOwnerPidAlive,
  isTaskResultTerminal,
  writeReleaseAudit: writeAuditEvent,
  inspect: inspectStaleSpawnLocks,
  release: releaseInspectedSpawnLock,
};

/**
 * Run one bounded stale-spawnlock sweep immediately before a dispatch attempt.
 * A lock is released only after age, dead-owner, and terminal-result evidence
 * all hold and the typed audit event has been persisted successfully.
 */
export function sweepStaleSpawnLocksForDispatch(
  projectRoot: string,
  options: StaleSpawnLockWatchdogOptions = {},
  deps: StaleSpawnLockWatchdogDeps = defaultStaleSpawnLockWatchdogDeps,
): StaleSpawnLockWatchdogReport {
  const requestedMax = options.maxFiles ?? STALE_SPAWNLOCK_MAX_FILES_PER_DISPATCH;
  const maxFiles = Number.isFinite(requestedMax)
    ? Math.max(0, Math.min(Math.floor(requestedMax), STALE_SPAWNLOCK_MAX_FILES_PER_DISPATCH))
    : STALE_SPAWNLOCK_MAX_FILES_PER_DISPATCH;
  const candidates = deps.inspect(projectRoot, {
    maxAgeMs: STALE_SPAWNLOCK_MAX_AGE_MS,
    maxFiles,
    ...(options.nowMs !== undefined ? { nowMs: options.nowMs } : {}),
  });
  let eligible = 0;
  let released = 0;

  for (const candidate of candidates) {
    if (deps.isOwnerPidAlive(candidate.lock.ownerPid)) continue;
    if (!deps.isTaskResultTerminal(projectRoot, candidate.lock.taskId)) continue;
    eligible++;

    const evidence: StaleSpawnLockEvidence = {
      ageExceeded: true,
      ownerPidDead: true,
      taskResultTerminal: true,
    };
    const metadata: StaleSpawnLockReleaseAuditMetadata = {
      lockPath: candidate.lockPath,
      ownerPid: candidate.lock.ownerPid,
      taskId: candidate.lock.taskId,
      filePath: candidate.lock.filePath,
      ageMs: candidate.ageMs,
      maxAgeMs: STALE_SPAWNLOCK_MAX_AGE_MS,
      evidence,
    };
    const audited = deps.writeReleaseAudit(projectRoot, options.sprintId ?? 'dispatch', {
      tenantId: options.tenantId ?? 'local',
      actor: 'dispatch-watchdog',
      action: STALE_SPAWNLOCK_RELEASE_AUDIT_ACTION,
      target: candidate.lockPath,
      metadata,
    });
    if (!audited) continue;
    if (deps.release(candidate)) released++;
  }

  return { inspected: candidates.length, eligible, released };
}

/**
 * Returns the cached host memory reading, performing the detection lazily
 * on first call. The detection itself is documented in
 * {@link detectHostMemory}.
 */
export function getDetectedHostMemory(): HostMemoryDetection {
  if (cachedDetection === null) {
    cachedDetection = detectHostMemory();
  }
  return cachedDetection;
}

/** Test seam — clears the cache so repeated detections can be exercised. */
export function _resetSpawnCoordinatorCache(): void {
  cachedDetection = null;
}

/**
 * WSL2 OOM-mitigation tier cap (Sprint 197 task 197-004).
 *
 * The per-worker formula in {@link suggestMaxWorkers} (`floor(totalGB /
 * workerMemGB) - 1`) is correct on bare-metal hosts but generous on WSL2
 * boxes where Linux + Brain + Auditor + Docker daemon already consume a
 * meaningful slice of the VM's RAM. Sprint 195/196 saw four worker OOM
 * exits (137) under three parallel opus tasks on 12-14 GB WSL2 hosts.
 *
 * This tier mirrors the conservative caps documented in DIRECTIVES 197:
 *   - `<8GB`   → 1 worker
 *   - `8-16GB` → 2 workers (default WSL2 dev box)
 *   - `16-32GB`→ 3 workers
 *   - `32GB+`  → 4 workers
 *
 * Pathological inputs (`NaN`, `≤0`) return the same safe default as
 * {@link suggestMaxWorkers}: a single worker so spawn callers always get a
 * usable number.
 */
export function tierBasedMaxWorkers(totalGB: number): number {
  if (!Number.isFinite(totalGB) || totalGB <= 0) return 1;
  if (totalGB < 8) return 1;
  if (totalGB < 16) return 2;
  if (totalGB < 32) return 3;
  return 4;
}

/**
 * Resolve `max_workers` for the active spawn pipeline.
 *
 * Behaviour:
 *   - If `configured` is a number, it wins (operator override is respected).
 *   - If `configured` is `'auto'` or `undefined`, the host RAM is detected
 *     once and the auto value is the **minimum** of the per-worker formula
 *     ({@link suggestMaxWorkers}) and the WSL2 OOM tier cap
 *     ({@link tierBasedMaxWorkers}). Taking the min keeps the per-worker
 *     math relevant when the host is small AND prevents 32GB+ hosts from
 *     spawning >4 workers — a safety bound observed empirically in Sprint
 *     195/196 OOM postmortems.
 *
 * The return value is always clamped to a positive integer so spawn
 * callers never see zero workers.
 */
export function resolveAutoMaxWorkers(
  configured: number | 'auto' | undefined,
  workerMemGB: number = DEFAULT_WORKER_MEM_GB,
): number {
  if (typeof configured === 'number' && Number.isFinite(configured) && configured > 0) {
    return Math.floor(configured);
  }
  const detection = getDetectedHostMemory();
  const perWorker = suggestMaxWorkers(detection.totalGB, workerMemGB);
  const tierCap = tierBasedMaxWorkers(detection.totalGB);
  return Math.min(perWorker, tierCap);
}
