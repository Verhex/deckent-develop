// ─── WATCH-SESSION-WARN tests (Sprint 363, Task 363-011) ────────────────────
//
// Wires session-registry.ts (361-015, F7-MULTISESSION) into health-snapshot.ts:
// buildHealthSnapshot() gains a `sessions` field (>= 4 active REPL sessions on
// this project => 'warn', since they all share one /usage limit), and
// renderHealthSnapshot() appends a warning line when that field is 'warn'.
//
// Fixture-registry pattern mirrors tests/cli/session-registry.test.ts: real
// registerSession()/listActive() calls against a tmpdir root, liveness always
// injected via a fake isAlive (fake-pid-probe) so no real OS process is ever
// touched. renderHealthSnapshot's getMessageFn is injected with a fake so the
// en/tr + {count}-interpolation wiring is proven hermetically without
// depending on the (not-yet-added, out-of-scope) messages.ts key — see
// task-363-011.result docImpact.

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  buildHealthSnapshot,
  renderHealthSnapshot,
  type HealthSnapshotDeps,
  type HealthSnapshot,
} from '../../src/cli/helpers/health-snapshot.js';
import { registerSession, listActive } from '../../src/cli/helpers/session-registry.js';

// ─── Fixtures ────────────────────────────────────────────────────────────

let dirs: string[] = [];
afterEach(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
  dirs = [];
});

function makeTmpRoot(): string {
  const d = mkdtempSync(join(tmpdir(), 'session-warn-'));
  dirs.push(d);
  return d;
}

const NOW = '2026-07-03T00:00:00.000Z';
const alwaysAlive = (): boolean => true;

const NOOP_MCP = (): Record<string, never> => ({});

const baseDeps: Omit<HealthSnapshotDeps, 'listActiveSessionsFn'> = {
  loadConfigFn: async () => { throw new Error('no config'); },
  loadMcpServersFn: NOOP_MCP,
  readMemoryCountFn: () => undefined,
  probeAuthFn: async () => ({ state: 'unknown' }),
};

// ─── buildHealthSnapshot — sessions field ──────────────────────────────────

describe('buildHealthSnapshot — sessions field (361-015 wiring)', () => {
  it('1 active session stays ok, below the parallel-usage warn threshold', async () => {
    const root = makeTmpRoot();
    registerSession(root, 111, '/dev/pts/0', { now: () => NOW });

    const snapshot = await buildHealthSnapshot(root, {
      ...baseDeps,
      listActiveSessionsFn: (r) => listActive(r, { isAlive: alwaysAlive }),
    });

    expect(snapshot.sessions).toEqual({ status: 'ok', label: '1' });
  });

  it('4 active sessions crosses the threshold — warn, all sharing one usage limit', async () => {
    const root = makeTmpRoot();
    registerSession(root, 1, null, { now: () => NOW });
    registerSession(root, 2, null, { now: () => NOW });
    registerSession(root, 3, null, { now: () => NOW });
    registerSession(root, 4, null, { now: () => NOW });

    const snapshot = await buildHealthSnapshot(root, {
      ...baseDeps,
      listActiveSessionsFn: (r) => listActive(r, { isAlive: alwaysAlive }),
    });

    expect(snapshot.sessions).toEqual({ status: 'warn', label: '4' });
  });

  it('stale (dead-pid) sessions are excluded from the count via the registry liveness filter', async () => {
    const root = makeTmpRoot();
    // 5 registered, but only 2 report alive via the fake-pid-probe — stays
    // below threshold, proving cleanup/liveness filtering feeds this field,
    // not the raw on-disk entry count.
    registerSession(root, 10, null, { now: () => NOW });
    registerSession(root, 20, null, { now: () => NOW });
    registerSession(root, 30, null, { now: () => NOW });
    registerSession(root, 40, null, { now: () => NOW });
    registerSession(root, 50, null, { now: () => NOW });

    const isAlive = (pid: number): boolean => pid === 10 || pid === 20;
    const snapshot = await buildHealthSnapshot(root, {
      ...baseDeps,
      listActiveSessionsFn: (r) => listActive(r, { isAlive }),
    });

    expect(snapshot.sessions).toEqual({ status: 'ok', label: '2' });
  });

  it('a throwing session-count reader degrades to unknown — never crashes the whole snapshot', async () => {
    const root = makeTmpRoot();
    const snapshot = await buildHealthSnapshot(root, {
      ...baseDeps,
      listActiveSessionsFn: () => { throw new Error('registry read failed'); },
    });

    expect(snapshot.sessions?.status).toBe('unknown');
    // Fail-soft is field-level only — the rest of the snapshot still resolves.
    expect(snapshot.mcp.status).toBe('warn');
    expect(snapshot.cwd).toBe(root);
  });

  it('no registry file on disk yet resolves to 0 active sessions, not an error', async () => {
    const root = makeTmpRoot();
    const snapshot = await buildHealthSnapshot(root, {
      ...baseDeps,
      listActiveSessionsFn: (r) => listActive(r, { isAlive: alwaysAlive }),
    });

    expect(snapshot.sessions).toEqual({ status: 'ok', label: '0' });
  });

  it('defaults listActiveSessionsFn to the real listActive() when not injected', async () => {
    const root = makeTmpRoot();
    registerSession(root, process.pid, null, { now: () => NOW });

    const snapshot = await buildHealthSnapshot(root, baseDeps); // listActiveSessionsFn NOT injected
    // process.pid is genuinely alive (it's this test process), so the real,
    // uninjected listActive() path must count it.
    expect(snapshot.sessions).toEqual({ status: 'ok', label: '1' });
  });
});

