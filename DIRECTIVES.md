# DIRECTIVES — Sprint 224 (dogfood dalgası): Orthogonal kalanlar (AI-fix + nervous-wire + harness + docs)

## Goal: HİBRİT dogfood. Sprint 224 native-parity'nin **REPL render çekirdeği** (pinned-bar/menu/token/markdown/aktivite/provider-parity/paste) Claude Code tarafından sıralı el-kodlanıyor (entry.ts/chat-native/render çok-coupled → paralel çakışır). Bu dogfood dalgası ise **REPL'e DOKUNMAYAN, dosya-bazında ayrık** kalan işleri deckent'in paralel worker'larıyla halleder: AI plan-mode fix (orchestra), `/nervous` wire + banner + güvenli re-enable, smoke-harness'lar (scripts), ADR-086 docs. **Her task DISTINCT filesWrite → paralel çakışma yok.** Tam Sprint 224 planı: `.brain/archive/DIRECTIVES-sprint-224-full.md` + `docs/MASTER-PLAN.md` F11. **god-level, RUN-VERIFY zorunlu, CI yeşil KORUNUR.**

Bağlam: Sprint 224 oturum-işi (terminal-mode + smooth-streaming + agentic-DO + perms + kraken-renk + sabit-fiil + `/`-completer) **main'de canlı + run-verify OK**. nervous panic-gate non-blocking (223-006) + observer (223-008) + finalizer (223-013) main'de. Bu dalga onların üstüne kurulur.

## Ortak kurallar
- **🟢 RUN-VERIFY ([[feedback_proof_of_function_dod]]):** kanıt çağıran-dosyada (def dışla); `Smoke:` ölçülebilir. Mock-only = GO_WITH_TECH_DEBT.
- **🔴 HERMETIK ([[project_ci_green_root_causes]]):** tmpdir+sandbox HOME, async spawn (spawnSync YASAK), `test:ci-sim`. CI yeşil KORUNUR.
- ESM `.js`. Subscription (API YASAK, `env -u`). ≤200 LoC, YENİ TEST DOSYASI. **Sadece kendi filesWrite'ına yaz** (paralel-güvenlik).

---

## Task 1: 224-015 — [P0] AI plan-mode fix (dürüst hata + gerçekten-çalışır)
- Model: opus
- Effort: high
- Skills: typescript-expert
- Files: src/orchestra/planner.ts, src/orchestra/sprint-planner.ts, src/cli/commands/plan.ts, tests/orchestra/ai-planner-honest-fallback.test.ts
- Scope: src/orchestra/, src/cli/commands/, tests/orchestra/
### Description
**Problem ([[feedback_ai_planner_silent_fallback]]):** `callBrainPlanner()` (planner.ts ~375-395) tüm hata türlerini (spawn/timeout/parse/validation/no-provider) tek `null`'a indirger; `spawnSync`+10s timeout gerçek plan üretimini aşar; CLI bootstrap (plan.ts ~40-49) sessizce structured'a düşer (sebep gizli). throw/fallback (sprint-planner.ts ~278-294) Sprint 221-017'de doğru.
**Çözüm:** `callBrainPlanner()` → **discriminant union** `{ok:true,data}` | `{ok:false,reason,message}` (reason: spawn_failed/timeout/parse_failed/validation_failed/no_providers); `resolveAdapter` ProviderError→no_providers. `planSprint()` discriminant tüket: ai+fail→BrainError **detaylı sebep**, auto+fail→console.error detaylı+structured. CLI bootstrap→provider+gerçek-hata logla. Timeout config'lenebilir (`brain_plan_timeout_ms`, default artır). Structured deckent-dev için zaten mükemmel — AI mode user-project kritik. **Caller dosyalarda kanıt (def dışla).**
**Kanıt:** `grep -c "ok:\s*false\|reason\|no_providers\|brain_plan_timeout" src/orchestra/planner.ts` → ≥2; `npx vitest run tests/orchestra/ai-planner-honest-fallback.test.ts` → 4+ pass
**Test:** ≥4 (ai+fail→detaylı-throw, auto+fail→detaylı-log+structured, no-provider→reason, ok-path) — hermetik (mock spawn)
**Smoke:** (Tier-0 orchestra) `deckent plan --mode ai` fail→**dürüst sebep** (sessiz structured DEĞİL); unit yeterli.

