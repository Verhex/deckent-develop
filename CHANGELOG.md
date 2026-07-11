# Changelog

> **Canonical release notes.** This file is the single source of truth for per-version release
> notes — one exact-anchored `## [X.Y.Z]` section per shipped version, hand-curated (or scaffolded
> by `scripts/release-prepare.mjs` and filled in before tagging). `.github/workflows/release.yml`'s
> changelog extractor reads sections from *this* file only, matched by an exact-anchored heading
> (singular, non-empty — see `docs/release/release-checklist.md` step 6). For the
> **automatically-generated, verbose per-sprint log** (every sprint's task-level
> Added/Changed/Fixed, appended by the sprint-finalizer), see
> [docs/CHANGELOG.md](docs/CHANGELOG.md) — that file is a machine-written archive, not release
> notes.

## [1.0.0-beta.1] — 2026-04-22 (current)

v1.0.0-beta.1 is the current release. All sprint work since Beta GA (Sprint 150) is part of the ongoing beta.1 cycle. Major capabilities added since the initial launch:

### Major Capabilities Added Since Beta GA (Sprints 151–285+)

- **Memory V2 DB-First Architecture** — SQLite single source of truth (5 tables + FTS5 full-text search, dual-layer Turkish/English i18n normalize, 96% context reduction). `deckent recall`, `deckent remember`, `deckent memory rebuild|export|stats` CLI. `deckent_memory_query` MCP tool.
- **Native REPL + Agentic Tool-Use** — Argümansız `deckent` launches Ink-based interactive REPL with agentic `<deckent_tool>` protocol, per-turn queue + approval (suggest/auto-edit/full-auto), slash commands. Native-agent mode is opt-in via `DECKENT_NATIVE_AGENT`/`--native` flag (experimental).
- **Autonomous Engine** — Machine-initiated backlog (`kind: task|sprint|capability`), trigger types (`recurring-cron`, `one-off`, `reactive`), 3-gate governance (RBAC → policy → risk). `deckent autonomous status|stop|backlog add` CLI. `deckent_autonomous` MCP tool.
- **ADR Governance Integration** — 89 Architecture Decision Records (MADR v3 hybrid format), mandatory enforcement via ADR-036. `npm run lint:adr` gate. Brain/Worker/Auditor prompts auto-injected with relevant ADRs from `memory.db`.
- **RBAC Authority Matrix** — ADR-037: Brain/Auditor/Worker role-based access; advisory/soft enforcement V1.0 (compile-time lint + audit trail); 5 safety-floor locked actions.
- **Agent/Skill Evolution Pipeline** — temp→permanent promote/demote pipeline, outcome-tracker, adaptive thresholds, synergy matrix, rule-evolver, performance stats per sprint.
- **Nervous System** — ADR-040 proactive meta-orchestrator: observer → detector-registry → decision-engine → proposer → dispatcher → executor. 12 detectors. Subscribe/accept/reject API via `deckent_nervous_*` MCP tools.
- **ModelRegistry** — 13 models / 3 providers / 4 tiers (premium_plus / premium / standard / economy). Provider-agnostic `brain_tier`/`worker_tier` config. `deckent_models` MCP tool (live data).
- **Docker Backend (default)** — Container isolation, configurable timeout, atomic heartbeat write (SIGTERM + fsync grace period), 10 e2e tests. `spawn_backend: docker` is now the default.
- **Wave-Based Dependency Pipeline** — Kahn's topological algorithm, `dependency_pipeline_enabled: true` default (ADR-045/064). Sprint-280's original MRR-deadlock fix (`DONE ∪ MANUAL_REVIEW_REQUIRED` satisfies the dependency gate) was **superseded born-610** (2026-07-10, `src/orchestra/scheduler-truth.ts`): `MANUAL_REVIEW_REQUIRED` is now single-truth **terminal-non-satisfying** — unverified partial work never satisfies a dependent, and is cascade-skipped exactly like `NO_GO`, so the sprint still completes and a human reviews the MRR work afterwards.
- **Enterprise Foundation** — RBAC, multi-tenant isolation, audit-query, scheduled flows, OIDC exchange (`POST /api/auth/oidc/exchange`), embedded web terminal (PTY/WS, ADR-062, ADR-068/069/071).
- **OpenAI-Compatible HTTP Adapter** — Ollama + HTTP provider support (ADR-077). 4 providers: claude / codex / gemini / ollama.
- **Training Data Pipeline** — Live per-turn trace recorder (JSONL), CC-transcript extractor (aligned + general OpenAI-messages corpora, SP-2).
- **Self-Modifying Task Detection** — ADR-038: deckent dogfood vs user-project discrimination, `self-modifying-detector.ts` (+789 LoC).
- **Provider-Agnostic Token + Cost Capture** (Sprint 325–328, 2026-06-26) — per-task token usage captured from each provider's NATIVE source (CLI structured-output / session-store, HTTP-response, unified gateway) and normalized to one rich schema (input / output / cache-read / cache-write / reasoning tokens, AI-SDK parity); cost computed per-model (local → $0). Closes the long-standing gap where the worker's final-text was captured instead of the provider's usage envelope (every non-Claude provider — and Claude itself — reported 0/0). Landed across the full matrix (claude / codex / gemini / ollama / openai-compatible / OpenRouter; design-doc `docs/superpowers/specs/2026-06-26-provider-agnostic-usage-cost-design.md`, grounded in tokscale / LiteLLM / Vercel AI SDK / OpenRouter). _Source-landed; per-provider live-proof is build-gated._
- **Self-Tree Mutation Guard (root fix)** — `worker-rollback.ts` snapshot/rollback now honor the ADR-039 self-project guard (previously only `rollback.ts` did), and the empty-scope `git checkout HEAD -- . && git clean -fd` whole-tree-wipe footgun is removed — deckent dogfood sprints no longer destroy their own uncommitted work mid-sprint.

