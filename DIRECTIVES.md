# DIRECTIVES — Sprint 219: Native Agentic Deckent — terminalde `claude` gibi + Agentic OS

## Goal: NATIVE AGENTIC SPRINTİ (12 task, 5 dalga, 10 worker). HEDEF (Alperen): `deckent` terminalde `claude` gibi native conversational agentic REPL olsun — argümansız `deckent` yazınca doğrudan sohbet açılsın, doğal dille konuş → deckent senin için sprint/status/memory/dosya aksiyonlarını yapsın. **Agentic OS.** DALGA A: native REPL (`deckent` argümansız → agentic chat; `deckent chat --native` gerçek round-trip run-proven). DALGA B: agentic tool-use (doğal dil → MCP aksiyon + onay kapısı). DALGA C: F2 streaming (token-stream, claude gibi akan cevap). DALGA D: dashboard kalıcı-fix (Layout/Sidebar tek-kaynak + cache-bust + render-test) + 8-sayfa garanti. DALGA E: TR MASTER-PLAN + ADR-081. Her Tier-1 task `Smoke:` satırlı (gerçek-binary kanıt).

Bağlam:
- **git-guard AKTİF** (dist'te) — worker-spawn deckent-dev'i resetlemez (Sprint 216 felaketi tekrarlanamaz). Sprint güvenli.
- **`deckent` argümansız** → şu an default action YOK (help gösterir). `entry.ts` `buildProgram().parseAsync(argv)`. `deckent chat --native` (`runChatNativeLoop`) VAR ama `deckent` direkt REPL açmıyor.
- **Proof-of-Function gate canlı** — Tier-1 task'lar sprint-içi smoke ile doğrulanır.
- **Dashboard 8-sayfa kökü çözüldü** (Layout navItems stale'di, 8d3113c1) — bu sprint kalıcı-fix (tek-kaynak + render-test).

---

## Tüm task'lar için ortak kurallar
- **🟢 PROOF-OF-FUNCTION ([[feedback_proof_of_function_dod]]):** user-surface task (`src/cli/`/`src/dashboard/`/`src/api/`) ZORUNLU `Smoke:` (gerçek-binary komut + beklenen çıktı). Mock-only = GO_WITH_TECH_DEBT.
- **🔑 USER-WORKING ([[feedback_wiring_pct_vs_user_working]]):** "wired" yetmez — `deckent` gerçekten REPL açmalı, gerçek cevap dönmeli. Dashboard kaynak-grep testi YASAK; **render-based test** (gerçek React render → link sayısı).
- **🔴 HERMETIK ([[project_ci_green_root_causes]]):** gitignored state okuma, tmpdir + sandbox HOME, async spawn. `npm run test:ci-sim`. CI yeşil KORUNUR.
- **🎨 GOD-LEVEL ([[feedback_no_minimum_no_mvp_deckent]]):** native REPL claude kalitesinde (akan cevap, sezgisel, hızlı).
- **KÜÇÜK TASK:** tek-dosya, ≤200 LoC, effort≤normal, YENİ TEST DOSYASI. ESM `.js`. ADR-010 (yeni runtime dep YOK). Subscription mode ([[project_api_mode_deferred_post_beta]]).

---

## DALGA A — Native REPL: `deckent` = claude gibi (3 task)

## Task 1: 219-001 — `deckent` argümansız → agentic chat REPL (claude modeli) [P0]
- Model: opus
- Effort: normal
- Skills: typescript-expert, anthropic-sdk
- Files: src/cli/entry.ts, tests/cli/default-repl.test.ts
- Scope: src/cli/, tests/cli/

### Description
**Problem (HEDEF):** `claude` yazınca REPL açılır; `deckent` argümansız sadece help gösteriyor (`entry.ts` `parseAsync(argv)`, default action yok). Kullanıcı `deckent` ile direkt agentic sohbet istiyor.
**Çözüm:** entry.ts — `process.argv` komut-argümanı yoksa (sadece `deckent`, alt-komut yok) `deckent chat --native`'e (runChatNativeLoop) yönlendir/launch. Açık alt-komut (`deckent plan`, `deckent serve` vb.) varsa normal parse. `--help`/`-h`/`--version` korunur. TTY değilse (pipe) graceful.
**Kanıt:** `grep -c "argv\|chat\|native\|runChat\|default\|no.*command" src/cli/entry.ts` → ≥2; `npx vitest run tests/cli/default-repl.test.ts` → 4+ pass
**Test:** ≥4 (argümansız→chat-launch mock, alt-komut→normal parse, --help korunur, non-TTY graceful)
**Smoke:** `echo "merhaba" | env -u ANTHROPIC_API_KEY node dist/cli/entry.js 2>&1 | head -5` → REPL/chat akışı başlar (help DEĞİL)

## Task 2: 219-002 — `deckent chat --native` gerçek round-trip run-proven
- Model: opus
- Effort: normal
- Skills: anthropic-sdk, typescript-expert
- Files: src/cli/commands/chat-native.ts, tests/cli/chat-native-roundtrip.test.ts
- Scope: src/cli/, tests/cli/

### Description
**Problem ([[feedback_wiring_pct_vs_user_working]]):** `runChatNativeLoop` VAR ama gerçek bir kullanıcı mesajına gerçek asistan cevabı döndüğü run-proven değil (subscription provider round-trip).
**Çözüm:** chat-native.ts — `runChatNativeLoop` gerçek ProviderAdapter (subscription CLI spawn) ile mesaj→cevap döndürdüğünü sağlamlaştır; boş/hata graceful; çok-turn memory. Testte mock adapter, prod gerçek.
**Kanıt:** `grep -c "runChatNativeLoop\|ProviderAdapter\|response\|roundtrip" src/cli/commands/chat-native.ts` → ≥2; `npx vitest run tests/cli/chat-native-roundtrip.test.ts` → 4+ pass
**Test:** ≥4 (mesaj→cevap mock, boş mesaj, hata graceful, çok-turn)
**Smoke:** `echo "merhaba" | env -u ANTHROPIC_API_KEY node dist/cli/entry.js chat --native --once 2>&1 | head -5` → gerçek metin cevabı (boş/hata değil)

## Task 3: 219-003 — REPL UX god-level (prompt, history, çok-satır, exit, Ctrl-C)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/cli/commands/chat-repl-ux.ts, tests/cli/chat-repl-ux.test.ts
- Scope: src/cli/, tests/cli/

### Description
**Problem:** REPL deneyimi claude kalitesinde değil (prompt, komut-geçmişi, exit, ctrl-c handling).
**Çözüm:** `chat-repl-ux.ts` — readline tabanlı REPL yardımcıları: prompt göstergesi, up/down geçmiş (ring buffer), çok-satır giriş, `/exit` `/clear`, Ctrl-C graceful (mesaj iptal vs çıkış). chat-native loop'a entegre.
**Kanıt:** `grep -c "prompt\|history\|readline\|exit\|SIGINT\|buffer" src/cli/commands/chat-repl-ux.ts` → ≥3; `npx vitest run tests/cli/chat-repl-ux.test.ts` → 4+ pass
**Test:** ≥4 (prompt, geçmiş nav, /exit, Ctrl-C graceful)

---

## DALGA B — Agentic Tool-Use: doğal dil → aksiyon (3 task)

## Task 4: 219-004 — REPL'de doğal dil → MCP/deckent aksiyon dispatch (agentic)
- Model: opus
- Effort: normal
- Skills: anthropic-sdk, typescript-expert
- Files: src/cli/commands/chat-agentic-dispatch.ts, tests/cli/chat-agentic-dispatch.test.ts
- Scope: src/cli/, tests/cli/

### Description
**Problem (HEDEF — agentic os):** REPL'de "sprint durumu ne / son sprint'i göster / hafızada X ara" gibi doğal dil → deckent aksiyonu (status/history/recall) çalışsın. Şu an chat tool-dispatch host-CLI'ya bağlı.
**Çözüm:** `chat-agentic-dispatch.ts` — kullanıcı niyetini deckent MCP tool'larına eşle (status/history/recall/plan), `McpToolDispatcher` ile çalıştır, sonucu REPL'e dön. Riskli aksiyon (start/kill) → onay kapısı (219-005).
**Kanıt:** `grep -c "dispatch\|status\|recall\|McpTool\|intent\|action" src/cli/commands/chat-agentic-dispatch.ts` → ≥2; `npx vitest run tests/cli/chat-agentic-dispatch.test.ts` → 4+ pass
**Test:** ≥4 (status intent→dispatch, recall intent, bilinmeyen→graceful, çoklu)

## Task 5: 219-005 — Agentic aksiyon onay kapısı (riskli → confirm)
- Model: sonnet
- Effort: normal
- Skills: security-specialist, typescript-expert
- Files: src/cli/commands/agentic-confirm.ts, tests/cli/agentic-confirm.test.ts
- Scope: src/cli/, tests/cli/

### Description
**Problem:** REPL agentic aksiyonlar (sprint start/kill, dosya yaz) onaysız çalışmamalı ([[feedback_deckent_kill_approval_required]] ruhu).
**Çözüm:** `agentic-confirm.ts` — riskli aksiyon sınıflandırma (start/kill/cleanup/write → confirm; status/recall/history → otomatik). Confirm prompt (y/N). REPL dispatch'e (219-004) entegre.
**Kanıt:** `grep -c "confirm\|risk\|kill\|start\|approve\|y/N" src/cli/commands/agentic-confirm.ts` → ≥2; `npx vitest run tests/cli/agentic-confirm.test.ts` → 4+ pass
**Test:** ≥4 (riskli→confirm, güvenli→otomatik, red→iptal, onay→çalış)

## Task 6: 219-006 — Agentic session persist (REPL hafıza + devam)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/cli/commands/agentic-session.ts, tests/cli/agentic-session.test.ts
- Scope: src/cli/, tests/cli/

### Description
**Problem (agentic os):** REPL oturumu kalıcı değil — kapatıp açınca bağlam kaybolur.
**Çözüm:** `agentic-session.ts` — REPL oturumunu memory.db'ye persist (ChatTurn, sessionId), `deckent` tekrar açılınca son oturum devam (resume). F2-006 ChatTurn altyapısı.
**Kanıt:** `grep -c "session\|persist\|resume\|ChatTurn\|memory" src/cli/commands/agentic-session.ts` → ≥2; `npx vitest run tests/cli/agentic-session.test.ts` → 4+ pass
**Test:** ≥4 (persist, resume, yeni oturum, hafıza yükle) — mock MemoryStore (hermetik)

---

## DALGA C — F2 Streaming: akan cevap (2 task)

## Task 7: 219-007 — chat-backend token-streaming (F2-007, gerçek SSE)
- Model: opus
- Effort: normal
- Skills: anthropic-sdk, api-builder
- Files: src/api/chat-stream.ts, tests/api/chat-stream.test.ts
- Scope: src/api/, tests/api/

### Description
**Problem ([[feedback_wiring_pct_vs_user_working]]):** Cevap tek-parça geliyor; claude gibi token-token akmıyor (F2-007).
**Çözüm:** `chat-stream.ts` — `streamChatMessage(message, adapter)`: provider stream chunk'larını async-iterable/SSE olarak yay. server.ts `/api/chat/stream` SSE endpoint (caller). REPL + dashboard tüketir.
**Kanıt:** `grep -c "stream\|chunk\|SSE\|async\*\|yield" src/api/chat-stream.ts` → ≥2; `grep -rl "chat-stream\|streamChatMessage\|/api/chat/stream" src/api/server.ts` → wire; `npx vitest run tests/api/chat-stream.test.ts` → 4+ pass
**Test:** ≥4 (chunk-stream mock, tam-metin birikimi, hata graceful, boş)

## Task 8: 219-008 — REPL + dashboard stream render (akan cevap göster)
- Model: sonnet
- Effort: normal
- Skills: react-specialist, typescript-expert
- Files: src/dashboard/src/lib/chat-stream-client.ts, tests/dashboard/chat-stream-client.test.ts
- Scope: src/dashboard/, tests/dashboard/
- Dependencies: 219-007

### Description
**Problem:** Dashboard ChatPage cevabı akarak göstermiyor.
**Çözüm:** `chat-stream-client.ts` — `/api/chat/stream` SSE tüket, token'ları akarak render (EventSource + Bearer). ChatPage entegrasyonu.
**Kanıt:** `grep -c "stream\|EventSource\|chunk\|/api/chat/stream\|Authorization" src/dashboard/src/lib/chat-stream-client.ts` → ≥2; `npm run test:dashboard -- chat-stream-client` → 4+ pass
**Test:** ≥4 (stream tüket, akan render, kapanış, hata)

---

## DALGA D — Dashboard Kalıcı-Fix + 8-Sayfa Garanti (2 task)

## Task 9: 219-009 — Dashboard nav tek-kaynak + RENDER-based test (kaynak-grep değil)
- Model: opus
- Effort: normal
- Skills: react-specialist, typescript-expert
- Files: src/dashboard/src/components/Sidebar.tsx, tests/dashboard/nav-render.test.tsx
- Scope: src/dashboard/, tests/dashboard/

### Description
**Problem (KÖK — 8-sayfa bug'ı):** Layout.tsx ve Sidebar.tsx İKİ ayrı navItems kopyası tutuyordu (Sprint 189 tech-debt) → biri güncellenince diğeri stale → kullanıcı 5 sayfa gördü. Geçici 8d3113c1 ile Layout 10'a çıkarıldı ama DUPLİKASYON sürüyor. Ayrıca testler kaynak-grep (kırılgan).
**Çözüm:** Sidebar.tsx `navItems`'i TEK kaynak export; Layout.tsx onu import etsin (duplikasyon SİL). **RENDER-based test:** gerçek React render → DOM'da 10 nav link assert (kaynak-string grep DEĞİL). Bu, "8 sayfa görünüyor"u gerçekten doğrular.
**Kanıt:** `grep -c "export.*navItems" src/dashboard/src/components/Sidebar.tsx` → ≥1; Layout duplikasyon yok: `grep -c "to: \"/\"" src/dashboard/src/components/Layout.tsx` → 0 (inline array kalkmış); `npm run test:dashboard -- nav-render` → 4+ pass
**Test:** ≥4 (render→10 link DOM'da, evolution/nervous/enterprise/memory-explorer görünür, tek-kaynak, mevcut linkler korunur)
**Smoke:** `npm run test:dashboard -- nav-render` → gerçek render'da 10 nav link PASS

## Task 10: 219-010 — Dashboard cache-bust + tarayıcı-e2e smoke (8 sayfa gerçekten yüklenir)
- Model: sonnet
- Effort: normal
- Skills: ci-testing, react-specialist
- Files: scripts/dashboard-e2e-smoke.mjs, tests/scripts/dashboard-e2e-smoke.test.ts
- Scope: scripts/, tests/scripts/
- Dependencies: 219-009

### Description
**Problem:** build sonrası tarayıcı eski bundle cache'liyor (kullanıcı 8 sayfa görmedi); endpoint-200 ≠ UI render.
**Çözüm:** `dashboard-e2e-smoke.mjs` — serve boot + index.html `Cache-Control: no-cache` header doğrula + bundle hash referansı güncel + (mümkünse headless DOM ile) 10 nav link kontrol. server.ts static serve cache-bust header (varsa not). Async spawn, try/finally kill.
**Kanıt:** `grep -c "cache\|no-cache\|bundle\|nav\|10\|entry.js" scripts/dashboard-e2e-smoke.mjs` → ≥3; `npx vitest run tests/scripts/dashboard-e2e-smoke.test.ts` → 4+ pass
**Test:** ≥4 (cache header, bundle güncel, nav sayısı, dist-yok skip)

---

## DALGA E — TR MASTER-PLAN + ADR (2 task)

## Task 11: 219-011 — TR MASTER-PLAN (Türkçe, güncel dürüst durumla)
- Model: sonnet
- Effort: normal
- Skills: documentation-writer
- Files: docs/MASTER-PLAN-TR.md, tests/docs/master-plan-tr.test.ts
- Scope: docs/, tests/docs/

### Description
**Problem (Alperen talebi):** MASTER-PLAN'in Türkçe sürümü yok; Alperen inceleyecek. Dashboard artık gerçekten çalıştığı için dürüst yazılabilir.
**Çözüm:** `docs/MASTER-PLAN-TR.md` — MASTER-PLAN.md'nin Türkçe çevirisi/özeti (vizyon, Trinity, güncel durum Sprint 219, F1-F10, sub-projeler, native chat, work-streams, publish, risk). Güncel dürüst durum (216-219 dahil, native agentic, dashboard 8-sayfa).
**Kanıt:** `grep -c "Vizyon\|Trinity\|Sprint 219\|native\|publish\|F7\|agentic" docs/MASTER-PLAN-TR.md` → ≥5; `npx vitest run tests/docs/master-plan-tr.test.ts` → 3+ pass
**Test:** ≥3 (TR mevcut, ana bölümler, Sprint 219 güncel)

## Task 12: 219-012 — ADR-081 (Native Agentic Deckent) + MASTER-PLAN status
- Model: sonnet
- Effort: low
- Skills: documentation-writer, system-architect
- Files: docs/adr/081-native-agentic-deckent.md, docs/MASTER-PLAN.md, tests/docs/adr-081.test.ts
- Scope: docs/, tests/docs/
- Dependencies: 219-001, 219-007

### Description
**Çözüm:** ADR-081 (`deckent` argümansız agentic REPL + agentic tool-use + F2 streaming + agentic-os yönü, MADR, accepted). MASTER-PLAN §3/§4 F2-007/008 streaming, §6 native chat → DONE, §10 Sprint 219, dashboard 8-sayfa kalıcı-fix güncelle.
**Kanıt:** `grep -c "native\|agentic\|REPL\|streaming" docs/adr/081-*.md` → ≥3; `grep -c "219" docs/MASTER-PLAN.md` → ≥1; `npx vitest run tests/docs/adr-081.test.ts` → 3+ pass
**Test:** ≥3 (ADR-081 MADR, MASTER-PLAN güncel, accepted)

---

## Sprint Sonu Notu

**Beklenen:** 10-12/12 DONE, 0 false-FIX. **`deckent` = claude gibi:** argümansız REPL açılır, doğal dille konuş → agentic aksiyon (onaylı), cevap akarak gelir (streaming). Dashboard 8 sayfa kalıcı (tek-kaynak + render-test + cache-bust). TR MASTER-PLAN hazır. CI yeşil KORUNUR, tam-suite 0 fail.

**🟢 RUN-VERIFY (cc sprint sonu):** gerçek `dist/cli/entry.js` (argümansız → REPL açılır mı + gerçek cevap), `chat --native --once` (gerçek metin), `serve` (dashboard 10 nav link). Mock-only DONE kabul YOK. Tarayıcı görsel teyit Alperen.

**Pre-flight:** **build:all + restart + RE-PLAN ŞART.** git-guard aktif (worker-spawn güvenli). config max_workers=10. Sprint **CLI'dan** başlat (dashboard'dan değil — `env -u ANTHROPIC_API_KEY`). Her wave sonrası `git log -1` + `git status`.

**Sprint sonrası (220):** publish-readiness (secret-scrub/gitleaks + .github eksikleri + 96%-claim doğrula + threat-model) — GA hazırlık.

İlgili memory:
- [[feedback_proof_of_function_dod]] — Smoke gate (gerçek-koşu)
- [[feedback_wiring_pct_vs_user_working]] — wired≠çalışıyor (deckent gerçekten REPL açmalı)
- [[project_deckent_runtime_ecosystem]] — agentic os + native
- [[project_dashboard_realrun_findings]] — 8-sayfa kökü (Layout/Sidebar tek-kaynak)
- [[project_deckent_self_git_mutation_bug]] — git-guard aktif (CLI'dan başlat)
- [[feedback_build_mcp_restart_coordination]] — build Alperen + RE-PLAN
- [[feedback_no_minimum_no_mvp_deckent]] — REPL god-level (claude kalitesi)
