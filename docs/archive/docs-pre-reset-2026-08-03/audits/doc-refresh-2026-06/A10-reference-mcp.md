# A10 — Reference: MCP (guide / overview / tools[AUTO] / resources)

**Sprint:** 345 | **Task:** 345-010 | **Date:** 2026-06-28  
**Scope:** `docs/reference/mcp-guide.md`, `mcp-overview.md`, `mcp-tools.md`, `mcp-resources.md`  
**Source truth:** `src/mcp/tools/index.ts` (TOOL_CATALOG), `src/mcp/resources/index.ts`, `src/mcp/server.ts`

---

## 1. Tool Count Verification

**Ground-truth source: `src/mcp/tools/index.ts`**

```
TOOL_CATALOG: 37 entries (lines 59–97)
MCP_TOOL_COUNT = TOOL_CATALOG.length  ← computed, not hardcoded
```

**Cross-references verified:**

| Location | Claim | Status |
|----------|-------|--------|
| `src/mcp/server.ts` DECKENT_MCP_INSTRUCTIONS (line 27) | `## Tools (37)` | ✅ CORRECT |
| `src/mcp/server.ts` DECKENT_MCP_INSTRUCTIONS (lines 28–65) | Lists all 37 tools by name | ✅ CORRECT |
| `docs/reference/mcp-tools.md` AUTOGEN block | `37 tools registered` | ✅ CORRECT |
| `docs/reference/mcp-overview.md` line 3 | **35 tools** | ❌ STALE — should be **37** |
| `docs/reference/mcp-overview.md` line 53 | `## Tools (35)` | ❌ STALE — should be **Tools (37)** |
| `docs/reference/mcp-guide.md` TOC line 16 | `31 MCP Tool Referansı` | ❌ STALE — should be 37 |
| `docs/reference/mcp-guide.md` arch diagram line 45 | `31 Tools` | ❌ STALE — should be 37 |
| `docs/reference/mcp-guide.md` section heading line 186 | `## 31 MCP Tool Referansı` | ❌ STALE — should be 37 |

**Missing tools from `mcp-overview.md` tables:**

The overview tables list 35 tools. Two tools present in `TOOL_CATALOG` and `server.ts` instructions are absent:

| Tool | File | Introduced |
|------|------|-----------|
| `deckent_kpi` | `src/mcp/tools/kpi.ts` | post-35 count |
| `deckent_cost` | `src/mcp/tools/cost.ts` | post-35 count |

---

## 2. Full Tool Name Verification

All 37 tool names from `TOOL_CATALOG` (ordered as registered):

