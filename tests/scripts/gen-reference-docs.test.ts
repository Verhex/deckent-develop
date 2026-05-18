import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  parseMcpTools,
  parseMcpResources,
  parseAdrs,
  parseCliCommands,
  parseAgents,
  renderMcpTools,
  renderMcpResources,
  renderAdrs,
  renderCliCommands,
  renderAgents,
  replaceAutogenBlock,
  collectGenerations,
  // @ts-expect-error — .mjs script lacks .d.ts; import works at runtime
} from '../../scripts/gen-reference-docs.mjs';

let tmpRoot: string;

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'gen-ref-docs-test-'));
});

afterEach(() => {
  if (tmpRoot && existsSync(tmpRoot)) rmSync(tmpRoot, { recursive: true, force: true });
});

// ─── parseMcpTools ────────────────────────────────────────────────────────────

describe('parseMcpTools', () => {
  it('extracts tool name + title + description from registerTool call', () => {
    const toolsDir = join(tmpRoot, 'src/mcp/tools');
    mkdirSync(toolsDir, { recursive: true });
    writeFileSync(
      join(toolsDir, 'init.ts'),
      `
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
export function registerInitTool(server: McpServer): void {
  server.registerTool(
    'deckent_init',
    {
      title: 'Initialize Deckent',
      description: 'Initialize a Deckent project in the current directory.',
    },
    async () => ({ content: [{ type: 'text', text: 'ok' }] }),
  );
}
`,
    );
    const tools = parseMcpTools(toolsDir);
    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe('deckent_init');
    expect(tools[0].title).toBe('Initialize Deckent');
    expect(tools[0].description).toContain('Initialize a Deckent project');
  });

  it('extracts multiple tools from a single file (nervous-style)', () => {
    const toolsDir = join(tmpRoot, 'src/mcp/tools');
    mkdirSync(toolsDir, { recursive: true });
    writeFileSync(
      join(toolsDir, 'nervous.ts'),
      `
server.registerTool('deckent_nervous_a', { title: 'A title', description: 'A desc' }, async () => ({}));
server.registerTool('deckent_nervous_b', { title: 'B title', description: 'B desc' }, async () => ({}));
`,
    );
    const tools = parseMcpTools(toolsDir);
    expect(tools.length).toBeGreaterThanOrEqual(2);
    const names = tools.map((t: { name: string }) => t.name);
    expect(names).toContain('deckent_nervous_a');
    expect(names).toContain('deckent_nervous_b');
  });

  it('returns empty array when no tool files exist', () => {
    const toolsDir = join(tmpRoot, 'empty');
    mkdirSync(toolsDir, { recursive: true });
    expect(parseMcpTools(toolsDir)).toEqual([]);
  });
});

// ─── parseMcpResources ────────────────────────────────────────────────────────

describe('parseMcpResources', () => {
  it('extracts resource name + uri + title + description', () => {
    const resDir = join(tmpRoot, 'src/mcp/resources');
    mkdirSync(resDir, { recursive: true });
    writeFileSync(
      join(resDir, 'dashboard.ts'),
      `
server.registerResource(
  'dashboard',
  'deckent://dashboard',
  {
    title: 'Sprint Dashboard',
    description: 'Live sprint status: agents, progress, usage, alerts',
    mimeType: 'application/json',
  },
  async (uri) => ({ contents: [] }),
);
`,
    );
    const resources = parseMcpResources(resDir);
    expect(resources).toHaveLength(1);
    expect(resources[0].name).toBe('dashboard');
    expect(resources[0].uri).toBe('deckent://dashboard');
    expect(resources[0].title).toBe('Sprint Dashboard');
    expect(resources[0].mimeType).toBe('application/json');
  });
});

// ─── parseAdrs ────────────────────────────────────────────────────────────────

describe('parseAdrs', () => {
  it('parses ADR md files into structured entries', () => {
    const adrDir = join(tmpRoot, 'docs/adr');
    mkdirSync(adrDir, { recursive: true });
    writeFileSync(
      join(adrDir, '001-typescript-esm.md'),
      `# ADR-001: TypeScript + ESM\n\n**Status:** accepted\n\n**Date:** 2026-04-16\n\n**Decision:** Use TypeScript.\n`,
    );
    writeFileSync(
      join(adrDir, '042-hybrid-mode.md'),
      `# ADR-042: Hybrid Mode Architecture\n\n**Status:** proposed\n\n**Decision:** Add task mode.\n`,
    );
    const adrs = parseAdrs(adrDir);
    expect(adrs).toHaveLength(2);
    const byId = Object.fromEntries(adrs.map((a: { id: string }) => [a.id, a]));
    expect(byId['ADR-001'].title).toBe('TypeScript + ESM');
    expect(byId['ADR-001'].status).toBe('accepted');
    expect(byId['ADR-042'].status).toBe('proposed');
  });

  it('skips non-numbered markdown like README.md', () => {
    const adrDir = join(tmpRoot, 'docs/adr');
    mkdirSync(adrDir, { recursive: true });
    writeFileSync(join(adrDir, 'README.md'), '# ADR Index\n\nNot a real ADR.\n');
    writeFileSync(join(adrDir, '001-x.md'), '# ADR-001: X\n\n**Status:** accepted\n');
    const adrs = parseAdrs(adrDir);
    expect(adrs).toHaveLength(1);
    expect(adrs[0].id).toBe('ADR-001');
  });
});

