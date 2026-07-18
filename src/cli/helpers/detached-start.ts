// ═══ detached-start — fire-and-forget CLI spawn for long-running REPL commands ═══
//
// chat-tool-bridge.ts's default dispatch path spawns `dist/cli/entry.js <args>`
// and `await`s its stdout until the child closes — fine for a fast read
// (status/history) but a sprint (`start`), a one-shot worker (`run`), or a
// process-mode submit (`process submit`) runs for minutes and would freeze the
// whole REPL turn while it waits. spawnDetachedDeckent spawns the SAME entry
// point as a fully detached child instead: own process group (separate PGID,
// mirrors the detached-worker pattern in providers/subprocess.ts), unref'd so
// the parent never waits on it, stdout+stderr redirected straight to a log
// file under `.deckent/recently-works/`. Returns immediately with the child's
// pid and the log path — never awaits completion.
//
// fd-based stdio (not 'pipe' + `.on('data')`) is deliberate: a piped stream
// keeps the event loop alive even after `child.unref()` unless the stream
// itself is separately unref'd. Passing an open file descriptor directly
// avoids that dance entirely and is the standard detached-daemon-with-logging
// pattern (gateway.ts / bot-daemon.ts use the simpler stdio:'ignore' case;
// this extends it with log capture).
//
// Pure mechanism — zero user-facing strings. The caller (chat-tool-bridge.ts)
// builds any display text from the returned { pid, logPath }.

