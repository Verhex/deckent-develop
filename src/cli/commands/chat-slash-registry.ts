// ═══ chat-slash-registry — live slash command catalog for REPL ═══════════
//
// Sprint 221 Task 221-003.
//
// Provides a live, config-derived slash command catalog for the REPL.
// Commands are defined in one canonical place (SLASH_CATALOG) and derived
// from deckent's actual MCP tool capabilities — not scattered magic strings.
//
// Consumers (221-001 slash-wire, 221-002 agentic-wire) call:
//   const registry = buildSlashRegistry();
//   const action   = resolveSlash(line, registry);
//
// Karpathy D2: pure functions, no new runtime deps, no disk I/O.
//
// Sprint 358 T-358-004 (REPL-DISPATCH-PARITY) — `/nervous` list/accept/reject/edit
// now CONSUME the 357-006 pure plan-object bridge (../repl/nervous-bridge.js):
// resolveNervousSlash builds a `NervousBridgePlan` via the injected store's
// listPendingNervous/planAccept/planReject/handleEdit — this module still never
// executes anything (no applyNervousBridgePlan call here; that needs a live
// executor, the caller's job — same "wiring is follow-up" split the bridge itself
// documents). `/autonomous` and `/mcp` get category/risk tags cross-referenced
// from the TERM-3 command-registry.ts (no literal duplication, no drift).

import type { NervousNotification } from '../../core/nervous-types.js';
import {
  listPendingNervous,
  planAccept,
  planReject,
  handleEdit,
  type NervousPendingStore,
  type NervousBridgePlan,
} from '../repl/nervous-bridge.js';
import { getCommand, type CommandCategory, type CommandRisk } from '../command-registry.js';

// ─── Types ──────────────────────────────────────────────────────────────────

/** One slash command in the REPL registry. */
export interface SlashCommand {
  /** Slash name, lowercase (e.g. '/status'). */
  name: string;
  /** Short description for /help output. */
  desc: string;
  /** MCP tool to dispatch when this slash is invoked. Absent for meta-commands. */
  agenticTool?: string;
  /** Default args for the MCP tool. May be extended by inline command args. */
  agenticArgs?: Record<string, unknown>;
  /**
   * TERM-3 category/risk tag (Sprint 358 T-358-004), cross-referenced from
   * `command-registry.ts` via `tag()` below. Populated for /nervous, /autonomous,
   * /mcp (this task's 3 command-families); other entries are untagged (undefined)
   * until a follow-up extends `tag()` coverage to the rest of SLASH_CATALOG.
   */
  category?: CommandCategory;
  risk?: CommandRisk;
}

/** Immutable list of slash commands. */
export type SlashRegistry = readonly SlashCommand[];

/** What the REPL should do with a resolved slash line. */
export type SlashAction =
  | { action: 'help'; registry: SlashRegistry }
  | { action: 'exit' }
  | { action: 'clear' }
  | { action: 'agentic'; tool: string; args: Record<string, unknown> }
  /**
   * Sprint 269 T-269-003 — i18n-safe informational/error reply. The registry
   * stays pure (no lang, no disk I/O); the caller resolves `messageKey` via
   * getMessage(key, lang, params) and echoes the localized text.
   */
  | { action: 'message'; messageKey: string; params?: Record<string, string> }
  /** Sprint 269 T-269-003 — `/directives` (bare): caller shows DIRECTIVES.md. */
  | { action: 'show-directives' }
  /**
   * Sprint 358 T-358-004 — `/nervous` (bare / list): the injected store's pending
   * notifications, read-only pass-through (no plan involved).
   */
  | { action: 'nervous-list'; items: readonly NervousNotification[] }
  /**
   * Sprint 358 T-358-004 — `/nervous accept|reject|edit <id> ...`: an UNAPPLIED
   * plan built from the injected store via the 357-006 bridge
   * (../repl/nervous-bridge.js). The caller applies it with
   * `applyNervousBridgePlan(plan, executor, pendingCleanup?)` — this module never
   * executes anything itself.
   */
  | { action: 'nervous-plan'; sub: 'accept' | 'reject' | 'edit'; plan: NervousBridgePlan }
  | { action: 'none' };

