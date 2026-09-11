# RECOVERY-BORN-714-EXACT-DISPATCH-AND-TERMINAL-TRUTH-001 — IN_PROGRESS

OUTCOME_ID: RECOVERY-BORN-714-EXACT-DISPATCH-AND-TERMINAL-TRUTH-001
DOGFOOD_MODE: ON
DOGFOOD_HEALTH: DEGRADED
RECOVERY_SEAM: ADR-D-007
BASE_SHA: 68f3d66862d94ffce9f1b63bad47708824b54dc5
BRANCH: main
WORKSPACE_MODE: MAIN
PARENT_MASTER_ID: RECOVERY-DOGFOOD-BORN-001
MASTER_ID: 3357
TRIGGER_RUN: sprint-714 / flow a36f802e-3239-4ae6-ad8a-bbd788b21f82
OWNER_DECISION_REF: owner-live-2026-09-04-sprint-714-correct-scope-and-fix-approved
STATUS: IN_PROGRESS — Sprint 724 real worker/main effect/accepted/T11/outer settlement COMPLETE, archive applied and CLI parity verified; package hermetic gate, multiworker orchestration, observability and scale closure remain HOLD; not product completion

### Sprint-715 exact zero-work settlement supplement

The owner-approved main-only smoke reached `sprint-715 / 715-001`, but all three exact Docker
generations settled before provider work as `PRE_MOUNT_ABORTED`. The ordinal-2
`NOT_DISPATCHED_REDISPATCH` terminal was not projected into the durable repair queue, the postfix
scanner spent an unauthorized third dispatch generation despite the one-round marker, and the
detached start adapter converted the resulting `DRAIN_REQUIRED` return into false `RUN_COMPLETED`.
This is one directly blocking continuation of MASTER 3357, not feature scope.

```json
{
  "schemaVersion": 1,
  "receiptId": "GR-2026-09-04-714-ZERO-WORK-SETTLEMENT-SUPP-17",
  "outcomeId": "RECOVERY-BORN-714-EXACT-DISPATCH-AND-TERMINAL-TRUTH-001",
  "state": "CONSUMED",
  "admittedAt": "2026-09-04T21:41:00+03:00",
  "consumedAt": "2026-09-04T21:41:00+03:00",
  "baseSha": "ff2e47564232d05656b8645f4c3fd3449b322dc9",
  "branch": "main",
  "policyDigest": "sha256:2be31cc86ae76a33b6ea8283c1eeff331b71e9fe46f5802c7cb4bbf4daa9aa3a",
  "baselineScopeDigest": "sha256:ce933c373ce9e86325babf84fceb7e9d4933b2370cd7a459969118b686c39d68",
  "scopeCount": 10,
  "scopeDigestAlgorithm": "sha256(JSON.stringify(path-sorted [{path,digest}]))",
  "authorityRef": "owner-live-2026-09-04-main-only-drive-to-result",
  "recoverySeam": "ADR-D-007"
}
```

Exact supplemental scope:

- `src/cli/commands/start.ts`
- `src/orchestra/spawn-backend-docker.ts`
- `src/orchestra/sprint-controller.ts`
- `src/orchestra/sprint-phases.ts`
- `src/orchestra/sprint-spawner.ts`
- `tests/cli/start-snapshot-branch.test.ts`
- `tests/orchestra/moat3-fixphase.test.ts`
- `tests/orchestra/repair-quiescence-gate.test.ts`
- `tests/orchestra/scheduler-effective-dependencies.test.ts`
- `tests/orchestra/spawn-backend-docker-mounts.test.ts`

The supplement may settle a repair record only from exact registry zero-provider-work terminal
authority, may prevent every generic respawn path from exceeding the durable one-round marker,
must make an undrained repair queue non-success at the detached Flow boundary, and may publish only
a typed, secret-free PRE_MOUNT stage/reason. It cannot fabricate worker work, weaken custody,
rewrite provider output, mutate `.brain/memory.db`, or authorize another planner invocation.

## Typed incident and exact boundary

The first post-3333 dogfood run stopped before provider work with
`Normal Docker IPC HOLD: PRIVATE_IPC_AUTHORITY_UNAVAILABLE`. Disk evidence proves two coupled
recovery defects:

1. Normal Docker registered exact-task custody but did not expose its Store-backed exact-attempt
   IPC authority through backend → execution registry → collector.
2. A terminal detached-child failure retained dead coordinator PID/lock state, while the native
   Terminal trusted the stale read-model and continued to render `Çalışıyor · SPAWN`.

The pre-dispatch inventory also found one real cross-platform repository collision:
`.github/PULL_REQUEST_TEMPLATE.md` and `.github/pull_request_template.md`. The richer uppercase
template is canonical; the obsolete lowercase duplicate is retired. Inventory subtracts tracked
worktree deletions so the approved repair is retryable before a later owner-authorized commit.

This package does not implement any 7099 L1–L6 or 7101–7104 Terminal feature. It restores the
execution substrate and honest terminal truth needed for those outcomes to run through dogfood.

## Admission receipt

```json
{
  "schemaVersion": 1,
  "receiptId": "GR-2026-09-04-714-EXACT-DISPATCH-01",
  "outcomeId": "RECOVERY-BORN-714-EXACT-DISPATCH-AND-TERMINAL-TRUTH-001",
  "state": "CONSUMED",
  "admittedAt": "2026-09-04T12:08:06+03:00",
  "consumedAt": "2026-09-04T12:08:07+03:00",
  "baseSha": "68f3d66862d94ffce9f1b63bad47708824b54dc5",
  "branch": "main",
  "policyDigest": "sha256:c4c96a971833ee892174b7d361e08c7f0eb53c629873381235deaa573594d863",
  "baselineScopeDigest": "sha256:1d0c306d2b87226d93b3acd0a26dfea3f8b35ceffa0301455e6a38cdec9df1fe",
  "scopeDigestAlgorithm": "sha256(JSON.stringify(path-sorted [{path,digest}])); digest=null means absent at BASE_SHA",
  "authorityRef": "owner-live-2026-09-04-sprint-714-correct-scope-and-fix-approved",
  "recoverySeam": "ADR-D-007"
}
```

Admission was reconstructed from immutable `BASE_SHA` objects after the live incident diagnosis;
it does not digest authored/model output and it grants no authority outside the following exact
scope.

## Exact executable scope

- `.github/pull_request_template.md` (delete obsolete portable-collision peer)
- `src/cli/commands/start.ts`
- `src/cli/helpers/live-footer.ts`
- `src/cli/helpers/messages.ts`
- `src/cli/helpers/run-state-feed.ts`
- `src/cli/repl/run.tsx`
- `src/core/run-jobs-read.ts`
- `src/core/run-status-authority.ts`
- `src/core/task-attempt-custody-store.ts`
- `src/orchestra/ipc-registry.ts`
- `src/orchestra/scheduler-effects.ts`
- `src/orchestra/spawn-backend-docker.ts`
- `src/orchestra/spawn-backend.ts`
- `src/orchestra/spawn-failure-authority.ts`
- `src/orchestra/sprint-controller.ts`
- `src/orchestra/sprint-pid-manager.ts`
- `tests/cli/live-footer.test.ts`
- `tests/cli/repl/live-footer-labels.test.ts`
- `tests/cli/run-state-feed.test.ts`
- `tests/cli/start-snapshot-branch.test.ts`
- `tests/core/run-status-authority.test.ts`
- `tests/core/task-attempt-custody-store.test.ts`
- `tests/helpers/task-result-settlement-v2-fixture.ts`
- `tests/orchestra/ipc-registry.test.ts`
- `tests/orchestra/scheduler-spawn-executor.test.ts`
- `tests/orchestra/spawn-backend-docker-ipc-authority.test.ts` (new)
- `tests/orchestra/spawn-backend-docker-mounts.test.ts`
- `tests/orchestra/spawn-failure-authority.test.ts`

This capsule is the governance record and is not included in the executable-scope digest.

Supplementary gate scope: `GR-2026-09-04-714-EXACT-DISPATCH-SUPP-01` binds only
`scripts/lint-test-hermeticity.mjs` at BASE_SHA digest
`sha256:ae0bd52f4537dba5c79702d7530d5e77508cc113e556771b17504552153d41de` for a
mechanical digest-only ratchet after measurement proved zero new unresolved effects and unchanged
production inventory count. It cannot change classifications, allowlists or counts.

### Blocking image-authority supplement

The first disposable-project real Docker canary (`flow 9f64084a-58dc-469f-8a79-f630735b1541`,
`sprint-002`) proved that the original IPC failure no longer occurs, then settled zero provider
work as `PRE_MOUNT_ABORTED` and terminally failed with
`DECKENT_E091:spawn-backend-recovery-hold`. The Store receipt proves daemon, mount and provider
effects were all absent. Replaying the exact native preflight against image digest
`sha256:4420b2074e792255d676e9f1823300cdc3e2d2cbc3816348c835d00ab05f9196` exposed the direct cause:
the production worker image does not contain the exact backend's required
`/app/dist/core/exec-authority-native.js` runtime (`ERR_MODULE_NOT_FOUND`). The Dockerfiles and
canonical image builder therefore cannot currently satisfy the exact backend contract they feed.

Owner decision `owner-live-2026-09-04-sprint-714-correct-scope-and-fix-approved` admits the same
bounded recovery package to close this directly blocking producer/consumer gap. Receipt
`GR-2026-09-04-714-IMAGE-AUTHORITY-SUPP-02` is bound to:

- `baseSha`: `68f3d66862d94ffce9f1b63bad47708824b54dc5`
- `branch`: `main`
- `policyScopeDigest`: `sha256:2be31cc86ae76a33b6ea8283c1eeff331b71e9fe46f5802c7cb4bbf4daa9aa3`
  (`sha256(JSON.stringify(path-sorted [{path,digest}]))` over `AGENTS.md`, the canonical operating
  policy, `DIRECTIVES.md`, worker role rules and the recovery skill)
- `baselineScopeDigest`: `sha256:c7aa47c13e7a3ac0f311b742e928129eeab4cf8d4225f8806437bf6b8107a4d6`
  (`sha256(JSON.stringify(path-sorted [{path,digest}]))` from immutable HEAD blobs)
- `scopeCount`: `18`

```json
{
  "schemaVersion": 1,
  "receiptId": "GR-2026-09-04-714-IMAGE-AUTHORITY-SUPP-02",
  "outcomeId": "RECOVERY-BORN-714-EXACT-DISPATCH-AND-TERMINAL-TRUTH-001",
  "state": "CONSUMED",
  "admittedAt": "2026-09-04T13:43:27+03:00",
  "consumedAt": "2026-09-04T13:43:27+03:00",
  "baseSha": "68f3d66862d94ffce9f1b63bad47708824b54dc5",
  "branch": "main",
  "policyDigest": "sha256:2be31cc86ae76a33b6ea8283c1eeff331b71e9fe46f5802c7cb4bbf4daa9aa3",
  "baselineScopeDigest": "sha256:c7aa47c13e7a3ac0f311b742e928129eeab4cf8d4225f8806437bf6b8107a4d6",
  "scopeCount": 18,
  "scopeDigestAlgorithm": "sha256(JSON.stringify(path-sorted [{path,digest}]))",
  "authorityRef": "owner-live-2026-09-04-sprint-714-correct-scope-and-fix-approved",
  "recoverySeam": "ADR-D-007"
}
```

Exact supplemental scope:

- `.dockerignore`
- `Dockerfile.worker`
- `assets/Dockerfile.worker`
- `src/cli/commands/doctor.ts`
- `src/cli/commands/image.ts`
- `src/cli/helpers/messages.ts`
- `src/core/worker-image-check.ts`
- `src/orchestra/codex-spawn-readiness.ts`
- `src/orchestra/spawn-backend-docker.ts`
- `tests/cli/doctor-icon-consolidate.test.ts`
- `tests/cli/doctor-image-check.test.ts`
- `tests/cli/image-build.test.ts`
- `tests/cli/img2-init-fold.test.ts`
- `tests/core/worker-image-check.test.ts`
- `tests/docker/dockerignore-secrets.test.ts`
- `tests/docker/worker-image-providers.test.ts`
- `tests/orchestra/codex-spawn-readiness.test.ts`
- `tests/orchestra/spawn-backend-docker-mounts.test.ts`

The supplement may package and probe only the trusted Deckent runtime/native capability already
required by the exact backend, change the packaged build context so those files are available,
keep the root and packaged Dockerfiles aligned for this contract, and surface an honest
image-readiness failure. It cannot weaken native manifest parity, accept image-authored digests,
change provider/model/concurrency selection, or absorb unrelated image/Terminal work. Finite proof
budget: one TDD pass, one controlled host build/restart, one production image rebuild and one fresh
disposable dogfood canary.

### Terminal recovery-evidence supplement

Fresh compiled native-Terminal proof in the owner-authorized disposable canary found one exact
closure defect inside this package: `deckent recover --force` correctly preserved a checkpoint
under `CHECKPOINT_SUPERSESSION_REQUIRED`, but removed the same generation's evidence-only PID
snapshot. That destroyed the PID/start-token join to the durable RunFlow `RUN_FAILED` event, so the
canonical status resolver regressed from terminal `ABORTED` to false `ORPHANED` and advertised an
invalid `recover --resume` action. This directly blocks design-contract items 4–5; it is not a
7099 presentation feature.

Receipt `GR-2026-09-04-714-TERMINAL-EVIDENCE-SUPP-03` is bound to immutable HEAD blobs before either
path is edited:

```json
{
  "schemaVersion": 1,
  "receiptId": "GR-2026-09-04-714-TERMINAL-EVIDENCE-SUPP-03",
  "outcomeId": "RECOVERY-BORN-714-EXACT-DISPATCH-AND-TERMINAL-TRUTH-001",
  "state": "CONSUMED",
  "admittedAt": "2026-09-04T14:57:29+03:00",
  "consumedAt": "2026-09-04T14:57:29+03:00",
  "baseSha": "68f3d66862d94ffce9f1b63bad47708824b54dc5",
  "branch": "main",
  "policyDigest": "sha256:2be31cc86ae76a33b6ea8283c1eeff331b71e9fe46f5802c7cb4bbf4daa9aa3",
  "baselineScopeDigest": "sha256:e2d8b9fd5d8c689e99d0ce43bad0b121f9a96975bec3f4ae2fa1a36667bf2ba4",
  "scopeCount": 2,
  "scopeDigestAlgorithm": "sha256(JSON.stringify(path-sorted [{path,digest}]))",
  "authorityRef": "owner-live-2026-09-04-sprint-714-correct-scope-and-fix-approved",
  "recoverySeam": "ADR-D-007"
}
```

Exact supplemental scope:

- `src/orchestra/sprint-recovery-operation.ts`
- `tests/orchestra/sprint-recovery-checkpoint-preservation.test.ts`

The fix may retain only the evidence-only PID snapshot when the authorized checkpoint disposition
is `preserved`; it must still remove the live PID authority. It may not recreate a missing snapshot,
relax exact-generation correlation, clear the checkpoint, or turn an unproven flow event into
terminal truth.

### Planner applicability supplement

The owner-authorized isolated canary retry reached the external planner but both bounded planner
responses were rejected before flow creation with
`tasks.0.productionWiringProposal:host-proof-profile-unregistered`. Disk evidence proves the model
emitted a production-wiring identity for a documentation-only task. The parser currently attempts
host completion for every supplied proposal before consulting the host-derived scope applicability;
therefore an irrelevant, non-authoritative model field can prevent a `documentation-only-scope`
task from reaching its already strict execution gates. This is `BLOCKS_CURRENT_DONE` for the exact
3357 real-worker canary, not a 7099 feature and not authority to relax production wiring.

Owner decision `owner-live-2026-09-04-protect-deckent-api-and-continue-3357` authorizes one bounded
TDD correction. Receipt `GR-2026-09-04-714-PLANNER-APPLICABILITY-SUPP-04` is bound to fresh current
HEAD and raw-byte scope evidence:

```json
{
  "schemaVersion": 1,
  "receiptId": "GR-2026-09-04-714-PLANNER-APPLICABILITY-SUPP-04",
  "outcomeId": "RECOVERY-BORN-714-EXACT-DISPATCH-AND-TERMINAL-TRUTH-001",
  "state": "CONSUMED",
  "admittedAt": "2026-09-04T16:38:15+03:00",
  "consumedAt": "2026-09-04T16:38:15+03:00",
  "baseSha": "68f3d66862d94ffce9f1b63bad47708824b54dc5",
  "branch": "main",
  "policyDigest": "sha256:2be31cc86ae76a33b6ea8283c1eeff331b71e9fe46f5802c7cb4bbf4daa9aa3a",
  "baselineScopeDigest": "sha256:c7b505d2b639afd591636da0a059c96361548bb4851967966acf49ba94872bb7",
  "scopeCount": 2,
  "scopeDigestAlgorithm": "sha256(JSON.stringify(path-sorted [{path,digest}]))",
  "authorityRef": "owner-live-2026-09-04-protect-deckent-api-and-continue-3357",
  "recoverySeam": "ADR-D-007"
}
```

Exact executable scope and fresh baselines:

- `src/orchestra/planner.ts` —
  `sha256:9c30804fd8b811be4315e34b908687aa83cfd7afc2548c17fd64b44f593fabed`
- `tests/orchestra/planner-host-completed-wiring.test.ts` —
  `sha256:803db39b15904f8d1756fc263d24e6c5af7fbbee04b1fca8b8cf7e292f6965b1`

The host must derive applicability from normalized scope first. Only `not-applicable` scopes may
discard a supplied model proposal as non-authoritative; `production-write-scope` continues to
require exact registered identity completion and rejects missing, ambiguous, unregistered or
authored-digest material exactly as before. The task scope classifier itself is unchanged.

Conditional mechanical gate receipt
`GR-2026-09-04-714-PLANNER-APPLICABILITY-HERMETIC-SUPP-05` binds only
`scripts/lint-test-hermeticity.mjs` at the fresh pre-supplement digest
`sha256:b7470b973c4652ca393c8121396cdf94487d03c3e9f7b33f2afb945ab94a281d`.
It may be consumed only after the scanner proves unchanged unresolved-effect and production-module
counts; it can update digests/comments only, never counts, classifications or allowlists.

Finite budget: one failing-test-first implementation pass, one scoped verification fan-in, one
quiescent `build:all`, and no live provider/canary call without a new exact G7 consent. No provider,
model, credential, registry profile, concurrency, `.tasks`, `.brain/memory.db`, commit or push
mutation is admitted.

## Design and closure contract

1. The Docker backend resolves IPC only from the exact attempt query and canonical private
   `TaskAttemptCustodyStore`; public `.tasks/*.question` and model-authored digest material are
   never authority.
2. Store question and answer receipts retain exact identity, immutable artifact path and digest
   validation. The registry/collector contract is not relaxed.
3. Portable source inventory rejects case-fold collisions as typed `NOT_DISPATCHED`; a worktree
   deletion is interpreted from Git's current index/worktree truth without requiring a commit.
4. Fatal exact IPC admission failure first proves `reconcileExactLifecycle('contain')`; only then
   may PID/lock/active coordinator authority be retired. A containment HOLD remains visible.
5. RunFlow failure is published into canonical run status. Terminal compares its persisted
   read-model against fresh canonical authority and renders terminal lifecycle/reason instead of
   stale running elapsed/next fields.
6. Status/reason strings are caller-injected through `getMessage(key, lang)` for EN/TR.

## Negative scope and stop conditions

- No 7099/7101–7104 feature implementation or dogfood start until this recovery has real compiled
  proof and the failed run authority is safely reconciled.
- No model/provider/worker-count prompt override; effective config remains authoritative.
- No `.brain/memory.db` access or mutation, no `.tasks` deletion/content mutation, no push.
- No manual MASTER/Closure OS disposition mutation; append-only authority remains intact.
- Runtime observation files and REPL history are pre-existing operator/runtime state and are not
  executable scope or commit candidates.
- Build requires controlled bot stop, `build:all`, verification, documented restart/reconnect.
- HEAD/policy/scope drift or incomplete effect containment is typed HOLD.

## Verification contract

- TDD: portable collision/deletion inventory; Store-backed private question/answer lifecycle;
  backend→registry resolution; contain-before-retire; RunFlow failure publication; stale-terminal
  projection veto; EN/TR string-free live footer.
- Local: combined scoped Vitest battery, TypeScript, i18n/model-literal/operating-policy/
  hermeticity and relevant governance gates.
- Runtime: prove sprint-714 coordinator death and worker/container absence, reconcile only live
  authority while preserving forensic snapshot/task records, publish canonical terminal read-model.
- Built product: native Terminal must render terminal failure truth; a fresh CLI/native dogfood
  execution must cross the repaired dispatch/IPC seam and produce real provider/settlement evidence.

## Verification evidence — 2026-09-04T12:33:00+03:00

### Authority reconciliation and runtime truth

- OS and Docker inspection found no live `sprint-714` coordinator or `deckent-w-714-*` worker.
  The exact stale lease was released through
  `releaseSprintLockForTerminatedSprint(projectRoot, "sprint-714")`; the forensic
  `.deckent/pids/sprint-714.snapshot.json`, failed flow events and task absence remain preserved.
- Compiled `node dist/cli/entry.js status --json` reports `active:false`, lifecycle `ABORTED`,
  coordinator `absent`, and exact reason
  `run crashed before completion: Normal Docker IPC HOLD: PRIVATE_IPC_AUTHORITY_UNAVAILABLE`.
  Status read-model revision `2967` agrees with canonical authority.

### Build, restart and real Terminal surface

- After exact quiescence proof, the orphan bot listener was stopped by exact PID and
  `npm run build:all` completed successfully. Build identity:
  `sourceTreeSha256=78076722fb58ec02ffe5e5a1044729a2837545ef6a2186b1d9cb0f759fb173b8`,
  native binary
  `sha256:4e4dd558785cced4688979b219ac2648623f8bbf1f89a9f9fba8abab9913597f`.
- Bot restart succeeded at PID `3821489`; `deckent` resolves to this checkout's
  `dist/cli/entry.js`.
- A fresh real TTY launch of compiled `node dist/cli/entry.js` rendered:
  `Durum: sprint-714 · Başarısız`, the exact IPC failure under `Neden:`, and
  `Sıradaki: /status ile inceleyin`. It did not render stale `Çalışıyor · SPAWN`, elapsed time,
  worker count or task `714-001`.
- The compiled production inventory reader accepted the current pre-commit worktree after the
  canonical lowercase-template deletion: `state=ready`, `pathCount=6989`,
  `inventoryDigest=sha256:a9afb228effb0acb61043c05f902719f31baa3edbbea5c2d29e244801f6b880b`.

### Local verification and scope fence

- Recovery regression battery: 14/14 files and 451/451 tests passed after `build:all`.
- `npx tsc --noEmit`, i18n, model-literal, ADR, script-registry, recovery-truth,
  closure-disposition, operating-policy, MASTER projection, hermeticity and scoped
  `git diff --check` gates passed.
- Hermeticity remained at the admitted baseline: 0 confirmed violations; unresolved count
  `18156` / digest
  `af6e5cda82f7d0e3120d2e4654413af947a5a6de61f00c1f86d5b082be63f71b`; production
  inventory count `1421` / digest
  `8c5f61940a07e3e67fa7f7943a6881db0a97ed1e94c98e269227f32bb29f40d9`.
- Host-computed final executable-scope digest (28 admitted paths):
  `sha256:f021e9a242c1e3b8c0df7269df6cc3b292de4409900859a98ad47e6ccf89505e`.
  Supplemental gate-file digest:
  `sha256:28eb15ca4122609cdb0112714d82ce5caf3ec288dcb93c536f6d18683bb6e3c9`.
- A deliberately broader legacy `tests/orchestra/sprint-controller.test.ts` run exposed 13
  pre-existing failures outside this package: one test still asserts HEAD's retired `pauseSprint`
  text although HEAD already uses `pauseSprintExact`; twelve fixtures carry invalid fixed
  skill-attribution receipt digests and fail even in isolated execution. Recovery-targeted
  controller/collector/authority tests remain green; this evidence is
  `RELATED_BUT_NONBLOCKING`, not absorbed into this one-outcome package.

### Remaining honest HOLD

The recovery is not marked DONE and MASTER 3357 remains OPEN. A fresh dogfood run would create or
mutate `.tasks` and the owner explicitly prohibited `.tasks` content mutation in this session.
No 7099/7101–7104 run was started, no commit was created and nothing was pushed. Closure requires a
later owner-authorized landing plus fresh CLI/native dogfood execution that crosses the repaired
normal-Docker IPC seam and reaches terminal settlement.

## Image-authority supplement evidence — 2026-09-04T13:40:00+03:00

The first supplement build correctly refused to replace the production tag: its in-image loader
reported `binding-package-metadata-invalid`. Root-cause inspection proved the native loader binds
both `native/exec-authority/package.json` and Deckent's root `package.json`; the latter was absent
from `/app`. It also proved the final worker runs as the host UID/GID, so image-owned native files
must be immutable but readable by a non-root principal. TDD extended the image contract to copy
the root package identity, apply read-only `a=rX` access to the runtime tree, and execute the exact
loader during the build as both root and UID/GID `65532`. The canonical image builder now fails
before Docker spawn if any required runtime identity source is absent.

- Supplemental regression battery: 9/9 files, 173/173 tests passed (3 environment-gated tests
  skipped); `npx tsc --noEmit` and `npm run lint:i18n` passed.
- Post-supplement fan-in re-ran the primary and image recovery suites together: 19/19 files,
  465/465 tests passed (3 environment-gated tests skipped), proving the shared Docker/message
  edits did not regress the original IPC, containment or Terminal-truth seams.
- Host-computed final image-supplement scope digest (18 admitted paths):
  `sha256:d0e8a602affd58974f5daadb20fbc807bb96cbb125df26543044b720881f5ff1`.
- Controlled `npm run build:all` passed with native binary
  `sha256:4e4dd558785cced4688979b219ac2648623f8bbf1f89a9f9fba8abab9913597f`.
- Canonical `deckent image build --with-codex` completed and atomically published
  `deckent-worker:latest@sha256:d09e91e4af5d4b8fc0109a01da6e77902b0a0aade925a2bfbfc0135078b13714`.
- Hardened no-network/read-only probes under root and host UID/GID `1000:1000` both matched the
  host native manifest digest
  `sha256:ebe564daa862756f6ef8a228a090c62533bfcd52071e1ac23ded177a6c5119cf`.
  Image CLIs independently reported Codex `0.153.2` and Claude Code `2.1.259`.
- The documented restart chain completed; the bot is live on the current `dist` at PID `3876653`.

### Owner-authorized disposable canary and non-`/do` surface evidence

The owner explicitly authorized Deckent to create `.tasks` state inside
`/tmp/deckent-714-final-canary-ApAvg4` and to change only the tracked
`docs/CANARY-RESULT.md`. Canonical `deckent recover sprint-001 --force --skip-audit` settled the
dead prior attempt, and Deckent's stale-lock reconciliation removed its dead lock. The repository
then had no task files and no tracked diff.

The first real `/do` flow (`99025061-ece9-476a-b212-f966f6fc2dfa`) produced and approved one
closed-allowlist documentation task, published `RUN_STARTED`, then failed before provider work.
Exact lifecycle replay identified `DEPENDENCY_AUTHORITY_UNAVAILABLE`: the image lacked the
backend-required immutable `/app/node_modules` source. The final image now installs the locked
dependency tree, applies additive readability without mutating source permission identities, and
passes the exact dependency helper over 26,968 entries. No canary source file was changed and
`.tasks` remained empty on the failed attempt.

Applying recovery to that historical attempt with the pre-supplement binary exposed the
terminal-evidence defect recorded by supplement 03: the checkpoint was preserved but its PID
snapshot was removed, so compiled native Terminal regressed to false
`sprint-001 · Orphaned` / `deckent recover sprint-001 --resume`. The focused regression failed
before the fix and passed after live PID retirement was separated from evidence-snapshot
retention. The already-removed historical snapshot is not reconstructed; fresh execution is
required for real-binary closure.

