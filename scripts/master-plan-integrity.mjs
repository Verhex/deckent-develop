// scripts/master-plan-integrity.mjs
// ─────────────────────────────────────────────────────────────────────────────
// The SINGLE byte-semantic authority for the master-plan-active.json integrity
// digests (`registryIntegrity` = sha256(canonical-json-utf8)). Extracted verbatim
// from scripts/lint-master-plan.mjs so BOTH that producer/validator AND the
// Closure OS gate (scripts/lint-closure-dispositions.mjs, which must re-verify an
// ARCHIVED master snapshot's integrity) consume ONE implementation — never a
// reimplementation, and NEVER the Closure canonical (a different algorithm for the
// ledger). Changing this changes MASTER's own integrity contract, so it stays
// byte-for-byte identical to the lint-master-plan original.
// ─────────────────────────────────────────────────────────────────────────────
import { createHash } from 'node:crypto';

/** Recursively sort object keys (arrays keep order) → a canonical value whose
 *  JSON.stringify is stable across runtimes. */
export function canonicalJsonValue(value) {
  if (Array.isArray(value)) return value.map(canonicalJsonValue);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, child]) => [key, canonicalJsonValue(child)]),
    );
  }
  return value;
}

/** @param {unknown} value */
export function sha256CanonicalJson(value) {
  return createHash('sha256')
    .update(JSON.stringify(canonicalJsonValue(value)), 'utf8')
    .digest('hex');
}

/** registryIntegrity = sha256(canonical-json-utf8) of the model MINUS its own
 *  registryIntegrity field — the whole payload (workItems, identityRegistry,
 *  sourceDigest, …), so tampering ANY of those bytes changes the digest. */
export function registryIntegrityDigest(model) {
  const { registryIntegrity: _ignored, ...payload } = model;
  return sha256CanonicalJson(payload);
}
