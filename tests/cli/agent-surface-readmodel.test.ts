/**
 * Agent catalog S4 (row 7011) — the CLI and MCP read surfaces consume the resolver's
 * read model instead of scanning `.deckent/agents` themselves.
 *
 * The proof obligation from the design's S4 slice: on ONE tree, `deckent agent list` and
 * `deckent_agent_list` report the same ids, the same count and the same provenance word as
 * the resolver snapshot — the `learned` / `temp` split (§2.4) is gone — and archive is
 * absent from both regardless of nesting depth.
 *
 * Hermetic: a tmpdir fixture tree for all three layers (L1 project, L2 runtime, L0 builtin
 * via `__setBuiltinAgentsDirForTests`), no repo state, no network, no shared cwd mutation.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';

const testRoot = join(tmpdir(), `deckent-agent-surface-readmodel-${Date.now()}`);
const builtinAgentsDir = join(testRoot, '__builtin-tree__', 'agents');

vi.mock('../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: () => testRoot,
}));

const output: string[] = [];
vi.mock('../../src/cli/helpers/output.js', () => ({
  print: (msg: string) => output.push(msg),
  printError: (err: unknown) => output.push(String(err instanceof Error ? err.message : err)),
  formatTable: (headers: string[], rows: string[][]) =>
    [headers.join('|'), ...rows.map((r) => r.join('|'))].join('\n'),
}));

import { registerAgent } from '../../src/cli/commands/agent.js';
import { registerAgentListTool } from '../../src/mcp/tools/agent-list.js';
import { AgentPoolManager, __setBuiltinAgentsDirForTests } from '../../src/core/agent-pool.js';
import { modelRegistry } from '../../src/core/model-registry.js';

// ─── Fixture tree ────────────────────────────────────────────────────────────

const MODEL = modelRegistry.getAllModelIds()[0]!;

/** A schema-valid routing-v3 capability block (capability-vector.ts). */
const CAPABILITIES = {
  capabilitiesVersion: 3,
  content: {
    workTypes: [{ type: 'build', proficiency: 'primary' }],
    expertise: ['cli'],
    personaSlices: [],
  },
  positional: {
    domains: [{ id: 'cli', proficiency: 'primary' }],
    surfaces: ['cli'],
    writeAuthority: true,
    role: 'implementer',
    deliverables: [],
  },
  numerical: { costTier: 'standard', maxParallel: 1 },
};

function manifest(id: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    name: id,
    description: `${id} fixture`,
    expertise: [],
    allowedTools: [],
    deniedTools: [],
    preferredModel: MODEL,
    effortMultiplier: 1,
    triggerKeywords: [],
    triggerScopes: [],
    triggerFilePatterns: [],
    persistent: true,
    enabled: true,
    source: 'user',
    stats: { totalUses: 0, successRate: 0 },
    ...extra,
  };
}

function writeAgent(dir: string, body: Record<string, unknown>, prompt?: string): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'agent.json'), JSON.stringify(body, null, 2));
  if (prompt !== undefined) writeFileSync(join(dir, 'PROMPT.md'), prompt);
}

function buildFixtureTree(): void {
  rmSync(testRoot, { recursive: true, force: true });
  mkdirSync(join(testRoot, '.deckent'), { recursive: true });
  // A real deckent project — the builtin fallback layer is gated on this file existing.
  writeFileSync(join(testRoot, '.deckent', 'config.json'), JSON.stringify({ version: 1 }));

  const projectAgents = join(testRoot, '.deckent', 'agents');

  // L1 project override, canonical persona + capabilities → routable.
  writeAgent(
    join(projectAgents, 'alpha-agent'),
    manifest('alpha-agent', { capabilities: CAPABILITIES }),
    '# alpha-agent persona',
  );

  // L1, capabilities but no PROMPT.md → degraded persona. D4: a degraded-but-present
  // systemPrompt still routes.
  writeAgent(
    join(projectAgents, 'beta-agent'),
    manifest('beta-agent', { capabilities: CAPABILITIES, systemPrompt: 'inline persona' }),
    undefined,
  );

  // L1, no persona at all and no capabilities → both D4 blockers.
  writeAgent(join(projectAgents, 'gamma-agent'), manifest('gamma-agent'), undefined);

  // A record that parses but fails schema validation (no id, no preferredModel) — must be
  // reported as `invalid`, never silently dropped (§4 contract 3).
  mkdirSync(join(projectAgents, 'broken-schema'), { recursive: true });
  writeFileSync(
    join(projectAgents, 'broken-schema', 'agent.json'),
    JSON.stringify({ name: 'broken-schema', enabled: true, model: 'legacy-model', uses: 3 }),
  );

  // Archive namespace — never resolvable, at any nesting depth.
  writeAgent(join(projectAgents, 'archive'), manifest('archive-root-agent'), '# archived');
  writeAgent(join(projectAgents, 'archive', 'old-agent'), manifest('old-agent'), '# archived');

  // L2 learned/runtime — the §2.4 case: the MCP tool used to call this `temp`, the API
  // called it `learned`. One vocabulary now.
  writeAgent(
    join(testRoot, '.tasks', 'agents', 'temp-delta'),
    manifest('temp-delta', { source: 'learned', persistent: false, capabilities: CAPABILITIES }),
    '# temp-delta persona',
  );

  // L0 shipped builtin — only reachable through the resolver's builtin fallback.
  writeAgent(
    join(builtinAgentsDir, 'zeta-builtin'),
    manifest('zeta-builtin', { source: 'builtin', capabilities: CAPABILITIES }),
    '# zeta-builtin persona',
  );
}

