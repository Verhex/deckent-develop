// ─── `deckent sync` Git subprocess adapter (7104 SYNC-ASYNC-GIT-CLOSURE, v4) ──
//
// The ONE way `src/cli/commands/sync.ts` runs Git. Replaces the synchronous
// `spawnSync` chain (which blocked the event loop for the whole probe →
// rev-list → ls-tree/diff sequence) with an awaited child process that keeps
// every provenance guarantee the sync contract already carried, and adds the
// ones a blocking call could only fake:
//
//   - `shell: false`, argument array only — never a shell string.
//   - a hard deadline (default: the SAME 10 s the spawnSync sites used — never
//     silently loosened) and an output cap (stdout beyond `maxOutputBytes` is
//     an OVERFLOW failure — a truncated listing is never parsed as a success;
//     stderr is hard-capped at the same bound, excess dropped and counted).
//   - custody with AUTHORITY (POSIX): the target runs inside an owned
//     process-group ANCHOR (`src/core/process-group-anchor.ts`) that stays the
//     group leader before, during and after the target's exit, so group
//     signals (SIGTERM, SIGKILL after `graceMs`) are always attributable to a
//     group this process created. Three records are kept apart and none
//     stands in for another: the target's exit (IPC), stream EOF (pipes),
//     and group emptiness (signal-0 probe answering ESRCH — the only proof).
//     Every call ends by SIGKILLing the owned group and probing it: a result
//     is a SUCCESS only when the target exited 0, the streams reached EOF and
//     the group is proven empty; a forced deadline/overflow is a typed failure
//     only when streams closed and the group is proven empty; anything else —
//     descendants that survived, streams held from outside the group (an
//     escaped session, which this adapter has no authority over), an anchor
//     that died — is the typed failure `child_tree_unresolved`, never a late
//     success and never a signal to a pid this adapter did not create.
//   - chain stop: an unresolved tree poisons further Git calls for the same
//     repository in this process (`child_tree_unresolved` returned before
//     spawning), so a command chain never continues blindly on top of an
//     unknown process tree. Reset only via `resetSyncGitProcessChainState`.
//   - Windows (no POSIX process groups, no Job Object adapter available): the
//     target runs directly; a completed command is judged by its exit and
//     stream closure with `treeTerminated: null`, and ANY forced termination
//     is `child_tree_unresolved` + chain stop — an unverifiable tree is a
//     safe-stop, never "terminated". Windows/macOS remain NOT_RUN here.
//
// The repository's existing async Git helper (`runGitCapture` in
// src/orchestra/git-workflow-service.ts) has no output cap, no typed
// spawn/signal/overflow outcomes and no custody; the canonical
// `killProcessGroupWithEscalation` keys its escalation on the direct child's
// exit — the wrong signal once descendants are involved — so this adapter
// uses the canonical `signalProcessGroup` primitive through the anchor.
// Test-injectable (`command`, `spawnImpl`, `platform`, `graceMs`) so custody
// is proven with REAL disposable process trees, not mocks.

import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process';
import { resolve as resolvePath } from 'node:path';
import { signalProcessGroup, SIGKILL_ESCALATION_MS } from '../../core/process-tree-termination.js';
import {
  createProcessGroupAnchor,
  probeProcessGroupEmpty,
  PROCESS_GROUP_ANCHOR_HANDSHAKE_MS,
  type ProcessGroupAnchor,
  type ProcessGroupAnchorTargetExit,
} from '../../core/process-group-anchor.js';

/** Deadline the former `spawnSync` sites used for change detection — unchanged. */
export const SYNC_GIT_TIMEOUT_MS = 10_000;
/** Deadline the former `spawnSync` sites used for the quick repo/date probes — unchanged. */
export const SYNC_GIT_PROBE_TIMEOUT_MS = 5_000;
/** Upper bound for captured stdout (and the hard cap for retained stderr). */
export const SYNC_GIT_MAX_OUTPUT_BYTES = 16 * 1024 * 1024;
/** After stream EOF on a forced call, how long the target's exit record (IPC) may still arrive before the final SIGKILL. */
export const SYNC_GIT_TARGET_EXIT_RECORD_GRACE_MS = 250;
/** Extra wait for stream closure after the SIGKILL escalation before the tree is reported unresolved. */
export const SYNC_GIT_TREE_OBSERVATION_GRACE_MS = 1_000;

