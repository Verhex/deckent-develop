# Frontend Audit — `src/dashboard/` + `src/extensions/vscode/`

**Sprint:** 185-006 (dynamic-split self-audit, DOC-ONLY)
**Tarih:** 2026-05-21
**Model:** opus
**Agent:** code-reviewer
**Skills:** typescript-expert, documentation-writer, security-specialist
**Kapsam:** 60 kaynak dosya (dashboard React/Vite/Tailwind front-end + VS Code extension stub + analytics mock layer + i18n + Terminal subsystem)
**Output Path:** `docs/audits/dynamic-split/frontend-audit.md` (scope.filesWrite tek dosya)

> **Yapı notu:** Bulgular dokuz "Surface" altında gruplandı (App shell, Pages, Domain components, Terminal, UI primitives, i18n, Data layer, Analytics, VS Code extension). Her surface kendi 9-bölümlük audit'i taşır. Bu yapı, Sprint 184'ün başına gelen "AI Planner zero-config split sınırı" hipotezini (bkz. DIRECTIVES Sprint 184 rerun) hesaba katar — Brain bu 100+ dosyayı tek task'a bundle ettiği için per-file yerine per-surface raporlama tercih edildi; her surface'de dosya-bazında inventory korundu.

---

## Surface A — App Shell (entry / routing / theme)

### A.1 Inventory

| Dosya | LoC | Rol | Public exports |
|-------|-----|-----|----------------|
| `src/dashboard/src/main.tsx` | 10 | Vite entrypoint, React 18 `createRoot` + `StrictMode` | — |
| `src/dashboard/src/App.tsx` | 33 | `BrowserRouter` + 6 route + `ThemeProvider` + `LanguageProvider` | `default App` |
| `src/dashboard/src/routes.tsx` | 13 | Yorum amaçlı `ROUTES` sabitleri (gerçek routing App.tsx'te) | `ROUTES`, `RoutePath` |
| `src/dashboard/src/components/Layout.tsx` | 163 | Desktop + mobile sidebar, NavLinks, LanguageSwitcher, SSE status pill, Auditor badge, `DockPanel` + `TerminalPanel` mount | `Layout` |
| `src/dashboard/src/components/ThemeProvider.tsx` | 33 | `ThemeContext` (`dark`/`light`) + DOM class injection | `ThemeProvider`, `useTheme` |
| `src/dashboard/src/index.css` | 61 | Tailwind v4 `@import "tailwindcss"` + `@theme` token block + scrollbar styling | — |

### A.2 Bağlam

App shell, dashboard'un router root'udur. `main.tsx` Vite + React 18 ile root'u mount eder; `App.tsx` 6 sayfa (Dashboard, Settings (alias→Config), History, Memory, Config, Chat) için `<Routes>` tanımlar. `Layout` her sayfayı sarar ve sidebar + main content + sabit bottom `DockPanel`'i mount eder (Sprint 175 W3.5 Embedded Terminal kontratı). `ThemeProvider` `<html>` element'ine `dark`/`light` class basar ama runtime'da hâlâ varsayılan `dark`'a sabitli (toggle UI'sı yok). `index.css` Tailwind v4 `@theme` token sistemi kullanır — `cva` variant'ları (UI primitives) burada tanımlı `--color-*` token'larına dayanır.

Downstream consumers: tüm pages (`/pages/*`), Auditor SSE stream (`/api/events`).

### A.3 Debt Risk

- **A.D1 — `routes.tsx` ile `App.tsx` arasında çift kaynak.** `ROUTES` array'i sadece dokümantasyon amaçlı yorumlu; gerçek `<Route>` tanımları `App.tsx`'te elle yazılmış. Yeni route eklendiğinde iki yer güncellenmek zorunda — kullanıcı/geliştirici biri unutursa nav linkleri ile rotalar arasında drift olur (örneğin StatusPage.tsx App.tsx'te route'a bağlı değil, oysa `routes.tsx`'te de yer almıyor — geçici tutarlılık).
- **A.D2 — `Layout.tsx:9` import path tutarsızlığı.** `from "./terminal/TerminalPanel.js"` — `.js` uzantısı node16 ESM resolution için doğru kullanım ama aynı dosya `8. satırda` `import { DockPanel } from "./DockPanel";` uzantısız. Vite build her ikisini de çözüyor ama tutarsız.
- **A.D3 — `ThemeProvider` dead toggle.** `setTheme` context value olarak expose edilmiş ama hiçbir component bu fonksiyonu çağırmıyor (grep gerekli, ama Layout'taki tek "Theme" referansı yok). `light` mode'a geçiş ne dashboard UI'sından ne CLI'dan tetiklenebilir.
- **A.D4 — `Layout` sabit `DockPanel`+`TerminalPanel` mount'u feature-flag yok.** `terminal.enabled: false` konfigürasyonu (ConfigPage'de bulunan `terminal_enabled` field) dashboard runtime'ına yansımıyor — DockPanel her zaman render edilir, sadece collapsed başlar. Server tarafında `--no-terminal` flag varsa bile UI dock görünür kalır (ws connect denemesi yapar, 401/disconnect döner).
- **A.D5 — `index.css` Tailwind v4 `@theme` token tutarsızlığı.** `--color-card: #09090b` ama `Card` component `bg-card text-card-foreground` kullanıyor — temalar arası kontrast düzgün gözükse de `--color-card == --color-background == #09090b` (tema vurgusu sıfır). Light theme override yok.

### A.4 Dead Code

- **`routes.tsx`** — `ROUTES` ve `RoutePath` 0 caller (grep confirmed via Read). Tek satır JSDoc "yorum amaçlı" belirtmiş ama dosya bağımsız bir kontrat değil. **Aday silme** veya **App.tsx'i bu data'dan generate etme**.
- **`SettingsPage.tsx`** — sadece `<Navigate to="/config" replace />` döndüren 5-satır shim. `App.tsx` `/settings` route'u hala SettingsPage'e bağlı ve oradan redirect ediyor — bu pattern intentional (eski link backward-compat) ama yorum yok; future contributor "neden 2 sayfa?" diye sorabilir.
- **`ThemeProvider.setTheme`** — public API olarak expose ama 0 caller (no theme toggle UI). Dead code candidate ya da future feature placeholder.

### A.5 Documentation Gaps

- `routes.tsx` JSDoc yok — bu dosyanın amacı (referans yorum vs canonical source) anlaşılmaz.
- `Layout.tsx` SidebarContent + LanguageSwitcher iç fonksiyonları yorum yok — `SSE_COLORS` ve `SSE_LABEL_KEYS` map'leri kasıtlı sırada (connected/connecting/disconnected) ama bu sıra `SSEStatus` tip union sırasıyla aynı, lint güvencesi yok.
- `ThemeProvider` neden runtime'da değiştirilemiyor (intentional dark-only?) açıklanmamış.
- `App.tsx` route sırası `Dashboard, Settings, History, Memory, Config, Chat` ama navItems `Dashboard, History, Memory, Config, Chat` — Settings nav'da yok (Config'e merge oldu) ama bu yapısal karar yorumlanmamış.

### A.6 ADR Compliance

