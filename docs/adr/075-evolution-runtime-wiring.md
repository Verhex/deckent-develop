# ADR-075: F5 Evolution Runtime Wiring + Routing Skill→Agent Affinity + Managed-Docs Code-Derived Counts

**Status:** accepted

**Date:** 2026-06-01

**Accepted:** Sprint 212

---

## Context

### Problem A — F5 Evolutionary Modules Had 0 External Callers (Wire-Gap)

Sprint 211 (ADR-074 Part C) wired `prompt-evolution.ts` and `adaptive-agent.ts` with entry-point scaffolding, but a post-sprint disk-verify revealed the wire-gap:

1. **`prompt-evolution.ts` `wirePromptEvolutionFromOutcomes`** — implemented and tested but had 0 external callers outside the def-file and test context. Sprint outcome patterns were not feeding prompt improvement suggestions at runtime.
2. **`adaptive-agent.ts` `adaptAgentRuntime`** — similarly 0 external callers; agent success rate changes never triggered skill add/remove suggestions at sprint boundary.
3. **Four dormant evolution modules** — `prompt-rollback.ts`, `agent-genealogy.ts`, `agent-retirement.ts`, `specialization-drift.ts` — all implement+tested but with 0 external callers. Feature-complete in `src/agents/` / `src/orchestra/` but never invoked at runtime.

Root cause: per-task scope splits placed module definition and the intended caller in separate tasks, and kanıt (proof) greps counted the def-file as evidence of wiring. This was the `[[feedback_directive_kanit_letter_vs_goal]]` class of error.

**Effect:** The evolutionary architecture — the core moat and differentiator — was dead code. The self-improvement loop was not running.

### Problem B — Agent Routing Skew (Skill→Agent Signal Missing)

Sprint 210–211 routing analysis revealed persistent skew: despite diverse skill routing (frontend-design, security-specialist, api-builder assigned correctly), agent selection collapsed to 12/16 `refactorer`. The activation engine scored domain match and keyword signals but had no skill→agent affinity signal — skills selected for a task did not influence the agent pool scores.

### Problem C — Managed-Docs Generator Used Hardcoded Module Counts

`content-generators.ts` architecture section generators emitted hardcoded counts: "core 90 modules, orchestra 76." Sprint 211 audit revealed the real numbers: `src/core/` = 111 `.ts` files, `src/orchestra/` = 88. The generator was producing stale documentation on every sprint finalization.

---

## Decision

### Part A — F5 Evolutionary Modules: Real Runtime Callers (Sprint 212 Tasks 1–6)

Six external callers were added across the sprint lifecycle — each caller is in a module distinct from the definition file:

1. **`sprint-reporter.ts` → `wirePromptEvolutionFromOutcomes`** (Task 212-001): RETRO/learnings phase calls `collectPromptEvolutionSuggestion()`, writes prompt improvement proposal under `## Prompt Evolution Suggestion` heading in retro output and memory.

2. **`outcome-tracker.ts` → `adaptAgentRuntime`** (Task 212-002): Sprint outcome recording calls `adaptAgentRuntime`; agent success rate triggers skill add/remove suggestions written to outcome metadata.

3. **`promotion-pipeline.ts` → agent-genealogy `recordLineage`** (Task 212-003): temp→permanent agent promotion writes lineage record (parent agent, mutation, sprint) to genealogy store.

4. **`promotion-pipeline.ts` → agent-retirement `retireAgent`** (Task 212-004): demotion/LRU-evict path calls `retireAgent` — low-success temp agents are formally retired with reason; high-success agents are preserved.

5. **`sprint-reporter.ts` → specialization-drift `detectDrift`** (Task 212-005): retro/performance section calls `detectDrift` — agent scope-creep (tasks assigned outside specialization) is detected and reported.

6. **`prompt-evolution.ts` → prompt-rollback `revertPrompt`** (Task 212-006): when an evolved prompt has lower performance than its predecessor, `revertPrompt` is called to recommend rollback to the prior version.

**Proof pattern (verified):** For each caller: `grep -rl "<function>" src/ | grep -v test | grep -v "<def-file>.ts"` returns ≥1 external file.

### Part B — Routing Skill→Agent Affinity Signal (Sprint 212 Task 8)

`activation-engine.ts` adds:

- `SKILL_AGENT_AFFINITY_BONUS = 3` (mirrors `DOMAIN_MATCH_BONUS` in `routing-engine.ts`)
- `SKILL_AGENT_MAP`: 15 skill→agent pairings covering frontend/security/api/doc/devops/data/perf/arch clusters (e.g. `frontend-design` / `react-specialist` → `frontend-designer`; `security-specialist` → `security-auditor`; `api-builder` skill → `api-builder` agent; `documentation-writer` → `doc-writer`)
- `getSkillAgentAffinityBonus(agentId, assignedSkills)`: pure function returns cumulative bonus for all matching skills

`refactorer` remains a valid candidate for all task types; the affinity signal prevents it from winning by default in specialized domains. A routing diversity guard test (`tests/core/routing-diversity-guard.test.ts`) asserts single-agent share ≤60% and ≥4 distinct agents across a representative 16-task mixed DNA set (Task 212-009).

### Part C — Managed-Docs Code-Derived Module Counts (Sprint 212 Task 10)

`content-generators.ts` adds:

- `countModules(dir: string): number` — uses `readdirSync` (Node.js built-in `node:fs`, no new runtime dep per ADR-010) to count `.ts` files in a directory at runtime
- `architecture-map` generator with TR/EN/DE/ES `patternsByLang` entries (ADR-032) — produces per-directory module count table from live disk state