export type SyncGitFailureKind =
  | 'spawn_error'
  | 'timeout'
  | 'output_overflow'
  | 'signal'
  | 'nonzero_exit'
  | 'child_tree_unresolved';

/** Custody evidence of one call — the three separate records plus the signals actually sent. */
export interface SyncGitCustodyRecord {
  readonly mode: 'posix-anchor' | 'win32-direct';
  readonly anchorPid: number | null;
  readonly pgid: number | null;
  readonly targetPid: number | null;
  readonly handshakeMs: number | null;
  /** The target's exit record from the anchor's IPC (null: never observed). */
  readonly targetExit: ProcessGroupAnchorTargetExit | null;
  readonly anchorExited: boolean | null;
  /** Result of the final signal-0 probe of the owned group. */
  readonly groupProbe: 'empty' | 'members' | 'unavailable';
  /** Group signals this adapter actually sent, in order (never to a group it did not own at that moment). */
  readonly signalsSent: readonly ('SIGTERM' | 'SIGKILL')[];
}

export interface SyncGitProcessSuccess {
  readonly ok: true;
  readonly stdout: string;
  /** Retained stderr (hard-capped at `maxOutputBytes`; see `stderrBytesDropped`). */
  readonly stderr: string;
  readonly stderrBytesDropped: number;
  readonly exitCode: 0;
  readonly durationMs: number;
  readonly pid: number | null;
  readonly custody?: SyncGitCustodyRecord;
}

export interface SyncGitProcessFailure {
  readonly ok: false;
  readonly kind: SyncGitFailureKind;
  /** `<kind>: <first stderr line | reason>` — the caller stores it verbatim as `issue.detail`. */
  readonly detail: string;
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly stdoutBytes: number;
  /** true when stdout was cut (overflow) — such output is never handed back. */
  readonly stdoutTruncated: boolean;
  /** The target's exit observed before this result settled (null: no target ever started). */
  readonly childExited: boolean | null;
  /** The target tree's stdio streams reached EOF (every holder released our pipes). */
  readonly streamsClosed: boolean;
  /**
   * Tree truth: true ONLY when the owned group answered ESRCH to a signal-0
   * probe (proven empty); false when the probe still found members; null when
   * the platform cannot probe a process group (win32) or no group was owned.
   */
  readonly treeTerminated: boolean | null;
  readonly durationMs: number;
  readonly pid: number | null;
  readonly custody?: SyncGitCustodyRecord;
}

export type SyncGitProcessResult = SyncGitProcessSuccess | SyncGitProcessFailure;

export interface SyncGitProcessOptions {
  readonly cwd: string;
  readonly args: readonly string[];
  /** Defaults to `SYNC_GIT_TIMEOUT_MS`. */
  readonly timeoutMs?: number;
  /** Defaults to `SYNC_GIT_MAX_OUTPUT_BYTES`. */
  readonly maxOutputBytes?: number;
  /** Test seam: the executable (default `git`). */
  readonly command?: string;
  /** Test seam: the spawn implementation (used for the anchor on POSIX, the target on win32). */
  readonly spawnImpl?: (command: string, args: readonly string[], options: SpawnOptions) => ChildProcess;
  /** Test seam: the platform the custody model targets (default `process.platform`). */
  readonly platform?: NodeJS.Platform;
  /** Test seam: SIGTERM→SIGKILL escalation grace (default `SIGKILL_ESCALATION_MS`). */
  readonly graceMs?: number;
}

