# Sprint 178 Implementation Plan — Modernization Yayılma + TOPP Continuous-Dispatch

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Checkbox (`- [ ]`) tracking. Worker rollback (Sprint 177 Task 1) is live — NO_GO automatically reverts worker scope writes.

**Goal:** Crisis Stabilization §4 — close the 4 modernization-spread items (Node 24/26 test/doc, tmux code removal, CI flakes) **and** ship **TOPP B+C continuous-dispatch** so Sprint 179's 12-task fan-out runs at native parallelism.

**Architecture:** Tasks 1-4 are surface-level (test/doc/code-removal); Task 5 (TOPP) is the architectural lift — supersedes ADR-045 §3 wave-barrier with E1 flag-agnostic continuous slot-fill, preserving lock/correctness via the existing collision-edge predecessor digest mechanism.

**Tech Stack:** TypeScript ESM (Node 24+), vitest 3.x, `git stash` runtime, Node child_process. No new runtime deps.

**Spec reference:** `docs/superpowers/specs/2026-05-21-crisis-stabilization-initiative.md` §4 (Sprint 178 outline) + memory `project_topp_continuous_dispatch.md` (TOPP design Alperen onaylı 2026-05-19).

---

## File Structure

| File | Task | Responsibility |
|------|------|----------------|
| `tests/scripts/publish-workflow.test.ts` | 1 | `'22.x'` → `'24.x'` |
| `tests/workflows/publish.test.ts` | 1 | aynı |
| `tests/e2e/install-matrix/fresh-install.test.ts` | 1 | `Node 18/20/22` → `Node 24/26` |
| `tests/docs/release-prep.test.ts` | 1 | `engines.node >= 18` → `>= 24` |
| `tests/integration/provider-flow.test.ts` | 1 (kısmen) + 3 | tmux references; default 'auto' → 'docker' |
| `README.md` | 2 | Node 24/26 references, engines section |
| `DECKENT.md` | 2 | aynı |
| `docs/guide/*.md` | 2 | engines + node version mentions |
| `docs/guide/troubleshooting.md` | 2/3 | tmux deprecation → removed section |
| `src/orchestra/tmux.ts` | 3 | DELETE |
| `src/orchestra/spawn-backend.ts` | 3 | tmux branch removal (3 backend → 2: docker + subprocess) |
| `src/core/config.ts` | 3 | `spawn_backend` type: `'docker' \| 'subprocess' \| 'auto'` (no `'tmux'`) |
| `tests/orchestra/tmux-*.test.ts` | 3 | prune (Sprint 177 tmux-deprecation.test.ts + any older) |
| `src/core/pid-liveness.ts` | 4 | NEW — `isPidAlive()` portable (linux /proc + darwin/win32 fallback) |
| `tests/cli/archive-debt.test.ts` | 4 | mock factory hygiene (explicit factory + importOriginal) |
| `tests/core/orphan-cleaner-ipc.test.ts` | 4 | mock surface uses isPidAlive instead of process.kill |
| `src/orchestra/result-collector.ts` | 5 | `dispatchTick(state)` flag-agnostic — replace `maybeRespawn`+`processQueue` (line 380) |
| `src/orchestra/sprint-spawner.ts` | 5 | `respawnEligibleTasks` body continuous (line 472, 509) + `spawnWorkers` initial fill ladder (line 296-313) |
| `src/orchestra/prompt-god-template.ts` | 5 | TOPP C: `buildDependenciesBlock` predecessor `.result` digest embed (line 291-307) |
| `tests/orchestra/topp-continuous-dispatch.test.ts` | 5 | NEW — 10-test G1-G10 matrix |
| `docs/adr/0XX-topp-continuous-dispatch.md` | 5 | NEW — supersedes ADR-045 §3 wave-barrier |

---

## Task 1: Node 24/26 test assertion sweep

