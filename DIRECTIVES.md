# DIRECTIVES — Sprint 213: User-Facing Make-It-Work (serve+chat+UX) + IDE Extension — HER İKİSİ

## Goal: BÜYÜK ÖLÇEK (15 task, 3 dalga, 10 worker). MASTER-PLAN §10 Sprint 213 = HER İKİSİ. DALGA A (User-Facing Make-It-Work): mevcut yüzeyleri kullanıcı-gözü ÇALIŞIR yap — `npx deckent serve` localhost out-of-box (API token dashboard'a inject → DECKENT_API_AUTH_DISABLED gerekmez), Path A embedded dashboard chat (host-CLI'SIZ, server-side ProviderAdapter), chat CLI robust hata UX, F7-003 UI/UX god-level pass. DALGA B (IDE Extension): extensions/vscode/ GERÇEK impl — activation + command palette + sidebar tree (canlı agent/sprint) + status bar + settings. DALGA C: ADR-076 + MASTER-PLAN status + README badge. Her task TEK dosya odaklı/TEK sorumluluk, ≤200 LoC, effort≤normal, YENİ TEST DOSYASI zorunlu.

Bağlam:
- Sprint 212: 15/15 DONE, F5 evrim CANLI (6/6 caller), routing skill→agent sinyali (212-008) **artık build'li/canlı** → bu sprint'te UI task'ları frontend-designer, güvenlik api-builder/security-auditor'a gitmeli (çeşitlilik beklenir).
- **User-facing gerçek (MASTER-PLAN §3 ⚠️):** `serve` POST 401 (API token dashboard'a inject edilmiyor — sadece terminal token), `chat` host-CLI bağımlı (Path B "No AI CLI found"), UI/UX %30. Bu sprint bu üçünü kapatır.
- Wiring% ≠ user-working% ([[feedback_wiring_pct_vs_user_working]]): her yüzey için uçtan-uca gerçek akış doğrulanmalı, "wired" demek yetmez.

---

## Tüm task'lar için ortak kurallar
- **Subscription mode ZORUNLU** — `env -u ANTHROPIC_API_KEY -u DECKENT_CLAUDE_API_KEY`. API mode YASAK ([[project_api_mode_deferred_post_beta]]).
- Worker yalnızca scope.filesWrite.
- **KÜÇÜK TASK:** tek-dosya odaklı/tek-sorumluluk, ≤200 LoC, effort≤normal. high YASAK.
- **Her kod task'ı YENİ TEST DOSYASI** (min 4 test) — Brain coverage muafiyeti buna bağlı ([[feedback_brain_rubric_bridge_broken]]).
- **🔑 WIRE-GAP DERSİ ([[feedback_directive_kanit_letter_vs_goal]]):** "bağla/wire" task'ında scope ÇAĞIRAN dosyayı içerir, kanıt-grep def-dosyasını dışlar → gerçek external caller ≥1.
- **🔑 USER-WORKING KANITI ([[feedback_wiring_pct_vs_user_working]]):** yüzey task'larında uçtan-uca akışı test et (serve→POST→200, chat→mesaj→cevap), "fonksiyon var" yetmez.
- **Dishonest YASAK** — gerçekten ölç. CLI komutları index.ts'e WIRE et. Modül-seviye çöp/placeholder BIRAKMA ([[feedback_fix_prompt_quality]]).
- **VS Code extension:** `vscode` modülü test'te MOCK'lanır (gerçek VS Code host gerekmez). `@types/vscode` SADECE extensions/vscode/package.json devDep — **kök package.json'a DOKUNMA** (ADR-010).
- **Test dosyası doğru dizinde:** dashboard→`tests/dashboard/`, extension→`tests/extensions/`, api→`tests/api/`, cli→`tests/cli/`, scripts→`tests/scripts/`.
- ESM `.js` suffix. ADR-010 (yeni kök runtime dep YASAK). Hedef: tam-suite 0 fail KORUNUR, regresyon yok.

---

## DALGA A — User-Facing Make-It-Work (8 task)

## Task 1: 213-001 — serve: API token'ı dashboard'a inject (localhost out-of-box, 401 fix)
- Model: opus
- Effort: normal
- Skills: api-builder, security-specialist
- Files: src/api/server.ts, tests/api/serve-token-inject.test.ts
- Scope: src/api/, tests/api/

### Description
**Problem (MASTER-PLAN §3):** `npx deckent serve` dashboard'ı yüklüyor (GET) ama POST (start/kill) → 401. API token auto-üretiliyor (`server.ts:918 randomUUID`) ama browser'a inject EDİLMİYOR (sadece terminal token inject'li). Kullanıcı `DECKENT_API_AUTH_DISABLED=1` yapmak zorunda.
**Çözüm:** Served index.html'e — terminal token pattern'iyle aynı — `window.__DECKENT_API_TOKEN__` enjekte et (SADECE localhost bind'de; non-localhost'ta YASAK, güvenlik). Token = auto-generated finalToken. Böylece dashboard Authorization header'ı atayabilir.
**Kanıt:** `grep -c "__DECKENT_API_TOKEN__\|injectApiToken" src/api/server.ts` → ≥1; localhost-only guard testte doğrulanır; `npx vitest run tests/api/serve-token-inject.test.ts` → 4+ pass
**Test:** ≥4 (localhost inject var, non-localhost inject YOK, token = finalToken, auth-disabled modunda no-op)

## Task 2: 213-002 — dashboard: inject edilen API token'ı isteğe ekle (useApi)
- Model: sonnet
- Effort: normal
- Skills: react-specialist, typescript-expert
- Files: src/dashboard/src/lib/useApi.ts, tests/dashboard/useApi-token.test.ts
- Scope: src/dashboard/, tests/dashboard/
- Dependencies: 213-001

### Description
**Problem:** Dashboard fetch/POST Authorization header'ı atamıyor → 213-001 inject'i kullanılmıyor.
**Çözüm:** useApi (veya api client) `window.__DECKENT_API_TOKEN__` varsa `Authorization: Bearer <token>` ekle (GET+POST). Token yoksa header'sız (geriye uyumlu).
**Kanıt:** `grep -c "__DECKENT_API_TOKEN__\|Authorization\|Bearer" src/dashboard/src/lib/useApi.ts` → ≥1; `npm run test:dashboard -- useApi-token` → 4+ pass
**Test:** ≥4 (token varsa header eklenir, yoksa eklenmez, POST'a uygulanır, GET'e uygulanır)

## Task 3: 213-003 — serve localhost out-of-box smoke (POST 200, API-disabled YOK)
- Model: sonnet
- Effort: normal
- Skills: ci-testing, typescript-expert
- Files: scripts/serve-localhost-smoke.mjs, tests/scripts/serve-localhost-smoke.test.ts
- Scope: scripts/, tests/scripts/
- Dependencies: 213-001, 213-002

### Description
**Problem:** serve'in user-working olduğu uçtan-uca doğrulanmıyor.
**Çözüm:** `serve-localhost-smoke.mjs` — server'ı localhost'ta başlat (DECKENT_API_AUTH_DISABLED OLMADAN), index.html'den inject token'ı oku, korunan bir POST endpoint'e Bearer token ile istek at → 200 (401 DEĞİL) doğrula. Server'ı kapat.
**Kanıt:** `node scripts/serve-localhost-smoke.mjs` → PASS (POST 200); `npx vitest run tests/scripts/serve-localhost-smoke.test.ts` → 4+ pass
**Test:** ≥4 (token okunur, POST 200, token'sız POST 401, server kapanır)

## Task 4: 213-004 — Path A: embedded chat backend (host-CLI'SIZ, server-side ProviderAdapter)
- Model: opus
- Effort: normal
- Skills: anthropic-sdk, typescript-expert
- Files: src/api/chat-backend.ts, tests/api/chat-backend.test.ts
- Scope: src/api/, tests/api/

### Description
**Problem:** `deckent chat` (Path B) host claude/codex CLI'ı PATH'te gerektiriyor — browser kullanıcısı için yok. Dashboard'da çalışan chat surface yok.
**Çözüm:** `chat-backend.ts` — F2 `runChatNativeLoop`'u (ProviderAdapter + MCP dispatch, subscription CLI spawn server-side) bir API/SSE endpoint'e bağla. Browser mesaj gönderir → server ProviderAdapter ile cevap üretir → döner. Kullanıcının kendi CLI'sı GEREKMEZ (deckent host'u subscription'lı claude'u zaten spawn ediyor). Test mock-adapter ile (gerçek spawn değil).
**Kanıt:** `grep -c "runChatNativeLoop\|ProviderAdapter\|chat.*endpoint\|/api/chat" src/api/chat-backend.ts` → ≥2; `npx vitest run tests/api/chat-backend.test.ts` → 4+ pass
**Test:** ≥4 (mesaj→cevap round-trip mock, MCP tool dispatch, hata path, çoklu-turn)

## Task 5: 213-005 — Dashboard Chat tab → chat-backend wire (Path A frontend)
- Model: sonnet
- Effort: normal
- Skills: react-specialist, frontend-design
- Files: src/dashboard/src/pages/ChatPage.tsx, tests/dashboard/ChatPage.test.tsx
- Scope: src/dashboard/, tests/dashboard/
- Dependencies: 213-004

### Description
**Problem:** ChatPage.tsx var ama chat-backend'e bağlı değil — çalışan chat surface yok.
**Çözüm:** ChatPage'i 213-004 endpoint'ine bağla — mesaj listesi render, input, gönder→cevap, loading state. useApi (213-002 token'lı) kullan. Boş/hata state'leri.
**Kanıt:** `grep -c "chat-backend\|/api/chat\|sendMessage\|useApi" src/dashboard/src/pages/ChatPage.tsx` → ≥1; `npm run test:dashboard -- ChatPage` → 4+ pass
**Test:** ≥4 (mesaj render, gönder çağrısı, cevap göster, boş state)

## Task 6: 213-006 — chat CLI robust hata UX (host-CLI yoksa net yönlendirme)
- Model: sonnet
- Effort: low
- Skills: typescript-expert
- Files: src/cli/commands/chat.ts, tests/cli/chat-no-cli-fallback.test.ts
- Scope: src/cli/, tests/cli/

### Description
**Problem:** Host CLI yoksa `chat.ts` kriptik "No AI CLI found" veriyor — kullanıcı ne yapacağını bilmiyor.
**Çözüm:** Net actionable hata: hangi CLI'lar aranır, nasıl kurulur, alternatif `--native` veya dashboard chat (213-004) önerisi. Mevcut spawn davranışını koru (surgical).
**Kanıt:** `grep -c "native\|dashboard\|install\|deckent serve" src/cli/commands/chat.ts` → ≥1; `npx vitest run tests/cli/chat-no-cli-fallback.test.ts` → 4+ pass
**Test:** ≥4 (no-CLI net mesaj, --native önerisi, kurulum ipucu, CLI varsa normal akış)

## Task 7: 213-007 — F7-003 UI/UX pass: Layout responsive + dark/light + bilgi mimarisi
- Model: sonnet
- Effort: normal
- Skills: react-specialist, frontend-design
- Files: src/dashboard/src/components/Layout.tsx, tests/dashboard/Layout-ux.test.tsx
- Scope: src/dashboard/, tests/dashboard/

### Description
**Problem:** ([[project_dashboard_control_plane]] F7-003 ~%30) UI/UX kötü — responsive + dark/light tutarlılık + bilgi mimarisi polish gerek.
**Çözüm:** Layout.tsx god-level pass — responsive grid breakpoint'leri, dark/light tutarlılık (ThemeProvider), spacing/tipografi hiyerarşisi, sidebar+header düzen. Mevcut component'leri koru, görsel tutarlılık.
**Kanıt:** `grep -c "responsive\|dark\|theme\|breakpoint\|grid" src/dashboard/src/components/Layout.tsx` → ≥3; `npm run test:dashboard -- Layout-ux` → 4+ pass
**Test:** ≥4 (render, theme toggle, responsive breakpoint, bilgi-mimarisi düzen)

## Task 8: 213-008 — F7-003 UI/UX pass: Sidebar navigasyon + empty/loading state'ler
- Model: sonnet
- Effort: normal
- Skills: react-specialist, frontend-design
- Files: src/dashboard/src/components/Sidebar.tsx, tests/dashboard/Sidebar-ux.test.tsx
- Scope: src/dashboard/, tests/dashboard/

### Description
**Problem:** Sidebar/navigasyon polish + empty/loading state'ler eksik (sade kişi anlamıyor).
**Çözüm:** Sidebar.tsx — net navigasyon (7 sayfa: Dashboard/Status/History/Memory/Config/Settings/Chat), aktif-sayfa vurgusu, empty/loading state, responsive collapse. Sezgisel bilgi mimarisi.
**Kanıt:** `grep -c "active\|nav\|empty\|loading\|collapse" src/dashboard/src/components/Sidebar.tsx` → ≥2; `npm run test:dashboard -- Sidebar-ux` → 4+ pass
**Test:** ≥4 (7 nav öğesi, aktif vurgu, empty state, responsive collapse)

---

## DALGA B — IDE Extension Gerçek İmpl (5 task)

## Task 9: 213-009 — VS Code extension gerçek activation + CLI/MCP köprü
- Model: opus
- Effort: normal
- Skills: typescript-expert
- Files: extensions/vscode/src/extension.ts, tests/extensions/extension-activate.test.ts
- Scope: extensions/, tests/extensions/

### Description
**Problem:** 212-013 scaffold iskelet; gerçek activation + deckent CLI/MCP tespiti yok.
**Çözüm:** extension.ts `activate(context)` — command/sidebar/statusbar kayıtlarını başlat, workspace'te deckent tespit et (CLI veya MCP), `deactivate` temizlik. `vscode` modülü test'te mock'lanır.
**Kanıt:** `grep -c "activate\|registerCommand\|subscriptions\|deactivate" extensions/vscode/src/extension.ts` → ≥3; `npx vitest run tests/extensions/extension-activate.test.ts` → 4+ pass
**Test:** ≥4 (activate kayıtları yapar, deckent tespit, deactivate temizler, mock vscode)

## Task 10: 213-010 — Command palette gerçek handler'lar (Start Sprint / Show Dashboard / Status)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: extensions/vscode/src/commands.ts, tests/extensions/extension-commands.test.ts
- Scope: extensions/, tests/extensions/
- Dependencies: 213-009

### Description
**Problem:** 212-014 komut stub'ları; gerçek aksiyon yok.
**Çözüm:** `deckent.startSprint` → integrated terminal'de `deckent start`; `deckent.showDashboard` → serve URL'i aç (vscode.env.openExternal); `deckent.status` → `deckent status` çıktısını output channel'a. vscode API mock'lu test.
**Kanıt:** `grep -c "startSprint\|showDashboard\|createTerminal\|openExternal" extensions/vscode/src/commands.ts` → ≥2; `npx vitest run tests/extensions/extension-commands.test.ts` → 4+ pass
**Test:** ≥4 (startSprint terminal, showDashboard URL, status output, bilinmeyen komut)

## Task 11: 213-011 — Sidebar TreeView: canlı agent/sprint durumu
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: extensions/vscode/src/sidebar.ts, tests/extensions/extension-sidebar.test.ts
- Scope: extensions/, tests/extensions/
- Dependencies: 213-009

### Description
**Problem:** IDE'de canlı sprint/agent görünürlüğü yok.
**Çözüm:** `sidebar.ts` TreeDataProvider — aktif sprint, worker'lar, task durumları (deckent status JSON veya .tasks/ oku). Refresh + tree node'lar. vscode.TreeItem mock'lu test.
**Kanıt:** `grep -c "TreeDataProvider\|getChildren\|TreeItem\|refresh" extensions/vscode/src/sidebar.ts` → ≥2; `npx vitest run tests/extensions/extension-sidebar.test.ts` → 4+ pass
**Test:** ≥4 (tree root, worker node'lar, refresh, boş sprint)

## Task 12: 213-012 — Status bar: sprint progress + usage
- Model: sonnet
- Effort: low
- Skills: typescript-expert
- Files: extensions/vscode/src/statusbar.ts, tests/extensions/extension-statusbar.test.ts
- Scope: extensions/, tests/extensions/
- Dependencies: 213-009

### Description
**Problem:** IDE status bar'da deckent göstergesi yok.
**Çözüm:** `statusbar.ts` — StatusBarItem: sprint ilerleme (X/Y task) + tıkla→dashboard. Periyodik güncelleme. mock'lu test.
**Kanıt:** `grep -c "StatusBarItem\|createStatusBarItem\|progress\|text" extensions/vscode/src/statusbar.ts` → ≥2; `npx vitest run tests/extensions/extension-statusbar.test.ts` → 3+ pass
**Test:** ≥3 (item create, progress metin, tıkla komut)

## Task 13: 213-013 — Settings UI (contributes.configuration → .deckent/config.json)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: extensions/vscode/src/settings.ts, tests/extensions/extension-settings.test.ts
- Scope: extensions/, tests/extensions/
- Dependencies: 213-009

### Description
**Problem:** Config'i IDE'den yönetme yok.
**Çözüm:** `settings.ts` — VS Code settings (`deckent.*`) ↔ `.deckent/config.json` köprü (oku/yaz: max_workers, brain_provider, worker_provider). package.json `contributes.configuration` şeması (bu task package.json'a da yazabilir — scope extensions/). mock'lu test.
**Kanıt:** `grep -c "configuration\|getConfiguration\|config.json\|max_workers" extensions/vscode/src/settings.ts` → ≥2; `npx vitest run tests/extensions/extension-settings.test.ts` → 4+ pass
**Test:** ≥4 (config oku, config yaz, varsayılan, geçersiz değer)

---

## DALGA C — ADR + Status (2 task)

## Task 14: 213-014 — ADR-076 (user-facing surfaces + IDE extension) + MASTER-PLAN status
- Model: sonnet
- Effort: low
- Skills: documentation-writer, system-architect
- Files: docs/adr/076-user-facing-surfaces-ide.md, docs/MASTER-PLAN.md, tests/docs/adr-076.test.ts
- Scope: docs/, tests/docs/
- Dependencies: 213-001, 213-004, 213-009

### Description
**Problem:** serve token-inject + Path A embedded chat + IDE extension kararları ADR/MASTER-PLAN'e geçmemiş.
**Çözüm:** ADR-076 (serve localhost token-inject + Path A embedded chat backend + VS Code extension architecture, MADR v3, accepted). MASTER-PLAN §3 user-facing notu + §6 + F7-003/F2 status güncelle (213 sonuçları). DOC-POLICY Tier-1 (tek roadmap).
**Kanıt:** `grep -c "serve\|embedded chat\|extension\|token" docs/adr/076-user-facing-surfaces-ide.md` → ≥3; `grep -c "213" docs/MASTER-PLAN.md` → ≥1; `npx vitest run tests/docs/adr-076.test.ts` → 3+ pass
**Test:** ≥3 (ADR-076 MADR bölümleri, MASTER-PLAN güncel, accepted)

## Task 15: 213-015 — README badge sync (190+→211+) + sayı doğrulama
- Model: haiku
- Effort: low
- Skills: documentation-writer
- Files: README.md, tests/docs/readme-badge.test.ts
- Scope: ., tests/docs/

### Description
**Problem:** ([[feedback_zero_hardcode_live_data]] MASTER-PLAN §9) README badge "sprints-190+" (gerçek 213+); başka stale sayı olabilir.
**Çözüm:** README badge'i güncel sprint'e çek (213+), MCP 32 / agent 15 / skill 21 gibi sayıları IDENTITY canonical ile hizala. SADECE README.md (kök) + test. ("96% context reduction" iddiası 212-012 benchmark'a bağlandıysa koru, değilse qualify et.)
**Kanıt:** `grep -c "sprints-2\|211\|213" README.md` → ≥1; eski "190+" YOK; `npx vitest run tests/docs/readme-badge.test.ts` → 3+ pass
**Test:** ≥3 (badge güncel, stale 190 yok, sayı tutarlı)

---

## Sprint Sonu Notu

**Beklenen:** 13-15/15 DONE, 0 false-FIX. **serve out-of-box çalışır** (POST 200, API-disabled gerekmez), **dashboard chat çalışır** (host-CLI'sız), **chat CLI net hata UX**, **dashboard UI/UX god-level adım**, **VS Code extension gerçek** (activation+palette+sidebar+statusbar+settings — `deckent` IDE'de canlı). tam-suite 0 fail KORUNUR. Routing çeşitlilik (212-008 canlı): UI→frontend-designer, serve→api-builder/security beklenir.

**Sprint sonrası:** Sprint 214 IDE depth + chat/UX hardening; sonra ecosystem (F8/F9/F10) + 8-provider (F1-009/010) + ERP. Provider-doğruluk analizi sprint sürerken.

**Pre-flight:** subscription env temiz, **build+restart + RE-PLAN YAPILDI** (212-008 routing canlı), config max_workers=10. Sprint start Alperen manuel.

İlgili memory:
- [[feedback_wiring_pct_vs_user_working]] — 🔑 user-working kanıtı (serve/chat uçtan-uca dene)
- [[feedback_directive_kanit_letter_vs_goal]] — wire-gap dersi (scope çağıranı içerir, kanıt def-dosyasını dışlar)
- [[feedback_agent_routing_imbalance]] — routing çeşitlilik (212-008 canlı, doğrulanmalı)
- [[project_dashboard_control_plane]] — F7 dashboard god-level
- [[project_deckent_runtime_ecosystem]] — runtime ecosystem yönü
- [[feedback_brain_rubric_bridge_broken]] — yeni test şart
- [[feedback_fix_prompt_quality]] — CLI index.ts wire
- [[project_api_mode_deferred_post_beta]] — subscription-only
- [[feedback_build_mcp_restart_coordination]] — build Alperen + RE-PLAN şart
