# DIRECTIVES — Sprint 282: ARC-C Dilim-1 — Chat/Dashboard Product Experience (DASH-UX P0/P1/P2)

## Goal: Dashboard ve Chat, user+enterprise için KUSURSUZ deneyime taşınsın. 2026-06-11 canlı UX-denetiminin 8 bulgusu (DASH-UX-1..8, MASTER-PLAN §15 ARC-C) + API-W2 chat-ailesi disposition'ı kapatılır. Kök ilke: "wired ≠ working" — her fix gerçek-binary smoke ile kanıtlanır.

## Ortak kurallar
- **i18n-FIRST:** Kullanıcıya görünen HİÇBİR string hardcode edilmez — CLI tarafı `getMessage(key,lang)` (src/cli/helpers/messages.ts), dashboard tarafı `src/dashboard/src/i18n/{en,tr}.ts` katalogları. Yeni key eklerken en+tr İKİSİ de eksiksiz.
- **EMOJI YASAK (dashboard):** lucide-react ikon kullan (docs/design/web-console/README.md spec).
- **Tier-1 Proof-of-Function:** Bu sprint'in tüm task'ları user-surface → `Smoke:` satırı zorunlu; mock-only test = GO_WITH_TECH_DEBT, DONE değil (ADR-079).
- **Test hermetik:** tmpdir, async spawn, no spawnSync (ADR-087). Dashboard testleri `npm run test:dashboard`.
- **Surgical:** scope.filesWrite dışına yazma; mevcut pattern'i genişlet, yeniden icat etme.
- Teşhis-task'ı (282-001) rapor+repro üretir; fix-task'ları onun bulgusunu tüketir (Dependencies).

---

## Task 1: Chat stream-boşluğu kök-teşhis — EventSource-auth mu, serve-içi CLI-spawn mı?
- Provider: claude
- Model: opus
- Backend: docker
- Effort: normal
- Agent: bug-fixer
- Skills: typescript-expert, testing-expert
- Files: docs/reviews/sprint-282/chat-stream-root-cause.md, tests/api/chat-stream-live-repro.test.ts
- Scope: docs/reviews/, tests/api/

### Description
Canlı koşuda dashboard-chat NL mesajına "Anlamadım" dönüyor; zincir biliniyor (ADR-080 §3 v3-teşhis): stream-endpoint adapter'lı (`server.ts:1206` resolveChatAdapter SSOT + `:643` tüketim) ama canlıda stream BOŞ kalıyor → ChatPage POST-fallback classifier-cevabı gösteriyor. GÖREV: boşluğun kökünü AYRIŞTIR ve kanıtla:
(a) **EventSource-auth hipotezi:** `src/dashboard/src/lib/chat-stream-client.ts` EventSource'u token'ı NASIL taşıyor (header imkânsız — query-param var mı?); serve auth-gate `GET /api/chat/stream`'i 401'liyor mu? `curl -N "localhost:PORT/api/chat/stream?message=hi"` (token'lı/token'sız) ile kanıtla.
(b) **CLI-spawn hipotezi:** `resolveChatAdapter('claude',{})` → `buildCliSpawnAdapter` serve-process'i içinden `claude --print` spawn'ı çalışıyor mu — stderr/exit-code yakala.
(c) Kökü `file:line` ile raporla (`docs/reviews/sprint-282/chat-stream-root-cause.md`) + **failing-repro testi** yaz (`tests/api/chat-stream-live-repro.test.ts` — kökü pinleyen, fix sonrası yeşilecek; gerekirse skip-guard ile hermetik).

**Smoke:** `node dist/cli/entry.js serve --port 3299 --no-terminal &` → `curl -s -o /dev/null -w '%{http_code}' "http://localhost:3299/api/chat/stream?message=ping"` → beklenen davranış raporda belgelenmiş (200/401 hangisiyse kanıtla).
**Kanıt:** `test -s docs/reviews/sprint-282/chat-stream-root-cause.md && grep -cE "KÖK|ROOT" docs/reviews/sprint-282/chat-stream-root-cause.md` ≥ 1. **Test:** 1+ repro testi.

