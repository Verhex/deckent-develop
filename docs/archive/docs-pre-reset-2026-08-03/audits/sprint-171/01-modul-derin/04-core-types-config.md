# Sprint 171 — Task 4: core Tip + Config Denetimi

**Audit tarihi:** 2026-05-15
**Denetleyen:** w-171-004 (architect agent, opus model)
**Kapsam:** `src/core/types.ts`, tüm `src/core/*-types.ts`, `src/core/config.ts`, `src/core/config-migration.ts`, `src/core/model-registry.ts`, `src/core/mode-presets.ts`, `src/core/condition-evaluator.ts`, `src/core/manifest-migrator.ts`
**Mod:** Audit-only (kod/test/config değişmez)

---

## 1. Bulgular

Bu denetim, deckent'in tip sözleşmesini ve konfigürasyon yaşam döngüsünü yürüten modüllerin char-level taranmasıdır. Her bulgu öncelikle "doküman ne diyor" — "kod ne yapıyor" — "kullanıcı zihin modeline etkisi nedir" üçgeniyle değerlendirilmiştir. Aşağıdaki bulgular kanıt + öneri ile § 3 ve § 4'te detaylandırılmıştır.

### 1.1. KRİTİK: `dependency_pipeline_enabled` Üç Kademeli Drift (Doc-vs-Code-vs-Config)

Bu, denetimin **birincil meta-dogfood bulgusu** ve OSS GA blocker adayıdır. Aynı bayrak hakkında **dört bağımsız kaynak birbirinden farklı şey iddia ediyor**:

1. **Kod gerçeği — `src/core/config.ts:600`:** `createDefaultConfig()` içinde değer `true` olarak set ediliyor.
2. **Yorum/anchor — `src/core/config.ts:36-40`:** "Sprint 156 Task 2: default flipped false → true. Sprint 169 Task 9 (H5 GA anchor): confirmed production default."
3. **Tip JSDoc — `src/core/config-types.ts:489-490`:** `ResolvedConfig` üzerinde "Enable task dependency pipeline — only spawn tasks whose deps are DONE. **Default: false**" yazıyor. Bu JSDoc, kod default'una (true) doğrudan ters.
4. **DECKENT.md root rehber:** "Sprint 167 flip: `dependency_pipeline_enabled: true` — Wave scheduling goes live (anchor for Sprint 167 DIRECTIVES)". Hem flip sprint'i (Sprint 156 vs 167) hem de anchor sprint'i (Sprint 169 H5 vs Sprint 167) konusunda tutarsız.
5. **api-surface.md kontrat — satır 83:** "default since Sprint 156, confirmed Sprint 169 H5". DECKENT.md ile çelişiyor ama kod yorumuyla uyuşuyor.
6. **Project config gerçeği — `.deckent/config.json:198`:** `"dependency_pipeline_enabled": false`. Yani **bu repo'nun runtime gerçeği, kod default'unun TAM TERSİ**.
7. **DIRECTIVES.md (Sprint 171 mevcut):** "Brain Planning Instructions ... `dependency_pipeline_enabled: false` olduğundan Wave geçişleri + Task 29 synthesis dispatch Brain manuel". DIRECTIVES bu false durumunu doğru tanıyor ve aksiyona dönüştürüyor.

**Etki:**
- Yeni gelen mühendisin `dependency_pipeline_enabled` hakkında okuyabileceği her belge farklı şey söylüyor. Sprint 156 vs Sprint 167 flip iddiası bağımsız bir doc-vs-doc drift'tir.
- Daha kötüsü: tip dosyasının JSDoc'u (`config-types.ts:490`) "Default: false" diye yazıyor → bir okuyucu kod gerçeği yerine tip kontratını referans alırsa **tam tersi** sonuca varır.
- En kötüsü: proje config'i kod default'unu override edip `false` setliyor — bu kasıtlı (Sprint 165/164 dogfood gereği) ama hiçbir yerde "deckent'in kendi projesinde `false`, kullanıcı projesinde default `true`" şeklinde açıklanmamış. Bu **kullanıcı-yanıltıcı CRITICAL drift** çünkü OSS kullanıcı, deckent'in kendi config'inde gördüğü `false`'u referans alıp default sanabilir.

### 1.2. KRİTİK: Tip-vs-DeckentConfig Asimetrisi — `dependency_pipeline_enabled` Üye Eksikliği

`dependency_pipeline_enabled` alanı `ResolvedConfig` üzerinde (`config-types.ts:490`) tanımlı, **fakat `DeckentConfig` interface üzerinde tanımlı değil** (`config-types.ts:69-312` arası taranabilir). Bu eksiklik için `src/core/config.ts:44`'te ad-hoc bir `DeckentConfigWithPipeline` intersection alias'ı tanımlanmış ve aynı yorum açıkça "A follow-up sprint should add `dependency_pipeline_enabled` to `DeckentConfig` directly and remove this alias." diyor — yani kod kendisi bu duruma tech-debt olarak işaret koymuş. Aynı `as DeckentConfigWithPipeline` cast'i 3 yerde tekrarlanıyor (`config.ts:526`, `config.ts:883`, `config.ts:1400`) — bu da DRY ihlali ve tip güvenliği zayıflatıcı (cast = derleme zamanı kontrolünden vazgeçmek).

### 1.3. KRİTİK: CONFIG_METADATA Default Değerleri Kod Default'larından Sapıyor

`src/core/config.ts:992-1282` arası tanımlı `CONFIG_METADATA` tablosu, yardım metni üretiminin tek kaynağı. Default değerleri kullanıcıya `deckent config help`, `generateConfigReference()` üzerinden gösteriyor. Ancak bu değerler `createDefaultConfig()` ile **birden fazla yerde sistemli olarak uyumsuz**:

| Alan | CONFIG_METADATA default | createDefaultConfig gerçek default | Sapma kaynağı |
|------|-------------------------|------------------------------------|---------------|
| `mode` | `'balanced'` (config.ts:997) | `DEFAULT_MODE` constant'tan gelir (constants.ts) | Hard-coded vs constant — drift riski |
| `memory_budget` | `600` (config.ts:1210) | `5000` (config.ts:545) | "Sprint 140 pre-flight: 900→5000" yorumu yapılmış ama metadata güncellenmemiş |
| `decay_after_sprints` | `5` (config.ts:1216) | `20` (config.ts:546) | "Sprint 140 pre-flight: 5→20" yorumu yapılmış ama metadata güncellenmemiş |
| `claude_backend` | `'tmux'` (config.ts:1054) | Alan `createDefaultConfig`'den **silinmiş** (config.ts:533 yorum: "claude_backend removed (Sprint 150 Decision 3)") | Metadata, kaldırılmış alan hâlâ taşıyor |
| `dependency_pipeline_enabled` | **Metadata'da yok** | `true` (config.ts:600) | Üretimde aktif olan flag, kullanıcı yardımında görünmez |

CONFIG_METADATA'da olup `DeckentConfig` interface'inde bulunmayan alan görünmüyor ama `DeckentConfig`'te tanımlı olup metadata'da olmayan alanlar var: `api_auth_token` (config-types.ts:178), `plugin_require_signature` (281), `evaluation_rubric` (251), `rubric_max_retries` (253), `routing_engine` (265), `cleanup_delay_ms` (267), `routing_config` (269), `sprint_checkpoint_interval` (276), `timeout` (285), `observability` (289), `sprint_file_retention` (303), `nervous_system` (307), `output_render_mode` (135), `last_sprint_id` (75), `model_strategy` (106), `providers` (109), `human_checkpoints` (226), `coverage_threshold` (237), `max_reroutes` (239), `reroute_on_tech_debt` (241), `sprint_timeout_minutes` (243), `adaptive_thresholds` (257), `agent_min_score` (259), `adaptive_config` (261), `memory` V2 alt yapısı (194-211), `decision_engine`, `learning`, `collaboration`, `notifications` referansları.

Yani metadata, alanların **küçük bir alt kümesini** belgeliyor; geri kalanın help/reference çıktısında karşılığı yok.

### 1.4. YÜKSEK: SprintPhase Enum vs Doküman Drift

`src/core/sprint-types.ts:7-18` `SprintPhase` enum içeriği: `DIRECTIVE, PLAN, SPAWN, EXECUTE, EVALUATE, FIX, RETRO, DECAY, TRANSITION, COMPLETE`.

Bunu hem `.contracts/api-surface.md:78-87` hem `DECKENT.md` "Sprint Lifecycle" tablosu ile karşılaştırdığımızda:

| Doküman | Enum'da var mı? |
|--------|------------------|
| `PLAN` | ✓ |
| `SPAWN` | ✓ |
| `WAVE_BUILD` (api-surface 2a) | ❌ — enum'da yok, kod string olarak da kullanmıyor (`grep "WAVE_BUILD"` sprint-controller'da yok) |
| `EXECUTE` | ✓ |
| `EVALUATE` | ✓ |
| `FIX` | ✓ |
| `RETRO` | ✓ |
| `DECAY` | ✓ |
| `CLEANUP` (doc) ↔ `COMPLETE` (enum) | İsim drift — sprint-controller.ts:345 yorum "→ CLEANUP" diyor, ama gerçek atama `SprintPhase.COMPLETE` (sprint-controller.ts:756) |
| `DIRECTIVE` (enum'da var) | ❌ — dokümanda yok |
| `TRANSITION` (enum'da var) | ❌ — dokümanda yok |

**Etki:** Dashboard/auditor faz tracking'i için enum referans kabul ediliyor; doküman ise CLEANUP/WAVE_BUILD diye **var olmayan** isimler kullanıyor. Bir audit/UI geliştiricisi dokümanı baz alıp `phase === 'CLEANUP'` derse, runtime'da hiçbir zaman match etmeyecek.

### 1.5. YÜKSEK: ModelTier ve TIER_ORDER Tip Duplikasyonu

`ModelTier` tip union'u 2 ayrı yerde tanımlı:
- `src/core/model-registry.ts:12`
- `src/core/model-equivalence.ts:11`

İçerikleri şu an birebir aynı (`'economy' | 'standard' | 'premium' | 'premium_plus'`), ama yapısal sözleşme açısından çift kaynak = gelecekte birinde yeni tier eklendiğinde diğerinin atlanma riski. `model-equivalence.ts:11` `model-registry.ts`'ten import etmeli, kendi tanımını silmeli.

Aynı duplikasyon `TIER_ORDER` ve `compareTiers`/`isAtLeastTier` fonksiyonları için de geçerli:
- `src/core/model-registry.ts:181-186` — `TIER_ORDER` private
- `src/core/mode-presets.ts:85-90` — `TIER_ORDER` public export
- `src/core/model-registry.ts:260-262` — `compareTiers` method
- `src/core/mode-presets.ts:95-97` — `compareTiers` standalone fonksiyon
- `src/core/model-registry.ts:264-267` — `isAtLeastTier(modelId, minTier)` method
- `src/core/mode-presets.ts:102-104` — `isAtLeastTier(tier, minTier)` standalone (signature farklı!)

`model-registry.ts:264` modelId alıyor, `mode-presets.ts:102` direkt tier alıyor — farklı semantik ama aynı isim. Hangi `isAtLeastTier`'ı çağırdığını import path'ten çıkartmak gerek. Bu **API yüzeyi confusion** olarak HIGH severity.

### 1.6. YÜKSEK: ResolvedConfig Zorunlu/Opsiyonel Asimetrisi

`ResolvedConfig` interface'inde (`config-types.ts:419-503`) bazı alanlar `?` ile opsiyonel, bazıları zorunlu. Sıralama tutarsız:
- `coverage_threshold: number;` (zorunlu, 463) — `mergeConfigs` tarafından `?? 90` ile garanti ediliyor (config.ts:1390).
- `max_reroutes: number;` (zorunlu, 465) — yine `?? 3` garantili (config.ts:1391).
- Ama `coverage_threshold` `loadConfig`'te (config.ts:863) `??` ile dolduruluyor, yani opsiyonelliğin runtime'da garanti edildiğine güveniliyor.
- `memory_budget?: number;` (opsiyonel, 445) — `loadConfig`'te `config.memory_budget` doğrudan atanıyor (config.ts:849), eğer config'te yoksa `undefined` kalır. `createDefaultConfig`'te 5000 set ediliyor ama bu sadece **default config** içindir; minimal config dosyası gönderen kullanıcı için `undefined` mümkün.

Karışıklık şurada: `ResolvedConfig`'in "her şey resolve edilmiş, doldurulmuş" anlamına gelmesi beklenir. Ama `memory_budget?: number` ile bu sözleşme bozulur. Tüketici `config.memory_budget!` ile non-null assert etmek zorunda kalır → tip güvenliği zayıflar.

### 1.7. NORMAL: Task ve TaskResult Interface vs api-surface.md Kontrat Sapması

`.contracts/api-surface.md` "Task File Format (JSON)" şeması ile `task-types.ts:159-205` Task interface karşılaştırılırsa:

**Kod fazlası (kontratta yok):** `assignedWorker`, `isPriorityFix`, `fixForTaskId`, `estimatedTokens`, `updatedAt`, `routingMeta.rerouteCount`.

**Kontrat fazlası (kodda yok):** Kontratın `status` enum değer listesi 9 değer içeriyor (`DRAFT | PENDING | CLAIMED | EXECUTING | TESTING | DOCUMENTING | DONE | NO_GO | PAUSED`) ve bu kod TaskStatus enum'uyla birebir uyuşuyor — bu OK.

`TaskResult` (task-types.ts:289-323) vs api-surface.md "Result File Format":

**Kod fazlası:** `workerId` (zorunlu!), `agentId`, `skillIds`, `completedAt`, `durationMs`, `feedbackLoop`.

`workerId`'nin kontrat şemasında **olmaması** dikkat çekici çünkü `TaskResult.workerId: string` zorunlu (task-types.ts:291). Yani Worker bunu yazmak zorunda ama kontrat bahsetmiyor — kontrat alıcısı (Brain) bu alanı atlayabilir.

`rubricScores` alanı api-surface.md'de görünüyor ama task-types.ts:313'te `@deprecated Sprint 146` notu var. Kontrat deprecated alanı sürdürüyor — drift.

### 1.8. NORMAL: Type Re-export Disiplini — Barrel vs Direct

`src/core/types.ts:6-9` 4 ana domain'i (task, config, monitoring, sprint) re-export ediyor. Bu OK bir barrel; ama tüketiciler bazen barrel'dan, bazen alt dosyadan import ediyor:

- `src/core/config-types.ts:6` → `import type { DecisionEngineConfig, LearningConfig, CollaborationConfig } from './decision-config.js';` (direct)
- `src/core/agent-types.ts:2` → `import type { ModelType } from './types.js';` (barrel)
- `src/core/skill-types.ts:2` → `import type { ModelType } from './types.js';` (barrel)
- `src/core/decision-types.ts:2` → `import type { ModelType, TaskEffort, ... } from './types.js';` (barrel)
- `src/core/config.ts:14-24` → `import type { ... } from './types.js';` + `import { ALL_MODELS, ... } from './types.js';` (barrel)

Disiplinsiz. Disiplin ya **her şey types.js barrel'ından** ya **her şey domain dosyasından** olmalı. Şu an karışık, refactor sırasında circular import riski yaratır. `agent-types.ts` ve `skill-types.ts` `types.ts`'ten `ModelType` çekiyor ama types.ts barrel `task-types.ts`'ten geliyor — bu iki katmanlı bir yönlendirme.

### 1.9. NORMAL: ModelType "Union + (string & {})" Backward Compat Hack

`src/core/model-registry.ts:315` `export type ModelType = BuiltinModelId | (string & {});` — bu, builtin model ID union'una "ama isterse string olabilir" kaçışı ekleyen TypeScript hack'idir. `task-types.ts:19` ise `ModelType = ClaudeModel | OpenAIModel | GeminiModel` — yani sıkı union. Aynı isim, iki ayrı tanım. Tüketici hangi `ModelType`'ı import ettiğine bağlı olarak farklı davranır.

`task-types.ts:19` literal ile sıkı, `model-registry.ts:315` esnek. Birinci, builtin olmayan model ID'sini reddeder; ikincisi kabul eder. Tüketici şaşırır.

### 1.10. NORMAL: condition-evaluator Path Resolver Güvenlik Yüzeyi

`condition-evaluator.ts:11-20` `resolvePath()` fonksiyonu noktayla ayrılmış path'i `split('.')` ile çözüyor, her parçayı `current[part]`'a indexliyor. Şu anki kullanım `TaskDNA` üzerinde — yani TaskDNA brain tarafından üretiliyor ve güvensiz veri kaynağı değil. Ama:

- **Prototype pollution riski yok** çünkü `__proto__` veya `constructor` path'leri eşleştiğinde `current[part]` aslında prototip zincirini takip etmez (current bir Record olduğu sürece), ama yine de defensive olarak `if (part === '__proto__' || part === 'constructor' || part === 'prototype') return undefined;` guard'ı eklenmesi önerilir — özellikle eğer gelecekte external/user-supplied JSON üzerinde çalışacaksa.
- **DoS riski düşük:** Path "a.b.c..."'yi sınırsız zincirleme yapabilir, ama gerçek input TaskDNA olduğundan kontrollü.
- **Tek başına injection yüzeyi olarak şu an LOW**, gelecekte external veriye genişlerse HIGH.

`evaluateCondition` (40-72) "$and"/"$or" recursion limit'i yok. Yine input controlled ama hardening önerilir.

### 1.11. NORMAL: manifest-migrator Idempotent Ama Rollback Yok

`manifest-migrator.ts:28-42` `migrateAgentManifest` idempotent (line 29 `if (isV2Manifest(agent)) return agent;`). Bu doğru bir desen. Skill için de aynı (49-63).

Eksik: migrasyon **in-memory** sadece. Yorum "Runtime in-memory migration — does not write to disk." (line 4). Bu bir tasarım kararı ama yan etkisi: her başlangıçta v1 agent yüklenirse, her seferde tekrar migrate ediliyor. Performans yarı önemsiz (örnek 15 agent + 21 skill = 36 yapı) ama bir kez disk'e v2 olarak yazılırsa CPU tasarrufu olur. Ayrıca tarihsel olarak v1→v2 migration tek-yönlü; rollback yok. Eğer bir migrate kodu hata üretirse, v1 dosyalar disk'te kaldığı için "geri al" sağlanır — ama kod tarafında **eski activation kuralının** geri yüklenmesi yok. Düşük öncelik, dokümante edilmesi yeterli.

### 1.12. NORMAL: Tip Re-export'larında "Unused Export" Yokmuş Gibi Görünmesi

Her *-types.ts barrel re-export içinde tanımlı tipler, dış consumer'lar tarafından kullanılıyor mu? Hızlı taramayla:
- `decision-types.ts:60` `createDefaultAnalysis()` — `grep` ile sadece kendi dosyasında export'lanıyor, başka import yok (`grep -rn createDefaultAnalysis src/` ile doğrulanabilir — Task 171-015 dead code ile bağlanır).
- `decision-types.ts:81` `createDecisionLogEntry()` — aynı durum şüphesi.
- `task-types.ts:65` `UnknownModelError` — `task-types.ts` içinde fırlatılıyor, dış consumer kullanımı `task-types`'a izole.

Bu bulgular Task 171-015 (Dead Code) raporuna devredilecek; burada sadece tip dosyalarındaki potansiyel ölü export olduğu işaretlenir.

### 1.13. NORMAL: `validateConfig` Hata Mesajları Türkçeleştirilmemiş

Kullanıcı dil seçimi yapsa bile (`config.language: 'tr'`), `validateConfig` (config.ts:192-465) hata mesajları İngilizce hardcoded: "Invalid value '...' for field '...'. Valid options: ...". OSS GA öncesi `language === 'tr'` durumunda Türkçe hata mesajı dönmesi beklenebilir. Şu an i18n eksik. Düşük öncelik ama bütünsel UX kalitesi.

### 1.14. NORMAL: `loadConfig` Self-Healing Behavior Sürpriz

`config.ts:719-735` bozulmuş JSON için **otomatik backup + fresh default + üzerine yaz** davranışı uyguluyor. Bu **agresif self-healing** ve şaşırtıcı: kullanıcı kasıtla bozuk JSON yazdıysa (örnek manuel düzenleme sırasında syntax hatası), kaydetmeden yeniden açtığında **config'i kaybediyor**, sadece `.corrupted.<ts>.bak` dosyasında geri kalıyor. Mesaj Türkçe yazıyor (Sprint 165+ patch), ama yine de "kaydedilmemiş düzenlemen silindi" anlamına geldiğini açıkça söylemiyor. Riskli UX deseni — `--strict` flag ile bu davranış opt-in olabilir. NORMAL severity, OSS öncesi gözden geçirilmeli.

### 1.15. LOW: `Sprint 156 Task 2` Yorumu vs ADR Numarası

`config.ts:36-37` yorumu "Sprint 156 Task 2: default flipped false → true to activate the dependency pipeline". `.brain/exports/decisions.md:2851` ise "Sprint 156-002" karar log'unu işaret ediyor. Numara format'ı `Task 2` vs `156-002` arasında belirsiz. ADR governance kuralı (ADR-036) bir SDL kararının `decision-NNN-NNN.json` formatında saklanmasını öngörüyor. `Sprint 156 Task 2` referansı yorumda ham (bağlantısız), ADR-006/008/010 gibi resmi atıf değil. LOW önem ama tutarlılık için ADR-045 (Wave-Based) numarası eklenebilir — yorumda zaten var (line 39 "ADR-045"), tutarlı.

### 1.16. LOW: Provider Override Tip Çakışması (`PROVIDER_MODEL_MAP`)

`task-types.ts:25-35` `_providerMap` runtime'da `modelRegistry.getAllProviders()` üzerinden inşa ediliyor. Bu, `model-registry.ts:43` `BUILTIN_MODELS` const'a bağımlı **side-effect**. Eğer model-registry import side-effect üretmezse (örnek mock'ta), `PROVIDER_MODEL_MAP` boş döner. Test'lerde mock edilen senaryolarda risk var ama runtime'da OK. LOW severity, dokümantasyon notu yeterli.

### 1.17. LOW: ESM `.js` Uzantı Disiplini

ADR-002 (Node16 Module Resolution) gereği tüm relative import `.js` uzantı taşır. Hızlı tarama:
- `config.ts:4-28` — tüm relative import'lar `.js` ile (✓)
- `config-types.ts:4-8` — tüm `.js` (✓)
- `model-registry.ts:5` — `./errors.js` (✓)
- `mode-presets.ts:5` — `./model-equivalence.js` (✓)
- `condition-evaluator.ts` — relative import yok (✓)
- `manifest-migrator.ts:5-7` — tüm `.js` (✓)
- `task-types.ts:5` — `./model-registry.js` (✓)
- `config-migration.ts:17-21` — tüm `.js` (✓)

ESM disiplini bu modüllerde TAM. Sorun yok.

---

## 2. Severity

| Bulgu # | Başlık | Severity | OSS GA Blocker mı? |
|---------|--------|----------|---------------------|
| 1.1 | `dependency_pipeline_enabled` 4-kademeli drift | **CRITICAL** | **Evet** — kullanıcı yanıltıcı |
| 1.2 | DeckentConfig'te tipin eksikliği + 3 cast hack | **CRITICAL** | Hayır ama acil tech debt |
| 1.3 | CONFIG_METADATA defaultlarının drift'i | **CRITICAL** | **Evet** — `deckent config help` yalan söylüyor |
| 1.4 | SprintPhase enum vs doküman drift | **YÜKSEK** | Hayır ama dashboard/UI'ı kırar |
| 1.5 | ModelTier + TIER_ORDER + isAtLeastTier duplikasyonu | **YÜKSEK** | Hayır, refactor önerisi |
| 1.6 | ResolvedConfig opsiyonel/zorunlu asimetrisi | **YÜKSEK** | Hayır, tip güvenliği |
| 1.7 | Task/TaskResult interface vs api-surface kontrat sapması | **NORMAL** | Hayır, kontrat güncellemesi |
| 1.8 | Type re-export disiplin karışıklığı | **NORMAL** | Hayır |
| 1.9 | ModelType iki ayrı tanım | **NORMAL** | Hayır |
| 1.10 | condition-evaluator path resolver güvenlik | **NORMAL** | Hayır (şu an), gelecek için hardening |
| 1.11 | manifest-migrator rollback yokluğu | **NORMAL** | Hayır |
| 1.12 | Type re-export'larda potansiyel ölü export | **NORMAL** | 171-015 ile birleşik |
| 1.13 | validateConfig hata mesajları İngilizce | **NORMAL** | Hayır |
| 1.14 | loadConfig agresif self-healing UX | **NORMAL** | Olası — OSS öncesi gözden geçirilmeli |
| 1.15 | Sprint 156 Task 2 ADR atıf belirsizliği | **DÜŞÜK** | Hayır |
| 1.16 | PROVIDER_MODEL_MAP side-effect | **DÜŞÜK** | Hayır |
| 1.17 | ESM `.js` disiplini | **OK** | — (sorun yok) |

**Özet:**
- **3 CRITICAL** (Bulgu 1.1, 1.2, 1.3) — OSS GA öncesi mutlaka kapatılmalı.
- **3 YÜKSEK** (Bulgu 1.4, 1.5, 1.6) — Sprint 172 backlog.
- **8 NORMAL** — orta vadede, Sprint 172/173.
- **2 DÜŞÜK** — gözden geçirme zamanı geldiğinde.

---

## 3. Kanıt

Bulguları doğrulayan `file:line` referanslarının özeti:

| Bulgu # | Kanıt — birincil dosya:satır | İkincil kanıt |
|---------|------------------------------|----------------|
| 1.1 | `src/core/config.ts:600` (`dependency_pipeline_enabled: true`) | `src/core/config-types.ts:489-490` (JSDoc "Default: false"); `.deckent/config.json:198` (`false`); `DECKENT.md:51` ("Sprint 167 flip"); `.contracts/api-surface.md:83` ("Sprint 156 ... Sprint 169 H5"); `DIRECTIVES.md` Brain Planning satırı; `.brain/exports/decisions.md:2851` ("Sprint 156-002") |
| 1.2 | `src/core/config.ts:44` (`type DeckentConfigWithPipeline`) | `src/core/config.ts:526, 883, 1400` (3 cast); `src/core/config-types.ts:69-312` (DeckentConfig — `dependency_pipeline_enabled` yok) |
| 1.3 | `src/core/config.ts:1210` (`memory_budget default: 600`) | `src/core/config.ts:545` (gerçek 5000); `src/core/config.ts:1216` (`decay_after_sprints default: 5`) vs `:546` (gerçek 20); `:1054` (`claude_backend metadata`) vs `:533` (yorum "removed"); `dependency_pipeline_enabled` metadata bütünüyle yok |
| 1.4 | `src/core/sprint-types.ts:7-18` (enum: DIRECTIVE, TRANSITION, COMPLETE) | `.contracts/api-surface.md:78-87` (CLEANUP, WAVE_BUILD); `src/orchestra/sprint-controller.ts:345` (yorum "→ CLEANUP") vs `:756` (`sprint.phase = SprintPhase.COMPLETE`) |
| 1.5 | `src/core/model-registry.ts:12` + `src/core/model-equivalence.ts:11` (ModelTier 2 yer) | `model-registry.ts:181-186` + `mode-presets.ts:85-90` (TIER_ORDER); `model-registry.ts:260-262` + `mode-presets.ts:95-97` (compareTiers); `model-registry.ts:264-267` + `mode-presets.ts:102-104` (isAtLeastTier farklı signature) |
| 1.6 | `src/core/config-types.ts:463` (`coverage_threshold: number;` zorunlu) | `:445` (`memory_budget?: number;` opsiyonel); `src/core/config.ts:849` (atama doğrudan, fallback yok); `:863-866` (`?? 90` fallback) |
| 1.7 | `src/core/task-types.ts:159-205` (Task) | `.contracts/api-surface.md:9-43` (Task şeması — `assignedWorker`, `isPriorityFix`, `fixForTaskId`, `estimatedTokens`, `updatedAt` yok); `task-types.ts:291` (`workerId` zorunlu) vs api-surface "Result File Format":52-77 (`workerId` yok); `task-types.ts:309-314` (`rubricScores @deprecated Sprint 146`) vs api-surface kontrat sürdürüyor |
| 1.8 | `src/core/config-types.ts:4-8` (direct import) | `src/core/agent-types.ts:2` (barrel); `skill-types.ts:2` (barrel); `decision-types.ts:2` (barrel); `config.ts:14-24` (barrel + symbol mix) |
| 1.9 | `src/core/model-registry.ts:315` (`type ModelType = BuiltinModelId \| (string & {})`) | `src/core/task-types.ts:19` (`type ModelType = ClaudeModel \| OpenAIModel \| GeminiModel`) |
| 1.10 | `src/core/condition-evaluator.ts:11-20` (`resolvePath` __proto__ guard yok) | `:40-72` (`evaluateCondition` recursion limit yok) |
| 1.11 | `src/core/manifest-migrator.ts:4` (yorum "in-memory") | `:29, :50` (idempotency check); rollback fonksiyonu yok |
| 1.12 | `src/core/decision-types.ts:60` (`createDefaultAnalysis`) | `:81` (`createDecisionLogEntry`); `task-types.ts:65` (`UnknownModelError`) — Task 171-015 cross-ref |
| 1.13 | `src/core/config.ts:197-201` (İngilizce hata: "Invalid value '...' for field 'mode'") | Tüm `errors.push(...)` çağrıları İngilizce hardcoded |
| 1.14 | `src/core/config.ts:719-735` (corrupted JSON → backup + fresh default + on-disk overwrite) | `:727-730` (Türkçe console.error mesajı ama "kayıtsız düzenlemen silindi" notu yok) |
| 1.15 | `src/core/config.ts:36-40` yorum ("Sprint 156 Task 2") | `.brain/exports/decisions.md:2851` ("Sprint 156-002") — numara format'ı farklı |
| 1.16 | `src/core/task-types.ts:25-35` (`_providerMap` modelRegistry import side-effect) | `model-registry.ts:308` (`export const modelRegistry = new ModelRegistry();` — module-load time singleton) |
| 1.17 | Tüm ilgili dosya import bloklarında `.js` uzantı tutarlı (özet) | `config.ts:4-28`, `config-types.ts:4-8`, `model-registry.ts:5`, `mode-presets.ts:5`, `manifest-migrator.ts:5-7`, `task-types.ts:5`, `config-migration.ts:17-21` |

---

## 4. Öneriler

Önceliklendirilmiş, action-driven aksiyon listesi. Sprint 172 backlog'una akışı önerilen sıralama.

### P0 — OSS GA Blocker (Sprint 171/172 başında kapanmalı)

**P0-1. `dependency_pipeline_enabled` Tek Kaynak Hizalama (Bulgu 1.1)**
1. `config-types.ts:489-490` JSDoc'unu `**Default: true** since Sprint 156 (per ADR-045)` olarak düzelt.
2. `DECKENT.md:51` "Sprint 167 flip" satırını `Sprint 156 default flip; Sprint 169 H5 GA anchor reconfirm` olarak güncelle.
3. `.deckent/config.json:198` `false` override'ı için **açık bir yorum dosyası** (`.deckent/config-notes.md` veya inline) ekle: "Deckent kendi projesinde manuel dispatch protocol (ADR-047) ile çalıştığından `false`; OSS kullanıcı default'u `true`'dur."
4. `.brain/exports/decisions.md:2851` Sprint 156-002 satırı ile Sprint 167 flip iddiasını uyumlu hale getir (yeni decision-NNN-NNN.json yaz: "Sprint 167 anchor = reconfirmation, Sprint 156 = original flip").

**P0-2. `dependency_pipeline_enabled` Tip Üyeliği (Bulgu 1.2)**
1. `config-types.ts` `DeckentConfig` interface'ine `dependency_pipeline_enabled?: boolean;` ekle (yorum "Default: true since Sprint 156; ADR-045 anchor").
2. `config.ts:44` `DeckentConfigWithPipeline` alias'ını sil.
3. `config.ts:526, 883, 1400` 3 cast'i kaldır, direkt `DeckentConfig` üzerinde kullan.

**P0-3. CONFIG_METADATA Drift Eradikasyonu (Bulgu 1.3)**
1. `memory_budget` default'unu `600 → 5000` (config.ts:1210).
2. `decay_after_sprints` default'unu `5 → 20` (config.ts:1216).
3. `claude_backend` metadata entry'sini sil (config.ts:1054-1060).
4. `dependency_pipeline_enabled` metadata entry'si ekle.
5. Eksik 23 alan için metadata satırı ekle: `api_auth_token`, `plugin_require_signature`, `evaluation_rubric`, `rubric_max_retries`, `routing_engine`, `cleanup_delay_ms`, `routing_config`, `sprint_checkpoint_interval`, `timeout`, `observability`, `sprint_file_retention`, `nervous_system`, `output_render_mode`, `last_sprint_id`, `model_strategy`, `providers`, `human_checkpoints`, `coverage_threshold`, `max_reroutes`, `reroute_on_tech_debt`, `sprint_timeout_minutes`, `adaptive_thresholds`, `agent_min_score`, `adaptive_config`, `memory` (V2 alt yapı).
6. **Veya** — metadata'yı otomatik olarak `createDefaultConfig()` çıktısından üreten bir generator yaz (drift'i yapısal olarak imkânsız kıl).

### P1 — Yüksek Öncelikli (Sprint 172)

**P1-1. SprintPhase enum vs doküman hizalama (Bulgu 1.4)**
1. `sprint-types.ts:7-18` enum'una `CLEANUP = 'CLEANUP'` veya `COMPLETE`'i `CLEANUP` olarak yeniden adlandır (api-surface kontratını referans al).
2. `WAVE_BUILD` faz string'ini ekle (faz bir sub-phase olarak SPAWN'a aitse, yine de tag'lemek için).
3. Sprint-controller içinde `SprintPhase.COMPLETE`'i `SprintPhase.CLEANUP` ile değiştir veya **dokümandan CLEANUP'ı çıkar, COMPLETE'i resmileştir**. Hangisi seçilirse, **api-surface.md** + **DECKENT.md** + kod birebir eşit hale gel.
4. `DIRECTIVE` ve `TRANSITION` enum üyelerini dokümante et (eğer kullanılıyorsa) veya kaldır (eğer ölü).

**P1-2. Tier ortak tanım birleştirme (Bulgu 1.5)**
1. `ModelTier` tek kaynak `model-registry.ts:12` olsun; `model-equivalence.ts:11`'i bu modülden import et.
2. `TIER_ORDER` tek kaynak — `mode-presets.ts:85`'i kaldır, `model-registry.ts:181`'i export et.
3. `compareTiers`, `isAtLeastTier` fonksiyon adlandırmasını netleştir: `isAtLeastTier(tier, minTier)` vs `isModelAtLeastTier(modelId, minTier)` — farklı isim, farklı semantik.

**P1-3. ResolvedConfig zorunlu alanlar (Bulgu 1.6)**
1. `coverage_threshold`, `max_reroutes`, `reroute_on_tech_debt`, `sprint_timeout_minutes`, `adaptive_thresholds`, `agent_min_score`, `adaptive_config`, `deckent_style` — bunlar `ResolvedConfig`'te zorunlu (zaten doldurulur garanti).
2. `memory_budget`, `decay_after_sprints`, `patterns_enabled`, `project_identity_enabled`, `scan_interval`, `heartbeat_timeout`, `boundary_enforcement`, `lock_stale_threshold`, `human_checkpoints`, `fix_phase_enabled`, `max_fix_retries`, `ai_planner_timeout`, `rollback_policy`, `evaluation_rubric`, `rubric_max_retries`, `routing_engine`, `routing_config`, `cleanup_delay_ms`, `dependency_pipeline_enabled`, `sprint_checkpoint_interval`, `timeout`, `nervous_system`, `observability` — `loadConfig`'te garanti edilirse zorunlu yap; aksi takdirde `?` koru ama her tüketici defansif ol.
3. Tek kural: `ResolvedConfig` "her şey resolve'lu" sözleşmesi — `?` sadece gerçek opsiyonel için.

### P2 — Orta Vadeli (Sprint 172/173)

**P2-1. Task/TaskResult kontrat hizalama (Bulgu 1.7)**
- `.contracts/api-surface.md` Task şemasına `assignedWorker`, `estimatedTokens`, `routingMeta.rerouteCount` ekle.
- `Result File Format` `workerId: string` zorunlu olarak işaretle.
- `rubricScores` deprecated notunu kontrata da yansıt.

**P2-2. Type import disiplini (Bulgu 1.8)**
- Lint rule: tüm core/ içi import barrel `types.js`'i kullansın **veya** tümü direct domain dosyasını. Karışık kullanım yasak.

**P2-3. ModelType tek tanım (Bulgu 1.9)**
- `task-types.ts:19` literal union'u kaldır, `model-registry.ts:315`'ten import et. `BuiltinModelId` esnek literal builtin tarafından korunur, ek runtime hata atılmaz.

**P2-4. condition-evaluator hardening (Bulgu 1.10)**
- `resolvePath` içinde `__proto__`, `constructor`, `prototype` path parça guard'ı ekle (input controlled olsa bile defensive).
- `evaluateCondition` recursion depth limit (örnek 32).

**P2-5. manifest-migrator persist (Bulgu 1.11)**
- v1 manifest dosyaları için bir kerelik `migrate --persist` opsiyonu — disk'e v2 olarak yaz, böylece her yüklemede tekrar migrate edilmez.

**P2-6. validateConfig i18n (Bulgu 1.13)**
- `config.language === 'tr'` durumunda Türkçe mesajlar.

**P2-7. loadConfig self-healing UX iyileştirmesi (Bulgu 1.14)**
- Bozulmuş config tespit edildiğinde process exit ile `deckent config recover` komutunu çalıştırmasını öner (otomatik üzerine yaz yerine).
- Veya `--strict` opsiyonu kullanıcı tercihine bırak.

### P3 — Düşük Öncelikli (gözden geçirme)

**P3-1. ADR atıf tutarlılığı (Bulgu 1.15)** — Yorum format'ını "Sprint 156-002 / ADR-045" gibi birleşik kullan.

**P3-2. PROVIDER_MODEL_MAP test dokümantasyonu (Bulgu 1.16)** — Test'lerde `model-registry` mock'lanırsa boş döner uyarısı.

---

## 5. Kapsam Haritası

Aşağıdaki tablo bu Task'ın denetim kapsamına dahil her kaynak dosyayı + LoC + birincil amacı + bu raporda hangi bulgularla bağlantılı olduğunu listeler. Sprint 171 Plan Task 171-004 bölümünde belirtilen kapsamla birebir uyum sağlamak için.

| # | Dosya | LoC | Amaç | Bulgu ref. |
|---|-------|-----|------|-----------|
| 1 | `src/core/types.ts` | 9 | Barrel re-export (task/config/monitoring/sprint domain'leri) | 1.8 |
| 2 | `src/core/task-types.ts` | 361 | Task, TaskResult, ModelType, ProviderName, TaskStatus, EvaluationRubric, FeedbackLoop, TokenUsage, WorkerQuestion, BrainAnswer | 1.7, 1.9, 1.12 |
| 3 | `src/core/config-types.ts` | 618 | DeckentConfig, ResolvedConfig, PlanModeConfig, SkillConfig, AdaptiveConfig, TimeoutConfig, NervousSystemConfig, SprintFileRetentionConfig, ProjectAnalysis, SystemProfile, AutoDocsConfig, StartOptions, DoctorResult | 1.1, 1.2, 1.6, 1.7 |
| 4 | `src/core/sprint-types.ts` | 143 | SprintPhase, SprintStatus, Sprint, SprintMetrics, SprintResult, DebtPriority, DebtItem, MemoryEntry, PatternEntry, DecayResult, BrainContext, ProjectState | 1.4 |
| 5 | `src/core/monitoring-types.ts` | 123 | AgentStatus, AgentRole, Heartbeat, AgentInfo, AlertLevel, Alert, BoundaryViolationType, DashboardState, LockInfo, SkillMeta | (yan kapsam) |
| 6 | `src/core/agent-types.ts` | 96 | AgentDefinition, AgentStats, AgentPool, AgentSelectionResult, MultiAgentPipelineStep, createDefaultStats, createAgentDefinition | 1.8 |
| 7 | `src/core/skill-types.ts` | 114 | SkillDefinition, SkillCategory, StackDetectionRule, PromptInjectionConfig, SkillStats, ProjectStack, SkillSelectionResult | 1.8 |
| 8 | `src/core/heartbeat-types.ts` | 38 | ACTIVE_EXECUTION_STATUSES, COMPLETED_STATUSES, PRE_EXECUTION_STATUSES (TaskStatus alt kümeleri) | (sorun yok) |
| 9 | `src/core/memory-types.ts` | 187 | (Memory V2 — başka task'ta detaylı denetlenir, burada sadece tip dosyası kapsamında yüzeysel) | (Task 171-005'e devr) |
| 10 | `src/core/routing-types.ts` | 213 | IntentType, SubIntentType, OperationType, TaskDNA, TaskSize, ActivationRule, ExclusionRule, ActivationConfig, RoutingDecision, OverrideSource, SkillBudget, UserOverride, LearningBonus, RoutingEngineConfig | (sorun yok — burada hızlıca taranıp 171-006'ya devr) |
| 11 | `src/core/decision-types.ts` | 94 | TaskType, TaskAnalysis, DecisionLogEntry, DecisionResult, DecisionContext, createDefaultAnalysis, createDecisionLogEntry | 1.8, 1.12 |
| 12 | `src/core/nervous-types.ts` | 331 | (Nervous System tipleri — Task 171-008 detayında) | (yan kapsam) |
| 13 | `src/core/config.ts` | 1403 | createDefaultConfig, loadConfig, mergeConfigs, validateConfig, ConfigValidationError, deepMerge, DEFAULT_MODES, DEFAULT_TIMEOUT_CONFIG, MODE_ALIASES, CONFIG_METADATA, generateConfigReference, resolveEffectiveWorkers, validatePartialConfig, loadGlobalConfig, saveGlobalConfig, readAuthMode, clearConfigCache | 1.1, 1.2, 1.3, 1.13, 1.14, 1.15 |
| 14 | `src/core/config-migration.ts` | 637 | needsMigration, migrateConfig, migrateConfigInMemory, migrateConfigFull, migrateConfigV1ToV2, removeDuplicateKeys, getMissingFields, modelToTier, pruneConfigBackups, hasDuplicateKeys | (idempotency OK, dead code yok) |
| 15 | `src/core/model-registry.ts` | 315 | BUILTIN_MODELS (13 model), ModelTier, ModelStatus, ModelCapabilities, ModelDefinition, ModelRegistry class, modelRegistry singleton, BuiltinModelId, ModelType | 1.5, 1.9 |
| 16 | `src/core/mode-presets.ts` | 112 | ModelStrategy, MODE_PRESETS (4 mode), TIER_ORDER, compareTiers, isAtLeastTier, getModePreset | 1.5 |
| 17 | `src/core/condition-evaluator.ts` | 160 | resolvePath, evaluateCondition, matchValue, evaluateOperators (\$gt, \$gte, \$lt, \$lte, \$contains, \$in, \$not, \$exists, \$and, \$or) | 1.10 |
| 18 | `src/core/manifest-migrator.ts` | 63 | needsMigration, isV2Manifest, migrateAgentManifest, migrateSkillManifest | 1.11 |

**Toplam:** 18 dosya, **5017 LoC** (raw), `wc -l` ile doğrulandı (4380 LoC çekirdek kapsam + 637 config-migration). Sprint 171 Plan Task 171-004 runbook'unda belirtilen tüm dosyalar kapsanmıştır.

**Boşta dosya:** Yok — Task 171-004 kapsamı bu raporda **%100 union** ile doludur. Coverage-gap = 0.

---

**Rapor sonu.** Bu denetim, Sprint 171 Wave 1'in 4. task'ı olarak audit-only modda yürütüldü; hiçbir kaynak/test/config/db dosyası modify edilmemiştir. memory.db üzerinde yalnızca read-only `SELECT` denenmedi (statik analiz yeterli olduğundan). Bulguların hepsi `file:line` kanıtlı; CRITICAL/YÜKSEK öneriler Sprint 172 OSS GA backlog girdisi olarak Task 171-029 sentezine devredilir.
