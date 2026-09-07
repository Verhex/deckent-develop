import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import {
  DEFAULT_RECOVERY_WINDOW_MS,
  openScratchStore,
  resolveScratchRoot,
  type ScratchCheckpointPayload,
  type ScratchStore,
} from '../../src/agent/scratch-checkpoint.js';
import { Transcript } from '../../src/agent/transcript.js';

const stores: ScratchStore[] = [];
const payload = (n = 1): ScratchCheckpointPayload => ({
  schemaVersion: 1, objective: `objective-${n}`, findings: [], evidenceRefs: [], decisions: [], unresolved: [],
  nextActions: [], inspectedAreas: [], toolResultDigests: [], cumulativeCounters: { toolCalls: n }, createdAt: new Date().toISOString(),
});

describe('transcript epoch and exactly-once metadata', () => {
  it('rejects an immediate duplicate in one turnId and records origin', () => {
    const transcript = new Transcript();
    expect(transcript.appendUser('same', { turnId: 't-1', origin: 'user' })).toEqual({ status: 'appended' });
    expect(transcript.appendUser('same', { turnId: 't-1', origin: 'replay' })).toEqual({
      status: 'duplicate', reason: 'immediate-user-content-hash-match',
    });
    expect(transcript.toEntries()[0]).toMatchObject({ turnId: 't-1', origin: 'user' });
  });

  it('compacts to checkpoint lineage without orphaning tool results', () => {
    const transcript = new Transcript();
    transcript.appendUser('objective', { turnId: 't-1', origin: 'user' });
    for (let n = 0; n < 12; n++) {
      transcript.appendAssistant('', [{ id: `call-${n}`, name: 'read', args: {} }]);
      transcript.appendToolResult(`call-${n}`, `result-${n}`);
    }
    transcript.compactForContextEpoch('objective', JSON.stringify(payload(12)), 'epoch-2', 8);
    const messages = transcript.toProviderMessages();
    for (const [index, message] of messages.entries()) {
      if (message.role !== 'tool') continue;
      expect(messages.slice(0, index).some((candidate) =>
        candidate.role === 'assistant' && candidate.toolCalls?.some((call) => call.id === message.toolCallId),
      )).toBe(true);
    }
    expect(messages[1]!.content).toContain('"toolCalls":12');
  });
});
/** Hermetic base: every store below is rooted in a per-test temp dir, so a run
 *  never reads — let alone reaps — the shared OS temp namespace. */