/** A repository whose last Git call left a process tree this adapter could not prove terminated. */
export interface SyncGitUnresolvedTree {
  readonly cwd: string;
  readonly pgid: number | null;
  readonly at: string;
  readonly detail: string;
}

// ─── Chain stop registry (process-lifetime, per resolved repository path) ─────

const unresolvedTrees = new Map<string, SyncGitUnresolvedTree>();

/** The unresolved tree recorded for `cwd`, if any (read model for callers/tests). */
export function getSyncGitUnresolvedTree(cwd: string): SyncGitUnresolvedTree | null {
  return unresolvedTrees.get(resolvePath(cwd)) ?? null;
}

/** Forget every recorded unresolved tree (test/bootstrap seam; never called on a live command chain). */
export function resetSyncGitProcessChainState(): void {
  unresolvedTrees.clear();
}

function firstLine(text: string): string {
  return text.split('\n').find((line) => line.trim().length > 0)?.trim() ?? '';
}

type ForcedReason = 'timeout' | 'output_overflow';

/**
 * Run one Git command to completion (or to a typed failure) without blocking
 * the event loop. Resolves — never rejects — so a caller's control flow is the
 * discriminated `ok` union, exactly like the provenance contract it feeds.
 */
export function runSyncGitProcess(options: SyncGitProcessOptions): Promise<SyncGitProcessResult> {
  const platform = options.platform ?? process.platform;
  const command = options.command ?? 'git';
  const label = `${command} ${options.args[0] ?? ''}`.trim();
  const repositoryKey = resolvePath(options.cwd);

  const prior = unresolvedTrees.get(repositoryKey);
  if (prior) {
    return Promise.resolve<SyncGitProcessFailure>({
      ok: false,
      kind: 'child_tree_unresolved',
      detail: `child_tree_unresolved: refusing ${label} — an earlier Git call for this repository left an unresolved process tree (pgid ${prior.pgid ?? 'unknown'} at ${prior.at}: ${prior.detail})`,
      exitCode: null,
      signal: null,
      stdoutBytes: 0,
      stdoutTruncated: false,
      childExited: null,
      streamsClosed: false,
      treeTerminated: null,
      durationMs: 0,
      pid: null,
    });
  }
  return platform === 'win32'
    ? runDirectUnverified(options, platform, label, repositoryKey)
    : runAnchored(options, platform, label, repositoryKey);
}

// ─── Shared capture (stdout cap, stderr hard cap, EOF tracking) ───────────────

interface Capture {
  readonly stdoutChunks: Buffer[];
  readonly stderrChunks: Buffer[];
  stdoutBytes: number;
  stderrRetained: number;
  stderrDropped: number;
  stdoutEnded: boolean;
  stderrEnded: boolean;
  readonly streamsClosed: () => boolean;
}

function attachCapture(
  stdout: NodeJS.ReadableStream | null | undefined,
  stderr: NodeJS.ReadableStream | null | undefined,
  maxOutputBytes: number,
  onOverflow: () => void,
  onEnd: () => void,
  isForced: () => boolean,
): Capture {
  const c: Capture = {
    stdoutChunks: [], stderrChunks: [], stdoutBytes: 0, stderrRetained: 0, stderrDropped: 0,
    stdoutEnded: stdout ? false : true, stderrEnded: stderr ? false : true,
    streamsClosed: () => c.stdoutEnded && c.stderrEnded,
  };
  stdout?.on('data', (chunk: Buffer) => {
    if (isForced()) return;
    c.stdoutBytes += chunk.length;
    if (c.stdoutBytes > maxOutputBytes) { onOverflow(); return; }
    c.stdoutChunks.push(chunk);
  });
  stderr?.on('data', (chunk: Buffer) => {
    const room = maxOutputBytes - c.stderrRetained;
    if (room <= 0) { c.stderrDropped += chunk.length; return; }
    if (chunk.length > room) {
      c.stderrChunks.push(chunk.subarray(0, room));
      c.stderrRetained += room;
      c.stderrDropped += chunk.length - room;
      return;
    }
    c.stderrChunks.push(chunk);
    c.stderrRetained += chunk.length;
  });
  stdout?.on('end', () => { c.stdoutEnded = true; onEnd(); });
  stdout?.on('close', () => { c.stdoutEnded = true; onEnd(); });
  stderr?.on('end', () => { c.stderrEnded = true; onEnd(); });
  stderr?.on('close', () => { c.stderrEnded = true; onEnd(); });
  return c;
}