// ─── Surface drivers ─────────────────────────────────────────────────────────

interface SurfaceEntry {
  id: string;
  name: string;
  enabled: boolean;
  validity: 'valid' | 'invalid';
  routable: { value: boolean; reasons: string[] };
  provenance: { declared: string | null; layer: string | null; resolvedFrom: string | null };
  prompt: { availability: string; degraded: boolean };
  model: string | null;
  uses: number;
  successRate: number;
  diagnostics: string[];
}

type McpHandler = () => Promise<{ content: { type: string; text: string }[] }>;

let mcpHandler: McpHandler;

async function runCli(args: string[]): Promise<string> {
  output.length = 0;
  process.exitCode = undefined;
  const program = new Command();
  program.exitOverride();
  registerAgent(program);
  try {
    await program.parseAsync(['node', 'deckent', ...args]);
  } catch {
    // commander exitOverride
  }
  return output.join('\n');
}

async function cliEntries(): Promise<SurfaceEntry[]> {
  const text = await runCli(['agent', 'list', '--json']);
  return JSON.parse(text) as SurfaceEntry[];
}

async function mcpPayload(): Promise<{
  agents: SurfaceEntry[];
  total: number;
  enabled: number;
  routable: number;
  invalid: number;
}> {
  // The tool resolves its project root from cwd; scope the override to this call only.
  const spy = vi.spyOn(process, 'cwd').mockReturnValue(testRoot);
  try {
    const result = await mcpHandler();
    return JSON.parse(result.content[0]!.text);
  } finally {
    spy.mockRestore();
  }
}

function resolverSnapshotIds(): string[] {
  const manager = new AgentPoolManager(testRoot);
  const pool = manager.loadAgents();
  const describable = manager
    .getInvalidManifests()
    .filter((r) => !r.errors.some((e) => e.startsWith('agent.json exists but is unreadable')))
    .map((r) => r.id);
  return [...new Set([...pool.keys(), ...describable])].sort();
}

