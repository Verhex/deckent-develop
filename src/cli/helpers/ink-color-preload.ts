// src/cli/helpers/ink-color-preload.ts
// ═══ TERMINAL-TOOLS-003 — color-gate preload (must be entry.ts's FIRST import) ═
//
// chalk (Ink's color engine) resolves its color level from the environment
// ONCE, when its module evaluates — and it evaluates early: static import
// chains reachable from entry.ts pull Ink in long before the REPL branch runs,
// so an env projection made inside launchDefaultRepl() is too late (real-
// binary evidence 2026-09-02: NO_COLOR=1 still produced truecolor SGR from
// Ink). ESM evaluates imports depth-first in source order, so a module that
// is the FIRST import of entry.ts runs before anything that loads chalk.
//
// This module's only dependencies are theme.ts (→ generated/palette.ts) and
// terminal-surface.ts — none of them touch chalk. It projects the project
// color SSOT (theme.ts: --no-color > FORCE_COLOR > NO_COLOR > TTY) onto the
// single knob chalk honors, FORCE_COLOR=0, and only when the user has
// suppressed color and set no FORCE_COLOR themselves (see
// resolveInkColorEnv). Child processes inherit the same verdict.

import { isColorSuppressed } from './theme.js';
import { applyInkColorGate } from './terminal-surface.js';

/** The patch applied at load ({} when nothing was projected) — for diagnostics. */
export const INK_COLOR_PRELOAD_PATCH: Readonly<Record<string, string>> = Object.freeze(
  applyInkColorGate(isColorSuppressed()),
);
