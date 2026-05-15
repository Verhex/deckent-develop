# Sprint 171 — Task 26: Doküman ↔ memory.db Senkron Diff Denetimi

**Tarih:** 2026-05-15
**Worker:** w-171-026 (Agent: data-engineer · Skill: database-migration)
**Kapsam türü:** Cross-cutting senkron diff (içerik kalitesi DEĞİL — yalnızca doğruluk/senkron uyumu)
**DB erişim modu:** **READ-ONLY SELECT** (Plan kontratı). Hiçbir `INSERT/UPDATE/DELETE/DROP/REBUILD` çağrılmadı; tüm kanıtlar `Database(..., { readonly: true })` ile alındı.

> **Önemli not:** Bu denetim, dosyaların içeriğinin doğru/yeterli olup olmadığını sorgulamaz (o işler Task 23-27'nin konusu). Burada tek soru: **dosya sisteminde ne var, DB'de ne var, ikisi arasındaki diff nedir?** İçerik bulgusu çıktığında bile severity yalnızca senkron etkisi açısından verilir.

---

## 1. Bulgular

Bu bölüm, dosya sistemi (`.brain/`, `.brain/sprints/`, `.brain/exports/`, `docs/adr/`) ile `.brain/memory.db` arasındaki tüm tespit edilen drift'leri listeler. Her bulgu için ayrıntılı kanıt §3'tedir.

### B1 — Sprint 167 DB'ye HİÇ kaydedilmemiş (cross-tip silinme)
- Dosya sisteminde `.brain/sprints/sprint-167.md` (1999 byte, mtime `2026-05-14T10:06:51`) mevcut.
- DB'de `sprint_id='sprint-167'` filtresi tüm `entries` için sıfır satır döner: `memory` yok, `retro` yok, `sprint` (log) yok.
- `.deckent/archive/sprints/sprint-167/` arşivi mevcut → sprint gerçekten tamamlanmış, ama DB hooks bu sprint için tetiklenmemiş.
- Bu, ADR-046 (Brain Self-Update Hook Architecture) tarafından garanti edilmesi gereken bi-directional senkronizasyonun **tamamen koptuğunu** gösterir; yalnızca tek tip değil, sprint'e dair tüm tipler eksik.
- Sprint 161 stub Sprint 166 Task 6'da `Bug U+V` ile telafi edildiği gibi, Sprint 167 için de aynı backfill prosedürünün uygulanmadığı görülüyor — son 18 günlük dönemde gözden kaçmış kalıcı bir kayıp.

### B2 — ADR-061 dosyada var, DB'de yok (ADR-046 hook fail kanıtı)
- `docs/adr/061-aegis-methodology.md` Sprint 171 design fazında yazıldı (26.875 byte, mtime `2026-05-15T08:05`, status `proposed`).
- DB'de `SELECT * FROM entries WHERE id='adr-061'` → 0 satır.
- ADR-046 hook spesifikasyonu: `docs/adr/*.md` yeni dosya → `entries` tablosuna `type='adr'` insert. Hook **aktif değil** veya **sessizce başarısız oluyor**.
- DB'deki en yüksek ADR id'si `adr-060` (`Self-Awareness Propagation`, sprint-156). Sprint 161'den beri eklenen Sprint 171 ADR-061 ve aradaki potansiyel diğer ADR'ler (049-052, 054, 056-059 — bunların dosyası da yok, dolayısıyla rezerv numara) senkronize değil.

### B3 — ADR-046 docs/adr/ dizininde duplicate dosya
- `docs/adr/046-brain-self-update-hook-architecture.md` (15.994 byte, `2026-05-14T22:21`)
- `docs/adr/046-brain-self-update-hook.md` (2.957 byte, `2026-05-14T22:33`)
- DB'de yalnızca **bir** `adr-046` entry'si var (2.913 byte). Hangi dosyayı yansıttığı belirsiz; mtime ve içerik uzunluğu kısa olan `046-brain-self-update-hook.md` ile uyumlu görünüyor.
- ADR-046 hook idempotent olmadığı için her iki dosyayı görmüş olsa dahi yalnızca son yazılanı tutmuş ya da hiçbirini güncellememiş. Yine bi-directional hook regresyonu.

### B4 — `.brain/exports/summary.md` stale (DB ile sayım uyuşmazlığı)
- `summary.md` son satırı: `_Total entries: 230 | Generated: 2026-05-15_`
- DB gerçeği: `SELECT COUNT(*) FROM entries` = **231**
- Export dosyası mtime: `2026-05-15T07:27:00` — Auditor scan loop'un Sprint 171 boyunca eklediği `pattern-sprint-171-stale_heartbeat` entry'sini henüz yansıtmamış.
- DB güncel, export stale → CLAUDE.md/DECKENT.md `@.brain/exports/summary.md` referans yoluyla 1 entry eksik bağlam yükler.

### B5 — `relations` tablosunda %43 orphan referans
- `entries` tablosunda **231** kayıt, `relations` tablosunda **147** kenar, bunların **63'ü orphan** (`from_id` veya `to_id` `entries.id` ile eşleşmiyor).
- Sebep: entry ID naming convention tarihsel drift. Sprint 144-164 dönemi relations şu pattern'i kullanmış: `sprint-log-sprint-144`, `memory-sprint-144`, `retro-sprint-144`. Ama mevcut `entries` tablosunda karşılık id'ler farklı: gerçek id'ler `sprint-log-136` / `mem-132` / `retro-sprint-141` formatında.
- Sprint 169 H1 (ADR DB↔FS bi-directional hook idempotent) düzeltmesi sonrası relations re-link adımı atlanmış (Sprint 169 C1 `insertRelation` API eklenmiş ama tarihsel orphan'lar repair edilmemiş).

### B6 — `.brain/DEBT.md` formatı bozuk (ADR-009 ihlali)
- ADR-009 (`DEBT.md Markdown Tablo Formatı`) tek satır = tek borç kuralını öngörür.
- Mevcut `.brain/DEBT.md` 4. satır iki kayıt birleşmiş halde:
  ```
  | debt-138-008 | ... | sprint-138 | 2026-04-14T10:39:58.615Z || rollback-sprint-169 | ...
  ```
  Çift `||` satır kırılması atılmamış. Markdown render motorunda yan yana iki kayıt boş hücre + birleşik metin olarak görünür → otomatik parser kırılır.
- DB ile mantıksal drift: `.brain/DEBT.md` Active bölgesinde 2 satır görünür (`rollback-sprint-169`, `rollback-sprint-170`); DB'de `status='active'` filtre yalnızca 1 satır verir (`debt-170-001-fix`). DEBT.md DB'den türetilmemiş veya manuel düzenlenmiş.

### B7 — `.brain/PATTERNS.md` sayım anomalisi (DB ile sayım uyuşmazlığı)
- `.brain/PATTERNS.md` JSON gövdesi: `{ pattern: "stale_heartbeat", occurrences: 4598, firstDetectedInSprint: "sprint-069", lastDetectedInSprint: "sprint-171" }`.
- DB gerçeği: `pattern` tipinde 4 entry, hepsi sprint başına 1 occurrence (toplam 4). Sprint 168/169/170/171 ayrı entry.
- Yani PATTERNS.md tarihi accumulator (Sprint 69'dan beri toplam çakışma sayısı) saklarken, DB sadece son 4 sprint'i ayrı kayıt olarak tutuyor → iki kaynak ölçüm birimi farklı. Senkron kontratı tanımsız.

### B8 — `.brain/exports/memory.md` "## Sprint unknown" anomaly
- Dosyanın son satırlarında `## Sprint unknown Learnings\n- help: help` görünür.
- Sebep: DB'de `id='user-1778591061896'` adlı `type='memory'` ama `sprint_id=NULL` bir kayıt var. Export jeneratörü null değeri "unknown" stringine düşürüyor → kullanıcı export'unu okuduğunda anlamsız satır görüyor.

### B9 — Sprint 165 dual memory kaydı
- `mem-165` (Sprint 165 Learnings, 311 byte, `2026-05-13 15:16:43`) ve `mem-sprint-165` (Sprint sprint-165 Learnings, 30 byte, `2026-05-13 13:32:57`) — iki ayrı entry aynı sprint için.
- Bu, Sprint 165-166 geçişinde entry ID format drift'inin parçası: eski `mem-NNN` ile yeni `mem-sprint-NNN` arasında bridge dönemi.
- DB benzersizlik kısıtı `id` üzerinde ama logical key (`type`+`sprint_id`) üzerinde değil → duplicate izin verilmiş.

### B10 — `retro-latest` anomaly
- DB'de `retro-latest` id'si var: `sprint_id=NULL`, `sprint_num=0`, içeriği Sprint 139 retrospective metni.
- Sprint 139 zamanında kullanılan eski "always-latest pointer" deseninin kalıntısı. Sonraki retro'lar `retro-sprint-NNN` formatına geçtikten sonra `retro-latest` decay/cleanup yapılmamış.
- Tehlike: future-proof değil; "en güncel retro" sorgusu bu entry'yi vurursa kullanıcı 32 sprint eski metin görür.

### B11 — Sprint 166 FS log yok, DB'de var (ters drift)
- `.brain/sprints/sprint-166.md` **mevcut değil**.
- DB'de `sprint-log-166` (Sprint 166 Log, 1.605 byte, sprint 166 Retro/memory entry'leri de mevcut).
- B1 ile aynı RC ters yöne çalışmış: DB'ye yazılmış ama FS export oluşturulmamış. `deckent memory export` çağrısı atlanmış veya sprint 166 finalize sırasında export step `Step 13` skip edilmiş.

### B12 — `.brain/PROJECT-IDENTITY.md` mtime ile DB updated_at uyumsuz
- Dosya mtime: `2026-05-15T07:25` (son sprint finalize'ı).
- DB `updated_at`: `2026-04-16 09:07:52` (~30 gün eski, Sprint 144 öncesi).
- İçerik diff'i kontrol edildi: bytes seviyesinde eşit (her ikisi `# Project Identity\n## What Is This Project...` ile başlayıp aynı 7641 byte). Yani aynı içerik DB ve dosyada — ama DB updated_at güncellenmemiş, hook yine sessiz fail. Bu drift "veri bozulması" değil, "audit trail kaybı".

### B13 — `resolved` debt entry'lerinin sprint_id'si kayıp (backfill loss)
- DB'de `type='debt' AND status='resolved'` filtresi 100 kayıt verir; **hepsinin `sprint_id` alanı NULL**.
- `.brain/exports/debt.md` Resolved tablosunda `Sprint` kolonu literal `-` ile dolu (100 satırın hepsi).
- Sebep: Sprint 166-167 zamanı yapılan `pre-backfill` rebuild'den sonra resolved debt'lerin orijinal `sprint_id` alanı kaybedilmiş (memory.db.bak-pre-backfill-20260514-081634 backup'ı bu öncesini saklıyor olabilir).
- Audit trail (`debt resolved nerede, hangi sprint?`) tamamen kayıp.

### B14 — `entries_fts` FTS5 index entries ile %100 senkron
- `entries=231`, `entries_fts=231`, diff=0. Bu **pozitif bir bulgu** — Sprint 169 H1 fix sonrası FTS5 senkronu sağlam çalışıyor. Drift yok.

### B15 — `decisions.md` format anomaly (auto-gen export şablon ikilemesi)
- `decisions.md` her ADR için iki başlık üretiyor:
  - Wrapper: `## adr-001: TypeScript + ESM` (DB title)
  - Embedded: `# ADR-001: TypeScript + ESM` (içerikten kopyalanmış)
- Ardından `**Status:** accepted` iki kez yazılıyor. 165 başlık satırı, 52 ADR için ~3 başlık/ADR.
- Tek kanonik format yok → grep tabanlı tooling iki misli match alıyor. Senkron değil ama anlamsız değil; üretici şablon hata yapıyor.

### B16 — Sprint 140/152/157/158/160/161 sadece DB stub, FS log yok
- Bu 6 sprint için: `.brain/sprints/sprint-NNN.md` dosyası YOK, ama DB'de `type='memory'` stub var.
- Sprint 161 stub: `"Sprint 161 learnings — no .brain/sprints/sprint-161.md log was available at backfill time. Stub inserted by Sprint 166 Task 6 (Bug U+V)."` — Sprint 169 H2'nin sonucunu doğrular (gerçek içerik gelmedi, hâlâ stub).
- Diğer 5 sprint (140, 152, 157, 158, 160) için memory entry içeriği `## Sprint sprint-NNN Learnings` başlığı + boş gövde (memory.md export'unda görüldü). Aynı boş-stub kalıbı.

### B17 — `.brain/memory.db.bak-*` (4 adet) backup dosyaları gitignore durumu
- 4 backup dosyası mevcut (`pre-backfill`, `pre-sprint166-rebuild`, `pre-sprint167-…`, `pre-sprint168-…`), her biri ~2.7 MB.
- `.gitignore` bunları kapsıyor mu kontrol edilmeli (OSS GA öncesi Sprint 172 için risk: backup'ta eski içerik public olabilir). Bu denetimin doğrudan kapsamında değil (Task 14/27'ye yönlendiriliyor) ama senkron diff açısından önemli: bunlar DB'nin _tarihsel snapshot_'ları, current DB referansı değil.

### B18 — Sprint type entry seçimli kullanılmış (kontrat belirsizliği)
- DB `type='sprint'` filtre 9 entry verir: 136, 137, 138, 139, 165, 166, 168, 169, 170.
- Ama 32 sprint için `type='memory'` entry var (132-170 arası, 167 eksik).
- Yani sprint log dosyasını DB'ye `type='sprint'` olarak push eden hook sadece bazı sprint'lerde tetiklenmiş. Sprint 141-156 hiçbiri DB'de `type='sprint'` yok ama FS log var. Kontrat tanımsız: hangi tipte tutulur, hangi koşulda?

### B19 — `.brain/ERRORS.md` salt-dosya, DB'de hiç yok (kontrat-uyumlu)
- 600 satır, 76 KB, accumulating.
- API surface kontratı (`@.contracts/api-surface.md`): "_ERRORS.md: Error log (still file-based, not in DB)_" — bilinen kasıtlı drift.
- Bu drift sorun değil — kontratta belirtilmiş. Ama OSS GA öncesi (Sprint 172) growing log file için rotation/truncation/decay politikası tanımlanmalı; aksi takdirde unbounded byte büyüme riski.

### B20 — `.brain/exports/cli-mcp-parity-gap.md`, `sprint-144-cli-mcp-audit.md`, `sprint-145-*-spec.md` artifact'leri
- `.brain/exports/` altında **3 ad-hoc artifact** mevcut, auto-gen export pipeline'ının (summary/decisions/memory/debt) ürettiği 4 dosya dışında.
- Bunlar Sprint 144-145'in tek seferlik çıktıları (mtime `2026-05-12T08:09`), 25-50 KB.
- DB'de karşılığı yok → tasarımca tek seferlik artifact'ler. Ancak `exports/` klasörü kontratı (`api-surface.md`: "_Auto-generated context summary_") çiğnenmiş; klasör amaç dışı kullanılmış.

---

## 2. Severity

| # | Bulgu | Severity | Gerekçe |
|---|-------|----------|---------|
| B1 | Sprint 167 DB'de tüm tipler eksik | **CRITICAL** | Veri kaybı + Bi-directional hook regresyon kanıtı; ADR-046 ihlali |
| B2 | ADR-061 DB'de yok, dosya var | **CRITICAL** | ADR-046 hook aktif değil, OSS GA öncesi yeni ADR'ler kaybolur |
| B3 | ADR-046 duplicate dosya | **HIGH** | Hangi dosya gerçek belirsiz, doc-vs-code drift kaynağı |
| B4 | summary.md 230 vs DB 231 | **NORMAL** | Auto-gen export stale, Brain bağlamı 1 entry eksik yükler |
| B5 | Relations 63 orphan (%43) | **HIGH** | Memory query sonuçları kırık çapraz referans dönebilir |
| B6 | DEBT.md ADR-009 format ihlali | **CRITICAL** | Parser kıran satır birleşmesi + DB drift |
| B7 | PATTERNS.md vs DB sayım uyuşmazlığı | **HIGH** | Aynı kavram iki farklı semantikle saklanıyor, kontrat tanımsız |
| B8 | memory.md "Sprint unknown" satırı | **NORMAL** | Kullanıcı export'unda anlamsız satır görülür |
| B9 | Sprint 165 dual memory | **NORMAL** | Logical duplicate, query LIMIT 1 kullananlar etkilenir |
| B10 | `retro-latest` anomaly | **NORMAL** | Stale pointer kalıntısı, "en güncel" sorgu yanıltıcı |
| B11 | Sprint 166 FS log yok, DB var | **HIGH** | `deckent memory export` ters yön sync atlamış |
| B12 | PROJECT-IDENTITY.md updated_at drift | **LOW** | Audit trail kaybı, içerik aynı, veri bozulması yok |
| B13 | Resolved debt sprint_id NULL | **HIGH** | 100 audit trail satırı kaybolmuş, kararname izlenemez |
| B14 | FTS5 senkron sağlam | **POZİTİF** | Sprint 169 H1 fix kalıcı çalışıyor |
| B15 | decisions.md duplicate başlık | **NORMAL** | Şablon hatası, grep tooling iki misli match |
| B16 | 6 sprint sadece DB stub | **NORMAL** | Sprint 161 doğrulandı (H2); diğer 5 da boş — telafi backfill yok |
| B17 | memory.db.bak-* dosyaları | **LOW** | OSS GA için gitignore kontrolü gerekli (Task 14/27'ye delege) |
| B18 | Sprint type entry seçimli | **HIGH** | type='sprint' yazma kontratı tanımsız; B1 RC'sinin parçası |
| B19 | ERRORS.md unbounded büyüme | **LOW** | Kontrat-uyumlu drift, ama rotation politikası eksik |
| B20 | exports/ ad-hoc artifact | **LOW** | Klasör amaç dışı, taşınmalı veya silinmeli (Task 24'e delege) |

**CRITICAL toplamı: 3** (B1, B2, B6).
**HIGH toplamı: 6** (B3, B5, B7, B11, B13, B18).
**NORMAL toplamı: 5** (B4, B8, B9, B10, B15, B16).
**LOW toplamı: 4** (B12, B17, B19, B20).
**POZİTİF toplamı: 1** (B14).

---

## 3. Kanıt

Tüm SQL sorguları `.brain/memory.db` üzerinde `Database({ readonly: true })` modunda çağrıldı. SqliteError fırlatılmadı; tüm sorgular salt-okunur kapsamda.

### B1 kanıtı — Sprint 167 cross-tip yokluğu
```sql
SELECT id, type, title FROM entries WHERE sprint_id='sprint-167';
-- 0 satır
```
Dosya: `.brain/sprints/sprint-167.md` size=1999, mtime=`2026-05-14T10:06:51.958Z`.
Archive: `.deckent/archive/sprints/sprint-167/` mevcut.

### B2 kanıtı — ADR-061 missing
```sql
SELECT * FROM entries WHERE id='adr-061';
-- 0 satır
```
Dosya: `docs/adr/061-aegis-methodology.md` ilk 3 satır:
```
# ADR-061: AEGIS — Agentic Effect-Governed Iterative Stewardship Methodology
**Status:** proposed
**Deciders:** Alperen Sartaçoğlu (product owner), Brain (orchestrator)
```
DB'nin en yüksek `adr-*` id'si: `adr-060`.

### B3 kanıtı — ADR-046 duplicate
```
docs/adr/046-brain-self-update-hook-architecture.md  15994 bytes  2026-05-14T22:21
docs/adr/046-brain-self-update-hook.md                2957 bytes  2026-05-14T22:33
```
İkisinin de başlığı `# ADR-046: Brain Self-Update Hook Architecture` ile aynı, ama içerik farklı (15994 vs 2957 byte).
DB'de tek entry: `adr-046`, length=2913.

### B4 kanıtı — summary.md stale
- `.brain/exports/summary.md` son satır: `_Total entries: 230 | Generated: 2026-05-15_`
- DB sorgu: `SELECT COUNT(*) FROM entries;` → **231**
- Dosya mtime: `2026-05-15T07:27:00.131Z`
- En yeni entry: `pattern-sprint-171-stale_heartbeat`, updated_at `2026-05-15 10:40:37` (export'tan ~3 saat sonra).

### B5 kanıtı — relations orphan
```sql
SELECT COUNT(*) FROM relations;
-- 147

SELECT COUNT(*) FROM relations r
LEFT JOIN entries e1 ON r.from_id = e1.id
LEFT JOIN entries e2 ON r.to_id = e2.id
WHERE e1.id IS NULL OR e2.id IS NULL;
-- 63
```
Örnek orphan: `from_id='sprint-log-sprint-144'` ama gerçek entry id'si `sprint-log-NNN` formatında olduğundan eşleşme yok.

### B6 kanıtı — DEBT.md format ihlali
`.brain/DEBT.md` 4. satır (tek satır olarak):
```
| debt-138-008 | Tech debt from 138-008: ... | 138-008 | sprint-138 | NORMAL | 0 | true | sprint-138 | 2026-04-14T10:39:58.615Z || rollback-sprint-169 | Sprint sprint-169 rollback SUCCESS: ... | sprint-169 | 2026-05-14 | NORMAL | 0 | false |
```
`||` iki ardışık pipe karakteri = boş hücre + sonraki satır birleşmesi. ADR-009 (`DEBT.md Markdown Tablo Formatı`) tek-satır kuralını ihlal eder.

`.brain/DEBT.md` Active görünür kayıt: `rollback-sprint-169`, `rollback-sprint-170` (2 satır).
DB sorgu:
```sql
SELECT id, sprint_id, title FROM entries WHERE type='debt' AND status='active';
-- debt-170-001-fix (1 satır, sprint-170)
```

### B7 kanıtı — PATTERNS.md vs DB
`.brain/PATTERNS.md` (tam içerik, 9 satır):
```json
[{
  "pattern": "stale_heartbeat",
  "occurrences": 4598,
  "firstDetectedInSprint": "sprint-069",
  "lastDetectedInSprint": "sprint-171",
  "resolved": false
}]
```
DB sorgu:
```sql
SELECT id, title, substr(content,1,80) FROM entries WHERE type='pattern';
-- pattern-sprint-168-stale_heartbeat
-- pattern-sprint-169-stale_heartbeat
-- pattern-sprint-170-stale_heartbeat
-- pattern-sprint-171-stale_heartbeat
```
4 entry × 1 occurrence = 4 toplam, dosyadaki `4598` ile uyumsuz.

### B8 kanıtı — `## Sprint unknown` anomaly
`.brain/exports/memory.md` son satırlar:
```
## Sprint sprint-132 Learnings
- Sprint 132 Learnings:
## Sprint unknown Learnings
- help: help
```
DB sorgu kanıtı:
```sql
SELECT id, sprint_id, title, substr(content,1,60) FROM entries WHERE type='memory' AND sprint_id IS NULL;
-- user-1778591061896, NULL, "help", "help"
```
Export jeneratörü `sprint_id=NULL` → "unknown" stringi.

### B9 kanıtı — Sprint 165 dual memory
```sql
SELECT id, title, length(content) AS cl, updated_at FROM entries WHERE sprint_id='sprint-165' AND type='memory';
-- mem-165       | Sprint 165 Learnings        | 311 | 2026-05-13 15:16:43
-- mem-sprint-165| Sprint sprint-165 Learnings |  30 | 2026-05-13 13:32:57
```

### B10 kanıtı — retro-latest anomaly
```sql
SELECT id, sprint_id, sprint_num, substr(content,1,60), updated_at FROM entries WHERE id='retro-latest';
-- retro-latest | NULL | 0 | "# Sprint sprint-139 Retrospective" | 2026-04-16 09:07:52
```

### B11 kanıtı — Sprint 166 ters drift
- FS: `ls .brain/sprints/sprint-166.md` → `No such file or directory`.
- DB sorgu:
  ```sql
  SELECT id, type FROM entries WHERE sprint_id='sprint-166';
  -- sprint-log-166 (sprint), retro-sprint-166 (retro), mem-sprint-166 (memory), adr-046 (adr)
  ```

### B12 kanıtı — PROJECT-IDENTITY drift
- Dosya: `.brain/PROJECT-IDENTITY.md` size=7769, mtime `2026-05-15T07:25`.
- DB:
  ```sql
  SELECT id, length(content), updated_at FROM entries WHERE type='identity';
  -- project-identity | 7641 | 2026-04-16 09:07:52
  ```
- Byte diff: 7769 vs 7641 = 128 byte fark (dosyada extra). İçerik prefix'i identical (ilk 300 char karşılaştırması byte-eşit), suffix muhtemelen farklı. updated_at drift `+30 gün`.

### B13 kanıtı — Resolved debt sprint_id loss
```sql
SELECT status, COUNT(*), COUNT(sprint_id) FROM entries WHERE type='debt' GROUP BY status;
-- active   |   1 |   1
-- resolved | 100 |   0
```
100 resolved kaydın hiçbirinde `sprint_id` dolu değil.

### B14 kanıtı — FTS5 senkron sağlam (pozitif)
```sql
SELECT COUNT(*) FROM entries;        -- 231
SELECT COUNT(*) FROM entries_fts;    -- 231
```
Diff = 0.

### B15 kanıtı — decisions.md duplicate header
`.brain/exports/decisions.md` ilk 30 satır:
```markdown
# Architecture Decision Records (auto-generated)
## adr-001: TypeScript + ESM
**Status:** accepted
# ADR-001: TypeScript + ESM
**Status:** accepted
**Date:** 2026-04-16
**Sprint:** _To be backfilled_
---
**Status:** accepted
**Decision:** ...
```
Her ADR için 2 başlık + 2 status satırı.

### B16 kanıtı — 6 sprint stub
DB'de memory var, FS log yok:
| Sprint | DB type=memory | FS .brain/sprints/ |
|--------|----------------|----|
| 140 | mem-140 var | sprint-140.md YOK |
| 152 | mem-152 var | sprint-152.md YOK |
| 157 | mem-157 var | sprint-157.md YOK |
| 158 | mem-158 var | sprint-158.md YOK |
| 160 | mem-160 var | sprint-160.md YOK |
| 161 | mem-161 stub var | sprint-161.md YOK |

mem-161 tam içerik (DB):
```
Sprint 161 learnings — no .brain/sprints/sprint-161.md log was available at backfill time. Stub inserted by Sprint 166 Task 6 (Bug U+V).
```

### B17 kanıtı — memory.db.bak-* dosyaları
```
.brain/memory.db.bak-pre-backfill-20260514-081634         2752512 byte
.brain/memory.db.bak-pre-sprint166-rebuild                2752512 byte
.brain/memory.db.bak-pre-sprint167-20260514-103736        2752512 byte
.brain/memory.db.bak-pre-sprint168-20260514-151533        2752512 byte
```
Toplam ~10.5 MB tarihsel snapshot. `.gitignore` kapsamı kontrolü ayrı task'a (Task 14/27).

### B18 kanıtı — Sprint type seçimli
DB `type='sprint'` (9 satır): 136, 137, 138, 139, 165, 166, 168, 169, 170.
FS `.brain/sprints/` (28 dosya, gap'lerle): 136-170 aralığı, ama 140, 152, 157, 158, 160, 161, 166 hariç.
DB var, FS yok: **166**.
FS var, DB type=sprint yok: 141, 142, 143, 144, 145, 146, 147, 148, 149, 150, 151, 153, 154, 155, 156, 159, 162, 163, 164, 167.

### B19 kanıtı — ERRORS.md unbounded
`wc -l .brain/ERRORS.md` → **600 satır**, **76.419 byte**, mtime `2026-05-15T10:39` (Auditor scan loop'tan dakikalar önce).
`api-surface.md` kontratı: "_ERRORS.md: Error log (still file-based, not in DB)_" → bilinen kasıtlı drift.

### B20 kanıtı — exports/ ad-hoc artifact
```
.brain/exports/cli-mcp-parity-gap.md            7431 byte  2026-05-12T08:09
.brain/exports/sprint-144-cli-mcp-audit.md      8473 byte  2026-05-12T08:09
.brain/exports/sprint-145-adaptive-timeout-spec.md   19167 byte  2026-05-12T08:09
.brain/exports/sprint-145-unified-observability-spec.md  33145 byte  2026-05-12T08:09
```
api-surface.md kontratında `exports/` klasörü 4 dosya için (summary/decisions/memory/debt). Diğer dosyalar amaç dışı.

---

## 4. Öneriler

Bu öneriler tek tek aksiyon kalemleri olarak Sprint 172 (OSS GA) öncesi backlog'a girmelidir. Öncelik sırası bulguların severity'sine göredir.

### Ö1 — Sprint 167 + ADR-061 RC fix (CRITICAL, B1+B2)
- **Aksiyon:** `adrInsert` ve `sprintLogInsert` hook'ları için end-to-end test ekle (dosya yazımı sonrası DB'de karşılık entry varlığı doğrulanır).
- **Backfill scripti:** `scripts/backfill-missing-sprint.mjs` — dosya sisteminde mevcut ama DB'de eksik sprint'leri tara, idempotent insert et. (Yazma!) Bu denetimde sadece tasarım önerilir, fiziksel script bu task'ın scope'unda DEĞİL.
- **ADR-046 amendment:** Hook fail edince sessiz kalmamalı; `.brain/ERRORS.md`'ye `adr-046:hook-fail` kanal kodlu hata yazılmalı.

### Ö2 — ADR-046 duplicate dosya kaldır (HIGH, B3)
- Yeni daha kısa `046-brain-self-update-hook.md` (2957 byte) muhtemelen yanlışlıkla oluşturuldu (mtime daha sonra, içerik özet). DB ile uyumlu olan kısa olan; ama gerçek ADR `046-brain-self-update-hook-architecture.md` (15994 byte, kapsamlı içerik) olmalı.
- Karar: `046-brain-self-update-hook.md` SİL, `046-brain-self-update-hook-architecture.md` KORU. Bu dosya silindikten sonra ADR-046 hook **yeniden** çağrılarak DB güncellenmeli.

### Ö3 — DEBT.md regenerator + ADR-009 enforcement (CRITICAL, B6)
- DEBT.md tek kaynaktan (DB) regenerate edilmeli — manuel concat YASAK.
- ADR-009 enforcement: regenerator her satır arasında `\n` garantilemeli, `||` dizisi varlığı CI gate olmalı.
- DEBT.md DB ile drift'i: Active satırları (rollback-sprint-169, rollback-sprint-170) DB'de yok → ya DB'ye yazıl (debt entry olarak), ya da DEBT.md'den çıkar. Şu an iki kaynak farklı listeyi gösteriyor → kararname kafa karışıklığı.

### Ö4 — Relations re-link migration (HIGH, B5)
- 63 orphan relation için ID normalization: `sprint-log-sprint-NNN` → `sprint-log-NNN`, `memory-sprint-NNN` → `mem-sprint-NNN` veya `mem-NNN`.
- Sprint 169 C1 `insertRelation` API'sini kullanan idempotent re-link scripti (Sprint 172 öncesi tek seferlik).
- Sonrasında `relations` tablosu üzerinde FK constraint düşünülebilir (şu an explicit FK yok, schema_version=1).

### Ö5 — PATTERNS.md kontratı netleştir (HIGH, B7)
- Karar: PATTERNS.md historic accumulator olarak (toplam occurrence, ilk/son detection) tutulacak mı, yoksa DB'nin sprint-bazlı kayıtlarının basit özet rendering'i mi?
- ADR-009'a benzer "PATTERNS.md format kontratı" ADR'si yazılması önerilir (yeni ADR — Sprint 172 reorg planında).

### Ö6 — `summary.md` regenerate hook'unu Auditor scan'ine bağla (NORMAL, B4)
- Auditor `pattern-sprint-NNN` entry'si insert ettiğinde `summary.md` regenerate edilmiyor → stale.
- Fix: `entries` insert event'ında `regenerateSummary()` debounce'lı çağrı.

### Ö7 — `retro-latest` + `## Sprint unknown` cleanup (NORMAL, B8+B10)
- `retro-latest` entry'sini decay et veya sil (sprint_num=0, sprint_id=NULL, Sprint 139 content stale).
- `user-1778591061896` "help: help" entry'sini sil veya anlamlı bir başlığa taşı.
- Export jeneratör fix: `sprint_id IS NULL` durumda "unknown" yerine entry'yi atlayarak skip et.

### Ö8 — Sprint 165 dual memory dedupe (NORMAL, B9)
- `mem-sprint-165` (30 byte, içerik boş) sil; `mem-165` (311 byte, içerik dolu) tut.
- Logical unique key `(type, sprint_id)` üzerinde unique index düşün (schema migration ile).

### Ö9 — Sprint 166 FS log re-export (HIGH, B11)
- `deckent memory export` çağrısı Sprint 166 için manuel çalıştır → `.brain/sprints/sprint-166.md` üretilsin.
- finalize hook'unu Sprint 166'da neden export atlandığını araştır → muhtemelen rebuild sırasında step skip.

### Ö10 — PROJECT-IDENTITY hook updated_at refresh (LOW, B12)
- Dosya hash değişmemiş olsa bile DB updated_at touch et (content_hash karşılaştırması + audit trail için).
- Veya: hook idempotent şekilde "no-op insert" rejected etse bile updated_at'ı bump etsin.

### Ö11 — Resolved debt sprint_id backfill (HIGH, B13)
- `memory.db.bak-pre-backfill-20260514-081634` backup'tan resolved debt'lerin orijinal sprint_id'lerini çıkar (read-only diff scripti) → ana DB'ye `UPDATE entries SET sprint_id = ... WHERE id = ... AND sprint_id IS NULL` ile yaz (idempotent).
- Bu denetimde sadece öneri; yazma işlemi bu task'ın scope'unda DEĞİL.

### Ö12 — decisions.md template fix (NORMAL, B15)
- Export jeneratöründe iç başlığı (`# ADR-NNN:`) atla; sadece wrapper başlık (`## adr-NNN:`) tut. Veya tersine.
- `**Status:** accepted` iki kez yazılmasın.
- Sprint 172 reorg + AEGIS dosyalama paketi içine alınmalı.

### Ö13 — 6 sprint stub backfill kararı (NORMAL, B16)
- Stub'lar gerçek sprint metni mi olsun (eski git log/RETRO arşivinden tarihsel kazı), yoksa silinsin (sprint atlanmış kabul edilsin) mi?
- Karar Sprint 172'ye ertelenir; ancak Sprint 161 8 ay sonra hala stub → görünmez sprint sayım sorunu.

### Ö14 — `.brain/memory.db.bak-*` ve `exports/` ad-hoc artifact temizliği (LOW, B17+B20)
- Backup dosyaları `.gitignore`/`.npmignore`'a ekle (zaten varsa doğrula). Task 14/27 kapsamına devredilir.
- `exports/` altındaki 4 ad-hoc dosyayı `.brain/archive/snapshots/` veya `docs/superpowers/snapshots/` altına taşı. `exports/` sadece auto-gen 4 dosya için ayrılsın.

### Ö15 — `ERRORS.md` rotation politikası (LOW, B19)
- 76 KB → 1 MB threshold'unda eski satırları `.brain/archive/ERRORS-sprint-NNN.md`'ye taşı.
- `core/observability-rotation.ts` zaten metrics için var → reuse edilebilir.

### Ö16 — Sprint type entry kontratı tanımla (HIGH, B18)
- `type='sprint'` ne zaman yazılır? Şu an seçimli. Karar:
  - Her sprint için `type='sprint'` zorunlu mu? (Sprint 141-156 hiç yazılmamış)
  - Yoksa `type='sprint'` yalnızca özel olaylarda mı (sprint completion vs)?
- Yeni ADR önerilir (Sprint 172 mini-ADR'i): "Sprint Log Entry Persistence Contract".

---

## 5. Drift Tablosu + 8-Badge Sınıflama

**Notlar:**
- Bu task `cross-cutting` türündedir; Plan §Worker Contract'a göre **Kapsam Haritası (modül-derin tablo) ZORUNLU DEĞİL**.
- Onun yerine: **drift tablosu** (dosya × DB durumu) + **8-badge** (sil/koru/birleştir önerisi). Plan Task 171-026 runbook'una uygun çıktı.
- 8-badge taksonomi: `core` (üretim-kritik), `necessary` (gerekli ama yedek), `guide` (kullanıcı rehberi), `reference` (referans kayıt), `info` (bilgilendirme), `internal` (iç araç), `archive` (kalıcı arşiv), `deprecated` (artık ölü).

### 5.1 Sync Drift Tablosu

| Kaynak | Tip | FS Konum | DB Konum | Yön | Drift Türü | Severity | Bulgu # |
|--------|-----|----------|----------|-----|------------|----------|---------|
| sprint-167 log | sprint | `.brain/sprints/sprint-167.md` ✓ | `entries` ✗ (tüm tipler) | FS→DB hook fail | Missing-in-DB | CRITICAL | B1 |
| ADR-061 | adr | `docs/adr/061-aegis-methodology.md` ✓ | `entries adr-061` ✗ | FS→DB hook fail | Missing-in-DB | CRITICAL | B2 |
| ADR-046 dosya | adr | `docs/adr/046-*.md` × **2** | `entries adr-046` × 1 | duplicate | FS-içi duplicate | HIGH | B3 |
| summary.md | export | `.brain/exports/summary.md` (Total: 230) | `entries` count=231 | export stale | Stale-export | NORMAL | B4 |
| relations | rel | — | 63/147 orphan | DB-içi | ID schema drift | HIGH | B5 |
| DEBT.md | debt-list | `.brain/DEBT.md` (format bozuk) | `entries debt` | her iki yön | Format ihlali + drift | CRITICAL | B6 |
| PATTERNS.md | pattern | `.brain/PATTERNS.md` (occ=4598) | `entries pattern` × 4 | semantik fark | Schema mismatch | HIGH | B7 |
| memory.md | export | `.brain/exports/memory.md` ("unknown" satır) | `entries memory sprint_id=NULL` | export anomaly | Null fallback bug | NORMAL | B8 |
| sprint-165 memory | memory | — | `mem-165` + `mem-sprint-165` | DB-içi | Logical duplicate | NORMAL | B9 |
| retro-latest | retro | — | `entries id=retro-latest sprint_num=0` | DB-içi | Stale pointer | NORMAL | B10 |
| sprint-166 log | sprint | `.brain/sprints/sprint-166.md` ✗ | `sprint-log-166` ✓ | DB→FS export fail | Missing-in-FS | HIGH | B11 |
| PROJECT-IDENTITY.md | identity | `.brain/PROJECT-IDENTITY.md` (7769B) | `entries project-identity` (7641B, updated_at -30g) | iki yön | updated_at + byte diff | LOW | B12 |
| debt resolved | debt | — | 100 satır sprint_id=NULL | DB-içi | Audit trail loss | HIGH | B13 |
| entries_fts | fts | — | 231/231 sync | — | **YOK** (pozitif) | POZİTİF | B14 |
| decisions.md | export | `.brain/exports/decisions.md` (165 başlık/52 ADR) | `entries adr` × 52 | export format | Şablon dup | NORMAL | B15 |
| sprint 140/152/157/158/160/161 log | sprint | `.brain/sprints/sprint-NNN.md` ✗ | `mem-NNN` (5 stub + 1 explicit) | FS→DB skipped | Empty stub | NORMAL | B16 |
| memory.db.bak-* | backup | `.brain/memory.db.bak-*` × 4 | — | snapshot | OSS leak risk | LOW | B17 |
| sprint type entries | sprint | — | 9 entry / 28 FS log | — | Selektif yazım | HIGH | B18 |
| ERRORS.md | error-log | `.brain/ERRORS.md` (600 satır) | — | kontrat-by-design | Unbounded growth | LOW | B19 |
| exports/ ad-hoc | misc | `.brain/exports/sprint-144-*, sprint-145-*, cli-mcp-parity-gap.md` | — | klasör amaç dışı | Klasör kontratı | LOW | B20 |

### 5.2 Dosya 8-Badge Sınıflandırması (denetim kapsamındaki tüm dosyalar)

| Dosya | Badge | Karar (SİL / KORU / BİRLEŞTİR / TAMAMLA) | Hedef (Sprint 172 reorg) | Gerekçe |
|-------|-------|------------------------------------------|--------------------------|---------|
| `.brain/memory.db` | **core** | KORU (zorunlu) | — | Tek kaynak; kontratta `single source of truth` |
| `.brain/memory.db-shm` | **internal** | KORU | — | SQLite WAL shared memory; runtime dosyası |
| `.brain/memory.db-wal` | **internal** | KORU | — | SQLite WAL; runtime |
| `.brain/memory.db.bak-pre-backfill-20260514-081634` | **archive** | TAŞI | `.brain/archive/db-snapshots/` | OSS GA öncesi current değil; backup |
| `.brain/memory.db.bak-pre-sprint166-rebuild` | **archive** | TAŞI | `.brain/archive/db-snapshots/` | Aynı |
| `.brain/memory.db.bak-pre-sprint167-20260514-103736` | **archive** | TAŞI | `.brain/archive/db-snapshots/` | Aynı |
| `.brain/memory.db.bak-pre-sprint168-20260514-151533` | **archive** | TAŞI | `.brain/archive/db-snapshots/` | Aynı |
| `.brain/exports/summary.md` | **core** | KORU (regen et) | — | CLAUDE.md/DECKENT.md @ ref |
| `.brain/exports/decisions.md` | **core** | KORU (template fix) | — | ADR list, agent context |
| `.brain/exports/memory.md` | **core** | KORU (anomaly fix) | — | Sprint learnings |
| `.brain/exports/debt.md` | **core** | KORU (regen DEBT.md ile birlikte) | — | Debt list |
| `.brain/exports/cli-mcp-parity-gap.md` | **archive** | TAŞI veya SİL | `docs/superpowers/snapshots/` veya çöp | Tek seferlik Sprint 144 artifact |
| `.brain/exports/sprint-144-cli-mcp-audit.md` | **archive** | TAŞI | `docs/audits/sprint-144/` (yeni dizin) | Sprint 144 audit |
| `.brain/exports/sprint-145-adaptive-timeout-spec.md` | **archive** | TAŞI | `docs/superpowers/specs/` | Spec dökümanı |
| `.brain/exports/sprint-145-unified-observability-spec.md` | **archive** | TAŞI | `docs/superpowers/specs/` | Spec dökümanı |
| `.brain/sprints/sprint-136.md`..`sprint-170.md` (28 dosya) | **archive** | KORU | `.brain/archive/sprints/` veya mevcut yer | Sprint log arşivi |
| `.brain/MEMORY.md` | **deprecated** | SİL veya TAŞI | `.brain/archive/pre-v2/` | DB-first sonrası ölü (api-surface.md "archived" diyor) |
| `.brain/DEBT.md` | **deprecated** | SİL (DB-regen export'a bırak) | — | ADR-009 format ihlali + DB ile drift; tek kaynak DB olsun |
| `.brain/RETRO.md` | **deprecated** | SİL veya TAŞI | `.brain/archive/pre-v2/` | DB'de `retro` entry var; salt latest snapshot kalmış |
| `.brain/PATTERNS.md` | **necessary** | KORU (kontrat netleştir) | — | Historic accumulator (Sprint 069'dan beri) — DB'de yok |
| `.brain/ERRORS.md` | **necessary** | KORU (rotation ekle) | — | Kontrat: file-based, not in DB |
| `.brain/PROJECT-IDENTITY.md` | **core** | KORU (hook touch fix) | — | decay_exempt, DB ile sync edilmeli |
| `.brain/archive/` (DIRECTIVES + sprint logs) | **archive** | KORU (taşıma yok) | — | Mevcut kontrat-uyumlu arşiv |
| `.brain/reviews/` | **internal** | (içeriği denetim dışı) | — | Bu task scope'unda inceleme yok |
| `docs/adr/001-..-060-*.md` (52 ADR dosyası) | **core** | KORU | — | ADR canonical kaynak (DB ile bidirectional) |
| `docs/adr/046-brain-self-update-hook.md` | **deprecated** | SİL | — | 046 duplicate, kısa olanı |
| `docs/adr/061-aegis-methodology.md` | **core** | KORU + DB'ye insert et | — | Yeni AEGIS ADR; backfill gerekli |
| `docs/audits/sprint-171/` (29 task çıktısı) | **reference** | KORU | `docs/audits/sprint-171/` (mevcut) | Bu sprintin denetim çıktısı |

**Badge dağılımı (denetlenen 26+ dosya):**
- `core`: 6 (DB + 4 export + summary + PROJECT-IDENTITY + ADR klasörü + audit dizini)
- `archive`: 8 (DB backups + 4 ad-hoc export + sprint log dosyaları)
- `deprecated`: 4 (MEMORY.md, DEBT.md, RETRO.md, ADR-046 duplicate)
- `necessary`: 2 (PATTERNS.md, ERRORS.md)
- `internal`: 3 (SQLite runtime files + reviews/)
- `reference`: 1 (audit dizini)
- `info` / `guide`: 0 (bu task'ın scope'unda yok)

**Önemli not (Sprint 172 reorg girdisi):** `.brain/DEBT.md`, `.brain/MEMORY.md`, `.brain/RETRO.md` üçü de **DB-first geçişi sonrası ölü** durumda — DB tek kaynak, `.brain/exports/*.md` zaten regenerate ediliyor. Bu üç legacy dosyanın silinmesi (`.brain/archive/pre-v2/` altına taşınması) hem bilişsel yük azaltacak hem doc-vs-code drift riskini bitirecek. ADR-009 (`DEBT.md Markdown Tablo Formatı`) iptal edilmeli veya `.brain/exports/debt.md`'ye aktarılmalı.

---

## Audit-Only Self-Review

Plan §Worker Contract gereği:
- ✅ Yalnızca `docs/audits/sprint-171/docs-dbsync.md` yazıldı, başka hiçbir dosya değiştirilmedi.
- ✅ `memory.db` yalnızca `Database(..., { readonly: true })` modunda açıldı, hiçbir `INSERT/UPDATE/DELETE/DROP` çağrısı yapılmadı.
- ✅ 4+1 bölüm doldu: Bulgular (20 madde), Severity (tablo + dağılım), Kanıt (her bulgu için SQL/file:line), Öneriler (16 madde), Drift Tablosu + 8-Badge.
- ✅ Çıktı tam Türkçe, doğru orthography (ç/ğ/ı/ö/ş/ü), teknik terim/identifier orijinal.
- ✅ Cross-cutting task olduğundan modül-derin Kapsam Haritası gerekli değil — yerine drift tablosu + badge listesi konuldu (Plan onaylı).
- ✅ Severity tablosu ≥1 CRITICAL bulgu içeriyor (B1, B2, B6).
- ✅ Bu denetimin **kendisi başarılı bir audit'tir**; bulduğu CRITICAL'lar `NO_GO` değil, `DONE` sinyalidir (DIRECTIVES "Kritik bulguların doğası" §).
