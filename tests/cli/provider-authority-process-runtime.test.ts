import { describe, expect, it, vi } from 'vitest';

import {
  preflightCliBrainProviderAuthority,
  withCliProviderAuthority,
} from '../../src/cli/provider-authority-process-runtime.js';

describe('withCliProviderAuthority', () => {
  it('does not load config or open authority for unrelated commands', async () => {
    const loadConfig = vi.fn();
    const open = vi.fn();
    const action = vi.fn(async authority => authority ?? 'disabled');

    const result = await withCliProviderAuthority({
      argv: ['node', 'deckent', 'status'],
      projectRoot: '/project',
      loadConfig,
      open,
    }, action);

    expect(result).toBe('disabled');
    expect(loadConfig).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
    expect(action).toHaveBeenCalledWith(undefined);
  });

  it.each(['run', 'start', 'do', 'xverify'])(
    'opens once before %s, injects the exact result, and closes after settlement',
    async (command) => {
    const events: string[] = [];
    const config = { provider_limit_authority: undefined } as never;
    const authority = {
      state: 'hold',
      reasonCode: 'policy_authority_unavailable',
      authorityEvidenceRef: `provider-authority:${'a'.repeat(64)}`,
      retryable: false,
      close: vi.fn(() => events.push('close')),
    } as const;
    const loadConfig = vi.fn(async () => {
      events.push('load');
      return config;
    });
    const open = vi.fn(() => {
      events.push('open');
      return authority;
    });

    const result = await withCliProviderAuthority({
      argv: ['node', 'deckent', command, 'bounded task'],
      projectRoot: '/project',
      loadConfig,
      open,
    }, async injected => {
      events.push('action');
      expect(injected).toBe(authority);
      return 'done';
    });

    expect(result).toBe('done');
    expect(loadConfig).toHaveBeenCalledOnce();
    expect(open).toHaveBeenCalledOnce();
    expect(authority.close).toHaveBeenCalledOnce();
    expect(events).toEqual(['load', 'open', 'action', 'close']);
    },
  );

  it('closes the process authority when command execution throws', async () => {
    const authority = {
      state: 'hold',
      reasonCode: 'integrity_failure',
      authorityEvidenceRef: `provider-authority:${'b'.repeat(64)}`,
      retryable: false,
      close: vi.fn(),
    } as const;

    await expect(withCliProviderAuthority({
      argv: ['node', 'deckent', 'run', 'bounded task'],
      projectRoot: '/project',
      loadConfig: vi.fn(async () => ({} as never)),
      open: vi.fn(() => authority),
    }, async () => {
      throw new Error('command-failed');
    })).rejects.toThrow('command-failed');

    expect(authority.close).toHaveBeenCalledOnce();
  });
});

describe('preflightCliBrainProviderAuthority', () => {
  const READY_CONFIG = {
    mode: 'balanced',
    modes: {
      balanced: {
        brain_model: 'claude-fable-5',
        default_model: 'claude-fable-5',
      },
    },
    providers: { brain: 'claude' },
  } as never;

  it.each(['cli-run:100', 'cli-start:100', 'cli-do:100', 'cli-xverify:100'])(
    'passes a healthy composition as ready for %s — never the empty-candidate hold',
    (executionId) => {
      const admit = vi.fn();
      const authority = {
        state: 'ready',
        tenantId: 'local',
        projectId: 'project-cli-0001',
        authorityEvidenceRef: `provider-authority:${'e'.repeat(64)}`,
        service: { roleAdmissionRuntime: { admit } },
        close: vi.fn(),
      } as never;

      const decision = preflightCliBrainProviderAuthority(
        authority,
        READY_CONFIG,
        '/project',
        executionId,
      );

      // Front door = composition health only. The candidate-bound admission
      // belongs to the later stage where the exact candidate/backend resolves.
      expect(admit).not.toHaveBeenCalled();
      expect(decision).toMatchObject({
        decision: 'ready',
        authorityEvidenceRefs: [
          `provider-authority:${'e'.repeat(64)}`,
          expect.stringMatching(/^provider-execution-ingress:[a-f0-9]{64}$/u),
        ],
      });
      expect(JSON.stringify(decision)).not.toContain('candidate_authority_unavailable');
    },
  );

  it('binds canonical Brain identity and returns the shared authority HOLD', () => {
    const authority = {
      state: 'hold',
      reasonCode: 'keyring_unavailable',
      authorityEvidenceRef: `provider-authority:${'d'.repeat(64)}`,
      retryable: false,
      close: vi.fn(),
    } as const;
    const config = {
      mode: 'balanced',
      modes: {
        balanced: {
          brain_model: 'claude-fable-5',
          default_model: 'claude-fable-5',
        },
      },
      providers: { brain: 'claude' },
    } as never;

    expect(preflightCliBrainProviderAuthority(
      authority,
      config,
      '/project',
      'cli-start:100',
    )).toMatchObject({
      decision: 'hold',
      reasonCode: 'keyring_unavailable',
      authorityEvidenceRefs: [
        authority.authorityEvidenceRef,
        expect.stringMatching(/^provider-execution-ingress:[a-f0-9]{64}$/u),
      ],
    });
  });
});
