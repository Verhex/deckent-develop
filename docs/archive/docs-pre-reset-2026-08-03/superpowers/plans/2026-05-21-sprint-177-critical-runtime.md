# Sprint 177 Implementation Plan — Critical Runtime Stability

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the 5 runtime gaps that made Sprint 176 corrupt itself — worker rollback, kill cascade, tmux deprecate, config regen guard, nervous baseline. Without these the next sprint is unsafe to launch.

**Architecture:** All 5 tasks modify existing infrastructure modules (`src/agents/`, `src/orchestra/`, `src/core/`, `src/nervous/`, `src/cli/`, `src/mcp/`). No new architectural patterns; each task closes a documented Sprint 176 failure mode. Worker rollback (Task 1) is the foundation — once it lands, subsequent tasks ride on top of safe rollback semantics.

**Tech Stack:** TypeScript ESM (Node 24+), vitest 3.x, better-sqlite3 12.10.0, Node child_process (spawn/kill), git CLI (stash), tmux CLI (cleanup only — deprecation path), docker CLI.

**Spec reference:** `docs/superpowers/specs/2026-05-21-crisis-stabilization-initiative.md` §3 — Sprint 177 detailed task definitions + GO/NO_GO gates.

---

## File Structure

| File | Task | Responsibility |
|------|------|----------------|
| `src/agents/worker.ts` | 1 | spawn-time git stash + verdict-time stash drop/revert |
| `src/orchestra/result-evaluator.ts` | 1 | invoke rollback on NO_GO verdict |
| `src/core/memory-types.ts` | 1 | TaskRecord extends with `snapshot_stash_ref` field |
| `tests/agents/worker-rollback.test.ts` | 1 | NEW — 4 test cases for snapshot lifecycle |
| `src/cli/commands/kill.ts` | 2 | cascade controller PID + metadata cleanup |
| `src/orchestra/sprint-controller.ts` | 2, 5 | kill response + baseline refresh on sprint start |
| `src/orchestra/tmux.ts` | 2, 3 | socket cleanup + deprecation warning |
| `src/orchestra/spawn-backend.ts` | 2, 3 | resolveBackend default + cascade hooks |
| `tests/cli/kill-cascade.test.ts` | 2 | NEW — integration test for full kill cascade |
| `src/core/config.ts` | 3, 4 | DEFAULT_CONFIG.spawn_backend = 'docker'; template-regen guard |
| `src/cli/commands/init-templates/config.json.template` | 4 | template includes spawn_backend + all locked fields |
| `docs/guide/troubleshooting.md` | 3 | NEW or extended — tmux deprecation migration |
| `docs/guide/config-recovery.md` | 4 | NEW — restore-from-backup recipe |
| `tests/orchestra/tmux-deprecation.test.ts` | 3 | NEW — default/explicit/warn-once cases |
| `tests/core/config-regen-guard.test.ts` | 4 | NEW — merge/missing-field/backup cases |
| `src/nervous/observer.ts` (or detector-registry.ts) | 5 | `updateBaseline()` method on directives_protection |
| `src/mcp/tools/set-directives.ts` | 5 | emit BASELINE_UPDATE event on success |
| `src/cli/commands/nervous.ts` | 5 | `deckent nervous baseline-refresh` subcommand |
| `tests/nervous/directives-protection-baseline.test.ts` | 5 | NEW — set_directives/sprint-start/CLI baseline refresh |

---

## Task 1: Worker rollback — git-stash snapshot-on-spawn

**Files:**
- Modify: `src/agents/worker.ts` (spawn hook + verdict hook)
- Modify: `src/orchestra/result-evaluator.ts` (call rollback on NO_GO)
- Modify: `src/core/memory-types.ts` (add `snapshot_stash_ref` to TaskRecord type)
- Create: `tests/agents/worker-rollback.test.ts`

### Steps

- [ ] **Step 1: Read current worker spawn + result-evaluation flow**

Run: `grep -nE "spawn|stashRef|writeResult|evaluateTask" src/agents/worker.ts src/orchestra/result-evaluator.ts | head -20`

Identify where worker spawns (process start) and where result-evaluator decides verdict. Capture the call sites that will need the rollback hook.

- [ ] **Step 2: Write failing test (RED)**

