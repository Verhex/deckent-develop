# Dead Code + ESM Hygiene — Audit Raporu (Sprint 171, Task 171-015)

> **Kapsam:** Tüm `src/**` (412 TypeScript dosya, dashboard hariç +/dahil belirtilerek).
> **Tarih:** 2026-05-15.
> **Audit tipi:** Cross-cutting concern — Plan Şeması uyarınca **Kapsam Haritası YOK**.
> **Yöntem:** Karma yaklaşım — desen tabanlı grep (`from`, `_` prefix, `@deprecated`, `if (false)`) + örnekleme ile derinlemesine çağrı izleme. Tek bir mühendisin tüm 412 dosyayı satır-satır okuması bir Wave 2 task'ı için uygun değildir; bunun yerine her boyut için kanıt-temelli sonda yöntemi kullanıldı. Numerik sayımlar `grep` kanıtıyla doğrulanır.

---

## 1. Bulgular (Findings)

### 1.1 ESM `.js` Uzantısı (ADR-002 Node16) — Disiplin İhlali YOK

`src/**` (dashboard hariç) altında relative import'lar dizinde **`.js` uzantı zorunluluğu %100 uygulanmış**. `from '../foo'` tarzı uzantısız relative import sıfır kez geçiyor. Pozitif bulgu — ADR-002 enforcement kanıtlı.

- **Yöntem:** `grep -rn -E "from\s+['\"]\.\.?\/[^'\"]+['\"]" src --include="*.ts" | grep -v "/dashboard/" | grep -vE "\.(js|json|css|svg|png|jpg|md|txt)['\"]"` → yalnızca **2 sahte pozitif** (1 yorum satırı, 1 zaten `.js` ile biten satır parse hatası).
- **Dashboard ayrımı:** `src/dashboard/tsconfig.json` `moduleResolution: "bundler"` kullanır (`src/dashboard/tsconfig.json:5`); root `tsconfig.json` dashboard'u `exclude` eder (`tsconfig.json:25`). Bu yüzden `src/dashboard/src/pages/HistoryPage.tsx:1` gibi `import ... from "../hooks/useApi"` (uzantısız) **ADR-002 ihlali DEĞİLDİR** — Vite resolver tarafından sağlanır.

### 1.2 `@deprecated` İşaretli Kod — 38 Yer, Karışık Disposition Durumu

`grep -rn "@deprecated" src --include="*.ts"` toplam **38 satır** verdi. Üç gerçek kategori:

#### 1.2.1 Decision-Engine V1 — Production'dan Tamamen Düştü, Sadece Test Yaşıyor

ADR-028 ile V1→V2 routing migration tamamlandı. Aşağıdaki modüller production sprint yürütmesinde HİÇBİR yerden çağrılmıyor — yalnızca `tests/orchestra/` ve `tests/integration/` altında `DecisionOrchestrator` instantiate edilir:

- `src/orchestra/decision-engine.ts` (`src/orchestra/decision-engine.ts:1-15` üst yorum bunu açıkça beyan ediyor: "DecisionOrchestrator is only used by test suites").
- `src/orchestra/decision-steps/agent-step.ts:2,5` — `@deprecated` × 2.
- `src/orchestra/decision-steps/scope-step.ts:2,5` — `@deprecated` × 2.
- `src/orchestra/decision-replay.ts:2,5` — `@deprecated` × 2; `DecisionOrchestrator` tipini import eder.

Bu üçü beraber **production çalışma yolunda ulaşılmaz dal**dır — testler hayatta tutuyor. ADR-038 (Dead Code Disposition) "V1 referans implementasyonu olarak korunacak" diyor (`src/core/adr-seed.ts:327`), ama bu karar 5+ sprint öncesine ait. Sprint 171 OSS GA öncesi yeniden değerlendirme gerekir.

#### 1.2.2 Aktif Kullanımda Olan `@deprecated` Sembolleri — Yanıltıcı İşaretleme

`@deprecated` annotation TypeScript tarafından bilgi amaçlıdır — runtime davranışını etkilemez, derleme zamanında uyarı vermez. Aşağıdaki fonksiyonlar `@deprecated` etiketli olduğu hâlde **aktif production yolunda** çağrılır:

