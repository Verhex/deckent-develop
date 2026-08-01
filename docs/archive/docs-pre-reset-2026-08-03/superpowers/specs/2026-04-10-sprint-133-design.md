# Sprint 133 Design — Security Hardening + Critical Fixes + Load Test + Auto-Archive

**Date:** 2026-04-10
**Origin:** Sprint 132 Full 360° Enterprise Readiness Audit ([docs/audits/sprint-132/FINAL-EXECUTIVE-REPORT.md](../../audits/sprint-132/FINAL-EXECUTIVE-REPORT.md))
**Brainstorming Session:** Superpowers brainstorming skill, 4-question elicitation
**Decisions logged to memory:** `feedback_max_workers.md` (HARD LIMIT: max_workers ≤ 4)

---

## 1. Context & Motivation

Sprint 132 tamamlandıktan sonra 6 paralel uzman worker + 1 reducer (W7) Deckent'in enterprise-readiness skorunu **3.2/5 (NEEDS-WORK)** olarak ölçtü. Toplam 118 bulgu tespit edildi: **5 CRITICAL**, 27 HIGH, 40 MEDIUM, 26 LOW, 19 INFO. En kritik alanlar:

- **Güvenlik (2.5/5)** — plugin sandbox, npm scripts, API auth, plaintext credentials
- **Performans (3.0/5)** — 799 sync I/O, config caching yok, O(n²) results.find, god objects
- **Mimari tutarlılık** — sprint-reporter.ts god object, sprint-controller.ts 2133 satır, Sprint 131 ADR'leri eksik

Bu sprint'in hedefi: rapordaki **5 CRITICAL**'ın 4'ünü, HIGH'ların 5'ini, ek olarak kullanıcı tarafından önerilen **DIRECTIVES auto-archive** özelliğini, Sprint 134'ten erken çekilen **credential encryption** + **marketplace [EXPERIMENTAL]** işaretlemesini ve ilk kez **empirik yük testi** yapmaktır.

## 2. Goals & Non-Goals

### Goals

