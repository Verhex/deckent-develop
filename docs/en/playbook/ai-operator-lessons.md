# Deckent AI-Operator Lessons — Field Notes

> **Living document.** For anyone driving Deckent with an AI agent (Claude, Codex, a
> local model…): the distilled record of real mistakes made in live working sessions
> and the lessons they produced. Every lesson follows the pattern
> "Mistake → Why → Correct usage". Feed this document to the model driving Deckent as
> context so it does not repeat these mistakes. Updated after every sprint/working
> experience (see the changelog at the bottom).
> Turkish counterpart: `docs/tr/playbook/ai-operator-lessons.md`.

---

## 1. NEVER hand-edit task artifacts after the plan is approved

**Mistake:** A dependency was hand-added to `.tasks/task-XXX.json` after plan
approval. The run died with `TASK_ARTIFACT_CONTENT_CONFLICT` before a single worker
spawned.

**Why:** `deckent plan` approval produces a plan digest; the start machine validates
artifacts against it (exact-plan, fail-closed). A hand edit means a digest mismatch,
which means an honest refusal.

**Correct usage:** Dependencies are declared as a line inside the task block in
DIRECTIVES.md — the parser supports it:

```markdown
## Task 2: xverify CLI waiting signal (depends on Task 1)
- Files: src/cli/commands/xverify.ts
- Dependencies: Task 1
```

"(depends on Task 1)" in the title is for humans ONLY; the DAG is fed by the
`- Dependencies:` line. Confirm the dependency actually reached the waves in the plan
output ("Etkin dalgalar", e.g. `1:[1,3] 2:[2]`).

## 2. Model-tier routing: critical surface → top tier, deterministic flow → lower tier

**Mistake:** A critical loop-wiring task was assigned to sonnet while a deterministic
test task got the strongest model. The owner corrected it: "model and task selection
badly failed".

**Correct usage:** Capability order (for this repo): `gpt-5.6-sol > claude-opus-5 >
claude-sonnet-5`; terra/luna sit at sonnet-equivalent and below. Core design / runtime
authority / high-uncertainty work → top tier. Well-specified tests, fixtures,
deterministic transforms, documentation → the sonnet class. Review every assignment
against this rule BEFORE starting the plan.

## 3. No progress claims without disk evidence

**Mistake:** Waited on the assumption "the sprint is running"; in reality the detached
child had died silently (tasks PENDING, no heartbeats).

**Correct usage:** A liveness claim is the intersection of four proofs: fresh
heartbeat-file mtime + the process actually alive (`kill -0`-class check) + a flowing
log tail + `.result` on disk. Status/projection output is NOT evidence. The run-flow's
true terminal state is the last line of
`.deckent/runtime/run-flow-store/<flowId>.events.jsonl` — `RUN_FAILED` is read there.

## 4. One failure = STOP; retry storms are forbidden

**Mistake:** After one sprint failure, the run was restarted three times without
verifying the fix actually reached the failing path (once with a stale `dist/`).
Three junk sprints were born.

**Correct usage:** Stop at the first failure. Full-chain root-cause analysis happens
offline: fix → test → build → disk proof from `dist/` → ONE retry. Never restart on
"maybe this time". Never ignore the stale-build warning
(`DECKENT_BINARY_IDENTITY_WARN`) — run `npm run build` first.

## 5. WATCH the approvals inbox — the silent-wait trap

**Mistake:** `deckent xverify` looked "stuck" for 16 minutes; in reality a
reachability-probe approval (`aprp-…`) had been enqueued and was waiting for a
decision — with zero output printed.

**Correct usage:** For any long-running command the first reflex is
`deckent approvals list`. Approvals are single-use and run-bound — a previous run's
approval never carries into a new one; every run asks for its own. Decisions go
through the live-verified channel (interactive
`deckent approvals decide <id> --allow`). In automation, run a watcher loop that
catches new `aprp-` entries immediately.

## 6. Pipes mask exit codes

**Mistake:** `command | tail; echo $?` — what was read was `tail`'s exit; the real
failure was swallowed.

**Correct usage:** Capture the real exit code separately:
`command > out.log 2>&1; echo "EXIT=$?"`. Deckent's own tool-result chain follows the
same principle (exit-code truth): apply the same honesty in your scripts.

## 7. Know which budget kills what — and manage it from config

**Mistake:** A worker was SIGKILLed by the aggregate-token circuit breaker; a native
session fell into a permanent dead loop at the 45-minute wall clock; a verifier stayed
perpetually UNCLEAR under a 100k-token / 300s / one-verification-per-sprint ceiling.

