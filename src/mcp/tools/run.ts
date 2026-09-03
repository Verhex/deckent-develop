import { z } from 'zod/v4';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createJobId, writeJobState } from './job-runner.js';
import { enrichResponse } from '../helpers/enrich.js';
import { loadConfig, resolveDefaultModel } from '../../core/config.js';
import { buildExecutionRequest, resolveToTask, resolveExecutionModelIdentity } from '../../orchestra/execution-request-builder.js';
import { registerOpenRouterModelFromCache } from '../../core/openrouter-models.js';
import { debugLog } from '../../core/utils.js';
import type { AttendedExecutionApprovalAuthority } from '../../core/attended-execution-approval.js';
import type { ProviderAuthorityRuntimeServiceOpenResult } from '../../core/provider-authority-composition.js';
import {
  executeTaskIngress,
  readTaskIngressErrorAuthority,
} from '../../orchestra/task-mode-runner.js';
import { getMcpToolDescriptionLanguage, mcpToolDescription } from './description-catalog.js';
import { cliContractMessage } from '../../cli/helpers/message-catalog/cli-run.js';

export function registerRunTool(
  server: McpServer,
  runtime: {
    attendedExecutionApprovalAuthority?: AttendedExecutionApprovalAuthority;
    providerAuthority?: ProviderAuthorityRuntimeServiceOpenResult;
  } = {},
): void {
  const lang = getMcpToolDescriptionLanguage();
  server.registerTool(
    'deckent_run',
    {
      title: cliContractMessage('cliContract.run.mcp.title', lang),
      description: mcpToolDescription('deckent_run'),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
      inputSchema: z.object({
        description: z.string().describe(cliContractMessage('cliContract.run.mcp.description', lang)),
        model: z.string().optional().describe(cliContractMessage('cliContract.run.mcp.model', lang)),
        provider: z.string().optional().describe(cliContractMessage('cliContract.run.mcp.provider', lang)),
        modelEffort: z.string().optional().describe(cliContractMessage('cliContract.run.mcp.model_effort', lang)),
        scope: z.string().optional().describe(cliContractMessage('cliContract.run.mcp.scope', lang)),
        timeoutMs: z.number().optional().describe(cliContractMessage('cliContract.run.mcp.timeout', lang)),
        keep: z.boolean().optional().describe(cliContractMessage('cliContract.run.mcp.keep', lang)),
        autoApprove: z.boolean().optional().default(true).describe(cliContractMessage('cliContract.run.mcp.auto_approve', lang)),
      }),
    },
    async ({ description, model, modelEffort, scope, timeoutMs, keep, autoApprove, provider }) => {
      const root = process.cwd();

      try {
        const jobId = createJobId();
        const taskId = `run-${jobId}`;
        const startedAt = new Date().toISOString();
        let jobProjectionHold: string | undefined;

        // C-MCP-parite (269-004): CLI --timeout / --keep counterparts. MCP keep
        // defaults to TRUE (preserve) — the fire-and-forget MCP path never cleaned
        // up before, and deckent_status reads .result after completion.
        const effectiveTimeoutMs = timeoutMs !== undefined && Number.isFinite(timeoutMs) && timeoutMs > 0
          ? timeoutMs
          : 300_000;
        const keepFiles = keep !== false;

        // WM-1: unify on the canonical ExecutionRequest contract — sets task.type
        // (TaskKind), resolves provider from config (not hardcoded 'claude'), tags
        // origin='mcp', and spawns through the one provider-aware primitive.
        const cfg = await loadConfig(root);

        // 453-001: resolve + validate the model through the canonical registry
        // BEFORE writing the Task JSON or spawning — identical boundary to CLI
        // `deckent run`. An omitted model resolves from the loaded config's
        // canonical default-model resolver (never a literal alias); an explicit
        // provider registers an unseen versioned ID parametrically. Legacy
        // aliases, unknown-without-provider, and provider/model mismatch throw
        // here and surface as an isError response (fail-before-disk/spawn).
        const requestedModel = model ?? resolveDefaultModel(cfg);
        // Row 477: pre-register a probe-verified OpenRouter id before the pure
        // identity boundary — same seam as CLI `deckent run` (see run.ts); the
        // parametric pricing-evidence gate has no disk access of its own.
        if (provider === 'openrouter') {
          registerOpenRouterModelFromCache(root, requestedModel);
        }
        const identity = resolveExecutionModelIdentity(requestedModel, provider);

        const execReq = buildExecutionRequest({
          description,
          model: identity.model,
          provider: identity.provider,
          // C-MCP-parite (269-004): forward --model-effort equivalent into the
          // canonical request so task.modelEffort is set (resolveToTask) and spawn
          // emits the provider flag — same wire as CLI `deckent run` (268-003).
          modelEffort,
          scope: { directories: scope ? scope.split(',').map((s) => s.trim()) : ['src/'] },
          projectRoot: root,
          config: cfg,
          autoApprove,
          origin: 'mcp',
          timeoutMs: effectiveTimeoutMs,
        });
        const task = resolveToTask(execReq, taskId);

        const execution = await executeTaskIngress({
          projectRoot: root,
          config: cfg,
          task,
          timeoutMs: effectiveTimeoutMs,
          autoApprove,
          ...(runtime.attendedExecutionApprovalAuthority
            ? { attendedExecutionApprovalAuthority: runtime.attendedExecutionApprovalAuthority }
            : {}),
          ...(runtime.providerAuthority ? { providerAuthority: runtime.providerAuthority } : {}),
          transport: 'mcp',
          onDispatchBoundary: (_boundary, invocation) => {
            try {
              writeJobState(root, {
                jobId,
                status: 'RUNNING',
                startedAt,
                taskId,
                invocation: {
                  schemaVersion: 1,
                  invocationId: invocation.receiptRef.invocationId,
                  tenantId: invocation.receiptRef.tenantId,
                  projectId: invocation.receiptRef.projectId,
                  state: invocation.state,
                  executionMode: invocation.executionMode ?? 'legacy-non-docker',
                  executionEvidenceRef: invocation.executionEvidenceRef ?? null,
                  attemptId: null,
                },
              });
            } catch (projectionError) {
              jobProjectionHold = projectionError instanceof Error
                ? projectionError.message
                : String(projectionError);
            }
          },
        });
        if (execution.disposition.kind !== 'spawned') {
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({
                error: true,
                code: execution.invocation.state === 'not-dispatched'
                  ? 'TASK_INGRESS_NOT_DISPATCHED'
                  : 'TASK_INGRESS_RECONCILIATION_REQUIRED',
                taskId,
                disposition: execution.disposition.kind,
                executionMode: execution.executionMode,
                backend: execution.backend,
                provider: execution.provider,
                invocation: execution.invocation,
              }),
            }],
            isError: true,
          };
        }
        if (
          execution.executionMode === 'normal-docker-exact'
          && execution.resultAuthority?.state !== 'exact-accepted'
        ) {
          throw new Error(
            `EXACT_RESULT_AUTHORITY_HOLD:${execution.resultAuthority?.state ?? 'missing'}`,
          );
        }
        const backend = execution.backend;
        const settlementRef = execution.disposition.legacySettlementRef;
        const publicStatus = execution.executionMode === 'normal-docker-exact'
          ? 'ACCEPTED_AWAITING_EVALUATION' as const
          : 'RUNNING' as const;
        const exactAttemptId = execution.disposition.kind === 'spawned'
          ? execution.disposition.exactDispatchOutcome
            ?.providerExecutionAttempt?.providerExecutionAttemptId ?? null
          : null;
        const invocationProjection = {
          schemaVersion: 1 as const,
          invocationId: execution.invocation.receiptRef.invocationId,
          tenantId: execution.invocation.receiptRef.tenantId,
          projectId: execution.invocation.receiptRef.projectId,
          state: execution.invocation.state,
          executionMode: execution.executionMode,
          executionEvidenceRef: execution.invocation.executionEvidenceRef ?? null,
          attemptId: exactAttemptId,
        };

        try {
          writeJobState(root, {
            jobId,
            status: publicStatus,
            startedAt,
            taskId,
            invocation: invocationProjection,
          });
        } catch (projectionError) {
          jobProjectionHold = projectionError instanceof Error
            ? projectionError.message
            : String(projectionError);
        }

        // C-MCP-parite (269-004): keep=false opts in to CLI-style cleanup — watch
        // for the result in the background (non-blocking; bounded by timeoutMs) and
        // remove task files once a result actually arrived. Unlike the CLI, a
        // timeout WITHOUT a result preserves the files: a fire-and-forget MCP path
        // must never delete files under a possibly-still-running worker.
        // Lazy import keeps the default path free of cli/commands/run.js deps.
        if (!keepFiles && execution.executionMode === 'legacy-non-docker') {
          void import('../../cli/commands/run.js')
            .then(async ({ waitForRunResult, cleanupRunTask }) => {
              const result = await waitForRunResult(root, taskId, effectiveTimeoutMs, { settlementRef });
              if (result) cleanupRunTask(root, taskId);
            })
            .catch((cleanupErr) => {
              debugLog('run:mcp:cleanup', `background cleanup watcher failed: ${cleanupErr}`);
            });
        }

        const enriched = enrichResponse('run', {
          jobId,
          taskId,
          status: publicStatus,
          model: identity.model,
          modelEffort: task.modelEffort,
          timeoutMs: effectiveTimeoutMs,
          keep: keepFiles,
          scope: execReq.scope.directories,
          backend,
          invocation: invocationProjection,
          jobProjection: jobProjectionHold ? 'HOLD' : 'RECORDED',
          ...(jobProjectionHold ? { jobProjectionReason: jobProjectionHold } : {}),
        });

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(enriched) }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const ingressAuthority = readTaskIngressErrorAuthority(err);
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              error: true,
              message,
              ...(ingressAuthority
                ? {
                    code: 'TASK_INGRESS_AUTHORITY_HOLD',
                    reasonCode: ingressAuthority.reasonCode,
                    invocation: ingressAuthority.invocation,
                    ...(ingressAuthority.settlementFailure
                      ? { settlementFailure: ingressAuthority.settlementFailure }
                      : {}),
                  }
                : {}),
            }),
          }],
          isError: true,
        };
      }
    },
  );
}