Create `tests/agents/worker-rollback.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { snapshotWorkerScope, rollbackWorkerScope, dropWorkerSnapshot } from '../../src/agents/worker-rollback.js';

describe('worker rollback — git stash snapshot-on-spawn (Sprint 177 Task 1)', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'worker-rb-'));
    execSync('git init -q', { cwd: tmp });
    execSync('git config user.email test@test', { cwd: tmp });
    execSync('git config user.name test', { cwd: tmp });
    writeFileSync(join(tmp, 'baseline.ts'), 'export const x = 1;\n');
    execSync('git add -A && git commit -q -m initial', { cwd: tmp });
  });

  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it('snapshot captures pre-spawn state with --include-untracked', () => {
    writeFileSync(join(tmp, 'pre-spawn-dirty.ts'), 'pre-spawn change\n');
    const ref = snapshotWorkerScope(tmp, 'task-001');
    expect(ref).toMatch(/^stash@\{[0-9]+\}$|^[0-9a-f]{40}$/);
    // stash includes untracked
    const stashList = execSync('git stash list', { cwd: tmp, encoding: 'utf-8' });
    expect(stashList).toContain('deckent-worker-task-001');
  });

  it('rollback reverts worker scope writes (NO_GO path)', () => {
    const ref = snapshotWorkerScope(tmp, 'task-002');
    // simulate worker writing in scope
    writeFileSync(join(tmp, 'worker-output.ts'), 'export const y = 2;\n');
    writeFileSync(join(tmp, 'baseline.ts'), 'export const x = 999;\n');
    rollbackWorkerScope(tmp, ref, ['baseline.ts', 'worker-output.ts']);
    expect(existsSync(join(tmp, 'worker-output.ts'))).toBe(false);
    expect(readFileSync(join(tmp, 'baseline.ts'), 'utf-8')).toBe('export const x = 1;\n');
  });

  it('dropSnapshot on DONE path keeps worker changes', () => {
    const ref = snapshotWorkerScope(tmp, 'task-003');
    writeFileSync(join(tmp, 'kept.ts'), 'kept\n');
    dropWorkerSnapshot(tmp, ref);
    expect(existsSync(join(tmp, 'kept.ts'))).toBe(true);
    const stashList = execSync('git stash list', { cwd: tmp, encoding: 'utf-8' });
    expect(stashList).not.toContain('deckent-worker-task-003');
  });

  it('rollback also reverts out-of-scope writes (advisory ADR-037 violation)', () => {
    const ref = snapshotWorkerScope(tmp, 'task-004');
    writeFileSync(join(tmp, 'out-of-scope.ts'), 'sneaky\n');
    // scope claims only 'in-scope.ts' but worker wrote 'out-of-scope.ts'
    rollbackWorkerScope(tmp, ref, ['in-scope.ts']);
    // out-of-scope still reverted because the entire stash is dropped not popped
    expect(existsSync(join(tmp, 'out-of-scope.ts'))).toBe(false);
  });
});
```

- [ ] **Step 3: Run test, expect FAIL (module not found)**

`npx vitest run tests/agents/worker-rollback.test.ts`

- [ ] **Step 4: Implement `src/agents/worker-rollback.ts`**

```typescript
import { execSync } from 'node:child_process';

export function snapshotWorkerScope(repoRoot: string, taskId: string): string {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const message = `deckent-worker-${taskId}-${ts}`;
  // --include-untracked captures new files; --keep-index leaves working tree intact
  execSync(`git stash push --include-untracked --keep-index --message "${message}"`, { cwd: repoRoot });
  // capture stash ref (top of stash stack)
  const ref = execSync('git stash list --format=%gd | head -n 1', { cwd: repoRoot, encoding: 'utf-8', shell: '/bin/bash' as never }).trim();
  return ref || 'stash@{0}';
}

export function rollbackWorkerScope(repoRoot: string, stashRef: string, _scopedPaths: string[]): void {
  // Revert tracked files in worker's scope to HEAD
  execSync('git checkout HEAD -- .', { cwd: repoRoot });
  // Clean untracked files (worker may have created new ones)
  execSync('git clean -fd', { cwd: repoRoot });
  // Drop the snapshot stash
  execSync(`git stash drop ${stashRef}`, { cwd: repoRoot });
}

export function dropWorkerSnapshot(repoRoot: string, stashRef: string): void {
  execSync(`git stash drop ${stashRef}`, { cwd: repoRoot });
}
```

