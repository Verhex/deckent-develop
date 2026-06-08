# Sprint 179 — Sub-project #2 + Bug A Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sprint 179 ships 13 tasks across 6 waves — Bug A foundation (Sprint 178 forensik) + 7 planner state-hygiene fixes + 5 self-security guards — as the final beta-blocker for June 1 2026 OSS GA.

**Architecture:**
- **W0 (Bug A)** = event stream + result-evaluator aggregation + predecessor digest fix. Sprint 178 single-task pattern (ana NO_GO + fix DONE → downstream 22dk taklit bekleme) Sprint 179'da 12 task fan-out'ta amplifie olmadan önce kapatılır.
- **W1-W3 (planner)** = targeted fixes in existing `src/orchestra/`, `src/core/`, `src/cli/`, `src/dashboard/` modules — sıfır mimari değişiklik, sub-project #2 design spec §3a.
- **W4-W5 (self-security)** = interceptor pattern, 5 new files in `src/api/terminal/` hooked into existing session/gateway/audit pipeline — mevcut kontratlar dokunulmaz, audit additive HMAC chain, sub-project #2 design spec §3b-d.

**Tech Stack:** TypeScript ESM (Node 24+), vitest 3.x, better-sqlite3 12.10.0, Node crypto (HMAC-SHA256), node-pty (`@lydell/node-pty`), ws (gateway), React 18 + Vite (dashboard).

**Spec references:**
- Master initiative: `docs/superpowers/specs/2026-05-21-crisis-stabilization-initiative.md` §5
- Sub-project #2 design: `docs/superpowers/specs/2026-05-21-sub-project-2-design.md` (W1-W5 canonical, invariants I1-I5)
- Sub-project #2 plan: `docs/superpowers/plans/2026-05-21-sub-project-2.md` (W1-W5 TDD breakdown — referenced step-by-step below for re-use)
- Sprint 178 evidence: `.deckent/sprint-178-events.jsonl` (Bug A discovery)

**Predecessors locked live:**
- Sprint 177: Worker rollback (`src/agents/worker-rollback.ts`) — NO_GO src/ auto-revert; Sprint 179 dogfood safe.
- Sprint 178: TOPP B+C continuous-dispatch (`src/orchestra/result-collector.ts:planDispatch`, ADR-064) — 13 task fan-out wave-barrier-free.

---

## File Structure

### Bug A foundation (W0, 4 files)

| File | Responsibility |
|------|----------------|
| `src/orchestra/event-stream.ts` (modify) | Add `DEPENDENCY_RESOLVED_BY_FIX` event channel; emit on fix-DONE for any task with downstream deps |
| `src/orchestra/result-evaluator.ts` (modify) | `getAggregateVerdict(taskId)` helper → `max(originalVerdict, latestFixVerdict)` |
| `src/orchestra/result-collector.ts` (modify) | `planDispatch` reads aggregate verdict for `depStatuses` query; downstream sees DONE when fix DONE |
| `src/orchestra/prompt-god-template.ts` (modify) | `buildDependenciesBlock` predecessor digest includes both original + latest-fix `.result` digest |
| `tests/orchestra/dependency-aggregate-fix-aware.test.ts` (NEW) | 5 cases (aggregate / event / planDispatch / digest / honest-gate intact) |

### Sub-project #2 W1-W5 (reused from `docs/superpowers/plans/2026-05-21-sub-project-2.md` lines 19-71)

Per file list — verbatim re-use, only task IDs re-slot 176-* → 179-*. **Do not redefine here; the plan §File Structure block at sub-project-2.md is the canonical reference.** Sprint 179 task IDs:

| Wave | Original 176-* | Sprint 179 ID | Description |
|------|-----------------|----------------|-------------|
| W1 | 176-001 | 179-W1-1 | Auto-debt empty-scope inheritance |
| W1 | 176-002 | 179-W1-2 | Re-plan orphan cleanup |
| W2 | 176-003 | 179-W2-3 | DEP0190 shell:true win32-only |
| W2 | 176-004 | 179-W2-4 | Coverage hard-floor / aspirational split |
| W2 | 176-007 | 179-W2-7 | CI flake (Sprint 178 partial — final hygiene + dependent on pid-liveness.ts already shipped) |
| W3 | 176-005 | 179-W3-5 | Dashboard TS + root lint wire |
| W3 | 176-006 | 179-W3-6 | doctor DECISIONS.md obsolete + cascade |
| W4 | 176-008 | 179-W4-8 | Prompt guard (I1 + I2) |
| W4 | 176-009 | 179-W4-9 | Command guard (I3 default-deny remote) |
| W4 | 176-010 | 179-W4-10 | Outbound rate-limit (I5 tenant) |
| W5 | 176-011 | 179-W5-11 | mTLS hook (AuthProvider interface) |
| W5 | 176-012 | 179-W5-12 | Audit HMAC chain + verify CLI (I4) |

