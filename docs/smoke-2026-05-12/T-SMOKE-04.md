# T-SMOKE-04: Multi-Provider Routing

> Deckent'in çoklu AI sağlayıcı mimarisi — Claude, Codex ve Gemini'yi tek bir sprint döngüsünde nasıl yönetir.

---

## Genel Bakış

Deckent, tek bir sağlayıcıya bağımlı kalmadan farklı AI modellerini görevlere yönlendirebilen bir **multi-provider** mimarisiyle tasarlanmıştır. Bu yaklaşım; maliyet optimizasyonu, kapasite esnekliği ve sağlayıcı arızalarına karşı dayanıklılık sağlar. Şu an üç sağlayıcı desteklenmektedir:

| Sağlayıcı | Backend | Kimlik Doğrulama | Durum |
|-----------|---------|-----------------|-------|
| **Claude** | Claude Code (tmux) | Oturum tabanlı | Varsayılan |
| **Codex** | OpenAI API | `OPENAI_API_KEY` env var | İsteğe bağlı |
| **Gemini** | Google AI API | `GOOGLE_API_KEY` env var | İsteğe bağlı |

---

## ModelRegistry Pattern

`src/core/model-registry.ts` içindeki `ModelRegistry` sınıfı, tüm model tanımları için **tek kaynak** (single source of truth) görevi görür. Toplam **13 model**, **3 sağlayıcı** ve **4 tier** (katman) barındırır.

### Tier Hiyerarşisi

| Tier | Açıklama | Claude | Codex | Gemini |
|------|----------|--------|-------|--------|
| `premium_plus` | En yüksek seviye reasoning | — | `o3` | `gemini-3.1-pro-preview` |
| `premium` | Karmaşık görevler | `opus` | `gpt-5` | `gemini-2.5-pro` |
| `standard` | Genel geliştirme | `sonnet` | `gpt-4.1`, `o4-mini` | `gemini-2.5-flash` |
| `economy` | Düşük maliyetli | `haiku` | `gpt-5-mini`, `gpt-4.1-mini` | `gemini-2.0-flash` |

Görevler model adı yerine **tier adıyla** yapılandırılır (`brain_tier`, `worker_tier`). Bu sayede `"worker_tier": "standard"` ayarı Claude'da `sonnet`, Codex'te `gpt-4.1`, Gemini'de `gemini-2.5-flash` olarak çözümlenir — sağlayıcı değişiminde konfigürasyon güncellenmesi gerekmez.

---

## Fallback Chain — 429 ve Kapasite Farkındalıklı Yeniden Spawn

Bir worker, sağlayıcı sınır hatasıyla (429 Too Many Requests) veya kapasite sorunuyla karşılaştığında Deckent otomatik bir **fallback zinciri** devreye sokar:

```
Birincil Sağlayıcı (hata) → Fallback Sağlayıcı → Sonuç veya NO_GO
```

Fallback davranışı `.deckent/config.json` ile yapılandırılır:

```json
{
  "brain_provider": "claude",
  "worker_provider": "claude",
  "fallback_provider": "codex"
}
```

**Fallback zinciri kuralları:**

- Tek yeniden deneme — sonsuz döngü yasak (ADR-006 spawnSync Security Pattern)
- 429 veya `CAPACITY_ERROR` kodlarında tetiklenir
- Fallback sağlayıcı da başarısız olursa görev `NO_GO` durumuna düşer
- Brain ve worker ayrı fallback sağlayıcılara yönlendirilebilir

---

## Provider Auth Modu: Session vs API-Key

### Session Tabanlı (Claude)

Claude sağlayıcı, **tmux oturumu** üzerinden çalışır. `claude` CLI aracı önceden kimlik doğrulaması yapılmış oturumu kullanır; API anahtarı gerekmez. Bu mod:

- Yerel geliştirme ortamlarında önerilen yöntemdir
- `ANTHROPIC_API_KEY` env var gerekmediğinden güvenlidir
- Tmux session yönetimi `src/orchestra/tmux.ts` tarafından yapılır

### API-Key Tabanlı (Codex & Gemini)

Codex ve Gemini sağlayıcılar **environment variable** ile kimlik doğrulaması yapar:

```bash
export OPENAI_API_KEY="sk-..."     # Codex için
export GOOGLE_API_KEY="AIza..."    # Gemini için
```

Anahtarlar yoksa ilgili sağlayıcı devre dışı kalır; Brain otomatik olarak kullanılabilir sağlayıcıya yönlendirir.

---

## forceModel ve Tier-Clamp

DIRECTIVES.md'de görev bazında model belirtildiğinde (`Model: opus`), Brain bu değeri görev JSON'una `forceModel` olarak yazar:

```json
{
  "forceModel": "opus",
  "forceEffort": "low"
}
```

**Tier-clamp mekanizması:** `forceModel` değeri, seçilen sağlayıcının eşdeğer tier modeline **clamp** edilir. Örneğin:

- `forceModel: "opus"` + Codex sağlayıcı → `gpt-5` (premium tier eşdeğeri)
- `forceModel: "haiku"` + Gemini sağlayıcı → `gemini-2.0-flash` (economy tier eşdeğeri)

Bu sayede DIRECTIVES'te provider-specific model adı yazılmaz, tier eşdeğerliği otomatik çözümlenir. Eşdeğerlik tablosu `model-registry.ts` içinde tanımlıdır ve tüm routing kararlarının tek kaynağıdır.

---

## Konfigürasyon Örneği

```json
{
  "brain_provider": "claude",
  "brain_tier": "premium",
  "worker_provider": "claude",
  "worker_tier": "standard",
  "fallback_provider": "gemini",
  "routing_engine": "v2"
}
```

Bu konfigürasyonla Brain `opus`, worker'lar `sonnet` kullanır; herhangi bir hata durumunda Gemini'nin `gemini-2.5-pro` (premium) ve `gemini-2.5-flash` (standard) modelleri devreye girer.

---

## İlgili ADR'lar

- **ADR-023** — Plan Tier Generalizasyonu: Provider-agnostic tier isimleri
- **ADR-015** — TaskRouter Module: 6 katmanlı yönlendirme
- **ADR-016** — Connector Module: Provider yaşam döngüsü yönetimi
- **ADR-017** — MCP-Native Provider Adapters
- **ADR-027** — Hybrid Spawn Backend
