# DIRECTIVES — Sprint 171: Self-Audit Mega-Sprint

## Spec + Plan Referansları

- **Spec:** `docs/superpowers/specs/2026-05-15-sprint-171-self-audit-design.md` (Alperen onaylı, commit `59818a6`)
- **Plan (bağlayıcı kontrat):** `docs/superpowers/plans/2026-05-15-sprint-171-self-audit-plan.md` (commit `4d16762`) — her worker kendi Task bölümünü + ortak **Worker Contract** bölümünü mutlaka okur. Ayrıntılı per-task audit runbook + okunacak kaynak dosya listesi orada.
- **Predecessor:** Sprint 170 GO_WITH_TECH_DEBT (`5ffbf3e`), bootstrap fix `5436497` (runtime aktif: `npm run build` + MCP restart yapıldı 2026-05-15).
- **Successor:** Sprint 172 OSS GA — bu audit'in bulgu defteri + doc-reorg planı + AEGIS (ADR-061) manifestosu girdisi.

## Goal

Bootstrap fix runtime aktifken deckent'in 29 audit-only worker ile kendini tam-kapsamlı denetlemesi. İki hedef: (1) Meta-dogfood ispatı — spurious NO_GO 2-katmanlı RC fix production'da çalışıyor, 0 cascade; (2) OSS GA bulgu defteri — kod + doküman + DB doğruluk/gereklilik/içerik/referans denetimi, Sprint 172 public flip öncesi prioritized backlog + kusursuz doküman yapısı temeli. "1 virgül bile görülmemiş olmamalı" — her kaynak dosya tam 1 modül-task'a ait, coverage-map ile mekanik ispat.

## Brain Planning Instructions

Mode: structured yeterli (bootstrap fix runtime aktif, cascade beklenmiyor — AI planlama gerekmez). Wave yapısı: 5 wave (Wave 1 = 8 paralel, Wave 2 = 8, Wave 3 = 8, Wave 4 = 4, Wave 5 = 1 synthesis). Max workers: 8. `dependency_pipeline_enabled: false` olduğundan Wave geçişleri + Task 29 synthesis dispatch Brain manuel (ADR-047, Sprint 164-168 kanıtlı) — Wave 4 tüm DONE doğrulanmadan Task 29 spawn edilmez. Alperen review: sprint başlangıç (plan tablosu) + finalize 2 checkpoint. Provider: claude (OPENAI/GOOGLE key yok).

## Worker Contract

Tüm worker'lar plan dosyasındaki kendi Task bölümünü + ortak **Worker Contract**'ı mutlaka okur (bağlayıcı kontrat — bkz. Plan Referansları). Özet invariant:

- **Audit-only:** SADECE atanan tek `docs/audits/sprint-171/` raporu yazılır. Kaynak/test/config/db/md hiçbir dosya modify EDİLMEZ. TDD YOK, fix worker spawn YOK.
- **Çıktı dili ZORUNLU Türkçe** (kullanıcı reinforced 2026-05-15, ATLANMAZ): raporun tüm içeriği insan-okur Türkçe, doğru orthography (ç/ğ/ı/ö/ş/ü); teknik terim/identifier orijinal kalır. Hedef: deckent'i tanımayan mühendis raporu okuyup aksiyona geçebilmeli.
- **Rapor şeması:** 4+1 bölüm — `## 1. Bulgular`, `## 2. Severity`, `## 3. Kanıt` (≥1 `file:line`), `## 4. Öneriler`, `## 5. Kapsam Haritası` (sadece modül-derin Task 1-14). Bir bölüm eksik/kanıtsız = task NO_GO.
- **DB kuralı:** memory.db SADECE read-only `SELECT`. Yazma/DROP/rebuild KESİN YASAK.
- `.tasks/task-<id>.result`: `selfAssessment: DONE`, `coverage: null` (audit task), `filesChanged` tek rapor.

---

## Task 1: orchestra Lifecycle Audit

- Model: opus
- Effort: normal
- Skills: system-architect
- Agent: architect
- Files: docs/audits/sprint-171/orchestra-lifecycle.md
- Scope: docs/audits/sprint-171/

### Description

orchestra yaşam döngüsü modüllerinin (sprint-controller, brain, planner, task-builder, result-evaluator, result-collector, sprint-reporter, sprint-utils, decision-steps) char-level denetimi. Faz akışı kontrat ile tutarlı mı, ADR-008 import tek-yön + circular dependency, ADR-046/045/043/048 kod enforcement, bootstrap fix P0-1/P0-2 semantiği aktif mi, dead code, eksik prosedür. Çıktı raporu TÜM içeriğiyle insan-okur Türkçe yazılır (ZORUNLU). Plan dosyasının Task 171-001 bölümü bağlayıcı runbook'tur — okunacak tam kaynak dosya listesi + audit boyutları orada. Kapsam Haritası tablosu (her dosya + LoC) zorunlu.

**Kanıt:** `docs/audits/sprint-171/orchestra-lifecycle.md` mevcut, 4+1 bölüm dolu, Türkçe, ≥1 file:line kanıt + Kapsam Haritası tam.