- `parseDebtTable`, `generateDebtTable` (`src/core/utils.ts:201,237`) — `@deprecated Memory V2 stores debt in SQLite DB` ama:
  - `src/orchestra/sprint-finalizer.ts:35,572` aktif `parseDebtTable(debtContent)` çağırıyor.
  - `src/orchestra/sprint-phases.ts:34,1246` aktif çağrı.
  - `src/cli/commands/archive-debt.ts:60` aktif çağrı.
  - Memory V2 DB-first iddia edilir, ancak finalize akışı hâlâ markdown tablo parse ediyor → ADR drift kanıtı (Task 171-016 / Task 171-022 ile çapraz referans).
- `appendCiLearningsToMemory` (`src/orchestra/ci-reporter.ts:221`) — `_projectRoot` parametresi `_` prefix ile gizlenmiş ama fonksiyon `src/orchestra/ci-reporter.ts:204`'te kendi modülünden çağrılıyor.
- `cleanOrphanIpcDirs` `@deprecated` overload (`src/core/orphan-cleaner.ts:304`) — eski tek-parametreli sürüm, yeni `(root, opts)` sürümü var. İki imza birlikte kullanılıyor.

`@deprecated` etiketinin "kullanma" sinyali olduğu hâlde gerçek çağırılma, kod-doküman drift'idir; OSS dış katılımcılar için kafa karıştırıcı.

#### 1.2.3 Backward-Compat Re-export'lar — Doğru Kullanılmış

- `src/core/token-counter.ts:10` `ModelName = ModelType` tip alias — net amaç, sorun yok.
- `src/core/config-types.ts:181,184,569,571` — `memory_budget`, `decay_after_sprints`, `brainModel`, `defaultModel` V1 alanları, açık V2 karşılık önerisi ile. Standart bckward-compat.
- `src/core/constants.ts:99,101,103,109,113` — config alan adı değişikliği için sabit alias'ları. Standart.

### 1.3 `_` Prefix ile Susturulmuş Unused Var — 59 Yer, 1 Yanıltıcı Vaka

`tsconfig.json:19-20` `noUnusedLocals: true` + `noUnusedParameters: true` aktif. `_` prefix konvansiyonu TypeScript kuralıdır: `_param` denetimden muaftır. 59 kullanım tespit edildi. Çoğu **meşru** — bir interface imzasına uymak için (örneğin `connectors/whatsapp.ts:54` `sendMessage(_msg: OutgoingMessage)` scaffold no-op).

**Tek istisna — yanıltıcı vaka:** `src/core/observability.ts:60-62` modül-seviyesi `let _projectRoot`, `let _sprintId`, `let _perSprintFile` değişkenleri tanımlanmış, sonra `src/core/observability.ts:456,462,471` aktif olarak değer okuyor. Yani "_ ile başlasalar bile gerçekte kullanılıyorlar" — bu, TypeScript okuyucusunu yanıltır: `_` prefix gören geliştirici "kullanılmıyor, silmek güvenli" varsayar. Konvansiyon ihlali.

### 1.4 Ulaşılamaz Dal — Doğrudan İhlal Bulunmadı, Soft Ölü Kod Var

- `grep -rn -E "if\s*\(\s*(false|0)\s*\)" src` → **0 sonuç**. Bu çok güçlü: derlenmesi gereken her dal en az teorik olarak ulaşılabilir.
- **Soft ölü dal:** `src/connectors/whatsapp.ts` tamamen scaffold:
  - `start()` → `if (config.enabled) throw new Error(...)` — `enabled=true` Sprint 153+ planlandı, **Sprint 171 itibarıyla aktif olmamış**. Yani prodüksiyonda her zaman `if (!config.enabled) return` no-op dalı çalışır, throw dalı **ulaşılamaz duruma yakın** (kullanıcı `enabled: true` yazsa bile başarısız olur).
  - `sendMessage(_msg)` → her zaman throw, kullanılmaz (`src/connectors/whatsapp.ts:54-59`).
  - `isHealthy()` → her zaman `false` (`src/connectors/whatsapp.ts:65-67`).
  - Sprint 149'da yazıldı, Sprint 171 = 22 sprint sonra; aktivasyon planı belirsiz.

