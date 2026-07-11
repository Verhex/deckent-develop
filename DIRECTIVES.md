# DIRECTIVES — SPRINT-405: FAZ-3 SERTLEŞTİRME (609 mem-tenant · 612 plugin-auth · 605 stats-sidecar)

## Goal
Faz-3 (GOAL-v3): çok-tenant/enterprise sertleştirme. Yasa #2 (her-ortam + milyon-ölçek + multi-tenant)
bu sprint'in anayasası — ama her task tek-kullanıcı davranışını BİREBİR korur (additive-safe).

## 🔒 BAĞLAYICI (her task)
- Yalnız kendi Files/Scope'una yaz · git stash/reset YASAK · **build YASAK (npm run build dahil — dist'e ASLA dokunma; volume-mount host'u ezer)** · notes TEK STRING · Self DÜRÜST.
- REPRODUCE-first: önce mevcut davranışı kanıtlayan RED/ölçüm, sonra fix; kanıtı notes'a yaz.
- Değişen modülü import eden TÜM testleri koş (`VITEST_MAX_FORKS=2 npx vitest run <ilgili dizinler>`).

## Task 1: MEM-TENANT — born-609 (P0): MemoryQuery tenant-scoping (additive)
- Model: sonnet
- Files: src/core/memory-types.ts, src/core/memory-query.ts, src/api/memory-search-endpoint.ts, tests/core/memory-tenant-scope.test.ts
- Scope: src/core/, src/api/, tests/core/
- Dependencies: none
### Description
SORUN: MemoryQueryParams'ta tenant kavramı YOK; FTS query-layer tenant-predicate üretmiyor →
multi-tenant kurulumda her principal tüm memory'yi okur (Yasa #2 ihlali; enterprise-gate ön-şartı).
FIX (additive-safe): (1) memory-types'a opsiyonel `tenantId?: string`; (2) memory-query predicate:
tenantId VERİLDİĞİNDE hem yapılandırılmış-filtre hem FTS-yolu `tenant_id = ?` daraltması üretir;
tenantId YOKKEN mevcut yol BYTE-AYNI (regresyon-pin: aynı fixture-DB'de tenant'sız sorgu fix-öncesi/
sonrası aynı satırları döner); (3) memory-search-endpoint request-principal'dan tenantId'yi çözer ve
query'ye geçirir (principal-tenant zaten ws-gateway/audit'te var — aynı çözümleme kaynağını kullan,
yeniden icat etme; principal yoksa tenant'sız yol). SINIR — BİLİNÇLİ KAPSAM-DIŞI: LEGACY-NULL-TENANT
politikası (strict-flip sonrası NULL-tenant eski-satırların kaderi: fallback-mı-migration-mı) ALPEREN
kararı bekliyor — bu task'ta strict-mod/flip YOK, yalnız opsiyonel-daraltma; notes'a "legacy-NULL
kararı açık" düş. RED-önce: tenant-kolonlu fixture-DB'de bugün tenantId geçmenin HİÇBİR filtre
üretmediğini kanıtla. Şema: tenant_id kolonu yoksa migration EKLEME — kolonu koşullu-kullan
(PRAGMA table_info ile varlık-kontrolü; yoksa predicate atlanır + honest-warn döner) — DB-şema
mutasyonu ayrı-karar.
### goNogo
- goCriteria: RED-kanıt; tenantId-verili sorgu yalnız o tenant'ın satırlarını döner (FTS dahil); tenant'sız yol byte-aynı (pin-test); endpoint principal→tenant threading testli; kolon-yoksa dürüst-atlama testli; memory importer testleri yeşil.
- nogo: DB-şema migration eklenirse NO_GO; tenant'sız davranış değişirse NO_GO.

