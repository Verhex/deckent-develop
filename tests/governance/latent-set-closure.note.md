# LAT-SWEEP-PROOF — coverage-eşdeğeri tam-suite yerel kanıt

Task: 398-006 / 398-006-fix (kapanış-task, fix YAPILMADI — yalnız kanıt-koşusu + rapor).

## Run

```
VITEST_MAX_FORKS=2 npm test
```

- Commit at run start (HEAD when the background run was launched): `b82036c6cac3bdd6bd3765d2380e95db7cf4b6cb`
- **Not 0-fail.** Dependency tasks 398-001..005 confirmed complete first (4× `DONE`, 1× `GO_WITH_TECH_DEBT` — task 398-003), matching the 9 modified test files + `DIRECTIVES.md` present in the working tree.
- `npx tsc --noEmit` → clean, no errors.

```
 Test Files  15 failed | 2011 passed | 1 skipped (2027)
      Tests  68 failed | 29645 passed | 90 skipped (29803)
     Errors  4 errors
   Start at  13:28:31
   Duration  474.96s (transform 14.03s, setup 0ms, collect 159.37s, tests 564.04s, environment 171ms, prepare 62.72s)
EXIT_CODE=1
```

⚠️ This is a **shared, live worktree** (multiple concurrent agent sessions). `HEAD` moved twice
during this task's own execution window (`09ac0dc9` → `b82036c6` → `1467abfc`) from commits made by
other sessions, unrelated to this task's scope. All 15 failing files below were re-checked for root
cause; none trace back to the 9 files touched by sibling tasks 398-001..005 or to this task's own
(zero) changes — see clusters below. Honest report, not a fixed suite.

## Failure clusters (68 tests / 15 files) — root-cause hypotheses

### Cluster A — WORKER-GIT-GUARD shim intercepts git ops inside test-fixture repos (8 files, ~45 tests)
`.git-guard-bin/git` is first on `$PATH` for this session (`src/orchestra/git-worker-guard.ts:buildGitGuardShim()`,
ADR/task 381-001). It denylists `stash|reset|checkout|clean|rebase|commit|revert` **process-wide**,
regardless of `cwd` — exit code `97` with `"deckent WORKER-GIT-GUARD: git <cmd> is blocked for workers"`.
Its intended target is the real `/workspace` repo, but because it shadows `git` globally it also blocks
the many orchestra/agents tests that build **throwaway tmpdir git fixtures** and legitimately need
`git commit`/`git stash`/`git reset` to seed those fixtures:
- `tests/agents/agentic-worker-entry.test.ts` (2) — `initRepoWithBaseline` helper's `git commit` → exit 97
- `tests/core/deck-file.test.ts` (1) — `git add .deck && git commit` → exit 97
- `tests/orchestra/directives-restore-quirk.test.ts` (4) — repro is *literally* a `git stash` root-cause test; the guard now blocks the very `git stash` under test
- `tests/orchestra/disk-verify.test.ts` (11) — tmpdir git fixtures (`restoreSprintFromCheckpoint`, `computeScopedDiskChanges`, `createDefaultGitDiffNumstatProvider`) all seed via `git commit`
- `tests/orchestra/git-worker-guard.test.ts` (1) — `git show HEAD` returns exit 128 (`bad revision 'HEAD'`) because the fixture's own seeding commit was blocked first — cascading, not a shim-passthrough bug itself
- `tests/orchestra/result-assembler.test.ts` (4) — `git commit --allow-empty -q -m init` → exit 97
- `tests/orchestra/rollback-decide.test.ts` (3) — `revertFilesToHead` tmpdir fixture seeding
- `tests/orchestra/sprint-reporter.test.ts` (6) — `execSync('git init && ... git commit ...')` → exit 97
- `tests/scripts/sync-to-product.test.ts` (2) — `git add -A && git commit -q -m init` → exit 97

Environment-specific to *this* sandboxed session (the guard shim is installed per active worker
session), not a code defect in the tests or the guarded modules themselves. The guard's denylist
match is on `argv[1]` only, with no cwd/repo-identity check — it cannot distinguish "real repo
destructive op" from "disposable tmpdir fixture op," which is the gap worth an ADR follow-up.

