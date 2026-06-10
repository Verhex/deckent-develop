import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const MCP_TOOLS_DOC = join(ROOT, 'docs', 'reference', 'mcp-tools.md');
const CLI_COMMANDS_DOC = join(ROOT, 'docs', 'reference', 'cli-commands.md');
const CLI_DOC = join(ROOT, 'docs', 'reference', 'cli.md');
const CONFIG_DOC = join(ROOT, 'docs', 'reference', 'config.md');
const API_DOC = join(ROOT, 'docs', 'reference', 'api.md');

/**
 * Count MCP tool registrations straight from source (code-derived — Sprint 269,
 * replaces the hardcoded "32 tools" expectation that drifted every time a tool
 * landed). Mirrors the parsing rules of `scripts/gen-reference-docs.mjs`
 * (`parseMcpTools`): recurse `src/mcp/tools/`, skip `index.ts`/`.d.ts`/
 * `archive`/`node_modules`, count `server.registerTool('<name>'` call sites.
 */
function countRegisteredMcpTools(dir: string): number {
  const TOOL_RE = /server\.registerTool\(\s*['"]([a-zA-Z0-9_-]+)['"]/g;
  let count = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'archive' || entry.name === 'node_modules') continue;
      count += countRegisteredMcpTools(p);
    } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts') && entry.name !== 'index.ts') {
      count += readFileSync(p, 'utf-8').match(TOOL_RE)?.length ?? 0;
    }
  }
  return count;
}

describe('reference docs drift — mcp-tool-count sync', () => {
  const mcpContent = readFileSync(MCP_TOOLS_DOC, 'utf-8');

  it('mcp-tools.md tool count matches src/mcp/tools/ registrations (code-derived)', () => {
    const actualCount = countRegisteredMcpTools(join(ROOT, 'src', 'mcp', 'tools'));
    expect(actualCount).toBeGreaterThan(0);
    expect(mcpContent).toMatch(new RegExp(`${actualCount} tools registered`));
  });

  it('mcp-tools.md contains deckent_models tool', () => {
    expect(mcpContent).toContain('deckent_models');
  });

  it('mcp-tools.md contains all 5 nervous system tools', () => {
    expect(mcpContent).toContain('deckent_nervous_subscribe');
    expect(mcpContent).toContain('deckent_nervous_accept');
    expect(mcpContent).toContain('deckent_nervous_reject');
    expect(mcpContent).toContain('deckent_nervous_status');
    expect(mcpContent).toContain('deckent_nervous_config');
  });
});

describe('reference docs drift — cli-command-count sync', () => {
  const cliCommandsContent = readFileSync(CLI_COMMANDS_DOC, 'utf-8');
  const cliContent = readFileSync(CLI_DOC, 'utf-8');

  it('cli-commands.md contains models command', () => {
    expect(cliCommandsContent).toContain('`models`');
    expect(cliCommandsContent).toContain('deckent_models');
  });

  it('cli.md contains models command entry', () => {
    expect(cliContent).toContain('models');
  });

  it('cli-commands.md documents MCP tool parity for models', () => {
    // models row should map to deckent_models MCP tool
    const modelsRow = cliCommandsContent.match(/\| \d+ \| `models` \|[^|]+\| `deckent_models` \|/);
    expect(modelsRow).not.toBeNull();
  });
});

describe('reference docs drift — config-field parity', () => {
  const configContent = readFileSync(CONFIG_DOC, 'utf-8');

  it('config.md documents worker_memory_limit field', () => {
    expect(configContent).toContain('worker_memory_limit');
  });

  it('config.md documents worker_memory_swap field', () => {
    expect(configContent).toContain('worker_memory_swap');
  });

  it('config.md documents dependency_pipeline_enabled field', () => {
    expect(configContent).toContain('dependency_pipeline_enabled');
  });
});

describe('reference docs drift — api.md constants sync', () => {
  const apiContent = readFileSync(API_DOC, 'utf-8');

  it('api.md Memory Limits: BRAIN_TOTAL_LINE_BUDGET matches actual (5000)', () => {
    expect(apiContent).toContain('BRAIN_TOTAL_LINE_BUDGET = 5000');
  });

  it('api.md Memory Limits: MEMORY_MAX_LINES matches actual (1500)', () => {
    expect(apiContent).toContain('MEMORY_MAX_LINES       = 1500');
  });

  it('api.md Memory Limits: MEMORY_DECAY_SPRINTS matches actual (20)', () => {
    expect(apiContent).toContain('MEMORY_DECAY_SPRINTS   = 20');
  });
});
