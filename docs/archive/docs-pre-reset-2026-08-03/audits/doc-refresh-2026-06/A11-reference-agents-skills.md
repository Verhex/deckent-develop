# A11 — Reference: Agents, Skills & Marketplace Audit

**Sprint:** 345 | **Task:** 345-011 | **Date:** 2026-06-28  
**Auditor:** doc-writer (w-345-011) | **Status:** COMPLETE

---

## Scope

Deep verification of:
- `docs/reference/agents.md`
- `docs/reference/skills.md`
- `docs/reference/marketplace.md`
- `docs/reference/managed-docs.md`

Against live registries:
- `.deckent/agents/*/agent.json` (agent pool)
- `.deckent/skills/*/manifest.json` (skill pool)
- `src/core/agent-pool.ts` / `src/core/skill-pool.ts` (pool loader logic)
- `src/orchestra/managed-docs/` (managed-docs implementation)
- `.deckent/docs.json` (managed docs runtime config)

---

## 1. Agents (`docs/reference/agents.md`)

### 1.1 Roster Count

| Source | Count | Notes |
|--------|-------|-------|
| `.deckent/agents/` directories | 18 | Includes `archive/` top-level dir |
| Active agents (agent.json at top level) | **17** | `archive/` skipped by `agent-pool.ts:235` |
| Documented in agents.md AUTOGEN block | **17** | "17 agents (15 built-in, 2 custom)" |
| Task description claim | 18 | Counts `archive/` dir itself (not its contents) |

**Verdict: MATCH.** The 17 active agents in the registry exactly match the 17 documented in agents.md. The task description's "18" counts the `archive/` folder as a peer directory, but `agent-pool.ts` explicitly skips it (`if (entry.name === 'archive') continue;`).

### 1.2 Documented-but-absent Agents

None. All 17 documented agents have a valid `agent.json` in `.deckent/agents/`.

### 1.3 Registered-but-undocumented Agents

None in the active pool. The `archive/` directory contains 3 historical snapshots that are correctly excluded from documentation:

| Archive entry | Agent ID | Source | Reason archived |
|---------------|----------|--------|-----------------|
| `archive/test-writer-removed-sprint-148/` | `test-writer` | builtin | Removed at sprint-148 |
| `archive/temp-react-specialist/` | `temp-react-specialist` | learned | Older snapshot superseded by active version |
| `archive/temp-react-ts-specialist/` | `temp-react-ts-specialist` | learned | Older snapshot superseded by active version |

The `test-writer` agent was a built-in that was retired; it is not documented and should not be re-added.

### 1.4 Agent-pool.ts Coverage Check

`BUILTIN_AGENT_DOMAINS` in `src/core/agent-pool.ts:78` hardcodes 15 non-temp built-in agents:

```
architect, architecture-planner, bug-fixer, code-reviewer, refactorer,
api-builder, frontend-designer, accessibility-auditor,
doc-writer, ci-guardian, security-auditor, performance-analyzer,
data-engineer, devops-engineer, migration-specialist
```

This maps exactly to the 15 "built-in" agents in the docs AUTOGEN block. ✓

`TEMP_AGENT_DOMAINS` covers `temp-react-ts-specialist`. The docs list `temp-react-specialist` and `temp-react-ts-specialist` as the 2 "custom" agents. ✓

### 1.5 Minor Issues

| Issue | Severity | Detail |
|-------|----------|--------|
| Terminology: "2 custom" vs actual source type | Low | The `temp-*` agents have `source: "learned"` in their agent.json (auto-promoted by Evolution Pipeline). The AUTOGEN label "custom" is ambiguous — "learned/temp" would be more precise, but not materially misleading. |
| `ci-guardian` explicitly declares `"type": "builtin"` in agent.json | Low | Other built-in agents omit this field. No doc impact; pool loader doesn't depend on the `type` field. |
| AUTOGEN block is marked "do not edit by hand" | Note | The header count matches reality today but will drift if agents are added/removed without running `npm run docs:ref`. |

---

## 2. Skills (`docs/reference/skills.md`)

### 2.1 Roster Count

| Source | Count | Notes |
|--------|-------|-------|
| `.deckent/skills/` directories | 22 | Includes `docs/` directory (no manifest.json) |
| Active skills (valid manifest.json) | **21** | `docs/` skipped — SkillPoolManager checks manifest existence |
| Documented in skills.md | **21** | "Deckent ships 21 built-in skills" |
| Task description claim | 22 | Counts `docs/` directory (no manifest) |

**Verdict: MATCH on count.** 21 active skills == 21 documented. The task description's "22" counts the `docs/` special directory, which has no `manifest.json` and is skipped by `SkillPoolManager.loadSkills()`.

### 2.2 Documented-but-absent Skills

None. All 21 documented skills exist in `.deckent/skills/`.

### 2.3 Registered-but-undocumented Skills

None. The `docs/` directory has no `manifest.json` and is not a skill entry.

### 2.4 Metadata Discrepancies

The skill roster IDs are fully reconciled, but **category and priority metadata in `skills.md` diverges from the actual `manifest.json` values** across most skills. The docs appear to reflect an older pre-bump state.

