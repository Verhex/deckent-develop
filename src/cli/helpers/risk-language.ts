// ═══ risk-language — ADR-D-012 TERM-5 CommandRisk display-translation layer ═══
//
// `renderCommandRisk` resolves the canonical 4-class plain-risk ladder
// (`CommandRisk` — Oku/Değiştir/Çalıştır/Otonom, src/cli/command-registry.ts)
// to a localized label + short description via getMessage. The other 7
// internal risk/trust vocabularies ADR-D-012 § Context inventories
// (`ToolTrustTier`, `ToolCatalogRiskLevel`, `ApprovalRisk`, `ToolPermission`,
// catalog-render's own `RiskLevel`, nervous `RiskLevel`, base `ToolRiskLevel`)
// each get a pure, display-only translation *into* `CommandRisk` below —
// never the reverse (ADR-D-012 § Decision item 1: "Each keeps a pure,
// display-only translation into CommandRisk"). None of those 7 dictionaries'
// own runtime behavior (approval-gating, trust classification, etc.)
// changes here.
//
// This is slice 1 (task 375-004) — translation layer + tests only. Wiring a
// consumer (REPL /help, catalog-render) is an explicit slice-2 follow-up;
// this module has zero importers today.

import { getMessage } from './messages.js';
import type { CommandRisk } from '../command-registry.js';
import type { ToolPermission } from '../repl/tool-permissions.js';
import type { ApprovalRisk } from '../../core/approval-contract.js';
import type { RiskLevel as NervousRiskLevel } from '../../core/nervous-types.js';
import type { ToolRiskLevel } from '../../core/tool-registry.js';
import type { ToolCatalogRiskLevel, ToolTrustTier } from '../../core/tool-catalog.js';
import type { RiskLevel as CatalogRenderRiskLevel } from './catalog-render.js';

// ─── Canonical 4-class ladder rendering ───────────────────────────────────

/** i18n key fragment per class — matches ADR-D-012 § Decision item 2's draft key names. */
const RISK_KEY: Record<CommandRisk, string> = {
  Oku: 'oku',
  Değiştir: 'degistir',
  Çalıştır: 'calistir',
  Otonom: 'otonom',
};

/** Ladder order (Otonom is orthogonal to severity, not "worse" — listed last per the ADR). */
export const COMMAND_RISK_LADDER: readonly CommandRisk[] = ['Oku', 'Değiştir', 'Çalıştır', 'Otonom'];

export interface RenderedCommandRisk {
  readonly risk: CommandRisk;
  readonly label: string;
  readonly description: string;
}

/** Localized label + short description for one of the 4 canonical CommandRisk classes. */
export function renderCommandRisk(risk: CommandRisk, lang: string): RenderedCommandRisk {
  const key = RISK_KEY[risk];
  return {
    risk,
    label: getMessage(`cmdCatalog.risk.${key}`, lang),
    description: getMessage(`cmdCatalog.risk.${key}.desc`, lang),
  };
}

/** All 4 classes rendered, in {@link COMMAND_RISK_LADDER} order. */
export function renderAllCommandRisks(lang: string): readonly RenderedCommandRisk[] {
  return COMMAND_RISK_LADDER.map((risk) => renderCommandRisk(risk, lang));
}

// ─── Cross-dictionary translations (display-only, → CommandRisk) ─────────

/**
 * `ToolPermission` (REPL confirm tier, tool-permissions.ts) → `CommandRisk`.
 * Grounded in ADR-D-012 § Decision item 3 (approval-threshold mapping):
 * read=silent→Oku, confirm=confirm-once→Değiştir, always=safety-floor
 * escalation→Çalıştır.
 */
export function toolPermissionToCommandRisk(permission: ToolPermission): CommandRisk {
  switch (permission) {
    case 'read':
      return 'Oku';
    case 'confirm':
      return 'Değiştir';
    case 'always':
      return 'Çalıştır';
  }
}

