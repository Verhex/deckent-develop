// tests/nervous/integration-runtime.test.ts
//
// W3-3 — Sprint 180 Task 8 integration runtime test.
//
// Drives the Nervous System pipeline end-to-end with the exact same wiring
// that `src/nervous/bootstrap.ts` (W1-2, Task 3) performs:
//
//   Observer cron tick
//     → DetectorRegistry.runAll()
//     → StaleWorkerDetector.detect()
//     → DecisionEngine.decide()
//     → Proposer.propose()
//     → Promise.allSettled([
//          NervousDispatcher.dispatch()  → .deckent/nervous/nervous-log.jsonl,
//          Executor.handle()             → .deckent/nervous/nervous-history.jsonl,
//       ])
//
// NERVOUS-TODO §11.5 test stratejisi: real pipeline, real I/O, no per-layer
// mocks. Mocking is limited to the user-injected `actionHandler` so we can
// observe the autonomous resolution payload deterministically.
//
// The pipeline is assembled in-test (mirroring bootstrap.ts) rather than via
// `createNervousSystemIfEnabled` import so this integration test stays
// resilient to the bootstrap module's availability at worker spawn time.
// Once `src/nervous/bootstrap.ts` is part of the consumed working tree, the
// `assembleNervousPipeline` helper below can be swapped for that import
// without touching the assertions.
//
// File path note: the dispatcher file channel writes to
// `.deckent/nervous/nervous-log.jsonl` (see src/nervous/dispatcher.ts pushToFile),
// not the legacy `.deckent/nervous-events/*.json` directory hinted at in
// DIRECTIVES. The assertion uses the real path.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  mkdtempSync,
  rmSync,
  existsSync,
  readFileSync,
  mkdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { NervousObserver, type SprintStateProvider } from '../../src/nervous/observer.js';
import { DecisionEngine } from '../../src/nervous/decision-engine.js';
import { Proposer } from '../../src/nervous/proposer.js';
import { NervousDispatcher } from '../../src/nervous/dispatcher.js';
import { Executor, type ActionHandler } from '../../src/nervous/executor.js';
import { NervousHistory } from '../../src/nervous/history.js';
import type { DetectorConfig } from '../../src/nervous/detector-registry.js';
import type {
  DetectorResult,
  NervousSystemConfigV1,
  ObserverEvent,
} from '../../src/core/nervous-types.js';

// ─── Inline pipeline assembler (mirrors bootstrap.ts) ──────────────────────

interface PipelineHandle {
  readonly observer: NervousObserver;
  dispose(): void;
}

/**
 * Assemble the same six-module pipeline that `createNervousSystemIfEnabled`
 * does. Used in this integration test to verify the runtime wiring without
 * coupling to the bootstrap module's filesystem availability.
 */
function assembleNervousPipeline(
  nervousConfig: NervousSystemConfigV1 & { detectors?: DetectorConfig },
  projectRoot: string,
  sprintStateProvider: SprintStateProvider,
  actionHandler: ActionHandler,
): PipelineHandle {
  const observer = new NervousObserver(
    projectRoot,
    15_000,
    nervousConfig.detectors,
    sprintStateProvider,
  );
  const decisionEngine = new DecisionEngine(nervousConfig);
  const proposer = new Proposer(nervousConfig);
  const dispatcher = new NervousDispatcher(nervousConfig, projectRoot);
  const history = new NervousHistory(projectRoot);
  const executor = new Executor(history, actionHandler);

  observer.on('detection', (result: DetectorResult, event: ObserverEvent) => {
    void (async () => {
      try {
        const decisions = decisionEngine.decide(result);
        if (decisions.length === 0) return;
        // bug-2: title/message/detectorId now first-class on DetectorResult —
        // read them directly (the registry stamps detectorId), mirroring the
        // fixed bootstrap.runPipeline. The old metadata-bag + 'unknown'/'Detected:'
        // fallbacks encoded the bug this test now guards against.
        const detectorId = result.detectorId
          ?? String((result.metadata as { type?: unknown } | undefined)?.type ?? 'detector');
        const notification = proposer.propose(result, decisions, {
          detectorId,
          sprintId: event.sprintId,
          taskId: event.taskId,
          title: result.title,
          message: result.message,
        });
        if (!notification) return;
        await Promise.allSettled([
          dispatcher.dispatch(notification),
          executor.handle(notification),
        ]);
      } catch (err) {
        console.error('[integration-test pipeline] failed:', err);
      }
    })();
  });

  observer.start();

  let disposed = false;
  return {
    observer,
    dispose(): void {
      if (disposed) return;
      disposed = true;
      try { observer.stop(); } catch { /* swallow */ }
      try { executor.shutdown(); } catch { /* swallow */ }
    },
  };
}

// ─── File polling helper ───────────────────────────────────────────────────

