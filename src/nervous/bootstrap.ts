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
import { NERVOUS_PENDING_FILE } from '../core/constants.js';
import { getCurrentSprintId, writeEvent, CHANNELS } from '../core/event-stream.js';
import { NervousObserver } from './observer.js';
import { DecisionEngine } from './decision-engine.js';
import { Proposer } from './proposer.js';
import { NervousDispatcher } from './dispatcher.js';
import { Executor, APPROVE_TIMEOUT_MS } from './executor.js';
import type { CanAutoApplyFn } from './executor.js';
import { NervousHistory } from './history.js';
import { StaleWorkerDetector } from './detectors/stale-worker.js';
import { DirectivesMidSprintProtection } from './detectors/directives-protection.js';
import {
  NervousIpcQueue,
  writeNervousHeartbeat,
  clearNervousHeartbeat,
} from './ipc-queue.js';
import { createActionHandler } from './action-handlers.js';
import { requestWorkerRespawn } from './respawn-request.js';
import type { ActionHandler, PendingApprovalStore } from './executor.js';
import type {
  DetectorResult,
  NervousNotification,
  NervousSystemConfigV1,
  ObserverEvent,
  SprintStateSnapshot,
} from '../core/nervous-types.js';

import type { DeckentConfig } from '../core/types.js';

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
  /** N1 fix: run detectors in ANY sprint phase (not only EXECUTE). Set true by
   *  the autonomous bootstrap — there is no hosted sprint there, so the
   *  EXECUTE-only guard would otherwise keep every built-in detector inert. */
  observerActiveInAnyPhase?: boolean;
}

/**
 * File-backed PendingApprovalStore (APPROVE-004, §4G). Persists parked approvals
 * as the same `NervousNotification[]` shape that `deckent nervous` and the REPL
 * `/nervous` bridge read from `.deckent/nervous/nervous-pending.json`, so executor-parked
 * approvals become visible to the operator instead of an always-empty queue.
 */
