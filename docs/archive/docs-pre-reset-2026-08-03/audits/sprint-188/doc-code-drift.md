# W2-T11 — Doküman ↔ Kod Drift Denetimi

**Sprint:** 188 (Self-Analysis — Dalga 2)
**Task:** 188-011 (W2-T11)
**Tarih:** 2026-05-22
**Tür:** ANALYSIS-ONLY — kaynak kod / config / doküman DEĞİŞTİRİLMEDİ
**Worker:** w-188-011 (doc-writer agent)
**Bağımlılıklar:** W1-T01 (`cli-command-inventory.md`), W1-T02 (`mcp-tool-inventory.md`), W1-T09 (`feature-inventory.md`)

> Bu rapor W1 envanter raporlarını ground-truth alarak CLAUDE.md, DECKENT.md, README.md, IDENTITY.md ve `docs/reference/` dizinindeki dokümanların kod gerçeğiyle tutarlılığını denetler. Her bulgu `belge:satır ↔ kod gerçeği` formatında kanıtlanmıştır.

---

## 1. Denetim Yöntemi

**Ground-truth kaynaklar:**
- `docs/audits/sprint-188/cli-command-inventory.md` (T01) — gerçek CLI komut sayısı + yapısı
- `docs/audits/sprint-188/mcp-tool-inventory.md` (T02) — gerçek MCP tool/resource sayısı
- `docs/audits/sprint-188/feature-inventory.md` (T09) — ilan edilen özellikler ↔ kod gerçeği
- `src/` dizini doğrudan `ls *.ts | wc -l` sayımları (modül sayıları için)

**İncelenen dokümanlar:**
- `CLAUDE.md` (proje talimatı, checked-in)
- `DECKENT.md` (proje talimatı, checked-in)
- `.deckent/workspace/IDENTITY.md` (proje kimliği, managed-docs)
- `README.md` (halka açık, auto-generated AUTOGEN bloklar)
- `docs/reference/cli-commands.md`
- `docs/reference/mcp-tools.md`
- `docs/reference/api-surface.md`
- `docs/reference/api.md`
- `docs/reference/cli.md`
- `docs/reference/agents.md`
- `docs/reference/api-examples.md`

**Ciddiyet sınıflandırması:**

| Seviye | Anlam |
|--------|-------|
| KRITIK | Kullanıcıyı yanlış yönlendirir; hatalı API/CLI beklentisi yaratır |
| YÜKSEK | Sayısal tutarsızlık; agent/tool eksik belge |
| ORTA | İşlevsel gerçeklikle çelişen tono/iddia; benchmark yokken yapılan iddia |
| DÜŞÜK | Modül sayısı gibi kırılgan sayısal iddialar; küçük isimlendirme farkları |

---

## 2. MCP Tool Sayısı Tutarsızlığı

**En kritik drift bulgusu.** T02 raporunun doğruladığı gerçek tool sayısı **31**'dir.

| Belge | İfade | Gerçek | Ciddiyet |
|-------|-------|--------|---------|
| `IDENTITY.md:30` (Project Status) | `MCP Tools: 27` | **31** | KRITIK |
| `src/mcp/server.ts:33` (DECKENT_MCP_INSTRUCTIONS) | `"## Tools (27)"` | **31** | KRITIK |
| `DECKENT.md:~satır 30` | "31 tools" | 31 | DOĞRU |
| `README.md:18` (AUTOGEN stat-counts) | "31 MCP tools" | 31 | DOĞRU |
| `docs/reference/mcp-tools.md:8` | "31 tools registered." | 31 | DOĞRU |

**Eksik kalan 4 tool (T02 §2):** `deckent_watch`, `deckent_feature_query`, `deckent_audit`, `deckent_recover`

**Kanıt:** `src/mcp/tools/index.ts:53,55,56,57` — 4 araç wire edilmiş; `server.ts:33` dize güncellenmemiş.

**Not:** `IDENTITY.md:17-22` içindeki `<!-- AUTOGEN:START id="identity-summary" -->` bloğunun içi `MCP: 31 tools, 8 resources` yazmaktadır (doğru), ancak `Project Status` tablosu (satır 28-36) bu otomasyonun dışında kalmış ve `MCP Tools: 27` olarak kalmıştır. Bu iki çelişkili değer aynı dosyada yan yana yazmaktadır.

---

## 3. CLI Komut Sayısı Tutarsızlığı

T01 raporunun doğruladığı gerçek üst-düzey komut sayısı **46**'dır.

