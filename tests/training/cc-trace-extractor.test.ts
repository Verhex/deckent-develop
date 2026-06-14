// tests/training/cc-trace-extractor.test.ts
import { describe, it, expect } from 'vitest';
import { mapToolName, extractFromSession } from '../../src/training/cc-trace-extractor.js';

const SYS = 'DECKENT-SYS';
function line(o: unknown): string { return JSON.stringify(o); }

describe('mapToolName', () => {
  it('remaps core-4 to deckent native names; returns null for non-mappable', () => {
    expect(mapToolName('Read')).toBe('deckent_read_file');
    expect(mapToolName('Bash')).toBe('deckent_bash');
    expect(mapToolName('Edit')).toBe('deckent_edit_file');
    expect(mapToolName('Write')).toBe('deckent_write_file');
    expect(mapToolName('Agent')).toBeNull();
    expect(mapToolName('mcp__x__y')).toBeNull();
  });
});

describe('extractFromSession', () => {
  const coreSession = [
    line({ type: 'user', message: { role: 'user', content: [{ type: 'text', text: 'read x' }] } }),
    line({ type: 'assistant', message: { role: 'assistant', content: [
      { type: 'thinking', text: 'hmm' },
      { type: 'text', text: 'Reading.' },
      { type: 'tool_use', id: 't1', name: 'Read', input: { file_path: 'x' } },
    ] } }),
    line({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: 'BODY' }] } }),
    line({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'Done.' }] } }),
  ];

  it('aligned: remaps core-4, drops thinking, builds one example with the deckent system', () => {
    const { aligned } = extractFromSession(coreSession, SYS);
    expect(aligned).toHaveLength(1);
    const m = aligned[0]!.messages;
    expect(m[0]).toEqual({ role: 'system', content: SYS });
    expect(m[1]).toEqual({ role: 'user', content: 'read x' });
    expect(m[2]).toEqual({
      role: 'assistant', content: 'Reading.',
      tool_calls: [{ id: 't1', type: 'function', function: { name: 'deckent_read_file', arguments: '{"file_path":"x"}' } }],
    });
    expect(m[3]).toEqual({ role: 'tool', tool_call_id: 't1', content: 'BODY' });
    expect(m[4]).toEqual({ role: 'assistant', content: 'Done.' });
  });

  it('aligned EXCLUDES an example that uses a non-mappable tool; general KEEPS it (name as-is)', () => {
    const mixed = [
      line({ type: 'user', message: { role: 'user', content: [{ type: 'text', text: 'dispatch' }] } }),
      line({ type: 'assistant', message: { role: 'assistant', content: [
        { type: 'tool_use', id: 'a1', name: 'Agent', input: { task: 'go' } },
      ] } }),
      line({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'a1', content: 'RESULT' }] } }),
      line({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'ok' }] } }),
    ];
    const { aligned, general } = extractFromSession(mixed, SYS);
    expect(aligned).toHaveLength(0);
    expect(general).toHaveLength(1);
    const g = general[0]!.messages.find((x) => x.role === 'assistant' && x.tool_calls);
    expect(g!.tool_calls![0]!.function.name).toBe('Agent');
  });

  it('segments multiple real-user turns into separate examples', () => {
    const two = [
      line({ type: 'user', message: { role: 'user', content: [{ type: 'text', text: 'first' }] } }),
      line({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'a1' }] } }),
      line({ type: 'user', message: { role: 'user', content: [{ type: 'text', text: 'second' }] } }),
      line({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'a2' }] } }),
    ];
    const { general } = extractFromSession(two, SYS);
    expect(general).toHaveLength(2);
    expect(general[0]!.messages.map((m) => m.content)).toEqual([SYS, 'first', 'a1']);
    expect(general[1]!.messages.map((m) => m.content)).toEqual([SYS, 'second', 'a2']);
  });

  it('skips meta lines and malformed JSON without throwing', () => {
    const noisy = [
      line({ type: 'file-history-snapshot', foo: 1 }),
      '{ broken json',
      line({ type: 'user', message: { role: 'user', content: [{ type: 'text', text: 'hi' }] } }),
      line({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'yo' }] } }),
    ];
    const { general } = extractFromSession(noisy, SYS);
    expect(general).toHaveLength(1);
    expect(general[0]!.messages.map((m) => m.content)).toEqual([SYS, 'hi', 'yo']);
  });
});
