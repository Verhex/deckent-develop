# Sprint 148 — Agent Taxonomy Reform + Nervous Dogfood Activation + Cross-Platform Validation

<!-- Dil: TR | Teknik terimler EN -->

**Tarih:** 2026-04-21
**Versiyon:** 0.4.0-beta.4
**Sprint tipi:** Beta-kritik, meta-dogfood
**Önceki sprint:** sprint-147 (23/23 DONE, 0 TD, 49m 34s, ADR-040 accepted)
**Beta GA yolu:** Sprint 148 → 149 → 150 🚀 (2 gün 18 saat kaldı)

---

## Tema

> **"Deckent kendi taksonomisini nervous system ile düzeltir"** — self-healing architecture

Sprint 147 `AgentRoutingHealth` detector'ı kendi sprint'inde %95 anomaly kaydetti (`test-writer` 22/22 task). Sprint 148 Block A bu anomalyi çözer → Block B (detector re-run) pozitif sonuç döner. **Bu Deckent'in ilk "conscious" sprint'i** — kendi sorunlarını görür, nervous system ile rapor eder, kendi worker'ları ile düzeltir.

---

## Hedefler

| # | Hedef | Block | Task'lar |
|---|-------|-------|---------|
| 1 | **Agent Taxonomy Reform** — test-writer kaldır, routing V3 | A | T1–T5 |
| 2 | **Nervous Dogfood** — enabled=true, 5 detector canlı | B | T6–T13 |
| 3 | **Cross-Platform Validation** — macOS/Linux/WSL2 × 3 backend | C | T14–T19 |
| 4 | **Polish + Debt Liquidation + Docs** — vitest triage, ADR-041 | D | T20–T28 |

---

## Sprint Gate

| Kriter | Eşik |
|--------|------|
| `tsc --noEmit` | PASS |
| `npx vitest run` fail count | < 50 |
| `deckent doctor` | ≥ 92/100 |
| NO_GO count | ≤ 2 |
| Nervous events | ≥ 10 (detector canlı kanıt) |
| Cross-platform | 3/3 (macOS + Linux + WSL2) |
| Agent routing test-writer | = 0 |
| Cost | < $150 |
| ADR-041 | proposed kayıtlı |
| npm publish dry-run | PASS |

---

## 28 Task Deliverables

### Block A — Agent Taxonomy Reform (Wave 1–2)

| ID | Başlık | Agent | Effort | Durum |
|----|--------|-------|--------|-------|
| T1 | test-writer Agent Archive + Removal Justification | opus | low | — |
| T2 | testing-expert Skill Auto-Activation Heuristic | opus | normal | — |
| T3 | Intent Classifier "testing" Intent Refactor — test-coverage Tag | opus | normal | — |
| T4 | Router V2 Agent Fallback — test-writer Yok, architect/refactorer Chain | opus | normal | — |
| T5 | 16 Agent PROMPT.md Rubric Spec Batch Cleanup | sonnet | normal | — |

### Block B — Nervous Dogfood + 5 Detector Activation (Wave 3–4)

| ID | Başlık | Agent | Effort | Durum |
|----|--------|-------|--------|-------|
| T6 | Nervous System enabled=true Pivot — BALANCED Preset | sonnet | low | — |
| T7 | 🚨 Notification Delivery Scope Enforcement (Ana PID Constraint) | opus | high | — |
| T8 | StaleWorkerDetector Canlı Activation + DetectorRegistry | sonnet | normal | — |
| T9 | ScopeCollisionMonitor + DebtTrendAnalyzer Live Activation | sonnet | normal | — |
| T10 | AgentRoutingHealth Canlı Pozitif Doğrulama | opus | normal | — |
| T11 | DirectivesMidSprintProtection Canlı + Deliberate Stress Test | opus | normal | — |
| T12 | CLI `deckent nervous` TUI Integration Test + Smoke Script | sonnet | normal | — |
| T13 | MCP `deckent_nervous_*` 5 Tool End-to-End Live Test | opus | normal | — |

