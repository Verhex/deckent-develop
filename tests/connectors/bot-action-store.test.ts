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
  checkExecutable,
  isSprintScopedDestructive,
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

  it('park stores a TTL (expiresAt) on every action', () => {
    parkBotAction(root, { tool: 'deckent_plan', args: {}, channelId: '1', ttlMs: 1000 });
    const [a] = listBotActions(root);
    expect(a!.expiresAt).toBeTruthy();
    expect(Date.parse(a!.expiresAt)).toBeGreaterThan(Date.parse(a!.parkedAt));
  });

  it('park binds the active sprint for sprint-scoped destructive tools only', () => {
    const kill = parkBotAction(root, { tool: 'deckent_kill', args: {}, channelId: '1', boundSprintId: 'sprint-232' });
    const plan = parkBotAction(root, { tool: 'deckent_plan', args: {}, channelId: '1', boundSprintId: 'sprint-232' });
    const all = listBotActions(root);
    expect(all.find((a) => a.id === kill)!.boundSprintId).toBe('sprint-232');
    // plan is not sprint-scoped destructive — even if a sprint id is passed it stays unbound
    expect(all.find((a) => a.id === plan)!.boundSprintId).toBeUndefined();
  });
});

describe('isSprintScopedDestructive', () => {
  it('kill / cleanup / recover are sprint-scoped destructive', () => {
    for (const t of ['deckent_kill', 'deckent_cleanup', 'deckent_recover']) {
      expect(isSprintScopedDestructive(t)).toBe(true);
    }
  });
  it('plan / sync / status are NOT (TTL only, no sprint binding)', () => {
    for (const t of ['deckent_plan', 'deckent_sync', 'deckent_status']) {
      expect(isSprintScopedDestructive(t)).toBe(false);
    }
  });
});

describe('checkExecutable (TTL + sprint-binding re-verify)', () => {
  const base = {
    id: 'a1', tool: 'deckent_kill', args: {}, channelId: '1',
    parkedAt: '2026-06-05T10:00:00.000Z',
    expiresAt: '2026-06-05T11:00:00.000Z',
    boundSprintId: 'sprint-232',
  };

  it('within TTL + bound sprint still active → ok', () => {
    const r = checkExecutable(base, { now: Date.parse('2026-06-05T10:30:00Z'), currentSprintId: 'sprint-232' });
    expect(r.ok).toBe(true);
  });

  it('🔴 expired → refused (backlog-replay / forgotten approval)', () => {
    const r = checkExecutable(base, { now: Date.parse('2026-06-05T12:00:00Z'), currentSprintId: 'sprint-232' });
    expect(r).toEqual({ ok: false, reason: 'expired' });
  });

  it('🔴 bound sprint no longer active (different sprint) → refused (the wrong-kill scenario)', () => {
    const r = checkExecutable(base, { now: Date.parse('2026-06-05T10:30:00Z'), currentSprintId: 'sprint-233' });
    expect(r).toEqual({ ok: false, reason: 'sprint-changed' });
  });

  it('🔴 bound sprint but NOTHING active now (user killed it manually) → refused', () => {
    const r = checkExecutable(base, { now: Date.parse('2026-06-05T10:30:00Z'), currentSprintId: null });
    expect(r).toEqual({ ok: false, reason: 'sprint-changed' });
  });

  it('unbound action (e.g. plan) → only TTL matters, sprint id ignored', () => {
    const unbound = { ...base, tool: 'deckent_plan', boundSprintId: undefined };
    const r = checkExecutable(unbound, { now: Date.parse('2026-06-05T10:30:00Z'), currentSprintId: 'sprint-999' });
    expect(r.ok).toBe(true);
  });
});
