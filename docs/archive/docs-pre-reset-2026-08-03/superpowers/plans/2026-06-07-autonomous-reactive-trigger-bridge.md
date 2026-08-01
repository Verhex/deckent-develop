# Autonomous Reactive Trigger Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the autonomous engine react to nervous-system detections — a detection becomes a durable backlog entry (via a declarative reactive-map) that flows through the existing engine lifecycle.

**Architecture:** An **ingester** (not a TriggerSource): the nervous observer's `'detection'` events are normalized to `ReactiveEvent`s, mapped to `BacklogEntry`s via a declarative `reactive-map.json`, deduped, and appended to the durable backlog; the existing backlog-trigger drains them. Doubly flag-gated (`config.autonomous.enabled` + `config.autonomous.reactive.enabled`, default-off).

**Tech Stack:** TypeScript (ESM, `.js` suffix — Node16), vitest, no new deps (ADR-010). Spec: `docs/superpowers/specs/2026-06-07-autonomous-reactive-trigger-bridge-design.md`.

**Conventions:** user-facing strings via `getMessage` (en/tr); hermetic tests (tmpdir, async, no spawnSync); TDD; commit footer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

**Verified existing signatures (read, don't re-derive):**
- `src/core/nervous-types.ts`: `DetectorResult { risk: RiskLevel; suggestedActions; shouldNotify: boolean; severity?: Severity; groupKey?: string; metadata?: Record<string,unknown> }`; `RiskLevel = 'low'|'medium'|'high'`; `Severity = 'info'|'warning'|'critical'|'emergency'`. **DetectorResult has NO detector-type field** — match on `groupKey`/`risk`/`severity`.
- `src/nervous/observer.ts`: `NervousObserver extends EventEmitter`; emits `'detection'` as `(result: DetectorResult, event: ObserverEvent)`; ctor `(projectRoot: string, cronIntervalMs?, detectorConfig?, sprintStateProvider?)`.
- `src/orchestra/autonomous/backlog.ts`: `loadBacklog(path): BacklogFile`, `BacklogEntry`/`BacklogFile` in `backlog-types.ts`.
- `src/agents/worker-lifecycle.ts`: `atomicWriteFileSync(path, data)`.
- `src/orchestra/autonomous/backlog-trigger.ts`: `makeBacklogTriggerSource` (drains pending one-off entries — reactive entries are `trigger:{type:'reactive'}` with `status:'pending'`; **NOTE for Task 2:** `queryDue` in `backlog.ts` currently surfaces only `trigger.type==='one-off'` — see Task 2 Step 6).

---

## File Structure

| File | Responsibility | New/Modify |
|------|----------------|------------|
| `src/orchestra/autonomous/reactive/reactive-types.ts` | `ReactiveEvent`, `ReactiveRule`, `ReactiveMapFile`, `EntryTemplate` types + risk/severity rank helpers | Create |
| `src/orchestra/autonomous/reactive/reactive-map.ts` | load/validate map; `mapEventToEntry` | Create |
| `src/orchestra/autonomous/reactive/reactive-ingester.ts` | `makeReactiveIngester` — map + dedup + atomic append | Create |
| `src/orchestra/autonomous/reactive/nervous-reactive-source.ts` | `makeNervousReactiveSource` — observer subscription + normalize + start/stop | Create |
| `src/orchestra/autonomous/backlog.ts` | `queryDue` to also surface `trigger.type==='reactive'` pending entries | Modify |
| `src/core/config-types.ts` + `src/core/config.ts` | `autonomous.reactive` block + validation | Modify |
| `src/cli/commands/autonomous.ts` | flag-gated reactive wiring in `handleStart` | Modify |
| `tests/orchestra/autonomous/reactive/*.test.ts` | hermetic unit tests | Create |

---

## Task 1: Reactive types + map

**Files:**
- Create: `src/orchestra/autonomous/reactive/reactive-types.ts`
- Create: `src/orchestra/autonomous/reactive/reactive-map.ts`
- Test: `tests/orchestra/autonomous/reactive/reactive-map.test.ts`

- [ ] **Step 1: Write `reactive-types.ts`** (pure types + rank helpers)

```typescript
// src/orchestra/autonomous/reactive/reactive-types.ts
// Reactive event + declarative map types. Mirrors the fields a nervous
// DetectorResult actually carries (risk/severity/groupKey/metadata — no detector-type).
import type { RiskLevel, Severity } from '../../../core/nervous-types.js';
import type { BacklogKind, BacklogPolicy } from '../backlog-types.js';

/** A reactive signal normalized from a source (nervous detection today). */
export interface ReactiveEvent {
  sourceType: 'nervous';
  risk: RiskLevel;
  severity?: Severity;
  groupKey?: string;
  metadata?: Record<string, unknown>;
}

/** Backlog-entry template a matched rule instantiates. */
export interface EntryTemplate {
  kind: BacklogKind;
  policy: BacklogPolicy;
  spec: { description?: string; directivesRef?: string; scopeDir?: string };
  provider?: string;
  model?: string;
  titlePrefix?: string;
}

export interface ReactiveRule {
  match: { groupKey?: string; minRisk?: RiskLevel; minSeverity?: Severity };
  entryTemplate: EntryTemplate;
  dedupKey?: string;
}

export interface ReactiveMapFile {
  _version: string;
  rules: ReactiveRule[];
}

const RISK_RANK: Record<RiskLevel, number> = { low: 0, medium: 1, high: 2 };
const SEVERITY_RANK: Record<Severity, number> = { info: 0, warning: 1, critical: 2, emergency: 3 };

export function riskAtLeast(actual: RiskLevel, min: RiskLevel): boolean {
  return RISK_RANK[actual] >= RISK_RANK[min];
}
export function severityAtLeast(actual: Severity | undefined, min: Severity): boolean {
  return actual !== undefined && SEVERITY_RANK[actual] >= SEVERITY_RANK[min];
}
```

- [ ] **Step 2: Write the failing test** `tests/orchestra/autonomous/reactive/reactive-map.test.ts`

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadReactiveMap, validateReactiveRule, mapEventToEntry } from '../../../../src/orchestra/autonomous/reactive/reactive-map.js';
import type { ReactiveEvent, ReactiveRule, ReactiveMapFile } from '../../../../src/orchestra/autonomous/reactive/reactive-types.js';

