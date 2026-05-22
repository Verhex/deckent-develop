# Sprint 188 W1-T03 — `src/core/` Çekirdek Modül Sağlığı Raporu

> **Task:** 188-003 — W1-T03 (W1 envanter dalgası)
> **Tip:** audit (ADR-053) — yalnızca analiz, kaynak kod değişmez.
> **Worker:** w-188-003 (Claude Opus, docker backend)
> **Tarih:** 2026-05-22
> **Kapsam:** `src/core/` — 93 `.ts` modülü + 5 alt dizin + 2 ek statik veri dosyası.
> **Kaynak doğrulama:** her bulgu `dosya:satır` referansıyla — yalnızca tek yönlü okuma.

---

## 1. Modül Envanteri — `src/core/`

| Ölçüt | Değer | Kanıt |
|-------|-------|-------|
| `src/core/` toplam giriş (dizin + dosya) | 100 | `ls src/core/ \| wc -l` |
| `*.ts` dosya sayısı (top-level, recursive yok) | 93 | `find src/core -maxdepth 1 -name '*.ts' \| wc -l` |
| Alt dizin sayısı | 5 | `builtins/`, `marketplace/`, `notification-providers/`, `notify-adapters/`, `rule-templates/` |
| Statik veri dosyası | 2 | `pricing-data-baseline.json`, `cost-config-schema.json` |
| `*-types.ts` tip dosyası | 11 | `agent`, `config`, `decision`, `heartbeat`, `memory`, `monitoring`, `nervous`, `routing`, `skill`, `sprint`, `task` |

CLAUDE.md "core/ — 90 modül" iddiası kabaca tutarlı, ancak gerçek `.ts` modül sayısı **93** (alt dizinler hariç). 3 modülün eklendiği ama doğal-dil dokümana yansımadığı tespit edilmiştir. Önerilen güncelleme: CLAUDE.md `core/ — 93 modül + 5 alt dizin` (Bkz. `CLAUDE.md` Architecture bölümü).

`*-types.ts` ailesi 11 dosyaya kadar büyümüş. Burada dikkat çekici nokta: yalnızca 4 tanesi (`task-types`, `config-types`, `monitoring-types`, `sprint-types`) `types.ts` barrel'ından (`src/core/types.ts:10-13`) yeniden ihraç ediliyor. `memory-types`, `routing-types`, `agent-types`, `skill-types`, `heartbeat-types`, `nervous-types`, `decision-types` direkt import ediliyor (örn. `src/core/routing-engine.ts:28`'in dolaylı bağımlılığı). Bu, barrel asimetrisi yaratır — kasıtlı olabilir ama davranışsal olarak iki sınıf "tip dosyası" oluşmuş.

---

## 2. `config.ts` — 3-Katman Merge Sağlığı

**Toplam:** 1704 satır (büyük modül, modülerleştirme adayı).

3-katman merge düzeni `loadConfig()` içinde tutarlı (`src/core/config.ts:866-923`):

1. `createDefaultConfig()` (satır 879) → derin kopya defaults.
2. `GLOBAL_CONFIG_PATH` → `~/.deckent/config.json` → `deepMerge(config, globalConfig)` (satır 881-884).
3. Proje config → `PROJECT_CONFIG_PATH` → `deepMerge(config, projectConfig)` (satır 888-913).

İlave davranışlar:
- **Self-healing:** Bozuk JSON tespit edilirse zamanlı backup oluşturulur + defaults ile devam edilir (`config.ts:892-906`). Sprint 176 retro'su gerekçesi (`config.ts:1177` yorumu).
- **Env var overrides** (`config.ts:941-`): `DECKENT_BRAIN_PROVIDER` / `WORKER_PROVIDER` / `FALLBACK_PROVIDER` proje config'in üzerine biner; bu **resmi 3-katman + 1** olarak değerlendirilebilir.
- **Grouped → flat projection** (`config.ts:932-937`): `providers.brain/worker/fallback/overrides` runtime'da flat alanlara akıtılır — backward compat. Sprint 150 D4 yorumlu, açık ve kalıcı bir şim.
- **Cache** (`config.ts:870-877`): `cachedConfig + cacheStamp` + `getConfigMtime(root)` ile O(1) tekrar-okuma. `DECKENT_CONFIG_RELOAD=1` veya `force:true` ile bypass.

