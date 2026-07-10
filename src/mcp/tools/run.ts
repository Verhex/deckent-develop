import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod/v4';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TASKS_DIR } from '../../core/constants.js';
import { ALL_MODELS } from '../../core/types.js';
import type { ModelType } from '../../core/types.js';
import { writeJobState } from './job-runner.js';
import { enrichResponse } from '../helpers/enrich.js';
import { loadConfig } from '../../core/config.js';
import { spawnWorkerMultiProvider } from '../../cli/commands/spawn.js';
import { buildExecutionRequest, resolveToTask } from '../../orchestra/execution-request-builder.js';
import { buildWorkerPrompt } from '../../orchestra/brain.js';
import { resolveAgentPrompt, resolveSkillPrompts } from '../../orchestra/sprint-controller.js';
import { AgentPoolManager } from '../../core/agent-pool.js';
import { SkillPoolManager } from '../../core/skill-pool.js';
import { detectProjectStack } from '../../core/stack-detector.js';
import { routeTaskV2 } from '../../core/routing-engine.js';
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
        model: z.enum(ALL_MODELS as unknown as readonly [string, ...string[]]).optional().default('sonnet').describe('AI model to use. Supports all providers (Claude, OpenAI, Gemini). Default: sonnet'),
        modelEffort: z.string().optional().describe('Native model reasoning-effort level, mirrors CLI --model-effort (claude: low|medium|high|xhigh|max, codex: minimal|low|medium|high). Opt-in: validated per-provider at spawn time; invalid or unsupported levels are silently ignored and the provider CLI default applies.'),
        scope: z.string().optional().describe('Comma-separated directory paths the worker may modify (e.g. "src/,tests/"). Defaults to "src/" if omitted.'),
        timeoutMs: z.number().optional().describe('Maximum wait window in milliseconds for the background result watcher, mirrors CLI --timeout. Default: 300000.'),
        keep: z.boolean().optional().describe('Keep task files (.json/.hb/.result/.log) after the worker completes, mirrors CLI --keep. MCP default: true (files are preserved so deckent_status can read the result). Set false to opt in to CLI-style cleanup once the result file appears; on timeout without a result, files are always preserved.'),
        autoApprove: z.boolean().optional().default(true).describe('Auto-approve worker tool calls with --dangerously-skip-permissions. Deckent standard: workers MUST have full write permissions.'),
      }),
    },
    async ({ description, model, modelEffort, scope, timeoutMs, keep, autoApprove }) => {
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
        const execReq = buildExecutionRequest({
          description,
          model: model as ModelType,
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
            const agentPool = new AgentPoolManager(root);
            const pool = agentPool.loadAgents();
            const projectStack = detectProjectStack(root);
            const skillPool = new SkillPoolManager(root);
            const skills = skillPool.loadSkills();

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

            const decision = routeTaskV2(task, pool, skills, {
              projectStack,
              overrides,
              learningData: [],
              config: cfg ? { ...cfg.routing_config, agentMinScore: cfg.agent_min_score } : undefined,
              // ADR-075 (343-007): thread the skill→agent affinity flag. Default-off →
              // option is false → byte-identical routing (engine already guards on it).
              skillAgentAffinity: cfg?.routing?.skill_agent_affinity ?? false,
              sprintId: '',
              taskId: task.id,
              projectRoot: root,
            });

            task.assignedAgent = decision.agentId ?? 'generic';
            task.assignedSkills = decision.skillIds;
          }
        } catch (routingErr) {
          debugLog('run:mcp:routing', `V2 routing failed, using generic fallback: ${routingErr}`);
        }

        writeFileSync(join(tasksDir, `task-${taskId}.json`), JSON.stringify(task, null, 2) + '\n');

        // Build worker prompt with agent/skill context
        const agentPrompt = await resolveAgentPrompt(root, task);
        const skillPrompts = await resolveSkillPrompts(root, task);
        const prompt = buildWorkerPrompt(task, agentPrompt, skillPrompts, root);
        const { backend } = await spawnWorkerMultiProvider(taskId, model as ModelType, prompt, root, {
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
          model,
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
