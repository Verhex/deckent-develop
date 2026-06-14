// src/cli/repl/trace-wire.ts
// ═══ Trace-recorder wiring (SP-2) ═══════════════════════════════════════════
// Builds the per-turn recorder the native bridge calls. Local-only: writes one
// JSONL example per turn to .deckent/traces/<session>.jsonl (gitignored). Opt-out
// via DECKENT_TRACE=0. Pure/injectable (clock + dir) for hermetic tests.

import { join } from 'node:path';
import { appendTrace, toTrainingExample } from '../../agent/trace-recorder.js';
import type { ProviderMessage } from '../../agent/provider-tooluse/types.js';

export interface TurnRecorderOptions {
  enabled: boolean;
  dir: string;
  sessionId: string;
  system: string;
  model: string;
  now: () => string;
}

export function buildTurnRecorder(opts: TurnRecorderOptions): ((messages: ProviderMessage[]) => void) | undefined {
  if (!opts.enabled) return undefined;
  const file = join(opts.dir, `${opts.sessionId}.jsonl`);
  return (messages) => {
    appendTrace(file, toTrainingExample(opts.system, messages, { source: 'native-repl', model: opts.model, ts: opts.now() }));
  };
}
