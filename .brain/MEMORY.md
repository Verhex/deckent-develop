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
## Sprint sprint-025 Learnings
- package.json files Field Düzeltme: GO_WITH_TECH_DEBT
- CODEOWNERS Dosyası: GO_WITH_TECH_DEBT
- dependabot.yml: GO_WITH_TECH_DEBT
- GitHub Actions Release Workflow: GO_WITH_TECH_DEBT
- Security Issue Template: GO_WITH_TECH_DEBT
- FUNDING.yml: GO_WITH_TECH_DEBT
- brain.ts readJsonSafe Import Migration: GO_WITH_TECH_DEBT
- debt-manager.ts readJsonSafe Import Migration: GO_WITH_TECH_DEBT
- auditor.ts readJsonSafe Import Migration: GO_WITH_TECH_DEBT
- debt-manager.test.ts — Dedicated Test Suite: GO_WITH_TECH_DEBT
## Sprint sprint-026 Learnings
- readJsonSafe Import Migration Tamamlama: GO_WITH_TECH_DEBT
- package.json files + keywords Tamamlama: GO_WITH_TECH_DEBT
- task-builder.test.ts Test Tamamlama: GO_WITH_TECH_DEBT
- core/config.ts Edge Case Test Tamamlama: GO_WITH_TECH_DEBT
- auditor.ts Edge Case Test Tamamlama: GO_WITH_TECH_DEBT
- tmux.ts + api/server.ts Edge Case Test Tamamlama: GO_WITH_TECH_DEBT
- Brain Pattern Learning Tamamlama: GO_WITH_TECH_DEBT
- Global Config + Config Export/Import Tamamlama: GO_WITH_TECH_DEBT
- FAQ Dokümanı (NO_GO Fix): GO_WITH_TECH_DEBT
- Integration Test — init→plan→status E2E (NO_GO Fix): GO_WITH_TECH_DEBT