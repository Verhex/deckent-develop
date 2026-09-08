// Real-process coverage for src/core/process-group-anchor.ts (7104
// SYNC-ASYNC-GIT-CLOSURE). POSIX-only by construction (process groups have
// no Windows equivalent); the whole file is skipped on win32 rather than
// silently passing — see the describe title below.
//
// Hermeticity: every case gets its own tmpdir; every process this suite
// spawns is either reaped through the anchor's own `terminateGroup()`
// (SIGKILLs the whole owned group) or, for the two cases that deliberately
// escape that group (an anchor spawned by a throwaway helper, an
// intentionally detached grandchild, a fake never-ready anchor), reaped
// directly by pid in a `finally` block. No pid is ever discovered/foreign —
// each one is read back from output this test's own spawned programs wrote.

import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  createProcessGroupAnchor,
  PROCESS_GROUP_ANCHOR_PROGRAM,
  type ProcessGroupAnchor,
} from '../../src/core/process-group-anchor.js';

/** Poll a predicate until it is true or the bound elapses; returns the final value. */
async function waitUntil(predicate: () => boolean, timeoutMs: number, intervalMs = 20): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (predicate()) return true;
    if (Date.now() >= deadline) return predicate();
    await delay(intervalMs);
  }
}

/** true = the pid answered ESRCH to a signal-0 probe (proven dead). */
function isDead(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return false;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'ESRCH';
  }
}

/** Best-effort cleanup backstop: safe to call even if the test already terminated the group. */
async function safeCleanup(anchor: ProcessGroupAnchor | undefined): Promise<void> {
  if (!anchor) return;
  try {
    await anchor.terminateGroup();
  } catch {
    /* best-effort only — assertions already ran */
  }
}

/** Poll accumulated stdout chunks for a single decimal pid line, generous bound. */
async function waitForDecimalLine(chunks: Buffer[], timeoutMs = 2000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const text = Buffer.concat(chunks).toString('utf8').trim();
    if (/^\d+$/.test(text)) return text;
    if (Date.now() >= deadline) return text;
    await delay(20);
  }
}

