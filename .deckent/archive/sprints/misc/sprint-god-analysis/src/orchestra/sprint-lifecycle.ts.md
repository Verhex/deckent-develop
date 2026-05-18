# Analysis: src/orchestra/sprint-lifecycle.ts
**Task ID:** 142-008 | **Model:** opus | **LoC:** 515 | **Effort:** max

## 1. Amacı (detaylı, 3-5 cümle — ne yapar, neden var, kim kullanır)
sprint-lifecycle.ts, sprint yaşam döngüsü yönetim fonksiyonlarını barındırır: BrainError exception sınıfı, interrupt state management (SIGINT handler desteği), cleanup (worker kill, lock release, task file temizliği), pause/resume mekanizması ve human checkpoint polling sistemi. Sprint 136'da sprint-controller.ts'den çıkarılmıştır. Bu modül **sprint durumunun güvenli geçişlerini** (active→paused, paused→active, active→interrupted, active→aborted) sağlar. SIGINT handler'ı tarafından çağrılarak sprint'in temiz bir şekilde sonlanmasını garanti eder. Ayrıca human checkpoint altyapısını sağlar — Brain planlama/değerlendirme/fix fazlarında insan onayı bekleyebilir.

## 2. Public API (her export'un tam signature + JSDoc var mı?)
**Classes (1):**
1. `BrainError extends Error { phase?: SprintPhase }` — JSDoc: EKSIK (constructor yorum yok)

**Interfaces/Types (3):**
1. `PauseState { sprintId, pausedAt, pausedTaskIds, reason }` — JSDoc: EKSIK
2. `CheckpointPhase = 'plan' | 'evaluate' | 'fix'` — JSDoc: ✅ (satır 81)
3. `CheckpointFile { phase, summary, status, createdAt }` — Internal, JSDoc: EKSIK

**Functions (10):**
1. `setActiveSprint(projectRoot, sprint, spawnBackend): void` — JSDoc: ✅ (@internal)
2. `clearActiveSprint(): void` — JSDoc: ✅ (@internal)
3. `resetInterruptState(): void` — JSDoc: ✅ (@internal, tests only)
4. `isInterrupted(): boolean` — JSDoc: ✅
5. `interruptActiveSprint(): void` — JSDoc: ✅
6. `safeDashboardUpdate(projectRoot, sprint, errorMessage): void` — JSDoc: ✅
7. `cleanup(projectRoot, sprint, spawnBackend?): void` — JSDoc: ✅
8. `waitForHumanApproval(projectRoot, sprintId, phase, summary): Promise<boolean>` — JSDoc: ✅
9. `pauseSprint(projectRoot, sprint, reason?): PauseState` — JSDoc: ✅ (@internal)
10. `resumeSprint(projectRoot, sprint): PauseState | null` — JSDoc: ✅ (@internal)

## 3. İç Bağımlılıklar (import chain listesi, döngüsel bağımlılık riski var mı?)
**Import'lar (10 modül):**
- core: types, constants, utils, multi-ide, plugin-hooks
- orchestra: sprint-utils, spawn-backend (type), tmux, ipc-registry
- agents: worker (releaseAllLocks)
- monitor: auditor (updateDashboard)

**Döngüsel risk:** Yok — sprint-lifecycle.ts tek yönlü bağımlılıklara sahip.

## 4. Dış Bağımlılıklar
- `node:fs` (readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync)
- `node:fs/promises` (readFile, writeFile)
- `node:path` (join)
- Üçüncü parti: **YOK** — ADR-010 UYUMLU

## 5. Complexity
- Fonksiyon sayısı: **10 exported**
- Max cyclomatic rough: **~15** (cleanup — 5 ayrı readdirSync loop, her biri try/catch + if)
- En karmaşık fonksiyonlar:
  1. **cleanup** (satır 218-294, ~76 LoC): 5 farklı cleanup bloğu (workers, adapters, locks, task files, stale files, tmp files, decision files, lock files)
  2. **interruptActiveSprint** (satır 128-188, ~60 LoC): for döngüsü × 3 try/catch
  3. **pauseSprint** (satır 355-442, ~87 LoC): task status transition + IPC/tmux kill
  4. **waitForHumanApproval** (satır 304-346, ~42 LoC): infinite polling loop

