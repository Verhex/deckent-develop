// src/cli/repl/term-gate.ts
// ═══ TERMINAL-TOOLS-011 — Ask/Run/Control action gate + `!` shell passthrough ═
//
// Single-surface contract §10.2: "Ask/Run/Control's risk ladder exists as a
// state machine, but the App does not call its full action gate; Ask and Run
// therefore do not yet provide the promised authority distinction." This
// module is the pure glue between the ladder (term-mode.ts checkActionAllowed)
// and the three places a Terminal action is born:
//   1. a slash-dispatched CLI-bridge tool (app.tsx → dispatcher),
//   2. a model-proposed tool asking for confirmation (native engine → confirm),
//   3. the `!<cmd>` shell passthrough (parity with Claude Code / Codex / Hermes).
// It also keeps the bounded "shell notes" that ride ahead of the NEXT prompt,
// so a `!` command's output reaches the model honestly — as part of the user's
// next message, never as a fabricated transcript entry.
//
// String-free: the denial line is rendered by the caller from catalog labels.

import type { CommandRisk } from '../command-registry.js';
import { classifyTool } from './tool-permissions.js';
import { checkActionAllowed, type ActionDecision, type TermModeState } from './term-mode.js';

/** Tools that execute or mutate through chat-tool-exec.ts — mapped by name
 *  (their args carry no finer risk signal). */
const EXEC_RISK: Readonly<Record<string, CommandRisk>> = {
  deckent_bash: 'Çalıştır',
  deckent_write_file: 'Değiştir',
  deckent_edit_file: 'Değiştir',
  deckent_read_file: 'Oku',
};

export interface DispatchRiskInput {
  tool: string;
  args: Record<string, unknown>;
  /** The slash catalog's registry-cross-referenced risk tag, when the command has one. */
  declaredRisk?: CommandRisk | undefined;
}

/**
 * The plain-risk class of a dispatch. A declared registry tag wins; exec tools
 * map by name; every other CLI-bridge tool derives from its confirm tier
 * (read → Oku, confirm → Değiştir, always → Otonom — the tier that already
 * gates the y/n prompt, so the ladder never contradicts the prompt).
 */
export function riskForDispatch(input: DispatchRiskInput): CommandRisk {
  if (input.declaredRisk) return input.declaredRisk;
  const exec = EXEC_RISK[input.tool];
  if (exec) return exec;
  const tier = classifyTool(input.tool, input.args);
  return tier === 'read' ? 'Oku' : tier === 'confirm' ? 'Değiştir' : 'Otonom';
}

export type TermGateDecision =
  | { readonly kind: 'allow' }
  | { readonly kind: 'deny'; readonly decision: Extract<ActionDecision, { allowed: false }>; readonly risk: CommandRisk };

/** Gate one action against the current terminal mode. */
export function gateAction(state: TermModeState, input: DispatchRiskInput): TermGateDecision {
  const risk = riskForDispatch(input);
  const decision = checkActionAllowed(state, risk);
  return decision.allowed ? { kind: 'allow' } : { kind: 'deny', decision, risk };
}

/** `!<cmd>` → the command; `!` alone (or `!` + spaces) is not a shell line. */
export function resolveShellLine(trimmed: string): string | null {
  if (!trimmed.startsWith('!')) return null;
  const cmd = trimmed.slice(1).trim();
  return cmd.length > 0 ? cmd : null;
}

/** chat-tool-exec.ts marks a refused/denied action with this prefix. */
export const DENIED_OUTPUT_PREFIX = '[deckent-denied]';
export function isDeniedShellOutput(output: string): boolean {
  return output.trimStart().startsWith(DENIED_OUTPUT_PREFIX);
}

// ─── Shell notes: `!` output rides ahead of the next prompt ─────────────────

export interface ShellNote {
  cmd: string;
  output: string;
}
/** At most this many notes are kept (newest last); older ones fall off. */
export const SHELL_NOTE_MAX = 3;
/** Per-note output cap in characters; the tail is kept (the informative part of a log). */
export const SHELL_NOTE_OUTPUT_CAP = 8_000;
const SHELL_NOTE_TRUNCATED_MARK = '[…]';

export function pushShellNote(notes: readonly ShellNote[], note: ShellNote): ShellNote[] {
  const output = note.output.length > SHELL_NOTE_OUTPUT_CAP
    ? `${SHELL_NOTE_TRUNCATED_MARK}\n${note.output.slice(-SHELL_NOTE_OUTPUT_CAP)}`
    : note.output;
  return [...notes, { cmd: note.cmd, output }].slice(-SHELL_NOTE_MAX);
}

/** The prefix prepended to the next outbound prompt ('' when there is nothing pending). */
export function buildShellNotePrefix(notes: readonly ShellNote[]): string {
  if (notes.length === 0) return '';
  return `${notes.map((n) => `[shell] $ ${n.cmd}\n${n.output}`).join('\n\n')}\n\n`;
}

/** Substitute a denial decision into the caller's catalog template. */
export function renderTermGateDenied(
  gate: Extract<TermGateDecision, { kind: 'deny' }>,
  target: string,
  labels: { template: string; riskLabel: (risk: CommandRisk) => string; modeLabel: (mode: TermModeState['mode']) => string },
): string {
  return labels.template
    .replace('{target}', target)
    .replace('{risk}', labels.riskLabel(gate.risk))
    .replace('{mode}', labels.modeLabel(gate.decision.currentMode))
    .replace('{suggested}', gate.decision.suggestedMode);
}
