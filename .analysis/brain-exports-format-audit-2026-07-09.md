# Brain Exports Format Audit (2026-07-09)

## Executive Summary

The `.brain/exports/` directory contains four auto-generated markdown snapshots that serve as the **read-only view** of deckent's memory database. These files are **derived from** the SQLite DB (`memory.db`), not the source of truth. The total size is **728 KB** (decisions.md alone = **478 KB**), dominated by the architecture decision export. The audit identifies consumers, size drivers, and sync contracts to enable informed truncation/pagination strategies.

**Key Finding:** The 488 KB decisions.md is not a size problem per se — it is a faithful mirror of 75+ accepted ADRs in the DB. However, strategies exist to reduce on-disk footprint if needed: pagination by decade, summary-only fallback, or header-only extraction.

---

## Export Files Overview

| File | Size | Entry Type | Primary Consumer | Frequency |
|------|------|-----------|------------------|-----------|
| **decisions.md** | 478 KB | ADRs (75+ entries) | Git review, doctor validation, fallback import | Per-sprint finalize |
| **memory.md** | 219 KB | Learnings (sprint-grouped) | API /memory, context grounding, post-sprint reports | Per-sprint finalize |
| **debt.md** | 20 KB | Technical debt (resolved + active) | API /debt, maintenance checks, sprint review | Per-sprint finalize |
| **summary.md** | 7.4 KB | ADRs (compact) + recent learnings + active debt | Context injection (@include), bot grounding, CLI identity | Per-sprint finalize |
| **TOTAL** | **728 KB** | — | — | — |

---

## Per-File Analysis

### 1. decisions.md (478 KB)

**Format:** Markdown with ADR full text
- Header: `# Architecture Decision Records (auto-generated)`
- Per-ADR block: ID, title, status, full decision content
- Separator: `---` between entries
- Sort: numeric ID order (ADR-001, ADR-002, …, ADR-G-035)
- Source: `exportDecisionsMd()` in `src/core/memory-export.ts` (lines 120–158)

**Content Breakdown:**
- ~75 accepted ADRs (combined dogfood + general categories: ADR-D-*, ADR-G-*)
- Average ~6.4 KB per ADR (full context + rationale + intent + decision text)
- No truncation — full content for each ADR

**Consumers:**
1. **Git Review** — checked into version control; reviewers read decisions.md as human-facing documentation
2. **Doctor Validation** — `src/cli/commands/doctor-checks.ts`: validates that exported decisions.md exists and is not stale relative to DB
3. **Fallback ADR Import** — `src/cli/commands/memory.ts`: used ONLY when no `docs/adr/*.md` files exist (fallback path); primary source is individual .md files in `docs/adr/`
4. **MCP Resource** — `src/mcp/server.ts`: exported as `deckent://decisions` resource (human reference only, not machine-parsed)

**Size Analysis:**
- Driver: number and length of ADR content (rationale + decision + intent sections)
- Current: 75 ADRs × 6.4 KB avg = ~480 KB
- Growth trajectory: roughly +1 KB per sprint (based on recent sprints 380–390 adding 2–3 ADRs/sprint)
- At current trajectory: will reach 550 KB by sprint 420 (~4 years)

**Truncation/Pagination Recommendations:**

1. **Tiered Export (Recommended):**
   - **decisions.md** (current): keep full-text for all ADRs (source of truth for git review)
   - **decisions-summary.md** (new, optional): one-liner per ADR for quick scanning
   - **decisions/001-*.md** through **decisions/035-*.md** (new, optional): split into per-decade or per-category subdirectory for better tooling support

2. **Content Truncation (if size limit enforced):**
   - Truncate ADR content to first 1000 chars (keep status + title + first paragraph)
   - Append `[... full content in memory.db, query via deckent recall]`
   - Reduces decisions.md from 478 KB → ~120 KB

3. **Archive Strategy (if history isolation required):**
   - Move "superseded" or "deprecated" ADRs to `decisions-archive.md`
   - Keep only "accepted" + "proposed" in decisions.md
   - Impact: current 478 KB → ~450 KB (minimal; most ADRs are accepted)

4. **No Action Needed (Current Recommendation):**
   - 478 KB is not a performance problem (not served as binary blob, git diff is fast)
   - Pagination adds complexity (tooling must handle multiple files)
   - Keep full-text for audit trail + code-review readability
   - **Revisit this if:** file size exceeds 1 MB or tooling requires split (e.g., Slack message limits)

---

