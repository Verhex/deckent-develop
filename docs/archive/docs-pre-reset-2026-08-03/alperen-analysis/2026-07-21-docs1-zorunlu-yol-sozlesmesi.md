# 2026-07-21 — `docs/` → `docs1/` Kararı: ZORUNLU-YOL SÖZLEŞMESİ

> **Alperen-kararı (2026-07-21):** Dokümanlar sıfırdan yazılacak; `docs/` klasörü `docs1/` olarak
> yeniden adlandırılıp parkedilecek; deckent belli olgunluğa gelince gerekli+eksik dokümanlar en
> baştan (çok-dilli programla: en/tr + popüler diller) yapılacak.
> **Bu doküman:** yeniden adlandırma ANI'nda neyin kırılacağının ve YENİ doc-ağacının hangi yolları
> korumak ZORUNDA olduğunun kesin sözleşmesi. **Negative-space: bu bir uygulama-planı DEĞİL** —
> aksiyon Alperen-emriyle; aşağıdaki 3 karar-noktası kapanmadan rename YAPILMAZ (kayıp-rotası).
> Yöntem: 1 kapsamlı keşif (7 tüketici-sınıfı) + el-teyitleri. docs/ = **718 tracked dosya**.

---

## 1. ZORUNLU-YOL ÇEKİRDEĞİ — yeni doc-ağacı bu yolları GÜN-1'den taşımak zorunda

> "Yeni yazılacak dokümanlar bu yolda olmalı" listesi. Tüketicisi kod/test/CI — yol korunmazsa
> tüketici güncellenmek zorunda.

| Zorunlu yol | Asgari içerik-şartı | En kritik tüketici |
|---|---|---|
| `docs/guide/` | ≥3 md; `getting-started.md` + `quickstart.md` şart | docs-structure.test.ts:10-48 (+~7 test) |
| `docs/reference/` | ≥5 md; `api.md` + `config-reference.md` + `mcp-guide.md` şart | docs-structure.test.ts:53-71 + `gen-reference-docs` YAZAR + auditor `dependencies.md` okur |
| `docs/architecture/` | ≥1 md; `agents.md` | docs-structure.test.ts:79 |
| `docs/development/` | ≥2 md; `agent-guide.md` · `repo-sync.md` · `smoke-verify.md` | 4 test |
| `docs/release/` | ≥2 md; `release-checklist.md` · `release-notes.md` · `beta-tracker*.md` | 5 test + managed-docs runtime |
| `docs/adr/` | `*.md` + `README.md` (AUTOGEN) | adr-constraints.test + `docs:ref:check` + `docs:stats:check` (release-gate!) |
| `docs/CHANGELOG.md` | — | changelog doc-updater **YAZAR** (finalizer) |
| `docs/SPRINT-LOG.md` | — | sprint-log doc-updater **YAZAR** (finalizer) |
| `docs/audits/` *(§6-eki, 2026-07-21)* | sprint-başına forensic-rapor dizini | `sprint-file-retention.ts:202` **YAZAR** (runtime) + `model-tier-guard.ts:112` · `authority-enforcer.ts:188,223` sınıflama-literal'leri |
| `docs/vision/` | `VISION.md` · `VISION-TR.md` · `blueprint.md` · `roadmap.md` | managed-doc-runner (`.deckent/settings/docs.json` — git-TRACKED kayıt) |
| `docs/.vitepress/config.ts` | (+ `docs/package.json` — docs iç-içe npm paketi!) | docs.yml build + vitepress.test |
| `docs/index.md` | — | readme-quality.test |
| `docs/reference/api-surface.md` | — | **DECKENT.md:60 `@docs/...` Claude-Code @-import'u** (kopmuşsa sessizce context'ten düşer) + blueprint-testleri |
| `docs/MASTER-PLAN.md` | — | **İş-takip SSOT (Kanun-4)** — CLAUDE.md/AGENTS.md/GEMINI.md sözleşmesi + doc-tracking rank-0 |

## 2. Rename ANINDA kırılanlar (kanıt-özeti)

