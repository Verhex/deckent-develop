# 🌙 OVERNIGHT CC-FIX LOOP — deckent dogfooding (hybrid)

> **Mode:** CC-driven autonomous fix-loop, started 2026-06-25 (post sprint-323 P1/P2).
> **Hybrid plan:** CC-fix loop NOW (source-only, build-independent) → after Alperen builds
> (post bot/voice work), transition to **deckent autonomous-sprint** dogfood.
>
> **GUARDRAILS (binding, every iteration):**
> - Commit-only, **NO push** (Alperen-gated). Stage ONLY my files; `git fetch` + drift-check before each commit; shared `main` (3 sessions) — never break others' commits.
> - Source-only: **NO build / NO sprint-spawn / NO `/login`**. Verify with `tsc --noEmit` + `vitest` (affected-suite).
> - **NO kill / cleanup / `rm .tasks/*`**; never delete `.brain/memory.db`.
> - **Fabrike-sil yasak:** delete a src module only with proven zero-caller AND a sanctioned/unambiguous disposition. Modules the triage reserved for Alperen's **WIRE-vs-KES** decision are NOT deleted unattended — recorded here, proof-backed, decision-ready.
> - **Attended-defer (NOT done unattended):** ADR-075 core-routing wire (routing-balance judgment), any behaviour-changing core change.
> - Each iteration: do one backlog item → faithful verify → record here → commit → schedule next wake. Türkçe rapor.
>
> **Safe backlog:** (1) dead-code dispositions + sanctioned/unambiguous deletions · (2) C5 dead-test cleanup (tautological/mock-only → real-assert or remove) · (3) half-wired-feature + zero-caller discovery sweep · (4) design-docs (ADR-075 routing-reorder spec, enforcement-vein design).

---

## Iteration 1 — 028/C3 dead-code disposition (proof-backed, Alperen WIRE-vs-KES ready)

Fresh zero-caller + supersession analysis of the 028/C3 candidates (`grep`-proven, file:line). `batch-stats` already removed (sanctioned, commit `2a9b43eb`). Remaining:

| Module | Live caller? | Disposition | Proof |
|--------|-------------|-------------|-------|
| `orchestra/result-merger.ts` (ResultMerger + overlap, ~100 LoC) | **ZERO** (no import, no `ResultMerger`/`mergeResults`/`MergeableResult` ref outside self) | **KES-ready** — but no live equivalent found (sprint-summary computed elsewhere/inline) → *could* be a never-built feature. Low value; recommend **KES** unless Alperen wants the overlap/merge feature wired. | `grep ResultMerger src --include=*.ts` → only self |
| `orchestra/task-retry.ts` (shouldRetry/createRetryTask/backoff, ~92 LoC) | **ZERO** module-import; the live `shouldRetry` hits are a DIFFERENT symbol — `CascadeDecision.shouldRetry` field (`sprint-spawner.ts:1244`, `result-evaluator.ts:1682/1711/1730`, via `evaluateFailureCascade`) | **KES-ready (superseded)** — the retry concept is ALREADY wired via the cascade-decision mechanism; task-retry is an orphaned earlier duplicate. "WIRE" is moot. Recommend **KES** + architecture.md update. | `grep "from .*task-retry" src` → ZERO; cascade is the live retry path |
| `orchestra/brain-context.ts` (~268 LoC) | ZERO | **KEEP (Defer)** — sprint-139 decision-matrix **Defer+ADR**, High risk. | `docs/audits/sprint-139/dead-code-decisions.md:33,148` |
| `orchestra/capability-realizer.ts` | ZERO prod | **KEEP (feature)** — AS-4 capability-realization with dedicated tests (`tests/core/as4-p1-realize`, `as4-p2-skills`). | as4-* test suite |
| `orchestra/pattern-recorder.ts` ← `pattern-reader.ts` | ZERO prod (reader feeds decision-engine) | **KEEP (dormant ref-impl)** — decision-engine ADR-028 reference implementation (sprint-139 Defer); integration-tested. | sprint-139 doc + decision-engine.test |

**Decision needed from Alperen (WIRE-vs-KES):** `result-merger` (KES recommended, low value) + `task-retry` (KES recommended, proven superseded). The other three are KEEP (sanctioned Defer / live feature / dormant ref-impl) — not deletion candidates. Until ruled, **nothing deleted** this iteration (fabrike-sil yasak).

---

## Iteration 2 — zero-caller / half-wired discovery sweep (orchestra/ + core/)

Heuristic: a top-level module with **0 production importers** (static `from` + dynamic `import()` + first-symbol use all NONE), filtered to those carrying tests = "tested-but-dead / half-wired". Spot-verified the interesting ones by ALL exports.

**Coherent finding:** deckent ships a layer of **built + tested but never-wired infrastructure** — a half-built performance / multi-tenancy / session layer. ~14 zero-caller modules; cross-referenced against the triage:

