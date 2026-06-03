// ═══ provider-switch — runtime model/provider switching for the REPL ═════════
//
// The chat loop captures ONE provider for its whole lifetime. To switch model
// or provider mid-session without restarting the loop, we hand it a stable
// PROXY whose calls delegate to the CURRENT underlying adapter. `switchTo()`
// tears down the old adapter (best-effort) and builds a new one — the next turn
// the loop runs transparently uses it. Pure + injectable → unit-testable.

import type { ChatProviderAdapter } from '../commands/chat-native.js';

/** What is currently active — shown in the status bar. */
export interface ActiveSelection {
  provider: string;
  /** Model id, or null when the provider uses its own default. */
  model: string | null;
}

export interface SwitchableProvider {
  /** The stable adapter to hand the chat loop (delegates to the current one). */
  readonly proxy: ChatProviderAdapter;
  /** Current selection (provider + model). */
  current(): ActiveSelection;
  /** Switch provider and/or model; tears down the previous adapter. */
  switchTo(sel: Partial<ActiveSelection>): void;
  /** Tear down the active adapter (REPL exit). */
  exit(): Promise<void>;
}

/** A minimal session that may expose an async `exit()` (persistent claude). */
type MaybeSession = ChatProviderAdapter & { exit?: () => unknown };

/**
 * Build a switchable provider around a `rebuild(selection)` factory.
 *
 * @param initial  Starting selection (provider + model).
 * @param rebuild  Builds a fresh adapter for a selection (e.g. buildReplProvider).
 */
export function createSwitchableProvider(
  initial: ActiveSelection,
  rebuild: (sel: ActiveSelection) => ChatProviderAdapter,
  initialAdapter?: ChatProviderAdapter,
): SwitchableProvider {
  let selection: ActiveSelection = { ...initial };
  // Reuse an already-built adapter for the initial selection (e.g. the warm
  // claude session built at REPL boot) instead of spawning a second one.
  let active: MaybeSession = (initialAdapter ?? rebuild(selection)) as MaybeSession;

  const teardown = async (a: MaybeSession): Promise<void> => {
    if (typeof a.exit === 'function') {
      try { await Promise.resolve(a.exit()); } catch { /* best-effort */ }
    }
  };

  const proxy: ChatProviderAdapter = {
    send: (messages) => active.send(messages),
    // Always expose stream(): delegate to the active adapter's stream when it
    // has one (claude), else wrap its send() as a single terminal chunk so a
    // non-streaming provider (codex/gemini per-turn) still works through the proxy.
    stream: (messages) => {
      if (active.stream) return active.stream(messages);
      return (async function* () {
        const r = await active.send(messages);
        yield { text: r.text ?? '', done: r };
      })();
    },
  };

  return {
    proxy,
    current: () => ({ ...selection }),
    switchTo(sel) {
      const next: ActiveSelection = {
        provider: sel.provider ?? selection.provider,
        model: sel.model !== undefined ? sel.model : selection.model,
      };
      const prev = active;
      active = rebuild(next) as MaybeSession;
      selection = next;
      void teardown(prev); // fire-and-forget; the new adapter is already live
    },
    exit: () => teardown(active),
  };
}
