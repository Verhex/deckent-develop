import { z } from 'zod/v4';
import { principalToActor, resolveLocalOsPrincipal } from '../../core/principal.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { fork } from 'node:child_process';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, readAuthMode, resolveBrainModel } from '../../core/config.js';
import { bootstrapProviders, orderedRoleProviders } from '../../core/provider.js';
import { getEquivalentModel } from '../../core/model-equivalence.js';
import { registerOpenRouterModelFromCache } from '../../core/openrouter-models.js';
import { resolveExecutionModelIdentity } from '../../orchestra/execution-request-builder.js';
import { readContext, planSprint, BrainError } from '../../orchestra/brain.js';
import { estimateSprintFull, type SprintEstimate } from '../../orchestra/sprint-estimator.js';
import { cleanOrphanIpcDirs } from '../../core/orphan-cleaner.js';
import { debugLog } from '../../core/utils.js';
import type { SprintSizeRecommendation } from '../../core/types.js';
import { writeJobState } from './job-runner.js';
import { createExecutionJobId } from '../../core/execution-job-identity.js';
import { enrichResponse } from '../helpers/enrich.js';
import { formatStartResponse, formatErrorResponse, wrapResponse } from '../helpers/format.js';
import { isSprintLocked } from '../../core/multi-ide.js';
import { initCostConfig, loadCostConfig } from '../../core/cost-config-loader.js';
import { resolveBillingModeForAuth, type TaskCostInput } from '../../core/cost-calculator.js';
import { evaluateCostGate, evaluateSpendWarnAtSpawn, buildCostGateErrorPayload } from '../../core/cost-gate.js';
import { writeEvent } from '../../core/event-stream.js';
import { notifyAsync } from '../../core/notify.js';
import {
  getIpcDir,
  IPC_CONFIG_FILE,
  type SprintRunnerConfig,
} from '../../orchestra/sprint-runner-entry.js';
import { loadApprovedSnapshot } from '../../core/run-flow-store.js';
import {
  startApprovedRun,
  RunJobFlowNotApprovedError,
  RunJobDigestMismatchError,
} from '../../orchestra/run-job-service.js';
import { startRunFlow } from '../../orchestra/run-flow-decision-service.js';
import { spawnDetachedDeckent } from '../../cli/helpers/detached-start.js';
import { getLanguage, getMessage } from '../../cli/helpers/messages.js';
import type { ProviderAuthorityRuntimeServiceOpenResult } from '../../core/provider-authority-composition.js';
import { preflightProviderRoleExecutionIngress } from '../../core/provider-execution-ingress-authority.js';
import { mcpToolDescription, getMcpToolDescriptionLanguage } from './description-catalog.js';

/**
 * Format an estimated duration (minutes) into a compact human string for the
 * MCP start response. Single value (e.g. "~25 minutes" / "~1h 5m"), never a
 * fabricated range — replaces the prior hardcoded "~10-30 minutes" so the
 * surface reflects the real sprint-estimator output (B11 WIRE).
 */
function formatEstimatedDuration(min: number): string {
  if (min < 60) return `~${min} minute${min === 1 ? '' : 's'}`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `~${h}h` : `~${h}h ${m}m`;
}

