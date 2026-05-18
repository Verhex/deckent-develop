# Analysis: src/orchestra/result-collector.ts
**Task ID:** 142-009 | **Model:** opus | **LoC:** 384 | **Effort:** max

## 1. Amaci (detayli, 3-5 cumle — ne yapar, neden var, kim kullanir)
Sprint worker sonuclarinin disk'ten toplanmasi, kuyruk yonetimi ve IPC entegrasyonu. Worker'lar task result dosyalarini (.tasks/task-{id}.result) yazdiginda, bu modul fs.watch + fallback polling ile algilayip sonuclari toplar. Kuyruk mekanizmasi ile tamamlanan worker slot'lari yeni task'lara acilir. Token usage enrichment ile eksik tokenUsage verisini heuristic olarak tahmin eder. Brain tarafindan sprint-controller EXECUTE fazinda kullanilir. IPC channel registry ile heartbeat ve worker question handling destekler.

## 2. Public API (her export'un tam signature + JSDoc var mi?)
- `buildResultsMap(results): Map<string, TaskResult>` — JSDoc ✓
- `estimateTokenUsage(task, result): TokenUsage` — JSDoc ✓
- `enrichResultTokenUsage(result, task): void` — JSDoc ✓ (mutates in-place)
- `resolveAgentPrompt(projectRoot, task): Promise<string | undefined>` — JSDoc ✓
- `resolveSkillPrompts(projectRoot, task): Promise<Array<{ name, content }>>` — JSDoc ✓
- `waitForResults(projectRoot, sprint, timeout?, queue?, spawnOpts?, channelRegistry?): Promise<TaskResult[]>` — JSDoc ✓
- Re-exports: `handleWorkerQuestion`, `checkWorkerQuestions` — from ipc-registry.js

## 3. Ic Bagimliliklar
- `../core/types.js` → Task, TaskResult, Sprint
- `../core/constants.js` → TASKS_DIR
- `../core/utils.js` → readJsonSafe, debugLog
- `../core/observability.js` → metric (Sprint 134)
- `../core/task-types.js` → BrainAnswer, WorkerQuestion, TokenUsage
- `./result-watcher.js` → createResultWatcher
- `../agents/worker-ipc.js` → ChannelRegistry (type-only)
- `./ipc-registry.js` → writeAnswerFile, checkWorkerQuestions
- `./spawn-backend.js` → SpawnBackend (type-only)
- `./task-builder.js` → buildWorkerPrompt
- `./tmux.js` → spawnWorker, killWorker

**Dongusel bagimllik riski:** DIKKAT. tmux.js import'u ADR-008 ile sorunlu olabilir. Ancak result-collector brain tarafindan cagrilir (sprint-controller → result-collector → tmux), bu nedenle brain → tmux import zincirinin parcasi. Teknik olarak UYUMLU ama dolayli.

## 4. Dis Bagimliliklar
- `node:fs/promises` (readFile, stat, writeFile) — Built-in ✓
- `node:path` (join) — Built-in ✓
- ADR-010: ✓

## 5. Complexity
- Toplam fonksiyon: 7 exported + 0 internal (nested closures haric)
- En karmasik: `waitForResults` (satir 179-380) — 200 satir, cyclomatic ~10 (timeout logic, queue processing, IPC setup, fs.watch race, final sweep). YUKSEK complexity.
- Nested closures: `collectResults` (satir 200-250), `processQueue` (satir 254-288), `setupIpcListeners` (satir 298-333)
- **Degerlendirme:** waitForResults cok buyuk, nested closure'lar okunurlugu dusurur.

## 6. Type Safety
- `as TokenUsage['provider']` — satir 73: task.provider cast. Provider undefined olabilir, spread ile korunmus.
- `as TokenUsage['model']` — satir 74: ayni pattern.
- `as Record<string, unknown>` — satir 131: agent.json JSON.parse
- `as string[]` — satir 133: raw['expertise'] cast, Array.isArray guard ile korunmus ✓
- `as string | undefined` — satir 132: raw['systemPrompt'] cast
- `as WorkerQuestion | undefined` — satir 313: msg.payload cast
- **Degerlendirme:** Cast'ler belirli ve guard'li. Kabul edilebilir.

## 7. ADR Compliance
- **ADR-006:** spawnSync yok ✓ (async I/O kullaniliyor)
- **ADR-008:** tmux.js ve task-builder.js import'u var — brain tarafindan cagrilir, UYUMLU
- **ADR-010:** Harici dep yok ✓
- **ADR-033:** metric() observability — yerel telemetry, product vision uyumlu ✓
- **ADR-035:** IPC channel HEARTBEAT + QUESTION handling — verification protocol uyumlu ✓

