# 502 — Publish-gate drift-gate smoke proof (task 451-004)

Real-binary proof for the `builtins_drift` gate wiring in `scripts/validate-publish.mjs`
(fixed by 451-001: async spawn + `checkBuiltinsDrift`, replacing an `execSync`/`safeExec`
path that only captured `err.stdout` and silently dropped the actionable FAIL detail
`builtins-drift-check.mjs` writes to stderr).

## 1. Real-binary run — `npm run validate:publish`

Command: `npm run validate:publish` (no args; real dist/, real repo trees).

```
> deckent@1.0.0-beta.1 validate:publish
> node scripts/validate-publish.mjs


  npm publish readiness — 8 gate validation

  [PASS] pack_size_and_count: Pack 3.9 MB (4055680 bytes), 1981 files
  [PASS] engines_node: engines.node=">=24.0.0" requires Node >=24
  [PASS] entry_points: Entry points: main=./dist/index.js, types=./dist/index.d.ts
  [PASS] no_internal_state_leak: No internal state directories in tarball
  [PASS] adr_lint: npm run lint:adr exited 0
  [FAIL] link_lint: npm run lint:link exited 1: lint-links: scanning 430 files in /workspace
✗ 50 broken link(s):
  .analysis/run-rename-dilim2-inventory.md:1330:48  →  ../guide/concepts.md   (target not found: ../guide/concepts.md)
  .analysis/run
  [PASS] bin_exec_bits: All 2 bin files present and executable
  [PASS] dashboard_bundle: Dashboard bundle present: assets/index-CkNis4qp.js
  [PASS] builtins_drift: [drift-gate] baseline-green — [builtins-drift-check] ✓ no new drift — 40 known drift item(s) grandfathered
  [FAIL] pack_category_baseline: Pack category baseline delta gate failed — category count grew >10%: dist/core::.d.ts: 248→278 (+12.1%); dist/core::.js: 248→278 (+12.1%); dist/orchestra::.d.ts: 169→190 (+12.4%); dist/orchestra::.js: 169→190 (+12.4%)

  Summary: 7 passed, 1 failed, 0 warnings

  Beta launch BLOCKED — fix gates above.
```

(ANSI color codes present in the raw terminal output are stripped here for readability;
PASS/FAIL tags are preserved verbatim.)

**Drift-gate line (this task's target):**
```
[PASS] builtins_drift: [drift-gate] baseline-green — [builtins-drift-check] ✓ no new drift — 40 known drift item(s) grandfathered
```
This confirms the drift-gate wiring is live and green — the exact `[drift-gate]` message
produced by `checkBuiltinsDrift()` around a real spawned `builtins-drift-check.mjs --check`
run, printed by the CLI entry block in `scripts/validate-publish.mjs`.

**Honest note — two unrelated pre-existing failures, out of this task's scope:**
- `link_lint` — 50 broken doc links (`lint:link`), unrelated to the drift gate.
- `pack_category_baseline` — `dist/core`/`dist/orchestra` category growth vs the committed
  pack baseline (`scripts/pack-baseline.json`), also unrelated to the drift gate.

Both were present before this task started and are not touched by task 451-004's write
scope (`tests/scripts/validate-publish-drift-gate.test.ts` + this file only). The overall
CLI exit code is 1 (non-zero) because of these two unrelated gates, not because of
`builtins_drift`, which is the gate under test here and reads PASS.

## 2. Targeted vitest run — `tests/scripts/validate-publish-drift-gate.test.ts`

Command: `VITEST_MAX_FORKS=2 npx vitest run tests/scripts/validate-publish-drift-gate.test.ts`

```
 RUN  v3.2.4 /workspace

 ✓ tests/scripts/validate-publish-drift-gate.test.ts (3 tests) 92ms

 Test Files  1 passed (1)
      Tests  3 passed (3)
   Start at  09:06:53
   Duration  276ms (transform 35ms, setup 10ms, collect 31ms, tests 92ms, environment 0ms, prepare 37ms)
```

3 tests, all green:
1. **baseline-green (real repo state)** — async-spawns the real
   `scripts/builtins-drift-check.mjs --check` against the real repo trees (read-only),
   asserts exit 0 + real stdout contains `no new drift`, then feeds that real result into
   `checkBuiltinsDrift` and asserts the rendered message contains `[drift-gate]
   baseline-green`.
2. **injected-drift (hermetic tmpdir fixture)** — builds a self-contained fixture under
   `mkdtempSync(tmpdir())` (a copy of `builtins-drift-check.mjs` + a miniature
   `agents/fixture-widget` two-tree fixture + a hand-written clean baseline), mutates the
   `.deckent`-side `PROMPT.md`, spawns the copied script with `cwd` pointed at the
   fixture, and asserts the real stderr contains the drifted key
   (`agents::diff::fixture-widget::doc`) and the exact re-pin command
   (`node scripts/builtins-drift-check.mjs --write`) — then asserts `checkBuiltinsDrift`
   relays both into its `[drift-gate]` message (the exact detail 451-001's fix restored).
3. **fixture sanity check** — the same fixture builder, unmutated, round-trips clean
   (exit 0) to prove the fixture itself isn't accidentally seeded with drift.

No `spawnSync` anywhere (ADR-D-002 — both subprocess calls use async `child_process.spawn`
wrapped in a Promise). No real `src/core/builtins` or `.deckent/agents|skills` content was
written, and the committed `.deckent/builtins-drift-baseline.json` was never re-pinned —
verified via `git status --porcelain` / `git diff --stat` against those paths post-run
(both empty).

## 3. Type check

`npx tsc --noEmit` — exit 0, no errors.
