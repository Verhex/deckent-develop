# PROVIDER-OBS-MIGRATION-001 — compiled adoption and closure result

**Evidence cut-off:** 2026-08-22 UTC
**Implementation disposition:** `COMPILED / ADOPTION_RECEIPT_VERIFIED`
**Live database mutation in this wave:** `NONE`
**Capsule:** `ACTIVE` — implementation closure is complete; canonical Closure disposition remains pending
**Work 480:** `OPEN`

This record compiles the disk-backed Brain-wave and outer-process evidence. It does not
authorize an owner decision, disclose raw identity, manufacture an XVerify seal, or mutate
Work 480 outside the canonical Closure process.

## Compiled and adoption evidence

- `npm run build:all` completed successfully.
- The managed bot was stopped and restarted through its documented lifecycle after the build.
- The compiled provider-observation binary completed inspect and migration/adoption dry-run.
  Both commands were read-only.
- Compiled inspection found the current database at v2 and matched it to the existing immutable
  adoption receipt for the exact v1→v2 transition. This validates an existing receipt; it is not
  a new adoption and does not permit migration replay.
- The database byte digest measured before and after inspect/dry-run was unchanged. This wave
  therefore records no live database mutation.
- The final rebuilt binary resolved the production default through the canonical
  `.deckent/provider-execution-observations.db` authority. Default inspect reported v2, 898 rows,
  row-lineage digest `62952583…c269`; the obsolete `.sqlite` default was absent.
- Final default-path adoption verification matched all 43 historical v1 rows and classified 855
  additional rows as run-owned. Plan digest `657d47f3…9f53` produced verifier receipt digest
  `94e5deb7…8c65` with `databaseMutation=none`. Source digest `def7a1af…2191` and current digest
  `d210322d…6a96` remained byte-identical before/after.
- Outputs remained aggregate/redacted; raw provider, target, tenant, project, execution, receipt,
  and filesystem identities are not reproduced here.
- No fresh owner decision was requested or inferred. A future mismatch remains fail-closed.

The digests above are the redacted aggregate receipt identities emitted by the compiled command;
no raw provider principal, execution identity, tenant identity or secret is copied here.

## Archive adoption and stale plan-only preservation

| Sprint | Preserved artifacts | Reconcile conflicts |
|---|---:|---:|
| `sprint-1780659451540` | 23 | 0 |
| `sprint-1780659451541` | 23 | 0 |
| `sprint-1780659451543` | 9 | 0 |

No stale evidence was deleted, overwritten, or promoted into current sprint truth. Current
canonical manifests additionally record:

- `sprint-1780659451545`: `COMPLETE`, 75 artifacts; terminal-receipt artifact digest
  `92144d9f6316acca3e9ef32e4798e9300d7cb1eb01ecc05d0cbe2a3e885f3628`.
- `sprint-1780659451546`: `COMPLETE`, 39 artifacts; terminal-receipt artifact digest
  `e3b1bf7fb2f3075e04034dbe8aade240194f4d25c35c8d12587a631e4c9351b9`.

The subsequent compiled closure sprints are also canonical and integrity-clean:

- `sprint-1780659451547`: `COMPLETE`, 27 artifacts, content digest `076a593b…9cf1`;
  terminal-receipt artifact digest `65a265e6…60df`.
- `sprint-1780659451548`: `COMPLETE`, 39 artifacts, content digest `9c61b93d…08b4`.
  One task was honestly classified `TECH_DEBT` because XVerify ingress returned
  `xverify_producer_result_mismatch`; no implementation NO_GO remained.
- `sprint-1780659451549`: `COMPLETE`, 27 artifacts, content digest `8ffa937d…9d07`.

Repository-wide reconciliation now verifies 664/664 sprint manifests and 28,458/28,458
artifacts (720,054,696 bytes) with zero missing, mismatched or untracked bytes. Fifteen manifest
conflict records remain preserved; no conflicting version was selected or overwritten.

## Outer-process and landing closure

