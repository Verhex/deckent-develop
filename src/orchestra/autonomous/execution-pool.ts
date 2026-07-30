// src/orchestra/autonomous/execution-pool.ts
// Concurrency-abstraction for autonomous execution. Pass-1 = serial (size 1).
// A concurrent pool (bounded worker count) implements the same interface later
// without touching the loop — spec §7 enterprise interface requirement.
import { loadBacklog } from './backlog.js';
import { atomicWriteFileSync } from '../../agents/worker-lifecycle.js';

export interface ExecutionPool {
  submit<T>(job: () => Promise<T>): Promise<T>;
}

/** Serial pool: one job at a time, FIFO. Errors propagate to the submitter. */
export function makeSerialPool(): ExecutionPool {
  let tail: Promise<unknown> = Promise.resolve();
  return {
    submit<T>(job: () => Promise<T>): Promise<T> {
      const run = tail.then(job, job); // run after prior settles (success or fail)
      tail = run.catch(() => undefined);
      return run as Promise<T>;
    },
  };
}

/**
 * Bounded pool: up to `maxConcurrency` jobs run in parallel; excess jobs queue and run
 * as slots free up. Errors propagate to the individual submitter without blocking others.
 */
export function makeBoundedPool(maxConcurrency: number): ExecutionPool {
  let inFlight = 0;
  const queue: Array<() => void> = [];

  function dequeue(): void {
    if (queue.length > 0 && inFlight < maxConcurrency) {
      inFlight++;
      queue.shift()!();
    }
  }

  return {
    submit<T>(job: () => Promise<T>): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        function run(): void {
          job().then(
            (v) => { inFlight--; dequeue(); resolve(v); },
            (e: unknown) => { inFlight--; dequeue(); reject(e); },
          );
        }
        if (inFlight < maxConcurrency) {
          inFlight++;
          run();
        } else {
          queue.push(run);
        }
      });
    },
  };
}

/**
 * Fail-closed boot recovery for legacy autonomous entries.
 *
 * A `running` JSON flag does not prove that its external worker is dead. Blind
 * `running → pending` can duplicate API/ERP/file side effects when the original
 * attempt is still alive. Until an entry carries exact attempt authority, park
 * it with typed HOLD evidence. Healthy/non-running entries are untouched and
 * no recovery scan enters the execution-pool hot path.
 */
export function recoverBacklog(path: string): void {
  const bl = loadBacklog(path);
  let changed = false;
  for (const e of bl.entries) {
    if (e.status !== 'running') continue;
    e.status = 'parked';
    e.lastResult = {
      ok: false,
      reason: 'RECOVERY_HOLD_ATTEMPT_AUTHORITY_UNAVAILABLE',
      recoveryHold: {
        schemaVersion: 1,
        reasonCode: 'attempt-authority-unavailable',
        heldAt: new Date().toISOString(),
      },
    };
    changed = true;
  }
  if (changed) atomicWriteFileSync(path, JSON.stringify(bl, null, 2));
}
