# DIRECTIVES — Sprint 269: REPL/Dashboard Tam-İşlevsellik — Kopuk Yüzeyleri Kapat

## Goal: Faz-0 denetiminin (docs/analysis/2026-06-10-repl-dashboard-flow-audit.md) bulduğu kopuklukları kapat: dashboard'ın SPA-refresh 401 kökü (A1) + Enterprise hollow sayfası + Workers/Directives rotaları + chat-stream adapter + REPL eksik slash'leri + i18n ihlalleri + MCP run/audit paritesi + doc drift. Hedef: Alperen'in günlük kullandığı terminal + dashboard yüzeylerinde her işlev uçtan uca çalışır (Odysseus "kutudan-çıktığı-gibi" çıtası). Test-first, ADR-010, hermetik.

## Ortak kurallar
- **TDD + hermetik:** önce RED; tmpdir + injectable I/O; gerçek ağ YASAK; spawnSync YASAK.
- **Self-verify TARGETED:** yalnız kendi test dosyaların; başka task'ın yarım dosyasından gelen tsc hatası NO_GO sebebi DEĞİL (notes'a yaz).
- **Denetim dokümanı kaynak:** `docs/analysis/2026-06-10-repl-dashboard-flow-audit.md` — bulgu numaralarına (A1, B-*, C-*) referansla çalış.
- **Davranış korunumu:** mevcut yeşil testler yeşil kalır; değişiklikler additive/surgical.
- **i18n-FIRST:** kullanıcıya görünen TÜM yeni/değişen string `getMessage(key, lang)` (en+tr) üzerinden — hardcode kabul edilmez.
- **`.tasks/task-XXX.result` YAZ**; Kanıt komutlarını gerçekten koş. NOT: gerçek-binary serve/REPL smoke'u CC sprint-sonu yapar (ADR-079) — sen hermetik kanıtla yetin, notes'a yaz.

---

## Task 1: API server yüzey fix'leri — SPA token-inject + Enterprise endpoints + chat-stream adapter
- Provider: claude
- Model: fable
- Backend: docker
- Effort: high
- Agent: api-builder
- Skills: typescript-expert, security-specialist, testing-expert
- Files: src/api/server.ts, src/api/enterprise-endpoint.ts, tests/api/serve-spa-token-inject.test.ts, tests/api/enterprise-endpoint.test.ts
- Scope: src/api/, tests/api/

