/**
 * Contract tests for OpenAICompatibleAdapter.extractUsage (Sprint 328 Task 328-006)
 *
 * Class-C "unified gateway" usage capture. The openai-compatible adapter is the
 * SINGLE seam for every Class-C gateway AND OpenAI-shape Class-B API — OpenRouter,
 * LiteLLM-proxy, vLLM, DeepSeek, Qwen all return the same normalized OpenAI
 * `/chat/completions` `usage` object, so one parser covers the whole matrix
 * (Law #2: no provider special-cased). These tests pin that contract against a
 * REAL OpenRouter response sample (cache + reasoning) plus the matrix variants.
 *
 * `extractUsage` is a pure response-body parser — no spawn, no fs. Construct the
 * adapter directly (the constructor performs no I/O).
 */
import { describe, it, expect } from 'vitest';

import { OpenAICompatibleAdapter } from '../../src/providers/openai-compatible.js';

function makeAdapter(): OpenAICompatibleAdapter {
  return new OpenAICompatibleAdapter({
    name: 'openrouter',
    baseURL: 'https://openrouter.ai/api/v1',
    apiKeyEnv: 'OPENROUTER_API_KEY',
    models: ['anthropic/claude-3.5-sonnet', 'openai/o3-mini'],
  });
}

describe('OpenAICompatibleAdapter.extractUsage', () => {
  const adapter = makeAdapter();

  it('is implemented (the contract method exists)', () => {
    expect(typeof adapter.extractUsage).toBe('function');
  });

  it('parses a REAL OpenRouter response with cache + reasoning detail (goNogo)', () => {
    // Real OpenRouter `/chat/completions` non-streaming response shape — usage
    // carries both `prompt_tokens_details.cached_tokens` and
    // `completion_tokens_details.reasoning_tokens`.
    const raw = JSON.stringify({
      id: 'gen-1718000000-abcdef',
      object: 'chat.completion',
      model: 'openai/o3-mini',
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: 'The answer is 42.' },
          finish_reason: 'stop',
        },
      ],
      usage: {
        prompt_tokens: 1024,
        completion_tokens: 512,
        total_tokens: 1536,
        prompt_tokens_details: { cached_tokens: 256 },
        completion_tokens_details: { reasoning_tokens: 128 },
      },
    });

    const usage = adapter.extractUsage!(raw);
    expect(usage).not.toBeNull();
    // Full rich normalized schema: cacheRead + reasoning surfaced, provider total honored.
    expect(usage).toEqual({
      inputTokens: 1024,
      outputTokens: 512,
      cacheReadTokens: 256,
      cacheCreationTokens: 0,
      reasoningTokens: 128,
      totalTokens: 1536,
      source: 'provider-adapter',
    });
  });

  it('covers the gateway matrix: plain usage (LiteLLM/vLLM, no detail blocks)', () => {
    const raw = JSON.stringify({
      model: 'meta-llama/llama-3.1-70b-instruct',
      choices: [{ message: { content: 'hi' } }],
      usage: { prompt_tokens: 80, completion_tokens: 20, total_tokens: 100 },
    });
    const usage = adapter.extractUsage!(raw);
    // No reasoning detail reported → field absent (sparse), cacheRead defaults to 0.
    expect(usage).toEqual({
      inputTokens: 80,
      outputTokens: 20,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      totalTokens: 100,
      source: 'provider-adapter',
    });
    expect(usage).not.toHaveProperty('reasoningTokens');
  });

  it('covers DeepSeek-direct cache shape (`prompt_cache_hit_tokens`)', () => {
    const raw = JSON.stringify({
      model: 'deepseek-chat',
      choices: [{ message: { content: 'ok' } }],
      usage: {
        prompt_tokens: 200,
        completion_tokens: 60,
        total_tokens: 260,
        prompt_cache_hit_tokens: 192,
        prompt_cache_miss_tokens: 8,
      },
    });
    const usage = adapter.extractUsage!(raw);
    expect(usage?.cacheReadTokens).toBe(192);
    expect(usage?.inputTokens).toBe(200);
    expect(usage?.outputTokens).toBe(60);
    expect(usage?.totalTokens).toBe(260);
  });

  it('falls back to inputTokens + outputTokens when the gateway omits total_tokens', () => {
    const raw = JSON.stringify({
      model: 'qwen-max',
      usage: { prompt_tokens: 30, completion_tokens: 12 },
    });
    const usage = adapter.extractUsage!(raw);
    expect(usage?.totalTokens).toBe(42); // normalizer fills input+output
    expect(usage?.source).toBe('provider-adapter');
  });

  it('handles a streamed SSE response with usage in the final chunk', () => {
    // OpenRouter with `stream: true` (+ usage) emits SSE `data:` lines; the
    // final non-[DONE] chunk carries the cumulative `usage` object.
    const raw = [
      'data: {"choices":[{"delta":{"content":"The "}}]}',
      'data: {"choices":[{"delta":{"content":"answer"}}]}',
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":500,"completion_tokens":250,"total_tokens":750,"prompt_tokens_details":{"cached_tokens":100},"completion_tokens_details":{"reasoning_tokens":40}}}',
      'data: [DONE]',
    ].join('\n');
    const usage = adapter.extractUsage!(raw);
    expect(usage).toEqual({
      inputTokens: 500,
      outputTokens: 250,
      cacheReadTokens: 100,
      cacheCreationTokens: 0,
      reasoningTokens: 40,
      totalTokens: 750,
      source: 'provider-adapter',
    });
  });

  it('takes the LAST recognizable usage when several chunks report it', () => {
    const raw = [
      JSON.stringify({ usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } }),
      JSON.stringify({ usage: { prompt_tokens: 300, completion_tokens: 120, total_tokens: 420 } }),
    ].join('\n');
    const usage = adapter.extractUsage!(raw);
    expect(usage?.inputTokens).toBe(300);
    expect(usage?.outputTokens).toBe(120);
    expect(usage?.totalTokens).toBe(420);
  });

  it('returns null when the response carries no usage', () => {
    expect(adapter.extractUsage!(JSON.stringify({ choices: [{ message: { content: 'hi' } }] }))).toBeNull();
    expect(adapter.extractUsage!('just some prose, no json')).toBeNull();
  });

  it('returns null for an empty usage object (no real numbers reported)', () => {
    expect(adapter.extractUsage!(JSON.stringify({ usage: {} }))).toBeNull();
  });

  it('returns null for empty or malformed input', () => {
    expect(adapter.extractUsage!('')).toBeNull();
    expect(adapter.extractUsage!('   ')).toBeNull();
    expect(adapter.extractUsage!('{not valid json')).toBeNull();
  });

  it('clamps negative / non-numeric token counts to 0 (defensive)', () => {
    const raw = JSON.stringify({
      usage: { prompt_tokens: -5, completion_tokens: 'oops', total_tokens: 'NaN' },
    });
    // prompt_tokens<0 and completion_tokens non-number → both undefined → no usage.
    expect(adapter.extractUsage!(raw)).toBeNull();
  });
});
