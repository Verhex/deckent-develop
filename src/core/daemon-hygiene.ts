// ─── Stale-Daemon Hygiene (B-ZOMBIE, Sprint 331) ────────────────────────────
//
// Detection-only: surface long-lived, deckent-owned daemon processes — a stale
// `dist/mcp/server.js`, or old `bot`/`serve`/`watch` daemons left over from a
// prior build — that linger after a rebuild and emit spurious approvals. Today a
// human hand-supplies the PIDs to kill; this closes that gap honestly: deckent
// DETECTS and SURFACES the candidates, and NEVER auto-kills anything.
//
// Two halves:
//   1. detectStaleDaemons(snapshot, opts) — PURE. Given a process snapshot, flag
//      the deckent-owned daemons older than a threshold. Fully hermetic (no spawn,
//      no clock) so it is trivially testable with a fabricated snapshot.
//   2. listDeckentProcesses(opts) — THIN cross-platform adapter behind an
//      injectable spawn seam: unix `ps`-style / windows `powershell`-style, via
//      async spawn. An unsupported platform returns an honest empty list with
//      `supported:false` (Yasa #2 — never silently pretend "no daemons").
//
// ADR-008: core/ stays free of cli/orchestra imports. This module is
// STRING-FREE (no i18n / no user-facing text) — the doctor presentation layer
// owns the en/tr rendering and injects it; here we only return structured data.

import { spawn as nodeSpawn } from 'node:child_process';
import type { SpawnOptionsWithoutStdio } from 'node:child_process';

/** A single process from the host snapshot (the minimum the detector needs). */
export interface ProcessInfo {
  /** OS process id. */
  pid: number;
  /** Full command line / argv string as reported by the platform tool. */
  command: string;
  /** Elapsed wall-clock seconds since the process started (0 when unknown). */
  elapsedSec: number;
}

/** The kinds of deckent daemon a stale process can be. */
export type DaemonKind = 'mcp-server' | 'bot' | 'serve' | 'watch';

/** A deckent-owned daemon that looks orphaned (long-lived) — a kill candidate. */
export interface StaleDaemon {
  pid: number;
  kind: DaemonKind;
  command: string;
  elapsedSec: number;
  /** The marker that classified this process (for transparent reporting). */
  reason: string;
}

export interface DetectStaleDaemonsOptions {
  /**
   * Minimum elapsed seconds for a daemon to count as "long-lived"/orphaned.
   * Defaults to {@link DEFAULT_MIN_AGE_SEC}. Younger daemons are ignored — a
   * freshly-spawned daemon is almost certainly the live one, not a zombie.
   */
  minAgeSec?: number;
  /**
   * Substrings that mark a process as deckent-owned. Defaults to
   * {@link DEFAULT_OWNER_MARKERS}. Matching is backslash-normalized so Windows
   * paths (`dist\mcp\server.js`) match the same markers as POSIX paths.
   */
  ownerMarkers?: string[];
}

/** Result of the cross-platform process lister — carries an honest support flag. */
export interface ProcessListResult {
  processes: ProcessInfo[];
  /** False ONLY when the current platform has no lister (honest empty, not silent). */
  supported: boolean;
  /** The platform the lister ran on (e.g. 'linux', 'darwin', 'win32'). */
  platform: string;
  /** Set when listing failed (unsupported platform, or the spawn/tool errored). */
  error?: string;
}

/** Minimal spawned-child shape used by the lister — mockable in tests. */
export interface SpawnedProcessLike {
  stdout: NodeJS.ReadableStream | null;
  stderr: NodeJS.ReadableStream | null;
  on(event: 'close', listener: (code: number | null, signal: NodeJS.Signals | null) => void): this;
  on(event: 'error', listener: (error: Error) => void): this;
  kill(signal?: NodeJS.Signals | number): boolean;
}

/** Injectable async spawn (defaults to node:child_process spawn). */
export type SpawnImpl = (
  command: string,
  args: string[],
  options: SpawnOptionsWithoutStdio,
) => SpawnedProcessLike;

export interface ListProcessesOptions {
  /** Platform override (defaults to process.platform) — lets tests pick a lister path. */
  platform?: NodeJS.Platform;
  /** Injectable spawn for hermetic tests (defaults to node:child_process spawn). */
  spawnImpl?: SpawnImpl;
  /** Hard cap so `deckent doctor` never stalls on a hung `ps`/`powershell`. */
  timeoutMs?: number;
}

/** Default "long-lived" threshold: 1 hour. A real zombie from a prior build is old. */
export const DEFAULT_MIN_AGE_SEC = 3600;

/** Default timeout for the process-listing spawn. */
export const DEFAULT_LIST_TIMEOUT_MS = 5_000;

/**
 * Substrings that identify a deckent-owned process. The MCP server and the CLI
 * entry are the two real daemon entrypoints; `deckent` also catches a globally
 * installed binary invocation (`deckent bot`, …).
 */
