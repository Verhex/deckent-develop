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

/** The single mode-transition slash command. `/ask` `/run` `/control` were
 * retired as transition commands so those names stay free for future
 * first-class commands (notably `/run` = task execution); every mode
 * interaction now goes through `/term` (bare = status, `/term <mode>` = switch). */
export const TERM_MODE_COMMAND = '/term';

export interface TermModeState {
  readonly mode: TermMode;
}

/** TERMINAL-POSTURE-001 (owner decision 2026-09-03): a fresh terminal starts
 *  in `run` — reads, edits and execution admitted, autonomous actions still
 *  need Control. `ask` remains an explicit read-only posture (`/term ask` or
 *  `terminal.posture` in config). */
export const DEFAULT_TERM_MODE: TermMode = 'run';

export function initialTermModeState(mode: TermMode = DEFAULT_TERM_MODE): TermModeState {
  return { mode };
}

/** The configured posture (`terminal.posture`), case-insensitive; anything
 *  that is not one of the three tokens resolves to the default. */
export function resolveConfiguredPosture(value: unknown): TermMode {
  if (typeof value !== 'string') return DEFAULT_TERM_MODE;
  const token = value.trim().toLowerCase();
  return (TERM_MODES as readonly string[]).includes(token) ? (token as TermMode) : DEFAULT_TERM_MODE;
}

/** Parsed `/term` line — the caller (app.tsx handleSubmit) renders each kind
 * with localized labels; `none` means "not a /term line, fall through". */
export type TermCommandParse =
  | { readonly kind: 'none' }
  | { readonly kind: 'status' }
  | { readonly kind: 'switch'; readonly target: TermMode }
  | { readonly kind: 'usage' };

/**
 * Parse a raw input line as a `/term` command. Case-insensitive and
 * whitespace-tolerant. Bare `/term` → status; `/term ask|run|control` →
 * switch; any other argument shape (unknown mode, extra words) → usage.
 */
export function parseTermCommand(line: string): TermCommandParse {
  const parts = line.trim().split(/\s+/);
  if ((parts[0] ?? '').toLowerCase() !== TERM_MODE_COMMAND) return { kind: 'none' };
  if (parts.length === 1) return { kind: 'status' };
  const arg = (parts[1] ?? '').toLowerCase();
  if (parts.length === 2 && (TERM_MODES as readonly string[]).includes(arg)) {
    return { kind: 'switch', target: arg as TermMode };
  }
  return { kind: 'usage' };
}

export interface ModeTransitionResult {
  readonly state: TermModeState;
  readonly changed: boolean;
}

/**
 * Apply a parsed switch target to the current state. A self-transition
 * returns the SAME state object with `changed:false` — a cheap no-render
 * signal for the caller.
 */
export function applyModeTarget(state: TermModeState, target: TermMode): ModeTransitionResult {
  if (target === state.mode) {
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
