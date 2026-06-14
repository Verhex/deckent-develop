# Model Registry & Multi-Provider — Tek Kaynak, Sınırsız Sağlayıcı

> Provider hangisi olursa olsun deckent aynı tier'ı çalıştırır — model seçimi konfigürasyondan bağımsız çalışır.

## Ne işe yarar?

- **Tek kaynak gerçeği:** `src/core/model-registry.ts` tüm model tanımlarını tutar; başka modül buradan okur.
- **14 hazır model** — 3 provider (Claude / OpenAI-Codex / Gemini) × 4 tier (economy / standard / premium / premium_plus). Claude'da 4 model, OpenAI'de 6, Gemini'de 4.
- **Tier eşdeğerliği:** `getEquivalent()` ile `opus → gpt-5 → gemini-2.5-pro` otomatik cross-map.
- **Canlı katalog:** `bootstrapFromCatalog()` 24s cache ile models.dev'den çeker; başarısız olursa yerleşik `BUILTIN_MODELS` devreye girer.
- **Ollama opt-in:** yerel LLM'ler ayrı `ollama-models.ts`'te tutulur — 3-provider değişmezi korunur. Dinamik Ollama tag'leri (`ensureOllamaModelRegistered`) runtime'da kaydedilir.

## Neden önemli?

- **Provider lock-in yok:** DIRECTIVES'te `model: opus` yazar, config'i `worker_provider: codex`'e alırsın — deckent `gpt-5`'e geçer, kod değişmez.
- **Tier-agnostic config:** `brain_tier: premium` gibi soyut değerler; model isimleri config'de hardcode olmaz (ADR-023).
- **Yerleşik güvenlik ağı:** API veya ağ yokken bile `BUILTIN_MODELS`'den çalışmaya devam eder.

## Nasıl çalışır?

```
DIRECTIVES  →  model: sonnet
                    │
             TaskRouter.routeTask()
                    │
         ModelRegistry.getByProviderAndTier()
                    │
         provider=claude? → claude-sonnet-4-6
         provider=codex?  → gpt-4.1
         provider=gemini? → gemini-2.5-flash
```

Tier tablosu (kaynak: `model-registry.ts` `BUILTIN_MODELS`):

| Tier | Claude | OpenAI-Codex | Gemini |
|------|--------|--------------|--------|
| premium_plus | fable | o3 | gemini-3.1-pro-preview |
| premium | opus | gpt-5 | gemini-2.5-pro |
| standard | sonnet | gpt-4.1 / o4-mini | gemini-2.5-flash |
| economy | haiku | gpt-5-mini / gpt-4.1-mini | gemini-2.0-flash |

**Claude model API ID'leri** (kaynak: `BUILTIN_MODELS`):
| ID | API ID | Tier |
|----|--------|------|
| `fable` | `claude-fable-5` | premium_plus |
| `opus` | `claude-opus-4-8` | premium |
| `sonnet` | `claude-sonnet-4-6` | standard |
| `haiku` | `claude-haiku-4-5-20251001` | economy |

## Komut / Örnek

```bash
# Mevcut provider'ı kontrol et
deckent config read | grep provider

# Provider değiştir (runtime — build gerekmez)
deckent config set worker_provider codex

# Bir sonraki sprint otomatik olarak tier-eşdeğer OpenAI modelini kullanır
deckent start

# Model listesini göster (REPL'den)
deckent models list
```

Provider-agnostic config örneği (`.deckent/config.json`):
```json
{
  "brain_tier": "premium",
  "worker_tier": "standard",
  "worker_provider": "claude"
}
```

## Durum

- Olgunluk: ✅ canlı
- İlgili: ADR-023 · ADR-066 · ADR-077 · ADR-089
- Modül: `src/core/model-registry.ts` · `src/core/mode-presets.ts` · `src/core/ollama-models.ts`
- Kaynak: `BUILTIN_MODELS` — 14 model, 3 provider (Ollama opt-in ayrı, `OLLAMA_BUILTIN_MODELS`)
