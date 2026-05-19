# Terminal-Aware Dashboard Reorg Note

- **Date:** 2026-05-19
- **Companion to:** `2026-05-19-embedded-web-terminal-design.md` (sub-project #1)
- **Purpose:** Things to preserve / leave room for during the upcoming dashboard
  reorg so the embedded web terminal integrates **painlessly later**. This is NOT a
  reorg plan — it is a constraint checklist for whoever does the reorg.

> Precondition (process discipline, see §0): the reorg itself starts only after the
> joint current-state analysis of dashboard + deckent processes. This note is the
> *terminal-specific* slice of that analysis input.

## 0. Process gate (applies before reorg AND before impl plan)

- Before starting any of this work, **both Alperen and Claude fully analyze the
  current dashboard + deckent processes** (routes, build, API surface, SSE, config flow).
- The implementation plan proceeds **only from verified/proven processes** — no
  assumed behavior.
- Before finalizing the plan, **run systematic-debugging** as a definitive check
  (confirm the current flow actually behaves as documented; catch drift first).

## 1. Frontend — leave room for these (do not paint into a corner)

| Need | Reorg implication |
|---|---|
| New route `/terminal` + nav entry | Keep the router/nav extensible; reserve a nav slot. Don't hardcode a closed page list. |
| `TerminalPage.tsx` + `components/terminal/` | Reserve a pages/ + components/ location; don't flatten in a way that blocks a new feature page. |
| VSCode-like dock area | Leave a layout region (bottom or side panel) where a terminal can dock alongside the live dashboard — don't lock the layout to fixed full-page views only. |
| `ConfigPage` gets a `terminal{}` section | Keep ConfigPage section-driven/extensible (it is 29KB — if reorg splits it, keep an "add a config group" seam). |
| `DashboardPage` live flow vs terminal | Decide the relationship now: terminal output and the structured live panel coexist. Don't make DashboardPage assume it owns the whole viewport. |
| xterm.js (+ fit addon) | Frontend **devDependency** only (ADR-010 unaffected). If reorg touches `src/dashboard` build/deps, leave the dep-add path clean. |

## 2. API server — do NOT claim or break these paths

- Reserve path prefix **`/api/terminal/*`** (sessions CRUD) and the WS upgrade path
  **`/api/terminal/ws`**. Reorg/refactor of `src/api/server.ts` must not collide with
  these or remove the `http` server's `upgrade` event capability (ws needs it).
- **Preserve** existing patterns the terminal complements (does NOT replace):
  `/api/events` (SSE), `/api/worker/:taskId/log`, Bearer middleware in `auth.ts`,
  `rate-limiter.ts`. The terminal reuses these — keep them as stable seams.
- The `/api/v1/...` → `/api/...` normalization must keep working for the new routes.

## 3. Security seams to keep intact

- `auth.ts` Bearer middleware must remain reusable for `/api/terminal/*` and the WS
  handshake (token verified **before** upgrade). Don't fold auth into something
  HTTP-only that a WS upgrade can't reach.
- Keep a place to surface the auto-generated session token in `deckent serve` startup
  output (zero-config-but-authed).

## 4. Out of scope for the reorg

The reorg should **not** implement any terminal code. It only avoids decisions that
would force a painful rework when sub-project #1 is built. If a reorg choice is
cheap-now / expensive-later for the terminal, prefer the terminal-friendly option;
otherwise leave it and note it.
