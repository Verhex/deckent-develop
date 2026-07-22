/**
 * TERM-1 (Sprint 351, Task 351-001) — health-snapshot hermetic tests.
 *
 * Proves buildHealthSnapshot() is field-level fail-soft (a broken/slow probe
 * degrades ONLY that field to 'unknown', never throws / never blocks the
 * others) and that the model field is genuinely sourced from the live
 * modelRegistry (not a hardcoded literal). renderHealthSnapshot() is proven
 * i18n'd (en/tr differ) and NO_COLOR-respecting.
 *
 * Hermetic: config/auth/mcp are injected fakes; the ONE real-I/O path
 * (memory.db) uses a tmpdir MemoryStore, cleaned up in afterEach.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildHealthSnapshot,
  renderHealthSnapshot,
  type HealthSnapshotDeps,
} from '../../src/cli/helpers/health-snapshot.js';
import { mergeConfigs } from '../../src/core/config.js';
import type { ResolvedConfig } from '../../src/core/config-types.js';
import { modelRegistry } from '../../src/core/model-registry.js';
import { MemoryStore } from '../../src/core/memory-store.js';
import type { AuthProbeResult } from '../../src/core/provider-auth-probe.js';

// ─── Fixtures ────────────────────────────────────────────────────────────

function makeConfig(overrides: Record<string, unknown> = {}): ResolvedConfig {
  // mergeConfigs deep-merges `overrides` (incl. the untyped `chat_provider`
  // widened field — see config.ts DeckentConfigWithChatProvider) on top of
  // the real project defaults, so activeModeConfig/mode/memory_budget/
  // chat_provider all come out exactly as loadConfig() would resolve them.
  return mergeConfigs(null, overrides as Parameters<typeof mergeConfigs>[1]);
}

const NOOP_MCP = (): Record<string, never> => ({});

let dirs: string[] = [];
afterEach(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
  dirs = [];
});

function makeTmpRoot(): string {
  const d = mkdtempSync(join(tmpdir(), 'health-snapshot-'));
  dirs.push(d);
  return d;
}

// ─── buildHealthSnapshot: provider / model / mode ─────────────────────────

describe('buildHealthSnapshot — provider/model/mode field-level fail-soft', () => {
  it('config load failure degrades provider/model/mode/auth to unknown — never throws', async () => {
    const root = makeTmpRoot();
    const deps: HealthSnapshotDeps = {
      loadConfigFn: async () => { throw new Error('disk unavailable'); },
      loadMcpServersFn: NOOP_MCP,
      readMemoryCountFn: () => undefined,
    };
    const snapshot = await buildHealthSnapshot(root, deps);
    expect(snapshot.provider.status).toBe('unknown');
    expect(snapshot.model.status).toBe('unknown');
    expect(snapshot.mode.status).toBe('unknown');
    expect(snapshot.auth.status).toBe('unknown');
    expect(snapshot.cwd).toBe(root);
  });

  it('config load timeout (never resolves) degrades to unknown within the snapshot budget', async () => {
    const root = makeTmpRoot();
    const deps: HealthSnapshotDeps = {
      loadConfigFn: () => new Promise<ResolvedConfig>(() => { /* never resolves */ }),
      loadMcpServersFn: NOOP_MCP,
      readMemoryCountFn: () => undefined,
    };
    const started = Date.now();
    const snapshot = await buildHealthSnapshot(root, deps);
    expect(Date.now() - started).toBeLessThan(1000);
    expect(snapshot.provider.status).toBe('unknown');
  });

  it('resolved config with a valid provider — provider field is ok', async () => {
    const root = makeTmpRoot();
    const cfg = makeConfig({ brain_provider: 'claude', mode: 'balanced' });
    const deps: HealthSnapshotDeps = {
      loadConfigFn: async () => cfg,
      loadMcpServersFn: NOOP_MCP,
      readMemoryCountFn: () => undefined,
      probeAuthFn: async (): Promise<AuthProbeResult> => ({ state: 'unknown' }),
    };
    const snapshot = await buildHealthSnapshot(root, deps);
    expect(snapshot.provider.status).toBe('ok');
    expect(snapshot.provider.label).toBe('claude');
  });

  it('missing brain_model on the active mode degrades model to unknown while provider stays ok', async () => {
    const root = makeTmpRoot();
    // validateConfig rejects an empty/unknown brain_model at mergeConfigs time
    // (by design — it's not a state loadConfig() can actually produce on disk),
    // so the fail-soft path is exercised by mutating an already-VALID resolved
    // config's activeModeConfig afterward (validation already ran + passed).
    const valid = makeConfig({ brain_provider: 'claude', mode: 'balanced' });
    const cfg: ResolvedConfig = {
      ...valid,
      activeModeConfig: { ...valid.activeModeConfig, brain_model: '' },
    };
    const deps: HealthSnapshotDeps = {
      loadConfigFn: async () => cfg,
      loadMcpServersFn: NOOP_MCP,
      readMemoryCountFn: () => undefined,
      probeAuthFn: async (): Promise<AuthProbeResult> => ({ state: 'unknown' }),
    };
    const snapshot = await buildHealthSnapshot(root, deps);
    expect(snapshot.provider.status).toBe('ok');
    expect(snapshot.model.status).toBe('unknown');
  });

  it('model label is sourced LIVE from modelRegistry — not a hardcoded literal', async () => {
    const root = makeTmpRoot();
    const cfg = makeConfig({ brain_provider: 'claude', mode: 'balanced' }); // default brain_model='claude-sonnet-5'
    const deps: HealthSnapshotDeps = {
      loadConfigFn: async () => cfg,
      loadMcpServersFn: NOOP_MCP,
      readMemoryCountFn: () => undefined,
      probeAuthFn: async (): Promise<AuthProbeResult> => ({ state: 'unknown' }),
    };
    const snapshot = await buildHealthSnapshot(root, deps);
    const liveApiId = modelRegistry.getOrThrow('claude-sonnet-5').apiId; // ground truth from the registry, not a literal
    expect(snapshot.model.status).toBe('ok');
    expect(snapshot.model.label).toContain(liveApiId);
  });

  it('non-registry-typed provider (ollama) still resolves the model via the parametric registry path', async () => {
    const root = makeTmpRoot();
    const cfg = makeConfig({ brain_provider: 'claude', chat_provider: 'ollama', mode: 'balanced' });
    const deps: HealthSnapshotDeps = {
      loadConfigFn: async () => cfg,
      loadMcpServersFn: NOOP_MCP,
      readMemoryCountFn: () => undefined,
      probeAuthFn: async (): Promise<AuthProbeResult> => ({ state: 'unknown' }),
    };
    const snapshot = await buildHealthSnapshot(root, deps);
    expect(snapshot.provider.label).toBe('ollama');
    expect(snapshot.model.status).toBe('ok');
  });
});