const rule: ReactiveRule = {
  match: { groupKey: 'debt_trend', minRisk: 'medium' },
  entryTemplate: { kind: 'task', policy: 'approval-required', spec: { description: 'Review debt' }, titlePrefix: '[reactive] debt' },
  dedupKey: 'debt_trend',
};
const map: ReactiveMapFile = { _version: '1.0', rules: [rule] };
const ev = (over: Partial<ReactiveEvent> = {}): ReactiveEvent => ({ sourceType: 'nervous', risk: 'high', groupKey: 'debt_trend', ...over });
const idGen = (): string => 'rx-1';

describe('reactive-map', () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'rmap-')); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it('loadReactiveMap returns empty map when file absent', () => {
    expect(loadReactiveMap(join(dir, 'none.json')).rules).toEqual([]);
  });
  it('loadReactiveMap loads a valid file', () => {
    const p = join(dir, 'm.json'); writeFileSync(p, JSON.stringify(map));
    expect(loadReactiveMap(p).rules).toHaveLength(1);
  });
  it('validateReactiveRule rejects a rule with no match criteria', () => {
    expect(validateReactiveRule({ match: {}, entryTemplate: rule.entryTemplate })).toMatch(/match/);
  });
  it('validateReactiveRule accepts a valid rule', () => {
    expect(validateReactiveRule(rule)).toBeNull();
  });
  it('mapEventToEntry matches by groupKey + risk threshold → entry', () => {
    const entry = mapEventToEntry(ev(), map, idGen);
    expect(entry).not.toBeNull();
    expect(entry!.kind).toBe('task');
    expect(entry!.policy).toBe('approval-required');
    expect(entry!.trigger).toEqual({ type: 'reactive', detector: 'debt_trend' });
    expect(entry!.status).toBe('pending');
  });
  it('mapEventToEntry returns null when groupKey differs', () => {
    expect(mapEventToEntry(ev({ groupKey: 'other' }), map, idGen)).toBeNull();
  });
  it('mapEventToEntry returns null when risk below threshold', () => {
    expect(mapEventToEntry(ev({ risk: 'low' }), map, idGen)).toBeNull();
  });
  it('mapEventToEntry folds risk/severity into description', () => {
    const entry = mapEventToEntry(ev({ severity: 'critical' }), map, idGen);
    expect(entry!.spec.description).toMatch(/Review debt/);
    expect(entry!.spec.description).toMatch(/high|critical/);
  });
});
```

- [ ] **Step 3: Run → FAIL.** `npx vitest run tests/orchestra/autonomous/reactive/reactive-map.test.ts`

- [ ] **Step 4: Write `reactive-map.ts`**

```typescript
// src/orchestra/autonomous/reactive/reactive-map.ts
import { existsSync, readFileSync } from 'node:fs';
import type { BacklogEntry } from '../backlog-types.js';
import {
  type ReactiveEvent, type ReactiveMapFile, type ReactiveRule,
  riskAtLeast, severityAtLeast,
} from './reactive-types.js';

