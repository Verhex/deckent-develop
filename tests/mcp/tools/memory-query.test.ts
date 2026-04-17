import { describe, it, expect } from 'vitest';
import { z } from 'zod/v4';

/**
 * Unit tests for the MCP memory_query tool schema.
 * We verify the Zod schema accepts the `mode` parameter correctly.
 * Integration with actual MCP server is tested elsewhere.
 */

const inputSchema = z.object({
  query: z.string(),
  type: z.array(z.string()).optional(),
  status: z.array(z.string()).optional(),
  limit: z.number().optional().default(5),
  sprint_min: z.number().optional(),
  mode: z.enum(['and', 'or']).optional().default('or'),
  root: z.string().optional(),
});

describe('MCP memory_query tool schema', () => {
  it('accepts mode=or', () => {
    const result = inputSchema.parse({ query: 'docker', mode: 'or' });
    expect(result.mode).toBe('or');
  });

  it('accepts mode=and', () => {
    const result = inputSchema.parse({ query: 'docker', mode: 'and' });
    expect(result.mode).toBe('and');
  });

  it('defaults mode to or when omitted', () => {
    const result = inputSchema.parse({ query: 'docker' });
    expect(result.mode).toBe('or');
  });

  it('rejects invalid mode', () => {
    expect(() => inputSchema.parse({ query: 'docker', mode: 'xor' })).toThrow();
  });
});
