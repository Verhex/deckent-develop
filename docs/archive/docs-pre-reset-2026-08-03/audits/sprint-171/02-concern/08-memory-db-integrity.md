# Memory V2 DB Integrity Audit — Audit Raporu (Sprint 171)

> **Task:** 171-022 — `src/core/memory-*.ts` + `.brain/memory.db` (read-only) + `.brain/exports/**` cross-cutting bütünlük denetimi.
> **Yöntem:** Char-level kaynak okuma + `better-sqlite3` üzerinden read-only `SELECT` sorguları (yazma/DROP/rebuild YASAK, `feedback_db_silmek_yasak`).
> **Veri toplama zamanı:** 2026-05-15, schema_version=1 (`applied_at='2026-04-16 09:07:52'`).
> **Tek tek doğrulanan istatistikler:** 231 active entries, 147 relations, 1398 history records, 53 docs/adr/ dosyası.

---

## 1. Bulgular (Findings)

### 1.1 Şema (Schema) — Kontrat vs Gerçek

1. **`relations` tablosunda FOREIGN KEY yok.** `.contracts/api-surface.md` (Sprint 169 C1 sonrası) ve `MemoryStore.insertRelation` overload (object form) DB-katmanı bütünlüğünü vaat eder; ancak `relations(from_id, to_id, rel_type)` yalnızca PRIMARY KEY ile korunur, FK kısıtı yoktur. `PRAGMA foreign_key_list(relations)` boş döner. Sonuç: bir entry silinince ilgili relation'lar dangling kalır; orphan tespiti yalnızca `insertRelation(MemoryRelation)` object overload'unda uygulama katmanında yapılır (`memory-store.ts:643-654`), pozisyonel overload'ta atlanır.

2. **`entry_history` tablosunda da FK yok.** `entry_id` sütunu mantıken `entries.id`'ye refere eder ama `PRAGMA foreign_key_list(entry_history)` boş. Yalnızca `tags` tablosunda `ON DELETE CASCADE` ile FK tanımlıdır (`memory-store.ts:126`); diğer iki ilişkisel tablo (relations, entry_history) korumasızdır.

3. **Şema kontratının tamamlanmamış alanları:**
   - `entries.metadata` JSON string olarak tutulur ama hiçbir CHECK kısıtı yok — geçersiz JSON DB'ye girebilir.
   - `entries.status` 8 enum değeri tanımlı (`memory-types.ts:31-39`) ama DB'de CHECK constraint yok — keyfi string yazılabilir.
   - `relations.rel_type` 6 enum değer (`memory-types.ts:42-48`) — yine CHECK constraint yok.
   - `entries.lang`, `entries.source`, `entries.priority` aynı durumda — kontrat dokümanda enum, DB'de serbest TEXT.

### 1.2 FTS5 Index — 8 Sütun Drift Yok, Ama Tokenizer Riskli

4. **FTS5 sütun kontratı tutarlı.** `entries_fts` virtual table 8 sütun ile bootstrap edilir (`memory-store.ts:191-200`): `title, content, summary, tag_text, title_norm, content_norm, summary_norm, tag_norm`. `PRAGMA table_info(entries_fts)` ile doğrulandı — 4 orijinal + 4 normalize sütun mevcut. `.contracts/api-surface.md` "8 columns: 4 original + 4 turkishNormalize" iddiası ile **birebir uyumlu**.

5. **FTS5 row count entries ile birebir** (`231 = 231`). Trigger'lar (`entries_ai`, `entries_ad`, `entries_au`) tüm INSERT/DELETE/UPDATE event'lerini FTS5'e ileterek senkronu koruyor (`memory-store.ts:217-247`).

6. **Tokenizer çift normalizasyon riski:** `tokenize='unicode61 remove_diacritics 2'` aktif (`memory-store.ts:197`). Yani FTS5 zaten diacritics'i temizliyor. `turkishNormalize()` ile yazılan `*_norm` sütunları, aslında FTS5'in `unicode61 remove_diacritics 2` tokenizer'ının yapabileceği işin TR-specific genişlemesi. Pozitif: TR `ı/İ` problemini (locale-bağımlı Unicode case folding) çözer. Negatif: FTS5 sorgusu iki kez (orijinal + normalize) çalışıyor (`memory-query.ts:206-209`), maliyet ~%50-80 daha fazla. Veri katmanında çift saklama (4 norm sütunu) disk maliyetini ~%30 büyütür.

### 1.3 Relations Graph — Orphan ve ID-Format Drift'i (CRITICAL)

7. **63 orphan relation satırı (147 toplamdan, %43)** — relations graph'inin neredeyse yarısı bozuk:
   - **21 satır:** `memory-sprint-NNN → retro-sprint-NNN (depends_on)` — `from_id` orphan (gerçek memory ID `mem-sprint-NNN`, `memory-sprint-NNN` DEĞİL).
   - **21 satır:** `retro-sprint-NNN → sprint-log-sprint-NNN (references)` — `to_id` orphan (gerçek sprint ID `sprint-log-NNN`, `sprint-log-sprint-NNN` DEĞİL — fazladan `sprint-` prefix).
   - **21 satır:** `sprint-log-sprint-NNN → memory-sprint-NNN (depends_on)` — hem `from_id` hem `to_id` orphan (her iki tarafta yanlış prefix).
   
   Bu pattern, bir finalizer/backfill scriptinin (büyük ihtimalle Sprint 169 H1 — ADR-046 bi-directional hook veya `backfillSprintMemoriesFromSprintsDir`) **yanlış ID üreticisi** kullandığını gösterir. Pozisyonel `insertRelation(fromId, toId, relType)` overload'ı FK doğrulaması YAPMADIĞI için (`memory-store.ts:656-664`) bu 63 satır silently DB'ye girmiş.

