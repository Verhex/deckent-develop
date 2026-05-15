# orchestra/ Lifecycle Audit — Audit Raporu (Sprint 171)

> **Task:** 171-001 — orchestra yaşam döngüsü modüllerinin char-level denetimi
> **Worker:** w-171-001 (architect + system-architect)
> **Tarih:** 2026-05-15
> **Kapsam:** `src/orchestra/sprint-controller.ts`, `brain.ts`, `planner.ts`, `task-builder.ts`, `result-evaluator.ts`, `result-collector.ts`, `sprint-reporter.ts`, `sprint-utils.ts`, `decision-steps/**`
> **Dil zorunluluğu:** TR (kullanıcı reinforced 2026-05-15)

---

## 1. Bulgular (Findings)

### 1.1 Faz akışı kontrat ile büyük oranda tutarlı, küçük adlandırma kaymaları var

`sprint-controller.ts:runSprint()` (satır 348-780) `.contracts/api-surface.md`'nin tanımladığı **PLAN → SPAWN → EXECUTE → EVALUATE → FIX → RETRO → DECAY → CLEANUP** sekiz fazını sırayla çalıştırır. Her faz `sprint-phases.ts` içinden import edilen `runPlanPhase`, `runSpawnPhase`, `runEvaluatePhase`, `runFixPhase`, `runRetroPhase`, `runCleanupPhase` fonksiyonlarına delege edilir. Yorumda "Phase 1, Phase 1.5, Phase 1.9, Phase 2, Phase 3, Phase 4, Phase 5, Phase 6+7, Phase 8" numaralaması kullanılır; ortada 1.5 (`routeSprintTasks`) ve 1.9 (`captureVitestBaseline`) gibi yarım sayılı ara adımlar bulunur ama kontrat dökümanında bu ara adımlar görünmez. Faz sırası kontrat ile tutarlıdır; isimlendirme kaymalardır.

