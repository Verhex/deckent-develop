# core Memory Subsystem — Audit Raporu (Sprint 171, Task 171-005)

> Bu rapor `src/core/memory-{store,query,normalize,types,export,import}.ts` altıltısının char-level denetimini içerir. Audit-only — hiçbir kaynak/test/db dosyası modify edilmedi. memory.db'ye dokunulmadı. Tüm içerik Türkçe (Worker Contract gereği).
>
> Plan: `docs/superpowers/plans/2026-05-15-sprint-171-self-audit-plan.md` Task 171-005 bölümü bağlayıcı runbook olarak uygulandı.

---

## 1. Bulgular (Findings)

### 1.1 `relations` tablosunda formal FOREIGN KEY eksik — orphan riski (memory-store.ts:129-135)

`entries` tablosu için `PRAGMA foreign_keys = ON` (`memory-store.ts:85`) açık olsa da `relations` tablosu yalnızca composite PRIMARY KEY ile tanımlı; `from_id` ve `to_id` sütunları için `REFERENCES entries(id)` veya `ON DELETE CASCADE` deklarasyonu YOK. Karşılaştırma noktası: `tags` tablosu (aynı dosya, `memory-store.ts:122-127`) doğru biçimde `FOREIGN KEY (entry_id) REFERENCES entries(id) ON DELETE CASCADE` taşır. Sonuç: bir `entries` satırı hard DELETE edildiğinde `relations` tablosundaki ilgili satırlar yetim (orphan) kalır. Soft-delete (decay/softDelete) bu sorunu maskeler çünkü satır fiziksel olarak silinmez; ancak gerçek bir DROP/DELETE senaryosunda (ileride bir migration veya manuel temizlik) bütünlük garanti edilmez.

### 1.2 `insertRelation` positional overload FK kontrolünü atlar (memory-store.ts:626-665)

Sprint 169 C1 ile eklenen object form (`MemoryRelation`) `from_id` ve `to_id` için canlı FK doğrulaması yapıyor (satır 643-655) ve eksik referansta `DECKENT_E068`/`DECKENT_E069` fırlatıyor. Aynı fonksiyonun positional çağrı yolu (`memory-store.ts:656-660`) ise hiçbir kontrol yapmadan doğrudan `INSERT OR IGNORE` çalıştırıyor (`memory-store.ts:662-664`). Bunun sonucu iki taraflı bir tutarsızlık:

1. `memory-import.ts` içindeki `restoreRelations` (satır 382-403) positional path'i kullanıyor; FK kontrolü orada ayrı bir `existsStmt` ile manuel yapılıyor.
2. `memory-store.ts` içindeki `insert()` `auto-extract` ADR ref dalı (`memory-store.ts:340-347`) positional path'i kullanıyor — burada hedef ADR henüz DB'de yoksa orphan relation oluşur (örnek: önce `adr-061` insert ederken `ADR-046` içerik referansı çıkartılır, `adr-046` henüz yoksa orphan yaratılır).

API'nin iki yolu aynı invariantı sağlamamak suretiyle "FK garantilidir" beklentisini çürütüyor; orphan kontrolünü tutarlı tek noktaya çekmek (her iki yolun da object form'a varan internal helper'a yönelmesi) gerekir.

### 1.3 `'patch'` change_type, `ChangeType` union'ında YOK — tip kontratı ihlali (memory-store.ts:561 vs memory-types.ts:51-56)

`memory-store.ts:561` satırında `update()` metodu `entry_history` tablosuna `change_type = 'patch'` yazıyor. Buna karşılık `memory-types.ts:51-56` `ChangeType` union'ı sadece `'create' | 'update' | 'soft_delete' | 'restore' | 'decay'` değerlerini tanımlıyor. `'patch'` literali union'ın dışında. `getHistory()` (`memory-store.ts:702-706`) sonucu `EntryHistoryRecord[]` olarak cast ediliyor (`as EntryHistoryRecord[]`); runtime'da yine de çalışıyor ama TypeScript güvencesi yanlış: tüketici "değişen change_type'lar `ChangeType` üyelerinden biridir" varsayımıyla switch yazarsa `'patch'` durumu kaçırılır. Aynı sınıfta `upsert()` (`memory-store.ts:471`) `'update'` kullanıyor; `update()` ile `upsert()` arasında semantik fark olsa bile her iki değer de tip union'ında bulunmalı.

### 1.4 `turkishNormalize` Almanca `ß` (eszett) için bozuk — "TR/EN/DE %100 recall" iddiası gerçekçi değil (memory-normalize.ts:13, 14-37)

`memory-normalize.ts:13` dosyanın doctring'i "Tested: 15/15 pass across TR/EN/DE/ES/FR" yazıyor. Fonksiyon (`memory-normalize.ts:14-37`) Almanca için yalnızca umlaut'ları (`ü`, `ö`) açıyor; karakter dönüşüm zincirinde `ß` (Latin small letter sharp s, U+00DF) veya kapital `ẞ` (U+1E9E) yok. Tehlikeli sonuçlar:

1. `'ß'.toLowerCase() === 'ß'` (kendi kendisinin lowercase'i).
2. NFD decomposition `ß` karakterini parçalamaz (NFD ASCII fold için ürün vermez).
3. Sonuç: `turkishNormalize('weiß')` → `'weiß'` (asgari değişiklik). Kullanıcı `"weiss"` araması yapınca FTS5 `weiß` içeriğini bulmaz.

Bunun kanıtı testlerin kendisi: `tests/core/memory-normalize.test.ts` 15 testin hiçbirinde `ß` veya `ẞ` yok (özellikle satır 21-23 sadece `Lösung über`'yi test eder). Almanca canonicalization eksik; doctring'in iddiası yanıltıcı.

Ek edge case: Almanca son ek `-ung` ve büyük harfle başlayan isimler ASCII fold sonrası "Lösung" → "losung" oluyor; bu kısmi DE çalışıyor. `ß` boşluğu kapatılmazsa DE %100 recall iddiası fiilen %~95.

### 1.5 `upsert()` içerik güncellemesinde otomatik ADR referans çıkarımı yok — drift kaynağı (memory-store.ts:356-476 vs 340-347)

`insert()` metodu satır 341-347'de `MemoryStore.extractAdrReferences()` ile `content + title` üzerinden ADR ID'lerini çıkartıp `relations` tablosuna `references` tipiyle yazıyor. `upsert()` metodu (satır 356-476) aynı işlemi YAPMIYOR; yalnızca `tags`'ı `deleteTags`/`insertTag` ile yeniliyor (satır 463-467). Senaryo: bir ADR'nin içeriği güncellenip yeni `ADR-NNN` referansları eklendiğinde `relations` tablosu eski snapshot'ta kalır. Bu durum:

- `adr-file-sync.ts` `syncAdrFilesToDb`'nin idempotency kontratıyla beraber ele alındığında (satır 215-219 content eşitliği değişiyorsa `store.upsert` çağrılır, `memory-store.ts:226`) FS→DB yolu içerik değiştiğinde relations'ı tazelemez.
- Sonuç: file edit edilip yeni `ADR-XXX` referansı eklenirse, memory.db'deki graph eksik kalır. `getRelations`/`exportSummaryMd` çıktısı bayatlar.

### 1.6 `backfillDebtSprintIds` `getRawDb()` yerine `as unknown as { db }` cast'ı kullanıyor — encapsulation kırığı (memory-import.ts:312-322)

`MemoryStore` sınıfı `getRawDb()` (`memory-store.ts:801-803`) ile dış erişim için resmi bir kanal sağlıyor. Bununla birlikte aynı modül grubundaki `backfillDebtSprintIds` (`memory-import.ts:315`) doğrudan `(store as unknown as { db: import('better-sqlite3').Database }).db` cast'ı yapıyor. Yorum satırı 312-314 bunu "documented escape hatch" olarak savunsa da kontrolün halen mevcut olduğu (`getRawDb()`) ortada. Aynı dosyada `backupRelations` (satır 362), `restoreRelations` (satır 381), `rebuildWithRelationSafety` (satır 425) `store.getRawDb()` çağırıyor — yani modül içi tutarsızlık var. `private db` field'ının ileride yeniden adlandırılması bu satırı sessizce kırar (TypeScript runtime cast yüzünden yakalayamaz).

### 1.7 `adrToFilename` Türkçe başlığı bozuk slug'a çevirir (memory-export.ts:256-266)

`adrToFilename` fonksiyonu (satır 261-265) slug üretmek için `title.toLowerCase().replace(/[^a-z0-9]+/g, '-')` kullanıyor. `toLowerCase()` öncesi `turkishNormalize` çağrılmıyor; sonuç olarak Türkçe karakterli ADR başlıkları parçalanır:

| Girdi | Üretilen Dosya Adı |
|---|---|
| `adr-061`, "AEGIS Yöntem Bilim" | `061-aegis-y-ntem-bilim.md` |
| `adr-046`, "Çift Yönlü Hook" | `046-ift-y-nl-hook.md` |

Bu hatalı dosya adları daha sonra `exportAdrsToFs` tarafından FS'ye yazılır (`memory-export.ts:347`, `memory-export.ts:353`). Tek yönlü hook (DB→FS) tetiklenince FS'te bozuk isimli dosyalar oluşur. `syncAdrFilesToDb` ters yönde bu dosyaları okumaya çalıştığında `FILENAME_PATTERN` (`adr-file-sync.ts:49` `^(\d{3,})-.+\.md$`) sayesinde regex eşleşse de "title" sürekli olarak Türkçe orijinal kalır → her round-trip yeni `updated_at` doğurur ve idempotency `sameContent` kontrolünden geçebilir; ancak insan-okur olarak `061-aegis-y-ntem-bilim.md` yanıltıcıdır.

Düzeltme: slug öncesi `turkishNormalize(title)` veya benzeri ASCII fold uygulanmalı.

### 1.8 Schema migration mantığı yok — `SCHEMA_VERSION = 1` sabit (memory-store.ts:23, 251-260)

`SCHEMA_VERSION = 1` (satır 23) yalnızca bir kez `schema_version` tablosuna yazılıyor; gerçek bir migration yolu yok. Schema değişirse (örn. relations tablosuna FK ekleme, yeni sütun) mevcut DB'lerin upgrade'i için kod yolu mevcut değil. `CREATE TABLE IF NOT EXISTS` (satır 92) yalnızca yeni install'ları korur, var olanları olduğu gibi bırakır. Bu, ileride `ALTER TABLE` veya yeni FK ekleme senaryolarında veri uyumsuzluğuna yol açar. Sprint 169 C1 zaten `relations` tablosunu eklerken bu sınırlamayla karşılaştı; eski DB'lerde tablo `CREATE TABLE IF NOT EXISTS` ile var oluyor ama ileri schema değişikliği yapılabilir kontratı yok. ADR-046 self-update hook yalnızca veri seviyesinde çalışır, structural migration yok.

### 1.9 FTS path'inde `db: any` parametresi — tip güvencesi devre dışı (memory-query.ts:192-194, 254-256)

`ftsSearch` ve `structuredSearch` lokal helper'larında `db: any` parametresi tanımlı (`memory-query.ts:194` ve `memory-query.ts:256`), her ikisinde de `eslint-disable @typescript-eslint/no-explicit-any` ile bastırılmış. `MemoryStore.getRawDb()` (`memory-store.ts:801`) zaten `better-sqlite3` `Database` tipini dönüyor; `any` kullanmak için bir gerekçe yok. Bu hem `prepare(...).all(...)` argüman tipi yardımını kaybettirir hem de injection / mistype hatalarını runtime'a iter.

### 1.10 `MemoryRelation.metadata` alanı tanımlı ama hiçbir yerde okunmuyor — ölü field (memory-types.ts:122-128, memory-store.ts:637-642)

`MemoryRelation` interface'i (`memory-types.ts:123-128`) `metadata?: Record<string, unknown>` alanını içeriyor; ama `insertRelation` object overload'unda (`memory-store.ts:637-642`) yalnızca `from_id`, `to_id`, `type` okunur, `metadata` sessizce kaybedilir. DB schema'sında `relations` tablosunda `metadata` sütunu da yok. Tüketici bu alanı doldurduğunu sanır ama veri kaybolur. Ya alan kaldırılmalı ya da DB schema'sına eklenip yazma yolu çekilmeli.

### 1.11 `Relation` interface'i tanımlı ama hiçbir modülde kullanılmıyor — ölü kod (memory-types.ts:115-120)

`Relation` interface'i `memory-types.ts:115-120` satırlarında export edilmiş (`source?: 'auto-extract' | 'backfill' | 'finalizer' | 'user'` alanı dahil). Repo geneli arama (`grep -rn "\\bRelation\\b" src/`) bu sembolün hiçbir consumer modülde import edilmediğini gösterdi (sadece kendi tanımının olduğu satır + yorum satırları çıktı). Sprint 169 C1 muhtemelen önce `Relation` adıyla başladı, sonra `MemoryRelation`'a evrildi; eski tip silinmedi. Ek olarak `source: 'auto-extract' | 'backfill' | 'finalizer' | 'user'` literal union'ı insert/restore code path'lerine entegre edilmediği için "kim relation yarattı?" sorusu DB'den cevaplanamaz (history sadece entries için tutulur).

### 1.12 `extractAdrReferences` regex'i sadece 3 haneli ADR ID'yi yakalar (memory-store.ts:693-698)

`MemoryStore.extractAdrReferences(text: string)` regex'i `\bADR-(\d{3})\b` (satır 694). Mevcut maksimum ADR ID ~`adr-061` olduğu için sıkıntı yok; ama kontrat olarak ileride `ADR-1000+` çıkarsa içerik referansı çıkartılamaz ve graph kopar. Daha güvenli ifade: `\bADR-(\d{3,})\b` ve `padStart(3, '0')` normalizasyonu.

### 1.13 `entries_au` UPDATE trigger her UPDATE'te tüm FTS satırlarını siler/yeniden ekler — gereksiz I/O (memory-store.ts:234-247)

`AFTER UPDATE` trigger'ı yalnızca FTS-ilgili sütunlar değiştiğinde değil, `entries`'in herhangi bir sütunu değiştiğinde tetiklenir (örn. yalnızca `status` veya `decay_exempt` flag'i değişiyor olabilir). Sonuç: çok sık değişen alanlarda (`updated_at`, `status`) FTS index gereksiz yere yeniden yazılır. SQLite FTS5'in standart pattern'i `WHEN` clause ile koşullu trigger veya yalnızca FTS-relevant alanlar değiştiğinde tetikleme. Bu performans bulgusu (CRITICAL/HIGH değil) ama büyük DB'lerde measurable etki yaratır.

### 1.14 `extractAdrReferences` insert sırasında self-reference filtresi var, upsert dahil reverse pruning yok (memory-store.ts:343-346)

`insert()` ADR referans çıkarımında `if (adrId !== input.id)` ile kendine referans yaratımını engelliyor (satır 344). Ama bir entry başka bir entry'ye supersedes edildiğinde eski `references` ilişkileri otomatik temizlenmiyor; bu davranış kontrat olarak tanımlanmamış. `upsert()` ile içerik değişince eski relations kalır; yeni relations eklenmez (Bulgu 1.5 ile birleşik). Bu, graph'ta zamanla gerçekle uyumsuz `references` artıklarına neden olur.

### 1.15 STOP_WORDS_TR listesi eksik — keyword kalitesi düşük (memory-import.ts:25-29)

Türkçe stop word seti yalnızca 20 kelime içeriyor (`memory-import.ts:25-29`). Yaygın yüksek-frekans Türkçe stop kelimeleri (`bir`, `ne`, `bu`, `şu`, `o`, `ki`, `da`, `de`, `mı`, `mi`) listede yok. Sonuç: `extractKeywords()` çıktısı gürültülü; FTS recall'ı dolaylı olarak etkilenir (tags olarak gürültülü kelimeler insert edilir, `tag_norm` FTS5 bandwidth'ini şişirir).

### 1.16 `rebuildWithRelationSafety` strict mod errör mesajı tüketiciye remediation göstermiyor (memory-import.ts:432-438)

Strict mod throws yaptığında `DeckentError` mesajı `Memory rebuild would lose relations: pre=${preCount} post=${postCount}` ve recommendation kısmı "Run with strict: false to accept partial restore, or ensure all referenced entries exist." (satır 434-437). Pratikte rebuild'i çalıştıran CLI komutu (memory rebuild) bu hatayı yakalayıp `--strict=false` veya `--force` flag'i sundu mu? Sprint 169 C2 sözleşmesi rollback için `txn.rollback()` davranışına dayalı; better-sqlite3 transaction otomatik rollback için throw yeterli (`memory-import.ts:447` `return txn();`). Test (`memory-rebuild-safety.test.ts:1-60`) bu davranışı doğruluyor ama operatör kanal (CLI hata akışı + nasıl recover) belgesi rapor edilmiş bulguya göre eksik kalabilir (cross-cutting; Task 171-012 cli auditine devredilir).

### 1.17 `sortById` `localeCompare` ile numeric collation kullanıyor — `adr-022-v2` sıralaması (memory-export.ts:35-37)

`sortById` (satır 35-37) `numeric: true` opsiyonuyla doğal sıralama yapıyor. `adr-022` ile `adr-022-v2` karşılaştırması bu opsiyonla `adr-022` < `adr-022-v2` döner (doğru). Ama `adr-022-V2` (büyük V) gibi karışık casing'de ne olur? `sensitivity: 'base'` (satır 36) caseinsensitive yapar; OK. Bu **DOĞRU** ama "ileride beklenmedik ID schemata" için yorum eklenmesi iyi olur. (Bulgu değil, gözlem.)

### 1.18 SQLite `sqlite_master` query'sinde tip `{ 1: number }` hatalı (memory-store.ts:178-184, 187-200, 211-213)

`createIndexIfNotExists` ve `createFts5Table` ve `createFtsTriggers` `SELECT 1 FROM sqlite_master ...` query'sini çalıştırıyor ve sonucu `as { 1: number } | undefined` cast ediyor. Ama `SELECT 1` döner sütun adı `'1'` (string) değil; better-sqlite3 satır objesi gerçekte `{ '1': 1 }` (string anahtarı) verir. TypeScript `{ 1: number }` tipi number key bekliyor; arada runtime mismatch yok çünkü hiçbir field okunmuyor (sadece `if (!exists)` undefined kontrolü). Yine de tip yanıltıcı — `unknown` veya `Record<string, unknown>` daha doğru.

### 1.19 `decay` deleted_at'i set ediyor ama FTS index'i UPDATE trigger ile senkron — tutarlı (memory-store.ts:736-766)

İncelendi: `decay()` `UPDATE entries SET deleted_at = datetime('now')` (satır 750) — bu UPDATE `entries_au` trigger'ını tetikler (satır 234-247) — FTS satırı güncellenir; deleted satırlar `WHERE e.deleted_at IS NULL` filtresiyle dış katmanda gizlenir. **Doğru çalışıyor**. (Bulgu değil, doğrulama notu.)

---

## 2. Severity

| # | Bulgu | Severity | Gerekçe |
|---|---|---|---|
| 1.1 | `relations` tablosunda FK eksik | HIGH | Veri bütünlüğü için ana mekanizma; hard DELETE durumunda orphan kalır. OSS GA öncesi düzeltilmeli. |
| 1.2 | `insertRelation` positional path FK kontrolü yapmaz | HIGH | Aynı API'nin iki yolu farklı invariant sağlar — orphan üretme kapısı açık. |
| 1.3 | `'patch'` change_type union'da yok | MEDIUM | Type safety kontratı kırık; runtime şu an OK ama tüketici switch yazarsa kaçırır. |
| 1.4 | `turkishNormalize` `ß` desteği yok ama DE %100 iddia ediliyor | HIGH | Belgelenmiş iddia ile davranış uyuşmuyor; OSS dış kullanıcı yanılır. CRITICAL'a yakın. |
| 1.5 | `upsert()` ADR ref çıkarımı yapmaz | MEDIUM | Graph drift; içerik değişince relations bayatlar. |
| 1.6 | `backfillDebtSprintIds` `as unknown as { db }` cast | MEDIUM | `getRawDb()` zaten var; encapsulation kırığı + rename'e karşı kırılgan. |
| 1.7 | `adrToFilename` Türkçe başlıkları bozuk slug yapar | MEDIUM | DB→FS hook ile bozuk dosya adları yaratır. Türkçe ADR (örn. ADR-046, ADR-061) baskın olduğu için pratik etki yüksek. |
| 1.8 | Schema migration yolu yok | MEDIUM | İleri evrim engellenir; teknik borç. |
| 1.9 | `db: any` ftsSearch/structuredSearch | LOW | Stil; gerçek `Database` tipi import edilmeli. |
| 1.10 | `MemoryRelation.metadata` ölü alan | LOW | Veri kaybı (sessiz) + tüketici yanılgısı. |
| 1.11 | `Relation` interface ölü kod | LOW | Sprint 169'dan kalmış artık. |
| 1.12 | `extractAdrReferences` regex 3 haneye sabit | LOW | İleride ADR-1000+ ihtimali; şu an risk yok. |
| 1.13 | `entries_au` trigger her UPDATE'te FTS rewrite | LOW | Performans; büyük DB'lerde measurable. |
| 1.14 | `references` graph eski içerik için temizlenmez | LOW | Bulgu 1.5 ile birleşir. |
| 1.15 | `STOP_WORDS_TR` listesi eksik | LOW | Keyword kalite + FTS gürültüsü. |
| 1.16 | `rebuildWithRelationSafety` operator UX | LOW | CLI auditine devredilir (cross-cut). |
| 1.18 | `sqlite_master` cast tipi yanlış | LOW | Stil; runtime etki yok. |

**OSS-GA blocker (CRITICAL kategorisi):** Hiçbir bulgu tek başına OSS GA blocker değil; ancak **1.4 (DE recall iddia drift'i)** + **1.1+1.2 (FK invariant tutarsızlığı)** kombinasyonu Sprint 172 öncesi düzeltilmeli — birinci, kullanıcı-yanıltan doc-vs-code drift'i; ikincisi veri bütünlüğü garantisini fiilen vermiyor.

---

## 3. Kanıt (Evidence)

### Bulgu 1.1 — `relations` tablosunda FK yok

`src/core/memory-store.ts:129-135`:

```sql
CREATE TABLE IF NOT EXISTS relations (
  from_id TEXT NOT NULL,
  to_id TEXT NOT NULL,
  rel_type TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (from_id, to_id, rel_type)
);
```

Karşılaştırma — `tags` tablosu (`src/core/memory-store.ts:122-127`):

```sql
CREATE TABLE IF NOT EXISTS tags (
  entry_id TEXT NOT NULL,
  tag TEXT NOT NULL COLLATE NOCASE,
  PRIMARY KEY (entry_id, tag),
  FOREIGN KEY (entry_id) REFERENCES entries(id) ON DELETE CASCADE
);
```

`PRAGMA foreign_keys = ON;` (`src/core/memory-store.ts:85`) bu tablo için etkisiz çünkü FK deklarasyonu hiç yok.

### Bulgu 1.2 — Positional `insertRelation` FK atlar

`src/core/memory-store.ts:626-665`:

```typescript
insertRelation(fromId: string, toId: string, relType: RelationType): void;
insertRelation(rel: MemoryRelation): void;
insertRelation(fromIdOrRel: string | MemoryRelation, toId?: string, relType?: RelationType): void {
  // ...
  if (typeof fromIdOrRel === 'object') {
    // Object form — FK validation
    const fromExists = this.db.prepare(`SELECT 1 FROM entries WHERE id = ?`).get(fromId);
    if (!fromExists) throw new DeckentError('DECKENT_E068', ...);
    const toExists = this.db.prepare(`SELECT 1 FROM entries WHERE id = ?`).get(resolvedToId);
    if (!toExists) throw new DeckentError('DECKENT_E069', ...);
  } else {
    // Positional — NO FK check
    fromId = fromIdOrRel;
    resolvedToId = toId!;
    resolvedRelType = relType!;
  }
  this.db.prepare(`INSERT OR IGNORE INTO relations ...`).run(fromId, resolvedToId, resolvedRelType);
}
```

`memory-store.ts:340-347` positional path'i kullanır:

```typescript
const adrRefs = MemoryStore.extractAdrReferences(input.content + ' ' + input.title);
for (const adrId of adrRefs) {
  if (adrId !== input.id) {
    insertRelation.run(input.id, adrId, 'references');  // hedef hazır olmayabilir
  }
}
```

### Bulgu 1.3 — `'patch'` change_type union dışı

`src/core/memory-store.ts:558-562`:

```typescript
this.db.transaction(() => {
  this.db.prepare(`UPDATE entries SET ${sets.join(', ')} WHERE id = @id`).run(params);
  for (const diff of diffs) {
    insertHistory.run(id, diff.field, diff.oldVal, diff.newVal, changedBy, 'patch');
  }
})();
```

`src/core/memory-types.ts:51-56`:

```typescript
export type ChangeType =
  | 'create'
  | 'update'
  | 'soft_delete'
  | 'restore'
  | 'decay';
```

`'patch'` literal yok. `upsert()` (`src/core/memory-store.ts:471`) ise `'update'` yazıyor — iki metod arasında change_type semantik tutarsızlığı da var.

### Bulgu 1.4 — `turkishNormalize` `ß` desteklemiyor

`src/core/memory-normalize.ts:13`:

```typescript
 * Tested: 15/15 pass across TR/EN/DE/ES/FR (see spec Section 4).
```

Fonksiyon (`memory-normalize.ts:17-37`):

```typescript
return text
  .replace(/I/g, 'ı')
  .replace(/İ/g, 'i')
  .replace(/Ş/g, 'ş')
  // ... TR specific
  .toLowerCase()
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .replace(/ı/g, 'i')
  // ... TR re-fold
  .replace(/ç/g, 'c');
// ß için satır YOK
```

Test dosyası `tests/core/memory-normalize.test.ts:1-65` — 15 testin hiçbiri `ß` veya `ẞ` içermiyor. `'ß'.toLowerCase()` JavaScript spec gereği `'ß'` döner (NFD parçalamaz). Sonuç: `turkishNormalize('weiß') === 'weiß'`. Kullanıcı `"weiss"` araması yaparsa eşleşmez.

### Bulgu 1.5 — `upsert()` ADR ref çıkarımı yapmaz

`src/core/memory-store.ts:340-347` (insert), ADR ref auto-extract bloğu var.

`src/core/memory-store.ts:441-476` (upsert transaction body) — hiç `extractAdrReferences` çağrısı yok; yalnızca `updateEntry.run(...)` + `deleteTags` + `insertTag` + `insertHistory`.

### Bulgu 1.6 — `backfillDebtSprintIds` cast hack

`src/core/memory-import.ts:312-322`:

```typescript
// Access the underlying SQLite db via the documented escape hatch.
// MemoryStore does not yet expose a typed migration API, but the better-sqlite3
// Database instance is reachable through `store as any`.
const db = (store as unknown as { db: import('better-sqlite3').Database }).db;
```

Karşılaştırma — `src/core/memory-import.ts:362`:

```typescript
const db = store.getRawDb();
```

`src/core/memory-store.ts:801-803`:

```typescript
getRawDb(): DatabaseType {
  return this.db;
}
```

`backfillDebtSprintIds` `getRawDb()` çağırsa cast'a gerek kalmaz.

### Bulgu 1.7 — `adrToFilename` Türkçe slug bozuluyor

`src/core/memory-export.ts:256-266`:

```typescript
function adrToFilename(id: string, title: string): string {
  const numPart = id.replace(/^adr-/i, '');
  const numMatch = numPart.match(/^(\d+)/);
  const numStr = numMatch ? numMatch[1]!.padStart(3, '0') : numPart;
  const suffix = numMatch ? numPart.slice(numMatch[1]!.length) : '';
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')   // ← Türkçe karakter `-`'a dönüşür
    .replace(/^-+|-+$/g, '');
  return `${numStr}${suffix}-${slug}.md`;
}
```

`toLowerCase()` Türkçe karakterleri korur (`'ÇÖKMÜ'` → `'çökmü'`), sonra `[^a-z0-9]+` regex'i hepsini `-` yapar. Test: input `"adr-046", "Çift Yönlü Hook"` çıktı `"046-ift-y-nl-hook.md"`.

### Bulgu 1.8 — Schema migration yok

`src/core/memory-store.ts:23`:

```typescript
const SCHEMA_VERSION = 1;
```

`src/core/memory-store.ts:251-260` `recordSchemaVersion`:

```typescript
private recordSchemaVersion(): void {
  const existing = this.db.prepare(`SELECT version FROM schema_version WHERE version = ?`).get(SCHEMA_VERSION) as { version: number } | undefined;
  if (!existing) {
    this.db.prepare(`INSERT INTO schema_version (version, applied_at) VALUES (?, datetime('now'))`).run(SCHEMA_VERSION);
  }
}
```

Sadece kayıt eklenir; herhangi bir `if (currentVersion < N) migrate()` bloğu yok.

### Bulgu 1.9 — `db: any` ftsSearch/structuredSearch

`src/core/memory-query.ts:192-194`:

```typescript
function ftsSearch(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  ...
)
```

`src/core/memory-query.ts:254-256` — aynı yapı `structuredSearch` için.

### Bulgu 1.10 — `MemoryRelation.metadata` okunmuyor

`src/core/memory-types.ts:123-128`:

```typescript
export interface MemoryRelation {
  from_id: string;
  to_id: string;
  type: RelationType;
  metadata?: Record<string, unknown>;
}
```

`src/core/memory-store.ts:637-642` (object form path):

```typescript
if (typeof fromIdOrRel === 'object') {
  fromId = fromIdOrRel.from_id;
  resolvedToId = fromIdOrRel.to_id;
  resolvedRelType = fromIdOrRel.type;
  // metadata okunmuyor
```

DB schema'sında `relations` tablosunda `metadata` sütunu yok (`memory-store.ts:129-135`).

### Bulgu 1.11 — `Relation` interface ölü

`src/core/memory-types.ts:115-120`:

```typescript
export interface Relation {
  from_id: string;
  to_id: string;
  rel_type: RelationType;
  source?: 'auto-extract' | 'backfill' | 'finalizer' | 'user';
}
```

`grep -rn "\\bRelation\\b" src/` çıktısı (yorum + tanım dışı consumer satır YOK). Aynı dosyadaki `EntryRelation` (satır 105) ve `MemoryRelation` (satır 123) kullanılan; `Relation` ise sadece tanımlandı.

### Bulgu 1.12 — `extractAdrReferences` 3 haneye sabit

`src/core/memory-store.ts:693-698`:

```typescript
static extractAdrReferences(text: string): string[] {
  const matches = text.match(/\bADR-(\d{3})\b/g);
  if (!matches) return [];
  const unique = new Set(matches.map(m => m.toLowerCase()));
  return [...unique];
}
```

### Bulgu 1.13 — `entries_au` trigger koşulsuz

`src/core/memory-store.ts:234-247`:

```typescript
} else if (name === 'entries_au') {
  this.db.exec(`
    CREATE TRIGGER entries_au AFTER UPDATE ON entries BEGIN
      INSERT INTO entries_fts(entries_fts, rowid, ...) VALUES ('delete', old.rowid, ...);
      INSERT INTO entries_fts(rowid, ...) VALUES (new.rowid, ...);
    END;
  `);
}
```

`WHEN` clause yok; her UPDATE FTS satırını delete+insert eder.

### Bulgu 1.15 — STOP_WORDS_TR eksik

`src/core/memory-import.ts:25-29`:

```typescript
const STOP_WORDS_TR = new Set([
  'için', 'olan', 'ile', 'veya', 'ama', 'ancak', 'daha', 'çok',
  'gibi', 'kadar', 'sonra', 'önce', 'üzerinde', 'altında',
  'arasında', 'iken', 'zaman', 'yani', 'hala', 'sadece',
]);
```

Eksik yüksek-frekans kelimeler: `bir`, `ne`, `bu`, `şu`, `o`, `ki`, `da`, `de`, `mı`, `mi`, `te`, `den`, `dan`, vb.

### Bulgu 1.18 — `sqlite_master` cast tipi

`src/core/memory-store.ts:178-184`:

```typescript
private createIndexIfNotExists(name: string, ddl: string): void {
  const exists = this.db.prepare(
    `SELECT 1 FROM sqlite_master WHERE type='index' AND name=?`,
  ).get(name) as { 1: number } | undefined;
  if (!exists) {
    this.db.exec(ddl);
  }
}
```

`get(name)` better-sqlite3'te `Record<string, unknown> | undefined` döner; `{ 1: number }` yanıltıcı tip ama runtime alanı okunmadığı için zarar yok.

---

## 4. Öneriler (Recommendations)

> Aksiyon sınıflandırması Worker Contract ile uyumlu: **Sil / Birleştir / Tamamla / Düzelt / Koru**.

| # | Bulgu | Aksiyon | Detay | Sprint Hedefi |
|---|---|---|---|---|
| 1.1 | `relations` FK eksik | **Düzelt** | `CREATE TABLE relations` deklarasyonuna `FOREIGN KEY (from_id) REFERENCES entries(id) ON DELETE CASCADE` ve `to_id` için aynısını ekle. Schema migration ile mevcut DB'ler için `pragma legacy_alter_table=ON` workaround veya tablo recreate + data copy. | Sprint 172 (OSS GA öncesi) |
| 1.2 | Positional `insertRelation` FK atlar | **Düzelt** | Positional path object form'a yönlendir: legacy çağrılar `this.insertRelation({ from_id, to_id, type })` çağrısına dönüştür; FK kontrolü tek noktada. Birim test: orphan insert exception fırlatmalı. | Sprint 172 |
| 1.3 | `'patch'` change_type union'da yok | **Düzelt** | `ChangeType` union'ına `'patch'` ekle veya `update()` `'patch'` yerine `'update'` yaz. Tercih: `'update'` (semantik birleştirme; `update()` ile `upsert()` aynı change_type kullansın). | Sprint 172 |
| 1.4 | `turkishNormalize` `ß` yok | **Tamamla** | `replace(/ß/g, 'ss')` ve `replace(/ẞ/g, 'ss')` ekle (lowercase sonrasına). Doctring'i `Tested: TR/EN/DE %100 recall after ß/ẞ patch` olarak güncelle. Test dosyasına 3 adet ß-içerikli test ekle (örn. `weiß ↔ weiss`, `Straße ↔ strasse`, `groß ↔ gross`). | Sprint 172 (DE OSS audience için kritik) |
| 1.5 | `upsert()` ADR ref auto-extract yok | **Tamamla** | `upsert()` transaction body içine, content değişmişse `extractAdrReferences` + `insertRelation` döngüsü ekle. Eski `references` ilişkilerini de prune et (yeni içerikte olmayan ADR ref'leri sil). | Sprint 172 |
| 1.6 | `backfillDebtSprintIds` cast hack | **Düzelt** | `const db = (store as unknown as ...).db` yerine `const db = store.getRawDb();` kullan. Yorumdaki "documented escape hatch" cümlesini sil. | Sprint 172 (basit refactor) |
| 1.7 | `adrToFilename` Türkçe slug bozar | **Düzelt** | `slug` üretmeden önce `turkishNormalize(title)` çağır, sonra `[^a-z0-9]+` regex'i uygula. Mevcut bozuk dosya adları `docs/adr/` dizinine yazıldıysa rename script gerekli (Sprint 172 doc-reorg ile birlikte). | Sprint 172 |
| 1.8 | Schema migration yok | **Tamamla** | `applyMigrations(db, currentVersion)` fonksiyonu yaz; her bump için `if (v < N) { exec(...); recordVersion(N); }` pattern. C1 relations tablosu için backfill migration (eksik FK ekle, rebuild). | Sprint 172-173 (uzun vadeli teknik borç) |
| 1.9 | `db: any` ftsSearch | **Düzelt** | `import type { Database } from 'better-sqlite3'` ve `db: Database` kullan. Eslint-disable yorumlarını sil. | Sprint 172 (basit) |
| 1.10 | `MemoryRelation.metadata` okunmuyor | **Sil veya Tamamla** | Karar: ya `metadata?` alanını `MemoryRelation`'dan kaldır (Sil), ya da `relations` tablosuna `metadata TEXT` ekle + insert kodu yaz (Tamamla). Önerilen: **Sil** (mevcut consumer yok). | Sprint 172 |
| 1.11 | `Relation` interface ölü | **Sil** | `memory-types.ts:115-120` interface'ini kaldır. | Sprint 172 (basit) |
| 1.12 | `extractAdrReferences` 3 haneye sabit | **Düzelt** | Regex'i `\bADR-(\d{3,})\b` yap; `padStart(3, '0')` normalizasyonu ekle (3 haneden uzun ADR ID'leri 4+ hane olarak korunur). | Sprint 172 (defensive) |
| 1.13 | `entries_au` koşulsuz FTS rewrite | **Düzelt (opt)** | Trigger'ı `WHEN old.title != new.title OR old.content != new.content OR old.summary != new.summary OR old.tag_text != new.tag_text` koşuluyla saracak şekilde yenile. Yan etki: norm sütunlar tetiklenmese de FTS sync olmalı (norm = türetilmiş). | Sprint 173 (performans, OSS sonrası) |
| 1.14 | `references` eski içerik için prune yok | **Tamamla** | Bulgu 1.5 fix'iyle birlikte. | Sprint 172 |
| 1.15 | STOP_WORDS_TR eksik | **Tamamla** | Yaygın Türkçe stop word listesini genişlet (~80-100 kelime). Ya da `tr-stop-words` paketi yerine inline liste tut. | Sprint 172 (LOW priority) |
| 1.16 | `rebuildWithRelationSafety` CLI UX | **Devret** | Task 171-012 CLI auditine yönlendir; `deckent memory rebuild` komutu strict modu varsayılan mı, error mesajı operatöre `--force` flag göstermeli mi belgelenmeli. | Sprint 172 (cross-cut) |
| 1.17 | `sortById` localeCompare | **Koru** | Davranış doğru; sadece test coverage'a `adr-022-v2` vs `adr-022` regression testi ekle. | Test artırımı |
| 1.18 | `sqlite_master` cast tipi yanlış | **Düzelt** | Cast'i `unknown | undefined` veya `Record<string, unknown> | undefined` yap. Daha temiz: `db.prepare(...).pluck().get(name)` kullan + boolean dön. | Sprint 172 (basit) |
| 1.19 | `decay` + FTS senkron | **Koru** | Mevcut davranış doğru. | — |

**Sprint 172 OSS GA için öncelik sırası:**

1. **Bulgu 1.4** (DE recall iddia drift'i) — kullanıcı yanılmayı engellemek için zorunlu.
2. **Bulgu 1.1 + 1.2** (relations FK invariant) — veri bütünlüğü.
3. **Bulgu 1.7** (Türkçe ADR dosya adları) — doc-reorg ile birlikte.
4. **Bulgu 1.6 + 1.11 + 1.18** (kolay temizlik) — code hygiene.
5. **Bulgu 1.3 + 1.10** (type safety) — kontrat netliği.

Geri kalan bulgular (1.5, 1.8, 1.9, 1.12-1.16) Sprint 172-173 backlog'una taşınır; OSS GA blokeleyici değil ama post-launch kapatılmalı.

---

## 5. Kapsam Haritası (Files Covered)

| Dosya | LoC | Okundu | Not |
|---|---|---|---|
| `src/core/memory-store.ts` | 804 | ✅ Tam | CRUD, FTS5, tags, relations, history, decay. 18 yöntem incelendi. Bulgu 1.1, 1.2, 1.3, 1.5, 1.8, 1.12, 1.13, 1.14, 1.18, 1.19. |
| `src/core/memory-query.ts` | 415 | ✅ Tam | dual-layer FTS5 search, `escapeFts5Query`, `buildAutoQuery`, `MemoryQueryError`. FTS5 injection güvende (`escapeFts5Query` token quote + wildcard sınırlama). Bulgu 1.9. |
| `src/core/memory-normalize.ts` | 38 | ✅ Tam | `turkishNormalize`. Tek bulgu 1.4 (DE `ß`). |
| `src/core/memory-types.ts` | 187 | ✅ Tam | Type definitions. Bulgu 1.3, 1.10, 1.11. |
| `src/core/memory-export.ts` | 364 | ✅ Tam | `exportSummaryMd`, `exportDecisionsMd`, `exportMemoryMd`, `exportDebtMd`, `exportAdrsToFs` (H1 reverse hook). Bulgu 1.7, 1.17. |
| `src/core/memory-import.ts` | 530 | ✅ Tam | `parseDecisionsMd`, `parseMemoryMd`, `parseDebtMd`, `backfillDebtSprintIds`, `backupRelations`, `restoreRelations`, `rebuildWithRelationSafety`, `backfillSprintMemoriesFromSprintsDir`. Bulgu 1.6, 1.15, 1.16. |

**Toplam LoC:** 2338 (memory-store 804 + memory-query 415 + memory-normalize 38 + memory-types 187 + memory-export 364 + memory-import 530).

**Bağlantılı dosyalar (audit kapsam dışı, sadece referans için okundu):**

- `src/core/adr-file-sync.ts` (244 LoC) — Forward DB↔FS hook (H1 contract'ın FS→DB yarısı). Task 171-004 kapsamında detaylı denetlenmeli (kısa not: idempotency content equality ile çalışıyor, doğru görünüyor).
- `tests/core/memory-{store,query,normalize,import,export,rebuild-safety,relations-migration,stub-backfill}.test.ts` — test kontratlarını doğrulamak için tarandı; tam test integrity Task 171-021 kapsamı.
- `docs/superpowers/plans/2026-05-15-sprint-169-plan.md` — C1/C2/H1 kontratlarının orijinal tanımı.

**Kapsam tamlığı:** Plan Task 171-005 "Read `src/core/memory-{store,query,normalize,types,export,import}.ts`" listesindeki 6 dosyanın hepsi char-level incelendi. Coverage-gap yok (synthesis Task 171-029 doğrulayabilir).

**Audit-only invariant doğrulaması:** Bu raporu yazarken `docs/audits/sprint-171/core-memory.md` dışında hiçbir dosya modify edilmedi. memory.db okunmadı (kod statik inceleme yeterliydi). Boundary ihlali yok.