**Correct usage:** There are three budget families, all managed under
`execution_budget` in `.deckent/config.json` (no hardcoded values):
- `roles.worker/brain/auditor` — token/turn ceilings for sprint workers
- `native_agent` — the native terminal session's rounds/tool-calls/wall-time/token profile
- `purposes.*` (e.g. `xverify-adjudication`) — purpose-scoped ceilings

If long work keeps detonating a budget because plans run long, raise the ceiling in
config; never bend the code or add a silent fallback.

## 8. XVerify claim discipline: static, diff-decidable point claims

**Mistake:** Runtime-behavior claims were submitted ("the regression test drives the
loop twice and proves…") — a verifier cannot decide those from a diff; the result was
UNCLEAR/HOLD.

**Correct usage:** BEFORE the commit, with `--files` + `--diff` + `--target`; every
claim must be checkable by reading file content ("file X declares parameter Z in
function Y"). Universal claims ("X appears nowhere") belong to machine gates, not a
verifier. HOLD/UNCLEAR is NOT closure — record it honestly with its receipt; closure
requires a typed verdict + a real provider call + usage + a durable receipt.

## 9. Don't write outside your scope — leave honest tech debt

**Good example (the inverse of a mistake):** A worker found that a required two-line
change lived OUTSIDE its `filesWrite` scope; instead of violating scope it reported
`GO_WITH_TECH_DEBT` with an exact description and wrote a handoff note. The closure
was done by an authorized hand within minutes.

**Correct usage:** Out-of-scope discovery goes into `.result` notes, never an inline
fix. Signal needs to dependent tasks via `.tasks/handoffs/`. An honest NO_GO/tech-debt
is always cheaper than a fake DONE — the FIX phase exists exactly for this.

## 10. Lifecycle order: recover → finalize → cleanup — and a clean `.tasks`

**Mistake:** `npm run build` was blocked by the clean gate because unsettled artifacts
sat under `.tasks`; cleanup refused with "run-orphaned".

**Correct usage:** The order is always: `deckent recover <sprint> --force` (if
needed) → `deckent finalize --sprint <id> [--force]` → `deckent cleanup`. Evidence
files are never deleted — they move to `.tasks/archive/`. `rm .tasks/*` is FORBIDDEN;
archiving happens through the canonical command or by moving into the archive
directory. Settled xverify twin tasks can also linger in `.tasks` and hold the clean
gate — archive them after settlement.

## 11. MASTER-PLAN cell grammar

**Mistake:** `core|discoverable` was written into an evidence cell — the raw `|` split
the cell and broke the lint. Another append pushed a cell over the 10,000-character
bound.

**Correct usage:** No raw pipes inside cells (use `/`); keep evidence bounded (when
over the bound, compress older prose without losing receipts); after every row change
run `npm run docs:master-plan` + `node scripts/lint-master-plan.mjs --check`.

## 12. The world changes after a build

**Correct usage:** Build after every code change; a long-lived MCP process caches the
old `dist/` — apply your host adapter's restart/reconnect flow. Never build WHILE a
sprint is running (ESM cache + worker auth loss). A user-surface change is not DONE
without proof run from the real binary (mock/unit green is not enough).

## 13. Scoped-green debt is paid at landing — run the full suite at landing

**Mistake:** Per sprint policy ("no full-suite during a sprint") three waves ran only
scoped tests; at landing the full suite went red in 11 files / 18 tests — every one a
STALE pin in an OLD test against the new behavior (truth-stats, model-identity, new
envelope shapes).

**Why:** A scoped run proves the change's OWN tests; it cannot see that the change
altered behaviors other tests pin. That debt accumulates and is paid with interest at
landing.

**Correct usage:** The FULL suite (with the `VITEST_MAX_FORKS=2` memory cap) is the
landing debt-payment step — **its cadence is once every 3 landings by owner decision
(Alperen 2026-08-19)**; the landings in between rely on scoped tests plus the gates
(hermetic, i18n, operating-policy, master-plan). Triage every red of the full run:
code bug or stale pin? Realign stale pins to the new behavior with a dated
attribution comment (say WHICH wave changed it). Also: never add a new field as REQUIRED to a widely-constructed options
type — add it optional with fail-closed semantics (consumers gate on `=== true`);
otherwise every test literal churns.

## 14. A finding is not a work item: report it, let the owner decide

**Correct usage:** Every out-of-scope finding observed during work is reported as a
single line; it never auto-enters MASTER — owner admission is required. Recurring
bottleneck loops (degrading to a single worker, FIX-unreachable, attribution loops)
are reported to the owner the moment they are seen.

---

## 15. Give directory-breadth scope; point-file scope strangles the fix chain

**Wrong:** The task got only a point list of the files expected to change. The worker
found the blocker in a neighboring file (a stale test pin, a second resolver) — no
write authority, honest NO_GO. The FIX task inherited the SAME narrow scope → fix-fix
hit the same wall → an unwinnable loop; the run paused (three consecutive sprints were
wounded by this class).

**Correct usage:** In DIRECTIVES, `Files:` is the focus list, but `Scope:` must be
wide enough to cover the related directories and likely neighboring test/pin files
(e.g. not just `tests/cli/lang-authority.test.ts` but `tests/cli/` +
`tests/cli/helpers/`). For deliberate widening at start/resume there is the
`--force-scope` flag — use it. If a worker leaves a `replan-proposal`, that is a
scope-expansion request: don't let it sit — either re-plan with widened scope or close
the blocker via the ADR-D-007 hand-completion seam.

## 16. XVerify approval must be LIVE and per-run — an old approval never carries over to a new evidence refresh

**Wrong:** XVerify was launched in the background and approval was attempted after the
process exited (approvals are process-lifetime — it had evaporated). Second mistake: a
retried run generated a NEW approval id; the approval given to the old id did not
transfer to the new evidence-refresh request (`approval_untrusted` fail-closed
rejection — correct behavior).

**Correct usage:** While XVerify runs, watch stderr's `waiting-approval:<aprp-…>`
signal LIVE and decide EVERY new id via `deckent approvals decide <id> --allow`
before the process exits; a single run may request more than one approval (including
evidence refresh). `limit_hold`/cooldown-class HOLDs clear themselves when the window
passes — a HOLD is not closure; plan a calm retry.

---

## 17. Pin-Scan Pre-Flight — a changed symbol's existing test pins belong in the task's Files

**Rule:** Before every DIRECTIVES task: (1) list the export symbols the task will
change or delete, (2) add EVERY file returned by `grep -rln <symbol> tests/` to the
task's Files, (3) a deleted file's own test file goes into Files too, (4) a
chokepoint's producer and consumer ends ride in the same task. Source: ~55% of
sprint-563's 9 NO_GOs were this single class; sprint-564 applied the rule and
neighbour-pin NO_GOs dropped to ZERO — proven effective.

## 18. Exit-0 + corrupt `.result` = an invisible settlement deadlock — diagnose along the evidence chain, repair content-verbatim

**Case (sprint-564):** A worker wrote raw newlines plus unescaped embedded JSON into
the `notes` field → the `.result` was invalid JSON. Because the container exited
**0**, the host's "overwrite corrupt result with NO_GO" branch never fired (it only
runs on exit≠0). The attribution reconcile died on its first `JSON.parse`, the
finalization returned silently WITHOUT writing closure, and every
`recover --resume` threw `E091:recovery-settlement-timeout` — the error message sat
three layers away from the root cause.

**Diagnosis discipline:** On E091, follow the chain in order: does the settlement
attempt dir contain `closure.json`/`settled.json` → if not, which step of the
monitor's finalize path returns early → hand-parse that step's input (the
`.result`). Three commands: `ls <settlement-attempt-dir>`,
`docker ps -a | grep <task>`, `node -e "JSON.parse(...)"`.

**Repair discipline (ADR-D-007):** (1) Take a forensic backup; (2) repair ONLY the
`.result`'s encoding — content and verdict stay byte-meaning verbatim (NO_GO stays
NO_GO); (3) if your hand-edits touched the attempt's scoped files, temporarily
restore the spawn-baseline blobs (`git cat-file blob <hash>`) so attribution never
credits YOUR work to the dead worker — the honest outcome is
`VERIFIED filesChanged=[]`; (4) use the engine's own typed terminal
(`finalize --force` → ABORTED, no unresolved lineage promoted to COMPLETE);
(5) re-apply your edits and re-run the tests. The result is an honest,
fabrication-free closure.

