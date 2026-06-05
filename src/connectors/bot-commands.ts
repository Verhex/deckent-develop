/**
 * BOT-003 slice 2c — curated bot command surface (§4G).
 *
 * The bot has its OWN small command surface (its phone UI), deliberately NOT the
 * full deckent CLI. The native chat engine's slash registry resolves ~30 CLI
 * commands (/plan /kill /cleanup …) and fires unconditionally inside
 * runChatNativeLoop — so every '/'-prefixed message is intercepted HERE, at the
 * bot layer, and never reaches the engine. That keeps `/help` showing the bot's
 * interface, not a CLI dump.
 *
 * 🔴 Gate-bypass invariant (advisor): curated slashes are READ-ONLY + bot-native
 * ONLY. State-change has exactly one path — natural language → gated dispatcher →
 * `approve <id>`. No risky tool is ever exposed as a slash (that would be a door
 * around the approval gate built in slices 2a/2b). The unit test asserts every
 * tool-backed command maps to a non-risky tool.
 */

import type { McpToolDispatcher } from '../cli/commands/chat-native.js';
import { getMessage } from '../cli/helpers/messages.js';
import { isRiskyBotTool } from './bot-agentic.js';
import { listBotActions } from './bot-action-store.js';

type BotCommandKind = 'help' | 'pending' | { readonly tool: string };

interface BotCommandDef {
  readonly name: string; // canonical lowercase slash, e.g. '/status'
  readonly kind: BotCommandKind;
}

/**
 * The curated surface. Tool-backed entries are READ-ONLY by invariant (asserted
 * in tests + guarded at dispatch). To expose a state-changing capability, do NOT
 * add a slash here — route it through natural language + the gated dispatcher.
 */
const BOT_COMMANDS: readonly BotCommandDef[] = [
  { name: '/help', kind: 'help' },
  { name: '/status', kind: { tool: 'deckent_status' } },
  { name: '/history', kind: { tool: 'deckent_history' } },
  { name: '/pending', kind: 'pending' },
];

/** Names of every curated bot command (for help/tests). */
export const BOT_COMMAND_NAMES: readonly string[] = BOT_COMMANDS.map((c) => c.name);

/** True when a message is in slash territory (after trim) — must be intercepted. */
export function isBotSlash(text: string): boolean {
  return text.trim().startsWith('/');
}

/** Parse a slash message into a normalized {name, args}, or null if not a slash. */
export function parseBotSlash(text: string): { name: string; args: string } | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith('/')) return null;
  const match = /^\/(\S*)\s*([\s\S]*)$/.exec(trimmed);
  if (!match) return { name: '/', args: '' };
  return { name: '/' + match[1]!.toLowerCase(), args: match[2]!.trim() };
}

export interface HandleBotSlashDeps {
  readonly root: string;
  readonly lang: string;
  /** Dispatcher for read-only tool-backed commands (e.g. /status). */
  readonly readOnlyDispatcher: McpToolDispatcher;
}

/**
 * Handle a curated bot slash command. Always returns a reply string — an unknown
 * slash gets default-deny guidance (never falls through to the chat engine / CLI).
 */
export async function handleBotSlash(text: string, deps: HandleBotSlashDeps): Promise<string> {
  const parsed = parseBotSlash(text);
  if (!parsed) return getMessage('bot.unknown_command', deps.lang);

  const def = BOT_COMMANDS.find((c) => c.name === parsed.name);
  if (!def) return getMessage('bot.unknown_command', deps.lang);

  if (def.kind === 'help') return renderBotHelp(deps.lang);
  if (def.kind === 'pending') return renderPending(deps.root, deps.lang);

  const tool = def.kind.tool;
  // Defensive: the curated surface must never carry a risky tool.
  if (isRiskyBotTool(tool)) return getMessage('bot.unknown_command', deps.lang);
  try {
    return await deps.readOnlyDispatcher.dispatch(tool, {});
  } catch (err) {
    return `[mcp-error] ${tool}: ${err instanceof Error ? err.message : String(err)}`;
  }
}

/** Curated help — the bot's interface, with the approve/reject + chat hints. */
export function renderBotHelp(lang: string): string {
  return getMessage('bot.help_body', lang);
}

/** List actions parked for human approval (the /pending surface). */
function renderPending(root: string, lang: string): string {
  const actions = listBotActions(root);
  if (actions.length === 0) return getMessage('bot.pending_none', lang);
  const rows = actions.map((a) =>
    getMessage('bot.pending_row', lang, {
      tool: a.tool,
      args: summarize(a.args),
      id: a.id,
    }),
  );
  return [getMessage('bot.pending_header', lang), ...rows].join('\n');
}

function summarize(args: Record<string, unknown>): string {
  const keys = Object.keys(args ?? {});
  if (keys.length === 0) return '';
  return keys
    .map((k) => {
      const v = args[k];
      const s = typeof v === 'string' ? v : JSON.stringify(v);
      return `${k}: ${s.length > 60 ? s.slice(0, 57) + '…' : s}`;
    })
    .join(', ');
}
