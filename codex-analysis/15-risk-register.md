# 15 — Risk and Finding Register

Bu register'daki her finding aynı schema'yı kullanır. `Status`, analiz settlement'ıdır; implementation durumu değiştirilmemiştir.

## F-001 — Goal runtime / autonomy

- **Severity:** CRITICAL
- **Confidence:** High
- **Domain:** Goal runtime / autonomy
- **Evidence/source:** src/cli/commands/autonomous.ts:828-939,1074-1099; mission-kind-admission.ts:211-219,298-322
- **Source of truth:** Current source code
- **Current state:** UNWIRED/HOLD — Goal create edilir; planner/accepter admission ve exact executor production'da kasıtlı HOLD.
- **Expected state:** Creator-scoped Goal real role admission, route-locked executor, acceptance ve delivery settlement ile ilerler.
- **Gap:** Live candidate authorities ve executor registry yok; task dışı kinds unwired.
- **Root cause:** Safety foundation üretildi, fakat host authority composition ve production adapters tamamlanmadı.
- **Impact:** Ürünün ana Goal vaadi çalışamaz; kullanıcı parked/HOLD görür.
- **Risk:** Autonomy/publish claim yanlış olur; test fake'leri false confidence üretir.
- **Priority:** P0 / ilk lifecycle closure
- **Dependencies:** WP0, WP1, WP3, WP4
- **Recommendation:** Goal-v2'yi shared lifecycle authority ve real provider admission üstünde kapat; fake executor'ü proof sayma.
- **Acceptance criteria:** Real binary Goal, real configured provider ile plan→dispatch→accept→delivery→settlement; restart/crash ve approval-required journey green.
- **Proof method:** Immutable invocation/operation/settlement/delivery receipts + disk read model + independent evaluator.
- **Blocker:** Provider candidates, exact executor, canonical Operation/Principal authority.
- **Suggested owner:** Lifecycle/Orchestra + Provider Authority
- **Status:** OPEN / NO-GO

## F-002 — Canonical architecture

- **Severity:** CRITICAL
- **Confidence:** High
- **Domain:** Canonical architecture
- **Evidence/source:** core/work-model.ts; mission-types.ts; run-flow-contract.ts; task-result-settlement.ts; task-settlement-authority.ts
- **Source of truth:** Vision + current source
- **Current state:** PARTIAL — lifecycle parçaları farklı authority/store'larda; durable canonical Operation yok.
- **Expected state:** Goal→Mission→Flow→Run→WorkItem→Attempt→Operation→Evidence→Settlement tek sorgulanabilir lineage.
- **Gap:** ID/relation/state/evidence/settlement normalization ve cross-store authority yok.
- **Root cause:** Capability'ler sprintlerle dikey eklenmiş; canonical cutover/migration train tamamlanmamış.
- **Impact:** Parity, policy, audit, recovery ve user outcome surface'e/backend'e göre ayrışır.
- **Risk:** Yanlış terminal state, duplicate effects, missing audit ve migration complexity.
- **Priority:** P0 / architecture spine
- **Dependencies:** WP0, WP1
- **Recommendation:** Mevcut store'ları koruyan canonical authority + versioned adapters/migrations kur.
- **Acceptance criteria:** Mihenk sorgusu tek read modelden tüm lineage/authority/evidence/delivery'yi döndürür.
- **Proof method:** Contract tests, migration replay, crash injection, real surface journeys.
- **Blocker:** Owner-approved canonical schema ve cutover order.
- **Suggested owner:** Core Architecture + Data/Durability
- **Status:** OPEN

## F-003 — Quality / CI

