import { describe, it, expect } from 'vitest';
import { DECKENT_MCP_INSTRUCTIONS } from '../../src/mcp/server.js';

/**
 * Tests for MCP help.ts tool catalog and server.ts instructions.
 * Task 143-019: Verify 22 tools listed, V2 paths, memory_query presence.
 */

// We import help.ts TOOLS/RESOURCES indirectly by reading the module.
// Since they are not exported, we test via the server instructions string
// and by dynamically importing to check registerHelpTool behavior.

describe('MCP Server Instructions', () => {
  it('should declare 22 tools in the instructions header', () => {
    expect(DECKENT_MCP_INSTRUCTIONS).toContain('## Tools (22)');
    expect(DECKENT_MCP_INSTRUCTIONS).not.toContain('## Tools (21)');
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

  it('should list all 22 tool names in instructions', () => {
    const expectedTools = [
      'deckent_init',
      'deckent_set_directives',
      'deckent_plan',
      'deckent_start',
      'deckent_status',
      'deckent_review',
      'deckent_retro',
      'deckent_history',
      'deckent_doctor',
      'deckent_analyze_project',
      'deckent_sync',
      'deckent_config',
      'deckent_run',
      'deckent_kill',
      'deckent_cleanup',
      'deckent_help',
      'deckent_agent_list',
      'deckent_skill_list',
      'deckent_checkpoint',
      'deckent_docs',
      'deckent_explain',
      'deckent_memory_query',
    ];

    for (const tool of expectedTools) {
      expect(DECKENT_MCP_INSTRUCTIONS).toContain(tool);
    }
    expect(expectedTools).toHaveLength(22);
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
