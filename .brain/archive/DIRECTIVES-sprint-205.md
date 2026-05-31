# DIRECTIVES — Sprint 205: Agent Routing Canlı Doğrulama + Flaky Temizlik + F3 Process Mode

## Goal: (DALGA 0) Sprint 204 agent routing fix'inin (204-003/004) build+restart sonrası CANLI çalıştığını doğrula — artık implementation task'ı built-in agent (refactorer/architect) seçmeli, scope-kör temp-react değil + 18 flaky/pre-existing test fail'ini temizle (baseline ~0 hedef). (DALGA 1) F3 process mode ilerlet (scheduled flows + cron iskelet). (DALGA 2) F4 enterprise başlangıç. YÜRÜTME: bol-küçük-task + 10 worker, her task TEK dosya/TEK sorumluluk, ≤200 LoC, effort≤normal (high YOK).

Bağlam (Sprint 204 sonrası):
- Sprint 204 disk-verify 9/9 landed. Circular import DÜZELDİ (archive-directives + event-stream yeşil). Agent routing fix agent-pool.ts kaynağında — **disk agent.json'lar build+restart+sync sonrası regenere olunca canlı olur** (bu sprint o etkiyi test eder).
- Tam-suite 18 fail: çoğu pre-existing flaky (start-lifecycle 7, docker-backend, identity-generator — izole de fail), 3'ü `spawn-backend-docker` testinin `max_workers=3` hardcode beklemesi (bizim max_workers=10 ayarımızla çakışıyor).

---

## Tüm task'lar için ortak kurallar

- **Subscription mode ZORUNLU** — `env -u ANTHROPIC_API_KEY -u DECKENT_CLAUDE_API_KEY`. API mode YASAK ([[project_api_mode_deferred_post_beta]]).
- Worker yalnızca scope.filesWrite. Host-facing config'lere `/workspace` YAZMA, `$CLAUDE_PROJECT_DIR`.
- **KÜÇÜK TASK:** tek-dosya/tek-sorumluluk, ≤200 LoC, effort≤normal. high YASAK.
- Her kod task'ı vitest min 4 test. `dosya:satır` kanıtı zorunlu.
- **Dishonest YASAK** — gerçekten ölç ([[feedback_trust_brain_eval_not_worker]]).
- ESM `.js` suffix. ADR-010 sıfır yeni runtime dep.
- Hedef: tam-suite fail 18→≤4.

---

## DALGA 0 — Routing Doğrulama + Flaky Temizlik (4 küçük task)

## Task 1: 205-001 — Agent routing canlı doğrulama testi (implementation→built-in)
- Model: opus
- Effort: normal
- Skills: typescript-expert, system-architect
- Files: tests/core/routing-impl-builtin.test.ts, src/core/agent-pool.ts
- Scope: src/core/, tests/core/

