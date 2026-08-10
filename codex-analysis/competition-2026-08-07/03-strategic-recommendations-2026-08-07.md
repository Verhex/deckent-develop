# Stratejik öneriler — Deckent'in rekabet pozisyonu ve karşı hamleleri

**Tarih:** 7 Ağustos 2026  
**Dayanak:** [Analiz 1 — market/proximity](01-competitive-landscape-and-proximity-matrix-2026-08-07.md) ve [Analiz 2 — code-level deep dive](02-deep-competitive-analysis-vs-deckent-2026-08-07.md)

## Executive recommendation

Deckent “daha çok agent, daha çok adapter, daha çok panel” yarışına girmemelidir. Rakipler bu commodity feature set'inde daha geniş distribution veya daha polished UX'e sahiptir. Deckent'in kategori ve product strategy'si şu tek cümlede birleşmelidir:

> **Deckent is the verified operations system for heterogeneous agents: plan, authority, execution, evidence, approval, recovery and learning in one durable chain.**

Türkçe external karşılığı:

> **Farklı agent'ları çalıştıran değil, yaptıkları işi kanıtlayıp güvenle yöneten Agent Operations System.**

Bu positioning bugün koşulsuz launch claim'i olmamalıdır. Önce canonical kernel, runtime-wide approval/operation authority, independent evidence provenance, training/promotion loop ve every-environment assurance production-wide kapanmalıdır. Önerilen strategy, mevcut `docs/MASTER-PLAN.md` work authority'sini çoğaltmak değil, rakip baskısına göre yeniden sıralayıp demonstrable proof üretmektir.

## 1. Stratejik seçim: Agent OS umbrella, Verified Operations wedge

`Agent OS` geniş ve uzun-vadeli category umbrella olarak korunmalı; dışarıdan ilk wedge **Verified Operations** olmalıdır.

Neden:

- **Naive** Agent OS/agent infrastructure anlatısını regulated business rails ile daha kolay sahiplenebilir.
- **Paperclip** agent company metaphor'unu daha anlaşılır anlatır.
- **Orca/Cline/Codex** multi-agent workbench deneyimini daha hızlı gösterir.
- **Ruflo** learning/swarm breadth claim'inde daha gürültülüdür.
- **GitHub** enterprise distribution ve trust bundle'da eşsizdir.

Deckent'in tekil claim'i ancak “accepted result nasıl authority oldu?” sorusuna cevap verebilir. Category hierarchy şöyle olmalıdır:

1. **Deckent — Agent OS**: umbrella.
2. **Verified Agent Operations**: satın alma wedge'i.
3. **Provider-neutral execution, governance and learning**: teknik proof.
4. **Terminal + desktop full control; dashboard observability-only**: experience contract.

## 2. Öncelik 1 — Trust spine'ı production-wide kapat

Bu iş bitmeden yeni surface breadth veya regulated primitives eklemek stratejik sapmadır.

### Exact closure chain

1. `KERNEL-ONTOLOGY-001` / `KERNEL-001`: competing Goal/Mission/Flow/Run/Sprint authorities tek ownership/state chain'e kapanmalı.
2. `OPERATION-001` + operation ingress enforcement: her effect canonical operation id/version/effect/gate/risk/capability/idempotency/audit record'a resolve olmalı; unknown action fail-closed.
3. `APPROVAL-001`: CLI, terminal, desktop, API, connectors, Worker ve Nervous tek request/decision/CAS/expiry/relay/audit authority tüketmeli.
4. `KERNEL-ATTEMPT-001`: claim, lease, fence, retry, cancellation, idempotency ve `UNKNOWN` reconciliation bütün execution modes için tek olmalı.
5. `KERNEL-SETTLEMENT-001`: exactly-one terminal settlement, criterion evidence, usage ve causal lineage.
6. `RECEIPT-001`/`AUDIT-001`: effect receipt, policy decision, verifier identity ve durable external ledger.
7. `TRUST-HANDOFF-001`: worker-independent file/effect provenance; agent beyanı yalnız input signal, authority değil.

### Competitive acceptance test

Bu zincir aşağıdaki tek demo/acceptance suite ile görünür kanıt üretmeli:

