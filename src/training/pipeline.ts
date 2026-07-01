// src/training/pipeline.ts
// ═══ TRN-4 — training-pipeline mükemmelleştirme ═════════════════════════════
// trace (TRN-1/2/3 TrainingExample-shaped JSONL, meta OPTIONAL — TRN-3's
// aligned/general output has no `meta`) -> ShareGPT-format JSONL, the
// unsloth/LLaMA-Factory tool-calling SFT dataset shape (conversations[] with
// from: human|gpt|function_call|observation, + top-level system). Compresses
// large tool-result ("observation") turns with a deterministic head+tail
// truncation policy, enriches each example with outcome/agent/model labels
// when the source trace carries `meta`, and runs a redaction double-pass
// (before + after compression) as defense-in-depth on top of the single-pass
// redaction TRN-1/2/3 already do at write time (ADR-G-009).
//
// The streaming driver (`runPipeline`) never materializes the whole input or
// output file in memory — one line in, one line out, node:readline over a
// node:fs read stream / node:fs write stream (default I/O; injectable for
// hermetic tests, same pattern as src/core/limit-ledger.ts).

import { createReadStream, createWriteStream } from 'node:fs';
import { createInterface } from 'node:readline';
import type { OpenAiMessage, TraceMeta } from '../agent/trace-recorder.js';
import { redactSensitive } from '../core/redact-sensitive.js';

// ─── ShareGPT types ──────────────────────────────────────────────────────────

export type ShareGptFrom = 'human' | 'gpt' | 'function_call' | 'observation';

export interface ShareGptTurn {
  from: ShareGptFrom;
  value: string;
}

/** outcome/agent/model — the exact 3 fields TRN-4 asks for; omitted keys are simply absent. */
export interface ShareGptLabels {
  outcome?: string;
  agent?: string;
  model?: string;
}

export interface ShareGptExample {
  conversations: ShareGptTurn[];
  system?: string;
  labels?: ShareGptLabels;
}

const VALID_FROM: ReadonlySet<string> = new Set<ShareGptFrom>(['human', 'gpt', 'function_call', 'observation']);

/** Structural guard proving a value is a well-formed ShareGPT example. */
export function isValidShareGptExample(x: unknown): x is ShareGptExample {
  if (typeof x !== 'object' || x === null) return false;
  const o = x as Record<string, unknown>;

  if (!Array.isArray(o['conversations'])) return false;
  for (const turn of o['conversations']) {
    if (typeof turn !== 'object' || turn === null) return false;
    const t = turn as Record<string, unknown>;
    if (typeof t['from'] !== 'string' || !VALID_FROM.has(t['from'])) return false;
    if (typeof t['value'] !== 'string') return false;
  }

  if ('system' in o && o['system'] !== undefined && typeof o['system'] !== 'string') return false;
  if ('labels' in o && o['labels'] !== undefined && (typeof o['labels'] !== 'object' || o['labels'] === null)) return false;

  return true;
}

// ─── Trace input shape (TRN-1/2/3 TrainingExample, meta optional) ───────────

export interface TraceLike {
  messages: OpenAiMessage[];
  meta?: Partial<TraceMeta>;
}

/** Best-effort parse of one raw trace JSONL line. Never throws — malformed lines return null (fail-soft, mirrors cc-trace-extractor.ts). */
export function parseTraceLine(raw: string): TraceLike | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const obj = parsed as Record<string, unknown>;
  if (!Array.isArray(obj['messages'])) return null;

  const meta = obj['meta'];
  return {
    messages: obj['messages'] as OpenAiMessage[],
    ...(typeof meta === 'object' && meta !== null ? { meta: meta as Partial<TraceMeta> } : {}),
  };
}

// ─── Converter (+ label-enrichment) ─────────────────────────────────────────

function toFunctionCallValue(call: NonNullable<OpenAiMessage['tool_calls']>[number]): string {
  let args: unknown;
  try {
    args = JSON.parse(call.function.arguments);
  } catch {
    args = call.function.arguments; // malformed upstream JSON — keep raw string rather than dropping the call
  }
  return JSON.stringify({ name: call.function.name, arguments: args });
}

