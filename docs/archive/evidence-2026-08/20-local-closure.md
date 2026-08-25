# Runtime hygiene local closure

**Evidence date:** 2026-08-23
**Outcome:** `LOCAL_VERIFIED / FINAL-CLOSURE-HOLD`

This package separates ordinal sprint identity from detached execution jobs and adds a bounded,
lossless runtime-hygiene pipeline. It is locally implemented and compiled-binary verified. It is
not final Closure/DONE: different-provider XVerify remains owner-deferred until
2026-08-24 20:00 Europe/Istanbul, and no destructive apply was performed against this repository.

## Reconciled production chain

1. `src/core/utils.ts` excludes the bounded legacy epoch family from ordinal allocation and keeps
   config writes strictly non-regressive. Historical timestamp evidence remains unchanged.
2. `src/core/execution-job-identity.ts` mints `job-<timestamp>-<uuid>` identities. MCP detached
   start, job state, IPC, child config, and runner entry carry this job identity without advancing
   the sprint ordinal.
3. Resolved `runtime_artifact_retention` policy is default-off and validates bounded age, count,
   size, archive path, enablement, and finalizer apply controls.
4. Content-addressed maintenance publication provides non-clobbering SHA-256 objects, immutable
   manifests, mode-safe replay, source lineage, deduplication, and fail-closed path handling.
5. Family owners cover exact recent-work compatibility files, terminal/inactive jobs, exact-sprint
   evaluations, RunFlow journal projections, and recognized logs/residue. Unknown, foreign,
   current, resumable, non-regular, database, token, and credential state never falls through to
   retirement.
6. `src/core/runtime-hygiene.ts` performs one bounded inventory, deterministic plan/digest,
   fresh-source checks, family-isolated apply, per-family outcomes, and immutable FWW receipt
   publication. A fresh process now replays the durable receipt directly; it does not rebuild a
   digest from a tree already mutated by the first apply.
7. `deckent cleanup --history` is read-only by default. Apply requires an exact digest and terminal
   authority. JSON output is path-free. Legacy cleanup remains a separate surface.
8. Finalizer wiring is doubly opt-in, runs only after terminal receipt plus archive verification,
   and exposes partial/failure outcomes as typed HOLD instead of masking them.

## RH18 compiled proof

The first worker attempts correctly reported NO_GO: first the compiled CLI was stale, then the
fixture used paths which were not eligible production families. The recovery did not weaken the
assertions. The fixture now uses:

- exact `sprint-479-recovery-not-dispatched.json` reconciliation with a byte conflict;
- exact-sprint evaluation retirement plus a preserved conflicting attempt;
- canonical SQLite-backed terminal RunFlow events;
- two identical old bot logs proving content-addressed deduplication;
- a fresh log, active task evidence, `.brain/memory.db`, auth token, and named interrupted staging
  artifact which must survive.

`npx vitest run tests/cli/runtime-hygiene.integration.test.ts` passed `1/1`. Four fresh compiled
CLI processes proved plan, explicit dry-run, digest-gated apply, and receipt replay. Plan/dry-run
left the complete fixture tree byte-identical; apply retired only eligible sources; every conflict
and protected byte survived; replay performed no second mutation.

## Ordered local gates

| Gate | Result |
|---|---|
| Wave TypeScript | `npx tsc --noEmit` passed. |
| Scoped product battery | 27 files produced 654 passes and one intentional skip. The sole failed file was invoked with an incompatible global `--pool=threads`; its 14 cases failed before test logic because Vitest workers forbid `process.chdir()`. Re-running that file with its declared/default pool passed `14/14`. Net unique scoped result: **668 passed, 1 skipped**. |
| Security/replay slice | Runtime-hygiene core, adversarial, CLI, and message tests passed `46/46`; compiled proof passed separately. |
| Build | Paused-run ADR-D-007 recovery used `npx tsc && node scripts/copy-assets.mjs && npm run build:dashboard`; 113 assets copied and 2,291 dashboard modules built. Normal clean was correctly held by retained 623/624/625 task authority. |
| Long-lived runtime | Bot was restarted from rebuilt `dist`; PID `2840753` was confirmed with `kill -0`, exact `ps`, and `deckent bot status`. |
| Live read-only preview | `deckent cleanup --history --json` emitted digest `51d6d949a73a9ad0eb5109cdf8286863b99fdd8a5ba6e03c20d0b88f89964cd6`: 3,434 inventoried artifacts / 49,268,937 bytes and 167 candidates / 23,951,284 bytes. No apply followed. |
| Documentation parity | EN/TR operator references were reconciled to the actual named recent-work, job, evaluation, RunFlow, log, receipt-replay, and resolved-default semantics. |

## Apply and post-apply checklist

No repository apply was executed. At measurement time the run was `PAUSED`, so the authority gate
would reject mutation; resolved config also has both runtime-retention switches disabled. This is
intentional evidence, not a hidden owner action.

The next staged repository-hygiene operation must:

1. begin only from terminal/idle canonical authority with no live coordinator or writer;
2. regenerate and review a fresh path-free plan and exact digest;
3. explicitly classify the currently held nested directories, including
   `.deckent/recently-works/phase5-batch-staging-2026-08-17` and
   `.deckent/recently-works/recovery-not-dispatched`; the current policy correctly HOLDs them and
   does not recursively delete them;
4. reconcile retained 623/624 PLAN-attempt and 625 run artifacts through canonical sprint archive
   authority; never use `rm .tasks/*`;
5. apply only the approved exact digest;
6. verify the FWW runtime-hygiene receipt plus every referenced sprint/maintenance manifest;
7. compare pre/post inventory, byte totals, conflicts, `.brain/memory.db`, databases, tokens,
   credentials, active evidence, and git delta; and
8. stop on any partial outcome or unknown family.

## Remaining HOLDs

- Different-provider XVerify is scheduled for **2026-08-24 20:00 Europe/Istanbul**. Until its
  verdict, provider usage, terminal settlement, and durable cross-verify receipt exist, this
  package cannot claim final DONE/Closure.
- The host-only manual `deckent spawn --force` redrive was blocked before provider work because
  the Codex adapter did not declare measured-stream budget support on that surface. Sprint-time
  execution has final-only containment, but manual-spawn parity remains a separately admissible
  finding; no provider call or fake result was produced.
- The real nested recent-work examples and the larger `.deckent/runtime` inventory have not been
  destructively cleaned. They belong to the next owner-staged repository organization pass.
- Sprint 623/624 forensic task artifacts remain intact. No manual task deletion or live cleanup
  occurred.
