# ADR-076: Auth-Precedence Fix + User-Facing Surfaces (serve token-inject, Path A chat, IDE extension)

**Status:** accepted

**Date:** 2026-06-01

**Accepted:** Sprint 214

---

## Context

Sprint 213 was killed (PID-confirmed) because all workers exited with exit-0 and no `.result` files — a mass synthetic NO_GO. Root cause analysis identified three distinct problems that blocked the user-facing surfaces from working end-to-end:

### Problem A — Auth-Precedence Bug (P0, `spawn-backend-docker.ts`)

`spawn-backend-docker.ts` env-forwarding loop (lines 547–553) passed `ANTHROPIC_API_KEY` from the host environment into every Docker container unconditionally, regardless of `auth_mode` or `useApiOnly` state. When the host had `ANTHROPIC_API_KEY` set (common for developers), the container's `claude` CLI detected the key and switched to **API mode** — ignoring `~/.claude` session credentials. With a Tier-1-capped key (30K tokens/min), each worker hit rate limits and timed out → exit-0 → no `.result` → mass synthetic NO_GO.

Users were forced to run `env -u ANTHROPIC_API_KEY npx deckent start` as a workaround, defeating the purpose of `auth_mode: subscription`.

### Problem B — Dashboard `serve` Returns 401 on POST

`npx deckent serve` serves the React dashboard correctly on GET, but every POST action (start sprint, kill, etc.) returned 401. The auto-generated API token (`server.ts` finalToken) was printed to the terminal only — it was never injected into the served `index.html`. The browser had no way to obtain the token for Authorization headers. Workaround: `DECKENT_API_AUTH_DISABLED=1`, which removes all auth.

### Problem C — `deckent chat` Requires Host CLI

`deckent chat` (Path B) works by spawning the user's installed `claude`/`codex`/`gemini` CLI. When no CLI is in PATH, it errors "No AI CLI found" with no guidance. Users with subscription credentials but no standalone CLI are locked out. A Path A embedded chat (server-side ProviderAdapter, no host CLI required) was needed.

### Problem D — IDE Extension Was Scaffold-Only

`extensions/vscode/` was created as an empty scaffold (Sprint 212) with no real activation, commands, sidebar, statusbar, or settings bridge.

---

## Decision

### Part A — Provider+Auth-Aware Env-Forwarding

`spawn-backend-docker.ts` env-forwarding updated to be auth-mode-aware:

- **Claude + subscription mode** (`!useApiOnly`, `authMode !== 'api'`): `ANTHROPIC_API_KEY` is **not forwarded** to the container. The `~/.claude` session mount provides credentials instead.
- **Claude + API mode** (`useApiOnly || authMode === 'api'`): `ANTHROPIC_API_KEY` is forwarded as before.
- **Codex workers**: `OPENAI_API_KEY` forwarded (provider-specific).
- **Gemini workers**: `GOOGLE_API_KEY` forwarded (provider-specific).

This is a surgical change: the existing `-e KEY=value` Docker arg generation is guarded by an `if (!isSubscriptionMode || provider !== 'claude')` condition. API-mode behavior is fully preserved.

### Part B — Localhost Token Injection into Served Dashboard

`server.ts` injects `window.__DECKENT_API_TOKEN__` into the served `index.html` **only when binding to localhost** (127.0.0.1 / ::1). Non-localhost binds (production, remote) do not inject the token — security boundary preserved.

The dashboard's `useApi.ts` hook reads `window.__DECKENT_API_TOKEN__` and adds `Authorization: Bearer <token>` to all fetch requests (GET + POST) when the value is present. When absent (remote bind, or auth disabled), requests are made without the header (backward-compatible).

### Part C — Path A Embedded Chat Backend

`src/api/chat-backend.ts` exposes an API/SSE endpoint that bridges browser chat messages to the server-side `runChatNativeLoop` (ProviderAdapter + MCP dispatch). Users can chat without any host CLI installed. The endpoint uses the existing session/auth middleware and supports multi-turn with mock-adapter for tests.

### Part D — VS Code Extension Real Implementation

`extensions/vscode/src/extension.ts` implements `activate(context)` — registers commands, sidebar TreeDataProvider, statusbar item, and settings bridge. Key files:
- `commands.ts`: `deckent.startSprint` (integrated terminal), `deckent.showDashboard` (openExternal), `deckent.status` (output channel)
- `sidebar.ts`: TreeDataProvider showing active sprint, workers, task statuses
- `statusbar.ts`: StatusBarItem with sprint progress (X/Y) + click→dashboard
- `settings.ts`: bridges `deckent.*` VSCode settings ↔ `.deckent/config.json`

All extension tests mock the `vscode` module — no `vscode` runtime dependency in tests.

---

## Consequences

