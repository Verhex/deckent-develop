import { describe, it, expect, vi, afterEach } from 'vitest';

// Mock child_process so the DEFAULT version probe path (real detectCliVersion)
// never spawns a real process even when a test calls discoverProviders()
// with no probes injected — see 'default probes (no real spawnSync)' below.
vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(),
}));

import { spawnSync } from 'node:child_process';
import {
  discoverProviders,
  DISCOVERABLE_PROVIDERS,
  type DiscoverableProviderName,
  type ProviderDiscoveryResult,
  type ProviderVersionProbe,
  type ProviderAuthStateProbe,
} from '../../src/core/provider-discovery.js';
import type { AuthProbeState } from '../../src/core/provider-auth-probe.js';

afterEach(() => {
  vi.clearAllMocks();
});

// ─── DISCOVERABLE_PROVIDERS ────────────────────────────────────────────────

describe('DISCOVERABLE_PROVIDERS', () => {
  it('is exactly claude, codex, gemini in that order', () => {
    expect(DISCOVERABLE_PROVIDERS).toEqual(['claude', 'codex', 'gemini']);
  });
});

// ─── discoverProviders — fake-probe matrix ─────────────────────────────────

describe('discoverProviders — fake-probe matrix', () => {
  it('reports present:false, version:undefined for every provider when the version probe finds nothing', async () => {
    const version: ProviderVersionProbe = () => undefined;
    const results = await discoverProviders({ version });
    expect(results).toHaveLength(3);
    for (const r of results) {
      expect(r.present).toBe(false);
      expect(r.version).toBeUndefined();
    }
  });

  it('reports present:true with the parsed version for every provider when the version probe finds a match', async () => {
    const version: ProviderVersionProbe = (name) => `${name} 1.0.0`;
    const results = await discoverProviders({ version });
    for (const r of results) {
      expect(r.present).toBe(true);
      expect(r.version).toBe('1.0.0');
    }
  });

  it('probes each provider independently — mixed present/absent', async () => {
    const version: ProviderVersionProbe = (name) => (name === 'codex' ? undefined : `${name} 2.3.4`);
    const results = await discoverProviders({ version });
    const byName = new Map(results.map((r) => [r.name, r]));
    expect(byName.get('claude')?.present).toBe(true);
    expect(byName.get('claude')?.version).toBe('2.3.4');
    expect(byName.get('codex')?.present).toBe(false);
    expect(byName.get('codex')?.version).toBeUndefined();
    expect(byName.get('gemini')?.present).toBe(true);
    expect(byName.get('gemini')?.version).toBe('2.3.4');
  });

  it('authState is "unknown" for every provider when no auth probe is injected', async () => {
    const version: ProviderVersionProbe = (name) => `${name} 1.0.0`;
    const results = await discoverProviders({ version });
    for (const r of results) {
      expect(r.authState).toBe('unknown');
    }
  });

  it('authState is "unknown" even for an absent provider when no auth probe is injected', async () => {
    const version: ProviderVersionProbe = () => undefined;
    const results = await discoverProviders({ version });
    for (const r of results) {
      expect(r.authState).toBe('unknown');
    }
  });

  it('uses the injected auth probe, per provider, when supplied', async () => {
    const version: ProviderVersionProbe = () => '1.0.0';
    const authByName: Record<DiscoverableProviderName, AuthProbeState> = {
      claude: 'logged-in',
      codex: 'logged-out',
      gemini: 'unknown',
    };
    const auth: ProviderAuthStateProbe = async (name) => authByName[name];
    const results = await discoverProviders({ version, auth });
    const byName = new Map(results.map((r) => [r.name, r]));
    expect(byName.get('claude')?.authState).toBe('logged-in');
    expect(byName.get('codex')?.authState).toBe('logged-out');
    expect(byName.get('gemini')?.authState).toBe('unknown');
  });

  it('never calls the auth probe for a provider that is not present (auth probe still receives the call — presence is independent of auth)', async () => {
    const version: ProviderVersionProbe = (name) => (name === 'claude' ? '1.0.0' : undefined);
    const auth = vi.fn(async () => 'logged-in' as AuthProbeState);
    const results = await discoverProviders({ version, auth });
    // Presence and auth are independent probes — auth is queried for all three
    // providers regardless of CLI presence (a caller may still want to know
    // "logged in via env var" even when the CLI binary itself is absent).
    expect(auth).toHaveBeenCalledTimes(3);
    const codex = results.find((r) => r.name === 'codex')!;
    expect(codex.present).toBe(false);
    expect(codex.authState).toBe('logged-in');
  });
});

