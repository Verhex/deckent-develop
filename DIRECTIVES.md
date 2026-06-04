<!-- DIRECTIVES İZOLE: yalnız Sprint 226 (Completion Roadmap S1 — Otonom Runtime Wire / F3-009). -->
<!-- Diğer planlar arşivde + MASTER-PLAN'de (kayıp YOK):
       Sprint 224 (mostly-done dogfood) → .brain/archive/DIRECTIVES-sprint-224-dogfood.md
       Sprint 227 (platform/dormant backlog) → .brain/archive/DIRECTIVES-sprint-227-platform.md
       Tüm plan + AS-1..AS-6 derin tasarım + 10-sprint roadmap → docs/MASTER-PLAN.md (§4A-§4E, §4B, §10A)
       Başka sprint koşmak için: ilgili arşiv bölümünü buraya geri taşı (swap), sonra plan+start. -->

# DIRECTIVES — Sprint 226 (sıradaki/aday): Otonom Sürekli Runtime Wire (F3-009)

## Goal: **AI-System-Worker north-star'ın ilk gerçek adımı** ([[project_deckent_everyone_everywhere]] · [[feedback_scale_up_autonomous]] · MASTER-PLAN F3-009). `src/orchestra/autonomous-runtime.ts` **DI-iskelet** (Sprint 219-014): `runAutonomousCycle(config, deps)` döngüsü var (trigger→authority→approval→execute→audit) ama 5 adapter'ı (TriggerSource/AuthorityChecker/ApprovalGate/ActionExecutor/AuditSink) hep mock — **gerçek subsistemlere bağlı DEĞİL** (Sprint 220 başka yöne gitti, wire hiç inmedi). Bu sprint **5 gerçek adapter + sürekli loop + CLI** yazar; iskeleti dormant'tan çıkarır. **Otonom = uzun-yaşayan/event-driven, YETKİ-SINIRLI** mod (20dk sprint DEĞİL). **god-level, RUN-VERIFY, CI yeşil KORUNUR.**

Hedef modüller (hepsi diskte ✅, worker bunları SARAR — yeniden yazmaz): `src/orchestra/authority-enforcer.ts` `checkAuthority` (ADR-037 RBAC) · `src/orchestra/event-stream.ts` `writeEvent` (audit) · `src/nervous/executor.ts` `Executor`/`ActionHandler` (ADR-040 onay+aksiyon) · `src/core/scheduled-flow.ts` + `src/core/self-dispatch.ts` `evaluateDispatch` (F3 tetik).

## 🔴 GÜVENLİK ANKORU (ADR-037 + ADR-040 — pazarlık yok)
- **Default-deny + needs_approval:** otonom mod **hiçbir riskli aksiyonu insan onayı olmadan koşturmaz**. `authority='denied'`→dur; `needs_approval`→approval-gate (pending kalır, OTO-APPROVE YOK).
- **Otonom mod bir ÜRÜN-HEDEFİ** — Brain'in/benim **sprint-başlatma iznimi DEĞİŞTİRMEZ** ([[feedback_scale_up_autonomous]]). Bu sprint sadece runtime-altyapısını bağlar, kendi başına sprint başlatmaz.
- Her cycle **tam olarak 1 audit kaydı** yazar (denied/rejected/pending/executed/failed) — iz bırakmadan aksiyon YOK.

