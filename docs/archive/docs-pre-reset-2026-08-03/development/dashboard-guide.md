# Dashboard Development Guide

> Source: `src/dashboard/` | Build: `npm run build:all` | Dev: `cd src/dashboard && npm run dev`

---

## Overview

The Deckent web dashboard is a React 19 + Vite 6 + Tailwind 4 SPA served by `deckent serve`.
Source lives in `src/dashboard/`. Built assets are output to `dist/dashboard/` (canonical, via `npm run build:dashboard`) or `src/dashboard/dist/` (manual `cd src/dashboard && npm run build`) and served as static files by the HTTP API process.

Stack:
- **React 19** with React Router 7
- **Vite 6** — bundler and dev server
- **Tailwind 4** — utility CSS
- **lucide-react** — icon library (emoji strictly prohibited by design policy)
- **recharts** — charts and data visualization
- TypeScript (`tsconfig.json` + `tsconfig.node.json`)

---

## Building the Dashboard

### Full build (CLI + dashboard)

```bash
npm run build:all
```

Runs: `npm run clean && tsc && node scripts/copy-assets.mjs && npm run build:dashboard`

This is the canonical build for publishing or deployment — TypeScript compilation followed by Vite dashboard build.

### Dashboard only

```bash
npm run build:dashboard
```

Runs `node scripts/build-dashboard.mjs` (Vite build in `src/dashboard/`). Use when you've changed only dashboard source and want a faster cycle.

### Manual Vite build (from dashboard directory)

```bash
cd src/dashboard
npm run build   # tsc -b && vite build
```

Output goes to `src/dashboard/dist/`.

### Install dashboard dependencies separately

```bash
npm run install:all   # npm ci && npm ci --prefix src/dashboard
```

Or manually:

```bash
cd src/dashboard && npm ci
```

---

## Development Mode

### Option A — Vite dev server + serve proxy (recommended)

Start the Vite dev server in one terminal:

```bash
cd src/dashboard
npm run dev        # vite, defaults to port 5173
```

Then start the API server in proxy mode in another terminal:

```bash
deckent serve --dev --dev-port 5173 --port 3100
```

`--dev` tells `serve` to proxy all non-API requests to the Vite dev server instead of serving `dist/`. HMR and Vite features work normally; the real API + auth layer is live.

### Option B — Build and serve statically

```bash
npm run build:all
deckent serve --port 3100
```

No HMR — requires a rebuild on every change. Useful for final verification.

---

## Type Checking

```bash
# Full project (src/ + dashboard)
npm run lint           # tsc --noEmit && tsc --noEmit -p src/dashboard

# Dashboard only
npm run tsc:dashboard  # tsc --noEmit -p src/dashboard
```

---

## Running Dashboard Tests

```bash
npm run test:dashboard   # vitest run --config vitest.dashboard.config.ts
```

Test files live in `src/dashboard/src/__tests__/` and `src/dashboard/src/components/*.test.tsx`.

---

## `deckent serve` — Launch Command

The `deckent serve` command starts the HTTP API server and serves the dashboard SPA.

```bash
# Start on default port 3100
deckent serve

# Custom port
deckent serve --port 8080

# Bind to all interfaces
deckent serve --host 0.0.0.0 --port 3100

# Dev proxy mode (proxy static to Vite dev server on port 5173)
deckent serve --dev --dev-port 5173

# Custom proxy target
deckent serve --dev --dev-port 3001
```

| Flag | Default | Description |
|------|---------|-------------|
| `--port <n>` | `3100` | Port for the HTTP server |
| `--host <addr>` | `127.0.0.1` | Bind address |
| `--dev` | off | Proxy static to Vite dev server |
| `--dev-port <n>` | `5173` | Vite dev server port (used with `--dev`) |

The legacy `deckent web` command also starts the dashboard but lacks dev-proxy and embedded terminal support. Prefer `deckent serve` for all development.

---

