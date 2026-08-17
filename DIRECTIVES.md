# DIRECTIVES — Phase-5 slice 3: signed writer + owner sign ceremony

## Goal

Build the SIGNED half of the Phase-5 writer: file the ApprovalBroker claim that binds a
dry-run batch's digest subject, and — only after the owner's `allow` receipt exists —
verify, chain, archive, append and project the batch atomically. Plus a separate
owner-run sign-ceremony tool. Private key material NEVER enters the repo, logs, tests
or tool output; the live ledger/receipts/anchors are written ONLY by the append path
verifying a real receipt, and tests touch ONLY tmpdir fixtures.

## Execution Contract

- No build and no repository-wide/full-suite test run during this sprint.
- Effective concurrency is one; tasks run in declared order.
- Writable PROJECT-CONTENT paths are ONLY scripts/closure-ledger/phase5-writer.mjs,
  scripts/closure-ledger/phase5-sign.mjs, tests/governance/phase5-writer.test.ts and
  tests/governance/phase5-sign.test.ts; protocol-owned .tasks artifacts are required
  protocol writes, not project content.
- Tests must NEVER write docs/governance/** — all ledger/receipt/anchor fixtures live in
  tmpdir; reuse the SOLE validators/canonical exports (scripts/closure-ledger/canonical.mjs,
  scripts/lint-closure-dispositions.mjs exports) — re-implementing canonicalization,
  digests, receipt or anchor validation is a NO_GO.
- phase5-sign.mjs must refuse a --key path inside the repository, must never print, copy
  or persist private key bytes, and follows the genesis-anchor.mjs custody rules.
- Echo the policy digest in your .result as runPolicyEvidence exactly as the prompt's
  Result contract instructs.

## Task 1: phase5-writer.mjs — claim filing + verified append + projections
- Files: scripts/closure-ledger/phase5-writer.mjs, tests/governance/phase5-writer.test.ts
- Scope: scripts/closure-ledger/, tests/governance/, scripts/lint-closure-dispositions.mjs, src/core/approval-broker.ts, src/core/approval-contract.ts, docs/governance/closure-os-sidecar-ledger.md

### Description
ESM script with pure exported core + CLI, two modes:

1. `--file-claim --bundle <dir> --root <projectRoot>`: reads dry-run-summary.json from
   the bundle, files a pending ApprovalBroker request whose subject is exactly the §3.4
   `closure-disposition-batch` field set (tenantId/projectId/master, registry, proposal,
   unsignedManifest digests, eventCount, seq interval), using the canonical broker
   persistence the `deckent approvals` CLI reads (study src/core/approval-broker.ts —
   dist import or documented pending-store shape; never invent a parallel inbox). Prints
   the canonical requestId and writes `claim.json` ({requestId, claimRef:
   "approval:<requestId>"}) into the bundle dir. Idempotent: an existing claim.json is
   reused, never duplicated.
2. `--append --bundle <dir> --receipt <path> --root <projectRoot>`: fail-closed BEFORE
   any live write — verifies the receipt file with the gate's SOLE receipt/anchor
   validators against docs/governance/closure-trust-anchors.json, recomputes every
   bundle digest and compares to the receipt subject, then and only then: sets each
   event's rowRef.batchManifestDigest, computes the hash chain (zero-anchor →
   previousEventDigest/eventDigest via canonical computeEventDigest) with
   authorityProof = {receiptRef: <requestId>}, archives the bundle bytes to the
   canonical batches location the gate expects, appends the events to
   docs/governance/closure-dispositions.jsonl (temp+rename, append-only — existing
   bytes are never rewritten), writes docs/governance/closure-dispositions.receipts/
   <requestId>.json (exact receipt bytes), runs scripts/closure-ledger/project.mjs for
   the atomic four-view projections, and finally runs the full closure gate; a red gate
   after append is reported as a typed failure (no silent success).
3. Typed E_WRITER_* errors for every refusal; unknown flags fail closed.
4. Hermetic suite (tmpdir --root): claim filing creates a pending request readable by
   the broker store; append refuses missing/invalid/mismatched receipt (wrong digest,
   wrong tenant, non-allow decision, filename mismatch); a full happy-path with a
   test-generated ed25519 keypair + tmpdir trust-anchors produces a gate-green tmpdir
   ledger with a valid chain; live docs/governance is byte-untouched by tests.

## Task 2: phase5-sign.mjs — owner sign ceremony (depends on Task 1)
- Files: scripts/closure-ledger/phase5-sign.mjs, tests/governance/phase5-sign.test.ts
- Scope: scripts/closure-ledger/, tests/governance/, docs/governance/closure-os-sidecar-ledger.md

### Description
Owner-run ceremony tool: `--bundle <dir> --request <requestId> --decision allow
--key <abs-path-outside-repo> [--out <attestation.json>]`. Builds the §3.4 signed
binding (closure-canonical-v1 of requestId, claimRef, decision, subject fields,
authenticatedAt/decidedAt/authExpiresAt timestamps it stamps strict-ISO-UTC), signs it
ed25519 with the owner key read from OUTSIDE the repo, and emits {keyId, signature}
plus a ready-to-place receipt JSON draft — WITHOUT ever printing or persisting key
bytes; in-repo key paths, non-ed25519 keys and PUBLIC-key inputs are typed refusals.
Hermetic suite with a tmpdir keypair: signature verifies against the SOLE validator
path, in-repo key refusal, window ordering (authenticatedAt ≤ decidedAt ≤ authExpiresAt).
