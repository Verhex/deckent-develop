// src/cli/helpers/terminal-surface.ts
// ═══ TERMINAL-TOOLS-003 — Terminal surface admission (capability-gated) ═════
//
// ONE pure decision for which REPL surface the boot path (entry.ts
// launchDefaultRepl) mounts. `isTTY` alone was the old admission: it mounted
// the Ink surface (cursor movement, erase-line, box drawing) on `TERM=dumb`,
// which cannot honor any of it (real-binary evidence, 2026-09-02). Terminal
// design contract: admit the rich surface only when the required raw-input
// and rendering capabilities are available; otherwise degrade HONESTLY to a
// line-oriented surface — never silently, never "TTY therefore rich".
//
// Surfaces (one product surface, three runtime modes — not UI modes):
//   ink      — interactive TTY, capable TERM: Ink composer, menus, live cards.
//   readline — interactive TTY, owner opt-out (DECKENT_INK=0): node:readline
//              line editing + the pinned prompt region (cursor control).
//   line     — pipe/redirect, or a dumb terminal: deterministic line I/O,
//              no cursor control, no color unless FORCE_COLOR says so.
//
// Windows note (Law #2): a missing TERM is normal on native consoles (ConPTY
// speaks VT), so only an EXPLICIT `dumb` demotes; legacy consoles without VT
// are reported through the same reason code when Node exposes them as such.

import { isDumbTerminal } from './theme.js';

export type TerminalSurface = 'ink' | 'readline' | 'line';
export type TerminalSurfaceReason = 'interactive-tty' | 'ink-opt-out' | 'dumb-terminal' | 'not-a-tty';

export interface TerminalSurfaceInput {
  stdinIsTTY: boolean;
  stdoutIsTTY: boolean;
  /** `process.env.TERM` (undefined when unset). */
  term: string | undefined;
  /** `process.env.DECKENT_INK` — only the literal '0' opts out of Ink. */
  inkFlag: string | undefined;
}

export interface TerminalSurfaceDecision {
  surface: TerminalSurface;
  reason: TerminalSurfaceReason;
  /** True for the two cursor-controlling surfaces (ink, readline). */
  interactive: boolean;
}

export function resolveTerminalSurface(input: TerminalSurfaceInput): TerminalSurfaceDecision {
  if (!input.stdinIsTTY || !input.stdoutIsTTY) {
    return { surface: 'line', reason: 'not-a-tty', interactive: false };
  }
  if (isDumbTerminal(input.term)) {
    return { surface: 'line', reason: 'dumb-terminal', interactive: false };
  }
  if (input.inkFlag === '0') {
    return { surface: 'readline', reason: 'ink-opt-out', interactive: true };
  }
  return { surface: 'ink', reason: 'interactive-tty', interactive: true };
}

/** Read the decision inputs from the live process (the only impure seam). */
export function resolveTerminalSurfaceFromProcess(): TerminalSurfaceDecision {
  return resolveTerminalSurface({
    stdinIsTTY: process.stdin.isTTY === true,
    stdoutIsTTY: process.stdout.isTTY === true,
    term: process.env['TERM'],
    inkFlag: process.env['DECKENT_INK'],
  });
}

// ─── Ink color gate ──────────────────────────────────────────────────────────
//
// Ink colors through chalk, and chalk resolves its level from the environment
// ONCE at module load (supports-color 7: FORCE_COLOR > --no-color > TERM=dumb
// > TTY — it does NOT read NO_COLOR). The project's color SSOT is
// helpers/theme.ts (`--no-color` > FORCE_COLOR > NO_COLOR > TTY). The only
// honest way to make Ink obey that gate without a chalk dependency of our own
// is to project the SSOT verdict onto the one knob chalk reads — FORCE_COLOR=0
// — BEFORE the Ink module is loaded (entry.ts imports it dynamically after
// admission). An explicit user FORCE_COLOR is never overridden: theme.ts
// already ranks it above NO_COLOR, so `suppressed` is false in that case.

export interface InkColorEnvInput {
  /** helpers/theme.ts isColorSuppressed() verdict. */
  suppressed: boolean;
  env: Readonly<Record<string, string | undefined>>;
}

/** The env patch to apply before loading Ink ({} = nothing to do). */
export function resolveInkColorEnv(input: InkColorEnvInput): Record<string, string> {
  if (!input.suppressed) return {};
  if (input.env['FORCE_COLOR'] !== undefined) return {};
  return { FORCE_COLOR: '0' };
}

/** Apply {@link resolveInkColorEnv} to the live process environment. */
export function applyInkColorGate(suppressed: boolean): Record<string, string> {
  const patch = resolveInkColorEnv({ suppressed, env: process.env });
  for (const [key, value] of Object.entries(patch)) process.env[key] = value;
  return patch;
}
