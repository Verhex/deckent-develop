# DOC-GAP Disposition Ledger — 2026-08-03 (FAZ 3 · P7)

> Yazan: Claude (Fable 5). Kaynak: 184 `it.skip`/`describe.skip` (ölçüm: extraction script, bu tarih)
> — PAZARTESI P7'nin "187 skip / 30 dosya" ölçümüyle aynı küme (fark: sayım yöntemi; `describe.skip`
> altındaki bireysel `it`'ler ve iki dosyada skip'siz kalan marker).
> Karar sorusu iddia başına aynı: **ardıl dokümana taşı mı, emekli mi?** Bu ledger dosya-düzeyi
> disposition verir; karışık dosyalarda iddia-sınıfı ayrımı satırda açıklanır.
> Hiçbir skip bu ledger onaylanmadan silinmez/yeniden yazılmaz.

## Disposition sınıfları

- **RETIRE** — iddia, arşiv corpus'unun bilinçli süperseded içeriğini (eski tagline, eski sayılar,
  eski bölüm başlıkları, bugünkü doctrine'e aykırı davranış) pinliyor. Ardıl ağaç konuyu taşıyor ve
  doğruluğu Codex coverage-matrix turunda (623/623) yeniden doğrulandı. Emeklilik = skip bloğu
  silinir, dosya başına tek süpersesyon notu kalır (arşiv yolu + gerekçe). İçerik kaybı YOK — arşiv
  `docs/archive/docs-pre-reset-2026-08-03/` altında duruyor.
- **REWRITE** — iddia hâlâ istenen bir ürün sözleşmesini kodluyor; ardıl dokümana karşı yeniden
  yazılıp un-skip edilmeli. Bu mühendislik dilimi ayrı koşulur; ledger yalnız hedefi bağlar.
- **DECISION** — iddianın kaderi açık bir owner kararına bağlı; skip kalır ama sahibi olan
  Work ID/OQ satıra yazılır (sahipsiz skip kalmaz).

## Dosya-düzeyi disposition (30 dosya · 184 skip)

