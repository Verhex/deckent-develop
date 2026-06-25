// src/nervous/runtime-scope-check.ts
//
// KRİTİK: Nervous system dispatcher/observer sadece Brain PID'de çalışabilir.
// Worker process'ten init girişimi ADR-037 RBAC ihlali sayılır.
//
// Sprint 148 Task 7 — Ana PID Notification Scope Enforcement.

import { eventBus } from '../orchestra/event-bus.js';

/**
 * Assert that the current process is running in Brain scope (not a worker).
 * Throws NervousScopeViolationError if called inside a worker process
 * (detected via DECKENT_WORKER_MODE=1 env var).
 *
 * ADR-037 RBAC: nervous system is Brain-scoped.
 * Workers emit events via event-stream.ts; Brain observes and dispatches.
 */
export function assertBrainScope(component: string): void {
  if (process.env.DECKENT_WORKER_MODE === '1') {
    const error = new Error(
      `NERVOUS_SCOPE_VIOLATION: ${component} cannot run in worker process. ` +
      `ADR-037 RBAC: nervous system is Brain-scoped. ` +
      `Workers emit events via event-stream.ts; Brain observes and dispatches.`,
    );
    error.name = 'NervousScopeViolationError';

    // Best-effort event emit (stderr fallback if event bus not available)
    emitViolationEvent(component);

    throw error;
  }
}

/**
 * Best-effort violation event emission on the `deckent-event` channel.
 *
 * Emits through the statically-imported `eventBus` singleton — ESM-correct and
 * synchronous, so the event reaches the bus BEFORE `assertBrainScope` throws.
 * The previous implementation used a bare CommonJS `require()`, which is
 * `undefined` under ESM (Node16 resolution): it threw on every call and always
 * fell through to the stderr branch, so the real `NERVOUS_SCOPE_VIOLATION` event
 * never reached the bus (323-024). A genuinely-unexpected emit failure still
 * degrades to stderr — honest-fail, never silent (the import graph is acyclic:
 * orchestra/event-bus.ts pulls only core/ leaves + a type-only event-stream
 * edge, so there is no nervous ↔ orchestra cycle).
 */
function emitViolationEvent(component: string): void {
  try {
    eventBus.emit('deckent-event', {
      type: 'NERVOUS_SCOPE_VIOLATION',
      component,
      pid: process.pid,
      timestamp: new Date().toISOString(),
    });
  } catch {
    process.stderr.write(
      `\u26A0 NERVOUS_SCOPE_VIOLATION: ${component} cannot run in worker process. ` +
      `ADR-037 RBAC: nervous system is Brain-scoped.\n`,
    );
  }
}