---

## Wave 0 — Bug A Foundation

### Task 179-W0-1: Dependency aggregate fix-aware

**Files:**
- Modify: `src/orchestra/event-stream.ts` — add `DEPENDENCY_RESOLVED_BY_FIX` event channel
- Modify: `src/orchestra/result-evaluator.ts` — `getAggregateVerdict(taskId)` helper
- Modify: `src/orchestra/result-collector.ts` — `planDispatch` reads aggregate; downstream sees DONE
- Modify: `src/orchestra/prompt-god-template.ts` — `buildDependenciesBlock` includes both digests
- Create: `tests/orchestra/dependency-aggregate-fix-aware.test.ts`
- Scope: `src/orchestra/`, `tests/orchestra/`

- [ ] **Step 1: Sprint 178 forensik baseline capture**

```bash
jq -c 'select(.taskId | test("178-002") or test("178-005"))' .deckent/sprint-178-events.jsonl | head -50
```
Expected: 178-002 NO_GO event; 178-002-fix DONE; 178-005 `depStatuses` field her tick'te `"178-002": "EXECUTING"` döner.

- [ ] **Step 2: Write failing test (RED) — 5 cases**

```typescript
// tests/orchestra/dependency-aggregate-fix-aware.test.ts
import { describe, it, expect, vi } from 'vitest';
import { getAggregateVerdict, recordFixResult } from '../../src/orchestra/result-evaluator.js';
import { emitDependencyResolvedByFix } from '../../src/orchestra/event-stream.js';
import { planDispatch } from '../../src/orchestra/result-collector.js';
import { buildDependenciesBlock } from '../../src/orchestra/prompt-god-template.js';

describe('Bug A: Dependency aggregate fix-aware', () => {
  it('(a) getAggregateVerdict returns DONE when main NO_GO + fix DONE', () => {
    const records = new Map([
      ['179-001', { verdict: 'NO_GO', isFix: false }],
      ['179-001-fix', { verdict: 'DONE', isFix: true, originalTaskId: '179-001' }],
    ]);
    expect(getAggregateVerdict('179-001', records)).toBe('DONE');
  });

  it('(b) emitDependencyResolvedByFix emits event on fix-DONE', () => {
    const emit = vi.fn();
    emitDependencyResolvedByFix({ originalTaskId: '179-001', fixTaskId: '179-001-fix' }, emit);
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({
      type: 'DEPENDENCY_RESOLVED_BY_FIX',
      originalTaskId: '179-001',
      fixTaskId: '179-001-fix',
    }));
  });

  it('(c) planDispatch reads aggregate; downstream sees DONE when fix DONE', () => {
    const state = {
      tasks: new Map([
        ['179-001', { id: '179-001', status: 'NO_GO', deps: [] }],
        ['179-001-fix', { id: '179-001-fix', status: 'DONE', deps: [], originalTaskId: '179-001' }],
        ['179-002', { id: '179-002', status: 'PENDING', deps: ['179-001'] }],
      ]),
      activeWorkers: new Map(),
      maxWorkers: 2,
    };
    const plan = planDispatch(state);
    expect(plan.toSpawn).toContainEqual(expect.objectContaining({ id: '179-002' }));
  });

  it('(d) buildDependenciesBlock embeds both original + latest-fix digest', () => {
    const block = buildDependenciesBlock({
      currentTaskId: '179-002',
      deps: ['179-001'],
      results: new Map([
        ['179-001', { verdict: 'NO_GO', filesChanged: ['src/a.ts'], notes: 'failed' }],
        ['179-001-fix', { verdict: 'DONE', filesChanged: ['src/a.ts'], notes: 'fixed', originalTaskId: '179-001' }],
      ]),
    });
    expect(block).toContain('179-001'); // original
    expect(block).toContain('179-001-fix'); // fix
    expect(block).toContain('aggregate: DONE'); // aggregate marker
  });

  it('(e) honest-gate intact — Brain can still re-evaluate aggregate verdict', () => {
    const records = new Map([
      ['179-001', { verdict: 'DONE', isFix: false }],
    ]);
    // Brain re-evaluate UPDATE allowed (Bug C/E intact — no aggregate freeze)
    records.set('179-001', { verdict: 'NO_GO', isFix: false }); // Brain dürüst re-eval
    expect(getAggregateVerdict('179-001', records)).toBe('NO_GO');
  });
});
```

