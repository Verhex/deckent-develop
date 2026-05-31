# DIRECTIVES — Sprint 208: BÜYÜK ÖLÇEK — Zero-Hardcode TAM + F3 Otonom Mod + F4 Enterprise + F5 Evrimsel

## Goal: BÜYÜK ÖLÇEK (16 task, 4 dalga, 10 worker — [[feedback_scale_up_autonomous]] "daha çok task, otonom mod"). Brain artık sağlam (0 false-FIX kanıtlandı Sprint 207), bu ölçek güvenli. DALGA A: zero-hardcode TAM (catalog merge kök-bug + CLI/MCP çıktı parametrik). DALGA B: F3 process mode tamamla (OTONOM MOD temeli — scheduled flow runtime + self-dispatch). DALGA C: F4 enterprise (RBAC tam + multi-tenant runtime). DALGA D: F5 evrimsel başlangıç + hijyen. Her task TEK dosya/TEK sorumluluk, ≤200 LoC, effort≤normal (high YOK).

Bağlam:
- Sprint 207: 0 false-FIX (Brain-fix canlı), tam-suite 0 fail/17964 pass, zero-hardcode opus-4-8 canlı (build doğrulandı: `modelRegistry.get('opus').apiId === claude-opus-4-8`).
- Açık kök-bug: `model-catalog.ts:234` mergeFromCatalog id-based — bundled id='opus' vs remote id='claude-opus-4-8' eşleşmiyor → canlı catalog runtime'da apiId güncellemiyor.
- Mevcut iskeletler (Sprint 204-207): scheduled-flow, flow-registry, flow-scheduler, event-trigger, tenant-context, rbac, audit-query — hepsi VAR, runtime wire eksik.

---

## Tüm task'lar için ortak kurallar

- **Subscription mode ZORUNLU** — `env -u ANTHROPIC_API_KEY -u DECKENT_CLAUDE_API_KEY`. API mode YASAK ([[project_api_mode_deferred_post_beta]]).
- Worker yalnızca scope.filesWrite. Host-facing config'lere `/workspace` YAZMA, `$CLAUDE_PROJECT_DIR`.
- **KÜÇÜK TASK:** tek-dosya/tek-sorumluluk, ≤200 LoC, effort≤normal. high YASAK.
- **Her kod task'ı YENİ TEST DOSYASI yaz** (min 4 test) — Brain coverage muafiyeti buna bağlı ([[feedback_brain_rubric_bridge_broken]]). `dosya:satır` kanıtı zorunlu.
- **Dishonest YASAK** — gerçekten ölç, +0/-0 zaten-temiz tuzağı yok ([[feedback_trust_brain_eval_not_worker]]).
- ESM `.js` suffix. ADR-010 sıfır yeni runtime dep.
- Hedef: tam-suite 0 fail KORUNUR, regresyon yok.

---

## DALGA A — Zero-Hardcode TAM (4 task)

## Task 1: 208-001 — mergeFromCatalog id eşleşme kök-bug fix
- Model: opus
- Effort: normal
- Skills: typescript-expert
- Files: src/core/model-catalog.ts, tests/core/catalog-merge-id.test.ts
- Scope: src/core/, tests/core/

### Description
**Problem:** model-catalog.ts:234 mergeFromCatalog bundled+remote'u `id` ile eşleştiriyor. Bundled id='opus' (alias), remote models.dev id='claude-opus-4-8' (apiId) → eşleşmiyor → remote entry ayrı ekleniyor, bundled 'opus' apiId güncellenmiyor. Sprint 207'de bundled elle 4-8 yapıldı ama canlı merge hâlâ bozuk.
**Çözüm:** Merge eşleşmesini apiId-aware yap: remote entry'yi bundled'a hem id hem apiId üzerinden eşle (remote apiId === bundled apiId VEYA remote id === bundled apiId). Eşleşen bundled entry'nin apiId/fiyat/contextWindow'unu remote ile güncelle, alias id'yi koru. Eşleşmezse yeni entry.
**Kanıt:** `grep -c "apiId.*===\|matchByApiId\|apiId.*match" src/core/model-catalog.ts` → ≥1; `npx vitest run tests/core/catalog-merge-id.test.ts` → 4+ pass
**Test:** ≥4 (apiId eşleşme bundled günceller, alias id korunur, eşleşmeyen yeni entry, idempotent)

## Task 2: 208-002 — CLI sabit sayı çıktıları parametrik (agent/skill/tool count)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert, code-simplifier
- Files: src/cli/commands/help.ts, tests/cli/help-dynamic-counts.test.ts
- Scope: src/cli/, tests/cli/

