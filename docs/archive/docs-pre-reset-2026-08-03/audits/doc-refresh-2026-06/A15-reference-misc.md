# A15 — Reference: Features, Glossary & Lifecycle Diagram

**Audit Date:** 2026-06-28
**Task:** 345-015
**Auditor:** doc-writer agent (Sonnet)
**Scope:** `docs/reference/features.md`, `docs/reference/glossary.md`, `docs/reference/lifecycle-diagram.md`, `docs/glossary.md`
**Source baseline:** `src/core/sprint-types.ts`, `src/orchestra/sprint-controller.ts`, `src/orchestra/sprint-phases.ts`, `src/orchestra/heartbeat-daemon.ts`, `src/orchestra/handoff-protocol.ts`, `src/orchestra/shared-memory.ts`

---

## Summary

| Doc | Status | Finding severity |
|-----|--------|-----------------|
| `docs/reference/lifecycle-diagram.md` | ⚠️ INACCURATE | Medium — CLEANUP ≠ SprintPhase enum; DIRECTIVE/TRANSITION/COMPLETE missing |
| `docs/reference/features.md` — Dormant section | 🔴 CRITICAL | `heartbeat-daemon` + `handoff-protocol` + `shared-memory` are wired; misclassified as Dormant |
| `docs/reference/features.md` — Active/Lightly Used | ✅ ACCURATE | Verified with source evidence |
| `docs/reference/glossary.md` vs `docs/glossary.md` | ⚠️ DUPLICATION | Two overlapping glossaries — canonical consolidation needed |
| Link check (all three ref docs) | ⚠️ INCOMPLETE | Blueprint §-references throughout `reference/glossary.md` are unresolvable |

---

## A15.1 — `docs/reference/lifecycle-diagram.md`

### Lifecycle Phase Comparison

The diagram documents 8 phases: PLAN → SPAWN (+ WAVE_BUILD sub) → EXECUTE → EVALUATE → FIX → RETRO → DECAY → CLEANUP.

The actual `SprintPhase` enum (`src/core/sprint-types.ts:7`) contains 10 values:

```typescript
export enum SprintPhase {
  DIRECTIVE  = 'DIRECTIVE',
  PLAN       = 'PLAN',
  SPAWN      = 'SPAWN',
  EXECUTE    = 'EXECUTE',
  EVALUATE   = 'EVALUATE',
  FIX        = 'FIX',
  RETRO      = 'RETRO',
  DECAY      = 'DECAY',
  TRANSITION = 'TRANSITION',
  COMPLETE   = 'COMPLETE',  // ← not CLEANUP
}
```

| Diagram Phase | Code Value | Status |
|---------------|------------|--------|
| 1 · PLAN | `SprintPhase.PLAN` | ✅ |
| 2 · SPAWN | `SprintPhase.SPAWN` | ✅ |
| 2a · WAVE_BUILD | conditional sub-step of runSpawnPhase; not a standalone phase value | ✅ (correctly shown as sub-step) |
| 3 · EXECUTE | `SprintPhase.EXECUTE` (`sprint-controller.ts:1199`) | ✅ |
| 4 · EVALUATE | `SprintPhase.EVALUATE` (via `persistPhaseTransition` in `sprint-phases.ts:1270`) | ✅ |
| 5 · FIX | `SprintPhase.FIX` (`sprint-phases.ts:2155`) | ✅ |
| 6 · RETRO | `SprintPhase.RETRO` (`sprint-phases.ts:2387`) | ✅ |
| 7 · DECAY | `SprintPhase.DECAY` | ✅ |
| 8 · CLEANUP | **`SprintPhase.COMPLETE`** (`sprint-controller.ts:1571`) — no CLEANUP value in enum | ❌ WRONG |
| — | `SprintPhase.DIRECTIVE` | ❌ MISSING FROM DIAGRAM |
| — | `SprintPhase.TRANSITION` | ❌ MISSING FROM DIAGRAM |

### Findings