**Test:** Audit-only — kod/test yazımı yok; rapor self-review (4+1 bölüm + Türkçe + kanıt + kapsam).

---

## Task 2: orchestra Routing + Evaluation Audit

- Model: opus
- Effort: normal
- Skills: typescript-expert
- Agent: architect
- Files: docs/audits/sprint-171/orchestra-routing.md
- Scope: docs/audits/sprint-171/

### Description

orchestra routing/evaluation modüllerinin (task-router, outcome-tracker, quality-assessor, mid-sprint-adapter, rule-evolver, debt-manager, rubric-registry) denetimi. rubric-registry isAuditTask/coverageOptional mantığı + `docs/audits` hardcoded konvansiyon vs kullanıcı zihin modeli uyumsuzluğu (CRITICAL doc-vs-code drift), debt-manager rotateModelForFix fix-model-downgrade tasarım hatası (kanıtla + öneri), 6-level routing, learning bonus race, dead code. Çıktı raporu TÜM içeriğiyle insan-okur Türkçe (ZORUNLU). Plan Task 171-002 bölümü bağlayıcı runbook. Kapsam Haritası zorunlu.

**Kanıt:** `docs/audits/sprint-171/orchestra-routing.md` mevcut, 4+1 bölüm dolu, Türkçe, ≥1 file:line + Kapsam Haritası.

**Test:** Audit-only — rapor self-review.

---

## Task 3: orchestra Infra Audit

- Model: opus
- Effort: normal
- Skills: docker-expert
- Agent: devops-engineer
- Files: docs/audits/sprint-171/orchestra-infra.md
- Scope: docs/audits/sprint-171/

### Description

orchestra altyapı modüllerinin (tmux, spawn-backend, spawn-backend-docker, temp-skill-generator, promotion-pipeline, event-stream, file-lock, doc-updaters, managed-docs) denetimi. Sprint 170 P0-3 tmux taskId-aware fix aktif mi, P0-5 Docker race window closure aktif mi, P0-6 event stream PROMPT_WRITE/DELETE channel EKSİK mi (HIGH bulgu), ADR-027/048 enforcement, ADR-006 spawnSync güvenlik pattern, dead code. Çıktı raporu TÜM içeriğiyle insan-okur Türkçe (ZORUNLU). Plan Task 171-003 bölümü bağlayıcı runbook. Kapsam Haritası zorunlu.

**Kanıt:** `docs/audits/sprint-171/orchestra-infra.md` mevcut, 4+1 bölüm dolu, Türkçe, ≥1 file:line + Kapsam Haritası.

**Test:** Audit-only — rapor self-review.

---

## Task 4: core Types + Config Audit

- Model: opus
- Effort: normal
- Skills: typescript-expert
- Agent: architect
- Files: docs/audits/sprint-171/core-types-config.md
- Scope: docs/audits/sprint-171/

### Description

core tip ve config modüllerinin (types, *-types, config, model-registry, mode-presets, condition-evaluator, manifest-migrator) denetimi. config 3-layer merge + dependency_pipeline_enabled default kod gerçeği vs doküman "Sprint 167'den true" iddiası (CRITICAL doc-vs-code drift, kanıtla), model-registry 13 model doküman birebir mi, Task/Result interface kontrat tutarlılığı, condition-evaluator injection, kullanılmayan type export. Çıktı raporu TÜM içeriğiyle insan-okur Türkçe (ZORUNLU). Plan Task 171-004 bölümü bağlayıcı runbook. Kapsam Haritası zorunlu.

**Kanıt:** `docs/audits/sprint-171/core-types-config.md` mevcut, 4+1 bölüm dolu, Türkçe, ≥1 file:line + Kapsam Haritası.

**Test:** Audit-only — rapor self-review.

---

## Task 5: core Memory Subsystem Audit

- Model: opus
- Effort: normal
- Skills: database-migration
- Agent: data-engineer
- Files: docs/audits/sprint-171/core-memory.md
- Scope: docs/audits/sprint-171/

### Description

core bellek alt sisteminin (memory-store, memory-query, memory-normalize, memory-types, memory-export, memory-import) denetimi. insertRelation/getRelations API doğru mu (Sprint 169 C1), rebuild safety relations preserve + rollback contract (Sprint 169 C2 Bug Z3), ADR DB↔FS bi-directional hook idempotent mi (Sprint 169 H1), turkishNormalize TR/EN/DE edge case (ı/İ/ğ/ß), buildAutoQuery injection, dead code. Çıktı raporu TÜM içeriğiyle insan-okur Türkçe (ZORUNLU). Plan Task 171-005 bölümü bağlayıcı runbook. Kapsam Haritası zorunlu.

**Kanıt:** `docs/audits/sprint-171/core-memory.md` mevcut, 4+1 bölüm dolu, Türkçe, ≥1 file:line + Kapsam Haritası.

**Test:** Audit-only — rapor self-review.

---

## Task 6: core Pools + Routing Audit

- Model: opus
- Effort: normal
- Skills: typescript-expert
- Agent: architect
- Files: docs/audits/sprint-171/core-pools-routing.md
- Scope: docs/audits/sprint-171/

