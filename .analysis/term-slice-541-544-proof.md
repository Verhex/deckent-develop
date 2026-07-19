# TERM-slice (452-002/003/004) — Integration Verify + Real-Binary Dry-Run Proof (Task 452-005)

**Sprint-452 Task 452-005.** Integration/verification for the TERM-treni "hybrid RunProposal"
slices done by 452-002 (`/do` wired into the shared RunFlow chain), 452-003 (do.ts's
`formatRunFlowDoPreview` scope-gate rendering unified onto plan-preview-card.tsx's shared
`formatScopeGateLines`), and 452-004 (run-proposal-compiler.ts's `escapeGoalHeadingCollisions`
goal-embedding fix, closing a NEW born-677-class embedding point). This document **writes no
src/ code** — it independently re-runs the unit suites those three tasks touched and adds one
new real-binary integration test, per the task's own instruction not to patch source even if
something fails.

## 0. Result Summary

| Criterion | Status | Note |
|---|---|---|
| `npx tsc --noEmit` | ✅ PASS | Exit 0, zero errors |
| All task-1/2/3 test files, one `vitest run` | ✅ PASS | 10/10 files green — 183 passed / 2 skipped (185), 0 failed |
| `tests/cli/term-slice-541-544-e2e.test.ts` — async-spawns the built binary, semicolon goal, asserts real stdout preview | ⚠️ **Harness complete + mechanism validated — live assertion self-skips (dist/ stale)** | See §3/§4 |
| Any `spawnSync` in the harness | ✅ PASS | Zero — grep confirms only `spawn` is used, everywhere (fixture git commands AND the CLI-under-test) |
| Proof asserts on real binary stdout, not mocked output | ✅ | See §4 — real spawned-process stdout, no `vi.mock` anywhere in the e2e file (impossible across a real child process regardless) |
| Semicolon goal hard-errors end-to-end | ✅ NO — proven, twice | Unit corpus (452-004's own tests) + this task's real-subprocess mechanism check (§4), both clean |
| e2e test leaks state outside its tmpdir | ✅ NO | tmpdir fixture root + tmpdir fake-bin dir + tmpdir sandboxed HOME, all removed in `afterEach`; confirmed via `git status` (§5) |
| Any `src/` file modified by this task | ✅ NO | `git status` shows zero `src/` changes from this worker (§5) |
| Proof file | ✅ this document | `.analysis/term-slice-541-544-proof.md` |

**Overall verdict:** the integration re-verification is fully green (5/5 unit criteria), and the
new e2e harness (`tests/cli/term-slice-541-544-e2e.test.ts`) is complete, correct, and was
**manually validated end-to-end** (§4) before being committed. Its one live assertion
self-skips in THIS sprint because `dist/` predates the very source files (do.ts,
run-proposal-compiler.ts, plan-preview-card.tsx, messages.ts) this proof is about — an
operating-rule-mandated gap (`npm run build` forbidden mid-sprint), not a defect in this task's
work. Self-assessment: **GO_WITH_TECH_DEBT**, not DONE — full reasoning in §6.

---

## 1. `npx tsc --noEmit`

```
$ npx tsc --noEmit
(no output)
$ echo $?
0
```

Zero type errors across the whole tree, including the new test file.

## 2. Targeted Sweep — task-1/2/3 Files + the New e2e File, One `vitest run`

All files touched by dependencies 452-002/003/004 plus the new e2e file, in a single command
(`VITEST_MAX_FORKS=2`, async-spawn only):

```
$ VITEST_MAX_FORKS=2 npx vitest run \
    tests/cli/commands/chat-slash-registry.test.ts \
    tests/cli/commands/do.test.ts \
    tests/cli/helpers/messages.test.ts \
    tests/cli/plan-preview-scope-gate-labels.test.ts \
    tests/cli/repl-do-slash-wire.test.ts \
    tests/cli/repl/app.test.ts \
    tests/cli/repl/plan-preview-card.test.ts \
    tests/cli/repl/run.test.ts \
    tests/orchestra/run-proposal-compiler-delimiters.test.ts \
    tests/orchestra/run-proposal-compiler.test.ts \
    tests/cli/term-slice-541-544-e2e.test.ts \
    --reporter=verbose

...
 Test Files  10 passed | 1 skipped (11)
      Tests  183 passed | 2 skipped (185)
   Start at  11:44:47
   Duration  5.18s

$ echo "${PIPESTATUS[0]}"
0
```

**10/10 non-skipped files green, 183/183 non-skipped assertions pass, 0 failures.** The "1
skipped" file is `term-slice-541-544-e2e.test.ts` itself (both its tests are `it.skipIf`/`it.skip`
guarded — see §3) — everything else ran with full assertions.

