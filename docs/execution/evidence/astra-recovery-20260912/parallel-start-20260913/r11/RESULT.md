# R11 — read-only directory traversal: LOCAL_VERIFIED

UTC: 2026-09-13T22:30:51.385277+00:00. MASTER3178 RECOVERY-DO-DOGFOOD-001 / parent120 OPEN. Owner explicitly accepted this bounded ADR-D-007 repair after R10. DOGFOOD ON / DEGRADED. Two files landed main by baseline SHA CAS, uncommitted.

## Defect and repair

`src/core/task-attempt-custody-posix-adapter.ts:2406` previously invoked apply-private unconditionally while opening an existing parent directory. `native/exec-authority/src/custody_posix.c:3245` implements that call with fchmod and clears the opened resource's durability state. This made read-only traversal mutate directory permission metadata even when mode was already0700.

The call now occurs only for OPEN_OR_CREATE writer traversal. OPEN_EXISTING still opens through the native OWNER_PRIVATE policy and executes the existing post-open identity/type/mode equality validation. Missing/unsafe paths still fail; handle cleanup is unchanged. No identity cache, native guard bypass, timeout/budget change or new permission authority.

Producer/consumer path: Store/adapter readFirstWriter or readVerified → openFile → openParentDirectory → openDirectoryComponents(OPEN_EXISTING) → native descriptor-relative open/identity/read. Directory read and bounded directory scan use the same repaired traversal. ensurePrivateDirectory retains OPEN_OR_CREATE privacy application and sync. Win32 already applies privacy only when a directory is CREATED; its adapter was not changed. Real Windows/macOS execution is not claimed.

## Function proof

- BEFORE: real native temporary-file read returned correct bytes but changed parent ctime, even though permissions remained0700. `native-before.log`, exit1 solely for metadataUnchanged=false; unsafe750permission rejection already worked.
- AFTER: real native first-writer read, proof-verified read, private directory read and bounded directory scan all returned expected results. Root/parent/file ctime,mtime,mode,inode remained unchanged. OS access-time behavior is outside that assertion. Writer produced0700;750directory was rejected without silently chmod-repairing it. `native-after.log`, exit0.
- Repeated against built main: all seven checks true, `native-main.log`, exit0, observedAt2026-09-13T22:29:21.597Z. Fixtures are explicitly temporary isolated data, not product task/provider/XVerify receipts.
- Targeted POSIX54 + Win323 tests:57/57 PASS, exit0 (`tests.log`). The two new POSIX checks cover all four read paths without privacy writes, writer privacy preservation, and missing-directory reads without creation.
- Isolated npm run build exit0; main npm run build:all exit0; separate tsc --noEmit exit0; git diff --check exit0. Dashboard chunk-size advisory remains in build log; not a compile failure.

## Custody and remaining work

R10 failed performance candidate was NOT landed or enabled. Its four files are preserved at /tmp/deckent-r10-held-source; relocation hashes are in r10/RELOCATION.json. Before R11 build these dependency files were restored to main versions in /tmp/deckent-r4-757-repair and SHA-compared. R11 is independently reviewable in CHANGE.patch and LANDING.json.

758 remains canonical ABORTED, active=false, resumable=false, coordinator=absent, conflicts=[] (`758-status-after.json`). No new sprint, paid provider call, manual state/auth/receipt edit, cleanup, commit or push.

This fixes the confirmed permission-metadata side effect. It does NOT establish that whole-history readiness now meets10s. D performance closure remains open; next bounded work must address/measure repeated root-parent-native identity traversal with the native fences intact. E real8task run remains behind D. No15/30 expansion, formal XVerify, cross-platform live proof or outer product DONE claimed.
