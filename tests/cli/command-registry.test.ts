/**
 * command-registry.test.ts — TERM-3 categorized cross-surface registry
 * (task 351-002).
 *
 * Coverage guard: the registry must be a superset of what's ACTUALLY
 * registered on disk today — a real command/tool missing from the registry
 * fails here rather than silently drifting (goCriteria: "registry gerçek
 * komut-envanterini kapsar, test disk-taramayla karşılaştırır").
 *
 * Ground truth sources (all live, not hardcoded snapshots):
 *   - CLI:  buildProgram() from src/cli/index.js (same pattern as
 *           tests/cli/cli-inventory.test.ts)
 *   - MCP:  TOOL_CATALOG from src/mcp/tools/index.js (B-MCPCATALOG-SSOT)
 *   - REPL: buildSlashRegistry() from src/cli/commands/chat-slash-registry.js
 */
import { describe, it, expect, beforeAll } from 'vitest';
import type { Command } from 'commander';
import {
  COMMAND_REGISTRY,
  byCategory,
  byRisk,
  bySurface,
  getCommand,
  search,
  type CommandCategory,
  type CommandRisk,
  type CommandSurface,
} from '../../src/cli/command-registry.js';
import { buildSlashRegistry } from '../../src/cli/commands/chat-slash-registry.js';
import {
  CLI_COMMAND_CONTRACTS,
  EFFECT_TO_RISK,
  contractPathKey,
  getContract,
  registryContracts,
  type CliCommandContract,
} from '../../src/core/cli-command-contract.js';
import { projectRegistryEntry } from '../../src/core/command-registry.js';

const VALID_CATEGORIES: readonly CommandCategory[] = ['Core', 'Run', 'Memory', 'MCP', 'Enterprise', 'Danger'];
const VALID_RISKS: readonly CommandRisk[] = ['Oku', 'Değiştir', 'Çalıştır', 'Otonom'];
const VALID_SURFACES: readonly CommandSurface[] = ['cli', 'mcp', 'repl'];

describe('COMMAND_REGISTRY — shape', () => {
  it('is non-empty and has no duplicate names', () => {
    expect(COMMAND_REGISTRY.length).toBeGreaterThan(0);
    const names = COMMAND_REGISTRY.map((e) => e.name);
    const dupes = names.filter((n, i) => names.indexOf(n) !== i);
    expect(dupes).toEqual([]);
  });

  it('every entry uses a spec-valid category', () => {
    const bad = COMMAND_REGISTRY.filter((e) => !VALID_CATEGORIES.includes(e.category));
    expect(bad.map((e) => e.name)).toEqual([]);
  });

  it('every entry uses a spec-valid TERM-5 plain-risk-language value', () => {
    const bad = COMMAND_REGISTRY.filter((e) => !VALID_RISKS.includes(e.risk));
    expect(bad.map((e) => e.name)).toEqual([]);
  });

  it('every entry declares at least one valid surface', () => {
    const bad = COMMAND_REGISTRY.filter(
      (e) => e.surfaces.length === 0 || e.surfaces.some((s) => !VALID_SURFACES.includes(s)),
    );
    expect(bad.map((e) => e.name)).toEqual([]);
  });

  it('summaryKey is an i18n key, never inline display text', () => {
    for (const e of COMMAND_REGISTRY) {
      expect(e.summaryKey).toMatch(/^cmdCatalog\.[a-z0-9-]+\.summary$/);
    }
  });

  it('mcpNames is present iff surfaces includes "mcp", and never empty when present', () => {
    for (const e of COMMAND_REGISTRY) {
      if (e.surfaces.includes('mcp')) {
        expect(e.mcpNames?.length ?? 0).toBeGreaterThan(0);
      } else {
        expect(e.mcpNames === undefined || e.mcpNames.length === 0).toBe(true);
      }
    }
  });

  it('no mcpNames value is reused across two different entries', () => {
    const all = COMMAND_REGISTRY.flatMap((e) => e.mcpNames ?? []);
    const dupes = all.filter((n, i) => all.indexOf(n) !== i);
    expect(dupes).toEqual([]);
  });
});

describe('COMMAND_REGISTRY ⊇ registered CLI commands (disk truth)', () => {
  let cliNames: string[];

  beforeAll(async () => {
    const mod = await import('../../src/cli/index.js');
    const buildProgram = mod.buildProgram as () => Command;
    cliNames = buildProgram().commands.map((c) => c.name());
  });

  it('scanned at least 45 top-level CLI commands (sanity floor)', () => {
    expect(cliNames.length).toBeGreaterThanOrEqual(45);
  });

  it('every registered top-level CLI command has a registry entry with the "cli" surface', () => {
    const missing = cliNames.filter((name) => {
      const found = COMMAND_REGISTRY.find((e) => e.name === name);
      return !found || !found.surfaces.includes('cli');
    });
    expect(missing).toEqual([]);
  });
});

