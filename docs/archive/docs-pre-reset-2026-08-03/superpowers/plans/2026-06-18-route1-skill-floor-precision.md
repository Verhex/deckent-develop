# ROUTE-1 skill-floor precision Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop ROUTE-1's empty-skill floor from assigning a coincidental skill (documentation-writer/testing-expert) to code tasks; make it return the stack-appropriate language/refactor expert instead.

**Architecture:** Reorder `pickSkillFloor` to resolve the kind/intent **principled default first** (sub-threshold-best only as fallback), and make the code-development default **stack-aware** (project language → language-expert). One file, one cohesive change.

**Tech Stack:** TypeScript (ESM, Node16 — `.js` import suffixes), vitest.

## Global Constraints

- **ESM imports:** relative imports end in `.js`; type-only imports use `import type`.
- **Lossless:** `refactor` tasks still get `code-simplifier` (it activates on `intent=refactor`, never reaches the floor); `documentation` tasks still get `documentation-writer` (activates on `intent=documentation`). Only the floor path changes — tasks whose skills clear `skillMinScore` are byte-for-byte unchanged.
- **unknown-intent honest-[]:** an `unknown` intent with no sub-threshold candidate still returns `[]`.
- **i18n:** internal logic — no user-facing strings, no `getMessage`.
- **ADR-070:** the language-expert map is a named, documented constant.
- **Surgical:** write only to `src/core/routing-engine.ts` and `tests/core/routing-route1-precision.test.ts`. `npx tsc --noEmit` clean.
- **TDD:** failing test first.

---

## File Structure

| File | Responsibility | Change |
|------|----------------|--------|
| `src/core/routing-engine.ts` | Layer-3 skill scoring + floor | add `LANGUAGE_EXPERT_SKILL` + `resolvePrincipledDefault`; reorder `pickSkillFloor` + add `projectStack` param; pass `projectStack` at both call sites |
| `tests/core/routing-route1-precision.test.ts` | floor precision tests | add `describe('ROUTE-1 skill-floor precision', …)` |

---

## Task 1: Principled-default-first + stack-aware skill floor

**Files:**
- Modify: `src/core/routing-engine.ts` — `pickSkillFloor` (~line 602-617), its two call sites (~line 714, ~line 750), and the `normalizeTechStack` import.
- Test: `tests/core/routing-route1-precision.test.ts` (extend).

