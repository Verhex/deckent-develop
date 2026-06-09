# Mixed-Fleet Sprint-249 — Forensic Failure Analysis (valuable failure data)

**Date:** 2026-06-09 · **Sprint:** 249 (15 tasks, 4 providers simultaneous) · **Method:** disk-verify ground truth (3 parallel forensic agents + direct inspection), NOT Brain verdicts.

> Built on the Sprint-248 provider-parity unlock (codex/gemini real host-adapter workers, E2E-gated). This was the first large mixed-fleet dogfood. **The orchestration mechanically succeeded — 4 providers really ran, 14/15 deliverables are genuinely correct on disk — but the evaluation / routing / verify layers produced misleading verdicts and wasted time (8 timeouts).** That gap is the value here.

> **FINAL (sprint concluded, 41m17s):** Brain RETRO = **21 attempts (15 + 6 FIX): 4 DONE / 7 TECH_DEBT / 10 NO_GO**. Disk-truth = **14/15 deliverable files correct on disk** (only `docs/guide/feature-matrix.md` missing — gemini-013 flag-leak degrade never created it). The chasm between "4 DONE" and "14/15 correct on disk" IS the headline: the evaluation layer massively undercounts real success. FIX helped (converted some NO_GO→TECH_DEBT) but re-hit the same walls (MF-7). The main `deckent start` process lingered ALIVE after the logical conclusion (RETRO written, workers gone) — minor clean-exit gap (MF-9).

## 1. Headline

