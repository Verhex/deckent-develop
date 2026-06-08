# DIRECTIVES — Sprint 244 (re-route, claude): Multi-Provider Docs ↔ Code Reality (WK-8)

## Goal: `docs/reference/multi-provider.md` + `docs/guide/multi-provider.md`'yi **kod gerçeğine göre** düzelt (W-K item 8 drift). Mevcut docs yanıltıcı: Gemini'nin `gemini` CLI gerektirdiğini gizliyor, ollama/deepseek/qwen/glm'den hiç bahsetmiyor (hepsi implement+bootstrap-registered), şüpheli auth komutları içeriyor. **DOC-ONLY — sıfır kod/test riski.** Bu sprint **yerel qwen3.6 (ollama, zero-cost)** worker ile koşar — mixed-fleet/local-model combined-power canlı kanıtı; Brain/ben kod-gerçeğine karşı disk-verify ederim.

## Ortak kurallar
- Markdown doğruluğu (i18n muaf — doküman içeriği). No tech debt. Mevcut doğru kısımları koru, yanlışları düzelt, eksikleri ekle. Tier-0 doc-write → test yok; doğruluk = kod-gerçeğiyle uyum.

---

## Task 1: 243-001 — multi-provider docs kod-gerçeğine hizala
- Provider: claude
- Model: sonnet
- Effort: normal
- Agent: doc-writer
- Skills: documentation-writer, docs
- Files: docs/reference/multi-provider.md, docs/guide/multi-provider.md
- Scope: docs/reference/, docs/guide/

### Description
Önce şu kod dosyalarını OKU + doğrula: `src/core/provider.ts` (bootstrapProviders: hangi provider'lar register oluyor), `src/providers/gemini.ts` (özellikle ~satır 294 `spawnSync('gemini','--version')` ve ~212-216 apiKey-zorunlu throw), `src/providers/codex.ts` (CodexAuthMode subscription/api_key), `src/providers/ollama.ts` (host HTTP), `src/providers/openai-compatible.ts` (DeepSeek/Qwen/GLM presetleri). Sonra iki dokümanı kod-gerçeğine göre yeniden yaz.

**Düzeltilecek kod-gerçeği fact'leri (kod'dan doğrula, doğruysa yaz):**
1. **Gemini `gemini` CLI gerektirir** (`gemini.ts` `spawnSync('gemini','--version')`); API-key da zorunlu (`gemini.ts:212-216` apiKey yoksa throw) → docs "API-only" izlenimini düzelt; Gemini için hem CLI hem key gerektiğini açıkça yaz.
2. **Ollama** (yerel, host `localhost:11434`, zero-cost, never-calls-home) + **OpenAI-compatible** providers **DeepSeek / Qwen / GLM** (bootstrap'ta DEEPSEEK/DASHSCOPE/ZHIPU key varsa register) — **docs bunlardan HİÇ bahsetmiyor → EKLE** (kurulum + env-key + örnek).
3. **Codex** subscription VEYA api_key (`codex auth status`) — auth komutlarını kod'a göre düzelt; şüpheli `codex auth login`/`gemini auth login` komutlarını kod-gerçeğiyle değiştir (yanlışsa kaldır).
4. Provider matrisini güncel tut: claude (subscription/docker), codex (subs/api CLI), gemini (CLI+key), ollama (host/zero-cost), deepseek/qwen/glm (openai-compat/key).

Açık başlıklar, kısa kurulum örnekleri, env-var tablosu. Mevcut doğru bilgiyi koru.

**Kanıt:** `grep -il "ollama\|deepseek\|qwen\|glm" docs/reference/multi-provider.md docs/guide/multi-provider.md` → eklendi · "gemini" CLI gereği geçer · şüpheli auth-login komutları düzeltildi/kaldırıldı. Bitince `task_done` ile DONE.

**Test:** yok (doc-write).
**Smoke:** (doc) disk-verify — Brain/ben iki doc'u kod-gerçeğine karşı kontrol eder (özellikle gemini CLI gereği + ollama/deepseek/qwen/glm varlığı).

---

**Beklenen:** 1/1 DONE. İki multi-provider doc kod-gerçeğiyle hizalı. **243-001 qwen3.6 (host, zero-cost) tarafından üretilir** — combined-power kanıtı. Disk-verify: ollama/deepseek/qwen/glm eklendi + gemini-CLI gereği + auth-komutları kod-uyumlu + markdown anlamlı.

İlgili: [[project_merged_product_flow_analysis]] (W-K provider-docs drift) · [[sprint_242_provider_free_safe]] · [[project_4cli_subscription_vision]] · ADR-066/077.
</content>
