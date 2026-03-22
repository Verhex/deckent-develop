/**
 * tests/orchestra/barrel-exports.test.ts — Barrel Export Audit Tests
 *
 * Verifies that:
 * 1. Public API functions are accessible via the orchestra barrel (index.ts)
 * 2. Internal-only functions are NOT exported from the barrel
 * 3. Key types are exported
 * 4. The barrel does not accidentally export unused/internal symbols
 */

import { describe, it, expect } from 'vitest';
import * as orchestraBarrel from '../../src/orchestra/index.js';

// ─── Test 1: Public Brain API is accessible ───────────────────────────────────

describe('Public Brain API is accessible via barrel', () => {
  it('exports runSprint', () => {
    expect(typeof orchestraBarrel.runSprint).toBe('function');
  });

  it('exports readContext', () => {
    expect(typeof orchestraBarrel.readContext).toBe('function');
  });

  it('exports checkUsage', () => {
    expect(typeof orchestraBarrel.checkUsage).toBe('function');
  });

  it('exports adjustSprintSize', () => {
    expect(typeof orchestraBarrel.adjustSprintSize).toBe('function');
  });

  it('exports planSprint', () => {
    expect(typeof orchestraBarrel.planSprint).toBe('function');
  });

  it('exports confirmDraftTasks', () => {
    expect(typeof orchestraBarrel.confirmDraftTasks).toBe('function');
  });

  it('exports buildWorkerPrompt', () => {
    expect(typeof orchestraBarrel.buildWorkerPrompt).toBe('function');
  });

  it('exports cleanup', () => {
    expect(typeof orchestraBarrel.cleanup).toBe('function');
  });

  it('exports runDecay', () => {
    expect(typeof orchestraBarrel.runDecay).toBe('function');
  });

  it('exports BrainError class', () => {
    expect(typeof orchestraBarrel.BrainError).toBe('function');
    const err = new orchestraBarrel.BrainError('test');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('BrainError');
  });
});

// ─── Test 2: Public Tmux API is accessible ────────────────────────────────────

describe('Public Tmux API is accessible via barrel', () => {
  it('exports isSessionActive', () => {
    expect(typeof orchestraBarrel.isSessionActive).toBe('function');
  });

  it('exports ensureSession', () => {
    expect(typeof orchestraBarrel.ensureSession).toBe('function');
  });

  it('exports spawnWorker', () => {
    expect(typeof orchestraBarrel.spawnWorker).toBe('function');
  });

  it('exports killWorker', () => {
    expect(typeof orchestraBarrel.killWorker).toBe('function');
  });

  it('exports attach', () => {
    expect(typeof orchestraBarrel.attach).toBe('function');
  });

  it('exports destroy', () => {
    expect(typeof orchestraBarrel.destroy).toBe('function');
  });

  it('exports setupWatchWindow', () => {
    expect(typeof orchestraBarrel.setupWatchWindow).toBe('function');
  });

  it('exports createWatchLayout', () => {
    expect(typeof orchestraBarrel.createWatchLayout).toBe('function');
  });

  it('exports attachToWorkerPane', () => {
    expect(typeof orchestraBarrel.attachToWorkerPane).toBe('function');
  });

  it('exports TmuxError class', () => {
    expect(typeof orchestraBarrel.TmuxError).toBe('function');
    const err = new orchestraBarrel.TmuxError('test');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('TmuxError');
  });
});

// ─── Test 3: Public Doc Updater API is accessible ─────────────────────────────

describe('Public Doc Updater API is accessible via barrel', () => {
  it('exports registerUpdater', () => {
    expect(typeof orchestraBarrel.registerUpdater).toBe('function');
  });

  it('exports runAllUpdaters', () => {
    expect(typeof orchestraBarrel.runAllUpdaters).toBe('function');
  });
});

// ─── Test 4: Internal functions are NOT exported from barrel ──────────────────

