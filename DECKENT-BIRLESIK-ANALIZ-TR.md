# DECKENT — BİRLEŞİK KÖK-NEDEN ANALİZİ
### Phase-1 (CC) ⨯ Phase-2 (deckent) cross-check raporu

> Bu rapor, deckent kod tabanının **iki bağımsız, kod-temelli (doc-inference YASAK) audit'inin** birleşimidir. **Phase-1** = Claude Code paralel-ajan taraması (692 adversarial-verified bulgu). **Phase-2** = deckent'in kendi worker'larıyla dogfood self-audit'i (95 rapor, 1361 bulgu). İkisi aynı 95-cluster decomposition'ı üzerinde koştu; `file:line + kategori + satır(±15)` ile eşleştirildi. Hiçbir bulgu doküman okuyarak değil, yalnız gerçek kod okunarak üretildi.

---

## 0. Nasıl Okumalı
- **Bölüm 1-2:** deckent'in *neden* sürekli basic-feature kırdığının kök-neden anlatımı. **Asıl okunacak kısım burası.**
- **Bölüm 3:** iki audit ne kadar mutabık (güven ölçüsü).
- **Bölüm 4-6:** somut bulgular — TIER-1 (iki audit de buldu = kesin), deckent-only (yeni), CC-only (deckent'in kaçırdığı).
- **Bölüm 7:** düzeltme yol haritası.
- Severity: 🔴 critical · 🟠 high · 🟡 medium · ⚪ low. Her bulgu `dosya:satır` taşır — doğrudan koda gidebilirsin.

---

## 1. Yönetici Özeti — deckent neden basic-feature kırıyor?

**Tek cümlede:** deckent basic-feature'ı ölçeği+enstrümanı *rağmen* değil, *yüzünden* kırıyor. Sistemin devasa bir kontrol-düzlemi var (RBAC authority-matrix, proof-of-function gate, honest-gate, cross-verify, panic-guard, tenant-isolation, capability least-privilege, prompt-evolution, telemetry, notification) — ama bunların **ezici çoğunluğu DECLARED (tanımlı/typed/test'li/dokümante) ama ENFORCED DEĞİL (çalışma-zamanında etkisiz)**.

Her katmanda aynı 5 mekanizma tekrar ediyor:
1. **Gate'ler advisory/soft** — verdict ne olursa olsun `success` döner (worker authority her iki branch'te `true`; `enforceRbac` `enabled:false` iken no-op ve default false; PanicGuard BLOCK yok sayılır; spawn-safety hiç çağrılmaz).
2. **Verification-spine unwired/stub** — proof-of-function gate, post-sprint-smoke `passed:true` no-op, `runHonestyCheck` literal `return 0`, cross-verify REFUTED — hepsi ölü ya da worker-self-report'a güveniyor.
3. **Dormant config-knob'lar** — validate edilir, ConfigPage'de gösterilir, dokümante edilir ama **runtime'da hiç okunmaz** (rollback_policy, strictTenantIsolation, telemetry, cost-cap, sprint_timeout...). Kullanıcıya yalan söyleyen ayarlar.
4. **Silent fallback / override-drop** — her yerde sessiz hata-yutma, config kabul-ama-uygulanmaz, getMessage miss'te key döner, planner `structured→fallback` sessiz düşer.
5. **Hardcoded-0 metrikler** — eval/learning/decay loop'larını besleyen sayılar sabit sıfır (`boundaryViolations=0`, `coverage=0`, prompt-stats `{uses:0}`, history-scaling `1.0`) → self-improve/self-audit makinesi **yapısal olarak ölü**, kendi drift'ini göremiyor.

**Derindeki yapısal etken:** tek-doğru-kaynak (SSOT) yok. Aynı kavram 3-5 kez farklı semantik'le yeniden yazılmış (3 RateLimiter, 3 parseVitestOutput, 2 evaluateResult, 2 checkWorkerAuthority, 2 ROLE_CAPABILITY_MAP). Bir kopyaya uygulanan fix **canlı kopyayı değiştirmiyor** — 'reklam edilen fix'lerin no-op olmasının sebebi tam bu (skill-affinity routing, agent-imbalance, **tenant-IDOR filtresi** — fix kimsenin çağırmadığı modüle inmiş). 'DONE' diske-doğrulanmadan güvenle kabul ediliyor; false-DONE varsayılan kabul.

**Sonuç bir kısır döngü:** bozuk feature'ı yakalaması gereken güvenlik-ağlarının *kendisi* bozuk feature'lar; fail-open + sessiz oldukları için her sprint yeşil işaretlenirken gerçek regresyonlar ship oluyor. **'311 sprintlik yeşil', kısmen green-by-construction — green-by-verification değil.**

> **Bu raporun en güçlü kanıtı kendisi:** Phase-2'de deckent kendi 95-task audit-sprint'ini *tek seferde tamamlayamadı* — 30dk hardcoded `waitForResults` timeout'u + dormant `sprint_timeout_minutes` (R3) yüzünden işi ≤20-task batch'lere bölmek zorunda kaldık. Yani audit'in tezi ("declared ama enforced değil") deckent tarafından **canlı, kendi üstünde** kanıtlandı.

---

## 2. 8 Yapısal Kök-Neden (R1-R8)

Bunlar tek tek bug değil — **drift'in sprint-sprint hayatta kalmasını sağlayan sistemik mekanizmalar.** Her biri aşağıdaki yüzlerce bulgunun *motoru*.

### R1. Enforcement yapısal olarak advisory — her güvenlik/kalite gate'i default FAIL-OPEN, hard-block path standart-config'de erişilemez  🔴 `critical`

**Mekanizma:** Sistemin tüm gate'leri 'uyar-ama-izin-ver' şeklinde yazılmış. `checkWorkerAuthority` ihlal VE non-ihlal branch'lerinin ikisinde de `true` döner → scope-enforcement literal no-op. `enforceRbac`, `rbacConfig.enabled` false iken no-op ve default false; flip mekanizması yok → tüm RBAC authority-matrix kalıcı advisory. PanicGuard BLOCK yok sayılır (worker yine de devam eder), mTLS-cert tespit-edilir-sonra-yoksayılır, `assertSpawnSafe` (ADR-006) spawn-callsite'larında hiç çağrılmaz, DockerSpawnBackend (DEFAULT backend) SAFETY_FLOOR lethal-guard'ı tamamen atlar. Deny-path hiç erişilmediği için ihlal eden worker / aşırı-yetkili action / ölümcül komut sessizce izin görür.

**Kanıt dosyaları:** `src/agents/worker.ts:602` · `src/core/rbac.ts:127` · `src/core/config.ts:1192` · `src/orchestra/sprint-controller.ts` · `src/orchestra/spawn-backend.ts` · `src/core/spawn-safety.ts` · `src/api/terminal/ws-gateway.ts` · `src/nervous/executor.ts`

**Düzeltme yönü:** Invert the default: gates fail CLOSED. Wire enforce_rbac with a real config default of true and a validated schema field (not a type-cast); make checkWorkerAuthority actually return result.allowed; route every spawn callsite through assertSpawnSafe; make PanicGuard/mTLS BLOCK terminate execution. Add a 'no advisory-only gate' lint that fails CI if a function named enforce*/check*/assert* has a code path that returns success on a deny verdict.

### R2. Verification-spine unwired/stub — DONE worker'ın kendi self-report'undan kabul ediliyor, diske-doğrulama opsiyonel (trust-without-verify)  🔴 `critical`

**Mekanizma:** Brain doğruluğu `selfAssessment==='DONE'`'dan skorluyor; proof-of-function gate tek objektif kontrol ama 'wiring sertifikalar, user-working-UX değil' diyor ve yalnızca DONE→TECH_DEBT *downgrade* eder, asla bloke etmez ve wired-ama-bozuk feature'ı yakalamaz. Kendinden-emin-yanlış worker → yeşil sprint. 'Basic-feature kırılırken sprint başarı raporlamasının' tam mekanizması.

**Kanıt dosyaları:** `src/orchestra/post-sprint-smoke.ts:227` · `src/orchestra/sprint-finalizer.ts:156` · `src/orchestra/proof-of-function.ts` · `src/orchestra/result-evaluator.ts` · `src/orchestra/mid-sprint-adapter.ts` · `src/orchestra/cross-verify-runner.ts` · `src/providers/subprocess.ts` · `src/orchestra/sprint-reporter.ts:97`

