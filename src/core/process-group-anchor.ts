// ─── Owned process-group lifetime anchor (POSIX) ──────────────────────────────
//
// Why this exists (7104 SYNC-ASYNC-GIT-CLOSURE, ENTRY 1046/1048): a detached
// child is the leader of a process group this process created, but that
// ownership handle is only provable WHILE THE LEADER IS ALIVE. A short-lived
// Git command exits at once, and any descendant that inherited our pipes
// (or survived a SIGTERM by closing only its stdio) outlives it — after that
// point a group signal would target a group id we can no longer attribute to
// ourselves (pid/pgid reuse), so it must not be sent. The anchor closes that
// gap: a minimal Node child that becomes the group leader, spawns the target
// INSIDE its group, forwards no bytes itself (the target inherits the pipes;
// the anchor closes its own copies right after the spawn so stream EOF
// reflects the target tree only), survives SIGTERM, and stays alive until the
// owner terminates the whole group with SIGKILL. Authority therefore holds
// for the entire call — before, during and after the target's exit.
//
// Three records, kept separate on purpose (none is a proxy for another):
//   · IPC handshake / spawn / target-exit  — over the 'ipc' channel (fd 3);
//     stdout/stderr carry ONLY the target tree's bytes, never protocol.
//   · stream EOF                            — observed by the owner on the pipes.
//   · group emptiness                       — proven ONLY by a signal-0 probe
//     of the owned group answering ESRCH.
// Attribution rule: group signals are sent only while the anchor process is
// alive (we hold its ChildProcess); a never-started, exited, or crashed anchor
// yields `false` from `signalGroup` — nothing is signalled on assumptions.
// Owner disconnect (this process dies): the anchor SIGKILLs its own group,
// itself included — bounded cleanup without a supervisor daemon.
//
// Windows has no POSIX process groups; the equivalent custody would be a Job
// Object, which Node cannot create without a native addon. `createProcessGroupAnchor`
// reports `unsupported-platform` there and callers must safe-stop (no
// "tree terminated" claims on win32). This module reuses the canonical
// `signalProcessGroup` primitive (src/core/process-tree-termination.ts); it
// is not a second process engine.

import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process';
import type { Readable } from 'node:stream';
import { signalProcessGroup } from './process-tree-termination.js';

/** Bound for the anchor's `ready` handshake. */
export const PROCESS_GROUP_ANCHOR_HANDSHAKE_MS = 5_000;
/** Interval between signal-0 probes while waiting for the owned group to become provably empty. */
export const PROCESS_GROUP_ANCHOR_PROBE_INTERVAL_MS = 20;
/** Bound for observing the anchor's own exit after the owner SIGKILLs the group. */
export const PROCESS_GROUP_ANCHOR_EXIT_OBSERVATION_MS = 1_000;

/**
 * The anchor child program (run as `node -e`). Inline by design: no compiled
 * bootstrap file to locate from tests or from dist, and no second engine. It
 * never writes to fd 1/2.
 */
export const PROCESS_GROUP_ANCHOR_PROGRAM = [
  "'use strict';",
  "const {spawn}=require('node:child_process');",
  "const fs=require('node:fs');",
  "process.title='deckent-process-group-anchor';",
  // The leader must survive the group SIGTERM so the group id stays owned until SIGKILL.
  "process.on('SIGTERM',()=>{});",
  "process.on('SIGINT',()=>{});",
  // Owner gone: terminate the whole owned group, this anchor included.
  "process.on('disconnect',()=>{try{process.kill(-process.pid,'SIGKILL')}catch{}process.exit(0)});",
  "let target=null;",
  "process.on('message',(m)=>{",
  "  if(!m||typeof m!=='object')return;",
  "  if(m.type==='kill'){if(target){try{target.kill(m.signal)}catch{}}return;}",
  "  if(m.type==='spawn'){",
  "    let t;",
  "    try{t=spawn(m.command,m.args,{cwd:m.cwd,stdio:['ignore',1,2],shell:false,windowsHide:true});}",
  "    catch(e){process.send({type:'spawn-error',message:String(e&&e.message||e)});return;}",
  "    target=t;",
  "    t.once('error',(e)=>{process.send({type:'spawn-error',message:String(e&&e.message||e)});});",
  "    t.once('spawn',()=>{try{fs.closeSync(1)}catch{}try{fs.closeSync(2)}catch{}process.send({type:'spawned',pid:t.pid});});",
  "    t.once('exit',(code,signal)=>{process.send({type:'target-exit',code:code,signal:signal});});",
  "  }",
  "});",
  "process.send({type:'ready',pid:process.pid});",
].join('\n');

