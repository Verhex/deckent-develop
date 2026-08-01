# Vision Docs Audit — 2026-05-22

**Kapsam:** `docs/vision/` altındaki 5 doküman  
**Metodoloji:** Her iddia kaynak kodla doğrulandı (grep/ls/wc/git log); kanıtsız düzeltme yapılmadı  
**Perspektif:** Deckent geliştiricisi (iç tutarlılık + mimari sağlık)

---

## Doküman Listesi

| Dosya | Satır | Sorun Sayısı | Durum |
|-------|-------|-------------|-------|
| `blueprint.md` | 2867 | 18 | ✅ Düzeltildi |
| `VISION.md` | 156 | 2 | ✅ Düzeltildi |
| `VISION-TR.md` | 156 | 2 | ✅ Düzeltildi |
| `roadmap.md` | ~300 | 6 | ✅ Düzeltildi |
| `competitive-analysis.md` | 133 | 3 | ✅ Düzeltildi |

**Toplam:** 31 sorun tespit edildi, 31 düzeltildi.

---

## blueprint.md — 18 Sorun

Bu dosya 2867 satırlık en büyük vizyon dokümanı. Sprint 172 path-reorg'dan kalan stale veriler yoğun.

### BLU-01: MCP araç sayısı yanlış (×4)
- **Konum:** Satır 106, 411, 413, 1466
- **Bulgu:** "27 Tools + 8 Resources" ve "22 tool handler" yazıyor
- **Doğrulama:** `ls src/mcp/tools/` → 29 dosya; `nervous.ts` 5 nervous_* tool kayıt eder → 31 toplam
- **Düzeltme:** 27 → 31 (dört yerde); "22 tool handlers" → "29 files (28 handlers; nervous.ts registers 5 nervous_* tools)"

### BLU-02: Memory entry type sayısı yanlış (×2)
- **Konum:** Satır 135, 723
- **Bulgu:** "7 entry types: ADR, memory, sprint, debt, pattern"
- **Doğrulama:** `grep "type:" src/core/memory-types.ts` → 9 tip: adr, memory, sprint, debt, pattern, retro, error, identity, audit
- **Düzeltme:** 7 → 9 (iki yerde)

### BLU-03: Dashboard page sayısı yanlış (×2)
- **Konum:** Satır 142, 1132
- **Bulgu:** "6 pages"
- **Doğrulama:** `ls src/dashboard/src/pages/*.tsx` → 7 sayfa (ChatPage.tsx dahil)
- **Düzeltme:** 6 → 7 (iki yerde)

### BLU-04: Node.js sürümü yanlış
- **Konum:** Satır 278
- **Bulgu:** "Node.js ≥ 18 (22 recommended)"
- **Doğrulama:** `cat package.json | grep engines` → `>=24.0.0`; IDENTITY.md onaylıyor
- **Düzeltme:** "Node.js ≥ 18 (22 recommended)" → "Node.js ≥ 24.0.0"

### BLU-05: var olmayan kural dosyası referansı
- **Konum:** Satır 353-357
- **Bulgu:** `.claude/rules/testing.md` listeleniyor
- **Doğrulama:** `ls .claude/rules/` → `auditor.md`, `brain.md`, `worker-default.md` — `testing.md` yok
- **Düzeltme:** Satır kaldırıldı (ADR-041 gereği testing agent kaldırıldı; bkz. DECKENT.md)

### BLU-06: core/ modül sayısı yanlış
- **Konum:** Satır 360
- **Bulgu:** "core/ (89 modules)"
- **Doğrulama:** `ls src/core/*.ts | wc -l` → 93 dosya
- **Düzeltme:** 89 → 93

### BLU-07: api/ modül sayısı yanlış
- **Konum:** Satır 407
- **Bulgu:** "api/ (3 modules)"
- **Doğrulama:** `ls src/api/*.ts | wc -l` → 5 dosya
- **Düzeltme:** 3 → 5

### BLU-08: cli/ dosya sayısı ve komut sayısı yanlış
- **Konum:** Satır 410
- **Bulgu:** "cli/ (87 files, 41+ commands)"
- **Doğrulama:** `ls src/cli/commands/ | wc -l` → 57; IDENTITY.md → "55+ CLI Commands"
- **Düzeltme:** "(87 files, 41+ commands)" → "(57 files, 55+ commands)"

