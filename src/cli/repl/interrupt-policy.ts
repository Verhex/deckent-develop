// src/cli/repl/interrupt-policy.ts
// ═══ TERMINAL-TOOLS-006 — Ctrl-C / Ctrl-D policy for the Ink composer ═══════
//
// Ink's default `exitOnCtrlC` tore the whole session down on ONE Ctrl-C —
// draft, transcript and the warm provider child gone — even with a half-typed
// message in the composer (real-binary evidence, 2026-09-02). Terminal design
// rule: cancel/interrupt shortcuts state their exact target, and a
// destructive outcome needs a deliberate repeat.
//
// Decision (pure, string-free — the caller renders the catalog hint):
//   Ctrl-D on an empty composer  → exit at once (readline EOF convention).
//   Ctrl-C, armed within window  → exit (the user asked twice).
//   Ctrl-C with a draft          → clear-draft, arm.
//   Ctrl-C while a turn runs     → interrupt-turn (busy-controls), arm.
//   Ctrl-C idle + empty          → arm-exit.
// Each arming decision carries `armedAt`; the caller stores it and shows the
// hint for the window ("… Ctrl-C again to exit"). A real SIGINT from outside
// (kill -INT) never reaches this policy — raw mode disables ISIG, and the
// process-level handler in entry.ts owns external signals.

export type CtrlCSignal = 'int' | 'eof';

export interface CtrlCInput {
  signal: CtrlCSignal;
  /** The composer held text when the key arrived (InputBar reports it before clearing). */
  draftNonEmpty: boolean;
  /** A turn is in flight (app.tsx `working`). */
  working: boolean;
  /** Timestamp of the last arming Ctrl-C, or null. */
  armedAt: number | null;
  now: number;
  /** Second-press window; defaults to CTRL_C_EXIT_WINDOW_MS. */
  windowMs?: number;
}

export type CtrlCDecision =
  | { kind: 'exit' }
  | { kind: 'clear-draft'; armedAt: number }
  | { kind: 'interrupt-turn'; armedAt: number }
  | { kind: 'arm-exit'; armedAt: number };

export const CTRL_C_EXIT_WINDOW_MS = 2000;

export function resolveCtrlC(input: CtrlCInput): CtrlCDecision {
  if (input.signal === 'eof') return { kind: 'exit' };
  const windowMs = input.windowMs ?? CTRL_C_EXIT_WINDOW_MS;
  if (input.armedAt !== null && input.now - input.armedAt <= windowMs) return { kind: 'exit' };
  if (input.draftNonEmpty) return { kind: 'clear-draft', armedAt: input.now };
  if (input.working) return { kind: 'interrupt-turn', armedAt: input.now };
  return { kind: 'arm-exit', armedAt: input.now };
}
