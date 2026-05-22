# Sprint 188 W1-T04 — `src/orchestra/` Sprint Lifecycle Health Audit

**Task:** 188-004 • **Agent:** doc-writer • **Mode:** ANALYSIS-ONLY (no source change)
**Scope:** `src/orchestra/` modülleri, 8 faz akışı, ADR-008 import sınırı taraması, GO/NO_GO değerlendirme zinciri, debt-manager + sprint-reporter Memory V2 DB-first uyumu.

Bu denetim hiçbir `src/`, `docs/`, `scripts/` dosyasını değiştirmedi; yalnızca bu rapor (`docs/audits/sprint-188/orchestra-health.md`) yazıldı.

---

## 1. Modül Envanteri ve Boyut

`ls src/orchestra/` çıktısı → **81 modül + 3 alt dizin** (`decision-steps/`, `doc-updaters/`, `managed-docs/`).

**Drift bulgusu:** `CLAUDE.md` ve `IDENTITY.md` "76 modül" diyor; gerçek sayı 81 (alt dizinleri saymadan). Sprint 072/076'da ADR-024 ve ADR-026 god-object split sonrası sprint-* modülleri sürekli arttı (Sprint 134 4-way split + Sprint 136 sprint-controller slim + Sprint 145+ event-bus / ipc-registry / sprint-checkpoint / sprint-state-tracker eklendi). Doküman sayıları "Sprint-N snapshot" niteliğinde, pin edilmedi (ADR-024 notunda kabul edilmiş: "drift-prone").

Anahtar modüllerin LoC yoğunluğu:

| Modül | LoC | Rol |
|---|---|---|
| `result-evaluator.ts` | 2085 | GO/NO_GO/TECH_DEBT + rubric scoring + cascade decision |
| `sprint-phases.ts` | 1360 | 7 faz fonksiyonu (PLAN, SPAWN, EVALUATE, FIX, RETRO, DECAY, CLEANUP) |
| `task-builder.ts` | 1161 | Task creation + DIRECTIVES parse + worker prompt build |
| `sprint-controller.ts` | 984 | Thin orchestration + `runSprint()` |
| `authority-enforcer.ts` | 673 | ADR-006/008/010 runtime soft enforce |
| `planner.ts` | 671 | AI planlama (Zod + provider) |
| `debt-manager.ts` | 607 | Debt lifecycle, decay, escalation |
| `task-router.ts` | 318 | Provider/agent/skill routing |
| `quality-assessor.ts` | 210 | Multi-dimensional quality score |
| `sprint-reporter.ts` | 173 | **Pure barrel** (4-way split sonrası) |
| `brain.ts` | 53 | **Slim re-export layer** (ADR-026 sonrası) |

`brain.ts` ve `sprint-reporter.ts` artık ince barrel; mantık alt modüllerde. ✓

---

## 2. 8 Fazlı Sprint Yaşam Döngüsü Akışı — Kanıt Haritası

`runSprint()` (`sprint-controller.ts:533-984`) fazlarda şu kancaları çağırır:

| Faz | Çağrı yeri (sprint-controller.ts) | Hedef (sprint-phases.ts) | Durum |
|---|---|---|---|
| PLAN | `:648` `runPlanPhase()` | `:419` | ✓ Wire'lı |
| SPAWN | `:748` `runSpawnPhase()` | `:526` | ✓ Wire'lı (WAVE_BUILD gömülü) |
| EXECUTE | `:763` `waitForResults()` | result-collector.ts | ✓ Wire'lı |
| EVALUATE | `:878` `runEvaluatePhase()` | `:705` | ✓ Wire'lı |
| FIX | `:933` `runFixPhase()` | `:1074` | ✓ Wire'lı |
| RETRO | `:942` `runRetroPhase()` | `:1218` (→ `finalizeSprint`) | ✓ Wire'lı |
| DECAY | `:946` `emitPhaseChange(RETRO, DECAY, …)` | _runDecayPhase çağrılmıyor_ | ⚠ Ghost faz (aşağıda detay) |
| CLEANUP | `:949` `runCleanupPhase()` | `:1329` | ✓ Wire'lı |