### Description

core havuz ve routing modüllerinin (agent-pool, skill-pool, skill-registry, provider, routing-engine, intent-classifier, activation-engine, builtins, marketplace, rule-templates, notify-adapters, notification-providers) denetimi. 15 agent + 21 skill doküman birebir mi, AST sandbox bypass riski, routeTaskV2 confidence + override resolution, exclude support, provider fallback chain (tek retry sonsuz döngü yok), dead code. Çıktı raporu TÜM içeriğiyle insan-okur Türkçe (ZORUNLU). Plan Task 171-006 bölümü bağlayıcı runbook. Kapsam Haritası zorunlu.

**Kanıt:** `docs/audits/sprint-171/core-pools-routing.md` mevcut, 4+1 bölüm dolu, Türkçe, ≥1 file:line + Kapsam Haritası.

**Test:** Audit-only — rapor self-review.

---

## Task 7: agents Audit

- Model: opus
- Effort: normal
- Skills: typescript-expert
- Agent: architect
- Files: docs/audits/sprint-171/agents.md
- Scope: docs/audits/sprint-171/

### Description

agents worker yürütme modüllerinin (worker, adaptive-agent + tüm 20 modül) denetimi. Task claim/file locking/heartbeat/result write doğruluğu, ADR-037 RBAC runtime scope enforcement aktif mi (scope dışına yazamaz), verify loop (max 3 deneme) kod gerçeği, ADR-035/047 enforcement, adaptive-agent race/state corruption, dead code, type safety. Çıktı raporu TÜM içeriğiyle insan-okur Türkçe (ZORUNLU). Plan Task 171-007 bölümü bağlayıcı runbook. Kapsam Haritası zorunlu.

**Kanıt:** `docs/audits/sprint-171/agents.md` mevcut, 4+1 bölüm dolu, Türkçe, ≥1 file:line + Kapsam Haritası.

**Test:** Audit-only — rapor self-review.

---

## Task 8: nervous Audit

- Model: opus
- Effort: normal
- Skills: system-architect
- Agent: architect
- Files: docs/audits/sprint-171/nervous.md
- Scope: docs/audits/sprint-171/

### Description

nervous proaktif meta-orchestrator modüllerinin (observer, detector-registry, decision-engine, proposer, dispatcher, executor, authority-matrix, runtime-scope-check, history, detectors) denetimi. ADR-040 mimari kod gerçeği vs doküman, observer→executor akışı kopuk halka, authority-matrix + runtime-scope-check ADR-037 RBAC enforcement gerçek mi, dead detector, history persist, eksik prosedür. Çıktı raporu TÜM içeriğiyle insan-okur Türkçe (ZORUNLU). Plan Task 171-008 bölümü bağlayıcı runbook. Kapsam Haritası zorunlu.

**Kanıt:** `docs/audits/sprint-171/nervous.md` mevcut, 4+1 bölüm dolu, Türkçe, ≥1 file:line + Kapsam Haritası.

**Test:** Audit-only — rapor self-review.

---

## Task 9: monitor + connectors Audit

- Model: opus
- Effort: normal
- Skills: typescript-expert
- Agent: architect
- Files: docs/audits/sprint-171/monitor-connectors.md
- Scope: docs/audits/sprint-171/

### Description

monitor (auditor scan loop, dashboard-manager, sprint-state) ve connectors (discord, telegram, whatsapp, incoming-router) modüllerinin denetimi. Auditor kaynak kod yazmaz garantisi kod düzeyinde mi, stale heartbeat/lock/boundary detection doğru mu (stale_heartbeat tekrar eden pattern RC), connector secret leakage + input validation, ADR-016 lifecycle, dead code. Çıktı raporu TÜM içeriğiyle insan-okur Türkçe (ZORUNLU). Plan Task 171-009 bölümü bağlayıcı runbook. Kapsam Haritası zorunlu.

**Kanıt:** `docs/audits/sprint-171/monitor-connectors.md` mevcut, 4+1 bölüm dolu, Türkçe, ≥1 file:line + Kapsam Haritası.

**Test:** Audit-only — rapor self-review.

---

## Task 10: providers + api Audit

- Model: opus
- Effort: normal
- Skills: api-builder
- Agent: api-builder
- Files: docs/audits/sprint-171/providers-api.md
- Scope: docs/audits/sprint-171/

### Description

providers (claude, codex, gemini adapter) ve api (HTTP server, SSE, rate limiting) modüllerinin denetimi. ADR-017 MCP-Native, fallback semantiği, API key yokken graceful mı, claude adapter event stream wire eksik mi, api auth/injection/DoS yüzeyi (OSS public öncesi kritik), dead code, type safety. Çıktı raporu TÜM içeriğiyle insan-okur Türkçe (ZORUNLU). Plan Task 171-010 bölümü bağlayıcı runbook. Kapsam Haritası zorunlu.

**Kanıt:** `docs/audits/sprint-171/providers-api.md` mevcut, 4+1 bölüm dolu, Türkçe, ≥1 file:line + Kapsam Haritası.