### 1.5 Kullanılmayan Export Adayları — Çapraz Referansla Doğrulanmış

Üst seviye export sayısı: `grep -rn -E "^export\s+(function|class|const|interface|type|enum)" src` → **2367**. Bunların tümünün kullanım taraması bu task'ın bütçesinde uygulanamaz; sonda yöntemi ile birkaç güçlü aday bulundu:

#### 1.5.1 `monitor-adapter.ts` — Komple Modül Ölü Kod

`src/orchestra/monitor-adapter.ts` aşağıdakileri export eder:
- `MonitorAdapter` interface (`src/orchestra/monitor-adapter.ts:25`).
- `DockerMonitorAdapter` class (`src/orchestra/monitor-adapter.ts:47`).
- `TmuxMonitorAdapter` class (`src/orchestra/monitor-adapter.ts:88`).
- `SubprocessMonitorAdapter` class (`src/orchestra/monitor-adapter.ts:127`).
- `createMonitorAdapter` factory (`src/orchestra/monitor-adapter.ts:196`).

`grep -rn "createMonitorAdapter" src` → **yalnızca tanım satırı** geri döner. Çağıran kod yok. `grep -rn "monitor-adapter" tests` → bir test allowlist'te dosya adını geçirir (`tests/core/error-handling-unification.test.ts:601`) ama "MonitorAdapter" tipini hiç instantiate etmez.

Sonuç: **289 LoC modül production'dan tamamen kopuk**. ADR-038 dispose kararı gerekir.

#### 1.5.2 `manifest-migrator.ts` — Yalnızca Testlerden Çağrılır

- `migrateAgentManifest`, `migrateSkillManifest`, `isV2Manifest`, `needsMigration` (`src/core/manifest-migrator.ts:28,49 + diğer`) `src/core/index.ts:36`'dan re-export ediliyor.
- `grep -rn "migrateAgentManifest\|migrateSkillManifest\|isV2Manifest" src` → sadece `manifest-migrator.ts` tanım + `index.ts` re-export. **0 production caller.**
- `grep -rn ... tests` → `tests/core/manifest-migrator.test.ts:2,32,42` aktif test ediyor.

V1→V2 manifest geçişi yapıldı; geçiş kodu hâlâ duruyor. Sprint 144-146 civarı yazıldı, bu Sprint 171'de >25 sprint geride. ADR-038 dispose kararı gerekir.

#### 1.5.3 `decision-replay.ts` ve `decision-engine.ts` — Kapsam 1.2.1'e Bakınız

Yukarıda. Aynı kategoride.

#### 1.5.4 Rubric Puanlayıcı `_task` Parametreleri

`src/orchestra/result-evaluator.ts:785,827,859,891,919` — beş rubric scoring fonksiyonu:
- `scoreAuditCompleteness(result, _task)`
- `scoreFindingCount(result, _task)`
- `scoreCitationDensity(result, _task)`
- `scoreMigrationTriage(result, _task)`
- `scoreDocumentationQuality(result, _task)`

`_task` parametresi imza zorunluluğu için var ama hiç okunmuyor. Rubric registry tipi onları aynı imzayla bekliyor olabilir; ama eğer Task konteksti gerçekten gerekli değilse `Task` parametresi imzadan çıkarılabilir veya `Pick<Task, ...>` ile daraltılabilir. **Düzeltilebilir kod kokusu**.

### 1.6 Import Cycle / Aşırı Derinlik

