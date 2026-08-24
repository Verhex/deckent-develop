import { existsSync } from 'node:fs';
import { join } from 'node:path';

import {
  projectProviderConcurrencyRuntime,
  type ProviderConcurrencyRuntimeProjection,
} from './provider-limit-admission.js';
import {
  PROVIDER_EXECUTION_OBSERVATION_DATABASE_PATH,
  ProviderExecutionObservationStore,
} from './provider-execution-observation-store.js';

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
  const dbPath = join(projectRoot, PROVIDER_EXECUTION_OBSERVATION_DATABASE_PATH);
  if (!existsSync(dbPath)) return [];

  const store = new ProviderExecutionObservationStore(projectRoot, {
    dbPath,
    readOnly: true,
  });
  try {
    return Object.freeze(store.listProviderPrincipalDigests().map(providerPrincipalDigest => {
      const allIntervals = store.listIntervals(providerPrincipalDigest);
      // Retirement is an explicit terminal settlement for an observation whose
      // provider end event can no longer arrive. The row remains immutable
      // forensic history, but it is no longer an active capacity observation.
      // Including it here would make reconciliation durable in the store while
      // every status surface continued to report the pre-reconciliation count.
      const activeIntervals = allIntervals.filter(interval => !interval.retired);
      const isCurrent = (interval: typeof allIntervals[number]): boolean => {
        if (options.currentTaskIds === undefined) return true;
        if (!options.currentTaskIds.has(interval.taskId)) return false;
        const exactAttempts = options.currentAttemptIdsByTaskId?.get(interval.taskId);
        return exactAttempts === undefined ? true : exactAttempts.has(interval.attemptId);
      };
      const intervals = activeIntervals.filter(isCurrent);
      const unresolvedOpenIntervals = options.currentTaskIds === undefined
        ? 0
        : activeIntervals.filter(interval => interval.end === null && !isCurrent(interval)).length;
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
