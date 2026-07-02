import { describe, it, expect } from 'vitest';
import {
  probeProviderAuth,
  type AuthProbeResult,
  type AuthProbeState,
  type AuthProbeSpawnImpl,
  type AuthProbeSpawnResult,
  type AuthProbeReadFile,
} from '../../src/core/provider-auth-probe.js';

// PSL-6-WIRE (Sprint 356, task 356-009, MASTER-PLAN row 206): "CLI-present≠logged-in".
// This suite covers the ENRICHED status model — { present, authenticated, method,
// detail } added alongside the pre-existing { state, detail } shape — with a full
// present×authenticated matrix per provider, honest timeout→unknown behavior, and
// an explicit backward-compat check proving old consumers (doctor.ts,
// health-snapshot.ts, connect-wizard.ts — none of which read the new fields) keep
// working unchanged. Every seam (spawn / readFile / env / homeDir) is injected —
// fully hermetic, no real network/filesystem/subprocess access.

const HOME = '/fake/home';

function spawnStub(result: AuthProbeSpawnResult): AuthProbeSpawnImpl {
  return async () => result;
}

function readFileStub(files: Record<string, string>): AuthProbeReadFile {
  return (path: string) => {
    if (path in files) return files[path]!;
    const err = new Error(`ENOENT: no such file, open '${path}'`) as NodeJS.ErrnoException;
    err.code = 'ENOENT';
    throw err;
  };
}