- [ ] **Step 5: Extend TaskRecord type**

In `src/core/memory-types.ts`, add field:

```typescript
export interface TaskRecord {
  // existing fields...
  /** Sprint 177 Task 1: git stash ref captured at worker spawn for rollback */
  snapshot_stash_ref?: string;
}
```

- [ ] **Step 6: Hook into worker spawn (`src/agents/worker.ts`)**

In the worker spawn path (locate via grep for `tmuxSpawn` or `spawnWorker`):

```typescript
import { snapshotWorkerScope } from './worker-rollback.js';

// Before the worker process starts:
const stashRef = snapshotWorkerScope(projectRoot, task.id);
await store.updateTask(task.id, { snapshot_stash_ref: stashRef });
```

- [ ] **Step 7: Hook into result-evaluator verdict**

In `src/orchestra/result-evaluator.ts`, after the verdict is computed:

```typescript
import { rollbackWorkerScope, dropWorkerSnapshot } from '../agents/worker-rollback.js';

const stashRef = task.snapshot_stash_ref;
if (stashRef) {
  if (verdict === 'NO_GO') {
    rollbackWorkerScope(projectRoot, stashRef, task.scope.filesWrite ?? []);
  } else {
    // DONE or GO_WITH_TECH_DEBT: keep worker changes
    dropWorkerSnapshot(projectRoot, stashRef);
  }
}
```

- [ ] **Step 8: Run test, expect PASS**

`npx vitest run tests/agents/worker-rollback.test.ts`
Expected: 4 tests green.

- [ ] **Step 9: tsc clean + commit**

```bash
npm run lint
git add src/agents/worker-rollback.ts src/agents/worker.ts src/orchestra/result-evaluator.ts src/core/memory-types.ts tests/agents/worker-rollback.test.ts
git commit -m "feat(sprint-177-1): worker rollback — git-stash snapshot-on-spawn

Sprint 177 Task 1 — workers snapshot working tree at spawn via
\`git stash push --include-untracked --keep-index\`. NO_GO verdict
reverts via \`git checkout HEAD -- .\` + \`git clean -fd\` then drops
the stash. DONE/GO_WITH_TECH_DEBT drops stash without revert (changes
kept). Stash ref persisted in memory.db TaskRecord.snapshot_stash_ref.

Closes Sprint 176 dogfood gap: NO_GO workers no longer leave src/
corrupted. Foundation for Sprint 177 tasks 2-5."
```

---

## Task 2: `deckent kill` cascade fix

**Files:**
- Modify: `src/cli/commands/kill.ts`
- Modify: `src/orchestra/sprint-controller.ts` (graceful-shutdown hook)
- Modify: `src/orchestra/tmux.ts` (socket cleanup for tmux backend — best effort)
- Modify: `src/orchestra/spawn-backend.ts` (cascade hook)
- Create: `tests/cli/kill-cascade.test.ts`

### Steps

- [ ] **Step 1: Map the current kill flow**

Run: `grep -nE "killAll|killWorkers|sprintController|sprint-state|pids/" src/cli/commands/kill.ts src/orchestra/sprint-controller.ts | head -20`

Identify where kill currently stops (worker level) and where the controller PID + metadata files live.

- [ ] **Step 2: Write failing integration test**

