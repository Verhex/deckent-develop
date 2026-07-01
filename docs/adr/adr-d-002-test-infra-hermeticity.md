# ADR-D-002: Test Infrastructure & Hermeticity

**Class:** ADR-D (Dogfooding / Dev) · **Scope:** dev · **Immutable:** no · **Source:** publisher+contributor · **Enforcement:** today=vitest (`tests/` + dual `vitest.config.ts` / `vitest.dashboard.config.ts`) + 3 hermeticity artifacts (`test:ci-sim` · `lint-test-hermeticity` · `sandbox-home`) + **✅ `lint-no-spawnsync` (W1, 2026-07-01): a no-NEW-spawnSync RATCHET (89 grandfathered call sites, un-audited baseline; catches namespace `cp.spawnSync` too) + a HOT-PATH hard-block (36 hot-path spawnSync across 6 files on an owned `hotPathDebt` list; a new hot-path spawnSync hard-fails)** → tomorrow=ADR-087-W auditor residual migration (W2, shrinks the hotPathDebt); then `test:ci-sim` sandbox-overlay (W3, gated on the STATE-RESOLVER precondition)
**Status:** accepted (provisional — **W1 ✅ done 2026-07-01** (ratchet + hot-path block live; full ADR-G-002 M1–M6 audit of the 89 grandfathered sites is NOT claimed); **mechanical enforcement fully closes when W2 (ADR-087-W) migrates the hot-path residual**; W3 overlay is P1 hardening) · **Date:** 2026-06-30 (rev 2026-07-01) · **Absorbs:** ADR-003 (vitest over Jest) + ADR-087 (Async I/O & Test Hermeticity Standard) + ADR-078 Part-A (CI-Hermeticity artifacts) · **Supersedes:** ADR-005 (Synchronous I/O — archived)
**Crosswalk:** ADR-003 (+ ADR-087 + ADR-078-A) → ADR-D-002

> **Scope note:** Contributor-only test conventions (how deckent is built + verified) — ADR-D, dev install, agent-injected to dev/dogfood workers. The discipline's *outcome* (a hermetic, trustworthy suite) is what users rely on, but the *convention itself* is contributor-facing — hence ADR-D, not ADR-G.

> **Supersession:** ADR-087 **supersedes ADR-005** (Synchronous I/O). ADR-005 is **archived** (no active number; historical record kept) — its async successor is now an active, agent-injected law, not a buried deprecated-Note.

> **Format note:** the immutable core lives in the **Contract** section below — the `Immutable:` taxonomy flag stays the ADR-D binary `no` (dev conventions evolve; ADR-G-019), and the Contract carries the stronger-than-typical-D stability in prose ("MUST hold until superseded"). Expressed leanly as a compact `C1–C7` list, symmetric with ADR-D-001's house style, **not** as a verbose I1–I8 block.

---

## Context

Three dev-class decisions describe one concern — *how deckent's test suite is framed, written, and kept hermetic*:

- **ADR-003 (2026-04-16)** chose **vitest over Jest** (native ESM, faster startup, v8 coverage, Jest-compatible API).
- **ADR-005** originally mandated synchronous I/O; Sprint 132 hot-path performance problems **deprecated** it. Its replacement guidance (async + hermeticity) then lived only in a *deprecated* ADR's Note plus the CLAUDE.md worker rules — and **deprecated ADRs carry no active law to the agents** (2026-06-11: "deprecated ADR işe yaramaz; async + hermeticity diğer modeller de görmeli").
- **ADR-087 (2026-06-11)** closed that governance gap: async I/O + test hermeticity, elevated into an **accepted, agent-injected** ADR that every worker model reads.
- **ADR-078 Part-A (Sprint 215)** built the three permanent hermeticity artifacts (`test:ci-sim`, `lint-test-hermeticity`, `sandbox-home`) — battle-tested in the Sprint 214–215 CI green-up.

The 2026-06-30 review merges them into one ADR-D, records the ADR-005 supersession explicitly, and hardens enforcement from advisory to mechanical (see *Contract* and *Roadmap*).

---

## Contract (immutable — test-governance core)

