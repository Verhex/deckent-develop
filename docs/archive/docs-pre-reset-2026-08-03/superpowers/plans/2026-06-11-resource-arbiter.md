# Resource Arbiter (V1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Deckent execution note:** This plan is phase-ordered so each phase = one deckent sprint **wave**. It can be executed either via the superpowers sub-skills above OR converted to a `DIRECTIVES.md` micro-task graph (one task per plan task, `- Dependencies:` = phase edges) and run with `deckent plan --structured` → `deckent start`. Model layering suggestion per task is noted as `[opus]`/`[sonnet]`/`[haiku]`.

**Goal:** Build a host-arbitrated, file-based admission-control layer so concurrent resource-heavy worker commands (full test suites, installs, native builds, migrations) never oversubscribe the machine — gated by lease before exec, FIFO-ordered, with the wait clock frozen so queued workers never die of timeout.

**Architecture:** **Host-Hakem + İnce-İstemci (K5).** All allocation logic runs in ONE host process (the arbiter loop, driven from the existing result-collector dispatch tick). Container/worker side is a dumb import-free Node client (`arbiter-client.mjs`) that only writes a request file and polls for a grant. Single allocator ⇒ no distributed seq/TOCTOU races. Enforcement reaches commands via a coverage matrix (PM-shim + NODE_OPTIONS preload + binary PATH-shim). Two-level capacity (per-class + global `heavy` pool) stops cross-class oversubscription. cgroup `--memory` (L4) remains the co-primary backstop.

**Tech Stack:** TypeScript (ESM, Node16 — `.js` import suffix MANDATORY), vitest (hermetic: tmpdir + async `spawn`, NO `spawnSync`), Zod (config schema — already used: `CHAT_CONFIG_SCHEMA`), node:fs/promises. i18n via `getMessage` (en+tr). Reference spec: `docs/superpowers/specs/2026-06-11-resource-arbiter-design.md` (§-refs throughout).

---

## File Structure

**New files:**
- `src/core/resource-class-types.ts` — `ResourceClass`, `ResourcePool`, `LeaseGrant`, `LeaseStatus`, `LeaseRequest`, `LedgerEntry` interfaces (types only, no logic).
- `src/core/resource-classes.ts` — built-in classes, Zod schema + `validateResourceClasses`, 3-layer merge helper, `resolveAutoCapacity` (host snapshot), `matchCommandToClass`.
- `src/core/resource-arbiter.ts` — `LeaseBackend` interface + `FileLeaseBackend` (host-hakem: request scan, ledger arrival-order, two-gate grant, probe-reap, release/promote, queue snapshot, fail-mode). Async I/O (ADR-087).
- `src/orchestra/lease-shim.ts` — generates shim scripts + `preload.cjs` + import-free `arbiter-client.mjs` into `.deckent/shims/`; computes the spawn env (PATH prepend + NODE_OPTIONS + DECKENT_* vars).
- `src/orchestra/arbiter-loop.ts` — `startArbiterLoop(root)` (standalone 1s driver, process-singleton) + `arbiterTick(root)` (one allocation pass, also callable from result-collector dispatch tick).
- `src/cli/commands/lease.ts` — `deckent lease ls|release|clear|test` (register<Lease> pattern, ADR-012).
- Assets template: `assets/arbiter-client.mjs` (source of truth copied to `.deckent/shims/` at generation — see Task 3.1 note).

**Modified files:**
- `src/core/config.ts` — add `resource_classes` + `resource_pools` keys to schema + defaults; `validatePartialConfig` already covers them once in schema.
- `src/orchestra/spawn-backend-docker.ts:724` area — inject `DECKENT_WORKER_ID` + PATH/NODE_OPTIONS; widen in-container backstop timeout.
- `src/orchestra/tmux.ts:150` area — inject env + widen backstop.
- `src/orchestra/spawn-backend.ts` (subprocess) — inject env; make host-side `setTimeout` lease-aware (subprocess.ts:184).
- `src/orchestra/result-collector.ts:227` (`planDispatch`) — saturation filter + reject-class co-dispatch ban; `:787` dispatch tick — call `arbiterTick`.
- `src/cli/commands/status.ts` — queue summary line.
- `src/monitor/auditor.ts` — `.dashboard` queue info line (no new stale logic — K7).
- `src/cli/helpers/messages.ts` — `lease.*` keys (en+tr).
- `src/orchestra/task-builder.ts` — parse `- ResourceClass:` DIRECTIVES override → `expectedResourceClasses`.
- `docs/reference/api-surface.md` — `.deckent/leases/` file formats + `.tasks` `expectedResourceClasses?`.
- `.gitignore` — `.deckent/leases/`, `.deckent/shims/`.

---

## Build Order (phases = waves)

| Phase | Title | Depends on | Model |
|-------|-------|-----------|-------|
| 0 | Types + classes + schema + config | — | sonnet |
| 1 | Host-Hakem core (FileLeaseBackend) | 0 | **opus** |
| 2 | İnce-istemci (arbiter-client.mjs) | 1 | **opus** |
| 3 | Shim generation + enforcement matrix | 0, 2 | **opus** |
| 4 | Wiring (loop driver + env + emit) | 1, 2, 3 | sonnet |
| 5 | K2 host accounting (clock-freeze) | 1, 4 | **opus** |
| 6 | L1 dispatch-deferral | 0, 1 | sonnet |
| 7 | CLI + visibility | 1 | sonnet |
| 8 | i18n + docs + Tier-1 smoke | all | haiku/sonnet |

Within a phase, tasks may run in parallel (no shared files). Commit after every task.

---

# Phase 0 — Types, Classes, Schema, Config

### Task 0.1: Resource-class types `[sonnet]`

**Files:**
- Create: `src/core/resource-class-types.ts`

- [ ] **Step 1: Write the types file** (types only — no test needed for pure interfaces; verified by `tsc`)

```typescript
// src/core/resource-class-types.ts
/** Admission policy for a resource class. V1: queue | reject. (coalesce = V2.) */
export type ResourcePolicy = 'queue' | 'reject';

/** A capacity value: a fixed integer, or 'auto' (host-derived at resolve time). */
export type Capacity = number | 'auto';

/** One protected-command class (spec §11). */
export interface ResourceClass {
  /** Regexes (string form) matched against the full command line. */
  match: string[];
  /** Explicit binary allow-list for PATH-shim generation (spec §8.3). Empty = no standalone shim. */
  binaries: string[];
  /** Global pool this class draws from, in addition to its own capacity (K6). */
  pool: string;
  capacity: Capacity;
  policy: ResourcePolicy;
  /** Last-resort TTL ceiling in seconds; null = explicit-release-only (V2 ERP — reserved). */
  ttlSeconds: number | null;
  /** When false, a built-in class is disabled by project config (spec §11). */
  enabled?: boolean;
  /** V2 reservations — unused in V1. */
  tenant?: string;
  scope?: 'machine' | 'tenant';
}

/** A global capacity pool (K6). */
export interface ResourcePool {
  capacity: Capacity;
}

export type ResourceClassMap = Record<string, ResourceClass>;
export type ResourcePoolMap = Record<string, ResourcePool>;

/** A worker's request to acquire a lease (written by the client). */
export interface LeaseRequest {
  holder: string;        // <taskId|manual>-<pid>-<nonce>
  taskId?: string;
  classId: string;
  cmd: string;
  pid: number;
  requestedAt: string;   // ISO 8601
  ts: string;            // ISO 8601, renewed by client
}

/** Host's grant record (written by the arbiter). */
export interface LeaseGrant {
  holder: string;
  classId: string;
  grantedAt: string;     // ISO 8601
}

/** One ledger row — the host's single source of arrival truth (K7). */
export interface LedgerEntry {
  holder: string;
  classId: string;
  seenAt: string;        // ISO 8601 — arrival order key
  grantedAt?: string;
  releasedAt?: string;
  /** Accumulated wait intervals in ms (K2 active-time accounting). */
  waitMs: number;
}

/** Live status row for `deckent lease ls` / status (spec §10). */
export interface LeaseStatus {
  classId: string;
  pool: string;
  capacity: number;
  granted: number;
  waiting: number;
  longestWaitMs: number;
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: PASS (no errors referencing the new file)

- [ ] **Step 3: Commit**

```bash
git add src/core/resource-class-types.ts
git commit -m "feat(arbiter): resource-class type definitions (ADR-090)"
```

---

### Task 0.2: Built-in classes + schema validation `[sonnet]`

**Files:**
- Create: `src/core/resource-classes.ts`
- Test: `tests/core/resource-classes.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/core/resource-classes.test.ts
import { describe, it, expect } from 'vitest';
import {
  BUILTIN_RESOURCE_CLASSES, BUILTIN_RESOURCE_POOLS,
  validateResourceClasses, mergeResourceClasses, matchCommandToClass,
} from '../../src/core/resource-classes.js';