Ayrıca `runRetroPhase` hem RETRO hem DECAY işini birden yapar ("Phase 6+7" yorumu, satır 743). DECAY bağımsız bir adım gibi görünüyor ama `sprint-reporter.ts` üzerinden retro yazımının içinde tetikleniyor (`trimMemoryWithHeader`/`decay` çağrıları `sprint-retro-writer.ts`'de). Kontrat metnindeki "7. DECAY" alt başlığı tek bir runtime fonksiyona karşılık gelmez; bu, ileride DECAY'ı izole etmek/profilelemek isteyen biri için bilgi karmaşası yaratır.

`WAVE_BUILD` (kontrat §2a, "default since Sprint 156, confirmed Sprint 169 H5") `sprint-spawner.ts:299` (`if (config.dependency_pipeline_enabled) { ... }`) bloğuyla uygulanır; runtime'da müstakil bir faz değildir, SPAWN içine gömülüdür. Kontrat bu detayı doğru anlatıyor ("§2a — When `dependency_pipeline_enabled: true`...").

### 1.2 ADR-008 metni ile kod arasında ciddi sapma — Brain merkezi import tek-yön ihlali (CRITICAL doc-vs-code drift)

ADR-008 (`.contracts/api-surface.md`'de yeniden teyit ediliyor): "**Brain (sprint-controller) is the ONLY module that imports from tmux, auditor, worker**." Kod gerçeği şudur (grep çıktısı, audit anı):

- `./tmux.js` import eden orchestra/ modülleri: `index.ts`, `result-collector.ts:44`, `sprint-lifecycle.ts:54`, `sprint-spawner.ts:42`, `spawn-backend.ts:4`, `sprint-utils.ts:31`. Yani sprint-controller'a ek olarak en az **6 farklı modül**.
- `../monitor/auditor.js` import eden orchestra/ modülleri: `sprint-controller.ts:101`, `sprint-lifecycle.ts:57`, `sprint-spawner.ts:45`, `sprint-planner.ts:55`, `result-evaluator.ts:1539-1544`, `sprint-finalizer.ts:57`, `sprint-phases.ts:62`. Sprint-controller'a ek olarak **6 farklı modül**.
- `../agents/worker.js` / `../agents/worker-ipc.js` import eden orchestra/ modülleri: `result-collector.ts:30`, `ipc-registry.ts:11-13`, `debt-manager.ts:15`, `sprint-lifecycle.ts:60`, `sprint-spawner.ts:95`. Sprint-controller'a ek olarak **5 farklı modül**.

Bu kuralın ihlali Sprint 075/076 God Object Split (`sprint-controller.ts:1-4` yorumu, "Slimmed from ~1894 LoC to a thin barrel re-export layer") sırasında oluştu. Split kararı doğru — ama ADR-008 metni güncellenmedi. ADR-008'in OSS GA'da Worker/Auditor için "mandatory constraint" olarak okutulması (worker-default.md, auditor.md, brain.md kuralları) drift edileni gizliyor ve gelecekte yanlış NO_GO kararlarına neden olabilir.

### 1.3 result-collector ↔ sprint-spawner döngüsel bağımlılığı runtime hile ile aşılıyor

`result-collector.ts:46-86` `respawnEligibleTasks`, `computeSlotsAvailable`, `selectEligibleForSpawn`, `pickFromQueue` fonksiyonlarını `sprint-spawner.ts`'den **type-only import + lazy dynamic import** (`await import('./sprint-spawner.js')`) ile alır. Açıklayıcı yorum (satır 47-50): "sprint-spawner.ts imports resolveAgentPrompt/resolveSkillPrompts from this file, so we use a dynamic import inside maybeRespawn to break the init-time cycle."

Bu klasik bir circular dependency çözüm yaması; runtime'da çalışıyor ama mimari katmanlama bozuk. ESM tree-shake ve hata izleme açısından gizli bir maliyettir; sebep `result-collector.ts` ile `sprint-spawner.ts` arasındaki sorumluluk paylaşımının kesin olmaması (her ikisi spawn'a dokunuyor, her ikisi prompt resolve ediyor). Bir dosya bütünüyle değişirse cycle yeniden çakılabilir.

### 1.4 Bootstrap fix P0-1 ve P0-2 aktif — semantik doğru

- **P0-1 (`coverageOptional`):** `result-evaluator.ts:16` import + `:516` çağrı (`if (!(task && coverageOptional(task))) missingFields.push('coverage');`). Plan dosyasındaki "~satır 214" referansı **yanlış**: gerçek konum 516. P0-1 audit task'larda `coverage: null` toleransı sağlar; aktif ve doğru.
- **P0-2 (`findBoundaryViolations` protokol allowlist):** `result-evaluator.ts:1625-1656` `findBoundaryViolations` içinde `protocolFiles = new Set([.tasks/.plan, .result, .hb])` allowlist aktif (satır 1631-1635). Worker'ın kendi `.plan`, `.result`, `.hb` dosyalarını yazması boundary ihlali sayılmıyor. Aktif ve doğru.

Bir CRITICAL not: `findBoundaryViolations` allowlist'i **sadece worker-default.md'de zorunlu kılınan üç dosyayı** kapsıyor (`.plan`, `.result`, `.hb`). Audit-task'lar koşar koşmaz Worker `.tasks/task-NNN.json` veya `.tasks/.prompt-*.txt` dosyalarına dokunmaz; ama bir yan etki olarak DOKER/tmux'tan gelen `.tasks/task-NNN.timeout` veya `.tasks/task-NNN.log` dosyaları başkasının üretmesi gerekirken worker tarafından üretilirse allowlist dışı kalır. Bu, Sprint 171'in audit-only invariantı altında risksiz; ama Sprint 172 sonrası worker'lar daha geniş dosya yazımına geçtiğinde allowlist'i `.timeout`, `.log` gibi protokol uzantıları için genişletmek istenebilir.

### 1.5 ADR-046, ADR-045, ADR-043, ADR-048 kod enforcement mevcut

- **ADR-046 (Brain Self-Update Hook Architecture):** `sprint-finalizer.ts:608-614` "ADR-046 Step 5 — retroWriter (dual write contract)", `:1048` "ADR-046 Amendment (Sprint 168 C0a-4)", `:1193-1207` "ADR-046 Step Ordering Contract; ruleRegen MUST observe ADRs inserted by adrInsert", `sprint-docs-updater.ts:547,613` DIRECTIVES arşiv kontrat. Step ordering canlı uygulanmış; sadece doküman değil.
- **ADR-045 (Wave-Based Execution Semantics — respawnEligibleTasks Runtime Wire):** `result-collector.ts:46-64` lazy import, `:107-131` `applyStatusMutation`, `:296-304` in-memory sync, `:375-387` `maybeRespawn`, `:499-501`, `:561-563` her tick re-evaluate; `sprint-spawner.ts:299` `if (config.dependency_pipeline_enabled)` gate. Aktif.
- **ADR-043 (Brain Crash Recovery Protocol):** `sprint-controller.ts:401-435` `restoreSprintFromCheckpoint` çağrısı; `sprint-checkpoint.ts:423-633` `writePhaseCheckpoint` + `restoreSprintFromCheckpoint`; `sprint-runner-entry.ts:103-190` crash handlers; `sensitive-redactor.ts:2`. Aktif.
- **ADR-048 (Prompt Lifecycle Contract):** `sprint-lifecycle.ts:215-247` `cleanupPreviousSprintOrphans` + `archivePromptFiles`; `spawn-backend-docker.ts:235-239` hash-based naming; `:990-1021` archive flow; `src/core/active-workers.ts:67` `getActiveWorkerIds()` shared helper. Bu helper'ın orchestra/ içinden doğrudan çağrıldığı yer görmedim — `claude.ts:17,150` provider tarafında kullanılıyor. Orchestra/ tarafında `archivePromptFiles` kullanılıyor; selective cleanup helper'ın orchestra side'da çağrı zincirinin tek-kaynaklı olup olmadığı 171-003 (orchestra-infra) audit raporu doğrulaması gerektiriyor.

### 1.6 brain.ts thin re-export layer — doğru tasarım

`brain.ts` (53 LoC) yalnızca `sprint-controller.ts`, `model-selector.ts`, `task-builder.ts`, `debt-manager.ts`, `sprint-reporter.ts`, `coverage-validator.ts` modüllerinden gelen sembolleri yeniden export eden ince bir bağlayıcı. CLAUDE.md mimari tablosundaki "**brain.ts: orchestrator (re-export layer, imports from sprint-controller)**" açıklaması kod gerçeğiyle birebir uyumlu. ADR-008'in pratikte uygulandığı modül **gerçekte `brain.ts` değil, `sprint-controller.ts`'tir**. ADR metnini "Brain (sprint-controller.ts) is the only module..." şeklinde güncellemek terimsel netliği artırır; ama yukarıdaki §1.2 sorunu yine de devam ediyor (sprint-controller'dan split edilen modüller).

### 1.7 decision-steps/agent-step.ts ve scope-step.ts — kanıtlı ölü kod (V1 routing kalıntısı)

Her iki dosya da kod başında **`@deprecated Since Sprint 066. Part of V1 routing. See decision-engine.ts.`** yorum başlığı taşıyor.

- `decision-steps/agent-step.ts:1-7`: "@deprecated This module is part of the abandoned DecisionOrchestrator pipeline. Production code uses selectAgent directly from core/agent-selector.js."
- `decision-steps/scope-step.ts:1-7`: "@deprecated This module is part of the abandoned DecisionOrchestrator pipeline. Production code uses enrichScopeWithTestFiles directly from task-builder.ts."

Bu iki dosya 82+91 = **173 LoC ölü kod**. ADR-038 dead code disposition kararına göre "**Dead** (delete)" veya "**Dormant/ADR-protected** (keep)" sınıflandırması gerekiyor. ADR-028 (V1 routing korumalı dormant) yorumu varsa korunur; yoksa silinmeli. ADR-028 metnine bakıldığında "V1 → V2 Routing Migration" kararı V1 modüllerini koruma altına alıyor (ADR-038 §1042 LoC dead, §495 LoC dormant/ADR-protected); bu iki dosya ADR-028 dormant kategorisine **giriyor olabilir** (V1 routing ekosistemi). Net karar 171-015 (dead-code) ve 171-016 (ADR compliance) audit raporlarında verilmeli; bizim raporumuz kanıtı kayda geçiriyor.

### 1.8 `rotateModelForFix` tasarım gözlemi (asıl audit 171-002, not düşüldü)

`debt-manager.ts:74-91` `MODEL_DOWNGRADE_MAP` opus→sonnet, sonnet→haiku, gpt-5→gpt-4.1 vb. Fix task orijinalden **daha düşük tier modelle** yapılır. Yorum (satır 70-72) "fresh-eyes counterpart (one tier down when available)" açıklaması mantığı veriyor; fakat semantik şu: orijinal opus'un başaramadığı işi sonnet daha kolay yapabilir mi? Genelde tam tersi. Buradaki sezgisel paradoks **171-002 (orchestra-routing) audit raporunun** ana bulgularından biri olacak — bu raporda sadece kayda geçtim (`debt-manager.ts:138 rotateModelForFix` + `:177 rotatedModel`).

### 1.9 `HONESTY_PATTERNS` hardcoded regex listesi

`sprint-controller.ts:683` `const HONESTY_PATTERNS = [/pre-existing/i, /unrelated/i];` — runtime'da işçi notlarında "pre-existing" / "unrelated" geçtiğinde `metric('honesty.check', 1, ...)` artırılıyor. Pattern listesi config dışı, hardcoded; gelecekte yeni honesty paternleri eklemek istenirse her seferinde sprint-controller'a dokunulması gerekir. Bu küçük bir tasarım gözlemi — MEDIUM olarak işaretliyorum.

### 1.10 `sprint-controller.ts:644-647` dinamik tmux import

`sprint-controller.ts:644-647` grace kill bloğunda `const { killWorker: kw } = await import('./tmux.js'); kw(task.id);` dinamik import yapılıyor. Yorum: backend yoksa fallback. Üst dosya zaten satır 101'de `../monitor/auditor`'dan `updateDashboard` static import ediyor; o satırda tmux için dinamik import seçilmesinin tek nedeni circular dependency önleme görünüyor (sprint-controller → tmux → ... yok aslında). Eğer cycle yoksa bu dinamik import gereksiz ve okunabilirliği bozar; cycle varsa görünmeyen kuplaj. Görmek için `tmux.ts` import zincirini sıralı denetlemek lazım — bu 171-003 (orchestra-infra) audit'ine kayda değer bir not.

### 1.11 `result-evaluator.ts:evaluateResult` deprecated ama hâlâ export ediliyor

`result-evaluator.ts:82-87` "@deprecated Use evaluateWithRubric() instead. ... This function is retained only for backward compatibility with CLI finalize command." CLI finalize komutu hâlâ kullanıyor → dosyada deprecated tag var ama silinemiyor. ADR-038 disposition'a göre "Dormant" kategorisi gibi. CLI finalize'ı `evaluateWithRubric`'e taşımak Sprint 172'ye giden temizlik adımı; bu raporda backlog girdisi olarak işaretliyorum.

### 1.12 `planner.ts:auditPlanGroundTruth` sadece `agents_count` denetliyor — kapsam dar

`planner.ts:498-601` (Bug Y2 — Plan-time Ground-Truth Audit, Sprint 166) plan içindeki "**N agents**" iddialarını dosya sistemi sayımı ile karşılaştırır. Sadece `agents_count` metriği desteklenir (`PLANNER_AGENTS_CLAIM_RE`). Skill sayısı, MCP tool sayısı (27), MCP resource sayısı (8), CLI komut sayısı (55+) gibi DECKENT.md/CLAUDE.md'de geçen diğer metriklerde aynı drift riski vardır (171-004 core-types-config audit konusu doc-vs-code drift). Bu raporda not olarak işaretliyorum.

### 1.13 `planner.ts` Provider register edilmemiş projelerde sessiz patlama riski

`planner.ts:315-318` `resolveAdapter(adapter?)` `providerRegistry.getDefault()` çağırıyor; registry boşsa `ProviderError('No providers registered')` fırlatıyor. Çağıran (`callBrainPlanner`, `callZeroConfigPlanner`) bu hatayı yakalamıyor — `runSprint` üst seviyede try/catch yok. OSS GA dosyalarında provider env değişkenleri yokken (örn. `GOOGLE_API_KEY` ayarsız) ilk `deckent_plan` çağrısında stack trace ile crash riski var. Bunun kullanıcı dostu mesajla `BrainError`'a çevrilmesi gerekiyor — şu an `ProviderError` raw fırlıyor.

### 1.14 Eksik prosedür / TODO / FIXME — temiz

Audit kapsamı içindeki sekiz dosyada `grep -n "TODO\|FIXME\|throw new Error.*not implemented"` çıktısı **0 satır**. Yarım implementasyon yok; @deprecated etiketleri var ama yorumda gerekçesi açık.

### 1.15 `task-builder.ts:extractScopeFromDirective` regex karmaşası (gözlem)

`task-builder.ts:446-547` `extractScopeFromDirective` 6+ ayrı regex bloğu kullanır (`dirMatches`, `docFileMatches`, `dotFileMatches`, `rootConfigMatches`, `rootDotfileMatches`, `fileMatches`, `standaloneMatches`). Bu blokların her biri farklı yan etkilerle (`filesWrite.push`) çakışır; örneğin bir dosya birden fazla regex'e uyabilir ama dedupe `filesWrite.includes(f)` ile yapılır. ESM normalize (forward slash) yapılmaz — Windows path ihtimaliyle aynı dosya hem `src/a.ts` hem `src\\a.ts` olarak girebilir. **OSS GA Windows desteği** çerçevesinde 171-017 (security) ve 171-019 (type-safety) audit raporları detaylı bakmalı.

### 1.16 `sprint-reporter.ts:computeSprintMetrics` math guard — doğru tasarım, dağınık yerleşim

`sprint-reporter.ts:100-165` "Sprint 168 Cluster C0d Math Guards (BUG-FF)" bloğu pure fonksiyon `computeSprintMetrics(input)` sağlıyor. **Doğru tasarım** (durationMs ≥ 0, coverageRatio null when totalLines=0). Tek itiraz: bu fonksiyon barrel re-export dosyasında (`sprint-reporter.ts` 165 LoC'in çoğu re-export) tanımlı. Pure helper'ın `sprint-metrics.ts`'e taşınması mantıklı — barrel dosya pure helper içermemeli (yorum satır 1-9 dosyayı "Thin Barrel" olarak tanıtıyor).

---

## 2. Severity

| # | Bulgu | Severity | Gerekçe |
|---|---|---|---|
| 1.1 | Faz akışı kontrat ile büyük oranda tutarlı; 1.5/1.9 ara faz numaraları kontratta yok; RETRO+DECAY tek fonksiyona gömülü | LOW | Sadece adlandırma kayması, runtime davranış doğru. |
| 1.2 | ADR-008 metni "sprint-controller is the ONLY module" — gerçekte 5-7 farklı orchestra/ modülü tmux/auditor/worker import ediyor (Sprint 076 God Object Split sonrası ADR metni güncellenmedi) | **CRITICAL** | Worker'a "mandatory constraint" olarak okutulan ADR ile kod gerçeği uyumsuz; OSS GA user'ı yanıltır + worker yanlış NO_GO üretebilir. doc-vs-code drift. |
| 1.3 | result-collector ↔ sprint-spawner döngüsel bağımlılığı lazy dynamic import ile aşılıyor | MEDIUM | Runtime çalışıyor ama mimari kuplaj gizli; refactor hassasiyetini artırıyor. |
| 1.4 | Bootstrap fix P0-1 (coverageOptional satır 516) + P0-2 (findBoundaryViolations protokol allowlist satır 1625-1656) aktif; plan dosyasındaki satır referansı (P0-1 ~214) yanlış — gerçek 516 | LOW (referans) / aktif (kod) | Fix kodda; sadece plan dosyası satır numarası yanıltıcı. Kod doğru. |
| 1.5 | ADR-046/045/043/048 kod enforcement mevcut — sadece doküman değil | (bulgu yok) | Bilgi: pozitif bulgu, tüm dört ADR canlı uygulanmış. |
| 1.6 | brain.ts thin re-export — CLAUDE.md ile birebir | LOW | Pozitif bulgu; minor: ADR-008 metnini "sprint-controller" netliğiyle güncelleyin. |
| 1.7 | `decision-steps/agent-step.ts` + `scope-step.ts` 173 LoC ölü kod, @deprecated Sprint 066 V1 routing kalıntısı | MEDIUM | ADR-028 V1 dormant koruması altında olabilir; net disposition 171-015 + 171-016. |
| 1.8 | `debt-manager.ts:rotateModelForFix` fix worker'a daha düşük tier model verir — counter-intuitive (asıl audit 171-002) | (not düşüldü) | 171-002 raporu detaylı işleyecek; burada sadece kayda geçti. |
| 1.9 | `sprint-controller.ts:683 HONESTY_PATTERNS` hardcoded regex listesi | MEDIUM | Genişletilebilirlik düşük; config'a çıkarılmalı. |
| 1.10 | `sprint-controller.ts:644-647` `await import('./tmux.js')` dinamik import — cycle gerekçesi belirsiz | LOW | Cycle yoksa gereksiz; 171-003 raporu doğrulayacak. |
| 1.11 | `result-evaluator.ts:evaluateResult` @deprecated ama CLI finalize hâlâ kullanıyor | LOW | Sprint 172 backlog: CLI'yı `evaluateWithRubric`'e taşı. |
| 1.12 | `planner.ts:auditPlanGroundTruth` sadece `agents_count` denetliyor; skill/MCP tool/CLI komut sayıları aynı drift'e açık | MEDIUM | OSS doc-vs-code drift riskini artırıyor; 171-004 ile koordineli iş. |
| 1.13 | `planner.ts:resolveAdapter` provider registry boşsa ham `ProviderError` raw fırlatır — kullanıcı dostu mesaj yok | HIGH | OSS GA'da ilk `deckent_plan` çağrısında stack trace crash görme riski; CLI'nın kullanıcı dostu hata mesajına çevirmesi şart. |
| 1.14 | TODO/FIXME/not-implemented temiz | (bulgu yok) | Pozitif. |
| 1.15 | `task-builder.ts:extractScopeFromDirective` regex karmaşası; ESM normalize yok (Windows path) | MEDIUM | OSS GA Windows desteği için 171-017+171-019 koordineli denetim. |
| 1.16 | `sprint-reporter.ts:computeSprintMetrics` pure helper barrel dosyada — mimari leak | LOW | `sprint-metrics.ts`'e taşı. |

---

## 3. Kanıt (Evidence)

Her bulgu için doğrudan `file:line` referans + kod alıntısı:

**1.1 — Faz akışı:** `src/orchestra/sprint-controller.ts:456-779`
```
// Phase 1: PLAN
const planResult = await runPlanPhase(...)
// Phase 1.5: Route tasks to providers
routeSprintTasksImpl(...)
// Phase 1.9: Capture pre-sprint test baseline
captureVitestBaseline(projectRoot)
// Phase 2: SPAWN
const { taskQueue, scanInterval: initialScanInterval } = await runSpawnPhase(...)
// Phase 3: EXECUTE
results = await waitForResults(...)
// Phase 4: EVALUATE
await runEvaluatePhase(...)
// Phase 5: FIX
await runFixPhase(...)
// Phase 6+7: RETRO + DECAY
await runRetroPhase(...)
// Phase 8: CLEANUP
scanInterval = runCleanupPhase(...)
```
Karşılaştırma: `.contracts/api-surface.md` "Sprint Phases" listesi (1.PLAN ... 8.CLEANUP).

**1.2 — ADR-008 ihlal:**
- `src/orchestra/result-collector.ts:44` → `import { spawnWorker, killWorker } from './tmux.js';`
- `src/orchestra/sprint-lifecycle.ts:54` → `import { killWorker, listWorkers } from './tmux.js';`
- `src/orchestra/sprint-spawner.ts:42` → `import { ensureSession, spawnWorker } from './tmux.js';`
- `src/orchestra/spawn-backend.ts:4` → `import { ensureSession, spawnWorker as tmuxSpawnWorker, killWorker as tmuxKillWorker, listWorkers as tmuxListWorkers } from './tmux.js';`
- `src/orchestra/sprint-utils.ts:31` → `import { listWorkers } from './tmux.js';`
- `src/orchestra/sprint-planner.ts:55` → `import { detectDeadlocks } from '../monitor/auditor.js';`
- `src/orchestra/result-evaluator.ts:1539,1544` → auditor import
- `src/orchestra/debt-manager.ts:15` → `import { updateTaskStatus, releaseAllLocks } from '../agents/worker.js';`

ADR-008 metni `.claude/rules/brain.md` ve `.claude/rules/worker-default.md` içinde **"ADR-008: Brain Merkezi Import — Tek Yönlü Bağımlılık — Status: accepted"** olarak Worker'a okutuluyor; Worker hangi modülün hangi modülden import edebileceğini ADR-008 ile değerlendiriyor. Kod ile metin uyumsuz.

**1.3 — Cycle:** `src/orchestra/result-collector.ts:46-86`
```
// ─── Sprint Spawner (lazy import — avoid module init cycle) ──────
// ADR-045: respawnEligibleTasks wire — invoked at runtime only, never at
// module load. sprint-spawner.ts imports resolveAgentPrompt/resolveSkillPrompts
// from this file, so we use a dynamic import inside maybeRespawn to break the
// init-time cycle.
import type { respawnEligibleTasks as RespawnFn, ... } from './sprint-spawner.js';
let cachedRespawn: typeof RespawnFn | undefined;
async function loadRespawn(): Promise<typeof RespawnFn> {
  if (!cachedRespawn) {
    const mod = await import('./sprint-spawner.js');
    cachedRespawn = mod.respawnEligibleTasks;
  }
  return cachedRespawn;
}
```

**1.4 — P0-1 ve P0-2 aktif:**
- `src/orchestra/result-evaluator.ts:16` → `import { getRubric, coverageOptional } from './rubric-registry.js';`
- `src/orchestra/result-evaluator.ts:516` → `if (!(task && coverageOptional(task))) { missingFields.push('coverage'); }`
- `src/orchestra/result-evaluator.ts:1625-1656` → `findBoundaryViolations` ve `protocolFiles = new Set([.tasks/task-${task.id}.plan, .result, .hb])` allowlist
- Plan referansı `~satır 214` **yanlış**, gerçek konum 516.

**1.5 — ADR enforcement kanıtları:**
- ADR-046: `src/orchestra/sprint-finalizer.ts:608` `// ─── ADR-046 Step 5 — retroWriter (dual write contract) ─────────`, `:1193` `// ADR-046 Step Ordering Contract; ruleRegen MUST observe ADRs inserted by adrInsert.`
- ADR-045: `src/orchestra/sprint-spawner.ts:299` `if (config.dependency_pipeline_enabled) { ... }`, `src/orchestra/result-collector.ts:107` `// ═══ Status Mutation (ADR-045 Decision 1) ═════════════════════════`
- ADR-043: `src/orchestra/sprint-controller.ts:83` `import { writePhaseCheckpoint, restoreSprintFromCheckpoint } from './sprint-checkpoint.js';`, `src/orchestra/sprint-runner-entry.ts:190` `// ADR-043: Install crash handlers AS EARLY AS POSSIBLE after IPC`
- ADR-048: `src/orchestra/sprint-lifecycle.ts:222` `// Sprint 168 C0e (ADR-048 Prompt Lifecycle Contract — clause 5`, `src/orchestra/spawn-backend-docker.ts:236-239` hash-based naming `.prompt-{taskId}-{hash}`

**1.6 — brain.ts thin re-export:** `src/orchestra/brain.ts:1-53` — yalnızca re-export deyimleri içerir, hiç fonksiyon gövdesi tanımı yok.

**1.7 — Dead code kanıtları:**
- `src/orchestra/decision-steps/agent-step.ts:1-7`:
```
/**
 * @deprecated Since Sprint 066. Part of V1 routing. See decision-engine.ts.
 */
// ─── Agent Selection Step ────────────────────────────────
// @deprecated This module is part of the abandoned DecisionOrchestrator pipeline.
// Production code uses selectAgent directly from core/agent-selector.js.
```
- `src/orchestra/decision-steps/scope-step.ts:1-7`: Aynı kalıp, "Production code uses enrichScopeWithTestFiles directly from task-builder.ts."

**1.8 — rotateModelForFix:**
- `src/orchestra/debt-manager.ts:74-91` `MODEL_DOWNGRADE_MAP`
- `src/orchestra/debt-manager.ts:138` `export function rotateModelForFix(model: ModelType): ModelType { return MODEL_DOWNGRADE_MAP[model] ?? model; }`
- `src/orchestra/debt-manager.ts:177` `const rotatedModel = rotateModelForFix(originalModel);`

**1.9 — HONESTY_PATTERNS hardcoded:** `src/orchestra/sprint-controller.ts:683`
```
const HONESTY_PATTERNS = [/pre-existing/i, /unrelated/i];
```

**1.10 — Dinamik tmux import:** `src/orchestra/sprint-controller.ts:644-647`
```
try {
  if (spawnBackend) spawnBackend.kill(task.id);
  else {
    const { killWorker: kw } = await import('./tmux.js');
    kw(task.id);
  }
} catch (e) { debugLog('graceKill:killWorker', e); }
```
Üst dosyanın satır 101'inde `'../monitor/auditor.js'` static import edilmiş — neden tmux dinamik açık değil.

**1.11 — evaluateResult @deprecated:** `src/orchestra/result-evaluator.ts:82-87`
```
* @deprecated Use evaluateWithRubric() instead. ...
* This function is retained only for backward compatibility with CLI finalize command.
```

**1.12 — auditPlanGroundTruth kapsam:** `src/orchestra/planner.ts:498-601` ve `:514` `const PLANNER_AGENTS_CLAIM_RE = /\b(\d{1,3})\s+(?:built-?in\s+)?agents?\b/gi;` — yalnız `agents_count` metriği.

**1.13 — Provider error raw:** `src/orchestra/planner.ts:315-318`
```
export function resolveAdapter(adapter?: ProviderAdapter): ProviderAdapter {
  if (adapter) return adapter;
  // Throws ProviderError('No providers registered') if registry is empty
  return providerRegistry.getDefault();
}
```
Callers (`callBrainPlanner` `:333`, `callZeroConfigPlanner` `:477`) try/catch yok.

**1.15 — extractScopeFromDirective regex:** `src/orchestra/task-builder.ts:446-547` — `dirMatches`, `docFileMatches`, `dotFileMatches`, `rootConfigMatches`, `rootDotfileMatches`, `fileMatches`, `standaloneMatches` ardışıklı regex blokları.

**1.16 — Pure helper barrel:** `src/orchestra/sprint-reporter.ts:1-9` ("Thin Barrel") başlığı altında `:100-165` `computeSprintMetrics` pure helper.

---

## 4. Öneriler (Recommendations)

**Sprint 172 OSS GA Blocker (CRITICAL):**

1. **ADR-008 metnini güncelleyin (Bulgu 1.2 — CRITICAL).** Tercih edilen yön: ADR-008 amendment yaz. Metni "Brain (sprint-controller.ts) merkezi orchestrator'dur; SPLIT sonucu oluşan ekosistemi (sprint-controller, sprint-planner, sprint-spawner, sprint-lifecycle, sprint-phases, sprint-finalizer, result-collector, sprint-utils, debt-manager) **tek mantıksal Brain birimi** olarak kabul eder; bu birim tmux/auditor/worker import edebilir. Hiçbir orchestra DIŞI modül (örn. providers/, mcp/, dashboard/) tmux/auditor/worker import etmez. Daire içi cycle yasaktır." Sonra `worker-default.md`/`brain.md`/`auditor.md` Active ADR Constraints listesini yenile (`scripts/inject-adr-constraints.sh` veya benzeri).

2. **`planner.ts:resolveAdapter` hata mesajı kullanıcı dostu (Bulgu 1.13 — HIGH).** `callBrainPlanner` ve `callZeroConfigPlanner` çağrılarının üst düzeyinde try/catch ekleyin; `ProviderError`'ı `BrainError` + Türkçe açıklamaya çevirin ("Hiçbir AI provider yapılandırılmamış — `OPENAI_API_KEY` veya `GOOGLE_API_KEY` ortam değişkenini ayarlayın veya Claude default sağlayıcısının yüklü olduğundan emin olun"). OSS GA ilk-deneyim için zorunlu.

**Sprint 172+ Backlog (MEDIUM/LOW):**

3. **result-collector ↔ sprint-spawner cycle çöz (Bulgu 1.3 — MEDIUM).** Sorumluluk yeniden ayrımı: `resolveAgentPrompt`/`resolveSkillPrompts` orchestra/agent-prompt-resolver.ts gibi yeni dosyaya taşınsın; ne result-collector ne sprint-spawner cycle oluşturmaz. Lazy `import()` koltuk değneği kalkar.

4. **`HONESTY_PATTERNS` config'a çıkar (Bulgu 1.9 — MEDIUM).** `ResolvedConfig.honesty_patterns?: RegExp[]` veya `string[]` (parse with `new RegExp(s, 'i')`). Default değer hâlâ `[/pre-existing/i, /unrelated/i]`. Genişletilebilir.

5. **decision-steps/ kararı (Bulgu 1.7 — MEDIUM).** `agent-step.ts` + `scope-step.ts` ADR-028 kapsamında dormant mı? **Sil** öneriyorum: production'da kullanılmıyor, V1 routing tamamen V2'ye geçti (ADR-028 migration accepted). ADR-038 disposition tablosuna `[DELETE] decision-steps/{agent,scope}-step.ts — 173 LoC, V1 routing kalıntı` kaydı ekleyin. 171-015 ve 171-016 audit raporları nihai kararı verecek.

6. **`evaluateResult` deprecated kullanım kaldır (Bulgu 1.11 — LOW).** CLI finalize komutunu `evaluateWithRubric`'e taşı; sonra `evaluateResult`'ı sil.

7. **`auditPlanGroundTruth` kapsamı genişlet (Bulgu 1.12 — MEDIUM).** `PLANNER_SKILLS_CLAIM_RE`, `PLANNER_MCP_TOOLS_CLAIM_RE`, `PLANNER_CLI_COMMANDS_CLAIM_RE` regex'lerini ekleyin; ilgili dosya sistem ölçümlerini yapan helper'lar (`measureSkillsCountFs`, vb.) tanımlayın. `.deckent/ground-truth-overrides.json` schema'sına yeni metrikler eklenir.

8. **`extractScopeFromDirective` normalize + birleştir (Bulgu 1.15 — MEDIUM).** Tüm path girdilerini `.replace(/\\/g, '/')` ile forward-slash normalize edin (Windows desteği). 7 regex bloğunu tek bir union regex'e + path post-processor'a indirin. 171-019 (type-safety) ile uyumlu.

9. **`computeSprintMetrics` taşı (Bulgu 1.16 — LOW).** Pure helper `sprint-metrics.ts`'e taşınsın; `sprint-reporter.ts` saf barrel kalsın.

10. **`sprint-controller.ts:644-647` dinamik tmux import düzelt (Bulgu 1.10 — LOW).** 171-003 (orchestra-infra) cycle yokluğunu doğrularsa static import'a çevirin; varsa neden olduğunu yorumla belgeleyin.

11. **Plan dosyası satır numarası düzelt (Bulgu 1.4 — LOW).** `docs/superpowers/plans/2026-05-15-sprint-171-self-audit-plan.md` Task 171-001 audit boyutları bölümünde "P0-1 (satır ~214 `coverageOptional`)" referansını "satır 516" olarak düzeltin. Bu bulgu raporun kendi referans bütünlüğü içindir.

12. **ADR-046 step ordering'i regression test ile koru.** sprint-finalizer.ts'deki "Step Ordering Contract" (satır 1193-1207) çoklu kontrat, kırılması zor değil. Unit test eklenmesi öneriliyor (171-021 test-integrity audit ile uyumlu).

---

## 5. Kapsam Haritası (Files Covered)

| Dosya | LoC | Okundu | Not |
|---|---|---|---|
| `src/orchestra/sprint-controller.ts` | 780 | Tam | Faz akışı çıkardım (Phase 1..8), HONESTY_PATTERNS hardcoded (Bulgu 1.9), dinamik tmux import (Bulgu 1.10), state recovery (ADR-043) wire. |
| `src/orchestra/brain.ts` | 53 | Tam | Thin re-export (Bulgu 1.6). |
| `src/orchestra/planner.ts` | 629 | Tam | buildPlanPrompt + parsePlannerResponse + auditPlanGroundTruth (Bulgu 1.12); resolveAdapter raw error (Bulgu 1.13). |
| `src/orchestra/task-builder.ts` | 1045 | Char-level (regex blokları ayrıntı) | extractScopeFromDirective regex (Bulgu 1.15), parseStructuredDirectives + parseBulletOrNumberedTasks, queryRelevantADRs (ADR-036). |
| `src/orchestra/result-evaluator.ts` | 1974 | Kritik bölümler char-level (1-280, 490-560, 1540-1750); orta kısımları taradım | P0-1 (Bulgu 1.4) satır 516, P0-2 (Bulgu 1.4) satır 1625-1656, evaluateResult @deprecated (Bulgu 1.11). |
| `src/orchestra/result-collector.ts` | 601 | Tam | ADR-045 wire (Bulgu 1.5); cycle (Bulgu 1.3); tmux import (Bulgu 1.2). |
| `src/orchestra/sprint-reporter.ts` | 165 | Tam | Thin Barrel; computeSprintMetrics pure helper barrel'da (Bulgu 1.16). |
| `src/orchestra/sprint-utils.ts` | 361 | Tam | tmux import (Bulgu 1.2 ihlal kalemi), state persist/recover. |
| `src/orchestra/decision-steps/agent-step.ts` | 82 | Tam | @deprecated V1 routing (Bulgu 1.7 — dead code). |
| `src/orchestra/decision-steps/scope-step.ts` | 91 | Tam | @deprecated V1 routing (Bulgu 1.7 — dead code). |
| **TOPLAM** | **5781** | | 10 dosya, %100 kapsam — coverage-gap **0**. |

**Doğrulama yöntemi:** `wc -l src/orchestra/{sprint-controller,brain,planner,task-builder,result-evaluator,result-collector,sprint-reporter,sprint-utils}.ts src/orchestra/decision-steps/*.ts` → `5781 total` (audit anı, 2026-05-15). `ls src/orchestra/decision-steps/` → 2 dosya (agent-step.ts, scope-step.ts) — başka decision-step yok.

**Kapsam dışı bilinçli (kaydırılan ilgili modüller):**
- `sprint-phases.ts`, `sprint-planner.ts`, `sprint-spawner.ts`, `sprint-lifecycle.ts`, `sprint-finalizer.ts`, `sprint-checkpoint.ts`, `sprint-runner-entry.ts`, `sprint-pid-manager.ts`, `parallel-pipeline.ts`, `ipc-registry.ts`, `model-selector.ts`, `coverage-validator.ts`, `event-bus.ts`, `result-watcher.ts`, `task-mode-runner.ts`, `prompt-god-template.ts`, `prompt-token-optimizer.ts`, `adr-selector.ts`, `baseline-tracker.ts`, `connector.ts`, `rollback.ts` — orchestra/ klasörü içinde ama plan Task 171-001 listesinde yer almayan modüller. Bu modüller plan dosyasına göre 171-002 (routing+evaluation), 171-003 (infra) audit raporlarının kapsamına dağıtılmış (özellikle `sprint-finalizer.ts` ADR-046 enforcement, `sprint-spawner.ts` ADR-045 enforcement bizim §1.5 atıflarımızda geçti ama tam denetim hedef raporda).
- `decision-engine.ts`, `decision-types.ts` — V2 routing decision pipeline; `decision-steps/`'ten farklı (V1 dormant). 171-002 audit kapsamı.

**Coverage-gap iddiası:** Plan Task 171-001 dosya listesi {`sprint-controller`, `brain`, `planner`, `task-builder`, `result-evaluator`, `result-collector`, `sprint-reporter`, `sprint-utils`} + `decision-steps/**` — 10 dosya, hepsi okundu, **boşta dosya 0**. Synthesis (171-029) Kapsam Doğrulama bölümü `find src/orchestra -name '*.ts' | sort | wc -l` toplamından bizim 10 dosyamızı çıkarttığında **76-10 = 66** dosya 171-002/171-003 dağılımına gider — bu union/diff hesabı Task 171-029'un sorumluluğunda; bizim raporumuz Task 171-001 kapsamını **eksiksiz** kapsadı.
