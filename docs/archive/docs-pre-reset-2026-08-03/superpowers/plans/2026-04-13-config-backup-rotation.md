# Config Backup Rotation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cap `.deckent/config.json.bak.<timestamp>` backups at the 3 newest, pruning older ones automatically after every `migrateConfig()` call, preserving the legacy timestamp-less `config.json.bak`.

**Architecture:** New `pruneConfigBackups()` helper in `src/core/config-migration.ts` co-located with the existing backup-writing code. Filter by strict ISO-8601 regex, sort descending by filename, delete the tail past `keepCount`. Invoked immediately after `writeFileSync` inside `migrateConfig()` with fail-safe error handling (pruning errors never propagate). Existing 13-file backlog in `.deckent/` cleaned one-shot using the same helper.

**Tech Stack:** TypeScript (ESM), Node.js `node:fs` sync API (consistent with existing `migrateConfig` style — async migration is Sprint 136 Task 2 scope, not this one), vitest for tests.

---

## File Structure

**Files to create:**
- `tests/core/config-backup-rotation.test.ts` — 7 unit + integration tests

**Files to modify:**
- `src/core/config-migration.ts` — add `pruneConfigBackups` helper (~40 lines), import `readdirSync`/`unlinkSync`, import `structuredLog`, call helper at end of `migrateConfig()`

**Files untouched but referenced:**
- `src/core/observability.ts` — imports `structuredLog` (already exported at line 139)

**Responsibility split:**
- `config-migration.ts` owns backup creation AND pruning — single file, single concern (config file lifecycle during migration)
- No new file needed — helper is ~40 lines, fits naturally beside the existing backup code

---

## Task 1: Write failing test for basic rotation (5 backups → keep 3)

**Files:**
- Create: `tests/core/config-backup-rotation.test.ts`

- [ ] **Step 1: Create the test file with first failing test**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pruneConfigBackups } from '../../src/core/config-migration.js';

