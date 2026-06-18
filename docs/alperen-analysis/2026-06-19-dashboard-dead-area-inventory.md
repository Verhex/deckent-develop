# Dashboard Dead-Area Inventory (DASH-D3, 2026-06-19)

Source: code-level audit of `src/dashboard/src/` (18 routes) cross-checked against `src/api/` handler registrations. Feeds the DASH-D3 fix work. A "dead area" = rendered-but-non-functional UI (no-op handler, empty/stub panel, missing-endpoint control, hardcoded/fake data, always-empty surface).

## Consolidated — by priority

### Critical / most impactful
| ID | Page | file:line | Issue |
|----|------|-----------|-------|
| **DA-T.1** | all (Layout) | `components/Layout.tsx:244` | `DockPanel` terminal bar renders on EVERY page even when terminal default-OFF; expanding shows empty panel (`terminal/TerminalPanel.tsx:17,53` returns null but the bar header still renders). Alperen's flagged "terminal UI-bar inconsistent". |
| **DA-12.1** | /enterprise | `EnterprisePage.tsx:418` | RBAC tab read-only; backend has POST/PUT/DELETE `/api/enterprise/rbac/:role` (`enterprise-endpoint.ts:631`) but NO UI (UX-6). |
| **DA-12.2** | /enterprise | `EnterprisePage.tsx:514` | Rate tab read-only; backend has POST/PUT/DELETE `/api/enterprise/rate/:id` (`enterprise-endpoint.ts:762`) but NO UI (UX-6). |
| **DA-7.1** | /chat | `ChatPage.tsx:400` | Stream + POST fallback both emit error bubble when no chat adapter configured (`server.ts:716`). |

### Medium
| ID | Page | file:line | Issue |
|----|------|-----------|-------|
| **DA-2.1** | /settings | `SettingsPage.tsx:30,62` | Language/theme toggles are in-memory only; never persisted to `/api/config`; reset on refresh. |
| **DA-14.1** | /workers | `WorkersPage.tsx:28` | WorkerCommsPanel "shared keys" count = `doneAgents.length` (synthetic proxy, not real SharedMemory key count). |
| **DA-14.2** | /workers | `WorkersPage.tsx:70` | Handoff list re-renders DONE agents; no real handoff/context data. |
| **DA-7.2** | /chat | `ChatPage.tsx:217` | Notification panel always empty (source filter matches no real events). |
| **DA-10.1** | /nervous | `NervousPage.tsx:118` | PanicGuard badge display-only; no toggle control. |
| **DA-6.1** | /config | `ConfigPage.tsx:128-137` | 10 "Planned" fields render disabled with "(not yet implemented)". |

### Low / orphaned
| ID | Scope | file | Issue |
|----|-------|------|-------|
| **DA-X.1** | component | `SprintControlPanel.tsx` | Orphaned — not rendered in any route (has live wiring + tests). |
| **DA-X.2** | component | `RoutingDistribution.tsx` | Orphaned — fetches `/api/routing/distribution` (`server.ts:617`) but no route surface. |
| **DA-9.2** | /evolution | `EvolutionPage.tsx` | All tabs read-only; no trigger/promote controls (passive until evolution data accrues). |
| **DA-3.1** | /debt | `DebtPage.tsx` | Read-only; no mark-resolved/add action. |

## Fully clean (no dead areas)
`/` Dashboard · `/history` · `/status` · `/memory` (read-only by design) · `/memory-explorer` · `/directives` · `/docs-health` · `/autonomous` · `/login` (SSO conditional = correct) · `/auth/callback`

## UX-6 Roles + Rate summary
| Surface | UI CRUD | Backend CRUD |
|---------|---------|--------------|
| Tenants | ✅ Create/Edit/Delete (admin-only) | ✅ |
| **RBAC roles** | ❌ read-only matrix | ✅ (`enterprise-endpoint.ts:631`) |
| **Rate limits** | ❌ read-only snapshot | ✅ (`enterprise-endpoint.ts:762`) |

## DASH-D3 fix candidates (derived)
1. **DA-T.1 terminal bar integrity** — only render `DockPanel` when `getBootstrapToken()` present (or render an honest "terminal disabled" affordance), so default-OFF installs don't show an empty panel.
2. **DA-12.1/12.2 RBAC + Rate CRUD UI** (UX-6) — wire the existing backend POST/PUT/DELETE into EnterprisePage (admin-gated, mirror the Tenants CRUD pattern).
3. **DA-2.1 settings persistence** — persist language/theme via `POST /api/config` (or a lightweight prefs endpoint) so they survive refresh.
4. **DA-14.1/14.2 workers comms honesty** — either surface real SharedMemory/handoff data or label the proxy honestly (no fake "shared keys").
5. **DA-X.1/X.2 orphaned components** — surface `RoutingDistribution` on a route (routing is high-value) or remove the dead component (ADR-038 disposition).
6. **DA-10.1 panic-guard toggle**, **DA-7.2 notification panel**, **DA-9.2 evolution actions** — lower priority polish.

> Roles/Rate CRUD (item 2) + terminal-bar integrity (item 1) are the highest-value, clearly-scoped DASH-D3 deliverables.