| Layer | Result |
|---|---|
| **Spawn (did the real provider run?)** | claude 5/5 ✅ · codex 4/4 ✅ (real gpt-5.5 host) · gemini **2/4** (011/012 host ✅, 010/013 docker-degraded→claude ✗) · ollama 2/2 ✅ (real qwen3.6 host, despite a noisy warning) |
| **Deliverable (file correct on disk?)** | **~13/15 genuinely correct** (claude 5, codex 4, gemini 2 [011/012; 010 exists but synthetic-NO_GO; **013 file MISSING**], ollama 2) |
| **Brain verdict** | DONE=9 / NO_GO=6 → **~4 FALSE NO_GO** (codex docs are correct but NO_GO'd) |
| **Cost** | anthropic $0 (subscription) ✅ · ollama $0 (local) ✅ · codex/gemini mislabeled `(api)` 🔴 F1-CB |

**Conclusion:** mixed-fleet works; the failures are in *evaluation accuracy*, *routing reliability for non-claude*, and *verify-loop discipline*, not in the core orchestration.

## 2. Per-provider contract compliance

| Provider | Tasks | Real-provider | .plan | File correct | Verdict | Note |
|---|---|---|---|---|---|---|
| **claude** (docker) | 001-005 | 5/5 | **5/5** | 5/5 | 5 DONE | Gold standard. Full contract. |
| **codex** (host, gpt-5.5) | 006-009 | 4/4 | **4/4 real plans (706-1196B)** | 4/4 | **4 NO_GO (FALSE)** | Best worker-discipline (wrote plans, ran lint+smoke) — killed by running the full test suite (see §3.1). |
| **gemini** (host) | 010-013 | 2/4 | **0/4** | 2/4 (013 missing) | 011/012 DONE, 010/013 NO_GO | Never writes .plan; 2 tasks degraded to claude. |
| **ollama** (host, qwen3.6) | 014-015 | 2/2 | 0/2 | 2/2 | 2 DONE | Real ollama (93k/10k tokens); small-scope worked. |

## 3. Root causes (file:line) → fixes

### FIX-P1 — Tier-0 doc tasks run the full test suite → false NO_GO + timeout (HIGHEST VALUE)
The worker Verify Loop (`.claude/rules/worker-default.md:27-31`) is **unconditional** ("Run test suite"). Brain exempts doc tasks at *evaluation* (`result-evaluator.ts:158` `isDocTask→DONE`) but the **prompt does not** (`task-builder.ts buildWorkerPrompt` has no isDocTask gate). Shell-capable external CLIs (codex) obey the prompt → run `npm test` (full 17k-test suite) → it collapses under their sandbox (EROFS on `~/.codex/config.toml`, EPERM on spawn/listen, API-endpoint 10s timeouts, + 63 pre-existing failures) → self-NO_GO despite a correct doc + passing `npm run lint` + passing smoke. This caused **4 codex false-NO_GO + most of the 8 timeouts**.
**Fix:** add an `isDocTask`/Tier-0 gate to `buildWorkerPrompt` that suppresses or scopes the Verify Loop (no full-suite for doc-only tasks); mirror the Brain-side exemption in the prompt.

### FIX-P2 — Non-claude routing leaks to docker → silent degrade to claude
`sprint-spawner.ts:438` `isAdapterProvider(p) ? getProviderAdapterForTask(p) : null` → when the adapter is **null** (not registered), falls through to `else if (backend)` → docker → `spawn-backend-docker.ts:getProviderBinaryForModel` degrades to the `claude` CLI.
- **ollama**: bootstrap availability gate (`provider.ts:799-808`) — if the ollama daemon probe races/fails at sprint start, ollama is skipped → not registered → docker fallback (warning fires). *(But 014/015 ultimately ran real ollama — the warning over-fires; see FIX-P6.)*
- **gemini 010/013**: degraded to claude (`workerId:"docker-249-0NN"`, `provider:"claude"`) while 011/012 ran real — **inconsistent** (registration race or a spawn-throw caught → docker fallback).
**Fix:** when `isAdapterProvider(p)===true` but the adapter is null/throws, **HONEST-FAIL** (NO_GO "provider unavailable") instead of silently degrading to claude; lazy re-check provider availability at spawn time (esp. ollama daemon); investigate the gemini 010/013 spawn-throw.

### FIX-P3 — Docker degradation invokes claude even when the task-provider CLI is in the image
Direct probe: the built `deckent-worker:latest` image **has claude+codex+gemini CLIs** (ollama absent). But `Dockerfile.worker:18,26-29` defaults claude-only (codex/gemini are `INSTALL_*=false` opt-in build-args). Regardless, the docker spawn path **hardcodes the claude CLI** rather than invoking the task's provider. So even a codex/gemini-capable image degrades to claude.
**Fix (F1-004/F1-005):** provider-aware docker CLI invocation (use the task's provider binary present in the image) + multi-CLI image incl. ollama + per-provider auth isolation (`~/.codex`/`~/.gemini` volume or env). OR commit to **hard host-routing** for all non-claude (never docker) — simplest, aligns with FIX-P2.

### FIX-P4 — Claude-only flags leak to non-claude CLIs (= WM-5 deferred part)
gemini logs show `Unknown arguments: dangerously-skip-permissions` → `--dangerously-skip-permissions` (a claude-only flag) reached the gemini invocation → reject → fallback. 
**Fix:** gate claude-only args by provider in the spawn arg-builder (`spawn-backend*.ts` / adapter `buildArgs`); never pass `--dangerously-skip-permissions`/`claudeArgs` to codex/gemini/ollama. (This is the high-risk WM-5 piece deferred from Sprint 242 — now confirmed live.)

### FIX-P5 — Result-format consistency (the "rubric/brain-eval kayıp" observation, clarified)
- `brainEvaluation`+`brainEvaluationReason` **are** written back to the main `.result` post-EVALUATE (`sprint-phases.ts:1193-1203`) — present for evaluated tasks (001 DONE, 008/009 NO_GO).
- `rubricScores` are **intentionally audit-only** in `.deckent/evaluations/<sprint>/<task>-attempt-N.json` (`sprint-phases.ts:1218-1225`), **never in `.result`** — so "rubric yok in .result" is by-design, not a bug. **Document this** so it doesn't read as missing.
- `-fix.result` files **lack** `brainEvaluation` (FIX results aren't re-evaluated by EVALUATE) → enrich them too.
- codex `tokenUsage` all-zero (test-fail blocked collection; also F1-CB billing-mode).
- `selfAssessment`↔`brainEvaluation` contradictions (003/004: self=DONE, brain=NO_GO "rubric total 0") — rubric-bridge mis-score (cf. earlier `feedback_brain_rubric_bridge_broken`).

### FIX-P6 — ollama noisy false-degrade warning + image gap
The "Ollama provider routed to Docker backend… falling back to claude… INCORRECT" warning fired (×2) **even though 014/015 actually ran on real ollama** (token evidence). The warning over-fires (pre-flight vs runtime) → misleading. ollama is also absent from the worker image.
**Fix:** only emit the degrade warning when the host adapter genuinely failed; add ollama to the image OR guarantee host-routing.

### FIX-P7 — FIX phase is bounded but ineffective here
`sprint-phases.ts:1622-1665` — FIX runs **once per sprint, 30-min cap, 3-reroute max** (NOT an infinite loop). But it re-runs the same workers with the **same verification approach** → codex re-hits the full-suite wall → re-NO_GO + re-timeout. 8 `.timeout` files; ~38-min sprint dominated by hung codex FIX workers.
**Fix:** FIX must change the verification strategy on retry (apply FIX-P1 scoping); cap codex/external verify time; don't re-run already-disk-correct deliverables.

### FIX-P8 — honest-gate measurement false-positive (host workers)
008 flagged `SCOPE_VIOLATION_OR_EMPTY_WRITE: linesAdded=0` despite a 109-line file → DONE→NO_GO flip. The git-diff/heartbeat line-count measurement under-reports for host (non-docker) workers.
**Fix:** reconcile the line-count measurement for host-adapter workers (the honest-gate empty-write detector mis-fires).

## 4. What WORKED (keep)
- 4 providers spawned and produced real work simultaneously (Sprint-248 parity holds at scale).
- claude (docker) full contract 5/5. codex wrote real `.plan`s + ran lint+smoke (best discipline).
- ollama small-scope tasks succeeded on real qwen3.6 (host, zero-cost).
- Disk-verify caught every false verdict — Brain verdict ≠ ground truth, confirmed.
- Cost gate correctly billed claude/ollama at $0 (subscription/local).

## 5. Fix priority
P0: FIX-P1 (doc no-full-suite) · FIX-P2 (honest-fail, no silent degrade) · FIX-P4 (no claude-flag leak).
P1: FIX-P3 (docker provider-aware / host-routing) · FIX-P5 (result format) · FIX-P8 (measurement).
P2: FIX-P6 (ollama warning/image) · FIX-P7 (FIX strategy) · 63 pre-existing vitest failures (separate hygiene; incl. a test that runs `npm run build` → deletes dist mid-suite).

All hand-coded (spawn/eval path = self-modifying; not dogfood). Cross-ref MASTER-PLAN §14.B (F1-P/F1-PD/F1-CB/F1-004/F1-005) + §14.M.
