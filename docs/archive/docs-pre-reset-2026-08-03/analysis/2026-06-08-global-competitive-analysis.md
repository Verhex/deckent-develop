# Deckent — Global Competitive Analysis (2026-06-08)

> Principal Architect / CTO / VC-Technical-Partner / Agentic-Systems-Researcher lens. Code-grounded (not README/marketing). Market data from current (2025-2026) public sources via 4 parallel research passes + GitHub API verification. **LOCAL / strategy doc.**

**Repository identified as Deckent.** (name=deckent, bin=deckent-mcp; sprint-controller, autonomous/runtime-loop, authority-enforcer, nervous, memory-store, worker, provider-registry, mcp/server all present; MIT; ~3011 src + ~1302 test .ts files.) Deckent is the SUBJECT; not compared against itself.

---

## ⚠️ Two methodological honesties (read first)
1. **Scoring asymmetry — deliberate.** Deckent is scored from **code ground-truth** (a 5-investigator + supplemental code pass; "wired-working" vs "scaffolded-not-wired" vs "absent"). Competitors are scored from **their own vendor/marketing claims + public signals** — which are inflated and unverifiable at the same depth. So in any head-to-head, Deckent is measured more harshly than its rivals. Where a competitor cell says "Yes," it often means "vendor claims Yes," not "code-verified Yes." Adjust the read accordingly.
2. **GitHub star anomaly — flagged.** Three repos return implausible star counts for their age (verified via GitHub API, NOT hallucinated): OpenClaw 377k (<7mo), Hermes-agent 187k (<11mo), OpenCode 171k. Star:watcher ratios are anomalous (e.g. Hermes 253:1 vs healthy ~15:1) → likely campaign/inorganic starring. **All "closest competitor" rankings here rest on ARCHITECTURE + fork counts, not star magnitude.** Forks (Hermes 32k, OpenClaw 79k, OpenCode 20k) are high and harder to fake → the projects are real, the adoption *magnitude* is uncertain.

---

# PART 1-2 — Market Landscape + Classification

## Category A — Agent Frameworks
| Product | Steward | OSS | Type | Direct/Adjacent? | Note |
|---|---|---|---|---|---|
| LangGraph | LangChain | MIT | Framework→Control-Plane (Platform) | Partial→Future | v1.0; durable stateful graphs; ~90M downloads; LangSmith Deployment self-hostable |
| CrewAI | CrewAI Inc | MIT | Framework | Partial | role-based crews + Flows; 150+ ent customers; ~48-53k★ |
| AutoGen / AG2 | MS (maint.) / community | MIT | Framework | Not (legacy) | AutoGen→maintenance, folded into MAF; AG2 community fork |
| OpenAI Agents SDK | OpenAI | MIT* | SDK | Adjacent | native sandbox + long-horizon harness (Apr 2026); OpenAI-first |
| Claude Agent SDK | Anthropic | MIT* | SDK + CLI | **Strategic** | bundled CLI, subagents, MCP-native, long-running; Claude-only |
| Google ADK | Google | Apache-2.0 | Framework + CLI | Future/Strategic | `adk run`/`adk web` CLI-forward; 200+ models; Vertex enterprise |
| Semantic Kernel→**MAF** | Microsoft | MIT | Framework | **Direct (structural)** | MAF 1.0 GA early-2026; OSS+self-host+multi-provider(incl Ollama)+MCP |
| Pydantic AI | Pydantic | MIT* | Framework | Adjacent | type-safe; durable exec; broad providers; Logfire/OTel |
| LlamaIndex Agents | run-llama | mixed | Framework | Adjacent | document/RAG-agent specialized |
| Mastra | Mastra (YC) | Apache* | TS Framework | Partial | TS-native, $22M Series A, Studio IDE; rising |
| Agno (ex-Phidata) | Agno | MPL* | Framework + AgentOS runtime | Partial | AgentOS has RBAC+HITL; extreme perf claims |

**Cross-cutting:** MCP is now table-stakes (all support it). **Durable/long-running execution** is the 2025-26 battleground. **Runtime isolation + CLI-first are rare** (only OpenAI SDK + ADK sandbox; only Claude SDK + ADK CLI-forward). **Learning/self-improvement is essentially ABSENT across all of Category A** — a genuine Deckent differentiator.

## Category B — Coding Agents
| Product | OSS | Type | vs Deckent | Note |
|---|---|---|---|---|
| Claude Code | closed | Coding Agent (CLI) | Adjacent/Strategic | parallel subagents (cap 16 concurrent/1000 total/run); Opus 4.8; Anthropic-only |
| Codex CLI | Apache-2.0 (CLI) | Coding Agent (CLI) | Adjacent | Rust, sandboxed exec, MCP, cloud handoff; 90k★; OpenAI-tuned |
| Cursor | closed | AI IDE | Adjacent | bg agents (≤8 parallel), Composer; *[spec]* ~$2B ARR / ~$29-50B val |
| Devin | closed | Autonomous SWE | Adjacent | cloud sandbox, SOC2-II, RBAC, VPC; *[spec]* ~$26B val; owns Windsurf |
| OpenHands | MIT | Autonomous SWE platform | Partial | Docker-sandbox default, multi-agent delegation, 76k★ |
| Aider | Apache-2.0 | Pair-programmer (CLI) | Not (single-agent) | architect mode; 46k★; contrast baseline |
| Continue | OSS | IDE+CLI assistant | Not | Agent Mode + CI checks; 34k★ |
| Sourcegraph Amp | closed | Coding Agent (CLI) | Adjacent | subagent parallelization, CLI-only pivot |
| Windsurf | closed | AI IDE | Adjacent | Cascade; now Cognition-owned (acq. saga 2025) |
| OpenCode | MIT | Coding Agent (CLI/TUI) | Partial | Go, multi-provider; ⚠️171k★ flagged |