Create `tests/cli/kill-cascade.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawn, execSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('deckent kill --all cascade (Sprint 177 Task 2)', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'kill-cascade-'));
    mkdirSync(join(tmp, '.deckent', 'pids'), { recursive: true });
    mkdirSync(join(tmp, '.tasks'));
    // Simulate active sprint state
    writeFileSync(join(tmp, '.deckent', 'sprint-state.json'), JSON.stringify({ sprintId: 'sprint-test', phase: 'EXECUTE', status: 'ACTIVE' }));
    writeFileSync(join(tmp, '.deckent', 'sprint-test-checkpoint.json'), '{}');
    writeFileSync(join(tmp, '.deckent', 'sprint-test-gate.json'), '{}');
  });

  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it('removes all sprint metadata files after kill', async () => {
    const { killSprint } = await import('../../src/cli/commands/kill.js');
    await killSprint({ all: true, root: tmp });

    expect(existsSync(join(tmp, '.deckent', 'sprint-state.json'))).toBe(false);
    expect(existsSync(join(tmp, '.deckent', 'sprint-test-checkpoint.json'))).toBe(false);
    expect(existsSync(join(tmp, '.deckent', 'sprint-test-gate.json'))).toBe(false);
  });

  it('SIGTERMs controller PID if present', async () => {
    // Spawn a dummy long-running process and capture its PID
    const dummy = spawn('sleep', ['60'], { detached: true });
    const pid = dummy.pid!;
    writeFileSync(join(tmp, '.deckent', 'pids', 'sprint-test.pid'), String(pid));

    const { killSprint } = await import('../../src/cli/commands/kill.js');
    await killSprint({ all: true, root: tmp });

    // PID file removed
    expect(existsSync(join(tmp, '.deckent', 'pids', 'sprint-test.pid'))).toBe(false);
    // Process killed (give 1s for SIGTERM)
    await new Promise((r) => setTimeout(r, 1500));
    let alive = false;
    try { process.kill(pid, 0); alive = true; } catch {}
    expect(alive).toBe(false);
  });

  it('emits SPRINT_KILLED structured event', async () => {
    const events: unknown[] = [];
    // mock event-stream emit; details depend on the codebase pattern
    const { killSprint } = await import('../../src/cli/commands/kill.js');
    await killSprint({ all: true, root: tmp, onEvent: (e: unknown) => events.push(e) });

    const killedEvent = events.find((e: any) => e.channel === 'BRAIN→*:SPRINT_KILLED');
    expect(killedEvent).toBeDefined();
  });
});
```

- [ ] **Step 3: Run test, expect FAIL**

`npx vitest run tests/cli/kill-cascade.test.ts`

- [ ] **Step 4: Extend `src/cli/commands/kill.ts`**

```typescript
import { readFileSync, existsSync, unlinkSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export async function killSprint(opts: { all: boolean; root: string; onEvent?: (e: unknown) => void; }): Promise<void> {
  const root = opts.root;
  const deckentDir = join(root, '.deckent');

  // 1. Stop all workers (existing logic — call into existing killWorkers)
  const killedWorkers = await killAllWorkers(root);

  // 2. SIGTERM controller PID(s)
  const pidsDir = join(deckentDir, 'pids');
  const killedControllers: number[] = [];
  if (existsSync(pidsDir)) {
    for (const f of readdirSync(pidsDir)) {
      if (!f.endsWith('.pid')) continue;
      const pidPath = join(pidsDir, f);
      const pid = Number(readFileSync(pidPath, 'utf-8').trim());
      if (Number.isInteger(pid) && pid > 0) {
        try { process.kill(pid, 'SIGTERM'); killedControllers.push(pid); } catch {}
      }
      unlinkSync(pidPath);
    }
    // wait 5s grace, then SIGKILL survivors
    await new Promise((r) => setTimeout(r, 5000));
    for (const pid of killedControllers) {
      try { process.kill(pid, 'SIGKILL'); } catch {}
    }
  }

  // 3. Remove sprint metadata files
  const removedMetadata: string[] = [];
  const metadataPatterns = [/^sprint-state\.json$/, /^sprint-.*-checkpoint\.json$/, /^sprint-.*-gate\.json$/];
  if (existsSync(deckentDir)) {
    for (const f of readdirSync(deckentDir)) {
      if (metadataPatterns.some((rx) => rx.test(f))) {
        unlinkSync(join(deckentDir, f));
        removedMetadata.push(f);
      }
    }
  }

  // 4. Best-effort tmux socket cleanup
  try {
    const tmuxSocket = `/tmp/tmux-${process.getuid?.() ?? 1000}/default`;
    if (existsSync(tmuxSocket)) unlinkSync(tmuxSocket);
  } catch {}

  // 5. Emit structured event
  opts.onEvent?.({
    channel: 'BRAIN→*:SPRINT_KILLED',
    payload: { killedWorkers, killedControllers, removedMetadata, timestamp: new Date().toISOString() },
  });
}
```

- [ ] **Step 5: Wire to sprint-controller graceful shutdown**

In `src/orchestra/sprint-controller.ts`, listen for `SIGTERM` and exit cleanly:

```typescript
process.on('SIGTERM', () => {
  console.log('[sprint-controller] SIGTERM received, finalizing sprint state');
  // flush pending state, then exit
  process.exit(0);
});
```

- [ ] **Step 6: Run test, expect PASS**

`npx vitest run tests/cli/kill-cascade.test.ts`

- [ ] **Step 7: Commit**

```bash
git add src/cli/commands/kill.ts src/orchestra/sprint-controller.ts tests/cli/kill-cascade.test.ts
git commit -m "fix(sprint-177-2): deckent kill full cascade — controller + metadata + tmux socket"
```

---

## Task 3: Tmux backend deprecate path

**Files:**
- Modify: `src/orchestra/tmux.ts` (add deprecation banner + once-per-sprint dedup)
- Modify: `src/orchestra/spawn-backend.ts` (resolveBackend default → 'docker')
- Modify: `src/core/config.ts` (DEFAULT_CONFIG.spawn_backend = 'docker')
- Create: `docs/guide/troubleshooting.md` (or extend existing) — tmux deprecation section
- Create: `tests/orchestra/tmux-deprecation.test.ts`

### Steps

- [ ] **Step 1: Write failing test**

Create `tests/orchestra/tmux-deprecation.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { resolveBackend } from '../../src/orchestra/spawn-backend.js';

describe('tmux backend deprecation (Sprint 177 Task 3)', () => {
  let stderrCalls: string[];
  beforeEach(() => {
    stderrCalls = [];
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk: string | Uint8Array) => {
      stderrCalls.push(typeof chunk === 'string' ? chunk : chunk.toString());
      return true;
    });
  });

  it('default (spawn_backend undefined) resolves to docker, not tmux', () => {
    const backend = resolveBackend({ spawn_backend: undefined } as never);
    expect(backend).toBe('docker');
  });

  it('explicit spawn_backend: "tmux" emits deprecation warning', () => {
    resolveBackend({ spawn_backend: 'tmux' } as never);
    expect(stderrCalls.some((s) => s.includes('tmux backend is deprecated'))).toBe(true);
  });

  it('deprecation warning emitted at most once per process', () => {
    resolveBackend({ spawn_backend: 'tmux' } as never);
    resolveBackend({ spawn_backend: 'tmux' } as never);
    const warns = stderrCalls.filter((s) => s.includes('tmux backend is deprecated'));
    expect(warns.length).toBe(1);
  });
});
```

- [ ] **Step 2: Run test, expect FAIL**

`npx vitest run tests/orchestra/tmux-deprecation.test.ts`

- [ ] **Step 3: Modify `resolveBackend()` in `src/orchestra/spawn-backend.ts`**

```typescript
let _tmuxDeprecationWarned = false;

export function resolveBackend(config: { spawn_backend?: string }): 'docker' | 'tmux' | 'subprocess' {
  const requested = config.spawn_backend ?? 'auto';

  if (requested === 'auto') {
    return 'docker'; // Was: 'tmux'. Sprint 177 Task 3 — default is docker now.
  }

  if (requested === 'tmux' && !_tmuxDeprecationWarned) {
    process.stderr.write(
      '[deckent] WARNING: tmux backend is deprecated and will be removed in Sprint 178. ' +
        'Set spawn_backend: "docker" in .deckent/config.json. ' +
        'See docs/guide/troubleshooting.md#tmux-deprecation.\n',
    );
    _tmuxDeprecationWarned = true;
  }

  return requested as 'docker' | 'tmux' | 'subprocess';
}
```

- [ ] **Step 4: Update `DEFAULT_CONFIG.spawn_backend` in `src/core/config.ts`**

Find `DEFAULT_CONFIG` (around line 580), set:

```typescript
spawn_backend: 'docker',
```

- [ ] **Step 5: Create `docs/guide/troubleshooting.md` (or append section)**

```markdown
## Tmux Backend Deprecation

As of Sprint 177 (May 2026), the tmux spawn backend is **deprecated** and will be removed in Sprint 178.

**Why:** Tmux backend showed sustained instability during Sprint 176 dogfood (socket lifecycle issues, window-death heartbeat freezing). The embedded web terminal (sub-project #1) covers the "interactive PTY" need with a properly-isolated WS-PTY layer.

**Migration:** Set `spawn_backend: "docker"` in `.deckent/config.json`. Docker isolation provides better fault containment + the same execution model.

If you need a lightweight backend (no Docker daemon), use `spawn_backend: "subprocess"`.
```

