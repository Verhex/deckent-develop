/**
 * BOT-003 slice 2 — bot agentic safety core (§4G).
 *
 * The dispatcher is the UNIVERSAL chokepoint: all three runChatNativeLoop tool
 * paths (model tool_use, slash, agenticDispatch) call dispatcher.dispatch — and
 * model-driven tool_use is NOT confirm-gated by the loop (chat-native.ts:671).
 * So safety lives in ONE place: the gated dispatcher. Read-only tools auto-run;
 * risky tools PARK an approval (informed: tool + args + id) and DO NOT execute.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  isRiskyBotTool,
  makeGatedDispatcher,
  DECKENT_BOT_SYSTEM_PROMPT,
} from '../../src/connectors/bot-agentic.js';
import type { McpToolDispatcher } from '../../src/cli/commands/chat-native.js';

describe('isRiskyBotTool', () => {
  it('read-only tools are safe (auto-exec)', () => {
    for (const t of ['deckent_status', 'deckent_history', 'deckent_retro', 'deckent_memory_query']) {
      expect(isRiskyBotTool(t)).toBe(false);
    }
  });
  it('state-changing / destructive tools are risky (gated)', () => {
    for (const t of ['deckent_plan', 'deckent_kill', 'deckent_cleanup', 'deckent_recover']) {
      expect(isRiskyBotTool(t)).toBe(true);
    }
  });
  it('unknown tools default to risky (fail-safe)', () => {
    expect(isRiskyBotTool('deckent_bash')).toBe(true);
    expect(isRiskyBotTool('something_new')).toBe(true);
  });
});

describe('makeGatedDispatcher', () => {
  const inner: McpToolDispatcher = { dispatch: vi.fn(async (name: string) => `[ran] ${name}`) };

  it('safe tool → inner.dispatch executes, result returned', async () => {
    const innerSpy: McpToolDispatcher = { dispatch: vi.fn(async () => 'STATUS OUTPUT') };
    const park = vi.fn(() => 'id-x');
    const gated = makeGatedDispatcher({ inner: innerSpy, park });
    const out = await gated.dispatch('deckent_status', {});
    expect(innerSpy.dispatch).toHaveBeenCalledWith('deckent_status', {});
    expect(out).toBe('STATUS OUTPUT');
    expect(park).not.toHaveBeenCalled();
  });

  it('🔴 risky tool → inner NOT called; parks with {tool,args}; returns informed NOT-EXECUTED + approve <id>', async () => {
    const innerSpy: McpToolDispatcher = { dispatch: vi.fn(async () => 'SHOULD NOT RUN') };
    const park = vi.fn(() => 'act-42');
    const gated = makeGatedDispatcher({ inner: innerSpy, park });
    const out = await gated.dispatch('deckent_plan', { directive: 'Sprint 300' });

    expect(innerSpy.dispatch).not.toHaveBeenCalled();          // nothing executed
    expect(park).toHaveBeenCalledWith('deckent_plan', { directive: 'Sprint 300' });
    // load-bearing tool_result (advisor: the model must not claim it ran)
    expect(out).toMatch(/not executed|çalıştırılmadı/i);
    expect(out).toContain('act-42');
    expect(out).toMatch(/approve/i);
    expect(out).toContain('deckent_plan');
  });

  it('a throwing inner dispatch is surfaced as a tagged string, never thrown (loop stays alive)', async () => {
    const innerSpy: McpToolDispatcher = { dispatch: vi.fn(async () => { throw new Error('boom'); }) };
    const gated = makeGatedDispatcher({ inner: innerSpy, park: () => 'x' });
    const out = await gated.dispatch('deckent_status', {});
    expect(out).toMatch(/error|hata/i);
  });
});

describe('DECKENT_BOT_SYSTEM_PROMPT', () => {
  it('advertises CLI sprint tools, NOT raw shell/file (no RCE surface)', () => {
    expect(DECKENT_BOT_SYSTEM_PROMPT).toContain('deckent_status');
    expect(DECKENT_BOT_SYSTEM_PROMPT).toContain('<deckent_tool>');
    expect(DECKENT_BOT_SYSTEM_PROMPT).not.toContain('deckent_bash');
    expect(DECKENT_BOT_SYSTEM_PROMPT).not.toContain('deckent_write_file');
  });
});
