/**
 * B-MCPCATALOG-SSOT — MCP tool-catalog single-source-of-truth guard.
 *
 * `src/mcp/tools/index.ts` exposes the CANONICAL `TOOL_CATALOG` (+ `MCP_TOOL_COUNT`).
 * Consumers that list/count tools (e.g. `deckent_help`) must derive from it instead
 * of keeping their own copy. Before this change, help.ts hand-maintained a 23-entry
 * list while 35 tools were actually registered — silent drift.
 *
 * These tests lock the chain:
 *   TOOL_CATALOG  ===  what registerTools() actually registers   (names + readOnly + count)
 *   deckent_help output  ===  TOOL_CATALOG                        (consumer re-derives)
 *   server.ts ## Tools (N) list  ===  TOOL_CATALOG                (3rd source, lint-mirrored)
 *
 * The "previously-missing 12" test is the faithful regression: with the OLD
 * 23-entry help.ts it is RED (those tools are absent); with help.ts deriving from
 * the catalog it is GREEN.
 */
import { describe, it, expect, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { readFile } from 'node:fs/promises';
import {
  registerTools,
  TOOL_CATALOG,
  MCP_TOOL_COUNT,
} from '../../../src/mcp/tools/index.js';

// node:fs is mocked so the deckent_help handler's project-state detection is
// hermetic (no reads of gitignored .deckent/config.json etc.) and deterministic.
vi.mock('node:fs', () => ({
  existsSync: vi.fn().mockReturnValue(false),
  readFileSync: vi.fn().mockReturnValue(''),
  readdirSync: vi.fn().mockReturnValue([]),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  unlinkSync: vi.fn(),
}));

type ToolHandler = (
  args: Record<string, unknown>,
) => Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }>;

interface ToolConfig {
  annotations?: { readOnlyHint?: boolean };
}

interface Capture {
  names: string[];
  readOnly: Map<string, boolean | undefined>;
  handlers: Map<string, ToolHandler>;
}

/** Register every tool against a stub, capturing names, read-only hints, handlers. */
function captureRegistrations(): Capture {
  const names: string[] = [];
  const readOnly = new Map<string, boolean | undefined>();
  const handlers = new Map<string, ToolHandler>();
  const stub = {
    registerTool: (name: string, config: ToolConfig, handler: ToolHandler) => {
      names.push(name);
      readOnly.set(name, config?.annotations?.readOnlyHint);
      handlers.set(name, handler);
      return {};
    },
  } as unknown as McpServer;
  registerTools(stub);
  return { names, readOnly, handlers };
}

function parseTools(result: { content: Array<{ type: string; text: string }> }): Array<{
  name: string;
  description: string;
  readOnly: boolean;
}> {
  const data = JSON.parse(result.content[0]!.text) as {
    tools: Array<{ name: string; description: string; readOnly: boolean }>;
  };
  return data.tools;
}

// Tools that the OLD hand-maintained help.ts list (23 entries) was missing.
// Their presence in deckent_help output is the faithful regression signal.
const PREVIOUSLY_MISSING = [
  'deckent_watch',
  'deckent_nervous_subscribe',
  'deckent_nervous_accept',
  'deckent_nervous_reject',
  'deckent_nervous_status',
  'deckent_nervous_config',
  'deckent_feature_query',
  'deckent_audit',
  'deckent_recover',
  'deckent_autonomous',
  'deckent_process',
  'deckent_usage',
] as const;