---

### Sprint 156 (2026-05-12, commit `4d15196`) — Pipeline Hardening

### Added

- **`src/core/spawn-safety.ts` (NEW)** — `assertSpawnSafe(bin, args[])` runtime whitelist (ADAPTER_BIN_WHITELIST + SH_C_ALLOWED regex hardening, ADR-038 security note). 157 LoC + 26 unit tests.
- **`src/core/file-lock.ts`** — `acquireSpawnLock/Locks` + `releaseAllSpawnLocks` + batch rollback. Spawn-time file mutex primitive (`.locks/<hash>.lock`). 19 regression test (includes lock-leak fix verification).
- **`EffectClass` annotation** in `rubric-registry.ts` — 5-class taxonomy (`pure`/`reversible`/`idempotent`/`compensable`/`critical-irreversible`) + `getEffectClass(task)` + `DEFAULT_EFFECT_MAP` per TaskType (Reversibility Layer foundation).
- **Worker prompt previous-result enrichment** — `buildDependenciesBlock()` artık dependency task `.result.notes` + `filesChanged` embed eder (TOPP context enrichment).
- **`IDEMPOTENCY_KEY` env injection** — `spawn-backend-docker.ts` 16-hex promptId'yi container env'e inject eder; prompt template'a "## Idempotency Key" section eklendi.
- **`CleanupPhaseKind` type** — `'sprint-end' | 'spawn-fail'` gating; tmpfiles spawn-fail'de in-place preserve.
- **3 ADR drafts** (proposed): ADR-053 TaskType Taxonomy, ADR-055 Hybrid Scoring 5-Layer Pipeline, ADR-060 Self-Awareness Propagation Channels.
- **Per-change security review** — historical Sprint 156 review removed during docs cleanup; security decisions are retained in ADR/security docs and git history.
- **11 yeni test dosyası**.

### Changed

