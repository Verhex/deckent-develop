# DIRECTIVES — Sprint 210: Routing CANLI Doğrulama + 4 Fail Hijyen + FIX Prompt İyileştirme + F3/F4/F7 Devam

## Goal: BÜYÜK ÖLÇEK (16 task, 4 dalga, 10 worker). DALGA A: routing fix CANLI doğrulama (build+restart sonrası agent çeşitliliği — api/security/frontend task'ları doğru agent'a gitmeli, hep refactorer DEĞİL) + 4 fail hijyen (tam-suite 4→0). DALGA B: FIX prompt iyileştirme ([[feedback_fix_prompt_quality]] — boş Task + yanlış agent). DALGA C: F7 dashboard devam (UI/UX + canlı veri). DALGA D: F3 otonom + F4 enterprise tamamla. Her task TEK dosya/TEK sorumluluk, ≤200 LoC, effort≤normal, YENİ TEST DOSYASI zorunlu.

Bağlam:
- Sprint 209: 15/15 DONE, 1 meşru FIX, Brain sağlam. Routing fix KODU indi (209-001..004) ama plan eski kodla yapıldı (refactorer 13/14). **Build+restart YAPILDI → bu sprint routing CANLI, çeşitlilik beklenir.**
- Kalan 4 fail (tam-suite): error-handling + error-registry-lint (209-010 honest-gate'in `throw new Error('unreachable')` çöp-tespit kodu lint'e takıldı — allowlist'e honest-gate.ts ekle), docker-backend e2e (full-suite contamination, izole geçer), health-check (gece-yarısı tarih flaky).
- routing-distribution.mjs (209-005) canlı ölçüm aracı var — sprint sonu doğrulama için.

---

## Tüm task'lar için ortak kurallar
- **Subscription mode ZORUNLU** — `env -u ANTHROPIC_API_KEY -u DECKENT_CLAUDE_API_KEY`. API mode YASAK ([[project_api_mode_deferred_post_beta]]).
- Worker yalnızca scope.filesWrite. Host-facing'e `/workspace` YAZMA, `$CLAUDE_PROJECT_DIR`.
- **KÜÇÜK TASK:** tek-dosya/tek-sorumluluk, ≤200 LoC, effort≤normal. high YASAK.
- **Her kod task'ı YENİ TEST DOSYASI** (min 4 test) — Brain coverage muafiyeti buna bağlı ([[feedback_brain_rubric_bridge_broken]]).
- **Dishonest YASAK** — gerçekten ölç, +0/-0 tuzağı yok. **Modül-seviye çöp throw/placeholder BIRAKMA** ([[feedback_fix_prompt_quality]]).
- ESM `.js` suffix. ADR-010. Hedef: tam-suite 4→0, regresyon yok.

---

## DALGA A — Routing Canlı Doğrulama + 4 Fail Hijyen (5 task)

## Task 1: 210-001 — error-handling + error-registry-lint allowlist (honest-gate çöp-tespit)
- Model: sonnet
- Effort: low
- Skills: typescript-expert, ci-testing
- Files: tests/core/error-handling-unification.test.ts, tests/core/error-registry-lint.test.ts
- Scope: tests/core/

### Description
**Problem:** 209-010 honest-gate.ts'e `detectGarbageThrows` ekledi — bu kod `throw new Error('${keyword}')` STRING'ini (tespit deseni, gerçek throw değil) içeriyor. error-handling + error-registry-lint testleri ham metin tarayıp bunu "generic throw violation" sanıyor (2+2 fail). honest-gate.ts deseni KASITLI referanslıyor (monitor-adapter.ts gibi).
**Çözüm:** İki testin allowlist'ine `honest-gate.ts` ekle (error-handling.ts:601 `allowlist = new Set([...])` + error-registry-lint expected violation count'unu güncelle). honest-gate'in çöp-tespit kodu meşru. Sadece test allowlist.
**Kanıt:** `grep -c "honest-gate" tests/core/error-handling-unification.test.ts tests/core/error-registry-lint.test.ts` → ≥1; `npx vitest run tests/core/error-handling-unification.test.ts tests/core/error-registry-lint.test.ts` → PASS
**Test:** mevcut testler PASS + honest-gate allowlist'te doğrulanır

## Task 2: 210-002 — health-check gece-yarısı tarih flaky fix
- Model: sonnet
- Effort: low
- Skills: typescript-expert, ci-testing
- Files: tests/orchestra/doc-updaters/health-check.test.ts
- Scope: tests/orchestra/