**Düzeltme yönü:** Wire the verification spine into the finalize path and make it real: replace defaultSmokeRunner's no-op with an actual real-binary run against the task's declared Smoke command; implement runHonestyCheck against disk diff; make Brain disk-verify (git diff --stat / ls-files) the result before accepting DONE rather than trusting worker self-report or worker-reported coverage. Treat 'verify task exists but ran a stub' as NO_GO. Add a test that fails if any *Gate/*Smoke/*Honesty export has zero production callers.

### R3. Dormant-knob çoğalması — tanımlı/validate/gösterilen/dokümante ama runtime'da hiç-okunmayan config alanları (ayarlar yalan söylüyor)  🔴 `critical`

**Mekanizma:** Config yüzeyi `enabled:false` ile gelen knob'larla dolu (autonomous, reactive, work_generator, telemetry) ve açık 'unwired/not yet wired' yorumları taşıyan feature'lar. Sistem IDENTITY.md/help/config-schema'da yetenek reklamı yapıyor ama pratikte inert. `sprint_timeout_minutes` (=0 'unlimited' diye sunuluyor ama gerçek timeout başka yerde 30dk hardcoded) bu raporun üretiminde canlı yakalandı.

**Kanıt dosyaları:** `src/orchestra/sprint-controller.ts` · `src/core/memory-store.ts` · `src/core/capability-runtime.ts` · `src/core/cost-config-loader.ts` · `src/core/config-types.ts` · `src/cli/commands/start.ts` · `src/cli/commands/run.ts` · `src/orchestra/autonomous/mission-store/mission-engine-wire.ts`

**Düzeltme yönü:** Establish a 'no dormant knob' invariant: every field in the config schema must have at least one production read-site asserted by a registry test (the test enumerates schema keys and greps for a runtime reader, failing CI on any orphan). Remove fields marked 'legacy — never wired' from the default config. Ban reading config via type-cast — any field a code path reads must be declared on DeckentConfig and validated.

### R4. Tek-doğru-kaynak yok — aynı kavram 3-5× farklı semantik'le yeniden yazılmış; fix ölü-kopyaya iner, canlı-path dokunulmaz kalır  🔴 `critical`

**Mekanizma:** 3 RateLimiter, 3 parseVitestOutput, 3 getCurrentSprintId (farklı dosya okuyor), 2 ROLE_CAPABILITY_MAP, 2 NervousSystemConfig, 2 evaluateResult, duplicate checkWorkerAuthority, noGoRate hem yüzde hem kesir. Bir kopyaya uygulanan düzeltme diğerini sessizce eskitir; 'reklam edilen fix no-op' deseninin kökü.

**Kanıt dosyaları:** `src/core/rate-limiter.ts` · `src/monitor/sprint-state.ts` · `src/core/capability-broker.ts` · `src/core/nervous-types.ts` · `src/orchestra/result-evaluator.ts` · `src/core/activation-engine.ts` · `src/api/server.ts` · `src/agents/worker.ts`

**Düzeltme yönü:** Collapse each duplicated concept to one canonical module and delete the rest (RateLimiter, parseVitestOutput, getCurrentSprintId, ROLE_CAPABILITY_MAP, NervousSystemConfig, redactSensitive, max_workers). Add a duplicate-export lint that flags two exported symbols with the same name/role across modules. For routing/dispatch fixes, require a live-path integration test that exercises the actual production call chain (not the helper in isolation) so a fix in a dead copy fails the test.

### R5. Feedback/learning/audit loop'ları hardcoded-sıfır metrikle çalışıyor — self-improvement makinesi yapısal ölü, kendi drift'ini göremiyor  🟠 `high`

**Mekanizma:** `boundaryViolations=0`, `coverage=0`, prompt version-stats `{uses:0}`, debt-rate 0%, history scaling-factor kalıcı 1.0. Eval/decay/learning'i besleyen sayılar sabit sıfır → 'drift'i yakalayacak' diye güvenilen self-audit/self-improve loop'ları hiçbir şey ölçmüyor.

**Kanıt dosyaları:** `src/orchestra/sprint-metrics.ts` · `src/core/plugin-hooks.ts` · `src/orchestra/process-runtime.ts` · `src/agents/prompt-version.ts` · `src/nervous/detectors/debt-trend.ts` · `src/orchestra/timeout-estimator.ts` · `src/orchestra/outcome-tracker.ts`

**Düzeltme yönü:** Populate the metrics from real data at their source: boundaryViolations from the auditor's git-diff scan, coverage from parsed vitest JSON, prompt stats from retro outcomes, debt rate from the debt store. Add assertions that a metric feeding a learning/decay loop is non-constant across sprints (a test that flags any metric hardcoded to 0/literal). Wire recordCrossVerifyVerdict and version-stats updates into the retro phase so the feedback loop actually closes.

### R6. Silent fallback / yutulan-hata / unwired-feature varsayılan başarısızlık modu — feature'lar görünmez şekilde fail ediyor  🟠 `high`

**Mekanizma:** Provider-health boş if-body'ye okunuyor, notification-config kabul-ama-teslim-edilmez, fail-safe catch-and-continue hook'ları hatayı yutuyor, getMessage miss'te key döner. Hata yüzeye çıkmak yerine sessizce kayboluyor.

**Kanıt dosyaları:** `src/core/provider.ts` · `src/core/notify-bootstrap.ts` · `src/dashboard/src/lib/api.ts` · `src/dashboard/src/components/SprintControlPanel.tsx` · `src/cli/helpers/messages.ts` · `src/mcp/tools/kill.ts` · `src/mcp/tools/plan.ts` · `src/cli/commands/chat.ts` · `src/cli/helpers/review-actions.ts`

**Düzeltme yönü:** Make silent failure illegal on user-facing and security paths: surface caught errors to the sprint outcome / UI instead of catch-and-continue; have getMessage throw (or log+flag) on missing keys in dev; forward the session token in the shared fetch layer and add a 401 listener. Adopt a 'no orphan export' rule — any exported production symbol with zero callers must be either wired or deleted, enforced by a periodic dead-code audit, so 'built but never connected' cannot accumulate.

### R7. Soft mimari-kurallar (ESM disiplini, async-I/O standardı, scope-sanitizer) dokümante ama mekanik enforce edilmiyor — yavaş erozyon  🟠 `high`

**Mekanizma:** Pure-ESM modüllerde bare `require()` sessiz fallback'le geçiyor; ADR-087 async-mandate'i bir düzine dosyada `spawnSync` ile ihlal ediliyor (event-loop blocker). ADR-008 tek-yön-import kuralının lint'i YOK (package.json lint-zinciri yalnız `tsc --noEmit` + birkaç string-linter). Kural var, bekçi yok → kademeli bozulma.

**Kanıt dosyaları:** `src/orchestra/planner.ts` · `src/orchestra/task-restoration.ts` · `src/orchestra/baseline-tracker.ts` · `src/core/output-collector.ts` · `src/orchestra/promotion-pipeline.ts` · `src/nervous/runtime-scope-check.ts` · `src/orchestra/scope-sanitizer.ts` · `src/cli/commands/autonomous.ts`

**Düzeltme yönü:** Turn ADR constraints into mechanical lint gates: ban spawnSync in async modules via an ESLint/tsc rule (allowlist only documented sync-startup paths), ban bare require() in the ESM package, and reconcile scope-sanitizer rules with its doc + add prefix-aware protected-file matching. Wire enforceAdrCompliance (currently zero production callers and fails-open on error) into the actual evaluation path so an ADR violation is a real NO_GO rather than a doc.

### R8. Test-tiyatrosu — mock-only suite'ler ve ölü-koda pinlenmiş testler yeşil raporlarken canlı-path doğrulanmamış  🟠 `high`

**Mekanizma:** Bütün unit-under-test'i mock'layan testler mock'u test ediyor, gerçek davranışı değil; kaldırılmış/yeniden-adlandırılmış feature'a pinli testler; yapısal tautolojik assert'ler. Yeşil CI gerçek doğrulama değil.

**Kanıt dosyaları:** `tests/integration/notification-flow.test.ts` · `tests/agents/cross-sprint-analyzer.test.ts` · `tests/cli/agentic-session.test.ts` · `tests/mcp/helpers/format.test.ts` · `src/dashboard/src/components/SprintControlPanel.test.tsx` · `src/dashboard/src/__tests__/nav-single-source.test.tsx` · `tests/dashboard/worker-grid-live.test.tsx` · `src/mcp/helpers/format.ts`

**Düzeltme yönü:** Require behavior-level assertions on the live path: forbid tests that import a symbol with zero production callers (a test referencing dead code should fail a meta-test); replace whole-store mocks with tmpdir-backed real DBs for persistence tests; assert on real served HTML / real CLI stdout per the proof-of-function DoD; expand nav/i18n coverage tests to enumerate ALL routes/pages rather than a hardcoded subset so new surfaces cannot slip through unverified.

---

## 3. Cross-Check — İki Audit Ne Kadar Mutabık?

| Ölçü | Değer | Anlam |
|------|-------|-------|
| Phase-1 (CC) bulgu | 692 | adversarial-verified |
| Phase-2 (deckent) bulgu | 1361 | self-reported (repo-grep iddialı) |
| 🟢 CC bulgusu deckent-doğrulamalı | **396/692 (%57)** | iki bağımsız audit aynı sorunu buldu → **kesin** |
| 🔵 deckent-only (CC kaçırdı) | 820 | Phase-2 daha granülerdi; güvenmeden önce verify |
| 🟣 CC-only (deckent kaçırdı) | 296 | CC'nin adversarial-verify avantajı; deckent'in kör-noktası |
| Dosya-düzeyi: ikisi de flagledi | 379 | güçlü örtüşme |

**Yorum:** CC havuzunun %57'sinin deckent tarafından bağımsız doğrulanması, Phase-1'in sağlamlığını gösterir. deckent'in 296 CC-bulgusunu kaçırması ise *başlı başına bir bulgu*: **deckent'in kendi self-audit aracı bile eksik tarıyor** (R2/R8'in audit-aracına yansıması).

---

## 4. Bulgular — Kategori Kategori (TIER-1: iki audit de doğruladı, critical+high)

Bu bölümdeki her madde **hem CC hem deckent tarafından bağımsız** bulundu → en yüksek güven, işe buradan başlanmalı.

### 4.1 Kök-Neden bulguları (enforcement/eval omurgası)  _(59 TIER-1 crit/high)_

- 🔴 **CRITICAL** — assignVariant() ignores its experimentId parameter — A/B assignment is untracked pure random
  - The PromptABTester.assignVariant() is supposed to assign a test variant (A or B) for a specific experiment run. The experimentId is accepted as a parameter but immediately discarded (renamed _experimentId). The method returns pure 50/50 ran
  - 📍 `src/agents/prompt-analytics.ts`
- 🔴 **CRITICAL** — checkWorkerAuthority in agents/worker.ts returns true in BOTH branches — authority check is a structural no-op
  - The exported `checkWorkerAuthority` function in `src/agents/worker.ts` (line 584) wraps `authority-enforcer.checkAuthority` but unconditionally returns `true` in every code path. The `!result.allowed` branch logs a warning and emits an even
  - 📍 `src/agents/worker.ts`
- 🔴 **CRITICAL** — Lineage IDOR: server.ts dispatches registerAutonomousRoutes without req — tenant filter is permanently bypassed
  - The `/api/autonomous/lineage/:correlationId` endpoint has a tenant-scoping guard implemented in `registerAutonomousRoutes`, but the guard is only active when the `req` argument is provided. The production HTTP dispatcher in `server.ts` (bot
  - 📍 `src/api/server.ts`
- 🔴 **CRITICAL** — mTLS client-cert detection falls through without blocking — cert presence is detected, warned, then ignored
  - When a TLS client presents a certificate during WebSocket upgrade, the gateway detects it, optionally emits a console.warn, and then does nothing — the connection proceeds to standard bearer-token auth as if no cert was presented. This is a
  - 📍 `src/api/terminal/ws-gateway.ts`
- 🔴 **CRITICAL** — Entire helper subsystem (8 classes) built and tested but never wired into production — trust-without-verify at the sprint-review layer
  - The structural problem is that tests verify the helper classes in isolation while the production sprint lifecycle never imports them. This means: (1) recommendations about NO_GO tasks are never surfaced to the user at review time; (2) selec
  - 📍 `src/cli/helpers/review-actions.ts`
- 🔴 **CRITICAL** — audit-writer.ts chainHead is a process-wide singleton — cross-sprint chain verification always fails brokenAt:0
  - The module-level `chainHead` in `audit-writer.ts` is initialized once at module load (GENESIS) and accumulates across all `writeAuditEvent` calls for the entire process lifetime, regardless of which `sprintId` is being written. In short-liv
  - 📍 `src/core/audit-writer.ts`
- 🔴 **CRITICAL** — strictTenantIsolation defaults to false and config value is never threaded to MemoryStore — tenant data leak is structurally guaranteed
  - The MemoryStore tenant isolation mechanism is structurally bypassed: (1) the config field strict_tenant_isolation is read and stored in ResolvedDeckentConfig but never forwarded to MemoryStore constructors; (2) all production instantiations
  - 📍 `src/core/memory-store.ts`
- 🔴 **CRITICAL** — Config-driven Slack/Discord/Webhook notification config is silently accepted but never delivered — trust-without-verify gap
  - The structural root cause of the entire cluster's problems: bootstrapNotifyDispatcher() never reads DeckentConfig.notifications.webhook, .slack, or .discord. A user who configures these fields sees them validated by TypeScript and accepted 
  - 📍 `src/core/notify-bootstrap.ts`
- 🔴 **CRITICAL** — coverage metric is always hardcoded 0 throughout CI guardian — track_coverage config has no behavioral effect
  - The `track_coverage` config field and the `coverage` / `coverageDelta` fields in `CiBaseline`, `CiValidationResult`, and `CiReport` are fully declared types and defaults, but coverage is never measured. Every return path sets `coverage: 0` 
  - 📍 `src/core/plugin-hooks.ts`
- 🔴 **CRITICAL** — bootstrapProviders health-check result is read into an empty if-body — no behavioral effect on unhealthy providers
  - The bootstrap explicitly runs a health check over all registered providers, detects unhealthy state (not available or authStatus !== 'ok'), but the detection branch contains zero executable code. An unhealthy provider stays registered and i
  - 📍 `src/core/provider.ts`
- 🔴 **CRITICAL** — enforceRbac in rbac.ts is a NO-OP by design when rbacConfig.enabled is false — default is always false — making the entire RBAC gate permanently advisory
  - The RBAC system has two layers of opt-in that both default to disabled: (1) `rbacConfig.enabled` defaults to false in `enforceRbac()` → always returns true (allow) without calling `can()`; (2) `enforceRbac` config flag defaults to false in 
  - 📍 `src/core/rbac.ts`
- 🔴 **CRITICAL** — assertSpawnSafe security gate is advisory-only: ADR-006 spawn safety is documented but never enforced at spawn callsites
  - The entire spawn injection defense is structurally inert in production. Any user-controlled string that reaches a spawnSync/spawn callsite (plugin hook commands, provisioner commands, adapter test commands) is executed directly with no bina
  - 📍 `src/core/spawn-safety.ts`
- 🔴 **CRITICAL** — AgentDetail bypasses auth: raw fetch omits Authorization header, silently returns nothing when API token is configured
  - When the deckent server runs with an API token (auto-generated or configured), every request to /api/worker/:taskId/log from AgentDetail returns 401 Unauthorized. The component silently ignores the error and shows `t('agent.no_log')` as if 
  - 📍 `src/dashboard/src/components/AgentDetail.tsx`
- 🔴 **CRITICAL** — SprintControlPanel silently swallows all kill/cleanup errors — no user feedback on failure
  - Any failure of `/api/kill/all`, `/api/kill/:id`, or `/api/cleanup` is silently discarded. The user sees the loading spinner clear and the UI remain unchanged with no indication that the operation failed. This trust-without-verify pattern me
  - 📍 `src/dashboard/src/components/SprintControlPanel.tsx`
- 🔴 **CRITICAL** — Signal C (sequence monotonicity) in isWorkerStale can NEVER suppress a stale alert — logical dead code
  - The three-signal stale-detection strategy documents Signal C as a guard against false-positive stale alerts when a worker is active but heartbeat mtime was unchanged. In practice the guard is structurally tautological: `readHeartbeatCached`
  - 📍 `src/monitor/auditor.ts`
- 🔴 **CRITICAL** — RBAC enforcement is permanently soft by default — enforce_rbac flag defaults to false, making the authority check advisory-only with no block path in standard configuration
  - The ADR-037 RBAC authority matrix is structurally implemented but architecturally non-blocking by design. The gateway function `checkWorkerAuthority` accepts all requests when `enforceRbac` is false (the default), regardless of whether the 
  - 📍 `src/nervous/authority-matrix.ts`
- 🔴 **CRITICAL** — handleSuggestTimeout auto-applies actions without consulting the canAutoApplyMap predicate
  - The canAutoApply veto predicate (designed to block auto-application when conditions are unsafe) is only consulted in the 'approve' policy path. Actions with 'suggest-5m' or 'suggest-30m' policy auto-apply unconditionally on timeout. This me
  - 📍 `src/nervous/executor.ts`
- 🔴 **CRITICAL** — authority-enforcer ADR compliance (enforceAdrCompliance) fails open on any internal error — ADR violations are silently masked
  - The outer try/catch in `enforceAdrCompliance` deliberately returns `pass: true` on any internal failure, documented as 'Fail-safe: do not block the task'. This means a file-system error, encoding issue, or unexpected input causes the enforc
  - 📍 `src/orchestra/authority-enforcer.ts`
- 🔴 **CRITICAL** — Sprint-kind entries receive unconditional ok=true — runSprint result is trust-without-verify
  - When an autonomous backlog entry of `kind=sprint` runs, the dispatcher accepts that the sprint 'succeeded' purely because `runSprint` did not throw an exception. The sprint may have produced NO_GO evaluations, tech debt, or partial failures
  - 📍 `src/orchestra/autonomous/execute-dispatcher.ts`
- 🔴 **CRITICAL** — v2 mission scheduler dispatches 'approval-required' and 'risk-tagged' work items without any policy check — human-in-the-loop guarantee is silently absent
  - The WorkItem schema documents policy='approval-required' as a human-in-the-loop park gate (messages.ts line 836, DIRECTIVES.md ADR-040). The v2 scheduler ignores this field entirely: it queries all pending items and claims them regardless o
  - 📍 `src/orchestra/autonomous/mission-store/mission-scheduler.ts`
- 🔴 **CRITICAL** — RBAC authority gate is permanently soft-warn in production: enforce_rbac defaults to undefined (falsy) with no config default, making the hard-deny path unreachable
  - The ENT-1 RBAC enforcement gate across the entire autonomous dispatch path (backlog-entry gate, sprint-spawn gate, autonomous policy gate) is structurally guaranteed to be a no-op in the default deployment. The gate reads `config.enforce_rb
  - 📍 `src/orchestra/autonomous/runtime-loop.ts`
- 🔴 **CRITICAL** — Cross-verify REFUTED verdict is purely advisory with no enforcement path — a structural trust-without-verify guarantee
  - The cross-verify feature is designed end-to-end as advisory only: a second provider can declare that a task is REFUTED (wrong/broken), but the system takes exactly zero corrective action. The DONE evaluation stands, no FIX task is created, 
  - 📍 `src/orchestra/cross-verify-runner.ts`
- 🔴 **CRITICAL** — handleWorkerQuestion always auto-responds 'continue', silently discarding worker's suggestedAction ('abort' / 'retry' / 'skip')
  - When a worker calls askBrain() with suggestedAction='abort' or 'retry', Brain auto-answers 'continue' regardless. This means a worker that detects a fatal dependency conflict and suggests 'abort' will be told to continue, masking the condit
  - 📍 `src/orchestra/ipc-registry.ts`
- 🔴 **CRITICAL** — reconcileRubricNoGo accepts worker-self-reported coverage as ground truth to flip Brain NO_GO to DONE
  - A worker can write `coverage: 80` in their result file and, combined with a high rubric score, have a Brain NO_GO overridden to DONE with zero independent verification. This inverts the ADR-037 Authority Matrix (Brain is evaluation authorit
  - 📍 `src/orchestra/mid-sprint-adapter.ts`
- 🔴 **CRITICAL** — monitor-adapter.ts uses spawnSync — blocks event loop in async context, violating ADR-087
  - The three MonitorAdapter implementations (Docker, Tmux, Subprocess) all use synchronous spawnSync internally while advertising async Promise-returning interfaces. If this adapter were wired into the Auditor scan loop or any async context, e
  - 📍 `src/orchestra/monitor-adapter.ts`
- 🔴 **CRITICAL** — Post-sprint smoke defaultSmokeRunner is an unconditional no-op stub — even when wired, it would silently pass every verify task
  - The smoke runner injection point exists specifically to allow production wiring of a real binary-run verifier. However the default implementation is documented as 'no-op stub' and always returns `passed: true` with an output string saying '
  - 📍 `src/orchestra/post-sprint-smoke.ts`
- 🔴 **CRITICAL** — runHonestyCheck stub always returns 0 — honesty gate in runSelfAuditGate can never trigger via the stub path, creating a trust-without-verify gap
  - The exported `runHonestyCheck` is a permanent stub (returns 0 forever). It was the intended integration point for honesty verification but was never wired. The backup honesty check inside `runSelfAuditGate` has its own structural weakness: 
  - 📍 `src/orchestra/sprint-finalizer.ts`
- 🔴 **CRITICAL** — SprintMetrics.boundaryViolations is always hardcoded to 0 — boundary violation check in retro is permanently wrong
  - The `boundaryViolations` field in `SprintMetrics` is always written as literal `0` in every code path that computes it. The retro therefore always reports 'No boundary violations detected' (sprint-retro-writer.ts:404, 1110) even when worker
  - 📍 `src/orchestra/sprint-metrics.ts`
- 🔴 **CRITICAL** — RBAC enforcement defaults to advisory-only (warn-not-block) — security gate is structurally soft
  - The RBAC gate (ADR-037) warns, emits, and audit-trails role violations but never blocks them unless `enforce_rbac: true` is explicitly set in config. Since the default is `false` (and no documented onboarding step sets it to `true`), every 
  - 📍 `src/orchestra/sprint-runtime.ts`
- 🔴 **CRITICAL** — spawnSync in task-restoration.ts runs inside async finalizeSprint, violating ADR-087 and blocking the event loop
  - Each sprint finalization blocks the Node.js event loop for up to 30 seconds while tar creates a snapshot. For projects with many task files this is a guaranteed event-loop stall during cleanup. The same function also contains two additional
  - 📍 `src/orchestra/task-restoration.ts`
- 🔴 **CRITICAL** — BedrockAdapter registered as ProviderAdapter but spawn() always throws — HTTP send() path unreachable
  - BedrockAdapter is conditionally bootstrapped when AWS credentials are present and is registered in the provider registry. However: (1) its `spawn()` unconditionally throws `ProviderError('bedrock is an HTTP-only adapter — use send() instead
  - 📍 `src/providers/bedrock.ts`
- 🟠 **HIGH** — IMMUTABLE_CORE claims rm -rf / force-push / secrets never auto-run but the programmatic SAFE_FLOOR only covers 3 deckent_ orchestration tools
  - The safety guarantee in the system prompt is advisory (model-level instruction) while the programmatic floor covers only three deckent orchestration commands. Destructive shell operations (rm -rf, git force-push, writes to secret files) can
  - 📍 `src/agent/identity.ts`
- 🟠 **HIGH** — OpenAI adapter silently drops tool calls when finish_reason is 'stop' instead of 'tool_calls'
  - The OpenAI-compatible SSE adapter accumulates tool-call argument fragments in `toolAcc` (a Map keyed by streaming index), but only flushes (yields) them when `choice.finish_reason === 'tool_calls'`. Providers that deviate from OpenAI's exac
  - 📍 `src/agent/provider-tooluse/openai.ts`
- 🟠 **HIGH** — F5 evolution feedback loop structurally broken: no version stats ever written, retro wire never invoked — evolution is permanently silent
  - The prompt evolution system has three hard requirements that are all simultaneously unmet: (a) version usage stats must be updated after each task evaluation so `PromptMetrics` has real signal; (b) the evolution suggestion must be generated
  - 📍 `src/agents/prompt-version.ts`
- 🟠 **HIGH** — Lineage branch calls deriveRequestPrincipal without authGateVerified — isAdmin bypass via forged role claim
  - Even when `req` is eventually passed (which currently cannot happen — see separate finding), the lineage handler calls `deriveRequestPrincipal(req)` without the `{ authGateVerified: true }` option, then immediately trusts `principal.role ==
  - 📍 `src/api/autonomous-endpoint.ts`
- 🟠 **HIGH** — `deckent nervous edit` bypasses the live-executor IPC gate, causing two-writer race and audit divergence
  - When the Nervous System executor process is running, `accept` and `reject` correctly route through the IPC queue so the executor's parked approval promise resolves, and only the executor writes the result. `edit`, however, directly mutates 
  - 📍 `src/cli/commands/nervous.ts`
- 🟠 **HIGH** — resume command re-enters runSprint without passing completed-task list — already-done tasks will be re-executed
  - The resume flow correctly detects which tasks completed during the crash (line 62–72), deletes stale `.hb` and `.partial-result` artifacts for non-completed tasks (lines 139–163), and prints a count of completed tasks. However, because `Run
  - 📍 `src/cli/commands/resume.ts`
- 🟠 **HIGH** — Discord's sendMessage silently drops the message if the channel is not found or is not text-based — no error propagated
  - DiscordConnector.sendMessage() has a silent success path where the message is never actually sent. The condition on line 66 guards delivery: if it evaluates false (wrong channel type, or the channel was deleted/unreachable and channels.fetc
  - 📍 `src/connectors/discord.ts`
- 🟠 **HIGH** — Silent catch in resolveAndAck — failed approval resolutions give user zero feedback
  - The 'fail-safe' comment justifies swallowing the exception to protect the poller, but the consequence is that when an approval command fails (the resolution throws), the user's 'approve <id>' message is consumed and silently discarded — the
  - 📍 `src/connectors/incoming-command-router.ts`
- 🟠 **HIGH** — CascadeDetector.onResult does not re-check paused state — sprint can continue processing after PAUSE_SPRINT is returned
  - The CascadeDetector is documented to pause the sprint on 5 consecutive NO_GO results and require manual resume. However, onResult() does not guard on `this.paused` at its entry point (unlike `this.halted`). If a caller ignores the PAUSE_SPR
  - 📍 `src/core/cascade-detector.ts`
- 🟠 **HIGH** — nextSequence() claims to be atomic but performs non-atomic read-modify-write on the sequence file, allowing duplicate sequence numbers under concurrent workers
  - The sequence number is used by sprint-spawner.ts (line 947: `readSequence`) to know the event offset for live-tail consumers and `deckent_watch` backfill. Duplicate sequence numbers break the monotonic ordering guarantee (ADR-035 Protocol V
  - 📍 `src/core/event-stream.ts`
- 🟠 **HIGH** — runPostFinalizeHooks: all steps are fail-safe (catch-and-continue) with no way to surface failures to the sprint outcome
  - The post-finalize hook chain is designed as entirely fail-safe: every step continues even if a prior step throws. This means a corrupted or missing memory.db, a failed ADR sync, or a failed rule regeneration is swallowed silently. The error
  - 📍 `src/core/identity-generator.ts`
- 🟠 **HIGH** — AST security scan in skill-sandbox silently falls back to no-op when TypeScript compiler is unavailable at runtime
  - The two-pass security scan (regex + AST) degrades to a single-pass regex scan whenever `typescript` is not installed as a runtime dependency. In a production npm install (`npm install --omit=dev`), TypeScript is absent and the AST scanner r
  - 📍 `src/core/marketplace/skill-sandbox.ts`
- 🟠 **HIGH** — OutputCollector uses spawnSync for docker/tmux polling, blocking the event loop in the hot polling path
  - The adaptive polling loop is async (setTimeout-scheduled) but the actual capture functions synchronously block via spawnSync. When docker or tmux is slow, the entire Node.js event loop freezes for up to 10 seconds per poll cycle. ADR-087 (A
  - 📍 `src/core/output-collector.ts`
- 🟠 **HIGH** — siem-forwarder is default-off (no-op) with no enforcement: missing transport silently discards all audit events with no observable signal
  - The default-off design means a misconfigured integration (transport option omitted or config lookup fails) produces no error, no warning, and no observable failure — audit events are collected, buffered, then silently dropped on flush. This
  - 📍 `src/core/siem-forwarder.ts`
- 🟠 **HIGH** — WorkersPage kill failure is silently swallowed with no user feedback — operator blindness on kill failure
  - When an operator clicks 'Kill Worker' and the API call fails, the UI silently continues with no error message. The premise 'next poll/SSE tick reconciles the grid' is wrong for a kill failure: the grid reconciling will show the worker still
  - 📍 `src/dashboard/src/pages/WorkersPage.tsx`
- 🟠 **HIGH** — DebtTrendAnalyzer always computes 0% debt rate — detector permanently inert
  - The detector is enabled in production config (debt_trend.enabled=true, threshold_rate=0.15) and registered in DetectorRegistry, but it can never exceed the 0.15 threshold because the memory entries it reads (type='memory' written by writeRe
  - 📍 `src/nervous/detectors/debt-trend.ts`
- 🟠 **HIGH** — v2 engine boot path omits store.recover() — items stuck 'running' after a crash are permanently orphaned
  - After a process crash (SIGINT, OOM, host reboot), any WorkItem whose status was flipped to 'running' by `claimItem()` but never completed will stay 'running' in SQLite across restarts. The v2 engine never calls `store.recover()` to reset th
  - 📍 `src/orchestra/autonomous/mission-store/mission-engine-wire.ts`
- 🟠 **HIGH** — SqliteMissionStore.recover() is defined in the interface but never called — crash recovery is permanently inoperative
  - After a crash or SIGKILL, work-items that were in `status='running'` remain permanently stuck in that state because `recover()` resets them to `'pending'` but is never invoked on boot. The scheduler's `queryDue()` queries only `status='pend
  - 📍 `src/orchestra/autonomous/mission-store/sqlite-mission-store.ts`
- 🟠 **HIGH** — deckent_watch MCP tool subscribes to eventBus but never calls watchFile() — receives zero live events
  - The deckent_watch MCP tool (`src/mcp/tools/watch.ts`) correctly calls eventBus.tail() for backfill and eventBus.subscribe() for live events. However, since writeEvent() in core/event-stream.ts writes ONLY to the JSONL file (no in-process pu
  - 📍 `src/orchestra/event-bus.ts`
- 🟠 **HIGH** — planner.ts uses spawnSync for AI planner subprocess calls — violates ADR-087 (Async I/O Standard) and can block the event loop
  - Both callBrainPlannerWithReason and callZeroConfigPlanner use synchronous spawnSync with a default timeout of 900 seconds. During AI planner calls, the entire Node.js event loop is blocked for up to 15 minutes. This violates ADR-087 which p
  - 📍 `src/orchestra/planner.ts`
- 🟠 **HIGH** — applyTechDebtDowngrade verify-delta gate is a trust-without-verify pattern: Brain accepts worker's DONE claim without reading the verify-delta file it requires workers to write
  - Workers are required (by karpathy-discipline.md and DIRECTIVES) to write a .verify-delta.json baseline at task start. applyTechDebtDowngrade is designed to read the completion ratio from this file and downgrade DONE claims where <80% of ori
  - 📍 `src/orchestra/result-evaluator.ts`
- 🟠 **HIGH** — Sprint lifecycle events emitted as 'deckent-event' on EventEmitter have no listeners — NervousObserver receives no phase changes
  - All sprint lifecycle phase change events are emitted directly on the EventEmitter with channel name 'deckent-event', bypassing the publish() method. NervousObserver subscribes to the 'event' channel (emitted only by publish()). The result i
  - 📍 `src/orchestra/sprint-controller.ts`
- 🟠 **HIGH** — runDecayPhase drops decaySprints config — memory-loss regression if called
  - If `runDecayPhase` is ever called — e.g. by an operator or future code author who sees the exported function — it will silently decay memory entries 2.5× more aggressively than the configured value (8 sprints instead of the default 20), rep
  - 📍 `src/orchestra/sprint-phases.ts`
- 🟠 **HIGH** — Legacy spawn path re-spawns non-PENDING tasks — tasks in EXECUTING/DONE/NO_GO status eligible for duplicate spawn
  - When `dependency_pipeline_enabled=false` (the historic default), `spawnWorkers` may attempt to spawn tasks that are already `EXECUTING`, `DONE`, `NO_GO`, or `CLAIMED`, resulting in duplicate spawn calls. The blocked-task guard at line 454 o
  - 📍 `src/orchestra/sprint-spawner.ts`
- 🟠 **HIGH** — task-mode-runner.ts comment claims deckent_run MCP uses runTaskMode, but MCP reimplements the same logic independently
  - The MCP deckent_run tool silently diverges from the task-mode-runner canonical path. The assertTaskMode guard (which validates deckent_style=task) is never called for MCP runs. The eventBus TASK_MODE_START event is never emitted for MCP tas
  - 📍 `src/orchestra/task-mode-runner.ts`
- 🟠 **HIGH** — Codex and Gemini worker heartbeats are written once at spawn with sequence:0 and never updated — causing persistent stale_heartbeat auditor violations
  - Codex and Gemini workers spawn external CLI child processes. The parent adapter writes a single heartbeat at spawn time and never touches it again. The child process (codex/gemini CLI) has no mechanism to write deckent `.hb` files. Unlike t
  - 📍 `src/providers/codex.ts`
- 🟠 **HIGH** — SandboxSpawnBackend.buildEnv() is never called from spawn() — memory limit and network block are silently dropped
  - The sandbox's core security guarantees (memory cap via NODE_OPTIONS --max-old-space-size, and network blocking via proxy env vars) are implemented in buildEnv() but that function is never called, and even if called, the result cannot be inj
  - 📍 `src/providers/sandbox.ts`
- 🟠 **HIGH** — aligned and general corpora share the same MsgExample object references
  - Both `general` and `aligned` receive the exact same object reference. Any downstream consumer (e.g. in scripts/extract-traces.mjs) that mutates a `general` entry — such as adding/removing messages, or transforming tool_calls — will silently
  - 📍 `src/training/cc-trace-extractor.ts`

### 4.2 Dormant — yalan-söyleyen ayarlar & ölü-feature'lar  _(27 TIER-1 crit/high)_

- 🔴 **CRITICAL** — `DeriveRequestPrincipalOptions.authGateVerified` / `RequestPrincipal.claimsVerified` never set in production
  - The `claimsVerified` flag was designed as a defense-in-depth signal: callers behind the auth-gate should pass `{ authGateVerified: true }` so that downstream authorization decisions can distinguish verified from unverified JWT claims (`pars
  - 📍 `src/api/auth-me-endpoint.ts`
- 🔴 **CRITICAL** — enforce_least_privilege config flag never reaches createAuditedCapabilityRegistry — least-privilege gate permanently off
  - The F8-003 capability least-privilege hard-flip (`enforce_least_privilege` in DeckentConfig) is designed to set `CapabilityRegistry.leastPrivilegeEnabled = true`, causing every capability invocation to hard-deny actors whose role lacks the 
  - 📍 `src/core/capability-runtime.ts`
- 🔴 **CRITICAL** — rollback_policy config field is defined and validated but never read by the sprint runner
  - The config schema (config-types.ts:484,896) accepts rollback_policy as 'never'|'on_failure'|'always'. It validates and serializes correctly (config.ts:682-685, 1477). The dashboard shows it (i18n keys config.field.rollback_policy.*). The de
  - 📍 `src/orchestra/sprint-controller.ts`
- 🟠 **HIGH** — ComposeOptions.lang accepted by composeSystemPrompt() but never used in function body
  - The lang parameter is wired from config through three call layers (run.tsx → native-agent-bridge → loop.ts → composeSystemPrompt) but is silently discarded inside composeSystemPrompt. The system prompt always includes Turkish text in IMMUTA
  - 📍 `src/agent/identity.ts`
- 🟠 **HIGH** — PromptVersion.stats field is a dormant metric — always {uses:0, successRate:0} at runtime
  - The `stats` field on every `PromptVersion` object is defined and read (by `PromptMetrics.collectMetrics`, `PromptRollback.rollbackPrompt`, evolution trend analysis) but is never written to after initial creation. Every version's `uses` stay
  - 📍 `src/agents/prompt-version.ts`
- 🟠 **HIGH** — TerminalConfig fields (scrollbackBytes, idleTimeoutMs, maxSessions, allowShellKind) ignored — hardcoded values used instead
  - The `TerminalConfig` type defines user-tunable fields (`scrollbackBytes`, `idleTimeoutMs`, `maxSessions`, `allowShellKind`, `outboundDailyQuotaBytes`). These are declared in config-types.ts, defaulted in config.ts:207-214, and exposed in th
  - 📍 `src/api/server.ts`
- 🟠 **HIGH** — OutboundLimiter never instantiated or wired into attachTerminalGateway
  - The OutboundLimiter class (outbound-limiter.ts) and its companion config field `TerminalConfig.outboundDailyQuotaBytes` (config-types.ts:53) are fully implemented but never instantiated in production. The gateway's `limiter?: OutboundLimite
  - 📍 `src/api/terminal/outbound-limiter.ts`
- 🟠 **HIGH** — switchProvider option defined and loop-handled but never passed by any production caller
  - The /provider <name> slash command in the REPL loop reaches line 585 and calls opts.switchProvider?.(arg). Since switchProvider is never passed by entry.ts, the optional-chaining no-ops silently. The user sees a confirmation message ('switc
  - 📍 `src/cli/commands/chat-native.ts`
- 🟠 **HIGH** — `deckent chat --local` flag is defined but immediately errors with 'not yet wired'
  - The `--local` flag appears in the CLI help text and is type-safe in `ChatOptions`, but its handler immediately prints an error and exits. It has been in this state since Sprint 190. Any user who tries `deckent chat --local` receives a stub 
  - 📍 `src/cli/commands/chat.ts`
- 🟠 **HIGH** — --auto-approve CLI option on deckent run is silently ignored — always forced to true
  - The CLI option `--auto-approve` is advertised in the help text but its value from `opts.autoApprove` is discarded at line 257 where `autoApprove` is unconditionally set to `true`. Any operator expecting to control this permission gate via t
  - 📍 `src/cli/commands/run.ts`
- 🟠 **HIGH** — Provider cache reads but never uses cached data — always calls bootstrapProviders regardless
  - The ProviderCache mechanism (readProviderCache, isProviderCacheFresh, writeProviderCache) is wired to disk but has zero runtime behavioral effect. The cache freshness check exists but `bootstrapProviders` is invoked unconditionally either w
  - 📍 `src/cli/commands/start.ts`
- 🟠 **HIGH** — mcp_client_enabled config flag — defined, gated by, but never read from loaded config in production
  - The mcp_client_enabled flag is defined in mcp-bridge.ts's local interface and checked inside isMcpClientEnabled(), but: (1) it is not declared in DeckentConfig or any config type, so users cannot set it in .deckent/config.json; (2) run.tsx,
  - 📍 `src/cli/repl/mcp-bridge.ts`
- 🟠 **HIGH** — ConnectorConfig.webhookUrl and ConnectorConfig.options fields are defined but never read
  - ConnectorConfig declares two extension fields (webhookUrl for webhook-mode inbound, options for connector-specific configuration) that no connector implementation or bootstrap code ever reads. A caller setting either field gets no behaviora
  - 📍 `src/connectors/types.ts`
- 🟠 **HIGH** — boundary_enforcement config flag is defined but never read at runtime — auditor/monitor code has zero references to it
  - The ADR-037 comment in config-types.ts (line 806) says boundary enforcement is 'advisory/soft (V1.0 Layer-2 kasıtlı eksik — ihlal warn+emit edilir, bloke ETMEZ)'. But the config key itself is never consulted even to emit a warn — the audito
  - 📍 `src/core/config-types.ts`
- 🟠 **HIGH** — daily_max_usd and monthly_max_usd defined, settable, and displayed but never enforced as a spending gate
  - Users can set a daily budget cap and monthly budget cap through `deckent cost set-daily-max` and see them displayed in `deckent cost status`. However these values are never read by the pre-spawn cost gate (evaluateCostGate), the agent/guard
  - 📍 `src/core/cost-config-loader.ts`
- 🟠 **HIGH** — CollaborationConfig (sharedMemoryEnabled / parallelPipelines / conflictStrategy) — defined in schema, never read at runtime
  - The CollaborationConfig block expresses sprint-parallelism and shared-memory semantics (sharedMemoryEnabled, conflictStrategy), which would be critical orchestration knobs if wired. A user setting `collaboration.conflictStrategy: 'first_wri
  - 📍 `src/core/decision-config.ts`
- 🟠 **HIGH** — plugin_require_signature config knob defined but never forwarded to loadPluginHooks
  - The `plugin_require_signature` config field is defined in `ResolvedConfig` (config-types.ts:518), documented in the `loadPluginHooks` JSDoc (line 209), and implemented through to `validatePluginSecurity` in plugin-loader.ts (line 135). But 
  - 📍 `src/core/plugin-hooks.ts`
- 🟠 **HIGH** — RoutingDecision.contextFit field is computed but never read by any caller
  - The `assessContextFit` function runs on every `routeTaskV2` call, emits reasoning entries about context overflow/tight fit, but the resulting `contextFit` value on the RoutingDecision is never consumed. No task planner, runner, or controlle
  - 📍 `src/core/routing-engine.ts`
- 🟠 **HIGH** — Connector.healthCache is populated but never read
  - The health cache exists as private storage (session-interface.ts:37) and is populated on every healthCheck() call (line 107), but getAvailableProviders() documents that it 'uses cached health results' while actually ignoring healthCache ent
  - 📍 `src/core/session-interface.ts`
- 🟠 **HIGH** — telemetry_enabled and telemetry_anonymous config fields never read at runtime
  - The config schema declares two user-configurable telemetry fields (telemetry_enabled, telemetry_anonymous) and exposes them in the dashboard settings UI with labels and descriptions. Users can set these via `deckent config set telemetry_ena
  - 📍 `src/core/telemetry.ts`
- 🟠 **HIGH** — shouldDelay() / quiet-hours enforcement is implemented but never called in the live nervous pipeline
  - The quiet-hours feature (config: `nervous_system.quiet_hours`, default `22:00-08:00`) is defined in config-types.ts and loaded into the NervousSystemConfig that DecisionEngine receives, but the `shouldDelay()` method that enforces it is nev
  - 📍 `src/nervous/decision-engine.ts`
- 🟠 **HIGH** — NotificationDeliveryHealthDetector: NOTIFICATION_DELIVERY event type is never emitted
  - Both detection paths in NotificationDeliveryHealthDetector require data that is never present in any event: the cron path needs `notificationsSent`/`notificationsFailed` in the payload (never set by observer), and the NOTIFICATION_DELIVERY 
  - 📍 `src/nervous/detectors/notification-delivery-health.ts`
- 🟠 **HIGH** — TaskModeIdleDetector is permanently inert: the cron event never carries lastUserActivity
  - The TaskModeIdleDetector's detect() method exits immediately at line 46 (returns null) on every single cron tick because `lastUserActivity` is absent from the event payload. Even if deckent_style were set to 'task', the detector would never
  - 📍 `src/nervous/detectors/task-mode-idle.ts`
- 🟠 **HIGH** — policyEngine DI slot never wired — F10-001/002 policy+risk gate permanently disabled
  - The policy-engine and risk-gate feature (F10-001/002) is fully implemented inside the dispatcher but the wiring point is an optional DI field that is never populated by any production composition root. The result is that every autonomous en
  - 📍 `src/orchestra/autonomous/execute-dispatcher.ts`
- 🟠 **HIGH** — sync_on_finalize config knob is permanently off — doc-tracking sprint hook never fires in practice
  - ADR-090 defines a doc-tracking sync hook that runs at sprint finalize, but the config gate (`=== true`) coupled with the missing default value means this hook has never executed in production. The feature is fully implemented (sync.ts, mayb
  - 📍 `src/orchestra/sprint-finalizer.ts`
- 🟠 **HIGH** — history_scaling_enabled=true by default but SprintHistory is always zero-filled, making historyFactor permanently 1.0
  - The history-adaptive timeout feature is fully implemented in code but permanently disabled at runtime because all callers pass a zero-filled SprintHistory sentinel. The config knob history_scaling_enabled is a no-op gate: toggling it has no
  - 📍 `src/orchestra/timeout-estimator.ts`
- 🟠 **HIGH** — ClaudeAdapter 'mcp' backend is schema-exposed but permanently blocked — all three entry points throw or return false
  - The 'mcp' backend is listed as a valid configuration value for `claude_backend` in the config schema, the dashboard UI labels, and the TypeScript type — but all execution paths guard it with a permanent throw or false return. Setting `claud
  - 📍 `src/providers/claude.ts`

### 4.3 Unwired — ölü-kod / latent (sıfır-caller export, erişilemez path)  _(73 TIER-1 crit/high)_

- 🔴 **CRITICAL** — SandboxSpawnBackend is never instantiated in any production code path
  - The SandboxSpawnBackend class (with memory limits, scope enforcement, and network blocking) is fully implemented but never wired into any production instantiation path. The sandboxMode flag travels through the call chain (MCP start → sprint
  - 📍 `src/providers/sandbox.ts`
- 🟠 **HIGH** — src/agents/cross-sprint-analyzer.ts — entire CrossSprintAnalyzer class has zero production callers
  - src/agents/cross-sprint-analyzer.ts defines a full CrossSprintAnalyzer class (lines 43-241) with completely different types (SprintEntry, CrossSprintReport, SprintRange) than the live implementation in src/orchestra/cross-sprint-analyzer.ts
  - 📍 `src/agents/cross-sprint-analyzer.ts`
- 🟠 **HIGH** — src/agents/permission-guard.ts — PermissionGuard class has zero production callers
  - PermissionGuard.validateAgentModification() enforces four RBAC rules (self-modification, tool escalation, agent config, auditor write). Despite being the declared enforcement mechanism, it is called only in tests. The live RBAC path goes th
  - 📍 `src/agents/permission-guard.ts`
- 🟠 **HIGH** — PromptEvolutionLog class (agents/prompt-evolution.ts) has zero production callers
  - The `PromptEvolutionLog` class that is supposed to record and retrieve agent prompt evolution history (`recordEvolution` writes to `.deckent/agents/{id}/evolution.json`) exists only in its own file. The orchestra-side `prompt-evolution.ts` 
  - 📍 `src/agents/prompt-evolution.ts`
- 🟠 **HIGH** — IPC PAUSE/RESUME/KILL messages sent to workers but worker-side listener (WorkerSideChannel) never instantiated
  - The WorkerChannel registry-based IPC subsystem (PAUSE, RESUME, KILL message types) is fully implemented but structurally unreachable. Brain sends PAUSE/RESUME via channel.pause()/channel.resume() guarded by 'if (channel)' — that guard is al
  - 📍 `src/agents/worker-ipc.ts`
- 🟠 **HIGH** — enforceVerifyLoop and the entire verify-loop function suite have zero production callers
  - All verification helper functions in worker-verify.ts (compilation check, test loop, coverage parse, async enforce gate) are exported through worker.ts but are never invoked by any production orchestration code. The worker processes (tmux/s
  - 📍 `src/agents/worker-verify.ts`
- 🟠 **HIGH** — authHealthCheck exported but never called in any production code path
  - The auth health check was designed to run inside docker worker containers before any task work, converting a silent auth-loss exit-0 into an honest NO_GO result. The CLAUDE_AUTH_REQUIRED=1 env flag is injected into docker containers, but th
  - 📍 `src/agents/worker.ts`
- 🟠 **HIGH** — agentic-session.ts exports are never consumed in production
  - The module provides a full DB-backed ChatMemoryAdapter (backed by MemoryStore.appendChatTurn) and session management. No production caller builds or passes this adapter to the REPL. Every chat turn therefore goes unrecorded in memory.db des
  - 📍 `src/cli/commands/agentic-session.ts`
- 🟠 **HIGH** — chat-mode.ts: resolveChatMode, filterRegistryByMode, isEnterpriseSlash never imported in production
  - The entire chat-mode.ts module — which resolves the 'user'|'enterprise' REPL operating mode, filters slash-command visibility by mode, and honours the DECKENT_CHAT_MODE env var (line 37) — has zero production importers. Enterprise slash vis
  - 📍 `src/cli/commands/chat-mode.ts`
- 🟠 **HIGH** — `renderStatusLine` exported but never called in production
  - `chat-status-line.ts` exports `renderStatusLine`, `StatusLineContext`, `StatusLineFields`, and `StatusLineConfigValue`. None of these are imported anywhere in production code. The module is entirely dead — it was removed from `entry.ts` dur
  - 📍 `src/cli/commands/chat-status-line.ts`
- 🟠 **HIGH** — doctor-format.ts: entire file is dead — zero production callers
  - doctor-format.ts was created as a Sprint 144 God-Object-Split of doctor.ts, but doctor.ts was never refactored to import from it. Instead, doctor.ts continues to define and use its own copies of every function (identical names, identical si
  - 📍 `src/cli/commands/doctor-format.ts`
- 🟠 **HIGH** — ProgressPersistence class has zero production callers
  - The entire ProgressPersistence class (save, load, isProgressStale, clear, getFilePath) and its FsAdapter interface are exported but never imported by any production module. Sprint progress state is never persisted via this mechanism at runt
  - 📍 `src/cli/helpers/progress-persistence.ts`
- 🟠 **HIGH** — ProgressRenderer class has zero production callers
  - ProgressRenderer.render(), renderBar(), renderWorkerRow() are exported but never called from any production code. Live sprint progress display does not use this renderer.
  - 📍 `src/cli/helpers/progress.ts`
- 🟠 **HIGH** — QueueDisplay class has zero production callers
  - QueueDisplay.formatQueue(), formatDependencyWait(), formatWaveDisplay() are all exported but never called from any production module. Queue state visualisation built but unconnected.
  - 📍 `src/cli/helpers/queue-display.ts`
- 🟠 **HIGH** — RecommendationEngine class has zero production callers
  - RecommendationEngine.generate() with all five check methods (checkNoGoFixes, checkTechDebtWarning, checkAgentSuggestions, checkCoverageRegression, checkAllDone) is fully implemented but no production code ever calls it. Sprint review/retro 
  - 📍 `src/cli/helpers/recommendations.ts`
- 🟠 **HIGH** — ReviewActions class has zero production callers
  - ReviewActions class (approveTask, rejectTask, retryTask, getReviewStatus, getAllReviewStatuses, isReviewComplete, loadState, saveState) is never instantiated in production. The live review command (src/cli/commands/review.ts) has its own in
  - 📍 `src/cli/helpers/review-actions.ts`
- 🟠 **HIGH** — ReviewSummary class has zero production callers
  - ReviewSummary.generate(), formatReviewSummary(), writeReviewReport() are exported but never called from any production code. Review output formatting in the live review command is done inline without this class.
  - 📍 `src/cli/helpers/review-summary.ts`
- 🟠 **HIGH** — SelectiveRetry class has zero production callers
  - SelectiveRetry.queueForRetry(), getRetryQueue(), clearRetryQueue(), generateRetryDirectives() are all exported but never called from production. The retry-queue-*.json files this class would manage are never read or written at runtime.
  - 📍 `src/cli/helpers/selective-retry.ts`
- 🟠 **HIGH** — RichSprintSummary class (sprint-summary.ts) has zero production callers
  - RichSprintSummary class with renderResultsSection, renderChangesSection, renderTestsSection is exported but never instantiated in production. The live sprint-finalizer.ts instead uses formatRichSprintSummary from sprint-summary-rich.ts (lin
  - 📍 `src/cli/helpers/sprint-summary.ts`
- 🟠 **HIGH** — terminal-utils.ts — all exports unreachable from production code
  - getTerminalWidth, truncateString, fitTable, clearLines and isInteractive are all exported but no production code imports terminal-utils.ts. Each caller in the codebase has its own private copy of getTerminalWidth (dashboard.ts:31, status-re
  - 📍 `src/cli/helpers/terminal-utils.ts`
- 🟠 **HIGH** — WorkerStatusTracker class — zero production callers
  - WorkerStatusTracker (with pollWorkerStatus, parseHeartbeat, isStale, statusToProgress) is exported but never imported in any production module. The class is tested in isolation but the live sprint pipeline reads heartbeats through separate 
  - 📍 `src/cli/helpers/worker-status.ts`
- 🟠 **HIGH** — ConnectorPool class has zero production callers — test-only artifact
  - ConnectorPool (register, get, has, getAll, broadcast, startAll, stopAll, onAnyMessage) is a fully implemented multi-connector dispatch abstraction that is never instantiated or imported by any production module. The production code chose a 
  - 📍 `src/connectors/connector-pool.ts`
- 🟠 **HIGH** — getSkillAgentAffinityBonus / SKILL_AGENT_MAP exported but never called in production
  - The skill→agent affinity bonus system (SKILL_AGENT_MAP, getSkillAgentAffinityBonus, SKILL_AGENT_AFFINITY_BONUS) was implemented in activation-engine.ts to fix an agent routing imbalance where skill assignments did not influence agent select
  - 📍 `src/core/activation-engine.ts`
- 🟠 **HIGH** — audit-export.ts: exportAuditLog and verifyHmacChain have zero production callers
  - The compliance-grade HMAC-chain audit export functionality (`exportAuditLog`, `verifyHmacChain`) defined in `audit-export.ts` is a complete, functional implementation with no production consumer. No CLI command, API endpoint, or MCP tool im
  - 📍 `src/core/audit-export.ts`
- 🟠 **HIGH** — SessionStore (auth-session.ts) has zero production callers
  - SessionStore provides SSO session lifecycle (create/resolve/revoke/prune) with optional persistence hook. It is a complete, well-tested implementation but is never instantiated or imported by any production code path. The session management
  - 📍 `src/core/auth-session.ts`
- 🟠 **HIGH** — CascadeDetector: sprint 140 cost-explosion guard has zero production callers
  - The CascadeDetector class (src/core/cascade-detector.ts) was implemented to prevent the Sprint 140 $42 cost cascade (197 workers × 100% NO_GO in 14 minutes). The module exports CascadeDetector, DEFAULT_CASCADE_CONFIG, and related types. No 
  - 📍 `src/core/cascade-detector.ts`
- 🟠 **HIGH** — CredentialManager and all credential helpers have zero production callers
  - The entire credentials.ts module — CredentialManager class with storeCredential, getCredential, deleteCredential, updateCredential, hasCredential, getCredentialEntry, and the three convenience exports — is dead in production. AES-256-GCM en
  - 📍 `src/core/credentials.ts`
- 🟠 **HIGH** — createDefaultDecisionConfig / createDefaultLearningConfig / createDefaultCollaborationConfig / validateDecisionConfig / validateLearningConfig / validateCollaborationConfig — zero production callers
  - decision-config.ts exports six functions (three factory, three validation) for DecisionEngineConfig, LearningConfig, and CollaborationConfig. None are called in production code. The types are imported by config-types.ts (for schema purposes
  - 📍 `src/core/decision-config.ts`
- 🟠 **HIGH** — buildErpConnectorFromDeck — .deck-aware ERP factory has zero production callers
  - The purpose of `buildErpConnectorFromDeck` is to load ERP credentials from the project's `.deck` secret file (ADR-014) rather than from `process.env`. The code comment on lines 5-18 explains this separation. However, both production call si
  - 📍 `src/core/erp-connector.ts`
- 🟠 **HIGH** — global-config.ts: all six exported functions have zero production callers
  - The entire global-config.ts module is dead code. config.ts reads GLOBAL_CONFIG_PATH directly via its own readJsonFile helper and performs its own deepMerge (lines 1292-1293, 1466, 1576-1578). No production file imports from global-config.ts
  - 📍 `src/core/global-config.ts`
- 🟠 **HIGH** — resolveInteractionPolicy and InteractionPolicy have zero production callers
  - The interaction-policy.ts module defines three interaction policies (batch/interactive/streaming) with behavioral flags (autoApproveDefault, promptUser, streamOutput) and the resolver resolveInteractionPolicy. The InteractionMode type propa
  - 📍 `src/core/interaction-policy.ts`
- 🟠 **HIGH** — DependencyResolver class has zero production callers
  - The full skill dependency resolution subsystem (topological sort, cycle detection, conflict resolution, install ordering) is implemented but never instantiated or called in any production code path. No CLI command, MCP tool, or sprint lifec
  - 📍 `src/core/marketplace/dependency-resolver.ts`
- 🟠 **HIGH** — RatingSystem class has zero production callers
  - The skill rating subsystem (local success-rate based rating, user submissions 1-5, ratings file persistence) is fully implemented but never called from any CLI command, MCP handler, sprint reporter, or other production path. No skill perfor
  - 📍 `src/core/marketplace/rating-system.ts`
- 🟠 **HIGH** — exportAdrsToFs (DB→FS ADR reverse sync) has zero production callers
  - The DB→FS ADR reverse sync direction is exported and tested but never invoked by any sprint finalizer, memory command, identity generator, or adr-file-sync module. The FS→DB direction (syncAdrFilesToDb in adr-file-sync.ts) is wired. The rev
  - 📍 `src/core/memory-export.ts`
- 🟠 **HIGH** — notification-config.ts is entirely unimported in production — all three exports are test-only
  - This module was created to validate and resolve `NotificationConfig` but the real config system uses zod schemas (`src/core/config.ts`). The `resolveNotificationConfig` function is a shadow of what config.ts already does for notifications i
  - 📍 `src/core/notification-config.ts`
- 🟠 **HIGH** — DiscordNotificationProvider (notification-providers/discord.ts) is never wired into the production notification pipeline
  - The Discord provider class exists and implements the `NotificationProvider` interface, but no production code path ever creates an instance or passes it to `NotificationDispatcher.setDiscordProvider()`. As a result, Discord webhook configur
  - 📍 `src/core/notification-providers/discord.ts`
- 🟠 **HIGH** — SlackNotificationProvider, DiscordNotificationProvider, WebhookNotificationProvider — zero production callers
  - Three fully-implemented notification provider classes — SlackNotificationProvider (slack.ts:35), DiscordNotificationProvider (discord.ts:57), WebhookNotificationProvider (webhook.ts:28) — are exported but never consumed by any production co
  - 📍 `src/core/notification-providers/slack.ts`
- 🟠 **HIGH** — NotificationDispatcher class (notifications.ts) — never instantiated in production
  - The NotificationDispatcher class at src/core/notifications.ts:39, including its dispatch() method at line 69 and all provider registration methods (lines 47, 54, 61), is dead in production. The live runtime uses NotifyDispatcher from notifi
  - 📍 `src/core/notifications.ts`
- 🟠 **HIGH** — src/core/provider-capabilities.ts has zero production callers — entire module is dead
  - The entire provider-capabilities module — which defines the canonical capability matrix (streaming, toolUse, vision, codeExecution, maxContextTokens, costPerMillionTokens) per provider — is imported only by its own test file. No production 
  - 📍 `src/core/provider-capabilities.ts`
- 🟠 **HIGH** — PendingDispatchQueue class (self-dispatch.ts) has zero production callers
  - The `PendingDispatchQueue` class and its companion `PendingDispatchEntry` interface represent the human-approval gate for autonomous dispatch, which is the critical ADR-040 / 'Alperen onayı' safeguard. The class exists and has well-document
  - 📍 `src/core/self-dispatch.ts`
- 🟠 **HIGH** — SkillLoadingCache class has zero production callers
  - SkillLoadingCache (skill-cache.ts:25) exports a full LRU-eviction cache with preloadAll(), loadAndCache(), getCached(), isStale(), evict(), and clearCache() methods. None are called by any production module — only test files reference it. T
  - 📍 `src/core/skill-cache.ts`
- 🟠 **HIGH** — SkillRegistry class has zero production callers
  - SkillRegistry (skill-registry.ts:22) provides a JSON-backed central registry with register(), search(), getPopular(), getAll(), remove(), and count() operations backed by a skill-registry.json file. No production module imports or calls it.
  - 📍 `src/core/skill-registry.ts`
- 🟠 **HIGH** — spawn-safety.ts — assertSpawnSafe/isSpawnSafe have zero production callers
  - The entire spawn-safety module — a security primitive designed to whitelist binaries and sanitize args before any adapter-level child_process call (per ADR-006) — has no production callers. Every real spawnSync/spawn invocation in the codeb
  - 📍 `src/core/spawn-safety.ts`
- 🟠 **HIGH** — TelemetryCollector class has zero production callers
  - The TelemetryCollector class (enable/disable/record/flush/getEvents) is fully implemented but never instantiated or imported anywhere in production code (src/). The config fields `telemetry_enabled` and `telemetry_anonymous` are defined in 
  - 📍 `src/core/telemetry.ts`
- 🟠 **HIGH** — All 4 dashboard analytics classes have zero production callers
  - AgentComparisonData (agent-comparison-data.ts), SkillHeatmapData (skill-heatmap-data.ts), SuccessChartData (success-chart-data.ts), and AnalyticsData (analytics-data.ts) are fully implemented (240+ lines total) but never imported by any liv
  - 📍 `src/dashboard/analytics/agent-comparison-data.ts`
- 🟠 **HIGH** — AppShell component is never imported in any production code path
  - AppShell.tsx provides a full responsive grid shell with sidebar, theme toggle, and auth chip. The live application uses Layout.tsx instead (App.tsx line 33: `<Route element={<Layout />}>`). AppShell is a complete, dead alternative shell tha
  - 📍 `src/dashboard/src/components/AppShell.tsx`
- 🟠 **HIGH** — SprintControlPanel exported but has zero production callers
  - The SprintControlPanel component (kill-all/cleanup controls, phase timeline, worker grid, progress bar) was built but never placed in any dashboard route or page. All live sprint control UI in StatusPage or DashboardPage comes from other co
  - 📍 `src/dashboard/src/components/SprintControlPanel.tsx`
- 🟠 **HIGH** — WorkerGrid component exported but never imported by any production page
  - WorkerGrid wraps WorkerCardGrid with a 3-second useLiveData poll and a reconnecting indicator. It was built as a standalone live-data component for the workers view but was never wired into WorkersPage or any other page. The WorkersPage use
  - 📍 `src/dashboard/src/components/WorkerGrid.tsx`
- 🟠 **HIGH** — MultiSessionManager, copyToClipboard, getClipboardText never imported in production
  - The entire terminal-sessions.ts file — MultiSessionManager (the multi-session orchestration facade), copyToClipboard, and getClipboardText — is exported but has zero production callers. The TerminalPanel and DockPanel import getBootstrapTok
  - 📍 `src/dashboard/src/lib/terminal-sessions.ts`
- 🟠 **HIGH** — theme.ts exports (darkTokens, lightTokens, getThemeTokens, themeClasses) have zero production callers
  - The entire design-token system in theme.ts — dark/light color maps (darkColorTokens, lightColorTokens), shared spacing/radius/shadow scales, darkTokens, lightTokens, getThemeTokens(), and themeClasses — is exported but never consumed. Dashb
  - 📍 `src/dashboard/src/lib/theme.ts`
- 🟠 **HIGH** — getMcpConfig() exported but has zero production callers
  - getMcpConfig() describes how the VS Code extension should connect to the running Deckent MCP server, but nothing in production source code ever calls it. The stub activate() handler (lines 61–65) registers three no-op commands but never inv
  - 📍 `src/extensions/vscode/extension.ts`
- 🟠 **HIGH** — cleanupOrphanHBs / detectOrphans exported but never called in production
  - The orphan heartbeat detection and cleanup pipeline (ADR-043 Brain Crash Recovery Protocol) was implemented in Sprint 139 but never wired into the sprint lifecycle, scan loop, or recovery path. When a Brain crashes and restarts, old `.hb` f
  - 📍 `src/monitor/auditor.ts`
- 🟠 **HIGH** — enforceAdrCompliance (ADR layer-4 compliance gate) has zero production callers — only referenced by tests
  - `enforceAdrCompliance` scans worker-changed files for ADR-006/008/010 violations (shell:true, core→orchestra imports, package.json deps). It is defined, re-exported via `src/agents/auditor.ts`, and has a full test suite, but is never invoke
  - 📍 `src/orchestra/authority-enforcer.ts`
- 🟠 **HIGH** — MissionEventLog is exported but has zero production callers
  - The MissionEventLog class (`mission-events.ts`) provides per-mission JSONL event append/tail/reset, but no production code ever constructs or uses it. The v2 engine boot path (`runV2Engine`) builds only a MissionStore, DispatchFn, and deliv
  - 📍 `src/orchestra/autonomous/mission-store/mission-events.ts`
- 🟠 **HIGH** — ConflictResolver class has zero production callers
  - The `ConflictResolver` class — which detects `same_file_write`, `test_interference`, and `scope_overlap` conflicts among completed worker results — is exported but never instantiated in production. The class-based post-result conflict repor
  - 📍 `src/orchestra/conflict-resolver.ts`
- 🟠 **HIGH** — sprintMetricsUpdater exported but never registered — runs on no sprint
  - The `sprintMetricsUpdater` in `metrics-updater.ts` is fully implemented (updates sprint count, task count, test count proxy, success rate, and API call counts in README.md) but is never passed to `registerUpdater()` and is not re-exported f
  - 📍 `src/orchestra/doc-updaters/metrics-updater.ts`
- 🟠 **HIGH** — handleRateLimitFailover / applyRateLimitFailover never called in production
  - The 429/rate-limit failover path is fully implemented and tested but is never invoked in the live FIX phase. When a worker result carries a 429 note, the sprint does not fall back to an alternative provider; the task simply stays on the fai
  - 📍 `src/orchestra/mid-sprint-adapter.ts`
- 🟠 **HIGH** — monitor-adapter.ts (MonitorAdapter / createMonitorAdapter) has zero production callers
  - monitor-adapter.ts provides a backend-agnostic interface for listing active workers, capturing output, querying resource usage, and killing workers — across Docker, tmux, and subprocess backends. createMonitorAdapter() selects the right ada
  - 📍 `src/orchestra/monitor-adapter.ts`
- 🟠 **HIGH** — multi-agent.ts (definePipeline / runPipeline) is never imported from production code
  - The multi-agent.ts module defines a sequential pipeline executor for complex tasks (definePipeline validates steps, runPipeline runs them with a caller-supplied executor). This entire module is dead: no production caller imports it. The ner
  - 📍 `src/orchestra/multi-agent.ts`
- 🟠 **HIGH** — callZeroConfigPlanner, auditPlanGroundTruth, validateGoCriteriaScope, buildZeroConfigFallbackPlan — exported from planner.ts with zero production callers
  - Four exported functions introduced to support zero-config sprint planning, plan-time ground-truth auditing, and scope-sufficiency validation have never been wired into any production call site. `callZeroConfigPlanner` was meant to split nat
  - 📍 `src/orchestra/planner.ts`
- 🟠 **HIGH** — runPostSprintSmoke and all post-sprint-smoke exports have zero production callers — the entire post-sprint smoke phase never fires
  - post-sprint-smoke.ts implements a complete verify-task gating system: classifyVerifyTasks (title-based heuristic), shouldTriggerPostSprintSmoke (gate evaluation), collectUpstreamDeliverables, and runPostSprintSmoke (the orchestrating runner
  - 📍 `src/orchestra/post-sprint-smoke.ts`
- 🟠 **HIGH** — applyProofOfFunctionGate and verifyProofOfFunction have zero production callers — Tier-1 gate is never applied
  - The Proof-of-Function gate (ADR-079) promises that a Tier-1 task (CLI/API/dashboard) claiming DONE will have its Smoke: command actually run host-side and its decision downgraded to GO_WITH_TECH_DEBT if the smoke fails. Both key functions —
  - 📍 `src/orchestra/proof-of-function.ts`
- 🟠 **HIGH** — applyTechDebtDowngrade has zero production callers — verify-delta downgrade layer is dead
  - A two-layer evaluate architecture is described: 'Auditor = Layer 1, Brain = Layer 2' with applyTechDebtDowngrade as Layer 2. The function exports TECH_DEBT_DOWNGRADE_DONE_THRESHOLD = 0.8 and TECH_DEBT_DOWNGRADE_NO_GO_THRESHOLD = 0.5. Worker
  - 📍 `src/orchestra/result-evaluator.ts`
- 🟠 **HIGH** — ResultMerger class has zero production callers
  - The entire ResultMerger class (lines 30-100) — mergeResults() and detectOverlaps() — is exported but never imported or called anywhere in production src/. It was presumably planned to be used by result-collector.ts or sprint-phases.ts to co
  - 📍 `src/orchestra/result-merger.ts`
- 🟠 **HIGH** — getEffectClass() exported but has zero production callers; only tests call it
  - getEffectClass(task: Task) at rubric-registry.ts:397 maps a sprint Task to an EffectClass, but no production code ever calls it. The autonomous/policy-gate.ts module (the only consumer of EffectClass) derives the class via computeEntryEffec
  - 📍 `src/orchestra/rubric-registry.ts`
- 🟠 **HIGH** — enforceSelfModifyingTask() exported but has zero production callers
  - The function was designed as the enforcement decision-point for ADR-039 self-modification blocking (line 189: 'returns enforce if the task writes to self-modifying patterns'). Its return type includes `mode: 'enforce'` which is supposed to 
  - 📍 `src/orchestra/self-modifying-detector.ts`
- 🟠 **HIGH** — writeHonestCiBaseline has zero production callers
  - The `writeHonestCiBaseline` function (sprint-docs-updater.ts:267-297) implements a 'suspicious 0-pass' guard before writing CI baseline data to `.deckent/ci-baseline.json`. The function is exported but has no callers in production code. The
  - 📍 `src/orchestra/sprint-docs-updater.ts`
- 🟠 **HIGH** — sprint-estimator.ts: all exports have zero production callers
  - The entire sprint-estimator.ts module — 278 lines implementing heuristic sprint duration estimation, task complexity scoring, parallelism factors, historical data analysis, and dashboard integration — has no production callers. The exported
  - 📍 `src/orchestra/sprint-estimator.ts`
- 🟠 **HIGH** — runHonestyCheck is exported but never called in production
  - The function `runHonestyCheck` at sprint-finalizer.ts:156 is a stub (comment: 'Stub — Task 5 will implement comparison logic') that always returns 0 violations. It is exported and re-exported but never actually called during the sprint life
  - 📍 `src/orchestra/sprint-finalizer.ts`
- 🟠 **HIGH** — applyPersonaDomainCheck has zero production callers — persona rotation never activates
  - The persona-domain rotation logic (HIGH-mismatch agent swap) is implemented and tested but never called from any live sprint flow. The code comment at line 1566 says 'Wire point for sprint-planner.ts (see Sprint 197 task 197-005)' — indicat
  - 📍 `src/orchestra/task-builder.ts`
- 🟠 **HIGH** — restoreFromSnapshot has zero production callers
  - The snapshot restore capability (restoreFromSnapshot, verifySnapshot) exists only as dead code. Snapshots are created during sprint finalization but can never be restored via the production flow. The pre-archive safety net is write-only: a 
  - 📍 `src/orchestra/task-restoration.ts`
- 🟠 **HIGH** — task-retry.ts: all exports have zero production callers
  - The entire task-retry.ts module (shouldRetry, createRetryTask, retryDelay, getRetryCount, getRetryDelay, MAX_RETRY_COUNT, RETRY_BACKOFF_MS) is dead production code. The live sprint evaluation chain in result-evaluator.ts implements its own 
  - 📍 `src/orchestra/task-retry.ts`
- 🟠 **HIGH** — TimeoutWatcher class and all its exports are dead code — zero production callers
  - The entire `timeout-watcher.ts` module — `TimeoutWatcher` class, `createTimeoutWatcher` factory, `workerIdToTaskId`, and `parseGitDiffStatLines` — has zero production callers. The live timeout-extension logic instead lives in `sprint-phases
  - 📍 `src/orchestra/timeout-watcher.ts`

### 4.4 Inconsistent — SSOT-yok / duplicate / çakışan-default  _(40 TIER-1 crit/high)_

- 🔴 **CRITICAL** — Two divergent ROLE_CAPABILITY_MAP definitions with different roles and capability sets
  - There are two independent ROLE_CAPABILITY_MAP constants, one in capability-broker.ts (used for the capability invocation least-privilege gate) and one in nervous/authority-matrix.ts (used for worker authority enforcement). They use differen
  - 📍 `src/core/capability-broker.ts`
- 🔴 **CRITICAL** — NervousSystemConfig is defined twice with divergent schemas — nervous-types.ts vs config-types.ts
  - Two authoritative definitions of the same config interface exist. The nervous subsystem modules (dispatcher.ts, decision-engine.ts, bootstrap.ts, mcp/tools/nervous.ts) import the NARROWER nervous-types.ts version (6 fields, optional actionO
  - 📍 `src/core/nervous-types.ts`
- 🔴 **CRITICAL** — deckent_audit readOnlyHint:true but gate action writes files
  - The MCP tool annotation `readOnlyHint: true` tells MCP clients (including safety-checking models) that this tool performs no writes. In reality, every `action='gate'` call creates or overwrites `.deckent/recently-works/{sprintId}-gate.json`
  - 📍 `src/mcp/tools/audit.ts`
- 🔴 **CRITICAL** — Two divergent ROLE_CAPABILITY_MAP definitions with conflicting roles and capability sets
  - Two modules independently define and maintain the canonical role→capability mapping. They differ in: (1) role name taxonomy ('engineer' vs 'developer' for the intermediate dev role), (2) viewer capabilities (authority-matrix grants db-query
  - 📍 `src/nervous/authority-matrix.ts`
- 🔴 **CRITICAL** — SprintMetrics.noGoRate is stored as percentage (0-100) but consumed as fraction (0-1) in two distinct paths
  - SprintMetrics.noGoRate is always set as a percentage (0-100) by the authoritative producer (sprint-metrics.ts). At least four consumer sites treat it as a fraction (0-1): two display sites produce wildly inflated percentages (e.g. '5000.0%'
  - 📍 `src/orchestra/managed-docs/content-generators.ts`
- 🔴 **CRITICAL** — routing_engine defaults to 'v1' in sprint-planner and sprint-controller, 'v2' everywhere else
  - The canonical config default is v2 but the two most critical call sites (sprint planning and sprint FIX phase) default to v1. This means a sprint on a system where routing_engine is not explicitly set in config.json will plan tasks with v1 
  - 📍 `src/orchestra/sprint-planner.ts`
- 🟠 **HIGH** — buildNoGoResult in error paths uses fabricated testsPassed:false / coverage:0 instead of null
  - The file-level doc comment (lines 77-84) explicitly condemns the old `false`/`0` values as 'a fabricated measurement that suppressed Brain's anti-regression signal', explaining that `null` is the correct 'not measured' value. The success pa
  - 📍 `src/agents/agentic-worker-entry.ts`
- 🟠 **HIGH** — Duplicate CrossSprintAnalyzer with completely divergent interfaces — agents vs orchestra
  - Two independent CrossSprintAnalyzer implementations exist at agents/cross-sprint-analyzer.ts and orchestra/cross-sprint-analyzer.ts. They share the same class name and export the same interface name CrossSprintReport but with entirely diffe
  - 📍 `src/agents/cross-sprint-analyzer.ts`
- 🟠 **HIGH** — Duplicate calculateSelfHealingRate with different return types — number vs SelfHealingRate object
  - Two implementations of calculateSelfHealingRate exist with different signatures and semantics. The worker-lifecycle version (returns number) is never called in production — only re-exported. The sprint-metrics version (returns structured ob
  - 📍 `src/agents/worker-lifecycle.ts`
- 🟠 **HIGH** — Two incompatible checkWorkerAuthority functions with the same name exist in different modules
  - Both functions are named `checkWorkerAuthority` and both claim to implement ADR-037 authority checking, but they have entirely different call signatures, logic, and semantics. The `worker.ts` version takes a file path + scope and checks fil
  - 📍 `src/agents/worker.ts`
- 🟠 **HIGH** — Three divergent RateLimiter classes with incompatible interfaces coexist
  - The concept of rate-limiting is implemented three different ways in the same codebase. The production HTTP server uses server.ts's `check() → boolean` which silently drops `retryAfter` information: a 429 response (server.ts:423 `sendError(r
  - 📍 `src/api/server.ts`
- 🟠 **HIGH** — Agent sprint-stats fallback conflates mentions with successful tasks, inflating success rate to 100%
  - The correct fallback for 'no outcome data' is either to skip the sprint or record it with tasks=mentions and success=0. Setting success=mentions assumes every mention implies success, which is the opposite of reality when the mention occurs
  - 📍 `src/cli/commands/agent.ts`
- 🟠 **HIGH** — Three divergent `isNoColor()` implementations with different signatures
  - Three copies of `isNoColor` with divergent signatures exist in the codebase. The version in `dashboard.ts` takes an optional `flagValue?: boolean` parameter so it can honor the `--no-color` CLI flag; the other two only check the environment
  - 📍 `src/cli/commands/dashboard.ts`
- 🟠 **HIGH** — Duplicate HumanDoctorInput interface, PreFlightResult/runPreFlightHealthCheck, and helper functions across doctor.ts and doctor-format.ts / doctor-checks.ts
  - The Sprint 144 split created duplicate type and function definitions that have since diverged. The doctor.ts copy of `HumanDoctorInput` is the live version and has grown extra optional fields (`authProbes`, `workerImage`, `workerResources`)
  - 📍 `src/cli/commands/doctor.ts`
- 🟠 **HIGH** — RichSprintSummary interface defined in three places with diverging shapes (retro.ts, retro-parser.ts, sprint-summary.ts class)
  - The interface `RichSprintSummary` is duplicated across retro.ts and retro-parser.ts (structurally identical, so harmless between those two), but additionally a class named `RichSprintSummary` exists in sprint-summary.ts with different field
  - 📍 `src/cli/commands/retro.ts`
- 🟠 **HIGH** — watch.ts private getCurrentSprintId reads config.json/last_sprint_id, a third independent source
  - The CLI `watch` command has its own private local `getCurrentSprintId` that reads `.deckent/config.json` and returns `last_sprint_id`. This is a third independent implementation (in addition to monitor/sprint-state.ts and core/event-stream.
  - 📍 `src/cli/commands/watch.ts`
- 🟠 **HIGH** — Two divergent language-detection functions with different fallback behavior — getLangFromConfig vs detectLang
  - A user who has `LANG=tr_TR.UTF-8` in their environment but no `.deckent/config.json` will get Turkish strings from `detectLang` callers and English from `getLangFromConfig` callers, splitting the i18n experience across commands. Additionall
  - 📍 `src/cli/helpers/config-reader.ts`
- 🟠 **HIGH** — audit-writer.ts uses unkeyed SHA-256 but names the field 'hmac'; audit-export.ts uses keyed HMAC-SHA256 — incompatible chains
  - The in-stream chain built by `writeAuditEvent` uses an unkeyed SHA-256 hash (`createHash`), while the export chain built by `exportAuditLog` uses a keyed HMAC-SHA256 (`createHmac`). Additionally, the internal chain uses `canonicalJson` (sor
  - 📍 `src/core/audit-writer.ts`
- 🟠 **HIGH** — Handler requiredCapability strings use dot-notation ('db.read', 'net.read', 'shell.exec') but Capability type and ROLE_CAPABILITY_MAP use hyphen-notation ('db-query', 'network', 'shell')
  - The data and extended capability handlers declare requiredCapability strings ('db.read', 'mail.read', 'net.read', 'env.read', 'shell.exec') that are not in the canonical Capability union and are not present in any role's grant set in ROLE_C
  - 📍 `src/core/capability-handlers-data.ts`
- 🟠 **HIGH** — dependency_pipeline_enabled default is false in config-types docstring and REGEN_TEMPLATE_DEFAULTS, but true in resolveConfig runtime fallback
  - When a user runs `deckent` without a config entry for `dependency_pipeline_enabled`, the runtime default is `true` (wave-based scheduling active). But if they run `deckent doctor` or any config regen path, the written file gets `false`. Thi
  - 📍 `src/core/config.ts`
- 🟠 **HIGH** — Three divergent max_workers calculation algorithms coexist across host-detector.ts, system-capacity.ts, and system-profile.ts
  - max_workers sizing was implemented three separate times in three separate sprints with no consolidation. The spawn-coordinator comment (line 11) explicitly acknowledges the legacy path in sprint-utils.ts/system-profile.ts was 'intentionally
  - 📍 `src/core/host-detector.ts`
- 🟠 **HIGH** — Two parallel notification systems with incompatible types and event taxonomies
  - The codebase contains two incompatible notification abstractions: (1) The old system in src/core/notifications.ts + src/core/notification-providers/ uses URL-based providers (NotificationProvider.send(url, event)), config-driven dispatch, a
  - 📍 `src/core/notifications.ts`
- 🟠 **HIGH** — Three divergent RateLimiter implementations with different APIs, defaults, and behaviors — only one is live
  - The three `RateLimiter` classes have divergent defaults (maxConcurrent=10 vs maxRequests=60 vs maxRequests=100), divergent APIs (boolean return vs `{ allowed, remaining, retryAfter }` return vs `boolean` with `snapshot()`), and divergent li
  - 📍 `src/core/rate-limiter.ts`
- 🟠 **HIGH** — Two parallel skill-loading systems with no shared caching: SkillPoolManager re-reads disk every call while SkillLoadingCache (unused) provides the intended optimization
  - The two classes solve the same problem (loading skill content) with divergent implementations. SkillPoolManager loads manifest.json per-call (no cache); SkillLoadingCache loads SKILL.md with mtime-based staleness and LRU eviction (always ca
  - 📍 `src/core/skill-pool.ts`
- 🟠 **HIGH** — Duplicate suggestMaxWorkers with divergent algorithms in system-capacity.ts vs host-detector.ts
  - Two functions with the identical name `suggestMaxWorkers` implement fundamentally different algorithms and are imported independently by different subsystems. The deckent init flow (CLI onboarding) uses system-capacity's version, while the 
  - 📍 `src/core/system-capacity.ts`
- 🟠 **HIGH** — ManualTokenInput uses no i18n for user-facing strings despite the project's i18n-first mandate
  - ManualTokenInput is partially i18n'd (only the cancel button uses `t()`) while all error messages, title, description, placeholder, and submit button label are hardcoded English. This creates Turkish-language sessions where the login dialog
  - 📍 `src/dashboard/src/components/ManualTokenInput.tsx`
- 🟠 **HIGH** — NO_GO/ERROR status color is yellow in SprintSummary but red in TaskCard and WorkerCard
  - Three components represent the same task failure state (NO_GO/ERROR) with different colors: SprintSummary uses yellow/amber, TaskCard uses red, WorkerCard uses red. When the same sprint is viewed on the Status page (SprintSummary) vs the Wo
  - 📍 `src/dashboard/src/components/SprintSummary.tsx`
- 🟠 **HIGH** — Two divergent useApi hooks with incompatible return shapes both named useApi
  - Two files export a symbol named useApi with completely different signatures and semantics. lib/useApi.ts is a thin wrapper returning {get, post} callbacks (no state). hooks/useApi.ts is a full data-fetching hook returning {data, loading, er
  - 📍 `src/dashboard/src/lib/useApi.ts`
- 🟠 **HIGH** — Two parallel VS Code extension implementations with divergent command IDs, types, and behavior
  - The codebase contains two VS Code extension entry points that define different command identifiers (deckent.start/status/explain vs deckent.startSprint/showDashboard), different VsCodeApi surface shapes (createStatusBarItem present only in 
  - 📍 `src/extensions/vscode/extension.ts`
- 🟠 **HIGH** — cleanup.ts hardcodes memoryBudget=900 and decayAfterSprints=8 but config defaults are 5000 and 20
  - The cleanup MCP tool reads the raw `.deckent/config.json` directly (bypassing `loadConfig`) and falls back to 900/8 when keys are absent. The canonical defaults (used by every other subsystem that calls `loadConfig`) are 5000 and 20. This m
  - 📍 `src/mcp/tools/cleanup.ts`
- 🟠 **HIGH** — Three divergent alert-deduplication implementations with incompatible keys write to the same .dashboard.json alerts array
  - The stale_md alert is emitted via `emitAlert` (key = `auditor:stale_md_detector`) every scan cycle and written directly to `.dashboard.json`. Then `writeScanToDashboard` deduplicates scan-cycle alerts by `source::message` key. If a scan-cyc
  - 📍 `src/monitor/alert-emitter.ts`
- 🟠 **HIGH** — Default HEARTBEAT.md template contains a task that always fails validateCommand
  - The built-in template that bootstraps every new project's HEARTBEAT.md includes a vitest command written as a shell pipeline (`2>&1 | tail -5`). The same module's security validator unconditionally blocks any command containing `|` or `&`. 
  - 📍 `src/orchestra/heartbeat-daemon.ts`
- 🟠 **HIGH** — Two parallel learning systems (PatternRecorder/PatternReader vs OutcomeTracker) write to different directories with no integration
  - Two distinct learning data pipelines exist for the same goal. PatternReader (src/orchestra/pattern-reader.ts:58-81) computes successful combinations filtered by evaluation==='DONE' && coverage>80. OutcomeTracker (src/orchestra/outcome-track
  - 📍 `src/orchestra/pattern-recorder.ts`
- 🟠 **HIGH** — Two divergent evaluateResult implementations with different logic for the same signature
  - There are two functions named `evaluateResult` with the same external signature but divergent logic. The sprint-controller version lacks `TIMEOUT_WITH_WORK` handling, spurious NO_GO reconciliation, Bash-unavailable tolerance, and goNogo cri
  - 📍 `src/orchestra/result-evaluator.ts`
- 🟠 **HIGH** — Three divergent implementations of redactSensitive() with different regex coverage
  - Different callers get different security guarantees: `sprint-runner-entry.ts` (Brain crash handler) uses the strongest version (sensitive-redactor.ts); `worker-log.ts` uses the weaker core version that misses `pk-` keys and the 100-char con
  - 📍 `src/orchestra/sensitive-redactor.ts`
- 🟠 **HIGH** — archiveOrphanTasks writes to .brain/archive/ but cleanTasksArchive reads from .tasks/archive/ — path mismatch means retention never fires on actual archives
  - Step 12b (`archiveOrphanTasks`) in `finalizeSprint` moves completed task files to `.brain/archive/sprint-NNN-tasks/`. Step 12c (`cleanTasksArchive`) is intended to prune old archives to enforce a retention policy, but it looks in `.tasks/ar
  - 📍 `src/orchestra/sprint-docs-updater.ts`
- 🟠 **HIGH** — noGoRate stored as percentage (0-100) but generateConfigSuggestions treats it as fraction (0-1)
  - Two conflicting semantic treatments of `noGoRate` exist in the same file. The calculation (line 108) and the retro display (sprint-retro-writer.ts:271) treat it as a percentage (0–100). The `generateConfigSuggestions` function (line 517-522
  - 📍 `src/orchestra/sprint-metrics.ts`
- 🟠 **HIGH** — Duplicate runtime-extension implementations with conflicting defaults: max_extensions=2 (timeout-watcher.ts) vs RUNTIME_EXTENSION_MAX=3 (sprint-phases.ts); heartbeat freshness 60s vs 90s; runtime_extension_enabled default false vs true
  - Two independent implementations of worker runtime-timeout-extension exist: `TimeoutWatcher` (timeout-watcher.ts, Sprint 145) and `evaluateRuntimeExtension` (sprint-phases.ts, Sprint 191). They conflict on: (1) feature default — `false` in T
  - 📍 `src/orchestra/timeout-watcher.ts`
- 🟠 **HIGH** — GeminiAdapter.isAvailable() rejects OAuth-only users but spawn() and buildGeminiSpawnEnv() explicitly support them
  - The Gemini CLI was deliberately updated to support OAuth/subscription auth (Sprint 248) — `spawn()` passes `undefined` `apiKey` to `buildGeminiSpawnEnv()` which omits `GOOGLE_API_KEY` and lets the CLI use its logged-in session. Yet `isAvail
  - 📍 `src/providers/gemini.ts`
- 🟠 **HIGH** — tool_result tool_call_id silently falls back to empty string, producing invalid OpenAI messages
  - The OpenAI messages format requires `tool_call_id` to be a non-empty string that matches the `id` of the preceding `tool_calls` entry. When a CC transcript `tool_result` block is missing `tool_use_id` (malformed or partial session), the ext
  - 📍 `src/training/cc-trace-extractor.ts`

---

## 5. deckent-only — Phase-2'nin Fazladan Bulduğu (critical+high, verify-gerek)

deckent daha granüler tarayıp CC'nin kaçırdığı bu yüksek-severity adayları buldu. **Self-reported** — düzeltmeden önce kısa doğrulama önerilir.

- 🔴 **CRITICAL** `dormant` — Node verify-gate (tsc/vitest retry loops) has zero production callers — 📍 `src/agents/worker-verify.ts:163`
- 🟠 **HIGH** `root-cause` — RBAC backlog gate is advisory-soft by default (ADR-037 V1.0) — 📍 `backlog-trigger.ts:31`
- 🟠 **HIGH** `root-cause` —  — 📍 `baseline-tracker.ts:85`
- 🟠 **HIGH** `inconsistent` —  — 📍 `baseline-tracker.ts:109`
- 🟠 **HIGH** `unwired` —  — 📍 `batch-stats.ts:29`
- 🟠 **HIGH** `unwired` — Entire module has zero production consumers — 📍 `brain-context.ts:30`
- 🟠 **HIGH** `unwired` —  — 📍 `capability-realizer.ts:81`
- 🟠 **HIGH** `dormant` — CI Health→RETRO and CI Learning integration never runs in a real sprint — 📍 `ci-reporter.ts:42`
- 🟠 **HIGH** `unwired` —  — 📍 `src/agents/shared-context.ts:13`
- 🟠 **HIGH** `dormant` — FeedbackLoop tracking machinery has zero production callers — 📍 `src/agents/worker-lifecycle.ts:187`
- 🟠 **HIGH** `dormant` — Verify-delta honest-assessment calibration has zero production callers — 📍 `src/agents/worker-lifecycle.ts:329`
- 🟠 **HIGH** `root-cause` —  — 📍 `src/agents/worker-verify.ts:498`
- 🟠 **HIGH** `root-cause` — Enterprise read endpoints get — 📍 `src/api/enterprise-endpoint.ts:237`
- 🟠 **HIGH** `root-cause` — Command-guard deny-list is silently bypassed for EVERY production session — 📍 `src/api/terminal/session-manager.ts:99`
- 🟠 **HIGH** `root-cause` — No error handler on the — 📍 `src/api/watcher.ts:14`
- 🟠 **HIGH** `root-cause` — Silent fallback on mid-stream log-read failure — 📍 `src/api/worker-logs.ts:127`
- 🟠 **HIGH** `root-cause` —  — 📍 `src/cli/commands/agent.ts:189`
- 🟠 **HIGH** `root-cause` — Risk classifier auto-approves a risky action whose name merely CONTAINS a safe substring — 📍 `src/cli/commands/agentic-confirm.ts:33`
- 🟠 **HIGH** `inconsistent` — CLI — 📍 `src/cli/commands/autonomous.ts:1062`
- 🟠 **HIGH** `root-cause` — CLI export still reaches the wipe path the guard was built to block — 📍 `src/cli/commands/memory.ts:107`
- 🟠 **HIGH** `root-cause` —  — 📍 `src/cli/commands/rbac.ts:15`
- 🟠 **HIGH** `unwired` — the runtime parsers have ZERO production caller — 📍 `src/cli/commands/retro-parser.ts:45`
- 🟠 **HIGH** `unwired` —  — 📍 `src/cli/commands/sync.ts:37`
- 🟠 **HIGH** `dormant` — the entire module is unwired — 📍 `src/cli/helpers/agent-templates.ts:17`
- 🟠 **HIGH** `root-cause` —  — 📍 `src/cli/helpers/debt-counter.ts:19`
- 🟠 **HIGH** `root-cause` —  — 📍 `src/cli/helpers/mcp-attach.ts:59`
- 🟠 **HIGH** `root-cause` — Budget line reads "OK" on a DB read error — 📍 `src/cli/helpers/output.ts:13`
- 🟠 **HIGH** `inconsistent` — Duplicate "Rich Sprint Summary" implementations, only one wired — 📍 `src/cli/helpers/sprint-summary.ts:17`
- 🟠 **HIGH** `inconsistent` —  — 📍 `src/core/adr-seed.ts:14`
- 🟠 **HIGH** `dormant` — Most of the "User Safety Shield" Anthropic client is dormant — 📍 `src/core/anthropic-http-client.ts:209`
- 🟠 **HIGH** `dormant` — The whole v1→v2 tier-migration chain is never invoked by the runtime load path — 📍 `src/core/config-migration.ts:489`
- 🟠 **HIGH** `unwired` — credential-encryption primitives transitively dead — 📍 `src/core/credential-encryption.ts:35`
- 🟠 **HIGH** `root-cause` — One corrupt — 📍 `src/core/debt-store.ts:29`
- 🟠 **HIGH** `root-cause` —  — 📍 `src/core/directive-interrogator.ts:18`
- 🟠 **HIGH** `unwired` — enterprise-config.ts runtime API is entirely dead — 📍 `src/core/enterprise-config.ts:91`
- 🟠 **HIGH** `dormant` — Audit lineage propagation (correlationId/causationId) is built but never populated at runtime — 📍 `src/core/event-stream.ts:76`
- 🟠 **HIGH** `unwired` — worker-time — 📍 `src/core/file-lock.ts:60`
- 🟠 **HIGH** `root-cause` — worker-tier file mutual-exclusion guarantee is unenforced — 📍 `src/core/file-lock.ts:60`
- 🟠 **HIGH** `root-cause` — FlowRegistry RBAC is opt-in via an optional param no caller supplies — 📍 `src/core/flow-registry.ts:26`
- 🟠 **HIGH** `inconsistent` —  — 📍 `src/core/model-equivalence.ts:4`
- 🟠 **HIGH** `unwired` —  — 📍 `src/core/notification-providers/webhook.ts:28`
- 🟠 **HIGH** `dormant` — Entire — 📍 `src/core/notifications.ts:16`
- 🟠 **HIGH** `dormant` — live worker-output pipeline never populated — 📍 `src/core/output-collector.ts:239`
- 🟠 **HIGH** `root-cause` — PanicGuard hard-wired to BLOCK — 📍 `src/core/panic-guard.ts:62`
- 🟠 **HIGH** `dormant` — Plugin security layer (sandbox AST scan + SHA-256 signature) never runs in the live path — 📍 `src/core/plugin-loader.ts:89`
- 🟠 **HIGH** `unwired` — The subscription→API overflow feature never executes at runtime. — 📍 `src/core/provider-overflow.ts:88`
- 🟠 **HIGH** `inconsistent` — ADR-001 violation — 📍 `src/core/provisioner.ts:101`
- 🟠 **HIGH** `root-cause` — Residual ADR-008 violation: — 📍 `src/core/routing-engine.ts:30`
- 🟠 **HIGH** `root-cause` —  — 📍 `src/core/session-interface.ts:119`
- 🟠 **HIGH** `unwired` —  — 📍 `src/core/signature.ts:69`
- 🟠 **HIGH** `root-cause` — every accessor re-scans the whole skills dir from disk (no cache) — 📍 `src/core/skill-pool.ts:32`
- 🟠 **HIGH** `inconsistent` — duplicate-divergent skill persistence model — 📍 `src/core/skill-registry.ts:9`
- 🟠 **HIGH** `dormant` —  — 📍 `src/core/skill-types.ts:19`
- 🟠 **HIGH** `dormant` — withTenant() is never called in production → AsyncLocalStorage scope is dead — 📍 `src/core/tenant-context.ts:68`
- 🟠 **HIGH** `unwired` — TokenCounter class has zero production instantiation — 📍 `src/core/token-counter.ts:70`
- 🟠 **HIGH** `root-cause` — nextDelayMs backoff path is dead at its only call-site — 📍 `src/core/token-quota.ts:54`
- 🟠 **HIGH** `unwired` —  — 📍 `src/dashboard/analytics/analytics-data.ts:58`
- 🟠 **HIGH** `unwired` —  — 📍 `src/dashboard/analytics/skill-heatmap-data.ts:24`
- 🟠 **HIGH** `unwired` —  — 📍 `src/dashboard/analytics/success-chart-data.ts:28`
- 🟠 **HIGH** `dead-test` — live-merge asserts implementation tokens in useSSE.ts source — 📍 `src/dashboard/src/__tests__/live-merge.test.tsx:32`
- 🟠 **HIGH** `dead-test` — terminal-no-overlap asserts CSS-class strings, not layout — 📍 `src/dashboard/src/__tests__/terminal-no-overlap.test.tsx:23`
- 🟠 **HIGH** `dormant` — Nervous pending-count badge never renders in the running UI — 📍 `src/dashboard/src/components/Sidebar.tsx:62`
- 🟠 **HIGH** `inconsistent` — Duplicate sprint-control logic — 📍 `src/dashboard/src/components/SprintControlPanel.tsx:44`
- 🟠 **HIGH** `unwired` — Entire — 📍 `src/dashboard/src/components/ui/table.tsx:79`
- 🟠 **HIGH** `dormant` —  — 📍 `src/dashboard/src/lib/api-client.ts:13`
- 🟠 **HIGH** `root-cause` — No-op gate: Sprint 049 stub comment, 266 sprints overdue — 📍 `src/extensions/vscode/extension.ts:63`
- 🟠 **HIGH** `inconsistent` — Three divergent sources of truth for the MCP tool catalog, all hand-maintained and drifted — 📍 `src/mcp/tools/index.ts:34`
- 🟠 **HIGH** `root-cause` — Writer-lease gate fails open for ALL write tools on fs-error — 📍 `src/mcp/writer-lease-gate.ts:64`
- 🟠 **HIGH** `dormant` —  — 📍 `src/nervous/detectors/agent-routing.ts:56`
- 🟠 **HIGH** `dormant` —  — 📍 `src/nervous/detectors/debt-trend.ts:29`
- 🟠 **HIGH** `dormant` —  — 📍 `src/nervous/detectors/token-spike.ts:56`
- 🟠 **HIGH** `root-cause` — The shared cause: lifecycle/event-driven detectors are wired to inputs the runtime never delivers — 📍 `src/nervous/detectors/token-spike.ts:55`
- 🟠 **HIGH** `root-cause` — Even via the JSONL/ — 📍 `src/nervous/observer.ts:306`
- 🟠 **HIGH** `dormant` —  — 📍 `src/orchestra/authority-enforcer.ts:22`
- 🟠 **HIGH** `dormant` —  — 📍 `src/orchestra/autonomous/mission-store/mission-types.ts:30`
- 🟠 **HIGH** `root-cause` — coverage "validation" trusts the self-reported number whenever no vitest JSON is supplied — 📍 `src/orchestra/coverage-validator.ts:301`
- 🟠 **HIGH** `dormant` — the adversarial cross-verify feature is wired but default-OFF — 📍 `src/orchestra/cross-verify-runner.ts:204`
- 🟠 **HIGH** `root-cause` — hardcoded — 📍 `src/orchestra/debt-manager.ts:654`
- 🟠 **HIGH** `root-cause` — Fabricated README "tests" count — 📍 `src/orchestra/doc-updaters/readme-metrics.ts:35`
- 🟠 **HIGH** `root-cause` —  — 📍 `src/orchestra/ecosystem-intelligence.ts:178`
- 🟠 **HIGH** `root-cause` — Bare — 📍 `src/orchestra/managed-docs/docs-config.ts:89`
- 🟠 **HIGH** `root-cause` — Cross-verify learning guarantee is soft — 📍 `src/orchestra/outcome-tracker.ts:252`
- 🟠 **HIGH** `unwired` — PatternRecorder/PatternReader learning subsystem has zero production callers — 📍 `src/orchestra/pattern-recorder.ts:26`
- 🟠 **HIGH** `root-cause` — The "Tier-1 DONE requires real-binary smoke" guarantee is therefore unenforced at runtime — 📍 `src/orchestra/proof-of-function.ts:376`
- 🟠 **HIGH** `unwired` — TOPP B pure dispatch planner is test-only — 📍 `src/orchestra/result-collector.ts:228`
- 🟠 **HIGH** `inconsistent` — False wiring claim for planDispatch — 📍 `src/orchestra/result-collector.ts:178`
- 🟠 **HIGH** `root-cause` — Self-project guard turns git rollback safety into a silent no-op — 📍 `src/orchestra/rollback.ts:107`
- 🟠 **HIGH** `root-cause` — ADR-039 user-project self-modification enforcement is dead scaffolding — 📍 `src/orchestra/self-modifying-detector.ts:237`
- 🟠 **HIGH** `dormant` — Kind-based memory limits (F1-LIM faz-2a, Sprint 272) are never wired through the factory ⇒ permanently — 📍 `src/orchestra/spawn-backend-docker.ts:440`
- 🟠 **HIGH** `root-cause` — WSL2 OOM-mitigation tier cap never reaches the real spawn path — 📍 `src/orchestra/spawn-coordinator.ts:70`
- 🟠 **HIGH** `inconsistent` — duplicate-divergent — 📍 `src/orchestra/sprint-controller.ts:812`
- 🟠 **HIGH** `dormant` — Four retro "wire" function-pairs have zero external callers — 📍 `src/orchestra/sprint-reporter.ts:210`
- 🟠 **HIGH** `root-cause` — Retro unconditionally claims "No boundary violations" — 📍 `src/orchestra/sprint-retro-writer.ts:404`
- 🟠 **HIGH** `inconsistent` — Two divergent exported — 📍 `src/orchestra/task-router.ts:123`
- 🟠 **HIGH** `unwired` —  — 📍 `src/orchestra/temp-skill-generator.ts:200`
- 🟠 **HIGH** `unwired` — Anthropic prompt-cache helpers have ZERO production callers — 📍 `src/providers/claude.ts:465`
- 🟠 **HIGH** `root-cause` — Claude availability = binary-present, with NO auth verification (trust-without-verify) — 📍 `src/providers/claude.ts:285`
- 🟠 **HIGH** `inconsistent` — Planner sends the wrong (deckent-alias) model id while spawn sends the wire apiId — 📍 `src/providers/codex.ts:389`
- 🟠 **HIGH** `unwired` —  — 📍 `src/providers/gemini.ts:73`
- 🟠 **HIGH** `dormant` —  — 📍 `src/providers/sandbox.ts:103`
- 🟠 **HIGH** `unwired` — Entire module has zero production callers — 📍 `src/training/cc-trace-extractor.ts:51`
- 🟠 **HIGH** `unwired` —  — 📍 `src/training/cc-trace-extractor.ts:20`
- 🟠 **HIGH** `dead-test` —  — 📍 `tests/cli/chat-mode.test.ts:2`
- 🟠 **HIGH** `dead-test` —  — 📍 `tests/cli/commands/skill-marketplace.test.ts:173`
- 🟠 **HIGH** `dead-test` —  — 📍 `tests/cli/doctor-format.test.ts:28`
- 🟠 **HIGH** `dead-test` — Nine passing test files cover production-dead classes → false coverage — 📍 `tests/cli/helpers/sprint-summary.test.ts:2`
- 🟠 **HIGH** `dead-test` —  — 📍 `tests/cli/mcp-tool-count.test.ts:16`
- 🟠 **HIGH** `dead-test` — status-line "wire" test verifies nothing about the wire — 📍 `tests/cli/repl-status-line-wire.test.ts:1`
- 🟠 **HIGH** `dead-test` —  — 📍 `tests/mcp/tools/checkpoint.test.ts:2`
- 🟠 **HIGH** `dead-test` —  — 📍 `tests/orchestra/doc-updaters/metrics-updater.test.ts:7`

_(110 benzersiz deckent-only crit/high)_

---

## 6. CC-only — deckent'in Self-Audit'inin Kaçırdıkları (critical+high)

CC'nin adversarial-verify ile yakaladığı ama deckent'in kaçırdığı bulgular. Hem gerçek-sorun hem de *deckent'in kendi audit-güvenilirliği* hakkında veri.

- 🔴 **CRITICAL** `root-cause` — auto-edit mode bash guard is dead — check compares literal 'bash' but no registered tool has that name — 📍 `src/agent/permission.ts:None`
- 🔴 **CRITICAL** `root-cause` — Skill adaptation suggestions from adaptAgentRuntime are advisory-only with no enforcement — the agent evolution loop has no feedback closure — 📍 `src/agents/adaptive-agent.ts:None`
- 🔴 **CRITICAL** `root-cause` — Worker authority enforcement always returns true (warn-and-permit) regardless of scope violation — 📍 `src/agents/worker.ts:None`
- 🔴 **CRITICAL** `root-cause` — checkWorkerAuthority always returns true — scope violation enforcement is permanently disabled — 📍 `src/agents/worker.ts:None`
- 🔴 **CRITICAL** `root-cause` — Lineage tenant-filter always bypassed: `req` never passed to `registerAutonomousRoutes` — 📍 `src/api/server.ts:None`
- 🔴 **CRITICAL** `root-cause` — Enterprise missions-audit tenant isolation dead: `req` omitted from `registerEnterpriseRoutes` call — 📍 `src/api/server.ts:None`
- 🔴 **CRITICAL** `root-cause` — TerminalAudit HMAC-chain is permanently dormant: production wires a no-op sink with no integrity config — 📍 `src/api/server.ts:None`
- 🔴 **CRITICAL** `root-cause` — switchProvider option silently no-ops: /provider command confirms switch but does not rebuild adapter — 📍 `src/cli/commands/chat-native.ts:None`
- 🔴 **CRITICAL** `root-cause` — `deckent chat --native` wires a stub dispatcher that silently returns placeholder strings for all tool calls — 📍 `src/cli/commands/chat.ts:None`
- 🔴 **CRITICAL** `root-cause` — Routing engine selectBestAgent() skips skill-affinity signal entirely — advertised fix for agent imbalance is a no-op — 📍 `src/core/activation-engine.ts:None`
- 🔴 **CRITICAL** `root-cause` — AES-256-GCM credential encryption infrastructure is built but the keyring auto-generates silently on first access, making it impossible to audit key provenance — 📍 `src/core/credential-encryption.ts:None`
- 🔴 **CRITICAL** `root-cause` — rebuildWithRelationSafety strict=false default makes the relation-loss safety guard opt-in and effectively a no-op — 📍 `src/core/memory-import.ts:None`
- 🔴 **CRITICAL** `root-cause` — Old NotificationDispatcher (notifications.ts) and its provider pipeline is fully superseded but not removed — Discord/webhook/slack notifications are silently never sent — 📍 `src/core/notifications.ts:None`
- 🔴 **CRITICAL** `root-cause` — Task.actor RBAC seam is explicitly flagged 'data only, no enforcement' — actor-based authorization never enforces at sprint execution — 📍 `src/core/task-types.ts:None`
- 🔴 **CRITICAL** `root-cause` — Session token (OIDC/manual-login) is never forwarded to shared API fetch functions — all non-bootstrap callers send unauthenticated requests silently — 📍 `src/dashboard/src/lib/api.ts:None`
- 🔴 **CRITICAL** `root-cause` — deckent_plan writes task files to disk despite documenting itself as dry-run-only — 📍 `src/mcp/tools/plan.ts:None`
- 🔴 **CRITICAL** `inconsistent` — Three divergent implementations of getCurrentSprintId reading different files — 📍 `src/monitor/sprint-state.ts:None`
- 🔴 **CRITICAL** `dormant` — autonomous.engine='v2' flag is untyped and undocumented — v2 engine is permanently unreachable at default config — 📍 `src/orchestra/autonomous/mission-store/mission-engine-wire.ts:None`
- 🔴 **CRITICAL** `root-cause` — RBAC enforcement is permanently advisory: enforce_rbac defaults false with no mechanism to flip it, making the authority matrix a warn-only no-op — 📍 `src/orchestra/backlog-trigger.ts:None`
- 🔴 **CRITICAL** `root-cause` — DockerSpawnBackend (the default backend) completely bypasses the toggle-independent SAFETY_FLOOR lethal guard — 📍 `src/orchestra/spawn-backend.ts:None`
- 🔴 **CRITICAL** `dormant` — rollback_policy config field is defined, validated, and documented but its value is NEVER read — rollback enable/disable is hardcoded to opts.rollback !== false — 📍 `src/orchestra/sprint-controller.ts:None`
- 🔴 **CRITICAL** `root-cause` — PanicGuard BLOCK decision is advisory-only: the worker kill proceeds regardless — 📍 `src/orchestra/sprint-controller.ts:None`
- 🔴 **CRITICAL** `root-cause` — getRollbackPolicy 'ask' return value is silently ignored — partial NO_GO sprints never prompt for rollback — 📍 `src/orchestra/sprint-phases.ts:None`
- 🔴 **CRITICAL** `root-cause` — RBAC enforcement is advisory-only by default with no structural guarantee that hard mode is ever enabled — the enforce_rbac flag is cast through an unofficial type and never validated or defaulted in config.ts — 📍 `src/orchestra/sprint-runtime.ts:None`
- 🟠 **HIGH** `inconsistent` — Two unrelated ProviderAdapter interfaces share the same exported name across subsystems — 📍 `src/agent/provider-tooluse/types.ts:None`
- 🟠 **HIGH** `unwired` — AgentSession.cancel() is never called in production — in-flight turns cannot be stopped — 📍 `src/agent/session.ts:None`
- 🟠 **HIGH** `unwired` — AgentSession.setApprovalMode() is never called in production — /approve command has no effect on native engine path — 📍 `src/agent/session.ts:None`
- 🟠 **HIGH** `unwired` — PromptVersionManager.updateVersionStats never called — prompt version stats permanently frozen at {uses:0, successRate:0} — 📍 `src/agents/prompt-version.ts:None`
- 🟠 **HIGH** `unwired` — SpecializationDriftDetector pipeline never invoked in the RETRO phase — 📍 `src/agents/specialization-drift.ts:None`
- 🟠 **HIGH** `root-cause` — Verify loop gate is advisory-only: writeResult does not check for verify-ran marker — 📍 `src/agents/worker.ts:None`
- 🟠 **HIGH** `unwired` — setupTaskSnapshot exported but never called in any production spawn path — 📍 `src/agents/worker.ts:None`
- 🟠 **HIGH** `inconsistent` — Duplicate checkWorkerAuthority function with divergent signatures and semantics in worker.ts vs authority-matrix.ts — 📍 `src/agents/worker.ts:None`
- 🟠 **HIGH** `root-cause` — Honest-gate in writeResult only checks DONE self-assessment — GO_WITH_TECH_DEBT stub bypasses downgrade — 📍 `src/agents/worker.ts:None`
- 🟠 **HIGH** `dormant` — Autonomous backlog `strictTenantIsolation` permanently dormant: opts never passed at call sites — 📍 `src/api/autonomous-endpoint.ts:None`
- 🟠 **HIGH** `dormant` — strictTenantIsolation option on /api/autonomous/backlog is always false — ENT-2 tenant filtering never activates — 📍 `src/api/autonomous-endpoint.ts:None`
- 🟠 **HIGH** `root-cause` — writeNervousIpcApproval silently swallows write failures — HTTP 200 returned even when IPC record was not persisted — 📍 `src/api/nervous-endpoint.ts:None`
- 🟠 **HIGH** `inconsistent` — sendJson hardcodes DEFAULT_PORT (3100) in CORS header, breaking non-default-port deploys — 📍 `src/api/server.ts:None`
- 🟠 **HIGH** `dormant` — Audit HMAC chain (integrity config + ChainedAuditSink) never wired in production — all terminal audit events use no-op sink — 📍 `src/api/server.ts:None`
- 🟠 **HIGH** `root-cause` — reconcileStatusResponse returns idle for a STARTING sprint (active state, no dashboard yet) — 📍 `src/api/status-reconcile.ts:None`
- 🟠 **HIGH** `root-cause` — agentic-session.ts memory adapter built but never wired into the REPL — session persistence silently never runs — 📍 `src/cli/commands/agentic-session.ts:None`
- 🟠 **HIGH** `unwired` — parseToolCallFromText exported but has zero production callers — 📍 `src/cli/commands/chat-native.ts:None`
- 🟠 **HIGH** `root-cause` — createSubscriptionChatAdapter resolves a ProviderAdapter from registry then immediately discards it (void adapter) — 📍 `src/cli/commands/chat-native.ts:None`
- 🟠 **HIGH** `root-cause` — Parallel bridge-construction paths: initReplMcpBridge (flag-gated) vs chat-native inline build (server-presence-gated) — the flag gate is permanently bypassed — 📍 `src/cli/commands/chat-native.ts:None`
- 🟠 **HIGH** `unwired` — `classifyChatIntent`, `buildNaiveSystemPrompt`, `probeProviders`, `selectProvider`, `loadChatResume`, `renderChatResume`, `spawnChatProcess` exported from `chat.ts` but only used in tests — 📍 `src/cli/commands/chat.ts:None`
- 🟠 **HIGH** `dormant` — `deckent cost estimate` subcommand documented in file header but never registered — 📍 `src/cli/commands/cost.ts:None`
- 🟠 **HIGH** `root-cause` — `deckent flow run` daemon callback only prints flow count — never executes the actual flow action — 📍 `src/cli/commands/flow.ts:None`
- 🟠 **HIGH** `dormant` — rbac CLI grant/revoke writes to in-memory Map that is never read by the RBAC enforcement system — 📍 `src/cli/commands/rbac.ts:None`
- 🟠 **HIGH** `root-cause` — --auto-approve CLI flag description says it controls worker spawning but autoApprove is hardcoded to true in runSprint call — 📍 `src/cli/commands/start.ts:None`
- 🟠 **HIGH** `root-cause` — getMessage() silently returns the key string on missing key — typos in message keys are invisible — 📍 `src/cli/helpers/messages.ts:None`
- 🟠 **HIGH** `unwired` — initReplMcpBridge() and isMcpClientEnabled() exported but never called in production — 📍 `src/cli/repl/mcp-bridge.ts:None`
- 🟠 **HIGH** `dormant` — mcp_client_enabled config flag defined in a local interface but absent from DeckentConfig and never read at runtime — 📍 `src/cli/repl/mcp-bridge.ts:None`
- 🟠 **HIGH** `dormant` — native_cost_ceiling_usd config key read from an ad-hoc cast but never declared in the config schema (DeckentConfig / DeckentProjectConfig) — 📍 `src/cli/repl/run.tsx:None`
- 🟠 **HIGH** `inconsistent` — Three divergent extractKeywords implementations across three modules — 📍 `src/core/agent-selector.ts:None`
- 🟠 **HIGH** `dormant` — denialAudit option never passed to createAuditedCapabilityRegistry — CAPABILITY_DENIED events never written — 📍 `src/core/capability-runtime.ts:None`
- 🟠 **HIGH** `dormant` — telemetry_enabled and telemetry_anonymous config flags are defined but never read — no telemetry code exists — 📍 `src/core/config-types.ts:None`
- 🟠 **HIGH** `dormant` — cost_optimization config flag defined and validated but never read — no provider cost-ranking logic exists — 📍 `src/core/config-types.ts:None`
- 🟠 **HIGH** `dormant` — DeckentConfig.notifications (webhook/slack/discord URLs) — defined in config schema but never read to wire providers — 📍 `src/core/config-types.ts:None`
- 🟠 **HIGH** `dormant` — DeckentConfig.output_render_mode config field is defined but never read at runtime — 📍 `src/core/config-types.ts:None`
- 🟠 **HIGH** `inconsistent` — CONFIG_METADATA documents memory_budget default as 600 and decay_after_sprints default as 5, but createDefaultConfig sets 5000 and 20 respectively — 📍 `src/core/config.ts:None`
- 🟠 **HIGH** `dormant` — LearningConfig user-configurable fields (minSamplesForBonus / recentSprintWindow / sprintRecencySuccessBonus / sprintRecencyFailurePenalty) — never passed from config to OutcomeTracker — 📍 `src/core/decision-config.ts:None`
- 🟠 **HIGH** `root-cause` — DecisionEngineConfig / LearningConfig / CollaborationConfig validated-but-never-applied: soft schema with no enforcement path — 📍 `src/core/decision-config.ts:None`
- 🟠 **HIGH** `dormant` — DECKENT_SMTP_HOST / DECKENT_SMTP_USER / DECKENT_SMTP_PASS / DECKENT_TELEMETRY_ID / DECKENT_DB_URL — listed as known .deck keys, never consumed in production — 📍 `src/core/deck-file.ts:None`
- 🟠 **HIGH** `dormant` — EnterpriseConfig schema (parseEnterpriseConfig, mergeEnterpriseConfig, ENTERPRISE_CONFIG_DEFAULTS) is fully dormant — never called in production — 📍 `src/core/enterprise-config.ts:None`
- 🟠 **HIGH** `inconsistent` — like operator has divergent semantics across ERP drivers: SQL wildcards vs. literal substring — 📍 `src/core/erp/handler.ts:None`
- 🟠 **HIGH** `unwired` — emitDependencyResolvedByFix() documented as the fix-resolution signal but never wired — 📍 `src/core/event-stream.ts:None`
- 🟠 **HIGH** `root-cause` — FlowRuntime.tick hardcodes empty arrays for triggers and events, silently voiding the event-dispatch contract — 📍 `src/core/flow-runtime.ts:None`
- 🟠 **HIGH** `inconsistent` — BUILTIN_TRUSTED_SKILLS in skill-sandbox.ts contains IDs that do not match any real skill ID in the system — 📍 `src/core/marketplace/skill-sandbox.ts:None`
- 🟠 **HIGH** `dormant` — strictTenantIsolation config flag is read by config layer but never wired to MemoryStore constructor at any production call site — 📍 `src/core/memory-store.ts:None`
- 🟠 **HIGH** `dormant` — MemoryQueryParams.min_score field defined but never applied in search implementation — 📍 `src/core/memory-types.ts:None`
- 🟠 **HIGH** `dormant` — ModelStrategy.auto_upgrade and auto_downgrade fields defined and stored in config but never read at runtime — 📍 `src/core/mode-presets.ts:None`
- 🟠 **HIGH** `dormant` — ModelRegistry.unregister() is exported but never called in any production code path — 📍 `src/core/model-registry.ts:None`
- 🟠 **HIGH** `inconsistent` — actionOverrides is required in config-types.ts NervousSystemConfig but optional in nervous-types.ts NervousSystemConfig — 📍 `src/core/nervous-types.ts:None`
- 🟠 **HIGH** `dormant` — ProviderFailureSummary.auth and .oom fields are computed but never read by any caller — 📍 `src/core/provider-failure-classifier.ts:None`
- 🟠 **HIGH** `root-cause` — detectClaude() reports authMethod='session' unconditionally when CLI is installed — no real login check at bootstrap — 📍 `src/core/provider.ts:None`
- 🟠 **HIGH** `inconsistent` — Three divergent RateLimiter implementations — core, api/rate-limiter.ts, api/server.ts — with incompatible semantics — 📍 `src/core/rate-limiter.ts:None`
- 🟠 **HIGH** `unwired` — enforceRbac() exported from rbac.ts but never imported in production code — 📍 `src/core/rbac.ts:None`
- 🟠 **HIGH** `dormant` — computeBackoff from token-quota.ts always receives null RateLimitState — rate-limit-aware backoff path is permanently dead — 📍 `src/core/token-quota.ts:None`
- 🟠 **HIGH** `inconsistent` — DirectivesEditor (component) and DirectivesPage duplicate the same feature with divergent behavior — 📍 `src/dashboard/src/components/DirectivesEditor.tsx:None`
- 🟠 **HIGH** `unwired` — RoutingDistribution exported but has zero production callers — 📍 `src/dashboard/src/components/RoutingDistribution.tsx:None`
- 🟠 **HIGH** `root-cause` — SprintControlPanel passes permanently no-op onSelect to WorkerCardGrid — worker card clicks are silently lost — 📍 `src/dashboard/src/components/SprintControlPanel.tsx:None`
- 🟠 **HIGH** `root-cause` — SprintSummary elapsed time and ETA computed from last-poll timestamp instead of sprint start time — 📍 `src/dashboard/src/components/SprintSummary.tsx:None`
- 🟠 **HIGH** `root-cause` — deckent:unauthorized custom event is dispatched on 401 but no listener exists anywhere — 401 errors produce no UI feedback — 📍 `src/dashboard/src/lib/api.ts:None`
- 🟠 **HIGH** `inconsistent` — LoginPage violates i18n-FIRST: zero useTranslation usage, all user-facing strings are hardcoded English — 📍 `src/dashboard/src/pages/LoginPage.tsx:None`
- 🟠 **HIGH** `root-cause` — enrichResponse produces silent wrong summaries for 4 tools (audit, autonomous, process, recover) — no compile-time guard — 📍 `src/mcp/helpers/enrich.ts:None`
- 🟠 **HIGH** `root-cause` — formatDoctorResponse always reports all checks as failed — .ok vs .passed field mismatch — 📍 `src/mcp/helpers/format.ts:None`
- 🟠 **HIGH** `root-cause` — deckent_kill (MCP) only marks task status PAUSED in JSON — actual worker process (tmux/docker/subprocess) is never terminated — 📍 `src/mcp/tools/kill.ts:None`
- 🟠 **HIGH** `dormant` — deckent_nervous_subscribe subscribers Set is populated but never consumed — push dispatch is a no-op — 📍 `src/mcp/tools/nervous.ts:None`
- 🟠 **HIGH** `inconsistent` — backlogPath computed three different ways: config-aware in submit path, hardcoded in MCP status/result path, and hardcoded in CLI/API — 📍 `src/mcp/tools/process.ts:None`
- 🟠 **HIGH** `dormant` — sandbox=true in MCP deckent_start silently does nothing (no git-stash) — 📍 `src/mcp/tools/start.ts:None`
- 🟠 **HIGH** `root-cause` — failedTasks hardcoded to 0 in MCP status rich-format path — NO_GO count always silently hidden — 📍 `src/mcp/tools/status.ts:None`
- 🟠 **HIGH** `root-cause` — checkBoundaryViolations blames EVERY worker for EVERY out-of-scope changed file — guaranteed false positives when multiple workers run — 📍 `src/monitor/auditor.ts:None`
- 🟠 **HIGH** `root-cause` — DebtTrendAnalyzer opens a MemoryStore (SQLite) connection on every detect() call without closing it — 📍 `src/nervous/detectors/debt-trend.ts:None`
- 🟠 **HIGH** `root-cause` — TaskModeIdleDetector emits METRIC_EMIT with wrong payload schema — handleMetricEmit will always throw and return failure — 📍 `src/nervous/detectors/task-mode-idle.ts:None`
- 🟠 **HIGH** `dormant` — desktop channel config field is defined and defaulted but never dispatched — 📍 `src/nervous/dispatcher.ts:None`
- 🟠 **HIGH** `root-cause` — canAutoApply predicate veto is logged to console.log only, not to the structured audit history — 📍 `src/nervous/executor.ts:None`
- 🟠 **HIGH** `root-cause` — emitViolationEvent in runtime-scope-check uses bare require() in a pure ESM package — always silently falls back to stderr — 📍 `src/nervous/runtime-scope-check.ts:None`
- 🟠 **HIGH** `dormant` — AutonomousRuntimeConfig.tenantId is defined and passed but never read inside runAutonomousCycle — 📍 `src/orchestra/autonomous-runtime.ts:None`
- 🟠 **HIGH** `root-cause` — sprint-kind entries get unconditional ok=true without Brain/Auditor evaluation — trust-without-verify — 📍 `src/orchestra/autonomous/execute-dispatcher.ts:None`
- 🟠 **HIGH** `dormant` — fanOut field defined, validated, and propagated — never consumed by any dispatcher or runtime — 📍 `src/orchestra/autonomous/goal-planner-types.ts:None`
- 🟠 **HIGH** `inconsistent` — Three divergent parseVitestOutput implementations with incompatible return types — 📍 `src/orchestra/baseline-tracker.ts:None`
- 🟠 **HIGH** `root-cause` — captureVitestBaseline uses spawnSync, violating ADR-087 async subprocess requirement and risking event-loop freeze — 📍 `src/orchestra/baseline-tracker.ts:None`
- 🟠 **HIGH** `unwired` — batch-stats.ts: BatchStatsUpdater class has zero production callers — 📍 `src/orchestra/batch-stats.ts:None`
- 🟠 **HIGH** `unwired` — brain-context.ts: all exported enrichment functions have zero production callers — 📍 `src/orchestra/brain-context.ts:None`
- 🟠 **HIGH** `unwired` — capability-realizer.ts: realizeCapabilities() and CapabilitySpec are never used in production — 📍 `src/orchestra/capability-realizer.ts:None`
- 🟠 **HIGH** `dormant` — native_skills_passthrough / useNativeSkills option defined but never read at runtime — 📍 `src/orchestra/capability-realizer.ts:None`
- 🟠 **HIGH** `unwired` — capability-realizer.ts (realizeCapabilities) has zero production callers — 📍 `src/orchestra/capability-realizer.ts:None`
- 🟠 **HIGH** `dormant` — validateWorkerCoverage / parseCoverageFromVitest never receive actual data — vitest JSON output is always undefined at runtime — 📍 `src/orchestra/coverage-validator.ts:None`
- 🟠 **HIGH** `inconsistent` — Two updaters both write README.md with divergent test-count formulas, one of which is semantically wrong — 📍 `src/orchestra/doc-updaters/readme-metrics.ts:None`
- 🟠 **HIGH** `root-cause` — sprintLogUpdater appends unconditionally — no idempotency guard causes duplicate sprint sections on re-run — 📍 `src/orchestra/doc-updaters/sprint-log.ts:None`
- 🟠 **HIGH** `root-cause` — reconcileSpuriousNoGo calls spawnSync with 120-second timeout inside synchronous evaluateWithRubric, blocking the Node.js event loop — 📍 `src/orchestra/mid-sprint-adapter.ts:None`
- 🟠 **HIGH** `unwired` — PatternReader and PatternRecorder are dead code — zero production callers — 📍 `src/orchestra/pattern-reader.ts:None`
- 🟠 **HIGH** `dormant` — verifyProofOfFunction / applyProofOfFunctionGate / runPostSprintSmoke never called in sprint lifecycle — 📍 `src/orchestra/proof-of-function.ts:None`
- 🟠 **HIGH** `root-cause` — disk-verify MANUAL_REVIEW_REQUIRED reclassification does not block cascade or sprint evaluation — it is a soft annotation — 📍 `src/orchestra/result-collector.ts:None`
- 🟠 **HIGH** `inconsistent` — Two waitForResults implementations with divergent behavior — the DI version in result-evaluator.ts is never called in production — 📍 `src/orchestra/result-evaluator.ts:None`
- 🟠 **HIGH** `dormant` — SelfModEnforceResult.mode 'enforce' is structurally a no-op — the RBAC layer always runs in soft mode regardless — 📍 `src/orchestra/self-modifying-detector.ts:None`
- 🟠 **HIGH** `dormant` — getRuntimeExtensionMax and getAdaptiveMultiplier config knobs never consumed by the actual extension gate — 📍 `src/orchestra/sprint-controller.ts:None`
- 🟠 **HIGH** `root-cause` — Adaptive timeout config knobs are soft-defined but never enforced — sprint-phases.ts uses a compile-time hard constant that cannot be overridden at runtime — 📍 `src/orchestra/sprint-controller.ts:None`
- 🟠 **HIGH** `dormant` — RunSprintOptions.sandboxMode is defined and passed but never read inside runSprint() — 📍 `src/orchestra/sprint-controller.ts:None`
- 🟠 **HIGH** `dormant` — sandboxMode option accepted by RunSprintOptions but never read inside runSprint — 📍 `src/orchestra/sprint-controller.ts:None`
- 🟠 **HIGH** `unwired` — Six sprint retro telemetry functions exported but never called in the live retro pipeline — 📍 `src/orchestra/sprint-reporter.ts:None`
- 🟠 **HIGH** `unwired` — inferFixMode has zero production callers — FIX worker idempotency mode is never computed — 📍 `src/orchestra/task-builder.ts:None`
- 🟠 **HIGH** `dead-test` — tests/integration/notification-flow.test.ts — tests dead production code (old NotificationDispatcher), not the live pipeline — 📍 `tests/integration/notification-flow.test.ts:None`

_(122 benzersiz CC-only crit/high)_

---

## 7. Sonuç + Düzeltme Yol Haritası

**Mesaj net:** çözüm daha fazla araç değil — deckent zaten boyutuna göre aşırı araçlı. Çözüm, **az sayıda gate'i advisory'den blocking'e çevirmek + ground-truth doğrulamayı opsiyonel'den zorunlu'ya almak.**

**Öncelik sırası (AGREE-core'dan):**
1. 🔴 **EN ACİL — live cross-tenant IDOR:** `server.ts:820,861` `registerAutonomousRoutes`'a `req` geçmiyor → tenant-filtre ölü-dal → origin/main'de canlı veri-sızıntısı. (Önceki `b525d679` fix'i kimsenin çağırmadığı dala inmiş = R4 canlı.) **Fix:** 2 callsite + enterprise `:824`'e `req` thread.
2. 🔴 **R1 fail-open → fail-closed:** CLI-worker path'inde out-of-scope-write = hard-reject; ADR-enforcer crash = NO_GO (fail-closed); RBAC default'unu standart-config'de erişilebilir yap.
3. 🔴 **R2 trust-without-verify → mandatory disk-verify:** user-surface DONE iddiası gerçek-binary smoke geçmeden NO_GO'ya zorlansın (downgrade değil).
4. 🔴 **R4 SSOT:** duplicate'leri (RateLimiter/checkWorkerAuthority/ROLE_CAPABILITY_MAP/parseVitestOutput) tek kanonik impl'e indir.
5. 🟠 **R5 metrikler:** `boundaryViolations`/`coverage`'ı gerçek-veriden doldur (auditor zaten tespit ediyor, köprü yok).
6. 🟠 **R3 dormant-knob:** her config-key için ≥1 runtime-reader iddia eden 'no-dormant-knob' lint; `sprint_timeout_minutes→timeoutMs` thread.
7. 🟠 **R6/R7/R8:** silent-fallback'leri sesli yap; ADR-008 import-lint ekle; mock-only test-tiyatrosunu gerçek-davranış assert'ine çevir.

---
_Kaynaklar: `deckent-last-standing.md` (Phase-1, 692 verified) · `deckent-last-analyze/` (Phase-2, 95 rapor/1361 bulgu) · `deckent-last-standing-crosscheck.md` (tier'lı pool). Üretim 2026-06-21, kod-grounded, cross-check'li._