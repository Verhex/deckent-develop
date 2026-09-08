// ═══ sync async liveness — 7104 SYNC-ASYNC-GIT-CLOSURE (real disposable
// children, no mocks) ═══════════════════════════════════════════════════
//
// `runSyncGitProcess` (src/cli/helpers/sync-git-process.ts) replaced the
// former `spawnSync` chain in `src/cli/commands/sync.ts` so the event loop
// stays live for the whole probe → rev-list → ls-tree/diff sequence, and so
// every non-success outcome (spawn error, timeout + SIGKILL escalation,
// output overflow, signal death, non-zero exit) is a typed, reap-evidenced
// failure instead of a thrown/blocking exception. Every case below drives
// the REAL adapter against a REAL, disposable `process.execPath -e <script>`
// child through its `command`/`args` test seam — never a mock — so the
// liveness and termination behaviour is proven against an actual process
// tree, not an assumption about one.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';

import { runSyncGitProcess, getSyncGitUnresolvedTree, resetSyncGitProcessChainState, type SyncGitProcessResult, type SyncGitProcessFailure } from '../../src/cli/helpers/sync-git-process.js';
import { collectGitChanges } from '../../src/cli/commands/sync.js';

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'deckent-sync-async-liveness-'));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

/**
 * Narrow a `SyncGitProcessResult` to its failure member — and FAIL LOUDLY
 * (never silently skip assertions) if the adapter unexpectedly succeeded.
 */
function expectFailure(result: SyncGitProcessResult): SyncGitProcessFailure {
  if (result.ok) {
    throw new Error(`expected a failure result, got ok:true — ${JSON.stringify(result)}`);
  }
  return result;
}

/** Assert `pid` no longer names a live process (ESRCH), guarding the throw. */
function expectProcessDead(pid: number | null): void {
  expect(pid).not.toBeNull();
  let threw = false;
  try {
    process.kill(pid as number, 0);
  } catch (error) {
    threw = true;
    expect((error as NodeJS.ErrnoException).code).toBe('ESRCH');
  }
  expect(threw).toBe(true);
}

describe('runSyncGitProcess — event loop liveness (7104)', () => {
  it('(1) awaiting a slow child does not block the event loop: a parallel 50ms interval keeps ticking', async () => {
    let ticks = 0;
    const interval = setInterval(() => { ticks += 1; }, 50);

    const result = await runSyncGitProcess({
      cwd: tmp,
      command: process.execPath,
      args: ['-e', 'setTimeout(function () {}, 800);'],
    });

    clearInterval(interval);

    expect(ticks).toBeGreaterThanOrEqual(5);
    expect(result.ok).toBe(true);
  });
});

describe('runSyncGitProcess — timeout + termination (7104)', () => {
  it('(2) timeout: a child that ignores nothing dies on the first SIGTERM', async () => {
    const result = await runSyncGitProcess({
      cwd: tmp,
      command: process.execPath,
      args: ['-e', 'setTimeout(function () {}, 30000);'],
      timeoutMs: 300,
    });

    const failure = expectFailure(result);
    expect(failure.kind).toBe('timeout');
    expect(failure.detail.startsWith('timeout: ')).toBe(true);
    expect(failure.childExited).toBe(true);
    expect(failure.signal).toBe('SIGTERM');
    expect(failure.durationMs).toBeLessThan(5000);
    expectProcessDead(failure.pid);
  }, 10000);

  it('(3) timeout with a SIGTERM-ignoring child: SIGKILL escalation fires and reaps it', async () => {
    const script = "process.on('SIGTERM', function () {}); setInterval(function () {}, 1000);";
    const result = await runSyncGitProcess({
      cwd: tmp,
      command: process.execPath,
      args: ['-e', script],
      timeoutMs: 200,
      graceMs: 200,
    });

    const failure = expectFailure(result);
    expect(failure.kind).toBe('timeout');
    expect(failure.childExited).toBe(true);
    // Direct escalation evidence: the SIGTERM was ignored, so the process
    // that actually exited did so on SIGKILL, not the original SIGTERM.
    expect(failure.signal).toBe('SIGKILL');
    expectProcessDead(failure.pid);
  }, 10000);
});

