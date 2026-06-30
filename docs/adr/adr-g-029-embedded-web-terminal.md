# ADR-G-029: Embedded Web Terminal (Remote PTY)

**Class:** ADR-G (Global / Constitution) · **Scope:** global+project · **Immutable:** yes · **Source:** publisher · **Enforcement:** today=PTY sessions + WS gateway + bypass-independent **fail-CLOSED** auth (RCE-invariant) + structured-audit-only (no raw-output persist) + command/prompt guard + `AuthProvider`/`SessionBackend` seams → tomorrow=Desktop-app integration + enterprise-remote backends (k8s/SSH/SSO, audit-export/SIEM — sub-#3/#4) + TERM-RPC unification with the primary native terminal
**Status:** accepted · **Date:** 2026-06-30 · **Absorbs:** ADR-062 (Embedded Web Terminal — PTY Sessions, WS Gateway, Auth & Audit) · **Supersedes:** —
**Crosswalk:** ADR-062 → ADR-G-029

> **Note (pivot-reframe):** This is the **secondary / remote-access** PTY surface (a dockable terminal in the dashboard / desktop app, and the seam for enterprise remote exec) — it is **NOT** the primary terminal. The primary management+usage surface is the **native agentic terminal** (**ADR-G-034**). This record governs the remote-PTY security model; the day-to-day driving surface is ADR-G-034.

---

## Context

The dashboard (React + Vite + Tailwind) monitors sprints but offered no way to run interactive AI tools (`claude`, `gemini`, `codex`, `deckent`) or a shell from the browser — users context-switched between dashboard and terminal during supervision. Sprint 175 added an embedded terminal as sub-project #1 of a 4-part roadmap (#2 prompt/command guard, #3 multi-tenant/k8s isolation, #4 enterprise external integration).

Because a browser-reachable shell is a remote-code-execution surface, the security invariants are non-negotiable and were fixed in the verified spec before a line shipped. Sub-project #2 (the security guard) has since been **delivered**; #3 and #4 remain deferred. Under the 2026 product pivot, the dashboard becomes **observability-only** and the day-to-day interactive surface moves to the native terminal and a desktop app — so this embedded terminal is reframed as the *remote/secondary* PTY surface, and its hardened auth/audit model becomes the foundation for enterprise remote exec.

---

## Decision (Today)

A self-contained terminal subsystem under `src/api/terminal/`, wired by `src/api/server.ts` (HTTP control routes `GET/POST/DELETE /api/terminal/sessions` + localhost-only bootstrap-token injection) and `src/cli/commands/serve.ts` (`--host`, `--no-terminal`).

```xml
<module-boundary root="src/api/terminal/">
  <core>
    types.ts           — TenantId, SessionKind, AiTool, CreateSessionInput, SessionMeta, AuditAction, AuditEvent
    auth-provider.ts   — AuthProvider interface + LocalTokenAuthProvider (SHA-256 + crypto.timingSafeEqual)
    session-backend.ts — SessionBackend interface + LocalPtyBackend (@lydell/node-pty)
    session-manager.ts — PtySessionManager (Map by sessionId, bounded ring buffer, attach/detach, idle reaper)
    audit.ts           — TerminalAudit (structured lifecycle events → memory.db, tenant-scoped)
    ws-gateway.ts      — attachTerminalGateway (HTTP upgrade → auth → bridge)
  </core>
  <security sub-project="#2 — DELIVERED">
    command-guard.ts · prompt-guard.ts · outbound-limiter.ts · audit-integrity.ts (+ tests/security/)
  </security>
</module-boundary>
```

### Security invariants (the RCE law — never relax)

```xml
<invariants>
  <inv id="1" name="bypass-independent auth, fail-CLOSED">
    Terminal WebSocket auth is INDEPENDENT of and STRICTER than
    DECKENT_API_AUTH_DISABLED. Disabling the global REST API auth gate does NOT
    open the shell. LocalTokenAuthProvider DELIBERATELY ignores that env flag.
    Violating this is a direct RCE vector — the invariant must never be relaxed.
  </inv>
  <inv id="2" name="token delivery">
    Per-server-start token, injected into index.html ONLY for 127.0.0.1/::1
    callers (window.__DECKENT_TERMINAL_TOKEN__), presented via
    Sec-WebSocket-Protocol: deckent.<token> — never via query string, cookie, or
    a plain HTTP Authorization header on the WS upgrade.
  </inv>
  <inv id="3" name="structured-audit-only">
    Raw PTY output (ANSI sequences, keystrokes, command output) is NEVER persisted
    to disk or memory.db — it is PII-adjacent and may contain passwords/keys. Only
    structured, low-volume lifecycle events (created/attached/detached/killed) are
    stored, tenant-scoped (additive tenant_id column, non-destructive ALTER TABLE).
  </inv>
  <inv id="4" name="reattach boundary">
    A session survives client disconnect (tab close, network blip) and reattaches
    with scrollback replay from an in-memory bounded ring buffer (default 256 KiB).
    It does NOT survive a server restart (in-memory only); disk persistence is backlog.
  </inv>
  <inv id="5" name="enterprise seams from day one">
    AuthProvider + SessionBackend interfaces exist with exactly one impl each
    (LocalTokenAuthProvider, LocalPtyBackend). Remote backends (k8s exec, Docker
    exec, SSH) and SSO are sub-project #3 implementations of these interfaces.
  </inv>
</invariants>
```

### Gateway flow & config

`attachTerminalGateway(server, deps)` hooks `server.on('upgrade')`: extract token from `Sec-WebSocket-Protocol` → `AuthProvider.verifyToken()` **before** any session spawn or WS accept (failure → `401` + destroy) → on success bridge PTY⇄WS → on close `manager.detach()` (session stays alive for reattach). `PtySessionManager` caps `maxSessions` (default 10) and exempts `deckent`-kind sessions from idle-kill so active sprints are never interrupted. `TerminalConfig` on `DeckentConfig` (`terminal` key): `enabled` (true), `bind` (`127.0.0.1`), `maxSessions` (10), `idleTimeoutMs` (30 min), `scrollbackBytes` (256 KiB), `allowShellKind` (true). `LocalPtyBackend` spawn uses array args + `shell:false` (except the `win32` npm wrapper), per **ADR-G-002**.

### Rejected alternatives (and why)

iframe/separate-server xterm — cross-origin auth complexity, no shared token. Hand-rolled RFC6455 server — frame-parsing/masking security surface; `ws` is audited. Persist raw PTY output — PII/secrets exposure, breaks invariant #3. Global auth-bypass applies to terminal — direct RCE vector (invariant #1). Unbounded sessions/buffer — DoS.

---

## Intent / Roadmap (Tomorrow)

- **Desktop-app integration (DESK).** The richest interactive surface migrates to a desktop app; the embedded web terminal becomes the in-browser/remote companion to it rather than the primary driving surface (which is the native terminal, **ADR-G-034**).
- **Enterprise-remote backends (sub-#3 / sub-#4).** Implement `SessionBackend` for k8s pod-exec / Docker-exec / SSH and `AuthProvider` for SSO; add multi-tenant isolation (**ADR-G-031**), audit export, and SIEM hooks. The audit trail's `tenantId` already prepares this (**ADR-G-017** → ADR-G-031).
- **TERM-RPC unification.** Converge the embedded web terminal, the native agentic terminal (ADR-G-034), and CLI/MCP onto one terminal RPC contract, so a session looks the same whether driven from the browser, the native REPL, or a remote enterprise client — under the surface-parity law (**ADR-G-011**) and worker live-trace (**ADR-G-025** WORKER-LIVE-TRACE).

---

## Consequences

**(+)** The dashboard/desktop gains real interactive terminal capability with a security-by-default posture: localhost-only token injection, bypass-independent fail-CLOSED auth, no raw-output persistence — the RCE surface stays closed, verified live (`deckent serve` auto-mints the token and enables the dock for localhost). The `AuthProvider`/`SessionBackend` seams make enterprise remote exec an *implementation* of an existing interface, not a rewrite. Reattach survives disconnect without server-side storage. Sub-#2 command/prompt guard is delivered.

**(−)** `@lydell/node-pty` is a native addon — requires a platform prebuilt/compile (`npm install` fails *loudly* on an unsupported platform — an honest, not silent, failure). Sessions are in-memory: a server restart drops them (disk persistence is backlog). `scrollbackBytes` caps history (pipe to a file for full logs). A non-localhost `--host` requires the user to manage their own TLS + token delivery (no built-in HTTPS). A known UI bug — the collapsed dock-bar overlaps the sidebar (z-index/layout) — is cosmetic and deferred to the product sprint. Sub-#3 (multi-tenant/k8s) and sub-#4 (enterprise external) remain deferred.

---

## References / Absorbed

- **Absorbs:** ADR-062 (Embedded Web Terminal — module boundary, 5 security invariants, gateway flow, `TerminalConfig`; Sprint 281 amendment: sub-#2 delivered, `node-pty`→`@lydell/node-pty`, dependency-pipeline flag now `true`, known UI bug noted).
- **Primary surface:** **ADR-G-034** (Native Agentic Terminal) — the primary management+usage terminal; this record is the *secondary/remote* PTY.
- **Spawn security:** **ADR-G-002** (spawnSync Security Pattern) — `LocalPtyBackend` array-args, `shell:false` (except win32 wrapper).
- **Dependency policy:** **ADR-D-005** (Dependency Policy & Inventory) — `ws` + `@lydell/node-pty` (originally `node-pty`) justified deps.
- **Secrets:** **ADR-G-005** (Secret File System) — terminal token uses `randomUUID()` (crypto-random), complementary to `.deck`.
- **Interface pattern:** **ADR-G-007** (External Messaging Connectors) — `AuthProvider`/`SessionBackend` follow the same interface + local-impl pattern as connectors.
- **Isolation / tenancy:** **ADR-G-017** (Multi-Project Isolation) — audit `tenantId` prepares the trail; **ADR-G-031** (Enterprise Foundation) — sub-#3/#4 multi-tenant/k8s/SIEM, enterprise-remote.
- **Surface & observability:** **ADR-G-011** (Surface Parity & Thin-Wrapper) + **ADR-G-025** (Process Resilience & Live Observability — WORKER-LIVE-TRACE) — TERM-RPC unification target.
- **Dashboard host:** **ADR-G-033** (Dashboard — Observability Surface) — hosts the dock; pivot makes the dashboard observability-only.
- **Governance / lifecycle context:** **ADR-G-019** (ADR Governance — runtime constraint record), **ADR-G-021** (Self-Modifying Detection — terminal touches `src/api/`+`src/dashboard/` → dogfood mode), **ADR-G-026** (Dependency-Wave Execution — implemented over a 5-wave sequence), **ADR-D-007** (Manual Subagent Dispatch — wave-gate transitions during dogfood).
- **Born work-items:** DESK (desktop-app integration), TERM-RPC (terminal RPC unification across web/native/CLI/MCP), ENTERPRISE-REMOTE (sub-#3 k8s/SSH/SSO backends, sub-#4 audit-export/SIEM), DOCK-UI-FIX (collapsed dock-bar z-index — product sprint).
- **Direction:** `docs/superpowers/specs/2026-05-19-embedded-web-terminal-design.md`, memory `project_embedded_web_terminal`; `.analysis/hermes-vs-deckent-direction-decisions.md` (terminal=primary surface, dashboard=monitoring-only).