// ─── parseCliCommands ─────────────────────────────────────────────────────────

describe('parseCliCommands', () => {
  it('extracts CLI command names and descriptions from commander source', () => {
    const cmdDir = join(tmpRoot, 'src/cli/commands');
    mkdirSync(cmdDir, { recursive: true });
    writeFileSync(
      join(cmdDir, 'init.ts'),
      `
import type { Command } from 'commander';
export function registerInit(program: Command): void {
  program
    .command('init')
    .description('Initialize a new Deckent project')
    .action(async () => {});
}
`,
    );
    writeFileSync(
      join(cmdDir, 'start.ts'),
      `
export function registerStart(program: Command): void {
  program
    .command('start [description]')
    .description('Start a new sprint')
    .action(async () => {});
}
`,
    );
    const cmds = parseCliCommands(cmdDir);
    expect(cmds.length).toBeGreaterThanOrEqual(2);
    const init = cmds.find((c: { name: string }) => c.name === 'init');
    const start = cmds.find((c: { name: string }) => c.name === 'start');
    expect(init?.description).toContain('Initialize');
    expect(start?.signature).toContain('start [description]');
  });
});

// ─── parseAgents ──────────────────────────────────────────────────────────────

describe('parseAgents', () => {
  it('parses agent.json files into structured agents', () => {
    const agentsDir = join(tmpRoot, '.deckent/agents');
    mkdirSync(join(agentsDir, 'code-reviewer'), { recursive: true });
    mkdirSync(join(agentsDir, 'api-builder'), { recursive: true });
    writeFileSync(
      join(agentsDir, 'code-reviewer', 'agent.json'),
      JSON.stringify({ id: 'code-reviewer', name: 'Code Reviewer', description: 'Reviewer agent.', expertise: ['code-review'] }),
    );
    writeFileSync(
      join(agentsDir, 'api-builder', 'agent.json'),
      JSON.stringify({ id: 'api-builder', name: 'API Builder', description: 'API agent.', expertise: ['rest-api'] }),
    );
    const agents = parseAgents(agentsDir);
    expect(agents).toHaveLength(2);
    const ids = agents.map((a: { id: string }) => a.id).sort();
    expect(ids).toEqual(['api-builder', 'code-reviewer']);
  });

  it('skips the archive directory', () => {
    const agentsDir = join(tmpRoot, '.deckent/agents');
    mkdirSync(join(agentsDir, 'archive', 'old-agent'), { recursive: true });
    writeFileSync(
      join(agentsDir, 'archive', 'old-agent', 'agent.json'),
      JSON.stringify({ id: 'old-agent', name: 'Old', description: 'archived' }),
    );
    mkdirSync(join(agentsDir, 'security-auditor'), { recursive: true });
    writeFileSync(
      join(agentsDir, 'security-auditor', 'agent.json'),
      JSON.stringify({ id: 'security-auditor', name: 'Security Auditor', description: 'Sec.' }),
    );
    const agents = parseAgents(agentsDir);
    expect(agents).toHaveLength(1);
    expect(agents[0].id).toBe('security-auditor');
  });
});

// ─── render* ─────────────────────────────────────────────────────────────────

describe('renderers', () => {
  it('renderMcpTools produces a markdown table with tool count', () => {
    const md = renderMcpTools([
      { name: 'deckent_init', title: 'Init', description: 'Initialize a project.' },
      { name: 'deckent_start', title: 'Start', description: 'Start a sprint.' },
    ]);
    expect(md).toContain('| Tool | Title |');
    expect(md).toContain('deckent_init');
    expect(md).toContain('deckent_start');
    expect(md).toMatch(/2\s+tools?/i);
  });

  it('renderAdrs groups by status', () => {
    const md = renderAdrs([
      { id: 'ADR-001', title: 'First', status: 'accepted', file: '001.md' },
      { id: 'ADR-005', title: 'Second', status: 'deprecated', file: '005.md' },
    ]);
    expect(md).toContain('ADR-001');
    expect(md).toContain('accepted');
    expect(md).toContain('deprecated');
  });

  it('renderAgents lists agents with expertise', () => {
    const md = renderAgents([
      { id: 'api-builder', name: 'API Builder', description: 'REST.', expertise: ['rest-api', 'http'] },
    ]);
    expect(md).toContain('api-builder');
    expect(md).toContain('REST.');
    expect(md).toContain('rest-api');
  });

  it('renderCliCommands lists command signatures', () => {
    const md = renderCliCommands([
      { name: 'init', signature: 'init', description: 'Init project' },
      { name: 'start', signature: 'start [description]', description: 'Start sprint' },
    ]);
    expect(md).toContain('deckent init');
    expect(md).toContain('deckent start');
    expect(md).toContain('Init project');
  });

  it('renderMcpResources lists URI + mimeType', () => {
    const md = renderMcpResources([
      { name: 'dashboard', uri: 'deckent://dashboard', title: 'Dashboard', description: 'Live status', mimeType: 'application/json' },
    ]);
    expect(md).toContain('deckent://dashboard');
    expect(md).toContain('application/json');
  });
});

