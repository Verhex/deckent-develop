# Embedded Web Terminal

> A VSCode-like dockable terminal built into the deckent dashboard. Run `claude`, `gemini`, `codex`, `deckent`, or a plain shell directly from your browser — without leaving the dashboard.

---

## Overview

The embedded terminal adds a resizable dock panel to the bottom of every dashboard page. Sessions are PTY-based (full interactive terminal, not just a command console), so interactive AI CLIs work exactly as they do in your local terminal.

Key properties:

- **Multi-tab:** open multiple sessions simultaneously (claude, deckent, shell, etc.)
- **Reattach:** closing the browser tab does not kill the session — reconnecting replays the scrollback buffer and resumes the live stream
- **Secure by default:** localhost-only bind with an auto-generated token; no manual setup required
- **Audited:** every session lifecycle event (create, attach, kill, auth) is recorded in `memory.db`; raw PTY output is **never** persisted

---

## Opening the Terminal

1. Start the dashboard: `deckent serve`
2. Open `http://localhost:3000` in your browser
3. Click the terminal icon (bottom bar, or `Ctrl+`` shortcut) to expand the dock panel
4. Click a quick-launch button to start a session:
   - **claude** — opens an interactive Claude Code session
   - **gemini** — opens a Gemini CLI session
   - **codex** — opens an OpenAI Codex CLI session
   - **deckent** — opens a deckent CLI session
   - **shell** — opens a plain `$SHELL` session

---

## Session Types

| Kind | Command | Notes |
|------|---------|-------|
| `claude` | `claude` | Interactive Claude Code CLI |
| `gemini` | `gemini` | Gemini CLI (requires `GOOGLE_API_KEY`) |
| `codex` | `codex` | OpenAI Codex CLI (requires `OPENAI_API_KEY`) |
| `deckent` | `deckent <args>` | deckent CLI |
| `shell` | `$SHELL` | Plain shell; enable/disable via `allowShellKind` |

---

## Reattach Behavior

Sessions survive client disconnects. Only explicit kills or the idle reaper terminate them.

```
Browser tab closes ──► WS closes ──► PTY stays alive
                                      ring-buffer keeps filling (bounded)

Browser reconnects ──► WS opens ──► buffer replays ──► live stream resumes
```

**Important boundary:** reattach works across **client** disconnects only. A **server restart** clears all sessions — they live in memory, not on disk. This is an explicit design decision for sub-project #1; disk-persisted sessions are post-#1 scope.

`deckent` kind sessions are **exempt from the idle reaper** — a long-running sprint will not be killed due to inactivity. Other kinds (`claude`, `shell`, etc.) are reaped after `idleTimeoutMs` of inactivity.

---

## Security Model

### Localhost by default

The terminal WebSocket binds to `127.0.0.1` by default. Remote access requires an explicit opt-in (see [Remote Access](#remote-access)).

### Token auto-inject

On startup, the server generates a random session token. When the dashboard page is loaded from `localhost`, the server injects this token directly into the HTML:

```html
<script>window.__DECKENT_TERMINAL_TOKEN__ = "...";</script>
```

The browser SPA reads the token and passes it as a WebSocket subprotocol header:

```
Sec-WebSocket-Protocol: deckent.<token>
```

The server verifies the token using SHA-256 + `timingSafeEqual` **before** any PTY session is spawned. A rejected token closes the connection immediately — no session is created.

### Bypass-independent auth

The global API auth bypass (`DECKENT_API_AUTH_DISABLED=1`) is a read-only dashboard development convenience. It has **no effect on terminal authentication**. The terminal enforces its own token even when the bypass is active — a convenience flag for reading sprint status must never silently open a remote shell.

This aligns with B-022 (security finding from Sprint 171 audit).

### Remote access

Remote access is disabled by default. To enable it:

1. Set `terminal.bind` to a non-localhost address in `.deckent/config.json`, or pass `--host <addr>` to `deckent serve`
2. Ensure a strong token is configured
3. **You are responsible for TLS.** Use a reverse proxy (nginx, Caddy, etc.) in front of deckent when exposing it over a network. Unencrypted remote access exposes your terminal sessions to eavesdropping

```bash
# Example: bind to all interfaces (always add TLS via reverse proxy)
deckent serve --host 0.0.0.0
```

If `--host` is set to a non-localhost address and no token is configured, deckent will log a warning and **will not start the terminal**.

---

## Audit Timeline

Every session lifecycle event is recorded as a structured entry in `memory.db` under the `audit` type. You can query the audit log with:

```bash
deckent recall "terminal audit"
```

Events recorded:

| Event | When |
|-------|------|
| `auth.ok` | WS handshake succeeded |
| `auth.deny` | WS handshake rejected (bad token) |
| `session.create` | Session PTY spawned |
| `session.attach` | Client connected to an existing session |
| `session.detach` | Client disconnected (session stays alive) |
| `session.kill` | Session explicitly killed |
| `session.exit` | PTY process exited |

**Raw PTY output is never persisted.** The scrollback buffer is in-memory only (bounded by `scrollbackBytes`). Audit entries contain only structured metadata — no terminal content.

---

## Configuration

Add a `terminal` section to `.deckent/config.json` to override defaults:

```json
{
  "terminal": {
    "enabled": true,
    "bind": "127.0.0.1",
    "maxSessions": 10,
    "idleTimeoutMs": 1800000,
    "scrollbackBytes": 262144,
    "allowShellKind": true
  }
}
```

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `enabled` | `boolean` | `true` | Enable or disable the terminal feature entirely |
| `bind` | `string` | `"127.0.0.1"` | Bind address for the terminal WebSocket. Change to `"0.0.0.0"` for remote access (requires TLS reverse proxy) |
| `maxSessions` | `number` | `10` | Maximum number of concurrent PTY sessions |
| `idleTimeoutMs` | `number` | `1800000` | Idle reaper timeout (ms). Sessions inactive longer than this are killed. `deckent` kind sessions are exempt. Default: 30 minutes |
| `scrollbackBytes` | `number` | `262144` | Per-session in-memory ring-buffer size (bytes). Default: 256 KB |
| `allowShellKind` | `boolean` | `true` | Allow plain `$SHELL` sessions. Set to `false` to restrict users to AI CLI sessions only |

You can also pass `--host <addr>` and `--no-terminal` to `deckent serve`:

```bash
# Disable the terminal entirely
deckent serve --no-terminal

# Bind to a specific address
deckent serve --host 192.168.1.100
```

---

## Architecture Overview

```
Browser (xterm.js, multi-tab)
   │  WS  /api/terminal/ws       ← auth in handshake, BEFORE any PTY spawn
   │  HTTP /api/terminal/sessions ← existing Bearer auth
   ▼
ws-gateway.ts ──► PtySessionManager ──► node-pty
                       │
                       ├── Map<sessionId, { pty, ringBuffer, kind, status }>
                       ├── attach/detach ≠ kill
                       ├── bounded scrollback (in-memory only)
                       └── TerminalAudit → memory.db
```

The `AuthProvider` and `SessionBackend` are interfaces from day one:

- **`AuthProvider`** — today: local injected token; future: OIDC/SSO/mTLS (sub-project #3)
- **`SessionBackend`** — today: in-process `node-pty`; future: remote pod-exec (sub-project #3)

---

## Sub-project Roadmap

| # | Scope |
|---|-------|
| **#1** | Embedded terminal (this feature) — PTY + ws + xterm.js; localhost-default + token |
| #2 | Self-security — command/prompt guard; planner state hygiene |
| #3 | Million-scale security — multi-tenant isolation, sandbox, resource limits, k8s |
| #4 | Enterprise integrations — OIDC/SSO, secure data exchange |

---

## Related

- [Config Reference](/reference/config) — full configuration documentation
- [Security Model](/reference/security) — deckent overall security architecture
- [ADR-062](/adr/062-embedded-web-terminal) — embedded terminal architecture decisions
