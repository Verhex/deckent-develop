## Sprint 1-5 Özet
- sleepSync → async sleep geçişi tamamlandı (Sprint 2)
- haiku_allowed semantik düzeltme, checkUsage regex fix (Sprint 3)
- resolveDebt lifecycle doğrulandı (Sprint 4)
- `countBrainLines` → `src/core/utils.ts` (shared utility, brain.ts ve doctor.ts import eder)
- `runDecay` force option: `force=true` → bütçe altında bile decay çalışır, `DecayResult` döndürür
- Doctor `runDoctorChecks` export: start.ts pre-flight'ta kullanır, `ok` sadece `required` check'lere bakar
- Start `--dry-run`: `planSprint()` çağrılır, task listesi gösterilir, spawn yok
- Status `--watch`: `setInterval(2000)` ile ekran temizle + tekrar render, `--json` raw JSON çıktı
- Barrel `index.ts` dosyaları vitest coverage exclude'da — sadece re-export, coverage'ı düşürüyor

## Sprint 15 Learnings (2026-03-18)

- `ensureDeckentImport(filePath)` pattern: file missing → create, exists without ref → prepend, exists with ref → noop (idempotent)
- Config merge: `Object.assign(existing, newConfig)` preserves custom fields during re-init
- `.gitignore` selective tracking: `.deckent/plugins/*` ignored, `!.deckent/plugins/.gitkeep` exception
- Rule templates: `writeIfNotExists` prevents overwrite, YAML frontmatter + rich rules (13/9/9)
- MCP tool/resource addition: index.ts import+register, all test mocks must include new exports
- Structured planner model inference: `inferModelFromDirective()` analyzes title+description+scope for model selection

## Sprint 16-17 Learnings (2026-03-18)

- tmux pipe-pane log capture: `pipe-pane -t ... "cat >> logPath"` — simple, no extra dependencies
- MCP background jobs: `child_process.fork()` prevents MCP timeout, job state in `.deckent/jobs/{jobId}.json`
- cleanup() must cover ALL task file extensions (.json, .plan, .hb, .result, .paused, .log) — not just .hb/.log
- Sprint ID safety: `last_sprint_id` in config + file scan, always use max — prevents regression on file deletion
- Dashboard reset: fresh DashboardState on PLAN phase, sprint ID mismatch triggers reset in auditor
- React test infra: separate vitest config for dashboard (happy-dom env), exclude from main config
## Sprint 035 Learnings (Beta Cleanup Wave 1+2)
- readJsonSafe Migration: 13 inline JSON.parse → readJsonSafe(), readJsonSafeAsync() eklendi
- Error Handling Unification: 11 generic throw → DeckentError + ErrorRegistry (E039-E053)
- Silent Catch Logging: debugLog() helper, DECKENT_DEBUG env gate, 8 catch block güncellendi
- parseBody Type Safety: 5 Zod schema (Start/Plan/Directives/Config/Kill), parseBodyWithSchema()
- Utility Extraction: readFileIfExists, listFilesWithExtension, safeMapGet → utils.ts
- EventEmitter: dedicated _ipcEmitter + setMaxListeners(0), process EventEmitter kullanımı bitti
- tmux worker crash recovery: agent-based subprocess fallback çalışıyor