## 19. The evaluator must never punish honesty — `testsPassed` carries no signal in test-inapplicable task classes

**Case (sprints 568-574):** Under a "no tool execution" doc-task constraint, workers
that honestly wrote `testsPassed:false` were NO_GO'd by the DOC_WRITE correctness
rule, while sibling tasks fabricating "tests passed" sailed through as DONE. On
573-006, the attempt plus THREE fix rounds all fell to the same penalty (~$0.93
wasted) — the defect was in the rule, not the workers, so the fix loop had no exit.

**Why:** `scoreCorrectness` tied 60 points to `testsPassed` in every task class;
doc/audit classes have no test surface — there the field is not a quality signal
but an honesty litmus, and it works in reverse.

**Correct usage:** In doc/audit classes `testsPassed` is neutral (honest false =
fabricated true — same score; no fabrication premium, no honesty penalty). The
worker's own NO_GO is a ceiling: a rubric score can never raise it to DONE; only
evidence-backed reconcile probes may lift it. When you see repeated same-reason
NO_GOs in one task class, interrogate the evaluator rule before the workers.

## 20. The NO_GO→debt→"Task N" drift chain — index-form dependencies were defenceless against debt prepends

**Case (sprints 572-574 stability runs):** R1's closure re-escalated old debts to
critical via `escalateDebt` (the deprioritize workaround lives exactly one round);
R2's plan got 2 debt-fixes PREPENDED; `- Dependencies: Task 1` refs were indexed
into the debt-INCLUSIVE list, so honest directive tasks got chained onto debt-fixes
(`573-004←573-001`, scheduler-shadow disk evidence); success-report-noted debt-fixes
honestly NO_GO'd, the FIX budget burned out, and 4 of 8 tasks never ran before the
run was parked — R3 repeated the exact same fate (snowball).