### BLU-09: Dashboard sayfa listesi eksik
- **Konum:** Satır 439
- **Bulgu:** "6 pages: Dashboard, Settings, History, Memory, Config, Status"
- **Doğrulama:** `ls src/dashboard/src/pages/` → ChatPage.tsx de var (7. sayfa)
- **Düzeltme:** "6 pages: ..." → "7 pages (Dashboard, Settings, History, Memory, Config, Status, Chat)"

### BLU-10: rules-generator.ts → rule-generator.ts
- **Konum:** Satır 577
- **Bulgu:** `rules-generator.ts` (çoğul)
- **Doğrulama:** `ls src/orchestra/rule-generator.ts` → dosya tekil isimle var
- **Düzeltme:** `rules-generator.ts` → `rule-generator.ts`

### BLU-11: managed-docs/runner.ts → managed-doc-runner.ts
- **Konum:** Satır 578
- **Bulgu:** `managed-docs/runner.ts`
- **Doğrulama:** `ls src/orchestra/managed-doc-runner.ts` → doğru isim
- **Düzeltme:** `managed-docs/runner.ts` → `managed-docs/managed-doc-runner.ts`

### BLU-12: MCP + CLI sayıları yanlış
- **Konum:** Satır 609-610
- **Bulgu:** "27 MCP + 56 CLI"
- **Doğrulama:** 31 MCP araç, 55+ CLI komutu (IDENTITY.md + ls doğrulaması)
- **Düzeltme:** "27 MCP" → "31 MCP"; "56 CLI" → "55+ CLI"

### BLU-13: ADR sayısı yanlış (Gate Criteria bölümü)
- **Konum:** Satır 2625
- **Bulgu:** "All 46 ADRs"
- **Doğrulama:** Sprint 167-186 arasında ADR-047 → ADR-064 eklendi; toplam 55+
- **Düzeltme:** "All 46 ADRs" → "All 55+ ADRs (Sprint 167-186 added ADR-047 through ADR-064)"

---

## VISION.md — 2 Sorun

Sprint 186 anında doğrulanan güncel görünümde Sprint 167 metriklerini koruyan autoSections var (managed-docs pipeline bu bölümleri otomatik günceller). Koruyucu olmayan bölümlerde 2 stale değer tespit edildi.

### VIS-01: MCP araç sayısı yanlış
- **Konum:** Satır 19
- **Bulgu:** "27 MCP tools, ADR governance (46 ADRs)"
- **Düzeltme:** "31 MCP tools, ADR governance (55+ ADRs)"

### VIS-02: Technology bölümünde araç sayısı yanlış
- **Konum:** Satır 65
- **Bulgu:** "With 27 tools and 8 resources"
- **Düzeltme:** "With 31 tools and 8 resources"

**Not:** Sayılar tablosu (Sprint/MCP Tools/Agents/Skills bölümü) autoSection — managed-docs pipeline bir sonraki sprint kapanışında güncelleyecek. Manuel düzenleme yapılmadı (overwrite riski).

---

## VISION-TR.md — 2 Sorun

VISION.md ile birebir aynı sorunlar, Türkçe versiyonunda.

### VISTR-01: MCP araç sayısı yanlış
- **Konum:** Satır 19
- **Bulgu:** "27 MCP tool, ADR governance (46 ADR)"
- **Düzeltme:** "31 MCP tool, ADR governance (55+ ADR)"

### VISTR-02: Technology bölümünde araç sayısı yanlış
- **Konum:** Satır 65
- **Bulgu:** "27 tool ve 8 resource"
- **Düzeltme:** "31 tool ve 8 resource"

---

## roadmap.md — 6 Sorun

Sprint numaraları ve açıklamaları git log ile doğrulandı.

### ROAD-01: Sprint 184 statüsü yanlış
- **Bulgu:** Sprint 184 satırı "**Next**" olarak işaretlenmiş
- **Doğrulama:** `git log --oneline` → Sprint 186 aktif; Sprint 184 housekeeping sprinti olarak kapandı
- **Düzeltme:** "**Next**" → "**Done**"; açıklama eklendi

### ROAD-02: Sprint 185 açıklaması yanlış
- **Bulgu:** "mTLS impl scaffold" yazıyor
- **Doğrulama:** `git log --oneline | grep sprint-185` → commit `5db72192` "codebase self-audit deliverables — 6 subdirectory audit reports + Brain runtime regen"
- **Düzeltme:** Açıklama gerçek sprint çıktısıyla güncellendi

### ROAD-03: Sprint 186 açıklaması yanlış
- **Bulgu:** "k8s pod-exec SessionBackend" yazıyor
- **Doğrulama:** `git log --oneline | grep sprint-186` → commit `d43d679b` "per-file audit pilot — 35 audit reports (31 DONE + 4 recovered false-NO_GO)"
- **Düzeltme:** Açıklama gerçek sprint çıktısıyla güncellendi

