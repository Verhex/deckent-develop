import { existsSync, mkdirSync, unlinkSync, createReadStream, watch as fsWatch } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import { join } from 'node:path';
import type { Command } from 'commander';
import type { ModelType, TaskResult } from '../../core/types.js';
import { TaskStatus, ALL_PROVIDER_NAMES } from '../../core/types.js';
import { TASKS_DIR } from '../../core/constants.js';
import { DeckentError } from '../../core/errors.js';
import { print, printError } from '../helpers/output.js';
import { resolveProjectRoot } from '../helpers/process.js';
import {
  executeTaskIngress,
  readTaskIngressErrorAuthority,
} from '../../orchestra/task-mode-runner.js';
import type { CanonicalTaskDispatchBoundaryV2 } from '../../orchestra/scheduler-effects.js';
import { loadConfig, resolveDefaultModel } from '../../core/config.js';
import { buildExecutionRequest, resolveToTask, resolveExecutionModelIdentity } from '../../orchestra/execution-request-builder.js';
import { registerOpenRouterModelFromCache } from '../../core/openrouter-models.js';
import type { AttendedExecutionApprovalAuthority } from '../../core/attended-execution-approval.js';
import { bootstrapApprovalAuthority } from '../../core/approval-authority-bootstrap.js';
import type { ProviderAuthorityRuntimeServiceOpenResult } from '../../core/provider-authority-composition.js';
import { ProviderExecutionIngressHoldError } from '../../core/provider-execution-ingress-authority.js';
import {
  assertTaskResultSettlementRef,
  readClosedTaskResultSettlement,
  type TaskResultSettlementRefV1,
} from '../../core/task-result-settlement.js';
import {
  type OpenTaskSettlementAuthorityResult,
  type TaskSettlementInspection,
} from '../../core/task-settlement-authority.js';
import type {
  InvocationExecutionBackend,
} from '../../core/invocation-receipt.js';
import { canonicalJson } from '../../core/audit-writer.js';
import { cliContractMessage, renderContractHelp } from '../helpers/message-catalog/cli-run.js';

// ─── Types ──────────────────────────────────────────────────────────

export interface RunCommandOpts {
  model?: string;
  /** 453-001: explicit provider ownership (`--provider`) for an unseen versioned
   *  model ID; validated against the canonical registry before Task JSON / spawn. */
  provider?: string;
  /** F1-RE (268-003): native model reasoning-effort level (`--model-effort`). */
  modelEffort?: string;
  scope?: string;
  /** 2026-08-28 (F2): exact repo-relative write/read targets. A `--scope` directory
   *  alone produces an empty landing scope, which `normalizeScope` rejects with
   *  'Execution landing scope must contain at least one path' — so any run that
   *  reaches a landing checkpoint needs these. Absent → today's behaviour, byte-identical. */
  filesWrite?: string[];
  filesRead?: string[];
  timeout?: string;
  keep?: boolean;
  autoApprove?: boolean;
  verbose?: boolean;
}

export interface SingleTaskResult {
  taskId: string;
  selfAssessment: string;
  testsPassed: boolean;
  filesChanged: string[];
  notes: string;
}

export interface RunCommandRuntime {
  readonly attendedExecutionApprovalAuthority?: AttendedExecutionApprovalAuthority;
  readonly providerAuthority?: ProviderAuthorityRuntimeServiceOpenResult;
  /**
   * Production injects the immutable authority at the composition root. Keeping
   * this explicit lets lower-level command tests exercise their legacy mocks
   * without silently creating project state.
   */
  readonly openTaskSettlementAuthority?: (
    projectRoot: string,
  ) => OpenTaskSettlementAuthorityResult;
}

interface RunSettlementContext {
  readonly opened: OpenTaskSettlementAuthorityResult;
  readonly tenantId: string;
  readonly invocationId: string;
}

// ─── Helpers ────────────────────────────────────────────────────────

