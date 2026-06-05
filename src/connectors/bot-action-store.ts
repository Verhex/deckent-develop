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
}

export interface ParkBotActionInput {
  readonly tool: string;
  readonly args: Record<string, unknown>;
  readonly channelId: string;
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
  const id = `act-${Date.now().toString(36)}-${randomBytes(3).toString('hex')}`;
  const action: BotAction = {
    id,
    tool: input.tool,
    args: input.args ?? {},
    channelId: input.channelId,
    parkedAt: new Date().toISOString(),
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