## 6. Type Safety
- `any`: **0**
- `@ts-ignore`: **0**
- `@ts-expect-error`: **0**
- `as unknown`: **0**
- Non-null `!`: **0**
- Unsafe cast:
  - Satır 152: `JSON.parse(raw) as Record<string, unknown>` — task JSON parse, runtime type koruması yok. readJsonSafe kullanılabilir.
  - Satır 163: `JSON.parse(raw) as Record<string, unknown>` — heartbeat JSON parse, aynı sorun.
- **Genel:** Temiz type safety profili.

## 7. ADR Compliance
- **ADR-006 (spawnSync):** ✅ — sprint-lifecycle.ts'de spawnSync yok
- **ADR-008 (brain import):** ✅ — Brain alt modülü. `../agents/worker.js` import'u (releaseAllLocks) — ADR-008'e göre izinli (Brain merkezi, worker'a tek yönlü erişim).
- **ADR-010:** ✅
- **ADR-025 (Graceful Shutdown):** ✅ — interruptActiveSprint SIGINT handler desteği, task'ları INTERRUPTED olarak işaretler, worker'ları kill eder, sprint lock serbest bırakır.
- **ADR-037 (RBAC):** N/A — lifecycle authority check yapmaz
- **Memory V2 DB-first:** ✅ — sprint-lifecycle.ts memory'ye doğrudan erişmiyor. cleanup'ta .locks/ ve .tasks/ dosya temizliği yapılır, .brain/ dosyalarına dokunulmaz.

## 8. Test Coverage
- `tests/orchestra/brain-pause-resume.test.ts` — pauseSprint/resumeSprint testi ✅
- `tests/orchestra/brain.test.ts` — cleanup dolaylı test
- `tests/orchestra/sprint-controller.test.ts` — lifecycle fonksiyonları dolaylı
- **Eksik:** interruptActiveSprint dedicated test (SIGINT simulation)
- **Eksik:** waitForHumanApproval dedicated test (polling + approve/reject)
- **Eksik:** cleanup decision trail temizleme (satır 272-280) testi
- **Eksik:** cleanup tmp file temizleme (.prompt-*, .worker-*.sh, satır 264-269) testi

## 9. TODO/FIXME/HACK inventory
**0 — Temiz.**

## 10. Dead Code
- `CheckpointFile` interface (satır 83-89): Internal, waitForHumanApproval'da kullanılıyor — ölü değil.
- `ActiveSprintRef` interface (satır 93-97): Internal, module-level state'te kullanılıyor — ölü değil.
- `_activeSprint` ve `_isInterrupted` module-level state (satır 99-100): Runtime state — dikkatli kullanılmalı (test isolation riski).

## 11. Security
- **Module-level mutable state:** `_activeSprint` ve `_isInterrupted` (satır 99-100) — global state. `resetInterruptState()` fonksiyonu test'ler için mevcut. **Multi-sprint concurrent kullanımda race condition riski** — ancak mevcut mimaride tek sprint çalışır (sprint lock ile korunur).
- **interruptActiveSprint:** task dosyalarına yazma (INTERRUPTED status) — path traversal riski yok (join + TASKS_DIR sabiti).
- **waitForHumanApproval:** infinite polling loop — timeout yok. Sprint çalışırken brain sonsuz bekleyebilir. **P2 — timeout mekanizması eklenmeli.**
- **cleanup:** unlinkSync çağrıları — path doğrulaması join ile yapılır, güvenli.
- **releaseAllLocks:** worker lock dosyalarını siler — workerId doğrulaması agents/worker.ts'de yapılır.

## 12. Memory V2 Uyumu
- ✅ sprint-lifecycle.ts Memory'ye doğrudan erişmiyor
- ✅ Eski .md parse kodu yok
- ✅ readFileSync kullanımları task/heartbeat/checkpoint dosyaları için — memory dosyaları değil

## 13. i18n
- Hardcoded TR string: `"Sprint paused: ${reason}"` (satır 437) — dashboard alert mesajı. İngilizce ama TR projede kullanılıyor.
- Diğer mesajlar İngilizce debug log — sorun yok.

## 14. Dokümantasyon Tutarlılığı
- Üst yorum bloğu (satır 1-6): Sprint-controller'dan çıkarılma açıklaması — **GÜNCELDİR** ✅
- fonksiyon listesi: "BrainError, PauseState, interrupt state management, cleanup(), pauseSprint(), resumeSprint(), waitForHumanApproval(), safeDashboardUpdate()" — **GÜNCELDİR** ✅
- JSDoc'lar 10 fonksiyon için mevcut ve doğru ✅
- @internal etiketleri uygun yerlerde kullanılmış (setActiveSprint, clearActiveSprint, resetInterruptState, pauseSprint, resumeSprint)
- **BrainError class JSDoc'u EKSIK** — P3

## 15. Performance
- **Sync I/O sayımı:**
  - `readFileSync`: 2 (satır 150, 161 — interruptActiveSprint task/hb okuma)
  - `writeFileSync`: 5 (satır 153, 165 — interrupt; satır 376, 385, 418 — pause)
  - `existsSync`: 5 (satır 149, 160 — interrupt; satır 246, 252, 264, 274, 283, 475, 493 — cleanup/resume)
  - `readdirSync`: 4 (satır 247, 253, 265, 275, 284 — cleanup)
  - `unlinkSync`: 3 (satır 248, 257, 267, 277, 285 — cleanup; satır 476 — resume)
  - `mkdirSync`: 2 (satır 311, 416)
- **Toplam sync I/O: ~21** — interruptActiveSprint ve cleanup sıcak yolda **değil** (sprint sonu / SIGINT). Ancak yoğun sync I/O.
- **waitForHumanApproval polling:** 5s interval — CPU overhead minimal, ama sonsuz loop timeout'suz.
- **cleanup 5× readdirSync loop:** Aynı dizin birden fazla kez okunuyor — tek readdir ile optimize edilebilir (P3).

## 16. Öneriler (severity P0-P3, Sprint 142+ input, somut aksiyon)
1. **P1 — waitForHumanApproval timeout yok:** Sonsuz polling loop — brain sonsuza kadar bekleyebilir. configurable timeout (default 30 dakika) eklenmeli.
2. **P2 — cleanup 5× readdirSync:** tasksDir 3 kez, decisionsDir 1 kez, locksDir 1 kez readdirSync ile okunuyor. Tek readdir + categorize ile optimize edilebilir.
3. **P2 — interruptActiveSprint JSON.parse güvensiz:** Satır 152, 163 — readJsonSafe helper yerine doğrudan JSON.parse + `as Record<string, unknown>` kullanılıyor. readJsonSafe daha güvenli.
4. **P2 — Test gap:** interruptActiveSprint, waitForHumanApproval, cleanup tmp/decision dosya temizleme için dedicated test eksik.
5. **P2 — Module-level mutable state:** `_activeSprint`, `_isInterrupted` — test isolation riski. Test'lerde resetInterruptState() çağrılmalı (mevcut ama tüm test'lerde afterEach'de mi?).
6. **P3 — BrainError JSDoc:** Constructor parametrelerini açıklayan JSDoc eklenmeli.
7. **P3 — cleanup async migration:** readdirSync → readdir, unlinkSync → unlink olarak taşınabilir (Sprint 139 pattern).
8. **P3 — cleanup redundant stale file check:** Satır 246-249 tüm task extension'lı dosyaları siler, satır 252-259 tekrar aynı dizini kontrol edip stale olanları siler — ikinci pass'ın birinciden sonra bir şey bulması mümkün mü? İlk pass zaten tümünü siliyor.

## Verdict: ANALYZED
