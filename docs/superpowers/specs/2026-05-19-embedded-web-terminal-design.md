# Embedded Web Terminal — Design Spec

- **Date:** 2026-05-19
- **Status:** Approved (brainstorming) — pending implementation plan
- **Author:** Brainstormed with Alperen
- **Scope:** Sub-project #1 of a 4-part vision (see "Decomposition" below)

---

## 1. Problem & Vision

deckent's web dashboard (`localhost:3000`, or a user-deployed server) should offer a
VSCode-like **embedded terminal** so users can drive deckent **and** interactively run
the AI CLIs (`claude`, `gemini`, `codex`) from the browser — the way Claude Code feels
native in a terminal — without leaving the dashboard. Users watch the live flow in the
terminal itself and configure deckent (`config`) from the same web UI.

The terminal must feel **native, premium, and effortless**: the user accomplishes
something genuinely hard (audited, secure, reattachable remote shell + embedded AI CLIs)
with zero configuration.

### Decomposition (full god-level vision, sequenced — NOT reduced)

This spec covers **only sub-project #1**. The others get their own spec → plan → impl
cycle. Decomposition is sequencing, not MVP/minimization.

| # | Sub-project | Depends on |
|---|-------------|-----------|
| **1** | **Embedded web terminal** (this spec) — PTY + `ws` + xterm.js; claude/gemini/codex/deckent/shell; localhost-default + token; ADR amendment | — |
| 2 | Self-security procedure — secure-by-default, transparent audit, prompt/command guard + **planner state hygiene** (see §1d backlog) | 1 |
| 3 | Million-scale security — multi-tenant isolation, sandbox, rate/resource limits | 1, 2 |
| 4 | Enterprise external-world integrations + secure data exchange | 2, 3 |

### Security principle (cross-cutting, locked)

**Secure-by-default + zero-config + transparent.** The user is protected without effort
(no setup), but can always **see and audit** what happens (documented policy, queryable
audit timeline). "User doesn't have to deal with it" ✅ — "user is kept unaware" ❌.
Hidden behavior is an anti-pattern for an OSS product aimed at millions and is an
instant disqualifier for enterprise (SOC2/GDPR).

---

## 1b. Process Gate (before reorg AND before the implementation plan)

Locked working discipline (Alperen, 2026-05-19):

1. Before starting any work, **both Alperen and Claude fully analyze the current
   dashboard + deckent processes** (routes, build, API surface, SSE, config flow) —
   no assumed behavior.
2. The implementation plan proceeds **only from verified / proven processes**.
3. Before finalizing the plan, **run systematic-debugging** as a definitive check to
   confirm current behavior matches documentation (catch drift first).
4. Reorg companion constraints: `2026-05-19-terminal-aware-reorg-note.md`.

## 1c. Verified Current State — Step A (2026-05-19, joint analysis, Alperen-approved)

Facts below are **verified against the codebase** (not assumed). The implementation
plan proceeds ONLY from these. Drifts vs the original spec draft are corrected here.

**Confirmed (spec assumptions hold):**

- `src/api/server.ts:42` `LOCALHOST_ONLY='127.0.0.1'`, `:864 server.listen(port,host)`,
  strict localhost-only CORS — **the security posture already exists in code**.
- SSE `/api/events` exists (`server.ts:441-443`, `text/event-stream`, `sseClients`).
  Terminal **complements** it; must not break it.
- `src/orchestra/self-modifying-detector.ts:40` path list includes **both `src/api/`
  and `src/dashboard/`** → this feature **WILL trigger dogfood/self-modifying mode →
  sequential execution is mandatory**. Must be declared in the sprint DIRECTIVES.
- `node-pty` / `ws` absent from runtime deps (verified) — ADR work genuinely required.
- `ConfigPage` uses a dynamic category system — a `terminal` config group is additive.
- Routes/nav are a closed hardcoded list (`dashboard/src/App.tsx` +
  `components/Layout.tsx` navItems) — adding `/terminal` = 3 known edits.

