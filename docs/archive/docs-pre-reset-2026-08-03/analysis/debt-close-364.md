# Sprint-364 Debt-Note Close-Out (365-003, continued by 366-002)

Reads the debt-notes named by 365-003's task description (`001`, `003-brain-debt`,
`011` — resolved to `debt-364-001`, `debt-364-003`, `debt-364-011` in
`.brain/memory.db`, confirmed by `type='debt' AND id LIKE '%364%'`; `"003-brain-debt"`
is task 364-003, which the worker self-assessed `DONE` but Brain's rubric
downgraded to `GO_WITH_TECH_DEBT` — a "brain debt" rather than a worker
self-declared one), disk-verifies each one's actual open item, closes what falls
inside this task's write-authority, and lists everything else as a concrete
file+line recommendation. Write-authority for 365-003 (and this doc's own
successor task, 366-002) is exactly two files: `docs/analysis/debt-close-364.md`
(this doc) and `tests/orchestra/debt364-followups.test.ts` — mirroring 364-006's
own `docs/analysis/debt-close-363.md` precedent, a DEBT-CLOSE task's real write
surface is a narrow doc+test pair, not the broad `src/` the task description's
prose suggests (per the Scope Rules' "write list is the single authority").

**366-002 note:** 365-003's own draft of this doc was never committed (found
`??` / untracked on disk at 366-002 start — no prior sprint-365 commit touches
either file). 366-002 re-verified every disk claim in sections 1-3 below (still
accurate, nothing drifted) and adds section 4, since 366-002's own task title
says **4** debt-notes where 365-003's said 3 and explicitly deferred
`debt-364-008` ("+varsa" — "if more exist" — resolves to it).

`"+varsa"` ("if more exist"): `debt-364-008` is that 4th note. Audited in
section 4 below.

## ⚠️ Same root cause as 364-006 found: do not trust the ledger's `resolved` label

All 4 of `debt-364-001`, `debt-364-003`, `debt-364-008`, `debt-364-011` show
`status: 'resolved'` in `.brain/memory.db` — but 364-006 already root-caused
why that label is unreliable: `src/orchestra/sprint-phases.ts:1791`
(`resolveDebt(projectRoot, \`debt-${task.id}\`, sprint.id)`) runs
**unconditionally** for every ordinary `DONE`/`GO_WITH_TECH_DEBT` task in the
same per-task EVALUATE-loop iteration that `recordDebtEntry` (line ~339 in
`debt-manager.ts`) just created that exact row in. Every non-fix task's own
`GO_WITH_TECH_DEBT` debt entry is created and self-resolved in the same
instant, regardless of whether the item it describes was ever actually fixed
(see `docs/analysis/debt-close-363.md`'s "Root cause" section for the full
trace; that finding is unaffected by anything this task touches, still open,
and not re-litigated here). This task disk-verified each of the 3 items' real
state instead of trusting `resolved`.

## 1. `debt-364-001` — CLOSED HERE

**Traces to:** task `364-001`, priority fix for `debt-361-001-fix` (the
"phantom debt" loop: a `TIMEOUT_WITH_WORK` result — worker killed
mid-execution but its partial diff accepted into the tree — was recorded as
ordinary `'standard'`-class debt, escalated to `CRITICAL`, and re-injected a
no-op fix task for 3 straight sprints with nothing actionable to fix).

**Code fix (already landed, disk-confirmed present and unchanged):**
- `src/core/sprint-types.ts:99` — `DebtClass` union includes `'timeout-partial'`.
- `src/orchestra/debt-manager.ts:113-153` (`recordDebtEntry`) — a
  `TIMEOUT_WITH_WORK` `selfAssessment` records `class: 'timeout-partial'` +
  `'timeout-partial'` tag + an honest title/content instead of the raw
  orchestration string, preserving the original note in `content` for
  traceability.
- `src/orchestra/sprint-planner.ts:957` (`injectCriticalDebtTasks`) — skips
  `class === 'timeout-partial'` alongside the pre-existing
  `'verified-no-result'` skip, breaking the respawn loop.

