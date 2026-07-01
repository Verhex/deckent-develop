---
name: project_deckent_runtime_ecosystem
description: "Pozisyon: Deckent 'kurulan ürün' değil AI runtime ecosystem + agentic-OS. Trinity 3-yüz (Assistant·Worker·Platform, tek motor, paralel) × 3-audience; 8-provider fleet + subs/api overflow; evrimleşen-agent moat; ERP runtime; DeckentHub marketplace + public skill/MCP registry; MOD-SPLIT no-gate; milyon-scale. Detay docs/MASTER-PLAN.md."
metadata: 
  node_type: memory
  type: project
  originSessionId: 46b11a62-fd54-4968-ac74-3c501a8080ce
---

Alperen stratejik yön (2026-06-01 Sprint 212 + 2026-06-09 rafine; agentic-OS/Trinity anchor'ları buraya absorbe). Deckent = **install-and-run product DEĞİL**, **AI runtime ecosystem + agentic-OS** — bir CLI tool değil, bir işletim/orkestrasyon katmanı. Tek motor → (a) bireysel developer orchestrator, (b) bireysel kullanıcı otonom ajanı, (c) kurumsal god-level ecosystem. Milyon-user / milyon-environment / milyon-agent; kolay kurulum, az gereksinim, evrimleşen/öğrenen.

**MOD-SPLIT (no-feature-gate):** community-core = TÜM feature'lar; enterprise = AYNI feature + daha derin governance/audit/management (feature-gating DEĞİL), tek codebase. Enterprise bir *runtime target*, ayrı sürüm değil. (Eski "no-enterprise-edition/MIT no-gate" ADR → MOD-SPLIT'e evrildi; lisans community=MIT / enterprise=ayrı-lisans.) Detay [[project_community_pro_split_strategy]].

### Trinity 3-yüz × 3-audience (anchor 2026-05-20, absorbe)
Üç yüz, **tek motor** — hepsi **paralel** gelişir; birini kısaltıp diğerine fokus YASAK ("önce worker sonra chat" / "chat hobby, esas worker" / "Platform sadece advanced" = Trinity ihlali).

```
                   | End User        | Developer            | Enterprise
AI Assistant       | chat/brainstorm | chat dev-assist      | chat ops-alert
AI System Worker   | task automation | sprint orchestration | multi-tenant pipeline
Developer Platform | skill install   | custom agent         | mTLS + SSO + audit
```
- **AI Assistant** (conversational, `deckent chat`) — en az olgun; TERMINAL-PIVOT sonrası chat → **Desktop-app**'e taşınıyor.
- **AI System Worker** (autonomous plan→spawn→execute→evaluate→retry, `deckent start`) — en olgun (180+ sprint dogfood).
- **Developer Platform** (extensible: custom agent/skill/provider/MCP, OSS, `deckent init`) — orta olgun.
- **Tek motor özü:** aynı `src/orchestra/` Brain + `sprint-controller.ts` + `.brain/memory.db` + `.deckent/` config; üç entry = farklı user-facing wrapper, **aynı state machine**. Invariant: paralel · tek-motor · cross-face akışkan · audience-aware UX · no-feature-gate.
> TERMINAL-PIVOT (2026-06-29): terminal = ana yönetim+kullanım yüzeyi (tool-driven, derin, full-control); dashboard = yalnız izleme; core Hermes'ten derin olmalı. [[project_hermes_deckent_direction_2026_06]]

**Somut yönler (MASTER-PLAN F1-009/010, F5-008, F6-006, #ERP):**
- **8-provider eşzamanlı fleet:** Claude+Gemini+Codex subscription + ≥5 API (DeepSeek/Qwen/GLM/… models.dev) + local Ollama AYNI ANDA koordineli. Altyapı var (ProviderAdapter+model-catalog); eksik: OpenAI-uyumlu adapter + eşzamanlı koordinatör + per-worker provider atama.
- **Subs/API overflow:** subscription limiti dolunca worker otomatik API provider'a taşınır (max throughput). Bugün authMode statik per-task; dinamik overflow yok.
- **Evrimleşen agent kimliği (moat):** başarı düşünce kimliği (prompt+skill) gerçekten refactor edilir — sadece öneri değil. Sprint 212 öneri-yolu wired (adaptive-agent/genealogy/retirement); kapalı-loop (düşük başarı→auto-refactor→genealogy→A/B verify) sıradaki.
- **ERP runtime:** Deckent kurum içinde çalışır — süreç otomasyonu, dosya/DB erişim (önce read-only), Capability Broker (F8 db.query/erp.read scoped) + RBAC + approval gate.

**Ecosystem / platform (agentic-OS):**
- **DeckentHub marketplace + public skill registry:** seed skill'ler Ed25519-signed + AST-sandboxed + capability-declaration; plugin ecosystem = custom agent/skill/provider/MCP server hot-load.
- **MCP ecosystem:** Deckent kendi MCP server'ı (tool+resource) — Claude Desktop / IDE plugin'leri için.
- **Neden "OS" (tool değil):** multi-process orchestration (container+tmux+subprocess, sprint state-machine) · persistent state (SQLite memory+audit+per-project isolation) · capability-based security (Authority Matrix RBAC, scope-bounded worker) · extension model (hot-load+MCP) · self-modifying (detector + self-update hook + TOPP continuous-dispatch).
- **Roadmap pipeline:** ✅ #1 Conversational Shell · ✅ #2 Embedded Web Terminal · ⏳ #3 Multi-tenant+k8s pod-exec+mTLS · ⏳ #4 Enterprise SSO/SIEM/compliance · ⏳ #5 Agentic-OS platform (marketplace+registry+MCP). Standartlaşma vizyonu: agentaegis.io draft + ICSE/FSE akademik paper.

**Positioning (2026-06-09):** = **agentic-OS + agentic-run ecosystem**. Tek cümle: "sisteminize kurun, çalıştırın — hazır+orkestre, her yere kolay entegre, **veri alan/veren**, **yapıyı anlayan+öğrenen**, **modelleri doğru kullanan** ekosistem." ExecutionRequest kontratı (WM-1) eksenlerine map: integrate-everywhere→`origin`; veri-al/ver→`capabilityTarget` (mail/erp/db connector F8); yapı-anla/öğren→stack-detect+memory (WM-7 ✅); model-doğru→routing+`modelEffort`. Persona-coverage: 4 persona × Trinity 3×3 × 6-senaryo × 16-eksen → eksik eksen yok; kontrat opsiyonel-additive büyür, her alan feature'ıyla gelir.

İlgili: [[project_deckent_god_level_vision]], [[project_community_pro_split_strategy]], [[project_hermes_deckent_direction_2026_06]], [[project_deckent_core_model_and_provider]], [[project_api_mode_deferred_post_beta]], [[project_aegis_methodology]], [[feedback_wiring_pct_vs_user_working]].
