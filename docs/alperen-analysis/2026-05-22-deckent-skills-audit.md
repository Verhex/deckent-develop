# .deckent/skills/ Audit — 2026-05-22

**Scope:** `.deckent/skills/` — 21 builtin skills  
**Source of truth for users:** `src/core/builtins/skills/` (seeded via `seedBuiltins()`)  
**Method:** Systematic — field usage tracing, SKILL.md language-agnosticism, manifest consistency

---

## Architecture Understanding

```
src/core/builtins/skills/    ← CANONICAL SOURCE (shipped in npm, seeded to users)
        ↓  seedBuiltins() @ deckent init
.deckent/skills/             ← RUNTIME DIRECTORY (per-project, accumulates stats)
        stats.*              ← diverges from builtins (totalUses, successRate, etc.)
        SKILL.md             ← should be IDENTICAL to builtins
        manifest.json        ← should be IDENTICAL to builtins (except stats)
```

**Pre-audit verification:** ALL SKILL.md files and manifest.json files (stats excluded) confirmed identical between `src/core/builtins/skills/` and `.deckent/skills/`. Fixes applied to builtins, synced to .deckent.

---

## Field Usage Analysis

| Field | Code Usage | Status |
|-------|-----------|--------|
| `stackDetection.files` | `skill-selector.ts:102` — checks against project files | ✅ Active |
| `stackDetection.dependencies` | `skill-selector.ts:97` — checks package deps | ✅ Active |
| `composableWith` | `skill-selector.ts:170-187` — conflict detection | ✅ Active |
| `triggers` | `skill-registry.ts:59` — search/matching | ✅ Active |
| `activation.rules` | routing-engine, activation-engine | ✅ Active |
| `promptInjection.position` | Validated only; never consumed by task-builder | ⚠️ Dead |
| `promptInjection.maxTokens` | Global routing budget used instead (routing-engine.ts:498) | ⚠️ Partial |
| `autoActivate` | ONLY `testing-expert` has it; NO code reads this field | ❌ Dead |

---

## Issues Found & Fixed

### 1. `ci-testing/SKILL.md` — Deckent-specific paths + vitest-only (CRITICAL)

**Root cause:** The entire SKILL.md was written for Deckent's internal test structure:
- Hardcoded stage paths: `tests/core/`, `tests/orchestra/`, `tests/cli/` — Deckent's directories
- All commands: `npx vitest run`, `tsc --noEmit` — TypeScript only
- Coverage config: vitest v8 with `src/dashboard/**` exclusion — Deckent-specific
- vitest failure analysis section: ESM `.js` imports, `vi.mock()` hoisting — TS-specific

A Python, Go, or Java user installing Deckent would receive a skill that tells them to run non-existent TypeScript commands against Deckent's internal test structure.

**Fix:** Complete rewrite with:
- Language Adaptation table (5 stacks: TS/Node, Python, Go, Rust, Java/Gradle)
- Staged execution mapped to generic module structure (foundation → business logic → interface → full)
- Test file mapping examples for all 3 major conventions (Node, Python, Go)
- Regression detection with multi-language baseline commands
- Framework-specific sections: Vitest/Jest, pytest, Go testing
- Pre-commit checklist: language-agnostic

### 2. `ci-testing/manifest.json` — TS-only stackDetection + composableWith

**Root cause:** `stackDetection` only detected TypeScript/vitest projects; `composableWith` only referenced TS skills.

**Fix:**
- `stackDetection.files`: added `.gitlab-ci.yml`, `Makefile`, `pytest.ini`, `pyproject.toml`, `go.mod`, `Cargo.toml`
- `stackDetection.dependencies`: added `jest`, `pytest`
- `stackDetection.commands`: removed `tsc`, `vitest` (these are stack-specific, not universal)
- `composableWith`: added `python-expert`, `devops-engineer`

### 3. `testing-expert/SKILL.md` — "Vitest Patterns" section TS-only

**Root cause:** Section title and content were Vitest/TypeScript specific. A Go or Python user would receive Vitest-specific mocking patterns that don't apply.

**Fix:** Renamed section to "Framework-Specific Patterns" and added three subsections:
- Vitest / Jest (TypeScript / Node.js)
- pytest (Python)
- Go testing