**Open item named by 364-001 itself:** "the new timeout-partial branch has NO
committed regression test — `tests/` is outside this task's write authority
(`filesWrite=['src/']` only) ... followUp: add tests/orchestra covering
`recordDebtEntry` `TIMEOUT_WITH_WORK` -> `timeout-partial` classification +
`injectCriticalDebtTasks` skip of `timeout-partial` (mirror
`debt-ledger-coverage.test.ts` pattern)." 364-001 also flagged the
mis-scoping risk explicitly: any priority-fix task auto-spawned for this debt
would inherit its own `originScope` (`filesWrite: ['src/']` only) and be
structurally unable to add the test — exactly why a dedicated DEBT-CLOSE
reading task (this one) was the right mechanism instead of the auto-injected
fix path.

**Verified fixed by this task:** `grep -rl timeout-partial tests/` returned 0
hits before this task started (confirmed missing) and now returns
`tests/orchestra/debt364-followups.test.ts` (this task's new file, in write
authority). It mirrors `tests/orchestra/debt-ledger-coverage.test.ts`'s mock
pattern (fs/`agents/worker.js`/`core/memory-store.js` mocked, real
`handleEvaluation` under test) plus
`tests/orchestra/sprint-planner-debt-injection.test.ts`'s pattern (real
`injectCriticalDebtTasks`, a pure function over `DebtItem[]`, no mocking
needed). 4 tests: `TIMEOUT_WITH_WORK` → `class: 'timeout-partial'` + honest
title/content + original note preserved; a normal evaluator
`GO_WITH_TECH_DEBT` (non-timeout) stays `class: 'standard'` (regression
guard); `class: 'timeout-partial'` CRITICAL debt is skipped by
`injectCriticalDebtTasks`; a `class: 'standard'` CRITICAL debt (contrast case)
still gets a fix task injected. `npx vitest run
tests/orchestra/debt364-followups.test.ts` → 4/4 pass. No-regression check:
`tests/orchestra/debt-manager.test.ts` (50) +
`tests/orchestra/sprint-planner-debt-injection.test.ts` (5) +
`tests/orchestra/debt-ledger-coverage.test.ts` (5) → 60/60 pass, unchanged.
`npx tsc --noEmit` → clean.

## 2. `debt-364-003` — OPEN, out of this task's write authority

**Traces to:** task `364-003` (`TMUX-PROVIDER-CLI`, tmux-backend provider-CLI
parity fix). Worker self-assessed `DONE`; Brain's evaluation downgraded to
`GO_WITH_TECH_DEBT` (rubric 78.75). No explicit `followUp:`/`docImpact:` line
in 364-003's own `.result` notes — the worker's diagnosis was that the
downgrade traces to **pre-existing, unrelated** test failures the rubric
weighed in, not a defect in its own change.

**Disk-verified today:** `npx vitest run tests/orchestra/tmux.test.ts
tests/orchestra/spawn-timeout.test.ts` → **9 failures**, matching 364-003's
own count exactly:

| File | Failing test |
|---|---|
| `tests/orchestra/tmux.test.ts:591` | `buildWorkerCommand > wraps with timeout when taskId is provided (no adapter)` |
| `tests/orchestra/tmux.test.ts:606` | `buildWorkerCommand > uses custom timeout seconds when provided` |
| `tests/orchestra/spawn-timeout.test.ts:51-52` | `uses default WORKER_TIMEOUT_SECONDS when no timeoutSeconds provided` |
| `tests/orchestra/spawn-timeout.test.ts:57` | `uses custom timeoutSeconds when provided (low effort ~600s)` |
| `tests/orchestra/spawn-timeout.test.ts:63` | `uses custom timeoutSeconds for high effort (~2400s)` |
| `tests/orchestra/spawn-timeout.test.ts:69` | `applies tmux backend factor result (~1080s for normal with 0.9x)` |
| `tests/orchestra/spawn-timeout.test.ts:169,179` | `Config override scenarios` (min/max floor+ceiling) |
| `tests/orchestra/spawn-timeout.test.ts:192` | `Backward compatibility > falls back to WORKER_TIMEOUT_SECONDS` |

**Root cause (confirmed, not just cited):** every failure asserts the command
string `.toContain('timeout <N>')`, but `src/orchestra/tmux.ts:219` has
emitted `` `timeout -k 30 ${tSec} sh -c '...'` `` (the `-k 30` hard-kill grace
period) since an earlier hard-kill refactor (referenced by 364-003 as
"born-466") — predating 364-003's own diff. `'timeout <N>'` (no `-k`) is no
longer a substring of `'timeout -k 30 <N>'`, so every assertion of that exact
shape fails regardless of which task touches `tmux.ts`. This is a genuine,
still-open **test staleness** bug, not phantom debt — the fix is real
(update the assertions), just not one 364-003 or this task can make.

