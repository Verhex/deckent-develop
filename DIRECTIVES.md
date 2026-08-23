# DIRECTIVES — RUNTIME-HYGIENE-001 / SPRINT-623

## Outcome

Restore canonical ordinal sprint allocation after legacy detached-job identities polluted the
archive namespace, then implement and prove a lossless, policy-driven hygiene pipeline for
`.deckent/recently-works/` and `.deckent/runtime/`. The pipeline reconciles raw evidence into
canonical archives, preserves byte conflicts, refuses live/ambiguous authority, publishes a
durable cleanup receipt, and retires only independently verified source copies. XVerify is owner-
deferred until 2026-08-24 20:00 Europe/Istanbul; this sprint may become LOCAL_VERIFIED but cannot
claim final DONE/Closure before that boundary.

## Invariants

- Never delete or mutate `.brain/memory.db`, provider auth, credentials, runtime tokens, live
  SQLite/WAL/SHM authorities, active/resumable runs, unresolved approvals, or foreign task state.
- Do not use `rm .tasks/*`, kill a live sprint, run repository-global TypeScript inside a worker,
  commit, push, mutate Closure dispositions, or invoke XVerify in this sprint.
- Historical epoch-shaped sprint IDs remain immutable evidence. They are excluded only from
  ordinal allocation. Next canonical identity is `sprint-623`; detached work uses `job-*`.
- Every retired byte is exact-digest duplicated by canonical authority or published to a content-
  addressed archive first. Conflicts are preserved; ambiguity is typed HOLD.
- Read/plan/dry-run is zero-write. Apply is no-active-run guarded, first-writer-wins, restart-safe,
  idempotent, tenant/project scoped, cross-platform, and emits one bounded durable receipt.
- Each observed runtime family resolves to preserve, archive-then-retire, duplicate-retire,
  ephemeral-retire, or HOLD. Unknown never defaults to delete.

## Task 1: RH01-ID-INVENTORY Sprint identity root-cause evidence

Files: docs/evidence/runtime-hygiene-2026-08-23/01-sprint-identity-inventory.md
Reads: src/core/utils.ts, src/mcp/tools/start.ts, .deckent/config.json
Implement: Record the disk-proven 622 ordinal floor, legacy epoch family, polluted config, detached
job namespace collision, recovery scope and exact preserved history. No runtime mutation.
Test: `git diff --check -- docs/evidence/runtime-hygiene-2026-08-23/01-sprint-identity-inventory.md`
GO: Evidence distinguishes sprint, run and job identities and names the causal producer/consumer.
NO_GO: Timestamp history is rewritten, deleted, or represented as a canonical ordinal.

## Task 2: RH02-ORDINAL-AUTHORITY Ordinal allocation regression closure

Files: src/core/utils.ts, tests/core/utils-sprint-id.test.ts
Reads: .deckent/archive/sprints/, .deckent/config.json
Implement: Review semantic legacy-epoch exclusion, strict ordinal config writes, archive/config floor
merging and large-installation safety. Preserve every historical directory.
Test: `npx vitest run tests/core/utils-sprint-id.test.ts tests/core/utils-debug.test.ts tests/core/readjson-migration.test.ts`
GO: A polluted timestamp archive plus sprint-622 deterministically allocates sprint-623.
NO_GO: Digit-count cap, backward reuse, timestamp deletion, silent invalid config write.

## Task 3: RH03-JOB-NAMESPACE Detached job identity separation

Dependencies: RH02-ORDINAL-AUTHORITY
Files: src/core/execution-job-identity.ts, src/mcp/tools/job-runner.ts, src/mcp/tools/start.ts, src/orchestra/sprint-runner-entry.ts, tests/mcp/job-runner.test.ts, tests/mcp/tools/start-detached-fork.integration.test.ts
Implement: Complete `job-<timestamp>-<uuid>` wiring, mixed legacy/current latest-job ordering,
exact startedAt fork lineage and collision proof. Job IDs never enter sprint allocation.
Test: `npx vitest run tests/mcp/job-runner.test.ts tests/mcp/tools/start-detached-fork.integration.test.ts tests/mcp/start-lifecycle.test.ts tests/mcp/tools/start.test.ts`
GO: Real handler creates unique job namespace and child preserves parent admission time.
NO_GO: `sprint-${Date.now()}` remains reachable or new IDs break mixed-history readers.

