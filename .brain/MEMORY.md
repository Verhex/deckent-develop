# Learned Patterns

## Wave 1 Learnings (Sprint 1, 2026-03-16)

- `@types/node` is required as devDependency for Node.js type declarations (`node:fs`, `node:path`, `structuredClone`)
- `tsconfig.json` needs `"types": ["node"]` for explicit type resolution with `"lib": ["ES2022"]`
- `deepMerge` with strict TypeScript generics requires runtime casts — keep the public API clean, use `Record<string, unknown>` internally
- `structuredClone` is available at runtime in Node 18+ but needs `@types/node` for compile-time types
- Config validation should collect all errors (not fail-fast) for better developer experience
- `memfs` not needed for config tests — `vi.mock('node:fs')` with `mockImplementation` is simpler and sufficient

## Windows Symlink (2026-03-16)

- Windows'ta `git config core.symlinks=false` → `ln -s` kopya oluşturur, gerçek symlink değil
- AGENTS.md güncellendiğinde CLAUDE.md'yi `cp AGENTS.md CLAUDE.md` ile senkronize et
- Linux/macOS'ta gerçek symlink çalışır, senkronizasyon gerekmez

## Wave 2 Learnings (Sprint 1, 2026-03-16)

- `spawnSync('tmux', [...args])` shell injection'a karşı güvenli — shell interpretation yok, argümanlar array olarak geçer
- Auditor resilient olmalı — `readJsonSafe<T>` pattern: parse hatası → null, scan loop devam eder
- Lock dosya isimlendirme: path separator → `__` (çift alt çizgi), nested dizin gerektirmez
- `isWithinScope` trailing separator ile normalize eder — `src/core/` vs `src/core-extra/` prefix overlap koruması
- `SpawnOptions` pattern: `allowedTools` (Blueprint 15) + `autoApprove` (--dangerously-skip-permissions)
- Modüller arası bağımsızlık: auditor, worker scope'larını task JSON'dan okur (worker import etmez)
- `updateTaskStatus` reusable helper: her lifecycle adımında read-modify-write pattern'i merkezi

## Wave 3 Learnings (Sprint 1, 2026-03-16)

- Brain tüm modülleri import eden TEK modül — döngüsel import yasak (brain → tmux/auditor/worker, tersi olmamalı)
- `runSprint` her phase try/catch — sprint asla yarım kalmaz, hata olsa bile COMPLETE'e kadar gider
- `evaluateResult` pure fonksiyon — testsPassed=false → NO_GO override, coverage<90 → GO_WITH_TECH_DEBT override
- `parseDebtTable`/`generateDebtTable` markdown tablo formatını korur — `slice(1,-1)` boş kolon sorununu çözer
- Timeout sonrası eksik task → syntheticResult ile NO_GO olarak değerlendirilir
- `sleepSync(Atomics.wait)` main thread bloklar — brain headless CLI olarak çalıştığı için şu an kabul edilebilir, ileride async geçiş gerekebilir

## Wave 4 Learnings (Sprint 1, 2026-03-16)

- CLI tek runtime dependency: `commander.js` — chalk/inquirer/picocolors eklenmez, minimal footprint
- `node:readline/promises` Node 18+ built-in — interaktif prompt (promptText, promptSelect, promptConfirm) için yeterli
- Her komut `register<Name>(program: Command): void` pattern'i ile kendi dosyasında kayıtlanır — bağımsız test, kolay ekleme
- Unicode box-drawing (`╔═╗║╚═╝`) terminal dashboard için yeterli, renk kütüphanesi gereksiz
- `.gitignore` append'de duplicate kontrolü önemli — `existing.includes(entry)` ile mevcut satır varsa atla
- Commander `exitOverride()` + sync action'larda throw edilen hatalar Commander tarafından yakalanır — test'lerde `rejects.toThrow` yerine çıktı kontrolü kullan
- `vi.clearAllMocks()` her `beforeEach`'te zorunlu — mock call history testler arası sızar, özellikle `writeFileSync.mock.calls` filtreleme yapan testlerde

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
## Sprint sprint-018 Learnings
- SECURITY.md — Güvenlik Modeli Detayı: GO_WITH_TECH_DEBT
- MCP-GUIDE.md — MCP Kullanım Kılavuzu: GO_WITH_TECH_DEBT
- MEMORY-SYSTEM.md — Bellek Mimarisi: GO_WITH_TECH_DEBT
- SPRINT-LIFECYCLE.md — Sprint Yaşam Döngüsü: GO_WITH_TECH_DEBT
- CONFIG-REFERENCE.md — Config Referans Kılavuzu: GO_WITH_TECH_DEBT
## Sprint sprint-019 Learnings
- Alert Dedup — Auditor Tekrar Engelleme: GO_WITH_TECH_DEBT
- Eksik Dokümanlar — BRAIN-GUIDE.md + DASHBOARD-GUIDE.md: GO_WITH_TECH_DEBT
## Sprint sprint-020 Learnings
- Worker Modülü Fonksiyon Listesi: GO_WITH_TECH_DEBT
- Config Sistemi Analizi: GO_WITH_TECH_DEBT
- tmux Modülü Analizi: GO_WITH_TECH_DEBT
- Planner Modülü Analizi: GO_WITH_TECH_DEBT
- MCP Tool Listesi ve Açıklamaları: GO_WITH_TECH_DEBT
- MCP Resource Listesi ve Açıklamaları: GO_WITH_TECH_DEBT
## Sprint sprint-021 Learnings
- subscription.ts — Claude Plan Tespiti: GO_WITH_TECH_DEBT