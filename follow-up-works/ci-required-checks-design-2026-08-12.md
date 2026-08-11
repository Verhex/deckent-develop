# CI Required-Checks Architecture: Closing the Broken-Main Ingress

**Date:** 2026-08-12 (filed against the 2026-08-11 live incident)
**Decision owner:** Alperen
**Audience:** Deckent repository administration, CI owners
**Status:** design proposal only. This document edits no workflow, creates no GitHub resource, and changes no ruleset. Every ruleset change it discusses is owner-manual by construction — `bypass_actors: []` and the ruleset lives in repo Settings, not in this tree.

## Executive statement

The repository runs a large, genuinely useful test matrix on every pull request, and then merges without looking at it.

Four status contexts gate `main`: `Type Check` and three `Validator Contract` legs. Nothing else is required. Every test shard — Core, Orchestra, CLI, MCP/API/Integration, Dashboard, Docs+Scripts — runs on the PR, reports its result, and is ignored by the merge decision. On 2026-08-11 that produced the measured incident: PR #120 merged carrying red CLI and Orchestra shards, and PR #121 inherited a red wall it did not build and needed two repair rounds to clear (`f18e89a5f`).

The single most important consequence for costing: **the shards are already being paid for.** They already run on every PR. Making them gate a merge adds zero pull-request wall-clock. The entire cost of closing this ingress is paid in one place only — the merge queue, which must re-run every required context on the final merge result. That coupling, not the cost of running tests, is the real design constraint.

## Evidence read, and the boundary of it

This task's read authority is `follow-up-works/`, `.github/workflows/`, and `docs/evidence/trust-anchor/`. The `gh` CLI is not installed in the worker environment, so no live run duration, no current ruleset state, and no PR timeline could be fetched. Everything below is derived from in-repo artifacts.

| Source | What it establishes |
|---|---|
| `docs/evidence/trust-anchor/ruleset-20321963-2026-08-03.json` | The live `main-protection` ruleset for `VerhexIO/deckent-develop`. `enforcement: active`. Rules: `deletion`, `non_fast_forward`, `required_status_checks`. Required contexts, exhaustively: `Type Check`, `Validator Contract — ubuntu-latest`, `Validator Contract — macos-latest`, `Validator Contract — windows-latest` — all `integration_id: 15368` (GitHub Actions). `strict_required_status_checks_policy: true`. `bypass_actors: []`, `current_user_can_bypass: "never"`. Snapshot date 2026-08-03. |
| `.github/workflows/ci.yml` | Twelve jobs. Eleven carry `if: github.event_name != 'merge_group'` (the row-535 optimization). `test-docs-scripts` and `test-windows` carry `continue-on-error: true`. `build` depends on five shards — not on `test-docs-scripts`. |
| `.github/workflows/cross-platform-e2e.yml` | `validator-contract` is the only job in the file with no event gate; it runs on PR, `merge_group`, and main-push. Every other job (`e2e`, `packed-install`, `exec-auth-capability-probe`, `exec-auth-native-build`) is gated to `push` or `workflow_dispatch`. |
| `.github/workflows/coverage.yml` | Row 535 moved the full instrumented suite out of `ci.yml` to `schedule` (nightly, 01:30) plus `workflow_dispatch`. It no longer runs per merge. |
| `.github/workflows/dashboard-build.yml`, `secret-scan.yml` | `push` + `pull_request` only. Neither declares `merge_group`. |
| `.github/workflows/docs.yml` | Its `push` and `pull_request` triggers are commented out; it is dispatch-driven. Not part of the admission path. |
| Commit `f18e89a5f` (2026-08-11 19:16) | The incident record: "Clean `origin/main` reproduces every one of these failures; PR #120's merge carried them in and the main-push workflow set never runs the failing shards, so #121 inherited a red wall it did not build." |
| Commit `82d13b08a` (2026-08-11 19:59) | Second repair round on the same inherited wall — Orchestra and Core, six further rot families. |

**Disclosed gap.** The task brief states that "main-push runs no test shards." `ci.yml` does not say that: `on.push.branches: [main]` is declared and the shard jobs are excluded only from `merge_group`, so main-push runs the *full* matrix. Section "Hole 3" below states the mechanism that actually produces the observed behaviour. The distinction matters because it changes which fix works.

## Evidence classes used in every cost cell

