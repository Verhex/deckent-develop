# Memory V2 — SQLite + FTS5 Şema Referansı

Memory V2, Deckent'in bilgi deposunu `.brain/memory.db` adlı bir SQLite veritabanında tutar.
Bu dosya tek kaynak-of-truth'tur; `.brain/exports/*.md` dosyaları yalnızca sprint sonu üretilen anlık görüntülerdir.
Veritabanı `better-sqlite3` ile açılır, `WAL` journal modu ve `foreign_keys = ON` pragma'ları aktiftir.

---

## Tablolar

### 1. `entries` — Ana Bilgi Deposu

Her türlü proje bilgisi buraya yazılır. Şu anda ~174 satır içerir.

| Sütun | Tip | Açıklama |
|-------|-----|----------|
| `id` | TEXT PK | İnsan okunabilir tanımlayıcı (örn. `adr-008`, `sprint-152`) |
| `type` | TEXT | `adr`, `memory`, `sprint`, `debt`, `pattern`, `retro`, `error`, `identity`, `custom` |
| `source` | TEXT | Kaydı oluşturan: `system`, `brain`, `worker`, `user`, `import` |
| `title` | TEXT | Başlık (orijinal metin) |
| `content` | TEXT | Tam içerik (orijinal metin) |
| `summary` | TEXT? | Özet (opsiyonel) |
| `tag_text` | TEXT | Etiketler boşlukla birleştirilmiş (FTS için) |
| `title_norm` | TEXT | `turkishNormalize(title)` — FTS5 ASCII katmanı |
| `content_norm` | TEXT | `turkishNormalize(content)` |
| `summary_norm` | TEXT | `turkishNormalize(summary)` |
| `tag_norm` | TEXT | `turkishNormalize(tag_text)` |
| `status` | TEXT | `active`, `accepted`, `deprecated`, `superseded`, `proposed`, `rejected`, `resolved`, `archived` |
| `priority` | TEXT | `normal`, `high`, `critical` (varsayılan: `normal`) |
| `sprint_id` | TEXT? | Bağlı sprint kimliği (örn. `sprint-152`) |
| `sprint_num` | INTEGER | Sayısal sprint numarası; decay ve range query'de kullanılır |
| `lang` | TEXT | `tr`, `en` (varsayılan: `en`) |
| `decay_exempt` | INTEGER | `1` = asla silinme (ADR, identity); `0` = decay'e tabi |
| `metadata` | TEXT | JSON blob — serbest alan |
| `created_at` | TEXT | ISO 8601 UTC |
| `updated_at` | TEXT | Son güncelleme |
| `deleted_at` | TEXT? | Soft-delete damgası; `NULL` = aktif |

**Nasıl sorgulanır?**

```sql
-- Tüm aktif ADR'leri getir
SELECT id, title, status FROM entries
WHERE type = 'adr' AND deleted_at IS NULL
ORDER BY id;

-- Sprint 140 sonrası yazılan memory kayıtları
SELECT title, summary FROM entries
WHERE type = 'memory' AND sprint_num >= 140 AND deleted_at IS NULL;
```

TypeScript API'si:

```typescript
const store = new MemoryStore('.brain/memory.db');
const adrs = store.getByType('adr');          // MemoryEntryV2[]
const entry = store.getById('adr-008');        // MemoryEntryV2 | null
```

---

### 2. `entries_fts` — FTS5 Sanal Tablosu

`entries` tablosuna bağlı bir FTS5 "content table" (içerik tablosu). Sekiz sütun içerir:

```
title, content, summary, tag_text        ← orijinal metin
title_norm, content_norm, summary_norm, tag_norm  ← turkishNormalize() çıktısı
```

`tokenize='unicode61 remove_diacritics 2'` ile konfigüre edilmiştir.
`entries_ai`, `entries_ad`, `entries_au` trigger'ları `entries`'a yapılan her INSERT/UPDATE/DELETE işlemini otomatik olarak FTS5 indeksine yansıtır.

**Çift Katmanlı Arama:** Her sorgu hem orijinal hem de normalize sütunlara OR mantığıyla uygulanır. Böylece `"brain import"` sorgusu Türkçe `"Brain merkezi import kuralı"` içeriğiyle eşleşir.

```sql
-- Doğrudan FTS5 sorgusu
SELECT e.id, e.title, entries_fts.rank
FROM entries_fts
INNER JOIN entries e ON e.rowid = entries_fts.rowid
WHERE entries_fts MATCH '{"title content summary tag_text"}: ("docker") OR {"title_norm content_norm summary_norm tag_norm"}: ("docker")'
ORDER BY entries_fts.rank;
```

