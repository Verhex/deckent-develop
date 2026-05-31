# DIRECTIVES — Sprint 209: Agent Routing Dengeleme + F7 Dashboard API Auth + Hijyen + F3/F4 Devam

## Goal: BÜYÜK ÖLÇEK (14 task, 4 dalga, 10 worker). DALGA A: AGENT ROUTING DENGELE (Alperen sorunu — hep refactorer seçiliyor, 15 agent/21 skill atıl; intent çeşitlendir + multi-sinyal scoring). DALGA B: F7 dashboard API auth fix (auth-disabled bağımlılığı kalksın) + canlı veri. DALGA C: hijyen (docker-backend e2e son fail) + zero-hardcode kalan. DALGA D: F3 otonom mod + F4 enterprise devam. Her task TEK dosya/TEK sorumluluk, ≤200 LoC, effort≤normal, YENİ TEST DOSYASI zorunlu.

Bağlam:
- Sprint 208: 16/16 DONE, 0 false-FIX (Brain sağlam), tam-suite 18189 pass / 2 fail (docker-backend e2e).
- **Routing sorunu** ([[feedback_agent_routing_imbalance]]): 208'de 16 task'tan 15'i refactorer. Sprint 205 fix'i ters döndü — refactorer impl@7 her implementation task'ını kapıyor, intent-classifier çok kaba (her kod task'ı "implementation"). api-builder/security/frontend/data/devops/performance HİÇ kullanılmıyor.
- **Dashboard** ([[project_dashboard_control_plane]]): API auth-disabled olmadan çalışmıyor; F7-001 ilk.

---

## Tüm task'lar için ortak kurallar
- **Subscription mode ZORUNLU** — `env -u ANTHROPIC_API_KEY -u DECKENT_CLAUDE_API_KEY`. API mode YASAK.
- Worker yalnızca scope.filesWrite. Host-facing'e `/workspace` YAZMA, `$CLAUDE_PROJECT_DIR`.
- **KÜÇÜK TASK:** tek-dosya/tek-sorumluluk, ≤200 LoC, effort≤normal. high YASAK.
- **Her kod task'ı YENİ TEST DOSYASI** (min 4 test) — Brain coverage muafiyeti buna bağlı ([[feedback_brain_rubric_bridge_broken]]).
- **Dishonest YASAK** — gerçekten ölç, +0/-0 tuzağı yok. **Modül-seviye çöp throw/placeholder BIRAKMA** (208'de enterprise-config/tenant-context'e bırakıldı). ESM `.js` suffix. ADR-010.
- Hedef: tam-suite fail 2→0, regresyon yok.

---

## DALGA A — Agent Routing Dengeleme (5 task)

## Task 1: 209-001 — Intent-classifier çeşitlendirme (domain/scope→intent)
- Model: opus
- Effort: normal
- Skills: typescript-expert, system-architect
- Files: src/core/intent-classifier.ts, tests/core/intent-diversity.test.ts
- Scope: src/core/, tests/core/

### Description
**Problem:** intent-classifier neredeyse her kod task'ını `intent.primary: implementation` yapıyor → refactorer kazanıyor. Domain/scope sinyalleri intent'i çeşitlendirmeli.
**Çözüm:** scope path + description'dan intent türet: `src/api/`→api, `src/auth|security/`→security, `src/components|dashboard/`→design/frontend, `src/db|models/`→data, `.github|docker/`→devops, `docs/`→documentation. "implementation" sadece gerçekten generic kod için. Mevcut intent kategorileri korunur, çeşitlilik artar.
**Kanıt:** `grep -c "api\|security\|frontend\|data\|devops" src/core/intent-classifier.ts` → artış; `npx vitest run tests/core/intent-diversity.test.ts` → 5+ pass
**Test:** ≥5 (api scope→api intent, security→security, dashboard→design, db→data, generic→implementation)

## Task 2: 209-002 — Multi-sinyal agent scoring (domain+scope ağırlık)
- Model: opus
- Effort: normal
- Skills: typescript-expert
- Files: src/core/routing-engine.ts, tests/core/routing-multisignal.test.ts
- Scope: src/core/, tests/core/
- Dependencies: 209-001

### Description
**Problem:** refactorer impl@7 tek-boyutlu kazanıyor. Domain match, scope path, skill synergy yeterince ağırlıklı değil.
**Çözüm:** Agent scoring'e domain-match bonusu ekle (agent domain == task domain → +3). Böylece api task'ı api-builder'a (domain match) refactorer'dan (sadece impl@7) daha çok puan verir. refactorer aday KALIR ama tek-kazanan olmaz.
**Kanıt:** `grep -c "domainMatch\|domain.*bonus\|scope.*score" src/core/routing-engine.ts` → ≥1; `npx vitest run tests/core/routing-multisignal.test.ts` → 4+ pass
**Test:** ≥4 (api task→api-builder, security→security-auditor, generic→refactorer/architect, domain bonus uygulanır)

