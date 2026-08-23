# PROVIDER-OBS-MIGRATION-001 — compiled verification ledger

**Date:** 2026-08-22 UTC
**Documentation check:** `PASS`
**Build and managed restart:** `PASS`
**Compiled inspect/dry-run:** `PASS / READ_ONLY`
**Exact v1→v2 adoption receipt:** `MATCHED`
**Outer-process exit/finalizer:** `PASS`
**Work 480:** `OPEN`
**Independent verification:** `HOLD` when a different provider is unavailable; not a seal

## Verification matrix

| Check | Disk-backed observation | Disposition |
|---|---|---|
| Build | `npm run build:all` succeeded. | `PASS` |
| Managed bot lifecycle | Bot stopped and restarted through the managed lifecycle after build. | `PASS` |
| Compiled inspect | Compiled provider-observation inspect completed against the current target. | `PASS`, aggregate/redacted |
| Compiled migration/adoption dry-run | Dry-run completed without apply. | `PASS`, read-only |
| Schema/adoption | Current v2 state matched the immutable receipt for the exact v1→v2 adoption. | `MATCHED`; no replay |
| Database integrity | Before and after database byte digests were unchanged. | `PASS`; zero mutation |
| Stale sprint 1540 | 23 plan-only artifacts preserved. | `PASS`; 0 conflicts |
| Stale sprint 1541 | 23 plan-only artifacts preserved. | `PASS`; 0 conflicts |
| Stale sprint 1543 | 9 plan-only artifacts preserved. | `PASS`; 0 conflicts |
| Sprint 1545 archive | `COMPLETE`, 75 artifacts; terminal-receipt artifact digest `92144d9f6316acca3e9ef32e4798e9300d7cb1eb01ecc05d0cbe2a3e885f3628`. | Manifest-backed |
| Sprint 1546 archive | `COMPLETE`, 39 artifacts; terminal-receipt artifact digest `e3b1bf7fb2f3075e04034dbe8aade240194f4d25c35c8d12587a631e4c9351b9`. | Manifest-backed |
| Canonical default path | Compiled help and inspect selected `.deckent/provider-execution-observations.db`; no legacy default file existed. | `PASS` |
| Final adoption receipt | 43 legacy rows + 855 run-owned extras; receipt `94e5deb7…8c65`; `databaseMutation=none`. | `PASS` |
| Exact wave process exits without signal | Sprint 1547 returned exit 0 naturally. Follow-ups 1548/1549 did the same. | `PASS` |
| Retained `sprint-finalized` notification | Durable notify log contains terminal events for 1547–1549. | `PASS` |
| Final manifest/hash and zero sprint artifacts in `.tasks` | 1547=27/27, 1548=39/39, 1549=27/27; no sprint-owned live task artifact. | `PASS` |
| Post-exit TypeScript/gates | `tsc`, 110 provider tests, 57 notification tests, landing gates and diff-check passed. | `PASS` |
| Repository archive integrity | 664 manifests, 28,458 artifacts, 720,054,696 bytes; zero verify failure. | `PASS` |
| Brain semantic index | `integrity_check=ok`, 664 compact archive rows; idempotent reapply preserved DB digest. | `PASS` |

## Receipt and privacy boundary

“Exact v1→v2 adoption receipt” means the compiled inspector matched current v2 state to the
durable immutable receipt for that transition. It does not mean this task applied a migration.
The authorized evidence does not expose a safe publishable receipt digest, so none is invented.
Raw identity and target path remain omitted. Unchanged before/after database digests establish
that inspect and dry-run did not mutate the live observation database. No owner choice is made.

## Archive boundary

The preservation counts are exact: 1540 = 23, 1541 = 23, and 1543 = 9, with zero reconciliation
conflicts. They are stale plan-only artifacts, not current execution authority.

The 1545 and 1546 manifest values above were read from
`.deckent/archive/sprints/sprint-1780659451545/manifest.json` and
`.deckent/archive/sprints/sprint-1780659451546/manifest.json`.

## Remaining authority boundary

Outer verification is complete. The capsule stays active and Work 480 stays `OPEN` until the
append-only Closure authority admits its disposition. Different-provider XVerify unavailability
remains an explicit `HOLD`; same-provider review cannot make it a seal. No implementation or
compiled-runtime blocker remains in this outcome.

---

# Superseding verification-class ledger — POMR16

**Cut date:** 2026-08-22
**Supersedes:** the settlement classifications in the earlier ledger above
**Task verdict:** documentation assessment only; **not independent verification**
**Current local class:** **LOCAL_VERIFIED** for implementation wiring/integration evidence only
**Live binary/apply class:** **PENDING**
**Post-finalizer archive class:** **PENDING**
**Independent XVerify class:** **HOLD / NO SEAL** when a different provider is unavailable
**Work 480 owner Closure:** **OPEN**

The earlier ledger is retained as historical evidence, but its all-green compiled, receipt,
outer-process, and archive conclusions are not current authority. POMR15 retracted those
settlement inferences. In particular, an in-memory verifier value, dry-run value, stale row
count, worker verdict, or same-provider review cannot become a durable adoption receipt or an
independent verification seal.

## Class ledger