**Why:** Each of the five links is individually reasonable; the composition is a
disaster. The root code defect was "Task N"/integer refs indexing the full list
including debt — the DIRECTIVES author cannot see debt prepends; their numbering
follows the directive.

**Correct usage:** (1) Index-form refs now bind only to the directive sublist
(7094-R D1); to intentionally depend on a debt task, write its explicit slot id.
(2) In consecutive measurement/experiment runs, manage debt PER ROUND — a one-time
deprioritize loses to escalation. (3) Success-echo debt (a note that is pure success
evidence) is now skipped by the injector; when a "Fix debt" task is born, look for
an actionable gap in its note. (4) The breaker pause message's `blocked←root` edges
tell you which chain parked the run — start diagnosis there.

---

## 21. A wide-surface landing RESETS the cadence counter — full-suite debt compounds silently

**Case (2026-08-20 cadence reconciliation):** The cadence full-suite (every 3rd
landing) came back 38 red / 36,963 green. The diagnosis fan-out showed ZERO of the
reds came from that day's evaluation wave; all of it was unaligned debt from earlier
landings — the biggest being the cursor-provider landing (sprint-565): 7 test files
(spawnSync mocks, 4→5 provider pins) had never been updated, plus prior waves'
pins outside their scoped batteries (post-rubric chain, totalTokens projections,
truthStore mock) and 7 baseline/projection gates.

**Why:** Scoped-green plus gates is enough for a narrow wave; but a wide-surface
landing (adding a PROVIDER) touches pins in dozens of distant suites. Waiting for
the cadence lets that debt accumulate invisibly, and whoever owns the 3rd landing
pays the diagnosis bill for 38 reds that are not theirs (2 parallel diagnosis
agents + ~1 hour of reconciliation).

**Correct usage:** (1) A wide-surface landing (new provider, new status vocabulary,
broad rename) does NOT wait for the cadence — it runs its own full suite and resets
the counter. (2) On a cadence red, the first question is "mine or accumulated" —
import-intersection evidence against the changed files (re-run on a clean HEAD tree)
settles the classification. (3) Reconciliation alignments preserve the fixture's
PURPOSE: when the B3 ceiling breaks a fixture, the right move is adding a real run
trace to the fixture, not loosening the verdict. (4) A single-instance flake under
suite load (run-flow-store WAL lock) is confirmed by isolated re-run — recorded,
not counted as red.

---

## 22. Approval watchers must be TIME-BOUNDED and cleaned up at session end

**Mistake:** An "approve every incoming request" loop created for temporary automation
kept running after the session. This zombie watcher approved later runs without their
original context, creating both a security risk and polluted evidence.

**Correct usage:** Give every watcher an explicit lifetime and run/session scope from
the start; stop it at the session terminal and verify that it actually exited. Never
use a watcher for durable automation: the productized replacement is the approval-rules
engine. Every rule-made decision is recorded in an auditable `decidedBy: rule:<id>`
envelope that preserves its origin.

