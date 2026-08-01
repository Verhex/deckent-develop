# Audit — `src/agents/worker-lifecycle.ts`

**Sprint:** 186 (per-file pilot 50)
**Auditor:** doc-writer (task 186-017)
**Audit date:** 2026-05-21
**File scope:** `src/agents/worker-lifecycle.ts`

---

## 1. Inventory

- **LoC (file end):** 579 satır (header dahil).
- **Kaynak başlığı:** *“Worker Lifecycle — State Machine, Shutdown, Verify-Delta, Feedback Loop”* — Sprint 144 God Object Split sırasında `worker.ts` içinden çıkarılmıştır.
- **Imports (4 modül):**
  - `node:fs` — `readFileSync, writeFileSync, existsSync, mkdirSync, openSync, closeSync, fsyncSync, renameSync`
  - `node:path` — `join`
  - `../core/constants.js` — `TASKS_DIR`
  - `../core/types.js` — `TaskResult`, `FeedbackLoop` (type-only)
- **Exports — fonksiyonlar (17):** `atomicWriteFileSync`, `fsyncResultFile`, `finalizeHeartbeatOnShutdown`, `createFeedbackLoop`, `recordTscAttempt`, `recordTestAttempt`, `calculateSelfHealingRate`, `aggregateFeedbackLoops`, `writeVerifyDeltaBaseline`, `readVerifyDeltaBaseline`, `computeVerifyDelta`, `getWorkerStateMachine`, `createWorkerStateMachine`, `removeWorkerStateMachine`, `isWorkerStoppable`, `getAllWorkerStates`, `clearWorkerStateRegistry`.
- **Exports — sabitler (5):** `VERIFY_DELTA_DONE_THRESHOLD` (0.8), `VERIFY_DELTA_NO_GO_THRESHOLD` (0.5), `VALID_TRANSITIONS`, `STOPPABLE_STATES`, `TERMINAL_STATES`.
- **Exports — sınıflar (2):** `InvalidStateTransitionError`, `WorkerStateMachine`.
- **Exports — tipler (3):** `WorkerLifecycleState` (10-üye union), `VerifyDeltaBaseline`, `VerifyDeltaResult`.
- **Internal (export edilmemiş):** `ensureDir`, `heartbeatFilePath`, `resultFilePath`, `DONE_SET`, `PARTIAL_WORK_SET`, `registerSigtermHandler`, modül-seviye `_workerStates: Map<string, WorkerStateMachine>`.
- **Module-load side effect:** Dosya yüklendiğinde `registerSigtermHandler()` otomatik çağrılır (satır 182).
- **Reverse-dep grafiği:**
  - `src/agents/worker.ts` — 25 referans, re-export köprüsü (`atomicWriteFileSync as _atomicWrite` lokal alias + bir blokluk `export { ... } from './worker-lifecycle.js'`).
  - `tests/agents/worker-lifecycle.test.ts` — birim testleri.
  - `tests/docker/timeout-with-work.test.ts` — `finalizeHeartbeatOnShutdown` E2E.
  - `tests/orchestra/spurious-nogo.test.ts` — dolaylı kullanım (reconcile pipeline).
  - `src/orchestra/{result-evaluator,sprint-metrics,sprint-spawner,sprint-reporter,sprint-retro-writer}.ts` — *string-eşleşmeli* (yorum/log) — kod imzası bağımlılığı yok.

---

## 2. Bağlam

- **Mimari rol:** Worker subprocess'inin **yaşam-döngüsü yardımcı modülü**. Üç farklı sorumluluk grubunu tek dosyada toplar:
  1. **Crash-safe IO** — `atomicWriteFileSync`, `fsyncResultFile`, `finalizeHeartbeatOnShutdown`.
  2. **Honest assessment (verify-delta)** — `writeVerifyDeltaBaseline`, `computeVerifyDelta` ve eşik sabitleri.
  3. **State machine** — `WorkerStateMachine` + global `_workerStates` registry + transition tablosu.
  4. **Feedback loop telemetrisi** — `createFeedbackLoop`, `recordTscAttempt/TestAttempt`, `calculateSelfHealingRate`, `aggregateFeedbackLoops`.
