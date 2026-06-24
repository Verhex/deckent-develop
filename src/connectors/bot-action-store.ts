/**
 * BOT-003 slice 2 — durable bot-action store (§4G).
 *
 * A risky action the model requested (via the gated dispatcher) is parked here:
 * a durable JSON file under `.deckent/bot-actions/`, keyed by a fresh id, holding
 * {tool, args, channelId}. It survives a `bot listen` restart. On `approve <id>`
 * the resolver consumes it (take = read + delete, consume-once) and executes —
 * approving twice cannot execute twice.
 *
 * This is the THIRD approval gate alongside autonomous (decisions.json) and
 * nervous (IPC). Unlike those, the approval HERE triggers execution in the
 * bot-listen process; the others are consumed by their own long-lived loops.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

export interface BotAction {
  readonly id: string;
  readonly tool: string;
  readonly args: Record<string, unknown>;
  readonly channelId: string;
  readonly parkedAt: string;
  /** Absolute expiry (ISO). A stale/backlog/forgotten approval past this is refused. */
  readonly expiresAt: string;
  /**
   * The sprint active WHEN this was parked — set ONLY for sprint-scoped
   * destructive tools (kill/cleanup/recover). At execute time it is re-verified
   * against the currently-active sprint; a mismatch refuses, so an approval can
   * never hit a different/later sprint than the one it was about.
   */
  readonly boundSprintId?: string;
  /**
   * Platform message-id of the out-of-band button approval message sent by the
   * bot connector. Set by the rich-approval flow so later tasks can edit/delete
   * that message on resolve (e.g. replace buttons with a result line).
   */
  readonly approvalMessageId?: string;
}

export interface ParkBotActionInput {
  readonly tool: string;
  readonly args: Record<string, unknown>;
  readonly channelId: string;
  /** Time-to-live in ms (default 1h). */
  readonly ttlMs?: number;
  /** Active sprint id to bind (ignored unless the tool is sprint-scoped destructive). */
  readonly boundSprintId?: string;
  /**
   * Platform message-id of the out-of-band button approval message (rich-approval bot).
   * Persisted so later pipeline tasks can edit/delete that message on action resolve.
   */
  readonly approvalMessageId?: string;
}

/** Default parked-action TTL: 1 hour. Long enough to act, short enough to bound staleness. */
const DEFAULT_TTL_MS = 60 * 60 * 1000;

/** Tools whose effect is scoped to a specific sprint and destructive → bind + re-verify. */
const SPRINT_SCOPED_DESTRUCTIVE: ReadonlySet<string> = new Set([
  'deckent_kill',
  'deckent_cleanup',
  'deckent_recover',
]);

/** True when a tool's effect must be bound to the sprint active at park time. */
export function isSprintScopedDestructive(tool: string): boolean {
  return SPRINT_SCOPED_DESTRUCTIVE.has(tool);
}

export interface ExecutabilityContext {
  /** Current wall-clock (ms) — injected for tests. */
  readonly now: number;
  /** The sprint active NOW (getCurrentSprintId), or null if none. */
  readonly currentSprintId: string | null;
}

export type Executability = { ok: true } | { ok: false; reason: 'expired' | 'sprint-changed' };

/**
 * Re-verify a parked action at execute time (advisor's two flat rules):
 *  1. TTL (universal) — past expiresAt → 'expired'.
 *  2. Sprint-binding (destructive only) — boundSprintId ≠ the currently-active
 *     sprint → 'sprint-changed' (covers "different sprint" AND "nothing active
 *     now because the user killed it manually").
 */
export function checkExecutable(action: BotAction, ctx: ExecutabilityContext): Executability {
  if (action.expiresAt && ctx.now > Date.parse(action.expiresAt)) {
    return { ok: false, reason: 'expired' };
  }
  if (action.boundSprintId && action.boundSprintId !== ctx.currentSprintId) {
    return { ok: false, reason: 'sprint-changed' };
  }
  return { ok: true };
}

function storeDir(root: string): string {
  return join(root, '.deckent', 'bot-actions');
}

function actionPath(root: string, id: string): string {
  return join(storeDir(root), `${id}.json`);
}

/** Park a risky action durably; returns its approval id. */
export function parkBotAction(root: string, input: ParkBotActionInput): string {
  const dir = storeDir(root);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const now = Date.now();
  const id = `act-${now.toString(36)}-${randomBytes(3).toString('hex')}`;
  const action: BotAction = {
    id,
    tool: input.tool,
    args: input.args ?? {},
    channelId: input.channelId,
    parkedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + (input.ttlMs ?? DEFAULT_TTL_MS)).toISOString(),
    // Bind the sprint ONLY for sprint-scoped destructive tools (kill/cleanup/recover).
    ...(input.boundSprintId && isSprintScopedDestructive(input.tool)
      ? { boundSprintId: input.boundSprintId }
      : {}),
    // Persist the approval message-id when provided (rich-approval bot round-trip).
    ...(input.approvalMessageId ? { approvalMessageId: input.approvalMessageId } : {}),
  };
  writeFileSync(actionPath(root, id), JSON.stringify(action, null, 2) + '\n', 'utf-8');
  return id;
}

/** All parked (unconsumed) actions. */
export function listBotActions(root: string): BotAction[] {
  const dir = storeDir(root);
  if (!existsSync(dir)) return [];
  const actions: BotAction[] = [];
  for (const entry of readdirSync(dir)) {
    if (!entry.endsWith('.json')) continue;
    try {
      const parsed = JSON.parse(readFileSync(join(dir, entry), 'utf-8')) as BotAction;
      if (parsed && typeof parsed.id === 'string') actions.push(parsed);
    } catch {
      // corrupt/partial → skip
    }
  }
  return actions;
}

/**
 * Attach (or update) the approvalMessageId on an already-parked action. Re-reads
 * the stored JSON, sets the field, and rewrites atomically. Best-effort: if the
 * file has already been consumed (taken) the write is a no-op (file absent).
 */
export function attachApprovalMessageId(root: string, actionId: string, messageId: string): void {
  const path = actionPath(root, actionId);
  if (!existsSync(path)) return; // already consumed — no-op
  try {
    const current = JSON.parse(readFileSync(path, 'utf-8')) as BotAction;
    const updated: BotAction = { ...current, approvalMessageId: messageId };
    writeFileSync(path, JSON.stringify(updated, null, 2) + '\n', 'utf-8');
  } catch {
    // corrupt or race-consumed — best-effort, never crash the turn
  }
}

/**
 * Consume a parked action by exact id or unique prefix: read then delete, so a
 * second take (Telegram resend / double-tap) returns null and never re-executes.
 */
export function takeBotAction(root: string, idOrPrefix: string): BotAction | null {
  const match = listBotActions(root).find((a) => a.id === idOrPrefix || a.id.startsWith(idOrPrefix));
  if (!match) return null;
  try {
    unlinkSync(actionPath(root, match.id)); // consume-once BEFORE returning
  } catch {
    return null; // already taken by a concurrent consumer
  }
  return match;
}