8 faz `SprintPhase` enum'unda canlı, hepsi `emitPhaseChange` ile nervous-system'e duyuruluyor.

---

## 3. WAVE_BUILD ve DECAY Faz-Akış Tutarsızlıkları

**WAVE_BUILD (Phase 2a)** — `docs/reference/api-surface.md`'de listelenmiş ama `SprintPhase` enum'unda DEĞIL. Gerçek dağıtım yeri: `sprint-spawner.ts:299` — `config.dependency_pipeline_enabled` true ise `spawnWorkers()` içine gömülü olarak Kahn topolojik sıralama yapılıyor (`dependency-scheduler.ts:166`). `sprint-controller.ts`'de ayrı faz çağrısı yok. Bu **doc↔kod drift**: api-surface.md "WAVE_BUILD" diye bir faz duyuruyor; kod tabanında resmi bir `runWaveBuildPhase` yok.

**DECAY** — `sprint-phases.ts:1315`'de `runDecayPhase(projectRoot, sprintId)` **export edilmiş ama hiçbir yerden import edilmiyor** (kanıt: `grep -rn "runDecayPhase" src/` → yalnızca tanım satırları). Gerçek decay çağrısı `sprint-finalizer.ts:707/709`'da `runDecay(projectRoot, sprint.id, …)` ile yapılıyor. `sprint-controller.ts:946`'da yalnızca `emitPhaseChange(RETRO, DECAY)` event'i atılıyor — eylem `finalizeSprint`'in içinde gömülü.

**Sonuç:** `runDecayPhase` orphan export; bir adet ölü kod.

---

## 4. Planlama Zinciri (planner / task-builder / task-router)

`callBrainPlanner` zinciri:
- `sprint-planner.ts:53` → `import { callBrainPlanner } from './planner.js'` (orchestra→orchestra ✓)
- `planner.ts:1-15` — **YALNIZCA `core/` ve Node built-in import** (`node:child_process`, `node:fs`, `zod`, `core/types`, `core/constants`, `core/provider`, `core/utils`). ADR-008 "planner only core/" kuralına %100 uygun.
- `task-builder.ts:1-22` — `core/types`, `core/routing-types`, `core/memory-store`, `core/memory-query`, `core/token-counter`, `core/constants`, + orchestra/internal (`model-selector`, `adr-selector`, `prompt-god-template`, `prompt-token-optimizer`). Bu **orchestra→orchestra**, ADR-008 metnindeki "Brain merkezi import" kuralının ihlali değil (brain.ts ince barrel; alt modüller arası import ADR-024/026 split sonrası kabul edilmiş).
- `task-router.ts:1-12` — `core/types`, `core/task-types`, `core/config-types` + orchestra internal (`timeout-estimator`, `event-stream`).

Routing kullanımı:
- V1 `routeTask` (`task-router.ts:157`) → `sprint-spawner.ts:733`'de aktif.
- V2 `routeTaskV2` (`core/routing-engine.ts:113`) → `sprint-planner.ts:475` + `mid-sprint-adapter.ts:151` + `core/index.ts:34` export.

**Bulgu:** V1 ve V2 birlikte canlı; ADR-028 "Decision-Engine V1 → V2 Routing Migration" accepted ama V1 hâlâ spawn yolunda çalışıyor (eski codepath dormant değil). Bu tasarımla uyumlu (geçiş katmanı), ancak `task-router.ts` "ölü" sınıfa düşmüyor.

---

## 5. Değerlendirme Zinciri (result-evaluator / quality-assessor)

GO/NO_GO/TECH_DEBT karar akışı:

1. `sprint-phases.ts:783` — `evaluateWithRubric(result, task)` (`result-evaluator.ts:1087`) → `toTaskEvaluation()` ile `TaskEvaluation` enum'a maplenir.
2. `result-evaluator.ts:87` — eski yol `evaluateResult()`, hâlâ public (`brain.ts:21` re-export, CLI finalize tarafından kullanılıyor).
3. `result-evaluator.ts:1225` — `applyTechDebtDowngrade(...)` ile DONE→TECH_DEBT→NO_GO downgrade.
4. `mid-sprint-adapter.ts` üzerinden `reconcileSpuriousNoGo` + `reconcileRubricNoGo` çağrılıyor (`result-evaluator.ts:15`).
5. `quality-assessor.ts:73` — `assessQuality(task, result, evaluation)` çok-boyutlu skoru üretir; iki çağrı noktası: `sprint-finalizer.ts:771` (DB log için) + `sprint-retro-writer.ts:220` (retrospektif tablosu).

