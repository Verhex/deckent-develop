import { describe, it, expect, beforeEach } from 'vitest';
import { McpToolRegistry } from '../../src/mcp-client/registry.js';
import type { McpToolDescriptor } from '../../src/mcp-client/types.js';

const makeTools = (names: string[]): McpToolDescriptor[] =>
  names.map((name) => ({ name, description: `tool ${name}` }));

describe('McpToolRegistry', () => {
  let registry: McpToolRegistry;

  beforeEach(() => {
    registry = new McpToolRegistry();
  });

  it('registers tools with namespaced keys (server__tool)', () => {
    registry.register('filesystem', makeTools(['read_file', 'write_file']));

    const all = registry.list();
    expect(all).toHaveLength(2);
    expect(all.map((e) => e.namespacedName)).toEqual([
      'filesystem__read_file',
      'filesystem__write_file',
    ]);
    expect(all[0].server).toBe('filesystem');
    expect(all[0].tool).toBe('read_file');
  });

  it('resolve returns correct { server, tool } for a namespaced name', () => {
    registry.register('github', makeTools(['create_issue', 'list_prs']));

    const result = registry.resolve('github__create_issue');
    expect(result).toEqual({ server: 'github', tool: 'create_issue' });

    const result2 = registry.resolve('github__list_prs');
    expect(result2).toEqual({ server: 'github', tool: 'list_prs' });
  });

  it('resolve returns undefined for unknown namespaced name (no clash with deckent tools)', () => {
    registry.register('filesystem', makeTools(['read_file']));

    // Unknown server
    expect(registry.resolve('deckent__memory_query')).toBeUndefined();
    // Missing separator
    expect(registry.resolve('filesystem_read_file')).toBeUndefined();
    // Known server but unregistered tool
    expect(registry.resolve('filesystem__nonexistent')).toBeUndefined();
    // Completely unknown
    expect(registry.resolve('unknown__tool')).toBeUndefined();
  });

  it('register is idempotent on refresh — second call replaces old entries', () => {
    registry.register('myserver', makeTools(['tool_a', 'tool_b']));
    expect(registry.size).toBe(2);

    // Simulate reconnect: server now exposes different set
    registry.register('myserver', makeTools(['tool_b', 'tool_c']));
    expect(registry.size).toBe(2);

    const names = registry.list().map((e) => e.namespacedName);
    expect(names).toContain('myserver__tool_b');
    expect(names).toContain('myserver__tool_c');
    expect(names).not.toContain('myserver__tool_a');
  });

  it('multi-server tools do not clash with each other', () => {
    registry.register('serverA', makeTools(['read']));
    registry.register('serverB', makeTools(['read']));

    expect(registry.size).toBe(2);
    expect(registry.resolve('serverA__read')).toEqual({ server: 'serverA', tool: 'read' });
    expect(registry.resolve('serverB__read')).toEqual({ server: 'serverB', tool: 'read' });
  });

  it('clear removes only the specified server entries', () => {
    registry.register('serverA', makeTools(['tool1']));
    registry.register('serverB', makeTools(['tool2']));
    expect(registry.size).toBe(2);

    registry.clear('serverA');
    expect(registry.size).toBe(1);
    expect(registry.resolve('serverA__tool1')).toBeUndefined();
    expect(registry.resolve('serverB__tool2')).toEqual({ server: 'serverB', tool: 'tool2' });
  });

  it('listForServer returns only tools for that server', () => {
    registry.register('serverA', makeTools(['t1', 't2']));
    registry.register('serverB', makeTools(['t3']));

    const forA = registry.listForServer('serverA');
    expect(forA).toHaveLength(2);
    expect(forA.every((e) => e.server === 'serverA')).toBe(true);
  });

  it('handles tool names containing underscores correctly', () => {
    registry.register('myserver', makeTools(['my_complex_tool_name']));
    const result = registry.resolve('myserver__my_complex_tool_name');
    expect(result).toEqual({ server: 'myserver', tool: 'my_complex_tool_name' });
  });
});