### Description
**Problem:** health-check.test.ts:129 `expect(written).toContain('Last audit: ${yearMonth}')` — test BUGÜNÜN ay'ını (`2026-06`) bekliyor ama fixture dosyası dün yazılmış (`2026-05-31`). Gece-yarısı ay sınırında flaky.
**Çözüm:** Test'i tarih-agnostik yap — ya fixture'ı test içinde güncel tarihle oluştur, ya da assertion'ı `Last audit:` prefix varlığına/regex'e bağla (sabit ay değil). Test-only, kaynak DEĞİŞTİRME.
**Kanıt:** `npx vitest run tests/orchestra/doc-updaters/health-check.test.ts` → PASS; tarih-agnostik assertion
**Test:** mevcut 10 test PASS (tarih sınırından bağımsız)

## Task 3: 210-003 — docker-backend full-suite contamination kalıcı fix
- Model: sonnet
- Effort: normal
- Skills: typescript-expert, ci-testing
- Files: tests/e2e/docker-backend.test.ts
- Scope: tests/e2e/

### Description
**Problem:** docker-backend.test.ts izole 3x stabil (209-009-fix çözdü) ama TAM-SUITE'te hâlâ fail — başka test dosyasının bıraktığı global state/registry sızıntısı. Cross-test contamination.
**Çözüm:** Test'i tam-suite'te de izole çalışacak şekilde güçlendir — test-local registry instance, beforeAll/afterAll tam reset, paylaşılan singleton'a bağımlılık kaldır. Hangi test'in state sızdırdığını bul (notes'a yaz). Test-only.
**Kanıt:** `npx vitest run` (tam-suite) → docker-backend fail listesinde YOK; izole de PASS
**Test:** tam-suite + izole stabil

## Task 4: 210-004 — Routing canlı doğrulama testi (build sonrası çeşitlilik)
- Model: opus
- Effort: normal
- Skills: typescript-expert, system-architect
- Files: tests/core/routing-live-diversity.test.ts, src/core/routing-engine.ts
- Scope: tests/core/, src/core/

### Description
**Problem:** 209 routing fix (intent çeşitlendirme + multi-sinyal + gated default) kod indi ama end-to-end "doğru task→doğru agent" testi eksik. Bu sprint CANLI (build sonrası).
**Çözüm:** End-to-end routing testi — gerçek task DNA'larıyla: `src/api/` task → api-builder, `src/auth/` → security-auditor, `src/dashboard/` → frontend-designer, `src/db/` → data-engineer, generic `src/core/` → refactorer/architect. Her biri doğru agent'a gitmeli, hepsi refactorer DEĞİL. Gerekirse routing-engine ufak düzeltme (domain bonus eksikse). 209-002 domain-match'i doğrula.
**Kanıt:** `npx vitest run tests/core/routing-live-diversity.test.ts` → 5+ pass (5 farklı agent seçilir)
**Test:** ≥5 (api→api-builder, auth→security, dashboard→frontend, db→data, generic→refactorer)

## Task 5: 210-005 — Routing imbalance CI guard (dağılım eşik)
- Model: sonnet
- Effort: low
- Skills: typescript-expert, ci-testing
- Files: tests/scripts/routing-imbalance-guard.test.ts, scripts/routing-distribution.mjs
- Scope: tests/scripts/, scripts/

### Description
**Problem:** routing-distribution.mjs (209-005) rapor üretiyor ama CI'da dengesizlik tespiti otomatik değil. Tek agent >%70 → uyarı eşiği var ama gate yok.
**Çözüm:** routing-distribution.mjs'e `--ci` mode ekle: tek-sprint dağılımında tek agent >%80 ise exit 1 (yeni dengesizlik regresyon guard'ı). Tarihsel veri değil, son-sprint dağılımı. Test ile doğrula.
**Kanıt:** `node scripts/routing-distribution.mjs --ci` → çalışır; `npx vitest run tests/scripts/routing-imbalance-guard.test.ts` → 4+ pass
**Test:** ≥4 (dengeli→exit0, dengesiz→exit1, eşik konfigüre, boş veri)

---

## DALGA B — FIX Prompt İyileştirme (3 task)

## Task 6: 210-006 — FIX prompt enrichment (orijinal task description inject)
- Model: opus
- Effort: normal
- Skills: typescript-expert, system-architect
- Files: src/orchestra/debt-manager.ts, tests/orchestra/fix-task-enrichment.test.ts
- Scope: src/orchestra/, tests/orchestra/