## Category C — Parallel Orchestration (closest architectural neighbors)
| Product | OSS | Type | vs Deckent | Evidence |
|---|---|---|---|---|
| **Hermes Agent** (Nous) | MIT | CLI agent + parallel subagents | **CLOSEST analog** | CLI-first, ≤30 parallel workers, 6 isolation backends (local/Docker/SSH/Singularity/Modal/Daytona), FTS5 memory, **autonomous skill-creation/learning**, multi-provider, MCP. ⚠️187k★/32k forks (2025-07) |
| **AWS CAO** | Apache-2.0 | CLI supervisor-worker orchestrator | **CLOSEST pure orchestrator** | drives 8-9 coding CLIs; tmux/PTY isolation; MCP supervisor primitives (assign/handoff/swarm); CLI-first; 689★ (young, AWS) |
| Agent Squad | Apache-2.0 | Multi-agent **library** | Partial | supervisor + parallel; **NOT CLI-first** (import); moved AWS→2FastLabs; 7.6k★ |
| Strands Agents | Apache-2.0 | Multi-agent **SDK** | Partial | Swarms/Graphs, HITL interrupts, A2A; **SDK not CLI**; in prod inside AWS |
| OpenClaw | NOASSERTION⚠️ | Self-hosted personal assistant | Adjacent | Docker isolation, MCP, persistent memory; messaging-first (not coding); governance only via 3rd-party repos. ⚠️377k★/79k forks |
| OpenHands | MIT | (see Cat B) | Partial | Docker sandbox, supervisor-worker hub |

## Category D — Enterprise Agent Platforms
**Only ONE structural analog: Microsoft Agent Framework (OSS+self-host+multi-provider incl Ollama+MCP).** The rest are **closed SaaS applications one layer above a runtime** (CX/ITSM/RPA/search). **CLI-first = "No" for every product except MAF (partial).** "BYO-LLM" ≠ self-hostable; "Cloud-Prem" ≠ OSS.
- **MAF** — DIRECT. **Copilot Studio / Agentforce / ServiceNow / UiPath / Kore.ai / Glean / Sierra / Decagon** — ADJACENT (closed SaaS; UiPath + Glean most runtime-adjacent). 
- **M&A consolidation (2025-26 = the dominant dynamic):** Moveworks→ServiceNow ($2.85B, closed Dec-2025); Cognigy→NICE ($955M, closed Sep-2025); Aisera→Automation Anywhere (Nov-2025, amount undisclosed — the "$1.5B" was unconfirmed). *[valuations: Glean $7.2B, Sierra $15.8B, Decagon $4.5B — all [spec], single/multi-source]*

## Category E — Workflow / Automation
n8n (fair-code self-hostable, MCP, $2.5B val), Zapier Agents (closed, 8k apps), Make (closed, "agentic OS" *marketing*), Workato (closed, real Agent Orchestrator + Enterprise MCP), Tray.ai (closed, Merlin + govern-MCP), Retool Agents (built on Temporal). **Infra:** Temporal (durable-exec MIT — the durability layer *under* agent stacks; Retool built on it), Airflow (DAG, Apache). **None CLI-first.** n8n = only self-hostable-with-real-distribution.

## Category F — Agentic OS / Control Plane (DISCOVERY)
**A true "self-hosted, MCP-native, CLI-first agentic OS" as a single product does NOT yet exist.** The space is real, well-funded, but **fragmenting into 4 buckets:**
- **(a) Observability/governance overlays** (crowded): Langfuse (MIT self-host; *[rep]* ClickHouse acq Jan-2026), Arize Phoenix, AgentOps, **Galileo Agent Control** (Apache-2.0 control plane, Mar-2026 — closest pure governance-plane).
- **(b) Sandbox/runtime infra** (real, funded): **E2B** (firecracker microVMs, $21M), **Daytona** ($24M Series A Feb-2026). = Deckent's "runtime isolation" as a standalone category.
- **(c) MCP gateways** (commoditizing): Docker MCP Gateway/Catalog, agentgateway (Solo.io→CNCF).
- **(d) Genuine multi-agent control planes** (contested center, each coupled to something): **kagent** (CNCF, k8s-bound — strongest self-host+MCP+governance, but Kubernetes-coupled), **LangGraph Platform** (most complete, SaaS/managed), **Letta** (best memory, Apache-2.0 self-host server), **Cloudflare Agents** (elegant, cloud-locked — anti-air-gap), Inngest AgentKit (durable, TS-SDK), Portia (governance-focus, SDK).

