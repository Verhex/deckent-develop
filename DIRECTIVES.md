# DIRECTIVES — Sprint 284: ARC-C Dilim-2 — Gerçek-Zamanlı Dashboard (DASH-RT-1/2 + DASH-FIX-1)

## Goal: Dashboard veri-akışı ANLIK olsun (Alperen 2026-06-12: "hızlı, mümkünse anlık"). Worker spawn/done/faz/eylem ≤1-2sn'de UI'a düşer (30s auditor-snapshot'ına bağımlılık biter); worker-log'ları dashboard'dan CANLI izlenir (bugün hiçbir yüzeyden izlenemiyor); 2 console-hatası (terminal-sessions 401, directives 404) kapanır.

## Ortak kurallar
- **i18n-FIRST** (`src/dashboard/src/i18n/{en,tr}.ts`, en+tr eksiksiz) · **EMOJI YASAK** (lucide) · **Tier-1 Smoke zorunlu** (ADR-079) · **hermetik test** (tmpdir, async-spawn; ADR-087) · **surgical** (mevcut SSE/useSSE/use-live-data desenlerini GENİŞLET).
- Mevcut omurga (OKU): `/api/events` SSE (server.ts:617, query-token'lı :1208) bugün `.dashboard` fs.watch-push'u; `core/event-stream.ts` (writeEvent/readEvents, sprint-JSONL); hb-dosyaları `.tasks/*.hb` (worker.ts:346-369 currentAction taşır); docker worker-log `.tasks/task-<id>.log` (spawn-backend-docker.ts:1344).
- **Güvenlik:** yeni SSE endpoint'leri auth'lu — query-token gerekiyorsa `queryTokenPaths`'e (server.ts:1208) ekle, ana Bearer-auth zayıflatılmaz (282-004 deseni); token log'lanmaz; path-traversal koruması (taskId regex).

---

## Task 1: Canlı-olay köprüsü — hb + event-stream → /api/events typed-push
- Provider: claude
- Model: opus
- Backend: docker
- Effort: high
- Agent: api-builder
- Skills: api-builder, typescript-expert
- Files: src/api/live-events.ts, src/api/server.ts, tests/api/live-events.test.ts
- Scope: src/api/, tests/api/

### Description
DASH-RT-1 omurgası. Yeni `src/api/live-events.ts`: (1) `.tasks/` dizinini fs.watch'la izler — `*.hb` değişiminde `{type:'worker_heartbeat', taskId, status, currentAction, ts}`; `*.result` düşünce `{type:'worker_done', taskId}`; (2) aktif sprint'in event-stream JSONL'ini (core/event-stream `getCurrentSprintId` + dosya-tail) izler — yeni satırlar `{type:'deckent_event', event}` olarak akar; (3) debounce (≤250ms) + fail-safe (dizin yoksa sessiz-bekle, izleyici crash'i serve'i düşürmez). `server.ts`'de mevcut `/api/events` SSE'sine wire: mevcut `.dashboard`-snapshot push'u KORUNUR (geriye-uyum), typed-push'lar AYNI kanala eklenir (`event:` alanıyla ayrışır). initWatcher bölgesindeki sseClients setini yeniden kullan — ikinci client-registry İCAT ETME.

**Smoke:** `node dist/cli/entry.js serve --port 3279 --no-terminal &` → arka-planda `.tasks/test-smoke.hb` dosyası yaz/güncelle → `timeout 5 curl -N "localhost:3279/api/events?token=$TOKEN"` çıktısında ≤2sn'de `worker_heartbeat` event'i görünür.
**Kanıt:** `test -f src/api/live-events.ts && grep -c "worker_heartbeat\|deckent_event" src/api/live-events.ts` ≥2. **Test:** 4+ (hb-değişim→push, result→done, jsonl-tail→event, watcher-crash→serve-ayakta) — tmpdir-hermetik.

---

## Task 2: Dashboard client anlık-merge — snapshot üstüne event-akışı
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: high
- Agent: frontend-designer
- Skills: react-specialist, typescript-expert
- Files: src/dashboard/src/hooks/useSSE.ts, src/dashboard/src/lib/use-live-data.ts, src/dashboard/src/pages/WorkersPage.tsx, src/dashboard/src/pages/Dashboard.tsx, src/dashboard/src/__tests__/live-merge.test.tsx
- Scope: src/dashboard/src/
- Dependencies: 284-001

### Description
DASH-RT-1 client-tarafı. `useSSE`/`use-live-data` Task-1'in typed-event'lerini tanır: `worker_heartbeat` → ilgili agent'ın status/currentAction'ı ANINDA state'e merge (snapshot beklemeden); `worker_done` → agent done; `deckent_event` → Canlı-Aktivite feed'ine satır. Dashboard ana-sayfa "Canlı Aktivite / Aktivite bekleniyor..." bölümü gerçek event-feed olur (son ~20 olay, ts'li). WorkersPage worker-kartları currentAction'ı canlı gösterir ("Starting"de takılı kalmaz — hb her güncellemede değişir). Snapshot-merge çakışma-kuralı: event-ts > snapshot-ts ise event kazanır. i18n: feed/empty-state metinleri.

**Smoke:** `npm run build:all` → serve 3278 → HTML 200 + `npm run test:dashboard` yeşil (live-merge dahil).
**Kanıt:** `grep -nE "worker_heartbeat|deckent_event" src/dashboard/src/hooks/useSSE.ts src/dashboard/src/lib/use-live-data.ts | wc -l` ≥2. **Test:** 4+ (hb-merge-anında, done-merge, feed-append, ts-çakışma-kuralı).

---

## Task 3: Worker-log SSE endpoint — backend-agnostik file-tail
- Provider: claude
- Model: opus
- Backend: docker
- Effort: normal
- Agent: api-builder
- Skills: api-builder, security-specialist
- Files: src/api/worker-logs.ts, src/api/server.ts, tests/api/worker-logs.test.ts
- Scope: src/api/, tests/api/
- Dependencies: 284-001

### Description
DASH-RT-2 backend'i. Yeni `src/api/worker-logs.ts`: `GET /api/workers/:taskId/logs/stream` SSE — `.tasks/task-<taskId>.log` dosyasını tail'ler (mevcut-içerik backfill + fs.watch ile yeni satırlar; dosya yoksa dürüst `log_unavailable` event'i — backend log yazmıyorsa sessiz-boş YASAK). Backend-agnostik: docker zaten yazıyor (spawn-backend-docker.ts:1344); dosya-tabanlı olduğundan subprocess/tmux için de aynı yol. **Güvenlik:** taskId `^[A-Za-z0-9_-]+$` regex (path-traversal blok), `queryTokenPaths`'e `/api/workers` prefix-desteğiyle ekle (server.ts:1208 — mevcut exact-match yapıysa prefix/startsWith desteği ekle, diğer path'lerin davranışı DEĞİŞMEZ — test pinle). server.ts route-wire (Task-1 server.ts'e dokunuyor → Dependencies sıralı).

**Smoke:** serve 3277 → `echo "satır-1" >> .tasks/task-smoke-1.log` → `timeout 5 curl -N "localhost:3277/api/workers/smoke-1/logs/stream?token=$TOKEN"` → "satır-1" backfill + yeni-append ≤2sn'de akar.
**Kanıt:** `test -f src/api/worker-logs.ts && grep -c "logs/stream\|log_unavailable" src/api/` ≥2. **Test:** 4+ (backfill, canlı-append, dosya-yok→dürüst-event, traversal-403).

---

## Task 4: WorkersPage canlı log-paneli UI
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: normal
- Agent: frontend-designer
- Skills: react-specialist, frontend-design
- Files: src/dashboard/src/pages/WorkersPage.tsx, src/dashboard/src/components/WorkerLogPanel.tsx, src/dashboard/src/i18n/en.ts, src/dashboard/src/i18n/tr.ts, src/dashboard/src/__tests__/worker-log-panel.test.tsx
- Scope: src/dashboard/src/
- Dependencies: 284-002, 284-003

### Description
DASH-RT-2 UI'ı. Yeni `WorkerLogPanel.tsx`: WorkersPage'de worker-kartına tıklayınca açılan panel — Task-3 SSE'sini tüketir, log satırları akar (monospace, auto-scroll + scroll-lock toggle'ı, son ~500 satır ring-buffer); `log_unavailable` → i18n'li dürüst boş-durum; bağlantı-kopması → reconnecting göstergesi (use-live-data deseni). lucide ikonlar; i18n en+tr (panel başlık/boş-durum/toggle). WorkersPage Task-2'de değişti → Dependencies sıralı, güncel halini oku.

**Smoke:** `npm run build:all` → serve 3276 → HTML 200 + `npm run test:dashboard` yeşil (worker-log-panel dahil).
**Kanıt:** `test -f src/dashboard/src/components/WorkerLogPanel.tsx && grep -c "logs/stream" src/dashboard/src/components/WorkerLogPanel.tsx` ≥1. **Test:** 3+ (satır-render, unavailable-durum, auto-scroll-toggle).

---

## Task 5: DASH-FIX-1 — terminal-sessions 401 + directives 404
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: low
- Agent: bug-fixer
- Skills: typescript-expert, react-specialist
- Files: src/dashboard/src/components/TerminalPanel.tsx, src/dashboard/src/components/DirectivesEditor.tsx, src/api/server.ts, tests/api/directives-endpoint.test.ts
- Scope: src/dashboard/src/components/TerminalPanel.tsx, src/dashboard/src/components/DirectivesEditor.tsx, src/api/server.ts, tests/api/
- Dependencies: 284-003

### Description
Playwright re-audit'in 2 console-hatası: (1) `GET /api/terminal/sessions` → **401**: TerminalPanel ilk-yüklemede Bearer'sız fetch atıyor — `useApi`/token'lı fetch desenine geçir (diğer sayfaların deseni). (2) `GET /api/directives` → **404**: DirectivesEditor GET'i route'suz — server.ts'e `GET /api/directives` ekle (DIRECTIVES.md içeriği `{content}` döner; dosya yoksa `{content:''}` 200 — 404 DEĞİL; POST zaten var, simetri kur). server.ts Task-3'ten SONRA (Dependencies). Console'da bu iki hata sıfırlanır.

**Smoke:** serve 3275 → `curl -s -H "Authorization: Bearer $TOKEN" localhost:3275/api/directives -o /dev/null -w '%{http_code}'` = 200.
**Kanıt:** `grep -n "'/api/directives'" src/api/server.ts | wc -l` ≥2 (GET+POST). **Test:** 3+ (GET-içerik, GET-boş-dosya-200, TerminalPanel auth'lu-fetch render-testi).

---

## Task 6: Gecikme-ölçüm smoke'u — "anlık" iddiasının kanıt-zinciri
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: low
- Agent: ci-guardian
- Skills: ci-testing, testing-expert
- Files: scripts/rt-latency-verify.mjs, package.json
- Scope: scripts/, package.json
- Dependencies: 284-004

### Description
DASH-RT-1 "≤1-2sn" hedefinin kalıcı kanıtı: `scripts/rt-latency-verify.mjs` — gerçek-binary serve'i tmpdir-projede boot'lar (async spawn), `/api/events` SSE'sine bağlanır, `.tasks/`'a sentetik hb yazar, **yazım→event-alımı gecikmesini ölçer**; ≤2000ms → PASS, değilse FAIL (exit 1). Worker-log yolu için de aynı ölçüm (log-append→SSE-satır). `package.json`'a `verify:rt-latency` script'i. Hermetik (tmpdir, teardown try/finally; dist yoksa skip-guard — ADR-079 deseni, test-e2e-surfaces örneğine bak).

**Smoke:** `npm run build:all` → `node scripts/rt-latency-verify.mjs` → "PASS (hb: XXXms, log: XXXms)" çıktısı, exit 0.
**Kanıt:** `grep -n "verify:rt-latency" package.json` ≥1. **Test:** script'in kendisi kanıt (run-proven); ayrı unit gerekmez.

---

**Beklenen:** 6 task; W1={1} → W2={2,3} → W3={4,5} → W4={6}. Model: opus 2 (1,3) · sonnet 4. i18n-çakışma: yalnız T4 (en/tr) — tekil. server.ts zinciri: 1→3→5 sıralı. Sprint-sonu CC: rt-latency gerçek-ölçüm + playwright canlılık-denetimi (koşan işlem yokken hb-simülasyonu) + MASTER-PLAN DASH-RT-1/2 + DASH-FIX-1 işaretleme.
