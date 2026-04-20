// ═══ Event Stream Timeout Emit Tests ══════════════════════════════
// Sprint 145 — Task 017: Timeout event emission via emitTimeoutEvents()

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readEvents, CHANNELS } from '../../src/orchestra/event-stream.js';
import { emitTimeoutEvents } from '../../src/orchestra/task-router.js';
import type { Task } from '../../src/core/task-types.js';
import type { ResolvedConfig } from '../../src/core/config-types.js';
import type { SprintHistory } from '../../src/orchestra/timeout-estimator.js';

// Inline timeout config — mirrors DEFAULT_TIMEOUT_CONFIG (Task 2 dependency)
const TEST_TIMEOUT_CONFIG = {
  docker_min_timeout: 1200,
  docker_max_timeout: 7200,
  tmux_min_timeout: 900,
  tmux_max_timeout: 5400,
  subprocess_min_timeout: 600,
  subprocess_max_timeout: 3600,
  effort_base: { low: 600, normal: 1200, high: 2400 },
  loc_scaling_enabled: true,
  history_scaling_enabled: true,
  runtime_extension_enabled: false,
};

// ─── Helpers ─────────────────────────────────────────────────────

function createTestRoot(): string {
  const root = join(tmpdir(), `deckent-timeout-evt-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(root, '.deckent'), { recursive: true });
  return root;
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'test-001',
    title: 'Test Task',
    description: '',
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'test',
    scope: {
      directories: ['src/'],
      filesRead: [],
      filesWrite: [],
    },
    dependencies: [],
    goNogo: {
      goCriteria: 'pass',
      noGoCriteria: 'fail',
      techDebtAcceptable: 'partial',
    },
    status: 'PENDING',
    ...overrides,
  } as Task;
}

function makeConfig(overrides: Partial<ResolvedConfig> = {}): ResolvedConfig {
  return {
    timeout: structuredClone(TEST_TIMEOUT_CONFIG),
    spawn_backend: 'docker',
    ...overrides,
  } as ResolvedConfig;
}

function emptyHistory(): SprintHistory {
  return { avgTaskDurationMs: 0, sprintCount: 0 };
}

// ─── Tests ──────────────────────────────────────────────────────

describe('Timeout Event Stream Emit (Sprint 145 Task 017)', () => {
  let testRoot: string;
  const sprintId = 'sprint-145';

  beforeEach(() => {
    testRoot = createTestRoot();
  });

  afterEach(() => {
    try { rmSync(testRoot, { recursive: true, force: true }); } catch { /* best-effort */ }
  });

  // ─── Channel Constants ──────────────────────────────────────────

  describe('CHANNELS constants', () => {
    it('defines TIMEOUT_ASSIGN channel', () => {
      expect(CHANNELS.TIMEOUT_ASSIGN).toBe('BRAIN→WORKER:TIMEOUT_ASSIGN');
    });

    it('defines TIMEOUT_WARNING channel', () => {
      expect(CHANNELS.TIMEOUT_WARNING).toBe('WORKER→BRAIN:TIMEOUT_WARNING');
    });

    it('defines TIMEOUT_CAP_EXCEEDED channel', () => {
      expect(CHANNELS.TIMEOUT_CAP_EXCEEDED).toBe('AUDITOR→BRAIN:TIMEOUT_CAP_EXCEEDED');
    });
  });

  // ─── emitTimeoutEvents ──────────────────────────────────────────

  describe('emitTimeoutEvents()', () => {
    it('writes TIMEOUT_ASSIGN event after call', () => {
      const task = makeTask({ effort: 'normal' });
      const config = makeConfig();

      emitTimeoutEvents(task, config, emptyHistory(), testRoot, sprintId);

      const events = readEvents(testRoot, sprintId, { channel: CHANNELS.TIMEOUT_ASSIGN });
      expect(events).toHaveLength(1);
      expect(events[0]!.source).toBe('brain');
      expect(events[0]!.target).toBe('worker');
      expect(events[0]!.channel).toBe(CHANNELS.TIMEOUT_ASSIGN);

      const payload = events[0]!.payload as Record<string, unknown>;
      expect(payload.taskId).toBe('test-001');
      expect(payload.timeoutSeconds).toBeTypeOf('number');
      expect(payload.timeoutSeconds).toBeGreaterThan(0);
    });

    it('includes breakdown fields (base, multipliers) in TIMEOUT_ASSIGN payload', () => {
      const task = makeTask({ effort: 'high', description: '~500 LoC change' });
      const config = makeConfig();

      emitTimeoutEvents(task, config, emptyHistory(), testRoot, sprintId);

      const events = readEvents(testRoot, sprintId, { channel: CHANNELS.TIMEOUT_ASSIGN });
      expect(events).toHaveLength(1);

      const payload = events[0]!.payload as Record<string, unknown>;
      const breakdown = payload.breakdown as Record<string, unknown>;
      expect(breakdown).toBeDefined();
      expect(breakdown.base).toBeTypeOf('number');
      expect(breakdown.locMultiplier).toBeTypeOf('number');
      expect(breakdown.scopeMultiplier).toBeTypeOf('number');
      expect(breakdown.historyFactor).toBeTypeOf('number');
      expect(breakdown.backendFactor).toBeTypeOf('number');
      expect(breakdown.estimated).toBeTypeOf('number');
      expect(breakdown.clampedTo).toBeTypeOf('number');
      expect(breakdown.clampReason).toBeTypeOf('string');
    });

    it('writes TIMEOUT_CAP_EXCEEDED when estimate exceeds max_timeout', () => {
      const task = makeTask({ effort: 'high' });
      const timeoutCfg = {
        ...TEST_TIMEOUT_CONFIG,
        docker_max_timeout: 2000, // artificially low max to force ceiling clamp
      };
      const config = makeConfig({ timeout: timeoutCfg, spawn_backend: 'docker' });

      emitTimeoutEvents(task, config, emptyHistory(), testRoot, sprintId);

      // TIMEOUT_ASSIGN should always be present
      const assignEvents = readEvents(testRoot, sprintId, { channel: CHANNELS.TIMEOUT_ASSIGN });
      expect(assignEvents).toHaveLength(1);

      // TIMEOUT_CAP_EXCEEDED should also be present
      const capEvents = readEvents(testRoot, sprintId, { channel: CHANNELS.TIMEOUT_CAP_EXCEEDED });
      expect(capEvents).toHaveLength(1);
      expect(capEvents[0]!.source).toBe('auditor');
      expect(capEvents[0]!.target).toBe('brain');

      const payload = capEvents[0]!.payload as Record<string, unknown>;
      expect(payload.taskId).toBe('test-001');
      expect(payload.requested).toBeTypeOf('number');
      expect(payload.capped).toBe(2000);
      expect((payload.requested as number)).toBeGreaterThan(2000);
    });

    it('does NOT write TIMEOUT_CAP_EXCEEDED when estimate is within bounds', () => {
      // normal effort + docker → base 1200, docker bounds [1200, 7200]
      // 1200 * 1.0 * 1.0 * 1.0 * 1.0 = 1200, clamped to 1200 (min_floor), not max_ceiling
      const task = makeTask({ effort: 'normal' });
      const config = makeConfig();

      emitTimeoutEvents(task, config, emptyHistory(), testRoot, sprintId);

      const capEvents = readEvents(testRoot, sprintId, { channel: CHANNELS.TIMEOUT_CAP_EXCEEDED });
      expect(capEvents).toHaveLength(0);
    });

    it('emits correct taskId in both events for capped scenario', () => {
      const task = makeTask({
        id: 'task-777',
        effort: 'high',
      });
      const timeoutCfg = {
        ...TEST_TIMEOUT_CONFIG,
        docker_max_timeout: 1500,
      };
      const config = makeConfig({ timeout: timeoutCfg, spawn_backend: 'docker' });

      emitTimeoutEvents(task, config, emptyHistory(), testRoot, sprintId);

      const allEvents = readEvents(testRoot, sprintId);
      expect(allEvents.length).toBeGreaterThanOrEqual(2);

      const assignPayload = allEvents.find(e => e.channel === CHANNELS.TIMEOUT_ASSIGN)!.payload as Record<string, unknown>;
      const capPayload = allEvents.find(e => e.channel === CHANNELS.TIMEOUT_CAP_EXCEEDED)!.payload as Record<string, unknown>;

      expect(assignPayload.taskId).toBe('task-777');
      expect(capPayload.taskId).toBe('task-777');
    });
  });
});