## Task 4: RH04-CONTRACT Runtime hygiene policy contract

Dependencies: RH01-ID-INVENTORY
Files: docs/evidence/runtime-hygiene-2026-08-23/02-runtime-hygiene-contract.md
Reads: src/core/constants.ts, src/core/sprint-archive.ts, src/cli/commands/cleanup.ts
Implement: Define family ownership, live-authority guards, retention dimensions, archive targets,
conflict semantics, dry-run/apply behavior, receipts and platform adapter guarantees.
Test: `git diff --check -- docs/evidence/runtime-hygiene-2026-08-23/02-runtime-hygiene-contract.md`
GO: Every observed top-level runtime/recent family has one explicit disposition and authority.
NO_GO: Unknown or credential/database family can fall through to deletion.

## Task 5: RH05-CONFIG Config-resolved retention policy

Dependencies: RH04-CONTRACT
Files: src/core/config-types.ts, src/core/config.ts, tests/core/config.test.ts, tests/core/config-edge.test.ts
Implement: Add validated `runtime_artifact_retention` policy with bounded per-family age/count/size,
archive path, enabled/apply-on-finalize controls and safe defaults. Preserve old configs.
Test: `npx vitest run tests/core/config.test.ts tests/core/config-edge.test.ts`
GO: Defaults and project overrides survive loadConfig; invalid values reject fail-closed.
NO_GO: Hidden constants, unbounded values, default deletion, or declared-but-unwired config.

## Task 6: RH06-MAINTENANCE-ARCHIVE Generic content-addressed archive authority

Dependencies: RH04-CONTRACT
Files: src/core/maintenance-archive.ts, tests/core/maintenance-archive.test.ts
Implement: Create project-relative content-addressed storage for non-sprint operational evidence
with mode-safe publication, manifest digest, source lineage, conflict preservation, exact replay,
fresh-read verification and no mutable latest pointer.
Test: `npx vitest run tests/core/maintenance-archive.test.ts`
GO: Concurrent identical publish deduplicates; differing bytes coexist; restart verifies manifest.
NO_GO: Overwrite, path escape, symlink follow, absolute path leak, or unverified source retirement.

## Task 7: RH07-CLASSIFIER Fail-closed artifact classification

Dependencies: RH04-CONTRACT
Files: src/core/runtime-artifact-classifier.ts, tests/core/runtime-artifact-classifier.test.ts
Implement: Classify every inventoried recently-works/runtime family into preserve, archive-then-
retire, duplicate-retire, ephemeral-retire or HOLD using content/owner/liveness evidence.
Test: `npx vitest run tests/core/runtime-artifact-classifier.test.ts`
GO: DB/WAL/SHM/token/current status/unknown inputs preserve or HOLD; no catch-all delete.
NO_GO: Filename-only unsafe deletion, secret inspection/output, or missing tenant/project boundary.

## Task 8: RH08-RECENTLY-WORKS Lossless recent-work retirement planner

Dependencies: RH06-MAINTENANCE-ARCHIVE, RH07-CLASSIFIER
Files: src/core/recent-work-retention.ts, tests/core/recent-work-retention.test.ts
Implement: Plan/apply sprint-owned reconcile, exact canonical duplicate retirement, phase5 staging
dedup and sprint-479 recovery-not-dispatched archival. Nested/unknown content HOLDs.
Test: `npx vitest run tests/core/recent-work-retention.test.ts tests/core/sprint-archive.test.ts`
GO: Named live examples retire only after digest/manifest proof; conflicts remain byte-preserved.
NO_GO: Deletion before publish, sprint-610/611 ownership confusion, or directory-wide rm.

## Task 9: RH09-JOBS Terminal job retention

Dependencies: RH05-CONFIG, RH06-MAINTENANCE-ARCHIVE, RH07-CLASSIFIER
Files: src/core/runtime-job-retention.ts, tests/core/runtime-job-retention.test.ts
Implement: Retain active/recent job views; archive terminal/stale-dead records by real sprint or
generic job identity; support legacy/current namespaces and preserve resumable continuity.
Test: `npx vitest run tests/core/runtime-job-retention.test.ts tests/mcp/job-runner.test.ts`
GO: Terminal old records archive then retire; RUNNING with live/unknown ownership never deletes.
NO_GO: Status string alone authorizes deletion or latest-job/session reader loses continuity.