- **Severity:** CRITICAL
- **Confidence:** High
- **Domain:** Quality / CI
- **Evidence/source:** scripts/test-failure-baseline.json; PAZARTESI.md:145-242
- **Source of truth:** Current HEAD baseline file
- **Current state:** CONTRADICTED/RED — 115 file, 591 expected failure; PAZ latest 564 sayısı stale.
- **Expected state:** Zero unexplained failures; new failure fail-closed; required jobs görünür ve repeated green.
- **Gap:** Orchestra 346, CLI 121, MCP 95, API 22 ve diğer failure clusters.
- **Root cause:** Type Check dependency masking, broad refactors, stale mocks/fixtures ve proof topology debt.
- **Impact:** Her DONE/readiness/release verdict'inin güveni düşer.
- **Risk:** Regression publish, false-green veya gerçek fix'in ayırt edilememesi.
- **Priority:** P0 / trust signal floor
- **Dependencies:** WP0
- **Recommendation:** Ratchet'i büyütmeden P-packages ile düşür; fail-soft CI/skip'leri typed ledger'a al.
- **Acceptance criteria:** Repeated clean-checkout required CI green; baseline empty; no hidden dependent job.
- **Proof method:** CI receipts, per-package before/after counts, real binary tests.
- **Blocker:** Hotspot ownership ve current external test drift.
- **Suggested owner:** Quality/CI + domain owners
- **Status:** OPEN / RELEASE HOLD

## F-004 — Plan / SSOT

- **Severity:** CRITICAL
- **Confidence:** High
- **Domain:** Plan / SSOT
- **Evidence/source:** docs/generated/master-plan-active.json; MASTER:11-14; PAZARTESI:181-315
- **Source of truth:** MASTER contract + generated ledger
- **Current state:** STALE/PARTIAL — 318 active, 0 READY, 250 P0; latest owner sequence PAZ bridge'de.
- **Expected state:** Current owner kararları atomik Work ID; deduped DAG; en az bir admitted READY root.
- **Gap:** P0 inflation, stale evidence, recovery-born fragmentation, competing critical paths.
- **Root cause:** High-volume recovery ledgering reconciliation ve reprioritization'dan hızlı ilerledi.
- **Impact:** Doğru ilk iş canonical olarak seçilemiyor.
- **Risk:** Ekip yanlış sırada çalışır, aynı problemi yineler, closure yerine volume üretir.
- **Priority:** P0 / first action
- **Dependencies:** None
- **Recommendation:** WP0 canonical reconciliation; PAZ/analysis findings'i Work IDs ve supersession receipts'e bağla.
- **Acceptance criteria:** Zero unowned owner decision; P0 policy uygulanmış; ≥1 READY root; generated counts/digest current.
- **Proof method:** MASTER lint/projection + row audit + owner receipt.
- **Blocker:** Owner priority/supersession authority.
- **Suggested owner:** Product/Architecture/Plan owner
- **Status:** OPEN / REPLAN REQUIRED

## F-005 — Identity / approval

- **Severity:** HIGH
- **Confidence:** High
- **Domain:** Identity / approval
- **Evidence/source:** goal-mission.ts:19-33,196-211; autonomous-mission.ts:181-193; autonomous.ts:1021-1066
- **Source of truth:** Current source
- **Current state:** UNWIRED — CLI-created Goal createdBy taşımıyor; approval factory verified owner ister.
- **Expected state:** Her Goal immutable creator principal/tenant/session authority ile doğar.
- **Gap:** Actor identity creation path'te kayboluyor; approval-required items park olabilir.
- **Root cause:** Goal schema ve CLI surface principal contractından önce üretildi.
- **Impact:** Risk-tagged work authorization alamaz; audit/accountability eksik.
- **Risk:** Bypass değil fail-closed outage; ownerless evidence ve UX dead-end.
- **Priority:** P0 with Goal closure
- **Dependencies:** F-002, F-001
- **Recommendation:** Principal required contract, solo-local explicit authority ve migration policy.
- **Acceptance criteria:** CLI/Terminal/API-created Goals approval-required journey'de aynı verified principal lineage taşır.
- **Proof method:** Identity/approval receipts, negative IDOR/ownerless tests, live approval decision.
- **Blocker:** Canonical Principal authority.
- **Suggested owner:** Identity/Security + Goal Runtime
- **Status:** OPEN

## F-006 — Settlement / durability

