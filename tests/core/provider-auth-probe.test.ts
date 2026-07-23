import { describe, it, expect } from 'vitest';
import {
  probeProviderAuth,
  type AuthProbeSpawnImpl,
  type AuthProbeSpawnResult,
  type AuthProbeReadFile,
} from '../../src/core/provider-auth-probe.js';

// PSL-6 (Sprint 270): "CLI present ≠ logged in". probeProviderAuth distinguishes
// a usable session from a merely-installed binary (GAP-4). Every probe seam
// (spawn / readFile / env / homeDir) is injected here so the suite is fully
// hermetic — no real network, filesystem, or subprocess access.

const HOME = '/fake/home';

/** Build a spawn stub that returns a canned secret-free result and records calls. */
function spawnStub(result: AuthProbeSpawnResult): {
  impl: AuthProbeSpawnImpl;
  calls: Array<{ command: string; args: readonly string[] }>;
} {
  const calls: Array<{ command: string; args: readonly string[] }> = [];
  const impl: AuthProbeSpawnImpl = async (command, args) => {
    calls.push({ command, args });
    return result;
  };
  return { impl, calls };
}

/** A readFile stub: returns mapped content, or throws ENOENT-like for unmapped paths. */
function readFileStub(files: Record<string, string>): AuthProbeReadFile {
  return (path: string) => {
    if (path in files) return files[path]!;
    const err = new Error(`ENOENT: no such file, open '${path}'`) as NodeJS.ErrnoException;
    err.code = 'ENOENT';
    throw err;
  };
}

/** A spawn stub that fails the test if ever called (proves env presence stays call-free). */
const neverSpawn: AuthProbeSpawnImpl = async () => {
  throw new Error('spawn must not be called for configured API-key presence');
};

describe('probeProviderAuth — claude (structured CLI status)', () => {
  it('keeps ANTHROPIC_API_KEY presence unknown without a paid provider request', async () => {
    const res = await probeProviderAuth('claude', {
      env: { ANTHROPIC_API_KEY: 'sk-ant-SECRET' },
      spawnImpl: neverSpawn,
    });
    expect(res).toMatchObject({
      state: 'unknown', present: true, authenticated: 'unknown', method: 'api-key',
    });
    expect(res.detail ?? '').not.toContain('sk-ant-SECRET');
  });

  it('accepts only exit 0 + structured loggedIn=true', async () => {
    const { impl, calls } = spawnStub({
      status: 0,
      stdout: JSON.stringify({
        loggedIn: true,
        authMethod: 'claude.ai',
        email: 'private@example.test',
        orgId: 'private-org',
      }),
      timedOut: false,
    });
    const res = await probeProviderAuth('claude', {
      env: {},
      spawnImpl: impl,
    });
    expect(res).toMatchObject({
      state: 'logged-in', present: true, authenticated: true, method: 'subscription',
    });
    expect(calls).toEqual([{ command: 'claude', args: ['auth', 'status', '--json'] }]);
    expect(JSON.stringify(res)).not.toContain('private@example.test');
    expect(JSON.stringify(res)).not.toContain('private-org');
  });

  it('reports structured loggedIn=false as logged-out', async () => {
    const { impl } = spawnStub({
      status: 0, stdout: JSON.stringify({ loggedIn: false, email: 'must-not-leak@example.test' }), timedOut: false,
    });
    const res = await probeProviderAuth('claude', {
      env: {},
      spawnImpl: impl,
    });
    expect(res).toMatchObject({
      state: 'logged-out', present: true, authenticated: false, method: 'none',
    });
    expect(JSON.stringify(res)).not.toContain('must-not-leak@example.test');
  });

  it.each([
    [{ status: 0, stdout: 'not-json', timedOut: false }, /unparseable/i],
    [{ status: 7, stdout: '{"loggedIn":true}', timedOut: false }, /non-zero/i],
    [{ status: null, stdout: '', timedOut: true }, /timed out/i],
    [{ status: null, stdout: '', timedOut: false, spawnError: true }, /not available/i],
  ] as const)('keeps failed status evidence unknown', async (result, detail) => {
    const { impl } = spawnStub(result);
    const res = await probeProviderAuth('claude', {
      env: {},
      spawnImpl: impl,
    });
    expect(res).toMatchObject({ state: 'unknown', authenticated: 'unknown', method: 'none' });
    expect(res.detail).toMatch(detail);
  });

  it('does not accept truthy or missing loggedIn values', async () => {
    for (const payload of [{ loggedIn: 'true' }, { authMethod: 'claude.ai' }]) {
      const { impl } = spawnStub({ status: 0, stdout: JSON.stringify(payload), timedOut: false });
      const res = await probeProviderAuth('claude', { env: {}, spawnImpl: impl });
      expect(res).toMatchObject({ state: 'unknown', authenticated: 'unknown' });
    }
  });

  it('preserves an exact API-key method reported by the CLI status contract', async () => {
    const { impl } = spawnStub({
      status: 0, stdout: JSON.stringify({ loggedIn: true, authMethod: 'api_key' }), timedOut: false,
    });
    const res = await probeProviderAuth('claude', { env: {}, spawnImpl: impl });
    expect(res).toMatchObject({ state: 'logged-in', authenticated: true, method: 'api-key' });
  });
});

