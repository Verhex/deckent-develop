# deckent_memory_query — MCP Tool Referansı

## Genel Bakış

`deckent_memory_query`, Deckent projesinin birikimli bilgi tabanında arama yapan salt okunur bir MCP aracıdır. Mimari kararlar (ADR), sprint öğrenimleri, teknik borç kayıtları, retrospektifler ve proje desenleri gibi tüm hafıza türlerini **tek bir sorguda** tarar. Arka planda SQLite `better-sqlite3` ile çalışır ve FTS5 tam metin araması ile yapısal filtreler birlikte kullanılır.

Araç **Memory V2 DB-First** mimarisinin dış yüzüdür. `.brain/memory.db` veritabanı birincil kaynaktır; `.brain/exports/*.md` dosyaları yalnızca git-diff ve bağlam enjeksiyonu için üretilen anlık görüntülerdir. Tüm gerçek zamanlı sorgular doğrudan SQLite'a gider.

---

## Parametreler

| Parametre | Tip | Varsayılan | Açıklama |
|-----------|-----|-----------|---------|
| `query` | `string` | — | Aranacak metin. FTS5 MATCH ifadesine dönüştürülür. |
| `type` | `string[]` | (tümü) | Giriş türü filtresi. Geçerli değerler: `adr`, `memory`, `sprint`, `debt`, `pattern`, `retro`, `error`, `identity`, `custom`. Birden fazla değer OR mantığıyla uygulanır. |
| `status` | `string[]` | (tümü) | Durum filtresi. Geçerli değerler: `active`, `accepted`, `deprecated`, `superseded`, `proposed`, `rejected`, `resolved`, `archived`. |
| `limit` | `number` | `5` | Döndürülecek maksimum sonuç sayısı. |
| `sprint_min` | `number` | — | Bu sprint numarasından büyük veya eşit kayıtları filtreler. Örneğin son 10 sprintte eklenen ADR'leri bulmak için kullanılır. |
| `mode` | `'and' \| 'or'` | `'or'` | FTS5 token birleştirme modu. `or`: herhangi bir token eşleşirse sonuç döner (geniş geri çağırma). `and`: tüm tokenlar eşleşmeli (kesin eşleşme). |
| `root` | `string` | `process.cwd()` | Proje kök dizini. Belirtilmezse çalışma dizini kullanılır. |

---

## Nasıl Çalışır?

### 1. Çift Katmanlı FTS5 Arama

`query` verildiğinde araç iki paralel FTS5 MATCH ifadesi çalıştırır:

- **Orijinal katman** — `{title content summary tag_text}` sütunları arasında kullanıcının girdiği metni arar.
- **Normalize edilmiş katman** — `{title_norm content_norm summary_norm tag_norm}` sütunlarında `turkishNormalize()` uygulanmış metni arar.

Bu yaklaşım sayesinde Türkçe büyük/küçük harf ve aksanlı karakter farklılıkları (ş→s, ğ→g, ı→i vb.) arama sonuçlarını etkilemez. `"brain import"` sorgusu, Türkçe içerikte geçen `"Brain merkezi import kuralı"` ifadesini bulabilir.

### 2. Yapısal Filtreler

`query` yoksa veya yanında ek filtreler belirtilmişse araç SQL `WHERE` cümleleri oluşturur: `type IN (...)`, `status IN (...)`, `sprint_num >= ...`. Silinmiş (soft-delete) kayıtlar varsayılan olarak hariç tutulur.

### 3. Sıralama ve Snippet

FTS5 yolunda sonuçlar `rank` değerine (alaka puanı) göre sıralanır. Her sonuç için üç sütundan (`title`, `content`, `tag_text`) snippet üretilir; en iyi eşleşme içeren snippet `>>>` / `<<<` işaretçileriyle döner.

---

## Type Filtreleri