describe('probeProviderAuth — enriched status matrix (present × authenticated × method)', () => {
  describe('claude', () => {
    it('ANTHROPIC_API_KEY set → present=true, authenticated=true, method=api-key', async () => {
      const res = await probeProviderAuth('claude', {
        env: { ANTHROPIC_API_KEY: 'sk-ant-SECRET' },
        homeDir: HOME,
        readFileImpl: () => {
          throw new Error('readFile must not be called when API key is set');
        },
      });
      expect(res).toMatchObject({
        state: 'logged-in',
        present: true,
        authenticated: true,
        method: 'api-key',
      });
    });

    it('credentials file with token → present=true, authenticated=true, method=subscription', async () => {
      const creds = JSON.stringify({
        claudeAiOauth: { accessToken: 'oauth-SECRET-token', refreshToken: 'r', expiresAt: 9 },
      });
      const res = await probeProviderAuth('claude', {
        env: {},
        homeDir: HOME,
        readFileImpl: readFileStub({ [`${HOME}/.claude/.credentials.json`]: creds }),
      });
      expect(res).toMatchObject({
        state: 'logged-in',
        present: true,
        authenticated: true,
        method: 'subscription',
      });
    });

    it('no credentials file → present=false, authenticated=false, method=none', async () => {
      const res = await probeProviderAuth('claude', {
        env: {},
        homeDir: HOME,
        readFileImpl: readFileStub({}),
      });
      expect(res).toMatchObject({
        state: 'logged-out',
        present: false,
        authenticated: false,
        method: 'none',
      });
    });

    it('malformed credentials JSON → present=true, authenticated=unknown (never guessed), method=none', async () => {
      const res = await probeProviderAuth('claude', {
        env: {},
        homeDir: HOME,
        readFileImpl: readFileStub({ [`${HOME}/.claude/.credentials.json`]: '{ not json' }),
      });
      expect(res).toMatchObject({
        state: 'unknown',
        present: true,
        authenticated: 'unknown',
        method: 'none',
      });
    });

    it('credentials file present but no token → present=true, authenticated=false, method=none', async () => {
      const res = await probeProviderAuth('claude', {
        env: {},
        homeDir: HOME,
        readFileImpl: readFileStub({
          [`${HOME}/.claude/.credentials.json`]: JSON.stringify({ claudeAiOauth: {} }),
        }),
      });
      expect(res).toMatchObject({
        state: 'logged-out',
        present: true,
        authenticated: false,
        method: 'none',
      });
    });
  });

  describe('codex', () => {
    it('OPENAI_API_KEY set → present=true, authenticated=true, method=api-key (no spawn)', async () => {
      const res = await probeProviderAuth('codex', {
        env: { OPENAI_API_KEY: 'sk-openai-SECRET' },
        spawnImpl: async () => {
          throw new Error('spawn must not be called when env auth short-circuits');
        },
      });
      expect(res).toMatchObject({
        state: 'logged-in',
        present: true,
        authenticated: true,
        method: 'api-key',
      });
    });

    it('"Not logged in" stdout (exit 0) → present=true, authenticated=false, method=none', async () => {
      const res = await probeProviderAuth('codex', {
        env: {},
        spawnImpl: spawnStub({ status: 0, stdout: 'Not logged in\n', timedOut: false }),
      });
      expect(res).toMatchObject({
        state: 'logged-out',
        present: true,
        authenticated: false,
        method: 'none',
      });
    });

    it('"Logged in using ChatGPT" stdout → present=true, authenticated=true, method=subscription', async () => {
      const res = await probeProviderAuth('codex', {
        env: {},
        spawnImpl: spawnStub({
          status: 0,
          stdout: 'Logged in using ChatGPT (account: a@b.c)\n',
          timedOut: false,
        }),
      });
      expect(res).toMatchObject({
        state: 'logged-in',
        present: true,
        authenticated: true,
        method: 'subscription',
      });
    });

    it('spawnError (CLI missing) → present=false, authenticated=false, method=none', async () => {
      const res = await probeProviderAuth('codex', {
        env: {},
        spawnImpl: spawnStub({ status: null, stdout: '', timedOut: false, spawnError: true }),
      });
      expect(res).toMatchObject({
        state: 'unknown',
        present: false,
        authenticated: false,
        method: 'none',
      });
    });

    it('timeout → present=unknown, authenticated=unknown, method=none, state=unknown (honest, never guessed)', async () => {
      const res = await probeProviderAuth('codex', {
        env: {},
        spawnImpl: spawnStub({ status: null, stdout: '', timedOut: true }),
        timeoutMs: 10,
      });
      expect(res).toMatchObject({
        state: 'unknown',
        present: 'unknown',
        authenticated: 'unknown',
        method: 'none',
      });
    });

    it('indeterminate stdout → present=true (CLI answered), authenticated=unknown, method=none', async () => {
      const res = await probeProviderAuth('codex', {
        env: {},
        spawnImpl: spawnStub({ status: 0, stdout: 'some unrelated output\n', timedOut: false }),
      });
      expect(res).toMatchObject({
        state: 'unknown',
        present: true,
        authenticated: 'unknown',
        method: 'none',
      });
    });
  });

  describe('gemini', () => {
    it('GEMINI_API_KEY set → present=true, authenticated=true, method=api-key', async () => {
      const res = await probeProviderAuth('gemini', {
        env: { GEMINI_API_KEY: 'g-SECRET' },
        homeDir: HOME,
        readFileImpl: () => {
          throw new Error('readFile must not be called when API key is set');
        },
      });
      expect(res).toMatchObject({
        state: 'logged-in',
        present: true,
        authenticated: true,
        method: 'api-key',
      });
    });

    it('oauth_creds.json with access_token → present=true, authenticated=true, method=subscription', async () => {
      const res = await probeProviderAuth('gemini', {
        env: {},
        homeDir: HOME,
        readFileImpl: readFileStub({
          [`${HOME}/.gemini/oauth_creds.json`]: JSON.stringify({ access_token: 'tok-SECRET' }),
        }),
      });
      expect(res).toMatchObject({
        state: 'logged-in',
        present: true,
        authenticated: true,
        method: 'subscription',
      });
    });

    it('no oauth file and no env key → present=false, authenticated=false, method=none', async () => {
      const res = await probeProviderAuth('gemini', {
        env: {},
        homeDir: HOME,
        readFileImpl: readFileStub({}),
      });
      expect(res).toMatchObject({
        state: 'logged-out',
        present: false,
        authenticated: false,
        method: 'none',
      });
    });

    it('malformed oauth file → present=true, authenticated=unknown (never guessed), method=none', async () => {
      const res = await probeProviderAuth('gemini', {
        env: {},
        homeDir: HOME,
        readFileImpl: readFileStub({ [`${HOME}/.gemini/oauth_creds.json`]: 'not-json' }),
      });
      expect(res).toMatchObject({
        state: 'unknown',
        present: true,
        authenticated: 'unknown',
        method: 'none',
      });
    });
  });

  describe('unsupported provider', () => {
    it('present=unknown, authenticated=unknown, method=none — honest, never guessed', async () => {
      const res = await probeProviderAuth('mystery-provider', { env: {} });
      expect(res).toMatchObject({
        state: 'unknown',
        present: 'unknown',
        authenticated: 'unknown',
        method: 'none',
      });
    });
  });
});

