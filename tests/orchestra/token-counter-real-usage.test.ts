/**
 * Tests for resolveTokenUsage — the provenance-tagged token-counter path
 * (Sprint 334 Task 334-001 — P0 TOKEN-REAL-CAPTURE).
 *
 * Proves the full path prefers the provider's REAL native session-store usage
 * (carrying `cacheCreationTokens`) over the envelope over the heuristic estimate,
 * and tags each with an honest `source`. FULLY HERMETIC: a tmpdir `sessionRoot`
 * + tmpdir `.tasks` per case — the real `~/.claude` is NEVER read.
 */
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { resolveTokenUsage } from '../../src/orchestra/token-counter.js';
import { TASKS_DIR } from '../../src/core/constants.js';
import type { NativeUsageQuery } from '../../src/providers/session-usage-store.js';
import type { TokenUsage } from '../../src/core/task-types.js';

const TASK_ID = '334-001';

/** A Claude Code transcript jsonl turn line carrying message.usage. */
function turnLine(u: { input: number; output: number; cacheRead: number; cacheCreation: number }): string {
  return JSON.stringify({
    type: 'assistant',
    uuid: `u-${u.input}-${u.cacheCreation}`,
    message: {
      id: `msg-${u.input}-${u.cacheCreation}`,
      model: 'claude-opus-4-8',
      usage: {
        input_tokens: u.input,
        output_tokens: u.output,
        cache_read_input_tokens: u.cacheRead,
        cache_creation_input_tokens: u.cacheCreation,
      },
    },
  });
}

/**
 * The heuristic the estimator produces today: cacheRead = input×4,
 * output = linesAdded×15, NO cacheCreation. This is the pre-fix RED baseline.
 */
function heuristicEstimate(inputTokens: number, linesAdded: number): TokenUsage {
  return {
    inputTokens,
    outputTokens: linesAdded * 15,
    cacheReadTokens: inputTokens * 4,
    provider: 'claude',
    model: 'claude-opus-4-8',
  };
}

describe('token-counter · resolveTokenUsage (provenance-tagged path)', () => {
  let projectRoot: string;
  let sessionRoot: string;
  let tasksDir: string;

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), 'deckent-tc-root-'));
    sessionRoot = mkdtempSync(join(tmpdir(), 'deckent-tc-session-'));
    tasksDir = join(projectRoot, TASKS_DIR);
    mkdirSync(tasksDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
    rmSync(sessionRoot, { recursive: true, force: true });
  });

  const query = (overrides: Partial<NativeUsageQuery> = {}): NativeUsageQuery => ({
    projectRoot,
    taskId: TASK_ID,
    sessionRoot,
    ...overrides,
  });

  it('session-store hit: returns the real SUM incl. cacheCreation + source=session-store', () => {
    const turns = [
      { input: 18644, output: 2314, cacheRead: 28324, cacheCreation: 47514 },
      { input: 1356, output: 686, cacheRead: 1676, cacheCreation: 2486 },
    ];
    writeFileSync(
      join(sessionRoot, 'session.jsonl'),
      turns.map(turnLine).join('\n') + '\n',
      'utf-8',
    );
    const sumCacheCreation = turns.reduce((a, t) => a + t.cacheCreation, 0);
    const sumInput = turns.reduce((a, t) => a + t.input, 0);
    const sumCacheRead = turns.reduce((a, t) => a + t.cacheRead, 0);

    // The estimate is present but must be IGNORED in favor of the real source.
    const usage = resolveTokenUsage('claude', query(), heuristicEstimate(sumInput, 200));

    expect(usage.source).toBe('session-store');
    expect(usage.cacheCreationTokens).toBe(sumCacheCreation);
    expect(usage.cacheCreationTokens!).toBeGreaterThan(0);
    expect(usage.inputTokens).toBe(sumInput);
    expect(usage.cacheReadTokens).toBe(sumCacheRead);
    // Anti-heuristic guard: real cacheRead is NOT input×4.
    expect(usage.cacheReadTokens).not.toBe(usage.inputTokens * 4);
  });

  it('no real source: returns the heuristic estimate tagged source=estimate (honest)', () => {
    // sessionRoot is empty + no envelope file → estimate path.
    const estimate = heuristicEstimate(5000, 120);
    const usage = resolveTokenUsage('claude', query(), estimate);

    expect(usage.source).toBe('estimate');
    // Byte-equivalent to the estimate EXCEPT the new source tag.
    expect(usage.inputTokens).toBe(estimate.inputTokens);
    expect(usage.outputTokens).toBe(estimate.outputTokens);
    expect(usage.cacheReadTokens).toBe(estimate.cacheReadTokens);
    expect(usage.provider).toBe('claude');
    expect(usage.model).toBe('claude-opus-4-8');

    // Pre-fix RED characteristics the estimate still carries (proving the
    // heuristic is what got tagged): cacheRead === input×4, no cacheCreation.
    expect(usage.cacheReadTokens).toBe(usage.inputTokens * 4);
    expect(usage.cacheCreationTokens).toBeUndefined();
  });

  it('envelope hit (no session): uses the CLI envelope tagged source=envelope', () => {
    // Seed the Claude CLI --output-format json side-channel; leave sessionRoot empty.
    const envelope = {
      type: 'result',
      subtype: 'success',
      usage: {
        input_tokens: 15420,
        output_tokens: 3200,
        cache_read_input_tokens: 89000,
        cache_creation_input_tokens: 1024,
      },
      model: 'claude-opus-4-8',
    };
    writeFileSync(
      join(tasksDir, `task-${TASK_ID}.cli-output.json`),
      JSON.stringify(envelope),
      'utf-8',
    );

    const usage = resolveTokenUsage('claude', query(), heuristicEstimate(5000, 50));
    expect(usage.source).toBe('envelope');
    expect(usage.inputTokens).toBe(15420);
    expect(usage.outputTokens).toBe(3200);
    expect(usage.cacheReadTokens).toBe(89000);
  });

  it('session-store wins over an available envelope', () => {
    writeFileSync(
      join(sessionRoot, 'session.jsonl'),
      turnLine({ input: 700, output: 80, cacheRead: 33, cacheCreation: 55 }) + '\n',
      'utf-8',
    );
    writeFileSync(
      join(tasksDir, `task-${TASK_ID}.cli-output.json`),
      JSON.stringify({ usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 1 } }),
      'utf-8',
    );
    const usage = resolveTokenUsage('claude', query(), heuristicEstimate(700, 10));
    expect(usage.source).toBe('session-store');
    expect(usage.cacheCreationTokens).toBe(55);
  });

  it('non-claude provider with no envelope falls to estimate (no native store yet)', () => {
    // Seed a claude jsonl to prove the codex path does NOT read it.
    writeFileSync(
      join(sessionRoot, 'session.jsonl'),
      turnLine({ input: 700, output: 80, cacheRead: 33, cacheCreation: 55 }) + '\n',
      'utf-8',
    );
    const estimate = heuristicEstimate(3000, 40);
    const usage = resolveTokenUsage('codex', query(), estimate);
    expect(usage.source).toBe('estimate');
    expect(usage.cacheCreationTokens).toBeUndefined();
    expect(usage.inputTokens).toBe(3000);
  });
});