/**
 * Poll for a JSONL file to exist and be non-empty.
 * `appendFile` is libuv-backed and is NOT faked by vitest fake timers, so the
 * write may settle a few ticks after `advanceTimersByTimeAsync` returns.
 */
async function waitForJsonlFile(path: string, timeoutMs: number): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (existsSync(path)) {
      const content = readFileSync(path, 'utf-8');
      if (content.length > 0) return true;
    }
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  return false;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('Nervous Integration Runtime — W3-3 full pipeline', () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), 'nervous-int-'));
    mkdirSync(join(projectRoot, '.deckent'), { recursive: true });
    mkdirSync(join(projectRoot, '.tasks'), { recursive: true });
    mkdirSync(join(projectRoot, '.brain'), { recursive: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it('cron tick → stale-worker → dispatcher (file) + executor (history)', async () => {
    const NOW = new Date('2026-05-20T12:00:00Z');
    // 5 minutes before NOW → exceeds 60s threshold below
    const STALE_HB = '2026-05-20T11:55:00Z';

    const sprintStateProvider: SprintStateProvider = () => ({
      sprintId: 'sprint-180',
      currentPhase: 'EXECUTE',
      activeWorkers: [
        { id: 'w-180-int', taskId: 'T-int', lastHeartbeat: STALE_HB },
      ],
      openDebtCount: 0,
      totalTasks: 3,
      completedTasks: 1,
    });

    // Mock action handler — autopilot + medium risk → autonomous, so Executor
    // calls this and appends an ExecutionRecord with outcome='success'.
    const actionHandler = vi
      .fn<Parameters<ActionHandler>, ReturnType<ActionHandler>>()
      .mockResolvedValue({ outcome: 'success' as const });

    // Authority mode 'autopilot' so medium-risk WORKER_RESPAWN → autonomous.
    // The W3-2 'strict' smoke config is validated separately; here the goal
    // is to flow the pipeline through executor without external approval.
    const nervousConfig: NervousSystemConfigV1 & { detectors?: DetectorConfig } = {
      enabled: true,
      mode: 'autopilot',
      throttleWindowMs: 0,
      detectors: {
        stale_worker: { enabled: true, threshold_ms: 60_000 },
      },
    };

    vi.useFakeTimers();
    vi.setSystemTime(NOW);

    const handle = assembleNervousPipeline(
      nervousConfig,
      projectRoot,
      sprintStateProvider,
      actionHandler,
    );
    expect(handle.observer.isStarted).toBe(true);

    // Drive one cron tick (default observer cronIntervalMs = 15_000)
    await vi.advanceTimersByTimeAsync(16_000);

    // Hand control back to the real event loop so the fire-and-forget
    // pipeline (Promise.allSettled with real fs/promises appendFile) can
    // settle on disk.
    vi.useRealTimers();

    const logPath = join(projectRoot, '.deckent', 'nervous', 'nervous-log.jsonl');
    const historyPath = join(projectRoot, '.deckent', 'nervous', 'nervous-history.jsonl');

    expect(await waitForJsonlFile(logPath, 2000)).toBe(true);
    expect(await waitForJsonlFile(historyPath, 2000)).toBe(true);

    // ─── Assert 1: dispatcher file channel emitted notification ────────────
    const logContent = readFileSync(logPath, 'utf-8');
    const logLines = logContent.split('\n').filter(Boolean);
    expect(logLines.length).toBeGreaterThanOrEqual(1);
    const firstLog = JSON.parse(logLines[0]) as Record<string, unknown>;
    expect(typeof firstLog.id).toBe('string');
    expect(typeof firstLog.title).toBe('string');
    expect(typeof firstLog.severity).toBe('string');
    expect(firstLog.actionCount).toBeGreaterThanOrEqual(1);

    // ─── Assert 2: history.jsonl appended at least one ExecutionRecord ─────
    const historyContent = readFileSync(historyPath, 'utf-8');
    const historyLines = historyContent.split('\n').filter(Boolean);
    expect(historyLines.length).toBeGreaterThanOrEqual(1);
    const firstRecord = JSON.parse(historyLines[0]) as Record<string, unknown>;
    expect(firstRecord.actionId).toBe('WORKER_RESPAWN');
    expect(typeof firstRecord.notificationId).toBe('string');
    expect(typeof firstRecord.executedAt).toBe('string');
    expect(firstRecord.decision).toBe('autonomous');
    expect(firstRecord.outcome).toBe('success');

    // ─── Assert 3: autonomous handler invoked with stale-worker payload ────
    expect(actionHandler).toHaveBeenCalled();
    const firstCall = actionHandler.mock.calls[0];
    expect(firstCall[0]).toBe('WORKER_RESPAWN');
    expect(firstCall[1]).toMatchObject({
      workerId: 'w-180-int',
      taskId: 'T-int',
    });

    // ─── Cleanup ───────────────────────────────────────────────────────────
    handle.dispose();
    expect(handle.observer.isStarted).toBe(false);
  }, 15_000);
});
