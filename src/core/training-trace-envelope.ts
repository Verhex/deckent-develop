/**
 * Evidence-bound canonical envelope for historical training traces.
 *
 * This module is intentionally pure. It never reads files, resolves paths,
 * grants consent, infers absent execution facts, or admits a record for
 * training without an explicit policy decision.
 */

import { createHash } from 'node:crypto';

export const HISTORICAL_TRACE_ENVELOPE_SCHEMA_VERSION = 1 as const;

export const HISTORICAL_TRACE_SOURCE_SCHEMAS = [
  'sprint-worker-v1',
  'sprint-worker-v2',
  'extracted-aligned',
  'extracted-general',
  'native-repl',
  'unknown',
] as const;
export type HistoricalTraceSourceSchema = (typeof HISTORICAL_TRACE_SOURCE_SCHEMAS)[number];

export const HISTORICAL_TRACE_DISPOSITIONS = [
  'train-ready',
  'manual-review-required',
  'quarantined',
  'excluded',
] as const;
export type HistoricalTraceDisposition = (typeof HISTORICAL_TRACE_DISPOSITIONS)[number];

export const HISTORICAL_TRACE_REASON_CODES = [
  'unknown-source-schema',
  'source-schema-conflict',
  'invalid-source-shape',
  'missing-conversation',
  'unsupported-message-role',
  'unsupported-content-block',
  'missing-causal-tool-reference',
  'source-quarantined',
  'missing-consent-authority',
  'consent-denied',
  'missing-execution-lineage',
  'duplicate-reference',
  'training-policy-not-granted',
  'invalid-training-weight',
  'policy-excluded',
  'source-integrity-unverified',
] as const;
export type HistoricalTraceReasonCode = (typeof HISTORICAL_TRACE_REASON_CODES)[number];

export type HistoricalTraceRole = 'system' | 'user' | 'assistant' | 'tool' | 'unknown';

export interface HistoricalTraceProvenanceInput {
  /** Normalized project-relative POSIX path, resolved and bounded by the caller. */
  readonly projectRelativePath: string;
  readonly sourceLine: number;
  readonly sourceFileByteSize: number;
  /** SHA-256 measured by a bounded file pass before record normalization. */
  readonly sourceFileDigest: string;
  readonly sourceRecordContent: string;
  /** SHA-256 of the exact source-line bytes, excluding only the LF delimiter. */
  readonly sourceRecordDigest: string;
  /** True only when the caller measured the digest from the same regular file. */
  readonly sourceIntegrityVerified: boolean;
  /** Required for legacy shapes whose record body cannot distinguish the source. */
  readonly sourceSchemaHint?: HistoricalTraceSourceSchema;
}

export interface HistoricalTracePolicy {
  /** Explicit corpus admission. Omission is a deny-by-default decision. */
  readonly allowTraining?: boolean;
  readonly requireConsentAuthority?: boolean;
  readonly requireExecutionLineage?: boolean;
  readonly exclude?: boolean;
  /** Train-ready records require an explicit, finite weight greater than zero. */
  readonly trainingWeight?: number | null;
}

export interface HistoricalTraceSource {
  readonly schema: HistoricalTraceSourceSchema;
  readonly classificationAuthority: 'record' | 'caller-hint' | 'unknown';
  readonly projectRelativePath: string;
  readonly fileByteSize: number;
  readonly fileDigest: string;
  readonly line: number;
  readonly lineDigest: string;
  readonly contentDigest: string;
  readonly sourceUnitId: string;
  readonly recordId: string;
  /** Stable id observed in the legacy record; never substituted for recordId. */
  readonly observedRecordId: string | null;
}

export interface HistoricalTraceTextBlock {
  readonly type: 'text';
  readonly text: string;
}

export interface HistoricalTraceToolCallBlock {
  readonly type: 'tool-call';
  readonly toolCallId: string | null;
  readonly name: string | null;
  /** Exact string or canonical JSON observed in the source. */
  readonly argumentsJson: string | null;
}

export interface HistoricalTraceToolResultBlock {
  readonly type: 'tool-result';
  readonly toolCallId: string | null;
  readonly content: string | null;
}

export type HistoricalTraceContentBlock =
  | HistoricalTraceTextBlock
  | HistoricalTraceToolCallBlock
  | HistoricalTraceToolResultBlock;

/** Lossless typed evidence intentionally excluded from training projection. */
export interface HistoricalTraceAuxiliaryEvidence {
  readonly type: 'unsupported-content-block';
  readonly blockType: string | null;
  readonly contentDigest: string;
  readonly value: unknown;
}

export interface HistoricalTraceCausalLink {
  readonly kind: 'root' | 'tool-call' | 'tool-result';
  readonly toolCallId: string | null;
  readonly causedByMessageId: string | null;
}

export interface HistoricalTraceMessage {
  readonly id: string;
  readonly role: HistoricalTraceRole;
  /** Original role string, including unsupported values, for lossless review. */
  readonly observedRole: string | null;
  readonly content: readonly HistoricalTraceContentBlock[];
  readonly causal: HistoricalTraceCausalLink;
  readonly auxiliaryEvidence: readonly HistoricalTraceAuxiliaryEvidence[];
}

