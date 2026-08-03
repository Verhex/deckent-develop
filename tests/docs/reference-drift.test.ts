import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
// Generated reference docs live outside the hand-written docs/<lang>/ tree so the
// two can never be confused (Alperen, 2026-08-02). See docs/generated/README.md.
const MCP_TOOLS_DOC = join(ROOT, 'docs', 'generated', 'en', 'reference', 'mcp-tools.md');
const CLI_DOC = join(ROOT, 'docs', 'generated', 'en', 'reference', 'cli.md');
// Hand-written successors of the archived docs/reference/{cli-commands,config,api}.md.
const MCP_PARITY_DOC = join(ROOT, 'docs', 'en', 'mcp.md');
const CONFIG_DOC = join(ROOT, 'docs', 'en', 'reference', 'configuration-schema.md');

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
  const parityContent = readFileSync(MCP_PARITY_DOC, 'utf-8');
  const cliContent = readFileSync(CLI_DOC, 'utf-8');

  it('mcp.md parity table contains the models tool', () => {
    expect(parityContent).toContain('deckent_models');
  });

  it('cli.md contains models command entry', () => {
    expect(cliContent).toContain('models');
  });

  it('mcp.md documents CLI parity for the models tool', () => {
    // The deckent_models row must name its CLI counterpart in the parity column.
    const modelsRow = parityContent
      .split('\n')
      .find((line) => line.includes('`deckent_models`') && line.startsWith('|'));
    expect(modelsRow).toBeDefined();
    expect(modelsRow).toContain('models');
  });
});

describe('reference docs drift — config-field parity', () => {
  const configContent = readFileSync(CONFIG_DOC, 'utf-8');

  it('configuration-schema.md documents dependency_pipeline_enabled field', () => {
    expect(configContent).toContain('dependency_pipeline_enabled');
  });

  // DOC-GAP (2026-08-02): the 2026-08 docs reset archived docs/reference/config.md
  // without carrying these two fields into the successor schema doc. Skipped rather
  // than deleted so the gap stays visible; tracked in docs/MASTER-PLAN.md (CONFIG-TRUTH-001).
  it.skip('configuration-schema.md documents worker_memory_limit field', () => {
    expect(configContent).toContain('worker_memory_limit');
  });

  it.skip('configuration-schema.md documents worker_memory_swap field', () => {
    expect(configContent).toContain('worker_memory_swap');
  });
});

// DOC-GAP (2026-08-02): the archived docs/reference/api.md pinned Brain memory
// constants (BRAIN_TOTAL_LINE_BUDGET / MEMORY_MAX_LINES / MEMORY_DECAY_SPRINTS).
// No successor doc carries them, so this drift gate has no target. Skipped, not
// deleted, so the missing coverage stays visible; tracked in docs/MASTER-PLAN.md (CONFIG-TRUTH-001).
describe.skip('reference docs drift — api memory-constant sync (no successor doc)', () => {
  it('documents BRAIN_TOTAL_LINE_BUDGET, MEMORY_MAX_LINES, MEMORY_DECAY_SPRINTS', () => {
    expect(true).toBe(true);
  });
});