describe('runSyncGitProcess — output overflow (7104)', () => {
  it('(4) stdout beyond maxOutputBytes is an overflow failure; the (truncated) output is never handed back', async () => {
    const script = "for (var i = 0; i < 4; i++) { process.stdout.write('x'.repeat(1 << 20)); }";
    const result = await runSyncGitProcess({
      cwd: tmp,
      command: process.execPath,
      args: ['-e', script],
      maxOutputBytes: 64 * 1024,
    });

    const failure = expectFailure(result);
    expect(failure.kind).toBe('output_overflow');
    expect(failure.stdoutTruncated).toBe(true);
    expect(failure.stdoutBytes).toBeGreaterThan(65536);
    expect(failure.childExited).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(failure, 'stdout')).toBe(false);
  }, 10000);
});

describe('runSyncGitProcess — signal death (7104)', () => {
  it('(5) a child that signals itself SIGTERM is reported as a signal failure, not a plain non-zero exit', async () => {
    const result = await runSyncGitProcess({
      cwd: tmp,
      command: process.execPath,
      args: ['-e', "process.kill(process.pid, 'SIGTERM');"],
    });

    const failure = expectFailure(result);
    expect(failure.kind).toBe('signal');
    expect(failure.signal).toBe('SIGTERM');
  });
});

describe('runSyncGitProcess — non-zero exit (7104)', () => {
  it('(6) non-zero exit carries the first stderr line as detail, verbatim', async () => {
    // The stderr write is flushed via its own callback before exiting — an
    // un-awaited `process.exit()` can truncate a pending async pipe write.
    const script = "process.stderr.write('fatal: boom\\nmore\\n', function () { process.exit(3); });";
    const result = await runSyncGitProcess({
      cwd: tmp,
      command: process.execPath,
      args: ['-e', script],
    });

    const failure = expectFailure(result);
    expect(failure.kind).toBe('nonzero_exit');
    expect(failure.exitCode).toBe(3);
    expect(failure.detail).toBe('nonzero_exit: fatal: boom');
  });
});

describe('runSyncGitProcess — spawn error (7104)', () => {
  it('(7) a non-existent command is a spawn_error with no live child ever observed', async () => {
    const result = await runSyncGitProcess({
      cwd: tmp,
      command: join(tmp, 'no-such-binary'),
      args: [],
    });

    const failure = expectFailure(result);
    expect(failure.kind).toBe('spawn_error');
    expect(failure.detail).toMatch(/ENOENT/);
    expect(failure.childExited).toBeNull();
    expect(failure.pid).toBeNull();
  });
});

describe('runSyncGitProcess — success (7104)', () => {
  it('(8) success carries exact stdout, including embedded NUL bytes, byte for byte', async () => {
    // The write is flushed via its own callback; the process then ends
    // naturally (no `process.exit()` call) so nothing pending is truncated.
    const script = "process.stdout.write('a' + String.fromCharCode(0) + 'b' + String.fromCharCode(0), function () {});";
    const result = await runSyncGitProcess({
      cwd: tmp,
      command: process.execPath,
      args: ['-e', script],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable — asserted above');
    expect(result.stdout).toBe(`a${String.fromCharCode(0)}b${String.fromCharCode(0)}`);
    expect(result.exitCode).toBe(0);
  });
});

// ═══ (9) integration — the REAL git path stays non-blocking end to end ════

function gitRun(cwd: string, args: string[], env?: Record<string, string>): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn('git', args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, ...env },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d: Buffer) => { stdout += String(d); });
    child.stderr.on('data', (d: Buffer) => { stderr += String(d); });
    child.on('error', () => resolve({ code: -1, stdout, stderr }));
    child.on('close', (code) => resolve({ code: code ?? -1, stdout, stderr }));
  });
}

