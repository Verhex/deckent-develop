// src/core/trace-schema.ts
// ═══ Trace SCHEMA-V2 — telemetry-sidecar ↔ training-projection ayrımı ════════
// TT552 (417-003). The v1 sprint-worker trace (agent/trace-recorder.ts
// `toSprintTrainingExample`) mapped EVERY structured LogEvent 1:1 into an
// OpenAI-messages line: telemetry (turn/usage/lifecycle/stderr) leaked in as
// `assistant` messages (~66% noise), a `tool_use` event became an assistant
// message whose `content` was the RAW stringified SDK message (no native
// tool_calls, tool name double-represented), every `tool_result` carried an
// empty `tool_call_id` (the 403-001 orphan class), the worker's real prompt was
// never present (0 system/user), and source ts/seq were dropped.
//
// This module is the PURE semantic layer that fixes all of that. It is
// deliberately schema-only + string/fs helpers — it imports ONLY `core`
// (log-event, redact-sensitive) and touches the filesystem the same way
// `core/output-collector.ts` already reads `.tasks/task-<id>.log`, so it stays
// inside the ADR-D-004 core boundary (no orchestra/cli/api/mcp import).
//
// The record shape it feeds (schemaVersion:2) is a strict SUPERSET of v1 — the
// existing reader (training/pipeline.ts convertToShareGpt) is schema-agnostic
// (reads only `messages`), so a v2 record round-trips through it unchanged
// (dual-read). Telemetry lives in a SEPARATE top-level `telemetry` sidecar that
// the ShareGPT projection never reads, so it can never reach the training set.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { LogEvent, LogEventType } from './log-event.js';
import { redactSensitive } from './redact-sensitive.js';

/** Current sprint-worker trace record format. Absent/`1` ⇒ legacy v1 record. */
export const TRACE_SCHEMA_VERSION = 2;

/** The LogEvent kinds that are RAW-STREAM TELEMETRY, not conversation/tool-flow.
 *  These go to the sidecar channel and are NEVER projected into training messages. */
export const TELEMETRY_EVENT_TYPES: ReadonlySet<LogEventType> = new Set<LogEventType>([
  'turn',
  'usage',
  'lifecycle',
  'stderr',
]);

/** A native OpenAI-style tool call carried on an assistant message. */
export interface TraceToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

/** One projected conversation/tool message. Superset of the v1 OpenAiMessage:
 *  additive `seq`/`ts` carry the SOURCE ordering/timing the v1 mapping dropped
 *  (the ShareGPT projection ignores them, so training output stays clean). */
export interface TraceMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: TraceToolCall[];
  tool_call_id?: string;
  /** Source LogEvent.seq (provenance) — omitted for injected prompt messages. */
  seq?: number;
  /** Source LogEvent.ts (provenance) — omitted for injected prompt messages. */
  ts?: string;
}

/** One dropped raw-stream telemetry event — kept out of `messages`, retained
 *  (seq/ts/type only, no payload) so the timeline is auditable without polluting
 *  the training projection. */
export interface TelemetryEvent {
  seq: number;
  ts: string;
  type: LogEventType;
}

/** The worker's real prompt, split at the `## Your Task` seam into a system
 *  part (worker-contract + skills + persona + ADRs) and the task/user part. */
export interface WorkerPrompt {
  system?: string;
  task?: string;
}

/** Result of projecting a LogEvent stream into the v2 training shape. */
export interface TraceProjection {
  /** Conversation + tool-flow ONLY (prompt injected, telemetry removed). */
  messages: TraceMessage[];
  /** Raw-stream telemetry, split out of the projection. */
  telemetry: TelemetryEvent[];
  /** Non-empty ⇒ the record is corpus-OUT; each string is a reason. */
  quarantineReasons: string[];
}

// ─── Prompt split (pure) ─────────────────────────────────────────────────────

/** The stable header that opens the per-task (T2) prompt segment
 *  (prompt-god-template.ts renderSegments) — the seam between the system-ish
 *  preamble and the task/user body. */
const TASK_PROMPT_MARKER = '## Your Task';

/**
 * Split a compiled worker prompt into its system vs task (user) halves at the
 * `## Your Task` header. When the marker is absent (a non-standard/older prompt)
 * the whole text is treated as the task turn (still a real prompt, not lost).
 * Pure — no fs, no redaction (the projector redacts before write).
 */
export function splitWorkerPrompt(text: string): WorkerPrompt {
  const idx = text.indexOf(TASK_PROMPT_MARKER);
  if (idx <= 0) {
    const task = text.trim();
    return task ? { task } : {};
  }
  const system = text.slice(0, idx).trim();
  const task = text.slice(idx).trim();
  return {
    ...(system ? { system } : {}),
    ...(task ? { task } : {}),
  };
}