**Corrections (original draft was wrong/assumed):**

1. **ADR-010 path:** real file is `docs/adr/010-tek-runtime-dependency-commander-js.md`.
   ADR-010 **already has an "Amendment — Sprint 172"** (`.brain/exports/decisions.md:210`)
   mapping 7 runtime deps each to a governing ADR. Therefore the ADR task is to
   **EXTEND that existing Sprint-172 Amendment with `node-pty` + `ws`, following its
   established mapping pattern** — NOT to author a fresh amendment.
2. **Auth — RESOLVED via systematic-debugging (Phase 1, root cause confirmed):**
   - `serve.ts` exposes only `--port` (no token/host/autogen). `.deckent/config.json`
     has **no `api_auth_token`**. Frontend (`api.ts`, `useApi`, `useSSE`) sends **zero
     token** and `EventSource`/`WebSocket` **cannot** set an `Authorization` header.
   - `verifyBearerToken` (`auth.ts:44`) reads **only** the `Authorization` header
     (no query/cookie/subprotocol path).
   - **Root cause:** the dashboard works ONLY because the environment has
     `DECKENT_API_AUTH_DISABLED=1` (Sprint-143 local-dev bypass). Without it, no token
     ⇒ `auth.ts:91` returns 401 for ALL `/api/` incl. SSE ⇒ dashboard dead. There is
     **no working browser→server auth path for header-less transports** in the codebase.
   - `DECKENT_API_AUTH_DISABLED` is flagged **B-022 [MEDIUM]** (Sprint-171 audit,
     `docs/audits/sprint-171/02-concern/03-security.md:226`), recommended for removal.
   - **Decisions (Alperen):** (a) terminal WS auth is a **new path independent of and
     stricter than the global bypass** — it enforces its own token even when
     `DECKENT_API_AUTH_DISABLED=1` (a read-only-dashboard dev convenience must NEVER
     silently open a remote shell; aligns with B-022 hardening). (b) Token delivery:
     **server injects an auto-generated token into the served page via a localhost-only
     bootstrap**; the SPA reads it and passes it on the WS `Sec-WebSocket-Protocol`
     subprotocol; server-side compares via the existing SHA-256 + `timingSafeEqual`
     primitive (NOT header-bound `verifyBearerToken`). (c) `serve.ts` gains the missing
     CLI surface (`--host`, terminal token/bind options). Frontend token plumbing is
     **in scope for #1**.
3. **WS auth primitive:** `bearerAuthMiddleware` is `(req,res)→boolean`; the `upgrade`
   event gives `(req,socket,head)` with no `res`. Reuse the lower-level
   `verifyBearerToken(req,token)` from `auth.ts` inside a custom upgrade-auth function,
   NOT the middleware.
4. **`upgrade` handler absent (verified):** add `server.on('upgrade')` alongside the
   existing `createServer` — a real implementation task.
5. **config.ts type-surface debt:** there is NO `terminal` key; `dependency_pipeline_enabled`
   is bolted on via an intersection type with a "should be added to DeckentConfig" TODO.
   `terminal{}` must be added **properly to the `DeckentConfig` type**, not repeat the
   bolt-on debt.

**Git/branch (Alperen-decided):** dashboard repair + provisioner commits live on
`docs/embedded-web-terminal-spec` (main is behind). Continue on this branch
(spec + dashboard-fix + terminal together) → single PR/merge to main at the end.

## 1d. Post-Step-A Locked Decisions (2026-05-19, Alperen)

**UX — VSCode-like dock panel (NOT a separate full page).** The terminal is a
**dockable, resizable panel** in the dashboard shell (bottom/side, toggle, persisted),
so the user manages everything from one screen regardless of the active page. Step A
verified the dashboard currently has **no panel/dock system** (full-page views only,
`components/Layout.tsx`). Therefore #1 adds a **dock-panel layer to `Layout.tsx`** —
this is added frontend scope (more than a `/terminal` route), deliberate.

