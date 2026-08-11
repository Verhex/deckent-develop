#!/usr/bin/env node
// ═══ Sprint Runner Entry — Detached Child Process ═════════════════
// Sprint 143: MCP Disconnect Fix
// This module runs as a detached child process, freeing the MCP
// server's stdio transport from long-running sprint operations.
//
// Usage: node sprint-runner-entry.js <ipc-dir>
// The IPC directory must contain config.json with sprint parameters.

import { readFileSync, writeFileSync, existsSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { redactSensitive } from './sensitive-redactor.js';
import { clearPid, isProcessAlive, listPidFiles, readPidRecord } from './sprint-pid-manager.js';
import { DECKENT_DIR } from '../core/constants.js';
import { processStartToken, verifyPidOwnership } from '../core/pid-ownership.js';
import { bootstrapNotifyDispatcher, resolveWebhookBootstrapOption } from '../core/notify-bootstrap.js';
import type { ApprovalAuthorityBootstrapResult } from '../core/approval-authority-bootstrap.js';

// ─── IPC File Names ──────────────────────────────────────────────
export const IPC_CONFIG_FILE = 'config.json';
export const IPC_STATUS_FILE = 'status.json';
export const IPC_RESULT_FILE = 'result.json';
export const IPC_ERROR_FILE = 'error.json';

// ─── Crash Handler Types (ADR-043) ──────────────────────────────

export interface CrashContext {
  ipcDir: string;
  jobId: string;
  /**
   * Sprint 512 (row 3311): project root, so a dying runner can publish a typed
   * exit record and release the PID file it owns. Optional — a caller that only
   * wants the legacy IPC-scoped handlers (pre-512 behaviour) may omit it.
   */
  projectRoot?: string;
}

// ─── IPC Types ───────────────────────────────────────────────────

export interface SprintRunnerConfig {
  projectRoot: string;
  jobId: string;
  autoApprove: boolean;
  /** Dimension B: bypass the pre-spawn scope gate (CLI --force-scope parity). */
  acknowledgeScopePaths?: boolean;
  /** born-628 son-mil: override an unacknowledged prompt-gate BLOCK
   *  (CLI --force-prompt-gate / MCP acknowledgePromptGate parity). */
  acknowledgePromptGate?: boolean;
  sandboxMode?: boolean;
  timeoutMs?: number;
}

export interface SprintRunnerStatus {
  phase: string;
  progress: string;
  updatedAt: string;
  pid: number;
}

export interface SprintRunnerResult {
  success: true;
  sprintId: string;
  metrics?: {
    totalTasks: number;
    done: number;
    techDebt: number;
    noGo: number;
    durationMs: number;
  };
  summary: string;
  completedAt: string;
}

export interface SprintRunnerError {
  success: false;
  message: string;
  phase?: string;
  completedAt: string;
}

// ─── IPC Helpers (shared by runner and MCP start tool) ──────────

export function getIpcDir(projectRoot: string, jobId: string): string {
  return join(projectRoot, '.deckent', `${jobId}-ipc`);
}

export function writeIpcStatus(ipcDir: string, status: SprintRunnerStatus): void {
  try {
    writeFileSync(join(ipcDir, IPC_STATUS_FILE), JSON.stringify(status, null, 2), 'utf-8');
  } catch { /* best-effort — parent may have cleaned up */ }
}

export function writeIpcResult(ipcDir: string, result: SprintRunnerResult): void {
  writeFileSync(join(ipcDir, IPC_RESULT_FILE), JSON.stringify(result, null, 2), 'utf-8');
}

export function writeIpcError(ipcDir: string, error: SprintRunnerError): void {
  writeFileSync(join(ipcDir, IPC_ERROR_FILE), JSON.stringify(error, null, 2), 'utf-8');
}

export function readIpcStatus(ipcDir: string): SprintRunnerStatus | null {
  try {
    return JSON.parse(readFileSync(join(ipcDir, IPC_STATUS_FILE), 'utf-8')) as SprintRunnerStatus;
  } catch { return null; }
}

export function readIpcResult(ipcDir: string): SprintRunnerResult | null {
  try {
    return JSON.parse(readFileSync(join(ipcDir, IPC_RESULT_FILE), 'utf-8')) as SprintRunnerResult;
  } catch { return null; }
}

export function readIpcError(ipcDir: string): SprintRunnerError | null {
  try {
    return JSON.parse(readFileSync(join(ipcDir, IPC_ERROR_FILE), 'utf-8')) as SprintRunnerError;
  } catch { return null; }
}

// ─── Runner Exit Records (row 3311, sprint-512) ──────────────────
// Sprint 507's detached runner (PID 55905) died mid-journal-line with NOTHING
// in the crashes directory: the status read model went HOLD, cleanup went
// run-orphaned HOLD, and the chain needed manual recovery. Sprint 508 exited
// leaving its PID file behind while 510/511 exited cleanly — exit hygiene was
// path-dependent because only the normal-COMPLETE path ever reached
// sprint-finalizer's clearPid, and NO path reached `.deckent/crashes`.
//
// Invariant established here: a runner cannot die without a typed record.
//   · normal COMPLETE  → already typed by result.json (`success: true`); its
//     settlement behaviour is untouched and it writes no crash record.
//   · every catchable death (startup error, sprint error, uncaughtException,
//     unhandledRejection, SIGTERM/SIGINT/SIGHUP, fatal, any non-zero exit)
//     → typed record in the crashes directory + release of the OWNED pid file.
//   · SIGKILL / OOM cannot be caught by anyone — instead the next runner
//     detects the stale pid file at startup and publishes a posthumous death
//     record (see publishPosthumousRunnerDeaths). No watchdog, no daemon:
//     detection rides the existing entry point.
//
// The line format mirrors `src/cli/helpers/error-handler.ts` (the only other
// writer of this directory) so post-mortem readers see one shape. It is
// re-implemented rather than imported because ADR-D-004 C2 forbids
// `orchestra/ → cli/`.

const CRASHES_DIR = 'crashes';

export type RunnerExitPath =
  | 'startup-error'
  | 'sprint-error'
  | 'uncaughtException'
  | 'unhandledRejection'
  | 'signal'
  | 'fatal'
  | 'exit'
  | 'posthumous';

export interface RunnerExitRecord {
  readonly exitPath: RunnerExitPath;
  readonly timestamp: string;
  readonly pid: number;
  readonly jobId?: string;
  readonly sprintId?: string;
  readonly exitCode?: number;
  readonly signal?: string;
  readonly detail?: string;
  readonly error?: unknown;
}

/** Filesystem-safe stamp, identical convention to the CLI crash handler. */
function crashStamp(iso: string): string {
  return iso.replace(/[:.]/g, '-');
}

/**
 * Render a typed runner exit record in the crashes-directory line format:
 * `timestamp:` / `name:` / `message:` / `stack:` with the typed runner fields
 * carried as additional `key: value` lines. Every free-text field passes
 * through redactSensitive first.
 */
export function formatRunnerExitRecord(record: RunnerExitRecord): string {
  const redacted = record.error !== undefined ? redactSensitive(record.error) : null;
  const name = redacted ? redacted.name : `RunnerExit(${record.exitPath})`;
  const message = redacted
    ? redacted.message
    : redactSensitive(record.detail ?? `runner exit via ${record.exitPath}`).message;

  const lines = [
    `timestamp: ${record.timestamp}`,
    `kind: runner-exit`,
    `exitPath: ${record.exitPath}`,
    `pid: ${record.pid}`,
  ];
  if (record.jobId !== undefined) lines.push(`jobId: ${record.jobId}`);
  if (record.sprintId !== undefined) lines.push(`sprintId: ${record.sprintId}`);
  if (record.exitCode !== undefined) lines.push(`exitCode: ${record.exitCode}`);
  if (record.signal !== undefined) lines.push(`signal: ${record.signal}`);
  if (redacted && record.detail !== undefined) {
    lines.push(`detail: ${redactSensitive(record.detail).message}`);
  }
  lines.push(`name: ${name}`);
  lines.push(`message: ${message}`);
  lines.push(redacted?.stack ? `stack:\n${redacted.stack}` : 'stack: <unavailable>');
  return lines.join('\n') + '\n';
}

export interface WriteRunnerExitRecordOptions {
  /** Deterministic file name — used by the idempotent posthumous publisher. */
  readonly fileName?: string;
  /** Leave an existing record untouched instead of rewriting it. */
  readonly skipIfExists?: boolean;
}

/**
 * Write a typed exit record into `<projectRoot>/.deckent/crashes/`.
 * Fully synchronous (usable from `exit`/signal handlers) and fail-soft: a
 * record that cannot be written NEVER masks the death it was describing.
 * Returns the path written, or null when nothing was written.
 */
export function writeRunnerExitRecord(
  projectRoot: string,
  record: RunnerExitRecord,
  opts: WriteRunnerExitRecordOptions = {},
): string | null {
  try {
    const dir = join(projectRoot, DECKENT_DIR, CRASHES_DIR);
    mkdirSync(dir, { recursive: true });
    const fileName = opts.fileName
      ?? `${crashStamp(record.timestamp)}-runner-${record.exitPath}.log`;
    const filePath = join(dir, fileName);
    if (opts.skipIfExists && existsSync(filePath)) return null;
    writeFileSync(filePath, formatRunnerExitRecord(record), 'utf-8');
    return filePath;
  } catch {
    return null;
  }
}

export interface PidReleaseOptions {
  /** Identity of the releasing process (test seam). */
  readonly pid?: number;
  readonly startToken?: (pid: number) => string | null;
}

/**
 * Release the sprint PID files this exact process owns.
 *
 * Ownership is proven twice before deletion: the record's pid must equal our
 * own pid, and any recorded start token must match this process's live token.
 * A foreign pid file — or one whose token proves the pid was recycled — is
 * left completely alone. Deleting a PID file we do not own is the failure mode
 * this guard exists to make impossible.
 */
export function releaseOwnedSprintPidFiles(
  projectRoot: string,
  opts: PidReleaseOptions = {},
): string[] {
  const self = opts.pid ?? process.pid;
  const tokenOf = opts.startToken ?? processStartToken;
  const released: string[] = [];
  let sprintIds: string[];
  try {
    sprintIds = listPidFiles(projectRoot);
  } catch {
    return released;
  }
  for (const sprintId of sprintIds) {
    try {
      const record = readPidRecord(projectRoot, sprintId);
      if (!record || record.pid !== self) continue;
      const liveToken = tokenOf(self);
      // A recorded token that disagrees with our own means the file belongs to
      // a dead predecessor whose pid we inherited — not ours to remove.
      if (record.startToken && liveToken && record.startToken !== liveToken) continue;
      clearPid(projectRoot, sprintId);
      released.push(sprintId);
    } catch { /* best-effort — one unreadable pid file never blocks the rest */ }
  }
  return released;
}

export interface PosthumousDeathReport {
  readonly sprintId: string;
  readonly pid: number;
  readonly startedAt?: string;
  readonly ownership: 'dead' | 'reused';
  readonly recordPath: string;
}

export interface PosthumousDetectionOptions {
  readonly pid?: number;
  readonly isAlive?: (pid: number) => boolean;
  readonly startToken?: (pid: number) => string | null;
  readonly now?: () => Date;
}

/**
 * Startup-time detection of the ONE exit path nobody can catch: SIGKILL / OOM.
 *
 * A runner that finds a stale PID file whose process is provably gone
 * (`dead`, or `reused` — the pid is alive but belongs to a different process)
 * publishes a typed posthumous death record before proceeding. `owned` and
 * `unknown` are never claimed as deaths: `unknown` means the process is alive
 * but its identity is unprovable on this platform, and inventing a death there
 * would be a lie.
 *
 * The record file name is derived from the dead runner's own identity, so
 * repeated startups against the same stale PID file publish exactly once.
 * Nothing is deleted here — the stale PID file is evidence, and it belongs to
 * another process. (`writePid` already reclaims dead pid files on its own.)
 */
export function publishPosthumousRunnerDeaths(
  projectRoot: string,
  opts: PosthumousDetectionOptions = {},
): PosthumousDeathReport[] {
  const self = opts.pid ?? process.pid;
  const isAlive = opts.isAlive ?? isProcessAlive;
  const startToken = opts.startToken ?? processStartToken;
  const now = opts.now ?? (() => new Date());
  const reports: PosthumousDeathReport[] = [];

  let sprintIds: string[];
  try {
    sprintIds = listPidFiles(projectRoot);
  } catch {
    return reports;
  }

  for (const sprintId of sprintIds) {
    try {
      const record = readPidRecord(projectRoot, sprintId);
      if (!record || record.pid === self) continue;
      const ownership = verifyPidOwnership(record, { isAlive, startToken });
      if (ownership !== 'dead' && ownership !== 'reused') continue;

      const safeSprintId = sprintId.replace(/[^A-Za-z0-9._-]/g, '_');
      const fileName =
        `${crashStamp(record.startedAt ?? 'unknown-start')}-runner-posthumous-${safeSprintId}-${record.pid}.log`;
      const detail = ownership === 'reused'
        ? `sprint ${sprintId} runner pid ${record.pid} was recycled by a different process — the runner died without recording an exit`
        : `sprint ${sprintId} runner pid ${record.pid} is gone and left no exit record — uncatchable death (SIGKILL/OOM/host loss)`;
      const recordPath = writeRunnerExitRecord(
        projectRoot,
        {
          exitPath: 'posthumous',
          timestamp: now().toISOString(),
          pid: record.pid,
          sprintId,
          detail,
        },
        { fileName, skipIfExists: true },
      );
      if (!recordPath) continue; // already published, or unwritable — both fail-soft
      reports.push({
        sprintId,
        pid: record.pid,
        startedAt: record.startedAt,
        ownership,
        recordPath,
      });
    } catch { /* best-effort — detection never blocks the new run */ }
  }
  return reports;
}

// ─── Crash Handlers (ADR-043 Brain Crash Recovery) ───────────────
// Sprint 157→158→159 üçü de silent crash oldu çünkü uncaughtException,
// unhandledRejection ve SIGTERM yakalanamadı. installCrashHandlers
// idempotent — module-level guard ile çift listener'ı engeller.
// Fail-fast policy: brain kendi restart'ını YAPMAZ; exit code 1 (crash)
// veya 143 (SIGTERM) ile çıkar, parent supervisor karar verir.

let crashHandlersInstalled = false;
/** Context of the live runner, so the top-level fatal catch can type its own death. */
let activeCrashContext: CrashContext | null = null;
/** Set once any handler has already typed this death — the `exit` catch-all defers to it. */
let exitRecordWritten = false;

export function installCrashHandlers(ctx: CrashContext): void {
  if (crashHandlersInstalled) return;
  crashHandlersInstalled = true;
  activeCrashContext = ctx;

  // row 3311: a typed record for every catchable death. Fail-soft by
  // construction — recordDeath never throws and never replaces the IPC/stderr
  // writes that surface the original error.
  const recordDeath = (record: Omit<RunnerExitRecord, 'timestamp' | 'pid' | 'jobId'>): void => {
    if (!ctx.projectRoot) return;
    exitRecordWritten = true;
    writeRunnerExitRecord(ctx.projectRoot, {
      ...record,
      timestamp: new Date().toISOString(),
      pid: process.pid,
      jobId: ctx.jobId,
    });
  };

  const writeError = (kind: 'uncaughtException' | 'unhandledRejection', err: unknown): void => {
    try {
      const payload = {
        kind,
        jobId: ctx.jobId,
        timestamp: new Date().toISOString(),
        error: redactSensitive(err),
      };
      writeFileSync(join(ctx.ipcDir, IPC_ERROR_FILE), JSON.stringify(payload, null, 2), 'utf-8');
    } catch { /* best-effort — parent may have cleaned up */ }
  };

  process.on('uncaughtException', (err) => {
    writeError('uncaughtException', err);
    recordDeath({ exitPath: 'uncaughtException', error: err, exitCode: 1 });
    try {
      process.stderr.write(`Brain crash (uncaughtException): ${redactSensitive(err).message}\n`);
    } catch { /* best-effort */ }
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    writeError('unhandledRejection', reason);
    recordDeath({ exitPath: 'unhandledRejection', error: reason, exitCode: 1 });
    try {
      process.stderr.write(`Brain crash (unhandledRejection): ${redactSensitive(reason).message}\n`);
    } catch { /* best-effort */ }
    process.exit(1);
  });

  // 128 + signal number, POSIX convention. SIGINT/SIGHUP were previously
  // unhandled: the runner died on Ctrl-C or a lost terminal with nothing at all
  // on disk (row 3311 exit-path inventory, paths #6/#7).
  const signalExits: ReadonlyArray<readonly [NodeJS.Signals, number]> = [
    ['SIGTERM', 143],
    ['SIGINT', 130],
    ['SIGHUP', 129],
  ];
  for (const [signal, exitCode] of signalExits) {
    process.on(signal, () => {
      try {
        const status = {
          phase: 'TERMINATED',
          jobId: ctx.jobId,
          terminatedBy: signal,
          timestamp: new Date().toISOString(),
        };
        writeFileSync(join(ctx.ipcDir, IPC_STATUS_FILE), JSON.stringify(status, null, 2), 'utf-8');
      } catch { /* best-effort */ }
      recordDeath({
        exitPath: 'signal',
        signal,
        exitCode,
        detail: `runner terminated by ${signal}`,
      });
      process.exit(exitCode);
    });
  }

  // Catch-all + PID hygiene. `exit` fires for every catchable path — a normal
  // return, an explicit process.exit(), and each handler above — so this is the
  // one place that guarantees no death escapes untyped and that the PID file
  // this process owns is always released (a no-op after a clean sprint, whose
  // finalizer already called clearPid). Synchronous only: async I/O in an
  // `exit` listener is discarded by Node.
  if (ctx.projectRoot) {
    const projectRoot = ctx.projectRoot;
    process.on('exit', (code) => {
      if (code !== 0 && !exitRecordWritten) {
        exitRecordWritten = true;
        writeRunnerExitRecord(projectRoot, {
          exitPath: 'exit',
          timestamp: new Date().toISOString(),
          pid: process.pid,
          jobId: ctx.jobId,
          exitCode: code,
          detail: `runner exited with code ${code} without a typed exit record`,
        });
      }
      try {
        releaseOwnedSprintPidFiles(projectRoot);
      } catch { /* best-effort */ }
    });
  }
}

// Test-only reset hook — prod kodu çağırmaz, vitest beforeEach kullanır.
export function _resetCrashHandlersForTesting(): void {
  crashHandlersInstalled = false;
  activeCrashContext = null;
  exitRecordWritten = false;
}

// ─── Runner Main (only runs when executed directly) ──────────────

async function main(): Promise<void> {
  // row 3311, exit path #3: a startup abort happens before the IPC config (and
  // therefore projectRoot) is known, so the record lands under the cwd — the
  // same convention the CLI crash handler uses.
  const recordStartupDeath = (detail: string, err?: unknown): void => {
    exitRecordWritten = true;
    writeRunnerExitRecord(process.cwd(), {
      exitPath: 'startup-error',
      timestamp: new Date().toISOString(),
      pid: process.pid,
      exitCode: 1,
      detail,
      ...(err !== undefined ? { error: err } : {}),
    });
  };

  const ipcDir = process.argv[2];
  if (!ipcDir) {
    process.stderr.write('Usage: sprint-runner-entry.js <ipc-dir>\n');
    recordStartupDeath('runner started without an IPC directory argument');
    process.exit(1);
  }

  // Read config from IPC directory
  const configPath = join(ipcDir, IPC_CONFIG_FILE);
  if (!existsSync(configPath)) {
    process.stderr.write(`IPC config not found: ${configPath}\n`);
    recordStartupDeath(`IPC config not found: ${configPath}`);
    process.exit(1);
  }

  let runnerConfig: SprintRunnerConfig;
  try {
    runnerConfig = JSON.parse(readFileSync(configPath, 'utf-8')) as SprintRunnerConfig;
  } catch (err) {
    process.stderr.write(`Failed to parse IPC config: ${err}\n`);
    recordStartupDeath(`failed to parse IPC config: ${configPath}`, err);
    process.exit(1);
  }

  const { projectRoot, jobId, autoApprove, acknowledgeScopePaths, acknowledgePromptGate, sandboxMode, timeoutMs } = runnerConfig;

  // ADR-043: Install crash handlers AS EARLY AS POSSIBLE after IPC
  // config is known. Anything thrown after this point lands in error.json
  // (redacted) instead of vanishing into a silent process exit.
  // Sprint 512 (row 3311): projectRoot also arms the typed exit record + the
  // release of the PID file this runner owns.
  installCrashHandlers({ ipcDir, jobId, projectRoot });

  // row 3311, exit path #9: SIGKILL/OOM cannot be caught by the process that
  // dies, so the NEXT runner types that death. Fail-soft — a detection error
  // never blocks the sprint that is starting now.
  try {
    publishPosthumousRunnerDeaths(projectRoot);
  } catch { /* best-effort */ }

  // Write initial status
  writeIpcStatus(ipcDir, {
    phase: 'INIT',
    progress: 'Loading config and providers...',
    updatedAt: new Date().toISOString(),
    pid: process.pid,
  });

  let approvalAuthority: ApprovalAuthorityBootstrapResult | undefined;
  try {
    // Dynamic imports — these pull in the full sprint machinery
    const { loadConfig } = await import('../core/config.js');
    const { bootstrapProviders } = await import('../core/provider.js');
    const { bootstrapApprovalAuthority } = await import('../core/approval-authority-bootstrap.js');
    const { runSprint } = await import('./sprint-controller.js');
    const { writeJobState, buildTaskSummaries } = await import('../mcp/tools/job-runner.js');

    const config = await loadConfig(projectRoot);
    approvalAuthority = bootstrapApprovalAuthority(projectRoot, config);

    writeIpcStatus(ipcDir, {
      phase: 'BOOTSTRAP',
      progress: 'Bootstrapping providers...',
      updatedAt: new Date().toISOString(),
      pid: process.pid,
    });

    const bootstrap = await bootstrapProviders(config, projectRoot);

    // WIRE-002 (MASTER-PLAN §4G): wire DECKENT→USER:NOTIFY for this detached
    // runner. DECKENT_PARENT_PID is inherited from the MCP host that spawned us,
    // so lifecycle notify() calls reach the operator's terminal + notify-log.jsonl
    // instead of being silently dropped (the "safe-but-deaf" gap).
    // BOT-001: fan notifications out to messaging connectors (Telegram/Discord) too.
    // KPI Faz-2: forward a sprint-end KPI summary fn (non-blocking, connector
    // broadcast on sprint-finalized). No-op when no connectors are configured.
    const { buildConnectorAdapterWithKpiSummary, buildSprintKpiSummaryFn } =
      await import('../connectors/kpi-summary-dispatch.js');
    const connectorAdapter = await buildConnectorAdapterWithKpiSummary(
      config.notify_connectors,
      { kpiSummaryFn: buildSprintKpiSummaryFn(projectRoot, config.language) },
    );
    bootstrapNotifyDispatcher({
      projectRoot,
      extraAdapters: connectorAdapter ? [connectorAdapter] : [],
      webhook: resolveWebhookBootstrapOption(config),
    });

    writeIpcStatus(ipcDir, {
      phase: 'RUNNING',
      progress: 'Sprint started...',
      updatedAt: new Date().toISOString(),
      pid: process.pid,
    });

    const sprint = await runSprint(projectRoot, config, {
      autoApprove,
      acknowledgeScopePaths,
      acknowledgePromptGate,
      sandboxMode,
      timeoutMs,
      connector: bootstrap?.connector,
      ...(approvalAuthority.state === 'ready'
        ? {
            attendedExecutionApprovalAuthority:
              approvalAuthority.runtime.attendedExecutionApprovalAuthority,
          }
        : {}),
    });

    // Build job state
    const tasks = buildTaskSummaries(projectRoot, sprint.tasks);
    const sm = sprint.metrics;
    const durationMs = sm?.durationMs ?? 0;
    const formatDuration = (ms: number): string => {
      const mins = Math.floor(ms / 60000);
      const secs = Math.floor((ms % 60000) / 1000);
      return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
    };

    const agentBreakdown: Record<string, number> = {};
    for (const t of sprint.tasks) {
      const agent = t.assignedAgent ?? 'generic';
      agentBreakdown[agent] = (agentBreakdown[agent] ?? 0) + 1;
    }

    const total = sm?.totalTasks ?? sprint.tasks.length;
    const completed = sm?.completedTasks ?? 0;
    const donePure = completed - (sm?.techDebtTasks ?? 0);
    const techDebt = sm?.techDebtTasks ?? 0;
    const noGo = sm?.noGoTasks ?? 0;
    const agentParts = Object.entries(agentBreakdown).map(([a, c]) => `${a}(${c})`).join(', ');
    const summary = `Sprint ${sprint.id} tamamlandı (${formatDuration(durationMs)}) — ${completed}/${total} task: ${donePure} DONE, ${techDebt} TECH_DEBT, ${noGo} NO_GO | Agent: ${agentParts}`;

    writeJobState(projectRoot, {
      jobId,
      status: 'COMPLETE',
      startedAt: runnerConfig.jobId.replace('sprint-', ''),
      completedAt: new Date().toISOString(),
      sprintId: sprint.id,
      tasks,
      metrics: sm ? { totalTasks: sm.totalTasks, done: sm.completedTasks, techDebt: sm.techDebtTasks, noGo: sm.noGoTasks, duration: formatDuration(durationMs) } : undefined,
      summary,
      agentBreakdown,
    });

    // Write IPC result
    writeIpcResult(ipcDir, {
      success: true,
      sprintId: sprint.id,
      metrics: sm ? { totalTasks: sm.totalTasks, done: sm.completedTasks, techDebt: sm.techDebtTasks, noGo: sm.noGoTasks, durationMs } : undefined,
      summary,
      completedAt: new Date().toISOString(),
    });
  } catch (err) {
    const { BrainError: BE } = await import('./sprint-lifecycle.js');
    const isBrainError = err instanceof BE;
    const message = isBrainError
      ? `Sprint failed at phase ${(err as { phase?: string }).phase ?? 'unknown'}: ${(err as Error).message}`
      : err instanceof Error ? err.message : String(err);

    // Write job state as FAILED
    try {
      const { writeJobState } = await import('../mcp/tools/job-runner.js');
      writeJobState(projectRoot, {
        jobId,
        status: 'FAILED',
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        error: message,
      });
    } catch { /* best-effort */ }

    // Write IPC error
    writeIpcError(ipcDir, {
      success: false,
      message,
      phase: isBrainError ? ((err as { phase?: string }).phase ?? undefined) : undefined,
      completedAt: new Date().toISOString(),
    });

    // row 3311, exit path #2: the sprint-failure path reached only the IPC dir,
    // so a post-mortem reader of the crashes directory saw nothing. The
    // original error is still surfaced above and below — this only adds the
    // record, it never swallows anything.
    exitRecordWritten = true;
    writeRunnerExitRecord(projectRoot, {
      exitPath: 'sprint-error',
      timestamp: new Date().toISOString(),
      pid: process.pid,
      jobId,
      exitCode: 1,
      detail: message,
      error: err,
    });

    process.exitCode = 1;
  } finally {
    if (approvalAuthority?.state === 'ready') approvalAuthority.runtime.close();
  }
}

// M7.C: Self-cleanup — remove IPC directory on successful exit.
// Must be registered before main() so it fires on all exit paths.
// 'exit' event only supports synchronous operations (async I/O is ignored).
// Preserves IPC dir on non-zero exit codes for post-mortem debugging.
{
  const _ipcDirForCleanup = process.argv[2];
  if (_ipcDirForCleanup) {
    process.on('exit', (code) => {
      if (code === 0 || code === undefined) {
        try { rmSync(_ipcDirForCleanup, { recursive: true, force: true }); } catch { /* best-effort */ }
      }
    });
  }
}

// Only run main when this file is the entry point (not when imported for types/helpers)
const isEntryPoint = process.argv[1]?.endsWith('sprint-runner-entry.js') ||
                     process.argv[1]?.endsWith('sprint-runner-entry.ts');
if (isEntryPoint) {
  main().catch((err) => {
    // row 3311, exit path #8: this last-resort catch used to leave only a
    // stderr line. The record is written before the exit so the death is typed
    // even when main() failed outside every inner handler.
    exitRecordWritten = true;
    writeRunnerExitRecord(activeCrashContext?.projectRoot ?? process.cwd(), {
      exitPath: 'fatal',
      timestamp: new Date().toISOString(),
      pid: process.pid,
      jobId: activeCrashContext?.jobId,
      exitCode: 2,
      detail: 'runner main() rejected outside every inner handler',
      error: err,
    });
    process.stderr.write(`Fatal: ${err}\n`);
    process.exit(2);
  });
}