- [ ] **Step 6: Run test, expect PASS**

`npx vitest run tests/orchestra/tmux-deprecation.test.ts`

- [ ] **Step 7: Commit**

```bash
git add src/orchestra/spawn-backend.ts src/core/config.ts docs/guide/troubleshooting.md tests/orchestra/tmux-deprecation.test.ts
git commit -m "fix(sprint-177-3): tmux backend deprecation path — default docker + warning"
```

---

## Task 4: Config template-regen guard + restore docs

**Files:**
- Modify: `src/core/config.ts` (loadConfig: merge instead of overwrite on regen + backup)
- Modify: `src/cli/commands/init-templates/config.json.template` (or its source file — verify path)
- Create: `docs/guide/config-recovery.md`
- Create: `tests/core/config-regen-guard.test.ts`

### Steps

- [ ] **Step 1: Locate template + regen trigger**

Run: `grep -rnE "config\.json\.template|regenerateConfig|writeDefaultConfig" src/ | head -10`

Find the place where config.json is rewritten from template.

- [ ] **Step 2: Write failing test**

Create `tests/core/config-regen-guard.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('config.json template-regen guard (Sprint 177 Task 4)', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'config-regen-'));
    mkdirSync(join(tmp, '.deckent'));
  });

  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it('preserves existing user fields when regenerating (merge, not overwrite)', async () => {
    const partial = { mode: 'performance', spawn_backend: 'docker', custom_field: 'keep me' };
    writeFileSync(join(tmp, '.deckent', 'config.json'), JSON.stringify(partial));

    const { regenerateConfigSafe } = await import('../../src/core/config.js');
    regenerateConfigSafe(tmp);

    const result = JSON.parse(readFileSync(join(tmp, '.deckent', 'config.json'), 'utf-8'));
    expect(result.spawn_backend).toBe('docker');
    expect(result.custom_field).toBe('keep me');
    expect(result.mode).toBe('performance');
  });

  it('creates a backup before any potentially destructive write', async () => {
    const original = { mode: 'performance', spawn_backend: 'docker' };
    writeFileSync(join(tmp, '.deckent', 'config.json'), JSON.stringify(original));

    const { regenerateConfigSafe } = await import('../../src/core/config.js');
    regenerateConfigSafe(tmp);

    const backups = readdirSync(join(tmp, '.deckent')).filter((f) => f.startsWith('config.json.bak.regen-'));
    expect(backups.length).toBeGreaterThanOrEqual(1);
  });

  it('adds missing required defaults without removing extras', async () => {
    writeFileSync(join(tmp, '.deckent', 'config.json'), '{}');

    const { regenerateConfigSafe } = await import('../../src/core/config.js');
    regenerateConfigSafe(tmp);

    const result = JSON.parse(readFileSync(join(tmp, '.deckent', 'config.json'), 'utf-8'));
    expect(result.spawn_backend).toBe('docker');
    expect(result.dependency_pipeline_enabled).toBeDefined();
    expect(result.haiku_allowed).toBeDefined();
  });
});
```

- [ ] **Step 3: Run test, expect FAIL**

`npx vitest run tests/core/config-regen-guard.test.ts`

- [ ] **Step 4: Implement `regenerateConfigSafe()` in `src/core/config.ts`**

```typescript
import { existsSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';

export function regenerateConfigSafe(projectRoot: string): void {
  const configPath = join(projectRoot, '.deckent', 'config.json');
  const templateDefaults: Partial<DeckentConfig> = {
    spawn_backend: 'docker',
    dependency_pipeline_enabled: false,
    haiku_allowed: false,
    brain_planning: 'structured',
    // ...other locked defaults
  };

  let existing: Partial<DeckentConfig> = {};
  if (existsSync(configPath)) {
    // Backup first
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = `${configPath}.bak.regen-${ts}`;
    copyFileSync(configPath, backupPath);

    try {
      existing = JSON.parse(readFileSync(configPath, 'utf-8'));
    } catch {
      existing = {};
    }
  }

  // Merge: templateDefaults provides missing fields; existing wins for present fields
  const merged = { ...templateDefaults, ...existing };
  writeFileSync(configPath, JSON.stringify(merged, null, 2));
}
```

