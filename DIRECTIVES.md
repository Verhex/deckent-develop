# DIRECTIVES — Sprint 214: P0 Auth-Precedence Fix + User-Facing (213 yeniden) + IDE Extension + F1-009 8-Provider

## Goal: ÇOK BÜYÜK ÖLÇEK (20 task, 5 dalga, 10 worker). DALGA 0 (P0): auth-precedence bug fix — `npx deckent start` (env-u olmadan) config `auth_mode: subscription`'a saygı duysun (ANTHROPIC_API_KEY container'a koşulsuz geçmesin). DALGA A: user-facing make-it-work (serve out-of-box token-inject + Path A embedded chat host-CLI'sız + chat CLI robust UX + F7-003 UI/UX) — Sprint 213 başarısız oldu (API timeout), yeniden. DALGA B: IDE extension gerçek impl. DALGA C: F1-009 8-provider (OpenAI-uyumlu generic adapter → DeepSeek/Qwen/GLM + dinamik ProviderName + .deck key + bootstrap). DALGA D: ADR + status. Her task TEK dosya odaklı, ≤200 LoC, effort≤normal, YENİ TEST DOSYASI zorunlu.

Bağlam:
- **Sprint 213 KILL edildi** (PID-confirmed) — tüm worker'lar `env -u` olmadan başlatıldığı için ANTHROPIC_API_KEY ile API moduna gidip timeout → exit-0 → toplu sahte NO_GO. .tasks temizlendi.
- **Kök bug (KESİN, `spawn-backend-docker.ts:547-553`):** envKeys ANTHROPIC_API_KEY'i `auth_mode` FARK ETMEKSİZİN container'a `-e` ile geçiriyor → CLI API moduna kayıyor. Bu sprint bunu kalıcı çözer ([[feedback_container_auth_precedence]]).
- F5 evrim canlı (Sprint 212), provider altyapısı 8-provider'a hazır (audit doğrulandı: 3 CLI-spawn adapter + registry + models.dev catalog + .deck secrets; eksik = HTTP OpenAI-compat adapter).

---

## Tüm task'lar için ortak kurallar
- **⚠️ Bu sprint HÂLÂ `env -u ANTHROPIC_API_KEY -u DECKENT_CLAUDE_API_KEY` ile başlatılır** — 214-001 auth fix GELECEK sprint'leri kurtarır (dist build sonrası), bu run'ın worker'ları eski dist'te. API mode YASAK ([[project_api_mode_deferred_post_beta]]).
- Worker yalnızca scope.filesWrite. **KÜÇÜK TASK:** tek-dosya odaklı/tek-sorumluluk, ≤200 LoC, effort≤normal. high YASAK.
- **Her kod task'ı YENİ TEST DOSYASI** (min 4 test) ([[feedback_brain_rubric_bridge_broken]]).
- **🔑 WIRE-GAP DERSİ:** "bağla/wire" task'ında scope ÇAĞIRAN dosyayı içerir, kanıt-grep def-dosyasını dışlar → external caller ≥1 ([[feedback_directive_kanit_letter_vs_goal]]).
- **🔑 USER-WORKING KANITI:** yüzey task'larında uçtan-uca akış test et (serve→POST→200, chat→cevap), "wired" yetmez ([[feedback_wiring_pct_vs_user_working]]).
- **Dishonest YASAK** — gerçekten ölç. CLI komutları index.ts'e WIRE et. Çöp/placeholder BIRAKMA ([[feedback_fix_prompt_quality]]).
- **VS Code extension:** `vscode` modülü test'te MOCK; `@types/vscode` SADECE extensions/vscode/package.json devDep — **kök package.json'a DOKUNMA** (ADR-010).
- **Yeni provider key'leri** `.deck` secret (ADR-014) + config `providers` — kök package.json'a yeni runtime dep EKLEME (fetch built-in).
- Test doğru dizinde: dashboard→tests/dashboard/, extension→tests/extensions/, api→tests/api/, cli→tests/cli/, orchestra→tests/orchestra/, core→tests/core/, scripts→tests/scripts/.
- ESM `.js` suffix. Hedef: tam-suite 0 fail KORUNUR.

