---
name: project-4cli-subscription-vision
description: "Deckent'in temel amacı: 4 CLI (Claude/Codex/Gemini/Cursor) subscription mode'da tek sistemde aynı projede çalışacak; API key ile hacim takviyesi opsiyonel; models.dev provider catalog runtime fetch (WrongStack 3 Çatal Kararı #1)."
metadata: 
  node_type: memory
  originSessionId: 831d4c9f-6acf-418d-aeab-2f47a8741e57
---

**Vizyon (2026-05-26, Alperen):** Deckent CLI içinde 4 sağlayıcı CLI subscription mode'da bağlanır → worker'lar multi-provider × multi-model spawn. Modeller, kullanım hacmi gerekirse API key ile takviye edilir. Subscription = default, API = opt-in.

**Pre-beta scope (2026-05-26 karar):** 3 CLI (Claude/Codex/Gemini) yeterli, Cursor post-beta. API kullanımı Tier 1 (30K tok/min cap) yüzünden mümkün değil — kullanıcı organizasyonu Tier 2'ye yükselttiğinde API tarafı tekrar denenecek (post-beta). Pre-beta tüm sprint'ler subscription mode.

**Hedef CLI'ler:**
- **Claude** (`@anthropic-ai/claude-code`) — host: ✓ 2.1.150, container: ✓ Dockerfile.worker:18
- **Codex** (`@openai/codex`) — host: ✓ codex-cli 0.132.0, container: ✗ Dockerfile.worker:21 **COMMENTED OUT**
- **Gemini** (`@google/gemini-cli`) — host: ✓ 0.42.0, container: ✗ Dockerfile.worker:22 **COMMENTED OUT**
- **Cursor** (`cursor-agent` veya benzer) — host: ✗ kurulu değil, container: ✗ Dockerfile'da hiç yok

**Why:** WrongStack benchmark çıkışı, agentic-OS milyon-user vizyonu. Tek CLI bağımlılığı (Claude only) hem rate-limit hem auth-loss riski. 4 CLI paralel = rate-limit cap'i 4'e böler + her provider'ın güçlü yanını kullanır.

**3 Çatal Kararı (Alperen onaylı, 2026-05-23, `docs/alperen-analysis/2026-05-23-comprehensive-work-plan.md` §0):**
1. **Provider katalog:** models.dev her oturum live fetch + 24h cache + fallback prev cache — `src/core/model-registry.ts:407` bootstrap yorumu var, gerçek wire kısmen
2. **Vektörel arama:** Post-GA Q3 2026 — FTS5 dual-layer Türkçe yeterli
3. **Runtime bağımlılık:** Status quo (9 dep) — WrongStack 0-dep yolu reddedildi

**How to apply:**
- Sprint planlarken provider seçimi DIRECTIVES'te task-bazlı opt-in olmalı (`- Provider: codex|gemini|claude`)
- Container provider routing'i için Dockerfile.worker'da 3 CLI install edilmeli (en azından claude+codex+gemini); Cursor sonra
- `DECKENT_OPENAI_API_KEY`, `DECKENT_GOOGLE_API_KEY` env passthrough container'a wire — şu an sadece `OPENAI_API_KEY`/`GOOGLE_API_KEY` pass ediliyor (Codex/Gemini versiyonu `feedback_container_auth_precedence` bug'ının)
- Provider subscription path'leri tespit edilmeli:
  - Claude: `~/.claude/.credentials.json`
  - Codex: `~/.codex/auth.json` (kullanıcı log-in pattern'i public değil, doğrulanmalı)
  - Gemini: `~/.gemini/oauth_token` veya benzer (doğrulanmalı)
  - Cursor: bilinmiyor (CLI henüz host'ta yok)
- models.dev fetch + cache wire'ı verifiye edilmeli (`provider-cache.json` sadece 145 byte → basit cache; live fetch çalışıyor mu açık değil)

**Pre-beta (1 Haziran 2026'a kadar) önceliği:** Claude subscription mode + Brain dishonest NO_GO detector. Codex/Gemini container wire **post-beta hedef** (vizyon korunur, beta scope dışında).

**Açık sorular (proaktif disclosure):**
- Codex CLI subscription mode'da Anthropic gibi org-wide rate-limit'e tabi mi? (doc check gerek)
- Gemini CLI free tier minute cap nedir?
- Cursor CLI hangi auth model'i (subscription/API) destekler?
- 4 CLI aynı container'da paralel çalışırsa /home/.claude vs /home/.codex mount çakışması olur mu?

İlgili: [[feedback_container_auth_precedence]], [[project_api_mode_deferred_post_beta]], [[feedback_proactive_blocker_disclosure]]