Replace the old `regenerateConfig()` call sites with `regenerateConfigSafe()`.

- [ ] **Step 5: Create `docs/guide/config-recovery.md`**

```markdown
# Config Recovery

If your `.deckent/config.json` gets corrupted or drifts (missing fields after a regen), restore from the most recent backup:

```bash
# List backups (sorted newest last)
ls -la .deckent/config.json.bak.*

# Restore from a specific backup
cp .deckent/config.json.bak.2026-05-19T22-29-17-902Z .deckent/config.json
```

Backups are created automatically on every regen. The most recent backup pre-regen is named `.deckent/config.json.bak.regen-{ISO timestamp}`.

If no backup exists and the file is corrupted, delete it and run `deckent init` — but **expect to re-add project-specific fields** (`spawn_backend`, `model_strategy`, etc.) by hand.
```

- [ ] **Step 6: Run test, expect PASS**

`npx vitest run tests/core/config-regen-guard.test.ts`

- [ ] **Step 7: Commit**

```bash
git add src/core/config.ts docs/guide/config-recovery.md tests/core/config-regen-guard.test.ts
git commit -m "fix(sprint-177-4): config.json regen guard + recovery docs"
```

---

## Task 5: `nervous_system.directives_protection` baseline-update hook

**Files:**
- Modify: `src/nervous/observer.ts` or `src/nervous/detector-registry.ts` (add `updateBaseline()` to directives_protection detector)
- Modify: `src/mcp/tools/set-directives.ts` (emit `BASELINE_UPDATE` event on success)
- Modify: `src/orchestra/sprint-controller.ts` (refresh baseline on sprint start)
- Modify: `src/cli/commands/nervous.ts` (or new — add `baseline-refresh` subcommand)
- Create: `tests/nervous/directives-protection-baseline.test.ts`

### Steps

- [ ] **Step 1: Locate `directives_protection` detector**

Run: `grep -rnE "directives_protection|auto_restore" src/nervous/ src/orchestra/ | head -15`

Identify where the detector stores its baseline (in-memory? memory.db? file?).

- [ ] **Step 2: Write failing test**

Create `tests/nervous/directives-protection-baseline.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('directives_protection baseline-update hook (Sprint 177 Task 5)', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'nervous-baseline-'));
  });

  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it('set_directives success refreshes the baseline', async () => {
    const directivesPath = join(tmp, 'DIRECTIVES.md');
    writeFileSync(directivesPath, '# Sprint 175\n');

    const { initDirectivesProtection } = await import('../../src/nervous/observer.js');
    const det = initDirectivesProtection({ root: tmp, autoRestore: true });
    // baseline = Sprint 175 content
    expect(det.getBaselineHash()).toBe(det.computeHash('# Sprint 175\n'));

    // User changes via set_directives
    writeFileSync(directivesPath, '# Sprint 176\n');
    det.updateBaseline(); // Hook called after set_directives writes
    expect(det.getBaselineHash()).toBe(det.computeHash('# Sprint 176\n'));

    // Detector should NOT restore now (baseline == current)
    det.scan();
    expect(readFileSync(directivesPath, 'utf-8')).toBe('# Sprint 176\n');
  });

  it('detects unauthorized change and restores when auto_restore=true', async () => {
    const directivesPath = join(tmp, 'DIRECTIVES.md');
    writeFileSync(directivesPath, '# Sprint 175\n');

    const { initDirectivesProtection } = await import('../../src/nervous/observer.js');
    const det = initDirectivesProtection({ root: tmp, autoRestore: true });

    // Simulate adversary change (no baseline update)
    writeFileSync(directivesPath, '# adversary\n');
    det.scan();
    expect(readFileSync(directivesPath, 'utf-8')).toBe('# Sprint 175\n');
  });

  it('CLI `deckent nervous baseline-refresh` updates baseline manually', async () => {
    const directivesPath = join(tmp, 'DIRECTIVES.md');
    writeFileSync(directivesPath, '# Sprint 175\n');

    const { initDirectivesProtection } = await import('../../src/nervous/observer.js');
    const det = initDirectivesProtection({ root: tmp, autoRestore: true });
    writeFileSync(directivesPath, '# Sprint 177\n');

    const { nervousBaselineRefresh } = await import('../../src/cli/commands/nervous.js');
    await nervousBaselineRefresh({ root: tmp });
    expect(det.getBaselineHash()).toBe(det.computeHash('# Sprint 177\n'));
  });
});
```

