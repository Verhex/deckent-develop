/**
 * CatalogRegistry — the internal model catalog SSOT (Spec Pillar 4).
 *
 * Sources (`ModelCatalogSource`) are registered with a precedence tier, fetched at
 * **sync-time** (the only time any network happens — and only for sources that use
 * it), and merged into one in-memory map keyed by `providerId::modelId`. The runtime
 * hot path reads only `get()` / `getAll()` — a pure map read, **never the network**.
 *
 * Precedence mirrors the `config.ts` 3-layer merge (base → higher layer, last write
 * wins): entries from higher-precedence sources overwrite lower ones for the same
 * model. The tier order is:
 *
 *     custom  >  local-override  >  enrichment  >  builtin-default
 *
 *   - `builtin-default` — the offline baseline (`LocalStaticSource`).
 *   - `enrichment`      — optional online catalogs (models.dev / OpenRouter).
 *   - `local-override`  — operator's local tweaks layered over enrichment.
 *   - `custom`          — enterprise private registry; the final word.
 *
 * Graceful by contract: a source whose `fetch()` rejects is logged and skipped — it
 * never aborts the sync, so one bad/unreachable source cannot wipe the catalog.
 *
 * Sprint 330 Task 330-013 (Spec Pillar 4 — F1-PCACHE).
 */

import type { ModelCatalogSource } from './catalog-source.js';
import type { CatalogEntry } from './types.js';

/** Precedence tier for a registered source (low → high authority). */
export type CatalogPrecedence = 'builtin-default' | 'enrichment' | 'local-override' | 'custom';

/** Numeric rank for each tier — higher overwrites lower during merge. */
const PRECEDENCE_RANK: Readonly<Record<CatalogPrecedence, number>> = {
  'builtin-default': 0,
  enrichment: 1,
  'local-override': 2,
  custom: 3,
};

interface RegisteredSource {
  source: ModelCatalogSource;
  precedence: CatalogPrecedence;
  /** Registration order, for a stable tie-break within the same precedence tier. */
  order: number;
}

/** Compose the canonical map key for a (provider, model) pair. */
function entryKey(providerId: string, modelId: string): string {
  return `${providerId}::${modelId}`;
}

export class CatalogRegistry {
  private readonly sources: RegisteredSource[] = [];
  private readonly entries = new Map<string, CatalogEntry>();
  private registrationCounter = 0;

  /**
   * Register a source at a precedence tier (default `builtin-default`).
   * Registration is order-stable: within one tier, a later registration wins ties.
   * Call `sync()` afterwards to (re)build the merged catalog.
   */
  register(source: ModelCatalogSource, precedence: CatalogPrecedence = 'builtin-default'): void {
    this.sources.push({ source, precedence, order: this.registrationCounter++ });
  }

  /**
   * Fetch every registered source and rebuild the merged catalog by precedence.
   *
   * Sources are processed low→high precedence (then registration order), so higher
   * tiers overwrite lower ones for the same `providerId::modelId`. A source that
   * throws is logged and skipped — the rest still merge.
   */
  async sync(): Promise<void> {
    const ordered = [...this.sources].sort(
      (a, b) => PRECEDENCE_RANK[a.precedence] - PRECEDENCE_RANK[b.precedence] || a.order - b.order,
    );

    const merged = new Map<string, CatalogEntry>();
    for (const { source, precedence } of ordered) {
      let fetched: CatalogEntry[];
      try {
        fetched = await source.fetch();
      } catch (err) {
        console.warn(
          `[catalog] source "${source.id}" (${precedence}) failed to fetch: ` +
            `${err instanceof Error ? err.message : String(err)}; skipping.`,
        );
        continue;
      }
      for (const entry of fetched) {
        merged.set(entryKey(entry.providerId, entry.modelId), entry);
      }
    }

    // Swap in the freshly merged set (full rebuild — sync is idempotent).
    this.entries.clear();
    for (const [key, entry] of merged) {
      this.entries.set(key, entry);
    }
  }

  /**
   * Look up a single model. Pure in-memory read — never performs I/O or network.
   * Returns `undefined` for an unknown provider/model (no crash).
   */
  get(providerId: string, modelId: string): CatalogEntry | undefined {
    return this.entries.get(entryKey(providerId, modelId));
  }

  /** All merged entries, in insertion order. Pure in-memory read. */
  getAll(): CatalogEntry[] {
    return [...this.entries.values()];
  }

  /** Number of models in the merged catalog. */
  get size(): number {
    return this.entries.size;
  }
}