export interface ProcessGroupAnchorSpawnRequest {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
}

export interface ProcessGroupAnchorTargetExit {
  readonly code: number | null;
  readonly signal: NodeJS.Signals | null;
}

export type ProcessGroupAnchorSpawnResult =
  | { readonly ok: true; readonly pid: number }
  | { readonly ok: false; readonly reason: 'spawn-error' | 'anchor-exited' | 'ipc-closed'; readonly message: string };

export interface ProcessGroupAnchorTerminateResult {
  /** Whether the anchor's exit was observed within the bound. */
  readonly anchorExited: boolean;
  /** Signal-0 probe of the owned group after the SIGKILL: true = ESRCH (proven empty). */
  readonly groupEmpty: boolean | null;
  /** false when nothing was signalled because the anchor was no longer alive (no authority). */
  readonly signalled: boolean;
}

export interface ProcessGroupAnchorHooks {
  readonly spawnImpl?: (command: string, args: readonly string[], options: SpawnOptions) => ChildProcess;
  readonly platform?: NodeJS.Platform;
  readonly handshakeTimeoutMs?: number;
}

export interface ProcessGroupAnchor {
  /** The anchor's pid — and, by `detached: true`, the id of the group it leads. */
  readonly anchorPid: number;
  readonly pgid: number;
  readonly handshakeMs: number;
  /** The target tree's stdout/stderr (the anchor never writes to them). */
  readonly stdout: Readable;
  readonly stderr: Readable;
  /** True while the anchor process is alive (authority for group signals). */
  anchorAlive(): boolean;
  /** Resolves once the anchor process has exited (any reason). */
  readonly anchorExit: Promise<{ code: number | null; signal: NodeJS.Signals | null }>;
  /** Ask the anchor to spawn the target inside the owned group. */
  spawnTarget(request: ProcessGroupAnchorSpawnRequest): Promise<ProcessGroupAnchorSpawnResult>;
  /** Resolves with the target's exit record (IPC), independent of stream EOF. Never resolves if the anchor dies first — race it with `anchorExit`. */
  readonly targetExit: Promise<ProcessGroupAnchorTargetExit>;
  /** Signal the owned group — ONLY while the anchor is alive. Returns false (and signals nothing) otherwise. */
  signalGroup(signal: 'SIGTERM' | 'SIGKILL'): boolean;
  /**
   * Ask the anchor to signal the TARGET through its own ChildProcess handle
   * (Node signals only a child it still tracks — never a reused pid). Returns
   * false without sending when the anchor is gone or its IPC is closed.
   */
  killTarget(signal: 'SIGTERM' | 'SIGKILL'): boolean;
  /** Signal-0 probe: true = ESRCH (group proven empty), false = something is there, null = no probe on this platform. */
  probeGroupEmpty(): boolean | null;
  /** SIGKILL the owned group (authority-gated), wait bounded for the anchor's exit, then probe. */
  terminateGroup(observationMs?: number): Promise<ProcessGroupAnchorTerminateResult>;
}

export type CreateProcessGroupAnchorResult =
  | { readonly ok: true; readonly anchor: ProcessGroupAnchor }
  | {
      readonly ok: false;
      readonly reason: 'unsupported-platform' | 'spawn-error' | 'handshake-timeout' | 'anchor-exited';
      readonly message: string;
      /** The anchor pid when a child did start (its group id), for cleanup verification by the caller. */
      readonly anchorPid: number | null;
      /** Whether that child's exit was observed before this result settled (null: no child). */
      readonly anchorExited: boolean | null;
    };

/** Signal-0 probe of a process group id. */
export function probeProcessGroupEmpty(pgid: number, platform: NodeJS.Platform = process.platform): boolean | null {
  if (platform === 'win32' || !Number.isSafeInteger(pgid) || pgid <= 1) return null;
  try {
    process.kill(-pgid, 0);
    return false;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'ESRCH' ? true : false;
  }
}

