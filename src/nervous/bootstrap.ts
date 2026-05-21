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

import { NervousObserver } from './observer.js';
import { DecisionEngine } from './decision-engine.js';
import { Proposer } from './proposer.js';
import { NervousDispatcher } from './dispatcher.js';
import { Executor } from './executor.js';
import { NervousHistory } from './history.js';
import type { ActionHandler } from './executor.js';
import type {
  DetectorResult,
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
  const executor = new Executor(history, actionHandler);

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
