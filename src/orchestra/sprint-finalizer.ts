// ═══ Sprint Finalizer ══════════════════════════════════════════════
// Extracted from sprint-controller.ts — handles post-sprint finalization:
//   finalizeSprint(), applyAdaptiveThresholds(), hook stubs for Task 13/14/15

// ─── Node Builtins ─────────────────────────────────────────────────
import {
  readFileSync, writeFileSync, existsSync,
  mkdirSync, readdirSync, renameSync, unlinkSync,
} from 'node:fs';
import { promises as fsPromises } from 'node:fs';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';

// ─── Core (value imports) ──────────────────────────────────────────
import {
  TaskEvaluation, SprintStatus, SprintPhase,
} from '../core/types.js';

// ─── Core (type imports) ───────────────────────────────────────────
import type {
  Task, TaskResult, Sprint, SprintMetrics,
  ResolvedConfig,
} from '../core/types.js';
import { resolveBillingModeForAuth } from '../core/cost-calculator.js';
import { getMessage } from '../cli/helpers/messages.js';
import {
  projectAttributedTaskWork,
  projectSprintWorkAttribution,
} from '../core/sprint-work-attribution.js';

import type { TaskDNA } from '../core/routing-types.js';

import {
  BRAIN_DIR, JOBS_DIR, DASHBOARD_FILE, RECENT_WORKS_DIR, TASKS_DIR,
  SPRINT_PAUSE_STATE_FILE,
} from '../core/constants.js';

import { cleanupCounters, runRetention } from '../core/sprint-file-retention.js';
import { archiveStaleSchedulerShadowJournals } from '../core/scheduler-shadow-retention.js';

// ─── Core — utils ─────────────────────────────────────────────────
import { updateLastSprintId, debugLog, readJsonSafe } from '../core/utils.js';
import { getDebtItems } from '../core/debt-store.js';

// ─── Terminal truth (Sprint 486 task 486-007) ─────────────────────
import {
  assembleSprintTerminalEvidence,
  type CoordinatorTerminalEvidence,
  type ExactAttemptEvidence,
  type ExactAttemptIdentity,
  type SprintTerminalEvidence,
} from './sprint-terminal-evidence.js';
import {
  projectLogicalProgress,
  type LogicalProgressProjection,
} from '../core/logical-progress-projection.js';
import {
  aggregateLineageUsageAuthority,
  type LineageBillingAuthority,
  type LineageUsageAuthorityAggregate,
} from '../core/lineage-usage-authority.js';
import {
  createSprintTerminalPublicationState,
  transitionSprintTerminalPublication,
  SPRINT_TERMINAL_PUBLICATION_VERSION,
  type SprintTerminalPublicationStateV1,
  type SprintTerminalReceiptV1,
} from '../core/sprint-terminal-publication.js';

// ─── Sprint Reporter ──────────────────────────────────────────────
import {
  writeRetrospective, appendRetroSection, writeSprintLog, calculateMetrics,
  updateProjectDocs,
  buildAgentPerformance, archiveDirectives, archiveOrphanTasks,
  buildSprintLimitBurnRow, buildFilesChangedCostSection,
} from './sprint-reporter.js';

// ─── Cost Ledger — helper-call (off-primary) cost bridge (MET668B / 419-002) ──
// orchestra → core import: ADR-008 allowed direction. Pure functions; the disk
// read (collectHelperCost) lives here in orchestra, not in core.
import {
  buildHelperLedger, extractHelperUsageEntries, loadBundledClaudePricing,
  type ModelUsageMap, type HelperEnvelope, type CostLedger,
} from '../core/cost-ledger.js';

// ─── Sprint Docs Updater (direct — cleanTasksArchive not re-exported via sprint-reporter) ──
import { cleanTasksArchive } from './sprint-docs-updater.js';

// ─── Result Evaluator ─────────────────────────────────────────────
import {
  getRecentSprintStats,
  GO_WITH_GATE_FAILURE,
  applyTechDebtDowngrade,
} from './result-evaluator.js';

// ─── Auditor (code verification — migrated Sprint 138) ────────────
import {
  tryCodeVerifiedDone,
  writeCodeVerifiedResult,
} from '../monitor/auditor.js';

// ─── Baseline Tracker ─────────────────────────────────────────────
import {
  parseVitestBaseline, readBaseline, containsHonestyTrigger,
  captureVitestBaseline,
} from './baseline-tracker.js';

// ─── Result Collector ─────────────────────────────────────────────
import { buildResultsMap } from './result-collector.js';

// ─── Self-Audit Adapter Registry (ADR-D-004 allowed orchestra → core direction) ──
// The finalizer owns policy (what may run); the registry owns ecosystem command
// selection and output parsing. No framework-specific argv lives here.
import { SelfAuditAdapterRegistry } from '../core/self-audit-adapter.js';
import type {
  SelfAuditExecutor,
  SelfAuditRequest,
  SelfAuditResult as AdapterSelfAuditResult,
} from '../core/self-audit-adapter.js';
import { VitestSelfAuditAdapter } from '../core/self-audit-vitest-adapter.js';
import { detectProjectStack } from '../core/stack-detector.js';

// ─── Handoff Protocol (B-HANDOFF-PRUNE — Sprint 331 331-006 storage-prune hook) ──
import { HandoffProtocol } from './handoff-protocol.js';

// ─── KPI Collection (Sprint 330 Task 8 — non-blocking finalize hook) ──
// orchestra → core import: ADR-008 allowed direction (core never imports orchestra).
import { recordKpiMeasurements } from '../core/kpi/collection.js';
import type { UsageTotals } from '../core/kpi/collection.js';

// ─── Cumulative Spend Advisory (B6 — warn-only finalize hook, Sprint 333 333-005) ──
// orchestra → core import: ADR-008 allowed direction (core never imports orchestra).
// checkSpendGate is pure + flag-gated; spend-window read + cost-config load live in core.
import { checkSpendGate } from '../core/cost-gate.js';
import type { CostLimitWarnEvent } from '../core/cost-gate.js';
import { readSpendWindow, loadCostConfig } from '../core/cost-config-loader.js';
import type { CostConfig } from '../core/cost-config-loader.js';

// ─── Debt Manager ─────────────────────────────────────────────────
import { runDecay, auditBrainBudget } from './debt-manager.js';
import { runDocTrackingSync } from '../core/doc-tracking/sync.js';

// ─── Observability ────────────────────────────────────────────────
import { generateLoadReport, initObservability } from '../core/observability.js';
import { rotateMetricsFile } from '../core/observability-rotation.js';
import type { ObservabilityRotationConfig } from '../core/observability-rotation.js';

// ─── Agent/Skill Pool ─────────────────────────────────────────────
import { AgentPoolManager } from '../core/agent-pool.js';
import { PromptVersionManager } from '../agents/prompt-version.js';
import { SkillPoolManager } from '../core/skill-pool.js';

// ─── Plugin Hooks ─────────────────────────────────────────────────
import { runHooks } from '../core/plugin-hooks.js';
import type { AfterSprintContext } from '../core/plugin-hooks.js';

// ─── Rich Output ──────────────────────────────────────────────────
import { formatRichSprintSummary } from '../cli/helpers/sprint-summary-rich.js';

// ─── Event Stream (Brain event hooks — Sprint 139 Task 042) ───────
import { writeEvent, CHANNELS, getCurrentSprintId } from './event-stream.js';

// ─── Post-Finalize Hooks (Sprint 143 Task 10) ─────────────────────
import { runPostFinalizeHooks } from '../core/identity-generator.js';
import type { PostFinalizeHookResult } from '../core/identity-generator.js';

// ─── Export-wipe guard (Sprint 227 task 227-002) ──────────────────
// runMemoryExport (identity-generator.ts) overwrites .brain/exports/*.md
// unconditionally; in sprint-226 this wiped decisions.md from 8518 to 2 lines
// while the DB still held 75 ADRs. We bypass runMemoryExport and call the
// guarded writer here instead — it refuses to overwrite when the render
// collapses to the "no entries" marker while the DB has entries.
import { writeGuardedExports } from '../core/memory-export.js';
import { MemoryStore } from '../core/memory-store.js';
import { MEMORY_DB_FILE } from '../core/constants.js';

// ─── Task Restoration / Auto-Archive Guard (Sprint 143 Task 13) ───
import { createPreArchiveSnapshot, classifyTaskFiles } from './task-restoration.js';

// ─── Notify (DECKENT→USER:NOTIFY — Hot Fix H6) ────────────────────
import { notify } from '../core/notify.js';

// ─── Sprint State + PID cleanup (Sprint 223 Task 013) ─────────────
// Mark sprint-state.json as terminal (COMPLETE/COMPLETE) and remove
// `.deckent/pids/<id>.pid` + `.snapshot.json` so the next `deckent start`
// no longer detects this sprint as an orphan and does not re-resume it
// in the FIX phase.
import { writeSprintState, readSprintState, SPRINT_STATE_FILE } from './sprint-utils.js';
import { clearPid } from './sprint-pid-manager.js';

// ─── Checkpoint cleanup (Sprint 272 272-001 — GHOST-FINALIZE) ─────
// Terminal-state finalize must purge `.deckent/<id>-checkpoint.json` +
// `-checkpoint-seq` so the next `deckent start` cannot read a stale
// checkpoint and run a phantom 0/0 "complete" restore that exits before
// the new sprint starts. Covers normal completion AND `finalize --force`.
import { cleanupCheckpointFiles } from './sprint-checkpoint.js';


// ═══ Types ════════════════════════════════════════════════════════

/**
 * Options for finalizeSprint.
 */
export interface FinalizeSprintOptions {
  /** Skip decay phase */
  skipDecay?: boolean;
  /** Skip plugin hooks */
  skipHooks?: boolean;
  /** Resolved config (used for updateProjectDocs) */
  config?: ResolvedConfig;
  /** Skip post-finalize memory export */
  skipMemoryExport?: boolean;
  /** Skip post-finalize identity regeneration */
  skipIdentityRegen?: boolean;
  /** Rule regeneration callback (Task 11 hook point) */
  onRuleRegen?: (projectRoot: string) => void | Promise<void>;
  /**
   * Run-flow correlation id (TERM5-FIN / sprint-427 task 1). Not derivable from
   * `Sprint` (no `flowId` field) and orchestra/ MUST NOT import
   * cli/repl/run-flow-store.ts to look one up (ADR-D-004 C2) — so a caller that
   * started this sprint via the run-flow-v2 path threads it in here. Absent for
   * every current caller; surfaced (when present) on the job completion record's
   * `completionRecord.flowId` for later flowId-correlated consumers.
   */
  flowId?: string;
  /**
   * Monotonic coordinator generation for the fenced terminal-publication CAS.
   * Legacy in-process callers are generation 1; restarted/failover coordinators
   * must thread their durable generation rather than overwriting that authority.
   */
  coordinatorGeneration?: number;
  /**
   * The in-process Sprint controller still owns delayed cleanup. When true,
   * finalization prepares metrics/docs but leaves COMPLETE state, PID
   * retirement, dashboard and completion notification to the controller's
   * post-cleanup terminal publisher.
   */
  deferTerminalAuthority?: boolean;
}


// ═══ Hook Stubs (Task 13 / Task 14 / Task 15 will fill these) ═══

/**
 * Run honesty check against pre-sprint baseline.
 * Stub — Task 5 (baseline-tracker) will implement comparison logic.
 * @returns Number of honesty violations detected (0 = clean)
 */
export async function runHonestyCheck(
  _projectRoot: string,
  _sprintId: string,
  _results: TaskResult[],
): Promise<number> {
  // Stub: returns 0 violations (no-op until Task 5 integrates)
  return 0;
}

/**
 * Append rubric score detail to the sprint's `retro` entry in memory.db.
 * Adds a "### Rubric Scores" section. B8: writes to the DB retro entry —
 * the legacy `.brain/RETRO.md` file is no longer produced.
 * @returns true if detail was written, false if no rubric data available
 */
export async function writeRubricDetail(
  projectRoot: string,
  sprintId: string,
  results: TaskResult[],
  _evaluations: Map<string, TaskEvaluation>,
): Promise<boolean> {
  // Only proceed if at least one result has rubric scores
  const scoredResults = results.filter(r => r.rubricScores && Object.keys(r.rubricScores).length > 0);
  if (scoredResults.length === 0) return false;

  // Build the rubric table rows
  const tableLines: string[] = [];
  tableLines.push('');
  tableLines.push(`### Rubric Scores`);
  tableLines.push('| Task | Correctness | Coverage | Scope | Docs | Avg |');
  tableLines.push('|------|-------------|----------|-------|------|-----|');

  const avgScores: number[] = [];

  for (const result of scoredResults) {
    const rs = result.rubricScores!;
    const fmt = (v: number | undefined): string => v !== undefined ? `${v}` : 'N/A';
    const correctness = rs.correctness;
    const coverage = rs.test_coverage;
    const scope = rs.scope_compliance;
    const docs = rs.documentation;

    const defined = [correctness, coverage, scope, docs].filter((v): v is number => v !== undefined);
    const avg = defined.length > 0 ? Math.round(defined.reduce((a, b) => a + b, 0) / defined.length) : undefined;
    if (avg !== undefined) avgScores.push(avg);

    tableLines.push(`| ${result.taskId} | ${fmt(correctness)} | ${fmt(coverage)} | ${fmt(scope)} | ${fmt(docs)} | ${avg !== undefined ? avg : 'N/A'} |`);
  }

  if (avgScores.length > 0) {
    const overallAvg = Math.round(avgScores.reduce((a, b) => a + b, 0) / avgScores.length);
    tableLines.push(`| **Sprint Avg** | — | — | — | — | **${overallAvg}** |`);
  }

  return appendRetroSection(projectRoot, sprintId, '### Rubric Scores', tableLines.join('\n') + '\n');
}

/**
 * Self-audit gate: run tsc + vitest + honesty + observability checks.
 * Implemented by Task 14 (Brain Self-Audit Gate).
 *
 * Gate steps:
 * 1. `npx tsc --noEmit` (timeout 90s)
 * 2. `npx vitest run` (timeout 300s) + baseline delta
 * 3. Honesty violation count from task results
 * 4. `.deckent/metrics.jsonl` existence + line count
 *
 * Overall gate = PASS if tsc + vitest + honesty all pass.
 * metrics.jsonl missing → WARNING only, not gate failure.
 */
/**
 * Typed non-green outcomes of the scoped audit surface. `ECOSYSTEM_UNSUPPORTED`
 * and `ADAPTER_HOLD` are honest holds: the gate never reports PASS for a project
 * type no registered adapter can execute.
 */
export type SelfAuditExecutionReasonCode =
  | 'NO_TEST_REQUIRED'
  | 'REQUIRED_TEST_MANIFEST_EMPTY'
  | 'EXECUTION_EVIDENCE_UNPARSEABLE'
  | 'ECOSYSTEM_UNSUPPORTED'
  | 'ADAPTER_HOLD';

export interface SelfAuditResult {
  tsc: { status: 'PASS' | 'FAIL'; errors: string[] };
  vitest: {
    status: 'PASS' | 'FAIL';
    delta: { files: number; pass: number; fail: number; skipped: number };
    execution?: {
      mode: 'scoped' | 'full';
      command: readonly string[];
      testFiles: readonly string[];
      executed: boolean;
      timedOut: boolean;
      exitCode: number | null;
      reasonCode?: SelfAuditExecutionReasonCode;
      /** Registry adapter that produced the evidence (scoped mode only). */
      adapterId?: string;
      /** Typed hold detail when the registry refused to produce green evidence. */
      holdDetail?: string;
      /** Adapter-computed digest of the captured execution output. */
      outputDigest?: string;
    };
  };
  honesty: { violations: number; flaggedTasks: string[] };
  observability: { metricsJsonlExists: boolean; lineCount: number };
  overallGate: 'PASS' | 'GATE_FAILURE';
}

export interface ScopedSelfAuditManifest {
  readonly testFiles: readonly string[];
  readonly requiresTests: boolean;
  readonly requiresTypeScript: boolean;
  readonly evidenceRefs: readonly string[];
}