Real native Terminal also exercised `/help`, `/status`, `/sprint`, `/agents`, `/doctor`, `/models`,
`/usage`, and `/runs`. `/runs` returned immediately but labelled the terminal failed flow under
“Active runs”; the other local/read-only commands showed an approximately eight-second
`generating` state before raw command output, and header provider/auth projection disagreed with
doctor's authenticated subscription evidence. `/context` was additionally observed routing into
the legacy provider loop rather than remaining a local command. These are 7099/7101–7104
`RELATED_BUT_NONBLOCKING` product findings; this package does not implement them.

A second identical `/do` attempt returned no usable planner plan after 172 seconds and created no
new flow, task state or tracked diff. A further host-Docker attempt was rejected by the execution
security layer because real provider work can egress repository context and the existing canary
authorization was not given after that risk was explicitly disclosed. No workaround, indirect
spawn, force flag or alternate external target was used.

The owner then gave informed, path-bounded consent for one canary run: effective-config-selected
Anthropic Claude via Claude Code subscription could receive the goal, task plan,
`docs/CANARY-RESULT.md`, required temp-repository instructions and bounded path/Git-diff metadata.
The owner explicitly acknowledged machine-external transfer and limited local state to the temp
repository's `.tasks`, `.deckent` and `.brain`, with the only tracked write
`docs/CANARY-RESULT.md`; main-repository writes, commit and push were excluded by that consent.
That consent was consumed by flow `afb58a0d-01a9-42b2-948b-cc7213acd333`.

The planner returned one closed-allowlist task after 218 seconds and the flow reached
`APPROVAL_GRANTED`/`START_REQUESTED`, but not `RUN_STARTED`. The detached coordinator PID
`3976477` exited with `DECKENT_E091:spawn-backend-recovery-hold`; no Docker worker/container,
task file or tracked diff was created. Production Store inspection isolated the exact historical
entry: task `001-001` / dispatch request
`dreq-bce6d9f35dd358f34c993211ab263b44d2ece2e5cf1a9ec8abffe740cb591f8e` was rejected as
`ARTIFACT_CHANGED` before new admission. Its immutable bytes, SHA-256, inode, volume, size and
link count still match; only root-bound privacy/durability evidence differs. The entry was written
by the stale pre-build adapter epoch whose mutable-directory size/link-count proof algorithm was
corrected by HEAD `67a734c87` without a persisted custody schema/epoch bump. The on-disk
`NOT_DISPATCHED` record cannot be promoted through the current Store because the admission graph
correctly fails closed.

This is a separate durable-state upgrade/migration finding, not authority to weaken current
custody verification. A fresh supported global-state resolution was proven to stay wholly inside
the authorized temp tree at
`.deckent/canary-host-state/deckent/runtime/task-attempt-custody/<project-digest>`; it has not yet
been used. The compiled Docker backend's startup reconciliation against that resolution returned
an exact empty report (`adopted/closed/retired/resumed/held = []`) without even creating the
directory, task state or tracked diff. Reusing `/do` would create a new flow and repeat external
planning, so the consumed single-run consent is not silently extended to that retry.

## Final local verification — 2026-09-04T16:05:00+03:00

- Production image `deckent-worker:latest` resolves to
  `sha256:d076030c3d3e8df9eba177dc44214f12be06f7b40e1d3c96a81ff432a9ff27ac`
  (691,464,965 bytes). The compiled readiness probe reports both provider CLIs, CA certificates,
  native runtime authority and dependency authority ready.
- Controlled bot stop → `npm run build:all` completed on current `dist`. Two canonical detached
  restart attempts passed initial readiness and were then retired after their processes became
  invisible/dead from the tool runner. A foreground `bot listen` proved the Telegram connector
  and listener loop active, then was intentionally stopped with SIGINT because the execution
  session could not expose a stable cross-command PID namespace. The final bot state is honestly
  not-running; restart from a stable owner host shell remains operationally required. Native authority binary remains
  `sha256:4e4dd558785cced4688979b219ac2648623f8bbf1f89a9f9fba8abab9913597f`.
- Full recovery fan-in: 20/20 test files passed, 474 passed and 3 environment-gated skipped.
  `npx tsc --noEmit`, i18n, model-literal, MASTER projection, closure-disposition,
  recovery-truth, operating-policy, script-registry and scoped `git diff --check` gates pass.
- Hermeticity: zero confirmed violations; unresolved count/digest
  `18156:73860b9e0606b5619cc79f53b938403d656ee0f58c6f9c0d647c2a00d0e340a7`;
  production inventory count/digest
  `1421:534cb56b83f06d820206fada742cf0bb28f1d7dd567c41c7f7514fd5f67ccb04`.
- Host-computed final scope digests: primary 28-path scope
  `sha256:54843f5b86fb717760ca3cd5804feea3a3873b5b186b5e953c5750f200f60dd7`;
  image 18-path scope
  `sha256:44e0232df5a67d8371cced5fe7fa3b25591c26dbcc3b37408926e9730e72bc87`;
  terminal-evidence 2-path scope
  `sha256:56ad234311d86c744c0fd11c1c067226b5f6f3242c29508d97704a8960f70232`;
  gate-file scope
  `sha256:dc978e25eb6c9e66f75a5201538eadaf439db466ba60788752a1e90a5ed78af2`.
- The exact pre-plan startup-HOLD regression now retires only the current process-owned planning
  lock and preserves prior sprint state/checkpoint/custody evidence. Its focused red test failed
  before implementation and the production controller wiring plus preservation assertions pass.
  The dead `sprint-002` lock from the consumed canary was then retired through the same canonical
  PID/start-token fenced reconciliation (`ownership=dead`, `coordinator=dead`); no manual deletion
  was used.
- Final `build:all` source identity is
  `a0e308be81a3065c4b4c6467f6674f70bdd7baffeda1cb76f43e47066d867ec9`; native binary remains
  `sha256:4e4dd558785cced4688979b219ac2648623f8bbf1f89a9f9fba8abab9913597f`.
- The image build's locked dependency audit reported 16 existing dependency findings
  (2 low, 6 moderate, 6 high, 2 critical). No package upgrade was absorbed into this recovery;
  it remains a separate security finding. Full-worktree `git diff --check` also observes trailing
  whitespace in runtime-owned `.deckent/settings/repl-history`; scoped executable diff is clean
  and that runtime file is not edited or admitted here.

MASTER 3357 remains OPEN, the capsule remains `IN_PROGRESS`, and 7099 dogfood remains prohibited
until a fresh informed external-provider retry is authorized, the real worker reaches terminal
settlement, and the bot is restarted from a stable owner host shell. The approved temp file has no
tracked diff and `.tasks` remains empty. No commit or push has been created.

## Planner applicability supplement evidence — 2026-09-04T16:48:00+03:00

- The second path-bounded canary consent was consumed by one CLI `/do` invocation using the
  isolated temp `XDG_STATE_HOME`. The provider returned two planner responses; both were rejected
  before flow creation with
  `tasks.0.productionWiringProposal:host-proof-profile-unregistered`. No Docker worker/container,
  execution binding, task file or tracked diff was created; `docs/CANARY-RESULT.md` stayed unchanged.
- The failing-first regression reproduced that exact issue. Production parsing now derives the
  conservative host scope applicability before inspecting any model proposal. A proposal supplied
  for `documentation-only-scope`, `test-only-scope` or `no-write-scope` is discarded and never
  becomes authority; production scope follows the unchanged strict completion branch.
- The focused test failed before implementation with the exact unregistered-profile issue and then
  passed 11/11. Post-build fan-in passed 28/28 files, 664 tests, with 3 environment-gated skips.
  TypeScript, i18n, model-literal, MASTER projection, Closure OS, recovery-truth, operating-policy,
  script-registry, hermeticity and scoped diff gates passed.
- Hermeticity measured zero confirmed violations. Counts stayed fixed at unresolved `18156` and
  production inventory `1421`; final digests are respectively
  `136e9563d32e9c231eca4d13489da713a689fdb58594879981789f3eedd4475a` and
  `e1c311e9156d192edb8c0359ece26cba71ab4d6c47b71ef7d1f9132d404fc81d`.
- Quiescent `npm run build:all` passed. Build identity is
  `sourceTreeSha256=c383da00b242738b3297bf9a07133741784af2c8a91b8b1b82d5504ae54c030e`;
  native authority remains
  `sha256:4e4dd558785cced4688979b219ac2648623f8bbf1f89a9f9fba8abab9913597f`.
- The documented post-build bot restart was re-issued after the first detached child exited; compiled
  dist PID `4013915` remained live across the readiness hold. OS liveness
  and canonical `bot status` both report it running. Compiled `--version` emitted no binary-identity
  drift warning. Long-lived interactive MCP/Terminal clients still require normal host reconnect
  before they can consume the rebuilt modules.
- A direct compiled-production parser proof returned
  `documentation.accepted=true`, `documentation.hasWiring=false`,
  `documentation.hasProposal=false`, while the identical identity under a production write scope
  returned `accepted=false` with `host-proof-profile-unregistered`.
- Final supplement executable-scope digest is
  `sha256:7261c53197f5f9c838d20113e4555d24214ac3cee4dd4b87e9efa3a8e19d3b3f`;
  final conditional gate-file digest is
  `sha256:b71ad23e63f61723a46c7805fde328e3ffd5ca28c05a53db8213e3fcb219f904`.

This source blocker is locally repaired but does not close 3357. A fresh live-provider G7 receipt
is required to run another `/do` canary and prove the real Docker worker through terminal
settlement. No further external call, commit, push, credential mutation, `.tasks` mutation or
`.brain/memory.db` access occurred in this supplement.

### Planner admission and pre-dispatch repair supplement

The fourth bounded canary passed custody-state recovery and reached the external planner, but the
model split one exact-file goal into four writers of `docs/CANARY-RESULT.md`, omitted an authored
dependency between two of those writers and mentioned `README.md` outside its declared read/write
scope. The immutable topology gate correctly emitted `undeclared-writer-collision` and denied the
plan before `RUN_STARTED`; no worker, container, task JSON or tracked diff was created. Independent
XVerify `xv-1788532784916-f20a36de-d50d-4fec-91a9-49a4ad3671bb` confirmed that the causal core is
host-side: the prompt unconditionally demanded 3–5 tasks and a final integration task even for an
atomic single-file intent, while no pre-dispatch contract repair consumed the topology finding.

Owner decision `owner-live-2026-09-04-apply-confirmed-planner-admission-solution-main` admits one
bounded ADR-D-007 supplement on `main`. Receipt
`GR-2026-09-04-714-PLANNER-ADMISSION-SUPP-06` is bound to fresh current-worktree raw bytes because
several paths already contain earlier admitted 3357 recovery changes:

```json
{
  "schemaVersion": 1,
  "receiptId": "GR-2026-09-04-714-PLANNER-ADMISSION-SUPP-06",
  "outcomeId": "RECOVERY-BORN-714-EXACT-DISPATCH-AND-TERMINAL-TRUTH-001",
  "state": "CONSUMED",
  "admittedAt": "2026-09-04T18:41:43+03:00",
  "consumedAt": "2026-09-04T18:41:43+03:00",
  "baseSha": "68f3d66862d94ffce9f1b63bad47708824b54dc5",
  "branch": "main",
  "policyDigest": "sha256:2be31cc86ae76a33b6ea8283c1eeff331b71e9fe46f5802c7cb4bbf4daa9aa3a",
  "baselineScopeDigest": "sha256:2055b3f5570d8188d9100d9b39429d1288191a2c57e287e51ce32d8f25812745",
  "scopeCount": 11,
  "scopeDigestAlgorithm": "sha256(JSON.stringify(path-sorted [{path,digest}])); digest is sha256 of current raw bytes and null means absent",
  "authorityRef": "owner-live-2026-09-04-apply-confirmed-planner-admission-solution-main",
  "recoverySeam": "ADR-D-007"
}
```

Exact supplemental scope:

- `src/core/execution-topology.ts`
- `src/orchestra/planner-plan-contract.ts` (new)
- `src/orchestra/planner.ts`
- `src/orchestra/run-proposal-compiler.ts`
- `src/orchestra/run-flow-plan-service.ts`
- `src/orchestra/spawn-backend-docker.ts`
- `src/orchestra/spawn-backend.ts`
- `tests/orchestra/planner-plan-contract.test.ts` (new)
- `tests/orchestra/run-flow-plan-service.test.ts`
- `tests/orchestra/run-proposal-planning-admission.test.ts` (new)
- `tests/orchestra/spawn-backend-docker-planning-preflight.test.ts` (new)

The host derives the planner task-cardinality contract from admitted intent and closed write scope:
an exact single-file write is one task; other intents allow 1–5 tasks without coupling task count to
provider, model, worker pool or concurrency. The first parsed response must satisfy cardinality,
closed allowlist, authored dependency reachability and semantic path-scope rules before consumer
acceptance. One existing bounded corrective planner attempt may repair exact secret-safe findings;
a second violation remains rejected. The canonical topology and production-wiring gates are not
changed or overridden.

When the effective backend is Docker, the same native exact-custody adapter and host-global root
resolver used by dispatch must prove physical project/root separation before any external planner
call. Failure is a typed non-retryable planning-admission HOLD and cannot consume provider work.
Non-Docker backends remain explicit and unchanged; unsupported platforms fail honestly through
their existing backend/adapter contracts.

Finite proof budget: failing tests first, one scoped implementation/verification fan-in, one
quiescent `build:all` plus documented restart/reconnect. A new external-provider canary is not
admitted by this receipt and still requires fresh informed G7 consent. No `.tasks`,
`.brain/memory.db`, credential, provider/model selection, Closure OS disposition, commit or push
mutation is admitted.

The first post-implementation hermetic scan reported zero confirmed violations and exactly the
same 18,156 unresolved effects; only their source-derived digest moved. The production inventory
increased by exactly one, from 1,421 to 1,422, solely because the admitted
`src/orchestra/planner-plan-contract.ts` module entered the graph. Conditional receipt
`GR-2026-09-04-714-PLANNER-ADMISSION-GATE-SUPP-07` binds only
`scripts/lint-test-hermeticity.mjs` at current raw-byte digest
`sha256:b71ad23e63f61723a46c7805fde328e3ffd5ca28c05a53db8213e3fcb219f904`
(one-path aggregate scope digest
`sha256:794e4e9ad9b424b4a4e4530aed5c2f906c1cc580d84dd4c9cc217b195dcec74d`).
It may change only comments and these measured baselines: unresolved
`18156:21ea8ba25b78ce0af0927293a81c4d6b0d8185909e21105d0f8e04b3da40dc81`, production
inventory `1422:f1733331b4b01e444097918e9d4444c61dac6dea15a8130df5fc2f1db02947c4`.
No classification, allowlist, scan logic or violation suppression is admitted.

After SUPP-07 was durably projected, review found that the new pre-planner semantic path check
must reuse the canonical `isRealPathCandidate` filter already used by the final prompt gate; without
it, known tokens such as `Date.now/process.env` can be misclassified as file paths and waste the
bounded repair attempt. The correction changes the new module's import/consumer edge and therefore
requires a second immutable gate identity instead of rewriting SUPP-07. Receipt
`GR-2026-09-04-714-PLANNER-PATH-FILTER-GATE-SUPP-08` binds the pre-edit current bytes of exactly:

- `scripts/lint-test-hermeticity.mjs` —
  `sha256:3422b5ae0fc6fdc56676012b920cd44f4e13dddba478c34132fe80477c712028`
- `src/orchestra/planner-plan-contract.ts` —
  `sha256:01cc8b0170fea3a5d98e8ecca0ccec45246136140222c3c31be681bfb4b3cffb`

The two-path baseline aggregate is
`sha256:c2d5db17687be627279d845d2c59b86ba2b0ac8fffa6cd2616481b2ebd76007c`.
This receipt permits only reuse of that existing canonical predicate and the resulting measured
digest ratchet with production count fixed at 1,422 and unresolved count fixed at 18,156. It does
not permit filter weakening, a new allowlist/classification, violation suppression or any other
source/gate change.

Post-edit measurement under SUPP-08 found zero confirmed violations, unresolved effects
`18156:21ea8ba25b78ce0af0927293a81c4d6b0d8185909e21105d0f8e04b3da40dc81`, and production
inventory `1422:890d21043ca24b33124e10a43adcb11193e404b058f3e53a1cc096485a6d10d6`.
The counts remain fixed exactly as admitted; only the source-derived production digest changed.

### Planner admission supplement verification — 2026-09-04T19:20:00+03:00

- Focused fan-in passed 10/10 files and 153/153 tests. TypeScript, operating-policy, MASTER
  projection, Closure OS, i18n, model-literal, hermeticity and the admitted-scope whitespace gate
  passed. Full-worktree whitespace inspection still reports only the pre-existing runtime-owned
  `.deckent/settings/repl-history` trailing space; that file was neither edited nor admitted here.
- Quiescence inspection found no sprint lock or Docker worker. The live bot PID `4013915` was
  stopped through compiled `deckent bot stop`; `npm run build:all` completed with source-tree
  identity `df68c2bb3e7975a598c59b3194c710f2695946a07ef6305684eaec8991c99149` and native binary
  `sha256:4e4dd558785cced4688979b219ac2648623f8bbf1f89a9f9fba8abab9913597f`.
  The documented restart then produced PID `4086163`; canonical `bot status` and OS liveness agree.
- Compiled contract inspection derived exactly one task for one tracked closed-allowlist write.
  The native custody preflight opened a host-state root outside its disposable project and returned
  native root/capability evidence. A credentials-free real compiled CLI dry-run with a fake provider
  rendered one task, `GATE: PASS`, `POLICY: ALLOW`, topology PASS and effective concurrency 1;
  it did not start a run.
- The existing `term-slice-541-544-e2e` fixture reached the rebuilt real CLI outside the sandbox but
  was rejected because its fake production-source writer omits the now-required
  `productionWiringProposal`. This is an old fixture-contract finding, not a planner-admission
  regression, and is classified `RELATED_BUT_NONBLOCKING`; no unrelated test edit is absorbed.
- Final 11-path planner-admission scope digest is
  `sha256:605a011dee67240f78883fd8d6e12982ea1ee4d0d93f4c86fa63b31d1b58b47b`.
  Final SUPP-08 two-path aggregate digest is
  `sha256:568f91d803736fe1c08e4a1c4e6133fae65f2eb5aa13bc41567edea0add7116e`.

Local implementation and compiled admission proof are complete, but 3357 remains OPEN. The owner
requested the terminal-settlement smoke to run on `main`, not as a disposable-project substitute.
That external-provider execution remains gated on a fresh informed G7 scope receipt; 7099 does not
start until the real main worker settles terminally.

### Reservation recovery and pre-provider truth supplement

The single owner-authorized main smoke (`flow dfd565bf-0cab-4262-9263-017eef8ca70f`) consumed one
external planning call and then terminated before `RUN_STARTED` with
`DECKENT_E091:spawn-backend-recovery-hold`. No `715-001` task artifact, worker, container or tracked
target change was created. Read-only Store discovery proves that startup encountered three
`reserved-pending-admission` records from sprint 714. The reservation files and request-material
files are durable, but no admission exists; the current Store deliberately preserves that crash
window while neither normal startup nor canonical `deckent recover` can settle it.

The same evidence exposed two directly blocking admission defects. Planning preflight proves only
the physical custody root and does not inspect existing recovery health before an external planner
call. Separately, the planner contract is checked before deterministic normalization, while the
normalized result actually consumed by the directive compiler is not checked again against the
same project root and closed scope. Both are host defects; neither is LLM nondeterminism and neither
permits weakening the final topology, scope or production-wiring gates.

The durable invocation receipt also proves that effective config selected `codex/gpt-5.6-sol`,
although the informed smoke consent named Anthropic Claude. This was an operator-side consent
matching error. It grants no continuing authority: no retry or further external provider call may
occur until a new consent names the provider/model actually resolved by fresh effective config.

Owner instruction `owner-live-2026-09-04-finish-3357-then-prioritize-modularization` admits one
bounded ADR-D-007 correction. Receipt
`GR-2026-09-04-714-RESERVATION-RECOVERY-SUPP-09` is bound to current `main` bytes before edits:

```json
{
  "schemaVersion": 1,
  "receiptId": "GR-2026-09-04-714-RESERVATION-RECOVERY-SUPP-09",
  "outcomeId": "RECOVERY-BORN-714-EXACT-DISPATCH-AND-TERMINAL-TRUTH-001",
  "state": "CONSUMED",
  "admittedAt": "2026-09-04T19:37:06+03:00",
  "consumedAt": "2026-09-04T19:37:06+03:00",
  "baseSha": "68f3d66862d94ffce9f1b63bad47708824b54dc5",
  "branch": "main",
  "policyDigest": "sha256:2be31cc86ae76a33b6ea8283c1eeff331b71e9fe46f5802c7cb4bbf4daa9aa3",
  "baselineScopeDigest": "sha256:0f0720bf8ca99ca932e9786d7d78b30c3e6da8cac3e53b394241787fef3678f6",
  "scopeCount": 13,
  "scopeDigestAlgorithm": "sha256(JSON.stringify(path-sorted [{path,digest}])); digest is sha256 of current raw bytes and null means absent",
  "authorityRef": "owner-live-2026-09-04-finish-3357-then-prioritize-modularization",
  "recoverySeam": "ADR-D-007"
}
```

Exact supplemental scope and baselines:

- `src/cli/commands/recover.ts` — `sha256:17b30246157d307625b23f390654807b2a4a76f3c4ea38e3dd3cc75dfa0d5105`
- `src/cli/helpers/messages.ts` — `sha256:c6aebfde4a5eeed29c4b76e8e8f8e7333dc8311d6bf1d8976bb24a36b5644c26`
- `src/core/task-attempt-custody-store.ts` — `sha256:1fd8ce40c5616a719ab51f483270e6e8ea88977e3f4e91b3de28331601dfc7f2`
- `src/orchestra/planner.ts` — `sha256:f796a107b400b6aff75c6b7ca9dfca03b33748c1f383643eb15c482dd56fa9f0`
- `src/orchestra/spawn-backend-docker.ts` — `sha256:e694c0f76ef503721c128aa32b01db21e5a4b15879b57aa75e4957f54fef84d9`
- `src/orchestra/spawn-backend.ts` — `sha256:cd633c3478e1b17f0a175c5186b8cba0db2965b90ad011bc57fb2778be6914a4`
- `src/orchestra/sprint-recovery-operation.ts` — `sha256:d5ec0ac9309b9cafce63f2e6bc61c84db4f777c8211ec01abc4ad5fe02c350ed`
- `tests/cli/recover.test.ts` — `ABSENT`
- `tests/core/task-attempt-custody-store.test.ts` — `sha256:f93f50518771fc7589ad8c7afff9e4d62b88180221ed83459d37756e8d42c68c`
- `tests/orchestra/planner-plan-contract.test.ts` — `sha256:b0cdd0d1701b6fad6b553266eef233c9899b5a170d520f6b746b40cec589eeb3`
- `tests/orchestra/spawn-backend-docker-mounts.test.ts` — `sha256:25e4db40851be6113d7058e7139aa0fe58203642efd9a1ef475f3df981ac7370`
- `tests/orchestra/spawn-backend-docker-planning-preflight.test.ts` — `sha256:f0fd60516ab37c410e9d225cac979cbc986f662fc3b6f62f46d6a2f5564dd938`
- `tests/orchestra/sprint-recovery-operation.test.ts` — `sha256:a2f28116aef290be5703f93624f94ea64a08f9b4d1d827ab0a3b2f1fae153318`

The Store may add one append-only, reservation-bound transition/retirement contract that arbitrates
admission versus authorized retirement with first-writer semantics. Ordinary startup and planning
remain read-only and HOLD on unresolved records. Only canonical sprint recovery, after exact
coordinator-death and approval identity verification, may settle matching reservation-only records
as `RETIRED_BEFORE_ADMISSION`; it must never delete them, fabricate an admission, or infer provider
absence from a model claim. Fresh dispatch must persist enough host-authored material to reconcile
the reservation/admission crash window without ambiguity.

Planning preflight must scan the same native Store before external planning and return bounded
identity/reason evidence when unresolved recovery exists. The accepted planner result must be
normalized against the explicit project root and then pass the same host plan contract again before
consumer settlement. All final gates remain strict. Finite budget: one failing-test-first pass, one
focused verification fan-in and, only after quiescence, one controlled build/restart. This receipt
does not authorize runtime recovery, another provider call, automatic retry, `.tasks` mutation,
`.brain/memory.db`, 7099/7101–7104 work, commit or push.

The pre-provider health boundary introduces a typed recovery HOLD distinct from the native root
HOLD already handled by the proposal compiler. Transporting that exact non-retryable code and its
bounded task/reason list through the existing compiler requires two additional paths; they were
returned to their pre-change bytes before admission. Receipt
`GR-2026-09-04-714-PLANNING-HOLD-TRANSPORT-SUPP-10` binds:

```json
{
  "schemaVersion": 1,
  "receiptId": "GR-2026-09-04-714-PLANNING-HOLD-TRANSPORT-SUPP-10",
  "outcomeId": "RECOVERY-BORN-714-EXACT-DISPATCH-AND-TERMINAL-TRUTH-001",
  "state": "CONSUMED",
  "admittedAt": "2026-09-04T19:55:10+03:00",
  "consumedAt": "2026-09-04T19:55:10+03:00",
  "baseSha": "68f3d66862d94ffce9f1b63bad47708824b54dc5",
  "branch": "main",
  "policyDigest": "sha256:2be31cc86ae76a33b6ea8283c1eeff331b71e9fe46f5802c7cb4bbf4daa9aa3",
  "baselineScopeDigest": "sha256:11c741394df8ac8660efff58b6cb143a8afb1af14854d6ec4d57956de18f79b4",
  "scopeCount": 2,
  "scopeDigestAlgorithm": "sha256(JSON.stringify(path-sorted [{path,digest}]))",
  "authorityRef": "owner-live-2026-09-04-finish-3357-then-prioritize-modularization",
  "recoverySeam": "ADR-D-007"
}
```

- `src/orchestra/run-proposal-compiler.ts` — `sha256:0186dd742ee9c24052e0cb2a0a5e8d3741ee0096e33346361ea7e3ec3b3adab2`
- `tests/orchestra/run-proposal-planning-admission.test.ts` — `sha256:be1013f6716181534e06c4a36260a4385713d7c353871615ebd9e272ebdcba6f`

This supplement may only preserve `EXECUTION_ADMISSION_HOLD`, `retryable=false`, the canonical
reason code and a bounded secret-safe list of task/reason identities before provider invocation.
It cannot add retry, mutate recovery state, expose paths/credentials, or change planner semantics.

The post-implementation hermetic scan found zero confirmed violations. Replacing the raw
private-state deletion fixture with a production-adapter interruption returned the unresolved
effect count to exactly 18,156; the production inventory remains exactly 1,422. Only the
source-derived fingerprints moved. Conditional mechanical receipt
`GR-2026-09-04-714-RESERVATION-RECOVERY-GATE-SUPP-11` binds the current raw bytes of exactly
`scripts/lint-test-hermeticity.mjs`:

```json
{
  "schemaVersion": 1,
  "receiptId": "GR-2026-09-04-714-RESERVATION-RECOVERY-GATE-SUPP-11",
  "outcomeId": "RECOVERY-BORN-714-EXACT-DISPATCH-AND-TERMINAL-TRUTH-001",
  "state": "CONSUMED",
  "admittedAt": "2026-09-04T20:04:31+03:00",
  "consumedAt": "2026-09-04T20:04:31+03:00",
  "baseSha": "68f3d66862d94ffce9f1b63bad47708824b54dc5",
  "branch": "main",
  "policyDigest": "sha256:2be31cc86ae76a33b6ea8283c1eeff331b71e9fe46f5802c7cb4bbf4daa9aa3",
  "baselineScopeDigest": "sha256:0a137dc77da0192921621b22982ff96639a8f4c7d75e770f163e76d11a23bfad",
  "scopeCount": 1,
  "scopeDigestAlgorithm": "sha256(JSON.stringify(path-sorted [{path,digest}]))",
  "authorityRef": "owner-live-2026-09-04-finish-3357-then-prioritize-modularization",
  "recoverySeam": "ADR-D-007"
}
```

- `scripts/lint-test-hermeticity.mjs` —
  `sha256:ea4d2070dae71bb310637c6f95175444584a567a8e2f4fc62ce357caec8353c3`

