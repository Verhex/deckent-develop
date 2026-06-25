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