### Description
Denetim bulguları A1 + A4 + B-Enterprise + B-ChatStream + B-OutputStream. Kaynaklar: `src/api/server.ts` (:629-660 static/SPA-fallback, :1274-1295 token-inject, :595-610 chat-stream adapter-null, :1084-1089 output-stream lazy-init, :1006-1030 token resolve), `src/dashboard/src/pages/EnterprisePage.tsx:60-63` (beklenen 4 endpoint + response shape'leri), mevcut endpoint pattern'i `src/api/nervous-endpoint.ts` / `evolution-endpoint.ts` (register deseni — AYNEN izle).
1. **A1 — SPA-fallback token-inject (P0):** `:1283`'teki `urlPath === '/' || '/index.html'` koşulu yüzünden alt-sayfa doğrudan-giriş/refresh inject'siz kalıyor → tüm API 401. Fix: SPA-fallback'ten dönen HER index.html servisi (`:647-648` yolu) aynı localhost-inject'ten geçsin (inject mantığını tek helper'a çıkar, iki yoldan da çağır). Remote-bind'da inject YOK semantiği aynen korunur (güvenlik: token yalnız loopback'e sızar).
2. **A4 — çift-token netliği:** `:1010` auto-generate (UUID) + `:1025` auto-mint (hex) iki ayrı token üretip biri terminale biri API'ye gidiyor; log'daki "Auto-generated API token" kullanıcıyı 403'e yönlendiriyor. Fix: tek çözümleme sırası (explicit param > env `DECKENT_API_TOKEN` > config > localhost-auto-mint) + log mesajı GERÇEK aktif API token'ını ve ne işe yaradığını söylesin; terminal token'ı ayrı ve açıkça etiketli log'lansın. Davranış değişikliği minimal — öncelik sırası mevcut `resolveAuthToken` sözleşmesini bozmasın (479 api regresyonu yeşil kalmalı).
3. **B-Enterprise — YENİ `src/api/enterprise-endpoint.ts`:** `registerEnterpriseRoutes(...)` — 4 GET: `/api/enterprise/tenants` (config strict_tenant/tenant listesi — config'ten), `/api/enterprise/rbac` (rbac config + rol matrisi — `core/rbac.ts`'ten), `/api/enterprise/audit` (son N audit event — `core/audit-query.ts` `readAuditEvents`'ten, kanal-filtre paramlı), `/api/enterprise/rate` (RateLimiter mevcut durum). Response shape'leri EnterprisePage'in beklediğiyle birebir (sayfa kodundan türet — UYDURMA). server.ts'e `:661-670` register bloğuna ekle. Veri yoksa boş-ama-200 dön (404/500 değil) — sayfa EmptyState gösterir.
4. **B-ChatStream:** `chatStreamAdapter` null başlıyor (`:600-605`) → dashboard chat streaming ölü. REPL'in kullandığı `resolveChatAdapter` (chat-backend yolu — `src/cli/commands/chat-*` SSOT'unu ÇAĞIR, yeniden yazma; ADR-008'e dikkat: api→cli import yönü sorunluysa adapter'ı parametreyle enjekte eden mevcut seam'i kullan ve serve kuruluşunda bağla) ile config-driven adapter kur. Adapter kurulamazsa bugünkü dürüst SSE-error davranışı kalır.
5. **B-OutputStream:** `/api/output-stream` lazy-init'i eager/null-guard'lı yap (`:1084-1089`) — ilk SSE isteği worker'lar attach olmadan geldiğinde düşmesin.
**Testler:** SPA-fallback inject (curl-sims: `/`, `/enterprise`, `/status` hepsinde `__DECKENT_API_TOKEN__` dolu; remote-bind'da YOK); 4 enterprise endpoint'in shape + boş-veri-200 + auth-gated davranışı; token-resolve öncelik sırası; chat-stream adapter-bağlıyken SSE event akışı (mock adapter); output-stream erken-istek.

**Kanıt:** `npx vitest run tests/api/serve-spa-token-inject.test.ts tests/api/enterprise-endpoint.test.ts` yeşil; `grep -n "registerEnterpriseRoutes" src/api/server.ts` ≥ 1. **Test:** 12+.

---

## Task 2: Dashboard frontend — Workers/Directives rotaları + {n} fix + Nervous SSE + client birleştirme
- Provider: claude
- Model: fable
- Backend: docker
- Effort: high
- Agent: frontend-designer
- Skills: react-specialist, frontend-design, testing-expert
- Files: src/dashboard/src/App.tsx, src/dashboard/src/components/Sidebar.tsx, src/dashboard/src/pages/WorkersPage.tsx, src/dashboard/src/pages/DirectivesPage.tsx, src/dashboard/src/pages/NervousPage.tsx, src/dashboard/src/pages/DashboardPage.tsx, src/dashboard/src/lib/api-client.ts, src/dashboard/src/lib/api.ts, src/dashboard/src/lib/useApi.ts, src/dashboard/src/hooks/useApi.ts, src/dashboard/src/lib/use-live-data.ts, tests/dashboard/workers-directives-pages.test.tsx
- Scope: src/dashboard/, tests/dashboard/

### Description
Denetim bulguları A2 + B-Workers/Directives + B-NervousSSE + B-Fragmentasyon. Kaynaklar: `src/dashboard/src/App.tsx:17-43` (route'lar), `Sidebar.tsx:23-34`, mevcut sayfa pattern'leri (StatusPage/DashboardPage), `lib/use-live-data.ts` SSE hook'u.
1. **WorkersPage (YENİ):** sidebar'daki ölü "Workers" linkine gerçek sayfa — aktif worker grid'i (DashboardPage'deki worker verisinin sayfalaşmış hâli: id, task, durum, heartbeat yaşı, provider/model; kill butonu mevcut `/api/kill/:id`'ye). SSE/use-live-data ile canlı.
2. **DirectivesPage (YENİ):** sidebar'daki ölü "Directives" linkine gerçek sayfa — mevcut `NewSprintModal`/DirectivesEditor mantığını sayfa olarak: DIRECTIVES.md oku (`/api/...` mevcut endpoint'i bul; yoksa GET'i Task 1'in scope'una bırakmak YASAK — bu durumda salt-okunur göster ve notes'a yaz), düzenle + `POST /api/set-directives` ile kaydet.
3. **A2 — `{n}` interpolasyonu:** DashboardPage başlığındaki ham `{n}` placeholder'ını gerçek worker sayısıyla doldur (i18n template çağrısının interpolate parametresi eksik — kökü bul, aynı hatanın başka örneği var mı tara).
4. **Nervous SSE:** NervousPage one-shot fetch → `use-live-data`/SSE'ye geçir; approve/reject sonrası otomatik tazelenir.
5. **Client birleştirme:** 4 ayrı token-attach yolu (`lib/api.ts`, `lib/api-client.ts`, `lib/useApi.ts`, `hooks/useApi.ts`) tek kanonik client'a indirgenir (en yetkini seç, diğerleri ona delege/re-export — SAYFALARI kırmadan, import'lar minimal diff'le güncellenir). Token okuma tek fonksiyon.
**Testler (vitest.dashboard.config.ts, jsdom):** WorkersPage render + kill-buton çağrısı (mock fetch); DirectivesPage load/save; `{n}` interpolasyonu; NervousPage SSE-mock güncellemesi; kanonik client token-attach (header var/yok).

**Kanıt:** `npx vitest run --config vitest.dashboard.config.ts tests/dashboard/workers-directives-pages.test.tsx` yeşil + `npx tsc --noEmit -p src/dashboard` temiz; `grep -n "path=\"/workers\"\|path=\"/directives\"" src/dashboard/src/App.tsx` = 2 eşleşme. **Test:** 10+. NOT: gerçek-tarayıcı doğrulaması CC sprint-sonu playwright ile (ADR-079).

---

## Task 3: REPL slash tamamlama + i18n ihlalleri — /autonomous /audit /directives + hardcode temizliği
- Provider: claude
- Model: fable
- Backend: docker
- Effort: normal
- Agent: bug-fixer
- Skills: typescript-expert, testing-expert
- Files: src/cli/commands/chat-slash-registry.ts, src/cli/commands/chat-native.ts, src/cli/commands/chat-agentic-dispatch.ts, src/cli/repl/app.tsx, src/cli/helpers/messages.ts, tests/cli/chat-slash-new-commands.test.ts
- Scope: src/cli/, tests/cli/

### Description
Denetim bulguları C-Slash + C-i18n + A3-mesaj. Kaynaklar: `src/cli/commands/chat-slash-registry.ts:49-212` (31 slash kataloğu + MCP-dispatch deseni — `/status`/`/checkpoint` gibi mevcut entry'leri AYNEN örnek al), MCP tool'ları `src/mcp/tools/autonomous.ts` (9 action) + `audit.ts` + `set-directives.ts`.
1. **`/autonomous` slash:** registry'ye ekle — argüman parser'ıyla `status|start|stop|backlog list|backlog add <başlık> [--cron <expr>]|approve <id>|reject <id>` alt-aksiyonları `deckent_autonomous` MCP dispatch'ine map'lenir (mevcut MCP-dispatch slash deseni). Park-onay akışı REPL'den uçtan uca: `/autonomous approve <id>` çalışır.
2. **`/audit` slash:** `gate [sprint]|query|compliance` alt-aksiyonları → `deckent_audit` dispatch (MCP tarafı Task 4 genişletiyor; MCP'de henüz olmayan aksiyon istenirse dürüst "henüz MCP'de yok" i18n mesajı — UYDURMA çağrı yapma).
3. **`/directives` slash:** mevcut DIRECTIVES.md'yi göster + `"/directives set <metin>"`/dosyadan onaylı yazım → `deckent_set_directives` dispatch (riskli-aksiyon onay kapısı mevcut confirm mekanizmasından geçer).
4. **i18n temizliği:** hardcode İngilizce string'leri `getMessage` key'lerine taşı (en+tr çifti `messages.ts`'e): `chat-native.ts:593/654/688`, `chat-agentic-dispatch.ts` (denetimde "dispatch.ts:131"), `app.tsx:61`, ve `/mcp` "isn't available in this environment" mesajı (yeni key; içerik dürüst: MCP-client REPL'e henüz bağlı değil, yol haritasında). Satır numaraları kaymış olabilir — string içeriğiyle bul.
**Testler:** 3 yeni slash'in registry'de kayıtlı + doğru tool'a dispatch (mock dispatcher ile arg-map doğrulaması); bilinmeyen alt-aksiyon → i18n hata; en/tr mesaj key'lerinin varlığı (messages sözlük testi mevcut deseniyle).

**Kanıt:** `npx vitest run tests/cli/chat-slash-new-commands.test.ts` yeşil; `grep -c "autonomous\|/audit\|/directives" src/cli/commands/chat-slash-registry.ts` ≥ 3. **Test:** 8+.

---

## Task 4: MCP parite — deckent_run modelEffort/timeout/keep + deckent_audit action genişletmesi
- Provider: claude
- Model: fable
- Backend: docker
- Effort: normal
- Agent: api-builder
- Skills: typescript-expert, testing-expert
- Files: src/mcp/tools/run.ts, src/mcp/tools/audit.ts, tests/mcp/run-tool-parity.test.ts, tests/mcp/audit-tool-actions.test.ts
- Scope: src/mcp/, tests/mcp/

### Description
Denetim bulguları C-MCP-parite (ADR-022). Kaynaklar: `src/mcp/tools/run.ts:34` (inputSchema), `src/cli/commands/run.ts` (CLI yüzeyi — 268-003 `--model-effort` dahil), `src/mcp/tools/audit.ts:8-57` (minimal gate), `src/cli/commands/audit.ts` (runAuditQuery/runComplianceReport/runSiem*Forward/runAuditRetention — SSOT, YENİDEN YAZMA, çağır).
1. **deckent_run:** inputSchema'ya `modelEffort?` (string — `resolveReasoningEffort` doğrulamasından geçer, spawn'a forward), `timeoutMs?` (number), `keep?` (boolean) ekle; CLI ile davranış birebir (ExecutionRequest yolundan — `buildExecutionRequest` zaten `modelEffort` alıyor).
2. **deckent_audit:** `action?: 'gate'|'query'|'compliance'|'retention'` (default 'gate' — geri-uyum) + aksiyona göre paramlar (`query`: channel/tenant/limit; `compliance`: json çıktı; `retention`: keepDays/keepCount/apply — apply'ın destructive olduğunu tool description'da belirt, `forward` AĞ gerektirdiği için MCP'ye EKLEME — notes'a nedenini yaz). CLI runner fonksiyonlarını import edip çağır (SSOT); CLI-fonksiyonları export edilmemişse surgical export ekle (scope'un `src/cli/commands/audit.ts` export satırı eklemeye İZİNLİ — sadece export, davranış değişikliği yok; notes'a yaz).
3. Tool description'ları İngilizce-tutarlı (MCP yüzeyi), drift'e dikkat: `docs/reference/mcp-tools.md` regen Task 5'te.
**Testler:** run tool'unun yeni paramlarının spawn çağrısına ulaştığı (mock); geçersiz modelEffort sessizce düşer; audit action'larının doğru runner'ı çağırdığı (mock fs/tmpdir ile compliance/query; retention dry-run default + apply guard).

**Kanıt:** `npx vitest run tests/mcp/run-tool-parity.test.ts tests/mcp/audit-tool-actions.test.ts` yeşil; `grep -n "modelEffort" src/mcp/tools/run.ts` ≥ 1. **Test:** 10+.

---

## Task 5: Doc-drift kapatma — mcp-tools regen + drift testi + features 268 satırları
- Provider: claude
- Model: fable
- Backend: docker
- Effort: low
- Agent: doc-writer
- Skills: documentation-writer
- Files: docs/reference/mcp-tools.md, docs/reference/features.md, tests/docs/reference-drift.test.ts
- Scope: docs/reference/, tests/docs/

### Description
Denetim bulgusu C-DocDrift. (1) `npm run docs:ref` üreticisini koş (`scripts/gen-reference-docs.mjs`) → `docs/reference/mcp-tools.md` gerçek tool sayısıyla (34; Task 4 param eklemeleri dahil — Task 4 inmemişse mevcut durumla, notes'a yaz) yeniden üret. (2) `tests/docs/reference-drift.test.ts:15`'teki bayat "32 tools" beklentisini KOD-TÜREVLİ hale getir (sabit sayı yerine kayıt-listesinden say — mümkünse; değilse güncel sayıya sabitle + yorumla). (3) `docs/reference/features.md`'e Sprint 268 satırları (mevcut tablo formatında, diskte VAR olanlar): erp-driver-dynamics, JWKS async AuthProvider (`terminal_oidc_jwks` default-off), resume artifact-reset, spawn modelEffort pass-through + `deckent run --model-effort`. Diskte olmayanı YAZMA.

**Kanıt:** `npx vitest run tests/docs/reference-drift.test.ts` yeşil; `grep -ciE "dynamics|terminal_oidc_jwks|model-effort" docs/reference/features.md` ≥ 3. **Test:** drift testi güncel + koşulmuş.

---

**Beklenen:** 5 task (4 kod + 1 doc), hepsi claude-fable-5/docker, dosya-çakışması YOK (server.ts yalnız T1; dashboard T2; cli T3; mcp T4 — T4'ün audit.ts export-only istisnası T3'le çakışmaz, farklı dosya). CC sprint sonu: tsc + yeni testler + api/dashboard regresyonu + **gerçek-binary doğrulama** (serve + playwright: SPA-refresh 200'leri, Enterprise sayfası dolu, Workers/Directives rotaları; PTY: /autonomous //audit //directives) + commit/push + 🔨 BUILD sinyali. Sonraki: Sprint 270 publish-readiness (onboarding 3-komut çıtası — Odysseus dersi).