- **CI KIRMIZI (bloke edici):** `ci.yml` coverage-job (satır 214-245, continue-on-error YOK) tüm süiti
  koşar → `tests/docs/` ~27 dosya + 10 dışarıdaki test gerçek-repo `docs/`unu `readFileSync` ediyor →
  toplu red. `publish.yml:74` de `tests/docs/` koşuyor → publish bloke. (Ayrı `test-docs-scripts` job'u
  continue-on-error:true — o kırmızılık bloke etmez; asıl kapı coverage.)
- **Release-gate script'leri:** `docs:ref:check` + `docs:stats:check` (`release` + `prepublishOnly`
  zincirinde) `docs/adr`'ı sayıyor/okuyor → exit 1.
- **docs.yml çifte-tuzak:** `paths: docs/**` filtresi docs1'i HİÇ tetiklemez (sessiz ölüm); tetiklenirse
  `npm install --prefix docs` + `working-directory: docs` → dizin-yok hatası.
- **Runtime İÇERİK-BÖLÜNMESİ (en sinsi):** sprint-finalizer'ın doc-updater'ları
  (`sprint-log.ts:9`, `changelog.ts:65,159 mkdirSync`) ilk sprint-sonunda **yeni bir `docs/` dizinini
  yeniden YARATIR** → insan-docs `docs1/`de, makine-yazımı SPRINT-LOG/CHANGELOG taze `docs/`ta.
