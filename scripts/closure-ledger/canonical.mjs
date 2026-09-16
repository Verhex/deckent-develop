// scripts/closure-ledger/canonical.mjs
// ─────────────────────────────────────────────────────────────────────────────
// Canonical JSON encoder + digest for the Closure OS append-only sidecar ledger
// (§12.1 rev-2). Buildless pure JS so BOTH the pre-build gate
// (scripts/lint-closure-dispositions.mjs) and the phase-5 writer consume ONE
// implementation — the single validator, never re-implemented in TypeScript.
//
// The encoding rules are READ from the schema SSOT
// (src/core/closure-classification-schema.json → canonicalEncoding), never
// hardcoded here. See that block for the frozen v1 spec (covered fields, NFC,
// array order, integer-only, sorted keys).
// ─────────────────────────────────────────────────────────────────────────────
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCHEMA_PATH = join(dirname(fileURLToPath(import.meta.url)), '../../src/core/closure-classification-schema.json');
export const SCHEMA = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8'));
export const CE = SCHEMA.canonicalEncoding;

// v1 freeze: validate the schema's canonicalEncoding declares the exact supported
// values this implementation honors. An implementation/schema mismatch fails loudly
// at load — never silently digests under an unexpected spec (Codex req 4).
const SUPPORTED = Object.freeze({
  version: [1],
  algorithm: ['json-canonical-sorted-keys-utf8'],
  digestAlgorithm: ['sha256'],
  digestEncoding: ['hex'],
});
for (const [field, allowed] of Object.entries(SUPPORTED)) {
  if (!allowed.includes(CE[field])) {
    throw new Error(`canonical: schema canonicalEncoding.${field}='${CE[field]}' is not a supported value (${allowed.join('|')}) — implementation/schema mismatch`);
  }
}

const nfc = (s) => s.normalize('NFC');

/** Canonicalize a JSON value to the frozen v1 string form. Throws (never silently
 *  coerces) on: non-integer numbers, undefined array elements, NFC key collisions,
 *  or uncanonicalizable types. The recursion lives in a local helper so the
 *  exported binding is not self-referential. */
export function canonicalize(value) {
  const enc = (v) => {
    if (v === null) return 'null';
    const t = typeof v;
    if (t === 'string') return JSON.stringify(nfc(v));
    if (t === 'boolean') return v ? 'true' : 'false';
    if (t === 'number') {
      if (!Number.isInteger(v)) throw new Error(`canonical: non-integer number (${v}) in a covered field`);
      return String(v);
    }
    if (Array.isArray(v)) {
      // array order is SIGNIFICANT; an undefined element is REJECTED (not silently dropped)
      return `[${v.map((x) => { if (x === undefined) throw new Error('canonical: undefined element in array — reject (not silent-drop)'); return enc(x); }).join(',')}]`;
    }
    if (t === 'object') {
      // object undefined-valued keys are omitted (≡ absent); but two distinct keys
      // that NFC-normalize to the SAME string are a collision → reject (ambiguous).
      const byNorm = new Map();
      for (const k of Object.keys(v)) {
        if (v[k] === undefined) continue;
        const nk = nfc(k);
        if (byNorm.has(nk)) throw new Error(`canonical: NFC key collision between '${byNorm.get(nk)}' and '${k}' (normalize to same key)`);
        byNorm.set(nk, k);
      }
      const normKeys = [...byNorm.keys()].sort();
      return `{${normKeys.map((nk) => `${JSON.stringify(nk)}:${enc(v[byNorm.get(nk)])}`).join(',')}}`;
    }
    throw new Error(`canonical: uncanonicalizable value type '${t}'`);
  };
  return enc(value);
}

/** Digest of a canonical string per the schema's digestAlgorithm/encoding. */
export function digestOf(canonicalString) {
  return createHash(CE.digestAlgorithm).update(canonicalString, 'utf8').digest(CE.digestEncoding);
}

/** The signed view of an event = every field EXCEPT eventDigest (the output). */
export function eventSignedView(event) {
  const { eventDigest, ...rest } = event;
  return rest;
}

/** eventDigest = digest(canonical(event minus eventDigest)). */
export function computeEventDigest(event) {
  return digestOf(canonicalize(eventSignedView(event)));
}

/** True iff the event's stored eventDigest matches a fresh recomputation. */
export function verifyEventDigest(event) {
  return typeof event.eventDigest === 'string' && event.eventDigest === computeEventDigest(event);
}

/** Digest of the ordered UNSIGNED decision manifest for a batch (§ approvalIntegration).
 *  Non-circular: excludes each event's authorityProof (the receipt, added AFTER the
 *  decision), its chain fields (eventDigest/previousEventDigest, finalized AFTER the
 *  receipt), and rowRef.batchManifestDigest (which IS this digest). This is what the
 *  approval request binds FIRST; the phase-5 writer then sets each event's
 *  rowRef.batchManifestDigest to it. Computed with closure canonical v1. */
export function computeBatchManifestDigest(events) {
  const manifest = events.map((e) => {
    const { authorityProof, eventDigest, previousEventDigest, rowRef, ...rest } = e;
    const rr = rowRef || {};
    const { batchManifestDigest, ...rrRest } = rr;
    return { ...rest, rowRef: rrRest };
  });
  return digestOf(canonicalize(manifest));
}
