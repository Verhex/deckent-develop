# DIRECTIVES — Sprint 220: Native-LLM-Wire (deckent gerçekten konuşur) + Dashboard-v2 Canlı + Nervous Activation

## Goal: BÜYÜK SPRINT (16 task, 6 dalga, 10 worker). Sprint 219 run-verify dürüst bulgusu: `deckent` argümansız REPL AÇILIYOR ama gerçek LLM'e bağlı DEĞİL ("provider not yet wired" — kabuk var, beyin yok). Bu sprint deckent'i **gerçekten-konuşan claude-benzeri**ne taşır + dashboard'ı **tam-canlı/işlevsel** yapar + nervous'u **aktif** eder. DALGA A: native REPL gerçek subscription provider-wire (P0 — `deckent` yaz→gerçek cevap). DALGA B: dashboard canlı (worker grid real-time, status doğru, refresh+cooldown, evolution/ADR veri, chat-wire). DALGA C: dashboard polish (config-budget, tech-debt filtre, coverage takip, enterprise-auth, alerts-dedup). DALGA D: nervous activation (config + bootstrap + handlers + smoke). DALGA E: 219-010 carry + ADR. **god-level — MVP ASLA.** Her Tier-1 task `Smoke:` satırlı.

Bağlam:
- **219-015/016 dist'te** (routeTaskV2 surface-bonus + smoke-field) → bu sprint plan'ında **routing düzelmeli** (cli/dashboard/api surface → api-builder/frontend-designer, refactorer-collapse bitmeli) + **Smoke parse olmalı** (Tier-1 task.smoke dolu). Plan analizinde DOĞRULA.
- **Native REPL kabuk hazır** (219-001 `deckent` argümansız REPL, runChatNativeLoop) ama `createSubscriptionChatAdapter` (chat-native.ts:427) REPL'e BAĞLI değil → "provider not yet wired".
- **Nervous observer wire VAR** (2 caller) ama config `enabled:false` → dormant. Activation = config + bootstrap + handlers.
- **git-guard aktif** (deckent-dev tree reset koruması). CI yeşil (19005/0).

---

## Tüm task'lar için ortak kurallar
- **🟢 PROOF-OF-FUNCTION ([[feedback_proof_of_function_dod]]):** user-surface (`src/cli/`/`src/dashboard/`/`src/api/`) ZORUNLU `Smoke:` (gerçek-binary + beklenen çıktı). Mock-only=GO_WITH_TECH_DEBT. **Run-verify dersi ([[project_dashboard_realrun_findings]]):** "REPL açılıyor" yetmez — gerçek cevap dönmeli.
- **🔴 HERMETIK ([[project_ci_green_root_causes]]):** gitignored state okuma, tmpdir+sandbox HOME, async spawn. test:ci-sim. CI yeşil KORUNUR (19005/0).
- **🔑 USER-WORKING ([[feedback_wiring_pct_vs_user_working]]):** "wired"≠çalışıyor; dashboard render-based test (kaynak-grep değil).
- **🎨 GOD-LEVEL:** kabuk değil gerçek-işlevsel; native hız, sıfır freeze.
- **KÜÇÜK TASK:** tek-dosya, ≤200 LoC, effort≤normal, YENİ TEST DOSYASI. ESM `.js`. Subscription mode (API yasak). ADR-010.

---

## DALGA A — Native REPL Gerçekten Konuşsun (3 task)

## Task 1: 220-001 — [P0] Native REPL gerçek subscription provider-wire (`deckent` yaz→gerçek cevap)
- Model: opus
- Effort: normal
- Skills: anthropic-sdk, typescript-expert
- Files: src/cli/entry.ts, tests/cli/native-repl-wire.test.ts
- Scope: src/cli/, tests/cli/