/**
 * `ApprovalRisk` (5-level none..critical, approval-contract.ts) → `CommandRisk`.
 * `medium` follows ADR-D-012 § Open Question 1's stated lean ("proposes
 * Değiştir"); `critical` clamps to the ladder's highest non-Otonom rung,
 * mirroring tool-catalog.ts's `classifyToolTrust` "critical always clamps"
 * precedent.
 */
export function approvalRiskToCommandRisk(risk: ApprovalRisk): CommandRisk {
  switch (risk) {
    case 'none':
      return 'Oku';
    case 'low':
    case 'medium':
      return 'Değiştir';
    case 'high':
    case 'critical':
      return 'Çalıştır';
  }
}

/**
 * nervous `RiskLevel` (low/medium/high, nervous-types.ts) → `CommandRisk`.
 * `medium` follows the same ADR-D-012 § Open Question 1 lean, which names
 * nervous `RiskLevel.medium` alongside `ApprovalRisk.medium` explicitly.
 */
export function nervousRiskLevelToCommandRisk(risk: NervousRiskLevel): CommandRisk {
  switch (risk) {
    case 'low':
      return 'Oku';
    case 'medium':
      return 'Değiştir';
    case 'high':
      return 'Çalıştır';
  }
}

/** Base `ToolRiskLevel` (safe/moderate/destructive, tool-registry.ts) → `CommandRisk`. Linear ladder match. */
export function toolRiskLevelToCommandRisk(risk: ToolRiskLevel): CommandRisk {
  switch (risk) {
    case 'safe':
      return 'Oku';
    case 'moderate':
      return 'Değiştir';
    case 'destructive':
      return 'Çalıştır';
  }
}

/**
 * `ToolCatalogRiskLevel` (base scale + catalog-only 'critical', tool-catalog.ts)
 * → `CommandRisk`. Extends {@link toolRiskLevelToCommandRisk}'s ladder;
 * `critical` clamps to the highest non-Otonom rung (tool-catalog.ts's own
 * `classifyToolTrust` "critical always clamps to Danger" precedent).
 */
export function toolCatalogRiskLevelToCommandRisk(risk: ToolCatalogRiskLevel): CommandRisk {
  if (risk === 'critical') return 'Çalıştır';
  return toolRiskLevelToCommandRisk(risk);
}

/**
 * catalog-render's own UI `RiskLevel` (low/medium/high/critical,
 * catalog-render.ts) → `CommandRisk`. Same ladder shape as
 * `ToolCatalogRiskLevel` — kept as a separate function since the two scales
 * are intentionally distinct domains (catalog-render.ts's own doc comment,
 * 358-017) even though their translation into `CommandRisk` happens to agree.
 */
export function catalogRenderRiskLevelToCommandRisk(risk: CatalogRenderRiskLevel): CommandRisk {
  switch (risk) {
    case 'low':
      return 'Oku';
    case 'medium':
      return 'Değiştir';
    case 'high':
    case 'critical':
      return 'Çalıştır';
  }
}

/**
 * `ToolTrustTier` (Core/Project/MCP/Enterprise/Danger, tool-catalog.ts) →
 * `CommandRisk`. `Danger` is risk-driven only — `classifyToolTrust` enters it
 * exclusively via `riskLevel === 'critical'` — so it clamps to the same rung
 * as the other 'critical' translations above. The 4 source-derived tiers
 * carry no independent severity signal of their own (tool-catalog.ts's
 * `SOURCE_TRUST_TIER` is a straight source passthrough, not a risk scale);
 * `Değiştir` is used as an honest "non-zero, unknown severity" default rather
 * than inventing a false ordering between Core/Project/MCP/Enterprise.
 */
export function toolTrustTierToCommandRisk(tier: ToolTrustTier): CommandRisk {
  if (tier === 'Danger') return 'Çalıştır';
  return 'Değiştir';
}