- Bir Goal iki bağımlı WorkItem ve iki farklı provider/runtime'a route edilir.
- Exact plan digest owner tarafından bir surface'te approve edilir; farklı surface aynı revision/digest'i consume eder.
- Bir worker scope dışı unreported file yazar; independent provenance bunu yakalar ve settlement fail-closed olur.
- Diğer worker “DONE” der fakat acceptance criterion/test/production wiring eksiktir; host verdict `NO_GO` olur.
- FIX fresh-eyes route farklı provider'a gider; accepted evidence yeni attempt'e bağlanır.
- Crash `PROCESS_SPAWNED` ile `ADMITTED` arasında olur; restart duplicate effect üretmeden reconcile eder.
- Approval race'te first valid committed answer kazanır; stale/unknown/tampered decision reddedilir.
- Final accepted outcome routing journal/training trace'e provenance ile girer; promotion shadow/canary dışında production authority değiştiremez.

Bu suite yalnız test değil, terminal/desktop'ta anlatılan flagship product story olmalıdır.

## 3. Öncelik 2 — Learning'i “honest label” standardıyla kapat

Ruflo nedeniyle “self-learning orchestration” artık farklılaştırıcı claim değildir. Deckent'in standardı:

> No adaptation without an accepted, provenance-bound outcome.

### Her training/outcome record'unda zorunlu alanlar

- tenant/project/Goal/Mission/Flow/Run/WorkItem/Attempt/Operation lineage
- exact prompt/config/model/provider/effort/tool catalog digests
- worker claim ve host verdict ayrı fields
- acceptance criteria + artifact/test/eval/production-wiring evidence refs
- verifier identity, provider separation ve reachability/entitlement evidence
- disk/effect provenance digest
- retry/FIX lineage ve intermediate `NO_GO` verdicts
- consent, redaction, retention, export/delete policy
- routing decision/journal reference
- promotion candidate, confidence, shadow/canary result ve rollback handle

### Hard rules

- Missing label `success=true` olamaz; typed `unverified/HOLD` olur.
- Same-provider self-verify production acceptance değildir.
- Synthetic benchmark outcome ile live production outcome aynı corpus/weight sınıfında tutulmaz.
- Promotion tenant-isolated, statistically bounded, shadow-first, canary-gated ve automatically rollbackable olmalıdır.
- Model/agent/skill performance “final answer quality” kadar cost, latency, recovery, policy violations ve operator intervention'ı da ölçmelidir.

**Owning work:** `TRAINING-TRACE-001`, `ROUTING-001`, `ROUTING-V3-LIVE-QUALITY-001`, `EVALUATION-001`, `PROMOTION-001`, `DATA-GOV-001`.

## 4. Öncelik 3 — Üç rakibin UX avantajını tek canonical trust UX'te sentezle

Deckent rakipleri birebir kopyalamamalı; her birinden farklı güçlü pattern alınmalıdır:

- **Hermes:** keyboard-first, full-control terminal depth.
- **Ruflo:** ambient status, doctor, dry-run, catalog discovery, compact telemetry.
- **Orca:** worktree/session/fleet workbench ergonomisi.
- **Cline:** Plan→Act clarity, checkpoints, diff review ve developer onboarding.
- **GitHub:** staged safe outputs, inspectable exact workflow config ve review points.
- **Naive:** budget/approval/policy consequences'ı non-technical buyer'a okunur anlatma.

### Canonical “trust strip”

Terminal ve desktop her active Run için aynı minimal summary'yi göstermeli:

`STATE · WHY ROUTED · POLICY · COST/BUDGET · APPROVAL · EVIDENCE · RECOVERY · NEXT ACTION`

Progressive disclosure katmanları:

1. **Glance:** current state, blocker, owner action.
2. **Explain:** why this provider/agent/skill, which policy/gate, current budget.
3. **Prove:** exact plan digest, receipts, artifacts, tests, verifier, file/effect provenance.
4. **Recover:** retry/adopt/cancel/rollback choices and consequences.
5. **Audit:** immutable event/decision/settlement lineage.

Bu state terminal, desktop, API, connectors ve dashboard tarafından yeniden üretilmemeli; aynı canonical services'ten projection edilmelidir. Dashboard read-only fleet observability olarak kalmalıdır.