// ─── Prompt load (fs — mirrors core/output-collector.ts .tasks access) ───────

/**
 * Locate + read + split the worker's real prompt for `taskId` from the `.tasks`
 * archive. The compiled prompt is written to `.tasks/.prompt-<taskId>-<hash>.txt`
 * live and moved to `.tasks/archive/sprint-<id>/` at sprint-end
 * (spawn-backend-docker.ts archivePromptFiles / tmux.ts writePromptFile), so
 * both locations are searched.
 *
 * `preferFix` disambiguates the original vs FIX prompt when both exist for the
 * same taskId: docker names a fix worker's file `.prompt-<taskId>-<hash>-fix.txt`
 * (spawn-backend-docker.ts). Original-attempt traces prefer the non-`-fix` file,
 * fix-attempt traces prefer the `-fix` file. Returns `{}` when nothing is found
 * (→ the projector stamps a `no-prompt` quarantine reason).
 */
export function loadWorkerPromptMeta(
  tasksDir: string,
  taskId: string,
  opts: { preferFix?: boolean } = {},
): { systemPrompt?: string; taskPrompt?: string } {
  const file = locateWorkerPromptFile(tasksDir, taskId, opts.preferFix === true);
  if (file === undefined) return {};
  let raw: string;
  try {
    raw = readFileSync(file, 'utf-8');
  } catch {
    return {};
  }
  const { system, task } = splitWorkerPrompt(raw);
  return {
    ...(system !== undefined ? { systemPrompt: system } : {}),
    ...(task !== undefined ? { taskPrompt: task } : {}),
  };
}

/** Deterministic pick of the `.prompt-<taskId>-*.txt` file (live dir first, then
 *  each `archive/<sprint>/` dir), honoring the fix/original preference. Within a
 *  category the lexicographically-first match wins (hashes are random but the
 *  choice is stable across runs). */
function locateWorkerPromptFile(tasksDir: string, taskId: string, preferFix: boolean): string | undefined {
  const searchDirs: string[] = [tasksDir];
  const archiveRoot = join(tasksDir, 'archive');
  if (existsSync(archiveRoot)) {
    for (const entry of safeReaddir(archiveRoot)) {
      searchDirs.push(join(archiveRoot, entry));
    }
  }

  const prefix = `.prompt-${taskId}-`;
  for (const dir of searchDirs) {
    const matches = safeReaddir(dir)
      .filter((f) => f.startsWith(prefix) && f.endsWith('.txt'))
      .sort();
    if (matches.length === 0) continue;
    const isFix = (f: string): boolean => f.endsWith('-fix.txt');
    const preferred = matches.filter((f) => isFix(f) === preferFix);
    const chosen = (preferred.length > 0 ? preferred : matches)[0];
    if (chosen !== undefined) return join(dir, chosen);
  }
  return undefined;
}

function safeReaddir(dir: string): string[] {
  try {
    return readdirSync(dir) as string[];
  } catch {
    return [];
  }
}

// ─── Projection (pure) ───────────────────────────────────────────────────────

/**
 * Project a worker's structured LogEvent stream into the v2 training shape:
 * inject the real prompt as system/user turns, split raw-stream telemetry into
 * the sidecar, emit native `tool_calls` on assistant turns, match each
 * `tool_result` to its originating `tool_use` id (killing the empty-id orphan
 * class), unify the Read double-representation (the tool call lives ONLY in
 * `tool_calls`, never re-serialized into `content`), and carry source seq/ts.
 *
 * Quarantine reasons are collected (never thrown): a promptless, orphan-bearing,
 * or conversation-empty record is corpus-OUT so it cannot silently reach the
 * training set. All content is redacted before it lands in a message.
 */
