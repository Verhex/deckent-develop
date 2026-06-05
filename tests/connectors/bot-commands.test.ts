/**
 * BOT-003 slice 2c — curated bot command surface (§4G).
 *
 * The bot has its OWN small command surface (its phone UI), NOT the full CLI.
 * Every '/'-prefixed message is intercepted at the bot layer so the chat engine's
 * 30-command CLI slash registry never leaks. Curated slashes are READ-ONLY +
 * bot-native ONLY (/help /status /history /pending) — state-change has exactly one
 * path: natural language → gated dispatcher → approve <id> (no slash bypass).
 */

import { describe, it, expect, vi } from 'vitest';
import {
  isBotSlash,
  parseBotSlash,
  handleBotSlash,
  renderBotHelp,
  BOT_COMMAND_NAMES,
} from '../../src/connectors/bot-commands.js';
import type { McpToolDispatcher } from '../../src/cli/commands/chat-native.js';

describe('parseBotSlash / isBotSlash', () => {
  it('detects and normalizes a slash command (trim + lowercase verb)', () => {
    expect(isBotSlash('  /Status  ')).toBe(true);
    expect(parseBotSlash('  /STATUS  ')).toEqual({ name: '/status', args: '' });
    expect(parseBotSlash('/recall docker logs')).toEqual({ name: '/recall', args: 'docker logs' });
  });
  it('non-slash text is not a bot slash', () => {
    expect(isBotSlash('how is the sprint')).toBe(false);
    expect(parseBotSlash('hello')).toBeNull();
  });
  it('a bare slash is still slash territory (handled, not leaked)', () => {
    expect(isBotSlash('/')).toBe(true);
  });
});

describe('renderBotHelp — curated bot surface, NOT the CLI', () => {
  it('lists bot read-only commands + approve/reject + the natural-language hint', () => {
    const help = renderBotHelp('en');
    expect(help).toContain('/status');
    expect(help).toContain('/pending');
    expect(help.toLowerCase()).toContain('approve');
    expect(help.toLowerCase()).toContain('reject');
  });
  it('does NOT leak destructive CLI slashes', () => {
    const help = renderBotHelp('tr') + renderBotHelp('en');
    for (const leaked of ['/plan', '/kill', '/cleanup', '/recover', '/sync', '/config', '/provider']) {
      expect(help).not.toContain(leaked);
    }
  });
  it('every advertised tool-backed command is READ-ONLY (no gate bypass)', async () => {
    // Build the surface and assert none maps to a risky tool.
    const { isRiskyBotTool } = await import('../../src/connectors/bot-agentic.js');
    const dispatched: string[] = [];
    const spy: McpToolDispatcher = { dispatch: async (n) => { dispatched.push(n); return 'ok'; } };
    for (const name of BOT_COMMAND_NAMES) {
      await handleBotSlash(name, { root: '/none', lang: 'en', readOnlyDispatcher: spy });
    }
    for (const tool of dispatched) expect(isRiskyBotTool(tool)).toBe(false);
  });
});

describe('handleBotSlash', () => {
  const spy: McpToolDispatcher = { dispatch: vi.fn(async () => 'STATUS: sprint-232 done') };

  it('/help → curated help (no dispatcher call)', async () => {
    const d = vi.fn(async () => 'x');
    const out = await handleBotSlash('/help', { root: '/r', lang: 'en', readOnlyDispatcher: { dispatch: d } });
    expect(out).toContain('/status');
    expect(d).not.toHaveBeenCalled();
  });

  it('/status → maps to read-only deckent_status', async () => {
    const dispatch = vi.fn(async () => 'STATUS OUT');
    const out = await handleBotSlash('/status', { root: '/r', lang: 'en', readOnlyDispatcher: { dispatch } });
    expect(dispatch).toHaveBeenCalledWith('deckent_status', {});
    expect(out).toContain('STATUS OUT');
  });

  it('unknown slash → default-deny guidance, never falls through to CLI/chat', async () => {
    const dispatch = vi.fn(async () => 'NOPE');
    const out = await handleBotSlash('/kill', { root: '/r', lang: 'en', readOnlyDispatcher: { dispatch } });
    expect(dispatch).not.toHaveBeenCalled();         // /kill is NOT a bot command
    expect(out.toLowerCase()).toMatch(/unknown|bilinmeyen|\/help/);
  });

  it('/pending with no parked actions → friendly empty message', async () => {
    const out = await handleBotSlash('/pending', { root: '/nonexistent-root', lang: 'en', readOnlyDispatcher: spy });
    expect(out.length).toBeGreaterThan(0);
  });

  it('/pending lists parked actions with their ids', async () => {
    const { mkdtempSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const { parkBotAction } = await import('../../src/connectors/bot-action-store.js');
    const root = mkdtempSync(join(tmpdir(), 'botcmd-'));
    try {
      const id = parkBotAction(root, { tool: 'deckent_plan', args: {}, channelId: '555' });
      const out = await handleBotSlash('/pending', { root, lang: 'en', readOnlyDispatcher: spy });
      expect(out).toContain(id);
      expect(out).toContain('deckent_plan');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
