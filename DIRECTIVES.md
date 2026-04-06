# DIRECTIVES — Sprint 096: Omurga Düzeltme + Dokümantasyon Tutarlılık (Stres Test)

## Goal: Tüm dokümantasyon dosyalarındaki sayı, isim, referans tutarsızlıklarını düzelt. Kaldırılan özelliklerin artıklarını temizle. Eski mod isimlerini canonical olarak güncelle. Modül sayılarını doğrula. DECKENT.md skill isimlerini düzelt. architecture.md'yi güncelleştir. Bu sprint Deckent'in yük altında performansını test ediyor — 10 task paralel.

---

## Task 1: README.md + README-TR.md Sayı ve Tablo Düzeltmeleri
- Model: opus
- Effort: normal
- Agent: refactorer
- Skills: typescript-expert
- Files: README.md, README-TR.md
- Scope: ./

### Description
README dosyalarındaki yanlış sayıları ve eksik tabloları düzelt.

A) README.md:
- Badge satırı (satır 5): sprints badge 88→95+ güncelle
- Satır 90: "18 MCP tools" → "19 MCP tools" (checkpoint eklendi)
- Satır 113: karşılaştırma tablosu "Yes (18 tools)" → "Yes (19 tools)"
- Satır 304: MCP Tools başlığı (18) → (19)
- MCP tool tablosuna `deckent_checkpoint` satırı ekle: `| deckent checkpoint | Approve/reject human checkpoints | list, approve, reject |`
- Satır 407: "16 endpoints" → "17 endpoints"

B) README-TR.md:
- Badge satırı (satır 7): sprints badge 88→95+
- Satır 92: "18 MCP tool" → "19 MCP tool"
- Satır 115: "Evet (18 tool)" → "Evet (19 tool)"
- Satır 306: MCP Tool'lar başlığı (18) → (19)
- MCP tool tablosuna `deckent_checkpoint` satırı ekle
- Satır 409: "16 endpoint" → "17 endpoint"

**Kanıt:** `grep -c "19 tools\|19 tool\|19 MCP" README.md README-TR.md` → 4+ eşleşme

**Test:** Dosyalar valid markdown.

---

## Task 2: DECKENT.md Skill İsimleri + MCP Tablo + Checkpoint
- Model: opus
- Effort: high
- Agent: refactorer
- Skills: typescript-expert
- Files: DECKENT.md
- Scope: ./

### Description
DECKENT.md'deki ciddi tutarsızlıkları düzelt.

A) Built-in Skills tablosundaki 6 yanlış ismi düzelt (manifest.json'daki gerçek isimlerle eşleştir):
- `security-expert` → `security-specialist`
- `performance-expert` → `performance-optimizer`
- `api-designer` → `api-builder`
- `refactoring-expert` → kaldır (manifest yok) veya doğru isim bul
- `ci-cd-expert` → `devops-engineer`
- `database-expert` → `database-migration`
- `frontend-expert` → `react-specialist`
- `python-expert` eksik — ekle

B) MCP Tool Reference tablosuna `deckent_checkpoint` ekle:
- `| deckent_checkpoint | Checkpoint approve/reject | Hayır | Hayır |`

C) MCP tool sayısını 18→19 güncelle (satır 28 ve tablo başlığı)

D) Built-in Agents tablosunu doğrula (9 agent — doğru)

**Kanıt:** `grep "security-specialist\|performance-optimizer\|api-builder\|devops-engineer\|database-migration\|react-specialist\|python-expert" DECKENT.md | wc -l` → 7

**Test:** Dosya valid markdown.

---

## Task 3: CLAUDE.md + IDENTITY.md + PROJECT-IDENTITY.md Sayı Düzeltmeleri
- Model: opus
- Effort: normal
- Agent: refactorer
- Skills: typescript-expert
- Files: CLAUDE.md, .deckent/workspace/IDENTITY.md, .brain/PROJECT-IDENTITY.md
- Scope: ./, .deckent/, .brain/

### Description
Üç dosyadaki yanlış sayıları düzelt.

A) CLAUDE.md:
- Satır 11: "orchestra/ (48 modules)" → "(47 modules)"
- Satır 30: "core/ (49 modules)" → "(48 modules)"
- Satır 47: "18 tools + 8 resources" → "19 tools + 8 resources"
- Satır 48: "33+ commands" → "34+ commands"

B) .deckent/workspace/IDENTITY.md:
- Sprints: 91+ → 95+
- MCP: "18 tools, 8 resources" → "19 tools, 8 resources"
- Test sayısı güncel mi kontrol et

