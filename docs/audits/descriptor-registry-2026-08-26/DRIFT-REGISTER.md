# Config Descriptor Registry — Drift Register

## Disposition

- **Faz-A outcome:** analiz artefaktları ve plan için `GO`, product implementation için `NO-GO`.
- **Product outcome:** canonical descriptor registry, generated projections ve required equality
  gate üretimde wired olmadan `CONFIG-TRUTH-001` kapanamaz.
- **Finding policy:** Aşağıdaki üretim değişiklikleri bu lane'de uygulanmaz. Her biri exact current
  source location ve ana-şeridin uygulayacağı önerilen diff'i taşır.

## Ölçüm özeti

| Ölçüm | Audit `d2e9a1247` | Live base `abed38c5…` | Yorum |
|---|---:|---:|---|
| `DeckentConfig` root | 141 | 142 | `evaluation` live delta |
| Shallow declaration leaf | 449 | 450 | Completeness census'i değildir |
| Semantic authored leaf-pattern | 1.002 | yeniden üretilmedi | TypeChecker audit authority |
| Normalized audit union path | 1.146 | yeniden üretilmedi | Authored+default+runtime+metadata+input union |
| Raw default leaf | 180 | 181 | Named authority'ler ayrıca vardır |
| Runtime-parser leaf | 185 | 186 | `ResolvedConfig` root sayısı değildir |
| `CONFIG_METADATA` | 55 | 55 | Live root artışını takip etmedi |
| Dashboard `CONFIG_FIELDS` | 66 | 66 | Ayrı handwritten katalog |
| Truth diagnostic | 589 | 592 | Expected-red; defect sayısı değil |

## Bulgular

### DR-001 — Config population için tek census identity yok

**Severity:** HIGH · **Product:** `BLOCKS_CONFIG_TRUTH_DONE` · **Audit:** CFG-021

`scripts/lint-config-truth.mjs:55-74` yalnız aynı source file içindeki interface ve basit type
reference'larını genişletir. Imported alias, mapped type, `Record`, array, discriminated union ve
dynamic namespace kaybolduğu için 449→1.002 semantic expansion görünmez. Live `evaluation` alanı
shallow sayımı 450'ye çıkarmış, fakat semantic census için generated manifest yoktur.

**Önerilen diff (ana-şerit):** `scripts/lint-config-truth.mjs:55-274` textual parser'ı canonical
registry compiler census'iyle değiştir; `schemaDigest`, `rootCount`, `semanticLeafPatternCount`,
`variantLeafCount`, `dynamicContractCount`, lifecycle dağılımı ve artifact-specific eligibility
count'larını üreten deterministic manifest kullan. Parser candidate'larını behavioral proof olarak
terfi ettirme.

### DR-002 — Authored, resolved, schema ve default authority'leri bölünmüş

**Severity:** HIGH · **Product:** `BLOCKS_CONFIG_TRUTH_DONE` · **Audit:** CFG-005/006/008/021

Authored contract `src/core/config-types.ts:1023`, resolved contract
`src/core/config-types.ts:2041`, defaults `src/core/config.ts:1909`, manual validation
`src/core/config.ts:736`, live resolver `src/core/config.ts:2255,2464` ve secondary resolver/default
family'leri ayrı yazılmaktadır. Aynı alanın authored presence'i, effective default'u ve runtime
projection'ı birlikte değişmek zorunda değildir.

**Önerilen diff (ana-şerit):** config-facing schema graph'ını domain descriptor modules'tan compile
et; `DeckentConfig` ve `ResolvedConfig` generated re-export olsun. `createDefaultConfig`, strict
runtime parse/canonicalize ve pure resolver generated descriptor strategiesini tüketir. Active
field için authored→resolved projection veya explicit lifecycle disposition yoksa compile fail.

### DR-003 — `CONFIG_METADATA` iddiası ve i18n contractı gerçek değil

**Severity:** HIGH · **Product:** `BLOCKS_CONFIG_TRUTH_DONE` · **Audit:** CFG-012

