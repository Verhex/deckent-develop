// tests/agent/transcript.test.ts
import { describe, it, expect } from 'vitest';
import { Transcript } from '../../src/agent/transcript.js';

describe('Transcript', () => {
  it('builds a user → assistant(+toolCalls) → tool-result sequence (§13)', () => {
    const t = new Transcript();
    t.appendUser('read x');
    t.appendAssistant('sure', [{ id: 'tc1', name: 'read_file', args: { path: 'x' } }]);
    t.appendToolResult('tc1', 'FILE BODY');
    expect(t.toProviderMessages()).toEqual([
      { role: 'user', content: 'read x' },
      { role: 'assistant', content: 'sure', toolCalls: [{ id: 'tc1', name: 'read_file', args: { path: 'x' } }] },
      { role: 'tool', content: 'FILE BODY', toolCallId: 'tc1' },
    ]);
  });

  it('omits toolCalls on a plain assistant turn', () => {
    const t = new Transcript();
    t.appendUser('hi');
    t.appendAssistant('hello');
    const msgs = t.toProviderMessages();
    expect(msgs[1]).toEqual({ role: 'assistant', content: 'hello' });
    expect('toolCalls' in msgs[1]!).toBe(false);
  });

  it('toProviderMessages returns copies (callers cannot mutate internal state)', () => {
    const t = new Transcript();
    t.appendUser('hi');
    const a = t.toProviderMessages();
    a[0]!.content = 'MUTATED';
    expect(t.toProviderMessages()[0]!.content).toBe('hi');
  });
});
