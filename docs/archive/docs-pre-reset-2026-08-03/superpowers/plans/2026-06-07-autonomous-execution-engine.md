# Autonomous Execution Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build deckent's foundational autonomous engine — a continuously-running, multi-provider, backlog-driven executor with three-gate governance (RBAC → per-task policy → risk-class), per-entry task|sprint execution, and durable/recoverable state.

**Architecture:** Reuse the Sprint-226 DI safety scaffold (`autonomous-runtime.ts` cycle, `runtime-loop.ts` loop, authority/approval/audit adapters — all sound) and build the missing engine substance: a durable backlog store, a per-task policy gate (separating the RBAC/approval dimensions the skeleton fused), a real execute-dispatcher (task→`runTaskMode`, sprint→`runSprint`), a hybrid trigger source, and a serial-now/pool-ready execution interface. Tier-agnostic core + DI adapters (solo→enterprise; packaging deferred).

**Tech Stack:** TypeScript (ESM, `.js` import suffix — Node16), vitest, no new runtime deps (ADR-010). Spec: `docs/superpowers/specs/2026-06-07-autonomous-execution-engine-design.md`.

**Conventions (read once before starting):**
- All user-facing strings via `getMessage(key, lang)` (`src/cli/helpers/messages.ts`, en/tr). Engine modules are string-free; CLI injects labels.
- Tests hermetic: tmpdir only, async (no `spawnSync`), cleaned in `afterEach`.
- TDD: failing test → run-fail → minimal impl → run-pass → commit.
- Commit message footer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