function normalizeScopedAuditPath(value: string): string | null {
  const normalized = value.replaceAll('\\', '/').replace(/^\.\//u, '');
  if (
    normalized.length === 0
    || normalized.startsWith('/')
    || /^[A-Za-z]:\//u.test(normalized)
    || normalized.split('/').some(segment => segment === '' || segment === '.' || segment === '..')
  ) return null;
  return normalized;
}

function isTestFile(path: string): boolean {
  return /(?:^|\/)(?:tests?|__tests__)\//u.test(path)
    || /\.(?:test|spec)\.[^/]+$/u.test(path);
}

function isExecutableSourceFile(path: string): boolean {
  return /\.(?:[cm]?[jt]sx?|py|rb|php|java|kt|kts|cs|fs|fsx|go|rs|swift|scala|c|cc|cpp|cxx|h|hpp)$/u.test(path);
}

/**
 * Derive the finalizer's bounded test manifest from approved task scope and
 * host-attributed result paths. Worker prose and shell commands are never
 * executable authority here.
 */
export function deriveScopedSelfAuditManifest(
  tasks: readonly Task[],
  results: readonly TaskResult[],
): ScopedSelfAuditManifest {
  const paths = new Set<string>();
  const evidenceRefs = new Set<string>();
  for (const task of tasks) {
    for (const candidate of task.scope.filesWrite) {
      const normalized = normalizeScopedAuditPath(candidate);
      if (normalized) paths.add(normalized);
    }
    evidenceRefs.add(`task-scope:${task.id}`);
  }
  for (const result of results) {
    for (const candidate of result.filesChanged ?? []) {
      const normalized = normalizeScopedAuditPath(candidate);
      if (normalized) paths.add(normalized);
    }
    if (result.workAttribution?.state === 'VERIFIED') {
      evidenceRefs.add(`work-attribution:${result.taskId}:${result.workAttribution.attemptId}`);
    }
  }
  const ordered = [...paths].sort();
  const testFiles = ordered.filter(isTestFile);
  const executableSources = ordered.filter(path => isExecutableSourceFile(path) && !isTestFile(path));
  return {
    testFiles,
    requiresTests: executableSources.length > 0,
    requiresTypeScript: ordered.some(path => /\.[cm]?tsx?$/u.test(path)),
    evidenceRefs: [...evidenceRefs].sort(),
  };
}

interface BoundedCommandResult {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly timedOut: boolean;
}

async function runBoundedCommand(
  command: string,
  args: readonly string[],
  cwd: string,
  timeoutMs: number,
): Promise<BoundedCommandResult> {
  const { spawn } = await import('node:child_process');
  return await new Promise<BoundedCommandResult>((resolveCommand, rejectCommand) => {
    const child = spawn(command, [...args], {
      cwd,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    child.stdout.on('data', chunk => { stdout += String(chunk); });
    child.stderr.on('data', chunk => { stderr += String(chunk); });
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);
    child.once('error', error => {
      clearTimeout(timeout);
      rejectCommand(error);
    });
    child.once('close', status => {
      clearTimeout(timeout);
      resolveCommand({ status, stdout, stderr, timedOut });
    });
  });
}

/** Bounded deadline for a scoped registry-executed audit run. */
const SCOPED_SELF_AUDIT_TIMEOUT_MS = 120_000;

/**
 * Ecosystem assumed when a direct caller supplies no explicit value. Production
 * ingress (finalizeSprint) always resolves the real project ecosystem instead.
 */
const DEFAULT_SELF_AUDIT_ECOSYSTEM = 'vitest';

/**
 * Adapters shipped with deckent. Registration only — command selection and
 * output parsing stay inside the adapters.
 */
export function createDefaultSelfAuditRegistry(): SelfAuditAdapterRegistry {
  const registry = new SelfAuditAdapterRegistry();
  registry.register(new VitestSelfAuditAdapter());
  return registry;
}

/**
 * Resolve the audit ecosystem from the canonical project stack detector. An
 * undetectable stack stays honest: the registry has no adapter for `unknown`
 * and the gate holds instead of reporting a green suite it never ran.
 */
export function resolveSelfAuditEcosystem(projectRoot: string): string {
  try {
    return detectProjectStack(projectRoot).testFramework;
  } catch (e) {
    debugLog('resolveSelfAuditEcosystem', `stack detection failed: ${e}`);
    return 'unknown';
  }
}

/** Translate a registry outcome into the gate's vitest-slot evidence. */
function mapAdapterResultToGateEvidence(
  result: AdapterSelfAuditResult,
  request: SelfAuditRequest,
): SelfAuditResult['vitest'] {
  const testFiles = request.scope.kind === 'scoped' ? [...request.scope.testFiles] : [];
  const holdEvidence = (
    reasonCode: SelfAuditExecutionReasonCode,
    holdDetail: string,
    adapterId?: string,
    timedOut = false,
  ): SelfAuditResult['vitest'] => ({
    status: 'FAIL',
    delta: { files: 0, pass: 0, fail: 0, skipped: 0 },
    execution: {
      mode: 'scoped',
      command: [],
      testFiles,
      executed: false,
      timedOut,
      exitCode: null,
      reasonCode,
      holdDetail,
      ...(adapterId === undefined ? {} : { adapterId }),
    },
  });

  if (result.kind === 'unsupported') {
    return holdEvidence(
      'ECOSYSTEM_UNSUPPORTED',
      `No self-audit adapter supports ecosystem '${result.ecosystem}'`,
    );
  }
  if (result.kind === 'hold') {
    return holdEvidence(
      result.reason === 'missing-executed-evidence'
        ? 'EXECUTION_EVIDENCE_UNPARSEABLE'
        : 'ADAPTER_HOLD',
      `${result.reason}: ${result.detail}`,
      result.adapterId,
      result.reason === 'execution-timeout',
    );
  }

  const { evidence } = result;
  const unit = (kind: string): number =>
    evidence.executedUnits.find(candidate => candidate.kind === kind)?.count ?? 0;
  const executedAssertions = unit('assertion');
  const failedAssertions = unit('failed-assertion');
  return {
    status: result.outcome === 'passed' ? 'PASS' : 'FAIL',
    delta: {
      files: unit('file'),
      pass: executedAssertions - failedAssertions,
      fail: failedAssertions,
      skipped: unit('skipped-assertion'),
    },
    execution: {
      mode: 'scoped',
      command: [evidence.invocation.executable, ...evidence.invocation.argv],
      testFiles,
      executed: true,
      timedOut: false,
      exitCode: evidence.exitCode,
      adapterId: evidence.adapterId,
      outputDigest: evidence.outputDigest,
    },
  };
}

/**
 * Options for dependency injection in runSelfAuditGate.
 * Allows tests to override shell commands and filesystem access.
 */
export interface SelfAuditGateOptions {
  /** Override tsc execution (for testing) */
  runTsc?: (projectRoot: string) => { status: number; stdout: string; stderr: string };
  /** Override vitest execution (for testing) */
  runVitest?: (projectRoot: string) => { status: number; stdout: string; stderr: string };
  /** Finalizer-only bounded manifest. Absence means an explicit full audit surface. */
  scopedManifest?: ScopedSelfAuditManifest;
  /** Async scoped runner seam; receives shell-free argv. */
  runScopedCommand?: (
    command: string,
    args: readonly string[],
    projectRoot: string,
    timeoutMs: number,
  ) => Promise<BoundedCommandResult>;
  /** Scoped-mode adapter registry. Defaults to the shipped adapter set. */
  selfAuditRegistry?: SelfAuditAdapterRegistry;
  /** Scoped-mode ecosystem id. Production ingress resolves it from the project stack. */
  selfAuditEcosystem?: string;
  /** Override honesty check results (for testing) */
  honestyResults?: Array<{ taskId: string; violation: boolean }>;
  /** Override metrics.jsonl path check (for testing) */
  metricsJsonlPath?: string;
}

export async function runSelfAuditGate(
  sprintId: string,
  projectRoot?: string,
  options?: SelfAuditGateOptions,
): Promise<SelfAuditResult> {
  const root = projectRoot ?? process.cwd();

  // ── Step 1: tsc --noEmit (timeout 90s) ──────────────────────────
  let tscResult: SelfAuditResult['tsc'];
  try {
    const tscRun = options?.runTsc
      ? options.runTsc(root)
      : options?.scopedManifest && !options.scopedManifest.requiresTypeScript
        ? { status: 0, stdout: '', stderr: '' }
        : options?.scopedManifest
          ? await (options.runScopedCommand ?? runBoundedCommand)(
            'npx', ['tsc', '--noEmit'], root, 30_000,
          )
          : spawnSync('npx', ['tsc', '--noEmit'], {
          cwd: root,
          timeout: 30_000,
          stdio: ['pipe', 'pipe', 'pipe'],
          encoding: 'utf-8',
          });

    if (tscRun.status === 0) {
      tscResult = { status: 'PASS', errors: [] };
    } else {
      const output = ((tscRun.stdout ?? '') + (tscRun.stderr ?? '')).trim();
      const errors = output
        .split('\n')
        .filter(line => line.includes('error TS'))
        .slice(0, 20);
      tscResult = { status: 'FAIL', errors };
    }
  } catch (e) {
    tscResult = { status: 'FAIL', errors: [`tsc execution failed: ${e}`] };
  }
  debugLog('runSelfAuditGate:tsc', `status=${tscResult.status} errors=${tscResult.errors.length}`);

  // ── Step 2: vitest run (timeout 300s) + baseline delta ──────────
  let vitestResult: SelfAuditResult['vitest'];
  try {
    const scopedManifest = options?.scopedManifest;
    if (scopedManifest && scopedManifest.testFiles.length === 0) {
      const required = scopedManifest.requiresTests;
      vitestResult = {
        status: required ? 'FAIL' : 'PASS',
        delta: { files: 0, pass: 0, fail: 0, skipped: 0 },
        execution: {
          mode: 'scoped',
          command: [],
          testFiles: [],
          executed: false,
          timedOut: false,
          exitCode: null,
          reasonCode: required ? 'REQUIRED_TEST_MANIFEST_EMPTY' : 'NO_TEST_REQUIRED',
        },
      };
    } else if (scopedManifest) {
      // Scoped surface: the adapter registry is the single authority for the
      // command and for the executed-count evidence that may turn the gate green.
      const request: SelfAuditRequest = {
        ecosystem: options?.selfAuditEcosystem ?? DEFAULT_SELF_AUDIT_ECOSYSTEM,
        projectRoot: root,
        scope: { kind: 'scoped', testFiles: [...scopedManifest.testFiles] },
        timeoutMs: SCOPED_SELF_AUDIT_TIMEOUT_MS,
      };
      const runScoped = options?.runScopedCommand ?? runBoundedCommand;
      const execute: SelfAuditExecutor = async invocation => {
        const run = await runScoped(
          invocation.executable, invocation.argv, invocation.cwd, invocation.timeoutMs,
        );
        return {
          exitCode: run.status,
          stdout: run.stdout,
          stderr: run.stderr,
          timedOut: run.timedOut,
        };
      };
      const registry = options?.selfAuditRegistry ?? createDefaultSelfAuditRegistry();
      vitestResult = mapAdapterResultToGateEvidence(await registry.run(request, execute), request);
    } else {
      const vitestRun = options?.runVitest
        ? options.runVitest(root)
        : spawnSync('npx', ['vitest', 'run', '--reporter=basic'], {
          cwd: root,
          timeout: 120_000,
          stdio: ['pipe', 'pipe', 'pipe'],
          encoding: 'utf-8',
        });

      const vitestOutput = ((vitestRun.stdout ?? '') + (vitestRun.stderr ?? '')).trim();
      const current = parseVitestBaseline(vitestOutput);

      // Explicit `deckent audit` full-authority surface: unchanged historical
      // net-new baseline comparison over the whole repository suite.
      const baseline = readBaseline(root, sprintId);

      const delta = baseline != null && current != null
        ? {
          files: current.files - baseline.files,
          pass: current.pass - baseline.pass,
          fail: current.fail - baseline.fail,
          skipped: current.skipped - baseline.skipped,
        }
        : { files: 0, pass: 0, fail: current?.fail ?? 0, skipped: 0 };

      const netNewFailures = baseline != null && current != null
        ? delta.fail
        : (current?.fail ?? 0);
      const vitestPassed = vitestRun.status === 0
        || (current != null && current.fail === 0)
        || netNewFailures <= 0;
      vitestResult = { status: vitestPassed ? 'PASS' : 'FAIL', delta };
    }
  } catch (e) {
    vitestResult = { status: 'FAIL', delta: { files: 0, pass: 0, fail: 0, skipped: 0 } };
    debugLog('runSelfAuditGate:vitest', `execution failed: ${e}`);
  }
  debugLog('runSelfAuditGate:vitest', `status=${vitestResult.status} delta.fail=${vitestResult.delta.fail}`);

  // ── Step 3: Honesty violations ──────────────────────────────────
  let honestyResult: SelfAuditResult['honesty'];
  if (options?.honestyResults) {
    const violations = options.honestyResults.filter(r => r.violation);
    honestyResult = {
      violations: violations.length,
      flaggedTasks: violations.map(r => r.taskId),
    };
  } else {
    const flaggedTasks: string[] = [];
    try {
      const tasksDir = join(root, '.tasks');
      // Async readdir — Sprint 139 async migration
      const tasksDirFiles = await fsPromises.readdir(tasksDir).catch(() => [] as string[]);
      const resultFiles = tasksDirFiles.filter(f => f.endsWith('.result'));
      for (const file of resultFiles) {
        try {
          // Async readFile — Sprint 139 async migration
          const raw = await fsPromises.readFile(join(tasksDir, file), 'utf-8');
          const result = JSON.parse(raw) as { taskId?: string; notes?: string };
          if (result.notes && containsHonestyTrigger(result.notes)) {
            if (options?.scopedManifest) {
              // Never launch a hidden second suite from the scoped finalizer.
              // The explicit honesty marker remains visible and fail-closed.
              flaggedTasks.push(result.taskId ?? file);
            } else {
              const taskBaseline = readBaseline(root, sprintId);
              if (taskBaseline) {
                const currentCapture = await captureVitestBaseline(root, 180_000);
                if (currentCapture && currentCapture.fail > taskBaseline.fail) {
                  flaggedTasks.push(result.taskId ?? file);
                }
              }
            }
          }
        } catch { /* skip unparseable result files */ }
      }
    } catch (e) {
      debugLog('runSelfAuditGate:honesty', `scan failed: ${e}`);
    }
    honestyResult = {
      violations: flaggedTasks.length,
      flaggedTasks,
    };
  }
  debugLog('runSelfAuditGate:honesty', `violations=${honestyResult.violations}`);

  // ── Step 4: Observability — metrics.jsonl check (async) ─────────
  const metricsPath = options?.metricsJsonlPath ?? join(root, '.deckent', 'metrics.jsonl');
  let observabilityResult: SelfAuditResult['observability'];
  // Async readFile — Sprint 139 async migration (replaces existsSync + readFileSync)
  try {
    const content = await fsPromises.readFile(metricsPath, 'utf-8');
    const lineCount = content.split('\n').filter(l => l.trim().length > 0).length;
    observabilityResult = { metricsJsonlExists: true, lineCount };
  } catch {
    observabilityResult = { metricsJsonlExists: false, lineCount: 0 };
    debugLog('runSelfAuditGate:observability', 'WARNING: metrics.jsonl not found');
  }

  // ── Overall Gate Decision ───────────────────────────────────────
  const overallGate: 'PASS' | 'GATE_FAILURE' =
    tscResult.status === 'FAIL' ||
    vitestResult.status === 'FAIL' ||
    honestyResult.violations > 0
      ? 'GATE_FAILURE'
      : 'PASS';

  debugLog('runSelfAuditGate', `overallGate=${overallGate} sprint=${sprintId}`);

  return {
    tsc: tscResult,
    vitest: vitestResult,
    honesty: honestyResult,
    observability: observabilityResult,
    overallGate,
  };
}


// ═══ Gate Status Propagation ══════════════════════════════════════

/**
 * Apply self-audit gate result to sprint status.
 * If gate fails (GATE_FAILURE), overrides currentStatus with GO_WITH_GATE_FAILURE.
 * PASS and WARNING gates leave status unchanged.
 */
export function applyGateStatus(currentStatus: string, gate: Pick<SelfAuditResult, 'overallGate'>): string {
  if (gate.overallGate === 'GATE_FAILURE') {
    return GO_WITH_GATE_FAILURE;
  }
  return currentStatus;
}


// ═══ Adaptive Thresholds ══════════════════════════════════════════

/**
 * Pure helper for the coverage aspirational auto-learn step (Sprint 179 W2-4).
 *
 * Returns the new aspirational coverage target given the current target,
 * the immutable hard floor, and recent avg coverage. The hard floor is
 * never mutated — the result is always clamped at `>= hardFloor`.
 *
 * Lowering rule (mirrors pre-split behavior): when avg coverage drops
 * below 70 and is positive, lower aspirational to round(avg). Otherwise
 * no change. The clamp prevents the EVALUATE gate from ever sliding
 * below `hardFloor`.
 */
export function computeAdjustedAspirational(input: {
  currentAspirational: number;
  hardFloor: number;
  avgCoverage: number;
}): { newAspirational: number; changed: boolean } {
  const { currentAspirational, hardFloor, avgCoverage } = input;
  if (avgCoverage <= 0 || avgCoverage >= 70) {
    return { newAspirational: currentAspirational, changed: false };
  }
  const proposed = Math.round(avgCoverage);
  const clamped = Math.max(proposed, hardFloor);
  return {
    newAspirational: clamped,
    changed: clamped !== currentAspirational,
  };
}

/**
 * Auto-adjust agent_min_score and coverage_aspirational based on recent sprint stats.
 * Reads .brain/sprints/ files, computes NO_GO rate and avg coverage,
 * then writes updated values to .deckent/config.json and appends a note to RETRO.md.
 *
 * Rules:
 * - NO_GO rate > no_go_threshold → agent_min_score decremented (min 1)
 * - NO_GO rate < 10% → agent_min_score incremented (max 10)
 * - avg coverage < 70% → coverage_aspirational lowered to avg (clamped at coverage_hard_floor)
 * - coverage_hard_floor is immutable; auto-learn never touches it
 * - Requires min_samples sprints before any adjustment
 */
export async function applyAdaptiveThresholds(projectRoot: string, config: ResolvedConfig, sprintId?: string): Promise<void> {
  const ac = config.adaptive_config;
  const stats = await getRecentSprintStats(projectRoot, ac.coverage_lookback);

  if (stats.sprintCount < ac.min_samples) {
    debugLog('applyAdaptiveThresholds', `Not enough sprints (${stats.sprintCount}/${ac.min_samples}) — skipping`);
    return;
  }

  const changes: string[] = [];
  const configPath = join(projectRoot, '.deckent', 'config.json');
  // Async config read — Sprint 139 async migration
  const rawCfg: Record<string, unknown> = await (async () => {
    try {
      return JSON.parse(await fsPromises.readFile(configPath, 'utf-8')) as Record<string, unknown>;
    } catch {
      return {};
    }
  })();

  // Adjust agent_min_score based on NO_GO rate
  const currentScore = config.agent_min_score;
  let newScore = currentScore;
  if (stats.avgNoGoRate > ac.no_go_threshold && currentScore > 1) {
    newScore = currentScore - 1;
  } else if (stats.avgNoGoRate < 0.1 && currentScore < 10) {
    newScore = currentScore + 1;
  }
  if (newScore !== currentScore) {
    rawCfg['agent_min_score'] = newScore;
    changes.push(`agent_min_score ${currentScore} => ${newScore} (NO_GO rate: ${(stats.avgNoGoRate * 100).toFixed(1)}%)`);
    debugLog('applyAdaptiveThresholds', changes.at(-1));
  }

  // Adjust coverage_aspirational based on avg coverage — Sprint 179 W2-4.
  // The hard floor (immutable EVALUATE gate) is never written; the helper
  // clamps the new aspirational to `>= hard_floor`.
  // Defensive defaults: config-types marks both fields optional on
  // ResolvedConfig and instructs consumers to `?? <default>` (50 / 90).
  const currentAspirational = config.coverage_aspirational ?? 90;
  const hardFloor = config.coverage_hard_floor ?? 50;
  const adjustment = computeAdjustedAspirational({
    currentAspirational,
    hardFloor,
    avgCoverage: stats.avgCoverage,
  });
  if (adjustment.changed) {
    rawCfg['coverage_aspirational'] = adjustment.newAspirational;
    // Mirror to the legacy field so unmigrated consumers stay in sync.
    rawCfg['coverage_threshold'] = adjustment.newAspirational;
    changes.push(
      `coverage_aspirational ${currentAspirational} => ${adjustment.newAspirational} ` +
      `(avg coverage: ${stats.avgCoverage.toFixed(1)}%, hard_floor: ${hardFloor})`,
    );
    debugLog('applyAdaptiveThresholds', changes.at(-1));
  }

  if (changes.length === 0) return;

  // Async write updated config — Sprint 139 async migration
  await fsPromises.writeFile(configPath, JSON.stringify(rawCfg, null, 2) + '\n');

  // Append adaptive-threshold notes to the sprint retro entry — B8 (DB-first).
  if (sprintId) {
    const adaptiveSection = '\n### Adaptive Threshold Changes\n'
      + changes.map(c => `- Adaptive: ${c}`).join('\n') + '\n';
    appendRetroSection(projectRoot, sprintId, '### Adaptive Threshold Changes', adaptiveSection);
  }
}


// ═══ Budgeted Decay (mode-independent) ════════════════════════════

/**
 * CORE-UNIFORMITY (slice 2): mode-independent budgeted brain-memory decay.
 *
 * Extracted from finalizeSprint so BOTH the sprint lifecycle AND the autonomous
 * per-item lifecycle (execute-dispatcher's `postItemLifecycle`) share a single
 * decay path — sprint-coupling resolved. Audits the brain budget; when OVER it
 * forces a decay, otherwise runs the normal (budget-gated) decay.
 *
 * Self-contained + fail-safe: never throws (errors are debug-logged and swallowed),
 * so callers can invoke it inline without guarding. Behavior is identical to the
 * former inline finalizeSprint block; only the debug label differs.
 *
 * @param projectRoot - Project root directory
 * @param sprintId - Current sprint id (used for retention-window math in runDecay)
 * @param opts.memoryBudget - Brain memory budget in entries/lines (default 900)
 * @param opts.decaySprints - Retention window; MUST be the caller's
 *   `config.decay_after_sprints` (default 20). Dropping it regresses the Sprint 232
 *   memory-loss bug (runDecay silently falls back to a hardcoded 8).
 */
export function runBudgetedDecay(
  projectRoot: string,
  sprintId: string,
  opts?: { memoryBudget?: number; decaySprints?: number },
): void {
  try {
    const memBudget = opts?.memoryBudget ?? 900;
    const decayAfterSprints = opts?.decaySprints;
    const budgetAudit = auditBrainBudget(projectRoot, memBudget);
    if (budgetAudit.status === 'OVER') {
      debugLog('runBudgetedDecay', `Brain budget OVER: ${budgetAudit.decayableLines} decayable lines > ${memBudget} budget (${budgetAudit.permanentLines} permanent exempt, decay_after_sprints=${decayAfterSprints ?? 'default'})`);
      runDecay(projectRoot, sprintId, { force: true, memoryBudget: memBudget, decaySprints: decayAfterSprints });
    } else {
      runDecay(projectRoot, sprintId, { memoryBudget: memBudget, decaySprints: decayAfterSprints });
    }
  } catch (e) { debugLog('runBudgetedDecay', e); }
}

/**
 * ADR-090 doc-tracking sync hook. Gated on config.doc_tracking.sync_on_finalize
 * (default OFF — no surprise overhead). DB-only (no front-matter writes).
 * Fail-safe: any error is swallowed (debugLog) so it can never break finalize.
 */
export async function maybeRunDocTrackingSync(
  projectRoot: string,
  config: { doc_tracking?: { sync_on_finalize?: boolean } } | undefined,
): Promise<{ ran: boolean; count?: number }> {
  if (config?.doc_tracking?.sync_on_finalize !== true) return { ran: false };
  try {
    const { count } = await runDocTrackingSync(projectRoot);
    return { ran: true, count };
  } catch (e) {
    debugLog('finalizeSprint:docTrackingSync', e);
    return { ran: true };
  }
}


// ═══ Stale Handoff Pruning (B-HANDOFF-PRUNE — Sprint 331 331-006) ═

/**
 * B-HANDOFF-PRUNE (Sprint 331 331-006) — prune stale cross-sprint handoff files
 * at sprint finalize.
 *
 * `.tasks/handoffs/` is an append-only registry: every handoff ever written
 * stays on disk forever, so the directory grows without bound across sprints.
 * B-HANDOFF-STALE (Sprint 318) scoped the observability *summary* to the current
 * sprint, but the storage itself kept accumulating; this deletes the stale files
 * whose endpoints are BOTH outside the current sprint, leaving in-flight
 * (current-sprint) handoffs untouched.
 *
 * Non-blocking + fail-safe: derives the current-sprint task-id set from
 * `sprint.tasks` and delegates to `HandoffProtocol.pruneCompletedSprints` (the
 * membership rule + deletion live there, already unit-tested — not re-implemented
 * here). Any error is swallowed via debugLog so it can NEVER fail or block
 * finalize. Mirrors the other end-of-sprint storage-retention hooks
 * (runBudgetedDecay / cleanTasksArchive / sprintFileRetention).
 *
 * @param projectRoot - Project root directory (handoffs live under
 *   `<projectRoot>/.tasks/handoffs/`). Always the caller's root — never cwd.
 * @param sprint - The completed sprint; its `tasks[].id` are the in-flight set.
 * @returns the number of stale handoff files pruned (0 on any failure or empty registry).
 */
export function pruneStaleHandoffs(projectRoot: string, sprint: Sprint): number {
  try {
    const currentSprintTaskIds = new Set(sprint.tasks.map(t => t.id));
    return new HandoffProtocol(projectRoot).pruneCompletedSprints(currentSprintTaskIds);
  } catch (e) {
    debugLog('finalizeSprint:pruneStaleHandoffs', e);
    return 0;
  }
}


// ═══ KPI Usage Totals (Sprint 330 Task 8) ════════════════════════

// Opus-tier public per-token prices (USD). Estimate-only FALLBACK — applied per
// result only when that result carries no provider-reported `cost` (Sprint 332).
const OPUS_PRICE_INPUT_USD = 5e-6;
const OPUS_PRICE_OUTPUT_USD = 25e-6;
const OPUS_PRICE_CACHE_READ_USD = 0.5e-6;

/**
 * Per-result Opus-tier cost estimate (USD) from a result's token counts — the
 * conservative single-tier FALLBACK used only when a result reports no `cost.usd`.
 * Null-safe: a missing `tokenUsage` estimates to 0.
 */
function estimateResultCost(usage: TaskResult['tokenUsage']): number {
  if (!usage) return 0;
  return (
    (usage.inputTokens ?? 0) * OPUS_PRICE_INPUT_USD +
    (usage.outputTokens ?? 0) * OPUS_PRICE_OUTPUT_USD +
    (usage.cacheReadTokens ?? 0) * OPUS_PRICE_CACHE_READ_USD
  );
}

/**
 * Aggregate per-task usage across a sprint's results into the provider-agnostic
 * {@link UsageTotals} consumed by the KPI collection pipeline.
 *
 * Billing-authority-first: `result.cost.usd` is incremental billed/API spend,
 * while `result.cost.referenceUsd` retains catalog/provider-equivalent value for
 * subscription, free-tier and local attempts. A legacy result without the
 * separated reference field falls back to its historical cost or token estimate.
 *
 * Token counts are still summed across all results regardless of cost source.
 *
 * Pure + total + null-safe: a result with no `tokenUsage` and no `cost` contributes
 * 0 (so a sprint with no usage telemetry yields all-zero totals, never a crash), and
 * the function never throws.
 */
export function buildUsageTotals(
  results: readonly TaskResult[],
  tasks: readonly Task[] = [],
  defaultAuthMode?: 'subscription' | 'api' | 'hybrid',
): UsageTotals {
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheRead = 0;
  let costUsd = 0;
  let referenceCostUsd = 0;
  let unknownBillingTaskCount = 0;
  const tasksById = new Map(tasks.map(task => [task.id, task]));

  for (const result of results) {
    const usage = result.tokenUsage;
    if (usage) {
      inputTokens += usage.inputTokens ?? 0;
      outputTokens += usage.outputTokens ?? 0;
      cacheRead += usage.cacheReadTokens ?? 0;
    }

    // Reference value keeps provider/catalog equivalence; the legacy Opus-tier
    // estimate is used only when this result reports no cost authority.
    const reportedReferenceCost = result.cost?.referenceUsd ?? result.cost?.usd;
    const referenceCost = typeof reportedReferenceCost === 'number'
      && Number.isFinite(reportedReferenceCost)
      ? reportedReferenceCost
      : estimateResultCost(usage);
    referenceCostUsd += referenceCost;

    // KPI `cost_usd` means billed/API spend. Subscription, free-tier and
    // local regimes may retain a catalog-equivalent reference value for
    // comparison, but that value is never money owed.
    const task = tasksById.get(result.taskId);
    if (task) {
      const effectiveAuthMode = task.authMode ?? defaultAuthMode;
      const billingMode = resolveBillingModeForAuth(
        task.provider,
        effectiveAuthMode,
      ) ?? (effectiveAuthMode === undefined ? result.cost?.billingMode : undefined);
      if (billingMode === 'api') {
        const billedCost = result.cost?.usd;
        const billedEvidenceKnown = result.cost !== undefined
          && !result.cost.pricingSource.startsWith('unknown-model:')
          && !result.cost.pricingSource.startsWith('unknown-billing:')
          && !result.cost.pricingSource.startsWith('unverified-api-reference:');
        if (
          billedEvidenceKnown
          && typeof billedCost === 'number'
          && Number.isFinite(billedCost)
        ) {
          costUsd += billedCost;
        } else {
          unknownBillingTaskCount++;
        }
      }
      else if (billingMode === undefined) unknownBillingTaskCount++;
    } else {
      // Backward-compatible library/test path: absent task authority retains
      // the historical metered interpretation.
      costUsd += referenceCost;
    }
  }

  return tasks.length > 0
    ? {
        costUsd,
        referenceCostUsd,
        unknownBillingTaskCount,
        inputTokens,
        outputTokens,
        cacheRead,
      }
    : { costUsd, inputTokens, outputTokens, cacheRead };
}


// ═══ Canonical terminal truth projection (Sprint 486 task 486-007) ════════

export class FinalizerTerminalEvidenceError extends Error {
  constructor(readonly reasonCode: string) {
    super(reasonCode);
    this.name = 'FinalizerTerminalEvidenceError';
  }
}

export interface FinalizerLogicalMetrics {
  readonly totalTasks: number;
  readonly completedTasks: number;
  readonly techDebtTasks: number;
  readonly noGoTasks: number;
  readonly unevaluatedTasks: number;
  readonly coveragePercent: number;
}

export interface FinalizerTerminalTruth {
  readonly attempts: readonly ExactAttemptEvidence<TaskResult>[];
  readonly terminalEvidence: SprintTerminalEvidence<TaskResult>;
  readonly logicalProgress: LogicalProgressProjection;
  readonly logicalMetrics: FinalizerLogicalMetrics;
  readonly logicalEvaluations: ReadonlyMap<string, TaskEvaluation>;
  readonly lineageUsage: readonly LineageUsageAuthorityAggregate[];
  readonly usageTotals: UsageTotals;
  readonly logicalSettlementDigest: string;
}

export interface FinalizerTerminalReceiptPublication {
  readonly receipt: SprintTerminalReceiptV1;
  readonly terminalEvidence: SprintTerminalEvidence<TaskResult>;
  readonly artifactPath: string;
}

interface PersistedSprintTerminalReceipt {
  readonly version: 1;
  readonly publicationState: SprintTerminalPublicationStateV1;
  readonly receipt: SprintTerminalReceiptV1;
  readonly terminalEvidence: Pick<
    SprintTerminalEvidence<TaskResult>,
    'version' | 'summary' | 'cleanupEligibility' | 'holds'
  >;
  readonly logicalProgress: LogicalProgressProjection;
  readonly lineageUsage: readonly LineageUsageAuthorityAggregate[];
  readonly writtenAt: string;
}

function canonicalJson(value: unknown): string {
  const normalize = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(normalize);
    if (item !== null && typeof item === 'object') {
      return Object.fromEntries(Object.entries(item as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, normalize(nested)]));
    }
    return item;
  };
  return JSON.stringify(normalize(value));
}

