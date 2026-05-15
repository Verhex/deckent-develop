# ADR-046: Brain Self-Update Hook Architecture

**Status:** accepted

**Deciders:** Alperen Sartaçoğlu (product owner), Brain (orchestrator)

**Date:** 2026-05-13

**Sprint:** Sprint 166

> **Note:** The full architecture document is at
> `docs/adr/046-brain-self-update-hook-architecture.md`. This file captures
> the Sprint 169 bi-directional sync amendment.

---

## Amendment 2026-05-15 — Sprint 169 H1 (ADR-046 Reverse Hook)

**Date:** 2026-05-15
**Author:** Alperen Sartaçoğlu
**Sprint:** sprint-169
**Decision reference:** DIRECTIVES.md Task 8 (H1 ADR DB→FS Export Pipeline)

### Bi-Directional FS↔DB Sync Contract

ADR-046 originally established the **forward direction** (FS→DB) via
`syncAdrFilesToDb()` in Sprint 166. This amendment adds the **reverse
direction** (DB→FS) and formalizes the bi-directional contract:

| Direction | Function | Location | Trigger |
|-----------|----------|----------|---------|
| Forward (FS→DB) | `syncAdrFilesToDb()` | `src/core/adr-file-sync.ts` | Post-finalize Step 3 |
| Reverse (DB→FS) | `exportAdrsToFs()` | `src/core/memory-export.ts` | Manual / CI gate |

### Reverse Sync Rules

1. **Manual edit wins** — if a file's mtime is newer than the DB `updated_at`,
   the file is preserved unchanged (DB→FS write is skipped).
2. **Idempotent** — re-running `exportAdrsToFs` with the same DB state produces
   no changes (written=0, updated=0) when all files are up-to-date.
3. **Missing fields** — DB entries with empty sprint, content, or date fields
   render as `_To be backfilled_` placeholders.
4. **MADR v3 passthrough** — if DB content already starts with a `#` header,
   it is written as-is without further wrapping.

### Conflict Resolution

| Condition | Winner | Action |
|-----------|--------|--------|
| File mtime > DB updated_at | File (manual edit) | Skip — no write |
| File mtime ≤ DB updated_at | DB | Overwrite file |
| File does not exist | DB | Create new file |

### CLI Wrapper

```bash
node scripts/memory/export-adr-fs.mjs [--dry-run] [--db <path>] [--adr-dir <path>]
```

### Step Ordering (ADR-046 Section 5.1 unchanged)

The reverse sync runs **outside** the post-finalize hook chain — it is a
manual operator tool, not an automatic step. The Step Ordering Contract
(Steps 1–13) defined in the architecture file is **unaffected** by this
amendment.

### OSS GA Sprint 170 Anchor

This amendment is a prerequisite for the Sprint 170 OSS GA (`VerhexIO/deckent`
public flip). The CI gate (`scripts/memory/export-adr-fs.mjs --dry-run`) must
report `written=0` before the public flip proceeds.

---

## References

1. **Sprint 166 T1** — `src/core/adr-file-sync.ts` forward sync implementation (Bug M fix)
2. **Sprint 169 H1** — `src/core/memory-export.ts` reverse sync implementation
3. **ADR-046 architecture** — `docs/adr/046-brain-self-update-hook-architecture.md`
4. **ADR-036** — ADR Governance Integration (mandatory amendment protocol)