- **`dependency_pipeline_enabled: true` default** — wave-based spawning + cascade/unblock artık aktif (Sprint 161 audit'inde tespit edilen DIRECTIVES race condition source).
- **`applyCascadeToSprint` + `applyUnblockToSprint` runtime wire** — NO_GO/DONE sonrası dependents PAUSED/PENDING. Önceden dangling export'lardı.
- **Cleanup discipline `.worker-*.sh` + `.prompt-*`** — sprint cleanup'a kadar preserve, `archivePromptFiles` `.worker-*.sh`'a da uzar.
- **Fresh-Eyes fix worker rotation** — opus→sonnet, architect→code-reviewer+bug-fixer.

### Fixed

- **Auditor baseline collection reliability** — vitest subprocess retry-once + `vitest_invocation_status` enum field.
- **Lock leak post-acquire failure** — `acquireSpawnTimeLocks()` sonrası `docker run` non-zero / image-not-found / writeFileSync exception path'lerinde release missing fix.

### Discovered (Sprint 157 P0 backlog — canlı dogfood kanıtla)

Sprint 156 dogfood **3 major bug canlı kanıtladı**:

1. **Bug X — Dual-Evaluator Stale-State Race**: 2sn'de iki rakip evaluate pass (Pass 1: 22 done 0 NO_GO → Pass 2: 10 done 12 NO_GO). 6 fix-fix.json definition yazıldı.
2. **Bug Sprint-Stall**: 6 fix-fix.json definition var, spawn=0. Brain runner sleeping. `runFixPhase` recursion yok.
3. **Brain State Update Missing**: Fix workers `.result` DONE yazdı, task.json EXECUTING freeze. `--force` finalize gerekti (Sprint 153 P0 memory bug'ı kanıt).

Plus heartbeat write race, sprint-state.json freeze, retro naming off-by-one — hepsi Sprint 157 candidate.

### Sprint Sayıları

- **22 task evaluation**: 7 DONE + 15 TECH_DEBT + 0 NO_GO
- 11 src/ modify + 1 NEW + 11 yeni test + 3 ADR + per-change security review
- Force finalize ile cleanup, kayıp 0

---

## Sprint 155 — Bug B Fix Smoke Validation (2026-05-12, commit `81b1cb5`)

- **10/10 doc-write task DONE**, 0 NO_GO, 0 fix spawn — Sprint 154'ün TaskType registry + coverage:null tolerance fix'inin CANLI dogfood validation'ı.
- Sprint 153 smoke (Bug B varken) 9/10 false NO_GO almıştı; Sprint 155 aynı senaryo 10/10 DONE → fix kanıtlı kalıcı.
- 6m 23s.

---

## Sprint 154 — TaskType Registry + Bug B Fix (2026-05-12, commit `81b1cb5`)

### Added

- **`src/orchestra/rubric-registry.ts` (NEW, 196 LoC)** — TaskType taxonomy (`audit` | `document-write` | `code-development`), 3 rubric constants, scope-shape detection (`isAuditTask`, `isDocumentWriteTask`, `detectTaskType`), registry API (`getRubric`, `coverageOptional`).
- **6 yeni scorer functions** in `result-evaluator.ts`: scoreWordCount, scoreAuditCompleteness, scoreFindingCount, scoreCitationDensity, scoreMigrationTriage, scoreDocumentationQuality.
- 2 yeni test dosyası (26 + 8 senaryo).

### Fixed

- **Bug B (coverage:null patolojisi)** — `validateResultSchema(result, task?)` task parametresi alır; `coverageOptional(task)` true ise `coverage:null` tolere edilir. `evaluateWithRubric` registry kullanır. Sprint 153 smoke'da 9/10 false NO_GO veren bug'ın kök çözümü.
- **Sprint 154 Wave A (cherry-picked `9b91405`)**: claude.json `:ro` → `:rw` mount (pipeline LIVE), dist chmod +x, FIX timeout 30dk, adr-validator path.

---

## Sprint 152.5 — Hot Fix Day (2026-04-24)

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

## Beta GA Launch (Sprint 150 + 150A, 2026-04-22) — Initial v1.0.0-beta.1 Release

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
