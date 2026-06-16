# Autonomous Goal Planner — Design Spec

- **Date:** 2026-06-16
- **Status:** Approved (brainstorming) — ready for implementation plan
- **Arc:** Autonomous grand-vision, first slice (see memory `project_autonomous_first_dogfood_grand_vision`)
- **Author:** Alperen + CC (Opus 4.8)

## 1. Context & Motivation

The autonomous engine works end-to-end (verified dogfood 2026-06-16: backlog → policy-gate →
park → approve → docker worker → 235 LoC real code, disk-verified). But starting it is heavy and
manual: a human hand-writes the backlog entries and the per-task description. The grand vision is
"give it a high-level goal → the system autonomously generates the work items, executes them,
verifies, and continues." The hard constraint the user named: **you cannot write one giant
markdown plan up front — it blows the AI's context.**

This spec is the **first slice** of that vision: the **Goal → Backlog AI Planner**. The remaining
pieces (self-verify-loop strengthening; the process/workflow executor) are separate spec→plan
cycles (see §9).

## 2. Goal & Non-Goals

**Goal:** A two-phase planner that turns a high-level goal (free text + optional artifact reference)
into a lightweight autonomous backlog whose per-item detail is generated just-in-time at dispatch —
covering the full work taxonomy (code task/sprint, enterprise capability/connector ops, recurring
checks, parallel fan-out, and forward-declared workflow/process items).

**Non-Goals (this slice):**
- Building the process/workflow executor (F3-008 Workflow Composer). The planner *emits* `process`
  items; they honest-park until F3-008 lands.
