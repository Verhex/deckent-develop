# Changelog

See [docs/CHANGELOG.md](docs/CHANGELOG.md) for the full changelog.

## Latest: v0.4.0-beta.4 (2026-04-21)

### Sprint 148 — Agent Taxonomy Reform + Nervous Dogfood Activation + Cross-Platform Validation

#### Breaking Changes
- **Agent Taxonomy Reform:** `test-writer` agent removed. Test expertise migrated to `testing-expert` skill with auto-activation (scope `tests/**` or filesWrite `*.test.ts`). Intent classifier "testing" primary intent removed, replaced by "test-coverage" tag.

#### Added
- Nervous System Activation (balanced preset default for this project, `enabled: false` in new projects)
- 5 MVP Detectors live: StaleWorker, ScopeCollision, DebtTrend, AgentRouting, DirectivesMidSprintProtection
- Ana PID Notification Scope enforcement (ADR-037 RBAC)
- Cross-Platform CI Matrix (macOS/Linux/WSL2 × tmux/subprocess/Docker)
- GitHub Actions workflow: `cross-platform-e2e.yml`
- Fresh Install Matrix (Node 18/20/22)
- Provider Matrix (Claude + Codex)
- i18n Parity (TR/EN routing identical)

#### Fixed
- Docker worker exit pattern (Sprint 146 T-146-011 root cause)
- Vitest regression 135 → < 50 fail
- Routing V3 (agent fallback chain, test-writer excluded)
- 15 agent PROMPT.md rubric spec cleanup (Sprint 146 T-10 eksik wire completion)

#### Changed
- Routing V2 → V3 (granular core-dev sub-intents)
- Intent union: removed `'testing'`, added `'devops'`, `'architecture'`

---

## [0.4.0-beta.2] — 2026-04-20

### Sprint 146 — Prompt God Template Reform + Critical Bug Fix + Rubric Consolidation
- Unified prompt builder `buildTaskPrompt()` — tek entry, char count %40 azalma (~45K → ≤27K)
- ADR Relevance Scoring Engine — topN=3, scope/keyword/age skorlama
- Scope Sanitizer — dist/ filter, path traversal reject, dedupe
- Agent Routing V2 Retrain — intent keyword refresh, test-writer routing %52 → ≤%22
- **Bug fix:** DIRECTIVES.md mid-sprint silme — phase guard (yalnızca CLEANUP fazı)
- **Bug fix:** SDL Decision Log dead write — v2 + meaningful events + dolu input/output
- **Bug fix:** Agent exclusion hard-code kaldırıldı — dinamik context-aware exclusion
- Rubric consolidation: worker self-report kaldırıldı, Quality Assessor kanonik
- Sprint 147 nervous system preflight: `nervous-types.ts` + ADR-040 draft
- `scripts/prompt-linter.mjs` + `scripts/chain-gate-check.mjs` kalite gate'leri

Full changelog: [docs/CHANGELOG.md](docs/CHANGELOG.md)

---

## v0.3.0-beta.1-sprint84 (2026-04-02)

### Sprint 084 — Dashboard Fix + i18n Tam Kapsam + Canlı Veri Test + Build Otomasyon
- AgentDetail penceresi genişletildi (400→600px), font boyutları artırıldı, log 220→350px
- ConfigPage i18n tam kapsam: 79 yeni çeviri key'i, fieldT() helper ile runtime çeviri
- 41 yeni dashboard canlı veri testi (SSE hook, WorkerCard, ActivityFeed, SprintPhaseTimeline)
- build:dashboard, build:all, postbuild npm script'leri eklendi
- %100 GO — 4/4 task tamamlandı, 0 tech debt, 0 NO_GO

### Sprint 076 — Stale Heartbeat Fix + Dashboard API Tests + Graceful Shutdown
- Stale heartbeat root cause giderildi: `finalizeHeartbeat()` + auditor DONE skip (410x pattern)
- 10 dashboard API entegrasyon testi eklendi (6 endpoint, 6 describe block)
- Graceful shutdown: SIGINT → `interruptActiveSprint()` + `killAllSessions()`
- God object split faz 3: `result-collector.ts` sprint-controller'dan extract edildi

### Sprint 073 — Test Regression Fix
- 100 test regresyonu düzeltildi (43 fs mock, 16 brain mock, 9 doctor, 23 stack/CI, 3 integration)
- 0 fail, 12,161 test passed

### Sprint 072 — Tier Generalizasyonu + God Object Split
- Plan tier generalizasyonu: `max_plan`→`performance`, `max5x_plan`→`balanced`, `pro_plan`→`economic`
- Init wizard provider-agnostic hale getirildi (Claude-specific kaldırıldı)
- Model API ID'leri güncellendi: `claude-opus-4-6`, `claude-sonnet-4-6`
- `sprint-controller.ts` god object split → `sprint-phases.ts` extract (7 faz fonksiyonu)

### Sprint 071 — Windows Dogfooding
- 22 Windows dogfooding bug fix (BUG-3..BUG-26)
- Init UX overhaul: stack-aware templates, docs, TempSkill/Agent
- Subprocess heartbeat periodic update, fallback .result, log capture
- `deckent upgrade --local` for closed beta workflow