- **Severity:** HIGH
- **Confidence:** High
- **Domain:** Settlement / durability
- **Evidence/source:** mission-scheduler.ts:85-99; mission-engine-wire.ts:548-629
- **Source of truth:** Current source
- **Current state:** CONTRADICTED — SQL completed acceptance/delivery tamamlanmadan yazılabilir; process-local finalized set düzeltir.
- **Expected state:** Terminal Goal status yalnız acceptance + durable delivery receipt + settlement sonrası.
- **Gap:** Crash window, receipt/fence ve durable finalization state eksik.
- **Root cause:** Scheduler generic all-items-done semantiği Goal acceptance lifecycle'ına uymuyor.
- **Impact:** UI/status false completion gösterebilir; restart farklı davranır.
- **Risk:** User outcome kaybı veya duplicate delivery.
- **Priority:** P0 settlement
- **Dependencies:** F-002, F-001
- **Recommendation:** Typed goal states ve durable acceptance/delivery transaction/outbox.
- **Acceptance criteria:** Crash every boundary'de false-complete/duplicate delivery yok.
- **Proof method:** Fault injection + immutable delivery/settlement receipts.
- **Blocker:** Canonical settlement schema.
- **Suggested owner:** Durability/Goal Engine
- **Status:** OPEN

## F-007 — Tenant data / privacy

- **Severity:** CRITICAL
- **Confidence:** High
- **Domain:** Tenant data / privacy
- **Evidence/source:** memory-store.ts:131-180,451-459; memory-search-endpoint.ts:24-60; mcp/resources/memory.ts:7-33
- **Source of truth:** Current source + enterprise vision
- **Current state:** PARTIAL/UNSAFE FOR ENTERPRISE — global IDs, nullable tenant, unscoped relations/history; MCP unfiltered.
- **Expected state:** Tenant composite authority bütün rows/indexes/FTS/relations/resources/exports'ta fail-closed.
- **Gap:** Storage schema ve non-HTTP resource boundary tenant taşımıyor.
- **Root cause:** Solo/local memory modeline tenant sonradan eklendi.
- **Impact:** Cross-tenant data exposure ve conflicting IDs mümkün.
- **Risk:** Privacy/security/compliance breach.
- **Priority:** P0 before enterprise enablement
- **Dependencies:** F-002, F-005
- **Recommendation:** Versioned tenant migration, composite keys, scoped FTS/relations/history, req-less deny.
- **Acceptance criteria:** Cross-tenant negative tests bütün API/MCP/export/store paths'de fail-closed; migration reconciles legacy rows.
- **Proof method:** Schema inspection, property/IDOR tests, multi-tenant real service test.
- **Blocker:** Legacy NULL ownership decision and migration authority.
- **Suggested owner:** Data/Security
- **Status:** OPEN / ENTERPRISE NO-GO

## F-008 — Approval / tool execution

- **Severity:** HIGH
- **Confidence:** High
- **Domain:** Approval / tool execution
- **Evidence/source:** agents/worker-approval-env.ts; agentic-worker-tools.ts:137-317; core/tool-dispatch.ts:10-15,65-70
- **Source of truth:** Current source
- **Current state:** PARTIAL — agentic run_bash Broker-gated; generic tool dispatch caller seam/future wiring.
- **Expected state:** Her effectful Operation tek runtime-wide Approval/Policy authority'sinden geçer.
- **Gap:** Surface/tool families arasında authorization choke point eşit değil.
- **Root cause:** Approval slices farklı ingress'lerde bağımsız evrildi.
- **Impact:** Aynı action surface'e göre farklı approval semantics taşır.
- **Risk:** Governance bypass veya gereksiz denial; audit fragmentation.
- **Priority:** P0 authority spine
- **Dependencies:** F-002, F-005
- **Recommendation:** Operation effect class → policy → broker → decision receipt ortak service.
- **Acceptance criteria:** Capability matrix bütün mutating tools için gate producer/consumer/negative path gösterir.
- **Proof method:** Cross-surface parity tests + decision receipts + bypass mutation tests.
- **Blocker:** Canonical Operation/application service.
- **Suggested owner:** Security/Approval + Surface
- **Status:** OPEN

## F-009 — Learning governance

