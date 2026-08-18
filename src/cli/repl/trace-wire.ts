// src/cli/repl/trace-wire.ts
// ═══ Trace-recorder wiring (SP-2) ═══════════════════════════════════════════
// Builds the per-turn recorder the native bridge calls. Local-only: writes one
// JSONL example per turn to .deckent/traces/<session>.jsonl (gitignored). Opt-out
// via DECKENT_TRACE=0. Pure/injectable (clock + dir) for hermetic tests.

import { join } from 'node:path';
import { chmodSync } from 'node:fs';
import { appendTrace, toTrainingExample, type TrainingExample, type OpenAiMessage } from '../../agent/trace-recorder.js';
import { redactSensitive } from '../../core/redact-sensitive.js';
import type { ProviderMessage } from '../../agent/provider-tooluse/types.js';

export interface TurnRecorderOptions {
  enabled: boolean;
  dir: string;
  sessionId: string;
  system: string;
  /** Model id stamped on each trace line. Pass a getter when the session can
   *  switch models at runtime (/model) so the trace records the model that
   *  actually served the turn — a fixed boot-time stamp misled the 2026-07-07
   *  incident diagnosis. */
  model: string | (() => string);
  now: () => string;
}

/** Redact message content + tool-call argument JSON before it ever hits disk (TRN-2, same rule as TRN-1). */
function redactMessage(m: OpenAiMessage): OpenAiMessage {
  return {
    ...m,
    content: redactSensitive(m.content),
    ...(m.tool_calls ? { tool_calls: m.tool_calls.map((tc) => ({ ...tc, function: { ...tc.function, arguments: redactSensitive(tc.function.arguments) } })) } : {}),
  };
}

function redactExample(example: TrainingExample): TrainingExample {
  return { ...example, messages: example.messages.map(redactMessage) };
}

/**
 * NT-13 — `training_trace.enabled` (effective config) is the sole AUTHORITY that can turn
 * capture ON; absent/false means zero capture regardless of environment. `DECKENT_TRACE=0`
 * may additionally force capture OFF on top of an enabled config, but can never force it ON
 * when the config says off — an env-default-on trace was the exact bug this closes (the prior
 * call site read only `process.env['DECKENT_TRACE'] !== '0'`, so an unset env var captured by
 * default even with no config authority at all).
 */
export function resolveTraceEnabled(
  config: { training_trace?: { enabled?: boolean } } | undefined,
  env: NodeJS.ProcessEnv,
): boolean {
  if (config?.training_trace?.enabled !== true) return false;
  return env['DECKENT_TRACE'] !== '0';
}

export function buildTurnRecorder(opts: TurnRecorderOptions): ((messages: ProviderMessage[]) => void) | undefined {
  if (!opts.enabled) return undefined;
  const file = join(opts.dir, `${opts.sessionId}.jsonl`);
  return (messages) => {
    try {
      const model = typeof opts.model === 'function' ? opts.model() : opts.model;
      const example = toTrainingExample(opts.system, messages, { source: 'native-repl', model, ts: opts.now() });
      appendTrace(file, redactExample(example));
      // appendTrace/appendFileSync carries no mode option, so harden after each write —
      // training-trace content is a workspace-content-derived attack surface (TRN-2).
      if (process.platform !== 'win32') chmodSync(file, 0o600);
    } catch {
      // Fail-soft (ADR-G-009 / TRN-2, same rule as TRN-1): a trace-write error must never break the REPL turn.
    }
  };
}
