---
name: project_bot_tool_surface_and_group_buttons
description: Telegram bot tool-surface expansion (cost/usage/kpi) + buttoned approval for risky deckent_* tools (group buttons) + start/run/process detached-exec gap
metadata: 
  node_type: memory
  type: project
  originSessionId: ea3a2863-9834-4cfb-abb1-1c9402a856e2
---

2026-06-27 dogfood (el-kodlama, hybrid). Telegram bot'un yetenek genişletmesi. Kod yazıldı, lint+test yeşil (5288 pass), **build + bot restart Alperen bekliyor** (bot dist'ten koşar; değişiklikler build'siz canlı olmaz).

## Yapıldı (3 dosya seam)
- **Bot tool yüzeyi 3 KATMAN** (ilk audit ajanı 2 dedi, EKSİK): (1) `READ_ONLY_BOT_TOOLS` seti `bot-agentic.ts`, (2) system-prompt kataloğu `DECKENT_BOT_SYSTEM_PROMPT` `bot-agentic.ts`, (3) **`cliArgsFor`/`TOOL_COMMANDS` `chat-tool-bridge.ts`** — bot'un inner dispatcher'ı tool→CLI subcommand burada eşler; mapping yoksa `[mcp-error] tool not allowed`. Her yeni tool 3 yerde de olmalı.
- **A (read-only):** `deckent_cost`→`cost show`, `deckent_kpi`→`kpi` eklendi (usage zaten special-case'liydi). CLI'da gerçek çıktı doğrulandı.
- **B (grup butonu):** Riskli deckent_* tool onayları **tasarım gereği text-only**'di (`bot-agentic.ts` risky branch yalnız `parkedActionMessage`); buton SADECE capability path'inde (`makeSendApproval`) vardı. Fix: `makeSendToolApproval` (`chat-bridge.ts`) + `sendToolApproval` dep (`GatedDispatcherDeps`) → riskli tool da butonlu. Grup zaten authorized (text approve çalışıyordu) → callback route olur. Fallback text korundu. i18n: `tool.approval.ack` (en/tr).
- **D (state-changing, kısmi):** set_directives/config/autonomous(control)/sync/kill/cleanup/recover/checkpoint prompt'ta advertise (hepsi `cliArgsFor`'da çalışır).

## 🔴 Açık kısıt (honest, advertise EDİLMEDİ)
`deckent_start`/`run`/`process` bot'tan ÇALIŞAMAZ: `chat-tool-bridge.ts` headless spawn **30s timeout** (`SPAWN_TIMEOUT_MS`), sprint dakikalarca sürer → SIGKILL. Kırık tool göstermemek için prompt'a konmadı. "Telefondan sprint başlat" = ayrı **detached-exec** mekanizması ister (bot `deckent start`'ı bot-daemon gibi detached spawn edip "başlatıldı, deckent_status ile izle" desin). Sıradaki iş adayı.

## Reddedilen/ertelenen
- send_image capability (dosyadan görsel) — kullanıcı seçmedi.
- Browser capability (URL screenshot + gez/araştır) — ertelendi; yeni runtime dep (playwright/puppeteer) + ADR-010 yeni ADR ister. Capability seam: `src/connectors/capabilities/` (`Capability<T>` + registry.register + policy tier).
- F: bot kataloğunu MCP `TOOL_CATALOG`'tan türetme (drift fix) — önerildi, yapılmadı; 3-katman elle senkron drift riski sürüyor.

İlgili: [[feedback_proof_of_function_dod]] · [[feedback_build_mcp_restart_coordination]] · [[feedback_telegram_rich_approval_bot]] (DM butonu zaten çalışıyordu; bu riskli-tool yolunu da butonladı).