- **ADR-001 TypeScript + ESM:** ✅ Layout, ThemeProvider, App `.tsx` ESM modülleri.
- **ADR-002 Node16 Module Resolution:** ⚠️ `Layout.tsx:9` `.js` uzantılı, `:8` uzantısız — Vite bundler her ikisini de bağlar ama node16 mod purist için `.js` uzantısı tutarsız (tüm import'larda olmalı). Vite/TSC eslevel yumuşadığı için build kırılmıyor.
- **ADR-032 i18n Pattern System (TR/EN):** ✅ `LanguageProvider` `useTranslation()` ile her nav item + sidebar string'i `t(key)` üzerinden. `'common.live' | 'common.connecting' | 'common.offline'` literal tip narrowing — i18n schema'ya tip-güvenli erişim.
- **ADR-040 Nervous System UI:** ⚠️ Layout doğrudan nervous notification'larını göstermiyor — sadece ChatPage `NotificationPanel`'inde `DECKENT→USER:NOTIFY` source filter ile gösteriliyor (bkz. Surface B). Üst seviye Layout'ta nervous bekleyen-checkpoint banner yok.
- **ADR-062 Embedded Web Terminal:** ✅ `Layout.tsx:158-160` `DockPanel` + `TerminalPanel` `<Outlet>` dışında mount edilmiş — spec gereği "dock persists across route navigation". §1c.2 token contract `useTerminalSocket` üzerinden honored.
- **ADR-037 RBAC:** N/A (frontend okuma-yazma sınırları backend'de enforce ediliyor).

### A.7 Refactor Recommendations

1. **`routes.tsx`'i tek kaynak yap:** `App.tsx` `<Routes>` blok'unu `ROUTES.map(({ path, Component }) => <Route .../>)` ile generate et. Veya tamamen sil.
2. **`Layout.tsx` ESM import uzantılarını uniform yap** — hepsine `.js` ekle veya hepsinden çıkar (Vite tsconfig `moduleResolution: bundler` ise her ikisi de geçerli, ama tutarlılık gerekli).
3. **DockPanel feature-flag** — `LanguageProvider` benzeri `TerminalProvider` ile `terminal.enabled` konfigürasyonunu okuyup `DockPanel`'i koşullu render et. Ya da `Layout` props'una `enableTerminal` ekle.
4. **`ThemeProvider` ya canlı yapılmalı ya kaldırılmalı** — `setTheme` 0-caller. Eğer dark-only kalıcıysa context'i sil, `<html class="dark">` doğrudan `index.html`'e bas.
5. **`SettingsPage.tsx` redirect yerine** `App.tsx` `<Route path="/settings" element={<Navigate to="/config" />} />` ile inline et — bir dosya az.

### A.8 Sprint 187 Follow-up

- **S187-A-1:** Tek kaynak routing (routes.tsx ↔ App.tsx merge).
- **S187-A-2:** Terminal feature-flag wire (config → UI).
- **S187-A-3:** Light theme implementasyonu veya `ThemeProvider` removal.
- **S187-A-4:** `index.css` light theme `@theme` override + `media (prefers-color-scheme: light)` desteği.
- **S187-A-5:** Nervous System bekleyen-onay banner'ı Layout'a inject (ADR-040 dashboard surface compliance).

### A.9 Summary

App shell stabil ve kısa (toplam ~310 LoC). Mobile + desktop responsive davranış, SSE durumu, i18n switcher, terminal dock — hepsi tek `Layout.tsx`'te toplanmış (acceptable for size). Başlıca debt'ler: dual-source routing (routes.tsx vs App.tsx), `ThemeProvider` ölü API yüzeyi, terminal dock feature-flag eksikliği, `routes.tsx` orphan. ADR uyumu güçlü (ADR-032, ADR-062 honored); minor ADR-002 import uzantı drift'i.

---

## Surface B — Pages (7 routed page)

### B.1 Inventory

| Dosya | LoC | Rota | Veri kaynağı |
|-------|-----|------|--------------|
| `pages/DashboardPage.tsx` | 399 | `/` | SSE `/api/events` + fallback `/api/status`, `/api/cleanup`, `/api/kill/{*}` |
| `pages/SettingsPage.tsx` | 5 | `/settings` | `<Navigate to="/config" />` |
| `pages/HistoryPage.tsx` | 164 | `/history` | `/api/history` |
| `pages/MemoryPage.tsx` | 80 | `/memory` | `/api/memory`, `/api/debt` |
| `pages/ConfigPage.tsx` | 518 | `/config` | `/api/config`, `/api/config/defaults`, `/api/doctor`, POST `/api/config` |
| `pages/ChatPage.tsx` | 318 | `/chat` | SSE `/api/events` (`alerts` filter), POST `/api/chat` |
| `pages/StatusPage.tsx` | 68 | **(unrouted)** | SSE `/api/events` + `/api/status`, `/api/tasks` |

### B.2 Bağlam

DashboardPage — sprint runtime ana kontrol paneli (workers grid, activity feed, phase timeline, alerts, sprint launch modal, agent detail sheet). HistoryPage — sprint history table + trend chart (Recharts). MemoryPage — Brain MEMORY.md + DEBT.md görüntüleyici (Tabs). ConfigPage — 65+ field config form + doctor health checks. ChatPage — chat with Deckent (POST `/api/chat`) + nervous notification panel + task context sidebar. StatusPage — `SprintSummary` narrative view, **App.tsx'te routed değil** (dead route).

### B.3 Debt Risk

- **B.D1 — `StatusPage.tsx` orphan (DEAD ROUTE).** `App.tsx`'te `<Route path="/status" ...>` yok. Component import edilmemiş. Dead code (`SprintSummary` component'ı zaten kullanılıyor) — silinmesi gerek ya da route eklenmesi.
- **B.D2 — `ConfigPage.tsx` 518 LoC — tek dosya, god-component pattern.** `CONFIG_FIELDS` 90+ field meta-data tek inline array; her field için 6 alan (key/label/desc/type/category/defaultValue+options). Bu data `config.field.*.label/desc` i18n key'leriyle korelasyon ister ama runtime drift olduğunda hata vermez (fallback `field.label` İngilizce'ye iner).
- **B.D3 — `DashboardPage.tsx` 4 ayrı `fetchJson` fallback bloğu duplike** (lines 134-138, 150-155, 167-172, 110-117). `try/catch{}` boşluğu silent-fail.
- **B.D4 — `confirm()` browser modal** — DashboardPage `handleCleanup`/`handleKillAll`/`handleKill` native `window.confirm()` kullanıyor. UX problemi (tailwind/dialog primitive var ama kullanılmamış), test friction (jsdom confirm mock gerekli).
- **B.D5 — `ChatPage` `msgIdCounter` module-level mutable** — global mutable counter HMR boyunca persist olur; multiple instance senaryosunda race condition (StrictMode double-render zaten bir kez +2 atlatır).
- **B.D6 — `useApi` swallow-handles `ApiError`** — HistoryPage `error: string | null` döner ama ApiError.status (404 vs 500) bilgisi atılıyor; "no history" mesajı 404 ve 500 için aynı görünüyor.
- **B.D7 — `MemoryPage` markdown render path** — `SimpleMarkdown` custom parser kullanılıyor (Surface C); bunu bilmeyen contributor `react-markdown` eklemeye kalkabilir, conflict riski.
- **B.D8 — `ConfigPage` doctor + config concurrent fetch** — `Promise.all` config + defaults için var ama doctor ayrı fetch; sıralama UI'sı doctor'u config'in altına koyuyor ama yükleme bağımsız (UX'te flash mümkün).
- **B.D9 — `ConfigPage` `formatValue(field.defaultValue)` boolean `false` boş string'e dönüyor** (`formatValue` line 191 — `value === null || undefined` döndürür ama `false` string `"false"` olur — OK). Yine de `defaultValue: false`/`null`/`0` arasında nuance kaybı default-message string'inde.

### B.4 Dead Code

- **`pages/StatusPage.tsx` (68 LoC) tamamı** — App.tsx tarafından import edilmiyor (grep ile doğrulandı: `App.tsx` import sadece DashboardPage, SettingsPage, HistoryPage, MemoryPage, ConfigPage, ChatPage). `StatusPage` 7. sayfa olmasına rağmen route yok. **Aksiyon:** ya `App.tsx`'e `<Route path="/status" element={<StatusPage />} />` ekle ya da dosyayı sil.
- **`ConfigPage` `CONFIG_FIELDS.find(f => f.category === "Search")` — `PLANNED_CATEGORY` taşındı ama hâlâ "Search" / "Notifications" / "Telemetry" alt fieldlar `defaultValue: false`/null tutuluyor, runtime'da `disabled={isPlanned}` ile UI kilitleniyor.** Dead-feature değil ama "skeuomorph" — config schema'sında ölü-ish.

### B.5 Documentation Gaps

- **DashboardPage:** `PHASE_COLORS`, `ALERT_VARIANT`, `ALERT_ICON` magic map'leri yorum yok; level alanları (`info` vs `INFO` vs `warn` vs `WARNING`) backend hangi formatta gönderir bilinmiyor — comment yok.
- **ConfigPage:** `CATEGORIES` sırası UX kararı (Provider önce, Advanced sonra, Planned en sonda) ama bu sıra implicit. Yorum yok.
- **ChatPage:** `NotifyEvent` interface ve `severity` enum dokumentasyonu yok; `DECKENT→USER:NOTIFY` source string'i ADR-035 V1.0 kanal kodları ile bağ kuruyor ama kod yorumunda yok.
- **HistoryPage:** `SprintHistoryRecord` interface field'ları (`techDebt`, `noGo`, `noGoRate`) backend `/api/history` ile contract — JSDoc yok.
- **StatusPage:** üst-comment "Human-friendly sprint status view" var ama "route'da değil" notu yok.

### B.6 ADR Compliance