Brain observed the complete outer chain rather than inferring it from worker verdicts:

1. compiled sprint 1547 exited naturally with code 0 and no signal;
2. its admitted `sprint-finalized` event was retained in `.deckent/notify-log.jsonl`;
3. its final archive verified 27/27 and left zero sprint-owned live `.tasks` artifacts;
4. path-authority follow-ups 1548 and 1549 also exited naturally and archived 39/39 and 27/27;
5. root `tsc` passed; provider battery passed 11 files/110 tests; notification battery passed
   7 files/57 tests; `git diff --check` and repository landing gates passed;
6. `npm run build:all` passed after managed bot stop; the final managed restart is PID 2125816 and
   its ownership-bound status plus `kill -0` health were confirmed after the compiled default
   inspect/adoption verification; and
7. the all-archive idempotency pass published 0, retired 0, failed 0 and preserved the Brain DB
   byte digest `d05f2c40…bdd55`; read-only `PRAGMA integrity_check` returned `ok` and the DB holds 664
   compact `sprint-archive` index rows.

## Product disposition

Work 480 remains `OPEN` only because MASTER state is append-only Closure authority, not editable
task prose, and the different-provider XVerify attempt is typed `HOLD` rather than a seal. The
implementation, wiring, compiled adoption, archive, natural-exit and landing gates are complete.
The capsule therefore remains active as a canonical Closure-disposition candidate; no manual
MASTER mutation or premature product `DONE` is asserted.

---

# Superseding cut — POMR15 result evidence

**Cut date:** 2026-08-22
**Supersedes:** every settlement inference in the earlier cut above
**Implementation proof:** **RECOVERED AND IMPLEMENTED**
**Live apply:** **PENDING — no durable receipt claimed by this cut**
**Post-finalizer archive proof:** **PENDING**
**XVerify:** **PENDING / no seal recorded**
**Owner Closure disposition for Work 480:** **OPEN — owner authority required**

This appended cut preserves the earlier record as history but retracts its claims that an
in-memory verifier value, a dry-run value, or prose describing an “existing immutable adoption
receipt” proves durable adoption. In particular, the earlier
`COMPILED / ADOPTION_RECEIPT_VERIFIED` disposition and statements that implementation closure is
complete are not current settlement authority. No earlier row count, digest, process observation,
worker verdict, or in-memory receipt value is promoted here into a disk receipt or owner Closure
decision.

## Recovered evidence

The evidence recovery established the following bounded facts:

- the retained schema-v1 preimage has 43 aggregate rows;
- the timestamped live schema-v2 measurement had 976 aggregate rows at
  `2026-08-22T17:52:37Z`;
- both measured databases passed read-only SQLite integrity checks and retained unchanged
  main-file, WAL, and SHM content digests across measurement;
- the declared compiled inspect command failed closed with
  `DECKENT_BINARY_IDENTITY_HOLD` (`build-root-mismatch`) before emitting JSON; and
- the predecessor `sprint-1780659451557` remains canonically `ABORTED`, with its 148 artifacts,
  recorded digest, and terminal evidence preserved. It is not rewritten or interpreted as a
  successful adoption.

The values 43, 976, and the stale prose value 53 describe different evidence contexts. None is,
by itself, an adoption settlement or durable receipt.

## Implemented evidence

The production implementation is separately evidenced as wired:

`compiled CLI entry → registered adopt action → default adoption → inspect/plan → apply-time
verification → durable publication → exact fresh read → redacted projection`.

The implementation publishes through a private temporary inode, fsyncs the file and directory,
uses no-replace publication, rereads and validates the final bytes/inode, and then performs an
exact scope- and plan-bound fresh read. Production entrypoint subprocess tests exercise this
chain, including replay and fail-closed concurrency, collision, tampering, and disclosure paths.
This is implementation and integration proof. It is not evidence that the command has been
live-applied to the measured project state.

## Remaining authority boundaries

