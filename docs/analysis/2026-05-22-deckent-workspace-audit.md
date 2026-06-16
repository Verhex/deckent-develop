# .deckent/workspace/ Audit — 2026-05-22

**Scope:** `.deckent/workspace/` — 4 files (BOOT.md, TOOLS.md, IDENTITY.md, WORKER-GUIDE.md)  
**Bonus scope:** `src/orchestra/prompt-god-template.ts` — critical runtime worker prompt  
**Method:** Systematic — content accuracy, OSS readiness, language-agnosticism, cross-file consistency

---

## Architecture Understanding

```
src/cli/commands/init-templates.ts    ← generateBootContent(lang), generateToolsContent(root)
        ↓  deckent init
.deckent/workspace/                   ← seeded runtime docs (per-project)
        BOOT.md                       ← sprint lifecycle + recovery chain
        TOOLS.md                      ← MCP tools + CLI commands list
        IDENTITY.md                   ← project identity snapshot
        WORKER-GUIDE.md               ← worker anti-patterns reference
```

`generateBootContent(lang)` generates a clean BOOT.md at init time.
`generateToolsContent(root)` reads package.json scripts dynamically — TOOLS.md env section reflects the user's project.
The MCP Tools table in TOOLS.md is static and seeded from the template, so it must always be accurate.

---

## Issues Found & Fixed

### 1. `BOOT.md` — Structural Corruption (CRITICAL)

**Root cause:** Manual edits to the recovery chain section left the file in a broken state:
- Boot Sequence section (steps 1-7) is correct
- Immediately after step 7, an orphaned fragment starts without a code block opening:
  ```
  # Step 1: Kill active workers
  deckent kill --all
  ...
  ```
  followed by a closing ``` that has no matching opening
- Then `## Manual Recovery Chain` + `## Sprint Stuck / Manual Recovery` — two consecutive H2 headers with identical content (duplication)
- Sprint-specific references:
  - `{ taskId: "166-NNN" }` — internal sprint 166 task ID
  - `_Sprint 165 proven recovery chain — verified 2026-05-12._` — internal project note

**Fix:** Complete rewrite — Boot Sequence (7 steps) + single Manual Recovery Chain section with clean bash code block + generic `{ taskId: "<task-id>" }` parameter. Sprint-specific notes removed.

### 2. `TOOLS.md` — Wrong MCP Tool Names (CRITICAL)

**Root cause:** TOOLS.md was not updated when MCP tool names changed:

| Listed (Wrong) | Actual | Registered in |
|----------------|--------|---------------|
| `deckent_directives` | `deckent_set_directives` | `src/mcp/tools/set-directives.ts` |
| `deckent_analyze` | `deckent_analyze_project` | `src/mcp/tools/analyze-project.ts` |
| `deckent_nervous` (1 tool) | `deckent_nervous_subscribe`, `deckent_nervous_accept`, `deckent_nervous_reject`, `deckent_nervous_status`, `deckent_nervous_config` (5 tools) | `src/mcp/tools/nervous.ts` |

**Tool count:** 27 listed → actual 31 (27 − 1 `deckent_nervous` + 5 nervous sub-tools = 31)

**Fix:**
- `deckent_directives` → `deckent_set_directives`
- `deckent_analyze` → `deckent_analyze_project`
- `deckent_nervous` → split into 5 rows: subscribe, accept, reject, status, config
- Total count: 27 → 31
- Key tools note: removed `deckent_nervous` reference, added `deckent_nervous_status`

### 3. `IDENTITY.md` — Wrong Runtime Version + Stat Inconsistencies

**Root cause:** Multiple stale/incorrect values accumulated over sprints:

| Field | Was | Now | Evidence |
|-------|-----|-----|----------|
| `Runtime` | `Node.js >=18` | `Node.js >=24.0.0` | `package.json` → `engines.node: ">=24.0.0"` |
| `Sprints` (header) | `172+ (active)` | `186+ (active)` | Current sprint: 186 |
| `CLI Commands` (header) | `46+` | `55+` | TOOLS.md: 55 CLI command modules |
| `Agents` (header + table) | `15 built-in + 2 custom` | `15 built-in` | temp agents removed from git (agents audit) |
| `Sprint` (Project Status table) | `sprint-173` | `sprint-186` | Current sprint |
| `MCP Tools` (Project Status table) | `27` | `31` | TOOLS.md fix above |

Note: `CLI Commands: 46+` in header vs `55+` in table — both corrected to `55+`.

### 4. `WORKER-GUIDE.md` — Internal Reference Language

**Root cause:** `npm run build` anti-pattern row contained `Alperen kararı` — an internal project reference that would confuse OSS users.

**Fix:** Replaced with generic reason: `dist/ contamination risk — build is a separate gate, not worker responsibility`

### 5. `src/orchestra/prompt-god-template.ts` — Hardcoded TypeScript Commands in Worker Prompt (CRITICAL)

**Root cause:** `renderTemplate()` function (lines 589-598) injects CRITICAL VERIFY STEPS into every worker prompt for every user project, with hardcoded TypeScript-specific commands:

```typescript
1. `tsc --noEmit` — fix ALL type errors (max 3 attempts)
2. `npx vitest run` — fix ALL test failures (max 3 attempts)
```

A Python, Go, or Rust user would receive a worker prompt telling them to run TypeScript commands that don't exist in their project. This would cause every worker to fail with "command not found" errors.

**Fix:** Replaced with language-agnostic instructions that reference the project's TOOLS.md and provide per-language examples:

```
1. **Type check / static analysis** — fix ALL errors (max 3 attempts)
   Examples: `tsc --noEmit` (TypeScript), `mypy` (Python), `go vet ./...` (Go), `cargo check` (Rust)
2. **Full test suite** — fix ALL failures (max 3 attempts)
   Examples: `npx vitest run` / `jest` (Node.js), `pytest` (Python), `go test ./...` (Go), `cargo test` (Rust)
```

This is consistent with the ci-testing/SKILL.md Language Adaptation table fix applied in the skills audit.

---

## No Issues Found (Intentional)

| File | Reasoning |
|------|-----------|
| `WORKER-GUIDE.md` content | RBAC matrix, honest-result gate, processQueue stall — all generic |
| `TOOLS.md` env section | `generateToolsContent(root)` reads user project's package.json at init time — shows their commands |
| `TOOLS.md` CLI commands table | Accurate — all 55 entries match src/cli/commands/ |
| `IDENTITY.md` Features list | Sprint history is intentional; this is a project snapshot doc, not user-facing |

---

## OSS Readiness — .deckent/workspace/

| Check | Status |
|-------|--------|
| `BOOT.md` structural corruption fixed | ✅ Fixed |
| `BOOT.md` sprint-specific refs removed | ✅ Fixed |
| `TOOLS.md` wrong MCP names corrected | ✅ Fixed |
| `TOOLS.md` MCP count 27→31 | ✅ Fixed |
| `TOOLS.md` nervous 1→5 tools | ✅ Fixed |
| `IDENTITY.md` Node.js >=18→>=24.0.0 | ✅ Fixed |
| `IDENTITY.md` stat inconsistencies | ✅ Fixed |
| `WORKER-GUIDE.md` internal reference removed | ✅ Fixed |
| `prompt-god-template.ts` TS-only verify steps | ✅ Fixed |

---

## Design Debt (Tracked, Not Fixed)

| Issue | Detail |
|-------|--------|
| `IDENTITY.md` is partially AUTOGEN | `identity-tests` and `identity-summary` blocks have AUTOGEN markers but sprint number and features list are manual — may drift again. Post-GA: wire sprint number to auto-update hook. |
| `TOOLS.md` MCP section is static | If new MCP tools are added without updating TOOLS.md, count will drift again. Post-GA: `npm run docs:ref` should regenerate this table. |
| `WORKER-GUIDE.md` canonical location note | File says "See docs/guide/workers.md" as canonical — verify that file exists and is kept in sync. |