- Strengthening the self-verify-and-continue loop beyond the existing `waitForResult` + worker
  `selfAssessment` (vision piece #2 — separate slice).
- Wiring new reactive detectors. The planner may *emit* reactive triggers, but new detector sources
  are out of scope.
- Recursive depth (a sprint/autonomous run spawning another plan). No auto-recursion.

## 3. Architecture — two phases

```
deckent autonomous plan "<goal>" [--from <artifact-ref>]
   │
   ▼  PHASE 1 (plan): goal + optional artifact + COMPACT project context
   │      → AI → lightweight item list (title, kind, scopeDir, summary, policy, trigger, fanOut?, capabilityTarget?)
   │      → write to backlog.json (status: pending, planned: true; NO full description)
   │      → print the plan for one-time human review (does NOT auto-start)
   │
   ▼  (later: deckent autonomous start)
   │  PHASE 2 (dispatch-time JIT): the loop picks a `planned` entry
   │      → pre-dispatch hook generates the FULL detail JIT (task: worker description + Smoke;
   │        sprint: a DIRECTIVES block; capability: already executable; process: park)
   │      → existing execute-dispatcher runs it (task→runTaskMode / sprint→runSprint /
   │        capability→broker, optionally through ExecutionPool at fanOut.concurrency)
```

**Core idea:** you SEE the whole lightweight plan (e.g. 100 items with their kinds), but every AI
call — Phase-1 decomposition and each Phase-2 detail-gen — is bounded to a single item's context.
The "context never fills" guarantee comes from Phase-2 reading only one item + its scope, never the
whole plan.

## 4. Phase 1 — goal → lightweight backlog

### 4.1 PlannedItem schema (Zod-validated)

```ts
PlannedItem = {
  id:       string,                              // slug derived from title (deterministic, dedup key)
  title:    string,                              // short
  kind:     'task' | 'sprint' | 'capability' | 'process',
  scopeDir: string,                              // single directory, e.g. 'src/api/' (repo-relative, no '..'/absolute)
  summary:  string,                              // one-line WHAT (NOT the full detail)
  policy:   'auto' | 'approval-required' | 'risk-tagged',
  trigger:  'one-off' | { recurring: string /* cron */ } | { reactive: string /* detector */ },
  fanOut?:  { over: string, concurrency: number },        // e.g. "20 agents over tables" → concurrency:20
  capabilityTarget?: { capability: string, connector?: string, args?: Record<string, unknown> },
}
```

Each `PlannedItem` maps to a `BacklogEntry` (status `pending`, a `planned: true` marker, `summary`
retained; `spec.description` left empty — filled JIT in Phase 2). `trigger`/`fanOut`/
`capabilityTarget` map to the existing `BacklogEntry` trigger + (new) optional fields.

### 4.2 Work taxonomy (mode-switching)

| kind | meaning | executes today? |
|------|---------|-----------------|
| `task` | single-file / tightly-scoped code change, one worker | yes (`runTaskMode`) |
| `sprint` | multi-file/multi-module code feature, decomposed into sub-tasks | yes (`runSprint`) |
| `capability` | non-code connector op (`db.query` / `erp.read` / `mail.send` / `http.get`) — table checks, data pulls, enterprise ops | yes (audited capability broker) |
| `process` | multi-step workflow/DAG (read → check → report) | **no — F3-008 pending**; planner emits it, executor honest-parks |

`analysis`/`audit` is not a separate kind — it is a read-only `task` or `capability` (read-only
scope + `auto` policy).

The AI assigns `kind`, `trigger`, `policy`, `fanOut`, and (for capability/process) `capabilityTarget`
from rules in the system prompt: single-file → task; multi-module feature → sprint; connector op →
capability; multi-step flow → process; "continuously …" → `recurring` cron; "N agents over X" →
`fanOut { concurrency: N }`; destructive/irreversible → `approval-required`.

### 4.3 Decomposition engine

- New module `src/orchestra/autonomous/goal-planner.ts`. Reuses `planner.ts`'s AI-call + Zod
  validation infrastructure (provider call → schema-constrained output), with the NEW lightweight
  `PlannedItem` schema (not the full `Task` schema).
- **Compact context only** (no full-codebase dump): the goal text + optional artifact extract +
  `.brain/exports/summary.md` (~4K pre-built summary) + a shallow directory tree sketch.
- **Artifact-ref:** `--from <file>` or `<file>#<section-anchor>`. For MASTER-PLAN, extract that
  section's open `- [ ]` lines as seed items (the AI groups/refines them and assigns kind). A
  free-text goal with no `--from` → the AI generates items from the project context.
- **Validation/safety:** Zod-validate each item (invalid items dropped with a warning, never crash);
  dedup by id slug; cap to `--max-items` (default 30); `scopeDir` must be repo-relative (reject
  `..` / absolute).

## 5. Phase 2 — JIT detail at dispatch

A pre-dispatch hook in the execute-dispatcher fires when a `planned` entry is selected and has no
full detail yet:

| kind | JIT generates | then |
|------|---------------|------|
| `task` | AI generates the full **worker description** (which files/changes, Smoke/Kanıt, "no git commit" constraints) from the item's title+summary+scope + scoped context | fill `entry.spec.description` → `runTaskMode` |
| `sprint` | AI generates a multi-task **DIRECTIVES block** | written to `.tasks`; `runSprint` plans from it |
| `capability` | nothing — `capabilityTarget` is already an executable spec | broker validates + runs |
| `process` | nothing — honest-park (F3-008 pending) | — |

- **fanOut → ExecutionPool:** when `entry.fanOut` is set, the dispatcher sizes/uses `ExecutionPool`
  at `fanOut.concurrency` and submits N parallel jobs. (`execution-pool.ts` exists; the dispatcher
  routes through it.)
- **recurring / reactive:** the engine already re-enqueues recurring entries at their cron cadence
  and ingests reactive events. A `planned` recurring item (e.g. a 15-minute table check) re-fires;
  its detail (`capabilityTarget`) is stable, so JIT detail-gen applies only to `task`/`sprint`.

### Two guarantees
1. **Context-bounded:** JIT reads only the one item + its scope + the compact summary — never the
   whole plan. This is the mechanism that keeps the AI context from filling.
2. **Persist + auditable:** the generated detail is written back into the entry (`spec.description`)
   so it is reviewable and re-dispatch-safe (a recurring re-run is consistent).

## 6. CLI surface

```bash
deckent autonomous plan "<goal>" \
  [--from <file|file#section>]                  # optional artifact reference
  [--policy auto|approval-required|risk-tagged] # default per-item policy
  [--max-items N]                               # plan-size cap (default 30)
  [--provider <p>] [--model <m>]                # planner AI (default: config)
  [--dry-run]                                   # generate + print, do NOT write (preview)
  [--yes]                                       # write without the review pause (unattended)
```

Flow: `plan` writes the lightweight backlog (pending, `planned: true`) and prints it as a table
(`id · kind · trigger · policy · summary`). It does **not** auto-start — the operator reviews with
`backlog list`, edits with `backlog remove`, then runs `autonomous start`.

## 7. Approval model — two layers (reuses existing mechanisms, no new gate)

1. **Plan-time:** the operator sees the generated list (`--dry-run` preview, or `backlog list`
   after write) and edits it before starting.
2. **Run-time:** the existing per-item policy gate — `approval-required`/risky items park during
   execution and are approved via the rich-approval Telegram buttons ([✓ Approve] / [✗ Reject],
   shipped 2026-06-16). The bot directly serves this planner.

## 8. Reuse / new

- **Reuse:** `planner.ts` (AI + Zod), `backlog.ts` (write/validate), `execute-dispatcher.ts`
  (JIT hook + dispatch), `execution-pool.ts` (fan-out), `model-registry`, `provider`.
- **New:** `goal-planner.ts` (Phase 1), a JIT detail-gen helper (Phase 2 hook), the
  `autonomous plan` CLI subcommand, optional `BacklogEntry` fields (`planned`, `summary`, `fanOut`).

## 9. Testing

- **Phase 1 (`goal-planner.ts`):** hermetic with a MOCK AI provider → schema validation,
  kind/trigger assignment, artifact-ref extraction, dedup, max-items cap, scopeDir safety.
- **Phase 2 (JIT hook):** mock AI → the hook fires only for `planned && no-detail` entries,
  generates + persists the description, does NOT re-gen capability items; non-planned entries
  dispatch unchanged (back-compat).
- **fanOut → pool:** the dispatcher sizes the pool to `concurrency`.
- **Live smoke (manual/gated):** one real `autonomous plan "<small goal>"` → inspect the generated
  backlog (real AI), mirroring the 2026-06-16 dogfood.

## 10. Scope boundaries / follow-ups (separate spec→plan cycles)

- **process/workflow executor (F3-008 Workflow Composer)** — planner emits `process`; execution is
  a separate slice; until then `process` items honest-park.
- **Self-verify-and-continue loop** (verification beyond `selfAssessment`) — vision piece #2.
- **New reactive detector sources** — planner may emit reactive; new detectors are separate.
- **Recursive depth** (sprint/autonomous spawning another plan) — out of scope; no auto-recursion.
