// ─── deckent_audit MCP action expansion — gate/query/compliance/retention (269-004, ADR-022) ───
// Hermetic: every runner is mocked at its module boundary; the tests pin that
// each action dispatches to the correct SSOT runner (CLI runners / queryAudit)
// with CLI-parity params, and that gate stays back-compatible.
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ──────────────────────────────────────────────────────────

const mockRunSelfAuditGate = vi.fn();

vi.mock('../../src/orchestra/sprint-finalizer.js', () => ({
  runSelfAuditGate: (...args: unknown[]) => mockRunSelfAuditGate(...args),
}));

vi.mock('node:fs', () => ({
  existsSync: vi.fn().mockReturnValue(true),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

vi.mock('../../src/core/audit-query.js', () => ({
  queryAudit: vi.fn(),
}));

// CLI runners are the SSOT (imported by the tool, never reimplemented)
vi.mock('../../src/cli/commands/audit.js', () => ({
  runComplianceReport: vi.fn(),
  runAuditRetention: vi.fn(),
}));

vi.mock('../../src/core/config.js', () => ({
  resolveBrainPlanningMode: (c: any) => c?.brain_planning ?? c?.activeModeConfig?.brain_planning ?? 'auto',  // sprint-429 (429-006)
  loadConfig: vi.fn(),
}));

vi.mock('../../src/mcp/helpers/enrich.js', () => ({
  enrichResponse: vi.fn((_t: string, data: unknown) => data),
}));

import { queryAudit } from '../../src/core/audit-query.js';
import { runComplianceReport, runAuditRetention } from '../../src/cli/commands/audit.js';
import { loadConfig } from '../../src/core/config.js';
import { registerAuditTool } from '../../src/mcp/tools/audit.js';

// ─── Mock Server ────────────────────────────────────────────────────

type ToolHandler = (args: Record<string, unknown>) => Promise<{
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}>;

interface MockServer {
  tools: Map<string, { config: Record<string, unknown>; handler: ToolHandler }>;
  registerTool: (name: string, config: Record<string, unknown>, handler: ToolHandler) => void;
}

function createMockServer(): MockServer {
  const tools = new Map<string, { config: Record<string, unknown>; handler: ToolHandler }>();
  return {
    tools,
    registerTool(name, config, handler) {
      tools.set(name, { config, handler });
    },
  };
}

function parseResult(result: { content: Array<{ type: string; text: string }> }) {
  return JSON.parse(result.content[0]!.text);
}

const PASS_GATE = {
  tsc: { status: 'PASS', errors: [] },
  vitest: { status: 'PASS', delta: { files: 0, pass: 5, fail: 0, skipped: 0 } },
  honesty: { violations: 0, flaggedTasks: [] },
  observability: { metricsJsonlExists: true, lineCount: 20 },
  overallGate: 'PASS',
};

// ─── Tests ──────────────────────────────────────────────────────────

describe('deckent_audit MCP — action expansion (269-004)', () => {
  let server: MockServer;
  let handler: ToolHandler;

  beforeEach(() => {
    vi.clearAllMocks();
    server = createMockServer();
    registerAuditTool(server as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);
    handler = server.tools.get('deckent_audit')!.handler;
  });

  // ── gate (default — back-compat) ──────────────────────────────────

  it('defaults to action="gate" when action is omitted (back-compat)', async () => {
    mockRunSelfAuditGate.mockResolvedValue(PASS_GATE);

    const result = await handler({ sprintId: 'sprint-150' });
    const parsed = parseResult(result);

    expect(mockRunSelfAuditGate).toHaveBeenCalledWith('sprint-150', expect.any(String));
    expect(parsed.overallGate).toBe('PASS');
    expect(result.isError).toBeUndefined();
    // no other runner is touched
    expect(vi.mocked(queryAudit)).not.toHaveBeenCalled();
    expect(vi.mocked(runComplianceReport)).not.toHaveBeenCalled();
    expect(vi.mocked(runAuditRetention)).not.toHaveBeenCalled();
  });

  it('explicit action="gate" runs the Self-Audit Gate', async () => {
    mockRunSelfAuditGate.mockResolvedValue(PASS_GATE);

    const result = await handler({ sprintId: 'sprint-269', action: 'gate' });
    const parsed = parseResult(result);

    expect(mockRunSelfAuditGate).toHaveBeenCalledWith('sprint-269', expect.any(String));
    expect(parsed.tsc).toBe('PASS');
  });

  it('action="gate" without sprintId returns an error (required)', async () => {
    const result = await handler({ action: 'gate' });

    expect(result.isError).toBe(true);
    expect(parseResult(result).message).toContain('sprintId');
    expect(mockRunSelfAuditGate).not.toHaveBeenCalled();
  });

  // ── query ──────────────────────────────────────────────────────────

  it('action="query" calls queryAudit with channel/tenant filters (CLI parity)', async () => {
    vi.mocked(queryAudit).mockReturnValue({
      sprintId: 'sprint-200',
      totalScanned: 9,
      matched: [{ timestamp: 't1', sequence: 1, channel: 'audit:rbac', source: 'a', target: 'b' }],
    } as never);

    const result = await handler({ action: 'query', sprintId: 'sprint-200', channel: 'audit:rbac', tenant: 'acme' });
    const parsed = parseResult(result);

    expect(vi.mocked(queryAudit)).toHaveBeenCalledWith(
      expect.any(String),
      'sprint-200',
      { tenantId: 'acme', channel: 'audit:rbac' },
    );
    expect(parsed.action).toBe('query');
    expect(parsed.totalScanned).toBe(9);
    expect(parsed.matchedCount).toBe(1);
    expect(mockRunSelfAuditGate).not.toHaveBeenCalled();
  });

  it('action="query" defaults sprint to "sprint-001" and applies the limit slice', async () => {
    vi.mocked(queryAudit).mockReturnValue({
      sprintId: 'sprint-001',
      totalScanned: 5,
      matched: [
        { timestamp: 't1', sequence: 1, channel: 'c', source: 's', target: 'x' },
        { timestamp: 't2', sequence: 2, channel: 'c', source: 's', target: 'x' },
        { timestamp: 't3', sequence: 3, channel: 'c', source: 's', target: 'x' },
      ],
    } as never);

    const result = await handler({ action: 'query', limit: 2 });
    const parsed = parseResult(result);

    expect(vi.mocked(queryAudit)).toHaveBeenCalledWith(expect.any(String), 'sprint-001', { tenantId: undefined, channel: undefined });
    expect(parsed.matchedCount).toBe(2);
    expect(parsed.matched).toHaveLength(2);
  });

  // ── compliance ─────────────────────────────────────────────────────

  it('action="compliance" calls runComplianceReport with config-derived flags (SSOT)', async () => {
    vi.mocked(loadConfig).mockResolvedValue({
      autonomous: { rbac_policy: { enabled: true } },
      strict_tenant_isolation: true,
    } as never);
    vi.mocked(runComplianceReport).mockReturnValue({
      eventCount: 4,
      controls: { auditChainIntact: 'PASS', rbacEnforcement: 'PASS', tenantIsolation: 'PASS' },
      auditChainIntegrity: { intact: true },
      actorBreakdown: { brain: 4 },
    } as never);

    const result = await handler({ action: 'compliance', sprintId: 'sprint-210' });
    const parsed = parseResult(result);

    expect(vi.mocked(runComplianceReport)).toHaveBeenCalledWith(
      expect.any(String),
      'sprint-210',
      { rbacEnabled: true, tenantIsolation: true },
    );
    expect(parsed.action).toBe('compliance');
    expect(parsed.report.eventCount).toBe(4);
  });

  it('action="compliance" defaults flags to false when config has none', async () => {
    vi.mocked(loadConfig).mockResolvedValue({} as never);
    vi.mocked(runComplianceReport).mockReturnValue({ eventCount: 0 } as never);

    await handler({ action: 'compliance' });

    expect(vi.mocked(runComplianceReport)).toHaveBeenCalledWith(
      expect.any(String),
      'sprint-001',
      { rbacEnabled: false, tenantIsolation: false },
    );
  });

  // ── retention ──────────────────────────────────────────────────────

  it('action="retention" is a dry-run by default (apply=false) with CLI policy mapping', async () => {
    vi.mocked(runAuditRetention).mockReturnValue({
      sprintId: 'sprint-220', scanned: 10, keep: 7, archive: 2, prune: 1, applied: false,
    } as never);

    const result = await handler({ action: 'retention', sprintId: 'sprint-220', keepDays: 30, keepCount: 7 });
    const parsed = parseResult(result);

    expect(vi.mocked(runAuditRetention)).toHaveBeenCalledWith(
      expect.any(String),
      'sprint-220',
      { maxAgeMs: 30 * 86_400_000, maxCount: 7 },
      false, // dry-run default — ZERO writes
    );
    expect(parsed.applied).toBe(false);
    expect(parsed.prune).toBe(1);
  });

  it('action="retention" with apply=true forwards the destructive apply flag', async () => {
    vi.mocked(runAuditRetention).mockReturnValue({
      sprintId: 'sprint-220', scanned: 10, keep: 7, archive: 2, prune: 1, applied: true,
    } as never);

    const result = await handler({ action: 'retention', sprintId: 'sprint-220', keepCount: 7, apply: true });
    const parsed = parseResult(result);

    expect(vi.mocked(runAuditRetention)).toHaveBeenCalledWith(
      expect.any(String),
      'sprint-220',
      { maxCount: 7 },
      true,
    );
    expect(parsed.applied).toBe(true);
  });

  it('action="retention" rejects invalid keepDays/keepCount without calling the runner (CLI validation parity)', async () => {
    const negDays = await handler({ action: 'retention', keepDays: -1 });
    expect(negDays.isError).toBe(true);
    expect(parseResult(negDays).message).toContain('keepDays');

    const fracCount = await handler({ action: 'retention', keepCount: 1.5 });
    expect(fracCount.isError).toBe(true);
    expect(parseResult(fracCount).message).toContain('keepCount');

    expect(vi.mocked(runAuditRetention)).not.toHaveBeenCalled();
  });

  // ── surface contracts ──────────────────────────────────────────────

  it('rejects an unknown action with an error (zod bypass guard)', async () => {
    const result = await handler({ action: 'forward', sprintId: 'sprint-001' });

    expect(result.isError).toBe(true);
    expect(parseResult(result).message).toContain('Unknown action');
    // forward is intentionally NOT exposed over MCP (network egress)
    expect(mockRunSelfAuditGate).not.toHaveBeenCalled();
  });

  it('declares apply as DESTRUCTIVE in the tool description and exposes the action schema', () => {
    const tool = server.tools.get('deckent_audit')!;
    expect(String(tool.config['description'])).toContain('DESTRUCTIVE');
    const schema = tool.config['inputSchema'] as { shape: Record<string, unknown> };
    expect(Object.keys(schema.shape)).toEqual(
      expect.arrayContaining(['action', 'channel', 'tenant', 'limit', 'keepDays', 'keepCount', 'apply']),
    );
  });
});