// ─── Live Catalog ────────────────────────────────────────────────────────────
//
// Single source of truth for REPL slash commands. Each entry maps to either:
//   - a meta action (help / exit / clear) handled by resolveSlash directly, or
//   - an MCP tool (agenticTool) dispatched through McpToolDispatcher.
//
// This catalog IS the "deckent yetenek kataloğu" for the REPL surface.
// To add a new slash command, add one entry here — nothing else changes.

/**
 * TERM-3 category/risk lookup (Sprint 358 T-358-004) — cross-references
 * `command-registry.ts` by canonical command name so SLASH_CATALOG's tags can
 * never literal-duplicate-and-drift from the TERM-3 SSOT. Returns `{}` (both
 * fields undefined) for a name with no COMMAND_REGISTRY entry.
 */
function tag(commandRegistryName: string): Pick<SlashCommand, 'category' | 'risk'> {
  const cmd = getCommand(commandRegistryName);
  return cmd ? { category: cmd.category, risk: cmd.risk } : {};
}

const SLASH_CATALOG: readonly SlashCommand[] = [
  {
    name: '/help',
    desc: 'Kullanılabilir komutları listele',
  },
  {
    name: '/status',
    desc: 'Aktif sprint durumunu göster',
    agenticTool: 'deckent_status',
    agenticArgs: { root: '.' },
  },
  {
    name: '/recall',
    desc: 'Hafızada ara (örn: /recall docker)',
    agenticTool: 'deckent_memory_query',
    agenticArgs: {},
  },
  {
    name: '/plan',
    desc: 'Sprint planla',
    agenticTool: 'deckent_plan',
    agenticArgs: { mode: 'auto' },
  },
  {
    name: '/sprint',
    desc: 'Sprint geçmişini göster',
    agenticTool: 'deckent_history',
    agenticArgs: { root: '.' },
  },
  {
    name: '/retro',
    desc: 'Son sprint retrospektifini göster',
    agenticTool: 'deckent_retro',
    agenticArgs: { root: '.' },
  },
  {
    name: '/doctor',
    desc: 'Codebase sağlığını kontrol et',
    agenticTool: 'deckent_doctor',
    agenticArgs: { root: '.' },
  },
  {
    name: '/models',
    desc: 'Model & provider kayıtlarını listele',
    agenticTool: 'deckent_models',
    agenticArgs: {},
  },
  {
    name: '/analyze',
    desc: 'Proje stack & sağlık analizi',
    agenticTool: 'deckent_analyze_project',
    agenticArgs: { root: '.' },
  },
  {
    name: '/review',
    desc: 'Son sprint sonucunu değerlendir (GO/NO_GO)',
    agenticTool: 'deckent_review',
    agenticArgs: { root: '.' },
  },
  {
    name: '/explain',
    desc: 'Sprint sonuçlarını açıkla',
    agenticTool: 'deckent_explain',
    agenticArgs: { root: '.' },
  },
  {
    name: '/agents',
    desc: 'Kayıtlı agent havuzunu listele',
    agenticTool: 'deckent_agent_list',
    agenticArgs: {},
  },
  {
    name: '/skills',
    desc: 'Kayıtlı skill havuzunu listele',
    agenticTool: 'deckent_skill_list',
    agenticArgs: {},
  },
  {
    name: '/features',
    desc: 'Özellik manifestini sorgula',
    agenticTool: 'deckent_feature_query',
    agenticArgs: {},
  },
  {
    name: '/config',
    desc: 'Yapılandırmayı göster/değiştir (örn: /config set max_workers 4)',
    agenticTool: 'deckent_config',
    agenticArgs: {},
  },
  {
    // Meta-command: handled directly BEFORE the registry, via the legacy
    // nervous bridge — listed here for /help + menu visibility (no
    // agenticTool, like /model and /cd). Sprint 358 T-358-004 — resolveSlash's
    // OWN /nervous branch (below, gated on an injected store) now consumes the
    // 357-006 plan-object bridge; that is the fallback path (fires only when
    // a caller passes a store). Two independent callers intercept it directly
    // instead: the legacy loop (chat-native.ts, `buildNervousOutput`) and the
    // Ink native-engine bridge (repl/app.tsx, task 387-002, same helper) — both
    // read the file-backed store directly rather than passing one in.
    name: '/nervous',
    desc: 'Bekleyen nervous bildirimleri (örn: /nervous accept <id>)',
    ...tag('nervous'),
  },
  {
    // Meta-command: handled directly BEFORE the registry (PLAN-INT-1 Sprint
    // 276 Task 9). Lists structural interrogation questions from the current
    // DIRECTIVES.md — no CLI-spawn, no tool-bridge required. Two independent
    // callers intercept it: the legacy loop (chat-native.ts,
    // `buildInterrogateOutput`) and the Ink native-engine bridge
    // (repl/app.tsx, task 387-002, same helper).
    name: '/interrogate',
    desc: 'DIRECTIVES sorgulama sorularını göster (pre-plan PLAN-INT-1)',
  },
  {
    // Meta-command: handled directly BEFORE the registry by whichever REPL
    // engine is active — the legacy loop (chat-resume.ts) or the Ink
    // native-engine bridge's own picker (repl/app.tsx `resolveResumeCommand`,
    // task 358-006).
    name: '/resume',
    desc: 'Önceki sohbet oturumunu sürdür (örn: /resume 1)',
  },
  {
    name: '/sync',
    desc: 'Agent/skill manifest + routing senkronize et (onay ister)',
    agenticTool: 'deckent_sync',
    agenticArgs: {},
  },
  {
    name: '/checkpoint',
    desc: 'Checkpoint onayla/reddet (örn: /checkpoint approve <sprint> <faz>)',
    agenticTool: 'deckent_checkpoint',
    agenticArgs: {},
  },
  {
    name: '/kill',
    desc: '⚠️ Aktif sprint/worker durdur (her seferinde onay)',
    agenticTool: 'deckent_kill',
    agenticArgs: {},
  },
  {
    name: '/cleanup',
    desc: '⚠️ Task dosyalarını arşivle, sprint temizle (her seferinde onay)',
    agenticTool: 'deckent_cleanup',
    agenticArgs: {},
  },
  {
    name: '/recover',
    desc: '⚠️ Çökmüş sprint kurtar (örn: /recover sprint-224, her seferinde onay)',
    agenticTool: 'deckent_recover',
    agenticArgs: {},
  },
  {
    name: '/autonomous',
    desc: 'Otonom motor (örn: /autonomous status · backlog add <başlık> [--cron <expr>] · approve <id>)',
    agenticTool: 'deckent_autonomous',
    agenticArgs: {},
    ...tag('autonomous'),
  },
  {
    name: '/audit',
    desc: 'Sprint audit (örn: /audit gate sprint-269 · query [kanal] · compliance)',
    agenticTool: 'deckent_audit',
    agenticArgs: {},
  },
  {
    name: '/usage',
    desc: 'Token/limit kullanımını göster (örn: /usage --sprint 275)',
    agenticTool: 'deckent_usage',
    agenticArgs: {},
  },
  {
    name: '/resources',
    desc: 'MCP kaynak anlık görüntüsü (örn: /resources --log)',
    agenticTool: 'deckent_resources',
    agenticArgs: {},
  },
  {
    name: '/directives',
    desc: "DIRECTIVES.md göster · '/directives set <metin>' ile yaz (onay ister)",
    agenticTool: 'deckent_set_directives',
    agenticArgs: {},
  },
  {
    // Meta-command: handled in chat-native.ts BEFORE the registry (Sprint 280
    // Task 280-004 — G1 live wire). When ≥1 MCP server is configured
    // (.mcp.json), `/mcp list` shows the namespaced tool catalogue and
    // `/mcp call <tool> [args]` dispatches through the broker confirm-gate.
    // With no server configured it falls through here to the honest notice
    // (resolveSlash → resolveMcpSlash → chat.mcp_not_wired, Sprint 358 T-358-004
    // per-subaction fallback) so the line never round-trips to the provider
    // (audit finding A3). The Ink native-engine bridge (repl/app.tsx, task
    // 387-002) has NO equivalent live per-session bridge wired (run.tsx's
    // native mcpBridge only feeds the AgentSession's own tool registry, not a
    // `/mcp`-slash-shaped dispatcher) — it always resolves through this same
    // honest-notice fallback, never silently drops the line. Tagged from
    // 'mcp-bridge' (the REPL-surface entry, not the CLI-only 'mcp' entry) —
    // matches the actual dispatch-capable risk here.
    name: '/mcp',
    desc: 'Harici MCP araçları — list · call <tool> [args] (proje .mcp.json)',
    ...tag('mcp-bridge'),
  },
  {
    name: '/model',
    desc: 'Modeli değiştir (örn: /model sonnet)',
  },
  {
    name: '/provider',
    desc: 'Provider değiştir (örn: /provider codex)',
  },
  {
    name: '/approve',
    desc: 'Onay modu: suggest | auto-edit | full-auto',
  },
  {
    // Meta-command: handled in app.tsx handleSubmit BEFORE resolveSlash
    // (parseTermCommand, term-mode.ts). Listed for /help + menu visibility +
    // Tab-complete only — no agenticTool, so resolveSlash falls through to
    // { action: 'none' } exactly like /model and /cd.
    name: '/term',
    desc: 'Terminal modu göster/değiştir: /term ask|run|control',
  },
  {
    name: '/cd',
    desc: 'Çalışma dizinini değiştir (örn: /cd ~/deckent-dev)',
  },
  {
    name: '/cancel',
    desc: 'Kuyruktaki bekleyen mesajları iptal et',
  },
  {
    name: '/clear',
    desc: 'Ekranı temizle',
  },
  {
    name: '/exit',
    desc: "REPL'den çık (takma ad: /quit)",
  },
  {
    name: '/quit',
    desc: '/exit takma adı',
  },
];

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Build the live slash command registry from SLASH_CATALOG.
 *
 * Returns a new immutable array on each call. Callers should cache the result
 * for the REPL session lifetime rather than calling on every keystroke.
 */