8. **`MemoryStore.insertRelation` ikili overload tutarsızlığı:** Object form (MADR v3) FK doğrular ve `DECKENT_E068/E069` fırlatır; pozisyonel form bypass eder. Aynı sınıfta iki farklı bütünlük seviyesi — call site'a göre korunma. Mevcut graph bozukluğu pozisyonel form üzerinden geçmiş.

9. **Sprint 169 C1 sonrası `count > 0` doğrulandı:** Toplam relation 147 (104 references + 42 depends_on + 1 supersedes). Yine de %43 orphan oranı kritik bütünlük problemi.

### 1.4 Decay ve Decay_Exempt — Sağlam

10. **decay_exempt korunması sağlıklı:** 47 entry decay_exempt=1 (46 accepted ADR + 1 identity `project-identity`). Hiçbir `status='accepted'` ADR `decay_exempt=0` durumunda değil; ters yönde de drift yok. `MemoryStore.decay()` SQL'i (`memory-store.ts:740-745`) `decay_exempt = 0` filtresi uyguluyor — implementasyon doğru.

11. **decay history trail çalışıyor:** `entry_history.change_type` dağılımı: `update=1166, create=229, patch=3`. `decay` change_type kaydı henüz yok — ya decay hiç çalıştırılmamış ya da yakın zamanda çalıştırılmamış. Mevcut deleted_at NOT NULL entry sayısı **0** (soft-deleted hiçbir entry yok) — bu, decay'in gerçek bir cleanup yapmadığını teyit eder.

### 1.5 Entry_History — Eksik Create Kayıtları (HIGH)

12. **2 entry'nin hiç history kaydı yok:** `adr-047` (Manuel Subagent Dispatch Protocol) ve `adr-048` (Prompt Lifecycle Contract). `MemoryStore.insert()` her insert için zorunlu `'create'` history kaydı yazar (`memory-store.ts:350`). Bu iki ADR `created_at='2026-05-14T13:38:31.370Z'` / `'2026-05-14T13:40:37.902Z'` — Sprint 168 sonu. İki olası neden: ya `insert` dışı bir yol kullanılmış (raw SQL backfill), ya da uzun süre önce silinip `restore` ile geri getirilmiş. Audit-trail bozulması.

13. **History orphan yok:** `entry_history` satırlarının hepsi yaşayan bir `entry_id`'ye işaret ediyor (`SELECT COUNT(*) FROM entry_history WHERE entry_id NOT IN (SELECT id FROM entries)` = 0). Olumlu.

### 1.6 DB-vs-Export Drift (HIGH)

14. **`summary.md` stale — "Total entries: 230" yazıyor, gerçek 231.** `exportSummaryMd` footer'ı `store.totalCount()` kullanır (`memory-export.ts:103-104`). Demek ki export DB'nin bu sürümünden ÖNCE üretildi (en az 1 entry sonradan eklendi — büyük ihtimalle `pattern-sprint-171-stale_heartbeat`). Manuel rebuild gerekiyor.

