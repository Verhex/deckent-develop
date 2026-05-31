# DIRECTIVES — Sprint 207: Zero-Hard-Code + Flaky Sıfırlama + Brain-Fix Canlı Doğrulama + F4 RBAC Wire

## Goal: GENİŞ KAPSAM. (DALGA 0) Zero-hard-code felsefesi: CLI/MCP çıktılarındaki stale/sabit değerleri canlı deckent verisine bağla (model apiId opus-4-6→canlı, model distribution parametrik). (DALGA 1) Kalan 2 flaky test'i sıfırla + Brain-fix canlı doğrulama (bu sprint 0 false-FIX bekleniyor — cc'nin coverage:null fix'i artık canlı). (DALGA 2) F4 RBAC wire + F3 process mode devam. YÜRÜTME: bol-küçük-task + 10 worker, her task TEK dosya/TEK sorumluluk, ≤200 LoC, effort≤normal (high YOK).

Bağlam:
- **Brain-fix CANLI** (commit ba617421, cc tarafından elle): coverage:null false-FIX cascade çözüldü — coverageOptional artık sinyal-temelli (test dosyası yazıldıysa muaf), agent-bağımsız idempotent. Build+restart yapıldı. **Bu sprint Brain'in 0 gereksiz FIX üretmesi beklenir — canlı doğrulama.**
- **Zero-hard-code bulgusu** ([[feedback_zero_hardcode_live_data]]): `model-registry.ts:62` `apiId:'claude-opus-4-6'` bundled stale (güncel Opus 4.8). `bootstrapFromCatalog` çalışıyor ama apiId güncellenmiyor → cost-estimate çıktısı eski model gösteriyor. Model distribution `brain-context.ts` + `cost-calculator.ts`'ten basılıyor.
- Kalan 2 flaky: `docker-backend` (kill/list test izolasyon, beforeEach var ama state sızıyor) + `managed-docs-auditor-template` (template memory.db pattern bekliyor).

---

## Tüm task'lar için ortak kurallar

- **Subscription mode ZORUNLU** — `env -u ANTHROPIC_API_KEY -u DECKENT_CLAUDE_API_KEY`. API mode YASAK ([[project_api_mode_deferred_post_beta]]).
- Worker yalnızca scope.filesWrite. Host-facing config'lere `/workspace` YAZMA, `$CLAUDE_PROJECT_DIR`.
- **KÜÇÜK TASK:** tek-dosya/tek-sorumluluk, ≤200 LoC, effort≤normal. high YASAK.
- Her kod task'ı vitest min 4 test. `dosya:satır` kanıtı zorunlu. **Yeni test dosyası yaz** (Brain coverage muafiyeti artık buna bağlı — [[feedback_brain_rubric_bridge_broken]]).
- **Dishonest YASAK** — gerçekten ölç, zaten-temiz +0/-0 tuzağı yok ([[feedback_trust_brain_eval_not_worker]]).
- ESM `.js` suffix. ADR-010 sıfır yeni runtime dep.
- Hedef: tam-suite fail 2→0, regresyon yok.

---

## DALGA 0 — Zero-Hard-Code (3 küçük task)

## Task 1: 207-001 — Model registry bundled apiId güncel + "stale" işareti
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/core/model-registry.ts, tests/core/model-registry-apiid.test.ts
- Scope: src/core/, tests/core/