export function buildSlashRegistry(): SlashRegistry {
  return SLASH_CATALOG.slice();
}

/**
 * Render a compact /help listing from the registry.
 *
 * Output is intentionally terse ("sade-ama-tam") — one line per command.
 * Width is fixed at 12 chars for the name column for alignment.
 */
export function renderHelp(registry: SlashRegistry): string {
  const lines: string[] = ['Komutlar:'];
  for (const cmd of registry) {
    if (cmd.name === '/quit') continue; // alias — skip in list, shown in /exit desc
    lines.push(`  ${cmd.name.padEnd(10)} ${cmd.desc}`);
  }
  return lines.join('\n');
}

/**
 * readline completer (Sprint 224 T-224-017) — claude-code tarzı `/` komut menüsü.
 * Kullanıcı `/` yazıp Tab'a basınca eşleşen slash komutları listelenir/tamamlanır.
 * Non-slash satırlarda boş döner (normal sohbet). readline kontratı:
 *   dönüş `[matches, line]`; tek match → tamamlar, çok match → menü listeler.
 *
 * Prefix matching is case-insensitive (born-531) — `/St` <Tab> surfaces
 * `/status` the same as `/st` would. `line` is returned as-typed (completer
 * contract); only the match filter folds case, catalog names are already
 * canonically lowercase.
 */