The receipt may update only comments plus the measured unresolved fingerprint
`18156:b2728f03f916ce31e4ea96feeb19d81d9279ee9104d9516f16ee1dbd05a835a2` and production
inventory fingerprint
`1422:28e33badb7e816927d1a6de62d2ac3e4085ceb112498559822f6207d9f0a1e73`. It cannot alter
counts, classifications, allowlists, scan logic or violation suppression.

### Historical custody-epoch quarantine supplement

Fresh host-native Store evidence supersedes the earlier crash-window projection: all three
`sprint-714` reservations have admissions and immutable no-effect terminals. `714-002` and
`714-003` reread normally. Only `714-001` was authored under an earlier host mount namespace;
its canonical admission embeds a different custody root/capability epoch, so the current Store
correctly returns `ARTIFACT_CHANGED`/`CORRUPT_CUSTODY_RECORD`. The existing recovery path flattens
this identity-bound admission-graph HOLD into a tampered candidate and cannot settle it.

Owner instruction `owner-live-2026-09-04-main-only-restore-dogfood` admits one bounded ADR-D-007
correction on `main`. Receipt `GR-2026-09-04-714-CUSTODY-EPOCH-QUARANTINE-SUPP-12` is bound to the
fresh current bytes before edits:

```json
{
  "schemaVersion": 1,
  "receiptId": "GR-2026-09-04-714-CUSTODY-EPOCH-QUARANTINE-SUPP-12",
  "outcomeId": "RECOVERY-BORN-714-EXACT-DISPATCH-AND-TERMINAL-TRUTH-001",
  "state": "CONSUMED",
  "admittedAt": "2026-09-04T20:29:38+03:00",
  "consumedAt": "2026-09-04T20:29:38+03:00",
  "baseSha": "68f3d66862d94ffce9f1b63bad47708824b54dc5",
  "branch": "main",
  "policyDigest": "sha256:9d8a5d562d6857c565c9003b65506a5b55e46d042c2a61e6d8d797ea4240d409",
  "baselineScopeDigest": "sha256:91308955bce9789490709453281ca24e8c4e25a7f9ff925aeffe5feae28ca628",
  "scopeCount": 9,
  "scopeDigestAlgorithm": "sha256(JSON.stringify(path-sorted [{path,digest}]))",
  "authorityRef": "owner-live-2026-09-04-main-only-restore-dogfood",
  "recoverySeam": "ADR-D-007"
}
```

Exact executable scope and fresh raw-byte baselines:

- `src/cli/commands/recover.ts` — `sha256:dda974514dc7ae4155b731f4b6f7a7586ed9c59ad65852287ec6b9b5527373b6`
- `src/cli/helpers/messages.ts` — `sha256:a658e355d8bad4a98bdadb91f25ae1f697de45dd799223f5d603518c37509a92`
- `src/core/task-attempt-custody-store.ts` — `sha256:2745409a7ac8daea17d301682f43d69c0934a462f56ace5f3d1cd30bc6f01b5f`
- `src/orchestra/spawn-backend-docker.ts` — `sha256:751c6e21305d5ce4827a7edd36985eba32a38917330ab3bc096a650f433a348b`
- `src/orchestra/sprint-recovery-operation.ts` — `sha256:a66c83e2051670c8ca540a9c68fd1c221f18a6a12de811a3277a8f30033c2861`
- `tests/cli/recover.test.ts` — `sha256:2e6516ebf9524b5da268e86a7ee15db2ec735e57af040ea89b805277b9c4908d`
- `tests/core/task-attempt-custody-store.test.ts` — `sha256:c856f5b14f10f717a000abba6dcb91ad0405271999ce23093b28a8f787223110`
- `tests/orchestra/spawn-backend-docker-planning-preflight.test.ts` — `sha256:102eaefecd77d9b25fc8d1282dbe9701696390a9600587990f1171623dde340a`
- `tests/orchestra/sprint-recovery-operation.test.ts` — `sha256:ae013ec99ce837dfc5dc14b0a02aff17d49be6db257948c813cc22864d4fc7de`

The Store may add one first-writer, append-only quarantine receipt only for an identity-bound
admission graph that (a) belongs to the exact recovered sprint, (b) embeds a custody epoch different
from the current trusted root, and (c) already carries a canonical `NOT_DISPATCHED` terminal with
zero attempts and digest-bound no-effect evidence. The receipt binds the reservation, historical
admission, no-effect terminal, typed observed HOLD, old/current root evidence and the canonical
recovery authority. It never converts the historical admission into current execution authority,
never deletes or overwrites an artifact and never suppresses malformed/hash-unbound candidates.
Ordinary discovery may classify only a fully verified receipt as quarantined terminal history;
otherwise it remains fail-closed. `714-002/003` are immutable. Finite proof budget: failing-first
Store/host/recovery/CLI tests, one focused fan-in and one controlled build/restart. External provider
calls, automatic retry, 7099/7101-7104, commit, push, credentials, `.brain/memory.db`, manual `.tasks`
mutation and `/tmp` execution remain excluded.

The complete post-implementation scan reports zero confirmed violations. Removing the one
module-load freeze introduced during TDD returned the unresolved effect count to exactly 18,156;
the production module count remains exactly 1,422. Only source-derived identities moved. Mechanical
receipt `GR-2026-09-04-714-CUSTODY-EPOCH-GATE-SUPP-13` binds the current raw byte of
`scripts/lint-test-hermeticity.mjs` (`sha256:da49ad0ad6da8bdad798be7fc7ebed26244856be70041e8936d115f9f2df5949`),
aggregate `sha256:3f5627c5d40079bc2871e93a3b46fa6f188942503a72914147fa8fc45f24aeaf`,
and may update only explanatory comments plus the measured unresolved fingerprint
`18156:2c6be091995663d00fdfcff6ee808d418068bbbceff349961710c824976e5c88` and production fingerprint
`1422:a66f7fb6b3532bf3f580e0e02a263d733e3816e754af4be558e7cd2fa982ed88`. Counts,
classification, allowlists, scan logic and suppression are immutable. Authority:
`owner-live-2026-09-04-main-only-restore-dogfood`; admitted/consumed
`2026-09-04T20:43:31+03:00`; base `68f3d66862d94ffce9f1b63bad47708824b54dc5`; branch `main`.

### Zero-config planner failure-truth supplement

The first post-recovery main `/do` reached the configured `codex/gpt-5.6-sol` planner twice. Both
host subprocess transports settled successfully with exit code zero, while the planner consumer
rejected both the initial response and the single schema-correction response as
`validation_failed`. The durable invocation ledger proves those facts without exposing provider
stdout, stderr, prompts or credentials. The zero-config adapter then collapsed the typed terminal
reason and receipt reference to `null`, so the compiler rendered the materially false aggregate
"provider unavailable, timed out, or unparseable" diagnosis.

Owner instruction `owner-live-2026-09-04-run-to-result-no-more-approval-prompts` admits this exact
`BLOCKS_CURRENT_DONE` ADR-D-007 diagnostic-transport correction on the fresh main HEAD after the
owner cleanup commit. Receipt `GR-2026-09-04-714-PLANNER-FAILURE-TRUTH-SUPP-14` is consumed before
source/test edits:

```json
{
  "schemaVersion": 1,
  "receiptId": "GR-2026-09-04-714-PLANNER-FAILURE-TRUTH-SUPP-14",
  "outcomeId": "RECOVERY-BORN-714-EXACT-DISPATCH-AND-TERMINAL-TRUTH-001",
  "state": "CONSUMED",
  "admittedAt": "2026-09-04T21:06:10+03:00",
  "consumedAt": "2026-09-04T21:06:10+03:00",
  "baseSha": "ff2e47564232d05656b8645f4c3fd3449b322dc9",
  "branch": "main",
  "policyDigest": "sha256:19ada746785518e85849975dbd3f7e93b9efc03e42d3a7eb3def8f4098a61c60",
  "baselineScopeDigest": "sha256:b893692c8a22ec697be9f95d46f15f17762357f3a8308c7752c363504a922269",
  "scopeCount": 4,
  "scopeDigestAlgorithm": "sha256(JSON.stringify(path-sorted [{path,digest}]))",
  "authorityRef": "owner-live-2026-09-04-run-to-result-no-more-approval-prompts",
  "recoverySeam": "ADR-D-007"
}
```

- `src/orchestra/planner.ts` — `sha256:06c2805910c41ba8c11656a2f15e5a2d1088faf55c3f6986e6351ac351f832c5`
- `src/orchestra/run-proposal-compiler.ts` — `sha256:792286590167c110df81c54ba2c9f291c6386910d4a253feb7e65f2727dd285e`
- `tests/orchestra/planner-zeroconfig.test.ts` — `sha256:5fb675b59dc637e4d8ad4277525aa211baeb93800f28b8597d0353be5ba4b70d`
- `tests/orchestra/run-proposal-planning-admission.test.ts` — `sha256:f8475951296d633e4acdfc83716609ec7a15d901acea882bb7d253f1d8a7de69`

The planner may report only its existing typed reason, provider/model identity, bounded timing and
byte counts, framed output digest, parser/contract stage and invocation receipt reference. Raw
provider output, stderr, exception text, prompts, auth material and absolute paths are forbidden.
The compiler may preserve that secret-safe evidence in `RunProposalPlanError`; it may not retry,
weaken the plan/topology/wiring contract, accept an invalid plan, change provider/model/concurrency,
or mutate Flow/Run state. Legacy callers retain the `PlannerResult | null` contract. Finite proof:
failing-first tests, focused fan-in, TypeScript, required gates, controlled build/restart and one
fresh owner-authorized main `/do` attempt. `/tmp`, 7099/7101-7104, commit, push and
`.brain/memory.db` remain excluded.

### Closed-scope pre-wiring correction supplement

The secret-safe contract log narrows the two planner rejections further. Attempt one proposed an
unregistered production-wiring identity; attempt two omitted wiring while still proposing a
production mutation outside the owner-authorized single documentation path. Today production
wiring completion runs before the host plan-contract check, so the corrective round receives a
wiring symptom instead of the prior closed-scope violation. This ordering lets model scope drift
consume the only correction attempt without ever seeing the authoritative host boundary.

Receipt `GR-2026-09-04-714-CLOSED-SCOPE-PREWIRING-SUPP-15` consumes the same live owner authority
for an exact fail-closed ordering correction on current main bytes:

```json
{
  "schemaVersion": 1,
  "receiptId": "GR-2026-09-04-714-CLOSED-SCOPE-PREWIRING-SUPP-15",
  "outcomeId": "RECOVERY-BORN-714-EXACT-DISPATCH-AND-TERMINAL-TRUTH-001",
  "state": "CONSUMED",
  "admittedAt": "2026-09-04T21:11:41+03:00",
  "consumedAt": "2026-09-04T21:11:41+03:00",
  "baseSha": "ff2e47564232d05656b8645f4c3fd3449b322dc9",
  "branch": "main",
  "policyDigest": "sha256:19ada746785518e85849975dbd3f7e93b9efc03e42d3a7eb3def8f4098a61c60",
  "baselineScopeDigest": "sha256:29cedc90a3d57ae09fd6c45b0b7b7a7524f82a6a18a379eb2b816be7db090d87",
  "scopeCount": 3,
  "scopeDigestAlgorithm": "sha256(JSON.stringify(path-sorted [{path,digest}]))",
  "authorityRef": "owner-live-2026-09-04-run-to-result-no-more-approval-prompts",
  "recoverySeam": "ADR-D-007"
}
```

- `src/orchestra/planner.ts` — `sha256:9fef8ed71baafc745f3d6596cadb76f8c575a27db632461cdc96a03cf03628f0`
- `src/orchestra/planner-plan-contract.ts` — `sha256:778287ad1a7de405018c887c8eb00d1d56498dc71a6aff2a6c164278bfe6489b`
- `tests/orchestra/planner-plan-contract.test.ts` — `sha256:79520507a9c27d9dd31692fbe550336c9d91366a725c62a44b28a9bd5905dad8`

For a host-authored closed write allowlist, schema-valid model output outside that allowlist must be
rejected before production-wiring identity completion and the exact bounded scope reason must feed
the existing single corrective round. The host does not clamp, discard or silently rewrite model
scope. The final corrected plan still passes production-wiring completion, normalized scope,
topology and all downstream gates. The prompt may clarify that a single exact-write task's
`filesWrite` equals the allowlist and analysis-only paths remain `filesRead`; provider/model/worker
selection is unchanged. No extra retry, generic profile, authored digest acceptance, wiring bypass,
runtime mutation, external call, `/tmp`, 7099, commit, push or memory DB access is admitted.

The post-edit hermetic scan reports zero confirmed violations, keeps the unresolved-effect count
exactly `18156` and keeps the production-module count exactly `1422`; only source-derived
fingerprints changed. Conditional mechanical receipt
`GR-2026-09-04-714-PLANNER-FAILURE-GATE-SUPP-16` binds the current raw gate byte
`sha256:85d75750ede4ce7b1e916e907ffd5f48c0578b157c8bf1201933d2a29b51ad5e`, aggregate
`sha256:b0c107a5f0a54a1ef5dbc4c97511b8335c06e082735721fe4c86f61ef705befc`, and authorizes only
comments plus the measured unresolved fingerprint
`18156:5f75abaaa7a239e8f820df6693de526fbba426f0a22fc219ba198f691832aa54` and measured production
fingerprint `1422:336cd80a99bb6930843250c6867fd66307a0624ce58a480d60da42a2c11728ce`. Classifications, allowlists, scan logic,
suppression and counts are immutable. Authority:
`owner-live-2026-09-04-run-to-result-no-more-approval-prompts`; admitted/consumed
`2026-09-04T21:17:49+03:00`; base `ff2e47564232d05656b8645f4c3fd3449b322dc9`; branch `main`.

## Owner-directed continuation — 2026-09-05, sprint-719 boundary

Alperen's live instruction assigns this session sole execution supervision and authorizes the
bounded continuation of dogfood recovery, including the explicitly requested `gpt-6-astra`
catalog bootstrap. This is a live owner override of the normal session-handoff prerequisite,
not a fabricated PREPARED/VERIFIED/COMMITTED receipt or a new epoch claim. DOGFOOD remains ON;
health remains DEGRADED. MASTER 3357 is unchanged and no new work identity is minted here.

Fresh base: `main` at `ff2e47564232d05656b8645f4c3fd3449b322dc9`; MASTER SHA-256
`c8208c566af8cdafe43f5c6d7e1afb26372235cfaee52456b777e3a828279809`.
Existing dirty changes are inherited, not credited to this session. Sprint-719 flow
`304f4c81-2621-4442-93d9-3172b394b40f`, attempt
`1329297f-bd5b-8673-8f32-0b35b2784c8d` generation 1, produced provider work but no accepted
landing/settlement. Read-only host inspection confirms its container exited 0 and coordinator
PID 251547 is absent. Its private lifecycle artifacts stop before READY_FOR_LANDING. Missing
private `.git` is not established as the cause; the exact path uses host manifests.

Bounded sequence:
1. Bootstrap requested catalog identity through existing registry/pricing/activation mechanisms;
   keep automatic tier defaults unchanged and account eligibility separate from catalog presence.
2. Diagnose final-capture failure; repair only evidenced blockers in prompt/workspace,
   effect landing and existing lifecycle projections. Preserve private custody and no-follow/CAS.
3. Scoped hermetic verification plus independent review, then quiescent compiled proof.
4. Return to the official dogfood entrypoint for one admitted worker-to-main-to-settlement proof.
   An unchanged failure fingerprint cannot trigger another run.

Initial additional executable scope (catalog bootstrap): `src/core/model-registry.ts`,
`src/core/pricing-data-baseline.json`, `tests/core/gpt6-astra-catalog.test.ts`.
Landing/prompt fixes require their exact evidence and path scope to be recorded before editing.

### Final-capture diagnostic continuation scope

Source trace proves `commitExactDockerEffectLanding` collapses typed final-capture, lifecycle
publication and later landing failures into `null`; caller publishes only EFFECT_LANDING_HOLD.
No READY_FOR_LANDING artifact exists for 719. This observation admits no `.git` or custody bypass.
The bounded repair preserves allowlisted stage/code and attempt-bound diagnostic evidence through
the existing Store and capture-hold projection, without creating terminal success authority.
Exact paths: `src/orchestra/spawn-backend-docker.ts`, `src/orchestra/spawn-backend.ts`,
`src/orchestra/execution-effect-docker-lifecycle.ts`, `src/core/task-attempt-custody-store.ts`,
`tests/orchestra/spawn-backend-docker-mounts.test.ts`,
`tests/orchestra/execution-effect-docker-lifecycle.test.ts`,
`tests/core/task-attempt-custody-store.test.ts`.
Only the landing diagnostic lane may write these paths during this pass. Raw exception text,
stderr, prompt, credential and private source paths must not enter public diagnostic projections.
Supporting catalog adapter regression scope additionally includes `tests/providers/codex.test.ts`
to remove its obsolete exact model-count assumption while preserving identity assertions.

### Worker-guide delivery scope

The host verifies the managed guide but the prompt instructs a private worker to open a protected
path absent from its snapshot. Deliver only the verified managed body from the same host read in
the existing worker-contract segment; final prompt receipt already binds the delivered bytes.
Do not copy owner notes or expose the protected tree. Missing/digest-only/tampered delivery keeps
the inline primary contracts and must not claim delivered supporting authority.
Exact paths: `src/core/workspace-artifact-contract.ts`, `src/orchestra/workspace-artifacts.ts`,
`src/orchestra/prompt-god-template.ts`, `tests/core/workspace-artifact-contract.test.ts`,
`tests/orchestra/workspace-artifacts.test.ts`, `tests/orchestra/prompt-god-template.test.ts`.
The main session is the sole writer for this seam. The two implementation lanes above are disjoint.

### Fresh root-cause evidence — read-only 719 volume probe

Two finite provider-free helper probes mounted only the stopped 719 workspace volume read-only,
with no network/credentials/main mount. The native scan succeeded. Comparing its actual final
metadata with the admitted baseline through the existing compiled containment function produced
only two effects: permitted CANARY-NOTE modify (27→246 bytes), and protected `.deck` add
(empty regular file, mode 0644). Decision HOLD:
`PROTECTED_PATH_CHANGED` and `UNEXPECTED_PATH` on `.deck`, decision digest
`sha256:59463dc4f976502dca55ca1f8315a1d15ee86caddf671bf8e1306c5c8a49d1e4`.
The provider container's `/dev/null` read-only bind at `/workspace/.deck` creates a mountpoint
after baseline capture. Repair must prepare this host-owned empty mountpoint before baseline,
retain the read-only mask, and retain exact containment enforcement. This is fresh diagnostic
evidence, not a retroactively fabricated 719 terminal receipt or successful landing.
The landing lane owns the bounded population-helper correction in its existing backend scope.
`tests/core/execution-effect-containment.test.ts` is additionally admitted to prove unchanged
host-created placeholder preservation and continued rejection of worker-side protected changes.
Additional catalog regression path: `tests/core/model-registry.test.ts` (four stale cardinality
assertions exposed by the fresh targeted run; identity coverage must remain complete).
Budget: one implementation pass plus one independent review; at most one evidence-changing repair
per diagnosed seam. Stop for unknown destructive/external authority or unchanged failure.
Protected: existing runtime/custody/history, raw memory DB, credentials, private keys, unrelated
dirty files. No manual task-state repair, fabricated receipt, blanket capsule admission, commit,
push, cleanup or provider-auth mutation is authorized by this section. Build/restart and live
provider proof retain their specific admission requirements. This capsule is consumed only after
canonical outcome settlement; no completion claim is made by the plan.

### Typed acceptance/read-scope continuation

Fresh source and task evidence shows the prompt prefers `goNogo.items`, while the plan-time
satisfiability gate reads only legacy criteria/description. Sprint-719's typed GO evidence names
two private `.brain` paths absent from declared reads and from its snapshot. This is a planning
contract mismatch, not a demonstrated permission bypass. Repair only the existing gate's typed
GO evidence input and exact read-scope checks; preserve legacy warnings and existing explicit
override semantics. Do not turn NO-GO forbidden-path examples into required reads, infer writes
from evidence sources, expand private mounts, or claim declared scope proves physical delivery.
Exact additional paths: `src/orchestra/scope-satisfiability.ts`,
`src/orchestra/prompt-gate.ts`, `tests/orchestra/scope-satisfiability.test.ts`,
`tests/orchestra/prompt-gate.test.ts`, `src/cli/helpers/messages.ts` for localized findings only.
One isolated writer, one bounded implementation/verification pass. The next actual proof must
use acceptance evidence physically delivered in its authorized snapshot; host readiness checks
remain host-owned and are not assigned to an isolated worker without evidence delivery.

### Source-derived verification fingerprint refresh

After all source writers stopped, the unchanged hermeticity scanner measured zero confirmed
violations, unresolved count 18,159 and production inventory count 1,422, identical to the
existing admitted baselines. Callsite/source-content hashes changed with this scoped patch.
Additional verification-only scope: `scripts/lint-test-hermeticity.mjs`, exclusively its two
computed baseline digest fields (and in-block provenance comments); no scanner, classification,
allowlist, count, strictness or failure behavior change.
Measured unresolved digest:
`b19878db436d00dbeb52177e8a7fdd74d509004bd9627eb389943b4f7684149d`.
Measured production digest after the independently requested explicit-file correction:
`0b6e017231bdfe83a735eac0e277f91bcee898554db4cba86ea52eae5b644a96`.
This measurement is not a claim that unresolved historical test effects are resolved.

### Continuation evidence and remaining gates — 2026-09-05

- Catalog/worker-guide/landing/read-scope fan-in: 18 suites, 649 tests PASS on host with two
  forks. After the single review-driven explicit-file correction, all five affected
  scope/planner integration suites passed (129 tests); these counts overlap and are not summed.
  Final `tsc --noEmit` PASS. Scoped whitespace check PASS. Model-literal, i18n, MASTER projection
  and Closure OS append-only gates PASS; MASTER bytes and HEAD remain unchanged.
  Final source-derived hermeticity gate exits 0 with DEBT: zero confirmed violations and the
  unchanged historical unresolved count; only the measured fingerprints were refreshed.
- Independent source review: worker-guide delivery PASS; landing/diagnostic PASS; typed evidence
  REVISE for root/extensionless explicit file requirements, then PASS after the exact correction.
  These same-provider code reviews are not cross-provider XVerify or settlement receipts.
- A bounded, network-free, provider-free temporary Docker helper executed the actual source
  population program against empty tmpfs source/workspace (no host mounts, no existing volumes).
  First probe input omitted `maxManifestBytes` and was honestly rejected; the corrected probe
  exited 0. Native baseline contains `.deck` as zero-byte regular 0644, plus infrastructure
  directories. Pre/destination/post source manifests match
  `sha256:1039d570f0357fd90cc125ccd0457ec8db75d3b7613bd7ed00a4fe5610b67b22`.
  This is helper proof, not a provider run, full mount-cycle proof, or 719 settlement.
  Only self-created ephemeral containers were automatically removed; no retained run data changed.
- Sandbox Node/tsx subprocess stdin returned zero bytes/EPIPE in one inherited pipe test;
  the identical host suite passed 77/77. No product code or test expectation was weakened.
- Canonical compiled host status already returns ABORTED/FAILED with dead coordinator for 719.
  Retained raw ACTIVE/EXECUTING files are not repaired manually. Durable diagnostics now exist
  in the source contract, but `.tasks`/Terminal/Desktop progress rendering is not closed here.
- `gpt-6-astra` exists in source registry/baseline and preserves Sol tier defaults. Its current
  explicit-active authority is still inactive; no live config, model activation or provider call
  has been performed. Long-context API tariff accuracy is not established by scalar metadata.
- Operating-policy remains HOLD on the four inherited RECOVERY-BORN-716 capsules: no matching
  MASTER row and no `## DONE` section. They were not silently admitted, moved or rewritten.
  Controlled bot stop/build/restart and the exact subscription-only real main proof still await
  the separately requested owner approval. No commit, push, runtime cleanup, receipt fabrication
  or successful dogfood closure is claimed. The bounded Goal remains unfinished.

### Owner-approved live continuation and evidence reconciliation — 2026-09-05

Alperen explicitly approved the requested sequence: reconcile the four inherited capsules under
3357 without new work IDs; controlled bot stop → build/restart → Astra activation → one
subscription-only real main proof run. This live instruction removes the preceding approval HOLD;
it is not a terminal receipt, provider call, blanket retry, commit/push, or closure authorization.
Runtime check at 2026-09-04T22:41:09Z found 719 ABORTED/FAILED, coordinator dead, no running Deckent
worker container, and bot PID 246295 live. Historical 719 evidence remains untouched.

The following original documents are preserved byte-for-byte as evidence attachments, not four
new ACTIVE outcomes. Their historical headings and embedded receipt claims are retained for
traceability, not newly authenticated or promoted by this move. Canonical current scope, DONE
contract and return-to-dogfood boundary remain this capsule and MASTER 3357.

- [Model provenance](../evidence/3357/RECOVERY-BORN-716-MODEL-PROVENANCE-001.md),
  original SHA-256 `44d6eaae684632b90398eccd524ab5e6674aa050e5f0c507b41a9162718ab1c5`.
- [Notification/read-model truth](../evidence/3357/RECOVERY-BORN-716-NOTIFICATION-AND-READMODEL-TRUTH-001.md),
  original SHA-256 `ca2bcd4415bea37a4fb61854d1d64a46f725145a39a51d1480126dccc273d8ad`.
- [Sensitive workspace admission](../evidence/3357/RECOVERY-BORN-716-SENSITIVE-WORKSPACE-ADMISSION-001.md),
  original SHA-256 `373fea267d1b5202ef3d08f2c1557afb2f38848ae37f923fe181f375379c7544`.
- [Terminal digest contract](../evidence/3357/RECOVERY-BORN-716-TERMINAL-DIGEST-CONTRACT-001.md),
  original SHA-256 `ac399cf33bb4aa7de6b89828173bf32f400847943bea8f942c2371c25a21fc10`.

No gate logic or MASTER row is changed. Evidence consumption/removal follows the parent capsule's
canonical settlement trigger; no document or embedded receipt is declared DONE by relocation.

### Controlled build and live proof admission — 2026-09-05

The first approved build stopped before deletion on retained `719-001 EXECUTING`. Canonical
`recover sprint-719 --dry-run --json` identified exactly two restorable task artifacts. Under
the owner's full recovery authorization, `recover sprint-719 --force --skip-audit --json`
performed only the canonical fenced recovery/archive path, with no provider run or live kill.
Global self-audit was explicitly SKIPPED here; the preceding targeted verification remains
separate and no product GO is inferred. Both archived task digests match the dry-run:
`50b0ea3f37957369ab98111d8d3a30f1bd4e34457a0a97668ac40cee67a632da` and
`e15c7b2cfb0d17c9d255bf949bc7d8fd97d82d5bf5e637d620558f5639de3f30`.
Checkpoint digest remains `3631e504f24ae0a3c27fe77e4b7f2ef58939d6c119f0062fd1b4a29793477207`.
The canonical command retired stale live projections; original private custody was untouched.

The subsequent `npm run build:all` passed its clean admission and completed native, TypeScript,
asset identity and Dashboard production builds. Native binary SHA-256 remains
`4e4dd558785cced4688979b219ac2648623f8bbf1f89a9f9fba8abab9913597f`.
Bot restarted from the new binary as PID 319631; canonical bot status reports running.
Canonical CLI activated codex/gpt-6-astra and set only `modes.performance.brain_model` to it.
Fresh active-set authority: executable=true, explicit-active, snapshot digest
`48f053271c2fda17717238ae222d8c4bc7037039c6eccf9701bcbbfb5af5d411`.

The owner-approved main proof is one planned task appending the exact line
`Recovery 3357 isolated-worker append proof 2026-09-05.` once to
`docs/execution/canary/CANARY-NOTE.md`, preserving existing bytes. Original target SHA-256:
`bb4a0d0f500d4c511ae162620127682216d7ddbedb302cc93a90b3b967424261`.
Closed write allowlist is that one file. Worker acceptance reads only its delivered note;
branch/health/host-private evidence and main effect verification belong to the host.
Brain resolves to codex/gpt-6-astra; worker remains config-resolved. Auth remains subscription,
Brain/worker fallback lists are empty. Existing finite execution budgets remain in force.
For this proof only, canonical config writer changed `max_fix_retries` from 1 to 0; restore 1
after terminal outcome. Transient retry is already default-off and rubric retries are 0.
One `do` planning request is followed by inspection and approval/start of that same immutable Flow;
no identical retry, second plan, forced gate or automatic follow-up is admitted by this entry.

