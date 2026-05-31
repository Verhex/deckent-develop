# DIRECTIVES — Sprint 206: Flow Wire + Flaky Sıfırlama + F3 Webhook + F2 Real Binding + F4 RBAC

## Goal: (DALGA 0) Sprint 205'te eksik kalan flow CLI wire'ını tamamla + kalan 5 flaky/gap test'i sıfırla (baseline 5→0 hedef). (DALGA 1) F3-003 webhook/event triggers + F2 native chat'i gerçek provider adapter'a bağla (mock→subscription CLI path) + scheduled-flow runtime tick. (DALGA 2) F4 RBAC role-check iskelet + ADR. YÜRÜTME: bol-küçük-task + 10 worker, her task TEK dosya/TEK sorumluluk, ≤200 LoC, effort≤normal (high YOK).

Bağlam (Sprint 205 sonrası):
- Sprint 205 12/12 DONE 0 NO_GO. **Agent routing CANLI** (refactorer seçiliyor). Tam-suite 18→5 fail.
- Kalan 5 fail: (a) `registration-harness` ×2 — **205-007 flow.ts `registerFlow` export var AMA CLI entry'ye WIRE EDİLMEMİŞ** (gerçek gap), (b) `docker-backend` ×2 — test izolasyon/state çakışması (izole geçiyor), (c) `docker-oom-reproducer` ×1 — gracefulTimeout forward, (d) `claude-rules-no-legacy` ×2 — auditor.md managed-docs template legacy referans.

---

## Tüm task'lar için ortak kurallar

- **Subscription mode ZORUNLU** — `env -u ANTHROPIC_API_KEY -u DECKENT_CLAUDE_API_KEY`. API mode YASAK ([[project_api_mode_deferred_post_beta]]).
- Worker yalnızca scope.filesWrite. Host-facing config'lere `/workspace` YAZMA, `$CLAUDE_PROJECT_DIR`.
- **KÜÇÜK TASK:** tek-dosya/tek-sorumluluk, ≤200 LoC, effort≤normal. high YASAK.
- Her kod task'ı vitest min 4 test. `dosya:satır` kanıtı zorunlu.
- **Dishonest YASAK** — gerçekten ölç ([[feedback_trust_brain_eval_not_worker]]). Zaten-temiz +0/-0 tuzağı yok.
- ESM `.js` suffix. ADR-010 sıfır yeni runtime dep.
- Hedef: tam-suite fail 5→0.

---

## DALGA 0 — Flow Wire + Flaky Sıfırlama (4 küçük task)

## Task 1: 206-001 — flow CLI registerFlow → CLI entry wire (gerçek gap)
- Model: sonnet
- Effort: low
- Skills: typescript-expert
- Files: src/cli/index.ts, tests/cli/flow-wire.test.ts
- Scope: src/cli/, tests/cli/

### Description
**Problem:** 205-007 `src/cli/commands/flow.ts` `registerFlow(program)` export ediyor AMA CLI entry (src/cli/index.ts veya cli.ts — `grep -rln registerChat src/cli/` ile bul) bunu import+çağırmıyor. `registration-harness.test.ts` bu eksiği yakalıyor (2 fail). `deckent flow` komutu erişilemez durumda.
**Çözüm:** CLI entry'de diğer register*'ların yanına `import { registerFlow } from './commands/flow.js'` + `registerFlow(program)` ekle (ADR-012 register<Name> pattern). Mevcut komut sırasını koru, sadece ekleme.
**Kanıt:** `grep -c "registerFlow" <cli-entry-dosyası>` → ≥1 (import+çağrı); `npx vitest run tests/cli/registration-harness.test.ts tests/cli/flow-wire.test.ts` → flow.ts wire PASS
**Test:** ≥4 (registerFlow import var, çağrılıyor, flow komutu kayıtlı, registration-harness geçer)

## Task 2: 206-002 — docker-backend test izolasyon fix (kill/list state)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert, ci-testing
- Files: tests/e2e/docker-backend.test.ts
- Scope: tests/e2e/

### Description
**Problem:** docker-backend.test.ts "kill() deregisters taskId" + "list() tracks multiple concurrent" izole PASS ama tam-suite'te FAIL — paylaşılan/global state başka testten sızıyor (test izolasyon sorunu, sıra-bağımlı flaky).
**Çözüm:** beforeEach/afterEach ile state reset (registry temizle, mock sıfırla). Test-only fix — kaynak DEĞİŞTİRME. Gerçek kaynak bug bulursan NO_GO + not. Tam-suite'te de geçecek şekilde izole et.
**Kanıt:** `npx vitest run tests/e2e/docker-backend.test.ts` → PASS; tam-suite'te de bu 2 test fail listesinde YOK
**Test:** mevcut testlerin ≥%95'i pass (izole + tam-suite)

