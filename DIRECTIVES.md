# DIRECTIVES — Sprint 218: Dashboard GERÇEKTEN God-Level — İşlevsel + Güzel + Native (hollow F7 → run-proven)

## Goal: DASHBOARD SPRINTİ (13 task, 5 dalga, 10 worker). **DALGA ÖN: 🔴 git self-mutation guard P0 (ABSOLUTE FIRST — tek başına ilk wave, DONE+commit olmadan diğer wave'ler spawn edilmez; Sprint 216 bu bug'la kayboldu).** Gerçek-kullanım denetimi ([[project_dashboard_realrun_findings]], 2026-06-01 tarayıcı testi) kanıtladı: serve API/token çalışıyor AMA dashboard hollow — sprint başlatınca DONUYOR, chat sadece status'a yanıt veriyor, Evolution/Nervous/Enterprise sayfaları (Sprint 215 "DONE") route+sidebar'a HİÇ bağlanmamış (dosya var, caller yok — wire-gap), tasarım skeleton-seviyesi. Bu sprint hepsini GERÇEKTEN çözer: DALGA 0: P0 donma fix (sprint-start serve'den detach). DALGA A: işlevsellik (4 sayfa route+sidebar wire, chat gerçek round-trip, DIRECTIVES editörü). DALGA B: tasarım god-level + native hız (modern UI/UX, sıfır freeze, tema tutarlılık). DALGA C: e2e kanıt + ADR. Her Tier-1 task ZORUNLU `Smoke:` satırı (216-002 Proof-of-Function gate artık dist'te canlı — sprint-içi otomatik koşar).

Bağlam:
- **serve API/token RUN-PROVEN** (Sprint 216-006): `/api/status` 200, token auto-mint+inject çalışıyor. Dashboard'ın temeli sağlam.
- **Donma kökü:** `src/api/server.ts:630` → `runSprint(...)` serve process'inde çalışıyor → event loop bloke → HTTP donuyor.
- **Wire-gap kanıtı:** EvolutionPage/NervousPage/EnterprisePage/MemoryExplorerPage `src/dashboard/src/pages/` altında VAR ama `App.tsx` (7 route) + `Sidebar.tsx` (6 link) bağlamamış.
- **Proof-of-Function gate CANLI** (Sprint 216): Tier-1 task'lar sprint-içi gerçek-binary smoke ile doğrulanır.

---

## Tüm task'lar için ortak kurallar
- **🟢 PROOF-OF-FUNCTION ([[feedback_proof_of_function_dod]]):** User-surface (Tier-1) task `scope.filesWrite` `src/dashboard/`/`src/api/`/`src/cli/commands/` içerir → **ZORUNLU `Smoke:` satırı** (gerçek-binary/render komut + beklenen gerçek çıktı). Mock-only test = GO_WITH_TECH_DEBT, DONE DEĞİL.
- **🔴 HERMETIK TEST ([[project_ci_green_root_causes]]):** gitignored state OKUMA, tmpdir + sandbox HOME, async spawn. Push öncesi `npm run test:ci-sim`. CI yeşil KORUNUR.
- **🔑 WIRE-GAP ([[feedback_directive_kanit_letter_vs_goal]]):** "bağla/wire" task'ında scope ÇAĞIRAN dosyayı (App.tsx/Sidebar.tsx) içerir; kanıt-grep def-dosyasını (Page.tsx) dışlar → external caller ≥1. **USER-WORKING ([[feedback_wiring_pct_vs_user_working]]):** "wired" yetmez, kullanıcı erişebilmeli.
- **🎨 GOD-LEVEL ([[feedback_no_minimum_no_mvp_deckent]]):** "Bu god-level mi?" — skeleton/placeholder kabul edilemez, native hız, sıfır freeze.
- **KÜÇÜK TASK:** tek-dosya odaklı, ≤200 LoC, effort≤normal. high YASAK. Her kod task'ı YENİ TEST DOSYASI (min 4, hermetik). ESM `.js` suffix. Kök package.json'a yeni runtime dep YASAK (ADR-010). Dashboard testleri `tests/dashboard/`, mock'lu.

---