---

## DALGA 0 — P0 Auth-Precedence Fix (2 task)

## Task 1: 214-001 — Docker env-forwarding provider+auth-aware (ANTHROPIC_API_KEY subscription'da strip)
- Model: opus
- Effort: normal
- Skills: typescript-expert, security-specialist
- Files: src/orchestra/spawn-backend-docker.ts, tests/orchestra/docker-auth-precedence.test.ts
- Scope: src/orchestra/, tests/orchestra/

### Description
**Problem (KESİN):** `spawn-backend-docker.ts:547-553` envKeys döngüsü `ANTHROPIC_API_KEY`'i host env'de varsa container'a KOŞULSUZ geçiriyor — `useApiOnly` (subscription/api) FARK ETMİYOR. Container'daki claude CLI key'i görünce API moduna geçiyor → config `auth_mode: subscription` etkisiz → Tier-1 timeout. Kullanıcı her `deckent start`'ta `env -u` yapmak zorunda.
**Çözüm:** env-forwarding'i **provider+auth-aware** yap: Claude worker + subscription (`!useApiOnly`) → `ANTHROPIC_API_KEY`'i container'a GEÇİRME (CLI subscription ~/.claude'a düşsün). Sadece `useApiOnly` (authMode=api) iken geçir. OPENAI_API_KEY/GOOGLE_API_KEY forwarding'i provider'a göre (codex→OPENAI, gemini→GOOGLE) veya mevcut davranışı koru ama Anthropic'i subscription'da strip et. Surgical, mevcut api-mode davranışını bozma.
**Kanıt:** `grep -c "useApiOnly\|subscription.*strip\|skip.*ANTHROPIC\|authMode" src/orchestra/spawn-backend-docker.ts` (forwarding bloğunda auth-aware mantık) ≥1; `npx vitest run tests/orchestra/docker-auth-precedence.test.ts` → 4+ pass
**Test:** ≥4 (subscription+ANTHROPIC_API_KEY set → dockerArgs'a ANTHROPIC EKLENMEZ, api mode → eklenir, codex→OPENAI geçer, gemini→GOOGLE geçer)

## Task 2: 214-002 — Auth-mode resolution guard + smoke (config subscription effective)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert, ci-testing
- Files: scripts/auth-mode-resolution-smoke.mjs, tests/scripts/auth-mode-resolution-smoke.test.ts
- Scope: scripts/, tests/scripts/
- Dependencies: 214-001

### Description
**Problem:** "config subscription → gerçekten subscription" uçtan-uca doğrulanmıyor.
**Çözüm:** `auth-mode-resolution-smoke.mjs` — ANTHROPIC_API_KEY set + config auth_mode=subscription iken docker spawn arg'larının ANTHROPIC_API_KEY İÇERMEDİĞİNİ doğrula (gerçek container DEĞİL, arg-build assertion). api mode iken içerdiğini doğrula.
**Kanıt:** `node scripts/auth-mode-resolution-smoke.mjs` → PASS; `npx vitest run tests/scripts/auth-mode-resolution-smoke.test.ts` → 4+ pass
**Test:** ≥4 (subscription arg'da yok, api arg'da var, default subscription, mixed env)

---

## DALGA A — User-Facing Make-It-Work (6 task)

## Task 3: 214-003 — serve: API token'ı dashboard'a inject (localhost out-of-box, 401 fix)
- Model: opus
- Effort: normal
- Skills: api-builder, security-specialist
- Files: src/api/server.ts, tests/api/serve-token-inject.test.ts
- Scope: src/api/, tests/api/

### Description
**Problem:** `npx deckent serve` dashboard GET yükler ama POST→401; auto-token (`server.ts:918`) browser'a inject edilmiyor (sadece terminal token). Kullanıcı `DECKENT_API_AUTH_DISABLED=1` zorunda.
**Çözüm:** Served index.html'e `window.__DECKENT_API_TOKEN__` enjekte (SADECE localhost bind; non-localhost YASAK). Token = finalToken. Terminal-token pattern'iyle aynı.
**Kanıt:** `grep -c "__DECKENT_API_TOKEN__\|injectApiToken" src/api/server.ts` → ≥1; `npx vitest run tests/api/serve-token-inject.test.ts` → 4+ pass
**Test:** ≥4 (localhost inject, non-localhost YOK, token=finalToken, auth-disabled no-op)

## Task 4: 214-004 — dashboard: inject API token'ı isteğe ekle (useApi Bearer)
- Model: sonnet
- Effort: normal
- Skills: react-specialist, typescript-expert
- Files: src/dashboard/src/lib/useApi.ts, tests/dashboard/useApi-token.test.ts
- Scope: src/dashboard/, tests/dashboard/
- Dependencies: 214-003

### Description
**Problem:** Dashboard fetch Authorization atamıyor → inject kullanılmıyor.
**Çözüm:** `window.__DECKENT_API_TOKEN__` varsa `Authorization: Bearer` ekle (GET+POST), yoksa header'sız (geriye uyumlu).
**Kanıt:** `grep -c "__DECKENT_API_TOKEN__\|Authorization\|Bearer" src/dashboard/src/lib/useApi.ts` → ≥1; `npm run test:dashboard -- useApi-token` → 4+ pass
**Test:** ≥4 (token header eklenir, yoksa eklenmez, POST, GET)

## Task 5: 214-005 — serve localhost out-of-box smoke (POST 200, API-disabled YOK)
- Model: sonnet
- Effort: normal
- Skills: ci-testing, typescript-expert
- Files: scripts/serve-localhost-smoke.mjs, tests/scripts/serve-localhost-smoke.test.ts
- Scope: scripts/, tests/scripts/
- Dependencies: 214-003, 214-004

### Description
**Problem:** serve user-working uçtan-uca doğrulanmıyor.
**Çözüm:** `serve-localhost-smoke.mjs` — localhost server başlat (API_AUTH_DISABLED OLMADAN), index.html'den token oku, korunan POST'a Bearer ile → 200 (401 değil). Server kapat.
**Kanıt:** `node scripts/serve-localhost-smoke.mjs` → PASS; `npx vitest run tests/scripts/serve-localhost-smoke.test.ts` → 4+ pass
**Test:** ≥4 (token okunur, POST 200, token'sız 401, server kapanır)

## Task 6: 214-006 — Path A embedded chat backend (host-CLI'SIZ, server-side ProviderAdapter)
- Model: opus
- Effort: normal
- Skills: anthropic-sdk, typescript-expert
- Files: src/api/chat-backend.ts, tests/api/chat-backend.test.ts
- Scope: src/api/, tests/api/

### Description
**Problem:** `deckent chat` (Path B) host CLI gerektiriyor; browser'da çalışan chat yok.
**Çözüm:** `chat-backend.ts` — F2 `runChatNativeLoop`'u (ProviderAdapter + MCP dispatch, server-side subscription spawn) API/SSE endpoint'e bağla. Browser mesaj→server cevap. Kullanıcı CLI'sı GEREKMEZ. Test mock-adapter ile.
**Kanıt:** `grep -c "runChatNativeLoop\|ProviderAdapter\|/api/chat\|chat.*endpoint" src/api/chat-backend.ts` → ≥2; `npx vitest run tests/api/chat-backend.test.ts` → 4+ pass
**Test:** ≥4 (mesaj→cevap mock, MCP tool dispatch, hata, çoklu-turn)

## Task 7: 214-007 — Dashboard Chat tab → chat-backend wire (Path A frontend)
- Model: sonnet
- Effort: normal
- Skills: react-specialist, frontend-design
- Files: src/dashboard/src/pages/ChatPage.tsx, tests/dashboard/ChatPage.test.tsx
- Scope: src/dashboard/, tests/dashboard/
- Dependencies: 214-006

### Description
**Problem:** ChatPage.tsx chat-backend'e bağlı değil.
**Çözüm:** ChatPage'i 214-006 endpoint'ine bağla — mesaj listesi, input, gönder→cevap, loading/boş/hata state. useApi (214-004 token) kullan.
**Kanıt:** `grep -c "chat-backend\|/api/chat\|sendMessage\|useApi" src/dashboard/src/pages/ChatPage.tsx` → ≥1; `npm run test:dashboard -- ChatPage` → 4+ pass
**Test:** ≥4 (mesaj render, gönder, cevap, boş state)

## Task 8: 214-008 — F7-003 UI/UX pass: Layout responsive + dark/light + Sidebar
- Model: sonnet
- Effort: normal
- Skills: react-specialist, frontend-design
- Files: src/dashboard/src/components/Layout.tsx, tests/dashboard/Layout-ux.test.tsx
- Scope: src/dashboard/, tests/dashboard/

### Description
**Problem:** ([[project_dashboard_control_plane]] F7-003 ~%30) UI/UX kötü.
**Çözüm:** Layout.tsx god-level pass — responsive grid breakpoint, dark/light tutarlılık (ThemeProvider), spacing/tipografi hiyerarşisi, sidebar+header düzen. Mevcut component koru.
**Kanıt:** `grep -c "responsive\|dark\|theme\|breakpoint\|grid" src/dashboard/src/components/Layout.tsx` → ≥3; `npm run test:dashboard -- Layout-ux` → 4+ pass
**Test:** ≥4 (render, theme toggle, responsive, düzen)

---

## DALGA B — IDE Extension Gerçek İmpl (5 task)

## Task 9: 214-009 — VS Code extension gerçek activation + CLI/MCP köprü
- Model: opus
- Effort: normal
- Skills: typescript-expert
- Files: extensions/vscode/src/extension.ts, tests/extensions/extension-activate.test.ts
- Scope: extensions/, tests/extensions/

### Description
**Çözüm:** extension.ts `activate(context)` — command/sidebar/statusbar kayıt, workspace'te deckent tespit (CLI/MCP), `deactivate` temizlik. `vscode` test'te mock.
**Kanıt:** `grep -c "activate\|registerCommand\|subscriptions\|deactivate" extensions/vscode/src/extension.ts` → ≥3; `npx vitest run tests/extensions/extension-activate.test.ts` → 4+ pass
**Test:** ≥4 (activate kayıt, deckent tespit, deactivate, mock vscode)

## Task 10: 214-010 — Command palette handler'lar (Start Sprint / Show Dashboard / Status)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: extensions/vscode/src/commands.ts, tests/extensions/extension-commands.test.ts
- Scope: extensions/, tests/extensions/
- Dependencies: 214-009

### Description
**Çözüm:** `deckent.startSprint`→integrated terminal `deckent start`; `deckent.showDashboard`→serve URL (openExternal); `deckent.status`→output channel. mock vscode test.
**Kanıt:** `grep -c "startSprint\|showDashboard\|createTerminal\|openExternal" extensions/vscode/src/commands.ts` → ≥2; `npx vitest run tests/extensions/extension-commands.test.ts` → 4+ pass
**Test:** ≥4 (startSprint terminal, showDashboard URL, status output, bilinmeyen komut)

## Task 11: 214-011 — Sidebar TreeView: canlı agent/sprint durumu
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: extensions/vscode/src/sidebar.ts, tests/extensions/extension-sidebar.test.ts
- Scope: extensions/, tests/extensions/
- Dependencies: 214-009

### Description
**Çözüm:** `sidebar.ts` TreeDataProvider — aktif sprint, worker'lar, task durumları (deckent status JSON / .tasks oku). refresh + node'lar. mock test.
**Kanıt:** `grep -c "TreeDataProvider\|getChildren\|TreeItem\|refresh" extensions/vscode/src/sidebar.ts` → ≥2; `npx vitest run tests/extensions/extension-sidebar.test.ts` → 4+ pass
**Test:** ≥4 (tree root, worker node, refresh, boş sprint)

## Task 12: 214-012 — Status bar: sprint progress + tıkla→dashboard
- Model: sonnet
- Effort: low
- Skills: typescript-expert
- Files: extensions/vscode/src/statusbar.ts, tests/extensions/extension-statusbar.test.ts
- Scope: extensions/, tests/extensions/
- Dependencies: 214-009

### Description
**Çözüm:** `statusbar.ts` StatusBarItem — sprint ilerleme (X/Y) + tıkla→dashboard. periyodik güncelle. mock test.
**Kanıt:** `grep -c "StatusBarItem\|createStatusBarItem\|progress\|command" extensions/vscode/src/statusbar.ts` → ≥2; `npx vitest run tests/extensions/extension-statusbar.test.ts` → 3+ pass
**Test:** ≥3 (item create, progress metin, tıkla komut)

## Task 13: 214-013 — Settings köprü (.deckent/config.json ↔ vscode settings)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: extensions/vscode/src/settings.ts, tests/extensions/extension-settings.test.ts
- Scope: extensions/, tests/extensions/
- Dependencies: 214-009

### Description
**Çözüm:** `settings.ts` — vscode `deckent.*` settings ↔ `.deckent/config.json` (max_workers, brain_provider, worker_provider oku/yaz). package.json `contributes.configuration` şeması (extensions/ scope). mock test.
**Kanıt:** `grep -c "configuration\|getConfiguration\|config.json\|max_workers" extensions/vscode/src/settings.ts` → ≥2; `npx vitest run tests/extensions/extension-settings.test.ts` → 4+ pass
**Test:** ≥4 (config oku, yaz, varsayılan, geçersiz)

---

## DALGA C — F1-009 8-Provider (4 task)

## Task 14: 214-014 — OpenAICompatibleAdapter (HTTP /chat/completions — DeepSeek/Qwen/GLM)
- Model: opus
- Effort: normal
- Skills: typescript-expert, anthropic-sdk
- Files: src/providers/openai-compatible.ts, tests/providers/openai-compatible.test.ts
- Scope: src/providers/, tests/providers/

### Description
**Problem (audit):** 3 cloud adapter CLI-spawn; DeepSeek/Qwen/GLM'in CLI'ı yok — HTTP OpenAI-uyumlu adapter gerekir. Hepsi `/chat/completions` uyumlu → TEK adapter.
**Çözüm:** `openai-compatible.ts` — ProviderAdapter impl: `{baseURL, apiKeyEnv, models}` config; `send` = fetch POST `/chat/completions` (OpenAI şema); `isAvailable` = apiKey var mı. Node built-in fetch (yeni dep YOK). DeepSeek (api.deepseek.com/v1), Qwen (dashscope compatible-mode), GLM (open.bigmodel.cn) preset'leri.
**Kanıt:** `grep -c "ProviderAdapter\|chat/completions\|baseURL\|fetch\|apiKey" src/providers/openai-compatible.ts` → ≥3; `npx vitest run tests/providers/openai-compatible.test.ts` → 4+ pass (fetch mock)
**Test:** ≥4 (send round-trip mock, isAvailable key var/yok, DeepSeek preset, hata)

## Task 15: 214-015 — ProviderName dinamik + model-catalog PROVIDER_MAP genişlet
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/core/model-catalog.ts, tests/core/provider-map-extend.test.ts
- Scope: src/core/, tests/core/
- Dependencies: 214-014

### Description
**Problem:** PROVIDER_MAP yalnız anthropic/openai/google; ProviderName enum hardcoded → deepseek/qwen/zhipu unmapped.
**Çözüm:** PROVIDER_MAP'e deepseek/qwen/zhipu(glm) ekle (veya openai-compatible için generic passthrough); ProviderName'i dinamik/genişletilebilir yap (registered provider adlarını kabul et).
**Kanıt:** `grep -c "deepseek\|qwen\|zhipu\|glm\|openai-compat\|dynamic" src/core/model-catalog.ts` → ≥2; `npx vitest run tests/core/provider-map-extend.test.ts` → 4+ pass
**Test:** ≥4 (deepseek map, qwen map, glm map, bilinmeyen graceful)

## Task 16: 214-016 — Per-provider key (.deck) + bootstrap auto-register
- Model: sonnet
- Effort: normal
- Skills: typescript-expert, security-specialist
- Files: src/core/provider.ts, tests/core/provider-bootstrap-openai-compat.test.ts
- Scope: src/core/, tests/core/
- Dependencies: 214-014

### Description
**Problem:** OpenAI-compat provider'lar registry'ye otomatik kayıt olmuyor; key wiring yok.
**Çözüm:** Bootstrap'ta — DEEPSEEK_API_KEY/DASHSCOPE_API_KEY/ZHIPU_API_KEY (.deck veya env) varsa ilgili OpenAICompatibleAdapter'ı `registerProvider` et. Key yoksa skip (graceful). `.deck` secret okuma kullan (ADR-014).
**Kanıt:** `grep -c "registerProvider\|OpenAICompatible\|DEEPSEEK\|deck.*key\|apiKeyEnv" src/core/provider.ts` → ≥2; `npx vitest run tests/core/provider-bootstrap-openai-compat.test.ts` → 4+ pass
**Test:** ≥4 (key varsa register, yoksa skip, çoklu provider, .deck okuma)

## Task 17: 214-017 — Multi-provider eşzamanlı routing smoke (mix coexist)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert, ci-testing
- Files: scripts/multi-provider-smoke.mjs, tests/scripts/multi-provider-smoke.test.ts
- Scope: scripts/, tests/scripts/
- Dependencies: 214-014, 214-016

### Description
**Problem:** 3 CLI-subs + N HTTP-API + local'in registry'de eşzamanlı koexist'i doğrulanmıyor.
**Çözüm:** `multi-provider-smoke.mjs` — registry'ye claude(mock)+ollama(mock)+openai-compat(mock) register et, per-task provider routing'in doğru adapter'ı seçtiğini doğrula (eşzamanlı mix). Gerçek API çağrısı DEĞİL.
**Kanıt:** `node scripts/multi-provider-smoke.mjs` → PASS; `npx vitest run tests/scripts/multi-provider-smoke.test.ts` → 4+ pass
**Test:** ≥4 (3 provider register, per-task seçim, bilinmeyen provider fallback, mix coexist)

---

## DALGA D — ADR + Status (3 task)

## Task 18: 214-018 — chat CLI robust hata UX (host-CLI yoksa net yönlendirme)
- Model: sonnet
- Effort: low
- Skills: typescript-expert
- Files: src/cli/commands/chat.ts, tests/cli/chat-no-cli-fallback.test.ts
- Scope: src/cli/, tests/cli/

### Description
**Çözüm:** Host CLI yoksa net hata: aranan CLI'lar, kurulum, `--native` veya dashboard chat (214-006) önerisi. Mevcut spawn davranışı korunur.
**Kanıt:** `grep -c "native\|dashboard\|install\|deckent serve" src/cli/commands/chat.ts` → ≥1; `npx vitest run tests/cli/chat-no-cli-fallback.test.ts` → 4+ pass
**Test:** ≥4 (no-CLI net mesaj, --native öneri, kurulum ipucu, CLI varsa normal)

## Task 19: 214-019 — ADR-076 (auth-precedence + user-facing surfaces) + ADR-077 (8-provider) + MASTER-PLAN status
- Model: sonnet
- Effort: low
- Skills: documentation-writer, system-architect
- Files: docs/adr/076-auth-precedence-user-surfaces.md, docs/adr/077-multi-provider-openai-compat.md, docs/MASTER-PLAN.md, tests/docs/adr-214.test.ts
- Scope: docs/, tests/docs/
- Dependencies: 214-001, 214-014

### Description
**Çözüm:** ADR-076 (env-forwarding auth-aware + serve token-inject + Path A chat + IDE extension, MADR, accepted); ADR-077 (OpenAICompatibleAdapter + dinamik ProviderName + 8-provider fleet, MADR, accepted). MASTER-PLAN §3/§4 F1-009/F2/F7 + §12 Risk #5 status güncelle (214 sonuçları). DOC-POLICY Tier-1.
**Kanıt:** `grep -c "auth\|token\|extension" docs/adr/076-*.md` → ≥3; `grep -c "OpenAICompatible\|provider\|DeepSeek" docs/adr/077-*.md` → ≥2; `grep -c "214" docs/MASTER-PLAN.md` → ≥1; `npx vitest run tests/docs/adr-214.test.ts` → 3+ pass
**Test:** ≥3 (ADR-076 MADR, ADR-077 MADR, MASTER-PLAN güncel)

## Task 20: 214-020 — README badge sync (190+→214) + ci-baseline garbage fix
- Model: sonnet
- Effort: low
- Skills: documentation-writer, typescript-expert
- Files: README.md, scripts/ci-baseline-detect.mjs, tests/scripts/ci-baseline-detect.test.ts
- Scope: ., scripts/, tests/scripts/

### Description
**Problem:** README badge "sprints-190+" stale; ci-baseline.json `testCount:17,passed:0,failed:17` GARBAGE (gerçek 18484) — baseline-detector worker-bağlamında bozuk sayı yazıyor.
**Çözüm:** README badge güncel (214+, MCP 32/agent 15/skill 21). ci-baseline detector'ı düzelt — gerçek vitest sayısını yazsın (17/0/17 garbage'ı üreten yolu fix; sayı parse hatası/yanlış bağlam). (`scripts/` altında detector varsa orada, yoksa nereden yazılıyorsa.)
**Kanıt:** `grep -c "21[0-9]\|214" README.md` → ≥1 (eski 190 YOK); ci-baseline garbage üretmiyor; `npx vitest run tests/scripts/ci-baseline-detect.test.ts` → 3+ pass
**Test:** ≥3 (badge güncel, baseline gerçek sayı, 17/0/17 garbage yok)

---

## Sprint Sonu Notu

**Beklenen:** 17-20/20 DONE, 0 false-FIX. **auth-precedence FİX** (gelecek `deckent start` env-u'suz subscription'a saygı), **serve out-of-box** (POST 200), **dashboard chat çalışır** (host-CLI'sız), **F7-003 UI/UX adım**, **VS Code extension gerçek**, **8-provider** (OpenAI-compat adapter → DeepSeek/Qwen/GLM register-ready, eşzamanlı mix). tam-suite 0 fail KORUNUR.

**Pre-flight:** **⚠️ Bu sprint `env -u ANTHROPIC_API_KEY -u DECKENT_CLAUDE_API_KEY npx deckent start --auto-approve` ile başlatılır** (214-001 fix dist-build sonrası Sprint 215'ten itibaren env-u'yu gereksiz kılar). subscription creds canlı, **build+restart + RE-PLAN YAPILDI**, config max_workers=10, auth_mode=subscription. Sprint start Alperen manuel.

**Sprint sonrası:** 214-001 build'le canlı → Sprint 215 env-u'suz başlatılabilir (doğrula). F1-010 subs→API overflow + ERP + ecosystem (F8/F9/F10) sonraki arklar.

İlgili memory:
- [[feedback_container_auth_precedence]] — 🔑 auth-precedence kök fix (214-001)
- [[feedback_wiring_pct_vs_user_working]] — user-working kanıtı (serve/chat uçtan-uca)
- [[feedback_directive_kanit_letter_vs_goal]] — wire-gap dersi
- [[feedback_agent_routing_imbalance]] — routing çeşitlilik (212-008 canlı)
- [[project_deckent_runtime_ecosystem]] — 8-provider + runtime ecosystem yönü
- [[feedback_brain_synthetic_nogo_disk_verify]] — sahte NO_GO disk-verify
- [[feedback_fix_prompt_quality]] — CLI index.ts wire
- [[project_api_mode_deferred_post_beta]] — subscription-only (Anthropic); 3rd-party API ayrı
- [[feedback_build_mcp_restart_coordination]] — build Alperen + RE-PLAN şart
