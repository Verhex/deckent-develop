import { createHash } from 'node:crypto';
import { ReferenceDigestError, type ReferenceInvalidReason } from './reference-digest-types.js';
import type { DigestCitation, DigestPayload, ReferenceDigestPolicy } from './reference-digest-runner-types.js';

export const digestReferenceValue = (value: unknown): string => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function invalid(reason: ReferenceInvalidReason): never {
  // Same outer code as before; the sub-reason rides alongside so the journal can
  // record WHICH contract the response broke.
  throw new ReferenceDigestError('REFERENCE_OUTPUT_INVALID', reason);
}
function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid('payload-schema-keys');
  const row = value as Record<string, unknown>;
  if (Object.keys(row).length !== keys.length || !keys.every(k => Object.hasOwn(row, k))) return invalid('payload-schema-keys');
  return row;
}
/** No repair, code-fence stripping, unknown keys or model-owned coverage/identity. */
export function validateDigestPayload(text: string, coverage: readonly DigestCitation[], policy: Pick<ReferenceDigestPolicy,
  'maxResponseBytes' | 'maxItems' | 'maxTextBytes'>): DigestPayload {
  if (Buffer.byteLength(text) > policy.maxResponseBytes) return invalid('payload-oversize');
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { return invalid('payload-json-parse'); }
  const value = object(parsed, ['claims', 'decisions', 'entities', 'openQuestions', 'contradictions', 'lossNotes']);
  const string = (x: unknown): string => {
    if (typeof x !== 'string' || !x.trim() || Buffer.byteLength(x) > policy.maxTextBytes || x.includes('\0')) return invalid('payload-string');
    return x;
  };
  const array = (x: unknown): unknown[] => {
    if (!Array.isArray(x) || x.length > policy.maxItems) return invalid('payload-array');
    return x;
  };
  const claims = array(value.claims).map(x => {
    const claim = object(x, ['text', 'citations']);
    const citations = array(claim.citations).map(y => {
      const citation = object(y, ['sectionId', 'byteStart', 'byteEnd']);
      const { sectionId, byteStart, byteEnd } = citation;
      if (typeof sectionId !== 'string' || !Number.isSafeInteger(byteStart) || !Number.isSafeInteger(byteEnd)
        || !coverage.some(c => c.sectionId === sectionId && (byteStart as number) >= c.byteStart
          && (byteEnd as number) <= c.byteEnd && (byteStart as number) < (byteEnd as number))) return invalid('payload-citation-range');
      return { sectionId, byteStart: byteStart as number, byteEnd: byteEnd as number };
    });
    if (!citations.length) return invalid('payload-no-citation');
    return { text: string(claim.text), citations };
  });
  const payload = { claims, decisions: array(value.decisions).map(string), entities: array(value.entities).map(string),
    openQuestions: array(value.openQuestions).map(string), contradictions: array(value.contradictions).map(string),
    lossNotes: array(value.lossNotes).map(string) };
  // Empty structured responses are not a successful digest of nonempty source.
  if (!claims.length && !payload.lossNotes.length) return invalid('payload-empty');
  return payload;
}
