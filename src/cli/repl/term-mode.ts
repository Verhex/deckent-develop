// ═══ term-mode — Ask / Run / Control 3-mode terminal state machine ═════════
// TERM-MODE, DIRECTIVES.md Task 8 / MASTER-PLAN row 39, §9.4.
//
// Pure state machine — no I/O, no rendering, no registry mutation. A REPL
// surface (explicit follow-up) wires these exports to slash-command dispatch
// and localized output.
//
// Modes:
//   ask     — read-only. Only 'Oku'-risk actions run.
//   run     — plan → approve → run → eval. Read + mutate + execute.
//   control — yönetim (agent/skill/config/autonomous management). Full
//             ladder, including 'Otonom' (continuous-loop control).
//
// Allowed-risk-classes-per-mode are ladder-prefixes of command-registry.ts's
// own documented risk ladder (Oku < Değiştir < Çalıştır < Otonom) — never a
// locally reinvented risk set. `CommandRisk` is imported type-only; the
// registry file itself is never written to (disk-verified by a live-import
// consistency test in tests/cli/term-mode.test.ts).

import type { CommandRisk } from '../command-registry.js';

export type TermMode = 'ask' | 'run' | 'control';

/** Ladder order — each mode below is an allowed-risk PREFIX of this list. */
const RISK_LADDER: readonly CommandRisk[] = ['Oku', 'Değiştir', 'Çalıştır', 'Otonom'];

/** Mode-visit order for `ask` → `run` → `control` least-privilege search. */
export const TERM_MODES: readonly TermMode[] = ['ask', 'run', 'control'];

/** Risk classes each mode is allowed to execute (ladder-cumulative by design). */
export const ALLOWED_RISKS_BY_MODE: Readonly<Record<TermMode, ReadonlySet<CommandRisk>>> = {
  ask: new Set(RISK_LADDER.slice(0, 1)),
  run: new Set(RISK_LADDER.slice(0, 3)),
  control: new Set(RISK_LADDER),
};

/** Slash-style transition commands (chat-slash-registry.ts naming convention). */
export const MODE_TRANSITION_COMMANDS: Readonly<Record<string, TermMode>> = {
  '/ask': 'ask',
  '/run': 'run',
  '/control': 'control',
};

export interface TermModeState {
  readonly mode: TermMode;
}

/** `ask` is the safe default — a fresh terminal starts read-only. */
export function initialTermModeState(): TermModeState {
  return { mode: 'ask' };
}

export interface ModeTransitionResult {
  readonly state: TermModeState;
  readonly changed: boolean;
}

/**
 * Resolve a transition command against the current state. An unrecognized
 * command or a self-transition returns the SAME state object with
 * `changed:false` — a cheap no-render signal for a future caller.
 */
export function applyModeCommand(state: TermModeState, command: string): ModeTransitionResult {
  const target = MODE_TRANSITION_COMMANDS[command];
  if (target === undefined || target === state.mode) {
    return { state, changed: false };
  }
  return { state: { mode: target }, changed: true };
}

/**
 * Gate decision for one action's `CommandRisk` against the current mode.
 * Deliberately string-free (no hardcoded prose): mechanism modules stay
 * caller-agnostic per the project's i18n-first rule — a UI surface (follow-up
 * task) resolves `deniedRisk`/`currentMode`/`suggestedMode` into a localized,
 * "reddet+öner" message.
 */
export type ActionDecision =
  | { readonly allowed: true }
  | {
      readonly allowed: false;
      readonly deniedRisk: CommandRisk;
      readonly currentMode: TermMode;
      /** Cheapest mode (ladder order) that would allow `deniedRisk`. */
      readonly suggestedMode: TermMode;
    };

function cheapestModeAllowing(risk: CommandRisk): TermMode {
  for (const mode of TERM_MODES) {
    if (ALLOWED_RISKS_BY_MODE[mode].has(risk)) return mode;
  }
  // Unreachable while ALLOWED_RISKS_BY_MODE's `control` entry covers the full
  // RISK_LADDER — guarded by the registry-consistency test.
  return 'control';
}

/**
 * Ask-mode + a mutation/execution/autonomous-risk action → rejected with a
 * suggested mode to switch to (never silently blocked).
 */
export function checkActionAllowed(state: TermModeState, risk: CommandRisk): ActionDecision {
  if (ALLOWED_RISKS_BY_MODE[state.mode].has(risk)) {
    return { allowed: true };
  }
  return {
    allowed: false,
    deniedRisk: risk,
    currentMode: state.mode,
    suggestedMode: cheapestModeAllowing(risk),
  };
}
