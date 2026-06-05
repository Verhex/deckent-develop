---
name: project-deckent-trinity-anchor
description: "Deckent Trinity 3-face anchor (2026-05-20): AI Assistant + AI System Worker + Developer Platform — üç yüz, tek motor. Hepsi paralel gelişir, birini kısaltıp diğerine fokus YASAK."
metadata: 
  node_type: memory
  originSessionId: 831d4c9f-6acf-418d-aeab-2f47a8741e57
---

**Trinity anchor karar:** 2026-05-20 (Sprint 175 sonrası). Deckent **üç yüz**, **tek motor** — AI Assistant (conversational), AI System Worker (autonomous), Developer Platform (extensible).

### 3 face detay

| Face | Persona | Entry Point | Audience | Maturity (Sprint 197) |
|---|---|---|---|---|
| **AI Assistant** | Conversational interface — chat naturally, ask questions, brainstorm, trigger tasks | `deckent chat` | End users, life-assistant, brainstorm | ~30% (Memory V2 + Nervous Phase 1 + chat Path B) |
| **AI System Worker** | Autonomous multi-agent engine — plan, spawn, execute, evaluate, retry | `deckent start` | Developers, autonomous workflow | ~95% (180+ sprint dogfood, v1.0.0-beta.1 READY) |
| **Developer Platform** | Extensible orchestration foundation — custom agents, skills, providers, MCP integration, OSS community | `deckent init` | Plugin authors, integrators | ~55% (embedded web terminal Sprint 175, self-security I1-I5 Sprint 179) |

### Trinity invariant'lar

1. **Üçü paralel gelişir** — feature priority planlanırken 3 face dengeli
2. **Tek motor** — aynı `src/orchestra/` Brain, aynı `.brain/memory.db`, aynı `.deckent/` config
3. **Cross-face features** — chat conversational + sprint orchestration tek context'te akışkan
4. **Audience-aware UX** — `deckent` komutu hem CLI dev hem chat user için doğal
5. **No feature gate** — face'lerin hiçbiri Enterprise Edition değil, hepsi MIT

### Anti-pattern (Trinity ihlali)

- "Önce worker bitir, sonra chat" → ✗ paralel
- "Chat hobby, esas worker" → ✗ Trinity eşit
- "Developer Platform sadece advanced user için" → ✗ default-deny security default-on, herkes plug-in yazabilir
- "Multi-tenant Enterprise tier" → ✗ MIT licensed, default flag

### Sprint 197 status

- **AI Assistant ~30%:** Memory V2 production (SQLite + FTS5 + Turkish normalize), Nervous Phase 1 smoke (12 detector live), chat Path B subprocess Sprint 190 landed. Path A (PTY native) + Path C (native SDK) post-beta.
- **AI System Worker ~95%:** Sprint 183 v1.0.0-beta.1 validation 6/6 GREEN. Sprint 195-197 Brain dürüst raporlama, WP Tier-1, disk-verify gate. Ready for 1 Haziran npm publish.
- **Developer Platform ~55%:** Embedded web terminal Sprint 175. I1-I5 self-security Sprint 179. Multi-tenant (#3) Sprint 185+, Enterprise SSO/SIEM (#4) Sprint 189+ — hepsi MIT.

### Vision continuity

- Trinity'nin "tek motor" özü = `src/orchestra/sprint-controller.ts` God Object Split (ADR-026), `src/core/memory-store.ts` Memory V2, `src/providers/` 3 CLI uniform interface
- Trinity'nin "üç yüz" özü = `deckent chat` + `deckent start` + `deckent init` üç entry, **aynı state machine, farklı user-facing wrapper**

İlgili: [[project_deckent_god_level_vision]], [[project_deckent_agentic_os_vision]], [[project_4cli_subscription_vision]]