### Block C — Cross-Platform Validation (Wave 5)

| ID | Başlık | Agent | Effort | Durum |
|----|--------|-------|--------|-------|
| T14 | macOS E2E — tmux Backend Full Sprint (GitHub Actions) | opus | high | — |
| T15 | Linux E2E — subprocess Backend Full Sprint | opus | high | — |
| T16 | WSL2 E2E — Docker Backend Full Sprint | opus | high | — |
| T17 | Provider Matrix — Claude + Codex Mixed Mini-Sprint | opus | normal | — |
| T18 | i18n Parity — TR/EN Task Description Routing Identical | sonnet | normal | — |
| T19 | Fresh Install Matrix — Node 18/20/22 × Clean Env | opus | high | — |

### Block D — Polish + Debt Liquidation + Docs (Wave 6)

| ID | Başlık | Agent | Effort | Durum |
|----|--------|-------|--------|-------|
| T20 | Vitest Triage — 135 Fail → < 50 Fail | opus | high | — |
| T21 | Routing V3 Intent Classifier — core-dev Sub-Intents | opus | normal | — |
| T22 | Sprint 146 T-146-011 Docker Worker Exit Pattern Root Cause Fix | opus | normal | — |
| T23 | CHANGELOG 0.4.0-beta.4 + Sprint-148.md | sonnet | low | — |
| T24 | FINAL-EXECUTIVE-REPORT Sprint 148 Living Record | sonnet | low | — |
| T25 | ANA-PLAN-TR + MASTER-BLUEPRINT + BETA-TRACKER Sprint 148 Append | sonnet | low | — |
| T26 | Memory V2 Nervous History Integration | opus | normal | — |
| T27 | npm Publish Dry-Run Rehearsal | sonnet | normal | — |
| T28 | ADR-041 Draft — Agent Taxonomy (Horizontal vs Vertical) | sonnet | low | — |

---

## Bağımlılık Zinciri

```
Wave 1 (paralel, reform hazırlık): T1 + T2 + T3
Wave 2 (paralel, reform kesim):    T4 ← {T1,T2,T3} | T5
Wave 3 (paralel, nervous enable):  T6 + T7 + T8 + T9 ← T8
Wave 4 (paralel, detector + UI):   T10 + T11 + T12 + T13
Wave 5 (paralel, cross-platform):  T14 + T15 + T16 + T17 + T18 + T19
Wave 6 (paralel, polish + doc):    T20 + T21 + T22 + T23 + T24 + T25 + T26 + T27 + T28
```

---

## Kritik Mimari Constraint — Ana PID Notification Scope

**Alperen direktifi 2026-04-20 (T7 canlıya alıyor):**

Nervous system notification dispatcher **ana orchestrator process (Brain PID)** üzerinde yaşar. Worker process'lerden nervous init çağırmak **YASAK**. ADR-037 RBAC ihlali sayılır.

- Worker → Brain: event-stream JSONL (`src/orchestra/event-stream.ts`)
- Brain → User: NotifyDispatcher (Sprint 145) + 3 adapter (MCP/CLI/File)
- Runtime check: `DECKENT_WORKER_MODE === '1'` ise nervous.init() **throw**

---

## Yeni Dosyalar (Sprint 148)