- **KNOWN (already in triage/B11/memory):** `skill-cache` (all exports DEAD), `rate-limiter` (core `TenantRateLimiter` DEAD — dead-duplicate of live `api/rate-limiter.ts`; only the `RateLimitResult` type is shared → B-RATELIMITER-DISAMBIG), `skill-registry`, `provider-capabilities`, `auth-session`, `audit-export`, `global-config`, `interaction-policy`, `notification-config`, `credentials` (B11 enterprise), `telemetry` (B7), `spawn-safety` (B4), `monitor-adapter` (triage: prod-DEAD), `timeout-watcher` (B11 KES), `multi-agent` (B11 WIRE), `decision-replay`/`pattern-reader`/`brain-context`/`capability-realizer` (iter-1 + sprint-139).
- **🆕 NEW (not in triage):**
  - **`core/agent-cache.ts`** (171 LoC, `AgentSelectionCache`/`TaskSignatureInput`/`CachedResult` — ALL DEAD) — "LRU cache for agent selection results, pure logic". The routing-engine selects an agent **per task with no memoization**; this cache was built + tested to memoize `selectBestAgent` results but is **never wired** into `routeTaskV2`. Half-built perf feature. **WIRE-vs-KES** (WIRE = routing perf on large sprints; KES = dead).
  - **`core/lazy-loader.ts`** (145 LoC, `lazyLoad`/`LazyHandle`/`LazyMap`/`PreloadConfig` — ALL DEAD) — "generic lazy-load utility, load-on-first-access, pure logic". Zero callers anywhere. Likely abandoned generic util. **KES recommended** (no consumer, no clear future hook) unless a planned lazy-init use exists.
- **Note (not a finding):** `spawn-backend-mock` is a test helper that intentionally lives in `src/` (MockSpawnBackend) — used by tests, NOT dead. `config-validator` is a 6-LoC re-export shim. Both excluded.

**Action:** recorded for Alperen's WIRE-vs-KES; **nothing deleted** (unattended deferral). The NEW `agent-cache` is the more interesting one — a real, tested routing-perf feature left unwired (sibling to the ADR-075 affinity gap: routing has multiple built-but-unwired enhancements).

---

## Iteration 3 — design-doc: ADR-075 affinity wire (routing-reorder spec)

Turned the confirmed **#2 wiring gap** (ADR-075 affinity tested-but-dead) into an implementable,
flag-gated design → **`DESIGN-ADR-075-AFFINITY-REORDER.md`**. Summary:
- **Root cause** (file:line): `routeTaskV2` order is agent-first (`:364`) → skill-second (`:406`),
  so `selectBestAgent` lacks `assignedSkills` and can't build the affinity context that
  `activation-engine.ts:91` needs. All 3 `evaluateActivation` calls are 2-arg.
- **Recommended:** Option A — reorder skill-selection ABOVE agent-selection (safe: skills don't
  depend on agent), add `routing.skill_agent_affinity` flag (default-off → byte-identical), thread
  `{agentId, assignedSkills, enabled}` into the 3 calls. Option B (two-pass re-run) rejected.
- **Faithful test plan** + **routing-balance gate** (measure agent-distribution delta before any
  default-on — ADR-075's own imbalance concern cuts both ways).
- **Bundles with** the iter-2 `agent-cache` finding → one "routing-v2 enhancements" attended sprint.
- **Status:** design-ready; **implementation attended-defer** (behaviour-changing core routing).

---

## Iteration 4 — C5 dead-test cleanup (323-030): `tests/cli/init-published.test.ts` ✅ REAL FIX

First C5 conversion. The file had **10 tests: 2 genuine + 8 tautological** (zero coverage):
- 5× literal `expect(true).toBe(true)` ("structural verification" placeholders).
- 1× `expect(existsSync(path) || true).toBe(true)` — the `|| true` makes it always pass.
- 2× `expect(writeFileSync).not.toHaveBeenCalled()` where the init command was **never invoked** → trivially true (nothing could call the mock).

The 8 never ran the SUT (`handleInit`/`writeIfNotExists`/`ensureDir` are not exported from init.ts), so they could not be cheaply converted in place. **Action (convert > delete):** rewrote the file to **5 REAL publish-compat regression guards** — kept the 2 genuine `package.json` checks (files/bin) and replaced the 8 theater tests + all 11 now-unused module mocks with real assertions:
1. `package.json.files` ⊇ {dist, LICENSE}
2. `bin.deckent === ./dist/cli/entry.js`
3. **`DECKENT_VERSION === package.json.version`** — behaviour guard: constants.ts resolves the version via the install path; a broken (CWD-relative) resolution hits the IIFE catch → `'0.0.0'` ≠ real version → RED. **Faithful.**
4. constants.ts source uses `fileURLToPath(import.meta.url)`, never `process.cwd()` (mechanism guard).
5. init.ts source uses `join()`, never `process.cwd()`.

Verify: **5/5 green, tsc=0**, mock-free, hermetic. Net: −8 tautologies, +3 real faithful assertions (coverage UP, not down). Commit `<next>`.
**Follow-up noted (not done):** `writeIfNotExists`/`ensureDir` runtime behaviour belongs in the helper module's own test — verify that coverage exists (separate sweep). Self-mock candidates to inspect next: `plugin.test.ts`, `autonomous.test.ts`, `config.test.ts`, `output.test.ts` (may be legit partial-mocks, not tautologies).
