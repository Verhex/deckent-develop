// ─── MCP tool description catalog binding (559-004) ──────────────────────────
//
// Every MCP tool description resolves from the SAME `MESSAGES` catalog the CLI
// commander surface reads (`src/cli/helpers/messages.ts`, the 559-002 single
// source), so one command can never carry two divergent texts.
//
//   surface: 'cli-shared'  → `key` IS the CLI command's own description key.
//                            The shared sentence is single-source by
//                            construction; drift is impossible, not merely
//                            discouraged.
//   surface: 'mcp-only'    → `key` is `mcp.<tool>.desc`, owned by this surface
//                            because the tool has no commander counterpart.
//
// `detailKey` (`mcp.<tool>.detail`) is ADDITIVE MCP-surface affordance —
// prerequisites, destructive warnings, action enums, return shape — that a
// terse commander one-liner cannot carry. It APPENDS to the shared sentence and
// never restates it, so it can never contradict the CLI text.
//
// Language is resolved ONCE at MCP server start (`src/mcp/server.ts` seeds
// `setMcpToolDescriptionLanguage` from the config-backed canonical resolver
// before `registerTools()` runs); tool modules never re-resolve it themselves.

import { getLanguage, getMessage } from '../../cli/helpers/messages.js';

/** Which surface owns the shared description key. */
export type McpToolDescriptionSurface = 'cli-shared' | 'mcp-only';

export interface McpToolDescriptionBinding {
  /** Catalog key carrying the command description (CLI-shared or MCP-owned). */
  readonly key: string;
  readonly surface: McpToolDescriptionSurface;
  /** Optional additive MCP-surface affordance key (`mcp.<tool>.detail`). */
  readonly detailKey?: string;
}

/**
 * Tool name → catalog binding. Registration order mirrors `TOOL_REGISTRARS`.
 *
 * A tool missing from this table cannot resolve a description and fails closed
 * at registration — the same contract `withCatalogAnnotations` enforces for a
 * tool missing from `TOOL_CATALOG`.
 */
export const MCP_TOOL_DESCRIPTION_BINDINGS: Readonly<Record<string, McpToolDescriptionBinding>> = {
  deckent_init: { key: 'cli.init.desc', surface: 'cli-shared', detailKey: 'mcp.init.detail' },
  deckent_set_directives: { key: 'cli.set_directives.desc', surface: 'cli-shared', detailKey: 'mcp.set_directives.detail' },
  deckent_plan: { key: 'cli.plan.desc', surface: 'cli-shared', detailKey: 'mcp.plan.detail' },
  deckent_start: { key: 'cli.start.desc', surface: 'cli-shared', detailKey: 'mcp.start.detail' },
  deckent_status: { key: 'status.desc', surface: 'cli-shared', detailKey: 'mcp.status.detail' },
  deckent_inspect: { key: 'inspect.description', surface: 'cli-shared', detailKey: 'mcp.inspect.detail' },
  deckent_doctor: { key: 'cli.doctor.desc', surface: 'cli-shared', detailKey: 'mcp.doctor.detail' },
  deckent_retro: { key: 'cli.retro.desc', surface: 'cli-shared', detailKey: 'mcp.retro.detail' },
  deckent_history: { key: 'history.desc', surface: 'cli-shared', detailKey: 'mcp.history.detail' },
  deckent_analyze_project: { key: 'cli.analyze.desc', surface: 'cli-shared', detailKey: 'mcp.analyze_project.detail' },
  deckent_sync: { key: 'cli.sync.desc', surface: 'cli-shared', detailKey: 'mcp.sync.detail' },
  deckent_config: { key: 'cli.config.desc', surface: 'cli-shared', detailKey: 'mcp.config.detail' },
  deckent_review: { key: 'cli.review.desc', surface: 'cli-shared', detailKey: 'mcp.review.detail' },
  deckent_run: { key: 'cli.run.desc', surface: 'cli-shared', detailKey: 'mcp.run.detail' },
  deckent_kill: { key: 'cli.kill.desc', surface: 'cli-shared', detailKey: 'mcp.kill.detail' },
  deckent_cleanup: { key: 'cli.cleanup.desc', surface: 'cli-shared', detailKey: 'mcp.cleanup.detail' },
  deckent_help: { key: 'cli.help.help_info.desc', surface: 'cli-shared', detailKey: 'mcp.help.detail' },
  deckent_agent_list: { key: 'cli.agent.list.desc', surface: 'cli-shared', detailKey: 'mcp.agent_list.detail' },
  deckent_skill_list: { key: 'cli.skill.list.desc', surface: 'cli-shared', detailKey: 'mcp.skill_list.detail' },
  deckent_checkpoint: { key: 'cli.checkpoint.desc', surface: 'cli-shared', detailKey: 'mcp.checkpoint.detail' },
  deckent_docs: { key: 'cli.docs.desc', surface: 'cli-shared', detailKey: 'mcp.docs.detail' },
  deckent_explain: { key: 'cli.explain.desc', surface: 'cli-shared', detailKey: 'mcp.explain.detail' },
  deckent_memory_query: { key: 'cli.recall.desc', surface: 'cli-shared', detailKey: 'mcp.memory_query.detail' },
  deckent_watch: { key: 'cli.watch.desc', surface: 'cli-shared', detailKey: 'mcp.watch.detail' },
  deckent_nervous_subscribe: { key: 'mcp.nervous_subscribe.desc', surface: 'mcp-only' },
  deckent_nervous_accept: { key: 'cli.nervous.accept.desc', surface: 'cli-shared', detailKey: 'mcp.nervous_accept.detail' },
  deckent_nervous_reject: { key: 'cli.nervous.reject.desc', surface: 'cli-shared', detailKey: 'mcp.nervous_reject.detail' },
  deckent_nervous_status: { key: 'mcp.nervous_status.desc', surface: 'mcp-only' },
  deckent_nervous_config: { key: 'cli.config_nervous.nervous.desc', surface: 'cli-shared', detailKey: 'mcp.nervous_config.detail' },
  deckent_feature_query: { key: 'cli.features.desc', surface: 'cli-shared', detailKey: 'mcp.feature_query.detail' },
  deckent_truth: { key: 'cli.truth.desc', surface: 'cli-shared', detailKey: 'mcp.truth.detail' },
  deckent_audit: { key: 'cli.audit.desc', surface: 'cli-shared', detailKey: 'mcp.audit.detail' },
  deckent_recover: { key: 'recover.description', surface: 'cli-shared', detailKey: 'mcp.recover.detail' },
  deckent_models: { key: 'cli.models.desc', surface: 'cli-shared', detailKey: 'mcp.models.detail' },
  deckent_autonomous: { key: 'cli.autonomous.desc', surface: 'cli-shared', detailKey: 'mcp.autonomous.detail' },
  deckent_process: { key: 'cli.process.desc', surface: 'cli-shared', detailKey: 'mcp.process.detail' },
  deckent_usage: { key: 'cli.usage.desc', surface: 'cli-shared', detailKey: 'mcp.usage.detail' },
  deckent_xverify: { key: 'xverify.cmd_desc', surface: 'cli-shared', detailKey: 'mcp.xverify.detail' },
  deckent_kpi: { key: 'cli.kpi.desc', surface: 'cli-shared', detailKey: 'mcp.kpi.detail' },
  deckent_cost: { key: 'cli.cost.desc', surface: 'cli-shared', detailKey: 'mcp.cost.detail' },
  deckent_agent_manage: { key: 'mcp.agent_manage.desc', surface: 'mcp-only' },
  deckent_skill_manage: { key: 'mcp.skill_manage.desc', surface: 'mcp-only' },
  deckent_memory_manage: { key: 'mcp.memory_manage.desc', surface: 'mcp-only' },
  deckent_autonomous_backlog: { key: 'cli.autonomous.backlog.desc', surface: 'cli-shared', detailKey: 'mcp.autonomous_backlog.detail' },
  deckent_autonomous_status: { key: 'cli.autonomous.status.desc', surface: 'cli-shared', detailKey: 'mcp.autonomous_status.detail' },
  deckent_nervous_edit: { key: 'cli.nervous.edit.desc', surface: 'cli-shared', detailKey: 'mcp.nervous_edit.detail' },
  deckent_nervous_undo: { key: 'cli.nervous.undo.desc', surface: 'cli-shared', detailKey: 'mcp.nervous_undo.detail' },
  deckent_autonomous_approve: { key: 'cli.autonomous.approve.desc', surface: 'cli-shared', detailKey: 'mcp.autonomous_approve.detail' },
  deckent_autonomous_reject: { key: 'cli.autonomous.reject.desc', surface: 'cli-shared', detailKey: 'mcp.autonomous_reject.detail' },
  deckent_execution_authority: { key: 'execution_authority.cmd_desc', surface: 'cli-shared', detailKey: 'mcp.execution_authority.detail' },
  deckent_approvals: { key: 'approvals.list_desc', surface: 'cli-shared', detailKey: 'mcp.approvals.detail' },
};