const KINDS = new Set(['task', 'sprint']);
const POLICIES = new Set(['auto', 'approval-required', 'risk-tagged']);

/** Returns first violation, or null when valid. */
export function validateReactiveRule(r: unknown): string | null {
  if (!r || typeof r !== 'object') return 'rule must be an object';
  const rule = r as Record<string, unknown>;
  const m = rule.match as Record<string, unknown> | undefined;
  if (!m || typeof m !== 'object') return 'rule.match must be an object';
  if (m.groupKey === undefined && m.minRisk === undefined && m.minSeverity === undefined) {
    return 'rule.match must specify at least one of groupKey/minRisk/minSeverity';
  }
  const t = rule.entryTemplate as Record<string, unknown> | undefined;
  if (!t || typeof t !== 'object') return 'rule.entryTemplate must be an object';
  if (!KINDS.has(t.kind as string)) return 'rule.entryTemplate.kind must be task|sprint';
  if (!POLICIES.has(t.policy as string)) return 'rule.entryTemplate.policy must be auto|approval-required|risk-tagged';
  if (!t.spec || typeof t.spec !== 'object') return 'rule.entryTemplate.spec must be an object';
  return null;
}

/** Load + validate. Missing file → empty map. */
export function loadReactiveMap(path: string): ReactiveMapFile {
  if (!existsSync(path)) return { _version: '1.0', rules: [] };
  let raw: ReactiveMapFile;
  try {
    raw = JSON.parse(readFileSync(path, 'utf-8')) as ReactiveMapFile;
  } catch (e) {
    throw new Error(`reactive-map at ${path} is not valid JSON: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!Array.isArray(raw.rules)) throw new Error('reactive-map.rules must be an array');
  for (const r of raw.rules) {
    const err = validateReactiveRule(r);
    if (err) throw new Error(`Invalid reactive rule: ${err}`);
  }
  return { _version: typeof raw._version === 'string' ? raw._version : '1.0', rules: raw.rules };
}

function ruleMatches(rule: ReactiveRule, ev: ReactiveEvent): boolean {
  const m = rule.match;
  if (m.groupKey !== undefined && ev.groupKey !== m.groupKey) return false;
  if (m.minRisk !== undefined && !riskAtLeast(ev.risk, m.minRisk)) return false;
  if (m.minSeverity !== undefined && !severityAtLeast(ev.severity, m.minSeverity)) return false;
  return true;
}

/**
 * Map a reactive event to a durable BacklogEntry via the first matching rule.
 * `idGen` supplies the entry id (injected for deterministic tests).
 * Returns null when no rule matches.
 */
export function mapEventToEntry(
  ev: ReactiveEvent,
  map: ReactiveMapFile,
  idGen: () => string,
): BacklogEntry | null {
  const rule = map.rules.find((r) => ruleMatches(r, ev));
  if (!rule) return null;
  const t = rule.entryTemplate;
  const ctx = `[nervous risk=${ev.risk}${ev.severity ? ` severity=${ev.severity}` : ''}${ev.groupKey ? ` group=${ev.groupKey}` : ''}]`;
  const baseDesc = t.spec.description ?? '';
  return {
    id: idGen(),
    title: `${t.titlePrefix ?? '[reactive]'} ${ev.groupKey ?? ev.risk}`.trim(),
    kind: t.kind,
    spec: {
      ...t.spec,
      description: `${baseDesc} ${ctx}`.trim(),
    },
    policy: t.policy,
    provider: t.provider,
    model: t.model,
    trigger: { type: 'reactive', detector: ev.groupKey ?? 'nervous' },
    status: 'pending',
    lastRun: null,
    lastResult: null,
  };
}
```

- [ ] **Step 5: Run → PASS (8 tests). `npx tsc --noEmit` clean.**

- [ ] **Step 6: Commit**

```bash
git add src/orchestra/autonomous/reactive/reactive-types.ts src/orchestra/autonomous/reactive/reactive-map.ts tests/orchestra/autonomous/reactive/reactive-map.test.ts
git commit -m "feat(autonomous): reactive event types + declarative reactive-map (reactive task 1)"
```

---

## Task 2: Reactive ingester (map + dedup + append) + backlog `queryDue` reactive support

**Files:**
- Create: `src/orchestra/autonomous/reactive/reactive-ingester.ts`
- Modify: `src/orchestra/autonomous/backlog.ts` (`queryDue` to surface reactive pending entries)
- Test: `tests/orchestra/autonomous/reactive/reactive-ingester.test.ts`

- [ ] **Step 1: Write the failing test** `tests/orchestra/autonomous/reactive/reactive-ingester.test.ts`

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeReactiveIngester } from '../../../../src/orchestra/autonomous/reactive/reactive-ingester.js';
import { loadBacklog } from '../../../../src/orchestra/autonomous/backlog.js';
import type { ReactiveMapFile } from '../../../../src/orchestra/autonomous/reactive/reactive-types.js';
import type { ReactiveEvent } from '../../../../src/orchestra/autonomous/reactive/reactive-types.js';

const map: ReactiveMapFile = { _version: '1.0', rules: [{
  match: { groupKey: 'debt_trend', minRisk: 'medium' },
  entryTemplate: { kind: 'task', policy: 'approval-required', spec: { description: 'Review debt' } },
  dedupKey: 'debt_trend',
}]};
const ev: ReactiveEvent = { sourceType: 'nervous', risk: 'high', groupKey: 'debt_trend' };

describe('reactive-ingester', () => {
  let dir: string; let backlogPath: string; let n: number;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'ring-')); backlogPath = join(dir, 'backlog.json'); n = 0; });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });
  const ingester = () => makeReactiveIngester({ backlogPath, map, idGen: () => `rx-${++n}` });

  it('ingest on match writes a pending reactive entry', () => {
    expect(ingester().ingest(ev)).toBe('written');
    const bl = loadBacklog(backlogPath);
    expect(bl.entries).toHaveLength(1);
    expect(bl.entries[0]!.trigger).toEqual({ type: 'reactive', detector: 'debt_trend' });
    expect(bl.entries[0]!.status).toBe('pending');
  });
  it('ingest with no matching rule returns unmatched, writes nothing', () => {
    expect(ingester().ingest({ ...ev, groupKey: 'nope' })).toBe('unmatched');
    expect(loadBacklog(backlogPath).entries).toHaveLength(0);
  });
  it('ingest dedups against an existing pending reactive entry with the same key', () => {
    const ing = ingester();
    expect(ing.ingest(ev)).toBe('written');
    expect(ing.ingest(ev)).toBe('deduped');
    expect(loadBacklog(backlogPath).entries).toHaveLength(1);
  });
  it('ingest preserves existing unrelated entries (atomic append)', () => {
    writeFileSync(backlogPath, JSON.stringify({ _version: '1.0', entries: [
      { id: 'keep', title: 't', kind: 'task', spec: {}, policy: 'auto', trigger: { type: 'one-off' }, status: 'pending', lastRun: null, lastResult: null },
    ]}));
    expect(ingester().ingest(ev)).toBe('written');
    const ids = loadBacklog(backlogPath).entries.map(e => e.id);
    expect(ids).toContain('keep');
    expect(ids).toHaveLength(2);
  });
  it('ingest writes a new entry when a same-key reactive entry is already done (not pending/running)', () => {
    const ing = ingester();
    ing.ingest(ev);
    const bl = loadBacklog(backlogPath); bl.entries[0]!.status = 'done';
    writeFileSync(backlogPath, JSON.stringify(bl));
    expect(ing.ingest(ev)).toBe('written'); // prior is done → not a live dup
    expect(loadBacklog(backlogPath).entries).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Write `reactive-ingester.ts`**

```typescript
// src/orchestra/autonomous/reactive/reactive-ingester.ts
import { atomicWriteFileSync } from '../../../agents/worker-lifecycle.js';
import { loadBacklog } from '../backlog.js';
import { mapEventToEntry } from './reactive-map.js';
import type { ReactiveEvent, ReactiveMapFile, ReactiveRule } from './reactive-types.js';

export type IngestOutcome = 'written' | 'deduped' | 'unmatched';

export interface ReactiveIngesterDeps {
  backlogPath: string;
  map: ReactiveMapFile;
  idGen: () => string;
}

/** Reactive dedup-key for an event under a rule. */
function dedupKeyFor(rule: ReactiveRule, ev: ReactiveEvent): string {
  return rule.dedupKey ?? ev.groupKey ?? ev.risk;
}

export function makeReactiveIngester(deps: ReactiveIngesterDeps): { ingest(ev: ReactiveEvent): IngestOutcome } {
  return {
    ingest(ev: ReactiveEvent): IngestOutcome {
      const rule = deps.map.rules.find((r) => {
        const m = r.match;
        if (m.groupKey !== undefined && ev.groupKey !== m.groupKey) return false;
        // risk/severity thresholds are re-checked inside mapEventToEntry; this
        // pre-find only narrows by groupKey so the dedup-key is rule-accurate.
        return true;
      });
      const entry = mapEventToEntry(ev, deps.map, deps.idGen);
      if (!entry || !rule) return 'unmatched';

      const key = dedupKeyFor(rule, ev);
      const bl = loadBacklog(deps.backlogPath);
      const liveDup = bl.entries.some((e) =>
        e.trigger.type === 'reactive' &&
        (e.status === 'pending' || e.status === 'running') &&
        e.trigger.detector === (ev.groupKey ?? 'nervous') &&
        // dedup by the same derived key (encoded in detector + a tag)
        e.title === entry.title,
      );
      if (liveDup) return 'deduped';

      bl.entries.push(entry);
      atomicWriteFileSync(deps.backlogPath, JSON.stringify(bl, null, 2));
      return 'written';
    },
  };
}
```

> **Note for executor:** the dedup check above keys on `trigger.detector` + `title` because `BacklogEntry` has no free-form dedup field. If you prefer an explicit signature, add an optional `reactiveKey?: string` to `BacklogEntry` (backlog-types.ts) set from `dedupKeyFor`, and dedup on that — cleaner, but touches the shared type. Pick one; the test asserts behavior (dedupes the identical repeated event), not the mechanism. Keep `mapEventToEntry`'s `key` consistent with whatever the dedup reads.

- [ ] **Step 4: Run ingester test → some pass; the "done → writes new" + dedup tests depend on `title` uniqueness.** If using the title-based dedup, ensure `mapEventToEntry` produces a stable title for the same event (it does: `titlePrefix + groupKey`). Verify all 5 pass.

- [ ] **Step 5: `queryDue` reactive support** — `src/orchestra/autonomous/backlog.ts`

The current `queryDue` only surfaces `trigger.type==='one-off'`. Reactive entries are `trigger.type==='reactive'` + `status:'pending'` and must also be drained. Add the failing test to `tests/orchestra/autonomous/backlog.test.ts`:

```typescript
  it('queryDue also surfaces pending reactive entries', () => {
    const bl = { _version: '1.0', entries: [
      { id: 'r', title: 't', kind: 'task' as const, spec: {}, policy: 'auto' as const, trigger: { type: 'reactive' as const, detector: 'x' }, status: 'pending' as const, lastRun: null, lastResult: null },
    ]};
    expect(queryDue(bl, new Date()).map(e => e.id)).toEqual(['r']);
  });
```
Then update `queryDue` in `backlog.ts`:
```typescript
export function queryDue(bl: BacklogFile, _now: Date): BacklogEntry[] {
  return bl.entries.filter((e) =>
    e.status === 'pending' && (e.trigger.type === 'one-off' || e.trigger.type === 'reactive'));
}
```
(Update the existing JSDoc comment to note reactive entries are also surfaced; recurring timing still owned by the scheduler.)

- [ ] **Step 6: Run `npx vitest run tests/orchestra/autonomous/reactive/reactive-ingester.test.ts tests/orchestra/autonomous/backlog.test.ts` → all pass. `npx tsc --noEmit` clean.**

- [ ] **Step 7: Commit**

```bash
git add src/orchestra/autonomous/reactive/reactive-ingester.ts src/orchestra/autonomous/backlog.ts tests/orchestra/autonomous/reactive/reactive-ingester.test.ts tests/orchestra/autonomous/backlog.test.ts
git commit -m "feat(autonomous): reactive ingester (map+dedup+append) + queryDue reactive support (reactive task 2)"
```

---

## Task 3: Nervous reactive source (observer subscription)

**Files:**
- Create: `src/orchestra/autonomous/reactive/nervous-reactive-source.ts`
- Test: `tests/orchestra/autonomous/reactive/nervous-reactive-source.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { EventEmitter } from 'node:events';
import { makeNervousReactiveSource } from '../../../../src/orchestra/autonomous/reactive/nervous-reactive-source.js';
import type { ReactiveEvent } from '../../../../src/orchestra/autonomous/reactive/reactive-types.js';
import type { DetectorResult } from '../../../../src/core/nervous-types.js';

const detection = (over: Partial<DetectorResult> = {}): DetectorResult => ({
  risk: 'high', suggestedActions: [], shouldNotify: true, severity: 'critical', groupKey: 'debt_trend', ...over,
});

describe('nervous-reactive-source', () => {
  it('normalizes a detection and forwards it to the ingester on start()', () => {
    const observer = new EventEmitter();
    const got: ReactiveEvent[] = [];
    const source = makeNervousReactiveSource({ observer, ingester: { ingest: (ev) => { got.push(ev); return 'written'; } } });
    source.start();
    observer.emit('detection', detection(), { foo: 1 });
    expect(got).toHaveLength(1);
    expect(got[0]).toMatchObject({ sourceType: 'nervous', risk: 'high', severity: 'critical', groupKey: 'debt_trend' });
  });
  it('stop() removes the listener — later detections are ignored', () => {
    const observer = new EventEmitter();
    const got: ReactiveEvent[] = [];
    const source = makeNervousReactiveSource({ observer, ingester: { ingest: (ev) => { got.push(ev); return 'written'; } } });
    source.start(); source.stop();
    observer.emit('detection', detection(), {});
    expect(got).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Write `nervous-reactive-source.ts`**

```typescript
// src/orchestra/autonomous/reactive/nervous-reactive-source.ts
import type { EventEmitter } from 'node:events';
import type { DetectorResult } from '../../../core/nervous-types.js';
import type { ReactiveEvent } from './reactive-types.js';
import type { IngestOutcome } from './reactive-ingester.js';

export interface NervousReactiveSourceDeps {
  /** The nervous observer (EventEmitter that emits 'detection'). */
  observer: EventEmitter;
  ingester: { ingest(ev: ReactiveEvent): IngestOutcome };
}

function normalize(result: DetectorResult): ReactiveEvent {
  return {
    sourceType: 'nervous',
    risk: result.risk,
    severity: result.severity,
    groupKey: result.groupKey,
    metadata: result.metadata,
  };
}

/** Subscribe a reactive ingester to the nervous observer's 'detection' events. */
export function makeNervousReactiveSource(deps: NervousReactiveSourceDeps): { start(): void; stop(): void } {
  const handler = (result: DetectorResult): void => {
    deps.ingester.ingest(normalize(result));
  };
  return {
    start(): void { deps.observer.on('detection', handler); },
    stop(): void { deps.observer.off('detection', handler); },
  };
}
```

- [ ] **Step 4: Run → PASS (2 tests). `npx tsc --noEmit` clean.**

- [ ] **Step 5: Commit**

```bash
git add src/orchestra/autonomous/reactive/nervous-reactive-source.ts tests/orchestra/autonomous/reactive/nervous-reactive-source.test.ts
git commit -m "feat(autonomous): nervous reactive source — observer 'detection' → ingester (reactive task 3)"
```

---

## Task 4: Config `autonomous.reactive` block

**Files:**
- Modify: `src/core/config-types.ts` (add `reactive` to the `autonomous` type)
- Modify: `src/core/config.ts` (default + validation)
- Test: `tests/core/config.test.ts`

- [ ] **Step 1: Write the failing test** — add to `tests/core/config.test.ts` (match the existing `validateConfig — autonomous engine` block style):

```typescript
describe('validateConfig — autonomous.reactive', () => {
  it('accepts a valid reactive block', () => {
    const cfg = { ...createDefaultConfig(), autonomous: { enabled: true, reactive: { enabled: true, map_path: '.deckent/autonomous/reactive-map.json' } } };
    expect(() => validateConfig(cfg)).not.toThrow();
  });
  it('rejects non-boolean reactive.enabled', () => {
    const cfg = { ...createDefaultConfig(), autonomous: { enabled: true, reactive: { enabled: 'yes' } } };
    expect(() => validateConfig(cfg as never)).toThrow(/autonomous.reactive.enabled/);
  });
  it('rejects non-string reactive.map_path', () => {
    const cfg = { ...createDefaultConfig(), autonomous: { enabled: true, reactive: { enabled: true, map_path: 5 } } };
    expect(() => validateConfig(cfg as never)).toThrow(/autonomous.reactive.map_path/);
  });
});
```
(Confirm the exact import names `createDefaultConfig`/`validateConfig`/`ConfigValidationError` used by the neighbouring autonomous-config tests; match them.)

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement.** In `config-types.ts`, extend the `autonomous?` type (both `DeckentConfig` and `ResolvedConfig` per the existing pattern) with:
```typescript
  reactive?: { enabled: boolean; map_path?: string };
```
In `config.ts` `createDefaultConfig`, add to the `autonomous` default:
```typescript
    reactive: { enabled: false, map_path: '.deckent/autonomous/reactive-map.json' },
```
In `validateConfig`, inside the existing `if (config.autonomous !== undefined)` block, add:
```typescript
  const reactive = config.autonomous.reactive;
  if (reactive !== undefined) {
    if (typeof reactive.enabled !== 'boolean') errors.push('autonomous.reactive.enabled must be a boolean');
    if (reactive.map_path !== undefined && typeof reactive.map_path !== 'string') errors.push('autonomous.reactive.map_path must be a string');
  }
```
(Adapt `errors.push` vs throw to match how the surrounding autonomous validation reports — read it.)

- [ ] **Step 4: Run `npx vitest run tests/core/config.test.ts` → pass. `npx tsc --noEmit` clean.**

- [ ] **Step 5: Commit**

```bash
git add src/core/config-types.ts src/core/config.ts tests/core/config.test.ts
git commit -m "feat(autonomous): config.autonomous.reactive block (flag-gated, default-off) (reactive task 4)"
```

---

## Task 5: Wire reactive ingestion into `deckent autonomous start`

**Files:**
- Modify: `src/cli/commands/autonomous.ts` (`handleStart`)
- Test: `tests/cli/autonomous-command.test.ts` (wire-level)

- [ ] **Step 1: Write the failing wire-level test** — add to `tests/cli/autonomous-command.test.ts` (uses the same sandbox-home + root setup as the existing handleStart tests; READ them to match). Inject a fake observer is not possible through the CLI, so this test verifies the **flag-gated construction path** does not throw and that with reactive disabled nothing extra happens:

```typescript
  it('start with reactive disabled runs the engine loop unchanged (no reactive wiring)', async () => {
    // config: autonomous.enabled true, reactive absent/disabled
    writeConfig(root, { autonomous: { enabled: true } }); // match the helper the other tests use
    await expect(handleStart({ root, lang: 'en', intervalMs: '1', maxIterations: '1' })).resolves.toBeUndefined();
  });

  it('start with reactive enabled but empty reactive-map still runs + tears down cleanly', async () => {
    writeConfig(root, { autonomous: { enabled: true, reactive: { enabled: true } } });
    await expect(handleStart({ root, lang: 'en', intervalMs: '1', maxIterations: '1' })).resolves.toBeUndefined();
  });
```
(Match `writeConfig`/root/sandbox-home to the existing tests in the file. The point: reactive-enabled start constructs the observer+ingester+source, starts the loop for 1 iteration, and tears down without error — on an empty backlog/map nothing executes.)

- [ ] **Step 2: Run → FAIL** (reactive wiring not present).

- [ ] **Step 3: Implement the wiring in `handleStart`.** After the engine `deps` are built and before the loop, add (imports: `loadReactiveMap`, `makeReactiveIngester`, `makeNervousReactiveSource`, `NervousObserver`):

```typescript
  // Reactive ingestion (sub-project 2) — flag-gated, additional to autonomous.enabled.
  let reactiveSource: { start(): void; stop(): void } | null = null;
  if (config.autonomous.reactive?.enabled) {
    const mapPath = join(root, config.autonomous.reactive.map_path ?? '.deckent/autonomous/reactive-map.json');
    const reactiveMap = loadReactiveMap(mapPath);
    let rxCounter = 0;
    const ingester = makeReactiveIngester({
      backlogPath,
      map: reactiveMap,
      idGen: () => `rx-${new Date().toISOString()}-${++rxCounter}`,
    });
    const observer = new NervousObserver(root);
    reactiveSource = makeNervousReactiveSource({ observer, ingester });
    reactiveSource.start();
    // NOTE: the observer must be driven to emit detections. NervousObserver's
    // existing tick/observe mechanism applies; deep observer lifecycle is out of
    // scope (nervous is opt-in). The source is attached here; entries it writes
    // are drained by the engine's backlog-trigger on subsequent ticks.
  }
```
Then in the existing `finally` block, add `reactiveSource?.stop();`.

> **Executor note:** `NervousObserver(root)` construction + how it emits 'detection' uses the existing nervous machinery; if constructing/driving it in a short-lived CLI is non-trivial, keep the source ATTACHED (start/stop) and document that detections flow only while the observer ticks. Do NOT build a new observer-driving loop here (out of scope). If `NervousObserver`'s constructor or detection-emission needs more than `(root)`, read `src/nervous/observer.ts` and pass what it needs; if it cannot emit without a running sprint, note this honestly in the result and the smoke (Step 5) becomes "reactive wiring attaches + tears down cleanly" rather than "a real detection produces an entry".

- [ ] **Step 4: Run `npx vitest run tests/cli/autonomous-command.test.ts` → pass. `npx tsc --noEmit` clean.**

- [ ] **Step 5: DEFER the Tier-1 smoke to a build** (controller coordinates). The smoke (post-build): `config.autonomous.enabled=true` + `reactive.enabled=true` + a seeded `reactive-map.json` + `autonomous start --max-iterations 1` → starts + tears down cleanly (exit 0); if the observer can be made to emit a matching detection, assert a reactive entry appears in `backlog.json`. Otherwise the smoke proves clean attach/teardown.

- [ ] **Step 6: Commit**

```bash
git add src/cli/commands/autonomous.ts tests/cli/autonomous-command.test.ts
git commit -m "feat(autonomous): flag-gated reactive ingestion wiring in autonomous start (reactive task 5)"
```

---

## Task 6: Ledger (manifest + guide + master-plan)

**Files:**
- Modify: `scripts/sync-manifest.mjs` (autonomous-runtime entry: add reactive files + note reactive landed) → regenerate `.deckent/features-manifest.json`
- Modify: `docs/guide/autonomous-engine.md` (reactive section + update limitations: nervous reactive bridge landed; webhook/repo-watch remain)
- Modify: `docs/MASTER-PLAN.md` (F3-009: sub-project 2 first slice landed)

- [ ] **Step 1** — add the 4 reactive files to the `autonomous-runtime` entry's `files` in `scripts/sync-manifest.mjs`; update its description to note the nervous reactive bridge; trim the parityGap (reactive nervous source landed; webhook/repo-watch + MCP tool remain). Run `node scripts/sync-manifest.mjs`. Run `npx vitest run tests/core/features-manifest.test.ts` → pass.

- [ ] **Step 2** — add a "Reactive triggers" section to `docs/guide/autonomous-engine.md` (reactive-map schema, flag-gate, nervous bridge, dedup, honest detector-semantics note) + update *Current limitations* (nervous reactive landed; webhook/repo-watch next).

- [ ] **Step 3** — update `docs/MASTER-PLAN.md` F3-009: sub-project 2 first slice (nervous reactive bridge) landed; remaining = webhook/repo-watch + sub-projects 3-5.

- [ ] **Step 4: Commit**

```bash
git add scripts/sync-manifest.mjs .deckent/features-manifest.json docs/guide/autonomous-engine.md docs/MASTER-PLAN.md
git commit -m "docs(autonomous): nervous reactive bridge landed — manifest + guide + master-plan (reactive task 6)"
```

---

## Self-Review (plan author)

**Spec coverage:** §4 reactive-types/reactive-map → Task 1; reactive-ingester → Task 2; nervous-reactive-source → Task 3; config block → Task 4; start wiring → Task 5; ledger → Task 6. §3 decisions (durable entry, ingester-not-TriggerSource, declarative relevance, safe-default) all realized. §5 safety (double flag-gate, approval-required default via template, audit) — flag-gate in Task 4/5; audit is via the existing engine path (reactive entries are ordinary entries). §6 tests — each task is TDD. **One spec item to call out:** §5 "every ingest decision recorded via event-stream" — the ingester writes entries but does not itself call `writeEvent`; ingest-decision audit is **deferred/implicit** (the entry's execution is audited by the engine). If explicit ingest-audit is required, add a `writeEvent` call in the ingester — noted as a possible Task-2 addition, kept out to honor YAGNI unless wanted.

**Placeholder scan:** none. The two "Executor note" blocks (dedup mechanism in Task 2; observer-driving in Task 5) are explicit decisions with a concrete default + an alternative, not TODOs.

**Type consistency:** `ReactiveEvent`/`ReactiveRule`/`ReactiveMapFile`/`EntryTemplate` (Task 1) used identically in Tasks 2-3. `mapEventToEntry(ev, map, idGen)` (Task 1) called the same in Task 2. `IngestOutcome` (Task 2) imported in Task 3. `makeReactiveIngester`/`makeNervousReactiveSource` signatures consistent across tasks and the Task-5 wiring. `queryDue` reactive change (Task 2) matches the engine's drain expectation.

**Scope:** single slice (nervous source only); webhook/repo-watch + work-generation explicitly deferred. One implementation plan.

---

## Open executor decisions (pin during execution)

1. **Dedup mechanism** (Task 2): title-based vs an explicit `reactiveKey?` field on `BacklogEntry`. Default = title-based (no shared-type change). If a team prefers an explicit key, add the field.
2. **Observer driving in `start`** (Task 5): attach-only (default; detections flow while the observer ticks via existing machinery) vs a dedicated detection pump. Default attach-only; do not build a new pump (out of scope). Adjust the Tier-1 smoke accordingly (clean attach/teardown if real detections can't be produced in a short CLI run).
3. **Explicit ingest audit** (Task 2): add `writeEvent` per ingest decision, or rely on the entry's downstream execution audit. Default = rely on downstream; add explicit only if wanted.