describe('COMMAND_REGISTRY ⊇ registered MCP tools (disk truth)', () => {
  let mcpToolNames: string[];

  beforeAll(async () => {
    const mod = await import('../../src/mcp/tools/index.js');
    mcpToolNames = mod.TOOL_CATALOG.map((t: { name: string }) => t.name);
  });

  it('scanned at least 30 MCP tools (sanity floor)', () => {
    expect(mcpToolNames.length).toBeGreaterThanOrEqual(30);
  });

  it('every registered MCP tool appears in some entry\'s mcpNames', () => {
    const allMcpNames = COMMAND_REGISTRY.flatMap((e) => e.mcpNames ?? []);
    const missing = mcpToolNames.filter((name) => !allMcpNames.includes(name));
    expect(missing).toEqual([]);
  });

  it('no registry mcpNames value is fabricated (all resolve to a real registered tool)', () => {
    const allMcpNames = COMMAND_REGISTRY.flatMap((e) => e.mcpNames ?? []);
    const fabricated = allMcpNames.filter((name) => !mcpToolNames.includes(name));
    expect(fabricated).toEqual([]);
  });
});

describe('COMMAND_REGISTRY — REPL slash coverage (best-effort)', () => {
  // A handful of slash names differ from their canonical registry name
  // (the REPL surface groups/aliases some capabilities under a friendlier
  // name than the underlying CLI command) — documented here rather than
  // guessed at inside the matcher.
  const SLASH_TO_CANONICAL: Record<string, string> = {
    help: 'help-info',
    sprint: 'history',
    directives: 'set-directives',
    agents: 'agent',
    skills: 'skill',
    mcp: 'mcp-bridge',
  };
  // /quit is a documented alias of /exit (see chat-slash-registry.ts) — not
  // a distinct capability, so it intentionally has no registry entry.
  const ALIASES_WITHOUT_ENTRY = new Set(['quit']);

  it('every slash command (excluding documented aliases) resolves to a repl-surfaced entry', () => {
    const registry = buildSlashRegistry();
    const unmatched: string[] = [];

    for (const cmd of registry) {
      const bare = cmd.name.slice(1);
      if (ALIASES_WITHOUT_ENTRY.has(bare)) continue;

      const canonical = SLASH_TO_CANONICAL[bare] ?? bare;
      const byName = COMMAND_REGISTRY.find((e) => e.name === canonical && e.surfaces.includes('repl'));
      const byTool =
        cmd.agenticTool !== undefined &&
        COMMAND_REGISTRY.find((e) => e.surfaces.includes('repl') && e.mcpNames?.includes(cmd.agenticTool!));

      if (!byName && !byTool) unmatched.push(cmd.name);
    }

    expect(unmatched).toEqual([]);
  });
});

describe('Query API', () => {
  it('byCategory returns only entries of that category', () => {
    for (const cat of VALID_CATEGORIES) {
      const results = byCategory(cat);
      expect(results.every((e) => e.category === cat)).toBe(true);
    }
    expect(byCategory('Danger').length).toBeGreaterThan(0);
  });

  it('byRisk returns only entries of that risk tier', () => {
    for (const risk of VALID_RISKS) {
      const results = byRisk(risk);
      expect(results.every((e) => e.risk === risk)).toBe(true);
    }
    expect(byRisk('Otonom').length).toBeGreaterThan(0);
  });

  it('bySurface returns only entries exposing that surface', () => {
    for (const surface of VALID_SURFACES) {
      const results = bySurface(surface);
      expect(results.every((e) => e.surfaces.includes(surface))).toBe(true);
    }
    expect(bySurface('repl').length).toBeGreaterThan(0);
  });

  it('getCommand finds an exact entry by name, undefined otherwise', () => {
    expect(getCommand('status')?.category).toBe('Core');
    expect(getCommand('task')).toMatchObject({
      category: 'Run',
      risk: 'Değiştir',
      scope: 'core',
      surfaces: ['cli'],
    });
    expect(getCommand('does-not-exist')).toBeUndefined();
  });

  it('search matches by name substring, case-insensitively', () => {
    const results = search('KILL');
    expect(results.some((e) => e.name === 'kill')).toBe(true);
  });

  it('search matches by category and scope keywords', () => {
    expect(search('enterprise').length).toBeGreaterThan(0);
    expect(search('nervous').length).toBeGreaterThan(0);
  });

  it('search returns empty array for blank query', () => {
    expect(search('   ')).toEqual([]);
  });
});

