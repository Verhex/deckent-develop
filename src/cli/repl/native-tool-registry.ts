// src/cli/repl/native-tool-registry.ts
// ═══ Native tool registry (SP-1 M3) ═════════════════════════════════════════
// Wraps the REPL's existing tool dispatchers (chat-tool-exec: read/write/edit/
// bash; chat-tool-bridge: deckent_* CLI) as native ToolDefinitions for the
// AgentSession. The dispatchers run with NO internal confirm — the AgentSession
// permission engine + guards are the SINGLE gate (no double-prompt). Legacy tier
// names ('read'|'confirm'|'always') map to the engine's ('silent'|'confirm'|
// 'always'); read→silent. (MCP tool source is a deferred follow-up.)

import { z, type ZodTypeAny } from 'zod';
import { ToolRegistry } from '../../agent/tools/registry.js';
import type { ToolDefinition, ToolPermissionTier, ToolResult } from '../../agent/tools/types.js';
import { createToolExecDispatcher } from '../commands/chat-tool-exec.js';
import { createCliToolDispatcher } from '../commands/chat-tool-bridge.js';
import { classifyTool } from './tool-permissions.js';
import type { McpToolDispatcher } from '../commands/chat-native.js';
import { SkillPoolManager } from '../../core/skill-pool.js';
import { SkillLoadingCache } from '../../core/skill-cache.js';
import {
  ToolRegistry as CoreToolRegistry,
  type ToolCategory as CoreToolCategory,
  type ToolRiskLevel as CoreToolRiskLevel,
} from '../../core/tool-registry.js';
import { ToolSearchIndex } from '../../core/tool-search.js';
import { summarizeEagerSchema, deferredIndexLine } from '../../core/tool-core.js';
import {
  dispatchToolCall,
  DEFAULT_RISK_THRESHOLD,
  type ConfirmFn,
  type ExecImplFn,
  type ToolDispatchPlan,
} from '../../core/tool-dispatch.js';

/** Minimal structural shape of the buildMcpBridge return (chat-mcp-bridge.ts). */
export interface NativeMcpBridge {
  listTools(): Array<{ namespacedName: string; descriptor: { description?: string; inputSchema?: Record<string, unknown> } }>;
  dispatch(namespacedName: string, args: Record<string, unknown>, confirmFn: (a: unknown) => Promise<boolean>): Promise<{ ok: boolean; output: string }>;
}

export interface NativeToolRegistryOptions {
  /** Resolved per-call so the REPL's /cd is followed live. */
  cwd: () => string;
  /** Optional connected MCP bridge — its tools register as confirm-tier defs. */
  mcpBridge?: NativeMcpBridge;
  /**
   * Optional skill-dispatch seam (F11). When omitted, the live skill-pool path
   * (`createDefaultSkillDispatcher`) is used. `dispatch(skillId, args)` reuses the
   * established `McpToolDispatcher` contract — tests inject a fake to stay hermetic.
   */
  skillDispatcher?: McpToolDispatcher;
  /**
   * TOOL-REPL-WIRE (354-002) progressive-disclosure bridge — `tool_surface.enabled`,
   * default OFF (undefined/`enabled:false` registers nothing; the rest of this
   * function's output stays byte-identical). When on, registers 3 native meta-tools
   * (`deckent_search_tools` / `deckent_describe_tool` / `deckent_call_tool`) over a
   * catalog bridged from every tool already registered above (core TOOL-1/TOOL-2/
   * TOOL-3 primitives — read-only, never modified here). See
   * `registerToolSurfaceTools` for the plan->risk-gate->confirm->execImpl chain.
   */
  toolSurface?: ToolSurfaceOptions;
}

/**
 * Injection seams for `deckent_call_tool`'s dispatch chain (tool-dispatch.ts).
 * `execImpl` intentionally has NO live-exec default: TOOL-REPL-WIRE's nogo bars
 * real execution (no `handlerRef` resolver exists yet — future cutover work).
 * Omitting it falls back to `NOT_WIRED_EXEC`, which fails closed with a
 * descriptive error rather than silently no-op-succeeding. `confirm` is likewise
 * optional — tool-dispatch.ts already fail-closed-denies a risk-gated call when
 * no confirm fn is supplied, so this seam only needs a real implementation once
 * the approval-card UI (follow-up work) exists.
 */
export interface ToolSurfaceOptions {
  enabled: boolean;
  confirm?: ConfirmFn;
  execImpl?: ExecImplFn;
  riskThreshold?: CoreToolRiskLevel;
}

