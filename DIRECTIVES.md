# DIRECTIVES — Sprint 11B (Web Dashboard Pages)

## Hedef: Dashboard, settings, history, memory pages with full UI

## Task 1: Dashboard Ana Sayfa
- Replace src/dashboard/src/pages/DashboardPage.tsx placeholder with full implementation
- Sprint status card: sprint ID, phase badge (color-coded), status, updated time
- Worker table: columns (ID, Task, Status, Elapsed) with Kill button per row
  - Kill button: POST /api/kill/:workerId, confirm dialog, refresh on success
- Progress section: visual progress bar with segments (done=green, active=blue, pending=gray)
  - Text: "3/5 done, 1 active, 1 pending"
- Alert section: list of alerts with level badges (INFO=blue, WARNING=amber, CRITICAL=red)
- "Yeni Sprint" button → opens NewSprintModal
- NewSprintModal: textarea for directive content → POST /api/set-directives → show task count → POST /api/plan → show plan → Confirm button → POST /api/start
- SSE integration: useSSE('/api/events') for real-time DashboardState updates
- Fallback: if no SSE data, fetch GET /api/status on mount
- Dark theme: bg-zinc-950, cards bg-zinc-900, text zinc-100
- Create needed shadcn components: dialog.tsx, table.tsx, badge.tsx, textarea.tsx, progress.tsx
- Dosya: src/dashboard/src/pages/DashboardPage.tsx, src/dashboard/src/components/NewSprintModal.tsx, src/dashboard/src/components/ui/dialog.tsx, src/dashboard/src/components/ui/table.tsx, src/dashboard/src/components/ui/badge.tsx, src/dashboard/src/components/ui/textarea.tsx, src/dashboard/src/components/ui/progress.tsx
- Kapsam: src/dashboard/src/pages/DashboardPage.tsx, src/dashboard/src/components/

## Task 2: Ayarlar Sayfasi
- Replace src/dashboard/src/pages/SettingsPage.tsx placeholder with full implementation
- Config section: fetch GET /api/config on mount
  - Mode dropdown: max_plan, max5x_plan, pro_plan, api
  - Brain Model dropdown: opus, sonnet, haiku
  - Default Model dropdown: opus, sonnet, haiku
  - Max Workers number input
  - Language dropdown: en, tr
- Save button: POST /api/config with changed values, show success/error feedback
- Doctor section: fetch GET /api/doctor, display checklist with pass/fail icons (CheckCircle/XCircle from lucide-react)
- Refresh Doctor button
- Dark theme consistent with DashboardPage
- Create needed shadcn components: select.tsx, input.tsx, label.tsx, separator.tsx
- Dosya: src/dashboard/src/pages/SettingsPage.tsx, src/dashboard/src/components/ui/select.tsx, src/dashboard/src/components/ui/input.tsx, src/dashboard/src/components/ui/label.tsx, src/dashboard/src/components/ui/separator.tsx
- Kapsam: src/dashboard/src/pages/SettingsPage.tsx, src/dashboard/src/components/ui/

## Task 3: Sprint Gecmisi + Bellek + Borc Sayfasi
- Replace src/dashboard/src/pages/HistoryPage.tsx placeholder with full implementation
- Sprint history table: fetch GET /api/history, columns (Sprint ID, Tasks, Completed, No-Go Rate, Coverage, Duration)
- Trend chart with Recharts: ResponsiveContainer + LineChart
  - X axis: sprint ID
  - Left Y axis: test count (Line, blue)
  - Right Y axis: coverage % (Line, green)
  - Tooltip with custom formatter
  - CartesianGrid, Legend
- Replace src/dashboard/src/pages/MemoryPage.tsx placeholder with full implementation
- Memory tab: fetch GET /api/memory, render markdown content in scrollable code block (pre + whitespace-pre-wrap)
- Debt tab: fetch GET /api/debt, parse markdown table rows, render as styled HTML table with priority badges
- Use Tabs component to switch: History | Memory | Debt
- Create needed shadcn components: tabs.tsx
- Dosya: src/dashboard/src/pages/HistoryPage.tsx, src/dashboard/src/pages/MemoryPage.tsx, src/dashboard/src/components/SprintChart.tsx, src/dashboard/src/components/DebtTable.tsx, src/dashboard/src/components/ui/tabs.tsx
- Kapsam: src/dashboard/src/pages/HistoryPage.tsx, src/dashboard/src/pages/MemoryPage.tsx, src/dashboard/src/components/

## Task 4: Layout + Router + Navigation + UX
- Create src/dashboard/src/components/Layout.tsx
  - Sidebar (left, 240px): deckent logo/text at top, nav links below
  - Nav links: Dashboard (/), Settings (/settings), History (/history), Memory (/memory)
  - Active link: bg-zinc-800 with left border accent (blue)
  - Collapsible: hamburger icon on mobile (<768px), Sheet component slides in
  - Sidebar: bg-zinc-900 border-r border-zinc-800
  - Main content area: flex-1 overflow-auto p-6 bg-zinc-950
- Update src/dashboard/src/App.tsx: wrap Routes in <Layout>, remove lazy placeholders, use direct imports
- Create src/dashboard/src/components/ThemeProvider.tsx: sets dark class on html, provides theme context
- Update src/dashboard/src/index.css: add dark theme variables, base styles (body bg-zinc-950 text-zinc-100), scrollbar styling
- Create sheet.tsx and scroll-area.tsx shadcn components for mobile sidebar
- Responsive design: sidebar hidden on mobile, toggleable via Sheet
- Dosya: src/dashboard/src/components/Layout.tsx, src/dashboard/src/App.tsx, src/dashboard/src/components/ThemeProvider.tsx, src/dashboard/src/index.css, src/dashboard/src/components/ui/sheet.tsx, src/dashboard/src/components/ui/scroll-area.tsx
- Kapsam: src/dashboard/src/components/, src/dashboard/src/App.tsx, src/dashboard/src/index.css

## Kalite Kuralları
- Main project tsc --noEmit + vitest run MUST still pass
- SIFIR değişiklik ana proje kaynak dosyalarında
- Dashboard build: cd src/dashboard && npm run build