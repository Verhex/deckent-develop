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

import { createHash, randomUUID } from 'node:crypto';
import { constants, createReadStream } from 'node:fs';
import { copyFile, link, open, unlink, type FileHandle } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import type { OpenAiMessage, TraceMeta } from '../agent/trace-recorder.js';
import { redactSensitive } from '../core/redact-sensitive.js';
import { mapTaskEvaluationToLabel, type TaskEvaluationLike } from '../core/trace-labels.js';
import {
  validateHistoricalTraceEnvelope,
  type HistoricalTraceEnvelope,
  type HistoricalTracePolicy,
} from '../core/training-trace-envelope.js';

// ─── ShareGPT types ──────────────────────────────────────────────────────────

export type ShareGptFrom = 'human' | 'gpt' | 'function_call' | 'observation';

export interface ShareGptTurn {
  from: ShareGptFrom;
  value: string;
  /** Tool call/result correlation; omitted from legacy projection bytes. */
  causalId?: string;
}

/** outcome/agent/model — the exact 3 fields TRN-4 asks for; omitted keys are simply absent. */
export interface ShareGptLabels {
  outcome?: string;
  agent?: string;
  model?: string;
  /** Kept distinct from an accepted Brain verdict in structured-v2 output. */
  workerClaim?: string;
}

/** Stable causal/provenance fields carried only by the versioned projection. */
export interface CorpusProvenance {
  schemaVersion?: 1;
  migrationId?: string;
  policyDigest?: string;
  recordId?: string;
  sourcePath?: string;
  sourceLine?: number;
  sourceFileDigest?: string;
  contentDigest?: string;
  taskId?: string;
  sprintId?: string;
  attemptId?: string;
  attemptNumber?: number;
  source?: string;
  disposition?: string;
  integrity?: string;
  duplicateOf?: string[];
  verdictAuthority?: 'trace-meta-brain-evaluation';
}

export interface ShareGptExample {
  conversations: ShareGptTurn[];
  system?: string;
  labels?: ShareGptLabels;
  provenance?: CorpusProvenance;
  /** A zero weight is a retained duplicate statistic, never a deletion instruction. */
  weight?: number;
}

const VALID_FROM: ReadonlySet<string> = new Set<ShareGptFrom>(['human', 'gpt', 'function_call', 'observation']);
const SHA256_RE = /^[a-f0-9]{64}$/;

function isNonEmptyOptionalString(value: unknown): boolean {
  return value === undefined || (typeof value === 'string' && value.length > 0);
}

function isValidCorpusProvenance(value: unknown): value is CorpusProvenance {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const p = value as Record<string, unknown>;
  if (p['schemaVersion'] === 1) {
    if (typeof p['migrationId'] !== 'string' || !SHA256_RE.test(p['migrationId'])) return false;
    if (typeof p['policyDigest'] !== 'string' || !SHA256_RE.test(p['policyDigest'])) return false;
    if (typeof p['recordId'] !== 'string' || !SHA256_RE.test(p['recordId'])) return false;
    if (typeof p['sourcePath'] !== 'string' || p['sourcePath'].length === 0 || p['sourcePath'].includes('\\')) return false;
    if (!Number.isInteger(p['sourceLine']) || (p['sourceLine'] as number) <= 0) return false;
    if (typeof p['sourceFileDigest'] !== 'string' || !SHA256_RE.test(p['sourceFileDigest'])) return false;
    if (typeof p['contentDigest'] !== 'string' || !SHA256_RE.test(p['contentDigest'])) return false;
    if (p['disposition'] !== 'train-ready' || p['integrity'] !== 'verified') return false;
    if (!Array.isArray(p['duplicateOf']) || p['duplicateOf'].some(ref => typeof ref !== 'string' || !SHA256_RE.test(ref))) return false;
    if (p['verdictAuthority'] !== undefined && p['verdictAuthority'] !== 'trace-meta-brain-evaluation') return false;
  }
  for (const key of ['taskId', 'sprintId', 'attemptId', 'source', 'disposition', 'integrity'] as const) {
    if (!isNonEmptyOptionalString(p[key])) return false;
  }
  if (p['attemptNumber'] !== undefined && (!Number.isInteger(p['attemptNumber']) || (p['attemptNumber'] as number) <= 0)) return false;
  return true;
}