// ─── buildHealthSnapshot: auth ─────────────────────────────────────────────

describe('buildHealthSnapshot — auth field', () => {
  const cfg = makeConfig({ brain_provider: 'claude', mode: 'balanced' });

  it('logged-in maps to ok', async () => {
    const root = makeTmpRoot();
    const snapshot = await buildHealthSnapshot(root, {
      loadConfigFn: async () => cfg,
      loadMcpServersFn: NOOP_MCP,
      readMemoryCountFn: () => undefined,
      probeAuthFn: async (): Promise<AuthProbeResult> => ({ state: 'logged-in', detail: 'session ok' }),
    });
    expect(snapshot.auth.status).toBe('ok');
    expect(snapshot.auth.label).toBe('logged-in');
    expect(snapshot.auth.detail).toBe('session ok');
  });

  it('logged-out maps to warn (actionable, not a hard failure)', async () => {
    const root = makeTmpRoot();
    const snapshot = await buildHealthSnapshot(root, {
      loadConfigFn: async () => cfg,
      loadMcpServersFn: NOOP_MCP,
      readMemoryCountFn: () => undefined,
      probeAuthFn: async (): Promise<AuthProbeResult> => ({ state: 'logged-out' }),
    });
    expect(snapshot.auth.status).toBe('warn');
    expect(snapshot.auth.label).toBe('logged-out');
  });

  it('probe throwing degrades to unknown, never propagates', async () => {
    const root = makeTmpRoot();
    const snapshot = await buildHealthSnapshot(root, {
      loadConfigFn: async () => cfg,
      loadMcpServersFn: NOOP_MCP,
      readMemoryCountFn: () => undefined,
      probeAuthFn: async () => { throw new Error('probe exploded'); },
    });
    expect(snapshot.auth.status).toBe('unknown');
  });

  it('probe that never resolves times out to unknown within the snapshot budget', async () => {
    const root = makeTmpRoot();
    const started = Date.now();
    const snapshot = await buildHealthSnapshot(root, {
      loadConfigFn: async () => cfg,
      loadMcpServersFn: NOOP_MCP,
      readMemoryCountFn: () => undefined,
      probeAuthFn: () => new Promise<AuthProbeResult>(() => { /* never resolves */ }),
    });
    expect(Date.now() - started).toBeLessThan(1000);
    expect(snapshot.auth.status).toBe('unknown');
  });

  it('unresolved provider skips the auth probe entirely', async () => {
    const root = makeTmpRoot();
    let called = false;
    const snapshot = await buildHealthSnapshot(root, {
      loadConfigFn: async () => { throw new Error('no config'); },
      loadMcpServersFn: NOOP_MCP,
      readMemoryCountFn: () => undefined,
      probeAuthFn: async (): Promise<AuthProbeResult> => { called = true; return { state: 'logged-in' }; },
    });
    expect(called).toBe(false);
    expect(snapshot.auth.status).toBe('unknown');
  });
});