### 2. memory.md (219 KB)

**Format:** Markdown with sprint-grouped learnings
- Header: `# Sprint Learnings (auto-generated)`
- Per-sprint section: `## Sprint sprint-XXX Learnings`
- Per-learning: `- title: content` (2-line format)
- Source: `exportMemoryMd()` in `src/core/memory-export.ts` (lines 165–196)

**Content Breakdown:**
- Learnings grouped by sprint_id in descending order (recent first)
- ~150–200 learnings across all sprints (roughly 2–5 per sprint)
- Average ~1.2 KB per learning (title + summary content)
- No truncation; full content included

**Consumers:**
1. **API Endpoint** — `src/api/server.ts` (`GET /api/memory`): serves exported memory.md as JSON response
2. **Context Grounding** — `src/connectors/bot-agentic.ts`: used to ground bot's knowledge of project history
3. **CLI Identity** — `src/core/identity-generator.ts`: included in identity-manifest for CLI bootstrap
4. **Chat Render Context** — `src/connectors/chat-bridge.ts`: grounds persistent session in live project context
5. **Post-Sprint Reports** — implicit (available for manual review in git)

**Size Analysis:**
- Driver: number of learnings × average size (no truncation currently)
- Current: ~170 learnings × 1.2 KB = ~204 KB
- Growth trajectory: roughly +0.5–1 KB per sprint (1–5 new learnings per sprint)
- At current trajectory: will reach 300 KB by sprint 440 (~4 years)

**Truncation/Pagination Recommendations:**

1. **Sampling/Sliding Window (Recommended):**
   - Keep all learnings in DB (no data loss)
   - Export only the most recent **N sprints** to memory.md (e.g., last 20 sprints = ~80 KB)
   - Append footer: `[Earlier learnings are in .brain/memory.db; query via deckent memory list --limit 100]`
   - Impact: 219 KB → ~80 KB with no functional loss for current/recent contexts
   - Rationale: bots and CLI bootstrap need recent learnings, not complete history

2. **Content Truncation:**
   - Truncate content to first 500 chars per learning
   - Reduces memory.md from 219 KB → ~90 KB
   - Trade-off: post-sprint reports lose detail (mitigated by DB always having full content)

3. **Hybrid Approach:**
   - Export recent 20 sprints (full content) + older sprints (summary only)
   - Impact: ~120 KB

4. **No Action (Current):**
   - 219 KB is acceptable for git tracking
   - All learnings remain queryable from memory.db
   - **Implement sliding-window export if:** file becomes unwieldy for real-time diffs or API response times exceed 100ms

---

### 3. debt.md (20 KB)

**Format:** Markdown with two markdown tables
- Header: `# Technical Debt (auto-generated)`
- Section 1: `## Active Technical Debt` (table: ID, Title, Priority, Sprint, Status)
- Section 2: `## Resolved Technical Debt` (table: ID, Title, Priority, Sprint, Status)
- Source: `exportDebtMd()` in `src/core/memory-export.ts` (lines 203–243)

**Content Breakdown:**
- Table rows: 1 per debt entry
- Active debt: typically 0–5 entries
- Resolved debt: ~40–50 entries (cumulative history)
- Average ~200 bytes per row

**Consumers:**
1. **API Endpoint** — `src/api/server.ts` (`GET /api/debt`): serves exported debt.md as JSON response
2. **Maintenance Checks** — `src/nervous/maintenance-ops.ts`: reads debt.md for on-disk verification of debt records
3. **Post-Sprint Reports** — implicit (available for manual review)

**Size Analysis:**
- Driver: table row count (active + resolved)
- Current: ~50 total rows × 200 bytes = ~10 KB (actual: 20 KB with overhead)
- Growth trajectory: roughly +1–2 rows per sprint
- At current trajectory: will reach 30 KB by sprint 420 (~4 years)

**Truncation/Pagination Recommendations:**

1. **Archive by Age (Recommended):**
   - Keep resolved debt for **last 2 years** (sprints 380–390 = ~50 sprints)
   - Move older resolved entries to `debt-archive.md`
   - Impact: 20 KB → ~15 KB (minimal; recent entries are most relevant)
   - Rationale: debt older than 2 years is historical; queries to memory.db are better for archaeology

2. **Active Only (Alternative):**
   - Export only active debt to debt.md (users expect current problems)
   - Move resolved to separate `debt-resolved.md`
   - Impact: 20 KB → ~3 KB for current file + 17 KB for archive
   - Trade-off: splits the audit trail