| Tür | Açıklama |
|-----|---------|
| `adr` | Architecture Decision Record — kabul edilmiş mimari kararlar (ADR-001…ADR-042+). |
| `memory` | Sprint öğrenimleri — her sprint sonunda Brain tarafından eklenen kısa notlar. |
| `sprint` | Sprint meta verisi — süre, görev sayısı, başarı oranı. |
| `debt` | Teknik borç kayıtları — açık ve çözülmüş borç maddeleri. |
| `pattern` | Auditor tarafından tespit edilen kod/süreç desenleri. |
| `retro` | Retrospektif özeti — sprint sonu değerlendirme raporu. |
| `error` | Hata günlüğü — `.brain/ERRORS.md` kaynaklı kritik hatalar. |
| `identity` | Proje kimliği — `PROJECT-IDENTITY.md` içeriği, `decay_exempt=true`. |
| `custom` | Kullanıcı tanımlı özel kayıtlar. |

---

## Recall ve Promote Ayrımı

**Recall (geri çağırma)** → `deckent_memory_query` / `deckent recall "sorgu"` komutu ile gerçekleşir. Veritabanından salt okuma yapılır, herhangi bir değişiklik yapılmaz. Bu araç her zaman `readOnlyHint: true` olarak kayıtlıdır; herhangi bir yazma işlemi tetiklemez.

**Promote (kaydetme / yükseltme)** → `deckent remember "not"` CLI komutu veya `store.insert()` / `store.upsert()` çağrısı ile gerçekleşir. Brain, her sprint sonunda `type: 'memory'` kayıtları ve `type: 'retro'` güncellemeleri ekleyerek hafızayı zenginleştirir. Kullanıcılar `deckent remember` ile manuel kayıt ekleyebilir. Bu sayede ilerleyen sprintlerde `deckent_memory_query` ile o bilgiye ulaşılabilir.

Kısaca: `memory_query` **okur**, `remember` **yazar**. İkisi birlikte Brain'in kendini geliştirme döngüsünü oluşturur.

---

## Yanıt Formatı

### Sonuç Bulundu

```
1. [adr] **ADR-008: Brain Merkezi Import — Tek Yönlü Bağımlılık** (sprint-008)
   Brain is the ONLY module that imports from tmux, auditor, worker. Circular deps FORBIDDEN.

2. [memory] **Sprint sprint-136 — Brain Import Cleanup** (sprint-136)
   sprint-controller.ts slim edildi: 1890→209 LoC. ADR-008 uyumu sağlandı.
```

### Sonuç Bulunamadı

```
No results for "örnek sorgu".
```

### Veritabanı Bulunamadı

```
Memory V2 DB not found. Run migration first.
```

---

## Kullanım Örnekleri

### Tüm Türlerde Genel Arama

```json
{
  "tool": "deckent_memory_query",
  "arguments": { "query": "docker heartbeat fix" }
}
```

### Yalnızca Kabul Edilmiş ADR'ler

```json
{
  "tool": "deckent_memory_query",
  "arguments": {
    "query": "spawn backend",
    "type": ["adr"],
    "status": ["accepted"]
  }
}
```

### Son 10 Sprintteki Teknik Borç

```json
{
  "tool": "deckent_memory_query",
  "arguments": {
    "query": "coverage worker timeout",
    "type": ["debt", "memory"],
    "sprint_min": 145,
    "limit": 10
  }
}
```

### Kesin Eşleşme Modu (AND)

```json
{
  "tool": "deckent_memory_query",
  "arguments": {
    "query": "FTS5 normalization turkish",
    "mode": "and",
    "type": ["adr", "pattern"]
  }
}
```

---

## CLI Karşılığı

```bash
# deckent recall — aynı FTS5 aramasını CLI üzerinden çalıştırır
deckent recall "docker heartbeat"
deckent recall "ADR-037" --type adr
```

---

## İlgili Araçlar

- **`deckent_retro`** — Son sprint retrospektifini döndürür (hafıza sorgusu gerektirmez)
- **`deckent_history`** — Sprint listesini döndürür
- **`deckent memory export`** — DB'yi `.brain/exports/*.md` anlık görüntülerine aktarır
- **`deckent memory rebuild`** — `.md` dosyalarından DB'yi yeniden oluşturur
