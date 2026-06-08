# DEVAM PROMPTU — Sonraki Oturum Brief'i (2026-06-08 kapanış)

> Bir sonraki oturumun başında bunu oku. Sıra: (1) codex competitive-analysis değerlendirme+doğrulama → (2) kapsamlı adım-adım implementation → (3) pozisyon revizyonu (Alperen ile birlikte).

---

## A. Mevcut Durum (snapshot)
- **Autonomous-ollama:** KAPALI, main'de (`a58d86bf`), Phase-1+1c. Local-model autonomous canlı kanıtlandı (qwen3.6 zero-cost).
- **Birleşik ürün-akışı analizi BİTTİ:** `docs/alperen-analysis/2026-06-08-merged-product-flow-analysis.md` (LOCAL). Kaynaklar: alperen CLI/MCP RCA + local-model RCA (`docs/analysis/2026-06-08-local-model-autonomous-rca.md`, tracked) + bağımsız 5-investigator kod-doğrulamalı pas + 5 P0 doğrudan spot-check.
- **Çift-beta verdict:** developer/dogfood ~71/100 · enterprise-facing ~52/100. İki yeni eksen: hollow-surface vs missing-contract, wired vs proven.
- **Git:** main temiz+push'lu. Strateji dokümanları (`docs/alperen-analysis/`, MASTER-PLAN, blueprint) bilinçli LOCAL/gitignored.
- **Hafıza:** `project_merged_product_flow_analysis`, `project_autonomous_engine_direction`, `project_autonomous_ollama_execution_gap` (CLOSED) güncel.

---

## B. SIRADAKİ İŞ 1 — Codex Competitive-Analysis Değerlendirme + Bağımsız Doğrulama

**Bağlam:** Alperen codex ile global rekabet analizi yaptırdı (aşağıdaki prompt). Görev: **(a) codex çıktısını değerlendir** (doğruluk, eksik, bias, deckent iddialarının kod-gerçekliğiyle uyumu), **(b) Claude olarak bağımsız kontrol et** (özellikle codex'in deckent'e dair iddialarını gerçek repo koduyla doğrula — proof-of-function kültürü; pazar/rakip iddialarını WebSearch ile teyit et), **(c) iki değerlendirmeyi sentezle** → birleşik competitive-analysis kararı.

