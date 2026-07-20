import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod/v4';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TASKS_DIR } from '../../core/constants.js';
import type { ModelType } from '../../core/types.js';
import { writeJobState } from './job-runner.js';
import { enrichResponse } from '../helpers/enrich.js';
import { loadConfig, resolveDefaultModel } from '../../core/config.js';
import { spawnWorkerMultiProvider } from '../../cli/commands/spawn.js';
import { buildExecutionRequest, resolveToTask, resolveExecutionModelIdentity } from '../../orchestra/execution-request-builder.js';
import { registerOpenRouterModelFromCache } from '../../core/openrouter-models.js';
import { buildWorkerPrompt } from '../../orchestra/brain.js';
import { resolveAgentPrompt, resolveSkillPrompts } from '../../orchestra/sprint-controller.js';
import type { UserOverride } from '../../core/routing-types.js';
import { debugLog } from '../../core/utils.js';

function generateJobId(): string {
  return `run-${Date.now().toString(36)}`;
}

export function registerRunTool(server: McpServer): void {
  server.registerTool(
    'deckent_run',
    {
      title: 'Run Task',
      description: 'Run a single one-off task outside of a full sprint. Creates a task JSON file and spawns a Claude worker immediately. Returns a jobId for tracking. Use when you need a quick isolated task without the full sprint lifecycle overhead (no PLAN/EVALUATE/RETRO phases). Use deckent_status to monitor the spawned worker. Example: fix a specific bug, write a single test file, update a doc.',
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
      inputSchema: z.object({
        description: z.string().describe('Clear description of what the worker should do. Be specific: include file paths, expected outcome, and any constraints.'),
        model: z.string().optional().describe('AI model to use — an exact provider model ID (e.g. claude-sonnet-5, gpt-5.6-sol). Resolved through the canonical registry: known IDs infer their provider; moving/legacy aliases (sonnet/opus/haiku/gpt-5/gpt-5.6) are rejected. Omit to use the configured default-model.'),
        provider: z.string().optional().describe('Explicit provider ownership (claude|codex|gemini|ollama). Required to register an unseen versioned model ID; for a known model it is validated against the registry and a mismatch fails loudly.'),
        modelEffort: z.string().optional().describe('Native model reasoning-effort level, mirrors CLI --model-effort (claude: low|medium|high|xhigh|max, codex: minimal|low|medium|high). Opt-in: validated per-provider at spawn time; invalid or unsupported levels are silently ignored and the provider CLI default applies.'),
        scope: z.string().optional().describe('Comma-separated directory paths the worker may modify (e.g. "src/,tests/"). Defaults to "src/" if omitted.'),
        timeoutMs: z.number().optional().describe('Maximum wait window in milliseconds for the background result watcher, mirrors CLI --timeout. Default: 300000.'),
        keep: z.boolean().optional().describe('Keep task files (.json/.hb/.result/.log) after the worker completes, mirrors CLI --keep. MCP default: true (files are preserved so deckent_status can read the result). Set false to opt in to CLI-style cleanup once the result file appears; on timeout without a result, files are always preserved.'),
        autoApprove: z.boolean().optional().default(true).describe('Auto-approve worker tool calls with --dangerously-skip-permissions. Deckent standard: workers MUST have full write permissions.'),
      }),
    },
    async ({ description, model, modelEffort, scope, timeoutMs, keep, autoApprove, provider }) => {
      const root = process.cwd();

      try {
        const jobId = generateJobId();
        const taskId = `run-${jobId}`;
        const tasksDir = join(root, TASKS_DIR);
        mkdirSync(tasksDir, { recursive: true });

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

        // WM-1b: V2 routing — assign the right agent + skills (fail-safe: any error keeps 'generic')
        try {
          const routingVersion = cfg?.routing_engine ?? 'v2';
          if (routingVersion === 'v2') {

            const overrides: UserOverride[] = [];
            if (task.forceAgent || task.forceSkills || task.excludeSkills || task.excludeAgent) {
              overrides.push({
                source: 'task-directive',
                forceAgent: task.forceAgent,
                forceSkills: task.forceSkills,
                excludeSkills: task.excludeSkills,
                excludeAgents: task.excludeAgent,
                priority: 3,
              });
            }

            // ROUTING-V3 (S3 cut-over): vector pipeline, structural content.
            const { routeSingleTaskV3 } = await import('../../orchestra/routing-plan-adapter.js');
            const v3 = await routeSingleTaskV3(task, root);
            task.assignedAgent = v3.agentId;
            task.assignedSkills = v3.skillIds;
          }
        } catch (routingErr) {
          debugLog('run:mcp:routing', `V2 routing failed, using generic fallback: ${routingErr}`);
        }

        writeFileSync(join(tasksDir, `task-${taskId}.json`), JSON.stringify(task, null, 2) + '\n');

        // Build worker prompt with agent/skill context
        const agentPrompt = await resolveAgentPrompt(root, task);
        const skillPrompts = await resolveSkillPrompts(root, task);
        const prompt = buildWorkerPrompt(task, agentPrompt, skillPrompts, root);
        const { backend } = await spawnWorkerMultiProvider(taskId, identity.model as ModelType, prompt, root, {
          autoApprove,
          spawnBackend: cfg.spawn_backend,
          dockerImage: cfg.docker_image,
          dockerTimeout: cfg.docker_timeout,
          provider: execReq.provider,
          // C-MCP-parite (269-004): task.modelEffort is validated per-provider
          // inside spawnWorkerMultiProvider via resolveReasoningEffort — an invalid
          // or unsupported level resolves to undefined (no flag emitted), exactly
          // like the CLI path (cli/commands/run.ts).
          modelEffort: task.modelEffort,
        });

        writeJobState(root, {
          jobId,
          status: 'RUNNING',
          startedAt: new Date().toISOString(),
        });

        // C-MCP-parite (269-004): keep=false opts in to CLI-style cleanup — watch
        // for the result in the background (non-blocking; bounded by timeoutMs) and
        // remove task files once a result actually arrived. Unlike the CLI, a
        // timeout WITHOUT a result preserves the files: a fire-and-forget MCP path
        // must never delete files under a possibly-still-running worker.
        // Lazy import keeps the default path free of cli/commands/run.js deps.
        if (!keepFiles) {
          void import('../../cli/commands/run.js')
            .then(async ({ waitForRunResult, cleanupRunTask }) => {
              const result = await waitForRunResult(root, taskId, effectiveTimeoutMs);
              if (result) cleanupRunTask(root, taskId);
            })
            .catch((cleanupErr) => {
              debugLog('run:mcp:cleanup', `background cleanup watcher failed: ${cleanupErr}`);
            });
        }

        const enriched = enrichResponse('run', {
          jobId,
          taskId,
          status: 'RUNNING',
          model: identity.model,
          modelEffort: task.modelEffort,
          timeoutMs: effectiveTimeoutMs,
          keep: keepFiles,
          scope: execReq.scope.directories,
          backend,
        });

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(enriched) }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: true, message }) }],
          isError: true,
        };
      }
    },
  );
}
