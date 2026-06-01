# DIRECTIVES — Sprint 215: CI-Hermeticity Kalıcı + 8-Provider Fleet + Dashboard God-Level + Evrim Görünürlüğü + Routing/Doc Hijyen

## Goal: ÇOK BÜYÜK ÖLÇEK (21 task, 6 dalga, 10 worker). DALGA 0: CI-hermeticity kalıcılaştır (test:ci-sim + lint guard + test-HOME isolation) — aylardır kırık CI Sprint 214'te yeşerdi, bir daha regresyon olmasın. DALGA A: 8-provider fleet TAMAMLA (F1-009 bootstrap-register dormant→usable + F1-010 subs→API overflow + F6-006 per-worker auth) — DeepSeek/Qwen/GLM + 3-subs + local eşzamanlı çalışır. DALGA B: Dashboard god-level (F7-003 UI/UX + F7-004 terminal + F7-006 enterprise view + F7-007 memory explorer). DALGA C: Evrim görünürlüğü (F7-010 /evolution sayfası + F5-008 aktif identity-mutation loop + evolution API). DALGA D: Routing fix (frontend-design→frontend-designer) + doc-drift sync. DALGA E: ADR-078 + status. Her task TEK dosya odaklı, ≤200 LoC, effort≤normal, YENİ TEST DOSYASI zorunlu.

Bağlam:
- **CI YEŞİL** (Sprint 214, commit b67c000) — tüm workflow + Coverage + Build geçiyor. Auth-precedence fix (214-001) dist'te → 215 `env -u` olmadan da başlatılabilir (yine de güvenli tarafta env-u önerilir).
- F1-009 adapter VAR ama bootstrap-register YOK (dormant). F5 evrim modülleri canlı ama identity-mutation loop "öneri" (gerçek mutasyon değil). Routing skill→agent kısmi (frontend-design→architecture-planner gidiyor, frontend-designer değil).

---

## Tüm task'lar için ortak kurallar
- **🔴 #1 YENİ KURAL — HERMETIK TEST ZORUNLU ([[project_ci_green_root_causes]]):** Yeni testler ASLA gitignored lokal state OKUMAZ (`.deckent/config.json`, `.brain/memory.db`, `~/.deckent`). tmpdir fixture + sandbox HOME kullan, `afterEach` temizle. Uzun subprocess'i **async spawn** (spawnSync blocking YASAK — worker donar). CI yeni yeşerdi, kırma.
- **Subscription mode** — API mode YASAK ([[project_api_mode_deferred_post_beta]]); 3rd-party API (DeepSeek/Qwen/GLM) Anthropic-Tier-1 yasağına dahil DEĞİL.
- **KÜÇÜK TASK:** tek-dosya odaklı/tek-sorumluluk, ≤200 LoC, effort≤normal. high YASAK.
- **Her kod task'ı YENİ TEST DOSYASI** (min 4 test, hermetik) ([[feedback_brain_rubric_bridge_broken]]).
- **🔑 WIRE-GAP DERSİ:** "bağla/wire" task'ında scope ÇAĞIRAN dosyayı içerir, kanıt-grep def-dosyasını dışlar → external caller ≥1 ([[feedback_directive_kanit_letter_vs_goal]]).
- **🔑 USER-WORKING KANITI:** yüzey task'larında uçtan-uca akış (provider seçilebilir, dashboard render+interact) — "wired" yetmez ([[feedback_wiring_pct_vs_user_working]]).
- CLI komutları index.ts'e WIRE et. VS Code/dashboard testleri mock'lu. Test doğru dizinde (dashboard→tests/dashboard/, core→tests/core/, vb.).
- ESM `.js` suffix. Kök package.json'a yeni runtime dep YASAK (ADR-010). Hedef: CI yeşil KORUNUR, tam-suite 0 fail.

---

## DALGA 0 — CI-Hermeticity Kalıcılaştır (3 task)

## Task 1: 215-001 — `deckent test:ci-sim` clean-state reproducer
- Model: opus
- Effort: normal
- Skills: ci-testing, typescript-expert
- Files: scripts/test-ci-sim.mjs, tests/scripts/test-ci-sim.test.ts
- Scope: scripts/, tests/scripts/

