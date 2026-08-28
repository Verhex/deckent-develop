# Deckent tmp-worktree dogfood findings — 2026-08-27

Companion solution ledger: [SOLUTIONS.md](./SOLUTIONS.md)

## Scope and evidence boundary

- Worktree: `/tmp/deckent-md-contract-authority-20260827`
- Branch: `work/md-contract-authority-20260827`
- Base snapshot: `417f4955b970327ee86d34c74dc06638a23dd02e`
- Main checkout was not mutated by this exercise.
- Confirmed observations below come from real CLI, RunFlow, Docker worker, status, archive,
  heartbeat, task-result, and disk-diff evidence. Inferences are labelled separately.

## Confirmed findings

### F-001 — Cross-checkout binary identity is safe but the recovery path is high-friction

`deckent do` invoked from the tmp worktree refused because the resolved CLI package belonged to
`/home/alperen/deckent-dev`. The refusal was correct and explicit
(`DECKENT_BINARY_IDENTITY_HOLD: runtime-root-mismatch`), but a normal non-home/worktree user must
know to provision dependencies, build locally, and invoke `node dist/cli/entry.js`.

Solution: [S-001](./SOLUTIONS.md#s-001--first-class-worktreelocal-runtime-bootstrap)

### F-002 — Flag-off `do --run --yes` ignores the non-interactive contract

With `terminal.run_flow_v2` absent, `do --run --yes` printed an interactive confirmation, then
failed on stdin EOF. It also produced a one-task `TODO-fill-in-*` scaffold, not an executable
plan. The help text documents `--yes` only for RunFlow, but the same command accepts the flag on
the legacy path without a typed early refusal.

Solution: [S-002](./SOLUTIONS.md#s-002--make-do-flag-off-behaviour-explicit-and-non-deceptive)

### F-003 — Canonical RunFlow `do` collapsed planner failure causes

After enabling `terminal.run_flow_v2`, the real LLM planning call ran for about 185 seconds and
returned only `AI planner core returned no usable plan (provider unavailable, timed out, or
produced an unparseable response)`. Provider unavailability, timeout, empty output, and parse
failure are operationally different but were collapsed into one error. The defect reproduced after
force settlement on a tightly scoped, write-allowlisted `do` dry-run: 172 seconds of elapsed-only
progress ended in the same collapsed error, with no new RunFlow row or recent task artifact. The
command therefore avoided false durable work, but still emitted no typed provider/model/invocation
receipt with which an operator could distinguish capacity, timeout and parser failure. The tmp fix
adds a secret-safe typed failure projection and preserves the durable receipt reference. A post-build
real CLI rerun terminated after 184,398 ms as `spawn_failed/nonzero_exit`, `stage=transport`,
`provider=claude`, `model=claude-fable-5`, `exitCode=1`, `stdoutBytes=1143`, with output digest and
receipt `inv-4e75b6005e6835658e9216672531064c`; no raw provider output was rendered.

Solution: [S-003](./SOLUTIONS.md#s-003--typed-runflow-planner-failure-receipt)

### F-004 — `plan --structured` still performs Routing V3 AI enrichment

`plan --structured --yes` continued showing `Planning…` for more than two minutes because
Routing V3 defaults to `governanceMode: ai`. Setting only
`routing_v3.governanceMode=deterministic` made the same plan finish in 2.7 seconds with
`model-call=not-attempted`. The CLI description “Force structured parsing (skip AI)” does not
match the full execution path.

Solution: [S-004](./SOLUTIONS.md#s-004--make-skip-ai-a-whole-plan-contract)

### F-005 — Approved RunFlow execution has no foreground/joinable mode

`runs <id> --start`, `start --consume-approved`, and the Do RunFlow coordinator all route through
the detached-child helper. In this API terminal's process namespace, the detached child was
reaped when the parent command exited: the attempt reached `PROCESS_SPAWNED`, produced a zero-byte
log, then death-sweep settled `START_PROCESS_DEAD`. The exact snapshot ingress rejects manual
foreground invocation because the hidden capability triple is coordinator-only.

Solution: [S-005](./SOLUTIONS.md#s-005--foreground-and-joinable-exact-runflow-execution)

### F-006 — `runs` guidance points to a nonexistent `status <id>` surface

`runs --limit 10` printed `Tip: deckent status <id> follows one`; `status 1 --json` then failed
with “too many arguments”. `runs 1` was the actual detail surface.

Solution: [S-006](./SOLUTIONS.md#s-006--repair-run-inspection-command-parity)

### F-007 — Unique flow-prefix lookup is inconsistent for failed runs

`runs --help` promises a unique flowId prefix. Immediately after flow `94216894…` failed,
`runs 94216894` reported no run, while `runs 1` resolved and displayed the same flow.

Solution: [S-006](./SOLUTIONS.md#s-006--repair-run-inspection-command-parity)

### F-008 — Duplicate JSON config keys are accepted silently

During tmp config recovery, two `execution_budget` keys existed. JSON parsing silently selected
the later block; `config get` showed the grant missing and plan admission produced
`final-only-usage-authorization-missing`. This duplicate was introduced by the operator, not by
Deckent, but Deckent accepted an ambiguous authority file instead of failing closed.

Solution: [S-007](./SOLUTIONS.md#s-007--reject-duplicate-config-keys-before-resolution)

### F-009 — Planning materializes a minimal project config into a full config

The minimal tmp `.deckent/config.json` was expanded with defaults during planning. This helped
subsequent commands, but a planning operation caused a large authored-config mutation and made
manual patching/error attribution harder. The mutation was not surfaced in the plan output.

Solution: [S-008](./SOLUTIONS.md#s-008--separate-authored-config-from-effective-materialization)

### F-010 — Host-rule heartbeat drift has a direct runtime effect

Two Docker workers followed stale worker guidance and overwrote their host heartbeat with
`{"taskId", "workerId", "status"}` or the literal `started`; the task dedicated to heartbeat
repair used the strict versioned schema. This proves the markdown issue is behavioral, not merely
theoretical. Digest integrity did not prevent a worker from writing the wrong time-varying state.

Solution: [S-009](./SOLUTIONS.md#s-009--runtime-owned-heartbeat-writes-and-truthful-worker-guidance)

### F-011 — Wave-2 worker is absent from `agents[]` while executing

After tasks 1–3 settled, task 4 correctly entered wave 2. `taskSettlements` and
`logicalProgress` showed task 4 as active, but `agents[]` still listed only the three completed
wave-1 workers. The backend container was healthy and running.

Solution: [S-010](./SOLUTIONS.md#s-010--single-live-agent-projection)

### F-012 — Provider concurrency projection is too noisy to operate

Status returned many provider-principal digests with `HOLD/unknown`, zero attained values, and no
evidence while three workers were visibly executing. One digest carried four unresolved open
intervals, but no task/provider mapping was available to the operator.

Solution: [S-011](./SOLUTIONS.md#s-011--actionable-provider-concurrency-read-model)

### F-013 — Final summary loses task metadata and treats unmeasured coverage as zero

The completion table showed task IDs as titles, `Agent: -`, and `Duration: -` for every task even
though task definitions and attempts carried this metadata. It also printed `0.0% coverage` while
the learnings correctly said coverage was not measured.

Solution: [S-012](./SOLUTIONS.md#s-012--truthful-terminal-summary-metadata)

### F-014 — “Sprint Complete” is printed before terminal archive closure

The CLI printed `Sprint #4 Complete` and all-done next steps, then remained alive for roughly two
minutes and exited 1 with `SPRINT_ARCHIVE_TERMINAL_SEAL_HOLD:brain_adoption_failed`. Final status
later showed lifecycle `COMPLETE` with a valid terminal receipt and archived artifacts, so the
archive/adoption failure did not revoke logical settlement, but the user had already received a
premature success banner.

Solution: [S-013](./SOLUTIONS.md#s-013--separate-logical-settlement-from-archiveadoption-publication)

### F-015 — Brain adoption fails in a fresh worktree without an actionable remedy

The tmp worktree had no live `.brain/memory.db`. Archive creation succeeded and evidence was
durable, but terminal seal application reported `brain_adoption_failed`. The error named no
missing authority, command, or safe recovery action.

Solution: [S-014](./SOLUTIONS.md#s-014--fresh-project-brain-adoption-contract)

### F-016 — Docker identity is opaque from the task-facing status surface

Containers were named by project/attempt digests rather than task IDs. This is valid for global
uniqueness, but the status surface did not expose the corresponding container ID/name, which made
`docker ps --filter name=deckent-w-004-` falsely look empty while workers were healthy.

Solution: [S-015](./SOLUTIONS.md#s-015--expose-backend-execution-identity)

### F-017 — `.tasks` terminal cleanup and archive preservation worked

After terminal settlement, live task artifacts were removed from `.tasks` and complete evidence
(prompts, scripts, logs, results, heartbeats, evaluations, receipt, manifest) was preserved under
`.deckent/archive/sprints/sprint-004/`. No manual cleanup was required for this sprint.

Solution/disposition: [S-016](./SOLUTIONS.md#s-016--retain-canonical-cleanup-behaviour)

### F-018 — Authority-contract package passed workers but failed post-finalization verification

Sprint-004 completed four dependency-aware tasks. Host rule authority, result/heartbeat/lock
guidance, backend-aware worker-core delivery, and live ADR-G-020 canonicalization changed 100+
files. Worker-scoped verification reported 4 files/120 tests, 3 files/17 tests, and 3 files/292
tests for the first three tasks; the fourth produced its own result and archive evidence. However,
the independent final-disk battery failed 30 of 520 tests after finalization. It is therefore not a
landing candidate yet.

Solution/disposition: [S-017](./SOLUTIONS.md#s-017--authority-contract-change-set)

### F-019 — A stale compiled finalizer rewrote green worker output after evaluation

Canonical rule templates changed at 11:31 while their compiled `dist` copies remained at 11:10.
After all workers evaluated green, the finalizer ran at 11:45 from that stale runtime and regenerated
host projections with old template bytes. Evaluation observed one disk state; terminal publication
left another. Sprint-005 added a pre-write coherence guard, but its current generator freshness leg
uses mtimes and has not yet passed a real post-build promotion cycle.

Solution: [S-018](./SOLUTIONS.md#s-018--transactional-post-finalization-projection-gate)

### F-020 — Structural parity tests miss semantic worker-contract drift

Sprint-005 task 005-002 reported 132/132 tests and claimed the projections carried current memory,
lock, heartbeat and result contracts. The generated `worker-default` files still instructed workers
to open `.brain/memory.db`, check `.locks/`, write an existence-only heartbeat, and use snake_case
result fields. Existing tests proved provider-body equality, not semantic authority correctness.

Solution: [S-019](./SOLUTIONS.md#s-019--semantic-worker-contract-tests-and-canonical-source-fix)

### F-021 — Host-bound Docker attempt identity exists but is not bound into normal worker prompts

For sprint-006 the host created settlement attempt `93984f15-…` and immediately projected a strict
heartbeat carrying it, yet the exact worker prompt still contained `HEARTBEAT_IDENTITY_HOLD`.
The spawner only binds the attempt when an approval grant supplies one; normal Docker execution lets
the backend allocate the settlement reference later. Sprint-005 workers responded by overwriting the
host heartbeat with legacy/custom shapes; sprint-006 correctly refused the ambiguous write.

Solution: [S-019](./SOLUTIONS.md#s-019--semantic-worker-contract-tests-and-canonical-source-fix)

### F-022 — Terminal lifecycle, status and archive verification can disagree

Sprint-005 printed `Sprint Complete` and wrote a terminal COMPLETE receipt, while `status` and
`inspect` still reported lifecycle ACTIVE from a stale checkpoint. `archive terminal-verify` returned
`terminal_identity_mismatch`, `application_not_applied`, and `archive_tampered`. A canonical
`archive reconcile --apply` with 0 conflicts/0 failures removed the stale checkpoint and made status
COMPLETE, but terminal verification still reported staged application, failed Brain adoption and a
sequence mismatch even though archive journal bytes and sequence 27 matched.

Solution: [S-020](./SOLUTIONS.md#s-020--one-terminal-publication-state-machine)

### F-023 — Cleanup discovery is selector-dependent and misses settled one-shot residue

General `cleanup --dry-run` reported zero task files while failed sprint-001/002/003 artifacts were
still build-blocking; selecting each sprint found four files and cleaned them. Later both general and
sprint-005 cleanup reported zero while the settled one-shot `task-run-…json` remained in `.tasks`.
Build admission correctly interpreted its invocation receipt as `NOT_DISPATCHED`, but cleanup did not
surface or dispose the residue.

Solution: [S-021](./SOLUTIONS.md#s-021--authority-aware-cleanup-discovery)

### F-024 — Goal/Mission policy vocabulary has no matching primary CLI surface

The repo policy names Goal → Mission → Flow → Run as the canonical product path, but `deckent goal
--help` and `deckent mission --help` fall through to root help. Only the specialized
`autonomous-mission` command exists; `flow` is a scheduled process-mode surface. This makes the
documented product model impossible to discover from the primary CLI.

Solution: [S-022](./SOLUTIONS.md#s-022--goalmission-capability-surface-parity)

### F-025 — One-shot Run defaults to a scope value its own compiler rejects

`deckent run` documents a default scope of `./`, while the invocation compiled `.` and rejected it as
`CANONICAL_SCOPE:INVALID_PATH:directories:.`. The initial receipt reason also surfaced as
`task-content-mismatch`; explicit `task settle` operator attestation was required to obtain the
truthful `NOT_DISPATCHED / execution_admission_rejected` settlement. Run additionally accepts only one
scope directory, which cannot express common source + tests + projection work safely. The same
compiler default later failed an approved Process task dispatched by Autonomous, proving the defect
sits below both adapters.

Solution: [S-023](./SOLUTIONS.md#s-023--canonical-one-shot-scope-contract)

### F-026 — Detached approved RunFlow can fail silently with a zero-byte log

Sprint-006’s approved flow was started through `runs <prefix> --start`; the command returned a job ID
and “starting”. Five seconds later death-sweep closed it as `start attempt process is dead`. The
documented detached log existed but was zero bytes, so neither the Run detail nor log explained why
the child never established lifecycle authority. Foreground `start --force-replan` then ran normally.

Solution: [S-005](./SOLUTIONS.md#s-005--foreground-and-joinable-exact-runflow-execution)

### F-027 — One-shot Run and sprint execution resolve incompatible budget capability

With an explicit valid `--scope src/core/`, one-shot `deckent run` selected executor `codex` and
rejected dispatch because live token budgeting requires measured streaming usage. The same tmp
config successfully admits Codex Docker sprint workers through the configured final-only
wall-clock containment policy. The one-shot task then required an explicit canonical
`task settle` to reach truthful `NOT_DISPATCHED`. Thus Run and Sprint do not project the same
config-resolved provider/backend/budget admission.

Solution: [S-024](./SOLUTIONS.md#s-024--converge-execution-admission-across-run-sprint-and-process)

### F-028 — Process help promises read-only auto-run, but free-text tasks cannot express that fact

`process submit "Inspect the repository package version ... without modifying files" --kind task`
returned `pending-approval`. The policy code classifies task entries from `scopeDir`, not from an
explicit effect declaration or their description; with no scope, even clearly read-only work falls
to `critical-irreversible`. The help text's blanket “read-only auto-runs” promise is only true for a
small capability-verb allowlist and the special `docs/audits/` scope.

Solution: [S-025](./SOLUTIONS.md#s-025--typed-effect-authority-for-process-submissions)

### F-029 — Process approval is split across two stores and appears only after the loop runs

The pending Process entry was durably appended and rewritten to `policy=approval-required`, but
`autonomous pending` initially reported no request and `approvals list` refused because approval
authority is disabled. Only after `autonomous start` evaluated the backlog did a second identity,
`backlog-proc-…`, appear in the Autonomous pending store. `autonomous approve` could decide that
twin request even while the canonical approvals surface remained unavailable. Submission therefore
returns an apparently pending execution before its decision request exists, and Process,
Autonomous, and Approvals project different identities and availability.

Solution: [S-026](./SOLUTIONS.md#s-026--approval-capability-preflight-before-durable-process-admission)

### F-030 — Autonomous planner binds the resolved model to the registry-default adapter

The configured Fable planner ran synchronously for 120 seconds with no progress/run identity, then
returned `spawnSync claude ETIMEDOUT`. More decisively, an explicit
`--provider codex --model gpt-5.6-sol` request passed standalone model resolution and the catalog
lists that exact Codex model, yet the command returned only `E_MODEL_PROVIDER_MISMATCH`. Source
inspection shows why: `realPlannerComplete(model)` calls `resolveAdapter()` without the already
resolved model/provider, so it selects the registry default adapter; `buildPlannerSpawnArgs` then
detects that the Codex model was paired with that default Claude adapter.

Solution: [S-027](./SOLUTIONS.md#s-027--bind-autonomous-planner-model-provider-and-invocation-receipt)

### F-031 — Autonomous cleanup owns a filename prefix shared by one-shot Run

`autonomous cleanup` advertises no dry-run and calls `cleanupAutonomousArtifacts`, which unlinks
every `.tasks/task-run-*` file plus `_*.pid` without reading invocation or settlement authority.
The tmp directory contained settled one-shot Run files with that exact prefix. Merely running one
bounded Autonomous iteration invoked the same cleanup implicitly during teardown and deleted both
prior Run task projections without an archive or cleanup receipt; only their invocation-database
evidence remained. This is confirmed cross-surface audit-evidence loss, not only a risky manual
command. It also explains why generic cleanup and Autonomous cleanup disagree about the same residue.

Solution: [S-028](./SOLUTIONS.md#s-028--namespace--and-authority-bound-autonomous-cleanup)

### F-032 — Finalizer recovery publishes terminal truth before fallible post-finalize closure

Sprint-006 wrote a COMPLETE receipt and printed success before the new projection-integrity guard
failed. The finalizer then archived/removes live task artifacts, leaving status temporarily active
but recovery unable to resume without `recover --restore-tasks`. After restoration, resume collided
with the already-published terminal payload; `finalize --force` advanced status but terminal archive
verification still reported `application_not_applied`, `brain_adoption_failed`, and
`sequence_counter_mismatch`. The recovery path is a multi-command state repair, not one idempotent
publication transaction.

Solution: [S-020](./SOLUTIONS.md#s-020--one-terminal-publication-state-machine)

### F-033 — Proven-dead coordinator remains live by namespace lease for the full heartbeat window

After the Sprint-006 coordinator process had exited, status/recovery continued treating it as live
for roughly 120 seconds because namespace-lease evidence overrode a locally proven dead PID.
Recovery refused during this window even though no executor could make progress. The state became
orphaned only after the generic heartbeat timeout elapsed.

Solution: [S-029](./SOLUTIONS.md#s-029--liveness-precedence-for-proven-dead-coordinators)

### F-034 — Structured directives silently accept malformed metadata as a safe topology

The first Sprint-007 directive used readable wrapped `Files:`/`Reads:` values and an em-dash task
heading. Structured planning returned `Execution topology: PASS`, but task 1 had no `filesWrite`,
task 2 wrote only its new file, both dependencies were empty, both tasks shared wave 1, and titles
became the first file list / literal `Task 1`. Starting that plan would have created unscoped workers
with a known writer collision. Re-authoring every metadata field on one physical line and using
`## Task N: Title` produced the intended scopes and `008-002 → 008-001` dependency. The parser has
an undocumented formatting grammar and fails open at the topology boundary.

Solution: [S-030](./SOLUTIONS.md#s-030--schema-strict-structured-directive-compiler)

### F-035 — Docker worker tool home has a fixed 100 MB capacity with no workload-aware admission

Sprint-008's Docker worker had hundreds of gigabytes available on the container filesystem, but
the provider tool home was mounted as a fixed 100 MB tmpfs at `/tmp/deckent-home`. Codex rollout
and npm logs exhausted that isolated mount and produced `ENOSPC`; the task could continue only
after the worker manually removed provider logs. The capacity is neither derived from provider
behavior nor surfaced in admission/status, so a healthy worker can fail for a hidden mount budget.

Solution: [S-031](./SOLUTIONS.md#s-031--capacity-aware-provider-tool-home)

### F-036 — An approved RunFlow can become a non-retirable zombie after task projection drift

The failed detached RunFlow `f569…` could not be retired: `runs … --retire` returned
`RETIRE_TASK_SNAPSHOT_MISMATCH`, while `--close-stale` reported that nothing was stale. This leaves
an approved flow that cannot execute and cannot be canonically cancelled because retirement
revalidates a mutable task projection instead of binding to the flow's admitted snapshot and
terminal evidence.

Solution: [S-032](./SOLUTIONS.md#s-032--snapshot-bound-runflow-retirement)

### F-037 — Structured prompt-gate treats verification reads as requested writes

A directive whose implementation write scope was narrow but whose verification command referenced
test files was rejected until `--force-prompt-gate` was used. The gate inferred write authority
from file mentions in the verification section. This either over-grants workers or forces an unsafe
bypass for an otherwise correctly scoped task.

Solution: [S-033](./SOLUTIONS.md#s-033--effect-aware-directive-scope-compilation)

### F-038 — PLAN preflight deadlocks the exact sprint intended to repair TypeScript errors

A foreground sprint created to fix five known TypeScript diagnostics failed in PLAN because PLAN
itself ran `tsc --noEmit` and required a clean tree before spawning the repair worker. It then left
`sprint-009/task-009-001` as PENDING, and that live-looking residue also blocked the ordinary build
guard. The bounded ADR-D-007 recovery seam was required to apply the exact fixes and restore a clean
typecheck. The product cannot currently dogfood its own compile-break recovery transactionally.

Solution: [S-034](./SOLUTIONS.md#s-034--typed-self-repair-admission-and-transactional-plan-failure)

### F-039 — Structured plan dry-run and actual plan resolve different models

For the same terminal-truth directives, dry-run projected `gpt-5.5`, while the persisted actual
plan resolved `gpt-5.6-sol`. A dry-run therefore does not prove the authority, cost, capability or
behavior that the subsequent actual plan will use.

Solution: [S-035](./SOLUTIONS.md#s-035--config-snapshot-parity-for-plan-dry-run)

### F-040 — Provider-authority HOLD looked like an orphaned human approval

With approval authority enabled, two risk-tagged Process submissions appeared only as `parked`,
while `autonomous pending` and `approvals list` correctly remained empty. Source and durable
`lastResult` evidence resolve the apparent contradiction: their effects were auto-safe under the
risk policy, then provider admission returned `candidate_authority_unavailable`; a human approval
could not repair that authority. The actual product bug was semantic visibility: the enable banner
said all risk-tagged items park for sign-off, status reported only a generic parked count, and
backlog list hid `lastResult.reason`. The tmp fix narrows the safety promise and displays non-human
execution HOLDs separately from pending approvals on both status and list surfaces.

Solution: [S-036](./SOLUTIONS.md#s-036--separate-execution-holds-from-human-approvals)

### F-041 — Multi-key config objects cannot be assembled safely with leaf updates

`config set approval.authority.tenant_id local` failed because schema validation immediately
required the sibling `enabled` property. Setting the complete object as one JSON value succeeded.
The generic config surface therefore exposes leaf mutation syntax for objects whose invariants can
only be satisfied atomically, with no typed patch transaction or compare-and-swap boundary.

Solution: [S-037](./SOLUTIONS.md#s-037--transactional-config-object-patches)

### F-042 — One execute-dispatcher test escapes its hermetic boundary into provider evaluation

The focused Autonomous suite passed 111 of 112 tests, but the `NO_GO` dispatcher case timed out at
both 10 and 30 seconds. Nearby cases inject evaluation/audit/cross-verify seams; this case does not,
so it reaches the real cross-provider/default path. The test can consume live time/capacity and its
result depends on external provider state. The tmp fix injects deterministic evaluation, audit and
cross-verification seams while preserving the intended `NO_GO` Brain decision. The exact test now
passes 32/32, the four-file Autonomous core battery passes 82/82, and the seven-file closure battery
passes 115/115 without a provider timeout.

Solution: [S-038](./SOLUTIONS.md#s-038--mandatory-hermetic-dispatcher-seams)

### F-043 — Autonomous cleanup reports ambiguity when there is no eligible terminal lineage

The new cleanup preview correctly preserved foreign artifacts, but a lineage-less failed entry
returned `TERMINAL_ENTRY_AMBIGUOUS`. The actual condition was absence of one authoritative eligible
terminal lineage, not multiple eligible candidates. A second built-CLI run exposed the selector
variant: both a listed failed ID and a listed parked ID initially returned `TERMINAL_ENTRY_NOT_FOUND`
with `entryId:null`. The tmp fix now preserves the selected ID and distinguishes
`LINEAGE_EVIDENCE_INCOMPLETE`, `ENTRY_NOT_TERMINAL`, `ENTRY_NOT_FOUND`,
`NO_ELIGIBLE_TERMINAL_LINEAGE` and `MULTIPLE_ELIGIBLE_LINEAGES` without changing cleanup safety.

Solution: [S-039](./SOLUTIONS.md#s-039--precise-cleanup-eligibility-diagnostics)

### F-044 — Task restore revives stale heartbeats as live execution

`recover sprint-010 --restore-tasks --force` correctly restored the 22 digest-bound task artifacts
needed for resume, but it restored three historical `.hb` files with `EXECUTING` status unchanged.
No worker or coordinator process existed and `status` called the sprint `PAUSED`, yet the clean/build
admission treated those heartbeat bytes as active workers and blocked compilation. The only product
path back to a buildable tree was another 80–90 second `recover --force`, which archived the same
restored evidence again.

Solution: [S-040](./SOLUTIONS.md#s-040--restore-time-liveness-reconciliation)

### F-045 — Resume cannot consume the recovery archive it requires

Canonical `recover --force` archives paused task files and emits restore semantics/manifests, but
`recover --resume` reads only the live `.tasks` projection. It therefore failed immediately with
“Durable task file is missing” until the operator discovered and ran a separate
`recover --restore-tasks --force`. The restore surface cannot be combined with `--dry-run`, so this
necessary mutation also has no preview. Recovery produced all required authority but resume did not
follow it.

Solution: [S-041](./SOLUTIONS.md#s-041--archive-aware-atomic-resume)

### F-046 — Finalizer reused a failed gate after the verified source changed

The persisted finalizer gate keyed `codeDigest` to the logical settlement digest, not current disk
bytes. After the exact scoped test set had become green, resume reused the old failure because task
lineage had not changed. The tmp fix binds reusable gate evidence to every host-authorized write and
attributed result path, hashes symlinks without following them, records absent/non-file states, and
rechecks the digest after the audit. The real resume then archived revision 1 as `INPUT_CHANGED` and
computed revision 3 from the fresh source snapshot.

Solution: [S-042](./SOLUTIONS.md#s-042--disk-bound-finalizer-gate-authority)

### F-047 — Scoped self-audit HOLD discards the process evidence needed to diagnose it

Fresh Sprint-010 audit returned `EXECUTION_EVIDENCE_UNPARSEABLE`, but its persisted execution block
contained an empty command, null exit code and no output digest or bounded output tail. Running the
exact eleven-file Vitest command separately produced 11/11 files and 146/146 tests PASS, and the
same adapter parsed that output correctly. The registry's HOLD mapping throws away the prepared
invocation and process result, making crash, timeout, spawn error, empty output and parser drift
indistinguishable at the operator surface. The tmp fix now retains shell-free argv, exit/timeout,
stdout/stderr byte counts and a framed output digest without persisting potentially secret raw
output; positive executed-unit evidence is still mandatory for green.

Solution: [S-043](./SOLUTIONS.md#s-043--evidence-preserving-self-audit-holds)

### F-048 — Force-finalize could not seal an ABORTED archive that honestly retained variants

`finalize --force` first failed on two manifest-recorded task variants even though
`archive verify` authenticated every byte. Repeated recovery/finalize attempts added more
hash-addressed variants for pre-archive snapshots and the prepared receipt. A universal conflict
ban makes explicit ABORTED settlement impossible precisely when recovery preserved divergent
forensic evidence. The tmp fix keeps COMPLETE fail-closed for new/ambiguous conflicts, while an
explicit ABORTED receipt may seal a fully verified manifest containing retained variants.

Solution: [S-044](./SOLUTIONS.md#s-044--outcome-aware-archive-conflict-sealing)

### F-049 — Terminal Brain adoption is coupled to unrelated stale ADR export parity

After archive sealing reached `staged`, adoption failed because tmp `memory.db` had 51 ADR rows
while the generated exports retained 52. The missing row was `ADR-G-040`, present both in the tmp
generated export and the main repo-local canonical DB. Guarded export correctly refused a possible
wipe, but Deckent offered no additive reconciliation command: `memory rebuild` requires deleting
the DB (forbidden here), and its legacy parser recognizes only `ADR-NNN`, parsing zero entries from
the current `adr-g-*` export. `memory backup` also printed an error for a missing output directory
but exited zero. A WAL-safe backup plus a one-row ADR-D-007 recovery restored parity; guarded export
then wrote all four projections without warnings and staged seal replay completed.

Solution: [S-045](./SOLUTIONS.md#s-045--additive-db-first-memory-reconciliation)

### F-050 — Force-abort reaches terminal truth without a terminal job projection

After successful force settlement, status and archive verifier agree on ABORTED, the receipt is
public, Brain adoption is bound and pending approvals are empty. However status exposes phase
`TRANSITION`, and neither `.deckent/runtime/jobs/sprint-010.json` nor archived `job.json` exists.
The normal finalizer chronology now defers job publication until archive closure, but force-abort
does not publish the equivalent terminal job/read projection. CLI consumers therefore need special
knowledge to interpret a correctly closed forced run. Source audit shows this is not a one-line
publisher omission: `SprintPhase` has no ABORTED/TERMINAL value, the finalizer job validator accepts
only `COMPLETE`, and completion watchers currently recognize only `COMPLETE|FAILED`. A local write
without a versioned terminal-job/status migration would either mislabel the abort as success or make
existing consumers ignore it.

Solution: [S-046](./SOLUTIONS.md#s-046--uniform-terminal-job-and-phase-projection)

### F-051 — Terminal status retains historical provider HOLD noise and open intervals

The final ABORTED status is otherwise consistent, yet `providerConcurrency` contains 22 principal
rows, all `HOLD/unknown`; one row still reports four unresolved open intervals after terminal
settlement. This contradicts the same status document's `active:false`, coordinator absence and
zero current attainment. Historical capacity evidence belongs in run detail/audit history, while
terminal status must distinguish foreign/open observation debt from live admission state.
The current behavior is explicitly pinned by read-model tests that require foreign history to remain
visible for IDLE, COMPLETE and the next ACTIVE run. The same projection's anomaly detector compares
stored observation `runId` against `sprintId`, while production observation ownership may use a
project-root-derived run identity. Changing only display filtering would therefore hide, not settle,
the deeper ownership-key mismatch.

Solution: [S-047](./SOLUTIONS.md#s-047--terminal-provider-observation-retirement)

### F-052 — Planner receipt and stage remain invisible until the long call terminates

Typed terminal failure fixed the collapsed-error problem, but the real provider rerun still emitted
only `Planning… <elapsed>` for 170 seconds. Provider, model, attempt, parser/transport stage and the
already-declared invocation identity appeared only after exit. Operators therefore cannot tell a
slow provider from a parser retry, correlate the live call with audit/limits, or target a cancellation
while the expensive operation is still running.

Solution: [S-048](./SOLUTIONS.md#s-048--live-planner-invocation-progress-contract)
