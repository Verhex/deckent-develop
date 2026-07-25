import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerPlanTool } from '../../../src/mcp/tools/plan.js';

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('../../../src/core/config.js', () => ({
  readAuthMode: vi.fn().mockResolvedValue('subscription'),
  resolveEffectiveWorkers: (c: any) => c?.max_workers ?? c?.activeModeConfig?.max_workers ?? 4,
  resolveBrainModel: () => 'claude-sonnet-5',  // sprint-431 (431-003) compiler-cagri-zinciri okur
  resolveBrainPlanningMode: (c: any) => c?.brain_planning ?? c?.activeModeConfig?.brain_planning ?? 'auto',  // sprint-429 (429-006)
  loadConfig: vi.fn(),
}));

vi.mock('../../../src/orchestra/brain.js', () => ({
  readContext: vi.fn(),
  planSprint: vi.fn(),
}));

vi.mock('../../../src/core/provider.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/core/provider.js')>()),
  bootstrapProviders: vi.fn().mockResolvedValue({
    connector: {},
    registered: ['claude'],
    skipped: [],
    defaultProvider: 'claude',
    providerEnvOverrides: {},
  }),
}));

vi.mock('../../../src/mcp/helpers/enrich.js', () => ({
  enrichResponse: vi.fn((toolName: string, response: Record<string, unknown>) => ({
    ...response,
    _enriched: {
      summary: 'Sprint plan created.',
      hints: ['`deckent start` ile sprint\'i başlatın'],
      timestamp: '2026-01-01T00:00:00.000Z',
    },
  })),
}));

