import { ReferenceDigestError, type ReferenceOutline, type ReferenceRange } from './reference-digest-types.js';

/** Exact byte coverage, independent of LLM claims. Context/overlap is intentionally excluded. */
export function validateReferenceCoverage(ranges: readonly ReferenceRange[], sourceBytes: number): void {
  if (!Number.isSafeInteger(sourceBytes) || sourceBytes < 0) throw new ReferenceDigestError('REFERENCE_RANGE_INVALID');
  let cursor = 0;
  for (const range of ranges) {
    if (!Number.isSafeInteger(range.byteStart) || !Number.isSafeInteger(range.byteEnd)
      || range.byteStart !== cursor || range.byteEnd <= range.byteStart || range.byteEnd > sourceBytes) {
      throw new ReferenceDigestError('REFERENCE_RANGE_INVALID');
    }
    cursor = range.byteEnd;
  }
  if (cursor !== sourceBytes) throw new ReferenceDigestError('REFERENCE_RANGE_INVALID');
}
/** Foundation admission only. B adds measured map/reduce; this function cannot issue a provider request. */
export function validateReferenceOutline(outline: ReferenceOutline): void {
  if (outline.partitionVersion !== 1 || !/^[a-f0-9]{64}$/.test(outline.sourceDigest)) throw new ReferenceDigestError('REFERENCE_RANGE_INVALID');
  validateReferenceCoverage(outline.nodes, outline.sourceBytes);
  const ids = new Set<string>();
  for (const node of outline.nodes) {
    if (ids.has(node.sectionId)) throw new ReferenceDigestError('REFERENCE_RANGE_INVALID');
    ids.add(node.sectionId);
    for (const context of node.context) {
      if (!Number.isSafeInteger(context.byteStart) || !Number.isSafeInteger(context.byteEnd)
        || context.byteStart < 0 || context.byteEnd <= context.byteStart || context.byteEnd > outline.sourceBytes) {
        throw new ReferenceDigestError('REFERENCE_RANGE_INVALID');
      }
    }
  }
}