describe('built-in resource classes', () => {
  it('ships heavy-test, package-install, native-build, db-migration', () => {
    expect(Object.keys(BUILTIN_RESOURCE_CLASSES).sort())
      .toEqual(['db-migration', 'heavy-test', 'native-build', 'package-install']);
  });
  it('all built-ins draw from the heavy pool', () => {
    for (const c of Object.values(BUILTIN_RESOURCE_CLASSES)) expect(c.pool).toBe('heavy');
  });
  it('db-migration is reject policy, capacity 1', () => {
    expect(BUILTIN_RESOURCE_CLASSES['db-migration'].policy).toBe('reject');
    expect(BUILTIN_RESOURCE_CLASSES['db-migration'].capacity).toBe(1);
  });
});

describe('validateResourceClasses', () => {
  it('rejects an unparseable regex', () => {
    expect(() => validateResourceClasses({ x: { match: ['('], binaries: [], pool: 'heavy', capacity: 1, policy: 'queue', ttlSeconds: 60 } }))
      .toThrow(/regex/i);
  });
  it('rejects capacity < 1', () => {
    expect(() => validateResourceClasses({ x: { match: ['a'], binaries: [], pool: 'heavy', capacity: 0, policy: 'queue', ttlSeconds: 60 } }))
      .toThrow(/capacity/i);
  });
  it('rejects an invalid policy', () => {
    expect(() => validateResourceClasses({ x: { match: ['a'], binaries: [], pool: 'heavy', capacity: 1, policy: 'kill' as any, ttlSeconds: 60 } }))
      .toThrow(/policy/i);
  });
  it('rejects a binary name with shell metacharacters (injection guard, F2-F6)', () => {
    expect(() => validateResourceClasses({ x: { match: ['a'], binaries: ['; rm -rf'], pool: 'heavy', capacity: 1, policy: 'queue', ttlSeconds: 60 } }))
      .toThrow(/binary/i);
  });
  it('rejects a denylisted binary that would self-deadlock the runtime (F2-F10)', () => {
    expect(() => validateResourceClasses({ x: { match: ['a'], binaries: ['node'], pool: 'heavy', capacity: 1, policy: 'queue', ttlSeconds: 60 } }))
      .toThrow(/denylist|self-deadlock|reserved/i);
  });
  it('accepts the built-ins unchanged', () => {
    expect(() => validateResourceClasses(BUILTIN_RESOURCE_CLASSES)).not.toThrow();
  });
});

describe('mergeResourceClasses (3-layer)', () => {
  it('override keeps the built-in match list when only capacity changes', () => {
    const merged = mergeResourceClasses(BUILTIN_RESOURCE_CLASSES, { 'heavy-test': { capacity: 3 } as any });
    expect(merged['heavy-test'].capacity).toBe(3);
    expect(merged['heavy-test'].match).toEqual(BUILTIN_RESOURCE_CLASSES['heavy-test'].match);
  });
  it('enabled:false removes a built-in from the active set', () => {
    const merged = mergeResourceClasses(BUILTIN_RESOURCE_CLASSES, { 'package-install': { enabled: false } as any });
    expect(merged['package-install']).toBeUndefined();
  });
});