### Description
**Problem:** ([[feedback_fix_prompt_quality]]) FIX prompt'unda `=== Task ===` bölümü BOŞ — fix worker'a orijinal task description/Çözüm verilmiyor, sadece "Original worker notes: exited without result". Worker NE/NASIL düzelteceğini bilmiyor.
**Çözüm:** debt-manager.ts fix-task oluştururken orijinal task'ın FULL description'ını + NO_GO reason'ını + somut fix yönergesini fix-task.description'a inject et. Fix worker görevi anlasın.
**Kanıt:** `grep -c "originalDescription\|fix.*description\|NO_GO reason\|originalTask" src/orchestra/debt-manager.ts` → ≥1; `npx vitest run tests/orchestra/fix-task-enrichment.test.ts` → 4+ pass
**Test:** ≥4 (description inject, NO_GO reason inject, boş description fallback, idempotent)

## Task 7: 210-007 — FIX agent seçimi task türüne göre (sadece bug-fixer değil)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/orchestra/debt-manager.ts, tests/orchestra/fix-agent-selection.test.ts
- Scope: src/orchestra/, tests/orchestra/
- Dependencies: 210-006

### Description
**Problem:** ([[feedback_fix_prompt_quality]]) FIX hep bug-fixer agent atıyor — test-izolasyon task'ına bug-fixer'ın 5-Whys/bisect disiplini uymuyor.
**Çözüm:** fix-task agent'ını orijinal task türüne/agent'ına göre seç: test task → ci-testing/orijinal agent, doc → doc-writer, exit-no-result → orijinal agent re-run. bug-fixer sadece gerçek bug-fix için. routeTaskV2 fix-task'a da uygulansın.
**Kanıt:** `grep -c "fixAgent\|originalAgent\|fix.*route\|forceAgent" src/orchestra/debt-manager.ts` → ≥1; `npx vitest run tests/orchestra/fix-agent-selection.test.ts` → 4+ pass
**Test:** ≥4 (test task→ci-testing, doc→doc-writer, bug→bug-fixer, orijinal agent korunur)

## Task 8: 210-008 — Brain NO_GO note doğruluğu (gerçek sebep yaz)
- Model: sonnet
- Effort: low
- Skills: typescript-expert
- Files: src/orchestra/result-evaluator.ts, tests/orchestra/nogo-note-accuracy.test.ts
- Scope: src/orchestra/, tests/orchestra/

### Description
**Problem:** ([[feedback_fix_prompt_quality]]) Brain "Worker exited without writing result" diyor ama result VAR (self=NO_GO). Note yanlış → debug zorlaşıyor.
**Çözüm:** NO_GO note'unu gerçek sebebe bağla: result varsa self-assessment + files/lines yaz ("worker self-NO_GO, 0 files"), result yoksa "no result file". Yanlış "exited without result" notunu düzelt.
**Kanıt:** `grep -c "self-NO_GO\|noResult\|exited.*result\|accurateReason" src/orchestra/result-evaluator.ts` → ≥1; `npx vitest run tests/orchestra/nogo-note-accuracy.test.ts` → 4+ pass
**Test:** ≥4 (result-var note doğru, result-yok note doğru, self-NO_GO note, files=0 note)

---

## DALGA C — F7 Dashboard Devam (4 task)

## Task 9: 210-009 — Dashboard sprint kontrol paneli (plan/start/status UI)
- Model: sonnet
- Effort: normal
- Skills: react-specialist, frontend-design
- Files: src/dashboard/src/components/SprintControlPanel.tsx, src/dashboard/src/components/SprintControlPanel.test.tsx
- Scope: src/dashboard/

### Description
**Problem:** ([[project_dashboard_control_plane]] F7-005) Dashboard'dan sprint kontrolü (status görüntüleme, faz takibi) işlevsel değil.
**Çözüm:** `SprintControlPanel.tsx` — canlı sprint durumu (faz, worker, ilerleme) + status butonları (onay-gate'li). useSSE/useApi ile gerçek-zamanlı. Mevcut SprintPhaseTimeline + WorkerCard kullan. start/kill UI-onaylı (gerçek tetik backend'e).
**Kanıt:** `ls src/dashboard/src/components/SprintControlPanel.tsx`; `grep -c "useSSE\|useApi\|phase\|worker" src/dashboard/src/components/SprintControlPanel.tsx` → ≥2; `npm run test:dashboard -- SprintControlPanel` → 4+ pass
**Test:** ≥4 (sprint durumu render, faz görselleştirme, worker listesi, boş durum)

