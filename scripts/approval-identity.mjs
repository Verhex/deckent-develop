// scripts/approval-identity.mjs
// ─────────────────────────────────────────────────────────────────────────────
// Buildless MIRROR of the canonical ApprovalBroker identity rules
// (src/core/approval-contract.ts → approvalIdSchema). The gate runs pre-build with
// no dist dependency, so it cannot import the TS/Zod schema directly; this pure
// module carries the SAME rules and is PINNED to approvalIdSchema by a parity test
// (tests/governance/approval-identity-parity.test.ts) — approvalIdSchema stays the
// SOLE authority, this is a drift-checked mirror, NOT a second free authority.
//
// Rules (verbatim semantics of approvalIdSchema):
//   • length 1..128
//   • lowercase-ASCII opaque id: /^[a-z0-9](?:[a-z0-9._-]{0,126}[a-z0-9_-])?$/
//     (must START and END with an alphanumeric / underscore / hyphen — structurally
//      forbids uppercase, path separators, a leading separator, and a TRAILING dot or
//      space; a trailing hyphen or underscore IS allowed, only a trailing '.'/' ' is not)
//   • not a Windows reserved device name
// ─────────────────────────────────────────────────────────────────────────────

export const APPROVAL_ID_MAX = 128;
export const APPROVAL_ID_RE = /^[a-z0-9](?:[a-z0-9._-]{0,126}[a-z0-9_-])?$/;
// verbatim from approval-contract.ts
export const WINDOWS_RESERVED_DEVICE_RE = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;

/** True iff `id` is a canonical ApprovalBroker id (parity with approvalIdSchema). */
export function isCanonicalApprovalId(id) {
  return typeof id === 'string'
    && id.length >= 1
    && id.length <= APPROVAL_ID_MAX
    && APPROVAL_ID_RE.test(id)
    && !WINDOWS_RESERVED_DEVICE_RE.test(id);
}

/** The one canonical claim-ref shape the ledger binds for a request. */
export function claimRefFor(requestId) {
  return `approval:${requestId}`;
}