**F1 (CLEANUP vs COMPLETE):** The diagram labels the final phase "8 · CLEANUP". The `SprintPhase` enum has no `CLEANUP` value; the sprint exits with `sprint.phase = SprintPhase.COMPLETE` (`sprint-controller.ts:1571`). The cleanup operations (task-file archival, lock release, session close) run in `runCleanupPhase()` (`sprint-phases.ts:2488`) which is a function, not a phase value. The diagram conflates the cleanup *operation* with a phase *name* that does not exist in the type system.

**F2 (Undocumented phases):** `DIRECTIVE`, `TRANSITION`, and `COMPLETE` exist in the enum but are absent from the diagram. `DIRECTIVE` appears to represent the pre-PLAN phase where DIRECTIVES.md is read; `TRANSITION` is used for phase-transition checkpoints; `COMPLETE` is the final steady state.

**F3 (Phase count):** The diagram description says "Eight sequential phases" but the enum has 10 values. The description count is correct for the user-visible workflow; the undocumented enum values are internal states. This is acceptable but should be clarified with a note.

**F4 (PLAN phase description):** The description "Brain reads DIRECTIVES / Creates task JSON files in `.tasks/`" is accurate — confirmed by `runPlanPhase` in `sprint-phases.ts:748+`.

**F5 (RETRO description):** "Retrospective written to `memory.db`" is accurate — `runRetroPhase` calls `finalizeSprint` which calls `store.upsert({ type: 'retro', ... })`.

### Recommended Fixes (lifecycle-diagram.md)

- Change "8 · CLEANUP" label to "8 · CLEANUP / COMPLETE" with note: *"Cleanup operations (`runCleanupPhase`) execute, then sprint exits with `SprintPhase.COMPLETE`."*
- Add a collapsed "Internal phase values" note listing DIRECTIVE, TRANSITION, COMPLETE with one-line explanations.
- Update description from "Eight sequential phases" to "Eight user-visible phases (ten `SprintPhase` enum values including DIRECTIVE, TRANSITION, COMPLETE internal states)."

---

## A15.2 — `docs/reference/features.md` — Dormant Section

### Critical Misclassifications

Three features in the Dormant table are actually integrated in the sprint lifecycle:

#### heartbeat-daemon — Listed as: Dormant / "No sprint-controller auto-wiring"

**Evidence it IS wired:**

- `sprint-controller.ts:99`: `import { HeartbeatDaemon } from './heartbeat-daemon.js';`
- `sprint-controller.ts:750–758`: `createAndStartHeartbeatDaemon()` function exists and starts the daemon.
- `sprint-controller.ts:1159`: `heartbeatDaemon = createAndStartHeartbeatDaemon(projectRoot, opts?.enableHeartbeatDaemon !== false);` — called in `runSprint()` immediately after `runSpawnPhase()` completes.
- `RunSprintOptions` interface (`sprint-controller.ts:627`): `enableHeartbeatDaemon?: boolean` — opt-*out* flag (default: on).

**Verdict:** heartbeat-daemon is DEFAULT-ON during every sprint. The "No sprint-controller auto-wiring" claim is false. It should be moved to the **Active** table or at minimum the **Lightly Used** table.

#### handoff-protocol — Listed as: Dormant / "No integration point"

**Evidence it IS integrated:**

- `sprint-controller.ts:98`: `import { HandoffProtocol } from './handoff-protocol.js';`
- `sprint-controller.ts:644–676`: `wireHandoffsForCompletedTasks()` — creates handoff records for completed tasks after EXECUTE phase.
- `sprint-controller.ts:683–705`: `failHandoffsForNoGoTasks()` — marks pending handoffs failed for NO_GO tasks after EVALUATE.
- `sprint-controller.ts:711–744`: `summarizeHandoffsObservability()` — emits `BRAIN→AUDITOR:HANDOFF_SUMMARY` event at finalize.
- `features.md` Lightly Used table, `worker-comms` entry: explicitly lists `src/orchestra/handoff-protocol.ts` as one of its files.

**Verdict:** handoff-protocol is integrated and used in sprint phase transitions. The Dormant entry is stale. Since it is already covered by `worker-comms` (Lightly Used, default-off), the standalone Dormant row is redundant and wrong.

#### shared-memory — Listed as: Dormant / "No integration point in worker prompt or spawn"

