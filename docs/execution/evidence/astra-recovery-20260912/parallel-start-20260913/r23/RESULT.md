# R23 — Aborted partial-effect retention through the production recovery surface

MASTER3178 / parent120 OPEN. Owner-admitted ADR-D-007 recovery; no commit/push, auth changes or worker result acceptance.

## Actual result

2026-09-14T15:01:50.847656Z → 15:02:15.112797Z: main compiled `recover sprint-762 --retain-aborted-partial <exact dispatch> --effect-transaction <exact digest> --force --json` exited 0. Wrapper monotonic duration 25.296821s. `main-retain.json` preserves the complete argv and timing; `main-retain.stdout` is the product result.

Task 762-002, attempt b5c1c5f2-b364-83e5-8f20-dfa802b5939e, generation1 is retained with immutable receipt `sha256:45c117967076d54052a172ed45ae0d774ca48b0287c2b4b25ac4f36d19751e66` and evidence `sha256:7b684a0287fa2e84fa3c53d82ed70fd726af52915e34a4d8497897999ab6c493`. Transaction `sha256:c20efb30993a836f2ac1cf3d8509bf74129540105b83275e471b6a5a6185a94f` remains aborted after two directory operations; its third file write is absent. No successful worker output or sprint COMPLETE is claimed.

## Production chain

- CLI option and validation: src/cli/commands/recover.ts:188,204. En/tr labels use the existing messages system.
- Application service: src/orchestra/sprint-recovery-operation.ts:625. Exact identity, owner authorization, inactive execution and fresh coordinator fencing precede retention; generic cleanup is not used.
- Recovery implementation: src/orchestra/spawn-backend-docker.ts:17923. Project maintenance lease, stopped Docker identity/resource checks, repeated native proof and final authority check precede immutable publication.
- Canonical evidence: src/orchestra/spawn-backend-docker.ts:18557 and src/core/file-lock.ts:6730 bind the partial journal to the recovered lock audit and ABORTED terminal receipt.
- Store: src/core/task-attempt-custody-store.ts:8186,8232,8276 preserves exact artifacts and rejects conflicting dispositions/resurrection.
- Consumers: src/orchestra/spawn-backend-docker.ts:17762,19875 recognize the disposition in planning health and actual startup recovery.

The supported retention shape is explicitly restricted to empty derived directories with exact native identity/mode/parent, and absent unapplied file targets. Other partial effects remain HOLD. No automatic rollback or general arbitrary partial-file recovery is claimed. Historical reads revalidate immutable provenance; publication-time native evidence is retained so future legitimate writes do not retroactively invalidate it.

## Verification

- Final scoped suite: 275/275, exit0 (177 custody +25 recovery service +73 lock); tests.log.
- TypeScript: exit0, tsc.log. Initial union-narrowing failure exit2 is retained in tsc-first.log; fixed before landing.
- Isolated build exit0; actual isolated CLI dry-run eligible, exit0, 11.725s. Documented cross-checkout override was diagnostic/read-only only.
- Wrong transaction: exit1. Conflicting retention modes: exit1. These refusals did not mutate state.
- Main build:all exit0, 32.544s; main-build.json. Binary authority exit0, matching-build-identity; binary-identity.json.
- Actual main CLI mutation exit0; durable reread performed by the production implementation.

The unmodified production full-history health inspection is recorded separately. Do not infer its result from the narrow mutation result. Formal cross-provider XVerify and a fresh max4 dogfood lifecycle remain outstanding; LOCAL_VERIFIED is not product DONE.

## Remaining work

Finish the default planning-health inspection. If ready and inactive, return to the owner-admitted real start/max4 canary with useful disjoint analysis outputs and initially absent shared ancestors. Record admission, Docker, provider start/output, task landing and sprint settlement separately. The per-admission snapshot latency experiment is not production-enabled; no history is skipped. Cursor custody remains excluded.

## Final default production health

Unmodified compiled inspection exited0: health READY, unresolved[], maintenance absent, canonical762 ABORTED/inactive/coordinator absent, receipt consistent. Recovery-list receipt sha256:54f124e0a438036b07d2b7888f040665990db43f2e41c2607cf45a0f03c02235. Health timer346925ms; full wrapper monotonic359.210s. UTC start15:02:19.847700Z/end15:08:07.821363Z; wall and monotonic deltas differ, both retained without normalization. Process ending RSS3939803136B (not peak or total host usage). This confirms the former762 blocker is cleared; performance is still OPEN.