describe('MCP tool catalog SSOT (index.ts)', () => {
  describe('catalog ↔ registration (divergence guard)', () => {
    it('TOOL_CATALOG names match exactly the registered tool names — no missing, no extra', () => {
      const { names } = captureRegistrations();
      const catalogNames = TOOL_CATALOG.map((t) => t.name);
      const catalogSet = new Set(catalogNames);
      const registeredSet = new Set(names);

      const missingFromCatalog = names.filter((n) => !catalogSet.has(n));
      const extraInCatalog = catalogNames.filter((n) => !registeredSet.has(n));

      expect(missingFromCatalog).toEqual([]);
      expect(extraInCatalog).toEqual([]);
    });

    it('MCP_TOOL_COUNT, TOOL_CATALOG.length and registered count are all equal (48)', () => {
      const { names } = captureRegistrations();
      expect(TOOL_CATALOG.length).toBe(48);
      expect(MCP_TOOL_COUNT).toBe(TOOL_CATALOG.length);
      expect(names.length).toBe(MCP_TOOL_COUNT);
    });

    it('catalog has no duplicate tool names', () => {
      const names = TOOL_CATALOG.map((t) => t.name);
      expect(new Set(names).size).toBe(names.length);
    });

    it('each catalog read-only flag matches the registered readOnlyHint annotation', () => {
      const { readOnly } = captureRegistrations();
      for (const entry of TOOL_CATALOG) {
        expect(readOnly.get(entry.name), `readOnly mismatch for ${entry.name}`).toBe(entry.readOnly);
      }
    });

    it('every catalog entry carries a non-empty description', () => {
      for (const entry of TOOL_CATALOG) {
        expect(entry.description.length, `empty description for ${entry.name}`).toBeGreaterThan(0);
      }
    });
  });

  describe('deckent_help re-derives from the single source', () => {
    it('help output tool list equals TOOL_CATALOG (faithful — single-source change flows to the consumer)', async () => {
      const { handlers } = captureRegistrations();
      const helpHandler = handlers.get('deckent_help');
      expect(helpHandler).toBeDefined();

      const result = await helpHandler!({});
      const tools = parseTools(result);

      // Same content as the canonical catalog — proves help does not keep its own copy.
      expect(tools).toEqual(TOOL_CATALOG);
      expect(tools.length).toBe(MCP_TOOL_COUNT);
    });

    it('help output includes all 12 tools the old 23-entry list was missing (drift regression)', async () => {
      const { handlers } = captureRegistrations();
      const result = await handlers.get('deckent_help')!({});
      const names = new Set(parseTools(result).map((t) => t.name));

      for (const name of PREVIOUSLY_MISSING) {
        expect(names.has(name), `deckent_help missing ${name}`).toBe(true);
      }
      // Old drift was 23; the single source now guarantees 48.
      expect(names.size).toBe(48);
    });
  });

  describe('server.ts DECKENT_MCP_INSTRUCTIONS mirrors the single source (third-source drift guard)', () => {
    // The MCP server's human-readable instructions embed a `## Tools (N)` list — the
    // third historical catalog source (alongside registration and help.ts). It carries
    // prose descriptions so it cannot re-derive from TOOL_CATALOG at runtime;
    // scripts/lint-mcp-instructions.mjs guards it as a standalone lint. These tests
    // mirror that guard INSIDE the vitest suite, so a plain `vitest run` (not just the
    // separate lint step) catches server.ts drift — proving the single-source count and
    // name set flow to EVERY consumer, not only help.ts.
    //
    // Read via node:fs/promises (NOT the vi.mock('node:fs') above — a distinct module
    // specifier, left real) and resolve relative to import.meta.url so it is hermetic:
    // server.ts is a committed source file, never gitignored local state.
    async function readServerInstructions(): Promise<{ declaredCount: number; tools: string[] }> {
      const serverUrl = new URL('../../../src/mcp/server.ts', import.meta.url);
      const source = await readFile(serverUrl, 'utf-8');
      const header = source.match(/## Tools \((\d+)\)/);
      if (!header) throw new Error('server.ts: "## Tools (N)" header not found');
      const declaredCount = Number(header[1]);
      const tools: string[] = [];
      const linePattern = /^- (deckent_[a-z_]+):/gm;
      let m: RegExpExecArray | null;
      while ((m = linePattern.exec(source)) !== null) tools.push(m[1]!);
      return { declaredCount, tools };
    }

    it('## Tools (N) header count equals MCP_TOOL_COUNT (single source of the count)', async () => {
      const { declaredCount } = await readServerInstructions();
      expect(declaredCount).toBe(MCP_TOOL_COUNT);
    });

    it('instruction tool names match TOOL_CATALOG exactly — no missing, no extra (drift regression)', async () => {
      const { tools } = await readServerInstructions();
      const catalogNames = new Set(TOOL_CATALOG.map((t) => t.name));
      const instrSet = new Set(tools);

      const missingFromInstructions = [...catalogNames].filter((n) => !instrSet.has(n));
      const extraInInstructions = tools.filter((n) => !catalogNames.has(n));

      expect(missingFromInstructions).toEqual([]);
      expect(extraInInstructions).toEqual([]);
      expect(tools.length).toBe(MCP_TOOL_COUNT);
    });
  });
});