- **Severity:** HIGH
- **Confidence:** High
- **Domain:** Learning governance
- **Evidence/source:** sprint-finalizer.ts:2792-2814; promotion-pipeline.ts:24-28,134-217,361-388
- **Source of truth:** Current source
- **Current state:** CONTRADICTED — permanent promotion automatic; declared minSprints evaluation'da yok.
- **Expected state:** Independent verified, policy/approval-gated, canary/rollback promotion.
- **Gap:** Dead criterion, direct persistent mutation, provenance/rollout authority eksik.
- **Root cause:** Performance learner ve asset governance aynı pipeline'da hızlı bağlandı.
- **Impact:** Correlated/stale outcomes kalıcı agent/skill behavior'ı değiştirir.
- **Risk:** Silent quality/security regression ve self-reinforcing routing bias.
- **Priority:** P0 before autonomous learning enablement
- **Dependencies:** F-008, F-011, F-012
- **Recommendation:** Candidate registry, min-sprint enforcement, xverify/evaluator, approval, canary, rollback.
- **Acceptance criteria:** No promotion without all evidence/authority; rollback drill succeeds.
- **Proof method:** Tamper-evident lineage, staged traffic metrics, receipt chain.
- **Blocker:** Different-provider verifier may be unavailable.
- **Suggested owner:** Learning/Governance
- **Status:** OPEN / PROMOTION HOLD

## F-010 — Run control

- **Severity:** HIGH
- **Confidence:** High
- **Domain:** Run control
- **Evidence/source:** api/run-flow-routes.ts:450-487
- **Source of truth:** Current source
- **Current state:** CONTRADICTED — flow CANCELLED olur, detached process devam eder.
- **Expected state:** Cancel effect state ve flow state tek bounded settlement zinciridir.
- **Gap:** Signal/ack/force/release receipt yok.
- **Root cause:** Flow state authority ile sprint process lifecycle ayrı.
- **Impact:** Kullanıcı iptal ettiğini sanırken maliyetli/zararlı iş sürebilir.
- **Risk:** Unexpected effects, spend, lock/resource leakage.
- **Priority:** P0 surface/runtime
- **Dependencies:** F-002, F-014
- **Recommendation:** Effect-aware cancellation protocol ve typed cancellation-pending.
- **Acceptance criteria:** Terminal/API/CLI cancel real process'i bounded durdurur veya honest HOLD.
- **Proof method:** Real subprocess/container cancellation and restart tests.
- **Blocker:** Cross-backend process authority.
- **Suggested owner:** RunFlow/Runtime
- **Status:** OPEN

## F-011 — Provider / routing

- **Severity:** HIGH
- **Confidence:** High
- **Domain:** Provider / routing
- **Evidence/source:** provider-authority-runtime-bootstrap.ts:23-55; spawn-backend-docker.ts:6855-6885; provider-concurrency-runtime-reader.ts:10-16; route-task-v3.ts:180-188
- **Source of truth:** Current source
- **Current state:** PARTIAL — exact authority/observation/capacity/live-health provider/backend matrixi eksik.
- **Expected state:** Her provider/backend aynı authority→health→capacity→budget→observation→settlement contractı.
- **Gap:** Claude/Docker ağırlığı, capacity unknown, routing live=false.
- **Root cause:** Provider-neutral types adapters ve live evidence producers'dan ileride.
- **Impact:** Routing kalite, admission ve reconciliation eksik sinyalle karar verir.
- **Risk:** Over-admission, wrong provider, unverifiable billing/execution.
- **Priority:** P0
- **Dependencies:** F-002, F-003
- **Recommendation:** Provider/backend conformance kit ve honest unsupported statuses.
- **Acceptance criteria:** Required matrix green; unknown capacity fails HOLD; live signal measured.
- **Proof method:** Real provider sandbox receipts, observation intervals, routing decision evidence.
- **Blocker:** Entitlement/accounts/platform capacity.
- **Suggested owner:** Provider Platform/Routing
- **Status:** OPEN

## F-012 — Training

- **Severity:** HIGH
- **Confidence:** High
- **Domain:** Training
- **Evidence/source:** sprint-phases.ts:2534-2571,2945-2992; output-collector.ts:61-71; src/training/pipeline.ts callers
- **Source of truth:** Current source search
- **Current state:** UNWIRED — trace producer real/default-conditional; pipeline production caller yok.
- **Expected state:** Trace→validate→corpus→promotion durable, governed workflow.
- **Gap:** Production ingress, lineage completeness, error settlement ve policy yok.
- **Root cause:** Capture foundation ayrı slice; consumer train tamamlanmadı.
- **Impact:** Training vaadi raw files'da kalır veya silent gaps taşır.
- **Risk:** Untrusted corpus, privacy leakage, false learning claim.
- **Priority:** P0 strategic pivot
- **Dependencies:** F-003, F-007, F-009
- **Recommendation:** Canonical trace envelope, validation/quarantine, corpus authority ve retention/privacy.
- **Acceptance criteria:** Real run trace lineage corpus candidate'e ulaşır; failure HOLD/audit üretir.
- **Proof method:** End-to-end trace receipts, corruption/privacy tests, promotion blocked negative case.
- **Blocker:** Tenant/privacy and verifier authority.
- **Suggested owner:** Training/Learning/Data Governance
- **Status:** OPEN