export function projectTranscript(events: readonly LogEvent[], prompt?: WorkerPrompt): TraceProjection {
  const messages: TraceMessage[] = [];
  const telemetry: TelemetryEvent[] = [];
  const reasons = new Set<string>();
  const knownToolCallIds = new Set<string>();

  // 1. Prompt injection (system + task) — the v1 gap this closes.
  if (prompt?.system) messages.push({ role: 'system', content: redactSensitive(prompt.system) });
  if (prompt?.task) messages.push({ role: 'user', content: redactSensitive(prompt.task) });
  if (!prompt?.system && !prompt?.task) reasons.add('no-prompt');

  let conversationTurns = 0;

  // 2. Event walk (source order preserved via seq/ts provenance).
  for (const ev of events) {
    if (TELEMETRY_EVENT_TYPES.has(ev.type)) {
      telemetry.push({ seq: ev.seq, ts: ev.ts, type: ev.type });
      continue;
    }

    if (ev.type === 'text') {
      const text = extractAssistantText(ev.content);
      if (text.length > 0) {
        messages.push({ role: 'assistant', content: redactSensitive(text), seq: ev.seq, ts: ev.ts });
        conversationTurns++;
      }
      continue;
    }

    if (ev.type === 'tool_use') {
      const { text, calls } = extractToolUse(ev.content);
      const toolCalls: TraceToolCall[] = calls.map((c) => {
        knownToolCallIds.add(c.id);
        return {
          id: c.id,
          type: 'function',
          function: { name: c.name, arguments: redactSensitive(safeStringify(c.args)) },
        };
      });
      // Read double-representation unified: `content` is the accompanying text
      // ONLY — the call is NOT re-embedded as serialized JSON.
      messages.push({
        role: 'assistant',
        content: redactSensitive(text),
        ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
        seq: ev.seq,
        ts: ev.ts,
      });
      conversationTurns++;
      continue;
    }

    if (ev.type === 'tool_result') {
      const { toolUseId, content } = extractToolResult(ev.content);
      const matched = toolUseId !== undefined && toolUseId.length > 0 && knownToolCallIds.has(toolUseId);
      if (!matched) reasons.add('orphan-tool-result');
      messages.push({
        role: 'tool',
        content: redactSensitive(content),
        tool_call_id: toolUseId ?? '',
        seq: ev.seq,
        ts: ev.ts,
      });
      conversationTurns++;
      continue;
    }
  }

  if (conversationTurns === 0) reasons.add('no-conversation');

  return { messages, telemetry, quarantineReasons: [...reasons] };
}

// ─── Content extractors (defensive — provider-agnostic best-effort) ──────────

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** The `message.content` block array of a Claude SDK envelope, if present. */
function claudeBlocks(content: unknown): unknown[] | undefined {
  if (!isRecord(content)) return undefined;
  const msg = content.message;
  if (isRecord(msg) && Array.isArray(msg.content)) return msg.content;
  if (Array.isArray(content.content)) return content.content;
  return undefined;
}

/** Join every `text` block; falls back to a bare string / `.text` / `.content`. */
function extractAssistantText(content: unknown): string {
  const blocks = claudeBlocks(content);
  if (blocks) {
    return blocks
      .filter((b): b is Record<string, unknown> => isRecord(b) && b.type === 'text')
      .map((b) => (typeof b.text === 'string' ? b.text : ''))
      .filter((t) => t.length > 0)
      .join('\n');
  }
  if (typeof content === 'string') return content;
  if (isRecord(content)) {
    if (typeof content.text === 'string') return content.text;
    if (typeof content.content === 'string') return content.content;
  }
  return '';
}

interface RawToolCall { id: string; name: string; args: unknown }

/** Extract accompanying text + every `tool_use` block (id/name/input). */
function extractToolUse(content: unknown): { text: string; calls: RawToolCall[] } {
  const calls: RawToolCall[] = [];
  const pushBlock = (b: Record<string, unknown>): void => {
    if (b.type !== 'tool_use') return;
    const id = typeof b.id === 'string' ? b.id : '';
    const name = typeof b.name === 'string' ? b.name : '';
    calls.push({ id, name, args: b.input ?? {} });
  };

  const blocks = claudeBlocks(content);
  if (blocks) {
    for (const b of blocks) if (isRecord(b)) pushBlock(b);
    return { text: extractAssistantText(content), calls };
  }
  if (isRecord(content) && content.type === 'tool_use') {
    pushBlock(content);
    return { text: '', calls };
  }
  return { text: extractAssistantText(content), calls };
}

/** Extract the originating `tool_use_id` + result body from a tool_result event. */
function extractToolResult(content: unknown): { toolUseId?: string; content: string } {
  const fromBlock = (b: Record<string, unknown>): { toolUseId?: string; content: string } => ({
    ...(typeof b.tool_use_id === 'string' ? { toolUseId: b.tool_use_id } : {}),
    content: stringifyResultContent(b.content),
  });

  const blocks = claudeBlocks(content);
  if (blocks) {
    const tr = blocks.find((b): b is Record<string, unknown> => isRecord(b) && b.type === 'tool_result');
    if (tr) return fromBlock(tr);
  }
  if (isRecord(content)) {
    if (content.type === 'tool_result') return fromBlock(content);
    if (typeof content.content === 'string') return { content: content.content };
    if (typeof content.output === 'string') return { content: content.output };
  }
  if (typeof content === 'string') return { content };
  return { content: safeStringify(content) };
}

/** A tool_result body is a string OR an array of `{type:'text',text}` blocks. */
function stringifyResultContent(c: unknown): string {
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) {
    return c
      .map((b) => (isRecord(b) && typeof b.text === 'string' ? b.text : safeStringify(b)))
      .join('\n');
  }
  return safeStringify(c);
}

function safeStringify(v: unknown): string {
  try {
    return JSON.stringify(v) ?? '';
  } catch {
    return String(v);
  }
}
