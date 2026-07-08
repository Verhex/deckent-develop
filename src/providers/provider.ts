// ─── Cross-provider credential SCRUB helper — DEPRECATED COMPAT SHIM ─────────
/**
 * DEPRECATED compatibility shim (born-518-REDO, task 382-002).
 *
 * The real implementation of `scrubCrossProviderEnv`/`buildProviderChildEnv`
 * has moved to `../core/provider.ts`, alongside `applyDeckSecretsToEnv` — the
 * actual cross-provider credential leak site (audit §4.4, P0-SEC). Sprint-1
 * (born-518) had created this file as a standalone helper module instead of
 * fixing the leak at its source; this task moves the logic to where it
 * belongs and leaves this file as a pure re-export.
 *
 * This shim exists ONLY because two files outside this task's write scope
 * still import from this path:
 *   - `providers/subprocess.ts` (`import { scrubCrossProviderEnv } from './provider.js'`)
 *   - `tests/providers/cred-scrub-all-adapters.test.ts`
 *     (`import { scrubCrossProviderEnv, buildProviderChildEnv } from '../../src/providers/provider.js'`)
 *
 * A follow-up task with those two files added to its write scope should
 * repoint both imports at `../core/provider.js` directly, after which this
 * file can be deleted entirely.
 */
export {
  scrubCrossProviderEnv,
  buildProviderChildEnv,
} from '../core/provider.js';
