---
name: feedback_ai_planner_silent_fallback
description: "AI planner her ortamda fail — MCP açık-hata, CLI sessiz-structured-fallback (dürüstlük ihlali); Sprint 221-017 fix"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 46b11a62-fd54-4968-ac74-3c501a8080ce
---

**Bulgu (cc run-verify, 2026-06-02):** `deckent plan` **AI modu hiçbir ortamda çalışmıyor.**
- **MCP** (`deckent_plan mode:ai`): `plannerResult=null` → `throw "AI planner failed"` (sprint-planner.ts:279) — açık hata.
- **CLI** (`brain_planning=ai` config): AI denendi → null → **SESSİZCE structured'a düştü** (sprint-planner.ts ~281 `else usedMode='fallback'`, uyarı basmıyor). "Planlama modu: structured" çıktısı verir ama kullanıcı "ai" seçmiştir → haberi olmaz.

**Why (dürüstlük ihlali):** Kullanıcı "ai" ister, "structured" çalışır, hiçbir uyarı yok — [[feedback_wiring_pct_vs_user_working]] ("wired≠çalışıyor") + zero-hardcode dürüstlük ([[feedback_zero_hardcode_live_data]]) ihlali. Sessiz fallback yanıltıcı.

**Kök neden (kod):** AI planner brain-provider'ı spawn edip JSON plan üretir (sprint-planner.ts:207-278, brainAdapter = config.brain_provider → providerRegistry). `plannerResult` null dönüyor: subscription-mode'da (`env -u ANTHROPIC_API_KEY`, API yasak) provider-spawn/parse başarısız. Muhtemelen AI planner API-key bekliyor, subscription-CLI-spawn'a tam çevrilmemiş.

**How to apply:**
- AI-plan fail'i normal kabul et — **structured plan deckent-dev'de zaten mükemmel** (DIRECTIVES çok detaylı, deterministik, AI yorumuna gerek yok). Default `brain_planning: structured` deckent-dev'de bilinçli.
- AI plan denemesi gerekirse: sonuç sessiz-structured olabilir; "Planlama modu" satırını DOĞRULA (ai mı structured mı).
- **Fix Sprint 221-017:** (1) sessiz-fallback→AÇIK uyarı (console.error "AI planner failed, structured'a düşülüyor"), (2) subscription-spawn'ı düzelt (brain_provider CLI spawn, API-key bağımlılığı kaldır). Alperen: "ai modu seçilince brain_provider'ı direkt seçsin, bu basit."
- İlgili: [[feedback_container_auth_precedence]] (subscription vs API spawn), [[feedback_build_mcp_restart_coordination]] (MCP provider bootstrap).