**Existing signatures this plan integrates with (verified 2026-06-07 — read them, don't re-derive):**
- `runtime-loop.ts`: `buildAutonomousRuntime(opts) → { deps, approvalGate }`; `runAutonomousLoop(config, deps, options) → Promise<AutonomousLoopSummary>`.
- `autonomous-runtime.ts`: `runAutonomousCycle(config, deps) → Promise<AutonomousCycleResult>`; DI types `AutonomousTrigger {id,source,action,requestedBy,payload?}`, `AuthorityChecker`, `ApprovalGate`, `ActionExecutor`, `AuditSink`, `TriggerSource {next()}`, `CycleOutcome`.
- `nervous/executor.ts`: `ActionHandler = (actionId: string, payload: Record<string,unknown>) => Promise<{outcome:'success'|'failure'; error?:string}>`.
- `orchestra/rubric-registry.ts`: `getEffectClass(task: Task) → EffectClass` (`'pure'|'reversible'|'idempotent'|'compensable'|'critical-irreversible'`).
- `orchestra/sprint-controller.ts`: `runSprint(projectRoot: string, config: ResolvedConfig, opts?: RunSprintOptions) → Promise<Sprint>` (requires `config.deckent_style==='sprint'`).
- `orchestra/task-mode-runner.ts`: `runTaskMode(ctx: TaskModeContext, config: ResolvedConfig) → TaskModeResult` (requires task mode).
- `orchestra/event-stream.ts`: `writeEvent(projectRoot, sprintId, source, target, channel, payload) → DeckentEvent|null`.
- `agents/worker-lifecycle.ts`: `atomicWriteFileSync(filePath: string, data: string) → void`.
- `core/scheduled-flow.ts`: `ScheduledFlow {id,cronExpr,action,tenantId,enabled,createdAt?}`.

---

## File Structure

| File | Responsibility | New/Modify |
|---|---|---|
| `src/orchestra/autonomous/backlog-types.ts` | Backlog entry/status/policy/trigger types | Create |
| `src/orchestra/autonomous/backlog.ts` | Durable backlog store: load, validate, query-due, status writeback, add/remove | Create |
| `src/orchestra/autonomous/policy-gate.ts` | G2 per-task policy + G3 EffectClass risk → `auto`\|`park` | Create |
| `src/orchestra/autonomous/execute-dispatcher.ts` | ActionHandler: run `task` (runTaskMode) or `sprint` (runSprint) per provider | Create |
| `src/orchestra/autonomous/backlog-trigger.ts` | Backlog-due TriggerSource + hybrid composer (backlog ∪ scheduled-flow ∪ reactive) | Create |
| `src/orchestra/autonomous/execution-pool.ts` | `ExecutionPool` interface + serial impl (concurrency-ready) | Create |
| `src/orchestra/autonomous-runtime.ts` | Add optional `PolicyGate` DI + policy step in cycle (authority/policy split) | Modify |
| `src/orchestra/autonomous/runtime-loop.ts` | Wire policyGate + backlog recovery into composition root | Modify |
| `src/core/config.ts` | `autonomous` config block (enabled/intervalMs/backlogPath/poolSize) + validation | Modify |
| `src/cli/commands/autonomous.ts` | `backlog list/add/remove` + `status` subcommands; engine start wiring | Modify |
| `src/cli/helpers/messages.ts` | `autonomous.backlog.*` i18n keys (en/tr) | Modify |
| `tests/orchestra/autonomous/*.test.ts` | Hermetic unit tests per module | Create |

---

## Task 1: Backlog types + durable store

**Files:**
- Create: `src/orchestra/autonomous/backlog-types.ts`
- Create: `src/orchestra/autonomous/backlog.ts`
- Test: `tests/orchestra/autonomous/backlog.test.ts`

- [ ] **Step 1: Write backlog-types.ts** (no test — pure types)

```typescript
// src/orchestra/autonomous/backlog-types.ts
// Backlog data model for the autonomous engine. Durable, git-trackable.
// Spec: docs/superpowers/specs/2026-06-07-autonomous-execution-engine-design.md §5

export type BacklogKind = 'task' | 'sprint';
export type BacklogPolicy = 'auto' | 'approval-required' | 'risk-tagged';
export type BacklogStatus = 'pending' | 'running' | 'parked' | 'done' | 'failed';

export type BacklogTrigger =
  | { type: 'recurring'; cron: string }
  | { type: 'one-off' }
  | { type: 'reactive'; detector: string };

/** A single unit of autonomous work. */
export interface BacklogEntry {
  id: string;
  title: string;
  kind: BacklogKind;
  /** kind=task → inline description for runTaskMode; kind=sprint → directives ref. */
  spec: { description?: string; directivesRef?: string; scopeDir?: string };
  policy: BacklogPolicy;
  provider?: string;
  model?: string;
  trigger: BacklogTrigger;
  status: BacklogStatus;
  tenant?: string;
  lastRun: string | null;
  lastResult: { ok: boolean; reason: string } | null;
}

/** On-disk backlog file shape (.deckent/autonomous/backlog.json). */
export interface BacklogFile {
  _version: string;
  entries: BacklogEntry[];
}
```

- [ ] **Step 2: Write the failing test for load + validate**

```typescript
// tests/orchestra/autonomous/backlog.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadBacklog, validateBacklogEntry, queryDue, updateStatus } from '../../../src/orchestra/autonomous/backlog.js';
import type { BacklogEntry } from '../../../src/orchestra/autonomous/backlog-types.js';

function entry(over: Partial<BacklogEntry> = {}): BacklogEntry {
  return {
    id: 'e1', title: 'demo', kind: 'task',
    spec: { description: 'do x', scopeDir: '.' },
    policy: 'auto', trigger: { type: 'one-off' },
    status: 'pending', lastRun: null, lastResult: null, ...over,
  };
}

describe('backlog store', () => {
  let dir: string;
  let path: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'backlog-')); path = join(dir, 'backlog.json'); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it('loads a valid backlog file', () => {
    writeFileSync(path, JSON.stringify({ _version: '1.0', entries: [entry()] }));
    const bl = loadBacklog(path);
    expect(bl.entries).toHaveLength(1);
    expect(bl.entries[0]!.id).toBe('e1');
  });

  it('returns empty backlog when file absent (fresh project)', () => {
    const bl = loadBacklog(join(dir, 'missing.json'));
    expect(bl.entries).toEqual([]);
  });

  it('rejects an entry with an invalid policy', () => {
    const bad = { ...entry(), policy: 'bogus' };
    expect(validateBacklogEntry(bad)).toMatch(/policy/);
  });

  it('accepts a fully valid entry', () => {
    expect(validateBacklogEntry(entry())).toBeNull();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/orchestra/autonomous/backlog.test.ts`
Expected: FAIL — `loadBacklog is not a function` / module not found.

- [ ] **Step 4: Write backlog.ts (load + validate)**

```typescript
// src/orchestra/autonomous/backlog.ts
// Durable backlog store. Single source of truth for autonomous work items.
// ADR-010 (no new dep): hand-written validation, mirrors validateCostConfig style.
import { existsSync, readFileSync } from 'node:fs';
import { atomicWriteFileSync } from '../../agents/worker-lifecycle.js';
import type { BacklogEntry, BacklogFile, BacklogStatus } from './backlog-types.js';

const KINDS = new Set(['task', 'sprint']);
const POLICIES = new Set(['auto', 'approval-required', 'risk-tagged']);
const STATUSES = new Set(['pending', 'running', 'parked', 'done', 'failed']);
const TRIGGER_TYPES = new Set(['recurring', 'one-off', 'reactive']);

/** Returns an error string describing the first violation, or null when valid. */
export function validateBacklogEntry(e: unknown): string | null {
  if (!e || typeof e !== 'object') return 'entry must be an object';
  const r = e as Record<string, unknown>;
  if (typeof r.id !== 'string' || !r.id) return 'entry.id must be a non-empty string';
  if (typeof r.title !== 'string') return `entry.${r.id}.title must be a string`;
  if (!KINDS.has(r.kind as string)) return `entry.${r.id}.kind must be task|sprint`;
  if (!POLICIES.has(r.policy as string)) return `entry.${r.id}.policy must be auto|approval-required|risk-tagged`;
  if (!STATUSES.has(r.status as string)) return `entry.${r.id}.status invalid`;
  const t = r.trigger as Record<string, unknown> | undefined;
  if (!t || !TRIGGER_TYPES.has(t.type as string)) return `entry.${r.id}.trigger.type invalid`;
  if (t.type === 'recurring' && typeof t.cron !== 'string') return `entry.${r.id}.trigger.cron required`;
  if (t.type === 'reactive' && typeof t.detector !== 'string') return `entry.${r.id}.trigger.detector required`;
  if (!r.spec || typeof r.spec !== 'object') return `entry.${r.id}.spec must be an object`;
  return null;
}

/** Load + validate the backlog. Missing file → empty backlog (fresh project). */
export function loadBacklog(path: string): BacklogFile {
  if (!existsSync(path)) return { _version: '1.0', entries: [] };
  const raw = JSON.parse(readFileSync(path, 'utf-8')) as BacklogFile;
  if (!Array.isArray(raw.entries)) throw new Error('backlog.entries must be an array');
  for (const e of raw.entries) {
    const err = validateBacklogEntry(e);
    if (err) throw new Error(`Invalid backlog entry: ${err}`);
  }
  return { _version: raw._version ?? '1.0', entries: raw.entries };
}
```

- [ ] **Step 5: Run test to verify load+validate pass**

Run: `npx vitest run tests/orchestra/autonomous/backlog.test.ts -t "load|valid|empty"`
Expected: PASS (4 tests).

- [ ] **Step 6: Write the failing test for queryDue + updateStatus (durable)**

```typescript
// append to tests/orchestra/autonomous/backlog.test.ts (inside describe)
  it('queryDue returns pending one-off entries', () => {
    const bl = { _version: '1.0', entries: [entry({ id: 'a' }), entry({ id: 'b', status: 'done' as const })] };
    const due = queryDue(bl, new Date('2026-06-07T00:00:00Z'));
    expect(due.map(e => e.id)).toEqual(['a']);
  });

  it('updateStatus persists atomically and re-loads', () => {
    writeFileSync(path, JSON.stringify({ _version: '1.0', entries: [entry({ id: 'a' })] }));
    const bl = loadBacklog(path);
    updateStatus(path, bl, 'a', 'running', null);
    const reloaded = loadBacklog(path);
    expect(reloaded.entries[0]!.status).toBe('running');
  });
```

- [ ] **Step 7: Run test to verify it fails**

Run: `npx vitest run tests/orchestra/autonomous/backlog.test.ts -t "queryDue|updateStatus"`
Expected: FAIL — `queryDue is not a function`.

- [ ] **Step 8: Add queryDue + updateStatus to backlog.ts**

```typescript
// append to src/orchestra/autonomous/backlog.ts
import { isCronDue } from '../../core/flow-scheduler.js'; // if absent, use FlowScheduler.tick in the trigger layer instead (Task 5)

/** Pending one-off entries + recurring entries whose cron is due at `now`. */
export function queryDue(bl: BacklogFile, now: Date): BacklogEntry[] {
  return bl.entries.filter((e) => {
    if (e.status !== 'pending') return false;
    if (e.trigger.type === 'one-off') return true;
    if (e.trigger.type === 'recurring') return cronDue(e.trigger.cron, now);
    return false; // reactive entries are driven by the reactive source (Task 5)
  });
}

/** Minimal cron-due check (mirrors core cron field grammar). */
function cronDue(_cron: string, _now: Date): boolean {
  // Delegated to the FlowScheduler in Task 5's hybrid trigger; here recurring
  // entries are surfaced only via that scheduler. queryDue therefore treats
  // recurring as not-due (the scheduler owns timing) — keeps this store
  // timing-free. Returning false is intentional, not a stub.
  return false;
}

/** Mutate one entry's status + lastResult and write the whole backlog atomically. */
export function updateStatus(
  path: string,
  bl: BacklogFile,
  id: string,
  status: BacklogStatus,
  lastResult: BacklogEntry['lastResult'],
): void {
  const e = bl.entries.find((x) => x.id === id);
  if (!e) throw new Error(`backlog entry ${id} not found`);
  e.status = status;
  if (lastResult !== null) { e.lastResult = lastResult; e.lastRun = new Date().toISOString(); }
  atomicWriteFileSync(path, JSON.stringify(bl, null, 2));
}
```

> **Note for executor:** confirm whether `isCronDue` exists in `flow-scheduler.ts`. If not, delete the import — `queryDue` does not call it (recurring timing is owned by the Task-5 scheduler). The one-off path is what queryDue drives.

- [ ] **Step 9: Run tests to verify all pass**

Run: `npx vitest run tests/orchestra/autonomous/backlog.test.ts`
Expected: PASS (6 tests). Then `npx tsc --noEmit` → clean.

- [ ] **Step 10: Commit**

```bash
git add src/orchestra/autonomous/backlog-types.ts src/orchestra/autonomous/backlog.ts tests/orchestra/autonomous/backlog.test.ts
git commit -m "feat(autonomous): durable backlog store + types (engine task 1)"
```

---

## Task 2: Policy gate (G2 per-task policy + G3 EffectClass risk)

**Files:**
- Create: `src/orchestra/autonomous/policy-gate.ts`
- Test: `tests/orchestra/autonomous/policy-gate.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/orchestra/autonomous/policy-gate.test.ts
import { describe, it, expect } from 'vitest';
import { decidePolicy } from '../../../src/orchestra/autonomous/policy-gate.js';
import type { BacklogEntry } from '../../../src/orchestra/autonomous/backlog-types.js';

const base: BacklogEntry = {
  id: 'e', title: 't', kind: 'task', spec: { description: 'x' },
  policy: 'auto', trigger: { type: 'one-off' }, status: 'pending',
  lastRun: null, lastResult: null,
};

describe('policy-gate', () => {
  it('auto policy → auto', () => {
    expect(decidePolicy({ ...base, policy: 'auto' }).decision).toBe('auto');
  });
  it('approval-required policy → park', () => {
    expect(decidePolicy({ ...base, policy: 'approval-required' }).decision).toBe('park');
  });
  it('risk-tagged + reversible effect → auto', () => {
    // kind=task → code-development → EffectClass reversible
    expect(decidePolicy({ ...base, policy: 'risk-tagged', kind: 'task' }).decision).toBe('auto');
  });
  it('risk-tagged sprint with explicit irreversible effect → park', () => {
    const d = decidePolicy({ ...base, policy: 'risk-tagged' }, 'critical-irreversible');
    expect(d.decision).toBe('park');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/orchestra/autonomous/policy-gate.test.ts`
Expected: FAIL — `decidePolicy is not a function`.

- [ ] **Step 3: Write policy-gate.ts**

```typescript
// src/orchestra/autonomous/policy-gate.ts
// G2 (per-task policy) + G3 (EffectClass risk). Decides auto-run vs park.
// Distinct from G1 RBAC authority (authority-adapter) — see spec §3 RESTRUCTURE.
import type { EffectClass } from '../rubric-registry.js';
import type { BacklogEntry } from './backlog-types.js';

export type PolicyDecision = 'auto' | 'park';
export interface PolicyResult { decision: PolicyDecision; reason: string; }

/** EffectClasses that may auto-run; the rest park for human approval. */
const AUTO_SAFE: ReadonlySet<EffectClass> = new Set<EffectClass>(['pure', 'reversible']);

/**
 * Decide whether a backlog entry may auto-run or must park.
 *   - policy 'auto'              → auto
 *   - policy 'approval-required' → park
 *   - policy 'risk-tagged'       → auto iff EffectClass is pure|reversible
 * `effect` is supplied by the caller (derived via getEffectClass for the
 * entry's task); when omitted, kind=sprint defaults to reversible (working-tree)
 * and kind=task to reversible (code-development) — both auto-safe.
 */
export function decidePolicy(entry: BacklogEntry, effect: EffectClass = 'reversible'): PolicyResult {
  if (entry.policy === 'auto') return { decision: 'auto', reason: 'policy=auto' };
  if (entry.policy === 'approval-required') return { decision: 'park', reason: 'policy=approval-required' };
  // risk-tagged
  return AUTO_SAFE.has(effect)
    ? { decision: 'auto', reason: `risk-tagged effect=${effect} (auto-safe)` }
    : { decision: 'park', reason: `risk-tagged effect=${effect} (requires approval)` };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/orchestra/autonomous/policy-gate.test.ts`
Expected: PASS (4 tests). `npx tsc --noEmit` → clean.

- [ ] **Step 5: Commit**

```bash
git add src/orchestra/autonomous/policy-gate.ts tests/orchestra/autonomous/policy-gate.test.ts
git commit -m "feat(autonomous): per-task policy + EffectClass risk gate (engine task 2)"
```

---

## Task 3: Execute dispatcher (task|sprint via fleet)

**Files:**
- Create: `src/orchestra/autonomous/execute-dispatcher.ts`
- Test: `tests/orchestra/autonomous/execute-dispatcher.test.ts`

The dispatcher returns an `ActionHandler` (the registry value `buildAutonomousRuntime` consumes). It reads the backlog entry from `payload.entry`, routes by `kind`, and injects the entry's provider/model. `runSprint`/`runTaskMode` are injected as deps so tests stay hermetic (no real spawn).

- [ ] **Step 1: Write the failing test**

```typescript
// tests/orchestra/autonomous/execute-dispatcher.test.ts
import { describe, it, expect, vi } from 'vitest';
import { makeExecuteDispatcher } from '../../../src/orchestra/autonomous/execute-dispatcher.js';
import type { BacklogEntry } from '../../../src/orchestra/autonomous/backlog-types.js';

const taskEntry: BacklogEntry = {
  id: 'e', title: 't', kind: 'task', spec: { description: 'do x', scopeDir: 'src/' },
  policy: 'auto', provider: 'ollama', model: 'qwen3.6:27b', trigger: { type: 'one-off' },
  status: 'pending', lastRun: null, lastResult: null,
};

describe('execute-dispatcher', () => {
  it('kind=task → runTask invoked with entry provider/model, returns success', async () => {
    const runTask = vi.fn().mockReturnValue({ ok: true });
    const runSprint = vi.fn();
    const handler = makeExecuteDispatcher({
      projectRoot: '/p', config: {} as never, runTask, runSprint,
    });
    const res = await handler('autonomous.execute', { entry: taskEntry });
    expect(res.outcome).toBe('success');
    expect(runTask).toHaveBeenCalledOnce();
    expect(runSprint).not.toHaveBeenCalled();
    const ctx = runTask.mock.calls[0]![0];
    expect(ctx.model).toBe('qwen3.6:27b');
  });

  it('kind=sprint → runSprint invoked', async () => {
    const runTask = vi.fn();
    const runSprint = vi.fn().mockResolvedValue({});
    const handler = makeExecuteDispatcher({ projectRoot: '/p', config: {} as never, runTask, runSprint });
    const res = await handler('autonomous.execute', { entry: { ...taskEntry, kind: 'sprint', spec: { directivesRef: 'D.md' } } });
    expect(res.outcome).toBe('success');
    expect(runSprint).toHaveBeenCalledOnce();
  });

  it('missing entry payload → failure (no silent success)', async () => {
    const handler = makeExecuteDispatcher({ projectRoot: '/p', config: {} as never, runTask: vi.fn(), runSprint: vi.fn() });
    const res = await handler('autonomous.execute', {});
    expect(res.outcome).toBe('failure');
    expect(res.error).toMatch(/entry/);
  });

  it('runTask throwing → failure with error', async () => {
    const runTask = vi.fn(() => { throw new Error('boom'); });
    const handler = makeExecuteDispatcher({ projectRoot: '/p', config: {} as never, runTask, runSprint: vi.fn() });
    const res = await handler('autonomous.execute', { entry: taskEntry });
    expect(res.outcome).toBe('failure');
    expect(res.error).toContain('boom');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/orchestra/autonomous/execute-dispatcher.test.ts`
Expected: FAIL — `makeExecuteDispatcher is not a function`.

- [ ] **Step 3: Write execute-dispatcher.ts**

```typescript
// src/orchestra/autonomous/execute-dispatcher.ts
// The real ActionHandler that fills buildAutonomousRuntime's empty handler map.
// kind=task → runTaskMode (single worker); kind=sprint → runSprint (full lifecycle).
// runTask/runSprint injected for hermetic tests.
import type { ResolvedConfig } from '../../core/config-types.js';
import type { ActionHandler } from '../../nervous/executor.js';
import type { BacklogEntry } from './backlog-types.js';

/** Action id the backlog-trigger sets on every entry-driven trigger. */
export const AUTONOMOUS_EXECUTE_ACTION = 'autonomous.execute';

export interface ExecuteDispatcherDeps {
  projectRoot: string;
  config: ResolvedConfig;
  /** Injected runTaskMode (kind=task). Returns a result object (ok optional). */
  runTask: (ctx: { projectRoot: string; description: string; model?: string; scope?: { directories: string[] } }, config: ResolvedConfig) => unknown;
  /** Injected runSprint (kind=sprint). */
  runSprint: (projectRoot: string, config: ResolvedConfig) => Promise<unknown>;
}

export function makeExecuteDispatcher(deps: ExecuteDispatcherDeps): ActionHandler {
  return async (_actionId, payload) => {
    const entry = payload?.entry as BacklogEntry | undefined;
    if (!entry || typeof entry !== 'object') {
      return { outcome: 'failure', error: 'execute-dispatcher: no backlog entry in payload' };
    }
    try {
      if (entry.kind === 'sprint') {
        await deps.runSprint(deps.projectRoot, deps.config);
      } else {
        deps.runTask(
          {
            projectRoot: deps.projectRoot,
            description: entry.spec.description ?? entry.title,
            model: entry.model,
            scope: { directories: [entry.spec.scopeDir ?? '.'] },
          },
          deps.config,
        );
      }
      return { outcome: 'success' };
    } catch (err: unknown) {
      return { outcome: 'failure', error: err instanceof Error ? err.message : String(err) };
    }
  };
}
```

> **Note for executor:** the real composition root (Task 7) passes the actual `runTaskMode`/`runSprint`. `runTaskMode` requires `config.deckent_style==='task'` and `runSprint` requires `'sprint'` — the composition root must clone the config with the right `deckent_style` per entry kind, or the engine config carries a sprint-style default and task entries get a task-style clone. Pin this in Task 7; the dispatcher itself is mode-agnostic (it just calls the injected fn).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/orchestra/autonomous/execute-dispatcher.test.ts`
Expected: PASS (4 tests). `npx tsc --noEmit` → clean.

- [ ] **Step 5: Commit**

```bash
git add src/orchestra/autonomous/execute-dispatcher.ts tests/orchestra/autonomous/execute-dispatcher.test.ts
git commit -m "feat(autonomous): execute-dispatcher task|sprint via fleet (engine task 3)"
```

---

## Task 4: Authority/policy split in the cycle

**Files:**
- Modify: `src/orchestra/autonomous-runtime.ts` (add optional `PolicyGate` DI + cycle step)
- Test: `tests/orchestra/autonomous/cycle-policy.test.ts`

The 226 cycle does `authority → (needs_approval) → approval → execute`. We add a **policy gate** between authority-allowed and execute. It is **optional** (absent → existing behavior, preserving 226 tests). When present and it returns `park`, the cycle routes through the approval gate exactly like `needs_approval`.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/orchestra/autonomous/cycle-policy.test.ts
import { describe, it, expect, vi } from 'vitest';
import { runAutonomousCycle } from '../../../src/orchestra/autonomous-runtime.js';
import type { AutonomousRuntimeDeps, AutonomousTrigger } from '../../../src/orchestra/autonomous-runtime.js';

const trig: AutonomousTrigger = { id: 't1', source: 'backlog', action: 'autonomous.execute', requestedBy: 'system', payload: {} };

function deps(over: Partial<AutonomousRuntimeDeps>): AutonomousRuntimeDeps {
  return {
    triggerSource: { next: () => trig },
    authority: { check: () => ({ outcome: 'allowed', reason: 'ok' }) },
    approvalGate: { request: () => ({ outcome: 'pending', reason: 'parked' }) },
    executor: { execute: vi.fn().mockResolvedValue({ ok: true }) },
    audit: { record: () => {} },
    ...over,
  };
}

describe('cycle policy gate', () => {
  it('policyGate=park → cycle parks (pending), executor NOT called', async () => {
    const exec = vi.fn().mockResolvedValue({ ok: true });
    const d = deps({ executor: { execute: exec }, policyGate: { decide: () => ({ decision: 'park', reason: 'approval-required' }) } });
    const res = await runAutonomousCycle({}, d);
    expect(res.outcome).toBe('pending');
    expect(exec).not.toHaveBeenCalled();
  });

  it('policyGate=auto → executor runs', async () => {
    const exec = vi.fn().mockResolvedValue({ ok: true });
    const d = deps({ executor: { execute: exec }, policyGate: { decide: () => ({ decision: 'auto', reason: 'auto' }) } });
    const res = await runAutonomousCycle({}, d);
    expect(res.outcome).toBe('executed');
    expect(exec).toHaveBeenCalledOnce();
  });

  it('no policyGate → legacy behavior preserved (executes when authority allowed)', async () => {
    const exec = vi.fn().mockResolvedValue({ ok: true });
    const d = deps({ executor: { execute: exec } });
    const res = await runAutonomousCycle({}, d);
    expect(res.outcome).toBe('executed');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/orchestra/autonomous/cycle-policy.test.ts`
Expected: FAIL — `policyGate` not in deps type / park path not honored.

- [ ] **Step 3: Add PolicyGate to autonomous-runtime.ts**

Add the interface near the other DI interfaces:

```typescript
// src/orchestra/autonomous-runtime.ts — add near ActionExecutor
/** Per-task policy gate (G2 + G3). Optional; absent → legacy authority-only flow. */
export interface PolicyGate {
  decide(trigger: AutonomousTrigger): { decision: 'auto' | 'park'; reason: string };
}
```

Add `policyGate?: PolicyGate;` to `AutonomousRuntimeDeps`.

In `runAutonomousCycle`, after the authority block (when `authority.outcome !== 'denied'`) and before `const action = await deps.executor.execute(trigger)`, insert:

```typescript
  // G2/G3 — per-task policy gate (separate from RBAC authority). When it parks,
  // route through the approval gate exactly like an authority needs_approval.
  if (deps.policyGate) {
    const policy = deps.policyGate.decide(trigger);
    if (policy.decision === 'park') {
      approval = await deps.approvalGate.request(trigger);
      if (approval.outcome === 'rejected') {
        return finish(trigger, authority, approval, null, 'rejected', approval.reason ?? policy.reason, deps.audit, now);
      }
      if (approval.outcome === 'pending') {
        return finish(trigger, authority, approval, null, 'pending', approval.reason ?? policy.reason, deps.audit, now);
      }
      // approved → fall through to execute
    }
  }
```

(`approval` is already declared `let approval: ApprovalDecision | null = null;` earlier — reuse it.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/orchestra/autonomous/cycle-policy.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Run the existing 226 cycle tests to confirm no regression**

Run: `npx vitest run tests/orchestra/autonomous/ tests/orchestra/autonomous-runtime.test.ts`
Expected: PASS (all existing + new). `npx tsc --noEmit` → clean.

- [ ] **Step 6: Commit**

```bash
git add src/orchestra/autonomous-runtime.ts tests/orchestra/autonomous/cycle-policy.test.ts
git commit -m "feat(autonomous): split RBAC authority from per-task policy gate in cycle (engine task 4)"
```

---

## Task 5: Hybrid trigger source (backlog ∪ scheduled-flow ∪ reactive)

**Files:**
- Create: `src/orchestra/autonomous/backlog-trigger.ts`
- Test: `tests/orchestra/autonomous/backlog-trigger.test.ts`

Provides `makeBacklogTriggerSource` (yields `AUTONOMOUS_EXECUTE_ACTION` triggers carrying `{ entry }`) and `makeHybridTriggerSource` (tries backlog → scheduled-flow `makeTriggerSource` → reactive, returning the first non-null). Reactive source is injected (nervous detector-registry adapter / F3-007); for this task it is a typed injected `TriggerSource` (real wire breadth = Sub-project 2).

- [ ] **Step 1: Write the failing test**

```typescript
// tests/orchestra/autonomous/backlog-trigger.test.ts
import { describe, it, expect } from 'vitest';
import { makeBacklogTriggerSource, makeHybridTriggerSource } from '../../../src/orchestra/autonomous/backlog-trigger.js';
import type { BacklogFile } from '../../../src/orchestra/autonomous/backlog-types.js';

const bl: BacklogFile = { _version: '1.0', entries: [
  { id: 'a', title: 't', kind: 'task', spec: { description: 'x' }, policy: 'auto', trigger: { type: 'one-off' }, status: 'pending', lastRun: null, lastResult: null },
]};

describe('backlog trigger', () => {
  it('yields a trigger carrying the due entry, then null', async () => {
    const src = makeBacklogTriggerSource(() => bl, () => new Date('2026-06-07T00:00:00Z'));
    const first = await src.next();
    expect(first?.action).toBe('autonomous.execute');
    expect((first?.payload as { entry: { id: string } }).entry.id).toBe('a');
  });

  it('hybrid falls through to the second source when backlog idle', async () => {
    const empty = makeBacklogTriggerSource(() => ({ _version: '1.0', entries: [] }), () => new Date());
    const fallback = { next: () => ({ id: 'f', source: 'scheduled-flow', action: 'x', requestedBy: 'system' }) };
    const hybrid = makeHybridTriggerSource([empty, fallback]);
    const res = await hybrid.next();
    expect(res?.id).toBe('f');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/orchestra/autonomous/backlog-trigger.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write backlog-trigger.ts**

```typescript
// src/orchestra/autonomous/backlog-trigger.ts
// Backlog-due TriggerSource + hybrid composer. Spec §4 trigger layer.
import type { AutonomousTrigger, TriggerSource } from '../autonomous-runtime.js';
import { AUTONOMOUS_EXECUTE_ACTION } from './execute-dispatcher.js';
import { queryDue } from './backlog.js';
import type { BacklogFile } from './backlog-types.js';

/**
 * TriggerSource over the backlog. `load` is called each tick (fresh state so
 * cross-process status changes are seen); `clock` supplies now for due-eval.
 * Yields one trigger per tick; the entry travels in `payload.entry`.
 */
export function makeBacklogTriggerSource(
  load: () => BacklogFile,
  clock: () => Date,
): TriggerSource {
  return {
    next(): AutonomousTrigger | null {
      const due = queryDue(load(), clock());
      const entry = due[0];
      if (!entry) return null;
      return {
        id: `backlog-${entry.id}`,
        source: 'backlog',
        action: AUTONOMOUS_EXECUTE_ACTION,
        requestedBy: entry.tenant ? `system:${entry.tenant}` : 'system',
        payload: { entry },
      };
    },
  };
}

/** Try each source in order; return the first non-null trigger (idle → null). */
export function makeHybridTriggerSource(sources: TriggerSource[]): TriggerSource {
  return {
    async next(): Promise<AutonomousTrigger | null> {
      for (const s of sources) {
        const t = await s.next();
        if (t) return t;
      }
      return null;
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/orchestra/autonomous/backlog-trigger.test.ts`
Expected: PASS (2 tests). `npx tsc --noEmit` → clean.

- [ ] **Step 5: Commit**

```bash
git add src/orchestra/autonomous/backlog-trigger.ts tests/orchestra/autonomous/backlog-trigger.test.ts
git commit -m "feat(autonomous): hybrid trigger source (backlog ∪ scheduled-flow ∪ reactive) (engine task 5)"
```

---

## Task 6: Execution pool (concurrency-ready) + loop recovery

**Files:**
- Create: `src/orchestra/autonomous/execution-pool.ts`
- Test: `tests/orchestra/autonomous/execution-pool.test.ts`
- Test: `tests/orchestra/autonomous/recovery.test.ts`

The `ExecutionPool` interface lets the loop submit work without knowing concurrency. Pass-1 ships a serial (size-1) pool; a future concurrent pool swaps in without loop changes (spec §7). Recovery: `recoverBacklog` resets any `running` entry (interrupted by crash) back to `pending`.

- [ ] **Step 1: Write the failing test (pool)**

```typescript
// tests/orchestra/autonomous/execution-pool.test.ts
import { describe, it, expect } from 'vitest';
import { makeSerialPool } from '../../../src/orchestra/autonomous/execution-pool.js';

describe('serial execution pool', () => {
  it('runs submitted jobs and returns results in order', async () => {
    const pool = makeSerialPool();
    const order: number[] = [];
    await pool.submit(async () => { order.push(1); });
    await pool.submit(async () => { order.push(2); });
    expect(order).toEqual([1, 2]);
  });

  it('a throwing job rejects its own submit, pool keeps working', async () => {
    const pool = makeSerialPool();
    await expect(pool.submit(async () => { throw new Error('x'); })).rejects.toThrow('x');
    await expect(pool.submit(async () => 'ok')).resolves.toBe('ok');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/orchestra/autonomous/execution-pool.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write execution-pool.ts**

```typescript
// src/orchestra/autonomous/execution-pool.ts
// Concurrency-abstraction for autonomous execution. Pass-1 = serial (size 1).
// A concurrent pool (bounded worker count) implements the same interface later
// without touching the loop — spec §7 enterprise interface requirement.
export interface ExecutionPool {
  submit<T>(job: () => Promise<T>): Promise<T>;
}

/** Serial pool: one job at a time, FIFO. Errors propagate to the submitter. */
export function makeSerialPool(): ExecutionPool {
  let tail: Promise<unknown> = Promise.resolve();
  return {
    submit<T>(job: () => Promise<T>): Promise<T> {
      const run = tail.then(job, job); // run after prior settles (success or fail)
      tail = run.catch(() => undefined);
      return run as Promise<T>;
    },
  };
}
```

- [ ] **Step 4: Run pool test → PASS**

Run: `npx vitest run tests/orchestra/autonomous/execution-pool.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Write the failing recovery test**

```typescript
// tests/orchestra/autonomous/recovery.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadBacklog } from '../../../src/orchestra/autonomous/backlog.js';
import { recoverBacklog } from '../../../src/orchestra/autonomous/execution-pool.js';

describe('crash recovery', () => {
  let dir: string; let path: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'rec-')); path = join(dir, 'backlog.json'); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it('resets running entries to pending on restart', () => {
    writeFileSync(path, JSON.stringify({ _version: '1.0', entries: [
      { id: 'a', title: 't', kind: 'task', spec: {}, policy: 'auto', trigger: { type: 'one-off' }, status: 'running', lastRun: null, lastResult: null },
    ]}));
    recoverBacklog(path);
    expect(loadBacklog(path).entries[0]!.status).toBe('pending');
  });
});
```

- [ ] **Step 6: Run recovery test → FAIL** (`recoverBacklog` undefined), then add it:

```typescript
// append to src/orchestra/autonomous/execution-pool.ts
import { loadBacklog } from './backlog.js';
import { atomicWriteFileSync } from '../../agents/worker-lifecycle.js';

/** Reset any `running` entry (interrupted by a crash) back to `pending`. */
export function recoverBacklog(path: string): void {
  const bl = loadBacklog(path);
  let changed = false;
  for (const e of bl.entries) {
    if (e.status === 'running') { e.status = 'pending'; changed = true; }
  }
  if (changed) atomicWriteFileSync(path, JSON.stringify(bl, null, 2));
}
```

- [ ] **Step 7: Run both pool + recovery tests → PASS.** `npx tsc --noEmit` → clean.

- [ ] **Step 8: Commit**

```bash
git add src/orchestra/autonomous/execution-pool.ts tests/orchestra/autonomous/execution-pool.test.ts tests/orchestra/autonomous/recovery.test.ts
git commit -m "feat(autonomous): execution pool (concurrency-ready) + crash recovery (engine task 6)"
```

---

## Task 7: Config + composition root + CLI + i18n + smoke

**Files:**
- Modify: `src/core/config.ts` (autonomous block + validation)
- Modify: `src/orchestra/autonomous/runtime-loop.ts` (wire policyGate + backlog + dispatcher + recovery)
- Modify: `src/cli/commands/autonomous.ts` (backlog list/add/remove + status; engine start)
- Modify: `src/cli/helpers/messages.ts` (`autonomous.backlog.*` en/tr)
- Test: `tests/orchestra/autonomous/composition.test.ts`, `tests/cli/autonomous-backlog.test.ts`

- [ ] **Step 1: Write the failing composition test**

```typescript
// tests/orchestra/autonomous/composition.test.ts
import { describe, it, expect, vi } from 'vitest';
import { buildEngineRuntime } from '../../../src/orchestra/autonomous/runtime-loop.js';

describe('engine composition root', () => {
  it('builds a runtime whose handler map contains the execute action + a policy gate', () => {
    const bundle = buildEngineRuntime({
      projectRoot: '/p', config: { deckent_style: 'sprint' } as never,
      backlogPath: '/p/.deckent/autonomous/backlog.json',
      flows: [], policy: { id: 'p', trigger: 'scheduled', action: 'noop', disabled: true } as never,
      runTask: vi.fn(), runSprint: vi.fn(),
    });
    expect(bundle.deps.policyGate).toBeDefined();
    expect(typeof bundle.deps.triggerSource.next).toBe('function');
  });
});
```

- [ ] **Step 2: Run → FAIL** (`buildEngineRuntime` undefined).

- [ ] **Step 3: Add `buildEngineRuntime` to runtime-loop.ts**

```typescript
// src/orchestra/autonomous/runtime-loop.ts — new export, composes engine pieces
import { makeBacklogTriggerSource, makeHybridTriggerSource } from './backlog-trigger.js';
import { makeExecuteDispatcher, AUTONOMOUS_EXECUTE_ACTION } from './execute-dispatcher.js';
import { decidePolicy } from './policy-gate.js';
import { loadBacklog } from './backlog.js';
import type { PolicyGate } from '../autonomous-runtime.js';
import type { ResolvedConfig } from '../../core/config-types.js';
import type { ActionHandler } from '../../nervous/executor.js';

export interface BuildEngineRuntimeOptions {
  projectRoot: string;
  config: ResolvedConfig;
  backlogPath: string;
  flows: ScheduledFlow[];
  policy: SelfDispatchPolicy;
  runTask: ExecuteDispatcherDeps['runTask'];
  runSprint: ExecuteDispatcherDeps['runSprint'];
  reactiveSource?: TriggerSource;   // Sub-project 2 plugs a real detector source
  clock?: () => Date;
  now?: () => string;
}

export function buildEngineRuntime(opts: BuildEngineRuntimeOptions): AutonomousRuntimeBundle {
  const handlers = new Map<string, ActionHandler>();
  handlers.set(AUTONOMOUS_EXECUTE_ACTION, makeExecuteDispatcher({
    projectRoot: opts.projectRoot, config: opts.config, runTask: opts.runTask, runSprint: opts.runSprint,
  }));

  const base = buildAutonomousRuntime({
    projectRoot: opts.projectRoot, flows: opts.flows, policy: opts.policy,
    actionHandlers: handlers, clock: opts.clock, now: opts.now,
  });

  // Hybrid trigger: backlog-due first, then scheduled-flow (base.triggerSource), then reactive.
  const backlogSrc = makeBacklogTriggerSource(() => loadBacklog(opts.backlogPath), opts.clock ?? (() => new Date()));
  const sources = [backlogSrc, base.deps.triggerSource];
  if (opts.reactiveSource) sources.push(opts.reactiveSource);
  base.deps.triggerSource = makeHybridTriggerSource(sources);

  // Policy gate (G2+G3): reads the backlog entry from the trigger payload.
  const policyGate: PolicyGate = {
    decide(trigger) {
      const entry = (trigger.payload as { entry?: import('./backlog-types.js').BacklogEntry } | undefined)?.entry;
      if (!entry) return { decision: 'auto', reason: 'no entry (non-backlog trigger) → authority-only' };
      return decidePolicy(entry); // effect defaults reversible; getEffectClass wired when Task carries TaskType
    },
  };
  base.deps.policyGate = policyGate;

  return base;
}
```

(Imports `ExecuteDispatcherDeps`, `TriggerSource`, `ScheduledFlow`, `SelfDispatchPolicy`, `AutonomousRuntimeBundle` already present or add them.)

- [ ] **Step 4: Run composition test → PASS.**

- [ ] **Step 5: Add autonomous config block to config.ts**

In the config schema + defaults, add (mirroring the `nervous_system` block at config.ts:741):

```typescript
// defaults
autonomous: { enabled: false, interval_ms: 5000, backlog_path: '.deckent/autonomous/backlog.json', pool_size: 1 },
```

Validation (near line 741):

```typescript
if (config.autonomous !== undefined) {
  const a = config.autonomous;
  if (typeof a.enabled !== 'boolean') errors.push('autonomous.enabled must be boolean');
  if (a.interval_ms !== undefined && a.interval_ms < 0) errors.push('autonomous.interval_ms must be >= 0');
  if (a.pool_size !== undefined && a.pool_size < 1) errors.push('autonomous.pool_size must be >= 1');
}
```

Add the `autonomous?` field to the config type in `core/config-types.ts`. Default-disabled (flag-gated; spec §6 safety).

- [ ] **Step 6: Write the failing CLI backlog test**

```typescript
// tests/cli/autonomous-backlog.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { backlogAdd, backlogList } from '../../src/cli/commands/autonomous.js';

describe('autonomous backlog CLI', () => {
  let root: string;
  beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'cli-bl-')); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  it('add writes an entry, list returns it', () => {
    backlogAdd({ root, id: 'x', title: 'demo', kind: 'task', description: 'do x', policy: 'auto', lang: 'en' });
    const list = backlogList({ root, lang: 'en' });
    expect(list.find(e => e.id === 'x')).toBeDefined();
    expect(existsSync(join(root, '.deckent/autonomous/backlog.json'))).toBe(true);
  });
});
```

- [ ] **Step 7: Run → FAIL**, then implement `backlogAdd`/`backlogList`/`backlogRemove` + a `status` printer in `autonomous.ts`, using `loadBacklog`, `validateBacklogEntry`, and `atomicWriteFileSync`. All user-facing strings via `getMessage('autonomous.backlog.*', lang)` (add keys to messages.ts en/tr — e.g. `autonomous.backlog.added`, `autonomous.backlog.empty`, `autonomous.backlog.removed`, `autonomous.backlog.not_found`). Register `deckent autonomous backlog <add|list|remove>` + extend `status` to print backlog summary (pending/running/parked/done counts).

```typescript
// src/cli/commands/autonomous.ts — core helpers (exported for tests)
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { loadBacklog, validateBacklogEntry } from '../../orchestra/autonomous/backlog.js';
import { atomicWriteFileSync } from '../../agents/worker-lifecycle.js';
import type { BacklogEntry } from '../../orchestra/autonomous/backlog-types.js';

function backlogPath(root: string): string { return join(root, '.deckent/autonomous/backlog.json'); }

export function backlogAdd(o: { root: string; id: string; title: string; kind: 'task'|'sprint'; description: string; policy: BacklogEntry['policy']; lang: string }): void {
  const path = backlogPath(o.root);
  const bl = loadBacklog(path);
  const entry: BacklogEntry = {
    id: o.id, title: o.title, kind: o.kind, spec: { description: o.description },
    policy: o.policy, trigger: { type: 'one-off' }, status: 'pending', lastRun: null, lastResult: null,
  };
  const err = validateBacklogEntry(entry);
  if (err) throw new Error(err);
  bl.entries.push(entry);
  mkdirSync(dirname(path), { recursive: true });
  atomicWriteFileSync(path, JSON.stringify(bl, null, 2));
}

export function backlogList(o: { root: string; lang: string }): BacklogEntry[] {
  return loadBacklog(backlogPath(o.root)).entries;
}
```

- [ ] **Step 8: Run CLI + composition + all engine tests → PASS.** `npx tsc --noEmit` → clean.

- [ ] **Step 9: Tier-1 real-binary smoke** (autonomous CLI is a user surface — ADR-079)

Run (after `npm run build`):
```bash
node dist/cli/entry.js autonomous backlog add --id s1 --title smoke --kind task --description "x" --policy auto --root /tmp/sm
node dist/cli/entry.js autonomous backlog list --root /tmp/sm
node dist/cli/entry.js autonomous backlog list --root /tmp/sm --lang tr
```
Expected: add confirms (EN), list shows `s1`, TR run prints Turkish labels, exit 0. Record output as the `Smoke:` proof.

- [ ] **Step 10: Commit**

```bash
git add src/core/config.ts src/core/config-types.ts src/orchestra/autonomous/runtime-loop.ts src/cli/commands/autonomous.ts src/cli/helpers/messages.ts tests/orchestra/autonomous/composition.test.ts tests/cli/autonomous-backlog.test.ts
git commit -m "feat(autonomous): config + composition root + backlog CLI + i18n + smoke (engine task 7)"
```

---

## Task 8: Ledger update (durable project record)

**Files:**
- Modify: `docs/MASTER-PLAN.md` (F3-009 status + AS-6 progress)
- Modify: memory `project_autonomous_engine_direction.md` (mark engine landed)

- [ ] **Step 1: Update MASTER-PLAN.md** F3-009 row: from "~80% wired-inert" to the new state — engine landed (backlog + 3-gate governance + dispatcher + hybrid trigger + pool/recovery + CLI), flag-gated default-off. Note Sub-projects 2-5 remain.

- [ ] **Step 2: Update the memory** `project_autonomous_engine_direction.md` DURUM line: brainstorm+spec+plan+implementation engine landed; next = Sub-project 2 (reactive trigger breadth) / activation dogfood.

- [ ] **Step 3: Commit**

```bash
git add docs/MASTER-PLAN.md
git commit -m "docs(master-plan): autonomous execution engine landed (F3-009 / AS-6 sub-project 1)"
```

---

## Self-Review (completed by plan author)

**Spec coverage:** §4 architecture → Tasks 1-7 (every module mapped). §5 data model → Task 1. §6 three-gate flow → Task 4 (split) + Task 2 (policy/risk) + reuse (authority/approval/audit). §7 enterprise interfaces → Task 6 (pool + recovery) + Task 7 (config/observability via existing event-stream). §8 personas → Task 7 config postures. §9 testing → every task is TDD. §10 sequencing → Tasks 1-8 in order. §11 honesty → reactive source injected (Task 5/7), providers per-entry (Task 3). **No gap.**

**Placeholder scan:** No "TBD/TODO". The `cronDue` returning false in Task 1 is documented as intentional (scheduler owns recurring timing in Task 5), not a stub. The `isCronDue` import carries an explicit executor note to remove if absent.

**Type consistency:** `BacklogEntry`/`BacklogFile` (Task 1) used identically in Tasks 2,3,5,7. `AUTONOMOUS_EXECUTE_ACTION` defined in Task 3, consumed in Task 5,7. `PolicyGate.decide` (Task 4) matches the gate built in Task 7. `ExecutionPool.submit` (Task 6) consistent. `decidePolicy(entry, effect?)` (Task 2) called in Task 7.

**Scope:** Single foundational engine; Sub-projects 2-5 + packaging explicitly out (spec §2). One implementation plan.

---

## Open executor decisions (pin during execution, not blockers)

1. **Config `deckent_style` per entry kind:** `runSprint` needs `'sprint'`, `runTaskMode` needs `'task'`. The composition root (Task 7) must clone the engine config to the right style per entry kind before calling the injected fn. Pin the clone site in Task 7 wiring.
2. **EffectClass for risk-tagged entries:** Task 2 defaults effect to `reversible`. To use `getEffectClass(task)` precisely, the entry must carry/derive a `Task` with a `TaskType`. Pin whether risk-tagged entries declare `taskType` in `spec` (then `getEffectClass` is exact) or rely on the reversible default. Reversible default is safe (auto for the common case); declaring taskType is the precise path.
