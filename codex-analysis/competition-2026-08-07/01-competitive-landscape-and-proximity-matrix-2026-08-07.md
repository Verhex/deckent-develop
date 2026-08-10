# Analiz 1 — Deckent rekabet evreni ve 10 üzerinden yakınlık matrisi

**Tarih:** 7 Ağustos 2026  
**Araştırma kesiti:** Public official sources + Deckent canonical status/source inspection  
**Amaç:** Kim gerçek rakip, kim platform substitute, kim yalnız teknik benzer veya complement; bunu tek bir kategoriye zorlamadan ölçmek.

## Executive verdict

Naive gerçekten güçlü ve muhtemel bir rakiptir; bu araştırma kesitinde **8,1/10 ile Deckent'e en yakın bağımsız direct-core ürün** çıkmıştır. Benzerlik yüzeysel “multi-agent” benzerliği değildir: tenant-addressed durable teams, governed agent profiles, budgets, approvals, audit, Brain, Agent IaC ve gerçek-dünya primitives aynı control plane'de birleşir. Fakat Naive'ın çekirdeği hosted regulated business infrastructure'dır; Deckent'in hedeflediği local-first, every-environment, heterogeneous coding/runtime orchestration ve artifact-grounded verified settlement aynı ürün merkezi değildir.

Tek bir “en büyük rakip” yoktur. Deckent üç ayrı rekabet cephesinin kesişimindedir:

1. **Independent Agent OS/control planes:** Naive, Ruflo, Cline, Paperclip, stablyai/orca, OpenClaw.
2. **Incumbent platform compression:** GitHub Agent HQ/Agentic Workflows, OpenAI Codex, Claude Code, Devin.
3. **Build-layer substitution:** LangGraph/LangSmith, Microsoft Agent Framework, CrewAI/AMP, AutoGen ve Temporal.

Matris, direct-core deep-dive için sekiz ürün seçti: **Naive, Ruflo, Cline, GitHub Agent HQ + Agentic Workflows, Paperclip, stablyai/orca, OpenAI Codex ve OpenClaw.** LangGraph, Microsoft Agent Framework ve CrewAI'nın toplam teknik yakınlığı yüksek olmasına rağmen aynı satın alma kararını ikame etmedikleri için doğrudan rakip sayılmadı.

## 1. Deckent hangi kategoride yarışıyor?

Deckent'i yalnız “coding agent orchestrator” diye tanımlamak rakip evrenini yanlış kurar. Canonical product identity'ye göre Deckent, provider-neutral, local-first bir **Agent OS/runtime ecosystem**; Assistant/Worker/Platform Trinity'sini `Goal → Mission → Flow → Run → WorkItem → Attempt → Operation` authority zincirinde birleştirmeyi hedefler. Primary product surface terminal + desktop, dashboard ise observability-only'dir. Product moat iddiası deterministic eval-backed orchestration ve `outcome → evidence → routing → promotion → training trace` loop'udur ([IDENTITY](../../.deckent/workspace/IDENTITY.md), [MASTER-PLAN §North Star](../../docs/MASTER-PLAN.md)).

Bu tanım beş ayrı buyer job doğurur:

- Birden fazla agent/provider/runtime'ı tek policy ve execution authority altında çalıştırmak.
- Task/goal planını bağımlılık, claim, attempt, recovery ve settlement ile durable işletmek.
- Agent'ın “bitti” beyanını değil, artifact/test/evidence sonucunu kabul etmek.
- Solo terminalden enterprise multi-tenant fleet'e aynı canonical state'i projection etmek.
- Doğrulanmış outcome'u routing/learning'e güvenli biçimde geri beslemek.

Bir ürün bu job'ların yalnız birini yapıyorsa benzer olabilir; Deckent yerine satın alınmıyorsa direct competitor değildir.

## 2. Skor modeli

Her boyut 0–10 puanlandı ve ağırlıklı ortalama alındı:

| Boyut | Ağırlık | Ne ölçüyor? |
|---|---:|---|
| Buyer/job overlap | %20 | Aynı buyer aynı iş için Deckent yerine bunu seçebilir mi? |
| Orchestration authority | %20 | Plan, dependency, delegation, attempt, settlement authority derinliği |
| Governance/approval/audit | %15 | Policy, identity, approval, budget, least authority, audit |
| Durability/recovery | %12 | Crash survival, replay, fencing, idempotency, recovery |
| Provider/runtime neutrality | %10 | Heterogeneous agent/provider/environment desteği |
| Memory/learning/evaluation | %10 | Persistent memory + evidence-based evaluation/adaptation |
| Product surfaces/operator UX | %7 | Terminal, desktop, IDE, web, mobile ve connectors |
| Enterprise/scale | %6 | Multi-tenancy, admin, deployment breadth ve scale posture |