### Cluster B — `$HOME` sandbox tmpfs is 100% full (3 files, ~20 tests)
`HOME=/tmp/deckent-home`, mounted `tmpfs size=102400k` (100 MB) — currently `df -h /tmp/deckent-home`
reports **100M/100M used, 4.0K available, 100%**. Any code path that writes under `homedir()` without
a per-test override hits `ENOSPC: no space left on device`:
- `tests/cli/helpers/codex-config.test.ts` (6) + `tests/integration/multi-env.test.ts` (1) —
  `generateCodexConfig()` (`src/cli/helpers/codex-config.ts:22`) writes `join(homedir(), '.codex', 'config.toml')`
  **before** the project-scoped path; the global write hits the full tmpfs.
- `tests/core/credentials.test.ts` (23 — effectively the whole file) — `CredentialManager` in the
  test is constructed as `new CredentialManager(tempDir)` **without** the `keyringPath` option, so
  `getMasterKey()` (`src/core/credential-encryption.ts:36`) falls back to the real
  `join(homedir(), '.deckent', '.keyring')` instead of a per-test path. First hit:
  `ENOSPC` on `writeFileSync`; the resulting partially-written/empty keyring file then makes every
  later test in the file fail with `"invalid key length: expected 32 bytes, got 0"` — this is a real
  **ADR-D-002 (C1 hermetic filesystem) gap** in the test file itself (missing `keyringPath: join(tempDir, '.keyring')`
  in the `CredentialManager` constructor calls), independent of the tmpfs being full today.

### Cluster C — `npm run lint:errors` subprocess exit code corrupted under full-`$HOME` (2 files, 2 tests)
`tests/core/error-handling-unification.test.ts` and `tests/core/error-registry-lint.test.ts` both
`execSync('npm run lint:errors', …)` and assert `exitCode <= 1`. Standalone (outside the full-suite
run) the script is well-behaved: `node scripts/check-error-handling.mjs` exits `0`/`1` only (verified
directly: `17 violation(s) across 166 files — FAIL`, `EXIT=1`). Inside the full-suite run it reported
`exitCode = 228` — not a code the script itself ever emits (`process.exit(0)` / `process.exit(1)` are
the only two call sites). `npm` itself writes cache/log state under `$HOME/.npm`; with the same 100%-full
`/tmp/deckent-home` tmpfs from Cluster B, `npm run …` subprocess launches are a second victim of that
resource exhaustion, most likely surfacing as an anomalous npm-level exit status rather than the
script's own 0/1. Treated as the same root cause as Cluster B, not a 3rd independent issue.

### Cluster D — process-global exit-handler leak across unrelated mocked test files (4 errors, no assigned test failures)
`src/agents/worker-lifecycle.ts:175` registers a process-level exit handler (`fsyncResultFile` →
`resultFilePath`) as an import-time side effect. When the vitest fork later tears down an *unrelated*
test file that partially mocks `../../src/core/constants.js` (or `node:fs`) without re-exporting
`TASKS_DIR`, the leaked handler fires against that file's mock namespace post-teardown and throws
`"[vitest] No 'TASKS_DIR' export is defined on the … mock"`. Surfaced as 4 uncaught-exception `Errors`
(not attributed to a specific test) in: `tests/mcp/run-provider-free.test.ts`, `tests/cli/commands/doctor.test.ts`,
`tests/cli/dashboard.test.ts`, `tests/cli/commands/dashboard-overhaul.test.ts`. Root cause is
`worker-lifecycle.ts` registering a global listener as a module-load side effect instead of scoping it
to the actual worker-entry invocation, combined with those 4 test files' `vi.mock()` calls not
spreading `importOriginal()` for `constants.js`.