describe('collectGitChanges — real git path, non-blocking end to end (7104)', () => {
  it('(9) collectGitChanges on a small real repo does not block the event loop while it awaits git', async () => {
    // Fixed, deterministic commit dates (same pattern as sync-git-detection.test.ts).
    const baseEpochSeconds = 1767225600;
    await gitRun(tmp, ['init', '-q']);
    await gitRun(tmp, ['config', '--local', 'core.hooksPath', '/dev/null']);
    await gitRun(tmp, ['config', '--local', 'commit.gpgsign', 'false']);

    writeFileSync(join(tmp, 'a.txt'), 'a\n', 'utf-8');
    await gitRun(tmp, ['add', 'a.txt']);
    await gitRun(tmp, [
      '-c', 'user.name=Deckent Test', '-c', 'user.email=deckent-test@example.com',
      'commit', '--quiet', '--no-gpg-sign', '-m', 'commit a',
    ], { GIT_AUTHOR_DATE: `@${baseEpochSeconds} +0000`, GIT_COMMITTER_DATE: `@${baseEpochSeconds} +0000` });

    writeFileSync(join(tmp, 'b.txt'), 'b\n', 'utf-8');
    await gitRun(tmp, ['add', 'b.txt']);
    await gitRun(tmp, [
      '-c', 'user.name=Deckent Test', '-c', 'user.email=deckent-test@example.com',
      'commit', '--quiet', '--no-gpg-sign', '-m', 'commit b',
    ], { GIT_AUTHOR_DATE: `@${baseEpochSeconds + 1} +0000`, GIT_COMMITTER_DATE: `@${baseEpochSeconds + 1} +0000` });

    // Deviation from the literal spec (documented, per (i2)'s precedent in
    // sync-git-detection.test.ts): measured directly against THIS adapter on
    // this host — a real `collectGitChanges` call over a 2-commit repo (3
    // sequential real git spawns: log, rev-list, ls-tree) completes in
    // ~9-10ms across 5 trials. A 20ms tick interval therefore observes ZERO
    // ticks every time (0 < 20ms < 9-10ms elapsed) — not a flaky threshold,
    // an IMPOSSIBLE one on this host/git-version. The property under test —
    // "the event loop is not blocked while this awaits" — is still exactly
    // as discriminating at 1ms: the former synchronous `spawnSync` chain
    // fires ZERO timer callbacks for the full duration of the call, blocking
    // is total, not partial. Observed at 1ms: 6-8 ticks across 5 trials;
    // threshold 3 keeps ~2x margin under load (a concurrent lane's tests).
    let ticks = 0;
    const interval = setInterval(() => { ticks += 1; }, 1);

    const result = await collectGitChanges(tmp, '2020-01-01T00:00:00Z');

    clearInterval(interval);

    expect(ticks).toBeGreaterThanOrEqual(3);
    expect(result.detection.mode).toBe('root-fallback');
    expect([...result.added].sort()).toEqual(['a.txt', 'b.txt']);
  });
});

// ─── 7104 sync-async v3 (ENTRY 1043 + 1046 REVISE): three separate truths ────
// direct-child exit ≠ stream closure ≠ owned-tree termination. Group signals are
// sent ONLY while the direct child (the group leader we spawned) is alive; the
// only proof of tree termination is a signal-0 probe of our group answering
// ESRCH; whatever cannot be proven within the bound is `child_tree_unresolved`
// and poisons further Git calls for that repository — never a late success,
// never a blind kill of a pid this adapter did not create.

