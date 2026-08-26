// tests/cli/repl/native-transport.test.ts
// Unit tests for:
//   1. resolveNativeProvider — transport resolution (mock path)
//   2. createStreamOutputHandler — fence/segment/flush race-guard
//      Exercises the real segmenter via the native-transport wrapper, hermetically
//      (no Ink, no React, no network, no disk I/O).

import { describe, it, expect, vi } from 'vitest';
import {
  resolveNativeProvider,
  createStreamOutputHandler,
  type Segment,
} from '../../../src/cli/repl/native-transport.js';
import { resolveNativeProvider as resolveNativeProvider__tsm_007 } from "../../../src/cli/repl/native-transport.js";

// ─── resolveNativeProvider — mock path ───────────────────────────────────────

describe('resolveNativeProvider — mock path', () => {
  it('returns a mock adapter when DECKENT_NATIVE_MOCK is set', async () => {
    const events = [[{ type: 'text', text: 'hello' }, { type: 'done' }]];
    const env = { DECKENT_NATIVE_MOCK: JSON.stringify(events) };
    const result = resolveNativeProvider(env, {});

    expect('adapter' in result).toBe(true);
    if (!('adapter' in result)) return;
    expect(result.model).toBe('mock-model');

    // Drain the mock adapter's first turn
    const collected: string[] = [];
    for await (const evt of result.adapter.send([], 'mock-model', [])) {
      if (evt.type === 'text') collected.push(evt.text);
    }
    expect(collected).toEqual(['hello']);
  });

  it('returns ProviderError when no transport is detected', () => {
    const env: Record<string, string | undefined> = {};
    const result = resolveNativeProvider(env, {});
    expect('error' in result).toBe(true);
  });
});

// ─── createStreamOutputHandler — fence/segment/flush race-guard ──────────────

describe('createStreamOutputHandler — fence/segment/flush', () => {
  it('emits completed prose lines immediately on newline', () => {
    const emitted: Segment[] = [];
    const handler = createStreamOutputHandler((seg) => emitted.push(seg));

    handler.feed('hello world\n');
    expect(emitted).toHaveLength(1);
    expect(emitted[0]!.kind).toBe('line');
    expect(emitted[0]!.markdown).toBe('hello world');

    handler.feed('second line\n');
    expect(emitted).toHaveLength(2);
    expect(emitted[1]!.markdown).toBe('second line');
  });

  it('buffers an unclosed fence block and emits it on flush() (the queue/flush race guard)', () => {
    const emitted: Segment[] = [];
    const handler = createStreamOutputHandler((seg) => emitted.push(seg));

    // Simulate: stream opens a code fence but the turn ends before the closing ```
    handler.feed('```typescript\n');
    handler.feed('const x = 1;\n');
    handler.feed('function foo() {\n');

    // Nothing should have been emitted yet — fence is still open
    expect(emitted).toHaveLength(0);
    expect(handler.partial()).toBe('');

    // Turn ends (or tool call interrupts): flush() must emit the buffered block
    handler.flush();

    expect(emitted).toHaveLength(1);
    expect(emitted[0]!.kind).toBe('block');
    expect(emitted[0]!.markdown).toContain('```typescript');
    expect(emitted[0]!.markdown).toContain('const x = 1;');
    expect(emitted[0]!.markdown).toContain('function foo()');
  });

  it('correctly segments a multi-chunk stream with a complete fence block', () => {
    const emitted: Segment[] = [];
    const handler = createStreamOutputHandler((seg) => emitted.push(seg));

    // Chunk 1: prose line + fence opener (split across chunks, as real streaming does)
    handler.feed('Here is some code:\n```js\n');
    expect(emitted).toHaveLength(1);
    expect(emitted[0]!.markdown).toBe('Here is some code:');

    // Chunk 2: code inside the block
    handler.feed('console.log("hi");\n');
    expect(emitted).toHaveLength(1); // block still open

    // Chunk 3: closing fence — block is complete and emitted immediately
    handler.feed('```\n');
    expect(emitted).toHaveLength(2);
    expect(emitted[1]!.kind).toBe('block');
    expect(emitted[1]!.markdown).toContain('```js');
    expect(emitted[1]!.markdown).toContain('console.log("hi");');
    expect(emitted[1]!.markdown).toContain('```');

    // Chunk 4: prose after the block
    handler.feed('Done.\n');
    expect(emitted).toHaveLength(3);
    expect(emitted[2]!.kind).toBe('line');
    expect(emitted[2]!.markdown).toBe('Done.');
  });

  it('flush() on a trailing partial line (no newline) emits the partial as a line', () => {
    const emitted: Segment[] = [];
    const handler = createStreamOutputHandler((seg) => emitted.push(seg));

    handler.feed('partial content without newline');
    expect(emitted).toHaveLength(0);
    expect(handler.partial()).toBe('partial content without newline');

    handler.flush();
    expect(emitted).toHaveLength(1);
    expect(emitted[0]!.kind).toBe('line');
    expect(emitted[0]!.markdown).toBe('partial content without newline');
    expect(handler.partial()).toBe('');
  });

  it('partial() returns only the in-progress line (no newline), not completed lines', () => {
    const emitted: Segment[] = [];
    const handler = createStreamOutputHandler((seg) => emitted.push(seg));

    handler.feed('completed\nin-progress');
    expect(emitted).toHaveLength(1);
    expect(emitted[0]!.markdown).toBe('completed');
    expect(handler.partial()).toBe('in-progress');
  });

  it('flush() after flush() is idempotent (no double-emit)', () => {
    const emitted: Segment[] = [];
    const handler = createStreamOutputHandler((seg) => emitted.push(seg));

    handler.feed('```\ncode\n');
    handler.flush();
    const countAfterFirst = emitted.length;

    handler.flush(); // second flush — nothing buffered, must not re-emit
    expect(emitted).toHaveLength(countAfterFirst);
  });
});

// TSM-007: physically merged from tests/cli/native-transport.test.ts.
{
describe('resolveNativeProvider', () => {
    it('picks the Anthropic adapter when ANTHROPIC_API_KEY is set', () => {
        const r = resolveNativeProvider__tsm_007({ ANTHROPIC_API_KEY: 'sk-ant' }, {});
        expect('adapter' in r).toBe(true);
        if ('adapter' in r) {
            expect(r.adapter.name).toBe('anthropic');
            expect(typeof r.model).toBe('string');
            expect(r.model.length).toBeGreaterThan(0);
        }
    });
    it('picks an OpenAI-compatible adapter for OPENAI_API_KEY', () => {
        const r = resolveNativeProvider__tsm_007({ OPENAI_API_KEY: 'sk-oai' }, {});
        expect('adapter' in r && r.adapter.name).toBe('openai');
    });
    it('picks Ollama when only ollama_host is configured', () => {
        const r = resolveNativeProvider__tsm_007({}, { ollama_host: 'http://127.0.0.1:11434' });
        expect('adapter' in r && r.adapter.name).toBe('ollama');
    });
    it('honors DECKENT_NATIVE_MODEL override', () => {
        const r = resolveNativeProvider__tsm_007({ ANTHROPIC_API_KEY: 'k', DECKENT_NATIVE_MODEL: 'claude-fable-5' }, {});
        expect('adapter' in r && r.model).toBe('claude-fable-5');
    });
    it('returns an honest error (no adapter) when no transport is available', () => {
        const r = resolveNativeProvider__tsm_007({}, {});
        expect('error' in r).toBe(true);
        if ('error' in r)
            expect(r.error).toMatch(/API|yerel|ollama/i);
    });
});
}
