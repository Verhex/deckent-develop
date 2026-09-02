import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  runChatNativeLoop,
  type ChatNativeOptions,
  type ChatProviderAdapter,
  type McpToolDispatcher,
  type ProviderResponse,
} from '../../src/cli/commands/chat-native.js';
import { getVisibleCommands } from "../../src/cli/commands/chat-mode.js";
import { buildSlashRegistry } from "../../src/cli/commands/chat-slash-registry.js";
import { getMessage } from '../../src/cli/helpers/messages.js';

// Sprint 222 T-222-005 — runChatNativeLoop slash-registry wire tests.
//
// Verifies that the slash-registry (buildSlashRegistry + resolveSlash +
// renderHelp from chat-slash-registry.ts) is called from inside the loop so
// /help renders the catalog INSTANTLY (no provider round-trip — was 15.9s)
// and /status, /recall, /sprint dispatch through the MCP dispatcher.
// Caller: src/cli/commands/chat-native.ts (def chat-slash-registry.ts
// excluded from kanıt grep).

async function* lines(...items: string[]): AsyncIterable<string> {
  for (const item of items) yield item;
}

function queuedProvider(responses: ProviderResponse[]): {
  adapter: ChatProviderAdapter;
  sendSpy: ReturnType<typeof vi.fn>;
} {
  const remaining = [...responses];
  const sendSpy = vi.fn(async () => {
    const next = remaining.shift();
    if (!next) throw new Error('queuedProvider: response queue exhausted');
    return next;
  });
  return { adapter: { send: sendSpy }, sendSpy };
}

function fakeDispatcher(canned: string = 'tool-ok'): {
  dispatcher: McpToolDispatcher;
  dispatchSpy: ReturnType<typeof vi.fn>;
} {
  const dispatchSpy = vi.fn(async () => canned);
  return { dispatcher: { dispatch: dispatchSpy }, dispatchSpy };
}

function baseOpts(overrides: Partial<ChatNativeOptions> & {
  provider: ChatProviderAdapter;
  dispatcher: McpToolDispatcher;
  input: AsyncIterable<string>;
}): ChatNativeOptions {
  return {
    output: vi.fn(),
    // Auto-approve risky-confirm so /plan and similar dispatch without stdin.
    agenticConfirm: async () => true,
    ...overrides,
  };
}