1. Sprint 132 CRITICAL bulgularının **4 tanesini** üretim kalitesinde kapatmak (plugin sandbox, npm ignore-scripts, config cache, HTTP API auth)
2. Sprint 132 HIGH bulgularının **5 tanesini** kapatmak (results → Map, Sprint 131 ADR'leri, 5 kritik modül testi, competitive docs, DIRECTIVES auto-archive)
3. Deckent'in kendi sprint pipeline'ını **empirik yük testine** sokmak (P50/P95/P99 ölçümü)
4. FINAL-EXECUTIVE-REPORT.md'yi çözülmüş bulgular için **Katman 3 doğrulama sonrası** güncellemek
5. Sprint 134'e öne çekilen iki düşük riskli task'ı (credential encryption, marketplace işaretleme) 133'e dahil etmek

### Non-Goals

- **sprint-reporter.ts 4-way split** (HIGH effort, Sprint 134)
- **sprint-controller.ts split** (HIGH effort, Sprint 134)
- **Task dependency pipeline entegrasyonu** (parser + spawner + parallel-pipeline, HIGH effort, Sprint 134)
- **Async I/O migration** (HIGH effort, Sprint 135+)
- **Docker worker scope isolation** (MEDIUM, Sprint 134)
- **SWE-bench benchmark** (HIGH, Sprint 135+)
- **npm publish + GitHub public repo** (Sprint 135+)

## 3. Success Criteria

Sprint 133 şu koşullarda **GO** olarak kabul edilir:

1. **12 task'tan ≥10 task** `selfAssessment: DONE` veya `GO_WITH_TECH_DEBT` ile tamamlanır
2. **`tsc --noEmit`** sprint sonrası 0 error döner
3. **`npx vitest run`** sprint sonrası ≥89% coverage + önceki test sayısından eksik yok
4. **Katman 3 kabul kriterleri** (her task için 1 adet) ≥10 task için ✅ olur
5. **FINAL-EXECUTIVE-REPORT.md** güncel skor yansıtır: Enterprise-Readiness 3.2 → ≥3.5
6. **Yük testi task'ı** (133-009) P50/P95/P99 değerlerini `.tasks/task-133-009.result` içinde üretir

## 4. Task Breakdown (12 Tasks)

| # | Title | Category | Primary Files | Agent + Skills | Model | Effort |
|---|-------|----------|---------------|----------------|-------|--------|
| 133-001 | Plugin hook sandbox hardening | CRITICAL Sec | `src/core/plugin.ts`, `src/core/plugin-loader.ts` | security-auditor + security-specialist | opus | MEDIUM |
| 133-002 | npm `--ignore-scripts` default | CRITICAL Sec | `package.json`, `src/core/plugin.ts` | security-auditor + security-specialist | sonnet | LOW |
| 133-003 | HTTP API Bearer token auth | HIGH Sec | `src/api/server.ts`, `src/api/auth.ts` (new) | api-builder + security-specialist | opus | MEDIUM |
| 133-004 | loadConfig() module-level cache | CRITICAL Perf | `src/core/config.ts` | performance-analyzer + performance-optimizer | opus | LOW |
| 133-005 | results → Map index (O(n²)→O(n)) | HIGH Perf | `src/orchestra/sprint-controller.ts`, `src/orchestra/result-collector.ts` | performance-analyzer + performance-optimizer | opus | LOW |
| 133-006 | Sprint 131 ADRs (ADR-029..032) | HIGH Docs | `.brain/DECISIONS.md` | architect + documentation-writer | sonnet | NORMAL |
| 133-007 | Critical module unit tests (5 modules, ≥15 tests) | HIGH Test | `tests/unit/heartbeat-daemon.test.ts`, `mid-sprint-adapter.test.ts`, `promotion-pipeline.test.ts`, `spawn-backend-docker.test.ts`, `sprint-utils.test.ts` | test-writer + testing-expert | opus | NORMAL |
| 133-008 | Competitive analysis update (Apr 2026, 5 rivals) | HIGH Docs | `docs/analysis/competitive-analysis.md`, `README.md`, `README-TR.md` | doc-writer + documentation-writer | sonnet | LOW |
| 133-009 | Load test: P50/P95/P99 microbenchmark | NEW | `tests/load/load-harness.test.ts`, `tests/load/hot-paths.bench.ts` | performance-analyzer + testing-expert | opus | HIGH |
| 133-010 | `finalizeSprint()` DIRECTIVES auto-archive | NEW (user-proposed) | `src/orchestra/sprint-controller.ts`, `src/orchestra/sprint-reporter.ts` | architect + typescript-expert | opus | NORMAL |
| 133-011 | Credential encryption (minimal OS keychain wrapper) | Sprint 134 early-pull | `src/core/credentials.ts`, `src/core/credential-encryption.ts` (new) | security-auditor + security-specialist | opus | MEDIUM |
| 133-012 | Marketplace `[EXPERIMENTAL]` labeling + doc fix | Sprint 134 early-pull | `docs/guide/marketplace.md`, README | doc-writer + documentation-writer | haiku | LOW |

**Effort distribution:** 4 LOW + 2 NORMAL + 5 MEDIUM/opus + 1 HIGH = ~2.5-4 hours parallel execution (4 workers)

### Task Dependencies

- 133-005 blocked by 133-004 (cache in place before Map refactor)
- 133-010 blocked by 133-006 (ADR-029..032 written first, consistent DECISIONS.md format)
- 133-011 blocked by 133-002 (ignore-scripts lands before credential handling)

**Known risk:** Sprint 132 finding #3 (`parseStructuredDirectives` + `spawnWorkers` do not honor dependencies). Dependencies may be ignored at runtime. Accepted — each task is correct standalone; dependencies are advisory for this sprint.

## 5. Architecture Decisions

### 5.1 Worker Pool — `max_workers=4` (HARD LIMIT)

Kullanıcı tarafından onaylanmış kural: WSL2 host RAM/CPU 5+ worker kaldırmıyor. 12 task 4 worker havuzunda sırayla işlenecek. Bu **yük testinin kaldıracıdır**: her worker ~3 task rotasyonu → claim/release/heartbeat hot path ~36-40 kez tetiklenir → rapordaki sync I/O (799) bulgusu empirik olarak hissedilir.

### 5.2 Planning Mode — `structured` (not `ai`)

DIRECTIVES.md çok detaylı yazılacak (her task için Scope/Files/Skills/Agent/Model/Effort/Evidence/Test alanları). Structured mode deterministic parse eder; AI mode'un yorumlama payı bu sprint'te risk.

### 5.3 Provider + Tier

- `brain_provider: claude`, `worker_provider: claude`
- `brain_tier: premium` (opus)
- `worker_tier: premium` (opus varsayılan) + task-level `Model:` override (sonnet/haiku LOW effort'larda)

### 5.4 Verify Loop — Full (NOT skipped)

Sprint 132 statik audit'ti, verify loop skip edildi. Sprint 133 her task'ta kod değiştirecek — her worker `tsc --noEmit` + `npx vitest run` çalıştırmalı, max 3 deneme, başarısızsa NO_GO.

## 6. External Monitoring (3 CC Sub-Agents)

Deckent sprint'ini **dışarıdan** izleyen 3 paralel Claude Code alt-agent'ı ana session'dan `Agent` tool ile `run_in_background=true` modda başlatılır:

| Agent | Interval | Role | Output |
|-------|----------|------|--------|
| **A — Live Watchdog** | 15s | `deckent_status` + heartbeat staleness + tmux health + `.brain/ERRORS.md` tail | Per-iteration 1-line status; long report on alerts |
| **B — Result Verifier** | 45s | New `.tasks/*.result` scan + `git diff --stat` boundary check + sample `vitest` run (3-4 tasks) | Per-iteration task verification table |
| **C — Report Updater (Prep)** | 90s | Completed task → FINAL-EXECUTIVE-REPORT.md Top 10 table + Score axes mapping | In-memory updated report, final handoff to main session |

These agents are **non-Deckent** — they don't appear in Deckent dashboard and do not count toward `max_workers`. They exist only in the Claude Code harness run by Alperen.

## 7. Layer-3 Verification Plan (Post-Sprint)

Sprint completion triggers manual verification by main session (Claude, not Deckent Brain):

1. `tsc --noEmit` — full build, 0 errors required
2. `npx vitest run` — full suite, coverage report, test count regression check
3. `git diff --stat` — change magnitude summary (expected ~800-1500 LoC)
4. **Per-task acceptance criteria** (12 items, ~30s each):
   - 133-001: Load sandbox-less plugin → expect rejection
   - 133-002: `grep ignore-scripts package.json` → hit
   - 133-003: `curl http://localhost:3000/status` without auth → 401
   - 133-004: Config cache hit ratio log or metric present
   - 133-005: `grep "results.find" src/orchestra/sprint-controller.ts` → 0 matches
   - 133-006: `grep "ADR-029\|ADR-030\|ADR-031\|ADR-032" .brain/DECISIONS.md` → all hit
   - 133-007: 5 new test files exist + total test count ≥15
   - 133-008: `grep "Nisan 2026" docs/analysis/competitive-analysis.md` → hit, rival count=5
   - 133-009: Load test files exist + P50/P95/P99 values in `.result`
   - 133-010: `grep "archiveDirectives\|auto-archive" src/orchestra/sprint-controller.ts` → hit
   - 133-011: `src/core/credential-encryption.ts` exists + unit test
   - 133-012: `grep "EXPERIMENTAL" docs/guide/marketplace.md` → hit

5. **Layer-3 report written to main session** — pass/partial/fail per task
6. **Only tasks passing Layer 3** get marked in FINAL-EXECUTIVE-REPORT.md

## 8. FINAL-EXECUTIVE-REPORT.md Update Strategy

Updated sections:

- **§1 Executive Summary** — "Top 3 critical findings" → add "Sprint 133 resolution" marker, new score
- **§4 Cross-Cutting Findings** — 4-5 rows marked `RESOLVED Sprint 133`
- **§5 Top 10 Most Critical Findings** — new `Status` column (✅/🟡/⏳)
- **§6 Enterprise-Readiness Score** — projected: Güvenli 2.5→3.3, Hızlı 3.0→3.5, Customize 4.0→4.2, Overall 3.2→3.6
- **§8 Sprint 133+ Roadmap** — "Proposed" → "COMPLETED" + Sprint 134 revised

Commit message:

```
feat: Sprint 133 — Security Hardening + Critical Fixes + Load Test + Auto-Archive

- 12 tasks completed (4 CRITICAL + 3 HIGH sec/perf + 3 docs/test + 2 new features)
- Enterprise-Readiness Score: 3.2 → 3.6 (validated via Layer-3 verification)
- FINAL-EXECUTIVE-REPORT.md updated with resolved findings status
- Ran via Deckent with max_workers=4 + 3 external CC monitoring agents
```

## 9. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| 4 workers simultaneous `loadConfig` races before cache task (133-004) lands | HIGH | Load test noise | 133-004 marked `priority: CRITICAL`, claimed first |
| 133-001 sandbox setup breaks existing plugins | MEDIUM | Test suite failure | Layer 3 full vitest catches; NO_GO → Sprint 134 reroll |
| 133-007 (5 test files) too large for one worker → timeout | MEDIUM | NO_GO | `effort: high`, timeout 45min, splittable |
| Dependency pipeline broken → 133-005 runs before 133-004 | HIGH (known) | Noisy metric | Accepted; 133-005 correct standalone |
| 3 monitor agents generate extra disk I/O | MEDIUM | Deckent heartbeat delay | Fallback: Agent A 15s → 30s |
| Sprint >4 hours, "bugün bitirelim" slips | MEDIUM | Delay | After 4h: `deckent_kill` stalled tasks, spill to Sprint 133b |

## 10. Timeline Estimate

| Phase | Duration |
|-------|----------|
| Spec writing + DIRECTIVES + config | 15-20 min |
| Sprint execution (4 workers, 12 tasks) | 2.5-4 hours |
| Layer-3 verification | 15-25 min |
| FINAL report update + commit | 10-15 min |
| **Total** | **3-5 hours** |

---

*Generated after 4-question brainstorming session (Alperen + Claude Opus 4.6).*
*All decisions approved: Proposal A (scope), max_workers=4 (hard limit), 3 monitor agents with tight intervals (15s/45s/90s), Layer 3 verification.*
