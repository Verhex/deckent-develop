# Sprint File Retention Audit — 2026-05-22

**Scope:** `.deckent/` root file accumulation — sprint-file-retention.ts + observability.ts + panic-guard.ts  
**Context:** OSS launch prep — `.deckent/` root currently has 42+ orphaned sprint files from 6 sprints  
**Method:** Systematic debugging — root cause first, then fix plan

---

## Architecture

### File Types Created Per Sprint in `.deckent/` Root

| File | Pattern | Created By | In `SPRINT_FILE_PATTERNS`? |
|------|---------|------------|---------------------------|
| `sprint-NNN-events.jsonl` | fixed | `event-stream.ts` / `event-bus.ts` | Yes |
| `sprint-NNN-seq` | fixed | `sprint-spawner.ts` | Yes (but in `COUNTER_PATTERNS` → deleted, not archived) |
| `sprint-NNN-checkpoint.json` | fixed | `sprint-checkpoint.ts` | Yes |
| `sprint-NNN-gate.json` | fixed | `sprint-finalizer.ts:976` (self-audit gate) | Yes |
| `sprint-NNN-pre-archive.tar.gz` | fixed | `sprint-finalizer.ts` | Yes |
| `sprint-NNN-pre-archive.sha256` | fixed | `sprint-finalizer.ts` | Yes |
| `sprint-NNN-metrics.jsonl` | fixed | `observability.ts:118` | **No — MISSING** |
| `sprint-NNN-panic-<timestamp>.json` | wildcard | `panic-guard.ts:96` | **No — MISSING** |

### The Retention System (`sprint-file-retention.ts`)

Retention runs automatically via `runRetention(root, completedSprintId, config)` in two places:

1. `sprint-finalizer.ts:1148` — automatically at the end of the CLEANUP phase
2. `cli/commands/cleanup.ts:218` — when the user runs `deckent cleanup` manually

The function executes three steps in order:

```
Step 1: cleanupCounters(sprintId)
  → DELETE -seq and -checkpoint-seq files for the completed sprint (ephemeral counters)

Step 2: migrateForensicFiles()
  → MOVE -layer3-scorecard.md and similar forensic artifacts to docs/audits/

Step 3: enforceRetention(config)
  → ARCHIVE sprints beyond the keep_last_n window
     Default: keep_last_n = 10
     Archive destination: .deckent/archive/sprints/
```

The `SPRINT_FILE_PATTERNS` array controls which files are matched for archiving in Step 3. Only files whose names match a pattern in this array are candidates for retention enforcement. Files that match no pattern are invisible to the retention system and accumulate indefinitely.

---

## Root Causes

### Root Cause 1 — `sprint-NNN-metrics.jsonl` Not in `SPRINT_FILE_PATTERNS`

`observability.ts` line 118 creates a metrics file per sprint:

```typescript
join(root, METRICS_DIR, `${sid}-metrics.jsonl`)
```

The `SPRINT_FILE_PATTERNS` array in `sprint-file-retention.ts` contains 7 patterns. The `/-metrics\.jsonl$/` pattern is not among them. Because the file is never matched, the retention system never sees it. Metrics files accumulate in `.deckent/` root permanently.

**Evidence:** `sprint-181-metrics.jsonl` through `sprint-186-metrics.jsonl` are all present in `.deckent/` root. Sprint-180's metrics file appears only in the archive because it was manually moved before this bug was identified.

### Root Cause 2 — `sprint-NNN-panic-<timestamp>.json` Not in `SPRINT_FILE_PATTERNS`

`panic-guard.ts` line 96 creates a panic snapshot per triggering event:

```typescript
`${event.sprintId}-panic-${safeTimestamp}.json`
```

The timestamp segment means a single fixed-suffix pattern cannot match these files — a wildcard regex `/-panic-[^/]*\.json$/` is required. No such pattern exists in `SPRINT_FILE_PATTERNS`, so panic files accumulate indefinitely.

**Evidence:** `sprint-182-panic-2026-05-21T10-42-36-280Z.json` is present in `.deckent/` root and has never been touched by the retention system.

### Root Cause 3 — `keep_last_n = 10` Is Too Permissive

`DEFAULT_RETENTION_CONFIG` sets `keep_last_n: 10`. The project's `.deckent/config.json` also explicitly sets `sprint_file_retention.keep_last_n: 10` (same value, no override effect).