/**
 * Start an anchor for `cwd` and complete its `ready` handshake. Resolves —
 * never rejects — to a typed result so the caller's control flow stays a
 * discriminated union.
 */
export function createProcessGroupAnchor(cwd: string, hooks: ProcessGroupAnchorHooks = {}): Promise<CreateProcessGroupAnchorResult> {
  const platform = hooks.platform ?? process.platform;
  if (platform === 'win32') {
    return Promise.resolve({ ok: false, reason: 'unsupported-platform', message: 'process-group anchoring requires POSIX process groups; win32 needs a Job Object custody adapter (not available)', anchorPid: null, anchorExited: null });
  }
  const spawnImpl = hooks.spawnImpl ?? spawn;
  const handshakeTimeoutMs = hooks.handshakeTimeoutMs ?? PROCESS_GROUP_ANCHOR_HANDSHAKE_MS;
  const startedAt = Date.now();

  return new Promise<CreateProcessGroupAnchorResult>((resolve) => {
    let child: ChildProcess;
    try {
      child = spawnImpl(process.execPath, ['-e', PROCESS_GROUP_ANCHOR_PROGRAM], {
        cwd,
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
        shell: false,
        windowsHide: true,
        detached: true,
      });
    } catch (error) {
      resolve({ ok: false, reason: 'spawn-error', message: error instanceof Error ? error.message : String(error), anchorPid: null, anchorExited: null });
      return;
    }

    let settled = false;
    let alive = true;
    let exitRecord: { code: number | null; signal: NodeJS.Signals | null } | null = null;
    let resolveAnchorExit!: (value: { code: number | null; signal: NodeJS.Signals | null }) => void;
    const anchorExit = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((r) => { resolveAnchorExit = r; });
    let resolveTargetExit!: (value: ProcessGroupAnchorTargetExit) => void;
    const targetExit = new Promise<ProcessGroupAnchorTargetExit>((r) => { resolveTargetExit = r; });
    let pendingSpawn: ((value: ProcessGroupAnchorSpawnResult) => void) | null = null;

    const handshakeTimer = setTimeout(() => {
      if (settled) return;
      settled = true;
      // Attribution-bound: the direct handle we hold, never a group signal.
      // Resolve only after the child's exit is observed (bounded), so the
      // caller's cleanup evidence is real.
      try { child.kill('SIGKILL'); } catch { /* already gone */ }
      const observe = setTimeout(() => {
        resolve({ ok: false, reason: 'handshake-timeout', message: `anchor did not report ready within ${handshakeTimeoutMs} ms`, anchorPid: child.pid ?? null, anchorExited: !alive });
      }, PROCESS_GROUP_ANCHOR_EXIT_OBSERVATION_MS);
      observe.unref?.();
      void anchorExit.then(() => {
        clearTimeout(observe);
        resolve({ ok: false, reason: 'handshake-timeout', message: `anchor did not report ready within ${handshakeTimeoutMs} ms`, anchorPid: child.pid ?? null, anchorExited: true });
      });
    }, handshakeTimeoutMs);
    handshakeTimer.unref?.();

    child.on('error', (error: Error) => {
      if (!settled) {
        settled = true;
        clearTimeout(handshakeTimer);
        resolve({ ok: false, reason: 'spawn-error', message: error.message, anchorPid: child.pid ?? null, anchorExited: !alive });
      }
      if (pendingSpawn) { pendingSpawn({ ok: false, reason: 'anchor-exited', message: error.message }); pendingSpawn = null; }
    });
    // A closed IPC channel (anchor called disconnect, or the channel broke)
    // must never strand a pending spawn acknowledgment.
    child.on('disconnect', () => {
      if (pendingSpawn) { pendingSpawn({ ok: false, reason: 'ipc-closed', message: 'anchor IPC channel closed before the spawn was acknowledged' }); pendingSpawn = null; }
    });
    child.on('exit', (code, signal) => {
      alive = false;
      exitRecord = { code, signal };
      resolveAnchorExit(exitRecord);
      if (!settled) {
        settled = true;
        clearTimeout(handshakeTimer);
        resolve({ ok: false, reason: 'anchor-exited', message: `anchor exited before ready (code ${code ?? 'null'}, signal ${signal ?? 'null'})`, anchorPid: child.pid ?? null, anchorExited: true });
      }
      if (pendingSpawn) { pendingSpawn({ ok: false, reason: 'anchor-exited', message: `anchor exited (code ${code ?? 'null'}, signal ${signal ?? 'null'})` }); pendingSpawn = null; }
    });
    child.on('message', (message: unknown) => {
      if (!message || typeof message !== 'object') return;
      const m = message as { type?: unknown; pid?: unknown; message?: unknown; code?: unknown; signal?: unknown };
      if (m.type === 'ready') {
        if (settled) return;
        settled = true;
        clearTimeout(handshakeTimer);
        const anchorPid = child.pid as number;
        const anchor: ProcessGroupAnchor = {
          anchorPid,
          pgid: anchorPid,
          handshakeMs: Date.now() - startedAt,
          stdout: child.stdout as Readable,
          stderr: child.stderr as Readable,
          anchorAlive: () => alive && child.exitCode === null && (child.signalCode === null || child.signalCode === undefined),
          anchorExit,
          spawnTarget: (request) => new Promise<ProcessGroupAnchorSpawnResult>((resolveSpawn) => {
            if (!alive || !child.connected) {
              resolveSpawn({ ok: false, reason: alive ? 'ipc-closed' : 'anchor-exited', message: 'anchor is not available' });
              return;
            }
            pendingSpawn = resolveSpawn;
            try {
              child.send({ type: 'spawn', command: request.command, args: [...request.args], cwd: request.cwd });
            } catch (error) {
              pendingSpawn = null;
              resolveSpawn({ ok: false, reason: 'ipc-closed', message: error instanceof Error ? error.message : String(error) });
            }
          }),
          targetExit,
          signalGroup: (signal) => {
            if (!(alive && child.exitCode === null && (child.signalCode === null || child.signalCode === undefined))) return false;
            signalProcessGroup(child, signal, platform);
            return true;
          },
          killTarget: (signal) => {
            if (!(alive && child.connected)) return false;
            try { child.send({ type: 'kill', signal }); return true; } catch { return false; }
          },
          probeGroupEmpty: () => probeProcessGroupEmpty(anchorPid, platform),
          terminateGroup: async (observationMs = PROCESS_GROUP_ANCHOR_EXIT_OBSERVATION_MS) => {
            const signalled = anchor.signalGroup('SIGKILL');
            const deadline = Date.now() + observationMs;
            let anchorExited = !alive;
            if (!anchorExited) {
              anchorExited = await Promise.race([
                anchorExit.then(() => true),
                new Promise<boolean>((r) => { const t = setTimeout(() => r(false), observationMs); t.unref?.(); }),
              ]);
            }
            // Emptiness is a bounded POLL, not a single glance: a SIGKILLed
            // descendant that was orphaned onto an external subreaper stays a
            // zombie member (signal-0 still succeeds) until that reaper collects
            // it on its own schedule — a transient, not a survivor.
            let groupEmpty = probeProcessGroupEmpty(anchorPid, platform);
            while (groupEmpty === false && Date.now() < deadline) {
              await new Promise<void>((r) => { const t = setTimeout(r, PROCESS_GROUP_ANCHOR_PROBE_INTERVAL_MS); t.unref?.(); });
              groupEmpty = probeProcessGroupEmpty(anchorPid, platform);
            }
            return { anchorExited, groupEmpty, signalled };
          },
        };
        resolve({ ok: true, anchor });
        return;
      }
      if (m.type === 'spawned' && typeof m.pid === 'number') {
        if (pendingSpawn) { pendingSpawn({ ok: true, pid: m.pid }); pendingSpawn = null; }
        return;
      }
      if (m.type === 'spawn-error') {
        if (pendingSpawn) { pendingSpawn({ ok: false, reason: 'spawn-error', message: typeof m.message === 'string' ? m.message : 'spawn failed' }); pendingSpawn = null; }
        return;
      }
      if (m.type === 'target-exit') {
        resolveTargetExit({
          code: typeof m.code === 'number' ? m.code : null,
          signal: typeof m.signal === 'string' ? (m.signal as NodeJS.Signals) : null,
        });
      }
    });
  });
}
