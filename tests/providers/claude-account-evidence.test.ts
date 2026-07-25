import { describe, expect, it, vi } from 'vitest';

import {
  ClaudeAccountIdentityAuthority,
  type ClaudeAuthStatusCommandResult,
  type ClaudeAuthStatusRunner,
} from '../../src/providers/claude-account-evidence.js';
import {
  deriveProviderAccountBackendScopeRefHash,
  type ProviderAccountIdentityRequest,
} from '../../src/core/provider-evidence-producer.js';
import { resolveCrossProviderCredentialKeys } from '../../src/providers/cross-provider-keys.js';

const NOW = new Date('2026-07-24T08:00:00.000Z');
const PROFILE_REF = 'execution-profile:claude-subscription-0001';

function request(
  overrides: Partial<ProviderAccountIdentityRequest> = {},
): ProviderAccountIdentityRequest {
  return {
    tenantId: 'tenant-test',
    provider: 'claude',
    authMode: 'subscription',
    backend: {
      transport: 'cli',
      executionBackend: 'host-subprocess',
      endpointRefHash: null,
      runtimeFingerprint: 'f'.repeat(64),
      executionProfileRef: PROFILE_REF,
    },
    executionProfile: {
      profileRef: PROFILE_REF,
      provider: 'claude',
      allowed: [{
        authMode: 'subscription',
        transport: 'cli',
        executionBackend: 'host-subprocess',
      }],
    },
    ...overrides,
  };
}

function runner(result: ClaudeAuthStatusCommandResult): {
  readonly impl: ClaudeAuthStatusRunner;
  readonly calls: Array<{
    readonly command: string;
    readonly args: readonly string[];
    readonly options: {
      readonly timeoutMs: number;
      readonly maxOutputBytes: number;
      readonly env: NodeJS.ProcessEnv;
    };
  }>;
} {
  const calls: Array<{
    readonly command: string;
    readonly args: readonly string[];
    readonly options: {
      readonly timeoutMs: number;
      readonly maxOutputBytes: number;
      readonly env: NodeJS.ProcessEnv;
    };
  }> = [];
  return {
    calls,
    impl: async (command, args, options) => {
      calls.push({ command, args, options });
      return result;
    },
  };
}

function status(
  value: Record<string, unknown>,
  statusCode = 0,
): ClaudeAuthStatusCommandResult {
  return {
    status: statusCode,
    stdout: JSON.stringify(value),
    timedOut: false,
  };
}