**Honesty gate** (`sprint-phases.ts:84-96 + 783-791`) → `enforceHonestResultGate` + `writeHonestSentinelResult` + `isStubResult` (Sprint 165 Bug X). Stub `.result` (linesAdded=0 + testsPassed=false + selfAssessment=DONE) → NO_GO'a kilitlenir; `reconcileRubricNoGo` bu durumu re-promote edemez (`sprint-phases.ts:789`).

**god-object riski:** `result-evaluator.ts` 2085 LoC + 27 export. Eski `sprint-controller.ts` 1894 LoC'tan büyük; bir sonraki split adayı (ADR-026 ruhuyla uyumlu olur).

---

## 6. ADR-008 Import Sınırı Taraması

**Resmi ADR-008 metni (orijinal grep):** `grep -r "from.*brain" src/orchestra/tmux.ts src/monitor/auditor.ts src/agents/worker.ts` → **0 sonuç**. ✓ Orijinal madde geçti.

**Refined rule (authority-enforcer.ts:496-524):** "core/ → orchestra/ import yasak".

`grep -rln "from ['\"].*\/orchestra\/" src/core/` → **1 dosya**:

- `src/core/notify.ts:17` → `import { eventBus } from '../orchestra/event-bus.js';` **← ADR-008 İHLAL**

Bu, runtime'da `enforceAdrCompliance` çağrıldığında "core/ module imports from orchestra/" hatası üretir; ancak mod **soft** olduğundan (Sprint 139, `authority-enforcer.ts:241/272/282/290…` → `mode: 'soft'`) sprint'i bloke etmez, yalnızca warn + event yayınlar. ADR-008 + ADR-037 V1.0 advisory/soft "hard-flip post-GA V2" politikasıyla uyumlu — düzeltme gerekli ama acil değil. Amendment önerisi: `notify.ts`'ten event-bus import'unu kaldırıp dependency-inversion ile `core/notify-registry.ts` üzerinden adapter pattern kullanmak.

