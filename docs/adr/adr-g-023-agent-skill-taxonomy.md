# ADR-G-023: Agent/Skill Taxonomy

**Class:** ADR-G (Global / Constitution) · **Scope:** global+project · **Immutable:** yes · **Source:** publisher · **Enforcement:** today=Agent=vertical-domain-expert / Skill=horizontal-capability taxonomy + `selectAgent`/`selectSkills` routing + `AgentRoutingHealth` advisory 40%-threshold (detector-monitored, not hard-enforced) → tomorrow=catalog expansion (AGSK-1) + routing-balance (ADR-G-006) + user-custom agent/skill (ADR-UG / ADR-UP)
**Status:** accepted · **Date:** 2026-06-30 · **Absorbs:** ADR-041 (Agent Taxonomy — Horizontal Skills vs Vertical Agents) · **Supersedes:** —
**Crosswalk:** ADR-041 → ADR-G-023

---

## Context

deckent's worker fleet is selected along two orthogonal axes — *which specialist* (agent) and *which cross-cutting capability* (skill). Conflating those axes broke routing. Sprint 145-147 live evidence showed the `test-writer` agent capturing an ever-larger share of tasks — 52% → 53% → **100%** by Sprint 147 — because it matched the `test` keyword (including any `tests/` scope). The `AgentRoutingHealth` detector crossed its anomaly threshold and triggered an ADR.

The root cause was a **taxonomic error**: "writing tests" is a *horizontal capability* every agent applies, not a *vertical domain* of its own. Modeling it as an agent produced four failures — wrong classification, a degenerate routing distribution (one agent at 100% made the anomaly detector meaningless), a Beta-GA UX problem ("why does everything go to test-writer?"), and an intent-classifier that mislabeled every `tests/` task as primary-intent `testing`.

Sprint 148 shipped the reform package: archive `test-writer`, add `testing-expert` skill auto-activation, drop `testing` as a primary intent (replaced by a `test-coverage` *tag*), update the Router-V2 fallback chain, and clean 15 agent `PROMPT.md` rubrics. The taxonomy was reconfirmed with Sprint 149/150/166 dogfood evidence and is user-facing product law — users see and route against agent/skill surfaces, and custom-agent breaking-change impact is user-facing too.

---

## Decision (Today)

### 1. Two orthogonal axes

```xml
<agent-skill-taxonomy>
  <agent kind="vertical">
    A deep specialist in ONE domain. Examples: architect (system design, module
    management), security-auditor (vulnerabilities, OWASP), frontend-designer
    (UI/UX, components), doc-writer (docs, README, CHANGELOG), bug-fixer
    (debugging, regression). `.deckent/agents/` holds 15 built-in agents
    (excluding temp/archive).
  </agent>
  <skill kind="horizontal">
    A cross-cutting capability ANY agent may use. Examples: testing-expert
    (vitest, coverage — auto-activates on scope tests/** or *.test.ts),
    typescript-expert (TS type system), documentation-writer (Markdown, JSDoc).
  </skill>
  <invariant>
    Testing is a HORIZONTAL skill — architect writes tests, bug-fixer writes
    tests. A dedicated `test-writer` agent is therefore redundant and is removed
    (archived under .deckent/agents/archive/test-writer-removed-sprint-148/).
  </invariant>
</agent-skill-taxonomy>
```

### 2. Routing rules

1. **Intent classifier** — `testing` is **not** a primary intent. A `tests/**` scope adds a `test-coverage` *tag* (`routing-engine.ts` `'test-coverage'` → +2) instead.
2. **`selectSkills()`** — if scope is `tests/**` or `filesWrite` includes `*.test.ts`, `testing-expert` is auto-added.
3. **`selectAgent()`** — chosen by the task's primary intent (core-dev → architect, bug-fix → bug-fixer, …), independent of model/effort selection.
4. **`AgentRoutingHealth`** — anomaly threshold `ANOMALY_THRESHOLD_RATE = 0.40` (`detectors/agent-routing.ts`): no single agent should exceed ~40% of assignments. This is a **detector-monitored advisory** (the nervous-system detector *warns*), **not** a hard gate.

### 3. Distribution reality (honest)