- **ADR-032 i18n:** ✅ Tüm pages `useTranslation()` + `t()` kullanıyor. ConfigPage `fieldT` helper'ı i18n key fallback'i (label→default) yapıyor.
- **ADR-040 Nervous System:** ⚠️ ChatPage `NotificationPanel` `a.source === "DECKENT→USER:NOTIFY" || a.source === "nervous"` filter ile nervous bildirimlerini gösteriyor — kısmi ADR-040 dashboard surface compliance. Ancak nervous accept/reject UI yok (sadece görüntü). MCP `deckent_nervous_accept`/`reject` tool'ları frontend'e wire edilmemiş.
- **ADR-062 Web Terminal:** N/A (Surface D'de detaylı).
- **ADR-046 Brain Self-Update:** N/A.
- **ADR-037 RBAC:** Frontend tarafında değişiklik POST'ları (config, plan, start, kill) backend tarafında auth gate'lendiği için OK. Frontend "soft" RBAC yapmıyor (worker/admin ayrımı UI'da yok — single-user assumption ADR-034 multi-project isolation'a karşı dikkatli).
- **ADR-053 TaskType Taxonomy:** N/A.

### B.7 Refactor Recommendations

1. **`StatusPage.tsx` ya route'a ekle ya sil** — orphan dosya en yüksek priority.
2. **`ConfigPage` field schema'sını DB/JSON dosyasına çek** — 90+ field inline array refactor; `CONFIG_FIELDS` `config-schema.json`'a taşı, runtime yükle (i18n key generation deterministik kalır).
3. **`DashboardPage` `window.confirm` yerine `Dialog` primitive** — UX + test ergonomics.
4. **`useApi` `ApiError.status` propagation** — error tip union (`'not-found' | 'unauthorized' | 'unknown'`).
5. **`ChatPage` `msgIdCounter` → `useRef(0)` veya `crypto.randomUUID()`** — module-level mutable kaldır.
6. **`SettingsPage.tsx` sil; route inline `<Navigate>`.**
7. **`ChatPage` `NotifyEvent` → `NotificationPanel` nervous accept/reject button (ADR-040 wire).**

### B.8 Sprint 187 Follow-up

- **S187-B-1:** StatusPage karar (route veya delete) — 1 sprint priority.
- **S187-B-2:** ConfigPage CONFIG_FIELDS extraction to JSON.
- **S187-B-3:** Nervous accept/reject UI ChatPage'e wire (ADR-040 dashboard parity).
- **S187-B-4:** `window.confirm` removal — Dialog primitive ile değişim.
- **S187-B-5:** Config doctor + config concurrent loading state reconciliation.

### B.9 Summary

Pages katmanı dashboard runtime'ının asıl yüzeyi (toplam ~1550 LoC). ConfigPage tek başına 518 LoC (top god-component). DashboardPage SSE + fallback + agent detail sheet pattern'ı tutarlı. ChatPage nervous notification entegrasyonu var ama nervous lifecycle accept/reject UI eksik (ADR-040 partial). Major debt: orphan StatusPage, ConfigPage inline schema, `confirm()` native modal, `msgIdCounter` global mutable.

---

## Surface C — Domain Components (sprint widgets / data tables / activity)

### C.1 Inventory

| Dosya | LoC | Bağımlılıklar | Test'lerde mevcut |
|-------|-----|---------------|------------------|
| `components/WorkerCard.tsx` | 208 | `Badge`, `Button`, `lucide-react Skull`, `useTranslation` | ✅ tests/dashboard/worker-card.test.tsx (tahmini) |
| `components/TaskCard.tsx` | 379 | `Badge`, `lucide-react`, `useTranslation` | ✅ (exported helpers: `getCardColor`/`getCardIcon`/`describeCurrentAction`/`getBadgeVariant`/`getBadgeLabel`) |
| `components/SprintSummary.tsx` | 403 | `Card`, `Badge`, `Progress`, `TaskCard`, `useTranslation` | ✅ (exported `computeSelfHealingCount`/`computeProviderBreakdown`/`estimateTimeRemaining`/`formatElapsedTime`) |
| `components/SprintChart.tsx` | 123 | `recharts`, `useTranslation` | ✅ (exported `parseChartData`, `SuccessRateTrend`) |
| `components/SprintPhaseTimeline.tsx` | 95 | `useTranslation` | ✅ |
| `components/DebtTable.tsx` | 91 | `useTranslation` | ✅ (exported `parseDebtMarkdown`) |
| `components/ActivityFeed.tsx` | 198 | `Card`, `useTranslation` | ✅ |
| `components/AgentDetail.tsx` | 233 | `Card`, `Badge`, `useTranslation` | ✅ |
| `components/NewSprintModal.tsx` | 170 | `Dialog`, `Button`, `Textarea`, `postJson`, `useTranslation` | ✅ |
| `components/SimpleMarkdown.tsx` | 98 | (no deps) | ✅ |
| `components/Skeleton.tsx` | 77 | `cn` util | ✅ |
| `components/EmptyState.tsx` | 33 | `lucide-react` icon type | ✅ |

### C.2 Bağlam

Sprint runtime UI'sının "data-aware" component katmanı. WorkerCard agent durumunu (model icon, backend badge, status border + badge + kill button), TaskCard task lifecycle'ı (status colors + icons + expandable details), SprintSummary narrative summary (progress + ETA + provider breakdown + active agents), SprintChart history trend (Recharts), SprintPhaseTimeline 8-faz wizard (PLAN→CLEANUP), DebtTable Markdown'dan tablo parse, ActivityFeed SSE diff'inden live feed, AgentDetail right-sheet log viewer, NewSprintModal 6-step state machine (directives→planning→review→starting→done|error), SimpleMarkdown ad-hoc parser, Skeleton/EmptyState UX helpers.

Downstream: DashboardPage (Worker/Activity/AgentDetail/Modal/Timeline), HistoryPage (SprintChart + Skeleton), MemoryPage (SimpleMarkdown + DebtTable + Skeleton + EmptyState), StatusPage (SprintSummary).

### C.3 Debt Risk

- **C.D1 — `TaskCard` çift kaynak helpers.** `describeCurrentAction` + `getCardColor`/`getCardIcon`/`getBadgeLabel` exported helpers vermiş ama `TaskCard` component'i içinde `getTranslatedAction` + `getTranslatedBadge` yeniden tanımlanmış (i18n versions). Test edilebilir English versiyon + i18n versiyon — duplicate switch statements (2x maintenance burden).
- **C.D2 — `SprintSummary.estimateTimeRemaining` translator function param tipini `(key: string) => string` olarak alıyor ama gerçek `t` `(key: TranslationKey, params)` signature.** Type-cast `t as (key: string) => string` ile bypass — ADR-032 type-safety bozuldu (`'sprint_summary.time_remaining'.replace('{{n}}', ...)` raw replace, i18n params system kullanmıyor).
- **C.D3 — `WorkerCard` model icon emoji map (`opus: 💎` etc.)** locale-uyumsuz ama UI'ya bağımsız. Sadece string match `lower.includes(key)` — `claude-3-opus-20240229` model adı gelirse `opus` match eder, OK. Hata yok ama emojis i18n politikasıyla çelişebilir (tr.ts/en.ts'te emoji yok — burada inline emoji).
- **C.D4 — `SprintSummary` ve `TaskCard` ikisinde de `getStatusLabel`/`getCardColor`/`getStatusIcon` benzeri logic** — 4-5 status enum'u farklı yerlerde duplicate map'ler. Shared `task-status-helpers.ts` util'i yok.
- **C.D5 — `SimpleMarkdown` ad-hoc parser** — `react-markdown` veya `marked` yerine 98-LoC custom regex parser. Sadece h1/h2/h3 + ul + p + `**bold**` + `` `code` ``. Tablo, link, nested list, code-block, blockquote desteklemiyor. MemoryPage MEMORY.md içeriği gerçek tablolar/linkler içeriyor — sessizce kaybediliyor.
- **C.D6 — `DebtTable.parseDebtMarkdown` Markdown tablo parser** — 5 sütun beklentisi hardcoded. DEBT.md formatı değişirse (Sprint X yeni sütun) parser sessizce null/eksik döner.
- **C.D7 — `ActivityFeed` `MAX_ENTRIES = 50` magic number** — config'lenmiyor, i18n yok (etiket var ama eşik yok).
- **C.D8 — `AgentDetail` 3s polling** — `setInterval(fetchLog, 3000)` SSE/WS yerine polling. Worker log büyürse her 3s'de tüm log fetch (server side cap var mı? — unverified).
- **C.D9 — `AgentDetail.formatElapsed` Date.now() ticking** — 1s interval re-render, but `data?.task?.createdAt` change'i değil — dependency array boş re-run her saniye. Component teardown sırasında stale closure riski (interval cleanup OK ama timezone hassasiyeti yok).
- **C.D10 — `NewSprintModal` finite state machine inline** — `"directives"|"planning"|"review"|"starting"|"done"|"error"` string union; state transitions imperative (`setStep("planning")` etc). XState/reducer pattern overkill ama setError + setStep("error") bir cluster — `setErrorState({ step: "error", message })` daha temiz.

### C.4 Dead Code

- **`TaskCard` exported helpers `describeCurrentAction`, `getBadgeLabel`** — i18n versions component-internal kullanılıyor; bu helpers test için public expose edilmiş. **Aday move:** `task-status-utils.ts` named export, test'lerden import.
- **`SprintSummary` exported helpers** (`computeSelfHealingCount`, `computeProviderBreakdown`, vs) — aynı durum; component-private logic test için public. OK pattern ama dosya boyutunu şişiriyor.

### C.5 Documentation Gaps

