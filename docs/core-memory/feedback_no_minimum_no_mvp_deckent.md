---
name: feedback-no-minimum-no-mvp-deckent
description: "Deckent için ASLA MVP/minimum tasarım değil — her özellik, her sprint, her kararda god-level vizyon korunur. Minimum scope, half-shipped, MVP-cut yasak."
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 831d4c9f-6acf-418d-aeab-2f47a8741e57
---

**Kural:** Deckent ürün geliştirmesinde MVP / minimum / half-shipped pattern YASAK. Her özellik, her sprint, her mimari karar **god-level vizyonu hedefler** — pragmatik kısıtlamalar nedeniyle scope kısaltma istenirse Alperen onayı + ADR amendment şart. **Default: ambition korunur**, fallback ekleme yerine doğru abstraction tasarla.

**Why:** Deckent **milyon-user agentic-OS** vizyonuyla başladı (`[[project_deckent_agentic_os_vision]]`, `[[project_deckent_god_level_vision]]`). Çoğu AI orchestration tool MVP cut yapıp pazara hızlı çıkıyor (WrongStack benchmark) — Deckent'ın farklılaştırıcısı kalitesel olgunluk + evrimsel mimari (W-E). MVP scope sürünmesi godlevel vizyonu erode eder.

**How to apply:**
- Sprint planlanırken "MVP yeterli mi?" sorusu YASAK. "Bu god-level mi?" sorusu zorunlu.
- "Şimdilik basit yap, sonra genişlet" pattern'i → **doğrudan doğru abstraction'ı yaz** (Karpathy "Surgical Changes" değil ama "Complete Vision" disiplini).
- DIRECTIVES'te "minimal version", "MVP", "basic implementation" string'leri kullanma — yerine "complete", "production-grade", "god-level" kullan.
- Worker prompt'larda "for now, just X" anti-pattern; "implement the full pattern" yaz.
- Sub-project'ler (multi-tenant, mTLS, k8s, SSO, SIEM, compliance) **enterprise gated YOK** — hepsi MIT license, default-deny security default-on (`[[project_deckent_agentic_os_vision]]`).
- Trinity 3-face hepsi paralel gelişir (AI Assistant + AI System Worker + Developer Platform) — birini kısaltıp diğerine fokus YASAK ([[project_deckent_trinity_anchor]]).

**Anti-pattern (yasak):**
- "Path B önce, Path A sonra" → ✗ üçü paralel (Path A C-11, Path B C-1, Path C C-15)
- "Dashboard minimal, sonra UX" → ✗ W-D başlasın UX dahil
- "Test bunlar yeterli, kalan post-beta" → ✗ test coverage hedef korunur
- "Skip docs for beta" → ✗ docs first-class, W-H beta-blocker

**Pre-beta exception:** 1 Haziran 2026 beta launch hedefi için bazı work stream'ler "post-beta" işaretli ([[project_june1_beta_roadmap]]) — bu MVP-cut değil, **prioritization**: beta öncesi P0 kalite, post-beta P1+ genişleme. God-level vizyon Sprint 200 GA stable hedefinde.

İlgili: [[project_deckent_god_level_vision]], [[project_deckent_agentic_os_vision]], [[project_deckent_trinity_anchor]], [[project_june1_beta_roadmap]]