### Description
**Problem (219 run-verify):** `deckent` argümansız REPL açılıyor AMA "provider not yet wired — not connected to a real LLM" (skeleton). `createSubscriptionChatAdapter` (chat-native.ts:427) VAR ama REPL launch'ı kullanmıyor.
**Çözüm:** entry.ts native REPL launch'ı (219-001) — `createSubscriptionChatAdapter(config)` ile gerçek provider'ı `runChatNativeLoop`'a ver (subscription claude/codex/gemini CLI spawn). "provider not yet wired" mesajı KALKSIN, gerçek round-trip. Provider yoksa net hata (skeleton değil). Caller entry.ts (def chat-native.ts hariç).
**Kanıt:** `grep -c "createSubscriptionChatAdapter\|provider\|adapter" src/cli/entry.ts` → ≥2; `grep -c "provider not yet wired" src/cli/commands/chat-native.ts` → bu mesaj artık launch'ta tetiklenmemeli; `npx vitest run tests/cli/native-repl-wire.test.ts` → 4+ pass
**Test:** ≥4 (adapter wire, gerçek-cevap mock-adapter, provider-yok net-hata, REPL launch adapter'lı)
**Smoke:** `echo "kısaca selam de" | env -u ANTHROPIC_API_KEY node dist/cli/entry.js 2>&1 | head -8` → gerçek asistan cevabı ("provider not wired" DEĞİL)

## Task 2: 220-002 — `chat --native` flag + --message/--once gerçek round-trip
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/cli/commands/chat.ts, tests/cli/chat-native-flags.test.ts
- Scope: src/cli/, tests/cli/

### Description
**Problem:** `chat --native --once` → "unknown option --once" (219 run-verify). Headless/script kullanım için flag yok.
**Çözüm:** chat.ts — `--native` + `--once`/`--message <text>` flag (tek-mesaj, çıktıyı bas, çık). 220-001 adapter ile gerçek cevap. Caller chat.ts.
**Kanıt:** `grep -c "once\|message\|native" src/cli/commands/chat.ts` → ≥2; `npx vitest run tests/cli/chat-native-flags.test.ts` → 4+ pass
**Test:** ≥4 (--once tek-mesaj, --message text, flag yoksa REPL, gerçek cevap mock)
**Smoke:** `echo x | env -u ANTHROPIC_API_KEY node dist/cli/entry.js chat --native --once 2>&1 | head -5` → gerçek cevap (unknown-option DEĞİL)

## Task 3: 220-003 — Agentic REPL canlı MCP dispatch (doğal dil→gerçek aksiyon)
- Model: opus
- Effort: normal
- Skills: anthropic-sdk, typescript-expert
- Files: src/cli/commands/chat-native.ts, tests/cli/repl-agentic-live.test.ts
- Scope: src/cli/, tests/cli/

### Description
**Problem:** 219-004 `chat-agentic-dispatch` (classifyAgenticIntent/dispatchAgenticIntent) VAR ama REPL loop'una canlı bağlı değil — REPL'de "durum ne" yazınca gerçek deckent_status çalışmıyor.
**Çözüm:** chat-native.ts loop — kullanıcı mesajını önce `classifyAgenticIntent`'e ver; agentic intent (status/recall/history) ise `dispatchAgenticIntent` + onay (219-005 agentic-confirm) → sonucu REPL'e bas; değilse provider'a. Caller chat-native (def chat-agentic-dispatch hariç).
**Kanıt:** `grep -c "classifyAgenticIntent\|dispatchAgenticIntent\|requireConfirmIfRisky" src/cli/commands/chat-native.ts` → ≥2; `npx vitest run tests/cli/repl-agentic-live.test.ts` → 4+ pass
**Test:** ≥4 (status intent→dispatch, riskli→onay, sohbet→provider, recall canlı)
**Smoke:** `echo "sprint durumu ne" | env -u ANTHROPIC_API_KEY node dist/cli/entry.js chat --native --once 2>&1 | head` → gerçek status çıktısı

---

## DALGA B — Dashboard Tam-Canlı (4 task)

## Task 4: 220-004 — Canlı worker grid (sabit-6 değil, real-time SSE)
- Model: sonnet
- Effort: normal
- Skills: react-specialist, typescript-expert
- Files: src/dashboard/src/components/WorkerGrid.tsx, tests/dashboard/worker-grid-live.test.tsx
- Scope: src/dashboard/, tests/dashboard/

### Description
**Problem ([[project_dashboard_realrun_findings]] #1):** Dashboard sekmesi worker'ları güncellemiyor — ilk 6 worker sabit. Canlı/değişen olmalı.
**Çözüm:** `WorkerGrid.tsx` — SSE/use-live-data (219-007 hook) ile worker listesi real-time (spawn/done/active değişimi), sabit-limit yok. DashboardPage'e.
**Kanıt:** `grep -c "useLiveData\|SSE\|worker\|real-time\|map" src/dashboard/src/components/WorkerGrid.tsx` → ≥2; `npm run test:dashboard -- worker-grid-live` → 4+ pass
**Test:** ≥4 (worker render, ekleme/çıkarma canlı, done→durum değişir, boş)
**Smoke:** `npm run test:dashboard -- worker-grid-live` → canlı worker güncelleme PASS

## Task 5: 220-005 — Status sayfası gerçek-zaman (done işler "done" görünsün)
- Model: sonnet
- Effort: normal
- Skills: react-specialist, typescript-expert
- Files: src/dashboard/src/pages/StatusPage.tsx, tests/dashboard/status-realtime.test.tsx
- Scope: src/dashboard/, tests/dashboard/

### Description
**Problem (#2):** Status sayfası done işleri hâlâ "working" gösteriyor. Faz/durum gerçek-zamanlı yansımıyor.
**Çözüm:** StatusPage.tsx — task durumu (done/working/no_go) gerçek-zaman güncelle (use-live-data), faz göstergesi doğru.
**Kanıt:** `grep -c "done\|status\|phase\|useLiveData\|DONE" src/dashboard/src/pages/StatusPage.tsx` → ≥2; `npm run test:dashboard -- status-realtime` → 4+ pass
**Test:** ≥4 (done→done render, working, faz, canlı güncelleme)
**Smoke:** `npm run test:dashboard -- status-realtime` → done-render PASS

## Task 6: 220-006 — Refresh + cooldown (user-tetikli güncelleme)
- Model: sonnet
- Effort: normal
- Skills: react-specialist
- Files: src/dashboard/src/components/RefreshButton.tsx, tests/dashboard/refresh-cooldown.test.tsx
- Scope: src/dashboard/, tests/dashboard/

### Description
**Problem (#3):** Sürekli poll yerine user-tetikli refresh + cooldown istenir.
**Çözüm:** `RefreshButton.tsx` — manuel refetch + cooldown (örn. 10s, buton disabled+geri-sayım). use-live-data ile entegre.
**Kanıt:** `grep -c "refresh\|cooldown\|refetch\|disabled\|countdown" src/dashboard/src/components/RefreshButton.tsx` → ≥2; `npm run test:dashboard -- refresh-cooldown` → 4+ pass
**Test:** ≥4 (refresh tetik, cooldown disable, geri-sayım, sonra tekrar)

## Task 7: 220-007 — Evolution/ADR-timeline veri + ChatPage gerçek-wire
- Model: opus
- Effort: normal
- Skills: react-specialist, typescript-expert
- Files: src/dashboard/src/pages/ChatPage.tsx, tests/dashboard/chatpage-evolution-data.test.tsx
- Scope: src/dashboard/, tests/dashboard/

### Description
**Problem (#4,#5):** Evolution sekmesi/ADR-timeline boş; Chat hâlâ status-only.
**Çözüm:** ChatPage.tsx — `/api/chat` (220-001 backend, agentic) gerçek round-trip + akan cevap (219-008 stream-client). (Evolution veri 219-013 endpoint'ten useApi — EvolutionPage zaten 218'de; bu task ChatPage gerçek-wire odaklı.) Bearer token.
**Kanıt:** `grep -c "api/chat\|stream\|Authorization\|message\|response" src/dashboard/src/pages/ChatPage.tsx` → ≥2; `npm run test:dashboard -- chatpage-evolution-data` → 4+ pass
**Test:** ≥4 (chat mesaj→cevap, akan render, error, boş)
**Smoke:** `npm run test:dashboard -- chatpage-evolution-data` → chat round-trip render PASS

---

## DALGA C — Dashboard Polish (3 task)

## Task 8: 220-008 — Config brain-budget fix + coverage takip (history)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert, react-specialist
- Files: src/api/coverage-endpoint.ts, tests/api/coverage-endpoint.test.ts
- Scope: src/api/, tests/api/

### Description
**Problem (#6,#8):** Config'de brain-budget hatalı; coverage takip edilmiyor (history'de 0).
**Çözüm:** `coverage-endpoint.ts` — sprint coverage'ı memory.db/result'lardan oku, `/api/coverage` (history sayfası tüketir). server.ts wire. (Brain-budget config okuma düzeltmesi de bu task.)
**Kanıt:** `grep -c "coverage\|budget\|history" src/api/coverage-endpoint.ts` → ≥2; `grep -rl "coverage-endpoint" src/api/server.ts` → wire; `npx vitest run tests/api/coverage-endpoint.test.ts` → 4+ pass
**Test:** ≥4 (coverage GET, boş→0, sprint-coverage, wire) — mock (hermetik)
**Smoke:** serve canlıyken `curl -s -H "Authorization: Bearer $TOKEN" localhost:PORT/api/coverage` → JSON

## Task 9: 220-009 — Tech-debt sayfası filtre (sprint/severity/status)
- Model: sonnet
- Effort: normal
- Skills: react-specialist, frontend-design
- Files: src/dashboard/src/pages/DebtPage.tsx, tests/dashboard/debt-filter.test.tsx
- Scope: src/dashboard/, tests/dashboard/

### Description
**Problem (#7):** Tech-debt sayfası çok uzun — filtre yok.
**Çözüm:** DebtPage.tsx — sprint/severity(CRITICAL/HIGH/...)/status(open/resolved) filtre dropdown + arama. (Sayfa yoksa oluştur, /api/debt'ten.)
**Kanıt:** `grep -c "filter\|severity\|sprint\|debt\|search" src/dashboard/src/pages/DebtPage.tsx` → ≥2; `npm run test:dashboard -- debt-filter` → 4+ pass
**Test:** ≥4 (severity filtre, sprint filtre, status, arama)

## Task 10: 220-010 — Enterprise sayfa auth-wire + alerts dedup (provider-neutral tek-uyarı)
- Model: sonnet
- Effort: normal
- Skills: react-specialist, typescript-expert
- Files: src/dashboard/src/pages/EnterprisePage.tsx, tests/dashboard/enterprise-auth-alerts.test.tsx
- Scope: src/dashboard/, tests/dashboard/

### Description
**Problem (#9,#10):** Enterprise sayfa API-token istiyor (boş); alerts "CLAUDE.md güncellenmedi" SPAM (provider-bias, sürekli).
**Çözüm:** EnterprisePage.tsx — Bearer token ile F4 endpoint'leri (auth-wire, boş-değil). Alerts: doc-sync uyarısı **dedup** (sürekli değil, en sonda tek) + **provider-neutral** (CLAUDE/GEMINI/AGENTS hepsi, sadece CLAUDE değil).
**Kanıt:** `grep -c "Authorization\|tenant\|dedup\|alert\|CLAUDE\|provider" src/dashboard/src/pages/EnterprisePage.tsx` → ≥2; `npm run test:dashboard -- enterprise-auth-alerts` → 4+ pass
**Test:** ≥4 (enterprise auth-data, tenant render, alert-dedup tek, provider-neutral)
**Smoke:** `npm run test:dashboard -- enterprise-auth-alerts` → auth-data + dedup PASS

---

## DALGA D — Nervous Activation (3 task)

## Task 11: 220-011 — Nervous bootstrap + config enable (dormant→aktif)
- Model: opus
- Effort: normal
- Skills: typescript-expert, system-architect
- Files: src/nervous/bootstrap.ts, tests/nervous/bootstrap-activation.test.ts
- Scope: src/nervous/, tests/nervous/

### Description
**Problem ([[project_dashboard_realrun_findings]] #11):** Nervous observer wire VAR (2 caller) ama config `enabled:false` → dormant. `createNervousSystemIfEnabled` yok.
**Çözüm:** `bootstrap.ts` — `createNervousSystemIfEnabled(config, root, stateProvider)`: config enabled ise observer+decision+proposer+dispatcher+executor+history zincirini kur + pipeline wire, değilse null. sprint-controller caller (config-gated, default-off respect). DİKKAT: ADR-040 opt-in.
**Kanıt:** `grep -c "createNervousSystemIfEnabled\|NervousObserver\|enabled\|dispose" src/nervous/bootstrap.ts` → ≥2; `grep -rl "createNervousSystemIfEnabled" src/orchestra/sprint-controller.ts` → wire; `npx vitest run tests/nervous/bootstrap-activation.test.ts` → 4+ pass
**Test:** ≥4 (enabled→observer kurulur, disabled→null, dispose temizler, pipeline wire) — mock (hermetik, gerçek observer start ETME)

## Task 12: 220-012 — Nervous action-handlers (MVP 8 low-risk) + smoke
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/nervous/action-handlers.ts, tests/nervous/action-handlers.test.ts
- Scope: src/nervous/, tests/nervous/

### Description
**Problem:** Executor handle callback'i — action ID'leri için gerçek operasyon yok (stub).
**Çözüm:** `action-handlers.ts` — 8 low-risk action handler (ORPHAN_TASK_ARCHIVE, STALE_LOCK_RELEASE, DEAD_EVENT_STREAM_CLEANUP, DEBT_TRENDING_REPORT, vb.) gerçek operasyon; diğerleri `{outcome:'unimplemented'}`. Executor'a bağla.
**Kanıt:** `grep -c "ORPHAN_TASK_ARCHIVE\|STALE_LOCK\|handler\|outcome" src/nervous/action-handlers.ts` → ≥3; `npx vitest run tests/nervous/action-handlers.test.ts` → 4+ pass
**Test:** ≥4 (8 handler, unimplemented stub, executor wire, idempotent) — mock

## Task 13: 220-013 — Nervous config enable (deckent-dev) + dashboard canlı data
- Model: sonnet
- Effort: low
- Skills: typescript-expert
- Files: .deckent/config.json, tests/config/nervous-enabled.test.ts
- Scope: .deckent/, tests/config/

### Description
**Problem:** config `nervous_system.enabled:false` + dashboard NervousPage boş (pipeline koşmuyor).
**Çözüm:** `.deckent/config.json` `nervous_system.enabled: true` + mode `balanced` (autonomous low, suggest med, approve high). (Smoke aktivasyon — Faz 1.) Dashboard NervousPage 220-011/012 pipeline'dan canlı data alır.
**Kanıt:** `grep -A1 nervous_system .deckent/config.json | grep "enabled.*true"`; `npx vitest run tests/config/nervous-enabled.test.ts` → 3+ pass
**Test:** ≥3 (config enabled, mode balanced, safety-floor korunur) — hermetik (config fixture, live okuma yok)

---

## DALGA E — Carry + ADR (3 task)

## Task 14: 220-014 — 219-010 dashboard cache-bust e2e (carry NO_GO)
- Model: opus
- Effort: normal
- Skills: ci-testing, react-specialist
- Files: scripts/dashboard-e2e-smoke.mjs, tests/scripts/dashboard-e2e-smoke.test.ts
- Scope: scripts/, tests/scripts/

### Description
**Problem:** 219-010 NO_GO — dashboard cache-bust + e2e smoke (8 sayfa gerçekten yüklenir). Tarayıcı eski bundle cache'liyor.
**Çözüm:** `dashboard-e2e-smoke.mjs` — serve boot + index.html `Cache-Control: no-cache` + bundle-hash güncel + nav-link sayısı kontrol. server.ts static cache-bust header (varsa). Async spawn, try/finally kill.
**Kanıt:** `grep -c "cache\|no-cache\|bundle\|nav\|entry.js" scripts/dashboard-e2e-smoke.mjs` → ≥3; `npx vitest run tests/scripts/dashboard-e2e-smoke.test.ts` → 4+ pass
**Test:** ≥4 (cache header, bundle güncel, nav sayısı, dist-yok skip)
**Smoke:** `node scripts/dashboard-e2e-smoke.mjs` → cache-bust + nav PASS

## Task 15: 220-015 — ADR-082 (Native-LLM-Wire + Nervous-Activation + Dashboard-v2) + MASTER-PLAN
- Model: sonnet
- Effort: low
- Skills: documentation-writer, system-architect
- Files: docs/adr/082-native-llm-nervous-dashboard-v2.md, docs/MASTER-PLAN.md, tests/docs/adr-082.test.ts
- Scope: docs/, tests/docs/
- Dependencies: 220-001, 220-011

### Description
**Çözüm:** ADR-082 (native REPL gerçek-LLM wire + nervous activation Faz-1 + dashboard-v2 canlı, MADR, accepted). MASTER-PLAN §3/§4 F2-007/008 native, nervous-active, F7-v2, §10 Sprint 220 güncelle.
**Kanıt:** `grep -c "native\|nervous\|dashboard\|wire" docs/adr/082-*.md` → ≥3; `grep -c "220" docs/MASTER-PLAN.md` → ≥1; `npx vitest run tests/docs/adr-082.test.ts` → 3+ pass
**Test:** ≥3 (ADR-082 MADR, MASTER-PLAN güncel, accepted)

## Task 16: 220-016 — README + blueprint güncel-tut (native gerçek-cevap + nervous-active)
- Model: sonnet
- Effort: low
- Skills: documentation-writer
- Files: docs/vision/blueprint.md, tests/docs/blueprint-220-sync.test.ts
- Scope: docs/, tests/docs/
- Dependencies: 220-001

### Description
**Çözüm:** blueprint.md güncel — native REPL artık gerçek-konuşuyor (skeleton değil), nervous aktif (Faz-1), dashboard-v2 canlı. Stale "provider not wired" ifadeleri düzelt. README native-chat bölümü güncel.
**Kanıt:** `grep -c "native\|gerçek\|nervous\|aktif\|dashboard" docs/vision/blueprint.md` → ≥3; `npx vitest run tests/docs/blueprint-220-sync.test.ts` → 3+ pass
**Test:** ≥3 (native güncel, nervous-active, stale-yok)

---

## Sprint Sonu Notu

**Beklenen:** 14-16/16 DONE, 0 false-FIX. **`deckent` GERÇEKTEN konuşur** (REPL→gerçek cevap, skeleton değil), dashboard tam-canlı (worker grid real-time, status doğru, refresh+cooldown, chat-wire, tech-debt filtre, coverage, enterprise-auth, alerts-dedup), nervous AKTİF (config+bootstrap+handlers Faz-1). CI yeşil KORUNUR (19005/0), tam-suite 0 fail.

**🟢 RUN-VERIFY (cc sprint sonu):** gerçek `dist/cli/entry.js` — `deckent` argümansız → **gerçek cevap** (provider-not-wired DEĞİL), `chat --native --once` gerçek, dashboard worker-grid canlı + nervous data + tech-debt filtre. Mock-only DONE kabul YOK.

**🔑 ROUTING/SMOKE BEKLENTİSİ:** 219-015/016 dist'te → bu plan'da surface task'lar **doğru agent**'a (api-builder/frontend-designer, refactorer-collapse bitmeli) + **Smoke parse** olmalı. Plan analizinde DOĞRULA (refactorer 8→azalmalı, Smoke>0).

**Pre-flight:** **build:all + restart + RE-PLAN ŞART.** git-guard aktif. config max_workers=10. Sprint **CLI'dan** (`env -u`, dashboard'dan değil — donma fix var ama yine CLI güvenli). Her wave sonrası `git log -1`.

İlgili memory:
- [[project_dashboard_realrun_findings]] — 11-madde dashboard-v2 + native-wire hollow + nervous
- [[feedback_proof_of_function_dod]] — Smoke gate (gerçek-koşu)
- [[feedback_wiring_pct_vs_user_working]] — REPL açılıyor≠konuşuyor
- [[feedback_agent_routing_imbalance]] — 219-015 routing-fix etkisi (refactorer-collapse bitmeli)
- [[project_deckent_everyone_everywhere]] — otonom + nervous + 6-senaryo
- [[feedback_build_mcp_restart_coordination]] — build Alperen + RE-PLAN
- [[feedback_no_minimum_no_mvp_deckent]] — god-level
