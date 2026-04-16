# Analysis: src/cli/commands/watch.ts
**Task ID:** 142-019 | **Model:** opus | **LoC:** 177 | **Effort:** max

## 1. Amaci
Canli tmux split-view izleme CLI komutunu saglar. `deckent watch` ile dashboard + worker pane'leri tmux icerisinde bolunmus pencere olarak goruntulenir. `--follow <taskId>` ile belirli bir worker'a baglanma imkani sunar. Non-tmux provider'lar (Codex/Gemini) icin subprocess log tail destegi var. Terminal genisligine gore dinamik split oran hesaplama (narrow → 30%, wide → 40%) yapar. Stale worker, tamamlanmis task, yanlis provider gibi durumlari aciklayici mesajlarla raporlar.

## 2. Public API
- `cleanupWatchWindow(): void` — tmux watch penceresini temizle (cleanup.ts tarafindan cagirilir)
- `getTaskProvider(root, taskId): string` — Task'in provider bilgisini oku
- `watchSubprocessLog(root, taskId): void` — Subprocess worker log tail
- `registerWatch(program: Command): void` — Commander'a watch komutunu kayit et
- JSDoc: KISMI. `cleanupWatchWindow`, `getTaskProvider`, `watchSubprocessLog` icin inline yorum var. `explainMissingWorker`, `getTaskSprintId`, `getCurrentSprintId`, `computeSplitRatio` icin inline yorum mevcut.

## 3. Ic Bagimliliklar
- `../../core/constants.js` — DASHBOARD_FILE, TASKS_DIR
- `../../orchestra/tmux.js` — isSessionActive, createWatchLayout, attachToWorkerPane, TmuxError
- `../helpers/output.js` — print, printError
- `../helpers/process.js` — resolveProjectRoot
- Dongusel bagimllik riski: YOK.

## 4. Dis Bagimliliklar
- `node:fs` — existsSync, readFileSync
- `node:path` — join
- `node:child_process` — spawn (tail -f icin), spawnSync (tmux kill-window icin)
- `commander` — type import
- ADR-010 uyumu: UYUMLU.

## 5. Complexity
- Fonksiyon sayisi: 8 (4 exported, 4 private)
- En karmasik fonksiyon: `registerWatch` action handler (satir 112-177) — follow mode, sprint ID check, provider check, tmux error handling
- Max cyclomatic complexity (rough): ~7 (multiple branch paths in watch action)
- Genel karmasiklik: ORTA. Cok sayida edge case handling — iyi muhendislik.

## 6. Type Safety
- `any` sayisi: 0
- `@ts-ignore`: 0
- `@ts-expect-error`: 0
- `as unknown`: 0
- Non-null `!`: 0
- Unsafe cast:
  - `JSON.parse(...) as { sprintId?: string }` (satir 24) — catch icinde, kabul edilebilir.
  - `JSON.parse(...) as { last_sprint_id?: string }` (satir 36) — catch icinde.
  - `JSON.parse(...) as { selfAssessment?: string }` (satir 48) — catch icinde.
  - `JSON.parse(...) as { provider?: string; status?: string }` (satir 61) — catch icinde.
- Genel: IYI — tum JSON.parse cast'leri try/catch icinde.

## 7. ADR Compliance
- **ADR-006 (spawnSync):** Kullaniliyor (satir 13) — `tmux kill-window`, timeout YOK. Catch icinde, non-fatal. KISMI UYUMLU.
- **ADR-008 (brain import):** Uyumlu.
- **ADR-010 (deps):** Uyumlu.
- **ADR-022 (CLI/MCP parity):** N/A — watch tmux-specific, MCP kontekstinde karsiligi yok.
- **ADR-027 (hybrid spawn):** UYUMLU — subprocess log viewer ile non-tmux provider destegi.

## 8. Test Coverage
- `tests/cli/commands/watch-overhaul.test.ts` — MEVCUT
- Test eslesmesi: Tek test dosyasi ama "overhaul" genisletilmis test icerigi olabilir.
- Dogrudan `watch.test.ts` YOK — overhaul versiyonu tek test.

## 9. TODO/FIXME/HACK inventory
Hicbir TODO, FIXME, HACK veya XXX isareti yok.

## 10. Dead Code
- Dead code: YOK. Tum fonksiyonlar aktif kullaniliyor. `cleanupWatchWindow` cleanup.ts tarafindan, `getTaskProvider` ve `watchSubprocessLog` register action'dan cagriliyor.

## 11. Security
- `spawnSync('tmux', ['kill-window', '-t', 'deckent:watch'])` — hardcoded session:window. GUVENLI.
- `spawn('tail', ['-f', logPath])` — logPath task ID'den turetiliyor (TASKS_DIR + task-{id}.log). Task ID validation'i bu dosyada yapilmiyor ama `getTaskProvider` icinde path construction TASKS_DIR ile sinirli. Path injection riski DUSUK.
- `process.env['DECKENT_WATCH_SPLIT']` (satir 157-158): Env var set/delete. Process-global state mutation — multi-threaded ortamda race condition riski (Node.js single-threaded oldugu icin pratikte sorun yok ama anti-pattern).

## 12. Memory V2 Uyumu
- `getCurrentSprintId` (satir 32-40): `.deckent/config.json` dosyasindan `last_sprint_id` okuyor. Bu Memory V2 kapsami disinda — config dosyasi filesystem-based kaliyor.
- `getTaskSprintId` (satir 20-28): Task JSON'dan sprint ID okuyor. Ayni sekilde filesystem-based — uygun.
- Eski .md parse: YOK.

## 13. i18n
- Tum mesajlar HARDCODED INGILIZCE: "No active sprint", "No tmux session found", "Warning: Task is from sprint", "Watch mode active" vb.
- `getMessage()` KULLANILMIYOR.
- i18n gap: BUYUK.

## 14. Dokumantasyon Tutarliligi
- H/I/J/K prefix etiketleri (satirlar 11, 19, 31, 43, 103) — sprint task referanslari. Tutarli pattern ama okunabilirligi hafif etkiliyor.
- `explainMissingWorker` (satir 44-72): Cok iyi kullanici deneyimi — 5 farkli senaryo icin ozel aciklama mesajlari.
- Genel: Fonksiyon davranlslari iyi dokumante edilmis inline yorumlarla.

## 15. Performance
- Sync I/O sayisi: existsSync x5, readFileSync x4, spawnSync x1 = **10 sync I/O**
- `spawn('tail', ['-f', logPath])` — async child process, CLI bloklayan bir islem (stdio: 'inherit'). UYGUN — canli izleme icin beklenen davranis.
- Hot path mi? HAYIR.
- `process.env` mutation (set/delete): Cok hizli, performans etkisi yok.

## 16. Oneriler
- **P2:** `process.env['DECKENT_WATCH_SPLIT']` anti-pattern'ini kaldir — `createWatchLayout`'a parametre olarak gec.
- **P2:** Mesajlari getMessage'a tasi.
- **P3:** `cleanupWatchWindow` icindeki spawnSync'e timeout ekle.
- **P3:** H/I/J/K prefix yorumlarini standart JSDoc'a donustur.

## Verdict: ANALYZED