No number in this document is presented as measured unless it is traceable. Every cost cell is tagged:

| Class | Meaning |
|---|---|
| **M-run** | Measured, with a run id recorded in-repo. |
| **M-note** | A measurement recorded in-repo (workflow comment or commit body) with **no run id attached**. Usable for direction, not for ratification. Must be re-derived with run ids before an owner signs a cost. |
| **C** | A configured ceiling (`timeout-minutes`). An upper bound on duration, never a duration. |
| **U** | Unmeasured. No figure exists in this repository. |

### The measured anchors, in full

| Anchor | Class | Citation | Figure |
|---|---|---|---|
| Docs+Scripts suite duration | **M-run** | run `31050457808`, recorded at `ci.yml:219-222` | 307.86 s (5 m 08 s) on a saturated runner; the then-5-minute step cap SIGKILLed it mid-flight. |
| Validator Contract, 3/3 legs green | **M-run** | run `30832207675` at commit `e1eb9d0ea`, jobs `91748651982` (ubuntu), `91748651896` (macos), `91748652173` (windows); recorded at `cross-platform-e2e.yml:86-87` | 73 passed (73) on all three OS. Existence and outcome only — **no duration is recorded for these jobs.** |
| Full-matrix re-run in the merge queue | **M-note** | row 535, recorded verbatim in nine places in `ci.yml` (`:20-23`, `:72-75`, `:91-94`, `:121-124`, `:150-153`, `:174-177`, `:198-201`, `:227-230`, `:250-253`, `:275-278`) | "Every other job re-running in the queue added **~30 min wall-clock per train** with no admission value." **No run id.** This is the load-bearing number for Options B and C and it is the weakest citation in the set. |
| Instrumented full suite | **M-note** | `coverage.yml:2-6` and `:48-51` | 21–45 min; the 20-minute cap "killed every 2026-08-05 main run at ~21 min". Date-scoped, **no run ids**. |
| Budget stage-race timing | **M-run** | run `31054702920` (commit history for `.github/workflows/`) | 50–200 ms. Recorded here only to note that it is **not** a shard duration and must not be reused as one. |

**Everything else is C or U.** Per-job durations for `Type Check`, `Security Audit`, and each individual test shard do not exist anywhere in this repository. That is the central evidence gap and it is why this document ends with a measurement instrument rather than a signed cost.

### Configured ceilings (C) — upper bounds only

| Job | Context name(s) as GitHub reports them | Cap |
|---|---|---|
| `lockfile-sync` | `Lockfile Sync Guard` | none |
| `typecheck` | `Type Check` | none (job default 360 min) |
| `security` | `Security Audit` | none |
| `test-core` | `Tests — Core + Agents (24.x)`, `… (26.x)` | step 5 min |
| `test-orchestra` | `Tests — Orchestra (24.x)`, `… (26.x)` | step 10 min |
| `test-cli` | `Tests — CLI (24.x)`, `… (26.x)` | step 10 min |
| `test-remaining` | `Tests — MCP + API + Integration + Security + Providers + Monitor + Skills + Analytics (24.x)`, `… (26.x)` | step 10 min |
| `test-docs-scripts` | `Tests — Docs + Scripts (isolated)` | step 15 min |
| `test-dashboard` | `Tests — Dashboard` | step 5 min |
| `test-windows` | `Tests — Windows (allow-failure)` | step 10 min |
| `build` | `Build` | none |
| `validator-contract` | `Validator Contract — {ubuntu,macos,windows}-latest` | job 10 min |

Note the matrix-name expansion. `test-core` sets `name: Tests — Core + Agents` without interpolating `matrix.node-version`, so GitHub appends `(24.x)` / `(26.x)` to the context. `validator-contract` interpolates `matrix.os` into its own `name`, so the context is exactly the rendered string — which is why the four ruleset entries match cleanly today. Any hand-authored required-context list must use the **expanded** strings and breaks silently whenever a matrix axis changes. This is an argument for Option C on its own.

## What actually runs on which event

Derived from the `if:` gates and `on:` blocks. This is the whole admission picture.

