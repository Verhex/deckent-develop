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
  | { action: 'none' };

// ─── Live Catalog ────────────────────────────────────────────────────────────
//
// Single source of truth for REPL slash commands. Each entry maps to either:
//   - a meta action (help / exit / clear) handled by resolveSlash directly, or
//   - an MCP tool (agenticTool) dispatched through McpToolDispatcher.
//
// This catalog IS the "deckent yetenek kataloğu" for the REPL surface.
// To add a new slash command, add one entry here — nothing else changes.

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
    // Meta-command: handled directly by the chat loop (chat-native.ts) BEFORE
    // the registry, via the nervous bridge — listed here only for /help + menu
    // visibility (no agenticTool, like /model and /cd).
    name: '/nervous',
    desc: 'Bekleyen nervous bildirimleri (örn: /nervous accept <id>)',
  },
  {
    // Meta-command: handled in the chat loop (chat-resume) BEFORE the registry.
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
  },
  {
    name: '/audit',
    desc: 'Sprint audit (örn: /audit gate sprint-269 · query [kanal] · compliance)',
    agenticTool: 'deckent_audit',
    agenticArgs: {},
  },
  {
    name: '/directives',
    desc: "DIRECTIVES.md göster · '/directives set <metin>' ile yaz (onay ister)",
    agenticTool: 'deckent_set_directives',
    agenticArgs: {},
  },
  {
    // Meta-command: external MCP-client is not wired into the REPL yet (F9
    // Faz 2 roadmap). Intercepted here with an honest i18n message so the
    // line never round-trips to the provider (audit finding A3).
    name: '/mcp',
    desc: 'Harici MCP istemci durumu',
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
 */
export function slashCompleter(line: string): [string[], string] {
  if (!line.startsWith('/')) return [[], line];
  const names = buildSlashRegistry()
    .map((c) => c.name)
    .filter((n) => n !== '/quit'); // alias gizli
  const hits = names.filter((n) => n.startsWith(line));
  return [hits.length > 0 ? hits : names, line];
}

// ─── Subaction parsers (Sprint 269 T-269-003) ───────────────────────────────
//
// /autonomous, /audit and /directives carry structured subactions that map to
// MCP tool args (the generic `_rest` passthrough is not enough). Pure string →
// SlashAction functions; unknown/incomplete input returns an i18n `message`
// action (the caller localizes via getMessage).

/** Derive a stable backlog id from a human title (deckent_autonomous backlog_add requires `id`). */
function slugifyBacklogId(title: string): string {
  return title
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
 * Resolve a raw REPL line against the slash registry.
 *
 * Lines that do NOT start with '/' always return `{ action: 'none' }` so the
 * caller can fall through to the provider-driven chat path.
 *
 * For `/recall <query>` the trailing words are extracted as the query arg.
 */
export function resolveSlash(line: string, registry: SlashRegistry): SlashAction {
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
  if (name === '/mcp') return { action: 'message', messageKey: 'chat.mcp_not_wired' };
  if (name === '/autonomous') return resolveAutonomousSlash(rest);
  if (name === '/audit') return resolveAuditSlash(rest);
  if (name === '/directives') return resolveDirectivesSlash(rest);

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
