# Model Registry ve Tier Sistemi

deckent, tüm model tanımlarını tek bir kaynaktan yönetir: `src/core/model-registry.ts`. Bu dosya, model kimliği, provider, tier, bağlam penceresi, maliyet ve yetenek bilgilerini içeren kanonik katalogdur. Diğer tüm modüller (task-types, task-router, provider adaptörleri) buraya delege eder; hiçbir modül kendi model listesini barındırmaz.

---

## Tek Doğruluk Kaynağı

`ModelRegistry` sınıfı ve `BUILTIN_MODELS` sabit dizisi `model-registry.ts`'in çekirdeğidir:

```
src/core/model-registry.ts
  └── BUILTIN_MODELS (readonly ModelDefinition[])  ← bundled snapshot
  └── ModelRegistry class                          ← CRUD + lookup API
  └── modelRegistry (singleton)                    ← uygulama genelinde paylaşılan örnek
  └── bootstrapFromCatalog()                       ← models.dev → 24s cache → bundled fallback
```

Uygulama başlangıcında `bootstrapFromCatalog()` çağrılır. Bu fonksiyon önce `models.dev` canlı kataloğunu dener; başarısız olursa 24 saniyelik önbelleğe düşer, o da yoksa bundled `BUILTIN_MODELS`'i kullanır. Böylece sistem her zaman geçerli bir model listesiyle çalışır.

---

## Bundled Model Kataloğu (Kaynak: BUILTIN_MODELS dizisi)

`model-registry.ts` satır 60–215 incelendiğinde tam olarak **14 bundled model** bulunur:

### Claude (4 model)

| ID | API ID | Tier | Bağlam | Durum |
|----|--------|------|--------|-------|
| `fable` | `claude-fable-5` | premium_plus | 1M token | ga |
| `opus` | `claude-opus-4-8` | premium | 1M token | ga |
| `sonnet` | `claude-sonnet-4-6` | standard | 200K token | ga |
| `haiku` | `claude-haiku-4-5-20251001` | economy | 200K token | ga |

### Codex / OpenAI (6 model)

| ID | API ID | Tier | Bağlam | Durum |
|----|--------|------|--------|-------|
| `o3` | `o3` | premium_plus | 200K token | ga |
| `gpt-5` | `gpt-5.5` | premium | 1M token | ga |
| `gpt-4.1` | `gpt-4.1` | standard | 1M token | ga |
| `o4-mini` | `o4-mini` | standard | 200K token | ga |
| `gpt-5-mini` | `gpt-5-mini` | economy | 1M token | ga |
| `gpt-4.1-mini` | `gpt-4.1-mini` | economy | 1M token | ga |

### Gemini (4 model)

| ID | API ID | Tier | Bağlam | Durum |
|----|--------|------|--------|-------|
| `gemini-3.1-pro-preview` | `gemini-3.1-pro-preview` | premium_plus | 2M token | preview |
| `gemini-2.5-pro` | `gemini-2.5-pro` | premium | 1M token | ga |
| `gemini-2.5-flash` | `gemini-2.5-flash` | standard | 1M token | ga |
| `gemini-2.0-flash` | `gemini-2.0-flash` | economy | 1M token | ga |

**Not:** Ollama modelleri `ollama-models.ts`'te ayrı tanımlanır; `BUILTIN_MODELS`'e dahil edilmez. Bu, 3-provider kanonik kataloğun bütünlüğünü korur.

---

## 4 Tier Sistemi

deckent, modelleri 4 kademeli tier sistemiyle sınıflandırır:

```
premium_plus  ─── En yüksek yetenek, ileri muhakeme
premium       ─── Karmaşık görevler, mimari kararlar
standard      ─── Genel geliştirme, dengeli maliyet
economy       ─── Basit görevler, düşük maliyet
```

### Tier Denklik Tablosu

| Tier | Claude | Codex | Gemini |
|------|--------|-------|--------|
| `premium_plus` | `fable` | `o3` | `gemini-3.1-pro-preview` |
| `premium` | `opus` | `gpt-5` | `gemini-2.5-pro` |
| `standard` | `sonnet` | `gpt-4.1` / `o4-mini` | `gemini-2.5-flash` |
| `economy` | `haiku` | `gpt-5-mini` / `gpt-4.1-mini` | `gemini-2.0-flash` |

Denklik, `getEquivalent(modelId, targetProvider)` metodu aracılığıyla kullanılır. Provider geçişlerinde deckent aynı tier'daki karşılık modeli seçer; o tier'da model yoksa bir alt tier'a iner.

---

## Tier Bazlı Yönlendirme

DIRECTIVES'de model yerine tier belirtmek mümkündür:

```markdown
- Model: sonnet          # doğrudan model id
```

`brain_tier` / `worker_tier` config anahtarlarıyla provider-agnostik tier isimi kullanılabilir:

```json
{
  "brain_tier": "premium",
  "worker_tier": "standard"
}
```

Bu yapılandırmayla Claude kullanan bir ortamdan Codex'e geçmek, model id'yi değiştirmek gerekmez; sistem tier denkliğini otomatik çözer.

---

## ModelRegistry API (Özet)

```typescript
const registry = modelRegistry; // singleton

registry.get('sonnet')                         // ModelDefinition | undefined
registry.getOrThrow('sonnet')                  // ModelDefinition (yoksa throw)
registry.getByProvider('claude')               // Claude modelleri listesi
registry.getByTier('standard')                 // standard tier modeller
registry.getEquivalent('sonnet', 'gemini')     // 'gemini-2.5-flash' döner
registry.resolveApiId('gpt-5')                 // 'gpt-5.5' döner (wire id)
registry.estimateCost('opus', 10000, 2000)     // tahmini USD maliyet
```

---

## models.dev Entegrasyonu

`bootstrapFromCatalog()` fonksiyonu (`src/core/model-catalog.ts` üzerinden) şu sırayla çalışır:

1. **models.dev canlı kataloğu** — güncel model listesi ve fiyatlar.
2. **24 saniyelik önbellek** — disk cache, tekrar eden API çağrılarını önler.
3. **Bundled fallback** — `BUILTIN_MODELS` — ağ erişimi olmadığında da sistem çalışır.

`mode: 'merge'` (varsayılan) seçeneğinde katalog verileri bundled modellerin üzerine yazılır; bundled'da olup katalogda bulunmayan modeller korunur. `mode: 'replace'` atomik takas yapar.