| Job | pull_request | merge_group | push to main |
|---|---|---|---|
| `Lockfile Sync Guard` | runs | **excluded** | runs |
| `Type Check` | runs | **runs (required)** | runs |
| `Security Audit` | runs | **excluded** | runs |
| `Tests — Core + Agents` ×2 | runs | **excluded** | runs |
| `Tests — Orchestra` ×2 | runs | **excluded** | runs |
| `Tests — CLI` ×2 | runs | **excluded** | runs |
| `Tests — MCP + API + …` ×2 | runs | **excluded** | runs |
| `Tests — Docs + Scripts (isolated)` | runs, `continue-on-error` | **excluded** | runs, `continue-on-error` |
| `Tests — Dashboard` | runs | **excluded** | runs |
| `Tests — Windows (allow-failure)` | runs, `continue-on-error` | **excluded** | runs, `continue-on-error` |
| `Build` | runs | **excluded** | runs |
| `Validator Contract — {ubuntu,macos,windows}` | runs | **runs (required)** | runs |
| `E2E — {os}/{backend}` | **excluded** | **excluded** | runs |
| `Packed Install — {os}` | **excluded** | **excluded** | runs |
| `Exec-Authority Capability Probe`, `Native Build` | **excluded** | **excluded** | runs |
| Dashboard Build | runs | **excluded (no trigger)** | runs |
| Secret Scan | runs | **excluded (no trigger)** | runs |
| Coverage Report | — | — | — (nightly / dispatch only) |

The queue column is the merge decision. It contains exactly four contexts, and they are exactly the four in the ruleset. That is not a coincidence — see Hole 2.

## The holes, stated precisely

### Hole 1 — The required set is a strict subset of the evidence produced

Every shard runs on the PR and reports. A red non-required context is advisory: GitHub will let the PR enter the queue and merge. PR #120 is the measured instance. There is no mechanism in the repository today that converts a red shard on a PR into a blocked merge.

Severity: this is the direct cause of the incident and it is unbounded — nothing limits how many red shards can be merged in sequence.

### Hole 2 — Required set and queue re-run set are the same set. They cannot be decoupled.

With a merge queue enabled on `main`, every required status context must report a result on the merge group's temporary ref. A required context whose workflow does not listen to `merge_group` never reports there, the merge group waits out the queue's check timeout, and the entry is dequeued. This is precisely why `ci.yml:8-11` carries the comment "bu event dinlenmezse kuyruk check sonucu alamaz ve hiçbir PR merge olamaz" — the file already knows this rule.

The consequence is the load-bearing constraint of this whole design:

> Row 535 reduced queue wall-clock by excluding the shards from `merge_group`. That exclusion is only legal because the shards are **not required**. Making a shard required forces it back into the queue and gives back the row-535 saving for that shard. The two goals are in direct structural conflict, and no option can escape it while the merge queue is enabled.

Any proposal of the form "require the shards but keep the queue cheap" is invalid. It does not merely cost more; it stops merges entirely.

### Hole 3 — Main-push is not a safety net, for two independent reasons

The brief's phrasing ("main-push runs no test shards") is not what the file says — main-push runs the full matrix. The observed behaviour comes from two other mechanisms, and both must be named because they need different fixes:

1. **Nothing gates on it.** A main-push run is post-hoc. A red result produces no block, no revert, and no queue pause. The next PR branches from the red commit. This is what `f18e89a5f` describes from the receiving end.
2. **Main-push runs cancel each other.** `ci.yml:13-15` sets `concurrency: ci-${{ github.ref }}` with `cancel-in-progress: true`. For a `merge_group` event `github.ref` is the unique `gh-readonly-queue/...` ref, so queue legs never collide. For a push to `main` the ref is `refs/heads/main` for **every** push, so back-to-back merges cancel the previous main run mid-flight. Under an active queue, main-push shard results are systematically destroyed before they conclude. `cross-platform-e2e.yml:14-16` has the identical pattern.

Net effect matches the incident record exactly. The fix for (1) is alerting or a gate; the fix for (2) is a concurrency-group change. Neither is a required-checks change, which is why this hole is separable from the others and can be closed cheaply and independently.

### Hole 4 — `continue-on-error` on Docs+Scripts, with its compensating control removed

`ci.yml:205-208` justifies `continue-on-error: true` as follows: "Vitest worker timeout (onTaskUpdate) is a known flaky issue in CI. Tests pass (508/508) but vitest exits with code 1 due to worker crash. **Coverage job runs these same tests — this job is supplementary.**"

