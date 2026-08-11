import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  HISTORICAL_TRACE_ENVELOPE_SCHEMA_VERSION,
  classifyHistoricalTraceSource,
  normalizeHistoricalTraceEnvelope,
  validateHistoricalTraceEnvelope,
  type HistoricalTraceProvenanceInput,
} from '../../src/core/training-trace-envelope.js';

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');
const record = '{"messages":[]}';
const provenance: HistoricalTraceProvenanceInput = {
  projectRelativePath: '.deckent/traces/sprint-worker.jsonl',
  sourceLine: 7,
  sourceFileByteSize: 42,
  sourceFileDigest: sha256('whole file'),
  sourceRecordContent: record,
  sourceRecordDigest: sha256(record),
  sourceIntegrityVerified: true,
  sourceSchemaHint: 'sprint-worker-v2',
};

describe('training trace envelope', () => {
  it('classifies real legacy record evidence and uses an explicit hint only for ambiguous extracted files', () => {
    expect(classifyHistoricalTraceSource({ messages: [], meta: { source: 'sprint-worker' } })).toBe('sprint-worker-v1');
    expect(classifyHistoricalTraceSource({ schemaVersion: 2, messages: [], meta: { source: 'sprint-worker', schemaVersion: 2 } })).toBe('sprint-worker-v2');
    expect(classifyHistoricalTraceSource({ messages: [], meta: { source: 'native-repl' } })).toBe('native-repl');
    expect(classifyHistoricalTraceSource({ messages: [] })).toBe('unknown');
    expect(classifyHistoricalTraceSource({ messages: [] }, 'extracted-aligned')).toBe('extracted-aligned');
    expect(classifyHistoricalTraceSource({ messages: [], meta: { source: 'sprint-worker' } }, 'extracted-general')).toBe('unknown');
  });

  it('creates deterministic identities from caller-measured digests without needing full file content', () => {
    const raw = { schemaVersion: 2, messages: [{ role: 'user', content: 'hello' }], meta: { source: 'sprint-worker', recordId: 'observed-id' } };
    const first = normalizeHistoricalTraceEnvelope(raw, provenance);
    const second = normalizeHistoricalTraceEnvelope(raw, provenance);
    expect(first.schemaVersion).toBe(HISTORICAL_TRACE_ENVELOPE_SCHEMA_VERSION);
    expect(first.source).toEqual(second.source);
    expect(first.messages[0]?.id).toBe(second.messages[0]?.id);
    expect(first.source.observedRecordId).toBe('observed-id');
    expect(first.integrity.sourceIntegrityVerified).toBe(true);
  });

  it('preserves real meta lineage and never substitutes sprintId for runId', () => {
    const envelope = normalizeHistoricalTraceEnvelope({
      messages: [{ role: 'user', content: 'hello' }],
      meta: {
        source: 'sprint-worker', sprintId: 'sprint-515', taskId: '515-002',
        attempt: 2, retryOf: '515-002', purpose: 'fix', model: 'model-x',
        agent: 'worker-x', verdict: 'DONE', workerSelfAssessment: 'DONE',
        ts: '2026-08-11T00:00:00.000Z',
      },
    }, { ...provenance, sourceSchemaHint: 'sprint-worker-v1' });
    expect(envelope.executionLineage).toMatchObject({
      sprintId: 'sprint-515', taskId: '515-002', runId: null, attemptNumber: 2,
      retryOf: '515-002', purpose: 'fix', model: 'model-x', agent: 'worker-x',
      verdict: 'DONE', workerSelfAssessment: 'DONE', recordedAt: '2026-08-11T00:00:00.000Z',
    });
  });

  it('retains unknown roles and unsupported blocks as typed evidence instead of inventing assistant text', () => {
    const envelope = normalizeHistoricalTraceEnvelope({
      schemaVersion: 2,
      messages: [{ role: 'critic', content: [{ type: 'image', source: { bytes: 12 } }] }],
      meta: { source: 'sprint-worker' },
    }, provenance);
    expect(envelope.messages[0]).toMatchObject({ role: 'unknown', observedRole: 'critic', content: [] });
    expect(envelope.messages[0]?.auxiliaryEvidence[0]).toMatchObject({ type: 'unsupported-content-block', blockType: 'image' });
    expect(envelope.disposition).toBe('quarantined');
    expect(envelope.reasonCodes).toEqual(expect.arrayContaining(['unsupported-message-role', 'unsupported-content-block']));
  });

  it('models both OpenAI and Anthropic tool causality and quarantines unmatched results', () => {
    const openAi = normalizeHistoricalTraceEnvelope({
      schemaVersion: 2,
      meta: { source: 'sprint-worker' },
      messages: [
        { role: 'assistant', content: '', tool_calls: [{ id: 'call-1', type: 'function', function: { name: 'Read', arguments: '{"path":"x.ts"}' } }] },
        { role: 'tool', tool_call_id: 'call-1', content: 'ok' },
      ],
    }, provenance);
    expect(openAi.messages[0]?.content[0]).toMatchObject({ type: 'tool-call', toolCallId: 'call-1', name: 'Read' });
    expect(openAi.messages[1]?.content[0]).toMatchObject({ type: 'tool-result', toolCallId: 'call-1', content: 'ok' });
    expect(openAi.messages[1]?.causal.causedByMessageId).toBe(openAi.messages[0]?.id);

    const anthropic = normalizeHistoricalTraceEnvelope({
      schemaVersion: 2,
      meta: { source: 'sprint-worker' },
      messages: [
        { role: 'assistant', content: [{ type: 'tool_use', id: 'call-2', name: 'Read', input: { path: 'x.ts' } }] },
        { role: 'tool', content: [{ type: 'tool_result', tool_use_id: 'call-2', content: 'ok' }] },
      ],
    }, provenance);
    expect(anthropic.messages[1]?.causal.causedByMessageId).toBe(anthropic.messages[0]?.id);

    const orphan = normalizeHistoricalTraceEnvelope({
      schemaVersion: 2, meta: { source: 'sprint-worker' },
      messages: [{ role: 'tool', tool_call_id: 'missing', content: 'x' }],
    }, provenance);
    expect(orphan.disposition).toBe('quarantined');
    expect(orphan.reasonCodes).toContain('missing-causal-tool-reference');
    expect(validateHistoricalTraceEnvelope(orphan)).toMatchObject({ ok: true });
    expect(validateHistoricalTraceEnvelope({
      ...orphan,
      disposition: 'train-ready',
      reasonCodes: [],
      trainingWeight: 1,
    }, { allowTraining: true, trainingWeight: 1 })).toMatchObject({ ok: false });
  });

  it('retains incomplete and duplicate legacy tool causality only as quarantined evidence', () => {
    const envelope = normalizeHistoricalTraceEnvelope({
      meta: { source: 'sprint-worker' },
      messages: [
        { role: 'assistant', content: '', tool_calls: [{ id: 'repeat', type: 'function', function: { name: 'Read', arguments: '{}' } }] },
        { role: 'assistant', content: '', tool_calls: [{ id: 'repeat', type: 'function', function: { name: 'Read', arguments: '{}' } }] },
        { role: 'tool', tool_call_id: '', content: 'legacy result without an observed causal id' },
      ],
    }, provenance, { allowTraining: true, trainingWeight: 1 });
    expect(envelope).toMatchObject({
      disposition: 'quarantined',
      trainingWeight: 0,
      reasonCodes: expect.arrayContaining(['missing-causal-tool-reference']),
    });
    expect(envelope.messages[2]?.content[0]).toMatchObject({ type: 'tool-result', toolCallId: null });
    expect(validateHistoricalTraceEnvelope(envelope, { allowTraining: true, trainingWeight: 1 })).toMatchObject({ ok: true });
  });

  it('carries source quarantine through the canonical gate', () => {
    const envelope = normalizeHistoricalTraceEnvelope({
      schemaVersion: 2,
      messages: [{ role: 'user', content: 'hello' }],
      meta: { source: 'sprint-worker', quarantine: true, quarantineReasons: ['no-prompt'] },
    }, provenance, { allowTraining: true, trainingWeight: 1 });
    expect(envelope.sourceQuarantineReasons).toEqual(['no-prompt']);
    expect(envelope.disposition).toBe('quarantined');
    expect(envelope.reasonCodes).toContain('source-quarantined');
    expect(envelope.trainingWeight).toBe(0);
  });

  it('requires explicit admission, positive weight, and observed consent when policy asks for it', () => {
    const raw = { schemaVersion: 2, messages: [{ role: 'user', content: 'hello' }], meta: { source: 'sprint-worker' } };
    const held = normalizeHistoricalTraceEnvelope(raw, provenance, { requireConsentAuthority: true });
    expect(held.governance.consentAuthority).toBeNull();
    expect(held.disposition).toBe('manual-review-required');
    expect(held.reasonCodes).toEqual(expect.arrayContaining(['missing-consent-authority', 'training-policy-not-granted']));

    const invalid = { ...held, disposition: 'train-ready' as const, reasonCodes: [], trainingWeight: 1 };
    expect(validateHistoricalTraceEnvelope(invalid, { allowTraining: true, trainingWeight: 1, requireConsentAuthority: true })).toMatchObject({ ok: false });
    const noWeight = normalizeHistoricalTraceEnvelope(raw, provenance, { allowTraining: true });
    expect(noWeight.reasonCodes).toContain('invalid-training-weight');
  });

  it('strictly rejects empty nested objects, digest mismatches, and impossible train-ready combinations', () => {
    const raw = { schemaVersion: 2, messages: [{ role: 'user', content: 'hello' }], meta: { source: 'sprint-worker' } };
    const ready = normalizeHistoricalTraceEnvelope(raw, provenance, { allowTraining: true, trainingWeight: 1 });
    expect(ready.disposition).toBe('train-ready');
    expect(validateHistoricalTraceEnvelope(ready, { allowTraining: true, trainingWeight: 1 })).toMatchObject({ ok: true });
    expect(validateHistoricalTraceEnvelope({ ...ready, source: {}, integrity: {} }, { allowTraining: true, trainingWeight: 1 })).toMatchObject({ ok: false });
    expect(validateHistoricalTraceEnvelope({ ...ready, integrity: { ...ready.integrity, fileDigest: sha256('different') } }, { allowTraining: true, trainingWeight: 1 })).toMatchObject({ ok: false });
    expect(validateHistoricalTraceEnvelope({ ...ready, disposition: 'manual-review-required', duplicateOf: ['not-a-digest'], trainingWeight: 1 })).toMatchObject({ ok: false });
  });
});