## F-013 — Dashboard product boundary

- **Severity:** HIGH
- **Confidence:** High
- **Domain:** Dashboard product boundary
- **Evidence/source:** vision.md:92-96; dashboard Layout/TerminalPanel/TerminalTabs; terminal-api.ts
- **Source of truth:** Vision/Identity doctrine + current source
- **Current state:** CONTRADICTED — dashboard embedded terminal session create/kill/launch yapar.
- **Expected state:** Dashboard projection-only; mutations Terminal/Desktop/application service surfaces'inde.
- **Gap:** Terminal API/control panel monitoring bundle içinde.
- **Root cause:** Convenience control surface doctrine netleşmeden eklenmiş.
- **Impact:** Surface ownership ve negative-space parity bozulur.
- **Risk:** Second control plane, governance drift, user confusion.
- **Priority:** P0 boundary closure
- **Dependencies:** F-014
- **Recommendation:** Embedded terminali Dashboard'dan çıkar/taşı; API ownership ratchet.
- **Acceptance criteria:** Dashboard real-browser journey hiçbir mutation capability expose etmez.
- **Proof method:** Route/tool negative-space test, network capture, component inventory.
- **Blocker:** Owner doctrine already immutable direction; implementation cutover.
- **Suggested owner:** Dashboard/Terminal Product
- **Status:** OPEN

## F-014 — Surface architecture

- **Severity:** HIGH
- **Confidence:** High
- **Domain:** Surface architecture
- **Evidence/source:** cli/command-registry.ts:143-264; api/server.ts RPC map; api/rpc-write-handlers.ts
- **Source of truth:** Current source + surface doctrine
- **Current state:** PARTIAL/UNWIRED — surface command semantics ve write RPC/adapters ayrışıyor.
- **Expected state:** Thin adapters, versioned common application-service semantics ve negative-space matrix.
- **Gap:** CLI/MCP/REPL/API command availability/parity; VS Code/connectors approximate/direct dispatch.
- **Root cause:** Surface-specific controllers capability-by-capability büyüdü.
- **Impact:** Aynı user intent farklı state/evidence/approval davranışı gösterir.
- **Risk:** Inconsistent outcome, duplicated bugs, impossible support matrix.
- **Priority:** P0
- **Dependencies:** F-002, F-008
- **Recommendation:** Use-case services ve capability contract; wire or retire orphan handlers.
- **Acceptance criteria:** Propose/approve/start/cancel/status/review/finalize/cleanup/resume parity tests.
- **Proof method:** Cross-surface contract suite + real host smokes.
- **Blocker:** Canonical lifecycle and app-service owner.
- **Suggested owner:** Application Services + Surface teams
- **Status:** OPEN

## F-015 — Desktop / Every Environment

- **Severity:** HIGH
- **Confidence:** High
- **Domain:** Desktop / Every Environment
- **Evidence/source:** package.json:38-76; desktop package/vitest; cross-platform-e2e.yml:14-132
- **Source of truth:** Identity platform claim + current CI/package
- **Current state:** UNPROVEN — Desktop source substantial; root CI/release/Electron E2E/signed installers absent.
- **Expected state:** macOS/Linux/Windows native first-class Desktop with WSL-aware project handling and signed update/rollback.
- **Gap:** CI invocation, tests-e2e host, mac/win targets, signing/notarization/update.
- **Root cause:** Desktop implementation product release train'inden ayrı gelişti.
- **Impact:** Primary surface claim kullanıcıya teslim edilemez.
- **Risk:** Platform-specific failure, insecure/unupdatable install.
- **Priority:** P0 product surface
- **Dependencies:** F-003, F-014, F-016
- **Recommendation:** Desktop conformance/release matrix; honest unsupported until proven.
- **Acceptance criteria:** Three-OS signed install/launch/update/rollback + Electron journey green.
- **Proof method:** CI artifacts, signatures, notarization, host screenshots/logs, a11y evidence.
- **Blocker:** Signing identities and platform labs.
- **Suggested owner:** Desktop/Release
- **Status:** OPEN