// ─── CLI-CONTRACT-001 — registry is a PROJECTION of the path-level SSOT ─────
//
// COMMAND_REGISTRY is no longer hand-maintained: every row is projected from
// a CLI_COMMAND_CONTRACTS row that carries a `registry` block. These tests
// pin the projection rules field-by-field, so a future edit cannot smuggle a
// registry row in without its path-level contract row (which is itself
// verified against the live Commander tree by the surface-truth battery).

describe('COMMAND_REGISTRY — projection of CLI_COMMAND_CONTRACTS (CLI-CONTRACT-001)', () => {
  it('has exactly one entry per contract row carrying a registry block', () => {
    const rows = registryContracts();
    expect(rows.length).toBeGreaterThan(0);
    expect(COMMAND_REGISTRY.length).toBe(rows.length);
    expect(COMMAND_REGISTRY.map((e) => e.name)).toEqual(rows.map((r) => contractPathKey(r.path)));
  });

  it('every registry entry resolves back to its contract row', () => {
    const orphans = COMMAND_REGISTRY.filter((e) => getContract(e.name)?.registry === undefined);
    expect(orphans.map((e) => e.name)).toEqual([]);
  });

  it('risk is derived from path effect unless the top-level family declares an aggregate override', () => {
    const mismatched: string[] = [];
    for (const entry of COMMAND_REGISTRY) {
      const contract = getContract(entry.name);
      if (!contract) continue;
      const expected = contract.registry?.familyRisk ?? EFFECT_TO_RISK[contract.effect];
      if (entry.risk !== expected) mismatched.push(entry.name);
    }
    expect(mismatched).toEqual([]);
  });

  it('aggregate risk overrides preserve mutating family discovery without mislabeling bare group paths', () => {
    const groupsWithMutation = registryContracts().filter((contract) =>
      contract.effect === 'group' && contract.registry?.familyRisk !== undefined);
    expect(groupsWithMutation.length).toBeGreaterThan(20);
    for (const contract of groupsWithMutation) {
      expect(contract.defaultExecution).toBe('read');
      expect(contract.authority).toBe('open');
      expect(projectRegistryEntry(contract).risk).toBe(contract.registry!.familyRisk);
    }
  });

  it('category / scope / mcpNames / surfaces / catalogDependent come from the contract row verbatim', () => {
    const drift: string[] = [];
    for (const entry of COMMAND_REGISTRY) {
      const contract = getContract(entry.name);
      if (!contract?.registry) continue;
      const sameMcp =
        JSON.stringify(entry.mcpNames ?? null) === JSON.stringify(contract.registry.mcpNames ?? null);
      const sameSurfaces = JSON.stringify([...entry.surfaces]) === JSON.stringify([...contract.surfaces]);
      const sameCatalog = (entry.catalogDependent === true) === (contract.catalogDependent === true);
      if (
        entry.category !== contract.registry.category ||
        entry.scope !== contract.registry.scope ||
        !sameMcp ||
        !sameSurfaces ||
        !sameCatalog
      ) {
        drift.push(entry.name);
      }
    }
    expect(drift).toEqual([]);
  });

  it('summaryKey is derived as cmdCatalog.<name>.summary for every projected row', () => {
    for (const entry of COMMAND_REGISTRY) {
      expect(entry.summaryKey).toBe(`cmdCatalog.${entry.name}.summary`);
    }
  });

  it('projectRegistryEntry refuses a contract row without a registry block', () => {
    const pathOnlyRow = CLI_COMMAND_CONTRACTS.find((c) => c.registry === undefined);
    expect(pathOnlyRow, 'contract must contain at least one non-projected sub-path row').toBeDefined();
    expect(() => projectRegistryEntry(pathOnlyRow as CliCommandContract)).toThrow(/no registry projection/);
  });

  it('catalog-dependent commands are exactly the contract rows flagged catalogDependent', () => {
    const fromRegistry = COMMAND_REGISTRY.filter((e) => e.catalogDependent === true).map((e) => e.name).sort();
    const fromContract = registryContracts()
      .filter((c) => c.catalogDependent)
      .map((c) => contractPathKey(c.path))
      .sort();
    expect(fromRegistry).toEqual(fromContract);
    expect(fromRegistry.length).toBeGreaterThan(0);
  });
});
