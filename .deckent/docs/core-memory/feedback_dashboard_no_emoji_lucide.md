---
name: feedback_dashboard_no_emoji_lucide
description: "Dashboard'da EMOJI YASAK — tasarım kararı lucide-react ikonları (docs/design/web-console/README.md). Emoji = tasarım ihlali, geri-al."
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 7d76d576-6e17-44f7-8213-5be8dd2ff7f4
---

Alperen (2026-06-11): "dashboardda tasarım kararımızı ihlal eden emojiler koymuşsun onu iptal edelim tekrar tasarımda eski haline gelsin işlevsellik ok."

**Why:** Dashboard'ın resmi tasarım sistemi `docs/design/web-console/README.md` (deckent "logbook" teal/gold, Hanken Grotesk + IBM Plex Mono). Spec açıkça: **"Icons: Lucide (already used by the app)"** + tam ikon adları (satır 233-236: `cpu, gem, zap, leaf, container, bot, hard-hat, file-code-2, loader, check-check, clock, activity, skull, bell...`) + **"clean monospace glyphs only (no emoji-presentation characters)"** (satır 261-263). Emoji (💎⚡🍃🤖📝❤🔄🟢✅❌🔔🐙) bu kararın ihlali — muhtemelen 218-220 dashboard god-level sprintlerinde sızdı.

**How to apply:**
- Dashboard component'lerinde (`src/dashboard/src/`) **emoji KULLANMA** — daima lucide-react ikon (Sidebar.tsx/EnterprisePage.tsx referans desen).
- Model ikonları: gem/zap/leaf (opus/sonnet/haiku); worker=cpu/bot; status=check-check/loader/clock/activity/skull; marka=Decko mascot img (decko-mascot.png), emoji-octopus DEĞİL.
- Status renk-semantiği KORUNUR (DONE green / ERROR red / PAUSED amber / EXECUTING teal — spec "deliberately kept").
- Düz Unicode ok-glyph'leri (`→`/`↗`) emoji-presentation değil, kabul edilebilir; ama emoji-aralığı karakterler yasak.
- Sprint 277 Task 14 bu temizliği yaptı + `no-emoji-guard.test.tsx` gelecek girişi yakalar.
- Genel kural: dashboard görsel-değişiklik = `docs/design/web-console/` spec'ine SADIK + playwright görsel-doğrulama (ADR-079). [[feedback_god_level_i18n_quality_bar]] 