**Test:** Audit-only — rapor self-review.

---

## Task 11: mcp Audit

- Model: opus
- Effort: normal
- Skills: api-builder
- Agent: api-builder
- Files: docs/audits/sprint-171/mcp.md
- Scope: docs/audits/sprint-171/

### Description

mcp sunucu modüllerinin (server, 27 tool, 8 resource, helpers) denetimi. Tool/resource sayıları doküman birebir mi, input schema validation injection + path traversal (root param), deckent_kill/cleanup destructive Alperen-onay gate kod gerçeği, stdio transport, MCP server cache gotcha doküman vs kod, dead code. Çıktı raporu TÜM içeriğiyle insan-okur Türkçe (ZORUNLU). Plan Task 171-011 bölümü bağlayıcı runbook. Kapsam Haritası zorunlu.

**Kanıt:** `docs/audits/sprint-171/mcp.md` mevcut, 4+1 bölüm dolu, Türkçe, ≥1 file:line + Kapsam Haritası.

**Test:** Audit-only — rapor self-review.

---

## Task 12: cli Audit

- Model: opus
- Effort: normal
- Skills: typescript-expert
- Agent: architect
- Files: docs/audits/sprint-171/cli.md
- Scope: docs/audits/sprint-171/

### Description

cli komut modüllerinin (55+ komut, helpers, entry) denetimi. Komut sayısı doküman vs gerçek, register-pattern (ADR-012) tutarlı mı, ADR-010 tek runtime dependency ihlali, ADR-022-v2 CLI/MCP feature parity, recovery chain kod gerçeği, komut arg injection + path traversal, dead code. Çıktı raporu TÜM içeriğiyle insan-okur Türkçe (ZORUNLU). Plan Task 171-012 bölümü bağlayıcı runbook. Kapsam Haritası zorunlu.

**Kanıt:** `docs/audits/sprint-171/cli.md` mevcut, 4+1 bölüm dolu, Türkçe, ≥1 file:line + Kapsam Haritası.

**Test:** Audit-only — rapor self-review.

---

## Task 13: dashboard Audit

- Model: opus
- Effort: normal
- Skills: react-specialist
- Agent: frontend-designer
- Files: docs/audits/sprint-171/dashboard.md
- Scope: docs/audits/sprint-171/

### Description

