// src/cli/command-registry.ts
// ═══ TERM-3 — categorized cross-surface command registry ═══════════════════
//
// Single catalog of every deckent command/capability, tagged with the
// metadata a command-discovery UI needs (category, plain-language risk,
// subsystem scope, i18n summary key, and which surfaces expose it today).
//
// Ground truth (see .tasks/task-351-002.plan for the full extraction trail):
//   - cli:  top-level commands registered by buildProgram() (src/cli/index.ts)
//   - mcp:  TOOL_CATALOG, the project's existing MCP-tool SSOT
//           (src/mcp/tools/index.ts, B-MCPCATALOG-SSOT)
//   - repl: SLASH_CATALOG (./chat-slash-registry.js) — same surface, safe to
//           import directly.
//
// ADR-D-004 (Layer-1 import direction / surface non-cross-import): mcp/ and
// cli/ MUST NOT import each other. This file therefore does NOT import
// src/mcp/tools/index.ts — the `mcpNames` on each entry are static literal
// data, extracted once from that file's real contents, not a runtime import.
// (Verified against the live TOOL_CATALOG by tests/cli/command-registry.test.ts,
// which is test-only cross-surface reading, not a src/ runtime edge —
// precedented by tests/mcp/run-tool-parity.test.ts referencing cli/ modules.)
//
// `scope` reuses the 11 architecture-area tags from CLAUDE.md's Architecture
// section (the domain a command's functionality belongs to — every command
// file physically lives under src/cli/commands/, so a literal-directory
// scope would be meaningless; domain-based scope is the only useful one).
//
// Pure data + query API only — UI wiring (REPL slash-menu grouping, i18n
// message-key population in helpers/messages.ts) is an explicit follow-up.

/** UX grouping shown in a command-discovery surface. */
export type CommandCategory = 'Core' | 'Run' | 'Memory' | 'MCP' | 'Enterprise' | 'Danger';

/**
 * TERM-5 plain-risk-language ladder: read-only < local-state modification <
 * execute/spawn a process < autonomous continuous-loop control.
 */
export type CommandRisk = 'Oku' | 'Değiştir' | 'Çalıştır' | 'Otonom';

/** Which surface(s) actually expose this capability today. */
export type CommandSurface = 'cli' | 'mcp' | 'repl';

/** Subsystem domain the command's functionality belongs to (CLAUDE.md Architecture map). */
export type CommandScope =
  | 'orchestra'
  | 'core'
  | 'agents'
  | 'nervous'
  | 'monitor'
  | 'connectors'
  | 'providers'
  | 'api'
  | 'mcp'
  | 'cli'
  | 'dashboard';

export interface CommandRegistryEntry {
  /** Canonical id — the real top-level CLI command name where one exists. */
  readonly name: string;
  readonly category: CommandCategory;
  readonly risk: CommandRisk;
  readonly scope: CommandScope;
  /** i18n key (see src/cli/helpers/messages.ts) — never display text directly. */
  readonly summaryKey: string;
  readonly surfaces: readonly CommandSurface[];
  /**
   * Exact `deckent_*` MCP tool name(s) this entry represents. Present iff
   * `surfaces` includes 'mcp'. One entry may fold several fine-grained MCP
   * tools (e.g. the 5 `deckent_nervous_*` tools) into one CLI-grain row.
   */
  readonly mcpNames?: readonly string[];
}

function entry(
  name: string,
  category: CommandCategory,
  risk: CommandRisk,
  scope: CommandScope,
  surfaces: readonly CommandSurface[],
  mcpNames?: readonly string[],
): CommandRegistryEntry {
  return { name, category, risk, scope, summaryKey: `cmdCatalog.${name}.summary`, surfaces, mcpNames };
}

/**
 * CANONICAL cross-surface command registry (TERM-3, DIRECTIVES row 42).
 * Every top-level CLI command (buildProgram()) and every registered MCP
 * tool (TOOL_CATALOG) must resolve here — enforced by
 * tests/cli/command-registry.test.ts.
 */