export const DEFAULT_OWNER_MARKERS: readonly string[] = [
  'dist/mcp/server.js',
  'dist/cli/entry.js',
  'deckent',
];

/** Normalize backslashes so Windows argv paths match the POSIX markers/patterns. */
function normalizeCommand(command: string): string {
  return command.replace(/\\/g, '/');
}

/** True when the command line looks like a deckent-owned process. */
function isDeckentOwned(normCommand: string, markers: readonly string[]): boolean {
  return markers.some((m) => normCommand.includes(m));
}

/**
 * Classify a (normalized) command line into a daemon kind, or null if it is not
 * one of the four daemons. Order matters: the MCP server is matched by its
 * script path first (most specific); bot/serve/watch are matched as standalone
 * subcommand words so an unrelated substring (e.g. "observe") never trips.
 */
function classifyDaemon(normCommand: string): { kind: DaemonKind; reason: string } | null {
  if (normCommand.includes('mcp/server.js')) {
    return { kind: 'mcp-server', reason: 'mcp/server.js' };
  }
  if (/(^|\s)bot(\s|$)/.test(normCommand)) return { kind: 'bot', reason: 'bot' };
  if (/(^|\s)serve(\s|$)/.test(normCommand)) return { kind: 'serve', reason: 'serve' };
  if (/(^|\s)watch(\s|$)/.test(normCommand)) return { kind: 'watch', reason: 'watch' };
  return null;
}

/**
 * PURE detector. Given a process snapshot, flag the deckent-owned daemons that
 * are long-lived enough to look orphaned. Never spawns, never reads the clock —
 * everything it needs is in the snapshot, which makes it fully hermetic.
 */
export function detectStaleDaemons(
  snapshot: ProcessInfo[],
  opts: DetectStaleDaemonsOptions = {},
): StaleDaemon[] {
  const minAgeSec = opts.minAgeSec ?? DEFAULT_MIN_AGE_SEC;
  const markers = opts.ownerMarkers ?? DEFAULT_OWNER_MARKERS;
  const stale: StaleDaemon[] = [];

  for (const proc of snapshot) {
    const normCommand = normalizeCommand(proc.command);
    if (!isDeckentOwned(normCommand, markers)) continue;
    const classified = classifyDaemon(normCommand);
    if (classified === null) continue;
    if (proc.elapsedSec < minAgeSec) continue;
    stale.push({
      pid: proc.pid,
      kind: classified.kind,
      command: proc.command,
      elapsedSec: proc.elapsedSec,
      reason: classified.reason,
    });
  }

  return stale;
}

/**
 * Parse a unix `ps` etime value into elapsed seconds. Handles every documented
 * format: `SS`, `MM:SS`, `HH:MM:SS`, and `DD-HH:MM:SS`. Unparseable → 0.
 */
export function parseEtimeToSeconds(etime: string): number {
  const trimmed = etime.trim();
  if (trimmed.length === 0) return 0;

  let days = 0;
  let rest = trimmed;
  const dashIdx = rest.indexOf('-');
  if (dashIdx >= 0) {
    days = Number.parseInt(rest.slice(0, dashIdx), 10) || 0;
    rest = rest.slice(dashIdx + 1);
  }

  const parts = rest.split(':').map((p) => Number.parseInt(p, 10) || 0);
  let hours = 0;
  let minutes = 0;
  let seconds = 0;
  if (parts.length === 3) {
    [hours, minutes, seconds] = parts as [number, number, number];
  } else if (parts.length === 2) {
    [minutes, seconds] = parts as [number, number];
  } else if (parts.length === 1) {
    [seconds] = parts as [number];
  }

  return days * 86_400 + hours * 3_600 + minutes * 60 + seconds;
}

/**
 * Parse `ps -axww -o pid=,etime=,command=` output. Each line is
 * `<pid> <etime> <command...>`; blank/garbage lines are skipped.
 */
export function parseUnixPsOutput(stdout: string): ProcessInfo[] {
  const processes: ProcessInfo[] = [];
  for (const raw of stdout.split('\n')) {
    const line = raw.trim();
    if (line.length === 0) continue;
    const match = line.match(/^(\d+)\s+(\S+)\s+(.+)$/);
    if (match === null) continue;
    const pid = Number.parseInt(match[1] ?? '', 10);
    if (Number.isNaN(pid)) continue;
    processes.push({
      pid,
      elapsedSec: parseEtimeToSeconds(match[2] ?? ''),
      command: (match[3] ?? '').trim(),
    });
  }
  return processes;
}

/**
 * Parse the windows powershell lister output. Each line is
 * `<pid>|<elapsedSec>|<command>` (we compute elapsed in PowerShell to avoid the
 * brittle WMI datetime format). Blank/garbage lines are skipped.
 */
