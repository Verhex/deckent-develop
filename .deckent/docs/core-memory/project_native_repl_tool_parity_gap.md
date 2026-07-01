---
name: project_native_repl_tool_parity_gap
description: "deckent native REPL'in Claude Code'a karşı tool-parite açığı — web-search/skill-dispatch wire değil (dogfood bulgusu)"
metadata: 
  node_type: memory
  type: project
  originSessionId: ddfcd565-d6de-48a7-b611-c5c8e4a57209
---

deckent'in native agentic REPL'i (içinde çalışan LLM, tool-bridge: deckent_bash/read/write/edit) Claude Code'a kıyasla **web-arama (WebSearch/WebFetch) ve skill-dispatch tool'larını wire ETMİYOR**. 2026-06-04 oturumunda canlı doğrulandı: REPL içindeyken `deep-research`/`update-config` skill'leri "Execute skill" hatasıyla düştü, WebSearch izin-kapısına takıldı (oturum-içi onay UI yok), settings yazma da gated. Bash/Read/Edit çalışıyor.

**Why:** Günlük-asistan modunda (Claude Code/Cursor benzeri) deckent'in tool yüzeyi dosya+shell ile sınırlı; web-araştırma ve skill-ekosistemi günlük kullanımda eksik kalıyor — competitive analizde deckent'i "turnkey orchestrator" konumlandırdık ama assistant-paritesi bu noktada zayıf.

**How to apply:** F11 native-parity epic'ine aday madde — REPL tool-bridge'ine web-search + (mümkünse) skill-dispatch ekle. Web/skill gerektiren analiz işlerini şimdilik Claude Code tarafında yap (deckent REPL'de değil). İlgili: [[feedback_wiring_pct_vs_user_working]]
