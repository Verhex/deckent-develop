# Audit: src/core/condition-evaluator.ts

**Sprint:** 186 (pilot 50-task per-file audit)
**Audit Task:** 186-034
**Date:** 2026-05-21
**File LoC:** 161
**Module type:** leaf utility (zero internal imports)

---

## 1. Inventory

| Field | Value |
|-------|-------|
| Path | `src/core/condition-evaluator.ts` |
| LoC | 161 (incl. comments + blank lines) |
| Exports (public) | `resolvePath(obj, path)`, `evaluateCondition(data, condition)` |
| Internal helpers | `matchValue(actual, expected)`, `evaluateOperators(actual, ops)` |
| Imports | **None** — pure leaf module, depends only on stdlib (`Object.entries`, `Array.isArray`, `JSON.stringify`) |
| Side effects | None — pure functions, no I/O, no state |

### Reverse Dependencies (direct importers)
| Importer | Symbol used | Purpose |
|----------|-------------|---------|
| `src/core/activation-engine.ts:7` | `evaluateCondition` | Layer 2 activation rule + exclusion matching (lines 82, 95) |
| `src/core/index.ts:35` | `evaluateCondition`, `resolvePath` | Public re-export from core barrel |
| `tests/core/condition-evaluator.test.ts` | both | Unit tests (183 LoC test suite) |

> **Note:** `src/orchestra/managed-docs/template-renderer.ts` defines its own `resolvePath` (line 95) — a **separate, parallel implementation** with different semantics (Map support, nested template scope). NOT a consumer of this module. See §7.

> **Note:** `src/cli/commands/test-run.ts:3` imports `resolve as resolvePath` from `node:path` — name collision, unrelated.

### Symbol Surface
- `resolvePath(obj: unknown, path: string): unknown` — dot-path resolver
- `evaluateCondition(data: Record<string, unknown>, condition: Record<string, unknown>): boolean` — top-level AND-condition evaluator with `$and`/`$or` recursion

---

## 2. Baglam (Architectural Context)

### Role in Routing Pipeline
This module is the **path-based predicate engine** powering the Layer 2 of the 3-layer routing architecture (intent classifier → activation engine → routing engine). It is consumed exclusively by `activation-engine.ts` to evaluate structured rules of the form:

```json
{
  "when": { "intent.primary": "security", "files.touched": { "$gt": 3 } }
}
```

### Supported Operators
| Operator | Semantic |
|----------|----------|
| (none) | Exact equality (`===` for primitive, `JSON.stringify` deep for objects/arrays) |
| `$gt`, `$gte`, `$lt`, `$lte` | Numeric comparison (returns `false` if non-numeric) |
| `$contains` | Array membership (with `{name}` object support) OR substring for string |
| `$in` | Membership in operand array |
| `$not` | Inequality |
| `$exists` | Defined/undefined check (boolean operand) |
| `$and`, `$or` | Logical composition (recursive) |

### TaskDNA Integration
`evaluateCondition` is fed `TaskDNA` records (from `routing-types.ts`): structured task signatures with nested fields like `intent.primary`, `scope.directories[]`, `effort`, `tagsContain[]`. The path-based engine lets activation manifests (`.deckent/agents/<id>/agent.json` `when`/`exclude` blocks) declare structural conditions without programmatic predicates.

### ADR Alignment
- **ADR-028 (Decision-Engine V1 → V2 Routing Migration)** — V2 routing uses structured `when`/`exclude` rules evaluated by this module. Module is V2-era infrastructure (originally added per ADR-028).
- **ADR-001 / ADR-002 (TypeScript ESM + Node16 resolution)** — `.js` extension on import path in consumers (`condition-evaluator.js`), strict TS, ESM exports.

---

## 3. Debt Risk

| Risk | Severity | Evidence | Mitigation |
|------|----------|----------|------------|
| Deep equality via `JSON.stringify` is fragile (key order, `undefined` properties, circular refs throw) | MEDIUM | Lines 86, 91 — `JSON.stringify(actual) === JSON.stringify(expected)` | Replace with structural equality helper or `lodash.isEqual` (avoided by ADR-010 minimal-dep policy → implement local recursive `deepEqual`) |
| `$contains` array branch silently coerces objects with `name` field — undocumented in JSDoc | LOW | Lines 124–129 — `'name' in item` special-case | Document the convention in header JSDoc; consider explicit `$containsByName` to remove magic |
| Unknown operator returns `false` (silent) — typo-prone (`$Gt` vs `$gt`) | MEDIUM | Lines 154–156 — `default: return false` | Add debug warn when `$`-prefixed key is unknown (opt-in via env flag) to surface manifest typos at runtime |
| Type-narrowing via `as Record<string, unknown>` on `$and`/`$or` array items — runtime non-object input silently becomes `{}` then matches everything | LOW-MEDIUM | Lines 49, 57 — cast without guard | Add `typeof sub === 'object' && sub !== null && !Array.isArray(sub)` guard before recursion |
| `evaluateCondition` requires top-level `data` to be `Record<string, unknown>` — passing array or primitive would type-error at call site; no runtime defense | LOW | Line 41 — typed param | Acceptable: caller (`activation-engine`) constructs `dnaData` deterministically |
| Duplicate `resolvePath` implementation exists in `template-renderer.ts` (different semantics) | MEDIUM | Cross-module grep | Either unify (extract shared `resolvePath` with Map+plain-object handling) OR document divergence with rationale comment in both files |