#### Category mismatches (9 skills)

| Skill | Docs category | Manifest category |
|-------|--------------|-------------------|
| `testing-expert` | tool | **workflow** |
| `database-migration` | tool | **domain** |
| `devops-engineer` | workflow | **tool** |
| `anthropic-sdk` | tool | **framework** |
| `code-simplifier` | domain | **workflow** |
| `frontend-design` | framework | **domain** |
| `graphql-expert` | domain | **framework** |
| `migration-expert` | domain | **workflow** |
| `monorepo-expert` | workflow | **tool** |

#### Priority mismatches (17 of 21 skills)

| Skill | Docs priority | Manifest priority |
|-------|--------------|-------------------|
| `react-specialist` | 8 | **10** |
| `testing-expert` | 7 | **10** |
| `security-specialist` | 9 | **10** |
| `performance-optimizer` | 6 | **10** |
| `api-builder` | 7 | **10** |
| `database-migration` | 6 | **10** |
| `devops-engineer` | 5 | **10** |
| `documentation-writer` | 4 | **10** |
| `accessibility-expert` | 5 | **7** |
| `ci-testing` | 7 | **12** |
| `docker-expert` | 6 | **7** |
| `git-expert` | 5 | **6** |
| `graphql-expert` | 6 | **7** |
| `monorepo-expert` | 5 | **6** |
| `python-expert` | 8 | **10** |
| `system-architect` | 8 | **12** |
| `react-specialist` | 8 | **10** |

#### Fully correct (both category and priority)

| Skill | Category | Priority |
|-------|----------|----------|
| `typescript-expert` | language | 10 ✓ |
| `anthropic-sdk` | priority only: 8 ✓ | (category wrong) |
| `code-simplifier` | priority only: 6 ✓ | (category wrong) |
| `frontend-design` | priority only: 7 ✓ | (category wrong) |
| `migration-expert` | priority only: 7 ✓ | (category wrong) |

Only `typescript-expert` is fully correct on both dimensions.

**Root cause:** Skills.md was written when priorities were lower and categories used different taxonomy. The manifests were updated (many priorities bumped to 10, `ci-testing`/`system-architect` raised to 12, categories reorganized) without propagating to the docs.

**Impact:** Stale category/priority in docs affects developer understanding and skill-selection explanations. The runtime behavior is correct (pool reads manifest.json directly, not the docs).

### 2.5 Score Example Accuracy

The skills.md score example (line 240-244) uses `react-specialist` with priority 8 producing score `16.8`. With the corrected manifest priority of 10, the score would be `17.0`. The example values are stale but functionally illustrative.

---

## 3. Marketplace (`docs/reference/marketplace.md`)

### 3.1 Experimental Status

The doc is consistently and correctly marked experimental throughout. The introductory note reads: *"Marketplace features may change significantly before the stable release."* ✓

### 3.2 Stale Roadmap Dates

| Issue | Detail | Severity |
|-------|--------|----------|
| "planned for release in Q2 2026" | Q2 2026 ended June 30, 2026; today is 2026-06-28 (Q2 still open by 2 days, but the roadmap is effectively past) | Medium |
| Phase 1 "Current: Design and API specification" | Phase 1 appears long past; phases should be updated to reflect actual current state | Medium |
| "marketplace.deckent.ai" web interface | Domain not yet live; doc correctly says "planned for a future release" elsewhere | Low |

### 3.3 Implementation Status Accuracy

| Claim | Verified | Notes |
|-------|----------|-------|
| `deckent skill search` available | Not verified at code level (out of scope) | Stated as available |
| `deckent skill publish` available | Not verified | Stated as available |
| `deckent skill install` not yet implemented | Not verified | Stated as planned |
| No `deckent agent install` CLI | Consistent with agent-pool.ts (no CLI install logic found) | ✓ |
| Agents added via `agent.json` in `.deckent/agents/<name>/` | Matches agent-pool.ts `_loadFromDir` logic | ✓ |

### 3.4 Links

| Link | Status |
|------|--------|
| `#roadmap` anchor | `## Roadmap` heading exists at line 7 ✓ |
| `../guide/evolution-and-learning.md` | File exists at `docs/guide/evolution-and-learning.md` ✓ |

---

## 4. Managed Docs (`docs/reference/managed-docs.md`)

### 4.1 Architecture Module Table

The docs list 5 implementation modules. Actual module count is 9.

| Module listed in docs | Exists in `src/orchestra/managed-docs/`? | Notes |
|-----------------------|------------------------------------------|-------|
| `docs-config.ts` | ✓ | Load, save, add, remove, validate |
| `types.ts` | ✓ | TypeScript interfaces |
| `doc-cache.ts` | ✓ | Content hash cache (ADR-031) |
| `section-parser.ts` | **✗ DOES NOT EXIST** | Parsing lives in `section-updater.ts` |
| `managed-doc-runner.ts` | ✓ | Sprint finalization orchestrator |

#### Undocumented modules (registered-but-undocumented)