### Description
**Problem:** 204-003 built-in agent'lara implementation adaylığı ekledi ama canlı end-to-end test yok. Bir implementation task'ı gerçekten built-in (refactorer/architect) seçiyor mu, yoksa hâlâ temp-react mi?
**Çözüm:** routeTaskV2 ile end-to-end test: implementation intent'li task + built-in+temp agent havuzu → built-in seçilmeli, temp-react KAZANMAMALI. Gerekirse agent-pool.ts'te ufak düzeltme (built-in impl skoru temp 6'yı geçsin). Sadece test + minimal fix.
**Kanıt:** `npx vitest run tests/core/routing-impl-builtin.test.ts` → 4+ pass; implementation task'ı built-in agentId döndürür
**Test:** ≥4 (impl→refactorer/architect, temp-react kaybeder, design→architect korunur, forceAgent override çalışır)

## Task 2: 205-002 — spawn-backend-docker max_workers testi config-agnostic
- Model: sonnet
- Effort: low
- Skills: typescript-expert, ci-testing
- Files: tests/orchestra/spawn-backend-docker.test.ts
- Scope: tests/orchestra/

### Description
**Problem:** spawn-backend-docker.test.ts:231 `expect(cfg.max_workers).toBe(3)` — gerçek config 10, bu yüzden 3 test fail. Test kırılgan: belirli değere değil, NUMBER tipine + makul aralığa bakmalı.
**Çözüm:** `toBe(3)` → `typeof number` + `>= 1 && <= 20` aralık kontrolü. Test'in asıl amacı (string değil number) korunur, sabit-değer kırılganlığı gider. Sadece test düzelt.
**Kanıt:** `grep -c "toBe(3)" tests/orchestra/spawn-backend-docker.test.ts` → 0; `npx vitest run tests/orchestra/spawn-backend-docker.test.ts` → max_workers testleri PASS
**Test:** ≥3 (number tipi, makul aralık, memory normalize korunur)

## Task 3: 205-003 — start-lifecycle flaky fix
- Model: sonnet
- Effort: normal
- Skills: typescript-expert, ci-testing
- Files: tests/mcp/start-lifecycle.test.ts
- Scope: tests/mcp/

### Description
**Problem:** start-lifecycle.test.ts 7 test izole de fail (deckent_start fire-and-forget, active-sprint.json ordering, exit handler). Muhtemelen mock/state setup veya gerçek çevre bağımlılığı.
**Çözüm:** Her fail testi izole çalıştır, kök-neden bul (mock eksik, env bağımlılık, race). Test-only fix — kaynak kodu DEĞİŞTİRME (eğer gerçek bug bulursan NO_GO + not). Mümkünse 7→0.
**Kanıt:** `npx vitest run tests/mcp/start-lifecycle.test.ts` → fail ≤1
**Test:** mevcut 9 testin ≥8'i pass

## Task 4: 205-004 — docker-backend + identity-generator + error-handling flaky fix
- Model: sonnet
- Effort: normal
- Skills: typescript-expert, ci-testing
- Files: tests/e2e/docker-backend.test.ts, tests/core/identity-generator.test.ts, tests/core/error-handling-unification.test.ts
- Scope: tests/e2e/, tests/core/

### Description
**Problem:** docker-backend (list/kill taskId tracking), identity-generator (lint drift), error-handling-unification (generic throw) — izole de fail.
**Çözüm:** Her birini izole çalıştır, test-only fix. Gerçek kaynak bug ise NO_GO + not (kaynak değiştirme). docker-oom-reproducer + claude-rules-no-legacy de bakılabilir (aynı kategori).
**Kanıt:** `npx vitest run tests/e2e/docker-backend.test.ts tests/core/identity-generator.test.ts tests/core/error-handling-unification.test.ts` → fail ≤1
**Test:** her dosyada mevcut testlerin ≥%90'ı pass

---

## DALGA 1 — F3 Process Mode (3 küçük task)

## Task 5: 205-005 — Scheduled flow tipi + parser iskelet
- Model: sonnet
- Effort: normal
- Skills: typescript-expert, system-architect
- Files: src/core/scheduled-flow.ts, tests/core/scheduled-flow.test.ts
- Scope: src/core/, tests/core/

### Description
**Problem:** F3 process mode için scheduled flow (cron-benzeri tetikleyici) temeli yok. ROADMAP F3-002.
**Çözüm:** İSKELET — `scheduled-flow.ts`: `ScheduledFlow` tipi (id, cronExpr, action, tenantId, enabled) + `parseCronExpr()` (basit 5-alan cron parse, validation) + `nextRun()` hesap iskeleti. Gerçek scheduler runtime DEĞİL, tip + parse. tenant-context.ts (204-008) ile entegre (tenantId alanı). ≤200 LoC.
**Kanıt:** `ls src/core/scheduled-flow.ts`; `grep -c "ScheduledFlow\|parseCronExpr\|nextRun\|tenantId" src/core/scheduled-flow.ts` → ≥3; `npx vitest run tests/core/scheduled-flow.test.ts` → 4+ pass
**Test:** ≥4 (cron parse geçerli, geçersiz cron reddi, nextRun hesap, tenant alan)

## Task 6: 205-006 — Flow registry (CRUD + persist)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/core/flow-registry.ts, tests/core/flow-registry.test.ts
- Scope: src/core/, tests/core/
- Dependencies: 205-005

### Description
**Problem:** Scheduled flow'lar saklanmalı/yönetilmeli.
**Çözüm:** `flow-registry.ts`: in-memory + JSON persist (`.deckent/flows/<tenantId>/`) CRUD (add/get/list/remove/enable). MemoryStore pattern'ine benzer ama ayrı dosya. ≤200 LoC.
**Kanıt:** `grep -c "addFlow\|listFlows\|removeFlow\|FlowRegistry" src/core/flow-registry.ts` → ≥3; `npx vitest run tests/core/flow-registry.test.ts` → 4+ pass
**Test:** ≥4 (add+get, list filter tenant, remove, persist roundtrip)

## Task 7: 205-007 — deckent flow CLI komut iskelet (list/add)
- Model: sonnet
- Effort: low
- Skills: typescript-expert
- Files: src/cli/commands/flow.ts, tests/cli/flow-command.test.ts
- Scope: src/cli/, tests/cli/
- Dependencies: 205-006

### Description
**Problem:** Flow registry'ye CLI erişimi yok.
**Çözüm:** `deckent flow list` + `deckent flow add <cron> <action>` komut iskeleti (register<Flow>(program) pattern, ADR-012). flow-registry kullan. ≤200 LoC.
**Kanıt:** `grep -c "flow\|registerFlow\|FlowRegistry" src/cli/commands/flow.ts` → ≥2; `npx vitest run tests/cli/flow-command.test.ts` → 3+ pass
**Test:** ≥3 (list komut, add komut parse, boş registry)

---

## DALGA 2 — F4 Enterprise Başlangıç (2 küçük task)

## Task 8: 205-008 — Audit log query API iskelet
- Model: sonnet
- Effort: normal
- Skills: typescript-expert, security-specialist
- Files: src/core/audit-query.ts, tests/core/audit-query.test.ts
- Scope: src/core/, tests/core/

### Description
**Problem:** F4 enterprise için audit-trail sorgulanabilir değil (audit-key + HMAC chain var ama query yok). ROADMAP F4.
**Çözüm:** İSKELET — `audit-query.ts`: mevcut audit event stream'i (event-stream.ts) okuyup filtreleme (by tenant, by action, by time-range). Sadece read/query, yeni audit yazımı DEĞİL. ≤200 LoC.
**Kanıt:** `grep -c "queryAudit\|AuditQuery\|filter.*event" src/core/audit-query.ts` → ≥2; `npx vitest run tests/core/audit-query.test.ts` → 4+ pass
**Test:** ≥4 (tenant filtre, action filtre, time-range, boş sonuç)

## Task 9: 205-009 — F4 ADR taslağı + ROADMAP tracker güncelle
- Model: sonnet
- Effort: low
- Skills: documentation-writer, system-architect
- Files: docs/adr/068-enterprise-foundation.md, docs/ROADMAP-GOD-LEVEL.md, tests/docs/adr-068.test.ts
- Scope: docs/, tests/docs/

### Description
**Problem:** F4 enterprise kararı ADR'ye geçmemiş; ROADMAP tracker F3/F4 ilerleme yansımıyor.
**Çözüm:** ADR-068 taslağı (enterprise foundation: audit query + multi-tenant + scheduled flows, MADR, status: proposed). ROADMAP §EXECUTION TRACKER: F3-002 scheduled flows DONE, F4 başlangıç işaretle, yüzdeleri güncelle.
**Kanıt:** `grep -c "enterprise\|audit.*query\|scheduled" docs/adr/068-enterprise-foundation.md` → ≥2; `npx vitest run tests/docs/adr-068.test.ts` → 3+ pass
**Test:** ≥3 (ADR-068 MADR yapı, enterprise bölümü, ROADMAP F3/F4 güncel)

---

## Sprint Sonu Notu

**Beklenen:** 8-9/9 DONE. Sprint 205 = agent routing CANLI doğrulandı (built-in agent implementation'da seçiliyor) + flaky 18→≤4 (test sağlığı) + F3 process mode (scheduled flows + flow registry + CLI) + F4 enterprise başlangıç (audit query).

**Sprint sonrası:** F4 enterprise tamamla → F5 evrimsel mimari. ROADMAP §EXECUTION TRACKER.

**Pre-flight:** subscription env temiz, creds canlı, **build güncel (Alperen build:all + /mcp restart yaptı — 204 agent routing fix canlı)**, config max_workers=10.

İlgili memory:
- [[feedback_trust_brain_eval_not_worker]] — disk-verify ground truth
- [[feedback_build_mcp_restart_coordination]] — build+restart Alperen yapar, "yapıldı" promptu beklenir
- [[project_api_mode_deferred_post_beta]] — API mode yasak
- [[feedback_brain_synthetic_nogo_disk_verify]] — sentetik NO_GO, disk-verify zorunlu