- **ADR-008 (Brain Merkezi Import — Tek Yönlü Bağımlılık)** uygulanması: `src/orchestra/brain.ts` artık ince re-export katmanı (`src/orchestra/brain.ts:1-30`); gerçek implementation `sprint-controller.ts` ve diğer alt modüllerde. Bu pattern ADR-008'i somut hâle getiren ana mekanizma.
- `src/api/server.ts:23` brain.ts'ten import eder; `src/cli/entry.ts:5` sprint-controller.ts'ten import eder. Yön: çevre → orchestra (tek-yön). **Tersine import gözlemlenmedi.**
- `src/orchestra/index.ts:69-81` `./brain.js` re-export ediyor → barrel pattern, cycle riski düşük.
- `src/index.ts:1-4` ve `src/core/index.ts:1-2` `export *` barrel'leri — bu **TypeScript'in en kötü pratiklerinden biridir**: tüm modülün public API'sini dolaylı yapar, IDE auto-import şişer, gerçek bağımlılıkları gizler, tree-shake'i zorlaştırır. **Yapısal teknik borç**, ölü kod kategorisi değil ama doğrudan kullanım hedeflenmesi gerekir. (Not: import cycle veya zincir derinliği için tam `madge`-tipi analiz bu task'ta yapılamadı — gerçek tool çağrısı gerekir; örnekleme cycle göstermedi, ama kapsamlı garanti yok.)

---

## 2. Severity

| # | Bulgu | Severity | Gerekçe |
|---|---|---|---|
| 1.1 | ESM `.js` uzantı disiplini — TAM uygulanmış | INFO (pozitif) | OSS GA için iyi haber; ADR-002 enforcement kanıtı. |
| 1.2.1 | Decision-Engine V1 (`decision-engine.ts`, `decision-steps/`, `decision-replay.ts`) — production'da ölü, testlerde canlı | HIGH | 4 dosya × ~150-300 LoC; OSS okuyucu "kullanım kodu" sanıp dalabilir. ADR-038 yeniden değerlendirme gerekir. |
| 1.2.2 | Aktif kullanılan `@deprecated` fonksiyonlar (parseDebtTable, generateDebtTable, appendCiLearningsToMemory, cleanOrphanIpcDirs eski overload) | MEDIUM | Kod-doküman drift; OSS dış katkıcı için yanıltıcı sinyal. Memory V2 DB-first ile çelişen finalize yolu (ADR-022 V2 / Memory V2 ile çapraz). |
| 1.2.3 | Backward-compat re-export'lar (config alan alias'ları) | LOW | Standart pratik; net yorumlanmış. |
| 1.3 | `_` prefix konvansiyon ihlali (observability.ts modül-seviyesi `_projectRoot` aktif okunuyor) | LOW | Tek vaka; konvansiyonu kıran tek dosya. Okuyucu yanılgısı. |
| 1.4 | WhatsApp connector scaffold (22 sprint inaktif) | MEDIUM | OSS GA'da kullanıcı `connectors/whatsapp` görüp etkin sanabilir. Throw dalı yanıltıcı. README mevcut ama kod tek başına okunduğunda ölü görünür. |
| 1.5.1 | `monitor-adapter.ts` — komple modül ölü kod (289 LoC) | HIGH | 0 production caller. Backend abstraction olarak yazılmış ama `monitor/auditor.ts` doğrudan FS okuyor; modül asla wire edilmedi. |
| 1.5.2 | `manifest-migrator.ts` — yalnızca test, 0 prod caller | MEDIUM | V1→V2 manifest migration tamamlandı; geçiş kodu ölü. |
| 1.5.4 | Rubric `_task` parametreleri — 5 fonksiyon, gereksiz Task tipinin imza yükü | LOW | Tip imza basitleştirme fırsatı. |
| 1.6 | `export *` barrel pattern (`src/index.ts`, `src/core/index.ts`, `src/core/types.ts`) | MEDIUM | Yapısal — gerçek bağımlılık görünmez olur. Tam dead-export analizi mümkün değil olur. |
| 1.6 | Import cycle riski (örneklemede gözlem yok, full madge analiz yapılmadı) | LOW (open) | Sonda kanıt vermedi; eksik tool varlığında riski tamamen elemek için Sprint 172+'da `npx madge --circular` koşturulmalı. |

**CRITICAL bulgu yok** — bu kategori "OSS GA blocker" tanımına uymadığı için. Bulgular yapısal-eski-kod kategorisinde ve OSS sonrası bile aşamalı temizlik mümkün. Ancak `monitor-adapter.ts` (1.5.1) ve Decision-Engine V1 (1.2.1) yüksek görünürlüklü ölü kod olduğundan HIGH yakaltıldı.

---

## 3. Kanıt (Evidence)

