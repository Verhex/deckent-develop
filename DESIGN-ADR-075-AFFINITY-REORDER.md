# DESIGN — ADR-075 skill→agent affinity wire via routing-order reorder

> **Status:** design-ready (overnight loop, 2026-06-25). Implementation is **attended-defer**
> (behaviour-changing core routing + routing-balance judgment). This spec turns the confirmed
> "tested-but-dead ADR-075 affinity" gap into an implementable, flag-gated plan.

## Problem (file:line)
`activation-engine.ts:91` applies `SKILL_AGENT_AFFINITY_BONUS` only when the caller passes an
`affinity` context with `{enabled, agentId, assignedSkills}`. But every production caller —
`routing-engine.ts:464` (`evaluateForceAgentSemantic`), `:518` (`selectBestAgent` loop), `:682`
— calls `evaluateActivation(taskDNA, activation)` with **2 args**. The bonus never fires →
the feature ships dead despite the commit claim "selectBestAgent opts in".

**Root cause:** `routeTaskV2` order is **agent-first → skill-second**:
- Step 3 `selectBestAgent` (`routing-engine.ts:364`) picks the agent.
- Step 4–5 `selectBestSkills` (`:387`/`:406`) picks skills AFTER.

So at agent-selection time the task's `assignedSkills` don't exist yet → `selectBestAgent`
cannot build the affinity context. (Verified: `selectBestSkills` does NOT take `agentId` —
skills do not depend on the agent, so a reorder is safe.)

## Goal
Make the affinity signal **live but flag-gated, default-off** — byte-identical routing until a
config flag turns it on; when on, an agent whose `SKILL_AGENT_MAP` covers one of the task's
assigned skills gets `+SKILL_AGENT_AFFINITY_BONUS` (purely additive, refactorer/generalist never
penalised — the existing guard).

## Options
- **Option A — reorder to skill-first (RECOMMENDED).** Move Step 4–5 (skill selection) ABOVE
  Step 3 (agent selection) in `routeTaskV2`. Then pass `affinityCtx = {agentId: <candidate>,
  assignedSkills: skillIds, enabled: cfg.routing?.skill_agent_affinity ?? false}` as the 3rd
  arg at `:518` (the per-candidate loop) and `:464`/`:682` (force-agent paths, with the resolved
  skillIds). Skills are unchanged (they never depended on the agent) → **flag-off = byte-identical
  output**; only the internal step order changes.
- **Option B — two-pass (rejected).** Keep order; after skills are chosen, re-run
  `selectBestAgent` with the affinity context when the flag is on. Wasteful (double agent scoring)
  and duplicates reasoning lines.

## Implementation sketch (Option A)
1. **Config:** add `routing.skill_agent_affinity?: boolean` (default false) to `config-types.ts`
   + boolean validation in `config.ts`. (Mirror the cross_verify.enforce_refuted pattern.)
2. **Reorder `routeTaskV2`:** lift the skill block (currently `:386`–`~:414`) to run before the
   agent block (`:355`–`:384`). Keep `forceSkills`/budget logic intact. Verify nothing in the
   agent block reads a skill-block local (it doesn't today).
3. **Thread affinity:** in `selectBestAgent`, accept `assignedSkills: string[]` + `affinityEnabled:
   boolean` params; at each `evaluateActivation(taskDNA, activation)` call pass a 3rd arg
   `{agentId: id, assignedSkills, enabled: affinityEnabled}`. Same for `evaluateForceAgentSemantic`.
4. **Reasoning order:** the reorder will move skill reasoning lines ahead of agent lines — update
   any test asserting the combined `reasoning[]` ORDER (output set is unchanged).

## Faithful test plan
- **Flag-off invariance:** existing `routeTaskV2` tests pass unchanged EXCEPT reasoning-order
  assertions (update those). Add an explicit test: flag-off → identical `{agentId, skillIds}` for a
  task whose skill maps to a non-default agent (proves no behaviour change).
- **Flag-on affinity:** new test — task with `assignedSkills=['security-specialist']` + agent
  `security-auditor` (mapped in `SKILL_AGENT_MAP`) → that agent's score gains the bonus and wins a
  tiebreak it would otherwise lose. Pre-reorder/2-arg → RED.

## Routing-balance gate (before any default-on)
ADR-075's intent was to FIX agent-routing imbalance — but enabling affinity could *cause* a
different skew. Before flipping the flag on (even for dogfood), measure the agent-distribution
delta on a representative task sample (the `feedback_agent_routing_imbalance` concern). Ship
default-OFF; enable in deckent-dev dogfood only after the distribution check.

## Sibling finding
`core/agent-cache.ts` (`AgentSelectionCache`, overnight iter-2) is the OTHER built-but-unwired
routing enhancement — memoizes `selectBestAgent`. If ADR-075 reorder lands, agent-cache wiring is
the natural follow-up (cache keyed by task-signature INCLUDING skills, since affinity makes the
agent depend on skills). Bundle both into one "routing-v2 enhancements" attended sprint.