## Task 10: 210-010 — Dashboard agent/skill dağılım görünümü (routing şeffaflık)
- Model: sonnet
- Effort: normal
- Skills: react-specialist, frontend-design
- Files: src/dashboard/src/components/RoutingDistribution.tsx, src/dashboard/src/components/RoutingDistribution.test.tsx
- Scope: src/dashboard/

### Description
**Problem:** routing-distribution.mjs (209-005) CLI raporu var ama dashboard'da görsel yok. Kullanıcı agent dağılımını/dengesizliğini göremiyor.
**Çözüm:** `RoutingDistribution.tsx` — agent + skill kullanım dağılımı bar chart (SprintChart pattern), dengesizlik uyarısı (>%80 kırmızı). API endpoint'ten veri (routing learnings). F7 + routing şeffaflığı.
**Kanıt:** `ls src/dashboard/src/components/RoutingDistribution.tsx`; `grep -c "agent\|skill\|distribution\|chart" src/dashboard/src/components/RoutingDistribution.tsx` → ≥2; `npm run test:dashboard -- RoutingDistribution` → 4+ pass
**Test:** ≥4 (dağılım render, bar chart, dengesizlik uyarı, boş veri)

## Task 11: 210-011 — Dashboard API routing endpoint
- Model: sonnet
- Effort: low
- Skills: typescript-expert, api-builder
- Files: src/api/server.ts, tests/api/routing-endpoint.test.ts
- Scope: src/api/, tests/api/
- Dependencies: 210-010

### Description
**Problem:** Dashboard RoutingDistribution (210-010) veri ister ama API endpoint yok.
**Çözüm:** server.ts'e `/api/routing/distribution` endpoint ekle — routing-distribution.mjs computeDistribution() mantığını API'ye bağla (learnings.json oku, dağılım döndür). RBAC-aware (209-006 auth).
**Kanıt:** `grep -c "routing/distribution\|computeDistribution\|routingDist" src/api/server.ts` → ≥1; `npx vitest run tests/api/routing-endpoint.test.ts` → 4+ pass
**Test:** ≥4 (endpoint döner, dağılım format, auth gate, boş veri)

## Task 12: 210-012 — Dashboard onboarding/empty-state iyileştirme (sade kişi)
- Model: sonnet
- Effort: low
- Skills: react-specialist, frontend-design
- Files: src/dashboard/src/components/Onboarding.tsx, src/dashboard/src/components/Onboarding.test.tsx
- Scope: src/dashboard/

### Description
**Problem:** ([[project_dashboard_control_plane]] F7-008) Sade kişi için onboarding/rehber yok — boş dashboard kafa karıştırıcı.
**Çözüm:** `Onboarding.tsx` — ilk-kullanım sihirbazı iskelet (init→directives→start adımları, tooltip). EmptyState genişletme. 3-yüz: sade kişi friendly. ≤200 LoC.
**Kanıt:** `ls src/dashboard/src/components/Onboarding.tsx`; `grep -c "step\|onboard\|wizard\|init\|guide" src/dashboard/src/components/Onboarding.tsx` → ≥2; `npm run test:dashboard -- Onboarding` → 4+ pass
**Test:** ≥4 (adım render, ilerleme, atla, tamamla)

---

## DALGA D — F3 Otonom + F4 Enterprise Tamamla (4 task)

## Task 13: 210-013 — Self-dispatch pending-approval kuyruğu (otonom mod onay-gate)
- Model: opus
- Effort: normal
- Skills: typescript-expert, system-architect
- Files: src/core/self-dispatch.ts, tests/core/self-dispatch-queue.test.ts
- Scope: src/core/, tests/core/

### Description
**Problem:** self-dispatch (208/209) karar veriyor ama requiresApproval=TRUE olanlar için kuyruk yok — otonom mod onay-bekleyen dispatch'leri saklamalı.
**Çözüm:** self-dispatch'e pending-approval queue ekle — evaluateDispatch dispatch=true + requiresApproval ise kuyruğa koy (otomatik start YOK). `listPendingDispatches()` + `approveDispatch(id)` iskeleti. Onay kuralı korunur. ≤200 LoC.
**Kanıt:** `grep -c "pendingQueue\|listPending\|approveDispatch\|requiresApproval" src/core/self-dispatch.ts` → ≥2; `npx vitest run tests/core/self-dispatch-queue.test.ts` → 4+ pass
**Test:** ≥4 (kuyruğa ekle, listele, onayla, otomatik-start yok)

