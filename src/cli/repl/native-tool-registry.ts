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
import { CLI_BRIDGE_TOOLS, WORST_CASE_CLASSIFY_ARGS } from './cli-bridge-tool-specs.js';
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
  type DispatchResult,
  type DispatchError,
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

/** Whitelist for {@link resolveToolSurfaceOptions} — mirrors RISK_ORDER's keys.
 *  An invalid config string previously fell through as-is; `RISK_ORDER[bad]` is
 *  undefined so `meetsRiskThreshold` returned false for EVERY risk → the confirm
 *  gate never fired (fail-OPEN, advisor born-607 P0). */
const VALID_RISK_THRESHOLDS: ReadonlySet<string> = new Set(['safe', 'moderate', 'destructive']);

/**
 * born-607 Gap-A: resolve the raw `tool_surface` config block into registry
 * options. Pure + validating: `enabled` must be literally `true` (config default
 * resolves it true; a load-failure `{}` fallback stays OFF — fail-closed), and an
 * invalid `riskThreshold` string is DROPPED (dispatch falls back to its own
 * 'moderate' default) instead of silently disabling the confirm gate.
 * The returned object is intentionally the SAME mutable reference callers pass to
 * both `buildNativeToolRegistry` and `createNativeEngine` — the bridge later fills
 * `execImpl`/`confirm` in place (dispatch reads them per-call), which is what
 * finally arms `deckent_call_tool` with the engine-parity resolver.
 */