// ─── buildHealthSnapshot: mcp ───────────────────────────────────────────────

describe('buildHealthSnapshot — mcp field', () => {
  const cfg = makeConfig({ brain_provider: 'claude', mode: 'balanced' });
  const baseDeps: HealthSnapshotDeps = {
    loadConfigFn: async () => cfg,
    readMemoryCountFn: () => undefined,
    probeAuthFn: async (): Promise<AuthProbeResult> => ({ state: 'unknown' }),
  };

  it('zero configured servers is an honest warn, not an error', async () => {
    const root = makeTmpRoot();
    const snapshot = await buildHealthSnapshot(root, { ...baseDeps, loadMcpServersFn: () => ({}) });
    expect(snapshot.mcp.status).toBe('warn');
    expect(snapshot.mcp.label).toBe('0');
  });

  it('configured servers resolve to ok with the real count', async () => {
    const root = makeTmpRoot();
    const snapshot = await buildHealthSnapshot(root, {
      ...baseDeps,
      loadMcpServersFn: () => ({
        srv1: { command: 'npx', args: ['deckent-mcp'] } as never,
        srv2: { command: 'npx', args: ['other-mcp'] } as never,
      }),
    });
    expect(snapshot.mcp.status).toBe('ok');
    expect(snapshot.mcp.label).toBe('2');
  });

  it('a throwing mcp-config reader degrades to unknown', async () => {
    const root = makeTmpRoot();
    const snapshot = await buildHealthSnapshot(root, {
      ...baseDeps,
      loadMcpServersFn: () => { throw new Error('bad json'); },
    });
    expect(snapshot.mcp.status).toBe('unknown');
  });
});

// ─── buildHealthSnapshot: memory (real tmpdir MemoryStore) ─────────────────

describe('buildHealthSnapshot — memory field', () => {
  // NOTE: mergeConfigs() (unlike loadConfig()) does not currently wire
  // memory_budget onto its returned ResolvedConfig — a pre-existing gap in
  // config.ts, out of this task's write scope (see .result docImpact). Attach
  // it directly so this test exercises OUR field-resolution logic, not that
  // gap.
  const cfg: ResolvedConfig = { ...makeConfig({ brain_provider: 'claude', mode: 'balanced' }), memory_budget: 5000 };
  const baseDeps: Omit<HealthSnapshotDeps, 'readMemoryCountFn'> = {
    loadConfigFn: async () => cfg,
    loadMcpServersFn: NOOP_MCP,
    probeAuthFn: async (): Promise<AuthProbeResult> => ({ state: 'unknown' }),
  };

  it('no memory.db on disk degrades to unknown (real fs check, no injection)', async () => {
    const root = makeTmpRoot();
    const snapshot = await buildHealthSnapshot(root, baseDeps);
    expect(snapshot.memory.status).toBe('unknown');
  });

  it('a real tmpdir memory.db is opened + counted via the default reader (real MemoryStore I/O)', async () => {
    const root = makeTmpRoot();
    mkdirSync(join(root, '.brain'), { recursive: true });
    const store = new MemoryStore(join(root, '.brain', 'memory.db'));
    store.close();

    const snapshot = await buildHealthSnapshot(root, baseDeps); // readMemoryCountFn NOT injected — exercises the real path
    expect(snapshot.memory.status).toBe('ok');
    expect(snapshot.memory.label).toBe('0/5000');
  });

  it('count above budget degrades status to warn', async () => {
    const root = makeTmpRoot();
    const snapshot = await buildHealthSnapshot(root, { ...baseDeps, readMemoryCountFn: () => 9000 });
    expect(snapshot.memory.status).toBe('warn');
    expect(snapshot.memory.label).toBe('9000/5000');
  });
});

