import { describe, it, expect } from 'vitest';

import {
  getMcpToolCount,
  DECKENT_MCP_TOOL_COUNT,
} from '../../src/cli/helpers/mcp-attach.js';

describe('getMcpToolCount', () => {
  it('returns a positive number from the tool registry', () => {
    const count = getMcpToolCount();
    expect(typeof count).toBe('number');
    expect(count).toBeGreaterThan(0);
  });

  it('returns the same value as the DECKENT_MCP_TOOL_COUNT re-export', () => {
    expect(getMcpToolCount()).toBe(DECKENT_MCP_TOOL_COUNT);
  });

  it('never throws — graceful when called multiple times', () => {
    expect(() => getMcpToolCount()).not.toThrow();
    expect(() => getMcpToolCount()).not.toThrow();
    const count = getMcpToolCount();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  it('DECKENT_MCP_TOOL_COUNT is a number (backward-compatible re-export)', () => {
    expect(typeof DECKENT_MCP_TOOL_COUNT).toBe('number');
    expect(DECKENT_MCP_TOOL_COUNT).toBeGreaterThan(0);
  });
});
