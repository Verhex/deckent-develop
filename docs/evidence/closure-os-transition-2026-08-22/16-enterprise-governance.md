# T16 — Enterprise governance hardening residual

**Date:** 2026-08-22
**Mode:** Read-only inventory; no Work 7084 execution
**Verdict:** **GO for explicit residual inventory; HOLD for mutation or implementation**

Work 7084 (`CLOSURE-OS-TRANSITION-TRUTH-001`) remains `OPEN/P1`. Its scoped outcome is projection and documentation truth-sync without ledger or run-state mutation. The authenticated Closure OS mechanism and first batch are evidence of the current chain; they do not implement the governance residuals below and do not authorize a priority, key, tenant, product-boundary, or entitlement change.

## Residual inventory

| Residual | Current read-only finding | Required future acceptance boundary |
| --- | --- | --- |
| Inventory priority mutation | **Not performed: mutation depth 0.** The sidecar ledger records zero MASTER priority changes. Work 7084 may describe or project current priorities, but cannot apply the owner disposition or P0/P1/P2 re-triage turn. | A separately admitted owner decision must identify the exact rows, before/after priorities, authenticated authority, deterministic projection effect, rollback/replay behavior, and proof that no status or acceptance was inferred. Until then, current MASTER priorities remain authoritative. |
| Key revocation | **Not implemented.** Removing a reviewed key from the working tree is not revocation: reviewed-parent anchors remain trusted under the current verifier model. | A separate security design and implementation slice must define an authenticated, append-only revocation event; effective time and scope; tenant/project binding; historical-signature validity; replay, recovery, rollback, and compromised-key handling; and fail-closed validation. A documentation edit or key-file deletion must never imply revocation. |
| Rotation beyond one hop | **Not implemented: maximum admitted rotation depth is 1.** Only a reviewed-parent key may authorize a rotation; a rotation-added key cannot authorize another rotation in the same change. | A separate slice must specify bounded chain depth, ordered ancestry, cycle/branch/duplicate handling, revoked-ancestor behavior, tenant/project continuity, temporal validity, merge-base failure, and deterministic replay. Depth must not be increased by recursively trusting working-tree keys or permitting same-change self-vouching. |
| Tenant separation | **Binding invariant, not a completed enterprise control plane.** Current authority validation binds receipt subject tenant/project to the reviewed-parent anchor and rejects mismatches. This prevents cross-tenant signature use at that seam; it does not prove tenant lifecycle management, storage isolation, operator delegation, residency, export, or organization-wide policy. | Future Enterprise modules must preserve tenant/project identity across every published Core contract and evidence reference, deny cross-tenant reads/writes by default, keep tenant-scoped migrations isolated and reversible, and prove negative cross-tenant cases. Missing or ambiguous tenant identity must HOLD or fail closed, never fall back to a global/default tenant. |

## Core and Enterprise boundary constraints

ADR-G-041 assigns basic identity context, scope, approval, audit, secret safety, provider-neutral policy hooks, deterministic execution, recovery, and evidence to complete standalone MIT Core. Enterprise may add organization-scale tenant management, federation, custom policy packs, compliance export, retention/residency, fleet operations, and commercial entitlement only through published Core contracts, SPIs, and application APIs.

Every future residual slice is therefore constrained as follows:

- **One lineage:** Core-only and Core-plus-Enterprise use the same kernel, work ontology, runtime contracts, scheduler, state machines, task/run identities, recovery semantics, and evidence chain.
- **No parallel authority:** Enterprise must not create or override a kernel, scheduler, policy authority, state authority, registry, approval authority, or evidence authority. Organization-scale policy composes through Core hooks; it does not replace Core safety invariants.
- **No deep crossing:** Enterprise consumes published semver Core ports. It does not deep-import or copy Core internals, and new cross-layer imports must not increase the baseline while the compact modular monolith remains physically intact.
- **No degraded Core:** Core stays installable, secure, provider-neutral, local-first, and operational without Enterprise. Tenant-safe identity, basic approval/audit, recovery, and correct execution cannot depend on a commercial module.
- **No hidden license gate:** Entitlement checks remain at module admission/composition boundaries. License failure may deny an additive Enterprise module, but must not be scattered through kernel/runtime business logic, block Core execution, mutate evidence, or cause data loss.

## Non-expansion and stop conditions

This note does not mutate MASTER priorities, trust anchors, receipts, ledger events, projections, tenant data, repository topology, or runtime configuration. It does not select schemas or algorithms for revocation or multi-hop rotation, and it does not turn Work 7084 into their implementation umbrella.

Stop and require a separately scoped, gated work item if a proposal would:

- treat the read-only inventory as owner disposition or authenticated mutation authority;
- represent removal as revocation, or accept rotation depth greater than one without explicit chain semantics and negative proof;
- weaken tenant/project binding, silently choose a default tenant, or share tenant state without an explicit published contract;
- introduce a second kernel, scheduler, policy/state authority, evidence chain, or Core fork; or
- hide commercial entitlement in Core execution paths.

## Audit conclusion

The explicit residual state is: **priority mutation depth 0; key revocation absent; rotation depth greater than one absent; tenant/project signature binding present but broader Enterprise tenant separation unproven**. These are future, separately admitted governance slices. Work 7084 remains a read-only truth-sync item, and ADR-G-041's complete-Core, additive-Enterprise, single-kernel/no-fork boundary remains binding.
