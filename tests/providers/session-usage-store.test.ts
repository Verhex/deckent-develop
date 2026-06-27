/**
 * Tests for session-usage-store (Sprint 334 Task 334-001 — P0 TOKEN-REAL-CAPTURE).
 *
 * Proves readNativeUsage SUMS the REAL per-turn `message.usage` from a Claude
 * Code session jsonl into the 4 token fields — including `cacheCreationTokens`,
 * the limit-dominant cost the heuristic estimator missed 61/61. FULLY HERMETIC:
 * every case injects a tmpdir `sessionRoot`, so the real `~/.claude` is NEVER read.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import {
  readNativeUsage,
  slugifyProjectPath,
  type NativeUsageQuery,
} from '../../src/providers/session-usage-store.js';

/** Build one Claude Code transcript jsonl line carrying message.usage. */
function turnLine(usage: {
  input: number;
  output: number;
  cacheRead: number;
  cacheCreation: number;
}): string {
  return JSON.stringify({
    type: 'assistant',
    uuid: `u-${usage.input}-${usage.output}-${usage.cacheCreation}`,
    timestamp: '2026-06-27T00:00:00.000Z',
    message: {
      id: `msg-${usage.input}-${usage.cacheCreation}`,
      model: 'claude-opus-4-8',
      usage: {
        input_tokens: usage.input,
        output_tokens: usage.output,
        cache_read_input_tokens: usage.cacheRead,
        cache_creation_input_tokens: usage.cacheCreation,
      },
    },
  });
}