## 23. LIVE outcome evidence catches integration defects even when the impl seal is green

**Case (D2b-2a):** The implementation seal was green, yet gaps in the ingress precheck
and consumer validation surfaced only in a real run. Static, implementation-focused
evidence did not close the production chain at its consumer end.

**Correct usage:** Never substitute an impl seal for live outcome evidence. Exercise
the path from real ingress to the real consumer and record the observed result. Write
consumer-validation pins SEPARATELY from implementation pins; this independently
catches a consumer misreading the contract while the producer appears correct.

## 24. Run `wc -l` and READ its output before writing an XVerify target range

**Mistake:** A target line range was written without measuring the file length; the
same range error recurred three times and automatically drove verification to UNCLEAR.

**Correct usage:** First run `wc -l <file>` on the target file, actually read the
returned count, then write a target range containing only existing lines. An unmeasured
target is not decidable evidence: target without measurement = automatic UNCLEAR.

## 25. If source changed, `npm run build:all` is REQUIRED before process completion

**Mistake:** A source change was dogfooded without a build; the running `dist/` stayed
stale, so the new feature was invisible during the run.

**Correct usage (Alperen, 2026-08-21):** When source changes, run
`npm run build:all` before process completion and verify `dist = src`. The prohibition
on builds WHILE a sprint is running remains unchanged; let the sprint reach a terminal
first. After the build, apply the active host adapter's restart/reconnect ritual to
long-lived bot and MCP processes, then produce dogfood evidence from the fresh binary.

## 26. A `pgrep`/`grep` wait pattern can match its own command line

**Mistake:** A process-waiting `bash -c "... pgrep -f 'X' ..."` chain carried the
`X` pattern in its own command line, found itself, and waited forever. This happened
twice today: the settlement chain found the `dist/cli/entry.js start` pattern in its
own bot-start text; the watcher also waited on its own verdict pattern.

**Why:** `pgrep -f` and similar `grep` checks scan full command lines, not only the
target process name. The waiting shell that carries the search pattern can therefore
enter the result set.

**Correct usage:** Filter your own PID or pattern-carrying shells from `pgrep` output
(`grep -v $$`), split the pattern so it does not appear verbatim in the command line
(`'st''art'`), or wait on a captured PID instead of a process name (`kill -0 <pid>`).

## 27. A dogfood terminal is not landing proof — the root consumer battery is a separate gate

**Case (Sprint 622):** The run reached `COMPLETE` at 8/8 and task-scoped tests were
green. The root landing review still found three production gaps: the digest-bound
recovery manifest was not consumed by the actual mutation; the status reconciliation
module was not wired into the canonical status entrypoint; and the strict TaskResultV1
writer broke the legacy top-level result contract, producing 22 adjacent worker-test
failures.

**Correct usage:** A dogfood terminal receipt proves that orchestration ended; it does
not by itself prove production closure. Before landing, (1) find a real production
import/call site for every new authority, (2) exercise producer and consumer in one
test, (3) run the adjacent legacy battery for every changed public contract, and (4)
write `LOCAL_VERIFIED` to MASTER only after this root consumer gate is green. Report
task-scope green and root-wiring green as separate evidence classes.


## 28. Stale MASTER counts are hypotheses — measure SQLite and Git before choosing migration

**Mistake:** A migration was planned from a stale MASTER count without first proving
what database bytes were actually present. That can replay a mutation over a database
which already has the target shape but lacks its adoption receipt.

**Correct usage:** Before planning, measure the SQLite header, integrity result, live
schema/schema version, and relevant row counts; then compare them with the exact Git
preimage for the expected v1 state. If the measured database is still v1, plan a
migration. If it is already mutated but no durable receipt exists, do not migrate it
again: use the adoption prepare/proof flow against the measured preimage and current
state. If the authorities disagree or are incomplete, stop on HOLD. MASTER prose and
counts are discovery hints, not mutation authority; HOLD is not a seal.

## 29. Acceptance belongs at the task's execution boundary

**Evidence (sprint-1780659451557):** The archived manifest records
`terminalOutcome: ABORTED`; the recovery directive records 7/20 tasks complete and 13
unresolved because an implementation task's mandatory test was owned by a blocked
future task. The retained terminal and recovery evidence are the authority; recovery
does not rewrite the predecessor as complete.

**Rule:** A mandatory task-local test must already exist at that task's execution
boundary or be co-owned by the task. A future dependent cannot supply its
predecessor's acceptance evidence. Model the DAG so the implementation and its exact
test are one node, or make the implementation depend on an earlier node that creates
the test. Never point acceptance forward to a dependent node.