function buildLabels(meta: Partial<TraceMeta> | undefined): ShareGptLabels | undefined {
  if (meta === undefined) return undefined;
  const labels: ShareGptLabels = {};
  if (meta.selfAssessment !== undefined) labels.outcome = meta.selfAssessment;
  if (meta.agent !== undefined) labels.agent = meta.agent;
  if (meta.model !== undefined) labels.model = meta.model;
  return Object.keys(labels).length > 0 ? labels : undefined;
}

/**
 * Convert one TRN-1/2/3 trace into a ShareGPT example. The system message
 * (always present per trace-recorder.ts's toTrainingExample/toSprintTrainingExample)
 * becomes the top-level `system` field, never a conversation turn.
 */
export function convertToShareGpt(trace: TraceLike): ShareGptExample {
  const conversations: ShareGptTurn[] = [];
  let system: string | undefined;

  for (const msg of trace.messages) {
    if (msg.role === 'system') {
      if (system === undefined) system = msg.content;
      continue;
    }
    if (msg.role === 'user') {
      conversations.push({ from: 'human', value: msg.content });
      continue;
    }
    if (msg.role === 'tool') {
      conversations.push({ from: 'observation', value: msg.content });
      continue;
    }
    // assistant
    if (msg.content.length > 0) {
      conversations.push({ from: 'gpt', value: msg.content });
    }
    for (const call of msg.tool_calls ?? []) {
      conversations.push({ from: 'function_call', value: toFunctionCallValue(call) });
    }
  }

  const example: ShareGptExample = { conversations };
  if (system !== undefined) example.system = system;
  const labels = buildLabels(trace.meta);
  if (labels !== undefined) example.labels = labels;
  return example;
}

// ─── Compressor (tool-result / observation truncation policy) ──────────────

export interface TruncationPolicy {
  readonly maxChars: number;
}

/** 4000 chars: head 70% + tail 30% keeps the call/result boundary visible on both ends. */
export const DEFAULT_TRUNCATION_POLICY: TruncationPolicy = { maxChars: 4000 };

/** Deterministic head+tail truncation with an explicit omitted-count marker. Pure. */
export function truncateToolResult(content: string, policy: TruncationPolicy = DEFAULT_TRUNCATION_POLICY): string {
  if (content.length <= policy.maxChars) return content;
  const headLen = Math.ceil(policy.maxChars * 0.7);
  const tailLen = Math.max(policy.maxChars - headLen, 0);
  const omitted = content.length - headLen - tailLen;
  const marker = `\n[...${omitted} chars omitted...]\n`;
  return content.slice(0, headLen) + marker + content.slice(content.length - tailLen);
}

/** Truncates ONLY `observation` (tool-result) turns — human/gpt/function_call values are left as-is. */
export function compressToolResults(
  example: ShareGptExample,
  policy: TruncationPolicy = DEFAULT_TRUNCATION_POLICY,
): { example: ShareGptExample; truncated: boolean } {
  let truncated = false;
  const conversations = example.conversations.map((turn) => {
    if (turn.from !== 'observation') return turn;
    const value = truncateToolResult(turn.value, policy);
    if (value !== turn.value) truncated = true;
    return value === turn.value ? turn : { ...turn, value };
  });
  return { example: { ...example, conversations }, truncated };
}

// ─── Redaction pass ──────────────────────────────────────────────────────────

/** One redaction pass over every turn value + the system field. Reused twice by traceToShareGpt (double-check). */
export function redactShareGptExample(example: ShareGptExample): { example: ShareGptExample; redacted: boolean } {
  let redacted = false;

  const conversations = example.conversations.map((turn) => {
    const value = redactSensitive(turn.value);
    if (value !== turn.value) redacted = true;
    return value === turn.value ? turn : { ...turn, value };
  });

  let system = example.system;
  if (system !== undefined) {
    const next = redactSensitive(system);
    if (next !== system) redacted = true;
    system = next;
  }

  const next: ShareGptExample = { ...example, conversations };
  if (system !== undefined) next.system = system;
  return { example: next, redacted };
}

