# Autonomous Reactive Trigger Bridge — Design Spec

**Date:** 2026-06-07
**Status:** Approved (brainstorm) — pending spec review
**Feature:** F3-009 (Autonomous continuous runtime) / AS-6 — **sub-project 2 of 5: Event-driven trigger layer (first slice)**
**Quality bar:** god-level, enterprise-ready. NOT an MVP.
**Builds on:** sub-project 1 (Autonomous Execution Engine, merged: `5191b8a6` + `c6d8610c`).

---

## 1. Vision & motivation

Sub-project 1 made the autonomous engine drain a backlog of **scheduled / one-off** work
through three-gate governance and execute it via the fleet. This slice adds the **first
reactive source**: the engine reacts to **nervous-system detections** — turning a detected
condition into autonomous work — so it is no longer only schedule/manually driven.

**Culmination goal (project, after the implementation works):** write the MASTER-PLAN
works comprehensively as an autonomous backlog and **hand them to autonomous deckent** as
a live dogfood — the engine runs deckent's own development backlog. The engine is already
dogfood-capable after sub-project 1 (start drives it); this slice + that dogfood are the
path to proving AS-6 on real work. (The dogfood is a *separate* effort tracked in memory
`project_autonomous_engine_direction`; this spec covers only the reactive bridge.)

---

## 2. Goals / Non-Goals