import { spawn } from 'node:child_process';
import { openSync, closeSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { RECENT_WORKS_DIR } from '../../core/constants.js';
import { LIVE_TRACE_ENV } from '../../core/config.js';

// ─── Types ──────────────────────────────────────────────────────────────────

/** Minimal shape spawnDetachedDeckent needs back from a spawn call. */
export interface DetachedChildHandle {
  pid?: number;
  unref(): void;
}

/** The exact option shape passed to the (possibly injected) spawn primitive. */
export interface DetachedSpawnOptions {
  detached: true;
  stdio: ['ignore', number, number];
  cwd: string;
  env: NodeJS.ProcessEnv;
  windowsHide: true;
}

/** Injectable spawn primitive — tests supply a fake to stay hermetic (no real subprocess). */
export type DetachedSpawnFn = (
  command: string,
  args: readonly string[],
  options: DetachedSpawnOptions,
) => DetachedChildHandle;

export interface SpawnDetachedOptions {
  /** Project root — resolves `.deckent/recently-works/` and the child's cwd. Defaults to process.cwd(). */
  projectRoot?: string;
  /** Inject a fake spawn for hermetic tests; omit for the real node:child_process spawn. */
  spawnFn?: DetachedSpawnFn;
  /**
   * TERM-FLOW-UNIFY Sprint-4 (426-001): durable job-correlation id for this
   * detached spawn (design-doc risk: "detached spawn cevabı yalnız child'ın
   * doğduğunu gösterir... watcher... detached handle sprint/flow correlation
   * taşımaz; multi-session/multi-tenant yanlış-eşleşme mümkündür" — a bare
   * pid is not a safe correlator across sessions). Optional/additive — when
   * omitted (every caller today), behavior and the log filename are
   * unchanged.
   */
  flowId?: string;
  /**
   * 583/N5 TRACE-FLIP: mark this spawn interactive-origin — the child env gets
   * `DECKENT_LIVE_TRACE=1`, so the coordinator (and every worker it spawns)
   * resolves `live_trace.enabled` ON via resolveLiveTraceEnabled (config.ts)
   * WITHOUT a global config flip. Set by the human decision surfaces (REPL
   * card `s` / `deckent runs --start` / desktop-API start via
   * buildFlowStartSpawn, the REPL /run flow, REPL chat dispatch); deliberately
   * NOT set by programmatic callers (SDK client, MCP start tool) so
   * headless/automation runs keep the zero-cost no-op tap.
   */
  liveTrace?: boolean;
}

export interface DetachedSpawnResult {
  /** PID of the spawned child, or null if the platform did not report one. */
  pid: number | null;
  /** Absolute path to the log file the child's stdout+stderr are redirected to. */
  logPath: string;
  /** The `flowId` this spawn was correlated to via `SpawnDetachedOptions.flowId`,
   *  or `null` when the caller did not supply one. */
  flowId: string | null;
}

// ─── Entry resolution ────────────────────────────────────────────────────────

function resolveEntryPath(): string {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  // dist/cli/helpers/ → ../entry.js → dist/cli/entry.js
  return join(__dirname, '..', 'entry.js');
}

function defaultSpawnFn(
  command: string,
  args: readonly string[],
  options: DetachedSpawnOptions,
): DetachedChildHandle {
  return spawn(command, [...args], options);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Spawn `dist/cli/entry.js <argv>` as a detached background process — own
 * process group (`detached: true` → separate PGID on POSIX) + `windowsHide`
 * (no visible console window on native Windows), unref'd so the parent can
 * exit independently, stdout+stderr redirected to
 * `.deckent/recently-works/<argv[0]>-<timestamp>.log`. Returns immediately
 * with the child's pid and the log path; never awaits completion.
 */
export function spawnDetachedDeckent(
  argv: readonly string[],
  opts: SpawnDetachedOptions = {},
): DetachedSpawnResult {
  const projectRoot = opts.projectRoot ?? process.cwd();
  const recentWorksDir = join(projectRoot, RECENT_WORKS_DIR);
  mkdirSync(recentWorksDir, { recursive: true });

  const cmdLabel = (argv[0] ?? 'cmd').replace(/[^a-zA-Z0-9_-]/g, '_');
  // flowId (when supplied) is folded into the log filename so a durable job
  // is findable by its correlator, not just by pid — see SpawnDetachedOptions.flowId.
  const flowIdSegment = opts.flowId ? `${opts.flowId.replace(/[^a-zA-Z0-9_-]/g, '_')}-` : '';
  const logPath = join(recentWorksDir, `${cmdLabel}-${flowIdSegment}${Date.now()}.log`);
  const logFd = openSync(logPath, 'a');

  const spawnFn = opts.spawnFn ?? defaultSpawnFn;
  let child: DetachedChildHandle;
  try {
    child = spawnFn(process.execPath, [resolveEntryPath(), ...argv], {
      detached: true,
      stdio: ['ignore', logFd, logFd],
      cwd: projectRoot,
      // 583/N5: interactive-origin spawns export the live-trace env twin to
      // the child tree (see SpawnDetachedOptions.liveTrace).
      env: opts.liveTrace === true
        ? { ...process.env, [LIVE_TRACE_ENV]: '1' }
        : { ...process.env },
      windowsHide: true,
    });
  } finally {
    // The child received its own reference to the file at spawn time (the OS
    // dups the fd into the child's table) — the parent's copy must be closed
    // here or it leaks for the lifetime of this process.
    closeSync(logFd);
  }
  child.unref();

  return { pid: child.pid ?? null, logPath, flowId: opts.flowId ?? null };
}

/**
 * The ONE authoring point for the detached flow-start argv shape
 * (`start --flow-id <id> --revision <r> --plan-digest <d>`) — both surfaces
 * that start an approved flow (the API's start route and the CLI's
 * `deckent runs <n> --start`) build their `spawnStart` closure here, so the
 * argv contract cannot drift between them. Returns the closure
 * orchestra/run-flow-decision-service.ts's startRunFlow() consumes.
 *
 * 583/N5: flow-start IS the human seal (an approved run being launched from a
 * decision surface — REPL card `s`, `deckent runs --start`, desktop/API
 * start), so every spawn built here is interactive-origin by construction and
 * carries `liveTrace: true` — the run streams live worker activity.
 * `spawnFn` is the hermetic test seam (same idiom as SpawnDetachedOptions).
 */
export function buildFlowStartSpawn(
  projectRoot: string,
  revision: number,
  planDigest: string,
  spawnFn?: DetachedSpawnFn,
): (sprint: unknown, flowId: string) => { flowId: string; jobId: string; logRef: string } {
  return (_sprint, flowId) => {
    const spawned = spawnDetachedDeckent(
      ['start', '--flow-id', flowId, '--revision', String(revision), '--plan-digest', planDigest],
      { projectRoot, flowId, liveTrace: true, ...(spawnFn ? { spawnFn } : {}) },
    );
    return { flowId, jobId: `flow-${flowId}-r${revision}`, logRef: spawned.logPath };
  };
}