const LEGACY_TIER: Record<'read' | 'confirm' | 'always', ToolPermissionTier> = {
  read: 'silent',
  confirm: 'confirm',
  always: 'always',
};

// Exec tools that have side-effects — classified as 'confirm' regardless of
// classifyTool result (which doesn't know about these tool names and returns 'read').
const EXEC_SIDE_EFFECTING: ReadonlySet<string> = new Set([
  'deckent_write_file',
  'deckent_edit_file',
  'deckent_bash',
]);

/** A minimal JSON-schema for each tool's args (provider tool_use input_schema). */
const SCHEMAS: Record<string, Record<string, unknown>> = {
  deckent_read_file: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
  deckent_write_file: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] },
  deckent_edit_file: { type: 'object', properties: { path: { type: 'string' }, old: { type: 'string' }, new: { type: 'string' } }, required: ['path', 'old', 'new'] },
  deckent_bash: { type: 'object', properties: { cmd: { type: 'string' } }, required: ['cmd'] },
};

const DESCRIPTIONS: Record<string, string> = {
  deckent_read_file: 'Read a file within the project (returns its content).',
  deckent_write_file: 'Write content to a file within the project.',
  deckent_edit_file: 'Replace a substring in a file within the project.',
  deckent_bash: 'Run a shell command in the project directory.',
};

function toolResultFrom(output: string): ToolResult {
  const ok = !(output.startsWith('[mcp-error]') || output.startsWith('[deckent-denied]'));
  return { ok, output };
}

function execToolTier(name: string): ToolPermissionTier {
  return EXEC_SIDE_EFFECTING.has(name) ? 'confirm' : 'silent';
}

/** An MCP server may report `description: ''` (empty string, not undefined) — `??`
 * only substitutes on null/undefined, so a blank string would flow straight into
 * `registry.register()`, which requires a non-empty (post-trim) description and
 * throws, crashing REPL launch (born-552). Treat blank/whitespace-only the same
 * as missing, mirroring validateToolDefinition's own `trim().length === 0` check. */
function mcpToolDescription(description: string | undefined, namespacedName: string): string {
  const trimmed = (description ?? '').trim();
  return trimmed.length > 0 ? trimmed : `MCP tool ${namespacedName}`;
}

function defineFromDispatcher(
  name: string,
  description: string,
  inputSchema: Record<string, unknown>,
  tier: ToolPermissionTier,
  dispatcher: McpToolDispatcher,
): ToolDefinition {
  return {
    name,
    description,
    inputSchema,
    category: 'coding',
    tier,
    source: 'builtin',
    handler: async (args) => toolResultFrom(await dispatcher.dispatch(name, args)),
  };
}

/**
 * Default skill-dispatch path (F11) — the same loader a worker's skill-injection
 * uses, so the native REPL agent reaches a deckent skill with worker parity. NO
 * re-implementation of skill execution: existence is resolved through the live
 * `SkillPoolManager` (skill-pool) and the guidance body through `SkillLoadingCache`
 * (the SKILL.md content loader). Project root is resolved per-call via `cwd()` so
 * the REPL's /cd is followed live (mirrors the exec dispatcher) — no wiring change
 * is required at the caller. Returns the resolved skill guidance, or a tagged
 * `[mcp-error]` string (→ ok:false via toolResultFrom) for an unknown/empty skill.
 */
function createDefaultSkillDispatcher(cwd: () => string): McpToolDispatcher {
  return {
    async dispatch(skillId, _args) {
      const root = cwd();
      const skill = new SkillPoolManager(root).getSkill(skillId);
      if (!skill) return `[mcp-error] deckent_skill_dispatch: unknown skill: ${skillId}`;
      const cached = new SkillLoadingCache(root).loadAndCache(skillId);
      const guidance = (cached?.content ?? '').trim() || (skill.description ?? '').trim();
      return guidance.length > 0
        ? guidance
        : `[mcp-error] deckent_skill_dispatch: skill has no guidance content: ${skillId}`;
    },
  };
}

// ─── TOOL-REPL-WIRE (354-002) — progressive-disclosure bridge ══════════════
// Bridges the already-registered native tool surface (exec/CLI-bridge/skill/
// MCP — built above) into the 353 core primitives: tool-registry.ts (TOOL-1,
// catalog), tool-search.ts (TOOL-2, search/describe/planCall), tool-core.ts
// (TOOL-CORE, deferred-index), tool-dispatch.ts (TOOL-3, risk-gated dispatch).
// All four are core/, read-only here — this file only *consumes* them to
// register 3 new native meta-tools. No production `handlerRef` resolver
// exists yet, so `deckent_call_tool` never performs real execution unless a
// caller injects `toolSurface.execImpl` (tests do; production wiring of the
// real dispatch + approval-card UI is explicit follow-up work).