describe('probeProviderAuth — codex (CLI based)', () => {
  it('logged-out from "Not logged in" stdout EVEN with exit 0 (substring-trap guard)', async () => {
    // codex login status prints "Not logged in" with exit 0 — the logged-OUT
    // pattern must win over the "logged in" substring.
    const { impl, calls } = spawnStub({ status: 0, stdout: 'Not logged in\n', timedOut: false });
    const res = await probeProviderAuth('codex', { env: {}, spawnImpl: impl });
    expect(res.state).toBe('logged-out');
    expect(calls[0]).toEqual({ command: 'codex', args: ['login', 'status'] });
  });

  it('logged-in from "Logged in using ChatGPT" stdout', async () => {
    const { impl } = spawnStub({
      status: 0,
      stdout: 'Logged in using ChatGPT (account: a@b.c)\n',
      timedOut: false,
    });
    const res = await probeProviderAuth('codex', { env: {}, spawnImpl: impl });
    expect(res.state).toBe('logged-in');
  });

  it('unknown on probe timeout', async () => {
    const { impl } = spawnStub({ status: null, stdout: '', timedOut: true });
    const res = await probeProviderAuth('codex', { env: {}, spawnImpl: impl, timeoutMs: 10 });
    expect(res.state).toBe('unknown');
    expect(res.detail).toMatch(/timed out/i);
  });

  it('unknown when the codex CLI is missing (spawnError)', async () => {
    const { impl } = spawnStub({ status: null, stdout: '', timedOut: false, spawnError: true });
    const res = await probeProviderAuth('codex', { env: {}, spawnImpl: impl });
    expect(res.state).toBe('unknown');
    expect(res.detail).toMatch(/not available/i);
  });

  it('unknown on indeterminate stdout (no login keywords)', async () => {
    const { impl } = spawnStub({ status: 0, stdout: 'some unrelated output\n', timedOut: false });
    const res = await probeProviderAuth('codex', { env: {}, spawnImpl: impl });
    expect(res.state).toBe('unknown');
  });

  it('keeps OPENAI_API_KEY presence unknown WITHOUT spawning the CLI', async () => {
    const res = await probeProviderAuth('codex', {
      env: { OPENAI_API_KEY: 'sk-openai-SECRET' },
      spawnImpl: neverSpawn,
    });
    expect(res).toMatchObject({
      state: 'unknown', present: true, authenticated: 'unknown', method: 'api-key',
    });
    expect(res.detail ?? '').not.toContain('sk-openai-SECRET');
  });
});

describe('probeProviderAuth — gemini (file/env based)', () => {
  it('keeps GEMINI_API_KEY presence unknown without a paid provider request', async () => {
    const res = await probeProviderAuth('gemini', {
      env: { GEMINI_API_KEY: 'g-SECRET' },
      homeDir: HOME,
      readFileImpl: () => {
        throw new Error('readFile must not be called when API key is set');
      },
    });
    expect(res).toMatchObject({
      state: 'unknown', present: true, authenticated: 'unknown', method: 'api-key',
    });
    expect(res.detail ?? '').not.toContain('g-SECRET');
  });

  it('keeps oauth_creds.json token presence unknown without a supported status command', async () => {
    const res = await probeProviderAuth('gemini', {
      env: {},
      homeDir: HOME,
      readFileImpl: readFileStub({
        [`${HOME}/.gemini/oauth_creds.json`]: JSON.stringify({ access_token: 'tok-SECRET' }),
      }),
    });
    expect(res).toMatchObject({
      state: 'unknown', present: true, authenticated: 'unknown', method: 'subscription',
    });
    expect(res.detail ?? '').not.toContain('tok-SECRET');
  });

  it('logged-out when no oauth file and no env key', async () => {
    const res = await probeProviderAuth('gemini', {
      env: {},
      homeDir: HOME,
      readFileImpl: readFileStub({}),
    });
    expect(res.state).toBe('logged-out');
  });

  it('unknown when oauth file is malformed', async () => {
    const res = await probeProviderAuth('gemini', {
      env: {},
      homeDir: HOME,
      readFileImpl: readFileStub({ [`${HOME}/.gemini/oauth_creds.json`]: 'not-json' }),
    });
    expect(res.state).toBe('unknown');
  });
});

describe('probeProviderAuth — defensive', () => {
  it('returns unknown for an unsupported provider', async () => {
    const res = await probeProviderAuth('mystery-provider', { env: {} });
    expect(res.state).toBe('unknown');
    expect(res.detail).toMatch(/unsupported provider/i);
  });

  it('never leaks any provided secret value into detail across all states', async () => {
    // One end-to-end sweep: gather every detail and assert no known secret appears.
    const results = await Promise.all([
      probeProviderAuth('claude', { env: { ANTHROPIC_API_KEY: 'CLAUDE_SECRET' } }),
      probeProviderAuth('codex', {
        env: {},
        spawnImpl: async () => ({ status: 0, stdout: 'Logged in token=DEEP_SECRET', timedOut: false }),
      }),
      probeProviderAuth('gemini', { env: { GOOGLE_API_KEY: 'GOOGLE_SECRET' } }),
    ]);
    const allDetails = results.map((r) => r.detail ?? '').join(' | ');
    expect(allDetails).not.toContain('CLAUDE_SECRET');
    expect(allDetails).not.toContain('DEEP_SECRET');
    expect(allDetails).not.toContain('GOOGLE_SECRET');
  });
});