dashboard React+Vite+Tailwind modüllerinin (7 sayfa, component, analytics, api) denetimi. Build CI gate mevcut + doğru mu, accessibility WCAG (semantic HTML, ARIA, keyboard, kontrast — OSS öncesi temel), XSS yüzeyi (React ham HTML enjeksiyon prop'u, sanitize edilmemiş SSE/API render), client bundle secret expose, dead component, type safety. Çıktı raporu TÜM içeriğiyle insan-okur Türkçe (ZORUNLU). Plan Task 171-013 bölümü bağlayıcı runbook. Kapsam Haritası zorunlu.

**Kanıt:** `docs/audits/sprint-171/dashboard.md` mevcut, 4+1 bölüm dolu, Türkçe, ≥1 file:line + Kapsam Haritası.

**Test:** Audit-only — rapor self-review.

---

## Task 14: extensions + scripts Audit

- Model: opus
- Effort: normal
- Skills: devops-engineer
- Agent: devops-engineer
- Files: docs/audits/sprint-171/extensions-scripts.md
- Scope: docs/audits/sprint-171/

### Description

VS Code extension host ve script dizini (45 dosya) denetimi. Extension activation/command registration/workspace-trust güvenlik, her script ne yapıyor + çağrılıyor mu (dead script) + shell injection + hardcoded path/secret, Sprint 169 memory scriptleri idempotent + db-silmek-yasak ihlali yok mu, secret-baseline 10 pattern doğru mu, eksik prosedür. Çıktı raporu TÜM içeriğiyle insan-okur Türkçe (ZORUNLU). Plan Task 171-014 bölümü bağlayıcı runbook. Kapsam Haritası zorunlu.

**Kanıt:** `docs/audits/sprint-171/extensions-scripts.md` mevcut, 4+1 bölüm dolu, Türkçe, ≥1 file:line + Kapsam Haritası.

**Test:** Audit-only — rapor self-review.

---

## Task 15: Dead Code + ESM Hygiene Audit

- Model: opus
- Effort: normal
- Skills: code-simplifier
- Agent: refactorer
- Files: docs/audits/sprint-171/dead-code.md
- Scope: docs/audits/sprint-171/

### Description

Tüm kaynak tabanında cross-cutting ölü kod denetimi: hiçbir yerden import edilmeyen export, ulaşılamaz dal (erken return/throw sonrası, if-false), ESM `.js` uzantı eksiği (ADR-002 Node16 — derleme kırığı riski), import cycle + aşırı depth, `_` prefix susturulmuş unused var. Her aday için SİL/KORU önerisi (ADR-038 dispose formatı). Çıktı raporu TÜM içeriğiyle insan-okur Türkçe (ZORUNLU). Plan Task 171-015 bölümü bağlayıcı runbook (cross-cut — Kapsam Haritası yok).

**Kanıt:** `docs/audits/sprint-171/dead-code.md` mevcut, 4+1 bölüm dolu, Türkçe, her aday file:line kanıtlı.

**Test:** Audit-only — rapor self-review.

---

## Task 16: ADR Compliance Audit

- Model: opus
- Effort: normal
- Skills: system-architect
- Agent: architect
- Files: docs/audits/sprint-171/adr-compliance.md
- Scope: docs/audits/sprint-171/

### Description

46+ accepted ADR'nin her biri için kod enforcement var mı yoksa sadece doküman mı (tablo: ADR-ID | Enforced? | Kanıt file:line | Drift). Öncelikli drift adayları: ADR-045 dependency_pipeline_enabled config false vs doküman true, ADR-046 bi-directional hook, ADR-048 prompt lifecycle, ADR-008 import tek-yön, ADR-037 RBAC, ADR-006 spawnSync. ADR DB↔FS 3'lü tutarlılık (export vs md dosya vs DB count). proposed ADR kısmi implement mi. En ciddi drift CRITICAL. Çıktı raporu TÜM içeriğiyle insan-okur Türkçe (ZORUNLU). Plan Task 171-016 bölümü bağlayıcı runbook (cross-cut — Kapsam Haritası yok).

**Kanıt:** `docs/audits/sprint-171/adr-compliance.md` mevcut, 4+1 bölüm dolu, Türkçe, her ADR satırı kanıtlı.

**Test:** Audit-only — rapor self-review.

---

## Task 17: Security Audit

- Model: opus
- Effort: normal
- Skills: security-specialist
- Agent: security-auditor
- Files: docs/audits/sprint-171/security.md
- Scope: docs/audits/sprint-171/

### Description

Tüm kaynak + script + config'te OWASP top 10 cross-cutting denetimi. Command injection (tüm spawnSync/exec array-arg mı, ADR-006 ihlali CRITICAL), path traversal (root/taskId/dosya param sanitize, `../` escape), secret leakage (hardcoded key/token, log, client bundle, .deck ADR-014), secret-baseline yeterli mi, commit'lenmiş secret riski (OSS public öncesi kritik). Çıktı raporu TÜM içeriğiyle insan-okur Türkçe (ZORUNLU). Plan Task 171-017 bölümü bağlayıcı runbook (cross-cut — Kapsam Haritası yok).

**Kanıt:** `docs/audits/sprint-171/security.md` mevcut, 4+1 bölüm dolu, Türkçe, her bulgu file:line kanıtlı.

**Test:** Audit-only — rapor self-review.

---

## Task 18: Performance Audit

- Model: opus
- Effort: normal
- Skills: performance-optimizer
- Agent: performance-analyzer
- Files: docs/audits/sprint-171/performance.md
- Scope: docs/audits/sprint-171/

### Description

Tüm kaynakta cross-cutting performans denetimi. Sync I/O sıcak döngüde (scan loop, evaluate, spawn — ADR-005 deprecated ile çelişki), memory leak (kapatılmayan handle, biriken Map/Set, listener leak), async anti-pattern (await-in-loop, unhandled promise, seri yerine Promise.all), N+1. Hot path öncelikli, ölçülebilir öneri. Çıktı raporu TÜM içeriğiyle insan-okur Türkçe (ZORUNLU). Plan Task 171-018 bölümü bağlayıcı runbook (cross-cut — Kapsam Haritası yok).

**Kanıt:** `docs/audits/sprint-171/performance.md` mevcut, 4+1 bölüm dolu, Türkçe, her bulgu file:line kanıtlı.

**Test:** Audit-only — rapor self-review.

---

## Task 19: Type Safety Audit

- Model: opus
- Effort: normal
- Skills: typescript-expert
- Agent: architect
- Files: docs/audits/sprint-171/type-safety.md
- Scope: docs/audits/sprint-171/

### Description

Tüm kaynakta cross-cutting tip güvenliği denetimi. any/unknown kullanımı (her `: any`/`as any`/`@ts-ignore`/`@ts-expect-error` file:line + risk), unsafe assertion (`as Foo` runtime kontrolsüz, aşırı non-null `!`), missing return type (implicit any), tsconfig kapalı strict flag, ADR-001 disiplini. Risk severity'li. Çıktı raporu TÜM içeriğiyle insan-okur Türkçe (ZORUNLU). Plan Task 171-019 bölümü bağlayıcı runbook (cross-cut — Kapsam Haritası yok).

**Kanıt:** `docs/audits/sprint-171/type-safety.md` mevcut, 4+1 bölüm dolu, Türkçe, her bulgu file:line kanıtlı.

**Test:** Audit-only — rapor self-review.

---

## Task 20: Error Handling Audit

- Model: opus
- Effort: normal
- Skills: typescript-expert
- Agent: architect
- Files: docs/audits/sprint-171/error-handling.md
- Scope: docs/audits/sprint-171/

### Description

Tüm kaynakta cross-cutting hata yönetimi denetimi. Yutulan hata (boş catch, log'suz catch, `.catch(()=>{})`), boundary try/catch eksiği (subprocess/dosya/JSON.parse/DB/network fail-safe yok), fail-safe/fallback pattern (kritik yollar ADR-035 Layer 4 fail-safe'li mi), hata yutmanın spurious NO_GO'ya katkısı (Sprint 169 RC ilişki). Kritik yol öncelikli. Çıktı raporu TÜM içeriğiyle insan-okur Türkçe (ZORUNLU). Plan Task 171-020 bölümü bağlayıcı runbook (cross-cut — Kapsam Haritası yok).

**Kanıt:** `docs/audits/sprint-171/error-handling.md` mevcut, 4+1 bölüm dolu, Türkçe, her bulgu file:line kanıtlı.

**Test:** Audit-only — rapor self-review.

---

## Task 21: Test Integrity Audit

- Model: opus
- Effort: normal
- Skills: ci-testing
- Agent: ci-guardian
- Files: docs/audits/sprint-171/test-integrity.md
- Scope: docs/audits/sprint-171/

### Description

Tüm test tabanı + vitest config + package.json cross-cutting bütünlük denetimi. 807 test gerçek coverage iddiası (89.33%) doğrulanabilir mi, flaky pattern (timer/sleep/sıra/race bağımlı), mock drift (mock export gerçek ile uyumsuz — Sprint 170 170-001 5 legacy literal-string fixture), kalıcı skip/`.only`/`.todo` sayımı, vitest baseline (pass ≥16475 + fail ≤2 + skip ≤41), dashboard test ayrı config. Çıktı raporu TÜM içeriğiyle insan-okur Türkçe (ZORUNLU). Plan Task 171-021 bölümü bağlayıcı runbook (cross-cut — Kapsam Haritası yok).

**Kanıt:** `docs/audits/sprint-171/test-integrity.md` mevcut, 4+1 bölüm dolu, Türkçe, her bulgu file:line kanıtlı.

**Test:** Audit-only — rapor self-review.

---

## Task 22: Memory V2 DB Integrity Audit

- Model: opus
- Effort: normal
- Skills: database-migration
- Agent: data-engineer
- Files: docs/audits/sprint-171/memory-db-integrity.md
- Scope: docs/audits/sprint-171/

### Description

core bellek modülleri + memory.db (read-only) + export'lar cross-cutting integrity denetimi. Schema 5 tablo + FTS5 + schema_version kontrat birebir mi, FTS5 8 sütun index drift, relations FK orphan + Sprint 169 C1 sonrası count>0 mı, decay doğruluğu + decay_exempt korunur mu, entry_history eksiksiz mi, DB-vs-export drift. memory.db SADECE read-only SELECT — yazma/DROP/rebuild KESİN YASAK. Çıktı raporu TÜM içeriğiyle insan-okur Türkçe (ZORUNLU). Plan Task 171-022 bölümü bağlayıcı runbook (cross-cut — Kapsam Haritası yok).

**Kanıt:** `docs/audits/sprint-171/memory-db-integrity.md` mevcut, 4+1 bölüm dolu, Türkçe, her bulgu file:line/SQL kanıtlı.

**Test:** Audit-only — rapor self-review.

---

## Task 23: Doc Audit Root

- Model: opus
- Effort: normal
- Skills: documentation-writer
- Agent: doc-writer
- Files: docs/audits/sprint-171/docs-root.md
- Scope: docs/audits/sprint-171/

### Description

Repo kök dizinindeki 21 markdown dosyanın (README, README-TR, CONTRIBUTING, SECURITY, CODE_OF_CONDUCT, VISION, VISION-TR, ROADMAP, BLUEPRINT, BETA-TRACKER, COMPETITIVE-ANALYSIS, CHANGELOG, AGENTS, NEXT-SESSION vd.) denetimi. Doğruluk (iddia vs kod gerçeği), gereklilik (mükerrer: README vs README-TR, VISION vs VISION-TR), içerik (eksik bölüm, ölü link, güncel olmayan tarih/sprint), referans geçerliliği. Her dosyaya 8-badge (core/necessary/guide/reference/info/internal/archive/deprecated) + gerekçe + SİL/BİRLEŞTİR/TAMAMLA/KORU + Sprint 172 reorg hedef. Çıktı raporu TÜM içeriğiyle insan-okur Türkçe (ZORUNLU). Plan Task 171-023 bölümü bağlayıcı runbook.

**Kanıt:** `docs/audits/sprint-171/docs-root.md` mevcut, 4+1 bölüm dolu, Türkçe, 21 dosya badge'li + kanıtlı.

**Test:** Audit-only — rapor self-review.

---

## Task 24: Doc Audit docs Tree

- Model: opus
- Effort: normal
- Skills: documentation-writer
- Agent: doc-writer
- Files: docs/audits/sprint-171/docs-tree.md
- Scope: docs/audits/sprint-171/

### Description

docs ağacındaki markdown dosyaların (adr, architecture, guide, reference, vision, governance, launch, release, development alt yapıları — audits ve superpowers/specs|plans hariç, recursion önle) denetimi. Yapı tutarlı mı, mükerrerlik (docs CHANGELOG vs root, docs ROADMAP vs root), her dosya doğruluk+gereklilik+içerik+referans, 8-badge + gerekçe. Sprint 172 reorg önerisi: ideal ağaç yapısı + dosya→hedef + hangi kök dosya docs'a taşınmalı (synthesis doc-reorg ana girdisi). Çıktı raporu TÜM içeriğiyle insan-okur Türkçe (ZORUNLU). Plan Task 171-024 bölümü bağlayıcı runbook.

**Kanıt:** `docs/audits/sprint-171/docs-tree.md` mevcut, 4+1 bölüm dolu, Türkçe, her dosya badge'li + reorg önerisi.

**Test:** Audit-only — rapor self-review.

---

## Task 25: Doc Audit Config Contract Rules

- Model: opus
- Effort: normal
- Skills: system-architect
- Agent: architecture-planner
- Files: docs/audits/sprint-171/docs-config-rules.md
- Scope: docs/audits/sprint-171/

### Description

3-ortam agent rule (claude/gemini/cursor), api-surface kontratı, CLAUDE.md, DECKENT.md, IDENTITY.md, BOOT.md denetimi. En kritik: kod gerçeği ile doğruluk — brain/auditor/worker kuralları kod davranışı ile uyumlu mu, CLAUDE.md mimari tablo modül sayıları gerçek mi, DECKENT.md agent/skill/tool sayıları gerçek mi, 3-ortam rule divergence, api-surface JSON şema + Sprint Phases birebir mi (WAVE_BUILD + dependency_pipeline notu doğru mu), IDENTITY metrik güncel mi. 8-badge (çoğu core), drift'ler CRITICAL (worker'ı yanıltır). Çıktı raporu TÜM içeriğiyle insan-okur Türkçe (ZORUNLU). Plan Task 171-025 bölümü bağlayıcı runbook.

