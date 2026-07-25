import { describe, it, expect } from 'vitest';
import { DECKENT_MCP_INSTRUCTIONS } from '../../src/mcp/server.js';
import { MCP_TOOL_COUNT, TOOL_CATALOG } from '../../src/mcp/tools/index.js';

/**
 * Tests for MCP help.ts tool catalog and server.ts instructions.
 * Count and names derive from the canonical MCP tool catalog.
 */

describe('MCP Server Instructions', () => {
  it('declares the canonical tool count in the instructions header', () => {
    expect(DECKENT_MCP_INSTRUCTIONS).toContain(`## Tools (${MCP_TOOL_COUNT})`);
  });

  it('should list deckent_memory_query in instructions', () => {
    expect(DECKENT_MCP_INSTRUCTIONS).toContain('deckent_memory_query');
  });

  it('should use V2 export paths instead of V1 .md paths in resources', () => {
    // V2 paths should be present
    expect(DECKENT_MCP_INSTRUCTIONS).toContain('exports/memory.md');
    expect(DECKENT_MCP_INSTRUCTIONS).toContain('exports/debt.md');

    // V1 direct references should NOT be present
    expect(DECKENT_MCP_INSTRUCTIONS).not.toMatch(/deckent:\/\/memory — Brain memory \(MEMORY\.md\)/);
    expect(DECKENT_MCP_INSTRUCTIONS).not.toMatch(/deckent:\/\/debt — Technical debt log \(DEBT\.md\)/);
    expect(DECKENT_MCP_INSTRUCTIONS).not.toMatch(/deckent:\/\/retro — Last sprint retrospective \(RETRO\.md\)/);
  });

  it('lists every canonical tool name in instructions', () => {
    for (const tool of TOOL_CATALOG) {
      expect(DECKENT_MCP_INSTRUCTIONS).toContain(tool.name);
    }
    expect(TOOL_CATALOG).toHaveLength(MCP_TOOL_COUNT);
  });

  it('should list all 8 resources in instructions', () => {
    const expectedResources = [
      'deckent://dashboard',
      'deckent://directives',
      'deckent://memory',
      'deckent://debt',
      'deckent://config',
      'deckent://retro',
      'deckent://tasks',
      'deckent://agents',
    ];

    for (const resource of expectedResources) {
      expect(DECKENT_MCP_INSTRUCTIONS).toContain(resource);
    }
    expect(expectedResources).toHaveLength(8);
  });
});
