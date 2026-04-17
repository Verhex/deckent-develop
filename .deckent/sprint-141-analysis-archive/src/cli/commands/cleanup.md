# Analysis: src/cli/commands/cleanup.ts
**Task ID:** 141-003 | **LoC:** 231

## 1. Amacı
Sprint temizleme (cleanup) işlemini uygular. Task dosyalarını arşivler, lock'ları serbest bırakır, tmux session'ını kapatır, memory decay çalıştırır.

## 2. Public API (export listesi)
- `registerCleanup(program: Command): void` — commander program'a cleanup komutunu register eder

İç yardımcılar:
- `getMemoryEntryCount(projectRoot: string): number` — DB-first memory sayısı (private)
- `getProjectSessionName(root: string): string` — proje-spesifik tmux session adı (private)
- `ensureArchiveGitignore(root: string): void` — .gitignore'da archive istisnası (private)

## 3. İç + Dış Bağımlılıklar
İç:
- `../../orchestra/brain.js` (cleanup, runDecay)
- `../../orchestra/spawn-backend-docker.js` (archivePromptFiles)
- `../../orchestra/sprint-docs-updater.js` (cleanTasksArchive)
- `../../core/memory-store.js` (MemoryStore)
- `../../core/constants.js` (TASKS_DIR, LOCKS_DIR, BRAIN_DIR, MEMORY_DB_FILE, TMUX_SESSION_NAME, PROJECT_CONFIG_PATH)
- `../../core/types.js` (Task, Sprint, SprintStatus, SprintPhase, TaskStatus)

Dış:
- `../helpers/output.js` (print, printError)
- `../helpers/process.js` (resolveProjectRoot)
- `../helpers/messages.js` (getMessage)
- `../helpers/config-reader.js` (getLangFromConfig)
- `commander` (Command)
- `node:fs` (readFileSync, writeFileSync, readdirSync, existsSync)
- `node:path` (join)
- `node:child_process` (spawnSync)

## 4. Complexity
- 1 exported function (registerCleanup)
- 4 private helper functions
- Cyclomatic: ~8 (dryRun branch, decay branch, sprint state detection, gitignore mutation)
- Yorum etiketleri: A, B, C, D, E, F — iyi belgelenmiş implementation

## 5. Type Safety
- `opts: { decay?: boolean; dryRun?: boolean }` — explicit typed ✅
- `JSON.parse(readFileSync(...)) as { tmux_session?: string }` — casting kullanılıyor, tip güvenli değil ama pratik
- `rawCfg: { memory_budget?: number; ... }` — casting ile okunuyor, acceptable

## 6. ADR Compliance
- ✅ ADR-001: ESM import
- ✅ ADR-006: spawnSync kullanılıyor (tmux kill-session) — sadece kill işlemi, güvenlik riski düşük
- ✅ ADR-010: commander tek runtime dep
- ✅ Memory V2 DB-First: `getMemoryEntryCount` → MemoryStore.totalCount() kullanıyor
- ✅ Legacy `countBrainLines` kaldırılmış — DB-first migration TAMAMLANDI

## 7. Test Coverage
Test: `tests/cli/cleanup.test.ts` — beklenen:
- dry-run mode
- decay flag ile cleanup
- getMemoryEntryCount DB path
- sprint state detection (sprint-state.json → tasks)

## 8. TODO/FIXME/HACK inventory
Satır 216: `// NOTE: intentionally fall through to normal cleanup (no early return)` — belgelenmiş intentional fallthrough ✅

## 9. Dead Code Candidates
Yok.

## 10. Security Findings
- `spawnSync('tmux', ['kill-session', '-t', sessionName])` — sessionName proje config'dan geliyor, injection riski düşük çünkü array args kullanılıyor
- `readFileSync(join(root, PROJECT_CONFIG_PATH))` — path sabit, user input değil

## 11. Memory V2 Uyumu
✅ `getMemoryEntryCount` → MemoryStore.totalCount() ile DB-first
✅ Eski `countBrainLines` tamamen kaldırılmış — satır 20-29 yorum ile belgelenmiş
✅ `runDecay` çağrısı — DB-first decay (orchestra/brain.js'da)
⚠️ `brainLines > decayMemoryBudget` warning mesajı "lines" diyor ama artık entry count — mesaj güncellenmeli

## 12. Öneriler
- `getMemoryEntryCount` → `getMemoryEntryCount` private fonksiyon hem cleanup.ts hem doctor.ts'de duplicate — ortak utility'ye taşınabilir (DRY)
- Warning mesajı: "`.brain/ has ${brainLines} lines`" → "has ${brainLines} entries" düzeltilmeli (Memory V2 sonrası terminoloji)
- `getProjectSessionName` config parse hatasında `TMUX_SESSION_NAME` default dönüyor — iyi defensive coding ✅

## 13. Verdict: ANALYZED
