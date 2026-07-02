// ═══ Tool Catalog — TOOL-CAT (trust-tier data model over tool-registry) ════
// A trust-tier layer laid ON TOP OF tool-registry (TOOL-1) entries: given a
// tool's *source* (who defined it) and *risk* (how much caution it
// warrants), deterministically classifies it into one of 5 UX-facing trust
// tiers — Core | Project | MCP | Enterprise | Danger. TERM-CAT (DIRECTIVES
// row 46) renders this catalog as a trust badge; this module is the pure
// data model + classification logic only, never the renderer.
//
// ADR-D-004 (Layer-1 Import Direction) C1: core/ MUST NOT import orchestra/,
// cli/, api/, or mcp/. This module only imports from ./tool-registry.js
// (core -> core), so it introduces no new Layer-1 edge. tool-registry.ts
// itself is read-only consumed here and never modified: this task's write
// scope is this file + its test file only.
//
// tool-registry.ts's `ToolRiskLevel` is a 3-level scale (safe/moderate/
// destructive) tied to MCP-style annotations. The trust-tier classifier
// below needs a 4th, catalog-only governance tier ('critical') to express
// "always clamp to Danger regardless of source" — since tool-registry.ts
// cannot be edited to add it, `ToolCatalogRiskLevel` extends (never
// mutates) the base scale at this layer instead.
//
// Like TOOL-1/TOOL-2, this is a pure catalog: no call/dispatch/execute/
// invoke capability exists here, and no caching/TTL/enable-disable policy
// (that is TOOL-REG's explicit separate scope, DIRECTIVES row 24).

import { z } from 'zod';
import { TOOL_RISK_LEVELS, type ToolDefinition } from './tool-registry.js';

// ─── Trust Tier ─────────────────────────────────────────────────────────────

export const TOOL_TRUST_TIERS = ['Core', 'Project', 'MCP', 'Enterprise', 'Danger'] as const;
export const ToolTrustTierSchema = z.enum(TOOL_TRUST_TIERS);
/** UX-facing trust classification of a catalog entry. */
export type ToolTrustTier = z.infer<typeof ToolTrustTierSchema>;

// ─── Catalog Risk Scale ─────────────────────────────────────────────────────

export const TOOL_CATALOG_RISK_LEVELS = [...TOOL_RISK_LEVELS, 'critical'] as const;
export const ToolCatalogRiskLevelSchema = z.enum(TOOL_CATALOG_RISK_LEVELS);
/** tool-registry's 3-level ToolRiskLevel, extended with a catalog-only 'critical' governance tier. */
export type ToolCatalogRiskLevel = z.infer<typeof ToolCatalogRiskLevelSchema>;

// ─── Source ─────────────────────────────────────────────────────────────────

export const TOOL_CATALOG_SOURCES = ['builtin', 'project', 'mcp', 'enterprise'] as const;
export const ToolCatalogSourceSchema = z.enum(TOOL_CATALOG_SOURCES);
/** Who defined the tool: first-party builtin, this project, an MCP server, or an enterprise/org seed. */
export type ToolCatalogSource = z.infer<typeof ToolCatalogSourceSchema>;

// ─── Classification ─────────────────────────────────────────────────────────

export interface ToolTrustClassificationInput {
  source: ToolCatalogSource;
  riskLevel: ToolCatalogRiskLevel;
}

/** Direct source -> tier mapping for every non-Danger tier (Danger is risk-driven, never a direct source). */
const SOURCE_TRUST_TIER: Record<ToolCatalogSource, ToolTrustTier> = {
  builtin: 'Core',
  project: 'Project',
  mcp: 'MCP',
  enterprise: 'Enterprise',
};

/**
 * Deterministic source+risk -> trust-tier classifier.
 * `riskLevel === 'critical'` always clamps to 'Danger', overriding source —
 * a critical-risk tool is never rendered as anything but maximally
 * cautioned, regardless of who defined it. Otherwise the tier follows the
 * entry's source 1:1 (builtin -> Core, project -> Project, mcp -> MCP,
 * enterprise -> Enterprise).
 */
export function classifyToolTrust(entry: ToolTrustClassificationInput): ToolTrustTier {
  if (entry.riskLevel === 'critical') return 'Danger';
  return SOURCE_TRUST_TIER[entry.source];
}

// ─── Catalog Entry ──────────────────────────────────────────────────────────

/** A single entry in the trust-tier catalog. */
export interface ToolCatalogEntry {
  /** Canonical id — matches the underlying tool-registry ToolDefinition's `name` where one exists. */
  readonly id: string;
  /** i18n key (see src/cli/helpers/messages.ts) — never display text directly. */
  readonly labelKey: string;
  readonly trustTier: ToolTrustTier;
  readonly riskLevel: ToolCatalogRiskLevel;
  readonly source: ToolCatalogSource;
  /** Capability/domain scope tags this tool touches — opaque to this module. */
  readonly scopes: readonly string[];
}

/** JSON round-trip schema for {@link ToolCatalogEntry}. */
export const ToolCatalogEntrySchema = z.object({
  id: z.string(),
  labelKey: z.string(),
  trustTier: ToolTrustTierSchema,
  riskLevel: ToolCatalogRiskLevelSchema,
  source: ToolCatalogSourceSchema,
  scopes: z.array(z.string()),
});

// ─── Bridge: ToolDefinition (tool-registry) -> ToolCatalogEntry ───────────

export interface ToolCatalogSeedOptions {
  source: ToolCatalogSource;
  labelKey: string;
  scopes: readonly string[];
  /** Overrides the risk level carried over from `def.risk` (e.g. to mark a tool 'critical'). */
  riskLevel?: ToolCatalogRiskLevel;
}

/**
 * Builds a {@link ToolCatalogEntry} from a real tool-registry `ToolDefinition`
 * plus the catalog-only metadata the registry does not carry (source,
 * labelKey, scopes). `trustTier` is always derived via {@link classifyToolTrust},
 * never passed in directly, so it can never drift from the source+risk rule.
 */
export function toolCatalogEntryFromDefinition(
  def: ToolDefinition,
  opts: ToolCatalogSeedOptions,
): ToolCatalogEntry {
  const riskLevel = opts.riskLevel ?? def.risk;
  return {
    id: def.name,
    labelKey: opts.labelKey,
    trustTier: classifyToolTrust({ source: opts.source, riskLevel }),
    riskLevel,
    source: opts.source,
    scopes: opts.scopes,
  };
}

// ─── Catalog Collection ─────────────────────────────────────────────────────

/**
 * Queryable collection of {@link ToolCatalogEntry} records — mirrors
 * tool-registry's `ToolRegistry` class shape. Pure data + query only: no
 * caching/TTL/enable-disable (TOOL-REG's separate scope) and no
 * call/dispatch/execute/invoke capability.
 */
export class ToolCatalog {
  private readonly entries = new Map<string, ToolCatalogEntry>();

  /** Upserts an entry (replaces any existing record with the same id). */
  register(entry: ToolCatalogEntry): void {
    this.entries.set(entry.id, entry);
  }

  get(id: string): ToolCatalogEntry | undefined {
    return this.entries.get(id);
  }

  has(id: string): boolean {
    return this.entries.has(id);
  }

  list(): ToolCatalogEntry[] {
    return Array.from(this.entries.values());
  }

  byTrustTier(tier: ToolTrustTier): ToolCatalogEntry[] {
    return this.list().filter((e) => e.trustTier === tier);
  }

  bySource(source: ToolCatalogSource): ToolCatalogEntry[] {
    return this.list().filter((e) => e.source === source);
  }

  get size(): number {
    return this.entries.size;
  }
}
