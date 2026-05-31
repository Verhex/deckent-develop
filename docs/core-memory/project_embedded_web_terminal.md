---
name: project-embedded-web-terminal
description: "Embedded Web Terminal — Sub-project #2, Sprint 175 delivered. PTY sessions + WS gateway + token auth + audit chain. ADR-062 accepted. W-C.2 Path A foundation."
metadata: 
  node_type: memory
  originSessionId: 831d4c9f-6acf-418d-aeab-2f47a8741e57
---

**Sub-project #2:** Embedded Web Terminal — `src/api/terminal/`. **Sprint 175 (2026-05-20) delivered**.

### Bileşenler

- **PTY sessions** — `node-pty` ile pseudo-terminal yarat, container'da shell session aç
- **WS gateway** — WebSocket bridge, terminal I/O streaming (`src/api/terminal/ws-gateway.ts`)
- **Token auth** — Per-session token, audit-trail'e wire (`src/api/terminal/auth-provider.ts`)
- **Audit chain** — HMAC-chain append-only log, command + output yakalama
- **Tenant-scoped isolation** — Per-user PTY namespace (Sprint 179 I1-I5 invariant'lar)

### Self-security I1-I5 (Sprint 179)

1. **I1 Prompt guard** — System prompt'a injection saldırılarına karşı sanitization
2. **I2 Command guard** — `rm -rf /`, `chmod 777`, vs blacklist + capability check
3. **I3 Outbound rate-limit** — Terminal'den dışarı network çağrıları rate-limited
4. **I4 Append-only HMAC audit chain** — Audit log tampering tespit (HMAC chain)
5. **I5 Tenant-scoped isolation** — Multi-user pod-exec scoping (k8s prep)

### W-C Path A foundation

- **Path B (subprocess host):** `deckent chat` — Sprint 190 landed
- **Path A (PTY native — embedded terminal):** Sprint 175 foundation, full integration Sprint 198+
- **Path C (native SDK):** Sprint 199+ — Anthropic SDK direct integration, no CLI

### ADR-062 Embedded Web Terminal Spec

- Accepted Sprint 175
- PTY session lifecycle (spawn/attach/resize/kill)
- WS message format (input/output/resize/exit)
- Auth flow (token gen → WS handshake → session bind)
- Audit format (HMAC chain per session, persistent)

### Beta scope

- **Beta INCLUDE:** Path B (subprocess) — yeterli demo
- **Post-beta:** Path A full integration (W-C.2), Path C native SDK (W-C.3 Sprint 199+)

### Architecture

```
Browser ↔ WebSocket ↔ ws-gateway.ts ↔ PTY session
                            ↓
                      audit-chain (HMAC)
                            ↓
                      .deckent/audit/terminal-NNN.log
```

### Sub-project pipeline yeri

- #1 Conversational Shell (Path B done, Path A/C post-beta)
- **#2 Embedded Web Terminal ✓ DELIVERED Sprint 175**
- #3 Multi-tenant k8s pod-exec mTLS (Sprint 185+)
- #4 Enterprise SSO/SIEM/compliance (Sprint 189+)

İlgili: [[project_deckent_trinity_anchor]], [[project_deckent_agentic_os_vision]], [[project_deckent_god_level_vision]]