### Main proof outcome — Sprint 720, 2026-09-05

Flow `0878bd73-268d-4a72-b190-ab24b9b3aca3`, revision 1, immutable plan digest
`971cb8211f621ef7a86efdd996f6835879ce0767ccf19c430d788784d220de37` passed policy,
scope, topology and plan gates. Configured concurrency 8 resolved to one task in one wave.
The single CLI planning request made **two actual subscription codex/gpt-6-astra
invocations**, not one: `inv-eab6d98f73bda4a7c081e23184189352` transported successfully
(exit 0, 30,728 ms) but consumer validation rejected it; suffix `:schema-retry-2`
transported successfully (exit 0, 31,911 ms) and was accepted. These invocation event
payloads do not carry usage; no provider-reported usage total is inferred from them.

Canonical approval/start created detached job `d2de2f00-8573-4e21-9c0c-be24ca241a37`.
At `2026-09-04T22:55:31.315Z` the Flow appended `RUN_FAILED` with
`DECKENT_E091:spawn-backend-recovery-hold`, before task 720 artifacts or a new worker
were observed. Detached log is
`.deckent/runtime/logs/detached/start-0878bd73-268d-4a72-b190-ab24b9b3aca3-1788562516430.log`.
No successful worker, landing, evaluation or settlement is claimed. Startup recovery
can reject retained private custody even after canonical host task archival; the
generic exception alone does not identify which historical admission blocked this run.
The exact retained-entry diagnosis remains open. No second run/replan was issued.
Canonical config restored `max_fix_retries` to its original value 1 after this terminal
failure. DOGFOOD_HEALTH remains DEGRADED and MASTER 3357 remains OPEN.

Read-only source tracing after this new evidence identifies a startup/preview mismatch:
`reconcileSpawnBackendBeforeRestore` invokes project-wide pending-attempt reconciliation
and throws E091 for any returned HOLD before new task restoration. Plan health checks
pending reservations/admission discovery, not every admitted terminal-effect recovery.
Consequently a green preview does not prove a new worker can start. The 720 log discarded
the structured `SpawnBackendRecoveryHoldError.holds` list; attribution of this particular
crash to one historical entry requires additional evidence, not the generic error alone.

The retained 719 attempt is RELEASED with provider exit evidence, not NOT_DISPATCHED.
Existing historical quarantine expressly requires NOT_DISPATCHED with attemptCount=0;
using it here would falsify execution truth. Existing release recovery requires committed
landing authority, which 719 lacks. A started-attempt failure disposition, if needed,
must preserve original custody and receipts, never land rejected effects, never fabricate
success/no-effect, and must be explicitly admitted before mutation. Neither skipping exact
reconciliation nor changing DOGFOOD_MODE is an acceptable fix. The independent source
review also confirms that private heartbeat/typed diagnostic evidence still needs a
read-only, exact-attempt-bound adapter into the existing shared run inspector; no new
parallel state store is needed or admitted here.

Final canonical `status --json` reports active=false, ABORTED/FAILED for retained
sprint-719, coordinator absent, while readiness still says READY. The exact 720 Flow
event remains the authority for its own failed start; global retained-sprint status
must not be mistaken for 720 execution. Status death-sweep reported no newly closed
Flows. Direct Docker metadata still reports the exact 719 container exited with code 0;
bot status reports PID 319631 running. Canary and MASTER hashes above remain unchanged.
Operating-policy lint passes. Whole-worktree `git diff --check` still reports inherited
trailing whitespace in `.deckent/settings/repl-history:165`; it was not edited here.

### Owner-admitted 720 startup recovery continuation — 2026-09-05

Owner's live `onaylıuotum` admits the exact continuation proposed after 720 failed:
durable structured startup HOLD, an append-only started-failed/unlanded disposition
preserving 719 evidence, and one further real main proof after local verification.
This is a bounded ADR-D-007 continuation of MASTER 3357, not a new outcome, receipt,
handoff epoch or model-auth grant. Base remains `ff2e47564232d05656b8645f4c3fd3449b322dc9`;
MAIN/DIRECT_MAIN, DOGFOOD ON/DEGRADED. Fresh Docker observation: no running exact worker;
719 exact container exited 0/PID 0. MASTER and Closure gates pass (unchanged ledger head).

DAG: read-only exact host fingerprint and recovery contract review in parallel with
safe detached-error persistence; then Store/backend/CLI recovery wiring; independent
verification and scoped tests/typecheck; controlled inactive-run build/bot restart;
canonical dry-run and exact owner-approved failed disposition; one config-resolved
subscription-only canary Flow through worker/landing/evaluation/settlement.

Write ownership: main owns `src/core/task-attempt-custody-store.ts`,
`src/orchestra/spawn-backend-docker.ts`, `src/orchestra/spawn-backend.ts`,
`src/orchestra/sprint-recovery-operation.ts`, `src/cli/commands/recover.ts`,
`src/cli/helpers/messages.ts`, their scoped tests and this capsule. The independent
diagnostic writer owns `src/cli/commands/start.ts`, new
`src/orchestra/spawn-backend-recovery-diagnostic.ts` and its test, plus
`tests/cli/start-snapshot-branch.test.ts`. No concurrent writers share those files.
Any additional production consumer must be named here before editing.

After diagnostic fan-in, the same independent writer owns the CLI recovery,
recovery operation, i18n and their tests; main retains backend ownership. The
Store writer owns only the Store and its test until fan-in. The readonly root-cause
reviewer may write only the new
`tests/orchestra/spawn-backend-docker-dependency-inspection.test.ts`; main applies
the reviewed production adapter patch. Main also owns the existing
`tests/orchestra/spawn-backend-docker-planning-preflight.test.ts` regression.

Negative scope: no raw memory/credentials/signing keys; no original custody, task,
provider result/usage or effect deletion/overwrite; no failed-to-success or
started-to-NOT_DISPATCHED conversion; no landing rejected effects; no skipping
reconciliation; no auth mutation, commit/push, new MASTER work IDs or unrelated feature.
Unsupported platform/custody, live process, stale/sibling identity, tampering, prior
landing intent/commit ambiguity and unknown evidence all remain typed HOLD.
Existing accepted success authority must never be overridden by failed disposition.

Verification: hermetic exact identity/replay/conflict/absence/live/landing guards;
recovery CLI producer → fenced operation → existing Store → planning/startup consumers;
safe path-free diagnostic persistence at exact-child settlement and Flow failure;
targeted suites with maxForks=2 and TypeScript; real built CLI dry-run+mutation and one
normal Flow. One implementation pass plus independent review; new failed fingerprint
may justify scoped diagnosis, never an identical retry or unbounded FIX. Stop at the
next missing authority or failed real proof and retain all evidence. Full dogfood
closure still requires actual accepted effect, evaluation and durable settlement.

### 719 retained-failure publication and return-to-dogfood boundary — 2026-09-05

Owner-approved exact canonical CLI retention completed for dispatch
`dreq-dcb4c063e929090fd2bd434e9fe6d226194990d15b958e1b0fa3f1ece2382a0a`,
task 719-001 / attempt 1329297f-bd5b-8673-8f32-0b35b2784c8d / generation 1.
STARTED_FAILED_RETAINED receipt:
`sha256:59e4a0919ca4a3649e18a360f339689812a6ebd4b5d41d96f0385362ec8cdddf`.
Candidate evidence remains
`sha256:14559e87db07e22e92fedebcdb5d0d3e8cb7308318235b44892edec8f625f145`.
No archive, cleanup, kill, landing or accepted result was produced. Checkpoint, canary
and MASTER hashes remain unchanged. Read-only planning health is now READY with no
unresolved dispatches, receipt
`sha256:47ae96e3bf1ce0408a941fe73857d678fe280096a7a3efbb1390713003491835`.
Bot restarted from the verified binary as PID 367456.

Final hermetic scan exited 0: zero confirmed violations; existing unresolved population
unchanged at 18159, production inventory increased only by the wired diagnostic module.
This is scoped verification, not a claim that repository-wide legacy debt is absent.
The approved continuation now returns to ONE new canonical do/Flow proof with the same
single-file append contract and finite no-FIX budget. No source edits/build/auth changes
are permitted during that live run. Product closure remains HOLD pending real settlement.

### Continuation real proof — exact Flow 05e555b8, 2026-09-05

ONE new `do` request produced Flow `05e555b8-3c9f-4681-a6ab-1216a3fb7648`,
revision 1, plan digest `bac966777d692958d0d63f5ea768c65c781c7d986beefa336ec07d069e868d6f`.
The planner reused sprint/task number 720/720-001: the previous 720 Flow had failed
before task creation. These are DIFFERENT flows; the new attempt is
`dfb434ac-9aff-8c4e-8109-4046cf6a02a6`, generation 1, dispatch
`dreq-1b56201f6e2ca98c30a4488700ecbacea36c5c56214c2063ecc946f18b1dc32e`.
The exact existing proposal was approved/started, not replanned. Scope stayed one
canary file; topology 8 configured / 1 effective. Actual worker resolved Terra/low.

Real Docker container `4991efb1031d` ran 23:48:26Z–23:49:59Z and exited 0.
Provider exit receipt:
`sha256:9c67ab3abe1ef8d6fde5807ee229590dbc6bb52333698ebf6ec050bd1230b4c2`.
Compiled prompt 26013 bytes, digest
`sha256:c4dd811ab47c54d75fab19d37a9fb5f85333e29c25e6bf59c9ac1689c8048dde`:
verified inline worker guide delivered; inaccessible host guide read instruction absent.
Final capture, containment and READY_FOR_LANDING passed; lifecycle receipt
`sha256:bac9629b9c1d54efe82e06ff480da807918f0356fe0d731ce72b285f8538cd51`.

The real proof FAILED before accepted-result collection (0/1). RUN_FAILED event
sequence 7 at 23:50:30.674Z persisted outer `EFFECT_PUBLICATION_HOLD`.
Durable EFFECT_DIAGNOSTIC is more precise: LANDING / LANDING_PREPARE /
PREIMAGE_MISMATCH, receipt
`sha256:140d04be752ae17e1da2ad55b9f337f114de31a5040e7e1c698f965dbefb721d`,
failure evidence `sha256:29534dc382b31f3fd796bebdf989c7983747415df1e6930cc13346f12b5ac6b6`.
Frozen baseline/host comparison: target is 27 bytes, mode 0644, original hash on both;
private final is 81 bytes, mode 0644, digest
`sha256:51d32587afee815d7caf0ad9b2446ba65a66dcb7b9c82650f07ae8bd4d8d8ed1`.
Containment verified exactly one canary modify. Target byte/mode mismatch is excluded;
the diagnostic does not name a failing path. Landing recovery anchor/release authority
are absent. Verified provider-stream/result artifact receipts have not been published;
provider-reported usage is unavailable, not zero.
This does NOT prove an actual host file change: buildOperations collapses multiple
preimage/staging/parent failures into this code. No culprit is inferred without evidence.
Main canary remains its original 27 bytes/hash; MASTER unchanged. No landing, accepted
result, evaluation or successful settlement is claimed. Host task/sprint projections
still showed EXECUTING / ACTIVE-EXECUTE after canonical failure; no manual cleanup.

Separate in-package acceptance finding: the valid typed `file:<JSON string>` locator
is evidence of existence, not proof of its associated prose assertion. This plan puts
the same existing file on two GO items and one semantic NO-GO item. Main and independent
read-only evaluator probes both produced decided=3/5 and decisiveNoGo=true from file
presence alone. This is NOT a real worker evaluation (landing failed first).
An initial agent interpretation that JSON escaping was malformed was disproved by the
executable probe and retracted. Main's START command had already completed when that
correction arrived; this review-ordering failure is explicitly retained, not hidden.
No plan or source was edited live; no kill/retry was issued. The next plan-admission
review must complete executable criterion checks BEFORE approval/start.

Temporary max_fix_retries was restored to 1 after terminal failure. The one-proof
boundary is exhausted: no second run, automatic FIX, recovery mutation, MASTER closure,
commit or push was performed. Outcome remains DEGRADED/HOLD. Next bounded work is
exact landing-preparation cause discrimination and shared diagnostic propagation,
with the contradictory acceptance predicate corrected before another admitted proof.

### Owner continuous-execution amendment — 2026-09-05

Live owner instruction: continue diagnosis, implementation, independent review and
real verification without requesting routine approval between recovery slices until
the owner changes that instruction. This supersedes prior one-proof approval pauses,
not immutable safety/evidence laws. DOGFOOD remains ON/DEGRADED, MAIN/DIRECT_MAIN,
HEAD ff2e47564232d05656b8645f4c3fd3449b322dc9; existing MASTER 3357 remains sole outcome.
No new product promises or MASTER rows are admitted by finding discovery.

Working goal: restore real worker → exact main landing → truthful evaluation → durable
settlement, then reconcile operator observability through existing shared authority.
The host goal tool exposes no objective-edit/reactivation operation; its previously
blocked UI state is not a new task blocker or evidence of completion. This capsule
records the current execution plan without fabricating a replacement goal/receipt.

Current dependency DAG and ownership:
1. Independent native landing cause investigation: exact 720 baseline/final/diagnostic,
   read-only preimage/parent validation; identify staging predicate before changing it.
2. Acceptance lane: preserve explicit file-presence semantics, correct planner predicate
   authorship and reject contradictory deterministic GO/NO_GO contracts before START.
3. Main lane: preserve precise effect diagnostic through production consumers; reconcile
   actual-started READY failure only with typed stopped/unlanded evidence, never zero-worker
   relabelling or deletion of the immutable first failure.
4. Fan-in: scoped tests (maxForks 2 / <=16GB), typecheck, exact policy/ledger/hygiene gates,
   independent review and controlled build/reconnect with no active worker/run.
5. Real proof only after changed failure evidence: canonical do/Flow, immutable plan
   executable-criterion review BEFORE approval, config-resolved finite-budget worker,
   inspect bytes/effects/receipts/evaluation/settlement. No identical-fingerprint retry.

Allowed production scopes are the existing landing coordinator/native adapter and their
typed diagnostics, Docker backend/Store/recovery seam, planner/scope/prompt/criterion
admission producers/consumers, exact associated tests and i18n caller keys. Main owns
the shared Docker backend and capsule; other writers must have disjoint assigned files.
Mechanical hermetic fingerprint updates retain existing unresolved ceilings.
Each changed-evidence slice uses one implementation pass, one independent review and
one real proof; a new failure is diagnosed and bounded again within this authorized goal,
not automatically rerun or converted into new backlog. Same-fingerprint exhaustion
stops dispatch, not all useful in-scope analysis. Auth, signer/ledger, live kill,
destructive cleanup, commit and push retain their separately protected authority.

### Same-outcome semantic closure continuation — 2026-09-05

Component-proof milestone (2026-09-05): the new exact evaluator golden-parity test passed
through genuine Store dispatch admission, lifecycle, staged landing, release and accepted
result into independently matching route/evidence authority. Environment/transport boundaries
are simulated; no actual provider call is claimed. APPLIED/T11 semantic closure remains HOLD
pending durable verifier integration, independent review and the admitted real run.
The same bounded scope includes the pure core acceptance-evidence contract/read-port,
accepted-authority metadata relocation and terminal-protocol framing relocation (compatibility
re-exports preserved), plus `tests/helpers/task-result-settlement-v2-fixture.ts`,
`tests/helpers/exact-acceptance-evidence-fixture.ts` and
`tests/helpers/exact-acceptance-verifier-fixture.ts`. No baseline increase or authority bypass
is authorized; the existing recovery exit/delete trigger remains unchanged.

Owner operating amendment: Astra main owns Brain supervision, process, architecture,
independent review and proof coordination; source and test edits are delegated to
agents. Existing admitted writer lanes finish without a mid-file model handoff;
subsequent implementation routing uses task-appropriate Sol/Terra/Luna capability
and effective admission. For serious uncertainty, optional XVerify may select
catalog ID `claude-fable-5-1` only after effective config, reachability and capacity
admission. This names no available entitlement and changes no current verifier
configuration, provider-separation requirement, approval boundary or safety policy.

The landing/diagnostic/admission slice passed 348 distinct targeted tests across seven
suites, typecheck and policy/MASTER/Closure/i18n/hermetic gates. Compiled source tree:
`7f247b310973d9d2b295929396238b5b8411ebd31496c3ef5fb6ffecf700cfcd`.
Sprint 720 stale task projections were byte-preserved by canonical recovery; the actual
started failure was retained with receipt
`sha256:d7f4dcff5fb0a6ddf8cb78ee58a5a4c85dfb55e545307bfb638e292f462cfccb`.
Planning admission is READY, not outcome completion. No new worker was dispatched.

Preflight found a BLOCKS_CURRENT_DONE consumer before another real proof:
exact accepted-V2 evaluation drops semantic confirmation routing before terminal closure.
It must reuse actual cross-provider invocation, immutable landed evidence and
durable acceptance reconciliation, never synthesize a verdict or use mutable host bytes.

Independent wiring review corrected an initially over-scoped clock finding:
`captureExecutionEffectDockerWorkspaceManifestV1` assumes paired reads share one instant,
but has no production consumer. The candidate fix and nine new tests were removed from
this package after the 37-test probe; this is report-only, not a live proof blocker.
The separately repaired production stage-source fresh deadline remains in scope.

Disjoint implementation lanes within MASTER 3357:
- Main: capsule, independent wiring/security review and verification/runtime fan-in.
- Landing lane: bounded `exact-acceptance-evidence.ts` Store-backed immutable evidence
  extractor/shared contract and tests; no new execution engine or artifact store.
- Security lane: existing cross-verify evidence broker immutable-byte ingress and
  acceptance-decision authority exact semantic/producer/lineage binding plus tests.
- Acceptance lane: evaluation/backend/controller/runner/production-ingress/runtime-bootstrap/
  confirmation-composition/reconciliation-store producers and consumers plus tests. A
  read-only reconciliation consumer is required for restart verification without mutation.

All lanes preserve provider separation, real usage, terminal verifier settlement, strict
claim lineage and path/byte limits. Tests are serialized across lanes. Main landing and
outer COMPLETE remain HOLD until actual worker and cross-provider settlement prove the
entire production path. The bot remains stopped during source/build work.

### Independent fan-in and host coordination checkpoint — 2026-09-05

Correction to the preceding bot statement: exact host PID `3957347` is alive with
`dist/cli/entry.js bot listen`, but `.deckent/bot.pid` is absent. Both sandbox and
host `bot status` report not-running because the canonical PID record is missing.
`MainThread` explains an incomplete `ps -C node` probe, not the product's decision.
Do not start a second listener or invent a PID receipt. Bot/MCP reconnect remains
owner-coordinated; no process was stopped, rebuilt or restarted in this fan-in.

Fable external read-only audit was consumed through hash-verified communication
entries 1/3/5/7 and replies 2/4/6/8. This channel is neither authority nor an XVerify
settlement. The immutable channel rule is preserved and the file remains untracked.
Independent HEAD-export comparison and import inspection attribute all nine current
layer-gate violations to committed HEAD, not this semantic acceptance slice. The
repository layer gate remains FAIL; no layer baseline or allowlist was expanded.

New disk-backed review fixed the post-debt-CAS/pre-APPLIED crash window: freshly
verified reconciliation precedes debt route creation. Four restart cuts preserve
the original request clock and do not issue a second verifier call. REFUTED uses
the existing full-lineage active-to-active debt CAS and settles rejected/NO_GO;
UNCLEAR remains HOLD. One initial post-CAS test returned an uncaptured HOLD; the
subsequent isolated test passed without an additional production fix, so no RCA
for that transient is claimed.

The coordinator's post-lease staged-source, entry-preimage and parent-authority
failures now retain separate mismatch/exception codes and a domain-separated
context commitment, even if quarantine publication throws. The existing durable
diagnostic consumer carries that commitment; it is not a readable raw-path or
expected/observed envelope. Pretransaction retention fingerprints are unchanged.
Targeted coordinator verification passed 35/35 tests. No historical 719 diagnostic
was retroactively fabricated.

Final TypeScript, operating policy/capsule hygiene, MASTER projections, Closure
chain, i18n and acceptance-authority gates passed. Hermetic gate passed with zero
confirmed violations and unresolved count reduced from 18159 to 18157; two dynamic
canonical-artifact corruption targets remain statically unresolved and are bounded
by their real temporary roots. Only measured fingerprints/inventory were updated;
scanner logic and allowances were not weakened. Scoped diff-check passed; global
diff-check still reports inherited `.deckent/settings/repl-history:165` whitespace,
which was not edited.

The first full 11-suite regression produced 128 passing assertions but exit 1 from
two Vitest `onTaskUpdate` RPC timeouts; it is NOT SCOPED_GREEN. The unchanged-assertion,
unchanged-timeout host rerun with one worker and serial files returned 127/128 PASS,
one production-wiring-to-T11 HOLD at its positive settlement assertion, and one RPC
timeout (exit 1). Therefore a sandbox-only or contention-only explanation is not
established. A bounded, single-case diagnostic reproduction is assigned; no further
blind full-suite retry or test-oracle/timeout relaxation is authorized by this result.
The single transparent counted-delegate reproduction passed in 49.63 s (46.87 s
test body), with no thrown Store error. Settlement alone called `readChain` 495,
`readAdmission` 5419, `readArtifactReceipt` 4494 and `readVerifiedEffectLanding` 418
times. Nested method durations overlap and are not additive CPU totals. This is
measured amplification, not proof of the earlier transient HOLD's root cause.

Bounded same-outcome remediation: in `task-attempt-custody-store.ts::readChain`,
retain the late predecessor freshness boundary and validate digest plus timestamp
from that one fresh recursive traversal. Do not cache the early snapshot, cache
across calls, remove artifact/effect/admission checks or change policy bounds.
Independent security review requires predecessor receipt/artifact tamper and
deletion during intervening artifact IO, and tamper between separate reads, to
remain HOLD. The assigned write scope is that Store seam and its existing core
test, plus removal of temporary instrumentation from the existing wiring test.
Failing-first bounded-traversal regression, adversarial verification and one
independent review precede the next full regression; no real dispatch is admitted
by a component PASS alone.

The late-freshness implementation passed the complete Store suite: 150/150,
exit 0, 15.33 s. The first adversarial test version had an inactive adapter hook
because the Store had already captured its method; those four failures were a
test harness defect, not evidence of a production bypass. The corrected hook
executes inside the captured real method, asserts that mutation actually happened
before asserting HOLD, and clears itself in finally. Independent review verified
this correction. POSIX custody adapter verification passed 52/52, exit 0.

The same transparent single-fixture probe after remediation passed in 14.96 s
(12.19 s test body): readChain 116, readAdmission 1145, readArtifactReceipt 935
and readVerifiedEffectLanding 82. Before/after numbers are one fixture comparison,
not an execution SLA or an explanation of historical HOLDs. Temporary timing
instrumentation was removed; assertions still require actual settlement and T11.

The uninstrumented full regression then returned 127/128, exit 1, 169.99 s, with
no RPC timeout. This time the prepared restart cut in the semantic acceptance
suite returned custody-hold at its final settlement assertion. Therefore reduced
traversal cost does not close the intermittent correctness finding. A bounded
test-only transparent delegate records actual thrown Store codes, operation,
stage and already-observed timestamps in the failing assertion; no extra Store
reads, timeout increase, weakened assertion or blind full-suite retry is allowed.
The affected suite is being run once with that diagnostic. Two generic custody
catch boundaries are confirmed; a synthetic fixture clock ahead of wall time
was initially a static candidate. The diagnostic suite passed 13/13 without a
throw, so that run did not identify the historical intermittent failure.

A new Date-only frozen-clock counterexample then failed deterministically in
13.29 s while preserving real timers/IO, production source/confirmation/APPLIED
and Store paths. Captured evaluation time was `2026-09-05T02:33:18.916Z`;
effect-landing and accepted-result chains were `2026-09-05T02:33:19.716Z`,
exactly 800 ms later. The actual thrown Store code was
`CHAIN_PREDECESSOR_MISMATCH`, operation `append-chain`, stage `evaluation`.
This establishes the fixture clock defect, but does not retroactively recover
the missing errors from earlier runs. The bounded correction is fixture-only:
remove artificial clock increments, preserve the admission/committed-time
floor and observe the current clock. The regression must assert no future
accepted timestamp and still require APPLIED, settlement and current T11.
Production timestamp validation is unchanged. Independent fixture review passed,
and the same Date-only test passed in 17.88 s after the correction.

The subsequent combined regression returned 127/129, exit 1, 183.24 s, without
RPC errors. The prepared cuts and Date-only regression passed; the contradicted
semantic outcome settlement and durable archive-artifact restart instead held.
Their initial assertions did not show an exact reason, so these failures are
not attributed to the repaired fixture clock. The existing bounded diagnostic
was connected to precisely those two points. Both passed in an isolated two-case
run (24.43 s) without a captured throw. One affected-suite original-order
diagnostic run passed 14/14 in 151.54 s without a captured throw. Residual HOLD
therefore remains; no further automatic full-regression/fix loop is admitted by
these results. The combined 127/129 result is not replaced by the isolated or
diagnostic passes. External Fable review through ENTRY 22 / reply 23 agrees that
the repaired fixture defect and the remaining uncaptured failures are separate
evidence claims. Environment/root sharing remains an unproved hypothesis.

TypeScript, operating-policy, MASTER, Closure, acceptance-authority,
recovery-truth and i18n checks passed again after the Store remediation;
the final frozen-source hermetic measurement found zero violations, 3086 files,
7 legacy reads and 28235 registry entries. Unresolved count remains 18157 with
digest `af68d4b6226fff404b6b83f5e77ddfe858c5f0716e77b7eeea71b85989375d90`;
production inventory remains 1425 with digest
`0e800533edc83b1faaf0ff2ecaf01e9558ca31c748c8d5c3a27d95b75b66c5a4`.
Only these two measured fingerprints may change; no count ceiling or scanner
logic change is admitted. Final typecheck passed (exit 0). The fingerprint
gate passed (exit 0, 27.72 s, 653 MiB peak RSS) with its existing DEBT label;
zero confirmed violations does not mean zero unresolved legacy sites. Scoped
diff-check and operating-policy/capsule hygiene also passed. The bounded
diagnostic pass is exhausted;
source freeze and DEGRADED/HOLD remain, not recovery or product closure.

Owner continuation, 2026-09-05 morning: the residual test HOLD blocks closure,
not all safe investigation. Prepare one canonical RunFlow diagnostic canary in
this existing outcome after controlled build and host reconnect; no new package,
portfolio amendment or automatic full-suite retry. Even a green canary cannot
promote the package while the two residual failures remain unresolved. The
worker task covers only the canary file's original prefix and exact append;
future host landing, verifier, terminal and archive receipts belong to the
host proof manifest, not circular worker acceptance criteria. Private result
and heartbeat artifacts continue under the existing custody contract.
Fresh inspection found no running Docker containers and the live orphan bot
PID 3957347 with the exact repository listener command. Alperen explicitly
approved SIGTERM, confirmed stop, build:all and canonical bot start. That chain
completed: start token `s74643256` revalidated before SIGTERM at
`2026-09-05T08:32:26.694Z`; original process confirmed gone at 08:32:41.898Z.
The clean preflight returned `CLEAN_ACTIVE_EXECUTION_CLEAR`; no stale run/task
projection was manually deleted. The build replaced generated dist/native
outputs and exited 0, including native, TypeScript, assets and Dashboard.
Recomputed source identity equals the new manifest:
`f4249f64435d24cb7bb1a936c06fc4deac959fae20d1db3b45ad91f4d45a34c8`
(1371 inputs); native source remains
`sha256:ef06f44f070e07061cacb7672e0812a88f44a8235e7002f338c2786f32d69a8d`.
Dashboard large-chunk warning is advisory, not a build failure.
Canonical bot start exited 0; one listener PID 706747 published a schema-2
record at 08:34:57.534Z. Start token and loaded entrypoint/bot-module digests
match disk; canonical bot status reports running. The record's misleadingly
named buildIdentityDigest commits bot-daemon.js, not build-identity.json;
the corrected probe follows its actual producer, with no runtime code change.
Fable independently confirmed stop/build/start via ENTRY 27 / reply 28.
Two old MCP servers (64251, 3019197) still require owner-client reconnect;
the other four previously observed MCP PIDs are gone without a main signal.
Session resume/hook trust remains owner-coordinated before the next canary.
No new worker run, accepted landing, recovery cleanup, MASTER mutation, commit
or push occurred in this maintenance chain. Residual 127/129 blocks closure.
No live provider call, build, new canary, main landing, terminal closure, MASTER
mutation, commit or push occurred in this fan-in. Outcome remains DEGRADED/HOLD.