With only 6 sprints currently in root (sprint-181 through sprint-186), the condition `completed_sprints > keep_last_n` is never satisfied: 6 < 10. Retention has never fired automatically for this project. Even when the count eventually reaches 11, only sprint-181 would be archived — sprints 182–186 (50+ files) would remain in root. At the current sprint cadence, `.deckent/` would not begin self-cleaning until approximately sprint-192.

A value of `keep_last_n = 2` matches the actual use case: the two most recent sprints' files are immediately useful for debugging; everything older belongs in the archive.

### Root Cause 4 — `-seq` Semantic Conflict Between `SPRINT_FILE_PATTERNS` and `COUNTER_PATTERNS`

The `-seq` suffix is listed in both arrays:

- `SPRINT_FILE_PATTERNS` — marks it for archiving in Step 3
- `COUNTER_PATTERNS` — marks it for deletion in Step 1

Step 1 runs before Step 3, so the current sprint's `-seq` file is deleted (correct behavior — it is ephemeral). For older sprints that were already archived before Step 1 ran (i.e., manually moved), `-seq` files appear in the archive. For sprints going through automated retention, the current sprint's `-seq` is deleted in Step 1, and older sprints' `-seq` files are archived in Step 3 only if they were not deleted when those sprints were the "current" sprint.

The conflict is not a correctness bug (the behavior is consistent with the intent: `-seq` is ephemeral for the running sprint), but it creates confusion because `-seq` appears in both arrays without any comment explaining the dual registration.

---

## Current State of `.deckent/` Root (2026-05-22)

| Metric | Value |
|--------|-------|
| Sprints with files in root | 6 (sprint-181 through sprint-186) |
| Estimated file count in root | 42+ |
| Sprints in archive | sprint-134 through sprint-180 (manually moved) |
| Metrics files in root | 6 (one per sprint, never archived) |
| Panic files in root | 1+ (sprint-182, never archived) |
| Last automatic retention run | Never (6 < keep_last_n=10) |
| Sprint at which auto-retention would first fire | sprint-192 (with current keep_last_n=10) |

---

## Fix Plan

Three changes to `src/orchestra/sprint-file-retention.ts` and one config change:

### Change 1 — Add `/-metrics\.jsonl$/` to `SPRINT_FILE_PATTERNS`

Adds the metrics file suffix to the array so that `sprint-NNN-metrics.jsonl` is matched during `enforceRetention()` and archived with the rest of the sprint's files.

### Change 2 — Add `/-panic-[^/]*\.json$/` to `SPRINT_FILE_PATTERNS`

Adds a wildcard regex to match the variable-timestamp panic file names. The `[^/]*` segment matches any timestamp string without crossing directory boundaries.

### Change 3 — Change `DEFAULT_RETENTION_CONFIG.keep_last_n` from `10` to `2`

Aligns the default with the practical need: keep the two most recent sprints' files immediately accessible in root, archive everything older. This is consistent with the archive structure already established in `.deckent/archive/sprints/`.

### Change 4 — Update `.deckent/config.json` `sprint_file_retention.keep_last_n` from `10` to `2`

The project config explicitly sets `keep_last_n: 10`, which overrides the default. Both must be updated; updating only the code default leaves the config override in effect.

### Post-Fix Expected Behavior

After sprint-186 CLEANUP completes with `keep_last_n=2`:

- `.deckent/` root: only `sprint-185-*` and `sprint-186-*` files (12–14 files)
- `.deckent/archive/sprints/`: sprint-134 through sprint-184 (automatically managed)
- After sprint-187: sprint-186 and sprint-187 in root; sprint-185 archived
- Metrics and panic files included in archive for each sprint

---

## OSS Readiness Check

| Check | Status | Notes |
|-------|--------|-------|
| `sprint-NNN-metrics.jsonl` in `SPRINT_FILE_PATTERNS` | Not ready | Missing pattern → permanent accumulation |
| `sprint-NNN-panic-<timestamp>.json` in `SPRINT_FILE_PATTERNS` | Not ready | Missing wildcard pattern → permanent accumulation |
| `keep_last_n` default is appropriate | Not ready | 10 is too permissive; auto-retention has never fired |
| `keep_last_n` in `.deckent/config.json` | Not ready | Explicit `10` overrides even a corrected default |
| `-seq` dual-registration documented | Marginal | Works correctly but no inline comment explains intent |
| Archive destination consistent | Ready | `.deckent/archive/sprints/` matches existing structure |
| `runRetention` called at CLEANUP phase end | Ready | `sprint-finalizer.ts:1148` — automatic |
| `runRetention` callable manually | Ready | `deckent cleanup` invokes it |
| Retention config exposed to users | Ready | `sprint_file_retention` key in `.deckent/config.json` |