**Direct-core karar kapısı:** toplam `≥ 7,0`, buyer/job overlap `≥ 7,0` ve yalnız SDK değil runnable operator/control-plane product. Puanlar capability count veya market share değildir; [canonical scoring data](evidence/proximity-matrix.json) her subscore'u ve gerekçeyi taşır.

## 3. Yakınlık matrisi — 21 ürün

| Sıra | Ürün/küme | Yakınlık /10 | Sınıf | En güçlü benzeşme | Temel ayrım |
|---:|---|---:|---|---|---|
| 1 | **Naive** | **8,1** | **Direct-core** | Governed profiles + durable teams + budgets/approvals + Brain + IaC | Hosted regulated rails; local verified software execution merkez değil |
| 2 | **Ruflo** | **7,8** | **Direct-core** | Swarms, routing, memory, learning ve broad meta-harness | Outcome provenance ve enterprise authority daha zayıf |
| 3 | **Cline** | **7,7** | **Direct-core** | CLI+IDE+Kanban+SDK+teams+schedules+enterprise | Verified settlement/closed learning görünür değil |
| 4 | **GitHub Agent HQ + Agentic Workflows** | **7,7** | **Direct-core** | Mission control, multi-agent distribution, sandboxed repo automation | GitHub/SDLC-bound; domain-general local Agent OS değil |
| 5 | **Paperclip** | **7,7** | **Direct-core** | Goals, orgs, budgets, approvals, multi-company control plane | Explicitly control plane, not execution plane; learning zayıf |
| 6 | **stablyai/orca** | **7,6** | **Direct-core** | Polished cross-platform fleet UX + worktrees + durable orchestration | Evaluation/learning/org policy depth daha ince |
| 7 | LangGraph + LangSmith | 7,4 | Structural adjacent | Durability, HITL, state, tracing/evaluation | Framework/runtime; operator Agent OS değil |
| 8 | Microsoft Agent Framework | 7,3 | Structural adjacent | Typed workflows, checkpoint, memory, multi-agent patterns | SDK/Azure building block |
| 9 | CrewAI + AMP | 7,3 | Structural adjacent | Crews/flows, persistence, HITL, managed deployment | Embedded automation platform; full local control plane değil |
| 10 | **OpenAI Codex** | **7,3** | **Direct-core** | Local/cloud, subagents, worktrees, app-server, SDK, policy | OpenAI-native coding agent; neutral fleet governance değil |
| 11 | **OpenClaw** | **7,2** | **Direct-core** | Gateway, multi-surface routing, isolated agents, approvals | One-operator trust domain; hostile tenant isolation değil |
| 12 | Claude Code | 6,8 | Platform substitute | Agent teams/subagents, hooks, checkpoints, SDK, managed policy | Provider-native ve coding-centric |
| 13 | Devin | 6,8 | Platform substitute | Mature parallel coding fleet, RBAC/VPC, knowledge, MCP | Closed agent/service; third-party fleet control plane değil |
| 14 | Temporal | 6,8 | Not direct / substrate | Best-in-class durable execution, history, signals, HITL | Agent OS/product/evaluation loop sağlamaz |
| 15 | n8n | 6,5 | Not direct | Enterprise workflow/connectors/governance budget overlap | Unit of work business workflow, agent attempt/evidence değil |
| 16 | Untrivial Agent Orchestrator | 6,4 | Product adjacent | Worktree fleet ve PR/CI/review/merge loops | Governance/learning/settlement sığ |
| 17 | Replit Agent | 6,3 | Product adjacent | Basic user için end-to-end app + full-state checkpoints | Vertically integrated cloud, neutral control plane değil |
| 18 | Hermes Agent | 6,3 | Product adjacent | Terminal/gateway/tools/memory UX | Enterprise authority ve verified settlement yok |
| 19 | AutoGen | 6,1 | Structural adjacent | Event-driven distributed multi-agent runtime | Behavior/governance/product contractı builder'a bırakır |
| 20 | OpenHands | 6,0 | Product adjacent | Open coding-agent runtime/deployment | Cross-agent organization OS değil |
| 21 | Cursor + Windsurf | 5,9 | Product adjacent | Developer attention ve editor UX | Multi-runtime execution/evidence authority değil |

