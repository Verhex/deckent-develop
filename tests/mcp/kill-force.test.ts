/**
 * MCP deckent_kill — force / userExplicit parity tests (Sprint 189 T-009)
 *
 * Verifies that the MCP kill tool:
 *   - Exposes force + userExplicit in its inputSchema (CLI parity with
 *     cli/commands/kill.ts:306-307 `--force` / `--user-explicit` options).
 *   - Emits a `mcp:kill:panic-bypass` debug breadcrumb when both flags are
 *     true (audit-trail per feedback_sprint_kill_always_ask_user — kill
 *     itself still proceeds; the override is logged, never silent).
 *   - Emits a `mcp:kill:panic-bypass-partial` breadcrumb when only one
 *     flag is set (helps callers spot a missing pair member).
 *   - Surfaces `bypassRequested` in the response payload so dashboards
 *     and downstream MCP clients can render the override state.
 *   - Default (no force/userExplicit) leaves the prior behavior intact —
 *     no panic-bypass breadcrumb fires, response has bypassRequested=false.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ──────────────────────────────────────────────────────────

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    existsSync: vi.fn(),
    readdirSync: vi.fn(),
    unlinkSync: vi.fn(),
  };
});

vi.mock('../../src/core/utils.js', () => ({
  debugLog: vi.fn(),
}));

vi.mock('../../src/core/file-lock.js', () => ({
  releaseAllLocks: vi.fn(() => 0),
  releaseAllSpawnLocks: vi.fn(() => 0),
}));

vi.mock('../../src/mcp/helpers/enrich.js', () => ({
  enrichResponse: vi.fn((_toolName, response) => ({ ...response })),
}));

import { readFileSync, existsSync, readdirSync, unlinkSync } from 'node:fs';
import { debugLog } from '../../src/core/utils.js';
import {
  releaseAllLocks,
  releaseAllSpawnLocks,
} from '../../src/core/file-lock.js';

// ─── Test Server Harness ───────────────────────────────────────────

type ToolHandler = (
  args: Record<string, unknown>,
) => Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }>;

interface MockServer {
  tools: Map<string, { config: { inputSchema: unknown }; handler: ToolHandler }>;
  registerTool: (name: string, config: { inputSchema: unknown }, handler: ToolHandler) => void;
}

function createMockServer(): MockServer {
  const tools = new Map<string, { config: { inputSchema: unknown }; handler: ToolHandler }>();
  return {
    tools,
    registerTool(name, config, handler) {
      tools.set(name, { config, handler });
    },
  };
}

async function getKillTool() {
  const { registerKillTool } = await import('../../src/mcp/tools/kill.js');
  const server = createMockServer();
  registerKillTool(server as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);
  const tool = server.tools.get('deckent_kill');
  expect(tool).toBeDefined();
  return tool!;
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('deckent_kill — force/userExplicit parity (Sprint 189 T-009)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default FS surface: no tasks dir, no locks dir — kill becomes a no-op
    // and we get to observe the panic-bypass breadcrumb in isolation.
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(readdirSync).mockReturnValue([] as unknown as ReturnType<typeof readdirSync>);
    vi.mocked(readFileSync).mockReturnValue('{}' as unknown as ReturnType<typeof readFileSync>);
  });

  describe('schema parity (force / userExplicit)', () => {
    it('inputSchema exposes force as an optional boolean (CLI parity)', async () => {
      const tool = await getKillTool();
      const shape = (tool.config.inputSchema as unknown as { shape?: Record<string, unknown> }).shape ?? {};
      expect(Object.keys(shape)).toContain('force');
    });

    it('inputSchema exposes userExplicit as an optional boolean (CLI parity)', async () => {
      const tool = await getKillTool();
      const shape = (tool.config.inputSchema as unknown as { shape?: Record<string, unknown> }).shape ?? {};
      expect(Object.keys(shape)).toContain('userExplicit');
    });

    it('inputSchema still exposes taskId and all (no regression)', async () => {
      const tool = await getKillTool();
      const shape = (tool.config.inputSchema as unknown as { shape?: Record<string, unknown> }).shape ?? {};
      const keys = Object.keys(shape);
      expect(keys).toContain('taskId');
      expect(keys).toContain('all');
    });
  });

  describe('panic-bypass breadcrumb (both flags true)', () => {
    it('emits mcp:kill:panic-bypass debug breadcrumb when force+userExplicit are both true', async () => {
      const tool = await getKillTool();
      await tool.handler({ taskId: '059-001', force: true, userExplicit: true });

      const calls = vi.mocked(debugLog).mock.calls;
      const bypassCalls = calls.filter(([ctx]) => ctx === 'mcp:kill:panic-bypass');
      expect(bypassCalls.length).toBe(1);
      const payload = bypassCalls[0]![1] as { taskId: string | null; all: boolean; warn: string };
      expect(payload.taskId).toBe('059-001');
      expect(payload.all).toBe(false);
      expect(payload.warn).toContain('feedback_sprint_kill_always_ask_user');
    });

    it('includes all=true in the breadcrumb when kill-all is requested with bypass', async () => {
      const tool = await getKillTool();
      await tool.handler({ all: true, force: true, userExplicit: true });

      const calls = vi.mocked(debugLog).mock.calls;
      const bypassCalls = calls.filter(([ctx]) => ctx === 'mcp:kill:panic-bypass');
      expect(bypassCalls.length).toBe(1);
      const payload = bypassCalls[0]![1] as { taskId: string | null; all: boolean };
      expect(payload.taskId).toBe(null);
      expect(payload.all).toBe(true);
    });

    it('surfaces bypassRequested=true in the response payload (single taskId)', async () => {
      const tool = await getKillTool();
      const result = await tool.handler({ taskId: '059-001', force: true, userExplicit: true });
      const parsed = JSON.parse(result.content[0]!.text);
      expect(parsed.bypassRequested).toBe(true);
    });

    it('surfaces bypassRequested=true in the response payload (all=true)', async () => {
      const tool = await getKillTool();
      const result = await tool.handler({ all: true, force: true, userExplicit: true });
      const parsed = JSON.parse(result.content[0]!.text);
      expect(parsed.bypassRequested).toBe(true);
      expect(parsed.all).toBe(true);
    });
  });

  describe('partial-flag breadcrumb (only one of force/userExplicit)', () => {
    it('emits mcp:kill:panic-bypass-partial when only force is set', async () => {
      const tool = await getKillTool();
      await tool.handler({ taskId: '059-001', force: true });

      const calls = vi.mocked(debugLog).mock.calls;
      const partialCalls = calls.filter(([ctx]) => ctx === 'mcp:kill:panic-bypass-partial');
      expect(partialCalls.length).toBe(1);
      const payload = partialCalls[0]![1] as { force: boolean; userExplicit: boolean };
      expect(payload.force).toBe(true);
      expect(payload.userExplicit).toBe(false);
    });

    it('emits mcp:kill:panic-bypass-partial when only userExplicit is set', async () => {
      const tool = await getKillTool();
      await tool.handler({ taskId: '059-001', userExplicit: true });

      const calls = vi.mocked(debugLog).mock.calls;
      const partialCalls = calls.filter(([ctx]) => ctx === 'mcp:kill:panic-bypass-partial');
      expect(partialCalls.length).toBe(1);
      const payload = partialCalls[0]![1] as { force: boolean; userExplicit: boolean };
      expect(payload.force).toBe(false);
      expect(payload.userExplicit).toBe(true);
    });

    it('does not emit panic-bypass (full) breadcrumb when only one flag is set', async () => {
      const tool = await getKillTool();
      await tool.handler({ taskId: '059-001', force: true });

      const calls = vi.mocked(debugLog).mock.calls;
      const fullBypass = calls.filter(([ctx]) => ctx === 'mcp:kill:panic-bypass');
      expect(fullBypass.length).toBe(0);
    });

    it('partial-flag responses still carry bypassRequested=false (kill proceeds, override not granted)', async () => {
      const tool = await getKillTool();
      const result = await tool.handler({ taskId: '059-001', force: true });
      const parsed = JSON.parse(result.content[0]!.text);
      expect(parsed.bypassRequested).toBe(false);
    });
  });

  describe('default behavior (no force/userExplicit) — no regression', () => {
    it('does not emit any panic-bypass breadcrumb when neither flag is set', async () => {
      const tool = await getKillTool();
      await tool.handler({ taskId: '059-001' });

      const calls = vi.mocked(debugLog).mock.calls;
      const bypassCalls = calls.filter(
        ([ctx]) => ctx === 'mcp:kill:panic-bypass' || ctx === 'mcp:kill:panic-bypass-partial',
      );
      expect(bypassCalls.length).toBe(0);
    });

    it('response payload carries bypassRequested=false by default', async () => {
      const tool = await getKillTool();
      const result = await tool.handler({ taskId: '059-001' });
      const parsed = JSON.parse(result.content[0]!.text);
      expect(parsed.bypassRequested).toBe(false);
    });

    it('still returns an error when neither taskId nor all is provided (no regression)', async () => {
      const tool = await getKillTool();
      const result = await tool.handler({});
      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0]!.text);
      expect(parsed.error).toBe(true);
      expect(parsed.message).toMatch(/taskId.*all/);
    });

    it('releases only legacy namespaces and never scans execution authority projections', async () => {
      const taskId = '059-001';
      vi.mocked(existsSync).mockImplementation(path =>
        String(path).endsWith('.tasks'));
      vi.mocked(readdirSync).mockReturnValue(
        [`task-${taskId}.json`] as unknown as ReturnType<typeof readdirSync>,
      );
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
        id: taskId,
        status: 'EXECUTING',
      }) as unknown as ReturnType<typeof readFileSync>);

      const tool = await getKillTool();
      const result = await tool.handler({ taskId });

      expect(result.isError).not.toBe(true);
      expect(releaseAllLocks).toHaveBeenCalledWith(
        process.cwd(),
        `w-${taskId}`,
      );
      expect(releaseAllSpawnLocks).toHaveBeenCalledWith(
        process.cwd(),
        taskId,
      );
      expect(vi.mocked(readdirSync).mock.calls).not.toEqual(
        expect.arrayContaining([
          [expect.stringContaining('.locks')],
        ]),
      );
      expect(vi.mocked(unlinkSync).mock.calls).not.toEqual(
        expect.arrayContaining([
          [expect.stringContaining('.executionlock')],
        ]),
      );
    });
  });

  describe('feedback_sprint_kill_always_ask_user — kill is not silently elevated', () => {
    it('panic-bypass breadcrumb warning text references feedback_sprint_kill_always_ask_user explicitly', async () => {
      const tool = await getKillTool();
      await tool.handler({ taskId: '059-001', force: true, userExplicit: true });

      const calls = vi.mocked(debugLog).mock.calls;
      const bypass = calls.find(([ctx]) => ctx === 'mcp:kill:panic-bypass');
      expect(bypass).toBeDefined();
      const payload = bypass![1] as { warn: string };
      // The rule string must be present — protects against silent removals
      // of the audit-trail tag in future refactors.
      expect(payload.warn).toContain('feedback_sprint_kill_always_ask_user');
    });
  });
});
