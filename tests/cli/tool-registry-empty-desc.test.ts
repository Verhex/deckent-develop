// tests/cli/tool-registry-empty-desc.test.ts
// born-552: MCP-TOOL-EMPTY-DESC — a connected MCP server reporting `description: ''`
// (empty string, not undefined) used to throw inside buildNativeToolRegistry
// (ToolRegistry.register -> validateToolDefinition requires a non-empty, post-trim
// description), crashing REPL launch. Fixed by treating a blank/whitespace-only
// description the same as a missing one (fallback text), never a hard requirement.
import { describe, it, expect } from 'vitest';
import { tmpdir } from 'node:os';
import { buildNativeToolRegistry } from '../../src/cli/repl/native-tool-registry.js';

function bridgeWithDescriptor(description: string | undefined) {
  return {
    listTools: () => [
      {
        namespacedName: 'srv__blank',
        descriptor: { description, inputSchema: { type: 'object', properties: {} } },
      },
    ],
    dispatch: async () => ({ ok: true, output: 'ok' }),
  };
}

describe('buildNativeToolRegistry — MCP tool with empty-string description', () => {
  it('registers without throwing when descriptor.description is an empty string (REPL launch survives)', () => {
    expect(() =>
      buildNativeToolRegistry({ cwd: () => tmpdir(), mcpBridge: bridgeWithDescriptor('') }),
    ).not.toThrow();
  });

  it('falls back to "MCP tool <namespacedName>" for an empty-string description', () => {
    const reg = buildNativeToolRegistry({ cwd: () => tmpdir(), mcpBridge: bridgeWithDescriptor('') });
    expect(reg.get('srv__blank')!.description).toBe('MCP tool srv__blank');
  });

  it('falls back for a whitespace-only description too (matches validateToolDefinition trim semantics)', () => {
    const reg = buildNativeToolRegistry({ cwd: () => tmpdir(), mcpBridge: bridgeWithDescriptor('   ') });
    expect(reg.get('srv__blank')!.description).toBe('MCP tool srv__blank');
  });

  it('falls back when descriptor.description is entirely absent (undefined) — pre-existing path stays intact', () => {
    const reg = buildNativeToolRegistry({ cwd: () => tmpdir(), mcpBridge: bridgeWithDescriptor(undefined) });
    expect(reg.get('srv__blank')!.description).toBe('MCP tool srv__blank');
  });

  it('passes a normal non-empty description through unchanged (no behavior change for the happy path)', () => {
    const reg = buildNativeToolRegistry({ cwd: () => tmpdir(), mcpBridge: bridgeWithDescriptor('does the thing') });
    expect(reg.get('srv__blank')!.description).toBe('does the thing');
  });
});