## F-016 — Release / supply chain

- **Severity:** HIGH
- **Confidence:** High
- **Domain:** Release / supply chain
- **Evidence/source:** package.json:38,65,72; .github/workflows/release.yml:1-29,115-269
- **Source of truth:** Current package/workflow
- **Current state:** PARTIAL — npm OIDC/provenance strong; build/prepublish mismatch and product artifacts incomplete.
- **Expected state:** Unified reproducible signed CLI/MCP/dashboard/Desktop/service/container release with verify/rollback.
- **Gap:** Desktop absent, prepublish build mismatch, SBOM/signature verify/reproducibility/update channels absent.
- **Root cause:** npm package pipeline matured before full product artifact matrix.
- **Impact:** Manual publish path and shipped surfaces can differ.
- **Risk:** Incomplete artifact, supply-chain evidence gap, rollback failure.
- **Priority:** P0 before GA
- **Dependencies:** F-003, F-015, F-024
- **Recommendation:** One release manifest/build graph; eliminate bypass; SBOM/sign/verify/rollback/soak.
- **Acceptance criteria:** All declared artifacts same source digest, install matrix, signature verify and rollback.
- **Proof method:** Provenance/SBOM/signature receipts + fresh machine install/soak.
- **Blocker:** Desktop/container/service packages and platform credentials.
- **Suggested owner:** Release/Security
- **Status:** OPEN / GA HOLD

## F-017 — Documentation / operations safety

- **Severity:** HIGH
- **Confidence:** High
- **Domain:** Documentation / operations safety
- **Evidence/source:** DECKENT.md:261-278,404-425; AGENTS.md operating rules; architecture.md
- **Source of truth:** Operating rules + executable source
- **Current state:** CONTRADICTED — lifecycle vocab split; recovery guide approval precondition'sız kill/cleanup öneriyor.
- **Expected state:** Tek lifecycle vocabulary; destructive command guides owner approval/active-state guard taşır.
- **Gap:** Stale host guide ve code comments/status.
- **Root cause:** Docs farklı sprintlerde current source/operating rules ile atomik güncellenmedi.
- **Impact:** Agent/operator yanlış state okur veya unauthorized cleanup önerebilir.
- **Risk:** Work loss, misleading recovery, telemetry mismatch.
- **Priority:** P0 docs safety
- **Dependencies:** WP0, F-006
- **Recommendation:** Generated/source-linked lifecycle reference ve safety lint/preconditions.
- **Acceptance criteria:** Docs/source phase table parity; destructive examples approval guard olmadan lint fail.
- **Proof method:** Docs tests, symbol/path lints, scenario review.
- **Blocker:** Canonical lifecycle state decision.
- **Suggested owner:** Docs/Runtime Governance
- **Status:** OPEN

## F-018 — i18n / accessibility

- **Severity:** HIGH
- **Confidence:** High
- **Domain:** i18n / accessibility
- **Evidence/source:** messages.ts; lint-i18n-hardcode.mjs; REPL/MCP/Dashboard/VS Code literals; Desktop config
- **Source of truth:** AGENTS quality bar + product vision
- **Current state:** PARTIAL — en/tr system var; lint yüzeylerin çoğunu kapsamaz; WCAG live evidence yok.
- **Expected state:** Bütün user-visible strings catalogued; declared locales, aria, keyboard/screen-reader platform proof.
- **Gap:** TSX/subdir/MCP/connectors/VSCode enforcement ve assistive-tech matrix.
- **Root cause:** i18n lint dar scope; surfaces farklı stacks'te büyüdü.
- **Impact:** Dil tutarsızlığı, inaccessible controls, enterprise adoption engeli.
- **Risk:** User exclusion, compliance failure, hardcoded debt.
- **Priority:** P0 cross-cutting
- **Dependencies:** F-014, F-015
- **Recommendation:** Unified catalogs/adapters, full-source lint, automated axe + manual platform evidence.
- **Acceptance criteria:** Zero hardcoded user strings; locale parity; WCAG journeys all primary surfaces.
- **Proof method:** Static lint, unit/axe, keyboard/screen-reader recordings/receipts.
- **Blocker:** Owner locale set and platform accessibility labs.
- **Suggested owner:** Design System/i18n/A11y + Surface teams
- **Status:** OPEN