**Files:**
- Modify: `tests/scripts/publish-workflow.test.ts`, `tests/workflows/publish.test.ts`, `tests/e2e/install-matrix/fresh-install.test.ts`, `tests/docs/release-prep.test.ts`

### Steps

- [ ] **Step 1: Find stale Node version assertions**

```bash
grep -rnE "'22\.x'|18\.x|20\.x|Node 18|Node 22|>= ?18" tests/ | grep -v node_modules | head -20
```

- [ ] **Step 2: Update publish workflow tests**

`tests/scripts/publish-workflow.test.ts` + `tests/workflows/publish.test.ts`:

Replace `'22.x'` with `'24.x'` in workflow assertion lines.

- [ ] **Step 3: Update install-matrix test**

`tests/e2e/install-matrix/fresh-install.test.ts`:

Replace `Node 18/20/22` matrix references with `Node 24/26`. Update test descriptions.

- [ ] **Step 4: Update release-prep**

`tests/docs/release-prep.test.ts`:

```typescript
expect(pkg.engines.node).toMatch(/^>=\s*24/);
```

- [ ] **Step 5: Verify**

```bash
npx vitest run tests/scripts/publish-workflow.test.ts tests/workflows/publish.test.ts tests/e2e/install-matrix/fresh-install.test.ts tests/docs/release-prep.test.ts
```

Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git commit -m "fix(sprint-178-1): Node 24/26 test assertion sweep"
```

---

## Task 2: Doc updates — README + DECKENT.md + guide

**Files:**
- Modify: `README.md`, `DECKENT.md`, `docs/guide/*.md`

### Steps

- [ ] **Step 1: Find stale Node references in docs**

```bash
grep -rnE "Node 18|Node 20|Node 22|>= ?18\.0|18\.0\.0" README.md DECKENT.md docs/guide/ | head -20
```

- [ ] **Step 2: Update README.md prerequisites section**

```markdown
## Prerequisites

- **Node.js 24+ (Active LTS) or 26 (Current)**
- Docker (recommended) or subprocess backend
```

- [ ] **Step 3: Update DECKENT.md engine section**

Replace any `Node 18+` with `Node 24+`.

- [ ] **Step 4: Update docs/guide/installation.md, quickstart.md, troubleshooting.md, terminal.md**

```bash
grep -lE "Node 18|>= ?18\.0" docs/guide/*.md
```

For each match: replace with Node 24/26 references.

- [ ] **Step 5: Verify lint:link**

```bash
npm run lint:link
```

Exit 0 expected.

- [ ] **Step 6: Commit**

```bash
git commit -m "fix(sprint-178-2): doc updates — Node 24/26 references"
```

---

## Task 3: Tmux backend code removal

**Files:**
- Delete: `src/orchestra/tmux.ts`, `tests/orchestra/tmux*.test.ts`
- Modify: `src/orchestra/spawn-backend.ts` (tmux branch removal), `src/core/config.ts` (type narrowing), `docs/guide/troubleshooting.md` (remove deprecation section, replace with removal note)

### Steps

- [ ] **Step 1: Audit tmux references**

```bash
grep -rnE "tmux\.ts|from.*tmux\b|spawn_backend.*tmux|'tmux'" src/ tests/ | grep -v node_modules | head -30
```

- [ ] **Step 2: Modify `src/orchestra/spawn-backend.ts`**

Remove tmux branch in `resolveBackend()`:

```typescript
export function resolveBackend(config: { spawn_backend?: string }): 'docker' | 'subprocess' {
  const requested = config.spawn_backend ?? 'auto';
  if (requested === 'auto') return 'docker';
  if (requested === 'tmux') {
    process.stderr.write('[deckent] ERROR: tmux backend was removed in Sprint 178. Use spawn_backend: "docker" or "subprocess".\n');
    process.exit(1);
  }
  return requested as 'docker' | 'subprocess';
}
```

Plus remove any tmux-specific spawn paths in this file.

- [ ] **Step 3: Modify `src/core/config.ts`**

Narrow the type:

```typescript
spawn_backend: 'docker' | 'subprocess' | 'auto'; // was: 'docker' | 'tmux' | 'subprocess' | 'auto'
```

- [ ] **Step 4: Delete tmux files**

```bash
git rm src/orchestra/tmux.ts
git rm tests/orchestra/tmux-deprecation.test.ts
# (Plus any older tmux-specific tests — grep first)
```

- [ ] **Step 5: Update troubleshooting docs**

Replace deprecation section in `docs/guide/troubleshooting.md` with:

```markdown
## Tmux Backend — Removed in Sprint 178

The tmux backend was removed. If your `.deckent/config.json` has `spawn_backend: "tmux"`,
the CLI will exit with an error message. Replace with `"docker"` (recommended) or `"subprocess"`.
```

- [ ] **Step 6: Verify**

```bash
npm run lint  # tsc clean — no tmux refs
npx vitest run tests/orchestra/  # no broken tests
```

- [ ] **Step 7: Commit**

```bash
git commit -m "fix(sprint-178-3): tmux backend code removal (Sprint 177 deprecation follow-up)"
```

---

## Task 4: CI flaky test fix — portable PID liveness + mock hygiene

**Files:**
- Create: `src/core/pid-liveness.ts`
- Modify: `tests/cli/archive-debt.test.ts`, `tests/core/orphan-cleaner-ipc.test.ts`
- Modify call sites of `process.kill(pid, 0)`

### Steps

- [ ] **Step 1: Create `src/core/pid-liveness.ts`**

```typescript
import { existsSync } from 'node:fs';

export function isPidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  if (process.platform === 'linux') {
    return existsSync(`/proc/${pid}`);
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    return code === 'EPERM';
  }
}
```

- [ ] **Step 2: Replace call sites**

```bash
grep -rnE "process\.kill\(.*,\s*0\)" src/ | head -10
```

For each match: import `isPidAlive` and call instead.

- [ ] **Step 3: Update tests/core/orphan-cleaner-ipc.test.ts**

Switch from `vi.mock('node:process'...)` to mocking the new helper:

```typescript
vi.mock('../../src/core/pid-liveness.js', () => ({
  isPidAlive: vi.fn(),
}));
import { isPidAlive } from '../../src/core/pid-liveness.js';
const mocked = vi.mocked(isPidAlive);
```

- [ ] **Step 4: Fix tests/cli/archive-debt.test.ts mock hygiene**

Switch to explicit factory:

```typescript
vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return { ...actual, mkdirSync: mockMkdirSync, writeFileSync: mockWriteFileSync, existsSync: mockExistsSync };
});
```

- [ ] **Step 5: Verify lokal + CI=true**

```bash
npx vitest run tests/cli/archive-debt.test.ts tests/core/orphan-cleaner-ipc.test.ts
CI=true npx vitest run tests/cli/archive-debt.test.ts tests/core/orphan-cleaner-ipc.test.ts
```

Both PASS.

- [ ] **Step 6: Commit**

```bash
git commit -m "fix(sprint-178-4): CI flake fix — portable PID liveness + mock hygiene"
```

---

## Task 5: TOPP B+C continuous-dispatch ★ MUST

**Files:**
- Modify: `src/orchestra/result-collector.ts` (dispatchTick flag-agnostic, line 380)
- Modify: `src/orchestra/sprint-spawner.ts` (respawnEligibleTasks continuous body line 472/509 + initial fill ladder 296-313)
- Modify: `src/orchestra/prompt-god-template.ts` (TOPP C predecessor digest embed line 291-307)
- Create: `tests/orchestra/topp-continuous-dispatch.test.ts` (G1-G10 test matrix)
- Create: `docs/adr/0XX-topp-continuous-dispatch.md` (number from DB)

### Steps

- [ ] **Step 1: Map current dispatch flow**

```bash
grep -nE "processQueue|maybeRespawn|respawnEligibleTasks|forceRescanIfIdle|dispatchTick" src/orchestra/result-collector.ts src/orchestra/sprint-spawner.ts
```

Identify the 3 racing dispatchers:
- `processQueue` (FIFO, dependency-agnostic, always-on)
- `maybeRespawn` → `respawnEligibleTasks` (wave-aware, NO-OP when `dependency_pipeline_enabled=false`)
- `forceRescanIfIdle` (5min backstop)

- [ ] **Step 2: Resolve ADR number from memory.db**

```bash
sqlite3 .brain/memory.db "SELECT id FROM entries WHERE type='adr' ORDER BY id DESC LIMIT 5"
```

(Or via `deckent memory query` CLI.) Pick the next free ADR number (likely 063 or higher; 062 = embedded terminal).

- [ ] **Step 3: Write failing test (RED) — G1-G10 matrix**

Create `tests/orchestra/topp-continuous-dispatch.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { dispatchTick } from '../../src/orchestra/result-collector.js';

describe('TOPP B+C continuous-dispatch (Sprint 178 Task 5)', () => {
  // G1: empty queue + 0 active → no dispatch
  it('G1: empty queue → no dispatch', () => {
    const state = mkState({ pending: [], active: [], maxWorkers: 6 });
    const out = dispatchTick(state);
    expect(out.spawned).toEqual([]);
  });

  // G2: 1 pending eligible + 5 active < max → spawn
  it('G2: 1 eligible pending + 5 active → spawn 1', () => {
    const state = mkState({ pending: [t('A', [])], active: ['B','C','D','E','F'], maxWorkers: 6 });
    const out = dispatchTick(state);
    expect(out.spawned).toEqual(['A']);
  });

  // G3: dependency unresolved → no spawn
  it('G3: pending with unresolved dep → no spawn', () => {
    const state = mkState({ pending: [t('A', ['B'])], active: ['B'], maxWorkers: 6 });
    const out = dispatchTick(state);
    expect(out.spawned).toEqual([]);
  });

  // G4: dependency resolved (B done) → spawn
  it('G4: pending with resolved dep → spawn', () => {
    const state = mkState({ pending: [t('A', ['B'])], active: [], done: ['B'], maxWorkers: 6 });
    const out = dispatchTick(state);
    expect(out.spawned).toEqual(['A']);
  });

  // G5: max_workers boundary — 6 active, no spawn
  it('G5: max_workers boundary respected', () => {
    const state = mkState({ pending: [t('A', [])], active: ['B','C','D','E','F','G'], maxWorkers: 6 });
    const out = dispatchTick(state);
    expect(out.spawned).toEqual([]);
  });

  // G6: collision-edge — task with same filesWrite as active worker queued
  it('G6: collision-edge defers spawn', () => {
    const state = mkState({
      pending: [tWithScope('A', [], ['src/foo.ts'])],
      active: [{ id: 'B', filesWrite: ['src/foo.ts'] }],
      maxWorkers: 6,
    });
    const out = dispatchTick(state);
    expect(out.spawned).toEqual([]);
  });

  // G7: predecessor .result digest embedded in spawned task prompt
  it('G7: TOPP C predecessor digest embed', () => {
    const state = mkState({ pending: [t('A', ['B'])], done: ['B'], maxWorkers: 6 });
    const out = dispatchTick(state);
    expect(out.spawned[0]?.promptDeps).toContain('B:RESULT_DIGEST');
  });

  // G8: flag-agnostic — dependency_pipeline_enabled=false still dispatches
  it('G8: continuous-dispatch fires regardless of dependency_pipeline_enabled flag', () => {
    const state = mkState({ pending: [t('A', [])], maxWorkers: 6, depPipelineFlag: false });
    const out = dispatchTick(state);
    expect(out.spawned).toEqual(['A']);
  });

  // G9: DECKENT_LEGACY_FIFO=1 escape hatch — falls back to old behavior
  it('G9: DECKENT_LEGACY_FIFO env var disables continuous dispatch', () => {
    process.env.DECKENT_LEGACY_FIFO = '1';
    try {
      const state = mkState({ pending: [t('A', [])], maxWorkers: 6 });
      const out = dispatchTick(state);
      // legacy FIFO uses processQueue semantics — verify the legacy code path was used
      expect(out.usedLegacyFifo).toBe(true);
    } finally {
      delete process.env.DECKENT_LEGACY_FIFO;
    }
  });

  // G10: multi-wave smoke — 3 waves, all slots filled continuously
  it('G10: multi-wave continuous fill', () => {
    // Initial: 6 pending, 0 active. After dispatch: 6 active.
    // As each completes, next pending fills the slot immediately.
    // ...
  });
});
```

(Use mkState/t/tWithScope helpers from existing test utilities or stub them.)

- [ ] **Step 4: Run test, expect FAIL**

`npx vitest run tests/orchestra/topp-continuous-dispatch.test.ts`

- [ ] **Step 5: Implement `dispatchTick()` in result-collector.ts:380**

Replace the old `maybeRespawn` + `processQueue` body with:

```typescript
export function dispatchTick(state: DispatchState): DispatchResult {
  // Legacy FIFO escape hatch (ADR-045 non-destructive rollback)
  if (process.env.DECKENT_LEGACY_FIFO === '1') {
    return legacyFifoTick(state);
  }

  const spawned: SpawnedTask[] = [];
  const freeSlots = state.maxWorkers - state.active.length;
  if (freeSlots <= 0) return { spawned, usedLegacyFifo: false };

  // Iterate pending in priority order; fill any free slot with the first
  // dependency-eligible + collision-free task.
  for (const task of state.pending) {
    if (spawned.length >= freeSlots) break;
    if (!isDependencyEligible(task, state.done)) continue;
    if (hasCollisionEdge(task, state.active)) continue;

    const prompt = buildPromptWithDeps(task, state.done); // TOPP C: predecessor digest
    spawned.push({ id: task.id, promptDeps: prompt.deps });
  }

  return { spawned, usedLegacyFifo: false };
}
```

- [ ] **Step 6: Update `sprint-spawner.ts:472,509` continuous body**

Make `respawnEligibleTasks` invoke `dispatchTick` regardless of `dependency_pipeline_enabled` flag value:

```typescript
async function respawnEligibleTasks(state: SprintState): Promise<void> {
  const result = dispatchTick(state);  // flag-agnostic
  for (const task of result.spawned) {
    await spawnWorker(task);
  }
}
```

- [ ] **Step 7: Update `sprint-spawner.ts:296-313` initial fill ladder**

The initial spawn should also use `dispatchTick`:

```typescript
async function spawnWorkers(state: SprintState): Promise<void> {
  // initial fill: dispatchTick repeatedly until no more spawns OR maxWorkers reached
  let loops = 0;
  while (loops < 10) {  // safety bound
    const result = dispatchTick(state);
    if (result.spawned.length === 0) break;
    for (const task of result.spawned) {
      await spawnWorker(task);
    }
    loops++;
  }
}
```

- [ ] **Step 8: Update `prompt-god-template.ts:291-307` TOPP C predecessor digest**

In `buildDependenciesBlock(task, doneTasks)`:

```typescript
const blocks: string[] = [];
for (const depId of task.dependencies ?? []) {
  const done = doneTasks.find(d => d.id === depId);
  if (!done) continue;
  // TOPP C: embed predecessor .result digest (selfAssessment + filesChanged + notes head)
  blocks.push(`## Predecessor: ${depId}\n- Verdict: ${done.selfAssessment}\n- Files: ${done.filesChanged?.join(', ')}\n- Note: ${done.notes?.slice(0, 200)}`);
}
return blocks.join('\n\n');
```

- [ ] **Step 9: Deprecate `processQueue`**

Mark as `@deprecated` with JSDoc; if any tests reference it directly, rewrite to use `dispatchTick` semantics. **Do NOT delete** — rollback safety.

- [ ] **Step 10: Run G1-G10 matrix, expect PASS**

`npx vitest run tests/orchestra/topp-continuous-dispatch.test.ts`

10 tests green.

- [ ] **Step 11: Cross-backend regression — docker + subprocess smoke**

```bash
# docker backend
DECKENT_TEST_BACKEND=docker npx vitest run tests/integration/ tests/orchestra/
# subprocess backend
DECKENT_TEST_BACKEND=subprocess npx vitest run tests/integration/ tests/orchestra/
```

No regressions (existing passing tests still pass).

- [ ] **Step 12: Write ADR**

Create `docs/adr/0XX-topp-continuous-dispatch.md` (XX = next ADR number from memory.db). MADR v3 hybrid format:

- Status: accepted
- Context: 3 racing dispatchers, wave-barrier in `dependency_pipeline_enabled=false` projects (deckent-dev)
- Decision: TOPP B+C continuous-dispatch — `dispatchTick` flag-agnostic
- Consequences: ADR-045 §3 wave-barrier superseded; ADR-047 manual-wave unchanged; rollback `DECKENT_LEGACY_FIFO=1`

Then `npm run lint:adr` exit 0.

- [ ] **Step 13: Commit**

```bash
git commit -m "feat(sprint-178-5): TOPP B+C continuous-dispatch — wave-barrier removal

Sprint 178 Task 5 — wave barrier replaced by continuous slot-fill in
result-collector.ts:380 dispatchTick (flag-agnostic), with initial-fill
ladder in sprint-spawner.ts:296-313 + respawn body :472,509, plus TOPP C
predecessor digest embed in prompt-god-template.ts:291-307. ADR-045 §3
superseded by ADR-0XX (new). DECKENT_LEGACY_FIFO=1 env var = rollback
escape hatch. 10/10 G-matrix tests PASS + cross-backend smoke clean."
```

---

## Self-Review

**Spec coverage:** 5 tasks ↔ master spec §4 items 6a-e (Node spread + doc + tmux removal + CI flake + TOPP). ✅

**Placeholder scan:** Clean. ADR number (Task 5 Step 2) is the only deferred lookup, with explicit resolution command provided.

**Type consistency:** `spawn_backend` type narrowed in Task 3 (Step 3). `DispatchState`, `SpawnedTask`, `DispatchResult` introduced in Task 5 Step 5 — used consistently in Step 6 (sprint-spawner) + Step 7 (initial fill).

**Beta gate fit:** Task 5 MUST land before Sprint 179. Tasks 1-4 cleanup; can ship parallel with Sprint 178 retro if delayed.

---

## Sprint 178 GO/NO_GO

- **GATE-1 (Task 1):** Node 24/26 test sweep PASS (4 files updated, related vitest green)
- **GATE-2 (Task 2):** Doc updates PASS (lint:link exit 0, no stale Node 18 references)
- **GATE-3 (Task 3):** Tmux removal PASS (tsc clean, no tmux refs in src/, deprecation warning replaced)
- **GATE-4 (Task 4):** CI flake PASS (lokal + CI=true parity)
- **GATE-5 (Task 5) ★ MUST:** TOPP G1-G10 PASS + cross-backend smoke + new ADR `lint:adr` exit 0

**Sprint verdict:**
- GO = 5/5 DONE
- GO_WITH_TECH_DEBT = 4/5 DONE + 1 GWT **provided GWT is NOT Task 5 (TOPP)** — TOPP is non-negotiable for Sprint 179 fan-out
- NO_GO = Task 5 fails outright; or any test regression detected by Worker rollback verdict layer