## Task 3: 206-003 — docker-oom gracefulTimeout forward fix
- Model: sonnet
- Effort: normal
- Skills: typescript-expert, ci-testing
- Files: tests/e2e/docker-oom-reproducer.test.ts, src/orchestra/spawn-backend.ts
- Scope: tests/e2e/, src/orchestra/

### Description
**Problem:** "SpawnBackendFactory forwards gracefulTimeoutSeconds to DockerSpawnBackend" fail. spawn-backend.ts'te gracefulTimeoutSeconds var (2 geçiş) ama factory→DockerSpawnBackend forward zinciri kopuk olabilir VEYA test beklentisi yanlış.
**Çözüm:** Önce izole çalıştır, kök-neden: forward gerçekten kopuksa kaynakta minimal düzelt (factory'de gracefulTimeoutSeconds geç); test beklentisi yanlışsa test düzelt. Honest — hangisi olduğunu kanıtla.
**Kanıt:** `npx vitest run tests/e2e/docker-oom-reproducer.test.ts` → PASS; `grep -c gracefulTimeoutSeconds src/orchestra/spawn-backend.ts` korunur/artar
**Test:** ≥4 (forward çalışır, default değer, custom değer, factory zinciri)

## Task 4: 206-004 — auditor.md managed-docs template legacy temizlik
- Model: sonnet
- Effort: normal
- Skills: typescript-expert, documentation-writer
- Files: src/cli/commands/init-templates/, tests/docs/claude-rules-no-legacy.test.ts
- Scope: src/cli/, tests/docs/

### Description
**Problem:** `claude-rules-no-legacy.test.ts` "(b) auditor.md contains memory.db pattern upsert instruction" fail. Managed-docs auditor.md template'i hâlâ legacy `PATTERNS.md` / "Append new patterns" referansı içeriyor (paradigm Sprint 187'de memory.db `pattern` entry'ye geçti). `grep -rln "PATTERNS.md\|Append new patterns" src/cli/commands/init-templates/` ile template'i bul.
**Çözüm:** Template'te legacy referansı `store.insert({type:'pattern'})` / memory.db upsert talimatıyla değiştir. Test ne bekliyorsa ona uygun. Kaynak template düzelt (regen sonrası .claude/rules/auditor.md doğru olur).
**Kanıt:** `npx vitest run tests/docs/claude-rules-no-legacy.test.ts` → PASS; template'te "PATTERNS.md" legacy referansı YOK
**Test:** ≥3 (auditor.md memory.db pattern içerir, legacy referans yok, brain.md tutarlı)

---

## DALGA 1 — F3 Webhook + F2 Real Binding + Scheduler (3 küçük task)

## Task 5: 206-005 — F3-003 webhook/event trigger tipi + handler iskelet
- Model: sonnet
- Effort: normal
- Skills: typescript-expert, system-architect
- Files: src/core/event-trigger.ts, tests/core/event-trigger.test.ts
- Scope: src/core/, tests/core/

### Description
**Problem:** F3 process mode'da scheduled-flow (cron) var ama event-driven trigger (webhook/event) yok. ROADMAP F3-003.
**Çözüm:** İSKELET — `event-trigger.ts`: `EventTrigger` tipi (id, eventType, source, action, tenantId, enabled) + `matchTrigger(event, triggers)` (gelen event'i kayıtlı trigger'larla eşleştir) + scheduled-flow ile aynı tenant-scoping. Gerçek HTTP webhook listener DEĞİL, tip + matcher iskeleti. ≤200 LoC.
**Kanıt:** `ls src/core/event-trigger.ts`; `grep -c "EventTrigger\|matchTrigger\|tenantId" src/core/event-trigger.ts` → ≥3; `npx vitest run tests/core/event-trigger.test.ts` → 4+ pass
**Test:** ≥4 (trigger match, no-match, tenant filtre, disabled atla)

## Task 6: 206-006 — F2 native chat gerçek provider adapter binding
- Model: opus
- Effort: normal
- Skills: typescript-expert, anthropic-sdk
- Files: src/cli/commands/chat-native.ts, tests/cli/chat-native-provider.test.ts
- Scope: src/cli/, tests/cli/

### Description
**Problem:** chat-native.ts (Sprint 203-204) tool-use loop + streaming var ama provider çağrısı MOCK/iskelet. Gerçek provider adapter'a (subscription CLI path — claude CLI spawn, API DEĞİL) bağlanmalı.
**Çözüm:** chat-native loop'taki mock provider çağrısını gerçek ProviderAdapter interface'ine bağla (provider.ts registry'den resolve). Subscription mode: claude CLI spawn path kullan (API key YOK). Streaming gerçek adapter stream'ine bağlansın. Test mock adapter ile (gerçek spawn değil). ≤200 LoC değişim.
**Kanıt:** `grep -c "ProviderAdapter\|getProvider\|providerRegistry\|adapter.send\|adapter.stream" src/cli/commands/chat-native.ts` → ≥2; `npx vitest run tests/cli/chat-native-provider.test.ts` → 4+ pass
**Test:** ≥4 (adapter resolve, subscription path, stream bind, mock round-trip)

## Task 7: 206-007 — Scheduled-flow runtime tick/scheduler iskelet
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/core/flow-scheduler.ts, tests/core/flow-scheduler.test.ts
- Scope: src/core/, tests/core/
- Dependencies: 206-005

### Description
**Problem:** scheduled-flow (205-005) + flow-registry (205-006) var ama periyodik tetikleyen runtime yok.
**Çözüm:** `flow-scheduler.ts`: `tick(now)` — registry'deki flow'ları tara, nextRun ≤ now olanları "due" olarak döndür (action dispatch iskeleti). event-trigger (206-005) ile birleşik trigger kaynağı. Gerçek setInterval daemon DEĞİL, tick fonksiyonu (test edilebilir). ≤200 LoC.
**Kanıt:** `grep -c "tick\|dueFlows\|FlowScheduler\|nextRun" src/core/flow-scheduler.ts` → ≥2; `npx vitest run tests/core/flow-scheduler.test.ts` → 4+ pass
**Test:** ≥4 (due flow bulur, henüz-değil atla, disabled atla, çoklu flow sırala)

---

## DALGA 2 — F4 RBAC + ADR (2 küçük task)

## Task 8: 206-008 — F4 RBAC role-check iskelet (tenant-aware permission)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert, security-specialist
- Files: src/core/rbac.ts, tests/core/rbac.test.ts
- Scope: src/core/, tests/core/

### Description
**Problem:** F4 enterprise'da audit-query (205-008) var ama erişim kontrolü yok. ROADMAP F4-001.
**Çözüm:** İSKELET — `rbac.ts`: `Role` tipi (admin/operator/viewer) + `Permission` enum + `can(role, action, tenantId)` check + tenant-context (204-008) ile entegre. Gerçek auth/session DEĞİL, role→permission matrix + check fonksiyonu. ≤200 LoC.
**Kanıt:** `ls src/core/rbac.ts`; `grep -c "Role\|Permission\|can(" src/core/rbac.ts` → ≥3; `npx vitest run tests/core/rbac.test.ts` → 4+ pass
**Test:** ≥4 (admin tüm izin, viewer read-only, tenant izolasyon, bilinmeyen rol reddi)

## Task 9: 206-009 — ADR-069 (event-driven + RBAC) + ROADMAP tracker güncelle
- Model: sonnet
- Effort: low
- Skills: documentation-writer, system-architect
- Files: docs/adr/069-event-driven-rbac.md, docs/ROADMAP-GOD-LEVEL.md, tests/docs/adr-069.test.ts
- Scope: docs/, tests/docs/

### Description
**Problem:** F3-003 webhook + F4 RBAC kararları ADR'ye geçmemiş; ROADMAP tracker F3-003/F4-001 ilerleme yansımıyor.
**Çözüm:** ADR-069 taslağı (event-driven triggers + RBAC, MADR, status: proposed). ROADMAP §EXECUTION TRACKER: F3-003 event-trigger DONE, F4-001 RBAC iskelet işaretle, yüzdeleri güncelle (AI System Worker yüzü ilerledi).
**Kanıt:** `grep -c "event-driven\|webhook\|rbac\|RBAC" docs/adr/069-event-driven-rbac.md` → ≥2; `npx vitest run tests/docs/adr-069.test.ts` → 3+ pass
**Test:** ≥3 (ADR-069 MADR yapı, event+rbac bölümü, ROADMAP F3/F4 güncel)

---

## Sprint Sonu Notu

**Beklenen:** 8-9/9 DONE. Sprint 206 = flow CLI tam wire + flaky 5→0 (test sağlığı tam yeşil) + F3 webhook/event + F2 gerçek provider binding + scheduler + F4 RBAC iskelet.

**Sprint sonrası:** F2 native chat tam canlı test (gerçek subscription round-trip) + F4 RBAC tam + F5 evrimsel mimari. ROADMAP §EXECUTION TRACKER.

**Pre-flight:** subscription env temiz, creds canlı, **build güncel (Alperen build:all + /mcp restart yaptı)**, config max_workers=10. **Sprint start'ı Alperen manuel çalıştırır** (`npx deckent start --auto-approve`).

İlgili memory:
- [[feedback_trust_brain_eval_not_worker]] — disk-verify ground truth
- [[feedback_build_mcp_restart_coordination]] — build+restart Alperen yapar, "yapıldı" promptu beklenir
- [[project_api_mode_deferred_post_beta]] — API mode yasak (F2 binding subscription CLI path)
- [[feedback_brain_synthetic_nogo_disk_verify]] — sentetik NO_GO, disk-verify zorunlu
- [[project_4cli_subscription_vision]] — multi-provider subscription vizyon
