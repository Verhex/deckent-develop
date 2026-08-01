# Synergy/conflict unconditional-rule fix (Lean-A) — design

- **Date:** 2026-06-18
- **Arc:** ARC-E (Orchestration Intelligence) — ROUTE-1 / routing-precision follow-up
- **Status:** design approved (Lean-A) → writing-plans next
- **Scope class:** Tier-0 (internal core/orchestra logic) → unit-test-sufficient + live re-plan proof
- **Origin:** Live autonomous dogfood (sprint-290 plan) + `planSprint:routing-v2-skills` instrumentation. Every code task got `documentation-writer` at score 25-30 — NOT a floor/precision issue, but **synergy activation rules with empty `when: {}` firing unconditionally on every task.**

## 1. Problem (live, instrumented evidence)

`rule-evolver.ts:evolveSynergyRules` converts the outcome-tracker **synergy matrix** (skill-pairs that historically co-occurred successfully) into per-skill **activation rules**, and conflict pairs into **exclusion rules**:

```ts
// synergy (line ~173-186)
rule: { name: `synergy-${partA}-with-${partB}`, when: {}, score: Math.round(entry.successRate * 5) }
// conflict (line ~199-205)
rule: { name: `conflict-${partA}-with-${partB}`, when: {}, reason: '…' }
```

**Bug: `when: {}` is an empty (unconditional) activation/exclusion condition** — it matches EVERY task. So each synergy rule adds `~+5` on every task regardless of intent/scope, and each conflict rule excludes a skill from every task. `documentation-writer` accumulated **5 synergy partnerships** (system-architect, typescript-expert, testing-expert, security-specialist, project-conventions) → **+25-30 on every task** → it wins all skill routing, burying intent-based candidates (typescript-expert: +2). Confirmed live via instrumentation: `Skill selected: 'documentation-writer' (score=25, rules=[synergy-…×5])`.

**Runaway feedback:** a skill that wins co-occurs more → more synergy rules → wins more. **Product bug too** (dual-perspective): any user project accumulates the same pathology. There are **14 auto-applied empty-`when` synergy rules** across 8 skills in `.deckent/routing/learnings.json` today.

**Architectural root:** synergy/conflict are **pairwise/contextual** concepts (A is good *with* B), mismodeled as **unconditional single-skill activation/exclusion**. The code even acknowledges this for agent+skill pairs (`rule-evolver.ts:153`: "Agent+skill pairs … inform routing weight instead" of producing rules) — but applies the wrong model to skill+skill.

## 2. Design — Lean-A (remove the unconditional rules; defer composition-synergy)

Three changes. Kills the runaway and restores intent-based skill routing. (Composition-time synergy — applying the matrix as a capped, partner-gated tiebreak at selection — is a separate **fast-follow**, not in this pass.)

### C1 — `rule-evolver.evolveSynergyRules`: stop emitting unconditional rules
Skill+skill synergy and conflict no longer produce `when: {}` activation/exclusion `EvolvedRule`s. The function still records its `reasoning` lines (synergy/conflict detected) for observability, and the synergy **matrix** (`outcome-tracker.getSynergyMatrix`) is untouched — the fast-follow consumes it at composition time. Net: `evolveSynergyRules` returns no rules (only reasoning), consistent with the existing agent+skill precedent.

### C2 — sprint-planner evolved-rule injection: empty-`when` guard (defense-in-depth)
In the auto-applied evolved-rule injection loop, **skip any rule whose `when` is an empty object** `{}` (covers activation AND exclusion, agents AND skills) before injecting it into activation configs. This neutralizes any legacy/stale empty-`when` rule already persisted — so even before cleanup, the runaway cannot re-trigger. A `debugLog` records each skip.

### C3 — one-time data cleanup: purge `.deckent/routing/learnings.json`
Remove the 14 existing `when: {}` auto-applied synergy `evolvedRules` from the local learnings file (gitignored runtime data). One-time, scripted, idempotent. After C2 these are already inert, but purging removes the misleading data.

## 3. Lossless / constraints

- **Intent-based routing restored:** code tasks (implementation/bugfix) → typescript-expert / code-simplifier via their intent/stack scoring; doc tasks → documentation-writer via its real `intent.primary='documentation'` activation rule (score 10, unaffected). Refactor → code-simplifier (activation). No skill is unconditionally boosted or excluded anymore.
- **Synergy signal:** temporarily removed (it was net-harmful as implemented). The fast-follow re-introduces it correctly (composition-time, capped, partner-gated). Flagged as deferred, not silently dropped.
- **i18n:** internal logic / debug logs only — no user-facing strings.
- **No behaviour change for non-synergy evolved rules:** activation/exclusion rules with a real `when` condition still inject and apply normally.
- **Tests:** real-behaviour (no mock-only).

## 4. Test & proof

1. **Unit (rule-evolver):** given a synergy matrix entry above `MIN_SAMPLES` with `verdict='synergy'`, `evolveSynergyRules` returns **zero** activation rules (and still emits the reasoning line). Same for `verdict='conflict'` → zero exclusion rules.
2. **Unit (sprint-planner guard):** the injection step skips an auto-applied evolved rule with `when: {}` and injects one with a non-empty `when`. (Test the guard predicate at the injection boundary; hermetic.)
3. **Regression:** existing routing/rule-evolver/sprint-planner tests stay green; any test that asserted a synergy activation rule is produced encoded the bug — update it with a one-line justification + report.
4. **Live proof (ground truth):** after build, `DECKENT_DEBUG=1 deckent plan --structured` → the `planSprint:routing-v2-skills` reasoning for code tasks shows **no `synergy-…` rules** and code tasks carry `typescript-expert`/`code-simplifier` (not documentation-writer). `feedback_trust_brain_eval_not_worker`.

## 5. Non-goals (deferred)

- **Composition-time synergy (#2 / fast-follow):** apply the synergy matrix as a capped, partner-gated mutual bonus in `selectBestSkills` (synergy only matters when both partners are relevant candidates). Separate spec/plan.
- **skill-floor precision fix** (`d5ddee68`) — already committed, lossless; orthogonal to this (documentation-writer wins via synergy, not the floor).

## 6. Files

- `src/orchestra/rule-evolver.ts` — `evolveSynergyRules` (C1).
- `src/orchestra/sprint-planner.ts` — evolved-rule injection loop (C2 guard).
- `.deckent/routing/learnings.json` — one-time purge (C3, gitignored, not committed).
- Tests: `tests/orchestra/rule-evolver.test.ts` (or the existing rule-evolver test) + a sprint-planner injection-guard test.