| Belge | İfade | Gerçek | Ciddiyet |
|-------|-------|--------|---------|
| `CLAUDE.md:59` | "46 commands" | **46** | DOĞRU |
| `IDENTITY.md:17` (AUTOGEN identity-summary) | "CLI Commands: 55+" | 46 üst-düzey | YÜKSEK |
| `IDENTITY.md:32` (Project Status tablosu) | "CLI Commands: 56+" | 46 üst-düzey | YÜKSEK |
| `DECKENT.md:~"55+/56+"` | "55+/56+ CLI commands" | 46 üst-düzey | YÜKSEK |
| `docs/reference/cli-commands.md:4` | "55+ top-level commands + subcommands" | 46 üst + ~65 sub | ORTA |

**Açıklama:** "55+" / "56+" sayıları muhtemelen alt-komutların bir kısmını da sayarak elde edilmiş. T01 §3c, alt-komutlarla birlikte toplamın ~111 CLI yoluna ulaştığını göstermektedir. Ancak "top-level commands" ibaresi doğrudan alt-düzey yolları kapsamamalıdır. Hangi sayım yönteminin kullanıldığına dair net bir açıklama eksiktir. `docs/reference/cli-commands.md:4` "top-level commands" ibaresiyle "55+" demesi yanıltıcıdır: gerçek üst-düzey sayı 46'dır.

---

## 4. IDENTITY.md İçindeki Çelişen Değerler (Aynı Dosyada)

`IDENTITY.md` iki farklı bölümde birbiriyle çelişen sayılar barındırmaktadır:

| Satır | İfade | Başka Satır | İfade | Çelişki |
|-------|-------|------------|-------|---------|
| 18 (AUTOGEN) | `MCP: 31 tools, 8 resources` | 30 (Proje Durumu) | `MCP Tools: 27` | MCP tool sayısı |
| 17 (AUTOGEN) | `CLI Commands: 55+` | 32 (Proje Durumu) | `CLI Commands: 56+` | CLI komut sayısı |
| 16 (AUTOGEN) | `Sprints: 186+ (active)` | README badge | `sprints-175%2B` | Sprint sayısı |

Bu durum auto-generated bloğun (`AUTOGEN:START id="identity-summary"`) güncellenmesine rağmen Proje Durumu tablosunun elle güncellenmemesinden kaynaklanmaktadır.

---

## 5. CLAUDE.md Modül Sayısı Tutarsızlıkları

CLAUDE.md `Architecture` bölümünde her alt-sistemin modül sayısı belirtilmektedir. Doğrudan `ls src/<subsystem>/*.ts | wc -l` ile doğrulanmıştır:

| CLAUDE.md İddası | Dosya:Satır | Gerçek Sayım | Fark | Ciddiyet |
|-----------------|------------|-------------|------|---------|
| `orchestra/ — (76 modules)` | `CLAUDE.md:11` | **78** `.ts` dosyası | +2 | DÜŞÜK |
| `core/ — (90 modules)` | `CLAUDE.md:30` | **93** `.ts` dosyası | +3 | DÜŞÜK |
| `agents/ — (20 modules)` | `CLAUDE.md:50` | **21** `.ts` dosyası | +1 | DÜŞÜK |
| `api/ — (4 modules)` | `CLAUDE.md:57` | **5** `.ts` dosyası | +1 | DÜŞÜK |
| `providers/ — (5 modules)` | `CLAUDE.md:56` | **5** `.ts` dosyası | 0 | DOĞRU |
| `mcp/ — 31 tools + 8 resources` | `CLAUDE.md:58` | 31 tool ✓, 8 resource ✓ | 0 | DOĞRU |

**api/ farkı detayı:** `src/api/` altında `auth.ts`, `chat-handler.ts`, `rate-limiter.ts`, `server.ts`, `watcher.ts` olmak üzere 5 `.ts` dosyası vardır; `terminal/` alt-dizini ayrıca 8 modül içermektedir. CLAUDE.md "4 modules" ifadesi `terminal/` öncesi ya da `rate-limiter.ts` eklenmesinden önce yazılmış olabilir.

**Genel not:** Bu sayısal drift beklenendir — modüller her sprint eklendikçe sayı değişir. Ancak büyük sapmalar (±3+) dikkat çekicidir. Sayıların ya auto-generated bloklara taşınması ya da "~76 modül" gibi yaklaşık ifadeler kullanılması önerilir.

---

## 6. README Badge Drift: Sprints ve Tests

