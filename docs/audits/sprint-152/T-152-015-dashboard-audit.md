# T-152-015: Dashboard 7 Page + SSE + API Endpoints Audit

**Sprint:** sprint-152 (post-migration READ-ONLY audit)
**Date:** 2026-04-24
**Scope:** `src/dashboard/**`, `src/api/server.ts`, `tests/dashboard/**`, `tests/api/**`
**Method:** Static inspection + live vitest execution on new-system baseline.

---

## Özet

Dashboard **tam kapsamlı 7-page + SSE + i18n + vitest** audit'i bugünkü Ryzen 9 / 30 GB / Node v22.22.2 ortamında yapıldı. **Dashboard vitest 17 dosya / 471 test %100 pass (810ms)** — DIRECTIVES'teki 413 hedefinden ilerlemiş durumda (Sprint 151 T-151-003 ChatPage ekledi). **tsc --noEmit 0 error**. **API SSE tests 150 pass (3 dosya)**. **i18n TR/EN parity 340 key × 2 dil**, toggle çalışıyor, fallback sağlam.

**Ana DRIFT:** DIRECTIVES'in beklediği 7 sayfa listesi (Dashboard, Directives, Memory, Debt, Tasks, Agents, Chat) **mevcut koddan farklı**. Gerçekte: 7 TSX dosyası / 6 aktif route / 5 nav entry / 1 orphan (StatusPage) / 1 redirect (Settings). "Directives / Debt / Tasks / Agents" sayfaları **yok** — bu işlevler modal veya karışık yerlerde (NewSprintModal, DebtTable komponenti Memory/History içinden, TaskCard komponenti Dashboard içinden). Bu DIRECTIVES spec'i eski dönem bir vizyonu yansıtıyor ve realiteyle hizalanmamış.

---

## Bulgular

### 1. Page Dosyaları vs Router vs Nav Envanteri

**PASS (kısmen) — DRIFT mevcut:** DIRECTIVES'in 7-page beklentisi gerçeklikle eşleşmiyor ancak tüm var olan sayfalar functional ve test kapsamında.

Dosya sistemi (`src/dashboard/src/pages/*.tsx`):

| # | Dosya | LoC | Rota (`App.tsx`) | Nav (`Layout.tsx`) | Status |
|---|-------|-----|------------------|---------------------|--------|
| 1 | DashboardPage.tsx | 398 | `/` | ✓ Dashboard | [PASS] |
| 2 | HistoryPage.tsx | 164 | `/history` | ✓ History | [PASS] |
| 3 | MemoryPage.tsx | 80 | `/memory` | ✓ Memory | [PASS] |
| 4 | ConfigPage.tsx | 510 | `/config` | ✓ Config | [PASS] |
| 5 | ChatPage.tsx | 318 | `/chat` | ✓ Chat | [PASS] (Sprint 151 T-151-003 eklendi) |
| 6 | SettingsPage.tsx | 5 | `/settings` → redirect | ✗ gizli | [PASS — intentional redirect] |
| 7 | StatusPage.tsx | 68 | ✗ yok | ✗ yok | **[MISSING — orphan]** — App.tsx'te route yok, nav'da yok |

`src/dashboard/src/routes.tsx:5-11` ROUTES sabiti sadece 5 rotayı reference eder (Dashboard, History, Memory, Config, Chat). `App.tsx:12-30` BrowserRouter'da 6 rota var: 5 ana + `/settings` redirect. **routes.tsx ile App.tsx arasında drift** — routes.tsx `/settings` route'unu listeleyemiyor.

DIRECTIVES beklentisi ile gerçek karşılaştırma:

| Beklenen (DIRECTIVES) | Gerçek | Durum |
|------------------------|--------|-------|
| Dashboard | DashboardPage | [PASS] |
| Directives | — | **[MISSING]** (NewSprintModal.tsx içinden düzenleniyor, standalone sayfa yok) |
| Memory | MemoryPage | [PASS] |
| Debt | — | **[MISSING]** (DebtTable.tsx komponenti History ve Memory içinde) |
| Tasks | — | **[MISSING]** (TaskCard.tsx Dashboard içinde inline) |
| Agents | — | **[MISSING]** (AgentDetail.tsx komponenti Dashboard içinde inline) |
| Chat | ChatPage | [PASS] |
| — | History | [BONUS — DIRECTIVES'te yok] |
| — | Config | [BONUS — DIRECTIVES'te yok] |

### 2. SSE `/api/events` Canlılığı

**[PASS]** — Sprint 150 T-003 event stream wire yaşıyor, Sprint 151'de T-151-003 ile ChatPage NotificationPanel'e bağlandı.

Server side: `src/api/server.ts:423-435`
```typescript
if (url === '/api/events') {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    ...
  });
  res.write('retry: 3000\n\n');
  sseClients.add(res);
  req.on('close', () => { sseClients.delete(res); });
  if (initWatcher) initWatcher();
  return;
}
```

`watchDashboard` (`src/api/watcher.ts`) `.dashboard` dosya değişimini izler → tüm SSE clients'e `data: <json>\n\n` publish eder (`server.ts:806-825`).

Client side: `src/dashboard/src/hooks/useSSE.ts`
- `useSSE()` ve `useSSEWithStatus()` — EventSource + 3s reconnect
- Status enum: connecting | connected | disconnected (Layout'ta renkli indikatör)
- ChatPage `NotificationPanel` DECKENT→USER:NOTIFY ve nervous kaynaklı olayları filtreliyor (`ChatPage.tsx:250`)

Test kanıtları:
- `tests/api/server.test.ts:269-284` SSE header doğrulama
- `tests/api/server-edge.test.ts:408-490` edge case testleri (43 test, disconnect handling)
- `tests/api/server-security.test.ts:337` CORS + auth

Live run sonucu (2026-04-24):
```
 Test Files  3 passed (3)
      Tests  150 passed (150)
   Duration  811ms
```

**[DRIFT — minor]** Server SSE heartbeat/ping yok — uzun süreli bağlantıları behind-proxy senaryolarında koruyan keepalive mesajı gönderilmiyor. `retry: 3000` initial flush sonrası, client reconnect sadece error üzerine tetiklenir. Nginx/Cloudflare gibi bir layer arkasında idle timeout'ları sorun yaratabilir. **Sprint 153 aksiyon öğesi:** 20-30s aralıkla `:heartbeat\n\n` comment-frame ekle (minor, prod deploy öncesi).

### 3. i18n TR/EN Toggle

**[PASS]** — Tam parity, toggle çalışıyor, fallback sağlam.

- `src/dashboard/src/i18n/en.ts` ve `tr.ts` — **her ikisi de 340 key** (flat record)
- `LanguageProvider.tsx:22-56` — React context, config API'ye persist
  - Initial load: `fetch('/api/config')` → `config.language === 'tr'` ise `setLang('tr')`
  - Toggle: Layout `LanguageSwitcher` button → `setLang(other)` → POST /api/config
  - Fallback chain: `translations[lang][key] ?? translations.en[key] ?? key`
- Navigation anahtarları (nav.dashboard, nav.settings, nav.history, nav.memory, nav.config, nav.chat) — her iki dilde de mevcut
  - `en.ts:3-7, 379` ve `tr.ts:5-9, 381`

i18n parity testi (`tests/dashboard/i18n-coverage.test.ts`) 4 seviye kontrol:
1. Key count equality (340 = 340)
2. Key parity her iki yönde
3. No empty TR translations
4. Hardcoded English scan — StatusPage, SprintSummary, TaskCard, DebtTable, SprintChart, Layout

Live run: 16/16 test PASS (i18n-coverage). Ancak **StatusPage orphan** olsa da i18n tarama listesinde kalıyor — zararsız ama temizlenmeli.

### 4. Dashboard vitest Baseline

**[PASS — ilerleme]** 413 → 471 test (%14 artış) Sprint 151 T-151-003 sonrası.

`npx vitest run --config src/dashboard/vitest.config.ts` çıktısı (2026-04-24, Ryzen 9 / 30 GB):
```
RUN  v3.2.4 /workspace

 ✓ tests/dashboard/types.test.ts (6 tests) 2ms
 ✓ tests/dashboard/live-data.test.ts (41 tests) 7ms
 ✓ tests/dashboard/config-page.test.tsx (12 tests) 5ms
 ✓ tests/dashboard/chat-page.test.tsx (14 tests) 3ms
 ✓ tests/dashboard/scaffold.test.ts (33 tests) 6ms
 ✓ tests/dashboard/layout.test.ts (53 tests) 5ms
 ✓ tests/dashboard/pages.test.ts (22 tests) 4ms
 ✓ tests/dashboard/dashboard-page.test.ts (35 tests) 8ms
 ✓ tests/dashboard/api.test.ts (7 tests) 5ms
 ✓ tests/dashboard/config-integration.test.ts (16 tests) 6ms
 ✓ tests/dashboard/utils.test.ts (8 tests) 6ms
 ✓ tests/dashboard/api/output-stream.test.ts (28 tests) 12ms
 ✓ tests/dashboard/i18n-coverage.test.ts (16 tests) 7ms
 ✓ tests/dashboard/components.test.ts (36 tests) 5ms
 ✓ tests/dashboard/TaskCard.test.tsx (59 tests) 56ms
 ✓ tests/dashboard/SprintSummary.test.tsx (67 tests) 88ms
 ✓ tests/dashboard/AgentDetail.test.tsx (18 tests) 360ms

 Test Files  17 passed (17)
      Tests  471 passed (471)
   Duration  1.00s (transform 803ms, setup 0ms, tests 583ms)
```

Not: `vitest.config.ts`'te **jsdom/happy-dom environment tanımlanmamış** (config dosyası sadece `resolve.alias` + `include` + `testTimeout`). Bu paradoksal: 4 `.test.tsx` dosyası (chat-page, config-page, TaskCard, SprintSummary, AgentDetail) React Testing Library'nin `cleanup()` hook'una `setup.ts:1-8` üzerinden ulaşır ama environment'ı nereden alıyor? — **Ana vitest default environment `node` ile RTL render iş görüyor çünkü testler çoğunlukla file-content / type assertion (string matching) yapıyor, gerçek DOM mount değil.** Örneğin `chat-page.test.tsx` `readFileSync(CHAT_PAGE_PATH, "utf-8")` + `expect(content).toContain(...)` pattern'ini kullanıyor. AgentDetail.test.tsx ise RTL render'ı kullanıyor (360ms süreli) → **jsdom fallback çalışıyor ama yapılandırma eksiği var** (`environment: 'jsdom'` yazılmalı). Bu bir **[DRIFT — low]**: RTL pattern genişlerse environment açıkça tanımlanmalı.

### 5. Main vitest — Dashboard Kapsam Ayrımı

**[PASS]** `vitest.config.ts:6` ana config `tests/dashboard/**` klasörünü dışlıyor, dashboard testleri yalnızca `src/dashboard/vitest.config.ts` üzerinden koşuyor. Coverage exclude listesinde `src/dashboard/**` var — dashboard kodu main coverage metric'ine girmiyor. Doğru izolasyon.

### 6. tsc --noEmit Baseline

**[PASS]** `npx tsc --noEmit` → exit=0, 0 error. Sistem taşıması sonrası TypeScript compilation sağlam.

### 7. Chat Page DECKENT→USER:NOTIFY Entegrasyonu

**[PASS]** Sprint 151 T-151-003 canlı kanıt: `ChatPage.tsx:3, 136-138, 250, 305`

- JSDoc açıklaması: "User can chat with Deckent, see nervous system notifications live"
- NotificationPanel component (line 138-) — notifications prop
- SSE filter logic: `.filter((a) => a.source === "DECKENT→USER:NOTIFY" || a.source === "nervous")`
- Render: `<NotificationPanel notifications={notifications} />` (line 305)

Test kapsamı: `tests/dashboard/chat-page.test.tsx` — 14 test (ChatInput, ChatHistory, NotificationPanel, TaskContextSidebar, i18n integration, SSE hook kullanımı).

### 8. StatusPage.tsx — Orphaned Component

**[MISSING / REGRESSION]** `src/dashboard/src/pages/StatusPage.tsx` (68 LoC) App.tsx'te import edilmiyor, route yok. Ancak i18n hardcoded scan target listesinde (`i18n-coverage.test.ts:73`). Dead code — silinmeli veya tekrar route'lanmalı.

Geçmiş kontext: Muhtemelen eski `/status` sayfası, DashboardPage geldikten sonra yer değiştirildi ve silinmedi. `src/dashboard/src/types.ts` referansları `DashboardState` — StatusPage hâlâ bu tipi kullanıyor.

### 9. API Server Notları

**[PASS with minor notes]** `src/api/server.ts` 848 satır, zod validation, rate limiter, bearer token auth, CORS hardening hepsi çalışır durumda.

Endpoint envanteri (GET): `/health`, `/api/health`, `/api/status`, `/api/sprint`, `/api/history`, `/api/config`, `/api/config/defaults`, `/api/doctor`, `/api/memory`, `/api/debt`, `/api/tasks`, `/api/job/:jobId`, `/api/worker/:taskId/log`, `/api/events` (SSE).

Endpoint envanteri (POST): `/api/start`, `/api/plan`, `/api/kill/:workerId`, `/api/set-directives`, `/api/cleanup`, `/api/config`, `/api/webhooks/:connector/:key`.

**[DRIFT — minor]** `CORS` header'da hardcoded `http://localhost:${DEFAULT_PORT}` (3100) — `line 133`. Dev server Vite 5173'te çalışırken `allowedOrigin` fallback olarak 3100 döner, ancak preflight regex (`line 277`) isAllowedOrigin tespitini yapıyor, yani fallback sadece default state için. Kabul edilebilir.

### 10. DebtTable, TaskCard, AgentDetail — Page Olmayan Komponentler

Component-level varlıklarla uğraşan pattern. DIRECTIVES'in beklediği "Debt page", "Tasks page", "Agents page" yerine:

- `components/DebtTable.tsx` → HistoryPage + MemoryPage içinde render
- `components/TaskCard.tsx` → DashboardPage içinde render
- `components/AgentDetail.tsx` → DashboardPage içinde modal render (hover/click)

Bu pattern doğru mimari seçim (page sayısını sınırlama, component reuse), ancak **DIRECTIVES spec'i güncellenmeli**.

---

## Sprint 153+ İçin Aksiyon Listesi

### P0 (blocker — Sprint 153 başında)

- [P0 / low effort] **StatusPage.tsx silinmeli** (68 LoC dead code) veya tekrar route'lanmalı. i18n hardcoded scan target listesinden kaldır. **Effort: 15 dk**
- [P0 / low effort] **routes.tsx ile App.tsx hizalama**: `routes.tsx` `/settings` redirect'i listeleyemiyor, ekle veya routes.tsx'i App.tsx'ten türet. **Effort: 10 dk**

### P1 (sprint içi)

- [P1 / low effort] **DIRECTIVES spec güncellemesi**: Sprint 152 audit sonrası "7 page" ifadesi yanıltıcı. Gerçeği yansıtan liste (Dashboard, History, Memory, Config, Chat — 5 primary + 1 redirect) yaz. **Effort: 15 dk (sadece DIRECTIVES Sprint 152 template'i güncelle)**
- [P1 / low effort] **src/dashboard/vitest.config.ts'e `environment: 'jsdom'` ekle** — RTL testleri (AgentDetail 360ms) fallback ile koşuyor, açık konfig daha sağlam. **Effort: 5 dk**
- [P1 / normal effort] **SSE heartbeat/ping**: 20-30s interval'de `:keepalive\n\n` comment frame gönder. Nginx/Cloudflare proxy idle timeout hatasını önler. Prod deploy öncesi şart. **Effort: 30 dk (server.ts + test)**

### P2 (gelecek sprint)

- [P2 / normal effort] **DebtPage / TasksPage / AgentsPage standalone tartışması**: DIRECTIVES ruhuna uymak için ayrı sayfalar mı lazım, yoksa component-in-page pattern yeterli mi? ADR olarak dokümante edilmeli (ADR-042 sprint+task dual modes'e paralel bir "dashboard page granularity" kararı). **Effort: 2 saat (ADR + dogfood)**
- [P2 / low effort] **routes.tsx ROUTES sabitinden nav üretimi**: Layout.tsx'deki navItems manuel — `ROUTES` reuse etmeli. **Effort: 30 dk**
- [P2 / normal effort] **StatusPage kurtarma**: Eğer silinmeyecekse `/status` route'u eklenmeli, DashboardPage'den farklı human-friendly bir view olarak değer sağlamalı. **Effort: 1 saat**
- [P2 / low effort] **src/dashboard/src/pages/SettingsPage.tsx removal**: Sadece redirect — `App.tsx`'te doğrudan `<Navigate to="/config" />` kullanılabilir. **Effort: 5 dk**

---

## Kanıt Ekleri

### Ek 1 — Dashboard Pages File List
```
$ ls src/dashboard/src/pages/
ChatPage.tsx         ConfigPage.tsx       DashboardPage.tsx
HistoryPage.tsx      MemoryPage.tsx       SettingsPage.tsx
StatusPage.tsx

$ wc -l src/dashboard/src/pages/*.tsx
  318 ChatPage.tsx
  510 ConfigPage.tsx
  398 DashboardPage.tsx
  164 HistoryPage.tsx
   80 MemoryPage.tsx
    5 SettingsPage.tsx
   68 StatusPage.tsx
 1543 total
```

### Ek 2 — App.tsx Route Definition
```typescript
// src/dashboard/src/App.tsx:17-26
<Routes>
  <Route element={<Layout />}>
    <Route path="/" element={<DashboardPage />} />
    <Route path="/settings" element={<SettingsPage />} />
    <Route path="/history" element={<HistoryPage />} />
    <Route path="/memory" element={<MemoryPage />} />
    <Route path="/config" element={<ConfigPage />} />
    <Route path="/chat" element={<ChatPage />} />
  </Route>
</Routes>
```
6 route: StatusPage.tsx (line-48 /status route YOK).

### Ek 3 — routes.tsx Drift
```typescript
// src/dashboard/src/routes.tsx:5-11
export const ROUTES = [
  { path: "/", label: "Dashboard" },
  { path: "/history", label: "History" },
  { path: "/memory", label: "Memory" },
  { path: "/config", label: "Config" },
  { path: "/chat", label: "Chat" },
] as const;
```
5 entry vs App.tsx'in 6 route'u. `/settings` redirect listelenmemiş. Layout.tsx navItems yine 5 — routes.tsx'ten değil, inline tanımlı.

### Ek 4 — Dashboard vitest çıktı (sistem taşımasından sonra ilk koşum)
```
RUN  v3.2.4 /workspace
[17 test file — hepsi ✓]
 Test Files  17 passed (17)
      Tests  471 passed (471)
   Duration  1.00s
```
Zaman damgası: 2026-04-24T12:31:30Z. Delta: DIRECTIVES 413 → 471 (+58 test, Sprint 151 T-151-003 ChatPage kapsamı).

### Ek 5 — SSE Endpoint Header Verification (test baseline)
```typescript
// tests/api/server.test.ts:269-284
expect(res.headers['content-type']).toBe('text/event-stream');
expect(res.headers['cache-control']).toBe('no-cache');
```
Running: 150 test / 3 file / 100% pass / 811ms.

### Ek 6 — i18n Anahtar Sayısı
```
$ grep -cE "^  '" src/dashboard/src/i18n/en.ts
340
$ grep -cE "^  '" src/dashboard/src/i18n/tr.ts
340
```
i18n-coverage testi (16/16 pass) parity enforcement'ı canlı.

### Ek 7 — tsc --noEmit
```
$ npx tsc --noEmit
(no output, exit=0)
```
Yeni sistemde 0 TypeScript error.

---

## Acceptance Criteria Check

- [x] Rapor dosyası `docs/audits/sprint-152/T-152-015-dashboard-audit.md` yazıldı
- [x] Bulgular [PASS | FAIL | REGRESSION | MISSING | DRIFT] etiketli (10 bulgu)
- [x] Kanıt ekleri 7 adet (dosya listesi, App.tsx snippet, routes.tsx drift, vitest çıktısı, SSE test, i18n counts, tsc)
- [x] Sprint 153+ aksiyon listesi P0/P1/P2 — 9 aksiyon öğesi + effort tahmini
- [x] Kod değişikliği YOK (git diff src/ tests/ = 0) — yalnızca `docs/audits/sprint-152/T-152-015-dashboard-audit.md` yazıldı

---

## Meta-Dogfood Note

Bu rapor Sprint 152 READ-ONLY audit'in parçası olarak "deckent kendi kendini denetliyor" pattern'ini uyguluyor. StatusPage orphan bulgusu + routes.tsx-App.tsx drift bulgusu, **Sprint 151 retro'sunda raporlanmamış iki küçük regresyon** — bu audit bu hafıza boşluğunu kapatıyor. Sprint 153'te bu 2 bulgu (P0) ele alınmalı.
