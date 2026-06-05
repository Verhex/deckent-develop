---
name: project_deckent_runtime_ecosystem
description: "Pozisyon evrimi: Deckent 'kurulan ürün' değil 'AI runtime ecosystem' oluyor. 8-provider eşzamanlı + subs/api overflow + evrimleşen agent (milyon-scale) + ERP runtime. Detay docs/MASTER-PLAN.md."
metadata: 
  node_type: memory
  type: project
  originSessionId: 46b11a62-fd54-4968-ac74-3c501a8080ce
---

Alperen 2026-06-01 stratejik yön (Sprint 212 sonrası). Deckent artık sadece "install-and-run product" değil, **AI runtime ecosystem**: tek motor → (a) bireysel developer orchestrator, (b) bireysel kullanıcı otonom ajanı, (c) kurumsal god-level ecosystem. Milyon-user / milyon-environment / milyon-agent. Kolay kurulum, az gereksinim, evrimleşen/öğrenen. ADR-033 (no enterprise edition, MIT) KORUNUR — enterprise bir *runtime target*, ayrı sürüm değil.

**Somut yeni yönler (MASTER-PLAN'de F1-009/010, F5-008, F6-006, #ERP):**
- **8-provider eşzamanlı fleet:** Claude+Gemini+Codex subscription + ≥5 API (DeepSeek/Qwen/GLM/… models.dev'den api-key) + local Ollama AYNI ANDA, koordineli. Altyapı var (ProviderAdapter + model-catalog), eksik: OpenAI-uyumlu adapter'lar + eşzamanlı koordinatör + per-worker provider atama.
- **Subs/API overflow:** subscription limiti dolunca worker otomatik API provider'a taşınır (subs+api birlikte, max throughput). Bugün authMode statik per-task; dinamik overflow yok.
- **Evrimleşen agent kimliği (moat):** agent başarı oranı düşünce kimliğini (prompt+skill) gerçekten refactor et — sadece öner değil. Sprint 212 öneri-yolunu wire etti (adaptive-agent/genealogy/retirement); kapalı-loop (düşük başarı→auto-refactor→genealogy→A/B verify) sonraki adım.
- **ERP runtime:** Deckent kurum içinde çalışır — süreç otomasyonu, dosya, DB erişim (önce read-only), Capability Broker (F8 db.query/erp.read scoped) + RBAC + approval gate.

**Sıra:** Sprint 213 = mevcut yüzeyleri user-ready yap (serve/chat/UX) + IDE ext; sonra ecosystem (F8/F9/F10), sonra 8-provider/ERP. Bkz [[feedback_wiring_pct_vs_user_working]].

İlgili: [[project_deckent_god_level_vision]], [[project_deckent_trinity_anchor]], [[project_4cli_subscription_vision]], [[project_api_mode_deferred_post_beta]], [[feedback_wiring_pct_vs_user_working]].