describe('session-usage-store · readNativeUsage', () => {
  let sessionRoot: string;

  beforeEach(() => {
    sessionRoot = mkdtempSync(join(tmpdir(), 'deckent-session-store-'));
  });

  afterEach(() => {
    rmSync(sessionRoot, { recursive: true, force: true });
  });

  const baseQuery = (overrides: Partial<NativeUsageQuery> = {}): NativeUsageQuery => ({
    projectRoot: '/workspace',
    taskId: '334-001',
    sessionRoot,
    ...overrides,
  });

  it('sums all turns message.usage into the 4 fields (incl. cacheCreation) + tags source', () => {
    // Two turns — every field is a distinct, non-multiple sum so a heuristic
    // (cacheRead = input×4) cannot accidentally match.
    const turns = [
      { input: 18644, output: 2314, cacheRead: 28324, cacheCreation: 47514 },
      { input: 1200, output: 880, cacheRead: 5000, cacheCreation: 9100 },
    ];
    writeFileSync(
      join(sessionRoot, 'session-abc.jsonl'),
      turns.map(turnLine).join('\n') + '\n',
      'utf-8',
    );

    const usage = readNativeUsage('claude', baseQuery());
    expect(usage).not.toBeNull();

    const sum = turns.reduce(
      (a, t) => ({
        input: a.input + t.input,
        output: a.output + t.output,
        cacheRead: a.cacheRead + t.cacheRead,
        cacheCreation: a.cacheCreation + t.cacheCreation,
      }),
      { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 },
    );

    expect(usage!.inputTokens).toBe(sum.input);
    expect(usage!.outputTokens).toBe(sum.output);
    expect(usage!.cacheReadTokens).toBe(sum.cacheRead);
    expect(usage!.cacheCreationTokens).toBe(sum.cacheCreation);
    expect(usage!.cacheCreationTokens!).toBeGreaterThan(0);
    expect(usage!.source).toBe('session-store');
    expect(usage!.provider).toBe('claude');

    // Anti-heuristic guard: real cacheRead is NOT input×4 (the heuristic ratio).
    expect(usage!.cacheReadTokens).not.toBe(usage!.inputTokens * 4);
  });

  it('matches the exact {sessionId}.jsonl when provided', () => {
    writeFileSync(
      join(sessionRoot, 'wanted.jsonl'),
      turnLine({ input: 100, output: 50, cacheRead: 7, cacheCreation: 9 }) + '\n',
      'utf-8',
    );
    writeFileSync(
      join(sessionRoot, 'other.jsonl'),
      turnLine({ input: 999, output: 999, cacheRead: 999, cacheCreation: 999 }) + '\n',
      'utf-8',
    );

    const usage = readNativeUsage('claude', baseQuery({ sessionId: 'wanted' }));
    expect(usage).not.toBeNull();
    expect(usage!.inputTokens).toBe(100);
    expect(usage!.cacheCreationTokens).toBe(9);
  });

  it('skips usage-less and corrupt lines, summing only real turns', () => {
    const lines = [
      JSON.stringify({ type: 'user', message: { role: 'user', content: 'hi' } }), // no usage
      '{ not json',                                                                // corrupt
      '',                                                                          // blank
      turnLine({ input: 10, output: 5, cacheRead: 2, cacheCreation: 3 }),
      turnLine({ input: 20, output: 7, cacheRead: 4, cacheCreation: 6 }),
    ];
    writeFileSync(join(sessionRoot, 's.jsonl'), lines.join('\n') + '\n', 'utf-8');

    const usage = readNativeUsage('claude', baseQuery());
    expect(usage).not.toBeNull();
    expect(usage!.inputTokens).toBe(30);
    expect(usage!.outputTokens).toBe(12);
    expect(usage!.cacheReadTokens).toBe(6);
    expect(usage!.cacheCreationTokens).toBe(9);
  });

  it('returns null when no session jsonl exists (honest no-source)', () => {
    // Empty tmpdir sessionRoot — no jsonl files.
    expect(readNativeUsage('claude', baseQuery())).toBeNull();
  });

  it('returns null when sessionRoot directory is absent (never throws)', () => {
    const missing = join(sessionRoot, 'does', 'not', 'exist');
    expect(readNativeUsage('claude', baseQuery({ sessionRoot: missing }))).toBeNull();
  });

  it('returns null for a jsonl with no usage turns at all', () => {
    writeFileSync(
      join(sessionRoot, 'empty.jsonl'),
      JSON.stringify({ type: 'user', message: { role: 'user', content: 'x' } }) + '\n',
      'utf-8',
    );
    expect(readNativeUsage('claude', baseQuery())).toBeNull();
  });

  it('is a documented null seam for codex and gemini (Law #2 phase2)', () => {
    // Seed a real jsonl to prove the null is provider-gated, not data-missing.
    writeFileSync(
      join(sessionRoot, 's.jsonl'),
      turnLine({ input: 10, output: 5, cacheRead: 2, cacheCreation: 3 }) + '\n',
      'utf-8',
    );
    expect(readNativeUsage('codex', baseQuery())).toBeNull();
    expect(readNativeUsage('gemini', baseQuery())).toBeNull();
    expect(readNativeUsage('ollama', baseQuery())).toBeNull();
  });

  it('selects the newest jsonl inside the spawn window', () => {
    writeFileSync(
      join(sessionRoot, 'old.jsonl'),
      turnLine({ input: 1, output: 1, cacheRead: 1, cacheCreation: 1 }) + '\n',
      'utf-8',
    );
    writeFileSync(
      join(sessionRoot, 'new.jsonl'),
      turnLine({ input: 42, output: 7, cacheRead: 3, cacheCreation: 8 }) + '\n',
      'utf-8',
    );
    // Window open from epoch to "now" — both files qualify; newest-mtime wins.
    const usage = readNativeUsage('claude', baseQuery({ spawnWindow: { startMs: 0 } }));
    expect(usage).not.toBeNull();
    expect(usage!.inputTokens).toBe(42);
  });

  it('slugifies an absolute cwd to the Claude projects dir name', () => {
    expect(slugifyProjectPath('/workspace')).toBe('-workspace');
    expect(slugifyProjectPath('/Users/foo/my-project')).toBe('-Users-foo-my-project');
  });
});