// ─── buildHealthSnapshot: mode ──────────────────────────────────────────────

describe('buildHealthSnapshot — mode field', () => {
  it('resolves the active mode name when config is available', async () => {
    const root = makeTmpRoot();
    const cfg = makeConfig({ brain_provider: 'claude', mode: 'economic' });
    const snapshot = await buildHealthSnapshot(root, {
      loadConfigFn: async () => cfg,
      loadMcpServersFn: NOOP_MCP,
      readMemoryCountFn: () => undefined,
      probeAuthFn: async (): Promise<AuthProbeResult> => ({ state: 'unknown' }),
    });
    expect(snapshot.mode.status).toBe('ok');
    expect(snapshot.mode.label).toBe('economic');
  });
});

// ─── renderHealthSnapshot ───────────────────────────────────────────────────

describe('renderHealthSnapshot', () => {
  const snapshot = {
    provider: { status: 'ok' as const, label: 'claude' },
    model: { status: 'ok' as const, label: 'sonnet (claude-sonnet-5)' },
    auth: { status: 'ok' as const, label: 'logged-in' },
    mcp: { status: 'warn' as const, label: '0' },
    memory: { status: 'ok' as const, label: '10/5000' },
    mode: { status: 'ok' as const, label: 'balanced' },
    cwd: '/workspace',
    elapsedMs: 12,
  };

  let origNoColor: string | undefined;
  let origForceColor: string | undefined;
  const saveEnv = (): void => {
    origNoColor = process.env['NO_COLOR'];
    origForceColor = process.env['FORCE_COLOR'];
  };
  const restoreEnv = (): void => {
    if (origNoColor === undefined) delete process.env['NO_COLOR']; else process.env['NO_COLOR'] = origNoColor;
    if (origForceColor === undefined) delete process.env['FORCE_COLOR']; else process.env['FORCE_COLOR'] = origForceColor;
  };

  afterEach(restoreEnv);

  it('renders localized segment labels differently for en vs tr', () => {
    saveEnv();
    delete process.env['FORCE_COLOR'];
    delete process.env['NO_COLOR'];
    const en = renderHealthSnapshot(snapshot, 'en');
    const tr = renderHealthSnapshot(snapshot, 'tr');
    expect(en).toContain('auth:');
    expect(en).toContain('mem:');
    expect(tr).toContain('oturum:');
    expect(tr).toContain('bellek:');
    expect(en).not.toBe(tr);
  });

  it('includes the raw provider/model/cwd data regardless of language', () => {
    const en = renderHealthSnapshot(snapshot, 'en');
    expect(en).toContain('claude/sonnet (claude-sonnet-5)');
    expect(en).toContain('/workspace');
  });

  it('respects NO_COLOR — no ANSI escape codes when set', () => {
    saveEnv();
    process.env['NO_COLOR'] = '1';
    delete process.env['FORCE_COLOR'];
    const out = renderHealthSnapshot(snapshot, 'en');
    // eslint-disable-next-line no-control-regex
    expect(out).not.toMatch(/\x1b\[/);
  });

  it('emits ANSI color when FORCE_COLOR=1 (proves color path is reachable, contrasts NO_COLOR test)', () => {
    saveEnv();
    process.env['FORCE_COLOR'] = '1';
    delete process.env['NO_COLOR'];
    const out = renderHealthSnapshot(snapshot, 'en');
    // eslint-disable-next-line no-control-regex
    expect(out).toMatch(/\x1b\[/);
  });

  it('an unknown-status field renders the localized "unknown" word, not the raw label', () => {
    const withUnknown = { ...snapshot, model: { status: 'unknown' as const, label: 'unknown', detail: 'no config' } };
    const en = renderHealthSnapshot(withUnknown, 'en');
    const tr = renderHealthSnapshot(withUnknown, 'tr');
    expect(en).toContain('claude/unknown');
    expect(tr).toContain('claude/bilinmiyor');
  });

  it('an unknown provider collapses the provider/model segment to just the localized "unknown" word', () => {
    const withUnknownProvider = {
      ...snapshot,
      provider: { status: 'unknown' as const, label: 'unknown', detail: 'config unavailable' },
    };
    const en = renderHealthSnapshot(withUnknownProvider, 'en');
    // the leading provider/model segment (before the first ` · `) must NOT
    // try to pair an unresolved provider with a model (e.g. "unknown/sonnet").
    expect(en.split(' · ')[0]).not.toContain('/');
  });
});
