# Multi-Provider Mimarisi

deckent, tek bir provider'a bağlı kalmak yerine Claude, Codex (OpenAI), Gemini ve yerel Ollama'yı aynı sprint içinde bir arada kullanabilir. Provider bağımsızlığı ADR-066'da (Provider Independence) resmileştirilmiştir. Her provider, `src/providers/` altında kendi adaptörüyle soyutlanır; Brain ve Worker provider farkını görmez — yalnızca tier ve model id ile çalışır.

---

## 4 Provider

### Claude (Varsayılan)
- **Backend:** Claude Code CLI (Docker veya tmux backend üzerinden)
- **Kimlik doğrulama:** Subscription oturumu (`~/.claude` mount) veya API key
- **Konfigürasyon:** Ayrı env var gerektirmez; subscription auth varsayılandır
- **Kullanım:** `- Provider: claude` (veya belirtilmezse varsayılan)

### Codex / OpenAI
- **Backend:** OpenAI API
- **Kimlik doğrulama:** `OPENAI_API_KEY` ortam değişkeni zorunludur
- **Konfigürasyon:** `.deckent/config.json` → `worker_provider: "codex"`
- **Kullanım:** `- Provider: codex`

### Gemini
- **Backend:** Google Generative AI API
- **Kimlik doğrulama:** `GOOGLE_API_KEY` ortam değişkeni zorunludur
- **Konfigürasyon:** `.deckent/config.json` → `worker_provider: "gemini"`
- **Kullanım:** `- Provider: gemini`

### Ollama (Yerel)
- **Backend:** Yerel çalışan Ollama sunucusu
- **Kimlik doğrulama:** Gerekmez; localhost üzerinden erişilir
- **Konfigürasyon:** `OLLAMA_BASE_URL` (varsayılan: `http://localhost:11434`)
- **Kullanım:** `- Provider: ollama` + `- Model: qwen3.6:27b` (yerel model tag)
- **Not:** Ollama modelleri `BUILTIN_MODELS` dışındadır; `ensureOllamaModelRegistered()` ile dinamik kayıt yapılır

---

## Provider Konfigürasyon Hiyerarşisi

```json
{
  "brain_provider": "claude",
  "worker_provider": "claude",
  "fallback_provider": "claude",
  "brain_tier": "premium",
  "worker_tier": "standard"
}
```

- **`brain_provider`** — Sprint planlama ve değerlendirme için kullanılan provider.
- **`worker_provider`** — Görevleri yürüten worker'ların varsayılan provider'ı.
- **`fallback_provider`** — Ana provider başarısız olduğunda devreye giren yedek (tek deneme, sonsuz döngü yok).

`brain_tier` / `worker_tier` ile provider-agnostik tier konfigürasyonu: provider değiştiğinde `getEquivalent()` doğru modeli otomatik seçer.

---

## Per-Task Provider Override

DIRECTIVES.md'de her görev için provider ayrı belirtilebilir:

```markdown
## Task 1: Güvenlik Denetimi
- Provider: claude
- Model: opus

## Task 2: Dokümantasyon
- Provider: gemini
- Model: gemini-2.5-flash
```

Bu override `task.provider` alanına yazılır. `src/orchestra/task-router.ts`'deki `routeTask` fonksiyonu 6 seviyeli öncelik sırasında bu alanı işler: `config → forceModel → task.provider → agent-tercih → availability-guard → registry-default`.

---

## Provider-Agnostik Tier Routing

Tier eşdeğeri, `ModelRegistry.getEquivalent(modelId, targetProvider)` ile çözülür:

```
sonnet  (claude/standard)  →  gpt-4.1     (codex/standard)
sonnet  (claude/standard)  →  gemini-2.5-flash (gemini/standard)
opus    (claude/premium)   →  gpt-5       (codex/premium)
haiku   (claude/economy)   →  gpt-4.1-mini (codex/economy)
```

Aynı tier'da model bulunamazsa bir alt tier'a inilir. Bu mekanizma sayesinde `- Model: sonnet` direktifi, provider ne olursa olsun standart tier kalitesini garanti eder.

---

## Auth Modu: Subscription vs API

Her task için bağımsız auth modu seçilebilir (`- Auth:` direktifi veya config):

| Mod | Açıklama |
|-----|----------|
| `subscription` | `~/.claude` mount; Claude Pro/Max/Team hesabıyla oturum kimlik doğrulaması. Varsayılan. |
| `api` | `ANTHROPIC_API_KEY` ortam değişkeni zorunludur; `~/.claude` mount atlanır. |

`task.authMode` alanı öncelik zinciri: `task.authMode > config.auth_mode > 'subscription'`. API auth modu, çoklu hesap senaryolarında veya CI/CD ortamlarında tercih edilir.

---

## Karma Provider Sprint (Mixed-Fleet)

Tek bir sprint farklı provider'larda görevleri paralel yürütebilir. Örneğin:
- Brain (planlama + değerlendirme) → Claude opus
- Kritik kod görevleri → Claude sonnet
- Dokümantasyon görevleri → Gemini gemini-2.5-flash

Auditor scan döngüsü (`src/monitor/`) provider farkını izler; dashboard'da hangi görevin hangi provider'da çalıştığı görünür.

---

## ADR-066 — Provider Bağımsızlığı

ADR-066 (Provider Independence — Multi-Provider Backend Parity), deckent'in provider'a kilitlenmemesini mimari kanun olarak belirler:

- Her provider kendi `src/providers/<provider>.ts` adaptöründe kapsüllenir.
- Brain ve Worker katmanları doğrudan provider API'sini çağırmaz.
- Provider başarısız olduğunda fallback zinciri devreye girer (tek deneme, sonsuz döngü yasak).
- Test süiti provider mocking yerine hermetic fixture kullanır (ADR-087).

Bu tasarım sayesinde yeni bir provider eklemek, mevcut sprint mantığına dokunmadan yeni bir adaptör yazmakla sınırlıdır.