export function registerStartTool(
  server: McpServer,
  runtime: {
    providerAuthority?: ProviderAuthorityRuntimeServiceOpenResult;
  } = {},
): void {
  const registerLang = getMcpToolDescriptionLanguage();
  server.registerTool(
    'deckent_start',
    {
      title: getMessage('mcp.start.title', registerLang),
      description: mcpToolDescription('deckent_start'),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
      inputSchema: z.object({
        autoApprove: z.boolean().optional().default(false).describe(getMessage('mcp.start.auto_approve_desc', registerLang)),
        acknowledgeCost: z.boolean().optional().default(false).describe(getMessage('mcp.start.acknowledge_cost_desc', registerLang)),
        acknowledgeScopePaths: z.boolean().optional().default(false).describe(getMessage('mcp.start.acknowledge_scope_paths_desc', registerLang)),
        acknowledgePromptGate: z.boolean().optional().default(false).describe(getMessage('mcp.start.acknowledge_prompt_gate_desc', registerLang)),
        dryRun: z.boolean().optional().default(false).describe(getMessage('mcp.start.dry_run_desc', registerLang)),
        force: z.boolean().optional().default(false).describe(getMessage('mcp.start.force_desc', registerLang)),
        timeout: z.number().int().positive().optional().describe(getMessage('mcp.start.timeout_desc', registerLang)),
        sandbox: z.boolean().optional().default(false).describe(getMessage('mcp.start.sandbox_desc', registerLang)),
        flowId: z.string().optional().describe(getMessage('mcp.start.flow_id_desc', registerLang)),
        revision: z.number().int().optional().describe(getMessage('mcp.start.revision_desc', registerLang)),
        planDigest: z.string().optional().describe(getMessage('mcp.start.plan_digest_desc', registerLang)),
      }),
    },
    async ({ autoApprove, acknowledgeCost, acknowledgeScopePaths, acknowledgePromptGate, dryRun, force, timeout, sandbox, flowId, revision, planDigest }) => {
      const root = process.cwd();
      // CLI/MCP Parity Notes (ADR-022-V2):
      // - autoApprove: CLI default false (the schema param mirrors this). The
      //   handler now passes the flag through to the detached sprint runner
      //   so deckent_start is symmetric with `deckent start [--auto-approve]`
      //   (Sprint 189 T-009 parity addition). Callers who require workers to
      //   run with --dangerously-skip-permissions must pass autoApprove=true
      //   explicitly; default false matches CLI behavior.
      // - acknowledgeCost: Sprint 189 T-008 parity addition. CLI uses --force
      //   to bypass the cost gate; MCP requires an explicit acknowledgeCost
      //   flag so over-budget runs are always intentional.
      // - acknowledgePromptGate (born-628, task-403-002): CLI --force-prompt-gate
      //   parity. Threaded into `runnerConfig` below (same boundary as
      //   acknowledgeScopePaths) so the forked runner's IPC config.json carries
      //   the value. KNOWN GAP: sprint-runner-entry.ts (SprintRunnerConfig +
      //   the runSprint() call inside the forked child) is a separate module
      //   that does not yet read this field — a follow-up task must add it
      //   there before an MCP-supplied acknowledgePromptGate=true actually
      //   reaches runSprint(); CLI `deckent start --force-prompt-gate` has no
      //   such gap since it calls runSprint() directly.
      // - spawn_backend: Both CLI and MCP read from config via loadConfig() → sprint-controller
      //   uses config.spawn_backend automatically. No explicit handling needed here.
      // - timeout: Both pass timeoutMs to runSprint (undefined = 30min default in result-collector).
      //   CLI parses string→int; MCP accepts number directly. Behavior equivalent.
      // - force: CLI skips sprint lock/doctor checks and acknowledges a numeric
      //   overrun. MCP skips its lock check and applies the same acknowledgement
      //   while unknown/unavailable cost evidence remains blocking.
      //   KNOWN DIVERGENCE: doctor pre-flight not run in MCP, acceptable.

      try {
        const config = await loadConfig(root);
        if (runtime.providerAuthority) {
          const order = orderedRoleProviders('brain', config);
          const requestedModel = getEquivalentModel(
            resolveBrainModel(config),
            order.primary,
          );
          if (order.primary === 'openrouter') {
            registerOpenRouterModelFromCache(root, requestedModel);
          }
          const identity = resolveExecutionModelIdentity(
            requestedModel,
            order.primary,
          );
          const executionId = `mcp-start-${process.pid}`;
          const providerAuthority = preflightProviderRoleExecutionIngress(
            runtime.providerAuthority,
            {
              role: 'brain',
              purpose: 'sprint-planning',
              runId: executionId,
              taskId: executionId,
              provider: identity.provider,
              model: identity.model,
              configuredBackend: 'unresolved-before-provider-bootstrap',
              fallbackProviders: order.fallbacks,
              unattended: true,
            },
          );
          if (providerAuthority.decision === 'hold') {
            writeEvent(
              root,
              executionId,
              'brain',
              'auditor',
              'BRAIN→AUDITOR:PROVIDER_AUTHORITY_HOLD',
              {
                role: 'brain',
                purpose: 'sprint-planning',
                runId: executionId,
                taskId: executionId,
                provider: identity.provider,
                model: identity.model,
                configuredBackend: 'unresolved-before-provider-bootstrap',
                fallbackProviders: order.fallbacks,
                unattended: true,
                reasonCode: providerAuthority.reasonCode,
                authorityEvidenceRefs: providerAuthority.authorityEvidenceRefs,
              },
            );
            const message = getMessage(
              'run.provider_authority_hold',
              getLanguage(config.language),
              {
                reason: providerAuthority.reasonCode,
                evidence: providerAuthority.authorityEvidenceRefs.join(','),
              },
            );
            const errData = {
              error: true,
              success: false,
              code: 'PROVIDER_EXECUTION_AUTHORITY_HOLD',
              message,
              providerAuthorityHold: {
                role: 'brain',
                purpose: 'sprint-planning',
                reasonCode: providerAuthority.reasonCode,
                authorityEvidenceRefs: providerAuthority.authorityEvidenceRefs,
              },
            };
            return {
              content: [{
                type: 'text' as const,
                text: JSON.stringify(wrapResponse(
                  errData,
                  formatErrorResponse({ code: errData.code, message }),
                )),
              }],
              isError: true,
            };
          }
        }

        // ─── TERM-FLOW-UNIFY Sprint-4 (426-001): approved-snapshot-consuming
        // start ────────────────────────────────────────────────────────────
        // When flowId/revision/planDigest are ALL given (+ flag on), CAS/
        // idempotency-verify here (fail fast, no fork) then reuse the CLI's
        // OWN flag-on snapshot path (cli/commands/start.ts --flow-id/
        // --revision/--plan-digest) via a detached spawn — one single
        // provably-replan-free code path shared by both surfaces, instead of
        // threading preplannedSprint through sprint-runner-entry.ts's forked
        // child (that file is a separate module outside this task's write
        // scope — see this task's result notes). run-flow-store.ts now lives
        // in core/ (born-671, sprint-427 task 427-020) — this reaches
        // core/run-flow-store.js directly, no more ADR-D-004 C3 mcp->cli
        // precedent for the store read. cli/helpers/detached-start.js is a
        // SEPARATE mcp->cli edge (still the src/mcp/tools/nervous-edit.ts ->
        // ../../cli/repl/nervous-bridge.js precedent, unchanged by this task).
        // Absent flowId (every existing MCP caller) never enters this branch
        // — zero behavior change for the legacy dryRun/cost-gate/fork path.
        const flowFlagsGiven = [flowId, revision, planDigest].filter(v => v !== undefined).length;
        if (flowFlagsGiven > 0) {
          if (flowFlagsGiven !== 3) {
            const message = getMessage('mcp.start.flow_params_incomplete', getLanguage(config.language));
            return {
              content: [{ type: 'text' as const, text: JSON.stringify(wrapResponse(
                { error: true, success: false, code: 'RUN_FLOW_INCOMPLETE_PARAMS', message },
                formatErrorResponse({ message }),
              )) }],
              isError: true,
            };
          }
          if (config.terminal?.run_flow_v2 !== true) {
            const message = getMessage('mcp.start.flow_v2_disabled', getLanguage(config.language));
            return {
              content: [{ type: 'text' as const, text: JSON.stringify(wrapResponse(
                { error: true, success: false, code: 'RUN_FLOW_V2_DISABLED', message },
                formatErrorResponse({ message }),
              )) }],
              isError: true,
            };
          }

          const approvedSnapshot = loadApprovedSnapshot(root, flowId!);

          // Fail closed on a caller-supplied stale exact reference before cost
          // admission or process birth. This guard is pure and never replans.
          try {
            startApprovedRun({
              flowId: flowId!,
              expectedRevision: revision!,
              expectedPlanDigest: planDigest!,
              approvedSnapshot,
            });
          } catch (err) {
            const code =
              err instanceof RunJobFlowNotApprovedError ? 'RUN_JOB_FLOW_NOT_APPROVED' :
              err instanceof RunJobDigestMismatchError ? 'RUN_JOB_DIGEST_MISMATCH' :
              null;
            if (code === null) throw err;
            const message = err instanceof Error ? err.message : String(err);
            return {
              content: [{ type: 'text' as const, text: JSON.stringify(wrapResponse(
                { error: true, success: false, code, message },
                formatErrorResponse({ code, message }),
              )) }],
              isError: true,
            };
          }

          if (approvedSnapshot !== undefined) {
            try {
              initCostConfig(root);
              const costConfig = loadCostConfig(root);
              const cfgAuthMode = await readAuthMode(root);
              const costTasks: TaskCostInput[] = approvedSnapshot.sprint.tasks.map((t) => ({
                id: t.id,
                model: t.model,
                estimatedInputTokens: t.estimatedTokens ?? 2700,
                estimatedOutputTokens: t.effort === 'high' ? 4000 : t.effort === 'low' ? 500 : 1500,
                effort: t.effort as 'low' | 'normal' | 'high' | undefined,
                billingMode: resolveBillingModeForAuth(t.provider, t.authMode ?? cfgAuthMode),
              }));
              const gate = evaluateCostGate({
                tasks: costTasks,
                costConfig,
                acknowledgeCost: acknowledgeCost || force,
              });
              if (!gate.ok) {
                const payload = buildCostGateErrorPayload(gate, force ? 'force' : 'acknowledgeCost');
                const errData = {
                  error: true,
                  success: false,
                  code: payload.error,
                  estimated: payload.estimated,
                  budget: payload.budget,
                  override: payload.override,
                  message: payload.message,
                };
                return {
                  content: [{ type: 'text' as const, text: JSON.stringify(wrapResponse(
                    errData,
                    formatErrorResponse({ code: payload.error, message: payload.message }),
                  )) }],
                  isError: true,
                };
              }
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error);
              const errData = { error: true, success: false, code: 'COST_GATE_UNAVAILABLE', message };
              return {
                content: [{ type: 'text' as const, text: JSON.stringify(wrapResponse(
                  errData,
                  formatErrorResponse({ code: errData.code, message }),
                )) }],
                isError: true,
              };
            }
          }

          const result = startRunFlow(root, flowId!, {
            lineage: {
              tenantId: approvedSnapshot?.proposal?.tenant ?? 'local',
              actor: principalToActor(resolveLocalOsPrincipal('mcp')),
              origin: 'mcp',
              correlationId: flowId!,
              idempotencyKey: `start:${flowId}:r${revision}`,
              sourceId: 'mcp:deckent_start',
              authorization: { kind: 'approved-actor' },
            },
            spawnStart: ({ capability }) => {
              const cliArgs = [
                'start',
                '--flow-id', capability.flowId,
                '--revision', String(revision),
                '--plan-digest', planDigest!,
                ...(autoApprove ? ['--auto-approve'] : []),
                ...(acknowledgeScopePaths ? ['--force-scope'] : []),
                ...(acknowledgePromptGate ? ['--force-prompt-gate'] : []),
                ...((acknowledgeCost || force) ? ['--force'] : []),
                ...(sandbox ? ['--sandbox-mode'] : []),
                ...(timeout !== undefined ? ['--timeout', String(timeout)] : []),
              ];
              const spawned = spawnDetachedDeckent(cliArgs, {
                projectRoot: root,
                flowId: capability.flowId,
                exactStart: {
                  attemptId: capability.attemptId,
                  ownerNonce: capability.ownerNonce,
                },
              });
              if (spawned.pid === null) {
                throw new Error('EXACT_START_CHILD_PID_UNAVAILABLE');
              }
              return { pid: spawned.pid };
            },
          });

          const startData = {
            success: true,
            jobId: result.attempt.attemptId,
            status: result.status === 'noop-duplicate' ? 'ALREADY_RUNNING' : 'STARTING',
            message: getMessage(
              result.status === 'noop-duplicate'
                ? 'start.exact_duplicate'
                : 'start.exact_accepted',
              getLanguage(config.language),
              {
                flowId: flowId!,
                revision: String(revision),
                attemptId: result.attempt.attemptId,
              },
            ),
            activeWorkers: 0,
            queuedTasks: 0,
          };
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify(wrapResponse(enrichResponse('start', startData), formatStartResponse(startData))),
            }],
          };
        }

        // ─── Pre-flight: Orphan IPC Directory Cleanup ─────────────
        // Remove dead sprint IPC directories from previous runs.
        // Uses live-PID check to preserve any in-flight sprint dirs.
        try {
          const cleaned = cleanOrphanIpcDirs(root, { checkLivePid: true });
          if (cleaned.length > 0) {
            debugLog('start:orphanCleanup', `Cleaned ${cleaned.length} dead orphan IPC dir(s)`);
          }
        } catch (e) {
          debugLog('start:orphanCleanup:error', e);
        }

        // ─── Sprint Lock Check ─────────────────────────────────────
        if (!force) {
          const lockInfo = isSprintLocked(root);
          if (lockInfo.locked) {
            const errData = {
              error: true,
              success: false,
              message: getMessage('mcp.start.lock_already_running', getLanguage(config.language), {
                pid: String(lockInfo.pid),
                env: lockInfo.env,
                sprintId: lockInfo.sprintId,
                acquiredAt: lockInfo.acquiredAt,
              }),
            };
            const errSummary = formatErrorResponse({ message: errData.message });
            return {
              content: [{ type: 'text' as const, text: JSON.stringify(wrapResponse(errData, errSummary)) }],
              isError: true,
            };
          }
        }

        // Dry-run mode: plan only, no spawn
        if (dryRun) {
          // Sprint 152 H4: Bootstrap provider registry so planSprint() can reach
          // a provider adapter. CLI does this in commands/start.ts; MCP handler
          // did not → "No providers registered" error. Idempotent on re-call.
          try {
            await bootstrapProviders(config);
          } catch (e) {
            debugLog('start:bootstrapProviders', e);
          }

          const context = readContext(root);
          const recommendation: SprintSizeRecommendation = {
            size: 'full',
            maxWorkers: typeof config.activeModeConfig.max_workers === 'number' ? config.activeModeConfig.max_workers : 4,
            modelConstraint: null,
            reason: 'No usage constraints',
          };
          const sprint = await planSprint(root, config, context, recommendation, { dryRun: true });
          const taskList = sprint.tasks.map((t) => ({
            id: t.id,
            title: t.title,
            model: t.model,
            effort: t.effort,
            assignedAgent: t.assignedAgent,
          }));
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify(enrichResponse('start', {
                success: true,
                dryRun: true,
                sprintId: sprint.id,
                taskCount: sprint.tasks.length,
                tasks: taskList,
                message: getMessage('mcp.start.dry_run_complete', getLanguage(config.language)),
              })),
            }],
          };
        }

        // Sprint-estimator wire (B11): real duration estimate computed from the
        // planned tasks + worker count during the cost-gate pre-plan (no extra
        // planSprint call). Stays undefined — and the response falls back to the
        // heuristic range only when no plan is available, so the surface
        // never fabricates a fixed number.
        let sprintEstimate: SprintEstimate | undefined;

        // ─── PRE-SPRINT COST GATE (Sprint 189 T-008) ──────────────
        // Mirrors the CLI cost gate via shared evaluateCostGate() helper.
        // Prevents Sprint 140-style $42 overruns originating from the MCP
        // start path (which previously had no gate). `force` acknowledges only
        // numeric overruns; unknown/unavailable pricing remains fail-closed.
        try {
            initCostConfig(root);
            const costConfig = loadCostConfig(root);

            // Bootstrap providers so planSprint() can reach an adapter.
            try {
              await bootstrapProviders(config);
            } catch (e) {
              debugLog('start:costGate:bootstrapProviders', e);
            }

            const context = readContext(root);
            const recommendation: SprintSizeRecommendation = {
              size: 'full',
              maxWorkers: typeof config.activeModeConfig.max_workers === 'number'
                ? config.activeModeConfig.max_workers
                : 4,
              modelConstraint: null,
              reason: 'Cost gate pre-plan',
            };
            const planForCost = await planSprint(root, config, context, recommendation, { dryRun: true });
            const cfgAuthMode = await readAuthMode(root);
            const costTasks: TaskCostInput[] = planForCost.tasks.map((t) => ({
              id: t.id,
              model: t.model,
              estimatedInputTokens: t.estimatedTokens ?? 2700,
              estimatedOutputTokens: t.effort === 'high' ? 4000 : t.effort === 'low' ? 500 : 1500,
              effort: t.effort as 'low' | 'normal' | 'high' | undefined,
              // F1-CB: billing follows effective auth — subscription/local tasks cost $0
              billingMode: resolveBillingModeForAuth(t.provider, t.authMode ?? cfgAuthMode),
            }));

            const gate = evaluateCostGate({
              tasks: costTasks,
              costConfig,
              acknowledgeCost: acknowledgeCost || force,
            });

            if (!gate.ok) {
              const payload = buildCostGateErrorPayload(gate, force ? 'force' : 'acknowledgeCost');
              const errData = {
                error: true,
                success: false,
                code: payload.error,
                estimated: payload.estimated,
                budget: payload.budget,
                override: payload.override,
                message: payload.message,
              };
              const errSummary = formatErrorResponse({
                code: payload.error,
                message: payload.message,
              });
              return {
                content: [{
                  type: 'text' as const,
                  text: JSON.stringify(wrapResponse(errData, errSummary)),
                }],
                isError: true,
              };
            }

            // Over-budget but acknowledgeCost=true: log breadcrumb so the
            // sprint runner can correlate the override in post-mortem.
            if (gate.overrideApplied) {
              debugLog('start:costGate:override', {
                estimated: gate.estimate.costRealistic,
                budget: gate.estimate.budgetUsd,
              });
            }

            // ─── PRE-SPAWN CUMULATIVE-SPEND WARN-GATE (B6 — warn-only) ──
            // Mirrors the CLI advisory. Flag-gated by cost_limits.enforce_spend_gate
            // (default-off): projects this sprint's estimate onto already-logged
            // daily/monthly spend and emits a NON-BLOCKING COST_LIMIT_WARN when a
            // rolling limit is crossed. The estimate gate above is untouched;
            // flag-off / under-limit → no read, no event, start unchanged.
            // TODO(phase2, post-beta): hard pre-spawn block unless acknowledged.
            const spendWarn = evaluateSpendWarnAtSpawn({
              root,
              costConfig,
              sprintEstimateUsd: gate.estimate.costRealistic,
            });
            if (spendWarn) {
              writeEvent(root, planForCost.id, 'brain', 'user', spendWarn.type, { ...spendWarn, sprintId: planForCost.id });
              notifyAsync('progress', planForCost.id, getMessage('mcp.start.cost_limit_warning_title', getLanguage(config.language)), spendWarn.message);
              debugLog('start:costGate:spendWarn', spendWarn);
            }

            // Reuse the cost-gate pre-plan to estimate sprint duration. Computed
            // only after the gate passed (no early-return) so an estimator hiccup
            // can never bypass the cost gate; estimateSprintFull is pure and does
            // not throw on valid planned tasks.
            sprintEstimate = estimateSprintFull(planForCost.tasks, recommendation.maxWorkers, root);
        } catch (error) {
          debugLog('start:costGate:error', error);
          const message = error instanceof Error ? error.message : String(error);
          const errData = { error: true, success: false, code: 'COST_GATE_UNAVAILABLE', message };
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(wrapResponse(
              errData,
              formatErrorResponse({ code: errData.code, message }),
            )) }],
            isError: true,
          };
        }

        const jobId = createExecutionJobId();
        const startedAt = new Date().toISOString();

        writeJobState(root, { jobId, status: 'RUNNING', startedAt });

        // ─── Detached Sprint Runner (Sprint 143 — MCP Disconnect Fix) ──
        // Instead of running runSprint() in-process (which blocks the MCP
        // stdio event loop for long sprints), we fork a detached child process.
        // This frees the MCP server's stdio transport immediately.
        const ipcDir = getIpcDir(root, jobId);
        mkdirSync(ipcDir, { recursive: true });

        // born-628: `SprintRunnerConfig` (src/orchestra/sprint-runner-entry.ts) does
        // not yet declare `acknowledgePromptGate` — that module's forked-child
        // runSprint() call is a separate follow-up (see comment above). The local
        // intersection type below still lets this handler persist the value into
        // the IPC config.json (forward-compatible) without touching that file.
        const runnerConfig: SprintRunnerConfig & { acknowledgePromptGate?: boolean } = {
          projectRoot: root,
          jobId,
          startedAt,
          // Sprint 189 T-009: honor caller-supplied autoApprove (default false
          // for CLI parity). Previously hardcoded to true which bypassed the
          // schema default and made the surface param dead-letter.
          autoApprove: autoApprove === true,
          // Dimension B: parity with CLI --force-scope. Independent of acknowledgeCost.
          acknowledgeScopePaths: acknowledgeScopePaths === true,
          // born-628: parity with CLI --force-prompt-gate. Independent of the other flags.
          acknowledgePromptGate: acknowledgePromptGate === true,
          sandboxMode: sandbox,
          timeoutMs: timeout,
        };

        // Pre-fork I/O: if writeFileSync fails, tear down the orphan ipcDir
        // immediately so we do not leak a config-only directory.
        try {
          writeFileSync(join(ipcDir, IPC_CONFIG_FILE), JSON.stringify(runnerConfig, null, 2), 'utf-8');
        } catch (err) {
          try { rmSync(ipcDir, { recursive: true, force: true }); } catch { /* best-effort */ }
          throw err;
        }

        // Resolve the compiled runner entry point
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = dirname(__filename);
        const runnerPath = join(__dirname, '..', '..', 'orchestra', 'sprint-runner-entry.js');

        // Fork as detached child — unref() so MCP server can exit independently.
        // If fork itself throws (e.g. runnerPath missing), clean up the dir.
        let child;
        try {
          child = fork(runnerPath, [ipcDir], {
            detached: true,
            stdio: 'ignore', // Don't inherit stdio — critical for MCP transport freedom
            cwd: root,
          });
        } catch (err) {
          try { rmSync(ipcDir, { recursive: true, force: true }); } catch { /* best-effort */ }
          throw err;
        }

        // IPC cleanup on child exit:
        //   code === 0 (success)  → always remove (results already consumed
        //                            via writeJobState + .deckent/jobs/).
        //   code !== 0 (failure)  → remove ONLY if the child never produced
        //                            status/result/error files (config-only
        //                            dirs have zero post-mortem value — they
        //                            mean the child could not even start).
        //                            Preserve dirs that contain real debug
        //                            data for post-mortem inspection.
        child.on('exit', (code) => {
          try {
            if (code === 0 || isConfigOnlyIpcDir(ipcDir)) {
              rmSync(ipcDir, { recursive: true, force: true });
            }
          } catch { /* best-effort */ }
        });

        child.unref();

        const startData = {
          success: true,
          jobId,
          status: 'RUNNING',
          message: getMessage('mcp.start.run_started', getLanguage(config.language)),
          activeWorkers: 0,
          queuedTasks: 0,
          estimatedDuration: sprintEstimate
            ? formatEstimatedDuration(sprintEstimate.estimatedMin)
            : getMessage('mcp.start.estimated_duration_fallback', getLanguage(config.language)),
          estimatedDurationMin: sprintEstimate?.estimatedMin,
        };

        const enrichedStart = enrichResponse('start', startData);
        const summary = formatStartResponse(startData);

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify(wrapResponse(enrichedStart, summary)),
          }],
        };
      } catch (error) {
        const errLang = getLanguage();
        const message = error instanceof BrainError
          ? getMessage('mcp.start.run_failed_at_phase', errLang, {
              phase: error.phase ?? getMessage('mcp.start.phase_unknown', errLang),
              message: error.message,
            })
          : error instanceof Error ? error.message : String(error);
        const code = (
          typeof error === 'object'
          && error !== null
          && 'code' in error
          && typeof error.code === 'string'
        )
          ? error.code
          : undefined;

        const errData = {
          error: true,
          success: false,
          message,
          ...(code !== undefined ? { code } : {}),
          ...(error instanceof BrainError && error.plannerProof
            ? { plannerProof: error.plannerProof }
            : {}),
        };
        const errSummary = formatErrorResponse({ ...(code !== undefined ? { code } : {}), message });
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(wrapResponse(errData, errSummary)) }],
          isError: true,
        };
      }
    },
  );
}

/**
 * Returns true if the IPC directory contains ONLY the config file (i.e. the
 * child process never wrote status/result/error). Such directories have no
 * post-mortem value — the child could not even start.
 */
function isConfigOnlyIpcDir(ipcDir: string): boolean {
  const statusPath = join(ipcDir, 'status.json');
  const resultPath = join(ipcDir, 'result.json');
  const errorPath = join(ipcDir, 'error.json');
  return !existsSync(statusPath) && !existsSync(resultPath) && !existsSync(errorPath);
}
