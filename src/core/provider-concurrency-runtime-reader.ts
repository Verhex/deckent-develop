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
): readonly ProviderConcurrencyRuntimeProjection[] {
  const dbPath = join(projectRoot, '.deckent', 'provider-execution-observations.db');
  if (!existsSync(dbPath)) return [];

  const store = new ProviderExecutionObservationStore(projectRoot, {
    dbPath,
    readOnly: true,
  });
  try {
    return Object.freeze(store.listProviderPrincipalDigests().map(providerPrincipalDigest => (
      projectProviderConcurrencyRuntime({
        providerPrincipalDigest,
        capability: null,
        intervals: store.listIntervals(providerPrincipalDigest),
      })
    )));
  } finally {
    store.close();
  }
}
