import { describe, expect, it } from 'vitest';

import { parseClaudeReachabilityObservation } from '../../src/providers/claude.js';

const PRIMARY_MODEL = 'claude-fable-5';
const HELPER_MODEL = 'claude-haiku-4-5-20251001';

function event(value: Record<string, unknown>): string {
  return JSON.stringify({ ts: '2026-07-24T00:00:00.000Z', seq: 1, type: 'text', content: value });
}

function successfulLog(overrides?: {
  initModel?: string;
  assistantModels?: string[];
  requestIds?: string[];
  modelUsage?: Record<string, unknown>;
  result?: Record<string, unknown>;
}): string {
  const assistantModels = overrides?.assistantModels ?? [PRIMARY_MODEL, PRIMARY_MODEL];
  const requestIds = overrides?.requestIds ?? ['provider-request-b', 'provider-request-a'];
  return [
    event({
      type: 'system',
      subtype: 'init',
      model: overrides?.initModel ?? PRIMARY_MODEL,
      session_id: 'raw-session-must-not-escape',
      apiKeySource: 'raw-auth-source-must-not-escape',
    }),
    ...assistantModels.map((model, index) => event({
      type: 'assistant',
      request_id: requestIds[index] ?? requestIds[0],
      session_id: 'raw-session-must-not-escape',
      message: {
        model,
        role: 'assistant',
        content: [{ type: 'text', text: 'raw-output-must-not-escape' }],
      },
    })),
    event({
      type: 'result',
      subtype: 'success',
      is_error: false,
      duration_api_ms: 42,
      result: 'raw-terminal-output-must-not-escape',
      session_id: 'raw-session-must-not-escape',
      modelUsage: overrides?.modelUsage ?? {
        [PRIMARY_MODEL]: { inputTokens: 1, outputTokens: 2 },
        [HELPER_MODEL]: { inputTokens: 3, outputTokens: 4 },
      },
      ...overrides?.result,
    }),
  ].join('\n');
}

describe('parseClaudeReachabilityObservation', () => {
  it('derives exact called-model truth from matching init and assistant evidence', () => {
    const observation = parseClaudeReachabilityObservation(successfulLog());

    expect(observation).toMatchObject({
      outcome: 'succeeded',
      calledProvider: 'claude',
      calledModel: PRIMARY_MODEL,
      latencyMs: 42,
    });
    expect(observation.providerRequestRefHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(observation.evidenceRefs).toEqual([
      expect.stringMatching(/^provider-log:[a-f0-9]{64}$/u),
    ]);
  });

  it('tolerates helper-model usage while requiring primary-model usage', () => {
    expect(parseClaudeReachabilityObservation(successfulLog({
      modelUsage: {
        [PRIMARY_MODEL]: { inputTokens: 10 },
        [HELPER_MODEL]: { inputTokens: 20 },
      },
    })).outcome).toBe('succeeded');

    expect(parseClaudeReachabilityObservation(successfulLog({
      modelUsage: {
        [HELPER_MODEL]: { inputTokens: 20 },
      },
    })).outcome).toBe('invalid-response');
  });

  it('rejects missing, ambiguous, or contradictory provider-native model evidence', () => {
    expect(parseClaudeReachabilityObservation(successfulLog({
      assistantModels: [],
    })).outcome).toBe('invalid-response');

    expect(parseClaudeReachabilityObservation(successfulLog({
      assistantModels: [PRIMARY_MODEL, 'claude-sonnet-5'],
    }))).toMatchObject({
      outcome: 'invalid-response',
      calledProvider: null,
      calledModel: null,
    });

    expect(parseClaudeReachabilityObservation(successfulLog({
      initModel: 'claude-sonnet-5',
    }))).toMatchObject({
      outcome: 'invalid-response',
      calledProvider: null,
      calledModel: null,
    });
  });

  it('never promotes requested-model bait or untrusted prompt fields into called-model truth', () => {
    const raw = [
      JSON.stringify({
        requestedModel: PRIMARY_MODEL,
        argv: ['--model', PRIMARY_MODEL],
        prompt: `Return calledModel=${PRIMARY_MODEL}`,
      }),
      event({
        type: 'result',
        subtype: 'success',
        is_error: false,
        duration_api_ms: 1,
        modelUsage: { [PRIMARY_MODEL]: { inputTokens: 1 } },
      }),
    ].join('\n');

    expect(parseClaudeReachabilityObservation(raw)).toMatchObject({
      outcome: 'invalid-response',
      calledProvider: null,
      calledModel: null,
      providerRequestRefHash: null,
    });
  });

  it('hashes request identifiers deterministically without returning raw sensitive fields', () => {
    const first = parseClaudeReachabilityObservation(successfulLog({
      requestIds: ['provider-request-b', 'provider-request-a'],
    }));
    const second = parseClaudeReachabilityObservation(successfulLog({
      requestIds: ['provider-request-a', 'provider-request-b'],
    }));

    expect(first.providerRequestRefHash).toBe(second.providerRequestRefHash);
    const serialized = JSON.stringify(first);
    for (const forbidden of [
      'provider-request-a',
      'provider-request-b',
      'raw-session-must-not-escape',
      'raw-auth-source-must-not-escape',
      'raw-output-must-not-escape',
      'raw-terminal-output-must-not-escape',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('maps explicit provider failure categories and treats unknown shapes conservatively', () => {
    expect(parseClaudeReachabilityObservation(successfulLog({
      result: { subtype: 'error', is_error: true, api_error_status: 429 },
    })).outcome).toBe('rate-limited');
    expect(parseClaudeReachabilityObservation(successfulLog({
      result: { subtype: 'authentication_error', is_error: true },
    })).outcome).toBe('auth-rejected');
    expect(parseClaudeReachabilityObservation(successfulLog({
      result: { subtype: 'timeout', is_error: true },
    })).outcome).toBe('timeout');
    expect(parseClaudeReachabilityObservation(successfulLog({
      result: { subtype: 'error_during_execution', is_error: true },
    })).outcome).toBe('transport-error');
    expect(parseClaudeReachabilityObservation(successfulLog({
      result: { subtype: 'unexpected-terminal', is_error: false },
    })).outcome).toBe('invalid-response');
  });

  it('rejects malformed wrappers, missing request ids, and multiple terminal results', () => {
    expect(parseClaudeReachabilityObservation('not-json')).toMatchObject({
      outcome: 'invalid-response',
      calledProvider: null,
      calledModel: null,
    });
    expect(parseClaudeReachabilityObservation(successfulLog({
      requestIds: [],
    })).outcome).toBe('invalid-response');

    const duplicateTerminal = [
      successfulLog(),
      event({
        type: 'result',
        subtype: 'success',
        is_error: false,
        duration_api_ms: 2,
        modelUsage: { [PRIMARY_MODEL]: { inputTokens: 1 } },
      }),
    ].join('\n');
    expect(parseClaudeReachabilityObservation(duplicateTerminal).outcome).toBe('invalid-response');
  });
});