15. **`memory.md` 38 sprint başlığı içeriyor; DB'de 40 `type='memory'` entry var.** 2 entry export'a yansımamış. Adaylar:
   - `user-1778591061896` (title "help") — `sprint_id=NULL, sprint_num=0` (test/junk entry, export filtresi atlamış olabilir ama `exportMemoryMd` sprint_id'yi `'unknown'` ile grupluyor — yine de görünmesi gerekirdi).
   - `mem-sprint-NNN` formatı + `mem-NNN` formatı karışık (örn. `mem-161` ile `mem-sprint-170`). Format tutarsızlığı header pattern'iyle uyuşmuyor olabilir.

16. **`debt.md` 101 satır, DB'de aktif 1 + resolved 100.** Export tablosu hem aktif hem çözümlenmiş tüm debt'i listeliyor (`exportDebtMd` her iki tabloyu da render eder, `memory-export.ts:206-228`). summary.md "Active Technical Debt" yalnız 1 entry gösteriyor — DB ile tutarlı.

17. **Sprint 161 stub kalmış.** `mem-161` entry'sinin content'i: `"Sprint 161 learnings — no .brain/sprints/sprint-161.md log was available at backfill time. Stub inserted by Sprint 166 Task 6 (Bug U+V)."` (toplam 136 karakter). Sprint 169 H2 bu stub'ı gerçek içerikle doldurmayı hedefliyordu — **fix uygulanmamış**. Hala stub.

18. **ADR-022-v2 docs/adr/ dosyası yok.** `docs/adr/` dizininde 53 dosya, DB'de 52 ADR. Eşleştirme: 51 ADR-FS file mevcut, 1 ADR (`adr-022-v2`) FS'de eksik, 1 fazlalık dosya FS'de (muhtemelen `005-synchronous-i-o.md` deprecated ama hem DB'de var hem FS'de). ADR-046 Amendment (Sprint 169 H1) DB→FS bi-directional hook'unun **idempotent garanti vermediği** ortaya çıkıyor — `exportAdrsToFs` `mtimeMs > dbUpdatedAt` ise skip eder (`memory-export.ts:341-344`). adr-022-v2 sprint_num=0 / updated_at çok eski olduğu için "FS mtime yeni" gözükmüş ve hiç yazılmamış olabilir.

### 1.7 Debt Bütünlüğü (CRITICAL)

19. **100/101 debt entry'sinde `sprint_id` NULL/blank/dash.** `SELECT COUNT(*) FROM entries WHERE type='debt' AND (sprint_id IS NULL OR sprint_id='' OR sprint_id='-')` = **100**. `backfillDebtSprintIds()` helper Sprint 166 Bug V için yazılmış (`memory-import.ts:307-352`) — ama **çalıştırılmamış veya rollback olmuş**. Bug V regresyonu.

20. **2 debt entry "double-prefix" id:** `debt-debt-138-002` ve `debt-debt-138-008`. `extractSprintFromDebtId` regex'i `^debt-(?:debt-)?(\d+)-\d+` ile double-prefix'i tolere eder (`memory-import.ts:182`), yine de bu kayıtların `sprint_id=NULL` — backfill helper'ı bu iki kayıtta sprint_id'yi parse etse de update SET çalışmamış (debt-manager kaynak sorunu). debt-manager.ts içindeki yazıcı id'yi yanlış oluşturuyor olabilir.

### 1.8 Pattern Type Anomalileri (MEDIUM)

21. **4 pattern entry'nin hepsi `sprint_num=0` ama title'da `sprint-168/169/170/171` var.** ID'ler: `pattern-sprint-168-stale_heartbeat`, `pattern-sprint-169-...`, vb. Title: `"Violation pattern: stale_heartbeat"`. Pattern yazıcı (büyük ihtimalle `src/monitor/`) `sprint_num` alanını set etmiyor — index `idx_entries_sprint_num` için anlamsız. Aynı title'ın 4 sprint'te tekrarı sistemik (her sprint'te aynı stale_heartbeat ihlali görünüyor — RC yakalanmamış, ADR-044 observability gap).

22. **`user-1778591061896` test/junk entry.** type=memory, title="help", sprint_id=NULL, sprint_num=0. Numeric ID 2026-04-12 civarı bir epoch'a denk geliyor; insan elinden gelmiş tek satırlık test verisi. Temizlenmeli.

### 1.9 Sprint Coverage Gap (HIGH)

23. **Memory entries için kapatılmamış sprint gap'ler:** sprint_num 0..170 arası 132 sprint'in memory entry'si yok. `mem-100..mem-160` arası neredeyse tamamen boş (sadece bir kaç sprint kapsanmış). Sprint 167 için memory yok (166 → 168 atlamış).

24. **`type='sprint'` (sprint log) entries: yalnız 9** (sprint-log-136..139, 165-166, 168-170). 167, 140-164 sprint log'ları DB'ye girmemiş. `sprint-log-168` title'ı `"Sprint sprint-168"` — çift prefix bug'ı yine var ama bu sefer title'da.

25. **Retro gap:** 152, 157-161, 167 retros yok. retro-latest sprint_num=0 — özel "şu anki" entry.

### 1.10 Idempotence ve Rebuild Safety

26. **`rebuildWithRelationSafety` sağlam tasarım** (`memory-import.ts:414-450`): pre-snapshot, transaction içinde restore, strict mode'da count<pre ise rollback. Sprint 169 C2 (Bug Z3) yamasının yapısal olarak doğru olduğu görülüyor. Yine de mevcut DB'de 63 orphan relation hayatta kalmış — yani `restoreRelations` orphan check'i FK doğrularken zaten yaşayan ama yanlış-prefix'li ID'ler hangisini "var" hangisini "yok" gördü? Açık değil. Olası senaryo: backup esnasında orphan'lar zaten var, restore onları olduğu gibi geri yazıyor (FK eksik ⇒ orphan check `existsStmt` yalnızca `entries.id` kontrol ediyor, `restoreRelations` da yine atlatabilir — `memory-import.ts:392-394` `fromExists || toExists` yoksa skip diyor, AMA orphan'lar zaten **insertRelation pozisyonel form** üzerinden girmiş olabilir).

27. **`extractAdrReferences` regex (`memory-store.ts:694`)** yalnızca `ADR-NNN` (3 hane) pattern'ini yakalar. `ADR-022-v2`, `ADR-22`, `ADR-1` (4 hane veya farklı varyant) yakalanmaz. Mevcut DB'de adr-022-v2 supersedes ilişkisi `parseDecisionsMd` üzerinden geldiği için var, ama in-content `ADR-022-v2` referansları otomatik ilişkilendirilmez — bilgi kaybı.

28. **`extractKeywords` filter `> 3 chars`** (`memory-import.ts:44`): "ADR", "RC", "TR", "EN", "MVP", "P0", "P1" gibi kritik kısaltmalar elenir. Tag arama recall'ı düşer.

### 1.11 Lifecycle ve Soft-Delete

29. **0 soft-deleted entry.** `deleted_at IS NOT NULL` sayısı sıfır. Demek ki softDelete/restore/decay yolları hiç çalıştırılmamış veya tüm soft-delete'ler manuel olarak hard-delete edilmiş. `idx_entries_active` partial index (`memory-store.ts:162-165`) `WHERE deleted_at IS NULL` üzerinde — bu kullanım kalıbında index neredeyse `idx_entries_decay`'in alt kümesi haline gelir, marjinal fayda.

### 1.12 Query Layer Güvenliği

30. **`escapeFts5Query` token-bazlı çift-tırnak (`memory-query.ts:41-69`)** FTS5 injection'a karşı korur (operatör tokenleri OR/AND/NOT'a izin verir, geri kalanı `"..."` ile sarar). Sağlam. Wildcard `*` desteği var. Tek risk: kullanıcı `"` karakteri girerse `text` parametresinin içine kaçırılır — FTS5 bu durumda parse error verir, `MemoryQueryError` fırlatır (`memory-query.ts:248`). Silent fail yok, OK.

