import { describe, expect, it, vi } from 'vitest';

import type { ReachabilityProbeRequest } from '../../src/core/provider-truth.js';
import { resolveCrossProviderCredentialKeys } from '../../src/providers/cross-provider-keys.js';
import {
  ClaudeReachabilityEvidenceSource,
  type ClaudeReachabilityCommandRunner,
} from '../../src/providers/claude-reachability-evidence.js';

const MODEL = 'claude-fable-5';
const OTHER_MODEL = 'claude-sonnet-5';
const ACCOUNT_REF = 'a'.repeat(64);

function success(model = MODEL): string {
  return [
    JSON.stringify({ type: 'system', subtype: 'init', model }),
    JSON.stringify({
      type: 'assistant',
      request_id: 'provider-request-1',
      message: {
        model,
        role: 'assistant',
        content: [{ type: 'text', text: 'DECKENT_REACHABILITY_OK' }],
      },
    }),
    JSON.stringify({
      type: 'result',
      subtype: 'success',
      is_error: false,
      duration_api_ms: 21,
      modelUsage: { [model]: { inputTokens: 1, outputTokens: 1 } },
    }),
  ].join('\n');
}

function failure(subtype: string, apiErrorStatus?: number): string {
  return [
    JSON.stringify({ type: 'system', subtype: 'init', model: MODEL }),
    JSON.stringify({
      type: 'assistant',
      request_id: 'provider-request-1',
      message: { model: MODEL, role: 'assistant', content: [] },
    }),
    JSON.stringify({
      type: 'result',
      subtype,
      is_error: true,
      ...(apiErrorStatus === undefined ? {} : { api_error_status: apiErrorStatus }),
      modelUsage: { [MODEL]: { inputTokens: 1 } },
    }),
  ].join('\n');
}

function request(
  override: Partial<ReachabilityProbeRequest> = {},
): ReachabilityProbeRequest {
  const backend = override.backend ?? {
    transport: 'cli' as const,
    executionBackend: 'host-subprocess' as const,
    endpointRefHash: null,
    runtimeFingerprint: 'b'.repeat(64),
    executionProfileRef: 'execution-profile:test-0001',
  };
  const auth = override.auth ?? {
    mode: 'subscription' as const,
    accountRefHash: ACCOUNT_REF,
  };
  return {
    tenantId: 'local',
    projectId: 'project-0001',
    idempotencyKey: 'reachability-test-0001',
    provider: 'claude',
    model: MODEL,
    auth,
    backend,
    probeKind: 'model-invocation',
    capability: 'inference',
    admission: {
      decision: 'allow',
      tenantId: 'local',
      projectId: 'project-0001',
      provider: 'claude',
      model: MODEL,
      auth,
      backend,
      approvalRef: 'approval:test-0001',
      approvalGrantedAt: '2026-07-24T08:00:00.000Z',
      approvalExpiresAt: '2026-07-24T08:05:00.000Z',
      limits: {
        state: 'known',
        decision: 'allow',
        evidenceRefs: ['provider-limit:test-0001'],
        fetchedAt: '2026-07-24T08:00:00.000Z',
        expiresAt: '2026-07-24T08:05:00.000Z',
      },
      budget: {
        evidenceRef: 'budget:test-0001',
        maxInputTokens: 100,
        maxOutputTokens: 100,
        maxTotalTokens: 200,
        maxUsd: 1,
      },
    },
    executionProfile: {
      profileRef: backend.executionProfileRef,
      provider: 'claude',
      allowed: [{
        authMode: 'subscription',
        transport: 'cli',
        executionBackend: 'host-subprocess',
      }],
    },
    ttlMs: 30_000,
    ...override,
  };
}

