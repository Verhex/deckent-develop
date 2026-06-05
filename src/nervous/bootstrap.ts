// src/nervous/bootstrap.ts
//
// Nervous System bootstrap fabrika — Sprint 180 Task 3 (W1-2), Sprint 181 recovery.
// NERVOUS-TODO §11.2 Step A.
//
// createNervousSystemIfEnabled(config, projectRoot, sprintStateProvider):
//   - config.nervous_system?.enabled === false (veya yok) → null döner (default-off)
//   - enabled → Observer + DecisionEngine + Proposer + Dispatcher + Executor + History
//     instantiate + 'detection' event chain wire + observer.start() → handle döner
//
// dispose() — observer.stop() + executor.shutdown() (pending timer + approval cleanup).
//
// ADR-008 uyumlu: bootstrap sadece nervous/ + core/ import eder.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { NervousObserver } from './observer.js';
import { DecisionEngine } from './decision-engine.js';
import { Proposer } from './proposer.js';
import { NervousDispatcher } from './dispatcher.js';
import { Executor } from './executor.js';
import { NervousHistory } from './history.js';
import {
  NervousIpcQueue,
  writeNervousHeartbeat,
  clearNervousHeartbeat,
} from './ipc-queue.js';
import type { ActionHandler, PendingApprovalStore } from './executor.js';
import type {
  DetectorResult,
  NervousNotification,
  NervousSystemConfig,
  ObserverEvent,
  SprintStateSnapshot,
} from '../core/nervous-types.js';

type ActionHandlerResult = Awaited<ReturnType<ActionHandler>>;
import type { DeckentConfig } from '../core/types.js';

// ─── Default Stub ActionHandler ────────────────────────────────────────────
//
// W2-1'de gerçek 4 MVP handler bu stub'ı değiştirecek (caller `actionHandler`
// parametresiyle inject eder).

const stubActionHandler: ActionHandler = async (
  actionId: string,
  _payload: unknown,
): Promise<ActionHandlerResult> => ({
  outcome: 'failure',
  error: `Action handler not yet wired: ${actionId} (W2-1)`,
});

export interface NervousSystemHandle {
  observer: NervousObserver;
  dispose: () => void;
}

/** Injectable dependencies (testability) — defaults wire the real file/IPC paths. */
export interface NervousBootstrapDeps {
  /** IPC queue polled for MCP accept/reject approvals (APPROVE-005). */
  ipcQueue?: Pick<NervousIpcQueue, 'startPolling'>;
  /** Pending approval persistence (APPROVE-004). */
  pendingStore?: PendingApprovalStore;
}

const PENDING_FILE = 'nervous-pending.json';

/**
 * File-backed PendingApprovalStore (APPROVE-004, §4G). Persists parked approvals
 * as the same `NervousNotification[]` shape that `deckent nervous` and the REPL
 * `/nervous` bridge read from `.deckent/nervous-pending.json`, so executor-parked
 * approvals become visible to the operator instead of an always-empty queue.
 */
export function makeFilePendingStore(projectRoot: string): PendingApprovalStore {
  const path = join(projectRoot, '.deckent', PENDING_FILE);
  const read = (): NervousNotification[] => {
    if (!existsSync(path)) return [];
    try {
      const data = JSON.parse(readFileSync(path, 'utf-8'));
      return Array.isArray(data) ? (data as NervousNotification[]) : [];
    } catch {
      return [];
    }
  };
  const write = (items: NervousNotification[]): void => {
    const dir = dirname(path);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(path, JSON.stringify(items, null, 2) + '\n', 'utf-8');
  };
  return {
    add(notification: NervousNotification): void {
      const items = read().filter((n) => n.id !== notification.id);
      items.push(notification);
      write(items);
    },
    remove(notificationId: string): void {
      const items = read();
      const next = items.filter((n) => n.id !== notificationId);
      if (next.length !== items.length) write(next);
    },
  };
}

/**
 * Nervous System tam pipeline'ını instantiate eder ve `'detection'` event
 * chain'ini wire eder. Tüm modüller Brain scope'unda yaşar (ADR-037).
 *
 * @param config       Resolved config wrapper (DeckentConfig)
 * @param projectRoot  Proje kök dizini — observer FS watch + history dosyası
 * @param sprintStateProvider  Detector'lara aktif sprint snapshot sağlayan callback
 * @param actionHandler  Opsiyonel — W2-1'de inject edilecek gerçek handler
 * @returns enabled ise handle, değilse null
 */
