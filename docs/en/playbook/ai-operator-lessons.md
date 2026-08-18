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

**Correct usage:** A mandatory landing-chain step: the FULL suite (with the
`VITEST_MAX_FORKS=2` memory cap). Triage every red: code bug or stale pin? Realign
stale pins to the new behavior with a dated attribution comment (say WHICH wave
changed it). Also: never add a new field as REQUIRED to a widely-constructed options
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

## Changelog (update after every sprint experience)

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