function sha256EvidenceRef(kind: string, value: unknown): string {
  return `${kind}:sha256:${createHash('sha256').update(canonicalJson(value)).digest('hex')}`;
}

function finiteNonNegative(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
}

function finiteCoverage(value: unknown): number {
  return Math.min(100, finiteNonNegative(value));
}

function asTerminalVerdict(
  evaluation: TaskEvaluation | undefined,
): 'DONE' | 'GO_WITH_TECH_DEBT' | 'NO_GO' | null {
  if (evaluation === TaskEvaluation.DONE
    || evaluation === TaskEvaluation.GO_WITH_TECH_DEBT
    || evaluation === TaskEvaluation.NO_GO) return evaluation;
  return null;
}

function logicalRootTaskId(taskId: string, tasksById: ReadonlyMap<string, Task>): string {
  let currentId = taskId;
  const seen = new Set<string>();
  while (!seen.has(currentId)) {
    seen.add(currentId);
    const parentId = tasksById.get(currentId)?.fixForTaskId;
    if (!parentId || !tasksById.has(parentId)) return currentId;
    currentId = parentId;
  }
  return currentId;
}

function lineageBillingAuthority(
  task: Task,
  rootResult: TaskResult | undefined,
  defaultAuthMode: 'subscription' | 'api' | 'hybrid' | undefined,
): LineageBillingAuthority {
  const effectiveAuthMode = task.authMode ?? defaultAuthMode;
  if (effectiveAuthMode === 'hybrid') return 'hybrid';
  const mode = resolveBillingModeForAuth(task.provider, effectiveAuthMode)
    ?? rootResult?.cost?.billingMode;
  if (mode === 'api') return 'metered';
  if (mode === 'subscription') return 'subscription';
  if (mode === 'local') return 'local';
  if (mode === 'free_tier') return 'free-tier';
  return 'unknown';
}

function terminalAttemptEvidence(
  tasks: readonly Task[],
  evaluations: ReadonlyMap<string, TaskEvaluation>,
  results: readonly TaskResult[],
): readonly ExactAttemptEvidence<TaskResult>[] {
  const tasksById = new Map(tasks.map(task => [task.id, task]));
  const resultsById = new Map(results.map(result => [result.taskId, result]));
  const candidateIds = new Set<string>([
    ...tasks.map(task => task.id),
    ...evaluations.keys(),
    ...results.map(result => result.taskId),
  ]);
  const identityFor = (taskId: string): ExactAttemptIdentity => {
    const work = projectAttributedTaskWork(resultsById.get(taskId));
    return { taskId, attemptId: work.attemptId ?? '' };
  };

  return [...candidateIds].sort().map(taskId => {
    const task = tasksById.get(taskId);
    const result = resultsById.get(taskId);
    const evaluation = evaluations.get(taskId);
    const verdict = asTerminalVerdict(evaluation);
    const identity = identityFor(taskId);
    const work = projectAttributedTaskWork(result);
    const parentId = task?.fixForTaskId;
    const supersedes = parentId && tasksById.has(parentId) ? identityFor(parentId) : null;

    const authority: ExactAttemptEvidence<TaskResult>['authority'] = verdict
      ? {
          state: 'TERMINAL',
          verdict,
          evidenceRef: sha256EvidenceRef('evaluation', { identity, verdict }),
        }
      : evaluation === undefined
        ? { state: 'UNKNOWN', reasonCode: 'FINAL_EVALUATION_UNAVAILABLE' }
        : { state: 'UNSETTLED', evidenceRef: sha256EvidenceRef('evaluation', { identity, evaluation }) };
    const resultEvidence: ExactAttemptEvidence<TaskResult>['result'] = !result
      ? { state: 'ABSENT' }
      : verdict
        ? {
            state: 'COMPLETE',
            verdict,
            evidenceRef: sha256EvidenceRef('task-result', result),
            payload: result,
          }
        : {
            state: 'PARTIAL',
            evidenceRef: sha256EvidenceRef('task-result', result),
            payload: result,
            reasonCode: 'FINAL_EVALUATION_UNAVAILABLE',
          };
    const attribution: ExactAttemptEvidence<TaskResult>['attribution'] = work.state === 'VERIFIED'
      ? {
          state: 'VERIFIED',
          evidenceRef: sha256EvidenceRef('work-attribution', result?.workAttribution),
          filesChanged: work.filesChanged,
          linesAdded: work.linesAdded,
          linesRemoved: work.linesRemoved,
        }
      : {
          state: work.state,
          reasonCode: work.reasonCode ?? 'ATTRIBUTION_AUTHORITY_UNAVAILABLE',
        };

    return {
      logicalTaskId: logicalRootTaskId(taskId, tasksById),
      identity,
      ...(supersedes ? { supersedes } : {}),
      authority,
      result: resultEvidence,
      attribution,
    };
  });
}

function buildLineageUsage(
  tasks: readonly Task[],
  results: readonly TaskResult[],
  attempts: readonly ExactAttemptEvidence<TaskResult>[],
  defaultAuthMode: 'subscription' | 'api' | 'hybrid' | undefined,
): readonly LineageUsageAuthorityAggregate[] {
  const tasksById = new Map(tasks.map(task => [task.id, task]));
  const resultsById = new Map(results.map(result => [result.taskId, result]));
  const roots = [...new Set(attempts.map(attempt => attempt.logicalTaskId))].sort();
  const authorityTasks = roots.map(id => {
    const task = tasksById.get(id);
    return {
      id,
      billingAuthority: task
        ? lineageBillingAuthority(task, resultsById.get(id), defaultAuthMode)
        : 'unknown' as const,
    };
  });
  const usageAttempts = attempts.map(attempt => {
    const result = attempt.result.state === 'COMPLETE' || attempt.result.state === 'PARTIAL'
      ? attempt.result.payload
      : undefined;
    const usage = result?.tokenUsage;
    const referenceCostUsd = finiteNonNegative(
      result?.cost?.referenceUsd ?? result?.cost?.usd ?? estimateResultCost(usage),
    );
    const rootTask = tasksById.get(attempt.logicalTaskId);
    const billingAuthority = rootTask
      ? lineageBillingAuthority(rootTask, resultsById.get(rootTask.id), defaultAuthMode)
      : 'unknown';
    const invoicedCost = billingAuthority === 'metered'
      && result?.cost
      && !result.cost.pricingSource.startsWith('unknown-model:')
      && !result.cost.pricingSource.startsWith('unknown-billing:')
      && !result.cost.pricingSource.startsWith('unverified-api-reference:')
      ? finiteNonNegative(result.cost.usd)
      : undefined;
    return {
      id: attempt.identity.attemptId,
      taskId: attempt.identity.taskId,
      ...(attempt.supersedes ? { fixForTaskId: attempt.supersedes.taskId } : {}),
      logicalRootTaskId: attempt.logicalTaskId,
      inputTokens: finiteNonNegative(usage?.inputTokens),
      outputTokens: finiteNonNegative(usage?.outputTokens),
      cacheReadTokens: finiteNonNegative(usage?.cacheReadTokens),
      cacheCreationTokens: finiteNonNegative(usage?.cacheCreationTokens),
      referenceCostUsd,
      ...(invoicedCost !== undefined ? { invoicedCostUsd: invoicedCost } : {}),
    };
  });
  return aggregateLineageUsageAuthority({ tasks: authorityTasks, attempts: usageAttempts });
}

function usageTotalsFromLineages(
  lineageUsage: readonly LineageUsageAuthorityAggregate[],
): UsageTotals {
  return lineageUsage.reduce<UsageTotals>((total, lineage) => ({
    inputTokens: total.inputTokens + lineage.tokenUsage.inputTokens,
    outputTokens: total.outputTokens + lineage.tokenUsage.outputTokens,
    cacheRead: total.cacheRead + lineage.tokenUsage.cacheReadTokens,
    costUsd: total.costUsd + (lineage.billedUsd.state === 'known' ? lineage.billedUsd.usd : 0),
    referenceCostUsd: (total.referenceCostUsd ?? 0) + lineage.referenceCostUsd,
    unknownBillingTaskCount: (total.unknownBillingTaskCount ?? 0)
      + (lineage.billedUsd.state === 'unknown' ? 1 : 0),
  }), {
    inputTokens: 0,
    outputTokens: 0,
    cacheRead: 0,
    costUsd: 0,
    referenceCostUsd: 0,
    unknownBillingTaskCount: 0,
  });
}