describe('matchCommandToClass', () => {
  it('classifies "vitest run" as heavy-test', () => {
    expect(matchCommandToClass('vitest run src/', BUILTIN_RESOURCE_CLASSES)).toBe('heavy-test');
  });
  it('classifies "npm install" as package-install', () => {
    expect(matchCommandToClass('npm install', BUILTIN_RESOURCE_CLASSES)).toBe('package-install');
  });
  it('returns null for an unprotected command', () => {
    expect(matchCommandToClass('echo hello', BUILTIN_RESOURCE_CLASSES)).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/core/resource-classes.test.ts`
Expected: FAIL ("Cannot find module '../../src/core/resource-classes.js'")

- [ ] **Step 3: Implement `resource-classes.ts`**

```typescript
// src/core/resource-classes.ts
import { z } from 'zod';
import { detectHostMemory } from './host-detector.js';
import { detectSystemCapacity } from './system-capacity.js';
import type {
  ResourceClass, ResourceClassMap, ResourcePoolMap, Capacity,
} from './resource-class-types.js';

const BINARY_RE = /^[a-zA-Z0-9._-]+$/;
/** Shimming these would lease-block the runtime/worker itself → self-deadlock (F2-F10). */
const BINARY_DENYLIST = new Set(['node', 'sh', 'bash', 'env', 'claude', 'codex', 'gemini']);

export const BUILTIN_RESOURCE_CLASSES: ResourceClassMap = {
  'heavy-test': { match: ['\\bvitest\\b.*\\brun\\b', '\\bjest\\b', '\\bpytest\\b', '\\bgo test\\b'],
                  binaries: ['vitest', 'jest', 'pytest'], pool: 'heavy', capacity: 'auto', policy: 'queue', ttlSeconds: 1800 },
  'package-install': { match: ['\\b(npm|pnpm|yarn)\\b.*\\binstall\\b', '\\bpip install\\b'],
                  binaries: [], pool: 'heavy', capacity: 1, policy: 'queue', ttlSeconds: 600 },
  'native-build': { match: ['\\bmake\\b.*-j', '\\bcmake --build\\b', '\\bcargo build\\b'],
                  binaries: ['make', 'cmake', 'cargo'], pool: 'heavy', capacity: 'auto', policy: 'queue', ttlSeconds: 1800 },
  'db-migration': { match: ['\\bmigrate\\b'], binaries: [], pool: 'heavy', capacity: 1, policy: 'reject', ttlSeconds: 900 },
};

export const BUILTIN_RESOURCE_POOLS: ResourcePoolMap = { heavy: { capacity: 'auto' } };

const CAPACITY_SCHEMA = z.union([z.number().int().min(1), z.literal('auto')]);
const CLASS_SCHEMA = z.object({
  match: z.array(z.string()).min(1),
  binaries: z.array(z.string().regex(BINARY_RE, 'binary name must match ^[a-zA-Z0-9._-]+$')),
  pool: z.string().min(1),
  capacity: CAPACITY_SCHEMA,
  policy: z.enum(['queue', 'reject']),
  ttlSeconds: z.number().int().min(1).nullable(),
  enabled: z.boolean().optional(),
  tenant: z.string().optional(),
  scope: z.enum(['machine', 'tenant']).optional(),
});

/** Throws a descriptive Error on the first invalid class (regex/capacity/policy/binary). */
export function validateResourceClasses(classes: ResourceClassMap): void {
  for (const [id, cls] of Object.entries(classes)) {
    const r = CLASS_SCHEMA.safeParse(cls);
    if (!r.success) throw new Error(`resource_classes.${id}: ${r.error.issues[0].message} (${r.error.issues[0].path.join('.')})`);
    for (const pat of cls.match) {
      try { new RegExp(pat); } catch (e) { throw new Error(`resource_classes.${id}: invalid regex "${pat}" — ${(e as Error).message}`); }
    }
    for (const bin of cls.binaries) {
      if (BINARY_DENYLIST.has(bin)) throw new Error(`resource_classes.${id}: binary "${bin}" is denylisted (self-deadlock — reserved runtime command)`);
    }
  }
}

/** 3-layer deep-merge: per-key override; enabled:false drops the class. */
export function mergeResourceClasses(base: ResourceClassMap, override: Partial<Record<string, Partial<ResourceClass>>>): ResourceClassMap {
  const out: ResourceClassMap = {};
  for (const [id, cls] of Object.entries(base)) out[id] = { ...cls };
  for (const [id, patch] of Object.entries(override ?? {})) {
    const merged = { ...(out[id] ?? {} as ResourceClass), ...patch } as ResourceClass;
    if (merged.enabled === false) { delete out[id]; continue; }
    out[id] = merged;
  }
  return out;
}

/** First class whose any match-regex hits the command line; null if none. */
export function matchCommandToClass(cmd: string, classes: ResourceClassMap): string | null {
  for (const [id, cls] of Object.entries(classes)) {
    if (cls.enabled === false) continue;
    for (const pat of cls.match) { if (new RegExp(pat).test(cmd)) return id; }
  }
  return null;
}

/**
 * Resolve a class/pool capacity ONCE on the host (spec §10 — snapshot, not per-container).
 * heavy-test sınıf: max(1, min(3, floor(GB/16), floor(cores/4)))
 * heavy havuz:      max(1, min(4, floor(GB/12), floor(cores/3)))
 */
export function resolveAutoCapacity(kind: 'class' | 'pool'): number {
  const gb = detectHostMemory().totalGB;
  const cores = detectSystemCapacity().cores;
  if (kind === 'pool') return Math.max(1, Math.min(4, Math.floor(gb / 12), Math.floor(cores / 3)));
  return Math.max(1, Math.min(3, Math.floor(gb / 16), Math.floor(cores / 4)));
}

export function resolveCapacity(c: Capacity, kind: 'class' | 'pool'): number {
  return c === 'auto' ? resolveAutoCapacity(kind) : c;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/core/resource-classes.test.ts`
Expected: PASS (all)

- [ ] **Step 5: Commit**

```bash
git add src/core/resource-classes.ts tests/core/resource-classes.test.ts
git commit -m "feat(arbiter): built-in classes + Zod schema + match/merge/auto-capacity"
```

---

### Task 0.3: Config wiring `[sonnet]`

**Files:**
- Modify: `src/core/config.ts` (schema + defaults; `resource_classes`, `resource_pools`)
- Test: `tests/core/config-resource-classes.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// tests/core/config-resource-classes.test.ts
import { describe, it, expect } from 'vitest';
import { createDefaultConfig, validatePartialConfig } from '../../src/core/config.js';

describe('config resource_classes', () => {
  it('default config omits resource_classes (opt-in, undefined)', () => {
    expect(createDefaultConfig().resource_classes).toBeUndefined();
  });
  it('validatePartialConfig rejects a bad capacity', () => {
    expect(() => validatePartialConfig({ resource_classes: { x: { match: ['a'], binaries: [], pool: 'heavy', capacity: 0, policy: 'queue', ttlSeconds: 60 } } } as any))
      .toThrow();
  });
  it('validatePartialConfig accepts a valid override', () => {
    expect(() => validatePartialConfig({ resource_classes: { 'heavy-test': { capacity: 2 } } } as any)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/core/config-resource-classes.test.ts`
Expected: FAIL (resource_classes not in type / not validated)

- [ ] **Step 3: Implement** — add to `DeckentConfig` type, `CONFIG_SCHEMA` (the metadata schema near `worker_memory_limit_by_kind:` at `config.ts:1743`), and ensure `validateConfig` calls `validateResourceClasses` on the merged `resource_classes`. Add fields:

```typescript
// In DeckentConfig interface (src/core/types.ts or config types):
resource_classes?: Record<string, Partial<import('./resource-class-types.js').ResourceClass>>;
resource_pools?: Record<string, import('./resource-class-types.js').ResourcePool>;

// In the config-key metadata object (config.ts, next to worker_memory_limit_by_kind):
resource_classes: {
  description: 'Opt-in admission-control classes (ADR-090). Override built-ins per-key; enabled:false disables a built-in.',
  type: 'Record<string, object>', default: undefined, category: 'Sprint',
},
resource_pools: {
  description: 'Global capacity pools shared across resource classes (ADR-090).',
  type: 'Record<string, object>', default: undefined, category: 'Sprint',
},

// In validateConfig(merged), after existing checks:
if (merged.resource_classes) {
  // merge over built-ins so we validate the EFFECTIVE set
  const { BUILTIN_RESOURCE_CLASSES, mergeResourceClasses, validateResourceClasses } = await import('./resource-classes.js');
  validateResourceClasses(mergeResourceClasses(BUILTIN_RESOURCE_CLASSES, merged.resource_classes));
}
```

> Note: if `validateConfig` is synchronous, import `resource-classes` statically at the top of `config.ts` instead of dynamic `await import` (check the existing import style; ADR-002 `.js` suffix mandatory).

- [ ] **Step 4: Run to verify pass + full type-check**

Run: `npx vitest run tests/core/config-resource-classes.test.ts && npx tsc --noEmit`
Expected: PASS + no type errors

- [ ] **Step 5: Commit**

```bash
git add src/core/config.ts src/core/types.ts tests/core/config-resource-classes.test.ts
git commit -m "feat(arbiter): wire resource_classes/resource_pools into config + validation"
```

---

# Phase 1 — Host-Hakem Core (FileLeaseBackend) `[opus]`

> The heart. All concurrency correctness lives here. Single-writer host loop ⇒ no distributed races (spec §6, K5). Tests simulate clients by writing request files directly into a tmpdir lease store.

### Task 1.1: Lease store layout + request intake

**Files:**
- Create: `src/core/resource-arbiter.ts`
- Test: `tests/core/resource-arbiter-intake.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// tests/core/resource-arbiter-intake.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileLeaseBackend } from '../../src/core/resource-arbiter.js';
import { BUILTIN_RESOURCE_CLASSES, BUILTIN_RESOURCE_POOLS } from '../../src/core/resource-classes.js';

let root: string;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'arb-')); });
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

function writeRequest(classId: string, holder: string, cmd = 'vitest run') {
  const dir = join(root, '.deckent', 'leases', classId, 'requests');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${holder}.json`), JSON.stringify({
    holder, classId, cmd, pid: 1234, requestedAt: new Date().toISOString(), ts: new Date().toISOString(),
  }));
}

describe('FileLeaseBackend intake', () => {
  it('a single request is granted on the first tick (capacity 2)', async () => {
    const arb = new FileLeaseBackend(root, BUILTIN_RESOURCE_CLASSES, BUILTIN_RESOURCE_POOLS);
    writeRequest('heavy-test', 'task1-100-aaa');
    await arb.tick();
    expect(existsSync(join(root, '.deckent', 'leases', 'heavy-test', 'granted', 'task1-100-aaa.json'))).toBe(true);
  });
  it('tick writes an arbiter-alive heartbeat', async () => {
    const arb = new FileLeaseBackend(root, BUILTIN_RESOURCE_CLASSES, BUILTIN_RESOURCE_POOLS);
    await arb.tick();
    expect(existsSync(join(root, '.deckent', 'leases', 'arbiter-alive.json'))).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/core/resource-arbiter-intake.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement the skeleton** (intake + grant + alive only; reap/release/pool come in later tasks)

```typescript
// src/core/resource-arbiter.ts
import { mkdir, readdir, readFile, writeFile, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  ResourceClassMap, ResourcePoolMap, LeaseStatus, LeaseRequest, LeaseGrant,
} from './resource-class-types.js';
import { resolveCapacity } from './resource-classes.js';

export interface LeaseBackend {
  tick(): Promise<void>;
  status(classId?: string): Promise<LeaseStatus[]>;
}

const LEASES = (root: string) => join(root, '.deckent', 'leases');

async function readJson<T>(p: string): Promise<T | null> {
  try { return JSON.parse(await readFile(p, 'utf-8')) as T; } catch { return null; }
}
async function listJson(dir: string): Promise<string[]> {
  try { return (await readdir(dir)).filter(f => f.endsWith('.json')); } catch { return []; }
}

export class FileLeaseBackend implements LeaseBackend {
  constructor(
    private readonly root: string,
    private readonly classes: ResourceClassMap,
    private readonly pools: ResourcePoolMap,
    private readonly now: () => number = () => Date.now(),  // injectable clock for tests
  ) {}

  private classDir(id: string) { return join(LEASES(this.root), id); }

  /** One allocation pass. Single-writer ⇒ no races. */
  async tick(): Promise<void> {
    await mkdir(LEASES(this.root), { recursive: true });
    await this.writeAlive();
    // Per-tick grant pass (capacity gate added in Task 1.2; this stub grants any pending request).
    for (const id of Object.keys(this.classes)) {
      if (this.classes[id].enabled === false) continue;
      const reqDir = join(this.classDir(id), 'requests');
      const grantDir = join(this.classDir(id), 'granted');
      await mkdir(grantDir, { recursive: true });
      for (const f of await listJson(reqDir)) {
        const req = await readJson<LeaseRequest>(join(reqDir, f));
        if (!req) continue;
        const grant: LeaseGrant = { holder: req.holder, classId: id, grantedAt: new Date(this.now()).toISOString() };
        await writeFile(join(grantDir, f), JSON.stringify(grant));
        await rm(join(reqDir, f), { force: true });
      }
    }
  }

  private async writeAlive(): Promise<void> {
    await writeFile(join(LEASES(this.root), 'arbiter-alive.json'),
      JSON.stringify({ ts: new Date(this.now()).toISOString(), pid: process.pid }));
  }

  async status(_classId?: string): Promise<LeaseStatus[]> { return []; } // Task 1.5
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/core/resource-arbiter-intake.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/resource-arbiter.ts tests/core/resource-arbiter-intake.test.ts
git commit -m "feat(arbiter): FileLeaseBackend intake + grant skeleton + alive heartbeat"
```

---

### Task 1.2: Ledger arrival-order + two-gate capacity (class + pool)

**Files:**
- Modify: `src/core/resource-arbiter.ts`
- Test: `tests/core/resource-arbiter-capacity.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// tests/core/resource-arbiter-capacity.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileLeaseBackend } from '../../src/core/resource-arbiter.js';
import type { ResourceClassMap, ResourcePoolMap } from '../../src/core/resource-class-types.js';

let root: string;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'arb-')); });
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

// Fixed capacities (no 'auto') so the test is host-independent.
const CLASSES: ResourceClassMap = {
  ht: { match: ['x'], binaries: [], pool: 'heavy', capacity: 2, policy: 'queue', ttlSeconds: 600 },
  nb: { match: ['y'], binaries: [], pool: 'heavy', capacity: 2, policy: 'queue', ttlSeconds: 600 },
};
const POOLS: ResourcePoolMap = { heavy: { capacity: 3 } };

function req(classId: string, holder: string, seenAtMs: number) {
  const dir = join(root, '.deckent', 'leases', classId, 'requests');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${holder}.json`), JSON.stringify({
    holder, classId, cmd: 'x', pid: 1, requestedAt: new Date(seenAtMs).toISOString(), ts: new Date(seenAtMs).toISOString(),
  }));
}
const granted = (classId: string, holder: string) =>
  existsSync(join(root, '.deckent', 'leases', classId, 'granted', `${holder}.json`));

describe('two-gate capacity', () => {
  it('grants up to class capacity, queues the rest (FIFO by arrival)', async () => {
    const arb = new FileLeaseBackend(root, CLASSES, POOLS);
    req('ht', 'a', 1000); req('ht', 'b', 2000); req('ht', 'c', 3000);
    await arb.tick();
    expect(granted('ht', 'a')).toBe(true);
    expect(granted('ht', 'b')).toBe(true);
    expect(granted('ht', 'c')).toBe(false);   // class capacity 2 reached
  });
  it('pool capacity caps cross-class total (2 ht + 2 nb but pool=3 ⇒ only 3 granted)', async () => {
    const arb = new FileLeaseBackend(root, CLASSES, POOLS);
    req('ht', 'a', 1000); req('ht', 'b', 2000); req('nb', 'c', 1500); req('nb', 'd', 2500);
    await arb.tick();
    const total = ['a','b'].filter(h => granted('ht', h)).length + ['c','d'].filter(h => granted('nb', h)).length;
    expect(total).toBe(3);   // pool ceiling, not 4
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/core/resource-arbiter-capacity.test.ts`
Expected: FAIL (stub grants everything, ignores capacity/pool)

- [ ] **Step 3: Implement the ledger + two-gate grant.** Replace the grant loop in `tick()` with: load ledger, fold in new requests (assign `seenAt` on first sighting), sort pending by `seenAt`, and grant each only if BOTH `grantedCountForClass < classCap` AND `grantedCountForPool < poolCap`. Persist ledger.

```typescript
// add to FileLeaseBackend:
private ledgerPath() { return join(LEASES(this.root), 'ledger.json'); }

private async loadLedger(): Promise<Record<string, LedgerEntry>> {
  return (await readJson<Record<string, LedgerEntry>>(this.ledgerPath())) ?? {};
}
private async saveLedger(l: Record<string, LedgerEntry>): Promise<void> {
  await writeFile(this.ledgerPath(), JSON.stringify(l));
}

async tick(): Promise<void> {
  await mkdir(LEASES(this.root), { recursive: true });
  await this.writeAlive();
  const ledger = await this.loadLedger();
  const nowIso = new Date(this.now()).toISOString();

  // 1. Intake: record arrival order for any new request.
  type Pending = { id: string; holder: string; file: string };
  const pending: Pending[] = [];
  const grantedByClass: Record<string, number> = {};
  const grantedByPool: Record<string, number> = {};

  for (const id of Object.keys(this.classes)) {
    if (this.classes[id].enabled === false) continue;
    await mkdir(join(this.classDir(id), 'granted'), { recursive: true });
    // Count current grants (per class + per pool).
    const pool = this.classes[id].pool;
    const grants = await listJson(join(this.classDir(id), 'granted'));
    grantedByClass[id] = grants.length;
    grantedByPool[pool] = (grantedByPool[pool] ?? 0) + grants.length;
    // Collect pending requests.
    for (const f of await listJson(join(this.classDir(id), 'requests'))) {
      const req = await readJson<LeaseRequest>(join(this.classDir(id), 'requests', f));
      if (!req) continue;
      if (!ledger[req.holder]) ledger[req.holder] = { holder: req.holder, classId: id, seenAt: nowIso, waitMs: 0 };
      pending.push({ id, holder: req.holder, file: f });
    }
  }

  // 2. Grant in arrival order, honoring BOTH gates.
  pending.sort((a, b) => ledger[a.holder].seenAt.localeCompare(ledger[b.holder].seenAt));
  for (const p of pending) {
    const cls = this.classes[p.id];
    const classCap = resolveCapacity(cls.capacity, 'class');
    const poolCap = resolveCapacity(this.pools[cls.pool]?.capacity ?? 'auto', 'pool');
    if ((grantedByClass[p.id] ?? 0) >= classCap) continue;
    if ((grantedByPool[cls.pool] ?? 0) >= poolCap) continue;
    const grant: LeaseGrant = { holder: p.holder, classId: p.id, grantedAt: nowIso };
    await writeFile(join(this.classDir(p.id), 'granted', p.file), JSON.stringify(grant));
    await rm(join(this.classDir(p.id), 'requests', p.file), { force: true });
    ledger[p.holder].grantedAt = nowIso;
    grantedByClass[p.id] = (grantedByClass[p.id] ?? 0) + 1;
    grantedByPool[cls.pool] = (grantedByPool[cls.pool] ?? 0) + 1;
  }
  await this.saveLedger(ledger);
}
```

Add `import type { LedgerEntry }` to the existing type import.

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/core/resource-arbiter-capacity.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/resource-arbiter.ts tests/core/resource-arbiter-capacity.test.ts
git commit -m "feat(arbiter): ledger arrival-order + two-gate (class+pool) capacity"
```

---

### Task 1.3: Release + promotion

**Files:**
- Modify: `src/core/resource-arbiter.ts`
- Test: `tests/core/resource-arbiter-release.test.ts`

- [ ] **Step 1: Write failing test** — a held grant is released (client removes the `granted/` file OR writes a `release/` marker); next tick promotes the queued head.

```typescript
// tests/core/resource-arbiter-release.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync, rmSync as unlink } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileLeaseBackend } from '../../src/core/resource-arbiter.js';
import type { ResourceClassMap, ResourcePoolMap } from '../../src/core/resource-class-types.js';

let root: string;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'arb-')); });
afterEach(() => { rmSync(root, { recursive: true, force: true }); });
const CLASSES: ResourceClassMap = { ht: { match: ['x'], binaries: [], pool: 'heavy', capacity: 1, policy: 'queue', ttlSeconds: 600 } };
const POOLS: ResourcePoolMap = { heavy: { capacity: 4 } };
function req(holder: string, seenAtMs: number) {
  const dir = join(root, '.deckent', 'leases', 'ht', 'requests'); mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${holder}.json`), JSON.stringify({ holder, classId: 'ht', cmd: 'x', pid: 1, requestedAt: new Date(seenAtMs).toISOString(), ts: new Date(seenAtMs).toISOString() }));
}
const grant = (h: string) => join(root, '.deckent', 'leases', 'ht', 'granted', `${h}.json`);

describe('release + promotion', () => {
  it('promotes the FIFO head after the holder releases (capacity 1)', async () => {
    const arb = new FileLeaseBackend(root, CLASSES, POOLS);
    req('a', 1000); req('b', 2000);
    await arb.tick();
    expect(existsSync(grant('a'))).toBe(true);
    expect(existsSync(grant('b'))).toBe(false);
    unlink(grant('a'), { force: true });   // client releases by removing its granted file
    await arb.tick();
    expect(existsSync(grant('b'))).toBe(true);   // head promoted
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/core/resource-arbiter-release.test.ts`
Expected: FAIL — `b` is not promoted, because the ledger still lists `a` as granted-not-released and the second tick re-counts wrong.

> Actually with Task 1.2's grant counting (counts live `granted/` files), `b` WILL promote once `a`'s file is gone. If this test already passes after 1.2, keep it as a regression guard and ALSO add the `release/` marker path below (clients that can't unlink may drop a release marker).

- [ ] **Step 3: Implement release-marker handling** — at the start of `tick()`, consume `release/*.json` markers (delete the matching `granted/` file + the marker, set `ledger[holder].releasedAt`). This makes release work for both unlink and marker styles.

```typescript
// at the start of the per-class loop, before counting grants:
const relDir = join(this.classDir(id), 'release');
for (const f of await listJson(relDir)) {
  const holder = f.replace(/\.json$/, '');
  await rm(join(this.classDir(id), 'granted', f), { force: true });
  await rm(join(relDir, f), { force: true });
  if (ledger[holder]) ledger[holder].releasedAt = nowIso;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/core/resource-arbiter-release.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/resource-arbiter.ts tests/core/resource-arbiter-release.test.ts
git commit -m "feat(arbiter): release (unlink + marker) + FIFO head promotion"
```

---

### Task 1.4: Probe-reap (split waiter/holder staleness)

**Files:**
- Modify: `src/core/resource-arbiter.ts`
- Test: `tests/core/resource-arbiter-reap.test.ts`

- [ ] **Step 1: Write failing test** (uses the injectable `now` clock to age records without sleeping)

```typescript
// tests/core/resource-arbiter-reap.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileLeaseBackend } from '../../src/core/resource-arbiter.js';
import type { ResourceClassMap, ResourcePoolMap } from '../../src/core/resource-class-types.js';

let root: string;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'arb-')); });
afterEach(() => { rmSync(root, { recursive: true, force: true }); });
const CLASSES: ResourceClassMap = { ht: { match: ['x'], binaries: [], pool: 'heavy', capacity: 1, policy: 'queue', ttlSeconds: 600 } };
const POOLS: ResourcePoolMap = { heavy: { capacity: 4 } };
function req(holder: string, tsMs: number) {
  const dir = join(root, '.deckent', 'leases', 'ht', 'requests'); mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${holder}.json`), JSON.stringify({ holder, classId: 'ht', cmd: 'x', pid: 999999, requestedAt: new Date(tsMs).toISOString(), ts: new Date(tsMs).toISOString() }));
}
const grant = (h: string) => existsSync(join(root, '.deckent', 'leases', 'ht', 'granted', `${h}.json`));