const bases: string[] = [];
const base = (): string => { const dir = mkdtempSync(join(tmpdir(), 'deckent-scratch-base-')); bases.push(dir); return dir; };
const ids = (sessionId: string) => ({ tenantId: 'tenant', projectId: 'project', sessionId, slug: '-workspace-demo' });
const open = (baseDir = base()): ScratchStore => {
  const store = openScratchStore(ids(crypto.randomUUID()), { baseDir });
  stores.push(store);
  return store;
};
afterEach(() => {
  for (const store of stores.splice(0)) { try { store.close({ policy: 'delete' }); } catch { /* already closed */ } }
  for (const dir of bases.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('scratch checkpoint store', () => {
  it('writes durable checkpoints to the canonical session path without coupling them to scratch deletion', () => {
    const baseDir = base();
    const checkpointProjectRoot = join(baseDir, 'project');
    const checkpointBaseDir = join(checkpointProjectRoot, '.deckent', 'runtime', 'sessions');
    const store = openScratchStore(
      { tenantId: 't', projectId: 'p', sessionId: 'sess-canonical', slug: SLUG },
      { baseDir, checkpointProjectRoot },
    );
    const receipt = store.writeCheckpoint(payload());
    expect(receipt.path).toBe(join(checkpointBaseDir, 'sess-canonical', 'checkpoints', basename(receipt.path)));
    expect(store.readLatestCheckpoint()).toMatchObject({ status: 'ok', receipt });
    store.close({ policy: 'delete' });
    expect(existsSync(receipt.path)).toBe(true);
  });

  it('reads a legacy scratch checkpoint when the canonical lineage is empty, without migrating it', () => {
    const baseDir = base();
    const ids = { tenantId: 't', projectId: 'p', sessionId: 'sess-legacy', slug: SLUG };
    const legacy = openScratchStore(ids, { baseDir });
    const receipt = legacy.writeCheckpoint(payload());
    legacy.close({ policy: 'keep-for-recovery' });
    const canonical = openScratchStore(ids, {
      baseDir,
      checkpointProjectRoot: join(baseDir, 'project'),
    });
    expect(canonical.readLatestCheckpoint()).toMatchObject({ status: 'ok', receipt });
    expect(existsSync(receipt.path)).toBe(true);
  });

  it('atomically writes mode-protected data and verifies its checksum', () => {
    const store = open(); const receipt = store.writeCheckpoint(payload());
    expect(receipt.path.startsWith(store.info.root)).toBe(true);
    expect(store.readLatestCheckpoint()).toMatchObject({ status: 'ok', receipt });
    if (process.platform !== 'win32') expect(lstatSync(receipt.path).mode & 0o777).toBe(0o600);
  });

  it('returns typed corruption instead of throwing', () => {
    const store = open(); const receipt = store.writeCheckpoint(payload());
    writeFileSync(receipt.path, readFileSync(receipt.path, 'utf8').replace('objective-1', 'tampered'));
    expect(store.readLatestCheckpoint()).toMatchObject({ status: 'corrupt', reason: 'checksum mismatch' });
  });

  it('classifies malformed stored JSON without returning parser text or stored bytes', () => {
    const store = open(); const receipt = store.writeCheckpoint(payload());
    writeFileSync(receipt.path, '{"private":"DO_NOT_EXPOSE"');
    const result = store.readLatestCheckpoint();
    expect(result).toMatchObject({ status: 'corrupt', reason: 'invalid json' });
    expect(JSON.stringify(result)).not.toContain('DO_NOT_EXPOSE');
  });

  it.each(['null', 'false', '1', '"string"', '[]'])(
    'classifies valid non-envelope JSON %s as fixed schema corruption',
    (stored) => {
      const store = open(); const receipt = store.writeCheckpoint(payload());
      writeFileSync(receipt.path, stored);
      expect(store.readLatestCheckpoint()).toMatchObject({ status: 'corrupt', reason: 'invalid schema' });
    },
  );

  it('retains only the latest five checkpoints', () => {
    const store = open(); for (let n = 1; n <= 7; n++) store.writeCheckpoint(payload(n));
    expect(readdirSync(join(store.info.root, 'checkpoints'))).toHaveLength(5);
    expect(store.readLatestCheckpoint()).toMatchObject({ status: 'ok', payload: { objective: 'objective-7' } });
  });

  it('rejects unsafe identity paths and symlink checkpoint targets', () => {
    expect(() => openScratchStore({ tenantId: '..', projectId: 'p', sessionId: 's' })).toThrow('invalid tenantId');
    const store = open();
    rmSync(join(store.info.root, 'checkpoints'), { recursive: true });
    symlinkSync(store.info.root, join(store.info.root, 'checkpoints'));
    expect(() => store.writeCheckpoint(payload())).toThrow('symlink');
  });

  it('rejects a pre-existing symlink inside the canonical checkpoint lineage', () => {
    const baseDir = base();
    const checkpointProjectRoot = join(baseDir, 'project');
    const checkpointBaseDir = join(checkpointProjectRoot, '.deckent', 'runtime', 'sessions');
    mkdirSync(checkpointBaseDir, { recursive: true });
    symlinkSync(baseDir, join(checkpointBaseDir, 'sess-linked'));
    expect(() => openScratchStore(
      { tenantId: 't', projectId: 'p', sessionId: 'sess-linked', slug: SLUG },
      { baseDir, checkpointProjectRoot },
    )).toThrow('symlink');
  });

  it('rejects a symlink in the canonical ancestry before creating sessions', () => {
    const baseDir = base();
    const checkpointProjectRoot = join(baseDir, 'project');
    mkdirSync(checkpointProjectRoot);
    symlinkSync(baseDir, join(checkpointProjectRoot, '.deckent'));
    expect(() => openScratchStore(
      { tenantId: 't', projectId: 'p', sessionId: 'sess-ancestor', slug: SLUG },
      { baseDir, checkpointProjectRoot },
    )).toThrow('symlink');
  });

  it('returns typed degradation when a canonical parent is replaced by a symlink', () => {
    const baseDir = base();
    const checkpointProjectRoot = join(baseDir, 'project');
    const outside = join(baseDir, 'outside');
    const store = openScratchStore(
      { tenantId: 't', projectId: 'p', sessionId: 'sess-replaced', slug: SLUG },
      { baseDir, checkpointProjectRoot },
    );
    store.writeCheckpoint(payload());
    rmSync(join(checkpointProjectRoot, '.deckent'), { recursive: true });
    mkdirSync(outside);
    writeFileSync(join(outside, 'DO_NOT_READ'), 'outside-secret');
    symlinkSync(outside, join(checkpointProjectRoot, '.deckent'));
    const result = store.readLatestCheckpoint();
    expect(result).toMatchObject({
      status: 'degraded', reasonCode: 'CHECKPOINT_READ_FAILED', reason: 'checkpoint-degraded:checkpoint_read_failed',
    });
    expect(JSON.stringify(result)).not.toContain('outside-secret');
  });
});

// ─── Deterministic root + real reaper (564-002) ─────────────────────────────

const NAMESPACE = 'deckent';
const SLUG = '-workspace-demo';
/** Stamp a directory's mtime to an absolute instant — the reaper's liveness input. */
const stamp = (dir: string, atMs: number): void => { utimesSync(dir, atMs / 1000, atMs / 1000); };
const FIXED_NOW = 1_700_000_000_000;

describe('scratch root — deterministic, recoverable, namespaced', () => {
  it('resolves the approved layout and reuses an existing root for recovery', () => {
    const baseDir = base();
    const layout = resolveScratchRoot(ids('sess-1'), { baseDir });
    expect(layout.root).toBe(join(baseDir, NAMESPACE, SLUG, 'sess-1', 'scratchpad'));
    expect(layout.sessionRoot).toBe(join(baseDir, NAMESPACE, SLUG, 'sess-1'));

    const first = openScratchStore(ids('sess-1'), { baseDir });
    const receipt = first.writeCheckpoint(payload(1));
    expect(first.info.root).toBe(layout.root);
    first.close({ policy: 'keep-for-recovery' });
    expect(existsSync(receipt.path)).toBe(true);

    // Same identity → same directory → the previous lineage is still readable,
    // and the resumed sequence never re-mints an index that already exists.
    const recovered = openScratchStore(ids('sess-1'), { baseDir });
    stores.push(recovered);
    expect(recovered.info.root).toBe(layout.root);
    expect(recovered.readLatestCheckpoint()).toMatchObject({ status: 'ok', payload: { objective: 'objective-1' } });
    const next = recovered.writeCheckpoint(payload(2));
    expect(next.path).not.toBe(receipt.path);
    expect(existsSync(receipt.path)).toBe(true);
    expect(recovered.readLatestCheckpoint()).toMatchObject({ status: 'ok', payload: { objective: 'objective-2' } });
  });

  it('deletes the whole session root — scratchpad and any sibling content dir', () => {
    const baseDir = base();
    const store = openScratchStore(ids('sess-del'), { baseDir });
    const contentDir = join(store.info.sessionRoot, 'tool-content');
    mkdirSync(contentDir, { recursive: true });
    writeFileSync(join(contentDir, 'content-x.bin'), 'bytes');
    store.close({ policy: 'delete' });
    expect(existsSync(store.info.sessionRoot)).toBe(false);
    expect(existsSync(join(baseDir, NAMESPACE, SLUG))).toBe(true);
  });
});

describe('scratch reaper — bounded, namespace-scoped, fail-open', () => {
  it('keeps a fresh sibling and sweeps one idle beyond the 10-minute window', () => {
    const baseDir = base();
    const namespace = join(baseDir, NAMESPACE, SLUG);
    for (const name of ['stale-session', 'fresh-session']) mkdirSync(join(namespace, name, 'scratchpad'), { recursive: true });
    stamp(join(namespace, 'stale-session'), FIXED_NOW - DEFAULT_RECOVERY_WINDOW_MS - 60_000);
    stamp(join(namespace, 'fresh-session'), FIXED_NOW - 60_000);

    const store = openScratchStore(ids('live-session'), { baseDir, now: () => FIXED_NOW });
    stores.push(store);

    expect(existsSync(join(namespace, 'stale-session'))).toBe(false);
    expect(existsSync(join(namespace, 'fresh-session'))).toBe(true);
    expect(existsSync(store.info.root)).toBe(true);
  });

  it('measures INACTIVITY — a checkpoint write re-stamps the live session', () => {
    const baseDir = base();
    const old = openScratchStore(ids('worker-session'), { baseDir, now: () => FIXED_NOW });
    stamp(old.info.sessionRoot, FIXED_NOW - DEFAULT_RECOVERY_WINDOW_MS - 60_000);
    old.writeCheckpoint(payload(1));

    // A second opener in the same namespace must now consider it alive.
    const other = openScratchStore(ids('other-session'), { baseDir, now: () => FIXED_NOW });
    stores.push(other);
    expect(existsSync(old.info.root)).toBe(true);
    expect(old.readLatestCheckpoint()).toMatchObject({ status: 'ok' });
  });

  it('sweeps strict-prefix legacy mkdtemp roots and nothing else', () => {
    const baseDir = base();
    const legacy = join(baseDir, 'deckent-tenant-project-legacy-session-AbCdEf');
    const unrelated = join(baseDir, 'deckent-tool-content-XyZ');
    const otherSession = join(baseDir, 'deckent-tenant-project-someone-else-QwErTy');
    for (const dir of [legacy, unrelated, otherSession]) {
      mkdirSync(dir, { recursive: true });
      stamp(dir, FIXED_NOW - DEFAULT_RECOVERY_WINDOW_MS - 60_000);
    }

    const store = openScratchStore(ids('legacy-session'), { baseDir, now: () => FIXED_NOW });
    stores.push(store);

    expect(existsSync(legacy)).toBe(false);
    expect(existsSync(unrelated)).toBe(true);
    expect(existsSync(otherSession)).toBe(true);
  });

  it('fail-open: a broken clock degrades hygiene without downing the session', () => {
    const baseDir = base();
    const namespace = join(baseDir, NAMESPACE, SLUG);
    mkdirSync(namespace, { recursive: true });
    mkdirSync(join(namespace, 'stale-session'), { recursive: true });
    stamp(join(namespace, 'stale-session'), FIXED_NOW - DEFAULT_RECOVERY_WINDOW_MS - 60_000);

    const store = openScratchStore(ids('live-session'), {
      baseDir,
      now: () => { throw new Error('clock unavailable'); },
    });
    stores.push(store);

    // Session fully usable; the un-swept sibling is left alone, not guessed at.
    const receipt = store.writeCheckpoint(payload(3));
    expect(store.readLatestCheckpoint()).toMatchObject({ status: 'ok', receipt });
    expect(existsSync(join(namespace, 'stale-session'))).toBe(true);
  });

  it('fail-open per entry: a dangling symlink is skipped, its stale neighbour still reaped', () => {
    const baseDir = base();
    const namespace = join(baseDir, NAMESPACE, SLUG);
    mkdirSync(join(namespace, 'stale-session'), { recursive: true });
    stamp(join(namespace, 'stale-session'), FIXED_NOW - DEFAULT_RECOVERY_WINDOW_MS - 60_000);
    symlinkSync(join(baseDir, 'nowhere'), join(namespace, 'dangling'));

    const store = openScratchStore(ids('live-session'), { baseDir, now: () => FIXED_NOW });
    stores.push(store);

    expect(lstatSync(join(namespace, 'dangling')).isSymbolicLink()).toBe(true);
    expect(existsSync(join(namespace, 'stale-session'))).toBe(false);
    expect(existsSync(store.info.root)).toBe(true);
  });

  it('keeps the 10-minute recovery window as the resolved default', () => {
    expect(DEFAULT_RECOVERY_WINDOW_MS).toBe(10 * 60 * 1000);
    expect(open().info.recoveryWindowMs).toBe(DEFAULT_RECOVERY_WINDOW_MS);

    const custom = openScratchStore(ids('custom-window'), { baseDir: base(), recoveryWindowMs: 1_000 });
    stores.push(custom);
    expect(custom.info.recoveryWindowMs).toBe(1_000);
  });
});