Per-file roll-call (all ✅): `chat-slash-registry.test.ts` (452-002), `do.test.ts` (452-003),
`helpers/messages.test.ts` (452-002/003/004's added message keys — includes the modified,
already-in-git-status version), `plan-preview-scope-gate-labels.test.ts` (452-003),
`repl-do-slash-wire.test.ts` (452-002), `repl/app.test.ts` (452-002), `repl/plan-preview-card.test.ts`
(452-003), `repl/run.test.ts` (452-002), `run-proposal-compiler-delimiters.test.ts` (452-004,
the born-677 corpus), `run-proposal-compiler.test.ts` (452-004 baseline contract).

---

## 3. Real-Binary e2e — `tests/cli/term-slice-541-544-e2e.test.ts`

### 3.1 Design (why this is a genuine, hermetic, non-mocked proof)

`deckent do`'s RunFlow-v2 path (the only path that reaches 452-003's scope-gate rendering and
452-004's `run-proposal-compiler.ts`) always spawns a real provider CLI subprocess for planning:
`run-proposal-compiler.ts`'s `defaultRunProposalPlanner` → `orchestra/planner.ts`'s
`callZeroConfigPlanner` → `defaultPlannerSpawn` → `spawn(command, args, {stdio:[...]})` — **no
`env` override**, so it inherits the deckent process's own `process.env`. `command` resolves to
the literal binary name `claude` via PATH lookup (confirmed by reading
`src/providers/claude.ts`'s `buildCommand` + `src/orchestra/planner.ts`'s
`buildPlannerSpawnArgs` generic fallback).

The e2e test exploits exactly this: it prepends a tmpdir bin directory holding a deterministic,
canned `claude` script to `PATH` before spawning the built `dist/cli/entry.js`. That fake script
is the **only** faked boundary — every other module in the real chain (`compileRunProposal` →
`buildDirectives` → `generatePlanPreview` → `planSprint` (`mode: 'structured'`, itself
LLM-free — verified by reading `sprint-planner.ts`: structured mode parses the already-compiled
DIRECTIVES markdown via `parseStructuredDirectives`, no second AI call) → `evaluateScopeGate` →
`formatRunFlowDoPreview`/`formatScopeGateLines`) runs for real, unmocked, in a real spawned OS
process. This mirrors `tests/cli/do-real-plan.test.ts`'s own stated philosophy ("only the
boundary that would otherwise require a real AI/provider bootstrap is faked") one process
further out — at the actual subprocess boundary instead of a `vi.mock` (which is structurally
impossible across a separately-spawned child process anyway).

