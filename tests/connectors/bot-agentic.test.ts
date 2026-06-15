/**
 * BOT-003 slice 2 — bot agentic safety core (§4G).
 *
 * The dispatcher is the UNIVERSAL chokepoint: all three runChatNativeLoop tool
 * paths (model tool_use, slash, agenticDispatch) call dispatcher.dispatch — and
 * model-driven tool_use is NOT confirm-gated by the loop (chat-native.ts:671).
 * So safety lives in ONE place: the gated dispatcher. Read-only tools auto-run;
 * risky tools PARK an approval (informed: tool + args + id) and DO NOT execute.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  isRiskyBotTool,
  makeGatedDispatcher,
  hasRealPendingCheckpoint,
  DECKENT_BOT_SYSTEM_PROMPT,
  buildBotSystemPrompt,
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

// ─── Sprint 238 İŞ3 — spurious checkpoint false-alarm guard ──────────────────
describe('makeGatedDispatcher — deckent_checkpoint false-alarm guard', () => {
  const inner: McpToolDispatcher = { dispatch: vi.fn(async (n: string) => `[ran] ${n}`) };

  it('answers benignly (no park) when NO checkpoint is pending', async () => {
    const park = vi.fn(() => 'PARK-ID');
    const innerSpy: McpToolDispatcher = { dispatch: vi.fn(async () => '[ran]') };
    const gated = makeGatedDispatcher({ inner: innerSpy, park, hasPendingCheckpoint: () => false });

    const out = await gated.dispatch('deckent_checkpoint', {});
    expect(out).toMatch(/not blocked|bloke değil/i);
    expect(out).not.toMatch(/APPROVAL REQUIRED|ONAY GEREKLİ/i);
    expect(park).not.toHaveBeenCalled();           // no false alarm
    expect(innerSpy.dispatch).not.toHaveBeenCalled(); // and no state change
  });

  it('still PARKS deckent_checkpoint when a checkpoint IS pending (gate preserved)', async () => {
    const park = vi.fn(() => 'PARK-ID');
    const gated = makeGatedDispatcher({ inner, park, hasPendingCheckpoint: () => true });

    const out = await gated.dispatch('deckent_checkpoint', { action: 'approve' });
    expect(out).toMatch(/APPROVAL REQUIRED|ONAY GEREKLİ/i);
    expect(park).toHaveBeenCalledWith('deckent_checkpoint', { action: 'approve' });
  });

  it('without a hasPendingCheckpoint probe, parks as before (backward compatible)', async () => {
    const park = vi.fn(() => 'PARK-ID');
    const gated = makeGatedDispatcher({ inner, park });

    const out = await gated.dispatch('deckent_checkpoint', {});
    expect(out).toMatch(/APPROVAL REQUIRED/i);
    expect(park).toHaveBeenCalled();
  });

  it('the guard is checkpoint-specific — other risky tools are still parked', async () => {
    const park = vi.fn(() => 'PARK-ID');
    const gated = makeGatedDispatcher({ inner, park, hasPendingCheckpoint: () => false });

    const out = await gated.dispatch('deckent_kill', { target: 'all' });
    expect(out).toMatch(/APPROVAL REQUIRED/i);
    expect(park).toHaveBeenCalledWith('deckent_kill', { target: 'all' });
  });

  it('emits the benign message in Turkish when lang=tr', async () => {
    const gated = makeGatedDispatcher({
      inner, park: () => 'x', hasPendingCheckpoint: () => false, lang: 'tr',
    });
    const out = await gated.dispatch('deckent_checkpoint', {});
    expect(out).toContain('bloke değil');
  });
});

describe('hasRealPendingCheckpoint', () => {
  let root: string;

  beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'cp-pending-')); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  function writeCheckpoint(name: string, status: string): void {
    const dir = join(root, '.deckent', 'checkpoints');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, name), JSON.stringify({ phase: 'PLAN', summary: 's', status, createdAt: '' }), 'utf-8');
  }

  it('returns false when the checkpoints dir does not exist', () => {
    expect(hasRealPendingCheckpoint(root)).toBe(false);
  });

  it('returns true when a checkpoint file has status pending', () => {
    writeCheckpoint('checkpoint-sprint-238-PLAN.json', 'pending');
    expect(hasRealPendingCheckpoint(root)).toBe(true);
  });

  it('returns false when all checkpoints are approved/rejected (none pending)', () => {
    writeCheckpoint('checkpoint-sprint-238-PLAN.json', 'approved');
    writeCheckpoint('checkpoint-sprint-238-SPAWN.json', 'rejected');
    expect(hasRealPendingCheckpoint(root)).toBe(false);
  });

  it('skips malformed checkpoint files without throwing', () => {
    const dir = join(root, '.deckent', 'checkpoints');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'checkpoint-x-PLAN.json'), '{not json', 'utf-8');
    expect(hasRealPendingCheckpoint(root)).toBe(false);
  });
});

describe('buildBotSystemPrompt — conversational grounding (bot chat quality fix)', () => {
  let root: string;
  beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'botprompt-')); });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('no root → returns the bare tool prompt (back-compat)', () => {
    expect(buildBotSystemPrompt()).toBe(DECKENT_BOT_SYSTEM_PROMPT);
  });

  it('injects the live project context (summary.md) so answers are grounded, not hollow', () => {
    mkdirSync(join(root, '.brain', 'exports'), { recursive: true });
    writeFileSync(
      join(root, '.brain', 'exports', 'summary.md'),
      '# Brain Summary\nadr-088 Memory V2 DB-First — accepted\nSPRINT_MARKER_42',
      'utf-8',
    );
    const prompt = buildBotSystemPrompt(root);
    expect(prompt).toContain(DECKENT_BOT_SYSTEM_PROMPT); // keeps the tool directives
    expect(prompt).toContain('SPRINT_MARKER_42');        // grounds in real project context
    expect(prompt).toContain('Proje Bağlamı');           // the grounding section header
  });

  it('summary absent → still returns a non-empty grounded prompt (fail-safe, never throws)', () => {
    const prompt = buildBotSystemPrompt(root);
    expect(prompt).toContain(DECKENT_BOT_SYSTEM_PROMPT);
    expect(prompt.length).toBeGreaterThan(DECKENT_BOT_SYSTEM_PROMPT.length);
  });

  it('bounds a huge summary so the system prompt never blows up', () => {
    mkdirSync(join(root, '.brain', 'exports'), { recursive: true });
    writeFileSync(join(root, '.brain', 'exports', 'summary.md'), 'x'.repeat(20000), 'utf-8');
    const prompt = buildBotSystemPrompt(root);
    expect(prompt).toContain('kısaltıldı');
    expect(prompt.length).toBeLessThan(8000);
  });
});
