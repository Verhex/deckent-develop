# Deckent tmp-worktree dogfood solutions — 2026-08-27

Companion evidence ledger: [FINDINGS.md](./FINDINGS.md)

## Disposition vocabulary

- `LANDING_CANDIDATE_AFTER_INDEPENDENT_VERIFY`: implemented in the tmp worktree; may be merged
  after host-side independent verification and snapshot reconciliation.
- `IMPLEMENT_IN_TMP`: confirmed product defect with a sufficiently clear correction; safe to
  implement and prove in this isolated worktree.
- `REPAIR_IN_PROGRESS`: confirmed defect; a Deckent-run correction exists in the tmp worktree but
  has not closed independent post-finalization proof.
- `PRODUCT_DECISION_REQUIRED`: multiple legitimate designs exist; do not auto-land.
- `KEEP`: observed behavior is correct and should be retained.

## Solutions

### S-001 — First-class worktree/local runtime bootstrap

Finding: [F-001](./FINDINGS.md#f-001--cross-checkout-binary-identity-is-safe-but-the-recovery-path-is-high-friction)

Disposition: `PRODUCT_DECISION_REQUIRED`

Keep binary identity fail-closed, but add a supported command that prepares a worktree-local
runtime without copying user state: dependency strategy, local build identity, minimal project
config, and a printed exact invocation. Never silently drive one checkout with another build.

### S-002 — Make Do flag-off behaviour explicit and non-deceptive

Finding: [F-002](./FINDINGS.md#f-002--flag-off-do---run---yes-ignores-the-non-interactive-contract)

Disposition: `DIRECT_FIX_IMPLEMENTED_TMP`

When RunFlow is off, either reject `--yes`/`--run` before rendering an unusable scaffold with a
typed enable/remedy message, or make the legacy path honor non-interactive approval only after
all TODO scope/criteria are complete. The recommended cutover is an honest typed refusal because
the scaffold is explicitly non-executable.

### S-003 — Typed RunFlow planner failure receipt

Finding: [F-003](./FINDINGS.md#f-003--canonical-runflow-do-collapsed-planner-failure-causes)

Disposition: `DIRECT_FIX_IMPLEMENTED_TMP`

Persist and surface provider identity, model, elapsed time, exit/timeout class, output-envelope
presence, parser stage, and a redacted log/receipt ref. Map unavailable, timeout, empty, malformed,
and schema-invalid outcomes to separate reason codes. The tmp implementation retains no raw output;
it exposes exit/signal, stdout/stderr byte counts, a framed SHA-256 digest and the receipt ref. Four
focused files pass 83/83, build passes, an isolated built-CLI `no_provider` smoke is typed, and a real
provider rerun emitted `spawn_failed/nonzero_exit` plus its durable invocation receipt.

### S-004 — Make “skip AI” a whole-plan contract

Finding: [F-004](./FINDINGS.md#f-004--plan---structured-still-performs-routing-v3-ai-enrichment)

Disposition: `PRODUCT_DECISION_REQUIRED`

Preferred behavior: `--structured` means no model call anywhere in planning, including routing
content enrichment and tie judging; structural routing remains deterministic. Alternative: rename
the option/help to “structured decomposition only” and add a distinct `--no-ai` whole-plan flag.
The first variant better matches current user expectation and automation needs.

### S-005 — Foreground and joinable exact RunFlow execution

Finding: [F-005](./FINDINGS.md#f-005--approved-runflow-execution-has-no-foregroundjoinable-mode)

Disposition: `IMPLEMENT_IN_TMP`

Add a public coordinator-owned foreground/join mode that mints the same exact capability and
executes the CAS-bound snapshot in the current process, plus a durable `runs <id> --join` mode.
Detached remains available for ordinary terminals. Test parent-exit descendant reaping in CI,
containers, remote executors, Windows, WSL, Linux, and macOS adapters.

### S-006 — Repair run inspection command parity

Findings: [F-006](./FINDINGS.md#f-006--runs-guidance-points-to-a-nonexistent-status--surface),
[F-007](./FINDINGS.md#f-007--unique-flow-prefix-lookup-is-inconsistent-for-failed-runs)

Disposition: `IMPLEMENT_IN_TMP`

Choose one canonical detail surface. Recommended: make `deckent runs <n|prefix>` canonical and
change the tip accordingly; resolve prefixes across active and terminal flows with the same
inbox index. If `status <id>` is desired, implement it as the same read model rather than a twin.

### S-007 — Reject duplicate config keys before resolution

Finding: [F-008](./FINDINGS.md#f-008--duplicate-json-config-keys-are-accepted-silently)

Disposition: `IMPLEMENT_IN_TMP`

Parse authored JSON with duplicate-key detection before schema validation. Return a typed error
containing JSON pointer/key and both source locations; do not apply last-key-wins authority.

### S-008 — Separate authored config from effective materialization

Finding: [F-009](./FINDINGS.md#f-009--planning-materializes-a-minimal-project-config-into-a-full-config)

Disposition: `PRODUCT_DECISION_REQUIRED`

Planning should read authored config and expose an effective projection without rewriting the
authored file. Any migration/materialization must be an explicit, diff-visible config mutation
with revision/CAS and recovery receipt.

### S-009 — Runtime-owned heartbeat writes and truthful worker guidance

Finding: [F-010](./FINDINGS.md#f-010--host-rule-heartbeat-drift-has-a-direct-runtime-effect)

Disposition: `REPAIR_IN_PROGRESS`

The implemented docs now name the strict current schema and forbid ambiguous identity. The
stronger long-term contract is host-owned heartbeat publication: workers submit activity events
through a typed ingress; the host binds task/worker/attempt/backend and writes the durable file.
Workers must never overwrite an authority file from prompt text alone.

### S-010 — Single live-agent projection

Finding: [F-011](./FINDINGS.md#f-011--wave-2-worker-is-absent-from-agents-while-executing)

Disposition: `IMPLEMENT_IN_TMP`

Build `agents[]`, task settlements, and logical progress from one attempt/read-model snapshot.
Include current wave workers and retain completed workers as history without hiding the active one.

### S-011 — Actionable provider-concurrency read model

Finding: [F-012](./FINDINGS.md#f-012--provider-concurrency-projection-is-too-noisy-to-operate)

Disposition: `PRODUCT_DECISION_REQUIRED`

Default view should show only principals relevant to the current run, with provider/account alias,
current/peak, admitted ceiling, evidence freshness, and mapped task attempts. Historical/unknown
principals belong behind an expanded diagnostic view.

### S-012 — Truthful terminal summary metadata

Finding: [F-013](./FINDINGS.md#f-013--final-summary-loses-task-metadata-and-treats-unmeasured-coverage-as-zero)

Disposition: `IMPLEMENT_IN_TMP`

Project title, assigned agent, attempt duration, and verification evidence from the canonical
settlement/archive read model. Render coverage as `not measured` when no coverage receipt exists;
reserve numeric zero for an actual measurement.

### S-013 — Separate logical settlement from archive/adoption publication

Finding: [F-014](./FINDINGS.md#f-014--sprint-complete-is-printed-before-terminal-archive-closure)

Disposition: `IMPLEMENT_IN_TMP`

Do not print the terminal success banner until required publication steps settle. If logical work
is complete but archive/adoption is held, render a two-part state such as `WORK_COMPLETE /
PUBLICATION_HOLD`, include the exact failed stage and recovery command, and return a matching exit
code. Never print “all complete” followed later by exit 1.

### S-014 — Fresh-project Brain adoption contract

Finding: [F-015](./FINDINGS.md#f-015--brain-adoption-fails-in-a-fresh-worktree-without-an-actionable-remedy)

Disposition: `PRODUCT_DECISION_REQUIRED`

Determine whether a missing `.brain/memory.db` means create-on-authorized-write, no-op adoption,
or typed project-init HOLD. Whichever policy wins, expose the exact authority and remedy before
printing success. Dogfood core-memory authority must remain separate from product memory.

### S-015 — Expose backend execution identity

Finding: [F-016](./FINDINGS.md#f-016--docker-identity-is-opaque-from-the-task-facing-status-surface)

Disposition: `IMPLEMENT_IN_TMP`

Add backend name plus container/process/session identity and mapped task attempt to the run
inspector/status detail. Keep globally unique opaque names, but make the mapping observable.

### S-016 — Retain canonical cleanup behaviour

Finding: [F-017](./FINDINGS.md#f-017--tasks-terminal-cleanup-and-archive-preservation-worked)

Disposition: `KEEP`

Continue using terminal archive then canonical cleanup. In this exercise `.tasks` became empty
without manual deletion and all evidence remained in the sprint archive. Manual cleanup should
remain status-gated and use `deckent cleanup`, never raw file deletion.

### S-017 — Authority-contract change set

Finding: [F-018](./FINDINGS.md#f-018--authority-contract-package-passed-workers-but-failed-post-finalization-verification)

Disposition: `LANDING_CANDIDATE_AFTER_INDEPENDENT_VERIFY`

Candidate scope:

- proposal-only Brain authority and public capability language;
- dogfood core-memory vs product-memory separation;
- no worker plan-file writes and scoped verification parity;
- current result/heartbeat/digest/lock/docImpact guidance;
- backend-aware worker-core externalization with inline retention on auto/non-Docker paths;
- live RBAC references canonicalized to ADR-G-020 with historical crosswalk evidence retained;
- regression tests and stale-alias lint.

Independent verification already disproved the initial landing verdict (30/520 failures after a
stale finalizer rewrite). Sprint-005 repaired part of the finalizer boundary; sprint-006 is repairing
the canonical worker source and attempt binding. Before landing, require post-finalization semantic
tests, TypeScript/lint gates, archive terminal verification, runtime-only diff classification, and
reconciliation against the then-current main snapshot.

### S-018 — Transactional post-finalization projection gate

Finding: [F-019](./FINDINGS.md#f-019--a-stale-compiled-finalizer-rewrote-green-worker-output-after-evaluation)

Disposition: `REPAIR_IN_PROGRESS`

Treat managed projection generation as a terminal transaction: validate every source/runtime input
before the first write, stage outputs, validate semantic contracts, atomically publish them, then run
an independent final-disk battery before terminal COMPLETE. A source/build mismatch must become an
inactive, resumable `RUNTIME_PROMOTION_REQUIRED` state with an exact build/promote/verify command;
mtime alone is diagnostic evidence, not cross-platform authority. Installed consumers without a
source checkout continue using packaged assets.

### S-019 — Semantic worker-contract tests and canonical source fix

Findings: [F-020](./FINDINGS.md#f-020--structural-parity-tests-miss-semantic-worker-contract-drift),
[F-021](./FINDINGS.md#f-021--host-bound-docker-attempt-identity-exists-but-is-not-bound-into-normal-worker-prompts)

Disposition: `REPAIR_IN_PROGRESS`

Make `worker-default.template.md` the semantic authority and pin positive/negative assertions for
public memory capability, no plan file, host-owned locks, strict heartbeat, camelCase result ingress,
`docImpact`, and ADR-G-020. Allocate/reuse the Docker settlement reference before prompt binding,
bind its exact attempt/backend into the prompt, and pass that identical reference to the backend.
Sprint-006 is implementing this through Deckent; generated projections remain a post-settlement
promotion obligation, never hand-copied source.

Real production-path evidence from Sprint-008 now proves the normal Docker spawner binds one exact
attempt into both prompt and host heartbeat (`attemptId=43d83929…`, `backend=docker`) with no
`HEARTBEAT_IDENTITY_HOLD`. The semantic template and final archive closure remain independently
gated, so the overall disposition stays `REPAIR_IN_PROGRESS` until the final-disk package closes.

### S-020 — One terminal-publication state machine

Finding: [F-022](./FINDINGS.md#f-022--terminal-lifecycle-status-and-archive-verification-can-disagree)

Disposition: `IMPLEMENT_IN_TMP`

Publish user-visible COMPLETE only after one CAS-governed sequence has closed logical settlement,
managed projections, archive manifest, terminal seal application, Brain adoption (or a policy-valid
typed no-op), sequence counter and cleanup eligibility. `status`, `inspect`, terminal verify and the
success banner must project that same authority version. Intermediate states are explicit
`WORK_COMPLETE / PUBLICATION_HOLD` with one idempotent recovery command.

### S-021 — Authority-aware cleanup discovery

Finding: [F-023](./FINDINGS.md#f-023--cleanup-discovery-is-selector-dependent-and-misses-settled-one-shot-residue)

Disposition: `IMPLEMENT_IN_TMP`

Discover residues by canonical task/invocation/settlement authority across sprint and one-shot IDs,
not filename prefix alone. General dry-run must enumerate every terminally disposable artifact,
explain preserved artifacts, and produce the same plan as the union of exact selectors. Apply stays
status-gated and archive-first; raw deletion remains forbidden.

### S-022 — Goal/Mission capability-surface parity

Finding: [F-024](./FINDINGS.md#f-024--goalmission-policy-vocabulary-has-no-matching-primary-cli-surface)

Disposition: `PRODUCT_DECISION_REQUIRED`

Either expose `deckent goal` and `deckent mission` as first-class adapters over the same application
services used by autonomous missions, or change policy/product language to the actually callable
Intent/RunFlow model. Do not keep nouns as canonical authority stages when operators cannot inspect,
create or relate them outside one specialized subsystem.

### S-023 — Canonical one-shot scope contract

Finding: [F-025](./FINDINGS.md#f-025--one-shot-run-defaults-to-a-scope-value-its-own-compiler-rejects)

Disposition: `IMPLEMENT_IN_TMP`

Resolve omitted scope to a canonical, compiler-valid project-root selector and reject invalid
defaults before persisting task content. Accept repeated typed scope selectors (directories and exact
files), normalize once through the same scope authority for Run, Process and Autonomous, and make
the invocation receipt’s initial reason match the admission failure without requiring operator
settlement repair.

### S-024 — Converge execution admission across Run, Sprint and Process

Finding: [F-027](./FINDINGS.md#f-027--one-shot-run-and-sprint-execution-resolve-incompatible-budget-capability)

Disposition: `IMPLEMENT_IN_TMP`

Resolve provider, model, backend, usage-measurement capability, final-only containment and finite
budget from one application service before any adapter persists work. Run, Sprint, Process,
Autonomous and MCP should consume the same typed admission result and settlement reason; an adapter
must not substitute its own executor capability model.

### S-025 — Typed effect authority for Process submissions

Finding: [F-028](./FINDINGS.md#f-028--process-help-promises-read-only-auto-run-but-free-text-tasks-cannot-express-that-fact)

Disposition: `PRODUCT_DECISION_REQUIRED`

Add an authenticated, schema-validated effect declaration to the ExecutionRequest rather than
inferring safety from prose or directory names. Capability descriptors can supply a signed/registered
effect class; task/process submissions should carry declared operations and scopes whose effective
effect is recomputed by policy. Until then, narrow the help text to the exact allowlist behavior.

### S-026 — Approval-capability preflight before durable Process admission

Finding: [F-029](./FINDINGS.md#f-029--process-approval-is-split-across-two-stores-and-appears-only-after-the-loop-runs)

Disposition: `IMPLEMENT_IN_TMP`

Before appending a parked Process entry, atomically create one canonical approval request with
resolved authority, tenant/principal, expiry and exact decision surface. If authority is unavailable,
return a typed `APPROVAL_AUTHORITY_UNAVAILABLE/HOLD`; do not defer request creation until a loop tick
or mint an adapter-prefixed twin identity. `process`, `autonomous pending`, `approvals list` and the
dashboard must project the same request ID and state.

### S-027 — Bind Autonomous planner model, provider and invocation receipt

Finding: [F-030](./FINDINGS.md#f-030--autonomous-planner-binds-the-resolved-model-to-the-registry-default-adapter)

Disposition: `IMPLEMENT_IN_TMP`

Carry the canonical `ExecutionModelIdentity` into `realPlannerComplete` and resolve the adapter from
that exact provider. Admit reachability/entitlement/budget before spawn, use async execution, persist
an invocation ID immediately, stream observable progress, and settle timeout/cancel/parser failures
as typed receipts. Dry-run should suppress backlog mutation, not observability or authority.

### S-028 — Namespace- and authority-bound Autonomous cleanup

Finding: [F-031](./FINDINGS.md#f-031--autonomous-cleanup-owns-a-filename-prefix-shared-by-one-shot-run)

Disposition: `IMPLEMENT_IN_TMP`

Give Autonomous attempts a typed owner namespace in task metadata and discover cleanup candidates
from canonical execution/settlement authority, never a shared filename prefix. Add mandatory
dry-run, archive-first application, active-attempt protection and a receipt listing every moved or
preserved artifact. Reuse the general cleanup planner so adapters cannot disagree.

### S-029 — Liveness precedence for proven-dead coordinators

Finding: [F-033](./FINDINGS.md#f-033--proven-dead-coordinator-remains-live-by-namespace-lease-for-the-full-heartbeat-window)

Disposition: `IMPLEMENT_IN_TMP`

Use namespace lease only when host-process liveness is genuinely unknown. An exact same-host PID
identity proven dead must immediately dominate the lease projection and transition to a resumable
orphan/publication-HOLD state. Persist the liveness evidence and expose the single safe recovery
command; do not force operators to wait for a generic heartbeat timeout.

### S-030 — Schema-strict structured directive compiler

Finding: [F-034](./FINDINGS.md#f-034--structured-directives-silently-accept-malformed-metadata-as-a-safe-topology)

Disposition: `IMPLEMENT_IN_TMP`

Parse directives as an explicit grammar with continuation support or reject them with source spans;
never reinterpret a metadata value as a task title. Required task title, non-empty write authority
for implementation work, declared dependency resolution and shared-writer ordering are admission
invariants. `Execution topology: PASS` is legal only after the compiled projection round-trips to the
authored semantic fields. Emit a stable diagnostic listing every ignored/unknown line and the exact
canonical syntax.

### S-031 — Capacity-aware provider tool home

Finding: [F-035](./FINDINGS.md#f-035--docker-worker-tool-home-has-a-fixed-100-mb-capacity-with-no-workload-aware-admission)

Disposition: `IMPLEMENT_IN_TMP`

Resolve provider-home capacity from provider policy, task budget and observed log/cache behavior;
admit only when headroom is sufficient. Add bounded log rotation, explicit mount metrics and a
typed `PROVIDER_HOME_CAPACITY_HOLD` before spawn. Keep credentials isolated from disposable logs so
cleanup is safe and never requires a worker to delete authentication state.

### S-032 — Snapshot-bound RunFlow retirement

Finding: [F-036](./FINDINGS.md#f-036--an-approved-runflow-can-become-a-non-retirable-zombie-after-task-projection-drift)

Disposition: `IMPLEMENT_IN_TMP`

Persist the admitted immutable task snapshot in the RunFlow and make retire/cancel operate against
that identity plus current executor liveness. Projection mismatch should block execution but must
not block an authenticated terminal cancellation. Emit one terminal retirement receipt and remove
the flow from every active projection atomically.

### S-033 — Effect-aware directive scope compilation

Finding: [F-037](./FINDINGS.md#f-037--structured-prompt-gate-treats-verification-reads-as-requested-writes)

Disposition: `IMPLEMENT_IN_TMP`

Compile directive references into separate read, execute and write effects. Verification commands
may expand `filesRead` or executable authority only; they must never expand `filesWrite` from a
filename mention. Reject ambiguous shell effects with source-span diagnostics instead of requiring
a broad `--force-prompt-gate` bypass.

### S-034 — Typed self-repair admission and transactional PLAN failure

Finding: [F-038](./FINDINGS.md#f-038--plan-preflight-deadlocks-the-exact-sprint-intended-to-repair-typescript-errors)

Disposition: `PRODUCT_DECISION_REQUIRED`

Introduce an owner-authorized, bounded repair admission whose declared baseline diagnostics are
the repair input. It may spawn only the exact scoped repair DAG and must prove diagnostics are
monotonically reduced before normal verification. PLAN failure must transactionally settle/remove
its provisional tasks, and build guards must distinguish terminal PLAN residue from live work.

### S-035 — Config-snapshot parity for plan dry-run

Finding: [F-039](./FINDINGS.md#f-039--structured-plan-dry-run-and-actual-plan-resolve-different-models)

Disposition: `IMPLEMENT_IN_TMP`

Resolve one immutable effective-config/admission snapshot and return its digest from dry-run.
Actual planning can consume that digest or fail with `PLAN_CONFIG_SNAPSHOT_STALE`; it must not
silently re-resolve another provider/model. Surface model, provider, budget capability and policy
identity in both receipts.

### S-036 — Separate execution HOLDs from human approvals

Finding: [F-040](./FINDINGS.md#f-040--provider-authority-hold-looked-like-an-orphaned-human-approval)

Disposition: `DIRECT_FIX_IMPLEMENTED_TMP`

Keep provider/capability authority HOLDs out of the human approval inbox: an approval is not a
credential, entitlement or execution-authority substitute. Status now prints parked execution
HOLDs with exact IDs/reasons under a separate heading, backlog list carries the persisted reason,
and the enable copy explains that only non-auto-safe risk-tagged effects require sign-off. Genuine
approval-required work still follows the canonical request transaction described by S-026.

### S-037 — Transactional config object patches

Finding: [F-041](./FINDINGS.md#f-041--multi-key-config-objects-cannot-be-assembled-safely-with-leaf-updates)

Disposition: `IMPLEMENT_IN_TMP`

Add schema-aware object patching with precondition/version support. Validate the merged candidate
once, write atomically, and return the effective diff plus config digest. Leaf setters should either
construct required siblings through an explicit transaction or reject up front with the exact
atomic command, never fail midway through object assembly.

### S-038 — Mandatory hermetic dispatcher seams

Finding: [F-042](./FINDINGS.md#f-042--one-execute-dispatcher-test-escapes-its-hermetic-boundary-into-provider-evaluation)

Disposition: `DIRECT_FIX_IMPLEMENTED_TMP`

Make evaluation, audit and cross-verification dependencies mandatory in dispatcher unit fixtures,
and install a test-environment network/provider guard that fails immediately on an unstubbed call.
Retain a separate explicitly admitted integration battery for real provider behavior. The escaping
`NO_GO` fixture is fixed in tmp and verified by the exact 32/32 test, the 82/82 Autonomous core
battery, and the 115/115 closure battery. A suite-wide provider-call guard remains a follow-up
hardening measure rather than a prerequisite for this direct fixture repair.

### S-039 — Precise cleanup eligibility diagnostics

Finding: [F-043](./FINDINGS.md#f-043--autonomous-cleanup-reports-ambiguity-when-there-is-no-eligible-terminal-lineage)

Disposition: `DIRECT_FIX_IMPLEMENTED_TMP`

Separate `ENTRY_NOT_FOUND`, `ENTRY_NOT_TERMINAL`, `NO_ELIGIBLE_TERMINAL_LINEAGE`,
`MULTIPLE_ELIGIBLE_LINEAGES` and `LINEAGE_EVIDENCE_INCOMPLETE`. Results retain the selected ID when
one exists, list preserved artifacts and keep archive-first fail-closed behavior.

### S-040 — Restore-time liveness reconciliation

Finding: [F-044](./FINDINGS.md#f-044--task-restore-revives-stale-heartbeats-as-live-execution)

Disposition: `IMPLEMENT_IN_TMP`

Restore immutable task/result/prompt evidence verbatim, but project heartbeat liveness through the
current host attempt/coordinator authority. Historical heartbeat bytes should land in the archive
or a `RESTORED_TERMINAL` evidence class, never re-enter active clean admission. Return the exact
restored-vs-retired classification and prove build admission immediately after recovery.

### S-041 — Archive-aware atomic resume

Finding: [F-045](./FINDINGS.md#f-045--resume-cannot-consume-the-recovery-archive-it-requires)

Disposition: `IMPLEMENT_IN_TMP`

Make resume resolve task authority from the recovery manifest when live files are absent, verify
digests/fence ownership, and materialize only the minimum resumable projection inside one recovery
transaction. Add a real dry-run that previews restore candidates, conflicts, liveness conversion
and the resulting resume generation; never require a hidden force-restore pre-command.

### S-042 — Disk-bound finalizer gate authority

Finding: [F-046](./FINDINGS.md#f-046--finalizer-reused-a-failed-gate-after-the-verified-source-changed)

Disposition: `DIRECT_FIX_IMPLEMENTED_TMP`

Bind gate reuse to logical settlement plus sorted current identities for all task write/result
paths. Hash regular-file bytes, symlink targets without following, and explicit absent/non-file
states. Recompute after audit and HOLD if inputs changed during execution. Unit and real recovery
evidence must demonstrate stale revision invalidation and exact-source reuse only.

### S-043 — Evidence-preserving self-audit HOLDs

Finding: [F-047](./FINDINGS.md#f-047--scoped-self-audit-hold-discards-the-process-evidence-needed-to-diagnose-it)

Disposition: `DIRECT_FIX_IMPLEMENTED_TMP`

Every adapter HOLD retains the shell-free invocation, exit/timeout, output digest, byte counts and
parser reason. Raw stdout/stderr is intentionally excluded because provider/test output can contain
secrets. A follow-up may split `PROCESS_FAILED`, `NO_SUMMARY`, `SUMMARY_ZERO`, and
`SUMMARY_SCHEMA_UNSUPPORTED`; command metadata no longer collapses to `[]` after execution. Green
admission remains dependent on positive executed units.

### S-044 — Outcome-aware archive conflict sealing

Finding: [F-048](./FINDINGS.md#f-048--force-finalize-could-not-seal-an-aborted-archive-that-honestly-retained-variants)

Disposition: `DIRECT_FIX_IMPLEMENTED_TMP`

Keep COMPLETE fail-closed whenever terminal preparation discovers new divergent authority. For an
explicit ABORTED receipt, allow conflict-preserving closure only after every variant and manifest
digest verifies, and bind the exact conflict set into the terminal seal/application. Tests cover a
verified historical ABORTED variant and a newly divergent COMPLETE refusal.

### S-045 — Additive DB-first memory reconciliation

Finding: [F-049](./FINDINGS.md#f-049--terminal-brain-adoption-is-coupled-to-unrelated-stale-adr-export-parity)

Disposition: `PRODUCT_DECISION_REQUIRED`

Add `memory reconcile --dry-run/--apply` with DB-first authority, typed source provenance, per-entry
CAS and WAL-safe backup. Teach ADR import the current `ADR-G/D/UG/UP-NNN` schema and never require DB
deletion. Generated exports may prove a missing projection only when a prior DB receipt binds them;
otherwise HOLD for an owner-approved source. Backup must create a safe parent or exit non-zero with
a typed error.

### S-046 — Uniform terminal job and phase projection

Finding: [F-050](./FINDINGS.md#f-050--force-abort-reaches-terminal-truth-without-a-terminal-job-projection)

Disposition: `PRODUCT_DECISION_REQUIRED`

Route normal, recovery, completed-checkpoint and force-abort through one terminal projection
publisher. After archive/application closure, publish a job for both COMPLETE and ABORTED and set a
terminal stage, all bound to the same receipt digest. Recommended contract: version the job/read
model so `stage: TERMINAL` is outcome-neutral and `outcome: COMPLETE|ABORTED` is explicit; extend
job watchers/feed/controllers to consume ABORTED before switching the producer. Do not reuse
`phase: COMPLETE` for an abort because current consumers often treat that phase as success, and do
not collapse ABORTED into FAILED because operator containment is not execution failure. Status,
Runs and archive must never require path-specific fallback knowledge.

### S-047 — Terminal provider-observation retirement

Finding: [F-051](./FINDINGS.md#f-051--terminal-status-retains-historical-provider-hold-noise-and-open-intervals)

Disposition: `PRODUCT_DECISION_REQUIRED`

Terminal settlement must close all exact-run owned observation intervals under the run-generation
fence and classify foreign intervals separately. Default status should show current admission rows
only; historical/foreign HOLD evidence belongs behind inspect/audit detail. A terminal run with no
workers cannot report live unresolved intervals without an explicit observation-debt HOLD.
Version the projection in one migration: bind observations and receipts to the same canonical
run-generation key, make anomaly detection use that key, expose current admission separately from a
bounded `providerObservationDebt` summary, and move full principal history to inspect/audit. Existing
tests intentionally pin foreign history in the default array, so display-only filtering is not an
honest direct fix.

### S-048 — Live planner invocation progress contract

Finding: [F-052](./FINDINGS.md#f-052--planner-receipt-and-stage-remain-invisible-until-the-long-call-terminates)

Disposition: `IMPLEMENT_IN_TMP`

Publish a redacted lifecycle event immediately after receipt declaration and on every bounded retry:
invocation ID/ref, provider, model, attempt, stage, elapsed/deadline and cancellable operation ID.
Drive CLI, Terminal and Desktop from the same event stream; do not expose prompt, stdout/stderr or
credentials. Cancellation must settle the same receipt with a typed operator-cancel outcome rather
than killing an anonymous subprocess.