**Recovery:** If the required test is absent, report the task's typed failure and let
the run settle `ABORTED` with unresolved descendants preserved. Replan by moving the
test into the implementation node or into a completed prerequisite, then execute a
new recovery lineage against the retained evidence. This is a dependency-boundary
defect, not blame assigned to a worker, provider, or later task.

## 30. Mixed read/write scope must survive compiled-prompt composition

**Evidence (sprint-628):** The first three workers had exact `filesRead` entries in
their persisted task projections, but the write-capable prompt branch rendered only
the not-yet-created evidence directory. Each worker correctly returned `NO_GO` because
the sources it was authorized to inspect were absent from the compiled prompt. FIX
attempts inherited the same defective composition, so retrying could not repair it.

**Rule:** Treat `filesRead` and `filesWrite` as independent authority sets. Sanitize and
render both; the presence of writes must never erase reads. If an authored non-empty
read set is entirely rejected during normalization, fail prompt compilation explicitly
instead of dispatching a worker with silently narrowed context. Before a multi-task run,
compile one representative mixed-scope prompt and assert that every exact read and write
target survives. A worker's scope-based `NO_GO` is evidence of a host composition defect,
not a reason to spend another provider attempt on the same prompt.

---

## Changelog (update after every sprint experience)

- **2026-08-23 — sprint-628 mixed-scope recovery**: Lesson 30 added (`filesRead`
  and `filesWrite` are independent compiled-prompt authorities; representative
  mixed-scope conformance runs before dispatch; retrying an unchanged bad prompt is
  not recovery).
- **2026-08-22 — dependency-local acceptance recovery**: Lesson 29 added (mandatory
  task-local tests must exist at execution or be co-owned; forward acceptance edges
  settle as typed `ABORTED` and recover through a corrected DAG without rewriting the
  predecessor).
- **2026-08-22 — provider-observation migration verification**: Lesson 28 added
  (measure SQLite header/schema/rows and the Git preimage before choosing migration;
  distinguish already-mutated-but-unreceipted adoption; HOLD is not a seal).
- **2026-08-22 — Sprint 622 root landing review**: Lesson 27 added (dogfood
  `COMPLETE` is an orchestration terminal, not production landing proof; root
  import/call-site, producer-consumer, and adjacent legacy batteries are a separate gate).
- **2026-08-21 — process waiter matching its own pattern**: Lesson 26 added (a
  `pgrep -f`/`grep` waiter matching its own command line and waiting forever; filter
  its own PID/shells, split the pattern, or use `kill -0 <pid>`).
- **2026-08-21 — live-evidence and operational-hygiene update**: Lessons 22–25 added
  (time-bounded watchers and the approval-rules `decidedBy: rule:<id>` envelope;
  live consumer evidence separate from the impl seal; a read `wc -l` before XVerify
  targets; after source changes, post-sprint-terminal `npm run build:all`, bot/MCP
  restart, and fresh-binary dogfooding).
- **2026-08-20 — EVALUATION-001 first brick + cadence reconciliation**: Added
  Lesson 21 (a wide-surface landing resets the cadence counter; classify
  mine-vs-accumulated first on a cadence red; align while preserving fixture
  purpose; confirm suite-load flakes by isolated re-run).
- **2026-08-19 — the 7094-R repair package (sprints 572-574 stability runs)**:
  Lesson 19 added (the evaluator honesty penalty: `testsPassed` neutral in doc/audit
  classes, worker self-NO_GO as a ceiling) and Lesson 20 added (the NO_GO→debt→
  "Task N" drift chain in five links; directive-only index refs, success-echo debt
  skip, per-round debt management). Source events: 573-006's 4× same-reason NO_GO,
  4/8 tasks parked in both 573 and 574, the `573-004←573-001` scheduler-shadow
  evidence, escalateDebt undoing the deprioritize workaround within one round.
- **2026-08-19 — sprint-564 (NATIVE-SESSION-LEDGER) + the E091 recovery case**:
  Lesson 17 promoted to its own section (applied in 564: neighbour-pin NO_GO = 0)
  and Lesson 18 added (the exit-0 + corrupt-`.result` settlement deadlock: the
  diagnosis chain, content-verbatim encoding repair, honest zero-work attribution
  via baseline blob-restore, and the `finalize --force` ABORTED terminal). Source
  incidents: the 004 chain's 3× honest NO_GO (fix-scope-inheritance, 2nd live
  case), the fix-fix corrupt result, the `recover --resume` E091 loop, the
  ADR-D-007 hand-closure (bridge `nextTurnIndex` + single-namespace ContentWriter
  wiring), and the clean-gate's xverify PENDING-stub/NO_TASK_RECEIPT lock (a new
  vicious-loop class finding).
