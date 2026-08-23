# Phase 4 and Phase 5 implementation truth

**Evidence date:** 2026-08-22
**Mode:** read-only comparison; this note does not mutate the ledger, MASTER, receipts, trust anchors, keys, or projections.

## Verdict

Phase 4 and Phase 5 have different closure boundaries:

- **Phase 4 foundation is complete as a verification and projection mechanism, not as product wiring.** It delivered the buildless append-only validator, reviewed-parent trust-anchor resolution, immutable per-batch snapshot verification, an ed25519 **verifier** (not a signer), ApprovalBroker identity parity, and transactional read-only projections. At that point the ledger was empty and no real decision had flowed through it. [Transition brief, lines 561–600](../../../CLOSURE-OS-PRODUCT-TRANSITION-BRIEF.md#14-closure-os-phase-4-foundation--complete-2026-08-15)
- **Phase 5's first safe vertical slice is complete and live.** It added the dry-run, writer, and owner-signing ceremony tools; completed the genesis public trust-anchor ceremony; and passed one authenticated owner decision through a signed, immutable batch into an append and atomic four-view projection. This is a first slice, not product-wide rollout. [Transition brief, lines 602–621](../../../CLOSURE-OS-PRODUCT-TRANSITION-BRIEF.md#143-phase-5-ilk-güvenli-dikey-dilim--complete-2026-08-17)

## Exact implemented boundary

### Phase 4: foundation

The implemented foundation enforces these boundaries:

1. **Authority separation.** MASTER remains work identity/state authority; the sidecar carries classification, admission, and priority-decision authority; projections are non-authoritative read-only derivatives. The sidecar does not mutate MASTER. [Transition brief, lines 568–576](../../../CLOSURE-OS-PRODUCT-TRANSITION-BRIEF.md#141-authority-ayrımı-değişmedi-artık-kodla-zorlanıyor) [Sidecar spec, lines 52–67](../../governance/closure-os-sidecar-ledger.md#2-authority-sınırları--master-vs-sidecar-vs-projections)
2. **Reviewed-parent root of trust.** Trust anchors resolve from the reviewed merge-base parent. A same-change key cannot authorize itself; an authorized rotation must be signed by a parent key. Genesis or unresolved Git state produces `TRUST_ANCHOR_BOOTSTRAP_UNRESOLVED` HOLD rather than an in-repo self-sign or warning fallback. [Transition brief, lines 580–585](../../../CLOSURE-OS-PRODUCT-TRANSITION-BRIEF.md#142-teslim-edilen-mekanizma-buildless-dist-bağımsız)
3. **Verification, not signing.** The Phase-4 gate verifies ed25519 attestations against committed public anchors and independently checks the signed batch fields and validity window. It does not sign. [Transition brief, lines 586–596](../../../CLOSURE-OS-PRODUCT-TRANSITION-BRIEF.md#142-teslim-edilen-mekanizma-buildless-dist-bağımsız) [Gate implementation, lines 448–539](../../../scripts/lint-closure-dispositions.mjs)
4. **Append-only and historical binding.** Existing baseline lines must remain an exact prefix; each batch is checked against its own immutable archived MASTER/proposal bytes rather than the current MASTER. Missing evidence yields HOLD and verified tampering yields failure. [Gate implementation, lines 508–539 and 542–566](../../../scripts/lint-closure-dispositions.mjs)
5. **Read-only projection.** Projection output is derived by applying events in sequence and is never truth authority. Drift, unknown rows, unresolved batches, or active conflicts do not silently pass. [Sidecar spec, lines 56–67](../../governance/closure-os-sidecar-ledger.md#2-authority-sınırları--master-vs-sidecar-vs-projections)

### Phase 5: first live writer/signer slice

The first vertical slice adds a guarded production path around that foundation:

- `phase5-dry-run.mjs` stages the bundle; `phase5-writer.mjs` claims and performs a fail-closed verified append plus projections; `phase5-sign.mjs` supports the owner signing ceremony. The private key remains outside the repository in owner custody; this review neither accessed nor used it. [Sidecar spec, lines 10–19](../../governance/closure-os-sidecar-ledger.md#closure-os-sidecar-decision-ledger--governance--reference-spec)
- The first batch used canonical request `aprcdb-dba89c0355ac0654f52a24e68e669329`, with `claimRef` pinned to `approval:<requestId>`, an allow receipt, an ed25519 attestation, immutable batch evidence, and two appended events. [Transition brief, lines 608–616](../../../CLOSURE-OS-PRODUCT-TRANSITION-BRIEF.md#143-phase-5-ilk-güvenli-dikey-dilim--complete-2026-08-17) [Ledger, events 1–2](../../governance/closure-dispositions.jsonl)
- Authentication was interactive live-auth through `deckent approvals decide`. The effective deployment has `api_decide=false`, so this evidence supports the CLI path only; it does not establish HTTP enablement or broad approval rollout. [Transition brief, lines 623–631](../../../CLOSURE-OS-PRODUCT-TRANSITION-BRIEF.md#144-hold--closure-approval-kapsamı-ve-ordered-residuallar)
- The gate does not itself assert that a user was authenticated. It verifies the committed, repo-verifiable binding: canonical ApprovalBroker identity, exact claim reference, allow decision, trusted public anchor, signature, immutable snapshot digests, tenant/project binding, time window, and single-use claim. Missing authority evidence is a typed HOLD. [Gate implementation, lines 448–539](../../../scripts/lint-closure-dispositions.mjs)

The current sidecar contains three append-only events. Events 1–2 are the first Phase-5 batch described above; event 3 is a later batch and does not expand the first-slice claim. [Ledger, events 1–3](../../governance/closure-dispositions.jsonl)

## Product-wide OPEN boundary and rollout residual

Phase 5 did **not** close product rollout. The supported residual is:

- MASTER priority mutation remains at **zero**; broad classification and P0/P1/P2 re-triage are not complete.
- Key revocation and rotation depth greater than one remain outside the completed slice.
- Product surfaces are not all rolled out. In particular, the currently evidenced approval deployment is CLI-only; the flag-gated HTTP decision endpoint is not enabled by this evidence.
- The named canonical work remains OPEN: Work 3300 needs post-sprint owner reconnect/restart and invoked-live-binary digest; Work 3296 retains historical/foreign records without inferred ownership; Work 480 still needs live approval, backup, before/after measurement, smoke, and receipt for migration adoption.
- The owner disposition/re-triage round, seven days of Closure Health data, and P50/P80 ETA remain outstanding; until then the product roadmap remains OPEN.

These residuals are stated by the transition brief and are not owner dispositions made by this note. A typed HOLD is not closure, and no provider invocation is treated as acceptance evidence. [Transition brief, lines 618–643](../../../CLOSURE-OS-PRODUCT-TRANSITION-BRIEF.md#144-hold--closure-approval-kapsamı-ve-ordered-residuallar)