**Enterprise/k8s — design the seams now, implement in #3 (god-level architecture,
sequenced delivery; NOT MVP-reduction).** #1 runs single-user localhost but bakes in
**extension interfaces so #2/#3 extend without rewrite**:

- `AuthProvider` interface — impl today = local injected token; future = OIDC/SSO/mTLS
  (new impl only, no call-site changes).
- `SessionBackend` interface — impl today = in-process `node-pty`; future = remote /
  k8s pod-exec behind the same interface.
- `tenantId` / identity field threaded through every session + audit structure from
  the start (single `"local"` tenant today).
- Audit `memory.db` schema includes a **tenant-scoped column** from day one.

These seams are low-cost now and prevent a rewrite for the "localhost → server → k8s"
trajectory. Multi-tenant isolation / SSO / k8s execution themselves remain **sub-project
#3** (own spec, full scope). Decomposition + ship-and-iterate preserved.

### Sub-project #2 — backlog (planner state hygiene, captured during Sprint 175 prep)

Caught while preparing the Sprint 175 dogfood run; both are planner state-hygiene
defects, formally deferred to #2 (Alperen 2026-05-20):

1. **Auto-debt-injection empty-scope bug** (`src/orchestra/sprint-planner.ts:197-216`):
   CRITICAL debt items are prepended as tasks with `scope:{directories:[],filesWrite:[]}`
   → workers have nothing to do → no `.result` → debt re-perpetuates next sprint
   (4-sprint loop confirmed for `debt-170-001-fix`, closed 2026-05-20). Fix should
   either carry the original task's scope or skip auto-inject for "verified-no-result"
   class debts and surface them for honest closure instead.
2. **Re-plan orphan cleanup**: `deckent plan` rewrites `.tasks/task-{sprintId}-*.json`
   but does NOT unlink task files from a previous plan iteration whose ID slot is no
   longer used (Sprint 175 dry-run showed 20 tasks while disk held 21; orphan
   `task-175-021.json` from the pre-debt-closure iteration was hand-removed and
   committed). Fix: planner must reconcile by deleting stale `.tasks/*.json` not in
   the new plan's id set.
3. **DEP0190 / ADR-006 violation — `shell:true` + args array (3 call-sites,
   unconditionally on all platforms)** observed during Sprint 175 EXECUTE:
   `src/core/plugin-hooks.ts:395`, `:577`, `src/orchestra/baseline-tracker.ts:85`
   all call `spawnSync('npx', ['vitest','run',…], { shell:true })`. Node DEP0190
   warns ("security vulnerabilities, arguments are not escaped, only concatenated"
   — future Error). Also violates ADR-006 (spawnSync Security Pattern) which
   `src/orchestra/authority-enforcer.ts:464-481` already flags as a lint issue but
   is not runtime-enforced (ADR-037 V1.0 Layer-2 advisory). Fix: drop `shell:true`
   or gate it on `process.platform === 'win32'` (npm/npx `.cmd` resolution on
   Windows is the only legitimate need — see `src/providers/subprocess.ts:147` for
   the existing conditional pattern).
4. **Schema-gate coverage enforcement gap**: `config.coverage_threshold` defaults
   to 90 (`src/core/config.ts:554`) and is wired into the EVALUATE phase
   (`sprint-controller.ts:679`), but the gate is **advisory** — sprint-finalizer
   auto-lowers the threshold when "avg coverage < 70%" (`sprint-finalizer.ts:413,
   450`), so a sprint of low-coverage work silently re-baselines the bar. Recent
   sprints (172–175) show coverage drifting 0.0–15.0% while the gate keeps moving
   with it. Fix should split into two knobs: a hard floor (never auto-lowered)
   and an aspirational threshold that the auto-learn loop may tune.
