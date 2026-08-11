/**
 * MCP annotation ↔ implementation parity gate (row 490, sprint-509).
 *
 * Row 490 measured three wrong hints on a single security-critical tool: `deckent_audit`
 * declared `readOnlyHint: true, destructiveHint: false, idempotentHint: true` while its
 * gate path calls `writeFileSync` and `action="retention"` with `apply=true` permanently
 * prunes audit events. `deckent_models` was the second mismatch (`action="refresh"` does a
 * remote fetch plus a cache rewrite). MCP clients use `readOnlyHint` to decide whether to
 * skip an approval prompt, so an understated hint is a security defect.
 *
 * The contract this gate enforces (typed decision — WIDEST SIDE EFFECT):
 *   a tool that CAN mutate declares the mutating class, judged by the widest effect any
 *   of its actions can produce, never by its default action.
 *
 * It fails CLOSED:
 *   - a registered tool with no catalog entry cannot be registered at all;
 *   - a tool module that calls a mutating primitive may not expose only read-only tools;
 *   - a module literal may never claim a *narrower* effect than the catalog declares...
 *     it may only be equal or narrower-than-enforced (the catalog always wins at the
 *     registration ingress), and it may never be WIDER than the catalog, which would mean
 *     the catalog understates the tool.
 *
 * This extends (never replaces) the existing guard suites:
 * tests/mcp/tool-annotations.test.ts and tests/mcp/tools/annotations.test.ts.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  registerTools,
  withCatalogAnnotations,
  TOOL_CATALOG,
  TOOL_REGISTRARS,
  MCP_TOOL_COUNT,
  type McpToolAnnotationHints,
  type McpToolSideEffectClass,
} from '../../src/mcp/tools/index.js';

const TOOLS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'mcp', 'tools');

type CapturedAnnotations = Partial<McpToolAnnotationHints> & Record<string, unknown>;

interface Captured {
  order: string[];
  annotations: Map<string, CapturedAnnotations | undefined>;
  configs: Map<string, Record<string, unknown>>;
}

/** Register through a stub server, capturing the annotations each tool declares. */
function capture(register: (server: McpServer) => void): Captured {
  const order: string[] = [];
  const annotations = new Map<string, CapturedAnnotations | undefined>();
  const configs = new Map<string, Record<string, unknown>>();
  const stub = {
    registerTool: (name: string, config: Record<string, unknown>) => {
      order.push(name);
      annotations.set(name, config?.['annotations'] as CapturedAnnotations | undefined);
      configs.set(name, config);
      return {};
    },
  } as unknown as McpServer;
  register(stub);
  return { order, annotations, configs };
}

/** What clients actually receive — the full registerTools() path. */
const effective = capture((server) => registerTools(server));

/** What each tool module declares on its own, without the catalog enforcement layer. */
const moduleLiterals = TOOL_REGISTRARS.map((registrar) => ({
  module: registrar.module,
  captured: capture((server) => registrar.register(server, {})),
}));

const catalogByName = new Map(TOOL_CATALOG.map((entry) => [entry.name, entry]));

/** Ordering of side-effect classes, widest last. */
const CLASS_WIDTH: Record<McpToolSideEffectClass, number> = {
  'read-only': 0,
  mutating: 1,
  destructive: 2,
};

function classOf(hints: CapturedAnnotations | undefined): McpToolSideEffectClass {
  if (hints?.destructiveHint === true) return 'destructive';
  if (hints?.readOnlyHint === true) return 'read-only';
  return 'mutating';
}

/**
 * Mutating primitives. A module that calls one of these can change host state, so at
 * least one tool it registers must declare a non-read-only class.
 */
