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

/**
 * Outcome of attempting to resolve a gate for a given id. The string forms get a
 * generic ack; the object form lets a resolver supply its OWN reply text — used
 * when approving a parked bot-action EXECUTES it and the user should see the
 * execution result, not a generic "approved".
 */
export type ResolveOutcome = 'resolved' | 'not-found' | { readonly status: 'resolved'; readonly reply: string };

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
  readonly onChat?: (channelId: string, text: string, msg: IncomingMessage) => void | Promise<void>;
  /** Message language for acks (default 'en'). */
  readonly lang?: string;
  /**
   * Backlog-replay guard: epoch ms before which inbound messages are dropped.
   * When the bot reconnects after being offline, the platform delivers buffered
   * updates — an old "approve <id>" could replay. Set to the listener's start
   * time so only live messages are processed. (Defense in depth atop parked-action
   * TTL.) Omit to disable age filtering.
   */
  readonly acceptFrom?: number;
}

// `accept` is an alias for `approve` (BOT-VERB) so a user copying the nervous
// CLI verb (`deckent nervous accept <id>`) commands successfully over Telegram —
// autonomous uses `approve`, nervous uses `accept`, both resolve the same way.
const COMMAND_RE = /^\/?(approve|accept|reject)\s+(\S+)$/i;

/**
 * Parse an inbound message into a command, or null if it is not exactly
 * `verb <id>` (default-deny — chatter and malformed input are ignored).
 * `accept` normalizes to the `approve` action.
 */
export function parseCommand(text: string): ParsedCommand | null {
  const match = COMMAND_RE.exec(text.trim());
  if (!match) return null;
  const verb = match[1]!.toLowerCase();
  const action: ApprovalAction = verb === 'reject' ? 'reject' : 'approve';
  return { action, id: match[2]! };
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

  const acceptFrom = opts.acceptFrom;
  return (m: IncomingMessage): void => {
    // 🔴 Backlog-replay guard: drop messages older than the listener start so a
    //    buffered "approve <id>" can't replay on reconnect. Unparseable timestamp
    //    is treated as fresh (never block a live message on a bad clock).
    if (acceptFrom !== undefined) {
      const ts = Date.parse(m.timestamp);
      if (Number.isFinite(ts) && ts < acceptFrom) return;
    }
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
      void Promise.resolve(opts.onChat(m.channelId, m.text, m)).catch(() => {
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
    if (typeof outcome === 'object') {
      // Resolver supplied its own reply (e.g. a bot-action execution result).
      await reply(channelId, outcome.reply);
      return;
    }
    const key =
      outcome === 'not-found'
        ? 'bot.not_found'
        : cmd.action === 'approve'
          ? 'bot.approve_ack'
          : 'bot.reject_ack';
    await reply(channelId, getMessage(key, lang, { id: cmd.id }));
  } catch {
    // Fail-safe: a throwing resolver/reply must never crash the inbound poller.
    // But swallowing it left the user with ZERO feedback on their approve/reject —
    // best-effort tell them it failed. A reply that itself throws is swallowed by
    // the inner catch, so the poller still never crashes.
    if (reply) {
      try {
        await reply(channelId, getMessage('bot.resolve_failed', lang, { action: cmd.action, id: cmd.id }));
      } catch {
        /* reply path is down too — nothing safe left to do */
      }
    }
  }
}