5. **WorkerCard / DashboardPage pre-existing TS errors**: `cd src/dashboard && npx
   tsc --noEmit` surfaces TS2345 in `src/components/WorkerCard.tsx:127` and
   `src/pages/DashboardPage.tsx:284` — the i18n `t()` signature uses a literal
   union of 340+ keys but is passed to a child that types `key: string`, so the
   contravariance fails. Suppressed because `npm run test:dashboard` uses Vite
   (which transpiles without strict type checks) and the root `npm run lint`
   doesn't recurse into `src/dashboard/tsconfig.json`. Fix: relax the `t()`
   return-type to `(key: string, params?: ...) => string` at the prop boundary,
   or thread the literal union all the way down. Either way, wire the dashboard
   tsc into root `lint` so this doesn't regress silently.
6. **`doctor` DECISIONS.md obsolete check**: `src/cli/commands/doctor.ts:193`
   still lists `DECISIONS_FILE` (`.brain/DECISIONS.md`) in `requiredFiles`, but
   Memory V2 (Sprint 143) moved this to `.brain/memory.db` with `.brain/exports/
   decisions.md` as the generated snapshot. The check reports a false-positive
   "missing required file" on any clean Memory-V2 install. Cascade fossils:
   `src/core/constants.ts:37` exports the constant, `src/orchestra/debt-manager.
   ts:481` keeps `DECISIONS.md` in `DECAY_EXEMPT`, `src/orchestra/sprint-docs-
   helpers.ts:142` writes "See .brain/DECISIONS.md" into the now-deprecated
   PROJECT-IDENTITY.md, and `src/orchestra/authority-enforcer.ts:118` lists the
   path in its allow-list. Fix: replace with `.brain/memory.db` (or the export
   path) + sweep the cascade.

### Sub-project #2 — self-security procedure scope (captured 2026-05-20)

Beyond the planner state-hygiene defects above, #2 introduces a runtime **prompt
& command guard** between the terminal session and the AI tools running inside
it (claude / gemini / codex / deckent). Working notes — to be designed into
ADR-form during the #2 spec phase:

- **Prompt guard**: terminal pipes user input into AI tools; an injected prompt
  could exfiltrate via the same PTY. Pre-input filter (token bucket on suspect
  patterns: long base64 blobs, OSC sequences from upstream that escape to the
  host terminal, `curl … | sh` chains). Block on signal, surface to audit as
  structured event, never drop bytes silently (security ≠ trust loss).
- **Command guard**: explicit deny-list for shell-kind sessions when
  `allowShellKind=true` but `host !== 127.0.0.1` (i.e. opt-in remote-shell).
  Candidates: `rm -rf /`, `mkfs.*`, `dd of=/dev/*`, `:(){:|:&};:`, ssh-keygen
  rewrites, `.ssh/authorized_keys` touches. Same audit + surface pattern.
- **Outbound rate-limit**: per-session ws send-bytes cap (already present as
  backpressure pause); add a *daily* tenant-scoped quota so a compromised AI
  loop can't exfiltrate gigabytes before the operator notices.