- **ADR bağlamı:**
  - **ADR-008 (Brain Merkezi Import / Tek Yönlü Bağımlılık)** — sadece `core/` paketine bağımlı, ters bağımlılık yok (✓).
  - **ADR-035 (Verification Protocol Standard)** — verify-delta + feedback loop direkt destek mekanizması.
  - **ADR-037 (Brain-Auditor-Worker Authority Matrix V1.0)** — V1.0 “runtime advisory/soft” ihlali; `finalizeHeartbeatOnShutdown` DONE/GO_WITH_TECH_DEBT/TIMEOUT_WITH_WORK sınıflandırması Brain'in nihai kararını **bloke etmez**, sadece HB finalize eder.
  - **ADR-027 (Hybrid Spawn Backend, Sprint 139 dual)** — Docker backend SIGTERM senaryosu temel motivasyon (5-sprint exit-137 bug, 2026-03 fix).
- **Sprint geçmişi:** Sprint 139 Task 13 (atomic write + fsync + SIGTERM grace), Sprint 144 (God Object split), Sprint 145 (`TIMEOUT_WITH_WORK` partial-work tanıma).

---

## 3. Debt Risk

| # | Risk | Şiddet | Tetikleyici | Etki |
|---|------|--------|-------------|------|
| 1 | `registerSigtermHandler()` modül-load side effect (l.182) | 🟧 Yüksek | Modül import edildiği her test/runtime'da çalışır; ENV yoksa no-op ama listener kayıt yine de yapılmaz — koşul satır 172'de erken çıkış. Yine de import sırasını/test izolasyonunu zorlaştırır. | Test idempotency, harness bağımlılığı. |
| 2 | Global `_workerStates: Map` (l.545) | 🟧 Yüksek | Cross-test sızıntısı; sadece `clearWorkerStateRegistry()` ile temizlenir. | Test hassasiyeti + paralel sprint senaryolarında race. |
| 3 | `WorkerStateMachine.forceState()` (l.528) transition validation yapmaz | 🟨 Orta | Debug amaçlı; kötüye kullanım durumunda invariant ihlali. | State machine niyetinin gizlice bypass'i. |
| 4 | `computeVerifyDelta` katsayıları hard-coded (`filesRatio*0.6 + testRatio*0.4`, eşik 0.8/0.5) | 🟨 Orta | Domain-spesifik tunning yok. | Pilot tipi (audit-only task) için anlamlı oran tartışmalı. |
| 5 | `expectedFilesChangedCount` fallback (l.382-384) self-referansa düşer | 🟧 Yüksek | Argüman verilmezse `denominator = max(filesChangedActual, 1)` → `newFilesChanged/denominator = 1` → completion 1.0 → otomatik DONE bias. | Honest-assessment bypass riski (paradox: çok yazan DONE, hiç yazmayan da 0/1 → 0 NO_GO). |
| 6 | `atomicWriteFileSync` dizin fsync atlanır | 🟨 Orta | `renameSync` sonrası parent dir fsync edilmez; POSIX'te dir entry kalıcılığı tam garantili değil. | Crash sonrası nadiren rename'in görünmemesi (edge case). |
| 7 | `finalizeHeartbeatOnShutdown` catch-all `try/catch` sessiz `false` (l.156) | 🟨 Orta | JSON parse hatası telemetri'ye yansımaz, event-stream'e log düşmez. | Forensic debugging zorlaşır. |
| 8 | `DONE_SET` / `PARTIAL_WORK_SET` magic-set (`'DONE'`, `'GO_WITH_TECH_DEBT'`, `'TIMEOUT_WITH_WORK'`) | 🟩 Düşük | Self-assessment union (`TaskResult.selfAssessment` tipi) ile eşleşmesi compile-time doğrulanmamış. | Tip drift ihtimali. |
| 9 | `recordTscAttempt`/`recordTestAttempt` sayım kuralı (`success && attempts>1 ⇒ fixed +=1`) gizli | 🟩 Düşük | Anlam yorumu ancak JSDoc + kaynak okumayla bulunur. | Yanlış telemetri yorumu. |
| 10 | `WorkerStateMachine.toJSON()` history shallow copy (`[...this._history]`) ama timestamp string olduğu için yeterli; yine de tip imzasında readonly yok | 🟩 Düşük | Tüketicinin döndüğü Map'e mutate riski yok ama açık değil. | API hijenik. |

