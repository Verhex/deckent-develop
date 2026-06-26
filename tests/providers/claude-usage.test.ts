import { describe, it, expect, beforeEach } from 'vitest';
import { tmpdir } from 'node:os';
import { ClaudeAdapter } from '../../src/providers/claude.js';
import { CLAUDE_SUBPROCESS_CONFIG } from '../../src/providers/subprocess.js';

// `extractUsage` is a pure stdout parser — no spawn, no fs. The ClaudeAdapter
// constructor performs no I/O for the default (tmux) backend, so we can build it
// directly against a tmpdir.
//
// Fixture below is the REAL envelope captured from a live
// `claude -p - --output-format json --allowedTools Write --dangerously-skip-permissions`
// proof-of-function run (claude 2.1.169, Sprint 328) — faithful shape, not invented.
const REAL_ENVELOPE = JSON.stringify({
  type: 'result',
  subtype: 'success',
  is_error: false,
  num_turns: 2,
  result: 'Done.',
  session_id: '236011ea-5dd5-461d-8f9e-fb02d71d2c2c',
  total_cost_usd: 0.014330450000000002,
  usage: {
    input_tokens: 16,
    cache_creation_input_tokens: 6893,
    cache_read_input_tokens: 41232,
    output_tokens: 206,
    server_tool_use: { web_search_requests: 0, web_fetch_requests: 0 },
    service_tier: 'standard',
    cache_creation: { ephemeral_1h_input_tokens: 6893, ephemeral_5m_input_tokens: 0 },
  },
  modelUsage: {
    'claude-haiku-4-5-20251001': { inputTokens: 452, outputTokens: 54, costUSD: 0.01433045 },
  },
});

describe('ClaudeAdapter.extractUsage', () => {
  let adapter: ClaudeAdapter;

  beforeEach(() => {
    adapter = new ClaudeAdapter(tmpdir());
  });

  it('is implemented (pre-fix the adapter had no extractUsage)', () => {
    expect(typeof adapter.extractUsage).toBe('function');
  });

  it('parses the REAL --output-format json envelope → real tokens (goNogo)', () => {
    const usage = adapter.extractUsage(REAL_ENVELOPE);
    expect(usage).not.toBeNull();
    // cache_creation maps to BOTH cacheCreationTokens and cacheWriteTokens.
    expect(usage).toEqual({
      inputTokens: 16,
      outputTokens: 206,
      cacheReadTokens: 41232,
      cacheCreationTokens: 6893,
      cacheWriteTokens: 6893,
      totalTokens: 222, // input + output when the envelope reports no explicit total
      source: 'provider-adapter',
    });
  });

  it('maps a no-cache envelope without emitting sparse cache-write/reasoning fields', () => {
    const raw = JSON.stringify({
      type: 'result',
      result: 'ok',
      usage: { input_tokens: 100, output_tokens: 50 },
    });
    expect(adapter.extractUsage(raw)).toEqual({
      inputTokens: 100,
      outputTokens: 50,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      totalTokens: 150,
      source: 'provider-adapter',
    });
  });

  it('extracts the envelope even when stderr/prose lines precede it in the log', () => {
    // The subprocess backend funnels stdout AND stderr into the same log fd, so
    // the envelope may be preceded by non-JSON noise.
    const raw = [
      'warning: some stderr noise from the CLI',
      'plain agent prose that is not json',
      REAL_ENVELOPE,
    ].join('\n');
    const usage = adapter.extractUsage(raw);
    expect(usage?.inputTokens).toBe(16);
    expect(usage?.outputTokens).toBe(206);
    expect(usage?.cacheReadTokens).toBe(41232);
    expect(usage?.source).toBe('provider-adapter');
  });

  it('keeps the LAST recognizable envelope when several appear', () => {
    const raw = [
      JSON.stringify({ type: 'result', usage: { input_tokens: 10, output_tokens: 5 } }),
      JSON.stringify({ type: 'result', usage: { input_tokens: 300, output_tokens: 120 } }),
    ].join('\n');
    const usage = adapter.extractUsage(raw);
    expect(usage?.inputTokens).toBe(300);
    expect(usage?.outputTokens).toBe(120);
    expect(usage?.totalTokens).toBe(420);
  });

  it('returns null when the output carries no usage', () => {
    expect(adapter.extractUsage('just some agent prose, no json here')).toBeNull();
    expect(adapter.extractUsage(JSON.stringify({ type: 'result', result: 'hello' }))).toBeNull();
  });

  it('returns null for an empty usage object (no real numbers reported)', () => {
    expect(adapter.extractUsage(JSON.stringify({ type: 'result', usage: {} }))).toBeNull();
  });

  it('returns null for empty or malformed input', () => {
    expect(adapter.extractUsage('')).toBeNull();
    expect(adapter.extractUsage('   ')).toBeNull();
    expect(adapter.extractUsage('{not valid json')).toBeNull();
    // @ts-expect-error — guard against non-string callers
    expect(adapter.extractUsage(null)).toBeNull();
  });
});

describe('CLAUDE_SUBPROCESS_CONFIG usage-emit wiring', () => {
  it('declares the --output-format json usage-emit flag', () => {
    expect(CLAUDE_SUBPROCESS_CONFIG.usageEmitArgs).toEqual(['--output-format', 'json']);
  });

  it('keeps the usage-emit flag OUT of buildArgs (spawn-only) so the arg-shape seam is stable', () => {
    const args = CLAUDE_SUBPROCESS_CONFIG.buildArgs('sonnet');
    expect(args).not.toContain('--output-format');
    expect(args).toEqual(['-p', '-', '--model', 'claude-sonnet-4-6']);
  });

  it('keeps the usage-emit flag OUT of buildCommandString (dry-run display stays stable)', () => {
    const cmd = CLAUDE_SUBPROCESS_CONFIG.buildCommandString('opus', '/tmp/p.txt');
    expect(cmd).not.toContain('--output-format');
    expect(cmd).toBe('claude -p - --model claude-opus-4-8 < /tmp/p.txt');
  });
});
