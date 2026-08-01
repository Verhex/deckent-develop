# Autonomous Goal Planner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn a high-level goal into a lightweight autonomous backlog whose per-item detail is generated just-in-time at dispatch, so the AI context never fills.

**Architecture:** Phase-1 (`deckent autonomous plan "<goal>"`) calls an injectable LLM to decompose a goal + optional artifact-ref into validated `PlannedItem`s (kind/trigger/scope/policy/fanOut/capabilityTarget), written to the backlog as `planned: true` with no description. Phase-2 hooks the existing execute-dispatcher: when a planned entry is dispatched it generates the full worker detail JIT (task description / sprint DIRECTIVES), then runs through the existing engine.

**Tech Stack:** TypeScript (ESM, `.js` import suffixes), Zod for validation, vitest for tests, commander for CLI. Reuses `planner.ts` (provider spawn + `parsePlannerResponse`), `backlog.ts` (`enqueueCandidates`), `execute-dispatcher.ts`, `execution-pool.ts`.

---

## File Structure

**New files:**
- `src/orchestra/autonomous/goal-planner-types.ts` — `PlannedItem` Zod schema + `LlmComplete` type.
- `src/orchestra/autonomous/artifact-ref.ts` — `extractArtifactSeeds(ref)` → open `- [ ]` lines of a file/section.
- `src/orchestra/autonomous/goal-planner.ts` — `buildGoalPlanPrompt`, `parsePlannedItems`, `planGoal`, `plannedItemToBacklogEntry`.
- `src/orchestra/autonomous/jit-detail.ts` — `needsJitDetail`, `buildJitDetailPrompt`, `generateItemDetail`.

**Modified files:**
- `src/orchestra/autonomous/backlog-types.ts` — add `process` kind; add `planned?`, `summary?`, `fanOut?` to `BacklogEntry`.
- `src/orchestra/autonomous/backlog.ts` — `validateBacklogEntry` accepts the new optional fields + `process` kind.
- `src/orchestra/autonomous/execute-dispatcher.ts` — JIT-detail hook before `runTask`/`runSprint`; `process` → fail-with-reason; `fanOut` → pool sizing.
- `src/cli/commands/autonomous.ts` — `plan` subcommand + real `LlmComplete` wiring + plan table print.
- `src/cli/helpers/messages.ts` — i18n keys for the plan output (en/tr).

---

## Task 1: Extend the backlog schema (process kind + planned/summary/fanOut)

**Files:**
- Modify: `src/orchestra/autonomous/backlog-types.ts`
- Modify: `src/orchestra/autonomous/backlog.ts` (KINDS set + validateBacklogEntry)
- Test: `tests/orchestra/autonomous/backlog-planned-fields.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/orchestra/autonomous/backlog-planned-fields.test.ts
import { describe, it, expect } from 'vitest';
import { validateBacklogEntry } from '../../../src/orchestra/autonomous/backlog.js';

function base() {
  return {
    id: 'i1', title: 'T', kind: 'task', spec: {}, policy: 'auto',
    trigger: { type: 'one-off' }, status: 'pending', lastRun: null, lastResult: null,
  };
}

describe('backlog schema — planner fields', () => {
  it('accepts planned + summary + fanOut on a valid entry', () => {
    const e = { ...base(), planned: true, summary: 'do x', fanOut: { over: 'tables', concurrency: 20 } };
    expect(validateBacklogEntry(e)).toBeNull();
  });
  it('accepts kind=process', () => {
    expect(validateBacklogEntry({ ...base(), kind: 'process' })).toBeNull();
  });
  it('rejects a malformed fanOut (non-numeric concurrency)', () => {
    const e = { ...base(), fanOut: { over: 'tables', concurrency: 'lots' } };
    expect(validateBacklogEntry(e)).toMatch(/fanOut/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/orchestra/autonomous/backlog-planned-fields.test.ts`
Expected: FAIL — `kind=process` rejected and/or malformed fanOut not caught.

- [ ] **Step 3: Implement — extend types + validation**

In `src/orchestra/autonomous/backlog-types.ts`: add `'process'` to the `BacklogKind` union, and add to `BacklogEntry` (after `actor?`):

```ts
  /** Goal-planner (Phase 1): a lightweight, not-yet-detailed item. The full
   *  spec.description is generated just-in-time at dispatch (Phase 2). */
  planned?: boolean;
  /** Goal-planner: one-line WHAT for the plan table + JIT detail seed. */
  summary?: string;
  /** Goal-planner: parallel fan-out hint — run `concurrency` jobs over `over`. */
  fanOut?: { over: string; concurrency: number };
```

In `src/orchestra/autonomous/backlog.ts`: add `'process'` to the `KINDS` set, and in `validateBacklogEntry` (before `return null;`):

```ts
  if (r.fanOut !== undefined) {
    const f = r.fanOut as Record<string, unknown>;
    if (!f || typeof f !== 'object' || typeof f.over !== 'string' || typeof f.concurrency !== 'number' || f.concurrency < 1) {
      return `entry.${r.id}.fanOut must be { over: string, concurrency: number>=1 }`;
    }
  }
  if (r.planned !== undefined && typeof r.planned !== 'boolean') return `entry.${r.id}.planned must be boolean`;
  if (r.summary !== undefined && typeof r.summary !== 'string') return `entry.${r.id}.summary must be a string`;
```

