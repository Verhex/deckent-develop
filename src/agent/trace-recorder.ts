// src/agent/trace-recorder.ts
// ═══ Trace recorder (SP-2) ══════════════════════════════════════════════════
// Maps a native-agent ProviderMessage[] transcript into an OpenAI-messages
// training example (the unsloth/LLaMA-Factory tool-calling SFT shape) and
// appends it as one JSONL line. Local-only (.deckent/traces/, gitignored);
// nothing is uploaded. The ProviderMessage shape is ALREADY the OpenAI
// round-trip shape (M2) — this is a thin, pure mapping + an fs append.

import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { ProviderMessage } from './provider-tooluse/types.js';
import type { LogEvent } from '../core/log-event.js';
import { redactSensitive } from '../core/redact-sensitive.js';

export interface TraceMeta {
  source: string;
  model: string;
  ts: string;
  /** TRN-1 sprint-worker task-labeling — omitted by the native-REPL source. */
  taskId?: string;
  sprintId?: string;
  agent?: string;
  selfAssessment?: string;
  /** born-614: worker's own claim alongside the Brain verdict (honesty-gap signal). */
  workerSelfAssessment?: string;
}
export interface OpenAiMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>;
  tool_call_id?: string;
}
export interface TrainingExample { messages: OpenAiMessage[]; meta: TraceMeta; }

/** Task-labeling context for a sprint-worker trace entry (TRN-1). */
export interface SprintTraceMeta {
  taskId: string;
  sprintId: string;
  agent: string;
  model: string;
  /** The GROUND-TRUTH outcome label. born-614 wiring passes Brain's final
   *  TaskEvaluation verdict here (not the worker's claim) — the pipeline's
   *  normalizeOutcome maps it to the training `outcome` label, and a label
   *  derived from a self-claim would poison the moat (feedback: trust Brain
   *  eval, not worker). */
  selfAssessment: string;
  /** The worker's OWN claim, kept alongside the Brain verdict (born-614) —
   *  the claim↔verdict delta is itself a training signal (honesty gap). */
  workerSelfAssessment?: string;
  ts: string;
}

function toOpenAiMessage(m: ProviderMessage): OpenAiMessage {
  if (m.role === 'tool') return { role: 'tool', content: m.content, tool_call_id: m.toolCallId ?? '' };
  if (m.role === 'assistant' && m.toolCalls?.length) {
    return {
      role: 'assistant',
      content: m.content,
      tool_calls: m.toolCalls.map((tc) => ({ id: tc.id, type: 'function', function: { name: tc.name, arguments: JSON.stringify(tc.args) } })),
    };
  }
  return { role: m.role, content: m.content };
}

/** Build a training example: a system message + the mapped transcript. */
export function toTrainingExample(system: string, transcript: ProviderMessage[], meta: TraceMeta): TrainingExample {
  return { messages: [{ role: 'system', content: system }, ...transcript.map(toOpenAiMessage)], meta };
}

/**
 * Map one structured JSONL `LogEvent` (the output-collector contract —
 * `OutputCollector.readLogEvents`) into an `OpenAiMessage`. A LogEvent stream
 * is a heterogeneous technical event log (turn/tool_use/tool_result/text/
 * stderr/usage/lifecycle), not a clean conversation, so this is a best-effort
 * mapping into the shared OpenAI-messages schema (`tool_result` -> role
 * 'tool', everything else -> role 'assistant'), not a full ProviderMessage
 * reconstruction. `ev.content` is redacted before being embedded (TRN-1: raw
 * secrets must never reach disk).
 */
function logEventToOpenAiMessage(ev: LogEvent): OpenAiMessage {
  const raw = typeof ev.content === 'string' ? ev.content : JSON.stringify(ev.content);
  const content = redactSensitive(raw);
  return ev.type === 'tool_result'
    ? { role: 'tool', content, tool_call_id: '' }
    : { role: 'assistant', content };
}

/**
 * Build a training example from a sprint worker's structured JSONL log
 * (TRN-1 — wires the output-collector JSONL contract into the trace-recorder).
 * `meta` carries the task-labeling (taskId/sprintId/agent/model/selfAssessment)
 * so a training consumer can filter/weight examples by outcome.
 */
export function toSprintTrainingExample(events: readonly LogEvent[], meta: SprintTraceMeta): TrainingExample {
  return {
    messages: events.map(logEventToOpenAiMessage),
    meta: {
      source: 'sprint-worker',
      model: meta.model,
      ts: meta.ts,
      taskId: meta.taskId,
      sprintId: meta.sprintId,
      agent: meta.agent,
      selfAssessment: meta.selfAssessment,
      ...(meta.workerSelfAssessment !== undefined
        ? { workerSelfAssessment: meta.workerSelfAssessment }
        : {}),
    },
  };
}

/** Append one example as a JSONL line (creates the dir + file as needed). */
export function appendTrace(filePath: string, example: TrainingExample): void {
  mkdirSync(dirname(filePath), { recursive: true });
  appendFileSync(filePath, JSON.stringify(example) + '\n', 'utf-8');
}
