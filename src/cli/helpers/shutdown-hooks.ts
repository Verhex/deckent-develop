/**
 * Shutdown Hooks — the generalized home of born-549's REPL teardown registry.
 *
 * WHY THIS MODULE EXISTS (born-496 B1 live finding): entry.ts registers its
 * SIGINT/SIGTERM handler at module top-level — before any commander action
 * runs — and that handler ends in a synchronous `process.exit(0)`. Node fires
 * same-signal listeners in registration order, so every `process.on(SIGINT/…)`
 * a command registered later (serve, nervous, chat, flow, heartbeat, dashboard
 * — the 6-member dead-listener class, born-587) has NEVER run on a real
 * signal. The sanctioned path is this registry: long-running commands register
 * async cleanup here, and entry.ts's `onSignal` AWAITS it (bounded) before its
 * sprint/tmux cleanup + exit.
 *
 * Placed in helpers/ (not entry.ts) so commands can import it without an
 * import cycle: commands ← helpers, entry ← helpers.
 *
 * Contract:
 * - Hooks MUST be idempotent: a second signal arriving while the first run is
 *   awaited re-enters `onSignal` and re-runs the registry. There is
 *   deliberately NO once-guard — the direct-call seam in
 *   tests/cli/sigterm-cleanup.test.ts invokes `onSignal` repeatedly on one
 *   module instance, and idempotent hooks make reentry harmless.
 * - Hooks are signal-agnostic: no per-signal logic here. entry.ts stays the
 *   single signal owner (including the win32 SIGTERM→SIGBREAK swap, born-549).
 * - The run is collectively bounded ({@link SHUTDOWN_HOOKS_TIMEOUT_MS}) and
 *   never rejects — shutdown must not hang on one slow hook, but a graceful
 *   child exit (e.g. MCP stdio close ~2s+2s escalation) is worth waiting out.
 */

export type ShutdownHook = () => Promise<void>;

const hooks: ShutdownHook[] = [];

/**
 * Bound the WHOLE registered-hook run, not each hook individually (see the
 * MCP stdio close() escalation timing in the module doc). Mirrors the bound
 * used by repl/run.tsx's own normal-exit path.
 */
export const SHUTDOWN_HOOKS_TIMEOUT_MS = 5000;

/**
 * Register async cleanup to run before signal-exit (REPL warm-child kill, MCP
 * broker dispose, terminal restore, serve daemon-handshake clear + close…).
 * Returns an unregister function so a command that exits normally (no signal
 * involved) does not leave a stale hook behind in the same process.
 */
export function registerShutdownHook(hook: ShutdownHook): () => void {
  hooks.push(hook);
  return () => {
    const idx = hooks.indexOf(hook);
    if (idx >= 0) hooks.splice(idx, 1);
  };
}

/**
 * Synchronous emptiness probe — `onSignal`'s no-hook fast-path contract
 * depends on it: with an empty registry `onSignal` must execute NO await and
 * stay byte-identical to its historical synchronous implementation
 * (tests/cli/sigterm-cleanup.test.ts pins this).
 */
export function hasShutdownHooks(): boolean {
  return hooks.length > 0;
}

/** Run every registered hook to settlement (never rejects), bounded overall. */
export async function runShutdownHooks(): Promise<void> {
  const settled = Promise.allSettled(hooks.map((hook) => hook()));
  const timeout = new Promise<void>((resolve) => {
    setTimeout(resolve, SHUTDOWN_HOOKS_TIMEOUT_MS).unref();
  });
  await Promise.race([settled, timeout]);
}