- **2026-08-18 — first edition** (sprint-550…556 era): 13 lessons distilled. Source
  incidents: the retry-storm crisis (550-552), the NT-correction wave (553), NT-06
  progressive disclosure + the tier correction (554), the post-plan hand-edit
  conflict (555), the `- Dependencies:` syntax discovery + the channel-repair sprint
  (556), the xverify approval-wait/budget RCA, and the live Qwen trial findings (7083).
- **2026-08-18 — sprint-556 landing update**: Lesson 13 added (scoped-green debt +
  required-field churn) — source: paying off 11 files / 18 stale pins in one pass at
  the 556 hand-closure.
- **2026-08-18 — sprint-558/559 wave**: Lesson 15 (directory-breadth scope +
  `--force-scope` + reading the replan-proposal) and Lesson 16 (live xverify approval
  discipline, per-run aprp ids, HOLD ≠ closure) added. Source incidents: 558's
  fix-scope-inheritance deadlock and ABORTED force-finalize; resuming 559 via manual
  spawn after an interruption; the terminal-lockup RCA's 3-run xverify composition
  (A: `0d4f3666…` CONFIRMED, B: `752b074e…` CONFIRMED, C: re-run with the
  approval-liveness lesson applied).
- **2026-08-19 — sprint-563 + NO_GO taxonomy (Lesson 17: Pin-Scan Pre-Flight)**: of the
  day's 9 NO_GOs, ZERO were wrong code; ~55% were one class — existing test pins of
  changed/deleted symbols were missing from the task Files and the fix inherited the same
  narrow scope. RULE: before every DIRECTIVES task, (1) list the exports it will change or
  delete, (2) add EVERY `grep -rl <symbol> tests/` hit to Files, (3) a deleted file's own
  test file goes into Files too, (4) keep a chokepoint's producer+consumer in one task.
  Secondary classes: infra outage (AUTH/wrapper — the fix task is born budget-less,
  recorded finding), producer-consumer splits, hand-edit races (closed by the owner rule).
  Also: a worker may correct a spec assumption by measurement — Commander produces no
  'web'→serve suggestion (edit distance), so the test pins reality.
- **2026-08-18 — sprint-562 (@ref tool-mediated read) + owner rule**: an OWNER RULE
  enters the playbook: NO hand-edits to source/test files while a sprint/task is
  RUNNING — racing a worker pollutes attribution and produces dist-changed warnings;
  hand-completion happens only (a) when a worker stopped on an honest NO_GO and the
  blocker file is in NO live worker's scope (the bridge-expose case), or (b) after the
  sprint is terminal. Today's two race-NO_GOs (worker read before the edit) prove the
  rule. Second lesson: never force a live big-model proof — if a PTY repro times out,
  the hermetic battery + on-disk trace evidence suffices and the fluent-turn check is
  honestly deferred to the owner's session.
- **2026-08-18 — sprint-561 (skill-unlock) + native-probe delivery**: the third
  live instance of Lesson 15 — with `.deckent/skills/` write authority dropped by
  the scope gate, the 001 fix chain could not win; the resolution was an
  ADR-D-007 hand-persist driving the worker's OWN authority via an isolated
  scratch emit (30/30, idempotence proven). Two new finding classes: a provider
  AUTH outage NO_GOes the task AND spawns a budget-less fix task (spawn blocks
  fail-closed — a fix-builder gap); a llama.cpp ROUTER reports n_ctx=0 on the
  bare /props — the probe must query model-scoped `props?model=` first and be
  attached UNCONDITIONALLY (a config-gated probe fabricates
  INPUT_CONTEXT_AUTHORITY_UNAVAILABLE on unconfigured sessions).
- **2026-08-18 — sprint-560 (7086 context-lifecycle)**: two additions folded into
  Lesson 16: never embed a commit identity inside an xverify claim (the channel
  already carries evidence digests), and when assigning chokepoint files to tasks
  think through the PRODUCER-CONSUMER chain — task 3's need lived exactly in the
  files assigned to tasks 1/2; the resolution was an ADR-D-007 producer
  hand-completion (terminal writers had released their locks) plus the fix's
  consumer side. A contract-changing sprint's landing debt (old fallback/notice/
  string-send pins) was realigned to the new typed contracts in one pass; the live
  Qwen proof ran on a fresh binary against the real server.