export function buildFinalizerTerminalTruth(input: {
  readonly tasks: readonly Task[];
  readonly evaluations: ReadonlyMap<string, TaskEvaluation>;
  readonly results: readonly TaskResult[];
  readonly defaultAuthMode?: 'subscription' | 'api' | 'hybrid';
  readonly coordinatorEvidence?: readonly CoordinatorTerminalEvidence[];
}): FinalizerTerminalTruth {
  const attempts = terminalAttemptEvidence(input.tasks, input.evaluations, input.results);
  const terminalEvidence = assembleSprintTerminalEvidence({
    attempts,
    coordinatorEvidence: input.coordinatorEvidence ?? [],
  });
  const roots = new Set(attempts.map(attempt => attempt.logicalTaskId));
  const progressResult = projectLogicalProgress({
    attempts: attempts.map(attempt => ({
      id: attempt.identity.taskId,
      logicalTaskId: attempt.logicalTaskId,
      status: attempt.authority.state === 'TERMINAL'
        ? attempt.authority.verdict === 'NO_GO' ? 'blocked' : 'done'
        : 'active',
      ...(attempt.supersedes
        ? { fixForAttemptId: attempt.supersedes.taskId }
        : {}),
    })),
    denominator: { kind: 'logical-task', total: roots.size },
  });
  if (!progressResult.ok) {
    throw new FinalizerTerminalEvidenceError(progressResult.diagnostic);
  }

  const resultsByTaskId = new Map(input.results.map(result => [result.taskId, result]));
  const currentCoverage = terminalEvidence.logicalTasks.reduce((sum, logicalTask) => {
    const taskId = logicalTask.resolvingAttempt?.taskId
      ?? logicalTask.attempts.at(-1)?.taskId;
    return sum + finiteCoverage(taskId ? resultsByTaskId.get(taskId)?.coverage : undefined);
  }, 0);
  const coveragePercent = progressResult.projection.total > 0
    ? currentCoverage / progressResult.projection.total
    : 0;
  const logicalEvaluations = new Map<string, TaskEvaluation>();
  for (const logicalTask of terminalEvidence.logicalTasks) {
    if (logicalTask.state === 'COMPLETED') {
      const completed = terminalEvidence.completed.find(
        item => item.logicalTaskId === logicalTask.logicalTaskId,
      );
      logicalEvaluations.set(
        logicalTask.logicalTaskId,
        completed?.verdict === 'GO_WITH_TECH_DEBT'
          ? TaskEvaluation.GO_WITH_TECH_DEBT
          : TaskEvaluation.DONE,
      );
    } else if (logicalTask.state === 'FAILED') {
      logicalEvaluations.set(logicalTask.logicalTaskId, TaskEvaluation.NO_GO);
    }
  }
  const techDebtTasks = [...logicalEvaluations.values()]
    .filter(value => value === TaskEvaluation.GO_WITH_TECH_DEBT).length;
  const lineageUsage = buildLineageUsage(
    input.tasks,
    input.results,
    attempts,
    input.defaultAuthMode,
  );
  const usageTotals = usageTotalsFromLineages(lineageUsage);
  const logicalMetrics: FinalizerLogicalMetrics = {
    totalTasks: progressResult.projection.total,
    completedTasks: progressResult.projection.done,
    techDebtTasks,
    noGoTasks: progressResult.projection.blocked,
    unevaluatedTasks: progressResult.projection.active,
    coveragePercent: Number.isFinite(coveragePercent) ? coveragePercent : 0,
  };
  const logicalSettlementDigest = createHash('sha256').update(canonicalJson({
    terminalEvidence,
    logicalProgress: progressResult.projection,
    lineageUsage,
  })).digest('hex');
  return {
    attempts,
    terminalEvidence,
    logicalProgress: progressResult.projection,
    logicalMetrics,
    logicalEvaluations,
    lineageUsage,
    usageTotals,
    logicalSettlementDigest,
  };
}

export function publishFencedSprintTerminalReceipt(input: {
  readonly projectRoot: string;
  readonly sprint: Sprint;
  readonly truth: FinalizerTerminalTruth;
  readonly runId?: string;
  readonly coordinatorGeneration?: number;
  readonly now?: () => string;
}): FinalizerTerminalReceiptPublication {
  const exactAttemptsSettled = input.truth.terminalEvidence.logicalTasks.every(
    logicalTask => logicalTask.state === 'COMPLETED' || logicalTask.state === 'FAILED',
  )
    && input.truth.terminalEvidence.activeOrUnsettledAttempts.length === 0
    && input.truth.terminalEvidence.partialResults.length === 0
    && input.truth.terminalEvidence.holds.length === 0;
  if (!exactAttemptsSettled) {
    throw new FinalizerTerminalEvidenceError(
      `TERMINAL_EVIDENCE_${input.truth.terminalEvidence.cleanupEligibility.state}`,
    );
  }
  const recentWorksDir = join(input.projectRoot, RECENT_WORKS_DIR);
  mkdirSync(recentWorksDir, { recursive: true });
  const artifactPath = join(recentWorksDir, `${input.sprint.id}-terminal-receipt.json`);
  const existing = readJsonSafe<PersistedSprintTerminalReceipt>(artifactPath);
  const runId = input.runId ?? input.sprint.id;
  const coordinatorGeneration = input.coordinatorGeneration ?? 1;
  const state = existing?.publicationState ?? createSprintTerminalPublicationState({
    version: SPRINT_TERMINAL_PUBLICATION_VERSION,
    sprintId: input.sprint.id,
    runId,
    coordinatorGeneration,
    authorityVersion: 0,
  });
  const transitioned = transitionSprintTerminalPublication(state, {
    version: SPRINT_TERMINAL_PUBLICATION_VERSION,
    sprintId: input.sprint.id,
    runId,
    coordinatorGeneration,
    logicalSettlementDigest: input.truth.logicalSettlementDigest,
    priorAuthorityVersion: state.receipt?.priorAuthorityVersion ?? state.authorityVersion,
  });
  if (transitioned.decision === 'hold') {
    throw new FinalizerTerminalEvidenceError(`TERMINAL_PUBLICATION_${transitioned.reasonCode}`);
  }
  const receiptEvidence: CoordinatorTerminalEvidence = {
    evidenceId: 'sprint-terminal-receipt',
    kind: 'terminal-receipt',
    state: 'VERIFIED',
    evidenceRef: sha256EvidenceRef('terminal-receipt', transitioned.receipt),
    requiredForCleanup: true,
  };
  const terminalEvidence = assembleSprintTerminalEvidence({
    attempts: input.truth.attempts,
    coordinatorEvidence: [receiptEvidence],
  });
  const artifact: PersistedSprintTerminalReceipt = {
    version: 1,
    publicationState: transitioned.state,
    receipt: transitioned.receipt,
    terminalEvidence: {
      version: terminalEvidence.version,
      summary: terminalEvidence.summary,
      cleanupEligibility: terminalEvidence.cleanupEligibility,
      holds: terminalEvidence.holds,
    },
    logicalProgress: input.truth.logicalProgress,
    lineageUsage: input.truth.lineageUsage,
    writtenAt: input.now?.() ?? new Date().toISOString(),
  };
  const tempPath = `${artifactPath}.tmp-${process.pid}-${randomUUID()}`;
  writeFileSync(tempPath, JSON.stringify(artifact, null, 2) + '\n', 'utf-8');
  renameSync(tempPath, artifactPath);
  return { receipt: transitioned.receipt, terminalEvidence, artifactPath };
}


// ═══ KPI Forward-Collection Hook (Sprint 332 332-002) ═════════════

/**
 * Forward-collection hook: record the just-finalized sprint's 11 base KPI
 * measurements into `<projectRoot>/.brain/memory.db` at finalize time.
 *
 * Extracted from the inline finalizeSprint block (Sprint 332 332-002, fix #2) so
 * the success path is a first-class, independently unit-testable seam —
 * finalizeSprint itself spawns subprocesses (git diff + runSelfAuditGate → tsc/
 * vitest) and cannot be driven hermetically. The forward path is what makes a
 * sprint's KPIs carry REAL non-zero cost/tokens; the read-path backfill
 * (kpi-backfill.ts) only reconstructs zero-telemetry rows for sprints that were
 * never forward-collected, so a working forward hook is the SSOT for real numbers.
 *
 * NON-BLOCKING + fail-safe: any failure (DB locked/missing, compute error) is
 * swallowed via debugLog so it can NEVER block or fail finalize. SprintMetrics →
 * SprintMetricsLike field mapping is explicit (totalTasks→tasksTotal, etc.); tenant
 * is the Phase-1 'default'.
 *
 * @returns true when measurements were recorded; false when a throw was swallowed.
 */
export function recordSprintKpis(
  projectRoot: string,
  sprintId: string,
  metrics: Pick<SprintMetrics, 'totalTasks' | 'completedTasks' | 'noGoTasks' | 'boundaryViolations'>,
  results: readonly TaskResult[],
  tasks: readonly Task[] = [],
  defaultAuthMode?: 'subscription' | 'api' | 'hybrid',
  authoritativeUsage?: UsageTotals,
): boolean {
  try {
    recordKpiMeasurements(
      join(projectRoot, BRAIN_DIR, MEMORY_DB_FILE),
      sprintId,
      'default',
      {
        tasksTotal: metrics.totalTasks,
        tasksDone: metrics.completedTasks,
        noGo: metrics.noGoTasks,
        boundaryViolations: metrics.boundaryViolations,
      },
      results,
      authoritativeUsage ?? buildUsageTotals(results, tasks, defaultAuthMode),
    );
    return true;
  } catch (e) {
    debugLog('finalizeSprint:kpiCollection', e);
    return false;
  }
}


// ═══ Cumulative Spend Advisory (B6 — warn-only, never blocks) ═════
// DECKENT-TRIAGE-PLAN B6 / Sprint 333 333-005.

/**
 * Injectable advisory emitter — receives the {@link CostLimitWarnEvent} and
 * surfaces it (event stream, console, …). Injectable so the finalize hook is
 * hermetically unit-testable without the real event-stream writer / stdout.
 */
export type CostLimitAdvisoryEmitter = (event: CostLimitWarnEvent) => void;

/** Test seams + reference-time injection for {@link emitFinalizeSpendAdvisory}. */
export interface FinalizeSpendAdvisoryOptions {
  /** Override the advisory emitter (default: writeEvent + console.warn). */
  emit?: CostLimitAdvisoryEmitter;
  /** Override the spend-window reader (default: readSpendWindow over the resource ledger). */
  readSpend?: (root: string, window: 'day' | 'month') => number;
  /** Override the cost-config loader (default: loadCostConfig). */
  loadConfig?: (root: string) => CostConfig;
  /** Fixed reference timestamp (ISO) threaded into the default readSpendWindow. */
  now?: string;
}

/**
 * B6 (DECKENT-TRIAGE-PLAN) — cost-gate daily/monthly WARN-ONLY wire.
 *
 * At sprint finalize, project this sprint's realized cost on top of the
 * already-logged cumulative spend (daily + monthly windows from the resource
 * ledger) and, when `cost_limits.enforce_spend_gate` is enabled AND a window
 * limit is breached, EMIT a `BRAIN→USER:COST_LIMIT_WARN` advisory.
 *
 * VISIBILITY ONLY — warn-only, NON-BLOCKING. The HARD spend gate (turning
 * `enforce_spend_gate` into an actual block / `COST_GATE_EXCEEDED`) is a
 * deliberate POST-BETA follow-up (DECKENT-TRIAGE-PLAN B6 step 3) and is NOT
 * implemented here — finalize is never blocked or failed by this hook.
 *
 * The spend math is delegated ENTIRELY to readSpendWindow + checkSpendGate
 * (no re-implementation). READ-only against the spend ledger; the only write
 * is the advisory event itself (default emitter). When the flag is off (the
 * default) checkSpendGate returns null → zero side effects → finalize output
 * is byte-for-byte unchanged.
 *
 * NON-BLOCKING + fail-safe: the whole body is wrapped so any failure (ledger
 * missing, config parse error, emitter throw) is swallowed via debugLog and
 * can NEVER fail or block finalize. Mirrors the recordSprintKpis /
 * pruneStaleHandoffs end-of-sprint fail-safe seam pattern.
 *
 * @param projectRoot - Project root (resource ledger + cost-config live under it).
 * @param sprintId - Current sprint id (carried on the advisory event).
 * @param sprintCostUsd - This sprint's realized cost (buildUsageTotals(results).costUsd).
 * @param opts - Injectable test seams (emit / readSpend / loadConfig / now).
 * @returns the emitted advisory, or null when no breach / flag off / on error.
 */
export function emitFinalizeSpendAdvisory(
  projectRoot: string,
  sprintId: string,
  sprintCostUsd: number,
  opts?: FinalizeSpendAdvisoryOptions,
): CostLimitWarnEvent | null {
  try {
    const readSpend =
      opts?.readSpend ??
      ((root: string, window: 'day' | 'month'): number =>
        readSpendWindow(root, window, opts?.now ? { now: opts.now } : undefined));
    const loadConfig = opts?.loadConfig ?? ((root: string): CostConfig => loadCostConfig(root));

    const costConfig = loadConfig(projectRoot);

    // Delegate ALL spend math to checkSpendGate (flag-gated, pure). It returns
    // null when enforce_spend_gate is off (default) or both windows are within
    // limits — so the common path is a no-op.
    const warn = checkSpendGate({
      spentDayUsd: readSpend(projectRoot, 'day'),
      spentMonthUsd: readSpend(projectRoot, 'month'),
      sprintEstimateUsd: sprintCostUsd,
      costConfig,
    });
    if (!warn) return null;

    const emit =
      opts?.emit ??
      ((event: CostLimitWarnEvent): void => {
        // Default emitter — visibility only, both non-blocking:
        //   1. structured BRAIN→USER:COST_LIMIT_WARN event (dashboard / status tail / auditor).
        //      Channel is the literal event.type — no CHANNELS constant needed.
        //   2. console.warn so a CLI operator sees the advisory inline.
        writeEvent(projectRoot, sprintId, 'brain', 'user', event.type, { ...event, sprintId });
        console.warn(`⚠️  [cost-advisory] ${event.message}`);
      });
    emit(warn);
    return warn;
  } catch (e) {
    debugLog('finalizeSprint:spendAdvisory', e);
    return null;
  }
}


// ═══ Helper-call cost surfacing (MET668B / task 419-002) ══════════
//
// The haiku auxiliary-call cost ($0.0127 class — Brain's doc/summary helper turns) lands
// in each task's provider envelope `modelUsage` map but is dropped by the aggregate-only
// capture path (result-collector.ts, born-562 — untouchable), so `result.cost.usd` /
// `buildUsageTotals` cover the PRIMARY model only. This read-side wire re-prices the
// NON-primary (helper) models via the cost-ledger bridge and surfaces the delta — WITHOUT
// touching the capture contract, and WITHOUT folding into buildUsageTotals (which is pinned
// by the KPI tests and would then double-count). Best-effort + fail-safe: never blocks finalize.

/** Result of {@link collectHelperCost} — the previously off-ledger auxiliary-call cost. */
export interface HelperCostReport {
  /** Total USD of previously off-ledger auxiliary (helper) model calls this sprint. */
  helperUsd: number;
  /** The priced helper ledger (rows carry model + kind:'helper' + usd). */
  ledger: CostLedger;
  /** How many task envelopes contributed at least one helper (non-primary) entry. */
  envelopesWithHelper: number;
}

/** Injectable seams for {@link collectHelperCost} — used by hermetic tests. */
export interface CollectHelperCostOptions {
  /**
   * Per-task `modelUsage` reader. Default: best-effort parse of `.tasks/task-<id>.log`.
   * Return `undefined` when no envelope is available (never throw — the caller also guards).
   */
  readModelUsage?: (projectRoot: string, taskId: string) => ModelUsageMap | undefined;
  /** Override the cost-config loader (default: loadCostConfig). */
  loadConfig?: (root: string) => CostConfig;
}

const EMPTY_HELPER_LEDGER: CostLedger = { rows: [], totalUsd: 0, unpricedCount: 0 };

/**
 * Best-effort `modelUsage` extractor from a task's CLI `.log` envelope. Minimal + fail-safe:
 * tries the whole file as a single JSON envelope first (the `--output-format json` common
 * case), then scans line-by-line for a JSONL record carrying a `modelUsage` map; returns the
 * LAST such map found, or `undefined` on any failure. It deliberately does NOT reinvent the
 * full envelope parser (born-562) — an unreadable / multi-envelope-pretty-printed log simply
 * yields `undefined` (honest miss), which the caller treats as "no helper cost for this task".
 */
function readModelUsageFromLog(projectRoot: string, taskId: string): ModelUsageMap | undefined {
  try {
    const logPath = join(projectRoot, TASKS_DIR, `task-${taskId}.log`);
    if (!existsSync(logPath)) return undefined;
    const raw = readFileSync(logPath, 'utf-8');

    const asMap = (v: unknown): ModelUsageMap | undefined =>
      v !== null && typeof v === 'object' ? (v as ModelUsageMap) : undefined;

    // 1. Whole-file single JSON envelope (possibly pretty-printed).
    try {
      const whole = JSON.parse(raw) as { modelUsage?: unknown };
      const m = asMap(whole?.modelUsage);
      if (m) return m;
    } catch { /* not a single JSON object — fall through to JSONL scan */ }

    // 2. JSONL scan — last line carrying a modelUsage map wins.
    let found: ModelUsageMap | undefined;
    for (const line of raw.split('\n')) {
      const t = line.trim();
      if (!t.startsWith('{')) continue;
      try {
        const obj = JSON.parse(t) as { modelUsage?: unknown };
        const m = asMap(obj?.modelUsage);
        if (m) found = m;
      } catch { /* skip non-JSON line */ }
    }
    return found;
  } catch (e) {
    debugLog('collectHelperCost:readModelUsageFromLog', e);
    return undefined;
  }
}

/**
 * Aggregate the previously off-ledger helper-call cost across a sprint's results.
 *
 * For each result: read its provider envelope `modelUsage` map (best-effort), take the
 * PRIMARY model from `result.tokenUsage?.model` (the model already priced into
 * `result.cost.usd`), and price only the NON-primary models via {@link buildHelperLedger}
 * (double-count guard lives in extractHelperUsageEntries — an unresolvable primary emits
 * nothing). Per-result reads are individually guarded so one bad log cannot zero the rest;
 * the whole body is fail-safe (returns an all-zero report, never throws).
 */
