import { describe, it, expect } from 'vitest';
import { validateToolDefinition, type ToolDefinition } from '../../src/agent/tools/types.js';

const valid: ToolDefinition = {
  name: 'write_file',
  description: 'Write a file to disk',
  inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
  category: 'coding',
  tier: 'confirm',
  source: 'builtin',
  handler: async () => ({ ok: true, output: 'done' }),
};

describe('validateToolDefinition', () => {
  it('returns null for a well-formed definition', () => {
    expect(validateToolDefinition(valid)).toBeNull();
  });
  it('rejects empty name', () => {
    expect(validateToolDefinition({ ...valid, name: '' })).toMatch(/name/);
  });
  it('rejects unknown tier', () => {
    expect(validateToolDefinition({ ...valid, tier: 'nope' as never })).toMatch(/tier/);
  });
  it('rejects non-object inputSchema', () => {
    expect(validateToolDefinition({ ...valid, inputSchema: null as never })).toMatch(/inputSchema/);
  });
  it('rejects missing handler', () => {
    expect(validateToolDefinition({ ...valid, handler: undefined as never })).toMatch(/handler/);
  });
});