### 4. `migration-expert/SKILL.md` — JS/TS-only codemod tools

**Root cause:** "Codemod Tools" section listed only `jscodeshift` and `ts-morph`.

**Fix:** Expanded to multi-language:
- JS/TS: jscodeshift, ts-morph
- Python: libcst, rope, 2to3
- Go: gofmt -r, gorename, go/ast scripts
- Rust: sed/awk + compiler guidance
- Java/Kotlin: OpenRewrite, IntelliJ structural search
- General: `comby` (language-agnostic)

### 5. `system-architect/manifest.json` — Deckent-specific `src/core/` in stackDetection

**Root cause:** `stackDetection.files` contained `"src/core/"` — Deckent's own internal module path. This would only activate system-architect when the user's project coincidentally has a `src/core/` directory.

**Fix:** Removed `src/core/`. Replaced with language-neutral build manifest files: `pyproject.toml`, `go.mod`, `Cargo.toml` (alongside existing `tsconfig.json`).

---

## No Issues Found (Intentional)

| Skill | Reasoning |
|-------|-----------|
| `typescript-expert`, `react-specialist`, `python-expert`, `graphql-expert` | Language/framework-specific by design — correct |
| `security-specialist` SKILL.md | OWASP Top 10 is language-agnostic |
| `system-architect` SKILL.md | Architecture patterns are language-agnostic |
| `documentation-writer` SKILL.md | Writing principles are language-agnostic |
| `performance-optimizer` SKILL.md | Big-O, caching, profiling — mostly generic; Node.js examples labelled as such |
| `git-expert` SKILL.md | Git is language-agnostic |
| `docker-expert` SKILL.md | Docker is language-agnostic |
| `database-migration` SKILL.md | SQL patterns are language-agnostic |
| Stats divergence (builtins vs .deckent) | Expected — builtins reset to 0, .deckent accumulates per-project |

---

## 0-Use Skills: Root Cause Analysis

| Skill | Uses | Activation Rule | Assessment |
|-------|------|----------------|------------|
| `accessibility-expert` | 0 | `domains.$contains: "accessibility"` | Correct for user projects; Deckent rarely has a11y tasks |
| `graphql-expert` | 0 | `domains.$contains: "graphql"` | Correct for user projects; Deckent has no GraphQL |
| `migration-expert` | 0 | `intent.primary: "migration"` | `migration` intent rarely classified — activation gap |
| `python-expert` | 0 | `domains.$contains: "python"` | Correct; Deckent is TypeScript |

These 0-use skills are correct in design — they simply don't match Deckent's own codebase. They WILL activate on user projects with matching stacks.

`migration-expert`'s `intent.primary: "migration"` may need an additional trigger: adding `domains.$contains: "migration"` would improve recall. Post-GA item.

---

## Design Debt (Tracked, Not Fixed)

| Issue | Detail |
|-------|--------|
| `autoActivate` dead field | Only `testing-expert` has it; `scopeMatch`/`filesWriteMatch` never read in code. Future: implement or remove. |
| `promptInjection.position` dead | Validated in skill-pool but never consumed by task-builder. All skills use `"prepend"` anyway. |
| `promptInjection.maxTokens` partial | Global routing budget overrides per-skill value. Field is redundant but harmless. |
| `testing-expert.autoActivate.filesWriteMatch` | `*.test.ts/*.spec.ts/*.test.tsx` patterns — TS-only. When autoActivate is implemented, this needs multi-language patterns. |

---

## OSS Readiness — .deckent/skills/

| Check | Status |
|-------|--------|
| `ci-testing/SKILL.md` language-agnostic | ✅ Fixed |
| `ci-testing/manifest.json` multi-stack | ✅ Fixed |
| `testing-expert/SKILL.md` multi-framework | ✅ Fixed |
| `migration-expert/SKILL.md` multi-language codemods | ✅ Fixed |
| `system-architect/manifest.json` no Deckent-specific paths | ✅ Fixed |
| builtins ↔ .deckent SKILL.md + manifest sync | ✅ Confirmed identical |
| All 21 builtins present in src/core/builtins/ | ✅ Verified |
| Dead fields documented | ✅ Documented above |
