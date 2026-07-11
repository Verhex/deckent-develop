#!/usr/bin/env node
// ═══ Sprint Runner Entry — Detached Child Process ═════════════════
// Sprint 143: MCP Disconnect Fix
// This module runs as a detached child process, freeing the MCP
// server's stdio transport from long-running sprint operations.
//
// Usage: node sprint-runner-entry.js <ipc-dir>
// The IPC directory must contain config.json with sprint parameters.

import { readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { redactSensitive } from './sensitive-redactor.js';
import { bootstrapNotifyDispatcher, resolveWebhookBootstrapOption } from '../core/notify-bootstrap.js';

// ─── IPC File Names ──────────────────────────────────────────────
export const IPC_CONFIG_FILE = 'config.json';
export const IPC_STATUS_FILE = 'status.json';
export const IPC_RESULT_FILE = 'result.json';
export const IPC_ERROR_FILE = 'error.json';

// ─── Crash Handler Types (ADR-043) ──────────────────────────────

export interface CrashContext {
  ipcDir: string;
  jobId: string;
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

// ─── Crash Handlers (ADR-043 Brain Crash Recovery) ───────────────
// Sprint 157→158→159 üçü de silent crash oldu çünkü uncaughtException,
// unhandledRejection ve SIGTERM yakalanamadı. installCrashHandlers
// idempotent — module-level guard ile çift listener'ı engeller.
// Fail-fast policy: brain kendi restart'ını YAPMAZ; exit code 1 (crash)
// veya 143 (SIGTERM) ile çıkar, parent supervisor karar verir.

let crashHandlersInstalled = false;

export function installCrashHandlers(ctx: CrashContext): void {
  if (crashHandlersInstalled) return;
  crashHandlersInstalled = true;

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
    try {
      process.stderr.write(`Brain crash (uncaughtException): ${redactSensitive(err).message}\n`);
    } catch { /* best-effort */ }
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    writeError('unhandledRejection', reason);
    try {
      process.stderr.write(`Brain crash (unhandledRejection): ${redactSensitive(reason).message}\n`);
    } catch { /* best-effort */ }
    process.exit(1);
  });

  process.on('SIGTERM', () => {
    try {
      const status = {
        phase: 'TERMINATED',
        jobId: ctx.jobId,
        terminatedBy: 'SIGTERM',
        timestamp: new Date().toISOString(),
      };
      writeFileSync(join(ctx.ipcDir, IPC_STATUS_FILE), JSON.stringify(status, null, 2), 'utf-8');
    } catch { /* best-effort */ }
    // 128 + signal number (SIGTERM=15) = 143, POSIX convention.
    process.exit(143);
  });
}

// Test-only reset hook — prod kodu çağırmaz, vitest beforeEach kullanır.
export function _resetCrashHandlersForTesting(): void {
  crashHandlersInstalled = false;
}

// ─── Runner Main (only runs when executed directly) ──────────────

async function main(): Promise<void> {
  const ipcDir = process.argv[2];
  if (!ipcDir) {
    process.stderr.write('Usage: sprint-runner-entry.js <ipc-dir>\n');
    process.exit(1);
  }

  // Read config from IPC directory
  const configPath = join(ipcDir, IPC_CONFIG_FILE);
  if (!existsSync(configPath)) {
    process.stderr.write(`IPC config not found: ${configPath}\n`);
    process.exit(1);
  }

  let runnerConfig: SprintRunnerConfig;
  try {
    runnerConfig = JSON.parse(readFileSync(configPath, 'utf-8')) as SprintRunnerConfig;
  } catch (err) {
    process.stderr.write(`Failed to parse IPC config: ${err}\n`);
    process.exit(1);
  }

  const { projectRoot, jobId, autoApprove, acknowledgeScopePaths, acknowledgePromptGate, sandboxMode, timeoutMs } = runnerConfig;

  // ADR-043: Install crash handlers AS EARLY AS POSSIBLE after IPC
  // config is known. Anything thrown after this point lands in error.json
  // (redacted) instead of vanishing into a silent process exit.
  installCrashHandlers({ ipcDir, jobId });

  // Write initial status
  writeIpcStatus(ipcDir, {
    phase: 'INIT',
    progress: 'Loading config and providers...',
    updatedAt: new Date().toISOString(),
    pid: process.pid,
  });

  try {
    // Dynamic imports — these pull in the full sprint machinery
    const { loadConfig } = await import('../core/config.js');
    const { bootstrapProviders } = await import('../core/provider.js');
    const { runSprint } = await import('./sprint-controller.js');
    const { writeJobState, buildTaskSummaries } = await import('../mcp/tools/job-runner.js');

    const config = await loadConfig(projectRoot);

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

    process.exit(1);
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
    process.stderr.write(`Fatal: ${err}\n`);
    process.exit(2);
  });
}
