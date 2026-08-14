# Kaynak kaydı — 7 Ağustos 2026

Bu kayıt, rekabet raporlarının kanıt zinciridir. Dış ürünler için öncelik official product docs, official repositories ve official release notes'tur. Marketing claim ile shipped/code-truth aynı şey sayılmamıştır. Deckent için `docs/MASTER-PLAN.md` status authority, repository source ise implementation evidence olarak kullanılmıştır.

## Deckent — local canonical/code sources

| Kaynak | Kullanım | Kanıt sınıfı |
|---|---|---|
| [`.deckent/workspace/IDENTITY.md`](../../../.deckent/workspace/IDENTITY.md) | Agent OS kimliği, Trinity, canonical work hierarchy, surface yönü | Canonical product identity |
| [`docs/MASTER-PLAN.md`](../../../docs/MASTER-PLAN.md) | Shipped/open/blocked ayrımı; kernel, approval, learning, terminal, every-environment ve scale work authority | Canonical status ledger |
| [`DECKENT.md`](../../../DECKENT.md) | Current runtime, provider, memory, orchestration ve yüzey kataloğu | Repository contract |
| [`src/core/run-flow-contract.ts`](../../../src/core/run-flow-contract.ts) | Typed proposal, digest/revision approval snapshot ve exact-start attempt states | Source evidence; file header foundation/wiring caveat'iyle |
| [`src/orchestra/autonomous/mission-store/mission-types.ts`](../../../src/orchestra/autonomous/mission-store/mission-types.ts) | Mission/WorkItem, dependency, claim/fence/lease ve settlement contracts | Source evidence |
| [`src/core/operation-catalog/index.ts`](../../../src/core/operation-catalog/index.ts) | Versioned operation/effect/gate/risk/capability/idempotency/audit vocabulary | Source evidence; ingress closure ayrı doğrulanmalı |
| [`src/orchestra/result-evaluator.ts`](../../../src/orchestra/result-evaluator.ts) | Disk verification, semantic evidence, production-wiring ve honest-gate evaluation | Source evidence; independent provenance gap'i MASTER'da açık |
| [`src/core/approval-broker.ts`](../../../src/core/approval-broker.ts) ve [`src/core/approval-decision-ingress.ts`](../../../src/core/approval-decision-ingress.ts) | Durable approval state, first-writer-wins, signed/actor-bound decision ingress | Source evidence; runtime-wide cutover açık |
| [`src/core/routing/route-task-v3.ts`](../../../src/core/routing/route-task-v3.ts) ve [`src/core/routing/journal.ts`](../../../src/core/routing/journal.ts) | Production Routing V3, verification, deterministic replay/journal | Shipped source evidence |
| [`src/agent/trace-recorder.ts`](../../../src/agent/trace-recorder.ts) | Worker claim, Brain verdict ve retry/FIX trace shape | Source foundation; end-to-end training trace açık |
| 31 Temmuz 2026 competitor audit | Orca/Ruflo/Cline/OpenClaw/Paperclip için önceki source-level audit ve superseded verdict zinciri | Prior internal analysis; current external docs ile yeniden sınandı |

## Naive