vi.mock('../../../src/mcp/helpers/format.js', () => ({
  formatPlanResponse: vi.fn(() => 'mocked summary'),
  wrapResponse: vi.fn(<T>(data: T, _summary: string) => data),
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

import { loadConfig } from '../../../src/core/config.js';
import { bootstrapProviders } from '../../../src/core/provider.js';
import { readContext, planSprint } from '../../../src/orchestra/brain.js';
import { enrichResponse } from '../../../src/mcp/helpers/enrich.js';

const mockLoadConfig = vi.mocked(loadConfig);
const mockReadContext = vi.mocked(readContext);
const mockPlanSprint = vi.mocked(planSprint);

function makeServer() {
  const handlers: Map<string, { schema: unknown; handler: Function }> = new Map();
  return {
    registerTool: vi.fn((name: string, schema: unknown, handler: Function) => {
      handlers.set(name, { schema, handler });
    }),
    _handlers: handlers,
    async callTool(name: string, input: unknown) {
      const entry = handlers.get(name);
      if (!entry) throw new Error(`Tool not registered: ${name}`);
      return entry.handler(input);
    },
  };
}

function makeDefaultMocks(overrides: Partial<{
  tasks: Array<{ id: string; title: string; model: string; priority: string }>;
  maxWorkers: number;
  presetMaxWorkers: number;
  mode: string;
}> = {}) {
  const tasks = overrides.tasks ?? [
    { id: '001', title: 'Task A', model: 'claude-opus-4-8', priority: 'HIGH' },
    { id: '002', title: 'Task B', model: 'claude-sonnet-5', priority: 'NORMAL' },
  ];

  const maxWorkers = overrides.maxWorkers ?? 3;
  mockLoadConfig.mockResolvedValue({
    brain_planning: 'auto',
    max_workers: maxWorkers,
    activeModeConfig: { max_workers: overrides.presetMaxWorkers ?? maxWorkers },
  } as any);
  mockReadContext.mockReturnValue({ directives: 'some directives', memory: '', retro: '', debt: '', patterns: [] } as any);
  mockPlanSprint.mockReturnValue({
    id: 'sprint-001',
    number: 1,
    tasks: tasks.map((t) => ({
      ...t,
      description: '',
      reason: '',
      effort: 'normal',
      scope: { directories: [], filesRead: [], filesWrite: [] },
      dependencies: [],
      goNogo: { goCriteria: 'pass', noGoCriteria: 'fail', techDebtAcceptable: '' },
      status: 'PENDING',
    })),
    reasoning: 'AI-generated plan',
    planningMode: overrides.mode ?? 'auto',
    plannerProof: {
      version: 1,
      requestedMode: overrides.mode ?? 'auto',
      actualMode: overrides.mode === 'structured' ? 'structured' : 'ai',
      resolutionReason: overrides.mode === 'structured' ? 'requested-structured' : 'model-success',
      directiveOverrideKinds: [],
      call: {
        attempted: overrides.mode !== 'structured',
        succeeded: overrides.mode !== 'structured',
        requestedProvider: null,
        resolvedProvider: overrides.mode === 'structured' ? null : 'claude',
        requestedModel: 'claude-opus-4-8',
        resolvedModel: overrides.mode === 'structured' ? null : 'claude-opus-4-8',
        failureReason: null,
      },
    },
  } as any);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('registerPlanTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Tool registration ──────────────────────────────────────────────────────

  describe('tool registration', () => {
    it('registers the tool with name deckent_plan', () => {
      const server = makeServer();
      registerPlanTool(server as any);
      expect(server.registerTool).toHaveBeenCalledTimes(1);
      const [name] = server.registerTool.mock.calls[0];
      expect(name).toBe('deckent_plan');
    });

    it('schema includes dryRun and mode parameters', () => {
      const server = makeServer();
      registerPlanTool(server as any);
      const [, schemaObj] = server.registerTool.mock.calls[0];
      const schema = (schemaObj as any).inputSchema;
      expect(schema).toBeDefined();
      // Validate shape accepts expected inputs
      const result = schema.safeParse({ dryRun: true, mode: 'ai' });
      expect(result.success).toBe(true);
    });

    it('mode parameter accepts ai, structured, auto values', () => {
      const server = makeServer();
      registerPlanTool(server as any);
      const [, schemaObj] = server.registerTool.mock.calls[0];
      const schema = (schemaObj as any).inputSchema;
      expect(schema.safeParse({ mode: 'ai' }).success).toBe(true);
      expect(schema.safeParse({ mode: 'structured' }).success).toBe(true);
      expect(schema.safeParse({ mode: 'auto' }).success).toBe(true);
      expect(schema.safeParse({ mode: 'invalid' }).success).toBe(false);
    });

    it('dryRun defaults to true when not provided', () => {
      const server = makeServer();
      registerPlanTool(server as any);
      const [, schemaObj] = server.registerTool.mock.calls[0];
      const schema = (schemaObj as any).inputSchema;
      const parsed = schema.safeParse({});
      expect(parsed.success).toBe(true);
      expect(parsed.data.dryRun).toBe(true);
    });
  });

  // ── Planning modes ─────────────────────────────────────────────────────────

  describe('planning modes', () => {
    it('passes ai mode to planSprint', async () => {
      const server = makeServer();
      registerPlanTool(server as any);
      makeDefaultMocks({ mode: 'ai' });

      await server.callTool('deckent_plan', { mode: 'ai' });

      expect(mockPlanSprint).toHaveBeenCalledWith(
        expect.any(String),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ mode: 'ai' }),
      );
    });

    it('passes structured mode to planSprint', async () => {
      const server = makeServer();
      registerPlanTool(server as any);
      makeDefaultMocks({ mode: 'structured' });

      await server.callTool('deckent_plan', { mode: 'structured' });

      expect(mockPlanSprint).toHaveBeenCalledWith(
        expect.any(String),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ mode: 'structured' }),
      );
      expect(bootstrapProviders).not.toHaveBeenCalled();
    });

    it('passes auto mode to planSprint', async () => {
      const server = makeServer();
      registerPlanTool(server as any);
      makeDefaultMocks({ mode: 'auto' });

      await server.callTool('deckent_plan', { mode: 'auto' });

      expect(mockPlanSprint).toHaveBeenCalledWith(
        expect.any(String),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ mode: 'auto' }),
      );
    });

    it('passes undefined mode when not specified', async () => {
      const server = makeServer();
      registerPlanTool(server as any);
      makeDefaultMocks();

      await server.callTool('deckent_plan', {});

      expect(mockPlanSprint).toHaveBeenCalledWith(
        expect.any(String),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ mode: undefined }),
      );
    });
  });

  // ── dryRun mode ────────────────────────────────────────────────────────────

  describe('dryRun mode', () => {
    it('does not create task files (planSprint is the only action)', async () => {
      const server = makeServer();
      registerPlanTool(server as any);
      makeDefaultMocks();

      const result = await server.callTool('deckent_plan', { dryRun: true });

      // planSprint is called but NOT runSprint — no task files written
      expect(mockPlanSprint).toHaveBeenCalledTimes(1);
      expect(result).toBeDefined();
    });

    it('returns response without spawning workers', async () => {
      const server = makeServer();
      registerPlanTool(server as any);
      makeDefaultMocks();

      const result = await server.callTool('deckent_plan', { dryRun: true });
      const content = JSON.parse(result.content[0].text);

      // Confirms plan-only: sprintId present, no job ID (no spawn)
      expect(content.sprintId).toBe('sprint-001');
      expect(content.jobId).toBeUndefined();
    });

    it('passes dryRun:true to planSprint so it never writes task files (R7)', async () => {
      const server = makeServer();
      registerPlanTool(server as any);
      makeDefaultMocks();

      await server.callTool('deckent_plan', {});

      // The bug: the handler passed no dryRun, so planSprint's write-guard
      // (`if (!options?.dryRun)`) wrote real .tasks/task-*.json despite the
      // schema advertising "tasks are never written to disk".
      expect(mockPlanSprint).toHaveBeenCalledWith(
        expect.any(String),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ dryRun: true }),
      );
    });

    it('forces dryRun even when the caller asks for dryRun:false (preview-only contract)', async () => {
      const server = makeServer();
      registerPlanTool(server as any);
      makeDefaultMocks();

      await server.callTool('deckent_plan', { dryRun: false });

      // deckent_plan is preview-only; execution is deckent_start's job. A
      // dryRun:false input must NOT cause planSprint to write task files.
      expect(mockPlanSprint).toHaveBeenCalledWith(
        expect.any(String),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ dryRun: true }),
      );
    });
  });

  // ── Task list response ─────────────────────────────────────────────────────

  describe('task list response', () => {
    it('returns tasks with id, title, model, priority fields', async () => {
      const server = makeServer();
      registerPlanTool(server as any);
      makeDefaultMocks();

      const result = await server.callTool('deckent_plan', {});
      const content = JSON.parse(result.content[0].text);

      expect(content.tasks).toHaveLength(2);
      expect(content.tasks[0]).toMatchObject({
        id: '001',
        title: 'Task A',
        model: 'claude-opus-4-8',
        priority: 'HIGH',
      });
      expect(content.tasks[1]).toMatchObject({
        id: '002',
        title: 'Task B',
        model: 'claude-sonnet-5',
        priority: 'NORMAL',
      });
    });

    it('returns correct task count matching planSprint output', async () => {
      const server = makeServer();
      registerPlanTool(server as any);
      makeDefaultMocks({
        tasks: [
          { id: '001', title: 'T1', model: 'claude-opus-4-8', priority: 'CRITICAL' },
          { id: '002', title: 'T2', model: 'claude-sonnet-5', priority: 'HIGH' },
          { id: '003', title: 'T3', model: 'claude-haiku-4-5-20251001', priority: 'NORMAL' },
        ],
      });

      const result = await server.callTool('deckent_plan', {});
      const content = JSON.parse(result.content[0].text);

      expect(content.tasks).toHaveLength(3);
    });

    it('returns model distribution in response', async () => {
      const server = makeServer();
      registerPlanTool(server as any);
      makeDefaultMocks({
        tasks: [
          { id: '001', title: 'T1', model: 'claude-opus-4-8', priority: 'HIGH' },
          { id: '002', title: 'T2', model: 'claude-opus-4-8', priority: 'NORMAL' },
          { id: '003', title: 'T3', model: 'claude-sonnet-5', priority: 'NORMAL' },
        ],
      });

      const result = await server.callTool('deckent_plan', {});
      const content = JSON.parse(result.content[0].text);

      expect(content.modelDistribution).toEqual({
        'claude-opus-4-8': 2,
        'claude-sonnet-5': 1,
      });
    });

    it('returns wave breakdown based on maxWorkers', async () => {
      const server = makeServer();
      registerPlanTool(server as any);
      makeDefaultMocks({
        tasks: [
          { id: '001', title: 'T1', model: 'claude-opus-4-8', priority: 'HIGH' },
          { id: '002', title: 'T2', model: 'claude-sonnet-5', priority: 'NORMAL' },
          { id: '003', title: 'T3', model: 'claude-haiku-4-5-20251001', priority: 'LOW' },
          { id: '004', title: 'T4', model: 'claude-sonnet-5', priority: 'NORMAL' },
        ],
        maxWorkers: 2,
      });

      const result = await server.callTool('deckent_plan', {});
      const content = JSON.parse(result.content[0].text);

      expect(content.waveBreakdown).toEqual({ wave1: 2, wave2: 2 });
    });

    it('returns the same digest-bound execution topology used by preview and scheduler', async () => {
      const server = makeServer();
      registerPlanTool(server as any);
      makeDefaultMocks({ maxWorkers: 2 });

      const result = await server.callTool('deckent_plan', {});
      const content = JSON.parse(result.content[0].text);

      expect(content.planDigestVersion).toBe(3);
      expect(content.topologyGate).toBe('pass');
      expect(content.executionTopology).toMatchObject({
        schemaVersion: 1,
        configuredMaxWorkers: 2,
        effectiveConcurrency: 2,
        verdict: 'pass',
      });
      expect(content.waveBreakdown).toEqual({ wave1: 2 });
    });

    it('surfaces the top-level runtime worker override instead of the mode preset', async () => {
      const server = makeServer();
      registerPlanTool(server as any);
      makeDefaultMocks({ maxWorkers: 2, presetMaxWorkers: 5 });

      const result = await server.callTool('deckent_plan', {});
      const content = JSON.parse(result.content[0].text);

      expect(content.recommendation.maxWorkers).toBe(2);
      expect(content.executionTopology.configuredMaxWorkers).toBe(2);
    });

    it('returns risk assessment based on task count', async () => {
      const server = makeServer();
      registerPlanTool(server as any);

      // low risk: <= 3 tasks
      makeDefaultMocks({ tasks: [{ id: '001', title: 'T1', model: 'claude-sonnet-5', priority: 'NORMAL' }] });
      let result = await server.callTool('deckent_plan', {});
      let content = JSON.parse(result.content[0].text);
      expect(content.riskAssessment).toBe('low');

      // medium risk: 4-8 tasks
      makeDefaultMocks({
        tasks: Array.from({ length: 5 }, (_, i) => ({
          id: `00${i + 1}`,
          title: `Task ${i + 1}`,
          model: 'claude-sonnet-5',
          priority: 'NORMAL',
        })),
      });
      result = await server.callTool('deckent_plan', {});
      content = JSON.parse(result.content[0].text);
      expect(content.riskAssessment).toBe('medium');

      // high risk: > 8 tasks
      makeDefaultMocks({
        tasks: Array.from({ length: 10 }, (_, i) => ({
          id: `0${i + 1}`,
          title: `Task ${i + 1}`,
          model: 'claude-sonnet-5',
          priority: 'NORMAL',
        })),
      });
      result = await server.callTool('deckent_plan', {});
      content = JSON.parse(result.content[0].text);
      expect(content.riskAssessment).toBe('high');
    });

    it('response includes sprintId, sprintNumber and planningMode', async () => {
      const server = makeServer();
      registerPlanTool(server as any);
      makeDefaultMocks({ mode: 'structured' });

      const result = await server.callTool('deckent_plan', { mode: 'structured' });
      const content = JSON.parse(result.content[0].text);

      expect(content.sprintId).toBe('sprint-001');
      expect(content.sprintNumber).toBe(1);
      expect(content.planningMode).toBe('structured');
      expect(content.plannerProof).toMatchObject({
        requestedMode: 'structured',
        actualMode: 'structured',
        resolutionReason: 'requested-structured',
        call: { attempted: false, succeeded: false },
      });
    });
  });

  // ── Error handling ─────────────────────────────────────────────────────────

  describe('error handling', () => {
    it('returns isError when planSprint throws (e.g. missing directives)', async () => {
      const server = makeServer();
      registerPlanTool(server as any);

      mockLoadConfig.mockResolvedValue({ brain_planning: 'auto', max_workers: 3, activeModeConfig: { max_workers: 3 } } as any);
      mockReadContext.mockReturnValue({ directives: '', memory: '', retro: '', debt: '', patterns: [] } as any);
      mockPlanSprint.mockImplementation(() => {
        throw new Error('DIRECTIVES.md missing or empty');
      });

      const result = await server.callTool('deckent_plan', {});
      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toBe(true);
      expect(parsed.message).toContain('DIRECTIVES.md missing or empty');
    });

    it('preserves planner proof from a pre-Sprint planning failure', async () => {
      const server = makeServer();
      registerPlanTool(server as any);
      makeDefaultMocks();
      const plannerProof = {
        version: 1,
        requestedMode: 'ai',
        actualMode: 'failed',
        resolutionReason: 'model-failure',
        directiveOverrideKinds: [],
        call: {
          attempted: true,
          succeeded: false,
          requestedProvider: 'claude',
          resolvedProvider: 'claude',
          requestedModel: 'claude-opus-4-8',
          resolvedModel: 'claude-opus-4-8',
          failureReason: 'spawn_failed',
        },
      };
      const err = Object.assign(new Error('planner spawn failed'), { plannerProof });
      mockPlanSprint.mockRejectedValue(err);

      const result = await server.callTool('deckent_plan', { mode: 'ai' });
      const parsed = JSON.parse(result.content[0].text);
      expect(result.isError).toBe(true);
      expect(parsed.plannerProof).toEqual(plannerProof);
    });

    it('returns isError when loadConfig fails', async () => {
      const server = makeServer();
      registerPlanTool(server as any);

      mockLoadConfig.mockRejectedValue(new Error('Config file not found'));

      const result = await server.callTool('deckent_plan', {});
      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toBe(true);
      expect(parsed.message).toContain('Config file not found');
    });

  });

  // ── Enriched response ──────────────────────────────────────────────────────

  describe('enriched response', () => {
    it('calls enrichResponse with plan tool name', async () => {
      const server = makeServer();
      registerPlanTool(server as any);
      makeDefaultMocks();

      await server.callTool('deckent_plan', {});

      expect(enrichResponse).toHaveBeenCalledWith('plan', expect.objectContaining({ sprintId: 'sprint-001' }));
    });

    it('response content is JSON-serialized enriched object', async () => {
      const server = makeServer();
      registerPlanTool(server as any);
      makeDefaultMocks();

      const result = await server.callTool('deckent_plan', {});

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed._enriched).toBeDefined();
      expect(parsed._enriched.summary).toBe('Sprint plan created.');
      expect(parsed._enriched.hints).toBeInstanceOf(Array);
    });
  });
});