### Description
**Problem:** CLI/help çıktılarında "15 agent", "21 skill", "31/32 tool" gibi sabit sayılar olabilir — zero-hardcode ihlali. Gerçek sayı runtime registry'den gelmeli.
**Çözüm:** help.ts (ve varsa benzer çıktı) sabit sayıları `agentPool.loadAgents().size` / `skillPool.loadSkills().size` / MCP tool registry count'tan parametrik üret. `grep -rn "15 agent\|21 skill\|3[12] tool" src/cli/` ile bul. Hiç sabit yoksa "verified: parametrik" de, uydurma.
**Kanıt:** `grep -rcn "15 built-in\|21 skill\|31 tool\|32 tool" src/cli/commands/help.ts` → 0 (veya parametrik); `npx vitest run tests/cli/help-dynamic-counts.test.ts` → 4+ pass
**Test:** ≥4 (agent count dinamik, skill count dinamik, tool count dinamik, registry boşsa graceful)

## Task 3: 208-003 — Model distribution çıktısı brain-context parametrik
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/orchestra/brain-context.ts, tests/orchestra/brain-context-model-label.test.ts
- Scope: src/orchestra/, tests/orchestra/

### Description
**Problem:** "Model distribution" çıktısı (Sprint 207'de cost-calculator düzeltildi) brain-context.ts'te de model adı basıyor olabilir — registry'den parametrik değilse stale.
**Çözüm:** brain-context.ts model-label üretimini registry canlı apiId'sinden al. Sabit/fallback model string varsa kaldır. cost-calculator (207-003) pattern'ini izle.
**Kanıt:** `grep -c "registry\|modelRegistry\|\.apiId\|getModel" src/orchestra/brain-context.ts` → ≥1; `npx vitest run tests/orchestra/brain-context-model-label.test.ts` → 4+ pass
**Test:** ≥4 (label canlı registry, bilinmeyen model graceful, tier doğru, provider prefix)

## Task 4: 208-004 — Zero-hardcode audit raporu + lint guard
- Model: sonnet
- Effort: normal
- Skills: typescript-expert, code-simplifier
- Files: scripts/zero-hardcode-audit.mjs, tests/scripts/zero-hardcode-audit.test.ts
- Scope: scripts/, tests/scripts/

### Description
**Problem:** Zero-hardcode kalıcı korunmalı — yeni hardcoded model/sürüm/sayı eklenmesini önleyecek bir denetim yok.
**Çözüm:** `zero-hardcode-audit.mjs` — src/ taranıp hardcoded model-version string'leri (`claude-opus-4-X`, `claude-sonnet-4-X` literal'leri, model-registry.ts + test dışı) tespit eden lint script. Bulursa exit 1 + liste. CI guard. Mevcut meşru yerleri (bundled snapshot) allowlist'le.
**Kanıt:** `node scripts/zero-hardcode-audit.mjs` → çalışır (0 ihlal veya allowlist'li); `npx vitest run tests/scripts/zero-hardcode-audit.test.ts` → 4+ pass
**Test:** ≥4 (ihlal tespit, allowlist muaf, temiz→exit0, kirli→exit1)

---

## DALGA B — F3 Process Mode / Otonom Mod Temeli (4 task)

## Task 5: 208-005 — Flow scheduler runtime daemon (tick loop)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/core/flow-runtime.ts, tests/core/flow-runtime.test.ts
- Scope: src/core/, tests/core/

### Description
**Problem:** flow-scheduler.collectDue (Sprint 207) var ama periyodik çağıran runtime yok. Otonom mod için tick-loop gerek.
**Çözüm:** `flow-runtime.ts` — `FlowRuntime` class: start/stop, configurable interval tick → collectDue çağır → due dispatch'leri callback'e ver. Gerçek setInterval ama test-edilebilir (injectable clock/tick). flow-scheduler + flow-registry import. ≤200 LoC.
**Kanıt:** `grep -c "FlowRuntime\|tick\|collectDue\|start\|stop" src/core/flow-runtime.ts` → ≥3; `npx vitest run tests/core/flow-runtime.test.ts` → 4+ pass
**Test:** ≥4 (tick due dispatch, start/stop, interval, boş registry)

## Task 6: 208-006 — Self-dispatch protokol iskelet (otonom sprint tetikleme)
- Model: opus
- Effort: normal
- Skills: typescript-expert, system-architect
- Files: src/core/self-dispatch.ts, tests/core/self-dispatch.test.ts
- Scope: src/core/, tests/core/
- Dependencies: 208-005

### Description
**Problem:** OTONOM MOD kuzey-yıldızı: deckent kendi sprintlerini tetikleyebilmeli. Şu an yok.
**Çözüm:** İSKELET — `self-dispatch.ts`: `SelfDispatchPolicy` tipi (trigger: scheduled|event|threshold, action: plan|start, guard: requiresApproval) + `evaluateDispatch(policy, context)` → dispatch kararı (ama GERÇEK start ÇAĞIRMAZ — sadece karar + guard). **requiresApproval default TRUE** (kullanıcı onay kuralı korunur). flow-runtime ile entegre. ≤200 LoC.
**Kanıt:** `grep -c "SelfDispatchPolicy\|evaluateDispatch\|requiresApproval" src/core/self-dispatch.ts` → ≥3; `npx vitest run tests/core/self-dispatch.test.ts` → 4+ pass
**Test:** ≥4 (scheduled dispatch karar, requiresApproval guard bloke, threshold trigger, event trigger)

## Task 7: 208-007 — deckent flow run CLI (scheduled flow manuel tetik)
- Model: sonnet
- Effort: low
- Skills: typescript-expert
- Files: src/cli/commands/flow.ts, tests/cli/flow-run-command.test.ts
- Scope: src/cli/, tests/cli/

### Description
**Problem:** flow-runtime var ama CLI'dan tetiklenemiyor.
**Çözüm:** `deckent flow run [--once]` komutu ekle (flow.ts'e, register pattern) → flow-runtime tick bir kez çalıştır (--once) veya daemon başlat. Mevcut flow list/add korunur.
**Kanıt:** `grep -c "run\|flow-runtime\|FlowRuntime\|tick" src/cli/commands/flow.ts` → ≥2; `npx vitest run tests/cli/flow-run-command.test.ts` → 3+ pass
**Test:** ≥3 (run --once tick, daemon start, boş registry)

## Task 8: 208-008 — Tenant runtime context wire (multi-tenant izolasyon aktif)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert, system-architect
- Files: src/core/tenant-context.ts, tests/core/tenant-runtime.test.ts
- Scope: src/core/, tests/core/

### Description
**Problem:** tenant-context.ts (Sprint 204) tip+resolver iskeleti ama runtime path-scoping aktif değil.
**Çözüm:** tenant-context'e `withTenant(tenantId, fn)` + `currentTenant()` runtime helper ekle — tenant-scoped path resolution aktif (`.deckent/tenants/<id>/`). flow-registry + audit-query bunu kullanabilsin (wire noktası). İskelet→runtime. ≤200 LoC.
**Kanıt:** `grep -c "withTenant\|currentTenant\|isolationRoot\|tenantPath" src/core/tenant-context.ts` → ≥2; `npx vitest run tests/core/tenant-runtime.test.ts` → 4+ pass
**Test:** ≥4 (withTenant scope, currentTenant default, path izolasyon, nested tenant)

---

## DALGA C — F4 Enterprise (4 task)

## Task 9: 208-009 — RBAC role hierarchy + permission matrix tamamla
- Model: sonnet
- Effort: normal
- Skills: typescript-expert, security-specialist
- Files: src/core/rbac.ts, tests/core/rbac-hierarchy.test.ts
- Scope: src/core/, tests/core/

### Description
**Problem:** rbac.ts (Sprint 206) temel can/Role/Permission var ama role hierarchy (admin>operator>viewer inheritance) + tam permission matrix eksik.
**Çözüm:** Role hierarchy ekle — admin operator'ün tüm izinlerini, operator viewer'ınkini kapsar. Permission matrix genişlet (sprint:read/write, audit:read, flow:manage, tenant:admin). `inheritsFrom` veya level-based. ≤200 LoC.
**Kanıt:** `grep -c "hierarchy\|inheritsFrom\|level\|admin.*operator\|PERMISSION_MATRIX" src/core/rbac.ts` → ≥2; `npx vitest run tests/core/rbac-hierarchy.test.ts` → 4+ pass
**Test:** ≥4 (admin inherits operator, viewer minimal, unknown role deny, matrix completeness)

## Task 10: 208-010 — Flow-registry RBAC gate (flow:manage izni)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert, security-specialist
- Files: src/core/flow-registry.ts, tests/core/flow-registry-rbac.test.ts
- Scope: src/core/, tests/core/
- Dependencies: 208-009

### Description
**Problem:** flow-registry CRUD (Sprint 205) erişim kontrolsüz. F4 enterprise için RBAC gate gerek.
**Çözüm:** flow-registry add/remove/enable işlemlerine `can(role, 'flow:manage', tenantId)` gate ekle. list/get read-only → viewer izni. rbac.ts import. İskelet→wire.
**Kanıt:** `grep -c "can(\|rbac\|flow:manage\|Role" src/core/flow-registry.ts` → ≥2; `npx vitest run tests/core/flow-registry-rbac.test.ts` → 4+ pass
**Test:** ≥4 (operator add izin, viewer add reddi, viewer list izin, admin tümü)

## Task 11: 208-011 — Audit event yazım API (query'nin yazma tarafı)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert, security-specialist
- Files: src/core/audit-writer.ts, tests/core/audit-writer.test.ts
- Scope: src/core/, tests/core/

### Description
**Problem:** audit-query (Sprint 205) okuma var ama yapılandırılmış audit-event yazımı (tenant+action+actor+timestamp) ayrı API olarak yok — event-stream'e dağınık.
**Çözüm:** `audit-writer.ts` — `writeAuditEvent({tenantId, actor, action, target, metadata})` yapılandırılmış audit kaydı (audit-query'nin okuduğu formatla uyumlu). HMAC chain'e dokunma (mevcut). audit-query ile round-trip uyumlu. ≤200 LoC.
**Kanıt:** `grep -c "writeAuditEvent\|AuditEvent\|tenantId\|actor" src/core/audit-writer.ts` → ≥3; `npx vitest run tests/core/audit-writer.test.ts` → 4+ pass
**Test:** ≥4 (event yaz, query round-trip, tenant alan, zorunlu alan validasyon)

## Task 12: 208-012 — Enterprise config schema (tenant + rbac + flow ayarları)
- Model: sonnet
- Effort: low
- Skills: typescript-expert
- Files: src/core/enterprise-config.ts, tests/core/enterprise-config.test.ts
- Scope: src/core/, tests/core/

### Description
**Problem:** F4 enterprise özellikleri (multi-tenant, rbac, flow) config'te yapılandırılamıyor.
**Çözüm:** `enterprise-config.ts` — `EnterpriseConfig` tip + parse/validate (tenancy.enabled, rbac.enabled, rbac.defaultRole, flow.maxConcurrent). Default güvenli (hepsi opt-in false). config.ts merge pattern'i izle (dokunma, ayrı modül). ≤200 LoC.
**Kanıt:** `grep -c "EnterpriseConfig\|tenancy\|rbac\|parseEnterprise" src/core/enterprise-config.ts` → ≥3; `npx vitest run tests/core/enterprise-config.test.ts` → 4+ pass
**Test:** ≥4 (default opt-in false, parse geçerli, geçersiz reddi, partial merge)

---

## DALGA D — F5 Evrimsel + Hijyen (4 task)

## Task 13: 208-013 — Prompt-evolution iskelet (outcome→prompt tuning)
- Model: opus
- Effort: normal
- Skills: typescript-expert, anthropic-sdk
- Files: src/orchestra/prompt-evolution.ts, tests/orchestra/prompt-evolution.test.ts
- Scope: src/orchestra/, tests/orchestra/

### Description
**Problem:** F5 evrimsel mimari — deckent worker prompt'larını outcome'a göre evrimleştirmeli. Şu an yok (ROADMAP F5-001 "0 caller").
**Çözüm:** İSKELET — `prompt-evolution.ts`: `evolvePrompt(basePrompt, outcomes)` → outcome pattern'lerinden (başarı/başarısızlık) prompt iyileştirme önerisi (ekleme/vurgu). Gerçek LLM çağrısı DEĞİL, kural-temelli + outcome-tracker entegrasyon noktası. ≤200 LoC.
**Kanıt:** `grep -c "evolvePrompt\|PromptEvolution\|outcome" src/orchestra/prompt-evolution.ts` → ≥2; `npx vitest run tests/orchestra/prompt-evolution.test.ts` → 4+ pass
**Test:** ≥4 (başarı pattern güçlendir, başarısızlık uyarı ekle, boş outcome no-op, idempotent)

## Task 14: 208-014 — Adaptive-agent wire (runtime agent adaptation aktif)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/agents/adaptive-agent.ts, tests/agents/adaptive-agent-wire.test.ts
- Scope: src/agents/, tests/agents/

### Description
**Problem:** adaptive-agent.ts var ama runtime'da çağrılmıyor olabilir (F5 dormant wire). Outcome-based agent adaptation aktif değil.
**Çözüm:** adaptive-agent'ın çağrı noktasını bul (`grep -rn adaptive-agent src/`); 0-caller ise outcome-tracker veya routing-engine'den wire et VEYA adaptation logic'ini netleştir + test. Honest: zaten wire'lıysa "verified wired" + caller kanıtı. ≤200 LoC.
**Kanıt:** `grep -rc "adaptive-agent\|adaptAgent\|AdaptiveAgent" src/ | grep -v test` → caller ≥1; `npx vitest run tests/agents/adaptive-agent-wire.test.ts` → 4+ pass
**Test:** ≥4 (adaptation tetik, no-op koşul, outcome entegrasyon, idempotent)

## Task 15: 208-015 — docker-backend e2e izolasyon kalıcı fix
- Model: sonnet
- Effort: normal
- Skills: typescript-expert, ci-testing
- Files: tests/e2e/docker-backend.test.ts
- Scope: tests/e2e/

### Description
**Problem:** docker-backend.test.ts tam-suite'te ara-sıra flaky (kill/list state, Sprint 207'de geçti ama izolasyon kırılgan). Kalıcı çözüm gerek.
**Çözüm:** State izolasyonunu sağlamlaştır — her test kendi registry/mock instance'ı, beforeEach+afterEach tam reset, paylaşılan global state YOK. Test-only, kaynak DEĞİŞTİRME. Tam-suite + izole stabil geçsin.
**Kanıt:** `npx vitest run tests/e2e/docker-backend.test.ts` → PASS (3 ardışık çalıştırmada stabil); tam-suite fail listesinde YOK
**Test:** mevcut 36 test stabil pass (flaky değil)

## Task 16: 208-016 — ADR-071 (F3 Otonom Mod + F4 Enterprise mimari) + ROADMAP
- Model: sonnet
- Effort: low
- Skills: documentation-writer, system-architect
- Files: docs/adr/071-autonomous-enterprise.md, docs/ROADMAP-GOD-LEVEL.md, tests/docs/adr-071.test.ts
- Scope: docs/, tests/docs/

### Description
**Problem:** F3 otonom mod (self-dispatch + flow runtime) + F4 enterprise (RBAC hierarchy + multi-tenant + audit-writer) kararları ADR'ye geçmemiş; ROADMAP F3/F4/F5 ilerleme yansımıyor.
**Çözüm:** ADR-071 taslağı (otonom mod self-dispatch guard-based + enterprise RBAC/tenant/audit, MADR, status: proposed). ROADMAP §EXECUTION TRACKER: F3 process mode runtime DONE, F4-001/002 RBAC+audit, F5-001/002 prompt-evolution+adaptive wire; zero-hardcode TAM; yüzde güncelle.
**Kanıt:** `grep -c "autonomous\|self-dispatch\|rbac\|tenant\|enterprise" docs/adr/071-autonomous-enterprise.md` → ≥3; `npx vitest run tests/docs/adr-071.test.ts` → 3+ pass
**Test:** ≥3 (ADR-071 MADR yapı, otonom+enterprise bölüm, ROADMAP güncel)

---

## Sprint Sonu Notu

**Beklenen:** 14-16/16 DONE. **BÜYÜK ÖLÇEK TESTİ:** 16 task tek sprint — Brain sağlam olduğu için 0 false-FIX bekleniyor (Sprint 207 kanıtladı). Sprint 208 = zero-hardcode TAM (catalog merge + CLI parametrik + lint guard) + F3 otonom-mod temeli (flow runtime + self-dispatch guard'lı) + F4 enterprise (RBAC hierarchy + tenant runtime + audit-writer + config) + F5 evrimsel başlangıç (prompt-evolution + adaptive-agent wire) + docker flaky kalıcı.

**Otonom mod NOTU:** self-dispatch `requiresApproval` default TRUE — deckent karar verebilir ama sprint-başlatma hâlâ insan onayı gerektirir (kullanıcı kuralı korunur). Otonom mod YETENEĞİ inşa ediliyor, otomatik çalıştırma DEĞİL.

**Sprint sonrası:** F3 otonom mod canlı test + F4 enterprise tamamla + F5 evrimsel runtime. ROADMAP §EXECUTION TRACKER.

**Pre-flight:** subscription env temiz, creds canlı, **build+restart YAPILDI (zero-hardcode opus-4-8 canlı, Brain-fix canlı)**, config max_workers=10. Sprint start'ı Alperen manuel çalıştırır.

İlgili memory:
- [[feedback_scale_up_autonomous]] — büyük ölçek, otonom mod hedefi
- [[feedback_brain_rubric_bridge_broken]] — ✅ÇÖZÜLDÜ, yeni test dosyası coverage muafiyeti şart
- [[feedback_zero_hardcode_live_data]] — zero-hardcode TAM, DALGA A
- [[feedback_trust_brain_eval_not_worker]] — disk-verify ground truth
- [[feedback_build_mcp_restart_coordination]] — build+restart Alperen yapar
- [[project_api_mode_deferred_post_beta]] — API mode yasak