### Goals
1. A **declarative reactive-map** (`.deckent/autonomous/reactive-map.json`) that maps a
   detection (by the detector's `groupKey` and/or a minimum `risk`/`severity`) to a
   backlog-entry template.
2. A **reactive ingester** that, given a normalized reactive event, maps it to a
   `BacklogEntry`, **dedups** against existing pending/running reactive entries, and
   **appends it to the durable backlog** (atomic).
3. A **nervous-detector source** that subscribes to the nervous observer's `'detection'`
   events, normalizes them to reactive events, and feeds the ingester.
4. **Flag-gated wiring** in `deckent autonomous start` (`config.autonomous.reactive.enabled`,
   default-off; additional to `config.autonomous.enabled`) that constructs the observer +
   ingester + source, subscribes, and tears down on stop.
5. Reactive entries flow through the **existing** backlog lifecycle (backlog-trigger →
   3-gate governance → execute → audit → status) — **no change to the cycle or loop**.

### Non-Goals (deferred)
- **Webhook + repo/file-watch sources** — same ingester, next slice (the source is a
  pluggable adapter; only the nervous source is built here).
- **AI work-generation** (deciding *what* to do from a detection) — sub-project 3. Here
  the mapping is **declarative config**, not generated.
- **Custom detector authoring** — users register detectors via the existing nervous
  registry; out of scope.
- **Observer lifecycle depth** — the source takes an injected `EventEmitter`; the live
  `start` wiring is a thin composition step (nervous is already opt-in).

---

## 3. Key design decisions (from brainstorm)

1. **Reactive event → durable backlog entry** (not a transient trigger). A detection
   creates a `BacklogEntry` (`status: pending`, `trigger: {type:'reactive', detector}`)
   and goes through the *same* lifecycle — governance, approval, audit, crash-recovery,
   status. Maximum reuse, observable, restart-safe.
2. **Ingester, not TriggerSource.** Because reactive events become durable entries, the
   bridge is a backlog *writer*, not a `TriggerSource`. The existing backlog-trigger
   drains the written entries. The bridge is decoupled from the loop's trigger-pulling.
3. **Declarative relevance.** Built-in detectors (`stale_worker`, `debt_trend`,
   `agent_routing`, …) are sprint-runtime introspection, not external work signals. Which
   detections are *actionable* is decided by the user's reactive-map, not by the engine.
   This honestly resolves the detector-semantics tension: the mechanism is general; the
   user maps the detectors they care about to entry templates.
4. **Safe by default.** Reactive ingestion is flag-gated (default-off). Reactive entries'
   default policy is template-supplied; the recommended/example default is
   `approval-required` (human-in-the-loop for engine-initiated work).

---

## 4. Architecture

New modules under `src/orchestra/autonomous/reactive/`:

| Module | Responsibility | Depends on |
|--------|----------------|-----------|
| `reactive-types.ts` | `ReactiveEvent {sourceType, risk, severity?, groupKey?, metadata?}` (mirrors the fields a `DetectorResult` actually carries — it has NO detector-type field); `ReactiveRule {match:{groupKey?, minRisk?, minSeverity?}, entryTemplate, dedupKey?}`; `ReactiveMapFile {_version, rules[]}` | — |
| `reactive-map.ts` | `loadReactiveMap(path): ReactiveMapFile` (missing → empty); `validateReactiveRule`; `mapEventToEntry(event, map, idGen): BacklogEntry \| null` (first rule whose specified criteria all match — `groupKey` equality if given, `risk`/`severity` at-or-above threshold if given; instantiates the template) | backlog-types, reactive-types |
| `reactive-ingester.ts` | `makeReactiveIngester({backlogPath, map, now}) → { ingest(event): 'written'\|'deduped'\|'unmatched' }` — map → dedup (skip if a `pending`/`running` entry with the same reactive dedup-key exists) → atomic append via `loadBacklog`/`atomicWriteFileSync` | backlog, reactive-map |
| `nervous-reactive-source.ts` | `makeNervousReactiveSource({observer, ingester}) → { start(), stop() }` — subscribes to `observer.on('detection', (result, event) => ingester.ingest(normalize(result, event)))`; `stop()` removes the listener | reactive-ingester, nervous types |

Wiring (modify `src/cli/commands/autonomous.ts` `handleStart`): when
`config.autonomous.reactive?.enabled`, construct a `NervousObserver` (or accept an
injected one), build the ingester from the loaded reactive-map, build the nervous source,
`start()` it before the loop and `stop()` it in the `finally`. Config addition:
`config.autonomous.reactive: { enabled: boolean; map_path?: string }` (default
`enabled:false`, `map_path: '.deckent/autonomous/reactive-map.json'`).

### Data flow
```
nervous observer 'detection'(result,event)
  → nervous-reactive-source.normalize → ReactiveEvent
  → ingester.ingest: mapEventToEntry (reactive-map) → BacklogEntry?
       → dedup (pending/running same dedupKey? skip)
       → atomic append to backlog.json
  → [next engine tick] existing backlog-trigger drains the entry
  → G1 authority → G2 policy → G3 risk → execute-dispatcher → audit → status
```

### Reactive-map schema (`.deckent/autonomous/reactive-map.json`)
```jsonc
{
  "_version": "1.0",
  "rules": [
    {
      "match": { "groupKey": "debt_trend", "minRisk": "medium" },
      "entryTemplate": {
        "kind": "task",
        "policy": "approval-required",
        "spec": { "description": "Review the rising tech-debt trend flagged by the nervous system." },
        "titlePrefix": "[reactive] debt-trend"
      },
      "dedupKey": "debt_trend"
    }
  ]
}
```
`mapEventToEntry` instantiates the template into a `BacklogEntry`: generated `id`
(prefix + dedup key), `title` from `titlePrefix` + a short detection summary, `kind`/`policy`/
`spec`/`provider?`/`model?` from the template, `trigger: {type:'reactive', detector:<groupKey ?? 'nervous'>}`,
`status: 'pending'`. The detection `risk`/`severity`/`metadata` are folded into `spec.description` for context.

### Dedup
The ingester computes a reactive dedup-key = `rule.dedupKey ?? event.groupKey ?? event.risk`. Before
appending, it scans the backlog; if any entry with `trigger.type==='reactive'` and the same
derived key is already `pending` or `running`, it returns `'deduped'` and writes nothing.
This stops a continuously-firing detector from flooding the backlog.

---

## 5. Safety & invariants

- **Doubly flag-gated:** reactive ingestion runs only when BOTH `config.autonomous.enabled`
  and `config.autonomous.reactive.enabled` are true. Default-off.
- **Human-in-the-loop default:** the example/recommended reactive policy is
  `approval-required` — engine-initiated work parks for approval unless the user
  deliberately sets `auto`/`risk-tagged`.
- **Audit:** every ingest decision (`written`/`deduped`/`unmatched`) is recorded via the
  event-stream (reuse the audit channel).
- **No cycle/loop change:** reactive entries are ordinary backlog entries; all existing
  governance/recovery applies unchanged.

---

## 6. Testing (hermetic)

- `reactive-map.ts`: load (valid / missing→empty / malformed), `validateReactiveRule`,
  `mapEventToEntry` (groupKey match, no-match, risk/severity threshold at-or-above, template instantiation fields).
- `reactive-ingester.ts`: writes an entry on match; returns `'unmatched'` (no write) on no
  rule; returns `'deduped'` (no write) when a pending/running reactive entry with the same
  key exists; atomic append preserves existing entries. tmpdir backlog.
- `nervous-reactive-source.ts`: inject a fake `EventEmitter`; emit `'detection'`; assert
  `ingester.ingest` called with a correctly normalized `ReactiveEvent`; `stop()` removes
  the listener (subsequent emits ignored).
- Wire-level (sim): fake observer → source → ingester → backlog file gains a reactive
  entry → the existing backlog-trigger yields it. Async, tmpdir, no spawnSync.
- Config: `validateConfig` accepts a valid `autonomous.reactive` block and rejects an
  invalid one (enabled must be boolean; map_path must be a string).
- Tier: reactive core = Tier-0 (unit). The `start` reactive wiring touches the CLI surface
  → a Tier-1 smoke (reactive enabled + a seeded reactive-map + a faked/echoed detection →
  a reactive entry appears in the backlog) once built.

---

## 7. Implementation sequencing (for writing-plans)

1. `reactive-types.ts` + `reactive-map.ts` (load/validate/map) + tests.
2. `reactive-ingester.ts` (map + dedup + atomic append) + tests.
3. `nervous-reactive-source.ts` (observer subscription + normalize + stop) + tests.
4. `config.autonomous.reactive` block (config-types + config + validation) + tests.
5. `handleStart` wiring (flag-gated construct/start/stop) + wire-level test + Tier-1 smoke.
6. Ledger: manifest entry + `docs/guide/autonomous-engine.md` reactive section + MASTER-PLAN.

---

## 8. Honest notes

- Built-in detectors are sprint-runtime introspection; meaningful autonomous reaction
  generally needs user-registered detectors or a curated reactive-map of the built-ins
  that *are* actionable (e.g. `debt_trend`). The mechanism is general; relevance is config.
- The nervous observer must be running for detections to flow; the `start` wiring
  constructs/attaches one when reactive is enabled. Deep observer-lifecycle management is
  out of scope (nervous is already opt-in).
- "Connected providers" caveat from sub-project 1 still holds (claude/ollama proven).

---

## 9. References

- Sub-project 1 spec/plan: `docs/superpowers/specs/2026-06-07-autonomous-execution-engine-design.md`,
  `docs/superpowers/plans/2026-06-07-autonomous-execution-engine.md`.
- ADRs: ADR-040 (nervous system), ADR-037 (RBAC), ADR-055 (EffectClass), ADR-079 (PoF).
- Code: `src/nervous/observer.ts` (emits `'detection'`), `src/nervous/detector-registry.ts`,
  `src/orchestra/autonomous/backlog.ts`, `src/orchestra/autonomous/backlog-trigger.ts`,
  `src/orchestra/autonomous/runtime-loop.ts` (`buildEngineRuntime`).
- Memory: `project_autonomous_engine_direction` (incl. the MASTER-PLAN autonomous-dogfood goal).
