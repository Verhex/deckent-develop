# ADR-D-002: Test Infrastructure & Hermeticity

**Class:** ADR-D (Dogfooding / Dev) · **Scope:** dev · **Immutable:** no · **Source:** publisher+contributor · **Enforcement:** today=vitest (`tests/` + dual `vitest.config.ts` / `vitest.dashboard.config.ts`) + 3 hermeticity artifacts (`test:ci-sim` · `lint-test-hermeticity` · `sandbox-home`) + agent-injected async/hermetic rule + auditor/reviewer flags a new `spawnSync` (advisory) → tomorrow=ADR-087-W residual `spawnSync` migration (`auditor.ts`) + `test:ci-sim` SIGKILL-hardening
**Status:** accepted · **Date:** 2026-06-30 · **Absorbs:** ADR-003 (vitest over Jest) + ADR-087 (Async I/O & Test Hermeticity Standard) + ADR-078 Part-A (CI-Hermeticity artifacts) · **Supersedes:** ADR-005 (Synchronous I/O — archived)
**Crosswalk:** ADR-003 (+ ADR-087 + ADR-078-A) → ADR-D-002

> **Scope note:** Contributor-only test conventions (how deckent is built + verified) — ADR-D, dev install, agent-injected to dev/dogfood workers. The discipline's *outcome* (a hermetic, trustworthy suite) is what users rely on, but the *convention itself* is contributor-facing — hence ADR-D, not ADR-G.

> **Supersession:** ADR-087 **supersedes ADR-005** (Synchronous I/O). ADR-005 is **archived** (no active number; historical record kept) — its async successor is now an active, agent-injected law, not a buried deprecated-Note.

---

## Context

Three dev-class decisions describe one concern — *how deckent's test suite is framed, written, and kept hermetic*:

- **ADR-003 (2026-04-16)** chose **vitest over Jest** (native ESM, faster startup, v8 coverage, Jest-compatible API).
- **ADR-005** originally mandated synchronous I/O; Sprint 132 hot-path performance problems **deprecated** it. Its replacement guidance (async + hermeticity) then lived only in a *deprecated* ADR's Note plus the CLAUDE.md worker rules — and **deprecated ADRs carry no active law to the agents** (Alperen, 2026-06-11: "deprecated ADR işe yaramaz; async + hermeticity diğer modeller de görmeli").
- **ADR-087 (2026-06-11)** closed that governance gap: async I/O + test hermeticity, elevated into an **accepted, agent-injected** ADR that every worker model reads.
- **ADR-078 Part-A (Sprint 215)** built the three permanent hermeticity artifacts (`test:ci-sim`, `lint-test-hermeticity`, `sandbox-home`) — battle-tested in the Sprint 214–215 CI green-up.

The 2026-06-30 review merges them into one ADR-D and records the ADR-005 supersession explicitly.

---

## Decision (Today)

### 1. Test framework — vitest (over Jest)