## F-019 — Scale / HA

- **Severity:** CRITICAL
- **Confidence:** High
- **Domain:** Scale / HA
- **Evidence/source:** MASTER:888-900; api/server.ts local Maps/Sets; run-flow-routes.ts process lifetime; load tests
- **Source of truth:** Scale vision + current source/evidence
- **Current state:** NOT PROVEN — process-local authorities; synthetic small load tests; SLO/DR evidence yok.
- **Expected state:** Million-scale multi-tenant distributed control plane with measured SLO/RPO/RTO.
- **Gap:** Distributed state/event/rate/quota, failover, backpressure, chaos, noisy-neighbor.
- **Root cause:** Local-first architecture adaptersı enterprise distributed implementation/proof'tan önce.
- **Impact:** Multi-node deploy correctness/performance bilinmiyor.
- **Risk:** Split brain, lost jobs/events, quota bypass, cascading outage.
- **Priority:** P0 assurance track
- **Dependencies:** F-002, F-007, F-011, F-014
- **Recommendation:** Transactional adapter boundary ve owner-signed workload/SLO model; real load/chaos/DR.
- **Acceptance criteria:** Target cardinalities/SLOs altında failover, recovery, isolation and cost gates pass.
- **Proof method:** Repeatable benchmark harness, chaos receipts, backup restore/RPO/RTO evidence.
- **Blocker:** Owner capacity targets, infrastructure and test labs.
- **Suggested owner:** Platform/SRE/Data
- **Status:** OPEN / SCALE CLAIM HOLD

## F-020 — Onboarding / platform truth

- **Severity:** HIGH
- **Confidence:** High
- **Domain:** Onboarding / platform truth
- **Evidence/source:** package.json engine; Identity; cli/commands/doctor-checks.ts:120-142; core/errors.ts:139-147
- **Source of truth:** Package engine + Identity
- **Current state:** CONTRADICTED — doctor/error >=18 guidance; product requires >=24.
- **Expected state:** Installer/doctor/errors/package aynı supported Node floor'u enforce eder.
- **Gap:** Runtime version threshold and remediation text.
- **Root cause:** Node floor yükseldi; diagnostics stale kaldı.
- **Impact:** Unsupported Node user'a false pass/READY.
- **Risk:** Install/runtime failures ve support burden.
- **Priority:** P0 trust/onboarding
- **Dependencies:** WP1
- **Recommendation:** Single generated runtime requirements authority.
- **Acceptance criteria:** All surfaces reject <24, report same remediation; xplat smoke asserts verdict.
- **Proof method:** Node version matrix real binary tests.
- **Blocker:** None beyond plan ownership.
- **Suggested owner:** CLI/Release
- **Status:** OPEN

## F-021 — Documentation metrics

- **Severity:** MEDIUM
- **Confidence:** High
- **Domain:** Documentation metrics
- **Evidence/source:** MCP TOOL_CATALOG 49; MASTER DOCS-TRUTH-PASS evidence 42; coverage matrix top/bottom
- **Source of truth:** Current source/generated catalog
- **Current state:** STALE/CONTRADICTED — capability counts and coverage aynı artifactlerde ayrışıyor.
- **Expected state:** Counts yalnız generated source-backed projections'dan gelir.
- **Gap:** Manuel sayılar ve stale progress section.
- **Root cause:** Stats birden çok yere kopyalandı.
- **Impact:** Readiness/coverage reporting güveni düşer.
- **Risk:** Yanlış scope ve effort decisions.
- **Priority:** P1 under WP0/WP1
- **Dependencies:** F-004
- **Recommendation:** Generated metrics only; lint duplicate/manual counts.
- **Acceptance criteria:** Single source count and no self-contradictory summary.
- **Proof method:** Generator check and snapshot tests.
- **Blocker:** Source selection decision.
- **Suggested owner:** Docs/Tooling
- **Status:** OPEN