| # | Tool Name | Source File | In mcp-tools.md AUTOGEN | In mcp-overview.md |
|---|-----------|-------------|------------------------|-------------------|
| 1 | `deckent_init` | init.ts | ✅ | ✅ |
| 2 | `deckent_set_directives` | directives.ts | ✅ | ✅ |
| 3 | `deckent_plan` | plan.ts | ✅ | ✅ |
| 4 | `deckent_start` | start.ts | ✅ | ✅ |
| 5 | `deckent_status` | status.ts | ✅ | ✅ |
| 6 | `deckent_doctor` | doctor.ts | ✅ | ✅ |
| 7 | `deckent_retro` | retro.ts | ✅ | ✅ |
| 8 | `deckent_history` | history.ts | ✅ | ✅ |
| 9 | `deckent_analyze_project` | analyze.ts | ✅ | ✅ |
| 10 | `deckent_sync` | sync.ts | ✅ | ✅ |
| 11 | `deckent_config` | config.ts | ✅ | ✅ |
| 12 | `deckent_review` | review.ts | ✅ | ✅ |
| 13 | `deckent_run` | run.ts | ✅ | ✅ |
| 14 | `deckent_kill` | kill.ts | ✅ | ✅ |
| 15 | `deckent_cleanup` | cleanup.ts | ✅ | ✅ |
| 16 | `deckent_help` | help.ts | ✅ | ✅ |
| 17 | `deckent_agent_list` | agent-list.ts | ✅ | ✅ |
| 18 | `deckent_skill_list` | skill-list.ts | ✅ | ✅ |
| 19 | `deckent_checkpoint` | checkpoint.ts | ✅ | ✅ |
| 20 | `deckent_docs` | docs.ts | ✅ | ✅ |
| 21 | `deckent_explain` | explain.ts | ✅ | ✅ |
| 22 | `deckent_memory_query` | memory-query.ts | ✅ | ✅ |
| 23 | `deckent_watch` | watch.ts | ✅ | ✅ |
| 24 | `deckent_nervous_subscribe` | nervous.ts | ✅ | ✅ |
| 25 | `deckent_nervous_accept` | nervous.ts | ✅ | ✅ |
| 26 | `deckent_nervous_reject` | nervous.ts | ✅ | ✅ |
| 27 | `deckent_nervous_status` | nervous.ts | ✅ | ✅ |
| 28 | `deckent_nervous_config` | nervous.ts | ✅ | ✅ |
| 29 | `deckent_feature_query` | feature-query.ts | ✅ | ✅ |
| 30 | `deckent_audit` | audit.ts | ✅ | ✅ |
| 31 | `deckent_recover` | recover.ts | ✅ | ✅ |
| 32 | `deckent_models` | models.ts | ✅ | ✅ |
| 33 | `deckent_autonomous` | autonomous.ts | ✅ | ✅ |
| 34 | `deckent_process` | process.ts | ✅ | ✅ |
| 35 | `deckent_usage` | usage.ts | ✅ | ✅ |
| 36 | `deckent_kpi` | kpi.ts | ✅ | ❌ MISSING |
| 37 | `deckent_cost` | cost.ts | ✅ | ❌ MISSING |

**Note on `job-runner.ts`:** Present in `src/mcp/tools/` but is a helper module (not a tool registration file). Imported by `run.ts`, `start.ts`, `status.ts`. Correctly absent from tool catalog.

**Note on `nervous.ts`:** Registers 5 tools via `registerNervousTools()` (single call in `registerTools()`). All 5 Nervous System tools are present in both TOOL_CATALOG and AUTOGEN.

---

## 3. mcp-tools.md — AUTO_GENERATED Status

> **Status: AUTO_GENERATED. Do not propose hand-edits to this file.**

```
docs/reference/mcp-tools.md
Header: > **Auto-generated** — do not edit AUTOGEN block by hand. Run `npm run docs:ref` to regenerate.
Block:  <!-- AUTOGEN:START id="mcp-tools" --> … <!-- AUTOGEN:END id="mcp-tools" -->
```

**Generator drift assessment:**

The AUTOGEN block claims `37 tools registered. Generated from src/mcp/tools/*.ts.`  
TOOL_CATALOG has 37 entries. All 37 tool names in the AUTOGEN table match the TOOL_CATALOG exactly (alphabetically ordered in generated output).

**Result: NO GENERATOR DRIFT.** The AUTOGEN content accurately reflects the current source.

No hand-edits are needed or should be proposed.

---

## 4. mcp-resources.md — AUTO_GENERATED Status

> **Status: AUTO_GENERATED. Do not propose hand-edits to this file.**

```
docs/reference/mcp-resources.md
Header: > **Auto-generated** — do not edit AUTOGEN block by hand. Run `npm run docs:ref` to regenerate.
Block:  <!-- AUTOGEN:START id="mcp-resources" --> … <!-- AUTOGEN:END id="mcp-resources" -->
```

**Generator drift assessment (resources verified vs source):**