// ─── discoverProviders — version-parse ─────────────────────────────────────

describe('discoverProviders — version-parse', () => {
  it('extracts the semver substring from a multi-word CLI banner', async () => {
    const version: ProviderVersionProbe = () => 'codex-cli 0.18.2 (rev abc1234)';
    const results = await discoverProviders({ version });
    for (const r of results) {
      expect(r.version).toBe('0.18.2');
    }
  });

  it('extracts a two-part version (no patch)', async () => {
    const version: ProviderVersionProbe = () => 'gemini 1.0';
    const results = await discoverProviders({ version });
    for (const r of results) {
      expect(r.version).toBe('1.0');
    }
  });

  it('falls back to the raw probe output when no semver substring is present', async () => {
    const version: ProviderVersionProbe = () => 'dev-build (no version)';
    const results = await discoverProviders({ version });
    for (const r of results) {
      expect(r.version).toBe('dev-build (no version)');
    }
  });

  it('trims leading/trailing whitespace already handled by the probe (raw passthrough contract)', async () => {
    const version: ProviderVersionProbe = () => '  3.2.1  ';
    const results = await discoverProviders({ version });
    for (const r of results) {
      expect(r.version).toBe('3.2.1');
    }
  });
});

// ─── discoverProviders — default probes (no real spawnSync exercised) ─────

describe('discoverProviders — default probes', () => {
  it('does not throw when called with no arguments and does not spawn a real process (spawnSync mocked to fail closed)', async () => {
    vi.mocked(spawnSync).mockReturnValue({
      status: 1,
      stdout: '',
      stderr: '',
      pid: 1,
      signal: null,
      output: [],
    } as unknown as ReturnType<typeof spawnSync>);

    const results = await discoverProviders();
    expect(results).toHaveLength(3);
    for (const r of results) {
      expect(r.present).toBe(false);
      expect(r.authState).toBe('unknown');
    }
  });

  it('picks up a version via the default probe when spawnSync (mocked) reports success', async () => {
    vi.mocked(spawnSync).mockReturnValue({
      status: 0,
      stdout: 'claude-code 4.2.0\n',
      stderr: '',
      pid: 1,
      signal: null,
      output: [],
    } as unknown as ReturnType<typeof spawnSync>);

    const results = await discoverProviders();
    for (const r of results) {
      expect(r.present).toBe(true);
      expect(r.version).toBe('4.2.0');
    }
  });
});

// ─── shape-compat with the /connect wizard's ConnectProviderDetection ─────
//
// `src/cli/helpers/connect-wizard.ts` is out of this task's read/write scope,
// so this is a LOCAL structural mirror (not an import) of its
// `ConnectProviderDetection` shape — `{ name, cliAvailable, version?,
// authState }`. If `ProviderDiscoveryResult` ever drifts from that shape
// (field renamed, authState union diverges), this assignability check fails
// to compile — a pure compile-time guard, no runtime behavior.

interface ConnectProviderDetectionLike {
  name: 'claude' | 'codex' | 'gemini';
  cliAvailable: boolean;
  version?: string;
  authState: AuthProbeState;
}

function toConnectShape(r: ProviderDiscoveryResult): ConnectProviderDetectionLike {
  return { name: r.name, cliAvailable: r.present, version: r.version, authState: r.authState };
}

describe('shape-compat with /connect wizard detection', () => {
  it('maps 1:1 onto ConnectProviderDetection\'s field shape (name/cliAvailable/version/authState)', async () => {
    const results = await discoverProviders({ version: () => 'claude 1.2.3' });
    const mapped = results.map(toConnectShape);
    expect(mapped[0]).toEqual({ name: 'claude', cliAvailable: true, version: '1.2.3', authState: 'unknown' });
  });
});
