# Analiz 2 — Matrisin seçtiği rakipler vs Deckent code/architecture truth

**Tarih:** 7 Ağustos 2026  
**Girdi:** [Analiz 1 yakınlık matrisi](01-competitive-landscape-and-proximity-matrix-2026-08-07.md)  
**Seçili direct-core küme:** Naive, Ruflo, Cline, GitHub Agent HQ + Agentic Workflows, Paperclip, stablyai/orca, OpenAI Codex, OpenClaw

## Executive verdict

Deckent'in en güçlü farklılaşma alanı “çok agent çalıştırmak” değildir. Bu özellik artık Orca, Cline, GitHub, Codex, Ruflo ve Paperclip tarafından farklı biçimlerde commodity'ye çevrilmiştir. Savunulabilir kategori ancak şu birleşim olabilir:

> **Heterogeneous agent work'ünü exact authority altında çalıştıran; sonucu artifact/evidence ile doğrulayan; approval, recovery ve routing consequence'ını aynı durable chain'e bağlayan local-first Agent Operations System.**

Bu moat bugün tamamlanmış bir market fact değil, güçlü bir **architecture/code moat candidate**'dır. Deckent source'ta ciddi foundations vardır: production Routing V3, disk/evidence-aware result evaluation, exact plan digest/revision contracts, durable attempt journal, signed approval ingress, mission claim/fence contracts ve versioned operation vocabulary. Fakat canonical kernel parent `BLOCKED`; runtime-wide ApprovalBroker, independent file provenance, training trace, promotion loop, terminal cutover, every-environment adapters ve million-scale assurance `OPEN/BLOCKED` durumundadır ([MASTER-PLAN](../../docs/MASTER-PLAN.md)).

Bu nedenle rakiplerden daha derin internal design'e sahip olmak yetmez. Deckent'in kazanma koşulu, bu design'i production-wide closure ve operator-visible proof'a çevirmektir.

## 1. Deckent code-truth baseline

### 1.1 Shipped/production-strength kabul edilebilen alanlar

| Alan | Code evidence | Rekabet anlamı |
|---|---|---|
| **Routing V3** | [`route-task-v3.ts`](../../src/core/routing/route-task-v3.ts) kendisini sole production engine olarak tanımlar; vectorize → eliminate → score → verify/policy → anti-temp → rank → decision/journal hattı vardır. Force route verifier'ı bypass etmez. | Ruflo/Cline/GitHub'ın generic routing'ine karşı deterministic, story/journal-backed authority temeli. |
| **Result evaluation** | [`result-evaluator.ts`](../../src/orchestra/result-evaluator.ts) disk claim verification, semantic evidence, production-wiring settlement, rubric ve honest-gate kontrolleri uygular. | Deckent'in en önemli potential moat'i: agent self-report yerine acceptance evidence. |
| **Typed mission work store** | [`mission-types.ts`](../../src/orchestra/autonomous/mission-store/mission-types.ts) Mission/WorkItem, dependency authority, approval binding, claim fence, attempt, lease, recovery acknowledgement ve atomic store operations tanımlar. | Paperclip/Ruflo/Orca karşısında durable work authority için ciddi internal depth. |
| **Routing journal/replay** | [`routing/journal.ts`](../../src/core/routing/journal.ts) config/winner/order/score drift'i fail eden decision journal/replay contractı taşır. | Learning değişse bile geçmiş kararın açıklanabilir/replayable olmasına temel. |

### 1.2 Code-present fakat production-wide closure'ı tamamlanmamış alanlar