---

## 4. Dead Code Candidates

| Sembol | Grep kanıtı | Sonuç |
|--------|-------------|-------|
| `getAllWorkerStates` | `src/` içinde sadece kendi tanımı + `worker.ts` re-export; **0 caller**. | **Adaylar listesinde** — tests dahil çağrılmıyor olabilir; doğrulama Sprint 188 follow-up'ta yapılmalı (`tests/agents/worker-lifecycle.test.ts` incelenecek). |
| `removeWorkerStateMachine` | aynı şekilde sadece tanım + re-export. | Adaylar listesinde. |
| `WorkerStateMachine.forceState` | sadece sınıf içi `transition` ile beraber tanım; harici çağrı bulunmadı. | Adaylar — kaldırılabilir veya `@deprecated`. |
| `aggregateFeedbackLoops` | re-export edilir, sprint-reporter “string match” seviyesinde — gerçek import yok. | Olası ölü kod; reporter pipeline’ında bağlanmamış olabilir. |
| `_atomicWrite` (worker.ts l.28 aliased import) | Sadece import edilir, gövdede kullanıldığına dair grep ipucu yok (sadece re-export bloğu). | `worker.ts` audit'inde detaylı incelenmeli. |

Grep komutları (uygulanan):
- `grep -rn "getAllWorkerStates\|removeWorkerStateMachine\|forceState\|aggregateFeedbackLoops" src/` → yalnızca tanım + re-export satırları.
- `grep -rn "from '.*worker-lifecycle" src/ tests/` → yalnızca `worker.ts`, `tests/agents/worker-lifecycle.test.ts`, `tests/docker/timeout-with-work.test.ts`.

---

## 5. Documentation Gaps

| Konu | Durum | Öneri |
|------|-------|-------|
| Modül başlığı (l.1-7) | ✓ Mevcut; Sprint 144 split notu var. | — |
| `atomicWriteFileSync` JSDoc | ✓ Detaylı (tmp→fsync→rename, Docker exit-137 motivasyonu). | Dir-fsync limitini açıklayan not eklenmeli. |
| `_workerStates` global | ✗ Yorum yok. | Yaşam süresi (process lifetime), test temizleme zorunluluğu belirtilmeli. |
| `WorkerStateMachine.forceState` | ✗ JSDoc yok. | Niyet (“escape hatch / debug only”) ve uyarı eklenmeli. |
| `computeVerifyDelta` formülü | ◐ Kısmi (`completionRatio = filesRatio*0.6 + testRatio*0.4`). | Katsayı seçim mantığı (ağırlıkların kaynağı) belgelenmeli. |
| `expectedFilesChangedCount = 0` / undefined davranışı | ✗ Açıklama yok. | Fallback'in bias yaratabileceği uyarısı eklenmeli. |
| `VALID_TRANSITIONS` ASCII diyagramı (l.430-438) | ✓ Header'da var ama düz metin. | İsteğe bağlı: `docs/reference/` altına ayrı diagram. |
| `DONE_SET` / `PARTIAL_WORK_SET` | ◐ Yorumlar mevcut (`Sprint 145` etiketi). | Set içeriklerinin `TaskResult['selfAssessment']` ile senkronizasyon gereği eklenmeli. |
| `registerSigtermHandler` opt-in mekaniği | ✗ Modül-load side-effect olduğu açık değil. | Doc + test-mode bypass yöntemi eklenmeli. |

---

## 6. ADR Compliance Check

