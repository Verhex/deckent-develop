import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';

import {
  extractTokenUsageFromClaudeCli,
  extractTokenUsageFromAnthropicResponse,
  mergeWithWorkerClaim,
  tryLoadCliLogTokens,
} from '../../src/orchestra/token-counter.js';
import { TASKS_DIR } from '../../src/core/constants.js';
import type { TokenUsage } from '../../src/core/task-types.js';

describe('token-counter — extractTokenUsageFromClaudeCli', () => {
  it('(a) parses the Claude CLI --output-format json envelope', () => {
    const envelope = JSON.stringify({
      type: 'result',
      subtype: 'success',
      result: 'ok',
      model: 'claude-opus-4-7',
      usage: {
        input_tokens: 15420,
        output_tokens: 3200,
        cache_read_input_tokens: 89000,
        cache_creation_input_tokens: 1024,
      },
    });

    const result = extractTokenUsageFromClaudeCli(envelope);
    expect(result).toEqual({
      inputTokens: 15420,
      outputTokens: 3200,
      cacheReadTokens: 89000,
      cacheCreationTokens: 1024,
      source: 'cli-log',
      provider: 'claude',
      model: 'claude-opus-4-7',
    });
  });

  it('(b) returns null for malformed input (no usage field, non-JSON)', () => {
    expect(extractTokenUsageFromClaudeCli('not json')).toBeNull();
    expect(extractTokenUsageFromClaudeCli('{ "type": "result" }')).toBeNull();
    expect(extractTokenUsageFromClaudeCli(null)).toBeNull();
    expect(extractTokenUsageFromClaudeCli(undefined)).toBeNull();
    expect(extractTokenUsageFromClaudeCli({ usage: { foo: 1 } })).toBeNull();
  });

  it('accepts already-parsed object payloads', () => {
    const parsed = {
      type: 'result',
      usage: { input_tokens: 100, output_tokens: 50 },
    };
    const result = extractTokenUsageFromClaudeCli(parsed);
    expect(result).toMatchObject({
      inputTokens: 100,
      outputTokens: 50,
      cacheReadTokens: 0,
      provider: 'claude',
    });
  });
});

describe('token-counter — extractTokenUsageFromAnthropicResponse', () => {
  it('(c) parses the Anthropic SDK messages.create() response shape', () => {
    const sdkResponse = {
      id: 'msg_01abc',
      model: 'claude-opus-4-7',
      role: 'assistant',
      content: [{ type: 'text', text: 'ok' }],
      usage: {
        input_tokens: 8000,
        output_tokens: 1200,
        cache_read_input_tokens: 50000,
        cache_creation_input_tokens: 0,
      },
    };

    const result = extractTokenUsageFromAnthropicResponse(sdkResponse);
    expect(result).toEqual({
      inputTokens: 8000,
      outputTokens: 1200,
      cacheReadTokens: 50000,
      provider: 'claude',
      model: 'claude-opus-4-7',
    });
  });

  it('returns null when usage is missing or malformed', () => {
    expect(extractTokenUsageFromAnthropicResponse(null)).toBeNull();
    expect(extractTokenUsageFromAnthropicResponse('string')).toBeNull();
    expect(extractTokenUsageFromAnthropicResponse({ model: 'x' })).toBeNull();
    expect(extractTokenUsageFromAnthropicResponse({ usage: null })).toBeNull();
  });
});

describe('token-counter — mergeWithWorkerClaim', () => {
  it('(d) measured fields override worker self-report', () => {
    const worker: TokenUsage = {
      inputTokens: 3900,
      outputTokens: 500,
      cacheReadTokens: 0,
      provider: 'claude',
      model: 'opus',
    };
    const measured: TokenUsage = {
      inputTokens: 22000,
      outputTokens: 4100,
      cacheReadTokens: 85000,
      provider: 'claude',
      model: 'claude-opus-4-7',
    };

    const merged = mergeWithWorkerClaim(worker, measured);
    expect(merged).toEqual({
      inputTokens: 22000,
      outputTokens: 4100,
      cacheReadTokens: 85000,
      provider: 'claude',
      model: 'claude-opus-4-7',
    });
  });

  it('(e) preserves worker provider/model when measured omits them', () => {
    const worker: TokenUsage = {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      provider: 'claude',
      model: 'opus',
    };
    const measured: TokenUsage = {
      inputTokens: 1000,
      outputTokens: 200,
      cacheReadTokens: 5000,
      // provider/model intentionally omitted (e.g. CLI envelope without model)
    };

    const merged = mergeWithWorkerClaim(worker, measured);
    expect(merged?.provider).toBe('claude');
    expect(merged?.model).toBe('opus');
    expect(merged?.inputTokens).toBe(1000);
    expect(merged?.outputTokens).toBe(200);
    expect(merged?.cacheReadTokens).toBe(5000);
  });

  it('(f) returns undefined when both worker and measured are missing', () => {
    expect(mergeWithWorkerClaim(undefined, null)).toBeUndefined();
  });

  it('returns the non-null input when the other is missing', () => {
    const worker: TokenUsage = {
      inputTokens: 100,
      outputTokens: 50,
      cacheReadTokens: 0,
      provider: 'claude',
    };
    expect(mergeWithWorkerClaim(worker, null)).toBe(worker);

    const measured: TokenUsage = {
      inputTokens: 200,
      outputTokens: 80,
      cacheReadTokens: 1000,
      provider: 'claude',
    };
    expect(mergeWithWorkerClaim(undefined, measured)).toBe(measured);
  });
});

describe('token-counter — tryLoadCliLogTokens', () => {
  let tmpRoot: string;
  beforeEach(() => {
    tmpRoot = join(tmpdir(), `deckent-token-${randomBytes(6).toString('hex')}`);
    mkdirSync(join(tmpRoot, TASKS_DIR), { recursive: true });
  });
  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('(g) reads .tasks/task-{id}.cli-output.json and extracts usage', () => {
    const taskId = 'demo-001';
    const envelope = JSON.stringify({
      type: 'result',
      model: 'claude-opus-4-7',
      usage: {
        input_tokens: 9999,
        output_tokens: 333,
        cache_read_input_tokens: 4444,
      },
    });
    writeFileSync(
      join(tmpRoot, TASKS_DIR, `task-${taskId}.cli-output.json`),
      envelope,
    );

    const result = tryLoadCliLogTokens(tmpRoot, taskId);
    expect(result).toEqual({
      inputTokens: 9999,
      outputTokens: 333,
      cacheReadTokens: 4444,
      cacheCreationTokens: 0,
      source: 'cli-log',
      provider: 'claude',
      model: 'claude-opus-4-7',
    });
  });

  it('returns null when no log file exists', () => {
    const result = tryLoadCliLogTokens(tmpRoot, 'missing-task');
    expect(result).toBeNull();
  });

  it('falls back to scanning task-{id}.log for a JSON envelope on the last line', () => {
    const taskId = 'demo-log';
    const stdoutDump = [
      '[deckent] worker boot',
      '[deckent] running task',
      JSON.stringify({
        type: 'result',
        usage: { input_tokens: 555, output_tokens: 22, cache_read_input_tokens: 0 },
      }),
    ].join('\n');
    writeFileSync(join(tmpRoot, TASKS_DIR, `task-${taskId}.log`), stdoutDump);

    const result = tryLoadCliLogTokens(tmpRoot, taskId);
    expect(result?.inputTokens).toBe(555);
    expect(result?.outputTokens).toBe(22);
    expect(result?.provider).toBe('claude');
  });
});