---

## Task 2: POST /api/chat adapter-backed — classifier yalnız açık-komutlara
- Provider: claude
- Model: opus
- Backend: docker
- Effort: normal
- Agent: api-builder
- Skills: api-builder, typescript-expert
- Files: src/api/server.ts, src/api/chat-handler.ts, tests/api/chat-endpoint-adapter.test.ts
- Scope: src/api/, tests/api/
- Dependencies: 282-001

### Description
`server.ts:807-817` `POST /api/chat` bugün `buildChatReply` classifier'ına gidiyor — NL'e "Anlamadım" dönüyor (DASH-UX-1 kökü, parça-1). FIX: endpoint, serve-setup'ta resolve edilen `serveChatAdapter`'ı kullansın — NL mesajlar adapter'a (gerçek LLM cevabı), `buildChatReply` YALNIZ açık slash/komut-pattern'lerine (status/help) ön-yol olarak kalsın. Adapter null/hatalıysa **dürüst hata-mesajı** dön (i18n: en "Chat provider unavailable: <reason>" / tr karşılığı — sessiz classifier-fallback YASAK). Task-1 raporundaki kökü dikkate al. `chat-handler.ts`'e adapter-paramı eklerken mevcut imza geriye-uyumlu kalsın.

**Smoke:** `node dist/cli/entry.js serve --port 3298 --no-terminal &` → `curl -s -X POST localhost:3298/api/chat -H 'Content-Type: application/json' -H "Authorization: Bearer $TOKEN" -d '{"message":"merhaba, sprint nedir?"}'` → cevap "Anlamadım" İÇERMEZ (gerçek cevap VEYA dürüst provider-hata).
**Kanıt:** `sed -n '800,840p' src/api/server.ts | grep -c "Adapter"` ≥ 1 (endpoint adapter-tüketimli). **Test:** 3+ (NL→adapter, komut→classifier, adapter-yok→dürüst-hata).

---

## Task 3: ChatPage stream-hata dürüstlüğü — onError yutma + POST-yarışı fix
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: normal
- Agent: frontend-designer
- Skills: react-specialist, frontend-design
- Files: src/dashboard/src/pages/ChatPage.tsx, src/dashboard/src/i18n/en.ts, src/dashboard/src/i18n/tr.ts, src/dashboard/src/__tests__/chat-stream-honesty.test.tsx
- Scope: src/dashboard/src/
- Dependencies: 282-001

### Description
`ChatPage.tsx:382-384` stream `onError`'ı sessizce yutuyor; `:391-400` POST-fallback her durumda atılıyor → stream boş kalınca classifier-cevap görünür kalıyor, stream geç gelirse yarış oluşuyor (DASH-UX-1 frontend-parçası). FIX: (1) stream-hata kullanıcıya GÖRÜNÜR (i18n'li hata-balonu + retry butonu, lucide ikon); (2) POST-fallback yalnız stream'in hata/boş bitişinde tetiklensin (yarış deterministik); (3) stream başladıysa POST-cevabı asla üzerine yazmasın. React state-machine sade: sending/streaming/error/done.

**Smoke:** `npm run build:all` sonrası `node dist/cli/entry.js serve --port 3297 --no-terminal &` → served HTML 200 + `npm run test:dashboard` yeşil (chat-stream-honesty dahil).
**Kanıt:** `grep -n "onError" src/dashboard/src/pages/ChatPage.tsx` → boş-gövde değil (state-set + i18n-mesaj). **Test:** 3+ render-testi (hata-görünür, yarış-yok, retry).

---

## Task 4: Stream-yolu kök-fix — teşhise göre auth/spawn onarımı
- Provider: claude
- Model: opus
- Backend: docker
- Effort: high
- Agent: api-builder
- Skills: api-builder, security-specialist
- Files: src/api/server.ts, src/dashboard/src/lib/chat-stream-client.ts, tests/api/chat-stream-auth.test.ts
- Scope: src/api/, src/dashboard/src/lib/, tests/api/
- Dependencies: 282-002