**`dependency_pipeline_enabled` default değeri:**
- `createDefaultConfig()` içinde **`true`** (`config.ts:759`).
- Yorum bandı: Sprint 156 T2 flip + Sprint 169 H5 GA-anchor onayı; ADR-045 gerekçe.
- Bu **kod gerçeği**dir → DECKENT.md "Mandatory Architecture Rules" iddiası tutarlı.
- `REGEN_TEMPLATE_DEFAULTS.dependency_pipeline_enabled: false` (`config.ts:1182`) — yalnızca **deckent-dev kendi projesi** için regen şablonu; ADR-047 manuel wave kuralıyla uyumlu, kullanıcı projeleri için default'u etkilemez (Sprint 176/177 yorumu).
- `mergeConfigs()` ikinci sigorta (`config.ts:1694-1695`) ve ResolvedConfig projection (`config.ts:1064-1065`) her ikisi de `?? true` ile fallback uygular.

**Bulgu:** `DeckentConfigWithPipeline` alias'ı `config.ts:47`'de tanımlanmış — `dependency_pipeline_enabled` `DeckentConfig` interface'inde tanımlı değil ama `ResolvedConfig`'te var (`config.ts:32-47` yorumu). Bu yan kapı (`as DeckentConfigWithPipeline` cast) typescript tipini geçici olarak gevşetiyor; **gerçek follow-up:** alias'ı kaldırıp alanı `DeckentConfig`'e taşımak — yorum bandı bunu zaten not ediyor (`config.ts:42-45`).

---

## 3. Routing 3-Katman Bütünlüğü

**Layer 1 — Intent Classification** (`src/core/intent-classifier.ts`, 466 LoC):
- `classifyIntent()` (satır 55) → 9 üretken yardımcı (`detectPrimaryIntent`, `detectSecondaryIntents`, `detectDomains`, `detectOperations`, `analyzeComplexity`, `analyzeWriteScope`, `detectSubIntent`, `detectTags`).
- TaskDNA üreten saf-fonksiyon: task.title + description + scope girer; intent + complexity + scope DNA çıkar.

**Layer 2 — Activation Engine** (`src/core/activation-engine.ts`, 320 LoC):
- 7 üretken export: `evaluateActivation`, `evaluateRuleViaSecondary`, `evaluateRule`, `evaluateExclusion`, `migrateV1AgentToActivation`, `migrateV1SkillToActivation`, `getDynamicExclusions`.
- Migration helpers V1 → V2 manifest geçişi için canlı (`manifest-migrator.ts:7` çağırıyor).
- `condition-evaluator.ts` (160 LoC) — path-based `$gt`, `$contains`, `$and`, `$or` koşul motoru burayı destekler (`activation-engine` tarafından dolaylı).

**Layer 3 — Routing Engine** (`src/core/routing-engine.ts`, 686 LoC):
- `routeTaskV2()` (satır 113) → ana giriş: TaskDNA üret (satır 126) → override resolve (satır 130) → agent select (satır 137-180) → skill select → confidence → return RoutingDecision.
- ADR-028 default-since-Sprint-067 doğrulandı: `task-router.ts` provider routing yapar, agent+skill routing'i `routeTaskV2` üzerinden V2 motora bırakır. `task-router.ts:9-11` `routeTask()` provider routing'ini koruyor — ADR-015 6-seviyeli mantık + ADR-028 V2 ikinci katman senkron.
- Production çağırıcılar: `sprint-planner.ts:61`, `mid-sprint-adapter.ts:10`. (Test+core dışı, gerçek üretim katmanı.)