vitest is the test framework: native ESM, fast startup, v8 coverage (`@vitest/coverage-v8`), Jest-compatible API. Tests live under `tests/`; configuration is **dual** — `vitest.config.ts` (root suite) + `vitest.dashboard.config.ts` (dashboard suite). Jest dependency/config is **zero** (the only `jest` trace is the dashboard's `@testing-library/jest-dom` DOM-matcher, used *with* vitest — not a violation). Fork-bounding / CI-hermeticity settings are baked into config.

> **Note:** local full-suite runs are memory-capped (≤16 GB; `VITEST_MAX_FORKS=2` + split batches) — a single-process full run OOMs under WSL. (Binding dev constraint; memory `feedback_vitest_16gb_local_cap`.)

### 2. No `spawnSync` for subprocesses — async `spawn`

```xml
<async-spawn>
  <rule>All subprocess invocation uses async spawn (node:child_process)
        + Promise.allSettled batching — never spawnSync.</rule>
  <why>spawnSync blocks the event loop → CI timeouts + O(n) scan contention
       (Sprint 279 WK-7: the auditor's 30s scan ran a per-worker spawnSync('docker', …)).</why>
  <sanctioned-exception>The ADR-G-002 spawnSync security pattern (array-args, no shell)
       for SHORT, TRUSTED, non-hot-path one-shots is the SOLE permitted spawnSync use.</sanctioned-exception>
</async-spawn>
```

### 3. Hot-path I/O async; one-shot startup may stay sync

Hot-path file/network I/O — loops, scan cycles, worker dispatch, large reads — MUST be async. A **one-shot small config read at startup** (`readFileSync` of a <1 KB JSON) MAY stay sync: the Sprint 132 perf failure was hot-path, not startup.

### 4. Tests hermetic

```xml
<hermeticity>
  <rule>All test I/O under os.tmpdir() (e.g. withSandboxHome()); cleaned up in afterEach.
        Never write to project root or real HOME.</rule>
  <rule>NEVER read gitignored local state — .deckent/config.json, .brain/memory.db,
        ~/.deckent, .deck/ — they are absent on a fresh checkout.</rule>
  <rule>No real network / docker. Assume the only files present are those committed to git.</rule>
  <verify>npm run test:ci-sim — the canonical hermetic reproducer.</verify>
</hermeticity>
```

### 5. The three hermeticity artifacts (ADR-078 Part-A)

```xml
<hermeticity-artifacts>
  <artifact path="scripts/test-ci-sim.mjs" cmd="npm run test:ci-sim">
    Renames .deckent/config.json + .brain/memory.db + .brain/ to backups, runs
    CI=1 vitest run, restores in try/finally (no state lost even on crash — covers
    SIGTERM, not SIGKILL). Reproduces the clean-machine CI environment locally in seconds.</artifact>
  <artifact path="scripts/lint-test-hermeticity.mjs">
    Scans tests/**/*.ts for readFileSync of gitignored state without a skip-if-absent
    guard; reports file:line violations; maintains a skip-pattern allowlist.</artifact>
  <artifact path="tests/helpers/sandbox-home.ts">
    withSandboxHome(fn) / useSandboxHome() — redirect process.env.HOME to a unique
    os.tmpdir() dir per test, cleaned up after; nested calls independent.</artifact>
</hermeticity-artifacts>
```

### 6. Agent-injected

This async + hermeticity rule is **agent-injected**: every worker model (Claude / Codex / Gemini) in the dev/dogfood environment reads it via ADR prompt-injection, and it is anchored in `.claude/rules/karpathy-discipline.md` ("CUSTOM — Test Hermeticity"). It is no longer a buried deprecated-Note; it is an enforced, injected decision. (Per ADR-G-019 class/scope-aware recall, ADR-D reaches dev/dogfood workers, not user-project workers.)

### 7. Routing

CI / test-infra tasks (pipeline fixes, hermetic reproducer) route to the **ci-guardian** agent + **ci-testing** skill (`activation-engine.ts`), so CI-hygiene work gets the right specialization automatically.

---

## Intent / Roadmap (Tomorrow)

- **ADR-087-W — residual `spawnSync` migration:** ~15 `spawnSync` calls remain in `auditor.ts` (including the ADR-G-002 enforcement string + `gatherCiBaseline`); migrate them to async `spawn`. The auditor's liveness probes are **already** async-batched (Sprint 279); this closes the remaining tail. (MASTER-PLAN: ADR-087-W.)
- **`test:ci-sim` SIGKILL-hardening:** the rename/restore `try/finally` covers SIGTERM but not SIGKILL (stranded backups then need a manual rename) — a crash-safe restore is a candidate refinement.

---

## Consequences

**(+)** One dev-class law frames the suite (vitest), forbids event-loop-blocking `spawnSync` (with the ADR-G-002 security carve-out as the sole exception), and makes hermeticity structurally enforceable (`test:ci-sim` reproducer + `lint-test-hermeticity` guard + `sandbox-home` helper). The async/hermetic rule is agent-injected, so every dev/dogfood worker writes hermetic, non-blocking code by default. ADR-005's archival removes a dead deprecated-Note from the active set.

**(−)** ~15 residual `spawnSync` calls in `auditor.ts` await ADR-087-W migration; `test:ci-sim` is not SIGKILL-safe; enforcement is advisory (the auditor/reviewer **flags** a new `spawnSync` outside the exception — it is not a hard block). Local full-suite runs require the ≤16 GB fork-bounded batch discipline.

---

## References / Absorbed

- **Absorbs:** ADR-003 (vitest over Jest) · ADR-087 (Async I/O & Test Hermeticity Standard — async spawn, hot-path-async, hermetic tests, agent-injected) · ADR-078 Part-A (CI-Hermeticity artifacts: `test-ci-sim` + `lint-test-hermeticity` + `sandbox-home`).
- **Supersedes:** ADR-005 (Synchronous I/O — **archived**; the async successor is now this active, injected law).
- **Cross-ref:** ADR-G-002 (spawnSync Security Pattern — the sanctioned array-args exception; sync-vs-async is the orthogonal axis this ADR owns) · ADR-D-001 (Build Baseline — the TS/ESM/Node toolchain the suite runs on) · ADR-G-019 (ADR Governance — ADR-D class/scope-aware injection to dev/dogfood workers).
- **Born work-items:** ADR-087-W (residual `spawnSync` migration in `auditor.ts`) · `test:ci-sim` SIGKILL-hardening (candidate).
- **Direction:** `.analysis/adr-review-crosswalk.md` (rows 003 + 087 + 078-A → ADR-D-002), `.claude/rules/karpathy-discipline.md`, memory `project_ci_green_root_causes` · `project_test_home_leak` · `feedback_vitest_16gb_local_cap`.
</content>