## Task 10: RH10-EVALUATIONS Evaluation audit retention

Dependencies: RH05-CONFIG, RH07-CLASSIFIER
Files: src/core/runtime-evaluation-retention.ts, tests/core/runtime-evaluation-retention.test.ts
Implement: Reconcile sprint-owned evaluation trees into canonical manifests, keep current window,
preserve malformed/conflicting attempts and retire only manifest-verified duplicates.
Test: `npx vitest run tests/core/runtime-evaluation-retention.test.ts tests/core/sprint-archive.test.ts`
GO: Nested evaluation artifacts retire losslessly with family counts/digests intact.
NO_GO: Recursive delete before archive verify or cross-sprint ownership leakage.

## Task 11: RH11-RUN-FLOWS Run-flow journal retention

Dependencies: RH05-CONFIG, RH06-MAINTENANCE-ARCHIVE, RH07-CLASSIFIER
Files: src/core/run-flow-retention.ts, tests/core/run-flow-retention.test.ts
Implement: Fresh-read flow journals; preserve proposed/approved/running/resumable authority; archive
terminal and liveness-proven stale-dead flows with revision/digest lineage and idempotent retirement.
Test: `npx vitest run tests/core/run-flow-retention.test.ts tests/core/run-flow-store.test.ts`
GO: Terminal flow history survives canonical archive while live/ambiguous flows remain untouched.
NO_GO: Age/status-only delete, lost revision, split-brain latest pointer, or malformed fail-open.

## Task 12: RH12-LOGS One-off log and transient residue policy

Dependencies: RH05-CONFIG, RH06-MAINTENANCE-ARCHIVE, RH07-CLASSIFIER
Files: src/core/runtime-log-retention.ts, tests/core/runtime-log-retention.test.ts
Implement: Handle named start logs, bot logs, prompt-lint/resource JSONL and temp residues. Empty
expired logs may retire with receipt; non-empty logs rotate/archive; current writers preserve.
Test: `npx vitest run tests/core/runtime-log-retention.test.ts tests/core/observability-rotation.test.ts`
GO: Four named zero-byte start logs retire only in apply; live logs/databases/tokens survive.
NO_GO: Truncating active writer, deleting credential/state, or read-mode mutation.

## Task 13: RH13-ORCHESTRATOR Unified plan/apply and durable receipt

Dependencies: RH08-RECENTLY-WORKS, RH09-JOBS, RH10-EVALUATIONS, RH11-RUN-FLOWS, RH12-LOGS
Files: src/core/runtime-hygiene.ts, tests/core/runtime-hygiene.test.ts
Implement: Compose inventory→plan→fresh authority check→archive/verify→retire→receipt. Add bounded
work, per-family counters/bytes, deterministic plan digest, FWW receipt and restart idempotency.
Test: `npx vitest run tests/core/runtime-hygiene.test.ts`
GO: 10k synthetic inventory bounded; second apply is byte-stable; injected fault loses none.
NO_GO: Partial success hidden, missing receipt, unbounded scan, or current-run mutation.

## Task 14: RH14-I18N Complete EN/TR operator vocabulary

Dependencies: RH13-ORCHESTRATOR
Files: src/cli/helpers/messages.ts, tests/cli/runtime-hygiene-messages.test.ts
Reads: src/core/runtime-hygiene.ts
Implement: Add EN/TR keys for inventory, plan, preserve, archive, retire, HOLD, receipt and summary;
keep core string-free and placeholder parity exact.
Test: `npx vitest run tests/cli/runtime-hygiene-messages.test.ts`
GO: Every user-visible state resolves directly in both locales with safe placeholders.
NO_GO: Hardcoded CLI prose, fallback-hidden gap, raw path/identity/secret placeholder.

## Task 15: RH15-CLI Production cleanup surface wiring

Dependencies: RH13-ORCHESTRATOR, RH14-I18N
Files: src/cli/commands/cleanup.ts, tests/cli/runtime-hygiene-cleanup.test.ts
Reads: dist/cli/entry.js
Implement: Add explicit history/runtime hygiene options with dry-run default, separate apply flag,
JSON projection, exact plan-digest CAS and no-active authority guard. Preserve legacy cleanup.
Test: `npx vitest run tests/cli/runtime-hygiene-cleanup.test.ts tests/cli/cleanup-log-archive.test.ts`
Smoke: `node dist/cli/entry.js cleanup --history --dry-run --json` emits one plan and writes zero bytes.
GO: Registered CLI calls canonical service; apply requires matching digest and terminal authority.
NO_GO: Default destructive behavior, MCP mutation, source-only wiring, or legacy regression.