README.md `badges` AUTOGEN bloğu (`README.md:9-11`) iki ayrı sayı içermektedir:

| Badge | README.md Değeri | IDENTITY.md Değeri | Gerçek | Ciddiyet |
|-------|-----------------|-------------------|--------|---------|
| `sprints` | `175%2B` (= "175+") | `Sprints: 186+ (active)` | Sprint 188 aktif | ORTA |
| `tests` | `16774%2B` (= "16774+") | `16,697 descriptors` | Bilinmiyor — sayım değişir | ORTA |

**Sprints badge:** README "175+" derken IDENTITY.md "186+" diyorsa badge güncellenmemiştir. İkisi de AUTOGEN blok içinde olduğuna göre (README:9-11 `AUTOGEN:START id="badges"`) script çalıştırıldığında ya badge güncellenmemiştir ya da iki ayrı script farklı değer üretmektedir.

---

## 7. docs/reference/api.md — Ağır Memory V2 Sonrası Drift

`docs/reference/api.md`, Memory V2 DB-first mimarisi (SQLite FTS5, Sprint 165/166) sonrasında güncellenmemiş en kapsamlı stale referans kümesini içermektedir.

| Belge:Satır | Stale İfade | Kod Gerçeği (Memory V2) | Ciddiyet |
|------------|------------|------------------------|---------|
| `docs/reference/api.md:435` | `const MEMORY_FILE = 'MEMORY.md';` | `.brain/memory.db` SQLite, export: `.brain/exports/memory.md` | YÜKSEK |
| `docs/reference/api.md:436` | `const DECISIONS_FILE = 'DECISIONS.md';` | `.brain/memory.db` → `exports/decisions.md` | YÜKSEK |
| `docs/reference/api.md:437` | `const DEBT_FILE = 'DEBT.md';` | `.brain/memory.db` → `exports/debt.md` | YÜKSEK |
| `docs/reference/api.md:752` | "trims `MEMORY.md` and `RETRO.md`" | Decay; DB-first; .md'ler export | YÜKSEK |
| `docs/reference/api.md:807` | "Writes `.brain/RETRO.md`... appends to `.brain/MEMORY.md`" | DB-first: `store.insert({type:'retro',...})` + `memory export` | YÜKSEK |
| `docs/reference/api.md:1576` | `deckent://memory` — "Current contents of `.brain/MEMORY.md`" | Resource sunar: export veya DB query | YÜKSEK |
| `docs/reference/api.md:1577` | `deckent://debt` — "Current contents of `.brain/DEBT.md`" | Resource sunar: export veya DB query | YÜKSEK |
| `docs/reference/api.md:1836` | Returns content of `.brain/MEMORY.md` | Gerçek: Memory V2 export ya da DB search | YÜKSEK |
| `docs/reference/api.md:1856` | Returns content of `.brain/DEBT.md` | Gerçek: Memory V2 export ya da DB search | YÜKSEK |

**Toplam:** `api.md` içinde en az **9** stale Memory V2 referansı tespit edilmiştir.

---

## 8. docs/reference/cli.md ve cli-commands.md — Stale Memory ve Eksik Komutlar

| Belge:Satır | Stale / Eksik İfade | Kod Gerçeği | Ciddiyet |
|------------|---------------------|------------|---------|
| `docs/reference/cli.md:220` | "Finalize sprint: update MEMORY.md, RETRO.md, PROJECT-IDENTITY.md" | Memory V2 DB-first; `PROJECT-IDENTITY.md` Sprint 166'da kaldırıldı | YÜKSEK |
| `docs/reference/cli.md:981` | "`deckent finalize` — update MEMORY.md, RETRO.md, PROJECT-IDENTITY.md" | Aynı stale referans | YÜKSEK |
| `docs/reference/cli-commands.md:196` | "Finalize a sprint: update MEMORY.md, RETRO.md, PROJECT-IDENTITY.md" | Memory V2 DB-first; PROJECT-IDENTITY.md kaldırıldı | YÜKSEK |
| `docs/reference/cli-commands.md:997` | "Archive resolved debt items from `.brain/DEBT.md`." | `.brain/memory.db`'de tip='debt' entries | YÜKSEK |
| `docs/reference/cli-commands.md` | `audit-verify` komutu eksik | T01: `registerAuditVerify` → `audit-verify` üst-düzey komut | ORTA |
| `docs/reference/cli-commands.md:33` | Row 24: `test` — "Run a test sprint (no retro)" | Komut adı doğru (`test-run.ts:87` `.command('test')`); ama açıklama yeterli mi? | DÜŞÜK |