**Kanıt:** `docs/audits/sprint-171/docs-config-rules.md` mevcut, 4+1 bölüm dolu, Türkçe, her drift kanıtlı.

**Test:** Audit-only — rapor self-review.

---

## Task 26: Doc Audit DB Sync Check

- Model: opus
- Effort: normal
- Skills: database-migration
- Agent: data-engineer
- Files: docs/audits/sprint-171/docs-dbsync.md
- Scope: docs/audits/sprint-171/

### Description

Sprint log (33), export'lar, legacy DEBT/MEMORY/RETRO/PATTERNS dosyaları ile memory.db (read-only) senkron diff denetimi (içerik audit DEĞİL). Sprint log içerik DB entry ile tutarlı mı, eksik sprint gap, Sprint 161 stub gerçek içerik geldi mi (Sprint 169 H2), auto-gen export stale mi, legacy dosyalar DB-first sonrası ölü mü. Sync drift tablosu + her dosya 8-badge (çoğu internal/archive) + sil/koru. memory.db SADECE read-only. Çıktı raporu TÜM içeriğiyle insan-okur Türkçe (ZORUNLU). Plan Task 171-026 bölümü bağlayıcı runbook.

**Kanıt:** `docs/audits/sprint-171/docs-dbsync.md` mevcut, 4+1 bölüm dolu, Türkçe, drift tablosu + badge.

