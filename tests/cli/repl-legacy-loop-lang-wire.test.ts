// tests/cli/repl-legacy-loop-lang-wire.test.ts
// TERMINAL-TOOLS-001 — legacy (readline / pipe) REPL loop language wire.
//
// Real-binary evidence (2026-09-02, refreshed pipe proof): with the slash
// catalog now language-resolved, `printf '/help\n' | deckent` in a
// `language: tr` project printed an ENGLISH "Commands:" list under a Turkish
// health line, because entry.ts's legacy runChatNativeLoop({...}) call never
// passed `lang` and the loop defaults to 'en' (chat-native.ts). Before the
// closure the Turkish text was hardcoded, which hid this missing wire.
//
// Contract: the legacy loop receives the same project-language source the
// banner, health line and `/` menu use (getLangFromConfig), and the loop
// itself localizes /help for that language. Same source-regex wire pattern
// as repl-banner-wire.test.ts plus a real runChatNativeLoop behaviour case.

import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { runChatNativeLoop, type ChatProviderAdapter, type McpToolDispatcher } from '../../src/cli/commands/chat-native.js';
import { getMessage } from '../../src/cli/helpers/messages.js';

const ENTRY_SRC = readFileSync('src/cli/entry.ts', 'utf-8');

async function* lines(...items: string[]): AsyncIterable<string> {
  for (const item of items) yield item;
}

describe('repl-legacy-loop-lang-wire — entry.ts hands the project language to runChatNativeLoop', () => {
  it('the legacy loop call in entry.ts carries `lang` resolved from the project config', () => {
    // The bare-`deckent` legacy path: `await runChatNativeLoop({ ... })` in
    // launchDefaultRepl must include a `lang:` option sourced from
    // getLangFromConfig (the banner/health-line/menu language authority).
    // TERMINAL-TOOLS-002: the language is resolved ONCE per boot (`replLang`)
    // from getLangFromConfig and handed to every line the path emits.
    expect(ENTRY_SRC).toMatch(/const replLang = getLangFromConfig\(healthRoot\);/);
    expect(ENTRY_SRC).toMatch(/await runChatNativeLoop\(\{[\s\S]*?lang:\s*replLang,/);
  });
});

describe('repl-legacy-loop-lang-wire — runChatNativeLoop localizes /help for the injected language', () => {
  const provider: ChatProviderAdapter = { send: vi.fn(async () => { throw new Error('provider must not be called for /help'); }) };
  const dispatcher: McpToolDispatcher = { dispatch: vi.fn(async () => 'unused') };

  it('lang: tr → Turkish header and description', async () => {
    const output = vi.fn();
    await runChatNativeLoop({ provider, dispatcher, input: lines('/help'), output, lang: 'tr' });
    const text = output.mock.calls[0]?.[0] as string;
    expect(text.split('\n')[0]).toBe('Komutlar:');
    expect(text).toContain('Kullanılabilir komutları listele');
    expect(text).not.toContain(getMessage('tui.help.commands_header', 'en'));
  });

  it('lang: en → English header and description', async () => {
    const output = vi.fn();
    await runChatNativeLoop({ provider, dispatcher, input: lines('/help'), output, lang: 'en' });
    const text = output.mock.calls[0]?.[0] as string;
    expect(text.split('\n')[0]).toBe(getMessage('tui.help.commands_header', 'en'));
    expect(text).toContain(getMessage('tui.slash.desc.help', 'en'));
    expect(text).not.toContain('Komutlar:');
  });
});