- **Sessiz işlev-kayıpları:** managed-doc-runner'ın 5 kayıtlı vision/release doc'u atlanır ·
  auditor dependencency-drift denetimi kapanır (try/catch) · doc-tracking rank-haritası devre-dışı
  (her şey defaultRank-50) · `DECKENT.md` @-import context'ten düşer · scope/authority
  prefix-eşleşmeleri (`model-tier-guard` · `authority-enforcer` · `policy-gate` · `rubric-registry`
  `'docs/'` literal'leri) davranış değiştirir.

## 3. Rename-öncesi kapanması ŞART 3 karar-noktası (Alperen)

| # | Karar | Seçenekler |
|---|---|---|
| K1 | **`docs/MASTER-PLAN.md` nereye?** SSOT'un yolu değişirse CLAUDE.md/AGENTS.md/GEMINI.md + kural-dosyaları aynı dilimde güncellenmeli | (a) köke taşı (`MASTER-PLAN.md`) (b) `docs1/`de yaşasın + sözleşmeler güncellensin (c) yeni-`docs/`ta kalsın |
| K2 | **`tests/docs/` süitinin kaderi** (~37 gerçek-repo-okuyan test) | (a) yeni-docs çekirdeği GÜN-1 kurulur → testler yeşil kalır (b) süit park/skip edilir (İçerik-testleri — quickstart/api içerik-şartları — yeni docs yazılana dek zaten anlamsızlaşır) |
| K3 | **Makine-yazarları** (SPRINT-LOG/CHANGELOG/health-check updater + managed-docs kayıtları) | (a) yeni-`docs/`a yazmaya devam (çekirdek-yollar yaşar) (b) hedef-sabitleri docs1'e çevrilir (park-dönemi için) |

**✅ KARAR TAMAMLANDI: K1=c · K2=a · K3=a.** (K1/K3: Alperen 2026-07-21 karar-turu; K2: Alperen
2026-07-22 — tests-analizi girdisiyle kesinleşti: docs/-ağacını okuyan **26 test** [21 `tests/docs/` +
5 dışarıda, `2026-07-21-tests-analiz.md` §2] yalnız tracked-çekirdek yolları okuyor → çekirdek-değişimi
kurgusunda tümü yeşil kalır.) Çekirdek-değişimi paketi tam-onaylı; **yalnız-dokümantasyon — rename-dilimi
Alperen-emriyle sonra.**

**En küçük tutarlı öneri (CC):** rename'i "park" olarak değil **"çekirdek-değişimi"** olarak yap —
`docs1/` = eski içeriğin arşivi; AYNI dilimde yeni `docs/` yalnız §1 çekirdek-yollarıyla (iskelet +
MASTER-PLAN + makine-dosyaları) kurulur. Böylece CI/release-gate/finalizer/sözleşmeler hiç kırılmaz,
"sıfırdan yazım" iskeletin içini doldurur. (İrtifa: bounded-coherent-change; büyük-bang rename =
kayıp-rotası.)

## 4. Güncellenebilir-tüketiciler (yol-değişikliği gerekirse tek-nokta sabitler)

`lint-links.mjs:160` docsRoot · `gen-reference-docs.mjs` gens-dizisi · `update-readme-stats.mjs:208` ·
`generate-cli-docs.ts:689` · doc-updater targetFile'ları (3 const) · doc-tracking rankMap
(`.deckent/settings/docs.json` üzerinden **kod değişmeden** override edilebilir) · managed-docs `docs[]`
kayıtları (data) · `.lintlinkignore` desenleri · vitepress editLink + docs.yml CNAME.

## 5. Yan-notlar

- `docs/` iç-içe bir npm paketidir (`docs/package.json`, kendi vitepress bağımlılığı).
- `validate-publish.mjs`'te docs-referansı SIFIR (doğrulandı) — publish-gate'in kendisi etkilenmez.
- Bu defter (`docs/alperen-analysis/`) da rename'le taşınır — karar-kayıtlarının yolu değişir.
- Bu karar MIGRATION-PLAN F5 ("docs yeni repoda koddan-doğrulanarak yeniden yazılır") ile aynı yöne
  bakıyor; 26 Temmuz göçüyle sıralaması Alperen'de (göç-planlaması yapılmıyor — yalnız uyum-notu).
- Çok-dilli program (en/tr + 6 dil — §13 süreç-kararı) yeni ağacın kurgusuna gün-1'den girmeli:
  zorunlu-yollar dil-ağacının DEFAULT (en) köküdür; çeviri-ağacı (`docs/tr/...` vb.) test/CI'ya yeni
  şart eklemez.

## 6. İSTİSNA-TRİYAJI EKİ (2026-07-21 — defter #27; docs/ kalan-öğelerin taraması)

**3 SERT istisna** — çekirdek-taşımanın (§1) ZATEN dokunmadığı dosyaları kırarlar; rename-diliminde
ayrıca ele alınmaları ŞART:
1. **`docs/audits/`** — §1'e eklendi: retention **runtime yazma-hedefi** + tier/RBAC sınıflama-literal'leri.
   Seçenek: docs/'ta forensic-sink olarak yaşamaya devam VEYA 3 src-dosyası koordineli güncellenir.
2. **`docs/benchmark/`** — `tests/docs/memory-v2-benchmark.test.ts:5,8` gerçek dosya-okuması (taşıma=ENOENT).
3. **`docs/assets/logo.png`** — `README.md:2` main-pinned raw-URL + `tests/docs/readme.test.ts:42`
   (taşıma = GitHub-vitrin logosu 404 + test kırmızı).

**2 ride-along** (ayrı iş DEĞİL — literal'leri çekirdek-taşımada zaten elden geçen dosyalarda):
`docs/launch/` (rankMap:59 + sync-to-product EXCLUDE:36) · `docs/DOC-POLICY.md` (rankMap:53;
rank-resolver testi saf-fonksiyon, dosya okumaz → kırılmaz).

**Kod-bağımlılığı üçlüsü** (yol-listesi değil KOD-editi — çekirdek-kararın kendisine dahil):
`src/core/doc-tracking/types.ts:54-59` (rankMap yolları) · `scripts/sync-to-product.mjs:34-40`
(EXCLUDE yolları) · `.github/workflows/docs.yml:55-64` (`working-directory: docs` + CNAME).
`docs/package.json` + `package-lock.json` TRACKED site-manifesti → `.vitepress/` ile birlikte taşınır.

**ARTIK (park-dışı):** `docs/node_modules/` (untracked, gitignore'lu — disk-artığı) · `docs/audits/`
altındaki gitignore'lu 298 üretilmiş-rapor. **PARK-OK** kalanların tam listesi defter #27'de.