## Dashboard Pages (20)

Pages are defined in `src/dashboard/src/App.tsx` and `src/dashboard/src/pages/`.

| Page | Route | Description |
|------|-------|-------------|
| Dashboard | `/` | Live sprint status, progress, agent table |
| Chat | `/chat` | Native chat / REPL interface |
| Config | `/config` | Project config editor |
| Debt | `/debt` | Tech debt table |
| Directives | `/directives` | DIRECTIVES.md editor |
| Enterprise | `/enterprise` | RBAC, audit, tenant management |
| Evolution | `/evolution` | Agent/skill evolution pipeline |
| History | `/history` | Sprint history and metrics |
| Memory | `/memory` | Memory V2 browser |
| Memory Explorer | `/memory-explorer` | Advanced memory search and graph |
| Nervous | `/nervous` | Nervous system detector status |
| Settings | `/settings` | App settings |
| Status | `/status` | Detailed sprint phase status |
| Workers | `/workers` | Active worker details |
| Autonomous | `/autonomous` | Autonomous mode configuration |
| Docs Health | `/docs-health` | Documentation health status |
| Missions | `/missions` | Missions management |
| KPI Trends | `/kpi` | KPI trend charts and analytics |
| Login | `/login` | OIDC login page |
| Auth Callback | `/auth/callback` | OIDC callback handler |

---

## Project Structure

```
src/dashboard/
  package.json            # React app dependencies (separate npm workspace)
  tsconfig.json           # Dashboard TypeScript config
  vite.config.ts          # Vite + Tailwind plugin config
  vitest.config.ts        # Dashboard test config
  src/
    App.tsx               # Router + layout
    routes.tsx            # Route path constants
    main.tsx              # React entry
    pages/                # One file per page (20 pages)
    components/           # Shared UI components
    hooks/                # Custom React hooks
    i18n/                 # EN/TR translation strings
    lib/                  # Utilities and API client
    types/                # TypeScript types
```

---

## Icon Policy

All icons use **lucide-react** (`lucide-react` package, imported per icon). Emoji are prohibited in dashboard UI per the design system policy. If you need an icon, search the lucide library first.

```tsx
import { Play, Square, AlertTriangle } from 'lucide-react';

<Play size={16} />
<AlertTriangle className="text-amber-500" size={14} />
```

---

## Tailwind 4

The dashboard uses Tailwind 4 (CSS-first config). The `@tailwindcss/vite` plugin handles compilation in Vite. No `tailwind.config.js` is needed — configuration is done in CSS via `@theme` directives.

---

## HTTP API

The dashboard communicates with the deckent HTTP API at the same origin as `deckent serve`. Key endpoints:

| Endpoint | Description |
|----------|-------------|
| `GET /api/status` | Current sprint dashboard state |
| `GET /api/events` | Server-Sent Events stream (real-time updates) |
| `GET /api/history` | Sprint history |
| `GET /api/memory` | Memory V2 content |
| `GET /api/config` | Project config |
| `GET /api/auth/me` | Authenticated user identity |
| `POST /api/start` | Start a sprint (returns jobId) |
| `POST /api/plan` | Plan sprint tasks |

See `docs/reference/api-surface.md` for full endpoint reference and schema definitions.

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Dashboard blank / no content | Run `npm run build:all` — built assets may be missing |
| HMR not working | Use `deckent serve --dev --dev-port 5173` with Vite running in another terminal |
| Type errors in dashboard | Run `npm run tsc:dashboard` for dashboard-specific errors |
| Dashboard tests failing | Run `npm run test:dashboard`; check `src/dashboard/src/__tests__/` |
| Icon missing | Import from `lucide-react`, not emoji |
| Tailwind styles not applying | Ensure `@tailwindcss/vite` plugin is in `vite.config.ts` |

---

*Source: `src/dashboard/`, `src/cli/commands/serve.ts`, `src/dashboard/package.json`*