## Task 3: 209-003 — refactorer impl skor dengeleme (7→tier)
- Model: sonnet
- Effort: low
- Skills: typescript-expert
- Files: src/core/agent-pool.ts, tests/core/agent-impl-balance.test.ts
- Scope: src/core/, tests/core/
- Dependencies: 209-002

### Description
**Problem:** refactorer impl@7 + architect impl@6 çok yüksek — domain-spesifik agent'ları eziyor.
**Çözüm:** refactorer/architect impl skorunu domain-aware yap: generic implementation'da aday (5) ama domain-spesifik task'ta domain-agent kazansın. DİKKAT: Sprint 205 fix'i geri ALMA (temp-react sorununa dönmesin) — built-in aday KALIR, sadece denge. 209-002 ile uyumlu.
**Kanıt:** `grep -c "implementation" src/core/agent-pool.ts` → korunur; `npx vitest run tests/core/agent-impl-balance.test.ts` → 4+ pass
**Test:** ≥4 (generic→refactorer aday, api→api-builder kazanır, temp-react kazanmaz, denge korunur)

## Task 4: 209-004 — Skill routing denetimi + çeşitlendirme
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/core/routing-engine.ts, tests/core/skill-routing-diversity.test.ts
- Scope: src/core/, tests/core/
- Dependencies: 209-001

### Description
**Problem:** 21 skill'in çoğu atıl — task'lara hep aynı skill atanıyor. Skill seçimi de çeşitlendirilmeli.
**Çözüm:** Skill scoring'i intent+domain'e bağla (api intent→api-builder skill, security→security-specialist, react→react-specialist). typescript-expert default ama domain skill'i eklensin.
**Kanıt:** `grep -c "domain.*skill\|skillBonus\|intent.*skill" src/core/routing-engine.ts` → ≥1; `npx vitest run tests/core/skill-routing-diversity.test.ts` → 4+ pass
**Test:** ≥4 (api→api-builder skill, security→security-specialist, generic→typescript-expert, çeşitlilik)

## Task 5: 209-005 — Routing dağılım analiz raporu (outcome-tracker)
- Model: sonnet
- Effort: low
- Skills: typescript-expert
- Files: scripts/routing-distribution.mjs, tests/scripts/routing-distribution.test.ts
- Scope: scripts/, tests/scripts/

### Description
**Problem:** Routing dengesi ölçülemiyor — hangi agent/skill ne kadar kullanılıyor görünmüyor.
**Çözüm:** `routing-distribution.mjs` — outcome-tracker/learnings'ten agent+skill kullanım dağılımı raporu (her agent kaç task, %). Dengesizlik tespiti (tek agent >%70 → uyarı). CI/manuel.
**Kanıt:** `node scripts/routing-distribution.mjs` → dağılım çıktısı; `npx vitest run tests/scripts/routing-distribution.test.ts` → 4+ pass
**Test:** ≥4 (dağılım hesap, dengesizlik uyarı, boş veri, yüzde doğru)

---

## DALGA B — F7 Dashboard API Auth + Veri (3 task)

## Task 6: 209-006 — API auth disabled-flag bağımlılığı kaldır (F7-001)
- Model: opus
- Effort: normal
- Skills: typescript-expert, security-specialist
- Files: src/api/auth.ts, tests/api/auth-no-disable-flag.test.ts
- Scope: src/api/, tests/api/

### Description
**Problem:** `DECKENT_API_AUTH_DISABLED=1` olmadan dashboard çalışmıyor — insecure, prod-safe değil ([[project_dashboard_control_plane]]).
**Çözüm:** Auth akışını düzelt — localhost caller'a token auto-inject düzgün çalışsın (disabled-flag gerekmeden), prod-safe default (uzak caller token ister, localhost dev otomatik). auth.ts token üretim/doğrulama zinciri.
**Kanıt:** `grep -c "localhost\|autoInject\|auto-inject\|isLocal" src/api/auth.ts` → ≥1; `npx vitest run tests/api/auth-no-disable-flag.test.ts` → 4+ pass
**Test:** ≥4 (localhost auto-token, uzak token-required, geçersiz token reddi, disabled-flag opsiyonel)

## Task 7: 209-007 — Dashboard API endpoint canlı veri parite (F7-002)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/api/server.ts, tests/api/dashboard-data-parity.test.ts
- Scope: src/api/, tests/api/
- Dependencies: 209-006