| Resource | URI (AUTOGEN) | URI (source) | MIME (AUTOGEN) | MIME (source) | Status |
|----------|--------------|-------------|----------------|--------------|--------|
| `agents` | `deckent://agents` | ✅ agents.ts:10 | `application/json` | ✅ | CORRECT |
| `config` | `deckent://config` | ✅ config.ts:9 | `application/json` | ✅ | CORRECT |
| `dashboard` | `deckent://dashboard` | ✅ dashboard.ts:8 | `application/json` | ✅ | CORRECT |
| `debt` | `deckent://debt` | ✅ debt.ts:11 | `application/json` | ✅ | CORRECT |
| `directives` | `deckent://directives` | ✅ directives.ts:9 | `text/markdown` | ✅ | CORRECT |
| `memory` | `deckent://memory` | ✅ memory.ts:10 | `text/markdown` | ✅ | CORRECT |
| `retro` | `deckent://retro` | ✅ retro.ts:10 | `text/markdown` | ✅ | CORRECT |
| `tasks` | `deckent://tasks` | ✅ tasks.ts:9 | `application/json` | ✅ | CORRECT |

**Result: NO GENERATOR DRIFT.** All 8 resources in AUTOGEN match source exactly.

---

## 5. mcp-overview.md — Deep Verification

### 5.1 Issues

**[ISSUE A10-OV-1] Tool count: 35 stated, 37 actual**

| Location | Stale claim | Correct value |
|----------|-------------|---------------|
| Line 3, prose paragraph | `**35 tools**` | `**37 tools**` |
| Line 53, section heading | `## Tools (35)` | `## Tools (37)` |

Root cause: `deckent_kpi` and `deckent_cost` were added after the count was last updated.

**[ISSUE A10-OV-2] deckent_kpi and deckent_cost absent from tool tables**

Both tools exist in source (`kpi.ts`, `cost.ts`) and are registered in `registerTools()`. They appear in `DECKENT_MCP_INSTRUCTIONS` and `mcp-tools.md` AUTOGEN but are absent from `mcp-overview.md` tables.

Suggested placement for mcp-overview.md:
- `deckent_kpi` → Monitoring section (read-only, alongside `deckent_audit` and `deckent_usage`)
- `deckent_cost` → Init/Config section (read-only, alongside `deckent_doctor` / `deckent_models`)

### 5.2 Verified Correct

- Registration pattern description (lines 17–34) ✓
- Notification dispatcher description ✓
- Transport lifecycle (lines 44–49) ✓
- Singleton guard (`mcp-server.pid`) description ✓
- Resources section: all 8 resources listed with correct URIs and MIME types ✓
- Memory resource: correctly describes DB-first from `.brain/memory.db` ✓
- "Adding a New Tool" guide (steps 1–5) ✓
- stdio transport section ✓

---

## 6. mcp-guide.md — Deep Verification

mcp-guide.md is a user-facing guide (TR language), NOT auto-generated. It intentionally focuses on the most common tools and provides deep usage examples.

### 6.1 Issues

**[ISSUE A10-GD-1] Tool count: 31 stated in three places, actual is 37**

| Location | Stale claim |
|----------|-------------|
| TOC anchor line 16 | `3. [31 MCP Tool Referansı]` |
| Architecture diagram line 45 | `├── 31 Tools  (src/mcp/tools/)` |
| Section heading line 186 | `## 31 MCP Tool Referansı` |

The guide should either state the correct count (37) or acknowledge it documents a subset.

**[ISSUE A10-GD-2] Tool table is incomplete with no disclaimer**

The tool table (lines 192–201) lists only 10 of 37 tools. There is no note indicating this is a "core tools" or "quick reference" subset. A reader will expect the table to be complete given the heading "31 MCP Tool Referansı" (itself stale).

**[ISSUE A10-GD-3] Resource table incomplete — 5 of 8 resources listed**

The guide resource table (line 629) lists only 5 resources:

| Listed | URI |
|--------|-----|
| ✅ | `deckent://dashboard` |
| ✅ | `deckent://directives` |
| ✅ | `deckent://memory` |
| ✅ | `deckent://debt` |
| ✅ | `deckent://config` |
| ❌ MISSING | `deckent://retro` |
| ❌ MISSING | `deckent://tasks` |
| ❌ MISSING | `deckent://agents` |