Also update the stale message `kind must be task|sprint` → `kind must be task|sprint|capability|process`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/orchestra/autonomous/backlog-planned-fields.test.ts`
Expected: PASS (3 tests). Then `npx tsc --noEmit` → clean.

- [ ] **Step 5: Commit**

```bash
git add src/orchestra/autonomous/backlog-types.ts src/orchestra/autonomous/backlog.ts tests/orchestra/autonomous/backlog-planned-fields.test.ts
git commit -m "feat(autonomous): backlog schema — process kind + planned/summary/fanOut fields"
```

---

## Task 2: PlannedItem schema + LlmComplete type

**Files:**
- Create: `src/orchestra/autonomous/goal-planner-types.ts`
- Test: `tests/orchestra/autonomous/goal-planner-types.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/orchestra/autonomous/goal-planner-types.test.ts
import { describe, it, expect } from 'vitest';
import { PlannedItemSchema } from '../../../src/orchestra/autonomous/goal-planner-types.js';

describe('PlannedItemSchema', () => {
  const ok = { id: 'a', title: 'A', kind: 'task', scopeDir: 'src/api/', summary: 's', policy: 'auto', trigger: 'one-off' };
  it('accepts a minimal valid item', () => {
    expect(PlannedItemSchema.safeParse(ok).success).toBe(true);
  });
  it('accepts recurring trigger + fanOut + capabilityTarget', () => {
    const e = { ...ok, kind: 'capability', trigger: { recurring: '*/15 * * * *' }, fanOut: { over: 'tables', concurrency: 20 }, capabilityTarget: { capability: 'db.query', connector: 'postgres' } };
    expect(PlannedItemSchema.safeParse(e).success).toBe(true);
  });
  it('rejects an unknown kind', () => {
    expect(PlannedItemSchema.safeParse({ ...ok, kind: 'deploy' }).success).toBe(false);
  });
  it('rejects an absolute or traversing scopeDir', () => {
    expect(PlannedItemSchema.safeParse({ ...ok, scopeDir: '/etc' }).success).toBe(false);
    expect(PlannedItemSchema.safeParse({ ...ok, scopeDir: '../x' }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/orchestra/autonomous/goal-planner-types.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the schema**

```ts
// src/orchestra/autonomous/goal-planner-types.ts
import { z } from 'zod';

/** Repo-relative dir, no absolute, no parent traversal. */
const ScopeDir = z.string().min(1).refine(
  (s) => !s.startsWith('/') && !s.split('/').includes('..'),
  { message: 'scopeDir must be repo-relative (no absolute path, no "..")' },
);

const Trigger = z.union([
  z.literal('one-off'),
  z.object({ recurring: z.string().min(1) }).strict(),
  z.object({ reactive: z.string().min(1) }).strict(),
]);

/** A lightweight planned work item (Phase 1 output). Detail is generated JIT. */
export const PlannedItemSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  kind: z.enum(['task', 'sprint', 'capability', 'process']),
  scopeDir: ScopeDir,
  summary: z.string().min(1),
  policy: z.enum(['auto', 'approval-required', 'risk-tagged']),
  trigger: Trigger,
  fanOut: z.object({ over: z.string().min(1), concurrency: z.number().int().min(1) }).optional(),
  capabilityTarget: z.object({
    capability: z.string().min(1),
    connector: z.string().optional(),
    args: z.record(z.unknown()).optional(),
  }).optional(),
}).strict();

export type PlannedItem = z.infer<typeof PlannedItemSchema>;

/** Injectable LLM completion: prompt in, raw model text out. Mocked in tests;
 *  wired to the provider spawn in the CLI. */
export type LlmComplete = (prompt: string) => Promise<string>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/orchestra/autonomous/goal-planner-types.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/orchestra/autonomous/goal-planner-types.ts tests/orchestra/autonomous/goal-planner-types.test.ts
git commit -m "feat(autonomous): PlannedItem Zod schema + LlmComplete type"
```

---

## Task 3: Artifact-ref seed extraction

**Files:**
- Create: `src/orchestra/autonomous/artifact-ref.ts`
- Test: `tests/orchestra/autonomous/artifact-ref.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/orchestra/autonomous/artifact-ref.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { extractArtifactSeeds } from '../../../src/orchestra/autonomous/artifact-ref.js';

let dir: string | undefined;
afterEach(() => { if (dir) { rmSync(dir, { recursive: true, force: true }); dir = undefined; } });

function write(content: string): string {
  dir = mkdtempSync(join(tmpdir(), 'artref-'));
  const p = join(dir, 'PLAN.md');
  writeFileSync(p, content, 'utf-8');
  return p;
}

describe('extractArtifactSeeds', () => {
  it('returns all open checklist items of a whole file', () => {
    const p = write('# X\n- [ ] alpha\n- [x] done\n- [ ] beta\n');
    expect(extractArtifactSeeds(p)).toEqual(['alpha', 'beta']);
  });
  it('scopes to a section anchor (until the next heading of same/higher level)', () => {
    const p = write('## A\n- [ ] a1\n## B\n- [ ] b1\n');
    expect(extractArtifactSeeds(`${p}#b`)).toEqual(['b1']);
  });
  it('returns [] for a missing file', () => {
    expect(extractArtifactSeeds('/no/such/file.md')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/orchestra/autonomous/artifact-ref.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/orchestra/autonomous/artifact-ref.ts
import { existsSync, readFileSync } from 'node:fs';

const OPEN_ITEM = /^\s*- \[ \]\s*(.+?)\s*$/;
const HEADING = /^(#{1,6})\s+(.*)$/;

/**
 * Extract open `- [ ]` checklist items from an artifact ref `file` or
 * `file#section-anchor`. With an anchor, only items under the first heading
 * whose slugified text contains the anchor (until the next same-or-higher
 * heading) are returned. Returns the stripped item text (markdown left intact).
 * A missing/unreadable file → [] (the planner falls back to free-text only).
 */
export function extractArtifactSeeds(ref: string): string[] {
  const hashIdx = ref.indexOf('#');
  const path = hashIdx >= 0 ? ref.slice(0, hashIdx) : ref;
  const anchor = hashIdx >= 0 ? ref.slice(hashIdx + 1).toLowerCase() : null;
  if (!existsSync(path)) return [];
  let lines: string[];
  try { lines = readFileSync(path, 'utf-8').split('\n'); } catch { return []; }

  let inSection = anchor === null;
  let sectionLevel = 0;
  const seeds: string[] = [];
  for (const line of lines) {
    const h = HEADING.exec(line);
    if (h) {
      const level = h[1]!.length;
      const slug = h[2]!.toLowerCase();
      if (anchor !== null) {
        if (!inSection && slug.includes(anchor)) { inSection = true; sectionLevel = level; continue; }
        if (inSection && level <= sectionLevel) break; // next same/higher heading ends the section
      }
      continue;
    }
    if (!inSection) continue;
    const m = OPEN_ITEM.exec(line);
    if (m) seeds.push(m[1]!);
  }
  return seeds;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/orchestra/autonomous/artifact-ref.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/orchestra/autonomous/artifact-ref.ts tests/orchestra/autonomous/artifact-ref.test.ts
git commit -m "feat(autonomous): artifact-ref open-checklist seed extraction"
```

---

## Task 4: Goal-planner core (prompt + parse + planGoal)

**Files:**
- Create: `src/orchestra/autonomous/goal-planner.ts`
- Test: `tests/orchestra/autonomous/goal-planner.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/orchestra/autonomous/goal-planner.test.ts
import { describe, it, expect } from 'vitest';
import { parsePlannedItems, planGoal } from '../../../src/orchestra/autonomous/goal-planner.js';

const TWO = JSON.stringify({ items: [
  { id: 'roles-api', title: 'Roles API', kind: 'task', scopeDir: 'src/api/', summary: 'add roles crud', policy: 'auto', trigger: 'one-off' },
  { id: 'tbl-check', title: 'Table check', kind: 'capability', scopeDir: 'src/', summary: 'check tables', policy: 'auto', trigger: { recurring: '*/15 * * * *' }, fanOut: { over: 'tables', concurrency: 20 }, capabilityTarget: { capability: 'db.query' } },
] });

describe('parsePlannedItems', () => {
  it('parses + validates items, dropping invalid ones', () => {
    const raw = JSON.stringify({ items: [
      { id: 'ok', title: 'T', kind: 'task', scopeDir: 'src/', summary: 's', policy: 'auto', trigger: 'one-off' },
      { id: 'bad', title: 'T', kind: 'NOPE', scopeDir: 'src/', summary: 's', policy: 'auto', trigger: 'one-off' },
    ] });
    const items = parsePlannedItems(raw);
    expect(items.map((i) => i.id)).toEqual(['ok']);
  });
  it('strips code fences and dedups by id', () => {
    const raw = '```json\n' + JSON.stringify({ items: [
      { id: 'x', title: 'T', kind: 'task', scopeDir: 'src/', summary: 's', policy: 'auto', trigger: 'one-off' },
      { id: 'x', title: 'T2', kind: 'task', scopeDir: 'src/', summary: 's2', policy: 'auto', trigger: 'one-off' },
    ] }) + '\n```';
    expect(parsePlannedItems(raw).map((i) => i.title)).toEqual(['T']);
  });
});

describe('planGoal', () => {
  it('calls the LLM with the goal and returns validated items, capped to maxItems', async () => {
    let seenPrompt = '';
    const complete = async (p: string) => { seenPrompt = p; return TWO; };
    const items = await planGoal({ goal: 'finish roles + table checks', maxItems: 1, complete });
    expect(seenPrompt).toContain('finish roles + table checks');
    expect(items).toHaveLength(1); // capped
    expect(items[0]!.id).toBe('roles-api');
  });
  it('includes artifact seeds in the prompt when provided', async () => {
    let seenPrompt = '';
    const complete = async (p: string) => { seenPrompt = p; return TWO; };
    await planGoal({ goal: 'g', seeds: ['seed-one', 'seed-two'], complete });
    expect(seenPrompt).toContain('seed-one');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/orchestra/autonomous/goal-planner.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/orchestra/autonomous/goal-planner.ts
import { PlannedItemSchema, type PlannedItem, type LlmComplete } from './goal-planner-types.js';

export interface PlanGoalInput {
  goal: string;
  /** Optional seed lines from an artifact-ref (extractArtifactSeeds). */
  seeds?: string[];
  /** Compact project context (e.g. .brain/exports/summary.md). */
  context?: string;
  /** Cap on returned items (default 30). */
  maxItems?: number;
  complete: LlmComplete;
}

const DEFAULT_MAX = 30;

/** System+task prompt instructing the model to emit `{ items: PlannedItem[] }`. */
export function buildGoalPlanPrompt(input: Omit<PlanGoalInput, 'complete'>): string {
  const seeds = input.seeds && input.seeds.length > 0
    ? `\n\nSeed items (open checklist lines from the referenced artifact — group/refine, assign kind):\n${input.seeds.map((s) => `- ${s}`).join('\n')}`
    : '';
  const ctx = input.context ? `\n\nProject context:\n${input.context}` : '';
  return `You are the Deckent autonomous planner. Decompose the GOAL into a LIGHTWEIGHT backlog — titles + kind + scope only, NO implementation detail (detail is generated later, just in time).

Output STRICT JSON: { "items": PlannedItem[] }. Each PlannedItem:
{ "id": kebab-slug, "title": short, "kind": "task"|"sprint"|"capability"|"process",
  "scopeDir": repo-relative dir (e.g. "src/api/"), "summary": one line WHAT,
  "policy": "auto"|"approval-required"|"risk-tagged",
  "trigger": "one-off" | {"recurring":"<cron>"} | {"reactive":"<detector>"},
  "fanOut"?: {"over": string, "concurrency": number},
  "capabilityTarget"?: {"capability": dotted-verb, "connector"?: string, "args"?: object} }

Rules: single-file/tight change → task; multi-file/multi-module feature → sprint;
non-code connector op (db.query/erp.read/mail.send/http.get) → capability;
multi-step workflow/DAG → process; "continuously …" → recurring cron;
"N agents over X" → fanOut.concurrency=N; destructive/irreversible → approval-required.
At most ${input.maxItems ?? DEFAULT_MAX} items. Output ONLY the JSON, no prose.

GOAL: ${input.goal}${seeds}${ctx}`;
}

/** Strip code fences and a leading non-JSON preamble, then JSON.parse. */
function stripToJson(raw: string): string {
  let s = raw.trim();
  if (s.startsWith('```')) s = s.replace(/^```[a-z]*\n?/i, '').replace(/```\s*$/, '').trim();
  const i = s.indexOf('{');
  const j = s.lastIndexOf('}');
  return i >= 0 && j > i ? s.slice(i, j + 1) : s;
}

/** Parse the model output into validated, de-duplicated PlannedItems. Invalid
 *  items are dropped (never throws). */
export function parsePlannedItems(raw: string): PlannedItem[] {
  let parsed: unknown;
  try { parsed = JSON.parse(stripToJson(raw)); } catch { return []; }
  const arr = (parsed as { items?: unknown })?.items;
  if (!Array.isArray(arr)) return [];
  const seen = new Set<string>();
  const out: PlannedItem[] = [];
  for (const candidate of arr) {
    const r = PlannedItemSchema.safeParse(candidate);
    if (!r.success) continue;
    if (seen.has(r.data.id)) continue;
    seen.add(r.data.id);
    out.push(r.data);
  }
  return out;
}

/** Phase 1: decompose a goal into validated PlannedItems (capped to maxItems). */
export async function planGoal(input: PlanGoalInput): Promise<PlannedItem[]> {
  const max = input.maxItems ?? DEFAULT_MAX;
  const raw = await input.complete(buildGoalPlanPrompt(input));
  return parsePlannedItems(raw).slice(0, max);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/orchestra/autonomous/goal-planner.test.ts`
Expected: PASS (4 tests). `npx tsc --noEmit` → clean.

- [ ] **Step 5: Commit**

```bash
git add src/orchestra/autonomous/goal-planner.ts tests/orchestra/autonomous/goal-planner.test.ts
git commit -m "feat(autonomous): goal-planner core — prompt build + parse + planGoal"
```

---

## Task 5: PlannedItem → BacklogEntry mapping + write

**Files:**
- Modify: `src/orchestra/autonomous/goal-planner.ts` (add `plannedItemToBacklogEntry`)
- Test: `tests/orchestra/autonomous/goal-planner-map.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/orchestra/autonomous/goal-planner-map.test.ts
import { describe, it, expect } from 'vitest';
import { plannedItemToBacklogEntry } from '../../../src/orchestra/autonomous/goal-planner.js';
import { validateBacklogEntry } from '../../../src/orchestra/autonomous/backlog.js';

describe('plannedItemToBacklogEntry', () => {
  it('maps a task item to a valid pending+planned backlog entry (no description)', () => {
    const e = plannedItemToBacklogEntry({
      id: 'roles', title: 'Roles', kind: 'task', scopeDir: 'src/api/', summary: 'roles crud', policy: 'auto', trigger: 'one-off',
    });
    expect(validateBacklogEntry(e)).toBeNull();
    expect(e.status).toBe('pending');
    expect(e.planned).toBe(true);
    expect(e.spec.description).toBeUndefined();
    expect(e.spec.scopeDir).toBe('src/api/');
    expect(e.summary).toBe('roles crud');
  });
  it('maps recurring trigger + fanOut + capabilityTarget', () => {
    const e = plannedItemToBacklogEntry({
      id: 't', title: 'T', kind: 'capability', scopeDir: 'src/', summary: 's', policy: 'auto',
      trigger: { recurring: '*/15 * * * *' }, fanOut: { over: 'tables', concurrency: 20 },
      capabilityTarget: { capability: 'db.query', connector: 'postgres' },
    });
    expect(validateBacklogEntry(e)).toBeNull();
    expect(e.trigger).toEqual({ type: 'recurring', cron: '*/15 * * * *' });
    expect(e.fanOut).toEqual({ over: 'tables', concurrency: 20 });
    expect(e.spec.capabilityTarget?.capability).toBe('db.query');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/orchestra/autonomous/goal-planner-map.test.ts`
Expected: FAIL — `plannedItemToBacklogEntry` not exported.

- [ ] **Step 3: Implement (append to goal-planner.ts)**

```ts
import type { BacklogEntry, BacklogTrigger } from './backlog-types.js';

function toTrigger(t: PlannedItem['trigger']): BacklogTrigger {
  if (t === 'one-off') return { type: 'one-off' };
  if ('recurring' in t) return { type: 'recurring', cron: t.recurring };
  return { type: 'reactive', detector: t.reactive };
}

/** Map a PlannedItem to a pending, `planned: true` BacklogEntry (no description —
 *  that is generated JIT at dispatch). */
export function plannedItemToBacklogEntry(item: PlannedItem): BacklogEntry {
  return {
    id: item.id,
    title: item.title,
    kind: item.kind,
    spec: {
      scopeDir: item.scopeDir,
      ...(item.capabilityTarget ? { capabilityTarget: item.capabilityTarget } : {}),
    },
    policy: item.policy,
    trigger: toTrigger(item.trigger),
    status: 'pending',
    planned: true,
    summary: item.summary,
    ...(item.fanOut ? { fanOut: item.fanOut } : {}),
    lastRun: null,
    lastResult: null,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/orchestra/autonomous/goal-planner-map.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/orchestra/autonomous/goal-planner.ts tests/orchestra/autonomous/goal-planner-map.test.ts
git commit -m "feat(autonomous): plannedItemToBacklogEntry mapping"
```

---

## Task 6: JIT detail generation (Phase 2 core)

**Files:**
- Create: `src/orchestra/autonomous/jit-detail.ts`
- Test: `tests/orchestra/autonomous/jit-detail.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/orchestra/autonomous/jit-detail.test.ts
import { describe, it, expect } from 'vitest';
import { needsJitDetail, generateItemDetail } from '../../../src/orchestra/autonomous/jit-detail.js';
import type { BacklogEntry } from '../../../src/orchestra/autonomous/backlog-types.js';

function entry(over: Partial<BacklogEntry> = {}): BacklogEntry {
  return {
    id: 'i', title: 'Roles API', kind: 'task', spec: { scopeDir: 'src/api/' }, policy: 'auto',
    trigger: { type: 'one-off' }, status: 'pending', planned: true, summary: 'add roles crud',
    lastRun: null, lastResult: null, ...over,
  };
}

describe('needsJitDetail', () => {
  it('true for a planned task/sprint without a description', () => {
    expect(needsJitDetail(entry())).toBe(true);
    expect(needsJitDetail(entry({ kind: 'sprint' }))).toBe(true);
  });
  it('false once a description exists', () => {
    expect(needsJitDetail(entry({ spec: { scopeDir: 'src/api/', description: 'done' } }))).toBe(false);
  });
  it('false for capability/process (no code detail needed)', () => {
    expect(needsJitDetail(entry({ kind: 'capability', spec: { capabilityTarget: { capability: 'db.query' } } }))).toBe(false);
    expect(needsJitDetail(entry({ kind: 'process' }))).toBe(false);
  });
  it('false for a non-planned entry', () => {
    expect(needsJitDetail(entry({ planned: false }))).toBe(false);
  });
});

describe('generateItemDetail', () => {
  it('fills spec.description from the LLM for a task and includes the summary in the prompt', async () => {
    let seen = '';
    const complete = async (p: string) => { seen = p; return 'Add the roles CRUD endpoints to src/api/...'; };
    const e = entry();
    const out = await generateItemDetail(e, complete);
    expect(seen).toContain('add roles crud');
    expect(seen).toContain('src/api/');
    expect(out.spec.description).toContain('roles CRUD');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/orchestra/autonomous/jit-detail.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/orchestra/autonomous/jit-detail.ts
import type { BacklogEntry } from './backlog-types.js';
import type { LlmComplete } from './goal-planner-types.js';

/** A planned task/sprint with no description yet needs JIT detail. Capability
 *  (capabilityTarget is the spec) and process (executor pending) do not. */
export function needsJitDetail(entry: BacklogEntry): boolean {
  if (!entry.planned) return false;
  if (entry.kind !== 'task' && entry.kind !== 'sprint') return false;
  return !entry.spec.description;
}

export function buildJitDetailPrompt(entry: BacklogEntry): string {
  const kindLine = entry.kind === 'sprint'
    ? 'Produce a DIRECTIVES block (one or more `## Task N:` sections with Model/Skills/Files/Scope + a Description and a Kanıt/Smoke line each).'
    : 'Produce a single worker task description: which files to change, the exact change, a Smoke/Kanıt verification line, and the constraint "do NOT run git commands; only edit files + write your .result".';
  return `You are detailing ONE autonomous backlog item just before execution. ${kindLine}
Output ONLY the detail text (no JSON, no preamble).

Title: ${entry.title}
Scope dir: ${entry.spec.scopeDir ?? '.'}
Summary: ${entry.summary ?? entry.title}`;
}

/** Phase 2: generate the full worker detail for a planned task/sprint and return
 *  a NEW entry with spec.description filled (caller persists it). */
export async function generateItemDetail(entry: BacklogEntry, complete: LlmComplete): Promise<BacklogEntry> {
  const description = (await complete(buildJitDetailPrompt(entry))).trim();
  return { ...entry, spec: { ...entry.spec, description } };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/orchestra/autonomous/jit-detail.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/orchestra/autonomous/jit-detail.ts tests/orchestra/autonomous/jit-detail.test.ts
git commit -m "feat(autonomous): JIT detail generation for planned task/sprint items"
```

---

## Task 7: Wire JIT detail + fanOut + process into the execute-dispatcher

**Files:**
- Modify: `src/orchestra/autonomous/execute-dispatcher.ts`
- Test: `tests/orchestra/autonomous/execute-dispatcher-jit.test.ts`

**Design:** `makeExecuteDispatcher` gains two optional deps: `jitComplete?: LlmComplete` (when present, a `needsJitDetail` entry is detailed + persisted before run) and the existing `pool`. A `process` entry returns failure with a clear reason. `fanOut` sizes the pool the job is submitted through (kept minimal here — concurrency is recorded; the existing pool enforces it).

- [ ] **Step 1: Write the failing test**

```ts
// tests/orchestra/autonomous/execute-dispatcher-jit.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeExecuteDispatcher, AUTONOMOUS_EXECUTE_ACTION } from '../../../src/orchestra/autonomous/execute-dispatcher.js';
import type { BacklogEntry } from '../../../src/orchestra/autonomous/backlog-types.js';

let dir: string | undefined;
afterEach(() => { if (dir) { rmSync(dir, { recursive: true, force: true }); dir = undefined; } });

function setup(entry: BacklogEntry): string {
  dir = mkdtempSync(join(tmpdir(), 'jit-disp-'));
  mkdirSync(join(dir, '.deckent', 'autonomous'), { recursive: true });
  const p = join(dir, '.deckent', 'autonomous', 'backlog.json');
  writeFileSync(p, JSON.stringify({ _version: '1.0', entries: [entry] }), 'utf-8');
  return p;
}

const baseEntry: BacklogEntry = {
  id: 'i', title: 'Roles', kind: 'task', spec: { scopeDir: 'src/api/' }, policy: 'auto',
  trigger: { type: 'one-off' }, status: 'pending', planned: true, summary: 'roles crud',
  lastRun: null, lastResult: null,
};

describe('execute-dispatcher — JIT detail', () => {
  it('generates + persists the description before running a planned task', async () => {
    const backlogPath = setup(baseEntry);
    let ranWith = '';
    const handler = makeExecuteDispatcher({
      projectRoot: dir!, config: {} as any, backlogPath,
      runTask: async (ctx) => { ranWith = ctx.description; return { taskId: 'tid' }; },
      runSprint: async () => ({}),
      waitForResult: async () => ({ taskId: 'tid', selfAssessment: 'DONE' } as any),
      jitComplete: async () => 'DETAILED: add roles crud endpoints',
    });
    const res = await handler(AUTONOMOUS_EXECUTE_ACTION, { entry: baseEntry });
    expect(res.outcome).toBe('success');
    expect(ranWith).toContain('DETAILED');
    // persisted back to the backlog
    const saved = JSON.parse(readFileSync(backlogPath, 'utf-8'));
    expect(saved.entries[0].spec.description).toContain('DETAILED');
  });

  it('fails a process entry with an honest reason (F3-008 pending)', async () => {
    const backlogPath = setup({ ...baseEntry, kind: 'process' });
    const handler = makeExecuteDispatcher({
      projectRoot: dir!, config: {} as any, backlogPath,
      runTask: async () => ({ taskId: 't' }), runSprint: async () => ({}),
      waitForResult: async () => null,
    });
    const res = await handler(AUTONOMOUS_EXECUTE_ACTION, { entry: { ...baseEntry, kind: 'process' } });
    expect(res.outcome).toBe('failure');
    expect(res.error).toMatch(/process|workflow/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/orchestra/autonomous/execute-dispatcher-jit.test.ts`
Expected: FAIL — `jitComplete` not a dep; `process` not handled.

- [ ] **Step 3: Implement**

In `execute-dispatcher.ts`: import `{ needsJitDetail, generateItemDetail }` from `./jit-detail.js` and `{ updateStatus }` is already imported. Add to `ExecuteDispatcherDeps`:

```ts
  /** Goal-planner Phase 2: when present, a planned task/sprint with no detail is
   *  detailed JIT (and persisted) before it runs. Absent → planned entries run
   *  with description = title (back-compat). */
  jitComplete?: LlmComplete;
```

(import `import type { LlmComplete } from './goal-planner-types.js';`)

Inside the `job` function, immediately after the `updateStatus(..., 'running', null)` line, before the `try`:

```ts
      // Phase 2: detail a planned task/sprint just-in-time, then persist so the
      // worker prompt + audit see the full description (and a re-dispatch is stable).
      let live = entry;
      if (deps.jitComplete && needsJitDetail(entry)) {
        try {
          live = await generateItemDetail(entry, deps.jitComplete);
          const blJit = loadBacklog(deps.backlogPath);
          const idx = blJit.entries.findIndex((e) => e.id === entry.id);
          if (idx >= 0) { blJit.entries[idx] = { ...blJit.entries[idx]!, spec: live.spec }; saveBacklogFile(deps.backlogPath, blJit); }
        } catch (e) { /* JIT failure → fall back to the title-only description below */ }
      }
```

Use `live` instead of `entry` in the task branch's description: change
`description: entry.spec.description ?? entry.title,` →
`description: live.spec.description ?? live.title,`.

Add a `process` branch before the task `else`:

```ts
        } else if (entry.kind === 'process') {
          ok = false;
          reason = 'process/workflow execution is not available yet (F3-008 Workflow Composer pending)';
        } else {
```

For persistence, add a tiny helper near the top of the module (or reuse the existing backlog write). If `backlog.ts` exports a writer use it; otherwise:

```ts
import { writeFileSync } from 'node:fs';
function saveBacklogFile(path: string, bl: BacklogFile): void {
  writeFileSync(path, JSON.stringify(bl, null, 2), 'utf-8');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/orchestra/autonomous/execute-dispatcher-jit.test.ts`
Expected: PASS (2 tests). Also run the existing dispatcher suite — `npx vitest run tests/orchestra/autonomous/` → green (back-compat: non-planned entries unaffected). `npx tsc --noEmit` → clean.

- [ ] **Step 5: Commit**

```bash
git add src/orchestra/autonomous/execute-dispatcher.ts tests/orchestra/autonomous/execute-dispatcher-jit.test.ts
git commit -m "feat(autonomous): execute-dispatcher JIT detail + process honest-fail"
```

---

## Task 8: CLI `autonomous plan` subcommand (+ provider wiring + i18n)

**Files:**
- Modify: `src/cli/commands/autonomous.ts`
- Modify: `src/cli/helpers/messages.ts`
- Test: `tests/cli/autonomous-plan.test.ts`

**Design:** A new `handlePlan(opts)` (testable, takes an injectable `complete`) builds the backlog from a goal and prints a table. `registerAutonomous` adds the `plan` subcommand whose action wires the REAL `complete` via the planner provider spawn (`resolveAdapter` + `buildPlannerSpawnArgs` + spawn, mirroring `callBrainPlanner`), reads `.brain/exports/summary.md` for context, and reads artifact seeds via `extractArtifactSeeds`. The loop's `buildEngineRuntime` call in `handleStart` is extended to pass `jitComplete` (the same real `complete`).

- [ ] **Step 1: Write the failing test (handlePlan core, mock complete)**

```ts
// tests/cli/autonomous-plan.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { handlePlan } from '../../src/cli/commands/autonomous.js';

let dir: string | undefined;
afterEach(() => { if (dir) { rmSync(dir, { recursive: true, force: true }); dir = undefined; } });

function root(): string {
  dir = mkdtempSync(join(tmpdir(), 'auto-plan-'));
  mkdirSync(join(dir, '.deckent', 'autonomous'), { recursive: true });
  return dir;
}

const TWO = JSON.stringify({ items: [
  { id: 'a', title: 'A', kind: 'task', scopeDir: 'src/api/', summary: 'do a', policy: 'auto', trigger: 'one-off' },
  { id: 'b', title: 'B', kind: 'capability', scopeDir: 'src/', summary: 'check b', policy: 'approval-required', trigger: { recurring: '* * * * *' }, capabilityTarget: { capability: 'db.query' } },
] });

describe('handlePlan', () => {
  it('writes the planned items to the backlog as pending+planned', async () => {
    const r = root();
    const lines: string[] = [];
    await handlePlan({ goal: 'finish things', root: r, complete: async () => TWO, print: (l) => lines.push(l) });
    const bl = JSON.parse(readFileSync(join(r, '.deckent', 'autonomous', 'backlog.json'), 'utf-8'));
    expect(bl.entries.map((e: any) => e.id)).toEqual(['a', 'b']);
    expect(bl.entries.every((e: any) => e.planned && e.status === 'pending')).toBe(true);
    expect(lines.join('\n')).toContain('a'); // table printed
  });
  it('dry-run prints but does NOT write', async () => {
    const r = root();
    await handlePlan({ goal: 'g', root: r, dryRun: true, complete: async () => TWO, print: () => {} });
    const p = join(r, '.deckent', 'autonomous', 'backlog.json');
    expect(() => readFileSync(p, 'utf-8')).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/cli/autonomous-plan.test.ts`
Expected: FAIL — `handlePlan` not exported.

- [ ] **Step 3: Implement handlePlan + i18n + the subcommand**

Add i18n keys to `src/cli/helpers/messages.ts` (next to the other `autonomous.*` keys):

```ts
  'autonomous.plan_header': { en: 'Planned {count} item(s) from goal:', tr: 'Hedeften {count} madde planlandı:' },
  'autonomous.plan_row': { en: '  [{kind}/{policy}] {id}: {summary}', tr: '  [{kind}/{policy}] {id}: {summary}' },
  'autonomous.plan_written': { en: 'Wrote {count} item(s) to the backlog (pending). Review: deckent autonomous backlog list', tr: '{count} madde backlog’a yazıldı (pending). Gözden geçir: deckent autonomous backlog list' },
  'autonomous.plan_dryrun': { en: 'Dry-run — nothing written.', tr: 'Dry-run — hiçbir şey yazılmadı.' },
  'autonomous.plan_empty': { en: 'The planner returned no valid items.', tr: 'Planner geçerli madde döndürmedi.' },
```

In `src/cli/commands/autonomous.ts`, add the testable handler (export it):

```ts
import { planGoal, plannedItemToBacklogEntry } from '../../orchestra/autonomous/goal-planner.js';
import { extractArtifactSeeds } from '../../orchestra/autonomous/artifact-ref.js';
import type { LlmComplete } from '../../orchestra/autonomous/goal-planner-types.js';

export interface AutonomousPlanOptions {
  goal: string;
  root?: string;
  from?: string;
  policy?: string;     // reserved: default per-item policy (planner may override)
  maxItems?: number;
  dryRun?: boolean;
  lang?: string;
  complete: LlmComplete;            // injected (CLI wires the real provider)
  print?: (line: string) => void;  // injected for tests
}

export async function handlePlan(opts: AutonomousPlanOptions): Promise<void> {
  const lang = getLanguage(opts.lang);
  const root = opts.root ?? resolveProjectRoot();
  const out = opts.print ?? print;
  const seeds = opts.from ? extractArtifactSeeds(opts.from.includes('/') || opts.from.includes('#') ? opts.from : join(root, opts.from)) : undefined;
  const summaryPath = join(root, '.brain', 'exports', 'summary.md');
  const context = existsSync(summaryPath) ? readFileSync(summaryPath, 'utf-8') : undefined;

  const items = await planGoal({ goal: opts.goal, seeds, context, maxItems: opts.maxItems, complete: opts.complete });
  if (items.length === 0) { out(getMessage('autonomous.plan_empty', lang)); return; }

  out(getMessage('autonomous.plan_header', lang, { count: String(items.length) }));
  for (const it of items) out(getMessage('autonomous.plan_row', lang, { kind: it.kind, policy: it.policy, id: it.id, summary: it.summary }));

  if (opts.dryRun) { out(getMessage('autonomous.plan_dryrun', lang)); return; }

  const path = defaultBacklogPath(root);
  const bl = loadBacklog(path);
  for (const it of items) {
    if (bl.entries.some((e) => e.id === it.id)) continue; // dedupe against existing
    bl.entries.push(plannedItemToBacklogEntry(it));
  }
  mkdirSync(dirname(path), { recursive: true });
  atomicWriteFileSync(path, JSON.stringify(bl, null, 2));
  out(getMessage('autonomous.plan_written', lang, { count: String(items.length) }));
}
```

Add the real provider `complete` wiring helper (mirrors `callBrainPlanner`'s spawn; one-shot CLI call so `spawnSync` is acceptable, matching planner.ts):

```ts
import { resolveAdapter, buildPlannerSpawnArgs, parsePlannerResponse } from '../../orchestra/planner.js';
import { spawnSync } from 'node:child_process';

function realPlannerComplete(model: string): LlmComplete {
  return async (prompt: string): Promise<string> => {
    const adapter = resolveAdapter();
    const { command, args } = buildPlannerSpawnArgs(adapter, prompt, model);
    const r = spawnSync(command, args, { encoding: 'utf-8', timeout: 120_000, maxBuffer: 10 * 1024 * 1024 });
    return (r.stdout ?? '') + (r.stderr ?? '');
  };
}
```

> NOTE for the implementer: confirm `buildPlannerSpawnArgs`'s return shape (it returns `{ command, args }` — see planner.ts:331). `parsePlannerResponse` is NOT used here because the goal-planner has its own `parsePlannedItems`; the raw stdout is returned and parsed by `planGoal`.

Register the subcommand in `registerAutonomous(program)` (next to `start`):

```ts
  cmd
    .command('plan <goal>')
    .description('Decompose a high-level goal into a lightweight autonomous backlog (Phase 1)')
    .option('--from <ref>', 'Artifact reference: file or file#section (seed open checklist items)')
    .option('--policy <policy>', 'Default per-item policy', 'auto')
    .option('--max-items <n>', 'Max items (default 30)')
    .option('--model <model>', 'Planner model override')
    .option('--dry-run', 'Generate + print but do not write')
    .option('--root <path>', 'Project root override')
    .option('--lang <code>', 'Language override (en|tr)')
    .action(async (goal: string, o: { from?: string; policy?: string; maxItems?: string; model?: string; dryRun?: boolean; root?: string; lang?: string }) => {
      try {
        const root = o.root ?? resolveProjectRoot();
        const cfg = await loadConfig(root);
        const model = o.model ?? (cfg.modes?.[cfg.mode ?? 'balanced']?.brain_model as string | undefined) ?? 'sonnet';
        await handlePlan({
          goal, root, from: o.from, policy: o.policy,
          maxItems: o.maxItems ? parseInt(o.maxItems, 10) : undefined,
          dryRun: o.dryRun, lang: o.lang, complete: realPlannerComplete(model),
        });
      } catch (err) { printError(err); process.exitCode = 1; }
    });
```

Finally, thread `jitComplete` into the loop: in `handleStart`, the `buildEngineRuntime({...})` call adds `jitComplete: realPlannerComplete(<worker model>)` so dispatched planned entries get JIT detail.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/cli/autonomous-plan.test.ts`
Expected: PASS (2 tests). Then `npx vitest run tests/cli/autonomous-command.test.ts tests/orchestra/autonomous/` → green; `npx tsc --noEmit` → clean.

- [ ] **Step 5: Commit**

```bash
git add src/cli/commands/autonomous.ts src/cli/helpers/messages.ts tests/cli/autonomous-plan.test.ts
git commit -m "feat(autonomous): 'plan' subcommand — goal -> lightweight backlog + JIT wiring"
```

---

## Task 9: Live smoke (manual, gated)

**Files:** none (operational verification).

- [ ] **Step 1: Build**

Run: `npm run build` (or `npm run build:all`).

- [ ] **Step 2: Generate a real plan (dry-run first)**

Run: `node dist/cli/entry.js autonomous plan "add a --version flag to the CLI and a stale-comment sweep of src/cli/" --dry-run`
Expected: a printed table of 1-3 items with sensible `kind` (task) + `scopeDir` (`src/cli/`).

- [ ] **Step 3: Write + inspect**

Run: `node dist/cli/entry.js autonomous plan "<same goal>"` then `node dist/cli/entry.js autonomous backlog list`
Expected: items present, `planned`, `pending`. Inspect `.deckent/autonomous/backlog.json` — entries have `summary`, no `spec.description`.

- [ ] **Step 4: Dispatch one (observe JIT)**

Run `autonomous start` (per-item policy gates apply). Watch a planned task dispatch → confirm `.deckent/autonomous/backlog.json` entry gains a `spec.description` (JIT-filled) and the worker runs. Stop with `autonomous stop`.

- [ ] **Step 5: Record findings**

Note any planner-quality or JIT gaps in `docs/` / memory; this mirrors the 2026-06-16 dogfood loop.

---

## Self-Review

**Spec coverage:** §3 two-phase → Tasks 4-8; §4.1 schema → Task 2; §4.2 taxonomy (process) → Tasks 1,7; §4.3 decomposition + artifact-ref → Tasks 3,4; §5 JIT + fanOut + process → Tasks 6,7; §6 CLI → Task 8; §7 approval (reuses policy gate + Telegram buttons — no new code); §9 testing → each task; §10 boundaries (process honest-fail, no self-verify-loop, no recursion) → Task 7 + scope.

**Placeholder scan:** the one `NOTE for the implementer` in Task 8 points to an exact existing function (`buildPlannerSpawnArgs`, planner.ts:331) to confirm its return shape — not a deferred decision.

**Type consistency:** `PlannedItem`/`LlmComplete` (Task 2) used identically in Tasks 4-8; `plannedItemToBacklogEntry` (Task 5) ↔ `BacklogEntry` fields (Task 1); `needsJitDetail`/`generateItemDetail` (Task 6) ↔ dispatcher (Task 7); `handlePlan` signature stable Task 8.