31. **Yapısal filtreler hep named bind parameter (`@type_0`, `@source_0`...)** ile yapılır (`memory-query.ts:303-365`). SQL injection riski yok.

32. **`buildAutoQuery` tag filtresi taşkın** (`memory-query.ts:402-415`): `taskScope` doğrudan `tags_contain` parametresine veriliyor. Scope paths (`src/orchestra/...`) tag olarak DB'de yok ⇒ her sorgu sıfır sonuç ile döner. Bu, Brain'in auto-context'inin gerçekte hiç sonuç döndürmediği anlamına gelebilir. Tasarım hatası.

### 1.13 İçerik ve Sınırsal Vakalar

33. **Erken ADR'ler `sprint_num=0`** (12 ADR: 001-004, 006-012, 022-v2). Eski tarihsel ADR'ler için sprint bilgisi kayıp. Decay açısından sorun değil (zaten decay_exempt=1) ama tarihsel sorgular ve `idx_entries_sprint_num` kullanımı için cila eksik.

34. **`turkishNormalize` edge case:** Almanca `ß` (eszett) ele alınmıyor. `Spaß → spaß` (lower) → NFD ile `ß` decompose etmez (`ß` tek karakter), Turkish replace listesinde yok. Almanca metinler için `ß` orijinalde kalır — DB'de duplicate token sorunu. `.deckent/IDENTITY.md`'de "TR/EN/DE %100" iddiası tartışmaya açık.

35. **NFD sonrasında Turkish chars ekstra replace** (`memory-normalize.ts:30-37`): `ı, ş, ğ, ü, ö, ç` NFD'den geçmez, manuel replace. Doğru. Ancak `Â/â`, `Î/î`, `Û/û` (eski Türkçe & Fransızca/Türkçe ortak şapkalı sesli) NFD ile decompose olur (`a + ̂ → a`), test edilmemiş edge case ama büyük ihtimalle çalışır.

---

## 2. Severity

| # | Bulgu | Severity | Gerekçe |
|---|-------|---------|--------|
| 7 | 63 orphan relation (%43 graph bozulması, ID format drift) | **CRITICAL** | Brain auto-query graph traversal'ı sessizce hatalı sonuç döndürür; AEGIS/MADR audit-trail bozulması; OSS GA öncesi production veri bütünlüğü ihlali. |
| 19 | 100/101 debt entry'sinde sprint_id NULL | **CRITICAL** | Sprint 166 Bug V regresyonu; debt aggregation/retro/audit kanalları sprint bağlamı kaybeder; export/UI yanıltıcı. |
| 1 | `relations` tablosunda FK eksik | **CRITICAL** | Şema kontratı dokümante edildiği gibi DB-level değil; Bulgu 7'nin altyapı sebebi; pozisyonel `insertRelation` overload'ı sessizce orphan yazabilir. |
| 17 | Sprint 161 hala stub içerikte (Sprint 169 H2 uygulanmamış) | **HIGH** | Sprint history continuity bozuk; recall query'ler tutarsız döner. |
| 12 | 2 ADR (047, 048) entry_history kaydı yok | **HIGH** | Audit-trail eksik; create event'i bypass edilmiş — başka entry'ler de etkilenmiş olabilir, sistemik risk. |
| 18 | ADR-022-v2 docs/adr/ FS dosyası eksik | **HIGH** | ADR-046 Sprint 169 H1 bi-directional hook idempotent değil; superseder ADR public OSS doc'ta görünmez. |
| 2 | `entry_history` tablosunda FK eksik | **HIGH** | History orphan korunması yalnızca uygulama katmanında; entry silindiğinde history dangling. |
| 14 | summary.md "Total entries: 230" gerçek 231 (stale export) | **HIGH** | summary.md `@.brain/exports/summary.md` ile CLAUDE.md/DECKENT.md/brain.md/worker.md'a okutuluyor — yanlış bilgi tüm agent prompt'una yayılır. |
| 15 | memory.md 38 başlık, DB'de 40 memory entry (2 yansımamış) | **HIGH** | exportMemoryMd'nin tüm memory entry'leri kapsadığı varsayılır; 2 entry sessizce dışarıda kalmış. |
| 20 | 2 debt entry double-prefix id (debt-debt-138-NNN) | **MEDIUM** | Parser id'yi handle ediyor ama yazıcı (debt-manager) hatalı id üretmiş; backfill bu iki kaydı `sprint_id` ile güncellememiş. |
| 21 | 4 pattern entry sprint_num=0 (title sprint-NNN içerir) | **MEDIUM** | Index kullanımsız; pattern recurrence analizi sprint_num kırılımıyla yapılamaz. |
| 8 | insertRelation overload tutarsızlığı | **MEDIUM** | Aynı sınıfta iki farklı bütünlük seviyesi; mevcut orphan'ların kaynağı. |
| 23-25 | Memory/sprint/retro coverage gap | **MEDIUM** | Sprint öğrenimleri kaybı; recall/retro kalitesi düşük. |
| 27 | `extractAdrReferences` 3-hane regex (ADR-022-v2 vb. eksik) | **MEDIUM** | Otomatik relation çıkarımı tam değil; sonradan supersede edilmiş ADR'lere referanslar atlanır. |
| 3, 30-32 | Şema enum CHECK eksiği + buildAutoQuery scope-tag mismatch | **MEDIUM** | Type/status/priority/lang/source/rel_type için DB-level enum yok; auto-context scope path'leri tag aramaz. |
| 22 | user-1778591061896 test entry | **LOW** | Tek satır artık veri; istatistik gürültüsü. |
| 4-6 | FTS5 tokenizer çift normalizasyon disk/CPU maliyeti | **LOW** | Performans optimization; doğruluk değil. |
| 28 | extractKeywords `> 3` filtresi kısaltmaları eler | **LOW** | Tag-bazlı recall'ı az miktarda düşürür; arama text alanı yakaladığı için gizlenmiş. |
| 29 | 0 soft-deleted entry, decay change_type kaydı yok | **LOW** | Decay yolunun runtime'da hiç tetiklenmediği işareti; deprecated kod patenti riski. |
| 33 | Erken ADR sprint_num=0 | **LOW** | Tarihsel telemetri eksiği. |
| 34 | turkishNormalize Almanca ß edge case | **LOW** | Sınırlı kullanıcı tabanı; %100 iddiası tartışmaya açık ama OSS GA blocker değil. |