| ADR | Başlık | Uyum | Kanıt / Not |
|-----|--------|------|-------------|
| ADR-001 | TypeScript + ESM | ✓ | `.ts` + ESM import (`from 'node:fs'`, `import type`). |
| ADR-002 | Node16 Module Resolution | ✓ | Tüm relative import'lar `.js` uzantılı (`../core/constants.js`). |
| ADR-006 | spawnSync Security Pattern | ✱ N/A | Bu dosyada çocuk süreç spawn'ı yok. |
| ADR-008 | Brain Merkezi Import — Tek Yönlü Bağımlılık | ✓ | İmportlar yalnızca `core/`; ters bağımlılık yok. |
| ADR-009 | DEBT.md Markdown Tablo Formatı | ✱ N/A | Modülün direkt sorumluluğu değil. |
| ADR-027 | Hybrid Spawn Backend | ✓ | Docker backend SIGTERM/atomic-write tasarımı ile uyumlu (5-sprint fix motivasyonu açıkça belgelenmiş). |
| ADR-035 | Verification Protocol Standard | ✓ | Feedback loop + verify-delta primitiv'leri sağlanır; ADR'nin pipeline beklentilerine uyar. |
| ADR-037 | RBAC V1.0 (advisory) | ✓ | Worker tarafı self-flag mekaniği; finalize bloke etmez, ADR-037 V1.0 “soft” semantiği ile uyumlu. |
| ADR-038 | Dead Code Disposition (Sprint 139 audit) | ◐ | `forceState`, `getAllWorkerStates`, `removeWorkerStateMachine` ölü kod adayı — yeniden değerlendirme gerekli. |
| ADR-046 | Brain Self-Update Hook | ✱ N/A | Dosya self-update host'u değil. |

---

## 7. Refactor Recommendations

1. **Modül-load side-effect kaldırılsın.** `registerSigtermHandler()` otomatik çağrısı (l.182) yerine `initWorkerSigtermHandler()` adlı **opt-in** initializer; worker entrypoint (örn. `src/agents/worker.ts` boot fazı) açıkça çağırsın. Test'lerde re-import sırasında ek listener leak'i ve `process.exit(0)` riskini azaltır.
2. **Global registry → singleton sınıfı.** `_workerStates` Map'ini `WorkerStateRegistry` sınıfına saralım; DI kabul eden bir fabrika fonksiyonu test'lerde fresh instance alabilsin. `clearWorkerStateRegistry` artık bir test-only API'ye geçer.
3. **`forceState` kaldırılsın veya `@deprecated`.** Kullanıcısı yok; bypass mekanizması — invariant koruma açısından silmek lehte.
4. **`computeVerifyDelta` ağırlıkları konfigüre olsun.** `.deckent/config.json` → `verify_delta: { weights: { files: 0.6, tests: 0.4 }, thresholds: { done: 0.8, no_go: 0.5 } }`. Audit-only task'lar (test üretmeyen) için `weights.tests = 0` override edilebilir. Sprint 186 pilot ile en ilgili optimizasyon.
5. **`expectedFilesChangedCount` fallback fix.** Argüman undefined ise `completionRatio` her zaman 1 olmasın; ya zorunlu parametre yap, ya `null` durumunda `null` döndür (caller fallback yorumlasın).
6. **`atomicWriteFileSync` POSIX iyileştirmesi.** Rename sonrası parent directory `open(O_DIRECTORY) → fsync` aşaması ekle; cross-platform şart koşulup koşulmayacağı tartışılmalı.
7. **`finalizeHeartbeatOnShutdown` hata telemetrisi.** Catch bloğunda `writeEvent` (event-stream) ile DECKENT→AUDITOR:WARN düşür; sessiz `false` yerine forensic trace.
8. **Set ↔ tip eşitliği.** `DONE_SET` ve `PARTIAL_WORK_SET` içerikleri `Extract<TaskResult['selfAssessment'], 'DONE' | 'GO_WITH_TECH_DEBT' | 'TIMEOUT_WITH_WORK'>` tipi üzerinden türetilsin (compile-time drift koruması).
9. **Modül-içi sorumluluk bölünmesi (uzun vade).** `worker-lifecycle.ts` 579 LoC ve dört farklı sorumluluk taşır:
   - `worker-atomic-io.ts` (l.43-159)
   - `worker-feedback-loop.ts` (l.184-292)
   - `worker-verify-delta.ts` (l.294-426)
   - `worker-state-machine.ts` (l.428-578)
   Sprint 188 dataset olarak değerlendirilmeli; ADR-024 / 026 God Object split serisinin doğal devamı.