### Description
Task-1 raporundaki köke göre stream-yolunu onar: **(A) kök=auth ise** — EventSource header taşıyamaz → fetch-tabanlı SSE-client'a geç (Authorization-header'lı ReadableStream parse — tercih; EventSource bağımlılığı kalkar) VEYA kısa-ömürlü imzalı query-token (`?token=`, yalnız `/api/chat/stream`, ana Bearer-auth zayıflatılmaz, replay-pencere sınırlı); chat-stream-client'ı uyarla. **(B) kök=CLI-spawn ise** — serve-içi spawn ortamını onar (cwd/env/PATH; subscriptionEnv) + spawn-hatasını SSE error-event olarak dürüst yüzeye çıkar. Her iki durumda da Task-1 repro-testi yeşile döner. Güvenlik: token log'lara yazılmaz.

**Smoke:** `node dist/cli/entry.js serve --port 3296 --no-terminal &` → `curl -N -H "Authorization: Bearer $TOKEN" "http://localhost:3296/api/chat/stream?message=test"` (veya fetch-SSE eşdeğeri) → `data:` chunk'ları VEYA dürüst error-event akar (sessiz-boş YASAK).
**Kanıt:** Task-1 repro-testi yeşil. **Test:** 3+ (auth-yolu, hata-yolu, akış-yolu).

---

## Task 5: Stale sprint-state — finalize terminal-snapshot + /api/status reconcile
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: normal
- Agent: bug-fixer
- Skills: typescript-expert, testing-expert
- Files: src/orchestra/sprint-finalizer.ts, src/api/status-reconcile.ts, src/api/server.ts, tests/api/status-reconcile.test.ts
- Scope: src/orchestra/sprint-finalizer.ts, src/api/, tests/api/
- Dependencies: 282-002

### Description
Finalize sonrası `.dashboard` dosyası "EXECUTE %80, 8/10" gibi DONMUŞ snapshot'ta kalıyor; dashboard+`/api/status` bunu canlı sanıyor (DASH-UX-2, P0). FIX iki katman: (1) `sprint-finalizer.ts` sprint kapanışında `.dashboard`'a TERMINAL snapshot yazsın (phase: COMPLETED, workers boş, final-değerler); (2) yeni `src/api/status-reconcile.ts`: `readDashboardJson` sonucu ile `.deckent/sprint-state.json` karşılaştırılır — sprint-state COMPLETED/yok ise stale `.dashboard` "completed" işaretlenip dönülür (server.ts `/api/status` + dashboard-SSE yolu bu reconcile'dan geçer). Not: server.ts'de Task-2 ile dosya-çakışması → Dependencies sıralı.

**Smoke:** `node dist/cli/entry.js serve --port 3295 --no-terminal &` → `curl -s localhost:3295/api/status -H "Authorization: Bearer $TOKEN"` → aktif sprint yokken response'ta canlı-faz iddiası YOK (completed/idle).
**Kanıt:** `grep -ni "terminal" src/orchestra/sprint-finalizer.ts` ≥1 + `test -f src/api/status-reconcile.ts`. **Test:** 3+ (stale→reconciled, canlı→dokunulmaz, dosya-yok→idle).

---

## Task 6: Nav tek-kaynak — Layout↔Sidebar birleştir, Workers/Directives erişilir
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: normal
- Agent: frontend-designer
- Skills: react-specialist, frontend-design
- Files: src/dashboard/src/components/Layout.tsx, src/dashboard/src/components/Sidebar.tsx, src/dashboard/src/nav-items.ts, src/dashboard/src/__tests__/nav-single-source.test.tsx
- Scope: src/dashboard/src/
- Dependencies: 282-003

### Description
İki nav-kaynağı drift'te: `Layout.tsx` kendi `navGroups`'unu render ediyor, `Sidebar.tsx` `navItems`'ı stale-duplicate (DASH-UX-3; 219-009'un ters-yön nüksü) → Workers + Directives sayfaları nav'dan ERİŞİLEMEZ (route var, link yok). FIX: tek-kaynak `src/dashboard/src/nav-items.ts` oluştur (gruplu yapı: Konuş/İzle/Yönet; App.tsx'teki TÜM route'lar dahil — Workers/Directives de); Layout VE Sidebar bu kaynaktan tüketsin; label'lar i18n-key (literal TR/EN YASAK — eksik key'leri en+tr ekle; DASH-UX-8'in nav-parçası burada kapanır); lucide ikonlar korunur. RENDER-test: tüm route'lar DOM'da link.