| Official source | Kullanım |
|---|---|
| [Product home](https://usenaive.ai/) | Agent infrastructure, Agent IaC, Vetta/Hermes, governed primitives, identity/money/comms, model routing |
| [Durable runtime](https://usenaive.ai/docs/architecture/durable-runtime) | Team+tenant address, live Vetta path, 33-operation surface, mirror inconsistencies, missing operations, dual approval queues |
| [Governance Gateway](https://usenaive.ai/docs/architecture/governance-gateway) | Gateway enforcement, atomic budget reservation, revoke, HTTP/MCP coverage and exact 271-tool gaps |
| [Approvals](https://usenaive.ai/docs/architecture/approvals) | Gate order, default-user carve-out, authoritative approvals table, broad company-member approver rule |
| [Decision ledger](https://usenaive.ai/docs/architecture/decision-ledger) | `policy_decisions` absence, best-effort activity log, 501 surfaces, pure policy explain |
| [Brain](https://usenaive.ai/docs/architecture/brain) | Brain/partition/view model, human promotion, declared-but-unenforced retention, missing lessons/decision surfaces |
| [Open-core boundary](https://usenaive.ai/docs/architecture/open-core) | Closed regulated/runtime core versus open SDK/CLI/templates/modules |
| [Quickstart](https://usenaive.ai/docs/getting-started/quickstart) | CLI/SDK/MCP and default-user/multi-tenant onboarding behavior |
| [Official GitHub organization](https://github.com/usenaive) | Public-code boundary and template/SDK distribution evidence |

Naive'ın kendi documentation'ı unusual ölçüde açık gap disclosure yapıyor. Bu açıklık bir ceza faktörü değildir; skor mevcut shipped contract'a göre verilmiştir, daha az şeffaf rakipler otomatik olarak daha olgun sayılmamıştır.

## Direct-core rakipler

### stablyai/orca

- [Official repository](https://github.com/stablyai/orca) — cross-platform workbench, supported CLI agents, worktrees ve product surfaces.
- [Orchestration docs](https://www.onorca.dev/docs/cli/orchestration) — experimental durable Run/Task/Dispatch/Decision plane.
- [Implementation checklist](https://github.com/stablyai/orca/blob/main/ORCHESTRATION_IMPLEMENTATION_CHECKLIST.md) — CAS/idempotency/federation scope ve explicit non-goals.
- [Supported agents](https://www.onorca.dev/docs/agents/supported) — adapter breadth ve permission defaults.

### Ruflo

- [Official repository](https://github.com/ruvnet/ruflo) — current multi-agent/swarm/memory/learning/security/product claims.
- [v3.32.35 release](https://github.com/ruvnet/ruflo/releases/tag/v3.32.35) — outcome signal to adaptive scheduling.
- [v3.32.41 release](https://github.com/ruvnet/ruflo/releases/tag/v3.32.41) — fabricated metrics removal and honest routing measurements.
- [Post-task hook source](https://github.com/ruvnet/ruflo/blob/main/v3/%40claude-flow/cli/src/commands/hooks.ts) — success-label ingress.
- [Adaptive scheduler source](https://github.com/ruvnet/ruflo/blob/main/v3/%40claude-flow/cli/src/services/pheromone-adaptive.ts) — protected roles, quorum, exploration and adaptation.

### Cline

- [Official repository](https://github.com/cline/cline) — CLI, IDEs, Kanban, SDK, teams, schedules, connectors, plugins/MCP, checkpoints.
- [Enterprise overview](https://docs.cline.bot/enterprise-solutions/overview) — local code handling, BYO inference, SSO/RBAC, model/tool control, remote config and OpenTelemetry.
- [Enterprise member roles](https://docs.cline.bot/enterprise-solutions/team-management/managing-members) — current Owner/Admin/Member authority model.

### GitHub Agent HQ + Agentic Workflows

- [Agent HQ launch](https://github.blog/news-insights/company-news/welcome-home-agents/) — multi-agent mission control, enterprise control plane and cross-surface distribution.
- [Claude and Codex on Agent HQ](https://github.blog/news-insights/company-news/pick-your-agent-use-claude-and-codex-on-agent-hq/) — third-party agent availability and public-preview scope.
- [Agentic Workflows technical preview](https://github.blog/changelog/2026-02-13-github-agentic-workflows-are-now-in-technical-preview/) — Markdown-to-Actions compilation, safe outputs, isolation and multi-engine execution.
- [Security architecture](https://github.blog/ai-and-ml/generative-ai/under-the-hood-security-architecture-of-github-agentic-workflows/) — distrust-agent threat model, staged writes, secrets isolation and logging.
- [Issue automation controls](https://github.blog/changelog/2026-07-23-agent-automation-controls-in-github-issues-in-public-preview/) — rationale, confidence and approval on supported issue changes.

### Paperclip

- [Official repository](https://github.com/paperclipai/paperclip) — multi-company control plane, goals, budgets, approvals, heartbeat and audit.
- [Product contract](https://github.com/paperclipai/paperclip/blob/master/doc/PRODUCT.md) — explicit control-plane/not-execution-plane boundary.
- [Agent adapters](https://github.com/paperclipai/paperclip/blob/master/docs/adapters/overview.md) — Claude/Codex/Gemini/Hermes runtime adapters.
- [Releases](https://github.com/paperclipai/paperclip/releases) — multi-user access, resumable approval interactions and company skills evolution.

### OpenAI Codex

- [Official glossary](https://learn.chatgpt.com/docs/glossary) — current surface, policy, sandbox, worktree, cloud, SDK, app-server and enterprise nouns.
- [Subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents) — parallel agents, controls, sandbox inheritance and surface availability.
- [Configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference) — provider/profile, approvals, sandbox, permission, app and enterprise-controlled configuration.

Codex manual helper 7 Ağustos 2026'da sandbox DNS kısıtı nedeniyle fetch edilemedi; ilgili exact claims resmi OpenAI Docs MCP üzerinden search+fetch edilerek doğrulandı. Bu, source fallback notudur; capability inference yapılmadı.

### OpenClaw

- [Official repository](https://github.com/openclaw/openclaw) — gateway, agents, channels, tools and runtime breadth.
- [Gateway security](https://github.com/openclaw/openclaw/blob/main/docs/gateway/security/index.md) — operator trust domain, exact-context exec approvals and explicit non-hostile-multi-tenant boundary.
- [Gateway configuration](https://github.com/openclaw/openclaw/blob/main/docs/gateway/configuration.md) — multiple isolated agents, workspace/session binding and channel routing.

## Platform substitutes ve structural-adjacent ürünler

| Ürün | Official source | Matristaki rol |
|---|---|---|
| Claude Code | [Autonomy/checkpoints/SDK](https://www.anthropic.com/news/enabling-claude-code-to-work-more-autonomously), [enterprise controls](https://www.anthropic.com/news/claude-code-on-team-and-enterprise) | Provider-native platform substitute |
| Devin | [Enterprise setup](https://docs.devin.ai/enterprise/getting-started/get-started), [advanced session management](https://docs.devin.ai/work-with-devin/advanced-capabilities), [MCP](https://docs.devin.ai/work-with-devin/devin-mcp) | Closed coding-fleet substitute |
| LangGraph/LangSmith | [LangGraph overview](https://docs.langchain.com/oss/python/langgraph/overview), [persistence](https://docs.langchain.com/oss/python/langgraph/persistence), [HITL](https://docs.langchain.com/oss/python/langchain/human-in-the-loop) | Structural adjacent / possible substrate |
| Microsoft Agent Framework | [Microsoft AI technology map](https://microsoft.github.io/Microsoft-AI-Decision-Framework/docs/technologies.html) | Structural adjacent / enterprise framework |
| CrewAI/AMP | [Framework docs](https://docs.crewai.com/), [AMP](https://docs.crewai.com/enterprise/introduction) | Structural adjacent / managed agent platform |
| AutoGen | [Current docs](https://microsoft.github.io/autogen/), [application stack](https://microsoft.github.io/autogen/stable/user-guide/core-user-guide/core-concepts/application-stack.html) | Framework, not operator OS |
| Temporal | [Durable execution](https://temporal.io/), [AI engineering](https://go.temporal.io/platform-hub/ai-engineering), [agent reference architecture](https://go.temporal.io/platform-hub/ai-engineering/ai-reference-architecture) | Non-direct infrastructure benchmark/substrate |
| Replit Agent | [Checkpoints/rollback](https://docs.replit.com/references/version-control/checkpoints-and-rollbacks), [build-with-Agent](https://docs.replit.com/learn/build-with-agent) | Vertically integrated basic-user substitute |
| Untrivial Agent Orchestrator | [Official repository](https://github.com/Untrivial-ai/agent-orchestrator) | Engineering-fleet adjacent |
| Hermes Agent | [Official repository](https://github.com/NousResearch/hermes-agent) | Personal runtime and terminal UX reference |
| OpenHands | [Official docs](https://docs.all-hands.dev/) | Open coding-agent runtime adjacent |
| n8n | [Official docs](https://docs.n8n.io/) | Enterprise workflow automation budget-adjacent |
| Cursor/Windsurf | [Cursor docs](https://docs.cursor.com/), [Windsurf docs](https://docs.windsurf.com/) | IDE attention/product-surface adjacent |

## Araştırma sınırları

- Public official sources, kapalı beta/private roadmap, gerçek customer deployment quality, revenue, support quality veya undisclosed incident verisini göstermez.
- GitHub stars yalnız attention/adoption signal olabilir; puan formülüne doğrudan katılmamıştır.
- `shipped`, `experimental`, `prototype`, `roadmap` ve `non-goal` ayrılmıştır.
- Dış rakiplerin source code'u kapalıysa architecture claim'leri official docs seviyesindedir; Deckent source inspection ile aynı confidence sınıfında değildir.
- Snapshot tarihi 7 Ağustos 2026'dır; özellikle hızlı hareket eden ürünler için sonraki release bu hükmü değiştirebilir.