export function slashCompleter(line: string): [string[], string] {
  if (!line.startsWith('/')) return [[], line];
  const lower = line.toLowerCase();
  const names = buildSlashRegistry()
    .map((c) => c.name)
    .filter((n) => n !== '/quit'); // alias gizli
  const hits = names.filter((n) => n.startsWith(lower));
  return [hits.length > 0 ? hits : names, line];
}

// ─── Subaction parsers (Sprint 269 T-269-003) ───────────────────────────────
//
// /autonomous, /audit and /directives carry structured subactions that map to
// MCP tool args (the generic `_rest` passthrough is not enough). Pure string →
// SlashAction functions; unknown/incomplete input returns an i18n `message`
// action (the caller localizes via getMessage).

/**
 * Turkish-character → ASCII transliteration table (born-531) — used before
 * the generic lowercase+ASCII-fold pass in `slugifyBacklogId` so `ç ğ ı ö ş ü`
 * (and their uppercase forms, including dotted `İ`) map to a readable ASCII
 * letter instead of falling into the `[^a-z0-9]` catch-all and collapsing to
 * `-`. Standard ASCII-folding equivalents (matches deckent's other i18n
 * transliteration tables) — case is preserved here; `.toLowerCase()` still
 * runs afterward for the rest of the slug.
 */