const forcedReasonText = (label: string, reason: ForcedReason, timeoutMs: number, maxOutputBytes: number): string =>
  reason === 'timeout' ? `${label} exceeded ${timeoutMs} ms` : `${label} stdout exceeded ${maxOutputBytes} bytes`;

// ─── POSIX: anchored custody ──────────────────────────────────────────────────

async function runAnchored(
  options: SyncGitProcessOptions,
  platform: NodeJS.Platform,
  label: string,
  repositoryKey: string,
): Promise<SyncGitProcessResult> {
  const command = options.command ?? 'git';
  const args = [...options.args];
  const timeoutMs = options.timeoutMs ?? SYNC_GIT_TIMEOUT_MS;
  const maxOutputBytes = options.maxOutputBytes ?? SYNC_GIT_MAX_OUTPUT_BYTES;
  const graceMs = options.graceMs ?? SIGKILL_ESCALATION_MS;
  const startedAt = Date.now();
  const deadlineAt = startedAt + timeoutMs;
  const signalsSent: ('SIGTERM' | 'SIGKILL')[] = [];

  // ONE lifetime deadline for the whole call: anchor handshake → spawn
  // admission → execution. Armed before anything is spawned; no phase owns an
  // unbounded wait and no IPC promise is awaited without it.
  type Phase = 'handshake' | 'admission' | 'execution';
  let phase: Phase = 'handshake';
  let forced: ForcedReason | null = null;
  let deadlineHitDuringHandshake = false;
  let finalizing = false;
  let anchor: ProcessGroupAnchor | null = null;
  let targetPid: number | null = null;
  let targetExit: ProcessGroupAnchorTargetExit | null = null;
  let anchorExitedEarly = false;
  let spawnFailure: { reason: string; message: string } | null = null;
  const timers: ReturnType<typeof setTimeout>[] = [];
  const later = (ms: number, fn: () => void): void => { const t = setTimeout(fn, ms); t.unref?.(); timers.push(t); };
  const clearTimers = (): void => { for (const t of timers) clearTimeout(t); };
  let resolveResult!: (value: SyncGitProcessResult) => void;
  const result = new Promise<SyncGitProcessResult>((r) => { resolveResult = r; });

  later(timeoutMs, () => {
    if (finalizing) return;
    if (anchor) terminate('timeout');
    else deadlineHitDuringHandshake = true;
  });

  const created = await createProcessGroupAnchor(options.cwd, {
    ...(options.spawnImpl ? { spawnImpl: options.spawnImpl } : {}),
    platform,
    handshakeTimeoutMs: Math.max(1, Math.min(PROCESS_GROUP_ANCHOR_HANDSHAKE_MS, deadlineAt - Date.now())),
  });
  if (!created.ok) {
    clearTimers();
    // Cleanup verification: the direct handle was SIGKILLed by the anchor
    // module; prove its group is empty before reporting a clean failure.
    const groupEmpty = created.anchorPid !== null ? probeProcessGroupEmpty(created.anchorPid, platform) : null;
    const probe: SyncGitCustodyRecord['groupProbe'] = groupEmpty === true ? 'empty' : groupEmpty === false ? 'members' : 'unavailable';
    const custodyRecord: SyncGitCustodyRecord = { mode: 'posix-anchor', anchorPid: created.anchorPid, pgid: created.anchorPid, targetPid: null, handshakeMs: null, targetExit: null, anchorExited: created.anchorExited, groupProbe: probe, signalsSent: [] };
    const base = { ok: false as const, exitCode: null, signal: null, stdoutBytes: 0, stdoutTruncated: false, childExited: null, streamsClosed: false, treeTerminated: groupEmpty, durationMs: Date.now() - startedAt, pid: null, custody: custodyRecord };
    if (created.anchorPid !== null && groupEmpty !== true) {
      const detail = `${label}: the process-group anchor failed during handshake (${created.reason}: ${created.message}) and its group could not be proven empty (pgid ${created.anchorPid})`;
      unresolvedTrees.set(repositoryKey, { cwd: repositoryKey, pgid: created.anchorPid, at: new Date().toISOString(), detail });
      return { ...base, kind: 'child_tree_unresolved', detail: `child_tree_unresolved: ${detail}` };
    }
    if (created.reason === 'handshake-timeout' || deadlineHitDuringHandshake) {
      return { ...base, kind: 'timeout', detail: `timeout: ${label} lifetime deadline ${timeoutMs} ms exceeded during the anchor handshake (${created.message})` };
    }
    return { ...base, kind: 'spawn_error', detail: `spawn_error: process-group anchor ${created.reason}: ${created.message}` };
  }
  anchor = created.anchor;
  phase = 'admission';
  const live = anchor;

  const custody = (probe: SyncGitCustodyRecord['groupProbe'], anchorExited: boolean | null): SyncGitCustodyRecord => ({
    mode: 'posix-anchor', anchorPid: live.anchorPid, pgid: live.pgid, targetPid, handshakeMs: live.handshakeMs,
    targetExit, anchorExited, groupProbe: probe, signalsSent: [...signalsSent],
  });

  const capture = attachCapture(
    live.stdout, live.stderr, maxOutputBytes,
    () => terminate('output_overflow'),
    () => { if (capture.streamsClosed()) maybeFinalize(); },
    () => forced !== null,
  );

  const failure = (
    kind: SyncGitFailureKind, detail: string, exitCode: number | null, signal: NodeJS.Signals | null,
    treeTerminated: boolean | null, probe: SyncGitCustodyRecord['groupProbe'], anchorExited: boolean | null,
  ): SyncGitProcessFailure => ({
    ok: false, kind, detail: `${kind}: ${detail}`, exitCode, signal,
    stdoutBytes: capture.stdoutBytes, stdoutTruncated: forced === 'output_overflow',
    childExited: targetPid === null ? null : targetExit !== null, streamsClosed: capture.streamsClosed(), treeTerminated,
    durationMs: Date.now() - startedAt, pid: targetPid, custody: custody(probe, anchorExited),
  });

  const signalGroup = (signal: 'SIGTERM' | 'SIGKILL'): void => {
    if (live.signalGroup(signal)) signalsSent.push(signal);
  };

  const phaseNote = (): string =>
    phase === 'admission'
      ? ' (phase admission: the anchor never acknowledged the target spawn)'
      : phase === 'handshake' ? ' (phase handshake)' : '';

  /**
   * Deadline/overflow: SIGTERM the owned group now; after `graceMs` SIGKILL
   * the TARGET through the anchor's own handle (so its exit record still
   * arrives), then the whole group; finalize bounded. Valid in every phase —
   * a suspended or silent anchor is contained exactly like a hung target.
   */
  const terminate = (reason: ForcedReason): void => {
    if (forced !== null || finalizing) return;
    forced = reason;
    signalGroup('SIGTERM');
    later(graceMs, () => {
      if (finalizing) return;
      live.killTarget('SIGKILL');
      later(SYNC_GIT_TARGET_EXIT_RECORD_GRACE_MS, () => { if (!finalizing) signalGroup('SIGKILL'); });
    });
    later(graceMs + SYNC_GIT_TARGET_EXIT_RECORD_GRACE_MS + SYNC_GIT_TREE_OBSERVATION_GRACE_MS, () => finalize());
    if (capture.streamsClosed()) maybeFinalize();
  };

  /**
   * Normal completion needs BOTH the target's exit record and stream EOF. A
   * forced call finalizes on EOF too, but gives the target's exit record (IPC)
   * a short bounded chance to arrive first — the final SIGKILL would otherwise
   * race the anchor's own 'exit' bookkeeping of a target that already died.
   */
  let eofGraceScheduled = false;
  const maybeFinalize = (): void => {
    if (finalizing) return;
    if (!capture.streamsClosed()) return;
    if (targetExit !== null) { finalize(); return; }
    if ((forced !== null || spawnFailure !== null || anchorExitedEarly) && !eofGraceScheduled) {
      eofGraceScheduled = true;
      later(SYNC_GIT_TARGET_EXIT_RECORD_GRACE_MS, () => finalize());
    }
  };

  const finalize = async (): Promise<void> => {
    if (finalizing) return;
    finalizing = true;
    clearTimers();
    // Always end by SIGKILLing the owned group (authority-gated) and proving emptiness.
    const term = await live.terminateGroup(SYNC_GIT_TREE_OBSERVATION_GRACE_MS);
    if (term.signalled) signalsSent.push('SIGKILL');
    const probe: SyncGitCustodyRecord['groupProbe'] = term.groupEmpty === true ? 'empty' : term.groupEmpty === false ? 'members' : 'unavailable';
    const treeTerminated = term.groupEmpty;
    const streamsClosed = capture.streamsClosed();
    const stderr = Buffer.concat(capture.stderrChunks).toString('utf-8');

    const unresolved = (why: string): void => {
      const detail = `${why} (pgid ${live.pgid}, target ${targetPid ?? 'not started'}, target exit ${targetExit ? `${targetExit.code ?? 'null'}/${targetExit.signal ?? 'null'}` : 'unobserved'}, anchor ${term.anchorExited ? 'exited' : 'still running'})`;
      live.stdout.removeAllListeners('data'); live.stderr.removeAllListeners('data');
      live.stdout.destroy(); live.stderr.destroy();
      unresolvedTrees.set(repositoryKey, { cwd: repositoryKey, pgid: live.pgid, at: new Date().toISOString(), detail });
      resolveResult(failure('child_tree_unresolved', detail, targetExit?.code ?? null, targetExit?.signal ?? null, treeTerminated, probe, term.anchorExited));
    };

    if (forced !== null) {
      const reason = `${forcedReasonText(label, forced, timeoutMs, maxOutputBytes)}${phaseNote()}`;
      if (streamsClosed && treeTerminated === true) {
        resolveResult(failure(forced, reason, targetExit?.code ?? null, targetExit?.signal ?? null, true, probe, term.anchorExited));
        return;
      }
      if (!streamsClosed && treeTerminated === true) { unresolved(`${reason}; the owned group is empty but our stdio streams are still held by a process outside it (an escaped session this adapter has no authority over)`); return; }
      if (!streamsClosed) { unresolved(`${reason}; descendants still hold the stdio streams and the owned group is not empty after SIGKILL`); return; }
      unresolved(`${reason}; the stdio streams closed but the owned group still has members after SIGKILL`);
      return;
    }
    if (spawnFailure !== null) {
      if (treeTerminated !== true) { unresolved(`${label}: the target could not be started (${spawnFailure.reason}: ${spawnFailure.message}) and the owned group could not be proven empty`); return; }
      resolveResult(failure('spawn_error', spawnFailure.reason === 'spawn-error' ? spawnFailure.message : `process-group anchor ${spawnFailure.reason}: ${spawnFailure.message}`, null, null, true, probe, term.anchorExited));
      return;
    }
    if (anchorExitedEarly && targetExit === null) {
      unresolved('the process-group anchor exited before the target reported its exit; authority over the tree was lost, nothing further was signalled');
      return;
    }
    // Normal completion: judged by the target's own exit record, only on a proven-empty group.
    if (treeTerminated !== true) {
      unresolved(`${label} completed but the owned group ${treeTerminated === false ? 'still has members after SIGKILL' : 'could not be probed'}`);
      return;
    }
    if (targetExit === null) { unresolved(`${label}: streams closed and group empty but the target's exit was never reported`); return; }
    if (targetExit.signal) {
      resolveResult(failure('signal', `${label} terminated by ${targetExit.signal}`, targetExit.code, targetExit.signal, true, probe, term.anchorExited));
      return;
    }
    if (targetExit.code !== 0) {
      resolveResult(failure('nonzero_exit', firstLine(stderr) || `exit ${targetExit.code ?? 'unknown'}`, targetExit.code, null, true, probe, term.anchorExited));
      return;
    }
    resolveResult({
      ok: true,
      stdout: Buffer.concat(capture.stdoutChunks).toString('utf-8'),
      stderr,
      stderrBytesDropped: capture.stderrDropped,
      exitCode: 0,
      durationMs: Date.now() - startedAt,
      pid: targetPid,
      custody: custody(probe, term.anchorExited),
    });
  };

  // Records arrive independently: target exit (IPC) and anchor exit (handle).
  void live.targetExit.then((exit) => { targetExit = exit; maybeFinalize(); });
  void live.anchorExit.then(() => {
    if (finalizing) return;
    anchorExitedEarly = true;
    // Authority is gone (or the final SIGKILL landed): give the streams a
    // bounded chance to EOF, then report honestly — never wait unbounded.
    later(SYNC_GIT_TREE_OBSERVATION_GRACE_MS, () => finalize());
    if (capture.streamsClosed()) maybeFinalize();
  });

  // Admission is NOT awaited serially: the lifetime deadline stays armed and
  // a silent/suspended anchor is contained by the same forced path.
  void live.spawnTarget({ command, args, cwd: options.cwd }).then((spawned) => {
    if (finalizing) return;
    if (spawned.ok) { targetPid = spawned.pid; phase = 'execution'; return; }
    if (forced !== null) return; // the forced path already owns cleanup and the original reason
    spawnFailure = { reason: spawned.reason, message: spawned.message };
    finalize();
  });
  if (deadlineHitDuringHandshake) terminate('timeout');
  return result;
}

