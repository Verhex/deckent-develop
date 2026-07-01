---
name: project_anthropic_subscription_credit_postponed
description: "🔴 EXTERNAL DEP RISK (2026-06-16 e-posta): Anthropic'in Mayıs'ta duyurduğu 'Agent SDK / claude -p ile abonelik kullanan 3rd-party app'ler → ayrı aylık KREDİ sistemi' değişikliği BUGÜN UYGULANMADI — ertelendi, plan abonelikle-app-geliştirmeyi daha iyi destekleyecek şekilde yeniden çalışılıyor. Şimdilik hiçbir şey değişmiyor, kredi yok, abonelik limitleri aynı; değişiklik öncesi haber verilecek. deckent DOĞRUDAN etkilenir."
metadata: 
  node_type: memory
  type: project
  originSessionId: fa6fce1f-36e1-40e7-a23e-2bf105427bc1
---

**Olay (2 e-posta):**
- **Mayıs 2026 (tehdit):** Anthropic, **Claude Agent SDK / `claude -p` üzerine kurulu üçüncü-taraf uygulamaların**, o günden itibaren **abonelik limitlerinden yararlanmayı bırakıp aylık özel bir KREDİ sistemine** geçeceğini duyurdu.
- **2026-06-16 (erteleme):** "Bu değişikliği **bugün yapmıyoruz**." Kullanıcıların Claude abonelikleriyle nasıl uygulama geliştirdiğini daha iyi desteklemek için **planı güncelliyorlar**. Şimdilik **hiçbir şey değişmiyor**: Agent SDK / `claude -p` 3rd-party kullanımı aboneliğinle eskisi gibi çalışıyor, **talep edilecek kredi yok**, **abonelik limitleri aynı**. Bir güncelleme olduğunda **yürürlükten önce önceden haber verecekler**.

**Neden deckent'i ilgilendiriyor:** `claude -p` (= `claude --print`, headless/non-interactive mod) + Agent SDK, deckent'in worker spawn mekanizmasının ta kendisi. deckent worker'ları **docker backend + session auth (abonelik)** ile `claude` CLI koşturuyor (CLAUDE.md: "Default: Claude (docker backend, session auth)") → deckent **tam olarak "abonelikle çalışan, Agent SDK / claude -p üzerine kurulu 3rd-party uygulama"** tanımına giriyor.

**Why:** Mayıs planı yürürlüğe girseydi deckent'in tüm subscription-mode worker modeli ve "deckent'i KENDİ Claude aboneliğinle kullan" ürün/onboarding hikayesi (user + enterprise) kırılacaktı; subscription=$0 maliyet varsayımı çökerdi ([[project_deckent_core_model_and_provider]], [[feedback_container_auth_precedence]]).

**How to apply:**
- Kısa vade: **rahatla** — subscription-spawn modeli sağlam, kredi düşmüyor, limitler aynı. Acil aksiyon gerekmez.
- Orta/uzun vade: bu bir **erteleme, iptal DEĞİL** — Anthropic eninde sonunda değiştireceğini açıkça söylüyor (haber vererek). O yüzden çıkış-vanalarını/hedge'leri canlı tut: **API-mode fallback + subscription→API overflow** ([[project_api_mode_deferred_post_beta]]), **multi-provider parite** (Codex/Gemini/ollama — tek-sağlayıcı politikasına bağımlılığı azaltır), ve **air-gapped/ollama-only** ([[project_air_gapped_offline_pillar]]).
- Bu, **Deckent Core kendi-model + provider** vizyonunu ([[project_deckent_core_model_and_provider]]) stratejik olarak daha da haklı çıkarıyor: kendi modelin/provider'ın = harici sağlayıcı fiyat-politikası riskine karşı nihai bağımsızlık.