**Refined rule dışında kalan import yönleri** (ADR-008 metni "Brain merkezi import"u kapsıyor ama enforcer yalnızca core→orchestra'yı tarar):
- `src/agents/worker.ts:26-27` → `orchestra/authority-enforcer`, `orchestra/event-stream`
- `src/agents/auditor.ts:12` → `orchestra/authority-enforcer`
- `src/agents/worker-ipc.ts:369` → `orchestra/ipc-registry`
- `src/monitor/auditor.ts:26-28` → `orchestra/event-stream`, `orchestra/authority-enforcer`
- `src/monitor/alert-emitter.ts:14` → `orchestra/event-stream`
- `src/providers/claude.ts:15` → `orchestra/tmux`
- `src/connectors/incoming-router.ts:13-15` → `orchestra/event-bus`, `orchestra/event-stream`
- `src/nervous/observer.ts:20` → `orchestra/event-bus`
- `src/api/server.ts:24,29` → `orchestra/tmux`, `orchestra/brain`
- `src/cli/entry.ts:5-6` → `orchestra/sprint-controller`, `orchestra/tmux`

Bu importlar enforcer kapsamında değil — ADR-008'in özgün ifadesi "diğer modüller brain'i import etmez" iken refined kural sadece core/'u koruyor. Doc-↔-enforcer drift: ADR-008 metni mevcut enforce davranışından daha katı.

---

## 7. Döngüsel Bağımlılık (Circular Dependency)

**Tek bilinçli circular:** `sprint-controller.ts` ↔ `sprint-phases.ts`.

Kanıt:
- `sprint-controller.ts:60-63` → `import { runPlanPhase, runSpawnPhase, runEvaluatePhase, runRollbackCheck, runFixPhase, runRetroPhase, runCleanupPhase } from './sprint-phases.js';`
- `sprint-phases.ts:128-139` → `import { BrainError, readContext, planSprint, writeSprintState, spawnWorkers, buildSpawnRetryHint, waitForResults, finalizeSprint, cleanup } from './sprint-controller.js';`

`sprint-phases.ts:7-9` başında dokümante edilmiş: _"NOTE: This module and sprint-controller.ts form a safe circular dependency. All cross-module references are inside function bodies (deferred execution), never at module initialization time."_ ✓ Kabul edilmiş.

Diğer döngü adayları taraması: `grep -rn "from.*brain\.js\|from.*sprint-controller\.js" src/orchestra/` → yalnızca `brain.ts` ↔ `sprint-controller.ts` (re-export only, init-time safe), `sprint-phases.ts` ↔ `sprint-controller.ts` (deferred), `index.ts` → `brain.ts` (one-way). Başka kötücül döngü tespit edilmedi.

---

## 8. Deprecated / Orphan / Ölü Kod Adayları

1. **`decision-engine.ts:1-8`** — `@deprecated since Sprint 066`. Yorum diyor ki "Kept as reference implementation. Do not delete without ADR update." Ama:
   - `sprint-spawner.ts:73-74` → `import { handleScopeCollision, type ScopeCollisionPayload } from './decision-engine.js';` (aktif çağrı)
   - `sprint-controller.ts:261-262` → aynı sembolleri import ediyor.
   - `decision-replay.ts:14` → `DecisionOrchestrator` type kullanıyor (test code).
   - `nervous/bootstrap.ts:16` → `DecisionEngine` (nervous system yarı-wire).
   
   **Sonuç:** Yorum yanıltıcı. Dosya kısmen canlı (`handleScopeCollision` pure-fn aktif), `DecisionOrchestrator` ise sadece testten kullanılıyor. "Deprecated" etiketi modül başına asılı ama tek bir export hâlâ production wire'lı.

2. **`runDecayPhase` (sprint-phases.ts:1315)** — sıfır caller (§3'te kanıt). Saf orphan export.

3. **`spawn-backend-mock.ts`** — yalnızca testlerde kullanılıyor (`spawn-backend.ts` ve `spawn-backend-docker.ts` production). Test fixture niteliğinde, mevcut yapıyla uyumlu.

4. **Wide barrel pattern uyumsuzlukları:** `brain.ts` 53 LoC pure re-export iken `sprint-controller.ts` 984 LoC. ADR-024/026 split tamamlandı; brain.ts içeriği sıfırlanmış ama dosya hâlâ var. Tüketicilerin geri uyumluluğu için gerekli (ADR-013 adapter pattern).

---

## 9. Memory V2 (DB-First) Tutarlılığı — debt-manager / sprint-reporter

`memory.db` SQLite single-source-of-truth doğrulaması:

**debt-manager.ts**
- `:16` `import { MemoryStore } from '../core/memory-store.js'` ✓
- `:26-32` `getMemoryStore()` — DB yoksa `null` döner (graceful degradation).
- `:217 / :407 / :438 / :472 / :534 / :575` — debt CRUD tamamen `store.insert/upsert/getByType('debt')` üzerinden.
- `writeFileSync` çağrıları (`:320, :389`) yalnızca `.tasks/task-*.json` (fix task üretimi) için, `DEBT.md`'ye değil. ✓
- `:461-517` yorumları "Legacy DEBT.md kaldırıldı, archive yalnızca history" diyor — DB-first uyumlu.

**sprint-retro-writer.ts**
- `:12` MemoryStore import ✓
- `:446-451` yorum: _"the legacy `.brain/RETRO.md` + `.brain/MEMORY.md` file writers (and the RETRO.md archive copy) were removed — the retro and the per-sprint learnings are persisted only to memory.db below."_ ✓
- `:475-518` `store.upsert({ type: 'sprint', ... })` + `store.upsert({ type: 'retro' })` + `store.insert({ type: 'memory' })` — canonical ID `sprint-log-${sprintNum}` (Sprint 168 BUG-DD fix).

**sprint-docs-updater.ts**
- `:118` PROJECT-IDENTITY.md superseded by memory.db `identity` entry ✓
- `:122-132` `autoResolveDebt()` DB-first: "instead of string-mangling rows in the (now removed) .brain/DEBT.md".
- `:239` "memory.db `pattern` entries by the auditor (detectPatterns)" — pattern recording da DB-first.

**sprint-reporter.ts** (`:1-106`) — pure barrel; gerçek yazımı 4 modülde, hepsi DB-first.

Sonuç: Memory V2 geçişi (B6-B14, son commit `f07de582 docs(design): full DB-to-Markdown export spec`) orchestra/ tarafında temiz; `.md` yazımları sadece `.brain/exports/` altına auto-generated.

---

## 10. Worker Grace Period ve Panic Guard

`sprint-controller.ts:782-864` — EXECUTE sonrası grace-period loop:

1. `.hb` var ama `.result` yok olan task'lar 5 dakika beklenir (`GRACE_PERIOD_MS = 5 * 60 * 1000`, `:798`).
2. Bekleme sonrası `.result` hâlâ yoksa: `PanicGuard.evaluate(...)` çağrılır (`:809-817`).
3. `decision === 'BLOCK'` → synthetic NO_GO `.result` yazılır, worker kill ETMEZ (`:819-835`).
4. Kullanıcı onayı / `force` flag varsa kill cascade: `spawnBackend.kill(task.id)` veya `tmux.killWorker(task.id)` (`:837-860`).

Bu, ADR-046 Brain Self-Update Hook ve Sprint 165 Bug X+Y serilerinin sonucu; user-explicit override olmadan worker katledilmiyor. Memory'deki "deckent_kill approval required" feedback'i ile uyumlu. ✓

---

## 11. State Recovery ve Checkpoint

`sprint-controller.ts:585-627` — Brain restart sonrası resume yolu:
- `readSprintState(projectRoot)` ile önceki `sprint-state.json` aranır.
- `restoreSprintFromCheckpoint(projectRoot, prevSprintId)` → `sprint-checkpoint.ts`.
- `recovery.action === 'complete'` → sprint zaten bitmiş; lock release + return.
- `recovery.action === 'resume-evaluate'` → PLAN/SPAWN/EXECUTE atlanır, EVALUATE'ten devam eder.

Phase-transition checkpoint'leri (`writePhaseCheckpoint`) PLAN/SPAWN/EXECUTE/EVALUATE/FIX sonunda yazılıyor (`:727, :754, :867, :927, :936`). ADR-043 Brain Crash Recovery Protocol implementation noktası. ✓

---

## 12. Sprint Lock ve PID Yönetimi

- `acquireSprintLock(projectRoot, sprintLockId)` (`:571`) — başka sprint çalışıyorsa `BrainError` fırlatır.
- `writePid(projectRoot, sprint.id)` + `clearPid` (`:642, :674, :703, :968`) — PID dosyası `.deckent/pids/${sprintId}.pid`.
- `writeStateSnapshot` her 30 saniyede bir snapshot (`:699`) → `sprint-pid-manager.ts`.
- `beforeExit` handler kalan snapshot'ı yazar + PID temizler (`:701-705`).
- Multi-IDE locking (`core/multi-ide.ts`) → ADR-034 Multi-Project Isolation uyumlu.

---

## 13. Nervous System Wire (ADR-040)

`sprint-controller.ts:583` — `initNervousSystemForSprint(config, projectRoot)` sprint başında çağrılır, `finally` bloğunda (`:982`) `disposeNervousSystem(nervous)` ile her exit path'inde teardown garantili (success, abort, throw). Default-off (`nervous_system.enabled !== true` → null döner). Event emitters (`emitPhaseChange`, `emitSprintEvent`) `:730, :757, :870, :931, :946, :952, :959, :601, :610` noktalarında. ✓ ADR-040 lifecycle wire mevcut.

---

## 14. Test Kapsamı (Hızlı Sayım)

`ls tests/orchestra/ | wc -l` → **207 test dosyası**. Bu, kod tabanının en yoğun test edilen alt-modülü (CLAUDE.md "16,697 descriptors"un büyük kısmı buradan). Sprint 188 audit-only kapsam dışı, ancak orchestra/ test piramidinin sağlam olduğunu gösteriyor.

Detaylı pass/fail kategorisi W2-T12 (188-012 ADR + test sağlığı) tarafına bırakıldı.

---

## Özet

`src/orchestra/` (81 modül + 3 alt dizin) sprint yaşam döngüsü **işlevsel olarak sağlam**: 8 faz akışı `sprint-controller.runSprint()` üzerinden eksiksiz wire'lı, ADR-024/026 god-object split tamamlandı (`brain.ts` 53 LoC ince barrel), Memory V2 DB-first geçişi temiz (`.md` yazımı sadece export'a), grace-period + panic-guard worker kill cascade ADR-043/046 ile uyumlu.

**Düşük-riskli drift bulguları:**
1. CLAUDE.md/IDENTITY.md "76 modül" → gerçek 81 (doc drift; W2-T11'e devredildi).
2. `WAVE_BUILD` api-surface.md'de faz olarak listelenmiş; kodda discrete `SprintPhase` enum'unda yok, `spawnWorkers` içine gömülü (api-surface.md güncellemesi adayı).
3. `runDecayPhase` (`sprint-phases.ts:1315`) sıfır caller'lı orphan export — DECAY `finalizeSprint` içinde yapılıyor.
4. `decision-engine.ts:1-8` `@deprecated` etiketi yanıltıcı — `handleScopeCollision` hâlâ production'da (sprint-spawner.ts:73, sprint-controller.ts:261).
5. `result-evaluator.ts` 2085 LoC — eski sprint-controller.ts'ten büyük; gelecek split adayı.

**Tek katı ADR ihlali:**
- `src/core/notify.ts:17` → `import { eventBus } from '../orchestra/event-bus.js'` — ADR-008 refined rule (core→orchestra) çiğneniyor. authority-enforcer her sprint'te warn + event yayınlar (soft mode). Amendment önerisi: notify.ts'ten event-bus import'unu kaldır, `core/notify-registry.ts` üzerinden dependency-inversion uygula.

**ADR uyum-durumu:**
- ADR-008 (Brain merkezi import): Orijinal `from.*brain` grep ✓ temiz; refined "core→orchestra" rule 1 ihlal (`core/notify.ts:17`); enforcer kapsamı ADR metninden dar (agents/monitor/api → orchestra imports izinli).
- ADR-024 (sprint-controller split): ✓ Sprint 072 first step + Sprint 134/136 devamı.
- ADR-026 (god-object split Faz 1-3): ✓ `sprint-phases.ts`, `sprint-utils.ts`, `result-collector.ts` mevcut; `brain.ts` ince barrel.

## Sprint 189 Follow-up

| Önerilen task | Tip | Effort | Açıklama |
|---|---|---|---|
| `core/notify.ts:17` ADR-008 fix | code | low | event-bus import'unu kaldır, `notify-registry.ts` üzerinden dispatcher injection |
| `runDecayPhase` orphan export sil | code | low | `sprint-phases.ts:1315` sıfır-caller; ya silinsin ya da `runRetroPhase` içine çağrılsın |
| `decision-engine.ts` deprecation netleştir | docs | low | `handleScopeCollision` ayrı dosyaya çıkar veya `@deprecated` etiketini kaldır |
| `api-surface.md` WAVE_BUILD revize | docs | low | "embedded within SPAWN" notu ekle veya formal phase enum'una al |
| `CLAUDE.md` modül sayısı senkron | docs | low | "76 modül" → 81 + alt dizinler; ADR-024 not'unun "drift-prone" uyarısıyla uyum |
| `result-evaluator.ts` split planı | architecture | high | 2085 LoC → eval-core / rubric-scorer / failure-cascade ayrımı; ADR-026 ruhu |
| ADR-008 enforcer kapsamı genişlet | architecture | normal | agents/monitor/api→orchestra için de "Brain merkezi" rule ekle (V2 hard-flip planına dahil et) |