### Description
**Problem:** green-local ≠ green-CI (gitignored state). Push öncesi CI'yi taklit eden lokal komut yok.
**Çözüm:** `scripts/test-ci-sim.mjs` + `package.json` `test:ci-sim` — `.deckent/config.json` + `.brain/` geçici gizle (rename to tmp), `CI=1 vitest run` çalıştır, sonra GERİ yükle (try/finally — asla kaybetme). Non-hermetic test'i lokalde yakalar. ci-guardian agent + ci-testing skill rotası.
**Kanıt:** `grep -c "test:ci-sim" package.json` → ≥1; `grep -c "rename\|CI=1\|finally\|restore" scripts/test-ci-sim.mjs` → ≥2; `npx vitest run tests/scripts/test-ci-sim.test.ts` → 4+ pass
**Test:** ≥4 (state gizlenir, geri yüklenir hata olsa bile, CI=1 set, restore-on-fail)

## Task 2: 215-002 — CI-hermeticity lint guard (test gitignored state okumasın)
- Model: sonnet
- Effort: normal
- Skills: ci-testing, typescript-expert
- Files: scripts/lint-test-hermeticity.mjs, tests/scripts/lint-test-hermeticity.test.ts
- Scope: scripts/, tests/scripts/

### Description
**Problem:** Testlerin live `.deckent/config.json`/`.brain` okumasını engelleyen guard yok → regresyon riski.
**Çözüm:** `lint-test-hermeticity.mjs` — tests/ tarar, `readFileSync(...'.deckent/config.json')` / `.brain/memory.db` doğrudan-okuma (fixture/mock'suz, skip-guard'sız) varsa FAIL + dosya:satır rapor. Allowlist (skip-if-absent'li dosyalar). ci.yml'e eklenebilir lint.
**Kanıt:** `grep -c "deckent/config\|\.brain\|hermetic\|allowlist" scripts/lint-test-hermeticity.mjs` → ≥2; `npx vitest run tests/scripts/lint-test-hermeticity.test.ts` → 4+ pass
**Test:** ≥4 (ihlal tespit, allowlist geçer, temiz test pass, dosya:satır rapor)

## Task 3: 215-003 — test-HOME isolation helper + sızan testlere uygula
- Model: sonnet
- Effort: normal
- Skills: typescript-expert, testing-expert
- Files: tests/helpers/sandbox-home.ts, tests/helpers/sandbox-home.test.ts
- Scope: tests/

### Description
**Problem:** ([[project_test_home_leak]]) Bazı testler HOME=proje sızdırıp kök'e dotfile (.keyring secret/.codex/.gemini) yazıyor.
**Çözüm:** `tests/helpers/sandbox-home.ts` — `withSandboxHome(fn)` / beforeEach helper: HOME'u `os.tmpdir()` altı uniq dizine set, afterEach temizle. Credential/gemini-config/PTY testlerinin kullanması için export. (Bu sprint helper + self-test; geniş uygulama kademeli.)
**Kanıt:** `grep -c "tmpdir\|HOME\|afterEach\|cleanup\|withSandboxHome" tests/helpers/sandbox-home.ts` → ≥3; `npx vitest run tests/helpers/sandbox-home.test.ts` → 4+ pass
**Test:** ≥4 (HOME sandbox set, cleanup, nested güvenli, proje köküne yazmaz)

---

## DALGA A — 8-Provider Fleet Tamamla (4 task)

## Task 4: 215-004 — F1-009 bootstrap-register: OpenAI-compat provider'ları kaydet (dormant→usable) [P0]
- Model: opus
- Effort: normal
- Skills: typescript-expert, system-architect
- Files: src/core/provider.ts, tests/core/provider-bootstrap-register.test.ts
- Scope: src/core/, tests/core/

### Description
**Problem (Sprint 214 disk-verify):** `OpenAICompatibleAdapter` VAR ama provider.ts bootstrap'ta `registerProvider` çağrılmıyor → DeepSeek/Qwen/GLM seçilemez (dormant, 0 external caller).
**Çözüm:** provider.ts bootstrap'a — DEEPSEEK_API_KEY/DASHSCOPE_API_KEY/ZHIPU_API_KEY (env veya .deck) varsa ilgili `OpenAICompatibleAdapter`'ı `registerProvider` et. Key yoksa skip (graceful). Caller provider.ts'te (def-dosyası openai-compatible.ts hariç).
**Kanıt:** `grep -rl "OpenAICompatibleAdapter\|registerProvider.*compat" src/ | grep -v test | grep -v "openai-compatible.ts"` → provider.ts (external caller); `grep -c "DEEPSEEK\|DASHSCOPE\|ZHIPU\|registerProvider" src/core/provider.ts` → ≥2; `npx vitest run tests/core/provider-bootstrap-register.test.ts` → 4+ pass
**Test:** ≥4 (key varsa register, yoksa skip, çoklu provider, registry'den getProvider çalışır)

## Task 5: 215-005 — F1-010 subs→API overflow orchestration
- Model: opus
- Effort: normal
- Skills: typescript-expert, system-architect
- Files: src/core/provider-overflow.ts, tests/core/provider-overflow.test.ts
- Scope: src/core/, tests/core/
- Dependencies: 215-004

### Description
**Problem:** subscription limiti dolunca worker API provider'a otomatik taşınmıyor (subs+API birlikte throughput yok).
**Çözüm:** `provider-overflow.ts` — `resolveWithOverflow(task, registry)`: subscription provider rate/quota-exceeded sinyalinde eşdeğer API provider'a fallback (token-quota.ts ile entegre). İskelet+karar mantığı (gerçek throttle değil — seçim).
**Kanıt:** `grep -c "overflow\|resolveWithOverflow\|quota\|fallback" src/core/provider-overflow.ts` → ≥2; `npx vitest run tests/core/provider-overflow.test.ts` → 4+ pass
**Test:** ≥4 (limit-altı subs, limit-üstü→API, eşdeğer-tier seçim, API yoksa graceful)

## Task 6: 215-006 — F6-006 per-worker auth/provider task JSON (Sprint/Task/Process)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert, security-specialist
- Files: src/orchestra/task-router.ts, tests/orchestra/per-worker-provider-resolve.test.ts
- Scope: src/orchestra/, tests/orchestra/
- Dependencies: 215-004

### Description
**Problem:** task JSON `authMode` var ama per-worker `provider`+`authMode` çözümü 3 modda (Sprint/Task/Process) tutarlı wire değil.
**Çözüm:** task-router.ts — her worker için `provider`+`authMode` first-class resolve (DIRECTIVES override > config > default), 3 mod uniform. 215-005 overflow ile eşleşir.
**Kanıt:** `grep -c "authMode\|provider.*resolve\|perWorker\|Process\|Task\|Sprint" src/orchestra/task-router.ts` → ≥2; `npx vitest run tests/orchestra/per-worker-provider-resolve.test.ts` → 4+ pass
**Test:** ≥4 (override öncelik, config fallback, 3-mod uniform, geçersiz graceful)

## Task 7: 215-007 — Multi-provider eşzamanlı e2e smoke (3-subs + API + local mix)
- Model: sonnet
- Effort: normal
- Skills: ci-testing, typescript-expert
- Files: scripts/multi-provider-fleet-smoke.mjs, tests/scripts/multi-provider-fleet-smoke.test.ts
- Scope: scripts/, tests/scripts/
- Dependencies: 215-004, 215-006

### Description
**Problem:** 8-provider eşzamanlı koordinasyon uçtan-uca doğrulanmıyor.
**Çözüm:** `multi-provider-fleet-smoke.mjs` — registry'ye claude+gemini+codex(mock subs)+openai-compat(mock DeepSeek/Qwen)+ollama(mock) register, karışık task seti route et, her task doğru adapter'a gittiğini + eşzamanlı koexist doğrula. Gerçek API çağrısı DEĞİL (mock).
**Kanıt:** `node scripts/multi-provider-fleet-smoke.mjs` → PASS; `npx vitest run tests/scripts/multi-provider-fleet-smoke.test.ts` → 4+ pass
**Test:** ≥4 (8-provider register, per-task seçim, mix coexist, overflow tetik)

---

## DALGA B — Dashboard God-Level (4 task)

## Task 8: 215-008 — F7-003 UI/UX redesign (bilgi mimarisi + responsive + dark/light tutarlılık)
- Model: sonnet
- Effort: normal
- Skills: react-specialist, frontend-design
- Files: src/dashboard/src/components/AppShell.tsx, tests/dashboard/AppShell.test.tsx
- Scope: src/dashboard/, tests/dashboard/

### Description
**Problem:** ([[project_dashboard_control_plane]] F7-003 ~%45) Bilgi mimarisi + görsel tutarlılık god-level değil.
**Çözüm:** `AppShell.tsx` — üst-seviye layout shell (header+sidebar+content grid, responsive breakpoint, dark/light token tutarlılık, sezgisel navigasyon hiyerarşisi). Mevcut Layout/Sidebar üstüne. Test tests/dashboard/.
**Kanıt:** `grep -c "responsive\|dark\|theme\|grid\|breakpoint\|shell" src/dashboard/src/components/AppShell.tsx` → ≥3; `npm run test:dashboard -- AppShell` → 4+ pass
**Test:** ≥4 (render, theme toggle, responsive, navigasyon)

## Task 9: 215-009 — F7-004 terminal güçlendirme (çok-oturum + geçmiş + kopyala/yapıştır)
- Model: sonnet
- Effort: normal
- Skills: react-specialist, typescript-expert
- Files: src/dashboard/src/lib/terminal-sessions.ts, tests/dashboard/terminal-sessions.test.ts
- Scope: src/dashboard/, tests/dashboard/

### Description
**Problem:** ([[project_embedded_web_terminal]] F7-004 ~%60) Embedded terminal çok-oturum + geçmiş + kopyala/yapıştır eksik.
**Çözüm:** `terminal-sessions.ts` — çok-oturum yönetimi (session list/switch), komut geçmişi (up/down ring buffer), kopyala/yapıştır helper. ADR-062 ws-gateway uyumlu.
**Kanıt:** `grep -c "session\|history\|buffer\|clipboard\|multiSession" src/dashboard/src/lib/terminal-sessions.ts` → ≥2; `npm run test:dashboard -- terminal-sessions` → 4+ pass
**Test:** ≥4 (session aç/switch, geçmiş nav, buffer, clipboard)

## Task 10: 215-010 — F7-006 enterprise view (multi-tenant + RBAC UI)
- Model: sonnet
- Effort: normal
- Skills: react-specialist, frontend-design
- Files: src/dashboard/src/pages/EnterprisePage.tsx, tests/dashboard/EnterprisePage.test.tsx
- Scope: src/dashboard/, tests/dashboard/

### Description
**Problem:** F4 enterprise backend (RBAC/audit/rate/tenant) %100 ama UI yok.
**Çözüm:** `EnterprisePage.tsx` — tenant listesi, RBAC rol matrisi görünüm (admin>operator>viewer), audit log tablosu, rate-limit durumu. useApi (F4 endpoint'leri). Read-first.
**Kanıt:** `grep -c "tenant\|rbac\|role\|audit\|rate" src/dashboard/src/pages/EnterprisePage.tsx` → ≥2; `npm run test:dashboard -- EnterprisePage` → 4+ pass
**Test:** ≥4 (tenant liste, rol matris, audit tablo, boş state)

## Task 11: 215-011 — F7-007 memory/ADR/debt explorer (FTS5 arama + ADR timeline)
- Model: sonnet
- Effort: normal
- Skills: react-specialist, frontend-design
- Files: src/dashboard/src/pages/MemoryExplorerPage.tsx, tests/dashboard/MemoryExplorerPage.test.tsx
- Scope: src/dashboard/, tests/dashboard/

### Description
**Problem:** F7-007 ~%20 — memory/ADR/debt explorer + FTS5 arama eksik.
**Çözüm:** `MemoryExplorerPage.tsx` — memory.db FTS5 arama (endpoint), ADR timeline görünümü, debt tablosu, filtre. SimpleMarkdown render. useApi.
**Kanıt:** `grep -c "search\|fts\|adr\|debt\|timeline\|memory" src/dashboard/src/pages/MemoryExplorerPage.tsx` → ≥2; `npm run test:dashboard -- MemoryExplorerPage` → 4+ pass
**Test:** ≥4 (arama render, ADR timeline, debt tablo, boş sonuç)

---

## DALGA C — Evrim Görünürlüğü (4 task)

## Task 12: 215-012 — Evolution API endpoint'leri (genealogy/retirement/prompt-metrics → /api)
- Model: sonnet
- Effort: normal
- Skills: api-builder, typescript-expert
- Files: src/api/evolution-endpoint.ts, tests/api/evolution-endpoint.test.ts
- Scope: src/api/, tests/api/

### Description
**Problem:** F5 evrim modülleri (agent-genealogy/retirement/prompt-metrics) canlı ama dashboard'a veri sunan API yok.
**Çözüm:** `evolution-endpoint.ts` — `/api/evolution/genealogy`, `/retirement`, `/prompt-metrics` read-only GET (memory.db + agent-pool'dan). server.ts'e wire (caller).
**Kanıt:** `grep -c "genealogy\|retirement\|prompt-metrics\|/api/evolution" src/api/evolution-endpoint.ts` → ≥2; `grep -rl "evolution-endpoint\|registerEvolution" src/api/server.ts` → wire; `npx vitest run tests/api/evolution-endpoint.test.ts` → 4+ pass
**Test:** ≥4 (genealogy GET, retirement GET, prompt-metrics GET, boş veri)

## Task 13: 215-013 — F7-010 /evolution dashboard sayfası (genealogy tree + retirement timeline + prompt-diff)
- Model: sonnet
- Effort: normal
- Skills: react-specialist, frontend-design
- Files: src/dashboard/src/pages/EvolutionPage.tsx, tests/dashboard/EvolutionPage.test.tsx
- Scope: src/dashboard/, tests/dashboard/
- Dependencies: 215-012

### Description
**Problem:** F7-010 — evrim backend var, frontend yok. Moat görünmez.
**Çözüm:** `EvolutionPage.tsx` (`/evolution` route) — agent genealogy ağacı, retirement timeline, prompt-diff viewer. 215-012 endpoint'inden useApi. Route'a ekle (8 sayfa).
**Kanıt:** `grep -c "genealogy\|retirement\|prompt.*diff\|evolution\|useApi" src/dashboard/src/pages/EvolutionPage.tsx` → ≥2; `npm run test:dashboard -- EvolutionPage` → 4+ pass
**Test:** ≥4 (genealogy render, timeline, prompt-diff, boş)

## Task 14: 215-014 — F5-008 aktif identity-mutation loop (düşük başarı→agent kimlik refactor) [moat]
- Model: opus
- Effort: normal
- Skills: typescript-expert, system-architect
- Files: src/orchestra/promotion-pipeline.ts, tests/orchestra/identity-mutation-loop.test.ts
- Scope: src/orchestra/, tests/orchestra/
- Dependencies:

### Description
**Problem ([[project_deckent_runtime_ecosystem]]):** Sprint 212 adaptive-agent ÖNERİ üretiyor ama agent kimliği gerçekten mutate edilmiyor (kapalı-loop yok). Ana farklılaştırıcı yarım.
**Çözüm:** promotion-pipeline.ts — agent başarı oranı eşik-altı düşünce: adaptive-agent önerisini UYGULA (prompt/skill repertuvar mutasyonu) + genealogy'ye kaydet + yeni varyant. Karar-kapılı (requiresApproval veya guard). Caller promotion-pipeline (def adaptive-agent.ts hariç).
**Kanıt:** `grep -c "mutat\|applyAdaptation\|identity\|refactor\|genealogy" src/orchestra/promotion-pipeline.ts` → ≥2; `npx vitest run tests/orchestra/identity-mutation-loop.test.ts` → 4+ pass
**Test:** ≥4 (düşük-başarı→mutasyon, yüksek→no-op, genealogy kayıt, idempotent)

## Task 15: 215-015 — F7-009 Nervous System UI sayfası (pending-approval/panic-guard badge)
- Model: sonnet
- Effort: low
- Skills: react-specialist, frontend-design
- Files: src/dashboard/src/pages/NervousPage.tsx, tests/dashboard/NervousPage.test.tsx
- Scope: src/dashboard/, tests/dashboard/

### Description
**Problem:** F7-009 — nervous approval flow server-side var, dashboard sayfası yok.
**Çözüm:** `NervousPage.tsx` (`/nervous`) — bekleyen approval listesi, accept/reject butonları (mevcut nervous_accept/reject endpoint), panic-guard badge, detector durumu. useApi.
**Kanıt:** `grep -c "nervous\|approval\|accept\|reject\|panic\|detector" src/dashboard/src/pages/NervousPage.tsx` → ≥2; `npm run test:dashboard -- NervousPage` → 4+ pass
**Test:** ≥4 (pending liste, accept, reject, boş state)

---

## DALGA D — Routing Fix + Doc-Drift Sync (4 task)

## Task 16: 215-016 — Routing: frontend-design→frontend-designer mapping tamamla
- Model: opus
- Effort: normal
- Skills: typescript-expert, system-architect
- Files: src/core/activation-engine.ts, tests/core/frontend-agent-mapping.test.ts
- Scope: src/core/, tests/core/

### Description
**Problem ([[feedback_agent_routing_imbalance]]):** 212-008 skill→agent affinity api-builder/security tarafında çalışıyor ama frontend-design/react-specialist skill'li UI task'ları **architecture-planner**'a gidiyor (frontend-designer DEĞİL — Sprint 213/214 plan analizinde doğrulandı).
**Çözüm:** activation-engine.ts — frontend-design/react-specialist skill → frontend-designer agent affinity (skoru architecture-planner'ı geçecek). refactorer aday KALIR (Sprint 205 fix geri alma).
**Kanıt:** `grep -c "frontend-designer\|frontend-design.*agent\|react-specialist" src/core/activation-engine.ts` → ≥1; `npx vitest run tests/core/frontend-agent-mapping.test.ts` → 4+ pass
**Test:** ≥4 (frontend-design→frontend-designer, react→frontend-designer, refactorer hâlâ aday, çoklu-skill)

## Task 17: 215-017 — Routing diversity guard genişlet (frontend mapping doğrula)
- Model: sonnet
- Effort: low
- Skills: typescript-expert, testing-expert
- Files: tests/core/routing-diversity-guard.test.ts
- Scope: tests/core/
- Dependencies: 215-016

### Description
**Problem:** Diversity guard frontend→frontend-designer eşlemesini doğrulamıyor.
**Çözüm:** routing-diversity-guard.test.ts'e case ekle — UI/frontend DNA → frontend-designer assert (215-016 doğrular). Hermetik (mock DNA, live state yok).
**Kanıt:** `grep -c "frontend-designer\|frontend" tests/core/routing-diversity-guard.test.ts` → ≥1; `npx vitest run tests/core/routing-diversity-guard.test.ts` → 5+ pass
**Test:** ≥5 (mevcut + frontend→frontend-designer + UI çeşitlilik)

## Task 18: 215-018 — Doc-drift sync: module count (90→111) + README badge generator
- Model: sonnet
- Effort: normal
- Skills: typescript-expert, documentation-writer
- Files: scripts/update-readme-stats.mjs, tests/scripts/update-readme-stats.test.ts
- Scope: scripts/, tests/scripts/

### Description
**Problem ([[feedback_zero_hardcode_live_data]]):** README badge "sprints-190+" + module count 90/76 stale (gerçek 111/88); update-readme-stats AUTOGEN markers drift (CI'da görüldü).
**Çözüm:** update-readme-stats.mjs — sprint/module/MCP/CLI sayılarını code-derived üret (readdirSync), README AUTOGEN markers (`<!-- AUTOGEN:badges -->`) eksikse ekle/güncelle. `--check` drift-gate hermetik.
**Kanıt:** `grep -c "readdirSync\|AUTOGEN\|badges\|sprint\|module" scripts/update-readme-stats.mjs` → ≥2; `npx vitest run tests/scripts/update-readme-stats.test.ts` → 4+ pass
**Test:** ≥4 (sayı code-derived, AUTOGEN inject, --check drift, --write idempotent)

## Task 19: 215-019 — CLAUDE/DECKENT module-count generator sync (managed-docs)
- Model: sonnet
- Effort: low
- Skills: typescript-expert
- Files: src/orchestra/managed-docs/content-generators.ts, tests/orchestra/module-count-sync.test.ts
- Scope: src/orchestra/, tests/orchestra/

### Description
**Problem:** CLAUDE.md/DECKENT.md "orchestra 76, core 90" stale; 212-010 generator code-derived yaptı ama architecture bölümü docs.json'da hâlâ protected (regen etmiyor).
**Çözüm:** content-generators.ts — architecture module-count auto-section üret (code-derived) + docs.json Architecture'ı autoSection yap. Regen sonrası CLAUDE/DECKENT 111/88 doğru.
**Kanıt:** `grep -c "countModules\|architecture\|module.*count\|readdirSync" src/orchestra/managed-docs/content-generators.ts` → ≥2; `npx vitest run tests/orchestra/module-count-sync.test.ts` → 4+ pass
**Test:** ≥4 (core 111 code-derived, orchestra 88, autoSection, drift yok)

---

## DALGA E — ADR + Status (2 task)

## Task 20: 215-020 — ADR-078 (CI-hermeticity + 8-provider runtime + evolution-loop + dashboard) + MASTER-PLAN
- Model: sonnet
- Effort: low
- Skills: documentation-writer, system-architect
- Files: docs/adr/078-ci-hermeticity-multiprovider-evolution.md, docs/MASTER-PLAN.md, tests/docs/adr-078.test.ts
- Scope: docs/, tests/docs/
- Dependencies: 215-001, 215-004, 215-014

### Description
**Çözüm:** ADR-078 (CI-hermeticity standardı + 8-provider bootstrap/overflow + active identity-mutation loop + dashboard god-level, MADR, accepted). MASTER-PLAN §3/§4 F1-009→DONE, F5-008, F7-003/004/006/007/009/010 + §10 Sprint 215 status güncelle. DOC-POLICY Tier-1.
**Kanıt:** `grep -c "hermeticity\|provider\|evolution\|dashboard" docs/adr/078-*.md` → ≥3; `grep -c "215" docs/MASTER-PLAN.md` → ≥1; `npx vitest run tests/docs/adr-078.test.ts` → 3+ pass
**Test:** ≥3 (ADR-078 MADR, MASTER-PLAN güncel, accepted)

## Task 21: 215-021 — CI-hermeticity rule + ci-guardian/ci-testing routing kalıcılaştır
- Model: sonnet
- Effort: low
- Skills: ci-testing, documentation-writer
- Files: .claude/rules/karpathy-discipline.md, tests/docs/ci-hermeticity-rule.test.ts
- Scope: .claude/, tests/docs/

### Description
**Problem:** CI-hermeticity disiplini kural-seviyede kayıtlı değil → gelecek worker'lar tekrar non-hermetic test yazar.
**Çözüm:** worker discipline anchor'a (karpathy-discipline.md CUSTOM bölüm) "Test Hermeticity" maddesi ekle — testler gitignored state okumaz, tmpdir fixture + async spawn, CI=fresh checkout. ci-guardian agent + ci-testing skill CI task'larına route.
**Kanıt:** `grep -c "hermetic\|tmpdir\|gitignored\|fresh checkout\|ci-sim" .claude/rules/karpathy-discipline.md` → ≥2; `npx vitest run tests/docs/ci-hermeticity-rule.test.ts` → 3+ pass
**Test:** ≥3 (kural mevcut, hermeticity maddesi, ci-sim referansı)

---

## Sprint Sonu Notu

**Beklenen:** 18-21/21 DONE, 0 false-FIX. **CI yeşil KORUNUR** (yeni testler hermetik). 8-provider fleet usable (DeepSeek/Qwen/GLM register + overflow + per-worker auth), dashboard god-level (UI/UX + terminal + enterprise + memory explorer + /evolution + /nervous), evrim moat görünür+canlı (identity-mutation loop), routing frontend-designer'a gider, doc-drift kapandı. tam-suite 0 fail.

**Pre-flight:** subscription creds canlı, **build+restart + RE-PLAN YAPILDI** (215-016 routing canlı). 214-001 auth-fix dist'te → env-u opsiyonel (güvenli için yine de önerilir). config max_workers=10. Sprint start Alperen manuel.

**Sprint sonrası:** F2-007 streaming + ERP (#ERP) + sub-#2 self-security + npm publish hazırlık (CI yeşil → public-repo flip mümkün).

İlgili memory:
- [[project_ci_green_root_causes]] — 🔴 CI hermeticity desenleri (yeni test kırmasın)
- [[project_test_home_leak]] — test-HOME isolation
- [[feedback_directive_kanit_letter_vs_goal]] — wire-gap dersi
- [[feedback_wiring_pct_vs_user_working]] — user-working kanıtı
- [[feedback_agent_routing_imbalance]] — frontend-designer mapping
- [[project_deckent_runtime_ecosystem]] — 8-provider + evrimleşen agent + dashboard
- [[project_dashboard_control_plane]] — F7 god-level
- [[feedback_brain_rubric_bridge_broken]] — yeni test şart
- [[project_api_mode_deferred_post_beta]] — subscription (Anthropic); 3rd-party API ayrı
- [[feedback_build_mcp_restart_coordination]] — build Alperen + RE-PLAN