describe('ClaudeReachabilityEvidenceSource', () => {
  it('builds an exact isolated command and scrubs every provider credential', async () => {
    const credentialEnv = Object.fromEntries(
      resolveCrossProviderCredentialKeys().map(key => [key, `secret-${key}`]),
    );
    const runner = vi.fn<ClaudeReachabilityCommandRunner>(async () => ({
      status: 0,
      stdout: success(),
      durationMs: 24,
      timedOut: false,
    }));
    const source = new ClaudeReachabilityEvidenceSource({
      projectRoot: '/project',
      runner,
      platform: 'linux',
      env: {
        PATH: '/bin',
        SAFE_VALUE: 'kept',
        CUSTOM_PROVIDER_KEY: 'custom-secret',
        ...credentialEnv,
      },
      additionalCredentialKeys: ['CUSTOM_PROVIDER_KEY'],
    });

    const observation = await source.probe(request());
    expect(observation).toMatchObject({
      outcome: 'succeeded',
      calledProvider: 'claude',
      calledModel: MODEL,
      latencyMs: 21,
    });
    expect(runner).toHaveBeenCalledTimes(1);
    const [command, args, options] = runner.mock.calls[0]!;
    expect(command).toBe('claude');
    expect(args).toEqual(expect.arrayContaining([
      '-p',
      '-',
      '--output-format',
      'stream-json',
      '--verbose',
      '--model',
      MODEL,
      '--tools',
      '',
      '--safe-mode',
      '--disable-slash-commands',
      '--no-session-persistence',
    ]));
    expect(options).toMatchObject({
      cwd: '/project',
      timeoutMs: 30_000,
      maxOutputBytes: 1024 * 1024,
    });
    expect(options.input.length).toBeLessThan(128);
    expect(options.input).not.toContain(MODEL);
    expect(options.env['SAFE_VALUE']).toBe('kept');
    for (const key of resolveCrossProviderCredentialKeys()) {
      expect(options.env[key]).toBeUndefined();
    }
    expect(options.env['CUSTOM_PROVIDER_KEY']).toBeUndefined();
    expect(JSON.stringify(observation)).not.toContain('provider-request-1');
    expect(observation.evidenceRefs).toHaveLength(2);
  });

  it('uses the shell-free Windows CLI wrapper contract', async () => {
    const runner = vi.fn<ClaudeReachabilityCommandRunner>(async () => ({
      status: 0,
      stdout: success(),
      durationMs: 1,
      timedOut: false,
    }));
    const source = new ClaudeReachabilityEvidenceSource({
      projectRoot: 'C:\\project',
      runner,
      platform: 'win32',
      env: {},
    });

    await source.probe(request());
    const [command, args] = runner.mock.calls[0]!;
    expect(command).toBe('cmd.exe');
    expect(args.slice(0, 2)).toEqual(['/c', 'claude']);
    expect(args).toContain(MODEL);
  });

  it('does not spawn for provider, backend, account, or profile near-matches', async () => {
    const runner = vi.fn<ClaudeReachabilityCommandRunner>();
    const source = new ClaudeReachabilityEvidenceSource({
      projectRoot: '/project',
      runner,
      env: {},
    });
    const cases: ReachabilityProbeRequest[] = [
      request({ provider: 'codex' }),
      request({
        backend: {
          ...request().backend,
          executionBackend: 'docker',
        },
      }),
      request({ auth: { mode: 'subscription', accountRefHash: null } }),
      request({
        executionProfile: {
          profileRef: 'execution-profile:test-0001',
          provider: 'claude',
          allowed: [{
            authMode: 'subscription',
            transport: 'cli',
            executionBackend: 'docker',
          }],
        },
      }),
    ];

    for (const value of cases) {
      await expect(source.probe(value)).resolves.toMatchObject({
        outcome: 'unsupported',
        calledProvider: null,
        calledModel: null,
      });
    }
    expect(runner).not.toHaveBeenCalled();
  });

  it('keeps timeout, overflow, spawn, nonzero, and model mismatch fail-closed', async () => {
    const results = [
      {
        result: { status: null, stdout: '', durationMs: 30_000, timedOut: true },
        outcome: 'timeout',
      },
      {
        result: {
          status: null, stdout: '{', durationMs: 1, timedOut: false, outputTruncated: true,
        },
        outcome: 'invalid-response',
      },
      {
        result: {
          status: null, stdout: '', durationMs: 1, timedOut: false, spawnError: true,
        },
        outcome: 'backend-unreachable',
      },
      {
        result: { status: 1, stdout: success(), durationMs: 1, timedOut: false },
        outcome: 'transport-error',
      },
      {
        result: {
          status: 1, stdout: failure('authentication_error'), durationMs: 1, timedOut: false,
        },
        outcome: 'auth-rejected',
      },
      {
        result: { status: 0, stdout: success(OTHER_MODEL), durationMs: 1, timedOut: false },
        outcome: 'invalid-response',
      },
    ] as const;

    for (const item of results) {
      const source = new ClaudeReachabilityEvidenceSource({
        projectRoot: '/project',
        runner: async () => item.result,
        env: {},
      });
      await expect(source.probe(request())).resolves.toMatchObject({
        outcome: item.outcome,
      });
    }
  });

  it('preserves explicit provider rate-limit evidence on a nonzero exit', async () => {
    const source = new ClaudeReachabilityEvidenceSource({
      projectRoot: '/project',
      runner: async () => ({
        status: 1,
        stdout: failure('rate_limit_error', 429),
        durationMs: 7,
        timedOut: false,
      }),
      env: {},
    });

    await expect(source.probe(request())).resolves.toMatchObject({
      outcome: 'rate-limited',
      calledProvider: 'claude',
      calledModel: MODEL,
    });
  });

  it('rejects invalid construction bounds before any process can exist', () => {
    expect(() => new ClaudeReachabilityEvidenceSource({
      projectRoot: '',
      runner: async () => ({
        status: 0, stdout: '', durationMs: 0, timedOut: false,
      }),
    })).toThrow(/projectRoot/u);
    expect(() => new ClaudeReachabilityEvidenceSource({
      projectRoot: '/project',
      timeoutMs: 60_001,
    })).toThrow(/timeoutMs/u);
    expect(() => new ClaudeReachabilityEvidenceSource({
      projectRoot: '/project',
      maxOutputBytes: 1024 * 1024 + 1,
    })).toThrow(/maxOutputBytes/u);
  });
});