TypeScript API'si (`searchMemory`):

```typescript
import { searchMemory } from './core/memory-query.js';

const results = searchMemory(store, {
  text: 'docker heartbeat',    // FTS5 MATCH
  type: ['adr', 'memory'],
  status: ['accepted'],
  sprint_range: { min: 135 },
  limit: 5,
});
// → MemorySearchResult[] — { entry, relevance, snippet? }
```

---

### 3. `tags` — Etiket İlişki Tablosu

```sql
CREATE TABLE tags (
  entry_id TEXT NOT NULL,
  tag      TEXT NOT NULL COLLATE NOCASE,
  PRIMARY KEY (entry_id, tag),
  FOREIGN KEY (entry_id) REFERENCES entries(id) ON DELETE CASCADE
);
```

`entries` silindiğinde `ON DELETE CASCADE` ile etiketler de temizlenir.
`COLLATE NOCASE` büyük/küçük harf duyarsız eşleştirme sağlar.

```sql
-- "security" etiketli tüm girişler
SELECT e.id, e.title FROM entries e
INNER JOIN tags t ON t.entry_id = e.id
WHERE t.tag = 'security';
```

```typescript
// tags_contain: giriş TÜM belirtilen etiketlere sahip olmalı
const results = searchMemory(store, { tags_contain: ['security', 'auth'] });
```

---

### 4. `relations` — Çapraz Referanslar

```sql
CREATE TABLE relations (
  from_id   TEXT NOT NULL,
  to_id     TEXT NOT NULL,
  rel_type  TEXT NOT NULL,   -- references | supersedes | caused_by | resolves | blocks | depends_on
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (from_id, to_id, rel_type)
);
```

İçerik yazılırken `adr-XXX` kalıpları otomatik olarak `references` ilişkisi oluşturur.

```sql
-- adr-008'e referans veren tüm girişler
SELECT from_id, rel_type FROM relations WHERE to_id = 'adr-008';
```

---

### 5. `entry_history` — Alan Düzeyinde Değişiklik Takibi

```sql
CREATE TABLE entry_history (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_id    TEXT NOT NULL,
  field       TEXT NOT NULL,      -- '*' = create/delete, 'status', 'content' vb.
  old_value   TEXT,
  new_value   TEXT,
  changed_by  TEXT NOT NULL,      -- 'system', 'brain', 'worker'
  change_type TEXT NOT NULL,      -- create | update | soft_delete | restore | decay
  changed_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
```

Her `INSERT`, `UPDATE` (soft-delete dahil) işleminde ilgili alan kaydı düşülür. `decay` işlemi toplu soft-delete oluştururken de bu tabloya yazar.

```sql
-- Bir girişin tüm değişiklik geçmişi
SELECT field, old_value, new_value, change_type, changed_at
FROM entry_history
WHERE entry_id = 'adr-027'
ORDER BY changed_at;
```

---

### 6. `schema_version` — Migrasyon Güvenliği

```sql
CREATE TABLE schema_version (
  version    INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);
```

Şu anda tek satır içerir: `version = 1`. `MemoryStore` başlatılırken versiyon kontrol edilir; ilerideki migrasyon betikleri bu tabloya yeni satır ekleyerek şema yükseltmelerini izler.

---

## İndeksler

Performans için oluşturulan örtük indeksler:

| İndeks | Sütun(lar) | Açıklama |
|--------|-----------|----------|
| `idx_entries_type` | `type` | `getByType()` hızlandırır |
| `idx_entries_status` | `status` | Durum filtreli sorgular |
| `idx_entries_sprint_num` | `sprint_num` | Aralık filtreleri |
| `idx_entries_decay` | `(decay_exempt, sprint_num)` | Decay tarama |
| `idx_entries_active` | `deleted_at WHERE IS NULL` | Partial index — aktif kayıt sorguları |
| `idx_tags_tag` | `tag` | Etiket araması |
| `idx_relations_to` | `to_id` | Ters referans araması |
| `idx_history_entry` | `entry_id` | Geçmiş sorgulama |

---

## CLI Arayüzü

```bash
deckent recall "docker heartbeat"    # FTS5 arama
deckent remember "not al"            # Yeni kayıt ekle
deckent memory stats                 # DB istatistikleri (satır sayısı, boyut)
deckent memory export                # .md anlık görüntülerini yeniden üret
deckent memory rebuild               # DB'yi .md dosyalarından sıfırdan kur
```