// ─── replaceAutogenBlock ──────────────────────────────────────────────────────

describe('replaceAutogenBlock', () => {
  it('replaces content between AUTOGEN markers', () => {
    const original = `# Title\n\n<!-- AUTOGEN:START id="x" -->\nold content\n<!-- AUTOGEN:END id="x" -->\n\nfooter\n`;
    const result = replaceAutogenBlock(original, 'x', 'NEW BODY');
    expect(result).toContain('# Title');
    expect(result).toContain('NEW BODY');
    expect(result).not.toContain('old content');
    expect(result).toContain('footer');
  });

  it('is idempotent — replacing the same content twice yields the same result', () => {
    const original = `<!-- AUTOGEN:START id="x" -->\nfoo\n<!-- AUTOGEN:END id="x" -->\n`;
    const r1 = replaceAutogenBlock(original, 'x', 'NEW');
    const r2 = replaceAutogenBlock(r1, 'x', 'NEW');
    expect(r1).toBe(r2);
  });

  it('throws or returns null when block id missing', () => {
    const original = `no markers here\n`;
    expect(() => replaceAutogenBlock(original, 'missing', 'body')).toThrow();
  });
});

// ─── collectGenerations + drift check ─────────────────────────────────────────

describe('collectGenerations (--check round-trip)', () => {
  it('reports drift when target file is stale and clears after write', () => {
    // Set up a minimal project rooted at tmpRoot
    const toolsDir = join(tmpRoot, 'src/mcp/tools');
    const resDir = join(tmpRoot, 'src/mcp/resources');
    const adrDir = join(tmpRoot, 'docs/adr');
    const cliDir = join(tmpRoot, 'src/cli/commands');
    const agentsDir = join(tmpRoot, '.deckent/agents');
    const refDir = join(tmpRoot, 'docs/reference');
    mkdirSync(toolsDir, { recursive: true });
    mkdirSync(resDir, { recursive: true });
    mkdirSync(adrDir, { recursive: true });
    mkdirSync(cliDir, { recursive: true });
    mkdirSync(join(agentsDir, 'security-auditor'), { recursive: true });
    mkdirSync(refDir, { recursive: true });

    writeFileSync(
      join(toolsDir, 'init.ts'),
      `server.registerTool('deckent_init', { title: 'Init', description: 'Init.' }, async () => ({}));`,
    );
    writeFileSync(
      join(resDir, 'dashboard.ts'),
      `server.registerResource('dashboard', 'deckent://dashboard', { title: 'D', description: 'd', mimeType: 'application/json' }, async () => ({}));`,
    );
    writeFileSync(join(adrDir, '001-x.md'), `# ADR-001: TS\n\n**Status:** accepted\n`);
    writeFileSync(
      join(cliDir, 'init.ts'),
      `program.command('init').description('Initialize project').action(()=>{});`,
    );
    writeFileSync(
      join(agentsDir, 'security-auditor', 'agent.json'),
      JSON.stringify({ id: 'security-auditor', name: 'Security', description: 'Sec.', expertise: ['security'] }),
    );

    // First call: targets do not exist → drift detected.
    const beforeWrite = collectGenerations({ root: tmpRoot });
    expect(beforeWrite.length).toBeGreaterThanOrEqual(5);
    const drifts = beforeWrite.filter((g: { drift: boolean }) => g.drift);
    expect(drifts.length).toBeGreaterThanOrEqual(1);

    // Apply writes.
    for (const gen of beforeWrite) {
      mkdirSync(join(tmpRoot, gen.targetDir), { recursive: true });
      writeFileSync(join(tmpRoot, gen.target), gen.content);
    }

    // Second call: targets match → no drift.
    const afterWrite = collectGenerations({ root: tmpRoot });
    const stillDrifting = afterWrite.filter((g: { drift: boolean }) => g.drift);
    expect(stillDrifting).toHaveLength(0);
  });

  it('exposes target paths under docs/reference and docs/adr', () => {
    // Empty setup; collectGenerations still returns gen descriptors with predictable targets.
    const toolsDir = join(tmpRoot, 'src/mcp/tools');
    const resDir = join(tmpRoot, 'src/mcp/resources');
    const adrDir = join(tmpRoot, 'docs/adr');
    const cliDir = join(tmpRoot, 'src/cli/commands');
    const agentsDir = join(tmpRoot, '.deckent/agents');
    [toolsDir, resDir, adrDir, cliDir, agentsDir].forEach((d) => mkdirSync(d, { recursive: true }));

    const gens = collectGenerations({ root: tmpRoot });
    const targets = gens.map((g: { target: string }) => g.target);
    expect(targets).toContain('docs/reference/mcp-tools.md');
    expect(targets).toContain('docs/reference/mcp-resources.md');
    expect(targets).toContain('docs/adr/README.md');
    expect(targets).toContain('docs/reference/cli.md');
    expect(targets).toContain('docs/reference/agents.md');
  });
});