describe('runChatNativeLoop — slash-registry wire (T-222-005)', () => {
  it('/help renders the registry list and does NOT call the provider', async () => {
    const { adapter, sendSpy } = queuedProvider([]);
    const { dispatcher, dispatchSpy } = fakeDispatcher();
    const output = vi.fn();

    const transcript = await runChatNativeLoop(baseOpts({
      provider: adapter,
      dispatcher,
      input: lines('/help'),
      output,
    }));

    // Provider untouched; the 15.9s claude round-trip is gone.
    expect(sendSpy).not.toHaveBeenCalled();
    expect(dispatchSpy).not.toHaveBeenCalled();
    // Help line was emitted — must include the header and at least one slash.
    // The loop's language defaults to 'en' (opts.lang omitted), so the header
    // is the English catalog row (TERMINAL-TOOLS-001: the old assertion pinned
    // the hardcoded Turkish 'Komutlar:' that leaked into every en session).
    expect(output).toHaveBeenCalledTimes(1);
    const helpText = output.mock.calls[0]![0] as string;
    expect(helpText).toContain(getMessage('tui.help.commands_header', 'en'));
    expect(helpText).not.toContain('Komutlar:');
    expect(helpText).toContain('/help');
    expect(helpText).toContain('/status');
    // /help is a meta command — no transcript turns recorded.
    expect(transcript).toEqual([]);
  });

  it('/runs (SURF-3 inbox) renders the read-only list and does NOT call the provider', async () => {
    const { adapter, sendSpy } = queuedProvider([]);
    const { dispatcher, dispatchSpy } = fakeDispatcher();
    const output = vi.fn();
    const root = mkdtempSync(join(tmpdir(), 'inbox-loop-'));

    const transcript = await runChatNativeLoop(baseOpts({
      provider: adapter,
      dispatcher,
      input: lines('/runs'),
      output,
      projectRoot: root,
    }));

    // Provider + dispatcher untouched — the inbox is a pure read-only scan.
    expect(sendSpy).not.toHaveBeenCalled();
    expect(dispatchSpy).not.toHaveBeenCalled();
    // Empty project → the honest empty notice (default en).
    expect(output).toHaveBeenCalledTimes(1);
    expect(output.mock.calls[0]![0]).toContain('No runs yet');
    expect(transcript).toEqual([{ role: 'user', content: '/runs' }]);
    rmSync(root, { recursive: true, force: true });
  });

  it('/status dispatches deckent_status through the MCP dispatcher (NOT provider)', async () => {
    const { adapter, sendSpy } = queuedProvider([]);
    const { dispatcher, dispatchSpy } = fakeDispatcher('STATUS=GREEN sprint=222');
    const output = vi.fn();

    const transcript = await runChatNativeLoop(baseOpts({
      provider: adapter,
      dispatcher,
      input: lines('/status'),
      output,
    }));

    expect(sendSpy).not.toHaveBeenCalled();
    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    expect(dispatchSpy).toHaveBeenCalledWith('deckent_status', { root: '.' });
    expect(output).toHaveBeenCalledWith('STATUS=GREEN sprint=222');
    expect(transcript).toEqual([
      { role: 'user', content: '/status' },
      { role: 'assistant', content: 'STATUS=GREEN sprint=222' },
    ]);
  });

  it('unknown slash /foobar falls through to the provider (not swallowed)', async () => {
    const { adapter, sendSpy } = queuedProvider([
      { text: 'I do not know /foobar', stopReason: 'end_turn' },
    ]);
    const { dispatcher, dispatchSpy } = fakeDispatcher();
    const output = vi.fn();

    const transcript = await runChatNativeLoop(baseOpts({
      provider: adapter,
      dispatcher,
      input: lines('/foobar'),
      output,
    }));

    // Unknown slash → resolveSlash returns 'none' → normal provider path.
    expect(dispatchSpy).not.toHaveBeenCalled();
    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(transcript).toEqual([
      { role: 'user', content: '/foobar' },
      { role: 'assistant', content: 'I do not know /foobar' },
    ]);
  });

  it('/clear still empties the transcript (handleReplCommand path preserved)', async () => {
    // After the wire, /clear MUST still work — handleReplCommand catches it
    // BEFORE resolveSlash gets a chance, so this is a regression guard.
    const { adapter, sendSpy } = queuedProvider([
      { text: 'one', stopReason: 'end_turn' },
      { text: 'two', stopReason: 'end_turn' },
    ]);
    const { dispatcher, dispatchSpy } = fakeDispatcher();
    const output = vi.fn();

    const transcript = await runChatNativeLoop(baseOpts({
      provider: adapter,
      dispatcher,
      input: lines('first', '/clear', 'second'),
      output,
    }));

    expect(dispatchSpy).not.toHaveBeenCalled();
    expect(sendSpy).toHaveBeenCalledTimes(2);
    expect(transcript).toEqual([
      { role: 'user', content: 'second' },
      { role: 'assistant', content: 'two' },
    ]);
  });

  it('/recall <query> extracts trailing words as the deckent_memory_query arg', async () => {
    const { adapter, sendSpy } = queuedProvider([]);
    const { dispatcher, dispatchSpy } = fakeDispatcher('{"found":2}');
    const output = vi.fn();

    await runChatNativeLoop(baseOpts({
      provider: adapter,
      dispatcher,
      input: lines('/recall docker heartbeat'),
      output,
    }));

    expect(sendSpy).not.toHaveBeenCalled();
    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    const [tool, args] = dispatchSpy.mock.calls[0]!;
    expect(tool).toBe('deckent_memory_query');
    expect(args).toEqual({ query: 'docker heartbeat' });
    expect(output).toHaveBeenCalledWith('{"found":2}');
  });
});

// WIRE-016: physically merged from tests/cli/slash-mode-wire.test.ts.
{
// ─── getVisibleCommands — mode-aware /help wire point ───────────────────────
//
// Sprint 357 Task 357-010 (SLASH-MODE-WIRE, G-034 #3). Exercises the REAL live
// catalog (buildSlashRegistry()), not a fixture — this proves the wire between
// the live registry and filterRegistryByMode actually integrates, which the
// existing tests/cli/chat-mode.test.ts (fixture-only) does not cover.
describe('getVisibleCommands — mode-aware /help list from the live catalog', () => {
    it('user mode filters the 4 enterprise slashes out of the live registry', () => {
        const visible = getVisibleCommands('user');
        const names = visible.map((c) => c.name);
        expect(names).not.toContain('/audit');
        expect(names).not.toContain('/rbac');
        expect(names).not.toContain('/flow');
        expect(names).not.toContain('/cost');
    });
    it('enterprise mode returns the full live registry unfiltered', () => {
        const visible = getVisibleCommands('enterprise');
        const full = buildSlashRegistry();
        expect(visible.length).toBe(full.length);
        // Only /audit is wired into the live SLASH_CATALOG today — /rbac, /flow, /cost
        // are reserved enterprise names (ENTERPRISE_SLASH_NAMES in chat-mode.ts) not
        // yet present as live catalog entries. See docImpact note in .result.
        const names = visible.map((c) => c.name);
        expect(names).toContain('/audit');
    });
    it('/help itself is always visible, in both modes', () => {
        expect(getVisibleCommands('user').some((c) => c.name === '/help')).toBe(true);
        expect(getVisibleCommands('enterprise').some((c) => c.name === '/help')).toBe(true);
    });
    it('user-mode result is a strict subset of the enterprise-mode result', () => {
        const userNames = new Set(getVisibleCommands('user').map((c) => c.name));
        const enterpriseNames = new Set(getVisibleCommands('enterprise').map((c) => c.name));
        for (const name of userNames) {
            expect(enterpriseNames.has(name)).toBe(true);
        }
        expect(userNames.size).toBeLessThan(enterpriseNames.size);
    });
});
}