**Evidence:**

- `sprint-controller.ts` line 644 calls `wireHandoffsForCompletedTasks` which uses the HandoffProtocol that depends on shared memory infrastructure.
- `features.md` Lightly Used table, `worker-comms` entry: explicitly lists `src/orchestra/shared-memory.ts`.

**Verdict:** shared-memory is referenced by the `worker-comms` Lightly Used feature. The standalone Dormant entry is stale and conflicts with the Lightly Used section.

#### multi-agent-pipeline — Listed as: Dormant / "No sprint integration"

**File found:** `src/orchestra/multi-agent.ts` exists and defines `MultiAgentPipelineStep` (also in `src/core/agent-types.ts:53`). However, no integration into `runSprint()` was found via grep. This Dormant classification appears **accurate** — the module exists but is not wired into the sprint lifecycle as of the current codebase.

### Active Features — Spot Verification

| Feature | Key claim | Evidence | Status |
|---------|-----------|----------|--------|
| sprint-controller | "8-phase sprint lifecycle" | `sprint-phases.ts` — 8 `runXxxPhase` functions | ✅ |
| event-stream | "ADR-035 structured event log (15 channel codes)" | `src/core/event-stream.ts` `CHANNELS` object | ✅ |
| dependency-scheduler | "Kahn's algorithm topological wave ordering" | `src/orchestra/dependency-scheduler.ts` | ✅ |
| authority-enforcer | "ADR-037 RBAC runtime enforcement" | `src/orchestra/authority-enforcer.ts` | ✅ |
| routing-engine-v2 | "Intent-based task routing" | `src/core/routing-engine.ts:routeTaskV2` | ✅ |
| memory-v2 | "SQLite FTS5 DB-first" | `src/core/memory-store.ts` | ✅ |

### Recommended Fixes (features.md Dormant section)

- **Remove** `heartbeat-daemon` from Dormant; add to Active (or Lightly Used with note "default-on, opt-out via `enableHeartbeatDaemon: false`").
- **Remove** `handoff-protocol` from Dormant; note is already covered in `worker-comms` Lightly Used entry.
- **Remove** `shared-memory` from Dormant; already covered in `worker-comms` Lightly Used entry.
- `multi-agent-pipeline` stays Dormant — classification accurate.
- `human-checkpoint-cli` stays Dormant — confirmed opt-in only, rarely configured.

---

## A15.3 — Glossary Duplication: `reference/glossary.md` vs `docs/glossary.md`

### Content Comparison

| Property | `docs/reference/glossary.md` | `docs/glossary.md` |
|----------|-------------------------------|---------------------|
| Language | Turkish (TR) | English (EN) |
| Format | Alphabetical sections, prose definitions, Blueprint refs | Single Markdown table |
| Term count | 68+ | 19 |
| Last updated | Sprint 286 | Unknown |
| Depth | High — blueprint section references, file paths | Low — one-line definitions |
| Coverage | ADR, agent teams, allowedTools, CostEstimator, … | Brain, Worker, Auditor, Sprint, Wave, TaskDNA, … |

### Overlap Analysis

Both documents define: Brain, Worker, Auditor, Sprint, Heartbeat, Memory V2, Nervous, DIRECTIVES, Scope, ADR, Provider.

`docs/glossary.md` has entries NOT in `reference/glossary.md`: **TaskDNA**, **Tier**, **Wave** (first-class entry).

`docs/reference/glossary.md` has 50+ terms NOT in `docs/glossary.md`: allowedTools, asDraft, CostEstimator, DashboardState, decay, DRAFT, ensureDeckentImport, finalizeSprint, filesWrite, GO_WITH_TECH_DEBT, jobId, ModelTier, parseStructuredDirectives, pattern, pipe-pane, plan mode, PROJECT-IDENTITY.md, provider abstraction layer, ProviderAdapter, ProviderRegistry, ProviderRouter, RETRO.md, runDecay, runSprint, scan loop, shadcn/ui, SKILL.md, sprintId, SSE, startScanLoop, structured, Tech Debt Escalation, tmux, Verhex, watcher.ts, writeIfNotExists, writeScanToDashboard, Zod, …