describe('probe-reap', () => {
  it('a stale WAITING request (ts older than 15s) is reaped, not left blocking the queue', async () => {
    let clock = 1_000_000;
    const arb = new FileLeaseBackend(root, CLASSES, POOLS, () => clock);
    req('dead', 1_000_000);   // head, but will go stale
    req('live', 1_000_001);
    await arb.tick();         // dead granted (cap 1), live queued
    // simulate dead crash: its ts never renews; advance 20s
    clock += 20_000;
    // re-stamp live's request ts so it stays fresh (client would renew)
    req('live', clock);
    await arb.tick();
    // dead's granted lease is reaped (holder pid dead + ts stale) → live promoted
    expect(grant('live')).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/core/resource-arbiter-reap.test.ts`
Expected: FAIL (`dead` holds its grant forever; `live` never promotes)

- [ ] **Step 3: Implement reap.** Constants + a reap pass at the top of `tick()` (after release-markers, before counting). Use two thresholds (spec §7): `WAITER_STALE_MS = 15_000` for `requests/`, and for `granted/` use `HOLDER_STALE_MS = 60_000` AND a liveness check. Liveness is injectable so tests stay hermetic:

```typescript
// constructor gains an optional probe; default = pid-alive check.
constructor(
  ...,
  private readonly now: () => number = () => Date.now(),
  private readonly isAlive: (pid: number) => boolean = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } },
) {}

const WAITER_STALE_MS = 15_000;
const HOLDER_STALE_MS = 60_000;

// reap pass (per class, before counting grants):
for (const f of await listJson(join(this.classDir(id), 'requests'))) {
  const r = await readJson<LeaseRequest>(join(this.classDir(id), 'requests', f));
  if (r && this.now() - Date.parse(r.ts) > WAITER_STALE_MS) {
    await rm(join(this.classDir(id), 'requests', f), { force: true });
    delete ledger[r.holder];
  }
}
for (const f of await listJson(join(this.classDir(id), 'granted'))) {
  const g = await readJson<LeaseGrant & { ts?: string }>(join(this.classDir(id), 'granted', f));
  const req = await readJson<LeaseRequest>(join(this.classDir(id), 'requests', f)); // none after grant
  const tsStr = (g as any)?.ts ?? g?.grantedAt;
  const holder = f.replace(/\.json$/, '');
  const pid = ledger[holder]?.pid ?? 0; // store pid in ledger at grant time
  const stale = tsStr && this.now() - Date.parse(tsStr) > HOLDER_STALE_MS;
  if (stale && pid && !this.isAlive(pid)) {
    await rm(join(this.classDir(id), 'granted', f), { force: true });
    if (ledger[holder]) ledger[holder].releasedAt = new Date(this.now()).toISOString();
  }
}
```

> Implementation detail: the client renews `ts` by rewriting its `granted/<holder>.json` every ~5s (Task 2.2). Store `pid` in the `LedgerEntry` at grant time (extend the intake step: `ledger[req.holder].pid = req.pid`). Add `pid?: number` to `LedgerEntry` in `resource-class-types.ts`.

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/core/resource-arbiter-reap.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/resource-arbiter.ts src/core/resource-class-types.ts tests/core/resource-arbiter-reap.test.ts
git commit -m "feat(arbiter): probe-reap — split waiter(15s)/holder(60s+liveness) staleness"
```

---

### Task 1.5: queue.json snapshot + `status()`

**Files:**
- Modify: `src/core/resource-arbiter.ts`
- Test: `tests/core/resource-arbiter-status.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// tests/core/resource-arbiter-status.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileLeaseBackend } from '../../src/core/resource-arbiter.js';
import type { ResourceClassMap, ResourcePoolMap } from '../../src/core/resource-class-types.js';

let root: string;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'arb-')); });
afterEach(() => { rmSync(root, { recursive: true, force: true }); });
const CLASSES: ResourceClassMap = { ht: { match: ['x'], binaries: [], pool: 'heavy', capacity: 1, policy: 'queue', ttlSeconds: 600 } };
const POOLS: ResourcePoolMap = { heavy: { capacity: 4 } };
function req(holder: string, tsMs: number) {
  const dir = join(root, '.deckent', 'leases', 'ht', 'requests'); mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${holder}.json`), JSON.stringify({ holder, classId: 'ht', cmd: 'x', pid: 1, requestedAt: new Date(tsMs).toISOString(), ts: new Date(tsMs).toISOString() }));
}