/** Node program: spawn a grandchild that inherits stdio, print its pid, then exit 0 at once (root repro 1043). */
function parentThatExitsLeavingDescendant(grandchildDetached: boolean): string {
  return [
    "const {spawn}=require('node:child_process');",
    `const c=spawn(process.execPath,['-e','setTimeout(()=>{},60000)'],{stdio:['ignore','inherit','inherit']${grandchildDetached ? ',detached:true' : ''}});`,
    "process.stdout.write(String(c.pid)+'\\n');",
    'c.unref();',
    'process.exit(0);',
  ].join('');
}

/** Descendant that catches SIGTERM, closes only its stdio, and stays alive on an interval (root repro 1046). */
const STDIO_CLOSE_ALIVE_DESCENDANT = "const fs=require('node:fs');process.on('SIGTERM',()=>{try{fs.closeSync(1)}catch{};try{fs.closeSync(2)}catch{}});process.stdout.write(String(process.pid)+'\\n');setInterval(()=>{},1000);";

/** Root repro 1046: parent spawns the stdio-close-alive descendant and exits 0 immediately. */
function parentExitsLeavingStdioCloseAliveDescendant(): string {
  return `const {spawn}=require('node:child_process');const child=spawn(process.execPath,['-e',${JSON.stringify(STDIO_CLOSE_ALIVE_DESCENDANT)}],{stdio:['ignore','inherit','inherit']});child.unref();process.exit(0);`;
}

/** Variant: the parent STAYS alive (default SIGTERM disposition) next to the stdio-close-alive descendant. */
function parentStaysAliveWithStdioCloseAliveDescendant(): string {
  return `const {spawn}=require('node:child_process');const child=spawn(process.execPath,['-e',${JSON.stringify(STDIO_CLOSE_ALIVE_DESCENDANT)}],{stdio:['ignore','inherit','inherit']});child.unref();setTimeout(()=>{},60000);`;
}

function pidsSeen(): { capture: (chunk: Buffer) => void; grandchild: () => number | null } {
  let grandchild: number | null = null;
  return {
    capture: (chunk: Buffer) => {
      for (const token of String(chunk).split(/\s+/)) {
        const value = Number(token);
        if (Number.isSafeInteger(value) && value > 1) grandchild = value;
      }
    },
    grandchild: () => grandchild,
  };
}

function isAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

/** Test-owned cleanup of a pid THIS test's disposable program printed — never a discovered pid. */
function reapOwnedDescendant(pid: number | null): void {
  if (pid === null) return;
  try { process.kill(pid, 'SIGKILL'); } catch { /* already gone */ }
}

async function runTree(program: string, timeoutMs: number, graceMs: number): Promise<{ result: SyncGitProcessResult; grandchild: number | null; elapsed: number; parentExitedAt: number | null }> {
  const seen = pidsSeen();
  let parentExitedAt: number | null = null;
  const started = Date.now();
  const result = await runSyncGitProcess({
    cwd: tmp,
    command: process.execPath,
    args: ['-e', program],
    timeoutMs,
    graceMs,
    spawnImpl: (command, args, options) => {
      const child = spawn(command, args, options);
      child.once('exit', () => { parentExitedAt = Date.now() - started; });
      child.stdout?.on('data', seen.capture);
      return child;
    },
  });
  return { result, grandchild: seen.grandchild(), elapsed: Date.now() - started, parentExitedAt };
}