**Whitespace verdict:** No bucket-(d) player is **CLI-first + standalone-self-hosted + MCP-native + multi-provider + durable + multi-agent + governance simultaneously.** kagent is k8s-bound; LangGraph is SaaS-centric; Cloudflare is cloud-locked. **That exact combination is the genuinely open whitespace — and it is precisely Deckent's positioning.** (Caveat: Hermes Agent + CAO already occupy much of the CLI-first + self-host + parallel slice.)

---

# PART 3 — Deckent Codebase Deep Analysis (code ground-truth)

| Dimension | Rating | Evidence |
|---|---|---|
| Sprint orchestration lifecycle | **WIRED-WORKING** | PLAN→…→CLEANUP fully wired; memory write-back + outcome-tracking + rule-evolution + promotion run every sprint |
| Memory + learning | **WIRED-WORKING** ⭐ | MemoryStore SQLite FTS5 dual-i18n; OutcomeTracker/RuleEvolver/PromotionPipeline called in sprint-finalizer; planner reads worst-combos. Best dimension. |
| MCP **server** (32 tools/8 res) | **WIRED-WORKING** ⭐ | primary integration surface, mature, stdio |
| Multi-provider | **WIRED-WORKING (Claude+Ollama proven)** | OllamaAdapter→agentic-worker-entry real tool-loop; isAdapterProvider routing; Codex/Gemini WIRED-UNPROVEN |
| Runtime isolation | **WIRED-WORKING (Docker only)** | per-worker container fs+mem limits, **no network isolation/cap-drop/seccomp**; tmux/subprocess=zero; sandbox-flag=git-stash; no worktree |
| CLI experience | **WIRED-WORKING** ⭐ | 49+ commands, CLI-first thesis |
| Self-hosting/deploy | **WIRED-WORKING (single-process)** | `deckent serve` HTTP+SSE+WS+REST; Dockerfile/compose; **no k8s/queue; npm UNPUBLISHED** |
| Observability | **WIRED-WORKING (bespoke)** | event-stream JSONL→dashboard SSE; Auditor 30s; HMAC audit chain (PTY only); **no OTel/Prometheus** |
| Plugin system | **WIRED (install/scan); hook-invocation NOT wired** | install/scan/sign real; hook `import()` never called in sprint path |
| Human-in-the-loop | WIRED (checkpoints/approval-adapter robust) | approval-adapter no-auto-approve; some surfaces shallow |
| **MCP client broker** | **SCAFFOLDED-NOT-WIRED** | buildMcpBridge 0 production callers; REPL can't reach external MCP servers |
| **Marketplace** | **SCAFFOLDED-NOT-WIRED** | RegistryClient real; `registry.deckent.dev` does NOT resolve |
| **Process mode / scheduled-flow** | **SCAFFOLDED-NOT-WIRED** | FlowRuntime tick prints "N dispatched" but never starts a sprint; self-dispatch enqueues, nothing drains |
| Enterprise governance / RBAC | **SCAFFOLDED (advisory-only)** | checkWorkerAuthority always returns true; ADR-037 V1.0 soft; enforceRbac NO_OP default |
| Multi-tenancy | **SCAFFOLDED (schema-only)** | tenantId:'local' hardcoded ~6 sites |
| Enterprise dashboard | **HOLLOW** | EnterprisePage calls /api/enterprise/* routes absent in server.ts |
| ERP / process domain | **ABSENT** | no ProcessDefinition/ConnectorSpec/Capability-Broker (F8) |

**NOTE — autonomous execution:** the *kind=task* autonomous path IS proven (last session: qwen3.6 host-side authored a real doc, zero-cost). What's dead is the **scheduled-flow→sprint bridge** + ExecutionPool-wrapping. So "autonomous backlog execution" works manually-triggered; "scheduled/recurring autonomous" does not.

**TRUE maturity: Alpha → approaching Beta for the core sprint-orchestration surface.** Core (orchestration + memory/learning + MCP-server + multi-provider Claude/Ollama + CLI) is real and works. The platform/enterprise/OS layer (process-mode, multi-tenancy, marketplace, MCP-client, enterprise-dashboard, ERP) is unbuilt or hollow.

---

# PART 4 + 9 — Parallel Orchestration Analysis (architecture-ranked, stars down-weighted)
| Product | OSS | Parallel | Supervisor-Worker | Runtime Isolation | MCP | CLI-first | Autonomous loops | Memory | Learning | Governance | Enterprise | Multi-provider | Sim% | Cur/Fut Threat |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Deckent** | MIT | Yes (waves) | Yes (Brain/Auditor/Worker) | Partial (Docker fs/mem) | Server-yes/client-no | **Yes** | Yes (kind=task proven) | **Yes (FTS5)** | **Yes (evolve/promote)** | Advisory | Partial(hollow) | Yes (Claude+Ollama) | — | — |
| **Hermes Agent** | MIT | Yes (≤30) | Yes (orchestrator role) | **Yes (6 backends)** | Yes | **Yes** | Yes | Yes (FTS5) | **Yes (skill-gen)** | No | No | Yes (200+) | **~72%** | Med / High |
| **AWS CAO** | Apache | Yes (assign/swarm) | **Yes (explicit)** | Yes (tmux/PTY) | Yes (primitives) | **Yes** | Partial | No | No | Partial(HITL) | No | Yes (8-9 CLIs) | **~63%** | Med / High |
| OpenHands | MIT | Yes | Yes (hub) | **Yes (Docker default)** | ? | Partial | Yes | Partial | No | Partial | Partial | Yes | ~48% | Low / Med |
| OpenClaw | NOASSERTION⚠️ | Partial | No (core) | Yes (Docker) | Yes | Partial | Yes (24/7) | Yes | Partial | No (core) | No (core) | Yes | ~45% | Low / Med |
| Strands | Apache | Yes | Yes (agents-as-tools) | No (SDK) | Partial | **No** | Yes | Partial | No | Yes (HITL) | Partial | Yes | ~33% | Low / Med |
| Agent Squad | Apache | Yes | Yes | No | No | **No** | Partial | Partial | No | No | No | Yes | ~28% | Low / Low |

**Read:** On *architecture*, **Hermes Agent is the single closest analog** (CLI-first + parallel + isolation + memory + **learning** + multi-provider + MCP — it even shares the "memory + self-improvement" thesis that's Deckent's claimed moat). **CAO is the closest pure CLI supervisor-worker orchestrator.** Both are real, OSS, and recent. The star magnitudes (Hermes 187k, OpenClaw 377k) are flagged-anomalous and NOT used for ranking; forks (32k/79k) confirm they're real projects.

---

# PART 5-6 — Deckent Scoring (code ground-truth, 0-10) + Overall
| # | Dimension | Score | Why |
|---|---|---|---|
| 1 | Agent Orchestration | 8 | Full sprint lifecycle wired & working |
| 2 | Multi-Agent Coordination | 7 | Parallel waves + supervisor; but autonomous=generic (no agent/skill inject) |
| 3 | Runtime Engine | 7 | Real EXECUTE/EVALUATE/FIX |
| 4 | Runtime Isolation | 6 | Docker fs/mem only; no network/seccomp; no worktree |
| 5 | MCP Support | 8 | Server mature (32 tools); client dead |
| 6 | Multi-Provider | 8 | Claude+Ollama proven, Codex/Gemini wired, OpenAI-compat |
| 7 | CLI Experience | 9 | 49+ cmds, genuine CLI-first (rare) |
| 8 | Enterprise Governance | 3 | RBAC advisory-only, enforceRbac NO_OP |
| 9 | Security | 4 | API token solid; sandbox=git-stash; no network isolation |
| 10 | Memory System | 9 | SQLite FTS5 + learning loop wired (best) |
| 11 | Human-in-the-loop | 6 | Checkpoints + approval-adapter robust |
| 12 | Workflow Automation | 5 | Sprint=workflow; flow-registry scaffolded |
| 13 | Process Automation | 2 | Scheduled-flow→sprint bridge dead |
| 14 | Marketplace | 2 | Client only, no backend |
| 15 | Extensibility | 6 | Agents/skills/plugins install+scan (hooks not wired); MIT |
| 16 | Self-hosting | 8 | Fully self-hostable; air-gapped-ish; NOT published |
| 17 | Multi-tenancy | 2 | tenantId:'local' hardcoded |
| 18 | Observability | 6 | Bespoke event-stream+dashboard+auditor; no OTel |
| 19 | ERP Integration Potential | 3 | Vision only; no connector/capability-broker |
| 20 | Product Maturity | 4 | Alpha→beta core; many hollow surfaces; unpublished |
| 21 | Ecosystem Strength | 2 | Single-project, no community/adoption/marketplace |
| 22 | Strategic Moat | 5 | CLI-first+self-host+MCP+multi-provider+memory-learning combo is rare — but Hermes/CAO contest it |

**Deckent Overall ≈ 55/100** (raw 120/220). Wide variance is the story: **world-class on memory/learning + CLI-first + multi-provider-incl-local; near-zero on process/marketplace/multi-tenancy/ecosystem.** A spiky alpha, not a rounded platform.

---

# PART 7 — Global Agent Market Map
```
AGENTIC-OS LAYER (aspirational; no complete product yet)
   [whitespace: CLI-first + self-host + MCP + multi-provider + durable + governance]
   ← Deckent AIMS here · kagent(k8s) · LangGraph-Platform(SaaS) · Cloudflare(cloud-lock)

CONTROL-PLANE LAYER (govern/observe/route)
   Galileo · Langfuse · Arize · AgentOps · Workato-Orchestrator · UiPath-Maestro
   MCP gateways: Docker-MCP · agentgateway(CNCF)

ORCHESTRATION LAYER (run/coordinate multi-agent)
   ★ Deckent (TODAY) · Hermes · AWS-CAO · OpenHands · Agent-Squad · Strands
   · CrewAI · Agno-AgentOS · LangGraph · MAF · Letta · Inngest

RUNTIME / ISOLATION LAYER (durable exec + sandbox)
   Temporal · E2B · Daytona · Airflow · Cloudflare-DO

FRAMEWORK / SDK LAYER (build agents)
   LangGraph · CrewAI · AutoGen/AG2 · OpenAI-SDK · Claude-SDK · ADK · MAF · Pydantic-AI · LlamaIndex · Mastra · Agno

CODING-AGENT LAYER (vertical)
   Claude-Code · Codex-CLI · Cursor · Devin · OpenHands · Aider · Amp · Windsurf · OpenCode

APPLICATION LAYER (closed enterprise SaaS)
   Copilot-Studio · Agentforce · ServiceNow · Glean · Sierra · Decagon · Kore.ai
```
**Deckent sits in ORCHESTRATION today, reaching UP toward AGENTIC-OS.** Its differentiator is spanning ORCHESTRATION + RUNTIME-isolation + a memory/learning layer few others integrate.

---

# PART 8 — Competitor Shortlist
| Product | Company | Category | OSS | Core Use | Directness | Sim% |
|---|---|---|---|---|---|---|
| Hermes Agent | Nous Research | CLI parallel agent | MIT | Personal/dev agent that learns | **Direct** | ~72 |
| AWS CAO | AWS Labs | CLI orchestrator | Apache | Coordinate coding CLIs | **Direct** | ~63 |
| Microsoft Agent Framework | Microsoft | Framework/runtime | MIT | Build+orchestrate agents (self-host) | **Direct** | ~45 |
| OpenHands | All Hands AI | Autonomous SWE | MIT | Autonomous dev agents | Partial | ~48 |
| Claude Agent SDK | Anthropic | SDK+CLI | MIT* | Build Claude agents | Strategic | ~45 |
| OpenClaw | OpenClaw | Self-host assistant | NOASSERT⚠️ | Personal AI on messaging | Adjacent | ~45 |
| kagent | CNCF/Solo.io | k8s agent runtime | OSS | Run agents on k8s | Adjacent/Future | ~40 |
| Google ADK | Google | Framework+CLI | Apache | Enterprise multi-agent | Future/Strategic | ~38 |
| Strands | AWS | SDK | Apache | Build agents | Partial | ~33 |
| Letta | Letta Inc | Agent server | Apache | Stateful memory agents | Adjacent | ~30 |
| LangGraph(+Platform) | LangChain | Framework/CP | MIT | Durable agent graphs | Partial/Future | ~35 |
| CrewAI | CrewAI | Framework | MIT | Role-based crews | Partial | ~30 |
| Agno | Agno | Framework+runtime | MPL* | High-perf multi-agent | Partial | ~30 |
| n8n | n8n GmbH | Workflow | fair-code | Self-host automation+agents | Adjacent | ~25 |
| Devin | Cognition | Autonomous SWE | closed | Autonomous SWE (enterprise) | Adjacent | ~22 |

---

# PART 10 — Deep Benchmark (Overall/100 = vendor-claim basis for competitors ⚠️; Deckent = code-honest)
| Product | Overall/100 | Sim% | Current Threat | Future Threat |
|---|---|---|---|---|
| **Deckent** | **55** (code-honest) | — | — | — |
| Hermes Agent | ~62⚠️ | 72 | Medium | High |
| AWS CAO | ~58⚠️ | 63 | Medium | High |
| Microsoft Agent Framework | ~78⚠️ | 45 | Medium | Strategic |
| OpenHands | ~66⚠️ | 48 | Low | Medium |
| Claude Agent SDK | ~74⚠️ | 45 | Medium | Strategic |
| Google ADK | ~80⚠️ | 38 | Low | Strategic |
| LangGraph(+Platform) | ~82⚠️ | 35 | Low | High |
| CrewAI | ~70⚠️ | 30 | Low | Medium |
| Agno | ~64⚠️ | 30 | Low | Medium |
| Letta | ~58⚠️ | 30 | Low | Medium |
| Strands | ~62⚠️ | 33 | Low | Medium |
| Agent Squad | ~50⚠️ | 28 | Low | Low |
| Semantic Kernel(legacy) | — | — | None | None |
| AutoGen(legacy)/AG2 | ~55⚠️ | 25 | None | Low |
| OpenAI Agents SDK | ~76⚠️ | 28 | Low | Strategic |
| Mastra | ~66⚠️ | 25 | Low | Medium |
| Pydantic AI | ~64⚠️ | 22 | Low | Low |
| Claude Code | ~82⚠️ | 30 | Medium | Strategic |
| Codex CLI | ~75⚠️ | 28 | Low | High |
| Cursor | ~85⚠️ | 18 | Low | Medium |
| Devin | ~80⚠️ | 22 | Low | Medium |
| Salesforce Agentforce | ~80⚠️ | 12 | None | Low |
| ServiceNow AI Agents | ~80⚠️ | 12 | None | Low |
| UiPath Agentic | ~76⚠️ | 18 | None | Medium |
| Glean | ~78⚠️ | 12 | None | Low |
| Moveworks(→ServiceNow) | — | — | None | None |
| n8n | ~74⚠️ | 25 | Low | Medium |
| Zapier Agents | ~70⚠️ | 12 | None | Low |
| Temporal | ~78⚠️ | 15 | None | Medium (as infra) |
| kagent | ~60⚠️ | 40 | Low | High |

---

# PART 11 — Deckent Positioning (is vs vision — supports the roadmap)
- **Primary (what it IS today, code-confirmed):** **Agent Orchestrator** — a CLI-first, self-hosted, MCP-native, multi-provider multi-agent orchestration runtime with an evolutionary memory/learning layer.
- **Secondary (aspiring, partially built):** **Self-hosted Agent Control Plane** — governance/audit/observability exist but are advisory/bespoke; needs hard-RBAC + multi-tenant + audit-lineage.
- **Tertiary (vision, unbuilt):** **Agentic OS** — process-mode, ERP/connector capability-broker, multi-tenancy are absent. This is the destination, not the current state.

**The honest finding SUPPORTS the agentic-OS roadmap:** the core orchestrator is real and works; the OS layer is the build-ahead. Calling it "Agentic OS" in market *today* would run ahead of the code (credibility risk). "Orchestrator now → Control-Plane → OS" is the defensible arc.

---

# PART 12 — SWOT
**Strengths — Implemented:** sprint-orchestration lifecycle; Memory V2 (FTS5 i18n) + learning loop (evolve/promote) actually wired; MCP server (32 tools); CLI-first (49+ cmds); multi-provider Claude+Ollama proven (incl zero-cost local). **Architectural:** clean Brain/Auditor/Worker separation; provider-adapter abstraction; ADR-governed; self-hostable + air-gapped-capable. **Strategic:** MIT; data-sovereignty/local-first posture; the rare CLI-first+self-host+memory-learning combination.

**Weaknesses — Tech debt:** MCP-client dead; autonomous=generic (no agent/skill); 5 incompatible TaskType enums; EffectClass not wired to policy-gate; no canonical ExecutionRequest. **Product debt:** marketplace backend absent; enterprise dashboard hollow; process-mode/scheduled-flow bridge dead; plugin hooks not invoked. **Enterprise gaps:** RBAC advisory-only; multi-tenancy schema-only; no audit-lineage; no OTel; no ERP/connector. **GTM risk:** NOT published to npm; zero community/ecosystem/adoption; single-maintainer; no benchmarks; competing in a crowded, hype-inflated category.

**Opportunities:** local-first/air-gapped enterprise (Ollama+offline); KVKK/EU data-sovereignty; the CLI-first self-host control-plane whitespace; agent governance+audit for self-hosted; evolutionary-memory as a defensible moat (absent across Cat A).

**Threats:** Anthropic (Claude Agent SDK + Claude Code subagents could absorb CLI-first orchestration); Microsoft (MAF = structural OSS rival); Amazon (CAO+Strands+Squad — already nearest CLI orchestrator); Google (ADK CLI-forward+enterprise); category consolidation/M&A; Hermes/CAO occupying the same architectural niche faster.

---

# PART 13 — Top 15 Closest Competitors
1. **Hermes Agent ~72%** — same shape (CLI+parallel+isolation+memory+learning+multi-provider+MCP). *Wins:* feature-completeness, 6 isolation backends, visibility. *Deckent wins:* opinionated Brain/Auditor governance + sprint contract + ADR-governance + enterprise intent. *Threat: Med/High.*
2. **AWS CAO ~63%** — CLI supervisor-worker, tmux isolation, MCP primitives. *Wins:* AWS backing, drives many CLIs cleanly. *Deckent wins:* memory/learning, evaluation/FIX loop, self-host control-plane depth. *Med/High.*
3. **OpenHands ~48%** — OSS, Docker sandbox, parallel. *Wins:* sandbox-default, adoption (76k★), research cred. *Deckent wins:* CLI-first orchestration breadth, memory-learning. *Low/Med.*
4. **MAF ~45%** — OSS self-host multi-provider MCP. *Wins:* Microsoft, enterprise governance, A2A, ecosystem. *Deckent wins:* CLI-first, opinionated loop, local-first. *Med/Strategic.*
5. **Claude Agent SDK ~45%** — CLI+subagents+MCP. *Wins:* Anthropic, model quality, adoption. *Deckent wins:* multi-provider, self-host, memory-learning. *Med/Strategic.*
6. **OpenClaw ~45%** — self-host, Docker, memory, MCP. *Wins:* messaging-channel breadth, viral. *Deckent wins:* coding/dev orchestration, governance, evaluation. *Low/Med.*
7. **kagent ~40%** — OSS self-host MCP governance. *Wins:* CNCF, k8s-scale, multi-tenant. *Deckent wins:* CLI-first standalone (no k8s), memory-learning. *Low/High.*
8. **ADK ~38%** — CLI-forward, enterprise. *Wins:* Google, 200+ models, Vertex. *Deckent wins:* self-host/local-first, no-cloud-lock. *Low/Strategic.*
9. **LangGraph ~35%** — durable graphs. *Wins:* adoption, durability, Platform. *Deckent wins:* CLI-first, self-host-simplicity, opinionation. *Low/High.*
10. **Strands ~33%** — multi-agent SDK. *Wins:* AWS prod use. *Deckent wins:* CLI-first, memory. *Low/Med.*
11. **CrewAI ~30%** — crews. *Wins:* adoption, ent customers. *Deckent wins:* CLI-first, self-host, memory-learning. *Low/Med.*
12. **Agno ~30%** — runtime+RBAC. *Wins:* perf, AgentOS RBAC. *Deckent wins:* CLI-first, learning. *Low/Med.*
13. **Letta ~30%** — memory server. *Wins:* best-in-class memory, funded. *Deckent wins:* orchestration breadth, CLI. *Low/Med.*
14. **n8n ~25%** — self-host automation. *Wins:* huge adoption, MCP, visual. *Deckent wins:* code/agent-native, CLI. *Low/Med.*
15. **Devin ~22%** — autonomous SWE. *Wins:* SOC2/enterprise, autonomy quality, $. *Deckent wins:* OSS, self-host, multi-provider. *Low/Med.*

---

# PART 14 — Strategic Threats (could they destroy the category?)
- **Anthropic** — HIGH. Claude Agent SDK + Claude Code dynamic-workflows already do CLI-first parallel subagents. *Could destroy?* For the Claude-only slice, yes. *Protection:* multi-provider + self-host + local-Ollama + vendor-neutrality (Anthropic won't run your competitor's models air-gapped).
- **Microsoft** — HIGH/Strategic. MAF is the structural OSS rival; could add CLI + opinionated loop. *Protection:* simplicity/CLI-first, local-first, no-Azure-gravity, sovereignty.
- **Amazon** — HIGH. Already owns the nearest CLI orchestrator (CAO) + Strands + Squad. *Could destroy?* If AWS productizes CAO. *Protection:* self-host-anywhere (not AWS-coupled), memory-learning, sovereignty.
- **Google** — Medium/Strategic. ADK CLI-forward + Vertex. *Protection:* cloud-neutrality, local-first.
- **OpenAI** — Medium. Agents SDK (sandbox+long-horizon) + Codex. *Protection:* multi-provider, self-host.
- **GitHub/Atlassian** — Medium/Future. Could bolt orchestration onto Copilot/Actions / Rovo. *Protection:* runtime-neutral, self-host.
- **Salesforce/ServiceNow/UiPath** — Low (different layer); threat is *budget/narrative* capture + M&A roll-up, not architecture.

**What protects Deckent (the durable moat):** the *combination* — CLI-first + standalone-self-host + MCP-native + multi-provider-incl-local-Ollama + **evolutionary memory/learning** + opinionated governance loop + MIT + air-gapped/KVKK/EU-sovereignty. No single incumbent offers all of these (they're each coupled to a cloud, a model, or a layer). **But the moat is a combination, not a single unbreakable axis — and Hermes/CAO already contest the CLI-first+self-host+parallel part. The defensible core is the memory/learning + sovereignty + opinionated-governance triad.**

---

# PART 15 — Market White Space (research-confirmed)
- **Self-hosted Agent OS / CLI-first control plane** — OPEN (no complete product; kagent k8s-bound, LangGraph SaaS, Cloudflare cloud-locked). ✅ Deckent's lane.
- **MCP-native orchestration (standalone, not gateway)** — open; gateways commoditizing (Docker/CNCF) but orchestration+MCP+self-host together is rare.
- **Local-first / air-gapped enterprise AI** — strongly open; Ollama+offline+sovereignty is a real, underserved enterprise need (EU/KVKK/regulated). ✅ Deckent's strongest differentiated wedge.
- **Enterprise agent governance + audit (self-hosted)** — open (Galileo is cloud-leaning observability; hard-RBAC+audit-lineage self-host is unfilled).
- **Multi-provider routing** — partially filled (many BYO-LLM); local+subscription+API mixed-fleet is rarer.
- **Agent marketplaces** — open but unproven demand; not a near-term wedge.
- **ERP automation / agent teams** — large but requires the unbuilt connector/capability layer; long-horizon.

---

# PART 16 — VC Investment Committee
1. **Feature/product/platform/category?** A **product** today (working CLI-first orchestrator) with **platform** ambition (partially built) and a plausible **category** thesis (self-hosted agentic control plane). NOT yet a platform; NOT yet a category-definer.
2. **Architecture defensible?** Partially. The memory/learning + opinionated-governance + self-host/local combination is genuinely differentiated and absent in Cat A. But CLI-first+self-host+parallel is contested (Hermes/CAO), and the enterprise/OS layers are unbuilt. Moat = real but narrow + needs deepening.
3. **Timing?** Good — 2025-26 is the agentic-orchestration land-grab; MCP standardized; durable-execution is the frontier; sovereignty/local-first is rising. But crowded + hype-inflated (the anomalous-star repos signal froth).
4. **Next 6 months (must-do):** (a) **publish to npm** + prove the core dev loop with real external users; (b) **stop claiming hollow features** — close or delete MCP-client/marketplace/enterprise-dashboard claims; (c) **pick ONE wedge** — local-first/sovereignty dev-orchestration — and nail it; (d) ship canonical ExecutionRequest + provider-free + autonomous-agent-injection P0s; (e) seed a community (the ecosystem score is 2).
5. **Must avoid:** marketing "Agentic OS" before the core ships + before npm publish; building enterprise/multi-tenant/ERP before the developer-beta core has real users; spreading across all 22 dimensions instead of deepening the spiky strengths.
6. **Biggest strategic mistake possible:** going broad/enterprise/OS-narrative now → a "wide-but-hollow" product that competes head-on with Microsoft/AWS/Anthropic on their turf, with no community, unpublished, while the genuine wedge (local-first sovereign orchestration with evolutionary memory) goes unclaimed.
7. **Highest-value positioning:** *"The self-hosted, CLI-first, multi-provider agent-orchestration runtime with evolutionary memory — air-gapped & sovereignty-ready."* Developers + privacy/regulated enterprises. Own local-first + sovereignty + memory-learning; let the cloud giants fight over cloud-coupled agents.

---

# PART 17 — Final Scorecard (/100, explained)
| Axis | Score | Reasoning |
|---|---|---|
| Product Strength | **52** | Core orchestration+memory+MCP-server work; but hollow surfaces + unpublished drag hard |
| Architecture Strength | **70** | Clean separation, provider abstraction, memory-learning, ADR-governance — genuinely good design; isolation/multi-tenant weak |
| Enterprise Readiness | **30** | RBAC advisory, multi-tenant schema-only, dashboard hollow, no audit-lineage/OTel |
| Developer Adoption Potential | **58** | CLI-first + self-host + local-Ollama is attractive to a real dev segment; but unpublished + no community + crowded |
| Market Opportunity | **75** | Agentic orchestration + sovereignty/local-first is a large, rising market |
| Strategic Defensibility | **48** | Memory-learning + combination moat is real but narrow; contested by Hermes/CAO; incumbents looming |
| Ecosystem Potential | **35** | MIT + MCP-native composes well; but zero current ecosystem, dead marketplace |
| Category Creation Potential | **55** | The "self-host CLI agentic control plane" category is genuinely open — but creating a category solo, unpublished, vs giants is hard |
| 3-Year Upside | **62** | If it nails local-first/sovereignty wedge + community + closes core debt → meaningful; capped by execution capacity + competition |
| Execution Risk | **72** (high risk) | Single-maintainer, broad scope vs narrow resources, hollow-claim pattern, unpublished, crowded category — execution is the dominant risk |

---

# PART 18 — Final Verdict (brutally honest CTO + VC)

**FACTS (code/API-verified):** Deckent is a real, MIT, self-hosted, CLI-first multi-agent orchestrator whose core sprint lifecycle + SQLite-FTS5 memory-with-learning-loop + 32-tool MCP server + Claude/Ollama multi-provider execution genuinely work. It is **alpha approaching beta on that core.** Process-mode, marketplace, MCP-client, enterprise-dashboard, multi-tenancy, hard-RBAC, ERP are absent or scaffolded-not-wired. It is **not published to npm** and has no measurable community/ecosystem. Its closest architectural analogs (Hermes Agent, AWS CAO) are real, OSS, recent, and occupy much of the same CLI-first+self-host+parallel niche. The only true enterprise-platform structural rival (Microsoft Agent Framework) is OSS + self-host + multi-provider too.

**ASSUMPTIONS (reasoned, not certain):** the memory/learning evolutionary layer is Deckent's most defensible differentiator (it's absent across the entire framework category). Local-first/air-gapped/sovereignty is a real, underserved, rising enterprise need where Deckent is ~80% positioned. The category timing is good. CLI-first is a genuine, rare differentiator.

**SPECULATION (low-confidence):** competitor valuations/ARR (Cursor ~$50B-talks, Devin ~$26B, Sierra $15.8B) and the anomalous star counts (Hermes 187k, OpenClaw 377k) — directionally indicate froth and crowding, but specific figures are single-source/unverified. Whether the "self-host agentic OS" category materializes as a distinct market (vs being absorbed by incumbents) is unknowable.

**Would I build, fund, acquire, partner with, or ignore Deckent?**
- **Build:** No — it's already built; rebuilding wastes the real asset.
- **Acquire:** Only as an **acqui-hire / tech-tuck** by an incumbent (AWS/Microsoft) wanting a CLI-first self-host orchestration + memory-learning layer. Not a standalone acquisition target yet.
- **Partner:** **Yes** — MCP-native means it composes cleanly; natural partner for sandbox infra (E2B/Daytona), MCP gateways, and sovereignty/regulated-market integrators.
- **Fund:** **Yes — at seed, conditionally.** A credible seed bet on (team + the local-first/sovereignty + memory-learning thesis), **conditional on:** (1) publish + real external users, (2) kill or finish hollow features, (3) pick the local-first/sovereignty wedge and dominate it, (4) seed a community. **NOT** at a platform/enterprise valuation — the enterprise/OS story is unbuilt and the execution risk is high.
- **Ignore:** **No — but watch.** The category is contested and froth-y; Deckent's edge is real but narrow and time-sensitive. It earns attention, not complacency.

**One-line verdict:** *A genuinely well-architected, spiky alpha with a rare and defensible combination (CLI-first + self-host + multi-provider-local + evolutionary memory) — currently undermined by hollow surfaces, no distribution, and a crowded field. Fundable at seed IF it publishes, focuses on the local-first/sovereignty wedge, and tells the truth about what's built. The biggest risk is not the competition — it's diffusing into an "Agentic OS" narrative before shipping the orchestrator that already works.*

---

## Sources & confidence
Market data: 4 parallel WebSearch research passes (Cat A / B+C / D / E+F), 2025-2026 public sources; GitHub API direct verification of anomalous repos (Hermes/OpenClaw/OpenCode confirmed real, stars flagged-anomalous). Deckent: code ground-truth (5-investigator + supplemental pass, file:line). Competitor scores = vendor-claim basis (⚠️ flagged); Deckent score = code-honest (asymmetry surfaced §top). Valuations/ARR = [spec] single/multi-source. Cross-reference: `2026-06-08-merged-product-flow-analysis.md` (71/52 product-flow beta verdict — consistent with this 55/100 22-dim).
</content>