### ROAD-04: Nervous System detektor sayısı yanlış
- **Konum:** Satır 42
- **Bulgu:** "Nervous System Phase 1 smoke (3 detectors)"
- **Doğrulama:** `ls src/nervous/detectors/ | wc -l` → 12 detektor dosyası
- **Düzeltme:** "(3 detectors)" → "(12 detectors)"

### ROAD-05: Conversational Shell bölümünde araç sayısı yanlış
- **Konum:** Satır 196
- **Bulgu:** "27+ tools"
- **Düzeltme:** "31+ tools"

### ROAD-06: References bölümünde eski DECISIONS.md yolu
- **Konum:** Satır 289-290
- **Bulgu:** `.brain/DECISIONS.md` referansı (×2)
- **Doğrulama:** Memory V2 geçişi sonrası bu yol kullanılmıyor; doğru yol: `.brain/exports/decisions.md`
- **Düzeltme:** `.brain/DECISIONS.md` → `.brain/exports/decisions.md` (iki yerde)

---

## competitive-analysis.md — 3 Sorun

Bu dosya stratejik analiz dokümanı; bazı veriler bilinçli olarak dönem anlık görüntüsü olabilir. Yine de kaynak kodla çelişen somut metrikler düzeltildi.

### COMP-01: Orchestra modül sayısı stale
- **Konum:** Satır 28
- **Bulgu:** "45+ orchestra modulu"
- **Doğrulama:** `ls src/orchestra/*.ts | wc -l` → 78 modül (architecture.md audit sonrası doğrulanan)
- **Düzeltme:** "45+" → "78+"

### COMP-02: Memory sistemi açıklaması stale (Memory V2 öncesi)
- **Konum:** Satır 34
- **Bulgu:** "`.brain/ (MEMORY, RETRO, DEBT, PATTERNS, DECISIONS)`" — Memory V1 dosya listesi
- **Doğrulama:** Memory V2 (Sprint 130+) sonrası SQLite DB-first; MEMORY.md/DECISIONS.md yerini `.brain/memory.db` + `exports/` aldı
- **Düzeltme:** Açıklama Memory V2 gerçeğini yansıtır şekilde güncellendi (9 entry type, SQLite FTS5, `deckent recall` CLI)

### COMP-03: Test metrikleri stale
- **Konum:** Satır 37
- **Bulgu:** "11,918+ test, %96+ coverage, 67+ sprint"
- **Doğrulama:** IDENTITY.md → 16,697 descriptors, coverage N/A, Sprint 186+
- **Düzeltme:** "16,697+ test descriptor, 186+ sprint" (coverage N/A olduğu için kaldırıldı)

---

## Doğrulanmış Doğru Veriler

Aşağıdaki iddialar kaynak kodla doğrulandı ve değiştirilmedi:

| Konu | İddia | Kaynak |
|------|-------|--------|
| Provider sayısı | 3 (Claude, Codex, Gemini) | `src/providers/` klasörü |
| Memory V2 SQLite FTS5 | Evet | `src/core/memory-store.ts` |
| Brain-Worker-Auditor mimarisi | Doğru tanım | `src/orchestra/brain.ts` + `src/monitor/auditor.ts` |
| tmux/subprocess/Docker backend | 3 backend | `src/orchestra/tmux.ts` + spawn-backend.ts + docker |
| Tier sistemi (premium_plus/premium/standard/economy) | Doğru | `src/core/model-registry.ts` |
| MCP resources sayısı | 8 | `src/mcp/resources/` |
| Sprint lifecycle 8 faz | PLAN→SPAWN→EXECUTE→EVALUATE→FIX→RETRO→DECAY→CLEANUP | `docs/reference/api-surface.md` |

---

## Ortak Kök Neden

Dokümanlardaki staleness'ın büyük bölümü iki tarihsel olaydan geliyor:

1. **Sprint 130 MCP düzeltmesi** — 27 araç sayısı doğruydu; Sprint 131-186 arasında eklenen 4 araç (nervous_* tools) korumalı bölümlere yayılmadı.
2. **Sprint 172 doc-reorg** — `docs.json` path'leri düzeltildi (önceki session audit), ancak blueprint.md ve roadmap.md içindeki bazı referanslar güncellenmemişti.

---

_Audit tamamlandı: 2026-05-22 | Auditor: Alperen | Sprint: 186+_