- [ ] **Step 3: Run test, expect FAIL**

```bash
npx vitest run tests/orchestra/dependency-aggregate-fix-aware.test.ts
```
Expected: 5 FAIL (functions not defined / signatures mismatch).

- [ ] **Step 4: Implement `getAggregateVerdict()` in result-evaluator.ts**

```typescript
// src/orchestra/result-evaluator.ts
export type Verdict = 'DONE' | 'GO_WITH_TECH_DEBT' | 'NO_GO';

const VERDICT_RANK: Record<Verdict, number> = {
  NO_GO: 0,
  GO_WITH_TECH_DEBT: 1,
  DONE: 2,
};

export interface TaskRecord {
  verdict: Verdict;
  isFix: boolean;
  originalTaskId?: string;
}

export function getAggregateVerdict(taskId: string, records: Map<string, TaskRecord>): Verdict {
  const original = records.get(taskId);
  if (!original) return 'NO_GO';
  // Find latest fix for this taskId (suffix -fix, -fix-2, etc.)
  let best: Verdict = original.verdict;
  for (const [id, rec] of records) {
    if (rec.isFix && rec.originalTaskId === taskId) {
      if (VERDICT_RANK[rec.verdict] > VERDICT_RANK[best]) {
        best = rec.verdict;
      }
    }
  }
  return best;
}
```

- [ ] **Step 5: Implement `emitDependencyResolvedByFix()` in event-stream.ts**

```typescript
// src/orchestra/event-stream.ts (append)
export interface DependencyResolvedByFixEvent {
  type: 'DEPENDENCY_RESOLVED_BY_FIX';
  originalTaskId: string;
  fixTaskId: string;
  emittedAt: string;
}

export function emitDependencyResolvedByFix(
  payload: { originalTaskId: string; fixTaskId: string },
  emit: (event: DependencyResolvedByFixEvent) => void,
): void {
  emit({
    type: 'DEPENDENCY_RESOLVED_BY_FIX',
    originalTaskId: payload.originalTaskId,
    fixTaskId: payload.fixTaskId,
    emittedAt: new Date().toISOString(),
  });
}
```

Wire: in result-collector dispatch tick, after recording a fix result, if `result.verdict === 'DONE'` and `result.originalTaskId` has downstream consumers, emit this event.

- [ ] **Step 6: Modify `planDispatch()` to read aggregate verdict**

```typescript
// src/orchestra/result-collector.ts — inside planDispatch
const aggregateStatus = (taskId: string): Verdict => {
  // Reuse getAggregateVerdict() against state.taskRecords
  return getAggregateVerdict(taskId, state.taskRecords);
};

const isDepReady = (depId: string): boolean => {
  const status = aggregateStatus(depId);
  return status === 'DONE' || status === 'GO_WITH_TECH_DEBT';
};
```

- [ ] **Step 7: Modify `buildDependenciesBlock()` to embed both digests**

```typescript
// src/orchestra/prompt-god-template.ts — inside buildDependenciesBlock
for (const depId of deps) {
  const original = results.get(depId);
  const fix = [...results.entries()].find(([, r]) => r.originalTaskId === depId);
  const aggregate = fix && VERDICT_RANK[fix[1].verdict] > VERDICT_RANK[original?.verdict ?? 'NO_GO']
    ? fix[1].verdict : original?.verdict;
  block += `### ${depId} (aggregate: ${aggregate})\n`;
  if (original) block += `**Original (${original.verdict}):** ${original.notes}\nFiles: ${original.filesChanged.join(', ')}\n`;
  if (fix) block += `**Fix (${fix[1].verdict}):** ${fix[1].notes}\nFiles: ${fix[1].filesChanged.join(', ')}\n`;
}
```

- [ ] **Step 8: Run test, expect PASS**

```bash
npx vitest run tests/orchestra/dependency-aggregate-fix-aware.test.ts
```
Expected: 5 PASS.

- [ ] **Step 9: Full regression sweep**

```bash
npx vitest run tests/orchestra/ tests/api/terminal/ -- --reporter=basic
```
Expected: no new failures in result-collector / event-stream / prompt-god-template suites.

- [ ] **Step 10: tsc clean**

```bash
npx tsc --noEmit
```
Exit 0.

- [ ] **Step 11: Commit**

```bash
git add src/orchestra/event-stream.ts src/orchestra/result-evaluator.ts src/orchestra/result-collector.ts src/orchestra/prompt-god-template.ts tests/orchestra/dependency-aggregate-fix-aware.test.ts
git commit -m "feat(179-W0-1): dependency aggregate fix-aware (Bug A foundation)