**Smoke:** `npm run build:all` → `node dist/cli/entry.js serve --port 3294 --no-terminal &` → `curl -s localhost:3294/ | grep -c "__DECKENT_API_TOKEN__"` ≥1 + `npm run test:dashboard` yeşil.
**Kanıt:** `grep -rn "navGroups\|navItems" src/dashboard/src/components/ | grep -v "nav-items" | grep -cE "= \[|: \[" ` = 0 (component'lerde tanım yok, yalnız import). **Test:** 2+ (tüm-route-link-DOM, grup-yapısı).

---

## Task 7: Terminal-bar overlap — z-index/layout fix
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: low
- Agent: frontend-designer
- Skills: frontend-design, react-specialist
- Files: src/dashboard/src/components/TerminalPanel.tsx, src/dashboard/src/components/Layout.tsx, src/dashboard/src/__tests__/terminal-no-overlap.test.tsx
- Scope: src/dashboard/src/
- Dependencies: 282-006

### Description
Collapsed Terminal çubuğu sidebar'ın YÖNET bölümünü örtüyor (DASH-UX-5). FIX: layout-grid/z-index düzelt — collapsed-bar sidebar'la çakışmaz (sidebar üstte ya da bar sidebar-genişliğini sayar); responsive kırılımlarda doğru. Layout.tsx'e Task-6'dan SONRA dokun (Dependencies) — tek-kaynak nav inişiyle çakışma olmasın.

**Smoke:** `npm run build:all` → `node dist/cli/entry.js serve --port 3293 --no-terminal &` → `curl -s -o /dev/null -w '%{http_code}' localhost:3293/` = 200; `npm run test:dashboard` yeşil.
**Kanıt:** terminal-no-overlap render-testi geçer (collapsed-bar ↔ sidebar kesişmez — z-index/position sınıf-assert'leri). **Test:** 2+.

---

## Task 8: Alert-dedup — auditor staleness-uyarısı tek-satır
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: normal
- Agent: bug-fixer
- Skills: typescript-expert, testing-expert
- Files: src/monitor/alert-emitter.ts, src/monitor/dashboard-manager.ts, tests/monitor/alert-dedup.test.ts
- Scope: src/monitor/, tests/monitor/

### Description
"CLAUDE.md 70dk güncellenmedi" uyarısı her scan'de yeniden eklenip dashboard'u ×59 dolduruyor (DASH-UX-4; 220-010 dedup'unun kapsamadığı yol). FIX: alert-emit yolunda **kimlik-bazlı dedup** — aynı (type+subject) alert tekrar EKLENMEZ; mevcut kaydın `count`+`lastSeenAt` alanı güncellenir; dashboard-manager `.dashboard`'a dedup'lu liste yazar (en-yeni-N, count görünür). Auditor'ın diğer alert davranışı korunur (bilgi kaybolmaz, yalnız tekrar bastırılır).

**Smoke:** `node dist/cli/entry.js serve --port 3292 --no-terminal &` → `curl -s localhost:3292/api/status -H "Authorization: Bearer $TOKEN"` → alerts dizisinde aynı (type+subject) en fazla 1 kez.
**Kanıt:** `grep -nE "count|lastSeenAt|dedup" src/monitor/alert-emitter.ts | wc -l` ≥2. **Test:** 3+ (tekrar→count-artar, farklı-subject→ayrı, sıralama).

---

## Task 9: DebtPage route + /settings yüzeyi
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: normal
- Agent: frontend-designer
- Skills: react-specialist, frontend-design
- Files: src/dashboard/src/App.tsx, src/dashboard/src/nav-items.ts, src/dashboard/src/pages/SettingsPage.tsx, src/dashboard/src/i18n/en.ts, src/dashboard/src/i18n/tr.ts, src/dashboard/src/__tests__/settings-debt-surface.test.tsx
- Scope: src/dashboard/src/
- Dependencies: 282-006

### Description
DASH-UX-7: (1) `DebtPage.tsx` (226 LoC, hazır) route-suz orphan → `/debt` route + nav-items'a ekle (İzle grubu). (2) `/settings` yüzeyi yok ("settings özellikler kayıp") → `SettingsPage.tsx`: dil (en/tr), tema (dark/light — theme.ts token'ları), bildirim-tercihleri; mevcut `/api/config` GET/SET ile çalışır; **yalnız gerçek-etkili ayarlar listelenir** (no-op knob YASAK — CORE-W4 ihlaline yeni örnek ekleme!). i18n eksiksiz en+tr; lucide ikon.

**Smoke:** `npm run build:all` → `node dist/cli/entry.js serve --port 3291 --no-terminal &` → `curl -s -o /dev/null -w '%{http_code}' localhost:3291/` = 200; `npm run test:dashboard` yeşil (settings+debt render).
**Kanıt:** `grep -nE "debt|settings" src/dashboard/src/App.tsx | wc -l` ≥2 (her ikisi route'lu) + nav-items'ta kayıtlı. **Test:** 3+ (route-render ×2, settings-set-roundtrip mock-api).

---

## Task 10: Enterprise tenant-CRUD — UI + API
- Provider: claude
- Model: opus
- Backend: docker
- Effort: high
- Agent: api-builder
- Skills: api-builder, security-specialist
- Files: src/api/enterprise-endpoint.ts, src/dashboard/src/pages/EnterprisePage.tsx, src/dashboard/src/i18n/en.ts, src/dashboard/src/i18n/tr.ts, tests/api/enterprise-crud.test.ts
- Scope: src/api/enterprise-endpoint.ts, src/dashboard/src/, tests/api/
- Dependencies: 282-004

### Description
EnterprisePage 4 tab salt-okunur — enterprise-admin UI'dan hiçbir şey yönetemiyor (DASH-UX-6). Bu dilimde **Tenants tab'ı CRUD'a** taşınır (Roles/Rate sonraki dilim — ARC-C kalanında kayıtlı): (1) `enterprise-endpoint.ts`'e `POST/PUT/DELETE /api/enterprise/tenants` — **RBAC: yalnız `role:admin`** (ADR-069/071 auth-middleware role-claim'i; static-token davranışı MEVCUT konvansiyona göre), audit-log'a yaz (mevcut audit-writer), input-validation (mevcut Zod-pattern); (2) EnterprisePage Tenants-tab'ına create/edit/delete formu (i18n en+tr, lucide, hata/loading state'leri); (3) viewer/operator → 403 + UI buton-gizleme. Not: i18n dosyalarında Task-9/12 ile çakışma riski → Dependencies zinciri ayrı dalda (282-004 sonrası), planner wave'i çakışmayı dependency-pipeline'la çözer; i18n-key'lerini `enterprise.*` namespace'inde tut.

**Smoke:** `node dist/cli/entry.js serve --port 3290 --no-terminal &` → `curl -s -X POST localhost:3290/api/enterprise/tenants -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"id":"t-smoke","name":"Smoke"}' -o /dev/null -w '%{http_code}'` → 200/201 + GET listede görünür.
**Kanıt:** `grep -cE "'POST'|'PUT'|'DELETE'" src/api/enterprise-endpoint.ts` ≥3 + audit-write çağrısı ≥1. **Test:** 4+ (create/update/delete/403-rbac).

---

## Task 11: chat-backend.ts disposition — API-W2
- Provider: claude
- Model: haiku
- Backend: docker
- Effort: low
- Agent: refactorer
- Skills: code-simplifier
- Files: src/api/chat-backend.ts, src/cli/commands/chat-native.ts, docs/adr/076-auth-precedence-user-surfaces.md
- Scope: src/api/chat-backend.ts, src/cli/commands/chat-native.ts, docs/adr/
- Dependencies: 282-004

### Description
`src/api/chat-backend.ts` (171 LoC) dormant — ADR-076 Path-A bileşeni; chat-handler+chat-stream+resolveChatAdapter ailesi süpersede etti (tek referans `chat-native.ts:782` YORUMU — o yorumu da güncelle, silinen dosyaya işaret etmesin; chat-native'de BAŞKA HİÇBİR ŞEYE dokunma). SİL + ADR-076'ya kısa süpersede-notu (mevcut amendment-formatına uy; "Path-A chat-backend.ts Sprint 282'de kaldırıldı — yerini chat-handler/chat-stream/resolveChatAdapter ailesi aldı"; memory.db senkronu sprint-sonu CC'de). Task-2/4 chat-yolunu değiştirdikten SONRA koş — canlı-bağımlılık doğmadığını kanıtla.

**Smoke:** `npx tsc --noEmit` temiz + `node dist/cli/entry.js serve --port 3289 --no-terminal &` → `curl -s -o /dev/null -w '%{http_code}' localhost:3289/api/status -H "Authorization: Bearer $TOKEN"` = 200.
**Kanıt:** `test ! -f src/api/chat-backend.ts` + `grep -rn "chat-backend" src/ | wc -l` = 0 + ADR-076'da süpersede-notu. **Test:** mevcut chat/api-suite yeşil kalır (yeni test gerekmez).

---

## Task 12: Dashboard sayfa-içi i18n-temizliği — literal-label'lar i18n-key'e
- Provider: claude
- Model: haiku
- Backend: docker
- Effort: low
- Agent: frontend-designer
- Skills: react-specialist, documentation-writer
- Files: src/dashboard/src/pages/EvolutionPage.tsx, src/dashboard/src/pages/NervousPage.tsx, src/dashboard/src/pages/MemoryExplorerPage.tsx, src/dashboard/src/i18n/en.ts, src/dashboard/src/i18n/tr.ts, src/dashboard/src/__tests__/i18n-no-literal-labels.test.tsx
- Scope: src/dashboard/src/
- Dependencies: 282-009

### Description
DASH-UX-8'in sayfa-parçası: Evolution/Nervous/Memory-Explorer sayfalarındaki literal label-override'lar (karışık TR/EN) i18n-key'lere taşınır (en+tr eksiksiz; EnterprisePage'e DOKUNMA — Task-10 kendi kapsamında; i18n-key'lerini sayfa-namespace'lerinde tut, Task-9/10'un ekledikleriyle çakışma). Nav-label'ları Task-6 halletti — yalnız sayfa-içi başlık/buton/empty-state metinleri. Kapsamlı i18n-sweep ARC-L'de; burada YALNIZ bu 3 sayfanın görünür-literal'leri ("kesin dil-ayrımı": tek sayfada karışık TR/EN ASLA).

**Smoke:** `npm run build:all` → `node dist/cli/entry.js serve --port 3288 --no-terminal &` → `curl -s -o /dev/null -w '%{http_code}' localhost:3288/` = 200; `npm run test:dashboard` yeşil.
**Kanıt:** i18n-no-literal-labels testi: 3 sayfada hardcoded-Türkçe-string = 0. **Test:** 1+ (literal-tarama).

---

**Beklenen:** 12 task, hepsi claude/docker; dependency-grafiği Kahn-topolojisiyle ~5 wave: W1={1,8} → W2={2,3} → W3={4,5,6} → W4={7,9,10,11} → W5={12}. Model dağılımı: opus 4 (1,2,4,10) · sonnet 6 (3,5,6,7,8,9) · haiku 2 (11,12). i18n-dosya çakışmaları (en/tr.ts: task 3,6,9,10,12) dependency-zinciriyle sıralı — aynı wave'de iki task aynı dosyaya yazmaz. Sprint-sonu CC: ADR-076 db-senkron + MASTER-PLAN §15 DASH-UX işaretleme + Tier-1 gerçek-binary smoke-zinciri + UX re-audit (playwright).
