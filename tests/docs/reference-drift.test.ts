import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const MCP_TOOLS_DOC = join(ROOT, 'docs', 'reference', 'mcp-tools.md');
const CLI_COMMANDS_DOC = join(ROOT, 'docs', 'reference', 'cli-commands.md');
const CLI_DOC = join(ROOT, 'docs', 'reference', 'cli.md');
const CONFIG_DOC = join(ROOT, 'docs', 'reference', 'config.md');
const API_DOC = join(ROOT, 'docs', 'reference', 'api.md');

describe('reference docs drift — mcp-tool-count sync', () => {
  const mcpContent = readFileSync(MCP_TOOLS_DOC, 'utf-8');

  it('mcp-tools.md claims 32 tools (includes deckent_models added Sprint 190)', () => {
    expect(mcpContent).toMatch(/32 tools registered/);
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
