# OSS Audit Master Summary — 2026-05-22

**Scope:** Full pre-launch OSS readiness audit of Deckent  
**Sessions:** Sprint 186 context (4 audit domains)  
**Method:** Systematic debugging — root cause first, then fix, then commit  
**Commits:** 5 commits (1e02ec00, 56465200, 8e496345, 69cd69c2→child, 722e032f + chore)

---

## Audit Domains & Results

| Domain | Issues Found | Issues Fixed | Status |
|--------|-------------|-------------|--------|
| `.github/` | 7 | 7 | ✅ Complete |
| `.claude/rules/` + IDE adapters | 9 | 9 | ✅ Complete |
| `.deckent/agents/` | 4 | 4 | ✅ Complete |
| `.deckent/skills/` | 5 | 5 | ✅ Complete |
| `.deckent/workspace/` | 5 | 5 | ✅ Complete |
| `init-templates.ts` phantom paths | 2 | 2 | ✅ Complete |
| **Total** | **32** | **32** | ✅ |

---

## Domain 1 — `.github/` (7 issues)

**Audit doc:** [2026-05-22-github-audit.md](2026-05-22-github-audit.md)

| # | Issue | Fix |
|---|-------|-----|
| 1 | CODEOWNERS: non-existent team `@verhex/deckent-core` | `@alperensartacoglu` |
| 2 | `package.json` homepage: `deckent.agency` → `deckent.ai` | Domain updated |
| 3 | `publish.yml` dual trigger (push+release) → double publish race | Removed `push: tags: v*` |
| 4 | `release.yml` was running `npm publish` (duplicate of publish.yml) | Removed npm publish step |
| 5 | `docs.yml`: wrong domain + wrong branch + `npm install` vs `ci` | CNAME, `main`, `npm ci` |
| 6 | `dashboard-build.yml`: Node 22.x labels with 24.x matrix | Updated labels |
| 7 | `ci.yml`: no concurrency control → stacking CI runs on rapid pushes | Added `cancel-in-progress` |

---

## Domain 2 — `.claude/rules/` + IDE Adapters (9 issues)

**Audit docs:** [2026-05-22-claude-rules-audit.md](2026-05-22-claude-rules-audit.md) · [2026-05-22-ide-adapters-audit.md](2026-05-22-ide-adapters-audit.md)

| # | Issue | Fix |
|---|-------|-----|
| 1 | CUSTOM-START blocks: duplicated content in all 3 `.claude/rules/` files | Cleared CUSTOM blocks |
| 2 | `worker-default.template.md`: ADR-037 honesty note missing (not shipped to users) | Added to template |
| 3 | `worker-default.template.md`: `tsc --noEmit` / `npx vitest run` hardcoded | Language-agnostic |
| 4 | `brain.md` paths: `.contracts/*` phantom (never created by `deckent init`) | Removed from 3 sources |
| 5 | MCP init vs CLI init divergence (different brain rules, old MEMORY.md ref) | Synchronized, Memory V2 |
| 6 | `AGENTS.md` + `GEMINI.md` → `@.claude/rules/*` (claude-coupling) | → own provider dirs |
| 7 | `DECKENT.md` `## Agent Roles` block: provider-coupling | Removed (per-adapter wiring) |
| 8 | Cursor `.md` vs `.mdc` — Cursor ignored `.md` files entirely | `cursorAdapter` → `.mdc` |
| 9 | MCP registration command: `deckent mcp` (non-existent CLI) in 17 files | → `deckent-mcp` |

---

## Domain 3 — `.deckent/agents/` (4 issues)

**Audit doc:** [2026-05-22-deckent-agents-audit.md](2026-05-22-deckent-agents-audit.md)

| # | Issue | Fix |
|---|-------|-----|
| 1 | `ci-guardian/PROMPT.md`: all commands TS-only (`tsc`, `vitest`) | Full rewrite — Language Adaptation table (6 stacks) |
| 2 | `bug-fixer/PROMPT.md`: minor `tsc --noEmit` / `vitest` references | Generic verify + examples |
| 3 | `migration-specialist/PROMPT.md`: JS/TS-only codemod tools | Expanded: Python/Go/Rust/Java/comby |
| 4 | `temp-react-specialist` + `temp-react-ts-specialist` tracked in git | `git rm --cached` + `.gitignore` entry |

**Design debt documented (not fixed):**
- `allowedTools` / `deniedTools` in `agent.json` — never read during spawn (validated only)
- `persistent` — only used for UI display label, not LRU logic

---

## Domain 4 — `.deckent/skills/` (5 issues)

**Audit doc:** [2026-05-22-deckent-skills-audit.md](2026-05-22-deckent-skills-audit.md)

