// ─── Catalog Render (TERM-CAT, Sprint 357, Task 357-002) ────────────────────
//
// Pure render mechanism for a category-grouped, trust-badged tool/action
// catalog. String-free: every visible glyph/word comes from the injected
// `labels` parameter — this module owns layout, grouping, and ANSI color
// selection only (color codes are control sequences, not language content).
// Decoupled from the catalog data-model task (357-001, src/core/tool-catalog.ts)
// by design: CatalogRenderEntry is a structural type, not an import, so this
// mechanism is independently fixture-testable. Wiring a real catalog + i18n
// labels into a `/help` command is an explicit follow-up, not part of this
// module (no command/app.tsx changes here).

import { isNoColor } from './output.js';

// ─── Types ───────────────────────────────────────────────────────────────

/** Trust classification tiers (mirrors the 357-001 tool-catalog data-model). */
export type TrustTier = 'Core' | 'Project' | 'MCP' | 'Enterprise' | 'Danger';

/** Risk classification for a single catalog entry. */
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

/** One row of the catalog. Structural shape only — not imported from core/tool-catalog.ts. */
export interface CatalogRenderEntry {
  id: string;
  category: string;
  labelKey: string;
  trustTier: TrustTier;
  riskLevel: RiskLevel;
}

/**
 * All display text for renderCatalog. String-free mechanism: the caller
 * injects every visible glyph/word (English default lives at the call site,
 * e.g. wrapping getMessage()) — this module holds no literal text.
 */
export interface CatalogRenderLabels {
  /** category key -> display heading. */
  categoryName: (category: string) => string;
  /** entry labelKey -> display name. */
  entryName: (labelKey: string) => string;
  /** trust tier -> single-glyph badge (lucide-like char, never an emoji). */
  tierBadge: Record<TrustTier, string>;
  /** risk level -> marker glyph; '' suppresses the marker for that level. */
  riskMarker: Record<RiskLevel, string>;
  /** shown verbatim when entries is empty. */
  emptyState: string;
}

export interface CatalogRenderOptions {
  /** Force ANSI color on/off. Omitted = auto-detect via isNoColor() (NO_COLOR env / --no-color argv). */
  noColor?: boolean;
}

// ─── Tier / risk -> ANSI color (mechanism-owned; not localizable text) ────

const TIER_ANSI: Record<TrustTier, string> = {
  Core: '\x1b[32m',
  Project: '\x1b[36m',
  MCP: '\x1b[34m',
  Enterprise: '\x1b[35m',
  Danger: '\x1b[1;31m',
};

const RISK_ANSI: Record<RiskLevel, string> = {
  low: '',
  medium: '',
  high: '\x1b[33m',
  critical: '\x1b[1;31m',
};

// ─── Render ────────────────────────────────────────────────────────────────

/**
 * Render a category-grouped catalog listing with trust badges and risk
 * markers. Deterministic: categories are grouped in first-appearance order
 * of `entries`, entries preserve their input order within each group.
 */
export function renderCatalog(
  entries: readonly CatalogRenderEntry[],
  labels: CatalogRenderLabels,
  options: CatalogRenderOptions = {},
): string {
  if (entries.length === 0) return labels.emptyState;

  const suppressColor = options.noColor ?? isNoColor();
  const paint = (code: string, text: string): string =>
    suppressColor || code === '' ? text : `${code}${text}\x1b[0m`;

  const categoryOrder: string[] = [];
  const groups = new Map<string, CatalogRenderEntry[]>();
  for (const entry of entries) {
    let group = groups.get(entry.category);
    if (!group) {
      group = [];
      groups.set(entry.category, group);
      categoryOrder.push(entry.category);
    }
    group.push(entry);
  }

  const lines: string[] = [];
  for (const category of categoryOrder) {
    if (lines.length > 0) lines.push('');
    lines.push(labels.categoryName(category));

    for (const entry of groups.get(category) ?? []) {
      const badge = paint(TIER_ANSI[entry.trustTier], labels.tierBadge[entry.trustTier]);
      const marker = labels.riskMarker[entry.riskLevel];
      const markerSuffix = marker ? ` ${paint(RISK_ANSI[entry.riskLevel], marker)}` : '';
      lines.push(`  ${badge} ${labels.entryName(entry.labelKey)}${markerSuffix}`);
    }
  }

  return lines.join('\n');
}