/** Best-effort category bridge: agent tools carry an open, free-form category
 * string; TOOL-1's `ToolCategory` is the fixed set tool-search.ts/tool-core.ts
 * were designed around (deckent_* CLI-bridge command groups). Known CLI-bridge
 * names map to their documented group; anything else (exec/skill/mcp tools)
 * falls into the generic 'catalog' bucket rather than fabricating a group. */
const CORE_CATEGORY_BY_NAME: Readonly<Record<string, CoreToolCategory>> = {
  deckent_status: 'monitoring',
  deckent_doctor: 'monitoring',
  deckent_review: 'monitoring',
  deckent_history: 'knowledge',
  deckent_retro: 'knowledge',
  deckent_models: 'catalog',
};

function bridgeCategory(name: string): CoreToolCategory {
  return CORE_CATEGORY_BY_NAME[name] ?? 'catalog';
}

/** Tier -> risk: lines up with tool-dispatch.ts's DEFAULT_RISK_THRESHOLD
 * ('moderate'), so the existing confirm/always-tier tools require a confirm
 * decision through `deckent_call_tool` too, exactly like they already do
 * through the AgentSession's own permission engine for a direct call. */
const BRIDGE_RISK_BY_TIER: Record<ToolPermissionTier, CoreToolRiskLevel> = {
  silent: 'safe',
  confirm: 'moderate',
  always: 'destructive',
};

/** Generic passthrough — the catalog fallback for a bridged tool whose
 * `inputSchema` declares no enumerable top-level fields (e.g. the CLI-bridge
 * tools' intentionally-open `genericSchema`, `{ properties: {} }`). TOOL-1's
 * `paramsSchema` needs *a* ZodTypeAny even when there is nothing to derive. */
const BRIDGE_PARAMS_SCHEMA = z.record(z.string(), z.unknown());

/** Maps one JSON-schema property node (agent ToolDefinition.inputSchema's
 * `properties[name]`) to its zod primitive. Scoped to exactly what
 * `summarizeEagerSchema` (core/tool-core.ts) reads off a field — base type +
 * optionality — never a general-purpose JSON-schema validator. */
function jsonSchemaPropertyToZod(node: unknown): ZodTypeAny {
  if (!node || typeof node !== 'object' || Array.isArray(node)) return z.unknown();
  const prop = node as { type?: unknown; items?: unknown };
  switch (prop.type) {
    case 'string': return z.string();
    case 'number':
    case 'integer': return z.number();
    case 'boolean': return z.boolean();
    case 'array': return z.array(jsonSchemaPropertyToZod(prop.items));
    case 'object': return jsonSchemaObjectToZod(node as Record<string, unknown>);
    default: return z.unknown();
  }
}

/** Best-effort JSON-schema object -> zod object converter (born-521). Every
 * bridged tool already carries a real `inputSchema` (the `SCHEMAS` map above,
 * or a caller-supplied JSON schema for CLI-bridge/skill/MCP tools) — this only
 * translates that EXISTING declaration into a `ZodTypeAny` so `describe_tool`
 * can report real params; it never re-derives or edits a tool's own schema. */
function jsonSchemaObjectToZod(schema: Record<string, unknown>): ZodTypeAny {
  const properties = schema['properties'];
  if (!properties || typeof properties !== 'object' || Array.isArray(properties)) {
    return BRIDGE_PARAMS_SCHEMA;
  }
  const requiredList = schema['required'];
  const required = new Set(
    Array.isArray(requiredList) ? requiredList.filter((r): r is string => typeof r === 'string') : [],
  );
  const shape: Record<string, ZodTypeAny> = {};
  for (const [key, propSchema] of Object.entries(properties as Record<string, unknown>)) {
    const zodType = jsonSchemaPropertyToZod(propSchema);
    shape[key] = required.has(key) ? zodType : zodType.optional();
  }
  if (Object.keys(shape).length === 0) return BRIDGE_PARAMS_SCHEMA;
  return z.object(shape).catchall(z.unknown());
}

/** Top-level entry: a bridged tool's `inputSchema` (JSON schema) -> the
 * catalog's per-tool `paramsSchema`. Only object-typed schemas route through
 * the field-by-field converter; anything else keeps the generic passthrough. */
