# DIRECTIVES — Phase-5 slice 1: dry-run batch bundle builder

## Goal

Build the UNSIGNED half of the Phase-5 writer: a dry-run builder that assembles a
closure-disposition batch bundle in an isolated staging directory and emits the exact
digest set Alperen's single authenticated approval will later bind. NO signing, NO live
ledger/receipt/trust-anchor/MASTER mutation, NO private key material anywhere.

## Execution Contract

- No build and no repository-wide/full-suite test run during this sprint.
- Effective concurrency is one; no parallel writer.
- Writable PROJECT-CONTENT paths are ONLY scripts/closure-ledger/phase5-dry-run.mjs and
  tests/governance/phase5-dry-run.test.ts; protocol-owned .tasks artifacts (your .plan,
  .result, .hb) are required protocol writes and are NOT project content.
- Never touch docs/governance/closure-dispositions.jsonl, docs/governance/
  closure-dispositions.receipts/, closure-trust-anchors files, docs/MASTER-PLAN.md, or
  any private key material; the builder itself must refuse an --out directory located
  under docs/governance.
- Reuse the SOLE canonical authority (scripts/closure-ledger/canonical.mjs exports:
  canonicalize, digestOf, computeEventDigest, computeBatchManifestDigest, SCHEMA);
  re-implementing canonicalization or digest logic is a NO_GO.
- Echo the policy digest in your .result as runPolicyEvidence exactly as the prompt's
  Result contract instructs.

## Task 1: Phase-5 dry-run bundle builder + hermetic proof
- Files: scripts/closure-ledger/phase5-dry-run.mjs, tests/governance/phase5-dry-run.test.ts
- Scope: scripts/closure-ledger/, tests/governance/, docs/governance/closure-os-sidecar-ledger.md, scripts/lint-closure-dispositions.mjs, scripts/master-plan-integrity.mjs

### Description
Create `scripts/closure-ledger/phase5-dry-run.mjs` (ESM, node:*, no new dependencies)
with a pure exported core plus a thin CLI:

1. `buildDryRunBundle({ decisionsPath, outDir, masterPlanPath, proposalPath })` reads a
   decisions JSON fixture (an array of unsigned closure events conforming to the ledger
   SCHEMA minus `authorityProof`, chain fields and `rowRef.batchManifestDigest`),
   validates required event fields against SCHEMA, and writes ONLY under `outDir`:
   `events.json`, `proposal.md` (copied bytes), `master-snapshot.json` (the MASTER bytes
   plus `sourceDigest`/`registryIntegrity` computed via scripts/master-plan-integrity.mjs
   exports), and `dry-run-summary.json`.
2. `dry-run-summary.json` carries the approval subject preview exactly as
   docs/governance/closure-os-sidecar-ledger.md §3.4 defines: tenantId, projectId,
   masterSnapshotDigest, registryIntegrityDigest, proposalDigest,
   unsignedManifestDigest (via computeBatchManifestDigest), eventCount,
   seqIntervalStart, seqIntervalEnd — plus a `signedBindingPreview` object containing
   the §3.4 signed-binding field set WITHOUT any signature/attestation material.
3. Fail-closed: missing/malformed decisions, an outDir under docs/governance, or any
   attempt to resolve paths outside outDir throws typed Errors (E_DRYRUN_*). The CLI
   (`node scripts/closure-ledger/phase5-dry-run.mjs --decisions <p> --out <dir>`) prints
   the digest set and exits non-zero on any violation.
4. `tests/governance/phase5-dry-run.test.ts` (hermetic, tmpdir, no spawnSync): digest
   determinism (same fixture ⇒ identical unsignedManifestDigest), staging isolation
   (no writes outside outDir), docs/governance outDir refusal, SCHEMA-field validation
   failure case, and summary completeness against the §3.4 subject field list.
5. Run targeted proof only: the new test file plus
   `node scripts/lint-closure-dispositions.mjs` (must stay green — live surfaces
   untouched). Record both outputs in your .result notes.