## Sprint 036 Learnings (Beta Cleanup Wave 3+4)
- brain.ts God Object Split: 1312→58 satır, sprint-controller.ts + result-evaluator.ts + usage-manager.ts
- Re-export pattern: brain.ts pure re-export layer, backward compat korundu
- Task 1-3 paralel extraction stratejisi: yeni dosya oluştur, brain.ts'ye dokunma, slim-down ayrı task
- spawn-backend.ts: core/ → orchestra/ taşındı (layer violation fix)
- types.ts Split: 524 satır → task-types, config-types, monitoring-types, sprint-types + barrel
- Non-null assertion: 48 `!` → guard clause, `.at()`, `?? fallback` (29 dosya)
- Type cast: enum literal kullanımı (`TaskStatus.DONE` vs `'DONE' as TaskStatus`), type guard'lar
- Barrel cleanup: orchestra/index.ts 30+ → 22 public API, @internal JSDoc
- Auditor queue: shift() O(n) → descending sort + pop() O(1)
- PromptAnalytics: prompt-metrics + prompt-ab-test → unified class, stub re-export
## Sprint 037 Learnings (Beta Cleanup Wave 5+6)
- Security: timingSafeEqual (SHA-256 hash), redactSensitive (API key/Bearer/URL password masking)
- Agent Pool: LRU eviction (max 50 temp, 5 sprint age), batch read (N+1 → single readdirSync)
- Skill Sandbox AST: TypeScript compiler API second-pass (eval, Function, child_process detection)
- DIRECTIVES Zod Schema: DirectiveSchema + DirectiveTaskSchema validation before task creation
- Plugin System: full install (npm/git/local + rollback), runtime hooks (beforeSprint/afterTask/afterSprint)
- Memory Budget: 300→600, decay 3→5 sprints, RETRO 60→100, sprint log 50→80
- PROJECT-IDENTITY.md: permanent project memory, never decayed, updated every sprint
- finalizeSprint(): post-sprint actions regardless of execution mode + `deckent finalize` CLI
- Config mode aliases: performance/balanced/economic/unlimited → canonical mode names

## Sprint 038 Learnings (Multi-Provider Infrastructure)
- ModelType Extended: ClaudeModel | OpenAIModel | GeminiModel (8 models, 3 providers)
- ProviderName = 'claude' | 'codex' | 'gemini', PROVIDER_MODEL_MAP for validation
- Model Equivalence: tier-based (premium/standard/economy), economy gemini → standard fallback
- Provider Capabilities: ProviderCapability interface (streaming, vision, cost, context tokens)
- Codex/Gemini Adapters: ProviderAdapter interface, spawn/kill/checkUsage/buildCommand
- Multi-Provider Config: brain_provider, worker_provider, fallback_provider, env var overrides
- Provider-Aware Model Selector: resolveTaskModel + provider param, tier→equivalent mapping
- spawnWorkers Routing: task.provider field, mixed sprint (Claude tmux + Codex/Gemini subprocess)
- Provider Fallback Chain: resolveProviderWithFallback, single retry, no infinite loops
- Decoupling: planner/tmux/subprocess all accept ProviderAdapter, backward compat via default
- CLI Entrypoint: buildProgram() + entry.ts, no side-effects on import
- bootstrapProviders(): single startup point, detect + register + set default
- Platform: describe.skipIf(isWindows) for tmux/scripts tests, cross-platform helpers

## Sprint 048-060 Summary
- Sprint 048: GO_WITH_TECH_DEBT (7 tasks)
- Sprint 050: GO_WITH_TECH_DEBT (5 tasks)
- Sprint 051: GO_WITH_TECH_DEBT (7 tasks)
- Sprint 052: GO_WITH_TECH_DEBT (1 task)
- Sprint 054: GO_WITH_TECH_DEBT (4 tasks)
- Sprint 055: GO_WITH_TECH_DEBT (10 tasks)
- Sprint 056: GO_WITH_TECH_DEBT (8 tasks, 2 NO_GO)
- Sprint 057: GO_WITH_TECH_DEBT (4 tasks, 2 NO_GO)
- Sprint 058: GO_WITH_TECH_DEBT (0 tasks)
- Sprint 059: GO_WITH_TECH_DEBT (9 tasks, 1 NO_GO)
- Sprint 060: GO_WITH_TECH_DEBT (5 tasks)
## Sprint sprint-061 Learnings
- Agent List Display Fix + History Agent Column (P1): GO_WITH_TECH_DEBT — A) agent.ts: AgentConfig interface updated (uses/successRate optional + stats sub-object added). getAgentUses() and getA
- Brain Budget Decay + Memory Temizliği (P0): GO_WITH_TECH_DEBT — A) MEMORY.md: Sprint 048-060 learnings compressed from 76 lines to 13 lines (single-line format per sprint). B) DEBT.md:
- Open Debt Cleanup (debt-059-008-fix) (P1): GO_WITH_TECH_DEBT — Task 061-006 (Open Debt Cleanup — debt-059-008-fix) tamamlandı.