- **Mutual-TLS hook**: `AuthProvider` interface (#3 implements multi-tenant)
  needs a designed hook for client-cert auth, separate from the localhost token
  path. Capture in the #2 spec so #3 doesn't have to re-litigate.
- **Self-audit-of-audit**: terminal audit writes to `memory.db`, but who watches
  the writer? Periodic integrity check (HMAC chain over append-only event
  series) — explore in #2, ship in #3.

These are the *requirement* surfaces — the #2 plan will translate them into
TDD'able tasks.

## 2. Locked Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Terminal capability | Full interactive PTY shell | claude/gemini/codex are interactive PTY apps; command-console insufficient |
| Deployment model | Single-user now; session abstraction for future multi-user (no impl) | YAGNI; multi-user = sub-project #3 |
| Transport | `ws` library | Hand-rolled RFC6455 is itself a security surface; `ws` is audited, zero-dep, less code → faster + safer GA |
| Security posture | localhost-only bind by default + token; remote = explicit opt-in flag + strong token | Full PTY = RCE; secure-by-default; TLS/reverse-proxy is user responsibility (documented) |
| Session model | Multi-tab: AI chat / deckent / plain shell | Matches "embed + convenience" vision; VSCode multi-terminal feel |
| Session persistence | Persistent server-side PTY + reattach (tmux-like) | Long deckent sprints survive client disconnect |
| `shell` kind default | Enabled + localhost + audited + `allowShellKind` to disable; remote shell needs extra explicit opt-in | Balances full-shell vision with secure-by-default |
| Audit sink | Structured low-volume events → `memory.db` new `audit` type; raw PTY output NEVER persisted | Zero disk burden; queryable native audit timeline; DB-first culture |

---

## 3. Architecture

```
Browser (xterm.js, multi-tab)
   │  WS  /api/terminal/ws        (auth in handshake, BEFORE upgrade/spawn)
   │  HTTP /api/terminal/sessions (Bearer — existing auth.ts)
   ▼
ws-gateway.ts ──► session-manager.ts ──► node-pty (claude|gemini|codex|deckent|$SHELL)
                       │ Map<sessionId, PtySession{ pty, ringBuffer, kind, status }>
                       │ attach/detach ≠ kill · bounded scrollback · audit events
```

- New **runtime** deps: `node-pty`, `ws` → **ADR-010 Amendment + new ADR**.
- `xterm.js` (+ fit addon) is a dashboard **devDependency** — does NOT affect ADR-010.
- Reuses existing `src/api/server.ts`, `src/api/auth.ts`, `src/api/rate-limiter.ts`.

### Components (each single-responsibility, independently testable)

| Unit | File | Responsibility |
|---|---|---|
| **PtySessionManager** | `src/api/terminal/session-manager.ts` | node-pty lifecycle; `Map<sessionId, PtySession>`; bounded ring-buffer (scrollback) per session; attach/detach (does NOT kill on disconnect); explicit kill; idle-reaper via `idleTimeoutMs` (deckent kind exempt by default) |
| **WsGateway** | `src/api/terminal/ws-gateway.ts` | `/api/terminal/ws` upgrade; **verify token BEFORE pty spawn**; protocol; reattach replay; backpressure (pause pty if ws send buffer too large) |
| **HTTP control** | `src/api/server.ts` (additions) | `GET /api/terminal/sessions`, `POST /api/terminal/sessions`, `DELETE /api/terminal/sessions/:id` — existing Bearer middleware |
| **Audit writer** | `src/api/terminal/audit.ts` | Append structured low-volume events to `memory.db` (`audit` entry type); never writes raw PTY bytes |
| **TerminalPage** | `src/dashboard/src/pages/TerminalPage.tsx` (+ components) | xterm.js + fit; tab bar with quick-launch (claude/gemini/codex/deckent/shell); auto-reconnect + reattach by sessionId; "reconnecting" state |
| **Config** | `.deckent/config.json → terminal{}` | `enabled, bind, maxSessions, idleTimeoutMs, scrollbackBytes, allowShellKind`; surfaced in ConfigPage |

### WS protocol (minimal JSON)

- Client → server: `{t:'attach', sessionId}` · `{t:'input', data}` · `{t:'resize', cols, rows}`
- Server → client: `{t:'output', data}` · `{t:'exit', code}` · `{t:'sessions', list}` · `{t:'error', msg}`
- Auth: token sent in WS subprotocol / first handshake message — **never** in query string (avoid logging). Verified before any PTY spawn.

---

## 4. Data Flow & Reattach

1. `POST /api/terminal/sessions {kind, tool?, cwd?}` → manager spawns node-pty
   (`claude` | `gemini` | `codex` | `deckent <args>` | `$SHELL`) → returns `sessionId`.
2. Browser opens WS, auth handshake, sends `attach{sessionId}` → server **replays
   bounded ring-buffer**, then live-streams `pty.onData → ws`; `ws input → pty.write`.
3. **Disconnect:** ws closes, **pty stays alive**, ring-buffer keeps filling (bounded).
4. **Reconnect:** new ws → `attach{sessionId}` → replay buffer → resume live.
5. **Kill:** only explicit (`DELETE` / UI close-with-kill) or idle-reaper
   via `idleTimeoutMs` (deckent kind exempt by default).

---

## 5. Security Details

- **Bind:** default `127.0.0.1`. Remote requires explicit `terminal.bind` config **and**
  a non-empty strong token (refuse to start remote-bound terminal without a token).
- **Auth:** WS upgrade reuses the **`verifyBearerToken(req,token)` primitive** from
  `auth.ts` (NOT `bearerAuthMiddleware` — no `res` in the `upgrade` event; see §1c.3),
  verified **before** pty spawn. HTTP `/api/terminal/*` uses the existing middleware.
  Zero-config but authed locally: `deckent serve` prints an **auto-generated session
  token** on start (user does nothing, but no anonymous access). NOTE: frontend has no
  token plumbing today (§1c.2) — adding it is in scope; real auth behavior confirmed
  via systematic-debugging before the plan is finalized.
- **Transparent audit:** every session create/attach/kill + command-start + auth
  success/deny → structured event in `memory.db` (`audit` type, decay-exempt,
  FTS-excluded). Surfaced as a native "Activity / Security" timeline in the dashboard.
  Raw PTY output is **never** persisted (in-memory bounded ring-buffer only).
- **Remote `shell` kind:** requires an extra explicit opt-in beyond remote bind.
- **Limits:** `maxSessions` cap + `rate-limiter.ts` on the create endpoint.

---

## 6. Error Handling

- node-pty spawn failure → structured error to client, no session created.
- AI CLI binary missing (`claude`/`gemini`/`codex` not on PATH) → friendly message
  with install hint.
- WS auth failure → close with policy code, **no PTY spawned**.
- ws send buffer bloat → pause pty (backpressure), resume on drain.
- **Server restart = sessions lost** (in-memory). This is an explicit, documented
  boundary of sub-project #1. Reattach survives **client** disconnect only, NOT server
  restart. Disk-persisted sessions are out of scope (post-#1, note for future).

---

## 7. Testing (TDD — project culture)

- **Unit — session-manager:** create / attach / detach (no kill) / explicit kill /
  ring-buffer bound enforcement / idle-reaper (deckent kind exempt) with mock pty.
- **Unit — ws-gateway:** auth gate rejects **before** spawn; protocol framing; backpressure.
- **Unit — security:** remote bind refused without token; default localhost; remote
  shell extra opt-in enforced.
- **Unit — audit:** structured event written to DB; raw output never persisted.
- **Integration:** spawn real `bash -c 'echo …'`, attach via ws, assert output;
  disconnect → reattach → buffer replay.
- **Frontend (vitest.dashboard):** TerminalPage tab create/close/switch; reconnect state.

---

## 8. ADR Work (ADR-036 governance — mandatory)

- **ADR-010 — EXTEND existing Sprint-172 Amendment** (file:
  `docs/adr/010-tek-runtime-dependency-commander-js.md`; DB:
  `.brain/exports/decisions.md:210`): add `node-pty` + `ws` rows following the
  established 7-dep → governing-ADR mapping pattern. Not a fresh amendment. (See §1c.1.)
- **New ADR — Embedded Web Terminal Architecture:** PtySessionManager + ws gateway +
  localhost-default security + transparent audit + reattach semantics + explicit
  server-restart boundary.

---

## 9. Out of Scope (sub-project #1)

- Multi-tenant isolation / sandboxing / per-user resource limits → #3.
- Disk-persisted sessions surviving server restart → post-#1.
- Self-security command/prompt guard → #2.
- Enterprise external integrations / secure data exchange → #4.
- Remote access UX beyond opt-in flag + token + documented TLS/reverse-proxy guidance.
