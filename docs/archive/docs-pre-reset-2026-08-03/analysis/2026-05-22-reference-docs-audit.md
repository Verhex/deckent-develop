# Reference Docs Audit — 2026-05-22

**Kapsam:** `docs/reference/` altındaki 21 doküman (10.476 satır)  
**Metodoloji:** Her iddia kaynak kodla doğrulandı; kanıtsız düzeltme yapılmadı  
**Perspektif:** Deckent geliştiricisi (iç tutarlılık + mimari sağlık)

---

## Doküman Durumu

| Dosya | Satır | Tür | Sorun | Durum |
|-------|-------|-----|-------|-------|
| `mcp-tools.md` | 43 | Auto-gen (AUTOGEN) | — | ✅ Güncel (31 araç) |
| `mcp-resources.md` | 20 | Auto-gen (AUTOGEN) | — | ✅ Güncel (8 kaynak) |
| `agents.md` | 29 | Auto-gen (AUTOGEN) | — | ✅ Güncel (17 agent) |
| `features.md` | 62 | Auto-gen (manifest) | — | ✅ Güncel |
| `cli.md` | 1058 | Auto-gen (CLI source) | — | ✅ Yapısal güncel |
| `mcp-guide.md` | 833 | Manuel | 9 sorun | ✅ Düzeltildi |
| `security.md` | 342 | Manuel | 4 sorun | ✅ Düzeltildi |
| `performance.md` | 672 | Manuel | 10+ sorun | ✅ Düzeltildi |
| `cli-commands.md` | 1087 | Eski auto-gen (Sprint 151) | 1 sorun | ✅ Düzeltildi |
| `api.md` | 2246 | Manuel | 1 sorun | ✅ Düzeltildi |
| `api-examples.md` | 969 | Manuel | 1 sorun | ✅ Düzeltildi |
| `config.md` | 366 | Manuel | 1 küçük (örnek sprint) | Kabul edildi |
| `config-reference.md` | 556 | Manuel | — | ✅ Güncel |
| `multi-provider.md` | 245 | Manuel | — | ✅ Güncel |
| `skills.md` | 214 | Manuel | — | ✅ Güncel |
| `managed-docs.md` | 229 | Manuel | — | ✅ Güncel |
| `health-check.md` | 179 | Manuel | — | ✅ Güncel |
| `marketplace.md` | 203 | Manuel | — | ✅ Güncel |
| `migration-guide.md` | 500 | Manuel | — | ✅ Güncel |
| `glossary.md` | 464 | Manuel | — | ✅ Güncel |
| `api-surface.md` | 159 | Manuel (contract) | — | ✅ Güncel |

**Toplam:** 27 sorun tespit edildi, 26 düzeltildi (1 kabul edildi).

---

## mcp-guide.md — 9 Sorun

Bu dosya MCP entegrasyonunun ana kullanıcı kılavuzu. Sprint 130 civarı (27 araç döneminde) yazılmış; 31 araç / 8 resource dönemine güncellenmemişti.

### MCG-01/02: ToC başlıkları yanlış
- **Bulgu:** `[10 MCP Tool Referansı]`, `[5 MCP Resource Referansı]`
- **Doğrulama:** `mcp-tools.md` AUTOGEN bloğu → 31 araç; `mcp-resources.md` → 8 kaynak
- **Düzeltme:** 10 → 31, 5 → 8

### MCG-03/04: Mimari diyagramı yanlış
- **Bulgu:** `├── 10 Tools`, `└──  5 Resources`
- **Düzeltme:** `├── 31 Tools`, `└──  8 Resources`

### MCG-05/06: Bölüm başlıkları yanlış
- **Bulgu:** `## 10 MCP Tool Referansı`, `## 5 MCP Resource Referansı`
- **Düzeltme:** 10 → 31, 5 → 8

### MCG-07: Node.js sürüm örneği stale
- **Konum:** deckent_doctor JSON örneği
- **Bulgu:** `"v20.11.0 (>=18 required)"`
- **Doğrulama:** `package.json engines` → `>=24.0.0`
- **Düzeltme:** `"v24.x (>=24.0.0 required)"`

### MCG-08/09: Memory V2 kaynak dosya referansları
- **Konum:** `deckent://memory` ve `deckent://debt` kaynak tablosu + açıklaması
- **Bulgu:** `deckent://memory` → `.brain/MEMORY.md`; `deckent://debt` → `.brain/DEBT.md`
- **Doğrulama:** Memory V2 DB-first; MEMORY.md → `memory.db` + `exports/memory.md` snapshot; DEBT.md → Sprint 186'da kaldırıldı
- **Düzeltme:** `.brain/MEMORY.md` → `.brain/exports/memory.md (generated snapshot)`; `.brain/DEBT.md` → `memory.db debt entries`