| Dosya | Açıklama |
|-------|----------|
| `src/nervous/runtime-scope-check.ts` | Brain PID constraint — ADR-037 RBAC enforcement |
| `src/nervous/detector-registry.ts` | DetectorRegistry — 5 MVP detector boot + runAll |
| `.deckent/agents/archive/test-writer-removed-sprint-148/` | test-writer agent arşivi |
| `docs/audits/sprint-148/test-writer-removal-justification.md` | Removal kanıt raporu |
| `tests/core/skill-auto-activation.test.ts` | testing-expert auto-activation 5 test |
| `tests/core/intent-classifier-refactor.test.ts` | "testing" intent removal 10 test |
| `tests/orchestra/router-agent-fallback.test.ts` | Router V3 fallback chain 8 test |
| `.github/workflows/cross-platform-e2e.yml` | GitHub Actions matrix |
| `scripts/agent-prompt-validator.mjs` | rubricScores leak detector |
| `scripts/directives-stress-simulator.mjs` | DirectivesMidSprintProtection stress |
| `scripts/nervous-tui-smoke.sh` | CLI TUI smoke test |
| `scripts/mcp-nervous-e2e.mjs` | MCP e2e programmatic client |
| `scripts/fresh-env-test.sh` | Node 18/20/22 fresh install matrix |
| `scripts/npm-publish-dry.sh` | npm publish dry-run rehearsal |

---

## Teknik Detaylar

### Agent Taxonomy Reform

`test-writer` agent 3 sprint boyunca anormal routing davranışı sergiledi:
- Sprint 145: %52 task (14/27)
- Sprint 146: %53 task (9/17)
- Sprint 147: **%95 task (21/22)** — critical threshold aşıldı

Reform kararı: **test = yatay skill (testing-expert), agent değil**.

Yeni `AGENT_FALLBACK_CHAIN`:
```typescript
{
  'core-dev':      ['architect', 'refactorer'],
  'documentation': ['doc-writer'],
  'bug-fix':       ['bug-fixer', 'refactorer'],
  'security':      ['security-auditor'],
  'mcp-dev':       ['architect', 'api-builder'],
  'cli-dev':       ['architect', 'refactorer'],
  'ui-dev':        ['frontend-designer'],
}
```

### Nervous System Activation

Sprint 147'de yazılan 13 modül Sprint 148'de `enabled: true` ile canlıya alındı.

**Config (balanced preset):**
```json
{
  "nervous_system": {
    "enabled": true,
    "mode": "balanced",
    "throttleWindowMs": 300000,
    "quietHours": { "start": "22:00", "end": "08:00" }
  }
}
```

**5 MVP Detector:**
1. `StaleWorkerDetector` — HB > 2min, alert
2. `ScopeCollisionMonitor` — filesWrite overlap detection, plan-time
3. `DebtTrendAnalyzer` — Sprint 145-147 debt spike outlier (avg %40)
4. `AgentRoutingHealth` — test-writer anomaly → reform sonrası balanced
5. `DirectivesMidSprintProtection` — Sprint 145 live bug reproduction + auto-restore

### Routing V3

Intent classifier "testing" primary intent kaldırıldı. Yeni `Intent` union:
```typescript
type Intent = 'core-dev' | 'documentation' | 'bug-fix' | 'security' |
              'mcp-dev' | 'cli-dev' | 'ui-dev' | 'devops' | 'architecture';
```

`test-coverage` tag mekanizması:
- scope `tests/**` → `taskDNA.tags.includes('test-coverage')` → `testing-expert` skill auto-activate
- primary intent: task işlevine göre (core-dev, bug-fix, vb.)

---

## Metrikler

| Metrik | Değer |
|--------|-------|
| Toplam Task | 28 |
| Block Sayısı | 4 |
| Wave Sayısı | 6 |
| Hard Cap | 8h (28800000 ms) |
| Cost Cap | $150 (soft alert, subs mode) |
| Planning Mode | AI (ilk deneme — Sprint 148 risk) |
| Baseline (Sprint 147) | 23/23 DONE, 0 TD, 49m 34s |

---

## Sprint 149–150 Önizleme

### Sprint 149 — Doc Consolidation + npm Publish
- `deckent recall` / `deckent remember` UX polish
- ADR-041 accept (Sprint 148 kanıtı sonrası)
- npm publish v0.4.0-beta.5
- Final doc sync

### Sprint 150 🚀 — Beta GA Cutover
- npm publish v1.0.0-beta.1
- `git tag v1.0.0-beta.1`
- GitHub release notes
- `deckent nervous` user-facing v1.0 announcement
- **Perşembe 23 Nis TRT**
