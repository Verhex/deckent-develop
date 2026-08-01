# ROUTE-1 follow-up — skill-floor precision (principled-default-first + stack-aware)

- **Date:** 2026-06-18
- **Arc:** ARC-E (Orchestration Intelligence) — ROUTE-1 skill-side follow-up
- **Status:** design approved (Approach A) → writing-plans next
- **Scope class:** Tier-0 (internal core logic — `src/core/routing-engine.ts`) → unit-test-sufficient + live re-plan proof
- **Origin:** Live autonomous dogfood (sprint-290 plan, 2026-06-18). ROUTE-1's agent routing verified working (no api-builder hijack), but **every** code task got `assignedSkills: [documentation-writer]` (or `testing-expert` in isolation) instead of `typescript-expert`/`code-simplifier`.

## 1. Problem (live evidence)

`deckent plan` on a 6-task sprint routed agents correctly (refactorer/bug-fixer/doc-writer, none to api-builder) but assigned `documentation-writer` to **all** tasks — including `implementation`/`bugfix` code tasks. Root cause traced in `src/core/routing-engine.ts`:

1. **Built-in skill activation rules are narrow.** `typescript-expert` fires only on `domains.$contains('typescript')` (not `implementation` intent); `code-simplifier` only on `intent=refactor` or `domains.$contains('simplification')`; `documentation-writer` only on `intent=documentation`. A generic `implementation`-intent task in `src/orchestra/` (domains=[orchestra]) matches **no** skill activation rule → every candidate scores below `skillMinScore (3)` → ROUTE-1's B4 empty-skill **floor** runs.
2. **Floor tier ordering is backwards.** `pickSkillFloor` returns the best **sub-threshold** candidate (tier-1) *before* the **kind/intent principled default** (tier-2). A code task's coincidental sub-threshold skill (`testing-expert` via the `test-coverage` tag, or `documentation-writer`) thus overrides the correct kind-default `KIND_DEFAULT_SKILL['code-development'] = 'typescript-expert'`.
3. **Code-default is hardcoded TS.** `KIND_DEFAULT_SKILL['code-development'] = 'typescript-expert'` is wrong for a non-TypeScript user project (dual-perspective gap).

Net: code tasks get a coincidental/doc skill instead of the language/refactor expert. ROUTE-1's unit tests missed this because their hermetic 3-skill pools did not include `documentation-writer`/`testing-expert` competing in the floor.

## 2. Design — Approach A (principled-default-first + stack-aware)

Two surgical changes in `src/core/routing-engine.ts`, both inside the floor path. No change to the scoring of tasks whose skills already clear the threshold.

### A1 — Reorder `pickSkillFloor`: principled default first, sub-threshold fallback

The kind/intent-appropriate default is a *stronger* signal than a coincidentally-bonused sub-threshold skill. Resolve the principled default first; fall back to the best sub-threshold candidate only when no principled default exists; preserve the `unknown`-intent honest-empty contract.

```
pickSkillFloor(subThreshold, intent, taskKind, pool, projectStack):
  principled = resolvePrincipledDefault(intent, taskKind, projectStack, pool)   // A2
  if principled: return principled
  if subThreshold non-empty: return best-scoring sub-threshold id
  return null   // unknown / no signal → honest []
```

### A2 — Stack-aware code-development default

`resolvePrincipledDefault` keeps the existing `INTENT_DEFAULT_SKILL`/`KIND_DEFAULT_SKILL` lookups but, for the **code-development** kind (and `implementation`/`bugfix` intents), resolves the **project-stack language expert** instead of a hardcoded `typescript-expert`:

- `projectStack.language` → language-expert skill id via a small map (`typescript → typescript-expert`, `python → python-expert`, …), gated by `pool.has(id)`.
- Fallbacks (in order): the stack language-expert → `typescript-expert` (if present) → `code-simplifier` (if present) → existing `KIND_DEFAULT_SKILL`/`INTENT_DEFAULT_SKILL`.
- `refactor` intent/kind keeps `code-simplifier` (unchanged); `documentation` → `documentation-writer`; `audit` → existing default.

`projectStack` is already available in `selectBestSkills` (its `projectStack` param) — thread it into the `pickSkillFloor` call. When `projectStack` is null (no detection), fall back to `typescript-expert`/`code-simplifier` (current behaviour, deckent is TS).

## 3. Lossless / constraints

- **Refactor tasks unaffected:** `code-simplifier` activates on `intent=refactor` (score 8 ≥ threshold) → it is a real candidate, never reaches the floor.
- **Doc tasks unaffected:** `documentation-writer` activates on `intent=documentation` (score 10) → real candidate.
- **Only the floor path changes** — tasks with any skill clearing `skillMinScore` are byte-for-byte unchanged.
- **unknown-intent honest-[]** preserved (principled default is null for unknown, sub-threshold empty → null).
- **i18n:** internal logic, no user-facing strings. **ADR-070:** the language-expert map is a named, documented constant. **Dual-perspective:** stack-aware default fixes user (non-TS) projects too.

## 4. Test & proof (TDD)

1. **Regression (the symptom):** an `implementation`-intent code task in `src/orchestra/` with the live-style skill pool (incl. documentation-writer + testing-expert) + a TS `projectStack` → `skillIds` includes `typescript-expert`, and does **NOT** equal `[documentation-writer]`/`[testing-expert]`.
2. **Lossless:** a `refactor` task → `code-simplifier` (via activation, unchanged); a `documentation` task → `documentation-writer`.
3. **Stack-aware (product):** an `implementation` task with a `python` projectStack + a pool containing `python-expert` → `python-expert` (not typescript-expert).
4. **Honest-empty:** `unknown` intent, no sub-threshold, no principled default → `[]`.
5. **Live proof:** re-run `deckent plan --structured` on sprint-290 → code tasks (slice2/F3-008/TOK-AUT/ADR-NOISE/IDLE-SPIN) carry `typescript-expert`/`code-simplifier`, DOC-35 carries `documentation-writer`. Ground-truth, not just unit tests (feedback_trust_brain_eval_not_worker).

## 5. Non-goals (deferred)

- **Broadening skill activation rules** (e.g. `typescript-expert` firing on `implementation` intent) — Approach B; deferred. This fix corrects the floor default so the dogfood symptom is resolved without touching skill manifests.
- **Agent-side routing** — already fixed (ROUTE-1 main).

## 6. Files

`src/core/routing-engine.ts` — `pickSkillFloor` (reorder + new `projectStack` param + `resolvePrincipledDefault` helper + `LANGUAGE_EXPERT_SKILL` map), and the single `pickSkillFloor(...)` call site in `selectBestSkills` (pass `projectStack`). Test: `tests/core/routing-route1-precision.test.ts` (extend).
