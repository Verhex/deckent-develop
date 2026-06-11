# ADR-080: Dashboard God-Level — Sprint-Start Detach + Hollow-Page Wire + Chat Round-Trip + Native UI

**Status:** accepted

**Date:** 2026-06-01

**Accepted:** Sprint 218

---

## Context

### Sprint-Start Freezes the Dashboard

A real-binary run on 2026-06-01 (`npx deckent serve`) reproduced a critical defect: starting a sprint from the dashboard UI caused the serve process to freeze. The root cause was `src/api/server.ts` calling `runSprint(...)` directly inside the HTTP request handler — `runSprint` is a long-running async operation that blocked the Node.js event loop, preventing any further HTTP responses. Users saw the dashboard enter a skeleton-loading state with no recovery short of restarting the server.

Sprint 216 established the Proof-of-Function DoD (ADR-079) and proved the serve API was functional, but the sprint-start path was not covered by the smoke gate and the freeze went undetected until a manual browser session.

### Hollow-Page Wire-Gap

Sprint 215 shipped four dashboard pages to `src/dashboard/src/pages/`:

- `EvolutionPage.tsx` (genealogy tree, retirement timeline, prompt-diff viewer)
- `NervousPage.tsx` (pending-approval list, accept/reject, panic-guard badge)
- `EnterprisePage.tsx` (tenant list, RBAC role matrix, audit log table)
- `MemoryExplorerPage.tsx` (FTS5 search, ADR timeline, debt table)

However, `App.tsx` contained only 7 routes (none of the four pages) and `Sidebar.tsx` listed only 6 links. Users could not navigate to any of these pages despite the page files existing on disk. Sprint 215's DONE verdict for F7-009 and F7-010 was based on the page files being written, not on user-reachable navigation — a wire-gap by the definition in ADR-079 Tier-1 criteria.

### Chat Round-Trip Was Status-Only

Sprint 214 wired `chat-backend.ts` (ADR-076 Part C) to provide a server-side conversational path. However, `ChatPage.tsx` only dispatched the user message to the `status` intent handler — it would return the sprint status string regardless of what the user typed. The real `POST /api/chat` endpoint (with Bearer token) was never called from the browser. The wire from frontend to backend was absent.

### UI Was Functional-Skeleton

Post-Sprint-215 the dashboard UI met functional-skeleton standards: data loaded, pages existed, navigation worked for the wired pages. It did not meet the god-level bar established in the project's no-MVP policy — no stale-while-revalidate data fetching, inconsistent dark/light tokens across components, layout shifts on data load, no connection-loss recovery.

---

## Decision

### 1. Sprint-Start Detach — `sprint-job-runner.ts`

`src/api/sprint-job-runner.ts` exports `startSprintDetached(sprintId, root)` which spawns the sprint process as a **detached child** (`detached: true, stdio: 'ignore'`) and immediately calls `child.unref()`. The HTTP handler in `server.ts` (`POST /api/start`) is wired to call `startSprintDetached` instead of `runSprint`. The serve event loop is never blocked; the HTTP response returns before the sprint process begins executing. The spawned process continues independently and writes results to `.tasks/`.

### 2. Hollow-Page Wire — `App.tsx` + `Sidebar.tsx`

Four routes are added to `App.tsx`:

```tsx
<Route path="/evolution" element={<EvolutionPage />} />
<Route path="/nervous" element={<NervousPage />} />
<Route path="/enterprise" element={<EnterprisePage />} />
<Route path="/memory-explorer" element={<MemoryExplorerPage />} />
```

Four navigation links are added to `Sidebar.tsx` (with matching lucide-react icons and nav labels). The dashboard now has 11 routes total and all four previously-hollow pages are reachable. The existing 7 routes are preserved unchanged.

### 3. Chat Real Round-Trip — `ChatPage.tsx`

`ChatPage.tsx` is updated to `POST` user messages to `/api/chat` with the `Authorization: Bearer <token>` header (via `useApi`). The response body (assistant message) is rendered into the conversation thread. Loading and error states are displayed. The status-only fallback branch is removed. Multi-turn history is accumulated in component state.

### 4. DIRECTIVES Editor — `DirectivesEditor.tsx`

A new `DirectivesEditor.tsx` component provides a textarea for editing `DIRECTIVES.md` content, with `GET /api/directives` load and `POST /api/directives` save (Bearer token). An empty-content guard disables the sprint-start button. This closes the gap where dashboard-initiated sprints submitted no task description, producing zero-task `new sprint` runs.

### 5. God-Level UI Foundation

Three foundational modules establish the native-speed, god-level UI baseline:

- **`src/dashboard/src/lib/use-live-data.ts`** — SSE/polling hook with stale-while-revalidate semantics: serves cached data immediately on mount and revalidates in the background. On connection loss, shows a reconnecting indicator instead of a skeleton. `useEffect` cleanup aborts inflight requests on unmount.

- **`src/dashboard/src/lib/theme.ts`** — Centralised design token map for color, spacing, radius, and shadow in both `dark` and `light` modes. All components consume tokens via CSS custom properties; no hard-coded hex values in component files.

- **`src/dashboard/src/components/Layout.tsx`** — God-level app shell: CSS grid header + sidebar + main content, responsive breakpoints (mobile/tablet/desktop), meaningful loading states (not skeleton) when data is in-flight, consistent spacing and typography hierarchy.

---

## Consequences

**Positive:**