3. **No Action (Current Recommendation):**
   - 20 KB is negligible
   - Keeps full audit trail in one place
   - **Revisit if:** debt table grows beyond 200 rows (unlikely in next 5 years)

---

### 4. summary.md (7.4 KB)

**Format:** Markdown with compact tables and lists
- Sections:
  - Active Architecture Decisions (table: ID, Title, Status)
  - Recent Learnings (bulleted list, last 10 entries, truncated to 120 chars each)
  - Active Technical Debt (bulleted list)
  - Active Patterns (bulleted list, if any)
  - Footer: total entry count + generation date
- Source: `exportSummaryMd()` in `src/core/memory-export.ts` (lines 51–113)

**Content Breakdown:**
- Compact single-page view (target < 5 KB)
- ADR count: 75 rows × ~30 bytes = ~2.2 KB
- Recent learnings: 10 entries × ~150 bytes = ~1.5 KB
- Active debt: ~5 rows × ~50 bytes = ~250 bytes
- Total: ~7.4 KB (current state)

**Consumers:**
1. **Context Injection (@include)** — `src/core/identity-generator.ts`: used via `@.brain/exports/summary.md` in CLAUDE.md for lightweight project overview on session startup
2. **Bot Grounding** — `src/connectors/bot-agentic.ts`: injects summary as "genuine deckent-expert" context (grounding for accurate behavior)
3. **Autonomous Mode** — `src/cli/commands/autonomous.ts`: reads summary.md to ground autonomous-mode planning
4. **MCP Resource** — `src/mcp/server.ts`: exported as `deckent://summary` resource

**Size Analysis:**
- Driver: ADR count (growing at ~3 per sprint)
- Current: 75 ADRs × 30 bytes + 100 bytes overhead = ~2.3 KB (actual: ~7.4 KB, includes learnings + debt)
- Growth trajectory: linear with ADR count
- At current trajectory: will reach 15 KB by sprint 450 (~5 years)

**Truncation/Pagination Recommendations:**

1. **None Needed (Current):**
   - Summary.md is intentionally compact (< 10 KB target met)
   - Learnings are already sampled (10 entries, truncated to 120 chars)
   - ADR table is auto-limited by actual count (no duplicates)
   - **Remain < 10 KB indefinitely** if ADR count stabilizes at 75–150

2. **Optional Enhancement:**
   - Add "Oldest/Newest ADRs" summary to improve navigation
   - Add "Most-Changed Files" pattern summary
   - Impact: +1–2 KB (still acceptable)

---

## DB↔FS Sync Contract

### Direction 1: DB → FS (Export)

**Trigger:** Sprint finalize phase (`src/orchestra/sprint-finalizer.ts`, lines ~150–190)
- Called via `writeGuardedExports(store, exportsDir)` after post-finalize hooks run
- Conditional: skipped if `skipMemoryExport: true` is passed
- Frequency: once per sprint finalize

**Implementation (`src/core/memory-export.ts`, lines 414–456):**

```
writeGuardedExports(store, exportsDir):
  for each spec in [summary.md, decisions.md, memory.md, debt.md]:
    1. Render content via exportFunctionMd(store)
    2. Count DB entries of relevant type (adr, memory, debt)
    3. Check if render is empty ("_No X recorded_" marker)
    4. Guard: if DB has entries but render is empty → skip write + warning
       (prevents catastrophic wipe per sprint-226 incident)
    5. Guard: if DB is empty but file has content → skip write + warning
    6. Otherwise: writeFileSync(filePath, content, 'utf-8')
```

**Safety Mechanism:**
- **Export-Wipe Guard:** blocks accidental overwrite when render produces no content but DB has entries
- **Reason:** sprint-226 bug where corrupt render collapsed 8518 lines → 2 lines; guard now catches this
- **Result:** files are only updated if render succeeds; if render fails to produce entries, old file is preserved

**Idempotency:** yes (writeFileSync overwrites unconditionally; re-running finalize re-exports safely)

### Direction 2: FS → DB (Reverse Sync / Fallback Import)

**Trigger:** `deckent memory rebuild` command or `memory.ts` initialization
- Source: `src/cli/commands/memory.ts`, lines ~80–130
- Fallback mode: decisions.md is used ONLY if `docs/adr/*.md` files do not exist

**Implementation:**

