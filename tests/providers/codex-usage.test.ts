import { describe, it, expect, beforeEach } from 'vitest';
import { tmpdir } from 'node:os';
import { CodexAdapter } from '../../src/providers/codex.js';

// `extractUsage` is a pure stdout parser — no spawn, no fs. Construct the
// adapter directly against a tmpdir (the constructor performs no I/O).

describe('CodexAdapter.extractUsage', () => {
  let adapter: CodexAdapter;

  beforeEach(() => {
    adapter = new CodexAdapter(tmpdir());
  });

  it('is implemented (pre-fix the adapter had no extractUsage)', () => {
    expect(typeof adapter.extractUsage).toBe('function');
  });

  it('parses an OpenAI Chat Completions usage object → real tokens (goNogo)', () => {
    const raw = JSON.stringify({
      id: 'chatcmpl-abc',
      model: 'gpt-5',
      usage: {
        prompt_tokens: 1200,
        completion_tokens: 340,
        total_tokens: 1540,
        prompt_tokens_details: { cached_tokens: 800 },
      },
    });
    const usage = adapter.extractUsage(raw);
    expect(usage).not.toBeNull();
    expect(usage).toEqual({
      inputTokens: 1200,
      outputTokens: 340,
      cacheReadTokens: 800,
      cacheCreationTokens: 0,
      totalTokens: 1540,
      source: 'provider-adapter',
    });
  });

  it('parses a Codex token_count NDJSON event stream', () => {
    const raw = [
      JSON.stringify({ type: 'task_started' }),
      JSON.stringify({ type: 'agent_message', message: 'done' }),
      JSON.stringify({
        type: 'token_count',
        info: {
          total_token_usage: {
            input_tokens: 2048,
            cached_input_tokens: 512,
            output_tokens: 256,
            reasoning_output_tokens: 64,
            total_tokens: 2304,
          },
        },
      }),
    ].join('\n');
    const usage = adapter.extractUsage(raw);
    expect(usage).toEqual({
      inputTokens: 2048,
      outputTokens: 256,
      cacheReadTokens: 512,
      cacheCreationTokens: 0,
      totalTokens: 2304,
      source: 'provider-adapter',
    });
  });

  it('takes the LAST cumulative token_count when several appear', () => {
    const raw = [
      JSON.stringify({ type: 'token_count', info: { total_token_usage: { input_tokens: 100, output_tokens: 50, total_tokens: 150 } } }),
      JSON.stringify({ type: 'token_count', info: { total_token_usage: { input_tokens: 300, output_tokens: 120, total_tokens: 420 } } }),
    ].join('\n');
    const usage = adapter.extractUsage(raw);
    expect(usage?.inputTokens).toBe(300);
    expect(usage?.outputTokens).toBe(120);
    expect(usage?.totalTokens).toBe(420);
  });

  it('accepts a token_count event nested under msg.info and computes total when absent', () => {
    const raw = JSON.stringify({
      id: 'evt',
      msg: { type: 'token_count', info: { total_token_usage: { input_tokens: 10, output_tokens: 4 } } },
    });
    const usage = adapter.extractUsage(raw);
    expect(usage?.inputTokens).toBe(10);
    expect(usage?.outputTokens).toBe(4);
    expect(usage?.totalTokens).toBe(14); // input+output when provider omits total
    expect(usage?.source).toBe('provider-adapter');
  });

  it('returns null when the output carries no usage', () => {
    expect(adapter.extractUsage('just some agent prose, no json here')).toBeNull();
    expect(
      adapter.extractUsage(JSON.stringify({ type: 'agent_message', message: 'hello' })),
    ).toBeNull();
  });

  it('returns null for empty or malformed input', () => {
    expect(adapter.extractUsage('')).toBeNull();
    expect(adapter.extractUsage('   ')).toBeNull();
    expect(adapter.extractUsage('{not valid json')).toBeNull();
  });

  it('ignores an empty usage object (no real numbers reported)', () => {
    expect(adapter.extractUsage(JSON.stringify({ usage: {} }))).toBeNull();
  });
});