> **CRITICAL özet:** 3 bulgu (orphan relations, debt sprint_id NULL, relations FK eksik) Sprint 172 OSS GA öncesi mutlaka kapatılmalıdır.

---

## 3. Kanıt (Evidence)

### 3.1 Şema Bulguları

**Bulgu 1, 2 — FK eksikliği:**
```
$ node -e "PRAGMA foreign_key_list(relations)" → []
$ node -e "PRAGMA foreign_key_list(entry_history)" → []
$ node -e "PRAGMA foreign_key_list(tags)" → [{ table: 'entries', from: 'entry_id', on_delete: 'CASCADE' }]
```
Şema DDL'i: `src/core/memory-store.ts:129-135` (`relations` tablosu — sadece PK), `:137-146` (`entry_history` — FK yok), `:122-127` (`tags` — FK CASCADE — referans örneği).

**Bulgu 3 — Şema CHECK constraint yok:**
- `memory-store.ts:98-120` — entries tablosunda hiç CHECK YAZILMAMIŞ.
- `memory-types.ts:31-39` — EntryStatus enum tanımlı, DB'ye yansımamış.
- `memory-types.ts:42-48` — RelationType enum, DB CHECK yok.

**Bulgu 4-6 — FTS5 sütun/tokenizer:**
- `memory-store.ts:191-200` — virtual table tanımı, 8 sütun, tokenizer `unicode61 remove_diacritics 2`.
- `PRAGMA table_info(entries_fts)` çıktı sırası: `title, content, summary, tag_text, title_norm, content_norm, summary_norm, tag_norm`. Birebir.
- Çift normalizasyon: `memory-query.ts:206-209` `{title content summary tag_text}: (escaped) OR {title_norm ...}: (normalized)` — her sorgu iki MATCH expression çalıştırır.

### 3.2 Relations Orphan (Bulgu 7-9)

```sql
SELECT COUNT(*) FROM relations;                                            -- 147
SELECT COUNT(*) FROM relations WHERE from_id NOT IN (SELECT id FROM entries);  -- 44
SELECT COUNT(*) FROM relations WHERE to_id NOT IN (SELECT id FROM entries);    -- 44
SELECT COUNT(*) FROM relations
  WHERE from_id NOT IN (SELECT id FROM entries)
     OR to_id NOT IN (SELECT id FROM entries);                            -- 63 (union)
```

Orphan pattern grupları (SQL distinct):
```
memory-sprint-NNN  ->  retro-sprint-NNN     (depends_on)  ×21   from_id orphan
retro-sprint-NNN   ->  sprint-log-sprint-NNN (references) ×21   to_id orphan
sprint-log-sprint-NNN -> memory-sprint-NNN  (depends_on)  ×21   her ikisi orphan
```