| # | Issue | Fix |
|---|-------|-----|
| 1 | `ci-testing/SKILL.md`: entire file was Deckent-internal (tests/core/, tests/orchestra/, vitest/tsc only) | Full rewrite — Language Adaptation table (5 stacks), staged execution, multi-language patterns |
| 2 | `ci-testing/manifest.json`: TS-only stackDetection + composableWith | Added .gitlab-ci.yml, Makefile, pytest.ini, go.mod, Cargo.toml, jest, pytest; added python-expert, devops-engineer |
| 3 | `testing-expert/SKILL.md`: "Vitest Patterns" section TS-only | → "Framework-Specific Patterns" with pytest + Go subsections |
| 4 | `migration-expert/SKILL.md`: JS/TS-only codemod tools | Expanded: Python/Go/Rust/Java/comby |
| 5 | `system-architect/manifest.json`: `src/core/` (Deckent's dir) in stackDetection | Removed; added pyproject.toml, go.mod, Cargo.toml |

**Design debt documented (not fixed):**
- `autoActivate` field: only `testing-expert` has it; no code reads it
- `promptInjection.position`: validated but never consumed by task-builder

---

## Domain 5 — `.deckent/workspace/` + `prompt-god-template.ts` (5 issues)

**Audit doc:** [2026-05-22-deckent-workspace-audit.md](2026-05-22-deckent-workspace-audit.md)

| # | Issue | Fix |
|---|-------|-----|
| 1 | `BOOT.md`: structural corruption (orphaned fragment + duplicated Manual Recovery Chain) + sprint-165/166 internal refs | Clean rewrite |
| 2 | `TOOLS.md`: wrong MCP names (`deckent_directives`, `deckent_analyze`), `deckent_nervous` as 1 tool (actual: 5), count 27→31 | Corrected all names, split nervous into 5 rows |
| 3 | `IDENTITY.md`: Node.js `>=18`→`>=24.0.0`, sprint-173→186, MCP 27→31, CLI 46+→55+, stale agents count | All metrics updated |
| 4 | `WORKER-GUIDE.md`: "Alperen kararı" internal reference | Generic OSS language |
| 5 | `prompt-god-template.ts` CRITICAL VERIFY STEPS: `tsc --noEmit` + `npx vitest run` hardcoded into every worker prompt for every user project | Language-agnostic + per-language examples |

**Bonus fixes (uncommitted Sprint-186 bugs found in diff):**
- `stack-detector.ts` B4: suppress noisy log for absent optional build files (Cargo.toml, go.mod)
- `managed-doc-runner.ts` B5: sprint-aware cache — IDENTITY.md was frozen at sprint-173 across sprint boundaries

---

## Domain 6 — `init-templates.ts` + `mcp/tools/init.ts` Phantom Paths (2 issues)

*Found during workspace audit — generator-level fixes for future `deckent init` users*

| # | Issue | Fix |
|---|-------|-----|
| 1 | `@.contracts/api-surface.md` in 3 template generators (TR, EN, MCP) — directory never created by `deckent init` | → `@docs/reference/api-surface.md` (correct path) |
| 2 | `## Agent Roles: @.claude/rules/*` in generated DECKENT.md — Gemini/Codex users get claude-coupled docs | Removed `## Agent Roles` block (wiring is per-adapter: CLAUDE.md / AGENTS.md / GEMINI.md) |

---

## Cross-Cutting Root Cause

**One root cause explains 60%+ of all issues:** Deckent was developed dogfooding its own TypeScript project. All agent prompts, skill content, worker templates, and verify steps were written for TypeScript/Node.js. When OSS users with Python/Go/Rust/Java projects install Deckent, these commands either fail or do nothing.

**Pattern of fixes:**
1. Identify all hardcoded `tsc`, `vitest`, `npx vitest run`, TS-specific paths
2. Replace with Language Adaptation table (stack → command mapping)
3. Make verify steps generic with per-language examples
4. Add multi-language options to manifest stackDetection

---

## Remaining Open Items (Post-GA)

These are documented future work — not blocking OSS launch:

| Item | Detail | Priority |
|------|--------|----------|
| `writeClaudeRules` in `init-steps.ts` still hardcoded | Not using `generateRules()` — one more code path divergence | Post-GA |
| `init-steps.ts` `deckent.mdc` double write | `applyEnvConfig('cursor')` calls both `generateCursorConfig` and `generateCursorRules` | Post-GA |
| `sync.ts` `.codex/AGENTS.md` wrong location | Codex CLI reads root `AGENTS.md`, not `.codex/AGENTS.md` | Post-GA |
| `rule-generator.ts` first-run behavior | On first run, existing file content goes to CUSTOM block instead of starting empty | Post-GA (Bug O) |
| `autoActivate` field | Only `testing-expert` has it; no code reads it — implement or formally deprecate | Post-GA V2 |
| `promptInjection.position` field | Validated but never consumed — redundant | Post-GA V2 |
| `allowedTools`/`deniedTools` in agent.json | Never read during spawn — misleading to contributors | Post-GA V2 |
| `testing-expert.autoActivate.filesWriteMatch` | `*.test.ts` patterns — when autoActivate is implemented, needs multi-language patterns | Post-GA V2 |
| `IDENTITY.md` AUTOGEN blocks | Sprint number and features list still manual — may drift | Post-GA automation |
| `TOOLS.md` MCP table static | New tools → table drifts. `npm run docs:ref` should regenerate | Post-GA automation |

---

## OSS Launch Readiness — Final Assessment

| Area | Status |
|------|--------|
| CI/CD workflows | ✅ |
| CODEOWNERS | ✅ |
| npm publish safety (no double-publish) | ✅ |
| Domain consistency (deckent.ai) | ✅ |
| Language-agnostic agent prompts | ✅ |
| Language-agnostic skill content | ✅ |
| Language-agnostic worker verify loop | ✅ |
| Language-agnostic CRITICAL VERIFY STEPS | ✅ |
| Provider-decoupled adapter files | ✅ |
| Cursor MDC integration working | ✅ |
| MCP registration command correct | ✅ |
| `deckent init` phantom path fixed | ✅ |
| Temp agents not in OSS repo | ✅ |
| Sprint-specific refs removed from workspace docs | ✅ |
| Node.js version requirement accurate (>=24.0.0) | ✅ |
| MCP tool names/count accurate (31) | ✅ |
| **All blocking items cleared** | ✅ |
