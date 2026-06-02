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
  | { action: 'none' };

// ─── Live Catalog ────────────────────────────────────────────────────────────
//
// Single source of truth for REPL slash commands. Each entry maps to either:
//   - a meta action (help / exit / clear) handled by resolveSlash directly, or
//   - an MCP tool (agenticTool) dispatched through McpToolDispatcher.
//
// This catalog IS the "deckent yetenek kataloğu" for the REPL surface.
// To add a new slash command, add one entry here — nothing else changes.

const SLASH_CATALOG: readonly Omit<SlashCommand, never>[] = [
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

  const entry = registry.find((r) => r.name.toLowerCase() === name);
  if (entry?.agenticTool) {
    const args: Record<string, unknown> = { ...(entry.agenticArgs ?? {}) };
    if (entry.agenticTool === 'deckent_memory_query' && rest.length > 0) {
      args['query'] = rest.join(' ');
    }
    return { action: 'agentic', tool: entry.agenticTool, args };
  }

  return { action: 'none' };
}
