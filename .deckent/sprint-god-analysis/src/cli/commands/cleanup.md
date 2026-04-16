# Analysis: src/cli/commands/cleanup.ts
**Task ID:** 142-017 | **Model:** opus | **LoC:** 230 | **Effort:** max

## 1. Amaci
`deckent cleanup` CLI komutunu register eder. Sprint sonrasi temizlik: task dosyalarini arsivle, lock'lari serbest birak, tmux session'i kapat, prompt dosyalarini arsivle, .tasks/archive/ retention policy uygula. Opsiyonel `--decay` ile memory budget kontrolu ve brain decay calistir. Sprint yasam dongusunun son halkasi.

## 2. Public API
- `registerCleanup(program: Command): void` — JSDoc YOK. Tek export.
- `getMemoryEntryCount(projectRoot: string): number` — private (module-scoped), export degil
- `getProjectSessionName(root: string): string` — private
- `ensureArchiveGitignore(root: string): void` — private

## 3. Ic Bagimliliklar
- `../../core/types.js` → Sprint, Task, SprintStatus, SprintPhase, TaskStatus (4 type import)
- `../../core/constants.js` → TASKS_DIR, LOCKS_DIR, BRAIN_DIR, MEMORY_DB_FILE, TMUX_SESSION_NAME, PROJECT_CONFIG_PATH
- `../../core/memory-store.js` → MemoryStore
- `../../orchestra/brain.js` → cleanup, runDecay
- `../../orchestra/spawn-backend-docker.js` → archivePromptFiles
- `../../orchestra/sprint-docs-updater.js` → cleanTasksArchive
- `../helpers/output.js` → print, printError
- `../helpers/process.js` → resolveProjectRoot
- `../helpers/messages.js` → getMessage
- `../helpers/config-reader.js` → getLangFromConfig
- Dongusel bagimllik: YOK — ama orchestra/ import'lari ADR-008'e dikkat gerektirir (brain.js re-export layer OK)

## 4. Dis Bagimliliklar
- `commander` (ADR-010), `node:fs`, `node:path`, `node:child_process` → spawnSync (built-in)

## 5. Complexity
- 4 fonksiyon (registerCleanup, getMemoryEntryCount, getProjectSessionName, ensureArchiveGitignore)
- Max cyclomatic: ~8 (registerCleanup action handler — dry-run/decay/normal flow branches)
- En karmasik: satir 94-228 — action handler, 6 ana fazdan olusuyor (decay → task read → sprint build → cleanup → archive → tmux kill)

## 6. Type Safety
- `any` sayisi: 0
- `@ts-ignore`: 0
- non-null `!`: 0
- `as Record<string, unknown>` cast: 0
- Type assertion `as Task` (satir 136), `as { tmux_session?: string }` (satir 36), `as { memory_budget?: number; ... }` (satir 103) — guvenli JSON parse cast'lar
- Genel: IYI

## 7. ADR Compliance
- ADR-006 spawnSync: satir 209 `spawnSync('tmux', ['kill-session', ...])` — tmux oturum kapatma, guvenlik riski dusuk (arguman sabit string)
- ADR-008 brain import: `orchestra/brain.js` import — bu re-export layer, UYUMLU
- ADR-010: UYUMLU
- ADR-022 CLI/MCP parity: UYUMLU — `deckent_cleanup` MCP tool mevcut
- Memory V2 DB-first: UYUMLU — `getMemoryEntryCount` MemoryStore.totalCount() kullaniliyor

## 8. Test Coverage
- `tests/cli/commands/cleanup.test.ts` — MEVCUT
- `tests/cli/commands/cleanup-dryrun.test.ts` — MEVCUT (dry-run ozelligine ozel)
- Kapsam: Temel cleanup + dry-run test edilmis. Decay path, archive path, tmux kill path tam coverage'i bilinmiyor.

## 9. TODO/FIXME/HACK inventory
- YOK

## 10. Dead Code
- YOK — tum private fonksiyonlar registerCleanup icinde kullaniliyor

## 11. Security
- `spawnSync('tmux', ['kill-session', '-t', sessionName])` — sessionName config'den geliyor, command injection riski: DUSUK (JSON parse ile gelen string, shell: false)
- `readFileSync` ile task JSON parse — malformed JSON sessizce atlanıyor (try/catch) — dogru davranis
- `writeFileSync(gitignorePath, ...)` — .gitignore degistirme, proje icerisinde, risk dusuk
- ensureArchiveGitignore: `.brain/archive/` gitignore'a ekleniyor — dogru

## 12. Memory V2 Uyumu
- UYUMLU — `getMemoryEntryCount` DB-first (MemoryStore.totalCount)
- `runDecay` orchestra/brain.js uzerinden — DB decay mekanizmasi
- **SEMANTIK UYUMSUZLUK (P2):** satir 222-223: `brainLines > decayMemoryBudget` — `brainLines` aslinda entry count (DB), `decayMemoryBudget` ise eski V1 line-budget config degeri (900). Entry count vs line count farkli metrikler — karsilastirma yaniltici olabilir.

## 13. i18n
- `getMessage()` KULLANIYOR — `cleanup.decay_complete`, `cleanup.archived_sprints`, `cleanup.removed_items`, `cleanup.complete` — IYI
- Bazi mesajlar hala hardcoded EN: "Warning: X task(s) are still active" (satir 148), "[dry-run]" prefix (satir 80-90)

## 14. Dokumantasyon Tutarliligi
- JSDoc: `getMemoryEntryCount` icin var (satir 21) — "DB-first memory entry count — replaces legacy countBrainLines" — DOGRU
- CLI help: "Clean up after a sprint" — dogru
- Option help: --decay, --dry-run — dogru

## 15. Performance
- Sync I/O: readFileSync (5), writeFileSync (1), existsSync (7), readdirSync (2), spawnSync (1), mkdirSync (0) = 16 sync cagri
- `readdirSync(tasksDir)` tek seferde okunuyor + filter ile bolunuyor — optimize (satir 75: "Single readdirSync pass")
- spawnSync('tmux', ...) timeout yok — tmux komutu genellikle hizli ama deadlock riski var

## 16. Oneriler
- **P1:** Semantik uyumsuzluk: entry count vs line budget karsilastirmasi duzeltilmeli (satir 222-223)
- **P2:** `getMemoryEntryCount` 4 yerde duplicate — ortak utility'ye tasinmali (DRY)
- **P2:** Hardcoded EN mesajlar → getMessage() ile
- **P2:** spawnSync('tmux', ...) icin timeout eklenmeli
- **P3:** Dry-run modunda prompt file sayisi icin daha dogru sayim (simdi filter ile 2 pass)

## Verdict: ANALYZED