**ÖNCE YAP:** Codex çıktı dosyasını bul (Alperen'e sor ya da repo'da ara — muhtemel `docs/alperen-analysis/` veya kök'te). Çıktı yoksa Alperen'den iste.

**Doğrulama disiplini (bu projede zorunlu):**
- Codex'in **deckent hakkındaki her iddiasını** gerçek koddan `file:line` ile doğrula — README/marketing değil. (Merged-doc'taki kod-doğrulamalı bulgular referans: 5-enum TaskType, autonomous=always-generic, EffectClass wire-gap, enterprise-dashboard hollow, multi-tenant schema-only, RBAC advisory, npm-unpublished vb.)
- Codex'in **rakip/pazar iddialarını** WebSearch ile teyit et (güncel, 2026; codex'in training-cutoff'u yanlış olabilir).
- Şişirme/bias yakala: deckent'i olduğundan güçlü/zayıf gösteren iddiaları işaretle. Skorları merged-doc'un çift-beta verdict'iyle (71/52) tutarlılık açısından çapraz-kontrol et.
- Önceki oturumda **bir investigator hatası yakalanmıştı** ("getEffectClass yok" → aslında `rubric-registry.ts:375`'te VAR ama wire değil). Aynı titizlik: güven ama doğrula.

**Çıktı:** `docs/alperen-analysis/2026-06-08-competitive-analysis-review.md` (LOCAL) — codex-değerlendirme + Claude-bağımsız-bulgular + düzeltmeler + birleşik konumlandırma görüşü. Pozisyon revizyonuna (İş 3) girdi olur.

### Codex'e verilen prompt (verbatim — değerlendirme/yeniden-koşum için):
<details><summary>Tam prompt (18 part: global market research → competitive scoring → SWOT → strategic threats → VC verdict)</summary>

You are a Principal Software Architect, CTO, AI Platform Analyst, Venture Capital Technical Partner, and Agentic Systems Researcher. Mission: COMPLETE global competitive analysis of Deckent.

ÖNCE: repo'yu incele, deckent olduğunu doğrula (deckent/deckent-mcp/sprint-controller/autonomous-runtime/authority-enforcer/nervous/memory-store/worker-backend/provider-registry/MCP-server → "Repository identified as Deckent"). Deckent'i kendisiyle KARŞILAŞTIRMA; analiz öznesi olarak ele al.

- **PART 1 — Global Market Research** (güncel public bilgi). Kategoriler: **A Agent Frameworks** (LangGraph, CrewAI, AutoGen/AG2, OpenAI Agents SDK, Claude Agent SDK, Google ADK, Semantic Kernel, Pydantic AI, LlamaIndex Agents, Mastra, Agno) · **B Coding Agents** (Claude Code, Codex CLI, Cursor, Devin, OpenHands, Aider, Continue, Sourcegraph Amp, Windsurf, OpenCode) · **C Parallel Orchestration** (Hermes Agent/Nous, AWS CLI Agent Orchestrator/CAO, Agent Squad, Strands Agents, OpenClaw, OpenHands) · **D Enterprise Agent Platforms** (Microsoft Agent Framework, Copilot Studio, Salesforce Agentforce, ServiceNow AI Agents, UiPath Agentic Automation, Kore.ai, Moveworks, Glean, Aisera, Cognigy, Sierra, Decagon) · **E Workflow/Automation** (n8n, Zapier Agents, Make, Temporal, Airflow, Retool Agents, Workato, Tray.ai) · **F Agentic OS/Control Plane** (Agentic OS, Agent Runtime Platform, Agent Control Plane, Agent Governance Platform, Agent Orchestration Runtime, Multi-Agent OS, Enterprise Agent Control Plane, Self-hosted Agent Platform, MCP Orchestration Platform — listede olmayan ürünleri bul).
- **PART 2 — Classify Competitors:** her ürün için tip (Framework/Runtime/SDK/Coding Agent/Multi-Agent Platform/Orchestrator/Workflow Engine/Agentic OS/Enterprise Platform/Control Plane) + competition (direct/partial/adjacent/future/strategic-threat/not).
- **PART 3 — Deckent Codebase Deep Analysis** (README marketing yok, kaynak kod): CLI · MCP server · MCP client · provider abstraction · routing · orchestration · sprint/task/process mode · autonomous runtime · worker lifecycle · runtime isolation · memory · governance · RBAC · policy engine · dashboard/API · plugin · marketplace · observability · deployment · self-hosting · multi-tenancy · scaling · enterprise readiness.
- **PART 4 — Parallel Orchestration Analysis:** Deckent vs Hermes/CAO/Agent Squad/Strands/OpenClaw/OpenHands — 14 boyut (parallel exec, supervisor-worker, runtime isolation, MCP-native, CLI-first, long-running, autonomous loops, memory, learning, governance, enterprise, multi-provider, process automation, control-plane maturity).
- **PART 5 — Scoring (0-10, 22 kriter):** Agent Orchestration · Multi-Agent Coordination · Runtime Engine · Runtime Isolation · MCP · Multi-Provider · CLI · Enterprise Governance · Security · Memory · Human-in-loop · Workflow Automation · Process Automation · Marketplace · Extensibility · Self-hosting · Multi-tenancy · Observability · ERP Integration Potential · Product Maturity · Ecosystem · Strategic Moat.
- **PART 6 — Calculations:** her ürün Overall /100 · Similarity-to-Deckent % · Current Threat · Future Threat (None/Low/Medium/High/Strategic).
- **PART 7 — Global Market Map:** Framework/Runtime/Orchestration/Control-Plane/Agentic-OS katmanları; tüm rakipler + Deckent yerleştir.
- **PART 8 — Competitor Shortlist tablo:** Product/Company/Category/Open-Source/Core-Use-Case/Directness/Similarity.
- **PART 9 — Parallel Orchestration tablo:** Deckent+Hermes+CAO+Agent Squad+Strands+OpenClaw+OpenHands × (open-source/parallel/supervisor-worker/isolation/MCP/CLI-first/autonomous-loops/memory/governance/enterprise/similarity/current-threat/future-threat).
- **PART 10 — Deep Benchmark tablo (≥25 ürün):** Deckent+LangGraph+CrewAI+AutoGen+OpenAI Agents SDK+Claude Agent SDK+Semantic Kernel+Google ADK+Mastra+Agno+Hermes+CAO+Agent Squad+Strands+OpenClaw+OpenHands+Claude Code+Codex CLI+Cursor+Devin+MS Agent Framework+Agentforce+ServiceNow+UiPath+Glean+Moveworks+n8n+Zapier Agents+Temporal.
- **PART 11 — Positioning:** Deckent ne (Framework/SDK/Runtime/Coding Agent/Workflow Engine/Orchestrator/Agentic OS/Enterprise Platform/Control Plane) → Primary/Secondary/Tertiary.
- **PART 12 — SWOT:** Strengths (implemented/architectural/strategic ayır) · Weaknesses (tech-debt/product-debt/enterprise-gaps/GTM-risk ayır) · Opportunities · Threats.
- **PART 13 — Top 15 Closest Competitors:** her biri Similarity% / neden benzer / rakip nerede kazanır / Deckent nerede kazanır / current+future threat.
- **PART 14 — Strategic Threats:** Microsoft/Amazon/OpenAI/Anthropic/Google/Salesforce/ServiceNow/GitHub/Atlassian/UiPath — kategoriyi yok edebilirler mi, nasıl, Deckent'i ne korur.
- **PART 15 — Market White Space:** self-hosted Agent OS · MCP-native orchestration · enterprise agent governance · agent audit · multi-provider routing · agent teams · ERP automation · local-first enterprise AI · KVKK · EU sovereignty · agent marketplaces.
- **PART 16 — VC Investment Committee:** feature/product/platform/category? · mimari savunulabilir mi? · timing? · 6-ay must-do? · must-avoid? · en büyük stratejik hata? · en yüksek-değer konumlandırma?
- **PART 17 — Final Scorecard (/100 her biri):** Product Strength · Architecture · Enterprise Readiness · Developer Adoption · Market Opportunity · Strategic Defensibility · Ecosystem · Category Creation · 3-Year Upside · Execution Risk (her skoru açıkla).
- **PART 18 — Final Verdict:** acımasız dürüst CTO+VC görüşü (marketing/optimism yok); Facts/Assumptions/Speculation ayır; bitiş: "Would I build, fund, acquire, partner with, or ignore Deckent?" + neden.
</details>

---

## C. SIRADAKİ İŞ 2 — Kapsamlı Adım-Adım Implementation
Merged-doc §5 P0/P1/P2 sırasıyla. **P0:** (1) canonical `ExecutionRequest` (run/start/autonomous CLI+MCP tek-yol + MCP-run claude-hardcode kaldır + **autonomous=always-generic fix**); (2) `TaskType/EnvironmentType/RequirementProfile` SSOT + Task'a type-field + 5-enum reconcile; (3) EffectClass-G3 wire + flow-çift-blok fix + provider-free residual (CLAUDE_AUTH_REQUIRED guard + claudeArgs non-claude); (4) start parity-contract + dead-letter --auto-approve; (5) **npm publish gate**.
**Yöntem:** brainstorm→spec→writing-plans→subagent-driven-development (büyük P0'lar için); her user-surface task proof-of-function (gerçek-binary smoke).

---

## D. SIRADAKİ İŞ 3 — Pozisyon Revizyonu (Alperen ile BİRLİKTE)
Merged-doc + competitive-analysis-review girdileriyle → MASTER-PLAN §4I AS-8 + blueprint §23 revize. Tek-ürün/capability-bundle profiller (ADR-033 product-not-service). **Bu adım unilateral DEĞİL — Alperen ile.**

---

## E. Operating Constraints (her oturum)
- **Sprint-start = Alperen izni.** `deckent_kill`/`cleanup`/`rm .tasks/*` (canlı) YASAK. **`.brain/memory.db` ASLA silme.**
- Commit default (push değil); main'deyse branch'le. **god-level/i18n-first/no-tech-debt.**
- Sprint çalışırken build/`/login` YASAK; kod değişince "🔨 BUILD GEREKLİ" sinyali → Alperen build+`/mcp restart`.
- **Trust Brain eval, disk-verify ground-truth.** Güven ama doğrula (investigator iddialarını kritikse `file:line` spot-check).
</content>