describe.skipIf(process.platform === 'win32')(
  'process-group-anchor (POSIX-only: real process-group custody; unsupported and skipped on win32)',
  () => {
    let tmp: string;

    beforeEach(async () => {
      tmp = await mkdtemp(join(tmpdir(), 'deckent-process-group-anchor-'));
    });

    afterEach(async () => {
      await rm(tmp, { recursive: true, force: true });
    });

    it('completes the ready handshake, proves group non-emptiness while alive, then group-terminates cleanly', async () => {
      const created = await createProcessGroupAnchor(tmp);
      expect(created.ok).toBe(true);
      if (!created.ok) throw new Error('unreachable: handshake setup failed');
      const anchor = created.anchor;
      try {
        expect(Number.isFinite(anchor.handshakeMs)).toBe(true);
        expect(anchor.handshakeMs).toBeLessThan(5000);
        expect(anchor.anchorAlive()).toBe(true);
        expect(anchor.pgid).toBe(anchor.anchorPid);
        expect(anchor.probeGroupEmpty()).toBe(false);

        const term = await anchor.terminateGroup();
        expect(term).toEqual({ anchorExited: true, groupEmpty: true, signalled: true });

        let threw: NodeJS.ErrnoException | null = null;
        try {
          process.kill(anchor.anchorPid, 0);
        } catch (error) {
          threw = error as NodeJS.ErrnoException;
        }
        expect(threw?.code).toBe('ESRCH');
        expect(anchor.anchorAlive()).toBe(false);
      } finally {
        await safeCleanup(anchor);
      }
    });

    it('keeps stream EOF, IPC target-exit, and the exit record as three independent, correctly-ordered records', async () => {
      const created = await createProcessGroupAnchor(tmp);
      expect(created.ok).toBe(true);
      if (!created.ok) throw new Error('unreachable: setup failed');
      const anchor = created.anchor;
      try {
        const stdoutChunks: Buffer[] = [];
        let eofAt: number | null = null;
        const eofObserved = new Promise<number>((resolve) => {
          anchor.stdout.on('data', (chunk: Buffer) => stdoutChunks.push(chunk));
          anchor.stdout.once('end', () => {
            eofAt = Date.now();
            resolve(eofAt);
          });
        });

        const script =
          "process.stdout.write('x');" +
          "require('node:fs').closeSync(1);" +
          "require('node:fs').closeSync(2);" +
          'setTimeout(()=>process.exit(7),300);';
        const spawnResult = await anchor.spawnTarget({ command: process.execPath, args: ['-e', script], cwd: tmp });
        expect(spawnResult.ok).toBe(true);

        let targetExitAt: number | null = null;
        const targetExitObserved = anchor.targetExit.then((record) => {
          targetExitAt = Date.now();
          return record;
        });

        const observedEofAt = await eofObserved;
        const record = await targetExitObserved;
        expect(targetExitAt).not.toBeNull();

        expect(record).toEqual({ code: 7, signal: null });
        expect(Buffer.concat(stdoutChunks).toString('utf8')).toBe('x');
        expect((targetExitAt as unknown as number) - observedEofAt).toBeGreaterThanOrEqual(100);

        const term = await anchor.terminateGroup();
        expect(term.groupEmpty).toBe(true);
      } finally {
        await safeCleanup(anchor);
      }
    });

    it('signalGroup carries authority over a live target while the anchor survives the SIGTERM', async () => {
      const created = await createProcessGroupAnchor(tmp);
      expect(created.ok).toBe(true);
      if (!created.ok) throw new Error('unreachable: setup failed');
      const anchor = created.anchor;
      try {
        const spawnResult = await anchor.spawnTarget({
          command: process.execPath,
          args: ['-e', 'setTimeout(()=>{},60000);'],
          cwd: tmp,
        });
        expect(spawnResult.ok).toBe(true);

        expect(anchor.signalGroup('SIGTERM')).toBe(true);
        const record = await anchor.targetExit;
        expect(record).toEqual({ code: null, signal: 'SIGTERM' });

        expect(anchor.anchorAlive()).toBe(true);
        expect(anchor.probeGroupEmpty()).toBe(false);

        const term = await anchor.terminateGroup();
        expect(term.groupEmpty).toBe(true);
      } finally {
        await safeCleanup(anchor);
      }
    });

    it('killTarget reaches a SIGTERM-ignoring target via the anchor-held handle without touching the anchor', async () => {
      const created = await createProcessGroupAnchor(tmp);
      expect(created.ok).toBe(true);
      if (!created.ok) throw new Error('unreachable: setup failed');
      const anchor = created.anchor;
      try {
        // The SIGTERM handler must be observably installed before we signal —
        // otherwise a signal delivered in the spawn/first-tick window would
        // terminate the target for real (default disposition) and this test
        // would be asserting against its own race, not the target's ignore
        // behaviour. `process.on('SIGTERM', ...)` runs synchronously as this
        // script's first statement, strictly before the stdout write below,
        // so observing that write's bytes proves the handler is already in
        // place.
        const readyChunks: Buffer[] = [];
        const sawReady = new Promise<void>((resolve) => {
          const onData = (chunk: Buffer): void => {
            readyChunks.push(chunk);
            if (Buffer.concat(readyChunks).includes('ready')) {
              anchor.stdout.off('data', onData);
              resolve();
            }
          };
          anchor.stdout.on('data', onData);
        });
        const spawnResult = await anchor.spawnTarget({
          command: process.execPath,
          args: [
            '-e',
            "process.on('SIGTERM',()=>{});process.stdout.write('ready',()=>{setTimeout(()=>{},60000);});",
          ],
          cwd: tmp,
        });
        expect(spawnResult.ok).toBe(true);
        await sawReady;

        expect(anchor.signalGroup('SIGTERM')).toBe(true);
        const race = await Promise.race([
          anchor.targetExit.then(() => 'resolved' as const),
          delay(200).then(() => 'pending' as const),
        ]);
        expect(race).toBe('pending');

        expect(anchor.killTarget('SIGKILL')).toBe(true);
        const record = await anchor.targetExit;
        expect(record).toEqual({ code: null, signal: 'SIGKILL' });
        expect(anchor.anchorAlive()).toBe(true);

        const term = await anchor.terminateGroup();
        expect(term.groupEmpty).toBe(true);
      } finally {
        await safeCleanup(anchor);
      }
    });

    it('retains authority over a same-group grandchild that outlives the target that spawned it', async () => {
      const created = await createProcessGroupAnchor(tmp);
      expect(created.ok).toBe(true);
      if (!created.ok) throw new Error('unreachable: setup failed');
      const anchor = created.anchor;
      let grandchildPid: number | undefined;
      try {
        const stdoutChunks: Buffer[] = [];
        anchor.stdout.on('data', (chunk: Buffer) => stdoutChunks.push(chunk));

        const script =
          "const {spawn}=require('node:child_process');" +
          "const c=spawn(process.execPath,['-e','setTimeout(()=>{},60000);'],{stdio:'inherit'});" +
          'c.unref();' +
          "process.stdout.write(String(c.pid),()=>{process.exit(0);});";
        const spawnResult = await anchor.spawnTarget({ command: process.execPath, args: ['-e', script], cwd: tmp });
        expect(spawnResult.ok).toBe(true);

        const record = await anchor.targetExit;
        expect(record).toEqual({ code: 0, signal: null });

        const pidText = await waitForDecimalLine(stdoutChunks);
        grandchildPid = Number(pidText);
        expect(Number.isInteger(grandchildPid)).toBe(true);

        // The target already exited (code 0 above); the group is proven
        // non-empty ONLY because the grandchild it spawned is still a member.
        expect(anchor.probeGroupEmpty()).toBe(false);
        expect(anchor.signalGroup('SIGKILL')).toBe(true);

        const term = await anchor.terminateGroup();
        // SIGKILL delivery to the group is immediate, but this grandchild was
        // orphaned when its spawning target exited first: its OS-level parent
        // is now an external subreaper (PID 1 or equivalent), not the anchor,
        // so ITS zombie is reaped on that unrelated process's own schedule —
        // not synchronously with the anchor's own exit that terminateGroup()
        // waits on. A single immediate probe can observe a just-killed-but
        // -not-yet-reaped zombie as "still there" (kill(pid,0) succeeds for a
        // zombie; only ESRCH after the real parent reaps it). Poll the same
        // probeGroupEmpty() the return value already used, generously bounded,
        // for the terminal truth rather than trusting one point-in-time call.
        const groupEmpty = term.groupEmpty === true ? true : await waitUntil(() => anchor.probeGroupEmpty() === true, 5000, 20);
        expect(groupEmpty).toBe(true);
        const grandchildDead = isDead(grandchildPid) || (await waitUntil(() => isDead(grandchildPid as number), 5000, 20));
        expect(grandchildDead).toBe(true);
      } finally {
        await safeCleanup(anchor);
        if (grandchildPid !== undefined && !isDead(grandchildPid)) {
          try {
            process.kill(grandchildPid, 'SIGKILL');
          } catch {
            /* already gone */
          }
        }
      }
    });

    it('does not reach a detached grandchild that escaped into its own process group', async () => {
      const created = await createProcessGroupAnchor(tmp);
      expect(created.ok).toBe(true);
      if (!created.ok) throw new Error('unreachable: setup failed');
      const anchor = created.anchor;
      let grandchildPid: number | undefined;
      try {
        const stdoutChunks: Buffer[] = [];
        anchor.stdout.on('data', (chunk: Buffer) => stdoutChunks.push(chunk));

        const script =
          "const {spawn}=require('node:child_process');" +
          "const c=spawn(process.execPath,['-e','setTimeout(()=>{},60000);'],{stdio:'inherit',detached:true});" +
          'c.unref();' +
          "process.stdout.write(String(c.pid),()=>{process.exit(0);});";
        const spawnResult = await anchor.spawnTarget({ command: process.execPath, args: ['-e', script], cwd: tmp });
        expect(spawnResult.ok).toBe(true);

        const record = await anchor.targetExit;
        expect(record).toEqual({ code: 0, signal: null });

        const pidText = await waitForDecimalLine(stdoutChunks);
        grandchildPid = Number(pidText);
        expect(Number.isInteger(grandchildPid)).toBe(true);
        expect(isDead(grandchildPid)).toBe(false);

        const term = await anchor.terminateGroup();
        expect(term.groupEmpty).toBe(true);

        // The escaped grandchild has its own pgid; the owned group's SIGKILL
        // never reached it — this is the negative case the custody model requires.
        expect(isDead(grandchildPid)).toBe(false);
      } finally {
        await safeCleanup(anchor);
        if (grandchildPid !== undefined) {
          try {
            process.kill(grandchildPid, 'SIGKILL');
          } catch {
            /* already gone */
          }
        }
      }
    });

    it('reports no authority once the group has been terminated: both signal paths return false and send nothing', async () => {
      const created = await createProcessGroupAnchor(tmp);
      expect(created.ok).toBe(true);
      if (!created.ok) throw new Error('unreachable: setup failed');
      const anchor = created.anchor;
      try {
        const term = await anchor.terminateGroup();
        expect(term.groupEmpty).toBe(true);

        expect(anchor.signalGroup('SIGTERM')).toBe(false);
        expect(anchor.killTarget('SIGKILL')).toBe(false);
      } finally {
        await safeCleanup(anchor);
      }
    });

    it('SIGKILLs its own group on owner IPC disconnect, with no supervisor involved', async () => {
      const helperScript =
        "const {spawn}=require('node:child_process');" +
        'const program=process.env.DECKENT_TEST_ANCHOR_PROGRAM;' +
        "const anchor=spawn(process.execPath,['-e',program],{cwd:process.cwd(),stdio:['ignore','ignore','ignore','ipc'],detached:true});" +
        'anchor.unref();' +
        "anchor.on('message',(m)=>{" +
        "  if(m&&m.type==='ready'){" +
        "    process.stdout.write(String(anchor.pid),()=>{process.exit(0);});" +
        '  }' +
        '});';

      let anchorPid: number | undefined;
      try {
        const helperChunks: Buffer[] = [];
        const helper = spawn(process.execPath, ['-e', helperScript], {
          cwd: tmp,
          stdio: ['ignore', 'pipe', 'pipe'],
          env: { ...process.env, DECKENT_TEST_ANCHOR_PROGRAM: PROCESS_GROUP_ANCHOR_PROGRAM },
        });
        helper.stdout!.on('data', (chunk: Buffer) => helperChunks.push(chunk));
        await new Promise<void>((resolve) => helper.once('exit', () => resolve()));

        const anchorPidText = Buffer.concat(helperChunks).toString('utf8').trim();
        anchorPid = Number(anchorPidText);
        expect(Number.isInteger(anchorPid)).toBe(true);

        const dead = await waitUntil(() => isDead(anchorPid as number), 2000, 20);
        expect(dead).toBe(true);
      } finally {
        if (anchorPid !== undefined && !isDead(anchorPid)) {
          try {
            process.kill(anchorPid, 'SIGKILL');
          } catch {
            /* already gone */
          }
        }
      }
    });

    it('surfaces a spawn-error through the anchor without losing the anchor itself', async () => {
      const created = await createProcessGroupAnchor(tmp);
      expect(created.ok).toBe(true);
      if (!created.ok) throw new Error('unreachable: setup failed');
      const anchor = created.anchor;
      try {
        const result = await anchor.spawnTarget({
          command: join(tmp, 'no-such-binary'),
          args: [],
          cwd: tmp,
        });
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.reason).toBe('spawn-error');
          expect(result.message).toMatch(/ENOENT/);
        }
        expect(anchor.anchorAlive()).toBe(true);

        const term = await anchor.terminateGroup();
        expect(term.groupEmpty).toBe(true);
      } finally {
        await safeCleanup(anchor);
      }
    });

    it('reports unsupported-platform on win32 without spawning anything', async () => {
      const spawnImpl = (): never => {
        throw new Error('spawnImpl must never be invoked for an unsupported platform');
      };
      const result = await createProcessGroupAnchor(tmp, { platform: 'win32', spawnImpl });
      expect(result).toEqual({
        ok: false,
        reason: 'unsupported-platform',
        message: expect.stringContaining('Job Object'),
        // v5: handshake-class failures carry cleanup evidence; nothing was spawned here.
        anchorPid: null,
        anchorExited: null,
      });
    });

    it('kills its own direct handle (not the group) on handshake timeout', async () => {
      let fakeAnchorPid: number | undefined;
      const result = await createProcessGroupAnchor(tmp, {
        handshakeTimeoutMs: 1,
        spawnImpl: (_command, _args, options) => {
          const child = spawn(process.execPath, ['-e', 'setTimeout(()=>{},60000);'], options);
          fakeAnchorPid = child.pid;
          return child;
        },
      });
      try {
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.reason).toBe('handshake-timeout');
          expect(result.message).toContain('within 1 ms');
        }
        expect(fakeAnchorPid).toBeDefined();
        const dead = await waitUntil(() => isDead(fakeAnchorPid as number), 1000, 10);
        expect(dead).toBe(true);
      } finally {
        if (fakeAnchorPid !== undefined && !isDead(fakeAnchorPid)) {
          try {
            process.kill(fakeAnchorPid, 'SIGKILL');
          } catch {
            /* already gone */
          }
        }
      }
    });
  },
);
