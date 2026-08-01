# .deckent/agents/ Audit — 2026-05-22

**Scope:** `.deckent/agents/` — 15 builtin agents, 2 temp agents, archive  
**Source of truth for users:** `src/core/builtins/agents/` (seeded via `seedBuiltins()` in `init-steps.ts`)  
**Method:** Systematic — code cross-reference, field usage tracing, language-agnosticism audit

---

## Architecture Understanding

```
src/core/builtins/agents/    ← CANONICAL SOURCE (shipped in npm, seeded to users)
        ↓  seedBuiltins() @ deckent init
.deckent/agents/             ← RUNTIME DIRECTORY (per-project, accumulates stats)
        stats.*              ← diverges from builtins (totalUses, successRate, etc.)
        PROMPT.md            ← should be IDENTICAL to builtins
```

All fixes applied to `src/core/builtins/agents/` and synced to `.deckent/agents/`.

---

## Dead Fields in agent.json (Design Debt)

### `allowedTools` / `deniedTools` — Not used during spawn

**Root cause:** `result-collector.ts:551-553` computes allowed tools dynamically from task scope:
```typescript
const allowedTools = writeTargets.length > 0
  ? `Read,Write(${writeTargets.join(',')}),Edit(${writeTargets.join(',')}),Bash,Glob,Grep`
  : 'Read,Write,Edit,Bash,Glob,Grep';
```
The `allowedTools` array in `agent.json` is never read during spawning. It IS validated by the schema validator and IS listed in `agent-types.ts:83-84` with empty defaults.

**Impact:** Misleading to contributors and users who think they can restrict tools via agent.json.  
**Status:** Documented (no code change — removing the field would be a schema break). Future work: either implement field or deprecate it.

### `persistent` — Only used for UI display label

**Root cause:** `src/mcp/tools/agent-list.ts:29`: `if (manifest.persistent === true) return 'built-in';`  
LRU eviction is based on `source === 'builtin'`, NOT `persistent`. The field controls the display label in `deckent agent-list` output only.  
**Impact:** Low — mislabeled but not broken.

---

## Issues Found & Fixed

### 1. `ci-guardian/PROMPT.md` — TypeScript-only CI commands (CRITICAL)

**Root cause:** Hardcoded `tsc --noEmit` and `npx vitest run` throughout. A Python or Go user would receive incorrect commands, causing every CI check to fail on non-TS projects.

**Fix:** Complete rewrite with language-adaptive approach:
- Added Language Adaptation table mapping 6 language stacks to their commands
- All references to `tsc --noEmit` → "type check / lint (see table)"
- All references to `npx vitest run` → "full test suite (see table)"
- CI Baseline JSON: `tscPassed` → `lintPassed`
- Test file mapping examples now show Node.js, Go, and Python conventions
- Coverage tracking: "vitest v8" → "project's coverage tool (e.g. vitest v8, pytest-cov, go cover)"

### 2. `bug-fixer/PROMPT.md` — Minor TypeScript references

**Root cause:** Verify step and checklist had hardcoded `tsc --noEmit` and `npx vitest run`.

**Fix:** 
- `No new warnings from tsc --noEmit` → `No new warnings from type check / static analysis (e.g. tsc --noEmit, mypy, go vet, cargo check)`
- `Run the full test suite: npx vitest run` → generic with examples
- `Verification: tsc and vitest results` → `Verification: type check and test suite results`

### 3. `migration-specialist/PROMPT.md` — TS-only codemod tools and examples

**Root cause:** Codemod Tools section listed only JS/TS tools. Version matrix was TS-specific. Code examples used TypeScript syntax.

**Fix:**
- Codemod Tools: expanded to cover Python (`libcst`, `rope`), Go (`gofmt -r`, `gorename`), Rust, Java/Kotlin (`OpenRewrite`), and `comby` as language-agnostic option
- Code examples: replaced `typescript` fenced blocks with generic `//` comments
- Version matrix: generic template with TS example as annotation
- Compatibility Checks: `npm ls` → multi-language tool list

### 4. `temp-react-specialist` and `temp-react-ts-specialist` — Git-tracked project-specific temp agents

**Root cause:** Learned agents generated for the deckent-dev project were committed to git. These point to Deckent-specific paths (`src/components`, `src/pages`, `src/ui`) and have no `PROMPT.md`. They are NOT in `src/core/builtins/` so don't affect users, but pollute the OSS repo.

**Fix:**
- Added `.deckent/agents/temp-*/` to `.gitignore`
- Removed both files from git tracking via `git rm --cached`
- Files remain on disk (Brain still uses them for the active project)

---

## No Issues Found (Intentional)

| Agent | Reasoning |
|-------|-----------|
| `bug-fixer` activation rules | `intent.primary: "bugfix"` — correct, universal |
| `doc-writer` `deniedTools: ["Bash"]` | Docs agent shouldn't run shell commands — intentional |
| `security-auditor` systemPrompt | OWASP Top 10 is language-agnostic by design |
| `architect` / `architecture-planner` PROMPT.md | Already language-agnostic — principles-focused |
| `api-builder` PROMPT.md | REST conventions are language-agnostic |
| `accessibility-auditor` PROMPT.md | WCAG is language-agnostic |
| Stats divergence (builtins vs .deckent) | Expected — builtins reset to 0, .deckent accumulates per-project |

---

## Low Priority / Not Fixed (Tracked)

| Issue | Detail | Priority |
|-------|--------|----------|
| `triggerFilePatterns` TS-only | Most agents only match `*.ts/*.tsx/*.js/*.jsx`. Reduces routing confidence for Python/Go projects (keyword matching still works). | Low — routing degrades gracefully |
| `accessibility-auditor` 0 uses | Never activated in deckent-dev sprints. Likely intent `"accessibility"` rarely classified. | Post-GA investigation |
| `migration-specialist` 0 uses | Same — never activated. | Post-GA investigation |
| `allowedTools`/`deniedTools` dead | Future: either implement or formally deprecate. | Post-GA V2 |

---

## OSS Readiness — .deckent/agents/

| Check | Status |
|-------|--------|
| Language-agnostic PROMPT.md (ci-guardian) | ✅ Fixed |
| Language-agnostic PROMPT.md (bug-fixer) | ✅ Fixed |
| Language-agnostic PROMPT.md (migration-specialist) | ✅ Fixed |
| Temp project-specific agents not in OSS repo | ✅ Fixed (gitignored + untracked) |
| builtins ↔ .deckent PROMPT.md sync | ✅ Confirmed identical |
| All 15 builtins in src/core/builtins/ | ✅ Verified |
| Dead fields documented | ✅ Documented above |