export function resolveToolSurfaceOptions(
  raw: { enabled?: boolean; riskThreshold?: string } | undefined,
): ToolSurfaceOptions | undefined {
  if (!raw || raw.enabled !== true) return undefined;
  const opts: ToolSurfaceOptions = { enabled: true };
  if (typeof raw.riskThreshold === 'string' && VALID_RISK_THRESHOLDS.has(raw.riskThreshold)) {
    opts.riskThreshold = raw.riskThreshold as CoreToolRiskLevel;
  }
  return opts;
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
// Exported (born-607 P1): the parity resolver honors an EXPLICIT `riskThreshold`
// as an additional ask-floor and needs the same tier→risk bridge this catalog uses.
export const BRIDGE_RISK_BY_TIER: Record<ToolPermissionTier, CoreToolRiskLevel> = {
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

/**
 * born-633 NESTED-HONESTY item(2) — thrown by `createParityExecImpl`
 * (native-agent-bridge.ts) for a policy-deny / user-reject. Both currently
 * surface as `DispatchResult.status:'error'` (an execImpl throw —
 * tool-dispatch.ts/core has no separate status for this), so these markers are
 * the ONLY signal `toCallToolResult` below has to tell a policy denial apart
 * from a genuine internal error. Exported so native-agent-bridge.ts's throw
 * sites and this file's classifier share the SAME literal strings.
 */
export const PARITY_POLICY_DENIAL_PREFIX = '[denied by policy]';
export const PARITY_USER_REJECTION_PREFIX = '[rejected by user]';

function isApprovalDenialError(error: DispatchError | undefined): boolean {
  if (!error) return false;
  return error.message.startsWith(PARITY_POLICY_DENIAL_PREFIX) || error.message.startsWith(PARITY_USER_REJECTION_PREFIX);
}

/**
 * Duck-types a `ToolResult` (agent/tools/types.ts) out of an execImpl return
 * value. Every REAL nested target's handler always resolves one
 * (`ToolDefinition.handler`'s return type) — this stays defensive only for a
 * test-injected fake execImpl that returns something else (a bare string,
 * e.g. tests/cli/tool-repl-wire.test.ts's `'fake-result'` fixtures). Exported
 * for reuse by native-agent-bridge.ts's toolSink wiring (born-633 item 4) —
 * ONE duck-type check, not two divergent ones.
 */
export function asToolResult(value: unknown): ToolResult | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const v = value as Partial<ToolResult>;
  return typeof v.ok === 'boolean' && typeof v.output === 'string' ? (v as ToolResult) : undefined;
}

/**
 * born-633 NESTED-HONESTY item(1)+(2) — `deckent_call_tool`'s own result must
 * be honest about a NESTED failure, not just its own dispatch mechanics.
 *
 * (1) `dispatchToolCall` reports `status:'executed'` whenever `execImpl` did
 * NOT throw — a target handler that returns a HANDLED `{ok:false, output}`
 * (no throw) still counts as 'executed'. Before this fix the wrapper blindly
 * mapped `status==='executed'` to the outer `ok:true`, masking every nested
 * handled-failure as a success. The inner `ok` is unwrapped here and WINS over
 * the dispatch-level status; the inner `output` (error text) needs no separate
 * handling — it is already nested inside `JSON.stringify(result)` at
 * `result.result.output`.
 *
 * (2) A parity policy-deny/user-reject (`createParityExecImpl`'s thrown
 * `[denied by policy]`/`[rejected by user]`) is indistinguishable at the
 * `DispatchResult.status` level from a genuine internal error — both surface
 * as `status:'error'`. Detected via `isApprovalDenialError` and reclassified
 * with an honest `[approval-denied]` tag — a class DISTINCT from the
 * pre-existing `[deckent-denied]`, which stays reserved for a REAL
 * dispatch-level 'denied' (e.g. the risk-threshold gate with no confirm seam,
 * tests/cli/tool-repl-wire.test.ts:141-149 — unchanged, must not regress) —
 * plus a `status:'denied'` override in the returned JSON envelope (the nested
 * `telemetry.status` is left untouched: it is core/tool-dispatch.ts's own
 * truthful record of the execImpl-throw code path).
 */
function toCallToolResult(result: DispatchResult): ToolResult {
  if (result.status === 'executed') {
    const inner = asToolResult(result.result);
    const ok = inner ? inner.ok : true;
    return { ok, output: `${ok ? '' : '[mcp-error] '}${JSON.stringify(result)}` };
  }
  if (result.status === 'denied') {
    return { ok: false, output: `[deckent-denied] ${JSON.stringify(result)}` };
  }
  if (result.status === 'error' && isApprovalDenialError(result.error)) {
    return { ok: false, output: `[approval-denied] ${JSON.stringify({ ...result, status: 'denied' })}` };
  }
  return { ok: false, output: `[mcp-error] ${JSON.stringify(result)}` };
}

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
    // born-607: 'confirm' → 'silent'. call_tool is a ROUTER — its own outer tier
    // asking would (a) double-prompt against the inner per-target gate and (b) an
    // outer "always" would persist a `pattern:'**'` grant (call_tool args carry no
    // path/cmd → primaryResource '') silencing EVERY future nested call. The single
    // gate is the engine-parity resolver the bridge injects as `execImpl` (same
    // deny-rules/tierMap/floor/self-mod/mode checks as the loop's direct path);
    // without that injection the default remains NOT_WIRED_EXEC → fail-closed.
    tier: 'silent',
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
      return toCallToolResult(result);
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

  // CLI-bridge tools — the FULL dispatchable surface (born-596 TERM-TOOL-PARITY:
  // the dispatcher could always run ~29 subcommands, but only six read-only ones
  // were advertised, so the model never saw start/plan/cost/usage/kill/…).
  // Tier comes from classifyTool at each tool's MOST-privileged args
  // (WORST_CASE_CLASSIFY_ARGS) so a static tier can only over-ask, never
  // under-ask — destructive tools land on 'always' via ALWAYS_CONFIRM and the
  // AgentSession permission engine re-confirms them every call.
  const cli = createCliToolDispatcher();
  const genericSchema: Record<string, unknown> = { type: 'object', properties: {}, additionalProperties: true };
  for (const spec of CLI_BRIDGE_TOOLS) {
    const tier = LEGACY_TIER[classifyTool(spec.name, WORST_CASE_CLASSIFY_ARGS[spec.name] ?? {})];
    registry.register(defineFromDispatcher(spec.name, spec.description, spec.schema ?? genericSchema, tier, cli));
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
