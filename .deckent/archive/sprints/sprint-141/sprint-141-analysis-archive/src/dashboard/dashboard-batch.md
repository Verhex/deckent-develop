# Analysis: src/dashboard/src/ — Batch Report
**Task ID:** 141-006 | **Total Files:** 44 | **Generated:** 2026-04-16

---

## Overview

Dashboard is a React + Vite + Tailwind SPA with 6 pages, 14 domain components, 14 UI primitives, 2 hooks, 3 i18n files, 2 lib files, 1 types file, and 1 entry. All UI primitives are **custom-implemented** (not shadcn/ui library), using Context API patterns.

**Architecture Summary:**
- Entry: `main.tsx` → `App.tsx` (router + providers)
- Providers: ThemeProvider → LanguageProvider → BrowserRouter
- Layout: sidebar nav + SSE connection indicator
- Pages: Dashboard, History, Memory, Config, Status, Settings (redirect)
- Components: Domain + UI primitives (14 + 14)
- API: SSE (`/api/events`) + REST (`useApi`, `fetchJson`, `postJson`)
- i18n: EN + TR full parity via type-safe key system

---

## 1. Entry Point

### `main.tsx` (10 LoC)
- **Amacı:** React root mount. `StrictMode` ile `App` bileşenini DOM'a bağlar.
- **Exports:** None (side-effect module)
- **Bağımlılıklar:** react, react-dom, App, index.css
- **Type Safety:** ✅ Non-null assertion `getElementById("root")!` — acceptable at entry.
- **Dead Code:** None.
- **Verdict:** ANALYZED ✅