---

## security.md — 4 Sorun

Memory V2 B7 cleanup: Auditor artık `.brain/PATTERNS.md`'ye yazmıyor, `memory.db`'ye `type='pattern'` entry ekliyor (Sprint 186 `detectPatterns()` güncellemesi).

### SEC-01: Auditor capability tablosu
- **Bulgu:** `Write(.brain/PATTERNS.md)`
- **Düzeltme:** `memory.db (pattern entries)`

### SEC-02: `--allowedTools` dizisi
- **Bulgu:** `Write(.brain/PATTERNS.md)`
- **Düzeltme:** `Write(.brain/memory.db)`

### SEC-03: Stale lock handling adımı
- **Bulgu:** "Records the pattern in `.brain/PATTERNS.md`"
- **Düzeltme:** "Records the pattern in `memory.db` (type='pattern' entry)"

### SEC-04: Scan Result Disposition
- **Bulgu:** "Appends new patterns to `.brain/PATTERNS.md` (never overwrites — append only)"
- **Düzeltme:** "Upserts new patterns to `memory.db` (type='pattern' entries via detectPatterns())"

---

## performance.md — 10+ Sorun

Bu dosya Memory V1 dosya bazlı sistemi temel alan kapsamlı bir rehber. Memory V2 SQLite geçişi (Sprint 130+) sonrasında hiç güncellenmemişti. Tüm bölümler güncellendi.

### PERF-01: Brain budget tablosu
- **Bulgu:** `MEMORY.md 200 lines`, `DEBT.md`, `PATTERNS.md`, `DECISIONS.md` dosya bazlı tablo
- **Düzeltme:** `memory.db` DB-first tablo; `exports/memory.md`, `exports/decisions.md`, `exports/debt.md` generated snapshots; budget config `memory.decay_after_sprints`

### PERF-02: Budget kontrol komutu
- **Bulgu:** `wc -l .brain/MEMORY.md .brain/RETRO.md .brain/DEBT.md .brain/PATTERNS.md .brain/DECISIONS.md .brain/sprints/*.md`
- **Düzeltme:** `deckent memory stats`

### PERF-03/04: Decay açıklamaları
- **Bulgu:** "DEBT.md entries resolved 3+ sprints ago", "PATTERNS.md entries not seen in 8+ sprints"
- **Düzeltme:** `memory.db debt entries` / `memory.db pattern entries`

### PERF-05 ila 10: Best Practices + Overflow + Benchmark
- MEMORY.md "under 80 lines" → `deckent memory decay` ile yönetilir
- "manually trim MEMORY.md" → `deckent memory decay`
- `cat .brain/DEBT.md` → `deckent recall "debt"`
- `wc -l .brain/*.md` → `deckent memory stats`
- `deckent cleanup --decay` → `deckent memory decay`

---

## cli-commands.md — 1 Sorun

### CLI-01: Sprint referansı stale
- **Bulgu:** "Auto-generated reference for Sprint 151" ve "45 top-level commands + 59 subcommands"
- **Doğrulama:** `ls src/cli/commands/ | wc -l` → 57 dosya; 55+ komut; Sprint 186
- **Düzeltme:** "Last updated Sprint 186" + "55+ top-level commands"

---

## api.md + api-examples.md — 1 + 1 Sorun

### API-01/02: Node.js sürüm örneği
- **Bulgu:** `"Node.js v20.11.0 found"` / `"Node.js v20.11.0"` (JSON örneklerinde)
- **Düzeltme:** `"Node.js v24.x found"` / `"Node.js v24.x"`

---

## Kabul Edilen Sorunlar (Düzeltilmedi)

| Dosya | Sorun | Karar |
|-------|-------|-------|
| `config.md` satır 19 | `last_sprint_id` örneği `'sprint-150'` | Değişmez örnek — production değeri değil, belgeleme formatı; kabul edildi |

---

## Doğrulanmış Güncel Dosyalar

`config-reference.md`, `multi-provider.md`, `skills.md`, `managed-docs.md`, `health-check.md`, `marketplace.md`, `migration-guide.md`, `glossary.md`, `api-surface.md` — tüm iddialar kaynak kodla uyumlu bulundu.

---

## Ortak Kök Neden

`mcp-guide.md`, `security.md`, `performance.md` — hepsi Sprint 130 öncesi veya hemen sonrasında yazılmış, Memory V2 ve MCP araç genişlemesi (27→31) hiçbirine yansıtılmamış. Bu dosyaların managed-docs pipeline'ında olmaması güncellemenin gecikmesini açıklıyor.

---

_Audit tamamlandı: 2026-05-22 | Auditor: Alperen | Sprint: 186+_