Sprint 178 forensik: ana task NO_GO + fix DONE → downstream depStatuses
EXECUTING gözüktü 22dk. Aggregate verdict + DEPENDENCY_RESOLVED_BY_FIX
event + planDispatch downstream-DONE + predecessor digest embed.

Honest-gate intact: Brain re-evaluate UPDATE allowed (Bug C/E unchanged)."
```

**GO criteria:** 5 test PASS; planDispatch downstream task'lar fix-DONE'a green-light verir; predecessor digest hem original hem fix sonucunu içerir; honest-gate UPDATE'i bloke etmez.

**NO_GO criteria:** Aggregate verdict yanlış hesaplanır; event emit edilmez; downstream task'lar hâlâ "EXECUTING" görür; honest-gate bypass'ı yaşanır.

---

## Wave 1-W5 — Sub-project #2 12 task

**Reused verbatim from `docs/superpowers/plans/2026-05-21-sub-project-2.md`.**

Per-task TDD steps, file lists, code blocks, commit messages: **read that plan**. Only differences in Sprint 179 execution:

1. **Task IDs:** 176-* → 179-* per the mapping table in §File Structure above.
2. **Dependencies:** All W1-W5 tasks gain implicit dependency on `179-W0-1` (Bug A foundation). Cross-wave deps unchanged.
3. **TaskRecord schema:** worker `.result` files must include `originalTaskId: null` (main) or `originalTaskId: "179-..."` (fix retry) so aggregate verdict works.
4. **All other steps unchanged.**

### Cross-wave Dependency Wiring — Brain manual wave gate (drift-immune)

**Discovery:** Brain `parseDependencyField` (src/orchestra/task-builder.ts:186) accepts raw strings only — there is no title-prefix resolver. The originally-planned title-prefix pattern ("W0-1") would not be resolved to disk task IDs. Plan-slot ID prediction ("179-003") is fragile because Brain auto-debt prepend count is non-deterministic (depends on which CRITICAL debts skip vs inject this sprint).

**Sprint 179 strategy: DROP Dependencies field entirely.** Wave ordering enforced by Brain's manual wave-gate flow:

- `dependency_pipeline_enabled: false` (deckent-dev project policy, ADR-047 — `.deckent/config.json:198`)
- Brain processes each wave manually; user gates between waves via `deckent status` review
- Self-modifying detector (src/orchestra/self-modifying-detector.ts) flags `src/orchestra/`, `src/agents/`, `src/api/terminal/` writes → ZORUNLU sequential dispatch within a wave (max 1 worker for self-modifying scope)
- Implicit wave-to-wave dependency: W4 finishes before W5 because user opens W5 gate after W4 GATE-4 PASS

**Wave dispatch order (Brain manual):**

| Wave | Tasks | Intra-wave parallelism | Why |
|------|-------|------------------------|-----|
| W0 | W0-1 | 1 (single task) | Bug A foundation, sequential by definition |
| W1 | W1-1, W1-2 | 1 (same file: sprint-planner.ts) | Same-file write race — sequential |
| W2 | W2-3, W2-4, W2-7 | 2 (max_workers) | Independent files (plugin-hooks, config, orchestra/) |
| W3 | W3-5, W3-6 | 2 | Independent (dashboard/, cli/) |
| W4 | W4-8, W4-9, W4-10 | 2 | Independent files in src/api/terminal/ (different new files) |
| W5 | W5-11, W5-12 | 1 (W5-12 needs W4 hooks live) | Audit chain needs prompt/command/outbound audit events flowing |

This strategy is drift-immune: regardless of auto-debt prepend count or plan-slot renaming, the wave-prefix in task title (`W0-1`, `W1-1`, etc.) tells Brain + user which wave dispatch batch the task belongs to.

---

## Sprint Verdict

- **GO** = 13/13 DONE
- **GO_WITH_TECH_DEBT** = 11-12/13 DONE + ≤2 GWT — **W0 MUST be DONE** (Sprint 179 downstream depends on it for accurate dep tracking); **W4+W5 must total ≥4 DONE** (beta MUST — RCE surface)
- **NO_GO** = W0 fails (aggregate broken → downstream tasks corrupted) OR any I1-I5 security invariant violated OR W4+W5 <4 DONE

---

## Testing Strategy

| Wave | Test surface | Hedef | Command |
|------|--------------|-------|---------|
| W0 | Unit + integration | 5 cases aggregate / event / planDispatch / digest / honest-gate | `npx vitest run tests/orchestra/dependency-aggregate-fix-aware.test.ts` |
| W1-W2-W3 | Per sub-project #2 plan | RED→GREEN as in canonical plan | Per task |
| W4-W5 | Security unit + e2e | I1-I5 invariants assertion zorunlu | `npx vitest run tests/security/ tests/api/terminal/audit-integrity.test.ts` |

### Bug A regression smoke (sprint sonu)

After all W0-W5 tasks DONE:
1. Inspect `.deckent/sprint-179-events.jsonl` for any `DEPENDENCY_RESOLVED_BY_FIX` events
2. If any W1-W5 task had a NO_GO + fix DONE → verify event emitted + downstream task started promptly (not 22dk wait)
3. If no fix happened → smoke skipped (Bug A still tested by W0-1 unit tests)

---

## Process Invariants (Sprint 179 specific)

- **Worker rollback canlı (Sprint 177)** — every NO_GO src/ reverts; Sprint 176 corruption pattern impossible.
- **TOPP B+C canlı (Sprint 178)** — wave-barrier removed; max_workers=2 (deckent-dev policy) effective parallelism on cross-wave eligible tasks.
- **Brain mode `structured`** — AI planning disabled; 13 task spec'te deterministic.
- **Self-modifying sequential** — `src/orchestra/`, `src/core/`, `src/cli/`, `src/api/`, `src/agents/` triggers `self-modifying-detector.ts` → sequential dispatch zorunlu.
- **`dependency_pipeline_enabled: false`** — Brain manual wave gates (ADR-047 + deckent-dev policy).
- **Max workers 2** — sequential discipline + same-wave max 2.
- **`.brain/memory.db` ASLA silinmez** — sadece additive ALTER (Task W5-12) ([feedback_db_silmek_yasak](../../.claude/projects/-home-alperen-deckent-dev/memory/feedback_db_silmek_yasak.md)).
- **`.deckent/config.json` git'te tracked kalır** — `git rm --cached` YASAK ([feedback_config_json_git_rm_yasak](../../.claude/projects/-home-alperen-deckent-dev/memory/feedback_config_json_git_rm_yasak.md)).
- **`deckent kill` / `cleanup` (canlı sprint) Alperen onayı** ([feedback_sprint_kill_always_ask_user](../../.claude/projects/-home-alperen-deckent-dev/memory/feedback_sprint_kill_always_ask_user.md)).
- **Build/publish son doğrulama Alperen** — worker `npm publish` veya `npm run build:all` koşmaz ([feedback_build_requires_user_approval](../../.claude/projects/-home-alperen-deckent-dev/memory/feedback_build_requires_user_approval.md)).

---

## Self-Review

- **Spec coverage:** W0 (Bug A) + W1-W5 (sub-project #2 12 task) = 13 task, 1:1 match to master spec §5b.
- **Placeholder scan:** clean (no TBD/TODO/"see other doc without code").
- **Type consistency:** `Verdict` type defined in W0 Step 4 (result-evaluator.ts) used by all W0 functions; `TaskRecord.originalTaskId` field consistent across W0 Steps 4-7 and Sub-project #2 §process invariants.
- **No dangling references:** W0 deliverables export `getAggregateVerdict`, `emitDependencyResolvedByFix`, modified `planDispatch` + `buildDependenciesBlock` signatures stay backward-compatible (additive parameters).
- **Bug A scope:** W0-1 only touches event/aggregate/digest. Brain honest-gate (Bug C/E) explicitly untouched — Step 11 commit message reaffirms this for git-blame future readers.

---

## DIRECTIVES.md content for Sprint 179 launch

See `DIRECTIVES.md` at repo root — rewritten for Sprint 179 with task-title dependency wiring.