const TURKISH_TRANSLIT_MAP: Readonly<Record<string, string>> = {
  ç: 'c', Ç: 'C',
  ğ: 'g', Ğ: 'G',
  ı: 'i', İ: 'I',
  ö: 'o', Ö: 'O',
  ş: 's', Ş: 'S',
  ü: 'u', Ü: 'U',
};

function transliterateTurkish(input: string): string {
  return input.replace(/[çÇğĞıİöÖşŞüÜ]/g, (ch) => TURKISH_TRANSLIT_MAP[ch] ?? ch);
}

/** Derive a stable backlog id from a human title (deckent_autonomous backlog_add requires `id`). */
function slugifyBacklogId(title: string): string {
  return transliterateTurkish(title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** `/autonomous status|start|stop|backlog list|backlog add <title> [--cron <expr>]|approve <id>|reject <id>` → deckent_autonomous. */
function resolveAutonomousSlash(rest: readonly string[]): SlashAction {
  // Bare `/autonomous` defaults to the read-only status action.
  const sub = (rest[0] ?? 'status').toLowerCase();
  if (sub === 'status' || sub === 'start' || sub === 'stop') {
    return { action: 'agentic', tool: 'deckent_autonomous', args: { action: sub } };
  }
  if (sub === 'backlog') {
    const verb = (rest[1] ?? '').toLowerCase();
    if (verb === 'list') {
      return { action: 'agentic', tool: 'deckent_autonomous', args: { action: 'backlog_list' } };
    }
    if (verb === 'add') {
      const cronIdx = rest.indexOf('--cron');
      const titleWords = cronIdx >= 0 ? rest.slice(2, cronIdx) : rest.slice(2);
      const title = titleWords.join(' ').trim();
      if (title.length === 0) {
        return { action: 'message', messageKey: 'chat.autonomous_title_required' };
      }
      const args: Record<string, unknown> = {
        action: 'backlog_add',
        id: slugifyBacklogId(title),
        title,
      };
      if (cronIdx >= 0) {
        const cron = rest.slice(cronIdx + 1).join(' ').trim();
        if (cron.length > 0) args['cron'] = cron;
      }
      return { action: 'agentic', tool: 'deckent_autonomous', args };
    }
    return {
      action: 'message',
      messageKey: 'chat.slash_unknown_subaction',
      params: { command: '/autonomous backlog', sub: verb.length > 0 ? verb : '(boş)' },
    };
  }
  if (sub === 'approve' || sub === 'reject') {
    const triggerId = rest[1];
    if (!triggerId) {
      return { action: 'message', messageKey: 'chat.autonomous_id_required', params: { sub } };
    }
    return { action: 'agentic', tool: 'deckent_autonomous', args: { action: sub, triggerId } };
  }
  return {
    action: 'message',
    messageKey: 'chat.slash_unknown_subaction',
    params: { command: '/autonomous', sub },
  };
}

/**
 * `/audit gate [sprint]|query [channel]|compliance` → deckent_audit dispatch.
 *
 * Bare `/audit` (and `-`-prefixed flags like `/audit --json`) deliberately
 * return `none` so the legacy enterprise CLI bridge in chat-native keeps
 * handling them (behaviour preserved). Subactions that exist in the CLI but
 * NOT in the MCP tool (forward, retention, …) get an honest i18n message
 * instead of a fabricated dispatch.
 */
function resolveAuditSlash(rest: readonly string[]): SlashAction {
  const sub = (rest[0] ?? '').toLowerCase();
  if (sub.length === 0 || sub.startsWith('-')) return { action: 'none' };
  if (sub === 'gate') {
    const args: Record<string, unknown> = { action: 'gate' };
    const sprint = rest[1];
    if (sprint) args['sprintId'] = sprint;
    return { action: 'agentic', tool: 'deckent_audit', args };
  }
  if (sub === 'query') {
    const args: Record<string, unknown> = { action: 'query' };
    const channel = rest[1];
    if (channel) args['channel'] = channel;
    return { action: 'agentic', tool: 'deckent_audit', args };
  }
  if (sub === 'compliance') {
    return { action: 'agentic', tool: 'deckent_audit', args: { action: 'compliance' } };
  }
  return { action: 'message', messageKey: 'chat.audit_not_in_mcp', params: { sub } };
}

/** `/resources [--log [path]]` → deckent_resources dispatch. */
function resolveResourcesSlash(rest: readonly string[]): SlashAction {
  if (rest.length === 0) {
    return { action: 'agentic', tool: 'deckent_resources', args: {} };
  }
  const sub = rest[0] ?? '';
  if (sub === '--log') {
    const path = rest[1];
    const args: Record<string, unknown> = path ? { log: path } : { log: true };
    return { action: 'agentic', tool: 'deckent_resources', args };
  }
  return {
    action: 'message',
    messageKey: 'chat.slash_unknown_subaction',
    params: { command: '/resources', sub },
  };
}

/** `/usage [--sprint N] [since <ISO>]` → deckent_usage dispatch. */
function resolveUsageSlash(rest: readonly string[]): SlashAction {
  if (rest.length === 0) {
    return { action: 'agentic', tool: 'deckent_usage', args: {} };
  }
  const sub = rest[0] ?? '';
  if (sub === '--sprint') {
    const sprint = rest[1];
    if (!sprint) {
      return { action: 'message', messageKey: 'chat.usage_sprint_required' };
    }
    return { action: 'agentic', tool: 'deckent_usage', args: { sprint } };
  }
  if (sub === 'since' || sub === '--since') {
    const since = rest[1];
    if (!since) {
      return { action: 'message', messageKey: 'chat.usage_since_required' };
    }
    return { action: 'agentic', tool: 'deckent_usage', args: { since } };
  }
  return {
    action: 'message',
    messageKey: 'chat.slash_unknown_subaction',
    params: { command: '/usage', sub },
  };
}

/** `/directives` (show) · `/directives set <content>` → deckent_set_directives. */
function resolveDirectivesSlash(rest: readonly string[]): SlashAction {
  if (rest.length === 0) return { action: 'show-directives' };
  const sub = (rest[0] ?? '').toLowerCase();
  if (sub === 'set') {
    const content = rest.slice(1).join(' ').trim();
    if (content.length === 0) {
      return { action: 'message', messageKey: 'chat.directives_set_usage' };
    }
    return { action: 'agentic', tool: 'deckent_set_directives', args: { content } };
  }
  return {
    action: 'message',
    messageKey: 'chat.slash_unknown_subaction',
    params: { command: '/directives', sub },
  };
}

/**
 * Parse `/nervous edit <id> ...` payload words into a modifiedPayload object —
 * one JSON object (`{...}`) or a sequence of `key=value` tokens. Mirrors
 * chat-nervous-bridge.ts's `handleNervousSlash` 'edit' parsing (Sprint 223); kept
 * as a small local duplicate rather than a cross-file refactor since that file is
 * outside this task's write scope (Karpathy D3 — surgical, in-scope only).
 */
function parseNervousEditPayload(
  payloadArgs: readonly string[],
): { ok: true; payload: Record<string, unknown> } | { ok: false; action: SlashAction } {
  const joined = payloadArgs.join(' ');
  if (joined.trimStart().startsWith('{')) {
    try {
      return { ok: true, payload: JSON.parse(joined) as Record<string, unknown> };
    } catch {
      return {
        ok: false,
        action: {
          action: 'message',
          messageKey: 'nervous.slash_edit_invalid_json',
          params: { detail: joined.slice(0, 40) },
        },
      };
    }
  }
  const payload: Record<string, unknown> = {};
  for (const arg of payloadArgs) {
    const eqIdx = arg.indexOf('=');
    if (eqIdx <= 0) {
      return {
        ok: false,
        action: { action: 'message', messageKey: 'nervous.slash_edit_invalid_kv', params: { arg } },
      };
    }
    payload[arg.slice(0, eqIdx)] = arg.slice(eqIdx + 1);
  }
  return { ok: true, payload };
}

/**
 * `/nervous [list] | accept <id> [reason...] | reject <id> [reason...] | edit <id> <json|k=v...>`
 * → CONSUMES the 357-006 plan-object bridge (../repl/nervous-bridge.js). Builds
 * an UNAPPLIED plan (or, for bare/list, a read-only pending snapshot) — never
 * executes anything (no `applyNervousBridgePlan` call here; that is the caller's
 * job once it holds a live executor). `store` is the same `NervousPendingStore`
 * seam the bridge itself defines — a fake in tests, a disk/IPC-backed reader in
 * production wiring (explicit follow-up, unchanged by this task).
 */
export function resolveNervousSlash(rest: readonly string[], store: NervousPendingStore): SlashAction {
  const sub = (rest[0] ?? 'list').toLowerCase();

  if (sub === 'list') {
    return { action: 'nervous-list', items: listPendingNervous(store) };
  }

  if (sub === 'accept' || sub === 'reject') {
    const id = rest[1];
    if (!id) {
      return { action: 'message', messageKey: 'nervous.slash_id_required', params: { sub } };
    }
    const reason = rest.slice(2).join(' ').trim();
    const result =
      sub === 'accept' ? planAccept(store, id) : planReject(store, id, reason.length > 0 ? reason : undefined);
    if (!result.found) {
      return { action: 'message', messageKey: 'nervous.slash_not_found', params: { id: result.id } };
    }
    return { action: 'nervous-plan', sub, plan: result.plan };
  }

  if (sub === 'edit') {
    const id = rest[1];
    if (!id) {
      return { action: 'message', messageKey: 'nervous.slash_id_required', params: { sub } };
    }
    const payloadArgs = rest.slice(2);
    if (payloadArgs.length === 0) {
      return { action: 'message', messageKey: 'nervous.slash_edit_payload_required' };
    }
    const parsed = parseNervousEditPayload(payloadArgs);
    if (!parsed.ok) return parsed.action;
    const result = handleEdit(store, id, parsed.payload);
    if (!result.found) {
      return { action: 'message', messageKey: 'nervous.slash_not_found', params: { id: result.id } };
    }
    return { action: 'nervous-plan', sub: 'edit', plan: result.plan };
  }

  return {
    action: 'message',
    messageKey: 'chat.slash_unknown_subaction',
    params: { command: '/nervous', sub },
  };
}

/**
 * `/mcp [list|call ...|restart]` — registry-level FALLBACK notice only. The LIVE
 * external-MCP dispatch (list/call) is chat-native.ts's own wire
 * (dispatchMcpSlash, ../repl/mcp-bridge.js), which intercepts BEFORE resolveSlash
 * whenever a bridge is configured — this function only runs with no bridge
 * present (or a caller invoking resolveSlash directly). 'restart' has no dispatch
 * surface in mcp-bridge.ts at all, so it gets the existing honest
 * unknown-subaction hint instead of the misleading "not configured" notice;
 * bare/list/call are unchanged from before this task (chat.mcp_not_wired).
 */
function resolveMcpSlash(rest: readonly string[]): SlashAction {
  const sub = (rest[0] ?? 'list').toLowerCase();
  if (sub === 'restart') {
    return {
      action: 'message',
      messageKey: 'chat.slash_unknown_subaction',
      params: { command: '/mcp', sub },
    };
  }
  return { action: 'message', messageKey: 'chat.mcp_not_wired' };
}

/**
 * Resolve a raw REPL line against the slash registry.
 *
 * Lines that do NOT start with '/' always return `{ action: 'none' }` so the
 * caller can fall through to the provider-driven chat path.
 *
 * For `/recall <query>` the trailing words are extracted as the query arg.
 *
 * `nervousStore` (Sprint 358 T-358-004) is an OPTIONAL 3rd param — omitted, every
 * existing 2-arg call site (chat-native.ts, all prior tests) is byte-for-byte
 * unaffected: `/nervous` still resolves to `{ action: 'none' }` exactly as before
 * (chat-native.ts's own legacy bridge intercepts it earlier). Pass a store to opt
 * a caller into the 357-006 plan-object bridge for `/nervous`.
 */
export function resolveSlash(
  line: string,
  registry: SlashRegistry,
  nervousStore?: NervousPendingStore,
): SlashAction {
  const trimmed = line.trim();
  if (!trimmed.startsWith('/')) return { action: 'none' };

  const parts = trimmed.split(/\s+/);
  const name = (parts[0] ?? '').toLowerCase();
  const rest = parts.slice(1);

  if (name === '/help') return { action: 'help', registry };
  if (name === '/exit' || name === '/quit') return { action: 'exit' };
  if (name === '/clear') return { action: 'clear' };

  // Sprint 269 T-269-003 — structured subaction slashes. Parsed BEFORE the
  // generic entry lookup so their args map to the MCP tool schemas instead of
  // the positional `_rest` passthrough.
  if (name === '/mcp') return resolveMcpSlash(rest);
  // Sprint 358 T-358-004 — `/nervous` structured dispatch, gated on an injected
  // store (see doc-comment above); no store → 'none' (today's behavior, chat-native.ts
  // already handles /nervous before reaching the registry).
  if (name === '/nervous') return nervousStore ? resolveNervousSlash(rest, nervousStore) : { action: 'none' };
  if (name === '/autonomous') return resolveAutonomousSlash(rest);
  if (name === '/audit') return resolveAuditSlash(rest);
  if (name === '/directives') return resolveDirectivesSlash(rest);
  if (name === '/usage') return resolveUsageSlash(rest);
  if (name === '/resources') return resolveResourcesSlash(rest);

  const entry = registry.find((r) => r.name.toLowerCase() === name);
  if (entry?.agenticTool) {
    const args: Record<string, unknown> = { ...(entry.agenticArgs ?? {}) };
    if (entry.agenticTool === 'deckent_memory_query') {
      if (rest.length > 0) args['query'] = rest.join(' ');
    } else if (rest.length > 0) {
      // Generic positional passthrough — e.g. `/audit sprint-224` →
      // dispatcher appends these to the CLI subcommand (chat-tool-bridge).
      args['_rest'] = rest;
    }
    return { action: 'agentic', tool: entry.agenticTool, args };
  }

  return { action: 'none' };
}