const MUTATION_SIGNALS: ReadonlyArray<{ label: string; pattern: RegExp }> = [
  { label: 'writeFileSync', pattern: /\bwriteFileSync\s*\(/ },
  { label: 'atomicWriteFileSync', pattern: /\batomicWriteFileSync\s*\(/ },
  { label: 'appendFileSync', pattern: /\bappendFileSync\s*\(/ },
  { label: 'writeFile', pattern: /\bwriteFile\s*\(/ },
  { label: 'mkdirSync', pattern: /\bmkdirSync\s*\(/ },
  { label: 'rmSync', pattern: /\brmSync\s*\(/ },
  { label: 'rmdirSync', pattern: /\brmdirSync\s*\(/ },
  { label: 'unlinkSync', pattern: /\bunlinkSync\s*\(/ },
  { label: 'renameSync', pattern: /\brenameSync\s*\(/ },
  { label: 'copyFileSync', pattern: /\bcopyFileSync\s*\(/ },
  { label: 'execSync', pattern: /\bexecSync\s*\(/ },
  { label: 'execFileSync', pattern: /\bexecFileSync\s*\(/ },
  { label: 'spawnSync', pattern: /\bspawnSync\s*\(/ },
  { label: 'spawn', pattern: /\bspawn\s*\(/ },
  { label: 'fetch', pattern: /\bfetch\s*\(/ },
  { label: 'forceRefresh (remote refresh + cache rewrite)', pattern: /\bforceRefresh:\s*true/ },
];

/** Drop comments and string/template literals so prose cannot trip (or hide) a signal. */
function stripNonCode(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/gm, '$1 ')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/g, '``');
}

function mutationSignals(module: string): string[] {
  const code = stripNonCode(readFileSync(join(TOOLS_DIR, module), 'utf-8'));
  return MUTATION_SIGNALS.filter(({ pattern }) => pattern.test(code)).map(({ label }) => label);
}

describe('MCP annotation parity — catalog ↔ registration (row 490)', () => {
  it('every registered tool has a catalog entry and every catalog entry is registered', () => {
    const registered = new Set(effective.order);
    const cataloged = new Set(catalogByName.keys());

    expect([...registered].filter((name) => !cataloged.has(name))).toEqual([]);
    expect([...cataloged].filter((name) => !registered.has(name))).toEqual([]);
    expect(effective.order).toHaveLength(MCP_TOOL_COUNT);
  });

  it('registering a tool that is not in the catalog fails closed', () => {
    const stub = { registerTool: () => ({}) } as unknown as McpServer;
    expect(() =>
      withCatalogAnnotations(stub).registerTool(
        'deckent_not_in_catalog' as never,
        {} as never,
        (() => ({ content: [] })) as never,
      ),
    ).toThrow(/missing from TOOL_CATALOG/);
  });

  it('the annotations clients receive are exactly the catalog annotations', () => {
    for (const entry of TOOL_CATALOG) {
      const declared = effective.annotations.get(entry.name);
      expect(declared, `no annotations declared for ${entry.name}`).toBeDefined();
      expect(
        {
          readOnlyHint: declared!.readOnlyHint,
          destructiveHint: declared!.destructiveHint,
          idempotentHint: declared!.idempotentHint,
        },
        `annotation drift for ${entry.name}`,
      ).toEqual(entry.annotations);
    }
  });

  it('catalog hints are internally consistent with the declared side-effect class', () => {
    for (const entry of TOOL_CATALOG) {
      expect(entry.readOnly, `readOnly mirror drift for ${entry.name}`).toBe(
        entry.annotations.readOnlyHint,
      );
      expect(entry.annotations.readOnlyHint, `readOnlyHint class drift for ${entry.name}`).toBe(
        entry.sideEffect === 'read-only',
      );
      expect(entry.annotations.destructiveHint, `destructiveHint class drift for ${entry.name}`).toBe(
        entry.sideEffect === 'destructive',
      );
      if (entry.sideEffect === 'read-only') {
        expect(entry.annotations.destructiveHint, `${entry.name} is read-only AND destructive`).toBe(false);
        expect(entry.annotations.idempotentHint, `${entry.name} is read-only but not idempotent`).toBe(true);
      } else {
        expect(entry.annotations.readOnlyHint, `${entry.name} mutates but claims read-only`).toBe(false);
      }
    }
  });
});

describe('MCP annotation parity — implementation evidence (row 490)', () => {
  it('every tool module declares a complete boolean annotation triple', () => {
    for (const { module, captured } of moduleLiterals) {
      for (const name of captured.order) {
        const hints = captured.annotations.get(name);
        expect(typeof hints?.readOnlyHint, `${module}: ${name} readOnlyHint`).toBe('boolean');
        expect(typeof hints?.destructiveHint, `${module}: ${name} destructiveHint`).toBe('boolean');
        expect(typeof hints?.idempotentHint, `${module}: ${name} idempotentHint`).toBe('boolean');
      }
    }
  });

  it('no tool module claims a WIDER effect than its catalog entry (catalog may not understate)', () => {
    for (const { module, captured } of moduleLiterals) {
      for (const name of captured.order) {
        const entry = catalogByName.get(name);
        expect(entry, `${module} registers uncataloged ${name}`).toBeDefined();
        const literalClass = classOf(captured.annotations.get(name));
        expect(
          CLASS_WIDTH[literalClass] <= CLASS_WIDTH[entry!.sideEffect],
          `${module}: ${name} declares "${literalClass}" but the catalog only declares "${entry!.sideEffect}"`,
        ).toBe(true);
      }
    }
  });

  it('a module that calls a mutating primitive cannot expose only read-only tools', () => {
    for (const { module, captured } of moduleLiterals) {
      const signals = mutationSignals(module);
      if (signals.length === 0) continue;
      const classes = captured.order.map((name) => catalogByName.get(name)!.sideEffect);
      expect(
        classes.some((sideEffect) => sideEffect !== 'read-only'),
        `${module} calls [${signals.join(', ')}] but every tool it registers (${captured.order.join(', ')}) is declared read-only`,
      ).toBe(true);
    }
  });

  it('a single-tool module that calls a mutating primitive declares that tool non-read-only', () => {
    for (const { module, captured } of moduleLiterals) {
      if (captured.order.length !== 1) continue;
      const signals = mutationSignals(module);
      if (signals.length === 0) continue;
      const name = captured.order[0]!;
      expect(
        catalogByName.get(name)!.sideEffect,
        `${module} calls [${signals.join(', ')}] — ${name} cannot be read-only`,
      ).not.toBe('read-only');
    }
  });
});

describe('MCP annotation parity — row 490 regressions', () => {
  it('deckent_audit is destructive: it writes the gate file and can permanently prune audit events', () => {
    expect(catalogByName.get('deckent_audit')!.sideEffect).toBe('destructive');
    expect(effective.annotations.get('deckent_audit')).toMatchObject({
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
    });
    // The module literal itself is fixed too — not "fixed by documentation".
    const literal = moduleLiterals.find((m) => m.module === 'audit.ts')!.captured.annotations.get('deckent_audit');
    expect(literal).toMatchObject({ readOnlyHint: false, destructiveHint: true, idempotentHint: false });
  });

  it('deckent_models is not read-only: action="refresh" fetches remotely and rewrites the cache', () => {
    expect(catalogByName.get('deckent_models')!.sideEffect).not.toBe('read-only');
    expect(effective.annotations.get('deckent_models')).toMatchObject({
      readOnlyHint: false,
      destructiveHint: false,
    });
  });

  it('the catalog overrides a stale module literal without touching behaviour', () => {
    const captured = capture((server) => {
      const handler = () => ({ content: [] });
      withCatalogAnnotations(server).registerTool(
        'deckent_audit' as never,
        {
          title: 'Sprint Audit',
          description: 'stale copy',
          inputSchema: { marker: true },
          annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
        } as never,
        handler as never,
      );
    });

    expect(captured.annotations.get('deckent_audit')).toMatchObject({
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      // Hints outside the side-effect triple survive (e.g. deckent_watch's openWorldHint).
      openWorldHint: false,
    });
    const config = captured.configs.get('deckent_audit')!;
    expect(config['title']).toBe('Sprint Audit');
    expect(config['description']).toBe('stale copy');
    expect(config['inputSchema']).toEqual({ marker: true });
  });
});
