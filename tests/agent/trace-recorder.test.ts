// tests/agent/trace-recorder.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { toTrainingExample, appendTrace } from '../../src/agent/trace-recorder.js';
import type { ProviderMessage } from '../../src/agent/provider-tooluse/types.js';

const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

const convo: ProviderMessage[] = [
  { role: 'user', content: 'read x' },
  { role: 'assistant', content: 'ok', toolCalls: [{ id: 'c1', name: 'deckent_read_file', args: { path: 'x' } }] },
  { role: 'tool', content: 'BODY', toolCallId: 'c1' },
  { role: 'assistant', content: 'done' },
];

describe('toTrainingExample', () => {
  it('maps a ProviderMessage[] + system into OpenAI-messages shape (tool_calls arguments are a JSON string)', () => {
    const ex = toTrainingExample('SYS', convo, { source: 'native-repl', model: 'm', ts: 'T' });
    expect(ex.messages[0]).toEqual({ role: 'system', content: 'SYS' });
    expect(ex.messages[2]).toEqual({
      role: 'assistant', content: 'ok',
      tool_calls: [{ id: 'c1', type: 'function', function: { name: 'deckent_read_file', arguments: '{"path":"x"}' } }],
    });
    expect(ex.messages[3]).toEqual({ role: 'tool', tool_call_id: 'c1', content: 'BODY' });
    expect(ex.messages[4]).toEqual({ role: 'assistant', content: 'done' });
    expect(ex.meta).toEqual({ source: 'native-repl', model: 'm', ts: 'T' });
  });
  it('omits tool_calls on a plain assistant message', () => {
    const ex = toTrainingExample('S', [{ role: 'assistant', content: 'hi' }], { source: 'x', model: 'm', ts: 'T' });
    expect('tool_calls' in (ex.messages[1] as object)).toBe(false);
  });
});

describe('appendTrace', () => {
  it('appends one JSON line per call (valid JSONL)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'trace-')); dirs.push(dir);
    const f = join(dir, 's.jsonl');
    appendTrace(f, toTrainingExample('S', convo, { source: 'native-repl', model: 'm', ts: 'T1' }));
    appendTrace(f, toTrainingExample('S', convo, { source: 'native-repl', model: 'm', ts: 'T2' }));
    const lines = readFileSync(f, 'utf-8').trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]!).meta.ts).toBe('T1');
    expect(JSON.parse(lines[1]!).meta.ts).toBe('T2');
  });
});