// ─── renderHealthSnapshot — session-warn line ──────────────────────────────

describe('renderHealthSnapshot — session-warn line (363-011)', () => {
  const okSessions: HealthSnapshot['sessions'] = { status: 'ok', label: '1' };
  const warnSessions: HealthSnapshot['sessions'] = { status: 'warn', label: '4' };

  const baseSnapshot: HealthSnapshot = {
    provider: { status: 'ok', label: 'claude' },
    model: { status: 'ok', label: 'sonnet (claude-sonnet-5)' },
    auth: { status: 'ok', label: 'logged-in' },
    mcp: { status: 'ok', label: '2' },
    memory: { status: 'ok', label: '10/5000' },
    mode: { status: 'ok', label: 'balanced' },
    cwd: '/workspace',
    elapsedMs: 12,
  };

  // Fake getMessageFn — proves the render wiring (lookup key, lang branch,
  // {count} interpolation) independent of messages.ts's real (not-yet-added)
  // 'health.session_warn' entry.
  const fakeGetMessage = (key: string, lang: string, vars?: Record<string, string>): string => {
    if (key !== 'health.session_warn') return key;
    const count = vars?.['count'] ?? '?';
    return lang === 'tr'
      ? `Uyarı: ${count} paralel oturum`
      : `Warning: ${count} parallel sessions`;
  };

  it('omits the warning line entirely when sessions is absent (backward compatible)', () => {
    const out = renderHealthSnapshot(baseSnapshot, 'en', { getMessageFn: fakeGetMessage });
    expect(out.split('\n')).toHaveLength(1);
  });

  it('omits the warning line when sessions.status is ok', () => {
    const out = renderHealthSnapshot({ ...baseSnapshot, sessions: okSessions }, 'en', {
      getMessageFn: fakeGetMessage,
    });
    expect(out.split('\n')).toHaveLength(1);
  });

  it('appends a second warning line when sessions.status is warn', () => {
    const out = renderHealthSnapshot({ ...baseSnapshot, sessions: warnSessions }, 'en', {
      getMessageFn: fakeGetMessage,
    });
    const lines = out.split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('Warning: 4 parallel sessions');
  });

  it('localizes the warning line — en and tr differ', () => {
    const withWarn = { ...baseSnapshot, sessions: warnSessions };
    const en = renderHealthSnapshot(withWarn, 'en', { getMessageFn: fakeGetMessage });
    const tr = renderHealthSnapshot(withWarn, 'tr', { getMessageFn: fakeGetMessage });

    expect(en.split('\n')[1]).toContain('Warning: 4 parallel sessions');
    expect(tr.split('\n')[1]).toContain('Uyarı: 4 paralel oturum');
    expect(en).not.toBe(tr);
  });

  it('interpolates the real active-session count into the warning line', () => {
    const out = renderHealthSnapshot(
      { ...baseSnapshot, sessions: { status: 'warn', label: '7' } },
      'en',
      { getMessageFn: fakeGetMessage },
    );
    expect(out).toContain('7 parallel sessions');
  });

  it('defaults getMessageFn to the real getMessage() when no deps are injected — fails soft (raw key, no crash) until messages.ts adds the companion key', () => {
    const out = renderHealthSnapshot({ ...baseSnapshot, sessions: warnSessions }, 'en');
    const lines = out.split('\n');
    expect(lines).toHaveLength(2);
    // Real getMessage() has no 'health.session_warn' entry yet (messages.ts
    // companion edit is outside this task's write scope) — its documented
    // fallback is to return the raw key, never throw.
    expect(lines[1]).toContain('health.session_warn');
  });
});
