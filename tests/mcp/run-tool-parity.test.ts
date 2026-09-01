// ─── deckent_run MCP parity — modelEffort / timeoutMs / keep (269-004, ADR-022) ───
// Hermetic: every I/O boundary (fs, spawn, config, routing) is mocked; the only
// real modules under test are src/mcp/tools/run.ts + the pure ExecutionRequest
// builder + the real resolveReasoningEffort contract (silent-drop pin).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { writeFileSync } from 'node:fs';

const ingressHarness = vi.hoisted(() => ({ execute: vi.fn() }));

// ─── Mocks (mirror tests/mcp/tools/run.test.ts) ─────────────────────

vi.mock('node:fs', () => ({
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

vi.mock('../../src/core/constants.js', () => ({
  RUNTIME_DIR: '.deckent/runtime',  // sprint-429 (429-011) tool-inventory yolu modül-yüklemede okur
  SETTINGS_DIR: '.deckent/settings',  // born-630 allowscope-zinciri modül-yüklemede okur
  TASKS_DIR: '.tasks',
}));

vi.mock('../../src/mcp/tools/job-runner.js', () => ({
  createJobId: vi.fn(() => 'job-1780659451558-11111111-1111-4111-8111-111111111111'),
  writeJobState: vi.fn(),
}));

vi.mock('../../src/mcp/helpers/enrich.js', () => ({
  enrichResponse: vi.fn((_t: string, data: unknown) => data),
}));

vi.mock('../../src/orchestra/brain.js', () => ({
  buildWorkerPrompt: vi.fn().mockReturnValue('worker-prompt'),
}));

vi.mock('../../src/orchestra/sprint-controller.js', () => ({
  resolveAgentPrompt: vi.fn().mockResolvedValue(undefined),
  resolveSkillPrompts: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../src/core/config.js', () => ({
  resolveBrainModel: () => 'claude-sonnet-5',  // sprint-431 (431-003) compiler-cagri-zinciri okur
  resolveBrainPlanningMode: (c: any) => c?.brain_planning ?? c?.activeModeConfig?.brain_planning ?? 'auto',  // sprint-429 (429-006)
  resolveDefaultModel: () => 'claude-opus-4-8',  // 453-001: canonical default-model resolver (omitted model)
  loadConfig: vi.fn(),
}));

vi.mock('../../src/cli/commands/spawn.js', () => ({
  spawnWorkerMultiProvider: vi.fn().mockResolvedValue({ backend: 'subprocess' }),
}));

vi.mock('../../src/orchestra/task-mode-runner.js', () => ({
  executeTaskIngress: ingressHarness.execute,
  readTaskIngressErrorAuthority: (error: any) => error?.taskIngressAuthority,
}));

// keep=false background cleanup path (lazy-imported by the tool)
vi.mock('../../src/cli/commands/run.js', () => ({
  waitForRunResult: vi.fn().mockResolvedValue(null),
  cleanupRunTask: vi.fn(),
}));

vi.mock('../../src/core/agent-pool.js', () => ({
  AgentPoolManager: vi.fn().mockImplementation(() => ({
    loadAgents: vi.fn().mockReturnValue([]),
  })),
}));

vi.mock('../../src/core/skill-pool.js', () => ({
  SkillPoolManager: vi.fn().mockImplementation(() => ({
    loadSkills: vi.fn().mockReturnValue([]),
  })),
}));

vi.mock('../../src/core/stack-detector.js', () => ({
  detectProjectStack: vi.fn().mockReturnValue({ primaryLanguage: 'typescript' }),
}));

vi.mock('../../src/orchestra/routing-plan-adapter.js', () => ({
  routeSingleTaskV3: vi.fn().mockResolvedValue({ agentId: 'generic', skillIds: [], confidence: 0.8, workType: 'build', escalation: null, storySummary: '' }),
}));

vi.mock('../../src/core/utils.js', () => ({
  debugLog: vi.fn(),
}));

import { loadConfig } from '../../src/core/config.js';
import { spawnWorkerMultiProvider } from '../../src/cli/commands/spawn.js';
import { waitForRunResult, cleanupRunTask } from '../../src/cli/commands/run.js';
// REAL import (not mocked) — pins the silent-drop validation contract the spawn
// path applies to modelEffort (resolveReasoningEffort SSOT, F1-RE 268-003).
import { resolveReasoningEffort } from '../../src/core/reasoning-effort.js';
import { buildParametricModel, modelRegistry } from '../../src/core/model-registry.js';
import { applyWorkerExecutionBudgetPolicy } from '../../src/core/execution-plan-digest.js';
import { routeSingleTaskV3 } from '../../src/orchestra/routing-plan-adapter.js';
import { buildWorkerPrompt } from '../../src/orchestra/brain.js';

const REMOTE_WORKER_CONFIG = {
  spawn_backend: 'subprocess',
  execution_budget: {
    roles: { worker: { default: { maxTurns: 4 } } },
    landing: { reserve_ratio: 0.25 },
    // ADR-G-037: codex/gemini report usage final-only — a live ceiling needs an
    // owner-authored wall-clock containment grant or the budget policy holds.
    final_only_usage: {
      action: 'allow-wall-clock-containment',
      roles: ['worker'],
      max_wall_clock_seconds: 3600,
    },
  },
} as const;

// ─── Mock Server ────────────────────────────────────────────────────

type ToolHandler = (args: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }>;

interface MockServer {
  tools: Map<string, { config: Record<string, unknown>; handler: ToolHandler }>;
  registerTool(name: string, config: Record<string, unknown>, handler: ToolHandler): void;
}

function createMockServer(): MockServer {
  const tools = new Map<string, { config: Record<string, unknown>; handler: ToolHandler }>();
  return {
    tools,
    registerTool(name, config, handler) { tools.set(name, { config, handler }); },
  };
}

async function getHandler(server: MockServer): Promise<ToolHandler> {
  const { registerRunTool } = await import('../../src/mcp/tools/run.ts');
  registerRunTool(server as never);
  return server.tools.get('deckent_run')!.handler;
}

function writtenTaskJson(): Record<string, unknown> {
  expect(ingressHarness.execute).toHaveBeenCalledOnce();
  return ingressHarness.execute.mock.calls[0]![0].task as Record<string, unknown>;
}

function spawnOpts(): Record<string, unknown> {
  expect(vi.mocked(spawnWorkerMultiProvider)).toHaveBeenCalledOnce();
  return vi.mocked(spawnWorkerMultiProvider).mock.calls[0]![4] as Record<string, unknown>;
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('deckent_run MCP — modelEffort/timeoutMs/keep parity (269-004)', () => {
  let server: MockServer;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loadConfig).mockResolvedValue(REMOTE_WORKER_CONFIG as never);
    vi.mocked(spawnWorkerMultiProvider).mockResolvedValue({ backend: 'subprocess' } as never);
    vi.mocked(waitForRunResult).mockResolvedValue(null);
    ingressHarness.execute.mockImplementation(async (input: any) => {
      const [policy] = applyWorkerExecutionBudgetPolicy(
        [input.task],
        input.config.execution_budget,
        input.task.provider,
      );
      if (policy?.state === 'hold') throw new Error(`execution budget policy: ${policy.reasonCode}`);
      const routed = await routeSingleTaskV3(input.task, input.projectRoot);
      input.task.assignedAgent = routed.agentId;
      input.task.assignedSkills = routed.skillIds;
      writeFileSync(`${input.projectRoot}/.tasks/task-${input.task.id}.json`, JSON.stringify(input.task));
      const prompt = buildWorkerPrompt(input.task, undefined, [], input.projectRoot);
      const spawned = await spawnWorkerMultiProvider(
        input.task.id,
        input.task.model,
        prompt,
        input.projectRoot,
        {
          autoApprove: input.autoApprove,
          provider: input.task.provider,
          modelEffort: input.task.modelEffort,
          executionBudget: input.task.budget,
          attendedExecutionApprovalAuthority: input.attendedExecutionApprovalAuthority,
          executionTenantId: input.executionTenantId ?? input.task.actor?.tenantId ?? 'local',
          executionRunId: input.executionRunId ?? input.task.sprintId ?? input.task.id,
        },
      );
      return {
        disposition: { kind: 'spawned', taskId: input.task.id },
        executionMode: 'legacy-non-docker',
        backend: spawned.backend,
        provider: input.task.provider,
        invocation: {
          receiptRef: { schemaVersion: 1, invocationId: `test:${input.task.id}`, tenantId: 'local', projectId: 'test' },
          executionBackend: 'host-subprocess',
          transport: 'mcp',
          state: 'dispatch-started',
          executionEvidenceRef: `test:${input.task.id}`,
        },
      };
    });
    server = createMockServer();
  });

  it('exposes modelEffort, timeoutMs and keep in the inputSchema', async () => {
    await getHandler(server);
    const schema = server.tools.get('deckent_run')!.config['inputSchema'] as { shape: Record<string, unknown> };
    expect(Object.keys(schema.shape)).toEqual(
      expect.arrayContaining(['modelEffort', 'timeoutMs', 'keep']),
    );
  });

  it('forwards modelEffort to the spawnWorkerMultiProvider opts (spawn wire)', async () => {
    const handler = await getHandler(server);
    await handler({ description: 'fix a bug', model: 'claude-sonnet-5', modelEffort: 'xhigh', autoApprove: true });

    expect(spawnOpts()['modelEffort']).toBe('xhigh');
  });

  it('sets task.modelEffort in the written task JSON (ExecutionRequest path)', async () => {
    const handler = await getHandler(server);
    await handler({ description: 'fix a bug', model: 'claude-sonnet-5', modelEffort: 'high', autoApprove: true });

    expect(writtenTaskJson()['modelEffort']).toBe('high');
  });

  it('omitted modelEffort → undefined at spawn and absent from the task JSON (no behavior change)', async () => {
    const handler = await getHandler(server);
    await handler({ description: 'fix a bug', model: 'claude-sonnet-5', autoApprove: true });

    expect(spawnOpts()['modelEffort']).toBeUndefined();
    expect(writtenTaskJson()['modelEffort']).toBeUndefined();
  });

  it('forwards an invalid modelEffort raw to spawn without erroring (validation lives in spawn, CLI parity)', async () => {
    const handler = await getHandler(server);
    const result = await handler({ description: 'fix a bug', model: 'claude-sonnet-5', modelEffort: 'bogus-level', autoApprove: true });

    expect(result.isError).not.toBe(true);
    // Raw forward — spawnWorkerMultiProvider resolves it via resolveReasoningEffort
    // exactly like cli/commands/run.ts does.
    expect(spawnOpts()['modelEffort']).toBe('bogus-level');
  });

  it('resolveReasoningEffort silently drops invalid/unsupported levels (spawn validation contract)', () => {
    // The contract the spawn path applies to the forwarded value:
    expect(resolveReasoningEffort('claude', 'bogus-level')).toBeUndefined(); // unknown level → dropped
    expect(resolveReasoningEffort('gemini', 'high')).toBeUndefined();        // unsupported provider → dropped
    expect(resolveReasoningEffort('claude', 'xhigh')).toBe('xhigh');         // valid → passes through
    expect(resolveReasoningEffort('codex', 'minimal')).toBe('minimal');      // valid → passes through
  });

  it('echoes timeoutMs in the response and defaults to 300000 (CLI --timeout parity)', async () => {
    const handler = await getHandler(server);
    const res = await handler({ description: 'fix a bug', model: 'claude-sonnet-5', timeoutMs: 60_000, autoApprove: true });
    expect(JSON.parse(res.content[0]!.text).timeoutMs).toBe(60_000);

    vi.clearAllMocks();
    vi.mocked(loadConfig).mockResolvedValue(REMOTE_WORKER_CONFIG as never);
    vi.mocked(spawnWorkerMultiProvider).mockResolvedValue({ backend: 'subprocess' } as never);
    const resDefault = await handler({ description: 'fix a bug', model: 'claude-sonnet-5', autoApprove: true });
    expect(JSON.parse(resDefault.content[0]!.text).timeoutMs).toBe(300_000);
  });

  it('keep=false → background watcher waits with timeoutMs and cleans up once the result arrives', async () => {
    vi.mocked(waitForRunResult).mockResolvedValue({ taskId: 'x', selfAssessment: 'DONE' } as never);

    const handler = await getHandler(server);
    const res = await handler({ description: 'fix a bug', model: 'claude-sonnet-5', keep: false, timeoutMs: 45_000, autoApprove: true });
    expect(JSON.parse(res.content[0]!.text).keep).toBe(false);

    await vi.waitFor(() => {
      expect(vi.mocked(cleanupRunTask)).toHaveBeenCalledOnce();
    });
    expect(vi.mocked(waitForRunResult)).toHaveBeenCalledOnce();
    // wait window is the requested timeoutMs; cleanup targets the spawned taskId
    const [, waitTaskId, waitTimeout] = vi.mocked(waitForRunResult).mock.calls[0]!;
    expect(waitTimeout).toBe(45_000);
    const [, cleanTaskId] = vi.mocked(cleanupRunTask).mock.calls[0]!;
    expect(cleanTaskId).toBe(waitTaskId);
  });

  it('keep omitted (MCP default: preserve) → no watcher, no cleanup', async () => {
    const handler = await getHandler(server);
    const res = await handler({ description: 'fix a bug', model: 'claude-sonnet-5', autoApprove: true });
    expect(JSON.parse(res.content[0]!.text).keep).toBe(true);

    // flush microtasks — a watcher (if wrongly started) would have fired by now
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(vi.mocked(waitForRunResult)).not.toHaveBeenCalled();
    expect(vi.mocked(cleanupRunTask)).not.toHaveBeenCalled();
  });

  it('keep=false + timeout without a result → files preserved (no cleanup under a live worker)', async () => {
    vi.mocked(waitForRunResult).mockResolvedValue(null); // timeout — no result

    const handler = await getHandler(server);
    await handler({ description: 'fix a bug', model: 'claude-sonnet-5', keep: false, autoApprove: true });

    await vi.waitFor(() => {
      expect(vi.mocked(waitForRunResult)).toHaveBeenCalledOnce();
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(vi.mocked(cleanupRunTask)).not.toHaveBeenCalled();
  });
});

// ─── Canonical model boundary — full-handler matrix (453-001) ─────────────────
// Mirrors the CLI matrix (tests/cli/run.test.ts). The handler resolves the model
// through the canonical registry BEFORE writing the Task JSON or spawning: a
// known ID infers its provider, an unseen versioned ID needs an explicit provider,
// and legacy aliases / unknown-no-provider / mismatch fail as an isError response
// with no disk write and no spawn. Unique unseen IDs avoid within-file registry
// bleed (registerParametric mutates the shared singleton).
describe('deckent_run MCP — canonical model boundary (453-001)', () => {
  let server: MockServer;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loadConfig).mockResolvedValue(REMOTE_WORKER_CONFIG as never);
    vi.mocked(spawnWorkerMultiProvider).mockResolvedValue({ backend: 'subprocess' } as never);
    vi.mocked(waitForRunResult).mockResolvedValue(null);
    server = createMockServer();
  });

  /** Parsed contents of every `.json` file written this test (Task JSON writes). */
  function jsonWrites(): Record<string, unknown>[] {
    return vi.mocked(writeFileSync).mock.calls
      .filter((c) => typeof c[0] === 'string' && (c[0] as string).endsWith('.json'))
      .map((c) => JSON.parse(c[1] as string) as Record<string, unknown>);
  }
  /** The exact model ID passed to the spawn wire (2nd positional arg). */
  function spawnModelArg(): unknown {
    return vi.mocked(spawnWorkerMultiProvider).mock.calls[0]![1];
  }

  it('accepts a known exact ID (gpt-5.6-sol); Task JSON + spawn carry the ID + inferred provider', async () => {
    const handler = await getHandler(server);
    const res = await handler({ description: 'fix a bug', model: 'gpt-5.6-sol', autoApprove: true });

    expect(res.isError).not.toBe(true);
    expect(writtenTaskJson()).toMatchObject({ model: 'gpt-5.6-sol', provider: 'codex' });
    expect(spawnModelArg()).toBe('gpt-5.6-sol');
    expect(spawnOpts()['provider']).toBe('codex');
    // User-visible output carries the exact resolved ID too (enrichResponse is identity-mocked).
    expect(JSON.parse(res.content[0]!.text).model).toBe('gpt-5.6-sol');
  });

  it('accepts an unseen versioned ID with provider=codex, byte-for-byte through Task JSON + spawn', async () => {
    modelRegistry.register(buildParametricModel('gpt-5.6-neo-453f', {
      provider: 'codex',
      costPerMillion: { input: 2, output: 10 },
      pricingEvidenceRef: 'catalog:test:gpt-5.6-neo-453f',
      status: 'ga',
    }));
    const handler = await getHandler(server);
    const res = await handler({ description: 'fix a bug', model: 'gpt-5.6-neo-453f', provider: 'codex', autoApprove: true });

    expect(res.isError).not.toBe(true);
    expect(writtenTaskJson()).toMatchObject({ model: 'gpt-5.6-neo-453f', provider: 'codex' });
    expect(spawnModelArg()).toBe('gpt-5.6-neo-453f');
    expect(spawnOpts()['provider']).toBe('codex');
  });

  it('omitted model resolves from the canonical config default (never a literal alias)', async () => {
    const handler = await getHandler(server);
    const res = await handler({ description: 'fix a bug', autoApprove: true });

    expect(res.isError).not.toBe(true);
    expect(writtenTaskJson()).toMatchObject({ model: 'claude-opus-4-8', provider: 'claude' });
    expect(spawnModelArg()).toBe('claude-opus-4-8');
  });

  it.each([
    ['legacy alias (gpt-5)', { model: 'gpt-5' }],
    ['unknown without provider', { model: 'gpt-5.6-ghost-453g' }],
    ['provider/model mismatch', { model: 'claude-opus-4-8', provider: 'codex' }],
  ])('fails loudly before disk/spawn: %s', async (_label, extra) => {
    const handler = await getHandler(server);
    const res = await handler({ description: 'fix a bug', autoApprove: true, ...extra });

    expect(res.isError).toBe(true);
    // Alias/mismatch never reached disk or the spawn wire.
    expect(jsonWrites()).toHaveLength(0);
    expect(vi.mocked(spawnWorkerMultiProvider)).not.toHaveBeenCalled();
  });
});