## Ortak kurallar
- **🟢 RUN-VERIFY ([[feedback_proof_of_function_dod]]):** kanıt **çağıran** dosyada (def `autonomous-runtime.ts` DIŞLA — wire'ı çağıran adapter/loop/CLI'da grep'le, [[feedback_directive_kanit_letter_vs_goal]]). Adapter Tier-0 (unit yeterli); CLI Tier-1 (`Smoke:` gerçek-binary şart).
- **🔴 HERMETİK ([[project_ci_green_root_causes]]):** tmpdir + sandbox HOME, **async spawn (spawnSync YASAK)**, `test:ci-sim` yeşil.
- ESM `.js`. Subscription (`env -u ANTHROPIC_API_KEY`). ≤200 LoC, YENİ TEST DOSYASI. **Sadece kendi filesWrite'ına yaz.** Wave-1 (T1–T5) paralel ayrık-dosya; Wave-2 (T6→T7) Wave-1'e bağlı.

---

## Task 1: 226-001 — Authority adapter (checkAuthority → AuthorityChecker)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert, security-specialist
- Files: src/orchestra/autonomous/authority-adapter.ts, tests/orchestra/autonomous-authority-adapter.test.ts
- Scope: src/orchestra/autonomous/, tests/orchestra/
### Description
`autonomous-runtime.ts` `AuthorityChecker.check(action, requestedBy): AuthorityDecision` interface'ini gerçek `authority-enforcer.checkAuthority(AuthorityCheckRequest): AuthorityCheckResult`'a SARAN adapter yaz. `makeAuthorityChecker()` → `checkAuthority` çağırır, sonucu `allowed|needs_approval|denied`'a maple. **Default-deny:** bilinmeyen/eşleşmeyen → `denied`. Caller adapter dosyasında (def `authority-enforcer.ts` DIŞLA).
**Kanıt:** `grep -c "checkAuthority" src/orchestra/autonomous/authority-adapter.ts` → ≥1 (ÇAĞRI); `npx vitest run tests/orchestra/autonomous-authority-adapter.test.ts` → 4+ pass
**Test:** ≥4 (allowed-map, needs_approval-map, denied-map, bilinmeyen→default-deny) — hermetik
**Smoke:** (Tier-0) unit yeterli.

## Task 2: 226-002 — Audit adapter (writeEvent → AuditSink)
- Model: sonnet
- Effort: low
- Skills: typescript-expert
- Files: src/orchestra/autonomous/audit-adapter.ts, tests/orchestra/autonomous-audit-adapter.test.ts
- Scope: src/orchestra/autonomous/, tests/orchestra/
### Description
`AuditSink.record(AuditRecord): void`'i gerçek `event-stream.writeEvent`'e SARAN adapter. `makeAuditSink(streamPath)` → her AuditRecord'u structured event olarak yazar (triggerId/action/requestedBy/outcome/reason/timestamp alanları korunur). Caller adapter dosyasında (def `event-stream.ts` DIŞLA). tmpdir stream path.
**Kanıt:** `grep -c "writeEvent" src/orchestra/autonomous/audit-adapter.ts` → ≥1 (ÇAĞRI); `npx vitest run tests/orchestra/autonomous-audit-adapter.test.ts` → 3+ pass
**Test:** ≥3 (record→event yazılır, alanlar korunur, tmpdir-izole) — hermetik (tmpdir stream)
**Smoke:** (Tier-0) unit yeterli.

## Task 3: 226-003 — Approval gate adapter (nervous Executor → ApprovalGate, OTO-APPROVE YOK)
- Model: opus
- Effort: normal
- Skills: typescript-expert, security-specialist
- Files: src/orchestra/autonomous/approval-adapter.ts, tests/orchestra/autonomous-approval-adapter.test.ts
- Scope: src/orchestra/autonomous/, tests/orchestra/
### Description
`ApprovalGate.request(trigger): Promise<ApprovalDecision>`'i nervous onay-kuyruğuna SARAN adapter. `makeApprovalGate(...)` → `needs_approval` tetiği **pending onay** olarak enqueue eder (nervous executor/pending pattern, 224-008 `getPendingNervous` ile uyumlu), **insan accept/reject edene kadar `pending` döner** (🔴 OTO-APPROVE KESİNLİKLE YOK). accept→`approved`, reject→`rejected`. Caller adapter dosyasında (def `executor.ts` DIŞLA).
**Kanıt:** `grep -c "Executor\|pending\|approval" src/orchestra/autonomous/approval-adapter.ts` → ≥2 (ÇAĞRI); `npx vitest run tests/orchestra/autonomous-approval-adapter.test.ts` → 4+ pass
**Test:** ≥4 (enqueue→pending, accept→approved, reject→rejected, **oto-approve-yok invariant**) — hermetik (tmpdir ipc)
**Smoke:** (Tier-0) unit yeterli.

## Task 4: 226-004 — Action executor adapter (ActionHandler registry → ActionExecutor)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/orchestra/autonomous/action-adapter.ts, tests/orchestra/autonomous-action-adapter.test.ts
- Scope: src/orchestra/autonomous/, tests/orchestra/
### Description
`ActionExecutor.execute(trigger): Promise<ActionResult>`'i nervous `ActionHandler` registry'sine SARAN adapter. `makeActionExecutor(handlers)` → trigger.action'a kayıtlı handler'ı bulur+koşturur, sonucu `{ok,result|error}`'a maple. **Kayıtlı handler yoksa → `{ok:false, error:'no handler'}`** (sessiz başarı YOK). Caller adapter dosyasında (def `executor.ts` DIŞLA).
**Kanıt:** `grep -c "ActionHandler\|handler\|execute" src/orchestra/autonomous/action-adapter.ts` → ≥2 (ÇAĞRI); `npx vitest run tests/orchestra/autonomous-action-adapter.test.ts` → 4+ pass
**Test:** ≥4 (handler-bulur→ok, handler-yok→fail, handler-throw→{ok:false,error}, payload-geçer) — hermetik
**Smoke:** (Tier-0) unit yeterli.

## Task 5: 226-005 — Trigger source adapter (scheduled-flow + self-dispatch → TriggerSource)
- Model: opus
- Effort: normal
- Skills: typescript-expert
- Files: src/orchestra/autonomous/trigger-adapter.ts, tests/orchestra/autonomous-trigger-adapter.test.ts
- Scope: src/orchestra/autonomous/, tests/orchestra/
### Description
`TriggerSource.next(): Promise<AutonomousTrigger|null>`'ı F3 `scheduled-flow` + `self-dispatch.evaluateDispatch`'e SARAN adapter. `makeTriggerSource(...)` → sırası gelen (due) scheduled-flow'u `AutonomousTrigger`'a (id/source/action/requestedBy/payload) çevirir; yoksa `null` (idle). `SelfDispatchPolicy` `requiresApproval` semantiği KORUNUR (guard düşmez). Caller adapter dosyasında (def `scheduled-flow.ts`/`self-dispatch.ts` DIŞLA).
**Kanıt:** `grep -c "evaluateDispatch\|scheduled\|Flow\|next" src/orchestra/autonomous/trigger-adapter.ts` → ≥2 (ÇAĞRI); `npx vitest run tests/orchestra/autonomous-trigger-adapter.test.ts` → 4+ pass
**Test:** ≥4 (due-flow→trigger, idle→null, requiresApproval-korunur, çok-flow sıralı) — hermetik (tmpdir flow fixture)
**Smoke:** (Tier-0) unit yeterli.

## Task 6: 226-006 — [P0] Sürekli loop + composition root (DORMANT'I ÖLDÜRÜR)
- Model: opus
- Effort: high
- Skills: typescript-expert
- Files: src/orchestra/autonomous/runtime-loop.ts, tests/orchestra/autonomous-runtime-loop.test.ts
- Scope: src/orchestra/autonomous/, tests/orchestra/
- Dependencies: 226-001, 226-002, 226-003, 226-004, 226-005
### Description
**🔴 Bu task wire'ın can damarı — 5 adapter'ı GERÇEKTEN çağırır (0-caller dormancy'yi bitirir).** `buildAutonomousRuntime(config)` composition root → 5 gerçek adapter'ı (226-001..005) assemble eder + `runAutonomousLoop(config, deps, {intervalMs, maxIterations?, signal})` sürekli tick: her tick `runAutonomousCycle` çağırır (idle→bekle, aksiyon→authority/approval/execute/audit). `maxIterations`/`signal` ile test-deterministik + temiz stop. flow-runtime tick-pattern'ini izle. Caller runtime-loop.ts (def `autonomous-runtime.ts` + 5 adapter DIŞLA — burada İÇERİ alınır+çağrılır).
**Kanıt:** `grep -c "runAutonomousCycle\|authority-adapter\|audit-adapter\|approval-adapter\|action-adapter\|trigger-adapter\|makeAuthorityChecker\|makeAuditSink" src/orchestra/autonomous/runtime-loop.ts` → ≥5 (5 adapter + cycle ÇAĞRISI); `npx vitest run tests/orchestra/autonomous-runtime-loop.test.ts` → 5+ pass
**Test:** ≥5 (loop N-tick koşar, idle-tick bekler, denied-cycle audit yazar, needs_approval→pending durur, maxIterations/signal temiz-stop) — hermetik (5 adapter gerçek, tmpdir; mock-only=GO_WITH_TECH_DEBT)
**Smoke:** (Tier-0 orchestra) gerçek 5-adapter ile loop 3-tick koşar; unit yeterli.

## Task 7: 226-007 — [P0] `deckent autonomous` CLI (start/stop/status, Tier-1 user-surface)
- Model: opus
- Effort: normal
- Skills: typescript-expert, api-builder
- Files: src/cli/commands/autonomous.ts, tests/cli/autonomous-command.test.ts
- Scope: src/cli/commands/, tests/cli/
- Dependencies: 226-006
### Description
`deckent autonomous start|status|stop` komutu — `registerAutonomous(program)` (ADR-012 pattern), `buildAutonomousRuntime`+`runAutonomousLoop`'u (226-006) sarar. `start` → loop'u **authority+approval sınırlı** başlatır (default-deny korunur, oto-sprint-start YOK), `status` → aktif/pending/son-audit özeti, `stop` → temiz dur. CLI helpers/i18n kullan (hardcode string YOK — CLAUDE.md i18n-FIRST). index.ts'e WIRE et (0-caller olmasın). Caller autonomous.ts + index.ts (def runtime-loop.ts DIŞLA).
**Kanıt:** `grep -c "buildAutonomousRuntime\|runAutonomousLoop\|registerAutonomous" src/cli/commands/autonomous.ts` → ≥2 (ÇAĞRI); `grep -c "registerAutonomous" src/cli/index.ts` → ≥1 (WIRE); `npx vitest run tests/cli/autonomous-command.test.ts` → 4+ pass
**Test:** ≥4 (start→loop kurar, status→özet, stop→temiz, default-deny korunur) — hermetik (tmpdir, async spawn)
**Smoke (Tier-1 ZORUNLU):** `env -u ANTHROPIC_API_KEY node dist/cli/entry.js autonomous status 2>&1 | head` → otonom durum özeti (pending/son-audit) — "Unknown command" DEĞİL, gerçek-binary çıktı.

---

**Beklenen:** 7/7 DONE, 0 false-FIX. Wave-1 (226-001..005) paralel ayrık-dosya → çakışma yok; Wave-2 (226-006 → 226-007) elle sıra (dependency_pipeline_enabled=false). **F3-009 ~%40→~%80:** iskelet 5 gerçek adapter + sürekli loop + CLI ile **dormant'tan çıkar**, otonom-mod-temeli canlı. **Güvenlik invariant'ı:** default-deny + insan-onay-gate korunur, oto-sprint-start YOK. CI yeşil KORUNUR.

**Pre-flight:** main temiz+commit'li+push'lu. build:all + restart + RE-PLAN ŞART. **CLI'dan `env -u ANTHROPIC_API_KEY`**. Wave-1 sonrası 226-006, onun sonrası 226-007 (elle sıra). Her wave sonrası `git log -1` + `git stash list` (reset kontrol — [[project_deckent_self_git_mutation_bug]]).

İlgili memory: [[project_deckent_everyone_everywhere]] · [[feedback_scale_up_autonomous]] · [[project_deckent_runtime_ecosystem]] · [[feedback_proof_of_function_dod]] · [[feedback_directive_kanit_letter_vs_goal]] · [[project_ci_green_root_causes]] · [[project_deckent_self_git_mutation_bug]]
İlgili ADR: ADR-037 (RBAC authority) · ADR-040 (nervous approval) · ADR-042 (hybrid/process mode) · ADR-008 (brain centrality) · F3-009 (MASTER-PLAN)

---
---

