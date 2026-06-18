# Synergy unconditional-rule fix (Lean-A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop synergy/conflict skill-pair rules from being emitted as unconditional (`when: {}`) activation/exclusion rules that fire on every task, restoring intent-based skill routing.

**Architecture:** (C1) `rule-evolver.evolveSynergyRules` no longer emits skill+skill rules (reasoning only). (C2) a shared `isUnconditionalRule` guard skips any empty-`when` evolved rule at sprint-planner injection (defense-in-depth for legacy data). (C3) one-time purge of the 14 stale rules from the gitignored learnings file.

**Tech Stack:** TypeScript (ESM, Node16 — `.js` import suffixes), vitest.

## Global Constraints

- **ESM imports:** relative imports end in `.js`; type-only imports use `import type`.
- **Lossless:** evolved rules with a REAL `when` (e.g. `{ 'intent.primary': 'refactor' }`, rule-evolver.ts:109/133) still inject and apply. Only empty-`when` (`{}`) rules are removed/skipped. `documentation`/`refactor` intent activation rules on the skills themselves are untouched.
- **i18n:** internal logic + debug logs only — no user-facing strings.
- **Surgical:** write only to `src/orchestra/rule-evolver.ts`, `src/orchestra/sprint-planner.ts`, and `tests/orchestra/rule-evolver.test.ts`. `npx tsc --noEmit` clean (watch for newly-unused locals).
- **TDD:** failing test first.

---

## File Structure

| File | Responsibility | Change |
|------|----------------|--------|
| `src/orchestra/rule-evolver.ts` | evolved-rule generation | C1 (evolveSynergyRules → reasoning only) + `isUnconditionalRule` export |
| `src/orchestra/sprint-planner.ts` | plan-time rule injection | C2 (skip empty-`when` rules) |
| `tests/orchestra/rule-evolver.test.ts` | rule-evolver tests | extend (C1 + guard predicate) |
| `.deckent/routing/learnings.json` | gitignored runtime data | C3 one-time purge (not committed) |

---

## Task 1: Remove unconditional synergy/conflict rules + injection guard + purge

**Files:**
- Modify: `src/orchestra/rule-evolver.ts` (`evolveSynergyRules` ~line 155-218; add `isUnconditionalRule` export)
- Modify: `src/orchestra/sprint-planner.ts` (injection loop ~line 530)
- Test: `tests/orchestra/rule-evolver.test.ts`

**Interfaces:**
- Produces: `export function isUnconditionalRule(rule: { when?: Record<string, unknown> } | undefined): boolean` — true when `rule.when` is a present-but-empty object.
- Consumes: existing `EvolvedRule`, `ActivationRule`, `ExclusionRule` types; `getSynergyMatrix()` (untouched).

- [ ] **Step 1: Write the failing tests**

