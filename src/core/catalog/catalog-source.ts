import type { CatalogEntry } from './types.js';

// ─── Model Catalog Source Port ────────────────────────────────────────────────

/**
 * Pluggable source that knows how to retrieve a list of normalized CatalogEntries
 * for one or more providers. Implementations may fetch from a live API, a local
 * JSON file, a database, or a static registry — the port contract is the same.
 * No I/O is performed by this module itself.
 */
export interface ModelCatalogSource {
  /** Unique identifier for this source (e.g. "anthropic-api", "openai-static"). */
  id: string;
  /** Fetch all catalog entries available from this source. */
  fetch(): Promise<CatalogEntry[]>;
}

// ─── Provider ID Normalization ────────────────────────────────────────────────

/**
 * Maps informal/alias provider names to their canonical provider IDs.
 * Canonical IDs are used as CatalogEntry.providerId throughout the system.
 *
 * Aliases covered:
 *   kimi       → moonshotai   (Moonshot AI's consumer brand)
 *   qwen       → alibaba      (Alibaba Cloud's Qwen model family)
 *   grok       → xai          (xAI's Grok models)
 *   together   → togetherai   (Together AI platform)
 *   fireworks  → fireworks-ai (Fireworks AI platform)
 */
export const PROVIDER_ID_ALIASES: Readonly<Record<string, string>> = {
  kimi: 'moonshotai',
  qwen: 'alibaba',
  grok: 'xai',
  together: 'togetherai',
  fireworks: 'fireworks-ai',
} as const;

/**
 * Returns the canonical provider ID for a raw/alias input.
 * Falls back to the raw value unchanged when no alias is registered.
 */
export function normalizeProviderId(raw: string): string {
  return PROVIDER_ID_ALIASES[raw] ?? raw;
}