**Owning work:** `TERMINAL-001`, `TERMINAL-TOOLS-001`, `TERMINAL-COLLAB-001`, `SURFACES-001`, `SURFACE-PARITY-001`, `APP-SERVICE-001`, `APPROVAL-001`.

## 5. Öncelik 4 — Naive ile feature war değil coopetition kur

Naive'ın en güçlü alanı regulated primitives'tir. Deckent bu alanı build etmemeli; provider adapter/operation pack olarak integrate etmelidir.

### Önerilen Naive integration boundary

- Naive agent profile/tenant/project identity, Deckent principal/tenant/project ile explicit mapping contractı.
- Her Naive action Deckent Operation Catalog'da versioned external operation.
- Deckent approval ile Naive approval çiftlenirse dual-queue deadlock ve “one approved, other pending” state'i first-class görünmeli.
- Naive `decision_id` null veya audit best-effort olduğunda Deckent receipt bunu “external evidence incomplete” olarak typed taşımalı; complete audit diye yükseltmemeli.
- Naive budget/spend and Deckent provider budget ayrı ledgers fakat combined admission projection ile gösterilmeli; biri diğerinin authority'si olmamalı.
- Revocation semantics transport-specific olduğu için HTTP-read/MCP/SSE carve-outs capability manifest'te açık olmalı.
- Cards/KYC/LLC/email/phone secrets Deckent'e çekilmemeli; Naive gateway boundary korunmalı.

### Rekabet sonucu

Bu yaklaşım Naive'ın rails avantajını Deckent ekosistemine çevirir. Deckent “agents can form companies” feature yarışına girmek yerine “those companies' work becomes verified authority” katmanını own eder.

## 6. Öncelik 5 — Incumbent'ları adapter yap; onların yerine agent üretme

Codex, Claude Code, Devin, Cline ve GitHub agents Deckent'in worker runtimes'ı olmalıdır. Deckent yeni proprietary coding agent/model üretmeye çalışmamalıdır.

Her adapter için aynı conformance contract:

- capability/tool schema ve effective permission evidence
- auth/account/reachability/entitlement/usage/limit resolution
- cancel/stop/timeout/heartbeat/process identity semantics
- file/effect provenance and sandbox boundary evidence
- normalized usage/cost/token accounting
- exact task/prompt/config digests
- structured event stream ve terminal settlement
- approval relay/expiry/restart behavior
- provider-specific unsupported features için typed refusal

**Strategic rule:** En iyi agent kimse onu çalıştır; authority Deckent'te kalsın.

## 7. Öncelik 6 — Enterprise wedge'i RBAC checkbox'ı değil proof üzerinden kur

Naive, GitHub, Cline, Paperclip, Codex ve Claude Code zaten SSO/RBAC/admin/analytics satıyor. Deckent yalnız aynı checkbox'ları ekleyerek farklılaşamaz.

### Enterprise paid value

- Policy-as-executable evidence, not admin-page configuration only
- Tenant-isolated execution and learning
- Exact effect/approval/settlement receipts
- Independent provenance and cross-provider verification
- Organization-wide provider budget/capacity admission
- Recovery guarantees and bounded reconciliation
- Retention/export/delete/legal-hold controls
- Policy packs and environment conformance packs
- Fleet SLOs, audit exports, SIEM/OpenTelemetry integrations
- Shadow/canary/rollback-governed organizational learning

### P10 evidence gate

Enterprise messaging, aşağıdaki proof olmadan “million-scale/enterprise-grade” dememeli:

- multi-tenant isolation and noisy-neighbor tests
- HA/failover/recovery objectives
- load/soak/chaos/cancellation-storm/provider-outage suites
- native macOS/Linux/Windows/WSL/container matrix
- data residency, retention, encryption and key rotation
- audit completeness/reconciliation and tamper evidence
- tenant-scoped learning leak tests
- cost/capacity fairness under saturation

**Owning work:** `SCALE-001`, `HA-001`, `SLO-001`, `LOAD-CHAOS-001`, `EVERY-ENV-001`, `ENV-ADAPTER-001`, `DATA-GOV-001`.

## 8. Öncelik 7 — Competitive distribution strategy

### Segment 1: Engineering platform teams