## Task 16: RH16-FINALIZER Automatic bounded hygiene wiring

Dependencies: RH05-CONFIG, RH13-ORCHESTRATOR
Files: src/orchestra/sprint-finalizer.ts, tests/orchestra/runtime-hygiene-finalizer.test.ts
Implement: After terminal receipt/archive verification, optionally run bounded hygiene from resolved
config. Never run while active, never mask finalizer failure, and surface typed hygiene HOLD evidence.
Test: `npx vitest run tests/orchestra/runtime-hygiene-finalizer.test.ts tests/orchestra/sprint-finalizer.test.ts`
GO: Future finalizers retain configured windows and never write legacy raw archive paths.
NO_GO: Pre-terminal cleanup, hidden failure, default-on destructive behavior, or config drop.

## Task 17: RH17-ADVERSARIAL Filesystem and liveness assurance

Dependencies: RH13-ORCHESTRATOR
Files: tests/core/runtime-hygiene-adversarial.test.ts
Reads: src/core/runtime-hygiene.ts, src/core/maintenance-archive.ts
Implement: Test symlink/hardlink escape, path swap, concurrent writer, malformed JSON, permission
fault, plan tamper, archive conflict, PID recycle, foreign tenant and interrupted apply.
Test: `npx vitest run tests/core/runtime-hygiene-adversarial.test.ts`
GO: Every ambiguity HOLDs with original bytes intact and no out-of-root access.
NO_GO: TOCTOU delete, cross-tenant discovery, overwrite, mock-only filesystem proof.

## Task 18: RH18-REAL-BINARY Compiled dry-run/apply/restart lifecycle

Dependencies: RH15-CLI, RH17-ADVERSARIAL
Files: tests/cli/runtime-hygiene.integration.test.ts
Reads: dist/cli/entry.js
Implement: In tmpdir, execute real compiled CLI inventory→dry-run→apply→fresh-process replay with
duplicate, conflict, active, DB/token and named staging fixtures. Assert exact tree before/after.
Test: `npx vitest run tests/cli/runtime-hygiene.integration.test.ts --pool=threads`
GO: Compiled binary proves lossless retirement and zero-write reads across process restart.
NO_GO: Source-only runner, synthesized receipt, live project mutation, or skipped compiled proof.

## Task 19: RH19-OPERATOR-DOC Product/operator documentation

Dependencies: RH15-CLI, RH16-FINALIZER
Files: docs/en/reference/runtime-hygiene.md, docs/tr/reference/runtime-hygiene.md
Reads: docs/evidence/runtime-hygiene-2026-08-23/02-runtime-hygiene-contract.md
Implement: Document family lifecycle, defaults, dry-run/apply, receipts, recovery, Windows/macOS/Linux
semantics and explicit preserved authorities in EN/TR parity.
Test: `npm run lint:link`
GO: Operators can predict exactly what is kept, archived, retired or held.
NO_GO: Undocumented destructive default, unsupported platform claim, locale drift.

## Task 20: RH20-LOCAL-CLOSURE Ordered verification and live-apply readiness

Dependencies: RH01-ID-INVENTORY, RH02-ORDINAL-AUTHORITY, RH03-JOB-NAMESPACE, RH18-REAL-BINARY, RH19-OPERATOR-DOC
Files: docs/evidence/runtime-hygiene-2026-08-23/20-local-closure.md
Reads: docs/evidence/runtime-hygiene-2026-08-23/01-sprint-identity-inventory.md, docs/evidence/runtime-hygiene-2026-08-23/02-runtime-hygiene-contract.md
Implement: Reconcile code/config/CLI/finalizer/tests and record exact Brain gates: wave tsc, scoped
battery, build/restart, live dry-run, owner-authorized apply, post-apply archive verify, disk delta and
scheduled 2026-08-24 20:00 different-provider XVerify HOLD.
Test: `git diff --check -- docs/evidence/runtime-hygiene-2026-08-23/20-local-closure.md`
GO: Package is honestly LOCAL_VERIFIED-ready with no unsupported DONE or hidden owner action.
NO_GO: Premature XVerify/Closure claim, missing live-apply checklist, or lost artifact.
