// src/nervous/runtime-scope-check.ts
//
// KRİTİK: Nervous system dispatcher/observer sadece Brain PID'de çalışabilir.
// Worker process'ten init girişimi ADR-037 RBAC ihlali sayılır.
//
// Sprint 148 Task 7 — Ana PID Notification Scope Enforcement.

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
 * Best-effort violation event emission.
 * Uses dynamic import to avoid hard coupling — if event-bus is unavailable,
 * falls back to stderr.
 */
function emitViolationEvent(component: string): void {
  try {
    // Synchronous import attempt via require-like pattern won't work in ESM.
    // Use a try/catch around the event-bus module — if already loaded, it's cached.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { eventBus } = require('../orchestra/event-bus.js') as { eventBus: { emit: (event: string, data: unknown) => void } };
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