| Alan | Code evidence | Açık authority/gap |
|---|---|---|
| **Canonical RunFlow** | [`run-flow-contract.ts`](../../src/core/run-flow-contract.ts) proposal, plan digest, gate findings, topology, exact approval snapshot ve `PREPARED → PROCESS_SPAWNED → ADMITTED → terminal/UNKNOWN` attempt journal tanımlar. | File header foundation'ın ilk halinde no production caller/default-off olduğunu söyler; MASTER sonradan bazı live exact-start dogfood kanıtı taşır, fakat `KERNEL-001` parent hâlâ `BLOCKED` ve competing authorities sürer. |
| **Operation Catalog** | [`operation-catalog/index.ts`](../../src/core/operation-catalog/index.ts) versioned `effect/gate/risk/capabilities/idempotency/auditEvent` vocabulary, effect minimum gates ve unknown-operation fail-closed davranışı sağlar. | Catalog presence ingress enforcement demek değildir; counter-ratchet/operation ingress closure ayrı work'tür. |
| **ApprovalBroker** | [`approval-broker.ts`](../../src/core/approval-broker.ts) atomic first-writer-wins, external decision watch, expiry ve persisted requests; [`approval-decision-ingress.ts`](../../src/core/approval-decision-ingress.ts) digest/MAC/actor/tenant/session/idempotency checks taşır. | `APPROVAL-001` hâlâ `OPEN`: v1 unknown-ID path, cross-surface drift, runtime-wide CLI/terminal/Desktop/API/connectors/Worker/Nervous closure ve every-environment proof eksik. |
| **Trace/learning foundation** | [`trace-recorder.ts`](../../src/agent/trace-recorder.ts) worker claim ile Brain verdict'i, retry/FIX purpose ve verdict'i ayrı taşır. | `TRAINING-TRACE-001` ve `PROMOTION-001` açık; end-to-end consent/redaction/retention/canary/rollback zinciri tamamlanmış değildir. |

### 1.3 Bugün external moat diye iddia edilmemesi gerekenler

- `Goal → Mission → Flow → Run → WorkItem → Attempt → Operation` tek lifecycle closure: `KERNEL-001 BLOCKED`.
- Runtime-wide bypass-free approval/operation authority: `APPROVAL-001`, `TOOL-AUTHORITY-001`, related cutovers açık.
- Default-on independent file provenance: result evaluator boundary check'i worker'ın `filesChanged` beyanına dayanıyor; MASTER `TRUST-HANDOFF-001` altında bu gap'i açıkça kaydediyor.
- Closed outcome → routing → promotion → training trace: Routing V3 shipped olsa da learning parent, trace ve promotion açık.
- Terminal as canonical management surface: `TERMINAL-001 BLOCKED`.
- Every-environment/million-scale: native adapters, HA/SLO/load/chaos/data governance proof'ları açık.

Bu ayrım competitor analysis'in temelidir: Deckent'in target state'i rakibin shipped state'iyle kıyaslanamaz.

## 2. Cross-competitor authority matrix

`Güçlü` = official shipped contractta merkezi; `Orta` = var fakat dar/partial/experimental; `Zayıf` = görünür core değil. Deckent sütunu current closure'a göredir, target architecture'a değil.

| Capability | Deckent current | Naive | Ruflo | Cline | GitHub | Paperclip | Orca | Codex | OpenClaw |
|---|---|---|---|---|---|---|---|---|---|
| Heterogeneous runtime control | Güçlü/partial cutover | Orta | Güçlü | Güçlü | Güçlü, GitHub-bound | Güçlü adapters | Güçlü | Orta, OpenAI-native | Güçlü |
| Canonical durable work lifecycle | Orta, parent blocked | Güçlü/partial Vetta | Güçlü | Orta | Güçlü repo workflow | Güçlü control plane | Güçlü/experimental | Orta | Orta |
| Exact approval authority | Orta, runtime-wide open | Güçlü fakat carve-outs/gaps | Orta | Orta | Güçlü staged outputs | Güçlü board approval | Orta | Güçlü local policy | Orta/operator-domain |
| Artifact-grounded result settlement | **Görece en güçlü**, provenance gap | Zayıf-orta | Zayıf-orta | Zayıf-orta | Orta, repo checks | Zayıf | Zayıf | Orta, task/review | Zayıf |
| Closed governed learning | Partial/open | Partial Brain | Güçlü adaptation, label risk | Zayıf | Zayıf | Zayıf | Zayıf | Platform-internal | Orta personal memory |
| Crash recovery/replay | Güçlü foundations, closure open | Güçlü/partial | Orta-güçlü | Orta | Güçlü Actions substrate | Orta-güçlü | Güçlü | Orta-güçlü | Orta-güçlü |
| Enterprise tenant/policy | Partial/open | Güçlü | Orta | Güçlü | Çok güçlü | Güçlü | Orta | Güçlü | Zayıf-orta |
| Operator UX/distribution | Partial/blocking risk | Orta | Orta | Çok güçlü | Çok güçlü | Güçlü | Çok güçlü | Çok güçlü | Güçlü |

