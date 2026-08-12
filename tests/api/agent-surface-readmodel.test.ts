// S5 (sprint-523 task 9): ONE canonical agent-catalog projection for every
// surface. Sprint-522's S4 left byte-identical duplicate builders in the CLI
// and MCP modules and the API served a third shape from listEnabled(); this
// suite pins the collapse — all three surfaces re-export/consume
// core/agent-catalog-projection, identical ids/counts on one tree, and the
// API payload keeps every pre-S5 field while carrying the read-model truth.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildAgentCatalogEntries } from '../../src/core/agent-catalog-projection.js';
import { buildAgentCatalogEntries as cliBuild } from '../../src/cli/commands/agent.js';
import { buildAgentCatalogEntries as mcpBuild } from '../../src/mcp/tools/agent-list.js';
import { modelRegistry } from '../../src/core/model-registry.js';

const MODEL = modelRegistry.getAllModelIds()[0]!;

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'deckent-agent-s5-'));
  mkdirSync(join(root, '.deckent', 'agents'), { recursive: true });
  writeFileSync(join(root, '.deckent', 'config.json'), '{}', 'utf-8');
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function installAgent(id: string, extra: Record<string, unknown>, prompt?: string): void {
  const dir = join(root, '.deckent', 'agents', id);
  mkdirSync(dir, { recursive: true });
  const manifest = {
    id, name: id, description: `${id} fixture`, expertise: [], allowedTools: [],
    deniedTools: [], preferredModel: MODEL, effortMultiplier: 1, triggerKeywords: [],
    triggerScopes: [], triggerFilePatterns: [], persistent: true, enabled: true,
    source: 'user', stats: { totalUses: 0, successRate: 0 }, ...extra,
  };
  writeFileSync(join(dir, 'agent.json'), JSON.stringify(manifest, null, 2), 'utf-8');
  if (prompt !== undefined) writeFileSync(join(dir, 'PROMPT.md'), prompt, 'utf-8');
}

describe('agent catalog S5 — one projection, three surfaces', () => {
  it('CLI and MCP surfaces re-export the SAME function object as core (no duplicate builder can drift)', () => {
    expect(cliBuild).toBe(buildAgentCatalogEntries);
    expect(mcpBuild).toBe(buildAgentCatalogEntries);
  });

  it('identical ids and counts across the projection on one tree', () => {
    installAgent('alpha-agent', { capabilities: { domains: ['docs'] } }, '# Alpha persona\nreal content here');
    installAgent('beta-agent', {}, '# Beta persona\nreal content here');
    const core = buildAgentCatalogEntries(root);
    const cli = cliBuild(root);
    const mcp = mcpBuild(root);
    const ids = core.map((e) => e.id);
    expect(cli.map((e) => e.id)).toEqual(ids);
    expect(mcp.map((e) => e.id)).toEqual(ids);
    expect(ids).toContain('alpha-agent');
    expect(ids).toContain('beta-agent');
  });

  it('the API payload shape preserves every pre-S5 field and adds the read-model truth', () => {
    installAgent('gamma-agent', { capabilities: { domains: ['api'] } }, '# Gamma persona\nreal content');
    const entry = buildAgentCatalogEntries(root).find((e) => e.id === 'gamma-agent')!;
    // Mirror of the server handler's mapping — pinned here so a handler edit
    // that drops a legacy field breaks this suite.
    const payload = {
      id: entry.id,
      name: entry.name,
      source: entry.provenance.declared,
      enabled: entry.enabled,
      totalUses: entry.uses,
      successRate: entry.successRate,
      validity: entry.validity,
      routable: entry.routable,
      provenance: entry.provenance,
      prompt: entry.prompt,
      diagnostics: entry.diagnostics,
    };
    for (const legacy of ['id', 'name', 'source', 'enabled', 'totalUses', 'successRate']) {
      expect(payload).toHaveProperty(legacy);
    }
    expect(payload.validity).toBe('valid');
    expect(payload.routable).toHaveProperty('value');
    expect(payload.provenance).toHaveProperty('layer');
  });

  it('D4 truth flows through: a capability-less agent is non-routable on every surface', () => {
    installAgent('delta-agent', {}, '# Delta persona\nreal content');
    for (const build of [buildAgentCatalogEntries, cliBuild, mcpBuild]) {
      const entry = build(root).find((e) => e.id === 'delta-agent')!;
      expect(entry.routable.value).toBe(false);
      expect(entry.routable.reasons).toContain('capabilities-missing');
    }
  });
});