### Description
**Problem:** model-registry.ts:62 `apiId:'claude-opus-4-6'` bundled snapshot stale — güncel Opus 4.8. bootstrapFromCatalog çalışsa bile apiId güncellenmiyor (models.dev'de yok veya bootstrap apiId merge etmiyor). Kullanıcı `deckent start` cost-estimate'te eski model görüyor.
**Çözüm:** (1) Bundled opus apiId'yi `claude-opus-4-8`'e güncelle (sonnet/haiku doğru). (2) Bundled snapshot'a yorum: "bundled = offline son-çare, models.dev catalog canlı kaynak; apiId build-time güncel tutulmalı". (3) Eğer bootstrapFromCatalog apiId'yi güncellemiyor sa nedenini araştır + not (gerçek fix 207-002). SADECE bundled değer + yorum bu task'ta.
**Kanıt:** `grep -c "claude-opus-4-8" src/core/model-registry.ts` → ≥1; `grep -c "claude-opus-4-6" src/core/model-registry.ts` → 0; `npx vitest run tests/core/model-registry-apiid.test.ts` → 4+ pass
**Test:** ≥4 (opus apiId güncel, tier mapping korunur, 13-model invariant, bundled fallback çalışır)

## Task 2: 207-002 — bootstrapFromCatalog apiId merge doğrula + wire
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/core/model-catalog.ts, tests/core/catalog-apiid-merge.test.ts
- Scope: src/core/, tests/core/
- Dependencies: 207-001

### Description
**Problem:** bootstrapFromCatalog (model-catalog.ts) models.dev'den çekiyor ama canlı test'te opus apiId hâlâ bundled değer döndü — merge apiId'yi güncellemiyor olabilir. Zero-hard-code için canlı catalog apiId'yi ezmel i.
**Çözüm:** Merge mantığını incele — remote catalog entry varsa bundled apiId üzerine yazsın (remote canlı kaynak). Remote'ta yoksa bundled korunur (offline güvenlik). Test mock catalog ile (gerçek fetch DEĞİL).
**Kanıt:** `grep -c "apiId\|merge\|override" src/core/model-catalog.ts` → ≥2; `npx vitest run tests/core/catalog-apiid-merge.test.ts` → 4+ pass
**Test:** ≥4 (remote apiId ezer, remote yok→bundled korunur, merge idempotent, offline fallback)

## Task 3: 207-003 — Cost-estimate çıktısı catalog-aware (parametrik model adı)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/core/cost-calculator.ts, tests/core/cost-model-label.test.ts
- Scope: src/core/, tests/core/
- Dependencies: 207-001

### Description
**Problem:** `deckent start` "Model distribution" çıktısı registry apiId'sini doğrudan basıyor (`anthropic/claude-opus-4-6`). Stale değer kullanıcıya gidiyor. Zero-hard-code: çıktı canlı registry'den parametrik beslenmeli, sabit string olmamalı.
**Çözüm:** cost-calculator model-label üretimini registry'nin canlı `get(model).apiId`'sinden al (207-001/002 sonrası güncel olur). Sabit/fallback string varsa kaldır. brain-context.ts da aynı deseni kullanıyorsa not düş (ayrı task gerekebilir).
**Kanıt:** `grep -c "registry.get\|modelRegistry\|getModel\|\.apiId" src/core/cost-calculator.ts` → ≥1; hardcoded model string YOK; `npx vitest run tests/core/cost-model-label.test.ts` → 4+ pass
**Test:** ≥4 (label canlı registry'den, bilinmeyen model graceful, tier doğru, provider prefix doğru)

---

## DALGA 1 — Flaky Sıfırlama + Brain-Fix Canlı Doğrulama (3 küçük task)

## Task 4: 207-004 — docker-backend test izolasyon (kill/list state)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert, ci-testing
- Files: tests/e2e/docker-backend.test.ts
- Scope: tests/e2e/

### Description
**Problem:** docker-backend.test.ts "kill() deregisters taskId" + "list() tracks multiple concurrent" tam-suite'te fail, izole geçer — paylaşılan state başka testten sızıyor (beforeEach var ama yetersiz). Sprint 206-002 kısmi düzeltti, tam çözülmedi.
**Çözüm:** State izolasyonunu tamamla — registry/mock'u beforeEach+afterEach ile tam reset, gerekirse test-local instance kullan. Test-only fix, kaynak DEĞİŞTİRME. Tam-suite'te de geçsin.
**Kanıt:** `npx vitest run tests/e2e/docker-backend.test.ts` → PASS; tam-suite fail listesinde docker-backend YOK
**Test:** mevcut 36 testin tamamı pass (izole + tam-suite simülasyon)

## Task 5: 207-005 — managed-docs auditor template memory.db pattern
- Model: sonnet
- Effort: low
- Skills: typescript-expert, documentation-writer
- Files: src/core/rule-templates/auditor.template.md, tests/orchestra/managed-docs-auditor-template.test.ts
- Scope: src/core/, tests/orchestra/

### Description
**Problem:** managed-docs-auditor-template.test.ts "(c) template contains memory.db pattern upsert instruction" fail. auditor.template.md memory.db pattern talimatı eksik/yanlış formatta (test belirli string bekliyor).
**Çözüm:** Test'in beklediği memory.db pattern upsert talimatını template'e ekle (`store.insert({type:'pattern'})` veya test'in tam beklediği ifade). Test ne istiyorsa ona uydur. Regen sonrası .claude/rules/auditor.md doğru olur.
**Kanıt:** `npx vitest run tests/orchestra/managed-docs-auditor-template.test.ts` → PASS; template'te memory.db pattern talimatı VAR
**Test:** ≥3 (template memory.db pattern içerir, legacy referans yok, regen tutarlı)

## Task 6: 207-006 — Brain-fix canlı doğrulama testi (coverage:null → 0 false-FIX)
- Model: opus
- Effort: normal
- Skills: typescript-expert, testing-expert
- Files: tests/orchestra/brain-eval-integrity.test.ts, src/orchestra/result-evaluator.ts
- Scope: tests/orchestra/, src/orchestra/

### Description
**Problem:** cc'nin Brain-fix'i (coverage:null false-FIX, ba617421) canlı ama end-to-end regresyon koruması yok. Bu desen gelecekte tekrar açılmasın.
**Çözüm:** Yeni `brain-eval-integrity.test.ts` — gerçek senaryo: refactorer agent + code-dev task + coverage:null + yeni test dosyası + selfAssessment:DONE → evaluateWithRubric DONE (NO_GO DEĞİL). Agent-independence (refactorer↔bug-fixer aynı sonuç). NaN guard. Salt-kaynak (test yok) hâlâ NO_GO. Kaynak değişmez (sadece test) — gerçek bug bulursan minimal fix + not.
**Kanıt:** `ls tests/orchestra/brain-eval-integrity.test.ts`; `npx vitest run tests/orchestra/brain-eval-integrity.test.ts` → 5+ pass
**Test:** ≥5 (coverage:null+test→DONE, agent-independence, NaN guard, src-only→NO_GO, idempotent)

---

## DALGA 2 — F4 RBAC Wire + F3 Devam (3 küçük task)

## Task 7: 207-007 — RBAC enforce wire (audit-query'ye can() gate)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert, security-specialist
- Files: src/core/audit-query.ts, tests/core/audit-query-rbac.test.ts
- Scope: src/core/, tests/core/

### Description
**Problem:** Sprint 206'da rbac.ts (can/Role/Permission) + audit-query.ts ayrı iskeletler. RBAC enforce edilmiyor — audit-query erişim kontrolsüz.
**Çözüm:** audit-query'ye RBAC gate ekle: `queryAudit(params, role)` — `can(role, 'audit:read', tenantId)` false ise boş/hata döndür. rbac.ts'i import et (Sprint 206 206-008). İskelet→wire.
**Kanıt:** `grep -c "can(\|rbac\|Role\|Permission" src/core/audit-query.ts` → ≥2; `npx vitest run tests/core/audit-query-rbac.test.ts` → 4+ pass
**Test:** ≥4 (viewer audit-read izin, viewer write reddi, admin tümü, tenant izolasyon)

## Task 8: 207-008 — Flow scheduler + event-trigger birleşik dispatch
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/core/flow-scheduler.ts, tests/core/flow-dispatch.test.ts
- Scope: src/core/, tests/core/

### Description
**Problem:** Sprint 206'da flow-scheduler (cron tick) + event-trigger (event match) ayrı. Birleşik "due flows + matched triggers" dispatch listesi yok.
**Çözüm:** flow-scheduler'a `collectDue(now, events)` ekle — hem nextRun≤now scheduled flow'ları hem matchTrigger ile eşleşen event-trigger'ları birleşik döndür. Dispatch iskeleti (gerçek execute DEĞİL). event-trigger (206-005) import.
**Kanıt:** `grep -c "collectDue\|matchTrigger\|dueFlows\|EventTrigger" src/core/flow-scheduler.ts` → ≥2; `npx vitest run tests/core/flow-dispatch.test.ts` → 4+ pass
**Test:** ≥4 (scheduled due, event match, ikisi birleşik, hiçbiri due değil)

## Task 9: 207-009 — ADR-070 (Brain Evaluation Integrity + Zero-Hard-Code) + ROADMAP
- Model: sonnet
- Effort: low
- Skills: documentation-writer, system-architect
- Files: docs/adr/070-brain-eval-integrity.md, docs/ROADMAP-GOD-LEVEL.md, tests/docs/adr-070.test.ts
- Scope: docs/, tests/docs/

### Description
**Problem:** Brain-eval fix (coverage:null sinyal-temelli) + zero-hard-code kararı ADR'ye geçmemiş; ROADMAP F4/zero-hardcode ilerleme yansımıyor.
**Çözüm:** ADR-070 taslağı (Brain Evaluation Integrity: coverage muafiyeti sinyal-temelli agent-bağımsız + zero-hard-code prensibi, MADR, status: accepted — cc tarafından uygulandı). ROADMAP §EXECUTION TRACKER: zero-hardcode başlangıç, F4-001 RBAC wire, Brain-fix DONE.
**Kanıt:** `grep -c "coverage\|signal\|zero-hard\|rbac" docs/adr/070-brain-eval-integrity.md` → ≥2; `npx vitest run tests/docs/adr-070.test.ts` → 3+ pass
**Test:** ≥3 (ADR-070 MADR yapı, brain-eval bölümü, ROADMAP güncel)

---

## Sprint Sonu Notu

**Beklenen:** 8-9/9 DONE. **KRİTİK CANLI DOĞRULAMA:** Bu sprint Brain'in **0 gereksiz FIX** üretmesi beklenir (cc'nin coverage:null fix'i canlı). Eğer hâlâ DONE task'lara FIX başlıyorsa fix tutmadı demektir — disk-verify ile incele. Sprint 207 = zero-hardcode başlangıç + flaky 2→0 + Brain-fix kanıtlı + F4 RBAC wire.

**Sprint sonrası:** zero-hardcode tam audit (tüm CLI/MCP çıktıları) + F4 enterprise tamamla + F5 evrimsel. ROADMAP §EXECUTION TRACKER.

**Pre-flight:** subscription env temiz, creds canlı, **build+restart YAPILDI (Brain fix canlı, agent routing canlı)**, config max_workers=10. Sprint start'ı Alperen manuel çalıştırır.

İlgili memory:
- [[feedback_brain_rubric_bridge_broken]] — ✅ÇÖZÜLDÜ, bu sprint canlı doğrulama
- [[feedback_zero_hardcode_live_data]] — zero-hardcode felsefesi, DALGA 0
- [[feedback_trust_brain_eval_not_worker]] — disk-verify ground truth
- [[feedback_build_mcp_restart_coordination]] — build+restart Alperen yapar
- [[project_api_mode_deferred_post_beta]] — API mode yasak