## DALGA ÖN — 🔴 P0 Git Self-Mutation Guard (ABSOLUTE FIRST — tek başına ilk wave)

> **MUTLAK ÖNCELİK:** Bu task DONE + **commit** olmadan HİÇBİR diğer wave spawn EDİLMEZ. Yoksa 218 worker'ları (uncommitted kod yazarken) birbirinin/kendi işini siler — Sprint 216 tam böyle kayboldu.

## Task 0: 218-013 — [✅ KONTROL — kod izole `deckent run` ile yapıldı + commit 64c97c2f; YENİDEN YAZMA YASAK] Git self-mutation guard
- Model: sonnet
- Effort: low
- Skills: typescript-expert
- Files: tests/orchestra/git-self-mutation-guard.test.ts
- Scope: tests/orchestra/

### Description
**✅ KOD YAPILDI + COMMIT (64c97c2f) — bu task SADECE KONTROL, yeniden yazma YASAK ([[project_deckent_self_git_mutation_bug]]):** `rollback.ts` `createSafetyPoint` + `rollback` artık `detectDeckentRepo` (ADR-039) ile self-project'te stash/`git reset --hard` NO-OP yapıyor + breadcrumb log. Sprint 216'yı silen kök bug kapatıldı; user-project rollback değişmedi.
**KONTROL (doğrula, değiştirme):** `rollback.ts`'de guard mevcut + git-self-mutation-guard testi geçiyor + rollback regresyonu bozulmamış mı doğrula. Eksik/bozuksa NO_GO, sağlamsa DONE. Kaynak `rollback.ts`'ye DOKUNMA (zaten doğru + commit'li).
**Kanıt:** `grep -c "detectDeckentRepo\|self-project\|skipped" src/orchestra/rollback.ts` → ≥2; `npx vitest run tests/orchestra/git-self-mutation-guard.test.ts` → 6 pass; `npx vitest run tests/orchestra/rollback.test.ts` → 54 pass (regresyon yok)
**Test:** mevcut 6 git-guard + 54 rollback testi geçer (yeni yazma yok — kontrol)

---

## DALGA 0 — P0 Donma Fix (1 task)

## Task 1: 218-001 — [✅ KONTROL — kod izole `deckent run` ile yapıldı + commit 9e2e7d34; YENİDEN YAZMA YASAK] sprint-start detach
- Model: sonnet
- Effort: low
- Skills: typescript-expert
- Files: tests/api/sprint-job-runner.test.ts
- Scope: tests/api/

### Description
**✅ KOD YAPILDI + COMMIT (9e2e7d34) — bu task SADECE KONTROL, yeniden yazma YASAK ([[project_dashboard_realrun_findings]]):** `src/api/sprint-job-runner.ts` `startSprintDetached()` sprint'i detached child process olarak spawn ediyor (`detached:true, stdio:'ignore', unref`); `server.ts` `/api/start` ona wire'lı → serve event loop bloke OLMUYOR → dashboard donmuyor.
**KONTROL (doğrula, değiştirme):** `sprint-job-runner.ts`'de `startSprintDetached` mevcut + server.ts wire'lı + testler geçiyor mu doğrula. Kaynağa DOKUNMA (zaten doğru + commit'li). Eksikse NO_GO, sağlamsa DONE.
**Kanıt:** `grep -c "startSprintDetached\|detached\|unref" src/api/sprint-job-runner.ts` → ≥2; `grep -rl "startSprintDetached" src/api/server.ts` → wire; `npx vitest run tests/api/sprint-job-runner.test.ts tests/api/server.test.ts` → pass
**Test:** mevcut testler geçer (yeni yazma yok — kontrol)
**Smoke:** `env -u ANTHROPIC_API_KEY node dist/cli/entry.js serve --port 3218 --no-terminal &` → sprint-start sonrası `/api/status` = **200** (serve DONMAZ)

---

## DALGA A — İşlevsellik: hollow → gerçek (4 task)

## Task 2: 218-002 — Eksik sayfaları route+sidebar'a bağla (Evolution/Nervous/Enterprise/MemoryExplorer)
- Model: opus
- Effort: normal
- Skills: react-specialist, typescript-expert
- Files: src/dashboard/src/App.tsx, src/dashboard/src/components/Sidebar.tsx, tests/dashboard/route-sidebar-wire.test.tsx
- Scope: src/dashboard/, tests/dashboard/

### Description
**Problem (WIRE-GAP KANITI):** EvolutionPage/NervousPage/EnterprisePage/MemoryExplorerPage `pages/` altında VAR ama `App.tsx` (7 route) + `Sidebar.tsx` (6 link) bağlamamış → kullanıcı ERİŞEMİYOR (Sprint 215 "DONE" hollow).
**Çözüm:** App.tsx'e 4 route ekle (`/evolution`,`/nervous`,`/enterprise`,`/memory-explorer`), Sidebar.tsx'e 4 link (uygun lucide icon + nav label). Caller App.tsx+Sidebar.tsx (def *Page.tsx hariç). 8 sayfa erişilebilir olsun.
**Kanıt:** `grep -c "Evolution\|Nervous\|Enterprise\|MemoryExplorer" src/dashboard/src/App.tsx` → ≥4; `grep -c "evolution\|nervous\|enterprise\|memory-explorer" src/dashboard/src/components/Sidebar.tsx` → ≥4; `npm run test:dashboard -- route-sidebar-wire` → 4+ pass
**Test:** ≥4 (4 route mevcut, 4 sidebar link, navigasyon render, mevcut route'lar korunur)
**Smoke:** `npm run test:dashboard -- route-sidebar-wire` → 4 sayfa render assert PASS (gerçek React render, jsdom)

## Task 3: 218-003 — Chat gerçek round-trip (ChatPage → backend, status-only DEĞİL)
- Model: opus
- Effort: normal
- Skills: react-specialist, anthropic-sdk
- Files: src/dashboard/src/pages/ChatPage.tsx, tests/dashboard/ChatPage-roundtrip.test.tsx
- Scope: src/dashboard/, tests/dashboard/

### Description
**Problem ([[feedback_wiring_pct_vs_user_working]]):** Chat sadece `status` intent'ine yanıt veriyor, gerçek sohbet round-trip YOK. 216-008 `handleChatMessage` backend'i var ama ChatPage bağlı değil.
**Çözüm:** ChatPage.tsx — kullanıcı mesajını `/api/chat` (chat-backend) endpoint'ine Bearer token ile POST et, gerçek asistan cevabını render et (status-only intent dallanmasını kaldır/genişlet). Loading/error state. useApi.
**Kanıt:** `grep -c "api/chat\|handleChat\|Authorization\|message\|response" src/dashboard/src/pages/ChatPage.tsx` → ≥2; `npm run test:dashboard -- ChatPage-roundtrip` → 4+ pass
**Test:** ≥4 (mesaj gönder→cevap render, loading, error, çok-turn)
**Smoke:** `npm run test:dashboard -- ChatPage-roundtrip` → mock backend ile gerçek mesaj→cevap render PASS

## Task 4: 218-004 — Dashboard DIRECTIVES editörü (gerçek içerikli sprint başlat, boş "new sprint" değil)
- Model: sonnet
- Effort: normal
- Skills: react-specialist, typescript-expert
- Files: src/dashboard/src/components/DirectivesEditor.tsx, tests/dashboard/DirectivesEditor.test.tsx
- Scope: src/dashboard/, tests/dashboard/

### Description
**Problem ([[project_dashboard_realrun_findings]]):** Dashboard'dan sprint-start DIRECTIVES içeriği almıyor → boş "new sprint" (0 task) gönderiyor → anlamsız sprint.
**Çözüm:** `DirectivesEditor.tsx` — DIRECTIVES.md içeriğini düzenleyebilen textarea/editor component (yükle + kaydet `/api/directives` POST Bearer token), boş içerikte "start" disable + uyarı. DashboardPage'e gömülebilir.
**Kanıt:** `grep -c "directives\|textarea\|editor\|save\|api/directives" src/dashboard/src/components/DirectivesEditor.tsx` → ≥2; `npm run test:dashboard -- DirectivesEditor` → 4+ pass
**Test:** ≥4 (içerik render, düzenle, kaydet, boş→start disable)
**Smoke:** `npm run test:dashboard -- DirectivesEditor` → editor render + boş-içerik guard PASS

## Task 5: 218-005 — Dashboard sayfaları gerçek veri bağlı (Nervous loading+error+empty)
- Model: sonnet
- Effort: normal
- Skills: react-specialist, frontend-design
- Files: src/dashboard/src/pages/NervousPage.tsx, tests/dashboard/NervousPage-data.test.tsx
- Scope: src/dashboard/, tests/dashboard/
- Dependencies: 218-002

### Description
**Problem:** 218-002 sayfaları erişilebilir yaptı ama NervousPage gerçek veri fetch + loading/error/empty state tam mı? (pending-approval, accept/reject gerçek endpoint).
**Çözüm:** NervousPage.tsx — `/api/nervous/*` Bearer fetch, pending-approval listesi gerçek veri, accept/reject POST çalışır, loading/error/empty state. useApi.
**Kanıt:** `grep -c "nervous\|approval\|accept\|reject\|loading\|error\|useApi" src/dashboard/src/pages/NervousPage.tsx` → ≥2; `npm run test:dashboard -- NervousPage-data` → 4+ pass
**Test:** ≥4 (veri render, accept, reject, boş/error state)
**Smoke:** `npm run test:dashboard -- NervousPage-data` → gerçek fetch yolu render PASS

---

## DALGA B — Tasarım God-Level + Native Hız (4 task)

## Task 6: 218-006 — God-level layout shell (modern bilgi mimarisi, responsive, sıfır skeleton-freeze)
- Model: opus
- Effort: normal
- Skills: react-specialist, frontend-design
- Files: src/dashboard/src/components/Layout.tsx, tests/dashboard/Layout-godlevel.test.tsx
- Scope: src/dashboard/, tests/dashboard/

### Description
**Problem ([[project_dashboard_realrun_findings]] 🎨):** Mevcut UI işlevsel-skeleton, god-level değil; skeleton-loading'de takılıyor.
**Çözüm:** Layout.tsx — god-level shell (header+sidebar+content grid, tutarlı spacing/tipografi, responsive breakpoint, içerik gelene kadar skeleton DEĞİL anlamlı loading-state, sezgisel hiyerarşi). AppShell (Sprint 215) üstüne. Native his.
**Kanıt:** `grep -c "grid\|responsive\|loading\|header\|sidebar\|theme" src/dashboard/src/components/Layout.tsx` → ≥3; `npm run test:dashboard -- Layout-godlevel` → 4+ pass
**Test:** ≥4 (render, responsive, loading-state anlamlı, navigasyon)
**Smoke:** `npm run test:dashboard -- Layout-godlevel` → shell render + loading-state PASS

## Task 7: 218-007 — Native hız: skeleton-freeze kaldır, akıllı polling/SSE, stale-while-revalidate
- Model: opus
- Effort: normal
- Skills: react-specialist, performance-optimizer
- Files: src/dashboard/src/lib/use-live-data.ts, tests/dashboard/use-live-data.test.ts
- Scope: src/dashboard/, tests/dashboard/

### Description
**Problem ([[project_dashboard_realrun_findings]] 📌):** Dashboard hızı native değil, kopma/freeze var.
**Çözüm:** `use-live-data.ts` — SSE/akıllı polling hook (stale-while-revalidate: eski veriyi göster + arkada yenile, skeleton'a düşme), bağlantı koparsa graceful retry + "yeniden bağlanıyor" durumu (donma değil), abort-on-unmount. Sayfalar bunu kullansın.
**Kanıt:** `grep -c "SSE\|EventSource\|poll\|stale\|revalidate\|retry\|abort" src/dashboard/src/lib/use-live-data.ts` → ≥3; `npm run test:dashboard -- use-live-data` → 4+ pass
**Test:** ≥4 (stale-while-revalidate, retry on disconnect, abort-on-unmount, hata graceful)
**Smoke:** `npm run test:dashboard -- use-live-data` → stale-while-revalidate + retry PASS

## Task 8: 218-008 — Tema tutarlılık + görsel polish (dark/light token, component tutarlılık)
- Model: sonnet
- Effort: normal
- Skills: frontend-design, react-specialist
- Files: src/dashboard/src/lib/theme.ts, tests/dashboard/theme-consistency.test.ts
- Scope: src/dashboard/, tests/dashboard/

### Description
**Problem:** dark/light tema tutarsız, component görselleri god-level değil.
**Çözüm:** `theme.ts` — merkezi tasarım token'ları (renk/spacing/radius/shadow), dark/light tutarlı, component'ler token kullansın. Tutarlı görsel dil.
**Kanıt:** `grep -c "dark\|light\|token\|color\|theme\|spacing" src/dashboard/src/lib/theme.ts` → ≥3; `npm run test:dashboard -- theme-consistency` → 4+ pass
**Test:** ≥4 (dark token, light token, toggle, tutarlılık)
**Smoke:** `npm run test:dashboard -- theme-consistency` → dark/light token tutarlılık PASS

## Task 9: 218-009 — Sprint kontrol paneli polish (canlı durum + worker grid + faz göstergesi)
- Model: sonnet
- Effort: normal
- Skills: react-specialist, frontend-design
- Files: src/dashboard/src/pages/DashboardPage.tsx, tests/dashboard/DashboardPage-control.test.tsx
- Scope: src/dashboard/, tests/dashboard/
- Dependencies: 218-001, 218-007

### Description
**Problem:** Ana dashboard sayfası sprint kontrolü (plan/start/status) + canlı worker görünümü god-level değil.
**Çözüm:** DashboardPage.tsx — sprint faz göstergesi (PLAN→...→CLEANUP), canlı worker grid (use-live-data 218-007), start butonu detached (218-001 donmaz), DIRECTIVES editörü (218-004) erişimi. Native his.
**Kanıt:** `grep -c "phase\|worker\|start\|status\|useLiveData\|directives" src/dashboard/src/pages/DashboardPage.tsx` → ≥2; `npm run test:dashboard -- DashboardPage-control` → 4+ pass
**Test:** ≥4 (faz göster, worker grid, start çağrı, canlı güncelleme)
**Smoke:** `npm run test:dashboard -- DashboardPage-control` → kontrol paneli render + start akışı PASS

---

## DALGA C — E2E Kanıt + ADR + Rehber (3 task)

## Task 10: 218-010 — test:e2e-surfaces dashboard genişlet (8 sayfa endpoint + sprint-start-donmaz)
- Model: opus
- Effort: normal
- Skills: ci-testing, typescript-expert
- Files: scripts/test-e2e-surfaces.mjs, tests/scripts/e2e-surfaces-dashboard.test.ts
- Scope: scripts/, tests/scripts/
- Dependencies: 218-001, 218-002

### Description
**Problem:** test:e2e-surfaces (Sprint 216) serve+token doğruluyor ama dashboard sayfa erişimi + sprint-start-donmaz doğrulamıyor.
**Çözüm:** test-e2e-surfaces.mjs'i genişlet — serve boot sonrası: index.html'de bundle var, `/api/evolution`+`/api/nervous`+`/api/memory/search` 200, sprint-start sonrası serve hâlâ 200 (donmaz). Async spawn, try/finally kill.
**Kanıt:** `grep -c "evolution\|nervous\|memory\|sprint.*start\|200" scripts/test-e2e-surfaces.mjs` → ≥3; `npx vitest run tests/scripts/e2e-surfaces-dashboard.test.ts` → 4+ pass
**Test:** ≥4 (sayfa endpoint'leri 200, sprint-start sonrası serve canlı, dist-yok skip, kill-on-fail)
**Smoke:** `node scripts/test-e2e-surfaces.mjs` → tüm dashboard endpoint 200 + sprint-start-donmaz PASS

## Task 11: 218-011 — ADR-080 (Dashboard God-Level + sprint-start detach) + MASTER-PLAN status
- Model: sonnet
- Effort: low
- Skills: documentation-writer, system-architect
- Files: docs/adr/080-dashboard-god-level.md, docs/MASTER-PLAN.md, tests/docs/adr-080.test.ts
- Scope: docs/, tests/docs/
- Dependencies: 218-001, 218-002

### Description
**Çözüm:** ADR-080 (dashboard sprint-start detach + hollow-page wire + chat round-trip + god-level UI/native, MADR, accepted). MASTER-PLAN §3/§4 F7-003/006/009/010 → run-proven DONE, §10 Sprint 218, F7 → ~95% güncelle.
**Kanıt:** `grep -c "detach\|dashboard\|god-level\|route\|chat" docs/adr/080-*.md` → ≥3; `grep -c "218" docs/MASTER-PLAN.md` → ≥1; `npx vitest run tests/docs/adr-080.test.ts` → 3+ pass
**Test:** ≥3 (ADR-080 MADR, MASTER-PLAN güncel, accepted)

## Task 12: 218-012 — Dashboard kullanıcı rehberi + onboarding (gerçek ekran akışı)
- Model: sonnet
- Effort: low
- Skills: documentation-writer, frontend-design
- Files: docs/guide/dashboard.md, tests/docs/dashboard-guide.test.ts
- Scope: docs/, tests/docs/

### Description
**Problem:** Dashboard kullanım rehberi yok (8 sayfa, sprint başlat, chat, terminal).
**Çözüm:** `docs/guide/dashboard.md` — serve başlat, 8 sayfa ne işe yarar, DIRECTIVES editörü ile sprint başlat, chat, terminal kullanımı. Gerçek akış adımları.
**Kanıt:** `grep -c "serve\|evolution\|nervous\|enterprise\|chat\|terminal\|directives" docs/guide/dashboard.md` → ≥5; `npx vitest run tests/docs/dashboard-guide.test.ts` → 3+ pass
**Test:** ≥3 (rehber mevcut, 8 sayfa, sprint-başlat akışı)

---

## Sprint Sonu Notu

**Beklenen:** 10-12/12 DONE, 0 false-FIX. **Dashboard GERÇEKTEN işlevsel + güzel + native:** sprint başlatınca DONMAZ (detach), chat gerçek cevap, 8 sayfa erişilebilir+veri-bağlı, DIRECTIVES editörü, god-level tasarım, sıfır skeleton-freeze. CI yeşil KORUNUR. tam-suite 0 fail.

**🟢 PROOF-OF-FUNCTION (gate canlı):** Tier-1 task'lar sprint-içi otomatik smoke gate'ten geçer. Ek olarak ben (cc) sprint sonu: gerçek `dist/cli/entry.js serve` boot → dashboard'dan sprint başlat (donmaz mı) + chat (cevap mı) + 8 sayfa (erişilir mi) run-verify edip çıktı göstereceğim. Tam tarayıcı render'ı sen doğrularsın.

**Pre-flight:** **build:all + restart + RE-PLAN ŞART** (dashboard vite bundle + 218-001 detach + gate). **🔴 ÖNCE 218-013 git-guard'ı tek başına çalıştır → DONE → build → COMMIT → SONRA diğer wave'ler** (yoksa worker'lar uncommitted işini siler). `.tasks/` 217 placeholder dosyaları temizlensin. config max_workers=10. **Sprint CLI'dan başlat — dashboard'dan DEĞİL** (dashboard-start bug fix'lenene kadar; [[project_deckent_self_git_mutation_bug]]). **Her wave öncesi/sonrası `git log -1` + `git status` doğrula** (otonom commit/reset kapmasın).

**Sprint sonrası:** TR MASTER-PLAN (dashboard gerçekten god-level olunca) + F2-007 streaming + npm publish hazırlık.

İlgili memory:
- [[project_dashboard_realrun_findings]] — 🔴 gerçek-kullanım bulguları (donma/chat/eksik-sayfa/tasarım)
- [[feedback_proof_of_function_dod]] — 🟢 Smoke gate
- [[feedback_directive_kanit_letter_vs_goal]] — wire-gap (route+sidebar caller)
- [[feedback_wiring_pct_vs_user_working]] — chat wired≠çalışıyor
- [[feedback_no_minimum_no_mvp_deckent]] — god-level tasarım
- [[project_dashboard_control_plane]] — F7 vizyon
- [[feedback_build_mcp_restart_coordination]] — build:all Alperen + RE-PLAN
