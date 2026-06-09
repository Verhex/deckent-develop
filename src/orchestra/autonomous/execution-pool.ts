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

/** Reset any `running` entry (interrupted by a crash) back to `pending`. */
export function recoverBacklog(path: string): void {
  const bl = loadBacklog(path);
  let changed = false;
  for (const e of bl.entries) {
    if (e.status === 'running') { e.status = 'pending'; changed = true; }
  }
  if (changed) atomicWriteFileSync(path, JSON.stringify(bl, null, 2));
}