export function createNervousSystemIfEnabled(
  config: DeckentConfig,
  projectRoot: string,
  sprintStateProvider: () => SprintStateSnapshot,
  actionHandler: ActionHandler = stubActionHandler,
  deps: NervousBootstrapDeps = {},
): NervousSystemHandle | null {
  const nervousConfig = config.nervous_system as NervousSystemConfig | undefined;
  if (!nervousConfig?.enabled) {
    return null;
  }

  const detectorConfig = (nervousConfig as { detectors?: unknown }).detectors;
  const observer = new NervousObserver(
    projectRoot,
    15_000,
    detectorConfig as never,
    sprintStateProvider,
  );
  const decisionEngine = new DecisionEngine(nervousConfig);
  const proposer = new Proposer(nervousConfig);
  const dispatcher = new NervousDispatcher(nervousConfig, projectRoot);
  const history = new NervousHistory(projectRoot);
  const pendingStore = deps.pendingStore ?? makeFilePendingStore(projectRoot);
  const executor = new Executor(history, actionHandler, pendingStore);

  // APPROVE-005 (§4G): poll the MCP IPC queue so `deckent_nervous_accept/reject`
  // (which write approval files) resolve the running executor's pending map —
  // previously startPolling had zero production callers, so MCP decisions were
  // silently discarded.
  const ipcQueue = deps.ipcQueue ?? new NervousIpcQueue(projectRoot);
  const pollHandle = ipcQueue.startPolling((req) => {
    executor.resolveApproval(req.notificationId, req.decision);
  });

  // APPROVE-007 (§4G): heartbeat so a separate `deckent nervous accept` process
  // can detect a live executor and route approvals through the IPC queue (vs
  // dismiss-only fallback). Cleared on dispose so liveness is accurate.
  writeNervousHeartbeat(projectRoot);
  const heartbeatTimer = setInterval(() => writeNervousHeartbeat(projectRoot), 2000);
  if (typeof heartbeatTimer.unref === 'function') heartbeatTimer.unref();

  observer.on('detection', (result: DetectorResult, event: ObserverEvent) => {
    void runPipeline(result, event, decisionEngine, proposer, dispatcher, executor);
  });

  observer.start();

  let disposed = false;
  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    try {
      observer.stop();
    } catch (err) {
      console.error('[NervousBootstrap] observer.stop() failed:', err);
    }
    try {
      executor.shutdown();
    } catch (err) {
      console.error('[NervousBootstrap] executor.shutdown() failed:', err);
    }
    try {
      pollHandle.dispose();
    } catch (err) {
      console.error('[NervousBootstrap] ipc poll dispose() failed:', err);
    }
    try {
      clearInterval(heartbeatTimer);
      clearNervousHeartbeat(projectRoot);
    } catch (err) {
      console.error('[NervousBootstrap] heartbeat cleanup failed:', err);
    }
  };

  return { observer, dispose };
}

async function runPipeline(
  result: DetectorResult,
  event: ObserverEvent,
  decisionEngine: DecisionEngine,
  proposer: Proposer,
  dispatcher: NervousDispatcher,
  executor: Executor,
): Promise<void> {
  try {
    const decisions = decisionEngine.decide(result);
    if (decisions.length === 0) return;

    const metadata = (result as { metadata?: Record<string, unknown> }).metadata ?? {};
    const detectorId = String(metadata.detectorId ?? 'unknown');
    const title = String(metadata.title ?? detectorId);
    const message = String(metadata.message ?? `Detected: ${detectorId}`);

    const notification = proposer.propose(result, decisions, {
      detectorId,
      sprintId: event.sprintId,
      taskId: event.taskId,
      title,
      message,
    } as never);
    if (!notification) return;

    await Promise.allSettled([
      dispatcher.dispatch(notification),
      executor.handle(notification),
    ]);
  } catch (err) {
    console.error('[NervousBootstrap] pipeline failed:', err);
  }
}