**Önemli:** `audit-verify` komutu (`src/cli/commands/audit-verify.ts:23` — HMAC audit chain verify) `docs/reference/cli-commands.md`'de listelenmiyor. Kullanıcı bu komutu dokümanlardan bulamaz.

---

## 9. docs/reference/api-examples.md — Stale Memory Referansları

| Belge:Satır | Stale İfade | Kod Gerçeği | Ciddiyet |
|------------|------------|------------|---------|
| `docs/reference/api-examples.md:204` | "Returns contents of `.brain/MEMORY.md`" | Memory V2 DB-first export | YÜKSEK |
| `docs/reference/api-examples.md:221` | "Returns contents of `.brain/DEBT.md`" | Memory V2 DB-first export | YÜKSEK |

---

## 10. docs/reference/mcp-tools.md — AUTOGEN Doğru ama Cleanup Notu Stale

`docs/reference/mcp-tools.md` otomatik üretildiği için MCP tool sayısı (31) doğrudur. Ancak `deckent_cleanup` tool açıklamasında stale referans mevcuttur:

| Belge:Satır | Stale İfade | Gerçek | Ciddiyet |
|------------|------------|--------|---------|
| `docs/reference/mcp-tools.md:16` | "trims MEMORY.md, RETRO.md, sprint logs" | Memory V2 DB-first decay; .md'ler export | ORTA |

Bu, mcp-tools.md'nin `deckent_cleanup` handler'ının kendi açıklamasından doğrudan üretildiğini göstermektedir. Stale açıklama `src/mcp/tools/cleanup.ts`'te kaynaklıdır.

---

## 11. W1 Raporlarından Gelen Drift Kaynakları — Dokümanlara Yansıması

W1 envanter raporları (T01/T02/T09) çeşitli "ilan vs gerçek" farkları tespit etti. Bu farkların dokümanlara yansıma durumu:

| W1 Bulgusu | Kaynak Rapor | Dokümanlara Yansımış mı? | Ciddiyet |
|-----------|-------------|------------------------|---------|
| Gerçek CLI 46, IDENTITY "55+/56+" | T01 §3b | YANSIMIYOR — drift devam ediyor | YÜKSEK |
| Gerçek MCP 31, IDENTITY:30 "27" | T02 §2 | YANSIMIYOR — IDENTITY:30 hâlâ 27 | KRITIK |
| Nervous System default-off, README canlı sunuyor | T09 B-N01 | YANSIMIYOR — README:537+ hâlâ "proactive" tonu | ORTA |
| ADR-037 RBAC runtime advisory/soft, README "strict role boundaries" | T09 B-G01 | YANSIMIYOR — README dilini yumuşatmadı | ORTA |
| "96% context reduction" kanıtsız iddia | T09 B-M02 | YANSIMIYOR — README:15 hâlâ iddia var | ORTA |
| `sandbox.ts` dormant (0 caller) | T09 B-I01 | Belgede sayıca doğru ("5 providers"), semantik drift | DÜŞÜK |
| Discord/Telegram dormant | T09 B-N02 | Dokümanlar "Discord, Telegram, WhatsApp" destekleniyor yazar | ORTA |

---

## 12. docs/reference/agents.md — Ajan Sayısı Doğru, Temp Ajan Sınıflandırması Eksik

`docs/reference/agents.md:8` "17 agents (15 built-in, 2 custom)" ifadesi IDENTITY.md "15 built-in + 2 custom" ile uyumludur ve T09 kanıtıyla doğrulanmıştır. Ancak:

| Belge:Satır | İfade | Durum | Ciddiyet |
|------------|-------|-------|---------|
| `docs/reference/agents.md:27-28` | `temp-react-specialist`, `temp-react-ts-specialist` listeleniyor | DOĞRU — bu iki temp ajan LRU'da aktif | DÜŞÜK |
| Tablo sıralaması | Built-in'ler alfabetik, temp'ler sonda | ADR-041 yatay skill / dikey agent ayrımı belgelenmemiş | DÜŞÜK |

---

## 13. Uyumsuzluk Özet Tablosu