**Alternatives:** GitHub Agent HQ, Cline Enterprise, Codex/Claude Code, internal LangGraph/Temporal platform.  
**Deckent wedge:** Heterogeneous agents + independently verified acceptance + provider/cost policy + self-host/local control.  
**Proof required:** multi-provider flagship acceptance suite, enterprise audit export, GitHub/CI integration.

### Segment 2: Autonomous-company builders

**Alternatives:** Naive, Paperclip, CrewAI.  
**Deckent wedge:** Goal-to-settlement execution authority and verified outcomes.  
**Integration posture:** Naive regulated primitives, Paperclip-style organization imports/adapters; do not recreate rails/org UI as separate state authority.

### Segment 3: Advanced solo/basic users

**Alternatives:** Orca, Cline, Codex, Claude Code, Replit Agent, OpenClaw.  
**Deckent wedge:** Any agent, one terminal/desktop, low cognitive load, visible trust/recovery.  
**Proof required:** install→project scope→first verified run; no CLI knowledge requirement; failure recovery demonstrably easier than restarting.

### Segment 4: Regulated enterprise operations

**Alternatives:** GitHub/Codex/Claude/Cline enterprise bundles, internal Temporal/LangGraph stack, Naive for regulated agent actions.  
**Deckent wedge:** Complete authority/evidence chain, tenant isolation, external immutable audit, cross-provider verification, policy packs and every-environment assurance.

## 9. Build / integrate / do-not-build decisions

| Capability | Karar | Neden |
|---|---|---|
| Canonical Goal→Operation authority | **Build/own** | Deckent'in category core'u |
| Artifact/effect provenance + settlement | **Build/own** | Ana differentiator |
| Approval/receipt/audit chain | **Build/own** | Trust spine |
| Provider/runtime adapters | **Build conformance layer** | Neutrality moat'i |
| Durable workflow substrate | **Re-evaluate build vs Temporal-class substrate** | Commodity durability'yi yeniden yazma riski |
| Model/agent implementation | **Integrate** | Incumbents daha hızlı ve güçlü |
| Cards/KYC/KYB/LLC/payments rails | **Integrate Naive/others** | Regulated counterparty business'i farklı |
| Generic workflow builder | **Integrate/interoperate** | LangGraph/CrewAI/Microsoft/n8n zaten güçlü |
| IDE replacement | **Do not build** | Cline/Cursor/Windsurf/GitHub distribution avantajı |
| Dashboard control plane | **Do not build** | Canonical direction: observability-only |
| Another mock Goal/agent UI state | **Do not build** | Competing authority ve tech debt üretir |

## 10. Sequencing — dependency order, not feature calendar

### Wave A — Truth and authority closure

`KERNEL-001 → OPERATION ingress → APPROVAL-001 → ATTEMPT → SETTLEMENT → RECEIPT/AUDIT → independent provenance`

Exit gate: flagship acceptance suite production binary üzerinden bütün failure/race/recovery cases'i geçirir; no surface-local authority kalmaz.

### Wave B — Governed learning closure

`TRAINING-TRACE → evaluation provenance → Routing V3 live quality → promotion shadow/canary/rollback → data governance`

Exit gate: no optimistic/missing success labels; every routing/promotion consequence accepted outcome receipt'ine geri izlenebilir.

### Wave C — Canonical product projection

`terminal trust strip → desktop workbench → connector approval/recovery → API/app-server → dashboard observability`

Exit gate: bütün surfaces aynı state/decision/receipt'i gösterir; cross-surface approval and recovery parity proven.

### Wave D — Every-environment + enterprise assurance

`platform adapters → native conformance → HA/SLO → load/chaos/noisy-neighbor → retention/export/SIEM → enterprise packs`

Exit gate: unsupported paths honest typed refusal; supported matrix owner-signed evidence taşır.

### Wave E — Distribution and ecosystem

`GitHub/Codex/Claude/Cline/OpenClaw adapters → Naive primitives pack → framework/Temporal interop → marketplace/policy packs`

Exit gate: external runtimes Deckent authority contractını pass etmeden “supported” etiketi alamaz.

## 11. Metrics — vanity değil trust economics

### North-star metric

**Verified Accepted Outcomes per operator-hour**, segmentation ile:

- solo/basic
- team
- enterprise tenant
- provider/runtime/environment
- task kind/risk class

### Guardrail metrics

- claim ↔ host verdict disagreement rate
- accepted outcome evidence completeness
- unreported file/effect detection rate
- unresolved/unknown attempt age and count
- duplicate-effect rate: target exactly zero
- recovery success and mean time to safe settlement
- approval decision latency, expiry and race rejection rate
- stale/tampered/unknown decision rejection count
- routing regret and anti-collapse distribution
- promotion rollback rate and tenant-leak rate
- cost per verified accepted outcome
- operator interventions per accepted outcome
- surface state divergence: target exactly zero
- audit reconciliation gap: target exactly zero for authoritative records
- cross-platform conformance pass rate

Stars, raw task count, agent count, MCP tool count ve generated lines bu metriclerin yerine geçmemelidir.

## 12. Competitive telemetry operating system

Aylık competitive run aynı scorecard'ı yeniden üretmeli:

- buyer/job overlap
- orchestration authority
- governance/approval/audit
- durability/recovery
- neutrality
- memory/learning/evaluation provenance
- surfaces/operator UX
- multi-tenancy/enterprise/scale
- distribution and monetization
- claim class: shipped / experimental / prototype / roadmap / explicit non-goal

### Trigger-based re-analysis

Aşağıdaki olaylar monthly cadence beklemeden re-score gerektirir:

- Naive `policy_decisions`, unified approval queue veya broad MCP governor coverage ship eder.
- Ruflo artifact/test/eval-grounded live outcome adapterı ship eder.
- Orca orchestration native Run UI + org/RBAC/placement/verification'a geçer.
- Cline teams/Kanban historical evaluation ve policy-bound settlement ekler.
- Paperclip Enforced Outcomes/organizational learning ship eder.
- GitHub Agentic Workflows GA olur veya third-party agents enterprise policy'ye full girer.
- Codex/Claude native teams, schedules, memory ve compliance telemetry'yi stable unified control plane'e bağlar.
- Temporal/LangGraph/Microsoft AF Deckent'i kolayca üst katmana gereksiz kılan opinionated operator platform çıkarır.

## 13. Battlecard one-liners

- **vs Naive:** Naive agents'a business rails verir; Deckent agents'ın işini independently prove ve govern eder. Birlikte kullanılabilirler.
- **vs Ruflo:** Ruflo learns from signals; Deckent should learn only from accepted evidence with provenance and rollback.
- **vs Cline:** Cline is a powerful coding-agent product; Deckent governs an open fleet and settles outcomes across runtimes.
- **vs GitHub:** GitHub owns the repository workflow; Deckent owns provider-neutral execution authority across repositories, hosts and environments.
- **vs Paperclip:** Paperclip manages the company; Deckent proves and settles the work.
- **vs Orca:** Orca makes parallel agents easy to operate; Deckent must make their results safe to trust.
- **vs Codex/Claude/Devin:** They are excellent agents; Deckent is the independent system that chooses, constrains, verifies and learns across them.
- **vs OpenClaw:** OpenClaw is a strong personal gateway; Deckent targets hostile-tenant, evidence-bound organization authority.
- **vs LangGraph/Temporal/CrewAI:** They are build layers; Deckent is the product and governance contract above the runtime.

## 14. Final recommendation

Bir sonraki stratejik dönem için karar şu olmalıdır:

1. Yeni breadth'i dondur; trust spine ve canonical closure'ı bitir.
2. Verified Operations wedge'ini flagship binary proof ile görünür kıl.
3. Learning'i accepted evidence dışında hiçbir label'dan besleme.
4. Terminal + desktop'ta canonical trust UX'i ship et; dashboard'ı observability-only tut.
5. Naive regulated primitives ve incumbent agents ile integrate ol; onların işini yeniden yazma.
6. Enterprise değerini RBAC değil proof, recovery, audit, isolation ve policy packs üzerinden fiyatlandır.
7. Every-environment ve P10 assurance kapanmadan scale claim üretme.

Deckent'in kazanma yolu rakiplerden daha fazla özellik taşımak değil; **rakiplerin ürettiği work'ü dahi güvenilir authority'ye dönüştürebilen taraf olmak**tır.