`src/core/config.ts:2924-2927` metadata'yı “every top-level” diye tanımlar; live durumda 55 entry
vardır. Pinned audit bu 55 entry'nin yalnız 49 typed root'u örttüğünü, 92 root'u eksik bıraktığını
ve type-dışı `chat_provider` içerdiğini kanıtlar. Live 55 entry'nin yalnız 4'ünde `descriptionTr`
vardır; kalan 51 English literal taşır.

**Önerilen diff (ana-şerit):** `src/core/config.ts:2912-3298` handwritten interface/object'ini
generated config catalog re-export'uyla değiştir. Descriptor raw description taşımasın;
`titleKey`, `descriptionKey`, diagnostic keys ve category key taşısın. Generator en/tr message
catalog parity'sini fail-closed doğrulasın; CLI `getMessage(key, lang)` üzerinden resolve etsin.

### DR-004 — CLI discovery incomplete metadata'yı schema diye sunuyor

**Severity:** HIGH · **Product:** `BLOCKS_CONFIG_TRUTH_DONE` · **Audit:** CFG-012/020

`src/cli/commands/config.ts:6,209-235` list/keys yüzeyi doğrudan `CONFIG_METADATA` tüketir.
`src/core/config.ts:3304-3369` help/category/reference çıktıları da aynı partial listeden türer.
Category/default/description string'leri CLI action içinde hard-coded biçimde formatlanır.

**Önerilen diff (ana-şerit):** CLI discovery'yi application-service `ConfigCatalogSnapshot`ına
bağla; lifecycle, authored/effective default ayrımı, sensitivity-redacted output ve stable JSON
schema digest'i döndür. Human labels `getMessage` ile resolve edilsin; `INTERNAL`, `REMOVED` ve
platform-unsupported alanlar policy'ye göre typed gösterilsin veya reddedilsin.

### DR-005 — Dashboard 66 alanlık ikinci schema/default/i18n authority'sidir

**Severity:** HIGH · **Product:** `BLOCKS_CONFIG_TRUTH_DONE` · **Audit:** CFG-012/019

`src/dashboard/src/pages/ConfigPage.tsx:33-142` 66 handwritten `CONFIG_FIELDS` tanımlar; labels,
descriptions, types, options, categories ve defaults duplicate authority'dir. Viewer read-only
olmasına rağmen browser `src/dashboard/src/pages/ConfigPage.tsx:210-211` üzerinden full raw/default
payload alır. Audit stale provider, spawn, routing, human checkpoint, memory ve notification
semantics'ini kanıtlamıştır.

**Önerilen diff (ana-şerit):** `ConfigFieldMeta`/`CONFIG_FIELDS`/`CATEGORIES` bloklarını sil;
server-side descriptor projectionından schema-digest-bound, localized, sensitivity-filtered
observability catalogu tüket. Secret-hidden field payloadı browser'a hiç gönderilmesin. Dashboard
observe-only policy'si korunmalı; write eklenmemeli.

### DR-006 — EN/TR schema docs parity'li ama frozen ve stale

**Severity:** HIGH · **Product:** `BLOCKS_CONFIG_TRUTH_DONE` · **Audit:** CFG-012/014

`docs/en/reference/configuration-schema.md:9,203` ve TR karşılığı 164 built default leaf iddiasını
taşır. İki dilde 164 default-table row path-parity vardır, fakat audit authored semantic evreni
1.002 leaf-pattern ve normalized union'ı 1.146 path'tir. `spawn_backend` iki dilde de Docker default
gösterirken live canonical default `auto`dur (`docs/*:55`). Source line evidence'ı da eski line
numaralarına bağlıdır.

**Önerilen diff (ana-şerit):** her iki dosyayı registry compiler çıktısı yap; generated header'a
schema version/digest, authored/effective/starter default ayrımı, lifecycle, impact, sensitivity
projectionı ve generation source receipt'i ekle. en/tr aynı field ID/path setini taşımalı; prose
message key parity gate'i ayrıca çalışmalı.

### DR-007 — Altı default semantic authority kararı typed HOLD'dur

**Severity:** HIGH · **Product:** `OWNER_DECISION_HOLD` · **Audit:** CFG-011

