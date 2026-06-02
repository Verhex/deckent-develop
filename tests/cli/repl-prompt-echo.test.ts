import { describe, it, expect, vi } from 'vitest';
import {
  runChatNativeLoop,
  type ChatProviderAdapter,
  type McpToolDispatcher,
  type ProviderResponse,
} from '../../src/cli/commands/chat-native.js';

// Sprint 224 T-224-002 — prompt double-print guard.
// On an interactive TTY, the terminal-mode readline (224-001) already echoes
// the typed line, so the loop must NOT also emit `renderUserMessage(› line)`
// (would double-print). On a pipe (no readline echo) the `› line` echo is kept.

async function* lines(...items: string[]): AsyncIterable<string> {
  for (const item of items) yield item;
}

function endTurnProvider(text: string): ChatProviderAdapter {
  const resp: ProviderResponse = { text, stopReason: 'end_turn' };
  return { send: vi.fn(async () => resp) };
}

const noopDispatcher: McpToolDispatcher = { dispatch: vi.fn(async () => 'tool-ok') };

function collect(): { output: (s: string) => void; joined: () => string } {
  const buf: string[] = [];
  return { output: (s) => { buf.push(s); }, joined: () => buf.join('\n') };
}

describe('runChatNativeLoop — interactive-TTY echo guard (T-224-002)', () => {
  it('interactiveTty: true → does NOT re-echo the user line (no double print)', async () => {
    const { output, joined } = collect();
    await runChatNativeLoop({
      provider: endTurnProvider('cevap'),
      dispatcher: noopDispatcher,
      input: lines('selam'),
      output,
      layoutEnabled: true,
      interactiveTty: true,
    });
    // The `› selam` user-echo must be absent (readline already showed it).
    expect(joined()).not.toContain('› selam');
  });

  it('interactiveTty: true → still emits the assistant header', async () => {
    const { output, joined } = collect();
    await runChatNativeLoop({
      provider: endTurnProvider('cevap'),
      dispatcher: noopDispatcher,
      input: lines('selam'),
      output,
      layoutEnabled: true,
      interactiveTty: true,
    });
    expect(joined()).toContain('deckent'); // renderAssistantHeader → "● deckent"
    expect(joined()).toContain('cevap');   // the reply body
  });

  it('non-TTY (interactiveTty omitted) → KEEPS the `› line` echo (pipe contract)', async () => {
    const { output, joined } = collect();
    await runChatNativeLoop({
      provider: endTurnProvider('cevap'),
      dispatcher: noopDispatcher,
      input: lines('selam'),
      output,
      layoutEnabled: true,
    });
    expect(joined()).toContain('› selam');
  });

  it('layout off → no chrome regardless of interactiveTty', async () => {
    const { output, joined } = collect();
    await runChatNativeLoop({
      provider: endTurnProvider('cevap'),
      dispatcher: noopDispatcher,
      input: lines('selam'),
      output,
      interactiveTty: true,
    });
    expect(joined()).not.toContain('› selam');
    expect(joined()).not.toContain('● deckent');
  });
});
