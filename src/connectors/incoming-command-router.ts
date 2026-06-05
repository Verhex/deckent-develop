/**
 * BOT-002 — incoming command router (§4G).
 *
 * Turns an inbound bot message ("approve <id>" / "reject <id>") into an
 * approval-gate resolution, closing the inbound half of the messaging wire
 * (BOT-001 was outbound notify). This is a DIRECT-resolve handler — distinct
 * from `IncomingMessageRouter` (incoming-router.ts), which publishes
 * INCOMING_MESSAGE onto the event bus. Here we resolve a human approval gate.
 *
 * Security (the core property): only the configured chat id(s) — the channels
 * deckent was already told to notify — may command. An unauthorized sender's
 * valid command is SILENTLY ignored: resolver is never called, no ack is sent,
 * so the bot never confirms it is listening to a stranger (no oracle). ADR-040
 * (default-deny). The resolver itself owns gate routing (autonomous vs nervous).
 */

import { getMessage } from '../cli/helpers/messages.js';
import type { IncomingMessage, MessageHandler } from './types.js';

/** A human approval decision parsed from an inbound message. */
export type ApprovalAction = 'approve' | 'reject';

export interface ParsedCommand {
  readonly action: ApprovalAction;
  readonly id: string;
}

/** Outcome of attempting to resolve a gate for a given id. */
export type ResolveOutcome = 'resolved' | 'not-found';

/**
 * Resolves an approval gate. Injected so the router stays pure and gate-agnostic;
 * the real implementation (connector-bootstrap) does ownership lookup across the
 * autonomous and nervous pending queues. Must be idempotent (platforms re-send).
 */
export type CommandResolver = (id: string, action: ApprovalAction) => Promise<ResolveOutcome>;

/** Optional reply callback — ack a resolution back to the originating channel. */
export type ReplyFn = (channelId: string, text: string) => void | Promise<void>;

export interface IncomingCommandRouterOptions {
  /** Chat ids permitted to issue commands (the configured notify chat ids). */
  readonly authorizedChatIds: readonly string[];
  /** Resolve the gate owning `id` with the parsed action. */
  readonly resolve: CommandResolver;
  /** Ack the result back to the channel. Omit to run silently. */
  readonly reply?: ReplyFn;
  /**
   * Chat fallback for authorized messages that are NOT approve/reject commands.
   * Drives the agentic chat engine (full conversation). Called ONLY after the
   * sender passes the same authorized-chat_id gate as commands — chat inherits
   * the exact same auth chokepoint (a stranger must never reach the engine).
   * Omit to keep non-command messages silently ignored (back-compat).
   */
  readonly onChat?: (channelId: string, text: string) => void | Promise<void>;
  /** Message language for acks (default 'en'). */
  readonly lang?: string;
}

const COMMAND_RE = /^\/?(approve|reject)\s+(\S+)$/i;

/**
 * Parse an inbound message into a command, or null if it is not exactly
 * `verb <id>` (default-deny — chatter and malformed input are ignored).
 */
export function parseCommand(text: string): ParsedCommand | null {
  const match = COMMAND_RE.exec(text.trim());
  if (!match) return null;
  return { action: match[1]!.toLowerCase() as ApprovalAction, id: match[2]! };
}

/**
 * Build a MessageHandler that authorizes the sender, parses the command, and
 * resolves the owning approval gate. Returns void (handler contract); the async
 * resolve+ack runs fire-and-forget and never throws out of the handler.
 */
export function makeIncomingCommandRouter(
  opts: IncomingCommandRouterOptions,
): MessageHandler {
  const authorized = new Set(opts.authorizedChatIds);
  const lang = opts.lang ?? 'en';

  return (m: IncomingMessage): void => {
    const cmd = parseCommand(m.text);
    // 🔴 Security gate (single chokepoint): an unauthorized sender reaches NEITHER
    //    the resolver NOR the chat engine, and gets no ack — silent-ignore so the
    //    bot is never a stranger's oracle (and, with chat, never a stranger's RCE).
    if (!authorized.has(m.channelId)) return;

    if (cmd) {
      void resolveAndAck(opts.resolve, opts.reply, lang, m.channelId, cmd);
      return;
    }
    // Authorized non-command → agentic chat fallback (if wired), else silent.
    if (opts.onChat) {
      void Promise.resolve(opts.onChat(m.channelId, m.text)).catch(() => {
        // Fail-safe: a throwing chat path must never crash the inbound poller.
      });
    }
  };
}

async function resolveAndAck(
  resolve: CommandResolver,
  reply: ReplyFn | undefined,
  lang: string,
  channelId: string,
  cmd: ParsedCommand,
): Promise<void> {
  try {
    const outcome = await resolve(cmd.id, cmd.action);
    if (!reply) return;
    const key =
      outcome === 'not-found'
        ? 'bot.not_found'
        : cmd.action === 'approve'
          ? 'bot.approve_ack'
          : 'bot.reject_ack';
    await reply(channelId, getMessage(key, lang, { id: cmd.id }));
  } catch {
    // Fail-safe: a throwing resolver/reply must never crash the inbound poller.
  }
}
