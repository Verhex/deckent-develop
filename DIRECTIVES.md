# DIRECTIVES — Sprint 277: Dashboard UI SSO (ENT-5 son kalan) — Auth-State + Identity + OIDC-Flow İskeleti

## Goal: Backend OIDC %100 hazır (267-268: auth-oidc/jwks/bearer-middleware/JwksAuthProvider), dashboard tarafı SIFIR. Bu sprint dashboard'a auth-state katmanını kurar: useAuth context + "kim giriş yaptı" göstergesi (JWT claims) + manuel-token girişi (api_oidc test) + session-persist + logout + `/api/auth/me` whoami + audit-actor'ı JWT'den türetme + EnterprisePage "BENİM rolüm" bağlamı. Gerçek OIDC-redirect akışı config-gated İSKELET + mock-IdP hermetik test (gerçek-IdP smoke opt-in/sonraki faz). MİKRO-TASK + DEPENDENCY + MODEL-KATMANLAMA (opus 2 · sonnet 8 · haiku 3).

## Ortak kurallar
- **TDD + hermetik:** önce RED; dashboard testleri vitest.dashboard (jsdom); backend tmpdir + injectable fetch; gerçek ağ/IdP YASAK testlerde (mock IdP fixture); spawnSync YASAK.
- **Güvenlik:** token sessionStorage (localStorage DEĞİL — XSS yüzeyi dar); JWT claim decode SİGNATURE doğrulamaz (yalnız görüntüleme — gerçek doğrulama backend'de, auth-oidc.ts); secret/token log'lanmaz; PKCE state/nonce CSRF koruması.
- **Davranış korunumu:** localhost auto-inject yolu AYNEN çalışır (mevcut dashboard kırılmaz); SSO opt-in. config kapalıyken bayt-bayt aynı.
- **i18n-FIRST:** dashboard string'leri mevcut LanguageProvider/i18n (en+tr); CLI/API user-facing yok.
- **SSOT:** JWT decode/verify backend `core/auth-oidc.ts`; RBAC `core/rbac.ts`; token okuma kanonik `lib/api.ts` (269'da birleştirildi). YENİDEN İCAT YOK.
- **`.tasks/task-XXX.result` YAZ**; Kanıt komutlarını gerçekten koş. Tier-1 dashboard smoke CC sprint-sonu playwright (ADR-079).

---

## Task 1: /api/auth/me whoami endpoint — bearer'dan kimlik + rol
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: normal
- Agent: api-builder
- Skills: typescript-expert, testing-expert, security-specialist
- Files: src/api/auth-me-endpoint.ts, src/api/server.ts, tests/api/auth-me-endpoint.test.ts
- Scope: src/api/, tests/api/

### Description
**YENİ `src/api/auth-me-endpoint.ts`** (nervous-endpoint/enterprise-endpoint register deseni): `GET /api/auth/me` — auth-gate'ten GEÇEN istek için (bearer zaten doğrulandı middleware'de) request'teki bearer'ı `parseOidcClaims` (core/auth-oidc.ts — varsa; yoksa surgical export) ile decode edip `{ authenticated: true, mode: 'static'|'oidc', sub?, email?, name?, preferredUsername?, role? }` döner. Static-token modunda (JWT değil) `{ authenticated: true, mode: 'static' }` (claim yok — dürüst). Rol: claim'den (varsa) ya da config rbac default. server.ts'e route mount (enterprise-endpoint deseni; auth-gate'in ARKASINDA — exempt DEĞİL, kimlik için auth gerekli). Secret/token gövdede ASLA. Testler (mock req + tmpdir): oidc-JWT → claim çıkarımı; static → mode:static; bozuk-bearer → graceful; rol eşleme.

**Kanıt:** `npx vitest run tests/api/auth-me-endpoint.test.ts` yeşil; `grep -n "auth/me\|registerAuthMe" src/api/server.ts | head -2` ≥ 1. **Test:** 7+.

---

## Task 2: audit-actor JWT sub'dan türetme — hardcoded 'local' fix
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: normal
- Agent: security-auditor
- Skills: security-specialist, typescript-expert, testing-expert
- Files: src/api/enterprise-endpoint.ts, tests/api/enterprise-audit-actor.test.ts
- Dependencies: 277-001
- Scope: src/api/, tests/api/

### Description
Kanıt (envanter §4b): `src/api/enterprise-endpoint.ts:149` audit.actor='local' HARDCODED — kim ne yaptı izlenmiyor. Task 1'in claim-decode yardımcısını kullan (SSOT): istek bearer'ında JWT sub/preferred_username varsa audit.actor onu kullansın; yoksa 'local' (geri-uyum). Yalnız enterprise audit-yazım yolundaki actor; başka audit çağrılarını bu task'ta DEĞİŞTİRME (scope dar). Secret-redaction korunur. Testler: oidc-bearer → actor=sub; static/claim-yok → actor='local'; mevcut audit testleri yeşil.

**Kanıt:** `npx vitest run tests/api/enterprise-audit-actor.test.ts` yeşil; `grep -n "actor" src/api/enterprise-endpoint.ts | head -3` ≥ 1 (artık dinamik). **Test:** 5+.

---

## Task 3: useAuth hook/context — dashboard auth-state SSOT
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: normal
- Agent: frontend-designer
- Skills: react-specialist, typescript-expert, testing-expert
- Files: src/dashboard/src/hooks/useAuth.tsx, src/dashboard/src/lib/session.ts, tests/dashboard/use-auth.test.tsx
- Scope: src/dashboard/, tests/dashboard/
- Dependencies: 277-001

### Description
**YENİ `src/dashboard/src/lib/session.ts`** (token persist): sessionStorage'a token yaz/oku/sil (`DECKENT_SESSION_TOKEN` anahtarı; XSS-dar yüzey). **YENİ `src/dashboard/src/hooks/useAuth.tsx`** (React context): bootstrap önceliği = `window.__DECKENT_API_TOKEN__` (localhost-inject, mevcut) ?? sessionStorage; `{ token, isAuthenticated, identity (me'den), mode, login(token), logout(), refresh() }`; mount'ta `/api/auth/me` (Task 1) çağırıp identity doldurur (kanonik `lib/api.ts` fetchJson — token-aware). 401 → identity null, isAuthenticated false. Provider App köküne sarılır (ayrı task App.tsx'i değiştiriyor — burada YALNIZ hook+context export, App-wire Task 8'de). Testler (jsdom, mock fetch + sessionStorage): bootstrap-token önceliği, sessionStorage fallback, me-fetch identity, login/logout state, 401 yolu.

**Kanıt:** `npx vitest run --config vitest.dashboard.config.ts tests/dashboard/use-auth.test.tsx` yeşil; `grep -n "useAuth\|sessionStorage" src/dashboard/src/hooks/useAuth.tsx src/dashboard/src/lib/session.ts | head -3` ≥ 2. **Test:** 8+.

---

## Task 4: AuthStatus komponenti — "kim giriş yaptı" + logout
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: normal
- Agent: frontend-designer
- Skills: react-specialist, frontend-design, testing-expert
- Files: src/dashboard/src/components/AuthStatus.tsx, tests/dashboard/auth-status.test.tsx
- Dependencies: 277-003
- Scope: src/dashboard/, tests/dashboard/

### Description
**YENİ `src/dashboard/src/components/AuthStatus.tsx`** (useAuth tüketir): kimlik göstergesi — `identity.name/email/sub` ("Logged in as: X" / static modda "Local session") + rol rozeti (varsa) + logout butonu (`useAuth().logout()` → sessionStorage temizle → state sıfırla; localhost-inject token'ı temizleyemez ama session'ı sıfırlar + dürüst mesaj). i18n (LanguageProvider). god-level UI (mevcut tema token'ları/AppShell stiliyle tutarlı). `data-testid="auth-status"` + `data-testid="logout-button"`. Testler: identity render (oidc/static), logout tıklama → state, i18n.

**Kanıt:** `npx vitest run --config vitest.dashboard.config.ts tests/dashboard/auth-status.test.tsx` yeşil; `grep -n "auth-status\|logout" src/dashboard/src/components/AuthStatus.tsx | head -2` ≥ 1. **Test:** 6+.

---

## Task 5: ManualTokenInput — api_oidc modunda JWT test girişi
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: normal
- Agent: frontend-designer
- Skills: react-specialist, frontend-design, testing-expert
- Files: src/dashboard/src/components/ManualTokenInput.tsx, tests/dashboard/manual-token-input.test.tsx
- Dependencies: 277-003
- Scope: src/dashboard/, tests/dashboard/

### Description
**YENİ `src/dashboard/src/components/ManualTokenInput.tsx`** (useAuth tüketir): modal/dialog — kullanıcı JWT yapıştırır → `useAuth().login(token)` (sessionStorage'a yazar + me-refresh). api_oidc modunda (bootstrap-token yok ama auth gerekli) developer/tester kendi JWT'siyle giriş yapabilsin. Geçersiz-token → me 401 → dürüst hata mesajı (token yutulmaz). i18n. `data-testid="manual-token-input"`. Token input alanı type=password (omuz-sörfü). Testler: token gir → login çağrısı; geçersiz → hata; iptal.

**Kanıt:** `npx vitest run --config vitest.dashboard.config.ts tests/dashboard/manual-token-input.test.tsx` yeşil; `grep -n "manual-token-input\|login" src/dashboard/src/components/ManualTokenInput.tsx | head -2` ≥ 1. **Test:** 5+.

---

## Task 6: OIDC redirect-flow çekirdeği — PKCE + authorize-URL + state (OPUS)
- Provider: claude
- Model: opus
- Backend: docker
- Effort: high
- Agent: security-auditor
- Skills: security-specialist, typescript-expert, testing-expert
- Files: src/dashboard/src/lib/oidc-flow.ts, tests/dashboard/oidc-flow.test.ts
- Scope: src/dashboard/, tests/dashboard/

### Description
**YENİ `src/dashboard/src/lib/oidc-flow.ts`** (pure, güvenlik-kritik — gerçek redirect Task 8'de): `generatePkce(): { verifier, challenge }` (S256 — crypto.subtle/SHA-256, base64url; verifier sessionStorage'a) + `buildAuthorizeUrl(cfg, { state, nonce, challenge }): string` (authorization-code+PKCE: client_id/redirect_uri/scope=openid profile email/state/nonce/code_challenge/code_challenge_method=S256) + `parseCallbackParams(search): { code, state } | { error }` + `validateState(returned, stored): boolean` (CSRF). HİÇBİR ağ çağrısı bu modülde (token-exchange Task 7-backend). Hermetik testler (mock crypto): PKCE deterministik-olmayan ama format-doğru, authorize-URL param tamlığı, state-validate (eşleşen/eşleşmeyen), callback-parse (başarı/error).

**Kanıt:** `npx vitest run --config vitest.dashboard.config.ts tests/dashboard/oidc-flow.test.ts` yeşil; `grep -n "generatePkce\|buildAuthorizeUrl\|validateState" src/dashboard/src/lib/oidc-flow.ts | head -3` ≥ 3. **Test:** 8+.

---

## Task 7: OIDC token-exchange backend endpoint — code→token (OPUS)
- Provider: claude
- Model: opus
- Backend: docker
- Effort: high
- Agent: security-auditor
- Skills: security-specialist, typescript-expert, testing-expert
- Files: src/api/oidc-callback-endpoint.ts, src/api/server.ts, src/core/config-types.ts, tests/api/oidc-callback-endpoint.test.ts
- Dependencies: 277-001
- Scope: src/api/, src/core/, tests/api/

### Description
**YENİ `src/api/oidc-callback-endpoint.ts`** + config. (1) config `dashboard_oidc?: { enabled: boolean; issuer; client_id; client_secret?; redirect_uri; scope? }` (default-off). (2) `POST /api/auth/oidc/exchange` (EXEMPT-path — login öncesi token yok): body `{ code, code_verifier }` → IdP discovery (`<issuer>/.well-known/openid-configuration` — injectable fetch) → token_endpoint'e POST (code+verifier+client_id/secret+redirect_uri) → dönen `id_token`'ı `verifyJwtWithJwks` (auth-jwks.ts SSOT, issuer'ın jwks_uri'si) ile DOĞRULA → geçerliyse `{ token: id_token, claims }` dön (frontend sessionStorage'a koyar). Gerçek-IdP YOK testlerde (mock fetch: discovery + token + jwks). Fail-safe: dashboard_oidc kapalıysa endpoint 404/disabled; her hata dürüst (token yutulmaz, secret log'lanmaz). config-types.ts çakışması (başka task'lar da dokunmaz bu sprint — güvenli). Testler: mock-IdP başarı akışı; geçersiz id_token reddi; state/exchange hatası; disabled→kapalı.

**Kanıt:** `npx vitest run tests/api/oidc-callback-endpoint.test.ts` yeşil; `grep -n "oidc/exchange\|dashboard_oidc" src/api/oidc-callback-endpoint.ts src/core/config-types.ts | head -2` ≥ 1. **Test:** 8+.

---

## Task 8: dashboard wire — Provider + AuthStatus + Login/Callback rotaları
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: high
- Agent: frontend-designer
- Skills: react-specialist, frontend-design, testing-expert
- Files: src/dashboard/src/App.tsx, src/dashboard/src/components/AppShell.tsx, src/dashboard/src/pages/LoginPage.tsx, src/dashboard/src/pages/CallbackPage.tsx, tests/dashboard/sso-wire.test.tsx
- Dependencies: 277-004, 277-005, 277-006, 277-007
- Scope: src/dashboard/, tests/dashboard/

### Description
Tüm parçaları bağla (en çok dosya — Dependencies ile tüm UI parçalarının ardından): (1) `App.tsx` köküne `<AuthProvider>` sarımı (Task 3) + AuthStatus'u AppShell header'a yerleştir (Task 4); (2) `/login` rotası + `LoginPage.tsx` — `dashboard_oidc.enabled` ise "Sign in with SSO" butonu (`buildAuthorizeUrl`→window redirect, Task 6) + her zaman ManualTokenInput (Task 5); kapalıysa yalnız manual + localhost-inject bilgisi; (3) `/auth/callback` rotası + `CallbackPage.tsx` — `parseCallbackParams`+`validateState` (Task 6) → `POST /api/auth/oidc/exchange` (Task 7) → token sessionStorage → `/`'a yönlendir; hata → /login + mesaj. Mevcut dashboard (localhost auto-inject) AYNEN çalışır (auth zaten varsa login'e zorlamaz). Testler (jsdom, mock): AuthProvider wire, AuthStatus header render, LoginPage oidc-on/off, callback başarı→redirect + hata→login.

**Kanıt:** `npx vitest run --config vitest.dashboard.config.ts tests/dashboard/sso-wire.test.tsx` yeşil + `npx tsc --noEmit -p src/dashboard` temiz; `grep -n 'path="/login"\|path="/auth/callback"' src/dashboard/src/App.tsx` = 2. **Test:** 7+. NOT: gerçek-tarayıcı doğrulaması CC sprint-sonu playwright.

---

## Task 9: EnterprisePage "BENİM rolüm" bağlamı
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: low
- Agent: frontend-designer
- Skills: react-specialist, testing-expert
- Files: src/dashboard/src/pages/EnterprisePage.tsx, tests/dashboard/enterprise-my-role.test.tsx
- Dependencies: 277-003
- Scope: src/dashboard/, tests/dashboard/
- ModelEffort: low

### Description
EnterprisePage RBAC tablosuna (envanter §4: tüm roller listeleniyor ama "hangisi BEN") `useAuth().identity.role` ile mevcut kullanıcının rolünü vurgula ("You are: <role>" rozeti + tabloda kendi satırını işaretle). identity yoksa (static mode) rozet gizli ya da "local (full access)". Mevcut rbac-fetch davranışı korunur. i18n. Testler: oidc-rol vurgusu, static-mode, identity-yok.

**Kanıt:** `npx vitest run --config vitest.dashboard.config.ts tests/dashboard/enterprise-my-role.test.tsx` yeşil. **Test:** 4+.

---

## Task 10: api_oidc test smoke — gerçek-binary serve + JWT-bearer dashboard yolu
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: normal
- Agent: ci-guardian
- Skills: ci-testing, typescript-expert
- Files: tests/e2e/dashboard-sso-smoke.test.ts
- Dependencies: 277-001
- Scope: tests/e2e/

### Description
YENİ hermetik e2e: tmpdir config'te `api_oidc.enabled=true` (HS256, test-secret) + serve gerçek-binary spawn (async, npm-pack-smoke deseni) → test JWT üret (HS256 same secret, mevcut auth-oidc test-helper'ı varsa kullan) → `GET /api/auth/me` Bearer-JWT ile → 200 + claim'ler; geçersiz JWT → 401/403; static-token fallback hâlâ çalışır. Gerçek IdP YOK (HS256 local secret). Timeout cömert. Files'taki tek dosya.

**Kanıt:** `npx vitest run tests/e2e/dashboard-sso-smoke.test.ts` yeşil. **Test:** 4+.

---

## Task 11: config-reference + api-surface — dashboard_oidc + auth/me + crossVerify-komşu
- Provider: claude
- Model: haiku
- Backend: docker
- Effort: low
- Agent: doc-writer
- Skills: documentation-writer
- Files: docs/reference/config-reference.md, docs/reference/api-surface.md
- Dependencies: 277-001, 277-007
- Scope: docs/reference/
- ModelEffort: low

### Description
DİSKTEKİ koddan (inmemişleri yazma + .result'a not): config-reference'a `dashboard_oidc` bloğu (alanlar/default-off birebir); api-surface.md'ye `/api/auth/me` + `/api/auth/oidc/exchange` endpoint sözleşmeleri (request/response shape, exempt durumu). Uydurma YOK.

**Kanıt:** `grep -ciE "dashboard_oidc|auth/me|oidc/exchange" docs/reference/config-reference.md docs/reference/api-surface.md | paste -sd+ | bc` ≥ 3. **Test:** yok — .result YAZ.

---

## Task 12: features + enterprise-depth — dashboard SSO satırları
- Provider: claude
- Model: haiku
- Backend: docker
- Effort: low
- Agent: doc-writer
- Skills: documentation-writer
- Files: docs/reference/features.md, docs/reference/enterprise-depth.md
- Dependencies: 277-004, 277-008
- Scope: docs/reference/
- ModelEffort: low

### Description
DİSKTEKİ koddan: features.md'ye dashboard SSO satırları (useAuth + AuthStatus + login/callback + ManualTokenInput + audit-actor; tetikleyen config `dashboard_oidc`); enterprise-depth.md'ye "Dashboard SSO" bölümü (backend hazır + dashboard auth-state akışı, manuel-token + OIDC-redirect iki yol). Mevcut format.

**Kanıt:** `grep -ciE "dashboard.?sso|useAuth|AuthStatus|dashboard_oidc" docs/reference/features.md docs/reference/enterprise-depth.md | paste -sd+ | bc` ≥ 2. **Test:** yok — .result YAZ.

---

## Task 13: MASTER-PLAN — ENT-5 dashboard SSO işaretleri
- Provider: claude
- Model: haiku
- Backend: docker
- Effort: low
- Agent: doc-writer
- Skills: documentation-writer
- Files: docs/MASTER-PLAN.md
- Dependencies: 277-008, 277-010
- Scope: docs/
- ModelEffort: low

### Description
ENT-5 maddesinde dashboard SSO işaretle (diskte doğruladığın; inmemişleri İŞARETLEME): dashboard auth-state ✅ Sprint 277 (useAuth + identity + manual-token + session + logout + /api/auth/me + audit-actor + "benim rolüm") + OIDC-redirect iskelet ✅ (PKCE/authorize/callback/token-exchange config-gated, mock-IdP test; gerçek-IdP canlı smoke kalan). Tek-satır ekler, mevcut metni SİLME. ENT-5 "son kalan" → "tamamlandı (gerçek-IdP doğrulaması opt-in)".

**Kanıt:** `grep -c "Sprint 277" docs/MASTER-PLAN.md` ≥ 2. **Test:** yok — .result YAZ.

---

## Task 14: dashboard emoji→lucide-react temizliği — tasarım kararı ihlali geri-al (ACİL, Alperen)
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: normal
- Agent: frontend-designer
- Skills: react-specialist, frontend-design, testing-expert
- Files: src/dashboard/src/components/WorkerCard.tsx, src/dashboard/src/components/ActivityFeed.tsx, src/dashboard/src/components/SprintControlPanel.tsx, src/dashboard/src/pages/DashboardPage.tsx, tests/dashboard/no-emoji-guard.test.tsx
- Scope: src/dashboard/, tests/dashboard/

### Description
Alperen 2026-06-11: dashboard'a tasarım-kararını ihlal eden emojiler girmiş — KALDIR, spec'teki lucide ikon estetiğine dön (işlevsellik AYNEN korunur). **KAYNAK TASARIM SPEC: `docs/design/web-console/README.md`** — "Icons: **Lucide** (already used by the app)" + referans ikon adları (satır 233-236) + "terminal uses **clean monospace glyphs only (no emoji-presentation characters)**" (satır 261-263). Spec'in verdiği TAM eşleşmeler:
- **WorkerCard.tsx** (spec §3 worker card, satır 143-155): MODEL_ICON 💎⚡🍃 → lucide **`Gem`/`Zap`/`Leaf`**; getModelIcon fallback 🤖 → **`Bot`** (ya da `Cpu`); worker-id ikonu → **`Cpu`** (spec "mono worker id w/ `cpu` icon"); task-id 📝 → **`FileCode2`** (spec `file-code-2`); role → **`HardHat`** (spec `hard-hat`); heartbeat ❤ → **`Activity`** (spec "heartbeat (`activity`, red)"); DONE → **`CheckCheck`** (spec `check-check`); EXECUTING → spinning **`Loader`** (spec); elapsed → **`Clock`**. STATUS_ICON ✓✗▶⏸○ düz-glyph (emoji-presentation değil) ama lucide tutarlılığı için status-chip'i spec'in colored-dot + label desenine çevir (StatusDot).
- **ActivityFeed.tsx** 🔄🟢✅❌📝⚠🔔 → lucide: `RefreshCw`/`Activity`/`CheckCheck`/`XCircle` (ya da spec `skull` ERROR için)/`FileCode2`/`AlertTriangle`/`Bell`.
- **SprintControlPanel.tsx** + **DashboardPage.tsx** 🐙 → Decko mascot (spec: "Sidebar: brand (Decko mascot 40px...)" — mevcut `decko-mascot.png`/`assets/favicon.png` img, Sidebar deseniyle), pikselleşmiş emoji-octopus DEĞİL.
- **YENİ guard testi `no-emoji-guard.test.tsx`:** dashboard component'lerinde emoji-presentation karakter taraması = 0 (gelecek girişi yakalar; düz-glyph ok/check whitelist karar notes'a). i18n en/tr.ts'e DOKUNMA (kullanıcı UI-emoji dedi; i18n'de emoji varsa notes'a raporla). `→` ok-glyph'leri (emoji-değil) kapsam dışı. Renk/status-semantiği spec'e sadık (DONE green/ERROR red/PAUSED amber KORUNUR).

**Kanıt:** `npx vitest run --config vitest.dashboard.config.ts tests/dashboard/no-emoji-guard.test.tsx` yeşil; `grep -rnoP "[\\x{1F300}-\\x{1FAFF}\\x{1F000}-\\x{1F0FF}]" src/dashboard/src/components/WorkerCard.tsx src/dashboard/src/components/ActivityFeed.tsx | wc -l` = 0. **Test:** 3+. NOT: görsel doğrulama CC sprint-sonu playwright (eski-estetik teyidi).

---

**Beklenen:** 14 mikro task (opus 2 — oidc-flow PKCE + token-exchange güvenlik-kritik · sonnet 9 · haiku 3; Task 14 ACİL emoji-temizliği bağımsız), zincirler: 002→001 · 003→001 · 004→003 · 005→003 · 007→001 · 008→004,005,006,007 · 009→003 · 010→001 · 011→001,007 · 012→004,008 · 013→008,010 (Task 14 dependency-siz, kendi dosyaları). Dosya çakışması serileştirildi: server.ts (001+007 ayrı endpoint-mount — çakışırsa Brain FIX); App.tsx (008 tek sahip); config-types.ts (007 tek sahip bu sprint). Her şey default-off + localhost-inject yolu korunur. CC sprint sonu: tsc + testler + gerçek-binary serve+playwright (api_oidc JWT yolu + login sayfası render + auth-status) + commit/push + 🔨 BUILD. Sonraki: gerçek-IdP canlı OIDC smoke · F9 MCP-client Faz 2 · (en-son) MOD-SPLIT.