### Cluster E — genuine backfill/rollup gap, unrelated to the environment issues above (1 file, 1 test)
`tests/kpi/kpi-backfill.test.ts` — `listSprintViews` on a history-only (forward-collection-gap)
sprint returns `cost_per_sprint.result === null` where the test expects a finite number (0 would be
acceptable). `kpi-backfill.ts`'s own header comment states historical sprints carry no per-task usage
telemetry so "cost/token/retry/lines measures default to 0 (deriveMeasurements is null-safe)" — but
`deriveMeasurements`/`computeSprintKpis` appear to *omit* the `cost_usd` base measurement entirely
for a usage-less sprint rather than zero-filling it, so `rollup-engine.ts` has nothing to divide and
returns a null KPI result instead of the documented `0`. This looks like a real, narrow regression in
the backfill/rollup null-safety contract — worth its own follow-up task; not investigated further
here per this task's report-only scope.

## Verdict

**Not 0-fail.** 68/29,803 tests fail (0.23%), concentrated in 5 identified, independently-diagnosed
root causes — 4 of the 5 are this-session environment artifacts (git-guard shim scope, full sandbox
`$HOME` tmpfs, and one downstream process-leak) rather than defects introduced by sprint 398's own
changes; 1 (Cluster E, `kpi-backfill`) is a genuine narrow product-logic gap warranting its own
follow-up task. None of the 15 failing files overlap with the files touched by sibling tasks
398-001..005, and `npx tsc --noEmit` is clean.

Recommended follow-ups (not actioned here — report-only task):
1. Scope `.git-guard-bin/git`'s denylist check to the real project repo root (or an allowlisted
   tmpdir-fixture escape hatch) so it stops shadowing legitimate test-fixture git operations.
2. Free or enlarge the `/tmp/deckent-home` sandbox tmpfs (currently 100 MB, 100% full) so
   `homedir()`-dependent code paths (codex config, credential keyring, npm cache) don't ENOSPC.
3. `tests/core/credentials.test.ts`: pass `keyringPath: join(tempDir, '.keyring')` to every
   `new CredentialManager(...)` call so the suite never touches the real `~/.deckent/.keyring`
   (ADR-D-002 C1 hermeticity gap, independent of issue 2 above).
4. Scope/clean up the `process.on('exit', …)` handler in `src/agents/worker-lifecycle.ts` (or have
   the 4 offending test files' `vi.mock('.../constants.js', …)` spread `importOriginal()`).
5. Investigate why `deriveMeasurements`/`computeSprintKpis` return `null` instead of `0` for
   `cost_per_sprint` on a backfilled, usage-less sprint (`tests/kpi/kpi-backfill.test.ts`).

---

## Brain host-side ground-truth (2026-07-10, Faz-0 kapanış eki)

Yukarıdaki worker-koşusu kendi sandbox'ında kontamineydi (Cluster A git-guard-shim, B/C dolu-tmpfs,
D exit-handler-leak = ortam-artefaktı; worker raporu dürüst ve korunuyor). Brain'in HOST-side
kanıt-koşusu (`VITEST_MAX_FORKS=2 npm test`, aynı gün):

- İlk koşu: `2 failed | 2024 passed (2027 files) · 3 failed | 29743 passed (29803 tests)` —
  kalan 2 dosya = `tests/core/builtins/agent-catalog-agsk2` + `skill-catalog-agsk4` (born-605
  sınıfı: canlı `.deckent/` havuzunda zero-stats pin'i; sprint-398 finalizer'ı stats'ı meşru bump'ladı).
- Fix: agsk2/3/4'te canlı-havuz assert'leri şekil+invariant'a repin'lendi (şablon-ağaç exact-zero
  korundu); agsk3'teki AYNI-SINIF latent pin (rpc-protocol/onboarding-ux — advisor-yakaladı) proaktif
  düzeltildi; cross-tree eşitlik manifest'te stats-hariç. → 3 dosya 98/98 yeşil.
- Cluster E (kpi-backfill): kök-neden worker-hipotezinden farklı çıktı — born-563 strict-tenant
  flip'i sonrası NULL-tenant seed'in görünmez kalması; seed `tenantId: 'default'` yapıldı, 10/10 yeşil.
- Eski 10 latent-dosya ayrı doğrulama koşusu: 161/161 yeşil. `npx tsc --noEmit` temiz.
- Worker follow-up'ları 1-4 (git-guard tmpdir-fixture kapsamı · tmpfs · credentials keyringPath
  hermetiklik · worker-lifecycle exit-handler leak) → born-627 olarak ledger'a kayıtlı.
