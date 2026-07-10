/**
 * DESK-1 (born-496) — serve-daemon handshake file (serve-daemon-meta.ts).
 *
 * Contract under test:
 *   - write: atomic (no .tmp residue), mode 0600 (token-carrying file), stamps
 *     pid/startToken/startedAt/version itself.
 *   - read: null on absent/garbage/half-formed JSON — callers never see a
 *     half-formed meta; valid file round-trips.
 *   - clear: best-effort, never throws (absent file included).
 *
 * Hermetic: every path under a tmpdir fixture; no HOME/global state; no server.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, readdirSync, statSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  writeServeDaemonMeta,
  readServeDaemonMeta,
  clearServeDaemonMeta,
  SERVE_DAEMON_META_PATH,
} from '../../src/api/serve-daemon-meta.js';

describe('serve-daemon-meta (DESK-1 handshake file)', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'deckent-serve-meta-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  const input = {
    host: '127.0.0.1',
    port: 3100,
    projectRoot: '/abs/project',
    apiToken: 'api-token-abc',
    terminalToken: 'term-token-xyz',
    terminalEnabled: true,
  };

  it('writes the handshake file with self-stamped identity fields', () => {
    const meta = writeServeDaemonMeta(root, input);
    expect(meta.pid).toBe(process.pid);
    expect(meta.startedAt).toBeTruthy();
    expect(meta.version).toBeTruthy();
    // startToken is platform-dependent (null where /proc-style start info is
    // unavailable) — the field must exist either way.
    expect('startToken' in meta).toBe(true);

    const onDisk = JSON.parse(readFileSync(join(root, SERVE_DAEMON_META_PATH), 'utf-8'));
    expect(onDisk).toEqual(meta);
  });

  it('writes with mode 0600 regardless of umask (token-carrying file)', () => {
    writeServeDaemonMeta(root, input);
    const mode = statSync(join(root, SERVE_DAEMON_META_PATH)).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it('leaves no .tmp residue (atomic temp+rename)', () => {
    writeServeDaemonMeta(root, input);
    const entries = readdirSync(join(root, '.deckent'));
    expect(entries).toEqual(['serve-daemon.json']);
  });

  it('round-trips through readServeDaemonMeta', () => {
    const written = writeServeDaemonMeta(root, input);
    const read = readServeDaemonMeta(root);
    expect(read).toEqual(written);
  });

  it('read returns null when the file is absent', () => {
    expect(readServeDaemonMeta(root)).toBeNull();
  });

  it('read returns null on garbage and on half-formed JSON (never a partial meta)', () => {
    mkdirSync(join(root, '.deckent'), { recursive: true });
    const target = join(root, SERVE_DAEMON_META_PATH);
    writeFileSync(target, 'not-json{', 'utf-8');
    expect(readServeDaemonMeta(root)).toBeNull();
    // Missing required identity fields (pid/port/projectRoot) → null.
    writeFileSync(target, JSON.stringify({ host: '127.0.0.1' }), 'utf-8');
    expect(readServeDaemonMeta(root)).toBeNull();
    writeFileSync(target, JSON.stringify({ pid: 1, port: 'x', projectRoot: '/p' }), 'utf-8');
    expect(readServeDaemonMeta(root)).toBeNull();
  });

  it('clear removes the file and never throws (absent file included)', () => {
    writeServeDaemonMeta(root, input);
    clearServeDaemonMeta(root);
    expect(existsSync(join(root, SERVE_DAEMON_META_PATH))).toBe(false);
    expect(() => clearServeDaemonMeta(root)).not.toThrow(); // already gone
  });

  it('optional tokens stay absent when the daemon runs auth-less/terminal-less', () => {
    writeServeDaemonMeta(root, {
      host: '127.0.0.1',
      port: 3200,
      projectRoot: '/abs/other',
      terminalEnabled: false,
    });
    const read = readServeDaemonMeta(root)!;
    expect(read.apiToken).toBeUndefined();
    expect(read.terminalToken).toBeUndefined();
    expect(read.terminalEnabled).toBe(false);
  });
});