## F-022 — Provider observation adoption

- **Severity:** HIGH
- **Confidence:** High
- **Domain:** Provider observation adoption
- **Evidence/source:** Readonly live DB schema/count; provider-execution-observation-store.ts:14,119-169
- **Source of truth:** Current disk + source
- **Current state:** PARTIAL/STALE — source v2 migration exists; live DB v1, 53 legacy rows, no run ownership.
- **Expected state:** Writable runtime safely migrates; legacy rows remain unowned; new observations run-bound.
- **Gap:** Live migration/adoption receipt and cross-backend producers.
- **Root cause:** Schema slice merged; live store not yet opened/migrated or evidence not produced.
- **Impact:** Recovery cannot scope legacy intervals to exact run.
- **Risk:** False reconciliation/retirement or observation blindness.
- **Priority:** P0 trust/provider
- **Dependencies:** F-011, owner approval for runtime migration
- **Recommendation:** Plan controlled migration, backup/recovery, adoption proof; no silent legacy ownership.
- **Acceptance criteria:** Live v2 schema, 53 rows preserved legacy-unowned, new exact run row and reconciliation tests.
- **Proof method:** Before/after schema hash, row counts, runtime receipts.
- **Blocker:** Current DB is active dirty authority; mutation requires owner-controlled implementation run.
- **Suggested owner:** Provider/Durability
- **Status:** OPEN / ANALYSIS-ONLY HOLD

## F-023 — Learning settlement

- **Severity:** HIGH
- **Confidence:** High
- **Domain:** Learning settlement
- **Evidence/source:** sprint-finalizer.ts:2580-2820 broad non-fatal catches
- **Source of truth:** Current source + governance vision
- **Current state:** PARTIAL — sprint completion learning/stats/promotion failuresinden bağımsız.
- **Expected state:** Learning side effects ayrı typed settlement/lineage ile observable; critical policy failures HOLD promotion.
- **Gap:** Error receipts, retry/reconcile and completeness state.
- **Root cause:** Learning intentionally non-fatal yapıldı; separate durable workflow eklenmedi.
- **Impact:** Silent missing/partial learning while UI says complete.
- **Risk:** Drifted routing stats ve unexplained promotion decisions.
- **Priority:** P1/P0 when autonomous learning enabled
- **Dependencies:** F-009, F-012
- **Recommendation:** Outbox/job state, retry, quarantine and status projection.
- **Acceptance criteria:** Injected failure durable pending/HOLD olur; restart reconciles; no silent loss.
- **Proof method:** Fault injection and read-model receipts.
- **Blocker:** Canonical evidence/operation contract.
- **Suggested owner:** Learning/Durability
- **Status:** OPEN

## F-024 — Every Environment

- **Severity:** HIGH
- **Confidence:** High
- **Domain:** Every Environment
- **Evidence/source:** .github/workflows/cross-platform-e2e.yml:14-70; Identity/Immutable Law
- **Source of truth:** Immutable Law + current CI
- **Current state:** UNKNOWN/HOLD — WSL separate leg yok; Ubuntu same-path inference; mac subprocess excluded.
- **Expected state:** Declared platform/backend combinations direct evidence veya honest unsupported status.
- **Gap:** WSL, Windows backend/PTY/service, mac subprocess, Docker workflow, offline/proxy.
- **Root cause:** Hosted runner constraints ve partial matrix.
- **Impact:** Platform-specific defects publish sonrası görünür.
- **Risk:** Silent unsupported behavior, lost jobs/files/auth.
- **Priority:** P0 assurance
- **Dependencies:** F-003, F-015, F-016
- **Recommendation:** Self-hosted/owner lab evidence where hosted CI inadequate; no inference.
- **Acceptance criteria:** Versioned support matrix and direct real-binary proofs for every supported cell.
- **Proof method:** Platform receipts/artifacts/logs, negative unsupported tests.
- **Blocker:** WSL/Windows/mac/Docker labs and credentials.
- **Suggested owner:** Platform/Release
- **Status:** OPEN


