# R18 — 762 nested-parent repair and recovery gap

Owner explicitly authorized manual ADR-D-007 repair. MASTER3178 / parent120. DOGFOOD_HEALTH=DEGRADED. This is not sprint/product DONE.

## Proven defect and repair
The coordinator builds a compact dependencyReceipts array from only the current operation's parent authorities (execution-effect-landing-coordinator.ts:2975). Native parentIdentityDigest incorrectly indexed that compact array using the transaction-global operationIndex (execution-effect-native-adapter.ts:2118). For two new ancestors, file operation2 references parent operation1, but receives a one-element array. AUTHORITY_MISMATCH occurs before file mutation. The real Docker+native nested-source reproduction failed at this exact boundary before the patch (repro-nested.log, exit1). Lookup is now by exact operationDigest with unique match; missing and duplicate dependencies still HOLD. Real Docker+native transfer and nested landing pass with both large and small chunk boundaries.

Additional repair: fresh apply failure is retained rather than overwritten by immediate reconciliation. Reconciliation is a separate authorized recovery action; the current partial-mutation quarantine is not resumable by the in-flight path. Provider-start failure now preserves the inner typed HOLD code, rather than collapsing it to AUTHORIZATION_INVALID. Old durable observations remain unchanged.

## Verification
168/168 targeted tests (3files) exit0, including real Docker+native fixture; tsc --noEmit exit0. Isolated npm run build exit0. Source+tests CAS-landed to main (LANDING.json) without commit/push. Main npm run build exit1 at clean gate: quarantined partial-mutation and task EXECUTING projections. Main dist NOT updated. No gate bypass.

## Remaining blockers
- 002 journal: directories applied, file not applied; recovered product transaction and terminal receipt absent.
- 001/004 PREIMAGE_MISMATCH: shared derived parent now exists. Persistence validator explicitly requires absent preimage for every derived parent (execution-effect-persistence-contract.ts:3011-3051). Silently skipping that operation breaks durable proof. Need explicit verified reuse/provenance semantics across producer, journal, native verification and settlement, or exact admission dependency handling. No one-line relaxation.
- 003 old record cannot reveal inner provider-start cause. Future code retains it; controlled product redispatch still required.
- file-lock.ts:7076 resume accepts only in-flight irreversible-boundary; lock-adapter.ts:518 quarantine converts apply failure to partial-mutation. recoverQuarantinedExecutionLock at file-lock.ts:7647 requires verified attestation, but no src consumer found. Need production recovery bridge with exact journal/native prefix proof, unchanged quarantine audit history and tenant/root/attempt fencing; never constant-true verifier or manual lock deletion.
- Canonical status says ABORTED, active=false,resumable=false,coordinator=dead, terminalReceipt=null. Generic recover dry-run completed exit0, remediation=null; it scans full custody history before returning (sprint-recovery-operation.ts:685). No actual cleanup/recovery mutation initiated.
- Startup path inspectExactDockerPlanningRecoveryHealth (spawn-backend-docker.ts:5466) has an explicit verifiedReadSnapshot candidate disabled by default. Benchmark it against the complete history, same output/digests/freshness and bounded memory before changing default. End-to-end start remains target: Deckent, Docker prep and provider time all included; report each component and total, no hidden cold/provider delay.

## Next bounded work
1. Establish exact partial-mutation recovery authority and safe journal continuation; make preserved 002 effect recoverable through official ingress.
2. Resolve shared-derived-parent proof contract, then recover 001/004; expose and diagnose 003 retry precisely.
3. Only after task/sprint settlement, repair measured history and preparation latency; real max4 dogfood validates total time plus component timing.

No success receipts invented; no tasks/auth/memory manually edited; no new product sprint started.

## Post-repair read-only experiments
Generic recover --dry-run exit0 after more than 290s (process sample, not exact elapsed). Report preserves six files, exposes no remediation and counts only reservation/admission graph issues, excluding started-effect HOLDs from unresolvedBeforeRecovery. It does not prove landing recovery. No mutation run performed.
Verified snapshot candidate (isolated built public reader, exact main project root) returned HOLD / DISPATCH_DISCOVERY_DEADLINE_EXCEEDED after 10019.176495ms, exit1. Do not enable the candidate or raise the deadline to hide the issue. Historical discovery needs bounded incremental/current-authority projection design and exact freshness/corruption proof, not a blind cache/default toggle.

## Recovery admission foundation — real records verified
Source sprint-recovery-operation.ts now counts STARTED_ATTEMPT_RECONCILIATION_REQUIRED for the exact target sprint, exposes dispatch/task identities, and rejects generic housekeeping before containment or reservation mutation. Existing explicit retention and containment paths are unchanged. Targeted24 tests exit0; tsc exit0; isolated build exit0. Source/test CAS-landed main without commit/push.

Real CLI recover sprint-762 --dry-run --json using documented cross-checkout diagnostic (not ordinary production invocation) now reports unresolvedBeforeRecovery=3 and exact762-001/002/004, preserving6task/skill files. Exit0; monotonic319.600s. Ordinary cross-checkout invocation correctly refused runtime-root-mismatch. No mutation/cleanup invoked. This verifies the diagnostic projection, NOT the absent partial-mutation recovery bridge or settlement. Main build still HOLD.

Next implementation remains the explicit successor recovery-boundary/audit contract in PARTIAL-RECOVERY-CONTRACT.md. Do not claim this admission foundation recovered762.

## Applied prefix verification before recovery ownership
Production reconcileExecutionEffectLandingV1 now checks contiguous STEP artifacts and rereads each recorded operation through the native reconciliation adapter before adopting a lease. Exact postimage identity must match the stored STEP. Malformed artifact is not treated as absence; suffix/gap rejected. This is observation only, not authority to release quarantine. Changed prefix regression verifies no successor adoption and no next file write. 47tests exit0, tsc0; source/test CAS main landed. No main build or runtime recovery; partial-quarantine successor transition remains unimplemented/HOLD.

## Current disposition after owner-directed abort — 2026-09-14

The historical continuation plan above is superseded for762: owner-authorized finalize--force produced a consistent ABORTED receipt, archived six task/skill artifacts, and retired the coordinator. See force-finalize/RESULT.md. Subsequent bounded operator recovery verified exactly two empty derived directories with native identities, complete journal linkage, absent ADD target and ownerdeath; existing recoverQuarantinedExecutionLock API appended recovered audit and closed maintenance quarantine. Directories retained as failed-run residue; no accepted result or successful landing was fabricated. See aborted-retention/RESULT.md and MANIFEST.json. Main build:all exit0, post-build matching-build-identity and clean admissionALLOW. Automatic partial-effect recovery remains OPEN; this one-off operator verifier is Linux/WSL-only and is not product cross-platform closure. Next production work: shared-derived-parent semantics and measured startup discovery/preparation latency before another max4 dogfood.