### Resumed-session proof and exact billing continuation — 2026-09-05

Owner resumed the session. Fresh compiled CLI, not the old Claude-side MCP
processes, produced one plan: Flow `f766b739-a159-4067-944a-f5e00dd67e58`,
sprint 721/task `721-001`, revision 1, plan digest
`9bb6cf25a9914ff492c071b088d6d36efafb43fc3e27cb814bad2c3be80c559d`.
Readonly SQLite payload hash matched; main reviewed exact scope and the
noncontradictory byte-prefix/append criteria before approving/starting that
same Flow. Policy/scope/topology passed; configured/effective concurrency 8/1,
task routing codex/gpt-5.6-terra/low. No second plan or forced gate.

Attempt `ab32ae78-f0c9-845b-8646-af0bb82f0724` had TWO generations. Gen1 was
NOT_DISPATCHED/PRE_MOUNT_ABORTED at 08:58:31.213Z, no provider/mount/daemon
effect; typed no-effect evidence says EFFECT_PREPARATION/ADAPTER_UNAVAILABLE,
compensation COMPLETED. Adapter subtype is unrecorded, not proven warm-up.
The separately bounded NOT_DISPATCHED_REDISPATCH path wrote its one-shot
marker at 08:58:45.814Z and admitted gen2. max_fix_retries=0 disables NO_GO
fixes, not this original-work-item redispatch. Terra independently inspected
the marker-before-spawn/exhausted-check producer in sprint-phases.ts.

Gen2 RELEASED at 08:59:37.266Z; dispatch receipt
`sha256:8e6ad07d20dfa7dac4bf191e7a9dec5a6401214b4f8414c1a625a3f1e3ce3fe6`.
Container `dc668d7d146b9c945214f6972465d42d9935ab932c03574d8eb61a6704288f90`
exited 0, provider-exit observation 09:01:26.249Z. Private heartbeat/result
exist. FIRST REAL MAIN LANDING: exact 82 bytes, original 27-byte prefix
preserved, admitted line appended once, SHA
`8828913e9139319ae4140e0689ee00c96271e5d611beb4906fc79bdfa643c75f`.
Direct byte comparison passed. Landing journal COMMITTED at 09:01:44.000Z,
record digest `sha256:6bf05011aeffde32bbb335d5fd3d1092c724ed34e0faf10cc88cef436250ee0d`,
transaction `96779e4360572dde7caa869717471131315f0f17ddcaa2e928429641b6576790`;
final-verification receipt VERIFIED,
`sha256:03bd734d768c4fe834ccc85987feb894c553856f172be2f45e121ea5fb1f9c71`.
This is effect-journal COMMITTED, not Git commit or task settlement.

Outer Flow RUN_FAILED at 09:02:00.561Z with
`Task 721-001 exact result authority HOLD: PROVIDER_BILLING_UNAVAILABLE`.
Log: `.deckent/runtime/logs/detached/start-f766b739-a159-4067-944a-f5e00dd67e58-1788598614246.log`.
Host ps confirms coordinator 735754 gone; host canonical reader reports
ABORTED/inactive/FAILED/dead, no terminal receipt. Sandbox reader's earlier
ACTIVE/alive result was separated from host namespace evidence. Stale
lock/read-model remain untouched. Canonical writer restored max_fix_retries
0→1 after RUN_FAILED; readback and Fable independent measurement agree.
Landed file effect is preserved, not reverted or replayed. Fable ENTRY 32
independently confirms landing, failure and restore; reply 33 consumes it.

Sol and Fable independently locate a provider-neutrality defect: pristine
Codex stream SHA `64b4824e33f08d1adb1971319fe1ad85fbb22b6766e5618ac126a4c750e32545`
contains turn.completed usage (reported input 113286 including 92928 cached,
output 4209, reasoning 1637; canonical parser fresh input 20358, total 117495),
but no provider USD envelope. extractProviderBillingEvidence requires
total_cost_usd; exact capture rejects null before result acceptance, and
result-ingress currently derives canonical tokens from billing.modelUsage.
Removing only the gate would erase usage or manufacture billing: prohibited.

Bounded ADR-D-007 continuation within existing MASTER 3357, not a new work ID:
separate exact hostTerminalUsage evidence from monetary hostTerminalBilling.
Reuse canonical provider parsers and effective billing/auth capability;
bind actual usage to pristine stream receipt, immutable task/attempt and
policy. Missing monetary evidence is explicitly typed only where the admitted
billing contract permits it; metered requirements stay fail-closed. No $0,
worker-authored usage, synthetic receipt, mutable-host or cold-reread fallback.
Production scope: provider terminal-usage contract/parser seam, exact Docker
capture/accepted-result/cold-reread authority, result-ingress and directly
required result/binding schema types. Associated focused tests only. One
implementation writer, then one independent verification pass; finite
red→implementation→targeted-green budget, no automatic full-suite rerun.
Main must review exact API/scope before writer edits; no adjacent refactor.
Protection: existing landed file, MASTER/Closure ledgers, auth/secrets/memory,
run/task/custody/receipt history and unrelated inherited dirty files.
Return boundary: verified production wiring, controlled quiescent build and
host coordination, then canonical same-effect reconciliation or a separately
bounded fresh proof with changed evidence. Never replay the committed append.
Missing canonical reconciliation authority remains HOLD, not hand settlement.

Hook registration was wrong: nested hooks/hooks.json is not the project
discovery location. Fable reported fixing communication-only .codex/hooks.json
under existing owner authorization, leaving PreToolUse disabled. Main did
not duplicate it or manufacture trust/hook state; manual channel checks
continue. Real hook activation remains reload/trust evidence. ENTRY 30 arrived
during start-tool permission latency; main consumed it on post-action check.
Fable's UNREAD_CHANNEL finding is retained, not erased by a post-hoc claim.

Bounded implementation scope was made exact before each dependent edit:
`src/core/provider-terminal-usage-evidence.ts`, `spawn-backend.ts`,
`spawn-backend-docker.ts`, `result-ingress.ts`, and their focused core,
assembler, mounts and cold-restart tests. Additive `task-result-schema.ts`
provenance was admitted when cold reread could otherwise silently upgrade an
old receipt; generic historical parsing stays optional, new exact acceptance
requires a host-authored marker. Actual TypeScript consumer errors identified
`execution-landing-coordinator.ts` (not the effect-landing coordinator) and its
focused test as necessary additional scope: checkpoint/retirement must bind
usage even without monetary evidence. No other legacy billing consumer is
included. Main confirmed result-collector enrichment is gated off for exact
accepted authority at each callsite; a reported legacy fallback is not an
exact-path blocker. Source edits remain delegated to the single Sol writer.

Fable design review ENTRY 34 and in-progress notes ENTRY 36 were consumed by
main replies 35/37. Raw usage remains losslessly retained in the exact pristine
stream; normalization binds to its receipt and does not double-count cached
input or reasoning. Missing vs rejected usage and canonical project-root
selection are separate typed concerns, not monetary evidence. Main caught a
provenance marker dropped by the intermediate V1 assembler; explicit final V2
injection is required, with worker claims stripped. No green result is claimed
from these in-progress checks. Initial new-unit RED was module-not-found,
not behavioral reproduction; live 721 is the actual pre-fix behavioral RED.

Readonly return-path investigation found two independent constraints for 721:
`EXACT_POST_COMMITTED_CAPTURE_RECONCILIATION_INGRESS_UNAVAILABLE` and
`IMMUTABLE_WORKER_OUTPUT_CAPTURE_MISSING`. Internal cold completion exists,
but current public recover/resume cannot safely invoke it for this ABORTED
attempt; moreover billing failed before immutable worker-result/proposal
capture. A private output path is not an immutable receipt. No new CLI alone
can repair that missing provenance, and neither an internal method call nor a
handwritten result/receipt is authorized. Proposed no-rerun recovery ingress
is design only, not implemented or admitted here. The current source slice
must preserve future valid capture evidence before usage/billing validation
holds where the existing original capture authority permits it. It cannot
retroactively grant original-time capture authority to 721. No recover,
resume, retain-started-failed, new run, effect rollback or replay was performed.

No new package, cleanup, MASTER mutation, Git commit/push or successful
semantic/T11/terminal closure is claimed. File landing works for this exact
canary; end-to-end dogfood remains DEGRADED/HOLD, including prior 127/129.

### Hook activation and billing acceptance verification — 2026-09-05

Owner trusted the communication hooks. Real `UserPromptSubmit` context reached
the main session; hook state records session
`01a06df6-f763-7751-a9c6-d79b187ebb4e` at `2026-09-05T10:16:41.762Z`.
Fable independently confirmed this in digest-verified ENTRY 38, consumed by
main ENTRY 39. Subsequent ENTRY 39/40 writes also produced real PostToolUse
notifications. No synthetic hook invocation or self-trust was used; manual
pre/post-action channel checks remain in force.

Source TypeScript verification passed before the final acceptance correction.
The first four-suite result was 118/121. Newly exposed test defects included
incorrect early-rejection expectations, an out-of-scope digest helper, repeated
immutable retirement stamping, and a second synthetic attempt prepared after
its release time. These were repaired in tests only; production chronology and
first-writer checks were not relaxed. Latest core usage, result-assembler and
landing-coordinator verification: 32/32 across three files, 2.26 seconds.

Independent review found a real missing discriminant check at the hot exact
acceptance boundary. Main rejected a Function.toString spelling assertion as
non-behavioral proof. Its replacement invoked actual acceptance with verified
subscription/no-USD stream bytes and a completion claiming billingMode=api:
the component returned accepted-result instead of rejecting. Main mounts run
therefore returned 89/90 in 3.71 seconds. This is behavioral RED at a component
boundary with mocked custody transport, not a real provider/runtime run.
The same 3357 source scope permits the single Sol writer to reject malformed
not-emitted state/mode/reason/digest/evidence before publication; Terra alone
owns the mounts regression file. No broader billing or retention redesign is
admitted by this correction. Final tests/review remain pending.

The proposed fresh-canary path has an additional measured admission blocker.
Main called compiled, read-only inspectExactDockerPlanningRecoveryHealth;
it returned state=hold for only task 721-001, dispatch request
`dreq-4de1e828f6563e90c433eb7a6ee4fd4701a473ec9a49953734b2d6cf56c2eca7`,
reason STARTED_ATTEMPT_RECONCILIATION_REQUIRED, custodyHoldCode=null,
recovery-list receipt
`sha256:2d8dd17de12d6664004ff708fdaf59bc6866b8a38b4938353997bd42dcf2c88e`.
This is Store evidence, not the stale live read-model. Current source has the
same prerequisite: a RELEASED admission requires cold accepted-result proof
or an applicable retained failure. The unlanded retention contract does not
apply to 721's committed effect. Merely rebuilding the billing correction will
not manufacture its missing original-time immutable worker capture. Fable was
asked in ENTRY 40 to assess the public no-replay remedy or exact authority
boundary; no new retention state, recovery execution, canary, build, cleanup,
MASTER mutation, commit or push was performed. Original FAILED and committed
file effect remain intact; end-to-end closure and prior 127/129 remain HOLD.

### Owner review pause — 2026-09-05, after scoped billing verification

Owner asked to finish the current check and pause for a situation report.
No effect-retained disposition amendment was authorized by forwarding Fable's
ENTRY 41 feedback. Its new custody record/admission semantics remain an
explicit owner decision, not an implementation instruction.

The hot completion-union correction now rejects independent mutations of mode,
reason, state, non-null absent-billing digest and injected billing evidence,
without accepted publication or chain append. Valid subscription/no-USD
acceptance also passes. A test-only cache isolation defect exposed after the
valid branch was corrected by evicting that fixture instance's accepted-result
cache; production caching was not changed. Terra's independent source review
is GO only for this hot boundary correction, not full cold/runtime closure.

Final command: npx vitest run tests/core/provider-terminal-usage-evidence.test.ts
tests/orchestra/result-assembler.test.ts
tests/orchestra/spawn-backend-docker-mounts.test.ts
tests/orchestra/execution-landing-coordinator.test.ts --maxWorkers=1 --reporter=dot.
Result: 122/122, four files, exit 0, 3.43 seconds, local 13:31:00.
Fresh npx tsc --noEmit exit 0. Scoped diff check, operating-policy, i18n,
MASTER projection, Closure append-only and recovery-truth gates passed.
This is SCOPED test evidence, not repo-green or production verification.

Final hermetic gate FAILED with E_HERMETIC_UNRESOLVED_DRIFT:
current count 18163, digest
`b03874d909d4f8e364279b823dbb39cdcb69366eb2035782e526ab4d1e8c9eff`,
baseline count 18157, digest
`af68d4b6226fff404b6b83f5e77ddfe858c5f0716e77b7eeea71b85989375d90`.
The six additional unresolved entries are not yet attributed; no allowance,
baseline-count increase or suppression was applied. Full LOCAL_VERIFIED/GO
is therefore not claimed. Prior combined 127/129 remains a separate HOLD.

Frozen production Docker backend SHA:
`7b555409fef8c28a6a224341ac03ea577d42cdcc4d0c65b9c550c36d8f638303`;
mounts tests SHA:
`deaa9f68f9b1f7ee3d4b2a0bfdeb845bc566e2ada05396c14b4cd7bc1f8ee448`.
Main canary remains 82 exact bytes with original prefix plus one 721 suffix,
SHA `8828913e9139319ae4140e0689ee00c96271e5d611beb4906fc79bdfa643c75f`.
HEAD and MASTER hashes are unchanged. No build, runtime restart, recovery,
new sprint, settlement, cleanup, commit or push occurred in this verification
slice. Source is newer than dist. Work pauses here for owner review; no new
schema/disposition work starts until the exact authority boundary is decided.

### Owner-authorized committed-effect continuation — 2026-09-05

Alperen ended the review pause and explicitly authorized continued execution,
build/restart/new sprint/cleanup/commit/push as required by the reported 3357
recovery path. This admits the proposed bounded disposition amendment in the
same outcome, not unrelated cleanup, a mode change, secret/auth/signer access,
new MASTER identities or fabricated success. Commit/push remain scoped to
verified, attributable changes and preceded by branch/upstream checks.

Fresh baseline: main ff2e47564232d05656b8645f4c3fd3449b322dc9, 149 dirty entries,
MASTER SHA unchanged c8208c566af8cdafe43f5c6d7e1afb26372235cfaee52456b777e3a828279809.
Canonical 721 is ABORTED/inactive/FAILED/dead coordinator, no status conflicts.
Container dc668d7d146b9c945214f6972465d42d9935ab932c03574d8eb61a6704288f90
is still present and Exited(0). This is not proof of released Docker resources.
Its actual phase is COMMITTED_JOURNAL_RELEASE_PENDING: verified journal/final
postimages exist, but no released effect-landing receipt/chain or accepted
result. The new disposition must name that phase rather than require or mint
nonexistent release evidence. Missing original worker capture remains missing.

Bounded dependency DAG and executable scope:

1. Existing billing verification lane: the four previously admitted tests and
   measured-only hermetic registry fingerprint maintenance. No allowance/count
   expansion. Parameterizing coordinator prepare/stamp reduced one unresolved
   site; full scan still has five unattributed additions, not silently closed.
2. Distinct immutable Store disposition using existing atomic first-writer,
   exact admission/recovery authority, policy/root/tenant/fence/idempotency and
   complete preserved-artifact inventory. Files:
   src/core/task-attempt-custody-store.ts and its focused tests.
3. Existing effect Store adapter read-only proof composition, using the READY
   authority/recovery anchor and readExecutionEffectLandingReceiptV1's journal
   and lease verification. No hand-parsed replacement for domain verification.
   Files: src/orchestra/execution-effect-store-adapter.ts and focused tests.
4. Exact Docker stopped-resource and current postimage verification plus
   disposition apply/dry-run and planning/startup consumption. Files:
   src/orchestra/spawn-backend-docker.ts, spawn-backend.ts and their focused
   recovery/planning tests. A retained attempt cannot be restarted or accepted;
   only distinct new work may pass admission after full evidence revalidation.
5. Public CLI/application-service recovery route and truthful existing ABORTED
   terminal/status projections. Files: src/cli/commands/recover.ts,
   src/orchestra/sprint-recovery-operation.ts, src/orchestra/sprint-finalizer.ts,
   src/core/run-status-authority.ts, src/cli/helpers/messages.ts and directly
   corresponding tests. Use existing terminal receipt/schema/authority, not a
   second terminal protocol or manual run/task/lock rewrite. Human text i18n.
6. Fan-in, targeted tests/TypeScript/gates and independent review; then stopped
   runtime build/restart, compiled dry-run for exact 721/dreq/generation2,
   apply only if all real evidence passes, verify immutable bytes and FAILED
   truth preserved, then one fresh canonical canary task with a new plan and
   baseline. Never replay the existing append. Follow exact custody to terminal
   settlement, not merely container exit or test green. Land bounded verified
   Git groups after local verification; no unrelated dirty-tree sweep.

Budgets: one implementation and independent review per lane; only targeted
corrections justified by a new failure fingerprint. One heavy verifier at a
time. One fresh diagnostic canary after the gate passes; its task FIX budget
and dispatch redispatch ceiling are resolved/read back before execution and
restored afterward. No same-fingerprint automatic retry. A failed candidate
read cannot authorize recovery publication, destructive cleanup, release replay
or a replacement receipt. Source/native/runtime contradictions remain HOLD.
All added foundation work is dependency-bound to the CLI→Store→admission and
real canary closure in this same DAG, never independently marked production DONE.

No change is permitted to .brain/memory.db, original attempt/provider/landing
bytes, authenticated closure ledgers, private signer keys or unrelated source.
The 721 host file remains the exact 82-byte baseline. Current-host observation
is timestamped recovery evidence only; it cannot become permanent future disk
authority. Planning revalidates durable disposition and excludes replay; the
old logical task remains failed/unresolved, never zero-work or DONE.

### Committed-effect source fan-in — 2026-09-05, 11:25–11:30 UTC

Root verification used actual test execution, not worker verdicts:
`npx vitest run tests/core/task-attempt-custody-store.test.ts --maxWorkers=1 --reporter=dot`
passed 162/162 (18.72s); CLI and application-service recovery suites passed
26/26 (5.19s). These are scoped source proofs, not production recovery closure.
The first TypeScript pass caught two Store typing errors, three adapter typing
errors and the still-missing backend export. Scoped corrections removed the
Store/adapter errors; a second pass reports only the unfinished backend export.
Root review also caught an always-false canonical byte equality in the adapter;
it was corrected to byte comparison before any runtime invocation. A fresh
adapter proof writer owns the valid unreleased-journal fixture and negative
cases; adapter semantic evidence remains unverified until these pass.

ENTRY 49/51 were digest-verified and consumed. Fable corrected its ambiguous
"container absent" report: exact 721 container remains present and Exited(0),
not running and not released. The six actual artifact receipt timestamps were
read without mutation: READY and final manifest are after provider exit;
latest lease evidence is 09:01:44.704Z. Host canary remains its exact 82 bytes.
No build, restart, retention publication, cleanup, new sprint, commit or push
occurred in this fan-in slice. No source-green result is an accepted result,
terminal settlement or permission to replay 721.

### Build-return dependency exposed by read-only preflight — 2026-09-05

BLOCKS_CURRENT_DONE, same owner-admitted recovery outcome: the actual clean
preflight now reports bot active, stale task 721 EXECUTING, and execution-lock
SCHEMA_MISMATCH. Read-only SQLite inspection proves canonical user/meta version
4 and zero active lock rows; src/core/file-lock.ts also produces version 4.
scripts/clean.mjs still independently creates, migrates and validates version 3.
The failed check is reproducible without running build or mutating the DB.

Add one dependency-bound compatibility lane to the existing build-return DAG:
scripts/clean.mjs and tests/scripts/clean-active-execution-guard.test.ts,
plus directly necessary existing clean build/guard tests. Port the canonical
v4 active-adoption/resumed-quarantine schema, strict validation and atomic
v3-to-v4 migration into the standalone clean authority. Preserve the existing
v2 upgrade path and audit/active rows; prove both canonical-producer directions,
malformed schema HOLD and idempotency. No DB downgrades, direct runtime SQL
writes, validation skips, build bypass or task relabelling are authorized by
this source compatibility lane. The separate stale task projection still
requires a canonical, evidence-bound recovery decision before real build.

The valid pre-release fixture is shared only through the existing
tests/helpers/exact-acceptance-evidence-fixture.ts, with default released
behavior preserved. Adapter/backend writers consume one common production
harness instead of creating substitute proof implementations.

### Canonical preserved-artifact recovery applied — 2026-09-05

Fable ENTRY 54 independently identified the existing compiled recovery route;
its exact digest was verified before use. Root first ran
`deckent recover sprint-721 --dry-run --json --skip-audit`, then, after matching
the three manifest hashes and canonical inactive FAILED authority, ran
`deckent recover sprint-721 --force --skip-audit --json` (exit 0).
The old compiled binary truthfully warned build-source-mismatch; this used its
existing tested recovery route, not the uncompiled new disposition or tsx.

Actual result: zero completed task archives, three preserved residues moved
under .deckent/archive/sprints/sprint-721/tasks/preserved/. Original task JSON,
redispatch marker and skill-delivery bytes all match their dry-run manifest
digests. They remain recoverable under manifest restore semantics; nothing was
deleted as task cleanup. The exact recovery identity was sprint-721 generation
4, attempt sprint-721:recovery:4, fence
39413a4916326d8b4dfbf4463ad98ab05c7e6916f40779ca88246a6b5e34f0b1.

Before/after private custody inventory is identical: 88 regular files,
3,982,594 bytes, sorted path/size/content-digest manifest SHA
19a83f6432b2e28730775efffc60dc6e22163e207a321ad9123d02bfc1b539a6.
Checkpoint SHA remains cef44d22ef11503f0e5127484096bb7952bbba712f16e01aef77fee915b8c3b3;
host canary SHA remains 8828913e9139319ae4140e0689ee00c96271e5d611beb4906fc79bdfa643c75f.
Canonical status remains ABORTED/inactive/FAILED, no conflicts, no terminal
receipt or accepted-result settlement; retired coordinator is now absent.
This is preserved-artifact housekeeping, not the new retained disposition,
not an effect release, not 721 replay and not a successful dogfood canary.

### Source fan-in and bounded compiled-diagnostic return — 2026-09-05

The existing recovery housekeeping remains the only runtime mutation in this
continuation. ROOT verified six suites / 224 tests (Store, CLI, recovery
service, provider terminal usage, task result schema, landing coordinator),
exit 0. The clean v4 compatibility chain passed four suites / 90 tests again
after a provenance-only fixture refactor was found to erase test metadata and
was reverted. No assertion or strict schema gate was weakened.

The genuine Store backend fixture exposed production wiring errors before
build: lifecycle-only adapters cannot read a landing journal; native PROJECT
root identity must authorize the full adapter. An absent retained marker must
return before requiring READY/native authority, preserving ordinary startup
and planning reconciliation. The apply path now reobserves host postimages
after Docker rereads and timestamps publication after that observation.
Independent review also distinguished image-native capability (READY) from
landing-native capability (journal); current native identity now binds through
the canonical landing locator, not an invalid cross-domain digest comparison.
The fixture retains these distinct domains. Retention confirmation no longer
claims that preserved work will be cleaned. ROOT tests exercise real Store and
semantic journal readers, but Docker/native observers remain fixture boundaries;
only the upcoming compiled exact dry-run can prove those actual host boundaries.

Hermetic fingerprint remains HOLD, not waived or rebaselined. The lexical
result-assembler temp-path correction removed one measured unresolved writer;
the clean fixture's attempted provenance correction was reverted when it broke
two semantic tests. A process-local, read-only counterfactual substituted only
HEAD scripts/clean.mjs and measured 18165 unresolved entries (digest
0896ac046421a2e9a4e12a5f51a1842ab488b821cb32abb6d17d0ddeaae4c967).
That is diagnostic attribution, NOT a canonical gate or accepted baseline.
No scanner logic, allowance, unresolved count ceiling or suppression was changed.
The prior two-test residual HOLD also remains open. Neither finding may be
hidden by unit green, a successful build, or a diagnostic canary.

Next step within the same owner-authorized return boundary: after final scoped
tests/typecheck, controlled bot stop, build:all, bot restart and fresh compiled
exact read-only recovery probe. This build is further production diagnosis, not
release/closure approval. Preserve the HOLDs and all 721 evidence; publish no
disposition unless its actual canonical proof is eligible. No old-task replay,
fake acceptance, broad cleanup, MASTER mutation or verified Git landing follows
from source tests alone.

### Real compiled recovery proof and Docker mount-order defect — 2026-09-05

Final frozen adapter/backend/CLI verification passed 27/27, exit 0 (73.26s),
and TypeScript passed. Canonical stop of bot 706747, verified no-active ALLOW,
build:all (native/tsc/assets/Dashboard) and canonical bot restart 1023176
completed. Recomputed source identity matched manifest
84d14592d64a7d4d4087c02a3127ca3515cfd96547cfb33738c087db1ae5f341,
1372 inputs; native source ef06f44f070e07061cacb7672e0812a88f44a8235e7002f338c2786f32d69a8d
was unchanged. Build is supporting proof, not release closure.

Real public compiled CLI dry-run for the exact 721 dispatch returned eligible,
exit 0, COMMITTED_JOURNAL_RELEASE_PENDING / acceptedResult ABSENT /
settlement UNRESOLVED. Evidence digest:
sha256:d96bedd2896125af97957490d3334d46daa5da4f2c9b8507f9344106237b993a;
semantic evidence:
sha256:a6220572f9fd4e30ab2b550bf5bb8598e5444d1e7a934aacb6d54ab6dbc9fb56.
Unlike the fixture, this traversed actual native PROJECT identity, Docker
container and both volumes, original Store journal and current host postimages.

Canonical apply failed before publication. CLI discarded the structured error
subtype; one bounded invocation of the same compiled CLI application function
with safe typed error capture isolated RECOVERY_STOP_REREAD. The generation-2
inventory remained 54 files / 3,600,171 bytes, all original path/size/SHA tuples
identical, no new file; main canary and checkpoint digests remained unchanged.
No disposition, worker replay, result acceptance or terminal settlement occurred.

A read-only backend probe used the real workspace command runner with an
unconditional beforePublish veto and allowed only docker inspect/volume inspect/
ps. It showed that the second container observation differed only in Mounts
array order. Four additional real inspect reads had four different raw hashes;
full JSON canonicalization with only Mounts sorting produced the same SHA
bf4c0c0d5114873ca17b053f4de73d8c63fb821bd0b1d07c360d950f16b82d02.
This is a new measured failure fingerprint, not grounds for blind retry.

The bounded backend correction compares the complete parsed inspect record
with only the unordered Mounts list sorted by canonical code-unit order.
Unknown fields, state, labels and full mount content remain bound; duplicate
destinations/entries fail closed. Raw observation digest is retained alongside
semantic digest. Independent source review passed; ROOT four focused tests
passed exit 0 (6.88s), including reordered mounts accepted and changed running
state rejected before fence/publication. Controlled second build is now the
return step. No scanner allowance, retained evidence or task state was edited.

### Canonical retained disposition and planning unlock — 2026-09-05

Second controlled build:all passed, source identity recomputed as
143c7a69e6ca3d988dc17853d41e467ffb5802e114fdd58cd30c38a2422d77fb
(1372 inputs), matching dist/build-identity.json. Canonical bot restart
published one live process 1047653. Real CLI apply for the original exact
dispatch then exited 0 and published the immutable retained disposition:

- receipt: sha256:6cc6326d78d9f8888e2397b19b5e61ffc12cd6ea24907829e92701290a309510
- phase: COMMITTED_JOURNAL_RELEASE_PENDING
- task/attempt/generation: 721-001 / ab32ae78-f0c9-845b-8646-af0bb82f0724 / 2
- evidence: sha256:d96bedd2896125af97957490d3334d46daa5da4f2c9b8507f9344106237b993a
- semantic: sha256:a6220572f9fd4e30ab2b550bf5bb8598e5444d1e7a934aacb6d54ab6dbc9fb56
- recovery identity: sprint-721 generation4, attempt sprint-721:recovery:4,
  fence 48b839492fff21845c68b1970740f1640b6786afb637d742b6ff6b76747b9f7c.

ROOT compared every original generation-2 path/size/SHA tuple: all 54
unchanged, total 54→55. Only dispatch/effect-committed-release-pending.json
was added (10484 bytes, file SHA
789996df2362e2be889e3e1aa97a5275ffb2c7a2ffcd06429fcca03aa613cb06).
Host canary and checkpoint hashes remain unchanged. Canonical 721 remains
ABORTED/inactive/FAILED, coordinator absent, acceptedResult ABSENT and
settlement UNRESOLVED. No workspace-release, accepted-result or terminal
settlement was fabricated. Fable ENTRY64 independently confirmed full attempt
inventory 88→89 and the same original-byte preservation.

Fresh compiled inspectExactDockerPlanningRecoveryHealth now returns ready,
unresolved [], recoveryListReceiptDigest
sha256:b5440dd41174859feb9dcbd37b2c9ed91f6d12b6627c19edf640e6522c2e179a.
Canonical recovery is thus production-proven for this exact retained phase;
the fresh worker→landing→settlement capability is not yet proven.

The test-only source/duplicate mount regressions passed ROOT 4/4 exit0
(7.53s), with source bytes unchanged. Before new planning, canonical config
set/get changed max_fix_retries from 1 to 0; it must be restored to 1 after
this diagnostic run. The independent NOT_DISPATCHED redispatch path remains
bounded to one marker-backed round and is not misrepresented as task FIX.
One new canonical deckent do proposal is now requested with a closed canary
file allowlist, preserving the existing 82-byte prefix and appending exactly
one distinct fresh-settlement line. No old task or Flow is replayed.
Hermetic and prior residual-test HOLDs still block overall closure/verified
landing; no MASTER, authenticated ledger, commit or push mutation occurred.

### Sprint-722 exact canary — terminal evidence, 2026-09-05

The fresh canonical `do` → `runs --approve` → `runs --start` path consumed
Flow `8a079d36-4c07-4ea0-ab14-3b91223109f7`, revision 1, plan digest
`44cbee3335afe4d9e0ad34705214c687ccd2035676df744ccd15a88696fd8b91`.
The run was `sprint-722`, task `722-001`, worker `w-722-001`, attempt
`04c6a76d-c6b9-8632-8c83-925a95eb4e3e`, generation 1. Routing resolved
codex/gpt-5.6-terra/low; no model override or old-task replay was used.

The actual provider process started in exact Docker custody and exited 0.
The only approved main effect, `docs/execution/canary/CANARY-NOTE.md`, changed
from 82 to 130 bytes, preserving the prefix and appending the exact approved
ASCII marker plus LF (no period). Host SHA-256:
`c095ccc7666606717a03da83e451069f57ae4ca74760634d4ad683254fa55bb7`.
The effect journal reached COMMITTED. Worker self-assessment is not host
acceptance and this byte-exact landing is not settlement.

The next gate failed as `WORKER_RESULT_CAPTURE_HOLD`; collector 0/1,
canonical ABORTED/FAILED, coordinator dead, no terminal receipt. Detached
log: `.deckent/runtime/logs/detached/start-8a079d36-4c07-4ea0-ab14-3b91223109f7-1788612926502.log`.
The private 2514-byte worker result exists but no immutable worker-result
artifact receipt exists. Read-only source and metadata identify a privacy
contract mismatch: private result mode 0644, POSIX capture open-file requires
0400 or 0600. The historical exception was swallowed, so an exact durable
inner error is absent; a fresh read-only production-adapter proof is required
before calling that inner cause runtime-proven.

Following terminal confirmation, canonical config restored
`max_fix_retries` from 0 to 1, set/get exit 0. No old result was chmodded,
rewritten, captured, accepted, or retroactively settled. The stale lock and
task projections remain evidence, not manual cleanup targets.

Owner's latest direction permits a new bounded step when recover cannot
progress. The current step is read-only capture-root-cause and private-output
producer analysis within 3357, with separate source and independent review
lanes. No new MASTER package, schema relaxation, acceptance backfill, old
attempt replay, or fresh canary is authorized by this analysis note alone.
The next execution plan must name the exact producer/consumer changes,
preserve strict custody privacy checks, surface a safe typed failure cause,
set one fresh-canary ceiling, and stop on an unchanged fingerprint. Existing
hermetic and residual-test HOLDs remain open.

### Owner-resumed integrated repair — 2026-09-05, after sprint-722

Authority: owner live instructions to restore dogfood and finish the existing
product contract supersede the intervening execution stop. DOGFOOD remains ON,
health DEGRADED; this remains typed ADR-D-007 recovery under MASTER 3357, not
a new product outcome or a synthetic admission/closure receipt. HEAD remains
ff2e47564232d05656b8645f4c3fd3449b322dc9; canonical sprint-722 is inactive,
ABORTED/FAILED with dead coordinator. All inherited dirty changes are protected.

The integrated acceptance chain is plan/config/scope → isolated worker →
heartbeat/question/answer → immutable result/usage → landed effect → host
evaluation/settlement → dependency-ready/handoff → successor context → truthful
operator surfaces/restart. A single successful file append is only a first
verification checkpoint, not closure of that chain or of Deckent.

Immediate implementation lane (sole writer: committed_store_writer):

- `src/orchestra/spawn-backend-docker.ts`
- `src/orchestra/spawn-backend.ts`
- `tests/orchestra/exact-committed-unsettled-recovery.test.ts`
- `tests/orchestra/exact-docker-private-output-contract.test.ts` if required
- `tests/orchestra/spawn-backend-docker-mounts.test.ts` (existing runner-builder fixture dispatch identity)

Repair the host-authored Docker runner's inherited owner-private creation
contract and preserve typed, safe capture/IPC diagnostic causes through durable
existing observations and reread. Inspect executable/project-mode consequences;
Docker guest semantics are not falsely claimed as Windows-native ACL proof.
Private Store checks stay strict. Do not chmod, rewrite or accept 722's existing
result; no old attempt replay, fabricated usage, acceptance or terminal receipt.

Additional integration evidence: effect COMMITTED currently precedes result
capture/usage/proposal validation. Move those ingress gates before irreversible
main landing; main postimage attribution necessarily remains after landing.
The failure disposition for old committed attempts is unchanged.

Handoff lane (sole writer: committed_adapter_proof) may repair exact terminal-
authority-bound handoff delivery into downstream prompt compilation in:

- `src/orchestra/scheduler-effects.ts`
- `src/orchestra/task-builder.ts`
- `tests/orchestra/handoff-prompt-inject.test.ts`
- `tests/orchestra/exact-accepted-result-terminal-authority.test.ts`
- `tests/orchestra/scheduler-spawn-executor.test.ts` (real registry-to-compiler harness)

The current controller creates `.tasks/handoffs` only after EXECUTE collection,
which is too late for continuously dispatched successors. Exact dependency
context must carry accepted handoff data at spawn time, respecting worker_comms
config and rejecting stale/sibling/failed authority. Public mutable handoff files
must not replace exact authority; legacy behavior remains compatible. Result
schema preservation must be verified before claiming this wiring complete.

Operator projection lane (sole writer: canary721_premount_cause) may repair
the proven shared inspector/CLI schema mismatch in:

- `src/core/run-inspector-read-model.ts`
- `src/cli/commands/inspect.ts`
- `src/api/server.ts` (inspector DTO forwarding only)
- `src/mcp/tools/inspect.ts` (inspector DTO forwarding only)
- `src/cli/helpers/messages.ts` (only inspector EN/TR keys)
- `tests/core/run-inspector-read-model.test.ts`
- `tests/cli/inspect.test.ts`
- `tests/api/sprint-inspector-endpoints.test.ts` (additive shared DTO conformance)

The real compiled `inspect 722-001` rendered Task ID/Status/Agent/Model as '-'
because the core emits `task`/`hb` while CLI expects flat fields/`heartbeat`;
follow similarly mismatches `workers` and nested canonical lifecycle. Consume
the real DTO, preserve JSON compatibility, and expose canonical run status/cause
separately from stale task projection without inventing task terminal success.
Add current-run association checks before attaching run truth to a historical
task. API/MCP/Desktop consume the shared additive DTO; verify their unchanged
contracts. No private bytes enumeration or policy-bypassing log publication.
An authorized operator's eventual content access is distinct from accepting
worker-authored content as authority; do not impose a blanket product ban on
viewing private logs/prompt. This lane does not claim that access implemented.

Producer decision: provider process global umask is rejected because native
effect manifests preserve project modes. The runner must seal byte-identical
untrusted lifecycle draft output into a distinct owner-private namespace,
bound by immutable dispatch contract, with bounded no-follow stable-handle
read, owner/type/link-count validation, exclusive first-writer publication,
fsync and digest reread. This is not model-result acceptance authority. No
old attempt automatically migrates or has its bytes/permissions rewritten.

The live IPC continuation must not retain the existing hardcoded sequence 1.
Additional IPC-core lane (sole writer after handoff freeze:
committed_adapter_proof) owns:

- `src/core/task-attempt-custody-store.ts`
- `src/orchestra/ipc-registry.ts`
- `tests/core/task-attempt-custody-store.test.ts`
- `tests/orchestra/ipc-registry.test.ts`

Define the Store-owned bounded contiguous conversation cursor and exact
unique-sequence question/answer identity, first-writer/reread and stale
publisher revocation; preserve stable old attempt history and fail closed on
gaps/replay/parallel outstanding or unverified source identity. Agree the DTO
with the backend writer before implementation. No process-local counter may
replace durable restart truth, and no task-number/sequence literal workaround
may claim multi-round IPC. Core must not import orchestra. Linux/macOS/Windows
adapter privacy semantics stay distinct and honest; this Docker producer does
not claim unsupported native-host runtime proof.

After handoff source freeze, operator lane may own the narrow diagnostic fan-in
in `src/orchestra/scheduler-effects.ts` and
`tests/orchestra/scheduler-spawn-executor.test.ts`. The backend's verified
captureDiagnostic currently gets dropped when registerPending stores only
outcome.reasonCode. Preserve exact query-bound, strict safe typed cause for
collector/controller canonical reason and inspector consumption. Retain the
base reason for policy comparisons; never expose arbitrary messages/paths or
accept sibling/unbound diagnostic metadata. Coordinate cold recovery projection
with the sole backend writer. No concurrent writer on scheduler-effects.

Independent lane: trace exact capture/acceptance/settlement/dependency/handoff
and IPC/visible-state consumers; report blockers with locations and inspect
the implementation diff. Root owns integration, operator visibility inspection,
all heavy verification, build/restart and canonical runtime mutations. No
additional hotfile writer or further source scope without an explicit bounded
root integration decision. Fable remains external read-only auditor.

Finite verification: targeted real producer subprocess + strict rejection
regressions, combined affected consumer suites and typecheck; then quiescent
build/restart. Preserve/reconcile 722 with the already-proven canonical
committed-unsettled disposition only if its exact evidence passes. Permit at
most one fresh task for the changed producer fingerprint. If it settles, verify
a dependent/parallel communication workflow before calling dogfood operational;
if it repeats the same failure, stop runtime retries and retain the exact cause.
No broad product release, skill rewrite, baseline suppression or whole-worktree
commit is authorized by this continuation. Prior residual-test/hermetic HOLDs
remain explicit and cannot be hidden by a successful runtime check.

### Integrated repair checkpoint — 2026-09-05T14:00Z

Root combined verification passed 7 suites / 108 tests (6.49s): shared
run-inspector read model, CLI inspect, MCP inspect, API inspector endpoints,
handoff prompt injection, exact accepted-result terminal authority, scheduler
spawn executor. This includes exact task/run association, live follow state
changes, current failure versus stale raw task status, terminal-bound handoff
notes, stale/sibling/tampered terminal rejection and legitimate recovery.
The first failures were addressed at their causes: nested fixture attempt
identity, canonical serialization order, and additive API DTO expectations.
This is scoped supporting proof only; build/native run verification is pending.

The previously compiled canonical `recover sprint-722
--retain-committed-unsettled <exact-dreq> --force --skip-audit --json`
completed exit 0 after an eligible dry-run. State is retained,
COMMITTED_JOURNAL_RELEASE_PENDING; acceptedResult ABSENT, settlement UNRESOLVED.
Receipt: `sha256:4b6b384a1b8bcb7401510c141ef83c8489b067d7c4325bd12db180458b439c18`.
Evidence: `sha256:2dedb8efbdfbb3dcdea7eaa821943ec6ba8f4ec7d7b688d318f6dfbdf40b22de`.
Semantic: `sha256:cada2cf67e0e45f0d3289c82ba2909727731a0948d2eff2717429fd2f0d0e552`.
Recovery identity sprint-722 generation 2, fence
`0e91bc7fa7cc82403aba92c10335c4111a932510a7665c194894fe653e8a9079`.
Original 54 attempt files / 3,594,199 bytes retain every path/size/digest;
exactly one disposition file was added (54 → 55). Host canary remains 130 B,
SHA `c095ccc7666606717a03da83e451069f57ae4ca74760634d4ad683254fa55bb7`.
Fresh compiled planning preflight is ready, unresolved [], receipt
`sha256:546c21ec372f4b0937c0c65c6cbf7360b7422b8136c1458d4d7d5608ea6180dc`.
No old attempt replay or accepted-result backfill occurred. Source is ahead of
dist during the implementation lanes; this used the preceding proven recovery
binary and is not fresh-source runtime proof. No new canary/build/commit/push.

### Integrated verification / recovery checkpoint — 2026-09-05T14:26Z

The next root combined run passed 332/333 tests across nine suites; the one
new cold-rehydration assertion omitted existing nullable result/settlement/path
fields and was corrected without changing production behavior. A separate
backend run passed 122/135; its 12 mounts and one IPC fixture failures remain
under exact diagnosis, not waived. New IPC restart evidence requires completed
durable-effect outcomes for cursor records, answer-delivery/cursor repair, and
source-identity transitions instead of polling for an absent question file.
These are BLOCKS_CURRENT_DONE within the existing producer/IPC contract.
No new host-native capture API, privilege architecture or product outcome is
admitted. Provider-authored sealed bytes remain untrusted requests/results;
only host Store receipts, cursor CAS and answer/acceptance policy give authority.

Canonical `recover sprint-722 --force --skip-audit --json` completed after
its exact dry-run. Both task artifacts were preserved in
`.deckent/archive/sprints/sprint-722/tasks/preserved/` before retiring their
source projections. Their digests remain `6b28549d8c85af637d87b73e53aac0e535b1dd039af4e06d0fe2d6f9e9861176`
and `186b8cb1282237ce6ab43fafa6c9706683f5dbdc906a57a743ec41d999187ef0`.
The checkpoint remains `a4dbda27ccc2c817be124b1b204c777c63dd14e08beecfb8574084b9011edf99`;
the host canary remains 130 bytes / `c095ccc7666606717a03da83e451069f57ae4ca74760634d4ad683254fa55bb7`.
Fresh build guard no longer reports E_CLEAN_TASK_ACTIVE; its only remaining
reason is the owned Telegram bot, to be stopped canonically at source freeze.
No new build, sprint, commit or push occurred. This is not task acceptance or
successful settlement of 722.

### Frozen build and fresh dispatch boundary — 2026-09-05T15:10Z

Root final combined verifier: 14 suites, 471/471 PASS, 30.72 seconds.
TypeScript exit 0; scoped diff check clean. This includes real POSIX private
output capture, safe seal-failure cause, multi-question IPC, 256 bounded cursor
transitions, cold partial-answer repair, inspector/API/MCP DTO and handoff gates.
The 256-transition test measured 10.758 seconds for 2,054 publications and
4,116 durable effect markers; its explicit 30-second test budget does not alter
runtime policy. Earlier residual evaluation-settlement and hermetic HOLDs remain.

Canonical bot stop retired pid 1047653; fresh clean admission was ALLOW with
no reasons. `npm run build:all` completed exit 0 (native, TypeScript, assets,
Dashboard); canonical bot start completed exit 0 with pid 1298005.
Build source-tree digest: `b8af68ad50920cbbc853e1b51422dbb4c87da06c110c5cd2100e4b9ff679bb26`
(1,372 inputs). Native binary digest remains
`4e4dd558785cced4688979b219ac2648623f8bbf1f89a9f9fba8abab9913597f`.
Fable ENTRY 90 independently confirmed source/dist freshness, unchanged five
source fingerprints, and the new bot's schema-2 pid/entrypoint identity.
Existing external MCP client reconnects are not claimed verified; fresh CLI
processes are used for this proof.

Owner `Devam` continuation: original `max_fix_retries=1` was read through CLI;
temporary canonical value is now 0 for one new proof attempt, restore 1 at its
terminal boundary. The new `do` request admits exactly one canary-file task,
appending `Recovery 3357 sealed-output settlement proof 2026-09-05.` once while
preserving existing bytes. No 722 replay, no inaccessible worker GO evidence,
no provider override. Plan inspection precedes canonical approve/start.
Private heartbeat/prompt/log operator read-path is still unproven and must not
be reported complete merely because DTO/lifecycle fixes or this canary pass.

### Sprint 723 terminal and same-package producer closure — 2026-09-05T15:30Z

Flow `e864e41f-0c14-481a-9361-17191d4cff6f`, revision 1, plan digest
`ab99eb504e11ea96052a417272bcd8d04b6f86936983578a5f7fdf8a735d7dc0`,
task `723-001`, attempt `3fab6134-d4ae-8aea-804a-ef8191634c87`, generation 1,
dispatch `dreq-a10a96171fc8d25fdbbf93160344da8c20b2daf5d354db4a6d870cba11913329`.
Actual provider execution began 15:16:20.410Z; container exited 0 at
15:17:56.968Z. Provider-reported usage: input 110395, cached 89856, output 3525,
reasoning 834. Raw result 3460 B / 0644 was copied byte-identically to the
dispatch-bound sealed result 0600, then captured into immutable Store artifacts
0400. This is the first live proof of the repaired result producer contract.
No seal-failure marker; pristine provider stream 18979 B was also captured.

The run FAILED with `LANDING_PROPOSAL_CAPTURE_HOLD`, no accepted result or
settlement. Main remains 130 B / `c095ccc7666606717a03da83e451069f57ae4ca74760634d4ad683254fa55bb7`.
Durable worker notes and provider stream identify `MODULE_NOT_FOUND` for
`/workspace/dist/agents/landing-proposal-entry.js`. The git-inventory private
snapshot excludes ignored `dist`; the prompt nevertheless required that helper.
No proposal file exists. This is a real producer/ingress wiring omission, not
evidence that the earlier 471 tests proved production closure. Canonical run is
ABORTED/FAILED, coordinator dead, conflicts empty. CLI restored max_fix_retries
to its prior value 1, then read back 1. No old attempt replay occurred.

The owner continuation covers this exact BLOCKS_CURRENT_DONE defect within
3357; no new outcome, helper engine, custody class, or broad refactor is admitted.
Additional exact write scope: `src/core/execution-landing-proposal.ts` and
`tests/core/execution-landing-proposal.test.ts`; existing backend/private-output
and scheduler-diagnostic scopes remain. Legacy proposal protocols stay unchanged.
The exact V3 prompt writes one complete untrusted JSON draft directly; the
existing sealer gains a layout-schema-V2 landing output. Storage namespace stays
`sealed-output-v1` because its directory format is unchanged; manifest schema
version must never be inferred from that path. Old layout V1/null reads remain
compatible. Capture/validate result and proposal before any native main commit.
Missing/privacy/malformed causes must cross backend and hot/cold scheduler
readers as typed `LANDING_PROPOSAL_CAPTURE_HOLD`, never a swallowed generic cause.

The complete output-family proof contract is:

| Family | Producer / transport | Consumer / authority boundary |
|---|---|---|
| Prompt / guide | Immutable compiled prompt, guide inline with digest | No guest dist or WORKER-GUIDE file dependency |
| Result | Untrusted draft, stable raw-byte seal, private 0600 output | Store capture; host acceptance remains separate |
| Landing proposal | Untrusted V3 draft, same seal mechanism | Store capture + canonical task/dreq parser before commit |
| Question / answer | Unique sealed questions and contiguous Store cursor; host answer delivery | CAS, durable publication, restart repair; no worker answer authority |
| Heartbeat | Runner activity observation | Never settlement; private-to-operator read path remains residual |
| Partial / timeout | Runner diagnostic/fallback signals | Never accepted result or successful terminal authority |
| Seal failure | Bounded allowlisted diagnostic | Can force typed HOLD only, never create success |
| Provider stream / usage | Host Docker stream capture | Immutable Store evidence, never inferred from worker claims |

Exact V3 has no pre-exit proposal reader: monitorExactDockerCustody consumes
after observed provider exit. The separate legacy monitorContainer budget flow
is not changed. A new periodic proposal-journal subsystem is not needed here.
Proof must cover absent/0644/malformed/torn proposal, wrong identity/path, V1
compatibility, and a complete new-layout subprocess output→capture→parse chain.
No next canary before this producer/consumer proof; no unit-green closure claim.

Canonical started-failed dry-run for 723 returned eligible, evidence digest
`sha256:bd8ebdd0064a47eecbe166255455918b8a4501ae52e343a7105ae978b198d1a8`.
This existing type means started but unlanded/unaccepted failed execution, NOT
NOT_DISPATCHED. Store preserves worker-result artifacts and forbids effect
journals/accepted-result/settlement; no new disposition semantics are admitted.

### Sprint 723 retained evidence and source compatibility — 2026-09-05T15:52Z

Canonical started-failed retention applied with receipt
`sha256:e7f53ced41fb82003d27d49bca52df2b0e7b18d43214ec764528df4964a5c3b1`.
All original 33 custody files (2,140,396 bytes) retained identical path/size/SHA;
their sorted JSON inventory SHA is
`96ea00414e9ac81b769faab5ea73bef2dda0594b1cf0b355a814d28d6f3d0c20`.
Only the canonical retention record was added (4,504 bytes). Fable independently
recomputed that inventory. Fresh planning preflight returned ready/unresolved[].
Generic canonical recover then preserved the task JSON and skill-delivery file
under `.deckent/archive/sprints/sprint-723/tasks/preserved/`, plus the canonical
pre-archive tar. Source task projections were retired by recover, not manual deletion.
Checkpoint SHA `99bad42d7e2cd8d82ad6505566888783286deae1ea00a1337e82987c2349327c`
and MAIN canary SHA `c095ccc7666606717a03da83e451069f57ae4ca74760634d4ad683254fa55bb7`
remained unchanged. This is retained failure, never accepted success.

At 15:51:29.726Z, a read-only ViteNode source probe invoked the production backend's
`openExactDockerRecoveryStore(create:false)` → `listDispatchAdmissions` →
`reconstructExactDockerRecoveryScope`, including full exact prompt suffix parsing,
immutable snapshot digest and identity checks. No snapshot mutation or dispatch:

| Task / generation | Layout | Parse | Immutable snapshot SHA-256 |
|---|---|---|---|
| 719-001 / 1 | legacy null | PASS | 79b497aff6250d806506aeb72db5fc639476ff64ba0e6110e858fcf69cf174bf |
| 720-001 / 1 | legacy null | PASS | 9d164c82c15665de6e6ccc6c139d10d1b80645df0d17cf6eb86cbb1b5ad9b9a8 |
| 721-001 / 1 | legacy null | PASS | e9da09c870f640dfe1a37638b7955c33018bfab9c93dfd97d3b922c9733d9d88 |
| 721-001 / 2 | legacy null | PASS | 0aed1ff9be78967574306e82a847fda0828dddd119d2e55af43a222ad57fa2f4 |
| 722-001 / 1 | legacy null | PASS | b94fde67adddac1e44ce2f4be74182567e42a43d8838c270a368e7ba205952df |
| 723-001 / 1 | V1 | PASS | 232ea014fa8f6c1f52992a02e5cbefc61d787f0af0ef63c2598a5b02f3bf812e |

Source TS passed. Initial seven-suite run passed 195/197. The absent-draft failure
was initially misclassified as fixture drift: independent source review proved
the parser rewrote a durable `operation:capture` into `seal`. Production now keeps
the already-validated operation, and the original test expectation remains capture.
The second failure was a missing newly-required `landingRequired` fixture input.
No production gate was loosened to fix either failure.
Final combined verification: TypeScript exit 0; 16 suites / 500 tests PASS,
28.44 seconds. Scope includes custody Store, IPC registry/backend, sealed private
outputs, recovery, scheduler, Docker/mounts, landing proposal producer/consumer,
handoff, terminal authority and CLI/API/MCP inspector consumers. Final backend
SHA `492cff5924b260591ca3ee8a512bb915d295455b88250a488696188b7c9e22c2`.
Independent adapter-chain reviewer found no additional blocker after the exact
operation correction. This is LOCAL_VERIFIED, not production settlement.

Canonical bot stop retired PID 1298005; clean guard ALLOW/reasons[] and canonical
inactive ABORTED run established the safe build boundary. `npm run build:all`
completed successfully (native, TypeScript, assets, Dashboard); regenerated dist
artifacts are recoverable build outputs, not removed task/receipt evidence.
New-layout real execution and operator visibility closure remain pending.

Pre-dispatch plan review rejected Flow `29f3b981-2767-4b12-900c-bae44f9da735`
(plan digest `1b749cfa4a77769ec9398478154de1e677ed9cdd72008cd969434590b53ecc72`):
root's outer proof wording became worker criteria demanding that same task's
future host acceptance/terminal settlement. Canonical `runs --reject` closed the
unstarted proposal; no worker, Docker attempt or failed execution was created.
Replacement intent explicitly limits task criteria to local bytes and tsc evidence;
host landing/acceptance/settlement remain the supervisor's subsequent proof gates.
This corrects plan admission, not an exemption from production closure.

### Sprint 724 exact landing, acceptance mismatch and protected continuation — 2026-09-05T16:20Z

Fresh Flow `591a6ff1-8cc9-4dc8-b0a2-e2cf49144882`, revision 1, plan digest
`aef219457192f0d90f05494e0836367d3ad7e7b2b103df68cc8e4f476db1bd5d` admitted
one task `724-001`, worker `w-724-001`, config-resolved codex/gpt-5.6-terra/low.
Attempt `63e1b622-7e30-8de2-8e76-fbb5cd238b83`, generation 1, dispatch
`dreq-9e6ba7943e713e958a46880df6ee03ffb1c3a93ebed792e13029d4afd2ab2c15`.
Build source tree SHA `65620757cc3997623682a819353bf165a320d673fc422fa7e784f873b9d38efa`;
bot 1455799 restarted and independently verified against this compiled build.

Real private output V2 worked: result 3,174 B and landing proposal 562 B were
provider-authored, runner sealed to 0600, then Store captured to 0400. No seal
failure marker. Provider exit 0 at 16:07:27.860Z; reported usage input 89,735,
cached input 70,656, output 3,736, reasoning output 909. Pristine stream 18,609 B,
SHA `9e6d6152687fa20312cf86c66bea464333f8f9c9f190b72d697f65e014f3ec83`;
production billing extractor returned null (subscription, no emitted price).

Native landing journal reached COMMITTED at 16:07:43Z. MAIN is exactly 187 B,
SHA `3a40f4d925a6a14be18cc3b7ef0501601b30a848dd12e3f1898c58134b7e2942`;
original 130-byte prefix preserved. Host-work attribution persisted 16:07:52Z,
workspace release 16:09:57Z, `chain/01-effect-landing.json` 16:10:00Z.
Acceptance then failed: `.brain/ERRORS.md` at 16:10:21.284Z records
`EXACT_DOCKER_COMPLETION_IDENTITY_MISMATCH`; scheduler projected
`EXACT_ACCEPTANCE_FAILED`. Flow RUN_FAILED at 16:11:11.348Z. Coordinator1474702
is dead; canonical ABORTED/inactive/conflicts[]. No accepted result or terminal
settlement exists. Root restored `max_fix_retries=1` via canonical set/get.
Task EXECUTING projection, private heartbeat/log invisibility and missing critical
error projection remain explicit defects; no completion claim or forged terminal.