### Top-eleven dimension view

Kısaltmalar: `B` buyer, `O` orchestration, `G` governance, `D` durability, `R` runtime neutrality, `L` learning/eval, `U` UX/surfaces, `E` enterprise.

| Ürün | B | O | G | D | R | L | U | E | Total |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Naive | 8,5 | 8,0 | 9,0 | 8,0 | 7,0 | 7,0 | 7,5 | 9,0 | **8,1** |
| Ruflo | 8,0 | 9,0 | 6,0 | 7,5 | 8,0 | 9,0 | 7,0 | 6,5 | **7,8** |
| Cline | 8,5 | 7,5 | 7,5 | 7,0 | 9,0 | 5,5 | 9,0 | 8,0 | **7,7** |
| GitHub | 7,5 | 7,0 | 9,0 | 8,5 | 7,5 | 4,0 | 10,0 | 10,0 | **7,7** |
| Paperclip | 8,0 | 8,0 | 8,5 | 7,0 | 9,0 | 4,0 | 8,0 | 8,5 | **7,7** |
| Orca | 8,5 | 8,5 | 6,5 | 8,5 | 9,0 | 3,5 | 9,0 | 6,0 | **7,6** |
| LangGraph | 6,0 | 8,5 | 7,0 | 9,0 | 9,0 | 7,0 | 4,0 | 8,0 | 7,4 |
| Microsoft AF | 6,0 | 8,0 | 7,5 | 8,0 | 8,5 | 7,5 | 5,0 | 8,5 | 7,3 |
| CrewAI | 6,5 | 8,0 | 6,5 | 7,5 | 8,5 | 7,5 | 6,5 | 7,5 | 7,3 |
| Codex | 7,5 | 7,0 | 8,0 | 7,0 | 5,0 | 6,0 | 9,5 | 9,0 | **7,3** |
| OpenClaw | 7,0 | 7,0 | 7,5 | 7,0 | 8,5 | 6,0 | 9,0 | 6,0 | **7,2** |

## 4. Kim rakip, kim değil?

### A. Direct-core: aynı satın alma kararını gerçekten ikame edenler

**Naive** en yakın independent competitor'dır. [Product contract](https://usenaive.ai/) tek config ile agent profile, durable team, compute, data, money, identity, comms, budgets ve approvals sunar. [Durable runtime](https://usenaive.ai/docs/architecture/durable-runtime) yeni work'ün team+tenant lane'e taşındığını ve production task'ların terminal state'e koştuğunu belgeliyor. Bu, yalnız landing-page yakınlığı değil, gerçek runtime/control-plane yakınlığıdır.

**Ruflo**, Deckent'in architecture/learning anlatısına en doğrudan saldırıdır. Current [repository](https://github.com/ruvnet/ruflo) swarm, consensus, memory, neural learning, model routing ve Codex/Claude integration'ı tek meta-harness'te toplar. Ancak Deckent'in fark yaratabileceği nokta “learning var/yok” değil, learning label'ının bağımsız artifact/eval provenance'ıdır.

