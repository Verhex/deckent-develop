/**
 * BOT-003 slice 2 — durable bot-action store (§4G).
 *
 * A risky action the model requested is parked here (durable, survives a
 * `bot listen` restart) keyed by a fresh id holding {tool, args, channelId}.
 * On `approve <id>` the resolver consumes it and executes. Consume-once: approve
 * twice must NOT execute twice (Telegram resends / fat-fingers).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  parkBotAction,
  takeBotAction,
  listBotActions,
} from '../../src/connectors/bot-action-store.js';

let root: string;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'bot-act-')); });
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

describe('bot-action store', () => {
  it('park writes a durable action and returns an id; list reflects it', () => {
    const id = parkBotAction(root, { tool: 'deckent_plan', args: { directive: 'S300' }, channelId: '555' });
    expect(id).toMatch(/\S/);
    const all = listBotActions(root);
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ id, tool: 'deckent_plan', channelId: '555' });
    expect(all[0]!.args).toEqual({ directive: 'S300' });
  });

  it('take returns the parked action and CONSUMES it (idempotent — second take is null)', () => {
    const id = parkBotAction(root, { tool: 'deckent_kill', args: {}, channelId: '555' });
    const first = takeBotAction(root, id);
    expect(first).toMatchObject({ id, tool: 'deckent_kill' });
    const second = takeBotAction(root, id);
    expect(second).toBeNull();                 // consume-once → no double-execute
    expect(listBotActions(root)).toHaveLength(0);
  });

  it('take of an unknown id → null', () => {
    expect(takeBotAction(root, 'nope')).toBeNull();
  });

  it('distinct parks get distinct ids and coexist', () => {
    const a = parkBotAction(root, { tool: 'deckent_plan', args: {}, channelId: '1' });
    const b = parkBotAction(root, { tool: 'deckent_cleanup', args: {}, channelId: '1' });
    expect(a).not.toBe(b);
    expect(listBotActions(root).map((x) => x.id).sort()).toEqual([a, b].sort());
  });

  it('no store dir yet → list is empty, take is null (no throw)', () => {
    expect(listBotActions(root)).toEqual([]);
    expect(takeBotAction(root, 'x')).toBeNull();
  });

  it('prefix match: take resolves an id by its unique prefix (CLI/phone UX)', () => {
    const id = parkBotAction(root, { tool: 'deckent_plan', args: {}, channelId: '1' });
    const prefix = id.slice(0, 6);
    const taken = takeBotAction(root, prefix);
    expect(taken?.id).toBe(id);
  });
});
