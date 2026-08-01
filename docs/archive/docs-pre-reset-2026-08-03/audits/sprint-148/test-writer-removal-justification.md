# test-writer Agent Removal Justification

**Sprint:** 148  
**Date:** 2026-04-20  
**Decision:** Archive and remove `test-writer` from active agent pool  
**Archive Location:** `.deckent/agents/archive/test-writer-removed-sprint-148/`

---

## 1. Sprint Performance Statistics

| Sprint | Tasks Assigned to test-writer | Total Tasks | Percentage | Outcome |
|--------|-------------------------------|-------------|------------|---------|
| Sprint 145 | 14 | 27 | 52% | Overrepresented |
| Sprint 146 | 9 | 17 | 53% | Overrepresented |
| Sprint 147 | 21 | 22 | 95% | **Critical anomaly** |

### Trend Analysis

- Sprint 145-146: Consistent ~52-53% routing — already above healthy threshold (25-30% for any single agent)
- Sprint 147: Catastrophic 95% monopoly — nearly every task regardless of intent routed to test-writer
- Root cause: Intent classifier `"testing"` keyword too broadly matched (`test`, `spec`, `coverage`, `vitest`) overlapping with legitimate non-testing tasks

### Agent Lifetime Stats (from agent.json)

- Total uses: 113
- Success rate: 90.3%
- Average coverage: 14.4%
- Last used: sprint-147

---

## 2. AgentRoutingHealth Detector Findings

Sprint 147 nervous system `AgentRoutingHealth` detector (src/nervous/detectors/agent-routing.ts) reported:

- **Anomaly threshold:** 40% of tasks to single agent = warning
- **Sprint 147 result:** test-writer = 95% → **CRITICAL severity**
- **Detection event:** `DETECTOR→NERVOUS:DETECTION` channel, `agent-routing` detector ID
- **Suggested action:** `AGENT_POOL_REBALANCE`

The detector proved its value by catching the very problem it was designed to detect in its first live sprint. This is Deckent's first "conscious" self-healing moment.

---

## 3. Beta GA User Experience Justification

Sprint 150 Beta GA is 2 days away. Shipping with test-writer agent active means:

1. **User confusion:** "Why does my architecture task get a test-writer agent?"
2. **Routing instability:** Any task mentioning "test" in scope or description gets misrouted
3. **Quality degradation:** test-writer agent prompt optimizes for test writing, not the actual task intent
4. **Metrics pollution:** Agent performance stats become meaningless when one agent handles everything

Removing test-writer before GA ensures clean routing distribution and meaningful agent specialization.

---

## 4. Taxonomy Decision: "Test is a Horizontal Skill, Not a Vertical Agent"

### Core Principle

| Concept | Definition | Examples |
|---------|-----------|----------|
| **Agent (vertical)** | Domain expertise with deep specialization | architect, security-auditor, frontend-designer |
| **Skill (horizontal)** | Cross-cutting capability any agent can use | testing-expert, typescript-expert, documentation-writer |

### Why Testing is Horizontal

- Every agent writes tests as part of their deliverables
- An architect writing a new module also writes tests for it
- A bug-fixer validates the fix with tests
- A security-auditor writes security test cases

Testing is not a standalone activity — it's embedded in every development workflow. Making it a standalone agent creates a false specialization that the routing engine cannot meaningfully distinguish from general development.

### Migration Path

- `test-writer` agent → **archived** (Sprint 148)
- `testing-expert` skill → **auto-activated** when task scope includes `tests/` or filesWrite includes `*.test.ts`
- Intent classifier → `"testing"` removed as primary intent, replaced by `"test-coverage"` tag
- Router fallback → tasks previously routed to test-writer now go to contextually appropriate agents (architect, refactorer, bug-fixer)

---

## 5. Rollback Plan

If the reform proves problematic:

1. Source: `.deckent/agents/archive/test-writer-removed-sprint-148/`
2. Restore: `cp -r .deckent/agents/archive/test-writer-removed-sprint-148/ .deckent/agents/test-writer/`
3. Re-enable: Set `enabled: true` in restored `agent.json`
4. Verify: `AgentPoolManager().getBuiltinAgents().length === 16`

---

## 6. References

- ADR-041 (proposed): Agent Taxonomy — Horizontal Skills vs Vertical Agents
- Sprint 147 nervous system detector event log
- Sprint 148 DIRECTIVES Block A (Tasks 1-5)
- Design spec: `docs/superpowers/specs/2026-04-20-sprint-148-meta-dogfood-design.md`
- Memory: `feedback_test_agent_removal.md`
