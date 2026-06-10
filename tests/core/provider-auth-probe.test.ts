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

/** A spawn stub that fails the test if ever called (proves env short-circuit). */
const neverSpawn: AuthProbeSpawnImpl = async () => {
  throw new Error('spawn must not be called when env auth short-circuits');
};

describe('probeProviderAuth — claude (file/env based)', () => {
  it('logged-in via ANTHROPIC_API_KEY env (no file read needed)', async () => {
    const res = await probeProviderAuth('claude', {
      env: { ANTHROPIC_API_KEY: 'sk-ant-SECRET' },
      readFileImpl: () => {
        throw new Error('readFile must not be called when API key is set');
      },
      homeDir: HOME,
    });
    expect(res.state).toBe('logged-in');
    // Secret safety: the key value must never leak into detail.
    expect(res.detail ?? '').not.toContain('sk-ant-SECRET');
  });

  it('logged-in via credentials file (claudeAiOauth.accessToken present)', async () => {
    const creds = JSON.stringify({
      claudeAiOauth: { accessToken: 'oauth-SECRET-token', refreshToken: 'r', expiresAt: 9 },
    });
    const res = await probeProviderAuth('claude', {
      env: {},
      homeDir: HOME,
      readFileImpl: readFileStub({ [`${HOME}/.claude/.credentials.json`]: creds }),
    });
    expect(res.state).toBe('logged-in');
    expect(res.detail ?? '').not.toContain('oauth-SECRET-token');
  });

  it('logged-out when the credentials file is absent', async () => {
    const res = await probeProviderAuth('claude', {
      env: {},
      homeDir: HOME,
      readFileImpl: readFileStub({}), // every path throws ENOENT
    });
    expect(res.state).toBe('logged-out');
  });

  it('unknown when the credentials file is present but malformed JSON', async () => {
    const res = await probeProviderAuth('claude', {
      env: {},
      homeDir: HOME,
      readFileImpl: readFileStub({ [`${HOME}/.claude/.credentials.json`]: '{ not json' }),
    });
    expect(res.state).toBe('unknown');
  });

  it('logged-out when the credentials file exists but has no access token', async () => {
    const res = await probeProviderAuth('claude', {
      env: {},
      homeDir: HOME,
      readFileImpl: readFileStub({
        [`${HOME}/.claude/.credentials.json`]: JSON.stringify({ claudeAiOauth: {} }),
      }),
    });
    expect(res.state).toBe('logged-out');
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

  it('logged-in via OPENAI_API_KEY env WITHOUT spawning the CLI', async () => {
    const res = await probeProviderAuth('codex', {
      env: { OPENAI_API_KEY: 'sk-openai-SECRET' },
      spawnImpl: neverSpawn,
    });
    expect(res.state).toBe('logged-in');
    expect(res.detail ?? '').not.toContain('sk-openai-SECRET');
  });
});

describe('probeProviderAuth — gemini (file/env based)', () => {
  it('logged-in via GEMINI_API_KEY env', async () => {
    const res = await probeProviderAuth('gemini', {
      env: { GEMINI_API_KEY: 'g-SECRET' },
      homeDir: HOME,
      readFileImpl: () => {
        throw new Error('readFile must not be called when API key is set');
      },
    });
    expect(res.state).toBe('logged-in');
    expect(res.detail ?? '').not.toContain('g-SECRET');
  });

  it('logged-in via oauth_creds.json (access_token present)', async () => {
    const res = await probeProviderAuth('gemini', {
      env: {},
      homeDir: HOME,
      readFileImpl: readFileStub({
        [`${HOME}/.gemini/oauth_creds.json`]: JSON.stringify({ access_token: 'tok-SECRET' }),
      }),
    });
    expect(res.state).toBe('logged-in');
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