**Cannot close here:** neither `tests/orchestra/tmux.test.ts` nor
`tests/orchestra/spawn-timeout.test.ts` is in 365-003's write authority
(`docs/analysis/debt-close-364.md` + `tests/orchestra/debt364-followups.test.ts`
only).

**Recommendation for a follow-up task** (write authority:
`tests/orchestra/tmux.test.ts`, `tests/orchestra/spawn-timeout.test.ts`):
update each `.toContain('timeout <N>')` / `` .toContain(`timeout ${WORKER_TIMEOUT_SECONDS}`) `` assertion listed above to
`.toContain('timeout -k 30 <N>')` (and the template-literal ones to
`` `timeout -k 30 ${WORKER_TIMEOUT_SECONDS}` ``), matching the current,
intentional `tmux.ts:219` output shape. No source change needed — this is a
test-only fix. `spawn-timeout.test.ts` and `tmux.test.ts` share the exact same
stale-shape assertion; fix both in one task.

## 3. `debt-364-011` — OPEN, out of this task's write authority

**Traces to:** task `364-011` (`RETRO-SERIES-METRICS`, `scripts/series-metrics.mjs`
sprint-357..363 aggregator). Worker self-assessed `GO_WITH_TECH_DEBT`.

**Open item named by 364-011 itself:** the task's own `goCriteria` named
`docs/analysis/series-357-363.md` as the real-run output path, but 364-011's
write authority was `[scripts/series-metrics.mjs,
tests/docs/series-metrics.test.ts, docs/series-metrics.test.ts]` —
`docs/analysis/` was read-only to it. The script itself is fully built and
tested (`tests/docs/series-metrics.test.ts`, 16/16, hermetic fixture-archive)
and was real-run-verified against `.brain/archive/sprint-357..363-tasks` with
output pointed at `/tmp` as a sanity check only (deleted afterward, not a
repo artifact) — but the actual deliverable, `docs/analysis/series-357-363.md`,
was never materialized in the repo.

**Disk-verified today:** `ls docs/analysis/series-357-363.md` → still absent.
`node --check scripts/series-metrics.mjs` → syntax OK, script present and
unchanged since 364-011.