Confirmed producer/consumer defect: hot and cold completion producers omit
`evidenceDigest` from the subscription `not-emitted` billing variant; acceptance
requires that exact field with null. Public completion type also omits it, while
the handwritten acceptance test fixture supplied it and masked the mismatch.
Same-package correction requires type + both producers + a production-fed
hot/cold completion→acceptance regression, not a weakened consumer gate.

Protected no-rerun continuation: direct `resume` was investigated but NOT invoked.
Read-only `deriveResumeDisposition` on the real 724 checkpoint returned
`resumableIds:[724-001], parkedSettlements:[]` because public result is absent.
CLI currently resets before its exact-task check, and the resumable builder branch
returns before that check. Therefore it cannot establish a no-redispatch guarantee.
Existing CLI exact discriminator and preserved pending-settlement branch must be
wired before reset/kill/rotation; no new disposition type or authority source is
admitted. Bounded write supplement: `src/cli/commands/resume.ts`,
`src/orchestra/sprint-checkpoint.ts` and their existing tests, one Terra writer;
Sol owns the Docker integration test, the backend writer owns completion producers.
Root alone runs verification. Preserve 724 MAIN effect, all private artifacts,
checkpoint and task bytes; no retention, replay, cleanup or new canary until the
fixed acceptance plus exact no-rerun continuation is proven.

Failing-first regression reproduced the live acceptance error at production
line14241. The type and hot/cold completion producers now carry the required
null sentinel; separate host-ingress billing schemas are unchanged. Expanded
production-fed positive tests pass subscription landing-captured hot and cold
completion→real acceptance, plus API available-billing hot completion→acceptance;
negative tamper cases remain rejected. Resume tests went 4 RED/60 PASS before
wiring, then 66/66 PASS including discriminator-HOLD/no-mutation behavior.

Read-only new-source probes against real 724 custody, not fixtures:
- 16:27:10.951Z cold completion = `landing-captured`, proposal sequence2,
  correct result/proposal receipts and billing `not-emitted/evidenceDigest:null`.
- 16:27:48.200Z CLI production discriminator + real checkpoint derived
  `resumableIds:[]`, `parkedSettlements:[724-001 pending-settlement]`.
These are source-read proofs; compiled resume and settlement remain pending.

Protected pre-adoption inventory at16:30:37.599Z: 104 files / 4,883,131 B,
SHA256(JSON.stringify(sorted {path,size,sha} rows))
`d9a598fb8817bbc0a95d0be028e50cf8fe53d7a6b490096edafb78ad739d092b`.
Generation-relative paths sorted with localeCompare. Checkpoint577B SHA
`fd64c560f004a99b3cf939a04e557003f9ff36b5187f6c9604a2ae4f6d385781`;
task14448B SHA `13d807b2094bb61e8502cc0415f0faf929c90294fb4347ba62d859529dd78e4e`;
skill570B SHA `cdcc048cca4bba7f261b5e396c36597c45cb82b7f44b087bbe4f568851f49bc0`.
The original Flow RUN_FAILED history must remain, even if a later canonical
resume closes the exact task through a distinct durable continuation outcome.

Joined settlement gate: first22-suite run603/604PASS, one terminal-chain HOLD;
isolated case passed. A diagnostic-only joined rerun602/604PASS exposed the
actual predecessor violation, not an inferred environment-isolation cause:
`appendChain/archive CHAIN_PREDECESSOR_MISMATCH`; archive16:39:02.841Z was768ms
before settlement16:39:03.609Z. A second archive-restart case had archive
16:39:33.916Z before settlement16:39:34.128Z by212ms. Earlier stage timestamps
were durable Store observations. Production evaluation-audit-trail independently
samples wall time at evaluation/finalizer/settlement/archive and does not clamp
new publication times to the verified predecessor. Backwards clock behavior can
therefore reject valid work and leave an immutable unchainable archive artifact.

Same-package bounded write supplement: `src/orchestra/evaluation-audit-trail.ts`
and existing `tests/orchestra/exact-accepted-result-evaluation-settlement.test.ts`,
one backend writer. Require deterministic falling-clock RED proof followed by
predecessor-bound causal publication timestamps across all four stages, full
T11 reread and crash replay. Never rewrite an existing artifact or relax Store's
time/identity checks. 724 has no archive tail yet; its104 protected files remain
unchanged. Build/resume withheld until this proven settlement defect is corrected.

### 724 pre-resume verification and maintenance boundary — 2026-09-05T16:58Z

Final source freeze passed TypeScript and 22 targeted suites / 605 tests in160.77s.
The falling-wall-clock regression failed before the causal predecessor-bound fix
and passed after it. Independent source review found no new blocker. This is
SCOPED_GREEN, not product closure or repo-wide green.

724 remains canonical ABORTED/inactive, coordinator1474702dead, container absent;
bot1455799 was stopped by canonical CLI. The104 original attempt files still hash
to d9a598fb8817bbc0a95d0be028e50cf8fe53d7a6b490096edafb78ad739d092b.
Checkpoint, task/skill-delivery and187B landed host file retain their recorded hashes.

Legacy clean preflight rejects the stale EXECUTING task projection with
E_CLEAN_TASK_ACTIVE. Generic recover dry-run was read-only; no recover apply or
restore occurred. Archive/restore is not selected: recovery clears matching
sprint-state, while resume's parked-settlement branch requires that exact state.

Use the existing committed `node scripts/build.mjs --scope all` transactional
build ingress under its real canonical maintenance lease, source snapshot,
staged artifact validation, fenced publication and retained prior-dist backup.
No injected authority, clean-guard edit, task/state relabeling or bypass option.
The native artifact lives outside dist and its source/binary hashes are unchanged
(ef06f44f... /4e4dd558...); this build does not claim a native rebuild. No live run
may be admitted during maintenance. Any maintenance authority failure stays HOLD.
After build: remeasure original evidence and source/dist identity, restart bot
canonically, run fresh CLI resume dry-run, then reconcile724 only if no redispatch
is selected. Failed original Flow history remains immutable; no new canary.

### 724 immutable toolchain maintenance correction — 2026-09-05T17:05Z

The existing transactional build safely failed pre-publication with
E_BUILD_INPUT_UNSAFE; dist and724 evidence were untouched, and its temporary
run directory was removed by the build's existing pre-boundary compensation.
Read-only inspection proved six normal node-gyp dependency files in three
hardlink groups; each group's two aliases are entirely inside node_modules.
Project source/manifests contain no unsafe link. The unconditional nlink1
requirement on read-only dependency input prevents the recovery build itself.

Bounded BLOCKS_CURRENT_DONE write supplement: `scripts/build.mjs` and
`tests/scripts/build-lifecycle.test.ts`, one adapter-proof writer. Admit only
closed-tree hardlinked SOURCE toolchain input at the two existing dependency
snapshot copy calls. Require dev/ino grouping, observed alias count equal to
nlink, exact source identity pre/during/post copy, and source content stability.
Create independent O_EXCL destination files. Project source, manifests, node
runtime and live/staged artifacts remain strict nlink1; symlinks, external or
excluded aliases, source mutation and output hardlinks remain fail-closed.
No package-specific exclusions, no source hardlink breaking, no injected
maintenance authority. Normal native layouts across supported platforms use
the same filesystem identity checks; unsupported identity stays typed HOLD.

Proof: regression RED on closed dependency links, GREEN with independent
single-link staged files; negative external links, source-tree links, mutation
and output links; existing build lifecycle suite; independent review, then one
changed-fingerprint real transactional build. The broad stale-task clean guard
and recover/restore state-contract findings are not implemented in this slice.

### 724 real maintenance proof and no-redispatch dry-run — 2026-09-05T17:17Z

Closed-link RED matched the production E_BUILD_INPUT_UNSAFE chain; all22 build
lifecycle tests then passed in4.89s, including external/excluded aliases, strict
project/output links and source-copy mutation. Independent review: NO NEW BLOCKER.
Frozen build script6c524751bccd6fe4609d1d4d5aa2f66507c9ad635c78a3fbda2431589c3b2dd6;
test2187c2e77dc04f661c34cfd32f2fd1a08ede6619ec2d3e09fb8b1860079d826d.

Real `node scripts/build.mjs --scope all` succeeded: BUILD_COMMITTED at
17:15:33.466Z, run2a205086-1fa1-42eb-8259-4307c681b9b9; journal/backup retained.
Artifact cb0078de8abd6fb10f52b70d23ab49abb7fd650c560e87bbc084fde17b365cda.
Source/dist1372-input identity matches
7c044123a8a4ee3060ece2378b10026fb4a5d2caa419938bd76fa5b3ed446140.
Native source/binary unchanged. This is artifact publication, not a Git commit.
Canonical bot start/status confirmed newpid1664020. Fresh CLI
`resume sprint-724 --dry-run` exited1 with exact pending-settlement HOLD and
explicit no-reset/no-start. At17:16:35Z all104 attempt files stilld9a598fb...;
checkpoint/task/skill/host four hashes unchanged. No generic recover/restore.

For the single canonical724 reconciliation apply, max_fix_retries was changed
from1 to0 through CLI; restore1 at terminal. No new plan/task/worker is intended.
The resume preamble still says stale workers will be restarted before the exact
branch prints no-start HOLD: an honest operator-copy residual, not proof of replay.

### 724 accepted publication and warm-consumer ordering defect — 2026-09-05T17:28Z

Canonical resume pid1669316 ran17:18:24–17:19:33 and published the real accepted
result plus chain02. Outcome writer records FAILED with
EXACT_RECOVERY_ATTEMPT_HOLD:724-001:authority-hold; no evaluation/settlement yet.
Inventory107 files: original104 unchanged, only accepted bin/receipt/chain added.
Host/checkpoint/task/skill bytes unchanged; no new worker or plan. max_fix_retries
restored1 via canonical set/get. Original FAILED Flow remains unchanged.

Fresh compiled read-only cold-accepted reconstruction and hot reader both PASS
17:24:00Z, JSON byte-identical; resultDigest
sha256:748ddd36b40d4332c84697b6c4ae4263690ad82cf685526c07983e249b8a3371.
This falsifies the downstream billing-null hypothesis: ingress not-emitted shape
intentionally differs from completion DTO and remains unchanged.

The source-backed next defect is consumer ordering: awaitExactDockerAcceptedResult
checks the live terminal monitor before the accepted cache. Accepted publication
evicts the completion map; a delayed registry reader therefore gets
LIVE_MONITOR_UNAVAILABLE even though a valid accepted record already exists.
The internal publisher also evicts before its caller publishes the accepted cache.
Controller drops holdReason, so the observed outer string cannot by itself prove
this internal reason. Require deterministic producer-to-registry RED before fix.

Bounded same-package write continuation: existing backend writer in
src/orchestra/spawn-backend-docker.ts; adapter-proof writer in existing
tests/orchestra/spawn-backend-docker-mounts.test.ts. Cache-first reads must validate
the exact plain query and reread durable accepted authority; publish accepted cache
before evicting live maps. Preserve pending/capture-hold and wrong/sibling/tampered
query rejection. No effect replay, result rewrite, ingress shape change or new
outcome. Run targeted regression+affected suites, independent review, build and
then exact724 resume only with a changed implementation fingerprint.

The observed generic HOLD also requires a bounded diagnostic supplement in
`src/orchestra/sprint-controller.ts` and its existing
`tests/orchestra/exact-controller-terminal-fanin.test.ts`, one controller writer.
Preserve the already-returned registry holdReason / settlement reasonCode through
the existing DeckentError and canonical resume outcome reason; reject absent or
unsafe diagnostic text to fixed typed fallbacks. No new outcome schema or raw
provider/error-payload dumping, no acceptance/settlement semantics relaxation.
Regression must distinguish exact LIVE_MONITOR_UNAVAILABLE from generic state,
preserve stage identity, and reject unsafe diagnostic text. Other error-path
catch refactors and projection work remain outside this supplement.

### 724 accepted-reader correction verification — 2026-09-05T17:44Z

The real producer-to-registry regression reproduced capture-hold despite a valid
accepted result. Cache-first full-query durable reread and publication-before-
eviction corrected that exact regression: targeted1/1PASS (89 unrelated skipped).
Public TaskResult intentionally redacts private custody; the test separately
asserts raw backend identity and opaque registry authority bindings. Controller
diagnostic regressions passed8/8; TypeScript passed. Independent review found
NO NEW BLOCKER. The23-suite combined verification is running; no new build or
resume has occurred at this checkpoint.

Frozen backend8e98621a03ea5c94aa6874f7b55a3d1f8b8af0ca4c00ea4389e92901636db08d;
controller e18712cf063b046adf9b2992cd9145e7b950ede5a35a7461b6a5dba677a25e07;
mounts test33cedec7c4e75ae0effcfbf8c9b2d2dd16dbd9764314746390d98a81673f1a4c.
At17:44:25Z all107 custody files hash to
3a2458018f168ae9eb51e9c35e76523fc5005ea2791649477843d3a3625b62e7;
both original104 and accepted-added107 sets plus four host artifacts are unchanged.
Canonical active/quarantine lease tables are empty; no live Docker worker.

Forward-check disproved a potential724 confirmation-runner blocker: immutable
acceptance policy is observe, so no route claim/pending confirmation is created.
Generic enforced-ROUTE startup settles before runner binding; this remains
RELATED_BUT_NONBLOCKING, not a speculative same-package implementation.

### 724 cache-first real build and continuation boundary — 2026-09-05T17:51Z

Combined23 suites613/613PASS162.24s; TypeScriptPASS. Canonical bot stop retired
1664020; no live worker/active or quarantine lease remained. Transactional
build run46705e8c-2943-49a0-b0b7-978684f459ff committed17:50:32.836Z,
artifact4c1cca1ca685d18e55f64c743d58e07f6c54768afa2db7e22ae0971744b16b12,
source-input725de780c3c5fc70e7b0f4eea3c67b7ec5ad1f03539d34cae94eac2b0d8bd976.
Fresh1372-file source/dist identity both
01ebe9e4a08fbf027badad10ba040e0b1ce07d63f5962004530aea41f6639f48;
backend JS349b39a9119e77efc2f7e9ec482f8299f6fd6921955b32977cdb7cc816ec810d,
controller JS1bd77e46dd71a8316fa1f6dab767a7877a741212a7374c4dc750c42764965ab9.
Resume/audit/entry/constants remain unchanged. Native source identity unchanged;
no native rebuild claimed. Two committed build journals/backups retained;
maintenance active/quarantine empty after publication.

Canonical bot restart/status confirms1741343. Fresh resume dry-run gives exact
pending-settlement, no reset/no start. At17:51:19Z all107 custody and four host
artifacts are unchanged. Config max_fix_retries1 was read then set0 for this
single changed-fingerprint resume; restore1 at terminal. Continue the existing
724 attempt only; no new task/provider/worker/effect. OldFAILED Flow and first
resume outcome remain immutable. Canonical outcome target for this continuation:
`.deckent/runtime/recover-resume-outcome-sprint724-20260905T1751Z.json`.

### 724 task settlement real proof; outer checkpoint publication defect — 2026-09-05T18:00Z

The changed-fingerprint canonical resume published real T11 task terminal custody:
evaluation17:53:07.363Z (DONE), finalizer17:53:14.202Z (terminal-ready),
settlement17:53:21.189Z (settled/exit0), archive17:53:38.737Z. Chain02→06
predecessor and artifact receipt digests bind exact724/attempt63e1b622/gen1.
Independent Sol and Fable read-only verification PASS at task level. All12 new
terminal files are0400/nlink1, bytes and sizes match receipts.119-file inventory
58a145e30f57eda2d91f59384637e77a2c384bb579b54bf30f980b654596ebe9;
original107 unchanged, host187B unchanged, no new worker/provider/container/effect.

Outer canonical outcome17:55:51.975Z failed: Task724-001 exact checkpoint terminal
authority reference is missing. Old577B checkpoint predates settlement; restore
correctly consumes fresh registry T11 and projects taskDONE, but controller then
rereads the old checkpoint without persisting those exact refs. Terminalizer's
missing-ref veto is correct. Restore also prematurely writes sprint-stateCOMPLETE
before any outer receipt, causing outcome nextAuthorityCOMPLETE contradiction.
Worse, that projection satisfies isSprintFinalized and could delete checkpoint
before the next restore, then plan fresh. No next resume until this chain is fixed.
max_fix_retries restored1 through canonical set/get; originalFAILED Flow and both
failed continuation outcomes remain evidence, never relabelled.

Bounded BLOCKS_CURRENT_DONE continuation within existing checkpoint/controller
scope: use existing canonical phase-checkpoint writer with fresh Store-verified
registry terminal map, require its returned snapshot and pass that snapshot to
outer terminalizer. Preserve executionMode/skipCleanup/startedAt provenance;
missing/stale/sibling refs and writer failure remain HOLD. No manual ref/backfill,
builder fail-open, public-result promotion, task replay or new Store record type.
Restore candidate must remain nonterminal until existing finalizer publishes outer
receipt. Ghost-finalize deletion must require matching canonical terminal receipt,
not COMPLETE/log projection alone; missing/conflicted evidence preserves checkpoint.
Ghost deletion authority specifically reuses `verifySprintArchiveTerminal`:
sealed archive/application/manifest plus detached immutable projection. The thin
`readSprintTerminalReceiptSummary` schema/sprint-id reader is NOT sufficient to
authorize cleanup; forged receipt, COMPLETE state or log alone cannot do so.
Source writer owns only sprint-checkpoint.ts/sprint-controller.ts; separate test
writer owns existing checkpoint/controller-fan-in/terminalizer-events tests.
Require behavioralRED, targeted and combinedGREEN, independent review, changed
build identity, then same724 continuation. No new work ID or second recovery engine.

Operational deviation UNREAD_CHANNEL: ENTRY154 arrived between checks; grouped
commands printed its new header but started resume before root consumed its body.
154 had no blocker/instruction; outcome is not excused by that. Root acknowledged
in155 and changed action orchestration to early-return on unexpected seq/SHA before
state mutation. Evidence is retained; no kill/replay to conceal the deviation.
RELATED_BUT_NONBLOCKING: bot outbox catch stringifies errors as [object Object]
and repeats them; recorded from Fable157, no bot refactor admitted here. Enforced
ROUTE runner ordering and operator visibility residuals remain open.

### 724 outer recovery source freeze and verification — 2026-09-05T18:10Z

BehavioralRED proved pre-receipt COMPLETE projection. New production-wired
terminalizeRecoveredCompleteCheckpoint helper is called by the actual runSprint
complete branch: fresh registry T11→canonical writePhaseCheckpoint→returned
checkpoint→actual terminalizer. It retains original start/execution/cleanup
provenance and fails closed before terminalizer on publication failure. Missing
checkpoint refs still veto public-result substitution. SPRINT_RESUME_COMPLETE is
emitted only after terminalizer success. Ghost cleanup uses strong archive verifier.

Frozen checkpoint4c81280a2ed8092648acd06cb556c2d646e90c14d56df6e4620e9de7522c3f17;
controllerb36573a467abb6102057bde41c70e4608e513273649be4d04fc6538166c1ff7c.
Six targeted production-wired regression testsPASS, TypeScriptPASS, independent
Terra review NO NEW BLOCKER. MASTER/Closure/operating/i18n/recoverytruth gatesPASS.
Backend and real119-file custody are unchanged; no new runtime/build at this note.

Affected-test continuation adds only `tests/orchestra/ghost-finalize.test.ts` to
the existing test writer: four old assertions authorize cleanup from public
COMPLETE/log alone and now correctly fail. Replace those obsolete expectations
with checkpoint-preserving negatives and retain positive verified-archive cleanup
through the actual sealed-archive producer. No runtime guard rollback, new
suppression, simulated receipt authority or test-only production substitute.
Archive seal/finalizer publication/wire/receipt-order suites passed; combined
verification and real compiled continuation remain pending.

### Verification residual: fixture cleanup projection — 2026-09-05T18:16Z

Expanded30-suite verification:703PASS/2FAIL705,29/30filesPASS. Both failures
occur before acceptance in the existing semantic-acceptance fixture's cleanup
projection, whose generic Fixture cleanup incomplete error hides the typed HOLD.
This is not proof of a production cause; build/resume initially held pending
classification against the exact continuation path.
Bounded test-only diagnostic scope includes
`tests/helpers/exact-acceptance-evidence-fixture.ts`: preserve returned HOLD
state/code/evidenceDigest in the test failure message; no raw authority dump,
clock/gate relaxation or production semantics change. One Terra fixture writer;
root sole reproducer. Earlier complete613-test run was green; fresh evidence now
requires exact failure classification, not an isolated-pass waiver.

### Finite proof boundary after setup-test residual — 2026-09-05T18:20Z

Fresh combined ghost/checkpoint/actual-controller/semantic-acceptance106/106PASS
160.13s; two previously failing semantic targets2/2PASS35.03s. The broad705-test
run remains703PASS/2FAIL, never rewritten as green. The fixture-only safe diagnostic
is d15489a454e822f1241c8659c4b287ddf04de89bd5f428a75fe0e2c8a8daebaa.
Underlying setup HOLD is unexplained; no production fix claimed for that residual.

The residual blocks general release/IMPLEMENTED_PRODUCTION_VERIFIED, but does not
block this exact existing724 continuation: task setup, resource cleanup, accepted
result and T11 are already immutable and independently verified in119 custody
records. The next path invokes none of that setup; it checkpoints existing fresh
T11 then outer-terminalizes it. That production-wired path passed joined106 tests,
TypeScript and independent review. Permit one changed-fingerprint canonical
checkpoint/controller build and same724 continuation; no new worker/plan/provider.
Do not close the entire recovery package or claim general dogfood readiness until
remaining proof obligations, including the broad-suite residual, are resolved.
This is stage-specific admission from new evidence, not an isolated-pass waiver
for release and not an unlimited test/runtime retry loop.

### 724 outer-only compiled continuation — 2026-09-05T18:26Z

Canonical bot stop retired1839122's predecessor1741343; no worker/active lease.
Transactional build5fd3e430-e660-49cd-916b-fcbfd5cd4456 committed18:24:50.726Z,
artifacte76c93a29090391472db0818132b43000956d7df3536a24ee0f540a254e06a43,
source5f756bc80f639088cbeb05e6bccab5c25359501f7c1be502c8d41a9b999275b6.
Source/dist1372-file identityaa8f4ed217a74dc3cabec0b0f51eb0275fb726dda61bb9cfb6a3ae3c93531249;
controllerJSeae21ece3b0ed2e112c23c3499873f1b43e1b87c17483775f30f770de91edfb5;
checkpointJSaecd92820572c5eea40f0c90c3544a31d484f63148697f0c345a03a5852d9b3b.
Backend/resume/entry/native unchanged; three committed build journals retained,
maintenance active/quarantine0. New canonical botpid1839122/start/status verified.
No-reset dryrun exit1 pending-settlement;18:25:53Z11958a145e… and four host
artifacts unchanged. Fable independently confirms build/restart/protected gates.

Canonical config get1→set0 bounds this single outer-only continuation; restore1
at terminal. Exact outcome path remains
`.deckent/runtime/recover-resume-outcome-sprint724-20260905T1825Z.json`.
Oldfailed outcomes, task119sealed records, host effect and provenance retained;
canonical checkpoint renewal is expected, early purge is not. No new worker.

### 724 fresh checkpoint success; outer finalizer HOLD and forbidden fallback — 2026-09-05T18:35Z

The changed-code continuation wrote canonical checkpoint3,6380B,
f576261eb5a342c93bf167841887cb3569523227569b461af23f3cdd6469616d,
EVALUATE + exactTerminalAuthority + original sprintStartedAt16:06:00.791Z,
standard/skipCleanupfalse. Restore projected EVALUATING before terminal receipt,
not falseCOMPLETE; no ghost purge. This repairs the prior checkpoint consumer.

Outer receipt then failed18:32:37.462Z with FinalizerTerminalEvidenceError:
TERMINAL_PUBLICATION_NOT_CLEANUP_CANDIDATE_BLOCKED. No outer receipt or SPRINT-LOG
row; archive contains only interim metric rotation. The CLI had already printed
Sprint Complete, which is premature and is NOT proof. Controller stateRecovery
catch rethrows only E077, swallowed this different error and fell into freshPLAN;
that planning attempt failed canonical V2 wiring on retained T4-EXACT-CONSUMERS.
Outcome18:32:37.892Z therefore records the secondary PLAN error, masking the
first terminalization failure. No requested task/worker replay; runtime exit1,
max_fix_retries restored1 through canonical set/get. Old outcomes remain.

Same-package BLOCKS_CURRENT_DONE continuation: controller completed-recovery
entry establishes a local fence; any subsequent checkpoint/finalizer/handoff/
cleanup/archive failure must propagate its exact error and never freshPLAN.
Do not broaden unrelated legacy catches. Separate actual production-control-flow
regression must exercise non-E077 terminalization failure→no PLAN/no worker,
not merely the helper in isolation. Sourcewriter owns controller; testwriter owns
existing controller/terminalizer tests, root runs all verification. BehavioralRED
precedes patch. Finalizer cleanup-candidate cause is read-only diagnosis pending;
no candidate gate bypass or speculative finalizer edits are admitted by this note.
Premature success rendering is a verified truth finding on the same failed chain.
No next resume until the changed fingerprint and first-failure cause are resolved.

### 724 terminal-only fence and exact attribution consumer boundary — 2026-09-05T18:49Z

The actual runSprint regression first failed in fixture setup (null recovery
report; not behavioral evidence). After aligning that fixture with the real
recovery-report contract, unchanged source reproduced the intended failure:
the FinalizerTerminalEvidenceError was replaced by fresh-plan-entered. The local
completed-recovery terminalization fence now preserves the original error and
prevents PLAN/spawn; the entire controller fan-in suite passes 9/9. Controller
SHA256315a263b032459b97b90c71c2c7272af989a9a9a532fd9130303533ede7052a7;
test5adffbc47a9affbf7740a50e973f949056ca22eb42b2311790bbc8d42a97f246.
No build or runtime continuation has used this patch yet.

The first finalizer failure is now independently confirmed by Terra and Fable
ENTRY180: exact host-work attribution is VERIFIED with a provider-exit-bound
baseline reference, but the unchanged legacy-only core attribution consumer
returns ATTRIBUTION_AUTHORITY_MISMATCH. That becomes ATTRIBUTION_EXCLUDED and
cleanup candidate BLOCKED. Coordinator/active-attempt guesses are rejected.

Same-package BLOCKS_CURRENT_DONE write-scope supplement: Docker backend exact
terminal read and finalizer/reporter attribution consumers; core attribution
fold only if needed. Reuse the existing full accepted-result reader, including
its durable host-work/provider-exit/byte reassembly checks, on hot and cold
terminal reads. Issue process-local semantic attribution only after matching
the exact accepted/T11 identity and result digest. No new persisted schema or
custody record, accepted-byte rewrite, public provider-prefix acceptance,
duplicate security validator, or cleanup-gate weakening. Exact wrapper clones,
sibling/tampered evidence and missing capability must remain HOLD. Logical root
remapping carries the proven attribution separately from public result clones.
The live files/cost reporter must consume the same proven work, not a bare
VERIFIED label. Existing legacy behavior remains distinct.

Source lane owns the backend/finalizer/reporter/core fold; test lane owns the
production-fed backend-to-registry-to-T11-to-finalizer/retro regressions plus
tamper and logical-lineage negatives. Root owns capsule, heavy verification,
build and runtime. Use existing suites and producers, not hand-authored green
legacy fixtures. One implementation and independent verification pass; no next
resume before frozen-source verification and changed first-failure fingerprint.
Outer receipt/log/archive/lock release remains unproven. The 119 sealed task
records, host effect and canonical checkpoint #3 remain protected; no task replay,
new PLAN, new MASTER/outcome, broad cleanup or package closure is authorized here.

### 724 compiled read-only first-failure proof — 2026-09-05T18:53:29.237Z