Test infrastructure *details* may evolve (vitest version, config shape, the reproducer's internals). The invariants below MUST hold until a superseding ADR explicitly revokes them. Test trust comes not from the developer machine's current state, but from a verification universe built from zero, sealed from the outside world, and sandboxed.

**C1 — Hermetic filesystem (MUST).** Tests MUST NOT read or write real developer state. Real `HOME`, project-root state, `.deckent/`, `.brain/`, `.deck/`, `~/.deckent`, and other gitignored local state are unavailable by default. Tests that need state create it under `os.tmpdir()` or a sandbox helper and clean up in `afterEach`.

**C2 — Clean-checkout assumption (MUST).** The suite MUST pass when only git-committed files exist. Any dependence on ignored, generated, user-local, or machine-local files is a test bug unless explicitly integration-tagged.

**C3 — No real external dependencies by default (MUST).** The default unit/CI suite MUST NOT require real network, Docker, provider CLIs, provider APIs, credentials, or host daemons. Such tests require an explicit integration tag/profile and are excluded from the default suite.

**C4 — Async hot paths (MUST).** Hot-path file / network / subprocess work MUST be async. `spawnSync` is forbidden outside the ADR-G-002 sanctioned exception (C5).

**C5 — spawnSync exception containment (MUST).** A permitted `spawnSync` call MUST satisfy every **mechanically-checkable** criterion below; the runtime criterion is a review-time judgment. New unapproved `spawnSync` is a **hard** lint failure (W1), not advisory.

**C6 — Mechanical enforcement is authoritative (MUST).** Agent-injection shapes worker behavior; it is **not** the source of truth. Authority lives in the gates: vitest, `lint-test-hermeticity`, `lint-no-spawnsync`, pre-commit checks, and `test:ci-sim`.

**C7 — Deterministic environment (SHOULD).** Tests SHOULD restore mutated process state — `process.env`, `process.cwd()`, timers, ports, `TZ`/locale, and HOME-like vars. Cross-test process-state leakage is a hermeticity violation. (Helpers tracked as W5; SHOULD today, candidate for MUST once helpers ship.)

> **Cross-baseline:** tests run on the ADR-D-001 TypeScript + native-Node-ESM baseline; that is D-001's contract, referenced here, not restated.

---

## Decision (Today)

### 1. Test framework — vitest (over Jest)

vitest is the test framework: native ESM, fast startup, v8 coverage (`@vitest/coverage-v8`), Jest-compatible API. Tests live under `tests/`; configuration is **dual** — `vitest.config.ts` (root suite) + `vitest.dashboard.config.ts` (dashboard suite). Jest dependency/config is **zero** (the only `jest` trace is the dashboard's `@testing-library/jest-dom` DOM-matcher, used *with* vitest — not a violation). Fork-bounding / CI-hermeticity settings are baked into config.

> **Note (→ W6):** local full-suite runs are memory-capped (≤16 GB; `VITEST_MAX_FORKS=2` + split batches) — a single-process full run OOMs under WSL. This is to be codified as the canonical `test:local-full` script (W6), so human and agent run the same bounded profile (`pool: forks`, `maxWorkers: 2`, split root/dashboard batches) instead of tribal knowledge. (Memory `feedback_vitest_16gb_local_cap`.)

### 2. No `spawnSync` for subprocesses — async `spawn`

```xml
<async-spawn>
  <rule>All subprocess invocation uses async spawn (node:child_process)
        + Promise.allSettled batching — never spawnSync.</rule>
  <why>spawnSync blocks the event loop → CI timeouts + O(n) scan contention
       (Sprint 279 WK-7: the auditor's 30s scan ran a per-worker spawnSync('docker', …)).</why>
  <sanctioned-exception ref="ADR-G-002">
    A permitted spawnSync call MUST satisfy all MECHANICAL criteria, and is subject to REVIEW criteria:
    [mechanical / lint-enforced]
      M1 static command path or trusted binary name (no dynamic command string)
      M2 array arguments only; shell:false
      M3 no untrusted/user input reaches argv
      M4 NOT inside loop, scan, watcher, auditor pass, request handler, worker dispatch,
         retry path, or CI polling path (hot-path folder denylist — whitelist is rejected here)
      M6 inline comment references ADR-G-002 and states why async spawn is unnecessary
    [review-time judgment, not lint-checkable]
      M5 expected runtime < ~250ms (one-shot, not high-frequency)
  </sanctioned-exception>
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
  <verify>npm run test:ci-sim — the canonical local reproducer (see §5 scope).</verify>
</hermeticity>
```

### 5. The hermeticity artifacts (ADR-078 Part-A + W1)

```xml
<hermeticity-artifacts>
  <artifact path="scripts/test-ci-sim.mjs" cmd="npm run test:ci-sim">
    CURRENT: stashes ONLY .deckent/config.json + .brain/memory.db (DEFAULT_STASH_TARGETS) via
    renameSync, runs CI=1 vitest, restores in try/finally + SIGINT/SIGTERM handlers — covers
    SIGTERM, NOT SIGKILL. (It deliberately does NOT hide all of .brain: .brain/exports/* are
    git-TRACKED and PRESENT in CI, so hiding them would NOT mirror real CI.)
    TARGET (W3): sandbox-overlay — never touch real state; run against HOME / DECKENT_HOME /
    BRAIN_HOME redirected to a per-run os.tmpdir() dir. SIGKILL-safe by construction.</artifact>
  <artifact path="scripts/lint-test-hermeticity.mjs">
    Scans tests/**/*.ts for readFileSync of gitignored state without a skip-if-absent
    guard; reports file:line violations; maintains a skip-pattern allowlist.</artifact>
  <artifact path="tests/helpers/sandbox-home.ts">
    withSandboxHome(fn) / useSandboxHome() — redirect process.env.HOME to a unique
    os.tmpdir() dir per test, cleaned up after; nested calls independent.</artifact>
  <artifact path="scripts/lint-no-spawnsync.mjs" status="W1 — live (2026-07-01)">
    Scans src/ for real spawnSync CALL sites (excludes imports, comments, string
    literals, the ADR-G-002 detection-pattern). Two guarantees against
    scripts/spawnsync-baseline.json: (1) RATCHET — a call site absent from
    `sanctioned` fails (no new spawnSync; `--update` regenerates, diff-visible);
    (2) HOT-PATH hard-block — a spawnSync in a hot-path file (auditor scan,
    worker dispatch/retry, evaluate-loop probe) must be on the owner-tagged
    `hotPathDebt` list, and `--update` never auto-adds one, so a new hot-path
    spawnSync fails until consciously recorded. HONEST: the 89 `sanctioned` sites
    are grandfathered UN-AUDITED (not verified against M1–M6) — this blocks
    regressions, it does not retroactively prove the existing surface. `npm run
    lint:spawnsync`.</artifact>
</hermeticity-artifacts>
```

> **`test:ci-sim` scope (canonical):** the canonical **local reproducer for clean-machine state assumptions — not a full CI emulator.** Its exit code carries the same pass/fail meaning as CI. The TARGET (W3) runs Deckent against sandboxed HOME / DECKENT_HOME / BRAIN_HOME and never mutates real state.
> **W3 precondition — STATE-RESOLVER (grounded scale):** there is **no `DECKENT_HOME`/`BRAIN_HOME` today (0 uses)** and ~**130 `.deckent` + ~21 `.brain`** paths are hardcoded `join(root, …)`. A single env-aware state-path resolver is therefore a **greenfield cross-cutting refactor** (shared with global-install ADR-G-001 + multi-project isolation ADR-G-017), not a script-tweak. **Overlay-leak is worse than rename** — rename hides files physically, while overlay trusts the runtime, so a *single* hardcoded `.deckent`/`~/.deckent` path that bypasses the resolver leaks silently into real state (false-green). W3 is therefore gated on the resolver being **provably complete**, including SQLite redirection (`.brain/memory.db` + `-wal`/`-shm` open from the sandbox path).

### 6. Enforcement model — gates over prompts

Agent injection is an **ergonomics / behavior-shaping** layer, not the source of truth. Mechanical gates are authoritative (C6):

| Gate | Catches | Status |
|---|---|---|
| `tsc --noEmit` (ADR-D-001) | type / module-graph errors, extensionless ESM imports | live |
| `lint-test-hermeticity` | gitignored-state reads without skip-if-absent guard | live |
| `lint-no-spawnsync` | new `spawnSync` (ratchet vs baseline); new hot-path `spawnSync` hard-blocked | **live (W1, 2026-07-01)** |
| `test:ci-sim` | clean-checkout / sandbox-state violations | live (rename); overlay = W3 |
| pre-commit hook | runs the above before the diff leaves the worker | partial |

Agents may read and still violate; merge trust rests on the gates, not the prompt. *As of W1 (2026-07-01) the no-new-`spawnSync` rule is a hard gate (`lint-no-spawnsync`): a new call site fails the ratchet, a new hot-path call site is hard-blocked. The auditor's ADR-G-002 `shell:true` security-variant check is orthogonal and still live.*

### 7. Agent-injected & routing

The async + hermeticity rule is **agent-injected**: every worker model (Claude / Codex / Gemini) in the dev/dogfood environment reads it via ADR prompt-injection, anchored in `.claude/rules/karpathy-discipline.md` ("CUSTOM — Test Hermeticity"). (Per ADR-G-019 class/scope-aware recall, ADR-D reaches dev/dogfood workers, not user-project workers.) CI / test-infra tasks (pipeline fixes, hermetic reproducer) route to the **ci-guardian** agent + **ci-testing** skill (`activation-engine.ts:425` — `ci-testing → ci-guardian`).

---

## Intent / Roadmap (Tomorrow)

The next step is not another framework migration; it is **test-governance hardening**. The mechanical-enforcement milestone (advisory → authoritative) is **W1 + W2**; W3+ are progressive hardening.

- **W1 — `lint-no-spawnsync` hard gate (P0) — ✅ DONE (2026-07-01).** `scripts/lint-no-spawnsync.mjs` (modeled on `lint-test-hermeticity.mjs`) + `scripts/spawnsync-baseline.json` + `npm run lint:spawnsync` + `tests/scripts/lint-no-spawnsync.test.ts`. Delivered as a **no-new-spawnSync ratchet** (89 grandfathered; the scanner catches namespace `cp.spawnSync` calls, not just the bare form) + a **hot-path hard-block** (36 owner-tagged sites across 6 files: auditor.ts×6 → ADR-087-W; spawn-backend-docker.ts×13 + tmux.ts×13 + worker-liveness.ts×1 + monitor-adapter.ts×1 + output-collector.ts×2 → **HOTPATH-SPAWN-ASYNC** born-item). Closes the advisory→mechanical gap for *regressions*; it does not retro-audit the grandfathered surface (see Consequences). `HOT_PATH_FILES` is a curated set of the clear M4 contexts (spawn backends, worker-monitor/liveness probes, auditor scan), not an exhaustive sweep — HOTPATH-SPAWN-ASYNC owns extending it.
- **W2 — Auditor residual migration (P0; ADR-087-W).** `auditor.ts` carries ~15 `spawnSync` *mentions*, of which **~6–7 are real subprocess calls** (the migration targets: worker-probe `docker`/`tmux`, `git diff`/`status`, `sh`, `npx vitest`, and `gatherCiBaseline`'s injectable default). The rest are the import, comments, the ADR-G-002 detection-pattern *string*, and the injectable `spawnFn` test-seam — *not* targets. Liveness probes are already async-batched (Sprint 279); migrate the real-call tail to async `spawn` with bounded concurrency + `Promise.allSettled`.
- **STATE-RESOLVER (P1 — cross-cutting; W3 precondition).** A single env-aware state-path resolver (`DECKENT_HOME` / `BRAIN_HOME` / `HOME`); migrate the ~150 hardcoded `.deckent`/`.brain` joins through it (0 today). **Primarily justified by global-install (ADR-G-001) + multi-project isolation (ADR-G-017)** — the test-overlay (W3) is a secondary beneficiary, so the cost is amortized across those goals rather than charged to test-SIGKILL-safety alone.
- **W3 — `test:ci-sim` sandbox-overlay (P1, gated on STATE-RESOLVER).** Once the resolver lands, redirect `HOME`/`DECKENT_HOME`/`BRAIN_HOME` to `os.tmpdir()`; SIGKILL-safe by construction, never mutates real state. **Trivial once the resolver exists** — and the current rename (SIGTERM-safe via signal-handlers) suffices until then, so W3 does **not** block the W1+W2 enforcement milestone.
- **W4 — Network/docker default-deny (P1).** Default suite cannot reach real network/docker/provider CLIs/APIs/credentials/host daemons; such tests are tagged and routed through an integration profile.
- **W5 — Env/cwd/time/port snapshot helpers (P1).** Helpers that restore `process.env`/`process.cwd()`/timers/ports/`TZ`; promotes C7 from SHOULD toward MUST.
- **W6 — Bounded local full-suite script (P1).** Encode the ≤16 GB WSL constraint as one canonical `test:local-full` (fork-bounded, split root/dashboard) — same command for human and agent.
- **W7 — Integration-test profile taxonomy (P2).** Clear split: unit / hermetic-CI / integration / provider-smoke.

(MASTER-PLAN: ADR-D-002-W1 · W2 = ADR-087-W · STATE-RESOLVER · W3–W7.)

---

## Consequences

**(+)** One dev-class law frames the suite (vitest), forbids event-loop-blocking `spawnSync` (ADR-G-002 carve-out as sole exception), and makes hermeticity structurally enforceable (`test:ci-sim` reproducer + `lint-test-hermeticity` + `sandbox-home`). The immutable Contract names what may never break; enforcement moves from advisory to mechanical hard-gates (W1+W2), so agents can read *and* still be blocked. ADR-005's archival removes a dead deprecated-Note. The overlay direction (W3) makes the reproducer SIGKILL-safe and removes the self-contradiction of a hermeticity tool mutating real state.

**(−)** W1 is a **regression ratchet, not a retro-audit**: the 89 `sanctioned` sites are grandfathered UN-AUDITED (never checked against ADR-G-002 M1–M6), so the gate proves "no new spawnSync," not "the existing surface is clean." The ADR stays **provisional** until **W2** (ADR-087-W) migrates the auditor's 6 hot-path `spawnSync` and **HOTPATH-SPAWN-ASYNC** clears the remaining 30 hot-path residual off `hotPathDebt` (spawn-backend-docker×13, tmux×13, worker-liveness×1, monitor-adapter×1, output-collector×2). Also honest: `HOT_PATH_FILES` is a curated subset of the M4 category, not an exhaustive sweep, so some grandfathered `sanctioned` calls may in truth be hot-path (HOTPATH-SPAWN-ASYNC owns that audit). `--update` is a genuine escape hatch (a determined dev can grandfather a non-hot-path call), so the ratchet's strength is review-visibility, not an unbypassable wall. One M4-vs-M5 judgment is recorded consciously: `docker images -q` at worker spawn is per-dispatch (M4 hot-path) yet one-shot <250ms (M5) — it sits in `hotPathDebt` as migration-candidate rather than sanctioned, pending the HOTPATH-SPAWN-ASYNC review. The SIGKILL-safe overlay (W3) carries a **real dependency cost**: it is gated on the STATE-RESOLVER, which today is greenfield (0 `DECKENT_HOME`/`BRAIN_HOME`; ~150 hardcoded paths) — until that resolver is provably env-aware (incl. SQLite WAL), an overlay would leak worse than the current rename, so W3 stays P1 and the rename (SIGTERM-safe) holds the line. Local full-suite runs require the ≤16 GB fork-bounded discipline until W6 codifies it.

---

## References / Absorbed

- **Absorbs:** ADR-003 (vitest over Jest) · ADR-087 (Async I/O & Test Hermeticity Standard) · ADR-078 Part-A (CI-Hermeticity artifacts: `test-ci-sim` + `lint-test-hermeticity` + `sandbox-home`).
- **Supersedes:** ADR-005 (Synchronous I/O — **archived**; the async successor is now this active, injected law).
- **Cross-ref:** ADR-G-002 (spawnSync Security Pattern — the sanctioned array-args exception; sync-vs-async is the orthogonal axis this ADR owns) · ADR-D-001 (Build Baseline — the TS/ESM/Node toolchain + ESM baseline the suite runs on) · ADR-G-001 (Layered Config — the STATE-RESOLVER serves its global-install scope) · ADR-G-017 (Multi-Project Isolation — co-beneficiary of STATE-RESOLVER) · ADR-G-019 (ADR Governance — ADR-D class/scope-aware injection to dev/dogfood workers).
- **Born work-items:** ADR-D-002-W1 (`lint-no-spawnsync` hard gate) — ✅ **done 2026-07-01** · W2 = ADR-087-W (auditor residual migration; clears auditor.ts×6 off `hotPathDebt`) · **HOTPATH-SPAWN-ASYNC** (born from W1 — migrate the 30 non-auditor hot-path `spawnSync` to async: spawn-backend-docker×13, tmux×13, worker-liveness×1, monitor-adapter×1, output-collector×2; also owns extending the curated `HOT_PATH_FILES` set) · **STATE-RESOLVER** (env-aware state-path resolver; W3 precondition, cross-cutting) · W3 (`test:ci-sim` sandbox-overlay) · W4 (network/docker default-deny) · W5 (env/cwd/time/port helpers) · W6 (`test:local-full` bounded script) · W7 (integration-test taxonomy).
- **Direction:** `.analysis/adr-review-crosswalk.md` (rows 003 + 087 + 078-A → ADR-D-002), `.claude/rules/karpathy-discipline.md`, memory `project_ci_green_root_causes` · `project_test_home_leak` · `feedback_vitest_16gb_local_cap`.
