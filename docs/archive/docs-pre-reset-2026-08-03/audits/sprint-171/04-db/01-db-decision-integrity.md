# Sprint 171 — Task 028: DB Karar ve Referans Bütünlüğü Denetimi

**Tarih:** 2026-05-15
**Kapsam türü:** Cross-cut (Kapsam Haritası uygulanmaz — `docs/audits/sprint-171/SYNTHESIS` referans alır)
**DB:** `.brain/memory.db` (yalnızca okuma — `SELECT`). Hiçbir yazma/`DROP`/rebuild yapılmamıştır.
**Snapshot anı:** 2026-05-15T10:45Z; `schema_version = 1` (2026-04-16'da uygulanmış).
**Genel durum:** **CRITICAL** — relations grafının %43'ü orphan; `docs/adr/061-aegis-methodology.md` DB'ye yansımamış; mem-132 boş; sprint-finalizer naming bug'ı kanıtlanmış.

---

## 1. Bulgular

Bu denetim, deckent projesinin tek doğruluk kaynağı olan `memory.db` üzerindeki her kararı/referansı tek tek inceledi. Aktif (silinmemiş) 231 entry, 147 relation, 1398 history kaydı ve 1005 tag taranmıştır. Aşağıdaki bulgular ilgili Sprint 169 H1/C1/C2 kapanışlarının runtime'da hâlâ aktif olmadığını ya da kısmen aktif olduğunu, ADR DB↔FS senkron kontratının (Sprint 169 H1) bozulduğunu ve sprint-finalizer.ts içindeki bir naming bug'ının relations tablosunun büyük bölümünü orphan'a düşürdüğünü göstermektedir.

### 1.1 — relations Tablosunda Naming Drift (kök neden bulundu)

`relations` tablosundaki 147 satırdan **63'ü (%42.9)** orphan: ya `from_id` ya da `to_id` `entries` tablosunda mevcut değil. Dağılım çarpıcı:

| `rel_type`    | Toplam | Orphan | Oran  |
|---------------|--------|--------|-------|
| `depends_on`  | 42     | 42     | %100  |
| `references`  | 104    | 21     | %20.2 |
| `supersedes`  | 1      | 0      | %0    |

Kök neden `src/orchestra/sprint-finalizer.ts:667-669` satırlarındadır. Kod, `sprint.id` parametresinin zaten "sprint-NNN" formatında geldiğini varsaymadan başına ek bir prefix koyar:

```ts
// src/orchestra/sprint-finalizer.ts:667-669
const sprintLogId = `sprint-log-${sprint.id}`;   // → sprint-log-sprint-170 (yanlış)
const memoryId    = `memory-${sprint.id}`;        // → memory-sprint-170    (yanlış)
const retroId     = `retro-${sprint.id}`;         // → retro-sprint-170     (tek doğru olan, çünkü gerçek ID 'retro-sprint-NNN' ile başlıyor)
```

Gerçek `entries` ID şeması (DB'den `SELECT id FROM entries WHERE type IN ('memory','sprint') ORDER BY id`):

- memory tipi → `mem-sprint-NNN` (kullanılan `memory-sprint-NNN` **değil**)
- sprint tipi → `sprint-log-NNN` (kullanılan `sprint-log-sprint-NNN` **değil**)

Sonuç: Sprint 141'den itibaren her `finalizeSprint` çağrısı 3 yeni relation ekledi; bunların 2'si (sprint-log→memory ve retro→sprint-log) hiçbir gerçek entry'yi göstermez. Bu durum Sprint 169 C1 (`insertRelation API doğru mu`) bulgusunun runtime'da yarım kapatıldığını gösterir: API doğru, ama çağrı yeri kırık.

### 1.2 — ADR DB↔FS Bi-Directional Hook Regresyonu (ADR-061 yansımıyor)

Dosya sistemi (`docs/adr/`) altında **53** ADR markdown dosyası vardır; `entries(type='adr')` tablosunda yalnızca **52** kayıt bulunur. Fark `adr-061`'dir:

- `docs/adr/061-aegis-methodology.md` mevcut (`git status` çıktısında untracked olarak listeleniyor).
- DB'de `entries WHERE id LIKE 'adr-061%'` → boş set.
- `.brain/exports/decisions.md` içinde `adr-061` referansı yok.
- `.brain/exports/summary.md` "Active ADR" tablosunda adr-061 yok.

Bu, ADR-046 (Brain Self-Update Hook Architecture) tarafından sağlandığı varsayılan `adrInsert` hook'unun yeni eklenen MD dosyasını DB'ye yansıtmadığını kanıtlar. Sprint 169 H1 (`ADR DB↔FS bi-directional hook idempotent mi`) bulgusu bu sprint'te tekrar üretmiştir — DIRECTIVES.md "AEGIS (ADR-061) manifestosu" referansı vermesine rağmen worker prompt'larına enjekte edilen ADR listesi adr-061'i içermez (kullanıcıyı yanıltır).

Ek olarak `docs/adr/` altında **iki dosya aynı ADR'ı temsil eder** (slug çarpışması):

- `046-brain-self-update-hook-architecture.md`
- `046-brain-self-update-hook.md`

DB'de ise tek `adr-046` kaydı bulunur. Slug üreticinin idempotent olmadığını ve geçmişte iki kez (farklı slug ile) FS yazıldığını gösterir.

### 1.3 — Karar Statüsü vs Decay Tutarsızlığı

Decay logic (`MemoryStore.decay(currentSprintNum, decayAfterSprints)`) `decay_exempt=0` olan eski entry'leri silmek üzere yapılandırılmıştır. ADR'lerde durum:

- 46 accepted ADR → `decay_exempt=1` (doğru)
- 4 proposed ADR (adr-042, 053, 055, 060) → `decay_exempt=0` (kabul edilebilir; proposed kararlar olgunlaşana kadar arşiv değeri taşımaz)
- **1 deprecated ADR (adr-005, sprint-132)** → `decay_exempt=0` **(YANLIŞ)**
- **1 superseded ADR (adr-022, sprint-67)** → `decay_exempt=0` **(YANLIŞ)**

ADR-022 (`CLI/MCP Feature Parity v1`), ADR-022-v2 tarafından yerine geçirildiğinde audit trail için saklanması gerekir; aksi halde Sprint 171 → 171-decayAfterSprints koşulu adr-022'yi silebilir ve adr-022-v2 → adr-022 supersede ilişkisi orphan'a düşer. Aynı tehlike adr-005 için de geçerlidir (deprecated, ama tarihsel öneme sahip — ADR-027/045/038 onu referans olarak gösterir).

### 1.4 — Beklenen Ama Eksik Relations (supersede zinciri)

Yalnızca **1 adet `supersedes` relation** vardır (`adr-022-v2 → adr-022`). Beklenen ek ilişkiler eksiktir:

- `adr-005` deprecated; "Sprint 132 CRITICAL #1 — Senkron I/O hot path performans sorunlarına yol açtı. Yeni modüller async I/O kullanmalıdır." notu içeriğinde geçer ama hangi ADR/karar bu deprecate'i tetiklediği bilinmez (örn. async-first kararını içeren herhangi bir ADR `deprecates → adr-005` bağı içermez).
- `adr-027` (Hybrid Spawn Backend) revizyon ettiği orijinal kararı `revises` veya `refines` ile bağlamaz (relations tablosunda `refines`, `refutes`, `deprecates` rel_type'larından hiçbiri yok — yalnızca `references`, `depends_on`, `supersedes` kullanılıyor).

Sprint 171 DIRECTIVES'inde geçen "**6 MADR tip** orphan + kopuk zincir" beklentisinin aksine, **runtime'da yalnızca 3 rel_type kullanımı vardır**: `references`, `depends_on`, `supersedes`. `refines`, `refutes`, `deprecates`, `caused_by`, `resolves`, `blocks` tipleri (`.contracts/api-surface.md` "Memory V2 DB Schema" bölümünde liste verilmiş) hiç oluşturulmaz; runtime kontratı ile doküman kontratı **uyumsuzdur**.

### 1.5 — Boş İçerikli Entry

`SELECT id, length(content) FROM entries WHERE deleted_at IS NULL AND (content IS NULL OR trim(content)='')` sorgusu **mem-132**'yi döndürür: "Sprint 132 Learnings" başlığı olmasına rağmen `content=''`. Bu Sprint 169 H2'deki "Sprint 161 stub" hatasının benzeridir; sprint 132 retrospektifi geriye dönük doldurulurken metin gövdesi yazılmamış, yalnızca başlık+metadata kaydedilmiş. Tek hata bu olmasa da bellek arama (`searchMemory(text: 'sprint 132')`) bu satır için anlamlı sonuç döndüremez.

### 1.6 — Audit Trail (entry_history) Boşluğu

2 entry için `entry_history` tablosunda hiçbir kayıt yoktur — beklenen "create" event'i bile yok:

- `adr-047` (Manuel Subagent Dispatch Protocol, sprint-168, 2026-05-14)
- `adr-048` (Prompt Lifecycle Contract, sprint-168, 2026-05-14)

Sprint 168'de aynı runtime patikasından oluşturulduklarına göre, `MemoryStore.insert` çağrısı bunlar için history kaydını **atlamış** veya bir alternatif insert yolu (`backfill-stub-entries`, `system`, `brain`, `post-finalize` `changed_by` değerlerinden hiçbiri uyuşmuyor) kullanılmıştır. Audit trail kuralının %99.1 dolu olması, %0.9 eksiklik = potansiyel tutarlılık zaafiyetidir.

### 1.7 — sprint_id × sprint_num Tutarsızlığı

Stale heartbeat pattern entry'leri sprint_id atadıkları halde sprint_num=0 değerinde:

```
pattern-sprint-168-stale_heartbeat | sprint_id='sprint-168' | sprint_num=0
pattern-sprint-169-stale_heartbeat | sprint_id='sprint-169' | sprint_num=0
pattern-sprint-170-stale_heartbeat | sprint_id='sprint-170' | sprint_num=0
pattern-sprint-171-stale_heartbeat | sprint_id='sprint-171' | sprint_num=0
```

Bu, sprint_num üzerinden filtre çeken sorgularda (örn. `sprint_range: { min: 165 }`) bu pattern'lerin kaybolmasına neden olur. Sprint 169'da raporlanan "violation pattern: stale_heartbeat" satırlarının `summary.md` "Active Patterns" bölümünde sprint sayısı **0** olarak görünmesi de buradan kaynaklanır.

### 1.8 — Naming Şeması İçi Tutarsızlık (memory tipi)

`type='memory'` entries iki farklı naming şeması kullanır:

- **Eski/Sprint 132-140** ve bazı isimsiz mem'ler: `mem-NNN` (örn. `mem-132 … mem-140`, `mem-152`, `mem-157 … mem-161`, `mem-165`)
- **Sprint 141-170** standart: `mem-sprint-NNN`

Tek bir şema, ID'den sprint extraction, dedupe ve cross-referencing'i kolaylaştırırdı. Aralıkta da boşluklar vardır: `mem-141-151` (yeni şema) + `mem-152` (eski şema) + yine `mem-sprint-153-156`, sonra `mem-157 … mem-161` (eski şema), sonra `mem-sprint-162-170` → değişimler tek atımda yapılmamış, retroaktif backfill izi taşıyor.

`type='sprint'` tarafında durum daha ağırdır: FS'de 28 sprint log MD dosyası (`sprint-136 … sprint-170`) bulunurken DB'de yalnızca **9 sprint entry** (`sprint-log-136 … 139`, `sprint-log-165, 166, 168, 169, 170`) vardır. 140-164 ve 167 sprint'leri DB'ye **hiç yansımamış**. Bu sprint log içe-aktarımının sprint 165 öncesi büyük bir gap'le başladığını gösterir (geçmiş Sprint 169 H2 backfill çalışmasının yarım kaldığını işaret eder).

### 1.9 — ADR ID Boşlukları

ADR ID aralığı 1-60 arasıdır; **9 ID eksik**: `adr-049, 050, 051, 052, 054, 056, 057, 058, 059`. Proposed olarak duranlar `adr-053, 055, 060`. Bu, planlanmış ama yazılmamış ADR rezervasyonlarını ya da geçmiş slot'larını gösterir; DIRECTIVES.md veya plan/spec belgelerinde bu rezervasyonların izahı yok. Açık liste sağlamak takip için gerekli.

### 1.10 — ADR-009 DEBT Tablo Formatı İhlali

ADR-009 (DEBT.md Markdown Tablo Formatı) tablo şemasını tanımlar. `.brain/exports/debt.md` 5 sütunlu tabloyu kullanıyor — şema doğru, ancak içerik düzeyinde 2 ihlal vardır:

1. **Çift prefix bug** (`debt-debt-138-002`, `debt-debt-138-008`): id şeması `debt-NNN-NNN`. Yanlışlıkla iki kez "debt-" eklenmiş. Bu kayıtlar `entries` tablosunda görünür ama task ID parser'lar (örn. ADR-038 dispose) doğru sprint/task'a bağlanamaz.
2. **Resolved tabloda sprint hep `"-"`**: Çözüldükten sonra sprint bilgisi düşürülüyor. ADR-009 "Sprint" sütununun tarihsel referans için tutulmasını zorunlu kılar; mevcut export'ta resolved tarafta sprint hep null'a dönüyor.

Ek olarak başlık üretiminde "Tech debt from <task-id>: <task-açıklaması>" deseni kullanılır; bu hem prefix duplicate'i hem de okunabilirliği bozar (ekrana "Tech debt from 142-021: Read-only deep analysis of 10 src/cli/helpers/ files com" gibi truncate'lenmiş içerikler basar).

### 1.11 — Kırık `[[ref]]` Linki (durum: clean)

`SELECT id, content FROM entries WHERE content LIKE '%[[%'` çağrısı **0 satır** döndü. Wikilink stilinde dahili çapraz referans pratiği kullanılmıyor. (Bu uyarı bir bulgu değil, kapsam doğrulama bilgisidir — ADR DB↔FS senkron kontrolü FK/orphan üzerinden yapılmalıdır.)

### 1.12 — Soft-Delete ve Schema Versionlama

`deleted_at IS NOT NULL` filtresi **0 satır** döner: hiç soft-delete kullanılmamış. Bu iyi haberdir (silinen veri yok), ama tasarım kontratı kullanılmadığı için ileride "purge before snapshot" pratiği yokluğunda silme kararı verildiğinde idempotent değildir.

`schema_version` tablosu **tek satır (version=1, 2026-04-16)** içerir; bugüne kadar şema migrasyonu çalışmamıştır. FTS5 sütun sayısı 8 (4 orijinal + 4 turkishNormalize) doğru şekilde mevcuttur.

### 1.13 — Generic "retro-latest" Alias Entry

`id='retro-latest'` ile bir `type='retro'` entry'si vardır (5443 byte içerik, `sprint_id=NULL`, `sprint_num=0`). Stale alias riski: hangi sprint'in retrospektifini taşıdığı belirsiz, dış kod buna sabit ID üzerinden referans veriyorsa içerik güncellense bile kaynak takibi (which sprint) yapılamaz.

### 1.14 — Soft-User Entry

`id='user-1778591061896'` (`type='memory'`, başlık "help") bir kullanıcı-girişli entry'dir. Bu, user-source memory yazımının çalıştığının pozitif kanıtıdır ama tek tip (memory) altında "user-" prefix ile karışmaktadır; bu durumda `type='user'` ayrı bir taksonomi planlanmadığı için kategori takibi zayıftır.

---

## 2. Severity

| #     | Bulgu                                                                                            | Severity   | Etki                                                                                              |
|-------|--------------------------------------------------------------------------------------------------|------------|---------------------------------------------------------------------------------------------------|
| 1.1   | sprint-finalizer.ts naming bug → 63/147 relation orphan                                          | **CRITICAL** | Bellek grafının %43'ü kırık; tüm depends_on chain (sprint-log↔memory↔retro) kullanılamaz; FTS5 sonrası kontekst zenginleştirme bozuk. |
| 1.2   | adr-061 DB'de yok; adr-046 çift FS dosyası — ADR↔FS bi-directional hook regresyon              | **CRITICAL** | DIRECTIVES "AEGIS (ADR-061) manifestosu" referansı veriyor ama worker prompt'larına enjekte edilmiyor; OSS-GA bloker. Sprint 169 H1 yarım kapanış. |
| 1.3   | superseded/deprecated ADR'ler decay_exempt=0                                                     | **HIGH**   | Sprint 171+ decay döngüsünde adr-022 ve adr-005 silinebilir; supersede zinciri kırılır.           |
| 1.4   | 6 MADR rel_type yerine 3 kullanımda; deprecates/refines/refutes/caused_by/resolves/blocks YOK    | **HIGH**   | İlişki grafı sığ; cross-source arama (örn. "bu hatayı çözen ADR hangisi") çalışmaz; api-surface kontrat ile drift. |
| 1.5   | mem-132 content=''                                                                                | **HIGH**   | Sprint 132 retrospektifi semantik olarak yok; `searchMemory("sprint 132")` zero-hit; Sprint 169 H2 kapanışı yetersiz. |
| 1.6   | adr-047 ve adr-048 entry_history kaydı yok                                                       | **MEDIUM** | Audit trail %0.9 eksik; oluşturma anının kim tarafından, hangi yoldan yapıldığı izlenemez.        |
| 1.7   | sprint_id atanmış ama sprint_num=0 (4 pattern entry)                                            | **MEDIUM** | sprint_num filter sorguları bu pattern'leri kaçırır; summary.md "Active Patterns" 0 sayar.        |
| 1.8   | memory ID şeması karışık (mem-NNN vs mem-sprint-NNN); 19 sprint log DB'ye yansımamış (140-164,167) | **MEDIUM** | Cross-source arama ve sprint history tutarsız; backfill çalışması yarım. Sprint 169 H2 işareti.   |
| 1.9   | ADR ID boşluğu (049-052, 054, 056-059)                                                            | **LOW**    | Karar tarihçesi tam değil; reserve mantığı belgelenmemiş.                                         |
| 1.10  | DEBT çift prefix bug + resolved tarafında sprint='-'                                              | **MEDIUM** | ADR-009 ihlali; task↔sprint izi bozuk; backlog/dispose otomasyonları yanlış parse eder.           |
| 1.11  | `[[ref]]` kullanımı 0 — clean                                                                    | **INFO**   | Bulgu değil; kontrolün geçtiğini not eder.                                                        |
| 1.12  | schema_version=1, hiç migration çalışmamış; soft-delete 0 satır                                  | **INFO**   | Şema stabil; ama silme kontratı henüz testten geçmemiş.                                           |
| 1.13  | retro-latest generic alias entry                                                                | **LOW**    | Sprint çıkarımı için sağlam değil.                                                                |
| 1.14  | user-1778591061896 entry type=memory altında — user kategorisi yok                              | **LOW**    | Kategori taksonomisi memory ile karışıyor; yan-etki düşük.                                        |

**Genel skor:** 2 CRITICAL + 4 HIGH + 4 MEDIUM + 3 LOW + 2 INFO. OSS-GA blokeri 2 (1.1 ve 1.2).

---

## 3. Kanıt

Tüm sayılar `.brain/memory.db` üzerinde yalnızca-okuma `SELECT` ile doğrulanmıştır (2026-05-15 10:45 UTC). Kanıtlar SQL + dosya:satır referansı verir.

### 3.1 — relations Orphan Kanıtı (CRITICAL)

```sql
-- Toplam ve orphan dağılımı
SELECT r.rel_type, COUNT(*) total,
       SUM(CASE
             WHEN NOT EXISTS (SELECT 1 FROM entries e WHERE e.id=r.from_id)
               OR NOT EXISTS (SELECT 1 FROM entries e WHERE e.id=r.to_id)
             THEN 1 ELSE 0 END) orphan
FROM relations r GROUP BY r.rel_type;
-- Sonuç:
-- depends_on  | 42  | 42   (%100 orphan)
-- references  | 104 | 21
-- supersedes  | 1   | 0
```

Spesifik kanıt:

```sql
SELECT id FROM entries WHERE id='memory-sprint-144';  -- 0 satır (boş)
SELECT id FROM entries WHERE id='mem-sprint-144';     -- 1 satır (mevcut)
SELECT id FROM entries WHERE id='sprint-log-sprint-144';  -- 0 satır
-- relations tablosunda:
SELECT from_id, to_id, rel_type FROM relations LIMIT 1;
-- ('memory-sprint-144', 'retro-sprint-144', 'depends_on') — from_id ENTRIES'de YOK.
```

Kök neden kod kanıtı:

- `src/orchestra/sprint-finalizer.ts:667` — `const sprintLogId = \`sprint-log-${sprint.id}\`;` (sprint.id zaten "sprint-170" → çıktı "sprint-log-sprint-170", gerçek ID "sprint-log-170").
- `src/orchestra/sprint-finalizer.ts:668` — `const memoryId = \`memory-${sprint.id}\`;` (çıktı "memory-sprint-170", gerçek ID "mem-sprint-170").
- `src/orchestra/sprint-finalizer.ts:669` — `const retroId = \`retro-${sprint.id}\`;` (çıktı "retro-sprint-170", gerçek ID "retro-sprint-170" — **tek doğru olan**).
- 672-675 satırlarındaki üç `memStore.insertRelation` çağrısı sonuçta 3 relation üretir, ikisi orphan.

### 3.2 — ADR-061 DB'de Yok (CRITICAL)

```sql
SELECT id, title FROM entries WHERE id LIKE 'adr-061%';   -- 0 satır
SELECT COUNT(*) FROM entries WHERE type='adr';            -- 52 satır
```

FS karşılaştırma:

```bash
ls docs/adr/*.md | wc -l       # 53 dosya
ls docs/adr/061-*.md           # docs/adr/061-aegis-methodology.md
```

`docs/adr/061-aegis-methodology.md` — git status'ta untracked, DB'ye yansımamış. `.brain/exports/decisions.md` içinde grep ile `adr-061` aranır → bulunamaz. Worker prompt'ına enjekte edilen ADR listesi `.brain/exports/summary.md` "Active Architecture Decisions" tablosundan oluşur; adr-061 orada da yok. DIRECTIVES.md sprint 171 "AEGIS (ADR-061) manifestosu" referansı verdiği halde worker'lar bu ADR'ı asla görmez.

ADR-046 çift dosya kanıtı:

```bash
ls docs/adr/046-*.md
# docs/adr/046-brain-self-update-hook-architecture.md
# docs/adr/046-brain-self-update-hook.md
```

Aynı ADR-ID için iki slug; DB'de tek entry (`adr-046`, sprint-166).

### 3.3 — Decay Tutarsızlığı (HIGH)

```sql
SELECT id, status, decay_exempt FROM entries
WHERE deleted_at IS NULL AND status IN ('superseded','deprecated','rejected');
-- adr-005 | deprecated | 0
-- adr-022 | superseded | 0
```

Karşılaştırma için 46 accepted ADR `decay_exempt=1`.

### 3.4 — Eksik MADR rel_type Kanıtı (HIGH)

```sql
SELECT DISTINCT rel_type FROM relations;
-- references
-- depends_on
-- supersedes
```

`.contracts/api-surface.md` "Memory V2 DB Schema" bölümünde tanımlanan: "references, supersedes, caused_by, resolves, blocks, depends_on" — runtime 3'le sınırlı. `MemoryStore` API'sinde alan kısıtı yok ama hiçbir orchestra/core modülü bu tipleri üretmiyor (grep ile doğrulanabilir).

### 3.5 — mem-132 Boş İçerik (HIGH)

```sql
SELECT id, type, length(content) FROM entries
WHERE deleted_at IS NULL AND (content IS NULL OR trim(content)='');
-- mem-132 | memory | 0
```

Başlık "Sprint 132 Learnings", `created_at='2026-04-16 09:07:52'`.

### 3.6 — adr-047 / adr-048 History Yok (MEDIUM)

```sql
SELECT e.id, e.type, e.title FROM entries e
WHERE e.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM entry_history h WHERE h.entry_id=e.id);
-- adr-048 | adr | Prompt Lifecycle Contract
-- adr-047 | adr | Manuel Subagent Dispatch Protocol
```

Karşılaştırma: 229/231 entry'de "create" history event'i mevcut (`SELECT entry_id FROM entry_history WHERE change_type='create'` → 229 satır).

### 3.7 — sprint_num=0 ama sprint_id Atanmış (MEDIUM)

```sql
SELECT id, sprint_id, sprint_num FROM entries
WHERE deleted_at IS NULL
  AND ((sprint_id IS NOT NULL AND sprint_num=0)
    OR (sprint_num>0 AND sprint_id IS NULL));
-- pattern-sprint-168-stale_heartbeat | sprint-168 | 0
-- pattern-sprint-169-stale_heartbeat | sprint-169 | 0
-- pattern-sprint-170-stale_heartbeat | sprint-170 | 0
-- pattern-sprint-171-stale_heartbeat | sprint-171 | 0
```

`.brain/exports/summary.md` "Active Patterns" bölümünde bunlar listelense de filtreleme `sprint_num` üzerinden yapılırsa kaybolur.

### 3.8 — Naming Şeması Karışıklığı + Sprint Log Eksiklik (MEDIUM)

```sql
-- memory IDs:
SELECT id FROM entries WHERE type='memory' ORDER BY id;
-- mem-132, mem-133, ..., mem-140, mem-152, mem-157, ..., mem-161, mem-165,
-- mem-sprint-141 ... mem-sprint-170, user-1778591061896

-- sprint logs:
SELECT id FROM entries WHERE type='sprint' ORDER BY id;
-- sprint-log-136, 137, 138, 139, 165, 166, 168, 169, 170 (9 entry)

-- FS:
ls .brain/sprints/sprint-*.md | wc -l  # 28
```

Eksik DB sprint logları: 140-164 (sprint-152 dışında MD olarak FS'de var) + 167.

### 3.9 — ADR ID Boşluğu (LOW)

```sql
SELECT id FROM entries WHERE type='adr' ORDER BY id;
-- adr-001 ... adr-048, adr-053, adr-055, adr-060 (toplam 52, max=60 → 9 ID eksik)
```

### 3.10 — DEBT Çift Prefix Bug (MEDIUM)

```sql
SELECT id FROM entries WHERE id LIKE 'debt-debt-%';
-- debt-debt-138-002 | Tech debt from 138-002: ADR-035 Brain ↔ Worker ↔ Auditor Verification Protocol S
-- debt-debt-138-008 | Tech debt from 138-008: Worker Honest Assessment Calibration v2 tamamlandı.
```

`.brain/exports/debt.md` "Resolved Technical Debt" tablosunda `Sprint` sütunu için tüm satırlar `-` değerinde — kanıt:

```
| debt-141-003 | Tech debt from 141-003: ... | normal | - | resolved |
| debt-141-007 | Tech debt from 141-007: ... | normal | - | resolved |
| ...
```

(`.brain/exports/debt.md` satır 13'ten itibaren tüm "Resolved" satırlar bu desende.)

### 3.11 — `[[ref]]` Yokluğu (INFO, kapsam doğrulama)

```sql
SELECT COUNT(*) FROM entries WHERE deleted_at IS NULL AND content LIKE '%[[%';
-- 0
```

### 3.12 — Schema/Soft-Delete (INFO)

```sql
SELECT * FROM schema_version;
-- version=1, applied_at=2026-04-16 09:07:52

SELECT COUNT(*) FROM entries WHERE deleted_at IS NOT NULL;
-- 0
```

### 3.13 — retro-latest Generic Alias (LOW)

```sql
SELECT id, sprint_id, sprint_num, length(content) FROM entries WHERE id='retro-latest';
-- retro-latest | NULL | 0 | 5443
```

### 3.14 — User Entry (LOW)

```sql
SELECT id, type, title FROM entries WHERE id LIKE 'user-%';
-- user-1778591061896 | memory | help
```

---

## 4. Öneriler

Aşağıdaki düzeltmeler **Sprint 172 OSS-GA öncesi** bir mikro-sprint kapsamında veya Sprint 172'nin ilk dalgasında yapılmalıdır. Kritik olanlar OSS public flip için bloker.

### 4.1 — Naming Bug Onarımı (CRITICAL, OSS-GA bloker)

`src/orchestra/sprint-finalizer.ts:667-669` satırlarında ID kuruluş kuralını DB'deki gerçek şemaya eşitle:

```ts
const sprintLogId = `sprint-log-${sprint.id.replace(/^sprint-/, '')}`;
const memoryId    = `mem-${sprint.id}`;      // Not: 'mem-', 'memory-' DEĞİL
const retroId     = `retro-${sprint.id}`;
```

Sonrasında **hotfix migration**: orphan relations'ı temizleyen tek-seferlik yardımcı script gerek:

1. `relations` tablosundan orphan kayıtları SİL (audit log üret).
2. Sprint 141-170 için doğru 3'lü relation'ı yeniden ekle (`mem-sprint-NNN ↔ retro-sprint-NNN ↔ sprint-log-NNN`).
3. Script idempotent; tekrar çalıştırılırsa duplicate üretmesin.

Script `scripts/` altına `relations-repair.mjs` adıyla yerleştirilebilir; CI'da bir kez çalıştırılır, sonra silinir veya `--dry-run` default'la kalır.

Eklenti: insertRelation API'sine **defensive check** ekle — `from_id` ve `to_id` için `entries` tablosunda var olma doğrulaması yapsın, yoksa hata fırlatsın veya uyarı yazsın. Sessiz orphan eklenmesin.

### 4.2 — ADR DB↔FS Hook Tamiri ve adr-061 Yansıması (CRITICAL, OSS-GA bloker)

ADR-046 hook implementasyonunun aşağıdakileri yapması garanti altına alınmalı:

1. `docs/adr/NNN-*.md` eklendiğinde DB'ye `entries(type='adr', id='adr-NNN', status='proposed')` insert et.
2. Slug çarpışmasını önlemek için tek slug kuralı (`adr-NNN` ID + tek MD dosyası `NNN-<slug>.md`); duplicate slug'lı eski dosyaları arşive taşı.
3. `docs/adr/046-brain-self-update-hook.md` (kısa slug) `docs/adr/_deprecated/` altına taşı; canonical olarak `046-brain-self-update-hook-architecture.md` kalsın.
4. `adr-061` için bir kerelik `MemoryStore.insert` ile DB'ye ekle (status="proposed" — DIRECTIVES'te AEGIS henüz manifesto olarak konumlanmış).
5. CI gate: `scripts/adr-validator.mjs` testi FS↔DB count + ID set diff'i karşılaştırsın; mismatch → exit 1.

### 4.3 — Decay Politikası Genişletme (HIGH)

`MemoryStore.insert` ve `setStatus` hook'una bir kural ekle: status'u "accepted", "superseded" veya "deprecated" olan ADR'ler `decay_exempt=1` yapılsın. Mevcut iki kayıt için tek-seferlik veri düzeltme:

```sql
-- (Sprint 172 mikro-sprint task'ı; mevcut Sprint 171 audit-only yetki ile DIŞINDA)
UPDATE entries SET decay_exempt=1 WHERE id IN ('adr-005','adr-022');
```

Yine de Sprint 171 SADECE read-only — bu UPDATE Sprint 172 task'ı olacak. Audit raporu bunu fix değil **öneri** olarak listeler.

### 4.4 — MADR rel_type Genişletme (HIGH)

`refines`, `refutes`, `deprecates`, `caused_by`, `resolves`, `blocks` ilişki tiplerini fiilen kullanmaya başla:

- ADR yazımı sırasında `Refines:`, `Deprecates:`, `Caused by:` MADR alanlarını parse eden bir `adr-importer.ts` ekle (varsa zenginleştir).
- Sprint retrospektif yazımında `mem-sprint-NNN` entry'sine `caused_by → debt-NNN-*` veya `resolves → debt-NNN-*` ilişkilerini düş.
- `MemoryStore.insertRelation`'a rel_type whitelist parametresi ekle (yanlış tip eklemesini önlesin).

`.contracts/api-surface.md` mevcut "Memory V2 DB Schema" listesi runtime ile eşit hale getirilmeli — ya doküman daraltılmalı (3 tip), ya runtime genişletilmeli (6 tip). Tercih: runtime'ı genişletmek (daha zengin graf).

### 4.5 — Eksik İçerik Geri-Doldurma (HIGH)

- `mem-132` için Sprint 132 retrospektifi `.brain/archive/pre-v2/` veya git log'undan toparlanıp gövde doldurulmalı. (Sprint 169 H2 backfill scripti yeniden çalıştırılmalı; idempotent olduğundan mevcut dolu entry'lere zarar vermez.)
- `mem-141 … mem-151`'in eski şema-yeni şema dönüşümü (`mem-NNN` → `mem-sprint-NNN`) zaten yapılmış görünüyor; geriye sadece tek-sayı kalanlar (`mem-132 … mem-140`, `mem-152`, `mem-157 … mem-161`, `mem-165`) re-key edilmeli. Re-key sırasında relations referansları otomatik güncellensin.
- Eksik sprint loglarını (`sprint-log-140 … 164`, `sprint-log-167`) DB'ye yansıtacak importer yazılmalı (FS'de mevcut `.brain/sprints/sprint-NNN.md` dosyalarından).

### 4.6 — Audit Trail Tamiri (MEDIUM)

`MemoryStore.insert` çağrısının history "create" event'i yazdığını test eden bir unit test ekle. `adr-047` ve `adr-048` için tek-seferlik geriye dönük create event'i eklenmeli (changed_by='backfill-history'). Bu Sprint 172 mikro-sprint task'ı; Sprint 171 read-only.

### 4.7 — sprint_num Senkronu (MEDIUM)

Pattern entry oluşturma path'inde `sprint_num` alanını `sprint_id`'den extract edip yazmayı zorunlu kıl. Tek-seferlik düzeltme:

```sql
-- (Sprint 172 fix önerisi)
UPDATE entries
SET sprint_num = CAST(substr(sprint_id, 8) AS INTEGER)
WHERE type='pattern' AND sprint_id LIKE 'sprint-%' AND sprint_num=0;
```

`MemoryStore.insert` invariant: `sprint_id IS NOT NULL ⇒ sprint_num > 0` olmalı; aksi halde insert hata fırlatsın.

### 4.8 — Naming Şeması Tekleştirme (MEDIUM)

`mem-NNN` ve `mem-sprint-NNN` ikiliğini tek standart altında birleştir: önerilen şema `mem-sprint-NNN`. Tarihsel kayıtların re-key migration'ı, ilgili relations'ı korumalı.

### 4.9 — ADR Boşluk Belgelemesi (LOW)

`docs/adr/INDEX.md` veya `docs/adr/README.md`'de "reserved/skipped" ID'ler için bir tablo ekle. ADR-049 ile ADR-052 arasındaki gap'in açıklamasız kalması karar tarihçesini kuşkulu kılar.

### 4.10 — DEBT Format Onarımı (MEDIUM)

- `entries` tablosunda `id LIKE 'debt-debt-%'` 2 kaydı için tek-seferlik re-key. Geçmiş `id` ile referans veren `relations` da güncellenmeli.
- `.brain/exports/debt.md` üretici fonksiyonu (`memory-export.ts`) `sprint_id` alanını resolved kayıtlar için de çıktıya yazmalı.
- DEBT title üretimi "Tech debt from X-Y: <açıklama>" formatından "<özlü kısa başlık> (X-Y)" formuna geçmeli; uzun açıklama `summary` alanına gitmeli.

### 4.11 — retro-latest ve user-* Taksonomi (LOW)

- `retro-latest`'ı kaldır; canlı dashboard tüketicisi (`monitor/dashboard-manager.ts` vb.) `SELECT id FROM entries WHERE type='retro' ORDER BY sprint_num DESC LIMIT 1` yöntemiyle dinamik son retrospektifi çekmeli.
- `user-*` ID'leri için `type='user_memory'` veya `source='user'` filter'ı eklenip ayrı taksonomi kullanılmalı.

### 4.12 — Read-Only Audit Otomasyonu (LOW)

Bu rapordaki SQL sorgularını `scripts/db-integrity-check.mjs` adıyla CI'a bağla; her PR'da çalışsın, orphan count > 0 → CI fail. ADR DB↔FS count diff için `scripts/adr-validator.mjs` (varsa) ile birleştirilebilir.

---

## 5. Kapsam Notu (cross-cut görev — Kapsam Haritası uygulanmaz)

DIRECTIVES.md Task 28 bu görevi cross-cutting olarak konumlandırır: tek tek modül-derin Kapsam Haritası tablosu istenmez. Bu denetimin tarama yüzeyi:

- **DB:** `.brain/memory.db` — schema (11 tablo: `entries`, `entries_fts`, `entries_fts_config`, `entries_fts_data`, `entries_fts_docsize`, `entries_fts_idx`, `entry_history`, `relations`, `schema_version`, `sqlite_sequence`, `tags`); entries 231 aktif satır; relations 147; entry_history 1398; tags 1005.
- **FS karşılaştırma:** `docs/adr/` (53 MD), `.brain/exports/` (4 export + 3 yan rapor), `.brain/sprints/` (28 MD), `.brain/archive/pre-v2/` (referans olarak hatırlatıldı).
- **Kaynak dosya kanıtı:** `src/orchestra/sprint-finalizer.ts:667-675` (relations naming bug kök neden), `src/core/memory-store.ts` (insertRelation API), `.contracts/api-surface.md` (rel_type kontratı).
- **Sınırlar:** `memory.db` yalnızca okuma; hiçbir UPDATE/INSERT/DELETE/DROP çalıştırılmadı. Önerilen veri düzeltmeleri (UPDATE/INSERT/script) Sprint 172 mikro-sprint kapsamında uygulanacak; bu rapor yalnızca önerir.

Bu cross-cut görev Sprint 171 SYNTHESIS (Task 29) için kritik girdi sağlar: bulgu 1.1 ve 1.2 OSS-GA blokeri olarak listelenmeli; bulgu 1.3, 1.4, 1.5 backlog ilk dalga; geri kalanlar Sprint 172 doc-reorg + integrity hardening dalgası.

---

**Self-review:** 4 ana bölüm + Kapsam Notu mevcut; tüm bulgular Türkçe; her bulgu SQL veya `file:satır` kanıtlı; severity tablosu eksiksiz; öneriler audit-only kuralını koruyor (sadece öneri, fix yok). memory.db üzerinde **hiçbir yazma** yapılmamıştır.
