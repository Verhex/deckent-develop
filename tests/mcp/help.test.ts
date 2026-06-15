import { describe, it, expect } from 'vitest';
import { DECKENT_MCP_INSTRUCTIONS } from '../../src/mcp/server.js';

/**
 * Tests for MCP help.ts tool catalog and server.ts instructions.
 * Sprint 189 fix: Updated to reflect 31 tools (watch/feature_query/audit/recover added).
 * Sprint 201 fix: Updated to 32 tools (deckent_models added).
 */

describe('MCP Server Instructions', () => {
  it('should declare 35 tools in the instructions header', () => {
    expect(DECKENT_MCP_INSTRUCTIONS).toContain('## Tools (35)');
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

  it('should list all 32 tool names in instructions', () => {
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
      'deckent_watch',
      'deckent_nervous_subscribe',
      'deckent_nervous_accept',
      'deckent_nervous_reject',
      'deckent_nervous_status',
      'deckent_nervous_config',
      'deckent_feature_query',
      'deckent_audit',
      'deckent_recover',
      'deckent_models',
    ];

    for (const tool of expectedTools) {
      expect(DECKENT_MCP_INSTRUCTIONS).toContain(tool);
    }
    expect(expectedTools).toHaveLength(32);
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
