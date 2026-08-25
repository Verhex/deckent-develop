# Owner disposition admission package — 2026-08-22

**Package status:** `PREPARED / NOT ADMITTED`
**Authority created by this note:** `NONE`
**Ledger or MASTER mutation:** `NONE`

This is a decision-ready, read-only preparation note. It identifies the exact inputs an authenticated owner must supply or approve for Level/Lane classification, P0/P1/P2 re-triage, admission, and a later batch append. It is not a ledger event, receipt, approval, signature, or finding admission. Discovery of this file cannot confer authority.

## Decision scope

The current generated proposal covers 456 active rows and proposes Level/Lane classifications, three unresolved `hold-unassigned` lanes, and no priority changes (307 P0, 113 P1, 36 P2). It records `F-P0-INFLATION` as an open measurement finding and `F-DANGLING-REF` as resolved. These are proposals and observations only. Owner-declared semantics outrank structural or topological inference. A work ID pattern, dependency position, state, fan-out, or scan appearance cannot substitute for an owner decision.

## Authenticated owner inputs

The owner must make or explicitly approve every semantic decision included in the unsigned batch.

### 1. Level and Lane, per work item

For each selected `workId`, approve:

| Input | Allowed value or requirement |
|---|---|
| `level` | `outcome`, `package`, `task`, `check-proof`, or `finding` |
| `lane` | `contract`, `runtime`, `desktop`, `terminal`, `proof`, or typed HOLD `hold-unassigned` |
| `ruleId` | Non-empty explanation identifier |
| `confidence` | `high`, `medium`, or `low` |

`check-proof` requires `lane=proof`. The owner must explicitly resolve or preserve as `hold-unassigned` each currently unresolved lane: `AGENT-PERMISSION-MATRIX-001`, `CI-POSTMERGE-127-TRUTH-001`, and `LAUNCH-COMMS-001`. Generated defaults and overrides may be presented for approval, but scan output is not implicit consent.

### 2. P0/P1/P2 re-triage, per changed work item

For each actual priority decision, approve `workId`, optional known `fromPriority`, and required `toPriority`, with priorities in `P0 | P1 | P2`. The current proposal requests **zero priority-retriage events**. The owner must either approve that no-change scope or provide an explicit per-row change list. `F-P0-INFLATION`, dependency-gating, BLOCKED state, fan-out, or proposed Level is not permission to change priority. Applying a sidecar priority decision to MASTER is a separate owner-authorized settlement operation outside this package.

### 3. Admission, per unadmitted work item

For every row proposed for admission, approve one disposition:

- `child-proof-under-committed-outcome` — requires `parentOutcomeId`;
- `separate-committed-outcome`;
- `discovery`;
- `future-deferred`;
- `duplicate-superseded-disposed`; or
- `hold`.

`parentOutcomeId` must be supplied wherever required. Admission and Level are independent: assigning `level=finding`, discovering a finding, or listing it in a report does **not** admit it. There is no admission-by-finding or admission-by-file-presence.

A later `born-promotion` is a separate owner-approved forward event. It is valid only after a prior non-revoked `discovery` or `future-deferred` admission for the same `workId`; committed, hold, and duplicate-disposed admissions are not promotable.

## Exact batch approval binding

After semantic choices are frozen, tooling may stage an unsigned manifest and immutable snapshot bundle. The owner must authenticate and allow the exact batch subject, not a prose summary. The signed receipt binds:

- `requestId` and exact `claimRef = approval:<requestId>`;
- `decision = allow` and `subject.kind = closure-disposition-batch`;
- `tenantId` and `projectId`;
- `masterSnapshotDigest`, `registryIntegrityDigest`, and `proposalDigest`;
- `unsignedManifestDigest`;
- `eventCount`, `seqIntervalStart`, and `seqIntervalEnd`;
- `authenticatedAt`, `decidedAt`, and `authExpiresAt`; and
- attestation `keyId` and ed25519 `signature`.

The decision time must fall within the authenticated window. Each event must reference the same claim through `authorityProof.ownerReceipt` and carry `workId`, `rowDefinitionDigest`, `masterSourceDigest`, and `batchManifestDigest`. A receipt is single-use for one batch.

## Safe non-owner preparation

A non-owner may only:

1. read the current MASTER registry, proposal, schema enums, ledger tip, and public trust anchors;
2. assemble a worksheet from owner-supplied choices;
3. validate enums, required parents, `check-proof ⇒ proof`, row digests, lifecycle ordering, sequence interval, and append-only prefix;
4. dry-run/stage to calculate the unsigned manifest digest and archive candidates;
5. present the exact immutable subject and readable decision diff to the owner; and
6. run the sole validator against staged or committed public artifacts.

These steps may calculate hashes and inspect public keys. They must not claim authority, invent a receipt reference, sign, append, mutate MASTER, consume the proposal, or publish projections.

## Owner-only operations

Only the authenticated owner may:

1. choose or ratify Level/Lane, priority, and admission semantics;
2. authenticate the canonical approval claim and issue `decision=allow` for the exact subject;
3. authorize use of the owner-held signing key and produce the ed25519 attestation during the owner signing ceremony; and
4. authorize the verified append and any separate MASTER priority/state settlement.

The private key remains in owner custody outside the repository. This package neither requests nor permits private-key access by a worker, agent, preparer, writer, or verifier.

## Non-owner exclusions and fail-closed outcomes

A non-owner must not:

- forge, synthesize, copy-forward, guess, or self-author an `ownerReceipt`;
- treat a chat actor string, document author, scan output, file presence, or task completion as authentication;
- access, export, generate on the owner's behalf, or commit the owner's private key;
- introduce a same-change trust key that vouches for itself;
- append ledger JSONL, alter ledger history, or bypass the verified writer;
- infer admission from `level=finding`, a discovered issue, or an evidence file;
- infer priority changes from dependencies, state, topology, or the inflation finding; or
- treat a typed HOLD as approval, admission, closure, or mutation permission.

Missing or unverifiable owner authority results in `AUTHORITY_UNRESOLVED` or another typed HOLD; invalid verified material fails. In either case the ledger stays unchanged.

## Owner handoff checklist

- [ ] Complete per-row Level/Lane list and choices for the three unresolved lanes.
- [ ] Explicit priority change list, or confirmation of zero priority events.
- [ ] Per-row admission dispositions and required parent outcome IDs.
- [ ] Exact event count and sequence interval.
- [ ] Immutable MASTER/proposal digests and unsigned manifest digest.
- [ ] Tenant/project identity and canonical request/claim identifiers.
- [ ] Readable diff of every decision in the manifest.
- [ ] Confirmation that preparation mutated no ledger, MASTER, receipt, or private key.

After a valid authenticated allow receipt exists, the verified writer may bind the claim, append fail-closed, archive snapshots, and run the sole validator. Until all checks pass, status remains `PREPARED / NOT ADMITTED`.

## Evidence basis

- `docs/governance/closure-classification-owner-proposal.md`
- `docs/governance/closure-os-sidecar-ledger.md`
- `docs/MASTER-PLAN.md`
- `scripts/lint-closure-dispositions.mjs`
