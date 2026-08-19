// ═══ Sprint 191 — Task 191-002 ═══════════════════════════════════════
// Heartbeat-aware runtime extension policy used by runEvaluatePhase before
// declaring a synthetic NO_GO for a missing .result file. Pure helper —
// reads only the on-disk heartbeat, mutates only the caller-owned state
// Map. All time inputs are injected for deterministic tests.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  evaluateRuntimeExtension,
  RUNTIME_EXTENSION_MAX,
  RUNTIME_EXTENSION_MS,
  RUNTIME_EXTENSION_HEARTBEAT_FRESH_S,
  type ExtensionStateMap,
} from '../../src/orchestra/sprint-phases.js';
import type { ResolvedConfig } from '../../src/core/types.js';
import { TASKS_DIR } from '../../src/core/constants.js';

// ─── Test Doubles ───────────────────────────────────────────────────

/** Minimal config stub honoring the single field this helper reads. */
function makeConfig(enabled: boolean): ResolvedConfig {
  return {
    timeout: {
      docker_min_timeout: 1200,
      docker_max_timeout: 7200,
      tmux_min_timeout: 900,
      tmux_max_timeout: 5400,
      subprocess_min_timeout: 600,
      subprocess_max_timeout: 3600,
      effort_base: { low: 600, normal: 1200, high: 2400 },
      loc_scaling_enabled: true,
      history_scaling_enabled: true,
      runtime_extension_enabled: enabled,
    },
  } as unknown as ResolvedConfig;
}

/** Write a heartbeat file with a controllable timestamp (ISO 8601). */
function writeHeartbeat(projectRoot: string, taskId: string, timestamp: string): void {
  mkdirSync(join(projectRoot, TASKS_DIR), { recursive: true });
  const payload = {
    workerId: `w-${taskId}`,
    taskId,
    status: 'EXECUTING',
    sequence: 1,
    timestamp,
  };
  writeFileSync(
    join(projectRoot, TASKS_DIR, `task-${taskId}.hb`),
    JSON.stringify(payload),
    'utf-8',
  );
}

// ─── Fixture Wiring ────────────────────────────────────────────────

let projectRoot: string;
let state: ExtensionStateMap;
const SPRINT_ID = 'sprint-test';
const TASK_ID = 't-001';
// Fixed clock at 2026-05-23T23:00:00Z — every heartbeat timestamp is computed
// relative to this anchor so freshness math is deterministic.
const FIXED_NOW_MS = new Date('2026-05-23T23:00:00.000Z').getTime();
const clock = (): number => FIXED_NOW_MS;

beforeEach(() => {
  projectRoot = mkdtempSync(join(tmpdir(), 'rt-ext-'));
  state = new Map();
});

afterEach(() => {
  rmSync(projectRoot, { recursive: true, force: true });
});

// ─── Tests ──────────────────────────────────────────────────────────