**Cline**, product-surface convergence lideridir. [Current repository](https://github.com/cline/cline) CLI, VS Code, JetBrains, SDK, Kanban, worktree/dependencies, multi-agent teams, schedules, connectors ve headless CI/CD sunuyor; [Enterprise](https://docs.cline.bot/enterprise-solutions/overview) BYO inference, local processing, SSO/RBAC, model/tool control ve OpenTelemetry ekliyor. Deckent'in “çok yüzey + neutral provider” iddiasını doğrudan sıkıştırır.

**GitHub**, teknik olarak Deckent'e en çok benzeyen ürün olmayabilir fakat en tehlikeli distribution competitor'dır. [Agent HQ](https://github.blog/news-insights/company-news/welcome-home-agents/) GitHub/VS Code/mobile/CLI'dan multi-agent mission control sunarken, [Agentic Workflows](https://github.blog/changelog/2026-02-13-github-agentic-workflows-are-now-in-technical-preview/) natural-language workflow'u read-only default ve safe outputs ile GitHub Actions'a compile eder. Buyer “ayrı control plane neden alayım?” diye sorabilir.

**Paperclip**, autonomous-company segmentinde direct competitor'dır. [Product contract](https://github.com/paperclipai/paperclip/blob/master/doc/PRODUCT.md) company'yi unit of organization yapar; goals, hierarchy, budgets, approvals, heartbeats ve multi-company isolation taşır. Aynı doküman “control plane, not execution plane” sınırını açıkça koyduğu için Deckent'in verified execution lane'i ayrıştırıcıdır.

**stablyai/orca**, operator experience ve fleet supervision açısından en doğrudan UX competitor'dır. [Repository](https://github.com/stablyai/orca) geniş CLI-agent support, worktrees ve cross-platform native workbench sunar; [orchestration surface](https://www.onorca.dev/docs/cli/orchestration) durable work semantics ekler. Kullanıcı derin kernel farkını göremiyorsa daha polished ürün algıyı kazanır.

**OpenAI Codex**, Deckent'in bir host/runtime adapter'ı olmaktan çıkıp bizzat category compressor olmuştur. Resmi [glossary](https://learn.chatgpt.com/docs/glossary) local/cloud, CLI/IDE/app, app-server, SDK, worktrees, automations, permissions ve enterprise governance'i aynı platformda tanımlar; [subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents) orchestration'ı native kılar. Deckent'in savunması feature parity değil, cross-provider independent authority olmalıdır.

**OpenClaw**, gateway/multi-surface/personal-runtime alanında direct competitor'dır. Fakat resmi [security contract](https://github.com/openclaw/openclaw/blob/main/docs/gateway/security/index.md) exec approvals'ı operator-intent guardrail'i olarak tanımlar ve gateway+node'u tek trust domain sayar; hostile multi-tenant boundary iddia etmez. Bu, Deckent enterprise authority için ayrım fırsatıdır.

### B. Platform substitutes: ayrı control plane'i gereksizleştirebilir

**Claude Code** ve **Devin** tam provider-neutral orchestration system değildir; yine de güçlü native agent/team/checkpoint/enterprise features ile buyer'ın Deckent ihtiyacını azaltabilir. Claude tarafında [checkpoints, subagents, hooks ve Agent SDK](https://www.anthropic.com/news/enabling-claude-code-to-work-more-autonomously), enterprise tarafında [managed policies, spend caps ve Compliance API](https://www.anthropic.com/news/claude-code-on-team-and-enterprise) vardır. Devin [enterprise RBAC/deployment](https://docs.devin.ai/enterprise/getting-started/get-started), parallel sessions ve [programmatic session/playbook/knowledge control](https://docs.devin.ai/work-with-devin/advanced-capabilities) sağlar.

### C. Structural-adjacent: teknik olarak yakın, satın alma olarak değil

**LangGraph/LangSmith**, **Microsoft Agent Framework**, **CrewAI/AMP** ve **AutoGen** Deckent'e benzeyen primitives sunar. Fakat bunlar çoğunlukla Deckent'in alternatifi değil, Deckent benzeri ürünün inşa edildiği runtime/SDK katmanıdır. Örneğin LangGraph [durable execution, HITL ve persistence](https://docs.langchain.com/oss/python/langgraph/overview) sağlar; product authority, cross-surface operator UX ve default governance'i builder belirler.

Bu grup iki nedenle yine stratejik önem taşır:

- Enterprise buyer Deckent almak yerine bu stack üzerinde internal platform kurabilir.
- Deckent kendi custom durability/framework katmanının fırsat maliyetini bu ürünlere karşı sürekli test etmelidir.

### D. Not direct: complement veya benchmark

**Temporal** en önemli “rakip olmayan rakip”tir. [Durable execution](https://temporal.io/) ve [AI reference architecture](https://go.temporal.io/platform-hub/ai-engineering/ai-reference-architecture) crash recovery, immutable history, signals/updates, HITL ve long-running loops için sert bir engineering benchmark sunar. Fakat Agent OS, model/provider routing, agent UX veya verified learning ürünü değildir. Deckent'in build-vs-integrate kararı için substrate candidate'dır.

**n8n**, Cursor/Windsurf, Replit Agent, OpenHands ve Hermes belirli bütçe/attention/surface'lerde baskı kurar; Deckent'in full control-plane job'unu tek başına ikame etmez. Bunları direct competitor diye etiketlemek roadmap'i feature-copy yarışına iter ve stratejik odak bozar.

## 5. UseNaive.ai için özel durum analizi

### Neden gerçek rakip?

- **Authority scope:** Agent'ın raw credential tutmadığı gateway, capability/budget/approval/revoke kararını tool-call sınırında uygular ([Governance Gateway](https://usenaive.ai/docs/architecture/governance-gateway)).
- **Tenant-native durability:** Team ve tenant address'in parçasıdır; yeni durable work Vetta lane'indedir ([durable runtime](https://usenaive.ai/docs/architecture/durable-runtime)).
- **Business-operating primitives:** Cards, KYC/KYB, incorporation, email/phone, model routing, compute, database ve customer billing aynı Agent IaC içinde birleşir.
- **Buyer overlap:** “Agent company nasıl güvenle çalışır?” sorusuna tek vendor answer verir; Paperclip ve Deckent buyer'ına saldırır.
- **Governance narrative:** Hard caps, parked approvals, server-side execution ve authoritative approval row, enterprise trust için güçlü ve anlaşılır bir hikâyedir.

### Neden Deckent'in aynısı değil?

- Naive'ın regulated rails'i first-party/closed boundary'dedir; Deckent'in local-first provider/runtime-neutral execution authority'sinden farklı bir business model ve trust boundary vardır.
- Naive durable runtime'ın resmi dokümanı halen iki approval queue, per-run kill eksikliği, empty mirror reads, `effects/model/apply/migrate/rollback` refusals ve team-stop sonrası in-flight spend riskini açıkça yazar.
- `policy_decisions` ledger henüz yoktur; `activity_events` best-effort'tur ve çeşitli policy/waiver/break-glass endpoints 501 döner ([decision ledger](https://usenaive.ai/docs/architecture/decision-ledger)).
- Approval gate default tenant user için çalışmaz ve şirketin herhangi bir authenticated member'ı company approval çözebilir ([approvals](https://usenaive.ai/docs/architecture/approvals)).
- MCP'de 271 tool'un yalnız 28'i capability/approval governor'a gider; 222 tool kit primitive assertion taşımaz. HTTP reads revoke sonrası açık kalır ve SSE auth connection lifetime boyunca cache edilir ([Governance Gateway](https://usenaive.ai/docs/architecture/governance-gateway)).
- Brain'de retention declared fakat enforced değildir; lessons/retention/decision surfaces 501'dir ([Brain](https://usenaive.ai/docs/architecture/brain)).

### Doğru rekabet hükmü

Naive'ı küçümsemek yanlış; Deckent'in tam kopyası saymak da yanlış. **Naive, governed agent-business infrastructure kategorisinde; Deckent ise verified heterogeneous agent operations kategorisinde merkezlenmelidir.** İki ürün hem rakip hem integration partner olabilir: Deckent Naive primitives'lerini governed external operations olarak kullanabilir, Naive ise Deckent'in orchestration/evaluation layer'ını otomatik olarak ikame etmiş olmaz.

## 6. Matrisin deep-dive seçimi

İkinci analizde aşağıdaki sekiz ürün incelenecek:

1. Naive — en yüksek overall proximity ve regulated-governance wedge.
2. Ruflo — orchestration/learning core saldırısı.
3. Cline — broad product convergence ve enterprise BYO inference.
4. GitHub Agent HQ + Agentic Workflows — distribution/governance compression.
5. Paperclip — organization/control-plane substitution.
6. stablyai/orca — operator UX + durable fleet orchestration.
7. OpenAI Codex — host platformın native category compression'ı.
8. OpenClaw — multi-surface gateway/approval pressure.

LangGraph, Microsoft Agent Framework, CrewAI, Temporal, Claude Code ve Devin ikinci analizde “pressure/substrate” olarak karşılaştırmaya girecek; primary direct-core competitor profili olarak ayrı bölüm almayacak.

## 7. Confidence ve caveats

- Skorlar 7 Ağustos 2026 snapshot'ıdır; hızlı release cadence nedeniyle aylık refresh gerekir.
- Public official claims gerçek customer reliability/scale kanıtı değildir. Source-available projelerde claim → code/release cross-check daha güçlüdür.
- Naive'ın gap disclosure şeffaflığı, kapalı rakiplerden daha düşük maturity varsayımı yaratmamalıdır; görünmeyen gap sıfır gap değildir.
- Deckent'in target architecture'ı ile shipped closure ayrılacaktır. Özellikle canonical kernel, runtime-wide ApprovalBroker, training trace, promotion, terminal cutover, every-environment ve million-scale work'leri MASTER-PLAN'da hâlâ open/blocked'dır.
- Market share, revenue, support quality ve enterprise win/loss verisi erişilebilir olmadığı için proximity score'a dahil edilmemiştir.

Tam kaynak zinciri: [source register](evidence/source-register.md). Tam subscore/veri: [proximity matrix JSON](evidence/proximity-matrix.json).