### 3.1 ESM Disiplini
```bash
$ grep -rn -E "from\s+['\"]\.\.?\/[^'\"]+['\"]" src --include="*.ts" \
    | grep -v "/dashboard/" \
    | grep -vE "\.(js|json|css|svg|png|jpg|md|txt)['\"]"
src/core/types.ts:4:// Consumers can continue to import from './types.js' without changes.   ← yorum (sahte pozitif)
src/mcp/tools/index.ts:17:import { registerHelpTool } from './help.js'; // deckent_help        ← zaten .js (regex sahte pozitif)
```
İki sahte pozitif dışında **0 ihlal**.

```text
/workspace/tsconfig.json:5: "moduleResolution": "Node16",
/workspace/tsconfig.json:25: "exclude": ["node_modules", "dist", "tests", "src/dashboard"],
/workspace/src/dashboard/tsconfig.json:5: "moduleResolution": "bundler",
```

### 3.2 Decision-Engine V1
```text
/workspace/src/orchestra/decision-engine.ts:10: // @deprecated This module is NOT used in production sprint execution.
/workspace/src/orchestra/decision-engine.ts:13: // DecisionOrchestrator is only used by test suites (tests/orchestra/ and tests/integration/).
/workspace/src/orchestra/decision-steps/agent-step.ts:5: // @deprecated This module is part of the abandoned DecisionOrchestrator pipeline.
/workspace/src/orchestra/decision-steps/scope-step.ts:5: // @deprecated This module is part of the abandoned DecisionOrchestrator pipeline.
/workspace/src/orchestra/decision-replay.ts:8:  // Since DecisionOrchestrator is not instantiated in sprint-controller, this replay mechanism is test-only.
```
Çağıran tek yer:
```text
/workspace/tests/orchestra/decision-replay.test.ts:5: import { DecisionOrchestrator } from '../../src/orchestra/decision-engine.js';
```

### 3.3 `@deprecated` ama Aktif Çağrı
```text
/workspace/src/core/utils.ts:201: * @deprecated Memory V2 stores debt in SQLite DB. Kept for V1 fallback and migration.
/workspace/src/core/utils.ts:205: export function parseDebtTable(content: string): DebtItem[] {
/workspace/src/orchestra/sprint-finalizer.ts:35: import { parseDebtTable, updateLastSprintId, debugLog } from '../core/utils.js';
/workspace/src/orchestra/sprint-finalizer.ts:572:   const freshDebt = parseDebtTable(debtContent);
/workspace/src/orchestra/sprint-phases.ts:1246:  const freshDebt = parseDebtTable(readFileSafe(join(projectRoot, BRAIN_DIR, DEBT_FILE)) ?? '');
/workspace/src/cli/commands/archive-debt.ts:60:  rows = parseDebtTable(content);
```

### 3.4 `_` Prefix Yanıltıcı Vaka — observability.ts
```text
/workspace/src/core/observability.ts:60: let _projectRoot: string | null = null;
/workspace/src/core/observability.ts:61: let _sprintId: string | null = null;
/workspace/src/core/observability.ts:62: let _perSprintFile = false;
/workspace/src/core/observability.ts:456:   if (!_projectRoot) return;          ← AKTİF OKUMA
/workspace/src/core/observability.ts:462:   const metricsPath = getMetricsPath(_projectRoot);   ← AKTİF OKUMA
/workspace/src/core/observability.ts:471:   const perSprintPath = getPerSprintMetricsPath(_projectRoot, _sprintId);  ← AKTİF OKUMA
```

### 3.5 WhatsApp Scaffold
```text
/workspace/src/connectors/whatsapp.ts:35:    throw new Error(
/workspace/src/connectors/whatsapp.ts:36-39: 'WhatsApp connector requires official Business API approval. ' +
                                              'Scaffold only in Sprint 150. Activation targeted for Sprint 153+. ' +
                                              'See src/connectors/whatsapp-README.md for activation steps.',
/workspace/src/connectors/whatsapp.ts:54:  async sendMessage(_msg: OutgoingMessage): Promise<void> {
/workspace/src/connectors/whatsapp.ts:55:    throw new Error(...)
/workspace/src/connectors/whatsapp.ts:66:  isHealthy(): boolean {
/workspace/src/connectors/whatsapp.ts:67:    return false; // Always unhealthy until Sprint 153+ activation
```
22 sprint sonra (Sprint 171), hâlâ inaktif.