## Task 2: PLUGIN-AUTH — born-612 (P1): plugin özgünlük + path-containment
- Model: sonnet
- Files: src/core/plugin-loader.ts, tests/core/plugin-authenticity.test.ts
- Scope: src/core/, tests/core/
- Dependencies: none
### Description
SORUN (marketplace-öncesi gate): (1) entrypoint-hash ≠ imza — publisher-key/trust-root doğrulaması yok
(hash yalnız bütünlük, kimlik değil); (2) unsigned-plugin sessizce yükleniyor; (3) allowed-path
kontrolü zayıf (prefix-tabanlı → `/plugins-evil` `/plugins`'i geçer sınıfı). FIX: (1) detached-signature
doğrulama iskeleti: plugin-manifest'te opsiyonel `signature{alg:'ed25519', publisherKeyId, sig}`;
doğrulama `src/core/signature.ts` MEVCUT Ed25519 altyapısını kullanır (yeniden icat ETME — skill-imza
deseninin aynısı); trust-root = config `plugins.trusted_publisher_keys[]` (resolver-passthrough
ÜÇLÜSÜ: tip+iki-resolver+roundtrip — born-464 dersi). (2) unsigned-plugin politikası: default =
YÜKLE + LOUD-WARN (stderr, her yüklemede; sessiz-geçme YASAK); `plugins.require_signature: true`
(default false) → unsigned = yükleme-red (fail-closed, enterprise-profil 534'e hazırlık). (3)
path-containment: prefix-karşılaştırma yerine `path.relative()` tabanlı gerçek-containment
(başında `..` yok + absolute-değil) — Windows-ayracı dahil (Yasa #2; sep-karışık testler). RED-önce:
(a) bugün sahte-imzalı/imzasız plugin'in sessizce yüklendiği, (b) `/plugins-evil` prefix-bypass'ının
bugün GEÇTİĞİ fixture-kanıtları.
### goNogo
- goCriteria: RED-kanıtlar; imzalı-plugin doğrulanır + bozuk-imza red (testli); unsigned default loud-warn + require_signature=true'da red; path-containment relative-tabanlı (evil-prefix + `..`-kaçış + Win-sep testleri); config-üçlüsü tam; plugin-loader importer testleri yeşil.
- nogo: unsigned sessiz-yükleme kalırsa NO_GO; containment yalnız POSIX test edilirse NO_GO.

## Task 3: STATS-SIDECAR — born-605 (P1): canlı agent/skill stats'ı git-tracked manifest'ten gitignored sidecar'a
- Model: sonnet | Agent: refactorer
- Files: src/core/agent-pool.ts, src/core/skill-pool.ts, src/orchestra/sprint-finalizer.ts, tests/core/stats-sidecar.test.ts
- Scope: src/core/, src/orchestra/, tests/core/
- Dependencies: none
### Description
SORUN: canlı stats (totalUses/successRate/avgCoverage/lastUsedInSprint) git-tracked agent/skill
manifest'lerine yazılıyor → her sprint repo-diff kirliliği + hermetiklik vakaları (C5) + iki-ağaç
sync-çatışması. FIX (davranış-koruyucu taşıma): (1) yeni gitignored sidecar
`.deckent/stats/catalog-stats.json` (tek-ledger: {agents:{id:{...}}, skills:{id:{...}}}, atomic
tmp+rename yazım); (2) OKUMA birleşik: pool'lar stats'ı sidecar'dan yükler; sidecar'da yoksa
manifest'teki mevcut değere düşer (migration-dostu okuma — tüketiciler [marketplace/rating/routing
learningBonus] AYNI değerleri görmeye devam eder, regresyon-pin); (3) YAZMA: sprint-finalizer stats
güncellemesini SADECE sidecar'a yapar (manifest'e stats-yazımı biter); (4) migration: ilk sidecar-yazımında
manifest'teki mevcut stats değerleri sidecar'a taşınır (manifest re-zero'lama BU task'ta YAPILMAZ —
git-tracked dosyaları toplu değiştirmek ayrı-onay; notes'a düş). `.gitignore`'a `.deckent/stats/`
zaten-yoksa ekleme gerekir → SINIR: .gitignore Files'ında değil; gitignore-satırını notes'a öner
(Brain ekler). RED-önce: bugün finalizer'ın manifest'i mutasyona uğrattığının fixture-kanıtı.
### goNogo
- goCriteria: RED-kanıt; finalizer artık manifest'e stats yazmaz (pin) + sidecar atomic-yazım; okuma-birleşik (sidecar>manifest-fallback) tüketici-regresyon-pin'li; ilk-yazım migration'ı testli; pool/finalizer importer testleri (AGSK ailesi dahil) yeşil.
- nogo: tüketicilerin gördüğü stats değerleri değişirse NO_GO; manifest re-zero yapılırsa NO_GO.