## Task 2: 224-008 — [P0] `/nervous` slash wire (kurtarılan bridge → chat-native caller)
- Model: opus
- Effort: normal
- Skills: typescript-expert
- Files: src/cli/commands/chat-native.ts, tests/cli/repl-nervous-wire.test.ts
- Scope: src/cli/commands/, tests/cli/
### Description
**Problem:** `/nervous` → "Unknown command". `chat-nervous-bridge.ts` (getPendingNervous/renderNervousPrompt — main'de var) chat-native slash-handler'a wire DEĞİL.
**Çözüm:** chat-native.ts slash-handler — `/nervous` → `getPendingNervous()` → `renderNervousPrompt()` görünür bas + accept/reject. resolveSlash/registry'ye `/nervous` ekle. Caller chat-native.ts (def chat-nervous-bridge.ts DIŞLA). **YALNIZCA chat-native.ts'e yaz** (paralel-güvenlik — başka task bu dosyaya dokunmaz).
**Kanıt:** `grep -c "getPendingNervous\|renderNervousPrompt\|nervous" src/cli/commands/chat-native.ts` → ≥2 (ÇAĞRI); `npx vitest run tests/cli/repl-nervous-wire.test.ts` → 4+ pass
**Test:** ≥4 (/nervous pending listele, görünür-render, accept, reject, pending-yok→sessiz) — hermetik (tmpdir panic-ipc fixture)
**Smoke:** `printf '/nervous\n/exit\n' | env -u ANTHROPIC_API_KEY node dist/cli/entry.js 2>&1 | head` → pending listesi (veya "bekleyen yok") — "Unknown command" DEĞİL.

## Task 3: 224-009 — Banner wire (kurtarılan chat-banner → entry.ts REPL açılış)
- Model: sonnet
- Effort: low
- Skills: frontend-design, typescript-expert
- Files: src/cli/entry.ts, tests/cli/repl-banner-wire.test.ts
- Scope: src/cli/, tests/cli/
### Description
**Problem:** `chat-banner.ts` `renderBanner` (main'de var) 0-caller — REPL açılışı sade.
**Çözüm:** entry.ts `launchDefaultRepl` başında (status-line yanında) `renderBanner(ctx)` bas (TTY-only). Caller entry.ts (def chat-banner.ts DIŞLA). **YALNIZCA entry.ts'e yaz.**
**Kanıt:** `grep -c "renderBanner" src/cli/entry.ts` → ≥1 (ÇAĞRI); `npx vitest run tests/cli/repl-banner-wire.test.ts` → 3+ pass
**Test:** ≥3 (banner basılır, TTY-only, provider yansır) — hermetik
**Smoke:** `printf '/exit\n' | env -u ANTHROPIC_API_KEY node dist/cli/entry.js | head -5` → şık karşılama + ipucu.

## Task 4: 224-010 — Nervous güvenli re-enable + A/B (panic-gate non-blocking main'de)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: .deckent/config.json, tests/config/nervous-reenable-safe.test.ts
- Scope: .deckent/, tests/config/
- Dependencies: 224-008
### Description
**Problem:** nervous `enabled:false`. panic-gate.ts non-blocking (223-006) + observer.ts (223-008) main'de LIVE → güvenle açılabilir.
**Çözüm:** `.deckent/config.json` `nervous_system.enabled:true` + mode balanced + scan-interval optimize. **A/B:** nervous ON ile sprint SPAWN'da TAKILMAZ (advisory). 224-008 DONE sonrası.
**Kanıt:** `grep -A1 nervous_system .deckent/config.json | grep "enabled.*true"`; `npx vitest run tests/config/nervous-reenable-safe.test.ts` → 3+ pass
**Test:** ≥3 (config enabled, advisory-mode, safety_floor korunur) — hermetik (fixture)

## Task 5: 224-027 — Smoke harness'lar (agentic-DO + REPL run-proven, scripts/)
- Model: sonnet
- Effort: normal
- Skills: ci-testing, typescript-expert
- Files: scripts/agentic-do-verify.mjs, scripts/repl-smoke-verify.mjs, tests/scripts/agentic-do-verify.test.ts
- Scope: scripts/, tests/scripts/
### Description
**Çözüm:** `agentic-do-verify.mjs` — gerçek `dist/cli/entry.js`: tmpdir'de agentic-write ("X.md yaz"→onay-auto→dosya OLUŞTU mu) PASS/FAIL. `repl-smoke-verify.mjs` (main'de var) genişlet: terminal-mode/streaming/perms/`/`-menü run-proven. Async spawn, timeout-guard, tmpdir-izole. **YALNIZCA scripts/'e yaz.**
**Kanıt:** `grep -c "write\|verify\|entry.js\|spawn\|tmpdir" scripts/agentic-do-verify.mjs` → ≥4; `npx vitest run tests/scripts/agentic-do-verify.test.ts` → 4+ pass
**Test:** ≥4 (write-verify PASS, dosya-yok FAIL, tmpdir-izole, dist-yok skip) — async hermetik
**Smoke:** `node scripts/agentic-do-verify.mjs` → agentic-write PASS (run-proven).

## Task 6: 224-012 — ADR-086 (Native CLI Parity) + MASTER-PLAN §10 güncel
- Model: sonnet
- Effort: low
- Skills: documentation-writer, system-architect
- Files: docs/adr/086-native-cli-parity.md, docs/MASTER-PLAN.md, tests/docs/adr-086.test.ts
- Scope: docs/, tests/docs/
### Description
**Çözüm:** ADR-086 (Native CLI Parity F11 — terminal-mode + smooth-streaming + agentic-DO + permission-memory + pinned-bar yön + multi-provider hedefi, MADR, accepted). MASTER-PLAN §10 Sprint 224 sonuç + F11 durum güncelle. **YALNIZCA docs/+tests/docs/.**
**Kanıt:** `grep -c "parity\|terminal\|agentic\|streaming\|permission" docs/adr/086-*.md` → ≥4; `grep -c "224" docs/MASTER-PLAN.md` → ≥1; `npx vitest run tests/docs/adr-086.test.ts` → 3+ pass
**Test:** ≥3 (ADR-086 MADR, MASTER-PLAN güncel, accepted)

---

**Beklenen:** 6/6 DONE, 0 false-FIX, 0 scope-collision (her task distinct dosya). **Paralel-güvenli** (REPL render çekirdeği Claude Code'da ayrı). nervous re-enable sonrası sprint TAKILMAZ (panic-gate non-blocking). CI yeşil KORUNUR.

**Pre-flight:** main temiz+commit'li+push'lu (reset-bug güvenli). build:all + restart + RE-PLAN ŞART. **CLI'dan `env -u ANTHROPIC_API_KEY`** (API yasak). dependency_pipeline_enabled=false → Brain manuel wave; 224-010 → 224-008 sonrası (elle sıra). Her wave sonrası `git log -1` + `git stash list` (reset kontrol).

İlgili memory: [[feedback_ai_planner_silent_fallback]] · [[feedback_proof_of_function_dod]] · [[project_nervous_panic_gate_silent_block]] · [[feedback_build_mcp_restart_coordination]] · [[project_deckent_self_git_mutation_bug]] · [[feedback_planner_dependency_parse_gap]]

---
---

# DIRECTIVES — Sprint 225 (sıradaki/aday): Otonom Sürekli Runtime Wire (F3-009)

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

## Task 1: 225-001 — Authority adapter (checkAuthority → AuthorityChecker)
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

## Task 2: 225-002 — Audit adapter (writeEvent → AuditSink)
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

## Task 3: 225-003 — Approval gate adapter (nervous Executor → ApprovalGate, OTO-APPROVE YOK)
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

## Task 4: 225-004 — Action executor adapter (ActionHandler registry → ActionExecutor)
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

## Task 5: 225-005 — Trigger source adapter (scheduled-flow + self-dispatch → TriggerSource)
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

## Task 6: 225-006 — [P0] Sürekli loop + composition root (DORMANT'I ÖLDÜRÜR)
- Model: opus
- Effort: high
- Skills: typescript-expert
- Files: src/orchestra/autonomous/runtime-loop.ts, tests/orchestra/autonomous-runtime-loop.test.ts
- Scope: src/orchestra/autonomous/, tests/orchestra/
- Dependencies: 225-001, 225-002, 225-003, 225-004, 225-005
### Description
**🔴 Bu task wire'ın can damarı — 5 adapter'ı GERÇEKTEN çağırır (0-caller dormancy'yi bitirir).** `buildAutonomousRuntime(config)` composition root → 5 gerçek adapter'ı (225-001..005) assemble eder + `runAutonomousLoop(config, deps, {intervalMs, maxIterations?, signal})` sürekli tick: her tick `runAutonomousCycle` çağırır (idle→bekle, aksiyon→authority/approval/execute/audit). `maxIterations`/`signal` ile test-deterministik + temiz stop. flow-runtime tick-pattern'ini izle. Caller runtime-loop.ts (def `autonomous-runtime.ts` + 5 adapter DIŞLA — burada İÇERİ alınır+çağrılır).
**Kanıt:** `grep -c "runAutonomousCycle\|authority-adapter\|audit-adapter\|approval-adapter\|action-adapter\|trigger-adapter\|makeAuthorityChecker\|makeAuditSink" src/orchestra/autonomous/runtime-loop.ts` → ≥5 (5 adapter + cycle ÇAĞRISI); `npx vitest run tests/orchestra/autonomous-runtime-loop.test.ts` → 5+ pass
**Test:** ≥5 (loop N-tick koşar, idle-tick bekler, denied-cycle audit yazar, needs_approval→pending durur, maxIterations/signal temiz-stop) — hermetik (5 adapter gerçek, tmpdir; mock-only=GO_WITH_TECH_DEBT)
**Smoke:** (Tier-0 orchestra) gerçek 5-adapter ile loop 3-tick koşar; unit yeterli.

## Task 7: 225-007 — [P0] `deckent autonomous` CLI (start/stop/status, Tier-1 user-surface)
- Model: opus
- Effort: normal
- Skills: typescript-expert, api-builder
- Files: src/cli/commands/autonomous.ts, tests/cli/autonomous-command.test.ts
- Scope: src/cli/commands/, tests/cli/
- Dependencies: 225-006
### Description
`deckent autonomous start|status|stop` komutu — `registerAutonomous(program)` (ADR-012 pattern), `buildAutonomousRuntime`+`runAutonomousLoop`'u (225-006) sarar. `start` → loop'u **authority+approval sınırlı** başlatır (default-deny korunur, oto-sprint-start YOK), `status` → aktif/pending/son-audit özeti, `stop` → temiz dur. CLI helpers/i18n kullan (hardcode string YOK — CLAUDE.md i18n-FIRST). index.ts'e WIRE et (0-caller olmasın). Caller autonomous.ts + index.ts (def runtime-loop.ts DIŞLA).
**Kanıt:** `grep -c "buildAutonomousRuntime\|runAutonomousLoop\|registerAutonomous" src/cli/commands/autonomous.ts` → ≥2 (ÇAĞRI); `grep -c "registerAutonomous" src/cli/index.ts` → ≥1 (WIRE); `npx vitest run tests/cli/autonomous-command.test.ts` → 4+ pass
**Test:** ≥4 (start→loop kurar, status→özet, stop→temiz, default-deny korunur) — hermetik (tmpdir, async spawn)
**Smoke (Tier-1 ZORUNLU):** `env -u ANTHROPIC_API_KEY node dist/cli/entry.js autonomous status 2>&1 | head` → otonom durum özeti (pending/son-audit) — "Unknown command" DEĞİL, gerçek-binary çıktı.

---

**Beklenen:** 7/7 DONE, 0 false-FIX. Wave-1 (225-001..005) paralel ayrık-dosya → çakışma yok; Wave-2 (225-006 → 225-007) elle sıra (dependency_pipeline_enabled=false). **F3-009 ~%40→~%80:** iskelet 5 gerçek adapter + sürekli loop + CLI ile **dormant'tan çıkar**, otonom-mod-temeli canlı. **Güvenlik invariant'ı:** default-deny + insan-onay-gate korunur, oto-sprint-start YOK. CI yeşil KORUNUR.

**Pre-flight:** main temiz+commit'li+push'lu. build:all + restart + RE-PLAN ŞART. **CLI'dan `env -u ANTHROPIC_API_KEY`**. Wave-1 sonrası 225-006, onun sonrası 225-007 (elle sıra). Her wave sonrası `git log -1` + `git stash list` (reset kontrol — [[project_deckent_self_git_mutation_bug]]).

İlgili memory: [[project_deckent_everyone_everywhere]] · [[feedback_scale_up_autonomous]] · [[project_deckent_runtime_ecosystem]] · [[feedback_proof_of_function_dod]] · [[feedback_directive_kanit_letter_vs_goal]] · [[project_ci_green_root_causes]] · [[project_deckent_self_git_mutation_bug]]
İlgili ADR: ADR-037 (RBAC authority) · ADR-040 (nervous approval) · ADR-042 (hybrid/process mode) · ADR-008 (brain centrality) · F3-009 (MASTER-PLAN)

---
---

# DIRECTIVES — Sprint 226 (sıradaki/aday): Platform + Model-wire + Dormant-activation

## Goal: **Sprint 224 sonrası dogfood-analizinin (feature-manifest + models.dev wiring audit) kod-doğrulanmış kalan iş kalemleri.** Bu dalga, "god-level primitive yazıldı ama 0-caller" desenini (MASTER-PLAN W-K) hedefler: Windows backend, models.dev dinamik routing, ve uykudaki primitive'lerin (ecosystem-intelligence, self-mod enforcement, handoff/heartbeat/shared-memory worker-koordinasyonu) gerçek wire'ı + ölü/orphan disposition + docker canlı-izleme. **Her task DISTINCT filesWrite → tam paralel-güvenli (tek wave).** Kaynak doğrulaması: her iddia file:line düzeyinde grep-doğrulandı (orijinal analizdeki D5-dedup ve E1-modül hataları düzeltildi). **god-level, RUN-VERIFY zorunlu, CI yeşil KORUNUR.**

Not: Brand-foundation (A1) bu sprint'te YOK — renk-tanımları paralel terminaldeki Ink-REPL çekirdeğinde (`src/cli/repl/*`, `chat-render-region.ts`) ve Alperen tarafından elle ele alınıyor (çakışma önleme).

## Ortak kurallar
- **🟢 RUN-VERIFY ([[feedback_proof_of_function_dod]]):** kanıt **çağıran** dosyada (def DIŞLA — wire'ı çağıran modülde grep'le, [[feedback_directive_kanit_letter_vs_goal]]); user-surface task → `Smoke:` gerçek-binary şart. Mock-only = GO_WITH_TECH_DEBT.
- **🔴 HERMETİK ([[project_ci_green_root_causes]]):** tmpdir + sandbox HOME, **async spawn (spawnSync YASAK)**, `test:ci-sim` yeşil. CI yeşil KORUNUR.
- ESM `.js`. Subscription (`env -u ANTHROPIC_API_KEY`). ≤200 LoC tercih, YENİ TEST DOSYASI. **Sadece kendi filesWrite'ına yaz** (paralel-güvenlik). Tek wave (8 task distinct dosya); `dependency_pipeline_enabled=false` → Brain manuel.

---

## Task 1: 226-001 — Windows-native backend (win32 → subprocess, POSIX-sleep → Node timer)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/orchestra/spawn-backend.ts, src/orchestra/spawn-backend-docker.ts, tests/orchestra/windows-backend.test.ts
- Scope: src/orchestra/, tests/orchestra/
### Description
**Problem (doğrulandı):** `resolveBackend()` (`spawn-backend.ts:253-256`) `'auto'→'docker'` döner, **`process.platform` dalı yok** → Windows'ta docker zorunlu kılınır; docker spawn POSIX `sleep`'e bağlı (`spawn-backend-docker.ts:787-790` `spawnSync('sleep',…)` + `:829` + shell `sleep 15` `:456`) → win32'de kırılır.
**Çözüm:** `resolveBackend('auto')` → **`process.platform==='win32' ? 'subprocess' : 'docker'`** dalı. Docker `sleep` çağrılarını Node timer'a (`await new Promise(r=>setTimeout(r,ms))` veya mevcut async pattern) çevir — POSIX-sleep'i kaldır. Backend kontratı (4 metot) DEĞİŞMEZ, yeni araç YOK. Caller `spawn-backend.ts` (platform-mock ile).
**Kanıt:** `grep -c "win32\|process.platform" src/orchestra/spawn-backend.ts` → ≥1; `npx vitest run tests/orchestra/windows-backend.test.ts` → 3+ pass
**Test:** ≥3 (win32→subprocess, posix→docker, sleep-Node-timer) — hermetik (platform mock, async spawn)
**Smoke:** (Tier-0 orchestra) unit yeterli.

## Task 2: 226-002 — [P0] ⭐ models.dev native wire (PROVIDER_MODEL_MAP statik → dinamik)
- Model: opus
- Effort: high
- Skills: typescript-expert
- Files: src/core/task-types.ts, src/providers/claude.ts, src/providers/codex.ts, src/providers/gemini.ts, tests/core/models-dev-wire.test.ts
- Scope: src/core/, src/providers/, tests/core/
### Description
**Problem (doğrulandı):** `PROVIDER_MODEL_MAP` (`task-types.ts:33-46`) **modül-yükleme anında statik** const (`Object.fromEntries(modelRegistry.getAllProviders()…)`); `bootstrapFromCatalog()` (`entry.ts:771`, preAction hook) models.dev'i SONRADAN çeker → harita tazelenmez. `ModelType` union (`task-types.ts:10-19`) hardcoded; adapter guard'ları (`codex.ts` `isOpenAIModel`) statik snapshot'a bakar → **builtin-13 dışı models.dev modeli reddedilir** (provider-selection yolunda ölü).
**Çözüm (Opsiyon A):** `PROVIDER_MODEL_MAP` statik→**dinamik getter/fonksiyon** (her okumada `modelRegistry.getByProvider()` canlı sorgu). Type-guard'ları (`isOpenAIModel`/`isClaudeModel`/`isGeminiModel`) registry-lookup'a gevşet (modül-yükleme snapshot'ı değil). Adapter'lar `spawn()` anında registry'den okusun. `ModelType` union'ı çalışma-zamanı `string` + registry-doğrulama ile uyumlu kıl (type-narrowing korunur). Caller `providers/*` + `task-types.ts`.
**Kanıt:** `grep -c "getByProvider\|modelRegistry\." src/core/task-types.ts` → ≥2 (dinamik sorgu); `npx vitest run tests/core/models-dev-wire.test.ts` → 4+ pass
**Test:** ≥4 (builtin-dışı model registry'de → guard kabul, provider doğru maplenir, bootstrap-sonrası harita taze, builtin korunur) — hermetik (registry fixture)
**Smoke (Tier-1):** models.dev'de var olan **builtin-dışı** model id ile task spawn → **reddedilmez**, doğru provider'a router'lanır (run-proven).

## Task 3: 226-003 — ecosystem-intelligence → routing-engine tüketimi
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/orchestra/ecosystem-intelligence.ts, src/core/routing-engine.ts, tests/core/ecosystem-routing.test.ts
- Scope: src/orchestra/, src/core/, tests/core/
### Description
**Problem (doğrulandı):** `ecosystem-intelligence.ts` analiz üretir (`analyzeNewSkill`/`persistSkillActivation`) ama sadece `cli/commands/skill.ts` caller'lı; **`routing-engine.ts` tüketmiyor** (grep'te referans yok) → çıktı dead-end.
**Çözüm:** Ecosystem analiz çıktısını (skill aktivasyon sinyali) `routing-engine.ts`'in skill→agent affinity skorlamasına besle (ADR-075 affinity pattern'i izle). Caller `routing-engine.ts` (def `ecosystem-intelligence.ts` DIŞLA).
**Kanıt:** `grep -c "ecosystem\|analyzeNewSkill\|SkillActivation" src/core/routing-engine.ts` → ≥1 (ÇAĞRI); `npx vitest run tests/core/ecosystem-routing.test.ts` → 3+ pass
**Test:** ≥3 (ecosystem-sinyali affinity'yi etkiler, sinyal-yok→nötr, mevcut routing bozulmaz) — hermetik
**Smoke:** (Tier-0) unit yeterli.

## Task 4: 226-004 — self-modifying-detector enforcement (user-project flag-gated)
- Model: sonnet
- Effort: low
- Skills: typescript-expert, security-specialist
- Files: src/orchestra/self-modifying-detector.ts, config wire (sadece kendi scope'unda), tests/orchestra/self-mod-enforce.test.ts
- Scope: src/orchestra/, tests/orchestra/
### Description
**Problem (doğrulandı):** Tespit aktif (`isSelfModifyingTask`/`detectDeckentRepo`); enforcement `authority-enforcer.ts:302`'de `isSelfModifyingSprint` flag-gated (opt-in). ADR-039 dogfood-vs-user ayrımı KORUNMALI.
**Çözüm:** User-project'lerde **flag-gated** enforcement (config opt-in); deckent-dev'de bilinçli advisory (ADR-039). **🔴 RİSKLİ — kör-default-on EDİLMEZ; flag-gated, doğrula-sonra-default** (CLAUDE.md Quality Bar). Caller enforcement-noktası (def detector DIŞLA).
**Kanıt:** `grep -c "isSelfModifying\|enforce\|self_mod" src/orchestra/self-modifying-detector.ts` → ≥1; `npx vitest run tests/orchestra/self-mod-enforce.test.ts` → 3+ pass
**Test:** ≥3 (flag-on→enforce, flag-off→advisory, deckent-dev→advisory korunur) — hermetik
**Smoke:** (Tier-0) unit yeterli.

## Task 5: 226-005 — Ölü/orphan disposition (ADR-038): multi-agent.ts + decision-replay.ts
- Model: sonnet
- Effort: low
- Skills: refactorer
- Files: src/orchestra/multi-agent.ts, src/orchestra/decision-replay.ts, docs/adr/038-dead-code-disposition-sprint-139-audit-results.md
- Scope: src/orchestra/, docs/adr/
### Description
**Problem (doğrulandı + DÜZELTİLDİ):** `multi-agent.ts` modülünün **hiç importeri yok** (gerçek 0-caller orphan — `runPipeline:70` dahil); nervous `runPipeline` (`bootstrap.ts:109`) **farklı imza/semantik ayrı fonksiyon** (DEDUP DEĞİL — birleştirmek nervous'u kırar). `decision-replay.ts` **0-caller** (yalnız self-ref). **⚠️ `decision-engine.ts` CANLI** (nervous `bootstrap.ts:78` + sprint-controller + sprint-spawner) → **disposition adayı DEĞİL**. (Orijinal analizdeki `decision-orchestrator-v1`/`parallel-pipeline-manager-standalone` **mevcut değil**; `ParallelPipelineManager` 2 aktif caller'lı CANLI.)
**Çözüm:** Sprint-anında 0-caller'ı **yeniden doğrula** (`grep -rl "from.*multi-agent"`, `from.*decision-replay` → boş). Sonra ADR-038 disposition: ya **wire et** (gerçek değer varsa) ya **`archive/`'e taşı / sil** + ADR-038'e disposition kaydı. **Karar gerektirir** (sil vs arşivle — sonuç ADR-038'e yazılır). `decision-engine.ts`'e DOKUNMA.
**Kanıt:** `grep -c "multi-agent\|decision-replay\|disposition" docs/adr/038-*.md` → ≥2 (kayıt); 0-caller re-verify çıktısı `.result` notes'ta.
**Test:** ≥2 (kalan modüllerde import kırılmaz, build temiz) — hermetik. **Not:** kod-silme ise test = "tsc temiz + kalan suite yeşil".

## Task 6: 226-006 — Worker-koordinasyon lifecycle wire (handoff + heartbeat-daemon → sprint-controller)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/orchestra/handoff-protocol.ts, src/orchestra/heartbeat-daemon.ts, src/orchestra/sprint-controller.ts, tests/orchestra/coordination-wire.test.ts
- Scope: src/orchestra/, tests/orchestra/
### Description
**Problem (doğrulandı):** `HandoffProtocol` (`handoff-protocol.ts:18`) **0-caller** — task→task artifact aktarımı için tasarlı, hiç wire değil. `heartbeat-daemon.ts` `runHeartbeat()` (`:146`) sadece `cli/commands/heartbeat.ts` caller — sprint-controller'a wire DEĞİL (manuel invocation). (İki primitive de `sprint-controller.ts`'e wire olduğu için TEK task'ta birleştirildi → paralel-çakışma önleme.)
**Çözüm:** (a) HandoffProtocol'ü bağımlılık-zincirli wave geçişine wire (A→B: A'nın çıktı artifact'i B'ye handoff, EXECUTE/WAVE_BUILD). (b) heartbeat-daemon'u SPAWN'da otomatik başlat, CLEANUP'ta durdur (opt-out config'li). Caller `sprint-controller.ts` (def'ler DIŞLA).
**Kanıt:** `grep -c "HandoffProtocol\|handoff\|heartbeatDaemon\|runHeartbeat" src/orchestra/sprint-controller.ts` → ≥2 (ÇAĞRI); `npx vitest run tests/orchestra/coordination-wire.test.ts` → 4+ pass
**Test:** ≥4 (handoff wave-geçişinde artifact aktarır, heartbeat SPAWN'da başlar, CLEANUP'ta durur, opt-out korunur) — hermetik (tmpdir)
**Smoke:** (Tier-0 orchestra) unit yeterli.

## Task 7: 226-007 — shared-memory wire (worker↔worker, read-mostly)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/orchestra/shared-memory.ts, src/agents/worker.ts, tests/orchestra/shared-memory-wire.test.ts
- Scope: src/orchestra/, src/agents/, tests/orchestra/
### Description
**Problem (doğrulandı):** `SharedMemory` (`shared-memory.ts:16`) **0-caller** (`errors.ts` yalnız tip-referansı, construct etmez). Aynı sprint worker'ları için paylaşımlı veri alanı tasarlı, hiç wire değil.
**Çözüm:** Aynı sprint worker'ları için paylaşımlı (read-mostly) veri alanını **worker spawn/context'ine** wire et (`worker.ts`). **🔴 Wire-point `worker.ts`/spawn-context — `sprint-controller.ts`'e DÜŞME** (226-006 ile çakışmasın). Caller `worker.ts` (def `shared-memory.ts` DIŞLA).
**Kanıt:** `grep -c "SharedMemory\|sharedMemory" src/agents/worker.ts` → ≥1 (ÇAĞRI); `npx vitest run tests/orchestra/shared-memory-wire.test.ts` → 3+ pass
**Test:** ≥3 (worker shared-memory'e yazar/okur, izolasyon-per-sprint, yok→graceful) — hermetik (tmpdir)
**Smoke:** (Tier-0) unit yeterli.

## Task 8: 226-008 — [P0] Docker live-monitor wire (SSE mount + watch --follow + WorkerCard)
- Model: opus
- Effort: high
- Skills: typescript-expert, devops-engineer
- Files: src/dashboard/api/output-stream.ts, src/api/server.ts, src/cli/commands/watch.ts, src/dashboard/src/components/WorkerCard.tsx
- Scope: src/dashboard/, src/api/, src/cli/commands/
### Description
**Problem (doğrulandı):** Docker çıktısı `logs --tail` (snapshot, canlı akış yok); `output-stream.ts` SSE handler (`src/dashboard/api/output-stream.ts`, `handleOutputStream`/`isOutputStreamRequest`) **`server.ts`'e mount EDİLMEMİŞ** (grep'te referans yok); `watch.ts --follow` (`:116`) var ama sadece tmux/subprocess `tail -f` — docker `logs -f` dalı YOK; `WorkerCard.tsx` mevcut ama canlı-log fan-out yok.
**Çözüm:** (a) `output-stream` SSE'yi `server.ts`'e mount (`isOutputStreamRequest` router'a ekle). (b) `watch --follow` docker dalı → `docker logs -f deckent-w-<id>` (read-only follow). (c) `WorkerCard` canlı-log akışı fan-out. Caller'lar `server.ts`/`watch.ts`/`WorkerCard.tsx`.
**Kanıt:** `grep -c "OutputStream\|output-stream\|handleOutputStream" src/api/server.ts` → ≥1 (MOUNT); `grep -c "logs.*-f\|follow.*docker\|docker.*logs" src/cli/commands/watch.ts` → ≥1
**Test:** ≥4 (SSE mount route, watch docker follow dalı, WorkerCard render canlı-log, non-docker fallback) — hermetik (mock docker, async spawn)
**Smoke (Tier-1 ZORUNLU):** `env -u ANTHROPIC_API_KEY node dist/cli/entry.js watch --follow <taskId>` → docker worker'da **canlı satır akışı** (snapshot DEĞİL) — gerçek-binary çıktı.

---

**Beklenen:** 8/8 DONE, 0 false-FIX, 0 scope-collision (her task distinct dosya → tek wave paralel). **Paralel-güvenli** (A1 brand REPL çekirdeğinde Alperen'de ayrı). 226-002 (models.dev) ve 226-008 (docker-monitor) yüksek-değer P0; gerisi platform/dormant-activation. CI yeşil KORUNUR.

**Pre-flight:** main temiz+commit'li+push'lu (reset-bug güvenli — [[project_deckent_self_git_mutation_bug]]). build:all + restart + RE-PLAN ŞART. **CLI'dan `env -u ANTHROPIC_API_KEY`** (API yasak). Tek wave (8 task paralel ayrık-dosya); `dependency_pipeline_enabled=false` → Brain manuel. Her wave sonrası `git log -1` + `git stash list` (reset kontrol). **Çakışma-notu:** 226-006 `sprint-controller.ts` yazar, 226-007 `worker.ts` yazar (sprint-controller'a DÜŞMEMELİ) — wire-point ayrımına dikkat.

İlgili memory: [[feedback_proof_of_function_dod]] · [[project_ci_green_root_causes]] · [[feedback_directive_kanit_letter_vs_goal]] · [[feedback_zero_hardcode_live_data]] · [[project_deckent_runtime_ecosystem]] · [[project_deckent_self_git_mutation_bug]]
İlgili ADR: ADR-038 (dead-code disposition) · ADR-039 (self-mod dogfood-vs-user) · ADR-075 (skill→agent affinity) · ADR-077 (multi-provider) · ADR-062 (PTY/web terminal) · MASTER-PLAN W-K (verified wire-gaps)
