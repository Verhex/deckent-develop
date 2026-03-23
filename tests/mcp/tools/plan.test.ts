import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerPlanTool } from '../../../src/mcp/tools/plan.js';

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('../../../src/core/config.js', () => ({
  loadConfig: vi.fn(),
}));

vi.mock('../../../src/orchestra/brain.js', () => ({
  readContext: vi.fn(),
  checkUsage: vi.fn(),
  adjustSprintSize: vi.fn(),
  planSprint: vi.fn(),
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
import { readContext, checkUsage, adjustSprintSize, planSprint } from '../../../src/orchestra/brain.js';
import { enrichResponse } from '../../../src/mcp/helpers/enrich.js';

const mockLoadConfig = vi.mocked(loadConfig);
const mockReadContext = vi.mocked(readContext);
const mockCheckUsage = vi.mocked(checkUsage);
const mockAdjustSprintSize = vi.mocked(adjustSprintSize);
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
  mode: string;
}> = {}) {
  const tasks = overrides.tasks ?? [
    { id: '001', title: 'Task A', model: 'opus', priority: 'HIGH' },
    { id: '002', title: 'Task B', model: 'sonnet', priority: 'NORMAL' },
  ];

  mockLoadConfig.mockResolvedValue({ brain_planning: 'auto', max_workers: 3 } as any);
  mockReadContext.mockReturnValue({ directives: 'some directives', memory: '', retro: '', debt: '', patterns: [] } as any);
  mockCheckUsage.mockReturnValue({ allowed: true, remaining: 100, used: 50 } as any);
  mockAdjustSprintSize.mockReturnValue({
    size: tasks.length,
    maxWorkers: overrides.maxWorkers ?? 3,
    reason: 'normal usage',
  } as any);
  mockPlanSprint.mockReturnValue({
    id: 'sprint-001',
    number: 1,
    tasks: tasks.map((t) => ({ ...t, scope: { directories: [] }, status: 'PENDING', description: '', effort: 'normal' })),
    reasoning: 'AI-generated plan',
    planningMode: overrides.mode ?? 'auto',
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
        model: 'opus',
        priority: 'HIGH',
      });
      expect(content.tasks[1]).toMatchObject({
        id: '002',
        title: 'Task B',
        model: 'sonnet',
        priority: 'NORMAL',
      });
    });

    it('returns correct task count matching planSprint output', async () => {
      const server = makeServer();
      registerPlanTool(server as any);
      makeDefaultMocks({
        tasks: [
          { id: '001', title: 'T1', model: 'opus', priority: 'CRITICAL' },
          { id: '002', title: 'T2', model: 'sonnet', priority: 'HIGH' },
          { id: '003', title: 'T3', model: 'haiku', priority: 'NORMAL' },
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
          { id: '001', title: 'T1', model: 'opus', priority: 'HIGH' },
          { id: '002', title: 'T2', model: 'opus', priority: 'NORMAL' },
          { id: '003', title: 'T3', model: 'sonnet', priority: 'NORMAL' },
        ],
      });

      const result = await server.callTool('deckent_plan', {});
      const content = JSON.parse(result.content[0].text);

      expect(content.modelDistribution).toEqual({ opus: 2, sonnet: 1 });
    });

    it('returns wave breakdown based on maxWorkers', async () => {
      const server = makeServer();
      registerPlanTool(server as any);
      makeDefaultMocks({
        tasks: [
          { id: '001', title: 'T1', model: 'opus', priority: 'HIGH' },
          { id: '002', title: 'T2', model: 'sonnet', priority: 'NORMAL' },
          { id: '003', title: 'T3', model: 'haiku', priority: 'LOW' },
          { id: '004', title: 'T4', model: 'sonnet', priority: 'NORMAL' },
        ],
        maxWorkers: 2,
      });

      const result = await server.callTool('deckent_plan', {});
      const content = JSON.parse(result.content[0].text);

      expect(content.waveBreakdown).toEqual({ wave1: 2, wave2: 2 });
    });

    it('returns risk assessment based on task count', async () => {
      const server = makeServer();
      registerPlanTool(server as any);

      // low risk: <= 3 tasks
      makeDefaultMocks({ tasks: [{ id: '001', title: 'T1', model: 'sonnet', priority: 'NORMAL' }] });
      let result = await server.callTool('deckent_plan', {});
      let content = JSON.parse(result.content[0].text);
      expect(content.riskAssessment).toBe('low');

      // medium risk: 4-8 tasks
      makeDefaultMocks({
        tasks: Array.from({ length: 5 }, (_, i) => ({
          id: `00${i + 1}`,
          title: `Task ${i + 1}`,
          model: 'sonnet',
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
          model: 'sonnet',
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
    });
  });

  // ── Error handling ─────────────────────────────────────────────────────────

  describe('error handling', () => {
    it('propagates error when planSprint throws (e.g. missing directives)', async () => {
      const server = makeServer();
      registerPlanTool(server as any);

      mockLoadConfig.mockResolvedValue({ brain_planning: 'auto', max_workers: 3 } as any);
      mockReadContext.mockReturnValue({ directives: '', memory: '', retro: '', debt: '', patterns: [] } as any);
      mockCheckUsage.mockReturnValue({ allowed: true, remaining: 100, used: 50 } as any);
      mockAdjustSprintSize.mockReturnValue({ size: 3, maxWorkers: 3, reason: 'normal' } as any);
      mockPlanSprint.mockImplementation(() => {
        throw new Error('DIRECTIVES.md missing or empty');
      });

      await expect(server.callTool('deckent_plan', {})).rejects.toThrow('DIRECTIVES.md missing or empty');
    });

    it('propagates error when loadConfig fails', async () => {
      const server = makeServer();
      registerPlanTool(server as any);

      mockLoadConfig.mockRejectedValue(new Error('Config file not found'));

      await expect(server.callTool('deckent_plan', {})).rejects.toThrow('Config file not found');
    });

    it('propagates error when adjustSprintSize throws (usage limit)', async () => {
      const server = makeServer();
      registerPlanTool(server as any);

      mockLoadConfig.mockResolvedValue({ brain_planning: 'auto', max_workers: 3 } as any);
      mockReadContext.mockReturnValue({ directives: 'some directives' } as any);
      mockCheckUsage.mockReturnValue({ allowed: false, remaining: 0, used: 100 } as any);
      mockAdjustSprintSize.mockImplementation(() => {
        throw new Error('Usage limit exceeded');
      });

      await expect(server.callTool('deckent_plan', {})).rejects.toThrow('Usage limit exceeded');
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