export const COMMAND_REGISTRY: readonly CommandRegistryEntry[] = [
  // ─── Core ──────────────────────────────────────────────────────────────
  entry('init', 'Core', 'Değiştir', 'core', ['cli', 'mcp'], ['deckent_init']),
  entry('status', 'Core', 'Oku', 'orchestra', ['cli', 'mcp', 'repl'], ['deckent_status']),
  entry('doctor', 'Core', 'Oku', 'core', ['cli', 'mcp', 'repl'], ['deckent_doctor']),
  entry('cu-status', 'Core', 'Oku', 'core', ['cli']),
  entry('config', 'Core', 'Değiştir', 'core', ['cli', 'mcp', 'repl'], ['deckent_config']),
  entry('plugin', 'Core', 'Değiştir', 'core', ['cli']),
  entry('upgrade', 'Core', 'Çalıştır', 'cli', ['cli']),
  entry('onboard', 'Core', 'Değiştir', 'cli', ['cli']),
  entry('analyze', 'Core', 'Oku', 'core', ['cli', 'mcp', 'repl'], ['deckent_analyze_project']),
  // Overnight 2026-07-02 additions (rounds 5-9): registered commands must appear
  // here — the registry⊇commands invariant test enforces it.
  entry('plan-nl', 'Run', 'Oku', 'orchestra', ['cli']), // dry-run preview by default; --write mutates DIRECTIVES
  entry('connect', 'Core', 'Oku', 'core', ['cli']),     // diagnostic wizard, no mutation
  entry('do', 'Run', 'Çalıştır', 'orchestra', ['cli']), // golden-flow; default dry-run, --run executes
  entry('archive-debt', 'Core', 'Oku', 'orchestra', ['cli']),
  entry('dashboard', 'Core', 'Oku', 'monitor', ['cli']),
  entry('sync', 'Core', 'Değiştir', 'orchestra', ['cli', 'mcp', 'repl'], ['deckent_sync']),
  entry('agent', 'Core', 'Değiştir', 'core', ['cli', 'mcp', 'repl'], ['deckent_agent_list', 'deckent_agent_manage']),
  entry('skill', 'Core', 'Değiştir', 'core', ['cli', 'mcp', 'repl'], ['deckent_skill_list', 'deckent_skill_manage']),
  entry('docs', 'Core', 'Değiştir', 'orchestra', ['cli', 'mcp'], ['deckent_docs']),
  entry('output', 'Core', 'Oku', 'monitor', ['cli']),
  entry('trace', 'Core', 'Değiştir', 'core', ['cli']),
  entry('mode', 'Core', 'Değiştir', 'core', ['cli']),
  entry('features', 'Core', 'Oku', 'core', ['cli', 'mcp', 'repl'], ['deckent_feature_query']),
  entry('audit-verify', 'Core', 'Oku', 'orchestra', ['cli']),
  entry('models', 'Core', 'Değiştir', 'core', ['cli', 'mcp', 'repl'], ['deckent_models']),
  entry('resources', 'Core', 'Oku', 'monitor', ['cli', 'repl']),
  entry('usage', 'Core', 'Oku', 'api', ['cli', 'mcp', 'repl'], ['deckent_usage']),
  entry('limits', 'Core', 'Oku', 'core', ['cli']),          // 361-002 subscription limit-probe
  entry('openrouter-probe', 'Core', 'Oku', 'core', ['cli']), // 366-003 canlı-probe (key'siz dürüst-unavailable)
  entry('kpi', 'Core', 'Oku', 'orchestra', ['cli', 'mcp', 'repl'], ['deckent_kpi']),
  entry('image', 'Core', 'Değiştir', 'core', ['cli']),
  entry('help-info', 'Core', 'Oku', 'cli', ['cli', 'mcp', 'repl'], ['deckent_help']),
  entry('audit', 'Core', 'Çalıştır', 'orchestra', ['cli', 'mcp', 'repl'], ['deckent_audit']),

  // ─── Run (sprint/task lifecycle execution) ──────────────────────────────
  entry('start', 'Run', 'Çalıştır', 'orchestra', ['cli', 'mcp'], ['deckent_start']),
  entry('plan', 'Run', 'Değiştir', 'orchestra', ['cli', 'mcp', 'repl'], ['deckent_plan']),
  entry('attach', 'Run', 'Çalıştır', 'cli', ['cli']),
  entry('spawn', 'Run', 'Çalıştır', 'agents', ['cli']),
  entry('serve', 'Run', 'Çalıştır', 'api', ['cli']),
  entry('web', 'Run', 'Çalıştır', 'api', ['cli']),
  entry('watch', 'Run', 'Oku', 'monitor', ['cli', 'mcp'], ['deckent_watch']),
  entry('run', 'Run', 'Çalıştır', 'orchestra', ['cli', 'mcp'], ['deckent_run']),
  entry('test', 'Run', 'Çalıştır', 'orchestra', ['cli']),
  entry('review', 'Run', 'Değiştir', 'orchestra', ['cli', 'mcp', 'repl'], ['deckent_review']),
  entry('finalize', 'Run', 'Değiştir', 'orchestra', ['cli']),
  entry('set-directives', 'Run', 'Değiştir', 'orchestra', ['cli', 'mcp', 'repl'], ['deckent_set_directives']),
  entry('heartbeat', 'Run', 'Çalıştır', 'orchestra', ['cli']),
  entry('chat', 'Run', 'Çalıştır', 'cli', ['cli']),
  entry('checkpoint', 'Run', 'Değiştir', 'orchestra', ['cli', 'mcp', 'repl'], ['deckent_checkpoint']),
  entry('resume', 'Run', 'Çalıştır', 'orchestra', ['cli', 'repl']),
  entry('interrogate', 'Run', 'Oku', 'orchestra', ['repl']),
  entry('cancel', 'Run', 'Değiştir', 'cli', ['repl']),

  // ─── Memory ──────────────────────────────────────────────────────────────
  entry('retro', 'Memory', 'Oku', 'orchestra', ['cli', 'mcp', 'repl'], ['deckent_retro']),
  entry('history', 'Memory', 'Oku', 'orchestra', ['cli', 'mcp', 'repl'], ['deckent_history']),
  entry('explain', 'Memory', 'Oku', 'orchestra', ['cli', 'mcp', 'repl'], ['deckent_explain']),
  entry('recall', 'Memory', 'Oku', 'core', ['cli', 'mcp', 'repl'], ['deckent_memory_query']),
  entry('remember', 'Memory', 'Değiştir', 'core', ['cli']),
  entry('memory', 'Memory', 'Değiştir', 'core', ['cli', 'mcp'], ['deckent_memory_manage']),

  // ─── MCP (managing/bridging MCP itself) ───────────────────────────────────
  entry('mcp', 'MCP', 'Değiştir', 'mcp', ['cli']),
  entry('mcp-bridge', 'MCP', 'Çalıştır', 'mcp', ['repl']),

  // ─── Enterprise ────────────────────────────────────────────────────────
  entry('process', 'Enterprise', 'Çalıştır', 'orchestra', ['cli', 'mcp'], ['deckent_process']),
  entry('cost', 'Enterprise', 'Değiştir', 'core', ['cli', 'mcp'], ['deckent_cost']),
  entry('nervous', 'Enterprise', 'Değiştir', 'nervous', ['cli', 'mcp', 'repl'], [
    'deckent_nervous_subscribe',
    'deckent_nervous_accept',
    'deckent_nervous_reject',
    'deckent_nervous_status',
    'deckent_nervous_config',
    'deckent_nervous_edit',
    'deckent_nervous_undo',
  ]),
  entry('flow', 'Enterprise', 'Çalıştır', 'orchestra', ['cli']),
  entry('rbac', 'Enterprise', 'Değiştir', 'core', ['cli']),
  entry('evolve', 'Enterprise', 'Oku', 'orchestra', ['cli']),
  entry('autonomous', 'Enterprise', 'Otonom', 'orchestra', ['cli', 'mcp', 'repl'], [
    'deckent_autonomous',
    'deckent_autonomous_backlog',
    'deckent_autonomous_status',
    'deckent_autonomous_approve',
    'deckent_autonomous_reject',
  ]),
  entry('autonomous-mission', 'Enterprise', 'Otonom', 'orchestra', ['cli']),
  entry('bot', 'Enterprise', 'Çalıştır', 'connectors', ['cli']),
  entry('gateway', 'Enterprise', 'Çalıştır', 'connectors', ['cli']),
  entry('gateway-runtime', 'Enterprise', 'Otonom', 'connectors', ['cli']),

  // ─── Danger ────────────────────────────────────────────────────────────
  entry('kill', 'Danger', 'Çalıştır', 'agents', ['cli', 'mcp', 'repl'], ['deckent_kill']),
  entry('cleanup', 'Danger', 'Değiştir', 'orchestra', ['cli', 'mcp', 'repl'], ['deckent_cleanup']),
  entry('recover', 'Danger', 'Değiştir', 'orchestra', ['cli', 'mcp', 'repl'], ['deckent_recover']),

  // ─── REPL-only session UX (no cli/mcp equivalent) ───────────────────────
  entry('model', 'Core', 'Değiştir', 'providers', ['repl']),
  entry('provider', 'Core', 'Değiştir', 'providers', ['repl']),
  entry('approve', 'Core', 'Değiştir', 'cli', ['repl']),
  // /term switches the Ask/Run/Control session mode (term-mode.ts) — mutates
  // session state like /approve, hence the same Değiştir tier.
  entry('term', 'Core', 'Değiştir', 'cli', ['repl']),
  entry('cd', 'Core', 'Değiştir', 'cli', ['repl']),
  entry('clear', 'Core', 'Oku', 'cli', ['repl']),
  entry('exit', 'Core', 'Oku', 'cli', ['repl']),
];