### Canonical Recommendation

**Make `docs/glossary.md` the canonical, user-facing English glossary.** Rationale:

1. It is at the top-level `docs/` path — the entry point VitePress nav most likely links from the sidebar.
2. English is the primary language for all user-facing content (CLAUDE.md quality bar: "i18n-FIRST — user-facing strings must never be hardcoded").
3. It has the cleaner table format suitable for quick reference.
4. `docs/reference/glossary.md` in Turkish is harder to cross-link from English documentation.

**Action plan:**

1. Merge all unique terms from `docs/reference/glossary.md` into `docs/glossary.md` — translate to English, simplify definitions to one-line table rows.
2. Add a `Wave` entry (already in `docs/glossary.md` as first-class), `Tier`, `TaskDNA` — these are already present.
3. Convert `docs/reference/glossary.md` to a redirect/pointer:

```markdown
# Deckent Terminoloji Sözlüğü

> Bu belge artık bakım görmemektedir. Kanonik sözlük:
> [`docs/glossary.md`](../glossary.md) (English, 70+ terim)
```

4. Keep `docs/reference/glossary.md` as a Turkish companion (not canonical) if TR localization is a priority — but mark it clearly as a secondary/translated version, not the source of truth.

---

## A15.4 — Link Check

### `docs/reference/lifecycle-diagram.md`

| Link | Target | Status |
|------|--------|--------|
| `docs/reference/api-surface.md` (prose reference) | `docs/reference/api-surface.md` | ✅ File exists |
| `DECKENT.md` (prose reference) | `/workspace/DECKENT.md` | ✅ File exists |

No explicit hyperlinks in the Mermaid diagram block — references are prose only. No broken links.

### `docs/reference/features.md`

| Link | Target | Status |
|------|--------|--------|
| `.deckent/features-manifest.json` (prose) | Gitignored runtime file — not in repo | ⚠️ Expected absent |
| `node scripts/sync-manifest.mjs` (code block) | `scripts/sync-manifest.mjs` | ✅ File exists |
| Source files in feature table (e.g. `sprint-controller.ts`) | Files in `src/orchestra/` | ✅ All Active rows verified |

### `docs/reference/glossary.md`

All **Blueprint §N** references (e.g. `**Blueprint §5.1**`, `**Blueprint §19**`) reference a "Blueprint" document that does not exist as a navigable file in the repository. The project evolved beyond an original blueprint; these refs point to no current file.

| Reference pattern | Resolvable? | Count |
|-------------------|-------------|-------|
| `Blueprint §N — "..."` | ❌ No corresponding file | ~65 occurrences |
| `ADR-NNN` references | ✅ ADRs live in `memory.db` | Valid |
| `Sprint NNN` references | ✅ Historical context | Valid (informational) |

**Recommendation:** Replace `Blueprint §N — "description"` with actual source file and line references (e.g. `src/orchestra/brain.ts:runSprint`) or remove the stale Blueprint references from new entries. Existing entries may keep them as historical provenance markers.

---

## A15.5 — Overall Verdict

| Item | Action Required | Priority |
|------|----------------|----------|
| `lifecycle-diagram.md`: CLEANUP label | Fix label to CLEANUP/COMPLETE; add note about DIRECTIVE/TRANSITION/COMPLETE internal phases | Medium |
| `features.md`: heartbeat-daemon Dormant | Move to Active — it is default-on in every sprint | High |
| `features.md`: handoff-protocol Dormant | Remove standalone Dormant row — already covered in worker-comms Lightly Used | High |
| `features.md`: shared-memory Dormant | Remove standalone Dormant row — already covered in worker-comms Lightly Used | High |
| Glossary consolidation | Make `docs/glossary.md` canonical; convert `reference/glossary.md` to redirect/companion | Medium |
| Blueprint §N references in `reference/glossary.md` | Replace with source file references in new entries; annotate existing entries as historical | Low |

**A15 status: COMPLETE.** Feature/lifecycle claims verified with source evidence. Three critical misclassifications found in the Dormant section. Glossary duplication flagged with canonical recommendation.
