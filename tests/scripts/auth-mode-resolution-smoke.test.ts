import { describe, it, expect } from 'vitest';

// Dynamic import — smoke script is ESM (.mjs), no TypeScript compilation.
import {
  buildDockerEnvArgs,
  resolveUseApiOnly,
  runSmoke,
} from '../../scripts/auth-mode-resolution-smoke.mjs';

// ─── resolveUseApiOnly ────────────────────────────────────────────────────────

describe('auth-mode-resolution-smoke — resolveUseApiOnly', () => {
  it('returns false for subscription', () => {
    expect(resolveUseApiOnly('subscription')).toBe(false);
  });

  it('returns true for api', () => {
    expect(resolveUseApiOnly('api')).toBe(true);
  });

  it('returns false for undefined (default is subscription)', () => {
    expect(resolveUseApiOnly(undefined)).toBe(false);
  });
});

// ─── buildDockerEnvArgs ───────────────────────────────────────────────────────

describe('auth-mode-resolution-smoke — buildDockerEnvArgs', () => {
  it('subscription + ANTHROPIC_API_KEY set → key NOT in docker args', () => {
    const env = { ANTHROPIC_API_KEY: 'sk-ant-sub-test' };
    const args = buildDockerEnvArgs({
      useApiOnly: resolveUseApiOnly('subscription'),
      providerBinary: 'claude',
      env,
    });
    expect(args.some((a: string) => a.includes('ANTHROPIC_API_KEY'))).toBe(false);
  });

  it('api mode + ANTHROPIC_API_KEY set → key IS in docker args with correct value', () => {
    const env = { ANTHROPIC_API_KEY: 'sk-ant-api-test-xyz' };
    const args = buildDockerEnvArgs({
      useApiOnly: resolveUseApiOnly('api'),
      providerBinary: 'claude',
      env,
    });
    expect(args.some((a: string) => a.includes('ANTHROPIC_API_KEY'))).toBe(true);
    expect(args).toContain('ANTHROPIC_API_KEY=sk-ant-api-test-xyz');
  });

  it('default (undefined) auth_mode → treated as subscription → key NOT in args', () => {
    const env = { ANTHROPIC_API_KEY: 'sk-ant-default-test' };
    const args = buildDockerEnvArgs({
      useApiOnly: resolveUseApiOnly(undefined),
      providerBinary: 'claude',
      env,
    });
    expect(args.some((a: string) => a.includes('ANTHROPIC_API_KEY'))).toBe(false);
  });

  it('codex provider + OPENAI_API_KEY → OPENAI forwarded, ANTHROPIC not forwarded', () => {
    const env = {
      OPENAI_API_KEY: 'sk-openai-test-key',
      ANTHROPIC_API_KEY: 'sk-ant-should-be-stripped',
    };
    const args = buildDockerEnvArgs({
      useApiOnly: resolveUseApiOnly('subscription'),
      providerBinary: 'codex',
      env,
    });
    expect(args.some((a: string) => a.includes('OPENAI_API_KEY'))).toBe(true);
    expect(args.some((a: string) => a.includes('ANTHROPIC_API_KEY'))).toBe(false);
    expect(args).toContain('OPENAI_API_KEY=sk-openai-test-key');
  });

  it('gemini provider + GOOGLE_API_KEY → GOOGLE forwarded, ANTHROPIC not forwarded', () => {
    const env = {
      GOOGLE_API_KEY: 'google-test-key',
      ANTHROPIC_API_KEY: 'sk-ant-should-be-stripped',
    };
    const args = buildDockerEnvArgs({
      useApiOnly: resolveUseApiOnly('subscription'),
      providerBinary: 'gemini',
      env,
    });
    expect(args.some((a: string) => a.includes('GOOGLE_API_KEY'))).toBe(true);
    expect(args.some((a: string) => a.includes('ANTHROPIC_API_KEY'))).toBe(false);
  });

  it('empty env produces empty args array', () => {
    const args = buildDockerEnvArgs({
      useApiOnly: false,
      providerBinary: 'claude',
      env: {},
    });
    expect(args).toHaveLength(0);
  });
});

// ─── runSmoke integration ─────────────────────────────────────────────────────

describe('auth-mode-resolution-smoke — runSmoke', () => {
  it('runSmoke passes all 4 scenarios', async () => {
    const result = await runSmoke();
    expect(result.pass).toBe(true);
    expect(result.reason).toBeUndefined();
    expect(result.scenarios.filter((s: string) => s.startsWith('PASS'))).toHaveLength(4);
    expect(result.scenarios.filter((s: string) => s.startsWith('FAIL'))).toHaveLength(0);
  });
});