function bridgeParamsSchema(inputSchema: Record<string, unknown>): ZodTypeAny {
  return inputSchema['type'] === 'object' ? jsonSchemaObjectToZod(inputSchema) : BRIDGE_PARAMS_SCHEMA;
}

/** Adapts every already-registered native ToolDefinition into a fresh TOOL-1
 * catalog. Self-referential by construction (called with a snapshot of
 * `registry.list()` taken BEFORE the 3 meta-tools below are registered), so
 * `deckent_search_tools`/`describe_tool`/`call_tool` never see themselves. */
function buildToolSurfaceCatalog(defs: readonly ToolDefinition[]): CoreToolRegistry {
  const catalog = new CoreToolRegistry();
  for (const def of defs) {
    catalog.register({
      name: def.name,
      description: def.description,
      paramsSchema: bridgeParamsSchema(def.inputSchema),
      risk: BRIDGE_RISK_BY_TIER[def.tier],
      category: bridgeCategory(def.name),
      handlerRef: `native:${def.name}`,
    });
  }
  return catalog;
}

/** Fails closed with a descriptive error — the task's nogo bars real exec
 * here (no `handlerRef` resolver exists yet); this is the default `execImpl`
 * whenever a caller does not inject one via `toolSurface.execImpl`. */
const NOT_WIRED_EXEC: ExecImplFn = ({ name }) => {
  throw new Error(
    `deckent_call_tool: execution seam not wired for "${name}" — inject toolSurface.execImpl ` +
    '(TOOL-REPL-WIRE 354-002 exposes plan/risk-gate/confirm only; real dispatch is follow-up work).',
  );
};

function registerToolSurfaceTools(registry: ToolRegistry, opts: ToolSurfaceOptions): void {
  const catalog = buildToolSurfaceCatalog(registry.list());
  const searchIndex = new ToolSearchIndex(catalog);
  const deferred = deferredIndexLine(catalog.list());

  registry.register({
    name: 'deckent_search_tools',
    description: [
      'Search the deckent tool catalog by keyword (matches tool name/description); returns name, category, risk, and relevance score for each hit. Use this instead of scanning the full tool list.',
      deferred,
    ].filter((s) => s.length > 0).join(' '),
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Keyword(s) to search for.' },
        limit: { type: 'number', description: 'Max results (default 10).' },
      },
      required: ['query'],
    },
    category: 'catalog',
    tier: 'silent',
    source: 'builtin',
    handler: async (args) => {
      const query = typeof args['query'] === 'string' ? args['query'] : '';
      const limit = typeof args['limit'] === 'number' ? args['limit'] : undefined;
      const hits = searchIndex.searchTools(query, limit !== undefined ? { limit } : {});
      return { ok: true, output: JSON.stringify(hits) };
    },
  });

  registry.register({
    name: 'deckent_describe_tool',
    description: 'Return the full description, category, risk, and parameter summary for one tool by exact name (see deckent_search_tools for discovery).',
    inputSchema: {
      type: 'object',
      properties: { name: { type: 'string', description: 'Exact tool name.' } },
      required: ['name'],
    },
    category: 'catalog',
    tier: 'silent',
    source: 'builtin',
    handler: async (args) => {
      const name = typeof args['name'] === 'string' ? args['name'] : '';
      const def = searchIndex.describeTool(name);
      if (!def) return { ok: false, output: `[mcp-error] deckent_describe_tool: unknown tool: ${name}` };
      const params = summarizeEagerSchema(def.paramsSchema);
      return {
        ok: true,
        output: JSON.stringify({ name: def.name, description: def.description, category: def.category, risk: def.risk, params }),
      };
    },
  });

  registry.register({
    name: 'deckent_call_tool',
    description: 'Plan and invoke a tool from the deckent catalog by name (validates args, derives risk, and risk-gates the call behind a confirm decision before executing).',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Exact tool name (see deckent_search_tools/describe_tool).' },
        args: { type: 'object', additionalProperties: true, description: 'Arguments for the target tool.' },
      },
      required: ['name'],
    },
    category: 'catalog',
    tier: 'confirm',
    source: 'builtin',
    handler: async (toolArgs) => {
      const name = typeof toolArgs['name'] === 'string' ? toolArgs['name'] : '';
      const callArgs = (toolArgs['args'] && typeof toolArgs['args'] === 'object' && !Array.isArray(toolArgs['args']))
        ? (toolArgs['args'] as Record<string, unknown>)
        : {};
      const plan: ToolDispatchPlan = { ...searchIndex.planCall(name, callArgs), args: callArgs };
      const result = await dispatchToolCall(plan, {
        execImpl: opts.execImpl ?? NOT_WIRED_EXEC,
        ...(opts.confirm ? { confirm: opts.confirm } : {}),
        riskThreshold: opts.riskThreshold ?? DEFAULT_RISK_THRESHOLD,
      });
      const tag = result.status === 'executed' ? '' : result.status === 'denied' ? '[deckent-denied] ' : '[mcp-error] ';
      return { ok: result.status === 'executed', output: `${tag}${JSON.stringify(result)}` };
    },
  });
}