| # | Belge | Satır/Bölüm | Stale/Yanlış İfade | Kod Gerçeği | Ciddiyet |
|---|-------|------------|---------------------|------------|---------|
| D01 | `IDENTITY.md` | :30 (Project Status) | `MCP Tools: 27` | **31** | KRITIK |
| D02 | `src/mcp/server.ts` | :33 (DECKENT_MCP_INSTRUCTIONS) | `"## Tools (27)"` | **31** | KRITIK |
| D03 | `IDENTITY.md` | :17 (AUTOGEN summary) | `CLI Commands: 55+` | 46 üst-düzey | YÜKSEK |
| D04 | `IDENTITY.md` | :32 (Project Status) | `CLI Commands: 56+` | 46 üst-düzey | YÜKSEK |
| D05 | `docs/reference/cli-commands.md` | :4 | "55+ top-level commands" | 46 üst-düzey | YÜKSEK |
| D06 | `docs/reference/api.md` | :435-437 | `MEMORY_FILE`, `DECISIONS_FILE`, `DEBT_FILE` .md constant | Memory V2 DB-first | YÜKSEK |
| D07 | `docs/reference/api.md` | :807 | "Writes `.brain/RETRO.md`... appends to `.brain/MEMORY.md`" | DB store.insert() | YÜKSEK |
| D08 | `docs/reference/api.md` | :1576-1577 | MCP resource memory/debt = `.brain/MEMORY.md`/`DEBT.md` | DB-backed resource | YÜKSEK |
| D09 | `docs/reference/api.md` | :1836, :1856 | Returns `.brain/MEMORY.md`/`DEBT.md` content | DB-first export | YÜKSEK |
| D10 | `docs/reference/cli.md` | :220, :981 | "update MEMORY.md, RETRO.md, PROJECT-IDENTITY.md" | DB-first; PROJECT-IDENTITY removed | YÜKSEK |
| D11 | `docs/reference/cli-commands.md` | :196 | "update MEMORY.md, RETRO.md, PROJECT-IDENTITY.md" | DB-first; PROJECT-IDENTITY removed | YÜKSEK |
| D12 | `docs/reference/cli-commands.md` | :997 | "from `.brain/DEBT.md`" | `.brain/memory.db` | YÜKSEK |
| D13 | `docs/reference/api-examples.md` | :204, :221 | `.brain/MEMORY.md`/`DEBT.md` references | DB-first | YÜKSEK |
| D14 | `CLAUDE.md` | :11 | "orchestra/ — (76 modules)" | **78** .ts dosyası | DÜŞÜK |
| D15 | `CLAUDE.md` | :30 | "core/ — (90 modules)" | **93** .ts dosyası | DÜŞÜK |
| D16 | `CLAUDE.md` | :50 | "agents/ — (20 modules)" | **21** .ts dosyası | DÜŞÜK |
| D17 | `CLAUDE.md` | :57 | "api/ — (4 modules)" | **5** .ts dosyası | DÜŞÜK |
| D18 | `README.md` | :10 (badge AUTOGEN) | `sprints-175%2B` | Sprint 188 aktif; IDENTITY "186+" | ORTA |
| D19 | `README.md` / `IDENTITY.md` | README:10 vs IDENTITY:11 | Tests: `16774+` vs `16,697` | İki farklı sayım | ORTA |
| D20 | `README.md` | :15, :156, Highlights | Nervous System "live proactive" tonu | default-off; deckent-dev hâlâ kapalı | ORTA |
| D21 | `README.md` | :152 | "strict role boundaries" (ADR-037) | runtime advisory/soft; koşulsuz `return true` | ORTA |
| D22 | `README.md` | :157 | "96% context reduction" | Benchmark kanıtı yok | ORTA |
| D23 | `docs/reference/cli-commands.md` | eksik satır | `audit-verify` komutu listelenmemiş | `registerAuditVerify` → `audit-verify` canlı komut | ORTA |
| D24 | `docs/reference/mcp-tools.md` | :16 | deckent_cleanup: "trims MEMORY.md, RETRO.md" | Memory V2 DB decay | ORTA |
| D25 | `IDENTITY.md` | :16-30 (aynı dosya) | "MCP: 31" (AUTOGEN) vs "MCP Tools: 27" (Proje Durumu) | 31 | KRITIK |

---

## Özet

Sprint 188 W2-T11 denetiminde toplam **25 doc↔kod drift bulgusu** tespit edilmiştir. Dağılım:
- **3 KRİTİK** (D01, D02, D25): MCP tool sayısı IDENTITY.md ve server.ts içinde "27" iken gerçek 31
- **11 YÜKSEK** (D03–D13): Memory V2 sonrası stale .md dosya referansları, CLI sayısı
- **7 ORTA** (D18–D24): Stale badge, tono/iddia farklılıkları, eksik komut belgeleri
- **4 DÜŞÜK** (D14–D17): Modül sayısı küçük kaymaları

