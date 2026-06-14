# Memory V2 — DB-First Proje Hafızası

> Deckent her sprint sonunda öğrendiklerini unutmaz — ADR'ler, retro'lar, borç kayıtları tek bir SQLite veritabanında yaşar ve çok dilli arama ile geri çağrılır.

## Ne işe yarar?

- **SQLite DB-first:** `.brain/memory.db` tek kaynak gerçeği — ADR / sprint / retro / pattern / debt tüm tipler burada.
- **FTS5 tam-metin arama:** yerleşik tokenizer + dual-layer indeks ile Türkçe, İngilizce, Almanca sorgular eşleşir.
- **Dual-layer normalize:** orijinal metin + `turkishNormalize()` ASCII-katlanmış sütun paralel sorgulanır → yüksek geri-çağırma oranı.
- **Decay yaşam döngüsü:** eski kayıtlar sprint budgeti aşılınca yumuşak silinir; `decay_exempt` alanı korumalı girdileri saklar.
- **Git-tracked exports:** `.brain/exports/` içindeki `.md` dosyaları otomatik oluşturulur, commit'lenebilir; DB gitignore'da.

## Neden önemli?

- **Bağlam tasarrufu (~%96 iddia):** orijinal flat-DECISIONS.md yaklaşımı 96K satırdı; DB + FTS5 ile yalnızca ilgili ADR'ler çekilir (kaynak: MASTER-PLAN §W-H — benchmark dosyası henüz doğrulanmadı, iddia olarak işaretlendi).
- **Dil bağımsız arama:** `deckent recall "brain import kuralı"` ya da `deckent recall "brain import rule"` aynı ADR'i bulur.
- **Sıfır kurulum:** `better-sqlite3` yerleşik, dış DB sunucusu yok, her proje kendi `.brain/memory.db`'sine sahip (ADR-034 per-project isolation).

## Nasıl çalışır?

```
Sprint biter
      │
  Brain.writeRetro()
      │
  MemoryStore.insert({ type: 'retro', sprint_id, content })
      │                      │
      │              FTS5 indeksle (orijinal + norm sütun)
      │
  deckent recall "hata"
      │
  searchMemory({ text: 'hata' })
      │
  FTS5 MATCH orijinal  OR  FTS5 MATCH turkishNormalize('hata')
      │
  Sonuçlar: ilgili ADR, retro, pattern
```

5-tablo şeması + 1 FTS5 sanal tablo (`memory-store.ts`):
- `entries` — tüm bilgi türleri (adr/memory/retro/debt/pattern/sprint/identity/chat) + additive-migration sütunları: `tenant_id`, `audit_prev_hmac`, `audit_hmac`
- `tags` — çoktan-çoğa etiket ilişkisi (NOCASE collation)
- `relations` — çapraz referans (references / supersedes / caused_by / resolves / blocks / depends_on)
- `entry_history` — alan-düzeyinde değişiklik kaydı (changed_by, change_type, old/new_value)
- `schema_version` — migrasyon güvenliği (sürüm: 1)
- `entries_fts` — FTS5 sanal tablo (8 sütun: title/content/summary/tag_text + title_norm/content_norm/summary_norm/tag_norm; tokenize='unicode61 remove_diacritics 2')

## Komut / Örnek

```bash
# Hafızada ara (Türkçe veya İngilizce)
deckent recall "docker heartbeat"
deckent recall "ADR-037 authority"

# Not ekle
deckent remember "Sprint 230 sonrası tmux session sorunu araştır"

# DB'yi .md export'lardan yeniden oluştur (CI / temiz checkout)
deckent memory rebuild

# DB → .md export'larını güncelle (git commit için)
deckent memory export

# İstatistikler
deckent memory stats
```

MCP ile:
```
deckent_memory_query { "text": "routing engine", "type": ["adr"] }
```

## Durum

- Olgunluk: ✅ canlı
- İlgili: ADR-034 (per-project isolation) · ADR-088 (Memory V2 DB-First Architecture)
- Modül: `src/core/memory-store.ts` · `src/core/memory-query.ts` · `src/core/memory-normalize.ts` · `src/core/memory-export.ts` · `src/core/memory-import.ts`
- Not: `~%96 bağlam azalması` iddiası — benchmark dosyası (`docs/benchmark/memory-v2.md`) henüz yok. Ölçüm sonrası kesin değer eklenecek.
