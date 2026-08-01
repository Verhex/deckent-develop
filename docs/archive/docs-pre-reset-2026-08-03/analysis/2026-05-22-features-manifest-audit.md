# `.deckent/features-manifest.json` Audit — Feature Usage Manifest — 2026-05-22

**Kapsam:** `.deckent/features-manifest.json` — ne olduğu, içeriği, veri akışı (kim besler / kimi besler), kategori semantiğinin tutarlılığı  
**Metodoloji:** Sistematik debugging — generator canlı çalıştırıldı, import sayıları gerçek grep ile doğrulandı, commit'li manifest ile karşılaştırıldı  
**Perspektif:** Deckent dogfooding + Deckent ürün kullanıcısı

---

## Bu Dosya Nedir

`.deckent/features-manifest.json` — Deckent'in **feature usage manifest**'i (Sprint 150 Task 029). 31 özelliği 4 kategoriye ayırır: `active` (16), `lightly_used` (4), `dormant` (9), `dead` (2). Her girdi: `id`, `label`, `files`, `description` + duruma göre `importCount` / `blockedBy` / `parityGap` / `deprecatedSince` / `supersededBy` / `adrRef`.

**Git durumu:** git-tracked; her sprint sonu yeniden üretilir.

**Gerçek doğası:** "Auto-generated" etiketine rağmen `FEATURE_DEFINITIONS` (31 özellik, dosya listeleri, açıklamalar, lifecycle annotation'ları) **`scripts/sync-manifest.mjs` içinde %100 elle bakımlıdır**. Otomatik olan tek şey kategori-bucketing'idir (o da büyük ölçüde el-annotation sürücülü). Yeni bir src/ özelliği otomatik keşfedilmez.

---

## Veri Akışı — Nereden Beslenir / Nereyi Besler

### Nereden beslenir
**`scripts/sync-manifest.mjs`** (tek üretici):
1. `FEATURE_DEFINITIONS` — elle bakımlı 31 özellik dizisi (id/label/files/description + `blockedBy`/`deprecatedSince`/`supersededBy`/`parityGap`).
2. `countImporters()` — `grep -E "from '...basename(.js)?'"` ile src/ içindeki importer sayısı (gerçek import-graph **değil** — basename eşleşmesi).
3. `categorizeFeature()` — kategori hesabı: `deprecatedSince||supersededBy` → `dead`; dosya yok → `dead`; tüm dosyalar file-level `@deprecated` → `dead`; `blockedBy` → `dormant`; importer ≥2 → `active`, =1 → `lightly_used`, 0 → `dormant`.

**Tetikleyiciler:** manuel `node scripts/sync-manifest.mjs`; otomatik `sprint-finalizer.ts:1057-1069` (her sprint-finalize).

### Nereyi besler
- **`deckent_feature_query`** MCP tool (`src/mcp/tools/feature-query.ts`) — kategoriye göre listeleme / id ile arama.
- **`deckent features`** CLI komutu (`src/cli/commands/features.ts`) — aynı (ADR-022-V2 CLI/MCP parity).
İkisi de **read-only** tüketici.

```
FEATURE_DEFINITIONS (elle) ─┐
countImporters (grep)       ─┼─> sync-manifest.mjs ─> .deckent/features-manifest.json ─> deckent_feature_query (MCP)
hand annotations            ─┘     (sprint-finalize regen)                            └─> deckent features (CLI)
```

---

## Çekirdek Tasarım — Sağlam Olan

- **51 dosya yolunun tamamı diskte mevcut** (0 phantom — script `checkFilesExist` ile doğruluyor).
- Canlı generator çıktısı commit'li manifest ile **birebir aynı** (kategoriler güncel, stale değil).
- Deterministik + yeniden çalıştırılabilir; sprint-finalize'da otomatik regen.
- Hand-curated katalog gerçekten faydalı: açıklamalar, `blockedBy` gerekçeleri, ADR referansları, `parityGap` notları.
- CLI/MCP parity (`deckent features` ↔ `deckent_feature_query`).

---

## Tespit Edilen Sorunlar

### Sorun 1 — "dead" Kategorisi "Kullanılmıyor" Demek Değil

**Öncelik:** Orta  
**Kök Neden:** `categorizeFeature()` `deprecatedSince || supersededBy` (el-annotation) VEYA file-level `@deprecated` görünce **import sayısına bakmadan** `dead` döner. Sonuç: her iki `dead` girdisi de canlı import'lu — üstelik **çekirdek orkestratör tarafından**:

| `dead` girdi | file-level `@deprecated` | Gerçek importer (src/) |
|--------------|--------------------------|------------------------|
| `decision-engine.ts` (decision-orchestrator-v1) | VAR | **4** — `sprint-controller.ts`, `sprint-spawner.ts`, `nervous/bootstrap.ts`, `decision-replay.ts` |
| `parallel-pipeline.ts` | **YOK** (yalnızca `supersededBy` hand-annotation) | **3** — `conflict-resolver.ts`, `sprint-spawner.ts`, `sprint-controller.ts` |

**Etki:** `deckent_feature_query category=dead` sorgulayan bir kullanıcı/AI bunları "silinebilir ölü kod" sanır. Silinirse `sprint-controller.ts` (çekirdek orkestratör) kırılır. Gerçek durum "deprecated ama hâlâ wired" — bu bir tech-debt; manifest bunu "dead" diyerek **gizliyor**. `_meta`'daki "import graph analysis" ifadesi (Sorun 3) yanılgıyı artırıyor.

**Durum:** Belgelendi — bkz. Gelecek Öneriler #1.

---

### Sorun 2 — "dormant" Tanımı Gerçeğiyle Çelişiyor

**Öncelik:** Orta  
**Kök Neden:** `sync-manifest.mjs` başlık yorumu `dormant`'ı "file exists but **zero external imports**" diye tanımlıyor. Ama `categorizeFeature()` `blockedBy` el-annotation'ı görünce import sayısını **ezerek** dormant döner:

| `dormant` girdi | Gerçek importer | Import-count'a göre olması gereken |
|-----------------|-----------------|-------------------------------------|
| `ecosystem-intelligence` | **2** | `active` |
| `heartbeat-daemon` | **1** | `lightly_used` |
| `self-modifying-detector` | 0 | `blockedBy` metni "detection **active**" diyor |

**Etki:** "dormant" pratikte "wired ama opt-in / çıktısı downstream tüketilmiyor" anlamına geliyor — "zero imports" değil. Tanım ↔ uygulama çelişkisi; manifest tüketicisi (CLI/MCP) "dormant" gördüğünde yanlış sonuç çıkarır.

**Durum:** Belgelendi — bkz. Gelecek Öneriler #2.

---

### Sorun 3 — "Auto-Generated Import Graph" İfadesi Abartılı

**Öncelik:** Düşük  
**Kök Neden:** `_meta.description` "auto-generated from src/ import graph analysis", `methodology` "import-graph traversal" diyordu. Gerçekte: `FEATURE_DEFINITIONS` %100 elle bakımlı; `countImporters` gerçek import-graph değil, `grep -E "from '...basename(.js)?'"` (basename collision riski — aynı isimli iki dosya yanlış sayılır).

**Durum:** Düzeltildi — `sync-manifest.mjs` `_meta.description` + `methodology` ifadeleri gerçeğe çekildi ("curated catalog + grep-based import count (basename match) ... NOT a full import-graph analysis"); manifest yeniden üretildi.

---

## Uygulanan Değişiklikler

| Dosya | Değişiklik |
|-------|-----------|
| `scripts/sync-manifest.mjs` | `_meta.description` + `sourceAnalysis.methodology` ifadeleri dürüstleştirildi (Sorun 3) |
| `.deckent/features-manifest.json` | Düzeltilmiş `_meta` ile yeniden üretildi (`node scripts/sync-manifest.mjs`; kategoriler değişmedi: 16/4/9/2 = 31) |

**Doğrulama:** Generator canlı çalıştırıldı (`--dry-run`/`--json`) → kategoriler commit'li manifest ile birebir aynı. 51 dosya yolu mevcut. Şüpheli modüllerin import sayıları gerçek grep ile teyit edildi.

---

## Açık Kaynak Hazırlığı Değerlendirmesi

**Dogfooding perspektifi:**
- Manifest güncel, otomatik regen var, phantom dosya yok — altyapı sağlam.
- Ama kategori semantiği yanıltıcı: "dead" iki girdi de `sprint-controller` tarafından import ediliyor → gerçek "deprecated-but-wired" tech-debt manifest'te görünmüyor.

**Kullanıcı perspektifi:**
- `deckent feature_query`/`deckent features` gerçek bir keşif aracı — faydalı.
- Ancak "dead" kategorisine güvenip kod silen kullanıcı/AI yanılır (Sorun 1). OSS'te bu, MCP tool üzerinden bir AI ajanına yanlış sinyal verebilir.

---

## Gelecek Öneriler

1. **"dead" semantiğini netleştir (Sorun 1):** `dead`'i ikiye ayır — `deprecated` (annotation var **ama hâlâ import'lu** = aktif tech-debt) vs `dead` (gerçekten 0 import). `categorizeFeature()` import sayısını `deprecatedSince`/`supersededBy` short-circuit'inden **önce** dikkate almalı. `decision-engine`/`parallel-pipeline` `sprint-controller` tarafından import ediliyor — bu görünür bir tech-debt olmalı.
2. **"dormant" tanımını düzelt (Sorun 2):** Ya tanımı gerçeğe çek ("wired ama opt-in/çıktısı tüketilmeyen") ya da `blockedBy`-forced girdiler için ayrı kategori (`partially_wired`). `ecosystem-intelligence` 2 importer ile "dormant" yanlış sinyal.
3. **`countImporters` path-aware yapılmalı:** basename yerine çözümlenmiş import yolu ile sayım — collision riski kalkar.
4. **`FEATURE_DEFINITIONS` kapsama denetimi:** 31 özellik elle bakımlı; src/'e eklenen yeni modüller otomatik girmiyor. En azından CI'da "manifest'te olmayan büyük modül var mı" uyarısı değerlendirilebilir.

---

## Kapanış

Audit 2026-05-22'de kapatıldı. `.deckent/features-manifest.json` = Deckent'in feature kataloğu; `scripts/sync-manifest.mjs` (elle FEATURE_DEFINITIONS + grep import-count + el-annotation) üretir, sprint-finalize'da regen edilir; `deckent_feature_query` (MCP) + `deckent features` (CLI)'yi besler. Altyapı sağlam (0 phantom, güncel, otomatik regen). **3 sorundan 1'i düzeltildi** (Sorun 3 — `_meta` ifadesi dürüstleştirildi), 2'si belgelendi (Sorun 1 "dead" semantiği + Sorun 2 "dormant" tanımı — kategori-anlam tutarsızlıkları, "Gelecek Öneriler"de izleniyor). Kök tema: kategori etiketleri el-annotation sürücülü ve hesaplanan import sayısıyla / kendi tanımlarıyla çelişiyor.
