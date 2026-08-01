import { existsSync } from 'node:fs';
import { join } from 'node:path';

import {
  projectProviderConcurrencyRuntime,
  type ProviderConcurrencyRuntimeProjection,
} from './provider-limit-admission.js';
import { ProviderExecutionObservationStore } from './provider-execution-observation-store.js';

/**
 * Read the attained provider concurrency surface without creating authority.
 *
 * Admission capacity is intentionally unknown here: the execution-observation
 * store proves starts/ends, not provider capacity. A future capacity authority
 * may join exact capability evidence; until then status exposes attained truth
 * as HOLD/unknown rather than inventing a zero or a configured ceiling.
 */
export function readProviderConcurrencyRuntime(
  projectRoot: string,
  options: {
    /** Exact task identities belonging to the current persisted run revision. */
    readonly currentTaskIds?: ReadonlySet<string>;
    /** Exact host-owned execution attempts currently in dispatched state. */
    readonly currentAttemptIdsByTaskId?: ReadonlyMap<string, ReadonlySet<string>>;
  } = {},
): readonly ProviderConcurrencyRuntimeProjection[] {
  const dbPath = join(projectRoot, '.deckent', 'provider-execution-observations.db');
  if (!existsSync(dbPath)) return [];

  const store = new ProviderExecutionObservationStore(projectRoot, {
    dbPath,
    readOnly: true,
  });
  try {
    return Object.freeze(store.listProviderPrincipalDigests().map(providerPrincipalDigest => {
      const allIntervals = store.listIntervals(providerPrincipalDigest);
      const isCurrent = (interval: typeof allIntervals[number]): boolean => {
        if (options.currentTaskIds === undefined) return true;
        if (!options.currentTaskIds.has(interval.taskId)) return false;
        const exactAttempts = options.currentAttemptIdsByTaskId?.get(interval.taskId);
        return exactAttempts === undefined ? true : exactAttempts.has(interval.attemptId);
      };
      const intervals = allIntervals.filter(isCurrent);
      const unresolvedOpenIntervals = options.currentTaskIds === undefined
        ? 0
        : allIntervals.filter(interval => interval.end === null && !isCurrent(interval)).length;
      return projectProviderConcurrencyRuntime({
        providerPrincipalDigest,
        capability: null,
        intervals,
        unresolvedOpenIntervals,
        observationScope: options.currentTaskIds === undefined
          ? 'all-observed'
          : 'exact-task-set',
      });
    }));
  } finally {
    store.close();
  }
}