export interface HistoricalTraceGovernance {
  readonly consentAuthority: 'granted' | 'denied' | null;
  readonly consentEvidenceRef: string | null;
  readonly reviewAuthority: string | null;
}

/** Every field is observed evidence; null means absent, never synthesized. */
export interface HistoricalTraceExecutionLineage {
  readonly tenantId: string | null;
  readonly projectId: string | null;
  readonly flowId: string | null;
  readonly runId: string | null;
  readonly sprintId: string | null;
  readonly taskId: string | null;
  readonly workerId: string | null;
  readonly attemptId: string | null;
  readonly attemptNumber: number | null;
  readonly retryOf: string | null;
  readonly purpose: string | null;
  readonly provider: string | null;
  readonly model: string | null;
  readonly agent: string | null;
  readonly verdict: string | null;
  readonly workerSelfAssessment: string | null;
  readonly recordedAt: string | null;
}

export interface HistoricalTraceIntegrity {
  readonly fileDigest: string;
  readonly lineDigest: string;
  readonly contentDigest: string;
  readonly sourceIntegrityVerified: boolean;
}

export interface HistoricalTraceEnvelope {
  readonly schemaVersion: typeof HISTORICAL_TRACE_ENVELOPE_SCHEMA_VERSION;
  readonly source: HistoricalTraceSource;
  readonly messages: readonly HistoricalTraceMessage[];
  readonly governance: HistoricalTraceGovernance;
  readonly executionLineage: HistoricalTraceExecutionLineage;
  readonly sourceQuarantineReasons: readonly string[];
  readonly duplicateOf: readonly string[];
  readonly cumulativeReferences: readonly string[];
  readonly trainingWeight: number | null;
  readonly integrity: HistoricalTraceIntegrity;
  readonly disposition: HistoricalTraceDisposition;
  readonly reasonCodes: readonly HistoricalTraceReasonCode[];
}

export interface HistoricalTraceValidationSuccess { readonly ok: true; readonly value: HistoricalTraceEnvelope; }
export interface HistoricalTraceValidationFailure { readonly ok: false; readonly errors: readonly string[]; }
export type HistoricalTraceValidation = HistoricalTraceValidationSuccess | HistoricalTraceValidationFailure;

interface Classification {
  readonly schema: HistoricalTraceSourceSchema;
  readonly authority: HistoricalTraceSource['classificationAuthority'];
  readonly conflict: boolean;
}