1. **Live apply:** A future authorized live apply must use the exact approved plan against an
   unchanged source/target state. Only its successfully published and freshly reread
   content-addressed receipt can serve as the disk receipt for that apply. Until then, this cut
   claims neither durable receipt publication nor adoption settlement.
2. **Post-finalizer:** The active sprint cannot prove its own terminal archive while running.
   After the normal finalizer, an independent check must validate the active sprint manifest,
   terminal outcome, payload digest, every artifact byte/count/digest, complete inventory,
   reconciliation success, preservation rules, and idempotence. This gate remains pending.
3. **XVerify:** No XVerify seal is manufactured from worker, integration, measurement, or archive
   evidence. A required independent XVerify result remains a separate pending authority.
4. **Owner Closure:** Implementation proof can support an owner decision, but cannot make it.
   Work 480 remains `OPEN` until the canonical owner Closure authority records its disposition.

## Result

The implementation-proof gate is supported by recovered state evidence and production
wiring/integration evidence. The product Closure gate is not settled. History remains intact,
the predecessor remains `ABORTED`, and no disk receipt, post-finalizer PASS, XVerify seal, or
owner `DONE` is claimed before its corresponding authority acts.

---

# Final live cut — POMR17

**Supersedes:** POMR15's pending live-binary, durable-receipt and post-finalizer classes
**Technical disposition:** `LOCAL_VERIFIED / LIVE_RECEIPT_PERSISTED / ARCHIVE_VERIFIED`
**Work 480:** `OPEN` — different-provider XVerify and owner Closure remain external authorities

## Production closure

The sprint-1558 recovery completed all 20 logical tasks and published a canonical `COMPLETE`
terminal receipt. Independent archive inspection verifies 294 artifacts, 13,046,491 bytes and
content digest `f2794adfe78dd80184181d441fd80d4f47092af42a670b858563f63e46e4af5a`,
with zero conflict, missing, mismatch or untracked artifact. The predecessor sprint-1557 remains
`ABORTED` with its 148 artifacts intact.

After the sprint exited, Brain ran typecheck and scoped verification, stopped the managed bot,
built current source with `npm run build:all`, and invoked the rebuilt binary. The first live apply
exposed a real host-policy blocker: the receipt store incorrectly required the shared `.deckent`
control directory itself to be `0700`, while the repository contract safely uses owner-owned,
non-group-writable `0755`. The fixed boundary permits owner-controlled `0755` at `.deckent`,
rejects group/world-writable parents, and keeps every receipt descendant `0700` with final files
`0600`. Unit and real compiled-process regressions pin both acceptance and rejection paths.

## Live receipt

The final compiled flow was `inspect → dry-run → digest-bound apply → separate-process replay`.
It proved 43 exact retained legacy rows plus 946 run-owned rows in the 989-row schema-v2 target.
The create-only receipt is:

`sha256:5b4c3e75abb9d43a5f5e3d8490592100fbfbf761165ac5d53037f2bc0a8eb847`

The receipt is 1,184 bytes, mode `0600`, freshly reread through its exact scope and plan binding,
and records `databaseMutation=none`. Source/target main files, zero-byte WAL files and SHM files
kept the same size and SHA-256 digests before and after apply/replay. No temporary receipt inode
remained. The managed bot then restarted on PID 2600909 and two independent CLI/process checks
confirmed it alive.

## Verification

- TypeScript: PASS.
- Scoped provider/archive/finalizer battery: 24 files, 315 passed, 4 intentional skips.
- `git diff --check`: PASS.
- All-history archive: 673 manifests; 29,980 files checked; zero missing, mismatch, untracked or
  invalid manifest digest. Dry-run reconcile wrote nothing and reported no failure.
- Sprint 1558 second-pass reconcile: published 0, retired 0, failures 0.
- Different-provider XVerify: `HOLD / NO SEAL` because verifier authority was unavailable.

The technical implementation, wiring, live receipt, compiled binary and archive gates are now
complete. Work 480 remains `OPEN` because only authenticated append-only owner Closure authority
may change its canonical status, and a provider-unavailable HOLD cannot be converted into a seal.
