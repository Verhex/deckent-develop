// ═══ tool-permissions — REPL dispatch confirm classification ═════════════════
//
// The REPL routes slash commands to deckent CLI subcommands (chat-tool-bridge).
// Read-only commands run silently; write/destructive ones must confirm first.
// This module is the single source of truth for that classification — a pure
// function so it is unit-testable without the Ink render stack.
//
// Hierarchy (Alperen's "tool-hook" decision):
//   read    → run silently.
//   confirm → ask once (y/a/N); "a" is remembered for the session.
//   always  → ask EVERY time; a remembered "a" / allow-list / full-auto mode is
//             OVERRIDDEN. Honors the "never run kill/cleanup without asking"
//             safety rule — these mutate live sprint state irreversibly.

export type ToolPermission = 'read' | 'confirm' | 'always';

/**
 * Destructive / high-stakes tools — always re-confirm, never auto-approvable.
 * `deckent_start`/`deckent_run` join the destructive trio here on the
 * CommandRisk ladder's 'Çalıştır' (execute/spawn-a-process) rung — one tier
 * above the 'Değiştir' (local-state modify) tools in CONFIRM_TOOLS below
 * (see src/cli/command-registry.ts entries for start/run/plan + the
 * `toolPermissionToCommandRisk` translation in risk-language.ts: always ↔
 * Çalıştır, confirm ↔ Değiştir). Each spawns real worker processes with real
 * cost/time and irreversible repo writes — a materially new, high-stakes
 * action every single call, not something a remembered "a" should silence.
 */
const ALWAYS_CONFIRM: ReadonlySet<string> = new Set([
  'deckent_kill',
  'deckent_cleanup',
  'deckent_recover',
  'deckent_start',
  'deckent_run',
]);

/** Write tools — confirm once; "a" remembered for the session. */
const CONFIRM_TOOLS: ReadonlySet<string> = new Set([
  'deckent_plan',
  'deckent_sync',
  'deckent_set_directives',
  'deckent_docs',
  'deckent_checkpoint',
]);

/** `deckent config` subcommands that mutate config.json (vs. read-only show/get/list/keys). */
const CONFIG_WRITE_SUBS: ReadonlySet<string> = new Set(['set', 'import', 'migrate']);

/**
 * Classify a tool dispatch into its confirmation tier.
 *
 * `args._rest` carries the positional words from the slash line (e.g.
 * `/config set k v` → `['set','k','v']`), used to tell a config WRITE from a
 * config READ.
 */
export function classifyTool(tool: string, args: Record<string, unknown>): ToolPermission {
  if (ALWAYS_CONFIRM.has(tool)) return 'always';
  if (CONFIRM_TOOLS.has(tool)) return 'confirm';
  if (tool === 'deckent_config') {
    const rest = args['_rest'];
    const sub = Array.isArray(rest) && typeof rest[0] === 'string' ? rest[0] : '';
    return CONFIG_WRITE_SUBS.has(sub) ? 'confirm' : 'read';
  }
  if (tool === 'deckent_autonomous') {
    // status/pending/backlog_list are read-only; approve/reject/backlog_add/stop
    // mutate the backlog or dispatch machine work (Sprint 269 /autonomous slash).
    const action = typeof args['action'] === 'string' ? (args['action'] as string) : '';
    return action === 'status' || action === 'pending' || action === 'backlog_list' ? 'read' : 'confirm';
  }
  if (tool === 'deckent_audit') {
    // gate writes <sprint>-gate.json and runs the slow self-audit; query/compliance read.
    const action = typeof args['action'] === 'string' ? (args['action'] as string) : 'gate';
    return action === 'gate' ? 'confirm' : 'read';
  }
  if (tool === 'deckent_usage') return 'read';
  if (tool === 'deckent_resources') return 'read';
  if (tool === 'deckent_process') {
    // action=status|result poll a prior submission by executionId (read-only,
    // per the tool's own MCP description). action=submit injects a NEW
    // ExecutionRequest — same 'Çalıştır' (execute/spawn) class as
    // deckent_start/deckent_run above, so it shares their 'always' tier.
    const action = typeof args['action'] === 'string' ? (args['action'] as string) : 'submit';
    return action === 'status' || action === 'result' ? 'read' : 'always';
  }
  return 'read';
}

// ─── External MCP tool classification ────────────────────────────────────────

/**
 * Name prefixes that indicate a read-only MCP tool operation.
 * Tools whose name starts with any of these are auto-approved (no prompt).
 */
const READ_ONLY_PREFIXES: readonly string[] = [
  'list_',
  'get_',
  'read_',
  'fetch_',
  'describe_',
  'show_',
  'search_',
  'query_',
  'inspect_',
  'check_',
  'find_',
  'browse_',
];

/**
 * Classify an external MCP tool by its tool name using name-prefix heuristics.
 *
 * - Read-only prefixes (list_, get_, read_, etc.) → `'read'` (auto-approve, no prompt).
 * - All other tools → `'confirm'` (prompt once; `'a'` remembered for session).
 * - **Never returns `'always'`** — external tools cannot be permanently auto-approved.
 */
export function classifyExternalTool(toolName: string): Exclude<ToolPermission, 'always'> {
  const lower = toolName.toLowerCase();
  for (const prefix of READ_ONLY_PREFIXES) {
    if (lower.startsWith(prefix)) return 'read';
  }
  return 'confirm';
}
