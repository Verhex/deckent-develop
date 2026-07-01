// ─── STATE-FEED — live-footer real state source (Sprint 354, Task 354-014) ──
//
// Wires buildLiveFooter's state-seam (LiveFooterState, see live-footer.ts) to
// real on-disk sprint state: .tasks/task-<id>.hb heartbeats + the single
// .deckent/sprint-state.json snapshot. All fs access goes through an
// injectable seam (StateFeedFs) so this reader stays fs-fake-testable without
// touching real project files (see tests/cli/run-state-feed.test.ts).
//
// Provider-health/auth: read-only from an optional on-disk cache
// (PROVIDER_HEALTH_CACHE_FILE) IF some other module has ever written one.
// This module never probes a provider or auth state itself — no writer for
// that cache exists yet anywhere in the codebase (checked: provider-auth-probe.ts
// and health-snapshot.ts both perform LIVE probes, session-interface.ts's
// Connector.healthCache is a private in-memory Map with no getter); until a
// writer lands, provider/auth simply stay undefined — the same
// "file-absence -> honest idle" rule applied uniformly across every input.
//
// A missing or corrupt file at any seam degrades to "absent", never to a
// thrown error or fabricated state.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { TASKS_DIR, SPRINT_STATE_FILE, RUNTIME_DIR } from '../../core/constants.js';
import type { LiveFooterState, LiveFooterProviderState, LiveFooterAuthState } from './live-footer.js';

// ─── fs seam ────────────────────────────────────────────────────────────────

export interface StateFeedFs {
  existsSync(path: string): boolean;
  readFileSync(path: string): string;
  readdirSync(path: string): string[];
}

const REAL_FS: StateFeedFs = {
  existsSync: (path) => existsSync(path),
  readFileSync: (path) => readFileSync(path, 'utf-8'),
  readdirSync: (path) => readdirSync(path),
};

/** Forward seam: no writer exists yet — see file header. Path is stable so a
 * future probe-cache writer can target it without any change to this reader. */
export const PROVIDER_HEALTH_CACHE_FILE = join(RUNTIME_DIR, 'provider-health-cache.json');

// ─── Raw on-disk shapes ─────────────────────────────────────────────────────
// Deliberately permissive: real .hb writers in this codebase (docker backend)
// omit fields the canonical `Heartbeat` type (core/monitoring-types.ts) marks
// required (currentAction, filesChangedCount, progress) — this reader must not
// throw or drop a heartbeat just because of that.

interface RawSprintState {
  sprintId?: unknown;
  phase?: unknown;
  startedAt?: unknown;
  taskIds?: unknown;
}

interface RawHeartbeat {
  taskId?: unknown;
}

interface RawProviderHealthCache {
  provider?: { name?: unknown; healthy?: unknown };
  auth?: unknown;
}

// ─── Pure core ──────────────────────────────────────────────────────────────

export interface StateFeedInput {
  sprintState: RawSprintState | null;
  /** One raw parsed object per readable task-<id>.hb file. */
  heartbeats: RawHeartbeat[];
  /** taskIds with a task-<id>.result file already written (order-independent). */
  finishedTaskIds: ReadonlySet<string>;
  /** Parsed provider-health-cache.json, if present + well-formed. */
  providerCache: RawProviderHealthCache | null;
}

function normalizeAuth(value: unknown): LiveFooterAuthState | undefined {
  return value === 'logged-in' || value === 'logged-out' || value === 'unknown' ? value : undefined;
}

function normalizeProvider(raw: RawProviderHealthCache['provider']): LiveFooterProviderState | undefined {
  if (!raw || typeof raw.name !== 'string') return undefined;
  const healthy: boolean | 'unknown' = raw.healthy === true ? true : raw.healthy === false ? false : 'unknown';
  return { name: raw.name, healthy };
}

/**
 * Pure — computes LiveFooterState from already-parsed inputs, zero I/O.
 * Missing sprint-state (`sprintState: null`) yields an entirely empty result
 * (buildLiveFooter then honestly collapses to "idle").
 */