export function makeFilePendingStore(projectRoot: string): PendingApprovalStore {
  const path = join(projectRoot, NERVOUS_PENDING_FILE);
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
 * W3 (cross-surface live-tail): tee a NERVOUS_NOTIFICATION event onto the active
 * sprint's event stream when an approval parks, so `deckent_watch` (MCP) +
 * `deckent status --follow` surface the ask live with the EXACT accept command.
 *
 * Fail-safe: no active sprint (getCurrentSprintId → null) or a write failure →
 * no-op. The durable `.deckent/nervous-pending.json` (written by the base store)
 * remains the snapshot source for plain `deckent status` (W4); this event is the
 * additive live signal only. Payload shape mirrors core/pending-approvals
 * PendingApproval so every surface derives the same "run this command".
 */
export function emitNervousApprovalPending(
  projectRoot: string,
  notification: NervousNotification,
): void {
  try {
    const sprintId = getCurrentSprintId(projectRoot);
    if (!sprintId) return;
    // Surface the short code (proposer-minted) so every operator surface
    // (deckent status --follow / deckent_watch) shows a copy-pasteable command
    // instead of a UUID; the CLI resolver matches shortCode just like the id.
    const code = notification.shortCode ?? notification.id;
    writeEvent(projectRoot, sprintId, 'deckent', 'user', CHANNELS.NERVOUS_NOTIFICATION, {
      kind: 'nervous',
      id: notification.id,
      shortCode: notification.shortCode,
      title: notification.title,
      acceptCommand: `deckent nervous accept ${code}`,
      rejectCommand: `deckent nervous reject ${code}`,
    });
  } catch {
    // Never break the nervous pipeline on a live-tail emit failure.
  }
}

/**
 * Decorate a PendingApprovalStore so every park (`add`) also tees a live
 * NERVOUS_NOTIFICATION event (W3). The base store keeps writing the durable
 * snapshot (`deckent status` / REPL `/nervous`); `remove` is pure forwarding —
 * only the park emits a live signal. Exported for direct unit testing.
 */
export function wrapPendingStoreWithEmit(
  base: PendingApprovalStore,
  projectRoot: string,
): PendingApprovalStore {
  return {
    add(notification: NervousNotification): void {
      base.add(notification);
      emitNervousApprovalPending(projectRoot, notification);
    },
    remove(notificationId: string): void {
      base.remove(notificationId);
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
 * @param actionHandler  Opsiyonel — default GERÇEK handler (`createActionHandler`,
 *                       projectRoot-bağlı; NERV-W1 Sprint 281: önceki stub-default
 *                       her aksiyonu "not yet wired" failure'a düşürüyordu).
 *                       Testler kendi stub'larını inject edebilir.
 * @returns enabled ise handle, değilse null
 */
export function createNervousSystemIfEnabled(
  config: DeckentConfig,
  projectRoot: string,
  sprintStateProvider: () => SprintStateSnapshot,
  actionHandler: ActionHandler = createActionHandler({
    projectRoot,
    // N3: opt-in cooperative respawn — WORKER_RESPAWN writes a durable request the
    // sprint-controller drains (single-owner, no race). Off → propose (default).
    ...(((config.nervous_system as NervousSystemConfigV1 | undefined)?.worker_respawn)
      ? { requestRespawn: requestWorkerRespawn }
      : {}),
  }),
  deps: NervousBootstrapDeps = {},
): NervousSystemHandle | null {
  const nervousConfig = config.nervous_system as NervousSystemConfigV1 | undefined;
  if (!nervousConfig?.enabled) {
    return null;
  }

  const detectorConfig = (nervousConfig as { detectors?: unknown }).detectors;
  const observer = new NervousObserver(
    projectRoot,
    15_000,
    detectorConfig as never,
    sprintStateProvider,
    1, // idleThrottleMultiplier (unwired here — preserves current default)
    deps.observerActiveInAnyPhase ?? false, // N1: detectors fire in any phase (autonomous)
  );
  const decisionEngine = new DecisionEngine(nervousConfig);
  const proposer = new Proposer(nervousConfig);
  const dispatcher = new NervousDispatcher(nervousConfig, projectRoot);
  const history = new NervousHistory(projectRoot);
  // W3: wrap the durable store so every park tees a live NERVOUS_NOTIFICATION
  // event (deckent_watch / status --follow) without touching the executor.
  const baseStore = deps.pendingStore ?? makeFilePendingStore(projectRoot);
  const pendingStore = wrapPendingStoreWithEmit(baseStore, projectRoot);
  // make-usable #3: thread the configurable approve auto-proceed timeout (0 or
  // negative → never auto-proceed; the cautious-user trust setting).
  const approveTimeoutMs = nervousConfig.approve_timeout_ms ?? APPROVE_TIMEOUT_MS;
  // NERV-W1b: predicate map — canAutoApply per action-id (executor line ~416 consumes this)
  const staleDetector = new StaleWorkerDetector();
  const directivesDetector = new DirectivesMidSprintProtection();
  const canAutoApplyMap = new Map<string, CanAutoApplyFn>([
    ['WORKER_RESPAWN', (p) => staleDetector.canAutoApply(p)],
    ['DIRECTIVES_WRITE', (p) => directivesDetector.canAutoApply(p)],
  ]);
  const executor = new Executor(history, actionHandler, pendingStore, projectRoot, approveTimeoutMs, canAutoApplyMap);

  // APPROVE-005 (§4G): poll the MCP IPC queue so `deckent_nervous_accept/reject`
  // (which write approval files) resolve the running executor's pending map —
  // previously startPolling had zero production callers, so MCP decisions were
  // silently discarded.
  const ipcQueue = deps.ipcQueue ?? new NervousIpcQueue(projectRoot);
  const pollHandle = ipcQueue.startPolling((req) => {
    // Sprint 280 APPROVE-007b live-path glue: forward the optional modifiedPayload
    // so a `/nervous edit <id> ...` (chat-nervous-bridge → writeApproval) actually
    // reaches the executor's payload-merge on accept. Without this the edited
    // payload was carried through the IPC file but dropped here at the poller —
    // the transport (003) + REPL surface (008) were built but not end-to-end live.
    const consumed = executor.resolveApproval(req.notificationId, req.decision, { modifiedPayload: req.modifiedPayload });
    // FIX-1 (B-COLLISION-HANG cross-source approval): Brain-ack. When an approval
    // from ANY surface (bot/CLI/MCP) is actually consumed, record it in the event
    // flow (jsonl) so it is provable the decision was received + applied — and so
    // the ask is not re-surfaced. Skipped when nothing matched (stale/duplicate
    // IPC file) so we never emit a false ack. Best-effort: never block consumption.
    if (consumed) {
      try {
        writeEvent(
          projectRoot,
          getCurrentSprintId(projectRoot) ?? 'no-sprint',
          'deckent', 'user',
          CHANNELS.NERVOUS_APPROVAL_CONSUMED,
          { notificationId: req.notificationId, decision: req.decision },
        );
      } catch { /* ack is observability only */ }
    }
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

export async function runPipeline(
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

    // bug 2 (Sprint 290): title/message/detectorId are first-class on
    // DetectorResult now — read them directly. The registry stamps detectorId;
    // the `?? 'detector'` only fires if that stamp is bypassed, never 'unknown'.
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
    console.error('[NervousBootstrap] pipeline failed:', err);
  }
}
