import { describe, it, expect } from 'vitest';
import { isTerminalEvent, type AgentEvent } from '../../src/agent/events.js';

describe('AgentEvent', () => {
  it('isTerminalEvent is true for turn-end and error', () => {
    expect(isTerminalEvent({ type: 'turn-end' })).toBe(true);
    expect(isTerminalEvent({ type: 'error', message: 'x' })).toBe(true);
  });
  it('isTerminalEvent is false for streaming/intermediate events', () => {
    const events: AgentEvent[] = [
      { type: 'text-delta', text: 'hi' },
      { type: 'tool-proposed', id: 't0', tool: 'write_file', args: {} },
      { type: 'permission-request', id: 't0', tool: 'write_file', resource: 'src/x.ts', tier: 'confirm' },
      { type: 'tool-executing', id: 't0', tool: 'write_file' },
      { type: 'tool-result', id: 't0', tool: 'write_file', ok: true, output: 'done' },
      { type: 'usage', inputTokens: 10, outputTokens: 2 },
    ];
    for (const e of events) expect(isTerminalEvent(e)).toBe(false);
  });
});