### Description
**Problem:** Dashboard panel'leri güncel/doğru veri göstermiyor — API endpoint'leri eksik/eski.
**Çözüm:** Dashboard'un ihtiyaç duyduğu endpoint'leri canlı veriye bağla (sprint durumu, worker, agent, memory, debt). Eksik endpoint ekle, eski olanı güncelle. SSE/polling ile gerçek-zamanlı.
**Kanıt:** `grep -c "sprint\|worker\|agent\|memory\|debt" src/api/server.ts` → artış; `npx vitest run tests/api/dashboard-data-parity.test.ts` → 4+ pass
**Test:** ≥4 (sprint endpoint, worker endpoint, memory endpoint, canlı güncelleme)

## Task 8: 209-008 — mcp-attach tool count hardcode kaldır (208-002 bayrak)
- Model: sonnet
- Effort: low
- Skills: typescript-expert
- Files: src/cli/helpers/mcp-attach.ts, tests/cli/mcp-tool-count.test.ts
- Scope: src/cli/, tests/cli/

### Description
**Problem:** mcp-attach.ts:63 `DECKENT_MCP_TOOL_COUNT = 31` hardcoded (208-002 worker bayrak etti) — zero-hardcode ihlali.
**Çözüm:** Tool count'u MCP tool registry'den parametrik al (getCapabilityCounts pattern, 208-002). Sabit 31 kaldır.
**Kanıt:** `grep -c "= 31\|DECKENT_MCP_TOOL_COUNT = " src/cli/helpers/mcp-attach.ts` → 0; `npx vitest run tests/cli/mcp-tool-count.test.ts` → 3+ pass
**Test:** ≥3 (count registry'den, sabit yok, registry boşsa graceful)

---

## DALGA C — Hijyen (2 task)

## Task 9: 209-009 — docker-backend e2e izolasyon kalıcı fix (son fail)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert, ci-testing
- Files: tests/e2e/docker-backend.test.ts
- Scope: tests/e2e/

### Description
**Problem:** docker-backend.test.ts "kill()/list()" tam-suite'te fail (izole geçer) — Sprint 206/207/208'de kısmi denendi, tam çözülmedi. Son kalan tam-suite fail.
**Çözüm:** State izolasyonunu KALICI çöz — her test bağımsız registry/mock instance, beforeEach+afterEach tam reset, paylaşılan global YOK. 3 ardışık tam-suite çalıştırmada stabil. Test-only.
**Kanıt:** `npx vitest run tests/e2e/docker-backend.test.ts` → PASS (3x stabil); tam-suite fail listesinde YOK
**Test:** mevcut 36 test stabil (flaky değil)

## Task 10: 209-010 — Sprint 208 worker-artefakt önleme (honest-gate güçlendir)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/orchestra/honest-gate.ts, tests/orchestra/honest-gate-garbage.test.ts
- Scope: src/orchestra/, tests/orchestra/

### Description
**Problem:** Sprint 208'de worker'lar enterprise-config/tenant-context'e modül-seviye çöp (`throw new Error('unreachable')` ×8, `placeholder` ×2) bıraktı, honest-gate yakalamadı. Bu çöp yapısal bozukluk.
**Çözüm:** honest-gate'e modül-seviye unreachable/placeholder throw tespiti ekle — `throw new Error('unreachable'|'placeholder'|'TODO')` veya fonksiyon-dışı throw → şüpheli işaretle. Worker .result honest-gate'ten geçerken bu pattern'i flag'le.
**Kanıt:** `grep -c "unreachable\|placeholder\|garbage\|stub.*throw" src/orchestra/honest-gate.ts` → ≥1; `npx vitest run tests/orchestra/honest-gate-garbage.test.ts` → 4+ pass
**Test:** ≥4 (unreachable throw tespit, placeholder tespit, temiz kod geçer, meşru throw geçer)

---

## DALGA D — F3 Otonom + F4 Enterprise Devam (4 task)

## Task 11: 209-011 — Self-dispatch flow-runtime entegrasyon (otonom tetik)
- Model: opus
- Effort: normal
- Skills: typescript-expert, system-architect
- Files: src/core/self-dispatch.ts, tests/core/self-dispatch-runtime.test.ts
- Scope: src/core/, tests/core/

### Description
**Problem:** self-dispatch (208-006) + flow-runtime (208-005) ayrı. Otonom mod için flow-runtime tick → self-dispatch evaluate → (onaylıysa) dispatch zinciri gerek.
**Çözüm:** self-dispatch'i flow-runtime'a bağla — tick'te policy evaluate, requiresApproval=TRUE ise dispatch'i "pending-approval" kuyruğuna koy (otomatik start YOK). Otonom yetenek, onay korunur.
**Kanıt:** `grep -c "FlowRuntime\|tick\|pending.*approval\|evaluateDispatch" src/core/self-dispatch.ts` → ≥2; `npx vitest run tests/core/self-dispatch-runtime.test.ts` → 4+ pass
**Test:** ≥4 (tick→evaluate, approval-pending kuyruk, auto-start yok, disabled skip)

## Task 12: 209-012 — RBAC + audit entegrasyon (yetkisiz işlem audit'lenir)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert, security-specialist
- Files: src/core/rbac.ts, tests/core/rbac-audit.test.ts
- Scope: src/core/, tests/core/
- Dependencies: (208 rbac + audit-writer var)

### Description
**Problem:** RBAC (208-009) + audit-writer (208-011) ayrı. Yetkisiz erişim denemesi audit'lenmeli (enterprise güvenlik).
**Çözüm:** can() reddinde audit-writer.writeAuditEvent çağır (action: 'access:denied', actor, target). RBAC kararı izlenebilir olsun.
**Kanıt:** `grep -c "writeAuditEvent\|audit.*denied\|auditWriter" src/core/rbac.ts` → ≥1; `npx vitest run tests/core/rbac-audit.test.ts` → 4+ pass
**Test:** ≥4 (deny→audit yazılır, allow→audit yok veya granted, tenant alan, actor kaydı)

## Task 13: 209-013 — Tenant-aware flow registry (multi-tenant izolasyon)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/core/flow-registry.ts, tests/core/flow-registry-tenant.test.ts
- Scope: src/core/, tests/core/

### Description
**Problem:** flow-registry (208) + tenant-context (208 withTenant) ayrı. Flow'lar tenant-scoped saklanmalı.
**Çözüm:** flow-registry persist path'ini currentTenant()'a bağla (`.deckent/tenants/<id>/flows/`). Tenant izolasyonu aktif — tenant A flow'u tenant B'de görünmez.
**Kanıt:** `grep -c "currentTenant\|withTenant\|tenant.*path\|tenantId" src/core/flow-registry.ts` → ≥1; `npx vitest run tests/core/flow-registry-tenant.test.ts` → 4+ pass
**Test:** ≥4 (tenant-scoped persist, izolasyon, default tenant, cross-tenant görünmez)

## Task 14: 209-014 — ADR-072 (routing dengeleme + dashboard auth) + ROADMAP
- Model: sonnet
- Effort: low
- Skills: documentation-writer, system-architect
- Files: docs/adr/072-routing-balance-dashboard.md, docs/ROADMAP-GOD-LEVEL.md, tests/docs/adr-072.test.ts
- Scope: docs/, tests/docs/

### Description
**Problem:** Routing dengeleme (multi-sinyal) + F7 dashboard auth kararları ADR'ye geçmemiş; ROADMAP F7 ilerleme yansımıyor.
**Çözüm:** ADR-072 taslağı (routing multi-sinyal scoring + dashboard API auth-disabled bağımlılığı kaldırma, MADR, accepted). ROADMAP §EXECUTION TRACKER: F7-001 API auth + F7-002 veri parite, routing-balance; yüzde güncelle.
**Kanıt:** `grep -c "routing\|multi-signal\|dashboard\|auth" docs/adr/072-routing-balance-dashboard.md` → ≥2; `npx vitest run tests/docs/adr-072.test.ts` → 3+ pass
**Test:** ≥3 (ADR-072 MADR yapı, routing+dashboard bölüm, ROADMAP F7 güncel)

---

## Sprint Sonu Notu

**Beklenen:** 12-14/14 DONE, 0 false-FIX (Brain sağlam). **ANA TEST:** agent routing dengesi — bu sprint farklı agent'lar seçilmeli (api-builder, security-auditor, frontend, api task'larında), hep refactorer DEĞİL. Sprint sonu routing-distribution.mjs ile doğrula.

**Pre-flight:** subscription env temiz, creds canlı, **build+restart YAPILDI**, config max_workers=10. Sprint start'ı Alperen **gece 01:00'da** manuel çalıştırır.

İlgili memory:
- [[feedback_agent_routing_imbalance]] — DALGA A ana hedef
- [[project_dashboard_control_plane]] — F7 dashboard, DALGA B
- [[feedback_brain_rubric_bridge_broken]] — Brain sağlam, yeni test şart
- [[feedback_scale_up_autonomous]] — büyük ölçek
- [[feedback_trust_brain_eval_not_worker]] — disk-verify
- [[feedback_build_mcp_restart_coordination]] — build Alperen
- [[project_api_mode_deferred_post_beta]] — API mode yasak