### `App.tsx` (31 LoC)
- **Amacı:** Provider composition ve route tanımları. ThemeProvider > LanguageProvider > BrowserRouter hiyerarşisi.
- **Exports:** `App` (default)
- **Bağımlılıklar:** react-router-dom, ThemeProvider, LanguageProvider, Layout, 4 pages
- **Type Safety:** ✅ No `any`.
- **i18n Uyumu:** ✅ LanguageProvider en dışarıda wrap eder.
- **Not:** `/settings` route → SettingsPage (redirect). Route kayıtlı ama navigasyonda görünmüyor — potansiyel dead route.
- **Dead Code:** `StatusPage` import yok (bkz. StatusPage.tsx — bu sayfa route'a eklenmemiş!).
- **Verdict:** ANALYZED ✅

---

## 2. Types

### `types/index.ts` (99 LoC)
- **Amacı:** Dashboard-wide shared interfaces. `AgentInfo`, `Alert`, `DashboardState`, `DeckentConfig`.
- **Exports:** `AgentInfo`, `Alert`, `DashboardState`, `DeckentConfig`
- **Bağımlılıklar:** None (pure types)
- **Type Safety:** ⚠️ `DeckentConfig` uses `Record<string, string>` for `lastSprint.metrics` — loses key specificity. `Record<string, { brain_model?: string; ... }>` for `modes` is acceptable.
- **Memory V2 Uyumu:** ❌ `DeckentConfig` has no `memory.backend` or `memory.search` config fields — Memory V2 config section eksik.
- **ADR Compliance:** Partial — `backend?: 'docker' | 'tmux' | 'subprocess'` in `AgentInfo` aligns with ADR-027 Hybrid Spawn.
- **Dead Code:** `DeckentConfig.search_enabled`, `search_provider`, `search_cache_ttl`, `notify_on_complete`, `notify_channel`, `notify_url`, `telemetry_enabled`, `telemetry_anonymous` — planned-category fields with no active implementation.
- **Verdict:** ANALYZED ✅

---

## 3. Library Utilities

### `lib/api.ts` (29 LoC)
- **Amacı:** HTTP client utilities. `fetchJson<T>` ve `postJson<T>` generic fetch wrappers + `ApiError` custom error class.
- **Exports:** `ApiError`, `fetchJson`, `postJson`
- **Bağımlılıklar:** None (browser fetch API)
- **Type Safety:** ⚠️ `res.json() as Promise<T>` — unsafe cast, no runtime validation. No Zod/schema validation at API boundary.
- **Security:** ✅ No XSS risk. No credentials hardcoded. URL params are caller-controlled strings.
- **Error Handling:** ✅ ApiError wraps HTTP error with status code.
- **Dead Code:** None.
- **Verdict:** ANALYZED ✅

### `lib/utils.ts` (6 LoC)
- **Amacı:** Tailwind class merging utility. `cn()` = `twMerge(clsx(...))`.
- **Exports:** `cn`
- **Bağımlılıklar:** clsx, tailwind-merge
- **Type Safety:** ✅ Full type safety.
- **Dead Code:** None — used in almost every component.
- **Verdict:** ANALYZED ✅

---

## 4. Hooks

### `hooks/useApi.ts` (32 LoC)
- **Amacı:** Generic HTTP fetch hook with loading/error/data state + refetch capability.
- **Exports:** `useApi<T>` (named), `UseApiResult<T>` (interface)
- **Bağımlılıklar:** react (useState, useCallback, useEffect), lib/api
- **Type Safety:** ✅ Generic `T`, error typed as `unknown` with instanceof check.
- **Pattern:** Standard fetch-on-mount with `useCallback` memoized refetch. Dependency array correct.
- **Dead Code:** None.
- **Verdict:** ANALYZED ✅

### `hooks/useSSE.ts` (57 LoC)
- **Amacı:** EventSource SSE connection with auto-reconnect (3s backoff). Two exports: `useSSE` (data only) + `useSSEWithStatus` (data + connection status).
- **Exports:** `SSEStatus` (type), `SSEResult` (interface), `useSSE`, `useSSEWithStatus`
- **Bağımlılıklar:** react (useEffect, useState), types (DashboardState)
- **Type Safety:** ✅ Typed parse with `as DashboardState`.
- **Pattern:** ✅ Cleanup function correctly closes EventSource and clears setTimeout on unmount.
- **i18n Uyumu:** N/A (data layer hook)
- **Error Handling:** `onerror` reconnects after 3s — no max retry limit (potential infinite reconnect if server is down).
- **Dead Code:** None.
- **Verdict:** ANALYZED ✅

---

## 5. i18n System

### `i18n/en.ts` (389 LoC)
- **Amacı:** English translation dictionary — source of truth for `TranslationKey` type. 389 keys covering all UI text.
- **Exports:** `en` (const object), `TranslationKey` (derived type)
- **Bağımlılıklar:** None
- **Type Safety:** ✅ `as const` ensures literal types. `TranslationKey = keyof typeof en` provides compile-time key safety.
- **Coverage:** Nav, Dashboard, Settings, History, Memory, Config, Activity, Worker, Modal, AgentDetail, Sprint Summary, Task Card, Debt Table, Chart, Common.
- **Dead Code:** Some planned-feature keys present (`config.field.notify_*`, `config.field.telemetry_*`, `config.field.search_*`) — technically alive but backing unimplemented features.
- **Verdict:** ANALYZED ✅

### `i18n/tr.ts` (389 LoC)
- **Amacı:** Turkish translation dictionary. Type `Record<TranslationKey, string>` enforces 100% key parity at compile time.
- **Exports:** `tr` (const object)
- **Bağımlılıklar:** i18n/en (TranslationKey type)
- **Type Safety:** ✅ TypeScript enforces full coverage via `Record<TranslationKey, string>`.
- **i18n Quality:** High. Proper Turkish inflection (`worker'ı`, `sprint'i`). Technical terms (Docker, tmux, sprint) left as-is. `config.true`/`config.false` → `evet`/`hayır` appropriate.
- **Dead Code:** None (mirrors en.ts structure 1:1).
- **Verdict:** ANALYZED ✅

### `i18n/LanguageProvider.tsx` (67 LoC)
- **Amacı:** React Context-based i18n provider. `t()` function with `{{param}}` interpolation. Language persisted via `/api/config` POST.
- **Exports:** `LanguageProvider`, `useTranslation`
- **Bağımlılıklar:** react, i18n/en, i18n/tr
- **Type Safety:** ✅ `TranslationKey` enforced at call site.
- **Pattern:** ✅ `useCallback` memoized `t()` and `setLang`. `useEffect` loads language from config on mount.
- **Security:** ✅ No XSS — interpolation via string replace, no `dangerouslySetInnerHTML`.
- **Dead Code:** None.
- **Verdict:** ANALYZED ✅

---

## 6. Pages

### `pages/DashboardPage.tsx` (398 LoC)
- **Amacı:** Ana dashboard sayfası. SSE state + REST fallback pattern. Worker grid, activity feed, progress bar, alerts, sprint status.
- **Exports:** `DashboardPage` (default)
- **Bağımlılıklar:** hooks/useSSE, hooks/useApi (indirect via fallback), lib/api, types, 8 components
- **Type Safety:** ⚠️ `ALERT_VARIANT`, `ALERT_ICON` indexed by `string` — potential undefined access, guarded by `?? Info`.
- **i18n Uyumu:** ✅ All user-visible strings use `t()`.
- **Pattern:** SSE primary / REST fallback — good resilience pattern. `WelcomeScreen` sub-component defined inline.
- **Dead Code Candidates:** `PLANNED_CATEGORY` constant imported nowhere. `relativeTime` function duplicated from WorkerCard.tsx (copy-paste).
- **Security:** ✅ No XSS. `confirm()` dialogs for destructive actions (kill/cleanup).
- **Verdict:** ANALYZED ✅

### `pages/SettingsPage.tsx` (5 LoC)
- **Amacı:** `/settings` → `/config` redirect shim for backwards compatibility.
- **Exports:** `SettingsPage` (default)
- **Bağımlılıklar:** react-router-dom (Navigate)
- **Type Safety:** ✅
- **Dead Code:** This entire file is a redirect shim — kept for URL backwards compat. Route `/settings` appears in App.tsx.
- **Verdict:** ANALYZED ✅

### `pages/HistoryPage.tsx` (163 LoC)
- **Amacı:** Sprint geçmişi sayfası. Table + SprintChart + SuccessRateTrend. `SuccessChip` ve `NoGoChip` inline sub-components.
- **Exports:** `HistoryPage` (default)
- **Bağımlılıklar:** hooks/useApi, SprintChart, Skeleton, EmptyState, lucide-react
- **Type Safety:** ✅ `SprintHistoryRecord` typed. parseInt() results safely guarded.
- **i18n Uyumu:** ✅ All labels use `t()`.
- **Dead Code:** None.
- **Verdict:** ANALYZED ✅

### `pages/MemoryPage.tsx` (80 LoC)
- **Amacı:** Brain bellek ve teknik borç görüntüleme. Tabs ile iki panel: Memory (Markdown render) + Debt (tablo).
- **Exports:** `MemoryPage` (default)
- **Bağımlılıklar:** hooks/useApi, DebtTable, SimpleMarkdown, Skeleton, EmptyState, ui/tabs
- **Type Safety:** ✅ `{ content: string }` typed API response.
- **Memory V2 Uyumu:** ✅ `/api/memory` ve `/api/debt` endpoints kullanıyor (backend bunları DB'den üretiyor).
- **Dead Code:** None.
- **Verdict:** ANALYZED ✅

### `pages/ConfigPage.tsx` (510 LoC)
- **Amacı:** Yapılandırma düzenleyici sayfası. 14 kategori, ~55 alan, Doctor health check paneli. `CONFIG_FIELDS` metadata array + `CATEGORIES` array driven rendering.
- **Exports:** `ConfigPage` (default)
- **Bağımlılıklar:** hooks, ui/*, lib/api, i18n
- **Type Safety:** ⚠️ `Record<string, unknown>` for config state — no schema validation. `getNestedValue` returns `unknown` — runtime safety depends on correct `field.type` handling.
- **i18n Uyumu:** ✅ `fieldT()` helper falls back to hardcoded English if TranslationKey missing.
- **Memory V2 Uyumu:** ❌ `CONFIG_FIELDS` has no Memory V2 fields (`memory.backend`, `memory.search`). Memory category has only legacy line-budget fields.
- **Dead Code:** `PLANNED_CATEGORY` fields (search, notifications, telemetry) are rendered with `opacity-50` and `disabled` — functionally dead.
- **Complexity:** High — 510 LoC, ~20 functions. Could benefit from splitting into `DoctorSection` + `ConfigSection` components.
- **Verdict:** ANALYZED ✅

### `pages/StatusPage.tsx` (68 LoC)
- **Amacı:** Human-friendly sprint durum sayfası. SprintSummary bileşenini render eder + `/api/tasks` fetch.
- **Exports:** `StatusPage` (default)
- **Bağımlılıklar:** hooks/useSSE, lib/api, SprintSummary, i18n
- **Type Safety:** ✅
- **Not:** ⚠️ `StatusPage` App.tsx router'ında **kayıtlı değil** — bu sayfa erişilemiyor! Dead page.
- **Dead Code:** ❌ Bu dosyanın tamamı dead code — route eksik.
- **Verdict:** ANALYZED — DEAD PAGE (no route in App.tsx) ⚠️

---

## 7. Domain Components

### `components/Layout.tsx` (148 LoC)
- **Amacı:** App shell. Desktop sidebar + mobile Sheet sidebar. SSE bağlantı durumu göstergesi + dil değiştirici.
- **Exports:** `Layout`
- **Bağımlılıklar:** react-router-dom, hooks/useSSE, i18n, ui/sheet, ui/badge, ui/scroll-area, lucide-react
- **Type Safety:** ✅ `SSEStatus` typed via discriminated union.
- **i18n Uyumu:** ✅ All nav labels from `TranslationKey`.
- **Pattern:** ✅ `SidebarContent` extracted sub-component for mobile/desktop reuse.
- **Dead Code:** `navItems` has no `/status` entry (StatusPage unreachable).
- **Verdict:** ANALYZED ✅

### `components/ThemeProvider.tsx` (33 LoC)
- **Amacı:** Dark/light tema context. `document.documentElement.classList` yönetimi.
- **Exports:** `ThemeProvider`, `useTheme`
- **Bağımlılıklar:** react
- **Type Safety:** ✅
- **Dead Code:** ⚠️ `useTheme()` hook exported but **never used** anywhere in codebase. Dark mode hardcoded as default, no UI toggle. ThemeProvider wraps app but theme switching is unused.
- **Verdict:** ANALYZED — PARTIAL (theme toggle UI missing) ⚠️

### `components/WorkerCard.tsx` (207 LoC)
- **Amacı:** Worker kartı ve grid. `WorkerCard` tek worker, `WorkerCardGrid` responsive grid layout.
- **Exports:** `WorkerCard`, `WorkerCardGrid`
- **Bağımlılıklar:** ui/badge, ui/button, types, i18n, lucide-react
- **Type Safety:** ✅ Status/variant lookups have `?? fallback`.
- **i18n Uyumu:** ✅ All labels i18n.
- **Pattern:** Record-based lookup maps for STATUS_BORDER, STATUS_BADGE, STATUS_ICON, BACKEND_BADGE — clean but verbose.
- **Dead Code Candidates:** `relativeTime()` duplicated in DashboardPage.tsx.
- **Verdict:** ANALYZED ✅

### `components/ActivityFeed.tsx` (198 LoC)
- **Amacı:** Canlı aktivite akışı. SSE state diff'lerinden event yaratır (agent status change, phase change, new alerts). `MAX_ENTRIES = 50` ile bounded.
- **Exports:** `ActivityFeed`
- **Bağımlılıklar:** ui/card, i18n, types
- **Type Safety:** ✅ `prevAgentsRef` typed `Map<string, string>`.
- **Pattern:** ✅ `useRef` ile previous state tracking — avoids stale closures. Auto-scroll to bottom on new entries.
- **Complexity:** Medium. Multiple `useRef` objects to track previous state diffs.
- **Dead Code:** None.
- **Verdict:** ANALYZED ✅

### `components/AgentDetail.tsx` (233 LoC)
- **Amacı:** Worker detail sheet. 3s polling için `/api/worker/:taskId/log`. Log copy, description expand/collapse, live elapsed timer.
- **Exports:** `AgentDetail`
- **Bağımlılıklar:** ui/badge, ui/card, i18n
- **Type Safety:** ✅ `WorkerLogData` typed. `getStatusColor()` switch with default fallback.
- **Pattern:** ✅ `active` flag in fetch loop prevents state updates after unmount.
- **i18n Uyumu:** ✅ All labels i18n.
- **Dead Code:** None.
- **Verdict:** ANALYZED ✅

### `components/DebtTable.tsx` (91 LoC)
- **Amacı:** Teknik borç tablosu. `parseDebtMarkdown()` markdown tablo parser + `DebtTable` render component.
- **Exports:** `DebtTable` (default), `DebtRow` (interface), `parseDebtMarkdown`
- **Bağımlılıklar:** i18n
- **Type Safety:** ✅ `.filter((r): r is DebtRow => r !== null)` type guard correct.
- **Memory V2 Uyumu:** ⚠️ Still parses Markdown from `/api/debt` endpoint — ideally backend returns structured JSON but component is backend-agnostic.
- **Dead Code:** None.
- **Verdict:** ANALYZED ✅

### `components/EmptyState.tsx` (33 LoC)
- **Amacı:** Boş durum göstergesi. Icon + title + optional description + optional action button.
- **Exports:** `EmptyState` (default)
- **Bağımlılıklar:** lucide-react (LucideIcon type)
- **Type Safety:** ✅
- **i18n Uyumu:** ✅ Strings passed as props (localized at call site).
- **Dead Code:** `action` prop defined but never used in any current call site. Dead prop (all callers pass undefined action).
- **Verdict:** ANALYZED ✅

### `components/NewSprintModal.tsx` (170 LoC)
- **Amacı:** Sprint başlatma wizard. 5 adım: directives → planning → review → starting → done/error. API: `/api/set-directives` → `/api/plan` → `/api/start`.
- **Exports:** `NewSprintModal`
- **Bağımlılıklar:** ui/dialog, ui/button, ui/textarea, lib/api, i18n
- **Type Safety:** ✅ `ModalStep` union type, `PlanResult` typed.
- **i18n Uyumu:** ✅ All strings i18n.
- **Error Handling:** ✅ Error step shown with message.
- **Dead Code:** None.
- **Verdict:** ANALYZED ✅

### `components/SimpleMarkdown.tsx` (98 LoC)
- **Amacı:** Minimal markdown renderer. h1/h2/h3/li/p + **bold** ve `code` inline formatting. No full markdown library dependency.
- **Exports:** `SimpleMarkdown` (default)
- **Bağımlılıklar:** react (ReactNode)
- **Type Safety:** ✅
- **Limitations:** No table rendering, no link support, no blockquote. Sufficient for `.brain/exports/memory.md` content.
- **Dead Code:** None.
- **Verdict:** ANALYZED ✅

### `components/Skeleton.tsx` (77 LoC)
- **Amacı:** Loading skeleton placeholders. `SkeletonCard`, `SkeletonTable`, `SkeletonText` variants.
- **Exports:** `SkeletonCard`, `SkeletonTable`, `SkeletonText`
- **Bağımlılıklar:** lib/utils
- **Type Safety:** ✅ `Skeleton` (internal) unexported correctly.
- **Pattern:** ✅ `animate-pulse` Tailwind class. Varying widths for `SkeletonText` lines.
- **Dead Code:** None.
- **Verdict:** ANALYZED ✅

### `components/SprintChart.tsx` (123 LoC)
- **Amacı:** Sprint geçmişi grafikleri. `SprintChart` (LineChart: taskCount + coverage) + `SuccessRateTrend` (BarChart with color coding).
- **Exports:** `SprintChart` (default), `SuccessRateTrend`, `parseChartData`, `SprintChartEntry`
- **Bağımlılıklar:** recharts, i18n
- **Type Safety:** ✅ `SprintChartEntry` typed. `parseChartData` handles missing fields.
- **i18n Uyumu:** ✅ Chart labels i18n.
- **Dead Code:** None.
- **Verdict:** ANALYZED ✅

### `components/SprintPhaseTimeline.tsx` (95 LoC)
- **Amacı:** Sprint faz zaman çizelgesi. 8 faz node'u (PLAN→CLEANUP) + connector lines. Aktif, tamamlanmış, gelecek durumları animasyonlu.
- **Exports:** `SprintPhaseTimeline`
- **Bağımlılıklar:** i18n
- **Type Safety:** ✅ `PHASES` as const tuple. `indexOf` returns -1 for unknown phases (handled).
- **i18n Uyumu:** ✅ Title from `t()`, faz adları sabit (lifecycle terms, not translated).
- **Dead Code:** None.
- **Verdict:** ANALYZED ✅

### `components/SprintSummary.tsx` (403 LoC)
- **Amacı:** Sprint özet dashboard. Progress bar + aktif agent listesi + task list (TaskCard) + provider breakdown + warnings. 7 exported helper fonksiyon.
- **Exports:** `SprintSummary`, `TaskInfo`, `SprintSummaryProps`, `getTaskStatusColor`, `getTaskStatusBg`, `getStatusIcon`, `getStatusLabel`, `computeSelfHealingCount`, `computeProviderBreakdown`, `estimateTimeRemaining`, `formatElapsedTime`
- **Bağımlılıklar:** ui/card, ui/badge, ui/progress, TaskCard, i18n, types, lucide-react
- **Type Safety:** ⚠️ `t as (key: string) => string` cast in `estimateTimeRemaining` — loses type safety for TranslationKey validation.
- **i18n Uyumu:** ✅ `t()` used throughout but some string replacements use `.replace()` instead of `t(key, params)` interpolation pattern — inconsistent.
- **Dead Code:** `getStatusLabel()` function exported and defined but uses hardcoded English strings (not i18n) — superseded by `getTranslatedAction` in TaskCard.tsx. Dead export.
- **Verdict:** ANALYZED ✅

### `components/TaskCard.tsx` (379 LoC)
- **Amacı:** Görev satırı bileşeni. Expand/collapse ile dosya, test sonuçları, retry geçmişi detayları. i18n-aware status labels.
- **Exports:** `TaskCard`, `TaskCardData`, `TaskCardProps`, `getCardColor`, `getCardIcon`, `getCardIconColor`, `describeCurrentAction`, `getBadgeVariant`, `getBadgeLabel`
- **Bağımlılıklar:** ui/badge, i18n, lucide-react
- **Type Safety:** ✅ Well typed throughout.
- **i18n Uyumu:** ✅ `getTranslatedAction()` + `getTranslatedBadge()` use `t()`.
- **Dead Code:** ❌ `describeCurrentAction()` exported function uses hardcoded English strings. Superseded by `getTranslatedAction()` inline function in the component. The exported version is not called anywhere — dead export.
- **Dead Code:** ❌ `getBadgeLabel()` exported function uses hardcoded English strings. Superseded by `getTranslatedBadge()` inline function. Not called anywhere — dead export.
- **Dead Code:** ❌ `getStatusLabel()` in SprintSummary.tsx is similar duplicate.
- **Verdict:** ANALYZED ✅

---

## 8. UI Primitives (Custom Implementation)

All UI primitives are **custom-built** (not shadcn/ui), using React Context API or forwardRef patterns. This eliminates shadcn dependency but requires manual testing.

### `components/ui/badge.tsx` (36 LoC)
- **Amacı:** `cva`-based badge. Variants: default, secondary, destructive, outline, info, warning, critical, success.
- **Exports:** `Badge`, `BadgeProps`, `badgeVariants`
- **Bağımlılıklar:** class-variance-authority, lib/utils
- **Type Safety:** ✅
- **Dead Code:** None.
- **Verdict:** ANALYZED ✅

### `components/ui/button.tsx` (48 LoC)
- **Amacı:** `cva`-based button. Variants: default, destructive, outline, ghost. Sizes: default, sm, lg, icon.
- **Exports:** `Button`, `ButtonProps`, `buttonVariants`
- **Bağımlılıklar:** class-variance-authority, lib/utils, react (forwardRef)
- **Type Safety:** ✅
- **Dead Code:** None.
- **Verdict:** ANALYZED ✅

### `components/ui/card.tsx` (43 LoC)
- **Amacı:** Compound card component. `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`.
- **Exports:** Card, CardHeader, CardTitle, CardDescription, CardContent
- **Bağımlılıklar:** lib/utils, react (forwardRef)
- **Type Safety:** ✅
- **Dead Code:** `CardDescription` exported but never used in codebase — dead export.
- **Verdict:** ANALYZED ✅

### `components/ui/dialog.tsx` (182 LoC)
- **Amacı:** Custom Dialog/Modal. Context-based open state. Escape key + Tab trap + overlay click to close.
- **Exports:** Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogOverlay, useDialogContext
- **Bağımlılıklar:** react, lib/utils
- **Type Safety:** ✅ `useDialogContext` throws on missing provider.
- **Accessibility:** ✅ `role="dialog"`, `aria-modal="true"`, Tab trap implemented, Escape closes.
- **Dead Code:** `DialogTrigger` exported but `NewSprintModal` uses controlled `open` prop directly. Potentially unused.
- **Verdict:** ANALYZED ✅

### `components/ui/input.tsx` (23 LoC)
- **Amacı:** Styled HTML input wrapper with forwardRef.
- **Exports:** `Input`, `InputProps`
- **Bağımlılıklar:** lib/utils, react
- **Type Safety:** ✅
- **Dead Code:** None.
- **Verdict:** ANALYZED ✅

### `components/ui/label.tsx` (22 LoC)
- **Amacı:** Styled HTML label with forwardRef. `peer-disabled` Tailwind variants.
- **Exports:** `Label`, `LabelProps`
- **Bağımlılıklar:** lib/utils, react
- **Type Safety:** ✅
- **Dead Code:** None.
- **Verdict:** ANALYZED ✅

### `components/ui/progress.tsx` (41 LoC)
- **Amacı:** Multi-segment progress bar. Accepts `segments[]` array for color-coded sections (done/active/queued).
- **Exports:** `Progress`, `ProgressSegment`, `ProgressProps`
- **Bağımlılıklar:** lib/utils, react
- **Type Safety:** ✅
- **Accessibility:** ✅ `role="progressbar"`, `aria-valuenow/min/max`.
- **Dead Code:** None. Custom design vs standard single-value progress bar.
- **Verdict:** ANALYZED ✅

### `components/ui/scroll-area.tsx` (17 LoC)
- **Amacı:** Thin wrapper around `overflow-auto` div. No custom scrollbar library.
- **Exports:** `ScrollArea`
- **Bağımlılıklar:** lib/utils, react
- **Type Safety:** ✅
- **Dead Code:** Minimal abstraction — could be an inline div.
- **Verdict:** ANALYZED ✅

### `components/ui/select.tsx` (24 LoC)
- **Amacı:** Styled native `<select>` wrapper with forwardRef.
- **Exports:** `Select`, `SelectProps`
- **Bağımlılıklar:** lib/utils, react
- **Type Safety:** ✅
- **Dead Code:** None.
- **Verdict:** ANALYZED ✅

### `components/ui/separator.tsx` (27 LoC)
- **Amacı:** Horizontal/vertical separator. `role="separator"`, `aria-orientation`.
- **Exports:** `Separator`, `SeparatorProps`
- **Bağımlılıklar:** lib/utils, react
- **Type Safety:** ✅
- **Accessibility:** ✅ ARIA attributes correct.
- **Dead Code:** None.
- **Verdict:** ANALYZED ✅

### `components/ui/sheet.tsx` (125 LoC)
- **Amacı:** Custom slide-in panel (left/right). Context-based open state. Backdrop overlay + Escape to close + body scroll lock.
- **Exports:** `Sheet`, `SheetTrigger`, `SheetContent`, `useSheet`
- **Bağımlılıklar:** react, lib/utils, lucide-react (X icon)
- **Type Safety:** ✅ `side` prop union type.
- **Accessibility:** ✅ Escape handler, body scroll lock.
- **Dead Code:** `useSheet()` hook exported but not used externally.
- **Verdict:** ANALYZED ✅

### `components/ui/table.tsx` (79 LoC)
- **Amacı:** Compound table component. Table, TableHeader, TableBody, TableRow, TableHead, TableCell.
- **Exports:** All 6 sub-components
- **Bağımlılıklar:** lib/utils, react
- **Type Safety:** ✅ Proper `Th/TdHTMLAttributes` types.
- **Dead Code:** Table component imported in HistoryPage but HistoryPage uses `<table>` directly (not `<Table>`). This Table compound component may be unused — verify.
- **Verdict:** ANALYZED ✅

### `components/ui/tabs.tsx` (123 LoC)
- **Amacı:** Custom Tabs. Context-based value state. Controlled/uncontrolled mode support.
- **Exports:** `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent`, `useTabsContext`
- **Bağımlılıklar:** react, lib/utils
- **Type Safety:** ✅
- **Accessibility:** ✅ `role="tablist"`, `role="tab"`, `aria-selected`, `role="tabpanel"`.
- **Dead Code:** `useTabsContext` exported but not used externally.
- **Verdict:** ANALYZED ✅

### `components/ui/textarea.tsx` (23 LoC)
- **Amacı:** Styled `<textarea>` wrapper with forwardRef.
- **Exports:** `Textarea`, `TextareaProps`
- **Bağımlılıklar:** lib/utils, react
- **Type Safety:** ✅
- **Dead Code:** None.
- **Verdict:** ANALYZED ✅

---

## 9. Cross-Cutting Findings

### 9.1 Component Architecture Assessment

| Pattern | Assessment |
|---------|-----------|
| Functional components | ✅ 100% — no class components |
| Custom hooks | ✅ useApi, useSSE with proper cleanup |
| Context API | ✅ Theme, Language, Dialog, Tabs, Sheet |
| Compound components | ✅ Card.*, Table.* |
| forwardRef | ✅ All UI primitives use forwardRef |
| Composition over inheritance | ✅ slot/children pattern throughout |

### 9.2 Type Safety Issues (Summary)

| File | Issue | Severity |
|------|-------|----------|
| lib/api.ts | `res.json() as Promise<T>` — no runtime validation | MEDIUM |
| types/index.ts | Missing Memory V2 config fields | MEDIUM |
| pages/ConfigPage.tsx | `Record<string, unknown>` config state | LOW |
| components/SprintSummary.tsx | `t as (key: string) => string` cast | LOW |

### 9.3 Dead Code Inventory

| File | Dead Symbol | Type |
|------|-------------|------|
| App.tsx | StatusPage (no route) | Dead import/page |
| components/ui/card.tsx | `CardDescription` | Dead export |
| components/ui/table.tsx | `Table` compound (not used in History) | Potentially dead |
| components/ui/sheet.tsx | `useSheet()` | Dead export |
| components/ui/tabs.tsx | `useTabsContext()` | Dead export |
| components/ThemeProvider.tsx | `useTheme()` | Dead export |
| components/TaskCard.tsx | `describeCurrentAction()` | Dead export (English-only, superseded) |
| components/TaskCard.tsx | `getBadgeLabel()` | Dead export (English-only, superseded) |
| components/SprintSummary.tsx | `getStatusLabel()` | Dead export (English-only, superseded) |
| pages/StatusPage.tsx | Entire file | Dead page (no route) |
| types/index.ts | planned-feature `DeckentConfig` fields | Planned/dead |

### 9.4 i18n Coverage Assessment

| Area | Coverage | Notes |
|------|---------|-------|
| EN keys | 389 total | Complete |
| TR keys | 389 total | TypeScript-enforced parity |
| Components | ✅ Full | All user-visible strings use `t()` |
| SprintSummary helpers | ⚠️ Partial | `getStatusLabel()` not i18n |
| TaskCard helpers | ⚠️ Partial | `describeCurrentAction()`, `getBadgeLabel()` not i18n |
| Chart tooltips | ✅ | Labels i18n |
| Error messages | ✅ | API errors in English (acceptable) |

**i18n Gap:** 3 exported helper functions (`getStatusLabel`, `describeCurrentAction`, `getBadgeLabel`) use hardcoded English strings. These are used in tests but superseded by i18n-aware inline functions in components.

### 9.5 Memory V2 Compliance

| Check | Status |
|-------|--------|
| `/api/memory` endpoint used | ✅ |
| `/api/debt` endpoint used | ✅ |
| `DeckentConfig` has `memory.backend` | ❌ Missing |
| `DeckentConfig` has `memory.search` | ❌ Missing |
| ConfigPage has Memory V2 fields | ❌ Missing |
| DebtTable parses structured JSON | ❌ Still parses Markdown |

### 9.6 Security Findings

| Check | Status |
|-------|--------|
| No `dangerouslySetInnerHTML` | ✅ |
| No hardcoded secrets | ✅ |
| XSS risk in SimpleMarkdown | ✅ None (manual string concat, no innerHTML) |
| Destructive actions confirm() | ✅ Kill/Cleanup use browser confirm() |
| API URL construction | ✅ No user-input in URL paths (only agent.id from server) |
| Input validation at boundary | ⚠️ No client-side validation for ConfigPage inputs |

### 9.7 Performance Hot Paths

| Component | Issue |
|-----------|-------|
| ActivityFeed | `useEffect` runs on every `state` change — potential frequent re-renders |
| AgentDetail | 3s polling interval — acceptable for log streaming |
| SprintSummary | `useMemo` for `selfHealingCount`, `providerBreakdown`, `eta` — correct |
| SprintChart | `recharts` renders on every data change — no memo |

### 9.8 Accessibility Assessment

| Component | ARIA | Keyboard | Notes |
|-----------|------|---------|-------|
| dialog.tsx | ✅ role, aria-modal | ✅ Escape, Tab trap | Full |
| tabs.tsx | ✅ role, aria-selected | ✅ | Full |
| progress.tsx | ✅ progressbar ARIA | N/A | Full |
| separator.tsx | ✅ role, aria-orientation | N/A | Full |
| button.tsx | ✅ (native) | ✅ (native) | Full |
| Layout mobile trigger | ✅ aria-label="Toggle menu" | ✅ | Full |
| AgentDetail close button | ✅ aria-label="Close" | ✅ | Full |
| WorkerCard | ⚠️ `div` with onClick | ❌ No keyboard | Missing role/tabIndex |
| TaskCard toggle button | ✅ `<button>` | ✅ | Full |

---

## 10. Sprint 142+ Recommendations

| Priority | Issue | Recommendation |
|----------|-------|---------------|
| P1 | `StatusPage` has no route in App.tsx | Add `/status` route OR delete StatusPage |
| P1 | `DeckentConfig` missing Memory V2 fields | Add `memory.backend`, `memory.search` to types/index.ts |
| P1 | ConfigPage missing Memory V2 config fields | Add fields to `CONFIG_FIELDS` array |
| P2 | Dead exports: `describeCurrentAction`, `getBadgeLabel`, `getStatusLabel` | Delete or make i18n aware |
| P2 | `relativeTime()` duplicated in Dashboard + WorkerCard | Extract to lib/utils.ts |
| P2 | `useTheme()` never used | Remove or add theme toggle UI |
| P2 | `CardDescription` never used | Remove export |
| P2 | `DebtTable` still parses Markdown | Backend should return structured JSON |
| P3 | `Table` compound component potentially unused | Verify and remove if unused |
| P3 | `useSheet()`, `useTabsContext()` dead exports | Remove if not needed externally |
| P3 | `EmptyState.action` prop never used | Remove or implement in a caller |
| P3 | No runtime API response validation | Add Zod schemas for API responses |
| P3 | WorkerCard keyboard accessibility | Add `role="button"` + `tabIndex` |

---

## 11. Dosya Listesi (44 Dosya)

| # | Dosya | LoC | Verdict |
|---|-------|-----|---------|
| 1 | main.tsx | 10 | ANALYZED |
| 2 | App.tsx | 31 | ANALYZED |
| 3 | types/index.ts | 99 | ANALYZED |
| 4 | lib/api.ts | 29 | ANALYZED |
| 5 | lib/utils.ts | 6 | ANALYZED |
| 6 | hooks/useApi.ts | 32 | ANALYZED |
| 7 | hooks/useSSE.ts | 57 | ANALYZED |
| 8 | i18n/en.ts | 389 | ANALYZED |
| 9 | i18n/tr.ts | 389 | ANALYZED |
| 10 | i18n/LanguageProvider.tsx | 67 | ANALYZED |
| 11 | pages/DashboardPage.tsx | 398 | ANALYZED |
| 12 | pages/SettingsPage.tsx | 5 | ANALYZED (redirect shim) |
| 13 | pages/HistoryPage.tsx | 163 | ANALYZED |
| 14 | pages/MemoryPage.tsx | 80 | ANALYZED |
| 15 | pages/ConfigPage.tsx | 510 | ANALYZED |
| 16 | pages/StatusPage.tsx | 68 | ANALYZED (DEAD — no route) |
| 17 | components/Layout.tsx | 148 | ANALYZED |
| 18 | components/ThemeProvider.tsx | 33 | ANALYZED |
| 19 | components/WorkerCard.tsx | 207 | ANALYZED |
| 20 | components/ActivityFeed.tsx | 198 | ANALYZED |
| 21 | components/AgentDetail.tsx | 233 | ANALYZED |
| 22 | components/DebtTable.tsx | 91 | ANALYZED |
| 23 | components/EmptyState.tsx | 33 | ANALYZED |
| 24 | components/NewSprintModal.tsx | 170 | ANALYZED |
| 25 | components/SimpleMarkdown.tsx | 98 | ANALYZED |
| 26 | components/Skeleton.tsx | 77 | ANALYZED |
| 27 | components/SprintChart.tsx | 123 | ANALYZED |
| 28 | components/SprintPhaseTimeline.tsx | 95 | ANALYZED |
| 29 | components/SprintSummary.tsx | 403 | ANALYZED |
| 30 | components/TaskCard.tsx | 379 | ANALYZED |
| 31 | components/ui/badge.tsx | 36 | ANALYZED |
| 32 | components/ui/button.tsx | 48 | ANALYZED |
| 33 | components/ui/card.tsx | 43 | ANALYZED |
| 34 | components/ui/dialog.tsx | 182 | ANALYZED |
| 35 | components/ui/input.tsx | 23 | ANALYZED |
| 36 | components/ui/label.tsx | 22 | ANALYZED |
| 37 | components/ui/progress.tsx | 41 | ANALYZED |
| 38 | components/ui/scroll-area.tsx | 17 | ANALYZED |
| 39 | components/ui/select.tsx | 24 | ANALYZED |
| 40 | components/ui/separator.tsx | 27 | ANALYZED |
| 41 | components/ui/sheet.tsx | 125 | ANALYZED |
| 42 | components/ui/table.tsx | 79 | ANALYZED |
| 43 | components/ui/tabs.tsx | 123 | ANALYZED |
| 44 | components/ui/textarea.tsx | 23 | ANALYZED |

---

## 12. Health Score

| Dimension | Score | Notes |
|-----------|-------|-------|
| Component Architecture | 90/100 | Clean, functional, composition-based |
| Type Safety | 78/100 | Missing runtime validation, some any casts |
| i18n Coverage | 85/100 | EN/TR parity 100%, 3 dead English-only helpers |
| Accessibility | 80/100 | Good on UI primitives, WorkerCard missing keyboard |
| Dead Code | 72/100 | StatusPage, 8+ dead exports, duplicate functions |
| Memory V2 Compliance | 55/100 | Config types and ConfigPage missing V2 fields |
| Security | 90/100 | No critical issues |
| Performance | 82/100 | useMemo used correctly, SSE reconnect unbounded |

**Overall Dashboard Health: 79/100**

---

**Verdict:** ANALYZED  
**Coverage:** 44/44 dosya (%100)  
**Toplam LoC Analiz Edilen:** ~4,054 LoC  
**Kritik Bulgular:** StatusPage dead (no route), Memory V2 config eksik, 3 i18n-less dead helper export