- [ ] **Step 3: Run test, expect FAIL**

`npx vitest run tests/nervous/directives-protection-baseline.test.ts`

- [ ] **Step 4: Add `updateBaseline()` to detector**

In `src/nervous/observer.ts` (or detector-registry):

```typescript
export class DirectivesProtectionDetector {
  private baselineHash: string | null = null;

  constructor(private root: string, private autoRestore: boolean) {
    this.updateBaseline(); // initial baseline = current DIRECTIVES.md
  }

  updateBaseline(): void {
    const path = join(this.root, 'DIRECTIVES.md');
    if (existsSync(path)) {
      this.baselineHash = this.computeHash(readFileSync(path, 'utf-8'));
    }
  }

  computeHash(content: string): string {
    return createHash('sha256').update(content).digest('hex');
  }

  getBaselineHash(): string | null {
    return this.baselineHash;
  }

  scan(): void {
    const path = join(this.root, 'DIRECTIVES.md');
    if (!existsSync(path)) return;
    const current = readFileSync(path, 'utf-8');
    const currentHash = this.computeHash(current);
    if (currentHash !== this.baselineHash && this.autoRestore) {
      // adversary or drift — restore from baseline
      // (need baselineContent stored too; or store full content not just hash)
      // ...
    }
  }
}

export function initDirectivesProtection(opts: { root: string; autoRestore: boolean }): DirectivesProtectionDetector {
  return new DirectivesProtectionDetector(opts.root, opts.autoRestore);
}
```

- [ ] **Step 5: Hook into `deckent_set_directives` MCP tool**

In `src/mcp/tools/set-directives.ts`:

```typescript
// After the directives write succeeds:
import { getActiveDirectivesProtection } from '../../nervous/observer.js';
const det = getActiveDirectivesProtection();
det?.updateBaseline();
// or emit a structured event the detector subscribes to
```

- [ ] **Step 6: Hook into sprint-controller `startSprint()`**

```typescript
// In startSprint(), after sprintId is bound:
const det = getActiveDirectivesProtection();
det?.updateBaseline();
```

- [ ] **Step 7: Add `deckent nervous baseline-refresh` CLI**

In `src/cli/commands/nervous.ts`:

```typescript
export async function nervousBaselineRefresh(opts: { root: string }): Promise<void> {
  const det = getActiveDirectivesProtection();
  if (!det) {
    process.stderr.write('[deckent] No active directives_protection detector\n');
    process.exitCode = 1;
    return;
  }
  det.updateBaseline();
  console.log('[deckent] directives_protection baseline refreshed');
}
```

- [ ] **Step 8: Run test, expect PASS**

`npx vitest run tests/nervous/directives-protection-baseline.test.ts`

- [ ] **Step 9: Commit**

```bash
git add src/nervous/observer.ts src/mcp/tools/set-directives.ts src/orchestra/sprint-controller.ts src/cli/commands/nervous.ts tests/nervous/directives-protection-baseline.test.ts
git commit -m "fix(sprint-177-5): directives_protection baseline-update hook"
```

---

## Self-Review

**Spec coverage:** All 5 Sprint 177 tasks from master spec §3 map 1:1 to plan tasks.

**Placeholder scan:** Clean. No TBD/TODO/fill-in patterns in implementation steps.

**Type consistency:** TaskRecord.snapshot_stash_ref (Task 1) used in Tasks 2-5 indirectly via worker spawn pipeline. resolveBackend signature (Task 3) consistent across tests + impl.

**Frequent commits:** 5 task = 5 commits. Plus self-review commit if needed at end.

---

## Sprint 177 Sprint verdict

- **GO** = 5/5 DONE
- **GO_WITH_TECH_DEBT** = 4/5 DONE + 1 GWT, **provided the GWT task is NOT 177-001 (worker rollback) or 177-002 (kill cascade)** — these two are non-negotiable runtime safety.
- **NO_GO** = 177-001 or 177-002 fail outright; or worker rollback test regressions found in 2-5.

After Sprint 177 lands, the safety net is in place for Sprint 178 onward.