- **2026-08-25 — sprint-662…666 night marathon (epoch-3 Claude)**: Four structural lessons.
  (1) **Derive DIRECTIVES only from the last WORKING example** — never from memory: writing a
  free-text scope line instead of the parser's `Files:`/`Reads:`/`Test:` keys killed two runs
  before birth (662 prompt-gate, 663 empty-scope E077) while the working 661 file sat in the
  snapshot all along. (2) **A shape-changing cutover closes with one projection over all
  consumers**: once TaskResultV1 `filesChanged` became objects, point-patching was
  whack-a-mole (two crashes in 664, two more in 665); the durable fix was the single
  `normalizeChangedPaths` projection wired into all 10 consumers — read the crash stack from
  `.brain/ERRORS.md`, and let metric timestamps tell you which run actually threw. (3) **A dead
  coordinator does not lose the worker harvest**: `.result` files stay on disk; running the
  brain evaluation yourself via the declared scoped tests and landing the harvest is a
  legitimate narrow ADR-D-007 path — restart-containment's false NO_GO stamp is a symptom of
  the cascade, not of the work. (4) **Type fan-in/read-only tasks as acceptance** — otherwise
  the code rubric fails zero-diff as a correctness miss; the 661 futility machinery
  (`REPEATED_ZERO_DIFF_NO_GO → escalateReplan`) chose typed escalation over looping, and that
  behavior is the intended product.
- **2026-08-25 — the seal-window lesson (sprint-667/668/669)**: The terminal summary print is
  NOT the seal moment — the natural COMPLETE tail enters the outermost seal ~3-5 minutes later
  (cleanup_delay + linger); never rule "no seal" before that window closes (an early verdict on
  668 produced a wrong "early-exit" diagnosis; 669's breadcrumbs showed the truth). Second
  lesson: instrument-and-reproduce before generalizing from one case — two permanent
  breadcrumbs (controller terminal-tail + outermost enter/sealed) gave a definitive diagnosis
  in a single run and stay in the product.
- **2026-08-25 — Missing-Reads + deterministic DIRECTIVES pipeline lesson (sprint-670)**: The
  repair-wave DIRECTIVES carried no `Reads:` line; bounded discovery correctly prevented workers
  from reading the src contracts, and 8 of 13 tasks returned honest "scope did not authorize"
  NO_GOs — an information-access failure, not a model-capability one, and a single authoring
  omission cost an entire FIX phase. The permanent cure has three parts: (1) DIRECTIVES are never
  written without plan-mode approval; (2) content is generated deterministically
  (`scripts/gen-repair-directives.mjs` — Reads derived by scanning the test files' imports, zero
  LLM guessing); (3) a pre-start gate (`npm run lint:directives`) validates with the actual
  COMPILED production parser (no reimplementation) — D_NO_READS_FOR_SRC is this lesson made
  typed, and the tool proved itself by catching 13/13 BLOCKs on the very 670 DIRECTIVES.
  Side-lesson: monitoring noise never lands in the main session — a silent watcher subagent
  relays findings only.
- **2026-08-26 — overnight-autonomy lessons (sprint-674→678 + strike-5)**: (1) **Pipes
  swallow exit codes** — `cmd | tail` reports the last pipe's `$?`; the same trap reproduced
  twice in one night (full-suite verdict + a masked build-HOLD) and turned out to be the most
  likely explanation for row 540's "exit-0" claim too. Capture verdicts without pipes. (2) **A
  hot-path engine fix cannot help the run that lands it** — a run finishes on the dist it
  started with; sprint-674 hit the very dependency bug it was fixing and honestly typed-PAUSED.
  Land hot-path fixes via a mini-run first, then run the wave. (3) **XVerify claim discipline
  refined** — composition holds are now typed layer by layer (evidence scope → size filter →
  prompt ceiling → verdict) and hold detail finally carries the real cause; write claims to be
  diff-decidable, keep `--files` small, and never assert unchanged-line facts from a diff
  (sol's UNCLEAR was correct behavior). (4) **A healer must never move a file it could not
  read** — strike-5: under fd pressure an io-error was treated as corruption and a healthy
  92-key config was quarantined twice; healers may relocate only on parse-proof, io errors are
  typed holds.
