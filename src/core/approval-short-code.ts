// ─── Approval short codes (DE1, design §3.5) ────────────────────────────────
//
// Ergonomics is a security property: nobody types a 64-char sha256 to decide.
// Every pending decision gets a deterministic, confusion-resistant 5-char
// human code — the SAME code on every surface — derived from the request id.
// A short code is ADDRESSING SUGAR ONLY: it never carries authority, never
// bypasses identity/MAC/channel rules, and resolves exclusively against the
// CURRENT pending set (a stale or unknown code is a typed fail-closed miss;
// an ambiguous one demands the full id — never a guess).

import { createHash } from 'node:crypto';

/** Crockford base32: no O/0, I/1 confusion (uppercase canonical form). */
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export const SHORT_CODE_LENGTH = 5;

/**
 * Deterministic short code: first 25 bits of sha256(requestId) → 5 Crockford
 * chars (32^5 ≈ 33.5M space vs tens of concurrent pendings). Uppercase.
 */
export function shortCodeFor(requestId: string): string {
  const digest = createHash('sha256').update(requestId, 'utf-8').digest();
  let bits = 0n;
  for (let i = 0; i < 4; i += 1) bits = (bits << 8n) | BigInt(digest[i]!);
  bits = (bits << 8n) | BigInt(digest[4]!);
  // 40 bits collected; take the top 25 as five 5-bit groups.
  let code = '';
  for (let group = 0; group < SHORT_CODE_LENGTH; group += 1) {
    const shift = BigInt(40 - 5 * (group + 1));
    code += CROCKFORD[Number((bits >> shift) & 0x1fn)]!;
  }
  return code;
}

/** Normalize user input: uppercase + map the classic confusables. */
export function normalizeShortCode(input: string): string {
  return input.trim().toUpperCase()
    .replace(/O/gu, '0')
    .replace(/[IL]/gu, '1');
}

/** True when the argument LOOKS like a short code rather than a full id. */
export function looksLikeShortCode(input: string): boolean {
  const normalized = normalizeShortCode(input);
  return normalized.length === SHORT_CODE_LENGTH
    && [...normalized].every(ch => CROCKFORD.includes(ch));
}

export type ShortCodeResolution =
  | { readonly state: 'resolved'; readonly id: string }
  | { readonly state: 'unknown' }
  | { readonly state: 'ambiguous'; readonly ids: readonly string[] };

/**
 * Resolve a short code against the CURRENT pending ids only. Unknown codes
 * are typed misses (fail-closed — a code from yesterday's inbox can never
 * address today's request); a collision returns every match and the caller
 * must demand the full id.
 */
export function resolveShortCode(
  input: string,
  pendingIds: readonly string[],
): ShortCodeResolution {
  const code = normalizeShortCode(input);
  const ids = pendingIds.filter(id => shortCodeFor(id) === code);
  if (ids.length === 1) return { state: 'resolved', id: ids[0]! };
  if (ids.length === 0) return { state: 'unknown' };
  return { state: 'ambiguous', ids };
}