**3-Katman senkron mu?** Evet. `core/index.ts:32-34`'te üçü de tekil olarak ihraç ediliyor — disiplinli bir public yüzey.

**Decision-Engine V1 izleri:** `src/orchestra/decision-engine.ts:12` yorumda "V2 routing uses routeTaskV2 from routing-engine.ts (line 690+)" notu var; bu V1→V2 geçişinin tarihçesini gösteriyor ama V1 hala bir dosya olarak duruyor — Sprint 189 follow-up için **ölü-V1 izlerini temizleme** önerilir (ayrı bir görev olmalı, audit-only sprintte deftere yazılır).

---

## 4. Model Registry — 13 Model / 3 Provider / 4 Tier Doğrulaması

**Modül:** `src/core/model-registry.ts` (315 LoC).

**Model sayımı** (`model-registry.ts:46-171`):

| Provider | Modeller | Adet |
|----------|---------|------|
| claude | opus, sonnet, haiku | 3 |
| codex | o3, gpt-5, gpt-4.1, o4-mini, gpt-5-mini, gpt-4.1-mini | 6 |
| gemini | gemini-3.1-pro-preview, gemini-2.5-pro, gemini-2.5-flash, gemini-2.0-flash | 4 |
| **Toplam** | | **13** |

**Tier dağılımı:**

| Tier | Modeller | Adet |
|------|---------|------|
| premium_plus | o3, gemini-3.1-pro-preview | 2 |
| premium | opus, gpt-5, gemini-2.5-pro | 3 |
| standard | sonnet, gpt-4.1, o4-mini, gemini-2.5-flash | 4 |
| economy | haiku, gpt-5-mini, gpt-4.1-mini, gemini-2.0-flash | 4 |

**Doğrulama:** DECKENT.md "13 models, 3 providers, 4 tiers" + tier eşdeğerlik tablosu kod gerçeğiyle **%100 tutarlı**. Ayrıca `model-equivalence.ts:14-19` tier dizilerini doğrudan `modelRegistry.getByTier()`'dan türetiyor — single-source-of-truth disiplini canlı. `task-types.ts:26-28, 43, 50` da aynı kaynaktan türetiyor.

**API yüzeyi:** `get`, `getOrThrow`, `has`, `getByProvider`, `getByTier`, `getByProviderAndTier`, `getAllProviders`, `getAllModels`, `getAllModelIds`, `getNumericTier`, `resolveApiId`, `unregister`. Pluggable register/unregister mevcut ama runtime'da çağıran yok — yalnızca tester/CLI cost komutu için reaktif. Sprint 189 follow-up: registry'ye dinamik model ekleme noktasının pratik bir kullanım senaryosu olup olmadığını sorgula.

---

## 5. Memory V2 — DB-First Bütünlüğü

**Modül seti:** `memory-store.ts` (959 LoC), `memory-query.ts` (415 LoC), `memory-export.ts` (364 LoC), `memory-import.ts` (530 LoC), `memory-normalize.ts` (38 LoC), `memory-types.ts` (225 LoC) — **toplam 2531 LoC, src/core'un yaklaşık %20'si.**

**Schema** (`memory-store.ts:95-225`):
- 5 normal tablo: `entries`, `tags`, `relations`, `entry_history`, `schema_version`.
- 1 sanal tablo: `entries_fts` FTS5 (satır 224).
- 1 index: `idx_entries_decay` (satır 163) decay sorgusu için.
- DECKENT.md schema iddiası kod gerçeğiyle uyumlu.

