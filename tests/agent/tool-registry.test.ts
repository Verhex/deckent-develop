import { describe, it, expect } from 'vitest';
import { ToolRegistry } from '../../src/agent/tools/registry.js';
import type { ToolDefinition } from '../../src/agent/tools/types.js';

const mk = (name: string, over: Partial<ToolDefinition> = {}): ToolDefinition => ({
  name,
  description: `${name} tool`,
  inputSchema: { type: 'object', properties: {} },
  category: 'coding',
  tier: 'confirm',
  source: 'builtin',
  handler: async () => ({ ok: true, output: '' }),
  ...over,
});

describe('ToolRegistry', () => {
  it('registers and gets a tool by name', () => {
    const r = new ToolRegistry();
    r.register(mk('read_file'));
    expect(r.get('read_file')?.name).toBe('read_file');
    expect(r.get('missing')).toBeUndefined();
  });
  it('throws on invalid definition', () => {
    const r = new ToolRegistry();
    expect(() => r.register(mk('', {}))).toThrow(/name/);
  });
  it('last-write-wins on duplicate name', () => {
    const r = new ToolRegistry();
    r.register(mk('bash', { description: 'first' }));
    r.register(mk('bash', { description: 'second' }));
    expect(r.list()).toHaveLength(1);
    expect(r.get('bash')?.description).toBe('second');
  });
  it('toNativeSchemas maps to provider tool_use shape', () => {
    const r = new ToolRegistry();
    r.register(mk('grep', { description: 'search', inputSchema: { type: 'object', properties: { q: { type: 'string' } } } }));
    expect(r.toNativeSchemas()).toEqual([
      { name: 'grep', description: 'search', input_schema: { type: 'object', properties: { q: { type: 'string' } } } },
    ]);
  });
});