describe('probeProviderAuth — never-throw honesty contract holds for the enriched fields', () => {
  it('resolves (never rejects) even when readFileImpl throws an unexpected, non-ENOENT error', async () => {
    const res = await probeProviderAuth('claude', {
      env: {},
      homeDir: HOME,
      readFileImpl: () => {
        throw new Error('EACCES: permission denied');
      },
    });
    // Any throw from the file seam is treated the same as "not present" — the
    // module's existing contract (a throw ⇒ logged-out, never a crash).
    expect(res.state).toBe('logged-out');
    expect(res.present).toBe(false);
    expect(res.authenticated).toBe(false);
    expect(res.method).toBe('none');
  });

  it('resolves (never rejects) when the spawn seam itself times out mid-flight', async () => {
    const res = await probeProviderAuth('codex', {
      env: {},
      spawnImpl: spawnStub({ status: null, stdout: '', timedOut: true }),
      timeoutMs: 5,
    });
    expect(res.state).toBe('unknown');
    expect(res.present).toBe('unknown');
    expect(res.authenticated).toBe('unknown');
  });
});

describe('probeProviderAuth — backward compatibility (doctor.ts / health-snapshot.ts / connect-wizard.ts)', () => {
  // These consumers only ever read `.state` and `.detail` (verified by inspection:
  // doctor.ts's formatConnectorHealthLines checks `probe?.state === 'logged-out'`;
  // health-snapshot.ts's resolveAuthField checks `result.state`; connect-wizard.ts
  // declares its own narrower local `{ state, detail? }` type). A result produced
  // by the enriched probe must still satisfy that narrow shape byte-for-byte.

  function assertNarrowShapeStillWorks(res: AuthProbeResult, expectedState: AuthProbeState): void {
    // Structural narrowing exactly like the old consumers do — must compile and
    // behave identically whether or not the new fields are present on the object.
    const narrow: { state: AuthProbeState; detail?: string } = res;
    expect(narrow.state).toBe(expectedState);
  }

  it('claude logged-in result narrows to the old { state, detail? } shape', async () => {
    const res = await probeProviderAuth('claude', {
      env: { ANTHROPIC_API_KEY: 'sk-ant-SECRET' },
      homeDir: HOME,
    });
    assertNarrowShapeStillWorks(res, 'logged-in');
    expect(typeof res.detail === 'string' || res.detail === undefined).toBe(true);
  });

  it('codex logged-out result narrows to the old { state, detail? } shape', async () => {
    const res = await probeProviderAuth('codex', {
      env: {},
      spawnImpl: spawnStub({ status: 0, stdout: 'Not logged in\n', timedOut: false }),
    });
    assertNarrowShapeStillWorks(res, 'logged-out');
  });

  it('a bare pre-enrichment-style literal ({ state, detail? } only) still satisfies AuthProbeResult', () => {
    // Proves the new fields are optional — every pre-existing fixture across
    // tests/cli/health-snapshot.test.ts, doctor-auth-probe.test.ts,
    // connect-wizard.test.ts, connect-cmd.test.ts (out of this task's write
    // scope) keeps compiling untouched, and doctor.ts's own `{ state: 'unknown',
    // detail: 'auth probe failed' }` fallback literal remains valid.
    const legacy: AuthProbeResult = { state: 'unknown', detail: 'auth probe failed' };
    expect(legacy.present).toBeUndefined();
    expect(legacy.authenticated).toBeUndefined();
    expect(legacy.method).toBeUndefined();
  });

  it('unsupported-provider result still matches the pre-existing detail wording', async () => {
    const res = await probeProviderAuth('mystery-provider', { env: {} });
    expect(res.state).toBe('unknown');
    expect(res.detail).toMatch(/unsupported provider/i);
  });
});