Gerçek ID formatı kanıtı (DB'den örnek):
```
type='memory': id='mem-sprint-170'      (NOT 'memory-sprint-170')
type='retro' : id='retro-sprint-170'    (eşleşir)
type='sprint': id='sprint-log-170'      (NOT 'sprint-log-sprint-170')
```

Pozisyonel overload bypass: `memory-store.ts:626-664` — `insertRelation(fromId, toId, relType)` formu (line 656-660) FK doğrulamaz; object form (line 637-655) doğrular.

### 3.3 Decay (Bulgu 10-11)

```sql
SELECT type, status, COUNT(*) FROM entries WHERE decay_exempt=1 GROUP BY type, status;
-- adr/accepted = 46, identity/active = 1
SELECT COUNT(*) FROM entries WHERE type='adr' AND status='accepted' AND decay_exempt=0;  -- 0
SELECT COUNT(*) FROM entries WHERE deleted_at IS NOT NULL;                                -- 0
SELECT change_type, COUNT(*) FROM entry_history GROUP BY change_type;
-- update=1166, create=229, patch=3  (decay yok)
```
Decay SQL kanıtı: `memory-store.ts:740-745`.

### 3.4 Entry History Kayıp (Bulgu 12-13)

```sql
SELECT e.id, e.type, e.created_at FROM entries e
WHERE NOT EXISTS (SELECT 1 FROM entry_history h WHERE h.entry_id = e.id);
-- adr-048 | adr | 2026-05-14T13:38:31.370Z | Prompt Lifecycle Contract
-- adr-047 | adr | 2026-05-14T13:40:37.902Z | Manuel Subagent Dispatch Protocol
```
`MemoryStore.insert()` zorunlu create history: `memory-store.ts:350` — `insertHistory.run(input.id, '*', null, null, 'system', 'create')`.

### 3.5 Export Drift (Bulgu 14-18)

```bash
$ wc -l .brain/exports/{summary,decisions,memory,debt}.md
   93 .brain/exports/summary.md
 4226 .brain/exports/decisions.md
  343 .brain/exports/memory.md
  122 .brain/exports/debt.md
```

```bash
$ grep -c "Total entries:" .brain/exports/summary.md
# Total entries: 230 | Generated: 2026-05-15  ← stale (DB=231)
$ grep -c "^## Sprint " .brain/exports/memory.md   # 38
$ sqlite> SELECT COUNT(*) FROM entries WHERE type='memory';  # 40
$ grep -c "^| debt-" .brain/exports/debt.md   # 101
```

`exportSummaryMd` footer: `memory-export.ts:103-104` — `Total entries: ${store.totalCount()}`.

Sprint 161 stub kanıtı:
```sql
SELECT id, length(content), substr(content,1,200) FROM entries WHERE id='mem-161';
-- mem-161 | 136 | "Sprint 161 learnings — no .brain/sprints/sprint-161.md log was available at backfill time. Stub inserted by Sprint 166 Task 6 (Bug U+V)."
```

ADR FS sync:
```bash
$ ls docs/adr/ | wc -l           # 53
$ sqlite> SELECT COUNT(*) FROM entries WHERE type='adr';  # 52
# Tek mismatch: adr-022-v2 DB'de var, docs/adr/'da 022-v2-*.md yok
```
`exportAdrsToFs` skip kuralı: `memory-export.ts:341-344` — `fileMtime > dbUpdatedAt ⇒ skipped++`.

### 3.6 Debt Bütünlüğü (Bulgu 19-20)

```sql
SELECT status, COUNT(*) FROM entries WHERE type='debt' GROUP BY status;
-- active = 1, resolved = 100
SELECT COUNT(*) FROM entries
  WHERE type='debt' AND (sprint_id IS NULL OR sprint_id='' OR sprint_id='-');
-- 100
SELECT id, sprint_id FROM entries WHERE type='debt' AND id LIKE 'debt-debt-%';
-- debt-debt-138-002 | NULL
-- debt-debt-138-008 | NULL
```

Backfill helper'ı (henüz çalıştırılmamış izi taşıyor): `memory-import.ts:307-352` (`backfillDebtSprintIds`). Regex: `memory-import.ts:182`.

### 3.7 Pattern, User, Sprint Gap (Bulgu 21-25)

```sql
SELECT id, status, sprint_num, title FROM entries WHERE type='pattern';
-- pattern-sprint-168-stale_heartbeat | active | 0 | Violation pattern: stale_heartbeat
-- pattern-sprint-169-stale_heartbeat | active | 0 | Violation pattern: stale_heartbeat
-- pattern-sprint-170-stale_heartbeat | active | 0 | Violation pattern: stale_heartbeat
-- pattern-sprint-171-stale_heartbeat | active | 0 | Violation pattern: stale_heartbeat

SELECT id FROM entries WHERE type='memory' AND sprint_num=0;
-- user-1778591061896    (title="help", sprint_id=NULL)

SELECT DISTINCT sprint_id FROM entries WHERE type='sprint';
-- sprint-log-136..139, 165-166, 168-170  (140-164 + 167 yok)
```

### 3.8 Idempotence, Auto-Query, Regex (Bulgu 26-28)

`rebuildWithRelationSafety`: `memory-import.ts:414-450` (snapshot + strict rollback).
`restoreRelations` orphan skip: `memory-import.ts:392-401`.
`extractAdrReferences` regex: `memory-store.ts:694` — `/\bADR-(\d{3})\b/g` (sadece 3 hane, suffix `-v2` desteklenmez).
`extractKeywords` minimum char filtresi: `memory-import.ts:44` — `.filter((w) => w.length > 3)`.

### 3.9 Query Layer Güvenliği (Bulgu 30-32)

`escapeFts5Query`: `memory-query.ts:41-69`.
Bind parameter kullanımı: `memory-query.ts:303-365` (`buildFilterClauses`).
`buildAutoQuery` tag-scope mismatch: `memory-query.ts:402-415` — `tags_contain: taskScope.length > 0 ? taskScope : undefined`. Scope `src/orchestra/...` formatında, tag'ler ise `typescript`, `2026`, `sprint`, vb. formatında — kesişim sıfır.

### 3.10 Normalize Edge Case (Bulgu 34-35)

`turkishNormalize`: `memory-normalize.ts:14-38`. Almanca `ß` handle edilmiyor:
```js
turkishNormalize('Spaß') => 'spaß'  (yine ß, NFD decompose etmez)
turkishNormalize('Größe') => 'größe' → 'große'  (Ö yakalanır, ß yine kalır)
```

---

## 4. Öneriler (Recommendations)

### 4.1 OSS GA Öncesi Mutlaka (P0 — Sprint 172 blocker)

1. **Orphan relations temizliği + ID format unification (Bulgu 7, 8):**
   - **Düzelt:** Tek seferlik migration: orphan satırların doğru ID formatını çıkar (`memory-sprint-NNN → mem-sprint-NNN`, `sprint-log-sprint-NNN → sprint-log-NNN`) ve `INSERT OR IGNORE` ile düzeltilmiş satırları yaz, sonra orphan'ları sil. Sprint 169 H1 finalizer kodunda (büyük ihtimalle `src/orchestra/sprint-reporter.ts` veya `src/orchestra/decision-steps/`) ID üretimini düzelt — gelecekte tekrar etmesin.
   - **Sil:** Pozisyonel `insertRelation(fromId, toId, relType)` overload'ını kaldır (BREAKING — call site sayısı küçükse). Tüm call site'ları `MemoryRelation` object form'a geçir; böylece FK doğrulaması her yerde uygulanır.
   - **Tamamla:** `relations` tablosuna FK ekleyen migration yaz:
     ```sql
     CREATE TABLE relations_new (
       from_id TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
       to_id   TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
       rel_type TEXT NOT NULL CHECK (rel_type IN
         ('references','supersedes','caused_by','resolves','blocks','depends_on')),
       created_at TEXT NOT NULL DEFAULT (datetime('now')),
       PRIMARY KEY (from_id, to_id, rel_type)
     );
     INSERT INTO relations_new SELECT * FROM relations
       WHERE from_id IN (SELECT id FROM entries)
         AND to_id   IN (SELECT id FROM entries);
     DROP TABLE relations;
     ALTER TABLE relations_new RENAME TO relations;
     ```
     `schema_version=2` ile kayıt et, `idx_relations_to` yeniden oluştur.

2. **Debt sprint_id backfill ÇALIŞTIR (Bulgu 19, 20):**
   - **Düzelt:** `backfillDebtSprintIds(store)` (`memory-import.ts:307`) Sprint 172 öncesi tek seferlik script olarak çalıştır. 100 entry için sprint bilgisi geri gelir.
   - **Tamamla:** debt-manager.ts içindeki id üreticisi `debt-NNN-MMM` formatını garanti etsin; "double-prefix" durumu doğrudan kaynakta engellensin (test ekle).
   - **Düzelt:** İki double-prefix id (`debt-debt-138-002`, `debt-debt-138-008`) ya yeniden adlandırılsın (`debt-138-002-alt` gibi) ya da silinsin (eğer duplicate ise).

3. **relations + entry_history FK ekle (Bulgu 1, 2, 3):**
   - Migration ile `entry_history(entry_id)` üzerinde `REFERENCES entries(id) ON DELETE CASCADE` ekle.
   - `entries.status`, `entries.priority`, `entries.source`, `entries.lang` için CHECK constraint ekle. `relations.rel_type` için de.
   - schema_version=2 kayıt et; `MemoryStore.initSchema` migration path'i içersin (yalnızca tek seferlik bootstrap idempotent).

4. **summary.md export rebuild + bi-directional ADR sync onarımı (Bulgu 14, 18):**
   - **Tamamla:** `deckent memory export` komutunu Sprint 171 retro adımında zorunlu çalıştır (sprint-controller.ts).
   - **Düzelt:** `exportAdrsToFs` skip mantığı `mtime > dbUpdatedAt` yanıltıcı — DB updated_at SQLite "datetime('now')" string'i, FS mtime ms precision. ADR-022-v2 vakası gibi sprint_num=0 + eski updated_at olan ADR'lerin hiç yazılmaması bug. Skip eşiğine `dryRun || mtime > dbUpdatedAt + GRACE_MS` ekle veya `dbUpdatedAt=0` durumunda her zaman yaz. ADR-046 Amendment kontrat eksik.

### 4.2 Yüksek Öncelik (P1 — Sprint 172 GA sonrası ilk sprint)

5. **Sprint 161 stub'ı doldur (Bulgu 17):** Sprint 169 H2 fix'inin neden uygulanmadığını araştır (commit log) ve gerçek içeriği `mem-161` entry'sine yaz. Eğer gerçek log bulunamazsa, stub yerine `decay_exempt=0` + soft-delete uygulanabilir (silinmiş olduğu açıkça görünür).

6. **2 ADR'nin history'sini geri yaz (Bulgu 12):** adr-047 ve adr-048 için manuel olarak `'create'` history kaydı eklensin (changed_by='post-hoc-backfill'). Sistemik nedenin RC analizi: `MemoryStore.insert()` dışı bir yol kullanıldıysa o yol tespit edilip kapatılsın.

7. **memory.md export gap kapansın (Bulgu 15):** `exportMemoryMd` (`memory-export.ts:159-190`) `sprint_id` IS NULL durumunda "unknown" grubuna alır ama tam test edilmemiş — user-1778591061896 gibi entry'ler için path doğrulansın. Test ekle.

8. **Sprint coverage gap kapansın (Bulgu 23-25):**
   - `backfillSprintMemoriesFromSprintsDir` (`memory-import.ts:468`) eksik sprint numaraları için tek seferlik çalıştır.
   - `.brain/sprints/sprint-NNN.md` log'larının var olmadığı sprint'ler için (140-164, 167) ya orijinal kaynak bulunsun ya da `_no log available_` placeholder ile entry açılsın (`decay_exempt=0`, ileride silinebilsin).

### 4.3 Orta Öncelik (P2 — Sprint 173+)

9. **`insertRelation` API birleştir (Bulgu 8):** Object form'u single canonical hale getir, pozisyonel form'u Deprecation warning ile bir sprint sonra kaldır.

10. **Pattern entry sprint_num doldurma (Bulgu 21):** `src/monitor/` içindeki pattern yazıcısı, current sprint_num'ı set etsin. Mevcut 4 entry için tek seferlik backfill.

11. **Test/junk entry temizliği (Bulgu 22):** `user-1778591061896` ya silinsin (hard) ya da `status='archived'` ile işaretlensin.

12. **`extractAdrReferences` regex'i `-v2`, `-v3` suffix destekleyecek şekilde genişlet (Bulgu 27):**
    ```ts
    /\bADR-(\d{1,4})(-v\d+)?\b/gi  // 1-4 hane + opsiyonel versiyon suffix
    ```
    Backfill: tüm entry content'lerini tekrar tara ve eksik `references` ilişkilerini ekle.

13. **`buildAutoQuery` scope→tag mapping (Bulgu 32):** Scope path'lerinden tag çıkarmak için ayrı bir helper (`extractScopeTags(['src/orchestra/...']) → ['orchestra', 'sprint', 'controller']`). Mevcut hali scope path'i ham tag olarak veriyor — sonuç hep boş.

### 4.4 Düşük Öncelik (P3 — biriktirilebilir)

14. **`extractKeywords` minimum char eşiği parametrize (Bulgu 28):** Default 3, ama kısaltma white-list (ADR, RC, TR, EN, MVP, P0..P3) destekle.

15. **`turkishNormalize` ß handle (Bulgu 34):** `.replace(/ß/g, 'ss')` ekle. Almanca DE %100 iddiası için zorunlu.

16. **FTS5 maliyeti analizi (Bulgu 6):** Eğer kullanıcı tabanı Avrupa'ya genişlerse (TR-only varsayımı kalkar) tokenizer maliyeti ölçülsün; gerekiyorsa `*_norm` sütunlarını opsiyonel hale getir.

17. **Decay change_type rapor sayfası (Bulgu 11, 29):** Hiç decay çalıştırılmamış olabilir — `deckent memory stats` çıktısına "last decay run" satırı ekle.

### 4.5 Genel Tasarım Önerisi

18. **DB migration framework:** `schema_version` tablosu mevcut ama gerçek migration motoru yok (yalnızca tek sürüm). Sprint 172 sonrası daha fazla şema değişikliği geleceğinden basit bir up-only migration runner (`src/core/memory-migrations/NNN-description.ts`) kurulsun. Idempotent — applied versions kontrol edilsin.

19. **`MemoryStore` "raw escape hatch" kullanımı sıkılaştırılsın:** `backfillDebtSprintIds` `(store as unknown as { db }).db` ile özel db handle'ına erişiyor (`memory-import.ts:315`). Sprint 169 C2 sonrası `getRawDb()` public method var (`memory-store.ts:801-803`) — backfill bu yolu kullansın, `as unknown as` kalkacaksa kalksın.

20. **Read-only bağlantı API'si:** Audit-amaçlı kod (örnek: bu denetim) için `MemoryStore` opsiyonel `readonly: true` parametresi alsın; runtime yazma denemelerinde tip-seviyesinde hata fırlatsın. AEGIS prensibinin "audit safety" boyutu.

---

> **OSS GA Hazırlık Verdict (öneri, Brain'in nihai kararına bağlı):**
> - **CRITICAL bulgular (3 adet)** Sprint 172 OSS public flip öncesi mutlaka kapatılmalı. Aksi halde public dataset (`memory.db` örnekleri) %43 bozuk relations graph + 100 sprint_id NULL debt ile dolaşıma çıkar — community trust impact.
> - **HIGH bulgular (5 adet)** Sprint 172 ilk hafta ile kapatılabilir.
> - **MEDIUM/LOW bulgular** roadmap'e eklenebilir; OSS GA blocker değil.
> - **Pozitif teyit:** decay/decay_exempt logic, FTS5 trigger sync, tags FK, query layer SQL injection korumaları, supersedes ilişkisi, total entry count tutarlılığı (entries vs entries_fts), schema_version başlangıç — bu altı alanda yapısal kusur tespit edilmedi.

— *Sprint 171 Task 022 — Memory V2 DB Integrity Audit raporu sonu.*