**[ISSUE A10-GD-4] deckent_retro tool description references stale data source**

Line 468: `**Amaç:** \`.brain/RETRO.md\` dosyasından en son sprint retrospektifini okur.`

Actual implementation (`src/mcp/tools/retro.ts`, comment line 24–25):
> `B8: retros live in memory.db as \`type='retro'\` entries (id \`retro-<id>\`) — the legacy \`.brain/RETRO.md\` file is no longer produced.`

The retro tool reads from `.brain/memory.db` (DB-first), not from `.brain/RETRO.md`.

**[ISSUE A10-GD-5] deckent://memory resource description references stale data source**

Line 632: `deckent://memory` described as reading from `.brain/exports/memory.md (generated snapshot)`.  
Lines 684–685: Detail says "Memory V2 generated snapshot — actual data in memory.db".

Actual implementation (`src/mcp/resources/memory.ts`): reads directly from `.brain/memory.db` via `MemoryStore.getByType('memory')`. No `.brain/exports/memory.md` file is read. The mcp-overview.md correctly states "DB-first".

### 6.2 Verified Correct

- Server architecture diagram (transport layer description) ✓
- Installation instructions: Claude Code, VS Code (Cline/Continue), Cursor — all correct ✓
- Singleton guard note ✓
- 5 resource URIs and MIME types that are listed ✓
- Typical usage flows (Akış 1–5) ✓
- Error table ✓
- `deckent_init` parameters and example output ✓
- `deckent_set_directives` parameters and example ✓
- `deckent_plan` parameters and example ✓
- `deckent_start` parameters and example ✓
- `deckent_status` parameters and example ✓
- `deckent_doctor` parameters and example ✓
- `deckent_history` parameters and example ✓
- `deckent_analyze_project` example ✓
- `deckent_sync` example ✓

---

## 7. Summary

### AUTO_GENERATED files (no hand-edits proposed)

| File | Generator drift |
|------|----------------|
| `docs/reference/mcp-tools.md` | **NONE** — 37 tools, all names correct, matches TOOL_CATALOG |
| `docs/reference/mcp-resources.md` | **NONE** — 8 resources, all URIs/MIMEs correct |

### Issues requiring doc update

| ID | File | Issue | Severity |
|----|------|-------|----------|
| A10-OV-1 | mcp-overview.md | Tool count "35" → should be **37** (2 places) | HIGH |
| A10-OV-2 | mcp-overview.md | Missing `deckent_kpi` and `deckent_cost` from tables | HIGH |
| A10-GD-1 | mcp-guide.md | Tool count "31" → should be **37** (3 places) | HIGH |
| A10-GD-2 | mcp-guide.md | Tool table shows 10/37 with no "partial" disclaimer | MEDIUM |
| A10-GD-3 | mcp-guide.md | Resource table shows 5/8 (missing retro, tasks, agents) | MEDIUM |
| A10-GD-4 | mcp-guide.md | `deckent_retro` stale source `.brain/RETRO.md` → `.brain/memory.db` | MEDIUM |
| A10-GD-5 | mcp-guide.md | `deckent://memory` stale source `.brain/exports/memory.md` → DB-first | LOW |

### Evidence

```
$ grep -c '{ name:' src/mcp/tools/index.ts
37

$ grep '## Tools' src/mcp/server.ts
## Tools (37)

$ grep 'tools registered' docs/reference/mcp-tools.md
> 37 tools registered. Generated from `src/mcp/tools/*.ts`.

$ grep 'tools' docs/reference/mcp-overview.md | head -2
...publishes **35 tools** and **8 resources**...
## Tools (35)
```

---

*A10 complete — tool count 37 verified with evidence; mcp-tools.md marked AUTO with no drift; mcp-resources.md marked AUTO with no drift; 7 issues identified in hand-authored docs.*
