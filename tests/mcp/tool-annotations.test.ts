import { describe, it, expect } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerPlanTool } from '../../src/mcp/tools/plan.js';
import { registerProcessTool } from '../../src/mcp/tools/process.js';
import { registerNervousTools } from '../../src/mcp/tools/nervous.js';

function captureAnnotations(register: (s: McpServer) => void): Map<string, boolean | undefined> {
  const hints = new Map<string, boolean | undefined>();
  const stub = {
    registerTool: (name: string, config: { annotations?: { readOnlyHint?: boolean } }) => {
      hints.set(name, config.annotations?.readOnlyHint);
      return {};
    },
  } as unknown as McpServer;
  register(stub);
  return hints;
}

describe('tool annotations — truthful write/read classification (MCP-W1)', () => {
  it('deckent_plan is a write tool (readOnlyHint:false — it writes .tasks/)', () => {
    expect(captureAnnotations(registerPlanTool).get('deckent_plan')).toBe(false);
  });

  it('deckent_process is a write tool (readOnlyHint:false)', () => {
    expect(captureAnnotations(registerProcessTool).get('deckent_process')).toBe(false);
  });

  it('nervous sub-tools carry correct read/write hints', () => {
    const hints = captureAnnotations(registerNervousTools);
    expect(hints.get('deckent_nervous_subscribe')).toBe(true);
    expect(hints.get('deckent_nervous_status')).toBe(true);
    expect(hints.get('deckent_nervous_accept')).toBe(false);
    expect(hints.get('deckent_nervous_reject')).toBe(false);
    expect(hints.get('deckent_nervous_config')).toBe(false);
  });
});