// ─── Composed per-example pipeline ──────────────────────────────────────────

export interface TraceToShareGptResult {
  example: ShareGptExample;
  truncated: boolean;
  redacted: boolean;
}

/**
 * Full per-example pipeline: convert -> redact (pass 1, pre-compression) ->
 * compress -> redact (pass 2, post-compression, final gate before serialize).
 * Two independent redactSensitive() calls at two distinct stages = the
 * "çift-kontrol" (double-check) redaction pass.
 */
export function traceToShareGpt(trace: TraceLike, policy: TruncationPolicy = DEFAULT_TRUNCATION_POLICY): TraceToShareGptResult {
  const converted = convertToShareGpt(trace);
  const passA = redactShareGptExample(converted);
  const { example: compressed, truncated } = compressToolResults(passA.example, policy);
  const passB = redactShareGptExample(compressed);
  return { example: passB.example, truncated, redacted: passA.redacted || passB.redacted };
}

// ─── Streaming driver (line-in, line-out — memory-safe for large traces) ───

export interface LineSink {
  write(line: string): void;
  close(): Promise<void>;
}

function defaultOpenLines(filePath: string): AsyncIterable<string> {
  return createInterface({ input: createReadStream(filePath), crlfDelay: Infinity });
}

function defaultOpenSink(filePath: string): LineSink {
  const stream = createWriteStream(filePath, { flags: 'w' });
  return {
    write(line: string): void {
      stream.write(line + '\n');
    },
    close(): Promise<void> {
      return new Promise((resolveClose, rejectClose) => {
        stream.end((err: NodeJS.ErrnoException | null | undefined) => (err ? rejectClose(err) : resolveClose()));
      });
    },
  };
}

export interface PipelineOptions {
  inputPath: string;
  outputPath: string;
  policy?: TruncationPolicy;
  /** Injectable line source (hermetic tests). Defaults to a real readline stream over inputPath. */
  openLines?: (filePath: string) => AsyncIterable<string>;
  /** Injectable line sink (hermetic tests). Defaults to a real write stream at outputPath. */
  openSink?: (filePath: string) => LineSink;
}

export interface PipelineSummary {
  linesRead: number;
  examplesWritten: number;
  skippedMalformed: number;
  truncatedCount: number;
  redactedCount: number;
}

/**
 * Streams `opts.inputPath` (one TRN-1/2/3 trace JSONL per line) into
 * `opts.outputPath` (one ShareGPT example JSONL per line). Reads via
 * node:readline (never `readFileSync`+split — no whole-file-in-memory),
 * writes one line at a time. Malformed input lines are skipped, not thrown.
 */
export async function runPipeline(opts: PipelineOptions): Promise<PipelineSummary> {
  const policy = opts.policy ?? DEFAULT_TRUNCATION_POLICY;
  const openLines = opts.openLines ?? defaultOpenLines;
  const openSink = opts.openSink ?? defaultOpenSink;

  const lines = openLines(opts.inputPath);
  const sink = openSink(opts.outputPath);

  const summary: PipelineSummary = {
    linesRead: 0,
    examplesWritten: 0,
    skippedMalformed: 0,
    truncatedCount: 0,
    redactedCount: 0,
  };

  try {
    for await (const raw of lines) {
      if (raw.length === 0) continue;
      summary.linesRead++;

      const trace = parseTraceLine(raw);
      if (trace === null) {
        summary.skippedMalformed++;
        continue;
      }

      const { example, truncated, redacted } = traceToShareGpt(trace, policy);
      if (truncated) summary.truncatedCount++;
      if (redacted) summary.redactedCount++;

      sink.write(JSON.stringify(example));
      summary.examplesWritten++;
    }
  } finally {
    await sink.close();
  }

  return summary;
}