The taxonomy itself (vertical/horizontal, test=skill) is sound and durably enforced — `test-writer` stays at 0 assignments across post-reform sprints (148: 0/27, 150: 0/38). But the *distribution-balance* goal has **chronically recurred**: `test-writer`'s monopoly was periodically replaced by `refactorer`-weight (e.g. Sprint 211: 12/16). That imbalance is mitigated — not solved — by multi-signal scoring and skill→agent affinity (now both inside **ADR-G-006**); the 40% threshold remains a continuously-monitored advisory target, not a guarantee.

> **Threshold reconciliation (40% vs ≤60%):** these are **two distinct mechanisms at two layers**, not a contradiction. **40%** is the post-hoc `AgentRoutingHealth` *advisory alarm* (the ADR-G-022 detector *warns* when any agent exceeds ~40% of assignments — it never blocks). **≤60%** is the in-selection *diversity-guard* inside ADR-G-006 — it down-weights an agent approaching ~60% share at route-time. The detector warns earlier (40%) than the guard caps (≤60%); the detector only observes, the guard actively shapes the next selection.

---

## Intent / Roadmap (Tomorrow)

- **AGSK-1 — catalog expansion.** Grow the built-in agent and skill catalog beyond the current 15 agents, each as a clean vertical/horizontal split, with every new agent carrying a rubric-quality `PROMPT.md`. Scale target: the catalog and its routing must stay sane at hundreds of agents / thousands of skills.
- **Routing balance.** The recurring single-agent monopoly is owned by **ADR-G-006** (Routing & Selection) — multi-signal scoring + `SKILL_AGENT_MAP` skill→agent affinity + a diversity guard (≤60%). This ADR defines the *taxonomy*; ADR-G-006 owns *balanced selection over* it.
- **User-custom agent/skill.** Users define their own agents (vertical) and skills (horizontal) per global host / per project, expressed as **ADR-UG / ADR-UP** layers — deckent observes and routes against them under the ADR-G-baseline (precedence G>U>D, **ADR-G-019**). A custom `test-writer` in a user project may need a migration adapter (the one breaking change).

---

## Consequences

**(+)** Routing classification is correct (test is a skill, not an agent), so the `AgentRoutingHealth` detector measures real anomalies instead of a false 100%; the Beta-GA UX is legible ("why this agent?" is answerable); and skills are reusable economy — `testing-expert` serves many agents instead of one agent monopolizing a keyword. The taxonomy is reconfirmed across Sprints 148/149/150/166 and is stable product law.

**(−)** Distribution balance is a *moving* target, not a closed one — the monopoly recurs (refactorer-weight) and is mitigated, not eliminated, by ADR-G-006; the 40% threshold is advisory (warned), not hard-enforced. Sprint-147 `test-writer` stats were archived (not lost). A user project that defined a custom `test-writer` agent hits a breaking change and may need a migration adapter.

---

## References / Absorbed

- **Absorbs:** ADR-041 (Agent Taxonomy — Horizontal Skills vs Vertical Agents; test-writer removal, `testing-expert` auto-activation, intent-classifier refactor, Router-V2 fallback, 15-agent rubric cleanup; Sprint 281 distribution-reality amendment).
- **Routing & balance:** **ADR-G-006** (Routing & Selection) — multi-signal scoring (old ADR-072) + skill→agent affinity `SKILL_AGENT_MAP` + diversity guard (old ADR-075B); owns balanced selection over this taxonomy.
- **Detector:** **ADR-G-022** (Nervous System) — `AgentRoutingHealth` detector (old ADR-040) surfaces the advisory 40% threshold.
- **Authority:** **ADR-G-020** (Authority, Roles, Flow & Enforcement) — `test-writer` removed from the authority matrix (old ADR-037 RBAC).
- **Evaluation:** **ADR-G-009** (Evaluation Integrity) — `testing-expert` as a horizontal capability under coverage-aware evaluation.
- **User layers:** **ADR-G-019** (ADR Governance & 4-Layer Taxonomy) — user-custom agent/skill via ADR-UG / ADR-UP (precedence G>U>D).
- **Born work-items:** AGSK-1 (agent/skill catalog expansion + scale-to-hundreds/thousands), ROUTING-BALANCE (owned by ADR-G-006), USER-CUSTOM-AGENT-SKILL (ADR-UG/UP + custom-agent migration adapter).
- **Direction:** memory `feedback_agent_routing_imbalance`, `docs/architecture/agents.md`, `docs/architecture/agent-skill-architecture.md`.