Ana sonuç: Deckent'in teknik farkı yalnız bir hücrede açıkça belirgin — **artifact-grounded acceptance/settlement**. Fakat bu fark production-wide provenance + surface closure olmadan market moat'e dönüşmez.

## 3. Direct-core deep dives

### 3.1 Naive — en yakın independent Agent OS/control-plane competitor

#### Örtüşme

Naive'ın [product surface'i](https://usenaive.ai/) agent profile'ı identity, money, comms, tools, model routing, compute ve data ile birleştiriyor; Agent IaC ile capability, budget ve approval policies declaration içinde tutuluyor. [Durable runtime](https://usenaive.ai/docs/architecture/durable-runtime) team+tenant address, board, runs, schedule, audit ve Vetta/Hermes split'ini tanımlıyor. Bu, Deckent'in tenant/project authority, Mission/WorkItem, admission, budget, approval ve audit hedefleriyle gerçek overlap'tir.

#### Naive'ın önde olduğu alanlar

- Regulated real-world primitives: virtual cards, KYC/KYB, company formation, payments, email/phone ve billing tek platformda.
- Multi-tenant business infrastructure onboarding ve hosted service comprehensibility.
- Budget'ın real-world spend + platform credits'i atomically reserve eden tek cap'e bağlanması.
- Agent IaC'nin capability ve resources'ı developer-readable config'e çevirmesi.
- External narrative: “agent şirketi güvenle işlet” mesajı Deckent'in internal authority vocabulary'sinden daha kolay anlaşılır.

#### Naive'ın kanıtlanmış sınırları

Naive'ın kendi docs'u güçlü ve çok değerli gap disclosure sunuyor:

- Durable lane'de 33 operation'ın 24'ü çalışır; dokuz operation her iki runtime'da 501'dir. Per-run kill yoktur, team stop in-flight attempt'i recall etmez.
- Durable board ile legacy mirror reads aynı tenant için çelişebilir; events/runs/cost/diagnostics empty `200` dönebilir.
- Naive approval queue ile Vetta internal tool-call queue ayrıdır; birini approve etmek diğerini release etmez.
- [Decision ledger](https://usenaive.ai/docs/architecture/decision-ledger) `policy_decisions` tablosunun henüz var olmadığını; activity log'un best-effort olduğunu yazar.
- [Approval contract](https://usenaive.ai/docs/architecture/approvals) default tenant user carve-out'u ve company member resolution breadth'i taşır.
- [Governance Gateway](https://usenaive.ai/docs/architecture/governance-gateway) MCP capability/approval coverage'ını 28/271 tool; primitive assertion coverage'ını 49/271 olarak açıklar. HTTP read revoke carve-out'u ve connection-cached SSE auth vardır.
- [Brain](https://usenaive.ai/docs/architecture/brain) retention policy'sinin enforced olmadığını ve lessons/retention/decisions surfaces'in 501 olduğunu bildirir.

#### Deckent için anlamı

Deckent Naive'ın cards/KYC/LLC feature set'ini kopyalamamalıdır. Bu, regulated-counterparty business'ine ve farklı compliance capital'ine girmek olur. En güçlü hamle **coopetition**'dır: Naive primitives Deckent Operation Catalog altında external governed operations olarak consume edilir; Deckent plan/evaluate/settle/recover authority'sini korur.

#### Hüküm

**Threat: çok yüksek; category overlap gerçek.** Naive business-agent infrastructure wedge'inde Deckent'ten ileride. Deckent verified heterogeneous execution wedge'ini production proof'a dönüştürürse iki ürün ayrışır; bunu yapamazsa Naive “Agent OS” label'ını daha anlaşılır şekilde sahiplenebilir.

### 3.2 Ruflo — orchestration ve learning çekirdeğine en yakın saldırı

#### Örtüşme

[Ruflo](https://github.com/ruvnet/ruflo) swarm topologies, consensus, memory, SONA/neural learning, model routing, MCP/plugins, security ve Claude/Codex integration'ı tek meta-harness'te toplar. Bu breadth, Deckent'in agent/skill pool, Routing V3, outcome tracking, memory ve autonomous execution alanlarına doğrudan saldırır.

#### Ruflo'nun önde olduğu alanlar

- Community/distribution ve capability breadth.
- Swarm vocabulary, topology ve consensus options.
- Adaptive routing/learning'in kullanıcıya görünür ürün claim'i olması.
- Plugin/MCP catalog ve hızlı feature shipping.

#### Deckent'in avantaj adayı

31 Temmuz source audit'inde Ruflo post-task success signal'ının caller'dan geldiği ve absent flag durumunda backward-compatible optimistic success'e düştüğü doğrulandı; adaptive scheduler signal'ı iyi tüketse de label artifact/test/eval'dan bağımsızdı (prior audit, [hook source](https://github.com/ruvnet/ruflo/blob/main/v3/%40claude-flow/cli/src/commands/hooks.ts)). Deckent result evaluator ise disk/evidence/production-wiring gates taşır. Bu fark, **learning algorithm değil truth provenance** farkıdır.

#### Risk

Ruflo artifact-grounded outcome adapter ekler ve enterprise authority'yi güçlendirirse Deckent'in en önemli moat adayı daralır. Ruflo'nun geçmişte fabricated metrics'i release note ile kaldırması ayrıca hızla self-correct eden bir rakip olduğunu gösterir.

#### Hüküm

**Threat: çok yüksek; architecture/learning ranking #1.** Deckent “self-learning orchestration” claim'ini tek başına kullanmamalı. Claim'in tamamı “independently verified outcome provenance + rollbackable consequence” olmalıdır.

### 3.3 Cline — product breadth ve enterprise BYO-inference lideri

#### Örtüşme

Cline'ın [current repository](https://github.com/cline/cline) CLI, VS Code, JetBrains, SDK, web Kanban, worktree per card, dependency chains, multi-agent teams, scheduled automations, connectors, plugins/hooks, MCP ve headless CI/CD'yi aynı engine üzerinde sunar. [Enterprise layer](https://docs.cline.bot/enterprise-solutions/overview) local processing, BYO inference, SSO/RBAC, model/tool controls, remote config, usage/cost analytics ve OpenTelemetry sağlar.

#### Cline'ın önde olduğu alanlar

- Basic user'dan enterprise developer'a coherent product surfaces.
- Provider/model breadth ve direct provider contracts.
- IDE-native adoption; developer workflow'da düşük switching cost.
- Enterprise buyer için anlaşılır governance/observability bundle.

#### Deckent'in farkı

Cline execution'ın “task completed” sonucunu higher-order canonical Goal/Mission/Attempt/Operation evidence settlement'a bağlayan public contract göstermiyor. Checkpoints rollback sağlar; Deckent'in hedefi acceptance criteria, production wiring, independent provenance ve outcome consequence'ıdır.

#### Risk

Cline Kanban/teams'in üzerine durable attempt semantics, policy-bound approvals ve evaluation history koyarsa Deckent'in surface + neutrality farkı ciddi biçimde azalır. Cline'ın source, SDK ve enterprise distribution kombinasyonu onu yalnız “IDE extension” saymayı imkânsız kılar.

#### Hüküm

**Threat: çok yüksek; broad convergence ranking #1.** Deckent UX paritesini değil, `why routed / what proved / what changed / how recovered` trust UX'ini öne çıkarmalıdır.

### 3.4 GitHub Agent HQ + Agentic Workflows — en büyük distribution ve trust-bundle tehdidi

#### Örtüşme

[Agent HQ](https://github.blog/news-insights/company-news/welcome-home-agents/) GitHub, VS Code, mobile ve CLI'da multi-agent mission control sunar; [Claude/Codex preview](https://github.blog/news-insights/company-news/pick-your-agent-use-claude-and-codex-on-agent-hq/) heterogeneous agent selection'ı incumbent platforma taşır. [Agentic Workflows](https://github.blog/changelog/2026-02-13-github-agentic-workflows-are-now-in-technical-preview/) Markdown intent'i Actions workflow'una compile eder, read-only default ve safe outputs kullanır.

#### GitHub'ın önde olduğu alanlar

- Existing identity, repository, PR, issue, CI, mobile ve enterprise policy distribution.
- [Explicit hostile-agent threat model](https://github.blog/ai-and-ml/generative-ai/under-the-hood-security-architecture-of-github-agentic-workflows/): secrets isolation, staged/vetted writes, network constraints ve comprehensive logs.
- Natural durable substrate: GitHub Actions, commits, PRs ve repository event history.
- Enterprise buyer'ın yeni control plane deploy etmeden policy uygulayabilmesi.

#### Deckent'in farkı

GitHub scope doğal olarak repository/SDLC'dir. Deckent domain-general local work, non-GitHub projects, provider auth/capacity/budget admission, offline/self-hosted execution ve cross-surface evidence chain üzerinde ayrışabilir. Ancak bu fark yalnız every-environment ve enterprise proof kapanırsa gerçek olur.

#### Hüküm

**Threat: çok yüksek; market/distribution ranking #1.** GitHub'ın Deckent kernel'ini teknik olarak aşması gerekmez; buyer'ın ayrı ürün ihtiyacını ortadan kaldırması yeterlidir.

### 3.5 Paperclip — autonomous-company control plane'i en iyi anlatan rakip

#### Örtüşme

[Paperclip](https://github.com/paperclipai/paperclip) company, org chart, goals, issues, budgets, approvals, heartbeats, multi-company isolation ve audit vocabulary'siyle Deckent Goal/Mission/Autonomous/connector alanına yaklaşır. Adapter model'i Claude Code, Codex, Gemini, Hermes ve HTTP runtimes'ı çağırır.

#### Paperclip'in önde olduğu alanlar

- Company/org metaphor'unun non-technical stakeholder için anlaşılabilirliği.
- Budget/governance/board approval'ı product surface'in merkezine koyması.
- Multi-company management ve mobile monitoring narrative'i.
- Control plane ile agent runtime'ı açıkça ayıran architecture boundary.

#### Deckent'in farkı

Paperclip'in kendi [product contractı](https://github.com/paperclipai/paperclip/blob/master/doc/PRODUCT.md) “control plane, not execution plane” der. Deckent execution kernel, evidence evaluation, provider admission, recovery ve routing consequence'ını own etmeyi hedefler. Bu fark, Paperclip agent outputs'unu yalnız heartbeat/result olarak kabul ederken Deckent'in artifact-grounded host settlement yapabilmesiyle somutlaşmalıdır.

#### Hüküm

**Threat: yüksek-çok yüksek; autonomous-company buyer'ında direct.** Paperclip verified outcomes ve organizational learning'i ship ederse proximity hızla artar.

### 3.6 stablyai/orca — ürünleştirilmiş operator experience tehdidi

#### Örtüşme

[Orca](https://github.com/stablyai/orca) heterogeneous CLI agents'ı worktrees içinde side-by-side çalıştıran cross-platform native workbench'tir. [Experimental orchestration](https://www.onorca.dev/docs/cli/orchestration) durable Runs, Tasks, Dispatches, Messages, Decisions, dependency DAG, inbox, heartbeats, retry/recovery ve federation ekler.

#### Orca'nın önde olduğu alanlar

- Polished desktop/terminal workbench, installation ve operator discoverability.
- Worktree/session ergonomisi; parallel fleet state'in görsel yönetimi.
- CAS/idempotency/federation primitives'i ürüne hızla taşıma.
- “Her CLI agent” mesajının kolay anlaşılması.

#### Deckent'in farkı

Orca implementation checklist'in explicit non-goals'ı generalized org/RBAC, placement/capacity/fairness, verified correctness, deep outcome learning ve full filesystem enforcement gibi alanları dışarıda bırakır. Deckent bu alanları target eder; fakat kendi terminal/desktop closure'ı gerideyse kullanıcı farkı deneyimleyemez.

#### Hüküm

**Threat: çok yüksek; operator UX ranking #1.** Deckent kernel proof'unu operator-visible yapmazsa daha derin architecture, daha iyi ürün deneyimine yenilir.

### 3.7 OpenAI Codex — Deckent'in host dependency'sinden category competitor'a

#### Örtüşme

Resmi [Codex glossary](https://learn.chatgpt.com/docs/glossary) local/cloud execution, CLI/IDE/desktop/web, worktrees, app-server, SDK, non-interactive CI, approvals, sandbox/permissions, MCP/plugins, automations, remote connections ve enterprise configuration'ı tek ürün ailesinde tanımlar. [Subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents) parallel delegation, thread inspection/steering ve sandbox inheritance sağlar.

#### Codex'in önde olduğu alanlar

- Frontier model + agent runtime + surfaces'in native integration'ı.
- Desktop/CLI/IDE/cloud distribution ve low-friction onboarding.
- Sandbox/approval/managed-config surface maturity.
- App-server/SDK ile third-party embedding.

#### Deckent'in farkı

Deckent Codex'i bir worker/provider olarak kullanabilir; provider/model/effort, auth, reachability, usage/limit ve finite-budget admission'ı independently resolve etmeyi hedefler. Cross-provider XVerify separation ve provider-neutral settlement Codex'in kendi native scope'undan farklıdır.

#### Internal warning

Deckent MASTER-PLAN, mevcut Codex Brain dönemine ait dogfood kanıtında dispatch authority'yi yeniden-yetkilendirme canary'lerine kadar kaldırmış durumda. Bu, “Codex integration var” ile “Codex güvenli orchestrator authority” arasında Deckent'in kendi honest-truth standardını uyguladığını gösterir; aynı zamanda production confidence gap'inin açık kanıtıdır.

#### Hüküm

**Threat: yüksek; platform compression.** Deckent Codex features'i yeniden yazmamalı; Codex'i governed runtime olarak consume etmeli ve provider-independent authority katmanını own etmelidir.

### 3.8 OpenClaw — multi-surface gateway ve approval pressure

#### Örtüşme

OpenClaw multiple isolated agents, workspace/session routing, channels, schedules, gateway/node execution ve exec approvals sunar. [Configuration](https://github.com/openclaw/openclaw/blob/main/docs/gateway/configuration.md) agent/channel/account bindings'i; [security contract](https://github.com/openclaw/openclaw/blob/main/docs/gateway/security/index.md) exact request-context approval, prepared run plan ve post-approval mutation rejection'ı tanımlar.

#### OpenClaw'ın önde olduğu alanlar

- Messaging/channel-first multi-surface runtime adoption.
- Personal agent/gateway experience ve device-node execution.
- Shared approval semantics ve practical operator controls.
- Broad provider/tool integration.

#### Sınır

Official docs gateway+node'u tek operator trust domain sayar; exec approvals hostile multi-tenant isolation değildir ve every interpreter/runtime loader path'i semantically modellemediğini açıklar. Deckent'in tenant/principal/operation/capability/approval/audit chain'i enterprise-grade biçimde kapanırsa belirgin fark oluşur.

#### Hüküm

**Threat: yüksek; multi-surface personal runtime.** Deckent connector/gateway UX'i için ciddi benchmark, fakat enterprise hostile-tenant authority'de doğrudan eşit değildir.

## 4. Pressure/substrate kümesi: neden izlenmeli ama kopyalanmamalı?

### LangGraph/LangSmith, Microsoft Agent Framework, CrewAI/AMP

Bu ürünler durable graph/flow, HITL, memory, traces, deployment ve evaluation primitives sunar. Kendi Agent OS'ini inşa eden enterprise'ın Deckent yerine kullanabileceği components'tir. Deckent her custom kernel primitive'inde şu soruyu sormalı:

> Bu capability Deckent'in differentiating authority'si mi, yoksa Temporal/LangGraph/Microsoft AF üzerinde daha güvenli taşınabilecek commodity durability mi?

Yanıt “commodity substrate” ise yeniden yazmak moat üretmez. Yanıt “cross-surface exact authority + evidence consequence” ise Deckent own etmelidir.

### Temporal

Temporal competitor değil, hard durability benchmark'tır. Workflow history, activity retry, signal/update, long-duration recovery ve tenant namespace patterns; Deckent Attempt/Operation/recovery design'i için build-vs-integrate pressure yaratır. Deckent'in custom file/SQLite authority'si, Temporal-class crash/replay/HA semantics'e karşı sürekli kanıtlanmalıdır.

### Claude Code ve Devin

Bunlar platform substitutes'tır. Claude Code team/subagent/checkpoint/SDK/policy bundle; Devin parallel sessions/knowledge/enterprise deployment/MCP bundle ile “tek güçlü agent service yeter” kararını destekler. Deckent'in cevabı model/agent quality yarışına girmek değil, heterogeneous fleet'in sonuçlarını independently govern etmektir.

## 5. Deckent'in gerçek moat adayları ve commodity'ler

### Savunulabilir moat adayları

1. **Artifact-grounded acceptance:** worker claim değil host-observed disk/test/eval/production-wiring evidence.
2. **Exact authority chain:** proposal digest/revision → approval snapshot → attempt fence → operation receipt → terminal settlement.
3. **Provider-neutral governed admission:** model/provider/effort/auth/reachability/usage/limit/budget/capacity'nin birlikte çözülmesi.
4. **Verified consequence:** accepted outcome'un routing/promotion/retry/recovery/training'e provenance ile bağlanması.
5. **Cross-provider verification:** output provider'dan ayrı fresh verifier authority; unavailable durumda honest HOLD.
6. **Every-environment truthful control:** native macOS/Linux/Windows/WSL/container/remote adapter matrix ve unsupported fail-honestly.

İlk dört madde source'ta anlamlı foundations taşıyor; beşinci/sixth ve production-wide closure tamamlanmadan market claim dikkatli yapılmalıdır.

### Artık tek başına moat olmayanlar

- Multi-agent/subagent spawning
- Worktrees ve parallel sessions
- Skills/plugins/MCP catalogs
- Approval prompts
- Schedules/automations
- Memory/RAG
- IDE/terminal/desktop presence
- Messaging connectors/mobile monitoring
- “Adaptive/self-learning routing” etiketi
- Multi-provider adapter listesi

## 6. Threat ranking — tek sayıdan daha kullanışlı görünüm

| Tehdit türü | #1 | #2 | #3 | Deckent'in exact response'u |
|---|---|---|---|---|
| Overall independent proximity | Naive | Ruflo | Cline | Verified Agent Operations category + closure proof |
| Orchestration/learning core | Ruflo | Naive | Orca | Evidence provenance + rollbackable consequence |
| Operator UX | Orca | Cline | Codex | Canonical terminal/desktop trust UX |
| Enterprise governance | Naive | GitHub | Paperclip/Cline | Runtime-wide operation/approval/receipt authority |
| Distribution | GitHub | Codex | Cline | Integrate incumbents; own neutral authority, not another walled garden |
| Autonomous-company buyer | Naive | Paperclip | Cline | External primitives integration + verified execution |
| Multi-surface personal runtime | OpenClaw | Codex | Cline | Connector identity + exact shared approval + recovery |

## 7. Likely next moves — evidence-based inference, not announced roadmap

Bu bölüm official current direction'dan yapılan inference'dır:

- **Naive:** Vetta control-plane gaps, dual approval queues, decision ledger ve MCP coverage'ını kapatmaya çalışacaktır; kendi docs'u exact missing surface'i zaten isimlendiriyor.
- **Ruflo:** caller-supplied outcome'u daha güçlü benchmark/test/artifact receipts ile ground etmeye yönelirse Deckent moat'ine en yakın teknik hamleyi yapar.
- **Cline:** Kanban/team state'i enterprise policy, historical analytics ve SDK hooks ile birleştirebilir.
- **GitHub:** Agent HQ third-party agent breadth, issue-intent approvals ve Agentic Workflows GA/enterprise cost governance'i büyütecektir.
- **Paperclip:** Enforced outcomes, outputs ve organizational learning'i control plane'e eklemek doğal extension'dır.
- **Orca:** Experimental orchestration'ı native workbench Run UI'a, ardından org/policy/placement'e taşımak en doğal product motion'dır.
- **Codex:** subagents, app-server, remote/cloud ve managed permissions arasındaki birleşim daha fazla native orchestration'ı platform içine çekecektir.
- **OpenClaw:** organization/multi-user trust ve cross-surface shared approval derinliği proximity'yi artıracak en olası yöndür.

## 8. Final competitive judgment

Deckent yalnız feature breadth üzerinden yarışırsa kaybeder: GitHub/Codex distribution'da, Orca/Cline UX'de, Ruflo breadth/learning claim'inde, Naive regulated rails'de ve Paperclip organization narrative'ında daha kolay anlaşılır avantajlara sahiptir.

Deckent'in kazanabileceği yer bu rakiplerin kesişiminde bıraktığı boşluktur:

> **Any agent, any environment, but no result becomes authority until the host can prove it; no approval, retry, recovery or learning consequence exists outside the same durable evidence chain.**

Bu hükmün markette savunulması için önce `KERNEL-001`, `KERNEL-SETTLEMENT-001`, `APPROVAL-001`, operation ingress, independent provenance, `TRAINING-TRACE-001`, `PROMOTION-001`, terminal/surface cutover ve P10 assurance zincirinin production-wide kapanması gerekir. Aksi halde Deckent'in farkı architecture document'ta gerçek, buyer experience'da görünmez kalır.

Kaynaklar: [source register](evidence/source-register.md). Stratejik karşılık: [ayrı öneri raporu](03-strategic-recommendations-2026-08-07.md).