Append to `tests/orchestra/rule-evolver.test.ts` (mirror the file's existing setup for `RuleEvolver` + a stubbed/seeded synergy matrix — reuse whatever the file already does to drive `getSynergyMatrix`; if it builds an OutcomeTracker with seeded synergy entries, follow that pattern):

```typescript
import { isUnconditionalRule } from '../../src/orchestra/rule-evolver.js';

describe('Lean-A — synergy/conflict no longer emit unconditional rules', () => {
  it('isUnconditionalRule: true for empty when, false for a real condition or missing when', () => {
    expect(isUnconditionalRule({ when: {} })).toBe(true);
    expect(isUnconditionalRule({ when: { 'intent.primary': 'refactor' } })).toBe(false);
    expect(isUnconditionalRule({})).toBe(false);
    expect(isUnconditionalRule(undefined)).toBe(false);
  });

  it('evolveSynergyRules emits NO activation/exclusion rules (reasoning only) for skill-pair synergy/conflict', () => {
    // Build a RuleEvolver whose synergy matrix has a high-sample synergy pair and a
    // conflict pair (use the file's existing harness; seed two skill-skill entries
    // above MIN_SAMPLES: one verdict='synergy', one verdict='conflict').
    const { rules, reasoning } = makeEvolverWithSynergyMatrix([
      { pair: 'documentation-writer+typescript-expert', tasks: 12, successRate: 0.9, verdict: 'synergy' },
      { pair: 'git-expert+performance-optimizer', tasks: 12, successRate: 0.1, verdict: 'conflict' },
    ]).evolveSynergyRules();

    expect(rules).toEqual([]); // no unconditional rules produced
    expect(reasoning.some(r => /Synergy detected/.test(r))).toBe(true);
    expect(reasoning.some(r => /Conflict detected/.test(r))).toBe(true);
  });
});
```

> Note: `evolveSynergyRules` is `private`. Test it through the public surface the file already uses (e.g. the public `evolve()`/`evolveRules()` that calls it, asserting no `synergy-*`/`conflict-*` rule names appear), OR — if the existing test already reaches it via a test-only accessor — follow that. If neither exists, assert via the public evolve entrypoint: `expect(result.rules.some(r => /^(synergy|conflict)-/.test(r.rule?.name ?? ''))).toBe(false)`. Implement `makeEvolverWithSynergyMatrix` per the file's existing fixture style.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/orchestra/rule-evolver.test.ts -t "Lean-A"`
Expected: FAIL — `isUnconditionalRule` is not exported; `evolveSynergyRules` still emits `synergy-*`/`conflict-*` rules.

- [ ] **Step 3: C1 — evolveSynergyRules stops emitting rules**

In `src/orchestra/rule-evolver.ts`, replace the synergy branch (the `if (entry.verdict === 'synergy') { … }` block, ~line 164-188) and the conflict branch (`if (entry.verdict === 'conflict') { … }`, ~line 190-214) with reasoning-only versions — remove the inner `if (!this.isAgentId(partA) && !this.isAgentId(partB)) { … rules.push(…) }` blocks entirely:

```typescript
      if (entry.verdict === 'synergy') {
        reasoning.push(`Synergy detected: ${entry.pair} (${Math.round(entry.successRate * 100)}% over ${entry.tasks} tasks)`);
        // Lean-A: skill+skill synergy informs routing weight at COMPOSITION time
        // (fast-follow), not as an unconditional `when: {}` activation rule that
        // would fire on every task. No rule emitted here.
      }

      if (entry.verdict === 'conflict') {
        reasoning.push(`Conflict detected: ${entry.pair} (${Math.round(entry.successRate * 100)}% over ${entry.tasks} tasks)`);
        // Lean-A: same — no unconditional exclusion rule. Conflict is a pairwise,
        // composition-time signal, not a per-task exclusion.
      }
```

Then remove the now-unused `const parts = entry.pair.split('+') as [string, string]; const [partA, partB] = parts;` (~line 161-162) if `partA`/`partB` are no longer referenced anywhere in the loop (they aren't — the reasoning uses `entry.pair`). Run `npx tsc --noEmit` and delete any local that became unused.

- [ ] **Step 4: C2 — add `isUnconditionalRule` export**

In `src/orchestra/rule-evolver.ts`, add an exported helper near the top-level exports (after the imports / before or after the `RuleEvolver` class — module scope, not a class method):

```typescript
/**
 * True when an evolved rule's condition is a present-but-empty object (`when: {}`).
 * Such a rule matches EVERY task — a legacy synergy/conflict artifact that must not
 * be injected into activation configs (it causes per-task score domination).
 */
export function isUnconditionalRule(
  rule: { when?: Record<string, unknown> } | undefined | null,
): boolean {
  const w = rule?.when;
  return !!w && typeof w === 'object' && !Array.isArray(w) && Object.keys(w).length === 0;
}
```

- [ ] **Step 5: C2 — guard the sprint-planner injection loop**

In `src/orchestra/sprint-planner.ts`, import the helper (extend the existing `./rule-evolver.js` import if present, else add `import { isUnconditionalRule } from './rule-evolver.js';`), then add the guard at the TOP of the `for (const evolved of autoApplied) {` loop body (~line 530):

```typescript
        for (const evolved of autoApplied) {
          // Lean-A: never inject a legacy/stale unconditional (`when: {}`) rule — it
          // matches every task and reintroduces the synergy/conflict runaway.
          if (isUnconditionalRule(evolved.rule as { when?: Record<string, unknown> })) {
            debugLog(
              'planSprint:evolved-rules',
              `Skipped unconditional (empty-when) rule '${(evolved.rule as { name?: string }).name ?? evolved.entityId}'`,
            );
            continue;
          }
          if (evolved.entityType === 'agent') {
```

(Leave the rest of the loop body unchanged.)

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run tests/orchestra/rule-evolver.test.ts`
Expected: PASS — `isUnconditionalRule` correct; `evolveSynergyRules` emits no synergy/conflict rules; pre-existing rule-evolver tests stay green (update any that asserted a synergy/conflict rule IS produced — that encoded the bug; add a one-line `// Lean-A: synergy no longer emits unconditional rules` justification and report it).

- [ ] **Step 7: Type-check + injection regression**

Run: `npx tsc --noEmit && npx vitest run tests/orchestra/sprint-planner.test.ts tests/orchestra/rule-evolver.test.ts`
Expected: no type errors (incl. no unused locals); suites green.

- [ ] **Step 8: C3 — one-time purge of stale rules from learnings.json**

Run this one-time cleanup (the file is gitignored runtime data — NOT committed):

```bash
node -e '
const fs=require("fs"); const p=".deckent/routing/learnings.json";
if(!fs.existsSync(p)){console.log("no learnings.json — nothing to purge");process.exit(0);}
const l=JSON.parse(fs.readFileSync(p,"utf8"));
const before=(l.evolvedRules||[]).length;
l.evolvedRules=(l.evolvedRules||[]).filter(r=>{const w=r.rule&&r.rule.when;return !(w&&typeof w==="object"&&!Array.isArray(w)&&Object.keys(w).length===0);});
fs.writeFileSync(p, JSON.stringify(l,null,2));
console.log("purged empty-when evolvedRules:", before, "→", l.evolvedRules.length);
'
```
Expected: `purged empty-when evolvedRules: 26 → 12` (removes the 14 empty-`when` synergy rules; keeps real conditional rules).

- [ ] **Step 9: Commit**

```bash
git add src/orchestra/rule-evolver.ts src/orchestra/sprint-planner.ts tests/orchestra/rule-evolver.test.ts
git commit -m "$(cat <<'EOF'
fix(routing): synergy/conflict no longer emit unconditional (when:{}) rules

evolveSynergyRules emitted skill-pair synergy as `when:{}` activation rules
(+5 each) and conflict as `when:{}` exclusion rules — both fire on EVERY
task, so an accumulated-synergy skill (documentation-writer, +25) buried
intent-based routing. Now: reasoning only (composition-time synergy is a
fast-follow), plus an isUnconditionalRule guard at injection so stale
empty-when rules can never re-trigger the runaway.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

(`.deckent/routing/learnings.json` is gitignored — the C3 purge is local data hygiene, not part of the commit.)

---

## Self-Review

**Spec coverage:** C1 (evolveSynergyRules reasoning-only) → Step 3; C2 (`isUnconditionalRule` + injection guard) → Steps 4-5; C3 (purge) → Step 8; lossless (real-`when` rules untouched) → Step 1 predicate test + Step 7; live proof → controller re-plans after build. ✅

**Placeholder scan:** complete code in every code step. The test harness `makeEvolverWithSynergyMatrix` is described against the file's existing fixture style (Step 1 note) rather than invented blind, because the seeding mechanism depends on the existing test's setup — the implementer mirrors it. ✅

**Type consistency:** `isUnconditionalRule(rule: { when?: Record<string, unknown> })` matches both the export (Step 4) and the call site cast (Step 5); `when: Record<string, unknown>` matches `ActivationRule`/`ExclusionRule` (routing-types.ts:83/89). ✅

**Note:** Step 3 removes the `confidence`/`status`/`partA`/`partB` locals that only fed the removed `rules.push`; Step 3 explicitly calls out deleting newly-unused locals so `tsc --noEmit` stays clean.