A) Enriched Response Verification: Tüm 16 MCP tool'da e
- Framework Detection + Analyzer Fix (P2): GO_WITH_TECH_DEBT — A) React Detection: Added dashboard sub-project check in stack-detector.ts detectFresh(). Checks src/dashboard/package.j
- Remaining CLI Polish: GO_WITH_TECH_DEBT — A) formatDurationShort added to sprint-reporter.ts — returns '31m 8s' short format. formatDuration unchanged (backward c
## Sprint sprint-062 Learnings
- ci-testing Skill Tanımı + SKILL.md: GO_WITH_TECH_DEBT — A) manifest.json created with all required fields: id=ci-testing, category=workflow, 8 triggers (ci/test/regression/cove
- CI Dashboard Entegrasyonu: GO_WITH_TECH_DEBT — CI Dashboard entegrasyonu tamamlandı. output.ts: CIBaseline + CIReport interfaces, formatCIStatusLine(), formatCIHealthS
- GitHub Actions Workflow İyileştirme: GO_WITH_TECH_DEBT — GitHub Actions CI workflow updated with 4 improvements: A) Coverage job added — runs npm run test:coverage after test jo
## Sprint sprint-064 Learnings
- init Kalan — Build/Test Dinamik + Çift Çağrı + --env Çakışma: NO_GO — All three init improvements (A/B/C) were already fully implemented in Sprint 063 (GO_WITH_TECH_DEBT).

A) DECKENT.md Bui
- plan Kalan — Timeout, Parser, Safeguard, Logging, Default, Truncation: NO_GO — 6 plan improvement implemented:

A) AI Planner Timeout Configurable: Added ai_planner_timeout to DeckentConfig and Resol
- start Kalan — Sandbox, Zero-Config, Fix Timeout, Queue, Usage, Watch, Phase: NO_GO — All 7 start improvements were already implemented and verified:

A) --sandbox-mode: applySandbox() (git stash --include-
- status Kalan — Regex, Stale, Budget, Alert: NO_GO — All 4 status improvements (A, B, C, D) were already implemented in sprint-063 in status.ts and output.ts. This task adde
- doctor Kalan — Memory Dedup, Debt Cache, ErrorRegistry, Permission, Subscription: NO_GO — All 5 doctor improvements were already implemented in sprint-063 (GO_WITH_TECH_DEBT). Verification: A) formatHumanDoctor
- retro Kalan — Parse Fix, Learnings Kalite, Arşivleme: NO_GO — All 3 retro improvements verified complete from sprint-063 work. A) parseRetroToRichSummary: tolerant sprint ID extracti
- cleanup Kalan — Çift Geçiş, Sahte Sprint, destroy, Decay, Parse, .gitignore: NO_GO — All 6 cleanup improvements implemented and verified:

A) Single readdirSync pass in dry-run: allTaskFiles scanned once, 
- usage + history Kalan — Canlı Usage, Subscription, Trend, Format, İçerik: NO_GO — All 5 improvements (A-E) were already fully implemented in the codebase from prior sprint work:

A) Live Usage (5hr/week
- config Kalan — autoMigrate, Modes, Validation: NO_GO
- spawn/kill + attach/watch Kalan — Scope, Subprocess, Multi-Provider, Watch: NO_GO — All 7 improvements (A-G) were already implemented in prior sprint. This task: (1) Fixed kill --all to use killSingle() i
## Sprint sprint-065 Learnings
- plan — AI Planner Timeout Configurable: GO_WITH_TECH_DEBT — A) Added ai_planner_timeout?: number to DeckentConfig and ResolvedConfig in config-types.ts. The planner.ts already supp
- config — autoMigrateOnLoad + Modes Nesting: GO_WITH_TECH_DEBT — A) autoMigrateOnLoad: Added import for needsMigration/migrateConfig in config.ts. loadConfig() now calls needsMigration(
- cleanup — Çift Geçiş, Sahte Sprint, destroy Session, .gitignore: GO_WITH_TECH_DEBT — All 4 sub-tasks implemented:

A) Çift Geçiş Fix: dry-run path'de 2 ayrı readdirSync() → tek allTaskFiles dizisi, filter 
- spawn — Scope Enforcement + Multi-Provider: GO_WITH_TECH_DEBT — A) buildAllowedToolsFromScope: Added exported function that returns 'Read,Write,Edit,Bash,Glob,Grep' when task has scope
- analyze — Wrapper Birleştirme + Monorepo: GO_WITH_TECH_DEBT — A) Two Engine Merge: analyzer.ts was already a wrapper around detectProjectStack(). Cleaned up the hardcoded src/dashboa
- Dokümantasyon — CHANGELOG/SPRINT-LOG Restore + cli-deep-analysis Final: GO_WITH_TECH_DEBT — A) CHANGELOG.md: Sprint 055 (10/10, 0 NO_GO) ve Sprint 056 (7/20, 13 NO_GO) entry'leri git log'dan alınan verilerle ekle
## Sprint sprint-066 Learnings
- Manifest v2 Batch Update — 20 Dosya: GO_WITH_TECH_DEBT — Tüm 9 agent.json ve 11 skill manifest.json dosyasına manifestVersion:2 ve activation kuralları eklendi. Kanıt: for loop 
- MCP Dokumantasyon Tutarlilik — 16 Tool + 9 Resource: GO_WITH_TECH_DEBT — Updated all 12 documentation files: '10 tools' → '16 tools', '5 resources' → '9 resources'. README.md MCP Tools table ex
- Housekeeping — gitignore + IDENTITY Sayilari: GO_WITH_TECH_DEBT — A) .gitignore: Added .deckent/usage/ line under .deckent section. Removed 33 tracked files from git index with git rm --
## Sprint sprint-067 Learnings
- Fix debt: Tech debt from 064-004-fix: Added 11 targeted tests to tests/cli/helpers/output.: GO_WITH_TECH_DEBT — Fixed debt-064-004-fix: (1) Replaced all `as never` casts in output.test.ts with AlertLevel enum (6 occurrences). (2) Re
- npm Paket Boyutu Optimizasyonu — 768KB → <500KB: NO_GO
- Retro Detay Zenginlestirme — Worker Notes Aktarimi: GO_WITH_TECH_DEBT — A) buildRetroLearnings() now includes result.notes (first 150 chars) for NO_GO/GO_WITH_TECH_DEBT tasks; falls back to ge
- any Kullanimi Temizligi — 10 Adet, 7 Dosya: GO_WITH_TECH_DEBT — 5 dosyada 6 'as any' kullanımı temizlendi. spawn.ts ve task-builder.ts'deki eşleşmeler yorum satırı olduğu için dokunulm
- V2 Routing Dogrulama — Audit + IDENTITY Guncelleme: GO_WITH_TECH_DEBT — A) Audit raporu güncellendi: tüm P1/P2/P3 maddelerine [DONE sprint-066] veya [DONE sprint-067] etiketi eklendi. grep -c 
## Sprint sprint-068 Learnings
- MCP Server Instructions — AI System Prompt Injection: GO_WITH_TECH_DEBT — Added DECKENT_MCP_INSTRUCTIONS constant exported from server.ts and passed it as options.instructions to McpServer const
- Tool Descriptions + Annotations Zenginlestirme: GO_WITH_TECH_DEBT — All 16 MCP tools enriched with: (1) detailed descriptions (80+ chars, explains what/when/prerequisite), (2) annotations 
- deckent_help Tool — Runtime Capabilities + State: GO_WITH_TECH_DEBT — Implemented deckent_help MCP tool. Detects project state (initialized, hasDirectives, sprintActive, lastSprint, routingE