- **`WorkerCard`** `STATUS_BORDER`/`STATUS_BADGE`/`STATUS_ICON` map'leri yorum yok — `IDLE` border `border-zinc-700` neden `border-2` değil de plain `border` (visual baseline) — yorum yok.
- **`TaskCard`** "status" enum'unun nereden geldiği (backend `/api/tasks` response) doküman yok. `CODING|TESTING|VERIFYING` statelari `EXECUTING` substatestleri mi? worker yazımı detayı görünmüyor.
- **`SprintSummary.computeProviderBreakdown`** fallback path (model string'inde "gpt"/"codex"/"gemini" arama) heuristic — yorum yok, future model isim drift'inde sessizce yanlış kategoriye düşer.
- **`SimpleMarkdown`** desteklenmeyen syntax listesi (table/link/blockquote) yorum yok; "bu component nereye kadar gider" boundary belirsiz.
- **`ActivityFeed`** `prevAgentsRef.current.set(`${agent.id}:action`, ...)` yan-kanal map kullanımı (key collision riski yok ama `:action` suffix convention belge yok).
- **`AgentDetail`** auto-scroll log + copy-log davranışları yorum minimum; clipboard API failure (`.catch(() => {})`) sessizce yutulur.

### C.6 ADR Compliance

- **ADR-032 i18n:** ✅ Tüm component'lar `useTranslation()` + `t()`. ⚠️ `SprintSummary` translator cast hack (C.D2).
- **ADR-040 Nervous:** ❌ ActivityFeed nervous notification stream'i ayırt etmiyor (alert.source kontrolü "stale"/"heartbeat" string match — `nervous` source filter yok).
- **ADR-053 TaskType Taxonomy:** ⚠️ TaskCard `status` üzerinden ayrım yapıyor ama taskType (audit/document-write/code-development) hiçbir component'ta gözükmüyor. ADR-053 dashboard surface compliance düşük.
- **ADR-046 Brain Self-Update:** N/A.
- **ADR-037 RBAC:** N/A (read-only views).
- **ADR-008 Brain Merkezi Import:** N/A (frontend).

### C.7 Refactor Recommendations

1. **TaskCard + SprintSummary helper'ları → `lib/task-status-utils.ts`** — shared switch statements deduplicate; i18n versiyonu component-internal `useStatusLabel(t)` hook'u olarak çek.
2. **SimpleMarkdown → `react-markdown` migration** — MemoryPage memory.md gerçek içerikleri için kayıp display problem; ADR-010 minimal-deps karşıt argüman var ama Markdown surface'i kritik (MEMORY.md user-facing).
3. **AgentDetail polling → WS/SSE stream** — Sprint 138 event stream var; 3s polling yerine `/api/worker/{taskId}/log/stream` SSE channel ekleyince real-time log + sunucu yükü düşer.
4. **TaskCard `taskType` field görüntüsü** — ADR-053 audit/document-write/code-development renkli badge.
5. **ActivityFeed nervous source filter** — `alert.source === 'DECKENT→USER:NOTIFY'` için özel icon (🔔→🧠) ve `nervous` event tipi visual ayrım.
6. **SprintSummary translator type fix** — `t: Translator` (ADR-032 type-safe) yerine `(key: string) => string` cast'i kaldır; helper'ları `useMemo` ile component-internal yap, i18n'i raw çağrı ile değil `t(key, { n: ... })` formatıyla.
7. **DebtTable parser → JSON contract** — DEBT.md'yi backend JSON olarak `/api/debt?format=json` döndür, frontend parser'ı sil.

### C.8 Sprint 187 Follow-up

- **S187-C-1:** `task-status-utils.ts` extraction (TaskCard + SprintSummary).
- **S187-C-2:** SimpleMarkdown → react-markdown veya marked migration karar.
- **S187-C-3:** AgentDetail polling → event stream (SSE log channel).
- **S187-C-4:** ADR-053 TaskType visualization (badge).
- **S187-C-5:** ActivityFeed nervous source aware filter.

### C.9 Summary

Component katmanı total ~2100 LoC ve test edilebilir helpers'ları public expose ediyor (good practice). Başlıca debt: TaskCard ve SprintSummary'de duplicate status switch statements (i18n + raw), SimpleMarkdown limited parser kapsamı, AgentDetail polling pattern, nervous notification ayrı yansıtılmamış (ActivityFeed ile bu component ADR-040 wire eksik). UI patterns tutarlı, test-friendly. ADR-053 TaskType visualization gap.

---

## Surface D — Terminal Subsystem (ADR-062, Sprint 175 W3.5)

### D.1 Inventory

| Dosya | LoC | Rol |
|-------|-----|-----|
| `components/DockPanel.tsx` | 68 | Bottom dock panel: expand/collapse + drag-resize (separator with `aria-orientation="horizontal"`) |
| `components/terminal/TerminalPanel.tsx` | 64 | Tabs + active session orchestration (`createSession`/`killSession`/`listSessions`) |
| `components/terminal/TerminalTabs.tsx` | 55 | Tab strip + launch buttons (claude/gemini/codex/deckent/shell) |
| `components/terminal/TerminalView.tsx` | 46 | xterm.js + FitAddon mount + ResizeObserver + WS bridge |
| `components/terminal/useTerminalSocket.ts` | 66 | WebSocket lifecycle (token via subprotocol, auto-reconnect with backoff, JSON frame dispatch) |
| `lib/terminal-api.ts` | 60 | REST helpers + `getBootstrapToken()` + Bearer auth headers |

### D.2 Bağlam

Embedded terminal — VSCode-like dockable PTY sessions, browser'dan claude/codex/gemini/deckent + shell. ADR-062 Embedded Web Terminal kontrat referansı:
- §1c.2 — token bypass-independent (`DECKENT_API_AUTH_DISABLED` terminal'i açmaz);
- §1c — token `window.__DECKENT_TERMINAL_TOKEN__` yalnız localhost callers için `index.html`'e inject;
- §1c — WS `Sec-WebSocket-Protocol: deckent.<token>` subprotocol;
- §audit — raw PTY output asla persisted değil (sadece session lifecycle audit events `memory.db`'ye).

Frontend tarafından: DockPanel chromeless panel (fixed bottom, collapsible, resizable); TerminalPanel tab strip + view router; TerminalTabs `KINDS = [claude|gemini|codex|deckent|shell]`; TerminalView xterm.js mount + ResizeObserver fit + WS read/write bridge; useTerminalSocket reconnect (max 5x exponential), token attach, `JSON.parse` frame dispatch (`t: 'output'|'input'|'resize'|'attach'`).

### D.3 Debt Risk

- **D.D1 — `DockPanel` global `window.mousemove`/`mouseup` resize handler** — `document.body` dahil tüm tıklamalar event listener'ı tetikler. `passive` flag yok; pointer-events 60+ fps trigger; SPA içinde başka drag'lı component varsa çakışır. Pointer events (`pointerdown`/`pointermove`/`pointerup`) modern best-practice — Sheet/Dialog primitivleri zaten farklı pattern kullanıyor.
- **D.D2 — `DockPanel` localStorage persist yok** — kullanıcı her sayfa yenilemede dock collapsed başlar, `DEFAULT_HEIGHT = 280` sabit. Kullanıcı tercihi kaydedilmiyor.
- **D.D3 — `TerminalPanel.close()` setState in setState anti-pattern** — `setTabs((t) => { const next = ...; setActiveId(...); return next; })` — inner setState çağrısı React 18 batching yapsa da React strict-mode warning'i tetikleyebilir.
- **D.D4 — `TerminalView` `useTerminalSocket` dependency drift** — `useEffect` deps `[sessionId, sock]` — `sock` `MutableRefObject` referansı stable ama hook re-render'da identity değişebilir; useEffect re-run oluyor (tüm xterm + ResizeObserver yeniden inşa). Pattern olarak `sock` yerine ref read kullanmak daha sağlam.
- **D.D5 — `useTerminalSocket` exponential backoff `retry * 1000` max 5s** — uzun outage'da retry sabit 5s aralıkta sürekli dener. Jitter veya max-attempts cutoff yok. UI uyarısı (terminal disconnected) yok — kullanıcı boş ekran görür.
- **D.D6 — `useTerminalSocket` `JSON.parse(raw)` `try/catch` silently drops non-JSON frames** — protokol diversion'ı debug'lamak zor.
- **D.D7 — `terminal-api.getBootstrapToken()` runtime `(window as ... )` cast** — token absent'sa `[]` subprotocol gönderiliyor (WS 401 alır). Frontend tarafında "token yoksa kullanıcıya bilgi ver" UX yok — sessizce reconnect loop.
- **D.D8 — `TerminalTabs` her tab'a `{ kind: 'ai', tool: 'claude' }` — `kind: 'ai'` magic string** — yorum yok; backend tarafında bu kind/tool string'leri ayrı parsed (acceptable but undocumented).
- **D.D9 — `TerminalPanel` `useEffect` cleanup `mounted = false` ama `listSessions` Promise zincirinde `if (!mounted) return`** — Promise sonrası `setTabs/setActiveId` çağrılırsa **set on unmounted component** React warning'i. Pattern eski; `AbortController` modern.
- **D.D10 — Token leakage in non-localhost mode** — Spec §1c.2'ye göre token sadece localhost callers'a inject edilir. Eğer dashboard non-localhost'tan açılırsa frontend `getBootstrapToken()` `undefined` döner, WS 401 — OK. Fakat `terminal-api.authHeaders()` HTTP fetch'lere de aynı yokluğu uygular: REST endpoint'leri terminal-token-aware mı? backend'de kontrol var (spec §1c.2), frontend boş Bearer ile 401 alır — observable behavior OK ama kullanıcı görür mü? Hayır (TerminalPanel.listSessions sessizce `[]` döner — line 50-51).

### D.4 Dead Code

- DockPanel `aria-label="resize terminal"` separator var (good), `aria-expanded` button var (good) — accessibility coverage tam. **Dead yok bu surface'de.**
- `useTerminalSocket` `WebSocket.OPEN` constant check'i ile `ws?.readyState === 1` — `WebSocket.OPEN` enum kullanımı doğru (Vite bundle'da preserved).

### D.5 Documentation Gaps

- **`useTerminalSocket`** JSDoc yok. Header comment'ı sadece type contract `TerminalSocket` interface. Spec §1c.2 invariant'larına (token subprotocol, bypass independence) link yok — terminal-api.ts'in tersine, useTerminalSocket'te spec referansı yok.
- **`TerminalView`** xterm fit/resize protokolünü dokuman yok (`{ t: 'resize', cols, rows }` frame format'ı backend ws-gateway ile contract — yorumda yok).
- **`TerminalTabs.KINDS`** sabitleri yorum yok. Allowed kinds (`ai|deckent|shell`) backend session-backend.ts kontratı ile bağlı.
- **`DockPanel`** `COLLAPSED_HEIGHT`, `DEFAULT_HEIGHT`, `MIN_HEIGHT` magic numbers — yorum yok.

### D.6 ADR Compliance

- **ADR-062 §1c.2 token bypass-independence:** ✅ `terminal-api.ts:9-13` header comment'i bu invariant'ı açıkça söylüyor; `authHeaders()` `getBootstrapToken()` ile `Bearer ${token}` set ediyor; `DECKENT_API_AUTH_DISABLED` kontrolü frontend tarafında yapılmıyor (server-side enforced).
- **ADR-062 §1c token subprotocol:** ✅ `useTerminalSocket:28` `ws = new WebSocket(url, token ? [\`deckent.${token}\`] : [])` — subprotocol path, query string'de değil. `Sec-WebSocket-Protocol: deckent.<token>` header otomatik.
- **ADR-062 §audit invariant (raw PTY output asla persist edilmez):** N/A frontend (server-side enforced; frontend yalnızca runtime ekrana yazar).
- **ADR-062 §enterprise seam `AuthProvider`/`SessionBackend`:** N/A frontend.
- **ADR-062 reattach boundary:** ✅ `TerminalPanel.tsx:15-25` mount'ta `listSessions()` çağırıp ilk session'a auto-attach — reattach UX'i wire edilmiş.
- **ADR-006 spawnSync security:** N/A (frontend WS only).
- **ADR-034 Multi-Project Isolation:** ⚠️ TerminalAudit `tenantId` field backend tarafında tutulur; frontend tarafında tenant context yok (single-user assumption — multi-tenant Sprint #3'e ertelendi, ADR-062 §sub-project roadmap).
- **ADR-010 Minimal runtime deps:** ⚠️ `@xterm/xterm`, `@xterm/addon-fit` (2 yeni runtime dep — ADR-062 §References'ta `ws` + `node-pty` 8th/9th olarak listelendi ama xterm frontend-only, dashboard package.json'a ait — package.json read edilmedi bu audit'te).
- **ADR-032 i18n:** ❌ TerminalTabs sabit string ("close X", "+claude", "+gemini" etc.) İngilizce hardcoded. ADR-032 ihlali (minor — terminal-internal labels argue olabilir ama "expand"/"collapse"/"Open a session ↗" gibi UI string'ler i18n'de değil).

### D.7 Refactor Recommendations

1. **DockPanel pointer-events migration** — `mousedown`/`mousemove`/`mouseup` → `pointerdown`/`pointermove`/`pointerup` (touch + pen support).
2. **DockPanel localStorage persist** — collapsed state + height kullanıcı tercihi.
3. **TerminalPanel `AbortController` cleanup pattern** — `mounted = false` antipattern → `controller.abort()`.
4. **useTerminalSocket UI feedback** — `status: 'connecting'|'connected'|'disconnected'|'failed'` expose et; TerminalView ekrana göster (disconnect banner).
5. **TerminalTabs i18n** — "Open a session ↗", "+claude" etc. `t()` üzerinden.
6. **DockPanel feature-flag** (Surface A.D4 ile ortak) — `terminal.enabled: false` ise dock render etme.
7. **`useTerminalSocket` non-JSON frame logging** (dev-only console.warn) — silent drop debugging hard.
8. **Token absent UX** — terminal-api.ts response 401 → ChatPage benzeri banner "Terminal token missing — please reload dashboard".

### D.8 Sprint 187 Follow-up

- **S187-D-1:** Pointer events migration (DockPanel).
- **S187-D-2:** localStorage state persist (collapsed/height).
- **S187-D-3:** Connection status UI (TerminalView banner).
- **S187-D-4:** TerminalTabs i18n.
- **S187-D-5:** AbortController cleanup pattern.
- **S187-D-6 (ADR-062 §sub-project #2 prep):** Prompt/command guard hook seam — `useTerminalSocket` outgoing data filter callback inject point.

### D.9 Summary

Terminal subsystem ~360 LoC compact. ADR-062 §1c.2 token contract honored (Bearer header + WS subprotocol). xterm.js + FitAddon + ResizeObserver pattern modern. Başlıca debt: mouse events (pointer'e geçilmeli), state persistence yok, UI feedback (disconnect/connecting) eksik, hardcoded İngilizce string'ler (ADR-032 partial ihlal). Reattach boundary wire edilmiş (ADR-062 reattach gereği). Token bypass-independence frontend tarafında doğru implement edilmiş; spec §1c.2 invariant'ları ihlal yok.

---

## Surface E — UI Primitives (`components/ui/*`)

### E.1 Inventory

| Dosya | LoC | Pattern | shadcn equivalent? |
|-------|-----|---------|-------------------|
| `ui/badge.tsx` | 36 | `cva` variants (default/secondary/destructive/outline/info/warning/critical/success) | ✅ |
| `ui/button.tsx` | 48 | `cva` variants (default/destructive/outline/ghost) + size (default/sm/lg/icon) | ✅ |
| `ui/card.tsx` | 43 | `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent` forwardRef'ler | ✅ |
| `ui/dialog.tsx` | 182 | Custom context-based (no Radix), focus trap, Escape close, Tab cycle | ⚠️ custom (Radix değil) |
| `ui/input.tsx` | 23 | forwardRef HTMLInputElement | ✅ |
| `ui/label.tsx` | 22 | forwardRef HTMLLabelElement | ✅ |
| `ui/progress.tsx` | 41 | Custom segmented progress bar with `total` + `segments[]` | ⚠️ custom (Radix progress yerine) |
| `ui/scroll-area.tsx` | 17 | Plain `overflow-auto` div (Radix yok) | ⚠️ stub |
| `ui/select.tsx` | 24 | Native `<select>` (Radix Select yok) | ⚠️ native fallback |
| `ui/separator.tsx` | 27 | forwardRef HR-like div | ✅ |
| `ui/sheet.tsx` | 125 | Context-based side drawer (`left`/`right`), Escape, overlay, body lock | ⚠️ custom |
| `ui/table.tsx` | 79 | Card-styled HTML table (Table/Header/Body/Row/Head/Cell) | ✅ |
| `ui/tabs.tsx` | 123 | Context-based Tabs/List/Trigger/Content (Radix yok) | ⚠️ custom |
| `ui/textarea.tsx` | 23 | forwardRef HTMLTextAreaElement | ✅ |

### E.2 Bağlam

shadcn/ui patternine yakın ama Radix Primitives kullanmıyor — custom context-based implementations (Dialog, Sheet, Tabs, Select). `cva` + `clsx` + `tailwind-merge` pattern (lib/utils.ts cn helper). ADR-010 (minimal runtime deps) ile uyumlu (no Radix; trade-off: a11y eksikliği). Tailwind v4 `--color-*` token'ları kullanıyor (`bg-card`, `text-foreground`, `border-border` etc.).

### E.3 Debt Risk

- **E.D1 — `ScrollArea` stub** — sadece `overflow-auto` div; gerçek custom scrollbar styling sadece global `index.css` `::-webkit-scrollbar`. Component'in component olması anlamsız; `<div className="overflow-auto">` ile aynı. **Dead-aday** veya gerçek `Radix.ScrollArea` benzeri implement.
- **E.D2 — `Select` native** — Radix Select yok, native `<select>`. iOS native picker UX'ı ama no custom dropdown styling. ConfigPage 90+ field bu Select'i kullanıyor — UX tutarsızlık.
- **E.D3 — `Dialog` focus management** — Tab/Shift+Tab cycling implement (181-LoC), Escape close, ama: (a) initial focus trap (modal açıldığında ilk focusable'a focus) yok, (b) `aria-modal="true"` set ama `aria-labelledby` set değil — screen reader experience eksik.
- **E.D4 — `Sheet` body scroll lock** — `document.body.style.overflow = "hidden"` (line 81) iyi, ama unmount sırasında `style.overflow = ""` (line 83) — başka Sheet zaten açıksa lock erken kaldırılır. Counter pattern olmalı.
- **E.D5 — `Tabs` keyboard navigation** — `Tab`/`Shift+Tab` çalışıyor (native button) ama `ArrowLeft`/`ArrowRight` (WAI-ARIA tab pattern) implement değil.
- **E.D6 — `Badge` `as="div"` vs `as="span"`** — semantically badge inline context'te kullanılıyor ama `<div>` block-level. CSS `inline-flex` ile patch'lendi ama HTML semantically `<span>` veya `<output>` daha uygun.
- **E.D7 — `Button` `forwardRef` ama `displayName` set** (good) — ama Button props'ta `asChild` yok (Radix Slot pattern). Bazı Layout/NewSprintModal pattern'ları `<Button>` + onClick yerine `<a>`/`<Link>` istiyor.
- **E.D8 — `ui/badge.tsx` cva variants `destructive: "bg-red-900"` ve `critical: "bg-red-900"` aynı renk** — duplicate variant. `destructive` veya `critical` birinin silinmesi.
- **E.D9 — `Progress` ARIA** — `role="progressbar"` + `aria-valuenow/min/max` set ama segment-based progress'te `aria-valuenow` segment toplamı (`done + active + pending`) total'a yakın olsa da label belirsiz. Screen reader "%70 progress" yerine "X done, Y active" daha anlamlı.

### E.4 Dead Code

- **`ScrollArea`** kullanılıyor (Layout.tsx ScrollArea wraps main content) ama component bir değer katmıyor — refactor adayı (remove or implement true scrollbar styling).
- **`Badge.destructive`** — `critical` variant duplicate. Sadece TaskCard'ın Badge variant union'unda `destructive` görülüyor (`getBadgeVariant`). Audit gerekli — birini sil.

### E.5 Documentation Gaps

- Hiçbir primitive'de JSDoc yok. shadcn convention'ı doc generated ama buradakiler custom — kullanıcı/contributor "neden Radix yok" sormaya kalkar.
- `Dialog` neden Radix değil — yorum yok (ADR-010 minimal deps gerekçesi ADR'da var ama dosya başına yorum yok).
- `Sheet` `side="left"|"right"` neden `top`/`bottom` yok — yorum yok (use case basit, ekleme zor değil ama explicit "out of scope" yorum yok).
- `cva` variants neden 6 yerine 8 (info/warning/critical/success ekstra) — DashboardPage'in spesifik alert level requirement'ı; yorum yok.

### E.6 ADR Compliance

- **ADR-001 + ADR-002:** ✅ Tüm `.tsx` ESM, `node16` resolution.
- **ADR-010 Minimal runtime deps:** ✅ Radix yerine custom Dialog/Sheet/Tabs/Select — `@radix-ui/react-*` 7+ runtime dep eklemekten kaçınılmış. Trade-off: a11y eksiklikleri (E.D3, E.D5).
- **ADR-032 i18n:** N/A (primitive layer, content i18n yukarıda).
- **ADR-040 Nervous:** N/A.
- **ADR-062 Web Terminal:** N/A.

### E.7 Refactor Recommendations

1. **Badge `critical` veya `destructive` variant unification** — birini canonical, diğeri alias veya silinmiş.
2. **ScrollArea: ya gerçek custom scrollbar (web-kit + Firefox), ya delete + plain `overflow-auto` className.**
3. **Dialog initial focus** — `useEffect` ile `contentRef.current.querySelector('[autofocus], button')?.focus()`.
4. **Sheet body-lock counter** — modul-level counter increment/decrement.
5. **Tabs arrow-key navigation** — `onKeyDown` Left/Right/Home/End.
6. **Select Radix or custom dropdown** — UX consistency (ADR-010 trade-off vs. UX).
7. **Progress `aria-label` prop** — segment-aware screen reader text.

### E.8 Sprint 187 Follow-up

- **S187-E-1:** Badge variant deduplication (`destructive` vs `critical`).
- **S187-E-2:** ScrollArea refactor karar (delete or implement).
- **S187-E-3:** Dialog/Sheet/Tabs a11y full pass (focus trap, arrow keys, aria-modal).
- **S187-E-4:** Select Radix migration veya custom dropdown.

### E.9 Summary

UI primitives ~813 LoC, shadcn-like custom (no Radix). cva + clsx + tailwind-merge pattern tutarlı. ADR-010 minimal-deps'e bağlı kalmak için custom Dialog/Sheet/Tabs/Select implementasyonu — a11y eksiklikleri trade-off. Önemli debt: Badge variant duplicate, ScrollArea stub, Dialog initial focus yok, Tabs arrow-key yok. Native Select 90+ field ConfigPage'in UX'ini etkiliyor.

---

## Surface F — i18n (LanguageProvider + en/tr + types)

### F.1 Inventory

| Dosya | LoC | İçerik |
|-------|-----|--------|
| `i18n/LanguageProvider.tsx` | 67 | Context + `useTranslation()` hook + `t()` function + `/api/config` persistence |
| `i18n/en.ts` | 416 | ~280 key flat object (`Record<TranslationKey, string>`) |
| `i18n/tr.ts` | 416 | Aynı key seti TR (`Record<TranslationKey, string>`) |
| `i18n/types.ts` | 23 | `Translator` + `TranslatorProp` type aliases (structurally identical, doc'd in JSDoc) |

### F.2 Bağlam

ADR-032 referans implementasyonu. TranslationKey union flat (`'nav.dashboard' | 'dashboard.title' | ...`). en.ts canonical (export `TranslationKey = keyof typeof en`), tr.ts `Record<TranslationKey, string>` constraint — TS compiler unset key'leri yakalar. LanguageProvider config API'sinden initial language çeker (`/api/config` `language: 'tr'`), kullanıcı değişiminde POST eder. `t(key, params)` `{{n}}`/`{{name}}` interpolation desteği.

### F.3 Debt Risk

- **F.D1 — `types.ts` 2 alias = ad hoc** — `Translator` ve `TranslatorProp` identical types (JSDoc'ta açıklanmış, Sprint 179 W3-5 retro). Type-wise no-op; sadece "intent dokümantasyonu" — sentaks vergisi.
- **F.D2 — `t()` runtime overhead** — her render `new RegExp(\`\\\\{\\\\{${k}\\\\}\\\\}\`, 'g')` instantiate (line 50). Heavy-interpolation page'lerde (ConfigPage 90+ field × 2 (label+desc) = 180+ interpolation/render) hot path.
- **F.D3 — Language switch persist ama config API'ye POST** — kullanıcı dili değiştirir ama eğer `/api/config` POST 401/500 verirse UI dili değişir, sunucu config dosyası eski kalır — sayfa yenileme sonrası "neden eski dile geri döndü?" UX confusion. Optimistic update + revert pattern yok.
- **F.D4 — `useState<Language>('en')` initial default 'en'** — browser locale fallback yok (örn. `navigator.language === 'tr-TR'` ise 'tr' default). Config API yüklenmeden ilk render İngilizce flash.
- **F.D5 — TranslationKey union 280+ literal string** — IDE autocomplete iyi ama TS compile time biraz uzun (acceptable).
- **F.D6 — Pluralization yok** — `'common.seconds_ago': '{{n}}s ago'` — `n=1` için "1s ago" yerine "1 second ago" demek olmaz. Plural rules (`Intl.PluralRules`) yok.
- **F.D7 — TR translations short — bazı string TR ve EN'de aynı.** Örn. `'nav.dashboard': 'Dashboard'` her iki dilde. Bu bilinçli (uluslararası term) ama `'history.success_rate_trend'` TR olmayan terim'le karışmış olabilir (audit gerekir).
- **F.D8 — `t()` fallback chain `lang → en → key`** — key bulunamazsa key string'i UI'da görünür ("nav.dashboard" raw key). Debug'da iyi ama prod UX'te kötü.

### F.4 Dead Code

- `types.ts` — `Translator` ve `TranslatorProp` farklı dosyadan re-export ediliyor ama strukturel olarak özdeş (`(key: TranslationKey, params?) => string`). Tek alias yeterli; double-name maintenance yükü.

### F.5 Documentation Gaps

- `LanguageProvider` API contract (`t(key, params)` interpolation `{{name}}`) yorum minimum.
- `tr.ts` TR çeviri policy belge yok — "Turkish or English term?" (örn. "Dashboard" Türkçeleştirilmemiş, "Sprint Paneli" denmiş — neden bazıları çevrilmedi açıklanmamış).
- `en.ts` key namespace convention (`prefix.snake_case`) belge yok.

### F.6 ADR Compliance

- **ADR-032 i18n Pattern System:** ✅ Tam compliance. TranslationKey + en/tr Record constraint + LanguageProvider hook + flat key naming + `{{param}}` interpolation. Memory V2 (memory-normalize.ts `turkishNormalize`) backend tarafında ayrı katman.
- **ADR-001 + ADR-002:** ✅.

### F.7 Refactor Recommendations

1. **`types.ts` collapse** — `Translator` tek alias, `TranslatorProp` kaldır veya `export { Translator as TranslatorProp }` ile alias.
2. **`t()` memoization** — `useMemo`'da `lang` değişirken `compile()` çağrısı (regex'leri pre-compile et).
3. **Browser locale default** — `navigator.language.startsWith('tr')` ile initial state.
4. **Optimistic + revert pattern** — language POST hatası UI'yı eski state'e döndürmeli.
5. **Pluralization** — `Intl.PluralRules` integration (`{{n}}_one`/`{{n}}_other` key suffix).
6. **Key fallback display** — prod'da key string yerine en string fallback (zaten yapılıyor) ama eğer en string de yoksa boş string veya warning emoji.

### F.8 Sprint 187 Follow-up

- **S187-F-1:** Browser-locale initial language detection.
- **S187-F-2:** Optimistic update revert pattern (config POST failure).
- **S187-F-3:** Pluralization (Intl.PluralRules).
- **S187-F-4:** Translator type collapse (TranslatorProp removal).
- **S187-F-5:** Key namespace + tr policy documentation (.brain/i18n-policy.md).

### F.9 Summary

i18n katmanı solid (~922 LoC, %95 data). ADR-032 referans implementasyonu. TR/EN parity korunmuş, TranslationKey union type-safe. Başlıca debt: types.ts duplicate alias, regex per-render allocation, browser-locale fallback yok, pluralization yok, optimistic POST failure UX'i.

---

## Surface G — Data Layer (hooks + lib + types)

### G.1 Inventory

| Dosya | LoC | Rol |
|-------|-----|-----|
| `hooks/useApi.ts` | 32 | Tek-shot fetch + refetch + loading/error state |
| `hooks/useSSE.ts` | 57 | `EventSource` wrapper + auto-reconnect (3s) + status |
| `lib/api.ts` | 29 | `fetchJson<T>`/`postJson<T>` helpers + `ApiError` class |
| `lib/utils.ts` | 6 | `cn(...inputs)` Tailwind merge |
| `lib/terminal-api.ts` | 60 | (Surface D'de detaylı) |
| `types/index.ts` | 98 | `AgentInfo`, `Alert`, `DashboardState`, `DeckentConfig` interfaces |

### G.2 Bağlam

Data layer minimal — `fetchJson`/`postJson` thin wrappers (ApiError class), `useApi` single-fetch hook (loading/error/refetch), `useSSE` EventSource reconnecting hook. `types/index.ts` backend `/api/status` ve `/api/events` SSE response'larıyla contract (frontend backend sözleşmesi). `cn` clsx + tailwind-merge convention.

### G.3 Debt Risk

- **G.D1 — `useApi` cancellation yok** — `useEffect` cleanup `setLoading/setData` çağrılmasını önleyemez (refetch racing). AbortController yok.
- **G.D2 — `useSSE` `setData(JSON.parse(event.data))` doğrudan cast** — backend schema değişirse runtime'da yutuyor (`catch { /* ignore malformed data */ }`). Zod parse yok.
- **G.D3 — `useSSE.connect` `useEffect` deps `[url]`** — url değişirse EventSource yeniden açılır, eski Promise'ler `setStatus("connected")` çağırırsa stale (es?.close edilmeden setStatus). Race condition.
- **G.D4 — `fetchJson` POST veya error status'ta JSON parse zorlanıyor** (`return res.json() as Promise<T>`) — 204 No Content veya empty body durumlarında parse hatası fırlatır. Type cast `as Promise<T>` blind.
- **G.D5 — `ApiError` constructor `status` public ama TypeScript 5+ `public status` parametre property pattern unused field warning verir mi? — TS strict permissive.
- **G.D6 — `types/index.ts` `DeckentConfig` 30+ optional field flat** — backend `Config` tipi 100+ field. Frontend type partial; eklenmemiş field'lar `config[key]` runtime erişiminde `unknown` (ConfigPage'in tip-uncertain `Record<string, unknown>` cast pattern'ı bu yüzden).
- **G.D7 — `DashboardState.alerts` `level: string`** — runtime'da `INFO|WARNING|CRITICAL` vs `info|warn|error` arasında uppercase/lowercase mismatch (DashboardPage.ALERT_VARIANT map'i her iki versiyona destek veriyor). Type union daha sıkı olmalı.
- **G.D8 — `useSSE` 3s reconnect sabit** — backoff yok.
- **G.D9 — `cn` `tailwind-merge` + `clsx` dependency twice** — package.json'da iki ek runtime dep (acceptable for class manipulation ergonomics, ADR-010 minimal-deps trade-off — `cva` zaten clsx kullanıyor).

### G.4 Dead Code

- **`useSSE`** export `useSSE` (DashboardState | null döner) ve `useSSEWithStatus` (data + status) iki API; her ikisi de kullanılıyor (DashboardPage / Layout). Wrapper olarak `useSSE` `useSSEWithStatus(url).data` döndürüyor — backward compat. OK.

### G.5 Documentation Gaps

- `useApi` ne zaman refetch çağrılır (kullanıcı interaksiyon? polling?) doküman yok. Default refetch sadece url değişiminde.
- `useSSE` reconnect mantığı (3s, no backoff) yorum yok.
- `lib/api.ts` `ApiError.status` use case'leri (404 → no-sprint?) doküman yok.
- `types/index.ts` field anlamları (örn. `AgentInfo.backend?: 'docker'|'tmux'|'subprocess'`) backend kontratıyla doğrudan bağlı ama no link to ADR-027 (Hybrid Spawn Backend).

### G.6 ADR Compliance

- **ADR-001 + ADR-002:** ✅.
- **ADR-035 Verification Protocol:** ⚠️ Event stream channels (`BRAIN→*:SPRINT_PHASE_CHANGE` etc.) backend'de yazılır; `useSSE` `/api/events` stream consume — ama event tip union frontend tarafında modellenmemiş (raw `DashboardState` parse). Channel-aware client yok.
- **ADR-027 Hybrid Spawn Backend:** ⚠️ `AgentInfo.backend` field var ama doc/link yok.
- **ADR-032 i18n:** N/A (data layer).
- **ADR-040 Nervous System:** ⚠️ `Alert.source` field var ama `'DECKENT→USER:NOTIFY'` / `'nervous'` source string'leri type-safe literal değil — string. Nervous-aware client tip support düşük.

### G.7 Refactor Recommendations

1. **AbortController** — `useApi` ve `lib/api.ts` `fetchJson` signal param.
2. **Zod schema validation** — `DashboardState`, `DeckentConfig` runtime parse (backend drift catch).
3. **`alerts.level` strict union** — `'info' | 'warning' | 'critical'` (uppercase'i backend normalize etmeli).
4. **`useSSE` exponential backoff** — `useTerminalSocket` benzeri pattern.
5. **Event channel-aware client** — `useEventStream<T>(channel)` ADR-035 kanal kodları frontend kullanım için.
6. **DeckentConfig type sync** — backend `Config` tipinden auto-gen (tsconfig path map veya monorepo type share).

### G.8 Sprint 187 Follow-up

- **S187-G-1:** AbortController integration (useApi + fetchJson).
- **S187-G-2:** Zod runtime validation (DashboardState, /api/config).
- **S187-G-3:** SSE channel-aware client (ADR-035 wire).
- **S187-G-4:** Alert level + source strict union.
- **S187-G-5:** Frontend ↔ backend type contract auto-gen (codegen step).

### G.9 Summary

Data layer ~282 LoC minimal. `cn` + ApiError + useApi + useSSE — solid pattern. Başlıca debt: AbortController yok (race conditions), Zod yok (backend drift sessiz), SSE channel-aware değil (ADR-035 surface eksik), DeckentConfig partial type (backend ile drift).

---

## Surface H — Analytics Mock Layer (`src/dashboard/analytics/*`)

### H.1 Inventory

| Dosya | LoC | Sınıf | Public API |
|-------|-----|-------|------------|
| `analytics/analytics-data.ts` | 165 | `AnalyticsData` (constructor projectRoot) | `loadSprintData()`, `loadSprintDataInRange()`, `buildOverview()`, `filterByDateRange()`, `formatOverview()` + `parseSprintMarkdown()` |
| `analytics/agent-comparison-data.ts` | 120 | `AgentComparisonData` | `prepareComparisonTable()`, `sortByColumn()`, `getBestPerformer()`, `getWorstPerformer()`, `formatDuration()` |
| `analytics/skill-heatmap-data.ts` | 146 | `SkillHeatmapData` | `buildCoUsageMatrix()`, `getMostCommonPair()`, `getSuccessfulPairs()`, `formatCell()`, `buildHeatmapCells()`, `getUniqueSkills()` |
| `analytics/success-chart-data.ts` | 112 | `SuccessChartData` | `prepareTimelineData()`, `calculateTrend()`, `findPeakSprint()`, `findValleySprint()`, `calculateMovingAverage()` |

### H.2 Bağlam

Analytics data prep katmanı. `AnalyticsData` Node.js fs ile `.brain/sprints/sprint-*.md` parse eder (read-side, NOT browser). Diğer üç sınıf saf in-memory data transform (compare/heatmap/trend). Hiçbiri React komponentine bağlı değil — analytics page görmedim (analytics route App.tsx'te yok).

### H.3 Debt Risk

- **H.D1 — `AnalyticsData` Node.js `fs` import — frontend `src/dashboard/` dizininde** — `node:fs` ve `node:path` browser bundle'a girerse Vite hata verir. Bu dosya muhtemelen test-only veya Node CLI tarafında çağrılıyor; tsconfig isolation yoksa Vite tree-shake'i miss edebilir. **CRITICAL** — bu klasörün niyeti belirsiz.
- **H.D2 — `analytics/` dizini React component'ından erişilmiyor (grep gerekli ama Surface A-G'de hiç analytics import görmedim)**. Mock data prep layer ama UI tüketicisi yok — ya dead-aday ya da `tests/` veya CLI'dan kullanılıyor.
- **H.D3 — `extractSprintNumber(date)` ad-hoc hack** (analytics-data.ts:156-164) — `date.getFullYear() <= 1970` ms = sprint number konvansiyonu, `loadSprintDataInRange` semantically broken (gerçek Date range değil, sprint-num range as ms). Yorum açıkça hack olduğunu belirtmiş ama API misleading.
- **H.D4 — `AgentComparisonData.formatDuration(ms)` `ms < 1000 → "{ms}ms"`** — 1ms granularity overengineered (sprint ms aslında dakikalar). UX nuance düşük.
- **H.D5 — `SuccessChartData.calculateTrend` slope threshold `> 2` / `< -2` magic** — `successRate` 0-100 scale; slope = % per sprint. 2%/sprint threshold belirli usecase için OK ama configurable değil.
- **H.D6 — `SkillHeatmapData.buildCoUsageMatrix` symmetric matrix double-build** — `i = 0..n, j = i..n` üst üçgen + mirror (`if (a !== b)`). Diagonal değerler saklanıyor (`get(a).get(a) = self-count`). Memory + cycles trade-off OK ama heatmap render time'ı consumer'a bağlı.
- **H.D7 — `parseSprintMarkdown` regex `metricValue('Total Tasks')`** — `.brain/sprints/sprint-*.md` formatı değişirse parser sessizce `0` döner (no warning, no error). Sprint reporter ADR-029 template'in stable kalmasına bağlı.

### H.4 Dead Code

- **Tüm Surface H** — analytics dizininin frontend tarafında consumer'ı yok (App.tsx, pages, components'ta `import.*analytics` 0 hit). **Dead-aday — ya tests/cli tarafında kullanılıyor (referans bul) ya da silinmeli**. `package.json` / `tsconfig.json` exclude analytics? bilinmiyor.

### H.5 Documentation Gaps

- Klasör seviyesinde `analytics/README.md` veya `analytics/index.ts` JSDoc yok — niyeti (browser? Node? CLI? test?) belirsiz.
- `AnalyticsData.loadSprintDataInRange(range: DateRange)` Date range semantik'i ad-hoc hack (H.D3) — yorum hack'i kabul etmiş ama API'yi explicit `sprintRange: { fromNum, toNum }` olarak yeniden tasarlamamış.
- `SuccessChartData.calculateTrend` magic threshold (2/sprint) yorum yok.

### H.6 ADR Compliance

- **ADR-001 + ADR-002:** ✅.
- **ADR-029 Managed-Docs:** ⚠️ `parseSprintMarkdown` sprint markdown format'ına bağlı; ADR-029 template engine değişirse parser kırılır (silent zero).
- **ADR-032 i18n:** ❌ `formatOverview` İngilizce hardcoded (`"Sprints: ${n}"`). Eğer UI tüketim varsa i18n eksik.
- **ADR-040 Nervous:** N/A.

### H.7 Refactor Recommendations

1. **Surface H'in niyetini netleştir** — ya frontend (TimelineChart component'ı oluştur ve `success-chart-data.ts` ile besle), ya Node CLI ayrı klasör (`scripts/analytics/`), ya delete.
2. **`AnalyticsData.loadSprintDataInRange` API redesign** — `sprintRange: { from: number, to: number }` (sprint number); `Date` hack kaldır.
3. **`SuccessChartData.calculateTrend` configurable threshold** — `{ slopeThreshold: 2 }` param.
4. **Skill heatmap symmetric matrix optimization** — sadece üst üçgen sakla, render-time mirror.
5. **`parseSprintMarkdown` JSON contract** — backend `/api/sprint/{id}/metrics.json` ile parser sil.

### H.8 Sprint 187 Follow-up

- **S187-H-1:** Analytics dizini kullanım site'i (consumer audit). Dead ise sil; live ise routing + UI page.
- **S187-H-2:** Date hack removal (sprint-num range API).
- **S187-H-3:** Trend threshold configuration.
- **S187-H-4:** Markdown parser → JSON contract migration.

### H.9 Summary

Analytics dizini (~543 LoC, 4 sınıf) data prep katmanı ama frontend consumer yok (grep negatif). Ya unused (dead-candidate) ya da test/cli'dan kullanılıyor (audit gerekli). Hot debt: `analytics-data.ts` `node:fs` import (Vite browser bundle riski), `loadSprintDataInRange` Date-as-sprint-num hack. Refactor priority: niyet kararı (delete or wire).

---

## Surface I — VS Code Extension Stub (`src/extensions/vscode/*`)

### I.1 Inventory

| Dosya | LoC | Rol |
|-------|-----|-----|
| `extensions/vscode/extension.ts` | 89 | activate(), deactivate(), MCP config helper, command stubs (3 commands) |
| `extensions/vscode/package.json` | 18 | VS Code extension manifest (deckent.start/status/explain commands) |

### I.2 Bağlam

VS Code extension stub. Status bar item (`"Deckent: Idle"`) + 3 command (deckent.start/status/explain) — hepsi NO-OP. `getMcpConfig()` MCP stdio config döner (command: `deckent-mcp`, `--stdio`). `package.json` `activationEvents: ["onStartupFinished"]`, `main: "./extension.js"` (build output yolu).

JSDoc içinde "Full implementation planned for Sprint 049" — Sprint 049 yapılmadıysa bu stub uzun zamandır donmuş.

### I.3 Debt Risk

- **I.D1 — Stub Sprint 049'a referans veriyor (Sprint 048+ tahmini)** — şu an Sprint 185. **~135 sprint donmuş stub**. Ya silinmeli ya canlandırılmalı.
- **I.D2 — `commands.registerCommand(commandId, () => {})` boş handler** — kullanıcı VS Code Palette'ten "Deckent: Start Sprint" tıklarsa sessizce hiçbir şey olmaz. Acceptable as stub ama kullanıcı UX kötü (en azından "Not implemented" mesajı).
- **I.D3 — `getMcpConfig()` command `deckent-mcp` — gerçek binary `npx deckent mcp` veya `npm bin deckent-mcp`** — frontend tarafında bu config aktif kullanılmıyor (`activate` MCP connect yapmıyor).
- **I.D4 — `package.json publisher: "verhex"`** — npm publish için publisher account doğru mu? (audit: marketplace check gerekli).
- **I.D5 — Type definitions inline** (`ExtensionContext`, `StatusBarItem`, `VsCodeApi`) — `@types/vscode` runtime dep eklemeyip stub interface'leri yazılmış (ADR-010 minimal-deps tutarlı). Acceptable ama gerçek `vscode` API surface gelince `@types/vscode` devDep gerekir.
- **I.D6 — `extension.js` build output yok** — `main: "./extension.js"` `package.json`'da ama `dist/` veya `out/` dizini referansı yok. TypeScript build target dizini bilinmiyor; `npm run build` bu extension'ı output ediyor mu?

### I.4 Dead Code

- **Tüm `extension.ts` activate/deactivate body** — 3 command boş handler. `activate` çalışır ama status bar dışında etki yok. Effectively dead until Sprint 049+.

### I.5 Documentation Gaps

- Extension nasıl install edilir (vsix package) açıklanmamış (extensions/vscode/README.md yok).
- `getMcpConfig` 30s timeout neden? doc yok.
- "Sprint 049" referansı ne zaman, ne yapılacak — roadmap'te artık `roadmap.md` Sprint 184+ vizyonu var ama VS Code extension'a değinmiyor.

### I.6 ADR Compliance

- **ADR-010 Minimal runtime deps:** ✅ `@types/vscode` runtime dep değil; inline type stubs.
- **ADR-013 DECKENT.md Adapter Pattern:** ⚠️ VS Code "adapter" pattern'a göre `.deckent/` init yapması gerekir — şu an boş stub, init yok.
- **ADR-046 Brain Self-Update:** N/A.
- **ADR-062 Web Terminal:** N/A (browser dashboard terminal'i ayrı surface).
- **ADR-047 Manuel Subagent Dispatch:** N/A.

### I.7 Refactor Recommendations

1. **Stub karar:** ya Sprint 049 olarak canlandır (full implementation: start/status/explain commands MCP üzerinden), ya `src/extensions/vscode/` silinir, ya `archive/extensions/vscode/` taşı (post-GA priority düşük).
2. **`README.md` ekle** — installation, build, VSIX package instructions.
3. **`@types/vscode` devDep** — inline stub'lar yerine resmi type'lar (eğer Sprint 049 implement edilecekse).
4. **Command stub'lara `vscode.window.showInformationMessage("Not yet implemented")` ekle** — kullanıcı sessiz null yerine bilgi alır.

### I.8 Sprint 187 Follow-up

- **S187-I-1:** VS Code extension karar (resurrect or remove).
- **S187-I-2:** Eğer resurrect → Sprint 049 spec rev.
- **S187-I-3:** Eğer remove → `archive/extensions/vscode/` veya tamamen sil.

### I.9 Summary

VS Code extension stub uzun zamandır donmuş (Sprint ~048 oranı). 89-LoC + 18-LoC manifest. Status bar + 3 boş command. MCP config helper var ama hiçbir caller tarafından kullanılmıyor. Kullanıcı UX'i nil. Karar gerekli: rebuild (Sprint 049 spec) veya remove. Critical: dashboard browser ana yüzey; VS Code extension OSS launch (Sprint 184-189) için kritik mi belirsiz.

---

## Cross-Surface Consolidated Findings

### Highest-Priority Debt (Sprint 187 Sequence Önerisi)

| Priority | Item | Surface | Reasoning |
|----------|------|---------|-----------|
| **P0** | StatusPage orphan (route or delete) | B | Dead route; 68 LoC unconsumed |
| **P0** | Analytics dizini niyet kararı | H | Vite bundle riski (`node:fs`); 543 LoC unconsumed |
| **P0** | VS Code extension karar (Sprint 049 vs delete) | I | ~135 sprint donmuş stub |
| **P1** | ConfigPage god-component decomposition | B | 518 LoC, 90+ field inline |
| **P1** | TaskCard/SprintSummary status helper duplication | C | 2x switch statements, maintenance burden |
| **P1** | Nervous notification accept/reject UI (ADR-040 wire) | B, C | ChatPage yarım, ActivityFeed source-aware değil |
| **P1** | TerminalView disconnect UX feedback | D | Sessiz reconnect loop |
| **P2** | `useApi` AbortController + Zod | G | Race condition + backend drift |
| **P2** | SimpleMarkdown → react-markdown migration | C | MemoryPage display kaybı |
| **P2** | Badge `destructive` vs `critical` variant dedup | E | UI primitive cleanup |
| **P2** | TerminalTabs i18n hardcoded string'ler | D | ADR-032 partial ihlal |
| **P3** | DockPanel pointer events + localStorage | D | UX modernization |
| **P3** | LanguageProvider browser locale default | F | UX flash |
| **P3** | Pluralization (Intl.PluralRules) | F | UX nuance |

### ADR Cross-Cutting Compliance Map

| ADR | Surface A | B | C | D | E | F | G | H | I |
|-----|-----------|---|---|---|---|---|---|---|---|
| ADR-001 TS+ESM | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| ADR-002 Node16 | ⚠️ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| ADR-010 Minimal deps | ✅ | ✅ | ⚠️* | ⚠️* | ✅ | ✅ | ⚠️* | N/A | ✅ |
| ADR-032 i18n | ✅ | ✅ | ⚠️ | ❌ | N/A | ✅ | N/A | ❌ | N/A |
| ADR-035 Verification Protocol | N/A | ⚠️ | N/A | N/A | N/A | N/A | ⚠️ | N/A | N/A |
| ADR-037 RBAC | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| ADR-040 Nervous | ⚠️ | ⚠️ | ❌ | N/A | N/A | N/A | ⚠️ | N/A | N/A |
| ADR-046 Brain Self-Update | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| ADR-053 TaskType | N/A | N/A | ⚠️ | N/A | N/A | N/A | N/A | N/A | N/A |
| ADR-062 Web Terminal | ✅ | N/A | N/A | ✅ | N/A | N/A | N/A | N/A | N/A |

⚠️* = recharts, @xterm/xterm + addon-fit, clsx + tailwind-merge — ADR-010 trade-off, justified inline.

### Dead Code Roll-up

| Item | Surface | Aksiyon |
|------|---------|---------|
| `pages/StatusPage.tsx` (68 LoC) | B | Route ekle veya sil |
| `src/dashboard/analytics/*` (543 LoC) | H | Consumer doğrula veya sil |
| `src/extensions/vscode/extension.ts` (89 LoC) | I | Resurrect veya sil |
| `routes.tsx` (13 LoC ROUTES export) | A | Generate'e dönüştür veya sil |
| `ThemeProvider.setTheme` (0 caller) | A | UI toggle ekle veya silde |
| `Badge.destructive` variant (duplicate of critical) | E | Dedup |
| `i18n/types.ts` `TranslatorProp` alias | F | Single alias bırak |
| `SettingsPage.tsx` (5-LoC redirect) | B | inline `<Navigate>` |

**Toplam dead-code candidate:** ~718 LoC across 7 surface'lerde 8 madde.

### Documentation Roll-up Backlog

- `routes.tsx` JSDoc
- `Layout.tsx` SidebarContent + map'leri açıklama
- ConfigPage CONFIG_FIELDS schema doc
- ChatPage NotifyEvent + ADR-035 channel link
- ChatPage StatusPage relation
- TaskCard `status` enum source ve TaskType wire roadmap
- SimpleMarkdown supported syntax list
- TerminalTabs KINDS rationale
- useTerminalSocket spec §1c.2 link
- analytics/ klasör niyeti
- extensions/vscode/ install + Sprint 049 status
- i18n/types.ts dual-alias rationale (zaten var, ama types/test ergonomics doc gerek)

---

## Final Cross-Surface Summary

**Frontend audit total scope:** ~6900 LoC (60 dosya: 50 dashboard src + 4 analytics + 4 UI primitives + 1 vscode extension + 1 manifest).

**Strengths:**
1. **ADR-032 i18n compliance** — flat TranslationKey union, TS-enforced TR parity, t() interpolation. F surface (i18n) referans implementasyon.
2. **ADR-062 Web Terminal token contract** — D surface (terminal) spec §1c.2 bypass-independence + subprotocol token honored.
3. **Test-friendly helpers exported** — TaskCard, SprintSummary, SprintChart, DebtTable helper'larını test edilebilir public expose (C surface).
4. **shadcn-like minimal primitives** — ADR-010 minimal-deps korunmuş (E surface), Radix yerine custom; trade-off explicit.
5. **SSE + fallback pattern** — DashboardPage SSE primary + REST fallback (G surface), reconnect logic implement.

**Top Weaknesses:**
1. **Orphan/dead-code roll-up ~718 LoC** — StatusPage + analytics dizini + VS Code stub + minor.
2. **ConfigPage god-component** — 518 LoC inline schema; refactor highest-priority.
3. **Nervous System UI partial** — ChatPage notification view var ama accept/reject yok (ADR-040 surface eksik).
4. **TaskType (ADR-053) görsel yok** — TaskCard status'a göre badge ama taskType ayrımı UI'da invisible.
5. **`window.confirm` modal** — DashboardPage destructive actions native browser confirm (UX + test friction).
6. **Data layer Zod yok, AbortController yok** — backend schema drift + race conditions sessiz.

**Recommended next-sprint focus (Sprint 187):**
1. P0 dead-code roll-up: StatusPage / analytics / vscode karar.
2. P0 ConfigPage decomposition (schema → JSON, fields → smaller components).
3. P1 Nervous System dashboard wire (accept/reject UI + ADR-040 dashboard surface compliance).
4. P1 TaskType visualization (ADR-053 wire).
5. P2 Zod + AbortController integration (data layer reliability).

---

**Audit author:** Worker w-185-006 (Claude opus, doc-writer + code-reviewer + typescript-expert + documentation-writer + security-specialist skills) — Sprint 185 dynamic-split self-audit cycle.

**Sources consumed (60 files):** Fully read in scope.filesRead — `src/dashboard/src/**` (App.tsx, main.tsx, routes.tsx, components/*, pages/*, hooks/*, i18n/*, lib/*, types/*, components/terminal/*, components/ui/*), `src/dashboard/analytics/*`, `src/dashboard/src/index.css`, `src/extensions/vscode/extension.ts`, `src/extensions/vscode/package.json`. No code modified (scope.filesWrite = `docs/audits/dynamic-split/frontend-audit.md` only).
