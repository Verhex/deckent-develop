# Changelog

See [docs/CHANGELOG.md](docs/CHANGELOG.md) for the full changelog.

## Unreleased — Hot Fix Day (Sprint 152.5, 2026-04-24)

### Fixed (4 Beta GA launch blockers)
- **Docker worker GLIBC mismatch (HF1)** — `Dockerfile.worker` base image `node:22-slim` → `node:24-trixie-slim` (Debian 13, glibc 2.41). better-sqlite3 NODE_MODULE_VERSION 137 native binding now loads in container. Memory V2 DB accessible to workers; `deckent://memory`, `deckent://debt`, `deckent://retro` MCP resources populated.
- **Brain verification task detection (HF2)** — `isVerificationTask` in `result-evaluator.ts` relaxed from "no files changed" to "no source-code changes". Audit/verification tasks writing report files in `docs/` are now correctly classified as DONE instead of falling through to rubric coverage penalty → NO_GO.
- **Rules regression fix (HF3)** — `rule-generator.ts::regenerateRules` no longer silently catches DB load failures. Silent catch previously caused `.claude/rules/{brain,auditor,worker-default}.md` to be regenerated with empty ADR set (stripped from ~120 lines to ~15). Loud failure preserves existing rules files.
- **MCP dry-run provider init (HF4)** — `src/mcp/tools/start.ts` now calls `bootstrapProviders(config)` before `planSprint()`. Fixes "No providers registered" error when invoking `deckent_start --dry-run` via MCP. Restores CLI/MCP parity (ADR-022-v2).

### Added
- `docs/KNOWN_ISSUES.md` — backlog of tracked bugs, drifts, and deferred work (non-blocker items for Beta GA).

### Known (non-blocker)
See `docs/KNOWN_ISSUES.md` for the full list. Highlights: MCP tool count doc drift (22/23/27/31 → live 31), 11 nervous detectors implemented but not wired (planned Sprint 159), 20 seed skills use placeholder Ed25519 signatures (planned Sprint 153), Codex/Gemini CLI not installed (planned Sprint 164), `VerhexIO/deckent-dev` → `VerhexIO/deckent` repo flip pending Alperen manual.

---

## Latest: v1.0.0-beta.1 (2026-04-22) — Beta GA Launch

### Sprint 150 + 150A Hot Fix — Beta GA Cutover

#### Added
- `deckent_style` Config Key — 3-Layer Integration (`task` / `sprint` / `hybrid`)
- `deckent mode` CLI Command — runtime mode switching
- Sprint Controller Mode-Aware Routing
- Nervous System Mode-Aware Detectors
- DECKENT→USER:NOTIFY dispatcher + 5 lifecycle hooks (H6 canlı)
- Discord + Telegram Connectors (`src/connectors/`)
- `publishConfig.access: "public"` — npm publish ready

#### Fixed
- Docker Worker Exit Pattern Final Fix (Sprint 146+148 3-sprint debt)
- Auditor Stale Alert Race Condition Fix (Sprint 148 debt)
- Sprint-Prefixed Dosya Retention — FINAL (Alperen onaylı 2026-04-21)
- Managed-Docs Cache Git Tracking Fix + Metadata Annotation

#### Changed
- Dockerfile USER non-root (security hardening)
- `.deck` Config Interpolation (`$DECK:KEY` syntax)
- npm pack tarball 1.2 MB (< 2 MB, 0 gizli dosya)

---

## [0.4.0-beta.4] — 2026-04-21 (Sprint 148)

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
