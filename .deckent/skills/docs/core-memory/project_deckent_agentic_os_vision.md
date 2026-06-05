---
name: project-deckent-agentic-os-vision
description: "Deckent agentic-OS vizyonu: 3 persona × 3 audience matrix, milyon kullanıcı hedefi, agent marketplace + skill registry public + MCP servers ecosystem (Sprint 200+ #5 sub-project)."
metadata: 
  node_type: memory
  originSessionId: 831d4c9f-6acf-418d-aeab-2f47a8741e57
---

**Vizyon:** Deckent **agentic-OS** — bir CLI tool değil, **bir işletim katmanı**. 3 persona × 3 audience matris:

### 3 persona × 3 audience matrix

```
                  | End User      | Developer        | Enterprise
                  |---------------|------------------|------------------
AI Assistant      | chat brainstorm| chat dev assist  | chat ops alert
AI System Worker  | task automation| sprint orchestration | multi-tenant pipeline
Developer Platform| skill install | custom agent     | mTLS + SSO + audit
```

### Million-user hedef

- **Sprint 200 milestone:** `v1.0.0` stable + `agentaegis.io` standard draft + ICSE/FSE 2027 paper
- **W-J stream (Sprint 216-225):** Performance + observability + security hardening
- **Multi-tenant scale:** k8s pod-exec + mTLS interface (Sub-project #3, Sprint 185+)
- **Enterprise readiness:** SSO + SIEM + compliance reports (Sub-project #4, Sprint 189+) — **MIT licensed, no feature gate**

### Agent marketplace + skill registry public

- **DeckentHub:** 20 seed skill Ed25519 signed AST sandboxed (Sprint 165 published)
- **Plugin ecosystem:** Custom agents + skills + providers + MCP servers
- **MCP integration:** Deckent **MCP server** (32 tool + 8 resource) — Claude Desktop / IDE plugin'ler için
- **Verification:** Plugin signature + AST sandbox + capability declaration

### Why "OS" not "tool"

1. **Multi-process orchestration** — Docker container + tmux + subprocess backend, sprint lifecycle state machine
2. **Persistent state** — SQLite memory + audit trail + per-project isolation
3. **Capability-based security** — ADR-037 Authority Matrix RBAC, scope-bounded worker
4. **Extension model** — agent + skill + provider hot-load, MCP wire
5. **Self-modifying** — ADR-039 detector, ADR-046 self-update hook, ADR-064 TOPP continuous-dispatch

### god-level differentiators

- **Trinity 3-face** ([[project_deckent_trinity_anchor]]) — competitors single-persona
- **Evrimsel mimari** (W-E stream) — competitors stateless
- **AEGIS methodology** ([[project_aegis_methodology]]) — competitors ad-hoc
- **MIT no-gate** — competitors enterprise tier
- **Academic standardization** — agentaegis.io draft (Sprint 200 milestone)

### Sub-project pipeline

1. ✅ #1 Conversational Shell (Path B Sprint 190 landed)
2. ✅ #2 Embedded Web Terminal (Sprint 175 delivered)
3. ⏳ #3 Multi-tenant + k8s pod-exec + mTLS (Sprint 185+)
4. ⏳ #4 Enterprise SSO/SIEM/compliance (Sprint 189+)
5. ⏳ #5 Agentic-OS platform (Sprint 200+ — agent marketplace + skill registry + MCP ecosystem)

İlgili: [[project_deckent_god_level_vision]], [[project_deckent_trinity_anchor]], [[project_june1_beta_roadmap]], [[project_aegis_methodology]]