export function collectHelperCost(
  projectRoot: string,
  results: readonly TaskResult[],
  opts?: CollectHelperCostOptions,
): HelperCostReport {
  try {
    const read = opts?.readModelUsage ?? readModelUsageFromLog;
    const loadConfig = opts?.loadConfig ?? ((root: string): CostConfig => loadCostConfig(root));
    const config = loadConfig(projectRoot);
    const ssot = loadBundledClaudePricing();

    const envelopes: HelperEnvelope[] = [];
    let envelopesWithHelper = 0;
    for (const r of results) {
      let modelUsage: ModelUsageMap | undefined;
      try {
        modelUsage = read(projectRoot, r.taskId);
      } catch (e) {
        debugLog('collectHelperCost:read', e);
        continue;
      }
      if (!modelUsage) continue;
      const primaryModel = r.tokenUsage?.model;
      envelopes.push({ primaryModel, modelUsage });
      // Presence check via the same guard (no pricing) — cheaper than a full per-result ledger.
      if (extractHelperUsageEntries(modelUsage, primaryModel, ssot).length > 0) envelopesWithHelper += 1;
    }

    const ledger = buildHelperLedger(envelopes, config, ssot);
    return { helperUsd: ledger.totalUsd, ledger, envelopesWithHelper };
  } catch (e) {
    debugLog('finalizeSprint:collectHelperCost', e);
    return { helperUsd: 0, ledger: EMPTY_HELPER_LEDGER, envelopesWithHelper: 0 };
  }
}


// ═══ Rich Completion Record (TERM5-FIN — sprint-427 task 1) ═══════
//
// Data-foundation for the design doc's "Ölecek / compatibility-only parçalar"
// row "Exit-code-only evaluate → Rich finalizer result'ıyla değiştirilir"
// (docs/analysis/term-flow-unify-design-2026-07-11.md). Purely additive: this
// record is appended as a NEW `completionRecord` key on the existing Step-13
// job-completion-summary artifact (`.deckent/runtime/jobs/<sprintId>.json`) —
// the artifact run-completion-watch.ts already polls/fs.watches, so no new
// mechanism is introduced. Later TERM5 tasks (2-6) correlate on `flowId`.

/** Per-verdict counts, independent of `SprintMetrics` (different shape/purpose). */
export interface CompletionVerdictSummary {
  done: number;
  techDebt: number;
  noGo: number;
}

/** One evaluated task's summary — a flat array entry, distinct from the
 *  existing keyed `evaluations` record (a future result-turn renderer wants
 *  an ordered list, not a map). SURF-3 result-evidence (born-697 successor):
 *  the file/test evidence fields carry the same numbers the keyed `evaluations`
 *  map already holds, so the terminal result-turn can render per-task evidence
 *  without re-reading N `.tasks/*.result` files — the job file (already watched)
 *  is enough. Additive: legacy job files lack these and parse to `undefined`. */
export interface CompletionTaskSummary {
  taskId: string;
  title: string;
  evaluation: TaskEvaluation;
  selfAssessment: string;
  /** Count of files this task changed (not the list — the terminal wants density). */
  filesChanged: number;
  linesAdded: number;
  linesRemoved: number;
  testsPassed: boolean;
  /** Test coverage percent (0 when the task ran no tests / reported none). */
  coverage: number;
  /** Host-owned work attribution; unavailable claims contribute zero work. */
  workAttributionState: 'VERIFIED' | 'HOLD' | 'UNAVAILABLE';
  attemptId: string | null;
  attributionReason: string | null;
}

export interface SprintCompletionRecord {
  /** Run-flow correlation id — present only when the caller threaded one in
   *  via `FinalizeSprintOptions.flowId` (absent for every current caller). */
  flowId?: string;
  verdictSummary: CompletionVerdictSummary;
  taskSummary: CompletionTaskSummary[];
  /** Exact attempts remain available even though taskSummary is logical-task scoped. */
  attemptEvidence?: readonly ExactAttemptEvidence<TaskResult>[];
  /** Host-authoritative usage aggregated once per logical lineage. */
  lineageUsage?: readonly LineageUsageAuthorityAggregate[];
  logicalProgress?: LogicalProgressProjection;
}

/**
 * Build the additive rich completion record from the same `evaluations` +
 * `resultsMap` already available at the Step-13 callsite (mirrors the
 * existing `richEvaluations` construction there). Pure — no I/O, no throw.
 */
export function buildSprintCompletionRecord(
  sprint: Sprint,
  evaluations: Map<string, TaskEvaluation>,
  resultsMap: Map<string, TaskResult>,
  flowId?: string,
  truth?: FinalizerTerminalTruth,
): SprintCompletionRecord {
  const verdictSummary: CompletionVerdictSummary = { done: 0, techDebt: 0, noGo: 0 };
  const taskSummary: CompletionTaskSummary[] = [];

  for (const [taskId, evaluation] of evaluations) {
    const task = sprint.tasks.find(t => t.id === taskId);
    const result = resultsMap.get(taskId);
    const work = projectAttributedTaskWork(result);
    taskSummary.push({
      taskId,
      title: task?.title ?? '',
      evaluation,
      selfAssessment: result?.selfAssessment ?? evaluation,
      filesChanged: work.filesChanged.length,
      linesAdded: work.linesAdded,
      linesRemoved: work.linesRemoved,
      testsPassed: result?.testsPassed ?? false,
      coverage: result?.coverage ?? 0,
      workAttributionState: work.state,
      attemptId: work.attemptId,
      attributionReason: work.reasonCode,
    });

    if (evaluation === TaskEvaluation.NO_GO) verdictSummary.noGo += 1;
    else if (evaluation === TaskEvaluation.GO_WITH_TECH_DEBT) verdictSummary.techDebt += 1;
    else if (evaluation === TaskEvaluation.DONE) verdictSummary.done += 1;
  }

  const record: SprintCompletionRecord = { verdictSummary, taskSummary };
  if (flowId) record.flowId = flowId;
  if (truth) {
    record.attemptEvidence = truth.attempts;
    record.lineageUsage = truth.lineageUsage;
    record.logicalProgress = truth.logicalProgress;
  }
  return record;
}


// ═══ Finalize Sprint ══════════════════════════════════════════════

/**
 * Run ALL post-sprint finalization actions. This function is idempotent-safe:
 * calling it multiple times with the same data won't corrupt state (MEMORY.md
 * may get duplicate entries if sprint learnings already exist, but trimming
 * keeps it within budget).
 *
 * Actions performed:
 * 1. Calculate metrics from evaluations + results
 * 2. Write sprint log to .brain/sprints/sprint-NNN.md
 * 3. Update MEMORY.md with sprint learnings (trimMemoryWithHeader)
 * 4. Write RETRO.md (writeRetrospective)
 * 5. (Legacy removed) Identity file write dropped in Memory V2 — identity is now DB-first,
 *    surfaced via managed .deckent/workspace/IDENTITY.md (ADR-046, B6).
 * 6. Update last_sprint_id in .deckent/config.json
 * 7. Run decay if over budget
 * 8. Run afterSprint plugin hooks
 * 9. Update project docs (doc-updaters registry)
 *
 * @param projectRoot - Project root directory
 * @param sprint - The completed sprint (must have tasks populated)
 * @param evaluations - Map of task ID to evaluation result
 * @param results - Array of worker task results
 * @param opts - Optional finalization settings
 * @returns The computed sprint metrics
 */