Çelişkiler: `mode` performance/balanced; `memory_budget` 5000/600/900;
`decay_after_sprints` 20/5; `spawn_backend` auto/docker; `docker_timeout` absent/1200;
`dependency_pipeline_enabled` true/false. Registry bu değerlerden birini parser sırasına göre
“canonical” seçemez. Default taxonomy her competing value'yu `EFFECTIVE_DEFAULT`,
`STARTER_VALUE`, `SAFETY_FALLBACK` veya stale/removed authority olarak owner kararıyla
sınıflandırmalıdır.

**Önerilen diff (ana-şerit):** owner karar receipt'leri registry descriptor provenance'ına
bağlanmadan ilgili generated defaultları cutover etme. Karar matrisi `HANDOFF.md` içindedir.

### DR-008 — Runtime validation open-world ve lifecycle-blind

**Severity:** HIGH · **Product:** `BLOCKS_CONFIG_TRUTH_DONE` · **Audit:** CFG-006/010/021

Manual `validateConfig` bütün schema'yı kapatmaz; ayrı Zod/resolver schema'ları farklı subset'ler
taşır. Type dışı runtime dialectleri (`chat.*`, `chat_provider`, `max_workers`,
`token_throttle_ms`, `_auto_detected` ve başka extension path'leri) canonical lifecycle olmadan
cast/raw read üzerinden yaşayabilir. Unknown key ile declared dynamic namespace ayrımı tek strict
grammar'da çözülmez.

**Önerilen diff (ana-şerit):** generated strict runtime schema global olarak unknown-key reject
etsin; yalnız registry'de `dynamicNamespace` tanımı olan path'ler key grammar/value schema ile
genişleyebilsin. Legacy alias, deprecated field, internal runtime state ve unknown typo farklı error
code/migration davranışı taşısın.

### DR-009 — Init/onboarding/regenerate starter values effective defaults ile karışıyor

**Severity:** HIGH · **Product:** `BLOCKS_CONFIG_TRUTH_DONE` · **Audit:** CFG-014

CLI init, MCP init, onboarding ve regenerate ayrı sparse/template authority'lerdir. Bugünkü schema
ve metadata “default” kelimesiyle effective absence semantics, authored starter document ve
recovery fallback'ını ayırmaz.

**Önerilen diff (ana-şerit):** registry her field için exact default taxonomy taşısın; generated
profile planner yalnız `STARTER_VALUE` ve explicit profile policy tüketirken pure resolver yalnız
`EFFECTIVE_DEFAULT`/`POLICY_INHERITED`/`PLATFORM_RESOLVED` tüketir. Recovery fallback reason-code ve
receipt olmadan normal default gibi gösterilemez.

### DR-010 — Truth gate required pipeline'da değildir

**Severity:** HIGH · **Product:** `BLOCKS_CONFIG_TRUTH_DONE` · **Audit:** CFG-021

`scripts/script-registry.json:542-548` wiring'i deferred diye kaydeder; `package.json:62`
`lint:gates` zincirinde `lint-config-truth.mjs` yoktur. Mevcut expected-red parser required gate'e
kör biçimde bağlanamaz; önce false positives ve semantic gaps kapanmalıdır.

**Önerilen diff (ana-şerit):** yeni compiler/equality gate shadow modda frozen baseline +
only-decrease değil, exact generated equality ile çalışsın. Generated outputs temiz olduktan sonra
`package.json:62` ve script registry entry required local/CI gate'e aynı ürünleştirme package'ında
bağlansın. Gate dependency veya TypeChecker unavailable ise exit 2 typed fault versin; pass'e
düşmesin.

## Scope dışı fakat cross-link zorunlu findings

- MASTER 471 transactional mutation/secret custody authority'sidir; descriptor registry
  sensitivity, authored/effective/provenance ve impact sözleşmesini üretir ama writer/CAS/fsync
  service'inin yerine geçmez.
- MASTER 4210 security config consolidation authority'sidir; descriptor registry typed path,
  default, lifecycle ve projection üretir ama behavioral security consumer proof'unun yerine
  geçmez.
- Faz-A bu iki outcome'u uygulamaz; `PLAN.md` dependency ve acceptance cross-link'lerini taşır.
