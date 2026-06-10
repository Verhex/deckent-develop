// ─── resource-monitor sprint-lifecycle wire tests ──────────────────────────
// Sprint 271 Task 271-005. Hermetic: no real docker/network/fs — the monitor
// is a vi.fn() mock injected through the createAndStartResourceMonitor factory
// seam. Exercises the start/stop helpers that runSprint wires at SPAWN/CLEANUP.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  createAndStartResourceMonitor,
  stopResourceMonitor,
} from '../../src/orchestra/sprint-controller.js';
import type {
  ResourceMonitor,
  ResourceMonitorOpts,
} from '../../src/orchestra/resource-monitor.js';
import type { ResolvedConfig } from '../../src/core/types.js';
import type { ResourceMonitorConfig } from '../../src/core/config-types.js';

// ─── Fixtures ──────────────────────────────────────────────────────

/** Build a mock ResourceMonitor with spied lifecycle methods. */
function makeMockMonitor(): ResourceMonitor & {
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  sampleOnce: ReturnType<typeof vi.fn>;
} {
  return {
    start: vi.fn(),
    stop: vi.fn().mockResolvedValue(undefined),
    sampleOnce: vi.fn().mockResolvedValue([]),
  };
}

/** Minimal ResolvedConfig carrying only the resource_monitor block under test. */
function makeConfig(rm?: ResourceMonitorConfig): ResolvedConfig {
  return { resource_monitor: rm } as ResolvedConfig;
}

// ─── createAndStartResourceMonitor ─────────────────────────────────

describe('createAndStartResourceMonitor', () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'res-mon-wire-'));
  });

  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('starts the monitor when resource_monitor.enabled=true (SPAWN-phase wire)', () => {
    const monitor = makeMockMonitor();
    const factory = vi.fn<(opts: ResourceMonitorOpts) => ResourceMonitor>(() => monitor);

    const result = createAndStartResourceMonitor(
      tmpRoot, makeConfig({ enabled: true }), factory,
    );

    expect(result).toBe(monitor);
    expect(factory).toHaveBeenCalledTimes(1);
    expect(monitor.start).toHaveBeenCalledTimes(1);
  });

  it('returns null and never builds a monitor when the block is absent (zero behavior change)', () => {
    const factory = vi.fn<(opts: ResourceMonitorOpts) => ResourceMonitor>(makeMockMonitor);

    const result = createAndStartResourceMonitor(tmpRoot, makeConfig(undefined), factory);

    expect(result).toBeNull();
    expect(factory).not.toHaveBeenCalled();
  });

  it('returns null and does not build a monitor when enabled=false', () => {
    const factory = vi.fn<(opts: ResourceMonitorOpts) => ResourceMonitor>(makeMockMonitor);

    const result = createAndStartResourceMonitor(
      tmpRoot, makeConfig({ enabled: false }), factory,
    );

    expect(result).toBeNull();
    expect(factory).not.toHaveBeenCalled();
  });

  it('passes interval_ms and resolves the default log_path under the project root', () => {
    const monitor = makeMockMonitor();
    let captured: ResourceMonitorOpts | undefined;
    const factory = vi.fn<(opts: ResourceMonitorOpts) => ResourceMonitor>((opts) => {
      captured = opts;
      return monitor;
    });

    createAndStartResourceMonitor(
      tmpRoot, makeConfig({ enabled: true, interval_ms: 2000 }), factory,
    );

    expect(captured?.intervalMs).toBe(2000);
    expect(captured?.logPath).toBe(join(tmpRoot, '.deckent', 'resource-log.jsonl'));
  });

  it('honors a custom log_path (resolved under project root)', () => {
    const monitor = makeMockMonitor();
    let captured: ResourceMonitorOpts | undefined;
    const factory = vi.fn<(opts: ResourceMonitorOpts) => ResourceMonitor>((opts) => {
      captured = opts;
      return monitor;
    });

    createAndStartResourceMonitor(
      tmpRoot,
      makeConfig({ enabled: true, log_path: 'custom/res.jsonl' }),
      factory,
    );

    expect(captured?.logPath).toBe(join(tmpRoot, 'custom/res.jsonl'));
    expect(captured?.intervalMs).toBeUndefined();
  });

  it('is fail-safe: a throwing factory returns null and does not propagate (sprint unaffected)', () => {
    const factory = vi.fn<(opts: ResourceMonitorOpts) => ResourceMonitor>(() => {
      throw new Error('factory boom');
    });

    let result: ResourceMonitor | null = makeMockMonitor();
    expect(() => {
      result = createAndStartResourceMonitor(tmpRoot, makeConfig({ enabled: true }), factory);
    }).not.toThrow();
    expect(result).toBeNull();
  });

  it('is fail-safe: a throwing start() returns null and does not propagate', () => {
    const monitor = makeMockMonitor();
    monitor.start.mockImplementation(() => { throw new Error('start boom'); });
    const factory = vi.fn<(opts: ResourceMonitorOpts) => ResourceMonitor>(() => monitor);

    let result: ResourceMonitor | null = makeMockMonitor();
    expect(() => {
      result = createAndStartResourceMonitor(tmpRoot, makeConfig({ enabled: true }), factory);
    }).not.toThrow();
    expect(result).toBeNull();
    expect(monitor.start).toHaveBeenCalledTimes(1);
  });

  it('uses the real createResourceMonitor by default (no factory) without throwing', () => {
    // No factory arg → production default path. Disabled config keeps it a
    // pure no-op (returns null) so the default-arg branch is covered hermetically.
    const result = createAndStartResourceMonitor(tmpRoot, makeConfig({ enabled: false }));
    expect(result).toBeNull();
  });
});

// ─── stopResourceMonitor ───────────────────────────────────────────

describe('stopResourceMonitor', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('awaits stop() on a live monitor (CLEANUP-phase wire)', async () => {
    const monitor = makeMockMonitor();

    await stopResourceMonitor(monitor);

    expect(monitor.stop).toHaveBeenCalledTimes(1);
  });

  it('is a no-op on null (resume path / monitor never started)', async () => {
    await expect(stopResourceMonitor(null)).resolves.toBeUndefined();
  });

  it('is fail-safe: a rejecting stop() is swallowed and does not propagate', async () => {
    const monitor = makeMockMonitor();
    monitor.stop.mockRejectedValue(new Error('stop boom'));

    await expect(stopResourceMonitor(monitor)).resolves.toBeUndefined();
    expect(monitor.stop).toHaveBeenCalledTimes(1);
  });
});