**Net debt:** LOW-MEDIUM. Module is small, pure, fully tested; semantic gaps (deep equality + silent unknown-op) are the primary tech debt vectors.

---

## 4. Dead Code Candidates

Grep evidence:

```
grep -rn "evaluateCondition\|resolvePath" src/
→ src/core/condition-evaluator.ts       (definition)
→ src/core/activation-engine.ts         (consumer — 2 callsites)
→ src/core/index.ts                     (re-export)
→ src/cli/commands/test-run.ts          (UNRELATED — node:path alias)
→ src/orchestra/managed-docs/template-renderer.ts (PARALLEL impl, not consumer)
```

| Symbol | Status | Notes |
|--------|--------|-------|
| `resolvePath` (export) | **LIVE** | Used by `index.ts` re-export + tests; no internal in-file caller beyond `evaluateCondition` line 67 |
| `evaluateCondition` | **LIVE** | Consumed by `activation-engine.ts` lines 82, 95 |
| `matchValue` | **LIVE** | Called by `evaluateCondition` line 69 |
| `evaluateOperators` | **LIVE** | Called by `matchValue` line 83 |
| Operator `$exists` | **LIVE-but-untested in consumer** | No `when`/`exclude` manifest in `.deckent/agents/*` currently uses `$exists`; reachable only via tests. Candidate for usage audit in Sprint 188. |
| Operator `$not` | **LIVE-but-untested in consumer** | Same as `$exists` — defined, tested in unit, but no manifest consumer found. |

**Dead code:** none confirmed. Two operators (`$exists`, `$not`) are speculative — used only in tests; verify Sprint 188.

---

## 5. Documentation Gaps

| Gap | Location | Recommendation |
|-----|----------|----------------|
| JSDoc on `resolvePath` is one-line; doesn't document `null`/empty-path return semantic | Line 7–10 | Add `@returns undefined when obj is null, path is empty, or intermediate hop is non-object` |
| `evaluateCondition` JSDoc lists operators but does not specify `$contains` object-by-name behavior | Lines 24–39 | Add: `$contains` array semantics — direct includes OR `item.name === operand` match |
| No JSDoc on `matchValue` / `evaluateOperators` (private helpers) | Lines 76, 98 | Minor — internal helpers; one-line summary sufficient |
| No top-of-file module-level docstring explaining role in Layer 2 routing pipeline | Lines 1–3 | Cross-reference: `// Used by activation-engine.ts (Layer 2 of 3-layer routing per ADR-028)` |
| Operator precedence / short-circuit behavior of `$and`/`$or` not documented | Lines 46–64 | Note: `$and` short-circuits on first false, `$or` short-circuits on first true (implicit; explicit doc helps maintainers) |
| Type-error semantics (e.g., `$gt` with string operand → `false`) not documented | Lines 101–108 | Add: `Returns false when operands are not both numeric (no coercion)` |
| Unknown operator silently fails (returns false) — not documented | Lines 154–156 | Add: `Unknown $-prefixed operators return false; typos in manifests fail closed` |
| No usage example in JSDoc | Module-level | Add example block matching ADR-028 manifest excerpt |

---

## 6. ADR Compliance Check

| ADR | Status | Compliance | Evidence |
|-----|--------|-----------|----------|
| ADR-001 (TypeScript + ESM) | accepted | ✅ PASS | Strict TS, `export` keyword, no CJS; consumers import with `.js` extension |
| ADR-002 (Node16 Module Resolution) | accepted | ✅ PASS | `condition-evaluator.js` extension on import in `activation-engine.ts:7` and `index.ts:35` |
| ADR-005 (Synchronous I/O) | deprecated | N/A | Module performs no I/O |
| ADR-006 (spawnSync Security Pattern) | accepted | N/A | No subprocess spawn |
| ADR-008 (Brain Merkezi Import — Tek Yönlü) | accepted | ✅ PASS | Module is a leaf in `core/` — zero internal imports, only imported by `core/` peers + tests. No upward dependency on `orchestra/` |
| ADR-010 (Tek Runtime Dependency — commander) | accepted | ✅ PASS | No third-party deps used (no `lodash.get`, no `jsonpath`, etc.) — pure stdlib |
| ADR-028 (Decision-Engine V1 → V2 Routing Migration) | accepted | ✅ PASS | Module is foundational V2 infrastructure; structured-condition evaluation per V2 spec |
| ADR-035 (Verification Protocol Standard) | accepted | N/A | No worker/auditor channel concerns |
| ADR-037 (RBAC V1.0) | accepted | N/A | No file-scope enforcement concerns at this layer |
| ADR-041 (Agent Taxonomy — Horizontal Skills vs Vertical Agents) | accepted | ✅ PASS (indirect) | The path-based engine enables horizontal-skill manifests to declare conditions over `TaskDNA.scope.directories` without per-agent code |