C) .brain/PROJECT-IDENTITY.md:
- Satır 11: "orchestra/ (48 modules)" → "(47 modules)"
- Satır 18: "core/ (49 modules)" → "(48 modules)"
- Satır 20: "agent-pool.ts (8 built-in" → "(9 built-in"
- Satır 24: "18 tools + 8 resources" → "19 tools + 8 resources"
- Satır 25: "33 commands" → "34 commands"
- Satır 31: "Test Count: 12" → doğru değer (dosya sistemi tarayarak veya son bilinen değer)
- Satır 69: "33+ commands" → "34+ commands"
- Satır 70: "18 tools + 8 resources" → "19 tools + 8 resources"

**Kanıt:** `grep "47 modules\|48 modules\|19 tools\|34" CLAUDE.md .brain/PROJECT-IDENTITY.md` → 6+ eşleşme

**Test:** Dosyalar valid markdown.

---

## Task 4: docs/reference/cli.md — Usage Komutu Kaldır + Sayılar
- Model: opus
- Effort: normal
- Agent: refactorer
- Skills: typescript-expert
- Files: docs/reference/cli.md
- Scope: docs/

### Description
cli.md'den kaldırılan usage komutunu temizle ve sayıları güncelle.

A) `deckent usage` komut satırını TOC'dan kaldır (satır ~38)
B) usage komutu tam dokümantasyonunu kaldır (satır ~412-430 arası blok)
C) Komut sayısını güncelle (33→34)
D) Eski mod isimlerini (max_plan, pro_plan) legacy olarak işaretle veya yeni isimlerle değiştir
E) `deckent checkpoint` komutu dokümante edilmemişse ekle

**Kanıt:** `grep "deckent usage" docs/reference/cli.md` → 0 eşleşme

**Test:** Dosya valid markdown.

---

## Task 5: docs/reference/api.md — Usage + Eski Mod İsimleri Temizliği
- Model: opus
- Effort: normal
- Agent: refactorer
- Skills: typescript-expert
- Files: docs/reference/api.md
- Scope: docs/

### Description
api.md'deki eski referansları temizle.

A) PlanMode tipi tanımını güncelle: `'performance' | 'balanced' | 'economic' | 'api'` (eski isimler legacy alias olarak not)
B) `DEFAULT_MODE = 'max_plan'` → `DEFAULT_MODE = 'performance'`
C) CLI tablosundaki `usage` komutunu kaldır (satır ~2195)
D) Config örneklerindeki `"mode": "pro_plan"` → `"mode": "economic"`
E) Endpoint sayısını güncelle (16→17)

**Kanıt:** `grep "max_plan\|pro_plan\|deckent usage" docs/reference/api.md | grep -v legacy | wc -l` → 0

**Test:** Dosya valid markdown.

---

## Task 6: docs/reference/config-reference.md — Mod İsimleri Canonical Güncelleme
- Model: opus
- Effort: normal
- Agent: refactorer
- Skills: typescript-expert
- Files: docs/reference/config-reference.md
- Scope: docs/

### Description
config-reference.md'deki eski mod isimlerini canonical yeni isimlerle güncelle.

A) `max_plan` → `performance` (canonical olarak)
B) `max5x_plan` → `balanced`
C) `pro_plan` → `economic`
D) Eski isimleri "Legacy alias" olarak belirt
E) Default mode: `max5x_plan` → `balanced`
F) usage_thresholds referansları varsa kaldır

**Kanıt:** `grep "max_plan\|max5x_plan\|pro_plan" docs/reference/config-reference.md | grep -v "legacy\|alias\|eski" | wc -l` → 0

**Test:** Dosya valid markdown.

---

## Task 7: docs/architecture/architecture.md — Tam Güncelleme
- Model: opus
- Effort: high
- Agent: refactorer
- Skills: typescript-expert
- Files: docs/architecture/architecture.md
- Scope: docs/

### Description
architecture.md Sprint 065'ten kalma ve tamamen eski. Güncelleştir.

A) Version/sprint bilgisini güncelle (065→095)
B) CLI komut sayısını güncelle (28→34)
C) MCP tool sayısını güncelle (10→19)
D) MCP resource sayısını güncelle (5→8)
E) API endpoint sayısını güncelle (16→17)
F) Modül listesini güncel dosya yapısıyla eşleştir:
   - orchestra: 47 modül
   - core: 48 modül
   - agents: 16 modül
   - providers: 5 modül
   - api: 3 modül
   - mcp: 19 tool + 8 resource
G) Eski mod isimlerini güncelle
H) usage referanslarını kaldır
I) Yeni modülleri ekle (sprint-phases.ts, result-collector.ts, heartbeat-daemon.ts, checkpoint.ts, vb.)

**Kanıt:** `grep "Version:\|Sprint 065\|28 CLI\|10 MCP tool" docs/architecture/architecture.md | wc -l` → 0