**Cannot close here:** this task's write authority is exactly
`docs/analysis/debt-close-364.md` — a *different* filename in the same
`docs/analysis/` directory is still out of scope under the Scope Rules'
file-allowlist (not directory-allowlist) semantics ("the write list above is
the single authority ... an auditor flags any write outside it").

**Recommendation for a follow-up task** (write authority:
`docs/analysis/series-357-363.md`, or a direct host/CI invocation): run
`node scripts/series-metrics.mjs 357 363` with `--out-md docs/analysis/series-357-363.md`
(flag name per 364-011's own sanity-check invocation — confirm exact flag in
`scripts/series-metrics.mjs`'s CLI parsing before running) to materialize the
already-built, already-tested table into the repo. No code or test change
needed — this is a pure "run the finished tool and commit its output" gap.

## 4. `debt-364-008` — OPEN, out of this task's write authority (366-002)

**Traces to:** task `364-008` (`ONB-DOC`, onboarding user-doc pair:
`docs/guide/onboarding.md` + `docs/features/onboarding.md`). Worker
self-assessed `GO_WITH_TECH_DEBT` — both target docs written, disk-verified
against the real 361-363 ONB source, every command example live-run against
`dist/cli/entry.js`, `npm run lint:link` 0 broken links. Downgraded from
`DONE` solely because a `docs/features/README.md` index row named in
`goCriteria` fell outside 364-008's own `filesWrite` scope
(`docs/guide/onboarding.md`, `docs/features/onboarding.md` only). 364-008's
notes list four concrete `docImpact:` gaps; all four disk-verified today by
366-002:

| # | Gap | Disk-verified today |
|---|-----|----------------------|
| 1 | `docs/features/README.md` — no index row for the new `onboarding.md` | `grep -in onboard docs/features/README.md` → 0 hits; the İçindekiler table (`docs/features/README.md:10-14`) lists 4 other features, none named onboarding, while `docs/features/onboarding.md` exists on disk (7007 bytes) |
| 2 | `docs/.vitepress/config.ts` — `/guide/` sidebar has no entry for `docs/guide/onboarding.md` | `grep -in onboard docs/.vitepress/config.ts` → 0 hits; the sidebar's Getting Started / Core Concepts / Advanced groups (`config.ts:93-130`) list 14 other guide pages, no onboarding link, while `docs/guide/onboarding.md` exists on disk (9859 bytes) |
| 3 | `docs/reference/cli.md` + `docs/reference/cli-commands.md` document only the pre-363 `onboard` shape | `docs/reference/cli.md:129-144` and `docs/reference/cli-commands.md:107-120` each list only `--non-interactive` (and `--force` in cli-commands.md) — neither mentions `--plan-only` or `--json`, both of which the 361-363 ONB work added |
| 4 | `docs/guide/faq.md:345` claims `deckent onboard` "sets up your default provider, model tier, and team settings once" (implies a global-config write) | Text confirmed verbatim still present at `docs/guide/faq.md:345`; 364-008 verified this is inaccurate against the wizard's actual behavior (plan-preview only in 2 of its 3 real paths) |

**Side-finding also named in 364-008's notes (same debt entry, still open):**
`src/cli/commands/onboard.ts` has a real ordering bug — `detectProjectInfo()`
(step 5, `onboard.ts:183`) calls `detectProjectStack()`
(`src/core/stack-detector.ts:65-85`), which unconditionally `mkdirSync`s +
`writeFileSync`s a `.deckent/project-stack.json` cache file
(`stack-detector.ts:84-85`) — **before** step 6's "already initialized" check
(`onboard.ts:193`, `existsSync(join(root, DECKENT_DIR))`) runs. On a genuinely
fresh project with no `.deckent/` at all, step 5's cache write makes step 6's
`existsSync` check always read `true`, so `deckent init` never auto-spawns
unless `--force` is also passed — confirmed still present and unchanged on
disk today (both line ranges cited above match current source exactly).

**Cannot close here:** none of `docs/features/README.md`,
`docs/.vitepress/config.ts`, `docs/reference/cli.md`,
`docs/reference/cli-commands.md`, `docs/guide/faq.md`, or
`src/cli/commands/onboard.ts` is in 366-002's write authority
(`docs/analysis/debt-close-364.md` + `tests/orchestra/debt364-followups.test.ts`
only).

**No new test added for this item:** unlike `debt-364-001`, this debt note has
no closeable-in-scope code path — every open item is a documentation edit or a
one-line source reorder in files 366-002 cannot write. There is nothing for
`tests/orchestra/debt364-followups.test.ts` to assert against without also
editing the target files, which would itself be a boundary violation. The
existing 4 tests in that file remain the complete, correct in-scope test
coverage for this sprint's debt-closure work.

**Recommendation for follow-up tasks** (grouped by write-surface, so a single
task can own each without crossing scope):
- **Doc-index task** (write authority: `docs/features/README.md`,
  `docs/.vitepress/config.ts`): add the missing `onboarding.md` row to the
  İçindekiler table (`docs/features/README.md:10-14`, matching the existing
  `| Feature | Config anahtarı | Default | Doküman |` shape) and add
  `{ text: 'Onboarding', link: '/guide/onboarding' }` to the sidebar's
  Getting Started group (`docs/.vitepress/config.ts:93-96`).
- **CLI-reference sync task** (write authority: `docs/reference/cli.md`,
  `docs/reference/cli-commands.md`): add `--plan-only` and `--json` rows to
  both `onboard` option tables (`cli.md:135-139`, `cli-commands.md:111-114`),
  sourced from the already-written `docs/guide/onboarding.md` /
  `docs/features/onboarding.md` for the correct flag semantics.
- **FAQ-accuracy task** (write authority: `docs/guide/faq.md`): correct the
  `deckent onboard` claim at `faq.md:345` to match verified behavior
  (plan-preview only in 2 of 3 real paths — not an unconditional global-config
  write).
- **Bug-fix task** (write authority: `src/cli/commands/onboard.ts` +
  `tests/cli/onboard.test.ts` or equivalent): reorder `runOnboard` so the
  "already initialized" check (`onboard.ts:193`) runs — or is evaluated against
  a pre-step-5 snapshot of `existsSync(DECKENT_DIR)` — before
  `detectProjectInfo()`'s `detectProjectStack()` call can create
  `.deckent/project-stack.json` (`stack-detector.ts:84-85`), so a genuinely
  fresh project is correctly detected as fresh without requiring `--force`.
