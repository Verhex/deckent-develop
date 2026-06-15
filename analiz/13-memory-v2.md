# Memory V2 — DB-First Hafıza Mimarisi

deckent, sprint geçmişini, mimari kararları (ADR), teknik borçları, örüntüleri ve kimlik bilgisini tek bir SQLite veritabanında saklar. `.brain/memory.db`, tüm beyin bilgisinin tek kaynağıdır; `.brain/exports/*.md` dosyaları git incelemesi için üretilmiş dışa aktarımlardır — kaynak değil. Bu tasarım ADR-088'de resmileştirilmiştir.

---

## Neden DB-First?

İlk 135+ sprint boyunca tüm beyin bilgisi `.brain/DECISIONS.md`, `MEMORY.md`, `RETRO.md`, `DEBT.md` gibi elle yazılan markdown tablolarında tutuldu. Sorunlar:

- 96K satırlık ADR dosyası — arama mümkün değil
- Merge çakışmaları
- Çürüme: içerik git logunda kayboldu, silinen kayıtlar kalıcı olarak gitti
- Türkçe karakterlerde arama başarısız

Memory V2 (ADR-088) bu sorunları SQLite'a geçişle çözdü.

---

## Temel Bileşenler

### MemoryStore (`src/core/memory-store.ts`)

`better-sqlite3` üzerine inşa edilmiş, aşağıdakileri sağlayan sarmalayıcı sınıf:

- FTS5 tam metin arama
- Etiket (tag) yönetimi ve çok-to-çok ilişkilendirme
- Alan düzeyinde değişiklik takibi (entry_history)
- Soft-delete ve decay yaşam döngüsü
- HMAC tabanlı denetim izi

```typescript
const store = new MemoryStore('.brain/memory.db');
store.insert({ type: 'adr', title: 'TypeScript + ESM', status: 'accepted', ... });
store.getByType('adr').filter(a => a.status === 'accepted');
```

Tüm yazma işlemleri `MemoryStore.insert/upsert/update` üzerinden geçer. Doğrudan SQL `UPDATE` yasaktır — normalize, FTS5 senkronizasyonu ve denetim zinciri bozulur.

### Veritabanı Şeması

5 tablo + 1 FTS5 sanal tablo:

| Tablo | Amaç |
|-------|------|
| `entries` | Ana bilgi tablosu (ADR, memory, sprint, debt, pattern, retro, identity, chat, audit) |
| `tags` | Normalleştirilmiş çoktan-çoka etiket ilişkisi |
| `relations` | Çapraz referanslar: `references`, `supersedes`, `caused_by`, `resolves`, `blocks`, `depends_on` |
| `entry_history` | Alan düzeyinde değişiklik takibi |
| `schema_version` | Migrasyon güvenliği |

```sql
-- FTS5 sanal tablo: 8 sütun (4 orijinal + 4 turkishNormalize karşılığı)
entries_fts(title, content, summary, tag_text,
            title_norm, content_norm, summary_norm, tag_norm)
```

### Entry Türleri

`EntryType` (`src/core/memory-types.ts`):

- `adr` — mimari karar kaydı
- `memory` — sprint öğrenimleri
- `sprint` — sprint log
- `debt` — teknik borç
- `pattern` — ihlal/davranış deseni
- `retro` — retrospektif
- `identity` — proje kimliği
- `chat` — REPL konuşma geçmişi
- `audit` — denetim olayı

---

## Dual-Layer FTS5 Arama

### Sorun: Türkçe Karakterler

SQLite FTS5 `unicode61` tokenizer, Türkçe `I/İ/ı/i` büyük-küçük dönüşümünü doğru işleyemez. Standart arama `"sprint"` sorgusunu `"Sprint"` içeriğiyle eşleştiremez, Türkçe büyük harfli `İ` ile `i` arasında körlük yaşar.

### Çözüm: turkishNormalize() (`src/core/memory-normalize.ts`)

Her kayıt yazılırken hem orijinal metin hem de normalleştirilmiş karşılığı saklanır:

```typescript
export function turkishNormalize(text: string): string {
  return text
    .replace(/I/g, 'ı')   // Türkçe: I → ı
    .replace(/İ/g, 'i')   // Türkçe: İ → i
    // ... diğer Türkçe karakterler
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')  // diakritik işaretleri sil
    .replace(/ı/g, 'i').replace(/ş/g, 's') // ... vs.
}
```

### Arama Akışı (`src/core/memory-query.ts`)

`searchMemory()` çift katmanlı sorgu çalıştırır:

```
Sorgu: "brain import"
  ├─ Layer 1: entries_fts MATCH '"brain" OR "import"'   (orijinal sütunlar)
  └─ Layer 2: entries_fts MATCH '"brain" OR "import"'   (norm sütunlar, turkishNormalize uygulanmış)
  → Birleşim → TR/EN/DE ~%100 geri çağırma oranı
```

Doğru FTS5 sorgu biçimi:
```sql
SELECT e.* FROM entries_fts f
JOIN entries e ON e.rowid = f.rowid
WHERE entries_fts MATCH ?
```

`buildAutoQuery()`: Brain'in sprint PLAN/SPAWN/EVALUATE fazlarında görev DNA'sından otomatik bellek sorgusu üretir.

---

## Decay (Çürüme) Mekanizması

`store.decay(currentSprintNum, decayAfterSprints)`: `decay_exempt=false` olan eski kayıtları soft-delete ile işaretler. Kalıcı kayıtlar (ADR'ler, kimlik) `decay_exempt=1` ile korunur.

---

## CLI Komutları

```bash
deckent recall "docker heartbeat"   # FTS5 dual-layer arama
deckent remember "önemli not"       # Yeni memory girişi ekle
deckent memory rebuild               # .md dosyalarından DB yeniden inşa et
deckent memory export                # DB → .md anlık görüntüleri oluştur
deckent memory stats                 # DB istatistikleri
```

## MCP Aracı

`deckent_memory_query`: MCP üzerinden çapraz kaynak hafıza araması. Proje entegrasyonlarında Brain bilgisine erişim sağlar.

---

## Git Entegrasyonu

| Dosya | Durum | Açıklama |
|-------|-------|----------|
| `.brain/memory.db` | gitignored | Canlı kaynak, `memory rebuild` ile yeniden oluşturulabilir |
| `.brain/exports/summary.md` | git-tracked | CLAUDE.md referansı ile otomatik yüklenir |
| `.brain/exports/decisions.md` | git-tracked | ADR listesi, `lint:adr` tarafından doğrulanır |
| `.brain/exports/memory.md` | git-tracked | Sprint öğrenimleri anlık görüntüsü |
| `.brain/exports/debt.md` | git-tracked | Teknik borç tablosu |
| `docs/adr/*.md` | git-tracked | ADR authoring yüzeyi — DB'ye `syncAdrFilesToDb` ile senkronize |

---

## Konfigürasyon

`.deckent/config.json` içinde:

```json
{
  "memory": {
    "backend": "sqlite",
    "search": "fts5",
    "decay_after_sprints": 20
  }
}
```