/** Structural guard proving a value is a well-formed ShareGPT example. */
export function isValidShareGptExample(x: unknown): x is ShareGptExample {
  if (typeof x !== 'object' || x === null) return false;
  const o = x as Record<string, unknown>;

  if (!Array.isArray(o['conversations'])) return false;
  const causalCalls = new Set<string>();
  for (const turn of o['conversations']) {
    if (typeof turn !== 'object' || turn === null) return false;
    const t = turn as Record<string, unknown>;
    if (typeof t['from'] !== 'string' || !VALID_FROM.has(t['from'])) return false;
    if (typeof t['value'] !== 'string') return false;
    if ('causalId' in t && t['causalId'] !== undefined && (typeof t['causalId'] !== 'string' || t['causalId'].length === 0)) return false;
    if (t['from'] === 'function_call' && typeof t['causalId'] === 'string') {
      if (causalCalls.has(t['causalId'])) return false;
      causalCalls.add(t['causalId']);
    }
    if (t['from'] === 'observation' && typeof t['causalId'] === 'string' && !causalCalls.has(t['causalId'])) return false;
  }

  if ('system' in o && o['system'] !== undefined && typeof o['system'] !== 'string') return false;
  if ('labels' in o && o['labels'] !== undefined) {
    if (typeof o['labels'] !== 'object' || o['labels'] === null || Array.isArray(o['labels'])) return false;
    const labels = o['labels'] as Record<string, unknown>;
    for (const key of ['outcome', 'agent', 'model', 'workerClaim'] as const) {
      if (!isNonEmptyOptionalString(labels[key])) return false;
    }
  }
  if ('provenance' in o && o['provenance'] !== undefined && !isValidCorpusProvenance(o['provenance'])) return false;
  if ('weight' in o && o['weight'] !== undefined && (typeof o['weight'] !== 'number' || !Number.isFinite(o['weight']) || o['weight'] < 0)) return false;

  const provenance = o['provenance'] as CorpusProvenance | undefined;
  if (provenance?.schemaVersion === 1) {
    if (typeof o['weight'] !== 'number' || !Number.isFinite(o['weight']) || o['weight'] <= 0) return false;
    if (o['labels'] && typeof o['labels'] === 'object' && (o['labels'] as ShareGptLabels).outcome !== undefined
        && provenance.verdictAuthority !== 'trace-meta-brain-evaluation') return false;
    for (const turn of o['conversations'] as ShareGptTurn[]) {
      if ((turn.from === 'function_call' || turn.from === 'observation') && !turn.causalId) return false;
    }
  }

  return true;
}

// ─── Trace input shape (TRN-1/2/3 TrainingExample, meta optional) ───────────

export interface TraceLike {
  messages: Array<OpenAiMessage | Record<string, unknown>>;
  meta?: Partial<TraceMeta>;
  provenance?: CorpusProvenance;
  /** Accepted evaluation is evidence from Brain, never inferred from worker self-claim. */
  acceptedVerdict?: string;
  /** Durable authority reference required before acceptedVerdict can label structured output. */
  acceptedVerdictAuthorityRef?: string;
  duplicateWeight?: number;
  canonicalEnvelope?: HistoricalTraceEnvelope;
}

export type ParseTraceLineResult =
  | { ok: true; trace: TraceLike }
  | { ok: false; reason: 'MALFORMED_JSON' | 'MISSING_MESSAGES' | 'INVALID_ENVELOPE' };

/** Normalizes OpenAI string and structured content without dropping non-text blocks. */
export function normalizeContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) {
    if (content === undefined || content === null) return '';
    return JSON.stringify(content);
  }
  return content.map((block) => {
    if (typeof block === 'string') return block;
    if (typeof block === 'object' && block !== null) {
      const value = block as Record<string, unknown>;
      if (typeof value['text'] === 'string') return value['text'];
      if (typeof value['content'] === 'string') return value['content'];
    }
    return JSON.stringify(block);
  }).join('\n');
}

/** Typed parser used by the stream to account for a rejected input record. */
export function parseTraceLineDetailed(raw: string): ParseTraceLineResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reason: 'MALFORMED_JSON' };
  }
  if (typeof parsed !== 'object' || parsed === null) return { ok: false, reason: 'INVALID_ENVELOPE' };
  const obj = parsed as Record<string, unknown>;
  if (!Array.isArray(obj['messages'])) return { ok: false, reason: 'MISSING_MESSAGES' };

  const isCanonical = obj['schemaVersion'] === 1
    && typeof obj['source'] === 'object' && obj['source'] !== null
    && typeof obj['governance'] === 'object' && obj['governance'] !== null
    && typeof obj['executionLineage'] === 'object' && obj['executionLineage'] !== null
    && typeof obj['integrity'] === 'object' && obj['integrity'] !== null
    && typeof obj['disposition'] === 'string';
  if (isCanonical) {
    return {
      ok: true,
      trace: {
        messages: [],
        canonicalEnvelope: obj as unknown as HistoricalTraceEnvelope,
      },
    };
  }

  const meta = obj['meta'];
  const provenanceCandidate = obj['provenance'];
  const nestedProvenance = typeof provenanceCandidate === 'object' && provenanceCandidate !== null
    ? provenanceCandidate as CorpusProvenance
    : {};
  const provenance: CorpusProvenance = {
    ...nestedProvenance,
    ...(typeof obj['taskId'] === 'string' ? { taskId: obj['taskId'] } : {}),
    ...(typeof obj['sprintId'] === 'string' ? { sprintId: obj['sprintId'] } : {}),
    ...(typeof obj['attemptId'] === 'string' ? { attemptId: obj['attemptId'] } : {}),
  };
  return {
    ok: true,
    trace: {
      messages: obj['messages'] as Array<OpenAiMessage | Record<string, unknown>>,
      ...(typeof meta === 'object' && meta !== null ? { meta: meta as Partial<TraceMeta> } : {}),
      ...(Object.keys(provenance).length > 0 ? { provenance } : {}),
      ...(typeof obj['acceptedVerdict'] === 'string' ? { acceptedVerdict: obj['acceptedVerdict'] } : {}),
      ...(typeof obj['acceptedVerdictAuthorityRef'] === 'string' ? { acceptedVerdictAuthorityRef: obj['acceptedVerdictAuthorityRef'] } : {}),
      ...(typeof obj['duplicateWeight'] === 'number' ? { duplicateWeight: obj['duplicateWeight'] } : {}),
    },
  };
}

