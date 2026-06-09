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
        scope: z.string().optional().describe('Comma-separated directory paths the worker may modify (e.g. "src/,tests/"). Defaults to "src/" if omitted.'),
        autoApprove: z.boolean().optional().default(true).describe('Auto-approve worker tool calls with --dangerously-skip-permissions. Deckent standard: workers MUST have full write permissions.'),
      }),
    },
    async ({ description, model, scope, autoApprove }) => {
      const root = process.cwd();

      try {
        const jobId = generateJobId();
        const taskId = `run-${jobId}`;
        const tasksDir = join(root, TASKS_DIR);
        mkdirSync(tasksDir, { recursive: true });

        // WM-1: unify on the canonical ExecutionRequest contract — sets task.type
        // (TaskKind), resolves provider from config (not hardcoded 'claude'), tags
        // origin='mcp', and spawns through the one provider-aware primitive.
        const cfg = await loadConfig(root);
        const execReq = buildExecutionRequest({
          description,
          model: model as ModelType,
          scope: { directories: scope ? scope.split(',').map((s) => s.trim()) : ['src/'] },
          projectRoot: root,
          config: cfg,
          autoApprove,
          origin: 'mcp',
        });
        const task = resolveToTask(execReq, taskId);

        writeFileSync(join(tasksDir, `task-${taskId}.json`), JSON.stringify(task, null, 2) + '\n');

        // Build worker prompt with agent/skill context
        const agentPrompt = await resolveAgentPrompt(root, task);
        const skillPrompts = await resolveSkillPrompts(root, task);
        const prompt = buildWorkerPrompt(task, agentPrompt, skillPrompts);
        const { backend } = await spawnWorkerMultiProvider(taskId, model as ModelType, prompt, root, {
          autoApprove,
          spawnBackend: cfg.spawn_backend,
          dockerImage: cfg.docker_image,
          dockerTimeout: cfg.docker_timeout,
          provider: execReq.provider,
        });

        writeJobState(root, {
          jobId,
          status: 'RUNNING',
          startedAt: new Date().toISOString(),
        });

        const enriched = enrichResponse('run', {
          jobId,
          taskId,
          status: 'RUNNING',
          model,
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