```
memory rebuild (primary):
  1. Check if docs/adr/*.md directory exists
  2. If yes: syncAdrFilesToDb(store, 'docs/adr/', {changedBy: 'memory-rebuild'})
     → reads all .md files, parses MADR format, upserts to DB
  3. If no: fallback to parseDecisionsMd(readFileSync('.brain/exports/decisions.md'))
     → parses old export format, inserts entries to DB
```

**Bi-directional Hook (ADR-046 Amendment 2026-05-15):**

Additionally, `exportAdrsToFs()` in `src/core/memory-export.ts` (lines 317–376) implements the **reverse** direction:

```
exportAdrsToFs(store, adrDir, opts):
  for each ADR in store:
    1. Compute filename: adr-001-typescript-esm.md
    2. Check if file exists
    3. If file exists:
       a. Read file mtime
       b. Read DB entry updated_at timestamp
       c. If file mtime > DB updated_at → SKIP (manual edit wins)
       d. Otherwise: overwrite with new content
    4. If file doesn't exist: create new file
    5. Return result: {written, updated, skipped, errors}
```

**Idempotency:** file mtime-based; manual edits are preserved (file wins over DB if newer)

**Contract Summary:**

| Direction | Trigger | Source | Destination | Guard |
|-----------|---------|--------|-------------|-------|
| DB→FS | finalize | memory.db | `.brain/exports/*.md` | Export-wipe guard (skip if render empty + DB non-empty) |
| FS→DB | `memory rebuild` | `docs/adr/*.md` (primary) or `.brain/exports/decisions.md` (fallback) | memory.db | File-mtime precedence (manual edits preserved) |
| DB→FS (ADRs) | on-demand | memory.db ADR entries | `docs/adr/*.md` individual files | File-mtime precedence (manual edits preserved) |

---

## Recommendations Summary

### Size Management

| File | Current | Recommended Action | Target Size | Effort |
|------|---------|-------------------|-------------|--------|
| **decisions.md** | 478 KB | Keep (no action); monitor for 1+ MB threshold | 478 KB | Low |
| **memory.md** | 219 KB | Implement sliding-window export (last 20 sprints) | 80 KB | Medium |
| **debt.md** | 20 KB | Keep (no action); minimal growth trajectory | 20 KB | Low |
| **summary.md** | 7.4 KB | Keep (no action); target met | 7.4 KB | Low |
| **TOTAL** | **728 KB** | Proposed: **585 KB** (if memory.md optimized) | — | — |

### Priority

1. **P3 (Nice-to-Have) — Memory.md Sliding-Window:**
   - Reduces on-disk footprint by 43% for memory.md alone
   - No functional loss (all learnings queryable from memory.db)
   - Implement via `exportMemoryMd()` parameter: `maxSprints: 20`
   - Benefit: faster git diffs, smaller clones, cleaner history

2. **P4 (Future) — Decisions.md Pagination:**
   - Only if file size exceeds 1 MB or tooling requires split
   - Implement via subdirectory: `decisions/001-*.md`, `decisions/010-*.md`, etc.
   - Or: serve via paginated API instead of flat export

3. **P5 (Maintenance) — Archive Old Debt:**
   - Move resolved debt > 2 years old to `debt-archive.md`
   - Only when resolved-debt table exceeds 100 entries (5+ years away)

### Export Format Stability

- **decisions.md, memory.md, debt.md:** FROZEN format (MADR header, markdown tables, sorting rules)
  - Any breaking changes require major version bump (current: export format v1)
  - Consumers depend on parsing these files; format stability is critical
  
- **summary.md:** FLEXIBLE format (human-readable, no parsing contract)
  - Can add sections (e.g., "Oldest ADRs", "Top 5 Files Changed") without breaking consumers

---

## Conclusion

All four export files serve their intended purpose and are appropriately sized for current usage:
- **decisions.md** is the authoritative ADR archive and passes human-review gate; 478 KB is justified
- **memory.md** is a faithful sprint-learnings log; 219 KB is acceptable; sliding-window export could halve this if needed
- **debt.md** is a minimal tracker; 20 KB is negligible
- **summary.md** is a lightweight context snapshot; 7.4 KB meets target

The DB↔FS sync contract is sound:
- Export-wipe guard (sprint-227) prevents catastrophic data loss
- File-mtime precedence (ADR-046) respects manual edits
- Fallback import path (decisions.md) ensures recovery if docs/adr/ is wiped

**No immediate action required.** Monitor for truncation/pagination if:
1. decisions.md approaches 1 MB
2. memory.md export API responses exceed 100ms
3. Tooling requires per-ADR file access (migrate to subdirectory model)
