---
name: feedback_build_mcp_restart_coordination
description: "Build + /mcp restart Alperen tarafından yapılır; kod değişince ben build sinyali veririm, o register eder"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 89c2bcbe-de85-4468-bb6d-2fa12f4b7622
---

Kod (`src/`) değiştiren her sprint/commit sonrası **build + `/mcp restart` Alperen'in işidir** — ben yapmam (2026-05-31 kararı). Protokol: (1) kod değişti → (2) ben açıkça **"🔨 BUILD GEREKLİ: npm run build + /mcp restart"** sinyali veririm → (3) Alperen build+restart yapar → (4) "tamam/registered" der → (5) ben MCP araçlarını taze kodla kullanırım.

**Why:** MCP server long-lived process eski `dist/` kodu cache'ler (CLAUDE.md gotcha). Ayrıca bu session'ın MCP server process'i eski .bashrc'den `ANTHROPIC_API_KEY` inherit etti → MCP'den `deckent_start` worker'ları API moduna düşürür (Sprint 198 felaketi). `/mcp restart` ikisini de çözer ama Alperen yapar.

**How to apply:**
- Sprint'leri HER ZAMAN CLI ile başlat: `env -u ANTHROPIC_API_KEY -u DECKENT_CLAUDE_API_KEY npx deckent start` — bu taze `dist/`'i okur (build Alperen yaptıkça güncel), MCP'yi bypass eder, API key sızıntısını engeller.
- MCP'den ASLA start/run/plan çağırma (read-only status/watch/doctor güvenli ama eski kod olabilir).
- `src/` değiştiren commit'ten sonra mesaja "🔨 BUILD: npm run build + /mcp restart gerekli" satırı ekle.
- MCP read-only aracı kullanmadan önce build durumunu teyit et.

İlişkili: [[feedback_no_auth_touch_during_sprint]] (sprint çalışırken /mcp restart YASAK — sadece sprint bittiğinde), [[feedback_build_requires_user_approval]], [[project_api_mode_deferred_post_beta]].