describe('runSyncGitProcess — anchored custody: real tree truth (7104 v4, root repro semantics)', () => {
  afterEach(() => resetSyncGitProcessChainState());

  it('(10) root repro 1043: parent exits 0 while a same-group descendant holds stdout — the anchor keeps authority, the descendant is REALLY terminated, typed timeout with proven-empty group', async () => {
    const { result, grandchild, elapsed } = await runTree(parentThatExitsLeavingDescendant(false), 100, 50);
    const failure = expectFailure(result);
    expect(failure.kind).toBe('timeout');
    expect(failure.detail.startsWith('timeout: ')).toBe(true);
    expect(failure.childExited).toBe(true);
    expect(failure.streamsClosed).toBe(true);
    expect(failure.treeTerminated).toBe(true);
    expect(failure.custody?.mode).toBe('posix-anchor');
    expect(failure.custody?.groupProbe).toBe('empty');
    expect(failure.custody?.signalsSent).toEqual(['SIGTERM', 'SIGKILL']);
    // The direct target exited 0 long before the deadline (its own IPC exit record), yet the deadline still governed the tree.
    expect(failure.custody?.targetExit).toEqual({ code: 0, signal: null });
    // Resolves well inside root's 500 ms window (deadline 100 + descendant death + probe), not at a 1 s+ bound.
    expect(elapsed).toBeLessThan(500);
    expect(grandchild).not.toBeNull();
    expectProcessDead(grandchild);
    expect(getSyncGitUnresolvedTree(tmp)).toBeNull();
  }, 10_000);

  it('(11) a descendant that escaped to its own session holds stdout: the owned group is proven empty, the streams stay held from outside it — child_tree_unresolved, the escaped process is NOT signalled', async () => {
    const { result, grandchild, elapsed } = await runTree(parentThatExitsLeavingDescendant(true), 100, 50);
    try {
      const failure = expectFailure(result);
      expect(failure.kind).toBe('child_tree_unresolved');
      expect(failure.detail).toMatch(/owned group is empty but our stdio streams are still held by a process outside it/);
      expect(failure.treeTerminated).toBe(true);
      expect(failure.streamsClosed).toBe(false);
      expect(failure.custody?.groupProbe).toBe('empty');
      expect(elapsed).toBeLessThan(3000);
      expect(grandchild).not.toBeNull();
      expect(isAlive(grandchild as number)).toBe(true);
      expect(getSyncGitUnresolvedTree(tmp)).not.toBeNull();
    } finally {
      reapOwnedDescendant(grandchild);
    }
  }, 10_000);

  it('(12) a deadline declared before a late exit 0: SIGTERM ignored by the live target, it exits on its own — the result stays a timeout failure carrying the real exit record, tree proven empty', async () => {
    const result = await runSyncGitProcess({
      cwd: tmp,
      command: process.execPath,
      args: ['-e', "process.on('SIGTERM',()=>{});setTimeout(()=>{process.stdout.write('late\\n');process.exit(0)},400)"],
      timeoutMs: 50,
      graceMs: 5000,
    });
    const failure = expectFailure(result);
    expect(failure.kind).toBe('timeout');
    expect(failure.streamsClosed).toBe(true);
    expect(failure.treeTerminated).toBe(true);
    expect(failure.childExited).toBe(true);
    expect(failure.exitCode).toBe(0);
    expect(failure.custody?.targetExit).toEqual({ code: 0, signal: null });
    expect((failure as unknown as { stdout?: string }).stdout).toBeUndefined();
    expect(getSyncGitUnresolvedTree(tmp)).toBeNull();
  }, 10_000);

  it('(15) root repro 1046: parent exits 0; the descendant catches SIGTERM, closes only its stdio and lives — the anchor still owns the group, SIGKILL after grace REALLY terminates it, typed timeout with proven-empty group', async () => {
    const { result, grandchild, elapsed } = await runTree(parentExitsLeavingStdioCloseAliveDescendant(), 300, 100);
    const failure = expectFailure(result);
    expect(failure.kind).toBe('timeout');
    expect(failure.streamsClosed).toBe(true);
    expect(failure.treeTerminated).toBe(true);
    expect(failure.custody?.groupProbe).toBe('empty');
    expect(failure.custody?.signalsSent).toEqual(['SIGTERM', 'SIGKILL']);
    expect(elapsed).toBeLessThan(3000);
    expect(grandchild).not.toBeNull();
    expectProcessDead(grandchild);
    expect(getSyncGitUnresolvedTree(tmp)).toBeNull();
  }, 10_000);

  it('(16) target alive at the deadline, its descendant survives the group SIGTERM by closing only stdio — streams close, the group still has that member, the anchor-held authority SIGKILLs it: typed timeout, descendant dead', async () => {
    const { result, grandchild, elapsed } = await runTree(parentStaysAliveWithStdioCloseAliveDescendant(), 100, 100);
    const failure = expectFailure(result);
    expect(failure.kind).toBe('timeout');
    expect(failure.streamsClosed).toBe(true);
    expect(failure.treeTerminated).toBe(true);
    expect(failure.childExited).toBe(true);
    expect(elapsed).toBeLessThan(3000);
    expect(grandchild).not.toBeNull();
    expectProcessDead(grandchild);
  }, 10_000);

  it('(17) chain stop: after an unresolved tree (escaped session), the next Git call for the SAME repository is refused before spawning; another repository is unaffected; an explicit reset re-enables the repository', async () => {
    const first = await runTree(parentThatExitsLeavingDescendant(true), 100, 50);
    try {
      expect(expectFailure(first.result).kind).toBe('child_tree_unresolved');
      const refused = await runSyncGitProcess({ cwd: tmp, command: process.execPath, args: ['-e', "process.stdout.write('ok')"] });
      const failure = expectFailure(refused);
      expect(failure.kind).toBe('child_tree_unresolved');
      expect(failure.detail).toMatch(/^child_tree_unresolved: refusing .* an earlier Git call for this repository left an unresolved process tree \(pgid \d+ at /);
      expect(failure.pid).toBeNull();
      expect(failure.durationMs).toBe(0);
      const other = mkdtempSync(join(tmpdir(), 'deckent-sync-async-liveness-other-'));
      try {
        const elsewhere = await runSyncGitProcess({ cwd: other, command: process.execPath, args: ['-e', "process.stdout.write('ok')"] });
        expect(elsewhere.ok).toBe(true);
      } finally {
        rmSync(other, { recursive: true, force: true });
      }
      resetSyncGitProcessChainState();
      const again = await runSyncGitProcess({ cwd: tmp, command: process.execPath, args: ['-e', "process.stdout.write('ok')"] });
      expect(again.ok).toBe(true);
    } finally {
      reapOwnedDescendant(first.grandchild);
    }
  }, 15_000);

  it('(18) success custody: a plain exit-0 target carries the three separate records — IPC target exit, stream EOF and a proven-empty group — and no SIGTERM was ever needed', async () => {
    const result = await runSyncGitProcess({ cwd: tmp, command: process.execPath, args: ['-e', "process.stdout.write('a\\0b\\0')"] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.stdout).toBe('a\0b\0');
    expect(result.custody?.mode).toBe('posix-anchor');
    expect(result.custody?.targetExit).toEqual({ code: 0, signal: null });
    expect(result.custody?.groupProbe).toBe('empty');
    expect(result.custody?.anchorExited).toBe(true);
    expect(result.custody?.signalsSent).toEqual(['SIGKILL']);
    expect(result.custody?.anchorPid).not.toBeNull();
    expectProcessDead(result.custody?.anchorPid ?? null);
  }, 10_000);
});

// ─── 7104 sync-async v5 (ENTRY 1051 REVISE): ONE lifetime deadline covers the ──
// anchor handshake, the spawn admission and the execution. A suspended or
// silent anchor is contained by the same forced path, with verified cleanup
// and no external intervention; a closed IPC channel never strands a call.

/** A fake anchor program that says ready and then does exactly `afterReady`. */
function fakeAnchorProgram(afterReady: string): string {
  return `process.on('SIGTERM',()=>{});process.send({type:'ready',pid:process.pid});${afterReady}`;
}

async function runWithAnchorProgram(program: string, timeoutMs: number, graceMs: number, onAnchor?: (child: ChildProcess) => void): Promise<{ result: SyncGitProcessResult; anchorPid: number | null; elapsed: number }> {
  let anchorPid: number | null = null;
  const started = Date.now();
  const result = await runSyncGitProcess({
    cwd: tmp,
    command: process.execPath,
    args: ['-e', "process.stdout.write('target-ran')"],
    timeoutMs,
    graceMs,
    spawnImpl: (_command, _args, options) => {
      const child = spawn(process.execPath, ['-e', program], options);
      anchorPid = child.pid ?? null;
      onAnchor?.(child);
      return child;
    },
  });
  return { result, anchorPid, elapsed: Date.now() - started };
}

describe('runSyncGitProcess — lifetime deadline across handshake/admission/execution (7104 v5, root probe semantics)', () => {
  afterEach(() => resetSyncGitProcessChainState());

  it('(19) root probe 1051: the REAL anchor is SIGSTOPped through its own handle right after ready — the deadline still fires, the group is SIGKILLed, typed timeout with proven-empty group, no external intervention', async () => {
    let anchorPid: number | null = null;
    let stoppedOnReady = false;
    const started = Date.now();
    const result = await runSyncGitProcess({
      cwd: tmp,
      command: process.execPath,
      args: ['-e', "process.stdout.write('target-ran')"],
      timeoutMs: 50,
      graceMs: 20,
      spawnImpl: (command, args, options) => {
        const child = spawn(command, args, options);
        anchorPid = child.pid ?? null;
        child.once('message', (message: unknown) => {
          if ((message as { type?: string })?.type === 'ready') stoppedOnReady = child.kill('SIGSTOP');
        });
        return child;
      },
    });
    const elapsed = Date.now() - started;
    expect(stoppedOnReady).toBe(true);
    const failure = expectFailure(result);
    expect(failure.kind).toBe('timeout');
    expect(failure.detail).toMatch(/^timeout: .*exceeded 50 ms \(phase admission: the anchor never acknowledged the target spawn\)/);
    expect(failure.pid).toBeNull();
    expect(failure.childExited).toBeNull();
    expect(failure.streamsClosed).toBe(true);
    expect(failure.treeTerminated).toBe(true);
    expect(failure.custody?.targetPid).toBeNull();
    expect(failure.custody?.groupProbe).toBe('empty');
    expect(failure.custody?.signalsSent).toEqual(['SIGTERM', 'SIGKILL']);
    expect(elapsed).toBeLessThan(1500);
    expectProcessDead(anchorPid);
    expect(getSyncGitUnresolvedTree(tmp)).toBeNull();
  }, 10_000);

  it('(20) absent spawn acknowledgment: an anchor that says ready and then ignores every message is contained by the lifetime deadline; cleanup verified', async () => {
    const { result, anchorPid, elapsed } = await runWithAnchorProgram(fakeAnchorProgram('setInterval(()=>{},1000);'), 60, 20);
    const failure = expectFailure(result);
    expect(failure.kind).toBe('timeout');
    expect(failure.detail).toMatch(/phase admission/);
    expect(failure.treeTerminated).toBe(true);
    expect(failure.custody?.targetPid).toBeNull();
    expect(elapsed).toBeLessThan(1500);
    expectProcessDead(anchorPid);
  }, 10_000);

  it('(21) delayed spawn acknowledgment inside the deadline: an anchor that acknowledges late still yields a normal success with the three custody records', async () => {
    const delayed = fakeAnchorProgram(
      "const {spawn}=require('node:child_process');const fs=require('node:fs');let target=null;"
      + "process.on('message',(m)=>{if(m.type==='kill'){if(target){try{target.kill(m.signal)}catch{}}return;}"
      + "if(m.type==='spawn'){setTimeout(()=>{const t=spawn(m.command,m.args,{cwd:m.cwd,stdio:['ignore',1,2],shell:false});target=t;"
      + "t.once('spawn',()=>{try{fs.closeSync(1)}catch{}try{fs.closeSync(2)}catch{}process.send({type:'spawned',pid:t.pid});});"
      + "t.once('exit',(code,signal)=>process.send({type:'target-exit',code,signal}));},150);}});",
    );
    const { result, anchorPid, elapsed } = await runWithAnchorProgram(delayed, 2000, 50);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.stdout).toBe('target-ran');
    expect(result.custody?.targetExit).toEqual({ code: 0, signal: null });
    expect(result.custody?.groupProbe).toBe('empty');
    expect(elapsed).toBeGreaterThanOrEqual(150);
    expect(elapsed).toBeLessThan(2000);
    expectProcessDead(anchorPid);
  }, 10_000);

  it('(22) IPC channel closed while the spawn is pending: the pending acknowledgment settles as ipc-closed, the call ends as a typed spawn_error with the anchor group SIGKILLed — not a strand, not a timeout', async () => {
    const { result, anchorPid, elapsed } = await runWithAnchorProgram(
      fakeAnchorProgram("process.on('message',(m)=>{if(m.type==='spawn'){process.disconnect();}});setInterval(()=>{},1000);"),
      5000,
      50,
    );
    const failure = expectFailure(result);
    expect(failure.kind).toBe('spawn_error');
    expect(failure.detail).toMatch(/process-group anchor ipc-closed: anchor IPC channel closed before the spawn was acknowledged/);
    expect(failure.treeTerminated).toBe(true);
    expect(failure.custody?.signalsSent).toEqual(['SIGKILL']);
    expect(elapsed).toBeLessThan(3000);
    expectProcessDead(anchorPid);
  }, 10_000);

  it('(23) handshake bounded by the lifetime deadline: an anchor that never says ready is SIGKILLed through its direct handle, cleanup verified, typed timeout in the handshake phase', async () => {
    const { result, anchorPid, elapsed } = await runWithAnchorProgram("process.on('SIGTERM',()=>{});setInterval(()=>{},1000);", 100, 20);
    const failure = expectFailure(result);
    expect(failure.kind).toBe('timeout');
    expect(failure.detail).toMatch(/^timeout: .*lifetime deadline 100 ms exceeded during the anchor handshake/);
    expect(failure.treeTerminated).toBe(true);
    expect(failure.custody?.anchorExited).toBe(true);
    expect(failure.custody?.targetPid).toBeNull();
    expect(elapsed).toBeLessThan(1500);
    expectProcessDead(anchorPid);
    expect(getSyncGitUnresolvedTree(tmp)).toBeNull();
  }, 10_000);
});

describe('runSyncGitProcess — stderr hard cap (7104 v2)', () => {
  it('(13) stderr beyond maxOutputBytes is dropped and counted, never overshoots the cap, and never fails a successful command', async () => {
    const result = await runSyncGitProcess({
      cwd: tmp,
      command: process.execPath,
      args: ['-e', "const b='e'.repeat(1<<20);let n=0;const w=()=>{if(n++<4){process.stderr.write(b,w)}else{process.stdout.write('done\\n',()=>process.exit(0))}};w()"],
      maxOutputBytes: 64 * 1024,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Buffer.byteLength(result.stderr)).toBe(64 * 1024);
    expect(result.stderrBytesDropped).toBe(4 * (1 << 20) - 64 * 1024);
    expect(result.stdout).toBe('done\n');
  }, 10_000);

  it('(14) with a flooded stderr, a non-zero exit still reports the first stderr line verbatim', async () => {
    const result = await runSyncGitProcess({
      cwd: tmp,
      command: process.execPath,
      args: ['-e', "process.stderr.write('fatal: first\\n'+'x'.repeat(1<<20),()=>process.exit(2))"],
      maxOutputBytes: 64 * 1024,
    });
    const failure = expectFailure(result);
    expect(failure.kind).toBe('nonzero_exit');
    expect(failure.detail).toBe('nonzero_exit: fatal: first');
    expect(failure.exitCode).toBe(2);
  }, 10_000);
});