describe('status snapshot', () => {
  it('reports granted/capacity and waiting count', async () => {
    const arb = new FileLeaseBackend(root, CLASSES, POOLS);
    req('a', 1000); req('b', 2000);
    await arb.tick();
    const st = await arb.status();
    const ht = st.find(s => s.classId === 'ht')!;
    expect(ht.granted).toBe(1);
    expect(ht.capacity).toBe(1);
    expect(ht.waiting).toBe(1);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/core/resource-arbiter-status.test.ts`
Expected: FAIL (`status()` returns `[]`)

- [ ] **Step 3: Implement `status()` + write `queue.json` at end of `tick()`** — for each enabled class, count `granted/` and `requests/`, compute `longestWaitMs` from oldest pending `seenAt`. Persist the array to `.deckent/leases/queue.json`. `status(classId?)` reads live dirs (so CLI works without a running loop).

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/core/resource-arbiter-status.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/resource-arbiter.ts tests/core/resource-arbiter-status.test.ts
git commit -m "feat(arbiter): queue.json snapshot + status() for CLI/dashboard"
```

---

### Task 1.6: Reject policy (single-grant determinism)

**Files:**
- Modify: `src/core/resource-arbiter.ts`
- Test: `tests/core/resource-arbiter-reject.test.ts`

- [ ] **Step 1: Write failing test** — two concurrent requests to a `reject`, capacity-1 class: exactly one is granted, the other gets a `rejected/` marker.

```typescript
// tests/core/resource-arbiter-reject.test.ts (abridged setup like above)
// CLASSES: { mig: { match:['migrate'], binaries:[], pool:'heavy', capacity:1, policy:'reject', ttlSeconds:600 } }
// req('a',1000); req('b',2000); await arb.tick();
// expect exactly one of granted('a')/granted('b') === true
// expect a rejected marker exists for the other: .deckent/leases/mig/rejected/<other>.json
```

(Write the full test mirroring Task 1.2's helpers; assert `grantedCount === 1` and a rejected marker for the loser.)

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/core/resource-arbiter-reject.test.ts`
Expected: FAIL (loser is queued, not rejected)

- [ ] **Step 3: Implement** — in the grant loop, when `cls.policy === 'reject'` and a pending request cannot be granted (gate full), instead of leaving it queued: write `rejected/<holder>.json` (`{ holder, classId, reason: 'capacity', ts }`), remove its `requests/` file, drop it from the ledger. The client treats a rejected marker as a hard "do not run" → exits non-zero so the worker writes honest NO_GO (spec §13).

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/core/resource-arbiter-reject.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/resource-arbiter.ts tests/core/resource-arbiter-reject.test.ts
git commit -m "feat(arbiter): reject policy — deterministic single-grant + rejected marker"
```

---

### Task 1.7: Fail-mode (K8: degraded + closed)

**Files:**
- Modify: `src/core/resource-arbiter.ts`
- Test: `tests/core/resource-arbiter-failmode.test.ts`

- [ ] **Step 1: Write failing test** — when the lease store is unwritable (simulate by pointing root at a path whose `leases/` is a file, not a dir), `tick()` does not throw, and `status()` reports a `degraded` flag; `reject` classes are NOT auto-granted in degraded mode.

(Write a test that creates `.deckent/leases` as a FILE, then asserts `await arb.tick()` resolves without throwing and `arb.isDegraded() === true`.)

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/core/resource-arbiter-failmode.test.ts`
Expected: FAIL (`tick()` throws / `isDegraded` undefined)

- [ ] **Step 3: Implement** — wrap `tick()` body in try/catch; on persistent failure set `this.degraded = true`, after 3 consecutive failures clamp effective pool capacity to 1 and emit a CRITICAL notify (host-side; injected emitter — Task 4.3 supplies the real one, default no-op). Expose `isDegraded()`. `reject`-policy classes in degraded mode fail-closed (client told to reject). Configuration-parse errors are handled in config layer (Task 0.3 / 7.3), not here.

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/core/resource-arbiter-failmode.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/resource-arbiter.ts tests/core/resource-arbiter-failmode.test.ts
git commit -m "feat(arbiter): K8 fail-mode — degraded (pool=1+alarm), reject fail-closed"
```

---

### Task 1.8: Stress / interleaving invariant

**Files:**
- Test: `tests/core/resource-arbiter-stress.test.ts`

- [ ] **Step 1: Write the invariant test** — N=12 requests across 2 classes sharing a pool=3; drive M=30 randomized-but-seeded ticks interleaved with releases; assert that AT EVERY tick the count of `granted/` files for the pool never exceeds pool capacity and per class never exceeds class capacity. (Seed the randomness from the loop index — no `Math.random`, per harness rule.)

```typescript
// Pseudocode core of the test:
// for (let step = 0; step < 30; step++) {
//   if (step % 3 === 0) addSomeRequests(step);
//   if (step % 5 === 0) releaseOldestGrant();
//   await arb.tick();
//   expect(poolGrantedCount()).toBeLessThanOrEqual(3);
//   for (const id of classIds) expect(classGrantedCount(id)).toBeLessThanOrEqual(cap[id]);
// }
```

- [ ] **Step 2: Run to verify it passes** (this guards the §16 "granted ≤ capacity in every intermediate state" invariant from F1)

Run: `npx vitest run tests/core/resource-arbiter-stress.test.ts`
Expected: PASS (if it fails, a capacity-gate bug exists — fix in 1.2/1.3 before proceeding)

- [ ] **Step 3: Commit**

```bash
git add tests/core/resource-arbiter-stress.test.ts
git commit -m "test(arbiter): interleaving invariant — granted ≤ capacity in every state"
```

---

# Phase 2 — İnce-İstemci (`arbiter-client.mjs`) `[opus]`

> Import-free single-file Node client. Lives in `assets/` (source of truth), copied to `.deckent/shims/` at generation (Task 3). Works in ANY container with node ≥ 18 — deckent need NOT be installed (spec §8, F3-B1).

### Task 2.1: Client acquire/poll/release protocol

**Files:**
- Create: `assets/arbiter-client.mjs`
- Test: `tests/orchestra/arbiter-client.test.ts`

- [ ] **Step 1: Write failing test** — spawn the client as a real subprocess (async `spawn`, NOT spawnSync) with a fake "host" that grants after one tick; assert the client writes a request, waits, then runs the wrapped command and exits 0.

```typescript
// tests/orchestra/arbiter-client.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let root: string;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'cli-')); });
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

function runClient(args: string[], env: Record<string,string> = {}): Promise<{ code: number }> {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, ['assets/arbiter-client.mjs', ...args], {
      env: { ...process.env, DECKENT_PROJECT_ROOT: root, DECKENT_ARBITER_POLL_MS: '50', DECKENT_ARBITER_MAX_WAIT_MS: '5000', ...env },
      stdio: 'ignore',
    });
    p.on('close', (code) => resolve({ code: code ?? -1 }));
  });
}

describe('arbiter-client', () => {
  it('writes a request then runs the wrapped command after a grant', async () => {
    // arrange: arbiter-alive fresh so client does NOT fail-open
    mkdirSync(join(root, '.deckent', 'leases'), { recursive: true });
    writeFileSync(join(root, '.deckent', 'leases', 'arbiter-alive.json'), JSON.stringify({ ts: new Date().toISOString() }));
    // a fake host loop: poll for a request, immediately grant it
    const host = setInterval(() => {
      const reqDir = join(root, '.deckent', 'leases', 'heavy-test', 'requests');
      if (!existsSync(reqDir)) return;
      for (const f of readdirSync(reqDir)) {
        const gDir = join(root, '.deckent', 'leases', 'heavy-test', 'granted'); mkdirSync(gDir, { recursive: true });
        writeFileSync(join(gDir, f), JSON.stringify({ holder: f.replace('.json',''), classId: 'heavy-test', grantedAt: new Date().toISOString() }));
        rmSync(join(reqDir, f), { force: true });
      }
    }, 20);
    const { code } = await runClient(['acquire', 'heavy-test', '--', process.execPath, '-e', 'process.exit(0)']);
    clearInterval(host);
    expect(code).toBe(0);
  });

  it('fails OPEN (runs command, exit 0) when no arbiter-alive heartbeat exists', async () => {
    const { code } = await runClient(['acquire', 'heavy-test', '--', process.execPath, '-e', 'process.exit(0)'], { DECKENT_ARBITER_MAX_WAIT_MS: '300' });
    expect(code).toBe(0);
    expect(existsSync(join(root, '.deckent', 'leases', 'bypass-log.jsonl'))).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/orchestra/arbiter-client.test.ts`
Expected: FAIL (client file missing)

- [ ] **Step 3: Implement `assets/arbiter-client.mjs`** — import-free (only `node:fs`, `node:child_process`, `node:crypto`, `node:path` core). Algorithm: parse `acquire <class> -- <cmd...>`; compute `holder = <taskId|manual>-<pid>-<nonce>`; if no fresh `arbiter-alive.json` within `MAX_WAIT` → fail-open + append `bypass-log.jsonl` → exec command; else write request, poll every `POLL_MS`: if `granted/<holder>.json` appears → spawn the real command as a child (NOT exec), forward SIGTERM/SIGINT, renew `ts` every 5s, on child exit write `release/<holder>.json` and exit with the child's code; if `rejected/<holder>.json` appears → exit non-zero (honest NO_GO). Respect `DECKENT_LEASE_HELD` (re-entrancy): if set to this class, skip acquire and run directly.

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/orchestra/arbiter-client.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add assets/arbiter-client.mjs tests/orchestra/arbiter-client.test.ts
git commit -m "feat(arbiter): import-free arbiter-client.mjs — acquire/poll/run/release + fail-open"
```

---

### Task 2.2: Child-spawn fidelity (signals, exit code, renew, SIGKILL)

**Files:**
- Modify: `assets/arbiter-client.mjs`
- Test: `tests/orchestra/arbiter-client-fidelity.test.ts`

- [ ] **Step 1: Write failing tests** — (a) the wrapped command's exit code is propagated (run `node -e 'process.exit(7)'` → client exits 7); (b) on grant, the client renews `ts` (assert the granted file's `ts` advances across two polls); (c) a SIGTERM to the client is forwarded to the child and the lease is released. (Use the fake-host harness from 2.1.)

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/orchestra/arbiter-client-fidelity.test.ts`
Expected: FAIL (exit code not propagated / no renew)

- [ ] **Step 3: Implement** the renew timer (rewrite `granted/<holder>.json` with fresh `ts` every 5s), exit-code propagation (`child.on('exit', (code, signal) => { writeRelease(); process.exit(code ?? (signal ? 128 : 1)); })`), and `process.on('SIGTERM'|'SIGINT', () => child.kill(sig))`. NO `exec` anywhere — this is the F1-A1/F3-B2 fix.

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/orchestra/arbiter-client-fidelity.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add assets/arbiter-client.mjs tests/orchestra/arbiter-client-fidelity.test.ts
git commit -m "feat(arbiter): client child-spawn fidelity — exit code, signal forward, ts renew"
```

---

# Phase 3 — Shim Generation + Enforcement Matrix `[opus]`

### Task 3.1: Binary PATH-shim generation

**Files:**
- Create: `src/orchestra/lease-shim.ts`
- Test: `tests/orchestra/lease-shim-binary.test.ts`

- [ ] **Step 1: Write failing test** — `generateShims(root, classes)` writes `.deckent/shims/current/vitest` (0755) for each name in any class's `binaries[]`, plus copies `arbiter-client.mjs`. The shim resolves the REAL binary by absolute path (PATH minus the shim dir) and execs the client wrapping it; it does NOT strip the whole PATH for descendants (F1-E4). Assert: shim file exists, is executable, contains `arbiter-client.mjs acquire heavy-test`, and references the binary by a PATH-excluding lookup (`command -v` with shim dir filtered).

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/orchestra/lease-shim-binary.test.ts`
Expected: FAIL (module missing)

- [ ] **Step 3: Implement `generateShims`** — validate each binary name against `^[a-zA-Z0-9._-]+$` (defense-in-depth even though schema checks it); write a POSIX `sh` shim per binary:

```sh
#!/bin/sh
# generated shim for <binary> (class <classId>)
REAL="$(PATH="$(echo "$PATH" | tr ':' '\n' | grep -v '/.deckent/shims/' | paste -sd:)" command -v <binary>)"
exec node "$(dirname "$0")/arbiter-client.mjs" acquire <classId> -- "$REAL" "$@"
```

Copy `assets/arbiter-client.mjs` into the shims dir. Return the shim dir path for PATH-prepend.

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/orchestra/lease-shim-binary.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/orchestra/lease-shim.ts tests/orchestra/lease-shim-binary.test.ts
git commit -m "feat(arbiter): binary PATH-shim generation (allow-list, abs-path resolve)"
```

---

### Task 3.2: NODE_OPTIONS preload

**Files:**
- Modify: `src/orchestra/lease-shim.ts` (emit `preload.cjs`)
- Test: `tests/orchestra/lease-shim-preload.test.ts`

- [ ] **Step 1: Write failing test** — `generateShims` also writes `.deckent/shims/preload.cjs`. Run `node --require <preload.cjs> node_modules/.bin/vitest`-equivalent (use a fake script whose argv matches `vitest run`) with a fresh arbiter-alive + fake host; assert acquire happens. Also assert re-entrancy: with `DECKENT_LEASE_HELD=heavy-test` set, the preload does NOT acquire again.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/orchestra/lease-shim-preload.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement `preload.cjs`** — on load, read `process.argv`, join to a command string, `matchCommandToClass` (inline a minimal matcher reading the generated `classes.json` snapshot next to the preload — no deckent import); if it matches AND `process.env.DECKENT_LEASE_HELD !== classId`, synchronously acquire via the client protocol (spawn `arbiter-client.mjs acquire <class> --check` which blocks until grant, then returns) and set `DECKENT_LEASE_HELD`. The worker-CLI's own node process matches nothing → no-op. (This is the bypass-proof layer for `node node_modules/.bin/...` and login-shell PATH resets — F1-E6/F2-F1.)

> Design note: keep the preload's acquire path SIMPLE — it can write the request + block-poll inline (duplicating ~30 lines of the client) OR shell out to `arbiter-client.mjs acquire <class> --gate-only`. Prefer `--gate-only` (single source). Define `--gate-only` in Task 2 client as "acquire, print granted, exit 0; caller runs the real command" — adjust Task 2.1 if needed and note it.

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/orchestra/lease-shim-preload.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/orchestra/lease-shim.ts tests/orchestra/lease-shim-preload.test.ts
git commit -m "feat(arbiter): NODE_OPTIONS preload — node_modules/.bin coverage + re-entrancy"
```

---

### Task 3.3: PM-shim (npm/pnpm/yarn/npx)

**Files:**
- Modify: `src/orchestra/lease-shim.ts`
- Test: `tests/orchestra/lease-shim-pm.test.ts`

- [ ] **Step 1: Write failing test** — `generateShims` writes shims for `npm`, `npx`, `pnpm`, `yarn`. The `npm` shim: for `npm test`/`npm run X`, read the project `package.json` script body, `matchCommandToClass` on it; if matched, acquire then run real npm; for `npm install` match directly; else passthrough. Assert `npm test` (script = `vitest run`) triggers a `heavy-test` request.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/orchestra/lease-shim-pm.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement** the PM shims (sh scripts that defer to a small node helper `pm-classify.cjs` which reads `package.json` + `classes.json` and prints the matched class or empty). On match → `arbiter-client.mjs acquire <class> -- <realPM> "$@"`; else exec real PM directly. Note the known-hole (compound scripts where only part is heavy) in a comment per spec §8.5.

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/orchestra/lease-shim-pm.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/orchestra/lease-shim.ts tests/orchestra/lease-shim-pm.test.ts
git commit -m "feat(arbiter): PM-shim — npm/npx/pnpm/yarn script-body classification"
```

---

# Phase 4 — Wiring (loop driver + env injection + emit) `[sonnet]`

### Task 4.1: ArbiterLoop driver

**Files:**
- Create: `src/orchestra/arbiter-loop.ts`
- Test: `tests/orchestra/arbiter-loop.test.ts`

- [ ] **Step 1: Write failing test** — `arbiterTick(root, classes, pools, emitter)` runs one `FileLeaseBackend.tick()` and returns the status snapshot; `startArbiterLoop(root)` is process-singleton (calling twice returns the same handle) and `stopArbiterLoop()` clears it. Use a short interval injected for the test; assert two requests get granted within a few ticks.

- [ ] **Step 2 → 5:** implement `arbiterTick` (constructs backend from resolved classes/pools, runs `tick()`, returns `status()`), `startArbiterLoop` (`setInterval` 1000ms, guarded by a module-level singleton ref so result-collector and standalone don't double-run), `stopArbiterLoop`. Commit `feat(arbiter): arbiter-loop driver (tick + singleton interval)`.

---

### Task 4.2: 3-backend env injection

**Files:**
- Modify: `src/orchestra/spawn-backend-docker.ts`, `src/orchestra/tmux.ts`, `src/orchestra/spawn-backend.ts`
- Test: `tests/orchestra/spawn-env-injection.test.ts`

- [ ] **Step 1: Write failing test** — for each backend's command/env builder, assert the env produced by the shared helper `buildLeaseEnv({ taskId, workerId, shimDir })` contains `DECKENT_TASK_ID`, `DECKENT_WORKER_ID`, a `PATH` with `shimDir` prepended, and `NODE_OPTIONS` containing `--require .../preload.cjs`. (Docker currently sets only `DECKENT_TASK_ID` at `:724` — add WORKER_ID + PATH + NODE_OPTIONS; tmux/subprocess add all.)

- [ ] **Step 2 → 5:** implement the shared `buildLeaseEnv(opts)` in `lease-shim.ts`, call it from all three spawn paths, generate shims once per sprint at spawn-time. Verify `npx tsc --noEmit`. Commit `feat(arbiter): inject lease env (PATH+NODE_OPTIONS+DECKENT_*) in 3 backends`.

---

### Task 4.3: Host-side PROGRESS/notify emit

**Files:**
- Modify: `src/orchestra/arbiter-loop.ts` (wire real emitter), `src/orchestra/result-collector.ts:787` (call `arbiterTick` in dispatch tick)
- Test: `tests/orchestra/arbiter-emit.test.ts`

- [ ] **Step 1: Write failing test** — when `arbiterTick` produces a snapshot with waiting > 0, it calls the injected `emitProgress`/`notifyProgress` with a queue detail (assert the emitter mock is called with phase/detail containing the class + waiting count). Emit is host-side ONLY (spec §15, F3-B4).

- [ ] **Step 2 → 5:** implement: pass real `emitProgress` (`event-stream.ts:610`) + `notifyProgress` (`notify.ts:98`) into `arbiterTick`; emit on grant/queue-change and a one-shot long-wait warning (> class TTL). Hook `arbiterTick` into the existing `dispatchTick` (`result-collector.ts:787`) so it runs every dispatch cycle during a sprint. Verify a smoke sprint shows queue progress. Commit `feat(arbiter): host-side PROGRESS/notify emit on grant/queue/long-wait`.

---

# Phase 5 — K2 Host Accounting (clock-freeze) `[opus]`

### Task 5.1: Active-time accounting in ledger

**Files:**
- Modify: `src/core/resource-arbiter.ts`
- Test: `tests/core/resource-arbiter-accounting.test.ts`

- [ ] **Step 1: Write failing test** (injectable clock) — a holder that waited 10s before grant has `ledger[holder].waitMs ≈ 10000`; `activeMs(holder) = (now - grantedAt) `, and `effectiveElapsed(holder) = wallSinceRequest - waitMs`. Assert wait time is excluded from active time.

- [ ] **Step 2 → 5:** accumulate `waitMs` per holder across ticks (delta between `seenAt`/last-wait-tick and `grantedAt`); expose `accounting(holder): { waitMs, activeMs }`. Commit `feat(arbiter): K2 active-time accounting — wait excluded from elapsed`.

---

### Task 5.2: Host-side deadline + container backstop widening

**Files:**
- Modify: `src/orchestra/spawn-backend-docker.ts` (backstop `timeout` value), `src/orchestra/result-collector.ts` / `subprocess.ts:184` (host precise deadline)
- Test: `tests/orchestra/k2-deadline.test.ts`

- [ ] **Step 1: Write failing test** — the in-container backstop timeout value is computed as `task_timeout + max_wait_budget` (assert the docker command/env carries the widened value, not the raw `task_timeout`); the host-side precise kill uses `effectiveElapsed` (lease-wait excluded) so a worker that waited in queue is not killed for the wait.

- [ ] **Step 2 → 5:** widen the container `timeout $TIMEOUT` to `task_timeout + max_wait_budget` (config, default `max_wait_budget = task_timeout`); add host-side deadline check keyed off `effectiveElapsed` from the arbiter accounting; subprocess backend's `setTimeout` (`subprocess.ts:184`) becomes lease-aware. Commit `feat(arbiter): K2 — host precise deadline (wait-excluded) + container backstop`.

---

# Phase 6 — L1 Dispatch-Deferral `[sonnet]`

### Task 6.1: `expectedResourceClasses` signal

**Files:**
- Modify: `src/orchestra/task-builder.ts` (parse `- ResourceClass:`), `docs/reference/api-surface.md` (`.tasks` schema field)
- Test: `tests/orchestra/task-builder-resourceclass.test.ts`

- [ ] **Step 1: Write failing test** — a DIRECTIVES task block with `- ResourceClass: heavy-test` produces a task JSON with `expectedResourceClasses: ['heavy-test']` (mirror the existing `Agent:`/`Skills:` override parsing).

- [ ] **Step 2 → 5:** add `expectedResourceClasses?: string[]` to the task type + parse the directive line; document in `api-surface.md`. Commit `feat(arbiter): parse - ResourceClass: directive → expectedResourceClasses`.

---

### Task 6.2: planDispatch saturation filter + reject co-dispatch ban

**Files:**
- Modify: `src/orchestra/result-collector.ts:227` (`planDispatch`)
- Test: `tests/orchestra/dispatch-saturation.test.ts`

- [ ] **Step 1: Write failing test** — given a queue snapshot where `heavy-test` is at capacity, `planDispatch` defers a ready task whose `expectedResourceClasses` includes `heavy-test` and picks a non-conflicting task instead; two tasks that both touch a `reject`-policy class are NEVER selected in the same dispatch pass (F3-B18).

- [ ] **Step 2 → 5:** add a pure saturation filter to `planDispatch` (reads the queue.json snapshot; this is L1 = optimization, correctness still in L3) + a hard rule that reject-class tasks are mutually exclusive per pass. Commit `feat(arbiter): L1 dispatch-deferral + reject-class co-dispatch ban`.

---

# Phase 7 — CLI + Visibility `[sonnet]`

### Task 7.1: `deckent lease` command

**Files:**
- Create: `src/cli/commands/lease.ts`
- Modify: CLI entry (register the command, ADR-012 `register<Lease>(program)`)
- Test: `tests/cli/lease-command.test.ts`

- [ ] **Step 1: Write failing test** — `deckent lease ls` prints the status snapshot (class, granted/capacity, waiting); `deckent lease test "vitest run"` prints `heavy-test`; `deckent lease test "echo hi"` prints `(none)`; `deckent lease clear --stale` removes stale entries; `deckent lease release <class> <holder>` removes a grant. All strings via `getMessage` (en+tr).

- [ ] **Step 2 → 5:** implement the command (reads `FileLeaseBackend.status()` + `matchCommandToClass`), register it, add i18n keys (`lease.ls_*`, `lease.test_*`). Smoke: `node dist/cli/entry.js lease ls`. Commit `feat(cli): deckent lease ls|release|clear|test`.

---

### Task 7.2: `deckent status` + `.dashboard` queue line

**Files:**
- Modify: `src/cli/commands/status.ts`, `src/monitor/auditor.ts`
- Test: `tests/cli/status-queue-line.test.ts`

- [ ] **Step 1: Write failing test** — when `queue.json` shows waiters, `deckent status` output includes a line like `heavy-test: 1/1 granted, 2 waiting`; the Auditor writes the same summary to `.dashboard` as an INFO line (not an alert — K7, no new stale logic). i18n.

- [ ] **Step 2 → 5:** read `queue.json` in both surfaces; add the line. Commit `feat(cli): status + .dashboard lease queue summary ("neden yavaş?")`.

---

### Task 7.3: Config-invalid surfacing

**Files:**
- Modify: `src/cli/commands/config.ts` (write-time reject already via `validatePartialConfig` — add a friendly message), `src/cli/commands/doctor.ts` (persistent finding)
- Test: `tests/cli/config-resource-invalid.test.ts`

- [ ] **Step 1: Write failing test** — `deckent config set resource_classes.heavy-test.capacity 0` exits non-zero with an i18n message naming the class + field; `deckent doctor` reports a finding when a configured class is invalid at runtime (F3-B12).

- [ ] **Step 2 → 5:** wire `validatePartialConfig` error to a friendly i18n message in config set; add a doctor check. Commit `feat(cli): config-invalid resource_classes → friendly reject + doctor finding`.

---

# Phase 8 — i18n + Docs + Smoke `[haiku/sonnet]`

### Task 8.1: i18n keys `[haiku]`

**Files:**
- Modify: `src/cli/helpers/messages.ts`
- Test: `tests/cli/messages-lease.test.ts`

- [ ] **Step 1 → 5:** add en+tr for `lease.waiting`, `lease.granted`, `lease.released`, `lease.stale_cleared`, `lease.fail_open`, `lease.fail_degraded`, `lease.rejected`, `lease.wait_long`, `lease.config_invalid`, `lease.ls_header`, `lease.test_match`, `lease.test_none`. Test asserts every key resolves in both languages and they differ. Commit `feat(i18n): lease.* keys (en+tr)`.

---

### Task 8.2: Docs `[haiku]`

**Files:**
- Modify: `docs/reference/cli-commands.md`, `docs/reference/features.md`, `docs/reference/api-surface.md` (lease file formats), `DECKENT.md` (Gotchas), `docs/MASTER-PLAN.md` (§4I marks)

- [ ] **Steps:** document `deckent lease`, the `resource_classes` schema + auto-capacity table, the lease protocol file formats, a Gotchas line ("tests queuing is intentional — `deckent lease ls`"), and mark §4I items done. Evidence: `grep -c "resource_classes\|deckent lease" docs/reference/*.md`. Commit `docs(arbiter): cli/features/api-surface/gotchas/master-plan`.

---

### Task 8.3: Tier-1 smoke in a non-deckent fixture `[sonnet]`

**Files:**
- Create: `tests/e2e/arbiter-smoke.test.ts` + a minimal fixture project under `tests/fixtures/arbiter-userproj/` (has its own `package.json` with `"test": "node sleep-test.mjs"` simulating a heavy test)

- [ ] **Step 1: Write the smoke** — spin up the arbiter loop pointed at the fixture, spawn 3 "workers" (real subprocesses) that each run the fixture's `npm test` through the generated shim + client, with class capacity 1; assert via `queue.json`/event log that at most 1 ran at a time and all 3 eventually completed. **The fixture is NOT deckent** — this is the dogfood-blindness gate (F3-B1): proves the client works without deckent installed in the workspace.

- [ ] **Step 2 → 4:** implement the fixture + smoke; run `npx vitest run tests/e2e/arbiter-smoke.test.ts`. Expected: PASS, serialization proven.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/arbiter-smoke.test.ts tests/fixtures/arbiter-userproj/
git commit -m "test(arbiter): Tier-1 smoke — 3-worker serialization in non-deckent fixture"
```

---

## Final Verification

- [ ] `npx tsc --noEmit` — clean
- [ ] `npx vitest run tests/core/resource-* tests/orchestra/arbiter-* tests/orchestra/lease-* tests/cli/lease-* tests/e2e/arbiter-smoke.test.ts` — all green
- [ ] `npm run test:ci-sim` — hermetic (no gitignored-state reads)
- [ ] Real-world: an 8-task all-tests sprint on this machine → `resource-log.jsonl` shows concurrent heavy ≤ pool capacity
- [ ] Write ADR-090 (`store.insert({ type:'adr', status:'accepted', ... })` + `deckent memory export`) — md + memory.db synced

---

## Spec Coverage Map (self-review)

| Spec § | Plan task(s) |
|--------|-------------|
| §6 host-hakem / K5 | 1.1–1.8, 4.1 |
| §7 lease protocol, split staleness | 1.3, 1.4, 2.1, 2.2 |
| §8 enforcement matrix (PM/preload/binary) | 3.1, 3.2, 3.3 |
| §8 import-free client (F3-B1) | 2.1, 8.3 |
| §9 K2 clock-freeze | 5.1, 5.2 |
| §10 components / status / config resolve | 0.2, 0.3, 1.5, 7.1–7.3 |
| §11 schema (binaries, pool, enabled, ttl:null) | 0.1, 0.2, 0.3 |
| §13 fail-mode matrix (K8) | 1.7, 7.3, 2.1 |
| §14 autonomous inheritance / ERP V2 | 4.2 (spawn path), docs 8.2 |
| §15 host-side emit + i18n + docs | 4.3, 8.1, 8.2 |
| §16 test strategy incl. stress + smoke | 1.8, 8.3 |
| §6 L1 dispatch-deferral | 6.1, 6.2 |
| §18 ADR-090 | Final Verification |

**Known plan-level deferrals (V2, not in this plan — spec §17):** capability-dispatch ERP leases, host-scoped store + shell-init (A4), A3 hardening (RO-mount/HMAC), coalesce policy, priority/preemption, Brain-hand-off, dashboard queue panel, cross-machine backend, REPL wire.