/** Best-effort compatibility parser for legacy callers. */
export function parseTraceLine(raw: string): TraceLike | null {
  const result = parseTraceLineDetailed(raw);
  return result.ok ? result.trace : null;
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

const KNOWN_TASK_EVALUATIONS: ReadonlySet<TaskEvaluationLike> = new Set([
  'DONE',
  'GO_WITH_TECH_DEBT',
  'NO_GO',
  'DEFERRED',
  'NOT_DISPATCHED',
]);

function isTaskEvaluationLike(value: string): value is TaskEvaluationLike {
  return KNOWN_TASK_EVALUATIONS.has(value as TaskEvaluationLike);
}

/**
 * Route a raw `meta.selfAssessment` string through the RunOutcomeLabel taxonomy
 * (src/core/trace-labels.ts) when it is one of the 5 known TaskEvaluation values.
 * `mapTaskEvaluationToLabel`'s param type is a closed union with no "unknown"
 * slot, so it structurally cannot accept anything else — an unrecognized/legacy
 * value passes through unchanged rather than being dishonestly folded into
 * 'failed'.
 */
function normalizeOutcome(raw: string): string {
  return isTaskEvaluationLike(raw) ? mapTaskEvaluationToLabel(raw) : raw;
}

function buildLabels(
  meta: Partial<TraceMeta> | undefined,
  acceptedVerdict: string | undefined,
  acceptedVerdictAuthorityRef: string | undefined,
  mode: OutputProjectionMode,
): ShareGptLabels | undefined {
  if (meta === undefined && acceptedVerdict === undefined) return undefined;
  const labels: ShareGptLabels = {};
  if (mode === 'legacy' && meta?.selfAssessment !== undefined) labels.outcome = normalizeOutcome(meta.selfAssessment);
  if (mode === 'structured-v2'
      && acceptedVerdictAuthorityRef !== undefined
      && acceptedVerdictAuthorityRef.length > 0
      && acceptedVerdict !== undefined
      && isTaskEvaluationLike(acceptedVerdict)) labels.outcome = normalizeOutcome(acceptedVerdict);
  if (mode === 'structured-v2' && meta?.selfAssessment !== undefined) labels.workerClaim = meta.selfAssessment;
  if (meta?.agent !== undefined) labels.agent = meta.agent;
  if (meta?.model !== undefined) labels.model = meta.model;
  return Object.keys(labels).length > 0 ? labels : undefined;
}

/**
 * Convert one TRN-1/2/3 trace into a ShareGPT example. The system message
 * (always present per trace-recorder.ts's toTrainingExample/toSprintTrainingExample)
 * becomes the top-level `system` field, never a conversation turn.
 */
export type OutputProjectionMode = 'legacy' | 'structured-v2' | 'canonical-v1';

export interface CanonicalCorpusAuthority {
  readonly migrationId: string;
  readonly codeVersion: string;
  readonly envelopeSchemaVersion: 1;
  readonly policyVersion: string;
  readonly contractVersion: string;
  readonly policy: HistoricalTracePolicy;
  readonly policyDigest: string;
  readonly sourceDigest: string;
  readonly projectionDigest: string;
}

export type TrainingCorpusPipelineErrorCode =
  | 'CANONICAL_AUTHORITY_REQUIRED'
  | 'CANONICAL_AUTHORITY_INVALID'
  | 'CANONICAL_SOURCE_DIGEST_MISMATCH'
  | 'CANONICAL_ENVELOPE_INVALID'
  | 'CANONICAL_RECORD_NOT_ADMITTED'
  | 'OUTPUT_INPUT_OVERLAP'
  | 'OUTPUT_CONFLICT'
  | 'CONVERSION_FAILED';

export class TrainingCorpusPipelineError extends Error {
  constructor(
    readonly code: TrainingCorpusPipelineErrorCode,
    readonly details: Readonly<Record<string, unknown>> = {},
  ) {
    super(`${code}${Object.keys(details).length > 0 ? `: ${JSON.stringify(details)}` : ''}`);
    this.name = 'TrainingCorpusPipelineError';
  }
}

export function convertToShareGpt(trace: TraceLike, mode: OutputProjectionMode = 'legacy'): ShareGptExample {
  if (mode === 'canonical-v1') {
    throw new TrainingCorpusPipelineError('CANONICAL_AUTHORITY_REQUIRED');
  }
  const conversations: ShareGptTurn[] = [];
  let system: string | undefined;

  for (const input of trace.messages) {
    const msg = input as Record<string, unknown>;
    const role = msg['role'];
    const content = normalizeContent(msg['content']);
    if (typeof role !== 'string') throw new Error('INVALID_MESSAGE_ROLE');
    if (role === 'system') {
      if (system === undefined) system = content;
      continue;
    }
    if (role === 'user') {
      conversations.push({ from: 'human', value: content });
      continue;
    }
    if (role === 'tool') {
      conversations.push({ from: 'observation', value: content, ...(mode === 'structured-v2' && typeof msg['tool_call_id'] === 'string' ? { causalId: msg['tool_call_id'] } : {}) });
      continue;
    }
    if (role !== 'assistant') throw new Error('INVALID_MESSAGE_ROLE');
    // assistant
    if (content.length > 0) {
      conversations.push({ from: 'gpt', value: content });
    }
    const toolCalls = Array.isArray(msg['tool_calls']) ? msg['tool_calls'] : [];
    for (const call of toolCalls as NonNullable<OpenAiMessage['tool_calls']>) {
      conversations.push({ from: 'function_call', value: toFunctionCallValue(call), ...(mode === 'structured-v2' && typeof call.id === 'string' ? { causalId: call.id } : {}) });
    }
  }

  const example: ShareGptExample = { conversations };
  if (system !== undefined) example.system = system;
  const labels = buildLabels(trace.meta, trace.acceptedVerdict, trace.acceptedVerdictAuthorityRef, mode);
  if (labels !== undefined) example.labels = labels;
  if (mode === 'structured-v2' && trace.provenance !== undefined) example.provenance = trace.provenance;
  const weight = trace.duplicateWeight;
  if (mode === 'structured-v2' && typeof weight === 'number' && Number.isFinite(weight) && weight >= 0) example.weight = weight;
  return example;
}

function stableJson(value: unknown): string {
  const visit = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(visit);
    if (item !== null && typeof item === 'object') {
      return Object.fromEntries(Object.keys(item as Record<string, unknown>).sort().map(key => [key, visit((item as Record<string, unknown>)[key])]));
    }
    return item;
  };
  return JSON.stringify(visit(value));
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function validateCanonicalCorpusAuthority(authority: CanonicalCorpusAuthority): void {
  if (!SHA256_RE.test(authority.migrationId)
      || !SHA256_RE.test(authority.policyDigest)
      || !SHA256_RE.test(authority.sourceDigest)
      || !SHA256_RE.test(authority.projectionDigest)
      || authority.envelopeSchemaVersion !== 1
      || authority.codeVersion.length === 0
      || authority.policyVersion.length === 0
      || authority.contractVersion.length === 0) {
    throw new TrainingCorpusPipelineError('CANONICAL_AUTHORITY_INVALID', { reason: 'shape' });
  }
  const expectedPolicyDigest = sha256(stableJson({
    policy: authority.policy,
    policyVersion: authority.policyVersion,
    contractVersion: authority.contractVersion,
  }));
  if (expectedPolicyDigest !== authority.policyDigest) {
    throw new TrainingCorpusPipelineError('CANONICAL_AUTHORITY_INVALID', { reason: 'policy-digest' });
  }
  const expectedMigrationId = sha256(stableJson({
    codeVersion: authority.codeVersion,
    envelopeSchemaVersion: authority.envelopeSchemaVersion,
    policyDigest: authority.policyDigest,
    sourceDigest: authority.sourceDigest,
  }));
  if (expectedMigrationId !== authority.migrationId) {
    throw new TrainingCorpusPipelineError('CANONICAL_AUTHORITY_INVALID', { reason: 'migration-id' });
  }
}

function canonicalFunctionCall(name: string, argumentsJson: string): string {
  let args: unknown = argumentsJson;
  try { args = JSON.parse(argumentsJson); } catch { /* preserve opaque observed arguments */ }
  return JSON.stringify({ name, arguments: args });
}

/** Convert only a validated, manifest-authorized train-ready canonical envelope. */
export function convertCanonicalEnvelope(
  envelope: HistoricalTraceEnvelope,
  authority: CanonicalCorpusAuthority,
): ShareGptExample {
  validateCanonicalCorpusAuthority(authority);
  const validation = validateHistoricalTraceEnvelope(envelope, authority.policy);
  if (!validation.ok) throw new TrainingCorpusPipelineError('CANONICAL_ENVELOPE_INVALID', { errors: validation.errors });
  if (envelope.disposition !== 'train-ready'
      || envelope.integrity.sourceIntegrityVerified !== true
      || envelope.duplicateOf.length > 0
      || typeof envelope.trainingWeight !== 'number'
      || envelope.trainingWeight <= 0) {
    throw new TrainingCorpusPipelineError('CANONICAL_RECORD_NOT_ADMITTED', { recordId: envelope.source.recordId, disposition: envelope.disposition });
  }

  const conversations: ShareGptTurn[] = [];
  const systems: string[] = [];
  for (const message of envelope.messages) {
    const texts = message.content.filter((block): block is { type: 'text'; text: string } => block.type === 'text');
    const calls = message.content.filter((block): block is { type: 'tool-call'; toolCallId: string | null; name: string | null; argumentsJson: string | null } => block.type === 'tool-call');
    const results = message.content.filter((block): block is { type: 'tool-result'; toolCallId: string | null; content: string | null } => block.type === 'tool-result');
    const text = texts.map(block => block.text).join('\n');
    if (message.role === 'system') {
      if (calls.length > 0 || results.length > 0) throw new TrainingCorpusPipelineError('CONVERSION_FAILED', { reason: 'system-tool-block' });
      if (text.length > 0) systems.push(text);
      continue;
    }
    if (message.role === 'user') {
      if (calls.length > 0 || results.length > 0) throw new TrainingCorpusPipelineError('CONVERSION_FAILED', { reason: 'user-tool-block' });
      if (text.length > 0) conversations.push({ from: 'human', value: text });
      continue;
    }
    if (message.role === 'assistant') {
      if (results.length > 0) throw new TrainingCorpusPipelineError('CONVERSION_FAILED', { reason: 'assistant-tool-result' });
      if (text.length > 0) conversations.push({ from: 'gpt', value: text });
      for (const call of calls) {
        if (!call.toolCallId || !call.name || call.argumentsJson === null) throw new TrainingCorpusPipelineError('CONVERSION_FAILED', { reason: 'incomplete-tool-call' });
        conversations.push({ from: 'function_call', value: canonicalFunctionCall(call.name, call.argumentsJson), causalId: call.toolCallId });
      }
      continue;
    }
    if (message.role === 'tool') {
      if (calls.length > 0 || text.length > 0) throw new TrainingCorpusPipelineError('CONVERSION_FAILED', { reason: 'tool-message-shape' });
      for (const result of results) {
        if (!result.toolCallId || result.content === null) throw new TrainingCorpusPipelineError('CONVERSION_FAILED', { reason: 'incomplete-tool-result' });
        conversations.push({ from: 'observation', value: result.content, causalId: result.toolCallId });
      }
      continue;
    }
    throw new TrainingCorpusPipelineError('CONVERSION_FAILED', { reason: 'unsupported-message-role' });
  }

  const labels: ShareGptLabels = {};
  const verdict = envelope.executionLineage.verdict;
  if (verdict && isTaskEvaluationLike(verdict)) labels.outcome = normalizeOutcome(verdict);
  const workerClaim = envelope.executionLineage.workerSelfAssessment;
  if (workerClaim && isTaskEvaluationLike(workerClaim)) labels.workerClaim = workerClaim;
  if (envelope.executionLineage.agent) labels.agent = envelope.executionLineage.agent;
  if (envelope.executionLineage.model) labels.model = envelope.executionLineage.model;
  const example: ShareGptExample = {
    conversations,
    provenance: {
      schemaVersion: 1,
      migrationId: authority.migrationId,
      policyDigest: authority.policyDigest,
      recordId: envelope.source.recordId,
      sourcePath: envelope.source.projectRelativePath,
      sourceLine: envelope.source.line,
      sourceFileDigest: envelope.source.fileDigest,
      contentDigest: envelope.source.contentDigest,
      disposition: 'train-ready',
      integrity: 'verified',
      duplicateOf: [],
      ...(envelope.executionLineage.taskId ? { taskId: envelope.executionLineage.taskId } : {}),
      ...(envelope.executionLineage.sprintId ? { sprintId: envelope.executionLineage.sprintId } : {}),
      ...(envelope.executionLineage.attemptId ? { attemptId: envelope.executionLineage.attemptId } : {}),
      ...(envelope.executionLineage.attemptNumber ? { attemptNumber: envelope.executionLineage.attemptNumber } : {}),
      ...(labels.outcome ? { verdictAuthority: 'trace-meta-brain-evaluation' as const } : {}),
    },
    weight: envelope.trainingWeight,
  };
  if (systems.length > 0) example.system = systems.join('\n');
  if (Object.keys(labels).length > 0) example.labels = labels;
  if (!isValidShareGptExample(example) || conversations.length === 0) {
    throw new TrainingCorpusPipelineError('CONVERSION_FAILED', { reason: 'invalid-sharegpt-projection' });
  }
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
export function traceToShareGpt(trace: TraceLike, policy: TruncationPolicy = DEFAULT_TRUNCATION_POLICY, mode: OutputProjectionMode = 'legacy'): TraceToShareGptResult {
  const converted = convertToShareGpt(trace, mode);
  const passA = redactShareGptExample(converted);
  const { example: compressed, truncated } = compressToolResults(passA.example, policy);
  const passB = redactShareGptExample(compressed);
  return { example: passB.example, truncated, redacted: passA.redacted || passB.redacted };
}

// ─── Streaming driver (line-in, line-out — memory-safe for large traces) ───

export interface LineSink {
  write(line: string): void | Promise<void>;
  close(): Promise<void>;
  abort?(): Promise<void>;
  outputDigest?(): string | null;
  candidatePath?(): string | null;
  publishManifest?(manifestPath: string, manifest: PipelineManifest): Promise<void>;
}

function defaultOpenLines(filePath: string): AsyncIterable<string> {
  return createInterface({ input: createReadStream(filePath), crlfDelay: Infinity });
}

async function fsyncDirectory(path: string): Promise<void> {
  let handle: FileHandle | null = null;
  try {
    handle = await open(path, constants.O_RDONLY);
    await handle.sync();
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== 'EINVAL' && code !== 'EPERM' && code !== 'EISDIR' && code !== 'ENOTSUP') throw error;
  } finally {
    if (handle) await handle.close();
  }
}

async function digestFile(filePath: string): Promise<string> {
  const handle = await open(filePath, constants.O_RDONLY);
  const hash = createHash('sha256');
  try {
    for await (const part of handle.createReadStream({ autoClose: false })) hash.update(part as Buffer);
    return hash.digest('hex');
  } finally {
    await handle.close();
  }
}

class AtomicCorpusSink implements LineSink {
  private readonly hash = createHash('sha256');
  private finalDigest: string | null = null;
  private closed = false;

  private constructor(
    private readonly outputPath: string,
    private readonly temporaryPath: string,
    private handle: FileHandle | null,
  ) {}

  static async create(outputPath: string): Promise<AtomicCorpusSink> {
    const temporaryPath = `${outputPath}.pipeline-${randomUUID()}.tmp`;
    const handle = await open(temporaryPath, 'wx', 0o600);
    return new AtomicCorpusSink(outputPath, temporaryPath, handle);
  }

  async write(line: string): Promise<void> {
    if (this.closed || !this.handle) throw new Error('corpus sink is closed');
    const bytes = Buffer.from(line + '\n', 'utf8');
    this.hash.update(bytes);
    let offset = 0;
    while (offset < bytes.length) {
      const result = await this.handle.write(bytes, offset, bytes.length - offset, null);
      offset += result.bytesWritten;
    }
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    if (this.handle) {
      await this.handle.sync();
      await this.handle.close();
      this.handle = null;
    }
    this.finalDigest = this.hash.digest('hex');
  }

  outputDigest(): string | null { return this.finalDigest; }
  candidatePath(): string | null { return this.temporaryPath; }

  async abort(): Promise<void> {
    if (this.handle) {
      try { await this.handle.close(); } catch { /* cleanup only */ }
      this.handle = null;
    }
    try { await unlink(this.temporaryPath); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }

  async publishManifest(manifestPath: string, manifest: PipelineManifest): Promise<void> {
    if (!this.closed || !this.finalDigest) throw new Error('corpus sink must be closed before publication');
    let outputOwned = false;
    let manifestOwned = false;
    try {
      try {
        await link(this.temporaryPath, this.outputPath);
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === 'EEXIST') throw new TrainingCorpusPipelineError('OUTPUT_CONFLICT', { path: this.outputPath });
        if (code === 'EXDEV' || code === 'EPERM' || code === 'ENOSYS' || code === 'ENOTSUP' || code === 'EOPNOTSUPP') {
          try { await copyFile(this.temporaryPath, this.outputPath, constants.COPYFILE_EXCL); }
          catch (copyError) {
            if ((copyError as NodeJS.ErrnoException).code === 'EEXIST') throw new TrainingCorpusPipelineError('OUTPUT_CONFLICT', { path: this.outputPath });
            throw copyError;
          }
        } else {
          throw error;
        }
      }
      outputOwned = true;
      if (await digestFile(this.outputPath) !== this.finalDigest) throw new Error('published corpus digest mismatch');
      const manifestHandle = await open(manifestPath, 'wx', 0o600);
      manifestOwned = true;
      try {
        await manifestHandle.writeFile(stableJson(manifest) + '\n', 'utf8');
        await manifestHandle.sync();
      } finally {
        await manifestHandle.close();
      }
      await fsyncDirectory(dirname(this.outputPath));
      await unlink(this.temporaryPath);
    } catch (error) {
      if (manifestOwned) { try { await unlink(manifestPath); } catch { /* cleanup only */ } }
      if (outputOwned) { try { await unlink(this.outputPath); } catch { /* cleanup only */ } }
      throw error;
    }
  }
}

export interface PipelineOptions {
  inputPath: string;
  outputPath: string;
  policy?: TruncationPolicy;
  /** Legacy is byte-compatible; structured-v2 carries canonical provenance and separated verdict signals. */
  projectionMode?: OutputProjectionMode;
  /** Required for canonical-v1. Normally read from migration manifest.json. */
  canonicalAuthority?: CanonicalCorpusAuthority;
  /** Defaults to `${outputPath}.manifest.json`; published after corpus bytes. */
  manifestPath?: string;
  /** Injectable line source (hermetic tests). Defaults to a real readline stream over inputPath. */
  openLines?: (filePath: string) => AsyncIterable<string>;
  /** Injectable line sink (hermetic tests). Defaults to a real write stream at outputPath. */
  openSink?: (filePath: string) => LineSink | Promise<LineSink>;
  /** Hermetic/platform adapter; default hashes the real input file before and after. */
  verifyInputDigest?: (filePath: string, expectedDigest: string) => boolean | Promise<boolean>;
  /** Runs against the fsynced private candidate before no-clobber publication. */
  prePublishValidate?: (candidatePath: string, manifest: PipelineManifest) => void | Promise<void>;
}

export interface PipelineSummary {
  linesRead: number;
  examplesWritten: number;
  skippedMalformed: number;
  truncatedCount: number;
  redactedCount: number;
  /** TT552 (TRACE-V2) — records held OUT of the clean corpus: a v2
   *  `meta.quarantine` stamp (promptless / orphan-tool / incomplete) or a
   *  v1 `envelope-fallback` reconstruction (no prompt, no tool-flow). Counted,
   *  never silently dropped. */
  quarantinedSkipped: number;
  auxiliaryCount: number;
  duplicateWeightZeroCount: number;
  conversionFailedCount: number;
  conversionFailureReasons: Record<string, number>;
  parseFailureReasons: Record<string, number>;
  policyRejectedCount: number;
  canonicalRecordsSeen: number;
  /** Reconciled count view suitable for an external manifest writer. */
  manifest: PipelineManifest;
}

export interface PipelineManifest {
  schemaVersion: 1;
  codeVersion: 'training-corpus-pipeline/v2';
  projectionMode: OutputProjectionMode;
  migrationId: string | null;
  policyDigest: string | null;
  inputDigest: string | null;
  outputDigest: string | null;
  linesRead: number;
  examplesWritten: number;
  skippedMalformed: number;
  quarantinedSkipped: number;
  auxiliaryCount: number;
  duplicateWeightZeroCount: number;
  redactedCount: number;
  truncatedCount: number;
  conversionFailedCount: number;
  policyRejectedCount: number;
  canonicalRecordsSeen: number;
  parseFailureReasons: Readonly<Record<string, number>>;
  conversionFailureReasons: Readonly<Record<string, number>>;
}

/**
 * TT552 dual-read corpus gate: a trace is corpus-EXCLUDED when the v2 builder
 * stamped `meta.quarantine` (incomplete/promptless/orphan-bearing) OR it is a
 * v1 `envelope-fallback` reconstruction (an inherently incomplete record — no
 * prompt, no real tool-flow). Excluding both closes the "quarantine'siz
 * kesik-kayıt corpus'a girer" NO_GO: no incomplete record silently trains.
 */
export function isCorpusExcluded(trace: TraceLike): boolean {
  if (trace.canonicalEnvelope) return trace.canonicalEnvelope.disposition !== 'train-ready';
  return trace.meta?.quarantine === true || trace.meta?.contentSource === 'envelope-fallback';
}

function conversionFailureCode(error: unknown): string {
  if (error instanceof TrainingCorpusPipelineError) return error.code;
  if (error instanceof Error && error.message === 'INVALID_MESSAGE_ROLE') return 'INVALID_MESSAGE_ROLE';
  return 'CONVERSION_FAILED';
}

/**
 * Streams `opts.inputPath` (one TRN-1/2/3 trace JSONL per line) into
 * `opts.outputPath` (one ShareGPT example JSONL per line). Reads via
 * node:readline (never `readFileSync`+split — no whole-file-in-memory),
 * writes one line at a time. Malformed input lines are skipped, not thrown.
 */
export async function runPipeline(opts: PipelineOptions): Promise<PipelineSummary> {
  const policy = opts.policy ?? DEFAULT_TRUNCATION_POLICY;
  const projectionMode = opts.projectionMode ?? 'legacy';
  const authority = opts.canonicalAuthority;
  if (projectionMode === 'canonical-v1') {
    if (!authority) throw new TrainingCorpusPipelineError('CANONICAL_AUTHORITY_REQUIRED');
    validateCanonicalCorpusAuthority(authority);
  } else if (authority) {
    throw new TrainingCorpusPipelineError('CANONICAL_AUTHORITY_INVALID', { reason: 'authority-requires-canonical-mode' });
  }
  if (resolve(opts.inputPath) === resolve(opts.outputPath)) throw new TrainingCorpusPipelineError('OUTPUT_INPUT_OVERLAP');
  const openLines = opts.openLines ?? defaultOpenLines;
  const usingDefaultSink = opts.openSink === undefined;
  const openSink = opts.openSink ?? AtomicCorpusSink.create;

  const verifyDigest = opts.verifyInputDigest ?? (async (path: string, expected: string) => await digestFile(path) === expected);
  let verifiedInputDigest: string | null = null;
  if (authority) {
    if (!await verifyDigest(opts.inputPath, authority.projectionDigest)) {
      throw new TrainingCorpusPipelineError('CANONICAL_SOURCE_DIGEST_MISMATCH', { phase: 'pre' });
    }
    verifiedInputDigest = authority.projectionDigest;
  }

  const lines = openLines(opts.inputPath);
  const sink = await openSink(opts.outputPath);

  const summary: Omit<PipelineSummary, 'manifest'> = {
    linesRead: 0,
    examplesWritten: 0,
    skippedMalformed: 0,
    truncatedCount: 0,
    redactedCount: 0,
    quarantinedSkipped: 0,
    auxiliaryCount: 0,
    duplicateWeightZeroCount: 0,
    conversionFailedCount: 0,
    conversionFailureReasons: {},
    parseFailureReasons: {},
    policyRejectedCount: 0,
    canonicalRecordsSeen: 0,
  };

  let sinkClosed = false;
  try {
    for await (const raw of lines) {
      if (raw.length === 0) continue;
      summary.linesRead++;

      const parsed = parseTraceLineDetailed(raw);
      if (!parsed.ok) {
        summary.skippedMalformed++;
        summary.parseFailureReasons[parsed.reason] = (summary.parseFailureReasons[parsed.reason] ?? 0) + 1;
        continue;
      }
      const trace = parsed.trace;

      if (trace.canonicalEnvelope) {
        summary.canonicalRecordsSeen++;
        if (projectionMode !== 'canonical-v1' || !authority) throw new TrainingCorpusPipelineError('CANONICAL_AUTHORITY_REQUIRED');
        const validation = validateHistoricalTraceEnvelope(trace.canonicalEnvelope, authority.policy);
        if (!validation.ok) throw new TrainingCorpusPipelineError('CANONICAL_ENVELOPE_INVALID', { errors: validation.errors });
        if (isCorpusExcluded(trace)) {
          summary.quarantinedSkipped++;
          summary.policyRejectedCount++;
          continue;
        }
        let converted: TraceToShareGptResult;
        try {
          const rawExample = convertCanonicalEnvelope(trace.canonicalEnvelope, authority);
          const passA = redactShareGptExample(rawExample);
          const compressed = compressToolResults(passA.example, policy);
          const passB = redactShareGptExample(compressed.example);
          converted = { example: passB.example, truncated: compressed.truncated, redacted: passA.redacted || passB.redacted };
        } catch (error) {
          summary.conversionFailedCount++;
          const reason = conversionFailureCode(error);
          summary.conversionFailureReasons[reason] = (summary.conversionFailureReasons[reason] ?? 0) + 1;
          throw error;
        }
        if (converted.truncated) summary.truncatedCount++;
        if (converted.redacted) summary.redactedCount++;
        await sink.write(JSON.stringify(converted.example));
        summary.examplesWritten++;
        continue;
      }

      if (projectionMode === 'canonical-v1') {
        throw new TrainingCorpusPipelineError('CANONICAL_ENVELOPE_INVALID', { reason: 'mixed-legacy-record' });
      }

      // TT552 dual-read gate: quarantined / envelope-fallback incomplete
      // records are counted and held OUT of the corpus (never silently trained).
      if (isCorpusExcluded(trace)) {
        summary.quarantinedSkipped++;
        continue;
      }

      const rawMeta = trace.meta as Record<string, unknown> | undefined;
      if (rawMeta?.['disposition'] === 'auxiliary' || trace.provenance?.disposition === 'auxiliary') summary.auxiliaryCount++;
      if (trace.duplicateWeight === 0) summary.duplicateWeightZeroCount++;

      let example: ShareGptExample;
      try {
        const converted = traceToShareGpt(trace, policy, projectionMode);
        example = converted.example;
        const { truncated, redacted } = converted;
        if (truncated) summary.truncatedCount++;
        if (redacted) summary.redactedCount++;
      } catch (error) {
        const reason = conversionFailureCode(error);
        summary.conversionFailedCount++;
        summary.conversionFailureReasons[reason] = (summary.conversionFailureReasons[reason] ?? 0) + 1;
        continue;
      }
      // I/O failures are operational failures, not conversion failures: surface them to the caller.
      await sink.write(JSON.stringify(example));
      summary.examplesWritten++;
    }
    await sink.close();
    sinkClosed = true;
    if (authority && !await verifyDigest(opts.inputPath, authority.projectionDigest)) {
      throw new TrainingCorpusPipelineError('CANONICAL_SOURCE_DIGEST_MISMATCH', { phase: 'post' });
    }
  } catch (error) {
    if (sink.abort) await sink.abort();
    else if (!sinkClosed) await sink.close();
    throw error;
  }

  const manifest: PipelineManifest = {
    schemaVersion: 1,
    codeVersion: 'training-corpus-pipeline/v2',
    projectionMode,
    migrationId: authority?.migrationId ?? null,
    policyDigest: authority?.policyDigest ?? null,
    inputDigest: verifiedInputDigest,
    outputDigest: sink.outputDigest?.() ?? null,
    linesRead: summary.linesRead,
    examplesWritten: summary.examplesWritten,
    skippedMalformed: summary.skippedMalformed,
    quarantinedSkipped: summary.quarantinedSkipped,
    auxiliaryCount: summary.auxiliaryCount,
    duplicateWeightZeroCount: summary.duplicateWeightZeroCount,
    redactedCount: summary.redactedCount,
    truncatedCount: summary.truncatedCount,
    conversionFailedCount: summary.conversionFailedCount,
    policyRejectedCount: summary.policyRejectedCount,
    canonicalRecordsSeen: summary.canonicalRecordsSeen,
    parseFailureReasons: summary.parseFailureReasons,
    conversionFailureReasons: summary.conversionFailureReasons,
  };
  if (usingDefaultSink && sink.publishManifest) {
    try {
      const candidatePath = sink.candidatePath?.();
      if (opts.prePublishValidate) {
        if (!candidatePath) throw new TrainingCorpusPipelineError('OUTPUT_CONFLICT', { reason: 'candidate-unavailable' });
        await opts.prePublishValidate(candidatePath, manifest);
      }
      await sink.publishManifest(opts.manifestPath ?? `${opts.outputPath}.manifest.json`, manifest);
    } catch (error) {
      if (sink.abort) await sink.abort();
      throw error;
    }
  }
  return { ...summary, manifest };
}