Scope-gate FAIL is made **deterministic**, not a hopeful guess about live-LLM output: the
fixture's git-tracked tree seeds two files sharing the basename `worker.ts` in different
directories (`src/agents/worker.ts`, `src/nervous/worker.ts` — mirrors
`tests/cli/run-flow-scope-mirror.test.ts`'s `AMBIGUOUS_TRACKED` fixture), and the fake planner
declares a write to a third, untracked `src/orchestra/worker.ts`. Per `core/scope-gate.ts`'s
`evaluateScopeGate` (read in full for this task): 2+ same-basename tracked candidates for an
untracked write path is **unresolved** (`resolveSuggestions` only auto-resolves a *single*
candidate) → blocks. Confirmed live in §4.

Zero `spawnSync` calls (the word appears twice, only inside comments explaining the discipline —
excluded with the same call-site pattern `scripts/lint-no-spawnsync.mjs` itself uses):

```
$ grep -nE '(^|[^A-Za-z0-9_])spawnSync\s*\(' tests/cli/term-slice-541-544-e2e.test.ts
(no matches, grep exit 1)
```

Every subprocess this file starts — the fixture's `git init`/`add`/`commit`, AND the CLI-under-test
itself — goes through the file's own `runAsync`/`runCli` helpers, both wrapping
`node:child_process` `spawn` in a `Promise`.

### 3.2 dist/ staleness — why the live assertion self-skips THIS run

```
$ for f in cli/commands/do orchestra/run-proposal-compiler cli/repl/run-flow-controller \
           core/scope-gate cli/repl/plan-preview-card cli/helpers/messages; do ...; done
cli/commands/do                    src=1784460407 dist=1784452484  STALE
orchestra/run-proposal-compiler    src=1784459312 dist=1784452483  STALE
cli/repl/run-flow-controller       src=1784444372 dist=1784452484  OK
core/scope-gate                    src=1784396569 dist=1784452483  OK
cli/repl/plan-preview-card         src=1784460499 dist=1784452484  STALE
cli/helpers/messages               src=1784460396 dist=1784452483  STALE
```

4 of the 6 files this integration proof is actually about (do.ts, run-proposal-compiler.ts,
plan-preview-card.tsx, messages.ts — exactly 452-002/003/004's own touched files) are **newer
in src/ than in dist/**: the current build predates this dependency chain entirely. Running the
real binary right now would silently exercise the OLD (pre-452-002/003/004) compiled code and
prove nothing about THIS sprint's actual changes — a false-positive risk this repo has already
named once (`.analysis/run-rename-dilim3-smoke-proof.md`, task 450-006) and solved with a named
self-skip guard (`tests/e2e/cli-smoke.e2e.test.ts`'s `MESSAGES_STALE`). This file uses the exact
same idiom (`DIST_STALE` over an explicit list of src/dist pairs).

Per this project's operating rules (CLAUDE.md `<operating_rules>`: *"Sprint çalışırken `npm run
build` ... YASAK"*) and this task's own instructions, this worker **did not** run `npm run
build` to close the gap. The vitest run in §2 shows the resulting self-skip exactly as designed:

```
↓ tests/cli/term-slice-541-544-e2e.test.ts > ... > `deckent do "<semicolon goal>"` (dry-run) renders a real plan preview on real stdout, including the scope-gate FAIL verdict lines, and never hard-errors
↓ tests/cli/term-slice-541-544-e2e.test.ts > ... > SKIP: dist/ predates 4 source file(s) this integration proof covers (src/cli/commands/do.ts, src/orchestra/run-proposal-compiler.ts, src/cli/repl/plan-preview-card.tsx, src/cli/helpers/messages.ts) — needs a host-side `npm run build` (workers may not run it mid-sprint; see .deckent/workspace/WORKER-GUIDE.md and CLAUDE.md operating_rules)
```

Both rows are visible (not silently swallowed) — an honest, named self-skip, not a false pass.

---

## 4. Mechanism Validation — Manual Pre-Commit Run (NOT the committed test's own execution)

Before writing the test file, this worker manually built the identical fixture (fake `claude`
PATH-shim, ambiguous-`worker.ts` git repo, `terminal.run_flow_v2` config) in a `/tmp` scratch
directory and ran the **current (stale) built binary** through it via async `spawn` (`node
--enable-source-maps dist/cli/entry.js do "refactor auth; add tests to worker.ts"`) — purely to
prove the PATH-shim/scope-gate mechanism itself works before committing to the design. This is
**not** a substitute for the committed test's own (currently self-skipped) run — it validates
the *harness*, run against code that is known-stale for the specific fields under test (do.ts /
run-proposal-compiler.ts), so it cannot stand in as proof of 452-002/003/004's actual fixes.

```
$ PATH="$FAKEBIN:$PATH" HOME="$HOMEDIR" timeout 60 node --enable-source-maps \
    /workspace/dist/cli/entry.js do "refactor auth; add tests to worker.ts"

⏳ Planning with the LLM… (timeout: 15 min — tune with brain_plan_timeout_ms)
Deckent Do — plan preview (dry-run; 1 task(s)). Nothing was started. Re-run with --run to execute.

Plan preview — approve to continue
1. Refactor worker module — Refactor auth and add tests to the worker module.

Reason: fixture
### goNogo
- goCriteria: works
- nogo: breaks

GATE: PASS
POLICY: ALLOW
Scope gate: FAIL — --run would NOT start (fix the write paths or pass --force-scope):
  ! Scope gate: 2 write path(s) do not exist and look like a typo or wrong directory:
  !   • [001-001] src/orchestra/worker.ts (no such file; a file with the same name exists at src/agents/worker.ts) → did you mean 'src/agents/worker.ts'?
  !   • [001-001] tests/orchestra/worker.test.ts (no such file and its directory 'tests/orchestra' is not in the repo)
  ! If these are intentional new files, override with acknowledgeScopePaths=true (MCP) / --force-scope (CLI). If a path should be an existing file, fix the DIRECTIVES scope before spawning.
Digest: 7f83531938c6…
Dry-run complete — nothing was started. Re-run with --run to execute this plan.
$ echo $?
0
```

This confirms, end to end, against a real spawned OS process:
- The PATH-shim resolves — `bootstrapProviders`' `claude --version` detection probe and the
  planner's `-p <prompt> ... --output-format json` call both hit the fake script, not a real
  network call.
- A semicolon-carrying goal (`"refactor auth; add tests to worker.ts"`) flows through the real
  `compileRunProposal`/`buildDirectives` chain without a hard error — exit 0, no crash.
- The scope-gate mirror (`core/scope-gate.ts`'s `evaluateScopeGate`, real/unmocked) genuinely
  computes FAIL from the ambiguous-basename fixture and renders verdict + message lines on real
  stdout.
- **Difference from the committed test's expected (fresh-dist) output**: this run's scope-gate
  line reads `"Scope gate: FAIL — --run would NOT start (fix the write paths or pass
  --force-scope):"` — the OLD, pre-452-003 ad-hoc wording. The current `messages.ts` source
  defines `runFlow.planPreview.scopeGate.fail` as the plain label `"Scope gate: FAIL"` only (the
  explanatory suffix is gone — 452-003 unified this onto `formatScopeGateLines`, which pushes
  just the label, then separately-prefixed `"  ! "` message lines). **This is independent,
  additional evidence that dist/ is genuinely stale** — the compiled binary is observably
  producing a different string than current `src/` would.

---

## 5. Scope Audit — `git status`

```
$ git status --short | grep -v '^??'
 M .deckent/settings/resource-log.jsonl
 M src/cli/commands/chat-slash-registry.ts
 M src/cli/commands/do.ts
 M src/cli/helpers/messages.ts
 M src/cli/repl/app.tsx
 M src/cli/repl/plan-preview-card.tsx
 M src/cli/repl/run.tsx
 M src/orchestra/run-proposal-compiler.ts
 M tests/cli/helpers/messages.test.ts
```

Every `M` line above is a **pre-existing** modification from dependencies 452-002/003/004 (present
in the sprint's starting git status, before this task began) — none of it is this worker's
write. This worker's own writes are exactly two, both in-scope:

```
$ git status --short | grep '^??' | grep -E 'term-slice|term-slice-541-544-proof'
?? tests/cli/term-slice-541-544-e2e.test.ts
```

(`.analysis/term-slice-541-544-proof.md` is this very document, also in-scope, written after this
snapshot.) **Zero `src/` files touched by this task.** The other untracked entries in the full
`git status` (`.analysis/ozet-notu*`, `.deckent/runtime/scheduler-shadow/sprint-452.jsonl`,
`.git-guard-bin/`, `alp-discipline/`, and the sibling `tests/**` files from dependencies
452-002/003/004) predate this task and are untouched by it.

Tmpdir leak check: the e2e test's `afterEach` removes `fixtureRoot`, `fakeBinDir`, and
`sandboxHome` (all under `os.tmpdir()`) unconditionally; the `/tmp` scratch directories from the
manual mechanism check in §4 were also cleaned up and are outside the git working tree entirely
(no `/workspace` state was ever touched by them).

---

## 6. Why `GO_WITH_TECH_DEBT` (not DONE, not NO_GO)

4 of 5 goCriteria items are fully, evidentially green: `tsc` clean, all task-1/2/3 test files
green in one run, the e2e file itself is written correctly (async-only, hermetic, no
mocked-output substitution) and was mechanically validated end-to-end before being committed,
and the proof file is this document. The **one** open item — the e2e test's live real-binary
assertion actually *passing* in this sprint — cannot be evidenced right now: `dist/` predates
4 of the 6 files this integration is about, and rebuilding is forbidden mid-sprint by this
project's own operating rules. This is the same class of gap `.analysis/run-rename-dilim3-smoke-proof.md`
(task 450-006) already named and resolved as `GO_WITH_TECH_DEBT`, closed by a host-side
post-sprint `npm run build` + re-run — not a defect in this task's harness, which is complete,
correct, and (per §4) proven to work mechanically. Closing step: host-side `npm run build`, then
re-run `npx vitest run tests/cli/term-slice-541-544-e2e.test.ts` — the `DIST_STALE` guard will
lift automatically and the live assertion in §3 will execute for real.