export function computeLiveFooterState(input: StateFeedInput): LiveFooterState {
  const { sprintState, heartbeats, finishedTaskIds, providerCache } = input;
  const state: LiveFooterState = {};

  const heartbeatTaskIds = heartbeats
    .map((hb) => (typeof hb.taskId === 'string' ? hb.taskId : null))
    .filter((id): id is string => id !== null);
  const activeTaskIds = heartbeatTaskIds.filter((id) => !finishedTaskIds.has(id));

  const sprintId = typeof sprintState?.sprintId === 'string' ? sprintState.sprintId : undefined;
  const phase = typeof sprintState?.phase === 'string' ? sprintState.phase : undefined;

  if (sprintId !== undefined && phase !== undefined) {
    if (activeTaskIds.length === 1) {
      state.running = `${activeTaskIds[0]} · ${phase}`;
    } else if (activeTaskIds.length > 1) {
      state.running = `${activeTaskIds.length} tasks · ${phase}`;
    } else {
      state.running = `${sprintId} · ${phase}`;
    }
  }

  if (typeof sprintState?.startedAt === 'string') {
    state.startedAt = sprintState.startedAt;
  }

  const provider = normalizeProvider(providerCache?.provider);
  if (provider !== undefined) state.provider = provider;

  const auth = normalizeAuth(providerCache?.auth);
  if (auth !== undefined) state.auth = auth;

  const rawTaskIds = sprintState?.taskIds;
  const taskIds: string[] = Array.isArray(rawTaskIds)
    ? rawTaskIds.filter((id): id is string => typeof id === 'string')
    : [];
  const startedTaskIds = new Set(heartbeatTaskIds);
  const next = taskIds.find((id) => !startedTaskIds.has(id) && !finishedTaskIds.has(id));
  if (next !== undefined) state.next = next;

  return state;
}

// ─── fs-seam reader ─────────────────────────────────────────────────────────

export interface StateFeedOptions {
  /** Absolute project root — .tasks/, .deckent/sprint-state.json etc. are
   * resolved relative to it. */
  projectRoot: string;
  /** Defaults to real node:fs. Inject a fake for hermetic tests. */
  fs?: StateFeedFs;
}

function readJson<T>(fs: StateFeedFs, path: string): T | null {
  if (!fs.existsSync(path)) return null;
  try {
    return JSON.parse(fs.readFileSync(path)) as T;
  } catch {
    return null;
  }
}

function readHeartbeatsAndResults(
  fs: StateFeedFs,
  tasksDir: string,
): { heartbeats: RawHeartbeat[]; finishedTaskIds: Set<string> } {
  const heartbeats: RawHeartbeat[] = [];
  const finishedTaskIds = new Set<string>();
  if (!fs.existsSync(tasksDir)) return { heartbeats, finishedTaskIds };

  let files: string[];
  try {
    files = fs.readdirSync(tasksDir);
  } catch {
    return { heartbeats, finishedTaskIds };
  }

  for (const file of files) {
    if (!file.endsWith('.result')) continue;
    finishedTaskIds.add(file.replace(/^task-/, '').replace(/\.result$/, ''));
  }

  for (const file of files) {
    if (!file.endsWith('.hb')) continue;
    try {
      heartbeats.push(JSON.parse(fs.readFileSync(join(tasksDir, file))) as RawHeartbeat);
    } catch {
      // malformed .hb — skip silently (matches sprint-state-tracker.ts precedent)
    }
  }

  return { heartbeats, finishedTaskIds };
}

/**
 * Reads .tasks/*.hb + .deckent/sprint-state.json (+ optional provider-health
 * cache) through `options.fs` and returns the resulting LiveFooterState.
 * Never triggers a provider/auth probe; a missing or corrupt file at any seam
 * degrades to "absent" rather than throwing.
 */
export function readLiveFooterState(options: StateFeedOptions): LiveFooterState {
  const fs = options.fs ?? REAL_FS;
  const tasksDir = join(options.projectRoot, TASKS_DIR);
  const sprintStateFile = join(options.projectRoot, SPRINT_STATE_FILE);
  const providerCacheFile = join(options.projectRoot, PROVIDER_HEALTH_CACHE_FILE);

  const sprintState = readJson<RawSprintState>(fs, sprintStateFile);
  const { heartbeats, finishedTaskIds } = readHeartbeatsAndResults(fs, tasksDir);
  const providerCache = readJson<RawProviderHealthCache>(fs, providerCacheFile);

  return computeLiveFooterState({ sprintState, heartbeats, finishedTaskIds, providerCache });
}

/**
 * Factory matching the `stateFeed?: () => LiveFooterState` seam consumed by
 * ReplApp (src/cli/repl/app.tsx) — each call re-reads a fresh snapshot, so
 * the caller's poll interval controls freshness; no caching is done here.
 */
export function createRunStateFeed(options: StateFeedOptions): () => LiveFooterState {
  return () => readLiveFooterState(options);
}