describe('evaluateRuntimeExtension', () => {
  it('grants an extension when enabled + heartbeat fresh + counter below cap', () => {
    // Heartbeat 30s old — well under the 90s freshness threshold.
    const hbIso = new Date(FIXED_NOW_MS - 30_000).toISOString();
    writeHeartbeat(projectRoot, TASK_ID, hbIso);

    const decision = evaluateRuntimeExtension(
      projectRoot, SPRINT_ID, TASK_ID, makeConfig(true), state, clock,
    );

    expect(decision.granted).toBe(true);
    expect(decision.reason).toBe('granted');
    expect(decision.extensionCount).toBe(1);
    expect(decision.extensionMs).toBe(RUNTIME_EXTENSION_MS);
    expect(state.get(`${SPRINT_ID}::${TASK_ID}`)).toBe(1);
  });

  it('denies extension when runtime_extension_enabled=false', () => {
    const hbIso = new Date(FIXED_NOW_MS - 10_000).toISOString();
    writeHeartbeat(projectRoot, TASK_ID, hbIso);

    const decision = evaluateRuntimeExtension(
      projectRoot, SPRINT_ID, TASK_ID, makeConfig(false), state, clock,
    );

    expect(decision.granted).toBe(false);
    expect(decision.reason).toBe('disabled');
    expect(state.has(`${SPRINT_ID}::${TASK_ID}`)).toBe(false);
  });

  it('denies extension when heartbeat is stale (older than 90s)', () => {
    // Heartbeat 120s old — past the 90s threshold.
    const hbIso = new Date(FIXED_NOW_MS - 120_000).toISOString();
    writeHeartbeat(projectRoot, TASK_ID, hbIso);
    // 7094-F1d: the denial now comes from the worker-liveness probe (file
    // MTIME, real clock), not the in-file timestamp age. Align the fixture's
    // mtime with its content timestamp — in production the single spawn-time
    // `.hb` write makes them equal; a fixture written "now" would probe alive.
    utimesSync(
      join(projectRoot, TASKS_DIR, `task-${TASK_ID}.hb`),
      new Date(hbIso), new Date(hbIso),
    );

    const decision = evaluateRuntimeExtension(
      projectRoot, SPRINT_ID, TASK_ID, makeConfig(true), state, clock,
    );

    expect(decision.granted).toBe(false);
    expect(decision.reason).toBe('stale_heartbeat');
    expect(state.has(`${SPRINT_ID}::${TASK_ID}`)).toBe(false);
  });

  it('denies extension when no heartbeat file exists', () => {
    const decision = evaluateRuntimeExtension(
      projectRoot, SPRINT_ID, TASK_ID, makeConfig(true), state, clock,
    );

    expect(decision.granted).toBe(false);
    expect(decision.reason).toBe('no_heartbeat');
  });

  it('denies extension once the per-task cap of 3 is exhausted', () => {
    const hbIso = new Date(FIXED_NOW_MS - 10_000).toISOString();
    writeHeartbeat(projectRoot, TASK_ID, hbIso);

    // Pre-seed the counter at the hard cap.
    state.set(`${SPRINT_ID}::${TASK_ID}`, RUNTIME_EXTENSION_MAX);

    const decision = evaluateRuntimeExtension(
      projectRoot, SPRINT_ID, TASK_ID, makeConfig(true), state, clock,
    );

    expect(decision.granted).toBe(false);
    expect(decision.reason).toBe('cap_reached');
    expect(decision.extensionCount).toBe(RUNTIME_EXTENSION_MAX);
    // Counter must NOT advance past the cap.
    expect(state.get(`${SPRINT_ID}::${TASK_ID}`)).toBe(RUNTIME_EXTENSION_MAX);
  });

  it('rejects extension when config is undefined (legacy callers)', () => {
    const hbIso = new Date(FIXED_NOW_MS - 10_000).toISOString();
    writeHeartbeat(projectRoot, TASK_ID, hbIso);

    const decision = evaluateRuntimeExtension(
      projectRoot, SPRINT_ID, TASK_ID, undefined, state, clock,
    );

    expect(decision.granted).toBe(false);
    expect(decision.reason).toBe('disabled');
  });

  it('counts up to the cap across successive calls (idempotent state)', () => {
    const hbIso = new Date(FIXED_NOW_MS - 5_000).toISOString();
    writeHeartbeat(projectRoot, TASK_ID, hbIso);

    const cfg = makeConfig(true);
    const first = evaluateRuntimeExtension(projectRoot, SPRINT_ID, TASK_ID, cfg, state, clock);
    const second = evaluateRuntimeExtension(projectRoot, SPRINT_ID, TASK_ID, cfg, state, clock);
    const third = evaluateRuntimeExtension(projectRoot, SPRINT_ID, TASK_ID, cfg, state, clock);
    const fourth = evaluateRuntimeExtension(projectRoot, SPRINT_ID, TASK_ID, cfg, state, clock);

    expect(first.granted).toBe(true);
    expect(first.extensionCount).toBe(1);
    expect(second.granted).toBe(true);
    expect(second.extensionCount).toBe(2);
    expect(third.granted).toBe(true);
    expect(third.extensionCount).toBe(3);
    expect(fourth.granted).toBe(false);
    expect(fourth.reason).toBe('cap_reached');
  });

  it('treats malformed heartbeat JSON as invalid (no false positive)', () => {
    mkdirSync(join(projectRoot, TASKS_DIR), { recursive: true });
    writeFileSync(join(projectRoot, TASKS_DIR, `task-${TASK_ID}.hb`), '{ not json', 'utf-8');

    const decision = evaluateRuntimeExtension(
      projectRoot, SPRINT_ID, TASK_ID, makeConfig(true), state, clock,
    );

    expect(decision.granted).toBe(false);
    expect(decision.reason).toBe('invalid_heartbeat');
  });
});

describe('runtime extension constants', () => {
  it('hard cap is 3 (matches DIRECTIVES Task 191-002)', () => {
    expect(RUNTIME_EXTENSION_MAX).toBe(3);
  });

  it('per-extension budget is 5 minutes', () => {
    expect(RUNTIME_EXTENSION_MS).toBe(5 * 60 * 1000);
  });

  it('freshness threshold is 90 seconds', () => {
    expect(RUNTIME_EXTENSION_HEARTBEAT_FRESH_S).toBe(90);
  });
});