That justification is now stale. Row 535 moved `coverage.yml` to nightly + dispatch (`coverage.yml:2-6`). The named compensating control no longer runs per merge. The Docs+Scripts shard is therefore **uncompensated** as well as non-blocking, and `build` does not depend on it either (`ci.yml:281` lists five shards, not six). A genuine Docs+Scripts regression is invisible at merge time and stays invisible until the nightly coverage run — if anyone reads it.

The comment also contains the fix, if read closely: the failure being tolerated is a **process exit code**, not a **test result**. "Tests pass (508/508) but vitest exits with code 1" is a statement that the assertion outcome and the process outcome disagree. Gating on the reporter's result counts instead of on `$?` separates the two. See sub-option D5.

### Hole 5 — Secret Scan and Dashboard Build have no queue leg

Neither workflow declares `merge_group`. A secret or a dashboard-build break introduced by a *semantic* merge conflict — content that exists only in the queue's merge result and in no PR branch — is never scanned. This is a smaller hole than 1–4 but it is on the same axis: it becomes a merge-blocking stall the moment either is made required, per Hole 2.

## Costed options

Cost is stated as **added wall-clock per merged train**, relative to today. Read the class tag on every cell; a **U** cell is a question, not a number.

| # | Option | Required contexts after | What the queue re-runs | Added wall-clock / train | Class | Residual ingress risk |
|---|---|---|---|---|---|---|
| **A** | **Status quo** | 4 (unchanged) | Type Check + Validator ×3 | +0 | — | **Unbounded.** The 2026-08-11 incident is the expected steady-state behaviour, not an anomaly. Cost is paid in repair rounds: two, on 2026-08-11 (`f18e89a5f`, `82d13b08a`). |
| **B** | **Full restoration.** Delete every `if: github.event_name != 'merge_group'` in `ci.yml`; add all shard contexts + `Build` + `Lockfile Sync Guard` + `Security Audit` to the ruleset. | ~17 (matrix-expanded) | full `ci.yml` matrix + Validator ×3 | **+~30 min** | **M-note** (row 535; **no run id** — must be re-derived before ratification) | Near-zero for anything the shards cover. Gives back 100 % of the row-535 saving. Ruleset entry list is long and breaks on any matrix change. |
| **C** | **Aggregate gate.** Add one `ci-required` job that `needs:` every shard, runs on all three events, and fails if any dependency failed. Make **that one context** required; drop the other three from the ruleset or keep Validator as-is. | 1–4 | full matrix (the aggregate's `needs:` pull them in) + Validator ×3 | **+~30 min** (same as B) **+ aggregator** (U, expected seconds) | **M-note** + **U** | Same safety as B. Strictly better *maintainability*: the ruleset never needs another owner-manual edit when a shard is added, renamed, or its matrix changes. Given `bypass_actors: []` and owner-manual ruleset edits, this is the difference between a one-time change and a recurring one. |
| **D** | **Tiered queue.** Return only the highest-yield shards to `merge_group` and require those: Core+Agents, Orchestra, CLI — the three families the 2026-08-11 incident actually hit. | 4 + 6 (three shards × two Node legs) | Type Check + Validator ×3 + 3 shards | **+(one shard wave)**; ceiling **10 min** (`C`, the Orchestra/CLI step cap), true value **U** | **C** / **U** | Partial. MCP/API/Integration, Dashboard, Docs+Scripts and `Build` stay ungated. Cheaper than B/C only if the shard wave is materially less than the ~30 min — which is plausible (the 30 min includes `Build`, which `needs:` five shards and therefore runs as a **second** serialized wave) but **is not measured**. Do not ratify D on the ceiling. |
| **E** | **Main-push made durable + alerting.** Change the main-push concurrency group so runs are not cancelled (e.g. per-SHA group, or `cancel-in-progress: false` for `push`); add a failure notification and optionally an auto-pause of the queue while `main` is red. No ruleset change. | 4 (unchanged) | unchanged | **+0** (no new job; main-push already runs the full matrix) | **M-run** — arithmetic, not estimate: zero jobs added | **Detection, not prevention.** #120 still merges red; #121 still inherits it — but the wall is *known* in minutes instead of being discovered by the next author. Closes Hole 3 completely and Holes 1/4 not at all. Cheapest item on this page by a wide margin. |
| **F** | **Retire the merge queue.** With the queue off, `strict_required_status_checks_policy: true` (already `true` today) forces the PR branch up to date with `main` before merge, so required checks run on the PR against the current base. Make the shards required there. | ~17, or 1 with the Option-C aggregate | n/a — no queue | **+0 CI wall-clock.** The shards already run on every PR. Cost moves to rebase/serialization latency (**U**), not to compute. | **M-run** — arithmetic: zero jobs added to any event | Near-zero, same coverage as B. **Trade:** loses queue batching. The queue's value is proportional to concurrent merge throughput; this repository has one human administrator (`bypass_actors: []`, single-owner `CODEOWNERS` per `follow-up-works/trust-anchor-solo-design-rev2-2026-08-12.md`) and merges in owner-driven trains, so batching value is low and the queue currently costs a full extra CI cycle per merge to buy it. Retiring it is a reversal of an explicit 2026-08-04 owner decision and is therefore an owner call, not a recommendation this document can make alone. |

### Reading the table

Three things fall out of it that are worth stating plainly.

1. **Option E is nearly free and closes a whole hole.** It requires no ruleset change at all — only a concurrency-group edit and an alert. It should not be traded against B/C/D/F; it is orthogonal and should be taken regardless of which admission option wins.
2. **Option F is the only option that closes Hole 1 at zero added compute.** Every other closing option pays the queue tax described in Hole 2. F pays no compute tax because it removes the thing that charges it. Its cost is latency and merge serialization, which are real but are a different currency.
3. **Option C dominates Option B.** Same cost, same safety, and it converts a recurring owner-manual ruleset edit into a one-time one. If the queue stays, C is the correct expression of B.

## Docs+Scripts: what replaces `continue-on-error`

Independent of the option chosen above. The flake RCA feeds this; nothing here should be ratified before that RCA names the failing files and the crash mechanism.

| # | Sub-option | Added wall-clock | Class | Assessment |
|---|---|---|---|---|
| **D1** | Keep `continue-on-error: true`. | +0 | — | Rejected on the record. Its own in-file justification cites a compensating control (per-merge coverage) that row 535 removed. Keeping it means keeping a documented-but-false rationale in the tree. |
| **D2** | Delete `continue-on-error` outright. | +0 | — | Converts the known vitest worker-crash flake into a hard red on some fraction of runs. Fraction is **U** — no flake-rate figure exists in-repo. Unsafe to ship before the RCA. |
| **D3** | Delete `continue-on-error`, add a bounded ×1 retry of the shard; red only on 2-of-2 failure. | worst case **+307.86 s** (one extra full run of the suite) | **M-run** (`31050457808`) | Worst case ≈ 10 m 16 s against the existing 15-minute step cap (`ci.yml:223`) — it fits, with ~4.7 min of headroom. Halves flake exposure. **Also halves detection of genuine intermittent failures**, which is a real cost, not a free win. |
| **D4** | Split the shard: quarantine the files the RCA names into a separate non-required leg; the remainder becomes hard-required. | **U** (depends on the split) | **U** | Structurally the cleanest if the RCA localises the crash to a small file set. Preserves honest visibility: the quarantined leg stays red-but-visible rather than deleted, matching the precedent argued at `cross-platform-e2e.yml:86-116` ("a red leg is honest, a deleted leg would have been a silent omission"). |
| **D5** | Keep the process-level tolerance; gate on **test results** instead of exit code. Emit a machine-readable reporter (`--reporter=json --outputFile=…`), then a follow-up step that fails if the report contains any failed test — while a clean report with a crashed worker passes. | seconds (**U**, one parse step) | **U** | **Surgical, and it matches the recorded diagnosis exactly.** `ci.yml:206-207` states the disagreement in so many words: "Tests pass (508/508) but vitest exits with code 1 due to worker crash." D5 gates on the assertion outcome the comment already trusts and stops gating on the exit code the comment already distrusts. Risk to name honestly: if the worker crashes *before* a file's tests are recorded, the report is silently short — so D5 must also assert an expected **minimum test count** or the crash becomes a green pass. That count assertion is what makes D5 sound rather than clever. |

**Recommended shape:** D5 with a minimum-count assertion, plus D4 for anything the RCA proves is genuinely environment-broken. D3 only as a stopgap if the RCA slips and the shard must be made required first.

## Measure before ratify

Options B, C and D price differently depending on numbers this repository does not have. Nothing in that group should be signed until the following are captured. `gh` is unavailable in the worker environment, so this is owner-side or a CI-side job that writes the numbers into `docs/evidence/`.

| # | Measurement | Why it is blocking | Suggested capture |
|---|---|---|---|
| **M1** | Per-job duration for every `ci.yml` job on a representative PR run, with the run id. | Turns the entire C column into M-run. Without it, D's "cheaper than B" claim is unfounded. | `gh run view <id> --json jobs --jq '.jobs[] \| {name, startedAt, completedAt}'`, committed under `docs/evidence/`. |
| **M2** | Re-derive the row-535 "~30 min" delta with run ids — one queue run before and one after the 535 change. | This is the load-bearing number for B and C and it currently has **no run id**. Ratifying a +30 min cost on an unciteable figure is the exact failure mode this document is meant to avoid. | Two queue-leg run ids from the 535 change window. |
| **M3** | Decompose the 30 min into shard wave vs `Build` wave. | This is the entire delta between Option D and Option B/C. If `Build` is most of it, D is attractive; if the shard wave is, D saves little. | Derivable from M1. |
| **M4** | Docs+Scripts flake rate over the last N runs: worker-crash-with-all-tests-passing vs genuine failure. | Chooses between D2, D3, D4 and D5, and sizes D3's masking cost. | Run conclusions + logs for `Tests — Docs + Scripts (isolated)`. |
| **M5** | Merge throughput on `main`: merges per day and peak concurrent queue depth. | This is the entire case for or against Option F. The queue earns its cost only above some throughput; below it, F is free safety. | Merge commit timestamps on `main`. |
| **M6** | Confirm GitHub-side whether a `continue-on-error: true` job can serve as a required status context at all, and what conclusion it reports to the Checks API. | If it reports `success` unconditionally, then making Docs+Scripts required **without** D2/D4/D5 is a no-op that looks like a fix — the worst possible outcome. | Owner-side check on a scratch branch. Not testable from this worker. |

## Owner decision points

Each of these needs an explicit answer. None is decided by this document.

- **OD-1 — Does the merge queue stay?** This is the root decision; everything below branches on it. Keeping it means accepting the Hole 2 tax on every closing option. Retiring it (Option F) closes Hole 1 at zero compute cost and reverses the 2026-08-04 decision. Blocked on **M5**.
- **OD-2 — Aggregate context or explicit list?** If the queue stays, Option C versus Option B. C costs the same and removes future owner-manual ruleset edits; given `bypass_actors: []` and the single-admin trust anchor, fewer required ruleset touches is itself a security property.
- **OD-3 — Full matrix or a tier?** Options B/C versus D. Blocked on **M1** and **M3**. Do not decide on the ceilings in this document.
- **OD-4 — Take Option E now, independently?** Recommended yes. It costs no compute, needs no ruleset change, and closes Hole 3 whichever way OD-1 goes. Two sub-questions: (a) per-SHA concurrency group or `cancel-in-progress: false` on push; (b) does a red `main` pause the queue, or only notify?
- **OD-5 — Which Docs+Scripts replacement?** D5 + minimum-count assertion is the recommendation. Blocked on the flake RCA and on **M4**/**M6**.
- **OD-6 — Do Secret Scan and Dashboard Build gain a `merge_group` leg?** Hole 5. If either is ever to be required, it must listen to `merge_group` first or merges stop.
- **OD-7 — Does `Build` become required?** It depends on five shards but not on Docs+Scripts, so requiring `Build` transitively requires those five — a compact way to express most of Option B, and worth pricing separately under **M3**.
- **OD-8 — Does the ruleset snapshot get refreshed?** `docs/evidence/trust-anchor/ruleset-20321963-2026-08-03.json` is nine days old at the date of this document and is the only in-repo statement of what gates `main`. Any change made under OD-1..OD-7 should re-snapshot it in the same change, or this document's successor will be reasoning from a stale required set exactly as this one had to.

## Non-authority statement

This document proposes. It does not:

- edit any file under `.github/workflows/`;
- change, create, or delete ruleset `20321963` or any branch protection;
- enable, disable, or reconfigure the merge queue;
- assert any cost figure as measured without an evidence class and a citation.

Ruleset changes are owner-manual by construction: `bypass_actors: []` and `current_user_can_bypass: "never"` mean the required-check list can only be edited through repository Settings by the sole administrator. That property is the reason Option C's one-time-edit argument carries weight, and it is also why every recommendation above stops at the decision point instead of crossing it.
