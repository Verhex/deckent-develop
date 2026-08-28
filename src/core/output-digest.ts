import { createHash } from 'node:crypto';

/**
 * Identify captured process output without ever reproducing it.
 *
 * Every consumer here handles provider or subprocess output, which routinely
 * carries tokens, auth URLs and absolute paths — so the digest exists precisely
 * so that failure evidence can be recorded, compared and correlated while the
 * bytes themselves stay out of messages, logs and receipts.
 *
 * Each part is framed with its own byte length before hashing. A plain
 * delimiter-joined concatenation (`stdout + "\n" + stderr`) collapses distinct
 * runs onto one identity: stdout `"a"` with stderr `"b\nc"` and stdout `"a\nb"`
 * with stderr `"c"` join to the same string, so two different outcomes would
 * share a digest and stop being distinguishable. Framing removes that class.
 *
 * Byte lengths — not string lengths — are framed, so multi-byte output cannot
 * shift the frame boundary.
 *
 * @param parts ordered output segments; `undefined` is framed as empty, which
 *   keeps a missing stream distinct from an absent one by position.
 * @returns algorithm-prefixed digest, `sha256:<hex>`.
 */
export function framedOutputDigest(parts: readonly (string | undefined)[]): string {
  const hash = createHash('sha256');
  for (const part of parts) {
    const bytes = Buffer.from(part ?? '', 'utf8');
    hash.update(`${bytes.length}:`);
    hash.update(bytes);
  }
  return `sha256:${hash.digest('hex')}`;
}
