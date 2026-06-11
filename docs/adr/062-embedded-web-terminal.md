# ADR-062: Embedded Web Terminal — PTY Sessions, WS Gateway, Auth & Audit

**Status:** accepted

**Deciders:** Alperen Sartaçoğlu (product owner), Brain (orchestrator)

**Date:** 2026-05-19

**Sprint:** Sprint 175 (Embedded Web Terminal — Sub-project #1/4)

---

## Status

accepted — implements the VSCode-like dockable terminal feature for the deckent dashboard.
Sub-project #1/4; sub-projects #2 (prompt/command guard), #3 (multi-tenant/k8s isolation),
#4 (enterprise external integration) are deferred to separate sprints.

> **Numbering note (Sprint 175, RESOLVED):** A collision with
> `docs/adr/062-consent-based-provisioning.md` (Sprint 175 Workstream A, same date)
> was resolved by renaming the consent-based ADR to `063-consent-based-provisioning.md`.
> This file retains `062-` per its spec/plan precedent. `memory.db` `adr-062` already
> points to this Embedded Web Terminal record.

---

## Context

The deckent dashboard (React + Vite + Tailwind) provides sprint monitoring but offers no
way to run interactive AI tools (`claude`, `gemini`, `codex`, `deckent`) or a shell session
directly from the browser. Users must switch between the dashboard and a terminal, breaking
focus during sprint supervision.

Sprint 172–174 stabilised the dashboard and completed OSS GA preparation. Sprint 175 adds
an embedded terminal as sub-project #1 of a 4-part roadmap.

Key constraints established in the verified spec (`docs/superpowers/specs/2026-05-19-embedded-web-terminal-design.md`):

1. **Security invariant (§1c.2):** The terminal WebSocket auth is **independent of and
   stricter than** `DECKENT_API_AUTH_DISABLED`. Disabling the global API auth gate does
   NOT open the shell. This invariant must never be relaxed (RCE surface if violated).

2. **Auth delivery (§1c):** The token is generated per-server-start, injected into the
   index.html page only for `127.0.0.1`/`::1` callers as `window.__DECKENT_TERMINAL_TOKEN__`,
   and presented via the `Sec-WebSocket-Protocol` subprotocol header (never in a plain HTTP
   Authorization header on the WS upgrade).

3. **Audit invariant:** Raw PTY output (ANSI sequences, user keystrokes, command output)
   is **never persisted** to disk or `memory.db`. Only structured, low-volume audit events
   (session created/attached/detached/killed) are stored, scoped by `tenantId`.

4. **Reattach boundary:** A PTY session survives client disconnect (browser tab closed,
   network blip) and can be reattached with scrollback replay. It does NOT survive a server
   restart (in-memory only). Disk persistence is a post-#1 backlog item.

5. **Enterprise seams (§1d):** `AuthProvider` and `SessionBackend` interfaces are defined
   from day one, with exactly one implementation each (`LocalTokenAuthProvider`,
   `LocalPtyBackend`). Multi-tenant SSO, remote backends, and k8s pod exec are deferred
   to sub-project #3.

---

## Decision

A self-contained terminal subsystem is added under `src/api/terminal/` with the following
components and contracts:

### Module Boundary

```
src/api/terminal/
  types.ts          — shared types (TenantId, SessionKind, AiTool, CreateSessionInput,
                       SessionMeta, AuditAction, AuditEvent)
  auth-provider.ts  — AuthProvider interface + LocalTokenAuthProvider
  session-backend.ts — SessionBackend interface + LocalPtyBackend (node-pty)
  session-manager.ts — PtySessionManager (Map, bounded ring buffer, attach/detach, reaper)
  audit.ts          — TerminalAudit (structured events → memory.db, tenant-scoped)
  ws-gateway.ts     — attachTerminalGateway (HTTP upgrade → auth → bridge)
```

`src/api/server.ts` wires the gateway, exposes HTTP control routes (`GET/POST/DELETE
/api/terminal/sessions`), and injects the bootstrap token into `index.html` for localhost
callers only.

`src/cli/commands/serve.ts` adds `--host <addr>` (default `127.0.0.1`) and `--no-terminal`
options; non-localhost `--host` without explicit token triggers a security warning and
leaves terminal disabled unless the user opts in explicitly.

### AuthProvider Interface

```typescript
interface AuthProvider {
  verifyToken(token: string): boolean | Promise<boolean>;
}
```

`LocalTokenAuthProvider` implements this with SHA-256 + `crypto.timingSafeEqual`. It
deliberately ignores `DECKENT_API_AUTH_DISABLED` — auth bypass applies only to the REST
API, not to the PTY shell.

### SessionBackend Interface

```typescript
interface SessionBackend {
  spawn(input: CreateSessionInput, tenantId: TenantId): PtySession;
}
```

`LocalPtyBackend` wraps `node-pty` for in-process PTY spawning. Remote backends (k8s exec,
Docker exec, SSH) are sub-project #3 implementations of this interface.

### PtySessionManager

- Sessions stored in a `Map<string, PtySessionEntry>` keyed by `sessionId` (UUID).
- Each session holds an in-memory bounded ring buffer (configurable `scrollbackBytes`,
  default 256 KiB) for reattach replay. Buffer does not overflow to disk.
- `detach(sessionId)` releases the client WebSocket reference without killing the PTY
  process. `kill(sessionId)` terminates the process and removes the entry.
- Idle reaper runs on a configurable interval; deckent-managed sessions (kind `deckent`)
  are exempt from idle-kill to avoid interrupting active sprints.
- `maxSessions` cap (default 10) rejects new spawns when the limit is reached.

### WS Gateway

`attachTerminalGateway(server, deps)` hooks `server.on('upgrade')`:

1. Token is extracted from `Sec-WebSocket-Protocol: deckent.<token>` — never from
   query string or cookie.
2. `AuthProvider.verifyToken()` is called **before** any session is spawned or a WebSocket
   is accepted. On failure: `socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')` + destroy.
3. On success: `new WebSocket(socket)` with `handleProtocols` returning the matched
   subprotocol; gateway forwards PTY output → WS and WS data → PTY stdin/resize.
4. On WS close: `manager.detach(sessionId)` — session remains alive for reattach.

### TerminalConfig

Added to `DeckentConfig` via the `terminal` key:

```typescript
interface TerminalConfig {
  enabled: boolean;          // default: true
  bind: string;              // default: '127.0.0.1'
  maxSessions: number;       // default: 10
  idleTimeoutMs: number;     // default: 1_800_000 (30 min)
  scrollbackBytes: number;   // default: 262_144 (256 KiB)
  allowShellKind: boolean;   // default: true
}
```

### Audit

`TerminalAudit.record(event)` writes structured `AuditEvent` objects (session lifecycle
only) to `memory.db` via the existing `MemoryStore`. The `memory.db` schema gains an
additive `tenant_id TEXT` column via a non-destructive `ALTER TABLE` migration guarded by
`schema_version`. Raw PTY bytes are never passed to this function.

### Frontend

A `DockPanel` component wraps a `TerminalPanel` (multi-tab, `TerminalTabs` + `TerminalView`
using `@xterm/xterm`). The dock is mounted outside the React Router `<Outlet>` in
`Layout.tsx` so it persists across route navigation. The WS hook (`useTerminalSocket`)
reads `window.__DECKENT_TERMINAL_TOKEN__` and presents it via the `Sec-WebSocket-Protocol`
subprotocol.

---

## Consequences

### Positive

- Dashboard gains real interactive terminal capability without leaving the browser.
- Security-by-default: localhost-only token injection, bypass-independent auth, no raw
  output persistence — RCE surface stays closed.
- Enterprise extensibility built in from day one via `AuthProvider`/`SessionBackend` seams.
- Reattach survives browser disconnect without server-side storage.
- Audit trail (structured events only) integrates with existing `memory.db` infrastructure.

### Negative / Risks

- `node-pty` is a native addon — requires platform-specific prebuilt or compilation.
  Handled by `node-pty`'s prebuilt binary system; `npm install` fails loudly if a platform
  is unsupported (acceptable failure mode, not silent).
- PTY sessions are in-memory: a server restart loses all sessions. Disk persistence is a
  post-#1 backlog item (acceptable, documented boundary).
- `scrollbackBytes` cap means long-running sessions lose early output after the buffer
  wraps. Users requiring full history should pipe to a log file inside the PTY.
- The `--host` non-localhost path requires users to manage their own TLS + token delivery
  (no HTTPS termination built in); spec §5 documents this explicitly.

---

## Alternatives Considered

- **xtermjs hosted via iframe / separate server:** Rejected — cross-origin auth complexity,
  no shared token injection, user must manage a second process.
- **Hand-rolled RFC6455 WebSocket server:** Rejected — security surface (frame parsing bugs,
  masking errors); `ws` library is audited with zero runtime deps of its own.
- **Persist raw PTY output to `memory.db`:** Rejected — ANSI escape sequences + keystrokes
  are PII-adjacent and exceed the "structured audit only" security invariant. Raw output
  may contain passwords, API keys, and personal data.
- **Global auth bypass applies to terminal too:** Rejected — `DECKENT_API_AUTH_DISABLED`
  was designed for local dev API convenience, not for shell access. Conflating the two would
  create an RCE vector (spec §1c.2, B-022).
- **No session limit / unbounded ring buffer:** Rejected — DoS vector; bounded defaults
  with configurable overrides are the correct trade-off.

---

## Related ADRs

- **ADR-006** — spawnSync Security Pattern: `LocalPtyBackend` spawn uses array args,
  `shell: false` (except `win32` npm wrapper), mirroring the existing secure spawn pattern.
- **ADR-010** — Minimal runtime dependencies: `ws` + `node-pty` added as the 8th and 9th
  runtime deps, both ADR-justified (this record).
- **ADR-014** — .deck Secret File System: terminal token uses `randomUUID()` (crypto-random,
  not `.deck`-managed); complementary, not conflicting.
- **ADR-016** — Connector Module: `AuthProvider`/`SessionBackend` follow the same
  interface + local-impl pattern established for connectors.
- **ADR-034** — Multi-Project Isolation: `tenantId` on audit events prepares the audit
  trail for multi-project isolation when sub-project #3 lands.
- **ADR-036** — ADR Governance Integration: this ADR is the runtime constraint record for
  the terminal subsystem; enforced via Brain prompt enrichment.
- **ADR-039** — Self-Modifying Task Detection: terminal touches `src/api/` + `src/dashboard/`
  → dogfood mode triggered → sequential execution mandatory (verified in DIRECTIVES).
- **ADR-045** — Wave-Based Execution Semantics: terminal implementation uses 5-wave
  sequential structure (Wave 0→4) due to self-modifying-detector dogfood mode.
- **ADR-047** — Manuel Subagent Dispatch Protocol: wave gate transitions are Brain-managed
  manually per this ADR (dependency_pipeline_enabled: false for deckent-dev project).

## Notes

DB sync: this `.md` is intended for upsert into `memory.db` via the ADR-046 `adrInsert`
post-finalize hook (`adr-file-sync.ts`) — never via destructive rebuild.

Sub-project roadmap:
- **#1 (this sprint):** Core terminal: PTY sessions, WS gateway, auth, audit, frontend dock
- **#2:** Security: prompt/command guard — prevent dangerous command patterns
- **#3:** Multi-tenant isolation: `AuthProvider`/`SessionBackend` k8s/SSO implementations
- **#4:** Enterprise external integration: remote PTY backends, audit export, SIEM hooks

**İmza:** Brain (orchestrator) — Sprint 175 Wave 0.

---

## Amendment — Sprint 281 (2026-06-11, ADR-review, full code-verification)

**Classification: BOTH** (dashboard-terminal tamamen user-facing ürün yüzeyi; enterprise audit-zinciri dahil).

1. **🟢 Sub-project #2 DELIVERED.** Notes'taki roadmap'in "#2: Security — prompt/command guard" maddesi teslim edildi: `src/api/terminal/` ADR'nin 6 modülüne ek **4 güvenlik modülü** içerir — `command-guard.ts`, `prompt-guard.ts`, `outbound-limiter.ts`, `audit-integrity.ts` (+ `tests/security/` suite'leri). Sub-#3 (multi-tenant/k8s) + #4 (enterprise external) hâlâ deferred.
2. **Re-verified (güvenlik-invariant'lar birebir):** `LocalTokenAuthProvider` "DELIBERATELY ignores `DECKENT_API_AUTH_DISABLED`" + `timingSafeEqual` SHA-256 (`auth-provider.ts:45/50/66`) ✓ · token yalnız `Sec-WebSocket-Protocol: deckent.<token>` (`ws-gateway.ts:27/34`) ✓. **Canlı kanıt (2026-06-11 UX-denetimi):** `deckent serve` terminal-token auto-mint + "embedded PTY enabled (token auto-injected for localhost)" gözlendi; dock dashboard'da çalışır.
3. **Dependency rename:** `node-pty` → **`@lydell/node-pty`** (`session-backend.ts:1`; ADR-010 Amendment-2'de kayıtlı) — bu ADR'deki `node-pty` bahisleri eski-isim olarak okunmalı; karar değişmedi.
4. **Stale ref düzeltmesi:** Related-ADR-047 satırındaki "dependency_pipeline_enabled: false for deckent-dev" superseded — flag artık `true`, multi-wave canlı (ADR-045 Sprint-281 amendment).
5. **🟡 Bilinen UI-bug (product-sprint'e):** collapsed Terminal dock-bar'ı sidebar YÖNET bölümünü örtüyor (layout/z-index; UX-denetim 2026-06-11 bulgu #5, `project_dashboard_chat_audit_20260611`). Fonksiyonel değil görsel; Chat/Dashboard product-sprint'inde düzeltilir.

md+db senkron (Alperen ADR-review).
