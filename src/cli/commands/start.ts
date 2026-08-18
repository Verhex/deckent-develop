import { Option, type Command } from 'commander';
import { loadConfig, readAuthMode } from '../../core/config.js';
import { bootstrapProviders } from '../../core/provider.js';
import type { BootstrapResult } from '../../core/provider.js';
import {
  runSprint, readContext, planSprint,
  BrainError,
} from '../../orchestra/brain.js';
import type { ResolvedConfig, SprintSizeRecommendation } from '../../core/types.js';
import { isSessionActive, setupWatchWindow } from '../../orchestra/tmux.js';
import { TMUX_SESSION_NAME } from '../../core/constants.js';
import { runDoctorChecks } from './doctor.js';
import { checkStartLimitGate } from './limits.js';
import { print, printError, formatSprintSummary, formatTable } from '../helpers/output.js';
import { resolveProjectRoot } from '../helpers/process.js';
import { getMessage, getLanguage } from '../helpers/messages.js';
import { providerAuthorityHoldRemedy } from './provider-authority.js';
import { promptConfirm } from '../helpers/prompt.js';
import { bootstrapNotifyDispatcher, resolveWebhookBootstrapOption } from '../../core/notify-bootstrap.js';
import { buildConnectorAdapterWithKpiSummary, buildSprintKpiSummaryFn } from '../../connectors/kpi-summary-dispatch.js';
import { loadCostConfig, initCostConfig } from '../../core/cost-config-loader.js';
import { estimateSprintCost, formatEstimate, resolveBillingModeForAuth, type TaskCostInput } from '../../core/cost-calculator.js';
import { evaluateCostGate } from '../../core/cost-gate.js';
// Pre-spawn cumulative-spend admission gate (row 4091). Surface → approved orchestra
// entrypoint (ADR-D-004 C3): the enforcement decision is shared policy, not CLI logic.
import { evaluateSpendAdmissionGate } from '../../orchestra/sprint-finalizer.js';
import { evaluateScopeGate, applyScopeResolutions } from '../../core/scope-gate.js';
import { writeEvent } from '../../core/event-stream.js';
import { notifyAsync } from '../../core/notify.js';
import { existsSync, unlinkSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { prepareZeroConfig, cleanupZeroConfig } from './quick-start.js';
import { isSprintLocked } from '../../core/multi-ide.js';
import { detectOrphan, archiveOrphan, listPidFiles } from '../../orchestra/sprint-pid-manager.js';
import { createSandboxBackend } from '../../orchestra/spawn-backend.js';
import { captureGitBase } from '../../orchestra/run-diff-service.js';
import { loadApprovedSnapshot, loadStartAttempt, listFlowIds, loadRunHandle } from '../../core/run-flow-store.js';
import { isTerminalRunFlowState } from '../../core/run-flow-contract.js';
import { debugLog } from '../../core/utils.js';
import { startRunFlow, RunFlowDecisionError } from '../../orchestra/run-flow-decision-service.js';
import { buildFlowStartSpawn } from '../helpers/detached-start.js';
import { buildTaskCostInput } from '../../core/execution-budget-derivation.js';
import { bootstrapApprovalAuthority } from '../../core/approval-authority-bootstrap.js';
import {
  startApprovedRun,
  RunJobFlowNotApprovedError,
  RunJobDigestMismatchError,
} from '../../orchestra/run-job-service.js';
import type { RunHandle, StartAttemptProcessIdentity } from '../../core/run-flow-contract.js';
import {
  admitExactRunAttempt,
  materializeExactPlanTaskArtifacts,
  settleExactRunAttempt,
  type ExactStartCapability,
} from '../../orchestra/exact-plan-start-service.js';
import { processStartToken } from '../../core/pid-ownership.js';
import { getRunFlowCoordinator } from '../../orchestra/run-flow-coordinator-registry.js';
import type { ProviderAuthorityRuntimeServiceOpenResult } from '../../core/provider-authority-composition.js';
import { preflightCliBrainProviderAuthority } from '../provider-authority-process-runtime.js';
import { ProviderExecutionIngressHoldError } from '../../core/provider-execution-ingress-authority.js';
import { readCanonicalRunStatus } from '../../core/run-status-authority.js';
import { DeckentError } from '../../core/errors.js';

// ─── Provider Cache ───────────────────────────────────────────────

const PROVIDER_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const PROVIDER_CACHE_FILE = '.deckent/provider-cache.json';

interface ProviderCache {
  registered: string[];
  defaultProvider: string | null;
  cachedAt: string;
  configHash: string;
}

function renderPausedRun(
  projectRoot: string,
  sprintId: string,
  lang: string,
): string {
  const authority = readCanonicalRunStatus(projectRoot, { sprintIdHint: sprintId });
  const title = getMessage('pause.notification_title', lang, { sprintId });
  const summary = getMessage('pause.notification_summary', lang, {
    reason: authority.reason ?? authority.status ?? '',
    command: authority.recoveryCommand ?? `deckent recover ${sprintId} --resume`,
  });
  return `${title}\n${summary}`;
}

function makeConfigHash(config: { brain_provider?: string; worker_provider?: string; fallback_provider?: string }): string {
  return [config.brain_provider ?? '', config.worker_provider ?? '', config.fallback_provider ?? ''].join('|');
}

export function readProviderCache(projectRoot: string): ProviderCache | null {
  try {
    const raw = readFileSync(join(projectRoot, PROVIDER_CACHE_FILE), 'utf-8');
    return JSON.parse(raw) as ProviderCache;
  } catch {
    return null;
  }
}

export function writeProviderCache(projectRoot: string, result: BootstrapResult, configHash: string): void {
  try {
    mkdirSync(join(projectRoot, '.deckent'), { recursive: true });
    const cache: ProviderCache = {
      registered: result.registered,
      defaultProvider: result.defaultProvider,
      cachedAt: new Date().toISOString(),
      configHash,
    };
    writeFileSync(join(projectRoot, PROVIDER_CACHE_FILE), JSON.stringify(cache, null, 2), 'utf-8');
  } catch { /* non-fatal */ }
}

export function isProviderCacheFresh(cache: ProviderCache, configHash: string): boolean {
  if (cache.configHash !== configHash) return false;
  const cachedAt = new Date(cache.cachedAt).getTime();
  return Date.now() - cachedAt < PROVIDER_CACHE_TTL_MS;
}

// ─── Sandbox Mode Helpers ─────────────────────────────────────────

export interface SandboxState {
  stashRef: string | null;
  applied: boolean;
}

/**
 * Apply a git stash to create a sandbox state.
 * Returns the stash ref if successful, or null if nothing to stash.
 */
export function applySandbox(projectRoot: string): SandboxState {
  try {
    const result = spawnSync('git', ['stash', '--include-untracked', '--message', 'deckent-sandbox'], {
      cwd: projectRoot,
      encoding: 'utf-8',
    });
    if (result.status === 0 && result.stdout.includes('Saved')) {
      return { stashRef: 'stash@{0}', applied: true };
    }
  } catch { /* ignore */ }
  return { stashRef: null, applied: false };
}

/**
 * Restore from sandbox: git stash pop to undo sandbox changes.
 */
export function restoreSandbox(projectRoot: string, state: SandboxState): void {
  if (!state.applied || !state.stashRef) return;
  try {
    // First, reset any changes made during sandbox sprint
    spawnSync('git', ['checkout', '--', '.'], { cwd: projectRoot, encoding: 'utf-8' });
    // Then restore original stash
    spawnSync('git', ['stash', 'pop'], { cwd: projectRoot, encoding: 'utf-8' });
  } catch { /* non-fatal */ }
}

// ─── Dry-Run Scope Preview (born-629b / 407-004) ─────────────────

export interface DryRunScopePreview {
  /** Post-adoption (when validated) filesWrite per task id — pre-adoption on fallback. */
  scopeByTask: Map<string, string[]>;
  /** True once git ls-files + evaluateScopeGate ran successfully. */
  validated: boolean;
  /** Set when the scope gate would BLOCK a real `deckent start` at this repo state. */
  blockedMessage?: string;
}

/**
 * Preview the POST-adoption scope.filesWrite per task the same way runSprint
 * (sprint-controller.ts, real pre-spawn gate) computes it right before spawn:
 * evaluateScopeGate + applyScopeResolutions against the real tracked-file set.
 * `deckent start --dry-run` calls planSprint() directly and never reaches that
 * gate, so without this the operator-visible plan table showed PRE-adoption
 * scope while the worker ultimately receives the adopted (typo-fixed) scope — a
 * trust-surface mismatch. Preview-only: never mutates task files, never blocks;
 * fails open to the pre-adoption scope on any git/gate error. When the gate would
 * actually BLOCK, adoption never runs in the real sprint either (sprint-controller
 * .ts applies resolutions strictly after the ok-check) — so this returns the
 * pre-adoption scope plus the block message instead of a fictitious adopted one.
 */
export function computeDryRunScopePreview(
  root: string,
  tasks: Array<{ id: string; scope?: { filesWrite?: string[]; filesRead?: string[]; directories?: string[] } }>,
  acknowledgeScopePaths: boolean,
): DryRunScopePreview {
  const scopeByTask = new Map<string, string[]>(tasks.map(t => [t.id, t.scope?.filesWrite ?? []]));
  try {
    const lsFiles = spawnSync('git', ['ls-files'], {
      cwd: root, encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024,
    });
    if (lsFiles.status !== 0 || typeof lsFiles.stdout !== 'string') {
      return { scopeByTask, validated: false };
    }
    const scopeGate = evaluateScopeGate({
      tasks: tasks.map(t => ({ id: t.id, scope: t.scope ?? {} })),
      trackedFiles: lsFiles.stdout.split('\n').filter(Boolean),
      acknowledgeScopePaths,
      resolveSuggestions: true,
    });
    if (!scopeGate.ok) {
      return { scopeByTask, validated: true, blockedMessage: scopeGate.message };
    }
    for (const t of tasks) {
      const writes = t.scope?.filesWrite ?? [];
      const { filesWrite } = applyScopeResolutions(t.id, writes, scopeGate.resolutions ?? []);
      scopeByTask.set(t.id, filesWrite);
    }
    return { scopeByTask, validated: true };
  } catch {
    return { scopeByTask, validated: false };
  }
}

// ─── Watch Subprocess Log Helper ─────────────────────────────────

/**
 * Display subprocess worker logs (for non-tmux providers).
 * Tails all .tasks/*.log files and prints new lines as they appear.
 * Returns a cleanup function.
 */
export function watchSubprocessLogs(projectRoot: string, intervalMs = 2000): () => void {
  const tasksDir = join(projectRoot, '.tasks');
  const seen = new Map<string, number>(); // file -> last byte offset

  const tick = (): void => {
    if (!existsSync(tasksDir)) return;
    try {
      const logFiles = readdirSync(tasksDir).filter(f => f.endsWith('.log'));
      for (const file of logFiles) {
        const filePath = join(tasksDir, file);
        try {
          const content = readFileSync(filePath, 'utf-8');
          const lastOffset = seen.get(file) ?? 0;
          if (content.length > lastOffset) {
            const newContent = content.slice(lastOffset);
            process.stdout.write(`[${file.replace('.log', '')}] ${newContent}`);
            seen.set(file, content.length);
          }
        } catch { /* ignore per-file errors */ }
      }
    } catch { /* ignore */ }
  };

  const interval = setInterval(tick, intervalMs);
  return () => clearInterval(interval);
}

interface StartCommandOpts {
  autoApprove?: boolean;
  sandboxMode?: boolean;
  sandbox?: boolean;
  dryRun?: boolean;
  force?: boolean;
  forceScope?: boolean;
  forcePromptGate?: boolean;
  /** B1a: consciously bypass the approved-flow guard and plan fresh. */
  forceReplan?: boolean;
  /** B1b: pick one of several approved flows for canonical consumption. */
  consumeApproved?: string;
  watch?: boolean;
  timeout?: string;
  forceDirectives?: boolean;
  /** TERM-FLOW-UNIFY Sprint-4 (426-001) — see registerStart's option block below. */
  flowId?: string;
  revision?: string;
  planDigest?: string;
  exactAttemptId?: string;
  exactOwnerNonce?: string;
  exactLogRef?: string;
}

export interface StartCommandRuntime {
  readonly providerAuthority?: ProviderAuthorityRuntimeServiceOpenResult;
}

async function runStartEnvironmentPreflight(input: {
  readonly root: string;
  readonly config: ResolvedConfig;
  readonly opts: StartCommandOpts;
  readonly lang: string;
  readonly sandboxState: SandboxState | null;
}): Promise<boolean> {
  const { root, config, opts, lang, sandboxState } = input;
  if (opts.force) return true;

  const pidSprintIds = listPidFiles(root);
  const lastSprintId = (config as unknown as Record<string, unknown>).last_sprint_id as string | undefined;
  if (lastSprintId && !pidSprintIds.includes(lastSprintId)) {
    pidSprintIds.push(lastSprintId);
  }
  for (const sprintId of pidSprintIds) {
    const orphan = detectOrphan(root, sprintId);
    if (!orphan) continue;
    if (opts.autoApprove) {
      archiveOrphan(root, orphan);
      print(`Orphan sprint ${sprintId} (PID ${orphan.pid}) auto-archived.`);
      continue;
    }
    printError(new Error(
      `Orphan sprint detected: ${sprintId} (PID ${orphan.pid} is dead). ` +
      'Run with --auto-approve to auto-archive, or use --force to skip this check.',
    ));
    if (sandboxState) restoreSandbox(root, sandboxState);
    process.exitCode = 2;
    return false;
  }

  const lockInfo = isSprintLocked(root);
  if (lockInfo.locked) {
    if (sandboxState) restoreSandbox(root, sandboxState);
    printError(new Error(
      `Sprint already running (PID ${lockInfo.pid}, env: ${lockInfo.env}, sprint: ${lockInfo.sprintId}, started: ${lockInfo.acquiredAt}). Use --force to override.`,
    ));
    process.exitCode = 1;
    return false;
  }

  const spawnBackend = (config as unknown as Record<string, unknown>).spawn_backend as string | undefined;
  const doctorResult = runDoctorChecks(root, undefined, spawnBackend);
  const requiredFailed = doctorResult.checks.filter(check => check.required && !check.passed);
  if (requiredFailed.length > 0) {
    if (sandboxState) restoreSandbox(root, sandboxState);
    printError(new Error(`Pre-flight failed: ${requiredFailed.map(check => `${check.name}: ${check.message}`).join('; ')}`));
    print(getMessage('start.use_force', lang));
    process.exitCode = 1;
    return false;
  }

  const limitGate = await checkStartLimitGate(root, lang);
  if (limitGate.message) print(limitGate.message);
  if (limitGate.blocked && !opts.dryRun) {
    if (sandboxState) restoreSandbox(root, sandboxState);
    process.exitCode = 1;
    return false;
  }
  return true;
}

export function registerStart(program: Command, runtime: StartCommandRuntime = {}): void {
  program
    .command('start [description]')
    .description(getMessage('cli.start.desc', getLanguage(undefined)))
    .option('--auto-approve', 'Auto-approve worker actions (--dangerously-skip-permissions)')
    .option('--sandbox-mode', 'Run in sandbox mode (git stash + restore)')
    .option('--sandbox', 'Use sandbox spawn backend (memory-cap + path-jail isolation, no Docker required)')
    .option('--dry-run', 'Plan sprint without spawning workers')
    .option('--force', 'Skip doctor pre-flight checks')
    .option('--force-scope', 'Bypass the pre-spawn scope gate (allow write paths that do not exist / look like typos)')
    .option('--force-prompt-gate', 'Bypass the plan-time prompt-gate BLOCK (persona-capability mismatch)')
    .option('--force-replan', 'Consciously bypass the approved-flow guard: plan fresh even though an approved, not-yet-executed RunFlow snapshot exists')
    .option('--consume-approved <flowId>', 'B1b: consume a specific approved, not-yet-executed RunFlow snapshot through the canonical run-flow machinery (needed only when several approved flows exist)')
    .option('--watch', 'Automatically open watch mode after sprint spawns workers')
    .option('--timeout <ms>', 'Sprint timeout in milliseconds (default: 30 minutes)')
    .option('--force-directives', 'Override existing DIRECTIVES.md in zero-config mode')
    .option('--flow-id <id>', 'TERM-FLOW-UNIFY (426-001): consume an approved RunFlow snapshot instead of planning fresh — requires --revision, --plan-digest and config.terminal.run_flow_v2=true')
    .option('--revision <n>', 'RunFlow proposal revision to CAS-verify against the approved snapshot (used with --flow-id)')
    .option('--plan-digest <digest>', 'RunFlow planDigest to CAS-verify against the approved snapshot (used with --flow-id)')
    .addOption(new Option('--exact-attempt-id <id>').hideHelp())
    .addOption(new Option('--exact-owner-nonce <nonce>').hideHelp())
    .addOption(new Option('--exact-log-ref <path>').hideHelp())
    .action(async (description: string | undefined, opts: StartCommandOpts) => {
      const root = resolveProjectRoot();
      let authorityConfig: Awaited<ReturnType<typeof loadConfig>> | undefined;
      if (runtime.providerAuthority) {
        try {
          authorityConfig = await loadConfig(root);
          const admission = preflightCliBrainProviderAuthority(
            runtime.providerAuthority,
            authorityConfig,
            root,
            `cli-start:${process.pid}`,
          );
          if (admission.decision === 'hold') {
            printError(new Error(getMessage('run.provider_authority_hold', authorityConfig.language, {
              reason: admission.reasonCode,
              evidence: admission.authorityEvidenceRefs.join(','),
            })));
            const remedy = providerAuthorityHoldRemedy(admission.reasonCode, authorityConfig.language);
            if (remedy) print(remedy);
            process.exitCode = 1;
            return;
          }
        } catch (error) {
          printError(error);
          process.exitCode = 1;
          return;
        }
      }

      // ─── Zero-Config Mode ────────────────────────────────────────
      let zeroConfigResult: ReturnType<typeof prepareZeroConfig> | null = null;

      let warnDirectivesExist = false;

      if (description) {
        // --force-directives: remove existing DIRECTIVES.md so zero-config overwrites it
        if (opts.forceDirectives) {
          const dirPath = join(root, 'DIRECTIVES.md');
          if (existsSync(dirPath)) unlinkSync(dirPath);
        }
        zeroConfigResult = prepareZeroConfig(root, description);
        if (zeroConfigResult.alreadyExisted) {
          warnDirectivesExist = true;
          // Don't create temp file — use existing DIRECTIVES.md as-is
          zeroConfigResult = null;
        }
      }

      // ─── Sandbox State ───────────────────────────────────────────
      let sandboxState: SandboxState | null = null;
      let lang = 'en';
      let approvalAuthority: ReturnType<typeof bootstrapApprovalAuthority> | undefined;

      try {
        const config = authorityConfig ?? await loadConfig(root);
        lang = config.language;
        approvalAuthority = bootstrapApprovalAuthority(root, config);

        // ─── TERM-FLOW-UNIFY Sprint-4 (426-001): approved-snapshot-consuming
        // start ────────────────────────────────────────────────────────────
        // When --flow-id/--revision/--plan-digest are ALL given (+ flag on),
        // this branch NEVER calls planSprint/runPlanPhase — see
        // orchestra/run-job-service.ts (CAS/idempotency, structurally
        // replan-free) + RunSprintOptions.preplannedSprint. Completely
        // self-contained and returns before any legacy re-planning path is
        // reached. Environment and cost admission use the same authorities as
        // legacy start, but consume only the approved exact Sprint.
        // Absent flow flags (every existing invocation) never enters this
        // branch at all — zero behavior change for the legacy path.
        const flowFlagsGiven = [opts.flowId, opts.revision, opts.planDigest].filter(v => v !== undefined).length;
        if (flowFlagsGiven > 0) {
          if (flowFlagsGiven !== 3) {
            printError(new Error('--flow-id, --revision and --plan-digest must be supplied together.'));
            process.exitCode = 1;
            return;
          }
          if (config.terminal?.run_flow_v2 !== true) {
            printError(new Error('--flow-id requires config.terminal.run_flow_v2 = true.'));
            process.exitCode = 1;
            return;
          }
          const expectedRevision = Number(opts.revision);
          if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1) {
            printError(new Error(`--revision must be a number, got: ${opts.revision}`));
            process.exitCode = 1;
            return;
          }
          const flowId = opts.flowId!;
          const expectedPlanDigest = opts.planDigest!;
          const approvedSnapshot = loadApprovedSnapshot(root, flowId);
          const capabilityParts = [
            opts.exactAttemptId,
            opts.exactOwnerNonce,
            opts.exactLogRef,
          ].filter(value => value !== undefined).length;
          if (capabilityParts !== 3) {
            printError(new Error(getMessage('start.exact_capability_required', lang)));
            process.exitCode = 1;
            return;
          }

          let exactSprint;
          try {
            exactSprint = startApprovedRun({
              flowId,
              expectedRevision,
              expectedPlanDigest,
              approvedSnapshot,
            }).sprint;
          } catch (err) {
            if (
              err instanceof RunJobFlowNotApprovedError ||
              err instanceof RunJobDigestMismatchError
            ) {
              printError(err);
              process.exitCode = 1;
              return;
            }
            throw err;
          }

          const attempt = loadStartAttempt(root, opts.exactAttemptId!);
          if (
            !attempt
            || attempt.flowId !== flowId
            || attempt.revision !== expectedRevision
            || attempt.planDigest !== expectedPlanDigest
            || attempt.owner.ownerNonce !== opts.exactOwnerNonce
            || attempt.state !== 'PROCESS_SPAWNED'
          ) {
            printError(new Error(getMessage('start.exact_attempt_mismatch', lang)));
            process.exitCode = 1;
            return;
          }
          const capability: ExactStartCapability = {
            schemaVersion: 1,
            flowId,
            revision: expectedRevision,
            planDigest: expectedPlanDigest,
            generation: attempt.generation,
            attemptId: attempt.attemptId,
            ownerNonce: attempt.owner.ownerNonce,
          };
          const liveStartToken = processStartToken(process.pid);
          const processIdentity: StartAttemptProcessIdentity = liveStartToken === null
            ? { pid: process.pid, startToken: null, evidence: 'unavailable' }
            : { pid: process.pid, startToken: liveStartToken, evidence: 'verified' };
          if (
            attempt.process?.pid !== processIdentity.pid
            || attempt.process.startToken !== processIdentity.startToken
            || attempt.process.evidence !== processIdentity.evidence
          ) {
            printError(new Error(getMessage('start.exact_attempt_mismatch', lang)));
            process.exitCode = 1;
            return;
          }
          const freshCapability = {
            attemptId: capability.attemptId,
            ownerNonce: capability.ownerNonce,
          };
          const handle: RunHandle = {
            flowId,
            jobId: `flow-${flowId}-r${expectedRevision}`,
            logRef: opts.exactLogRef!,
          };
          const coordinator = getRunFlowCoordinator(root);
          const settleBlocked = (code: string, detail: string): void => {
            settleExactRunAttempt({
              root,
              capability,
              process: processIdentity,
              freshCapability,
              settlement: {
                state: 'BLOCKED',
                code,
                detail,
                settledAt: new Date().toISOString(),
              },
            });
            try {
              coordinator.recordRunFailure({
                flowId,
                error: detail,
                commandId: `child-blocked-${flowId}-${code}`,
              });
            } catch { /* attempt journal remains canonical */ }
          };

          if (!await runStartEnvironmentPreflight({
            root,
            config,
            opts,
            lang,
            sandboxState: null,
          })) {
            settleBlocked(
              'EXACT_CHILD_ENVIRONMENT_PREFLIGHT_HOLD',
              'Exact child environment preflight refused execution before provider bootstrap.',
            );
            return;
          }

          // The approved snapshot is the immutable plan authority for this
          // branch. Cost-admit those exact tasks before invoking runSprint;
          // never re-plan merely to estimate cost.
          try {
            initCostConfig(root);
            const costConfig = loadCostConfig(root);
            const cfgAuthMode = await readAuthMode(root);
            const costTasks: TaskCostInput[] = exactSprint.tasks.map((t) => ({
              ...buildTaskCostInput(t, costConfig.estimator),
              billingMode: resolveBillingModeForAuth(t.provider, t.authMode ?? cfgAuthMode),
            }));
            const gate = evaluateCostGate({
              tasks: costTasks,
              costConfig,
              acknowledgeCost: opts.force === true,
            });
            if (!gate.ok) {
              const overrideHint = gate.reason === 'COST_PRICING_UNKNOWN'
                ? ''
                : ' (CLI: override with --force.)';
              printError(new Error(gate.message + overrideHint));
              settleBlocked('EXACT_CHILD_COST_HOLD', gate.message);
              process.exitCode = 1;
              return;
            }
          } catch (err) {
            const error = err instanceof Error ? err : new Error(String(err));
            printError(error);
            settleBlocked('EXACT_CHILD_COST_GATE_UNAVAILABLE', error.message);
            process.exitCode = 1;
            return;
          }

          let sprintResult;
          try {
            const bootstrap = await bootstrapProviders(config);
            bootstrapNotifyDispatcher({
              projectRoot: root,
              webhook: resolveWebhookBootstrapOption(config),
            });
            sprintResult = await runSprint(root, config, {
              connector: bootstrap.connector,
              autoApprove: opts.autoApprove === true,
              acknowledgeScopePaths: opts.forceScope === true,
              acknowledgePromptGate: opts.forcePromptGate === true,
              sandboxMode: opts.sandboxMode,
              timeoutMs: opts.timeout ? parseInt(opts.timeout, 10) : undefined,
              preplannedSprint: exactSprint,
              exactPlanAuthority: {
                flowId,
                revision: expectedRevision,
                planDigest: expectedPlanDigest,
                ...(approvedSnapshot?.sourceAuthority !== undefined
                  ? { sourceAuthority: approvedSnapshot.sourceAuthority }
                  : {}),
              },
              onExactPlanMaterialize: () => {
                materializeExactPlanTaskArtifacts(root, {
                  capability,
                  approvedSnapshot: approvedSnapshot!,
                });
              },
              onExecutionAdmitted: async () => {
                const gitBase = await captureGitBase(root);
                const admitted = admitExactRunAttempt({
                  root,
                  capability,
                  approvedSnapshot: approvedSnapshot!,
                  process: processIdentity,
                  handle,
                  freshCapability,
                  ...(gitBase !== undefined ? { gitBase } : {}),
                  onAdmitted: ({ handle: admittedHandle }) => {
                    coordinator.recordRunStarted({
                      handle: admittedHandle,
                      commandId: `run-started-${flowId}-r${expectedRevision}`,
                    });
                  },
                });
                if (admitted.lifecyclePublication.status === 'uncertain') {
                  throw new DeckentError('E_EXACT_START_RUN_STARTED_PUBLICATION_UNCERTAIN', 'EXACT_START_RUN_STARTED_PUBLICATION_UNCERTAIN');
                }
              },
              ...(runtime.providerAuthority
                ? { providerAuthority: runtime.providerAuthority }
                : {}),
              ...(approvalAuthority.state === 'ready'
                ? {
                    attendedExecutionApprovalAuthority:
                      approvalAuthority.runtime.attendedExecutionApprovalAuthority,
                  }
                : {}),
              // SURF-0.2 (Task 432-002): the --flow-id value received above reaches
              // runSprint as-is via this already-extracted `flowId` const -- no new
              // id generation, no env fallback.
              flowId,
            });
          } catch (err) {
            try {
              settleExactRunAttempt({
                root,
                capability,
                process: processIdentity,
                freshCapability,
                settlement: {
                  state: 'FAILED',
                  code: 'EXACT_CHILD_RUNTIME_FAILED',
                  detail: err instanceof Error ? err.message : String(err),
                  settledAt: new Date().toISOString(),
                },
              });
            } catch { /* death sweep/reconciliation owns an uncertain settlement */ }
            try {
              coordinator.recordRunFailure({
                flowId,
                error: `run crashed before completion: ${err instanceof Error ? err.message : String(err)}`,
                commandId: `child-crash-${flowId}`,
              });
            } catch { /* attempt journal remains canonical */ }
            throw err;
          }
          if (sprintResult.status === 'PAUSED') {
            const authority = readCanonicalRunStatus(root, { sprintIdHint: sprintResult.id });
            const detail = authority.reason ?? authority.status ?? '';
            settleExactRunAttempt({
              root,
              capability,
              process: processIdentity,
              freshCapability,
              settlement: {
                state: 'BLOCKED',
                code: 'EXACT_CHILD_PAUSED',
                detail,
                settledAt: new Date().toISOString(),
              },
            });
            try {
              coordinator.recordRunPaused({
                flowId,
                reason: detail,
                resumeCommand: `deckent recover ${sprintResult.id} --resume`,
                commandId: `child-paused-${flowId}`,
              });
            } catch { /* terminal attempt journal remains canonical */ }
            print(renderPausedRun(root, sprintResult.id, lang));
            process.exitCode = 2;
            return;
          }
          settleExactRunAttempt({
            root,
            capability,
            process: processIdentity,
            freshCapability,
            settlement: {
              state: 'COMPLETED',
              code: 'EXACT_CHILD_COMPLETED',
              settledAt: new Date().toISOString(),
            },
          });
          try {
            coordinator.recordCompletion({
              flowId,
              summary: `run ${sprintResult.id} completed`,
              commandId: `child-complete-${flowId}`,
            });
          } catch { /* terminal attempt journal remains canonical */ }
          print(formatSprintSummary(sprintResult));
          return;
        }

        // ─── Provider Bootstrap (with cache) ─────────────────────
        const configHash = makeConfigHash(config);
        const existingCache = readProviderCache(root);
        let bootstrap: BootstrapResult;

        if (existingCache && isProviderCacheFresh(existingCache, configHash)) {
          // Cache is fresh — bootstrap still runs but we can note providers are known
          bootstrap = await bootstrapProviders(config);
        } else {
          bootstrap = await bootstrapProviders(config);
          writeProviderCache(root, bootstrap, configHash);
        }

        if (description && !warnDirectivesExist && zeroConfigResult) {
          print(getMessage('start.zero_config_created', lang, { description }));
        }

        if (warnDirectivesExist) {
          print(getMessage('start.zero_config_directives_exist', lang));
        }

        if (opts.sandboxMode) {
          // Git stash + restore sandbox mechanism
          sandboxState = applySandbox(root);
          if (sandboxState.applied) {
            print('Sandbox mode: stashed local changes. Will restore after sprint.');
          } else {
            print('Sandbox mode: no changes to stash. Running sprint on clean state.');
          }
          // Continue with sprint in sandbox mode (does not abort)
        }

        // Orphan, sprint-lock, doctor and provider-limit authority is shared
        // with exact-snapshot children; neither ingress can bypass it.
        if (!await runStartEnvironmentPreflight({
          root,
          config,
          opts,
          lang,
          sandboxState,
        })) {
          return;
        }

        // ─── B1a: approved-flow guard (smoke 2026-08-07, B1) ─────────────
        // Bare start used to replan silently — with REAL provider cost (AI
        // planner and/or routing tie-judge calls) — while an approved,
        // unconsumed RunFlow snapshot sat in the store, executing a DIFFERENT
        // plan from the one the owner approved. That is a governance bypass,
        // not a convenience. Refuse with typed guidance instead; --force-replan
        // is the conscious override. A flow counts as consumed once a run
        // handle exists for it (a run actually started); an approved snapshot
        // with no handle is an approval still awaiting execution.
        // With no approved flow in the store this block changes nothing.
        {
          // Read-only advisory scan — fail-SOFT. An unreadable/corrupt store
          // must not brick bare start (that would invert the guard into a new
          // availability failure); it only reverts to the pre-guard behaviour,
          // logged for the auditor. The hard authority over approved plans
          // remains the coordinator's CAS-verified exact path.
          let approvedUnconsumed: ReturnType<typeof loadApprovedSnapshot>[] = [];
          try {
            approvedUnconsumed = listFlowIds(root)
              .map((id) => loadApprovedSnapshot(root, id))
              .filter((snap): snap is NonNullable<typeof snap> => snap !== undefined)
              .filter((snap) => loadRunHandle(root, snap.flowId) === undefined)
              // A run handle is not the only way an approval stops awaiting
              // execution. Measured 2026-08-10: 21 flows were retired through the
              // inbox and every one folded to a terminal CANCELLED, yet this guard
              // still listed them and still demanded --force-replan — because
              // aborting a flow creates no handle, and the handle was the sole
              // liveness test here. That left two sources of truth for the same
              // question, with the guard deaf to the state machine's verdict. A
              // terminal flow cannot be awaiting execution, whatever its snapshot
              // says. Fail-soft like the scan around it: an unreadable context is
              // treated as still-awaiting, the conservative side.
              .filter((snap) => {
                try {
                  return !isTerminalRunFlowState(
                    getRunFlowCoordinator(root).getFlow(snap.flowId).state,
                  );
                } catch (e) {
                  debugLog('start:approvedFlowGuard:flowState', e);
                  return true;
                }
              })
              .sort((a, b) => ((a?.approvedAt ?? '') < (b?.approvedAt ?? '') ? 1 : -1));
          } catch (e) {
            debugLog('start:approvedFlowGuard:storeRead', e);
            approvedUnconsumed = [];
          }
          if (approvedUnconsumed.length > 0) {
            if (opts.forceReplan === true) {
              print(getMessage('start.approved_flow_guard.overridden', lang));
            } else if (config.terminal?.run_flow_v2 === true
              && (approvedUnconsumed.length === 1 || opts.consumeApproved !== undefined)) {
              // ─── B1b: canonical consumption (owner cümlesi: "onu tüketsin") ──
              // The SINGLE approved flow (or the one picked via
              // --consume-approved) is executed through the SAME machinery the
              // REPL/do journey uses — startRunFlow → detached exact child with
              // full CAS capability. No replan, no twin code path.
              const picked = opts.consumeApproved !== undefined
                ? approvedUnconsumed.find((snap) => snap?.flowId === opts.consumeApproved)
                : approvedUnconsumed[0];
              if (!picked) {
                printError(new Error(getMessage('start.approved_flow_guard.multiple', lang)));
                process.exitCode = 1;
                return;
              }
              print(getMessage('start.approved_flow_guard.consuming', lang, {
                flowId: picked.flowId,
                revision: String(picked.revision),
                planDigest: picked.planDigest.slice(0, 16),
              }));
              try {
                const started = startRunFlow(root, picked.flowId, {
                  lineage: {
                    tenantId: picked.proposal?.tenant ?? 'local',
                    actor: picked.approvedBy,
                    origin: 'cli',
                    correlationId: picked.flowId,
                    idempotencyKey: `start:${picked.flowId}:r${picked.revision}`,
                    sourceId: 'cli:start-consume',
                    authorization: { kind: 'approved-actor' },
                  },
                  spawnStart: buildFlowStartSpawn(root, picked.revision, picked.planDigest),
                });
                if (started.status === 'noop-duplicate') {
                  print(getMessage('start.approved_flow_guard.consumed_duplicate', lang, {
                    state: started.attempt.state,
                  }));
                }
              } catch (err) {
                if (err instanceof RunFlowDecisionError) {
                  printError(err);
                  process.exitCode = 1;
                  return;
                }
                throw err;
              }
              return;
            } else if (config.terminal?.run_flow_v2 === true && approvedUnconsumed.length > 1) {
              const SHOWN = 3;
              print(getMessage('start.approved_flow_guard.header', lang, {
                count: String(approvedUnconsumed.length),
              }));
              for (const snap of approvedUnconsumed.slice(0, SHOWN)) {
                if (!snap) continue;
                print(getMessage('start.approved_flow_guard.flow_line', lang, {
                  flowId: snap.flowId,
                  revision: String(snap.revision),
                  planDigest: snap.planDigest.slice(0, 16),
                  approvedAt: snap.approvedAt,
                }));
              }
              print(getMessage('start.approved_flow_guard.multiple', lang));
              process.exitCode = 1;
              return;
            } else {
              const SHOWN = 3;
              print(getMessage('start.approved_flow_guard.header', lang, {
                count: String(approvedUnconsumed.length),
              }));
              for (const snap of approvedUnconsumed.slice(0, SHOWN)) {
                if (!snap) continue;
                print(getMessage('start.approved_flow_guard.flow_line', lang, {
                  flowId: snap.flowId,
                  revision: String(snap.revision),
                  planDigest: snap.planDigest.slice(0, 16),
                  approvedAt: snap.approvedAt,
                }));
              }
              if (approvedUnconsumed.length > SHOWN) {
                print(getMessage('start.approved_flow_guard.more', lang, {
                  count: String(approvedUnconsumed.length - SHOWN),
                }));
              }
              print(getMessage('start.approved_flow_guard.remedy', lang));
              print(getMessage('start.approved_flow_guard.v2_required', lang));
              process.exitCode = 1;
              return;
            }
          }
        }

        // WIRE-002 (MASTER-PLAN §4G): wire DECKENT→USER:NOTIFY to this terminal.
        // Pure-CLI sprints previously had a null global dispatcher, so every
        // notify() (task-done, sprint-finalized, human-checkpoint-required) was
        // a silent no-op. Bootstrap once the command is committed to running so
        // lifecycle notifications reach the operator + .deckent/notify-log.jsonl.
        // BOT-001: also fan notifications out to configured messaging connectors
        // (Telegram/Discord) so they reach the operator's phone. Fail-safe — a
        // misconfigured connector logs + skips, never blocks the sprint.
        // KPI Faz-2: forward a sprint-end KPI summary fn — broadcast (non-blocking)
        // to connectors on sprint-finalized. No-op when no connectors are configured.
        const connectorAdapter = await buildConnectorAdapterWithKpiSummary(
          config.notify_connectors,
          { kpiSummaryFn: buildSprintKpiSummaryFn(root, lang) },
        );
        bootstrapNotifyDispatcher({
          projectRoot: root,
          extraAdapters: connectorAdapter ? [connectorAdapter] : [],
          webhook: resolveWebhookBootstrapOption(config),
        });

        // Dry-run mode: plan only, no spawn
        if (opts.dryRun) {
          if (opts.watch) {
            print(getMessage('start.watch_ignored_dry_run', lang));
          }
          const context = readContext(root);
          const recommendation: SprintSizeRecommendation = {
            size: 'full',
            maxWorkers: typeof config.activeModeConfig.max_workers === 'number' ? config.activeModeConfig.max_workers : 4,
            modelConstraint: null,
            reason: 'No usage constraints',
          };
          const sprint = await planSprint(root, config, context, recommendation, {
            dryRun: true,
          });

          print(getMessage('start.sprint_planned', lang, {
            number: String(sprint.number),
            id: sprint.id,
            count: String(sprint.tasks.length),
          }));

          // born-629(b) / 407-004: show POST-adoption scope in the plan table (not
          // PRE-adoption) — see computeDryRunScopePreview's doc comment for why.
          // messages.ts is outside this task's write scope, so the honest-note text
          // below is an inline lang-branch rather than a getMessage() key (noted as
          // a follow-up in the task result).
          const scopePreview = computeDryRunScopePreview(root, sprint.tasks, opts.forceScope === true);
          const headers = ['ID', 'Title', 'Model', 'Priority', 'Scope (write)'];
          const rows = sprint.tasks.map(t => [
            t.id, t.title, t.model, t.priority,
            (scopePreview.scopeByTask.get(t.id) ?? []).join(', ') || '—',
          ]);
          print(formatTable(headers, rows));

          if (scopePreview.blockedMessage) {
            print(lang === 'tr'
              ? `⚠ Scope-gate bu run'ı spawn anında BLOKE eder: ${scopePreview.blockedMessage}`
              : `⚠ The scope gate would BLOCK this run at spawn time: ${scopePreview.blockedMessage}`);
          } else if (scopePreview.validated) {
            print(lang === 'tr'
              ? 'Not: Scope (write) sütunu spawn-öncesi scope-gate adoption önizlemesidir (best-effort) — '
                + "nihai scope, gerçek başlatmada task-XXX.json'a yazılır."
              : 'Note: the Scope (write) column is a best-effort pre-spawn scope-gate adoption preview — '
                + 'the final scope is written to task-XXX.json at actual spawn time.');
          } else {
            print(lang === 'tr'
              ? 'Not: scope adoption doğrulanamadı (git ls-files başarısız) — gösterilen scope adoption-ÖNCESİdir; '
                + "scope adoption uygulanabilir, nihai scope task-JSON'da."
              : 'Note: scope adoption could not be validated (git ls-files failed) — the scope shown is '
                + 'PRE-adoption; scope adoption may still apply, the final scope lives in task-JSON.');
          }

          if (sprint.reasoning) {
            print(getMessage('start.reasoning', lang, { reasoning: sprint.reasoning }));
          }
          if (sprint.planningMode) {
            print(getMessage('start.planning_mode', lang, { mode: sprint.planningMode }));
          }
          if (sprint.plannerProof) {
            print(getMessage('planning.proof', lang, {
              requested: sprint.plannerProof.requestedMode,
              actual: sprint.plannerProof.actualMode,
              call: sprint.plannerProof.call.attempted
                ? (sprint.plannerProof.call.succeeded ? 'succeeded' : 'failed')
                : 'not-attempted',
              reason: sprint.plannerProof.resolutionReason,
            }));
            const receiptRef = sprint.plannerProof.call.receiptRef;
            if (receiptRef) {
              print(getMessage('planning.receipt_ref', lang, {
                invocationId: receiptRef.invocationId,
                tenantId: receiptRef.tenantId,
                projectId: receiptRef.projectId,
              }));
            }
          }
          print(getMessage('start.workers_info', lang, {
            count: String(sprint.tasks.length),
            model: config.activeModeConfig.brain_model,
          }));

          // ─── COST ESTIMATE (User Safety Shield — Sprint 141) ──────
          try {
            initCostConfig(root);
            const costConfig = loadCostConfig(root);
            const cfgAuthMode = await readAuthMode(root);
            // KN2 + ADR-G-036: estimator numbers are config-resolved (baseline
            // data → cost config); this table and the planner's budget stamping
            // share the same builder so the two can never drift.
            const costTasks: TaskCostInput[] = sprint.tasks.map((t) => ({
              ...buildTaskCostInput(t, costConfig.estimator),
              // F1-CB: billing follows effective auth — subscription/local tasks cost $0
              billingMode: resolveBillingModeForAuth(t.provider, t.authMode ?? cfgAuthMode),
            }));
            const estimate = estimateSprintCost(costTasks, costConfig);
            print(formatEstimate(estimate));
          } catch (err) {
            print(`⚠ Cost estimate unavailable: ${err instanceof Error ? err.message : String(err)}`);
          }

          print(getMessage('start.dry_run_complete', lang));
          return;
        }

        // ─── PRE-SPRINT COST GATE (User Safety Shield — Sprint 141) ─
        // Runs before spawn — prevents Sprint 140 $42 disaster from repeating.
        // Sprint 189 Task 189-008: shared evaluateCostGate() helper — same
        // logic now drives the MCP deckent_start path.
        try {
            initCostConfig(root);
            const costConfig = loadCostConfig(root);
            const context = readContext(root);
            const recommendation: SprintSizeRecommendation = {
              size: 'full',
              maxWorkers: typeof config.activeModeConfig.max_workers === 'number' ? config.activeModeConfig.max_workers : 4,
              modelConstraint: null,
              reason: 'Cost gate pre-plan',
            };
            // Cost admission is a preview boundary. Writing task artifacts here
            // used to happen before runSprint acquired leadership and reconciled
            // host-owned backend attempts; a stale Docker settlement could then
            // block startup after the new sprint had already polluted `.tasks/`.
            // The authoritative live plan remains runSprint's post-recovery PLAN.
            const planForCost = await planSprint(root, config, context, recommendation, {
              dryRun: true,
            });
            const cfgAuthMode = await readAuthMode(root);
            const costTasks: TaskCostInput[] = planForCost.tasks.map((t) => ({
              ...buildTaskCostInput(t, costConfig.estimator),
              // F1-CB: billing follows effective auth — subscription/local tasks cost $0
              billingMode: resolveBillingModeForAuth(t.provider, t.authMode ?? cfgAuthMode),
            }));
            const gate = evaluateCostGate({
              tasks: costTasks,
              costConfig,
              acknowledgeCost: opts.force === true,
            });
            print(formatEstimate(gate.estimate));

            if (!gate.ok) {
              if (sandboxState) restoreSandbox(root, sandboxState);
              const overrideHint = gate.reason === 'COST_PRICING_UNKNOWN'
                ? ''
                : ' (CLI: override with --force.)';
              printError(new Error(gate.message + overrideHint));
              process.exitCode = 1;
              return;
            }

            // ─── PRE-SPAWN CUMULATIVE-SPEND ADMISSION GATE (row 4091) ──
            // The estimate gate above checks only THIS sprint's cost. This gate
            // additionally projects the estimate on top of already-logged
            // daily/monthly spend (canonical authority: the resource ledger via
            // readSpendWindow) and REFUSES ADMISSION when a rolling limit would be
            // crossed. Flag-gated by cost_limits.enforce_spend_gate (default-off,
            // unchanged): flag-off → no read, no event, sprint start byte-for-byte
            // unchanged. --force acknowledges the breach and restores the previous
            // warn-only behaviour, mirroring the estimate gate's acknowledgeCost.
            // Enforcement stops at this boundary by design — a sprint that is
            // already running is never cut; only new admission stops.
            const spendAdmission = evaluateSpendAdmissionGate({
              root,
              costConfig,
              sprintEstimateUsd: gate.estimate.costRealistic,
              acknowledged: opts.force === true,
            });
            const spendWarn = spendAdmission.breach;
            if (spendWarn) {
              writeEvent(root, planForCost.id, 'brain', 'user', spendWarn.type, { ...spendWarn, sprintId: planForCost.id });
              print(`⚠️  [cost-advisory] ${spendWarn.message}`);
              notifyAsync('progress', planForCost.id, 'Cost limit warning', spendWarn.message);
            }
            if (!spendAdmission.ok) {
              if (sandboxState) restoreSandbox(root, sandboxState);
              printError(new Error(spendAdmission.message));
              process.exitCode = 1;
              return;
            }

            // Auto-confirm threshold
            if (!gate.autoConfirm) {
              const confirmed = await promptConfirm(
                `\nProceed with sprint at ~$${gate.estimate.costRealistic.toFixed(2)}?`,
                false,
              );
              if (!confirmed) {
                print('Sprint cancelled by user.');
                if (sandboxState) restoreSandbox(root, sandboxState);
                return;
              }
            }
        } catch (err) {
          if (sandboxState) restoreSandbox(root, sandboxState);
          printError(err instanceof Error ? err : new Error(String(err)));
          process.exitCode = 1;
          return;
        }

        // Set up watch window before runSprint blocks
        let stopSubprocessWatch: (() => void) | null = null;
        if (opts.watch) {
          if (isSessionActive()) {
            setupWatchWindow(TMUX_SESSION_NAME, root);
            print(getMessage('start.watch_window_created', lang));
          } else {
            // Subprocess alternative: tail .tasks/*.log files
            print('No tmux session — watching subprocess worker logs...');
            stopSubprocessWatch = watchSubprocessLogs(root);
          }
        }

        const timeoutMs = opts.timeout ? parseInt(opts.timeout, 10) : undefined;
        const sandboxSpawnBackend = opts.sandbox ? createSandboxBackend(root) : undefined;
        let sprintResult;
        try {
          sprintResult = await runSprint(root, config, {
            connector: bootstrap.connector,
            // CLI/MCP parity (ADR-022-V2, born-561): honor the --auto-approve flag —
            // commander leaves opts.autoApprove undefined when absent, so this
            // normalizes to a strict boolean, default false — same semantics as
            // deckent_start (src/mcp/tools/start.ts autoApprove === true).
            autoApprove: opts.autoApprove === true,
            // Dimension B: --force-scope bypasses the pre-spawn scope gate. Independent
            // of --force (cost/doctor) — the scope shield protects even force-run sprints.
            acknowledgeScopePaths: opts.forceScope === true,
            // born-628: --force-prompt-gate bypasses the plan-time G-series prompt gate
            // BLOCK (persona-capability / decision-space / scope-contract findings).
            // Independent of --force / --force-scope — mirrors the scope-gate override UX.
            acknowledgePromptGate: opts.forcePromptGate === true,
            sandboxMode: opts.sandboxMode,
            timeoutMs,
            spawnBackend: sandboxSpawnBackend,
            ...(runtime.providerAuthority
              ? { providerAuthority: runtime.providerAuthority }
              : {}),
            ...(approvalAuthority.state === 'ready'
              ? {
                  attendedExecutionApprovalAuthority:
                    approvalAuthority.runtime.attendedExecutionApprovalAuthority,
                }
              : {}),
          });
        } finally {
          if (stopSubprocessWatch) stopSubprocessWatch();
        }
        if (sprintResult.status === 'PAUSED') {
          print(renderPausedRun(root, sprintResult.id, lang));
          process.exitCode = 2;
          return;
        }
        print(formatSprintSummary(sprintResult));

        // Compact completion notification with agent breakdown
        const sm = sprintResult.metrics;
        if (sm) {
          const totalSec = Math.round(sm.durationMs / 1000);
          const mins = Math.floor(totalSec / 60);
          const secs = totalSec % 60;
          const dur = mins > 0 ? `${mins}dk ${secs}sn` : `${secs}sn`;
          const agentMap: Record<string, number> = {};
          for (const t of sprintResult.tasks) {
            const a = t.assignedAgent ?? 'generic';
            agentMap[a] = (agentMap[a] ?? 0) + 1;
          }
          const agentStr = Object.entries(agentMap).map(([a, c]) => `${a}(${c})`).join(', ');
          const completed = sm.completedTasks; // DONE + GO_WITH_TECH_DEBT
          const donePure = completed - sm.techDebtTasks;
          const debt = sm.techDebtTasks;
          const noGo = sm.noGoTasks;
          print('');
          print(`✅ Sprint ${sprintResult.id} tamamlandı (${dur})`);
          print(`   ${completed}/${sm.totalTasks} task: ${donePure} DONE, ${debt} TECH_DEBT, ${noGo} NO_GO`);
          print(`   Agent: ${agentStr}`);
        }
      } catch (error) {
        if (error instanceof ProviderExecutionIngressHoldError) {
          printError(new Error(getMessage('run.provider_authority_hold', lang, {
            reason: error.reasonCode,
            evidence: error.authorityEvidenceRefs.join(','),
          })));
          const remedy = providerAuthorityHoldRemedy(error.reasonCode, lang);
          if (remedy) print(remedy);
        } else if (error instanceof BrainError) {
          printError(new Error(`Sprint failed at phase ${error.phase ?? 'unknown'}: ${error.message}`));
          if (error.plannerProof) {
            print(getMessage('planning.proof', lang, {
              requested: error.plannerProof.requestedMode,
              actual: error.plannerProof.actualMode,
              call: error.plannerProof.call.attempted
                ? (error.plannerProof.call.succeeded ? 'succeeded' : 'failed')
                : 'not-attempted',
              reason: error.plannerProof.resolutionReason,
            }));
            const receiptRef = error.plannerProof.call.receiptRef;
            if (receiptRef) {
              print(getMessage('planning.receipt_ref', lang, {
                invocationId: receiptRef.invocationId,
                tenantId: receiptRef.tenantId,
                projectId: receiptRef.projectId,
              }));
            }
          }
        } else {
          printError(error);
        }
        // born-588: a gate-blok (e.g. pre-spawn scope-gate) surfaces as a BrainError here —
        // this line is what makes that block a non-zero exit for scripts/CI, not just a
        // printed message. Keep it unconditional for both branches above.
        process.exitCode = 1;
      } finally {
        if (approvalAuthority?.state === 'ready') approvalAuthority.runtime.close();
        // Always clean up temp DIRECTIVES.md (moved from try/catch to finally)
        if (zeroConfigResult) cleanupZeroConfig(zeroConfigResult);
        // Restore sandbox state if applied
        if (sandboxState) restoreSandbox(root, sandboxState);
      }
    });
}