**EntryType taxonomi** (`memory-types.ts:11-21`): 10 tip → `adr, memory, sprint, debt, pattern, retro, error, identity, audit, custom`. CLAUDE.md "ADR, memory, sprint, debt, pattern, retro, identity" listesinden `error`, `audit`, `custom` eksik — düzeltilmesi gereken doc-drift (W2 doc-drift task'ı için işaret).

**Export yüzeyi** (`memory-export.ts`):
- `exportSummaryMd` (satır 45), `exportDecisionsMd` (114), `exportMemoryMd` (159), `exportDebtMd` (197) — dördü de `cli/commands/memory.ts:7,104-107` + `identity-generator.ts:245,252-255` tarafından çağrılıyor. **Canlı.**
- `exportAdrsToFs` (satır 305) → `src/` içinde **0 çağırıcı**, yalnızca `tests/core/adr-fs-export.test.ts:17,68,103,135` test referansı. **Test-only export** (dead production candidate).

**Import yüzeyi** (`memory-import.ts`):
- `parseDecisionsMd` (58), `parseMemoryMd` (125), `parseDebtMd` (200), `extractKeywords` (37), `extractSprintFromDebtId` (178) → CLI `memory rebuild` akışı (`cli/commands/memory.ts`) tarafından kullanılır. Canlı.
- `backfillDebtSprintIds` (307) → yalnızca `tests/core/parse-debt-md.test.ts` test referansı. **Test-only.**
- `backupRelations` (360), `restoreRelations` (375), `rebuildWithRelationSafety` (414) → yalnızca `tests/core/memory-rebuild-safety.test.ts`. **Test-only kümesi.**
- `backfillSprintMemoriesFromSprintsDir` (468) → `src/` ve `tests/` içinde **0 çağırıcı**. **Tam ölü export** — Sprint 189 temizlik adayı.

**Query yüzeyi** (`memory-query.ts`):
- `escapeFts5Query` (41), `searchMemory` (160) → çağrılıyor (dolaylı `getByType` yerine ağır kullanılan FTS API).
- `buildAutoQuery` (402) → yalnızca `tests/core/memory-query.test.ts`. Yorum bandı "Brain lifecycle integration" diyor ama Brain çağrı noktası yok. **Yarı-ölü** (planlanmış ama bağlanmamış API).

**Normalize:** `memory-normalize.ts` (38 LoC) `turkishNormalize()` küçük ama kritik. FTS5 dual-layer search için 8 kolonun yarısı bu fonksiyondan üretiliyor (`memory-store.ts:224` civarı).

**Bulgu özeti:** Memory V2 DB-first omurgası canlı ve sağlam — export 4/5 canlı, import core 3/9 canlı (kalan 6'sı test-only veya tam ölü). **Sprint 189 temizlik fırsatı:** 1 tam-ölü + 4 test-only fonksiyon kaldırma adayı; ~150 LoC.

---

## 6. ADR-008 Import-Direction Sağlığı

ADR-008 ihlal taraması (`core/` → `orchestra|agents|monitor|nervous|connectors|providers|api|cli|mcp|dashboard`):

| Dosya:Satır | İçerik | Statü |
|-------------|--------|-------|
| `src/core/notify.ts:17` | `import { eventBus } from '../orchestra/event-bus.js';` | ❌ ADR-008 ihlali |

**Tek ihlal**. Diğer 92 modül core sınırı içinde kalıyor. `authority-enforcer.ts:496-518` ADR-008 detektörü tam olarak bu yönü `description: 'ADR-008 violation: core/ module imports from orchestra/'` mesajıyla tespit ediyor. Şu an enforcement **soft/advisory** olduğundan build engellenmiyor ama Sprint 189 önerisi: `eventBus`'u core içine taşı veya dependency-inversion uygula (`authority-enforcer.ts:518` amendment proposal'ı zaten bunu öneriyor).

Bu bulgu, `src/core/notify.ts:1-15` yorum bandında "Sprint 150 Hot Fix H6 — DECKENT→USER:NOTIFY runtime wire" olarak belgelendirilmiş — yani **bilinen ama kabul edilmiş** bir kısayol; W2-T12 ADR uyum denetimi tarafından bayraklanmalı.

---

## 7. ESM `.js` Uzantı Uyumu

**Sonuç:** `src/core/` içindeki tüm relative importlar `.js` uzantısı taşıyor — 0 sapma.

Test komutları:
- `grep -rEn "from '\\./[a-zA-Z][^']*'" src/core/ | grep -v "\\.js'"` → **boş**.
- `grep -rEn "from '\\.\\./[^']+'" src/core/ | grep -v "\\.js'"` → **boş**.

ADR-002 (Node16 module resolution) ve ADR-001 (TypeScript + ESM) bu modülde tam tutarlı.

---

## 8. Ölü/Yarı-Ölü Modül Adayları

Test-only çağırıcı + 0 production çağırıcı koşulunu sağlayan modüller (production'da ölü modüller):

| Dosya | Sınıf/Fonksiyon | Test çağırıcı | Production çağırıcı |
|-------|----------------|---------------|--------------------|
| `src/core/cascade-detector.ts:47` | `CascadeDetector` class | `tests/core/cascade-detector.test.ts` | **0** |
| `src/core/agent-cache.ts` | `AgentSelectionCache` | `tests/core/agent-cache.test.ts:2-3` | **0** |
| `src/core/skill-cache.ts` | `SkillLoadingCache` | `tests/core/skill-cache.test.ts:3` | **0** |
| `src/core/lazy-loader.ts` | `lazyLoad`, `LazyMap` | `tests/core/lazy-loader.test.ts:2` | **0** |

Ek olarak Memory V2 grubunda 4 test-only fonksiyon + 1 tam-ölü (`backfillSprintMemoriesFromSprintsDir`) Bölüm 5'te listelenmiştir.

**Toplam dead-code çapı (kaba tahmin):** ~700-900 LoC, 4 dosya + 5-6 fonksiyon. Sprint 186 audit task'ında `cascade-detector.ts` denetiminin **NO_GO** ile sonuçlanması (recent learnings) bu modüllerin disposition kararının bir sonraki sprint'e ertelendiğini gösteriyor. ADR-038 (Dead Code Disposition) iyileştirme zemini hazır.

---

## 9. Tip Bütünlüğü ve Barrel Asimetrisi

`*-types.ts` 11 dosyada toplanmış. `src/core/types.ts` yalnızca 4 modülü yeniden ihraç ediyor (`task-types`, `config-types`, `monitoring-types`, `sprint-types`). Geri kalan 7 tip modülü doğrudan import edilmek üzere bırakılmış:

- `routing-types.ts` → 100+ yerden import (Sprint 067'den beri V2 routing'in çekirdek tipi).
- `memory-types.ts` → 30+ yerden import (Memory V2'nin tip alfabetik tabanı).
- `agent-types.ts`, `skill-types.ts` → pool/registry modüllerinden import.
- `heartbeat-types.ts`, `nervous-types.ts`, `decision-types.ts` → domain-specific, dar consumer kümesi.

Bu asimetri **bilinçli ya da organik?** Tahmin: organik. Yeni modüller (memory, routing, nervous) eklendikçe `types.ts` barrel'a katılmamış. Sprint 189 önerisi: barrel'a tam toplama eklenip eklenmeyeceğine karar — public API hijyeni meselesi (kasıtlı dış kapamaysa ADR-036 amendment'ında belgelenmeli).

**Tip kalitesi:** `memory-types.ts` `EntryType` (`memory-types.ts:11-21`) ve `MemoryEntryV2` (62) net; `routing-types.ts` `TaskDNA`, `ActivationConfig`, `RoutingDecision` üçlüsü `core/index.ts:23-26`'da `export type` ile re-export ediliyor. Type-only re-export disiplini iyi.

---

## 10. Ek Bulgular ve Notlar

- **`config.ts` boyutu (1704 LoC)** — modülerleştirme için en güçlü aday. `createDefaultConfig` (674-836), `loadConfig` (866-1135), `mergeConfigs` (1644-1700), `regenerateConfigSafe` (1208+) ayrı dosyalara çıkarılabilir; god-object split disiplini ADR-026'ya yakın bir patika izleyebilir.
- **`memory-store.ts` (959 LoC)** — keza modüler bölünme adayı: schema-init, CRUD, FTS5 bridge, decay ayrılabilir.
- **`routing-engine.ts` (686 LoC)** — V2 motoru olgun ama tek dosyada; agent-selection / skill-selection / confidence / override-resolve helper'ları küçük modüllere bölünebilir.
- **`builtins/` dizini** taranmadı (bu görev top-level modüllere odaklandı); başka bir audit task'ı için aday.
- `notification-providers/` (`discord`, `slack`, `webhook`) — üçü de `notifications.ts` interface'inden import ediyor, üçü de canlı (`grep` ile en az 1+ wire).
- `cost-config-schema.json` + `pricing-data-baseline.json` — `pricing-updater.ts` ve `cost-config-loader.ts` tarafından kullanılıyor, runtime cost takibi canlı (`cli/commands/cost.ts:24`).

---

## Özet

`src/core/` modülünün **omurgası sağlam**. config 3-katman merge tutarlı ve `dependency_pipeline_enabled` default `true` (Sprint 156+169 onaylı). Routing 3-katman (intent → activation → routing-engine v2) ADR-028'e uygun çalışıyor; provider routing `task-router.ts` üzerinden ayrı seviyeyi koruyor (ADR-015). Model Registry 13 model / 3 provider / 4 tier iddiası **%100 tutarlı**. Memory V2 DB-first 5 tablo + FTS5 schema canlı ve **dual-layer turkishNormalize** çekirdek normalize çalışıyor. ESM `.js` uzantı uyumu %100. Tek **ADR-008 ihlali** `src/core/notify.ts:17`'de tespit edildi (bilinen ve advisory durumda). Toplam ~93 modülün içinde ölü/yarı-ölü production üye sayısı 4 dosya + 5-6 fonksiyon (~700-900 LoC) — ADR-038 disposition kuyruğuna girmesi gereken net adaylar. CLAUDE.md/DECKENT.md modül sayıları minör güncelleme istiyor (90 → 93).

## Sprint 189 Follow-up

1. **`docs/audits/sprint-188/doc-code-drift.md` (W2-T11)** için girdi: CLAUDE.md `core/ — 90 modül` ifadesini `93` ile güncelle; DECKENT.md `EntryType` taxonomi listesine `error`, `audit`, `custom` ekle.
2. **ADR-008 ihlali fix** (`src/core/notify.ts:17` → `../orchestra/event-bus.js`): dependency-inversion (core'da interface, orchestra'da impl) veya event-bus'u core'a taşı. `authority-enforcer.ts:518` amendment proposal hazır.
3. **Ölü/yarı-ölü modül disposition** (ADR-038 ekseni):
   - Kaldırma adayları: `cascade-detector.ts`, `agent-cache.ts`, `skill-cache.ts`, `lazy-loader.ts`, `memory-import.ts:backfillSprintMemoriesFromSprintsDir`.
   - "Wire-or-remove" adayları: `memory-query.ts:buildAutoQuery` (yorum "Brain lifecycle integration" diyor ama yok), `memory-export.ts:exportAdrsToFs`, `memory-import.ts:rebuildWithRelationSafety + backup/restoreRelations + backfillDebtSprintIds`.
4. **`DeckentConfig` → `dependency_pipeline_enabled` alanını ekle**, `DeckentConfigWithPipeline` alias'ını ve `as` cast'lerini sil (`config.ts:42-47, 1064, 1694`).
5. **`config.ts` (1704 LoC) ve `memory-store.ts` (959 LoC) modülerleştirme** — ADR-026 god-object split patikası uygulanabilir.
6. **`types.ts` barrel asimetrisi kararı**: ya `memory-types`/`routing-types`/`agent-types`/`skill-types`/`heartbeat-types`/`nervous-types`/`decision-types` da barrel'a katılır, ya da bu durum ADR-036 amendment olarak belgelenir.
7. **`builtins/` alt dizini için ayrı audit task** (bu envanter top-level `.ts` modülleriyle sınırlı kaldı).