- Dashboard sprint-start no longer freezes the UI; HTTP server remains responsive throughout long sprint runs.
- All 8 dashboard pages (4 previously hollow + 4 existing) are reachable via sidebar navigation and direct URL.
- Chat provides a genuine conversational round-trip; the `status` intent limitation is lifted.
- DIRECTIVES editor prevents zero-task sprint launches from the dashboard.
- `use-live-data` eliminates skeleton thrash on data refresh and recovers gracefully from connection loss.
- Centralised design tokens (`theme.ts`) enable dark/light consistency without per-component colour overrides.

**Negative / Tradeoffs:**

- Sprint-start detach means the serve process no longer has a direct reference to the running sprint; status must be polled via `.dashboard` or the `/api/status` endpoint (no change from existing behaviour).
- `DirectivesEditor` is a textarea, not a rich editor — multi-line YAML/Markdown editing without syntax highlighting is adequate for current scope.
- `use-live-data` SSE path requires an SSE-capable endpoint; pages without SSE fall back to polling at a fixed interval.

---

## Alternatives Considered

- **Web Worker for sprint-start** — runs `runSprint` in a Worker thread inside the serve process; avoids child-process IPC complexity. Rejected: Node.js Worker threads share the same libuv event loop for I/O; blocking I/O in the worker still contends with HTTP I/O. Detached child process is the clean isolation boundary.

- **Inline the `status` intent handler** — keep ChatPage calling the existing handler and extend it to detect non-status messages. Rejected: this pattern adds chat intent classification to a UI component; the `POST /api/chat` endpoint already exists and is the correct boundary.

- **React Query / SWR** — third-party data-fetching library for stale-while-revalidate. Rejected: ADR-010 (minimal runtime dependencies); the same semantics are achievable in ~80 LoC with `useRef` + `AbortController` + `EventSource`.

- **CSS-in-JS (styled-components, Emotion)** — for design tokens. Rejected: Tailwind CSS custom-properties approach achieves the same token-sharing with zero runtime overhead and no new dependency.

---

## References

- Sprint 218 — Dashboard God-Level Implementation (commit pending)
- `src/api/sprint-job-runner.ts` — `startSprintDetached`
- `src/api/server.ts` — `/api/start` handler wire
- `src/dashboard/src/App.tsx` — route additions
- `src/dashboard/src/components/Sidebar.tsx` — link additions
- `src/dashboard/src/pages/ChatPage.tsx` — chat real round-trip
- `src/dashboard/src/components/DirectivesEditor.tsx` — directives editor
- `src/dashboard/src/lib/use-live-data.ts` — stale-while-revalidate hook
- `src/dashboard/src/lib/theme.ts` — centralised design tokens
- `src/dashboard/src/components/Layout.tsx` — god-level app shell
- ADR-079 — Proof-of-Function DoD (Tier-1 classification + sprint-inner smoke gate)
- ADR-076 — Auth-Precedence Fix + User-Facing Surfaces (serve token-inject, Path A chat)
- ADR-078 — CI-Hermeticity + Dashboard God-Level (Sprint 215 AppShell + page scaffolding)
- `project_dashboard_realrun_findings` — 2026-06-01 real browser audit that identified the freeze, wire-gap, and chat defects

---

## Amendment — Sprint 281 (2026-06-11, ADR-review, full code-verification + canlı UX-denetimi)

**Classification: BOTH** (dashboard tamamen user-facing).

**Re-verified:** §1 `startSprintDetached` (`sprint-job-runner.ts:18`, `detached:true`+unref :29) ✓ · §4 `DirectivesEditor.tsx` ✓ · §5 `use-live-data.ts` + `theme.ts` ✓.

**§3 düzeltilmiş gerçeklik (2026-06-11 canlı UX-denetimi + kod-izi; v3-teşhis ADR-083 review'unda düzeltildi):** Frontend-wire bu ADR'nin dediği gibi VAR — `ChatPage.tsx:312/351/391` NL'i `POST /api/chat` + stream'e düşürür. Serve-tarafı adapter-wire de VAR — Sprint 269 B-ChatStream `resolveChatAdapter` SSOT'unu bağladı (`server.ts:1206` resolve + `:643` stream-endpoint tüketimi); bu amendment'ın ilk sürümündeki "serve'de resolveChatAdapter wire eksik" teşhisi YANLIŞTI. **Gerçek zincir:** (1) `POST /api/chat` (`server.ts:813`) **classifier-only** — `buildChatReply`'a adapter hiç girmiyor, "Anlamadım" buradan; (2) ChatPage stream-hatasını yutuyor (`:382-384` onError boş) ve POST-fallback'i her durumda atıyor → canlıda stream boş kaldığında classifier-cevap görünür kalıyor; (3) canlı stream'in neden boş kaldığı ayrıştırılacak — baş şüpheli EventSource GET'inde Bearer-header imkânsızlığı (auth-gate) veya serve-içi claude CLI spawn hatası. Fix Chat/Dashboard product-sprint'inde (memory `project_dashboard_chat_audit_20260611` #1, v3-teşhis).

**§2 sonrası drift:** 4-route+4-link wire'ı indi; ancak S219'da `Layout.tsx` kendi `navGroups`'unu render eder hale geldi ve `Sidebar.tsx` navItems'ı **stale-duplicate** kaldı → bugün Workers/Directives nav'dan erişilemez (UX-denetim #3, duplicate-sidebar) — tek-kaynağa indirme product-sprint'te. md+db senkron (Alperen ADR-review).