function now(): string {
  return new Date().toISOString();
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

import { readJsonSafe } from '../../core/utils.js';
import { normalizeTaskResultShape } from '../../core/task-result-schema.js';
import { getMessage, getLanguage } from '../helpers/messages.js';

export function createRunTaskId(): string {
  return `run-${Date.now()}-${randomBytes(8).readBigUInt64BE().toString(10)}`;
}

/**
 * 453-001: map a canonical model-resolution failure to a localized, actionable
 * CLI message. The registry throws a {@link DeckentError} whose `code` identifies
 * the exact failure mode; unknown codes fall back to the generic "unknown model"
 * guidance so the CLI never leaks a raw error code to the user.
 */
export function formatModelError(
  err: unknown,
  model: string,
  provider: string | undefined,
  lang: string,
): string {
  const code = err instanceof DeckentError ? err.code : '';
  // `providers` is interpolated from the runtime set so the guidance can never
  // drift from what the CLI actually accepts (OPENROUTER-PROVIDER, row 477 —
  // these messages previously hardcoded "claude|codex|gemini|ollama").
  const vars = {
    model,
    provider: provider ?? '',
    providers: ALL_PROVIDER_NAMES.join(', '),
  };
  switch (code) {
    case 'E_MODEL_ID_INVALID':
      return getMessage('run.model_err.invalid_id', lang, vars);
    case 'E_LEGACY_MODEL_ALIAS':
      return getMessage('run.model_err.legacy_alias', lang, vars);
    case 'E_MODEL_PROVIDER_MISMATCH':
      return getMessage('run.model_err.provider_mismatch', lang, vars);
    case 'E_PROVIDER_UNKNOWN':
      return getMessage('run.model_err.unknown_provider', lang, vars);
    // Row 477: distinct from provider_unverified — the user DID pass a provider;
    // what is missing is verified pricing (remedy: `deckent openrouter-probe`).
    case 'E_MODEL_PRICING_UNVERIFIED':
      return getMessage('run.model_err.pricing_unverified', lang, vars);
    case 'E_MODEL_PROVIDER_UNVERIFIED':
    default:
      return getMessage('run.model_err.provider_unverified', lang, vars);
  }
}

/**
 * @deprecated WM-1: superseded by `buildExecutionRequest` + `resolveToTask`
 * (orchestra/execution-request-builder.ts), which set `task.type` + the canonical
 * fields. No production caller remains (all 3 paths migrated); retained only for
 * existing test fixtures. Remove + migrate those fixtures when the test window reopens.
 */
export function buildRunTask(
  taskId: string,
  description: string,
  model: ModelType,
  scopeDir: string,
) {
  return {
    id: taskId,
    title: description.slice(0, 80),
    description,
    model,
    effort: 'normal' as const,
    priority: 'NORMAL' as const,
    reason: 'One-shot run command',
    scope: {
      directories: [scopeDir],
      filesRead: [],
      filesWrite: [],
    },
    dependencies: [],
    goNogo: {
      goCriteria: 'Task completed successfully',
      noGoCriteria: 'Task failed or errored',
      techDebtAcceptable: 'Minor issues acceptable',
    },
    status: TaskStatus.PENDING,
    createdAt: now(),
  };
}

export function cleanupRunTask(projectRoot: string, taskId: string): void {
  const extensions = ['.json', '.hb', '.result', '.plan', '.log'];
  for (const ext of extensions) {
    const filePath = join(projectRoot, TASKS_DIR, `task-${taskId}${ext}`);
    if (existsSync(filePath)) {
      try { unlinkSync(filePath); } catch { /* ignore */ }
    }
  }
}

function settleRunResult(
  context: RunSettlementContext,
  result: TaskResult,
  durationMs: number,
  evidenceRefs: readonly string[],
): TaskSettlementInspection {
  const accepted = result.selfAssessment === 'DONE'
    || result.selfAssessment === 'GO_WITH_TECH_DEBT';
  return context.opened.authority.settleDispatched({
    tenantId: context.tenantId,
    projectId: context.opened.projectId,
    invocationId: context.invocationId,
    outcome: 'succeeded',
    exitCode: null,
    signal: null,
    reasonCode: accepted ? 'none' : 'validation_failed',
    durationMs,
    consumerOutcome: accepted ? 'accepted' : 'rejected',
    taskDisposition: accepted ? 'done' : 'no_go',
    evidenceRefs,
  });
}

export function runResultEvidenceRef(result: TaskResult): string {
  const digest = createHash('sha256')
    .update(canonicalJson(result))
    .digest('hex');
  return `task-result:sha256:${digest}`;
}

export function normalizeWorkerDispatchBackend(
  backend: string,
): InvocationExecutionBackend {
  if (backend === 'docker' || backend === 'tmux') return backend;
  if (backend === 'host-adapter' || backend === 'subprocess') {
    return 'host-subprocess';
  }
  return 'unknown';
}

function assertRunResultIdentity(
  result: TaskResult,
  expectedTaskId: string,
): TaskResult {
  if (result.taskId !== expectedTaskId) {
    throw new DeckentError(
      'E_TASK_RESULT_IDENTITY_MISMATCH',
      'TASK_RESULT_IDENTITY_MISMATCH',
    );
  }
  return result;
}

/**
 * E) Read the worker heartbeat file. Returns null if file missing or malformed.
 */
export function readHeartbeat(projectRoot: string, taskId: string): { sequence: number; status: string; timestamp: string } | null {
  const hbPath = join(projectRoot, TASKS_DIR, `task-${taskId}.hb`);
  if (!existsSync(hbPath)) return null;
  try {
    const data = readJsonSafe<{ sequence?: number; status?: string; timestamp?: string }>(hbPath);
    if (!data) return null;
    return {
      sequence: data.sequence ?? 0,
      status: data.status ?? 'UNKNOWN',
      timestamp: data.timestamp ?? new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

/**
 * D) Wait for the task result file using fs.watch for instant detection.
 * Falls back to 5s polling if fs.watch is unavailable.
 * E) Also monitors the heartbeat to detect stale workers.
 */
export async function waitForRunResult(
  projectRoot: string,
  taskId: string,
  timeoutMs: number,
  opts?: { settlementRef?: TaskResultSettlementRefV1 },
): Promise<TaskResult | null> {
  const resultPath = join(projectRoot, TASKS_DIR, `task-${taskId}.result`);
  const tasksDir = join(projectRoot, TASKS_DIR);
  const settlementRef = opts?.settlementRef;
  if (settlementRef) assertTaskResultSettlementRef(projectRoot, taskId, settlementRef);

  const readAuthoritativeResult = (): TaskResult | null => {
    if (settlementRef) {
      const settlement = readClosedTaskResultSettlement(settlementRef);
      if (!settlement) return null;
      const result = normalizeTaskResultShape(settlement.result as unknown as TaskResult);
      return result ? assertRunResultIdentity(result, taskId) : null;
    }
    if (!existsSync(resultPath)) return null;
    const result = normalizeTaskResultShape(readJsonSafe<TaskResult>(resultPath));
    return result ? assertRunResultIdentity(result, taskId) : null;
  };

  // Check immediately first
  const immediate = readAuthoritativeResult();
  if (immediate) return immediate;

  return new Promise<TaskResult | null>((resolve, reject) => {
    let watcher: ReturnType<typeof fsWatch> | null = null;
    let fallbackTimer: ReturnType<typeof setInterval> | null = null;
    let timeoutTimer: ReturnType<typeof setTimeout> | null = null;
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    let lastHbSeq = -1;
    let staleCount = 0;
    const STALE_THRESHOLD = 3;

    const cleanup = (): void => {
      watcher?.close();
      if (fallbackTimer !== null) clearInterval(fallbackTimer);
      if (timeoutTimer !== null) clearTimeout(timeoutTimer);
      if (heartbeatTimer !== null) clearInterval(heartbeatTimer);
    };

    const checkResult = (): void => {
      try {
        const result = readAuthoritativeResult();
        if (!result) return;
        cleanup();
        resolve(result);
      } catch (error) {
        cleanup();
        reject(error);
      }
    };

    // E) Heartbeat monitoring — detect stale workers
    const checkHeartbeat = (): void => {
      const hb = readHeartbeat(projectRoot, taskId);
      if (!hb) return;
      if (hb.sequence === lastHbSeq) {
        staleCount++;
        if (staleCount >= STALE_THRESHOLD) checkResult();
      } else {
        lastHbSeq = hb.sequence;
        staleCount = 0;
      }
    };

    timeoutTimer = setTimeout(() => { cleanup(); resolve(null); }, timeoutMs);
    heartbeatTimer = setInterval(checkHeartbeat, 30_000);

    // Host settlement evidence lives outside the project mount. Polling here
    // waits for the exact immutable receipt plus matching lifecycle closure,
    // never a time/quiescence guess.
    if (settlementRef) {
      fallbackTimer = setInterval(checkResult, 100);
      return;
    }

    // D) Use fs.watch for instant result detection
    mkdirSync(tasksDir, { recursive: true });
    try {
      watcher = fsWatch(tasksDir, { persistent: false }, (_event, filename) => {
        if (filename === `task-${taskId}.result`) checkResult();
      });
      watcher.on('error', () => {
        watcher?.close();
        watcher = null;
        fallbackTimer = setInterval(checkResult, 5_000);
      });
    } catch {
      fallbackTimer = setInterval(checkResult, 5_000);
    }
  });
}

/**
 * Stream worker log file to stdout until the result file appears or timeout.
 */
export async function streamWorkerLog(
  projectRoot: string,
  taskId: string,
  timeoutMs: number,
  settlementRef?: TaskResultSettlementRefV1,
): Promise<void> {
  const logPath = join(projectRoot, TASKS_DIR, `task-${taskId}.log`);
  const resultPath = join(projectRoot, TASKS_DIR, `task-${taskId}.result`);
  const pollInterval = 500;
  const startTime = Date.now();

  // Wait for log file to appear (up to min(10s, timeoutMs/2))
  const logWaitMax = Math.min(10_000, Math.floor(timeoutMs / 2));
  let waited = 0;
  while (!existsSync(logPath) && waited < logWaitMax) {
    await sleep(500);
    waited += 500;
  }

  if (!existsSync(logPath)) return;

  let offset = 0;
  while (Date.now() - startTime < timeoutMs) {
    if (existsSync(logPath)) {
      const stream = createReadStream(logPath, { start: offset, encoding: 'utf-8' });
      await new Promise<void>((resolve) => {
        stream.on('data', (chunk) => {
          process.stdout.write(chunk as string);
          offset += Buffer.byteLength(chunk as string, 'utf-8');
        });
        stream.on('end', resolve);
        stream.on('error', resolve);
      });
    }
    if (settlementRef ? readClosedTaskResultSettlement(settlementRef) !== null : existsSync(resultPath)) break;
    await sleep(pollInterval);
  }
}

// ─── Command Registration ────────────────────────────────────────────

export function registerRun(
  program: Command,
  runtime: RunCommandRuntime = {},
): void {
  const helpLang = getLanguage(undefined);
  const runCmd = program
    .command('run')
    .argument('<description>', cliContractMessage('cliContract.run.arg.description', helpLang))
    .description(getMessage('cli.run.desc', helpLang))
    .addHelpText('after', renderContractHelp('run', helpLang))
    .option('--model <model>', getMessage('run.opt_model', helpLang))
    .option('--provider <name>', getMessage('run.opt_provider', helpLang, { providers: ALL_PROVIDER_NAMES.join('|') }))
    .option('--model-effort <level>', cliContractMessage('cliContract.run.opt.model_effort', helpLang))
    .option('--scope <dir>', cliContractMessage('cliContract.run.opt.scope', helpLang), './')
    .option('--files-write <paths...>', cliContractMessage('cliContract.run.opt.files_write', helpLang))
    .option('--files-read <paths...>', cliContractMessage('cliContract.run.opt.files_read', helpLang))
    .option('--timeout <ms>', cliContractMessage('cliContract.run.opt.timeout', helpLang), '300000')
    .option('--keep', cliContractMessage('cliContract.run.opt.keep', helpLang))
    .option('--auto-approve', cliContractMessage('cliContract.run.opt.auto_approve', helpLang))
    .option('--verbose', cliContractMessage('cliContract.run.opt.verbose', helpLang))
    .action(async (description: string, opts: RunCommandOpts) => {
      const root = resolveProjectRoot();
      const scopeDir = opts.scope ?? './';
      const filesWriteOpt = (opts.filesWrite ?? []).map(p => p.trim()).filter(p => p.length > 0);
      const filesReadOpt = (opts.filesRead ?? []).map(p => p.trim()).filter(p => p.length > 0);
      const timeoutMs = opts.timeout ? parseInt(opts.timeout, 10) : 300_000;
      const keepFiles = opts.keep ?? false;
      // CLI/MCP parity (ADR-022-V2, born-561): honor the --auto-approve flag —
      // commander leaves opts.autoApprove undefined when absent, so this
      // normalizes to a strict boolean, default false — same semantics as
      // `deckent start` / deckent_start.
      const autoApprove = opts.autoApprove === true;
      const verbose = opts.verbose ?? false;

      if (isNaN(timeoutMs) || timeoutMs <= 0) {
        const lang = getLanguage(undefined);
        printError(new Error(cliContractMessage('cliContract.run.invalid_timeout', lang, {
          value: opts.timeout ?? '',
        })));
        process.exitCode = 1;
        return;
      }

      // 453-001: resolve + validate the model through the canonical registry
      // BEFORE any task-file write or spawn. An omitted --model resolves from the
      // loaded config's canonical default-model resolver (never a literal alias);
      // an explicit --provider registers an unseen versioned ID parametrically.
      // Legacy aliases, unknown-without-provider, and provider/model mismatch all
      // fail loudly here (fail-before-disk).
      const cfg = await loadConfig(root).catch(() => undefined);
      const lang = getLanguage(cfg?.language);
      const requestedModel = opts.model ?? resolveDefaultModel(cfg);
      // Row 477: an OpenRouter id must be pre-registered from the verified probe
      // cache BEFORE identity resolution — the parametric path enforces the
      // pricing-evidence gate and is deliberately disk-free, so without this the
      // gate throws for probe-verified ids too (found live 2026-07-20: the gate
      // landed wired only into the later spawn path, breaking this proven flow).
      // Cache miss → no-op → the gate still fails honestly for unprobed models.
      if (opts.provider === 'openrouter') {
        registerOpenRouterModelFromCache(root, requestedModel);
      }
      let identity: ReturnType<typeof resolveExecutionModelIdentity>;
      try {
        identity = resolveExecutionModelIdentity(requestedModel, opts.provider);
      } catch (err) {
        printError(new Error(formatModelError(err, requestedModel, opts.provider, lang)));
        process.exitCode = 1;
        return;
      }
      const model = identity.model;

      const taskId = createRunTaskId();
      // WM-1: unify on the canonical ExecutionRequest contract — sets task.type
      // (TaskKind) + carries the resolved exact model ID + owning provider through
      // to Task JSON and spawn + tags origin='cli'.
      const execReq = buildExecutionRequest({
        description,
        model,
        provider: identity.provider,
        // F1-RE (268-003): forward --model-effort into the canonical request so
        // task.modelEffort is set (resolveToTask) and spawn emits the flag.
        modelEffort: opts.modelEffort,
        // F2: forward the declared file authority so the execution landing scope is
        // non-empty; omitted keys keep the pre-2026-08-28 shape byte-identical.
        scope: {
          directories: [scopeDir],
          ...(filesWriteOpt.length > 0 ? { filesWrite: filesWriteOpt } : {}),
          ...(filesReadOpt.length > 0 ? { filesRead: filesReadOpt } : {}),
        },
        projectRoot: root,
        config: cfg,
        autoApprove,
        origin: 'cli',
        timeoutMs,
      });
      const task = resolveToTask(execReq, taskId);
      task.createdAt ??= now();
      let settlementOpened: OpenTaskSettlementAuthorityResult | undefined;
      let settlementContext: RunSettlementContext | undefined;
      let dispatchBoundary: CanonicalTaskDispatchBoundaryV2 | undefined;
      let dispatchStarted = false;
      let dispatchUncertain = false;
      let dispatchStartedAt = 0;
      let reconciliationRequired = false;

      try {
        const approvalBootstrap = !runtime.attendedExecutionApprovalAuthority && cfg
          ? bootstrapApprovalAuthority(root, cfg)
          : { state: 'disabled' as const };
        const attendedExecutionApprovalAuthority =
          runtime.attendedExecutionApprovalAuthority
          ?? (approvalBootstrap.state === 'ready'
            ? approvalBootstrap.runtime.attendedExecutionApprovalAuthority
            : undefined);
        try {
          if (!cfg) {
            throw new DeckentError('E_RUN_CONFIG_UNAVAILABLE', 'RUN_CONFIG_UNAVAILABLE');
          }
          const execution = await executeTaskIngress({
            projectRoot: root,
            config: cfg,
            task,
            timeoutMs,
            autoApprove,
            ...(attendedExecutionApprovalAuthority
              ? { attendedExecutionApprovalAuthority }
              : {}),
            providerAuthority: runtime.providerAuthority,
            transport: 'cli',
            ...(runtime.openTaskSettlementAuthority
              ? { openTaskSettlementAuthority: runtime.openTaskSettlementAuthority }
              : {}),
            onDispatchBoundary: (boundary, invocation) => {
              dispatchStarted = true;
              dispatchStartedAt = invocation.dispatchStartedAt
                ? Date.parse(invocation.dispatchStartedAt)
                : Date.now();
              dispatchBoundary = boundary;
              print(cliContractMessage('cliContract.run.started', lang, {
                taskId,
                model,
                scope: scopeDir,
              }));
              print(cliContractMessage('cliContract.run.description', lang, { description }));
              if (timeoutMs !== 300_000) {
                print(cliContractMessage('cliContract.run.timeout', lang, { timeout: timeoutMs }));
              }
              print(getMessage('run.settlement_declared', lang, {
                receiptId: invocation.receiptRef.invocationId,
              }));
            },
          });
          if (runtime.openTaskSettlementAuthority) {
            const opened = runtime.openTaskSettlementAuthority(root);
            settlementOpened = opened;
            settlementContext = {
              opened,
              tenantId: execution.invocation.receiptRef.tenantId,
              invocationId: execution.invocation.receiptRef.invocationId,
            };
          }
          dispatchStarted = execution.invocation.state === 'dispatch-started';
          dispatchUncertain = execution.invocation.state === 'reconciliation-required';
          dispatchStartedAt = execution.invocation.dispatchStartedAt
            ? Date.parse(execution.invocation.dispatchStartedAt)
            : Date.now();
          if (execution.invocation.executionEvidenceRef) {
            dispatchBoundary = {
              taskId,
              provider: execution.provider,
              model,
              backend: execution.backend,
              executionEvidenceRef: execution.invocation.executionEvidenceRef,
            };
          }
          if (execution.disposition.kind !== 'spawned') {
            printError(new Error(cliContractMessage('cliContract.run.ingress_hold', lang, {
              reason: execution.invocation.reasonCode ?? execution.disposition.kind,
            })));
            print(getMessage('run.settlement_declared', lang, {
              receiptId: execution.invocation.receiptRef.invocationId,
            }));
            process.exitCode = 1;
            return;
          }
          const spawned = {
            backend: execution.backend,
            provider: execution.provider,
            settlementRef: execution.disposition.legacySettlementRef,
          };
          if (settlementContext && !dispatchStarted) {
            dispatchUncertain = true;
            reconciliationRequired = true;
            throw new DeckentError(
              'E_RUN_DISPATCH_BOUNDARY_MISSING',
              getMessage('run.settlement_dispatch_boundary_missing', lang, { taskId }),
            );
          }
          if (verbose) {
            print(cliContractMessage('cliContract.run.output_start', lang));
            await streamWorkerLog(root, taskId, timeoutMs, spawned.settlementRef);
            print(cliContractMessage('cliContract.run.output_end', lang));
          }

          print(cliContractMessage('cliContract.run.waiting', lang));
          const result = execution.resultAuthority?.state === 'exact-accepted'
            ? execution.resultAuthority.result
            : execution.resultAuthority
              ? (() => {
                  throw new DeckentError(
                    'E_RUN_EXACT_RESULT_AUTHORITY_HOLD',
                    `EXACT_RESULT_AUTHORITY_HOLD:${execution.resultAuthority.state}`,
                  );
                })()
              : await waitForRunResult(root, taskId, timeoutMs, {
                  settlementRef: spawned.settlementRef,
                });

          if (!result) {
            print(cliContractMessage('cliContract.run.timed_out', lang));
            if (settlementContext && (dispatchStarted || dispatchUncertain)) {
              reconciliationRequired = true;
              print(getMessage('run.settlement_reconciliation_required', lang, {
                receiptId: settlementContext.invocationId,
                evidence: dispatchBoundary?.executionEvidenceRef ?? 'unknown',
              }));
            } else if (!keepFiles) {
              cleanupRunTask(root, taskId);
            }
            process.exitCode = 1;
            return;
          }

          const assessment = result.selfAssessment ?? 'NO_GO';
          if (execution.executionMode === 'normal-docker-exact') {
            reconciliationRequired = true;
            print(getMessage('run.settlement_reconciliation_required', lang, {
              receiptId: settlementContext?.invocationId ?? taskId,
              evidence: dispatchBoundary?.executionEvidenceRef ?? 'exact-accepted-result',
            }));
            print(cliContractMessage('cliContract.run.exact_accepted_pending', lang));
            process.exitCode = 1;
            return;
          }
          if (settlementContext) {
            if (!dispatchStarted || !dispatchBoundary) {
              dispatchUncertain = true;
              reconciliationRequired = true;
              throw new DeckentError(
                'E_RUN_TERMINAL_WITHOUT_DISPATCH_BOUNDARY',
                getMessage('run.settlement_terminal_without_dispatch', lang, { taskId }),
              );
            }
            // The raw `.result` may be cleaned after a successful run. Bind the
            // receipt to canonical normalized bytes so its evidence remains
            // independently comparable instead of pointing at a deleted path.
            const resultEvidenceRef = runResultEvidenceRef(result);
            const inspection = settleRunResult(
              settlementContext,
              result,
              Math.max(0, Date.now() - dispatchStartedAt),
              [
                dispatchBoundary.executionEvidenceRef,
                resultEvidenceRef,
                ...(spawned.settlementRef
                  ? [`task-result-settlement:${spawned.settlementRef.attemptId}`]
                  : []),
              ],
            );
            print(getMessage('run.settlement_terminal', lang, {
              receiptId: settlementContext.invocationId,
              effectiveStatus: inspection.effectiveStatus,
              evidence: inspection.evidenceRefs.join(','),
            }));
          }

          print(`\n${cliContractMessage('cliContract.run.result', lang, { assessment })}`);
          if (result.notes) {
            print(cliContractMessage('cliContract.run.notes', lang, { notes: result.notes }));
          }
          if (result.filesChanged?.length) {
            print(cliContractMessage('cliContract.run.files_changed', lang, {
              files: result.filesChanged.join(', '),
            }));
          }
          print(cliContractMessage('cliContract.run.tests_passed', lang, {
            value: cliContractMessage(
              result.testsPassed ? 'cliContract.run.yes' : 'cliContract.run.no',
              lang,
            ),
          }));

          if (!keepFiles) {
            cleanupRunTask(root, taskId);
          } else {
            print(cliContractMessage('cliContract.run.files_preserved', lang, { taskId }));
          }

          process.exitCode =
            assessment === 'DONE' || assessment === 'GO_WITH_TECH_DEBT'
              ? 0
              : 1;
        } finally {
          if (approvalBootstrap.state === 'ready') approvalBootstrap.runtime.close();
        }
      } catch (error) {
        const ingressErrorAuthority = readTaskIngressErrorAuthority(error);
        if (ingressErrorAuthority) {
          const { invocation } = ingressErrorAuthority;
          dispatchStarted = invocation.state === 'dispatch-started';
          dispatchUncertain = invocation.state === 'reconciliation-required';
          if (dispatchStarted || dispatchUncertain) {
            reconciliationRequired = true;
            print(getMessage('run.settlement_reconciliation_required', lang, {
              receiptId: invocation.receiptRef.invocationId,
              evidence: invocation.executionEvidenceRef ?? 'unknown',
            }));
          } else {
            print(getMessage('run.settlement_declared', lang, {
              receiptId: invocation.receiptRef.invocationId,
            }));
          }
        }
        if (settlementContext && (dispatchStarted || dispatchUncertain)) {
          reconciliationRequired = true;
          print(getMessage('run.settlement_reconciliation_required', lang, {
            receiptId: settlementContext.invocationId,
            evidence: dispatchBoundary?.executionEvidenceRef ?? 'unknown',
          }));
        }
        if (!keepFiles && !reconciliationRequired) cleanupRunTask(root, taskId);
        if (error instanceof ProviderExecutionIngressHoldError) {
          printError(new Error(getMessage('run.provider_authority_hold', lang, {
            reason: error.reasonCode,
            evidence: error.authorityEvidenceRefs.join(','),
          })));
        } else if (error instanceof DeckentError && error.code === 'EXECUTION_BUDGET_HOLD') {
          const [, reason = 'unknown', profile = 'execution_budget.roles.worker'] =
            error.message.split(':');
          printError(new Error(getMessage('run.budget_hold', lang, { reason, profile })));
        } else if (
          error instanceof DeckentError
          && (error.code.startsWith('TASK_INGRESS_')
            || error.code.startsWith('E_RUN_TASK_INGRESS_')
            || error.code === 'E_RUN_EXACT_RESULT_AUTHORITY_HOLD')
        ) {
          printError(new Error(cliContractMessage('cliContract.run.ingress_hold', lang, {
            reason: error.code,
          })));
        } else if (
          error instanceof DeckentError
          && error.code === 'E_TASK_RESULT_IDENTITY_MISMATCH'
        ) {
          printError(new Error(getMessage('run.result_identity_mismatch', lang, {
            taskId,
          })));
        } else {
          printError(error);
        }
        process.exitCode = 1;
      } finally {
        settlementOpened?.close();
      }
    });

  // ── RUN-RENAME dilim-1 (Alperen 2026-07-06, ADR-G-024): `run start|status|retro|history`
  // aliases delegate to the EXACT top-level lifecycle commands (same handlers, no copies).
  // The legacy one-shot `run "<description>"` signature above is untouched — a first
  // positional that is not one of these four reserved names still runs a single task.
  const RUN_ALIAS_TARGETS = ['start', 'status', 'retro', 'history'] as const;
  for (const target of RUN_ALIAS_TARGETS) {
    runCmd
      .command(target)
      .description(getMessage('run.alias_note', helpLang))
      .argument('[args...]', cliContractMessage('cliContract.run.arg.alias_args', helpLang))
      // passThroughOptions would demand enablePositionalOptions on the SHARED
      // root program (global parse-semantics change — too risky). Empirically
      // verified: allowUnknownOption + variadic capture keeps raw tokens in
      // order inside this.args, so the delegated parse reproduces the exact
      // handler+options of the top-level command.
      .allowUnknownOption()
      .allowExcessArguments()
      .action(async function (this: Command) {
        await program.parseAsync([target, ...this.args], { from: 'user' });
      });
  }
}