## Task 14: 210-014 — RBAC CLI komut (deckent rbac check/grant iskelet)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert, security-specialist
- Files: src/cli/commands/rbac.ts, tests/cli/rbac-command.test.ts
- Scope: src/cli/, tests/cli/

### Description
**Problem:** RBAC (208/209 rbac.ts) var ama CLI erişimi yok — rol/izin yönetimi yapılamıyor.
**Çözüm:** `deckent rbac check <role> <action>` + `deckent rbac roles` komut iskeleti (register pattern, ADR-012). rbac.ts can()/hierarchy kullan. ≤200 LoC.
**Kanıt:** `grep -c "rbac\|registerRbac\|can(\|Role" src/cli/commands/rbac.ts` → ≥2; `npx vitest run tests/cli/rbac-command.test.ts` → 4+ pass
**Test:** ≥4 (check izin var, check reddi, roles listele, geçersiz rol)

## Task 15: 210-015 — Audit log CLI sorgu (deckent audit query iskelet)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert, security-specialist
- Files: src/cli/commands/audit.ts, tests/cli/audit-command.test.ts
- Scope: src/cli/, tests/cli/

### Description
**Problem:** audit-query (205/207) + audit-writer (208) var ama CLI sorgu yok.
**Çözüm:** `deckent audit query [--tenant] [--action] [--since]` komut iskeleti — audit-query.queryAudit() bağla, RBAC-gate (209-007). register pattern. ≤200 LoC.
**Kanıt:** `grep -c "audit\|queryAudit\|registerAudit\|tenant" src/cli/commands/audit.ts` → ≥2; `npx vitest run tests/cli/audit-command.test.ts` → 4+ pass
**Test:** ≥4 (query döner, tenant filtre, action filtre, RBAC gate)

## Task 16: 210-016 — ADR-073 (routing canlı + FIX prompt + dashboard) + ROADMAP
- Model: sonnet
- Effort: low
- Skills: documentation-writer, system-architect
- Files: docs/adr/073-routing-fix-dashboard.md, docs/ROADMAP-GOD-LEVEL.md, tests/docs/adr-073.test.ts
- Scope: docs/, tests/docs/

### Description
**Problem:** Routing canlı doğrulama + FIX prompt iyileştirme + F7 dashboard ilerleme ADR/ROADMAP'e geçmemiş.
**Çözüm:** ADR-073 (routing multi-sinyal canlı + FIX prompt enrichment + dashboard control plane, MADR, accepted). ROADMAP §EXECUTION TRACKER: routing-balance DONE, FIX-prompt, F7-002/005/008 ilerleme; yüzde güncelle.
**Kanıt:** `grep -c "routing\|fix.*prompt\|dashboard\|F7" docs/adr/073-routing-fix-dashboard.md` → ≥2; `npx vitest run tests/docs/adr-073.test.ts` → 3+ pass
**Test:** ≥3 (ADR-073 MADR, routing+fix+dashboard bölüm, ROADMAP güncel)

---

## Sprint Sonu Notu

**Beklenen:** 14-16/16 DONE, 0 false-FIX. **ANA TEST:** routing CANLI çeşitlilik — bu sprint build+restart sonrası ilk, farklı agent'lar seçilmeli (api-builder/security/frontend api task'larında). Sprint sonu `node scripts/routing-distribution.mjs --ci` ile doğrula (tek agent <%80). + tam-suite 4→0.

**Sprint sonrası:** routing canlı kanıt + F7 dashboard tam işlevsel + F3 otonom mod + F4 enterprise tamamlanır. ROADMAP §EXECUTION TRACKER.

**Pre-flight:** subscription env temiz, creds canlı, **build+restart YAPILDI (routing fix + 209 tümü canlı)**, config max_workers=10. Sprint start Alperen manuel (uyumadan önce).

İlgili memory:
- [[feedback_agent_routing_imbalance]] — DALGA A ana hedef, routing CANLI test
- [[feedback_fix_prompt_quality]] — DALGA B FIX prompt
- [[project_dashboard_control_plane]] — DALGA C F7 dashboard
- [[feedback_brain_rubric_bridge_broken]] — Brain sağlam, yeni test şart
- [[feedback_scale_up_autonomous]] — büyük ölçek + otonom mod
- [[feedback_trust_brain_eval_not_worker]] — disk-verify ground truth
- [[feedback_build_mcp_restart_coordination]] — build Alperen yapar
- [[project_api_mode_deferred_post_beta]] — API mode yasak
