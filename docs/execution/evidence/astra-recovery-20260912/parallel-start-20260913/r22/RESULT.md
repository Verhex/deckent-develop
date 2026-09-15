# R22 — verified partial landing journal

UTC 2026-09-14T14:37:55.262630+00:00. MASTER3178 / parent120 OPEN. Owner-approved ADR-D-007; DOGFOOD_HEALTH=DEGRADED.

## Implemented and wired

`src/orchestra/execution-effect-landing-coordinator.ts:1720`: one bounded strict durable STEP-prefix reader reuses existing prepared/applying/operation/native-receipt parsers and digest domains. Missing entries are distinct from read failure, malformed bytes and noncanonical JSON. Gaps, unexpected suffix, causal timestamp regression and invalid digest links reject.

`src/orchestra/execution-effect-landing-coordinator.ts:1756`: partial journal proof requires PREPARED + APPLYING + a nonempty proper prefix, no COMMITTED marker (even malformed). Produces references/digests and original verified operations; does not grant recovery, acceptance or mutation authority. Arbitrary extra journal keys outside the transaction's bounded expected sequence require caller's complete custody inventory; this API does not claim directory-discovery coverage.

`src/orchestra/execution-effect-landing-coordinator.ts:1805`: existing production reconcile uses the same prefix reader before native postimage verification and lease adoption. No separate parser or alternative recovery engine.

`src/orchestra/execution-effect-store-adapter.ts:746`: Store-backed partial journal reader binds the proof to actual admission identity and durable READY attempt/baseline/final/containment authority. It does not invent a completed recovery anchor. The real762002 has no landing-recovery-anchor artifact, so the committed-pending reader cannot be reused for this incident.

## Real binary evidence

Main compiled reader at 2026-09-14T14:37:10.967Z: journal proof `sha256:bfc3149cb490f70cde055047956fb56723c85743439300a47487910492243035`. Actual Store read, no fixture journal. Two valid STEP records / three operations. Native inspection confirms two exact ADD_DIRECTORY identities and parent identities, compatible modes and zero-content subtrees. Remaining ADD target absent. Recovered audit event `77ccf374-dd7d-4b1a-b0d8-ebe65d1231fd` matches canonical storage and journal boundary/transaction evidence. Run remains ABORTED/inactive. Probe uses existing compiled private read methods diagnostically to reconstruct the exact scope; it does not install production health overrides or dispatch work.

`probe.mjs` / `main-live-proof.json` contain the exact invocation inputs and recorded native observations. Probe is bounded to this owner-authorized empty-derived-directory incident; it is not a general automatic native retention verifier.

## Verification / failures preserved

- First coordinator run: 47 pass /1 fail, exit1 (test helper typo `canonical`, corrected to `canonicalJson`).
- Coordinator+real lock adapter: 56/56 exit0.
- Three-file suite: 80/80 assertions passed but command exit1: operator ran isolated build concurrently, causing hermetic dist drift. Do not report that run as green.
- Repeated with build finished and no parallel mutation: 80/80, exit0. No test policy bypass.
- TypeScript exit0, isolated build exit0, isolated real probe exit0.
- Main build:all exit0, 27.124s; binary matching-build-identity exit0; main real probe exit0.
- Scoped diff check exit0. No XVerify/platform-wide closure claim.

## Remaining exact work (not DONE)

762002 remains unresolved for startup; NO ABORTED_PARTIAL_EFFECT disposition has been published. Two foundation links (canonical recovered audit and verified Store-backed journal prefix) are now available and measured. Next must implement the immutable custody disposition, conflict/resurrection guards, exact approved recovery ingress, stopped container/exclusive resource checks, and the planning-health consumer in one connected slice. Capture native proof at first-writer publication; retain canonical ABORTED truth and verify journal/recovery/terminal provenance on reread. Do not weaken STARTED_FAILED's no-journal invariant or resume762. First safe return is real start max4 after exact002 disposition makes health ready.

No new run/provider call, cleanup, auth mutation, commit or push. Cursor lane untouched. Source/build updated; wider outcome OPEN.