// ─── win32: direct spawn, unverifiable tree → safe-stop ──────────────────────

function runDirectUnverified(
  options: SyncGitProcessOptions,
  platform: NodeJS.Platform,
  label: string,
  repositoryKey: string,
): Promise<SyncGitProcessResult> {
  const command = options.command ?? 'git';
  const args = [...options.args];
  const timeoutMs = options.timeoutMs ?? SYNC_GIT_TIMEOUT_MS;
  const maxOutputBytes = options.maxOutputBytes ?? SYNC_GIT_MAX_OUTPUT_BYTES;
  const graceMs = options.graceMs ?? SIGKILL_ESCALATION_MS;
  const spawnImpl = options.spawnImpl ?? spawn;
  const startedAt = Date.now();
  const signalsSent: ('SIGTERM' | 'SIGKILL')[] = [];

  return new Promise<SyncGitProcessResult>((resolve) => {
    let child: ChildProcess;
    try {
      child = spawnImpl(command, args, { cwd: options.cwd, stdio: ['ignore', 'pipe', 'pipe'], shell: false, windowsHide: true });
    } catch (error) {
      resolve({
        ok: false, kind: 'spawn_error', detail: `spawn_error: ${error instanceof Error ? error.message : String(error)}`,
        exitCode: null, signal: null, stdoutBytes: 0, stdoutTruncated: false, childExited: null, streamsClosed: false, treeTerminated: null,
        durationMs: Date.now() - startedAt, pid: null,
        custody: { mode: 'win32-direct', anchorPid: null, pgid: null, targetPid: null, handshakeMs: null, targetExit: null, anchorExited: null, groupProbe: 'unavailable', signalsSent: [] },
      });
      return;
    }
    let settled = false;
    let forced: ForcedReason | null = null;
    let exited = false;
    let exitRecord: ProcessGroupAnchorTargetExit | null = null;
    let spawnError: Error | null = null;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const later = (ms: number, fn: () => void): void => { const t = setTimeout(fn, ms); t.unref?.(); timers.push(t); };
    const finish = (value: SyncGitProcessResult): void => { if (settled) return; settled = true; for (const t of timers) clearTimeout(t); resolve(value); };
    const custody = (): SyncGitCustodyRecord => ({ mode: 'win32-direct', anchorPid: null, pgid: null, targetPid: child.pid ?? null, handshakeMs: null, targetExit: exitRecord, anchorExited: null, groupProbe: 'unavailable', signalsSent: [...signalsSent] });
    const capture = attachCapture(child.stdout, child.stderr, maxOutputBytes, () => terminate('output_overflow'), () => {}, () => forced !== null);
    const failure = (kind: SyncGitFailureKind, detail: string): SyncGitProcessFailure => ({
      ok: false, kind, detail: `${kind}: ${detail}`, exitCode: exitRecord?.code ?? null, signal: exitRecord?.signal ?? null,
      stdoutBytes: capture.stdoutBytes, stdoutTruncated: forced === 'output_overflow', childExited: exited,
      streamsClosed: capture.streamsClosed(), treeTerminated: null, durationMs: Date.now() - startedAt, pid: child.pid ?? null, custody: custody(),
    });
    const alive = (): boolean => !exited && child.exitCode === null && (child.signalCode === null || child.signalCode === undefined);
    const unresolved = (why: string): void => {
      const detail = `${why} (win32: process-tree custody unverifiable on this platform; target ${child.pid ?? 'unknown'})`;
      child.stdout?.destroy(); child.stderr?.destroy(); child.unref();
      unresolvedTrees.set(repositoryKey, { cwd: repositoryKey, pgid: null, at: new Date().toISOString(), detail });
      finish(failure('child_tree_unresolved', detail));
    };
    const terminate = (reason: ForcedReason): void => {
      if (forced !== null || settled) return;
      forced = reason;
      if (alive()) { signalProcessGroup(child, 'SIGTERM', platform); signalsSent.push('SIGTERM'); }
      later(graceMs, () => { if (!settled && alive()) { signalProcessGroup(child, 'SIGKILL', platform); signalsSent.push('SIGKILL'); } });
      later(graceMs + SYNC_GIT_TREE_OBSERVATION_GRACE_MS, () => unresolved(forcedReasonText(label, reason, timeoutMs, maxOutputBytes)));
    };
    later(timeoutMs, () => terminate('timeout'));
    child.on('error', (error: Error) => {
      spawnError = error;
      if (typeof child.pid !== 'number') { exited = true; finish(failure('spawn_error', error.message)); }
    });
    child.on('exit', (code, signal) => { exited = true; exitRecord = { code, signal }; });
    child.on('close', (code, signal) => {
      exited = true;
      exitRecord = exitRecord ?? { code, signal };
      const stderr = Buffer.concat(capture.stderrChunks).toString('utf-8');
      if (spawnError) { finish(failure('spawn_error', spawnError.message)); return; }
      // Any forced termination on win32 is a safe-stop: the tree cannot be verified here.
      if (forced !== null) { unresolved(forcedReasonText(label, forced, timeoutMs, maxOutputBytes)); return; }
      if (signal) { finish(failure('signal', `${label} terminated by ${signal}`)); return; }
      if (code !== 0) { finish(failure('nonzero_exit', firstLine(stderr) || `exit ${code ?? 'unknown'}`)); return; }
      finish({
        ok: true, stdout: Buffer.concat(capture.stdoutChunks).toString('utf-8'), stderr,
        stderrBytesDropped: capture.stderrDropped, exitCode: 0, durationMs: Date.now() - startedAt, pid: child.pid ?? null, custody: custody(),
      });
    });
  });
}