// ─── Query API ─────────────────────────────────────────────────────────────

export function byCategory(category: CommandCategory): readonly CommandRegistryEntry[] {
  return COMMAND_REGISTRY.filter((e) => e.category === category);
}

export function byRisk(risk: CommandRisk): readonly CommandRegistryEntry[] {
  return COMMAND_REGISTRY.filter((e) => e.risk === risk);
}

export function bySurface(surface: CommandSurface): readonly CommandRegistryEntry[] {
  return COMMAND_REGISTRY.filter((e) => e.surfaces.includes(surface));
}

export function getCommand(name: string): CommandRegistryEntry | undefined {
  return COMMAND_REGISTRY.find((e) => e.name === name);
}

/**
 * Free-text search over name / category / scope / summaryKey tail segment.
 * Case-insensitive substring match — summaryKey holds an i18n key, not
 * display text, so this stays working without a loaded message catalog.
 */
export function search(query: string): readonly CommandRegistryEntry[] {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return [];
  return COMMAND_REGISTRY.filter((e) => {
    const summaryTail = e.summaryKey.split('.').slice(1, -1).join('.');
    return (
      e.name.toLowerCase().includes(q) ||
      e.category.toLowerCase().includes(q) ||
      e.scope.toLowerCase().includes(q) ||
      summaryTail.toLowerCase().includes(q)
    );
  });
}
