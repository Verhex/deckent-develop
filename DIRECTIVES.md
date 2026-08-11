# DIRECTIVES — Sprint-B4: four approved slices, codex-continuation on the roster

## Goal

Four MASTER-PLAN rows advance: spawnsync hot-path (3315), platform registry (90),
beta README truth (8092), and the codex continuation-admission defect itself (3308).
Every slice is scope-disjoint; none touches provider auth or runs build tooling.
The scope-parser phantom fix (row 3312) is live in the running build, so multi-dot
paths in Files lines are first-class again. Codex-provider routing stays claude-side
for THIS run — row 3308's fix must land and be rebuilt before codex workers return.

Provider, model, effort and effective concurrency are resolved from effective config,
registry, role policy, auth/reachability evidence, usage/limit authority and host admission.

## Execution Contract

- Behaviour outside each task's stated defect stays byte-identical; every test passing
  today still passes, unchanged.
- Do not weaken or delete an existing assertion to make new behaviour pass; report the
  conflict in result notes instead.
- Read the existing mechanism before designing; every task EXTENDS something present.
  A second parallel mechanism is a NO-GO in all four.
- Fail closed on ambiguity; nothing may make a destructive action easier to trigger.
- Workers must not run `npm run build`, full `npm test`, provider login/auth mutation,
  sprint lifecycle commands, git commit, or cleanup. Scoped vitest runs only.
- Tests are hermetic: tmpdir-based, no network, no live `.tasks`/`.deckent` writes,
  async spawn only (ADR-D-002).
- New user-facing text goes through the i18n message authority (`getMessage`, en+tr);
  CLI descriptions are plain strings matching the surrounding file.
- Zero hardcode (ADR-G-036): no model name or flow value literal on a code path.

---

## Task 1: Move the 4 sync git calls off the worker-dispatch hot path (row 3315)

- Files: src/orchestra/spawn-backend-docker.ts, scripts/spawnsync-baseline.json, tests/orchestra/spawn-git-async.test.ts
- Scope: src/orchestra/spawn-backend-docker.ts, scripts/spawnsync-baseline.json, tests/orchestra/spawn-git-async.test.ts
- Model: claude-sonnet-5
- Dependencies: none