Fresh Node process, current third-build dist, exact checkpoint #3 authority and
actual host task724-001 were passed to DockerSpawnBackend's terminal reader and
the real buildFinalizerTerminalTruth consumer. No fixture substitution, worker,
provider, recovery, result publication or state edit. Output: terminal=current;
attempt63e1b622-7e30-8de2-8e76-fbb5cd238b83; logicalTask=COMPLETED;
attribution=HOLD/ATTRIBUTION_AUTHORITY_MISMATCH; cleanup=BLOCKED/candidatefalse;
reasons=[ATTRIBUTION_EXCLUDED]; holds=[]. This reproduces the precise outer
blocker through the compiled producer/consumer path, not only static inference.
The same read-only probe is the post-build comparison before a next resume.

The mounts suite's global filesystem mock and narrow fake Store cannot mint a
genuine T11 terminal read. The regression lane may also edit the existing
tests/orchestra/exact-accepted-result-evaluation-settlement.test.ts real-Store
suite to compose the production-fed proof. Mocking the canonical terminal
reader or injecting the private capability map is forbidden. A real Store alone
is insufficient if full backend provider-stream/host-work reassembly evidence
is missing; identify and reuse the actual fixture producers before extending it.

### Attribution proof contract clarification from new fixture evidence — 2026-09-05T19:01Z

Sol and Terra independently found no reusable hermetic fixture spanning real
Store + FULL backend accepted reader + T11. Mounts uses a global filesystem mock
and narrow fake Store; semantic acceptance uses real Store but lacks the backend
pristine-stream/billing/prompt-delivery/dispatch-material/host-work bindings.
Mocking T11 or injecting the private capability would manufacture trust, not test
it. No such positive is permitted and no new large fixture infrastructure outcome
is admitted in this recovery seam.

Verification therefore separates hermetic negative/legacy/fold regressions from
the decisive positive production proof: the actual 724 immutable Store graph,
fresh compiled backend, full accepted reader, hot and no-reader/no-cache cold
terminal reads, finalizer CANDIDATE and the live reporter consumer. In-memory
clones, sibling wrappers and result mutations must be refused; no durable artifact
is changed for a negative test. The compiled18:53 baseline is already RED.
Source freezes, typecheck, targeted regressions and independent review precede
build; compiled proof precedes one outer-only resume. Full-chain hermetic fixture
coverage remains an explicit HOLD, as do the existing broad-suite intermittent
setup failures. Neither test-green nor one live task closure closes the whole
3357 package or merits IMPLEMENTED_PRODUCTION_VERIFIED. Fable informed in ENTRY186.

### Attribution source freeze and pre-build verification — 2026-09-05T19:16Z

Backend9d1cc4025ee9f0e6e0f69f69d990299d05923257da4fe83eae439dd3a98d1a4e;
finalizer3fd0122a7a8e9392b1a256687806ee3bc4c051c9dff11eefa631f9fb89623c8b;
reporter63da592b50323603318745cc9fb580081dcd9aa03654c3fc933e2b2d3f19ba70;
controller315a263b032459b97b90c71c2c7272af989a9a9a532fd9130303533ede7052a7.
Core attribution/terminal-evidence/checkpoint unchanged. One missing named import
was caught by tsc and corrected; fresh tsc PASS. i18n/recovery-truth/operating-
policy/MASTER/Closure gates PASS; MASTER577rows489active231receipts13classes,
Closure7events. Terra independent source security/wiring PASS, positive compiled
evidence still HOLD_REQUIRED. Fable independently confirms all four source hashes.

Semantic supporting tests2/2PASS (real-Store unminted authority negatives and
production-used logical/vector reporter fold). Thirty suites:705PASS2FAIL707,
150.03s. One failure is the prior setup residual, now typed
Fixture cleanup incomplete:HOLD:LANDING_NOT_COMMITTED before accepted/T11;
the other was an obsolete source-text wiring assertion. No source gate was
weakened. That assertion now follows the trusted-vector producer/consumers.
An older handmade-current positive receipt test now honestly asserts unminted
HOLD/noartifact/no task or sprint mutation, retaining all exact custody digest
assertions. Positive receipt digest persistence must be proved on actual724.

Final affected nine-suite run:139/139PASS,5.57s. Final test freezes:
semantic8574c7de450f40d575944d5a7cce98964e43bd1c1e87ef611999ece1621ab169;
custodycebbb39ade4cb3b2d7d2eabdb5581d0d48599fe2b07f23f6e1065e9dc7ade04e;
wire1d26a6fbbeaa1228daa4b47599ad4d7b8f5550c06df3bdd70ee420fdff688969.
No repo-wide green claim: setup residual and hermetic positive coverage remain
HOLD. Repo-wide diff-check found only inherited repl-history whitespace; preserve
it. Runtime check: no running Docker containers; old coordinator dead; bot1839122
still alive on the previous build. Protected119 digest58a145e... and host/task/
checkpoint#3/skill hashes unchanged at18:55. Controlled bot stop, transactional
all-scope build and bot restart are next; no live sprint during build. Then actual
compiled724 cold/hot/adversarial/finalizer/reporter proof before a single outer-only
continuation. No new PLAN/worker/task replay; no package closure or commit/push yet.

### 724 actual compiled attribution proof — 2026-09-05T19:25:35Z

Transactional all-scope build 7ae1f1fa-39b1-46d5-b8de-734f621ec5bc committed
19:21:31.049Z; sourceDigest e722bd93d7ac012c795bfd2222ebd5f1b60d5b80edaad7b28b1a62be2ea7beb1,
artifactDigest 6b432a19fe259ac83145ee40a4660cff25891e73318eca5b2273caa2c81451d8.
Built/current source matched; canonical bot restart/status verified PID2004461.
Fable independently confirmed only backend/controller/finalizer/reporter JS and
build identity changed in dist; build maintenance lease zero, native unchanged.

Fresh compiled, read-only actual724 full accepted-reader plus terminal-chain proof
passed both hot and cold paths. Binding digest:
sha256:38a10fdce6f0dfd45274354100f0881ea045cbd424d0755d2c34fb7e920dd546.
Finalizer cleanup CANDIDATE/true with no reasons; production reporter exactly one
file, one added line, zero removed lines, attributionExcluded0. Raw-prefix, cloned
current, sibling identity and in-memory mutated authority all remained HOLD.
No durable artifact mutation, provider call, task replay or new PLAN occurred.
This is the positive actual graph proof, not full-chain hermetic test coverage.
Outer receipt and its persisted exactCustodyDigests are still required; no package
closure or product-ready claim. Next: one canonical outer-only resume, FIX disabled
temporarily and restored afterward; retain original FAILED Flow and attempt history.

### 724 fourth continuation: pre-terminal skill batch conflict — 2026-09-05T19:40Z

Canonical CLI dry-run retained pending-settlement HOLD without resetting tasks.
Canonical max_fix_retries get1/set0/get0 preceded outer-only resume at19:30:05Z,
PID2022376. Outcome `.deckent/runtime/recover-resume-outcome-sprint724-20260905T1930Z.json`
persisted failed/exit1 at19:36:06.266Z: Skill attribution batch conflict for sprint-724.
The controller fence propagated this exact failure; no freshPLAN, worker or task
replay. Config restored1 through canonical set/get19:36:26Z. Checkpoint#4 refreshed
19:34:40.838Z,6381B,sha39beaf3c7de111b3725f95019aadfb9308a2a9d531831c49f1d82f8ecd68269c.
Task remains DONE with current T11, original start retained, queues empty; sprint
EVALUATING, original Flow FAILED. Outer receipt absent; no Sprint724 log entry,
archive remains unsealed. No outer cleanup-candidate publication gate was reached:
compiled read-only positive is supporting evidence, NOT live outer closure.

RCA independently confirmed by sourcewriter, Terra and Fable ENTRY200. Finalizer
writes immutable skill attribution at4644, BEFORE terminal publication at5404.
Prior unsuccessful resume had published `.deckent/routing/skill-attribution/sprint-724.json`
at18:32:30Z,946B,batchDigest sha256:f9aa6c3d370a3a0634a4207fb574739a41ea176ea33e725320a85ab28e107cbc.
It bound pre-terminal logical digest94d9256086494ca78700865f10a92d420addca3bb9d898b230d0470be469c6ab.
Actual compiled read-only current724 comparison19:39:55Z produced logical digest
5a71c6a0fad730137d11b738a5a69f057a0fdcef2cdb8a6044ac3f587f170e3e and CANDIDATE truth.
Only logicalSettlementDigest and derived receiptDigest differ; every skill,
routing, delivery, evidence and EXPOSURE_ONLY field is identical. The immutable
writer correctly rejects replacement; deleting/overwriting historical bytes or
calling divergent evidence replayed is forbidden. No such mutation occurred.

Before another implementation/run: classify ALL remaining finalizer durable
writes and retry semantics, including non-idempotent catalog counters, then review
a typed preserve-and-supersede seam bound to real terminal authority and candidate
bytes. No new source edits or further resume admitted by this evidence entry.
Finite next decision is design/proof-contract review, not a blind fifth retry.
Residual: repeated full accepted-chain semantic reads, no recursion found; Fable
measured368s,CPU95.8%,RSS4.06GB/rchar2.21GB for this one-task continuation. This and
missing user-facing typed next-authority/error-ledger diagnostics block product
readiness; they are not silently solved by offline candidate proof.

### Bounded terminal-publication ordering repair contract — 2026-09-05T19:49Z

Same owner-admitted3357 ADR-D-007 package, DOGFOOD_ON/DEGRADED. Actual new
failure fingerprint is pre-terminal immutable skill batch conflict, not another
worker defect. One implementation pass, one independent verification pass; no
fifth continuation until joint compiled ordering/replay proof. No extra MASTER,
product outcome, generic workflow engine, memory schema or authority-mode change.

Read-only complete write map includes skill batch, KPI, event journal, sprint/
retro/memory/docs, learning/catalog/prompt/cells, decay/hooks, fresh self-audit,
tech-debt gate, manifest/adaptive config, receipt, retirement/archive/outer seal.
Fable withdrew unproved blanket duplicate claims (ENTRY204). Existing retro/memory
PK/upsert/markers, CHANGELOG sprint marker, V3 task+sprint guard and V2 recentSprints
guard are preserved. Actual724 has one complete DONE/EXPOSURE_ONLY outcome and
recentSprints=true; a changed learned verdict is not evidenced. V2 multi-task
crash-mid-loop partial projection remains explicit HOLD, not solved here.

Exact source write scope: src/orchestra/sprint-finalizer.ts and
src/core/routing/skill-attribution.ts for ordering/strong receipt binding and
preserved historical batch; src/core/kpi/collection.ts and kpi-store.ts solely
for terminal snapshot replay idempotency through existing SQLite transactions,
without schema/delete/backfill/manual DB writes. Focused existing finalizer,
skill-attribution and KPI tests are in scope. Root alone writes this capsule,
channel, runs verification/build/runtime. One agent owns each hot file.

Phase contract: pure truth/metrics → ALL outcome-shaping self-audit/tech-debt
gates → current fenced terminal receipt → terminal-bound skill publication →
learning/KPI/user projections → existing archive/application seal. Receipt alone
never authorizes outer COMPLETE. Historical skill base remains byte-exact; current
batch is an exclusive, receipt-keyed artifact, stable receipt identity plus exact
custody/winner binding. Raw writtenAt/artifact hash is not replay authority.
Supersession permits only equal skill semantics with different logical settlement
and derived digests, never arbitrary evidence replacement. No-replace publication
must use fsynced exclusive create/link/readback; unsupported platforms fail typed,
never rename-overwrite fallback. Catalog consumers use current verified batch.

KPI repair must keep the existing raw append API compatible. Terminal snapshot
collector uses a tenant+sprint-scoped transactional compare-or-insert: identical
existing complete measurement vector is replayed, divergent/partial/duplicate
history HOLDs without modifying it, empty scope inserts once. Capture timestamps
and legacy random IDs are not semantic value differences. No unconditional replay
append, no deleting measurements, no fabricated successful reconciliation.

Proof manifest: actual724-shaped preserved-base successor; all-gates-before-
receipt-before-batch/projections ordering; receipt→batch and batch→learning crash
replay; wrong/sibling/tampered receipt/custody/winner/skill fields HOLD; concurrent
first writer no-overwrite; no archive on required-publication failure; KPI exact
replay/different/partial/tenant cases with real temporary SQLite; existing legacy
paths retained. Then targeted gates/tests, independent review, transactional build,
fresh compiled joint proof, and at most one bounded outer-only continuation.
Protect119 custody digest58a145e..., host3a40f4..., DONE taska58d13..., skillcdcc04...,
checkpoint#4 and all failed outcomes. No task replay or broad cleanup.

### Replay baseline and independent review — 2026-09-05T19:55Z

Root used node:sqlite DatabaseSync(readOnly:true), not schema-initializing KpiStore,
to query ONLY tenant default/sprint724 kpi_measurements, bounded64rows19:50:45Z.
Exactly11 unique rows: boundary0,cache70656,cost0,lines1,noGo0,retries0,sprint1,
done1,total1,input19079,output3736; tags{},tasknull. Existing vector is correct
and complete, so terminal collector must replay without append. No DB mutation.
Actual routing outcome has no logical/skill-receipt digest field: DONE,
EXPOSURE_ONLY,skillIds[],doc-writer,coverage0,quality90 are unchanged. Fable
ENTRY207 withdrew incorrect learned-value/blanket-duplicate claims. No memory
reclassification/schema amendment is required for these actual724 values.

Callee proof: retro/memory use stablePK/upsert/markers; CHANGELOG has sprintheading
dedupe; V3 task+sprint key dedupes current retry. KPI raw randomUUID append was
confirmed and is in the bounded repair. V2 multi-task crash-mid-loop, prompt-use,
promotion/adaptive repeated-effect risks remain release HOLD. Current724 single
completeoutcome+recentSprints marker prevents V2/catalog recount; this is not a
general multiworker crash-safety claim.

Independent plan review accepted phase ordering with strong identity/custody/
winner binding and exclusive first-writer semantics. Required behavioral proof:
post-receipt required-publication failure → actual canonical resume → same stable
receipt → remaining publication → outer closure; no new PLAN/worker. Existing
fenced publisher's identical-command reducer may replay automatically; absence
of a manual-resume option alone is not proof of failure. Unsupported durability
primitives must HOLD; no overwrite fallback. KPI generic explicit-tenant isolation
is in scope; migrating existing writer-only default→local would fork current CLI
and KpiService readers and is forbidden in this repair. Broader tenant-adapter
convergence remains release HOLD, not a silent one-sided migration.

### Ordering repair verification pass — 2026-09-05T20:14Z

KPI scoped suites47PASS, then required-usage runtime validation added from new
source evidence; updated48/48PASS2.71s and independent TerraPASS. Finalizer first
focused3suites41PASS. Broad22suites244:240PASS4FAIL; three missing logicalSprint
metrics snapshot fields corrected, old diagnostic-before-HOLD assertion updated
to the new required phase order. Independent review found receipt-key path included
custody/winner (permitted sibling file for same receipt) and terminal KPI error
was swallowed; both corrected. Legacy raw API behavior remains compatible.

Second tscPASS. Broad23suites254:206PASS48FAIL:47 legacy success fixtures lacked
explicit billing authority, one controller registry fixture missed the required
awaitTaskResultAuthority method. Successful fixtures now carry explicit provider/
auth and token evidence; unknown-usage negative still proves receipt present but
no archive/cleanup. Registry fixture uses exact-accepted/settlement contract, not
not-dispatched bypass. Focused3suites92:91PASS1FAIL; new production receipt+skill
crash/replay test PASSED through actual runSprint recovery. Honest boundary:
terminalizer is partial integration, syntheticT11 only restore fixture, not full
Docker evidence or private attribution mint. Remaining test expected legacy KPI
fail-soft on unavailable DB; actual strict collector correctly stops before
downstream work, but raw SQLite error needs typed storage-unavailable wrapping.

Source review PASS on receipt-only path/fullpayload conflict and strict KPI
propagation; root found two additional concrete durability gaps before build:
EEXIST replay ignored directory-fsync failure, and final replay read followed
symlinks. Writer is closing them with fault/adversarial tests, not weakening
evidence. No new build or runtime continuation while verification is incomplete.
Six readonly gates PASS: i18n, operating-policy, recovery-truth, MASTER projections,
Closure append-only, sprint-archive writers. Existing actual724 evidence preserved.

### Ordering repair final delta — 2026-09-05T20:23Z

Terminal skill publication now fsyncs the parent for both first publication and
EEXIST replay; a failed durability check always HOLDs. The final read is bounded,
fd-based O_NOFOLLOW, regular/private-file validated, parsed against full expected
authority, and path dev/ino rechecked. Historical base bytes remain immutable.
KPI terminal collection wraps storage failures into typed storage-unavailable,
preserving a prior typed HOLD and its cause even if close also fails. The legacy
append/fail-soft API remains unchanged. Independent Terra delta review PASS.

Root 23-suite verification:259/260 PASS15.18s; sole failure was a nonconfigurable
ESM fsync test spy, not a production assertion. Hoisted real-fs wrapper corrected
that fixture without reducing replay-HOLD/byte-retention assertions; focused
skill suite13/13 PASS1.78s, repeated TypeScript PASS. Combined rerun pending.
Hermetic scanner reports18371 unresolved vs18157 baseline; bounded site diagnosis
is required, not an automatic baseline increase or a claim of clean full-repo
verification. Six earlier policy/writer/i18n/ledger gates remain scoped evidence.

At20:23:09.790Z actual724 custody remains119 files with aggregate
58a145e30f57eda2d91f59384637e77a2c384bb579b54bf30f980b654596ebe9;
main note, checkpoint#4, DONE task and delivery bytes unchanged. Main HEAD remains
ff2e47564;189 dirty entries include inherited work. No fifth build/resume or new
worker has occurred. Outer terminal closure remains unproven.

### Verification-only return boundary — 2026-09-05T20:34Z

Final ordering/fault/controller/KPI fan-in:23 suites261/261 PASS22.12s with explicit
VITEST_MAX_FORKS=2; TypeScript and scoped diff-check PASS. Earlier runs used the
repository default fork setting; the final run explicitly enforces the core-memory
two-fork instruction. Missing/zero O_NOFOLLOW now fails before publication. Final
source hashes: skill3f6612f954ad695536394484906b1334c65c4f2da03126dcdfa6ce52bf023c15;
finalizer05087af238eaf8a2fa8e56bd4c00ec440d1bb7918bbd7e1d8471a317b5f5a6ea;
collection46f211f134871395be4bba23ddb3b1609539c008d952b753e1bdb256e109e227;
KPI storef0ef0f06b724eda39e2d8098b1f5b71e24bc3a50eaafb05cf137389698ffe882.
New fixture mutation sites independently scanned temp/sandboxed after lexical
temporary-root corrections. No scanner suppression or baseline edit occurred.

Full hermetic gate remains BLOCKS_CURRENT_DONE for package/release sealing:
18371 unresolved vs18157; production inventory1426 vs1425. Zero confirmed violations.
Baseline raw identities are absent, so an exact set diff cannot be reconstructed.
HEAD-relative added unresolveds include prior clean170/build104; they cannot all
be attributed to this terminal slice. Five new production durability primitives
are visible to the scanner. Existing generic helpers do not preserve all required
no-follow/staged-inode/semantic-replay guarantees; no weakening/refactor is admitted
merely to hide static debt. Independent review found no concrete additional safety
blocker for the authorized transactional build and existing-fenced outer resume.

This is therefore a verification-only return to the admitted canonical recovery,
not permission to seal3357, edit MASTER, suppress a gate, or claim product-ready.
One build/all + fresh compiled actual724 read-only/temp-publication proof precedes
one outer-only resume. No new PLAN/task/worker, no replay of the main effect. All
historical FAILED Flows, task settlement and protected custody remain preserved.

### Fifth build and outer-only continuation — 2026-09-05T20:41Z

Controlled bot stop retired2004461. Transactional all build committed20:38:39.481Z,
run2f6c17d2-f095-454f-9d46-1a5a19f4d357, artifactDigest
7aaef6bbef11b965e5b79b5d9c0d2ed77e2cc94ca0e8fd3eb166723da87f1019,
sourceDigest451d772caac18323cab980d654921e1fc11cd2a8fca956105c8144b2e8a39fc8.
SourceTree2fe83ef7fcf25ea235875d5056927247564cbf5c281bd5de2b6247dcbab69e60
matches fresh dist/1372inputs; native source and binary unchanged. Canonical bot
start/status confirmed2198023. Build retention preserved three generations and
removed the prior46705... build backup, not sprint/task/custody evidence.

Fresh compiled joint proof20:39:55.821Z used REAL724 accepted/T11 read-only:
cleanupCANDIDATE/reasons[], stable logical5a71c6a0..., temporary fenced receipt
stable across replay, temporary skill written→replayed, same receipt/different
custody rejected PUBLICATION_CONFLICT, historical base d29432ad... unchanged.
Temporary KPI two calls produced11 rows, not22. No real outer publication was
claimed from temporary artifacts; their owned temporary directory was removed.

At20:41:00.570Z all119 custody files/aggregate58a145e3..., note187B, cp4, DONE task
and delivery remain byte-exact. Canonical config max_fix_retries1→0 verified.
ONE canonical `resume sprint-724 --auto-approve --outcome-file
.deckent/runtime/recover-resume-outcome-sprint724-20260905T2041Z.json` started
from checkpoint#4/EVALUATE, completed1/pending0/active-worker0. Coordinator2202116,
lock acquired20:41:28.343Z. No new task/PLAN/worker authorized. Root monitors
terminal then restores maxfix1. Full hermetic/package sealing HOLD remains.

### Sprint724 real outer closure — 2026-09-05T20:54Z

Fifth outer-only continuation EXIT0, outcome `completed` at20:50:26.871Z. No new
PLAN/task/worker or repeated main effect. Actual receipt4323B published20:47:28.171Z,
SHA15b9f2f4fc5cd2d9214ba037367b98a516e24fa2dc767e2a0489cd999e8a39d4;
sprintId/runId=sprint-724, generation1, authority0→1, COMPLETE,
logicalSettlementDigest5a71c6a0fad730137d11b738a5a69f057a0fdcef2cdb8a6044ac3f587f170e3e.
It binds exactly724-001/attempt63e1b622-7e30-8de2-8e76-fbb5cd238b83/gen1,
accepted result and evaluation/finalizer/settlement digests; no holds/exclusions.

Canonical archive verifier20:51:19.736Z returned ok=true/reasonCodes=[]:
manifest3eaa8e4f2ef84d0721405200f156d4c233cb33f30f465d326b9d0ea85425563f;
sealebcbfc39e8b06535da9f962634dbbcf8be6541474dc3486902828d3803fa5444;
Brain indexcef3d05f18edf60fa03713f1c438565c0d282cddf0dee3cf30ab380a17e2985d;
guarded summary80675d6e015ea84518973bb145157e4e3459ed8c3c24363a22084d884ee83887.
Exact archive paths: `.deckent/archive/sprints/sprint-724/manifest.json`,
`terminal-seal-receipt.json`, `terminal-seal-application.json` (state=applied).
Independent Terra reread confirmed matching bindings,19manifestartifacts/conflicts[],
brainAdopted=true, state projection COMPLETE, Sprint Log724 COMPLETE/1DONE, lock absent.
Its initial lookup used the wrong state filename; corrected exact `.deckent/sprint-state.json`
is PRESENT/COMPLETE, not absent. Canonical checkpoint removal/task archive was performed
by the lifecycle, never manual deletion. Task archive now14750B includes canonical
finalization metadata; do not claim its original14443B remained byte-identical.

Fresh CLI `status --json` agrees COMPLETE/inactive/nonresumable/readinessREADY,
terminal:1 read-model/noholds; bot2198023 alive. `status --root` was rejected as an
unsupported option before execution; the successful check ran from the repository
cwd without that option. Status also reports94 historical death-sweep error skips,
zero closed, and provider concurrency admissionHOLD/unknown. These are residuals,
not evidence for starting a new portfolio. Canonical maxfix restored1/get1.

At20:52:19.655Z all119 private custody artifacts still aggregate58a145e30f57eda2d91f59384637e77a2c384bb579b54bf30f980b654596ebe9.
Main note187B/3a40f4d9... unchanged, target line once; archived delivery570B/cdcc048c...
unchanged; legacy skill946B/d29432ad... unchanged. At20:54:20.084Z bounded read-only
canonical RunFlow DB query with payload-hash verification confirms original Flow
591a6ff1-8cc9-4dc8-b0a2-e2cf49144882 still ends at sequence7/RUN_FAILED16:11:11.348Z;
recovery did not rewrite its history. No raw product memory DB was read in this turn.

Observed continuation was about9minutes: roughly6minutes of repeated exact-custody
verification (~4GB RSS), then configured cleanup_delay_ms180000 await before outer
publication. Source+config+artifact timestamps establish delayed cleanup, not a
lingering-handle deadlock; do not misclassify the last3minutes as a new engine bug.
The expensive verification and premature rich COMPLETE stdout before outer seal
remain product/scale findings. Task effect/settlement/outer archive is now a REAL
run-level proof; autonomous multiworker DAG/handoff and all-surface observability
are NOT proven by it. Full hermetic and prior order-dependent fixture/package HOLDs
remain. MASTER3357 is not DONE, no ledger signing/commit/push/new sprint was performed.
The requested bounded checkpoint is reached; root pauses for the owner's report.

## DONE

### 720 continuation implementation evidence — 2026-09-05

Host read-only proof eliminated policy/admission/lifecycle/native-root mismatch.
The exact restart defect was missing `inspectDependencyVolume` on the production
Docker lifecycle adapter: restart required it and produced ADAPTER_UNAVAILABLE before
any runner command. The existing identity-checked volume observer now implements it.
Fresh compiled-binary proof against 719's real retained dependency volume returned
PRESENT with matching identity `sha256:0d882a7d6b2144fd00b1c5750ef3f25e902111fb1ff1cbd291ec3ac39be92d18`;
exactly one `docker volume inspect`, no write/helper/provider/rehydrate invocation.

Implemented separate STARTED_FAILED_RETAINED authority in the same private Store,
exact stopped-only `recover --retain-started-failed <dreq-id>` ingress, shared
planning/startup consumption, and bounded path-free startup failure persistence.
Retention refuses landing journal/acceptance authority, alive/restarted processes,
sibling/fence/custody mismatch and tampered/partial evidence. Retention containment
has an unconditional signal veto, including the precheck-to-containment race.
Original RELEASED/provider/result/usage/effect evidence is not relabelled or deleted.

Independent code review plus 8 targeted suites passed (283 distinct tests); final
temporary-directory provenance corrections re-passed the affected suites. TypeScript,
i18n, operating-policy, recovery-truth, MASTER and Closure gates passed. Native/binary
build passed; current sourceTreeSHA is
`f9e90efafa2742391a8306cf586073ae6880e9297ac410d7b17855ecd1b85a85`.
An initial compiled dry-run caught a missing Object.freeze at the native label-contract
boundary; it was fixed and rebuilt before the successful readonly dry-run. The successful
dry-run bound task719-001/attempt1329297f-bd5b-8673-8f32-0b35b2784c8d/generation1,
candidate evidence `sha256:14559e87db07e22e92fedebcdb5d0d3e8cb7308318235b44892edec8f625f145`;
no task archive, cleanup, disposition publication or provider call occurred.
Planning now truthfully HOLDs that exact admitted/unsettled attempt before a planner call.

Hermetic verification initially identified 10 additional unresolved test sites; actual
temporary-root provenance was corrected without allowlist/budget expansion, restoring
the previous unresolved count. The existing fingerprint registry may be refreshed only
for changed source hashes and the one new, production-wired diagnostic module:
`scripts/lint-test-hermeticity.mjs` is admitted solely for that mechanical update.
No unresolved-count increase, scan weakening or new suppression is authorized.

1. Exact IPC authority is production-wired from Store-backed Docker attempt custody through the
   execution registry into the collector; authored/public projection data cannot substitute.
2. Cross-platform collision admission and contain-before-retire failure semantics pass hermetic
   regressions without weakening the wiring or custody contracts.
3. Canonical failure status and native Terminal output agree and suppress stale running fields.
4. Scoped tests, TypeScript and required gates are green; executable scope has no unadmitted drift.
5. Controlled bot stop → `build:all` → restart/reconnect succeeds, then real compiled CLI/native
   execution proves the repaired seam and terminal settlement. Until then the row remains OPEN.