### 3.6 monitor-adapter.ts — Ölü Modül
```text
/workspace/src/orchestra/monitor-adapter.ts:25:  export interface MonitorAdapter {
/workspace/src/orchestra/monitor-adapter.ts:47:  export class DockerMonitorAdapter implements MonitorAdapter {
/workspace/src/orchestra/monitor-adapter.ts:88:  export class TmuxMonitorAdapter implements MonitorAdapter {
/workspace/src/orchestra/monitor-adapter.ts:127: export class SubprocessMonitorAdapter implements MonitorAdapter {
/workspace/src/orchestra/monitor-adapter.ts:196: export function createMonitorAdapter(config: ...): MonitorAdapter {
```
```bash
$ grep -rn "createMonitorAdapter" src --include="*.ts"
src/orchestra/monitor-adapter.ts:196:export function createMonitorAdapter(...) {   ← tanım
# 0 caller
```
```bash
$ grep -rn "createMonitorAdapter\|MonitorAdapter[^A-Za-z]" tests --include="*.ts"
tests/core/error-handling-unification.test.ts:601:  const allowlist = new Set(['monitor-adapter.ts', ...]);   ← yalnızca dosya adı string'i
```

### 3.7 manifest-migrator.ts — Test-Only
```text
/workspace/src/core/index.ts:36: export { needsMigration, isV2Manifest, migrateAgentManifest, migrateSkillManifest } from './manifest-migrator.js';
/workspace/src/core/manifest-migrator.ts:28: export function migrateAgentManifest(agent: AgentDefinition): AgentDefinition {
/workspace/src/core/manifest-migrator.ts:49: export function migrateSkillManifest(skill: SkillDefinition): SkillDefinition {
```
```bash
$ grep -rn "migrateAgentManifest\|migrateSkillManifest\|isV2Manifest" src --include="*.ts" | grep -v "manifest-migrator\.ts\|index\.ts"
# 0 sonuç → 0 production caller
$ grep -rn "migrateAgentManifest" tests
tests/core/manifest-migrator.test.ts:2,32,42,59,...   ← aktif test
```

### 3.8 Rubric `_task` Parametreleri
```text
/workspace/src/orchestra/result-evaluator.ts:785: export function scoreAuditCompleteness(result: TaskResult, _task: Task): RubricScore {
/workspace/src/orchestra/result-evaluator.ts:827: export function scoreFindingCount(result: TaskResult, _task: Task): RubricScore {
/workspace/src/orchestra/result-evaluator.ts:859: export function scoreCitationDensity(result: TaskResult, _task: Task): RubricScore {
/workspace/src/orchestra/result-evaluator.ts:891: export function scoreMigrationTriage(result: TaskResult, _task: Task): RubricScore {
/workspace/src/orchestra/result-evaluator.ts:919: export function scoreDocumentationQuality(result: TaskResult, _task: Task): RubricScore {
```

### 3.9 Barrel `export *`
```text
/workspace/src/index.ts:1: export * from './core/index.js';
/workspace/src/index.ts:2: export * from './orchestra/index.js';
/workspace/src/index.ts:3: export * from './monitor/index.js';
/workspace/src/index.ts:4: export * from './agents/index.js';
/workspace/src/core/index.ts:1: export * from './types.js';
/workspace/src/core/index.ts:2: export * from './constants.js';
/workspace/src/core/types.ts:6-9: export * from './task-types.js'; ... './sprint-types.js';
```

### 3.10 Toplam Sayımlar
```text
src/** TypeScript dosyası: 412
Top-level export: 2367
@deprecated annotation: 38
_-prefix parametre/değişken: 59
if(false) dead branch: 0
```

---

## 4. Öneriler (Recommendations)

Aşağıdakileri **Sprint 172 (OSS GA) öncesi veya ilk OSS sprint'lerinde** çözmek doğru olur. ADR-038 dispose formatı (SİL / KORU / DÜZELT / BİRLEŞTİR) kullanıldı.

