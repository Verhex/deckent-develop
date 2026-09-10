import { createHash } from 'node:crypto';
import { assertReferenceActive, ReferenceDigestError, type ReferenceSnapshot, type ReferenceOutline, type ReferenceOutlineNode, type ReferenceRange } from './reference-digest-types.js';
import { validateReferenceOutline } from './reference-digest.js';

/** Byte caps bound memory, not tokens. B must measure each resulting request before admission. */
export async function buildReferenceOutline(snapshot: ReferenceSnapshot, policy: {
  maxPartBytes: number; maxNodes: number; maxSourceBytes: number;
  /**
   * 7113-E D2 — size of the FIRST part only, when the caller wants the first
   * validated node to exist sooner. Every other part keeps `maxPartBytes`.
   *
   * This is a LATENCY shape, not a coverage change: the remaining parts still
   * cover the rest of the source, the union is still gapless and non
   * overlapping, cuts still land on UTF-8 (and where possible line) boundaries,
   * and `maxNodes`/`maxRequests` budgets are untouched. Absent or >=
   * `maxPartBytes` means the old uniform behaviour, byte for byte.
   */
  firstPartBytes?: number;
}, signal?: AbortSignal): Promise<ReferenceOutline> {
  if (![policy.maxPartBytes, policy.maxNodes, policy.maxSourceBytes].every(n => Number.isSafeInteger(n) && n > 0)
    || policy.maxPartBytes < 4) throw new ReferenceDigestError('REFERENCE_BUDGET_INVALID');
  if (policy.firstPartBytes !== undefined
    && (!Number.isSafeInteger(policy.firstPartBytes) || policy.firstPartBytes < 4)) {
    throw new ReferenceDigestError('REFERENCE_BUDGET_INVALID');
  }
  // The active ceiling: the first part may be smaller, everything after it is
  // the ordinary one. `nodes.length` is the authority on which part we are on,
  // so a resumed build sees exactly the same shape.
  const partCeiling = (): number => (nodes.length === 0 && policy.firstPartBytes !== undefined
    ? Math.min(policy.firstPartBytes, policy.maxPartBytes)
    : policy.maxPartBytes);
  if (snapshot.metadata.bytes > policy.maxSourceBytes) throw new ReferenceDigestError('REFERENCE_SOURCE_TOO_LARGE');
  const nodes: ReferenceOutlineNode[] = [];
  const hash = createHash('sha256');
  const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
  let pending = Buffer.alloc(0), consumed = 0, observed = 0, line = 1, midLine = false;
  let headings: string[] = [], fence: { char: string; length: number } | undefined;
  let priorLine: { text: string; range: ReferenceRange } | undefined;
  let tableHeader: ReferenceRange | undefined;
  const emit = (bytes: Buffer): void => {
    if (nodes.length >= policy.maxNodes) throw new ReferenceDigestError('REFERENCE_SOURCE_TOO_LARGE');
    const start = consumed, firstLine = line, continuation = midLine;
    const context: ReferenceRange[] = tableHeader ? [tableHeader] : [];
    const initialHeadings = [...headings];
    let at = start;
    for (const fragment of bytes.toString('utf8').match(/[^\n]*\n|[^\n]+$/g) ?? []) {
      const endsLine = fragment.endsWith('\n');
      const text = fragment.replace(/\r?\n$/, '');
      const range = { byteStart: at, byteEnd: at + Buffer.byteLength(fragment) };
      if (!midLine) {
        const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(text);
        if (marker) {
          const token = marker[1]!;
          if (!fence) { fence = { char: token[0]!, length: token.length }; tableHeader = undefined; }
          else if (token[0] === fence.char && token.length >= fence.length && marker[2]!.trim() === '') fence = undefined;
        } else if (!fence) {
          const heading = /^ {0,3}(#{1,6})\s+(.+)$/.exec(text);
          if (heading) {
            headings = [...headings.slice(0, heading[1]!.length - 1), heading[2]!.slice(0, 240)];
            tableHeader = undefined;
            if (at === start) initialHeadings.splice(0, initialHeadings.length, ...headings);
          }
          if (/^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?\s*$/.test(text) && priorLine?.text.includes('|')) {
            tableHeader = priorLine.range;
          } else if (!text.includes('|')) tableHeader = undefined;
        }
        if (tableHeader && !context.some(r => r.byteStart === tableHeader!.byteStart)) context.push(tableHeader);
      }
      priorLine = endsLine && !midLine && fragment.length <= policy.maxPartBytes
        ? { text, range } : undefined;
      midLine = !endsLine;
      if (endsLine) line++;
      at = range.byteEnd;
    }
    consumed += bytes.length;
    nodes.push({ sectionId: createHash('sha256').update(JSON.stringify([snapshot.metadata.sourceDigest, 1, start, consumed])).digest('hex'),
      byteStart: start, byteEnd: consumed, lineStart: firstLine, lineEnd: Math.max(firstLine, line - (midLine ? 0 : 1)),
      headingPath: initialHeadings, continuation, context });
  };
  for await (const chunk of snapshot.stream(signal)) {
    assertReferenceActive(signal);
    observed += chunk.length;
    if (observed > policy.maxSourceBytes || observed > snapshot.metadata.bytes) throw new ReferenceDigestError('REFERENCE_SOURCE_TOO_LARGE');
    if (chunk.includes(0)) throw new ReferenceDigestError('REFERENCE_ENCODING_INVALID');
    try { decoder.decode(chunk, { stream: true }); } catch { throw new ReferenceDigestError('REFERENCE_ENCODING_INVALID'); }
    hash.update(chunk);
    // Input capability supplies bounded chunks. Subdivision also bounds a large injected chunk.
    for (let pos = 0; pos < chunk.length; pos += policy.maxPartBytes) {
      pending = Buffer.concat([pending, chunk.subarray(pos, pos + policy.maxPartBytes)]);
      while (pending.length > partCeiling()) {
        let cut = partCeiling();
        while (cut > 0 && (pending[cut]! & 0xc0) === 0x80) cut--;
        const newline = pending.lastIndexOf(10, cut - 1);
        if (newline >= 0) cut = newline + 1;
        emit(pending.subarray(0, cut)); pending = Buffer.from(pending.subarray(cut));
      }
    }
  }
  assertReferenceActive(signal);
  try { decoder.decode(); } catch { throw new ReferenceDigestError('REFERENCE_ENCODING_INVALID'); }
  if (observed !== snapshot.metadata.bytes || hash.digest('hex') !== snapshot.metadata.sourceDigest) throw new ReferenceDigestError('REFERENCE_SOURCE_CHANGED');
  if (pending.length) emit(pending);
  const result: ReferenceOutline = { partitionVersion: 1, sourceDigest: snapshot.metadata.sourceDigest, sourceBytes: observed, nodes };
  validateReferenceOutline(result);
  return result;
}