**En ağır drift:** `docs/reference/api.md` 9 bağımsız stale Memory V2 referansı ile en fazla bayat içeriğe sahip doküman.

**Tutarlı olan dokümanlar:** `docs/reference/mcp-tools.md` (31 tool, auto-generated), `README.md:18` (31 MCP), `DECKENT.md` (31 tool, 8 resource), `docs/reference/agents.md` (17 agent doğru).

**Kök neden:** Memory V2 mimarisine geçiş (Sprint 165/166) kaynak kodu güncelledi; ancak `docs/reference/` içindeki çeşitli dokümanlar (özellikle `api.md`, `cli.md`, `cli-commands.md`, `api-examples.md`) eski `.brain/MEMORY.md` / `DEBT.md` / `DECISIONS.md` paradigmasına yapılan referansları temizlemedi.

---

## Sprint 189 Follow-up

| ID | Eylem | Dosya | Öncelik |
|----|-------|-------|---------|
| F01 | `IDENTITY.md:30` → `MCP Tools: 27` → **`MCP Tools: 31`** | `IDENTITY.md` | KRİTİK |
| F02 | `src/mcp/server.ts:33` `DECKENT_MCP_INSTRUCTIONS` "## Tools (27)" → "## Tools (31)" + 4 eksik tool ekle | `server.ts` | KRİTİK |
| F03 | `docs/reference/api.md` Memory V2 güncelleme — 9 stale referansı (satır 435-437, 752, 807, 1576-77, 1836, 1856) DB-first gerçekliğiyle güncelle | `api.md` | YÜKSEK |
| F04 | `docs/reference/cli.md:220,981` `deckent finalize` açıklamasındaki "MEMORY.md, RETRO.md, PROJECT-IDENTITY.md" ifadesini Memory V2 gerçeğiyle güncelle | `cli.md` | YÜKSEK |
| F05 | `docs/reference/cli-commands.md:196,997` stale `.brain/MEMORY.md`/`DEBT.md` referanslarını güncelle + `audit-verify` komutunu tabloya ekle | `cli-commands.md` | YÜKSEK |
| F06 | `docs/reference/api-examples.md:204,221` stale `.brain/MEMORY.md`/`DEBT.md` references → DB-first gerçeği | `api-examples.md` | YÜKSEK |
| F07 | `docs/reference/cli-commands.md:4` başlık "55+ top-level commands + subcommands" → "46 top-level commands + 65 subcommands (~111 total CLI paths)" | `cli-commands.md` | ORTA |
| F08 | `IDENTITY.md` Project Status tablosu (satır 28-36) → AUTOGEN bloğa taşı ya da her sprint sonrası otomatik güncelleme sağla | `IDENTITY.md` | ORTA |
| F09 | `README.md` badges AUTOGEN bloğunu IDENTITY.md `sprints: 186+` ile senkronize et | `README.md` | ORTA |
| F10 | `README.md:156-157` Nervous System tonunu "configurable / opt-in (disabled by default in deckent-dev)" olarak netleştir | `README.md` | ORTA |
| F11 | `README.md:157` "96% context reduction" iddiasına `docs/benchmark/memory-v2.md` benchmark dosyası ekle ya da ifadeyi yumuşat | `README.md` | ORTA |
| F12 | `README.md:152` "strict role boundaries" → "compile-time lint + advisory runtime (V1.0; hard enforcement V2 post-GA)" | `README.md` | ORTA |
| F13 | `CLAUDE.md` modül sayılarını (orchestra:76, core:90, agents:20, api:4) auto-generated hale getir ya da "~N modül" olarak yuvarlat | `CLAUDE.md` | DÜŞÜK |
| F14 | `docs/reference/mcp-tools.md:16` deckent_cleanup açıklamasındaki "trims MEMORY.md, RETRO.md" kaynağını `src/mcp/tools/cleanup.ts` içinde düzelt | `cleanup.ts` / `mcp-tools.md` | ORTA |

---

**Rapor sonu** — `docs/audits/sprint-188/doc-code-drift.md` — Sprint 188 W2-T11 (188-011). 25 doc↔kod drift bulgusu, 3 kritik / 11 yüksek / 7 orta / 4 düşük; 14 Sprint 189 follow-up önerisi.