describe('ClaudeAccountIdentityAuthority', () => {
  it('returns provider-verified organization identity for one exact bounded status command', async () => {
    const rawOrganization = 'org-provider-native-123';
    const rawEmail = 'private@example.test';
    const fx = runner(status({
      loggedIn: true,
      authMethod: 'claude.ai',
      apiProvider: 'firstParty',
      orgId: rawOrganization,
      orgName: 'Private Org',
      email: rawEmail,
      subscriptionType: 'max',
    }));
    const authority = new ClaudeAccountIdentityAuthority({
      runner: fx.impl,
      now: () => NOW,
      ttlMs: 30_000,
      timeoutMs: 1_500,
      maxOutputBytes: 4_096,
      env: {
        PATH: '/bin',
        ANTHROPIC_API_KEY: 'must-be-scrubbed',
        OPENAI_API_KEY: 'must-be-scrubbed',
        CUSTOM_PROVIDER_KEY: 'must-be-scrubbed',
        SAFE_VALUE: 'kept',
      },
      additionalCredentialKeys: ['CUSTOM_PROVIDER_KEY'],
    });
    const input = request();

    const result = await authority.resolve(input);

    expect(fx.calls).toHaveLength(1);
    expect(fx.calls[0]).toMatchObject({
      command: 'claude',
      args: ['auth', 'status', '--json'],
      options: { timeoutMs: 1_500, maxOutputBytes: 4_096 },
    });
    expect(fx.calls[0]!.options.env['SAFE_VALUE']).toBe('kept');
    for (const key of [...resolveCrossProviderCredentialKeys(), 'CUSTOM_PROVIDER_KEY']) {
      expect(fx.calls[0]!.options.env[key]).toBeUndefined();
    }
    expect(result).toMatchObject({
      state: 'ready',
      provider: 'claude',
      authMode: 'subscription',
      identityKind: 'organization',
      assurance: 'provider-verified',
      issuer: 'claude-auth-status',
      stableSubject: rawOrganization,
      backendScopeRefHash: deriveProviderAccountBackendScopeRefHash(input),
      fetchedAt: NOW.toISOString(),
      expiresAt: '2026-07-24T08:00:30.000Z',
    });
    expect(result.evidenceRef).toMatch(/^claude-account-status:[a-f0-9]{64}$/u);
    expect(result.credentialGenerationRef)
      .toMatch(/^claude-account-credential:[a-f0-9]{64}$/u);
    expect(JSON.stringify(result)).not.toContain(rawEmail);
    expect(JSON.stringify(result)).not.toContain('Private Org');
    expect(JSON.stringify(result)).not.toContain('max');
  });

  it('uses the shell-free Windows CLI wrapper contract', async () => {
    const fx = runner(status({ loggedIn: false, authMethod: 'none' }, 1));
    const authority = new ClaudeAccountIdentityAuthority({
      runner: fx.impl,
      now: () => NOW,
      platform: 'win32',
      env: {},
    });

    await authority.resolve(request());

    expect(fx.calls[0]).toMatchObject({
      command: 'cmd.exe',
      args: ['/c', 'claude', 'auth', 'status', '--json'],
    });
  });

  it.each([
    ['missing orgId', {
      loggedIn: true,
      authMethod: 'claude.ai',
      apiProvider: 'firstParty',
      email: 'email-is-not-identity@example.test',
    }],
    ['API-key auth', {
      loggedIn: true,
      authMethod: 'api_key',
      apiProvider: 'firstParty',
      orgId: 'org-not-authoritative-for-api-key',
    }],
  ] as const)('keeps %s credential-only instead of inventing account identity', async (_name, payload) => {
    const fx = runner(status(payload));
    const result = await new ClaudeAccountIdentityAuthority({
      runner: fx.impl,
      now: () => NOW,
    }).resolve(request());

    expect(result).toMatchObject({
      state: 'credential-only',
      fetchedAt: NOW.toISOString(),
    });
    expect(JSON.stringify(result)).not.toContain('email-is-not-identity@example.test');
    expect(JSON.stringify(result)).not.toContain('org-not-authoritative-for-api-key');
  });

  it.each([
    ['logged out with provider-native exit 1', status({
      loggedIn: false,
      authMethod: 'none',
      apiProvider: 'firstParty',
    }, 1)],
    ['foreign apiProvider', status({
      loggedIn: true,
      authMethod: 'claude.ai',
      apiProvider: 'thirdParty',
      orgId: 'org-must-not-cross-provider-boundary',
    })],
    ['nonzero login contradiction', status({
      loggedIn: true,
      authMethod: 'claude.ai',
      apiProvider: 'firstParty',
      orgId: 'org-must-not-cross-exit-boundary',
    }, 7)],
    ['malformed JSON', { status: 0, stdout: 'not-json', timedOut: false }],
    ['timeout', { status: null, stdout: '', timedOut: true }],
    ['spawn failure', { status: null, stdout: '', timedOut: false, spawnError: true }],
    ['truncated output', {
      status: null,
      stdout: '{"loggedIn":true',
      timedOut: false,
      outputTruncated: true,
    }],
  ] as const)('holds %s without leaking raw authority data', async (_name, commandResult) => {
    const fx = runner(commandResult);
    const result = await new ClaudeAccountIdentityAuthority({
      runner: fx.impl,
      now: () => NOW,
    }).resolve(request());

    expect(result).toEqual({
      state: 'hold',
      evidenceRef: expect.stringMatching(/^claude-account-status:[a-f0-9]{64}$/u),
    });
    expect(JSON.stringify(result)).not.toMatch(/thirdParty|org-must|loggedIn/u);
  });

  it('rejects non-canonical organization subjects without email fallback', async () => {
    for (const orgId of [' org-with-space', 'org\u0000control', 'e\u0301']) {
      const fx = runner(status({
        loggedIn: true,
        authMethod: 'claude.ai',
        apiProvider: 'firstParty',
        orgId,
        email: 'must-not-fallback@example.test',
      }));
      const result = await new ClaudeAccountIdentityAuthority({
        runner: fx.impl,
        now: () => NOW,
      }).resolve(request());
      expect(result.state).toBe('credential-only');
      expect(JSON.stringify(result)).not.toContain('must-not-fallback@example.test');
    }
  });

  it('holds exact-scope mismatches without invoking the provider CLI', async () => {
    const impl = vi.fn<ClaudeAuthStatusRunner>();
    const cases: ProviderAccountIdentityRequest[] = [
      request({ provider: 'codex' }),
      request({ authMode: 'api' }),
      request({ backend: { ...request().backend, transport: 'http' } }),
      request({
        executionProfile: {
          ...request().executionProfile,
          provider: 'codex',
        },
      }),
      request({
        backend: {
          ...request().backend,
          executionProfileRef: 'execution-profile:different-0001',
        },
      }),
    ];

    for (const input of cases) {
      const result = await new ClaudeAccountIdentityAuthority({
        runner: impl,
        now: () => NOW,
      }).resolve(input);
      expect(result).toEqual({
        state: 'hold',
        evidenceRef: expect.stringMatching(/^claude-account-scope:[a-f0-9]{64}$/u),
      });
    }
    expect(impl).not.toHaveBeenCalled();
  });

  it('rejects unbounded runtime settings at construction', () => {
    expect(() => new ClaudeAccountIdentityAuthority({ timeoutMs: 60_001 }))
      .toThrow(/timeoutMs/u);
    expect(() => new ClaudeAccountIdentityAuthority({ maxOutputBytes: 1024 * 1024 + 1 }))
      .toThrow(/maxOutputBytes/u);
    expect(() => new ClaudeAccountIdentityAuthority({ ttlMs: 60_001 }))
      .toThrow(/ttlMs/u);
  });
});