**Test:** Dosya valid markdown.

---

## Task 8: docs/reference/ Kalan Dosyalar — Mod İsimleri + Usage Temizliği
- Model: opus
- Effort: normal
- Agent: refactorer
- Skills: typescript-expert
- Files: docs/reference/performance.md, docs/reference/mcp-guide.md, docs/reference/health-check.md, docs/reference/migration-guide.md, docs/reference/api-examples.md, docs/reference/glossary.md
- Scope: docs/reference/

### Description
Kalan reference dosyalarındaki eski mod isimleri ve usage referanslarını temizle.

A) performance.md: `max_plan`/`pro_plan` → `performance`/`economic` (veya legacy olarak işaretle)
B) mcp-guide.md: `max_plan` canonical → `performance` canonical
C) health-check.md: `usage` komut referansını kaldır
D) migration-guide.md: eski mod isimlerini güncelle, usage_thresholds referanslarını kaldır
E) api-examples.md: eski mod isimleri + fiveHourPercent/weeklyPercent kalıntılarını temizle
F) glossary.md: usage referanslarını kaldır

**Kanıt:** `grep -l "max_plan\|deckent usage\|usage_thresholds" docs/reference/performance.md docs/reference/mcp-guide.md docs/reference/health-check.md docs/reference/migration-guide.md docs/reference/api-examples.md docs/reference/glossary.md | wc -l` → 0

**Test:** Dosyalar valid markdown.

---

## Task 9: docs/guide/ + docs/development/ + docs/architecture/ Kalan — Sayı ve Referans Düzeltmeleri
- Model: opus
- Effort: normal
- Agent: refactorer
- Skills: typescript-expert
- Files: docs/guide/quickstart.md, docs/guide/getting-started.md, docs/guide/deckent-nedir.md, docs/development/brain-guide.md, docs/architecture/sprint-lifecycle.md, docs/architecture/agent-skill-architecture.md, docs/release/release-notes.md, docs/release/roadmap.md
- Scope: docs/

### Description
Kalan docs dosyalarındaki sayı, mod ismi ve referans düzeltmeleri.

A) quickstart.md: "Max workers: 5 (max_plan)" → "Max workers: 8 (performance)"
B) getting-started.md: "33 commands" → "34 commands"
C) deckent-nedir.md: eski mod isimleri + usage referansları güncelle
D) brain-guide.md: eski referansları güncelle
E) sprint-lifecycle.md: güncel akışı yansıt
F) agent-skill-architecture.md: güncel referanslar
G) release-notes.md: "33+ CLI commands" → "34+"
H) roadmap.md: "33+ CLI commands" → "34+"

**Kanıt:** `grep "33 commands\|33+" docs/guide/ docs/development/ docs/release/ | wc -l` → 0

**Test:** Dosyalar valid markdown.

---

## Task 10: src/cli/commands/init.ts — Skill İsimleri Düzeltme
- Model: opus
- Effort: normal
- Agent: refactorer
- Skills: typescript-expert
- Files: src/cli/commands/init.ts
- Scope: src/cli/

### Description
init.ts DECKENT.md'ye yazarken eski skill isimlerini kullanıyor. Güncelleştir.

A) init.ts'de DECKENT.md içeriği oluşturan bölümde Built-in Skills listesini bul (satır ~1320)
B) Eski isimleri düzelt:
   - `security-expert` → `security-specialist`
   - `performance-expert` → `performance-optimizer`
   - `api-designer` → `api-builder`
   - `refactoring-expert` → kaldır (mevcut değil)
   - `ci-cd-expert` → `devops-engineer`
   - `database-expert` → `database-migration`
   - `frontend-expert` → `react-specialist`
   - `python-expert` ekle
C) Bu liste .deckent/skills/*/manifest.json dosyalarıyla birebir eşleşmeli

**Kanıt:** `grep "security-specialist\|performance-optimizer\|devops-engineer\|database-migration\|react-specialist\|python-expert" src/cli/commands/init.ts | wc -l` → 6+

**Test:** `tsc --noEmit` temiz.

---

## Quality Rules
- tsc --noEmit MUST pass
- npx vitest run → 0 fail
- Tüm sayılar gerçek dosya sistemiyle tutarlı
- Eski mod isimleri canonical olarak hiçbir yerde geçmemeli (legacy alias hariç)
- Usage referansı aktif docs'ta → 0 (archive/directives hariç)
- DECKENT.md skill isimleri manifest.json ile birebir eşleşmeli
- MCP tool sayısı her yerde 19
- Sprint sayısı her yerde 95+
- CLI komut sayısı her yerde 34+
- %100 GO hedefli — her dosya doğru, her sayı tutarlı
