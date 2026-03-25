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

## Sprint sprint-048 Learnings
- Claude MCP Backend Stub Completion: GO_WITH_TECH_DEBT
- Sandbox Mode Graceful Handling: GO_WITH_TECH_DEBT
- API Mode Usage Integration: GO_WITH_TECH_DEBT
- Subprocess Worker Log Enhancement: GO_WITH_TECH_DEBT
- Coverage Metric Preservation: GO_WITH_TECH_DEBT
- Blueprint Section Numbers Update: GO_WITH_TECH_DEBT
- RELEASE-NOTES-BETA.md Final Update: GO_WITH_TECH_DEBT
## Sprint sprint-050 Learnings
- npm Publish Dry Run & Fix: GO_WITH_TECH_DEBT
- README.md Overhaul: GO_WITH_TECH_DEBT
- bin Entry Validation: GO_WITH_TECH_DEBT
- CHANGELOG.md Update: GO_WITH_TECH_DEBT
- npm Publish Pipeline Validation: GO_WITH_TECH_DEBT
## Sprint sprint-051 Learnings
- Full Config Expansion: GO_WITH_TECH_DEBT
- Config Documentation (Inline Comments): GO_WITH_TECH_DEBT
- Dashboard Config Editor: GO_WITH_TECH_DEBT
- VitePress Setup: GO_WITH_TECH_DEBT
- CLI Reference (Auto-Generated): GO_WITH_TECH_DEBT
- Config Migration Helper: GO_WITH_TECH_DEBT
- Deploy Configuration: GO_WITH_TECH_DEBT
## Sprint sprint-052 Learnings
- Dashboard Full Expansion: GO_WITH_TECH_DEBT
## Sprint sprint-054 Learnings
- Agent Activation — systemPrompt + Worker Injection: GO_WITH_TECH_DEBT
- Brain Self-Learning — Config Suggestions + Pattern Detection: GO_WITH_TECH_DEBT
- Rich Sprint Output + README Update: GO_WITH_TECH_DEBT
- docs/ Reorganization + .claude/rules/ Update: GO_WITH_TECH_DEBT
## Sprint sprint-055 Learnings
- Retro Parse/Write Format Uyumsuzluğu Fix + --compare Bug (P0 KRİTİK): GO_WITH_TECH_DEBT
- Kill Komutu Task Status + Lock Temizliği + --all Flag (P0 KRİTİK): GO_WITH_TECH_DEBT
- readLanguage + readJsonSafe Tam DRY Temizliği (P1): GO_WITH_TECH_DEBT
- Config Set Nested Key + Import DeepMerge + Config Get (P1): GO_WITH_TECH_DEBT
- Spawn Komutu Prompt Zenginleştirme + Status Kontrolü (P1): GO_WITH_TECH_DEBT
- Doctor --json + Retro --json Flag'leri (P2): GO_WITH_TECH_DEBT
- Cleanup --dry-run Flag'i (P2): GO_WITH_TECH_DEBT
- Agent Delete + Edit Komutları (P2): GO_WITH_TECH_DEBT
- Skill Enable/Disable + Delete Komutları (P2): GO_WITH_TECH_DEBT
- Explain --sprint Flag + Goal Bilgisi + Dil Desteği (P2): GO_WITH_TECH_DEBT