### 4.1 Decision-Engine V1 — SİL (ADR-028 Sonrası Yeniden Değerlendir)

**Aksiyon:** ADR-028 amend → "V1 referans implementasyon koruma" kararını gözden geçir. Sprint 066'dan Sprint 171'e = 105 sprint geçti, hiç referans olarak kullanılmadı; örnek lazımsa git tag'iyle bul.

- `src/orchestra/decision-engine.ts` → **SİL**.
- `src/orchestra/decision-steps/agent-step.ts` → **SİL**.
- `src/orchestra/decision-steps/scope-step.ts` → **SİL**.
- `src/orchestra/decision-replay.ts` → **SİL**.
- `tests/orchestra/decision-replay.test.ts`, ilgili V1 testleri → **SİL** (bu test'ler V1 kod hayatta tuttuğu için sahte yeşil veriyor).
- Önce ADR-028 amendment yaz, sonra hard delete; coverage'a etkisi raporda gerekçelendirilsin.

### 4.2 `@deprecated` Aktif Kullanım — DÜZELT (`parseDebtTable`/`generateDebtTable`)

**Aksiyon:** Memory V2 DB-first iddiası ile finalize akışının markdown parse'ı çelişiyor. İki seçenek:

1. **DÜZELT (tercih):** `sprint-finalizer.ts:572`, `sprint-phases.ts:1246`, `archive-debt.ts:60`'taki üç caller'i `MemoryStore.getByType('debt')` çağrısına dönüştür → V2 DB-first kapanır. Sonra `parseDebtTable`/`generateDebtTable` SİL.
2. **KORU + `@deprecated` etiketini KALDIR:** Eğer DB-first iddiası tutmazsa, etiket yanıltıcıdır. ADR güncellemesi gerekir.

`appendCiLearningsToMemory` (`ci-reporter.ts:221`): `_projectRoot` parametresi gerçekten kullanılmıyor, sadece kendi modülünden bir kez çağrılıyor (`ci-reporter.ts:204`). İmza `(_projectRoot, result, store)` yerine `(result, store)` yap; callsite güncelle. **DÜZELT**.

`cleanOrphanIpcDirs` eski overload (`orphan-cleaner.ts:304`): tek-param sürüm caller'larını yeni `(root, opts)` sürümüne migrate et, sonra eski overload **SİL**.

### 4.3 `_` Prefix Yanıltıcı Vaka — DÜZELT

`src/core/observability.ts:60-62` modül-seviyesi `let _projectRoot/_sprintId/_perSprintFile`:
- `_` prefix'i KALDIR — `projectRoot`, `sprintId`, `perSprintFile` yap.
- Aktif kullanım olduğu için `noUnusedLocals` zaten geçer; prefix yanıltıcı.
- Modül-içi private modul-state; alternatif olarak küçük bir class veya factory pattern düşünülebilir ama kapsam dışı.

### 4.4 WhatsApp Connector — KARAR (Aktivasyon Veya Kaldırma)

Sprint 150'de yazıldı, 22 sprint sonra hâlâ inaktif. Üç olası karar:
- **SİL:** `src/connectors/whatsapp.ts` + `whatsapp-README.md` kaldır; aktivasyona karar verildiğinde tekrar yaz (git history korur).
- **KORU + GÜNCELLE:** `Sprint 153+` hedefini gerçek sprint numarası ile değiştir (örneğin "Roadmap'te yer almıyor — opsiyonel, talepe göre"); throw mesajları güncelle.
- **AKTİVASYON KARARI:** Eğer Sprint 172 OSS GA'da gerçek WhatsApp desteği isteniyorsa ADR yaz, gerçek implementasyon başlat.

OSS GA için en temiz seçim: **KORU + GÜNCELLE** (silmek 2+ ay'lık scaffold çalışmasını kaybettirir; ama metin/yorumlar net olmalı).

### 4.5 `monitor-adapter.ts` — SİL

`MonitorAdapter` interface, 3 implementation class (Docker/Tmux/Subprocess), `createMonitorAdapter` factory: tamamı **0 production caller**. Backend abstraction olarak tasarlanmış ama wire edilmemiş.

- `src/orchestra/monitor-adapter.ts` (289 LoC) → **SİL**.
- Eğer ileride backend-agnostic monitor isteniyorsa, mevcut `src/monitor/auditor.ts` direct FS okumasından çıkıp adapter çağrısına evrilmesi için **yeni** bir ADR yazılır + minimal interface tasarlanır. Önceki adapter ne içermiş referans için git history yeterli.
- Bağlantılı test (`tests/core/error-handling-unification.test.ts:601` allowlist) güncellenir.

### 4.6 `manifest-migrator.ts` — SİL Veya KORU+DOC

V1→V2 manifest migration tamamlandı (Sprint 144-146 civarı). Mevcut kod (`src/core/manifest-migrator.ts`) production'da hiç kullanılmıyor, sadece kendi testi var.

- **Seçenek A (tercih):** SİL — git history geçişin tarihini korur. ADR-038 dispose kararı + amend gerekli.
- **Seçenek B:** KORU — eğer hâlâ "gelmesi olası V1 manifest" senaryosu bekleniyorsa, src/index.ts'ten erişilebilir tutmak için bir public migrate komutu CLI'ye eklenmeli; aksi hâlde ölü.

### 4.7 Rubric `_task` Parametreleri — DÜZELT

`src/orchestra/result-evaluator.ts:785-919` beş scoreXxx fonksiyonu: `_task` parametresi imzadan **kaldır** (eğer rubric registry imza zorunluluğu varsa, tip yerine `Pick<Task, ...>` minimum kullanılan alanlarla daralt; ama tüm beşi `_` prefix kullandığı için hiçbiri okumuyor).

Eğer hepsi imza-uyumluluğu için lazımsa, rubric registry tip imzasını gevşet (`(result: TaskResult) => RubricScore`); böylece downstream sözleşme net olur.

### 4.8 `export *` Barrel Pattern — DÜZELT (Aşamalı)

`src/index.ts`, `src/core/index.ts`, `src/core/types.ts` barrel'leri:
- Public API'yi açıkça liste hâline getir (`export { Foo, Bar, ... } from './foo.js'` formatı).
- Bu, kullanılmayan export'ların ileride otomatik tespitini mümkün kılar (örneğin `ts-prune` veya `knip` ile).
- OSS GA için kritik değil, ama Sprint 172+ "ts-prune ile periyodik dead-export taraması" hedefini destekler.

### 4.9 Madge Cycle Analizi — TAMAMLA (Sprint 172+)

Bu task'ta full cycle analizi yapılamadı (madge tool çağrısı gerekir). Sprint 172+ veya OSS GA hazırlık sprintinde:

```bash
npx madge --circular --extensions ts src/
```

çıktısını dökümante et. 0 sonuç ADR-008 disiplinini kanıtlar.

### 4.10 ADR-005 (Synchronous I/O Deprecated) — Çapraz Referans

Task 171-018 (Performance) detaylı inceleyecek; ancak `monitor-adapter.ts`'in `readFileSync`/`existsSync` kullanması bu ölü modülün silinmesi için ek bir gerekçe (ADR-005 ihlali tek darbe ile temizlenir).

---

## Cross-Sprint İlişki

- **Task 171-002** (orchestra routing): `rotateModelForFix` ve `debt-manager` denetimi; `parseDebtTable` ölü-yarı-ölü drift'i orada da gözükebilir.
- **Task 171-016** (ADR Compliance): ADR-028 (V1→V2 routing) ve ADR-038 (Dead Code Disposition) bulguları doğrudan girdi.
- **Task 171-022** (Memory DB Integrity): Debt DB-first iddiası vs `parseDebtTable` kullanımı orada çapraz doğrulama.
- **Task 171-029** (Synthesis): Bu raporun HIGH bulguları (Decision-Engine V1, monitor-adapter.ts) OSS GA blocker olmasa da Sprint 172 backlog'unun ilk sıralarına yerleşmeli.

---

_Rapor sonu. Kapsam Haritası YOK (cross-cutting concern, Plan §171-015 uyarınca)._