/** Server-start resolved language; `null` until the server seeds it. */
let serverLanguage: string | null = null;

/**
 * Seed the MCP surface language once, at server start, from the canonical
 * config-backed resolution. Called before any tool registers.
 */
export function setMcpToolDescriptionLanguage(lang: string | undefined): void {
  serverLanguage = getLanguage(lang);
}

/**
 * The language MCP tool text renders in. Falls back to the env/default
 * resolution when the server has not seeded one (e.g. a direct unit-test
 * registration), never to a hardcoded literal.
 */
export function getMcpToolDescriptionLanguage(): string {
  return serverLanguage ?? getLanguage(undefined);
}

/** Test/bootstrap seam — drop the seeded language so the default path resolves again. */
export function resetMcpToolDescriptionLanguage(): void {
  serverLanguage = null;
}

export interface McpToolDescriptionOptions {
  /** Override the server-resolved language (tests, parity scans). */
  readonly lang?: string;
  /** Placeholder values for keys carrying `{var}` templates. */
  readonly vars?: Record<string, string>;
}

/**
 * Resolve a tool's description from the shared catalog: the bound command
 * sentence, plus the MCP-surface addendum when the tool declares one.
 *
 * Fails closed — an unbound tool throws rather than registering a silently
 * empty or hardcoded description.
 */
export function mcpToolDescription(
  toolName: string,
  options: McpToolDescriptionOptions = {},
): string {
  const binding = MCP_TOOL_DESCRIPTION_BINDINGS[toolName];
  if (!binding) {
    throw new Error(
      `E_MCP_TOOL_DESCRIPTION_UNBOUND: MCP tool "${toolName}" has no MCP_TOOL_DESCRIPTION_BINDINGS entry — `
      + 'bind it to the CLI command key it shares, or give it an mcp.<tool>.desc key, before registering it.',
    );
  }
  const lang = options.lang ?? getMcpToolDescriptionLanguage();
  const base = getMessage(binding.key, lang, options.vars);
  if (binding.detailKey === undefined) return base;
  return `${base} ${getMessage(binding.detailKey, lang, options.vars)}`;
}