**Test:** Audit-only — rapor self-review.

---

## Task 27: Doc Audit Archive Summary

- Model: opus
- Effort: normal
- Skills: documentation-writer
- Agent: doc-writer
- Files: docs/audits/sprint-171/docs-archive.md
- Scope: docs/audits/sprint-171/

### Description

Tüm arşiv dizinleri (brain archive, deckent archive, .audit, examples, deckent-hub, .test) dizin-bazlı özet denetimi (her dosya tam okuma DEĞİL — örnekleme). Her dizin: ne içeriyor, kaç dosya/KB, ne amaçla, son dokunma. .audit sprint-167/169 değerli bulgu var mı, examples/deckent-hub OSS'te gerekli mi, .test ölü mü. 8-badge (çoğu archive/internal) + dizin-bazlı SİL/TAŞI/KORU + .gitignore/.npmignore önerisi (OSS GA exclude). Çıktı raporu TÜM içeriğiyle insan-okur Türkçe (ZORUNLU). Plan Task 171-027 bölümü bağlayıcı runbook.

**Kanıt:** `docs/audits/sprint-171/docs-archive.md` mevcut, 4+1 bölüm dolu, Türkçe, dizin envanteri + badge + ignore önerisi.

**Test:** Audit-only — rapor self-review.

---

## Task 28: DB Decision Reference Integrity Audit

- Model: opus
- Effort: high
- Skills: database-migration
- Agent: data-engineer
- Files: docs/audits/sprint-171/db-decision-integrity.md
- Scope: docs/audits/sprint-171/

### Description