**Interfaces:**
- Consumes: `normalizeTechStack(language)` from `./work-model.js` (returns a `TechStackKind`); existing `KIND_DEFAULT_SKILL`, `INTENT_DEFAULT_SKILL`, `routeTaskV2`.
- Produces: `pickSkillFloor(subThreshold, intent, taskKind, pool, projectStack?)` — new trailing `projectStack` param; module-local `LANGUAGE_EXPERT_SKILL` map + `resolvePrincipledDefault(intent, taskKind, projectStack, pool)`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/core/routing-route1-precision.test.ts` (it already imports `routeTaskV2`, `createAgentDefinition`, `createSkillDefinition`, `makeAgent`, `makeAgentPool`, `SkillDefinition`). Add a self-contained describe block:

```typescript
describe('ROUTE-1 skill-floor precision — principled-default-first + stack-aware', () => {
  // Hermetic skill pool mirroring the REAL narrow activation rules that cause
  // the floor to fire for code tasks (no rule matches an implementation task
  // in a non-special domain), plus the coincidental skills that used to win.
  function makeFloorSkillPool(): Map<string, SkillDefinition> {
    const p = new Map<string, SkillDefinition>();
    const defs: Array<Partial<SkillDefinition> & { id: string; name: string }> = [
      { id: 'documentation-writer', name: 'Doc Writer', category: 'workflow', triggers: ['doc'], priority: 5,
        activation: { rules: [{ when: { 'intent.primary': 'documentation' }, score: 10 }], exclude: [], minScore: 5 } },
      { id: 'testing-expert', name: 'Testing Expert', category: 'workflow', triggers: ['test'], priority: 10,
        activation: { rules: [{ when: { 'tags': { $contains: 'test-coverage' } }, score: 2 }], exclude: [], minScore: 5 } },
      { id: 'typescript-expert', name: 'TS Expert', category: 'language', triggers: ['typescript'], priority: 10,
        activation: { rules: [{ when: { 'domains': { $contains: 'typescript' } }, score: 10 }], exclude: [], minScore: 5 } },
      { id: 'python-expert', name: 'Python Expert', category: 'language', triggers: ['python'], priority: 10,
        activation: { rules: [{ when: { 'domains': { $contains: 'python' } }, score: 10 }], exclude: [], minScore: 5 } },
      { id: 'code-simplifier', name: 'Code Simplifier', category: 'workflow', triggers: ['refactor'], priority: 8,
        activation: { rules: [{ when: { 'intent.primary': 'refactor' }, score: 8 }], exclude: [], minScore: 5 } },
    ];
    for (const d of defs) { const s = createSkillDefinition(d); p.set(s.id, s); }
    return p;
  }
  const floorAgents = makeAgentPool(
    makeAgent('bug-fixer', { source: 'builtin', activation: { rules: [
      { when: { 'intent.primary': 'implementation' }, score: 7 },
      { when: { 'intent.primary': 'bugfix' }, score: 9 },
    ], exclude: [], minScore: 5 } }),
  );
  const tsStack = { language: 'typescript', framework: 'node', dependencies: [] as string[] };
  const pyStack = { language: 'python', framework: 'fastapi', dependencies: [] as string[] };

  it('REGRESSION: implementation code task in TS project → typescript-expert (NOT documentation-writer/testing-expert)', () => {
    const d = routeTaskV2(
      { title: 'add post-item lifecycle hook', description: 'implement a post-item cleanup hook in the dispatcher module',
        scope: { directories: ['src/orchestra/'], filesRead: [], filesWrite: ['src/orchestra/x.ts'] },
        type: 'code-development' },
      floorAgents, makeFloorSkillPool(), { projectStack: tsStack },
    );
    expect(d.skillIds).toContain('typescript-expert');
    expect(d.skillIds).not.toContain('documentation-writer');
    expect(d.skillIds).not.toContain('testing-expert');
  });

  it('STACK-AWARE (product): implementation task in a PYTHON project → python-expert (not typescript-expert)', () => {
    const d = routeTaskV2(
      { title: 'add endpoint handler', description: 'implement the create handler in the api module',
        scope: { directories: ['src/api/'], filesRead: [], filesWrite: ['src/api/x.py'] },
        type: 'code-development' },
      floorAgents, makeFloorSkillPool(), { projectStack: pyStack },
    );
    expect(d.skillIds).toContain('python-expert');
    expect(d.skillIds).not.toContain('typescript-expert');
  });

  it('LOSSLESS: refactor task → code-simplifier (via activation, not the floor)', () => {
    const d = routeTaskV2(
      { title: 'refactor the dispatcher', description: 'refactor and restructure the dispatcher for clarity',
        scope: { directories: ['src/orchestra/'], filesRead: [], filesWrite: ['src/orchestra/x.ts'] },
        type: 'refactor' },
      floorAgents, makeFloorSkillPool(), { projectStack: tsStack },
    );
    expect(d.taskDNA.intent.primary).toBe('refactor');
    expect(d.skillIds).toContain('code-simplifier');
  });

  it('HONEST-EMPTY: unknown-intent task with no sub-threshold and no principled default → []', () => {
    const d = routeTaskV2(
      { title: 'zzz', description: 'zzz',
        scope: { directories: [], filesRead: [], filesWrite: [] } },
      floorAgents,
      // pool whose only skill cannot match and is not a code/doc default
      (() => { const p = new Map<string, SkillDefinition>();
        const s = createSkillDefinition({ id: 'graphql-expert', name: 'GraphQL', category: 'workflow', triggers: ['graphql'],
          activation: { rules: [{ when: { 'domains': { $contains: 'graphql' } }, score: 10 }], exclude: [], minScore: 5 } });
        p.set(s.id, s); return p; })(),
      { projectStack: tsStack },
    );
    expect(d.taskDNA.intent.primary).toBe('unknown');
    expect(d.skillIds).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/core/routing-route1-precision.test.ts -t "skill-floor precision"`
Expected: FAIL — REGRESSION and STACK-AWARE fail (floor currently returns `testing-expert` via the `test-coverage` sub-threshold, or `documentation-writer`, not the language-expert). `pickSkillFloor` does not accept `projectStack`.

- [ ] **Step 3: Add the `normalizeTechStack` import**

In `src/core/routing-engine.ts`, extend the existing `./work-model.js` import (which already imports `taskKindToIntent` and `type TaskKind`) to also import `normalizeTechStack` and `type TechStackKind`:

```typescript
import { taskKindToIntent, normalizeTechStack } from './work-model.js';
import type { TaskKind, TechStackKind } from './work-model.js';
```
(Merge with the existing lines — do not duplicate the module import.)

- [ ] **Step 4: Add the language-expert map + `resolvePrincipledDefault`**

In `src/core/routing-engine.ts`, immediately BEFORE the `pickSkillFloor` function (~line 595, before its doc comment), insert:

```typescript
/** ROUTE-1 — project stack language → the built-in language-expert skill id.
 *  Only stacks with a real built-in expert are listed; others fall back to
 *  code-simplifier (language-agnostic) inside resolvePrincipledDefault. */
const LANGUAGE_EXPERT_SKILL: Partial<Record<TechStackKind, string>> = {
  typescript: 'typescript-expert',
  javascript: 'typescript-expert',
  python:     'python-expert',
};

/**
 * Resolve the principled floor default for a task (the kind/intent-appropriate
 * skill), stack-aware for code work. Returns null when no curated default fits.
 * Skipped for `unknown` intent by the caller to preserve the honest-empty contract.
 */
function resolvePrincipledDefault(
  intent: IntentType,
  taskKind: TaskKind | undefined,
  projectStack: { language: string } | null | undefined,
  pool: Map<string, SkillDefinition>,
): string | null {
  const isCode = taskKind === 'code-development' || intent === 'implementation' || intent === 'bugfix';
  if (isCode) {
    const lang = normalizeTechStack(projectStack?.language);
    const langSkill = LANGUAGE_EXPERT_SKILL[lang];
    if (langSkill && pool.has(langSkill)) return langSkill;
    if (pool.has('code-simplifier')) return 'code-simplifier'; // language-agnostic code skill
    // else fall through to the kind/intent defaults below
  }
  const byKind = taskKind ? KIND_DEFAULT_SKILL[taskKind] : undefined;
  if (byKind && pool.has(byKind)) return byKind;
  const byIntent = INTENT_DEFAULT_SKILL[intent];
  if (byIntent && pool.has(byIntent)) return byIntent;
  return null;
}
```

- [ ] **Step 5: Reorder `pickSkillFloor` + add `projectStack` param**

Replace the whole `pickSkillFloor` function body (~line 602-617) with:

```typescript
function pickSkillFloor(
  subThreshold: Array<{ id: string; finalScore: number }>,
  intent: IntentType,
  taskKind: TaskKind | undefined,
  pool: Map<string, SkillDefinition>,
  projectStack?: { language: string } | null,
): string | null {
  // Principled default first (the kind/intent-appropriate skill is a stronger
  // signal than a coincidentally-bonused sub-threshold candidate). Skipped for
  // `unknown` intent so an unclassifiable task can still return [].
  if (intent !== 'unknown') {
    const principled = resolvePrincipledDefault(intent, taskKind, projectStack, pool);
    if (principled) return principled;
  }
  // Fallback: best sub-threshold candidate (some real signal scored, just below threshold).
  if (subThreshold.length > 0) {
    return [...subThreshold].sort((a, b) => b.finalScore - a.finalScore)[0]!.id;
  }
  return null;
}
```

Update the doc comment above it to read:
```typescript
/**
 * Pick a floor skill when no candidate cleared the threshold:
 *  (1) the kind/intent principled default (stack-aware for code work), else
 *  (2) the best sub-threshold candidate (score > 0).
 * Returns null for genuinely unclassifiable tasks (intent 'unknown', no default,
 * no sub-threshold) so an empty pool / no-signal task honestly yields no skill.
 */
```

- [ ] **Step 6: Pass `projectStack` at both call sites**

Call site 1 — the candidates-empty floor (~line 714):
```typescript
    const floorId = pickSkillFloor(subThreshold, taskDNA.intent.primary, taskKind, pool, projectStack);
```
Call site 2 — the budget-cap floor (~line 750):
```typescript
      ?? pickSkillFloor(subThreshold, taskDNA.intent.primary, taskKind, pool, projectStack);
```
(`projectStack` is the `selectBestSkills` parameter already in scope at both sites.)

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx vitest run tests/core/routing-route1-precision.test.ts`
Expected: PASS — all skill-floor precision tests green + all pre-existing precision tests stay green.

- [ ] **Step 8: Type-check + routing regression**

Run: `npx tsc --noEmit && npx vitest run tests/core/routing-multisignal.test.ts tests/core/skill-routing-diversity.test.ts tests/core/skill-auto-activation.test.ts tests/core/user-surface-routing.test.ts`
Expected: no type errors; all suites green (the floor reorder only affects no-candidate-cleared cases). If a suite asserted a specific floor skill for a code task that is now the language-expert, that assertion encoded the old coincidental-floor behaviour — update it with a one-line `// ROUTE-1 floor: principled default` justification and report it.

- [ ] **Step 9: Commit**

```bash
git add src/core/routing-engine.ts tests/core/routing-route1-precision.test.ts
git commit -m "$(cat <<'EOF'
fix(routing): ROUTE-1 skill-floor precision — principled-default-first + stack-aware

Empty-skill floor now resolves the kind/intent principled default before the
best sub-threshold candidate, and the code default is stack-aware (project
language → language-expert). Fixes the live dogfood symptom where every code
task got documentation-writer/testing-expert instead of the language expert.
Lossless: refactor/doc tasks activate their skill and never reach the floor.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

**Spec coverage:** A1 (reorder principled-first) → Steps 5; A2 (stack-aware code default + `LANGUAGE_EXPERT_SKILL` + thread `projectStack`) → Steps 3,4,6; lossless/honest-empty → Step 1 tests + Step 8; live re-plan proof → done by the controller after merge (re-run `deckent plan` on sprint-290). ✅

**Placeholder scan:** every step shows complete code; no TBD/vague steps. ✅

**Type consistency:** `pickSkillFloor(..., projectStack?)` signature matches both call sites (Step 6); `resolvePrincipledDefault(intent, taskKind, projectStack, pool)` matches its single caller; `LANGUAGE_EXPERT_SKILL` keyed by `TechStackKind` (verified values: typescript/javascript/python exist as built-in experts); `normalizeTechStack` import matches `work-model.ts:262`. ✅

**Note:** The HONEST-EMPTY test uses a pool with only `graphql-expert` (no code/doc default present) so `resolvePrincipledDefault` returns null even though the task is unknown-intent — confirming `[]`. For `code-development`-kind unknown-intent tasks where `code-simplifier` IS in the pool, the `intent !== 'unknown'` guard in `pickSkillFloor` skips the principled default, so those also fall through to sub-threshold/`[]` — contract preserved.