10. **Sınıf invariant: history append paylaşım.** `WorkerStateMachine.toJSON().history` zaten kopya ama public `history` getter'ı doğrudan `_history` döndürür (`readonly` yoluyla salt-okunur tip, runtime kopya yok). Defensive copy önerilir.

---

## 8. Sprint 188 Follow-up Items

1. **F1 — Verify-delta konfigürasyon parametreleri.** ADR adayı + config schema güncellemesi (öneri #4 implementation).
2. **F2 — Dead-code temizliği.** `forceState`, `getAllWorkerStates`, `removeWorkerStateMachine`, olası `aggregateFeedbackLoops` kullanım denetimi; gerçekten 0 caller ise ADR-038 prosedürüyle kaldır.
3. **F3 — Modül-load side-effect opt-in hale getirme.** SIGTERM handler kayıt sırasını worker boot'a taşı; test ortamında sızıntı önlenir.
4. **F4 — POSIX dir-fsync** atomic-write iyileştirmesi (öneri #6); Docker exit-137 regresyon test takımına yeni kenar durumu ekle.
5. **F5 — Honest-assessment fallback fix** (öneri #5); audit-only task'larda DONE bias riski ortadan kalkar — Sprint 186 pilot sonuç verisiyle valide et.
6. **F6 — Telemetri kanalı.** `finalizeHeartbeatOnShutdown` & SIGTERM handler içinden event-stream'e structured log; forensic visibility iyileşir.
7. **F7 — God Object split (long-tail).** Dosyayı 4 alt-modüle bölme proposal'ı; Sprint 188 mimari spike olarak değerlendir (ADR-024 / 026 devamı).
8. **F8 — `WorkerStateMachine` ve registry için cross-test isolation testleri.** `clearWorkerStateRegistry` zorunlu çağrı kontrolü `afterEach` hook'larında.

---

## 9. Summary

`worker-lifecycle.ts` Sprint 144 God Object split'ten doğmuş, **4 farklı sorumluluk** (atomic IO, verify-delta, state machine, feedback telemetry) tek modülde toplayan kritik bir worker yardımcı dosyasıdır. Sprint 139'da çözülen 5-sprint Docker SIGKILL bug'ının (`atomicWriteFileSync` + `finalizeHeartbeatOnShutdown`) çekirdeği burada yaşar. ADR-001/002/008/027/035 ile uyumludur ve ADR-037 V1.0 “advisory/soft” semantiği içinde kalır.

En kritik teknik borç noktaları: (a) `computeVerifyDelta` `expectedFilesChangedCount` undefined olduğunda DONE'a doğru sapan completion oranı (Risk #5) — audit-only sprint'lerinde honest-assessment etkisi; (b) modül-load side-effect olarak SIGTERM listener kayıt (Risk #1) — test izolasyon riski; (c) global mutable `_workerStates` Map (Risk #2). Bu üç madde Sprint 188'in ilk dalgasında ele alınmalıdır. Dosyanın ayrıca üç ölü kod adayı (`forceState`, `getAllWorkerStates`, `removeWorkerStateMachine`) ve uzun vadeli **4 alt-modüle bölme** önerisi vardır.

**Genel sağlık değerlendirmesi:** 🟨 Orta-iyi. Mimari rolü net, JSDoc kapsayıcı, ADR uyumu güçlü; ancak konfigüre edilemeyen heuristik sabitler, side-effect, dead-code adayları ve sorumluluk sınırı bulanıklığı **planlı bir refactor turunu** Sprint 188 için olgunlaştırmıştır.