describe('Internal functions are NOT exported from the barrel', () => {
  it('does NOT export startAuditor (internal tmux helper)', () => {
    expect((orchestraBarrel as Record<string, unknown>).startAuditor).toBeUndefined();
  });

  it('does NOT export sendKeys (internal tmux helper)', () => {
    expect((orchestraBarrel as Record<string, unknown>).sendKeys).toBeUndefined();
  });

  it('does NOT export listWorkers (internal tmux helper)', () => {
    expect((orchestraBarrel as Record<string, unknown>).listWorkers).toBeUndefined();
  });

  it('does NOT export buildPlanPrompt (internal planner helper)', () => {
    expect((orchestraBarrel as Record<string, unknown>).buildPlanPrompt).toBeUndefined();
  });

  it('does NOT export parsePlannerResponse (internal planner helper)', () => {
    expect((orchestraBarrel as Record<string, unknown>).parsePlannerResponse).toBeUndefined();
  });

  it('does NOT export callBrainPlanner (internal planner helper)', () => {
    expect((orchestraBarrel as Record<string, unknown>).callBrainPlanner).toBeUndefined();
  });

  it('does NOT export pauseSprint (internal sprint lifecycle)', () => {
    expect((orchestraBarrel as Record<string, unknown>).pauseSprint).toBeUndefined();
  });

  it('does NOT export resumeSprint (internal sprint lifecycle)', () => {
    expect((orchestraBarrel as Record<string, unknown>).resumeSprint).toBeUndefined();
  });

  it('does NOT export checkAndAutoPause (internal sprint lifecycle)', () => {
    expect((orchestraBarrel as Record<string, unknown>).checkAndAutoPause).toBeUndefined();
  });

  it('does NOT export checkAndAutoResume (internal sprint lifecycle)', () => {
    expect((orchestraBarrel as Record<string, unknown>).checkAndAutoResume).toBeUndefined();
  });

  it('does NOT export isStaleTaskFile (internal task file utility)', () => {
    expect((orchestraBarrel as Record<string, unknown>).isStaleTaskFile).toBeUndefined();
  });

  it('does NOT export getChannelRegistry (internal IPC registry)', () => {
    expect((orchestraBarrel as Record<string, unknown>).getChannelRegistry).toBeUndefined();
  });

  it('does NOT export registerWorkerChannel (internal IPC registry)', () => {
    expect((orchestraBarrel as Record<string, unknown>).registerWorkerChannel).toBeUndefined();
  });

  it('does NOT export unregisterWorkerChannel (internal IPC registry)', () => {
    expect((orchestraBarrel as Record<string, unknown>).unregisterWorkerChannel).toBeUndefined();
  });

  it('does NOT export evaluateResultDI (internal DI variant)', () => {
    expect((orchestraBarrel as Record<string, unknown>).evaluateResultDI).toBeUndefined();
  });

  it('does NOT export waitForResultsDI (internal DI variant)', () => {
    expect((orchestraBarrel as Record<string, unknown>).waitForResultsDI).toBeUndefined();
  });

  it('does NOT export checkUsageStandalone (internal standalone variant)', () => {
    expect((orchestraBarrel as Record<string, unknown>).checkUsageStandalone).toBeUndefined();
  });

  it('does NOT export TmuxBackend (internal spawn backend)', () => {
    expect((orchestraBarrel as Record<string, unknown>).TmuxBackend).toBeUndefined();
  });

  it('does NOT export SubprocessBackend (internal spawn backend)', () => {
    expect((orchestraBarrel as Record<string, unknown>).SubprocessBackend).toBeUndefined();
  });

  it('does NOT export SpawnBackendFactory (internal factory)', () => {
    expect((orchestraBarrel as Record<string, unknown>).SpawnBackendFactory).toBeUndefined();
  });

  it('does NOT export SpawnBackendError (internal error class)', () => {
    expect((orchestraBarrel as Record<string, unknown>).SpawnBackendError).toBeUndefined();
  });

  it('does NOT export changelogUpdater (internal doc updater instance)', () => {
    expect((orchestraBarrel as Record<string, unknown>).changelogUpdater).toBeUndefined();
  });

  it('does NOT export sprintLogUpdater (internal doc updater instance)', () => {
    expect((orchestraBarrel as Record<string, unknown>).sprintLogUpdater).toBeUndefined();
  });

  it('does NOT export readmeMetricsUpdater (internal doc updater instance)', () => {
    expect((orchestraBarrel as Record<string, unknown>).readmeMetricsUpdater).toBeUndefined();
  });

  it('does NOT export healthCheckUpdater (internal doc updater instance)', () => {
    expect((orchestraBarrel as Record<string, unknown>).healthCheckUpdater).toBeUndefined();
  });

  it('does NOT export getRegisteredUpdaters (internal registry query)', () => {
    expect((orchestraBarrel as Record<string, unknown>).getRegisteredUpdaters).toBeUndefined();
  });

  it('does NOT export clearUpdaters (internal registry mutation)', () => {
    expect((orchestraBarrel as Record<string, unknown>).clearUpdaters).toBeUndefined();
  });
});

// ─── Test 5: Barrel exports form a stable, minimal public surface ──────────────

describe('Barrel exports form a minimal public surface', () => {
  const EXPECTED_PUBLIC_FUNCTIONS = [
    // Brain API
    'runSprint', 'readContext', 'checkUsage', 'adjustSprintSize',
    'planSprint', 'confirmDraftTasks', 'buildWorkerPrompt', 'cleanup', 'runDecay',
    'BrainError',
    // Tmux API
    'isSessionActive', 'ensureSession', 'spawnWorker', 'killWorker',
    'attach', 'destroy', 'setupWatchWindow', 'createWatchLayout', 'attachToWorkerPane',
    'TmuxError',
    // Doc Updater API
    'registerUpdater', 'runAllUpdaters',
  ];

  it('exports exactly the expected public functions (no extra runtime symbols)', () => {
    const actualExports = Object.keys(orchestraBarrel);
    for (const expected of EXPECTED_PUBLIC_FUNCTIONS) {
      expect(actualExports).toContain(expected);
    }
  });

  it('public surface count is within expected range (no export explosion)', () => {
    // Counting only function/class exports (not type-only exports which vanish at runtime)
    const runtimeExports = Object.keys(orchestraBarrel);
    // We have exactly 22 public runtime symbols (functions + classes)
    expect(runtimeExports.length).toBe(EXPECTED_PUBLIC_FUNCTIONS.length);
  });
});
