# Config Backup Rotation — Design Spec

**Date:** 2026-04-13
**Status:** Approved for implementation
**Scope:** `src/core/config-migration.ts` + new helper + tests

## Problem

`migrateConfig()` creates a timestamped backup (`config.json.bak.<ISO>`) before every schema migration but never removes old ones. Observed state in `.deckent/`: **13 backup files** dating back to 2026-03-26, plus one legacy timestamp-less `config.json.bak` from 2026-03-25. Unbounded growth violates the "kur-çalıştır clean install" product vision — users should not see disk clutter accumulating in `.deckent/`.

## Goals

1. Keep only the **3 most recent** timestamped backups after each migration
2. Preserve the legacy timestamp-less `config.json.bak` (initial snapshot, never rotated)
3. Clean up the current 13-file backlog immediately (same rotation logic, one-shot)
4. Zero risk to recovery: prune happens **after** new backup is successfully written

## Non-Goals

- Configurable retention count (hardcoded `3` for now; promote to config field only if user requests)
- Compression or archival of pruned backups
- Backup rotation for other files (`.brain/`, task files, etc.)

## Architecture

### New Helper: `pruneConfigBackups(configPath, keepCount)`

**Location:** `src/core/config-migration.ts` (same file — co-located with backup creation for locality)

**Signature:**
```typescript
export function pruneConfigBackups(
  configPath: string,
  keepCount: number = 3,
): string[]
```

**Returns:** Array of deleted file paths (empty if nothing pruned) — used for structured logging and tests.

**Algorithm:**
1. Derive directory and basename from `configPath` (e.g., `.deckent/config.json` → dir `.deckent`, base `config.json`)
2. Read directory entries synchronously
3. Filter entries matching ISO-8601 timestamped backup pattern: `^{base}\.bak\.\d{4}-\d{2}-\d{2}T` — this regex **automatically excludes** the legacy `config.json.bak` (no dot after `bak`) and any manually-named `.bak.backup`-style files
4. Sort matched entries **descending by filename** (lexicographic ISO-8601 sort equals chronological sort)
5. Slice `[keepCount:]` → the tail to delete
6. `unlinkSync` each, collect paths
7. Return deleted paths

**Why filename sort not mtime:** Restored backups may have their mtime clobbered; the ISO timestamp baked into the filename is immutable and lexicographically sortable.

### Integration into `migrateConfig()`

After the `writeFileSync(configPath, ...)` at line 258:

```typescript
const prunedBackups = pruneConfigBackups(configPath, 3);
if (prunedBackups.length > 0) {
  structuredLog('info', 'config_backups_pruned', {
    configPath,
    kept: 3,
    removed: prunedBackups.length,
  });
}
```

If `structuredLog` is not already imported in this file, import it; otherwise fall back to silent prune (the function returns the list either way for downstream visibility).

### One-Shot Backlog Cleanup

The current 13-file backlog will be cleaned by running the helper once against the existing `.deckent/config.json`. Two options:

- **Option 1 (chosen):** Invoke the function via a throwaway Node invocation after the code lands, or simply let the next real migration trigger it. Since migrations can be sparse, preferring explicit immediate cleanup via a one-liner `node -e "import('./dist/core/config-migration.js').then(m => m.pruneConfigBackups('.deckent/config.json', 3))"`.
- **Option 2 (rejected):** Manual `rm` of old files — inconsistent with the automated path we're building.

## Data Flow

```
migrateConfig() called
  ├─ detects missing fields or legacy rename
  ├─ creates new .bak.<timestamp>   (safety snapshot)
  ├─ writes merged config            (mutation)
  └─ pruneConfigBackups(path, 3)     (cleanup, AFTER mutation)
       ├─ readdirSync(dir)
       ├─ filter by /^config\.json\.bak\.\d{4}-\d{2}-\d{2}T/
       ├─ sort desc by name
       ├─ slice(3) → tail
       └─ unlinkSync each
```

**Ordering invariant:** The write-then-prune order guarantees we never delete a backup before its replacement exists. Even if `pruneConfigBackups` throws, the migration is already complete and the newest backup is preserved.

## Error Handling

- `readdirSync` fails (EACCES): catch, log warning, return empty array — do not block migration
- `unlinkSync` fails on one file (EBUSY/EACCES): log warning, continue with remaining files, return partial list
- Directory does not exist: return empty array (cannot happen in practice since we just wrote a file there, but defensive)

Failure in pruning **must never** throw from `migrateConfig()` — migration success is more important than cleanup hygiene.

## Testing

New test file: `tests/core/config-backup-rotation.test.ts`

| # | Scenario | Expected |
|---|---|---|
| 1 | 5 timestamped backups exist, prune(3) | 3 newest kept, 2 oldest deleted, returns 2 paths |
| 2 | Legacy `config.json.bak` (no timestamp) + 4 timestamped | Legacy preserved, 3 newest timestamped kept, 1 deleted |
| 3 | 0 backups | No-op, returns `[]` |
| 4 | 2 backups, keepCount=3 | No-op (fewer than keep), returns `[]` |
| 5 | Unrelated file `other.bak.2026-04-10T...` in same dir | Untouched, filter matches only `config.json.bak.*` |
| 6 | `unlinkSync` throws on one file | Other files still deleted, no exception propagates |
| 7 | Integration: `migrateConfig()` triggers prune after migration | Backup count ≤ 3 after call |

## Verify Loop

- `tsc --noEmit` → 0 errors
- `npx vitest run tests/core/config-backup-rotation.test.ts` → 0 fail
- `npx vitest run` → no regression in existing `config-migration.test.ts` tests
- Post-implementation one-shot: `.deckent/` contains exactly **3** `config.json.bak.<timestamp>` files + the legacy `config.json.bak`

## File Paths Touched

- `src/core/config-migration.ts` — add `pruneConfigBackups` + call site in `migrateConfig`
- `tests/core/config-backup-rotation.test.ts` — new test file

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Regex false-negative (misses valid backup) | Explicit ISO-8601 date prefix in regex, tested with real timestamp samples |
| Regex false-positive (deletes unrelated file) | Prefix anchored to exact `config.json` base, date pattern required |
| Prune runs before write (data loss) | Ordering enforced: `writeFileSync` → `pruneConfigBackups` |
| Silent failure masks bugs | `structuredLog` on every prune with count |

## Future Extensions (Not This Sprint)

- `config_backup_retention` field in `DeckentConfig` for user-adjustable count
- Apply same pattern to `.deckent/safety-point.json` if it grows unbounded backups
- `deckent doctor --cleanup-backups` CLI command