export async function finalizeSprint(
  projectRoot: string,
  sprint: Sprint,
  evaluations: Map<string, TaskEvaluation>,
  results: TaskResult[],
  opts?: FinalizeSprintOptions,
): Promise<SprintMetrics> {
  // Ensure observability is initialized (idempotent — safe to call multiple times)
  initObservability(projectRoot);

  // ─── SPRINT_PHASE_CHANGE: EXECUTE → EVALUATE ────────────────────
  // Brain broadcasts faz geçişini event stream'e yazar.
  // Tüm consumer'lar (auditor, dashboard, CLI) bu event'i okuyarak
  // sprint'in EVALUATE fazına girdiğini anlar (ADR-035 broadcast kanalı).
  const sprintIdForEvents = getCurrentSprintId(projectRoot) ?? sprint.id;
  writeEvent(
    projectRoot, sprintIdForEvents, 'brain', '*',
    CHANNELS.SPRINT_PHASE_CHANGE,
    { fromPhase: 'EXECUTE', toPhase: 'EVALUATE', sprintId: sprint.id, timestamp: new Date().toISOString() },
  );

  // Build O(1) lookup index from results array — eliminates O(n²) linear scans
  const resultsMap = buildResultsMap(results);

  // 0. Code-aware evaluation reconciliation (Sprint 136)
  // Check NO_GO tasks for the "Docker worker exited without writing result" pattern
  // and physically verify code on disk before finalizing the evaluation.
  const codeVerifiedTasks: string[] = [];
  for (const [taskId, evaluation] of evaluations) {
    if (evaluation !== TaskEvaluation.NO_GO) continue;
    try {
      const verifyResult = await tryCodeVerifiedDone(taskId, projectRoot);
      if (verifyResult.triggered && verifyResult.verified) {
        // Rewrite the evaluation to DONE
        evaluations.set(taskId, TaskEvaluation.DONE);
        // Write a proper result file
        await writeCodeVerifiedResult(taskId, projectRoot, verifyResult);
        // Update results array with synthetic result
        const existingIdx = results.findIndex(r => r.taskId === taskId);
        const syntheticResult = {
          taskId,
          workerId: 'brain-reconcile',
          filesChanged: verifyResult.verifiedFiles,
          linesAdded: 0,
          linesRemoved: 0,
          testsPassed: false,
          coverage: 0,
          selfAssessment: 'DONE' as const,
          notes: verifyResult.reason,
        };
        if (existingIdx >= 0) {
          results[existingIdx] = syntheticResult;
        } else {
          results.push(syntheticResult);
        }
        // Update resultsMap
        resultsMap.set(taskId, syntheticResult);
        codeVerifiedTasks.push(taskId);
        debugLog('finalizeSprint:codeReconcile', `Task ${taskId} reconciled to CODE_VERIFIED_DONE`);
      }
    } catch (e) {
      debugLog('finalizeSprint:codeReconcile', `Reconciliation failed for ${taskId}: ${e}`);
    }
  }
  if (codeVerifiedTasks.length > 0) {
    debugLog('finalizeSprint:codeReconcile', `${codeVerifiedTasks.length} tasks reconciled: ${codeVerifiedTasks.join(', ')}`);
  }

  // One canonical terminal projection owns every finalizer denominator. Exact
  // attempts remain on terminalTruth for evidence/usage, while downstream
  // task-shaped consumers receive only each lineage's resolving attempt under
  // its logical root id. This prevents original + FIX attempts from inflating
  // jobs, KPI measurements, coverage, or rich output.
  const terminalTruth = buildFinalizerTerminalTruth({
    tasks: sprint.tasks,
    evaluations,
    results,
    defaultAuthMode: opts?.config?.auth_mode,
  });
  const tasksById = new Map(sprint.tasks.map(task => [task.id, task]));
  const resultsById = new Map(results.map(result => [result.taskId, result]));
  const logicalTasks = terminalTruth.terminalEvidence.logicalTasks.flatMap(logicalTask => {
    const rootTask = tasksById.get(logicalTask.logicalTaskId);
    return rootTask ? [rootTask] : [];
  });
  const logicalResults = terminalTruth.terminalEvidence.logicalTasks.flatMap(logicalTask => {
    const resolvingTaskId = logicalTask.resolvingAttempt?.taskId
      ?? logicalTask.attempts.at(-1)?.taskId;
    const result = resolvingTaskId ? resultsById.get(resolvingTaskId) : undefined;
    return result ? [{ ...result, taskId: logicalTask.logicalTaskId }] : [];
  });
  const logicalResultsMap = buildResultsMap(logicalResults);
  const logicalSprint: Sprint = { ...sprint, tasks: logicalTasks };
  const logicalEvaluations = new Map(terminalTruth.logicalEvaluations);

  // 1. Calculate metrics — tech debt is read DB-first (Task #4d).
  const freshDebt = getDebtItems(projectRoot);
  const baseMetrics = calculateMetrics(
    logicalSprint,
    logicalEvaluations,
    logicalResults,
    freshDebt,
  );
  const metrics: SprintMetrics = {
    ...baseMetrics,
    ...terminalTruth.logicalMetrics,
  };
  sprint.metrics = metrics;

  // ─── KPI forward-collection hook (Sprint 330 Task 8; hardened 332-002) ──
  // Record the sprint's 11 base KPI measurements into memory.db. Extracted into
  // recordSprintKpis so the success path is an independently unit-testable seam
  // (finalizeSprint spawns subprocesses → not hermetically callable). Best-effort
  // + fail-safe: NEVER blocks or fails finalize; finalize behavior is unchanged.
  recordSprintKpis(
    projectRoot,
    sprint.id,
    metrics,
    logicalResults,
    logicalTasks,
    opts?.config?.auth_mode,
    terminalTruth.usageTotals,
  );

  // ─── Cumulative spend advisory (B6 — warn-only, Sprint 333 333-005) ──
  // Project this sprint's realized cost (buildUsageTotals → the same usage/cost
  // already aggregated for KPIs above) onto the rolling daily/monthly ledger spend
  // and, when cost_limits.enforce_spend_gate is on AND a window cap is breached,
  // EMIT a BRAIN→USER:COST_LIMIT_WARN advisory. Warn-only + NON-BLOCKING: the hook
  // is self-fail-safe (swallows every throw) and checkSpendGate is flag-gated
  // default-off, so the flag-off common path is a no-op and finalize is byte-for-byte
  // unchanged. The HARD spend gate (enforce_spend_gate as a real block) is a
  // deliberate POST-BETA follow-up — NOT flipped here.
  emitFinalizeSpendAdvisory(
    projectRoot,
    sprint.id,
    terminalTruth.usageTotals.costUsd,
  );

  // ─── METRIC_EMITTED: sprint summary metrics ──────────────────────
  // Emitted in parallel with metrics.jsonl so Auditor and Dashboard
  // get structured metric data without parsing the JSONL file.
  // ADR-035: BRAIN→*:METRIC_EMITTED is a broadcast channel.
  writeEvent(
    projectRoot, sprintIdForEvents, 'brain', '*',
    CHANNELS.METRIC_EMITTED,
    {
      name: 'sprint.summary',
      sprintId: sprint.id,
      totalTasks: metrics.totalTasks,
      completedTasks: metrics.completedTasks,
      techDebtTasks: metrics.techDebtTasks,
      noGoTasks: metrics.noGoTasks,
      durationMs: metrics.durationMs,
      coveragePercent: metrics.coveragePercent,
    },
  );

  // 2. Write sprint log
  try {
    writeSprintLog(projectRoot, sprint, metrics, evaluations);
  } catch (e) { debugLog('finalizeSprint:writeSprintLog', e); }

  // ─── SPRINT_PHASE_CHANGE: EVALUATE → RETRO ──────────────────────
  writeEvent(
    projectRoot, sprintIdForEvents, 'brain', '*',
    CHANNELS.SPRINT_PHASE_CHANGE,
    { fromPhase: 'EVALUATE', toPhase: 'RETRO', sprintId: sprint.id, timestamp: new Date().toISOString() },
  );

  // 3 + 4. Write RETRO.md and update MEMORY.md (writeRetrospective does both)
  // ─── ADR-046 Step 5 — retroWriter (dual write contract) ─────────
  // Sprint 168 C0a-3 (BUG-DD + BUG-EE): writeRetrospective MUST emit
  // both DB rows (`sprint-log-NNN`, `retro-sprint-NNN`, `mem-sprint-NNN`)
  // and `.brain/RETRO.md` in a single invocation. Pinned by
  // tests/orchestra/retro-dual-write.test.ts. Do NOT split the call
  // (Sprint 167 regression — DB+FS came out of sync when the wire was
  // partial). Unconditional invocation per ADR-046 §"Mimari Prensipler".
  debugLog('finalizeSprint:preRetro', `evaluations.size=${evaluations.size} keys=[${[...evaluations.keys()].join(',')}]`);
  let sprintLogPersisted = false;
  try {
    // Build skillMap from tasks for Skill Performance table in RETRO.md
    const skillMap = new Map<string, string[]>();
    for (const task of sprint.tasks) {
      if (task.assignedSkills && task.assignedSkills.length > 0) {
        skillMap.set(task.id, task.assignedSkills);
      }
    }
    // Sprint 192 Task 192-005: opt into createIfMissing so the chronic
    // Sprint 167+ DB-gap [[project_sprint167_db_gap]] cannot recur — even
    // a first-ever sprint on a fresh project now lands sprint-log + retro
    // + mem rows.
    const retroWriteResult = writeRetrospective(
      projectRoot, sprint, evaluations, metrics,
      undefined,
      skillMap.size > 0 ? skillMap : undefined,
      results,
      { createIfMissing: true },
    );
    sprintLogPersisted = retroWriteResult.sprintLogWritten;
    // Sprint 190 carry-over [[project_sprint189_retro_db_missing]]:
    // surface DB-write outcome so silent failures (Sprint 189 retro entry
    // missing while patterns landed) cannot recur unnoticed. Non-fatal.
    if (retroWriteResult.dbError) {
      debugLog('finalizeSprint:writeRetrospective:dbWrite',
        `Retro DB write failed for ${sprint.id} — ${retroWriteResult.dbError}`);
    } else if (retroWriteResult.dbAttempted &&
        (!retroWriteResult.sprintLogWritten || !retroWriteResult.retroWritten || !retroWriteResult.memoryWritten)) {
      debugLog('finalizeSprint:writeRetrospective:dbPartial',
        `Retro DB write partial for ${sprint.id} — sprintLog=${retroWriteResult.sprintLogWritten} ` +
        `retro=${retroWriteResult.retroWritten} memory=${retroWriteResult.memoryWritten}`);
    } else {
      debugLog('finalizeSprint:writeRetrospective:dbOk',
        `Retro DB rows persisted for ${sprint.id}`);
    }

    // Append Code-Verified DONE section to the retro entry — B8 (DB-first).
    if (codeVerifiedTasks.length > 0) {
      const section = [
        '',
        '### Code-Verified DONE',
        `${codeVerifiedTasks.length} task(s) reconciled via physical code verification:`,
        ...codeVerifiedTasks.map(id => `- ${id}: Code physically verified despite missing .result (docker HB shutdown pattern)`),
        '',
      ].join('\n');
      appendRetroSection(projectRoot, sprint.id, '### Code-Verified DONE', section);
    }
  } catch (e) { debugLog('finalizeSprint:writeRetrospective', e); }

  // ─── F1-TOK 273-004 retro wire — "Limit burn" row ────────────────
  // buildLimitBurnRow shipped + tested in Sprint 273 but was never called
  // from the retro path (0-caller dormant; found in the 2026-06-11
  // calibration analysis). Best-effort: ledger/transcript errors must
  // never block finalize.
  try {
    const limitBurnRow = await buildSprintLimitBurnRow(projectRoot, sprint.id, sprint.tasks.length);
    if (limitBurnRow) {
      const section = ['', '### Limit Burn', '', limitBurnRow, ''].join('\n');
      appendRetroSection(projectRoot, sprint.id, '### Limit Burn', section);
    }
  } catch (e) { debugLog('finalizeSprint:limitBurnRow', e); }

  // ─── MET668B (419-002) — helper-call cost + REAL files/cost retro wire ──
  // (a) Surface the previously off-ledger auxiliary (haiku helper) cost, priced from each
  //     task's envelope modelUsage minus the already-captured primary (double-count guarded).
  // (b) Render REAL files-changed/cost from the live `results` via the 418-001 seam
  //     (computeFilesChangedAndCost) — replacing the hardcoded-0 placeholders in the report.
  // Best-effort + fail-safe: never blocks finalize. Helper cost is kept SEPARATE from
  // buildUsageTotals/KPI (which stays primary-only) so it is added exactly once.
  try {
    const helper = collectHelperCost(projectRoot, results);
    if (helper.helperUsd > 0) {
      writeEvent(
        projectRoot, sprintIdForEvents, 'brain', '*',
        CHANNELS.METRIC_EMITTED,
        {
          name: 'sprint.helperCost', sprintId: sprint.id,
          helperUsd: helper.helperUsd,
          rows: helper.ledger.rows.length,
          unpriced: helper.ledger.unpricedCount,
        },
      );
    }
    const attributed = projectSprintWorkAttribution(results);
    const excluded = attributed.heldAttempts + attributed.unavailableAttempts;
    const section = buildFilesChangedCostSection(results, {
      helperCostUsd: helper.helperUsd,
      requireVerifiedAttribution: true,
      ...(excluded > 0
        ? {
            attributionWarning: getMessage(
              'finalize.attribution_excluded',
              opts?.config?.language ?? 'en',
              { count: String(excluded) },
            ),
          }
        : {}),
    });
    appendRetroSection(projectRoot, sprint.id, '## Files Changed & Cost', section);
  } catch (e) { debugLog('finalizeSprint:helperCostWire', e); }

  // Sprint 198 198-002 defensive fallback — guarantees a sprint-log DB
  // row even when writeRetrospective threw or its own try/catch returned
  // with sprintLogWritten=false. Closes the chronic finalize bug
  // surfaced in Sprint 197 197-002 (sprint-log-194 + sprint-log-196
  // missing). Minimal payload (sprintId + totalTasks + durationMs) is
  // enough for downstream retroactive reclassify to land a Task
  // Outcomes section in a future pass; full content is preferred but
  // optional. Silent failures are forbidden — log the error explicitly.
  if (!sprintLogPersisted) {
    try {
      const { MemoryStore } = await import('../core/memory-store.js');
      const { MEMORY_DB_FILE } = await import('../core/constants.js');
      const memDbPath = join(projectRoot, BRAIN_DIR, MEMORY_DB_FILE);
      if (existsSync(memDbPath)) {
        const store = new MemoryStore(memDbPath);
        try {
          store.upsertSprintLog(sprint.id, {
            totalTasks: metrics?.totalTasks,
            durationMs: metrics?.durationMs,
            extraTags: ['defensive-fallback'],
          });
          sprintLogPersisted = true;
          debugLog('finalizeSprint:sprintLogFallback',
            `Defensive sprint-log row written for ${sprint.id}`);
        } finally {
          store.close();
        }
      } else {
        debugLog('finalizeSprint:sprintLogFallback',
          `memory.db missing at ${memDbPath} — fallback skipped`);
      }
    } catch (e) {
      debugLog('finalizeSprint:sprintLogFallback',
        `Defensive sprint-log write failed for ${sprint.id} — ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // 5. Legacy identity-file write dropped — Memory V2, B6.
  // Identity is DB-first: the memory.db `identity` entry is the source of
  // truth, surfaced via the managed .deckent/workspace/IDENTITY.md doc.

  // 5b. Triple-link: sprint-log → memory → retro (depends_on chain)
  try {
    const { MemoryStore } = await import('../core/memory-store.js');
    const { MEMORY_DB_FILE } = await import('../core/constants.js');
    const memDbPath = join(projectRoot, BRAIN_DIR, MEMORY_DB_FILE);
    if (existsSync(memDbPath)) {
      const memStore = new MemoryStore(memDbPath);
      try {
        const sprintLogId = `sprint-log-${sprint.id}`;
        const memoryId = `memory-${sprint.id}`;
        const retroId = `retro-${sprint.id}`;

        // sprint-log depends_on memory, memory depends_on retro
        memStore.insertRelation(sprintLogId, memoryId, 'depends_on');
        memStore.insertRelation(memoryId, retroId, 'depends_on');
        // retro references sprint-log (circular awareness)
        memStore.insertRelation(retroId, sprintLogId, 'references');

        debugLog('finalizeSprint:tripleLink', `Triple-link created for ${sprint.id}`);
      } finally {
        memStore.close();
      }
    }
  } catch (e) { debugLog('finalizeSprint:tripleLink', e); }

  // 6. Update last_sprint_id in config
  try {
    updateLastSprintId(projectRoot, sprint.id);
  } catch (e) { debugLog('finalizeSprint:updateLastSprintId', e); }

  // 7. Run decay if over budget (uses auditBrainBudget for decayable-only accounting)
  // Sprint 232 PRIMARY fix: pass config.decay_after_sprints to runDecay so the
  // user-configured retention window (default 20) is honored. Previously the
  // option was dropped and runDecay fell back to a hardcoded 8 — too aggressive,
  // causing memory-loss across sprint-226/231 dogfood.
  if (!opts?.skipDecay) {
    // CORE-UNIFORMITY (slice 2): decay now flows through the mode-independent
    // runBudgetedDecay helper (shared with the autonomous per-item lifecycle).
    // Behavior unchanged — same audit → force/normal branching as before.
    runBudgetedDecay(projectRoot, sprint.id, {
      memoryBudget: opts?.config?.memory_budget ?? 900,
      decaySprints: opts?.config?.decay_after_sprints,
    });
  }

  // 7b. ADR-090 doc-tracking sync (gated, fail-safe — never breaks finalize)
  debugLog('finalizeSprint:breadcrumb', 'doc-tracking sync hook — entering');
  try {
    const dtRes = await maybeRunDocTrackingSync(projectRoot, opts?.config);
    if (dtRes.ran) debugLog('finalizeSprint:docTrackingSync', `synced ${dtRes.count ?? '?'} docs`);
  } catch (e) { debugLog('finalizeSprint:docTrackingSync', e); }

  // 8. Run afterSprint plugin hooks
  if (!opts?.skipHooks) {
    try {
      const ctx: AfterSprintContext = {
        hook: 'afterSprint',
        sprint,
        projectRoot,
      };
      await runHooks('afterSprint', ctx);
    } catch (e) { debugLog('finalizeSprint:afterSprintHook', e); }
  }

  // 8b. Update prompt-version stats for every routed task. Legacy V2 DNA
  // outcomes and V3 learning cells are separated below so no task is credited
  // twice and the live V3 router consumes only its own cell ledger.

  // F5 evolution wire (B11): record per-task use of each agent's CURRENT prompt
  // version so prompt-analytics / /api/evolution/prompt-metrics see real
  // uses/successRate (updateVersionStats was zero-caller → stats frozen at 0).
  // No-op for agents without a versioned prompt.
  const promptVersionMgr = new PromptVersionManager(projectRoot);

  // V2: Record outcomes to learnings.json (single source of truth).
  // Agent.json manifests are NOT touched here directly — stats live in
  // learnings.json and are synced to agent.json/manifest.json below (8d2).
  try {
    const { OutcomeTracker } = await import('./outcome-tracker.js');
    const { assessQuality } = await import('./quality-assessor.js');
    const tracker = new OutcomeTracker(projectRoot);

    // FINALIZE-RECOUNT guard (Sprint 268, 1b): recordOutcome appends
    // sprint.id to learnings.recentSprints on the first record and that
    // list is append-only — its presence is a durable "stats already
    // recorded for this sprint" marker. A re-finalize (`finalize --force`
    // on an already-finalized sprint) must NOT re-record: the sprint-267
    // live bug re-counted every task (uses+N) while archived results read
    // as missing/NO_GO (success+0). Corrections to a recorded sprint go
    // through tracker.reclassifyTaskOutcome instead of double-recording.
    // The downstream steps (rule evolution, manifest sync, promotions)
    // still run — they derive from accumulated learnings and are
    // idempotent on unchanged data.
    const statsAlreadyRecorded = tracker.getLearnings().recentSprints.includes(sprint.id);
    if (statsAlreadyRecorded) {
      debugLog('finalizeSprint:routing-outcomes',
        `Stats already recorded for ${sprint.id} — skipping re-record (idempotent re-finalize)`);
    } else {
      for (const task of sprint.tasks) {
        const evaluation = evaluations.get(task.id);
        if (!evaluation) continue;
        const taskResult = resultsMap.get(task.id);
        const learningEligible =
          taskResult !== undefined
          && taskResult.cascadeSkipped !== true
          && (
            evaluation === TaskEvaluation.DONE
            || evaluation === TaskEvaluation.GO_WITH_TECH_DEBT
            || evaluation === TaskEvaluation.NO_GO
          );
        if (!learningEligible) continue;
        // F5: record use against the agent's current prompt version (V2 path).
        if (task.assignedAgent) {
          promptVersionMgr.recordCurrentVersionUse(task.assignedAgent, evaluation);
        }

        // Quality assessment — multi-dimensional scoring beyond GO/NO_GO
        let qualityScore: number | undefined;
        if (taskResult) {
          try {
            const quality = assessQuality(task, taskResult, evaluation as unknown as string);
            qualityScore = quality.overall;
          } catch (e) { debugLog('finalizeSprint:assessQuality', e); }
        }

        // V2's DNA outcome ledger is legacy-only. Feeding V3 tasks into both
        // ledgers double-credited agents/skills and polluted a learner the live
        // router no longer consumes.
        if (task.routingMeta?.routingVersion !== 'v3') {
          tracker.recordOutcome({
            taskId: task.id,
            sprintId: sprint.id,
            taskDNA: (task.routingMeta?.taskDNA ?? { intent: { primary: 'unknown', secondary: [], confidence: 0 }, domains: [], operations: [], complexity: { fileCount: 0, moduleCount: 0, crossCutting: false, estimatedSize: 'small' }, scope: { writeRatio: {}, primaryWriteTarget: '', testWriteRatio: 0 } }) as TaskDNA,
            agentId: task.assignedAgent ?? null,
            skillIds: task.assignedSkills ?? [],
            evaluation: evaluation as unknown as 'DONE' | 'GO_WITH_TECH_DEBT' | 'NO_GO',
            coverage: taskResult?.coverage ?? 0,
            qualityScore,
            routingVersion: 'v2',
          });
        }

        // ROUTING-V3 learning cells (Slice-2): tasks routed by V3 also feed
        // the workType×domain×agent cell ledger — PER-TASK DNA by contract
        // (the tasks[0] class cannot recur), ghost-gated at the source.
        const v3Meta = task.routingMeta;
        if (v3Meta?.routingVersion === 'v3' && task.assignedAgent) {
          try {
            const { recordOutcome: recordCell } = await import('../core/routing/learning-cells.js');
            const { producePositional } = await import('../core/routing/requirement-vector.js');
            const { loadVocabulary } = await import('../core/routing/vocabulary.js');
            const vocabulary = await loadVocabulary(projectRoot);
            const positional = producePositional(task, { domains: vocabulary.domains });
            const dominantDomain = [...positional.domains].sort((a, b) => b.weight - a.weight)[0]?.id ?? 'core-runtime';
            recordCell(projectRoot, {
              taskId: task.id,
              sprintId: sprint.id,
              workType: (v3Meta.workType ?? 'build') as import('../core/routing/types.js').WorkType,
              domain: dominantDomain,
              agentId: task.assignedAgent,
              verdict: evaluation as unknown as 'DONE' | 'GO_WITH_TECH_DEBT' | 'NO_GO',
              quality: qualityScore ?? 50,
            });
          } catch (e) {
            debugLog('finalizeSprint:routing-cells', e);
          }
        }
      }
      debugLog('finalizeSprint:routing-outcomes', `Recorded ${sprint.tasks.length} routing outcomes to learnings.json`);
    }

    // 8d. Evolve routing rules from accumulated data
    try {
      const { RuleEvolver } = await import('./rule-evolver.js');
      const evolver = new RuleEvolver(tracker, projectRoot);
      const evolution = evolver.evolveRules();
      if (evolution.newRules.length > 0) {
        debugLog('finalizeSprint:rule-evolution', `${evolution.newRules.length} new rules evolved`);
        // Persist evolved rules in learnings AND standalone file
        tracker.saveEvolvedRules(evolution.newRules);
        evolver.saveRules(evolution.newRules);
      }
    } catch (e) { debugLog('finalizeSprint:ruleEvolution', e); }

    // 8d2. Sync V2 learnings → stats sidecar (.deckent/stats/catalog-stats.json), so
    // Dashboard/CLI see real stats without mutating the git-tracked agent.json /
    // manifest.json on every sprint (born-605 STATS-SIDECAR — the manifest write
    // here used to cause per-sprint repo-diff noise + a hermeticity/C5 violation).
    // AgentPoolManager.getAgent()/SkillPoolManager.getSkill() already overlay the
    // sidecar onto the loaded `stats` (unified read), so `stats` below starts from
    // whichever store currently holds the freshest value — including a first-ever
    // sidecar write, which therefore carries the manifest's prior history forward
    // instead of resetting it.
    try {
      const poolManager = new AgentPoolManager(projectRoot);
      const skillPoolManager = new SkillPoolManager(projectRoot);
      const learnings = tracker.getLearnings();

      for (const [agentId, perf] of Object.entries(learnings.agentPerformance)) {
        // Compute average coverage from task results for this agent — only results
        // that carry a REAL coverage measurement participate. A missing/undefined
        // `coverage` is a MEASUREMENT GAP, not a 0%, and must not dilute the average
        // (born-591 P0 phantom-zero-dilution fix) — neither in the numerator nor in
        // the sample count used to weight it.
        const agentTasks = sprint.tasks.filter(t => t.assignedAgent === agentId);
        const coveredResults = agentTasks
          .map(t => resultsMap.get(t.id))
          .filter((r): r is TaskResult => r != null && typeof r.coverage === 'number');
        let avgCov = 0;
        if (coveredResults.length > 0) {
          const totalCov = coveredResults.reduce((sum, r) => sum + r.coverage, 0);
          avgCov = totalCov / coveredResults.length;
        }

        // Build cumulative stats from learnings performance data
        const agent = poolManager.getAgent(agentId);
        if (agent) {
          const stats = agent.stats ?? { totalUses: 0, successRate: 0, avgCoverage: 0, lastUsedInSprint: '' };
          // Prior cumulative uses — captured BEFORE totalUses is overwritten below,
          // so it reflects the agent's real use count as of the last sprint (no
          // subtraction/algebra needed; born-591 P0 dilution fix).
          const prevTotal = stats.totalUses;
          stats.totalUses = perf.totalTasks;
          stats.successRate = perf.successRate;
          // Blend historical avg coverage with current-sprint coverage — weighted
          // ONLY by coverage-bearing results and normalized by (prior uses + new
          // coverage samples), NOT stats.totalUses (which would still count this
          // sprint's non-covered tasks and re-dilute the average).
          if (coveredResults.length > 0) {
            stats.avgCoverage = prevTotal > 0
              ? ((stats.avgCoverage * prevTotal) + (avgCov * coveredResults.length)) / (prevTotal + coveredResults.length)
              : avgCov;
          }
          stats.lastUsedInSprint = sprint.id;
          poolManager.saveAgentStats(agentId, stats);
        }
      }

      for (const [skillId, perf] of Object.entries(learnings.skillPerformance)) {
        // Same dilution-fix as the agent block above (born-591 P0 item b) — the
        // skill side previously never computed/wrote avgCoverage at all (always 0).
        const skillTasks = sprint.tasks.filter(t => t.assignedSkills?.includes(skillId));
        const coveredResults = skillTasks
          .map(t => resultsMap.get(t.id))
          .filter((r): r is TaskResult => r != null && typeof r.coverage === 'number');
        let avgCov = 0;
        if (coveredResults.length > 0) {
          const totalCov = coveredResults.reduce((sum, r) => sum + r.coverage, 0);
          avgCov = totalCov / coveredResults.length;
        }

        const skill = skillPoolManager.getSkill(skillId);
        if (skill) {
          const stats = skill.stats ?? { totalUses: 0, successRate: 0, avgCoverage: 0, lastUsedInSprint: '', successCount: 0 };
          // Prior cumulative uses — captured BEFORE totalUses is overwritten below
          // (same reasoning as the agent block above).
          const prevTotal = stats.totalUses;
          stats.totalUses = perf.totalTasks;
          stats.successRate = perf.successRate;
          stats.successCount = perf.successCount;
          if (coveredResults.length > 0) {
            stats.avgCoverage = prevTotal > 0
              ? ((stats.avgCoverage * prevTotal) + (avgCov * coveredResults.length)) / (prevTotal + coveredResults.length)
              : avgCov;
          }
          stats.lastUsedInSprint = sprint.id;
          skillPoolManager.saveSkillStats(skillId, stats);
        }
      }

      debugLog('finalizeSprint:syncStatsToManifests', `Synced ${Object.keys(learnings.agentPerformance).length} agents, ${Object.keys(learnings.skillPerformance).length} skills to stats sidecar (.deckent/stats/catalog-stats.json)`);
    } catch (e) { debugLog('finalizeSprint:syncStatsToManifests', e); }

    // 8e. Evaluate promotions/demotions
    try {
      const { PromotionPipeline } = await import('./promotion-pipeline.js');
      const pipeline = new PromotionPipeline(projectRoot);
      const promotions = pipeline.evaluatePromotions(tracker);
      const demotions = pipeline.evaluateDemotions(tracker);
      for (const p of promotions.filter(r => r.action === 'promote')) {
        debugLog('finalizeSprint:promotion', `${p.entityType} '${p.entityId}': ${p.reason}`);
        try {
          pipeline.promote(p.entityId, p.entityType);
        } catch (promoteErr) {
          debugLog('finalizeSprint:promotion', `Failed to promote ${p.entityType} '${p.entityId}': ${promoteErr}`);
        }
      }
      for (const d of demotions.filter(r => r.action === 'demote')) {
        debugLog('finalizeSprint:demotion', `${d.entityType} '${d.entityId}': ${d.reason}`);
        try {
          pipeline.demote(d.entityId, d.entityType);
        } catch (demoteErr) {
          debugLog('finalizeSprint:demotion', `Failed to demote ${d.entityType} '${d.entityId}': ${demoteErr}`);
        }
      }
    } catch (e) { debugLog('finalizeSprint:promotionDemotion', e); }
  } catch (err) {
    debugLog('finalizeSprint:v2-learning', `V2 learning pipeline failed: ${err}`);
  }

  // 9. Update project docs
  if (opts?.config) {
    try {
      updateProjectDocs(projectRoot, { sprint, evaluations, metrics }, opts.config, results);
    } catch (e) { debugLog('finalizeSprint:updateProjectDocs', e); }
  }

  // 10. Rich output (non-fatal — sprint completes even if formatting fails)
  debugLog('finalizeSprint:breadcrumb', 'Step 10 (richOutput) — entering');
  try {
    const attributedDiff = projectSprintWorkAttribution(logicalResults);
    const gitDiffLines = attributedDiff.filesChanged.map(path => {
      const attempts = attributedDiff.fileAttemptIds[path] ?? [];
      return `${path} | attempt ${attempts.join(',')}`;
    });
    const excludedAttribution = attributedDiff.heldAttempts + attributedDiff.unavailableAttempts;
    if (excludedAttribution > 0) {
      gitDiffLines.push(getMessage(
        'finalize.attribution_excluded',
        opts?.config?.language ?? 'en',
        { count: String(excludedAttribution) },
      ));
    }
    const gitDiff = gitDiffLines.join('\n');
    // output_mode lives on DeckentConfig (raw), not ResolvedConfig — access via cast
    const rawConfig = opts?.config as Record<string, unknown> | undefined;
    const outputMode = (rawConfig?.['output_mode'] as string) ?? 'normal';
    const richInput = { id: sprint.id, number: sprint.number, tasks: logicalTasks.map(t => ({ id: t.id, title: t.title })), metrics: { ...metrics } };
    // Build agent performance data for the performance table
    const attemptedSprint: Sprint = {
      ...logicalSprint,
      tasks: logicalTasks.filter(task => {
        const result = logicalResultsMap.get(task.id);
        return result !== undefined && result.cascadeSkipped !== true;
      }),
    };
    const agentRows = buildAgentPerformance(attemptedSprint, logicalEvaluations, logicalResults);
    const agentPerf = agentRows.map(row => ({
      agentId: row.agent,
      totalTasks: row.tasks,
      doneTasks: row.done,
      successRate: row.tasks > 0 ? Math.round((row.done / row.tasks) * 100) : 0,
    }));
    // Extract learnings from evaluation results (task notes from results)
    const learnings = logicalResults
      .filter(r => r.notes && r.notes.trim().length > 0)
      .map(r => r.notes as string)
      .slice(0, 5);
    const richOutput = formatRichSprintSummary(
      richInput,
      logicalEvaluations,
      { gitDiff, agentPerf, learnings, outputMode: outputMode as 'quiet' | 'normal' | 'verbose' },
    );
    if (richOutput) console.log(richOutput);
  } catch (e) { debugLog('finalizeSprint:richOutput', e); }

  // 10b. Self-audit gate: run tsc + vitest + honesty checks, propagate status
  debugLog('finalizeSprint:breadcrumb', 'Step 10b (selfAuditGate) — entering');
  let gateResult: SelfAuditResult | null = null;
  try {
    gateResult = await runSelfAuditGate(sprint.id, projectRoot, {
      scopedManifest: deriveScopedSelfAuditManifest(sprint.tasks, results),
      selfAuditEcosystem: resolveSelfAuditEcosystem(projectRoot ?? process.cwd()),
    });
    debugLog('finalizeSprint:selfAuditGate', `Gate completed: overallGate=${gateResult.overallGate}`);
    const currentStatus = sprint.status ?? '';
    const newStatus = applyGateStatus(currentStatus, gateResult);
    if (newStatus !== currentStatus) {
      sprint.status = newStatus as Sprint['status'];
      debugLog('finalizeSprint:selfAuditGate', `Status updated: ${currentStatus} → ${newStatus}`);
    }
  } catch (e) {
    debugLog('finalizeSprint:selfAuditGate', `Gate check failed (will write fallback gate.json): ${e}`);
    // Produce a fallback gate result so gate.json is always written
    gateResult = {
      tsc: { status: 'FAIL', errors: [`Gate execution failed: ${e}`] },
      vitest: { status: 'FAIL', delta: { files: 0, pass: 0, fail: 0, skipped: 0 } },
      honesty: { violations: 0, flaggedTasks: [] },
      observability: { metricsJsonlExists: false, lineCount: 0 },
      overallGate: 'GATE_FAILURE',
    };
  }
  // Write gate.json to .deckent/recently-works/ — ALWAYS (even on gate failure or fallback).
  // Canonical location since the Sprint 150 de-scatter (gate/seq/events/pre-archive all live
  // under recently-works, managed by sprint-file-retention). Matches the `deckent audit`
  // CLI + MCP writers; the legacy `.deckent/` root path was outside retention (files piled up
  // un-pruned and invisible to listSprintFiles).
  try {
    const recentWorksDir = join(projectRoot, RECENT_WORKS_DIR);
    await fsPromises.mkdir(recentWorksDir, { recursive: true });
    const gatePath = join(recentWorksDir, `${sprint.id}-gate.json`);
    await fsPromises.writeFile(gatePath, JSON.stringify(gateResult, null, 2));
    debugLog('finalizeSprint:selfAuditGate', `Gate result written to ${gatePath} overallGate=${gateResult.overallGate}`);

    // ─── GATE_COMPUTED event (ADR-035 — AUDITOR→BRAIN:GATE_COMPUTED) ───
    // Brain emits on behalf of the self-audit gate (finalizeSprint is in-process auditor role).
    // Event stream source is 'auditor' to match ADR-037 authority matrix.
    writeEvent(
      projectRoot, sprintIdForEvents, 'auditor', 'brain',
      CHANNELS.GATE_COMPUTED,
      {
        sprintId: sprint.id,
        overallGate: gateResult.overallGate,
        tscStatus: gateResult.tsc.status,
        vitestFail: gateResult.vitest.delta.fail,
        vitestPass: gateResult.vitest.delta.pass,
        honestyViolations: gateResult.honesty.violations,
        observabilityOk: gateResult.observability.metricsJsonlExists,
      },
    );
  } catch (writeErr) {
    debugLog('finalizeSprint:selfAuditGate', `WARNING: Failed to write gate.json: ${writeErr}`);
  }
  // Append Gate Failure section to the retro entry if the gate failed — B8.
  if (gateResult.overallGate === 'GATE_FAILURE') {
    const errors: string[] = [];
    if (gateResult.tsc.status === 'FAIL') errors.push(...gateResult.tsc.errors.slice(0, 5));
    if (gateResult.vitest.status === 'FAIL') errors.push(`vitest: ${gateResult.vitest.delta.fail} failing tests`);
    if (gateResult.honesty.violations > 0) errors.push(`honesty violations: ${gateResult.honesty.flaggedTasks.join(', ')}`);
    const gateSection = [
      '',
      '### Gate Failure',
      `Self-audit gate failed for sprint ${sprint.id}. Status: ${GO_WITH_GATE_FAILURE}.`,
      '',
      ...errors.map(e => `- ${e}`),
    ].join('\n') + '\n';
    appendRetroSection(projectRoot, sprint.id, '### Gate Failure', gateSection);
  }

  // 10b2. Tech-debt gate: downgrade sprint outcome when debt ratio exceeds configured threshold.
  // Flag-gated: gate?.max_tech_debt_ratio absent or 0 → byte-identical (default-off).
  // applyTechDebtDowngrade determines severity via completion-ratio thresholds (0.8 / 0.5).
  debugLog('finalizeSprint:breadcrumb', 'Step 10b2 (techDebtGate) — entering');
  try {
    const maxDebtRatio = opts?.config?.gate?.max_tech_debt_ratio;
    if (maxDebtRatio && maxDebtRatio > 0 && metrics.totalTasks > 0) {
      const debtRatio = metrics.techDebtTasks / metrics.totalTasks;
      if (debtRatio > maxDebtRatio) {
        const completionRatio = 1 - debtRatio;
        const downgradeResult = applyTechDebtDowngrade(
          'DONE',
          { selfAssessment: 'DONE' },
          completionRatio,
        );
        // Gate triggered: severity determines whether outcome is GO_WITH_TECH_DEBT or GATE_FAILURE.
        // applyTechDebtDowngrade: completionRatio < 0.5 → 'NO_GO' (severe) → GATE_FAILURE.
        const newStatus = downgradeResult.decision === 'NO_GO'
          ? GO_WITH_GATE_FAILURE
          : TaskEvaluation.GO_WITH_TECH_DEBT;
        sprint.status = newStatus as Sprint['status'];
        debugLog('finalizeSprint:techDebtGate',
          `Sprint ${sprint.id}: debt-ratio=${(debtRatio * 100).toFixed(1)}% > max=${(maxDebtRatio * 100).toFixed(1)}% → ${newStatus} (${downgradeResult.reason ?? 'gate triggered'})`);
      }
    }
  } catch (e) { debugLog('finalizeSprint:techDebtGate', e); }
  debugLog('finalizeSprint:breadcrumb', 'Step 10b2 (techDebtGate) — done');

  // 10c. Generate load-test-report.md from metrics.jsonl (Sprint 135 N6 — Task 5)
  debugLog('finalizeSprint:breadcrumb', 'Step 10c (loadReport) — entering');
  try {
    const reportDir = join(projectRoot, 'docs', 'audits', sprint.id);
    await fsPromises.mkdir(reportDir, { recursive: true });
    const reportPath = join(reportDir, 'load-test-report.md');
    const report = await generateLoadReport(projectRoot);
    await fsPromises.writeFile(reportPath, report);
    debugLog('finalizeSprint:loadReport', `Load test report written to ${reportPath}`);

    // ─── LOAD_REPORT_WRITTEN event (ADR-035 — AUDITOR→BRAIN:LOAD_REPORT_WRITTEN) ─
    // Emitted after the report is successfully written to disk so consumers
    // know the file is ready to read without polling.
    writeEvent(
      projectRoot, sprintIdForEvents, 'auditor', 'brain',
      CHANNELS.LOAD_REPORT_WRITTEN,
      { sprintId: sprint.id, reportPath, timestamp: new Date().toISOString() },
    );
  } catch (e) { debugLog('finalizeSprint:loadReport', `WARNING: load_report_generation_failed: ${e}`); }

  debugLog('finalizeSprint:breadcrumb', 'Step 10c (loadReport) — done');

  // 10c2. Rotate metrics file (Sprint 150 T-030)
  debugLog('finalizeSprint:breadcrumb', 'Step 10c2 (metricsRotation) — entering');
  try {
    const rotationConfig: Partial<ObservabilityRotationConfig> = {
      ...(opts?.config?.observability?.rotation ?? {}),
    };
    const rotationResult = rotateMetricsFile(projectRoot, sprint.id, rotationConfig);
    if (rotationResult.rotated) {
      debugLog('finalizeSprint:metricsRotation',
        `Rotated ${rotationResult.originalSizeBytes} bytes → ${rotationResult.archivePath} ` +
        `(${rotationResult.archivedSizeBytes} bytes gzipped), pruned ${rotationResult.pruned.length} old archives`);
    }
  } catch (e) { debugLog('finalizeSprint:metricsRotation', `WARNING: metrics rotation failed: ${e}`); }
  debugLog('finalizeSprint:breadcrumb', 'Step 10c2 (metricsRotation) — done');

  // 10d. Regenerate features manifest (Sprint 150 Task 029 — Feature Manifest Canlılaştırma)
  debugLog('finalizeSprint:breadcrumb', 'Step 10d (featuresManifest) — entering');
  try {
    const syncScript = join(projectRoot, 'scripts', 'sync-manifest.mjs');
    if (existsSync(syncScript)) {
      const syncResult = spawnSync('node', [syncScript, '--root', projectRoot], {
        encoding: 'utf-8',
        timeout: 30000,
        cwd: projectRoot,
      });
      debugLog('finalizeSprint:featuresManifest', `Sync exit=${syncResult.status}: ${(syncResult.stdout || '').trim()}`);
    }
  } catch (e) { debugLog('finalizeSprint:featuresManifest', `WARNING: features manifest sync failed: ${e}`); }

  // 11. Adaptive thresholds: auto-adjust agent_min_score + coverage_threshold based on recent sprints
  if (opts?.config?.adaptive_thresholds) {
    try {
      await applyAdaptiveThresholds(projectRoot, opts.config, sprint.id);
    } catch (err) {
      debugLog('finalizeSprint:adaptive', `Adaptive threshold update failed: ${err}`);
    }
  }

  // Publish the generation-fenced terminal receipt at the single archive
  // boundary. Exact attempts and every outcome-shaping gate have settled by
  // this point. Receipt publication is not completion authority: a settled
  // NO_GO remains FAILED/BLOCKED in the reassembled evidence, while stale,
  // partial, deferred, or otherwise held evidence leaves publication null.
  let terminalReceiptPublication: FinalizerTerminalReceiptPublication | null = null;
  try {
    terminalReceiptPublication = publishFencedSprintTerminalReceipt({
      projectRoot,
      sprint,
      truth: terminalTruth,
      ...(opts?.flowId ? { runId: opts.flowId } : {}),
      ...(opts?.coordinatorGeneration !== undefined
        ? { coordinatorGeneration: opts.coordinatorGeneration }
        : {}),
    });
    debugLog(
      'finalizeSprint:terminalReceipt',
      `Receipt published at ${terminalReceiptPublication.artifactPath}`,
    );
  } catch (e) {
    debugLog('finalizeSprint:terminalReceipt', `Publication held: ${e}`);
    // Terminal evidence is a hard authority boundary. Continuing after a
    // held publication used to write a COMPLETE job/state without a receipt,
    // leaving status, cleanup, and re-finalize surfaces in contradiction.
    // Preserve the original typed reason when possible and fail closed before
    // any archive, job summary, or terminal authority is published.
    if (e instanceof FinalizerTerminalEvidenceError) throw e;
    throw new FinalizerTerminalEvidenceError(
      `TERMINAL_RECEIPT_PUBLICATION_FAILED:${e instanceof Error ? e.message : String(e)}`,
    );
  }

  const receiptAllowsArchive =
    terminalReceiptPublication?.terminalEvidence.cleanupEligibility.candidate === true;
  if (!receiptAllowsArchive) {
    throw new FinalizerTerminalEvidenceError('TERMINAL_RECEIPT_NOT_CLEANUP_ELIGIBLE');
  }
  if (receiptAllowsArchive) {

  // 12. Archive DIRECTIVES.md — always archive copy; PRESERVE working DIRECTIVES.md by default.
  //
  // Sprint 168 C0a-4 (BUG-CC fix, Alperen Pre-Flight Step 16 Option B):
  //   - auto_archive_directives config flag default flipped: true → FALSE
  //   - Default: DIRECTIVES.md is PRESERVED (archive copy still always written)
  //   - Opt-in: `auto_archive_directives: true` restores legacy placeholder-overwrite
  //
  // Rationale: Sprint 167 BUG-CC live evidence — placeholder overwrite =
  // catastrophic sprint context loss. Conservative default (preserve) safer.
  // See ADR-046 Amendment (Sprint 168 C0a-4).
  debugLog('finalizeSprint:breadcrumb', 'Step 12 (archiveDirectives) — entering');
  try {
    const rawCfg = opts?.config as Record<string, unknown> | undefined;
    const autoArchive = rawCfg?.['auto_archive_directives'] ?? false;
    archiveDirectives(projectRoot, sprint.id, 'CLEANUP', { autoArchive: autoArchive === true });
  } catch (e) { debugLog('finalizeSprint:archiveDirectives', e); }

  // 12b. Archive orphan task files from .tasks/ to .brain/archive/sprint-NNN-tasks/
  // Guard: create pre-archive snapshot + preserve active (PENDING/EXECUTING) tasks
  debugLog('finalizeSprint:breadcrumb', 'Step 12b (archiveOrphanTasks) — entering');
  try {
    // Step 12b-i: Create pre-archive snapshot for rollback safety
    const snapshot = createPreArchiveSnapshot(projectRoot, sprint.id);
    if (snapshot) {
      debugLog('finalizeSprint:preArchiveSnapshot', `Snapshot created: ${snapshot.fileCount} files, hash=${snapshot.hash.slice(0, 12)}...`);
    }

    // Step 12b-ii: Classify tasks by status — only archive terminal (DONE/NO_GO)
    const tasksDir = join(projectRoot, '.tasks');
    const sprintMatch = sprint.id.match(/sprint-(\d+)/);
    if (existsSync(tasksDir) && sprintMatch) {
      const prefix = `task-${sprintMatch[1]}-`;
      const allFiles = readdirSync(tasksDir);
      const sprintFiles = allFiles.filter(f => f.startsWith(prefix));
      const { preserved } = classifyTaskFiles(tasksDir, prefix, sprintFiles);

      if (preserved.length > 0) {
        debugLog('finalizeSprint:archiveGuard', `Preserving ${preserved.length} active task files: ${preserved.slice(0, 5).join(', ')}${preserved.length > 5 ? '...' : ''}`);
      }
    }

    // Step 12b-iii: Archive only completed tasks (archiveOrphanTasks archives all — we accept this for now
    // since the snapshot provides rollback capability)
    const count = archiveOrphanTasks(projectRoot, sprint.id);
    debugLog('finalizeSprint:archiveOrphanTasks', `Archived ${count} orphan task files`);
  } catch (e) { debugLog('finalizeSprint:archiveOrphanTasks', e); }

  // 12c. Apply .tasks/archive/ retention policy — remove archives beyond retention limit
  debugLog('finalizeSprint:breadcrumb', 'Step 12c (cleanTasksArchive) — entering');
  try {
    const removed = cleanTasksArchive(projectRoot);
    debugLog('finalizeSprint:cleanTasksArchive', `Removed ${removed} old .tasks/archive/ dirs`);
  } catch (e) { debugLog('finalizeSprint:cleanTasksArchive', e); }

  // 12d. Sprint file retention — clean counters, migrate forensic files, enforce keep_last_n + size_cap
  debugLog('finalizeSprint:breadcrumb', 'Step 12d (sprintFileRetention) — entering');
  try {
    // Read retention config from project config if available
    let retentionConfig: Record<string, unknown> = {};
    try {
      const cfgPath = join(projectRoot, '.deckent', 'config.json');
      if (existsSync(cfgPath)) {
        const raw = JSON.parse(readFileSync(cfgPath, 'utf-8'));
        if (raw?.sprint_file_retention) retentionConfig = raw.sprint_file_retention;
      }
    } catch { /* use defaults */ }

    const retentionResult = runRetention(
      projectRoot,
      sprint.id,
      retentionConfig,
      { deferCounterCleanup: true },
    );
    debugLog('finalizeSprint:sprintFileRetention',
      `Retention complete: archived=${retentionResult.archived.length}, countersDeleted=${retentionResult.countersDeleted.length}, forensicMoved=${retentionResult.forensicMoved.length}, bytesFreed=${retentionResult.bytesFreed}`);
  } catch (e) { debugLog('finalizeSprint:sprintFileRetention', e); }

  // 12e. Prune stale cross-sprint handoff files (B-HANDOFF-PRUNE — Sprint 331 331-006).
  // `.tasks/handoffs/` is an append-only registry that grows without bound across
  // sprints. pruneStaleHandoffs deletes handoffs whose endpoints are BOTH outside
  // THIS sprint, keeping in-flight ones. Self-contained + fail-safe (never throws) —
  // it can never fail or block finalize. Groups with the 12c/12d storage-retention hooks.
  debugLog('finalizeSprint:breadcrumb', 'Step 12e (pruneStaleHandoffs) — entering');
  const prunedHandoffs = pruneStaleHandoffs(projectRoot, sprint);
  if (prunedHandoffs > 0) {
    debugLog('finalizeSprint:pruneStaleHandoffs', `Pruned ${prunedHandoffs} stale handoff file(s)`);
  }

  // 12f. Scheduler-shadow journal retention — archive .deckent/runtime/scheduler-shadow/*.jsonl
  // files older than retention_days (age-based, fail-soft, mirrors Step 12d).
  debugLog('finalizeSprint:breadcrumb', 'Step 12f (schedulerShadowRetention) — entering');
  try {
    // Read retention config from project config if available
    let schedulerShadowRetentionConfig: Record<string, unknown> = {};
    try {
      const cfgPath = join(projectRoot, '.deckent', 'config.json');
      if (existsSync(cfgPath)) {
        const raw = JSON.parse(readFileSync(cfgPath, 'utf-8'));
        if (raw?.scheduler_shadow_retention) schedulerShadowRetentionConfig = raw.scheduler_shadow_retention;
      }
    } catch { /* use defaults */ }

    const schedulerShadowResult = archiveStaleSchedulerShadowJournals(projectRoot, schedulerShadowRetentionConfig);
    debugLog('finalizeSprint:schedulerShadowRetention',
      `Retention complete: archived=${schedulerShadowResult.archived.length}, bytesFreed=${schedulerShadowResult.bytesFreed}`);
  } catch (e) { debugLog('finalizeSprint:schedulerShadowRetention', e); }
  } else {
    debugLog(
      'finalizeSprint:archiveBoundary',
      'Archive and retention held until a cleanup-eligible terminal receipt exists',
    );
  }

  // 13. Write job completion summary to .deckent/runtime/jobs/ for MCP polling and CLI notification
  debugLog('finalizeSprint:breadcrumb', 'Step 13 (jobSummary) — entering');
  try {
    const jobsDir = join(projectRoot, JOBS_DIR);
    mkdirSync(jobsDir, { recursive: true });

    // Build agent breakdown
    const agentBreakdown: Record<string, number> = {};
    for (const task of logicalTasks) {
      const result = logicalResultsMap.get(task.id);
      if (!result || result.cascadeSkipped === true) continue;
      const agent = task.assignedAgent ?? 'generic';
      agentBreakdown[agent] = (agentBreakdown[agent] ?? 0) + 1;
    }
    const agentParts = Object.entries(agentBreakdown).map(([a, c]) => `${a}(${c})`).join(', ');

    // Format duration — Sprint 268 FINALIZE fix: without a recoverable
    // startedAt the computed durationMs is a meaningless ~0 (calculateMetrics
    // falls back to Date.now() for the start). Report 'unknown' honestly
    // instead of a fake "0sn" (sprint-267 live finding: Duration=0ms).
    const durationMs = metrics.durationMs;
    const mins = Math.floor(durationMs / 60000);
    const secs = Math.floor((durationMs % 60000) / 1000);
    const durationStr = !sprint.startedAt
      ? 'unknown'
      : mins > 0 ? `${mins}dk ${secs}sn` : `${secs}sn`;
    const usageTotals = terminalTruth.usageTotals;

    // completedTasks already includes TECH_DEBT (see calculateMetrics), so use it directly
    const donePure = metrics.completedTasks - metrics.techDebtTasks;
    const summary = `Sprint ${sprint.id} tamamlandı (${durationStr}) — ${metrics.completedTasks}/${metrics.totalTasks} task başarılı: ${donePure} DONE, ${metrics.techDebtTasks} TECH_DEBT, ${metrics.noGoTasks} NO_GO | Agent: ${agentParts}`;

    // Build rich evaluations with per-task details from results
    const richEvaluations: Record<string, {
      evaluation: string;
      title: string;
      agent: string;
      skills: string[];
      reason: string;
      filesChanged: string[];
      linesAdded: number;
      linesRemoved: number;
      testsPassed: boolean;
      coverage: number;
      selfAssessment: string;
      techDebtDetail: string;
    }> = {};
    for (const [taskId, evaluation] of logicalEvaluations) {
      const taskResult = logicalResultsMap.get(taskId);
      const task = logicalTasks.find(t => t.id === taskId);
      const isTechDebt = evaluation === TaskEvaluation.GO_WITH_TECH_DEBT;
      const work = projectAttributedTaskWork(taskResult);
      richEvaluations[taskId] = {
        evaluation,
        title: task?.title ?? '',
        agent: task?.assignedAgent ?? 'generic',
        skills: task?.assignedSkills ?? [],
        reason: taskResult?.notes ?? '',
        filesChanged: [...work.filesChanged],
        linesAdded: work.linesAdded,
        linesRemoved: work.linesRemoved,
        testsPassed: taskResult?.testsPassed ?? false,
        coverage: taskResult?.coverage ?? 0,
        selfAssessment: taskResult?.selfAssessment ?? evaluation,
        techDebtDetail: isTechDebt ? (taskResult?.notes ?? '') : '',
      };
    }

    // Rich completion-record (TERM5-FIN — sprint-427 task 1): additive-only,
    // appended as a NEW key below — every pre-existing jobData field/value
    // stays exactly as it was.
    const completionRecord = buildSprintCompletionRecord(
      logicalSprint,
      logicalEvaluations,
      logicalResultsMap,
      opts?.flowId,
      terminalTruth,
    );

    const jobFile = join(jobsDir, `${sprint.id}.json`);
    const jobData = {
      status: 'COMPLETE',
      sprintId: sprint.id,
      summary,
      completedAt: new Date().toISOString(),
      metrics: {
        totalTasks: metrics.totalTasks,
        done: donePure,
        techDebt: metrics.techDebtTasks,
        noGo: metrics.noGoTasks,
        duration: durationStr,
        durationMs: metrics.durationMs,
        billedCostUsd: usageTotals.costUsd,
        referenceCostUsd: usageTotals.referenceCostUsd ?? 0,
        unknownBillingTaskCount: usageTotals.unknownBillingTaskCount ?? 0,
      },
      agentBreakdown,
      evaluations: richEvaluations,
      completionRecord,
    };
    writeFileSync(jobFile, JSON.stringify(jobData, null, 2) + '\n');
    debugLog('finalizeSprint:jobSummary', `Job summary written to ${jobFile}`);
  } catch (e) { debugLog('finalizeSprint:jobSummary', e); }

  // 14. Post-finalize hook chain (Sprint 143 Task 10)
  // Order: (1) memory export → (2) identity regen → (3) adr insert → (4) rule regen hook
  // ADR-046 Step Ordering Contract; ruleRegen MUST observe ADRs inserted by adrInsert.
  // Changelog and sprint-log are already handled by doc-updaters registry in step 9.
  debugLog('finalizeSprint:breadcrumb', 'Step 14 (postFinalizeHooks) — entering');
  let postFinalizeResult: PostFinalizeHookResult | null = null;
  try {
    // ── Step 4 ruleRegen invocation (Sprint 168 C0a-2) ─────────────
    // Sprint 167 T3 HIGH regression: when sprint-finalizer.ts was called
    // without an explicit `onRuleRegen` callback, Step 4 was silently
    // skipped, leaving `.claude/rules/brain.md` Active ADR Constraints
    // stale (44/50 ADRs). The fix here provides a default callback that
    // invokes `regenerateRules(projectRoot)` — which queries
    // `store.getByType('adr')` against the post-Step-3 memory.db and
    // re-renders rules for all 4 provider dirs (claude / codex / gemini
    // / cursor). Callers passing their own `opts.onRuleRegen` (e.g. tests
    // or override paths) bypass the default. ADR-046 Step 4 contract.
    let resolvedOnRuleRegen = opts?.onRuleRegen;
    if (!resolvedOnRuleRegen) {
      resolvedOnRuleRegen = async (root: string): Promise<void> => {
        const { regenerateRules } = await import('../core/rule-generator.js');
        await regenerateRules(root);
      };
    }

    postFinalizeResult = await runPostFinalizeHooks({
      projectRoot,
      sprintId: sprint.id,
      metrics: {
        sprintId: sprint.id,
        totalTasks: metrics.totalTasks,
        completedTasks: metrics.completedTasks,
        techDebtTasks: metrics.techDebtTasks,
        noGoTasks: metrics.noGoTasks,
        coveragePercent: metrics.coveragePercent,
        durationMs: metrics.durationMs,
      },
      onRuleRegen: resolvedOnRuleRegen,
      // Sprint 227 task 227-002: always skip the unsafe runMemoryExport.
      // We do the export ourselves via writeGuardedExports below so the
      // sanity guard runs on every finalize cycle, not just opted-in callers.
      skipMemoryExport: true,
      skipIdentityRegen: opts?.skipIdentityRegen,
    });

    // Sprint 227 task 227-002 — guarded export.
    // Runs AFTER runPostFinalizeHooks so post-Step-3 ADR inserts are
    // reflected in the rendered .md files. Caller can still opt out via
    // opts.skipMemoryExport (preserves prior semantics).
    if (!opts?.skipMemoryExport) {
      try {
        const dbPath = join(projectRoot, BRAIN_DIR, MEMORY_DB_FILE);
        if (existsSync(dbPath)) {
          const exportsDir = join(projectRoot, BRAIN_DIR, 'exports');
          const store = new MemoryStore(dbPath);
          try {
            const guarded = writeGuardedExports(store, exportsDir);
            debugLog('finalizeSprint:writeGuardedExports',
              `written=${guarded.written.length} skipped=${guarded.skipped.length} ` +
              `warnings=${guarded.warnings.length}`);
            for (const w of guarded.warnings) {
              debugLog('finalizeSprint:writeGuardedExports:warn', w);
            }
            // Reflect the guarded run onto postFinalizeResult.memoryExport so
            // downstream consumers see a non-null result (the caller-visible
            // contract did not change).
            postFinalizeResult.memoryExport = {
              success: guarded.warnings.length === 0,
              filesWritten: guarded.written,
              errors: guarded.warnings,
            };
          } finally {
            store.close();
          }
        }
      } catch (e) {
        debugLog('finalizeSprint:writeGuardedExports', `guarded export failed: ${e}`);
      }
    }
    debugLog('finalizeSprint:postFinalizeHooks',
      `memExport=${postFinalizeResult.memoryExport?.filesWritten.length ?? 'skipped'} ` +
      `identity=${postFinalizeResult.identityRegen?.reason ?? 'skipped'} ` +
      `adrInsert=${postFinalizeResult.adrInsert
        ? `inserted=${postFinalizeResult.adrInsert.inserted}/updated=${postFinalizeResult.adrInsert.updated}/skipped=${postFinalizeResult.adrInsert.skipped}`
        : 'skipped'} ` +
      `ruleRegen=${postFinalizeResult.ruleRegenCalled} ` +
      `errors=${postFinalizeResult.errors.length}`);
  } catch (e) {
    debugLog('finalizeSprint:postFinalizeHooks', `Post-finalize hooks failed: ${e}`);
  }

  // ─── SPRINT_PHASE_CHANGE: RETRO → CLEANUP ───────────────────────
  // Final phase transition — sprint lifecycle complete.
  // Consumer: auditor marks sprint as finalized, dashboard shows COMPLETE.
  writeEvent(
    projectRoot, sprintIdForEvents, 'brain', '*',
    CHANNELS.SPRINT_PHASE_CHANGE,
    { fromPhase: 'RETRO', toPhase: 'CLEANUP', sprintId: sprint.id, timestamp: new Date().toISOString() },
  );

  if (!opts?.deferTerminalAuthority) {
    publishFinalSprintAuthority(projectRoot, sprint, metrics, opts?.config?.language ?? 'en');
  }

  // Counter cleanup must be the final filesystem action after the terminal
  // event. Deleting `<sprint>-seq` during retention and then emitting
  // RETRO→CLEANUP recreated the sequence at 1, breaking monotonicity.
  try {
    cleanupCounters(projectRoot, sprint.id);
  } catch (e) { debugLog('finalizeSprint:cleanupCountersFinal', e); }

  return metrics;
}

/**
 * Single terminal authority publisher shared by external finalize and the
 * in-process controller after every ref'ed cleanup operation has completed.
 */
export function publishFinalSprintAuthority(
  projectRoot: string,
  sprint: Sprint,
  metrics: SprintMetrics,
  lang = 'en',
): void {
  debugLog('finalizeSprint:breadcrumb', 'terminal authority publication — entering');
  persistFinalSprintState(projectRoot, sprint);
  try {
    writeTerminalDashboardSnapshot(projectRoot, sprint, metrics);
  } catch (e) { debugLog('finalizeSprint:terminalDashboard', e); }
  try {
    const done = metrics.completedTasks ?? 0;
    const total = metrics.totalTasks ?? sprint.tasks.length;
    const noGo = metrics.noGoTasks ?? 0;
    const debt = metrics.techDebtTasks ?? 0;
    const unevaluated = metrics.unevaluatedTasks ?? 0;
    void notify(
      'sprint-finalized',
      sprint.id,
      getMessage('finalize.notification_title', lang, { sprintId: sprint.id }),
      getMessage('finalize.notification_summary', lang, {
        done: String(done),
        total: String(total),
        debt: String(debt),
        noGo: String(noGo),
        unevaluated: String(unevaluated),
      }),
    );
  } catch (e) { debugLog('finalizeSprint:notify:sprint-finalized', e); }
  debugLog('finalizeSprint:breadcrumb', 'terminal authority publication — done');
}

/**
 * Sprint 223 Task 013 — finalize sprint-state COMPLETED + pids cleanup.
 *
 * Root cause (Sprint 222→223 transition): `deckent finalize --force` wrote
 * RETRO / MEMORY / config but left `.deckent/sprint-state.json` at
 * `status:ACTIVE, phase:EXECUTE` and the dead `.deckent/pids/<id>.pid` in
 * place. The next `deckent start` then either reported the sprint as an
 * orphan (PID dead) or wrongly resumed the finished sprint in FIX, blocking
 * the next sprint from launching.
 *
 * Fix: stamp the sprint as `SprintStatus.COMPLETE` / `SprintPhase.COMPLETE`,
 * overwrite `.deckent/sprint-state.json` only when it already exists (so
 * fresh checkouts don't gain a phantom state file), then drop the PID +
 * snapshot files via `clearPid` (which is itself idempotent on missing
 * files). Both steps are wrapped in non-fatal try/catch — finalize must
 * never crash because of a stale tmp file.
 */
export function persistFinalSprintState(projectRoot: string, sprint: Sprint): void {
  try {
    sprint.status = SprintStatus.COMPLETE;
    sprint.phase = SprintPhase.COMPLETE;
    sprint.completedAt = sprint.completedAt ?? new Date().toISOString();
    const statePath = join(projectRoot, SPRINT_STATE_FILE);
    if (existsSync(statePath)) {
      // Sprint 268 guard: only stamp the state file when it belongs to THIS
      // sprint — `finalize --force` for an older sprint must not overwrite a
      // different (possibly live) sprint's state as COMPLETE. A state file
      // without a sprintId (legacy/corrupt) is still stamped, preserving the
      // Sprint 223 cleanup behavior.
      const existing = readSprintState(projectRoot);
      if (!existing?.sprintId || existing.sprintId === sprint.id) {
        writeSprintState(projectRoot, sprint);
      } else {
        debugLog('persistFinalSprintState:skip',
          `sprint-state.json belongs to ${existing.sprintId}, not ${sprint.id} — leaving untouched`);
      }
    }
  } catch (e) { debugLog('persistFinalSprintState:writeSprintState', e); }
  try {
    clearPid(projectRoot, sprint.id);
  } catch (e) { debugLog('persistFinalSprintState:clearPid', e); }
  // GHOST-FINALIZE fix (Sprint 272 272-001): purge this sprint's checkpoint
  // artifacts so the next `deckent start` cannot read a stale checkpoint and
  // run a phantom 0/0 "complete" restore. cleanupCheckpointFiles is itself
  // idempotent + fail-safe; the wrapping try/catch is belt-and-suspenders so
  // finalize never crashes on a locked/missing file.
  try {
    cleanupCheckpointFiles(projectRoot, sprint.id);
  } catch (e) { debugLog('persistFinalSprintState:cleanupCheckpointFiles', e); }
  // A pause record is a refining authority only while its run is resumable.
  // Once the same sprint is terminal it must be removed, otherwise canonical
  // status correctly keeps reporting PAUSED over the newly-written COMPLETE
  // sprint-state. Never touch a pause record owned by another sprint.
  try {
    const pausePath = join(projectRoot, SPRINT_PAUSE_STATE_FILE);
    if (existsSync(pausePath)) {
      const pause = JSON.parse(readFileSync(pausePath, 'utf-8')) as { sprintId?: unknown };
      if (pause.sprintId === sprint.id) unlinkSync(pausePath);
    }
  } catch (e) { debugLog('persistFinalSprintState:clearPauseState', e); }
}

/**
 * Sprint 282 Task 005 — TERMINAL dashboard snapshot (DASH-UX-2).
 *
 * After sprint finalize, the `.dashboard` file is left at the last auditor
 * scan state (e.g. "EXECUTE 80% 8/10").  The next `/api/status` call returns
 * this stale snapshot as if the sprint is still running.
 *
 * Fix: overwrite `.dashboard` with a TERMINAL snapshot containing
 *   sprint.phase = COMPLETE, sprint.status = COMPLETE,
 *   agents = [], progress = final values, alerts = [].
 * The file is always overwritten (idempotent — same data on re-finalize).
 * Non-fatal: wrapped in the caller's try/catch (Step 16 in finalizeSprint).
 */
export function writeTerminalDashboardSnapshot(
  projectRoot: string,
  sprint: Sprint,
  metrics: SprintMetrics,
): void {
  const dashPath = join(projectRoot, DASHBOARD_FILE);
  const snapshot = {
    sprint: {
      id: sprint.id,
      number: sprint.number,
      phase: SprintPhase.COMPLETE,
      status: SprintStatus.COMPLETE,
    },
    agents: [],
    progress: {
      done: metrics.completedTasks,
      active: 0,
      blocked: 0,
      total: metrics.totalTasks,
    },
    alerts: [],
    updatedAt: new Date().toISOString(),
    completedAt: sprint.completedAt ?? new Date().toISOString(),
  };
  writeFileSync(dashPath, JSON.stringify(snapshot, null, 2), 'utf-8');
  debugLog('writeTerminalDashboardSnapshot', `terminal snapshot written for ${sprint.id}`);
}
