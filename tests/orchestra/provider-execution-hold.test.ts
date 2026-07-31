import { describe, expect, it, onTestFinished } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  isProviderDispatchHoldFailure,
  providerDispatchHoldShouldComplete,
} from '../../src/orchestra/result-collector.js';
import {
  clearProviderExecutionHolds,
  readProviderExecutionHolds,
  PROVIDER_EXECUTION_HOLD_CHANNEL,
} from '../../src/core/provider-execution-hold.js';
import { writeEvent } from '../../src/core/event-stream.js';

describe('provider execution hold authority', () => {
  it('classifies revoked OAuth as auth rather than an execution budget failure', () => {
    expect(isProviderDispatchHoldFailure({
      notes: 'Worker exited without writing result',
      filesChanged: [],
      linesAdded: 0,
      linesRemoved: 0,
    }, 'OAuth token has been revoked. Please run /login again.')).toBe('auth');
  });

  it('never reclassifies a worker that produced tokens and files as a provider hold', () => {
    expect(isProviderDispatchHoldFailure({
      notes: 'Scope blocker mentioned rate limit guidance; no provider failure occurred',
      filesChanged: ['src/cli/commands/recover.ts'],
      linesAdded: 24,
      linesRemoved: 6,
      tokenUsage: {
        inputTokens: 242_454,
        outputTokens: 5_293,
        cacheReadTokens: 198_144,
        cacheCreationTokens: 0,
        source: 'host-runtime-budget',
      },
    }, 'The worker completed and wrote a bounded NO_GO result.')).toBeNull();
  });

  it('completes collection when every uncollected task belongs to a held provider', () => {
    expect(providerDispatchHoldShouldComplete(35, 50, 15)).toBe(true);
    expect(providerDispatchHoldShouldComplete(35, 50, 14)).toBe(false);
    expect(providerDispatchHoldShouldComplete(50, 50, 0)).toBe(false);
  });

  it('reads and deduplicates durable provider holds from the run event stream', () => {
    const root = mkdtempSync(join(tmpdir(), 'deckent-provider-hold-'));
    onTestFinished(() => rmSync(root, { recursive: true, force: true }));
    mkdirSync(join(root, '.deckent'), { recursive: true });
    const sprintId = 'sprint-904';
    const payload = {
      provider: 'anthropic',
      kind: 'auth',
      sourceTaskId: '904-001',
      reason: 'revoked',
    };
    writeEvent(root, sprintId, 'brain', 'auditor', PROVIDER_EXECUTION_HOLD_CHANNEL, payload);
    writeEvent(root, sprintId, 'brain', 'auditor', PROVIDER_EXECUTION_HOLD_CHANNEL, payload);

    expect(readProviderExecutionHolds(root, sprintId)).toEqual([payload]);
  });

  it('keeps hold evidence but removes it from active authority after resume clearance', () => {
    const root = mkdtempSync(join(tmpdir(), 'deckent-provider-hold-clear-'));
    onTestFinished(() => rmSync(root, { recursive: true, force: true }));
    mkdirSync(join(root, '.deckent'), { recursive: true });
    const sprintId = 'sprint-905';
    writeEvent(root, sprintId, 'brain', 'auditor', PROVIDER_EXECUTION_HOLD_CHANNEL, {
      provider: 'claude',
      kind: 'auth',
      sourceTaskId: '905-001',
      reason: 'revoked',
    });

    expect(clearProviderExecutionHolds(root, sprintId)).toEqual(['claude']);
    expect(readProviderExecutionHolds(root, sprintId)).toEqual([]);
  });
});