| Module | Role |
|--------|------|
| `section-updater.ts` | Markdown section boundary detection + content replacement (does what `section-parser.ts` was supposed to do) |
| `content-generators.ts` | Built-in section generators (Sprint Metrics, Active Debt, Agent Performance, etc.) |
| `template-renderer.ts` | `{{path.to.value}}` placeholder resolution for user templates |
| `plugin-loader.ts` | User-defined generator plugin loader (ADR-030 Template Engine + Plugin Loader) |
| `index.ts` | Public API re-export barrel |

**Root cause:** `section-parser.ts` was likely the original filename that was renamed to `section-updater.ts` during a refactor, and the docs were not updated. Confirmed: `managed-doc-runner.ts` imports `updateDocSections, trimToMaxLines` from `./section-updater.js`, and `index.ts` re-exports `parseSections, findSectionByTitle, replaceSectionContent, appendSection, updateDocSections, trimToMaxLines` from `./section-updater.js`. The `section-parser.ts` name appears nowhere in the codebase.

### 4.2 docs.json Status

Managed-docs.md correctly states: *"`.deckent/docs.json` is gitignored by default in Deckent's own development repository."*

Verified: `.deckent/docs.json` is **not present** on disk in this repo — file not found. Note in doc is accurate. ✓

### 4.3 Init Template

Doc claims: `src/cli/commands/init-templates/docs.json.template`  
Verified: file exists at that path ✓

### 4.4 ADR References

| ADR | Relevance claim |
|-----|----------------|
| ADR-029 | Managed-Docs Universalization |
| ADR-030 | Template Engine + Plugin Loader |
| ADR-031 | Content Hash Cache |
| ADR-032 | i18n Pattern System |

All four ADRs are in the accepted ADR list. The ADR numbers are consistent with the code (doc-cache.ts header references ADR-031; plugin-loader.ts implements ADR-030 plugin loading). ✓

### 4.5 Links

No markdown hyperlinks in managed-docs.md. Internal anchor `#roadmap` referenced from marketplace.md only. No broken links in this document.

### 4.6 MCP Tool Claim

Doc claims `deckent_docs` MCP tool exists. Not verified at MCP layer (out of scope), but the tool is listed in the `## MCP Tools` table with accurate readonly=No annotation consistent with the write operations it performs. No delta found.

---

## 5. Cross-Cutting Link Check

| Source doc | Link target | Status |
|-----------|-------------|--------|
| `skills.md:65` | `../guide/evolution-and-learning.md` | ✓ Valid |
| `marketplace.md:65` | `../guide/evolution-and-learning.md` | ✓ Valid |
| `marketplace.md:5` | `#roadmap` | ✓ Valid (heading at line 7) |
| `agents.md` | No outbound links | N/A |
| `managed-docs.md` | No outbound markdown links | N/A |

---

## 6. Delta Summary

### 6.1 Agent Roster Delta

| Category | Count | Entries |
|----------|-------|---------|
| Documented-but-absent (active pool) | **0** | — |
| Registered-but-undocumented (active pool) | **0** | — |
| Archived-but-not-documented (archive/) | 3 | `test-writer`, `temp-react-specialist` (v1), `temp-react-ts-specialist` (v1) |

### 6.2 Skill Roster Delta

| Category | Count | Entries |
|----------|-------|---------|
| Documented-but-absent | **0** | — |
| Registered-but-undocumented | **0** | — |
| Category metadata stale | 9 | See §2.4 |
| Priority metadata stale | 17 | See §2.4 |

### 6.3 Managed-Docs Module Delta

| Category | Count | Entries |
|----------|-------|---------|
| Documented-but-absent | **1** | `section-parser.ts` (renamed to `section-updater.ts`) |
| Registered-but-undocumented | 5 | `section-updater.ts`, `content-generators.ts`, `template-renderer.ts`, `plugin-loader.ts`, `index.ts` |

---

## 7. Recommended Fixes (prioritized)

| Priority | File | Fix |
|----------|------|-----|
| High | `docs/reference/skills.md` | Update all 21 skill category and priority values to match manifests (9 category + 17 priority fixes) |
| High | `docs/reference/managed-docs.md` | Replace `section-parser.ts` with `section-updater.ts`; document all 5 additional module files |
| Medium | `docs/reference/marketplace.md` | Update roadmap dates (Q2 2026 deadline passed); revise phase status to reflect actual state |
| Low | `docs/reference/agents.md` | Change "2 custom" to "2 learned/temp" in AUTOGEN header for precision |

---

## 8. Verification Notes

- Agent and skill roster counts were verified by direct directory inspection + `agent-pool.ts`/`skill-pool.ts` source read
- Metadata was verified by reading each `agent.json` / `manifest.json` file and cross-referencing with the docs
- `section-parser.ts` absence confirmed by `ls src/orchestra/managed-docs/` + grep for "section-parser" across `src/` (0 results)
- `docs.json` absence confirmed by filesystem check
- All internal links verified by checking file existence and heading presence

---

*A11 complete. No source code changes made (audit-only task; scope: docs/audits/doc-refresh-2026-06/ write-only).*