Measured (row 3315, owner decision #2 of 2026-08-02): src/orchestra/spawn-backend-docker.ts
performs `git hash-object -w` twice, `git cat-file blob` and `git diff --numstat`
synchronously on the dispatch hot path. The code stays — provider-observation v2's
file-diff evidence depends on it — but the calls must stop blocking dispatch.

Required: the four call sites move to non-blocking async equivalents with identical
outputs and ordering guarantees (the observation evidence they feed must be
byte-identical); the corresponding entries leave scripts/spawnsync-baseline.json (the
ratchet shrinks, never grows); a test pins the async path produces the same evidence
as before on a hermetic tmpdir git fixture (no network).

**Test:** `npx vitest run tests/orchestra/spawn-git-async.test.ts`

**NO-GO:** dropping or reordering observation evidence, adding a new sync call anywhere,
or growing any ratchet baseline.

---

## Task 2: Bind tests/PLATFORM.md to a source-derived platform registry (row 90)

- Files: scripts/gen-platform-registry.mjs, tests/PLATFORM.md, tests/scripts/platform-registry.test.ts
- Scope: scripts/gen-platform-registry.mjs, tests/PLATFORM.md, tests/scripts/platform-registry.test.ts, scripts/
- Model: claude-sonnet-5
- Dependencies: none

Measured (row 90, 2026-08-03): ~6 environment-dependent test breaks are platform-condition
gaps, not product bugs — Windows taskkill tests on Linux runners, a missing
`.deckent/skills/docs` directory in CI, a containment ratchet timing out at 60s, two
dashboard files needing a live server. tests/PLATFORM.md is stale prose no tool consumes.

Required: a generator derives the platform-tag registry (linux, macos, windows-native,
WSL) from source truth — the actual platform-conditional patterns in the test tree —
regenerates tests/PLATFORM.md between AUTOGEN markers, and a drift test fails closed
when the file no longer matches the generated truth. Do NOT rewrite the conditional
skips themselves in this slice — registry, doc truth and drift gate only. The
human-authored sections of tests/PLATFORM.md outside the markers are byte-preserved.

**Test:** `npx vitest run tests/scripts/platform-registry.test.ts`

**NO-GO:** editing individual platform-conditional tests, deleting human-authored
sections, or a hand-maintained registry instead of a derived one.

---

## Task 3: Beta-scope README reality pass, EN and TR in lockstep (row 8092)

- Files: README.md, README.tr.md
- Scope: README.md, README.tr.md, docs/en/getting-started.md, docs/tr/getting-started.md
- Model: claude-opus-5
- Dependencies: none

Measured: the public README pair predates several shipped surfaces (run-flow inbox
`runs --retire` and `--limit`, owner-managed model activation `deckent models
activate/deactivate/activation`, the merge-queue governed release flow) and still
describes some aspirational behaviour as present. Beta publication needs the README to
claim exactly what the binary does today.

Required: verify every user-facing claim in README.md against the current CLI surface —
each command, flag and workflow named there must exist in src/cli with the same name and
semantics; correct or remove what does not hold; add the shipped-but-undocumented
surfaces listed above in the appropriate existing sections. AUTOGEN/managed sections
(stats badges, generated blocks) are OFF-LIMITS. README.tr.md mirrors every change 1:1
in meaning, matching the file's existing TR voice. Getting-started pages update only
where they contradict the README fixes. Result notes carry a claim-by-claim
verification table (claim, code evidence, kept/fixed/removed).

**Test:** run `npx vitest run tests/scripts/update-readme-stats.test.ts` purely as an
unchanged-file proof that generated markers stayed intact — that test file itself is
read-only for this task and must not be edited.

**NO-GO:** editing inside AUTOGEN markers, EN/TR divergence, documenting an unshipped
surface as present, or deleting the stats badges.

---

## Task 4: Codex attempts pass the landing continuation admission (row 3308)

- Files: src/orchestra/execution-continuation-runner.ts, src/orchestra/runtime-budget-monitor.ts, tests/orchestra/continuation-admission-modes.test.ts
- Scope: src/orchestra/execution-continuation-runner.ts, src/orchestra/runtime-budget-monitor.ts, tests/orchestra/continuation-admission-modes.test.ts
- Model: claude-opus-5
- Dependencies: none

Measured (row 3308, sprint-507 disk evidence): both codex tasks died at attempt-1
because assertContinuationStartupReserve (execution-continuation-runner.ts, around line
106) requires the first runtime-budget observation to have mode 'incremental', while
the codex adapter's startup observation is honestly recorded as mode 'cumulative'
(attempt 417a381d observation file; the codex usage event stream reports cumulative
turn totals with usageSemantics mode 'cumulative', terminal true). Claude-mode
attempts, whose first observation is incremental, pass the same admission.

Required: one true contract between the observation writer and the continuation
admission. Root-cause first — read how the writer derives mode from provider usage
semantics and how appliedDelta is computed for cumulative streams, then pick the
smaller sound change and state why in the result notes: either the first observation
of a cumulative-mode stream is written as the semantically-correct incremental delta
from zero, or the admission accepts a cumulative-mode first observation whose
appliedDelta arithmetic is delta-correct. Budget truth is inviolable either way: the
appliedDelta totals, turn counting and reserve arithmetic must stay byte-correct for
BOTH provider semantics, and the existing claude-mode admission behaviour must not
change. The regression test pins both modes through the admission — cumulative-first
passes with correct deltas, incremental-first passes unchanged, and a genuinely
malformed first observation still fails closed.

**Test:** `npx vitest run tests/orchestra/continuation-admission-modes.test.ts`

**NO-GO:** weakening the fail-closed admission for malformed observations, double
counting cache tokens in either mode, changing claude-mode behaviour, or provider-name
literals outside fixtures (ADR-G-036 — branch on usage semantics, never on provider id).