export function buildNativeToolRegistry(opts: NativeToolRegistryOptions): ToolRegistry {
  const registry = new ToolRegistry();

  // Exec tools — NO confirm injected (single gate = AgentSession permission engine).
  const exec = createToolExecDispatcher({ cwd: opts.cwd });
  for (const name of ['deckent_read_file', 'deckent_write_file', 'deckent_edit_file', 'deckent_bash'] as const) {
    registry.register(defineFromDispatcher(name, DESCRIPTIONS[name]!, SCHEMAS[name]!, execToolTier(name), exec));
  }

  // CLI-bridge tools (deckent_status/history/plan/…) — tier from classifyTool.
  const cli = createCliToolDispatcher();
  const genericSchema: Record<string, unknown> = { type: 'object', properties: {}, additionalProperties: true };
  for (const name of ['deckent_status', 'deckent_history', 'deckent_retro', 'deckent_doctor', 'deckent_models', 'deckent_review'] as const) {
    const tier = LEGACY_TIER[classifyTool(name, {})];
    registry.register(defineFromDispatcher(name, `Run the ${name} deckent command.`, genericSchema, tier, cli));
  }

  // Skill-dispatch tool (F11) — worker parity: lets the native REPL agent invoke a
  // deckent skill by id and receive its expert guidance as a tool_result. Delegates
  // to the live skill-pool/cache path by default, or an injected seam (tests). Read-
  // only (resolves guidance, no side-effects) → 'silent'. Metadata is technical/model-
  // facing (NOT user-facing i18n). TODO(phase2): a web_search tool stays OUT of scope
  // here — it needs an in-session approval UI / permission-gate, not the single no-op
  // gate these tools share.
  const skillDispatcher = opts.skillDispatcher ?? createDefaultSkillDispatcher(opts.cwd);
  registry.register({
    name: 'deckent_skill_dispatch',
    description: "Invoke a deckent skill by id (skillId + optional args); returns the skill's expert guidance to apply in this turn.",
    inputSchema: {
      type: 'object',
      properties: {
        skillId: { type: 'string', description: 'The skill id to dispatch (see deckent_skill_list).' },
        args: { type: 'object', additionalProperties: true, description: 'Optional skill arguments.' },
      },
      required: ['skillId'],
    },
    category: 'skill',
    tier: 'silent',
    source: 'builtin',
    handler: async (toolArgs) => {
      const skillId = typeof toolArgs['skillId'] === 'string' ? toolArgs['skillId'].trim() : '';
      if (skillId.length === 0) return { ok: false, output: '[mcp-error] deckent_skill_dispatch: skillId required' };
      const skillArgs = (toolArgs['args'] && typeof toolArgs['args'] === 'object' && !Array.isArray(toolArgs['args']))
        ? (toolArgs['args'] as Record<string, unknown>)
        : {};
      return toolResultFrom(await skillDispatcher.dispatch(skillId, skillArgs));
    },
  });

  // MCP tools (external) — always 'confirm' (never silent); single gate via no-op confirm.
  if (opts.mcpBridge) {
    const alwaysApprove = async (): Promise<boolean> => true;
    const bridge = opts.mcpBridge;
    for (const t of bridge.listTools()) {
      registry.register({
        name: t.namespacedName,
        description: mcpToolDescription(t.descriptor.description, t.namespacedName),
        inputSchema: t.descriptor.inputSchema ?? { type: 'object', additionalProperties: true },
        category: 'mcp',
        tier: 'confirm',
        source: 'mcp',
        handler: async (args) => {
          const r = await bridge.dispatch(t.namespacedName, args, alwaysApprove);
          return { ok: r.ok, output: r.output };
        },
      });
    }
  }

  // TOOL-REPL-WIRE (354-002) — `tool_surface.enabled`, default OFF. When absent
  // or false the block below never runs, so every registration above this line
  // stays byte-identical to the pre-354-002 tool list.
  if (opts.toolSurface?.enabled) {
    registerToolSurfaceTools(registry, opts.toolSurface);
  }

  return registry;
}