| Dosya | Skip | Hedef (eski) | Ardıl | Disposition | Gerekçe |
|---|---:|---|---|---|---|
| docs/guide-getting-started.test.ts | 23 | eski getting-started | `docs/en/guide/getting-started.md` VAR | **RETIRE** | Eski dokümanın birebir bölüm başlıkları/diagram cümleleri; ardıl aynı konuyu yeni yapıda taşıyor |
| docs/readme.test.ts | 19 | eski README | `README.md` VAR (canlı, sayıları doğrulanmış) | **KARIŞIK**: 8 RETIRE + 11 REWRITE | Eski masthead/tagline/logo-yolu/karşılaştırma-tablosu = RETIRE; npm/tests/license rozetleri, Quick Start, Requirements, MCP/Configuration/License/Contributing varlığı = REWRITE (yeni README'ye karşı, yayın-kalite sözleşmesi) |
| docs/CHANGELOG.test.ts | 10 | `CHANGELOG.md` | AYNI dosya CANLI | **KARIŞIK**: 7 REWRITE + 3 RETIRE | Blanket-skip kurbanı: "file exists" ve "# Changelog başlığı" bugün GEÇER (spot-check yapıldı). Format iddiaları un-skip; sprint33/wave tarihsel-içerik iddiaları RETIRE |
| docs/release-checklist.test.ts | 10 | `docs/release/release-checklist.md` | YOK (CHANGELOG başlığı hâlâ referans veriyor — drift) | **DECISION** → `RELEASE-001` | Release süreci dokümanı release gate işinin parçası; doc yeniden doğarsa test onunla döner |
| docs/api-md-no-stale-refs.test.ts | 10 | eski api.md Memory-V2 refleri | `docs/en/mcp.md` + `api-surface.md` VAR | **REWRITE** | Stale-ref korumaları (memory.db, exports yolları, MCP resource'ları) hâlâ değerli sözleşme |
| docs/quickstart.test.ts | 9 | eski quickstart | `docs/en/guide/getting-started.md` VAR | **RETIRE** | Eski "## 1..7" bölüm yapısının pinleri; konu ardılda |
| docs/marketplace-guide.test.ts | 9 | eski marketplace guide | Hub işi `HUB-001` | **RETIRE** | Eski guide yapısı; marketplace/Hub ürünleşmesi kendi satırında |
| docs/dashboard-guide.test.ts | 9 | eski 8-sayfa dashboard guide | `docs/en/guide/interactive-surfaces.md` | **RETIRE** | Üstelik "sprint start via directives editor" iddiası bugünkü doctrine'e AYKIRI: dashboard yalnız izleme (Aktif Yön; F-013 dashboard'dan mutation çıkarılacak diyor) |
| docs/config-reference.test.ts | 9 | eski config-reference | `docs/en/configuration.md` VAR | **RETIRE** | Eski bölüm-numaralı yapı; alan-alan şema doğruluğu `CONFIG-TRUTH-001`'in işi |
| docs/autonomous-doc.test.ts | 9 | eski autonomous doc | `docs/en/guide/execution-modes.md` VAR | **RETIRE** | F3-009/AS-6 tarihsel refleri dahil eski yapı pinleri |
| docs/agent-guide.test.ts | 8 | eski "# Agent Guide" (15 agent) | features + generated agents ref | **RETIRE** | "15 built-in agent" bugün yanlış (21+2, OQ-21); sayılar generated kaynaktan gelir |
| docs/agents.test.ts | 8 | eski "# Agent System" (ADR-041 · 15) | aynı | **RETIRE** | Aynı gerekçe |
| docs/skills.test.ts | 8 | eski "# Skill System" | features + generated | **RETIRE** | Aynı gerekçe (30 skill kataloğu generated) |
| docs/api.test.ts | 8 | eski tek-dosya api.md | `docs/en/reference/api-surface.md` VAR | **RETIRE** | "### Tools (21)" bugün 49 — stale sayı pinleri; HTTP yüzeyi api-surface'te |
| docs/readme-number-truth.test.ts | 8 | README sayı iddiaları | README VAR | **REWRITE** → `DOCS-RELEASE-TRUTH-001` | "48 MCP tools" bugün 49: sayı iddiaları generated kaynaktan assert edilmeli; run/sprint terminoloji köprüsü canlı sözleşme |
| docs/github-pages-deploy.test.ts | 7 | `docs.yml` auto-deploy | workflow DURDURULDU (bilinçli) | **DECISION** → OQ-18 / `DOCS-TOPOLOGY-001` | Deploy'un kaderi VitePress kararına bağlı |
| docs/no-stale-identity-refs.test.ts | 7 | PROJECT-IDENTITY → IDENTITY.md | kaynak ağaç canlı | **REWRITE** | Stale-identity-ref koruması hâlâ değerli; yeni ağaca karşı un-skip |
| docs/vitepress.test.ts | 6 | `docs/.vitepress/**` | arşivde | **DECISION** → OQ-18 / `DOCS-TOPOLOGY-001` | PAZARTESI P10; karar verilmeden iş başlamaz |
| docs/readme-quality.test.ts | 6 | repo/badge URL'leri | iki-repo modeli | **DECISION** → `RELEASE-BETA-001` | `VerhexIO/deckent` public-repo iddiaları yayın-anı sözleşmesi; beta flip'te un-skip |
| docs/memory-v2-benchmark.test.ts | 5 | `docs/benchmark/memory-v2.md` | YOK (arşivde) | **RETIRE** | Tarihsel benchmark raporu; canlı performans kanıtı ayrı iş (`SLO-001`/`LOAD-CHAOS-001`) — tarihsel sayıyı canlıymış gibi pinlemek yanıltıcı |
| docs/dash-scope-links.test.ts | 4 | eski dashboard.md link/disk-truth | `lint:link` repo-geneli koşuyor | **RETIRE** | Dead-link koruması global gate'e devredildi; dosyaya özel kopya gereksiz |
| docs/doc-pillars-links.test.ts | 4 | api-surface Pillar `file:line` disk-verify | `docs/en/reference/api-surface.md` VAR | **REWRITE** | Disk-truth guard değerli: dokümandaki file:line refleri gerçek dosyalara işaret etmeli |
| docs/reference-drift.test.ts | 3 | `worker_memory_limit`/`swap` + memory sabitleri | configuration.md VAR ama alanlar eksik | **REWRITE** → `CONFIG-TRUTH-001` | PAZARTESI'de "gerçek kapsam kaybı — MASTER adayı" diye işaretlenmişti; crosswalk'ta sahibine bağlandı |
| docs/doc-honesty.test.ts | 2 | vision/roadmap.md Path-B notu | `docs/en/vision.md` VAR | **RETIRE** | Sprint-190'a özgü tarihsel dürüstlük notu; vision ardılı konuyu taşımıyor ve taşımamalı |
| docs/blueprint-current.test.ts | 2 | VISION.md anti-X yasağı | `docs/en/vision.md` VAR | **REWRITE** | "Rakip-karşıtı konumlandırma yok" kuralı kalıcı ürün-sesi sözleşmesi; ardıla karşı un-skip |
| blueprint/files.test.ts | 2 | AGENTS.md `## Architecture` + api-surface task formatı | ikisi de VAR (format değişti: XML-tag bölümler) | **REWRITE** | İçerik-varlık sözleşmesi hâlâ doğru; yalnız yeni biçime karşı yazılmalı |
| docs/security-md-current.test.ts | 2 | README güvenlik cümleleri | README VAR | **REWRITE** | Advisory-enforcement dili ADR-G-020 gerçeğiyle eşleşmeli |
| scripts/clean-clone-smoke.test.ts | 1 | `smoke-verify.md` | YOK | **DECISION** → `DOCS-PRODUCT-001` | Script canlı; dokümanı yeniden doğar mı kararı docs işinde |
| scripts/sync-to-product.test.ts | 1 | `docs/development/repo-sync.md` | YOK | **DECISION** → `RELEASE-BETA-001` | İki-repo modeli beta flip işinin parçası |
| scripts/ci-baseline-detect.test.ts | 0 | (yalnız marker, skip yok) | — | **NOT** | Marker bilgilendirme amaçlı; iş yok |

## Toplam

| Disposition | İddia | Dosya etkisi |
|---|---:|---|
| **RETIRE** | ~101 | 13 dosya bütün + readme.test kısmı + CHANGELOG kısmı |
| **REWRITE** | ~48 | 9 dosya (+2 karışık pay) — ayrı mühendislik dilimi |
| **DECISION** | ~35 | 6 dosya — her biri artık bir Work ID/OQ'ya bağlı, sahipsiz skip yok |

## Uygulama sırası (onay sonrası)

1. **RETIRE dalgası** (mekanik, tek commit): skip blokları silinir; dosya başına süpersesyon notu
   (arşiv yolu + bu ledger referansı). Bütünü RETIRE olan 13 dosyada test dosyası tamamen kalkar —
   içerik kaybı yok, arşiv + git geçmişi duruyor.
2. **DECISION anotasyonu** (aynı commit): kalan skip'lerin DOC-GAP bloğuna sahip Work ID yazılır.
3. **REWRITE dilimi** (ayrı iş): dosya-dosya, ardıl dokümana karşı; kimi iddia doc düzeltmesi de
   ister (ör. configuration.md'ye `worker_memory_limit` alanları). MASTER sahipleri: satır bazında
   yukarıdaki tabloda.
