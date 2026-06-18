/**
 * Tests for MCP tool annotations and enriched descriptions.
 * Verifies that all 15 tools have:
 *   - annotations (readOnlyHint, destructiveHint, idempotentHint)
 *   - sufficiently detailed descriptions (>80 chars)
 *   - correct annotation semantics (read-only tools are not destructive, etc.)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { existsSync, readFileSync, writeFileSync, readdirSync, mkdirSync, unlinkSync } from 'node:fs';

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('node:fs', () => ({
  existsSync: vi.fn().mockReturnValue(true),
  readFileSync: vi.fn().mockReturnValue('{}'),
  writeFileSync: vi.fn(),
  readdirSync: vi.fn().mockReturnValue([]),
  mkdirSync: vi.fn(),
  unlinkSync: vi.fn(),
}));

vi.mock('../../../src/core/utils.js', () => ({
  ensureDeckentImport: vi.fn(),
  countBrainLines: vi.fn().mockReturnValue(50),
  getNextSprintId: vi.fn().mockReturnValue('sprint-002'),
}));

vi.mock('../../../src/core/analyzer.js', () => ({
  analyzeProject: vi.fn().mockReturnValue({
    language: 'typescript',
    framework: 'none',
    testFramework: 'vitest',
    buildTool: 'tsc',
    ci: 'github-actions',
    size: 'medium',
    methodology: 'agile',
  }),
}));

vi.mock('../../../src/core/config.js', () => ({
  loadConfig: vi.fn().mockResolvedValue({
    mode: 'max_plan',
    max_workers: 3,
    routing_engine: 'v2',
    brain_planning: 'auto',
  }),
  validatePartialConfig: vi.fn(),
}));

vi.mock('../../../src/core/provider.js', () => ({
  bootstrapProviders: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../../src/orchestra/brain.js', () => ({
  readContext: vi.fn().mockReturnValue({}),
  planSprint: vi.fn().mockResolvedValue({
    id: 'sprint-001',
    number: 1,
    tasks: [],
    reasoning: 'test',
    planningMode: 'structured',
  }),
  runSprint: vi.fn().mockResolvedValue({ id: 'sprint-001', tasks: [], metrics: null }),
  runDecay: vi.fn().mockReturnValue({ trimmed: 0 }),
  BrainError: class BrainError extends Error {},
}));

vi.mock('../../../src/cli/commands/doctor.js', () => ({
  runDoctorChecks: vi.fn().mockReturnValue({ ok: true, checks: [], score: 100 }),
}));

vi.mock('../../../src/core/system-profile.js', () => ({
  getSystemProfile: vi.fn().mockReturnValue({ cpuCores: 4, totalMemMB: 8192, freeMemMB: 4096, recommendedMaxWorkers: 4 }),
}));

vi.mock('../../../src/core/subscription.js', () => ({
  detectSubscription: vi.fn().mockReturnValue({ detected: 'max', method: 'auto' }),
}));

vi.mock('../../../src/core/config-migration.js', () => ({
  setNestedValue: vi.fn(),
  getNestedValue: vi.fn().mockReturnValue('value'),
}));

vi.mock('../../../src/orchestra/sprint-reporter.js', () => ({
  generateProjectIdentity: vi.fn().mockReturnValue('# Identity'),
}));

vi.mock('../../../src/mcp/tools/job-runner.js', () => ({
  writeJobState: vi.fn(),
  readLatestJobState: vi.fn().mockReturnValue(null),
  buildTaskSummaries: vi.fn().mockReturnValue([]),
}));

vi.mock('../../../src/mcp/helpers/enrich.js', () => ({
  enrichResponse: vi.fn((toolName, response) => ({ ...response, _enriched: { summary: `${toolName} done`, hints: [], timestamp: '2026-03-27T00:00:00.000Z' } })),
}));

vi.mock('../../../src/mcp/helpers/format.js', () => ({
  formatPlanResponse: vi.fn().mockReturnValue('plan summary'),
  formatStartResponse: vi.fn().mockReturnValue('start summary'),
  formatStatusResponse: vi.fn().mockReturnValue('status summary'),
  formatDoctorResponse: vi.fn().mockReturnValue('doctor summary'),
  formatRetroResponse: vi.fn().mockReturnValue('retro summary'),
  formatHistoryResponse: vi.fn().mockReturnValue('history summary'),
  formatErrorResponse: vi.fn().mockReturnValue('error summary'),
  wrapResponse: vi.fn((data, summary) => ({ data, summary })),
}));

// ─── Mock Server ──────────────────────────────────────────────────────────────

type ToolAnnotations = {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
};

type ToolConfig = {
  title?: string;
  description?: string;
  annotations?: ToolAnnotations;
  inputSchema?: unknown;
};

type ToolHandler = (args: Record<string, unknown>) => Promise<unknown>;

interface MockServer {
  tools: Map<string, { config: ToolConfig; handler: ToolHandler }>;
  registerTool: (name: string, config: ToolConfig, handler: ToolHandler) => void;
}

function createMockServer(): MockServer {
  const tools = new Map<string, { config: ToolConfig; handler: ToolHandler }>();
  return {
    tools,
    registerTool(name, config, handler) {
      tools.set(name, { config, handler });
    },
  };
}

// ─── Helper ───────────────────────────────────────────────────────────────────

async function registerAllTools(server: MockServer) {
  const serverArg = server as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer;
  const [
    { registerInitTool },
    { registerSetDirectivesTool },
    { registerPlanTool },
    { registerStartTool },
    { registerStatusTool },
    { registerDoctorTool },
    { registerRetroTool },
    { registerHistoryTool },
    { registerAnalyzeTool },
    { registerSyncTool },
    { registerConfigTool },
    { registerReviewTool },
    { registerRunTool },
    { registerKillTool },
    { registerCleanupTool },
  ] = await Promise.all([
    import('../../../src/mcp/tools/init.js'),
    import('../../../src/mcp/tools/directives.js'),
    import('../../../src/mcp/tools/plan.js'),
    import('../../../src/mcp/tools/start.js'),
    import('../../../src/mcp/tools/status.js'),
    import('../../../src/mcp/tools/doctor.js'),
    import('../../../src/mcp/tools/retro.js'),
    import('../../../src/mcp/tools/history.js'),
    import('../../../src/mcp/tools/analyze.js'),
    import('../../../src/mcp/tools/sync.js'),
    import('../../../src/mcp/tools/config.js'),
    import('../../../src/mcp/tools/review.js'),
    import('../../../src/mcp/tools/run.js'),
    import('../../../src/mcp/tools/kill.js'),
    import('../../../src/mcp/tools/cleanup.js'),
  ]);

  registerInitTool(serverArg);
  registerSetDirectivesTool(serverArg);
  registerPlanTool(serverArg);
  registerStartTool(serverArg);
  registerStatusTool(serverArg);
  registerDoctorTool(serverArg);
  registerRetroTool(serverArg);
  registerHistoryTool(serverArg);
  registerAnalyzeTool(serverArg);
  registerSyncTool(serverArg);
  registerConfigTool(serverArg);
  registerReviewTool(serverArg);
  registerRunTool(serverArg);
  registerKillTool(serverArg);
  registerCleanupTool(serverArg);
}

const ALL_TOOL_NAMES = [
  'deckent_init',
  'deckent_set_directives',
  'deckent_plan',
  'deckent_start',
  'deckent_status',
  'deckent_doctor',
  'deckent_retro',
  'deckent_history',
  'deckent_analyze_project',
  'deckent_sync',
  'deckent_config',
  'deckent_review',
  'deckent_run',
  'deckent_kill',
  'deckent_cleanup',
];

// ─── Annotation Tests ─────────────────────────────────────────────────────────

describe('MCP Tool Annotations', () => {
  let server: MockServer;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('{}');
    vi.mocked(readdirSync).mockReturnValue([]);
    server = createMockServer();
    await registerAllTools(server);
  });

  it('all 15 tools are registered', () => {
    for (const name of ALL_TOOL_NAMES) {
      expect(server.tools.has(name), `Missing tool: ${name}`).toBe(true);
    }
    // Count exactly 15
    const registeredNames = [...server.tools.keys()].filter((n) => ALL_TOOL_NAMES.includes(n));
    expect(registeredNames).toHaveLength(15);
  });

  it('every tool has an annotations object', () => {
    for (const name of ALL_TOOL_NAMES) {
      const tool = server.tools.get(name);
      expect(tool?.config.annotations, `Missing annotations on ${name}`).toBeDefined();
    }
  });

  it('every tool has readOnlyHint defined (boolean)', () => {
    for (const name of ALL_TOOL_NAMES) {
      const annotations = server.tools.get(name)?.config.annotations;
      expect(typeof annotations?.readOnlyHint, `readOnlyHint must be boolean on ${name}`).toBe('boolean');
    }
  });

  it('every tool has destructiveHint defined (boolean)', () => {
    for (const name of ALL_TOOL_NAMES) {
      const annotations = server.tools.get(name)?.config.annotations;
      expect(typeof annotations?.destructiveHint, `destructiveHint must be boolean on ${name}`).toBe('boolean');
    }
  });

  it('read-only tools do not have destructiveHint=true', () => {
    const readOnlyTools = ALL_TOOL_NAMES.filter((n) => server.tools.get(n)?.config.annotations?.readOnlyHint === true);
    for (const name of readOnlyTools) {
      const annotations = server.tools.get(name)!.config.annotations!;
      expect(annotations.destructiveHint, `read-only tool ${name} should not be destructive`).not.toBe(true);
    }
  });

  it('destructive tools are NOT read-only', () => {
    const destructiveTools = ALL_TOOL_NAMES.filter((n) => server.tools.get(n)?.config.annotations?.destructiveHint === true);
    for (const name of destructiveTools) {
      const annotations = server.tools.get(name)!.config.annotations!;
      expect(annotations.readOnlyHint, `destructive tool ${name} should not be read-only`).not.toBe(true);
    }
  });
});

// ─── Description Tests ────────────────────────────────────────────────────────

describe('MCP Tool Descriptions', () => {
  let server: MockServer;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('{}');
    vi.mocked(readdirSync).mockReturnValue([]);
    server = createMockServer();
    await registerAllTools(server);
  });

  it('every tool has a non-empty description', () => {
    for (const name of ALL_TOOL_NAMES) {
      const desc = server.tools.get(name)?.config.description;
      expect(desc, `Missing description on ${name}`).toBeTruthy();
      expect(desc!.length, `Description too short on ${name}`).toBeGreaterThan(0);
    }
  });

  it('every description is at least 80 characters (enriched)', () => {
    for (const name of ALL_TOOL_NAMES) {
      const desc = server.tools.get(name)?.config.description ?? '';
      expect(desc.length, `Description too short on ${name}: "${desc.slice(0, 60)}..."`).toBeGreaterThanOrEqual(80);
    }
  });

  it('deckent_set_directives description includes DIRECTIVES format example', () => {
    const desc = server.tools.get('deckent_set_directives')?.config.description ?? '';
    expect(desc).toMatch(/##\s*Task/i);
    expect(desc).toMatch(/Model/);
    expect(desc).toMatch(/Effort/);
  });

  it('deckent_plan description mentions plan/task concepts', () => {
    const desc = server.tools.get('deckent_plan')?.config.description ?? '';
    expect(desc).toMatch(/plan/i);
    expect(desc).toMatch(/DIRECTIVES/);
    expect(desc).toMatch(/task/i);
  });

  it('deckent_status description mentions agents, alerts, progress, job', () => {
    const desc = server.tools.get('deckent_status')?.config.description ?? '';
    expect(desc).toMatch(/agents?/i);
    expect(desc).toMatch(/alerts?/i);
    expect(desc).toMatch(/progress/i);
    expect(desc).toMatch(/job/i);
  });

  it('deckent_review description explains GO/NO_GO/GO_WITH_TECH_DEBT', () => {
    const desc = server.tools.get('deckent_review')?.config.description ?? '';
    expect(desc).toMatch(/GO/);
    expect(desc).toMatch(/NO_GO/);
    expect(desc).toMatch(/TECH_DEBT/);
  });

  it('deckent_analyze_project description mentions what is detected', () => {
    const desc = server.tools.get('deckent_analyze_project')?.config.description ?? '';
    expect(desc).toMatch(/language/i);
    expect(desc).toMatch(/framework/i);
    expect(desc).toMatch(/test/i);
  });

  it('deckent_retro description explains what is returned', () => {
    const desc = server.tools.get('deckent_retro')?.config.description ?? '';
    expect(desc).toMatch(/retrospect/i);
    expect(desc).toMatch(/highlight/i);
  });
});

// ─── Specific Annotation Values ───────────────────────────────────────────────

describe('Specific Tool Annotation Values', () => {
  let server: MockServer;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('{}');
    vi.mocked(readdirSync).mockReturnValue([]);
    server = createMockServer();
    await registerAllTools(server);
  });

  it('deckent_init: not destructive, idempotent', () => {
    const ann = server.tools.get('deckent_init')?.config.annotations;
    expect(ann?.readOnlyHint).toBe(false);
    expect(ann?.destructiveHint).toBe(false);
    expect(ann?.idempotentHint).toBe(true);
  });

  it('deckent_status: read-only, not destructive', () => {
    const ann = server.tools.get('deckent_status')?.config.annotations;
    expect(ann?.readOnlyHint).toBe(true);
    expect(ann?.destructiveHint).toBe(false);
  });

  it('deckent_kill: destructive, not read-only', () => {
    const ann = server.tools.get('deckent_kill')?.config.annotations;
    expect(ann?.readOnlyHint).not.toBe(true);
    expect(ann?.destructiveHint).toBe(true);
  });

  it('deckent_cleanup: destructive, not read-only', () => {
    const ann = server.tools.get('deckent_cleanup')?.config.annotations;
    expect(ann?.readOnlyHint).not.toBe(true);
    expect(ann?.destructiveHint).toBe(true);
  });

  it('deckent_plan: write tool (writes .tasks/task-*.json), not destructive', () => {
    const ann = server.tools.get('deckent_plan')?.config.annotations;
    // MCP-W1: plan writes .tasks/ files → readOnlyHint must be false (corrected from original true)
    expect(ann?.readOnlyHint).toBe(false);
    expect(ann?.destructiveHint).toBe(false);
  });

  it('deckent_retro: read-only', () => {
    const ann = server.tools.get('deckent_retro')?.config.annotations;
    expect(ann?.readOnlyHint).toBe(true);
    expect(ann?.destructiveHint).toBe(false);
  });

  it('deckent_history: read-only', () => {
    const ann = server.tools.get('deckent_history')?.config.annotations;
    expect(ann?.readOnlyHint).toBe(true);
    expect(ann?.destructiveHint).toBe(false);
  });

  it('deckent_doctor: read-only', () => {
    const ann = server.tools.get('deckent_doctor')?.config.annotations;
    expect(ann?.readOnlyHint).toBe(true);
    expect(ann?.destructiveHint).toBe(false);
  });

  it('deckent_analyze_project: read-only, idempotent', () => {
    const ann = server.tools.get('deckent_analyze_project')?.config.annotations;
    expect(ann?.readOnlyHint).toBe(true);
    expect(ann?.destructiveHint).toBe(false);
    expect(ann?.idempotentHint).toBe(true);
  });

  it('deckent_review: read-only (only reads task results)', () => {
    const ann = server.tools.get('deckent_review')?.config.annotations;
    expect(ann?.readOnlyHint).toBe(true);
    expect(ann?.destructiveHint).toBe(false);
  });

  it('deckent_sync: not destructive, idempotent (additive-only)', () => {
    const ann = server.tools.get('deckent_sync')?.config.annotations;
    expect(ann?.destructiveHint).toBe(false);
    expect(ann?.idempotentHint).toBe(true);
  });
});