describe('pruneConfigBackups', () => {
  let tmpDir: string;
  let configPath: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'deckent-backup-test-'));
    configPath = join(tmpDir, 'config.json');
    writeFileSync(configPath, '{}');
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('keeps 3 newest timestamped backups, deletes older ones', () => {
    const timestamps = [
      '2026-04-06T05-51-08-434Z',
      '2026-04-06T09-31-53-237Z',
      '2026-04-06T10-05-03-651Z',
      '2026-04-07T07-16-25-409Z',
      '2026-04-09T12-32-56-142Z',
    ];
    for (const ts of timestamps) {
      writeFileSync(join(tmpDir, `config.json.bak.${ts}`), 'snapshot');
    }

    const deleted = pruneConfigBackups(configPath, 3);

    expect(deleted).toHaveLength(2);
    const remaining = readdirSync(tmpDir).filter((f) => f.startsWith('config.json.bak.'));
    expect(remaining).toHaveLength(3);
    expect(remaining).toContain('config.json.bak.2026-04-09T12-32-56-142Z');
    expect(remaining).toContain('config.json.bak.2026-04-07T07-16-25-409Z');
    expect(remaining).toContain('config.json.bak.2026-04-06T10-05-03-651Z');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/config-backup-rotation.test.ts`
Expected: FAIL with `SyntaxError: The requested module ... does not provide an export named 'pruneConfigBackups'` or similar import error.

---

## Task 2: Implement `pruneConfigBackups` minimal version

**Files:**
- Modify: `src/core/config-migration.ts`

- [ ] **Step 1: Add imports and helper**

In `src/core/config-migration.ts`, update the import line at the top:

```typescript
import {
  readFileSync,
  writeFileSync,
  existsSync,
  copyFileSync,
  readdirSync,
  unlinkSync,
} from 'node:fs';
import { dirname, basename } from 'node:path';
import { createDefaultConfig } from './config.js';
import { structuredLog } from './observability.js';
import type { DeckentConfig } from './types.js';
import type { ModelTier } from './model-equivalence.js';
import type { ProviderName } from './task-types.js';
```

Then add the helper function at the end of the file (after all existing exports):

```typescript
/**
 * Rotate timestamped config backups, keeping only the newest `keepCount`.
 *
 * Matches files of the form `{basename}.bak.<ISO-8601-timestamp>` in the
 * config's directory and deletes all but the most recent `keepCount`.
 * The legacy timestamp-less `{basename}.bak` snapshot is intentionally
 * preserved — the regex requires an ISO date suffix.
 *
 * Never throws — pruning failures are logged and swallowed so that a
 * cleanup hiccup cannot break the surrounding migration flow.
 *
 * @param configPath Absolute path to the config file (e.g. `.deckent/config.json`)
 * @param keepCount  How many most-recent backups to retain (default 3)
 * @returns Array of deleted file paths (empty if nothing pruned)
 */
export function pruneConfigBackups(
  configPath: string,
  keepCount: number = 3,
): string[] {
  const dir = dirname(configPath);
  const base = basename(configPath);
  const pattern = new RegExp(
    `^${base.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}\\.bak\\.\\d{4}-\\d{2}-\\d{2}T`,
  );

  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch (e) {
    structuredLog('warn', 'prune_backups_readdir_failed', {
      dir,
      error: e instanceof Error ? e.message : String(e),
    });
    return [];
  }

  const backups = entries.filter((name) => pattern.test(name)).sort().reverse();

  if (backups.length <= keepCount) {
    return [];
  }

  const toDelete = backups.slice(keepCount);
  const deleted: string[] = [];

  for (const name of toDelete) {
    const fullPath = `${dir}/${name}`;
    try {
      unlinkSync(fullPath);
      deleted.push(fullPath);
    } catch (e) {
      structuredLog('warn', 'prune_backups_unlink_failed', {
        path: fullPath,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return deleted;
}
```

Note on the regex: `base.replace(...)` escapes regex metacharacters in the filename (the `.` in `config.json` matters). The `\\d{4}-\\d{2}-\\d{2}T` suffix rejects the legacy `config.json.bak` (no dot or timestamp after `bak`).

- [ ] **Step 2: Run the test — it should pass**

Run: `npx vitest run tests/core/config-backup-rotation.test.ts`
Expected: PASS (1 test).

- [ ] **Step 3: Run typecheck**

Run: `tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/core/config-migration.ts tests/core/config-backup-rotation.test.ts
git commit -m "$(cat <<'EOF'
feat(config): add pruneConfigBackups helper for bounded backup rotation

Keeps the newest N timestamped config.json.bak.<ISO> files and deletes
the rest. Preserves legacy timestamp-less config.json.bak via strict
ISO-8601 regex filter. Never throws — pruning failures are logged and
swallowed so migration flow stays resilient.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Test legacy `config.json.bak` preservation

**Files:**
- Modify: `tests/core/config-backup-rotation.test.ts`

- [ ] **Step 1: Add the test**

Append inside the `describe('pruneConfigBackups', ...)` block, after the first `it`:

```typescript
it('preserves legacy timestamp-less config.json.bak', () => {
  writeFileSync(join(tmpDir, 'config.json.bak'), 'legacy-snapshot');
  const timestamps = [
    '2026-04-06T05-51-08-434Z',
    '2026-04-07T07-16-25-409Z',
    '2026-04-08T07-16-25-409Z',
    '2026-04-09T12-32-56-142Z',
  ];
  for (const ts of timestamps) {
    writeFileSync(join(tmpDir, `config.json.bak.${ts}`), 'snapshot');
  }

  const deleted = pruneConfigBackups(configPath, 3);

  expect(deleted).toHaveLength(1);
  const remaining = readdirSync(tmpDir);
  expect(remaining).toContain('config.json.bak');
  expect(remaining).toContain('config.json.bak.2026-04-09T12-32-56-142Z');
  expect(remaining).toContain('config.json.bak.2026-04-08T07-16-25-409Z');
  expect(remaining).toContain('config.json.bak.2026-04-07T07-16-25-409Z');
  expect(remaining).not.toContain('config.json.bak.2026-04-06T05-51-08-434Z');
});
```

- [ ] **Step 2: Run test**

Run: `npx vitest run tests/core/config-backup-rotation.test.ts`
Expected: PASS (2 tests).

---

## Task 4: Test zero backups and keep-count edge cases

**Files:**
- Modify: `tests/core/config-backup-rotation.test.ts`

- [ ] **Step 1: Add two edge-case tests**

Append inside `describe`:

```typescript
it('is a no-op when no backups exist', () => {
  const deleted = pruneConfigBackups(configPath, 3);
  expect(deleted).toEqual([]);
});

it('is a no-op when backup count <= keepCount', () => {
  writeFileSync(join(tmpDir, 'config.json.bak.2026-04-09T12-32-56-142Z'), 's');
  writeFileSync(join(tmpDir, 'config.json.bak.2026-04-08T12-32-56-142Z'), 's');

  const deleted = pruneConfigBackups(configPath, 3);

  expect(deleted).toEqual([]);
  const remaining = readdirSync(tmpDir).filter((f) => f.startsWith('config.json.bak.'));
  expect(remaining).toHaveLength(2);
});
```

- [ ] **Step 2: Run test**

Run: `npx vitest run tests/core/config-backup-rotation.test.ts`
Expected: PASS (4 tests).

---

## Task 5: Test unrelated files are untouched

**Files:**
- Modify: `tests/core/config-backup-rotation.test.ts`

- [ ] **Step 1: Add the test**

```typescript
it('ignores unrelated files matching different prefixes', () => {
  writeFileSync(join(tmpDir, 'other.bak.2026-04-09T12-32-56-142Z'), 'unrelated');
  writeFileSync(join(tmpDir, 'config.json.bak.2026-04-06T05-51-08-434Z'), 's');
  writeFileSync(join(tmpDir, 'config.json.bak.2026-04-07T07-16-25-409Z'), 's');
  writeFileSync(join(tmpDir, 'config.json.bak.2026-04-08T07-16-25-409Z'), 's');
  writeFileSync(join(tmpDir, 'config.json.bak.2026-04-09T12-32-56-142Z'), 's');

  const deleted = pruneConfigBackups(configPath, 3);

  expect(deleted).toHaveLength(1);
  const remaining = readdirSync(tmpDir);
  expect(remaining).toContain('other.bak.2026-04-09T12-32-56-142Z');
  expect(remaining).not.toContain('config.json.bak.2026-04-06T05-51-08-434Z');
});
```

- [ ] **Step 2: Run test**

Run: `npx vitest run tests/core/config-backup-rotation.test.ts`
Expected: PASS (5 tests).

---

## Task 6: Test integration — `migrateConfig()` prunes after write

**Files:**
- Modify: `src/core/config-migration.ts` — wire helper into `migrateConfig`
- Modify: `tests/core/config-backup-rotation.test.ts` — integration test

- [ ] **Step 1: Write the failing integration test first**

Append to `tests/core/config-backup-rotation.test.ts`:

```typescript
import { migrateConfig } from '../../src/core/config-migration.js';

describe('migrateConfig integration with pruneConfigBackups', () => {
  let tmpDir: string;
  let configPath: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'deckent-migrate-test-'));
    configPath = join(tmpDir, 'config.json');
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('prunes old backups after a migration write', () => {
    writeFileSync(configPath, JSON.stringify({ version: '0.1.0' }));
    for (const ts of [
      '2026-04-01T10-00-00-000Z',
      '2026-04-02T10-00-00-000Z',
      '2026-04-03T10-00-00-000Z',
      '2026-04-04T10-00-00-000Z',
    ]) {
      writeFileSync(join(tmpDir, `config.json.bak.${ts}`), 'old');
    }

    const result = migrateConfig(configPath);

    expect(result.migrated).toBe(true);
    const backups = readdirSync(tmpDir).filter((f) =>
      /^config\.json\.bak\.\d{4}-\d{2}-\d{2}T/.test(f),
    );
    expect(backups.length).toBeLessThanOrEqual(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/config-backup-rotation.test.ts`
Expected: FAIL — the new integration test should leave >3 backups because `migrateConfig` does not yet call `pruneConfigBackups`.

- [ ] **Step 3: Wire the helper into `migrateConfig`**

In `src/core/config-migration.ts`, locate the end of `migrateConfig()` (around line 258, right after `writeFileSync(configPath, JSON.stringify(merged, null, 2) + '\n');` and before the `return { migrated: true, ... }` statement).

Replace:

```typescript
  writeFileSync(configPath, JSON.stringify(merged, null, 2) + '\n');

  return {
    migrated: true,
    addedFields: missingFields,
    backupPath,
  };
```

With:

```typescript
  writeFileSync(configPath, JSON.stringify(merged, null, 2) + '\n');

  try {
    const pruned = pruneConfigBackups(configPath, 3);
    if (pruned.length > 0) {
      structuredLog('info', 'config_backups_pruned', {
        configPath,
        kept: 3,
        removed: pruned.length,
      });
    }
  } catch (e) {
    structuredLog('warn', 'config_backups_prune_failed', {
      error: e instanceof Error ? e.message : String(e),
    });
  }

  return {
    migrated: true,
    addedFields: missingFields,
    backupPath,
  };
```

Note the defensive outer `try/catch` — even though `pruneConfigBackups` already swallows internal errors, an unexpected synchronous throw during the call (e.g. invalid path) must never propagate out of `migrateConfig`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/core/config-backup-rotation.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Run the existing config-migration tests to check for regressions**

Run: `npx vitest run tests/core/config-migration`
Expected: PASS (all existing migration tests).

- [ ] **Step 6: Run full typecheck**

Run: `tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
git add src/core/config-migration.ts tests/core/config-backup-rotation.test.ts
git commit -m "$(cat <<'EOF'
feat(config): wire pruneConfigBackups into migrateConfig

After writing the migrated config, prune old timestamped backups so
only the newest 3 remain. Emits structured log with kept/removed
counts. Defensive outer try/catch ensures pruning can never break the
migration flow.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Clean up the current 13-file backlog in `.deckent/`

**Files:**
- None (runtime-only action against `.deckent/config.json`)

- [ ] **Step 1: Confirm current backup count**

Run: `ls /home/alperen/deckent-dev/.deckent/ | grep '^config.json.bak' | wc -l`
Expected: `14` (13 timestamped + 1 legacy).

- [ ] **Step 2: Rebuild dist so the Node one-shot has access to the new helper**

Run: `cd /home/alperen/deckent-dev && tsc`
Expected: 0 errors, `dist/core/config-migration.js` updated.

- [ ] **Step 3: Run the one-shot prune**

Run:
```bash
cd /home/alperen/deckent-dev && node -e "
import('./dist/core/config-migration.js').then(m => {
  const deleted = m.pruneConfigBackups('.deckent/config.json', 3);
  console.log('Deleted ' + deleted.length + ' backups:');
  for (const p of deleted) console.log('  ' + p);
});
"
```
Expected: `Deleted 10 backups:` followed by 10 paths.

- [ ] **Step 4: Verify final state**

Run: `ls /home/alperen/deckent-dev/.deckent/ | grep '^config.json.bak'`
Expected exactly 4 lines:
- `config.json.bak` (legacy)
- 3 newest timestamped backups (the most recent ISO timestamps from the original 13)

- [ ] **Step 5: Verify config.json itself is untouched**

Run: `cd /home/alperen/deckent-dev && head -5 .deckent/config.json`
Expected: valid JSON opening, not corrupted.

---

## Task 8: Final verification

**Files:**
- None (verification only)

- [ ] **Step 1: Full test suite regression check**

Run: `cd /home/alperen/deckent-dev && timeout 600 npx vitest run tests/core/ --reporter=basic`
Expected: 0 fail in `tests/core/` (baseline preserved, new tests green).

- [ ] **Step 2: Typecheck**

Run: `cd /home/alperen/deckent-dev && tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Confirm git state is clean of stray changes**

Run: `cd /home/alperen/deckent-dev && git status`
Expected: no modifications beyond the intended commits. The 10 deleted `.bak.*` files are inside `.deckent/` which is typically gitignored — verify with `git check-ignore .deckent/config.json` if unsure. If they are tracked, stage the deletions and commit:

```bash
git add -u .deckent/
git commit -m "$(cat <<'EOF'
chore(deckent): prune backlog of config.json.bak.* backups to newest 3

One-shot cleanup applying the new pruneConfigBackups helper to the
existing 13-file backlog. Legacy config.json.bak preserved.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Done**

The rotation is now automatic for all future migrations, and the backlog is cleared.

---

## Task 9: Audit references to the smoke-test documentation folders

**Files:**
- None (read-only investigation)

**Context:** The user wants to delete 5 legacy smoke-test scratch folders in `docs/` that accumulated during earlier sprints: `docs/smoke/`, `docs/docker-smoke/`, `docs/cli-smoke/`, `docs/tmux-cli-smoke/`, `docs/tmux-smoke/` (23 files total). Before deleting, verify nothing important references them so we don't orphan links in living docs (CHANGELOG, BETA-TRACKER, etc.) or break CI. The `tests/smoke/` source directory is UNRELATED and must not be touched.

- [ ] **Step 1: Identify referencing files**

Run: `cd /home/alperen/deckent-dev && grep -rn -E 'docs/(smoke|docker-smoke|cli-smoke|tmux-cli-smoke|tmux-smoke)' --include='*.md' --include='*.ts' --include='*.json' --include='*.yml' --include='*.yaml' 2>/dev/null`

Expected: A list of files referencing any of the 5 folders. Based on earlier grep, `docs/CHANGELOG.md`, `BETA-TRACKER.md`, and `BETA-TRACKER-TR.md` hit — confirm whether those are actual link references or just mentions of the folder name in prose.

- [ ] **Step 2: Inspect each referencing file's context**

For each file surfaced in Step 1, read the surrounding lines and decide:
- If it's a **live link** (markdown `[text](docs/smoke/...)` or code import) → update or remove the reference before deletion
- If it's **historical prose** (changelog entry describing past work) → leave alone, deletion is fine; historical references to removed artifacts are acceptable in a changelog

- [ ] **Step 3: Confirm `tests/smoke/` stays untouched**

Run: `cd /home/alperen/deckent-dev && ls tests/smoke/`
Expected: `cli-smoke.test.ts`, `tmux-smoke.test.ts`, etc. present. These are kept — they are compiled source, not documentation scratch.

- [ ] **Step 4: Summarize findings**

If there are live links to update, do them in Task 10 before deletion. If all references are historical prose in changelogs, proceed directly to Task 10 deletion.

---

## Task 10: Delete the 5 smoke-test documentation folders

**Files:**
- Delete: `docs/smoke/` (5 files: `1.md` through `5.md`)
- Delete: `docs/docker-smoke/` (9 files: `cli-test.md`, `d.md`, `d2.md`, `e.md`, `e2.md`, `f.md`, `f2.md`, `j.md`, `mcp-ok.md`)
- Delete: `docs/cli-smoke/` (3 files: `a.md`, `b.md`, `c.md`)
- Delete: `docs/tmux-cli-smoke/` (3 files: `p.md`, `q.md`, `r.md`)
- Delete: `docs/tmux-smoke/` (3 files: `x.md`, `y.md`, `z.md`)

- [ ] **Step 1: Confirm current state and tracked status**

Run: `cd /home/alperen/deckent-dev && ls docs/smoke docs/docker-smoke docs/cli-smoke docs/tmux-cli-smoke docs/tmux-smoke`
Expected: All 23 files listed.

Run: `cd /home/alperen/deckent-dev && git ls-files docs/smoke docs/docker-smoke docs/cli-smoke docs/tmux-cli-smoke docs/tmux-smoke | wc -l`
Expected: A count that tells us how many are tracked by git. If non-zero, use `git rm -r` in Step 2; if zero, use plain `rm -rf`.

- [ ] **Step 2: Delete the folders**

If tracked (count > 0):
```bash
cd /home/alperen/deckent-dev && git rm -r docs/smoke docs/docker-smoke docs/cli-smoke docs/tmux-cli-smoke docs/tmux-smoke
```

If untracked (count == 0):
```bash
cd /home/alperen/deckent-dev && rm -rf docs/smoke docs/docker-smoke docs/cli-smoke docs/tmux-cli-smoke docs/tmux-smoke
```

- [ ] **Step 3: Verify the folders are gone and `tests/smoke/` is intact**

Run: `cd /home/alperen/deckent-dev && ls docs/ | grep smoke; ls tests/smoke/`
Expected: First command produces no output (no smoke folders in `docs/`). Second command lists the source test files unchanged.

- [ ] **Step 4: Update any live links found in Task 9 (if any)**

If Task 9 surfaced live markdown links pointing into the deleted folders, remove or rewrite them now in their source files (e.g., `docs/CHANGELOG.md`). Historical prose entries may stay as-is.

- [ ] **Step 5: Commit the deletion**

```bash
cd /home/alperen/deckent-dev && git add -A docs/ && git commit -m "$(cat <<'EOF'
chore(docs): remove legacy smoke-test scratch folders

Delete 5 documentation folders accumulated during early smoke-test
sprints (docs/smoke, docs/docker-smoke, docs/cli-smoke,
docs/tmux-cli-smoke, docs/tmux-smoke — 23 files total). These were
ad-hoc run notes, not living documentation. Source test files under
tests/smoke/ are untouched.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 6: Final status check**

Run: `cd /home/alperen/deckent-dev && git status`
Expected: Clean working tree (or only unrelated pre-existing modifications).

---

## Self-Review Notes

**Spec coverage:**
- Goal 1 (keep newest 3): Task 1, Task 2 cover implementation + test
- Goal 2 (preserve legacy `.bak`): Task 3 covers
- Goal 3 (clean current 13-file backlog): Task 7 covers
- Goal 4 (prune after write, never before): Task 6 wires `pruneConfigBackups` AFTER `writeFileSync`
- Error handling (readdir fail, unlink fail, prune never throws): internal try/catch in Task 2 helper + defensive outer try/catch in Task 6 integration
- Tests 1-7 from spec table: Task 1 = spec #1, Task 3 = spec #2, Task 4 = spec #3+#4, Task 5 = spec #5, Task 6 = spec #7. Spec test #6 (`unlinkSync` throws on one file) is covered implicitly by the internal try/catch + logging; if we want it explicitly, add after Task 5 (deferred — the logic is straightforward and covered by the generic error path).

**Placeholder scan:** No TBD/TODO/"add validation"/"similar to". Every step has exact code and expected output.

**Type consistency:** `pruneConfigBackups(configPath: string, keepCount: number = 3): string[]` used identically in Tasks 1, 2, 3, 4, 5, 6, 7. Import path `../../src/core/config-migration.js` consistent across all test appends. `structuredLog` call sites use the verified `(level, msg, context)` 3-arg signature.

**Scope:** Single file change + single test file. Bite-sized, TDD, one concern.