export function parseWindowsPsOutput(stdout: string): ProcessInfo[] {
  const processes: ProcessInfo[] = [];
  for (const raw of stdout.split('\n')) {
    const line = raw.trim();
    if (line.length === 0) continue;
    const firstPipe = line.indexOf('|');
    const secondPipe = line.indexOf('|', firstPipe + 1);
    if (firstPipe < 0 || secondPipe < 0) continue;
    const pid = Number.parseInt(line.slice(0, firstPipe).trim(), 10);
    if (Number.isNaN(pid)) continue;
    const elapsedSec = Number.parseInt(line.slice(firstPipe + 1, secondPipe).trim(), 10);
    const command = line.slice(secondPipe + 1).trim();
    if (command.length === 0) continue;
    processes.push({ pid, elapsedSec: Number.isNaN(elapsedSec) ? 0 : elapsedSec, command });
  }
  return processes;
}

function collectStream(stream: NodeJS.ReadableStream | null): Promise<string> {
  if (stream === null) return Promise.resolve('');
  const chunks: Buffer[] = [];
  return new Promise((resolve, reject) => {
    stream.on('data', (chunk: string | Buffer) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });
}

interface CommandRunResult {
  /** Process exit code, or -1 when the spawn itself errored / timed out. */
  code: number;
  stdout: string;
  stderr: string;
  /** Set when the spawn errored or the timeout fired. */
  error?: string;
}

/** Run a command via the (injectable) async spawn, with a hard timeout. */
function runCommand(
  spawnImpl: SpawnImpl,
  command: string,
  args: string[],
  timeoutMs: number,
): Promise<CommandRunResult> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: CommandRunResult): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    let child: SpawnedProcessLike;
    try {
      child = spawnImpl(command, args, { shell: false });
    } catch {
      resolve({ code: -1, stdout: '', stderr: '', error: `${command} spawn threw` });
      return;
    }

    const timer = setTimeout(() => {
      try {
        child.kill('SIGKILL');
      } catch {
        /* best-effort */
      }
      finish({ code: -1, stdout: '', stderr: '', error: `${command} timed out after ${timeoutMs}ms` });
    }, timeoutMs);
    if (typeof (timer as { unref?: () => void }).unref === 'function') {
      (timer as { unref: () => void }).unref();
    }

    const stdoutP = collectStream(child.stdout);
    const stderrP = collectStream(child.stderr);

    child.on('error', () => finish({ code: -1, stdout: '', stderr: '', error: `${command} spawn failed` }));
    child.on('close', (code) => {
      void Promise.all([stdoutP, stderrP]).then(([stdout, stderr]) => {
        finish({ code: code ?? -1, stdout, stderr });
      });
    });
  });
}

/** Windows lister: compute elapsed seconds in PowerShell, emit `pid|sec|cmd`. */
const WINDOWS_LIST_SCRIPT =
  "Get-CimInstance Win32_Process | ForEach-Object { " +
  "'{0}|{1}|{2}' -f $_.ProcessId, " +
  '[int]((Get-Date) - $_.CreationDate).TotalSeconds, ' +
  "($_.CommandLine -replace '[\\r\\n]+',' ') }";

/**
 * THIN cross-platform process lister. Returns the host process snapshot the
 * detector consumes. The platform + spawn are injectable so the whole thing is
 * hermetically testable. An unsupported platform yields an honest empty result
 * with `supported:false` (never a silent empty list).
 */
export async function listDeckentProcesses(opts: ListProcessesOptions = {}): Promise<ProcessListResult> {
  const plat = opts.platform ?? process.platform;
  const spawnImpl: SpawnImpl = opts.spawnImpl ?? ((c, a, o) => nodeSpawn(c, a, o));
  const timeoutMs = opts.timeoutMs ?? DEFAULT_LIST_TIMEOUT_MS;

  if (plat === 'linux' || plat === 'darwin') {
    const run = await runCommand(spawnImpl, 'ps', ['-axww', '-o', 'pid=,etime=,command='], timeoutMs);
    if (run.code !== 0) {
      return { processes: [], supported: true, platform: plat, error: run.error ?? 'ps failed' };
    }
    return { processes: parseUnixPsOutput(run.stdout), supported: true, platform: plat };
  }

  if (plat === 'win32') {
    const run = await runCommand(spawnImpl, 'powershell', ['-NoProfile', '-Command', WINDOWS_LIST_SCRIPT], timeoutMs);
    if (run.code !== 0) {
      return { processes: [], supported: true, platform: plat, error: run.error ?? 'powershell failed' };
    }
    return { processes: parseWindowsPsOutput(run.stdout), supported: true, platform: plat };
  }

  // Unsupported platform (Yasa #2): fail honestly, never silently pretend empty.
  return { processes: [], supported: false, platform: plat, error: `unsupported platform: ${plat}` };
}