**Positive:**
- `npx deckent start` with `auth_mode: subscription` now works without `env -u ANTHROPIC_API_KEY`. Sprint 215+ does not require the manual workaround.
- `npx deckent serve` on localhost is fully functional out-of-the-box — POST actions (start/kill/review) work without any environment variable overrides.
- Users with subscription credentials but no host CLI can chat via the dashboard.
- VS Code users get native IDE integration — sidebar, command palette, status bar — without leaving their editor.

**Negative:**
- The auth-aware forwarding only covers Docker backend. tmux/subprocess backends do not have the same isolation concern (they inherit host env directly without `-e` injection). This asymmetry is acceptable for V1: Docker is the primary backend for subscription mode.
- Token injection is localhost-only. Remote dashboard deployments still require manual `DECKENT_API_AUTH_DISABLED=1` or a reverse-proxy that handles auth. This is the correct security default.
- Path A chat backend shares the API server process. High-load chat sessions could affect sprint API responsiveness; process isolation is a post-beta concern (sub-#3).

---

## Alternatives Considered

- **Global auth disable as default** — remove the 401 entirely by default. Rejected: eliminates auth protection for any user who runs `deckent serve` on a shared network. Localhost-only token injection is a minimal-risk subset.
- **Separate chat server process** — run `chat-backend` as a standalone daemon. Rejected: deployment complexity; the existing API server already has the session middleware and MCP integration.
- **Auth-forwarding opt-in flag in task JSON** — let workers declare `"forwardApiKey": true`. Rejected: unnecessary complexity; the subscription vs API mode is already captured by `authMode` (api-surface.md contract).
- **VSCode extension as separate npm package** — decouple the extension from the main repo. Rejected: premature split; ADR-065 two-repo strategy is for the develop/product binary split, not IDE extensions. Extensions/vscode stays in the monorepo for the beta phase.

---

## References

- Sprint 213 kill incident: mass synthetic NO_GO root cause analysis — `[[feedback_container_auth_precedence]]`
- Sprint 214 — P0 auth-precedence fix (214-001) + serve token-inject (214-003, 214-004) + Path A chat (214-006, 214-007) + IDE extension (214-009 through 214-013)
- `src/orchestra/spawn-backend-docker.ts` — env-forwarding auth-aware (Part A)
- `src/api/server.ts` — localhost token injection (Part B)
- `src/api/chat-backend.ts` — embedded chat endpoint (Part C)
- `extensions/vscode/src/extension.ts`, `commands.ts`, `sidebar.ts`, `statusbar.ts`, `settings.ts` — IDE extension (Part D)
- ADR-027: Hybrid Spawn Backend (Docker auth model)
- ADR-034: Multi-Project Isolation (per-project security boundaries)
- ADR-074: Native Chat Real Round-Trip (Path B baseline; this ADR adds Path A)
- `[[feedback_wiring_pct_vs_user_working]]` — user-working proof requirement

---

## Amendment — Sprint 281 (2026-06-11, ADR-review, full code-verification)

**Classification: BOTH** (auth-akışı + serve/chat/IDE tamamen user-facing).

**Re-verified (dört part da):** Part-A auth-aware forwarding (`spawn-backend-docker.ts:667/677/747` — subscription'da key container'a sızmaz; per-task `Auth:` override zinciri `task-router.ts:51`) ✓ · Part-B `__DECKENT_API_TOKEN__` inject (`server.ts:693/1111/1317`) — **2026-06-11 UX-denetiminde CANLI gözlendi** (serve auto-mint + dashboard 200'leri) ✓ · Part-C `chat-backend.ts` (Path-A, `runChatNativeLoop` köprüsü) mevcut ✓ · Part-D vscode extension gerçek dosyaları ✓.

**🟢 Product-sprint için kritik tespit:** Dashboard-Chat-HOLLOW bulgusunun (UX-denetim #1, `project_dashboard_chat_audit_20260611`) eksiği **yalnız frontend-wiring'dir** — Path-A backend (`chat-backend.ts` + `/api/chat/stream`) bu ADR'yle hazır; `ChatPage.tsx` NL-girdisini ona yönlendirmiyor (command-router'da takılı). Fix-kapsamı = ChatPage→Path-A frontend-wire.

**Uzantı:** Part-A'nın auth-mode temeli üzerine **F1-CB billing-follows-auth** (S254) maliyet-doğruluğunu ekledi (subscription/local=$0). md+db senkron (Alperen ADR-review).

---

## Amendment — Sprint 282 (2026-06-11, Part C supersession)

**Part C — `chat-backend.ts` Superseded & Deleted**

The standalone `src/api/chat-backend.ts` module (171 LoC, Sprint 214 T-214-007) was superseded by the integrated chat-handler + chat-stream + resolveChatAdapter family. Sprint 282 T-011 deleted the file and updated Part C references in the ADR. The embedded Path A chat contract (browser message → server-side loop → reply) is now owned by the server.ts HTTP endpoint wiring and the adapter resolution logic, with no separate backend module required.