**No ADR violations detected.**

---

## 7. Refactor Recommendations

### R1 — Replace `JSON.stringify` equality with structural deep-equal (PRIORITY: MEDIUM)
**Why:** Key-order sensitive, throws on circular refs, treats `undefined` ≠ missing-key correctly only in objects (not arrays).
**How:** Local recursive `deepEqual(a, b)` helper (~15 LoC), no new dependency.
**Risk if skipped:** Manifest authors writing `{ "scope": { "dirs": ["src", "tests"] } }` rules may get false negatives when actual order differs.

### R2 — Surface unknown-operator typos (PRIORITY: MEDIUM)
**Why:** Silent fail on `$Gt`/`$contians` typos is debugging-hostile.
**How:** Behind `DECKENT_DEBUG_ROUTING=1` env, emit `console.warn` for unknown `$`-prefixed key in `evaluateOperators` switch default.
**Risk if skipped:** Manifest regressions land silently.

### R3 — Unify `resolvePath` with `template-renderer.ts` (PRIORITY: LOW)
**Why:** Two implementations drift. Template-renderer version handles `Map` values + scope wrappers; this version is plain-object only. Consolidating to one shared util reduces cognitive load.
**How:** Either (a) extract `resolvePath` to `src/core/path-resolver.ts` with both behaviors via opt flag, OR (b) keep both but add explicit comment in each citing the other and the intentional divergence.
**Risk if skipped:** Future engineer adds Map support in one but not other → routing breaks for projects using Map-shaped TaskDNA extensions.

### R4 — Type-tighten `$and` / `$or` subcondition recursion (PRIORITY: LOW)
**Why:** `as Record<string, unknown>` cast bypasses guard; non-object array items become no-ops.
**How:** Add `if (typeof sub !== 'object' || sub === null || Array.isArray(sub)) return false;` before recursive call.
**Risk if skipped:** Malformed manifest (e.g., `{$and: ["not an object"]}`) appears to pass silently.

### R5 — Add module-level JSDoc with ADR-028 cross-reference (PRIORITY: LOW)
**Why:** Discoverability — new maintainer reading the file in isolation has no breadcrumb to the Layer 2 routing architecture.
**How:** 5-line header docblock; no behavior change.

### R6 — Document `$contains` object-by-name special case in public JSDoc (PRIORITY: LOW)
**Why:** Behavior is non-obvious; tests cover it but consumers reading source may miss it.
**How:** Append to `evaluateCondition` JSDoc block.

---

## 8. Sprint 188 Follow-up Items

1. **Audit `$exists` / `$not` operator manifest usage** — grep `.deckent/agents/*/agent.json` and `.deckent/skills/*/skill.json` for actual usage; if zero, consider deprecation OR add fixtures to demonstrate intended use.
2. **Implement R1 (deepEqual)** — net +15 LoC, +3 tests; high-value low-risk refactor.
3. **Implement R2 (unknown-op warning)** — gated by debug env; net +5 LoC, +1 test.
4. **Cross-module audit of `resolvePath` divergence** — bundle with `template-renderer.ts` audit (Sprint 188 candidate) to evaluate consolidation feasibility (R3).
5. **Add fuzz/property test** — verify `evaluateCondition` against randomized data + condition trees to catch silent operator-typo classes of bugs before they ship to manifests.
6. **Coverage gate** — measure current line/branch coverage of this file; target ≥95% (small surface, achievable).
7. **Consider `Result<T, ValidationError>` return for manifest-load-time condition validation** — separate concern from runtime evaluation; surface unknown operators / malformed nodes at agent-load time, not first-match time.

---

## 9. Summary

`src/core/condition-evaluator.ts` is a **clean, well-scoped leaf utility** that anchors the Layer 2 activation engine of Deckent's V2 routing pipeline (ADR-028). At 161 LoC with zero internal dependencies, it is one of the most surgically isolated modules in `core/`.

**Health:** GREEN. No ADR violations. No dead code. Two operators (`$exists`, `$not`) are speculative-only (tested but no manifest consumer found) — flagged for Sprint 188 audit, not action.

**Primary debt:** (a) `JSON.stringify`-based deep equality is fragile under key-order/circular-ref edge cases; (b) silent failure on unknown operators is debugging-hostile; (c) parallel `resolvePath` exists in `template-renderer.ts` with divergent semantics — cross-module drift risk.

**Recommended Sprint 188 action:** R1 (deepEqual) + R2 (unknown-op warning) bundled as a single low-risk refactor task (~25 LoC net + 4 tests). R3 (resolvePath unification) deferred — requires joint design with managed-docs maintainers.

**Risk-weighted priority:** LOW. Module is stable, well-tested (183 LoC test suite), and consumed by exactly one production callsite. Defer refactors until manifest authoring exposes the noted edge cases in real usage.