The hardcoded counts are removed. Every sprint finalization regenerates the architecture section from the actual file tree. CLAUDE.md/DECKENT.md module counts are now always accurate after a managed-doc regen cycle.

---

## Consequences

**Positive:**
- F5 evolutionary architecture is now **live** — 6 previously dormant modules are called at runtime during the sprint lifecycle. The self-improvement loop (prompt evolution, adaptive agent tuning, agent genealogy, retirement, drift detection, rollback) runs on every sprint.
- Routing diversity is structurally protected — skill assignments feed agent scores, preventing specialization collapse to a single agent.
- Documentation module counts are self-correcting — no manual sync required when new modules are added.
- Sprint retro now contains a visible "Next Sprint Behavior Changes" section (Task 212-007 via `sprint-retro-writer.ts`) — users see concrete evidence of learning between sprints.

**Negative:**
- Six additional function calls in sprint-critical paths (reporter, outcome-tracker, promotion-pipeline) add latency on each sprint boundary. Expected impact: <10ms per call (all synchronous, no I/O); acceptable for sprint-boundary (not hot-path) operations.
- Evolution suggestions remain advisory (not auto-applied). Automation requires a human-review cycle before full autonomy.
- `countModules` adds one `readdirSync` per directory per sprint finalization — negligible for <200 modules but worth noting for very large monorepos.
- `SKILL_AGENT_MAP` is a static mapping. New custom agents/skills added by users are not automatically included; users must contribute entries or use the custom generator path (ADR-030).

---

## Alternatives Considered

- **Keep entry-point scaffolding, ship "wired" in next milestone** — the Sprint 211 state. Rejected: evolutionary architecture is the core differentiator; shipping it as dead code contradicts ADR-033 Product-Not-Service and the MASTER-PLAN §12 top risk.
- **Auto-apply evolution suggestions (no advisory phase)** — having `adaptAgentRuntime` directly mutate agent configs instead of suggesting. Rejected: unpredictable behavior in production without human validation cycle; V2 automation after V1 advisory proves signal quality.
- **Dynamic SKILL_AGENT_MAP from agent manifests** — loading affinity from `.deckent/agents/*/agent.json`. Rejected: adds I/O on every routing call; static map is sufficient for built-in agents; custom affinity is a post-V1 extension point.
- **LLM-based module count discovery** — using an AI call to derive counts. Rejected: circular dependency and unnecessary; `readdirSync` is accurate and zero-latency.

---

## References

- Sprint 212 — F5 evolution crowning + routing skew fix + doc-reality sync
- ADR-074: Native Chat Real Round-Trip + Enterprise RBAC/Audit/Rate + F5 Evolution Wire (Sprint 211 wire-gap diagnosis)
- ADR-041: Agent Taxonomy — Horizontal Skills vs Vertical Agents (skill/agent separation)
- ADR-029: Managed-Docs Universalization (content-generators.ts architecture)
- ADR-032: i18n Pattern System (patternsByLang for new architecture-map generator)
- ADR-010: Tek Runtime Dependency (justification for using node:fs built-in only)
- `[[feedback_directive_kanit_letter_vs_goal]]` — wire-gap lesson: scope must include caller module; proof must exclude def-file
- `src/orchestra/sprint-reporter.ts`, `src/orchestra/outcome-tracker.ts`, `src/orchestra/promotion-pipeline.ts`
- `src/orchestra/prompt-evolution.ts`, `src/agents/adaptive-agent.ts`
- `src/core/activation-engine.ts` (SKILL_AGENT_MAP, getSkillAgentAffinityBonus)
- `src/orchestra/managed-docs/content-generators.ts` (countModules, architecture-map generator)

---

## Amendment — Sprint 281 (2026-06-11, ADR-review, full code-verification)

**Classification: BOTH** (evolution = çekirdek farklılaştırıcı/moat — ürün hikâyesinin kendisi).

**Re-verified — 6 wire da CANLI, ancak API-nüansı kayda geçer (gelecek denetimler yanılmasın):** Part-A'daki fonksiyon-isimleri (`recordLineage`/`retireAgent`/`detectDrift`/`revertPrompt`) **kavramsaldır** — canlı API **sınıf-temellidir** ve modüller **`src/agents/`**'tadır: `promotion-pipeline.ts:12-13` `AgentGenealogy` + `AgentRetirement` import edip instance-alan olarak tutar (:73-74); `sprint-reporter.ts:377-382` `SpecializationDriftDetector`'ı wire eder (Task 212-005 kod-içi belgeli); `prompt-evolution.ts:10` `PromptRollback`'a delege eder (:164). Yüzeysel fonksiyon-adı-grep'i 0-caller gösterir — **doğru proof-pattern sınıf-adı seviyesindedir** (`grep -rl "AgentGenealogy" src/ | grep -v test | grep -v def-file` ≥1). `wirePromptEvolutionFromOutcomes` (1 dış-caller) + `adaptAgentRuntime` (3) fonksiyon-seviyesinde de doğrulanır.

**Part-B/C re-verified:** `SKILL_AGENT_MAP` + `SKILL_AGENT_AFFINITY_BONUS` (`activation-engine.ts:328-330`) + `routing-diversity-guard.test.ts` ✓ · `countModules` (`content-generators.ts:112`) ✓.

**Evrim:** F5 zinciri sonradan **ADR-078** "Active Identity-Mutation Loop" ile genişledi; ölçek-validasyonu (F5-008r, 1000+-variant) MASTER-PLAN §K'da açık iş. md+db senkron (Alperen ADR-review).