| Verification class | Supported result | Evidence boundary |
|---|---|---|
| Scoped plan/apply verification | **LOCAL_VERIFIED** | The implemented chain performs an exact fresh read bound to the approved scope and plan after durable publication. This supports implementation behavior, not a live project-state apply. |
| Production wiring | **LOCAL_VERIFIED** | The evidenced chain is compiled CLI entry → registered adopt action → default adoption → inspect/plan → apply-time verification → durable publication → exact fresh read → redacted projection. This is wiring/integration proof only. |
| Privacy and disclosure | **LOCAL_VERIFIED** | Outputs are aggregate/redacted. Raw provider principal, target, tenant, project, execution, receipt, secret, and filesystem identities are not reproduced in this ledger. |
| Replay and fail-closed behavior | **LOCAL_VERIFIED** | Production-entrypoint subprocess coverage exercises replay plus concurrency, collision, tampering, and disclosure failures. This class reports exercised integration behavior; it does not claim that a live migration ran. |
| Real compiled binary against the measured project state | **PENDING** | The recovered compiled inspect attempt failed closed with **DECKENT_BINARY_IDENTITY_HOLD** (**build-root-mismatch**) before JSON output. No later successful real-binary apply or durable receipt is established by the superseding evidence. |
| Durable live adoption receipt | **PENDING** | No live apply is claimed. Only a successfully published, freshly reread, content-addressed receipt for the exact approved plan against unchanged source/target state can satisfy this class. |
| Post-finalizer archive verification | **PENDING** | The active sprint cannot verify its own terminal archive. Earlier archive observations do not satisfy this future independent gate for the current sprint. |
| Different-provider XVerify | **HOLD / NO SEAL** | When a different provider is unavailable, the result remains a non-sealing HOLD. Same-provider review, this task verdict, integration evidence, and archive evidence are not substitutes. |
| Canonical owner Closure | **OPEN** | Implementation evidence may inform the owner, but only canonical append-only Closure authority may dispose Work 480. |

## Exact pending Brain gates

Brain may not promote this ledger to product closure until each distinct authority below acts:

1. **Authorized live apply:** run the real compiled binary with the exact approved plan against
   unchanged source and target state; publish with the implemented no-replace/fsync path; freshly
   reread and validate the final bytes and inode; and retain the resulting content-addressed,
   scope- and plan-bound disk receipt.
2. **Post-finalizer archive verification:** after normal finalization, independently verify the
   active sprint manifest and terminal outcome, payload digest, every artifact byte/count/digest,
   complete inventory, reconciliation success, preservation rules, and idempotence.
3. **Independent XVerify:** obtain the required different-provider verification result. Provider
   unavailability remains **HOLD**, not **PASS**, and creates no seal.
4. **Owner Closure:** after the preceding evidence is admitted, the canonical owner Closure
   authority must explicitly record the disposition of Work 480. No worker or documentation task
   can infer **DONE**.

## Honest verification statement

No test suite was run for this Tier-0 documentation task. The integration-test source named by
the task was outside the canonical read scope for this worker; therefore this cut adds no claims
beyond the wiring/integration behaviors already recorded in the authorized POMR15 result
evidence. The declared documentation diff check is the only check run here. **LOCAL_VERIFIED**,
real-binary/live-apply, archive, and XVerify are separate classes and must remain separate.

---

# Final verification-class ledger — POMR18

**Supersedes:** POMR16's pending live-binary, durable-receipt and archive classes
**LOCAL_VERIFIED:** `PASS`
**Different-provider XVerify:** `HOLD / NO SEAL`
**Owner Closure:** `OPEN`

| Verification class | Final disk-backed result |
|---|---|
| Real compiled binary | Final `build:all` passed with no active sprint; subsequent CLI status emitted no binary-identity warning. |
| Live adoption apply | 43 legacy + 946 run-owned = 989 rows; exact plan `a9b04fba…3aeb`; apply returned `persisted`. |
| Durable receipt | `sha256:5b4c3e75abb9d43a5f5e3d8490592100fbfbf761165ac5d53037f2bc0a8eb847`; 1,184 bytes, mode `0600`; private parents `0700`. |
| Fresh replay | A separate CLI process returned `replay` with the same receipt and plan binding. |
| Database mutation | `none`; source/target main, WAL and SHM sizes/digests were unchanged. |
| Host policy | Existing owner-controlled `0755 .deckent` accepted; group-writable `0775` rejected; private receipt subtree unchanged. |
| Sprint archive | 1558 `COMPLETE`, 294 artifacts, 13,046,491 bytes, digest `f2794adf…af5a`; integrity clean. |
| Repository archive | 673 manifests; 29,980 file digests checked; zero missing/mismatch/untracked/invalid digest. |
| Scoped tests | 24 files; 315 passed; 4 intentional skips. TypeScript and diff-check passed. |
| Managed reconnect | Bot PID 2600909 is a live compiled `bot listen` process; CLI status green. |
| Independent XVerify | Fresh attempt `xv-1787424099968-0af2990c-3229-4c5a-b875-7aea0f414f02` returned typed `HOLD / unavailable`: `claude-opus-5` is registry tier `premium`, below the truthful `gpt-5.6-sol` author tier `premium_plus`; the provider evidence source also reported `limit_hold`. No verifier execution, verdict, settlement or seal was produced. |
| Canonical disposition | Work 480 remains `OPEN` until authenticated owner Closure append. |

No worker verdict, documentation statement, archive manifest or live receipt is promoted into the
missing independent-provider seal or owner disposition.

The author model was not downgraded to manufacture eligibility, and same-provider verification was
not substituted. The next XVerify attempt requires a reachable different-provider model at
`premium_plus` or above.
