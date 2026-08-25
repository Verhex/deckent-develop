// src/core/command-registry.ts
// ═══ TERM-3 — categorized cross-surface command registry ═══════════════════
//
// COMPATIBILITY PROJECTION (CLI-CONTRACT-001). This module no longer DECLARES
// command metadata — every row is now projected from the path-level SSOT in
// ./cli-command-contract.ts (`CLI_COMMAND_CONTRACTS`), which carries one row
// per REAL command path (`agent`, `agent list`, …) plus the repl/mcp-only
// capability rows. Rows that carry a `registry` projection block surface here,
// in the coarse top-level grain every existing consumer already expects:
//
//   name             ← the contract row's single-segment path
//   category/scope   ← contract row's `registry` block
//   mcpNames         ← contract row's `registry` block
//   risk             ← family override, else derived from the row's `effect`
//   summaryKey       ← DERIVED as `cmdCatalog.<name>.summary`
//   surfaces         ← contract row's `surfaces`
//   catalogDependent ← contract row's `catalogDependent`
//
// Nothing downstream changes: the exported shape, the query API, and the
// projected values are identical to the hand-maintained table this replaced
// (proved row-by-row in tests/cli/command-registry.test.ts). What changed is
// that a new command can no longer be added here without adding its
// path-level contract row, and the contract row is mechanically verified
// against the live Commander tree (src/cli/helpers/command-contract.ts).
//
// ADR-D-004 (Layer-1 import direction / surface non-cross-import): delivery
// surfaces consume this lower-layer registry and never import one another.
// `mcpNames` fold the finer MCP catalog into CLI-grain capabilities; parity
// against the co-located canonical TOOL_CATALOG is mechanically tested.
//
// `scope` reuses the 11 architecture-area tags from CLAUDE.md's Architecture
// section (the domain a command's functionality belongs to — every command
// file physically lives under src/cli/commands/, so a literal-directory
// scope would be meaningless; domain-based scope is the only useful one).

import {
  CLI_COMMAND_CONTRACTS,
  EFFECT_TO_RISK,
  type CliCommandContract,
} from './cli-command-contract.js';

// The vocabulary types stay exported from here for every existing importer —
// but they are DEFINED once, in the contract SSOT.
export type {
  CommandCategory,
  CommandRisk,
  CommandSurface,
  CommandScope,
} from './cli-command-contract.js';

import type {
  CommandCategory,
  CommandRisk,
  CommandSurface,
  CommandScope,
} from './cli-command-contract.js';

export interface CommandRegistryEntry {
  /** Canonical id — the real top-level CLI command name where one exists. */
  readonly name: string;
  readonly category: CommandCategory;
  readonly risk: CommandRisk;
  readonly scope: CommandScope;
  /** i18n key (see src/cli/helpers/messages.ts) — never display text directly. */
  readonly summaryKey: string;
  readonly surfaces: readonly CommandSurface[];
  /**
   * Exact `deckent_*` MCP tool name(s) this entry represents. Present iff
   * `surfaces` includes 'mcp'. One entry may fold several fine-grained MCP
   * tools (e.g. the 5 `deckent_nervous_*` tools) into one CLI-grain row.
   */
  readonly mcpNames?: readonly string[];
  /**
   * SEC-04 (task 418-003): true iff this command's execution path needs the
   * live/cached model catalog (fresh apiId/cost/context data merged into
   * modelRegistry). Only these commands may trigger the CLI's lazy
   * catalog-bootstrap network fetch (src/cli/entry.ts preAction hook via
   * `isCatalogDependent`) — every other command runs network-free by
   * default. Absent/false is the safe default (most commands never touch
   * model selection).
   */
  readonly catalogDependent?: boolean;
}

/** Project ONE contract row into the coarse registry grain. */
export function projectRegistryEntry(contract: CliCommandContract): CommandRegistryEntry {
  const projection = contract.registry;
  if (projection === undefined) {
    throw new Error(`contract row "${contract.path.join(' ')}" carries no registry projection`);
  }
  const name = contract.path.join(' ');
  return {
    name,
    category: projection.category,
    risk: projection.familyRisk ?? EFFECT_TO_RISK[contract.effect],
    scope: projection.scope,
    summaryKey: `cmdCatalog.${name}.summary`,
    surfaces: contract.surfaces,
    mcpNames: projection.mcpNames,
    catalogDependent: contract.catalogDependent === true ? true : undefined,
  };
}

/**
 * CANONICAL cross-surface command registry (TERM-3, DIRECTIVES row 42),
 * projected from the path-level contract SSOT. Every top-level CLI command
 * (buildProgram()) and every registered MCP tool (TOOL_CATALOG) must resolve
 * here — enforced by tests/cli/command-registry.test.ts.
 */
export const COMMAND_REGISTRY: readonly CommandRegistryEntry[] = Object.freeze(
  CLI_COMMAND_CONTRACTS.filter((contract) => contract.registry !== undefined).map(projectRegistryEntry),
);

// ─── Query API ─────────────────────────────────────────────────────────────

export function byCategory(category: CommandCategory): readonly CommandRegistryEntry[] {
  return COMMAND_REGISTRY.filter((e) => e.category === category);
}

export function byRisk(risk: CommandRisk): readonly CommandRegistryEntry[] {
  return COMMAND_REGISTRY.filter((e) => e.risk === risk);
}

export function bySurface(surface: CommandSurface): readonly CommandRegistryEntry[] {
  return COMMAND_REGISTRY.filter((e) => e.surfaces.includes(surface));
}

export function getCommand(name: string): CommandRegistryEntry | undefined {
  return COMMAND_REGISTRY.find((e) => e.name === name);
}

/**
 * SEC-04 (task 418-003): does the named top-level command need the model
 * catalog bootstrapped? Unknown names are treated as non-dependent (safe
 * default — no network).
 */
export function isCatalogDependent(name: string): boolean {
  return getCommand(name)?.catalogDependent === true;
}

/**
 * Free-text search over name / category / scope / summaryKey tail segment.
 * Case-insensitive substring match — summaryKey holds an i18n key, not
 * display text, so this stays working without a loaded message catalog.
 */
export function search(query: string): readonly CommandRegistryEntry[] {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return [];
  return COMMAND_REGISTRY.filter((e) => {
    const summaryTail = e.summaryKey.split('.').slice(1, -1).join('.');
    return (
      e.name.toLowerCase().includes(q) ||
      e.category.toLowerCase().includes(q) ||
      e.scope.toLowerCase().includes(q) ||
      summaryTail.toLowerCase().includes(q)
    );
  });
}
