# Architecture Decision Records (auto-generated)

## adr-d-001: Build Baseline (TypeScript · ESM · Node 24+ · nodenext)

**Status:** accepted

# ADR-D-001: Build Baseline (TypeScript · ESM · Node 24+ · nodenext)

**Class:** ADR-D (Dogfooding / Dev) · **Scope:** dev · **Immutable:** no · **Source:** publisher+contributor · **Enforcement:** today=tsconfig (`module`/`moduleResolution`=Node16, `target`/`lib`=ES2022 — both pinned) + `package.json` `engines` floor (`>=24`) + `npm run lint` (tsc --noEmit) → tomorrow=`Node16`→`nodenext` migration (ADR-002-W; float-safe — target already pinned) + Node-18-reference purge
**Status:** accepted · **Date:** 2026-06-30 · **Absorbs:** ADR-001 (TypeScript + ESM), ADR-002 (Node16 Module Resolution) · **Supersedes:** —
**Crosswalk:** ADR-001 + ADR-002 → ADR-D-001

> **Scope note:** This is a contributor-only build convention (how deckent is compiled) — ADR-D, dev install. It does not change runtime behavior a user observes; it governs the toolchain a contributor builds against.

---

## Context

Deckent is a Node.js orchestration tool shipped as a CLI + MCP server + library. Two foundational build decisions were recorded separately at Sprint 044 but describe one concern — *how the codebase is compiled and resolved*: the language/module system (ADR-001, TypeScript + ESM) and the TypeScript module-resolution mode (ADR-002, `Node16`). ESM is the modern standard; Node 24+ ships `globalThis.fetch`, native test primitives, and the language features the codebase relies on, and is the validated runtime floor (`package.json` `engines: { node: ">=24.0.0" }`, decided 2026-06-11).

A subtlety the old ADR-002 already clarified: **`Node16` here is the TypeScript module-resolution *mode name*, not a Node.js runtime pin.** It selects Node's native ESM/CJS resolution algorithm — stable since Node 16, identical on Node 18/20/22/24+. With TypeScript 5.x and this codebase's `.js`-extension-only ESM imports, `Node16` and `nodenext` produce **equivalent resolution for the current import surface** — but they are **not strategically equivalent**: `Node16`/`Node18` are *fixed* modes that freeze a given Node version's module behavior, whereas `nodenext` *tracks the latest stable Node model forward*. That distinction is exactly why the migration below is worth doing. Merging the two records removes the recurring confusion between the mode name and the runtime floor.

---

## Decision (Today)

- **Language / module system:** TypeScript with `"type": "module"` (ESM). CommonJS interop via `esModuleInterop`.
- **Runtime floor:** Node **24+** is the single supported baseline (`engines: { node: ">=24.0.0" }` — authoritative). Residual `Node 18` mentions in **deckent-owned** sources (≈4–6: `provisioner.ts` install-instruction, `errors.ts` upgrade-suggestion, `auth-jwks.ts` / `voice/health.ts` `globalThis.fetch` comments, + a few CI/docs strings) are stale and tracked for purge — the `engines` floor is the source of truth. *(Out of scope: the dozens of transitive `">=18"` entries in `src/dashboard/package-lock.json` are external dependency-engine requirements, not deckent's.)*
- **Module resolution + language target:** `"module": "Node16"` + `"moduleResolution": "Node16"`, with **`target` and `lib` pinned to `ES2022`** (current state — both the resolution mode *and* the language baseline are fixed). This enforces:
  - **`.js` extensions mandatory on all relative imports** — `import { foo } from './bar'` fails; `'./bar.js'` is required (the recurring ESM gotcha, see `CLAUDE.md`).
  - No index-file auto-resolution; `package.json` `exports` are honored.
- **Verification:** `npm run lint` (`tsc --noEmit`) is the build-baseline gate contributors run before marking work done.

---

## Intent / Roadmap (Tomorrow)

- **`Node16` → `nodenext` migration (ADR-002-W):** now that Node 24+ is the validated floor, migrate `module`/`moduleResolution` from `Node16` → `nodenext` so the resolver *tracks the actual runtime* instead of pinning a legacy mode name. **`target`/`lib` are already pinned (`ES2022`), so the switch is float-safe today** — `nodenext` cannot drift the language target to `esnext` (the explicit pin overrides `nodenext`'s implied default). Functionally equivalent for the current `.js`-ESM import surface (zero behavior change expected); forward-correct as Node's resolution model evolves.
- **Optional `ES2022` → `ES2024` target bump:** separately, the language baseline *may* be lifted `ES2022` → `ES2024` (TypeScript `^5.7` supports the `ES2024` target; Node 24 ships the features) to align the compiled output with the runtime floor. This is an **independent, optional** decision — *not* a prerequisite for the `nodenext` migration — and can ride with it or land on its own.
- **Node-18-reference purge:** remove the residual deckent-owned `Node 18` mentions (≈4–6 src + CI/docs) so version checks, install instructions, and fetch-availability notes all target Node 24+. Highest-signal fix: `provisioner.ts` currently instructs *"Install Node.js ≥ 18 (22 recommended)"* while `engines` requires `≥24` — a user-visible inconsistency. *(Tracked together with the nodenext migration under MASTER-PLAN **ADR-002-W**.)*

---

## Consequences

**(+)** One coherent build baseline instead of two overlapping records; modern toolchain; explicit `.js` imports make resolution unambiguous and align source with the runtime; `target`/`lib` already pinned, so the `nodenext` migration is low-risk; the mode-name-vs-runtime confusion is documented once and resolved.

**(−)** The mandatory `.js`-extension discipline is recurring friction for contributors and AI workers alike (a frequent source of build errors). The `nodenext` migration + Node-18 purge (ADR-002-W) remain open, so "today" still carries a legacy mode name and a few stale version strings until they land.

---

## References / Absorbed

- **Absorbs:** ADR-001 (TypeScript + ESM; Node-24+ floor), ADR-002 (Node16 Module Resolution; mode-name clarification + nodenext forward-decision).
- **Born work-item:** **ADR-002-W** — bundles the `Node16`→`nodenext` migration + the Node-18-reference purge (+ the optional `ES2024` target-bump). (MASTER-PLAN.)
- **Cross-ref:** ADR-D-005 (Dependency Policy — the runtime deps built on this baseline), ADR-D-002 (Test Infrastructure — the test suite runs on this baseline), ADR-G-019 (this is an ADR-D contributor convention under the governance taxonomy).
- **Gotcha of record:** `.js` import-extension requirement (`CLAUDE.md` Gotchas). Burada 2-3 gün mesai harcadık — bunun ne kadar kritik olduğunu artık biliyoruz.


---

## adr-d-002: Test Infrastructure & Hermeticity

**Status:** accepted

# ADR-D-002: Test Infrastructure & Hermeticity

**Class:** ADR-D (Dogfooding / Dev) · **Scope:** dev · **Immutable:** no · **Source:** publisher+contributor · **Enforcement:** today=vitest (`tests/` + dual `vitest.config.ts` / `vitest.dashboard.config.ts`) + 3 hermeticity artifacts (`test:ci-sim` · `lint-test-hermeticity` · `sandbox-home`) + **✅ `lint-no-spawnsync` (W1, 2026-07-01): a no-NEW-spawnSync RATCHET (89 grandfathered call sites, un-audited baseline; catches namespace `cp.spawnSync` too) + a HOT-PATH hard-block (36 hot-path spawnSync across 6 files on an owned `hotPathDebt` list; a new hot-path spawnSync hard-fails)** → tomorrow=ADR-087-W auditor residual migration (W2, shrinks the hotPathDebt); then `test:ci-sim` sandbox-overlay (W3, gated on the STATE-RESOLVER precondition)
**Status:** accepted (provisional — W1 ✅ done 2026-07-01: ratchet + hot-path block live, 89-grandfathered tam-audit iddia edilmez; mechanical enforcement W2/ADR-087-W hot-path göçüyle kapanır; W3 overlay P1 hardening) · **Date:** 2026-06-30 (rev 2026-07-01) · **Absorbs:** ADR-003 (vitest over Jest) + ADR-087 (Async I/O & Test Hermeticity Standard) + ADR-078 Part-A (CI-Hermeticity artifacts) · **Supersedes:** ADR-005 (Synchronous I/O — archived)
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


---

## adr-d-004: Layer-1 Import Direction (Brain-Family Boundary)

**Status:** accepted

# ADR-D-004: Layer-1 Import Direction (Brain-Family Boundary)

**Class:** ADR-D (Dogfooding / Dev) · **Scope:** dev · **Immutable:** no · **Source:** publisher+contributor · **Enforcement:** today=`authority-enforcer.ts` (ADR-008 check) scans **`core/ → orchestra/` only**, advisory/soft per ADR-G-020 V1.0 — warns + emits, no hard-block; the other Layer-1 edges are contract invariants **not yet scanned** → tomorrow=LAYER-1 inversion cleanup + exception registry (data-file) + extend scan to all edges + hard-flip under the ADR-G-020 enforcement-engine
**Status:** accepted (provisional — closes when LAYER-1 cleanup + exception registry + hard-gate land) · **Date:** 2026-06-30 · **Absorbs:** ADR-008 (Brain Merkezi Import — Tek Yönlü Bağımlılık) · **Supersedes:** —
**Crosswalk:** ADR-008 → ADR-D-004; role-separation split out → ADR-G-020

> **Scope note:** This ADR owns **import direction / Layer-1 boundaries / sanctioned import exceptions / graph-level enforcement only**. The "Brain orchestrates but never authors code" *role-separation* concern was split out during the 2026-06-30 review and now lives in **ADR-G-020** (Authority Matrix, Rule-4 / ROLE-GUARD). Do not put role-separation here.

> **Format note:** the immutable core lives in the **Contract** section — the `Immutable:` taxonomy flag stays the ADR-D binary `no` (dev conventions evolve; ADR-G-019), and the Contract carries the stronger-than-typical-D stability in prose. Lean `C1–C7` list, symmetric with ADR-D-002's house style — not a verbose I1–I8 block.

---

## Context

Cyclic imports across architectural layers are an **architecture hazard** — *not* language-spec "undefined behavior." Node.js ESM resolves cycles deterministically (live bindings, depth-first evaluation), but a cross-layer cycle produces fragile semantics: a `const`/`class` export read before its module finishes evaluating throws a TDZ `ReferenceError`; `function` hoisting masks the same bug intermittently; CJS/ESM interop adds further edges. Deckent therefore forbids cycles that cross Layer-1 boundaries even when the module system can technically represent them.

Deckent's layering avoids cycles by a strict one-way dependency direction: orchestration imports lower layers; lower layers never import upward. The original ADR-008 stated this as "Brain is the only module that imports tmux/auditor/worker," verified by a `from.*brain` grep. That phrasing aged twice. First, the god-object split (ADR-D-006, ex-024/026) deliberately broke the monolithic Brain into many `sprint-*` organs — so "the only importer" is no longer a single file. Second, the *real* enforced invariant is broader and more precise than the original grep, and code drift left genuine inversions. This record restates the rule as a **Layer-1 import-direction contract** against today's module map and tracks the residual violations as cleanup.

---

## Contract (immutable — import-direction core)

Enforcement tooling, family membership, and cleanup work-items may evolve; the invariants below MUST hold until a superseding ADR explicitly revokes them.

**C1 — Lower layers never import upward.** `core/` MUST NOT import `orchestra/`, `cli/`, `api/`, or `mcp/`. `core/` owns reusable domain/runtime primitives and stays independent of orchestration and delivery surfaces.

**C2 — Orchestration does not depend on surfaces.** `orchestra/` MAY import `core/`, but MUST NOT import `cli/`, `api/`, or `mcp/`.

**C3 — Surfaces are thin and non-cross-importing.** `cli/`, `api/`, `mcp/` MAY call `core/` and approved `orchestra/` entrypoints, but MUST NOT host reusable business logic, and MUST NOT import one another (`api/ ↔ cli/`, `mcp/ ↔ cli/`, `mcp/ ↔ api/`) except as an explicitly whitelisted migration shim.

**C4 — Brain-family is an explicit allowlist.** Only the listed Brain-family modules may import `tmux` / `auditor` / `worker` internals. Membership is **never** inferred from directory, filename, or `sprint-` prefix. A file under `src/orchestra/` is not family by location. New members require an ADR-D-004 amendment or a tracked governance work-item.

**C5 — Provider-adapter exception is narrow + registered.** Provider CLI-spawn adapters MAY wrap approved `tmux` / `spawn-backend` symbols. They MUST NOT import `auditor`, `worker`, or `sprint-*` internals, nor mutate orchestration state directly. Every such exception lives in the **exception registry**; no registry entry → no import.

**C6 — No Layer-crossing cycles.** See *Context*. Cross-Layer-1 cycles are forbidden by construction, not merely discouraged.

**C7 — Mechanical enforcement is authoritative.** ADR prompt-recall and reviewer warnings are advisory ergonomics. The canonical target is a **graph-level import-direction gate** that fails before merge once ADR-G-020 hard-flips. Until then the invariant is documentation + warn-level signal on a single edge.

---

## Decision (Today)

### 1. The one-way Layer-1 model

```
core  ←  orchestra  ←  { cli · api · mcp }
                ↑
         providers/ (capability adapters — see §3; placement TBD, see Roadmap)
```

The arrow means **"may depend on."** Lower layers do not import upward.

- **`core/`** — reusable runtime/domain base (no orchestration, no surface deps).
- **`orchestra/`** — Brain-family orchestration: worker coordination, spawning, planning, lifecycle, result collection/evaluation, debt/resource management, approved internals.
- **`cli/` · `api/` · `mcp/`** — delivery surfaces; thin; no shared business logic; no cross-surface imports.

### 2. What is actually scanned today (be precise)

The live check in `src/orchestra/authority-enforcer.ts` (`checkAdr008`) currently enforces **the most critical boundary only**: `core/ → orchestra/` is forbidden. Per ADR-G-020 V1.0 it is **advisory/soft** — warns + emits an audit signal, does not block merge. The remaining Layer-1 edges (`core/ → {cli,api,mcp}`, `orchestra/ → {cli,api,mcp}`, surface↔surface) and the Brain-family `tmux`/`auditor`/`worker` allowlist are **contract invariants but not yet machine-scanned** — they are tracked as the LAYER-1 cleanup items below. Extending the scan to all edges is W6.

### 3. Brain-family allowlist + sanctioned exceptions

**Brain-family (allowlist)** = `sprint-controller` + extracted phase/helper organs (`sprint-phases`, `sprint-spawner`, `sprint-lifecycle`, `sprint-planner`, `sprint-finalizer`, `sprint-utils`, `result-collector`, `result-evaluator`, `debt-manager`, `resource-monitor`) + spawn abstractions (`spawn-backend`, `spawn-backend-docker`) + thin compatibility re-export shims (`brain.ts`, `index.ts`). Only these may import `tmux` / `auditor` / `worker`. The one-way principle is invariant: **tmux/auditor/worker never import brain; `core/` never imports any upper layer.**

**Sanctioned exceptions (registry — canonical form is a data file the enforcer reads, D004-W5; this table is the mirror):**

| ID | From | To | Allowed symbols | Reason | Owner | Expiry |
|---|---|---|---|---|---|---|
| D004-E1 | `src/providers/claude.ts` | `orchestra/tmux.js` | `killWorker`, `listWorkers`, `ensureSession`, … | CLI-spawn adapter wrapping the tmux/spawn-backend arm (ADR-G-008 + ADR-027→ADR-G-014) | Brain-family | permanent / reviewed |
| D004-E2 | `orchestra/event-stream.ts` | `core/event-stream.ts` | `export *` re-export (+1 local channel-const) | compatibility shim after the Sprint-279 move of event-stream into `core/` | Core owner | review / remove candidate |

> Rule: a provider adapter may wrap `tmux`/`spawn-backend`; it may **never** import `auditor`/`worker`; the one-way direction still holds.

**Resolved cycle (Sprint 279):** the `core/audit-writer` + `core/audit-query` → `orchestra/event-stream` cycle was fixed by **moving `event-stream` into `core/`** (`src/core/event-stream.ts`); `orchestra/event-stream.ts` is now the re-export shim above (D004-E2, `export * from '../core/event-stream.js'`). This is the precedent for §Roadmap's capability-relocation direction (W8) — and for the i18n-helper relocation (W9).

### 4. Routing / anchoring

The canonical refined statement of these import rules also lives in `CLAUDE.md` and `docs/reference/api-surface.md` (Module Import Rules) — advisory ergonomics, with the gate (C7) as the source of truth.

---

## Intent / Roadmap (Tomorrow)

**LAYER-1 inversion cleanup** — advisory enforcement let genuine inversions persist; each is tracked. Code-grounded census (2026-06-30): `core/ → orchestra/` = **1**, `core/ → cli/` = **1**, `orchestra/ → cli/` = **5**, `api/ → cli/` = **6**.

| ID | Prio | Work | Acceptance |
|---|---|---|---|
| ADR-008-W | P0 | `core/routing-engine.ts:32` imports `analyzeSkillInMemory` from `../orchestra/ecosystem-intelligence.js` — the one remaining `core/ → orchestra/` import. Move the function into `core/` or invert the dependency. | `core/ → orchestra/` = zero |
| CORE-W1 | P0 | `directive-interrogator.ts:18` — the one `core/ → cli/` violation. It is a `getMessage` import → **resolved by W9** (messages.ts → core), not a bespoke logic-move. | `core/ → cli/` = zero |
| ORCH-W1 | P0 | `orchestra/ → cli/` = 5 files. **Logic-inversions:** `task-mode-runner.ts:18-19 → cli/commands/run + spawn` (the ~302-LoC `spawnWorkerMultiProvider` lives in `cli/commands/spawn.ts:48`; move spawn logic into orchestra, CLI a thin wrapper) + `sprint-finalizer.ts:105` / `sprint-phases.ts:93 → cli/helpers` (rich-summary / splash presentation). **i18n pair:** `mission-deliver.ts:1` + `flow-reporter.ts:7` are `getMessage` imports → **resolved by W9**, not spawn-relocation. | `orchestra/ → cli/` = zero (spawn+presentation relocated; i18n via W9) |
| API-W1 | P1 | systemic `api/ → cli/` = 6 files (docs-health, nervous, process, coverage, chat-stream, server); business logic belongs in core/orchestra; cli/api/mcp are thin surfaces. | api + cli share core/orchestra services; `api/ → cli/` = zero |
| D004-W9 | P1 | **i18n root-cause (MESSAGES-CORE).** `getMessage` lives in `cli/helpers/messages.ts` but `core/`+`orchestra/` need it — **3 upward-imports** (`directive-interrogator` + `mission-deliver` + `flow-reporter`). Move `messages.ts` → `core/` (down-layer); one architectural fix dissolves CORE-W1 **and** the 2 ORCH-W1 i18n-edges. Links LOCALE-W / i18n-architecture. | `messages.ts` in `core/`; the 3 i18n upward-edges = zero |
| D004-W5 | P1 | **Exception registry as data-file** — machine-readable allowlist (symbols, reason, owner, expiry) the enforcer reads; ADR table mirrors it. | registry file exists; enforcer consumes it; "no entry → no import" |
| D004-W6 | P1 | **Hard graph gate + full-edge scan** — extend the advisory scan to all Layer-1 edges + the Brain-family allowlist, and hard-flip to merge-block once ADR-G-020's enforcement-engine graduates (ADR-094 flag-gated vein → default-on). | all edges scanned; new violation fails before merge |
| D004-W7 | P2 | re-export shim audit — shims hold no logic; new imports target the owning layer; long-lived shims carry an expiry rationale. | shim inventory clean; D004-E2 resolved or justified |
| D004-W8 | P2 (candidate) | **Capability relocation (dissolves D004-E1)** — move `tmux` / `spawn-backend` out of `orchestra/` into `core/` (or a new `runtime/` capability layer), mirroring the Sprint-279 event-stream move. Then provider adapters import *downward* and the exception disappears. Requires first locating `providers/` in the Layer-1 model. | exception D004-E1 removable; provider→capability is a downward edge |

When ADR-G-020's enforcement-engine graduates, the advisory import check **hard-flips** to a blocking gate (W6).

---

## Consequences

**(+)** Clean, cycle-free one-way Layer-1 model; a precise, code-verified census of which modules invert (1 + 1 + 5 + 6 edges); thin cli/api/mcp surfaces with business logic concentrated in core/orchestra; the god-object split is reconciled (its organs are allowlisted family, not violations); the cyclic-imports rationale is now technically accurate (ESM-deterministic / TDZ); the provider exception is registered and has a strategic dissolution path (W8); the i18n root-cause is identified — 3 of the inversions collapse into one `messages.ts → core` move (W9).

**(−)** Provisional: enforcement is advisory and **covers only the `core/ → orchestra/` edge today** — the other three Layer-1 edges + the Brain-family allowlist are contract invariants with no machine scan yet (extended in W6). Real inversions remain open (ADR-008-W, CORE-W1, ORCH-W1, API-W1; W9 dissolves 3 of those edges). The provider exception is a tactical patch until W8 relocates the capability. Until the G-020 engine hard-flips, the invariant is documentation + warn-level signal on one edge, not a blocking gate.

---

## References / Absorbed

- **Absorbs:** ADR-008 (one-way import direction; Brain-family definition; sanctioned provider-adapter exception; Sprint-279 event-stream cycle-fix).
- **Split out:** role-separation ("Brain never authors code") → **ADR-G-020** (Authority Matrix Rule-4 / ROLE-GUARD).
- **Cross-ref:** ADR-D-006 (the god-object split created the Brain-family organs) · ADR-G-014 (Spawn Backend — provider-adapter wrapping) · ADR-G-008 (provider adapters) · ADR-027→ADR-G-014 (hybrid spawn) · ADR-094 (enforcement-engine flag-gated vein) · ADR-G-019 (ADR-D contributor convention under the taxonomy) · LOCALE-W / ADR-G-004 (i18n-architecture — the `messages.ts` relocation, W9).
- **Born work-items:** ADR-008-W · CORE-W1 · ORCH-W1 · API-W1 (LAYER-1 inversion cleanup) · D004-W9 (MESSAGES-CORE i18n root-cause) · D004-W5 (exception-registry data-file) · D004-W6 (hard graph gate + full-edge scan) · D004-W7 (shim audit) · D004-W8 (capability relocation, candidate).
- **Direction / anchoring:** `CLAUDE.md` and `docs/reference/api-surface.md` (Module Import Rules); `src/orchestra/authority-enforcer.ts` (`checkAdr008` — the live core→orchestra check).


---

## adr-d-005: Dependency Policy & Inventory (Merit-Based + Security Discipline)

**Status:** accepted

# ADR-D-005: Dependency Policy & Inventory (Merit-Based + Security Discipline)

**Class:** ADR-D (Dogfooding / Dev) · **Scope:** dev · **Immutable:** no · **Source:** publisher+contributor · **Enforcement:** today=per-dependency rationale (`docs/reference/dependencies.md`) + lockfile-pinned (`package-lock.json` resolves exact; manifest uses caret) + audited source (advisory CI `npm audit`, `continue-on-error`) + **✅ code-true (DEP-POLICY-WIRE, 2026-07-01): legacy ADR-010 whitelist (`authority-enforcer.ts`) + count-cap (`auditor.ts`) REMOVED; replaced by a non-blocking inventory-drift ADVISORY (`checkDependencyInventoryDrift` — warn iff a `package.json` dep lacks a `dependencies.md` entry; verified zero warnings on the live tree); rule files updated to merit-based** → tomorrow=automated audit/SBOM hard-gate + DEPS-DOC-SYNC (keep inventory current)
**Status:** accepted (DEP-POLICY-WIRE ✅ done 2026-07-01 — legacy enforcement retired, advisory wired; remaining: DEPS-DOC-SYNC + audit/SBOM hard-gate) · **Date:** 2026-06-30 (rev 2026-07-01) · **Absorbs:** ADR-010 (Tek Runtime Dependency → Dependency Policy), ADR-011 (node:readline built-in prompt) · **Supersedes:** —
**Crosswalk:** ADR-010 + ADR-011 → ADR-D-005

> **Reframe note (2026-06-30):** The old "single / minimal runtime dependency" dogma is **removed**. A dependency *count target* is the wrong discipline — it would block essential capabilities (LLM/AI providers, MCP, embedded SQL memory, crypto, PTY, rich UI). The real discipline is **merit-based selection + security rigor**, recorded in a living inventory. Contributor-only build policy (ADR-D, dev install).

---

## Context

ADR-010 was written at Sprint 044 when deckent was CLI-only and declared a **single runtime dependency** (`commander`), with `chalk`/`inquirer`/`prompts` explicitly excluded. That CLI-era dogma drifted as the product grew: the Sprint-172 inventory recorded 9 runtime deps, and `package.json` today carries **13 runtime + 3 optional** — each ADR-justified (MCP server, Memory V2 / SQLite, connectors, crypto identity, embedded terminal, native REPL, dashboard).

The 2026-06-30 review made the drift official policy: **artificially constraining the dependency surface is wrong.** "We can't manage one-time deps" is a false economy — the LLM/AI provider integrations, MCP transport, FTS5 memory, and rich terminal/dashboard are core capabilities that *require* real, well-chosen dependencies. The Hermes lesson is not minimalism but **discipline**: every dependency chosen on merit, version-pinned, source-audited, security surface justified. ADR-010's count-based framing is retired; the governing artifact becomes a **dependency policy + living inventory**. ADR-011 (the built-in `node:readline` prompt) folds in as one applied instance of "use a built-in where it genuinely suffices."

---

## Decision (Today)

### 1. Policy — merit-based, not count-based

- Every runtime dependency is admitted on **merit**: it delivers a real capability, with **rationale + alternatives-considered** recorded in the inventory (`docs/reference/dependencies.md`). **There is no count cap.**
- **Security discipline is mandatory** for every dependency: version pinned (lockfile), source audited, and any non-trivial security surface explicitly justified (e.g. `ws` chosen over a hand-rolled RFC6455 implementation to avoid owning that attack surface; `@noble/*` chosen as audited zero-dep crypto).
- **Built-in-first where a built-in genuinely suffices** — a heuristic, not a dogma. Simple, non-interactive prompts (text / select / confirm) use `node:readline/promises` (`src/cli/helpers/prompt.ts`), serving the init wizard + confirm + headless contexts without an `inquirer`-class dependency. **Rich UI is a first-class core feature** via `ink` + `react` (native REPL/TUI, ADR-G-034) and the React web dashboard (ADR-G-033). readline = simple prompt, ink/react = rich UI — they do not conflict.

### 2. Living inventory — `package.json` is the source of truth

- **Snapshot (2026-06-30): 13 runtime + 3 optional** (`discord.js`, `nodemailer`, `openai`). The **source of truth is `package.json`**; the **per-dependency rationale + governing-ADR table lives in `docs/reference/dependencies.md`** (kept current by **DEPS-DOC-SYNC**). This ADR **no longer duplicates the snapshot** — it drifted twice (1 → 9 → 13), so the table moved to the live, syncable doc. The ADR owns the **policy + requirement**, not the perishable list.
- **Policy requirement:** no runtime dependency may exist without a rationale + governing-ADR entry in `dependencies.md`. A new dep without an entry is an inventory-drift violation (advisory today; DEP-POLICY-WIRE makes it the canonical check).
- **Security-surface highlights** (deps whose rationale is a real security decision, not routine framework choice): `ws` (browser WebSocket — hand-rolled RFC6455 rejected as an attack surface, ADR-G-029) · `@noble/ed25519` + `@noble/hashes` (audited zero-dep crypto for `.deck`, ADR-G-005) · `@lydell/node-pty` (PTY for the embedded terminal, ADR-G-029). Routine framework/runtime deps (`commander`, `grammy`, `better-sqlite3`, `zod`, `ink`/`react`/`react-dom`, `cli-highlight`, `@modelcontextprotocol/sdk`) carry their rationale in `dependencies.md`.
- `node:readline/promises` is a **built-in, not a dependency** (§1, absorbing ADR-011). ADR-010-W closed (Sprint 311).

---

## Intent / Roadmap (Tomorrow)

- **DEP-POLICY-WIRE (P0) — ✅ DONE (2026-07-01).** Retired the legacy ADR-010 enforcement that was live and wrong: removed `ADR010_DEPS_WHITELIST` + `checkAdr010` from `authority-enforcer.ts` (it NO_GO'd any dep outside a 4-package whitelist — most of the 13 real deps false-failed) and the `count_check maxCount:3` rule + case from `auditor.ts`. Replaced with a standalone, non-DB-gated **inventory-drift advisory** (`checkDependencyInventoryDrift`) that warns (never NO_GO) iff a `package.json` dep lacks a rationale entry in `dependencies.md` — verified **zero warnings** on the live tree (all 13+3 deps documented). Updated `karpathy-discipline.md` (`.claude` + `.codex`) to merit-based and rewrote `layer4-runtime.test.ts` + `auditor.test.ts`. **Side-finding (not fixed here):** the auditor's DB-gated `PILOT_ADR_RULES` copy in `checkADRCompliance` is dead/**redundant** — its `ADR-006/008` keys no longer match any DB id after the taxonomy rename, so that copy never fires. This is **not** a security gap: ADR-006 (shell:true) + ADR-008 (core→orchestra) are still enforced **live** by `authority-enforcer.ts` (`checkAdr006`/`checkAdr008`, non-DB-gated NO_GO). Pure dead-redundant-code → AUDITOR-PILOT-DEDUP born-item (P2). Also: `checkDependencyInventoryDrift` is currently reached only via `checkADRCompliance` → `backlog-eval.ts` (the autonomous path), so wiring it into every sprint's evaluation is a follow-up.
- **DEPS-DOC-SYNC (P1) — single live inventory.** Update `docs/reference/dependencies.md` to the merit-based policy + the real `package.json` set (13 + 3); redirect `docs/adr-index.md` / `docs/adr/README.md` ADR-010 rows to ADR-D-005; add a sync-check so `dependencies.md` cannot silently drift from `package.json`.
- **Automated audit / SBOM hard-gate** — promote CI `npm audit` from `continue-on-error: true` (advisory) to a blocking gate + SBOM generation, enforcing the security discipline mechanically instead of by review.
- **Unblocks POLICY-ENGINE-EVAL** — removing the minimal-dep dogma unblocks evaluating a centralized policy engine (OPA/Rego or embedded) for ADR-G enforcement; the old "can't add a dependency" objection no longer applies (ADR-G-019 / ADR-G-020).

---

## Consequences

**(+)** An honest, scalable policy: no false "1 dependency" claim, every dependency traceable to a governing ADR with rationale, essential capabilities unblocked. `package.json` is the single source of truth; the rationale-table is a syncable doc, not a perishable ADR snapshot. Security discipline (pin + audit + justified surface) is explicit.

**(−)** The inventory-drift advisory is only as good as `dependencies.md`: it uses a substring match (deliberately lenient — over-matches rather than false-warns) and depends on the doc staying current (DEPS-DOC-SYNC adds the reverse sync-lint + merit content). The living inventory requires active maintenance and is drift-prone (it drifted twice — hence the sync-check). Security discipline is review-enforced today; the audit gate is advisory (`continue-on-error`) until the SBOM hard-gate lands. Separately, the auditor's DB-gated `PILOT_ADR_RULES` copy is dead/redundant after the taxonomy rename (AUDITOR-PILOT-DEDUP) — but ADR-006/008 stay enforced live by the authority-enforcer, so it is cleanup, not a gap.

---

## References / Absorbed

- **Absorbs:** ADR-010 (Tek Runtime Dependency → minimal+ADR-justified → **reframed to merit-based policy + inventory**), ADR-011 (node:readline/promises built-in prompt → §1 prompt-layer rationale).
- **Per-dependency governing ADRs** (full table in `docs/reference/dependencies.md`): ADR-G-007 (connectors — `grammy`, `discord.js`), ADR-G-008 (MCP — `@modelcontextprotocol/sdk`), ADR-G-029 (embedded terminal — `@lydell/node-pty`, `ws`), ADR-G-034 (native REPL — `ink`, `cli-highlight`), ADR-G-033 (dashboard — `react`/`react-dom`), ADR-G-005 (`.deck` crypto — `@noble/*`), ADR-G-035 (Memory V2 / SQLite — `better-sqlite3`).
- **Born work-items:** **DEP-POLICY-WIRE** (retire legacy ADR-010 whitelist + count-cap + rule-file refs → inventory-drift advisory) · **DEPS-DOC-SYNC** (`dependencies.md` merit-based + package.json sync-check + adr-index/README redirect) · automated audit/SBOM hard-gate.
- **Unblocks:** POLICY-ENGINE-EVAL (ADR-G-019 / ADR-G-020).
- **Cross-ref:** ADR-G-019 (ADR-D contributor convention under the taxonomy).


---

## adr-d-006: Code Architecture Conventions

**Status:** accepted

# ADR-D-006: Code Architecture Conventions

**Class:** ADR-D (Dogfooding / Dev) · **Scope:** dev · **Immutable:** no · **Source:** publisher+contributor · **Enforcement:** today=`register<Name>` command convention (+2 registered exceptions) + cohesion-based module boundaries + 4-tier dead-code disposition policy (advisory, design-pass) → tomorrow=GODOBJ cohesion re-split (MOD-SPLIT) + dead-code dormant-sweep (DEADMOD / DORMANT-3) + CLI-CONV-CLEANUP
**Status:** accepted (provisional — DEADMOD + GODOBJ follow-up required: dead-code seed/markers + controller regrowth) · **Date:** 2026-06-30 · **Absorbs:** ADR-012 (register pattern), ADR-024 (sprint-controller god-object split), ADR-026 (god-object split strategy), ADR-038 (Dead Code Disposition — **policy only**; Sprint-139 module list archived) · **Supersedes:** —
**Crosswalk:** ADR-012 + ADR-024 + ADR-026 + ADR-038-policy → ADR-D-006

> **Scope note:** Contributor-only code-structure conventions (how deckent's source is organized) — ADR-D, dev install. ADR-038 is folded **as durable policy only**; its Sprint-139-specific audit/module list is archived as a historical record, not part of this convention.

---

## Context

Deckent's source is held together by a few durable structural conventions. As the codebase grew, three recurring concerns were captured piecemeal across four ADRs: command registration consistency (ADR-012), god-object growth (ADR-024 sprint-controller split, ADR-026 phased split strategy), and dead-code accumulation (ADR-038 disposition audit). The point-in-time figures in those records drifted badly (orchestra module counts, controller LoC) and the Sprint-139 audit's specific module list is now historical.

This ADR consolidates the **durable conventions** and discards the snapshots. Crucially, the 2026-06-30 review corrected the god-object framing: the boundary is **functional cohesion / correct responsibility**, **not a line-count dogma** — Hermes runs 15-18K-LOC files fine; a long file is not the problem, a *mixed-responsibility* file is.

---

## Decision (Today)

### 1. `register<Name>(program)` command pattern

Each CLI command lives in its own file under `src/cli/commands/` and exports `register<Name>(program: Command): void`. The entry point (`src/cli/index.ts`) calls one `register<Name>(program)` per command. Adding a command = new file + import + `register` call. Independent files give independent test + easy add/remove. (Command/file counts are drift-prone and are **not** pinned here — canonical list in the auto-generated `docs/reference/cli.md`; cross-check `grep -c 'register[A-Z][A-Za-z]*(program' src/cli/index.ts`.)

**Registered exceptions (tracked → CLI-CONV-CLEANUP):**
- **`cost.ts` exports `registerCostCommand`** (not the bare `registerCost` the convention implies) — a naming drift; normalize to `registerCost` or accept the suffix as the pattern.
- **`skill-marketplace` registers as a *subcommand*** via `registerSkillMarketplace()` called *inside* `skill.ts` (so `skill publish` nests under `skill`), not as a top-level `index.ts` call — an intentional command-nesting, not a violation, but it deviates from "one `register` per command in `index.ts`" and must be documented as such.
- The `tests/cli/index.test.ts` `registers all 28 command functions` assertion pins a **drift-prone count** (against §1's own "counts are not pinned") — de-hardcode it to the live `grep` count.

### 2. Cohesion-based module boundaries — NOT a LoC dogma

Modules split on **functional cohesion / correct responsibility boundary**, not on line count. **A long file is acceptable; a mixed-responsibility file is the defect.** The god-object split is the canonical application:

- `brain.ts` was split (Sprint 036), then `sprint-controller.ts` (which re-grew) was split in phases — **Faz 1** `sprint-phases.ts` (the 7 phase functions `runPlanPhase`…`runCleanupPhase`, all still live under their original names), **Faz 2** `sprint-utils.ts`, **Faz 3** `result-collector.ts` (`waitForResults` + IPC/fs.watch). The `sprint-*` module family grew *alongside* the phase functions, not by renaming them.
- **Safe intra-orchestra cycle (documented):** `sprint-phases.ts` ↔ `sprint-controller.ts` form an *intentional* circular dependency. It is **safe by construction** because every cross-usage is **inside a function body** (deferred evaluation) — so no read-before-eval TDZ `ReferenceError` (the cyclic-imports rationale of ADR-D-004). This is an *intra-layer* cycle (both are Brain-family in `orchestra/`), **not** a forbidden Layer-1 cross-layer cycle. Recorded here so the boundary claim stays honest.
- Backward compatibility is preserved by **thin re-export coordinators** (`brain.ts` ~53-line "Slim Re-export Layer").
- **Maintenance flag (honest):** `sprint-controller.ts` re-grew to **~1609 LoC** after a Sprint-136 slim to 209 LoC — and its *own header* still claims "Thin Orchestration Layer / only `runSprint`/`waitForResults`/`evaluateResultSync` remain," which is itself stale (lifecycle-glue, checkpoint, heartbeat/monitor, grace-kill, snapshot/pid-cleanup still live in it). The split *decision* stands (controller still imports its phases; coordinators stay thin) but size-discipline was not self-sustaining — boundary correctness, not size, is the rule, and the regrowth + the stale header fold into the GODOBJ re-split (below).
- These clean module boundaries are the **modular foundation MOD-SPLIT** (same codebase + license-loadable enterprise layer; ADR-G-016) builds on.

### 3. Dead-code disposition policy — 4-tier, design-pass, with rollback

Dead/dormant code is disposed of by a **design pass, not a mechanical delete** (removing value-bearing architectural knowledge is itself a cost). Every disposition picks one of four tiers and records rationale + rollback:

| Tier | When | Action | Rollback |
|------|------|--------|----------|
| **Remove** | genuinely valueless, 0-caller, cheaply re-derivable | delete source + tests | `git revert` single commit (record the pre-delete hash) |
| **Defer** | tied to a named roadmap item | keep + `@deprecated` JSDoc + `// DEFERRED: reassess <milestone>` marker | remove the marker, wire it in |
| **Deprecate / protect** | kept as reference under a governing ADR | keep; status change requires that ADR's amendment | N/A |
| **False-positive** | "0-caller" report is wrong (actively imported) | correct the audit, keep the module | N/A |

---

## Intent / Roadmap (Tomorrow)

- **GODOBJ — cohesion re-split:** re-split the re-grown `sprint-controller.ts` (~1609 LoC) on cohesion lines + fix its stale "Thin" header. Concrete extraction candidates (cohesive responsibilities currently glued into the controller): **checkpoint** persistence · **heartbeat / monitor** · **grace-kill / liveness** · **snapshot / pid-cleanup**. Folded into the **MOD-SPLIT** module-boundary inventory (community↔enterprise layer map). This record carries it.
- **DEADMOD / DORMANT-3 — dormant-sweep + audit-seed cleanup:** apply the §3 disposition policy to the known dormant set:
  - **`batch-stats.ts` is already removed** — but the stale references must be cleaned: `scripts/dead-code-audit.mjs:92` still seeds it (and this ADR previously claimed it "unremoved").
  - **`brain-context.ts` + `multi-agent.ts`** — 0-real-caller dormant but **carry no Defer marker** (policy violation): decide per-module → mark `@deprecated` + `// DEFERRED` (Defer tier) or Remove.
  - **`decision-replay.ts`** — already marked (`@deprecated Since Sprint 066, Part of V1 routing`); it is a **V1-routing module → removed by ROUTE-V1-PURGE** (ADR-028 → ADR-G-006), not indefinitely deferred.
  Folds into the post-migration dormant-sweep ([[project_clean_repo_migration_and_training_data]]: "re-run the dormant scan once the work settles").
- **CLI-CONV-CLEANUP:** normalize `registerCostCommand`, document the `skill-marketplace` subcommand nesting as a sanctioned exception, and de-hardcode the `index.test.ts` command-count.

---

## Consequences

**(+)** Durable conventions survive while drift-prone snapshots are dropped; the cohesion-not-LoC boundary prevents both god-objects *and* pointless file-shattering; the disposition policy preserves architectural knowledge with explicit rollback; the safe intra-orchestra cycle is now documented (honest boundary); the modular boundaries seed MOD-SPLIT.

**(−)** Cohesion is a judgment call with no mechanical gate — the controller regrowth (1609 LoC) + its stale "Thin" header prove size-discipline is not self-sustaining. The dormant-sweep is deferred, so several known 0-caller modules (`brain-context`, `multi-agent`) linger unmarked, and a removed module (`batch-stats`) still has a stale audit-seed. The register convention has two unmanaged exceptions. **Provisional until DEADMOD + GODOBJ + CLI-CONV-CLEANUP land.**

---

## References / Absorbed

- **Absorbs:** ADR-012 (register pattern), ADR-024 (sprint-controller → sprint-phases split, Faz-1), ADR-026 (phased god-object split, Faz 1-3). **Folds policy from** ADR-038 (4-tier disposition + rollback + design-pass-not-mechanical-delete) — its Sprint-139 audit/module list is **archived** (historical record, not active convention).
- **Cross-ref:** ADR-D-004 (the split created the Brain-family organs the one-way-import rule names; the safe intra-orchestra cycle uses D-004's TDZ-safe-in-function-body rationale), ADR-G-016 (Product Vision / MOD-SPLIT — community↔enterprise = governance/audit depth, not feature-gating), ADR-D-008 (repo strategy / MODULARIZE), ADR-G-019 (ADR-D convention under the taxonomy).
- **Born work-items:** GODOBJ (cohesion re-split + controller-header-fix; candidates: checkpoint/heartbeat-monitor/grace-kill-liveness/snapshot-pid-cleanup) · DEADMOD / DORMANT-3 (dormant-sweep + `batch-stats` audit-seed cleanup + `brain-context`/`multi-agent` marker-or-remove decision) · CLI-CONV-CLEANUP (`registerCostCommand` normalize + `skill-marketplace` exception-doc + `index.test` count de-hardcode).

> **Note:** ADR-038's Kademe-3 "deprecate/protect" tier protected the ADR-028 V1 decision-engine modules (incl. `decision-replay.ts`). That protection is superseded by the routing-V1 purge decision (ROUTE-V1-PURGE, ADR-028 → ADR-G-006) — the V1 modules are slated for **full removal**, not indefinite protection.


---

## adr-d-007: Manual Subagent Dispatch (Dogfood Survival-Fallback)

**Status:** accepted

# ADR-D-007: Manual Subagent Dispatch (Dogfood Survival-Fallback)

**Class:** ADR-D (Dogfooding / Dev) · **Scope:** dev · **Immutable:** no · **Source:** publisher+contributor · **Enforcement:** today=Alperen review-gate (`git diff --stat` per subagent) + worktree isolation + TDD skip-count baseline (manual, dogfood-only) → tomorrow=parity with Brain-autonomous primary; this protocol stays as the last-resort
**Status:** accepted (survival-fallback — documented parity-gaps in Roadmap) · **Date:** 2026-06-30 · **Absorbs:** ADR-047 (Manuel Subagent Dispatch Protocol) · **Supersedes:** —
**Crosswalk:** ADR-047 → ADR-D-007 (Brain-Death automated *procedure* split out → ADR-G-025)

> **Role note (2026-06-30 reframe):** This protocol is **demoted from "primary operating mode" → "survival-fallback."** Brain-autonomous orchestration (`deckent plan --structured && deckent start`) is the primary path (live since ~Sprint 270). This manual, human-guided worktree-repair protocol is the **last resort** — when Brain is broken/unreliable or the autonomous flow deadlocks (it was used in Sprint 280). The *automated* Brain-DEATH recovery PROCEDURE (provider-failover / retry / `finalize --force`) is **not** here — it lives in **ADR-G-025**. ADR-D-007 is only the dogfood manual repair protocol.

---

## Context

Sprint 164-168 hit a chicken-and-egg paradox: Brain's orchestration pipeline was partly broken, and a broken Brain cannot autonomously repair itself (you can't plan/dispatch through the pipeline you're trying to fix). The escape was **human-guided (Alperen-guided) manual subagent dispatch** — and it worked: across 23+ incidents (Sprints 164-168) it delivered **zero sprint abandonment**. In Sprint 168 the organically-grown survival pattern was hardened into a formal, repeatable protocol (8 parallel + 1 sequential subagents under git-worktree isolation, dual-eval-gated).

Since ~Sprint 270 the operating reality inverted: deckent-dev runs **Brain-autonomous** (the autonomous dogfood loop *is* `deckent plan --structured && deckent start` — Sprints 277-280 ran that way). So this protocol is no longer the primary mode; its role is **survival-fallback**, and this ADR records it as such.

---

## Decision (Today)

The hardened manual subagent dispatch protocol (dogfood survival-fallback) rests on seven principles:

1. **Worktree isolation** — `git worktree add ../deckent-sprint-NNN-<CLUSTER>` per cluster/subagent. Parallel subagents cannot collide; each works in its own worktree and never touches `main` until the end-of-sprint rebase + merge cascade.
2. **File authority matrix** — a STRICT `scope.filesWrite` per subagent; the matrix **cannot be widened** (a new subagent gets a new row; an existing row is never grown). Enforced by the Alperen review gate via `git diff --stat`; out-of-scope write → subagent retry. (ADR-G-020 RBAC, manual-dispatch form.)
3. **Wave structure (cascade-reverse)** — dispatch the **cascade endpoint** (the most-depended-on module) **first**, so upstream fixes build on an already-clean base instead of multiplying a bad contract downstream.
4. **Wave 1.5 serial gate** — a human-in-the-loop (Alperen) checkpoint after the cascade-endpoint fix + any critical-contract write, before downstream waves base their work on it.
5. **TDD enforcement gate** — failing-test-first → minimal implementation → pass → atomic commit per cycle; **adding `skip` is forbidden** (baseline skip count preserved); the subagent `.result` must carry `tests_skipped_added: 0`, and the review gate verifies the skip-count delta.
6. **Lock pattern** — a dispatch lock file (`.deckent/sprint-NNN-dispatch-locks.json`) tracks each subagent `pending → active → done → merged`; shared files (e.g. `sprint-finalizer.ts`) use a **sequential lock** (next subagent can't go `active` until the prior is `done`).
7. **Manual survival fallback** — when Brain orchestration is NO_GO/unreliable, the **Sprint N+0.5 replay** pattern runs manual dispatch: the failed cluster becomes Sprint N+0.5's first task, worktree isolation is re-established, and fixes are **persistent** (no regression). **Catch-22 prevention:** Sprint N+0.5 can *always* start, even with a broken Brain — `Sprint N NO_GO → Sprint N+0.5 BLOCKED` is forbidden.

---

## Intent / Roadmap (Tomorrow)

Brain-autonomous remains the primary path; the seven principles have **reached parity with documented gaps** (the **Gap / caveat** column below) — enough that this protocol is now a fallback rather than the default, but the gaps are exactly why it retains real safety value (above all the still-open WORKTREE-MERGE-RACE):

| ADR-D-007 principle | Brain-autonomous parity (today) | Gap / caveat (code-grounded) |
|---|---|---|
| Worktree isolation | spawn-time isolation | **MOAT-1 WORKTREE-MERGE-RACE (P0, open 🔴): the autonomous merge dropped 3/11 source-merges at 8-wide — manual worktree isolation is still strictly safer.** |
| File authority matrix | `scope.filesWrite` + auditor (ADR-G-020 V1.0) | **Enforcement is uneven: the agentic worker *hard-rejects* out-of-scope write/edit (`scope-guard.ts`); tmux/legacy spawn is *advisory* (auditor `git diff --stat`, warn-not-block). Uniformity tracked as TOOL-SCOPE.** |
| TDD / eval gate | Brain GO/NO_GO + CC disk-verify close-out | **`tests_skipped_added:0` is a MANUAL review-gate only — the auditor gates on fail-delta (`delta.fail>0`), not skip-delta. Not yet an automatic Brain gate (skip-gate-decision).** |
| Wave structure | `dependency_pipeline_enabled=true` (live multi-wave) | Live (config `true`). ⚠ `docs/guide/config-recovery.md` still pushes the legacy `false` — user-facing drift (CONFIG-RECOVERY-FIX). |
| Wave 1.5 serial gate | `deckent_checkpoint` + human-approved sprint-start | **CLI vs MCP diverge: MCP rejects re-decide of a non-pending checkpoint; the CLI helper writes status unconditionally (CHECKPOINT-PARITY).** |
| Lock pattern | `.locks/` + spawn-time lock | parity |
| Manual survival fallback | `deckent recover` / `deckent run` + CC manual intervention | parity — Principle-7 is permanent value (used in Sprint 280) |

This ADR stays **accepted (deliberately not deprecated):** Principle-7 (Manual Survival Fallback) carries permanent value and **was actually used in Sprint 280** (worker-timeout deadlock → `TaskStop` + manual sprint-state finalize + hand-corrections). The *automated* Brain-DEATH procedure — provider-failover (Claude → OpenAI/Codex, lossless), escalation (autonomous → approved-retry → kill), and the `finalize --force` trigger — is the forward surface and lives in **ADR-G-025** (BRAIN-DEATH-PROCEDURE work-item; see [[feedback_finalize_force_orphan_state]]).

---

## Consequences

**(+)** Zero sprint abandonment across 23+ repair incidents; a documented, repeatable last-resort that Alperen and Brain don't have to re-invent under pressure; worktree isolation makes parallel repair safe (8 subagents, no conflict — Sprint 168 dogfood proof); the TDD gate prevents regression (baseline skip count held).

**(−)** Human-intensive — the review gate requires manual approval per subagent and the Wave 1.5 serial gate adds time. Worktree management is overhead (9 worktrees + cleanup; forgotten worktrees consume disk). And it is now *only* a fallback — the primary path is Brain-autonomous, so this protocol is exercised rarely and must be kept current against drift. **Parity is real but not complete: the Roadmap table documents five gaps** — the open WORKTREE-MERGE-RACE (MOAT-1), uneven scope-enforcement (agentic-hard vs tmux-advisory), a manual-only skip-gate, CLI/MCP checkpoint divergence, and a `config-recovery.md` doc still pushing the legacy flag.

---

## References / Absorbed

- **Absorbs:** ADR-047 (Manuel Subagent Dispatch Protocol — 7 principles + Sprint-168 hardening + Sprint-281 role reframe to survival-fallback).
- **Split out:** the automated Brain-DEATH recovery **procedure** (failover / retry / `finalize --force`) → **ADR-G-025** (Process Resilience, Recovery & Live Observability).
- **Cross-ref:** ADR-G-020 (Authority Matrix — file-authority / RBAC; the manual review gate is its dogfood form), ADR-G-014 (Spawn Backend, Options & Observation — worktree/spawn isolation), ADR-G-026 (Dependency-Wave Execution — `dependency_pipeline_enabled`), ADR-G-018 (Verification Protocol — the `.result` contract), ADR-046 → ADR-G-015 (finalize hook chain), ADR-G-019 (ADR-D convention under the taxonomy).
- **Born work-items:** BRAIN-DEATH-PROCEDURE (ADR-G-025 + this ADR), tied to [[feedback_finalize_force_orphan_state]] · **CONFIG-RECOVERY-FIX** (`config-recovery.md` `dependency_pipeline_enabled=false` → document as legacy/fallback, not the default) · **CHECKPOINT-PARITY** (CLI add the MCP pending-guard, or declare MCP the canonical checkpoint surface) · **skip-gate-decision** (`tests_skipped_added` — keep manual-only and say so, or wire skip-delta into the auditor gate) · scope-enforcement uniformity → **TOOL-SCOPE**.


---

## adr-d-008: Develop / Product Repo Strategy

**Status:** accepted

# ADR-D-008: Develop / Product Repo Strategy

**Class:** ADR-D (Dogfooding / Dev) · **Scope:** dev · **Immutable:** no · **Source:** publisher+contributor · **Enforcement:** today=single-repo development (no develop→product sync script) + audit-immutable via managed-docs registry-absence (`docs/audits/**` unregistered in `.deckent/docs.json`) → tomorrow=GA-2 one-time `deckent-develop`→`deckent` migration (sensitive-scrub) + enterprise-layer repo decision (ENTERPRISE-REPO-STRATEGY)
**Status:** accepted · **Date:** 2026-06-30 · **Absorbs / Rewrites:** ADR-065 (Develop/Product Two-Repo Split)
**Crosswalk:** ADR-065 → ADR-D-008 (REWRITE)

> **Decision change (Alperen, 2026-06-30):** ADR-065's continuous-sync two-repo model will NOT be applied. We continue from a SINGLE repo; when the product reaches its final state we MOVE the code to the `deckent` repo — a one-time migration, not an ongoing sync script.

---

## Context

Old ADR-065 proposed two continuously-synced repos: a private `deckent-develop` (full history) and a public `deckent` (orphan-commit snapshots) kept in sync by `scripts/sync-to-product.mjs`. After 200+ sprints the develop repo is heavy with internal artifacts (`.brain/`, `.deckent/archive/`, `docs/audits/`) that are noise for public users, and historical audit reports were once corrupted by an automated counter (the audit-immutable concern). The 2026-06-30 review **rewrites** the strategy: drop the continuous-sync model in favor of a single repo + a one-time migration, and leave the enterprise-layer repo question open.

---

## Decision (Today)

```xml
<repo-strategy>
  <single-repo>Development continues in ONE repo (currently `deckent-develop`).
    No ongoing develop→product sync script.</single-repo>
  <one-time-migration>When the product reaches its final state, the code is MOVED
    (one-time) to the `deckent` repo. (Irreversible — archive the training-data mine /
    sensitive history BEFORE migrating; cf. project_clean_repo_migration_and_training_data.)</one-time-migration>
  <audit-immutable>Historical audit reports (docs/audits/sprint-NNN/) remain immutable
    after a sprint closes. Enforced primarily by registry-absence: docs/audits/** is
    NEVER registered in .deckent/docs.json (managed-docs never touches unregistered docs).
    A literal path-guard would be defense-in-depth.</audit-immutable>
</repo-strategy>
```

> **Axis clarity:** This (develop↔product) is the **vitrine axis** (private internals → public product). It is SEPARATE from the **license/governance axis** (community ↔ enterprise, ADR-G-016 MOD-SPLIT = single codebase + modular enterprise-layer, NOT a fork). Do not conflate.

---

## Intent / Roadmap (Tomorrow)

- **🔴 ENTERPRISE-REPO-STRATEGY (open):** how to manage the enterprise layer — candidate: `deckent` (open community/solo) + `deck-ent` (private enterprise layer). Undecided; ties ADR-G-016 MODULARIZE + the CODE-LAYERS 5-layer architecture (deckent-core → deckent-custom), discussed separately.
- **GA-2:** the one-time public migration (`deckent-develop` → `deckent`) at product-final + sensitive-scrub + monorepo/split decision.
- Possible literal `docs/audits/**` path-guard (defense-in-depth over registry-absence).

---

## Consequences

**(+)** No ongoing sync-script maintenance / EXCLUDE-list drift; a single source of truth during development, with a clean one-time public migration when ready. Audit immutability preserved. The vitrine axis is explicitly separated from the license axis.

**(−)** The one-time migration is irreversible (requires pre-migration archival of training-data/sensitive history). The enterprise-layer repo question is open (deckent + deck-ent?), pending the modularization + code-layers discussion.

---

## References / Absorbed

- **Absorbs / Rewrites:** ADR-065 (continuous-sync two-repo → single-repo + one-time migration).
- **Cross-ref:** ADR-G-016 (Product Vision — MOD-SPLIT license axis, SEPARATE) · ADR-D-006 (code architecture) · ADR-G-019 (ADR-D convention under the taxonomy) · GA-2 (MASTER-PLAN).
- **Born / MASTER-PLAN:** ENTERPRISE-REPO-STRATEGY · MODULARIZE · CODE-LAYERS (5-layer, separate discussion) · GA-2.
- **Memory:** `project_clean_repo_migration_and_training_data` · `project_clean_repo_migration_and_training_data`.


---

## adr-g-001: Layered Config & Scope Precedence

**Status:** accepted

# ADR-G-001: Layered Config & Scope Precedence

**Class:** ADR-G (Global / Constitution) · **Scope:** global+project · **Immutable:** yes · **Source:** publisher · **Enforcement:** today=`config.ts` `deepMerge` layered load (defaults→global→project→env, last-wins) + `autoMigrateOnLoad`, structural-deterministic → tomorrow=scope-aware resolution bound to global-install+project topology, config-precedence mirrors the ADR-G-019 G>U>D analogue
**Status:** accepted · **Date:** 2026-06-30 · **Absorbs:** ADR-004 (Layered Config Merge) · **Supersedes:** —
**Crosswalk:** ADR-004 → ADR-G-001

---

## Context

deckent runs in three overlapping configuration realities at once: a machine-wide default a user sets once (plan tier, language), a per-project override checked in beside a repo, and a per-invocation override for CI / one-off runs. ADR-004 (2026-04-16) fixed the precedence: hardcoded defaults form the floor, `~/.deckent/config.json` (global) layers on top, `.deckent/config.json` (project) on top of that, and `DECKENT_*` environment variables win last. Documented originally as "3-layer" (three *file* layers), the live runtime adds the env-override layer, making **four effective layers**. The merge is a `deepMerge` (`src/core/config.ts`): nested objects merge, arrays are replaced (not concatenated), and `undefined` values are skipped so a partial upper layer never erases a lower one.

That precedence works and is live-proven, but it was framed as an internal config detail. The 2026-06-30 ADR review reframed it as a **global constitution-level law**: config layering is the runtime sibling of the ADR taxonomy's own G>U>D precedence (ADR-G-019), and it must scale cleanly onto the global-install + project-scope topology deckent is moving toward.

## Decision (Today)

Config loads in **layered precedence — four effective layers, last wins**:

```
defaults (hardcoded floor)
  → ~/.deckent/config.json        (global, user-machine-wide)
    → .deckent/config.json        (project, per-repo)
      → DECKENT_* env overrides   (per-invocation; env always wins)
```

- Merge is `deepMerge` (`src/core/config.ts`): nested objects deep-merge; **arrays are replaced, not merged**; `undefined` values are skipped (a sparse upper layer never nulls a lower one).
- Env overrides apply last via a **curated `DECKENT_*` allowlist** (today: `DECKENT_BRAIN_PROVIDER`, `DECKENT_WORKER_PROVIDER`, `DECKENT_MODE`, `DECKENT_LANGUAGE`, `DECKENT_STYLE`) — the CI / one-off escape hatch. It is a *specific curated set*, **not** an arbitrary `DECKENT_*`→any-key mapping; keys documented elsewhere but **unwired** (e.g. `DECKENT_MAX_WORKERS`, `DECKENT_MODEL`) are tracked in CONFIG-ENV-SYNC.
- `autoMigrateOnLoad` upgrades legacy **project** config shapes on read (`migrateConfig(projectConfigPath)`); the global `~/.deckent/config.json` is read + merged but **not** auto-migrated today (tracked: CONFIG-ENV-SYNC / global-migrate).
- The architecture doc's "Config Layers" section (Layer 4 — Environment Variables) is the human-facing mirror of this loader.

This is a structural, deterministic guarantee for the **runtime effective config**: every effective-config consumer goes through `loadConfig` (the layered path). Raw/admin helpers (`readGlobalConfig`, `loadGlobalConfig`) intentionally read a single layer by design and are *not* effective-config consumers. **Caching caveat:** precedence is exact on cold/forced load, but a long-running process caches keyed on the *project* config mtime only — so a global-config or env-var change is re-read only via `clearConfigCache` / `DECKENT_CONFIG_RELOAD=1` / `force` / a project-mtime change (CONFIG-CACHE-GLOBAL).

## Intent / Roadmap (Tomorrow)

- **Scope-aware resolution tied to install topology.** As deckent ships as a global install + project-scope product, the two file layers gain explicit identity: `~/.deckent/config.json` is the **user-global** scope and `.deckent/config.json` is the **user-project** scope. Config resolution becomes scope-addressable, not merely precedence-ordered.
- **Config precedence mirrors ADR G>U>D (roadmap).** The config layering is the operational analogue of the ADR-G-019 precedence: publisher defaults (floor) < user-global < user-project for *additive/tightening* keys, while any publisher-locked invariant (an ADR-G-backed setting) *must not* be loosened by a lower-priority file. **Today the merge is pure last-wins `deepMerge` with no invariant-lock — a project layer CAN currently override a global setting; the lock is roadmap (CONFIG-LOCK), not yet enforced.** The two precedence systems (config-merge and ADR-authority) are kept conceptually aligned so a user reasons about both the same way.
- **Tenant/scope extension.** Multi-tenant + global-install layering (per-host, per-org) extends the same `deepMerge` spine rather than introducing a parallel mechanism.

## Consequences

**(+)** One deterministic, well-understood merge spine covers machine defaults, project overrides, and CI escape hatches; `undefined`-skip + array-replace semantics make partial layers safe and predictable; `autoMigrateOnLoad` keeps old configs forward-compatible; reframing as ADR-G ties config precedence to the project's governance precedence so the two never drift.

**(−)** Array-replace (not merge) is a deliberate sharp edge — a project layer that sets an array fully replaces the global one, which can surprise; the scope-aware + G>U>D-analogue binding is roadmap (today the layers are precedence-ordered but not yet formally scope-addressed); env-override breadth (`DECKENT_*`) must stay documented so a CI override is never silently shadowed.

## References / Absorbed

- **Absorbs:** ADR-004 (Layered Config Merge — defaults→global→project→env, `deepMerge` semantics, 4-effective-layer clarification).
- **Implementation:** `src/core/config.ts` (`deepMerge`, env-override layer, `autoMigrateOnLoad`); `docs/architecture/architecture.md` "Config Layers" (Layer 4 — Environment Variables).
- **Precedence sibling:** ADR-G-019 (ADR Governance & 4-Layer Taxonomy — the G>U>D precedence this config layering mirrors).
- **Cross-ref:** ADR-G-012 (Plan Tier & Config Customization — every config-knob real-in-code), ADR-G-005 (Secret File System — shared global<project scope spine).
- **Born work-items:** CONFIG-ENV-SYNC (curate-vs-expand the env-layer set incl. `DECKENT_MAX_WORKERS`/`DECKENT_MODEL` + sync the `architecture.md` Config-Layers mirror), CONFIG-CACHE-GLOBAL (cache-key incl. global-mtime + env-snapshot for long-running correctness), CONFIG-LOCK (G>U>D publisher-invariant-lock → ADR-G-019/G-020).
- **Direction:** global-install + project-scope topology (MASTER-PLAN ADR-LAYER / install-wiring); `.analysis/adr-review-crosswalk.md` row 004.


---

## adr-g-002: spawnSync Security Pattern

**Status:** accepted

# ADR-G-002: spawnSync Security Pattern

**Class:** ADR-G (Global / Constitution) · **Scope:** global+project · **Immutable:** yes · **Source:** publisher · **Enforcement:** today=array-args security invariant + ADR-006 compile-time scan in `authority-enforcer.ts` (advisory/soft per ADR-G-020) + documented `shell:true` carve-outs → tomorrow=runtime-enforced (advisory→hard via ADR-094 flag-gated vein within ADR-G-020) + Windows carve-out hardened (SPAWN-1)
**Status:** accepted · **Date:** 2026-06-30 · **Absorbs:** ADR-006 (spawnSync Security Pattern) · **Supersedes:** —
**Crosswalk:** ADR-006 → ADR-G-002

---

## Context

Command-injection risk must be driven to zero. Every subprocess invocation in deckent carries potentially untrusted input — prompts, user config, file paths, project content. The original ADR-006 (2026-04-16) established **array-args + no `shell: true`** as a security invariant; the 2026-06-11 amendment reconciled its wording with the async-io axis, clarifying that the **security pattern is independent of the sync-vs-async choice** (the security rule applies to `spawn` and `spawnSync` alike; the sync/async decision is a separate axis).

The 2026-06-30 review confirmed this as **ADR-G** (Global / Constitution): it is a runtime law that ships to every user and constrains every subsystem — LLM-generated subprocess code **cannot** violate it. It is not a contributor convention; it is how the product *behaves* on every host.

---

## Decision (Today)

### 1. Security invariant — array-args, no shell

```xml
<spawn-security-invariant>
  <rule>All subprocess calls run as spawn(binary, [...args]) / spawnSync(binary, [...args]).</rule>
  <rule>shell: true is forbidden by default — no shell interpretation.</rule>
  <rule>Untrusted input (prompts, user input, paths) passes ONLY as argument-array
        elements; it is NEVER interpolated into a command string.</rule>
  <rule>Template-literal / string-concat command construction is forbidden.</rule>
  <scope>Applies to BOTH spawn and spawnSync — orthogonal to the sync/async axis.</scope>
</spawn-security-invariant>
```

This is a **security invariant** (command-injection = zero), not a stylistic preference.

### 2. Sync-vs-async is a separate axis (ADR-D-002)

Async `spawn` is the **default rule** (ADR-D-002, Test Infrastructure & Hermeticity — `spawnSync` blocks the event loop and causes CI timeouts; absorbed old ADR-087 async-io-hermeticity). `spawnSync` is the **sanctioned exception**, permitted only for **short, trusted, non-hot-path one-shots**. When `spawnSync` *is* used (within that sanctioned exception), it MUST follow the §1 security pattern — array-args, no `shell: true`.

### 3. Windows-conditional shell carve-outs (census — narrow, deliberate)

Code-grounded census (2026-06-30) — the carve-outs are **Windows-conditional** (`shell: isWindows` / `shell: process.platform === 'win32'`), not unconditional `shell:true`:

- `src/core/plugin-hooks.ts` — sandboxed plugin-hook execution (Windows-conditional).
- `src/core/provisioner.ts` · `src/core/subscription.ts` · `src/providers/subprocess.ts` — Windows wrapper / provisioning calls (Windows-conditional shell).
- `src/core/provider.ts` is **no longer a `shell:true` carve-out** — it moved to the **SPAWN-1 pattern** (`cmd.exe /c` + `shell:false`: cmd.exe resolves the `.cmd`/`.ps1` wrapper via `PATHEXT` while Node keeps `shell:false`, side-stepping the DEP0190 injection edge). This is the **target pattern the remaining carve-outs migrate toward**.

Every carve-out **must keep args as arrays and never interpolate untrusted input** into a command string. The enumerated set above is the only sanctioned shell-using surface; a new one requires an ADR-G-002 amendment (tracked: SPAWN-1 carve-out-census + hardening).

### 4. Enforcement (today — advisory)

Compliance is tracked by the `ADR-006` compliance check (code-key `checkAdr006`, retained verbatim in code for stability — old ADR-006 **is** this record, now ADR-G-002) in `src/orchestra/authority-enforcer.ts` — a compile-time scan.

**Scan limitation (honest):** `checkAdr006` matches **literal `shell: true`** only. It does **not** catch conditional `shell: <expr>` (`shell: isWindows`, `shell: process.platform === 'win32'`), `execSync(commandString)`, or template/concat command construction — so the §1 invariant is only **partially** machine-enforced (born-item SHELL-SCAN-EXTEND). Per ADR-G-020 V1.0 the check is **advisory/soft** (warns + emits, no hard-block) by default; the ADR-094 **A9 gate is flag-gated** — when enabled it can downgrade a violation to NO_GO (default-off / fail-open today).

---

## Intent / Roadmap (Tomorrow)

- **Enforcement advisory→runtime:** today the ADR-006 scan only warns (and only on literal `shell:true`); tomorrow a subprocess constructed with `shell:true` + interpolated untrusted input is **blocked, not merely logged** — via the ADR-094 flag-gated enforcement vein graduating to default-on under ADR-G-020's authority layer. The runtime gate **wires the existing `spawn-safety.ts` `assertSpawnSafe`** (binary-whitelist + arg-sanitization — today a 0-caller primitive) into the spawn/backend callsites, and **extends `checkAdr006` beyond literal `shell:true`** (conditional-shell + `execSync` + command-string — SHELL-SCAN-EXTEND).
- **Windows carve-out hardening (SPAWN-1):** Node `DEP0190` (`shell:true` + args array) Windows leak + injection fix — tighten the `provider.ts` `.cmd`/`.ps1` resolution so the carve-out can never become an injection surface, moving toward a platform-adapter that resolves wrapper binaries without `shell:true` where the runtime allows. (MASTER-PLAN: SPAWN-1.)
- **Backend convergence:** as worker spawn moves to heterogeneous backends (ADR-G-014 — docker/subprocess/tmux/firecracker/cloud), the array-args invariant is carried **uniformly** across every backend adapter, never re-derived per backend.

---

## Consequences

**(+)** The array-args paths are **injection-free by construction**; the invariant is backend- and sync/async-independent; the shell carve-outs are explicit, enumerated, and auditable. A single security law covers every subprocess path the product takes on any host. (Residual: a few `execSync('<static git command>')` calls run a *static* command through a shell — no untrusted interpolation, low-risk — and any variable-command `execSync` paths migrate to `execFileSync`/array-args; born-item EXECSYNC-MIGRATE.)

**(−)** Windows-conditional shell carve-outs still exist (plugin-hooks, provisioner, subscription, subprocess) and rely on the discipline that args stay arrays. Enforcement is **advisory AND partial**: `checkAdr006` catches only literal `shell: true` (not conditional-shell / `execSync` / command-strings — SHELL-SCAN-EXTEND), warns rather than hard-blocks (ADR-G-020 V1.0 soft; ADR-094 A9 flag-gated), and the strong `spawn-safety.ts` primitive (`assertSpawnSafe`) is a 0-caller, not yet wired. The Windows `DEP0190` carve-out is a known sharp-edge until SPAWN-1 lands.

---

## References / Absorbed

- **Absorbs:** ADR-006 (spawnSync Security Pattern — array-args security invariant + documented carve-outs).
- **Axis partner:** ADR-D-002 (Test Infrastructure & Hermeticity — async-`spawn` default, `spawnSync` sanctioned exception; absorbed old ADR-087 async-io-hermeticity).
- **Backend partner:** ADR-G-014 (Spawn Backend, Options & Observation — uniform invariant across backends; absorbed old ADR-007 SpawnOptions + ADR-089).
- **Enforcement partner:** ADR-G-020 (Authority, Roles, Flow & Enforcement — advisory→hard) + ADR-094 (flag-gated enforcement vein).
- **Born work-items:** SPAWN-1 (Windows `DEP0190` carve-out hardening + carve-out-census + `spawn-safety.ts` `assertSpawnSafe` wiring — MASTER-PLAN, P1) · SHELL-SCAN-EXTEND (`checkAdr006` → conditional-shell + `execSync` + command-string detection) · EXECSYNC-MIGRATE (variable-command `execSync` → `execFileSync`/array-args; cross-ref ADR-087-W).
- **Direction:** `.analysis/adr-review-crosswalk.md` (row 006 → ADR-G-002), `.analysis/adr-governance-redesign-plan.md`.


---

## adr-g-004: Instruction-File Adapter & Multi-Env Generation

**Status:** accepted

# ADR-G-004: Instruction-File Adapter & Multi-Env Generation

**Class:** ADR-G (Global / Constitution) · **Scope:** global+project · **Immutable:** yes · **Source:** publisher · **Enforcement:** today=`ensureDeckentImport` never-overwrite guarantee + per-env adapter provisioning + **pure-adapter law** (host instruction files carry NO deckent-authored volatile content, NOT managed-docs) — **✅ code-true (source): `claude-md` + `agents-md` removed from `docs.json` + seed template + inline fallback; auditor `stale_md` mtime detector removed (was a pure-adapter false-positive); regression tests pin all four adapter files out of managed-docs (DOCS-PURE-ADAPTER done 2026-07-01). ⚠️ published binary reflects it only after `dist/` rebuild.** → tomorrow=data/registry-driven generator (low-maintenance) + full pure-adapter alignment + global+project scope
**Status:** accepted (provisional — DOCS-PURE-ADAPTER ✅ done 2026-07-01; remaining: CURSOR-TARGET-UNIFY + agent-templates disposition) · **Date:** 2026-06-30 (rev 2026-07-01) · **Absorbs:** ADR-013 (DECKENT.md Adapter Pattern), ADR-018 (Multi-Environment Config Generation) · **Supersedes:** —
**Crosswalk:** ADR-013 + ADR-018 → ADR-G-004

---

## Context

Two early decisions converged on one law. ADR-013 (Sprint 15) solved a data-loss bug: `deckent init` used to overwrite `CLAUDE.md`, destroying user customizations. ADR-018 (Sprint 046) solved a breadth problem: every IDE / agent host expects its own instruction file (Claude → `CLAUDE.md`, Codex → `AGENTS.md`, Gemini → `GEMINI.md`, Cursor → `.cursor/rules/deckent.mdc`), in different formats and paths.

Both resolved to the **same pattern**: `DECKENT.md` is the single source of truth, and every host-specific file is a **pure adapter** carrying only a `DECKENT.md` reference plus the **user's own** content — never deckent-authored content, never overwritten. ADR-018's originally-proposed IDE-specific targets (`config.toml`, `settings.json`, `mcp.json`) converged onto this thin-adapter shape instead.

A Sprint 281 amendment (ADR-013-W) surfaced a conflict with the managed-docs system (ADR-029 → ADR-G-015): `docs.json` lists `CLAUDE.md` / `AGENTS.md` as **managed-docs**, so every sprint's RETRO render stamps status sections (Sprint Metrics, Agent Performance) — originally with Turkish headings — onto these host instruction files, a recurring **locale-leak**. The **correct root fix is to make these files pure adapters**: a host instruction file (which is the *user's / project's* file) must never carry deckent's volatile orchestration status — that data belongs only in deckent's own surfaces (`.brain/exports/summary.md`, the dashboard, `deckent status`) and is **referenced, not duplicated** into core files.

> **State-of-code (2026-07-01, honest):** this root fix is **DONE (source)**. `claude-md` + `agents-md` were removed from `.deckent/settings/docs.json`, from the seed `docs.json.template` (which now seeds only the deckent-owned `identity-md` surface), and from the inline `seedDocsConfig` fallback in `docs-config.ts`. `tests/core/task-166-005-docs-identity.test.ts` was flipped from *requiring* `agents-md` to a **pure-adapter regression** asserting all four adapter files (`CLAUDE.md`, `AGENTS.md`, `GEMINI.md`, `.cursor/rules/deckent.mdc`) are absent from **both** the live docs.json and the seed template; `docs-add-interactive.test.ts`'s seed assertion was updated the same way. The obsolete auditor `stale_md` mtime detector (which alerted at CLAUDE.md mtime >70 min on the now-repudiated assumption that deckent stamps CLAUDE.md every sprint) was removed with its unit test — legitimate user-doc freshness is already covered by doc-tracking (ADR-090). The already-stamped `§Sprint Metrics`/`§Active Debt`/`§Agent Performance` sections were stripped from the dogfood's own `CLAUDE.md` (keeping the `§Live Status` *reference*) and the `§Agent Performance` table from `AGENTS.md`. **Remaining:** the published binary reflects the seed change only after a `dist/` rebuild (BUILD-GATE); CURSOR-TARGET-UNIFY + AGENT-TEMPLATES-DISPOSITION are still open.

## Decision (Today)

### 1. Single source + pure adapters (no volatile content on host files)
`DECKENT.md` is the one source of truth. `CLAUDE.md`, `AGENTS.md` (+ optional `.codex/AGENTS.md`), `GEMINI.md`, and `.cursor/rules/deckent.mdc` are **pure adapters**: they hold only the injected `DECKENT.md` reference plus whatever the **user** writes. They are **never overwritten** and **must not be managed-docs** — no sprint render, metric, debt table, or agent-performance section is ever stamped into them. Deckent's volatile orchestration status lives **only** in deckent-owned surfaces (`.brain/exports/summary.md`, dashboard, `deckent status`) and host files reference it, never copy it. (This is the constitutional rule; `claude-md`/`agents-md` are removed from `docs.json` by DOCS-PURE-ADAPTER to make it true.)

### 2. Never-overwrite mechanism
`ensureDeckentImport` (`src/core/utils.ts`) idempotently injects/preserves the reference. It is **reference-aware**: *any* mention of `DECKENT.md` satisfies the requirement — the `@DECKENT.md` auto-load import **or** a plain on-demand "see DECKENT.md" — and the `@` auto-load form is prepended **only when no reference exists at all**, so a deliberate on-demand (context-trim) choice is respected, never forced back to auto-load. `deckent sync` (`src/cli/commands/sync.ts`) re-synchronizes all adapters. Init is idempotent and safe — re-running never clobbers user content.

### 3. Per-environment provisioning
Production init provisions adapters **additively** via `applyEnvConfig` → `ensureDeckentImport` (`src/cli/commands/init-steps.ts`), producing pure-adapter files (reference + user content). `deckent init --all-envs` provisions every environment in one command.

> **Legacy surface (not today's enforcement):** `src/cli/helpers/agent-templates.ts` (`generateAgentsMd` / `generateGeminiMd` / `generateCursorRules`) generates **rich** content (project name, commands, rules) — i.e. *not* pure adapters — and has **no production caller** (referenced only by tests). It must not be cited as the live mechanism; its disposition (wire to a correct generator, or mark `@deprecated` / remove) is **AGENT-TEMPLATES-DISPOSITION**.

| Host | Adapter file (single real target) |
|---|---|
| Claude Code | `CLAUDE.md` |
| Codex | `AGENTS.md` (+ optional `.codex/AGENTS.md`) |
| Gemini | `GEMINI.md` |
| Cursor | `.cursor/rules/deckent.mdc` |

> **Cursor target is currently scattered** — `cursor-config.ts` writes `.cursor/rules/deckent.mdc`, an init message says `.cursor/rules/deckent.md`, and `sync.ts` treats `.cursor/rules` as a *directory* target. CURSOR-TARGET-UNIFY collapses these to the single `.cursor/rules/deckent.mdc` file.

## Intent / Roadmap (Tomorrow)

- **DOCS-PURE-ADAPTER (P0) — ✅ DONE (source, 2026-07-01).** Removed `claude-md` + `agents-md` from `.deckent/settings/docs.json`, the seed `docs.json.template`, and the inline `seedDocsConfig` fallback; flipped `tests/core/task-166-005-docs-identity.test.ts` + `docs-add-interactive.test.ts` and added a regression asserting the four adapter files are **NOT** managed-docs in both docs.json and the template; removed the obsolete auditor `stale_md` detector (+ test) that assumed CLAUDE.md is deckent-stamped; stripped the frozen-stale volatile sections from the dogfood's own CLAUDE.md/AGENTS.md. No information is lost: `.brain/memory.db` is the source of truth for this data and it is surfaced on-demand by `deckent status` / `deckent history` / `deckent retro` + the dashboard (and `.brain/exports/summary.md`, git-tracked, carries the Active-Debt + decisions + learnings slice); git history preserves the old stamps. Removing the entries just stops polluting the user's core instruction files. Pending: `dist/` rebuild for the published binary (BUILD-GATE).
- **CURSOR-TARGET-UNIFY (P1).** Collapse the Cursor target to the single `.cursor/rules/deckent.mdc` file across `init-steps.ts`, `cursor-config.ts`, and `sync.ts` (no `.md` message, no dir-as-file).
- **AGENT-TEMPLATES-DISPOSITION (P1).** Decide the fate of the test-only `agent-templates.ts` rich generators: either make them produce pure adapters (and wire them), or mark `@deprecated` / remove (DEADMOD-style).
- **Data/registry-driven generator (low-maintenance).** Replace one hand-written function per host with a single engine + host registry (path/format), so a new environment is a registry entry, not new code — keeping maintenance flat as the host matrix grows (Immutable Law #2 — EVERY ENVIRONMENT).
- **Global + project scope.** Adapter generation/sync becomes scope-aware: a global install seeds host adapters at the user-global layer; project init seeds them per-project (consistent with ADR-G-001's layering).
- **Provider-adapter parity.** As the Brain becomes provider-agnostic (ADR-G-008), the instruction-file adapter registry is the doc-side sibling of the provider adapter registry — same registry-driven philosophy.

## Consequences

**(+)** User instruction files are never destroyed *and* never polluted with deckent's volatile status — one source (`DECKENT.md`) stays authoritative, status stays in deckent-owned surfaces; the pure-adapter law kills the locale-leak at its true root (host files simply are not render targets); `--all-envs` gives one-command multi-IDE setup; reference-aware injection respects on-demand context-trim.

**(−)** DOCS-PURE-ADAPTER is code-true in **source** but the published binary seeds the old shape until `dist/` is rebuilt (BUILD-GATE). Still open: the Cursor target is scattered (CURSOR-TARGET-UNIFY) and the `agent-templates.ts` generators are test-only legacy (AGENT-TEMPLATES-DISPOSITION). Per-env generators are still hand-maintained until the registry-driven engine lands; scope-aware global+project generation is forward-looking.

## References / Absorbed

- **Absorbs:** ADR-013 (DECKENT.md Adapter Pattern — single-source + thin adapter + never-overwrite), ADR-018 (Multi-Environment Config Generation — per-env provisioning, `--all-envs`).
- **Implementation:** `src/core/utils.ts` (`ensureDeckentImport`, reference-aware), `src/cli/commands/init-steps.ts` (`applyEnvConfig` — real additive path), `src/cli/commands/sync.ts` (`deckent sync`). **Legacy/test-only:** `src/cli/helpers/agent-templates.ts` (rich generators, no prod caller).
- **Born work-items:** **DOCS-PURE-ADAPTER** (P0 — remove `claude-md`/`agents-md` from `docs.json` + seed template + update/add tests; adapters are not managed-docs) · **CURSOR-TARGET-UNIFY** (P1 — single `.cursor/rules/deckent.mdc`) · **AGENT-TEMPLATES-DISPOSITION** (P1 — wire-or-deprecate the test-only generators) · data/registry-driven low-maintenance generator (crosswalk maintenance-note).
- **Cross-ref:** ADR-G-015 (Managed-Docs — the system these host files are deliberately excluded from; legitimate managed-docs like `docs/vision/*` and `beta-tracker` stay), ADR-G-001 (Layered Config & Scope), ADR-G-008 (Provider Abstraction — sibling adapter-registry philosophy), Immutable Law #2 (EVERY ENVIRONMENT).
- **Direction:** `.analysis/adr-review-crosswalk.md` rows 013, 018.


---

## adr-g-005: Secret File System (Dedicated `.deck` + Per-Provider Credential Model)

**Status:** accepted

# ADR-G-005: Secret File System (Dedicated `.deck` + Per-Provider Credential Model)

**Class:** ADR-G (Global / Constitution) · **Scope:** global+project · **Immutable:** yes · **Source:** publisher · **Enforcement:** today=`.deck` + `DECKENT_` registry + `ensureDeckGitignore` (auto) + `$DECK:KEY` interpolation + **per-provider env-forward allowlist to workers** (F1-014r — each worker gets ONLY its own provider credential) + **DECK-WORKER-ISOLATION: docker workers can no longer read `.deck`** (an empty read-only overlay shadows `/workspace/.deck` — DECK-WORKER-ISOLATION done for the docker backend, 2026-07-01) → tomorrow=extend file-isolation to the subprocess backend (host-side credential broker) → true zero-exposure across ALL backends; global+project scope
**Status:** accepted (file-separation + per-provider credential model live; **zero-worker-exposure is TRUE for the docker backend** — `.deck` shadowed out of the mount + env-forward already a per-provider allowlist; **subprocess backend still runs in the project root so `.deck` stays disk-readable there** — the host-side broker is the remaining DECK-WORKER-ISOLATION half) · **Date:** 2026-06-30 (rev 2026-07-01) · **Absorbs:** ADR-014 (.deck Secret File System) · **Supersedes:** —
**Crosswalk:** ADR-014 → ADR-G-005

---

## Context

Provider API keys originally lived in `.env`, which collided with the user's own project `.env`: deckent's `DECKENT_`-prefixed keys polluted the user file and complicated `.gitignore` management. ADR-014 (Sprint 044) separated deckent secrets into a dedicated **`.deck`** file, auto-added to `.gitignore` at init, so the user's `.env` is never touched.

A Sprint 281 re-audit (classification: BOTH — secret hygiene is directly user-product security) re-verified the core. The original ADR said "Brain injects only the needed keys per task scope," and a later draft over-strengthened this to "zero exposure / workers cannot read `.deck` under any backend." **The 2026-06-30 code-grounded review corrects that over-claim.** deckent does **not** *explicitly* transport `.deck` to a worker — but two real paths expose secrets to the worker today: (a) the **docker backend mounts the project root** (read-only) at `/workspace`, and `.deck` lives in the project root with **no exclusion**, so a worker **can read `/workspace/.deck`**; (b) host-side, `.deck` → `process.env` (`loadDeckSecrets`) and the docker backend **forwards the provider key per-provider** into the container (`-e ANTHROPIC_API_KEY` for api-mode). The honest model is therefore **dedicated-file separation + a per-provider credential allowlist**, not zero-exposure. Closing both gaps is the DECK-WORKER-ISOLATION roadmap item.

## Decision (Today)

### 1. Dedicated secret file
deckent's secrets live in a separate **`.deck`** file using a `DECKENT_`-prefixed key registry (`KNOWN_DECK_KEYS` + dynamic provider keys — see DECK-KEYS-SYNC). The user's `.env` is never read or written. `ensureDeckGitignore` adds `.deck` to `.gitignore` automatically at init; `isDeckFileCommitted` guards against an accidentally-committed secret file. Core helpers: `parseDeckFile` / `loadDeckSecrets` / `validateDeckFile` / `createDeckTemplate` / `ensureDeckGitignore` / `isDeckFileCommitted` (`src/core/deck-file.ts`).

### 2. Worker credential model — per-provider env-allowlist + docker `.deck` isolation

deckent never *explicitly* copies `.deck` into a worker. File-level isolation is now enforced for the docker backend and remains open for the subprocess backend:

- **Docker: `.deck` is shadowed out of the mount (DECK-WORKER-ISOLATION, done).** The docker backend bind-mounts the project root **read-write** at `/workspace` (`spawn-backend-docker.ts`), and `.deck` lives in the project root — so a worker *could* `read('/workspace/.deck')`. It no longer can: when a `.deck` exists, an **empty read-only file is overlaid at `/workspace/.deck`** (`buildDeckShadowMountArgs`), so the worker sees a 0-byte file while the host `.deck` is untouched (verified live: a real container reads empty). The shadow is **conditional** — mounting over a *missing* `.deck` would materialize a phantom host `.deck` via the nested bind mount, so no file ⇒ no mount.
- **Subprocess: `.deck` is still disk-readable (roadmap).** The subprocess backend runs the worker as a **host process inside the project root**, where no mount trick applies — the file stays readable; isolation there rests on env-scrubbing (below) until the host-side credential broker lands.
- **Credentials are env-forwarded via a per-provider allowlist (F1-014r).** Host-side, `.deck` → `process.env` (`loadDeckSecrets`, `provider.ts`); each backend then hands a worker **only its own provider credential** — docker forwards exactly one key (`ANTHROPIC_API_KEY` only in api-mode, `OPENAI_API_KEY` for codex, `GOOGLE_API_KEY` for gemini; `cross-provider-keys.ts`), subprocess scrubs every foreign provider key from the inherited env and re-injects only the owner's. A worker never sees a foreign provider's credential.
- **Most consumers are host-side** (provider bootstrap auto-register — ADR-G-008 / ADR-077 Part-C, `server.ts`, `doctor.ts`, `$DECK:KEY` config interpolation), which limits *broad* secret spread.

**True zero-worker-exposure is now real for the docker backend** (`.deck` shadowed + per-provider env allowlist). Extending file-isolation to the **subprocess** backend — e.g. a host-side credential broker so the worker never touches the secret file regardless of backend — is the remaining **DECK-WORKER-ISOLATION** half.

### 3. `$DECK:KEY` interpolation + signing
Config values may reference secrets as `"$DECK:KEY"` (e.g. `"token": "$DECK:DISCORD_TOKEN"`), resolved at runtime host-side from `.deck` with a missing-secret warning (`src/core/deck-interpolation.ts`). Ed25519 signing for secret / skill-publish signatures uses `@noble/ed25519` + `@noble/hashes` (`src/core/signature.ts`, private key written `0o600`); per the ADR-D-005 amendment these two crypto dependencies are governed here.

## Intent / Roadmap (Tomorrow)

- **DECK-WORKER-ISOLATION (P0) — ✅ docker half done (source, 2026-07-01); subprocess half open.** The docker project-root mount now shadows `.deck` with an empty read-only overlay (`buildDeckShadowMountArgs`, conditional on `.deck` existing to avoid a phantom host file) and the env-forward is already a per-provider allowlist (F1-014r) — so a docker worker can neither read `.deck` nor see a foreign credential. **Remaining:** the subprocess backend runs the worker in the project root where no mount trick applies, so `.deck` stays disk-readable there; closing it needs a **host-side credential broker** (secrets resolved host-side, never exposed to the worker filesystem, regardless of backend). Also pending: `dist/` rebuild for the running docker backend to pick up the shadow (BUILD-GATE).
- **Global + project scope.** Today `.deck` is effectively project-local. As deckent ships global-install + project-scope (ADR-G-001 layering), secrets resolve across a **global `~/.deck`** (machine-wide provider keys set once) and a **project `.deck`** (per-repo overrides), same precedence spine as config (global < project).
- **Multi-tenant secret isolation.** Once DECK-WORKER-ISOLATION holds, the host-side-only consumer model becomes the foundation for per-tenant secret scoping (enterprise) — secrets never crossing the worker boundary regardless of backend (docker / subprocess / future firecracker / cloud).
- **Consent + provisioning tie-in.** Secret setup folds into the conversational onboarding / consent flow (ADR-G-030) so a user provisions provider keys without hand-editing `.deck` (and `createDeckTemplate` must never overwrite an existing `.deck` — DECK-OVERWRITE-GUARD).

## Consequences

**(+)** deckent secrets are fully separated from the user's `.env`; auto-gitignore + committed-file guard prevent accidental git leaks; the per-provider env-allowlist limits a worker to its own provider credential rather than the whole secret set; `$DECK:KEY` interpolation keeps raw secrets out of config files; signing deps are governed, not ad-hoc.

**(−)** **Zero-worker-exposure is true for the docker backend but not yet the subprocess backend:** a subprocess worker runs in the project root and can still read `.deck` from disk (env is scrubbed to its own provider credential, but the file is reachable) — closing it needs the host-side credential broker (DECK-WORKER-ISOLATION, subprocess half). The docker shadow is source-true but the running backend reflects it only after a `dist/` rebuild (BUILD-GATE). Other open gaps: `createDeckTemplate` writes `.deck` unconditionally and can **overwrite an existing secret file** on re-init (DECK-OVERWRITE-GUARD); `KNOWN_DECK_KEYS` (9 keys) drifts from real usage (`DECKENT_DEEPSEEK_API_KEY`, `DASHSCOPE`, `ZHIPU`, `WEBHOOK_KEY` warn as "unknown" — DECK-KEYS-SYNC); `.deck` is written without `0o600` perms and is absent from `.npmignore` (defense-in-depth — DECK-HARDEN, though `package.json` `files` currently excludes it from publish). Global+project secret scope is roadmap.

## References / Absorbed

- **Absorbs:** ADR-014 (.deck Secret File System — dedicated file, `DECKENT_` registry, auto-gitignore).
- **Implementation:** `src/core/deck-file.ts` (parse/load/validate/template/gitignore/committed-guard), `src/core/deck-interpolation.ts` (`$DECK:KEY`), `src/core/signature.ts` (Ed25519, `@noble/ed25519` + `@noble/hashes`), `src/orchestra/spawn-backend-docker.ts` (project-root mount + per-provider env-forward).
- **Cross-ref:** ADR-D-005 (Dependency Policy — crypto-deps bridge), ADR-G-008 (Provider Abstraction — bootstrap auto-register, host-side consumer; ADR-077 Part-C), ADR-G-001 (Layered Config & Scope — shared global<project precedence), ADR-G-014 (Spawn Backend — the mount/env model lives here), ADR-G-030 (Consent-Based Provisioning — secret-setup onboarding), ADR-G-031 (multi-tenant secret scoping).
- **Born work-items:** **DECK-WORKER-ISOLATION** (P0 — exclude `.deck` from worker mount + narrow env-forward) · DECK-OVERWRITE-GUARD (P1 — `createDeckTemplate` no-op-if-exists) · DECK-KEYS-SYNC (P1 — `KNOWN_DECK_KEYS` → built-ins + dynamic provider-key pattern) · DECK-HARDEN (P2 — `.deck` `0o600` + `.npmignore` entry).
- **Direction:** global+project secret scope (MASTER-PLAN); `.analysis/adr-review-crosswalk.md` row 014.


---

## adr-g-006: Routing & Selection (Learned Model/Effort + Agent/Skill)

**Status:** accepted

# ADR-G-006: Routing & Selection (Learned Model/Effort + Agent/Skill)

**Class:** ADR-G (Global / Constitution) · **Scope:** global+project · **Immutable:** yes · **Source:** publisher · **Enforcement:** today=`routeTaskV2` multi-signal selection (intent domain-enrichment + domain-match-bonus + surface-aware bonus; skill→agent affinity config-enableable, default-off) + live routing-diversity test + routing-distribution script — **✅ V1 PURGED (ROUTE-V1-PURGE, 2026-07-01): the V1 engine is deleted — `decision-engine.ts` DecisionOrchestrator + `decision-replay.ts` + `decision-steps/` gone; config drops `'v1'` (value + type + validation); every runtime default (planner + fix-path + finalizer) is `'v2'`; the live scope-collision guard moved to `scope-collision.ts`** → tomorrow=learned Routing V3 (per-task-type outcome matrix auto-updating from real results, new-model auto-adopt on merit, vector-selection over task-kind×cost×latency×risk×provider-health×outcome; project+provider-scoped, user-manageable) — ROUTE-1+ · PROV-MATRIX · F1-AD
**Status:** accepted (ROUTE-V1-PURGE ✅ done 2026-07-01 — V1 engine + config + runtime removed; kalan: finalizer dead-V1-stats-branch ✅ 352-010 + V2-integration-coverage ✅ 352-011 + routing-version-label ✅ 352-013; affinity-default decision open) · **Date:** 2026-06-30 (rev 2026-07-01) · **Absorbs:** ADR-015 (TaskRouter 6-level) + ADR-028 (Decision-Engine V1→V2→V3) + ADR-072 (Routing Balance multi-signal) + ADR-073 (Routing Live Validation + FIX-prompt) + ADR-075 Part-B (skill→agent affinity)
**Crosswalk:** 015 (+028+072+073+075B) → ADR-G-006

> **Authoring note (Alperen):** an ADR's documentation must explain both **today AND tomorrow** through its target-intent, transparently — "this matters and is critical to us." This ADR is the first-class application of the ADR-AUTHORING-STD (ADR-G-019: document today + tomorrow, transparently).

---

## Context

Routing decides, per task: which agent, which skills, which provider, which model, which effort. The old stack was a 6-level router (ADR-015) plus a V1 decision-engine (ADR-028) that was superseded by V2 (`routeTaskV2`) but **never removed**; plus a chronic distribution-skew problem (one agent winning ~12/16 tasks) that ADR-072/073/075B mitigated with domain-enrichment, domain-match-bonus, skill→agent affinity, a live-diversity test, and a routing-distribution guard. The 2026-06-30 review consolidates routing into one ADR, **mandates the complete removal of V1** (decided — "izi bile kalmayacak"), and commits to a **learned, evolving** selection model (V3).

---

## Decision (Today)

- **`routeTaskV2` is the routing engine.** Selection combines: intent domain-enrichment (scope-path → api/security/design/data/devops/docs intent), **domain-match bonus (+3)**, surface-aware bonus (ADR-G-009 Tier-1 → api-builder/frontend-designer/ci-guardian), and `force-*` overrides (preserved). **Skill→agent affinity** (`SKILL_AGENT_MAP` + affinity-bonus) is a **config-enableable** signal, **default-off** today (`skillAgentAffinity ?? false`) — a real selection lever once enabled, not an always-on default (AFFINITY-DEFAULT-DECISION: make default-on, or keep config-gated by design).
- **Guards:** live routing-diversity test (single-agent ≤60%, ≥4 distinct agents on a mixed set) + a **routing-distribution script** (`routing-distribution.mjs --ci`, >80% → fail) wired in CI — note it is **advisory in practice**: with no `.deckent/routing/learnings.json` data it passes vacuously, so it is "script + tests + optional guard", not a hard standalone gate. **FIX-prompt enrichment** (original-task + NO_GO-reason injected). `selectFixAgent` is **not** bug-fixer-by-default: it **preserves the model (identity)** and applies a **fresh-eyes agent rotation** (a complementary agent — e.g. architect→code-reviewer), while **preserving the original agent for specific failure modes** (test / doc / bug / exit-no-result) and rotating only for the generic case.
- **✅ V1 removal — DONE (ROUTE-V1-PURGE, 2026-07-01).** "izi bile kalmayacak" — executed. Deleted: `src/orchestra/decision-engine.ts`'s `DecisionOrchestrator` (its live scope-collision guard was `git mv`'d to `scope-collision.ts`, preserving blame), `decision-replay.ts`, `decision-steps/agent-step.ts` + `scope-step.ts`, the V1-exclusive integration tests (`full-sprint-e2e`, `error-recovery`, both `decision-engine.test.ts`, `decision-replay.test.ts`, the two `decision-steps` tests), the `decision-orchestrator-v1` manifest entry (+ its `sync-manifest.mjs` source + `dead-code-audit.mjs` suspects). Config drops `'v1'`: `config.ts` validation → `['v2']`, the type is `'v2'`, `config-migration.ts` updated. **Every runtime default fixed to `'v2'`** — `sprint-planner.ts` (`?? 'v1'`→`?? 'v2'`, and the V1 else-branch removed), `sprint-controller.ts` fix-path, and `sprint-finalizer.ts` (which had read `undefined !== 'v2'` → **ran the legacy V1 stats path by DEFAULT** — the latent bug; now defaults `'v2'`, the learnings.json SSOT path). Types narrowed (`task-types.ts`, `outcome-tracker.ts`). **Two vestiges remain as born follow-ups:** the finalizer's now-dead V1 stats branch is a behavior-sensitive collapse (ROUTE-V1-DEADBRANCH-COLLAPSE) and the deleted V1-only integration tests need V2 equivalents (ROUTE-V2-INTEGRATION-COVERAGE).

---

## Intent / Roadmap (Tomorrow) — Learned Routing V3

V2 is sufficient *today* but **not the target**. V3 = a **learned model/effort selection matrix**:

```xml
<routing-v3 intent="learned + auditable">
  <learn>per-task-type outcome metrics (success / quality / cost / latency) → the
    model/effort matrix auto-updates from real results.</learn>
  <auto-adopt>new models auto-adopted on merit (e.g. opus-4.9 &gt; 4.8; live capability,
    zero-hardcode — F1-AD).</auto-adopt>
  <vector-select>natural selection over (task-kind × cost × latency × risk ×
    provider-health × outcome).</vector-select>
  <scope>project + provider scoped; USER-manageable; force-* preserved.</scope>
  <transparency>the ADR documents today AND tomorrow with target-intent — this is
    important and critical to us.</transparency>
</routing-v3>
```

(= ROUTE-1+ / ROUTE-V1-PURGE / PROV-MATRIX, fusing outcome-tracker + F5 + F1-AD — the Codex ModelPolicyEngine convergence.) Distribution balance remains a **continuously-monitored** target (the +3 bonus is the first link; ADR-G-023 affinity + WM-7 language-mismatch-penalty deepen it). **Routing-version labelling** is also cleaned up here: `routeTaskV2` currently returns `routingVersion: 'v3'` while the planner stamps `'v2'` on the task — today's engine is V2, so the label is reconciled (ROUTING-VERSION-LABEL) rather than left to imply V3 already ships.

---

## Consequences

**(+)** One routing law; selection is multi-signal and diversity-guarded today, and learned/auditable tomorrow. New models adopt on merit without hardcoded IDs. User + project scoping.

**(−)** V1 is gone at the engine + config + runtime-default level, but two vestiges remain: (1) the finalizer's now-**dead** `if (routingVersion !== 'v2')` stats branch (61 lines) is left in place because collapsing it is a behavior-sensitive dedent on the critical finalize/double-count-guard path — ROUTE-V1-DEADBRANCH-COLLAPSE; (2) the deleted V1-only integration tests (`full-sprint-e2e`, `error-recovery`, project-type routing blocks) were exercising dead code, but if any was the *only* coverage of a "route N tasks for a monorepo" scenario, a V2 equivalent is owed — ROUTE-V2-INTEGRATION-COVERAGE. Fixing the finalizer default from V1→V2 is a real behavior change (stats now record to learnings.json, the V2/V3 SSOT, instead of agent.json). Distribution skew is mitigated, not solved (recurred at Sprint 211 as refactorer-heavy) — and the skill→agent affinity lever is **default-off** (AFFINITY-DEFAULT-DECISION). The `routingVersion` label is still inconsistent (`'v3'` returned vs `'v2'` stamped — ROUTING-VERSION-LABEL), and a vestigial single-value `if (routingVersion === 'v2')` guard remains in the planner for that reconcile. V3 (learned matrix) is roadmap; today is V2 + guards.

---

## References / Absorbed

- **Absorbs:** ADR-015 + ADR-028 (V1 lineage — purge mandated, pending) + ADR-072 + ADR-073 + ADR-075 Part-B.
- **Cross-ref:** ADR-G-008 (provider/model registry, cost) · ADR-G-009 (surface-aware routing, eval) · ADR-G-023 (agent/skill taxonomy, affinity) · ADR-G-032 (evolution — outcome signal) · ADR-G-028 (work taxonomy).
- **Born / MASTER-PLAN:** **ROUTE-V1-PURGE** (P0 — ✅ **done 2026-07-01**: V1 engine/config/runtime-default/manifest/tests deleted, scope-collision guard relocated) · **ROUTE-V1-DEADBRANCH-COLLAPSE** (born — collapse the finalizer's now-dead V1 stats branch + the vestigial planner/finalizer version-guards; behavior-sensitive) · **ROUTE-V2-INTEGRATION-COVERAGE** (born — V2 equivalents for the deleted V1-only full-sprint / error-recovery / project-type integration tests) · ROUTE-1+ (Routing V3) · PROV-MATRIX · F1-AD · **ROUTING-VERSION-LABEL** (P2 — reconcile `'v3'`-return vs `'v2'`-stamp) · **AFFINITY-DEFAULT-DECISION** (P1 — skill→agent affinity default-on vs config-gated-by-design).
- **Memory:** `feedback_agent_routing_imbalance`.


---

## adr-g-007: External Messaging Connectors & Integration Layer

**Status:** accepted

# ADR-G-007: External Messaging Connectors & Integration Layer

**Class:** ADR-G (Global / Constitution) · **Scope:** global+project · **Immutable:** yes · **Source:** publisher · **Enforcement:** today=config-gated + lazy-load + fail-safe (per-target timeout-guarded, error-isolated) connectors + project-scoped session/pairing gateway (auth-gate pending) → tomorrow=integration-layer (MSG-1) + multi-channel ApprovalBroker relay (APR-2) + pairing onCallback wire + WhatsApp wire (MSG-3) + pairing hard-auth before public exposure
**Status:** accepted (amendment — grammy-not-telegraf, whatsapp config-type gap, secret-policy-not-hard-enforced; gateway-auth + ApprovalBroker already honestly marked) · **Date:** 2026-06-30 · **Absorbs:** ADR-016 (External Messaging Connectors), ADR-091 (Project-Scoped Messaging Gateway) · **Supersedes:** —
**Crosswalk:** ADR-016 + ADR-091 → ADR-G-007

> **Note:** ADR-091 (Project-Scoped Messaging Gateway) lived in `memory.db` (`type='adr'`) but was never exported to `docs/adr/` — a real doc↔DB drift. Folding it into ADR-G-007 closes that drift; no standalone export is created (per crosswalk row #091). The gateway today ships **without** a hard pairing-auth gate, so it must not be exposed on a public network until the pairing onCallback + auth work (MSG-1/APR-2) lands — see Intent/Roadmap.

---

## Context

Operators need deckent to reach them where they already are — their phone — for sprint approvals, checkpoint gates, and alerts, and to reply back inbound (approve/reject) without opening a terminal. This is a first-class **product** surface: it is how a non-coder operator or an enterprise on-call rotation supervises an autonomous run from anywhere, and how deckent's "AI proposes, human approves" law (ADR-G-031 F3) reaches a human across channels.

Two decisions are merged here, because in the current codebase they are one subsystem:

- **ADR-016 (External Messaging Connectors)** defined the lifecycle-managed `src/connectors/` subsystem — the `BaseConnector` contract, the per-platform adapters (Telegram/Discord/WhatsApp), outbound notification dispatch, the inbound approve/reject pipeline, and the agentic bot. ADR-016 was originally (Sprint 044) an **AI-provider** health/lifecycle `Connector` abstraction; that responsibility moved to `src/core/provider.ts` `ProviderAdapter` (now governed by **ADR-G-008**), and the term *connector* + the `src/connectors/` namespace were repurposed to mean **external messaging connectors**. That repurpose closed a governance gap (a 16-file messaging/bot subsystem with no ADR).
- **ADR-091 (Project-Scoped Messaging Gateway)** added a project-scoped **session/pairing** gateway (`src/connectors/gateway/`) so that a single bot process can serve multiple projects with per-project session isolation and a pairing handshake — the re-architecture of the Telegram experience from the ground up.

The subsystem's non-negotiable invariants were forged from operational pain: a slow or hung messaging platform must **never** block the sprint lifecycle, an absent optional dependency must **never** break process load, and a misconfigured channel must **never** leak a credential.

---

## Decision (Today)

### 1. Connector subsystem (`src/connectors/`)

```xml
<connector-subsystem root="src/connectors/">
  <contract-and-pool>
    base-connector.ts   — BaseConnector interface (the per-platform contract)
    connector-pool.ts   — ConnectorPool: register / broadcast / lifecycle
  </contract-and-pool>
  <adapters>
    telegram.ts   — Telegram (grammY — replaced Telegraf in G2a; runtime dep)
    discord.ts    — Discord (discord.js, OPTIONAL dep, lazy-imported)
    whatsapp.ts   — WhatsApp (adapter present + runtime-SUPPORTED in bootstrap, but
      the public notify_connectors config type is still telegram|discord only —
      whatsapp needs a cast today; full config-type + wire = MSG-3, see Tomorrow)
  </adapters>
  <outbound>
    connector-notify-adapter.ts — ConnectorNotificationAdapter implements the
      WIRE-001 NotificationAdapter contract; each DECKENT→USER:NOTIFY goes to
      every connector's own chat_id, per-target timeout-guarded + fail-isolated.
  </outbound>
  <inbound>
    incoming-router.ts → incoming-command-router.ts / incoming-command-resolver.ts
      — route inbound messages to actions (approve / reject / status).
  </inbound>
  <bot>
    bot-agentic.ts / bot-daemon.ts / bot-commands.ts / bot-action-store.ts
      — `deckent bot listen`; humanized replies (BOT-1).
    chat-bridge.ts — ChatMemoryAdapter, bounded multi-turn history (BOT-2d).
  </bot>
  <bootstrap>
    connector-bootstrap.ts — reads `notify_connectors` config, lazy-imports
      enabled connectors (missing optional dep → log + skip), starts OUTBOUND.
  </bootstrap>
  <gateway scope="project">                          <!-- absorbs ADR-091 -->
    gateway/ — project-scoped session + pairing: one bot process serves many
      projects; per-project session isolation + a pairing handshake binds a
      chat to a project. (Telegram experience re-architecture.)
  </gateway>
</connector-subsystem>
```

### 2. Invariants (the law)

- **Config-gated.** A connector is inert unless `notify_connectors: { telegram|discord: { enabled, token: "$DECK:…", chat_id } }` enables it. Tokens **should** be referenced through `$DECK:` interpolation (**ADR-G-005**), not stored inline — this is **policy + a bootstrap guard** (an unresolved `$DECK:` token is logged + skipped), **not** a hard schema rejection: a raw inline token is currently still accepted. Fail-closed schema enforcement is a hardening item (SECRET-INLINE-ENFORCE).
- **Lazy.** Optional deps (e.g. `discord.js`) are lazy-imported; a missing optional dependency logs and is skipped, never breaks process load (dependency policy: **ADR-D-005**).
- **Fail-safe.** Every send is timeout-guarded and per-target error-isolated. A slow, hung, or erroring platform never blocks or fails the sprint lifecycle.
- **Adding a platform** today = a new adapter implementing `BaseConnector` + a `notify_connectors` entry **+ edits to the `SUPPORTED` list and the `notify_connectors` config type** (so it is not yet zero-core-change). The **zero-core-change ideal** — pure adapter + registry entry — is the MSG-1 integration-layer/registry roadmap (CONNECTOR-PLATFORM-REGISTRY).

### 3. Project-scoped session/pairing gateway (absorbs ADR-091)

The gateway scopes inbound sessions per-project and brokers a pairing handshake so one running bot can supervise multiple projects without cross-project session bleed. **Today's honest limitation:** the gateway has **no hard pairing-auth gate** yet — pairing is established but not cryptographically enforced on every inbound callback — so it is safe for trusted/local use but **must not be exposed publicly** until the pairing onCallback + auth work lands (Tomorrow). This is an explicitly-marked debt, not silent.

---

## Intent / Roadmap (Tomorrow)

- **MSG-1 — Integration layer.** A formal integration layer above the per-platform adapters: a uniform inbound/outbound message envelope, retry/backoff, and delivery-receipt semantics, so new channels (Slack, Teams, email, webhook) plug in without per-adapter glue.
- **APR-2 — Multi-channel approval relay.** Approval requests fan out across every paired channel and the **first** authoritative human response wins, routed through the unified **ApprovalBroker** (the runtime-wide approval spine that also serves nervous-system approvals — **ADR-G-022**). One approval, any channel.
- **Pairing onCallback + hard-auth.** Wire the pairing callback end-to-end and gate every inbound callback behind the pairing identity, so the gateway becomes safe to expose beyond a trusted host. Connector-side identity/RBAC graduates into the enterprise connector-identity model (**ADR-G-031**, fail-CLOSED L2-RBAC) and the authority layer (**ADR-G-020**).
- **WhatsApp wire (MSG-3).** Complete the WhatsApp adapter to outbound+inbound parity with Telegram.
- **Bot tool-surface.** Expose cost/usage/kpi as bot-callable tools and gate risky tools (start/run/process, publish) behind a button-confirm approval in DMs and groups — under the same surface-parity contract as CLI/MCP/terminal (**ADR-G-011**).

---

## Consequences

**(+)** deckent reaches a human on their phone and takes back a decision — the approval loop closes across channels, which is what makes an autonomous run supervisable for a non-coder and an enterprise alike. The subsystem is fail-safe by construction (a dead platform never stalls a sprint), config-gated (no accidental phone-home), and extensible (new platform = new adapter). Folding ADR-091 into this record fixes a real doc↔DB drift and makes the gateway's session/pairing model part of the connector law rather than an orphan.

**(−)** The project-scoped gateway today lacks a hard pairing-auth gate — a marked debt that bounds it to trusted/local use until MSG-1/APR-2 land (it must not be made public before then). WhatsApp is adapter-present but not fully wired (MSG-3). The bot tool-surface and group-button approval are built but pending build+restart, and a detached-exec gap exists for start/run/process (tracked in `project_bot_tool_surface_and_group_buttons`). ApprovalBroker unification (APR-2) is roadmap — today approvals route through the existing nervous-accept path, not yet a single multi-channel broker.

---

## References / Absorbed

- **Absorbs:** ADR-016 (External Messaging Connectors — `BaseConnector`/`ConnectorPool`, adapters, outbound notify, inbound pipeline, agentic bot, bootstrap; originally Sprint-044 AI-provider lifecycle, repurposed 2026-06-11) + ADR-091 (Project-Scoped Messaging Gateway — session/pairing, drift-fixed here).
- **Provider lineage:** the original Sprint-044 AI-provider `Connector` responsibility moved to **ADR-G-008** (Provider Abstraction, Fleet & Native-Usage) — `connector` now means *messaging*, not *provider*.
- **Secret interpolation:** **ADR-G-005** (Secret File System & Zero-Worker-Exposure) — `$DECK:` token references.
- **Dependency policy:** **ADR-D-005** (Dependency Policy & Inventory) — `grammy` runtime dep (replaced `telegraf` in G2a), `discord.js` optional/lazy.
- **Approval spine:** **ADR-G-022** (Nervous System) — ApprovalBroker unification (APR-1/APR-2).
- **Enterprise identity:** **ADR-G-031** (Enterprise Foundation) — connector social-identity RBAC, fail-CLOSED, tenant-scoped (absorbs old ADR-092); **ADR-G-020** (Authority, Roles, Flow & Enforcement) for the approval/authority contract.
- **Surface parity:** **ADR-G-011** (Surface Parity & Thin-Wrapper) — bot tool-surface ≡ CLI ≡ MCP ≡ terminal.
- **Wiring contracts:** WIRE-001 (`NotificationAdapter` notify dispatcher), BOT-1 (humanized bot-agent), BOT-2d (bounded chat history).
- **Born work-items:** MSG-1 (integration layer), APR-2 (multi-channel approval relay), MSG-3 (WhatsApp wire — incl. `notify_connectors` config-type so whatsapp is first-class = CONNECTOR-CONFIG-TYPE), PAIRING-AUTH (onCallback + hard-auth gate), BOT-TOOL-SURFACE (cost/usage/kpi + group-button approval), CONNECTOR-PLATFORM-REGISTRY (zero-core-change platform registry under MSG-1), SECRET-INLINE-ENFORCE (fail-closed schema rejection of inline tokens).
- **Direction:** memory `project_messaging_gateway_rearch` (gateway in main, build+T9 pending, ⚠️ auth-gate-less — do not expose publicly), `project_bot_tool_surface_and_group_buttons`, `feedback_telegram_rich_approval_bot`; `.analysis/hermes-vs-deckent-direction-decisions.md` (runtime-wide ApprovalBroker = P0).


---

## adr-g-008: Provider Abstraction, Fleet & Native-Usage

**Status:** accepted

# ADR-G-008: Provider Abstraction, Fleet & Native-Usage

**Class:** ADR-G (Global / Constitution) · **Scope:** global+project · **Immutable:** yes · **Source:** publisher · **Enforcement:** today=provider-free across backends (`getProviderForModel` SSOT resolver; 3 CLI-subscription + N HTTP-API via one `OpenAICompatibleAdapter` + local Ollama) + leak-free subscription↔API auth-precedence + provider-native real token/cost (`session-usage-store`, real cacheCreation) → tomorrow=provider-agnostic failover Brain (ADR-G-025; Claude→GPT/Codex lossless) + `?? 'claude'` default-drift consolidation (ADR-066-W) + subscription→API overflow wire (F1-010) + Codex/Gemini native-usage phase-2 + subscription-package & opt-in hosted-core (PROV-SUBS · PROV-FC)
**Status:** accepted · **Date:** 2026-06-30 · **Absorbs:** ADR-017 (MCP-Native Provider Adapters) + ADR-066 (Provider Independence) + ADR-077 (8-Fleet OpenAI-Compatible) + ADR-093 (Real Token/Cost Capture) + ADR-076 Part-A (Auth-Precedence) + ADR-078 Part-B (8-provider bootstrap/overflow)
**Crosswalk:** 017 (+066+077+093+076A+078B) → ADR-G-008

---

## Context

deckent is **provider-free**: any provider (subscription-CLI or API or local) can run any task on any backend. The pieces accreted across sprints — MCP-native adapters (017), backend parity (066), an OpenAI-compatible HTTP adapter for the no-CLI fleet (077), real provider-native usage capture (093), the subscription↔API auth-precedence fix (076A), and 8-provider bootstrap/overflow (078B). The 2026-06-30 review unifies them into one provider law and connects it to Brain provider-failover (ADR-G-025).

---

## Decision (Today)

```xml
<provider-abstraction>
  <resolver>getProviderForModel (SSOT, in task-types.ts) — model → provider.</resolver>
  <backends>provider-free across subprocess / tmux / Docker (host-adapter for
    codex/gemini + per-provider OAuth mount; ollama host-route). Caveat: docker
    binary-resolution falls back to Claude for an unknown/unsupported model — legacy
    safety, honest-fail pending (PROVIDER-FREE-HARDEN / WM-5).</backends>
  <fleet>3 CLI-subscription (claude/codex/gemini) + N HTTP-API via one
    OpenAICompatibleAdapter (DeepSeek/Qwen/zhipu-GLM/Mistral/Groq — same /chat/completions) +
    local Ollama + Bedrock (AWS-creds-gated, F1-015). ProviderName is open at RUNTIME
    (validateProviderName + a string-keyed adapter Map); the TS type is still a closed
    union ('claude'|'codex'|'gemini'|'ollama') — type-level open-id migration pending
    (PROVIDER-NAME-TYPE). Mixed-fleet dogfood-proven (Sprint 249: 15 tasks / 4 real
    providers).</fleet>
  <auth-precedence>subscription mode → ANTHROPIC_API_KEY NOT forwarded into the
    container (~/.claude session mount instead); API mode forwards. No cross-provider
    credential leak. (Ends the `env -u ANTHROPIC_API_KEY` workaround.)</auth-precedence>
  <native-usage>session-usage-store reads the provider's own per-turn usage
    (~/.claude/projects/*.jsonl) → REAL cacheCreationTokens (the limit-dominant cost
    component, previously always 0); TokenUsage.source ∈ {session-store, envelope,
    estimate}; priority chain session-store → envelope → estimate. (sessionRoot injectable
    = test-hermetic; the real ~/.claude is never read in tests.)</native-usage>
</provider-abstraction>
```

3rd-party-API providers (DeepSeek/Qwen/GLM) are separate accounts/keys — they do **not** violate the Anthropic-Tier-1-API beta deferral (which applies to Anthropic API only).

---

## Intent / Roadmap (Tomorrow)

- **Brain provider-failover + lossless self-update** (ADR-G-025): the Brain itself fails over Claude→OpenAI/Codex losslessly; the adapter abstraction is what makes a provider-agnostic Brain possible (today Claude-Brain, tomorrow GPT-5.5-Brain).
- **ADR-066-W:** `?? 'claude'` default-provider drift → consolidate to `getDefaultProviderName()`. **Measured by grep, not a fixed number** (current audit: ~8 textual matches → ~3 genuine provider-default-drift in `model-tier-guard.ts:186` / `provider.ts:1193` / `config.ts:107`; the rest are the canonical `getDefaultProviderName` impl, a guidance comment, and legitimate CLI-binary defaults `binary ?? 'claude'`). Consolidate the real-drift set (contract: ≤3, justified). (WM-5 provider-free hard-enforce family.)
- **Subscription→API overflow (F1-010):** `resolveWithOverflow` is **wired** — the pre-spawn overflow gate (`provider-overflow-gate.ts`) delegates to it (flag-gated, default-off) and the reactive 429/FIX failover path uses it. The remaining work is graduating the flag to a **live rate-limit signal** (today no live signal drives it), not the initial wire.
- **Native-usage phase-2:** Claude reads its native session-store today (real cacheCreation); Codex/Gemini use adapter envelope parsers today, with their own session-stores as phase-2 (today `null`→estimate fallback; honest seam).
- **Subscription-package support** (PROV-SUBS) + **opt-in hosted-deckent-core** as an *optional* provider (ADR-G-016: BYO default, hosted never required) + first-class cost/limit/notify/fallback (PROV-FC).

---

## Consequences

**(+)** True provider-freedom: any subscription/API/local provider, any backend, with accurate provider-native cost (real cacheCreation) and leak-free auth-precedence. The abstraction enables a provider-agnostic, failover-capable Brain. 3rd-party cost advantage (DeepSeek ~1/30th) accessible.

**(−)** Overflow is wired but lacks a **live rate-limit signal** (born F1-010); the `?? 'claude'` default-provider drift (~3 real sites by grep) awaits consolidation (born ADR-066-W); the TS `ProviderName` type is still a closed union (PROVIDER-NAME-TYPE); docker binary-resolution Claude-fallback on an unknown model is a known caveat (PROVIDER-FREE-HARDEN); Codex/Gemini native-usage is phase-2 (estimate fallback today). Hosted-core/subs-package are roadmap.

---

## References / Absorbed

- **Absorbs:** ADR-017 + ADR-066 + ADR-077 + ADR-093 + ADR-076-A + ADR-078-B.
- **Cross-ref:** ADR-G-025 (Brain failover/self-update) · ADR-G-006 (routing/model-selection) · ADR-G-012 (tiers) · ADR-G-014 (backends) · ADR-G-005 (.deck per-provider keys) · ADR-D-002 (test-hermeticity for sessionRoot) · F1-TOK/F1-CB (cost ledger).
- **Born:** ADR-066-W (`?? 'claude'` grep-audit consolidate) · F1-010 (overflow **live rate-limit signal**) · PROVIDER-NAME-TYPE (type-level open-id migration) · PROVIDER-FREE-HARDEN (docker unknown-provider honest-fail) · native-usage-phase-2 · PROV-FC · PROV-SUBS.
- **Memory:** `project_deckent_runtime_ecosystem` · `project_api_mode_deferred_post_beta` · `feedback_container_auth_precedence`.


---

## adr-g-009: Evaluation Integrity (Language-Agnostic Verify · Coverage-Exemption · Proof-of-Function)

**Status:** accepted

# ADR-G-009: Evaluation Integrity (Language-Agnostic Verify · Coverage-Exemption · Proof-of-Function)

**Class:** ADR-G (Global / Constitution) · **Scope:** global+project · **Immutable:** yes · **Source:** publisher · **Enforcement:** today=language-agnostic verify (TaskKind×TechStack criteria-deriver) + signal-based coverage-exemption (disk-derived, agent-independent, deterministic) + zero-hardcode (live-registry authoritative) + proof-of-function Tier-1 run-verify gate (`Smoke:` real-binary; mock-only=GO_WITH_TECH_DEBT, never DONE) — "wired ≠ working" → tomorrow=hard-enforce A9/A14 via ADR-G-020 flag-gated vein at GA-V2 + more stacks in the deriver (Law #2) + deeper signal-based eval (WM-7: language-mismatch-penalty, stack-aware coverage) + cross-verify (XVER-1)
**Status:** accepted · **Date:** 2026-06-30 · **Absorbs:** ADR-019 (Language-Agnostic Worker Verify) + ADR-070 (Brain Evaluation Integrity) + ADR-079 (Proof-of-Function DoD)
**Crosswalk:** 019 (+070+079) → ADR-G-009

> **Moat note:** Honest, real evaluation is a core deckent differentiator. This ADR makes evaluation language-agnostic, gaming-proof, and run-verified — the "wired ≠ working" law.

---

## Context

Evaluation must judge work **honestly and for real**, across any language, without false NO_GO or hollow DONE. Three problems were solved across sprints: (019) a single code-rubric falsely failed audit/doc tasks and assumed a TS toolchain on non-TS stacks; (070) an agent-name allowlist produced false-FIX cascades and stale hardcoded model IDs leaked into cost output; (079) a mocked unit test stamped DONE on a `serve` that was actually 401-broken ("hollow DONE"). The 2026-06-30 review unifies these into one evaluation-integrity law.

---

## Decision (Today)

```xml
<evaluation-integrity>
  <language-agnostic>verify criteria derived by task-kind × tech-stack (WM-7
    criteria-deriver): a C++ project is NOT held to `tsc`-clean; coverage is required
    only on COVERAGE_MEASURABLE_STACKS. doc→files-on-disk, audit→findings,
    code→detected-stack commands.</language-agnostic>
  <coverage-exemption signal-based="true">if a worker changed a test file
    (.test.*/.spec.*) coverage is optional — AGENT-INDEPENDENT + idempotent +
    deterministic (derived from result.filesChanged, disk ground-truth). Signal-based is
    the canonical/primary path; a transitional agent-allowlist bridge
    (COVERAGE_OPTIONAL_AGENTS, P0-2: refactorer/code-reviewer) still remains, checked
    first (070 false-FIX root → COVERAGE-BRIDGE-RETIRE).</coverage-exemption>
  <zero-hard-code>any string a running deckent can derive from live data MUST NOT be
    hardcoded — model IDs read from the live registry (bundled snapshot = offline
    fallback only); no stale `claude-opus-4-6` in cost/status output. Scope = user-facing
    cost/status OUTPUT (display labels derived from the live registry); test fixtures,
    backward aliases, and the pricing-baseline snapshot are excluded — not a repo-wide
    literal ban.</zero-hard-code>
  <proof-of-function>isUserSurfaceTask (Tier-1) = touches src/cli/commands/ |
    src/dashboard/ | src/api/ (orthogonal to TaskType). Tier-1 DoD = Tier-0 +
    a recorded REAL-BINARY run via the `Smoke:` directive. A mocked unit test alone =
    GO_WITH_TECH_DEBT, never DONE. The verify module (proof-of-function.ts, async spawn,
    host-side) runs the smoke + returns failed/passed/no-op; the EVALUATE phase
    (sprint-phases.ts) applies the DONE→GO_WTD downgrade + emits PROOF_OF_FUNCTION_MISMATCH
    (applyProofOfFunctionGate = the reusable helper form).
    Surface-aware routing prefers api-builder/frontend-designer/ci-guardian.</proof-of-function>
</evaluation-integrity>
```

The "wired ≠ working" principle is permanent: structural/disk proof (Tier-0) is insufficient for user surfaces; only a real-binary run closes a Tier-1 task.

---

## Intent / Roadmap (Tomorrow)

- **Hard-enforce path** via ADR-G-020's flag-gated vein: A9 (ADR-compliance — permanently fail-open by design) + A14 (tech-debt-ratio downgrade) graduate from dogfood-flag to default at GA-V2.
- **More stacks** in the language-agnostic deriver (the stack matrix grows with provider/environment expansion — Law #2).
- **Deeper signal-based eval** (WM-7 extensions: language-mismatch-penalty, stack-aware coverage) — "measurement-gap ≠ quality-failure" generalized.
- **Cross-verify** (XVER-1): different-provider adversarial verification feeding evaluation as an advisory signal.

---

## Consequences

**(+)** Evaluation is honest across languages, gaming-proof (signal/disk-derived, not agent-name), zero-hardcode, and run-verified for user surfaces. Hollow-DONE is structurally impossible for a Tier-1 task **that carries a valid `Smoke:`** (an absent `Smoke:` is a no-op today — see below). False-NO_GO on doc/audit/non-TS tasks eliminated.

**(−)** Tier-1 gate adds EVALUATE latency (only when `Smoke:` present; absent → no-op, **not fail-closed**) — workers may forget the `Smoke:` line (anchored in worker rules + FIX-phase pressure; fail-closed Smoke-required is SMOKE-REQUIRED-ENFORCE). The coverage-exemption still keeps a transitional agent-allowlist bridge alongside the signal path (COVERAGE-BRIDGE-RETIRE). Hard-enforcement of A9/A14 is roadmap (today the vein is dogfood-flag).

---

## References / Absorbed

- **Absorbs:** ADR-019 + ADR-070 + ADR-079.
- **Cross-ref:** ADR-G-028 (Work Taxonomy — TaskKind×TechStack, the deriver inputs) · ADR-G-020 (enforcement vein A9/A14) · ADR-G-006 (surface-aware routing) · ADR-G-018 (verification protocol channels) · ADR-G-025 (worker-live-trace / observability).
- **Born / MASTER-PLAN:** WM-7 (criteria-deriver) · XVER-1 (cross-verify) · COVERAGE-BRIDGE-RETIRE (retire `COVERAGE_OPTIONAL_AGENTS` once signal-path proven) · SMOKE-REQUIRED-ENFORCE (fail-closed Smoke for Tier-1 vs today's no-op) · zero-hardcode (`feedback_zero_hardcode_live_data`).
- **Memory:** `feedback_proof_of_function_dod` · `feedback_zero_hardcode_live_data`.


---

## adr-g-010: Output, Terminal-UX & Brand

**Status:** accepted

# ADR-G-010: Output, Terminal-UX & Brand

**Class:** ADR-G (Global / Constitution) · **Scope:** global+project · **Immutable:** yes · **Source:** publisher · **Enforcement:** today=rich multi-section output modules (`sprint-retro-writer.ts` / `sprint-docs-updater.ts`) + `NO_COLOR` honored + fixed `KRAKEN_ASCII` brand const (`splash.ts`) → tomorrow=terminal concise/live (TERM-LIVE) + dashboard rich-detail (ADR-G-033) + `output_splash` gate-description-align + init/version decision (ADR-021-W)
**Status:** accepted · **Date:** 2026-06-30 · **Absorbs:** ADR-020 (Rich Sprint Output — multi-section), ADR-021 (Kraken ASCII Brand Identity) · **Supersedes:** —
**Crosswalk:** ADR-020 + ADR-021 → ADR-G-010

---

## Context

First impressions and run-readability are product surfaces, not internal plumbing. Two early decisions converged here:

- **ADR-020 (Rich Sprint Output):** sprint output was a single-line metric — a user could not see how many tasks completed, which files changed, or what was learned. The fix: rich, multi-section output with ANSI color + `NO_COLOR` support.
- **ADR-021 (Kraken ASCII Brand Identity):** deckent had no visual identity; in a CLI tool the first impression matters. The fix: a Kraken ASCII mascot + brand palette. The Sprint-281 re-audit classified this **user-product** (brand = the product's first impression).

Both are **ADR-G** (Global / Constitution): they define how *every user* reads deckent's output and sees its brand on every surface. The 2026-06-30 review merged them as "Output, Terminal-UX & Brand" and aligned them with the terminal-center pivot (terminal = concise/live, dashboard = rich detail).

> Note: ADR-083 ("Output & Terminal UX") was flagged a merge-candidate for ADR-020; the final taxonomy routed ADR-083 into ADR-G-033 (Dashboard, `083D`) and ADR-G-034 (Native Agentic Terminal). ADR-G-010 therefore absorbs only ADR-020 + ADR-021 and cross-references those two for the surface evolution.

---

## Decision (Today)

### A. Rich multi-section output

Sprint output is **rich + multi-section** (not a single-line metric), with ANSI color and **`NO_COLOR`** env-var support for CI-friendly plain text. The original "7-section" list is **stale**; the concrete current structure is:

```xml
<output-structure>
  <doc path=".brain/sprints/RETRO.md" writer="src/orchestra/sprint-retro-writer.ts">
    rich multi-section — Summary · Highlights · Issues · Metrics · Agent/Skill
    Performance · Token Usage · KPI Scorecard · Quality Dimensions · Learnings ·
    Next-Sprint Behavior Changes (count NOT pinned — canonical = the writer module;
    sections emitted only when non-empty; Memory-V2 DB-first, .md is the export).
  </doc>
  <doc path=".brain/sprints/sprint-NNN.md" writer="src/orchestra/sprint-docs-helpers.ts (buildSprintLogLines)">
    "# {sprint.id}" → "## Metrics" (table) → "## Agents" → "## Tasks" → optional
    "## Notes" (NOT a per-task "## Task {id} / ### Description" structure).
  </doc>
  <canonical>the modules above + `deckent retro` / `deckent history` output.</canonical>
</output-structure>
```

### B. Kraken brand identity

```xml
<brand-identity source="src/cli/helpers/splash.ts">
  <ascii const="KRAKEN_ASCII" generated="false"/>   <!-- fixed const, not runtime-generated -->
  <color name="TEAL"      body     ansi="\x1b[38;2;77;184;164m"   hex="#4DB8A4"/>
  <color name="BOLD_GOLD" wordmark ansi="\x1b[1;38;2;196;168;85m" hex="#C4A855"/>  <!-- "DECKENT" -->
  <tagline dim="true">AI Agent Orchestrator</tagline>             <!-- + version, dim -->
  <no-color>NOT skipped — showSplash() returns the PLAIN-TEXT splash
            (Kraken + "DECKENT v<ver>" + tagline, no ANSI). No CI env-var handling.</no-color>
</brand-identity>
```

### C. Visibility gate (real for sprint-start; init/version ungated)

`config.output_splash` **is a real gate** for the sprint-start splash: `sprint-phases.ts` (`runPlanPhase`) calls **`showSplashIfEnabled(config, DECKENT_VERSION)`** — toggling `output_splash` *does* change it. **But two entry points are ungated:** `deckent --version` (`index.ts`) and `deckent init` (`init.ts`) call `showSplash()` **directly**, so they show regardless of the knob. The drift is in the *description*: the config/dashboard text frames `output_splash` around "init/version", while the runtime gate is on sprint-start. **ADR-021-W** = align the config-description to the real behavior (it gates the sprint-start splash) + decide whether `--version`/`init` should also honor it (today: deliberately ungated brand-first-impression, or wire them).

---

## Intent / Roadmap (Tomorrow)

- **Surface split (pivot-aligned):** **terminal = concise / live summary** — the TERM-LIVE run-status footer (what's running / where / approval? / next / risk; fed by ADR-G-025 worker-live-trace); **dashboard = rich detail** — the full per-task results, changes, and metrics move to ADR-G-033 (Dashboard observability surface). The rich-multi-section content migrates to the dashboard; the terminal carries a tight live status, not a wall of text. (Partially implemented already: `status --follow`, the status-line, and `output_mode=quiet` exist; the rich-terminal-finalizer → dashboard split is the open work.)
- **`output_splash` real-gate-or-remove (ADR-021-W / DORMANT-2):** either wire `sprint-phases` to `showSplashIfEnabled` (a real gate, with the dashboard ConfigPage surface aligned) or remove the knob from the schema — settings honesty (no no-op config knobs).
- **Brand carried cross-surface:** the Kraken identity extends consistently to dashboard / native terminal / desktop (one brand, all surfaces).

---

## Consequences

**(+)** Users get the full picture of a run, brand recognition from the first invocation, and clean CI output via `NO_COLOR`. The merge unifies output + brand under one terminal-UX law. The today+tomorrow split keeps the pivot (terminal concise, dashboard rich) explicit so agents and contributors build toward it.

**(−)** `output_splash` gates the sprint-start splash but `--version`/`init` are ungated, and the config-description still frames it as "init/version" — a description↔behavior drift (ADR-021-W); the section set is not a fixed count (canonical = the writer modules, retro under-counted "5" before). The terminal/dashboard split is roadmap — today the rich output still lands largely in the terminal/files, not yet routed to the dashboard.

---

## References / Absorbed

- **Absorbs:** ADR-020 (Rich Sprint Output — multi-section), ADR-021 (Kraken ASCII Brand Identity).
- **Surface partners:** ADR-G-033 (Dashboard — rich detail; absorbed `083D`), ADR-G-034 (Native Agentic Terminal — absorbed ADR-083 REPL-UX), ADR-G-025 (Process Resilience & Live Observability — TERM-LIVE / worker-live-trace).
- **Parity:** ADR-G-011 (Surface Parity & Thin-Wrapper — output consistent across CLI/MCP/terminal).
- **Born work-items:** ADR-021-W (`output_splash` real-gate-or-remove = DORMANT-2, MASTER-PLAN P1), TERM-LIVE (live run-status footer, P0).
- **Direction:** `.analysis/adr-review-crosswalk.md` (rows 020/021 → ADR-G-010), `.analysis/hermes-vs-deckent-direction-decisions.md` (terminal-center pivot).


---

## adr-g-011: Surface Parity & Thin-Wrapper

**Status:** accepted

# ADR-G-011: Surface Parity & Thin-Wrapper

**Class:** ADR-G (Global / Constitution) · **Scope:** global+project · **Immutable:** yes · **Source:** publisher · **Enforcement:** today=shared core (`src/core/` · `src/orchestra/`) + CLI/MCP wrappers (thin-INTENT; start/status/watch still carry logic → LAYER-1) + semantic parity + auto-generated parity refs (`docs/reference/cli.md` · `mcp-tools.md`; `cli-commands.md` hand-maintained/stale) → tomorrow=CLI≡MCP≡terminal/tool parity + LAYER-1 structural enforcement + WATCH-W backend-agnostic
**Status:** accepted · **Date:** 2026-06-30 · **Absorbs:** ADR-022 (CLI/MCP Feature Parity) · **Supersedes:** —
**Crosswalk:** ADR-022 → ADR-G-011

---

## Context

Users switching from the CLI to an MCP host (Claude Code, VS Code, JetBrains) experienced **feature loss** — capabilities reachable from the CLI were missing in MCP. Worse, CLI and MCP used **different code paths** (CLI called functions directly while MCP ran wrappers over HTTP/stdio), so the two surfaces could drift in behavior, not just in coverage. ADR-022 (Sprint 067 v1 → Sprint 085 v2) established **feature parity + thin-wrapper**: one core, surfaces are thin.

The 2026-06-30 review confirmed this as **ADR-G** (Global / Constitution — "critical support" law): the same capability must be reachable over the same core from every surface. It then extended the law to the terminal-center pivot (CLI ≡ MCP ≡ terminal/tool).

---

## Decision (Today)

### 1. CLI ≡ MCP over one core

Every MCP tool has a CLI counterpart; **there are no MCP-only commands.** Shared business logic lives in `src/core/` or `src/orchestra/`; the CLI (`register<Name>(program)`) and MCP (`server.registerTool()`) call the same core. **Parity is *semantic*, not 1:1 schema** — surface-specific params are allowed (e.g. MCP `deckent_start` takes `acknowledgeCost`/`dryRun`/`sandbox` while CLI `start` has `--auto-approve`/`--sandbox-mode`/`--force`). The **thin-wrapper is the INTENT, not yet fully true today**: `start`/`status`/`watch` wrappers still carry business logic (MCP `start` does `fork` + orphan-cleanup + cost-gate) — which is exactly why LAYER-1 structural enforcement (below) is still needed.

### 2. Intentional CLI-only (infra / UI / setup)

These are infrastructure/terminal operations, deliberately kept CLI-only:

```xml
<cli-only reason="infrastructure / interface / setup — not core capability">
  <group kind="infra">attach · spawn</group>           <!-- tmux session mgmt -->
  <group kind="server-ui">dashboard · web · serve</group> <!-- interface launch -->
  <group kind="setup">upgrade · onboard</group>          <!-- setup wizards -->
  <group kind="plugin">plugin install · plugin list · plugin create</group>
  <group kind="terminal-interactive">chat · bot · gateway · mcp · image · resources</group>
  <group kind="local-op">flow · rbac · evolve · mode · resume · heartbeat · finalize · test</group>
  <note>This static list is INCOMPLETE and drift-prone — the real CLI-only set is ~24
    (buildProgram registers them). It must become generated/explicit (CLI-ONLY-GENERATED),
    with an ALIAS-MAP for non-1:1 names (memory/remember/recall ↔ deckent_memory_query,
    features ↔ deckent_feature_query) so they are not mis-flagged as CLI-only.</note>
</cli-only>
```

### 3. `watch` is NOT CLI-only (2026-06-11 correction)

`deckent_watch` MCP already exists, but CLI `watch` (tmux-split) and MCP `deckent_watch` (event-stream subscribe) **semantically diverged** = a parity violation. Per this ADR they must be **unified** and made **backend-agnostic** (observe the worker wherever it runs — ADR-G-014, which absorbed ADR-089). Work-item: **WATCH-W**.

### 4. Counts are not load-bearing

The Sprint-085 parity counts ("19 MCP = 19 CLI", "MCP 16→19", "CLI 32→33") are **stale snapshots**. The principle stands; canonical counts are **auto-generated** — `docs/reference/cli.md` + `docs/reference/mcp-tools.md` via `npm run docs:ref`. **Caveat:** `docs/reference/cli-commands.md` is a *hand-maintained* parity table and is currently **stale** — it marks `watch`/`cost`/`recover`/`kpi`/`process` as "CLI only" although their MCP tools (`deckent_watch`/`_cost`/`_recover`/`_kpi`/`_process`) exist. It must be generated or marked non-canonical (CLI-COMMANDS-DOC-SYNC).

---

## Intent / Roadmap (Tomorrow)

- **CLI ≡ MCP ≡ terminal/tool:** as the native agentic terminal (ADR-G-034) becomes the primary management+usage surface and tool-driven invocation grows, parity **extends** — the same capability is reachable from CLI, MCP, the terminal, and tool-calls, all thin over one core. The dashboard remains **observe-only** (no command-execution divergence — ADR-G-033).
- **LAYER-1 structural enforcement:** the `core→cli/orchestra` import-inversion cleanup (CORE-W1 + ORCH-W1 + API-W1 + ADR-008-W) — logic lives in core, every surface stays thin; enforced **structurally** so a wrapper cannot accrete business logic. (MASTER-PLAN: LAYER-1.) The parity check today is `scripts/lint-cli-mcp-parity.mjs` — **report-only (always exits 0, never blocks CI)**; PARITY-LINT-GATE graduates it to a real CI gate with the alias-map, so semantic parity is *enforced*, not merely reported.
- **WATCH-W backend-agnostic parity:** `watch` observes the worker wherever it runs (docker/subprocess/tmux/firecracker/cloud) with **one semantic** across CLI + MCP (ADR-G-014 Observation).

---

## Consequences

**(+)** A user can do anything from any surface; new capability is built **once** in core and surfaced thinly; auto-generated refs prevent count-drift. The thin-wrapper law is precisely what makes the terminal-center pivot cheap — the terminal is just one more thin surface over the same core.

**(−)** Two-or-more wrappers per capability raise the per-feature cost. The thin-wrapper discipline is enforced **structurally only as a roadmap item** (LAYER-1) — today `start`/`status`/`watch` wrappers do carry logic (caught at review, not blocked); the parity-lint is report-only (PARITY-LINT-GATE); the CLI-only list + `cli-commands.md` are hand-maintained and drift (CLI-ONLY-GENERATED / CLI-COMMANDS-DOC-SYNC). `watch` parity is an open divergence until WATCH-W lands.

---

## References / Absorbed

- **Absorbs:** ADR-022 (CLI/MCP Feature Parity — thin-wrapper, shared core, intentional CLI-only, `watch`-parity correction).
- **Surface partners:** ADR-G-034 (Native Agentic Terminal — primary surface), ADR-G-033 (Dashboard — observe-only), ADR-G-029 (Embedded Web Terminal), ADR-G-010 (Output, Terminal-UX & Brand — consistent output across surfaces).
- **Backend partner:** ADR-G-014 (Spawn Backend, Options & Observation — absorbed ADR-089 backend-agnostic watch; WATCH-W).
- **Structure substrate:** ADR-D-004 (Brain Central Import — one-way dependency) + ADR-D-006 (Code Architecture Conventions) — the import-direction LAYER-1 cleans.
- **Governance:** ADR-G-019 (taxonomy), ADR-G-020 (authority / enforcement).
- **Born work-items:** LAYER-1 (core→surface inversion cleanup, MASTER-PLAN P1), WATCH-W (backend-agnostic watch + CLI/MCP parity, P1), CLI-ONLY-GENERATED (generated/explicit CLI-only allowlist + alias-map), CLI-COMMANDS-DOC-SYNC (`cli-commands.md` generate-or-non-canonical), PARITY-LINT-GATE (`lint-cli-mcp-parity.mjs` report-only → CI gate + alias-map).
- **Direction:** `.analysis/adr-review-crosswalk.md` (row 022 → ADR-G-011), `.analysis/hermes-vs-deckent-direction-decisions.md` (terminal-center pivot).


---

## adr-g-012: Plan Tier & Config Customization

**Status:** accepted

# ADR-G-012: Plan Tier & Config Customization

**Class:** ADR-G (Global / Constitution) · **Scope:** global+project · **Immutable:** yes · **Source:** publisher · **Enforcement:** today=`config.ts` `VALID_MODES` provider-agnostic **plan-mode** set (`config.mode`; each maps to a model-tier strategy — economy/standard/premium/premium_plus) + `autoMigrateOnLoad` legacy-alias map (validated on load; persistent `config-migration.ts` map lacks `unlimited`) → tomorrow=common/standard + custom tier + NL-terminal customize-ALL-settings (ONB-CHAT), every config-knob real-in-code (honesty / zero-hardcode)
**Status:** accepted · **Date:** 2026-06-30 · **Absorbs:** ADR-023 (Plan Tier Generalizasyonu — Provider-Agnostic Tier İsimleri) · **Supersedes:** —
**Crosswalk:** ADR-023 → ADR-G-012

---

## Context

Plan tier names were Claude-specific — `max_plan`, `max5x_plan`, `pro_plan` — meaningless to Codex or Gemini users. A provider-agnostic CLI must not bake one provider's vocabulary into its core config surface. ADR-023 (Sprint 072) generalized the tier names and changed the init wizard from "Select your Claude plan" to "Select your plan," keeping legacy names as backward-compatible aliases.

A code-verification note corrected two details. **(1) Terminology:** these are **plan modes** (`config.mode`, type `PlanMode`), NOT *model tiers*. The canonical plan-mode set is `VALID_MODES = ['performance', 'balanced', 'economic', 'api']` (`src/core/config.ts`); each plan mode maps to a **model-tier strategy** (`brain_tier`/`worker_tier`/`min_tier`/`max_tier` ∈ `economy`/`standard`/`premium`/`premium_plus`, via `mode-presets.ts`). "Plan mode" and "model tier" are distinct axes — this ADR governs the plan-mode axis. **(2)** `unlimited` was **not** preserved as a standalone mode — it is remapped to `api`.

The 2026-06-30 review expanded the decision's scope from "rename tiers" to "**config customization as a first-class, honest surface**": provider-agnostic standard tiers PLUS a user-defined custom tier, customizable conversationally (NL-terminal / ONB-CHAT), under the hard rule that **every config-knob is real-in-code** — no dormant settings that look configurable but do nothing (DORMANT-2 honesty, zero-hardcode).

## Decision (Today)

### 1. Provider-agnostic plan-mode names
The canonical **plan-mode** set (`config.mode`) is `VALID_MODES = ['performance', 'balanced', 'economic', 'api']` (`src/core/config.ts`) — each maps to a model-tier strategy, it is not a tier itself:

| Plan mode | Meaning (→ model-tier strategy) |
|---|---|
| `performance` | highest quality, highest cost (was `max_plan`) |
| `balanced` | quality/cost balance (was `max5x_plan`) |
| `economic` | low cost, basic tasks (was `pro_plan`) |
| `api` | metered API usage (was `unlimited`, remapped — no standalone `unlimited` tier) |

### 2. Backward-compatible migration
`autoMigrateOnLoad` (`src/core/config.ts`) recognizes the legacy names as aliases (`max_plan→performance`, `max5x_plan→balanced`, `pro_plan→economic`, `unlimited→api`) and upgrades on read. **Gap:** the *persistent* migration map (`src/core/config-migration.ts`) covers only `max_plan`/`max5x_plan`/`pro_plan` — **not `unlimited`** — so `unlimited` is remapped at runtime but not durably rewritten to disk (CONFIG-MIGRATE-UNLIMITED). The init wizard reads "Select your plan" (provider-neutral). All docs use the new names.

### 3. Honest config surface (seed)
Tier selection is real-in-code: a chosen tier maps to actual model-equivalence behavior via the provider layer (ADR-G-008), not a cosmetic label. This is the seed of the broader config-customization honesty rule below.

## Intent / Roadmap (Tomorrow)

- **Common/standard + custom tiers.** Beyond the standard provider-agnostic set, users define their **own custom tier** (their own quality/cost/model mapping), so the tier system is a template, not a fixed enum — consistent for solo users and configurable for enterprises.
- **NL-terminal customize-ALL-settings (ONB-CHAT).** Every setting — tier included — is customizable conversationally from the native terminal (CONFIG-CUSTOMIZE / ONB-CHAT), prioritizing ease + consistency over hand-editing JSON. This is part of the terminal-as-primary-surface direction.
- **Every config-knob real-in-code (honesty / zero-hardcode).** A binding constraint: a setting that appears in config MUST have a genuine, live effect in code. No dormant/cosmetic knobs (DORMANT-2 honesty); no hardcoded value masquerading as configurable (zero-hardcode). Config customization is only trustworthy if every knob is wired.

## Consequences

**(+)** Provider-agnostic terminology serves Codex / Gemini / any-provider users equally; `autoMigrateOnLoad` makes the rename invisible to existing users; reframing as ADR-G binds tier/config customization to the honesty + zero-hardcode laws so a knob can never become a lie; the custom-tier + NL-customize direction makes config a first-class product surface, not an internal file.

**(−)** Today only the standard plan-mode set is live — `validateConfig` **rejects** any non-canonical `config.mode`, so custom modes + NL-terminal customize-all are roadmap (CONFIG-CUSTOMIZE / CFG-1), and a stale "custom mode fallback" line in `docs/reference/config-reference.md` must be corrected. The every-knob-real rule (DORMANT-2 honesty) is a standing audit obligation that regresses if not enforced continuously; the plan-mode→model-tier semantics depend on the provider layer (ADR-G-008), so the two evolve together.

## References / Absorbed

- **Absorbs:** ADR-023 (Plan Tier Generalizasyonu — provider-agnostic tier names, wizard rename, alias migration).
- **Implementation:** `src/core/config.ts` (`VALID_MODES`, `autoMigrateOnLoad`, legacy-alias map).
- **Born work-items:** CONFIG-CUSTOMIZE (common/standard + custom mode/tier + NL-terminal customize-ALL via ONB-CHAT + ease/consistency + every-knob-real-in-code), CFG-1, DORMANT-2 (config-knob honesty audit), CONFIG-MIGRATE-UNLIMITED (add `unlimited→api` to the persistent `config-migration.ts` map), CONFIG-REF-CUSTOM-FIX (correct the stale "custom mode fallback" in `config-reference.md`).
- **Cross-ref:** ADR-G-008 (Provider Abstraction, Fleet & Native-Usage — tier→model-equivalence resolution; original merge-candidate 066/077), ADR-G-001 (Layered Config & Scope), ADR-G-019 (ADR-AUTHORING-STD today+tomorrow framing), ADR-G-030 (Consent / Onboarding — ONB-CHAT NL-setup).
- **Direction:** terminal-as-primary-surface pivot (`.analysis/hermes-vs-deckent-direction-decisions.md`); `.analysis/adr-review-crosswalk.md` row 023.


---

## adr-g-013: Graceful Shutdown & Lifecycle

**Status:** accepted

# ADR-G-013: Graceful Shutdown & Lifecycle

**Class:** ADR-G (Global / Constitution) · **Scope:** global+project · **Immutable:** yes · **Source:** publisher · **Enforcement:** today=**SIGINT** handler (`entry.ts`; SIGTERM registered but runs no cleanup) → `interruptActiveSprint()` (task-level INTERRUPTED) + `killAllSessions()` (tmux) (`sprint-lifecycle.ts` · `tmux.ts`) + **normal-completion coordinator exit** (MOAT-2 ✅ 2026-07-01 — root cause = un-unref'd worker child handle; fix `child.unref()` + SIGTERM→SIGKILL escalation + timer-unref DiD; real-binary e2e proven) → tomorrow=mode-independent lifecycle + SIGTERM-CLEANUP + WORKER-PGID-TEARDOWN + ROLE-GUARD process-role teardown
**Status:** accepted (MOAT-2 ✅ 2026-07-01 — normal-completion linger root-caused [worker child handle, empirically verified] + subprocess fix landed, unit + real-binary-e2e proven; residuals WORKER-PGID-TEARDOWN [grandchild process-group] + SIGTERM-CLEANUP still open) · **Date:** 2026-06-30 (rev 2026-07-01) · **Absorbs:** ADR-025 (Graceful Shutdown Strategy) · **Supersedes:** —
**Crosswalk:** ADR-025 → ADR-G-013

> Note: the crosswalk flagged ADR-043 / ADR-044 as merge-candidates ("Lifecycle & Reliability"); the final taxonomy kept them **separate** as ADR-G-025 (Process Resilience, Recovery & Live Observability). ADR-G-013 absorbs **only ADR-025**; ADR-G-025 is the sibling lifecycle ADR (cross-referenced, not merged).

---

## Context

When a user hits Ctrl+C, or the process receives SIGINT, a running sprint used to terminate **abruptly** — workers exited without cleanup, task files were left half-written, tmux sessions kept running in the background, and `.tasks/` accrued stale heartbeat + lock files. ADR-025 (Sprint 076) extended the SIGINT handler to coordinate a graceful shutdown.

The 2026-06-30 review confirmed this as **ADR-G** (Global / Constitution): clean teardown is a runtime lifecycle law every user relies on — an orphaned process or a half-written task directory is a trust violation. The review tied it to the live MOAT bugs (orphan coordinator) and to mode-independence (the same guarantee across every mode, not just sprint).

---

## Decision (Today)

**SIGINT graceful shutdown** — the `entry.ts` SIGINT handler runs, in order:

```xml
<sigint-shutdown handler="src/cli/entry.ts">
  <step n="1" fn="interruptActiveSprint()" module="src/orchestra/sprint-lifecycle.ts">
    coordinates graceful shutdown of the active sprint:
    marks tasks INTERRUPTED · aborts heartbeat · releases locks · kills workers.
  </step>
  <step n="2" fn="killAllSessions()" module="src/orchestra/tmux.ts">
    cleans all tmux sessions ("Called on SIGINT for graceful shutdown").
  </step>
  <order>task-state save FIRST (each in-progress task JSON → INTERRUPTED + heartbeat
    ABORTED; there is NO sprint-level sprint-state.json persist today), then session kill.</order>
</sigint-shutdown>
```

**Result:** a clean state after Ctrl+C. The sprint's tasks are marked **INTERRUPTED** (`deckent review` surfaces it); workers are terminated **per-backend** (docker: `docker stop --time` graceful; tmux: window/session kill — not a uniform explicit SIGTERM); `deckent cleanup` leaves no orphan files. **Scope:** this runs on **SIGINT only** — `entry.ts` registers a SIGTERM handler too, but it does **not** run `interruptActiveSprint`/`killAllSessions` (the cleanup is `if (signal === 'SIGINT')`-guarded — SIGTERM-CLEANUP).

**Companion:** `killAllWorkers()` / `killAllSessions()` (`tmux.ts`) are **tmux-scoped** (`tmux kill-session`). Subprocess/docker teardown does **not** come from these — it flows via `interruptActiveSprint()` calling the active **SpawnBackend's** own kill path. Uniform backend-agnostic worker-kill is the ADR-G-014 / ROLE-GUARD roadmap.

---

## Intent / Roadmap (Tomorrow)

- **ORPHAN-START-PROC fix (MOAT-2) — ✅ DONE (2026-07-01, subprocess backend; real-binary e2e proven):** the normal-completion linger (sprint-333 ~27min) was **root-caused, empirically**. The dominant loop-anchor is the **worker child process handle**, NOT a timer: a `child_process.spawn` without `detached`/`unref` keeps the parent's event loop alive until the child exits (Node: `child.unref()` "allow[s] the parent to exit independently of the child"), and the sprint keys completion on the `.result` FILE — so a worker that writes its result while its process lingers pins the coordinator for the child's whole lifetime (repro: same-stdio child ⇒ parent waits its full runtime; `child.unref()` ⇒ parent drains in ~3ms). The heartbeat `setInterval` was a *secondary* anchor. **Fix:** (1) PRIMARY — `child.unref()` after spawn (safe: the EXECUTE result-poll keeps the loop alive mid-sprint); (2) NO-ORPHAN — `killWithSignal` escalates a graceful SIGTERM→SIGKILL after a short unref'd grace, cleared on exit (mirrors docker's `docker stop --time`); (3) DEFENSE-IN-DEPTH — `.unref()` the heartbeat + kill-timeout timers + reap the interval in `kill()`; (4) sprint-controller `snapshotInterval` + the sprint's `scanInterval` unref'd (standalone `deckent audit` stays ref'd) + a debug-gated `process.getActiveResourcesInfo()` at `runSprint` exit as permanent "unref'd-handle audit" observability. **tmux** workers are detached (no coordinator child-handle); **docker** uses a `docker wait` child bounded by the container's `timeout $TIMEOUT` + cleanup docker-stop (same handle class — plausibly bounded, *not verified as a proven difference*). The finalize-time SIGTERM (334-003) remains a defence-in-depth layer, not superseded. **Proof (unit + real-binary):** `tests/providers/subprocess-moat2-linger.test.ts` (8 tests: `child.unref()` called + SIGKILL escalation + timer `hasRef()===false`) + two real-binary e2e smokes against the built `dist`: (a) a real `SubprocessSpawnBackend` with a live `sleep 12` worker → the coordinator process **exits in ~4ms** (`activeResources=[]`), no linger; (b) a SIGTERM-ignoring direct worker (pidfile-exact) is **SIGKILL-reaped in ~2s**, no orphan. **Honest residual (born):** the SIGKILL escalation kills the *direct* worker but NOT its grandchildren — a worker that spawns its own subprocess (e.g. claude's bash tool) can orphan the grandchild because we kill by single PID, not process group (`WORKER-PGID-TEARDOWN`, ROLE-GUARD-adjacent: spawn `detached` + `kill(-pid)`; docker already solves this via container isolation). A full `deckent start` real-sprint exit-smoke that rules out any OTHER coordinator handle (notify-dispatcher / connector) is observable via the `getActiveResourcesInfo` diagnostic. (MASTER-PLAN: MOAT-2 ✅, P0.)
- **Mode-independent lifecycle:** graceful shutdown is **uniform across every mode** (sprint | task | process | autonomous | flow — ADR-G-024 Mode Architecture), not sprint-specific; each mode tears down its own workers / sessions / locks the same way.
- **ROLE-GUARD process-role teardown:** shutdown respects **process roles** (ADR-G-020 / ROLE-GUARD — Brain/orchestrator vs worker) so the correct role coordinates teardown and no role-process is orphaned; worker kill is **backend-agnostic** (subprocess/docker/tmux/firecracker) via ADR-G-014.

---

## Consequences

**(+)** Ctrl+C always leaves a clean state — INTERRUPTED sprint, released locks, no orphan tmux sessions; the per-worker variant covers non-tmux backends; `deckent review` surfaces the interruption honestly rather than presenting a silent half-run.

**(−)** Today the clean teardown runs **on SIGINT only** (SIGTERM is registered but its handler does not run the cleanup — SIGTERM-CLEANUP); interrupt is **task-level** (per-task JSON, no sprint-state.json persist); backend-agnostic worker-kill flows through the SpawnBackend, not `killAllWorkers` (tmux-scoped). The **normal-completion coordinator linger is fixed** for the subprocess backend (MOAT-2 ✅ 2026-07-01 — root cause = the un-unref'd worker child handle [empirically verified], fixed by `child.unref()` + SIGTERM→SIGKILL escalation + timer-unref DiD; proven by unit tests + two real-binary e2e smokes [~4ms coordinator exit despite a live child; SIGKILL reap of a signal-ignoring worker]). Residual: grandchild process-group teardown [`WORKER-PGID-TEARDOWN`]. Mode-independence and ROLE-GUARD process-role teardown are roadmap, so non-sprint modes do not yet share the identical lifecycle guarantees.

---

## References / Absorbed

- **Absorbs:** ADR-025 (Graceful Shutdown Strategy — SIGINT → `interruptActiveSprint()` + `killAllSessions()`; `killAllWorkers()` companion).
- **Sibling lifecycle ADR (cross-ref, not merged):** ADR-G-025 (Process Resilience, Recovery & Live Observability — absorbed ADR-043 Brain Crash Recovery + ADR-044 State Observability).
- **Mode partner:** ADR-G-024 (Mode Architecture — mode-independent lifecycle).
- **Backend partner:** ADR-G-014 (Spawn Backend, Options & Observation — backend-agnostic worker kill).
- **Authority partner:** ADR-G-020 (Authority, Roles, Flow & Enforcement — ROLE-GUARD process-role teardown).
- **Born work-items:** MOAT-2 (ORPHAN-START-PROC — normal-completion coordinator linger, MASTER-PLAN P0 — ✅ **done 2026-07-01**: root cause = un-unref'd worker child handle [empirically verified, NOT the timer]; `child.unref()` + SIGTERM→SIGKILL escalation + heartbeat/kill-timeout/`snapshotInterval`/`scanInterval` unref'd DiD + `getActiveResourcesInfo` debug audit; unit + real-binary e2e proven), **WORKER-PGID-TEARDOWN** (born — SIGKILL reaps the direct worker but not its grandchildren; spawn `detached` + `kill(-pid)` for full process-group teardown; ROLE-GUARD-adjacent), SIGTERM-CLEANUP (✅ done 2026-07-02, sprint-350-005 — SIGTERM now runs the SAME interrupt+session-kill cleanup path as SIGINT in entry.ts onSignal; test proves shared path without real signals).
- **Direction:** `.analysis/adr-review-crosswalk.md` (row 025 → ADR-G-013), `.analysis/hermes-vs-deckent-direction-decisions.md`.


---

## adr-g-014: Spawn Backend, Options & Observation

**Status:** accepted

# ADR-G-014: Spawn Backend, Options & Observation

**Class:** ADR-G (Global / Constitution) · **Scope:** global+project · **Immutable:** yes · **Source:** publisher · **Enforcement:** today=`SpawnBackendFactory` (auto = Windows→subprocess / else→docker; tmux deprecated; explicit-selection — **no fallback chain**) + per-task backend override + `SpawnOptions`/`ProviderSpawnOptions`/`SpawnBackendOptions` chain + `watch --follow` (docker `logs -f`) + auditor-in-process role-split red-line (scope advisory/soft per ADR-G-020) → tomorrow=firecracker/cloud/ollama-host backends + WATCH-W (CLI≡MCP unify) + per-worker backend declaration + WORKER-LIVE-TRACE
**Status:** accepted · **Date:** 2026-06-30 · **Absorbs:** ADR-027 (Hybrid Spawn Backend) + ADR-007 (SpawnOptions Interface) + ADR-089 (Backend-Agnostic Worker Observation) · **Supersedes:** —
**Crosswalk:** ADR-027 (+ ADR-007 fold + ADR-089 merge) → ADR-G-014

> **Note (ADR-D-003 vacancy):** old ADR-007 (SpawnOptions) was a dev-class candidate, but the spawn-options contract is inseparable from the backend it spawns onto — so it is **folded here** into the global spawn law. This is why the dev-class number **ADR-D-003 is intentionally vacant** (documented, not back-filled).

---

## Context

Three spawn-layer decisions, recorded separately, describe one cohesive concern — *how deckent launches a worker, with what options, and how that worker is observed wherever it runs*:

- **ADR-007 (2026-04-16)** defined `SpawnOptions { allowedTools?, autoApprove? }`: Brain computes an `--allowedTools` restriction from each worker's scope, and `autoApprove` adds the provider's permission-bypass flag.
- **ADR-027 (Sprint 123 → revisited Sprint 139)** addressed hybrid backends. Its original verdict — "hybrid backend permanently rejected, one backend at a time" — was **split** by the 2026-06-11 review: the *role-split* form ("worker in Docker + auditor as a separate subprocess") stays rejected, but the *single-backend-per-sprint* claim is **superseded** — per-task backend override is now live and heterogeneous per-worker backends are embraced.
- **ADR-089 (2026-06-11)** made `watch` **backend-agnostic** — observe a worker on whatever backend it actually runs — and flagged the CLI/MCP `watch` semantic divergence as a parity violation to remove.

The 2026-06-30 review merges all three into one ADR-G law (runtime behavior the product carries to every user), **preserving the role-mix red-line** while **embracing the heterogeneous-backend vision**.

---

## Decision (Today)

### 1. Hybrid spawn backend — `SpawnBackendFactory`

deckent spawns workers onto one of three backends through `SpawnBackendFactory`. **`auto` resolves deterministically — Windows → `subprocess`, otherwise → `docker`; `tmux` is deprecated (warns on use); any backend may be selected explicitly. There is NO docker→tmux→subprocess *fallback chain*:** `create()` instantiates the resolved backend, and `createAsync()` checks `isAvailable()` and **throws** if unavailable — it does not silently fall back to another backend. Each backend fully implements the `SpawnBackend` interface (E2E-covered, Sprint 139 Tasks 17–19); no backend is a partial citizen.

### 2. Per-worker / per-task independent backends

Backend selection is **per-worker, not per-sprint**. `sprint-spawner.ts` resolves an `effectiveBackend` per task — a `- Backend: docker|tmux|subprocess` directive (Sprint 252 PSL-1, mixed-fleet Sprint 248–254) overrides the run default, so different workers in the same run can execute on different backends. Heterogeneous fleets (some workers on tmux, some on docker) are first-class.

### 3. Role-mix red-line — PRESERVED (from ADR-027)

```xml
<role-mix-redline>
  <preserved>Brain is NEVER a worker; the Auditor runs IN-PROCESS (sprint-controller),
    independent of any spawn backend.</preserved>
  <rejected>Role-based backend-mixing — "worker in Docker + auditor as a SEPARATE
    subprocess" — remains rejected. The auditor needs no backend of its own.</rejected>
  <why>Cross-backend observability is solved by the append-only event-stream (ADR-G-018),
    NOT by giving each role its own backend. Per-WORKER heterogeneity (§2) is embraced;
    per-ROLE backend-split is not.</why>
</role-mix-redline>
```

### 4. SpawnOptions interface (folds ADR-007)

```xml
<spawn-options>
  <base>SpawnOptions { allowedTools?: string; autoApprove?: boolean }  (tmux module)</base>
  <chain>ProviderSpawnOptions (core/provider.ts) → SpawnBackendOptions extends
    ProviderSpawnOptions (orchestra/spawn-backend.ts) — multi-provider extension;
    allowedTools/autoApprove semantics UNCHANGED.</chain>
  <allowedTools>Brain computes the --allowedTools restriction from the worker's
    scope.filesWrite (sprint-spawner writeTargets → allowedTools).</allowedTools>
  <autoApprove>Maps to each provider's own permission-bypass flag, per-provider:
    claude --dangerously-skip-permissions · codex --dangerously-bypass-approvals-and-sandbox
    · gemini yolo. (Claude CLI rejects bypass as root → the docker backend runs host-user.)
    SECURITY (explicit): the Docker backend FORCES autoApprove:true (IMMUTABLE,
    spawn-backend-docker.ts) — a docker worker ALWAYS runs permission-bypassed, BY DESIGN:
    the container is the isolation boundary, so full autonomy is contained, not gated.
    Non-container backends honor the opts value. (ADR-G-020 authority context.)</autoApprove>
</spawn-options>
```

The array-args security invariant (ADR-G-002) is carried uniformly for the **outer backend spawn** (the `spawn`/`spawnSync` of the docker/tmux/subprocess process) — never re-derived per backend. **Caveat:** the *inner* worker command is assembled as a joined **string** (`provider-command-spec.ts` `parts.join(' ')`) from controlled parts (model · prompt-FILE path · flags — no untrusted interpolation), not array-args; tightening it is tracked under G-002's command-string concern (WORKER-CMD-ARRAY).

### 5. Backend-agnostic `watch` (folds ADR-089)

`deckent watch [worker]` observes a worker on **whatever backend it actually runs** — resolved per-worker from sprint/worker state, never hardwired to tmux:

```xml
<backend-agnostic-watch>
  <docker>docker logs -f  (watch --follow, WK-5 Sprint 279)</docker>
  <subprocess>stdout/stderr pipe stream</subprocess>
  <tmux>session attach</tmux>
  <roadmap>firecracker microVM / cloud log-API / ollama-host</roadmap>
  <resolution>TARGET: one observation core resolves worker → backend → stream.
    Today the watch path branches per-backend (docker vs heartbeat/log-tail vs tmux);
    backend-forcing flags (--docker / --tmux) select an explicit view. WATCH-W unifies it.
    Also: the observe-side `monitor-adapter` selects a CONFIG-level backend and its `auto`
    resolves to tmux — conflicting with the spawn-factory `auto`→docker; align-or-deprecate
    (BACKEND-AUTO-ALIGN).</resolution>
</backend-agnostic-watch>
```

### 6. CLI / MCP watch-parity — no semantic split

`deckent watch` (CLI) and `deckent_watch` (MCP) are the **same capability over the same core** (ADR-G-011 thin-wrapper). The current divergence — CLI `watch` = tmux-split vs MCP `deckent_watch` = event-stream subscribe — is a **parity violation to be removed** (work-item WATCH-W): one core resolves worker→backend→stream, and CLI + MCP are thin wrappers over it. A command does the same job on both surfaces.

---

## Intent / Roadmap (Tomorrow)

- **New backends (roadmap):** firecracker microVM, cloud, and ollama-host backends — so deckent scales from a laptop to a heterogeneous fleet. Each plugs in by implementing a **spawn adapter + an observe adapter**; no `watch`/orchestrator rewrite. (ADR-027's "revisit when distributed execution is needed" point has arrived; this is ORCH-BE.)
- **WATCH-W:** unify the CLI=tmux-split vs MCP=event-stream divergence into one backend-agnostic observation core with one semantic across CLI + MCP. (MASTER-PLAN: WATCH-W, P1.)
- **Per-worker backend declaration:** each worker/flow declares its own execution backend in the task spec; both the orchestrator (spawn) and the observation layer (watch) are backend-pluggable.
- **Ties WORKER-LIVE-TRACE (ADR-G-025):** the per-worker live progress-stream observes a worker on any backend, everywhere (terminal / CLI / MCP / dashboard), live or last-snapshot — `.log` tailing is insufficient.

---

## Consequences

**(+)** One spawn law spans launch + options + observation across a heterogeneous backend fleet; per-worker backends are embraced while the role-mix red-line (Brain≠worker, auditor in-process) holds; `watch` follows a worker onto any backend; the `SpawnOptions` contract and the array-args invariant are uniform across every backend. New backends are additive (an adapter pair), not a rewrite.

**(−)** `auto` is deterministic (no fallback chain) and `tmux` is deprecated; the Docker backend forces `autoApprove:true` (contained-by-container, but a docker worker always runs permission-bypassed). The array-args invariant is uniform for the outer spawn but the inner worker-command is a joined string of controlled parts (WORKER-CMD-ARRAY). The CLI/MCP `watch` semantic split is a live parity violation until WATCH-W lands, and the observe-side `monitor-adapter` `auto` disagrees with the spawn-factory `auto` (BACKEND-AUTO-ALIGN); firecracker/cloud/ollama-host backends are roadmap; per-worker backend declaration in the task spec is forward-looking. Scope/file-authority enforcement on each backend is advisory/soft today (ADR-G-020 V1.0).

---

## References / Absorbed

- **Absorbs:** ADR-027 (Hybrid Spawn Backend — role-split red-line preserved; single-backend-per-sprint superseded) · ADR-007 (SpawnOptions Interface — folded; **ADR-D-003 intentionally vacant**) · ADR-089 (Backend-Agnostic Worker Observation + per-worker independent backends + CLI/MCP watch-parity).
- **Cross-ref:** ADR-G-011 (Surface Parity & Thin-Wrapper — CLI≡MCP, WATCH-W) · ADR-G-018 (Verification Protocol & Event-Stream — cross-backend observability substrate) · ADR-G-020 (Authority, Roles, Flow & Enforcement — worktree/scope enforcement, autoApprove security) · ADR-G-025 (Process Resilience & Live Observability — WORKER-LIVE-TRACE) · ADR-G-002 (spawnSync Security Pattern — array-args invariant, uniform per backend) · ADR-G-008 (Provider Abstraction & Fleet — per-provider bypass flags).
- **Born work-items:** WATCH-W (backend-agnostic watch + CLI/MCP unify, P1) · ORCH-BE (firecracker/cloud/ollama-host backends + per-worker backend declaration) · WORKER-LIVE-TRACE (with ADR-G-025) · WORKER-CMD-ARRAY (inner worker-command string→array-args, G-002 family) · BACKEND-AUTO-ALIGN (`monitor-adapter` `auto` ↔ spawn-factory `auto`, under WATCH-W).
- **Direction:** `.analysis/adr-review-crosswalk.md` (rows 027 + 007 + 089 → ADR-G-014), `.analysis/hermes-vs-deckent-direction-decisions.md`.


---

## adr-g-015: Managed-Docs (Core-Gen) + Tracking / Staleness

**Status:** accepted

# ADR-G-015: Managed-Docs (Core-Gen) + Tracking / Staleness

**Class:** ADR-G (Global / Constitution) · **Scope:** global+project · **Immutable:** yes · **Source:** publisher · **Enforcement:** today=post-finalize self-update hook (ADR-046: UNCONDITIONAL · step-ordering adrInsert→ruleRegen→**deferred guarded memoryExport-last** · FS→DB sync wired, DB→FS reverse test-only) + DCR multi-signal doc-tracking scan (finalize-sync gated default-off) + code-derived module-count (`countModules`, zero-hardcode) — managed-set still includes the CLAUDE/AGENTS host-adapters (→ DOCS-PURE-ADAPTER) → tomorrow=MANAGED-DOCS-MINIMIZE (core-only minimal auto-gen + user-project track-not-write) + DECKENT-LOG (sprint-log→deckent-log multi-mode) + code-drift CI-gate generalized to user projects
**Status:** accepted (amendment — today split: wired self-update + tracking-scan vs migration-pending minimal-core-only / track-not-write / DB→FS-reverse / deckent-log) · **Date:** 2026-06-30 · **Absorbs:** ADR-029 (Managed-Docs Universalization) + ADR-030 (Template Engine + Plugin Loader) + ADR-031 (Content Hash Cache) + ADR-032 (i18n Pattern) + ADR-046 (Brain Self-Update Hook) + ADR-090 (Documentation Tracking & Staleness)
**Crosswalk:** 029 (+030+031+032+046+090) → ADR-G-015

> **Reframe note (Alperen, 2026-06-30):** deckent does NOT auto-write a user's project docs. In a user project, AI tools manage documentation; deckent only **tracks staleness** (DB-queryable: which docs are current, which lag the code). Auto-doc generation is **minimal and deckent-core-only**. The old "sprint-log" becomes **"deckent-log"** (multi-mode, not sprint-only).

---

## Context

deckent maintains a set of managed documents (CLAUDE.md auto-sections, IDENTITY, exports). The machinery (template engine, content-hash cache, i18n pattern, the post-finalize self-update hook with its step-ordering contract and FS↔DB bi-directional sync) was spread across ADR-029/030/031/032/046, and a separate doc-tracking/staleness system (DCR + multi-signal) arrived as ADR-090. The 2026-06-30 review unifies them and applies a key reframe: **minimize auto-generation, and never write a user's project docs — only track their staleness.**

---

## Decision (Today)

### 1. Core-gen — deckent-core-only, minimal (absorbs ADR-029 / ADR-030 / ADR-031 / ADR-032)

```xml
<core-gen scope="deckent-core (target: minimal)" mode="minimal-target">
  template-engine (ADR-030) + content-hash cache (ADR-031: fileHash+entryHash+sprintId,
  sprint-aware) + i18n pattern layer (ADR-032). TODAY docs.json manages ~11 docs:
  deckent-core (IDENTITY · TOOLS · BOOT · WORKER-GUIDE · VISION · blueprint · beta-tracker)
  PLUS the CLAUDE.md/AGENTS.md host-adapters — the latter must be removed (DOCS-PURE-ADAPTER,
  ADR-G-004 P0). "Minimal core-only" is the TARGET (MANAGED-DOCS-MINIMIZE), not yet the state.
</core-gen>
```

### 2. Self-update hook (absorbs ADR-046)

```xml
<self-update-hook>post-finalize hook (ADR-046), UNCONDITIONAL invocation, ground-truth
  verification. Real step-ordering: adrInsert → ruleRegen → guarded memoryExport LAST
  (runPostFinalizeHooks runs with skipMemoryExport:true so the guarded export runs AFTER,
  capturing the post-Step-3 ADR inserts — NOT memoryExport-first). FS↔DB sync is
  one-directional in production: syncAdrFilesToDb (FS→DB) is finalize-wired; exportAdrsToFs
  (DB→FS reverse) is an available helper called only in tests, not finalize-enforced
  (DB-FS-EXPORT-WIRE). This is the mechanism that makes the md+DB ADR-edit invariant safe
  (ADR-G-035).</self-update-hook>
```

### 3. Code-derived module-count — `countModules` (ADR-075 Part-C)

Managed-docs counts are **code-derived, never hardcoded** — the architecture-map module
table is generated live from the actual `src/` tree, so a doc count can never drift from
reality (zero-hardcode / live-data law):

```xml
<module-count source="src/orchestra/managed-docs/content-generators.ts">
  countModules(dir) counts live `.ts` modules per key dir (core · orchestra · agents ·
  nervous · monitor · connectors · providers · api · mcp · cli) → emits the managed-docs
  architecture module-count table from real file counts, never a hardcoded number.
  Companion code-derived counters: mcpToolCount, cliCommandCount (registration-source
  of truth). This is ADR-075 Part-C folded here (Parts A→ADR-G-032, B→ADR-G-006).
</module-count>
```

### 4. Doc tracking & staleness (absorbs ADR-090)

```xml
<tracking scope="all-repos incl. user-project">
  DCR (doc-rank, 0=most-critical) + body content-hash + last_updated + multi-signal
  stale (content-drift + age + code-drift) in a separate doc_tracking table
  (better-sqlite3, additive). CLI `deckent docs track scan|status|sync`; CI-gate
  (CRITICAL_STALE→non-zero); MCP/dashboard health. NOTE: the post-finalize doc-tracking
  sync is GATED on `doc_tracking.sync_on_finalize` (default-OFF) — distinct from the
  ADR-046 self-update hook above (which IS unconditional).
</tracking>
```

### 5. User-project = track-not-write

```xml
<user-project rule="track-not-write (target)">deckent's DIRECTION is to NOT auto-write
  project-specific docs — AI tools do; deckent tracks which are stale/current via the DB.
  Today the tracking subcommands are read/scan-only, but `docs run` / `docs add --auto`
  can still write managed-doc sections — full track-not-write is the active migration
  (MANAGED-DOCS-MINIMIZE), not yet enforced.</user-project>
```

### 6. deckent-log rename (multi-mode)

The "sprint-log" is **to be renamed "deckent-log"** spanning multiple modes (task/process/autonomous/flow/mission/sprint), not sprint-only. Today the code still uses `writeSprintLog` / `SPRINT_LOG` / `.brain/sprints/*.md` (DECKENT-LOG, pending).

---

## Intent / Roadmap (Tomorrow)

- **MANAGED-DOCS-MINIMIZE:** reduce auto-md-updates to the necessary core docs only; remove bulk per-md regeneration; user-project = track-not-write (ADR-090 realization).
- **DECKENT-LOG:** complete the sprint-log → deckent-log rename + multi-mode coverage.
- **Code-drift + CI-gate + MCP/dashboard** (ADR-090 Phase-2, already largely landed) generalized to user projects.
- The MJS template plugin-loader, if ever wired, requires a SkillSandbox (latent security).

---

## Consequences

**(+)** One managed-docs + tracking law; the FS↔DB bi-directional sync is exactly what makes the md+DB ADR-edit method safe (idempotent re-sync). User docs stay the user's (track-not-write) — respects the product-vision boundary. Staleness is machine-detectable across the whole repo.

**(−)** "Minimal auto-gen" is a target (MANAGED-DOCS-MINIMIZE) — the managed-set still includes the CLAUDE/AGENTS host-adapters (DOCS-PURE-ADAPTER, P0) and `docs run`/`add --auto` can still write user docs. The post-finalize doc-tracking sync is gated default-off; the DB→FS reverse export (`exportAdrsToFs`) is test-only (DB-FS-EXPORT-WIRE); the self-update step-order is adrInsert→ruleRegen→memoryExport-last (not memoryExport-first). The deckent-log rename is partial. The plugin-loader is latent (unwired security).

---

## References / Absorbed

- **Absorbs:** ADR-029 + ADR-030 + ADR-031 + ADR-032 + ADR-046 + ADR-090.
- **Cross-ref:** ADR-G-035 (DB sync invariant — the md+DB pair) · ADR-G-019 (ADR export) · ADR-G-004 (instruction-file adapter) · ADR-G-024 (modes — deckent-log multi-mode) · ADR-075 Part-C (code-derived module-count `countModules` — folded here; Parts A→ADR-G-032, B→ADR-G-006).
- **Born / MASTER-PLAN:** MANAGED-DOCS-MINIMIZE (core-only + track-not-write) · DECKENT-LOG (sprint-log→deckent-log rename) · DB-FS-EXPORT-WIRE (wire `exportAdrsToFs` DB→FS into finalize/CLI, or declare available-not-enforced) · DOCS-PURE-ADAPTER (G-004 P0 — remove CLAUDE/AGENTS from docs.json) · I18N-6 (6-lang).
- **Memory:** `project_docs_security_features_redoc` · `project_claude_md_doc_bloat_cleanup`.


---

## adr-g-016: Product Vision — Product, Not Service

**Status:** accepted

# ADR-G-016: Product Vision — Product, Not Service

**Class:** ADR-G (Global / Constitution) · **Scope:** global+project · **Immutable:** yes · **Source:** publisher · **Enforcement:** today=identity-constitution — every feature/decision validated against the 4 inviolable principles (community-core = ALL features MIT; local-first/free/privacy; core never phones home) — discipline, not yet a CI gate (PRODUCT-IDENTITY-GUARD) → tomorrow=MOD-SPLIT-CLARIFY + license-taxonomy (features-MIT vs governance-assurance-licensed) + MODULARIZE (deckent-solo/enterprise, single codebase, governance-depth NOT feature-gating) + NEVER-PHONE-HOME-POLICY (marketplace/model-catalog network carve-out) + CODE-LAYERS
**Status:** accepted · **Date:** 2026-06-30 · **Absorbs:** ADR-033 (Product Vision — Product Not Service, + MOD-SPLIT amendment)
**Crosswalk:** ADR-033 → ADR-G-016

> **Identity note (Alperen, 2026-06-30):** "Bunu geliştikçe netleştireceğiz ama temel tüm özellikleri içeren katmanımız deckent-core'dur — onu her zaman koruyup geliştireceğiz. Enterprise katman aslında daha katı kontrollü ve disiplinli bir üründür; **işlev farkı yoktur**, denetim ve yönetim mekanizması farkı vardır." This is the product-identity constitution; it evolves and sharpens as the product matures, but its core principles are inviolable.

---

## Context

Deckent is a **product, not a service** (old ADR-033, Sprint 134): a local-first AI orchestration tool anyone can install and run, open-source and free for the community, for everyone everywhere — privacy-preserving, never phoning home. As the direction matured (modularization, an optional hosted core, a desktop/mobile app, an enterprise layer, opt-in telemetry), the strict 2026-04 forbidden-list (no SaaS / no cloud / no enterprise-edition / no **Deckent** subscription — provider subscriptions are first-class) needed reconciliation: how do these optional layers coexist with "product, not service" without compromising the identity? This ADR records that reconciliation (decision (a) of the 2026-06-30 review).

---

## Decision (Today)

### 1. Four inviolable principles

```xml
<product-identity immutable="true">
  <principle id="1">Product, not service — the core is NEVER bound (captive) to any cloud.</principle>
  <principle id="2">Easy to install & run — "kur-çalıştır", anyone can.</principle>
  <principle id="3">Open-source, community-free — the community core is free (MIT).</principle>
  <principle id="4">Everyone, everywhere — solo user → largest enterprise; every OS/environment (the AIM, Law #2; today Linux/macOS/Windows-WSL2, native-Windows pending).</principle>
  <invariant>Local-first · privacy-preserving · never-phone-home: core orchestration makes ZERO network calls; telemetry/observability are always-off + local (.deckent/metrics.jsonl). Network exceptions are NON-core + bounded: marketplace (registry.deckent.dev) only on explicit command; model-catalog (models.dev) a default-fetch with 24h-cache + bundled offline fallback (must honor --offline/opt-out) — NEVER-PHONE-HOME-POLICY.</invariant>
</product-identity>
```

### 2. Community-core = ALL features; optional layers must not compromise it

The **community core (`deckent-core`)** contains **every base feature**, is always protected and developed, and stays **local-first + free + no-required-cloud + privacy** forever. **Optional layers are permitted** *only as long as they do not compromise the core's local-first / free / privacy guarantees*:

```xml
<optional-layers permitted-if="core-guarantees-intact">
  <layer name="enterprise-module" license="separate">modular, same codebase, NOT a fork</layer>
  <layer name="hosted-deckent-core" mode="opt-in" default="BYO">hosted is never required; the core never depends on it</layer>
  <layer name="desktop-mobile-app" kind="local-first-client">not a cloud; ADR-G-033/DESK</layer>
  <layer name="enterprise-console">on the modular enterprise layer</layer>
  <layer name="telemetry" mode="opt-in-consent">never-phone-home by default</layer>
</optional-layers>
```

"Servis değil" means *the core is never bound to a cloud*; hosted/app/console are **additional options**, not a mandate.

### 3. Community ↔ Enterprise = governance depth, NOT feature-gating

```xml
<mod-split>
  <community-core>ALL features. Always protected + developed. Full functionality.</community-core>
  <enterprise-layer>
    SAME functionality — NO feature-gating. The difference is depth of CONTROL,
    DISCIPLINE, AUDIT/GOVERNANCE and MANAGEMENT (RBAC hard-enforcement, audit
    immutability, tenant management, policy governance, compliance, delegated
    approval). Enterprise = "the same product, more strictly governed."
  </enterprise-layer>
  <structure>Single codebase + modular enterprise-layer (separately licensed). NOT a fork, NOT a separate Edition, NOT a separate repo of features.</structure>
  <taxonomy clarifies="MIT ↔ separately-licensed — resolves the README tension">
    (a) base capability / FEATURES = MIT, all, free — README's "no gated features / nothing behind a paywall" holds.
    (b) governance / compliance ASSURANCE depth = the enterprise layer, separately licensed — hard-RBAC, audit-immutability, tenant isolation, compliance/cert, management-plane. This is NOT a feature set; it is an assurance + control layer over the SAME single codebase (so "no separate Enterprise EDITION" = no fork, while the governance MODULE carries its own license).
    (c) hosted-access = opt-in, BYO-default, never required.
    (d) marketplace / model-catalog = network enrichment (explicit / opt-out / offline-fallback).
  </taxonomy>
</mod-split>
```

This is the **MOD-SPLIT** refinement: the community↔enterprise boundary is governance/audit/management depth, not a paywalled feature set. (Repo strategy — the private-develop ↔ public-product axis, and a possible `deckent` + `deck-ent` split — is a *separate* axis handled in ADR-D-008; not to be conflated with this license/governance axis.)

---

## Intent / Roadmap (Tomorrow)

- This vision **sharpens as the product matures** (Alperen) — the optional layers (hosted-core, app, enterprise-console) are designed but their exact shape clarifies with delivery.
- **MODULARIZE** (deckent-solo / deckent-enterprise, two licenses, single codebase) lands *after* the ADR revision (MASTER-PLAN: MODULARIZE; ties ADR-G-031 enterprise foundation + the CODE-LAYERS 5-layer architecture, discussed separately).
- The enterprise layer's depth = the god-level gaps mapped in ADR-G-031 (management-plane, custom-RBAC, hard-enforcement-V2, runtime-tenant-isolation, SCIM, audit-export/compliance).

---

## Consequences

**(+)** The identity is reconcilable with growth: optional cloud/app/enterprise layers are explicitly permitted *without* turning the core into a service, because the core never depends on them. The community user gets the full product free; enterprise pays for governance depth, not features — a clear, honest boundary.

**(−)** "Optional layers must not compromise core guarantees" is re-checked per feature (a hosted-core must keep BYO default) — but it is **discipline, not a CI gate** (PRODUCT-IDENTITY-GUARD). The never-phone-home invariant has bounded non-core network exceptions (marketplace explicit-command; model-catalog default-fetch + offline-fallback — NEVER-PHONE-HOME-POLICY). "Every OS" is an aim (today WSL2, not native Windows). The MIT↔separately-licensed boundary needs the taxonomy above to avoid reading as contradictory, and README wording ("no Deckent subscription", not "no subscription") must align (README-VISION-ALIGN). The exact enterprise-layer shape is still maturing; the repo-strategy axis (ADR-D-008) is kept explicitly separate.

---

## References / Absorbed

- **Absorbs:** ADR-033 (Product Vision — Product Not Service + MOD-SPLIT amendment).
- **Cross-ref:** ADR-G-031 (Enterprise Foundation — the governance-depth layer) · ADR-D-008 (Repo Strategy — separate axis) · ADR-G-033 (Dashboard/DESK — local-first app) · ADR-G-008 (hosted-core = optional provider).
- **Born work-items:** MOD-SPLIT-CLARIFY (community=all-features / enterprise=governance-depth + the (a)-(d) taxonomy) · MODULARIZE · CODE-LAYERS (5-layer, separate discussion) · PRODUCT-IDENTITY-GUARD (CI/docs-lint: required-cloud / default-network / paywall / native-only claim) · NEVER-PHONE-HOME-POLICY (marketplace/model-catalog network carve-out + --offline + test) · README-VISION-ALIGN ("no Deckent subscription", WSL2-not-native, license-taxonomy).
- **Memory:** `project_community_pro_split_strategy` · `project_community_pro_split_strategy` · `feedback_dual_perspective_dogfood_product`.


---

## adr-g-017: Multi-Project Isolation

**Status:** accepted

# ADR-G-017: Multi-Project Isolation

**Class:** ADR-G (Global / Constitution) · **Scope:** global+project · **Immutable:** yes · **Source:** publisher · **Enforcement:** today=4-layer isolation model — per-project directory (real) + AES-256-GCM credential encryption (shipped but a **single GLOBAL vault**, per-project keying NOT built) + symlink-aware `realpath` scope (helper+tests only, **NOT wired into runtime authority**) + global/project config boundary (real); runtime scope enforcement **advisory/soft** (ADR-G-020 V1) → tomorrow=hard-enforce scope (ADR-G-020 Layer-2 V2 + TOOL-SCOPE) + enterprise multi-tenancy as a modular layer (ADR-G-031)
**Status:** accepted (provisional — Layer-2 per-project credential-keying + Layer-3 symlink-authority-wire are NOT shipped; global vault + helper-only today) · **Date:** 2026-06-30 · **Absorbs:** ADR-034 (Multi-Project Isolation — Per-Project Security Boundaries) · **Supersedes:** —
**Crosswalk:** ADR-034 → ADR-G-017

> **Note (code-grounded, 2 corrections):** (1) The symlink-aware `isWithinScope()` helper **is** implemented (`fs.realpathSync()` → boolean) **and test-covered, but is NOT wired into the live authority path** — runtime `checkWorkerAuthority()` → `checkAuthority()` uses **path-normalization only** (`normalizePath` + prefix-match, no `realpathSync`), i.e. exactly the "path-normalization-only" approach this ADR's rejected-alternatives calls insufficient. So the symlink-bypass threat is closed at the helper/test level, not in enforcement (SYMLINK-AUTHORITY-WIRE). (2) Even when wired, ADR-G-020 V1 runtime scope enforcement is **advisory/soft** (warn + event, not hard-block); the hard-flip is post-GA V2. "Vulnerability closed / blocks" = design intent, not today's runtime guarantee.

---

## Context

A single user routinely orchestrates several projects side-by-side on one machine. Each project owns its own `.deckent/`, `.brain/`, `.tasks/`, and `.locks/` directories; the isolation existed in practice but had never been formally defined, threat-modeled, or made testable.

**Critical distinction — multi-project ≠ multi-tenant.** This ADR governs isolation between *one user's* projects on *one machine*. The SaaS scenario of 10,000 tenants sharing a server is a **different** problem, deliberately out of scope here and constrained by the product-vision ADR (**ADR-G-016**); enterprise multi-tenancy arrives later as a *modular* layer (**ADR-G-031**), never by weakening this per-project model.

A Sprint-132 security audit surfaced the concrete threats this ADR closes:

1. **Sibling-project scope bypass** — a worker in Project A creates a symlink to `../project-b/src/secret.ts` and slips past a path-only scope check.
2. **Credential leakage** — project-specific API material in global config is read by a sibling project.
3. **Global-state pollution** — one project's `.deckent/config.json` edit silently changes another project's behavior.
4. **Symlink-cycle DoS** — recursive symlinks spin the scope resolver forever.

Sprint-133 shipped AES-256-GCM credential encryption — **but as a single GLOBAL vault** (`~/.deckent/credentials/` + `~/.deckent/.keyring`), **not** the per-project, projectRoot-keyed model this ADR's Layer-2 originally described (that per-project keying was planned in Sprint 134 and **never built** — design-doc §4.2). What also remained un-formalized was the scope-bypass defense and the global/project config-sharing rules.

---

## Decision (Today)

Multi-project isolation is **four layers**:

```xml
<isolation-layers>
  <layer n="1" name="Per-Project Directory Isolation" status="formalized">
    Each project owns independent directory roots — .deckent/ (config, agent/skill
    pool, metrics), .brain/ (decisions, memory, retro, patterns), .tasks/ (task
    files, heartbeat, result, lock), .locks/ (file locks). No cross-reference:
    a project's .brain holds only that project's history.
  </layer>
  <layer n="2" name="Credential Encryption" status="PARTIAL — global vault shipped; per-project NOT built">
    AES-256-GCM credential encryption IS shipped (src/core/credential-encryption.ts:
    ALGORITHM='aes-256-gcm', createCipheriv) — but as a SINGLE GLOBAL VAULT:
    ~/.deckent/credentials/<provider>.json, encrypted with one master key in
    ~/.deckent/.keyring (or DECKENT_MASTER_KEY), shared across ALL projects. The
    per-project .deckent/credentials.enc + projectRoot/HKDF key-derivation +
    sibling-cross-read-fail was PLANNED (Sprint 134) but NEVER IMPLEMENTED (design-doc
    §4.2 explicitly: "NOT YET IMPLEMENTED ... cross-project credential decryption
    protection does not currently apply"). So sibling-project credential isolation does
    NOT currently hold — it is a global vault (CRED-PER-PROJECT). Distinct from the
    .deck/Ed25519 secret system of ADR-G-005 (complementary).
  </layer>
  <layer n="3" name="Symlink-Aware Scope Enforcement" status="HELPER ONLY — not wired into runtime authority">
    isWithinScope() (src/agents/worker.ts) resolves the target with fs.realpathSync()
    before matching (symlink outside scope → real path → fails; recursive ELOOP → fails),
    and is test-covered. BUT it is NOT called by the live authority path: runtime
    checkWorkerAuthority() → checkAuthority() (authority-enforcer.ts) does
    path-normalization-ONLY (normalizePath + prefix-match, no realpathSync) — the very
    approach §rejected-alternatives calls insufficient against symlink bypass. So the
    symlink defense exists as a helper+tests, NOT in enforcement (SYMLINK-AUTHORITY-WIRE).
    Even once wired, the violation is advisory (warn + event, ADR-G-020 V1) — throw/block
    is design intent (V2).
  </layer>
  <layer n="4" name="Global vs Project Config Boundary" status="documented">
    ~/.deckent/config.json (global) vs .deckent/config.json (project), explicit
    sharing rules below.
  </layer>
</isolation-layers>
```

### Layer 4 — config boundary (sharing rules)

| Field | Scope | Sharing rule |
|------|-------|--------------|
| `brain_provider`, `worker_provider` | Global OR Project | project override wins |
| `max_workers` | Global OR Project | project override wins |
| `brain_planning` | Global OR Project | project override wins |
| `min_tier`, `mode_preset` | Global OR Project | project override wins |
| `OPENAI_API_KEY`, `GOOGLE_API_KEY` | Environment | OS env var only — never stored in config |
| `telemetry_enabled` | Global OR Project (default **false**) | **opt-in, default-OFF** settable boolean; no sender wired (see below) |
| `verify_loop` | Project | project-specific, global default `true` |
| `auto_archive_directives` | Project | project-specific |
| Agent/skill pool | Project | per-project `.deckent/agents/`, `.deckent/skills/` |
| Sprint history | Project | per-project `.brain/sprints/` |

API keys are **never** stored in config files — config references the variable *name*, never the value (`config.ts:425/1798`); they are passed via environment. This removes global config as a credential-leakage vector. Layered config merge mechanics are governed by **ADR-G-001**.

**Telemetry accuracy (correcting a prior overstatement):** `telemetry_enabled` is a **settable, default-OFF opt-in** boolean (`config.ts:1862`), *not* a "hard-coded false." No telemetry **sender** is wired — a `grep` finds zero phone-home calls gated on the flag — so the no-phone-home guarantee currently holds via **absence of a sender**, not via a hard-coded flag. The real opt-in telemetry is forward work (**FB-1**) and, when built, must honor default-off + explicit consent (**ADR-G-030**) and the air-gapped / never-phone-home pillar.

### Rejected alternatives (and why)

Sandboxed worker process (chroot/namespace) — over-complex, cross-platform-incompatible (macOS chroot limited), disproportionate to the product. Path-normalization-only — hardlink/symlink bypass still possible. Worker-level FS virtualization — Node `fs` incompatible, high cost. Docs-only — leaves the audit finding open. Docker-per-project — install friction, conflicts with the "install and run" principle (**ADR-G-016**).

---

## Intent / Roadmap (Tomorrow)

- **Hard-enforce scope (V2).** The advisory scope check becomes a **hard block**: a write outside `scope.filesWrite` is denied, not merely warned. This rides the **ADR-G-020** Layer-2 enforcement upgrade (the ADR-G-020 flag-gated vein graduating to default-on, post-GA V2) plus a **TOOL-SCOPE** tool that makes scope analysis/approval/edit first-class and terminal-trackable.
- **Enterprise multi-tenancy as a modular layer.** Genuine SaaS multi-tenant isolation (per-tenant boundaries, k8s pod isolation, tenant-scoped audit) is built **on top** of this per-project model as the enterprise layer (**ADR-G-031**), never by relaxing it. multi-project remains the solo/local truth; multi-tenant is additive.
- **FB-1 opt-in telemetry.** A consent-gated, default-OFF self-operation feedback loop (operation-metrics only, never project content) under **ADR-G-030** consent + the air-gapped pillar — wiring the sender that today deliberately does not exist.

---

## Consequences

**(+)** The Sprint-132 symlink scope-bypass finding is addressed by design (`realpathSync` resolution + ELOOP handling); per-project isolation rules are now formal and testable; the global/project config boundary is documented, so a new field's scope is explicit; credential isolation (AES-256-GCM, per-project-keyed) is formalized; and "multi-project ≠ multi-tenant" is settled, preventing wrong-direction PRs.

**(−)** **Two of the four layers are not yet enforced as described:** Layer-2 credential encryption is a single GLOBAL vault, not per-project-keyed — sibling credential isolation does NOT hold (CRED-PER-PROJECT); Layer-3's symlink-safe `isWithinScope()` is a helper+tests but the live `checkAuthority()` is path-normalization-only — symlink-bypass is not closed in enforcement (SYMLINK-AUTHORITY-WIRE). When wired, `isWithinScope()` adds a `realpathSync()` disk I/O per check and must handle deleted symlink targets + cross-platform ELOOP; and the runtime guarantee stays **advisory** until V2 (ADR-G-020). Project-root resolution is `process.cwd()`-based (ROOT-DISCIPLINE: needs explicit `ctx.projectRoot`/`--root` for shared MCP/daemon hosts). The config-boundary table must be updated whenever a new field is added.

---

## References / Absorbed

- **Absorbs:** ADR-034 (Multi-Project Isolation — Per-Project Security Boundaries; 4-layer model, Sprint-132 audit, Sprint-133 AES credential encryption, telemetry-accuracy amendment).
- **Product boundary:** **ADR-G-016** (Product Vision — Product Not Service) — multi-tenant out-of-scope at the core; "install and run" principle.
- **Config merge:** **ADR-G-001** (Layered Config & Scope Precedence) — global vs project mechanics.
- **Secret system:** **ADR-G-005** (Secret File System & Zero-Worker-Exposure) — `.deck`/Ed25519; complementary to and distinct from Layer-2 AES-256-GCM credential encryption.
- **Enforcement authority:** **ADR-G-020** (Authority, Roles, Flow & Enforcement) — advisory→hard scope flip (V1→V2, ADR-G-020 vein).
- **Enterprise layer:** **ADR-G-031** (Enterprise Foundation) — multi-tenancy as a modular layer atop this model.
- **Consent / telemetry:** **ADR-G-030** (Consent-Based Provisioning & Install) — FB-1 opt-in telemetry consent gate.
- **Born work-items:** **CRED-PER-PROJECT** (per-project `.deckent/credentials.enc` + projectRoot/HKDF key-derivation + sibling-cross-read-fail — the planned-not-built Layer-2; P1) · **SYMLINK-AUTHORITY-WIRE** (wire `isWithinScope` realpathSync into `checkWorkerAuthority`/`checkAuthority` — close symlink-bypass in enforcement; P1) · **ROOT-DISCIPLINE** (explicit `ctx.projectRoot`/`--root` for MCP/REPL/daemon; cwd-fallback non-canonical) · TOOL-SCOPE (scope analyze/approve/edit tool + hard-enforce) · ENTERPRISE-MULTI-TENANCY (ADR-G-031 ENT-* modular layer) · FB-1 (consent-gated opt-in telemetry sender).
- **Direction:** `docs/design/multi-project-isolation.md`, memory `project_air_gapped_offline_pillar`, `feedback_zero_hardcode_live_data`; `.analysis/hermes-vs-deckent-direction-decisions.md` (global-install + project-scope = P0).


---

## adr-g-018: Verification Protocol & Event-Stream

**Status:** accepted

# ADR-G-018: Verification Protocol & Event-Stream

**Class:** ADR-G (Global / Constitution) · **Scope:** global+project · **Immutable:** yes · **Source:** publisher · **Enforcement:** today=versioned protocol v1.0 + append-only `.deckent/recently-works/<sprintId>-events.jsonl` (`src/core/event-stream.ts`; 2-file size-capped rotation) + ~30 additive channels (canonical = the `CHANNELS` map) + fail-safe write (never crashes a run) + permanent dual transport → tomorrow=APR approval-channels + COMM-2 typed vocabulary + PROGRESS naming-fix + per-mode channel completion (jointly with ADR-G-020)
**Status:** accepted (amendment — doc-drift fixed: event-path, ~30 channels, single-process sequence, rotation-implemented, core-messages coverage) · **Date:** 2026-06-30 · **Absorbs:** ADR-035 (Brain ↔ Worker ↔ Auditor Verification Protocol Standard) · **Supersedes:** —
**Crosswalk:** ADR-035 → ADR-G-018

> **Mechanism vs policy (cross-ref, NOT merge):** This ADR is the **mechanism** — the message envelope, the channel codes, the transport. **Who may send/receive on which channel** is **policy**, owned by ADR-G-020 (Authority). The two are deliberately **cross-referenced, not merged**: channels (here) and channel-rights (there) are separate cohesive concerns, each kept whole.

---

## Context

Sprint 137 meta-dogfood surfaced a verification gap: a worker reported `DONE` while vitest still had 53 failing tests — the "code exists → DONE" shortcut. The root cause was the absence of a **formal, versioned, parseable protocol** for Brain ↔ Worker ↔ Auditor messages; each component emitted its own ad-hoc file format (`.hb` heartbeat, `.result`, git-diff output) that could not be independently verified, replayed, or version-negotiated.

ADR-035 (Sprint 138) answered with a versioned message protocol + an append-only event-stream as the canonical-read layer, with file-based state continuing in parallel as a fail-safe. The 2026-06-30 review confirms it as **ADR-G** (the orchestration backbone every subsystem speaks over) and resolves the one piece of ADR-035 that did not age well — its "remove file-based by Sprint 142" roadmap (see Decision §5).

Heavier transports were considered and rejected at design time for a **zero-infrastructure, fail-safe** posture: gRPC/Protobuf (schema-compiler toolchain), WebSocket (Docker port-mapping + container reachability), Redis Pub/Sub and SQLite (external/heavier substrate). The append-only `.jsonl` stream needs no daemon, no port, and degrades safely.

> **Note:** the original Redis/SQLite rejection cited the old minimal-dependency rule (since reframed to merit-based selection, ADR-D-005); the append-only-`.jsonl` choice nonetheless stands on its own **fail-safe + zero-infra** grounds, independent of that reframe.

---

## Decision (Today)

### 1. Versioned message protocol (v1.0) + append-only event-stream

All protocol-managed **core** Brain ↔ Worker ↔ Auditor messages are recorded, in order, to an append-only **`.deckent/recently-works/<sprintId>-events.jsonl`** stream (`src/core/event-stream.ts`; `src/orchestra/event-stream.ts` is a re-export shim since the Sprint 279 core-move). The stream is the **canonical-read truth**; the protocol is forward-compatible (extra payload fields are ignored). (Coverage caveat: standard `worker.ts` mirrors `.result`/`.hb` to the stream, but some agentic entry paths — `agentic-worker-entry.ts`, `http-agentic-worker.ts` — write `.result`/`.hb` directly without an event-mirror; backend-parity is pending — EVENT-MIRROR-PARITY.)

```json
{
  "timestamp": "2026-04-14T10:00:00.000Z",
  "sequence": 42,
  "protocol_version": "1.0",
  "source": "worker | brain | auditor | deckent",
  "target": "brain | worker | auditor | user | *",
  "channel": "CHANNEL_CODE",
  "payload": {},
  "correlationId": "…",
  "causationId": "…"
}
```

- `sequence` — run-monotonic integer from 1. `nextSequence()` is a persisted file counter, **monotonic within a single process** but read-modify-write **without a lock** — multi-process concurrent writers are not yet atomicity-guaranteed (SEQ-ATOMIC).
- `target: "*"` — broadcast.
- `correlationId` / `causationId` — optional message-lineage (additive; consumers ignoring them stay compatible).

### 2. ~30 channel codes (additive — protocol stays 1.0; canonical = the `CHANNELS` map)

The original 15 V1.0 channels — `BRAIN→WORKER:TASK_ASSIGN`, `WORKER→BRAIN:HEARTBEAT/RESULT/QUESTION`, `BRAIN→WORKER:ANSWER`, `WORKER→AUDITOR:CODE_VERIFY_REQUEST`, `AUDITOR→BRAIN:VERIFICATION_RESULT/SCOPE_COLLISION_DETECTED/ADR_VIOLATION/GATE_COMPUTED/LOAD_REPORT_WRITTEN`, `BRAIN→*:METRIC_EMITTED/SPRINT_PHASE_CHANGE`, `BRAIN→WORKER:FIX_REQUEST`, `DECKENT→USER:NOTIFY` — remain **verbatim**. 13 were **added** since (ORPHAN_HB_DETECTED, AUTHORITY_VIOLATION, TIMEOUT_ASSIGN/WARNING/CAP_EXCEEDED/EXTEND, NEVER_DISPATCHED, SPAWN_BLOCKED, DEPENDENCY_BLOCKED, DEPENDENCY_RESOLVED_BY_FIX, AUTH_FAILED, CONTAINER_PATH_SANITIZED, PROGRESS, NERVOUS_NOTIFICATION, NERVOUS_APPROVAL_CONSUMED). The canonical list is the `CHANNELS` map in `src/core/event-stream.ts` (~30 today — count not pinned here). Channels are **additive by design**, so `protocol_version` stays `'1.0'`; a breaking change would bump to `2.0`.

### 3. Lineage & forward-compatibility

`source` / `target` / `channel` / `payload` is the fixed core; `correlationId` / `causationId` add causal lineage. New consumers read `protocol_version`; unknown payload fields are ignored — old consumers never break on additive growth.

### 4. Fail-safe (never blocks a run)

```xml
<fail-safe>
  <rule>writeEvent() is try/catch → console.warn + returns null on failure
        (disk full, permission) — a run NEVER halts on event-stream I/O error.</rule>
  <rule>Sequence monotonicity via a persisted counter — single-process monotonic; multi-process atomicity needs a lock (SEQ-ATOMIC).</rule>
</fail-safe>
```

### 5. Dual transport is PERMANENT (file-based `.hb`/`.result` + event-stream)

```xml
<dual-transport status="permanent" fail-safe="yes">
  <layer kind="file-based">.tasks/*.hb heartbeat + .tasks/*.result — the LIVE PRIMARY
    read path (result-collector.ts, worker.ts, ADR-D-007 manual-dispatch).</layer>
  <layer kind="event-stream">.deckent/recently-works/<sprintId>-events.jsonl — the
    canonical-READ, replayable, version-negotiated layer (2-file size-capped rotation).</layer>
  <decision>BOTH are preserved PERMANENTLY as a fail-safe pair. ADR-035's original
    "Backward-Compatibility Roadmap" (file-based soft-deprecated by Sprint 140, REMOVED
    by Sprint 142) is REJECTED — it never materialized (file-based was still live-primary
    at Sprint 172 and Sprint 280) and is now decided AGAINST: the event-stream is a
    canonical-read layer ON TOP of file-based state, never a replacement for it.</decision>
</dual-transport>
```

---

## Intent / Roadmap (Tomorrow)

- **APR approval-channels:** the ApprovalBroker (cross-environment live approval) sends/receives over dedicated event-stream channels — the protocol becomes the transport for human-in-the-loop approval. (MASTER-PLAN: APR.)
- **COMM-2 typed vocabulary:** the "no worker→worker direct messaging — all mediated through the Brain bus" rule (policy in ADR-G-020) becomes a **typed message vocabulary** (DEPENDENCY_REQUEST, …) over this stream — transport-invariant, machine-checkable.
- **PROGRESS naming-fix:** `PROGRESS` is a bare code, deviating from the `SOURCE→TARGET:NAME` convention every other channel follows; it (and any future channel) is normalized to the convention.
- **Per-mode channel completion (jointly with ADR-G-020):** the channel set is sprint-centric; process / autonomous / flow / mission modes (ADR-G-024) need their channel gaps closed — reconciled **with ADR-G-020**, which owns per-mode channel-rights.

---

## Consequences

**(+)** Every Brain/Worker/Auditor message is versioned, replayable, and independently verifiable (the Sprint-137 "DONE shortcut" is closeable — the Auditor becomes an active verifier); additive channels grow without breaking consumers; the stream is fail-safe and zero-infrastructure; the dual transport is a durable safety net. Mechanism (channels) and policy (channel-rights, ADR-G-020) stay cleanly separated, each cohesive.

**(−)** Per-event disk I/O grows the `.jsonl` — **rotation is implemented** (MAX_EVENT_FILE_BYTES cap, 2-file rotate-to-`.1`), not deferred; the sequence counter is single-process-monotonic but **not multi-process atomic** (no lock — SEQ-ATOMIC); some agentic entry paths write `.result`/`.hb` without an event-mirror (EVENT-MIRROR-PARITY); the `PROGRESS` naming deviation and per-mode channel gaps are open until the roadmap items land; channel-rights enforcement is advisory/soft today (ADR-G-020 V1.0).

---

## References / Absorbed

- **Absorbs:** ADR-035 (Brain ↔ Worker ↔ Auditor Verification Protocol Standard — protocol v1.0, event-stream, channel codes, fail-safe, dual transport).
- **Policy partner (cross-ref, NOT merged):** ADR-G-020 (Authority, Roles, Flow & Enforcement — owns channel send/receive rights, the no-worker→worker mediated-bus rule = COMM-2, and per-mode channel-rights).
- **Cross-ref:** ADR-G-014 (Spawn Backend & Observation — cross-backend observability rests on this stream) · ADR-G-025 (Process Resilience & Live Observability — the PROGRESS / WORKER-LIVE-TRACE structured progress-stream) · ADR-G-022 (Nervous System — proactive triggers over the bus) · ADR-G-024 (Mode Architecture — per-mode channels) · ADR-G-019 (ADR Governance — DB-first storage / taxonomy).
- **Born work-items:** APR (approval-channels) · COMM-2 (typed mediated-bus vocabulary) · PROGRESS naming-fix · per-mode channel completion · SEQ-ATOMIC (multi-process sequence lock) · EVENT-MIRROR-PARITY (agentic entry paths emit event-mirror) · EVENT-CHANNELS-DOC-SYNC (`event-channels.md` path + ~30-channel snapshot).
- **Direction:** `.analysis/adr-review-crosswalk.md` (row 035 → ADR-G-018).


---

## adr-g-019: ADR Governance & 4-Layer Taxonomy

**Status:** accepted

# ADR-G-019: ADR Governance & 4-Layer Taxonomy

**Class:** ADR-G (Global / Constitution) · **Scope:** global+project · **Immutable:** yes · **Source:** publisher · **Enforcement:** today=MADR-v3 + `lint:adr` validator (status/required-sections/dup-id; NOT yet class-metadata hard-validate) + DB-first taxonomy columns (write-only — read-path mapping pending) + prompt-injection via legacy-id `adr-selector` (structural/advisory) → tomorrow=ADR-G enforcement-engine (immutable runtime-validation via ADR-G-020 + its flag-gated vein, old ADR-094) + ADR-VALIDATOR-HARDEN + TAXONOMY-READPATH + ADR-SELECTOR-MIGRATE
**Status:** accepted (provisional — taxonomy decided + write-path live; lint:adr class-validation + DB read-path mapping + adr-selector class-awareness are partial) · **Date:** 2026-06-30 · **Absorbs:** ADR-036 (ADR Governance Integration) · **Supersedes:** —
**Crosswalk:** ADR-036 → ADR-G-019

> **Meta-note:** This is the governance-of-the-governance ADR. It defines the four ADR classes, their precedence, authoring standard, storage, and enforcement model. Every other ADR (ADR-G-*, ADR-D-*, and runtime-born ADR-UG-*/ADR-UP-*) is created, classified, stored, injected, and enforced according to this document.

---

## Context

Deckent's earlier governance (old ADR-036, Sprint 138) established: MADR-v3 hybrid format, a mandatory-read wiring, worker-prompt ADR injection (`adr-selector.ts`), a `lint:adr` validator (`scripts/adr-validator.mjs`), DB-first storage (ADRs in `memory.db` `type='adr'`, synced from `docs/adr/*.md`, exported to `.brain/exports/decisions.md`). That system worked — `lint:adr` is live-proven, ADR injection reaches workers — but it had **one flat class**: every ADR was an undifferentiated "deckent-internal" decision.

The 2026-06-30 full ADR review (89 ADRs, one-by-one) surfaced the gap: ADRs serve **four different audiences with different authority and lifecycle**, and conflating them is wrong —
- some are **inviolable runtime laws** the product carries to every user (how deckent *behaves*),
- some are **contributor conventions** that ship only with the dev install (how deckent is *built*),
- and the *user* needs their own ADR layer (global + per-project) that deckent **observes and adheres to** without ever weakening the product's own laws.

A flat model cannot express "the user may tighten but never violate deckent's core law," nor "this rule is contributor-only and must not reach an end user's prompt," nor "this law is immutable and fed only from the publisher's main repo." ADR-G-019 introduces the layered taxonomy that does.

---

## Decision (Today)

### 1. Four ADR Classes

```xml
<adr-taxonomy>
  <class id="ADR-G" name="Global / Constitution">
    deckent's core function laws (worker/brain/auditor/nervous + every subsystem):
    runtime behavior, orchestration, security/RBAC, evaluation integrity, memory,
    isolation, capability, approval, proof-of-function. LLMs CANNOT violate.
    immutable=yes · source=publisher (main repo only) · scope=global+project ·
    ships in BOTH global install AND every project install · applies to
    dogfood AND user (solo → largest enterprise, million-scale).
  </class>
  <class id="ADR-D" name="Dogfooding / Dev">
    how deckent is BUILT — contributor conventions (language/build/test/code-structure/
    dependency policy). source=publisher+contributor · revised under approval ·
    ships ONLY with the dev install (deckent@dev / upgrade @dev) · audience=contributors.
  </class>
  <class id="ADR-UG" name="User Global">
    the USER's own global ADRs (across all their projects / a Windows host).
    source=user · user-managed · ships in the user's global install ·
    deckent OBSERVES + adheres (worker/brain/auditor honor it). Starts empty; born at runtime.
  </class>
  <class id="ADR-UP" name="User Project">
    the USER's project-specific ADRs. source=user · user-managed · per-project ·
    deckent OBSERVES + adheres. Starts empty; born at runtime.
  </class>
</adr-taxonomy>
```

### 2. Precedence — **G > U > D**

On conflict, **ADR-G wins** (the user cannot violate deckent's core law). The user layer (UG/UP) overrides dev conventions (D) for the user's own environment. A user **may tighten** their own layer (add stricter UG/UP rules) but **may never loosen** an ADR-G. ADR-D governs only the deckent-development environment and never overrides a runtime law a user relies on.

```
ADR-G  (immutable, publisher)      ── highest, inviolable
  ▲
ADR-UG / ADR-UP (user-managed)     ── user tightens / customizes within G
  ▲
ADR-D  (dev/contributor)           ── lowest, dev-environment only
```

### 3. Numbering — class-internal + crosswalk

IDs are **class-internal sequential**: `ADR-G-001..NNN`, `ADR-D-001..NNN`. The U classes start empty and are created at runtime (`ADR-UG-001..`, `ADR-UP-001..` per user/project). The old flat `ADR-NNN` → new mapping is preserved in `.analysis/adr-review-crosswalk.md` (and, post-migration, in the DB `metadata.legacy_id`). Deprecated ADRs are **archived** (no active number; historical record kept), not renumbered. Intentional gaps (a number absorbed into another ADR) are documented, not back-filled.

### 4. Authoring Standard (ADR-AUTHORING-STD)

Every ADR — **especially ADR-G** — documents **both today and tomorrow, transparently**:

```
Context  →  Decision (Today: current-state)  →  Intent/Roadmap (Tomorrow: target-intent + why)  →  Consequences
```

Static "this is how it is now" is insufficient; an ADR must also state "this is where we are going, and why," so LLM-agents, contributors, and users all work aligned with the evolution direction. Large/complex ADRs (e.g. ADR-G-020, ADR-G-031, ADR-G-035) additionally use **XML-schema / explicit-heading section separation** for unambiguous structure. Format is MADR-v3 hybrid. **Validation scope (today):** `lint:adr` validates the `**Status:**` field, the required sections (Context / Decision / Consequence), and duplicate ids — it does **NOT** yet hard-validate the class-metadata header (Class / Scope / Immutable / Source / Enforcement) or the today/tomorrow authoring-standard (ADR-VALIDATOR-HARDEN). The class-metadata header is mandatory by convention, enforced at review, not by the validator.

### 5. Storage, Recall & Injection (DB-first — see ADR-G-035)

ADRs live **DB-first** in `memory.db` (SSOT); `docs/adr/*.md` + `.brain/exports/decisions.md` are generated views. The `entries` schema carries class-aware columns — `adr_class` (G/D/UG/UP), `scope` (global/project), `immutable`, `source`, `enforcement_level` (ADR-G-035). **State-of-code (honest):** these columns are currently **WRITE-ONLY** — `insert` populates them, but `rowToEntry` does not map them back and `upsert` does not diff them, so structured **class/scope-aware recall is not yet wired** (TAXONOMY-READPATH). Today the **id-prefix** (`adr-g-NNN` / `adr-d-NNN`) carries the class, and recall is FTS5 + Task-DNA relevance over id/content. Injection into brain/worker/auditor prompts runs through `adr-selector.ts`, which still uses **legacy-flat id presets** (`adr-001`, `adr-087`, …) + numeric-only explicit-extraction (`ADR-012`, not `ADR-G-019`) — stale post-migration (ADR-SELECTOR-MIGRATE). The **class/scope-aware recall described next is the TARGET**, not today's behavior: a worker in a user project gets ADR-G (always) + relevant ADR-UG/UP and never ADR-D; a deckent-dev worker also gets ADR-D. Editing an ADR means updating **both** the `.md` and the DB so doc == DB (ADR-G-035 sync invariant).

### 6. Roles

deckent **observes** user ADRs (UG/UP) and **adheres** to them at every layer (worker/brain/auditor); it **evolves customize-tools** per environment to satisfy them. The publisher alone feeds ADR-G (immutable). Contributors propose ADR-D under approval. Users author UG/UP via natural-language/chat/desktop (no hand-editing required).

---

## Intent / Roadmap (Tomorrow)

- **ADR-G enforcement-engine:** today ADR-G is carried by injection + advisory validation; tomorrow it is **runtime-inviolable** — LLM output that would breach an ADR-G is blocked, not merely logged. The mechanism is the flag-gated enforcement vein (old ADR-094, now within ADR-G-020) graduating to default-on (post-GA-V2) under ADR-G-020's authority layer, plus a centralized policy engine candidate (POLICY-ENGINE-EVAL — OPA/Rego or embedded; ADR-D-005 reframe removed the minimal-dep blocker).
- **ADR-U management surface:** users create/edit/retire ADR-UG/ADR-UP conversationally (native terminal + desktop app + CLI/MCP); deckent generates per-environment **customize-tools** to honor them and can contribute generalizable patterns back to the main repo.
- **Install-wiring:** global install seeds ADR-G; `@dev` install adds ADR-D; user install opens the ADR-UG/UP skeleton. (MASTER-PLAN: ADR-LAYER.)
- **Class/scope-aware vector recall:** ADR-G-035's opt-in local-embedding vector layer (never-calls-home) extends class/scope-aware retrieval to semantic matching.

---

## Consequences

**(+)** Authority is now expressible: "user tightens but cannot violate G" is enforceable; contributor-only rules never leak to end users; immutable laws have a single trusted source. The review's 89→~42 consolidation is itself an application of this taxonomy (G vs D split). Today+tomorrow authoring keeps agents aligned with direction, not just current state.

**(−)** The taxonomy is decided and the write-path is live, but the **tooling is partial**: `lint:adr` does not hard-validate the class-metadata header (ADR-VALIDATOR-HARDEN); the DB class-columns are write-only so class-aware recall is not yet wired (TAXONOMY-READPATH); `adr-selector.ts` still uses legacy-flat ids (ADR-SELECTOR-MIGRATE). Two intentional numbering gaps (G-003→absorbed in G-020, D-003→folded to G-014) — documented, not back-filled. The enforcement-engine (ADR-G inviolability) is roadmap — today's protection is injection + advisory `lint:adr` + the ADR-094 dogfood vein (now within ADR-G-020). ADR-U management is a forward surface, so today only G/D are populated.

---

## References / Absorbed

- **Absorbs:** ADR-036 (ADR Governance Integration — MADR-v3, lint:adr, DB-first injection).
- **Enforcement partner:** ADR-G-020 (Authority, Roles, Flow & Enforcement) + ADR-094 vein (now within G-020).
- **Storage substrate:** ADR-G-035 (Memory Architecture — class-aware schema columns, FTS5, sync invariant).
- **Governs:** every ADR-G-*, ADR-D-*, and runtime ADR-UG-*/ADR-UP-*.
- **Born work-items:** ADR-AUTHORING-STD (this doc §4), ADR-LAYER (install-wiring), POLICY-ENGINE-EVAL, **ADR-VALIDATOR-HARDEN** (lint:adr → hard-validate class-metadata + today/tomorrow standard), **TAXONOMY-READPATH** (map `adr_class`/`scope`/`immutable`/… in `rowToEntry` + `upsert` → real class-aware recall), **ADR-SELECTOR-MIGRATE** (`adr-selector.ts` legacy-flat ids → class-aware `adr-g/d-NNN` scheme).
- **Direction:** `.analysis/adr-governance-redesign-plan.md`, `.analysis/hermes-vs-deckent-direction-decisions.md`, memory `feedback_adr_documents_today_and_tomorrow` · `feedback_governance_aligns_with_direction_pivot`.


---

## adr-g-020: Authority, Roles, Flow & Enforcement (Multi-Mode RBAC)

**Status:** accepted

# ADR-G-020: Authority, Roles, Flow & Enforcement (Multi-Mode RBAC)

**Class:** ADR-G (Global / Constitution) · **Scope:** global+project · **Immutable:** yes · **Source:** publisher · **Enforcement:** today=3-layer (compile-lint + runtime-advisory + post-hoc audit-trail) → tomorrow=Layer-2 HARD-flip (ADR-094 vein → default-on, post-GA-V2) + ROLE-GUARD + policy-engine
**Status:** accepted (authority constitution + hardening roadmap; enforcement is mixed advisory/hard by surface, two surfaces not yet single-SSOT) · **Date:** 2026-06-30 · **Absorbs:** ADR-037 (RBAC V1.0) + ADR-G-003 (Brain Role Separation, born 2026-06-30) + ADR-094 (Flag-Gated Enforcement Vein)
**Crosswalk:** ADR-037 (+born G-003 + 094) → ADR-G-020

> **Foundational note (Alperen, 2026-06-30):** "Bu ADR bizim kod işleyişimiz — çok dikkatli ve doğru tasarlanmalı; hem deckent-dogfood hem user tarafı için kusursuz olmalı. Bu ADR bir sürü iyi ve kötü tecrübenin nihai ürünüdür." This document is the distillation of 200+ sprints of orchestration experience; it is global (ADR-G) but its file-path matrix spans BOTH global and project scope, and its authority model is **user-customizable** within the inviolable G-baseline.

---

## Context

ADR-037 (Sprint 139) introduced the Brain↔Auditor↔Worker authority matrix with four principles (least-privilege, separation-of-duties, auditability, fail-closed) — but documented its enforcement as **V1.0 deliberately soft**: Layer-2 runtime is advisory (`checkWorkerAuthority` returns `true` even on violation; violations are logged + emitted, not blocked). Three further gaps surfaced in the 2026-06-30 review:

1. The matrix was written for **sprint mode only**, and its file-path rules assumed a single project scope.
2. "Brain never writes code" (the orchestrator-boundary, Rule-4) deserved first-class statement — it was briefly born as a separate ADR-G-003 before being recognized as this matrix's core.
3. Enforcement was advisory-only with no proven upgrade path; ADR-094 (Sprint 343) later built a flag-gated enforcement vein dogfooded in deckent-dev — that vein belongs *inside* this authority law.

ADR-G-020 consolidates all three: the role/authority matrix, the Brain orchestration boundary, and the enforcement engine — generalized across **all execution modes**, across **global+project scope**, and made **user-customizable** without ever weakening the core.

---

## Decision (Today)

### 1. Roles & Separation of Duties

```xml
<roles separation-of-duties="specified (surface-dependent enforcement)">
  <role id="Architect" actor="human" power="strategic">
    Vision, DIRECTIVES/charter authoring, approval of critical-irreversible actions.
    No tactical mid-run intervention.
  </role>
  <role id="Brain" actor="orchestrator" cardinality="singleton" power="orchestrate">
    Plan · route · evaluate · finalize. **NEVER writes code** (src/** DENY) — code is
    authored by workers / the AI tool the user runs in the terminal. (Absorbs ADR-G-003:
    "Brain Role Separation — Orchestrator, Never Code-Author"; enforced by tool + pid/role
    guard = ROLE-GUARD.)
  </role>
  <role id="Worker" actor="generator" cardinality="N-parallel" power="execute">
    Code/action + tests, STRICT to scope.filesWrite. Writes its own self-assessment.
  </role>
  <role id="Auditor" actor="adversary" process="separate" power="verify">
    Adversarial verification, ADR-compliance, RBAC scan, fresh-context critique.
    NEVER writes code — reads + scores only. Independent of Brain's assessment.
  </role>
  <role id="Nervous" actor="meta-orchestrator" power="proactive-heal">
    Proactive health monitoring; may restart Brain / propose recovery; never writes code.
    (ADR-G-022.)
  </role>
</roles>
```

**Enforcement is surface-dependent (not uniformly hard):** `authority-enforcer.ts` is **soft/advisory** (`EnforcementMode='soft'` default — warn + emit, caller proceeds); the agentic `scope-guard.ts` **hard-rejects** out-of-scope write/edit; the worker `enforceRbac` flag → **hard-deny**. So separation-of-duties is *specified + selectively enforced*, not uniformly blocked (Layer-2 HARD-flip = §Roadmap).

**Assessment rule (design intent):** both the worker's **self-assessment** AND the Brain's assessment are recorded per task, distinctly. Today the field naming/path varies — `evaluationDecision` is the canonical Brain-side field on `TaskResult`, `brainAssessment` is set on the autonomous-backlog path, and `selfAssessment` is the fallback for crash-recovered / manual results — so "two distinct assessments every task" is the target, not yet a uniform invariant (ASSESS-CONTRACT standardizes it).

### 2. Authority Matrix (file / channel / lifecycle)

```xml
<authority-matrix scope="global+project">
  <file-access>
    Per-component scope.filesWrite / filesRead, resolved over BOTH global paths
    (~/.deckent, global ADRs) AND project paths (.deckent, .brain, .tasks, src/**).
    Brain: DENY src/** + tests/**. Worker: ALLOW only declared scope.filesWrite.
    Auditor: read-all, write NONE (except its own .dashboard/audit sinks).
  </file-access>
  <event-stream-rights>
    Channel-level send/receive rights over the ADR-G-018 event-stream. Today the
    authority-enforcer channel allow/deny matrix covers the CORE ~15 channels, NOT the
    full ~30 of ADR-G-018 (NERVOUS_* + the 13 added channels are not yet in the rights
    matrix) — channel-rights lag the channel set (CHANNEL-RIGHTS-SYNC, via COMM-2).
    No worker→worker DIRECT messaging — all mediated through the Brain bus
    (transport-invariant; typed vocabulary = COMM-2), with ONE controlled exception: a
    read-mostly shared-memory dir (.tasks/shared/) for lightweight inter-worker
    coordination — a sanctioned exception, not direct messaging. Per-mode channel gaps
    are reconciled with ADR-G-018.
  </event-stream-rights>
  <lifecycle-actions>
    Per-role permission for plan/spawn/evaluate/fix/finalize/kill/cleanup actions,
    per mode (see §3).
  </lifecycle-actions>
</authority-matrix>
```

### 3. Multi-Mode — role · flow · continuation

The authority matrix applies across **every execution mode**. Today's three styles (ADR-G-024) are `sprint` / `task` / `process`; the roadmap mode-set adds `flow` / `mission` / `autonomous` (universal naming per ADR-G-024; "sprint" jargon is being retired). For each mode the ADR documents the **role assignment + flow + continuation mechanism** — including the **autonomous** continuation (how Brain's role persists across an autonomous loop, how a long-running process resumes). The matrix is mode-agnostic at its core; modes differ only in which lifecycle actions are active and which approval tiers apply.

### 4. User-Customizable Authority (within the G-baseline)

The matrix is **ADR-G (inviolable baseline)** but **user-customizable**: a user defines their own authority rules for their files / work-environment / agentic processes via the ADR-UG/ADR-UP layer. Precedence is **G > U > D** — the user may **tighten** (add stricter authority) but **never violate** the G-baseline. deckent *observes* the user's matrix and evolves per-environment customize-tools to honor it.

### 5. Enforcement — 3 layers + flag-gated vein (absorbs ADR-094)

```xml
<enforcement>
  <layer n="1" kind="compile-time">lint / authority-static-check (active)</layer>
  <layer n="2" kind="runtime" v1="advisory/soft">
    V1.0 reality: violation logged + emitted, NOT blocked (checkWorkerAuthority
    returns true). The flag-gated vein (below) is the proven upgrade path. NOTE: runtime
    authority lives in TWO surfaces today — authority-enforcer.ts (file/path + channel
    matrix) and nervous/authority-matrix.ts (capability/RBAC, advisory-default /
    hard-under-enforce_rbac) — not yet a single SSOT (AUTHORITY-SSOT).
  </layer>
  <layer n="3" kind="post-hoc">audit-trail + git diff --stat boundary scan (active)</layer>
  <flag-gated-vein source="ADR-094" default="off-for-users">
    4 gates implemented behind config flags, default-off (product byte-identical):
    B1 enforce_rbac (worker hard-deny) · B6 cost_limits.enforce_spend_gate (cumulative
    spend warn) · A9 gate.enforce_adr_compliance (fail-OPEN permanent default — pre-ADR
    tasks must not retroactively fail) · A14 gate.max_tech_debt_ratio (downgrade).
    deckent-dev's gitignored config enables hard-mode → dogfoods each gate on real
    traffic before any global flip.
  </flag-gated-vein>
</enforcement>
```

### 6. Structure of this ADR

Given size/criticality, this ADR uses **XML-schema section separation** (above) for the matrix, roles, and enforcement so the contract is machine-parseable and unambiguous — required for correct prompt-injection and for the future enforcement engine.

---

## Intent / Roadmap (Tomorrow)

- **Layer-2 HARD-flip (post-GA-V2):** the ADR-094 vein graduates to default-on; an ADR-G violation is **blocked**, not logged. Backed by **ROLE-GUARD** (pid/role tool-enforce: the Brain/orchestrator process *cannot* write code; enforcement at the tool/process layer, not prompt-trust).
- **Centralized policy-engine RE-EVAL (POLICY-ENGINE-EVAL):** OPA/Rego or an embedded engine for the authority/RBAC decisions — the ADR-D-005 dependency reframe removed the minimal-dep blocker.
- **Generalized enforcement (ENFORCE-GENERALIZE):** the enforcement engine ships to **user projects**, not dogfood-only — `lint:adr` / authority-enforcer flawless on the user side too.
- **COMM-2 typed mediated-bus:** the no-worker-to-worker rule becomes a typed message vocabulary (DEPENDENCY_REQUEST, …) over the Brain bus.
- **Per-mode event-stream completion:** close the ADR-G-018 channel gaps for process/autonomous/flow/mission.
- **User-authority management surface:** users author/edit their ADR-UG/UP authority rules conversationally (ADR-G-019 ADR-U management).

---

## Consequences

**(+)** One inviolable, machine-parseable authority law spanning all modes + global/project scope, with a *proven* (dogfooded) enforcement upgrade path instead of advisory-forever. Brain-never-codes is first-class + tool-enforceable. User-customizable without weakening the core (G>U>D). Connector-surface RBAC (ADR-G-031) and self-modify guard (ADR-G-021) compose on top.

**(−)** Layer-2 hard-enforcement is roadmap (today advisory/soft, **surface-dependent** — authority-enforcer soft, agentic scope-guard hard, worker `enforceRbac`-flag hard) — real protection today is compile-time lint + Auditor `git diff --stat` + the dogfood vein, not a uniform runtime block for users. Authority lives in **two surfaces** (authority-enforcer + nervous/authority-matrix) not yet unified (AUTHORITY-SSOT); the channel-rights matrix covers ~15 of ADR-G-018's ~30 channels (CHANNEL-RIGHTS-SYNC); the self/brain assessment contract varies by path (ASSESS-CONTRACT); the "no worker→worker" rule has a controlled `.tasks/shared/` exception. ROLE-GUARD pid/process enforcement is a born work-item. The 4 enforcement gates add config surface (future consolidation into one `enforcement_mode: strict|advisory` toggle, post-GA-V2). `A9` ADR-compliance is permanently fail-open by design (prevents retroactive failures).

---

## References / Absorbed

- **Absorbs:** ADR-037 (Authority Matrix RBAC V1.0) · ADR-G-003 (Brain Role Separation — born, now Rule in §1) · ADR-094 (Flag-Gated Enforcement Vein — now §5 vein).
- **Cross-ref:** ADR-G-018 (Verification Protocol & Event-Stream — channels this matrix governs) · ADR-G-019 (ADR Governance — the enforcement-engine partner) · ADR-G-021 (Self-Modifying Detection) · ADR-G-024 (Mode Architecture — the modes in §3) · ADR-G-031 (Enterprise — connector-surface RBAC builds on this) · ADR-G-014 (Spawn/worktree — scope enforcement).
- **Born work-items:** ROLE-GUARD (pid/role tool-enforce) · POLICY-ENGINE-EVAL · ENFORCE-GENERALIZE · AUTH-MULTIMODE · AUTH-USER-CUSTOM · COMM-2 · **AUTHORITY-SSOT** (unify authority-enforcer + nervous/authority-matrix into one surface) · **CHANNEL-RIGHTS-SYNC** (authority channel-matrix → ADR-G-018 ~30 set) · **ASSESS-CONTRACT** (standardize selfAssessment / brainAssessment / evaluationDecision).
- **Memory:** `feedback_trust_brain_eval_not_worker` · `project_deckent_self_git_mutation_bug` · `project_social_identity_rbac_engine`.


---

## adr-g-021: Self-Modifying Detection — Dogfood ↔ User-Project Discrimination

**Status:** accepted

# ADR-G-021: Self-Modifying Detection — Dogfood ↔ User-Project Discrimination

**Class:** ADR-G (Global / Constitution) · **Scope:** global+project · **Immutable:** yes · **Source:** publisher · **Enforcement:** runtime detection + rollback-guard (protects deckent's own git tree)
**Status:** accepted · **Date:** 2026-06-30 · **Absorbs:** ADR-039 (Self-Modifying Task Detection)
**Crosswalk:** ADR-039 → ADR-G-021

> **Note (Alperen, 2026-06-30):** "Bu ADR'de düzenlenmeli — kodumuz buna dayanıyor; gayet detaylı ve düzgün ele alacağız." This is a safety law the codebase depends on; it must be handled in detail and correctly.

---

## Context

deckent runs in two fundamentally different modes: **dogfood** (deckent modifying its OWN source — runtime cache invalidation, MCP-restart, tsc-rebuild matter) and **user-project** (deckent orchestrating a user's Rails/React/Go/… project — the user's code never affects deckent's runtime). Conflating them caused the Sprint-138 Layer-4 class of failure (Brain ran stale pre-build cache after a worker rewrote `src/orchestra/`). ADR-039 formalized detection; the 2026-06-30 review elevates it to a global safety law and connects it to global-install discrimination + ROLE-GUARD.

---

## Decision (Today)

```xml
<self-modify-detection>
  <detect>detectDeckentRepo(root) = `.deckent/` exists AND package.json name === 'deckent'
    (both required; the name is the exact discriminator). isSelfModifying(task) =
    detectDeckentRepo AND task scope touches a deckent source pattern (src/core, src/orchestra,
    src/agents, src/cli, src/mcp, src/providers, src/api, src/monitor, src/dashboard,
    .deckent/agents, .deckent/skills).</detect>
  <policy>
    P1 self-modifying tasks run SEQUENTIAL (parallel tsc-rebuild race avoided).
    P2 self-modifying process → Wave-0 `tsc && vitest` health gate (design).
    P3 post-task auto-checkpoint (MCP-restart resume).
    P4 USER PROJECTS = NO-OP (detectDeckentRepo=false → zero overhead).
  </policy>
  <live-value>the proven, live consumers of detectDeckentRepo are: the ROLLBACK-GUARD
    (rollback.ts at BOTH ends — createSafetyPoint no-op AND rollbackToSafetyPoint's
    `git reset --hard` skipped on deckent's own tree; worker-rollback.ts shares the gate),
    so deckent can never wipe its own uncommitted source; AND the agentic self-modify
    guard (agent/guards/self-modifying.ts — write-elevation gated on detectDeckentRepo).
    User projects get full rollback semantics (detectDeckentRepo=false).
    P1–P3 are NOT WIRED (not merely "dormant"): the `isSelfModifyingSprint` flag IS
    threaded worker → authority (the `src/**`/`tests/**` write-exception in
    authority-enforcer.ts) but it DEFAULTS FALSE and no live detector sets it; the
    `isSelfModifyingSprint()` and `enforceSelfModifyingTask()` functions are defined but
    have NO production caller. In practice deckent-dev self-modifying runs go through the
    manual dispatch path (ADR-D-007).</live-value>
</self-modify-detection>
```

---

## Intent / Roadmap (Tomorrow)

- **P1–P3 wire OR formalize-the-reality (SELFMOD-W).** Either *wire* the dormant policies into a first-class **self-modify execution lane** — P1 sequential dispatch (no parallel `tsc`-rebuild race on deckent's own `dist/`), P2 a Wave-0 `tsc && vitest` health-gate that must pass before any self-modifying worker spawns, P3 post-task auto-checkpoint so an MCP-restart / runtime-cache-invalidation resumes losslessly — OR *formally adopt* the ADR-D-007 manual-dispatch path as the sanctioned dogfood self-modify route. The bar is **no silent dormancy**: the chosen reality is documented, tested, and enforced, never left implicit.
- **Global-install discrimination (every-environment law).** With deckent installed **globally** and orchestrating N user projects concurrently — macOS · Linux · Windows-native · WSL — the dogfood↔user decision is made per-process, per-project, potentially millions of times. `detectDeckentRepo` resolves per project-root (never process-global), and the `package.json name === 'deckent'` discriminator is hardened against rename/fork edge-cases with a stronger publisher-signed marker. A misclassification in *either* direction is a safety incident (self-protection skipped on the real repo, or a false-guard/overhead imposed on a user project) — so the detector is treated as a **security boundary**, not a convenience check.
- **Unify with ROLE-GUARD (ADR-G-020).** Self-git-mutation protection (never `reset --hard` deckent's own tree), the Brain-never-codes orchestrator boundary, and self-modify detection are one **self-protection family** — converged at the tool/process layer: pid/role + repo-detection enforced together, structurally (not prompt-trusted). ROLE-GUARD becomes the single enforcement point where the orchestrator process is *unable* to mutate deckent's own source/git regardless of what any LLM emits.
- **Compose with multi-project isolation (ADR-G-017).** The dogfood↔user boundary shares the project-boundary substrate with the four isolation layers (directory + cred-encryption + scope-boundary + config-boundary); the discrimination and the isolation guards compose so a worker in user-project-A can never reach deckent's core, its git, or another tenant's tree.

---

## Consequences

**(+)** deckent protects its own source/git during dogfood and imposes zero overhead on user projects (P4 no-op). The rollback-guard is a real, working defense against self-git-mutation. The discrimination scales to global-install + many user projects.

**(−)** P1–P3 are **not wired** (the `isSelfModifyingSprint` flag defaults false with no live detector; the detector functions `isSelfModifyingSprint()`/`enforceSelfModifyingTask()` are 0-caller; manual-dispatch covers self-modify today) — SELFMOD-W must wire-or-formally-adopt ADR-D-007, and SELFMOD-CLEANUP removes-or-wires the unused detector functions (incl. the experimental user-project source-pattern path in `enforceSelfModifyingTask`). `package.json name` is a heuristic (a fork could rename — hardening to a publisher-signed marker is roadmap, treated as a *security boundary*). ROLE-GUARD pid/process enforcement is roadmap.

---

## References / Absorbed

- **Absorbs:** ADR-039.
- **Cross-ref:** ADR-G-020 (ROLE-GUARD / authority) · ADR-D-007 (manual dispatch — the live dogfood path) · ADR-G-017 (multi-project isolation) · ADR-G-025 (self-modify + rebuild/restart on crash-recovery).
- **Born / MASTER-PLAN:** ROLE-GUARD · SELFMOD-W (P1-P3 wire-or-formally-adopt ADR-D-007 — a *security boundary*, P1) · SELFMOD-CLEANUP (remove-or-wire the 0-caller `isSelfModifyingSprint()`/`enforceSelfModifyingTask()` detector functions) · global-install-discrimination (package.json-name → publisher-signed marker).
- **Memory:** `project_deckent_self_git_mutation_bug`.


---

## adr-g-022: Nervous System — Proactive Meta-Orchestrator

**Status:** accepted

# ADR-G-022: Nervous System — Proactive Meta-Orchestrator

**Class:** ADR-G (Global / Constitution) · **Scope:** global+project · **Immutable:** yes · **Source:** publisher · **Enforcement:** today=locked safety-floor (5 actions never auto) + config-gated opt-in (default-off) → tomorrow=non-blocking controlled activation + ApprovalBroker-unified approval (runtime-wide; today a shared durable pending-approval READER hub, not yet one broker)
**Status:** accepted · **Date:** 2026-06-30 · **Absorbs:** ADR-040 (Nervous System Architecture)
**Crosswalk:** ADR-040 → ADR-G-022

> **Strength note (Alperen, 2026-06-30):** Nervous is one of deckent's tremendous powers — a key enterprise-layer strength (proactive governance/control). Its ADR, tool, and code must all be very correct; it must be opened to BOTH dogfood and user channels critically, correctly, and in a CONTROLLED way (it can be obstructive when naively enabled).

---

## Context

Brain/Auditor/Worker are **reactive** — errors surface in retro, after the fact. ADR-040 added a **proactive** meta-layer (`src/nervous/`): Observer → DetectorRegistry → DecisionEngine → Proposer → Dispatcher → Executor, with 4 autonomy presets, 5 locked safety-floors, a 30-action registry, and 12 runtime detectors (config-surface = 16 slots: 5 active + 11 reserve; whole system default-off). The 2026-06-30 review keeps the architecture and adds four requirements: **generalize the action vocabulary** (language/project-agnostic), make it **non-blocking + controlled**, treat it as an **enterprise-layer strength**, and **unify its approval with the runtime ApprovalBroker**.

---

## Decision (Today)

```xml
<nervous-system>
  <pipeline>Observer (EventBus + fs-watch + cron-tick + lifecycle) → DetectorRegistry
    (12 runtime detectors; 16 config slots = 5 active + 11 reserve) → DecisionEngine
    (AuthorityMatrix preset lookup) → Proposer (throttle)
    → Dispatcher (MCP/CLI/File adapters) → Executor (autonomous|suggest-timeout|approve).</pipeline>
  <autonomy presets="strict|balanced|autopilot|full-auto"/>
  <safety-floor locked="5">KILL_LIVE_SPRINT · MANUAL_FILE_DELETE · COST_OVER_THRESHOLD ·
    DESTRUCTIVE_GIT · ADR_DEPRECATE_ACCEPTED — never auto, unconditional human wait.</safety-floor>
  <actions count="30" risk="low|medium|high"/>
  <activation default="config-gated opt-in"/>
</nervous-system>
```

Executor approve-mode: non-safety-floor actions auto-proceed on a **presence-aware** timeout (config-keyed — `approve_timeout_attended_ms` ~30s when a human is attending, `approve_timeout_unattended_ms` ~5s when not — NOT a fixed 10s; the CLI enable-message still says 10s and must be single-sourced — NERVOUS-TIMEOUT-SSOT); safety-floor unconditional. Cross-process approval round-trip + `edit` live (modifiedPayload).

> **Note:** In deckent-dev the config flip is currently OFF (`nervous_system.enabled: false`); re-enable is a separate decision. The Sprint-281 NERV-W1 fix replaced a stub action-handler (which silently dropped every approved action) with the real `createActionHandler` — the action-hand now actually executes.

---

## Intent / Roadmap (Tomorrow)

- **NERVOUS-ACTION-GENERALIZE:** the action registry is TS/deckent-specific — real actions include `SRC_MODIFICATION`, `COMMIT_PUSH`, `DIRECTIVES_WRITE`, `SPRINT_START` (note: `NPM_PUBLISH` is an *illustrative* target, not a current registry action). Generalize to **language/project-agnostic** concepts (a publish action → `PUBLISH`, etc.) so it works for Python/C++/Go/any project (the ADR-G-009 language-agnostic pattern, applied to actions).
- **NERVOUS-NONBLOCK:** "enabled → obstructive" must be solved — non-blocking + controlled activation (fixes the observer fs.watch/CPU loop + approval-block). Opened to dogfood AND user channels critically + controlled rollout.
- **APR unification:** today a shared durable pending-approval **reader hub** (`core/pending-approvals.ts`) serves nervous + autonomous approvals across surfaces — but it is a reader, not one runtime-wide ApprovalBroker. The nervous Executor approval (autonomous/suggest/approve + safety-floor + cross-process + edit) **merges with the runtime-wide ApprovalBroker** (APR-1/APR-2) — nervous becomes one approval-source on a multi-channel live-relay bus.
- **NERVOUS-ENTERPRISE:** position nervous as the enterprise-layer's proactive governance/control power (ADR-G-016 "enterprise = governance depth"); controlled rollout dogfood→user.

---

## Consequences

**(+)** Errors are caught before retro; 4 presets + per-action override + 5 safety-floors give granular, audit-trailed control. A major moat + enterprise strength. APR-unification (tomorrow) makes it the proactive arm of one approval bus.

**(−)** The action vocabulary is not yet language-agnostic (dogfood-only utility today; `NPM_PUBLISH` is illustrative, not a real action); the detector surface is 16 config slots but 12 runtime / 5 default-active; the approve-timeout is presence-aware but the CLI message is stale (NERVOUS-TIMEOUT-SSOT); approval today is a shared reader-hub, not one ApprovalBroker (APR); "enabled→obstructive" is unsolved (NERVOUS-NONBLOCK); config currently OFF in deckent-dev; enterprise-controlled-rollout is roadmap.

---

## References / Absorbed

- **Absorbs:** ADR-040.
- **Cross-ref:** ADR-G-020 (authority — nervous may restart Brain, never codes) · ADR-G-009 (language-agnostic pattern, applied to actions) · ADR-G-016 (enterprise = governance depth) · ADR-G-032 (mutation-approval checkpoint) · APR (ApprovalBroker).
- **Born / MASTER-PLAN:** NERVOUS-ACTION-GENERALIZE · NERVOUS-NONBLOCK · NERVOUS-ENTERPRISE · NERVOUS-TIMEOUT-SSOT (single-source the approve-timeout across ADR / executor / CLI-message) · APR-1/APR-2.
- **Memory:** `project_nervous_observer_feedback_loop_rootcause` · `project_nervous_activation_plan`.


---

## adr-g-023: Agent/Skill Taxonomy

**Status:** accepted

# ADR-G-023: Agent/Skill Taxonomy

**Class:** ADR-G (Global / Constitution) · **Scope:** global+project · **Immutable:** yes · **Source:** publisher · **Enforcement:** today=Agent=vertical-domain-expert / Skill=horizontal-capability taxonomy + `routeTaskV2`/`selectBestAgent`/`selectBestSkills` routing (legacy `selectAgent`/`selectSkills` helpers feed it) + `AgentRoutingHealth` advisory 40%-threshold (detector-monitored, not hard-enforced) → tomorrow=catalog expansion (AGSK-1) + routing-balance (ADR-G-006) + user-custom agent/skill (ADR-UG / ADR-UP)
**Status:** accepted · **Date:** 2026-06-30 · **Absorbs:** ADR-041 (Agent Taxonomy — Horizontal Skills vs Vertical Agents) · **Supersedes:** —
**Crosswalk:** ADR-041 → ADR-G-023

---

## Context

deckent's worker fleet is selected along two orthogonal axes — *which specialist* (agent) and *which cross-cutting capability* (skill). Conflating those axes broke routing. Sprint 145-147 live evidence showed the `test-writer` agent capturing an ever-larger share of tasks — 52% → 53% → **100%** by Sprint 147 — because it matched the `test` keyword (including any `tests/` scope). The `AgentRoutingHealth` detector crossed its anomaly threshold and triggered an ADR.

The root cause was a **taxonomic error**: "writing tests" is a *horizontal capability* every agent applies, not a *vertical domain* of its own. Modeling it as an agent produced four failures — wrong classification, a degenerate routing distribution (one agent at 100% made the anomaly detector meaningless), a Beta-GA UX problem ("why does everything go to test-writer?"), and an intent-classifier that mislabeled every `tests/` task as primary-intent `testing`.

Sprint 148 shipped the reform package: archive `test-writer`, add `testing-expert` skill auto-activation, drop `testing` as a primary intent (replaced by a `test-coverage` *tag*), update the Router-V2 fallback chain, and clean 15 agent `PROMPT.md` rubrics. The taxonomy was reconfirmed with Sprint 149/150/166 dogfood evidence and is user-facing product law — users see and route against agent/skill surfaces, and custom-agent breaking-change impact is user-facing too.

---

## Decision (Today)

### 1. Two orthogonal axes

```xml
<agent-skill-taxonomy>
  <agent kind="vertical">
    A deep specialist in ONE domain. Examples: architect (system design, module
    management), security-auditor (vulnerabilities, OWASP), frontend-designer
    (UI/UX, components), doc-writer (docs, README, CHANGELOG), bug-fixer
    (debugging, regression). The packaged built-in SOURCE is `src/core/builtins/agents/`
    (15 agents); `.deckent/agents/` is the workspace-installed POOL (15, excl temp/archive).
  </agent>
  <skill kind="horizontal">
    A cross-cutting capability ANY agent may use. Examples: testing-expert
    (vitest, coverage — favored on a tests/** scope; see §2.2 for the actual
    two-path mechanism), typescript-expert (TS type system), documentation-writer
    (Markdown, JSDoc).
  </skill>
  <invariant>
    Testing is a HORIZONTAL skill — architect writes tests, bug-fixer writes
    tests. A dedicated `test-writer` agent is therefore redundant and is removed
    (archived under .deckent/agents/archive/test-writer-removed-sprint-148/).
  </invariant>
</agent-skill-taxonomy>
```

### 2. Routing rules

1. **Intent classifier** — `testing` is **not** a primary intent. A `tests/**` scope adds a `test-coverage` *tag* (`routing-engine.ts` `'test-coverage'` → +2) instead.
2. **Skill auto-activation (two paths today)** — the legacy `selectSkills()` helper (`skill-selector.ts`) hard-adds `testing-expert` when scope is `tests/**` or `filesWrite` includes `*.test.ts`; the **main Router-V2 `selectBestSkills()`** instead *favors* it via the `test-coverage` tag → `+2` score (`routing-engine.ts`), **NOT** via the manifest `autoActivate` field. The built-in `testing-expert` manifest still carries a **dead `intent.primary: testing` activation rule** (testing is no longer a primary intent) plus an unused `autoActivate` field — both must be cleaned and the two paths reconciled (SKILL-MANIFEST-CLEANUP).
3. **Agent selection** — `selectAgent()` (legacy `agent-selector.ts` helper) scores by primary intent (core-dev → architect, bug-fix → bug-fixer, …); the **main decision path is `routeTaskV2()` → `selectBestAgent()` + `selectAgentByFallback()`** (Router-V2). Independent of model/effort selection.
4. **`AgentRoutingHealth`** — anomaly threshold `ANOMALY_THRESHOLD_RATE = 0.40` (`detectors/agent-routing.ts`): no single agent should exceed ~40% of assignments. This is a **detector-monitored advisory** (the nervous-system detector *warns*), **not** a hard gate.

### 3. Distribution reality (honest)

The taxonomy itself (vertical/horizontal, test=skill) is sound and durably enforced — `test-writer` stays at 0 assignments across post-reform sprints (148: 0/27, 150: 0/38). But the *distribution-balance* goal has **chronically recurred**: `test-writer`'s monopoly was periodically replaced by `refactorer`-weight (e.g. Sprint 211: 12/16). That imbalance is mitigated — not solved — by multi-signal scoring and skill→agent affinity (now both inside **ADR-G-006**); the 40% threshold remains a continuously-monitored advisory target, not a guarantee.

> **Threshold reconciliation (40% vs ≤60%):** these are **two distinct mechanisms at two layers**, not a contradiction. **40%** is the post-hoc `AgentRoutingHealth` *advisory alarm* (the ADR-G-022 detector *warns* when any agent exceeds ~40% of assignments — it never blocks). **≤60%** is the in-selection *diversity-guard* inside ADR-G-006 — it down-weights an agent approaching ~60% share at route-time. The detector warns earlier (40%) than the guard caps (≤60%); the detector only observes, the guard actively shapes the next selection.

---

## Intent / Roadmap (Tomorrow)

- **AGSK-1 — catalog expansion.** Grow the built-in agent and skill catalog beyond the current 15 agents, each as a clean vertical/horizontal split, with every new agent carrying a rubric-quality `PROMPT.md`. Scale target: the catalog and its routing must stay sane at hundreds of agents / thousands of skills.
- **Routing balance.** The recurring single-agent monopoly is owned by **ADR-G-006** (Routing & Selection) — multi-signal scoring + `SKILL_AGENT_MAP` skill→agent affinity + a diversity guard (≤60%). This ADR defines the *taxonomy*; ADR-G-006 owns *balanced selection over* it.
- **User-custom agent/skill.** Users define their own agents (vertical) and skills (horizontal) per global host / per project, expressed as **ADR-UG / ADR-UP** layers — deckent observes and routes against them under the ADR-G-baseline (precedence G>U>D, **ADR-G-019**). A custom `test-writer` in a user project may need a migration adapter (the one breaking change).

---

## Consequences

**(+)** Routing classification is correct (test is a skill, not an agent), so the `AgentRoutingHealth` detector measures real anomalies instead of a false 100%; the Beta-GA UX is legible ("why this agent?" is answerable); and skills are reusable economy — `testing-expert` serves many agents instead of one agent monopolizing a keyword. The taxonomy is reconfirmed across Sprints 148/149/150/166 and is stable product law.

**(−)** Distribution balance is a *moving* target, not a closed one — the monopoly recurs (refactorer-weight) and is mitigated, not eliminated, by ADR-G-006; the 40% threshold is advisory (warned), not hard-enforced. The testing-expert auto-activation runs through two paths (legacy `selectSkills` hard-add + Router-V2 tag-score) and the built-in manifest still carries a dead `intent.primary: testing` rule + an unused `autoActivate` field (SKILL-MANIFEST-CLEANUP). Sprint-147 `test-writer` stats were archived (not lost). A user project that defined a custom `test-writer` agent hits a breaking change and may need a migration adapter.

---

## References / Absorbed

- **Absorbs:** ADR-041 (Agent Taxonomy — Horizontal Skills vs Vertical Agents; test-writer removal, `testing-expert` auto-activation, intent-classifier refactor, Router-V2 fallback, 15-agent rubric cleanup; Sprint 281 distribution-reality amendment).
- **Routing & balance:** **ADR-G-006** (Routing & Selection) — multi-signal scoring (old ADR-072) + skill→agent affinity `SKILL_AGENT_MAP` + diversity guard (old ADR-075B); owns balanced selection over this taxonomy.
- **Detector:** **ADR-G-022** (Nervous System) — `AgentRoutingHealth` detector (old ADR-040) surfaces the advisory 40% threshold.
- **Authority:** **ADR-G-020** (Authority, Roles, Flow & Enforcement) — `test-writer` removed from the authority matrix (old ADR-037 RBAC).
- **Evaluation:** **ADR-G-009** (Evaluation Integrity) — `testing-expert` as a horizontal capability under coverage-aware evaluation.
- **User layers:** **ADR-G-019** (ADR Governance & 4-Layer Taxonomy) — user-custom agent/skill via ADR-UG / ADR-UP (precedence G>U>D).
- **Born work-items:** AGSK-1 (agent/skill catalog expansion + scale-to-hundreds/thousands), ROUTING-BALANCE (owned by ADR-G-006), USER-CUSTOM-AGENT-SKILL (ADR-UG/UP + custom-agent migration adapter), SKILL-MANIFEST-CLEANUP (remove dead `intent.primary:testing` + wire-or-remove `autoActivate` in testing-expert/ci-testing manifests; reconcile Router-V2 `selectBestSkills` with the manifest).
- **Direction:** memory `feedback_agent_routing_imbalance`, `docs/architecture/agents.md`, `docs/architecture/agent-skill-architecture.md`.


---

## adr-g-024: Mode Architecture (Universal Naming · sprint | task | process)

**Status:** accepted

# ADR-G-024: Mode Architecture (Universal Naming · sprint | task | process)

**Class:** ADR-G (Global / Constitution) · **Scope:** global+project · **Immutable:** yes · **Source:** publisher · **Enforcement:** `deckent_style` config + mode-aware routing
**Status:** accepted · **Date:** 2026-06-30 · **Absorbs:** ADR-042 (Hybrid Mode Architecture) + ADR-067 (Process Mode + Tenant Isolation)
**Crosswalk:** 042 (+067) → ADR-G-024

> **Naming directive (Alperen, 2026-06-30, repeated):** "Sprint" is developer jargon — we will RENAME it to a universal concept that works for user AND enterprise AND dev AND teams. Proceed carefully on all mode/process work because of this rename.

---

## Context

deckent runs work in distinct execution paradigms. ADR-042 shipped a dual mode (`deckent_style: sprint | task`): sprint = developer orchestration (Brain active, multi-worker, lifecycle); task = single-shot life-assistant. ADR-067 added the foundation for a **third** style, `process` (long-lived + agentic + multi-tenant — `TenantContext`). The 2026-06-30 review consolidates them, commits to the third mode, and binds the universal-naming rename.

---

## Decision (Today)

```xml
<mode-architecture>
  <style key="deckent_style" values="sprint | task | process" config="3-layer (ADR-G-001)">
    <sprint>developer orchestration — Brain active, multi-worker, full lifecycle.</sprint>
    <task>single-shot — Brain bypass, instant result. (Now also the autonomous engine's
      execution primitive: durable backlog kind=task → runTaskMode.)</task>
    <process>long-lived + AGENTIC + multi-tenant (TenantContext); the autonomous engine
      (src/orchestra/autonomous/) is its agentic runtime.</process>
  </style>
  <style-vs-surface>style = execution paradigm (sprint|task|process). Surfaces
    (CLI/REPL/dashboard/MCP/bot) are access ON TOP of a style — a surface is NOT a style.</style-vs-surface>
  <tenant>TenantContext + resolveTenant (opts → DECKENT_TENANT_ID env → 'local'; the
    doc-comment says "config" but NO config step is read). 'local' = single-tenant/dev,
    backward-compatible. NOTE: this resolveTenant is 0-caller dormant — live tenant
    resolution is replicated separately in the API endpoints (kpi-endpoint etc.) plus
    actor.tenantId → entry.tenant → audit/API filter (see Note below).</tenant>
</mode-architecture>
```

> **Clarification — "autonomous" has distinct referents (ties to AUTO-NAMING):** (1) the **autonomous *engine*** (`src/orchestra/autonomous/`) is the agentic *runtime of `process` mode* — NOT a separate `deckent_style` today (`process` is the style; the autonomous engine is *how* a process runs). (2) **autonomous as a roadmap *mode*** is the named member of the future comprehensive mode-set (flow / mission / autonomous). (3) **`deckent mode auto`** is a third, unrelated thing — the sprint|task auto-*detect* selector. These three "auto/autonomous" usages are disambiguated under the MODE-RENAME (born **AUTO-NAMING**), so a user is never left guessing which "auto" they invoked.

> **Note — three open accept-day decisions:** (1) **tenant-threading** — `resolveTenant` is 0-caller (dormant); tenant landed differently (config-flag `strict_tenant` + memory `tenant_id` column + audit-scope). Either wire `TenantContext`-threading OR amend the decision to the realized shape — not both. (2) **AUTO-NAMING** — `deckent mode auto` (sprint|task auto-DETECT) vs "autonomous engine" (the always-running process runtime) are two different "auto"s → user-confusion risk; clarify under the rename. (3) **process-style enforcement** — `deckent process submit` does NOT check `deckent_style=process`; the `process-runtime` helper clones the style per-kind so the style-guards pass regardless. It works, but it is a **soft surface**, not a config-gated mode — decide soft-surface vs config-gated (PROCESS-STYLE-GATE).

---

## Intent / Roadmap (Tomorrow)

- **🔴 MODE-RENAME:** retire "sprint" jargon → a universal/inclusive concept (run/job/mission/deckent-log…) for user/enterprise/dev/teams. Touches the whole mode/process vocabulary — proceed carefully.
- **Comprehensive mode-model:** sprint(renamed)/task/process + flow/mission/autonomous as a coherent set; **DIR-2** (DIRECTIVES 0-fragility across ALL modes + first-project safety) + **MODE-2** (mode-independent lifecycle kernel: retro/decay/cleanup).
- Resolve the two open decisions (tenant-threading, AUTO-NAMING).
- Enterprise multi-tenancy (ADR-G-031) builds on `process` mode.

---

## Consequences

**(+)** One mode law spanning dual→triple styles; the autonomous engine is recognized as the `process` runtime; style≠surface clears a recurring confusion. Backward-compatible (`local` tenant, sprint default).

**(−)** "sprint" rename is pervasive and not yet done (born MODE-RENAME — even the `config` category is still labelled "Sprint"). Three open decisions (tenant-threading dormant, AUTO-NAMING collision, process-style soft-surface vs config-gated). The `deckent mode` help/description still reads "sprint|task" though the command accepts `process` (MODE-HELP-FIX). DIR-2 0-fragility across all modes is roadmap.

---

## References / Absorbed

- **Absorbs:** ADR-042 + ADR-067.
- **Cross-ref:** ADR-G-001 (3-layer config) · ADR-G-031 (enterprise multi-tenancy on `process`) · ADR-G-020 (per-mode authority) · ADR-G-025 (process resilience) · ADR-G-015 (deckent-log multi-mode).
- **Born / MASTER-PLAN:** MODE-RENAME (incl. `config` "Sprint" category) · AUTO-NAMING · ADR-067-TENANT (threading decision) · PROCESS-STYLE-GATE (process soft-surface vs config-gated) · MODE-HELP-FIX (`deckent mode` description/error → sprint|task|process) · DIR-2 · MODE-2 · MODE-1 (process executor).
- **Memory:** `project_automation_usability_state` · `project_autonomous_first_dogfood_grand_vision`.


---

## adr-g-025: Process Resilience, Recovery & Live Observability

**Status:** accepted

# ADR-G-025: Process Resilience, Recovery & Live Observability

**Class:** ADR-G (Global / Constitution) · **Scope:** global+project · **Immutable:** yes · **Source:** publisher · **Enforcement:** today=runtime contract (crash-handlers at boot **with `redactSensitive()` wired into the fatal handler — ✅ CRASH-REDACT done 2026-07-01** + atomic checkpoint + phase persistence; eval-audit non-atomic; recovery mandatory) → tomorrow=provider-failover + auditor-approved takeover + WORKER-LIVE-TRACE stream
**Status:** accepted (CRASH-REDACT ✅ done 2026-07-01 — fatal-handler redaction wired+tested [sprint-348-005]; remaining provisionality = failover/live-trace/brain-death-procedure roadmap + EVAL-AUDIT-ATOMIC) · **Date:** 2026-06-30 · **Absorbs:** ADR-043 (Brain Crash Recovery) + ADR-044 (State Observability Contract) + ADR-047 Brain-death-procedure aspect
**Crosswalk:** ADR-043 + ADR-044 → ADR-G-025

> **Naming:** "sprint" → "süreç/process" (universal mode naming, ADR-G-024). This contract governs the resilience + observability of any orchestration *process*, not just a sprint.

---

## Context

Brain crash-recovery (old ADR-043) and state-observability (old ADR-044) were two halves of one concern: a process must be **durable, observable, and recoverable**. ADR-043 gave a 3-layer recovery (battle-tested in real crashes — Sprint 267 machine-sleep, Sprint 270 WSL-VM). ADR-044 gave phase-transition persistence + per-task evaluation audit. The 2026-06-30 review merged them and added three Alperen-directed requirements: **provider-failover on Brain crash**, **per-worker live tracking**, and a formal **Brain-death procedure**.

---

## Decision (Today)

### 1. 3-Layer Crash Recovery (from ADR-043)

```xml
<crash-recovery>
  <layer n="1">Entry-point exception handlers (uncaughtException/unhandledRejection).
    ✅ redaction IS wired (CRASH-REDACT, sprint-348-005, 2026-07-01): formatFatalAndExit
    passes BOTH message and stack through redactSensitive() before the stderr FATAL
    line and the .deckent/crashes/<ts>.log write — sk-/Bearer/API_KEY patterns are
    masked in both sinks (proven by tests/cli/error-handler-redact.test.ts against the
    REAL crash-log file). Residual ceiling: redactSensitive is a fixed allowlist — AWS
    AKIA…/ghp_…/JWT/generic password= are NOT masked (REDACT-COVERAGE follow-up).</layer>
  <layer n="2">Atomic checkpoint write (.tmp + renameSync; sprint_checkpoint_interval)
    — half-written checkpoints never read.</layer>
  <layer n="3">State recovery on restart (restoreSprintFromCheckpoint: fresh|complete|
    resume-evaluate) — completed-worker results survive a Brain crash; durationMs fix.</layer>
</crash-recovery>
```

### 2. State Observability (from ADR-044)

Every phase mutation calls `persistPhaseTransition` (atomic, fail-soft); every task evaluation calls `writeEvaluationAudit` (`.deckent/evaluations/<id>/...`) — post-mortem reconstructable GO/NO_GO rationale. (Note: `writeEvaluationAudit` is a plain `writeFileSync`, NOT the `.tmp`+`renameSync` atomic write that checkpoint/phase-persistence use — an atomicity-hardening candidate for post-mortem reliability, EVAL-AUDIT-ATOMIC.)

### 3. Brain-crash Provider-Failover  *(NEW — Alperen 2026-06-30)*

```xml
<provider-failover>
  After a bounded delay on Brain failure, the Brain (PID / wherever it runs) FAILS OVER
  from its current provider (e.g. Claude) to an equivalent (OpenAI/Codex), handing over
  the ENTIRE process + current state LOSSLESSLY.
  <supervision>Auditor verifies + APPROVES the takeover. Nervous may be triggered.</supervision>
  <escalation>autonomous first → on autonomous-failure: approved-retry → else: kill-process.</escalation>
</provider-failover>
```

This rests on **Brain provider/model-agnostic self-update**: today Claude is Brain; if tomorrow Codex/GPT-5.5 becomes Brain, the system proceeds **losslessly** (provider-neutral handover; cross-ref ADR-G-008 adapter).

### 4. Per-Worker Live Observability  *(NEW — Alperen 2026-06-30)*

During EXECUTE, each worker's **instant status** is trackable by **human AND system**, **everywhere** (dashboard + terminal + CLI + MCP), live or last-snapshot:

```
worker-1: starting provider (claude) → running checks → understood context
        → writing .plan → evaluating plan-phase → …
```

`.log` files are insufficient — a **structured progress-stream** is required (ties TERM-LIVE run-status footer + ADR-G-033 dashboard + ADR-G-009/TRN trace). (= WORKER-LIVE-TRACE.)

### 5. Brain-death Procedure  *(folds ADR-047 procedure aspect)*

A formal procedure for Brain death: fallback/retry **steps at system AND user level**, and **at which stage `deckent finalize --force` (or equivalent) is triggered** — plus the **tool** that drives it. (The dogfood *manual worktree-repair* protocol is separate, in ADR-D-007; this is the automated/user-level recovery procedure.) **State-of-code:** today `deckent recover` does orphan-IPC + stale-lock + post-finalize cleanup + a self-audit gate — it is NOT the staged provider-failover/retry/finalize-force procedure; that procedure is roadmap (BRAIN-DEATH-PROCEDURE).

---

## Intent / Roadmap (Tomorrow)

- **Failover + escalation engine** (provider-failover + auditor-approved-takeover + nervous-trigger + autonomous→retry→kill ladder) — today the recovery is single-provider; tomorrow it is provider-failover-capable.
- **WORKER-LIVE-TRACE** wired to TERM-LIVE + ADR-G-033 dashboard + MCP — the structured per-worker progress-stream replaces `.log` tailing.
- **Dashboard-reconcile** (ADR-044's known gap): finalize must reconcile `.dashboard`/`/api/status` with sprint-state (no stale "EXECUTE %80" after COMPLETE).
- **BRAIN-DEATH-PROCEDURE tool** + tie to `feedback_finalize_force_orphan_state`.
- **Brain-provider-self-update** lossless across providers (cross-ref ADR-G-008).

---

## Consequences

**(+)** Process state is durable, observable, recoverable, and (tomorrow) provider-resilient — the orchestration survives crashes, sleeps, and provider failures. Per-worker live-trace closes the #1 observability gap ("x is doing what, right now?"). Battle-tested core (Sprint 267/270).

**(−)** Crash-log redaction is ✅ wired (CRASH-REDACT done 2026-07-01) but the redactor's pattern-allowlist is a coverage ceiling (no AWS/ghp_/JWT/generic-password masking — REDACT-COVERAGE). `writeEvaluationAudit` is non-atomic (EVAL-AUDIT-ATOMIC). Provider-failover + escalation + worker-live-trace + brain-death-tool are roadmap; today `deckent recover` = cleanup, not the staged brain-death procedure. The proven core is the 3-layer recovery + checkpoint/phase persistence (Sprint 267/270 battle-tested). Dashboard-reconcile gap is known/open.

---

## References / Absorbed

- **Absorbs:** ADR-043 (Crash Recovery) + ADR-044 (State Observability) + ADR-047 (Brain-death procedure aspect).
- **Cross-ref:** ADR-G-008 (provider failover/self-update) · ADR-G-022 (nervous trigger) · ADR-G-020 (auditor authority for takeover-approval) · ADR-G-033 (dashboard) · ADR-G-009/TRN (trace) · ADR-G-024 (process naming).
- **Born:** **CRASH-REDACT** (✅ done 2026-07-01, sprint-348-005 — `redactSensitive()` wired into `formatFatalAndExit` message+stack for BOTH stderr + crash-log; sk-/Bearer/API_KEY absence proven on the real crash-log file) · **REDACT-COVERAGE** (born — extend the redactor allowlist: AWS `AKIA…`, GitHub `ghp_…`, JWT, generic `password=`/`token=`) · **EVAL-AUDIT-ATOMIC** (`writeEvaluationAudit` → `.tmp`+rename) · BRAIN-FAILOVER · WORKER-LIVE-TRACE · BRAIN-PROVIDER-SELFUPDATE · BRAIN-DEATH-PROCEDURE.


---

## adr-g-026: Dependency-Wave Execution & Control

**Status:** accepted

# ADR-G-026: Dependency-Wave Execution & Control

**Class:** ADR-G (Global / Constitution) · **Scope:** global+project · **Immutable:** yes · **Source:** publisher · **Enforcement:** today=dispatch contract (Kahn-topological dep-resolution + continuous per-tick; legacy-FIFO escape) → tomorrow=DEP-TOOL (terminal dependency control, DIRECTIVES-independent) + planDispatch wire (ADR-064-W)
**Status:** accepted · **Date:** 2026-06-30 · **Absorbs:** ADR-045 (Wave-Based Execution Semantics) + ADR-064 (TOPP Continuous Dispatch)
**Crosswalk:** 045 (+064) → ADR-G-026

> **Note (Alperen):** The Kahn-topological dependency pipeline is one of our greatest features and it works correctly. But it depends on the dependency being correctly written by the AI tool into DIRECTIVES — and we are removing DIRECTIVES. So dependency must also be analyzable/controllable via our TOOLS. Critical and must be correct.

---

## Context

Multi-task work executes in dependency order. ADR-045 wired `respawnEligibleTasks` (Kahn topological sort) so dependent tasks spawn when their deps complete — a "wave" model. ADR-064 (TOPP) removed the wave-barrier: continuous per-tick re-evaluation (a task spawns the instant its deps are satisfied, no barrier), with a `DECKENT_LEGACY_FIFO` rollback escape and a predecessor-digest in the prompt. Both are dogfood-live (flag flipped 2026-06-10; Sprint 279/280 multi-wave proven). The 2026-06-30 review merges them and adds a TOOL layer for dependency control (since DIRECTIVES is being removed).

---

## Decision (Today)

```xml
<dependency-execution>
  <pipeline>Kahn-topological dep resolution (respawnEligibleTasks). Dependency-satisfied
    set = DONE ∪ MANUAL_REVIEW_REQUIRED (MRR only when disk-deliverable exists; EXECUTING
    still blocks). config dependency_pipeline_enabled=true (dogfood-live).</pipeline>
  <dispatch model="continuous">dispatchTick per-tick: a task spawns the instant ANY dep
    completes — no wave-barrier (TOPP). DECKENT_LEGACY_FIFO=1 = operator rollback to the
    pre-TOPP one-per-tick FIFO. Predecessor-digest embedded in the spawned prompt.</dispatch>
</dependency-execution>
```

> **🔴 ADR-064-W:** the pure planner `planDispatch` (returns DispatchPlan/mode) is **tested-but-UNWIRED** (0 runtime callers); `dispatchTick` decides imperatively via `processQueue`/`maybeRespawn`. **The drift is concrete, not just "unwired":** the model's dependency-satisfied set is `DONE + fixForTaskId`-aggregate **ONLY (no `MANUAL_REVIEW_REQUIRED`)**, while the live `respawnEligibleTasks` unblocks on `DONE ∪ MRR` (the Sprint-280 deadlock-fix). **Naively wiring `planDispatch` would REGRESS the MRR-unblock.** So ADR-064-W must FIRST reconcile the model with the runtime contract (MRR-unblock + collision-graph + the live side-effects: `DEPENDENCY_BLOCKED` event, metrics, checkpoint), THEN wire — so the pinned model == the live path without regression.

---

## Intent / Roadmap (Tomorrow)

- **🔴 DEP-TOOL:** today dependency capture depends on the AI tool writing it correctly into DIRECTIVES (parsed in `task-builder.ts`), and the CLI/MCP only **observe** the graph (`status --graph` mermaid `<sprint>-depgraph.mmd`, MCP `dependencyGraph`) — there is **no propose/edit/control tool**. **DIRECTIVES is being removed** → dependency must be analyzable / suggestible / controllable / editable via a **TOOL**, terminal-trackable, DIRECTIVES-independent (graph analysis, edge add/remove, dry-run wave preview, CLI/MCP parity). Even when the AI doesn't catch a dependency, a suggestion+control tool surfaces it. Critical + must be correct.
- **ADR-064-W:** wire `planDispatch` (close the test-vs-runtime drift).
- Wave-robustness under the MOAT (MOAT-1 worktree-merge-race tie).

---

## Consequences

**(+)** Continuous dependency-aware dispatch (no wasted wave-barrier latency) with an operator rollback escape; one of deckent's strongest features, dogfood-proven. MRR-unblock prevents deadlock.

**(−)** Dependency correctness currently relies on AI-written DIRECTIVES (born DEP-TOOL, critical once DIRECTIVES is removed; today only graph-observation, no control). `planDispatch` is unwired AND its model diverges from the runtime on the MRR-unblock rule (DONE+fix vs DONE∪MRR) — wiring it naively would regress the Sprint-280 deadlock-fix (born ADR-064-W: reconcile-then-wire). The `config-recovery.md` doc still shows `dependency_pipeline_enabled=false` vs the runtime `true` (CONFIG-RECOVERY-FIX). Large-sprint wave-robustness is a monitored concern.

---

## References / Absorbed

- **Absorbs:** ADR-045 + ADR-064.
- **Cross-ref:** ADR-G-024 (modes — dependency execution within a process) · ADR-G-034 (terminal — DEP-TOOL surface) · ADR-G-014 (spawn) · ADR-G-009 (eval — MRR/disk-proof) · MOAT-1.
- **Born / MASTER-PLAN:** DEP-TOOL · ADR-064-W (planDispatch wire).
- **Memory:** `feedback_scale_up_autonomous`.


---

## adr-g-027: Prompt Lifecycle & Worker-Context

**Status:** accepted

# ADR-G-027: Prompt Lifecycle & Worker-Context

**Class:** ADR-G (Global / Constitution) · **Scope:** global+project · **Immutable:** yes · **Source:** publisher · **Enforcement:** lifecycle contract (stdin-delivery always; tmpfile-persist config-gated via `worker_prompt_txt_file`) + content-completeness (skill + scope-relevant-ADR never truncated; transport-digest bounded WITHOUT access-loss)
**Status:** accepted · **Date:** 2026-06-30 · **Absorbs:** ADR-048 (Prompt Lifecycle Contract) + ADR-060 (Self-Awareness Propagation — 5-channel context)
**Crosswalk:** 048 (+060) → ADR-G-027

> **Note (Alperen, 2026-06-30):** ADR-060 is "a masterpiece" — fold it into the current direction. The token situation was already noticed here; improve it WITHOUT sacrificing the worker's access or quality. This ADR is comprehensive and must be very well designed.

---

## Context

A worker prompt has two intertwined concerns: where it physically lives (tmpfile lifecycle) and what it semantically contains (context). ADR-048 defined the **tmpfile lifecycle** — `.prompt-*.txt`/`.worker-*.sh` write→persist→archive across all three spawn backends, with active-worker protection (a per-worker kill must not delete a live worker's prompt) — plus a content layer: **no truncation** (full skill + full ADR injection; prompt-completeness > token-saving). ADR-060 ("masterpiece") defined the **5-channel worker-context** (init / sync / manifest / skill-declare / enrichment) that composes the prompt, and explicitly flagged the **token-budget** trade-off. The 2026-06-30 review unifies them.

---

## Decision (Today)

```xml
<prompt-lifecycle>
  <tmpfile persist="config-gated: worker_prompt_txt_file (default true = backward-safe)">
    prompt is ALWAYS delivered via stdin-stream (the shell never interprets it → injection-safe).
    tmpfile-PERSIST (.prompt-{taskId}-{hash}.txt at spawn → persist until process cleanup →
    archive move-not-delete to .tasks/archive/) is an OPTIONAL dev/forensic VISIBILITY layer,
    NOT the delivery mechanism: docker+tmux persist when the gate is ON; subprocess is
    stdin-only (the reference form of gate=OFF). Gate=OFF stops the file writes + the disk /
    privacy surface WITHOUT losing prompt delivery. Per-worker kill must NOT delete OTHER live
    workers' prompts (active-worker protection via getActiveWorkerIds; cross-sprint orphans
    archived at startup); explicit kill hard-deletes the KILLED task's OWN prompt.
  </tmpfile>
  <content-completeness rule="skill + scope-relevant-ADR never truncated">
    full SKILL.md per assigned skill + full scope-relevant-ADR body injected — no
    "(content truncated)" markers on skill/ADR bodies. Two SANCTIONED bounds reduce TRANSPORT
    tokens WITHOUT reducing ACCESS (full source stays on disk / one pointer away): (1) in
    code-development tasks, background ADRs (not scope-intersecting) render as active-constraint
    head + summary + [full: …] pointer while scope-intersecting ADRs stay full-body; (2) the
    dependency DIGEST is char-bounded (Sprint-183 anti-balloon: notes≤500, entry≤2000 + marker)
    while the raw .result stays full on disk. Philosophy: prompt-completeness > token-saving —
    optimize the HOW (scope→tool, bounded-digest+disk, prompt-cache) never the WHAT. ADR
    relevance threshold (min 0.3) + agent-prompt single-source (PROMPT.md).
  </content-completeness>
  <worker-context channels="init·sync·manifest·skill-declare·enrichment">
    Channel-5 enrichment is live (dependency .result propagation) and grew via COMM-1
    (cross-worker SharedMemory notes + upstream handoffs injected, config-gated).
    The coordinated buildWorkerContext() bundle is the roadmap form.
  </worker-context>
</prompt-lifecycle>
```

### Token discipline — improve WITHOUT sacrificing access/quality

The token cost of full-content + multi-channel context is real (noticed in ADR-060). The rule: **reduce tokens without reducing the worker's access or output quality** — i.e., optimize *how* (cache, structure, scope-via-tool) not *what* (never truncate skill/ADR/context).

---

## Intent / Roadmap (Tomorrow)

- **WP-OPT:** token-optimize the worker prompt at the SAME quality — minimize tokens + reduce repetition, **but truncation stays forbidden**. The big lever is moving scope-enforcement out of the prompt into a TOOL (**TOOL-SCOPE**, ADR-G-034) so the prompt shrinks without losing capability.
- **Coordinated `buildWorkerContext()`** (ADR-060 form): the 5 channels composed under one coordinator (today they're independent builders + COMM-1).
- **Cross-backend** new backends inherit the lifecycle contract (ADR-G-014: firecracker/cloud).
- Generic/provider-agnostic prompt vocabulary.

---

## Consequences

**(+)** Worker prompts physically survive correctly (no active-worker prompt loss) and semantically carry complete skill/ADR/dependency context — the worker never works blind or on truncated guidance. The token concern is addressed by *how* (scope→tool, cache), not by cutting context.

**(−)** Token cost of full-content is real until WP-OPT (scope→TOOL-SCOPE) lands — born work-item. The coordinated `buildWorkerContext()` is roadmap (independent builders + COMM-1 today). Backend lifecycle differs by design: docker+tmux persist a tmpfile, subprocess is stdin-only; the `worker_prompt_txt_file` gate makes persistence opt-out everywhere (PROMPT-TXT-OPT born). tmux tmpfile parity was CLOSED in Sprint-170 (taskId-embedded name → active-worker protection); only the Auditor path stays hex-only, and stale pre-170 comments in `claude.ts`/`spawn-backend.ts` still describe the old behavior (PROMPT-COMMENT-REFRESH born).

---

## References / Absorbed

- **Absorbs:** ADR-048 (incl. its Sprint-182 content amendment) + ADR-060.
- **Cross-ref:** ADR-G-034 (TOOL-SCOPE — scope via tool, prompt shrink) · ADR-G-014 (cross-backend) · ADR-G-035 (memory — context source) · ADR-G-020 (scope authority) · ADR-G-006 (skill/agent selection → channels).
- **Born / MASTER-PLAN:** WP-OPT (token-opt, no-truncation) · PROMPT-TXT-OPT (`worker_prompt_txt_file` gate — tmpfile-persist opt-out; subprocess = gate-off reference) · PROMPT-COMMENT-REFRESH (stale pre-170 tmux comments) · COMM-1/COMM-2 · buildWorkerContext-coordinator.
- **Memory:** `feedback_prompt_completeness_over_brevity`.


---

## adr-g-028: Work Taxonomy (TaskKind × TechStack) & Evaluation

**Status:** accepted

# ADR-G-028: Work Taxonomy (TaskKind × TechStack) & Evaluation

**Class:** ADR-G (Global / Constitution) · **Scope:** global+project · **Immutable:** yes · **Source:** publisher · **Enforcement:** today=gaming-proof (Object.freeze registries; scope-shape detection, not title/description) + EffectClass→policy-gate (WM-6 PARK for risky classes) → tomorrow=EffectClass→runtime ApprovalBroker (critical-irreversible) + expanded TaskKind set + user-custom kinds (ADR-UG/UP)
**Status:** accepted · **Date:** 2026-06-30 · **Absorbs:** ADR-053 (TaskType Taxonomy) + ADR-055 (Hybrid Scoring 5-Layer Pipeline)
**Crosswalk:** 053 (+055) → ADR-G-028

> **Note (Alperen, 2026-06-30):** We advanced the TaskKind/EffectClass concepts a lot — we should add MORE types here; the core 3 are too narrow.

---

## Context

deckent must know *what kind* of work a task is, to judge it correctly and gate it safely. ADR-053 defined 3 TaskTypes (audit / document-write / code-development) with scope-shape detection + an EffectClass (reversibility tag) — the canonical work-model (WM-2 `work-model.ts`), extended to a second axis TechStackKind (WM-7). ADR-055 proposed a 5-layer Hybrid Scoring pipeline; the formal pipeline was never built, but its goals were realized organically (honest-gate, criteria-deriver, EffectClass→policy-gate, XVER-1, ADR-G-009). The 2026-06-30 review unifies the taxonomy + evaluation and commits to expanding the type set.

---

## Decision (Today)

```xml
<work-taxonomy ssot="src/core/work-model.ts (WM-2)">
  <task-kind>Canonical TaskKind (work-model.ts:27, SSOT) = code-development · test ·
    documentation · audit · security · refactor · devops · config · design · data · generic.
    Plan-time RUBRIC-detection is a 3-class projection of that canonical set — audit |
    document-write | code-development — detected by scope-shape (filesWrite/directories),
    NOT title/description (gaming-proof), priority audit → document-write → code-development.
    `document-write` is the legacy RubricTaskType (rubric/effect view); its canonical
    counterpart is `documentation`. Object.freeze registries.</task-kind>
  <effect-class>pure | reversible | idempotent | compensable | critical-irreversible.
    TWO derivation paths: (a) rubric/task path — EFFECT_CLASS_REGISTRY (frozen 3-map:
    audit=pure, document-write/code-development=reversible) for task evaluation; (b)
    autonomous/process path — computeEntryEffectClass derives the full 5-class from
    keyword+kind+scope+capability, failing SAFE to critical-irreversible when unknown.
    Gate (WM-6): policy `risk-tagged` ENFORCES (pure/reversible → auto, risky → PARK);
    policy `auto` is a trusted-authority OVERRIDE that bypasses EffectClass; policy
    `approval-required` always parks. Process-mode is safe-by-default (emits risk-tagged
    entries → EffectClass, not the submitter, decides). gaming-proof: frozen registries
    mean a worker cannot self-downgrade critical-irreversible → reversible to skip the gate.</effect-class>
  <tech-stack>TechStackKind (WM-7) = the SECOND axis. Evaluation is TaskKind × TechStack:
    a C++ project is not held to tsc-clean; coverage required only on
    COVERAGE_MEASURABLE_STACKS (cross-ref ADR-G-009).</tech-stack>
  <scoring>the ADR-055 5-layer pipeline was NOT built as a formal module; its layers are
    realized organically — Layer-1 schema (validateResultSchema), Layer-2 gates
    (honest-gate + reconcileSpuriousNoGo + disk-verify), Layer-3 quality (tip-rubric +
    WM-7 criteria-deriver), Layer-4 EffectClass→policy-gate, Layer-5 XVER-1 cross-verify.</scoring>
</work-taxonomy>
```

---

## Intent / Roadmap (Tomorrow)

- **🔴 TASKTYPE-EXPAND:** the type/adaptor level has ALREADY started — the canonical TaskKind set is 11 kinds live (work-model.ts). The remaining work is *productization*: carry that expansion down into plan-time **rubric-detection** (still a 3-class scope-shape projection) + **EFFECT_CLASS_REGISTRY** (still a 3-map) + routing, each new kind with its own rubric + effect-class + detection — plus **user-custom task-types** (ADR-UG/UP). The concepts (TaskKind × TechStack × EffectClass) are advanced enough to carry this.
- **Scoring consolidation:** decide whether to build the formal 5-layer pipeline (consolidating the organic gates — ADR-D-006 god-object-split pattern) OR formalize the organic architecture. Open architectural choice.
- **EffectClass→approval** ties the runtime ApprovalBroker (APR) for critical-irreversible.

---

## Consequences

**(+)** Work is judged by what it actually IS (kind × stack × effect), gaming-proof, with risky work parked behind approval. The canonical work-model (WM-2) is the single SSOT for the three consumers (rubric/routing/adr-selector). EffectClass→policy-gate is live in the autonomous engine.

**(−)** Canonical TaskKind is 11-kind type-level live, but plan-time rubric-detection + EFFECT_CLASS_REGISTRY are still a 3-class view — the productization gap is born TASKTYPE-EXPAND; user-custom kinds are roadmap. The formal scoring pipeline is unbuilt (organic gates carry it; consolidation is an open choice).

---

## References / Absorbed

- **Absorbs:** ADR-053 + ADR-055.
- **Cross-ref:** ADR-G-009 (evaluation integrity — the deriver consumes this taxonomy) · ADR-G-006 (routing uses task-kind) · ADR-G-020 (EffectClass→approval gate) · ADR-G-032 (evolution outcome by kind) · APR (critical-irreversible approval).
- **Born / MASTER-PLAN:** TASKTYPE-EXPAND · scoring-consolidation · user-custom-task-type (UG/UP).
- **Memory:** `project_task_type_taxonomy_vision`.


---

## adr-g-029: Embedded Web Terminal (Remote PTY)

**Status:** accepted

# ADR-G-029: Embedded Web Terminal (Remote PTY)

**Class:** ADR-G (Global / Constitution) · **Scope:** global+project · **Immutable:** yes · **Source:** publisher · **Enforcement:** today=PTY sessions + WS gateway + bypass-independent **fail-CLOSED** auth (RCE-invariant) + raw-output NEVER persisted (structural) + structured-audit-persistence code-delivered, runtime-UNWIRED (no-op sink → born AUDIT-WIRE) + command/prompt guard + `AuthProvider` (Local·Oidc·Jwks-async·mTLS-seam)/`SessionBackend` seams → tomorrow=Desktop-app integration + enterprise-remote backends (k8s/SSH/SSO, audit-export/SIEM — sub-#3/#4) + TERM-RPC unification with the primary native terminal
**Status:** accepted (provisional — RCE-model + command/prompt guards live, but terminal-audit runtime-wiring is NOT wired [AUDIT-WIRE]: inv#3 clause-2 no-op sink; TerminalConfig hardcoded [TERM-CONFIG-WIRE]) · **Date:** 2026-06-30 · **Absorbs:** ADR-062 (Embedded Web Terminal — PTY Sessions, WS Gateway, Auth & Audit) · **Supersedes:** —
**Crosswalk:** ADR-062 → ADR-G-029

> **Note (pivot-reframe):** This is the **secondary / remote-access** PTY surface (a dockable terminal in the dashboard / desktop app, and the seam for enterprise remote exec) — it is **NOT** the primary terminal. The primary management+usage surface is the **native agentic terminal** (**ADR-G-034**). This record governs the remote-PTY security model; the day-to-day driving surface is ADR-G-034.

---

## Context

The dashboard (React + Vite + Tailwind) monitors sprints but offered no way to run interactive AI tools (`claude`, `gemini`, `codex`, `deckent`) or a shell from the browser — users context-switched between dashboard and terminal during supervision. Sprint 175 added an embedded terminal as sub-project #1 of a 4-part roadmap (#2 prompt/command guard, #3 multi-tenant/k8s isolation, #4 enterprise external integration).

Because a browser-reachable shell is a remote-code-execution surface, the security invariants are non-negotiable and were fixed in the verified spec before a line shipped. Sub-project #2 (the security guard — command/prompt guard, outbound-limiter) has since been **delivered**; its audit-integrity module is code-delivered but the production sink is a no-op (runtime wiring is born AUDIT-WIRE); #3 and #4 remain deferred. Under the 2026 product pivot, the dashboard becomes **observability-only** and the day-to-day interactive surface moves to the native terminal and a desktop app — so this embedded terminal is reframed as the *remote/secondary* PTY surface, and its hardened auth/audit model becomes the foundation for enterprise remote exec.

---

## Decision (Today)

A self-contained terminal subsystem under `src/api/terminal/`, wired by `src/api/server.ts` (HTTP control routes `GET/POST/DELETE /api/terminal/sessions` + localhost-only bootstrap-token injection) and `src/cli/commands/serve.ts` (`--host`, `--no-terminal`).

```xml
<module-boundary root="src/api/terminal/">
  <core>
    types.ts           — TenantId, SessionKind, AiTool, CreateSessionInput, SessionMeta, AuditAction, AuditEvent
    auth-provider.ts   — AuthProvider interface + LocalTokenAuthProvider (SHA-256 + crypto.timingSafeEqual)
    session-backend.ts — SessionBackend interface + LocalPtyBackend (@lydell/node-pty)
    session-manager.ts — PtySessionManager (Map by sessionId, bounded ring buffer, attach/detach, idle reaper)
    audit.ts           — TerminalAudit (structured lifecycle events → memory.db, tenant-scoped)
    ws-gateway.ts      — attachTerminalGateway (HTTP upgrade → auth → bridge)
  </core>
  <security sub-project="#2 — guards DELIVERED, audit-wiring born">
    command-guard.ts · prompt-guard.ts · outbound-limiter.ts (all delivered) ·
    audit-integrity.ts (module-delivered; production sink is no-op → runtime AUDIT-WIRE) (+ tests/security/)
  </security>
</module-boundary>
```

### Security invariants (the RCE law — never relax)

```xml
<invariants>
  <inv id="1" name="bypass-independent auth, fail-CLOSED">
    Terminal WebSocket auth is INDEPENDENT of and STRICTER than
    DECKENT_API_AUTH_DISABLED. Disabling the global REST API auth gate does NOT
    open the shell. LocalTokenAuthProvider DELIBERATELY ignores that env flag.
    Violating this is a direct RCE vector — the invariant must never be relaxed.
  </inv>
  <inv id="2" name="token delivery">
    Per-server-start token, injected into index.html ONLY for 127.0.0.1/::1
    callers (window.__DECKENT_TERMINAL_TOKEN__), presented via
    Sec-WebSocket-Protocol: deckent.<token> — never via query string, cookie, or
    a plain HTTP Authorization header on the WS upgrade.
  </inv>
  <inv id="3" name="structured-audit-only">
    Clause-1 (STRUCTURAL — always enforced): Raw PTY output (ANSI sequences,
    keystrokes, command output) is NEVER persisted to disk or memory.db.
    TerminalAudit.record() only ever serializes action/sessionId/detail/at, never the
    PTY stream — this holds regardless of sink, so it is a true invariant.
    Clause-2 (runtime-UNWIRED): the structured, low-volume lifecycle events
    (created/attached/detached/killed) are DESIGNED to be stored tenant-scoped
    (additive tenant_id column, non-destructive ALTER TABLE) with an HMAC integrity
    chain — but the production sink is currently a no-op (server.ts:1473, with no seam
    to pass a real store), so nothing is persisted and the chain never runs → born
    AUDIT-WIRE. Additionally, WS auth events (auth.ok/auth.deny) are tenantId:'local'
    hardcoded while lifecycle events resolve the real tenant via session-meta → born
    AUDIT-TENANT.
  </inv>
  <inv id="4" name="reattach boundary">
    A session survives client disconnect (tab close, network blip) and reattaches
    with scrollback replay from an in-memory bounded ring buffer (default 256 KiB).
    It does NOT survive a server restart (in-memory only); disk persistence is backlog.
  </inv>
  <inv id="5" name="enterprise seams from day one">
    AuthProvider now has THREE impls — LocalTokenAuthProvider (default, SHA-256 +
    timingSafeEqual), OidcAuthProvider (HS256/RS256, alg:none rejected, confusion-safe),
    JwksAuthProvider (RS256-pinned, async via verifyAsync) — plus an mTLS
    verifyClientCert seam; server.ts selects Jwks when terminal_oidc_jwks is configured,
    else LocalToken. SessionBackend still has exactly one impl (LocalPtyBackend). The
    remaining remote backends (k8s exec, Docker exec, SSH) are sub-project #3
    implementations of these interfaces.
  </inv>
</invariants>
```

### Gateway flow & config

`attachTerminalGateway(server, deps)` hooks `server.on('upgrade')`: extract token from `Sec-WebSocket-Protocol` → verify via `AuthProvider.verify()`/`verifyAsync()` **before bridge/session-spawn** — `wss.handleUpgrade()` completes the WS handshake but the socket is PAUSED pre-auth (no PTY data flows during sync or async-JWKS verification) and `bridge()` (the only WS⇄session pipe) is reached strictly after an accept; a deny records `auth.deny` and closes the WS with app-code **4401** (not a pre-upgrade HTTP 401) → on success bridge PTY⇄WS → on close `manager.detach()` (session stays alive for reattach). `PtySessionManager` caps `maxSessions` and exempts `deckent`-kind sessions from idle-kill so active sprints are never interrupted. **Config wiring today:** only `terminal.enabled` + `terminal_oidc_jwks` are read from `DeckentConfig` at runtime; `maxSessions` (10) / `idleTimeoutMs` (30 min) / `scrollbackBytes` (256 KiB) are HARDCODED to the config defaults (not yet user-overridable) and `bind` / `allowShellKind` / `outboundDailyQuotaBytes` are schema-defined but not runtime-enforced → born TERM-CONFIG-WIRE. `LocalPtyBackend` spawn uses array args + `shell:false` (except the `win32` npm wrapper), per **ADR-G-002**.

### Rejected alternatives (and why)

iframe/separate-server xterm — cross-origin auth complexity, no shared token. Hand-rolled RFC6455 server — frame-parsing/masking security surface; `ws` is audited. Persist raw PTY output — PII/secrets exposure, breaks invariant #3. Global auth-bypass applies to terminal — direct RCE vector (invariant #1). Unbounded sessions/buffer — DoS.

---

## Intent / Roadmap (Tomorrow)

- **Desktop-app integration (DESK).** The richest interactive surface migrates to a desktop app; the embedded web terminal becomes the in-browser/remote companion to it rather than the primary driving surface (which is the native terminal, **ADR-G-034**).
- **Enterprise-remote backends (sub-#3 / sub-#4).** Implement `SessionBackend` for k8s pod-exec / Docker-exec / SSH and `AuthProvider` for SSO; add multi-tenant isolation (**ADR-G-031**), audit export, and SIEM hooks. The audit trail's `tenantId` already prepares this (**ADR-G-017** → ADR-G-031).
- **TERM-RPC unification.** Converge the embedded web terminal, the native agentic terminal (ADR-G-034), and CLI/MCP onto one terminal RPC contract, so a session looks the same whether driven from the browser, the native REPL, or a remote enterprise client — under the surface-parity law (**ADR-G-011**) and worker live-trace (**ADR-G-025** WORKER-LIVE-TRACE).

---

## Consequences

**(+)** The dashboard/desktop gains real interactive terminal capability with a security-by-default posture: localhost-only token injection, bypass-independent fail-CLOSED auth, no raw-output persistence — the RCE surface stays closed, verified live (`deckent serve` auto-mints the token and enables the dock for localhost). The `AuthProvider`/`SessionBackend` seams make enterprise remote exec an *implementation* of an existing interface, not a rewrite. Reattach survives disconnect without server-side storage. Sub-#2 command/prompt guard is delivered.

**(−)** `@lydell/node-pty` is a native addon — requires a platform prebuilt/compile (`npm install` fails *loudly* on an unsupported platform — an honest, not silent, failure). Sessions are in-memory: a server restart drops them (disk persistence is backlog). `scrollbackBytes` caps history (pipe to a file for full logs). A non-localhost `--host` requires the user to manage their own TLS + token delivery (no built-in HTTPS) — note the CLI currently REFUSES to enable the terminal on a non-localhost bind (safer than the ADR's "TLS + token delivery" framing). The terminal audit trail is not yet wired at runtime (no-op production sink → AUDIT-WIRE) and `TerminalConfig` values are hardcoded (TERM-CONFIG-WIRE). A known UI bug — the collapsed dock-bar overlaps the sidebar (z-index/layout) — is cosmetic and deferred to the product sprint. Sub-#3 (multi-tenant/k8s) and sub-#4 (enterprise external) remain deferred.

---

## References / Absorbed

- **Absorbs:** ADR-062 (Embedded Web Terminal — module boundary, 5 security invariants, gateway flow, `TerminalConfig`; Sprint 281 amendment: sub-#2 delivered, `node-pty`→`@lydell/node-pty`, dependency-pipeline flag now `true`, known UI bug noted).
- **Primary surface:** **ADR-G-034** (Native Agentic Terminal) — the primary management+usage terminal; this record is the *secondary/remote* PTY.
- **Spawn security:** **ADR-G-002** (spawnSync Security Pattern) — `LocalPtyBackend` array-args, `shell:false` (except win32 wrapper).
- **Dependency policy:** **ADR-D-005** (Dependency Policy & Inventory) — `ws` + `@lydell/node-pty` (originally `node-pty`) justified deps.
- **Secrets:** **ADR-G-005** (Secret File System) — terminal token uses `randomUUID()` (crypto-random), complementary to `.deck`.
- **Interface pattern:** **ADR-G-007** (External Messaging Connectors) — `AuthProvider`/`SessionBackend` follow the same interface + local-impl pattern as connectors.
- **Isolation / tenancy:** **ADR-G-017** (Multi-Project Isolation) — audit `tenantId` prepares the trail; **ADR-G-031** (Enterprise Foundation) — sub-#3/#4 multi-tenant/k8s/SIEM, enterprise-remote.
- **Surface & observability:** **ADR-G-011** (Surface Parity & Thin-Wrapper) + **ADR-G-025** (Process Resilience & Live Observability — WORKER-LIVE-TRACE) — TERM-RPC unification target.
- **Dashboard host:** **ADR-G-033** (Dashboard — Observability Surface) — hosts the dock; pivot makes the dashboard observability-only.
- **Governance / lifecycle context:** **ADR-G-019** (ADR Governance — runtime constraint record), **ADR-G-021** (Self-Modifying Detection — terminal touches `src/api/`+`src/dashboard/` → dogfood mode), **ADR-G-026** (Dependency-Wave Execution — implemented over a 5-wave sequence), **ADR-D-007** (Manual Subagent Dispatch — wave-gate transitions during dogfood).
- **Born work-items:** DESK (desktop-app integration), TERM-RPC (terminal RPC unification across web/native/CLI/MCP), ENTERPRISE-REMOTE (sub-#3 k8s/SSH/SSO backends, sub-#4 audit-export/SIEM), DOCK-UI-FIX (collapsed dock-bar z-index — product sprint).
- **Direction:** `docs/superpowers/specs/2026-05-19-embedded-web-terminal-design.md`, memory `project_embedded_web_terminal`; `.analysis/hermes-vs-deckent-direction-decisions.md` (terminal=primary surface, dashboard=monitoring-only).


---

## adr-g-030: Consent-Based Provisioning & Install

**Status:** accepted

# ADR-G-030: Consent-Based Provisioning & Install

**Class:** ADR-G (Global / Constitution) · **Scope:** global+project · **Immutable:** yes · **Source:** publisher · **Enforcement:** today=single provisioner module, consent-gated + OS-aware + `npm`-whitelist + **no-silent-sudo** (a reusable trust-DNA consent anchor) → tomorrow=natural-language setup (ONB-CHAT) + onboarding wizard (ONB-1) + consent-gated provider auth-probe (PSL-6) + global-install
**Status:** accepted · **Date:** 2026-06-30 · **Absorbs:** ADR-063 (Consent-Based Prerequisite Provisioning) · **Supersedes:** —
**Crosswalk:** ADR-063 → ADR-G-030

---

## Context

`deckent init` / `deckent doctor` originally only **detected** missing prerequisites and printed a hint string — there was no install path anywhere in the codebase (`spawnSync('npm', ['install', …])` was simply absent), even though the blueprint claimed "tmux auto-installed on first run." For the public beta the critical-path goal is a frictionless install ("anyone can install & use it"): a non-developer running `deckent init` should be guided to a working setup, not handed a list of manual `npm i -g` commands.

But silently installing global packages or running an OS package manager is a security- and **trust**-sensitive act. It must never happen without explicit user consent. This tension — frictionless setup vs. no-surprise-installs — is resolved by making consent a hard gate, and the resulting pattern is reusable across every "install a missing prerequisite" surface deckent will ever grow.

---

## Decision (Today)

A single provisioning module (`src/core/provisioner.ts`) is the source of truth for *how a prerequisite is installed* — consent-gated and OS-aware:

```xml
<provisioner module="src/core/provisioner.ts">
  <step name="planInstall(tool, opts)" kind="pure">
    Deterministic ToolId → InstallPlan mapping:
      claude / codex / gemini → method='npm-global' (npm install -g <pkg>)
      tmux                    → method='os-package' (OS-aware: apt/dnf/pacman/brew)
      node / docker           → method='manual' (NEVER auto-installed: runtime / privileged)
  </step>
  <step name="installTool" kind="guarded-exec">
    Only 'npm-global' plans auto-execute, and ONLY when consent === true.
    Array args, shell:false (shell:true ONLY on win32 for the npm .cmd wrapper).
    Executable checked against PROVISIONER_BIN_WHITELIST (frozen ['npm'];
    sh/bash intentionally ABSENT). Non-zero exit → { status:'failed' } (never throws).
    'os-package' / 'manual' are surfaced as an instruction string the user runs —
    NO SILENT SUDO.
  </step>
  <step name="provisionMissing" kind="orchestration">
    mode ∈ prompt | yes | no-install
      prompt (default) — per-tool consent prompt (node:readline promptConfirm helper)
      yes (CLI --yes, MCP installMissing:true) — install all without prompting (CI)
      no-install (CLI --no-install) — legacy hint-only behavior preserved (backward compat)
  </step>
  <invariant name="single source of truth — install EXECUTION only">
    The install-EXECUTION package mapping is centralized: planInstall (NPM_PKG) +
    doctor.ts getProviderInstallHint delegate to one mapping. NOTE (honest scope): the
    install-HINT strings shown in provider diagnostics / chat / onboard / error messages
    are NOT yet centralized — the `@anthropic-ai/claude-code` / `@openai/codex` /
    `@google/gemini-cli` literals are still hardcoded across 13+ sites (errors.ts,
    claude/codex/gemini.ts, messages.ts, wizard.ts, chat.ts, doctor.ts, onboard.ts), so a
    vendor rename is NOT a one-place update today → born PKG-NAME-SSOT.
  </invariant>
  <invariant name="MCP parity">
    deckent_init gains an installMissing opt-in. MCP has no interactive consent channel,
    so it is explicit opt-in (=== CLI --yes); default reports only.
  </invariant>
</provisioner>
```

### The trust-DNA anchor (reusable)

The consent pattern is **not** scoped to first-run provisioning — it is the canonical anchor for *every* "install/prepare a missing prerequisite" surface. It already generalized to docker-image preparation, which has since grown its own surfaces, all consent-preserving: `deckent doctor --fix-image` (Sprint-270 F1-IMG) **never** builds without an explicit flag + interactive consent; `deckent image build` is a standalone explicit command; and `deckent init` offers a worker-image build via `maybeOfferWorkerImageBuild` — opt-in only (builds ONLY when interactive + docker present + image absent + user confirms; CI / `--yes` / `--no-image` → opted-out, never auto-build). Explicit-command self-update (`deckent upgrade`) is treated as its own consent — the user invoked it — but stays bound by the whitelist + no-silent-sudo spawn rules. **Every** future such surface — including the PSL-6 provider auth-probe family — is bound by this ADR's three invariants: **consent-gated**, **whitelist-restricted spawn**, **no silent sudo**.

### Rejected alternatives (and why)

Silent auto-install (no consent) — violates user trust and the security DNA. Keep hint-only — fails the frictionless-install goal. Bundle provider CLIs as deps — bloats the package and conflicts with the dependency-minimalism/provider-agnostic posture (**ADR-D-005**, **ADR-G-008**).

---

## Intent / Roadmap (Tomorrow)

- **ONB-CHAT — natural-language setup.** Setup happens conversationally in the native terminal ("set me up for a TypeScript project with Claude") — deckent plans, asks consent, and provisions, instead of the user running discrete commands. The consent gate is unchanged; the *surface* becomes NL.
- **ONB-1 — onboarding wizard.** A guided first-run wizard that walks a non-developer from zero to a working setup, each install step consent-gated by this module.
- **PSL-6 — consent-gated provider auth-probe.** Probing/establishing provider auth (the "is `claude` logged in?" / "install + authenticate" family) runs under this same consent + whitelist + no-silent-sudo contract — provider CLI package names (`@anthropic-ai/claude-code`, `@openai/codex`, `@google/gemini-cli`) stay centralized in `planInstall` (**ADR-G-008**).
- **Global-install.** A global `deckent` install seeds the consent-anchored provisioning flow so the same guarantees hold across all of a user's projects (paired with project-scope, **ADR-G-001** / **ADR-G-017**).

---

## Consequences

**(+)** `deckent init` becomes a real provisioner and closes the blueprint reality gap, while staying security-preserving: consent-gated, whitelist + shell-free spawn (companion to the **ADR-G-002** spawnSync pattern + `spawn-safety.ts`), no silent sudo. The single source of truth removes a duplicated install-hint mapping across three sites (DRY). It is backward compatible — `--no-install` preserves the prior hint-only behavior exactly. The pattern proved reusable (F1-IMG docker-image), so consent is now a load-bearing trust primitive, not a one-off.

**(−)** Global `npm i -g` may need elevated permissions on some setups — failures are *reported with the manual command* (graceful, non-fatal) rather than auto-escalating. OS-package installs (tmux on Linux) still require a manual user `sudo` step — by design. Provider CLI package names are centralized for install *execution* (one place), but the install-*hint* strings are duplicated across 13+ UX/diagnostic sites — a vendor rename is NOT yet one-place (born PKG-NAME-SSOT). Two exported helpers carry a pre-consent-gate auto-build semantic (`maybeProvisionDockerImage` / `reprovisionWorkerImageAfterUpgrade`) but are currently DEAD-CODE (no live call-site) — they must be purged or made consent-mandatory before any re-wiring (born DEAD-PROVISION-PURGE). The richer surfaces (ONB-CHAT, ONB-1, PSL-6, global-install) are roadmap; today the consent gate exists at the `provisionMissing` / `--fix-image` / `image build` / init-offer layer, not yet in a conversational wizard.

---

## References / Absorbed

- **Absorbs:** ADR-063 (Consent-Based Prerequisite Provisioning — `planInstall`/`installTool`/`provisionMissing`, `PROVISIONER_BIN_WHITELIST` frozen `['npm']`, 23 tests; Sprint 281 amendment: consent-pattern reused by F1-IMG docker-image anchor).
- **Spawn security:** **ADR-G-002** (spawnSync Security Pattern) — array-args / shell-free invariant; `PROVISIONER_BIN_WHITELIST` is a companion to `spawn-safety.ts`.
- **Dependency policy:** **ADR-D-005** (Dependency Policy & Inventory) — installs *external* CLIs on consent rather than bundling them; also the `node:readline`/`promptConfirm` consent-prompt helper.
- **Provider abstraction:** **ADR-G-008** (Provider Abstraction, Fleet & Native-Usage) — centralized provider CLI package names; PSL-6 auth-probe is provider-side.
- **Product promise:** **ADR-G-016** (Product Vision — Product Not Service) — the "anyone can install & use" / install-and-run promise; air-gapped / never-phone-home pillar.
- **Scope / install:** **ADR-G-001** (Layered Config & Scope Precedence) + **ADR-G-017** (Multi-Project Isolation) — global-install + project-scope; FB-1 opt-in telemetry inherits this consent gate.
- **Governance:** **ADR-G-019** (ADR Governance) — runtime contract record for the provisioning capability.
- **Born work-items:** ONB-CHAT (NL setup), ONB-1 (onboarding wizard), PSL-6 (consent-gated provider auth-probe), GLOBAL-INSTALL (seed consent-anchored provisioning across projects), PKG-NAME-SSOT (centralize the 13+ hardcoded provider install-hint literals onto planInstall/NPM_PKG), DEAD-PROVISION-PURGE (purge or consent-gate the dead consent-less docker-build helpers `maybeProvisionDockerImage` / `reprovisionWorkerImageAfterUpgrade`).
- **Direction:** memory `project_air_gapped_offline_pillar`, `project_deckent_everyone_everywhere`, `feedback_proactive_blocker_disclosure`; `.analysis/hermes-vs-deckent-direction-decisions.md` (ONB = P0, global-install + project-scope = P0).


---

## adr-g-031: Enterprise Foundation (Tenant · RBAC · Audit · Scheduled-Flows · Connector-Identity)

**Status:** accepted

# ADR-G-031: Enterprise Foundation (Tenant · RBAC · Audit · Scheduled-Flows · Connector-Identity)

**Class:** ADR-G (Global / Constitution) · **Scope:** global+project · **Immutable:** yes · **Source:** publisher · **Enforcement:** today=opt-in (enterprise-config default-off; community byte-identical) → tomorrow=god-level enterprise governance-depth layer (ADR-G-016 MOD-SPLIT; ENT-* gaps in the modular enterprise layer)
**Status:** accepted · **Date:** 2026-06-30 · **Absorbs:** ADR-068 (Enterprise Foundation) + ADR-069 (Event-Driven Triggers + RBAC) + ADR-071 Part-F4 (RBAC hierarchy + audit-writer + enterprise-config) + ADR-074 Part-B (enterprise RBAC-enforce + audit-export + rate-limiter + RBAC-CLI) + ADR-092 (Connector Social Identity RBAC)
**Crosswalk:** 068 (+069+071F4+074B+092) → ADR-G-031

> **Note (Alperen, 2026-06-30):** This foundation takes its FINAL form inside the enterprise layer (MOD-SPLIT / deck-ent). The community core has the same functionality; enterprise = depth of governance/audit/management (ADR-G-016), not gated features.

---

## Context

To run deckent in enterprise environments — multi-tenant, audited, role-controlled, scheduled — a foundation accreted across sprints: scheduled-flows + audit-query + multi-tenant (068), event-triggers + RBAC `can()` (069), RBAC hierarchy + audit-writer + enterprise-config (071-F4), and a **connector-surface social-identity RBAC** (092, fail-closed, opt-in, tenant-scoped, with SCIM/OIDC adapters). The 2026-06-30 review unifies them into one enterprise-foundation law that finalizes in the modular enterprise layer.

---

## Decision (Today)

```xml
<enterprise-foundation opt-in="enterprise-config default-off">
  <tenant>TenantContext (ADR-G-024) + per-tenant isolationRoot + strict_tenant flag +
    memory tenant_id column + audit-scope.</tenant>
  <rbac>Role hierarchy (admin ⊃ operator ⊃ viewer) + Permission matrix + can() +
    enforceRbac. Enforcement is TWO-conditional: (a) rbac.enabled must be true
    (disabled→NO_OP, default-off), AND (b) the caller must pass a role — role-OPTIONAL
    call-sites (e.g. flow-registry.addFlow(flow, role?)) bypass the check when no role is
    supplied, and most built-in paths do not supply one. Hard/universal enforcement is
    gap-3 (ADR-G-020 L2 hard-flip, post-GA-V2). 4 live consumers (autonomous runtime-loop,
    OIDC auth-me, enterprise-endpoint, rbac CLI).</rbac>
  <audit>writeAuditEvent + queryAudit (RBAC-gated) + HMAC chain (audit_prev_hmac/audit_hmac)
    + audit-integrity + SIEM HTTP transport + exportAuditLog (SOC2/GDPR JSON/CSV). NOTE: the
    v2 keyed-HMAC secret is a PUBLIC source literal (AUDIT_HMAC_SECRET='deckent-audit') — the
    chain is tamper-EVIDENT for accidental corruption but NOT tamper-proof against an actor
    who knows the (public) key; production secret-manager threading through both writer +
    export is a tracked follow-up → born AUDIT-SECRET-WIRE.</audit>
  <rate-limit>TenantRateLimiter — per-tenant token-bucket quota guard (checkLimit(tenantId,
    action) → allow/deny; maxConcurrent per rolling window, auto-reset) EXISTS as a class.
    NOTE: GET /api/enterprise/rate reflects the server's IP-based limiter snapshot, and
    admin-CRUD'd `rate_rules` are PERSISTED in config but NOT yet bound to runtime
    enforcement (no rule→TenantRateLimiter wiring; per-action limits = V2) → born
    RATE-ENFORCE-WIRE.</rate-limit>
  <flows>scheduled-flow (full-cron nextRun) + flow-registry + event-trigger/matchTrigger
    (webhook/event match) → autonomous engine bridge.</flows>
  <connector-identity scope="external messaging surface" model="fail-CLOSED, opt-in">
    L2 RBAC on the connector message surface (DISTINCT from ADR-G-020 internal advisory):
    principal-resolution (tenant-scoped) → resource:action permission → HARD-BLOCK on
    unauthorized. NOTE: the HARD-BLOCK only fires for capabilities that DECLARE a
    requiredPermission — today only 1 of ~10 built-in capabilities is permission-tagged, so
    the gate is opt-in per-capability, not yet universal → born CAP-PERM-TAG. identity.enabled
    opt-in (default off = backward-compatible). SCIM 2.0 + OIDC/Entra adapters;
    resolve()=pure-local zero-network, sync()=out-of-band background.
  </connector-identity>
</enterprise-foundation>
```

All enterprise features are **opt-in (default-off)** — a community/single-tenant deployment is byte-identical.

---

## Intent / Roadmap (Tomorrow) — god-level enterprise

The foundation is real engineering (OIDC security, HMAC chain, guarded surfaces) but **half-way to god-level enterprise**. The mapped gaps = the MASTER-PLAN ENT-* set, realized in the **enterprise layer** (ADR-G-016 MOD-SPLIT):

```xml
<god-level-gaps>
  <gap n="1">Management plane — CRUD endpoints for tenants/roles/rate now EXIST
    (/api/enterprise/tenants|rbac|rate POST/DELETE); the remaining gap is that custom
    RBAC/rate rules are not yet AUTHORITATIVE in enforcement + there is no admin UI.</gap>
  <gap n="2">Custom RBAC — custom roles / permission-matrix / per-resource ACL (today 3 fixed roles).</gap>
  <gap n="3">Hard enforcement — ADR-G-020 Layer-2 hard-flip (today advisory; post-GA-V2).</gap>
  <gap n="4">Runtime tenant isolation — k8s pod-exec (today config/path-scoping).</gap>
  <gap n="5">Provisioning — SCIM webhook push / directory-sync (today OIDC login + pull-sync).</gap>
  <gap n="6">Audit-export / compliance pack — SOC2/GDPR evidence tooling (SIEM transport exists).</gap>
</god-level-gaps>
```

---

## Consequences

**(+)** A real, opt-in, multi-tenant + RBAC + audit + rate-limit + scheduled + connector-identity enterprise foundation, all live and consumer-wired, byte-identical for community users. Connector-surface RBAC is fail-closed (stronger than the internal advisory layer) — safe for multi-user messaging deployments.

**(−)** Six mapped gaps to god-level enterprise (management-plane, custom-RBAC, hard-enforce-V2, k8s-tenant, SCIM-push, audit-export) — all in the enterprise layer, not today. Beyond those, several foundation pieces are wired only partially: `parseEnterpriseConfig` is the INTENDED enterprise-config SSOT but is not yet the runtime read-path (config is still read piecemeal — strict_tenant_isolation / autonomous.rbac_policy / identity / rbac_roles / rate_rules → born ENT-CONFIG-SSOT); persisted `rate_rules` are not bound to runtime enforcement (RATE-ENFORCE-WIRE); the audit HMAC secret is a public literal (AUDIT-SECRET-WIRE); connector capability permission-tagging is 1-of-~10 (CAP-PERM-TAG); RBAC enforcement is role-optional (bypassed when no role is passed). HTTP webhook-listener (069 AUT-2) unbuilt. Hard-enforcement is roadmap (ADR-G-020 vein).

---

## References / Absorbed

- **Absorbs:** ADR-068 + ADR-069 + ADR-071 Part-F4 + ADR-074 Part-B + ADR-092.
- **Cross-ref:** ADR-G-016 (enterprise = governance depth, MOD-SPLIT) · ADR-G-020 (internal authority — distinct from connector L2) · ADR-G-024 (process/tenant) · ADR-G-017 (multi-project isolation) · ADR-G-007 (connectors) · ADR-G-035 (tenant_id/audit-hmac).
- **Born / MASTER-PLAN:** ENT-* (god-level gaps) · MODULARIZE · AUT-2 (webhook-listener) · dynamic /bind (connector pairing→binding) · ENT-CONFIG-SSOT (parseEnterpriseConfig → runtime read-path) · RATE-ENFORCE-WIRE (persisted rate_rules → TenantRateLimiter enforcement) · AUDIT-SECRET-WIRE (secret-manager-sourced HMAC key through writer+export) · CAP-PERM-TAG (requiredPermission on all built-in capabilities).
- **Memory:** `project_social_identity_rbac_engine` · `project_community_pro_split_strategy`.


---

## adr-g-032: Self-Learning & Evolution Loop

**Status:** accepted

# ADR-G-032: Self-Learning & Evolution Loop

**Class:** ADR-G (Global / Constitution) · **Scope:** global+project · **Immutable:** yes · **Source:** publisher · **Enforcement:** today=moat-preserve (the closed outcome→routing→promotion loop must not be rewritten — only deepened) + requiresApproval-gated identity-mutation (nervous checkpoint; no mid-run mutation) → tomorrow=selective+scalable update (only used agents/skills, indexed/lazy at 300-agent/1000-skill) + auto-apply after the advisory-proof phase
**Status:** accepted (provisional — core outcome→routing→promotion/demotion loop LIVE; identity-mutation capability delivered but production-unwired [IDENTITY-MUTATION-WIRE], test-only; bulk-update selective-scale defect open [EVOLUTION-SELECTIVE-SCALE]) · **Date:** 2026-06-30 · **Absorbs:** ADR-074 Part-C (F5 evolution wire) + ADR-075 Part-A (6 evolution-module real callers) + ADR-078 Part-C (Active Identity-Mutation Loop)
**Crosswalk:** 074C + 075A + 078C → ADR-G-032

> **Moat note:** This is deckent's strongest differentiator — the closed **outcome → routing → promotion** learning loop. MOAT-4: PRESERVE (never rewrite; only deepen). The pivot explicitly protects it.

---

## Context

deckent learns across runs: outcomes feed routing, routing feeds agent/skill selection, success/failure feeds promotion/retirement, and agent identity itself mutates toward better performance. The pieces were built across sprints but repeatedly shipped as **dead code** (def-file present, no external caller — the `feedback_directive_kanit_letter_vs_goal` error). ADR-074C wired the suggestion path; ADR-075A added 6 real external callers; ADR-078C closed the loop with active identity-mutation. The 2026-06-30 review consolidates them into one moat-ADR and records a **basic scaling error** Alperen flagged.

---

## Decision (Today)

### 1. The Loop — modules with real runtime callers

```xml
<evolution-loop>
  <signal>outcome-tracker (per-agent/task-type success, NO_GO patterns)</signal>
  <propose>prompt-evolution (rule-based prompt-improvement suggestion) · adaptive-agent (skill add/remove proposal). ADVISORY — suggestion-only, re-exported via sprint-reporter, NOT auto-applied to any agent (evolvePrompt "does not mutate any agent").</propose>
  <apply>promotion-pipeline.runIdentityMutation / IdentityMutationOpts — low-success →
    mutate agent identity (systemPrompt + skill repertoire) → record parent in
    agent-genealogy → versioned A/B-testable variant (agentId-v{N+1}); requiresApproval-gated
    (nervous checkpoint); active-task agents not mutated mid-run. NOTE: this capability is
    delivered + unit-tested but NOT yet wired into the production finalize/planner path
    (promotion-pipeline.ts:285, only test callers today) — finalize applies stat-based
    promote/demote, not identity mutation → born IDENTITY-MUTATION-WIRE.</apply>
  <govern>agent-genealogy (lineage) + agent-retirement (LRU/low-success retire) are live in
    the finalize promotion path; specialization-drift (scope-creep detect) + prompt-rollback
    (revert if worse) + cross-sprint-analyzer (improving/degrading trends) are advisory /
    report-surface today (re-exported via sprint-reporter, not auto-acting).</govern>
</evolution-loop>
```

The core is wired with real external callers (ADR-075A) — outcome→routing→promotion/demotion *runs*, not just exists. Exceptions, marked in the NOTEs above: the `<apply>` identity-mutation step has only test callers today, and the `<propose>`/`<govern>` drift/rollback/prompt-evolution helpers are advisory. (API is **class-based** — `AgentGenealogy`/`AgentRetirement`/`SpecializationDriftDetector`/`PromptRollback`; proof at class-name level, not bare function grep.)

### 2. 🔴 Selective + Scalable Update  *(Alperen 2026-06-30 — "basic ilk hata")*

```xml
<selective-scale severity="critical">
  TODAY'S ERROR: the loop updates ALL agents/skills in BULK each run (even keyed by
  last-used-sprint). WRONG. CODE: finalize syncs every learnings.agentPerformance +
  skillPerformance record to manifests (sprint-finalizer.ts:1332/1363) and the learning
  bonus scans all-historical performance (outcome-tracker.ts:433) — neither indexed/lazy.
  RULE: update ONLY the agents/skills actually USED in that run (selective).
  SCALE TEST: must remain manageable at 300 agents / 1000 skills — indexed lookup,
  lazy load, selective-update. The loop must be very well organized.
</selective-scale>
```

---

## Intent / Roadmap (Tomorrow)

- **EVOLUTION-SELECTIVE-SCALE:** rebuild the update path to touch only used agents/skills + indexed/lazy access → manages 300-agent/1000-skill fleets. (Today's bulk-update is the explicit defect to fix.)
- **LEARNINGS-QUALITY** (ADR-G-035): the recorded Learnings/Gains are "nice but half-baked / not genuinely learned" — perfect the learned-content so the loop's memory is real, for dogfood AND user.
- **Identity-mutation at scale:** 1000+-variant validation (F5-008r) + auto-apply (after the human-review advisory phase proves signal quality).

---

## Consequences

**(+)** The differentiating moat is closed-loop and live (not proposed): outcome data drives routing + promotion/demotion continuously, genealogy-tracked. The deeper identity-mutation step (systemPrompt+skill → A/B-testable variant) is built + unit-tested but its production wiring into finalize is still born work (IDENTITY-MUTATION-WIRE) — today finalize applies stat-based promote/demote, and prompt-evolution/specialization-drift are advisory suggestions.

**(−)** The bulk-update scaling error (§2) must be fixed before large agent/skill catalogs (born: EVOLUTION-SELECTIVE-SCALE). Learned-content quality is an open gap (LEARNINGS-QUALITY). Mutation auto-apply is gated behind an advisory-proof phase (today suggestions are advisory, requiresApproval for identity-mutation).

---

## References / Absorbed

- **Absorbs:** ADR-074 Part-C + ADR-075 Part-A + ADR-078 Part-C.
- **Cross-ref:** ADR-G-035 (memory substrate + LEARNINGS-QUALITY) · ADR-G-006 (routing — consumes outcomes) · ADR-G-023 (agent/skill taxonomy) · ADR-G-022 (nervous — mutation approval checkpoint) · ADR-G-020 (requiresApproval gate).
- **Born:** EVOLUTION-SELECTIVE-SCALE (🔴 critical) · LEARNINGS-QUALITY · IDENTITY-MUTATION-WIRE (wire runIdentityMutation into finalize behind explicit approval-queue / nervous-checkpoint / non-active-agent guard — today test-only).
- **Memory:** `project_autonomous_first_dogfood_grand_vision` · `feedback_directive_kanit_letter_vs_goal` · MOAT-4 (preserve).


---

## adr-g-033: Dashboard (Observability Surface)

**Status:** accepted

# ADR-G-033: Dashboard (Observability Surface)

**Class:** ADR-G (Global / Constitution) · **Scope:** global+project · **Immutable:** yes · **Source:** publisher · **Enforcement:** today=god-level observability dashboard run-proven live (Layout shell + reachable pages + sprint-start **detach** + stale-while-revalidate live-data + REST-poll WorkerGrid with SSE bridge at DashboardPage + evolution/coverage endpoints; Tier-1 Proof-of-Function smoke per ADR-G-009) → tomorrow=**observability-only contract** — interactive chat relocates to the Desktop app (DESK-1); the dashboard never becomes the primary surface (the native terminal, ADR-G-034, is primary)
**Status:** accepted · **Date:** 2026-06-30 · **Absorbs:** ADR-080 · ADR-078 (Part D) · ADR-082 (Parts B/C) · ADR-083 (Dalga D) · **Supersedes:** —
**Crosswalk:** ADR-080 + ADR-078(D) + ADR-082(B/C) + ADR-083(D) → ADR-G-033

> **Meta-note:** This ADR governs deckent's **web dashboard**. Per the 2026-06-29 strategic pivot, the dashboard is the **observability surface** — *"the dashboard explains."* The **primary** management+usage surface is the native agentic terminal (ADR-G-034, tool-driven, full-control-without-fatigue); **interactive** chat is forward-relocated to the Desktop app (DESK-1, Electron). The dashboard is a read/monitor plane, not the product's control center. The "Today" section records the god-level dashboard as built and run-proven; the "Tomorrow" section reframes its role under the pivot.

---

## Context

Through Sprints 215–221 the dashboard was driven from a functional-skeleton to a god-level surface, but every step exposed the gap between *files-on-disk* and *user-reachable, freeze-free, live* — exactly the `wired ≠ working` law (ADR-G-009). A real-binary browser audit (`npx deckent serve`, 2026-06-01) and follow-up run-verify passes surfaced a cluster of defects that a no-MVP product (ADR-G-016) cannot ship:

- **Sprint-start froze the dashboard.** `src/api/server.ts` called `runSprint(...)` *inside* the `POST /api/start` HTTP handler. `runSprint` is a long-running async operation that blocked the Node.js event loop, so the serve process stopped answering any further HTTP request — the UI fell into an unrecoverable skeleton-loading state. ADR-G-009's smoke gate did not cover the sprint-start path, so the freeze went undetected until a manual session.
- **Hollow pages.** Sprint 215 wrote four page files (`EvolutionPage`, `NervousPage`, `EnterprisePage`, `MemoryExplorerPage`) to disk, but `App.tsx` carried only 7 routes and `Sidebar.tsx` only 6 links — none of the four were reachable. A DONE verdict based on file-existence, not navigation, is a Tier-1 wire-gap by ADR-G-009.
- **Chat was status-only.** `ChatPage.tsx` dispatched every message to the `status` intent regardless of input; the real `POST /api/chat` round-trip was never called from the browser.
- **Static worker grid + stale status.** `WorkerGrid` loaded a fixed first-6 and never reflected later spawn/done transitions; `StatusPage` showed done work as still "working"; `History` always reported 0% coverage; the debt page had no filter; `EnterprisePage` showed empty data without an injected Bearer token; an auditor alert ("CLAUDE.md not updated") repeated as SPAM.
- **Skeleton-grade UX.** No stale-while-revalidate fetching, inconsistent dark/light tokens, layout shift on data load, no connection-loss recovery — below the god-level bar of ADR-G-016 / no-MVP (ADR-G-016).

Underneath the bug-fixing, the dashboard's *role* also moved. The 2026-06-29 pivot makes the **native terminal** the primary surface and recasts the dashboard as **observability-only**. The implementation work below is real and run-proven; the pivot does not delete it — it **reframes** what the dashboard is *for*, and routes interactive control to the terminal (ADR-G-034) and Desktop (DESK-1).

---

## Decision (Today)

The dashboard is a **god-level observability surface**: a freeze-free React SPA (Vite + ADR-D-001 TS/ESM) that renders live sprint, worker, evolution, memory, nervous, and enterprise state through a single **Layout** shell (App.tsx wires `Layout`; `AppShell.tsx` exists as an alternative shell but is not the mounted one), with detached sprint-start and a stale-while-revalidate live-data spine. No new runtime dependency was introduced (ADR-D-005 / ex-010); no-emoji — lucide-react icons only — is the RULE (brand consistency, ADR-G-010), with 2 residual ⚠ drift sites (WorkerGrid / DirectivesEditor) tracked as born DASH-EMOJI-FIX.

### 1. AppShell + Information Architecture

`src/dashboard/src/components/Layout.tsx` is the mounted top-level shell (App.tsx routes render inside `<Layout />`; `AppShell.tsx` is a designed alternative that is not currently wired): a header + sidebar + content with a dark/light token system propagated via `data-theme`, a single-source nav (`nav-items.ts` → `navGroups`/`navItems`), and an embedded terminal dock (`TerminalPanel`). The eight god-level surfaces are reachable through the Layout navigation:

```xml
<dashboard-surfaces nav="Layout (nav-items.ts SSOT)" reachable="8" routes="~21 (18 protected; the '11' was a Sprint-221 snapshot)">
  <page id="sprint"     route="/status"          source="StatusPage"          state="live sprint phase + per-task done/working/no_go"/>
  <page id="overview"   route="/"                source="home/dashboard"      state="sprint summary + KPI"/>
  <page id="evolution"  route="/evolution"       source="EvolutionPage"       state="genealogy tree · retirement timeline · prompt-diff (→ ADR-G-032)"/>
  <page id="memory"     route="/memory-explorer" source="MemoryExplorerPage"  state="FTS5 search · ADR timeline · debt table (→ ADR-G-035)"/>
  <page id="enterprise" route="/enterprise"      source="EnterprisePage"      state="tenant · RBAC · audit · rate-limit — full CRUD (POST+DELETE) wired dashboard-side (→ ADR-G-031; backend enforcement-authoritativeness is the remaining gap)"/>
  <page id="nervous"    route="/nervous"         source="NervousPage"         state="pending-approval · accept/reject · panic-guard · detector status (→ ADR-G-022)"/>
  <page id="terminal"   route="(dock, NOT a route)" source="TerminalPanel"     state="multi-session PTY dock embedded in Layout — not a /terminal nav route (→ ADR-G-029)"/>
  <page id="chat"       route="/chat"            source="ChatPage"            state="round-trip + slash (→ relocates to DESK-1 — see Tomorrow)"/>
  <!-- App.tsx carries ~21 routes total (18 protected); the "11" figure is a Sprint-221 snapshot (ADR-080 §2) -->
</dashboard-surfaces>
```

### 2. Sprint-Start DETACH — never block the serve event-loop

`src/api/sprint-job-runner.ts` exports `startSprintDetached(sprintId, root)`, which spawns the sprint as a **detached child** (`detached: true, stdio: 'ignore'`) and immediately `child.unref()`s it; `POST /api/start` in `server.ts` calls it **instead of** `runSprint`. The HTTP response returns before the sprint begins executing — the serve event loop is never blocked, and the dashboard stays responsive throughout a long sprint. A detached child (not a Worker thread, which shares the same libuv loop for I/O) is the clean isolation boundary. This is the load-bearing invariant of this ADR: **the observability surface must never freeze the process that serves it.**

### 3. Live-Data Spine — stale-while-revalidate + SSE WorkerGrid + theme tokens

- **`src/dashboard/src/lib/use-live-data.ts`** — SSE/polling hook with stale-while-revalidate semantics: serves cached data immediately on mount, revalidates in the background, shows a *reconnecting* indicator (not a skeleton) on connection loss, and aborts in-flight requests on unmount via `AbortController`. Achieved in ~80 LoC (no React Query / SWR — ADR-D-005).
- **`src/dashboard/src/components/WorkerGrid.tsx`** — consumes `use-live-data` via **REST polling (3s interval) as its source of truth**, so the worker list is real-time: the fixed-6 limit is removed and later spawn/done transitions render live (ADR-082 Dalga B). NOTE: SSE push is handled at the **DashboardPage** level, not inside WorkerGrid — the "SSE WorkerGrid" phrasing is a Sprint-221 snapshot. This grid is the dashboard projection of per-worker live state (the dashboard endpoint of WORKER-LIVE-TRACE, ADR-G-025).
- **`StatusPage.tsx`** — task state (done/working/no_go) and phase indicator are real-time (ADR-082 Dalga B); **`RefreshButton.tsx`** adds user-triggered refetch with a 10 s cooldown.
- **`src/dashboard/src/lib/theme.ts`** — centralized design-token map (color/spacing/radius/shadow, dark+light) consumed via CSS custom properties; no hard-coded hex in components (ADR-G-010 brand/output consistency).

### 4. Reachable Pages — wire + backing endpoints

- **Wire:** four routes added to `App.tsx` (`/evolution`, `/nervous`, `/enterprise`, `/memory-explorer`) and matching lucide-react links to the sidebar; the route table is 11 total and every page is reachable by nav + direct URL (ADR-080 §2).
- **`src/api/evolution-endpoint.ts`** — three read-only GET endpoints registered in `server.ts`: `/api/evolution/genealogy`, `/api/evolution/retirement`, `/api/evolution/prompt-metrics` (graceful empty arrays when no data) — the dashboard window onto the evolution loop (ADR-G-032).
- **`src/api/coverage-endpoint.ts`** — `/api/coverage` reads sprint coverage from memory.db/results so `History` shows real coverage, not a hard-coded 0% (ADR-082 Dalga C).
- **`DebtPage.tsx`** — sprint/severity/status filter dropdowns + search (ADR-082 Dalga C).
- **`EnterprisePage.tsx`** — F4/enterprise endpoints auth-wired with a Bearer token; auditor alerts deduped + provider-neutral (CLAUDE/GEMINI/AGENTS). Now carries **full tenant/RBAC/rate CRUD** (`mutate()` → POST+DELETE `/api/enterprise/{tenants,rbac,rate}`) — the Sprint-221 "read-first V1, no write actions" framing is SUPERSEDED. The remaining gap is not the UI but backend enforcement-authoritativeness of custom RBAC/rate rules + the V2 management-plane (ADR-G-031 gap #1).

### 5. Chat round-trip (Today) — parity with the terminal

`ChatPage.tsx` POSTs to `/api/chat` with a Bearer token and renders the streamed assistant reply, with multi-turn history, loading, and error states; a slash-command input (`/status`, `/recall`) maps to the backend agentic path (ADR-082 Dalga B / ADR-083 Dalga D), reaching parity with the native terminal's slash registry (ADR-G-034). The serve-side `resolveChatAdapter` SSOT (Sprint 269) backs the stream endpoint.

> Note: the chat round-trip is present and wired both client- and serve-side, but is **not** considered fully working today — the live-stream defect is recorded in Consequences (−) and the surface is forward-relocated (Tomorrow).

---

## Intent / Roadmap (Tomorrow)

- **Observability-only contract (the pivot's core reframe).** The dashboard's durable role is **monitoring + explanation** — *"the dashboard explains."* Read/observe surfaces (sprint, worker-live-trace, evolution, memory, nervous, enterprise audit) are the dashboard's mandate; it is **not** the product's control center and **does not** become the primary surface. Primary management+usage is the **native agentic terminal (ADR-G-034)** — tool-driven, deep, full-control-without-fatigue.
- **Interactive chat moves to the Desktop app (DESK-1, Electron, later).** Conversational/agentic interaction graduates off the web dashboard into the desktop client; the dashboard retains at most a read-only conversation view. Until DESK-1 lands, today's `ChatPage` remains as the interim surface (with the known live-stream gap below).
- **Enterprise read → write (V2 management-plane).** The V1 read-first EnterprisePage evolves into a god-level **management plane** with custom-RBAC CRUD, tenant management, and audit-export — tracked as ADR-G-031's enterprise gap (ENT-*), gated behind the enterprise layer (control/governance depth, not feature-gating; ADR-G-016).
- **WorkerGrid → WORKER-LIVE-TRACE.** The live worker grid becomes the dashboard projection of the per-worker live-trace contract (executing → checking → context-understood → writing .plan → evaluating), shared across dashboard/terminal/CLI/MCP (ADR-G-025).
- **Dashboard follow-ups (DASH bucket).** Serve-token-inject for the EventSource auth path, routing-diversity chart, control-panel surfacing, and an onboarding view land under the MASTER-PLAN **DASH** work-item (born from old 072/073/076 side-items).

---

## Consequences

**(+)** Sprint-start no longer freezes the dashboard — the serve process stays responsive across long sprints (detach invariant). All eight god-level surfaces are reachable; evolution/nervous/enterprise/memory data appear in the UI for the first time. The live-data spine eliminates skeleton thrash and recovers gracefully from connection loss; centralized theme tokens give dark/light consistency with zero runtime overhead and no new dependency. The dashboard is now a credible **observability** plane the pivot can build on, and the AppShell IA cleanly separates "Observe / Manage / Converse" so the Tomorrow reframe (chat → Desktop) is a relocation, not a rewrite.

**(−) Status of the Sprint-221 known-defects (most RESOLVED since; verified 2026-07-01)**:
- **chat-HOLLOW — RESOLVED (since):** `resolveChatReply` (chat-handler.ts) now routes a natural-language message to `adapter.send()` with an honest i18n error on failure — no silent classifier fallback — and an EventSource token fallback was added (server.ts:1292). The classifier-only POST + auth-gate defects are fixed. Remaining: full end-to-end chat-working still needs a live-run verify (wiring ≠ working, ADR-G-009).
- **duplicate-sidebar — RESOLVED (since):** nav collapsed to a single source (`nav-items.ts` `navGroups` → `navItems` flatMap) consumed by `Layout.tsx`; the stale `Sidebar.tsx` duplicate is gone, Workers/Directives are reachable.
- **alert-spam ×59 — RESOLVED (since):** `DashboardPage` dedups alerts by key with a running count (`dedupMap`, :274) — the ×59 repeat collapses to one entry.
- **enterprise read-only — SUPERSEDED:** EnterprisePage now has tenant/RBAC/rate CRUD (POST+DELETE); the real gap moved to backend enforcement-authoritativeness + V2 management-plane (ADR-G-031 gap #1), not missing write UI.
- **emoji-drift — OPEN:** 2 raw ⚠ glyphs remain against the no-emoji/lucide-react rule (`WorkerGrid.tsx:26` reconnecting text + `DirectivesEditor.tsx:97` disabled hint) → born DASH-EMOJI-FIX.
- **Structural tradeoffs:** detached sprint-start means the serve process holds no direct reference to the running sprint — status is read via `/api/status` / `.dashboard` (no change from prior behavior); non-SSE pages fall back to fixed-interval polling; `DirectivesEditor` is a plain textarea (no syntax highlighting); the REPL status-line has no dashboard-bar parity yet.

---

## References / Absorbed

- **Absorbs:**
  - **ADR-080** (Dashboard God-Level) — sprint-start detach (`sprint-job-runner.ts`), hollow-page wire (`App.tsx` + `Sidebar.tsx`), chat real round-trip, `DirectivesEditor`, god-level UI foundation (`use-live-data.ts` · `theme.ts` · `Layout.tsx`).
  - **ADR-078 Part D** (Dashboard God-Level) — `AppShell.tsx`, `terminal-sessions.ts`, `EnterprisePage` / `MemoryExplorerPage` / `NervousPage` / `EvolutionPage`, and `src/api/evolution-endpoint.ts`.
  - **ADR-082 Parts B/C** (Dashboard-v2 Canlı) — `WorkerGrid` SSE real-time, `StatusPage`/`RefreshButton`, `coverage-endpoint.ts`, `DebtPage` filters, `EnterprisePage` auth-wire + alert dedup.
  - **ADR-083 Dalga D** (Dashboard claude-code-UX) — `ChatPage` streaming + slash, conversation-centric `Layout` (Observe/Manage/Converse IA).
- **Cross-refs:**
  - **ADR-G-034** (Native Agentic Terminal) — the **primary** management+usage surface; the dashboard is observability-only beside it.
  - **DESK-1** (Desktop app, Electron) — destination for interactive chat (MASTER-PLAN).
  - **ADR-G-022** (Nervous System) — NervousPage consumes pending-approval / accept-reject / detector status.
  - **ADR-G-031** (Enterprise Foundation) — EnterprisePage tenant/RBAC/audit; V1 read-first → V2 management-plane CRUD.
  - **ADR-G-032** (Self-Learning & Evolution Loop) — EvolutionPage + evolution-endpoint are its observability window.
  - **ADR-G-025** (Process Resilience & Live Observability) — WorkerGrid is the dashboard endpoint of WORKER-LIVE-TRACE.
  - **ADR-G-035** (Memory Architecture) — MemoryExplorerPage FTS5 search / ADR timeline / debt table.
  - **ADR-G-029** (Embedded Web Terminal) — the `/terminal` page's PTY/session backend.
  - **ADR-G-009** (Evaluation Integrity / Proof-of-Function) — the dashboard is Tier-1 user-surface; the freeze and hollow-page defects were `wired ≠ working` failures caught by real-binary smoke.
  - **ADR-G-016** (Product Vision) / **ADR-G-010** (Output, Terminal-UX & Brand) — god-level / no-MVP bar; no-emoji + lucide-react + shared theme tokens.
- **Born work-items:** **DASH** (serve-token-inject · routing chart · control-panel surfacing · onboarding view — from old 072/073/076 side-items) · **DASH-EMOJI-FIX** (2 residual ⚠ → lucide-react) · **DESK-1** (Desktop app) — all to MASTER-PLAN. (The old Chat/Dashboard product-sprint items — chat-HOLLOW · duplicate-sidebar · alert-spam · enterprise read→write — are largely resolved; see Consequences.)
- **Direction:** `.analysis/adr-review-crosswalk.md` (rows 080/078/082/083), `.analysis/hermes-vs-deckent-direction-decisions.md`, memory `project_hermes_deckent_direction_2026_06` · `feedback_dashboard_no_emoji_lucide` · `feedback_governance_aligns_with_direction_pivot`.


---

## adr-g-034: Native Agentic Terminal

**Status:** accepted

# ADR-G-034: Native Agentic Terminal

**Class:** ADR-G (Global / Constitution) · **Scope:** global+project · **Immutable:** yes · **Source:** publisher · **Enforcement:** today=product-surface contract (bare `deckent` = native agentic terminal; risky actions confirm-gated) → tomorrow=TOOL progressive-disclosure + in-terminal WORKER-LIVE-TRACE + runtime-wide ApprovalBroker + scope-via-TOOL enforcement
**Status:** accepted (provisional — primary terminal-surface shipped; slash-mode-filter + NL-dispatch not wired to the default Ink path [SLASH-MODE-WIRE / NL-DISPATCH-DECISION], slash-registry is a static catalog not capability-derived) · **Date:** 2026-06-30 · **Absorbs:** ADR-081 (Native Agentic Deckent) + ADR-074 Part-A (native-chat round-trip) + ADR-082 Part-A (real-LLM-wire) + ADR-083 (REPL-UX + provider-parity + local-model) + ADR-086 (Native CLI Parity F11)
**Crosswalk:** 081 (+074A+082A+083+086) → ADR-G-034

> **Pivot note (2026-06-29):** The terminal is deckent's **PRIMARY management + usage surface** — tool-driven, full-control + non-tiring, full-functionality is non-negotiable (flexibility/cutting-corners is not acceptable). Work happens *from the terminal*, not via memorized CLI subcommands — but without forcing it (CLI/MCP remain optional access). At the level of Claude Code / Hermes / Codex / OpenClaw. The dashboard (ADR-G-033) is observability-only; the terminal is where you *do*.

---

## Context

`deckent` with no arguments originally printed help. Across Sprints 219–224 it became a real native agentic REPL: bare `deckent` → conversational agentic terminal with real LLM round-trip, natural-language→action dispatch, token streaming, a confirm-gate for risky actions, session persistence, a live slash-registry, a status-line, an enterprise-command bridge, provider-parity across a 5-fleet (incl. local Ollama), and claude-code-grade polish (terminal-mode input, brand thinking-indicator, an agentic write/edit/read/bash tool layer, permission-memory). The view evolved to **Ink** (React-for-CLI) as the default. The 2026-06-30 review consolidates this lineage into the surface that the strategic pivot makes **primary**.

---

## Decision (Today)

### 1. Bare `deckent` = native agentic terminal

```xml
<native-terminal default-view="ink">
  <launch>bare `deckent` → agentic REPL (shouldLaunchDefaultRepl); --help/--version/
    subcommands preserved; non-TTY graceful.</launch>
  <agentic>Default surface = slash + model-emitted &lt;deckent_tool&gt; dispatch via
    McpToolDispatcher; agentic-DO tool layer (write/edit/read/bash, provider-agnostic),
    scope-bounded to session cwd. NL → deckent action dispatch (status/recall/plan,
    classified pre-provider) is OPT-IN — `agenticDispatch` defaults to false and the Ink
    path does not enable it → born NL-DISPATCH-DECISION.</agentic>
  <safety>confirm-gate for risky actions (start/kill/cleanup/write → y/a/N);
    safe actions (status/recall) auto. Permission-memory (.deckent/settings.local.json,
    gitignored) — claude-code-style "always".</safety>
  <session>turns persisted to memory.db; reopening resumes context.</session>
  <stream>F2 token-by-token streaming (SSE); thinking-indicator (kraken brand).</stream>
  <slash>slash-registry from a static canonical SLASH_CATALOG (kod-içi single source of
    truth; buildSlashRegistry() = SLASH_CATALOG.slice() — NOT capability-catalog-derived):
    /help /status /recall /plan /nervous /clear /exit + enterprise group (/audit /rbac
    /flow /cost). Mode-based hiding (visible in enterprise, hidden in user) is DESIGNED
    (resolveChatMode/filterRegistryByMode) but the Ink path currently passes the FULL
    registry (run.tsx:235) — hiding not yet wired → born SLASH-MODE-WIRE.</slash>
  <status-line>config-driven (provider + active-process + cwd); customizable, can be off.</status-line>
</native-terminal>
```

### 2. Provider-parity (5-fleet) + local-model

`resolveChatAdapter` is the intended single entry point mapping all providers (claude/codex/gemini/ollama/openai-compat) to an adapter via one contract — though the bare-REPL boot still uses an inline `buildReplProvider` (entry.ts) instead (the minor drift noted in Consequences → born PROVIDER-SSOT). **Ollama-local is first-class** (zero-API-key, localhost:11434, explicit NET-error) — the "tomorrow deckent-AI with a local model" foundation. Provider fallback chain config-driven (`chat_provider ?? brain_provider ?? 'claude'` + optional `local_fallback`).

### 3. User / Enterprise mode

`resolveChatMode`: `user` (default, simple — chat + basic slash) | `enterprise` (audit/rbac/flow/cost slash visible). Capability is **always present**; mode is INTENDED to filter `/help` visibility ("kullanılmasa da kullanılabilir") — but `filterRegistryByMode` is not yet wired into the Ink/legacy path (they render the full registry today) → born SLASH-MODE-WIRE.

---

## Intent / Roadmap (Tomorrow)

- **TOOL progressive-disclosure** (Hermes-rolemodel + better): deckent's functions move to a tool-surface; core tool-set eager + a searchable bridge (search/describe/call). Terminal is tool-driven; CLI/MCP optional. (MASTER-PLAN: TOOL-1/TOOL-2.)
- **WORKER-LIVE-TRACE** in-terminal (ADR-G-025): live per-worker run-status footer (TERM-LIVE).
- **Runtime-wide ApprovalBroker integration** (APR): risky tool/worker actions emit → terminal live → suspend/resume; multi-channel relay.
- **Scope-enforcement via TOOL, not prompt** (TOOL-SCOPE): worker out-of-scope is tool-gated → shrinks worker prompts (WP-OPT).
- **Desktop app** (ADR-G-033/DESK): interactive chat moves to the Electron desktop app later; the native terminal stays the power surface.

---

## Consequences

**(+)** The product's primary individual surface is a real, agentic, multi-provider, polished terminal at parity with the best CLIs — the pivot's "terminal runs" thesis is shipped. Local-model foundation enables offline/air-gapped + cost-free dogfooding. Enterprise capability is reachable but unobtrusive.

**(−)** TOOL progressive-disclosure, WORKER-LIVE-TRACE, ApprovalBroker integration, and TOOL-SCOPE are roadmap (the "must be BETTER than Hermes at tool+terminal" bar is forward work). Several pieces are delivered-but-not-default: the `src/agent/*` native-agent engine is flag-gated (`DECKENT_NATIVE_AGENT=1` / `--native`, default OFF — M4 cutover pending); `entry.ts` keeps an inline `buildReplProvider` vs the `resolveChatAdapter` SSOT (born PROVIDER-SSOT); the mode-filter + NL-dispatch are not wired to the default Ink path (born SLASH-MODE-WIRE / NL-DISPATCH-DECISION). Dashboard-chat is being de-emphasized in favor of this surface + the desktop app.

---

## References / Absorbed

- **Absorbs:** ADR-081 + ADR-074A + ADR-082A + ADR-083 + ADR-086.
- **Cross-ref:** ADR-G-033 (dashboard = observability; chat→DESK) · ADR-G-025 (WORKER-LIVE-TRACE) · ADR-G-008 (provider-parity/fleet) · ADR-G-022 (/nervous) · ADR-G-031 (enterprise slash) · ADR-G-009 (proof-of-function for surface tasks).
- **Born / MASTER-PLAN:** TERM-* · TOOL-1/2 (progressive-disclosure) · APR (ApprovalBroker) · TOOL-SCOPE · WP-OPT · DESK-1.
- **Memory:** `project_deckent_native_terminal_agent` · `project_hermes_deckent_direction_2026_06`.


---

## adr-g-035: Memory Architecture (DB-First, FTS5, Self-Learning Substrate)

**Status:** accepted

# ADR-G-035: Memory Architecture (DB-First, FTS5, Self-Learning Substrate)

**Class:** ADR-G (Global / Constitution) · **Scope:** global+project · **Immutable:** yes · **Source:** publisher · **Enforcement:** today=sync-invariant (any write keeps content_norm + FTS5 + entry_history consistent; audit_hmac is audit-rows-only, NOT every entry; direct SQL UPDATE is a discipline, not enforced — a getRawDb escape hatch exists) + additive idempotent taxonomy migration (never a destructive rebuild; schema_version bump + backup-guard are born, not yet wired) → tomorrow=opt-in local-embedding vector layer (sqlite-vec, never-calls-home) + scope-layers (MEM-2) + index/SLA (MEM-3)
**Status:** accepted (provisional — DB-first+FTS5+exports shipped; taxonomy storage partial + class/scope-aware recall unwired [TAXONOMY-READPATH]; HMAC audit-rows-only; schema_version not bumped) · **Date:** 2026-06-30 · **Absorbs:** ADR-088 (Memory V2 — DB-First) · **Supersedes:** ADR-009 (DEBT.md markdown table — archived)
**Crosswalk:** ADR-088 → ADR-G-035

> **Substrate note:** This is the storage substrate the rest of the governance stands on — ADR-G-019 (class-aware ADR storage/recall/injection), ADR-G-032 (self-learning loop), and the LEARNINGS-QUALITY work all read/write through it. Its schema is **extended here to carry the 4-layer ADR taxonomy** (`adr_class`/`scope`/`immutable`/`source_authority`/`enforcement_level`).

---

## Context

Brain knowledge originally lived as hand-maintained markdown (DEBT.md, MEMORY.md, DECISIONS.md). It did not scale: a 96 KB ADR file, no search, merge conflicts, no decay or history. Memory V2 (old ADR-088) replaced it with a **DB-first** model — SQLite (`better-sqlite3`) is the single source of truth; `.md` files are generated exports for git review/diff. The 2026-06-30 ADR redesign adds a requirement on top: the memory must store the **4-layer ADR taxonomy** (ADR-G-019) class/scope/immutability metadata and support **class/scope-aware recall + injection**.

---

## Decision (Today)

### 1. DB-first, exports are views

All brain knowledge — ADRs, learnings, retros, tech-debt, patterns, identity — is stored **DB-first** in `.brain/memory.db`. `docs/adr/*.md` + `.brain/exports/*.md` (`summary/decisions/memory/debt`) are **generated exports, not sources of truth**. Code reads via `MemoryStore` (`store.getByType('adr')`, `searchMemory(...)`) — never by parsing `.md`. `.brain/memory.db` is gitignored (rebuildable from exports via `memory-import`); `.brain/exports/*.md` are git-tracked.

### 2. Schema (5 tables + FTS5) — extended for the ADR taxonomy

```xml
<schema>
  <table name="entries">
    id, type, source, title, content, summary, *_norm, status, priority,
    sprint_id, sprint_num, lang, decay_exempt, metadata, tenant_id, timestamps,
    audit_prev_hmac, audit_hmac,
    <!-- NEW (ADR-G-019 taxonomy): -->
    adr_class,          <!-- G | D | UG | UP (null for non-ADR entries) -->
    scope,              <!-- global | project -->
    immutable,          <!-- bool -->
    source_authority,   <!-- publisher | contributor | user -->
    enforcement_level   <!-- advisory | runtime | hard -->
  </table>
  <table name="tags"/>
  <table name="relations">references|supersedes|caused_by|resolves|blocks|depends_on</table>
  <table name="entry_history">field-level change tracking</table>
  <table name="schema_version"/>
  <fts5 name="entries_fts">title/content/summary/tag_text + turkishNormalize variants (8 cols)</fts5>
</schema>
```

The new taxonomy columns are **additive + idempotent** (ALTER TABLE guarded by a column-existence check — never a destructive rebuild); FTS5 is preserved. NOTE: `SCHEMA_VERSION` is still `1` (not yet bumped) and there is no automatic backup-guard around the migration (backup is a separate `deckent memory backup` command) → born SCHEMA-VERSION-BUMP.

### 3. Search — dual-layer (class/scope-aware = roadmap)

`searchMemory()` runs **two layers**: original text + `turkishNormalize()` (TR/EN/DE ≈100% recall). Correct FTS5 shape: `SELECT e.* FROM entries_fts f JOIN entries e ON e.rowid=f.rowid WHERE entries_fts MATCH ?`. The **class/scope-aware** intent (ADR-G-019: a user-project worker gets ADR-G always + relevant ADR-UG/UP, never ADR-D; a deckent-dev worker also gets ADR-D) is NOT yet real — the taxonomy read-path is unwired: `rowToEntry()` does not return the `adr_class`/`scope`/`immutable`/`source_authority`/`enforcement_level` columns, `buildFilterClauses()` has no class/scope filter, and `adr-file-sync` does not parse `enforcement_level`. So the write side stores taxonomy (insert-only) but recall/injection is still class-flat → born TAXONOMY-READPATH (shared with ADR-G-019).

### 4. Sync invariant + decay + audit

Any write through `MemoryStore.insert/upsert/update` keeps `content_norm` + FTS5 + `entry_history` consistent; **direct SQL `UPDATE` is discouraged** (misses norm/FTS5) — but this is a discipline, NOT enforced: `getRawDb()` is an escape hatch and a few migration/backfill paths (`memory-import`) do use `UPDATE entries` directly. **Editing an ADR/entry means updating BOTH the `.md` AND the DB** (doc == DB; regenerate exports with `deckent memory export`). `store.decay(currentSprintNum, decayAfterSprints)`; `decay_exempt=1` for permanent governance (ADRs, identity). The HMAC chain (`audit_prev_hmac`/`audit_hmac`, tamper-evident) is applied to **audit rows** via `insertAuditWithHmac`, NOT to every memory-entry write.

### 5. Surfaces

CLI `deckent recall|remember|memory rebuild|export|stats`; MCP `deckent_memory_query`; config `memory.backend/search/decay_after_sprints`. Brain auto-query: Task-DNA → relevant ADR/pattern/memory injected at PLAN/SPAWN/EVALUATE.

---

## Intent / Roadmap (Tomorrow)

- **Opt-in vector layer (MEM):** a local-embedding semantic layer (`sqlite-vec`, Ollama-local embeddings, **never-calls-home**) added *alongside* FTS5 — class/scope-aware semantic recall. Opt-in; FTS5 stays the default (preserves ADR-D-005 dependency discipline + the never-phone-home moat). This was the deliberate "evolve better-sqlite, don't migrate to a vector DB" decision.
- **Scope layers (MEM-2):** project / session / global memory partitions (mirroring the ADR-UG/UP scope split).
- **Index / SLA (MEM-3):** query-index + worker-spawn/recall SLA (PERF-2).
- **LEARNINGS-QUALITY:** Brain Learnings/Gains today read "nice but half-baked / not genuinely learned." Perfect the *content* of the self-learning record (real learned-content, searchable) — for dogfood AND user. (Substrate for ADR-G-032's loop.)

---

## Consequences

**(+)** One SQLite SSOT scales where markdown did not: search, decay, history, HMAC-audit, class/scope-aware ADR injection. The taxonomy columns make ADR-G-019's precedence/immutability machine-enforceable. Exports keep git review/diff. The never-calls-home property is preserved (local embeddings only, when the vector layer lands).

**(−)** `memory.db` is gitignored → rebuildable but not diffable (exports are the diff surface). The dual-write invariant (md + DB) is a discipline contributors must follow. The vector layer is roadmap/opt-in, not today. LEARNINGS-QUALITY is an open quality gap (the loop runs; the content needs to become genuinely-learned).

---

## References / Absorbed

- **Absorbs:** ADR-088 (Memory V2 DB-First). **Supersedes:** ADR-009 (archived).
- **Cross-ref:** ADR-G-019 (ADR taxonomy — these columns store it) · ADR-G-032 (Self-Learning Loop — runs on this substrate) · ADR-G-031 (tenant_id / audit-hmac enterprise) · ADR-D-005 (dependency policy — sqlite-vec opt-in justification).
- **Born work-items:** TAXONOMY-READPATH (rowToEntry + buildFilterClauses class/scope filter + adr-file-sync enforcement_level parse + upsert taxonomy-update → class/scope-aware recall/injection; shared with ADR-G-019) · SCHEMA-VERSION-BUMP (schema_version bump + backup-guard + direct-SQL migration-only API) · LEARNINGS-QUALITY · MEM-2 (scope-layers) · MEM-3 (index/SLA) · vector-layer (opt-in, never-calls-home).
- **Direction:** `.analysis/adr-governance-redesign-plan.md` §5 (DB strategy = better-sqlite evrim).