## 8. Test Coverage
- `tests/orchestra/result-collector.test.ts` MEVCUT ✓
- Token usage enrichment, queue processing, IPC handling testleri mevcut olmali
- **Eksik test senaryolari:**
  - Timeout marker (.timeout) path (satir 218-244) — synthetic result uretimi
  - IPC QUESTION auto-answer path (satir 313-331)
  - Final sweep (satir 366-378) — edge case: result dosyasi son poll'dan sonra yazilirsa
- **Degerlendirme:** Ana akis test edilmis, edge case'ler icin boşluk olabilir.

## 9. TODO/FIXME/HACK inventory
Yok ✓

## 10. Dead Code
- Re-exports: `handleWorkerQuestion`, `checkWorkerQuestions` — Sprint 135 T-004'te ipc-registry'ye tasindi. Re-export backward compat icin. Consumer'larin dogrudan ipc-registry'den import edip etmedigini kontrol et P3.
- `estimateTokenUsage` — enrichResultTokenUsage icinden cagrilir. Aktif ✓
- **Degerlendirme:** Re-export'lar dısında dead code yok.

## 11. Security
- **Token estimation:** Heuristic tahmini kullanir (satir 69-83). Security riski yok ama yanlis tahminler maliyet raporlamasini etkileyebilir.
- **IPC auto-answer:** Worker sorularina otomatik "continue" yaniti verilir (satir 319). Bu, kontrol edilmemis bir auto-approve gibi davranir. Security degil ama operational risk.
- **Synthetic result yazma:** Timeout durumunda `.result` dosyasi yazilir (satir 235-239). Race condition: ayni anda worker da yaziyorsa uzerine yazabilir. writeFile atomic degil — P2 risk.
- **Path construction:** Sabit TASKS_DIR + taskId — injection riski dusuk (taskId format-controlled) ✓

## 12. Memory V2 Uyumu
- Bu modul Memory V2 DB'yi DOGRUDAN KULLANMIYOR. ✓
- Token usage, result collection, queue management — tumu file-based (.tasks/ dizini).
- Memory V2 ile dolayliyla iliskili degil.

## 13. i18n
- Debug mesajlari Turkce (satir 357): `Sprint devam ediyor — ${collected.size}/${taskIds.size} task tamamlandı (${Math.round(...)}dk)` — hardcoded TR string
- IPC auto-answer mesaji Ingilizce (satir 321): `"Auto-continue: Brain acknowledged question via IPC"`
- **Degerlendirme:** Karisik dil kullanimi (TR + EN debug mesajlari). Tutarlilik icin tek dil secilmeli P3.

## 13. i18n (devam)
- turkishNormalize: Kullanilmiyor, gerekli degil.

## 14. Dokumantasyon Tutarliligi
- Dosya basi yorum blogu (satir 1-5): "Result collection, queue management, worker prompt resolution" — dogru ✓
- "Sprint 076: God Object Split Phase 3" referansi — tarihsel olarak dogru ✓
- **Degerlendirme:** Tutarli.

## 15. Performance
- **Async I/O:** readFile, stat, writeFile — uygun pattern ✓
- **Sync I/O:** readJsonSafe — utils.js'de readFileSync kullaniyor OLABILIR. Kontrol gerekli.
- **fs.watch + polling:** 5s fallback interval — iyi denge ✓
- **Progress log:** 5 dakikada bir — gereksiz I/O yok ✓
- **IPC Promise.race:** fs.watch vs IPC heartbeat — dogru async pattern ✓
- **Hot path:** waitForResults sprint boyunca calisir. collectResults her wakeup'ta tum task'lari tarar — collected Set ile optimize edilmis ✓
- **readJsonSafe per-task:** Her poll'da result dosyasi JSON.parse yapilir. Gecerli pattern ama buyuk sprint'lerde (48 task) her 5 saniyede 48 stat cagri yapilir — kabul edilebilir.

## 16. Oneriler
1. **P2** — Synthetic result yazma (satir 235-239) atomic olmali. Race condition: worker ayni anda yaziyorsa overwrite riski. atomicWriteFileSync (Docker HB Core Fix'ten) kullaniniz.
2. **P2** — waitForResults 200 satir nested closures — extracted functions'a refactor
3. **P3** — Debug mesajlari dil tutarliligi: ya hepsi TR ya hepsi EN
4. **P3** — ipc-registry re-export'larinin consumer'ini dogrula, gereksizse kaldir
5. **P3** — `resolveAgentPrompt` ve `resolveSkillPrompts` task-builder.ts ile birlestirilmeli mi? Concern overlap var.

## Verdict: ANALYZED
