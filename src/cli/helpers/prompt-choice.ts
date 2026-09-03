// src/cli/helpers/prompt-choice.ts
// ═══ CLI-INTERACTIVE-001 — numbered choice on the plain CLI (no Ink) ═══
//
// Owner decision (2026-09-03): the CLI's selection commands should offer the
// same numbered, typed-arg-compatible choice the readline Terminal surface
// offers. This is the one primitive: print the picker rows (the SAME
// pickerLinesFor the Terminal uses, so CLI and Terminal show one vocabulary),
// ask the localized "Choice (1-n, Enter cancels)" question, resolve a number /
// id / label through resolvePickerArg. Pure core (`chooseFromSpec`, injected
// asker) + one impure asker over stdin/stdout for a TTY. Never used off-TTY:
// a missing argument on a pipe is a typed error, never a hang.

import { createInterface } from 'node:readline';
import { pickerLinesFor, resolvePickerArg, resolvePickerGlyphs, type PickerCandidate, type PickerLabels, type PickerSpec } from '../repl/picker.js';

export type ChoiceOutcome =
  | { readonly kind: 'chosen'; readonly candidate: PickerCandidate }
  | { readonly kind: 'cancelled' }
  | { readonly kind: 'not-found'; readonly arg: string }
  | { readonly kind: 'blocked'; readonly candidate: PickerCandidate };

export interface ChooseOptions {
  /** ASCII glyphs (dumb terminal / no UTF-8 locale). Default true on the CLI. */
  ascii?: boolean;
}

/**
 * List the candidates and ask once. Enter (empty answer) cancels; a number,
 * id or label resolves; a blocked candidate is reported, never applied.
 */
export async function chooseFromSpec(
  spec: PickerSpec,
  labels: PickerLabels,
  command: string,
  write: (line: string) => void,
  ask: (prompt: string) => Promise<string>,
  opts: ChooseOptions = {},
): Promise<ChoiceOutcome> {
  write(pickerLinesFor(spec, labels, resolvePickerGlyphs(opts.ascii ?? true), command, { typedHint: true }).join('\n'));
  const answer = (await ask(labels.choicePrompt.replace('{n}', String(spec.candidates.length)))).trim();
  if (answer.length === 0) return { kind: 'cancelled' };
  const hit = resolvePickerArg(answer, spec.candidates);
  if (hit.kind !== 'found') return { kind: 'not-found', arg: answer };
  if (hit.candidate.state === 'blocked') return { kind: 'blocked', candidate: hit.candidate };
  return { kind: 'chosen', candidate: hit.candidate };
}

/** One question on the process TTY (readline); resolves the typed line. */
export function askOnStdin(prompt: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise<string>((resolve) => {
    rl.question(prompt, (answer) => { rl.close(); resolve(answer); });
  });
}

/** True only when both stdin and stdout are interactive terminals. */
export function stdinIsInteractive(): boolean {
  return process.stdin.isTTY === true && process.stdout.isTTY === true;
}