memory.db (read-only SELECT) her entry karar/referans bütünlüğü — "her bir kararı kontrol et". Her entries satırı zorunlu alan/status/sprint_id tutarlı mı, relations graph 6 MADR tip orphan + kopuk zincir + beklenen ama eksik relation (supersede edilen ADR hâlâ accepted mı), entry_history audit trail gap, kırık `[[ref]]` link hedefi, decay doğruluğu + decay_exempt, ADR DB↔FS 3'lü tutarlılık (Sprint 169 H1), ADR-009 DEBT tablo formatı. İhlaller severity'li, her biri SQL/file:line kanıtlı. memory.db yazma/DROP/rebuild KESİN YASAK. Çıktı raporu TÜM içeriğiyle insan-okur Türkçe (ZORUNLU). Plan Task 171-028 bölümü bağlayıcı runbook (cross-cut — Kapsam Haritası yok).

**Kanıt:** `docs/audits/sprint-171/db-decision-integrity.md` mevcut, 4+1 bölüm dolu, Türkçe, her ihlal SQL/file:line kanıtlı.

**Test:** Audit-only — rapor self-review.

---

## Task 29: Cross-Cutting Synthesis + Coverage Doğrulama

- Model: opus
- Effort: high
- Skills: system-architect
- Agent: architect
- Files: docs/audits/sprint-171/SYNTHESIS.md
- Scope: docs/audits/sprint-171/
- Dependencies: ["171-001","171-002","171-003","171-004","171-005","171-006","171-007","171-008","171-009","171-010","171-011","171-012","171-013","171-014","171-015","171-016","171-017","171-018","171-019","171-020","171-021","171-022","171-023","171-024","171-025","171-026","171-027","171-028"]

### Description

28 audit raporunu konsolide eden sentez (Brain manuel dispatch — Wave 4 tüm DONE sonrası, ADR-047). (1) Tüm bulguları topla+dedupe → tek severity-sıralı backlog. (2) OSS-GA blocker ayrı bölüm (secret leak, kullanıcı-yanıltan doc-vs-code drift, command injection). (3) AEGIS (ADR-061) hizalama — bulguları mode-agnostic AEGIS faz/rol/artifact terminolojisiyle çerçevele. (4) Sprint 172 doc-reorg planı (badge atamaları birleştir → ideal ağaç + dosya→hedef + ignore önerisi). (5) Coverage Doğrulama ZORUNLU: Task 1-14 Kapsam Haritası union vs `find` kaynak gerçeği diff → boşta dosya = CRITICAL coverage-gap, tablo (toplam/kapsanan/boşta). (6) Kapı 1 (orchestration) + Kapı 2 (içerik kalite) değerlendirme → Brain'e GO/GO_WTD/NO_GO önerisi. Çıktı raporu TÜM içeriğiyle insan-okur Türkçe (ZORUNLU). Plan Task 171-029 bölümü bağlayıcı runbook. Kapsam Doğrulama bölümü olmadan synthesis NO_GO.

**Kanıt:** `docs/audits/sprint-171/SYNTHESIS.md` mevcut, 6 alt bölüm dolu, Türkçe, coverage-gap tablosu + verdict önerisi.

**Test:** Audit-only — rapor self-review + coverage diff doğrulama.

---

## GO/NO_GO Criteria

**Dual-gate (spec §9):**

*Kapı 1 — Orchestration Health (sprint geneli):* 29/29 task `.result` yazdı; 0 cascade; 0 spurious NO_GO; 0 fix worker spawn; Auditor `git diff --stat` boundary ihlali = 0 (sadece `docs/audits/sprint-171/` değişti). Asıl ispat: bootstrap fix runtime aktif. Spurious NO_GO çıkarsa → fix runtime'da DEĞİL → `npm run build` + MCP restart sırası gözden geçir, sprint durdur.

*Kapı 2 — İçerik Kalite (task bazlı):* Her rapor 4+1 zorunlu bölüm + ≥1 `file:line` kanıt + Türkçe. Modül task'larda (1-14) Kapsam Haritası mevcut + coverage-gap = 0. Eşiği geçmeyen task = task NO_GO (synthesis'te raporlanır, orchestration'ı bozmaz).

*Sprint verdict:* **GO** = Kapı 1 tam + ≥27/29 Kapı 2 + coverage-gap 0. **GO_WITH_TECH_DEBT** = Kapı 1 tam + 24-26 Kapı 2 (≤5 yüzeysel re-audit backlog). **NO_GO** = Kapı 1 ihlali (cascade/spurious/boundary — bootstrap fix regresyon sinyali).

**Kritik bulguların doğası:** Bir audit task'ın CRITICAL bulgu raporlaması = başarılı audit, NO_GO DEĞİL. NO_GO sadece orchestration arızası.

## Sprint 172 OSS GA Handoff

Sprint 171 GO (full) → Sprint 172 OSS GA conditional açar: doc-reorg uygulaması (badge→/docs), `VerhexIO/deckent-dev → VerhexIO/deckent` public flip, `npm publish v1.0.0-beta.2` (Alperen onay), AEGIS manifestosu (ADR-061) public + Show HN. Sprint 171 GO_WTD → Sprint 172 conditional + 1 re-audit cycle. Sprint 171 NO_GO → bootstrap fix regresyon hotfix mikro-sprint, Sprint 172 ertelenir.