const SHA256_RE = /^[a-f0-9]{64}$/;
const VALID_ROLES = new Set<HistoricalTraceRole>(['system', 'user', 'assistant', 'tool', 'unknown']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function canonicalJson(value: unknown): string | null {
  const seen = new Set<object>();
  const visit = (current: unknown): string | null => {
    if (current === null) return 'null';
    if (typeof current === 'string') return JSON.stringify(current);
    if (typeof current === 'boolean') return current ? 'true' : 'false';
    if (typeof current === 'number') return Number.isFinite(current) ? JSON.stringify(current) : null;
    if (typeof current !== 'object' || seen.has(current)) return null;
    seen.add(current);
    const result = Array.isArray(current)
      ? (() => {
          const items = current.map(visit);
          return items.some(item => item === null) ? null : `[${items.join(',')}]`;
        })()
      : (() => {
          const record = current as Record<string, unknown>;
          const items = Object.keys(record).sort().map(key => {
            const item = visit(record[key]);
            return item === null ? null : `${JSON.stringify(key)}:${item}`;
          });
          return items.some(item => item === null) ? null : `{${items.join(',')}}`;
        })();
    seen.delete(current);
    return result;
  };
  return visit(value);
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function asPositiveInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null;
}

function uniqueStrings(value: unknown): string[] {
  return Array.isArray(value)
    ? [...new Set(value.filter((item): item is string => typeof item === 'string' && item.length > 0))]
    : [];
}

function recordMeta(value: Record<string, unknown>): Record<string, unknown> {
  return isRecord(value.meta) ? value.meta : {};
}

function classify(value: unknown, hint?: HistoricalTraceSourceSchema): Classification {
  if (!isRecord(value)) return { schema: 'unknown', authority: 'unknown', conflict: false };
  const meta = recordMeta(value);
  let observed: HistoricalTraceSourceSchema | null = null;
  if (meta.source === 'sprint-worker') {
    observed = value.schemaVersion === 2 || meta.schemaVersion === 2
      ? 'sprint-worker-v2'
      : 'sprint-worker-v1';
  } else if (meta.source === 'native-repl' || value.surface === 'native-repl' || Array.isArray(value.turns) || Array.isArray(value.transcript)) {
    observed = 'native-repl';
  }
  if (observed) {
    const conflict = hint !== undefined && hint !== 'unknown' && hint !== observed;
    return conflict
      ? { schema: 'unknown', authority: 'record', conflict: true }
      : { schema: observed, authority: 'record', conflict: false };
  }
  if (hint && hint !== 'unknown' && Array.isArray(value.messages)) {
    return { schema: hint, authority: 'caller-hint', conflict: false };
  }
  return { schema: 'unknown', authority: 'unknown', conflict: false };
}

export function classifyHistoricalTraceSource(
  value: unknown,
  hint?: HistoricalTraceSourceSchema,
): HistoricalTraceSourceSchema {
  return classify(value, hint).schema;
}

export function createHistoricalTraceSource(
  provenance: HistoricalTraceProvenanceInput,
  classification: Classification,
  observedRecordId: string | null,
): HistoricalTraceSource {
  const lineDigest = provenance.sourceRecordDigest;
  const contentDigest = digest(provenance.sourceRecordContent);
  const sourceUnitId = digest(
    `historical-trace-unit/v1\u0000${provenance.projectRelativePath}\u0000${provenance.sourceFileDigest}`,
  );
  const recordId = digest(
    `historical-trace-record/v1\u0000${sourceUnitId}\u0000${provenance.sourceLine}\u0000${contentDigest}`,
  );
  return {
    schema: classification.schema,
    classificationAuthority: classification.authority,
    projectRelativePath: provenance.projectRelativePath,
    fileByteSize: provenance.sourceFileByteSize,
    fileDigest: provenance.sourceFileDigest,
    line: provenance.sourceLine,
    lineDigest,
    contentDigest,
    sourceUnitId,
    recordId,
    observedRecordId,
  };
}

function unsupported(value: unknown, blockType: string | null = null): HistoricalTraceAuxiliaryEvidence {
  return {
    type: 'unsupported-content-block',
    blockType,
    contentDigest: digest(canonicalJson(value) ?? '[unserializable]'),
    value,
  };
}

function contentText(value: unknown): string | null {
  if (typeof value === 'string') return value;
  const canonical = canonicalJson(value);
  return canonical === null ? null : canonical;
}

function normalizeBlock(value: unknown): {
  block: HistoricalTraceContentBlock | null;
  evidence: HistoricalTraceAuxiliaryEvidence | null;
} {
  if (typeof value === 'string') return { block: { type: 'text', text: value }, evidence: null };
  if (!isRecord(value)) return { block: null, evidence: unsupported(value) };
  if (value.type === 'text' && typeof value.text === 'string') {
    return { block: { type: 'text', text: value.text }, evidence: null };
  }
  if (value.type === 'tool_use' || value.type === 'tool-call') {
    const argumentsValue = value.input ?? value.arguments;
    const argumentsJson = typeof argumentsValue === 'string'
      ? argumentsValue
      : canonicalJson(argumentsValue);
    return {
      block: {
        type: 'tool-call',
        toolCallId: asNonEmptyString(value.id) ?? asNonEmptyString(value.toolCallId),
        name: asNonEmptyString(value.name),
        argumentsJson,
      },
      evidence: null,
    };
  }
  if (value.type === 'tool_result' || value.type === 'tool-result') {
    return {
      block: {
        type: 'tool-result',
        toolCallId: asNonEmptyString(value.tool_use_id) ?? asNonEmptyString(value.toolCallId),
        content: contentText(value.content),
      },
      evidence: null,
    };
  }
  return { block: null, evidence: unsupported(value, asNonEmptyString(value.type)) };
}

function normalizeOpenAiToolCall(value: unknown): {
  block: HistoricalTraceToolCallBlock | null;
  evidence: HistoricalTraceAuxiliaryEvidence | null;
} {
  if (!isRecord(value) || !isRecord(value.function)) {
    return { block: null, evidence: unsupported(value, 'openai-tool-call') };
  }
  const args = value.function.arguments;
  return {
    block: {
      type: 'tool-call',
      toolCallId: asNonEmptyString(value.id),
      name: asNonEmptyString(value.function.name),
      argumentsJson: typeof args === 'string' ? args : canonicalJson(args),
    },
    evidence: null,
  };
}

function sourceMessages(value: Record<string, unknown>): unknown[] {
  if (Array.isArray(value.messages)) return value.messages;
  if (Array.isArray(value.turns)) return value.turns;
  if (Array.isArray(value.transcript)) return value.transcript;
  return [];
}

function normalizeMessages(value: Record<string, unknown>, recordId: string): HistoricalTraceMessage[] {
  const messages: HistoricalTraceMessage[] = [];
  const callOwners = new Map<string, string>();
  for (const [index, raw] of sourceMessages(value).entries()) {
    if (!isRecord(raw)) continue;
    const observedRole = asNonEmptyString(raw.role);
    const role: HistoricalTraceRole = observedRole === 'system'
      || observedRole === 'user'
      || observedRole === 'assistant'
      || observedRole === 'tool'
      ? observedRole
      : 'unknown';
    const content: HistoricalTraceContentBlock[] = [];
    const auxiliaryEvidence: HistoricalTraceAuxiliaryEvidence[] = [];

    if (role === 'tool' && (raw.tool_call_id !== undefined || typeof raw.content === 'string')) {
      content.push({
        type: 'tool-result',
        toolCallId: asNonEmptyString(raw.tool_call_id),
        content: contentText(raw.content),
      });
    } else if (raw.content !== undefined && raw.content !== '') {
      const rawContent = Array.isArray(raw.content) ? raw.content : [raw.content];
      for (const rawBlock of rawContent) {
        const normalized = normalizeBlock(rawBlock);
        if (normalized.block) content.push(normalized.block);
        if (normalized.evidence) auxiliaryEvidence.push(normalized.evidence);
      }
    }

    if (Array.isArray(raw.tool_calls)) {
      for (const call of raw.tool_calls) {
        const normalized = normalizeOpenAiToolCall(call);
        if (normalized.block) content.push(normalized.block);
        if (normalized.evidence) auxiliaryEvidence.push(normalized.evidence);
      }
    }

    const id = digest(`historical-trace-message/v1\u0000${recordId}\u0000${index}`);
    const toolCalls = content.filter((block): block is HistoricalTraceToolCallBlock => block.type === 'tool-call');
    const toolResults = content.filter((block): block is HistoricalTraceToolResultBlock => block.type === 'tool-result');
    for (const call of toolCalls) {
      if (call.toolCallId) callOwners.set(call.toolCallId, id);
    }
    const firstCall = toolCalls[0];
    const firstResult = toolResults[0];
    const causedByMessageId = firstResult?.toolCallId
      ? callOwners.get(firstResult.toolCallId) ?? null
      : null;
    messages.push({
      id,
      role,
      observedRole,
      content,
      auxiliaryEvidence,
      causal: firstResult
        ? { kind: 'tool-result', toolCallId: firstResult.toolCallId, causedByMessageId }
        : firstCall
          ? { kind: 'tool-call', toolCallId: firstCall.toolCallId, causedByMessageId: null }
          : { kind: 'root', toolCallId: null, causedByMessageId: null },
    });
  }
  return messages;
}

function observedGovernance(value: Record<string, unknown>): HistoricalTraceGovernance {
  const governance = isRecord(value.governance) ? value.governance : value;
  return {
    consentAuthority: governance.consentAuthority === 'granted' || governance.consentAuthority === 'denied'
      ? governance.consentAuthority
      : null,
    consentEvidenceRef: asNonEmptyString(governance.consentEvidenceRef),
    reviewAuthority: asNonEmptyString(governance.reviewAuthority),
  };
}

function observedLineage(value: Record<string, unknown>): HistoricalTraceExecutionLineage {
  const explicit = isRecord(value.executionLineage) ? value.executionLineage : {};
  const meta = recordMeta(value);
  const pick = (key: string): string | null => asNonEmptyString(explicit[key]) ?? asNonEmptyString(meta[key]) ?? asNonEmptyString(value[key]);
  return {
    tenantId: pick('tenantId'),
    projectId: pick('projectId'),
    flowId: pick('flowId'),
    runId: pick('runId'),
    sprintId: pick('sprintId'),
    taskId: pick('taskId'),
    workerId: pick('workerId'),
    attemptId: pick('attemptId'),
    attemptNumber: asPositiveInteger(explicit.attemptNumber)
      ?? asPositiveInteger(meta.attemptNumber)
      ?? asPositiveInteger(meta.attempt),
    retryOf: pick('retryOf'),
    purpose: pick('purpose'),
    provider: pick('provider'),
    model: pick('model'),
    agent: pick('agent'),
    verdict: pick('verdict') ?? pick('selfAssessment'),
    workerSelfAssessment: pick('workerSelfAssessment'),
    recordedAt: pick('recordedAt') ?? pick('ts'),
  };
}

function deriveDisposition(input: {
  readonly parsed: boolean;
  readonly classification: Classification;
  readonly messages: readonly HistoricalTraceMessage[];
  readonly governance: HistoricalTraceGovernance;
  readonly lineage: HistoricalTraceExecutionLineage;
  readonly sourceQuarantineReasons: readonly string[];
  readonly integrityVerified: boolean;
  readonly policy: HistoricalTracePolicy;
}): { disposition: HistoricalTraceDisposition; reasonCodes: HistoricalTraceReasonCode[]; trainingWeight: number | null } {
  const reasons = new Set<HistoricalTraceReasonCode>();
  const observedToolCallIds = new Set<string>();
  let duplicateToolCallId = false;
  for (const message of input.messages) {
    for (const block of message.content) {
      if (block.type !== 'tool-call' || !block.toolCallId) continue;
      if (observedToolCallIds.has(block.toolCallId)) duplicateToolCallId = true;
      else observedToolCallIds.add(block.toolCallId);
    }
  }
  if (!input.parsed) reasons.add('invalid-source-shape');
  if (input.classification.schema === 'unknown') reasons.add('unknown-source-schema');
  if (input.classification.conflict) reasons.add('source-schema-conflict');
  if (input.messages.length === 0 || !input.messages.some(message => message.role !== 'system' && message.content.length > 0)) reasons.add('missing-conversation');
  if (input.messages.some(message => message.role === 'unknown')) reasons.add('unsupported-message-role');
  if (input.messages.some(message => message.auxiliaryEvidence.length > 0)) reasons.add('unsupported-content-block');
  if (input.messages.some(message =>
    ((message.role === 'system' || message.role === 'user') && message.content.some(block => block.type !== 'text'))
    || (message.role === 'assistant' && message.content.some(block => block.type === 'tool-result'))
    || (message.role === 'tool' && message.content.some(block => block.type !== 'tool-result')))) reasons.add('unsupported-content-block');
  if (input.messages.some(message => message.content.some(block =>
    block.type === 'tool-call' && (!block.toolCallId || !block.name || block.argumentsJson === null)))) {
    reasons.add('missing-causal-tool-reference');
  }
  if (input.messages.some(message => message.content.some(block =>
    block.type === 'tool-result' && (!block.toolCallId || message.causal.causedByMessageId === null)))) {
    reasons.add('missing-causal-tool-reference');
  }
  if (duplicateToolCallId) reasons.add('missing-causal-tool-reference');
  if (input.sourceQuarantineReasons.length > 0) reasons.add('source-quarantined');
  if (input.governance.consentAuthority === 'denied') reasons.add('consent-denied');
  if (input.policy.requireConsentAuthority && input.governance.consentAuthority === null) reasons.add('missing-consent-authority');
  if (input.policy.requireExecutionLineage && !input.lineage.runId && !input.lineage.sprintId) reasons.add('missing-execution-lineage');
  if (!input.policy.allowTraining) reasons.add('training-policy-not-granted');
  const explicitWeight = input.policy.trainingWeight;
  const validPositiveWeight = typeof explicitWeight === 'number' && Number.isFinite(explicitWeight) && explicitWeight > 0;
  if (input.policy.allowTraining && !validPositiveWeight) reasons.add('invalid-training-weight');
  if (input.policy.exclude) reasons.add('policy-excluded');
  if (!input.integrityVerified) reasons.add('source-integrity-unverified');

  if (input.policy.exclude) return { disposition: 'excluded', reasonCodes: [...reasons], trainingWeight: 0 };
  const quarantineReasons: HistoricalTraceReasonCode[] = [
    'unknown-source-schema',
    'source-schema-conflict',
    'invalid-source-shape',
    'missing-conversation',
    'unsupported-message-role',
    'unsupported-content-block',
    'missing-causal-tool-reference',
    'source-quarantined',
    'consent-denied',
    'source-integrity-unverified',
  ];
  if (quarantineReasons.some(reason => reasons.has(reason))) {
    return { disposition: 'quarantined', reasonCodes: [...reasons], trainingWeight: 0 };
  }
  if (reasons.size > 0) return { disposition: 'manual-review-required', reasonCodes: [...reasons], trainingWeight: 0 };
  return { disposition: 'train-ready', reasonCodes: [], trainingWeight: explicitWeight as number };
}

/** Convert one historical record without filesystem, clock, or random input. */
export function normalizeHistoricalTraceEnvelope(
  raw: unknown,
  provenance: HistoricalTraceProvenanceInput,
  policy: HistoricalTracePolicy = {},
): HistoricalTraceEnvelope {
  const parsed = isRecord(raw);
  const sourceValue = parsed ? raw : {};
  const classification = classify(raw, provenance.sourceSchemaHint);
  const meta = recordMeta(sourceValue);
  const source = createHistoricalTraceSource(
    provenance,
    classification,
    asNonEmptyString(meta.recordId) ?? asNonEmptyString(sourceValue.recordId),
  );
  const messages = parsed ? normalizeMessages(sourceValue, source.recordId) : [];
  const governance = parsed
    ? observedGovernance(sourceValue)
    : { consentAuthority: null, consentEvidenceRef: null, reviewAuthority: null };
  const executionLineage = parsed
    ? observedLineage(sourceValue)
    : {
        tenantId: null, projectId: null, flowId: null, runId: null, sprintId: null,
        taskId: null, workerId: null, attemptId: null, attemptNumber: null,
        retryOf: null, purpose: null, provider: null, model: null, agent: null,
        verdict: null, workerSelfAssessment: null, recordedAt: null,
      };
  const sourceQuarantineReasons = parsed
    ? uniqueStrings(meta.quarantineReasons ?? sourceValue.quarantineReasons)
    : [];
  if (parsed && (meta.quarantine === true || sourceValue.quarantine === true) && sourceQuarantineReasons.length === 0) {
    sourceQuarantineReasons.push('source-marked-quarantine');
  }
  const derived = deriveDisposition({
    parsed,
    classification,
    messages,
    governance,
    lineage: executionLineage,
    sourceQuarantineReasons,
    integrityVerified: provenance.sourceIntegrityVerified,
    policy,
  });
  const duplicateOf = parsed ? uniqueStrings(sourceValue.duplicateOf) : [];
  const cumulativeReferences = parsed ? uniqueStrings(sourceValue.cumulativeReferences) : [];
  const reasonCodes = new Set(derived.reasonCodes);
  if (duplicateOf.length > 0) reasonCodes.add('duplicate-reference');
  return {
    schemaVersion: HISTORICAL_TRACE_ENVELOPE_SCHEMA_VERSION,
    source,
    messages,
    governance,
    executionLineage,
    sourceQuarantineReasons,
    duplicateOf,
    cumulativeReferences,
    trainingWeight: duplicateOf.length > 0 ? 0 : derived.trainingWeight,
    integrity: {
      fileDigest: source.fileDigest,
      lineDigest: source.lineDigest,
      contentDigest: source.contentDigest,
      sourceIntegrityVerified: provenance.sourceIntegrityVerified,
    },
    disposition: duplicateOf.length > 0 && derived.disposition === 'train-ready'
      ? 'manual-review-required'
      : derived.disposition,
    reasonCodes: [...reasonCodes],
  };
}

function validatePath(path: unknown): boolean {
  return typeof path === 'string'
    && path.length > 0
    && !path.startsWith('/')
    && !path.includes('\\')
    && !path.split('/').some(part => part === '' || part === '.' || part === '..');
}

function validateNullableString(record: Record<string, unknown>, key: string, errors: string[]): void {
  if (record[key] !== null && (typeof record[key] !== 'string' || record[key].length === 0)) {
    errors.push(`executionLineage.${key} must be a non-empty string or null`);
  }
}

/** Strict structural and semantic validation for canonical envelopes. */
export function validateHistoricalTraceEnvelope(
  value: unknown,
  policy: HistoricalTracePolicy = {},
): HistoricalTraceValidation {
  const errors: string[] = [];
  if (!isRecord(value)) return { ok: false, errors: ['envelope must be an object'] };
  if (value.schemaVersion !== HISTORICAL_TRACE_ENVELOPE_SCHEMA_VERSION) errors.push('unknown schema version');
  if (!HISTORICAL_TRACE_DISPOSITIONS.includes(value.disposition as HistoricalTraceDisposition)) errors.push('unknown disposition');
  if (!Array.isArray(value.reasonCodes)
      || value.reasonCodes.some(code => !HISTORICAL_TRACE_REASON_CODES.includes(code as HistoricalTraceReasonCode))
      || new Set(value.reasonCodes).size !== value.reasonCodes.length) errors.push('reasonCodes must be unique closed-vocabulary values');
  if (!Array.isArray(value.sourceQuarantineReasons) || value.sourceQuarantineReasons.some(reason => typeof reason !== 'string' || reason.length === 0)) errors.push('invalid source quarantine reasons');
  if (!Array.isArray(value.duplicateOf) || value.duplicateOf.some(ref => typeof ref !== 'string' || !SHA256_RE.test(ref)) || new Set(value.duplicateOf).size !== value.duplicateOf.length) errors.push('invalid duplicate references');
  if (!Array.isArray(value.cumulativeReferences) || value.cumulativeReferences.some(ref => typeof ref !== 'string' || ref.length === 0) || new Set(value.cumulativeReferences).size !== value.cumulativeReferences.length) errors.push('invalid cumulative references');
  if (value.trainingWeight !== null && (typeof value.trainingWeight !== 'number' || !Number.isFinite(value.trainingWeight) || value.trainingWeight < 0)) errors.push('invalid training weight');

  const source = isRecord(value.source) ? value.source : null;
  const integrity = isRecord(value.integrity) ? value.integrity : null;
  const governance = isRecord(value.governance) ? value.governance : null;
  const lineage = isRecord(value.executionLineage) ? value.executionLineage : null;
  const messages = Array.isArray(value.messages) ? value.messages : null;
  if (!source || !integrity || !governance || !lineage || !messages) errors.push('invalid envelope shape');

  if (source) {
    if (!HISTORICAL_TRACE_SOURCE_SCHEMAS.includes(source.schema as HistoricalTraceSourceSchema)) errors.push('invalid source schema');
    if (source.classificationAuthority !== 'record' && source.classificationAuthority !== 'caller-hint' && source.classificationAuthority !== 'unknown') errors.push('invalid classification authority');
    if (!validatePath(source.projectRelativePath)) errors.push('invalid project-relative source path');
    if (!Number.isInteger(source.fileByteSize) || (source.fileByteSize as number) < 0) errors.push('invalid source byte size');
    if (!Number.isInteger(source.line) || (source.line as number) <= 0) errors.push('invalid source line');
    for (const key of ['fileDigest', 'lineDigest', 'contentDigest', 'sourceUnitId', 'recordId'] as const) {
      if (typeof source[key] !== 'string' || !SHA256_RE.test(source[key] as string)) errors.push(`invalid source ${key}`);
    }
    if (source.observedRecordId !== null && (typeof source.observedRecordId !== 'string' || source.observedRecordId.length === 0)) errors.push('invalid observed record id');
  }
  if (integrity) {
    for (const key of ['fileDigest', 'lineDigest', 'contentDigest'] as const) {
      if (typeof integrity[key] !== 'string' || !SHA256_RE.test(integrity[key] as string)) errors.push(`invalid integrity ${key}`);
    }
    if (typeof integrity.sourceIntegrityVerified !== 'boolean') errors.push('invalid integrity verification flag');
    if (source && (integrity.fileDigest !== source.fileDigest || integrity.lineDigest !== source.lineDigest || integrity.contentDigest !== source.contentDigest)) errors.push('integrity/source digest mismatch');
  }
  if (governance) {
    if (governance.consentAuthority !== null && governance.consentAuthority !== 'granted' && governance.consentAuthority !== 'denied') errors.push('invalid consent authority');
    for (const key of ['consentEvidenceRef', 'reviewAuthority'] as const) {
      if (governance[key] !== null && (typeof governance[key] !== 'string' || governance[key].length === 0)) errors.push(`invalid governance ${key}`);
    }
  }
  if (lineage) {
    for (const key of ['tenantId', 'projectId', 'flowId', 'runId', 'sprintId', 'taskId', 'workerId', 'attemptId', 'retryOf', 'purpose', 'provider', 'model', 'agent', 'verdict', 'workerSelfAssessment', 'recordedAt']) validateNullableString(lineage, key, errors);
    if (lineage.attemptNumber !== null && (!Number.isInteger(lineage.attemptNumber) || (lineage.attemptNumber as number) <= 0)) errors.push('invalid executionLineage.attemptNumber');
  }

  const reasonCodes = Array.isArray(value.reasonCodes) ? value.reasonCodes as HistoricalTraceReasonCode[] : [];
  const permitsCausalDefect = (value.disposition === 'quarantined' || value.disposition === 'excluded')
    && reasonCodes.includes('missing-causal-tool-reference');
  const callOwners = new Map<string, Set<string>>();
  if (messages) {
    for (const [index, messageValue] of messages.entries()) {
      if (!isRecord(messageValue)) { errors.push(`messages[${index}] must be an object`); continue; }
      if (typeof messageValue.id !== 'string' || !SHA256_RE.test(messageValue.id)) errors.push(`messages[${index}].id invalid`);
      if (!VALID_ROLES.has(messageValue.role as HistoricalTraceRole)) errors.push(`messages[${index}].role invalid`);
      if (messageValue.observedRole !== null && (typeof messageValue.observedRole !== 'string' || messageValue.observedRole.length === 0)) errors.push(`messages[${index}].observedRole invalid`);
      if (!Array.isArray(messageValue.content) || !Array.isArray(messageValue.auxiliaryEvidence) || !isRecord(messageValue.causal)) {
        errors.push(`messages[${index}] content/evidence/causal invalid`);
        continue;
      }
      for (const blockValue of messageValue.content) {
        if (!isRecord(blockValue)) { errors.push(`messages[${index}] block invalid`); continue; }
        if (blockValue.type === 'text') {
          if (typeof blockValue.text !== 'string') errors.push(`messages[${index}] text invalid`);
        } else if (blockValue.type === 'tool-call') {
          const idValid = blockValue.toolCallId === null || (typeof blockValue.toolCallId === 'string' && blockValue.toolCallId.length > 0);
          const nameValid = blockValue.name === null || (typeof blockValue.name === 'string' && blockValue.name.length > 0);
          const argumentsValid = blockValue.argumentsJson === null || typeof blockValue.argumentsJson === 'string';
          if (!idValid || !nameValid || !argumentsValid) errors.push(`messages[${index}] tool call invalid`);
          const complete = typeof blockValue.toolCallId === 'string'
            && blockValue.toolCallId.length > 0
            && typeof blockValue.name === 'string'
            && blockValue.name.length > 0
            && typeof blockValue.argumentsJson === 'string';
          if (!complete && !permitsCausalDefect) errors.push(`messages[${index}] tool call incomplete`);
          if (typeof blockValue.toolCallId === 'string' && blockValue.toolCallId.length > 0) {
            const owners = callOwners.get(blockValue.toolCallId) ?? new Set<string>();
            if (owners.size > 0 && !permitsCausalDefect) errors.push(`messages[${index}] duplicate tool call id`);
            if (typeof messageValue.id === 'string') owners.add(messageValue.id);
            callOwners.set(blockValue.toolCallId, owners);
          }
        } else if (blockValue.type === 'tool-result') {
          const idValid = blockValue.toolCallId === null || (typeof blockValue.toolCallId === 'string' && blockValue.toolCallId.length > 0);
          const contentValid = blockValue.content === null || typeof blockValue.content === 'string';
          if (!idValid || !contentValid) errors.push(`messages[${index}] tool result invalid`);
          const complete = typeof blockValue.toolCallId === 'string'
            && blockValue.toolCallId.length > 0
            && typeof blockValue.content === 'string';
          if (!complete && !permitsCausalDefect) errors.push(`messages[${index}] tool result incomplete`);
          if (typeof blockValue.toolCallId === 'string'
              && blockValue.toolCallId.length > 0
              && !callOwners.has(blockValue.toolCallId)
              && !permitsCausalDefect) errors.push(`messages[${index}] orphan tool result`);
        } else {
          errors.push(`messages[${index}] block type invalid`);
        }
      }
      const blockTypes = messageValue.content.filter(isRecord).map(block => block.type);
      if ((messageValue.role === 'system' || messageValue.role === 'user') && blockTypes.some(type => type !== 'text')) errors.push(`messages[${index}] role/block mismatch`);
      if (messageValue.role === 'assistant' && blockTypes.includes('tool-result')) errors.push(`messages[${index}] role/block mismatch`);
      if (messageValue.role === 'tool' && blockTypes.some(type => type !== 'tool-result')) errors.push(`messages[${index}] role/block mismatch`);
      for (const evidence of messageValue.auxiliaryEvidence) {
        if (!isRecord(evidence) || evidence.type !== 'unsupported-content-block' || typeof evidence.contentDigest !== 'string' || !SHA256_RE.test(evidence.contentDigest)) errors.push(`messages[${index}] auxiliary evidence invalid`);
      }
      const causal = messageValue.causal;
      if (causal.kind !== 'root' && causal.kind !== 'tool-call' && causal.kind !== 'tool-result') errors.push(`messages[${index}] causal kind invalid`);
      const causalToolCallIdValid = causal.toolCallId === null || (typeof causal.toolCallId === 'string' && causal.toolCallId.length > 0);
      const causedByValid = causal.causedByMessageId === null || (typeof causal.causedByMessageId === 'string' && SHA256_RE.test(causal.causedByMessageId));
      if (!causalToolCallIdValid || !causedByValid) errors.push(`messages[${index}] causal value invalid`);
      if (causal.kind === 'root' && (causal.toolCallId !== null || causal.causedByMessageId !== null)) errors.push(`messages[${index}] root causal reference invalid`);
      if (causal.kind === 'tool-call' && causal.causedByMessageId !== null) errors.push(`messages[${index}] tool call causal reference invalid`);
      if (causal.kind === 'tool-result') {
        const owners = typeof causal.toolCallId === 'string' ? callOwners.get(causal.toolCallId) : undefined;
        const completeReference = typeof causal.toolCallId === 'string'
          && causal.toolCallId.length > 0
          && typeof causal.causedByMessageId === 'string'
          && owners?.has(causal.causedByMessageId) === true;
        if (!completeReference && !permitsCausalDefect) errors.push(`messages[${index}] causal reference invalid`);
        if (typeof causal.causedByMessageId === 'string' && owners?.has(causal.causedByMessageId) !== true) {
          errors.push(`messages[${index}] causal owner mismatch`);
        }
      }
    }
  }

  if (value.disposition === 'train-ready') {
    if (policy.allowTraining !== true) errors.push('train-ready requires explicit training policy admission');
    if (integrity?.sourceIntegrityVerified !== true) errors.push('train-ready requires verified source integrity');
    if (reasonCodes.length > 0) errors.push('train-ready cannot have reason codes');
    if (!messages || messages.length === 0 || messages.some(message => isRecord(message) && (message.role === 'unknown' || (Array.isArray(message.auxiliaryEvidence) && message.auxiliaryEvidence.length > 0)))) errors.push('train-ready requires supported non-empty messages');
    if (typeof value.trainingWeight !== 'number' || !Number.isFinite(value.trainingWeight) || value.trainingWeight <= 0) errors.push('train-ready requires a positive explicit weight');
    if (Array.isArray(value.duplicateOf) && value.duplicateOf.length > 0) errors.push('train-ready cannot be a duplicate');
    if (policy.requireConsentAuthority && governance?.consentAuthority !== 'granted') errors.push('train-ready requires granted consent authority');
    if (policy.requireExecutionLineage && !asNonEmptyString(lineage?.runId) && !asNonEmptyString(lineage?.sprintId)) errors.push('train-ready requires execution lineage');
  }
  if (Array.isArray(value.duplicateOf) && value.duplicateOf.length > 0) {
    if (!reasonCodes.includes('duplicate-reference')) errors.push('duplicate reference requires duplicate reason');
    if (value.trainingWeight !== 0) errors.push('duplicate reference requires zero weight');
  }
  if (governance?.consentAuthority === 'denied' && value.disposition !== 'quarantined' && value.disposition !== 'excluded') errors.push('denied consent must be quarantined or excluded');
  if (reasonCodes.includes('source-quarantined') && value.disposition !== 'quarantined' && value.disposition !== 'excluded') errors.push('source quarantine must fail closed');
  if (policy.exclude === true && value.disposition !== 'excluded') errors.push('policy exclusion must be excluded');

  return errors.length === 0
    ? { ok: true, value: value as unknown as HistoricalTraceEnvelope }
    : { ok: false, errors: [...new Set(errors)] };
}