function find(entries: SurfaceEntry[], id: string): SurfaceEntry {
  const entry = entries.find((e) => e.id === id);
  if (!entry) throw new Error(`entry not found: ${id} (have: ${entries.map((e) => e.id).join(', ')})`);
  return entry;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('agent catalog read model — CLI and MCP surfaces (row 7011 S4)', () => {
  beforeAll(() => {
    buildFixtureTree();
    __setBuiltinAgentsDirForTests(builtinAgentsDir);
    registerAgentListTool({
      registerTool: (_name: string, _config: unknown, handler: McpHandler) => {
        mcpHandler = handler;
      },
    } as never);
  });

  afterAll(() => {
    __setBuiltinAgentsDirForTests(null);
    rmSync(testRoot, { recursive: true, force: true });
  });

  it('reports identical ids and counts on both surfaces and the resolver snapshot', async () => {
    const cli = await cliEntries();
    const mcp = await mcpPayload();
    const snapshot = resolverSnapshotIds();

    expect(snapshot).toEqual([
      'alpha-agent',
      'beta-agent',
      'broken-schema',
      'gamma-agent',
      'temp-delta',
      'zeta-builtin',
    ]);
    expect(cli.map((e) => e.id)).toEqual(snapshot);
    expect(mcp.agents.map((e) => e.id)).toEqual(snapshot);
    expect(mcp.total).toBe(cli.length);
    expect(mcp.total).toBe(snapshot.length);
  });

  it('never lists an archived record, at any nesting depth', async () => {
    const cli = await cliEntries();
    const mcp = await mcpPayload();
    for (const ids of [cli.map((e) => e.id), mcp.agents.map((e) => e.id)]) {
      expect(ids).not.toContain('archive');
      expect(ids).not.toContain('archive-root-agent');
      expect(ids).not.toContain('old-agent');
    }
  });

  it('renders one provenance vocabulary on both surfaces — the learned/temp split is gone', async () => {
    const cli = await cliEntries();
    const mcp = await mcpPayload();

    for (const entries of [cli, mcp.agents]) {
      expect(find(entries, 'temp-delta').provenance.declared).toBe('learned');
      expect(find(entries, 'zeta-builtin').provenance.declared).toBe('builtin');
      expect(find(entries, 'alpha-agent').provenance.declared).toBe('user');
    }

    // The observed layer is the resolver's, not a re-derivation from the id prefix.
    expect(find(cli, 'temp-delta').provenance.layer).toBe('runtime');
    expect(find(cli, 'alpha-agent').provenance.layer).toBe('project');
    expect(find(cli, 'zeta-builtin').provenance.layer).toBe('builtin');
    expect(find(mcp.agents, 'temp-delta').provenance.layer).toBe('runtime');
    expect(find(cli, 'alpha-agent').provenance.resolvedFrom).toContain('alpha-agent');
  });

  it('exposes enabled and routability with typed reasons on both payloads', async () => {
    const cli = await cliEntries();
    const mcp = await mcpPayload();

    for (const entries of [cli, mcp.agents]) {
      const alpha = find(entries, 'alpha-agent');
      expect(alpha.enabled).toBe(true);
      expect(alpha.routable).toEqual({ value: true, reasons: [] });
      expect(alpha.prompt).toEqual({ availability: 'prompt-file', degraded: false });

      // D4: a degraded-but-present systemPrompt is still a persona — it routes.
      const beta = find(entries, 'beta-agent');
      expect(beta.routable.value).toBe(true);
      expect(beta.prompt).toEqual({ availability: 'system-prompt', degraded: true });

      // D4: no persona and no capabilities — both blockers, reported, not hidden.
      const gamma = find(entries, 'gamma-agent');
      expect(gamma.enabled).toBe(true);
      expect(gamma.routable.value).toBe(false);
      expect(gamma.routable.reasons).toContain('prompt-unresolvable');
      expect(gamma.routable.reasons).toContain('capabilities-missing');
    }

    expect(mcp.enabled).toBe(cli.filter((e) => e.enabled).length);
    expect(mcp.routable).toBe(cli.filter((e) => e.routable.value).length);
  });

  it('surfaces a schema-invalid record instead of silently dropping it', async () => {
    const cli = await cliEntries();
    const mcp = await mcpPayload();

    for (const entries of [cli, mcp.agents]) {
      const broken = find(entries, 'broken-schema');
      expect(broken.validity).toBe('invalid');
      expect(broken.routable).toEqual({ value: false, reasons: ['manifest-invalid'] });
      expect(broken.diagnostics.length).toBeGreaterThan(0);
      expect(broken.diagnostics.join(' ')).toContain('preferredModel');
    }
    expect(mcp.invalid).toBe(1);
    expect(cli.filter((e) => e.validity === 'valid').length).toBe(5);
  });

  it('orders entries by id with a fixed collation, not a locale-dependent one', async () => {
    const cli = await cliEntries();
    const mcp = await mcpPayload();
    const fixedSort = [...cli.map((e) => e.id)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    expect(cli.map((e) => e.id)).toEqual(fixedSort);
    expect(mcp.agents.map((e) => e.id)).toEqual(fixedSort);
  });

  it('renders the human table from the same read model', async () => {
    const table = await runCli(['agent', 'list']);
    const rows = table.split('\n').slice(1).map((line) => line.split('|'));
    expect(rows.map((r) => r[0])).toEqual(resolverSnapshotIds());
    // The Type column now speaks the provenance vocabulary, the same word MCP reports.
    expect(rows.find((r) => r[0] === 'temp-delta')?.[1]).toBe('learned');
    expect(rows.find((r) => r[0] === 'zeta-builtin')?.[1]).toBe('builtin');
    expect(rows.find((r) => r[0] === 'alpha-agent')?.[5]).toBe(MODEL);
  });

  it('leaves no raw directory scan on either migrated surface', () => {
    const readSource = (relative: string): string =>
      readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf-8');

    const mcpSource = readSource('../../src/mcp/tools/agent-list.ts');
    expect(mcpSource).not.toContain('readdirSync');
    expect(mcpSource).not.toContain('DECKENT_DIR');

    const cliSource = readSource('../../src/cli/commands/agent.ts');
    expect(cliSource).not.toContain('loadAllAgents');
    expect(cliSource).not.toContain('readdirSync(agentsDir');
    expect(cliSource).not.toContain('readdirSync(getAgentsDir');
  });
});
