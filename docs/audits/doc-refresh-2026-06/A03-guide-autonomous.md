# A03 — Guide: Autonomous & Learning

**Audit date:** 2026-06-28
**Auditor:** w-345-003 (doc-writer, sprint-345)
**Scope:** `docs/guide/autonomous.md`, `docs/guide/autonomous-engine.md`,
`docs/guide/autonomous-operations.md`, `docs/guide/evolution-and-learning.md`
**Ground truth:** `src/orchestra/autonomous/`, `src/orchestra/autonomous-runtime.ts`,
`src/orchestra/autonomous/runtime-loop.ts`, `src/cli/commands/autonomous.ts`,
`src/orchestra/result-collector.ts`, `src/orchestra/outcome-tracker.ts`,
`src/orchestra/promotion-pipeline.ts`, `src/orchestra/sprint-retro-writer.ts`,
`src/orchestra/sprint-metrics.ts`, `src/orchestra/sprint-reporter.ts`,
`src/orchestra/debt-manager.ts`

---

## Executive Summary

| Finding | Count |
|---------|-------|
| Verified correct | 38 |
| Stale / outdated | 2 |
| Dormant features (correctly flagged in docs) | 3 |
| Dormant features (silently undocumented) | 0 |
| Broken links | 0 |
| Heavy overlap requiring action | 3 areas |

**Overall verdict:** The three autonomous docs are largely accurate against the current source.
One material stale claim (§9 reactive "attach-only") was superseded by the N1 fix landed in the
CLI but not reflected in the doc. `evolution-and-learning.md` is accurate with one minor
module attribution note.

---

## 1 · Trio Overlap Assessment

The three autonomous docs exist in a **documented division of concerns**
(`autonomous-engine.md` §Usage cross-refs `autonomous.md` for full usage; `autonomous-operations.md`
§1 links to `autonomous-engine.md` for concepts). However, in practice three content areas
are duplicated without explicit "authoritative copy" labeling:

### Overlap A — Backlog CLI Commands (HIGH duplication)

All three docs contain `deckent autonomous backlog add/list/remove` examples.

| Doc | Coverage |
|-----|----------|
| `autonomous.md` | Full flag table, capability entry, cron entry, MCP parity, expected output strings |
| `autonomous-engine.md` | Minimal 4-command snippet, then "See `docs/guide/autonomous.md` for usage examples" |
| `autonomous-operations.md` | Operational walkthrough with Ollama-focused example, governance summary |

**Verdict:** `autonomous-engine.md` correctly defers to `autonomous.md` with a cross-ref.
`autonomous-operations.md` is not redundant — it adds the "why Ollama first" operational
framing and the governance decision table (auto/approval-required/risk-tagged → what happens).
**Recommendation:** Add a one-line cross-ref note at the top of `autonomous-operations.md §3`
pointing to `autonomous.md` as the authoritative flag reference, making the delegation explicit.
Currently a reader cannot tell which doc owns the flag definition.

### Overlap B — Security / Safety Model (MEDIUM duplication)

`autonomous.md §Security Model` and `autonomous-operations.md §10 Safety Model` cover
the same three safety invariants from different angles.

| Doc | Angle |
|-----|-------|
| `autonomous.md §Security Model` | Invariants stated as technical truths with code-level evidence (default-deny pattern, no-auto-approve no-auto-sprint-start), MCP resolve paths |
| `autonomous-operations.md §10` | Operational checklist (what YOU should do: use Ollama, commit first, bound with max-iterations), plus git-mutation caution note |

**Verdict:** The split is justifiable (reference vs operational), but the two sections are
independent instead of cross-referencing each other. A reader of `autonomous-operations.md`
may miss the invariant detail in `autonomous.md §Security Model`; a reader of `autonomous.md`
may miss the operational discipline in §10.
**Recommendation:** Add `See also: autonomous.md §Security Model` at the start of §10, and a
`See also: autonomous-operations.md §10` note after `autonomous.md §Security Model`.

### Overlap C — Configuration Block (LOW, tolerable)

Both `autonomous.md §Configuration` and `autonomous-engine.md §Configuration` show the same
`.deckent/config.json` JSON block. `autonomous-operations.md §2` shows a subset with `reactive`.

**Verdict:** The full block is shown in `autonomous-engine.md` (architecture reference) and
again in `autonomous.md` (user-facing flag doc). This is reasonable for discoverability.
The `autonomous-operations.md §2` subset differs only by including `reactive.enabled` —
this is actually the most complete operational example (includes the flag a user must set to
enable reactive triggers). No action required, but it's worth noting `autonomous-operations.md §2`
is the **only** place where the `reactive` config block appears in the operations context.

---

## 2 · Engine and TOPP Claims — Verification

### 2.1 Autonomous Engine (autonomous-runtime.ts / runtime-loop.ts)

| Claim | Source Evidence | Verdict |
|-------|----------------|---------|
| Flag-gated `autonomous.enabled: false` default | `cli/commands/autonomous.ts:resolvedConfig.autonomous.enabled` check | ✓ VERIFIED |
| Single cycle: Trigger → Authority → Approval → Action → Audit | `autonomous-runtime.ts:runAutonomousCycle` (lines 173–271) | ✓ VERIFIED |
| Default-deny on unknown requestedBy | `authority-adapter.ts` (RBAC role check, deny on unknown) | ✓ VERIFIED |
| No-auto-approve invariant | `approval-adapter.ts` — no self-accept path; external `accept()`/`reject()` only | ✓ VERIFIED |
| Durable crash recovery (`running` → `pending` on restart) | `execution-pool.ts:recoverBacklog` called in `runtime-loop.ts:buildEngineRuntime` | ✓ VERIFIED |
| buildEngineRuntime is the composition root | `runtime-loop.ts:299` — wires all 5 adapters + backlog + policy gate | ✓ VERIFIED |
| Trigger priority: backlog → scheduled-flow → reactive → work-generator | `runtime-loop.ts:391–409`, `makeHybridTriggerSource` | ✓ VERIFIED |
| applyRecurringReenqueue on every backlog load | `runtime-loop.ts:380`, `backlog.ts:applyRecurringReenqueue` | ✓ VERIFIED |
| enqueueCandidates dedupes by id before yield | `runtime-loop.ts:405`, `backlog.ts:enqueueCandidates` | ✓ VERIFIED |
| kind=capability dispatches via CapabilityRegistry.invoke | `execute-dispatcher.ts` + `runtime-loop.ts:314–328` | ✓ VERIFIED |
| createAuditedCapabilityRegistry wired by default | `runtime-loop.ts:314–328` with writeAuditEvent bridge | ✓ VERIFIED |
| rbac_policy flag gates evaluatePolicy deny path | `runtime-loop.ts:438–449` | ✓ VERIFIED |
| computeEntryEffectClass: read-only verbs → pure, others → critical-irreversible | `policy-gate.ts:computeEntryEffectClass` | ✓ VERIFIED |
| ExecutionPool serial (pool_size 1) | `execution-pool.ts` — single-slot implementation | ✓ VERIFIED |
| G2 park → human approval gate (no auto-approve) | `autonomous-runtime.ts:232–242` (policyGate 'park' → approvalGate.request) | ✓ VERIFIED |
| G1 (RBAC) hard-deny before G2/G3 | `runtime-loop.ts:430–436` — enforceEntryRbac deny → 'deny' decision | ✓ VERIFIED |

### 2.2 TOPP B — Continuous Dispatch (result-collector.ts)

TOPP B ("Task Orchestration Parallel Processing — Batch") is implemented in
`src/orchestra/result-collector.ts` (lines 183–260, 918–960, 1195–1267). It is the
**within-sprint continuous task dispatch planner** (ADR-064), distinct from the
autonomous backlog engine.

**Docs connection:** None of the four docs mention TOPP by name. This is **correct**:
TOPP B is an internal sprint-execution optimization (`planDispatch`, `planContinuous`,
`dispatchTick`) not directly user-observable and unrelated to the autonomous backlog engine.

| TOPP B function | Location | Called from |
|-----------------|----------|------------|
| `planDispatch` (pure planner) | `result-collector.ts:233` | `dispatchTick` closure (:943) |
| `planContinuous` (continuous re-evaluation) | `result-collector.ts:253` | `planDispatch` |
| `planLegacyFifo` (DECKENT_LEGACY_FIFO=1 rollback) | `result-collector.ts:241` | `planDispatch` |
| `dispatchTick` (async entry point) | `result-collector.ts:943` | main loop in `waitForResults` |

`autonomous-engine.md` references ADR-064 in its references list — this is correct: the ADR
is also relevant context for the engine design. No documentation gap here.

---

## 3 · Reactive Trigger — Stale Claim

### Finding: §9 "attach-only" claim is outdated (STALE)

**In `autonomous-operations.md §9`:**
> **Current limitation (honest):** the reactive bridge is **attach-only** today — the nervous
> observer is not driven inside `start`, and built-in detectors are EXECUTE-phase-gated, so
> **live detections do not yet flow**.

**Source evidence (`src/cli/commands/autonomous.ts`):**

The **N1 fix** (labeled `// N1 (F3-009 attach-only fix)` in the CLI source, lines 644–736)
introduced `createNervousSystemIfEnabled` with `{ observerActiveInAnyPhase: true }` inside
`autonomous start`. This builds the **self-driving nervous system** (FS-watch + periodic scan
+ the full detector pipeline + executor with the 30 real action handlers) and passes
`observerActiveInAnyPhase: true` so detectors fire regardless of sprint phase during autonomous
execution.

Separately, the **N2 wiring** (lines 616–641) connects `makeNervousReactiveSource` (which
subscribes to the `NervousObserver`'s 'detection' EventEmitter events) to the reactive-ingester
→ backlog path. The **repo-watch** (`makeRepoWatchReactiveSource`) and **webhook**
(`makeWebhookReactiveSource`) sources are also wired under N2 when their sub-flags are enabled.

**Current state:**
- Built-in nervous detectors: **LIVE** (N1 fix — gated by `config.nervous_system.enabled`)
- Nervous-detection → reactive-map → backlog: **LIVE** when both `nervous_system.enabled` AND
  `autonomous.reactive.enabled` are true (N2 wiring: NervousObserver emits → ingester → backlog)
- Repo-watch → backlog: **LIVE** when `autonomous.reactive.repo_watch.enabled` is true (N2)
- Webhook → backlog: **LIVE** when `autonomous.reactive.webhook.enabled` is true (N2)

The §9 stale note accurately described the state BEFORE the N1+N2 fixes landed, but is now
misleading. **The note should be updated or removed.**

**Same stale note appears in `autonomous-engine.md §Current limitations`:**
> Reactive triggers (sub-project 2 — first slice landed, attach-only)...
> it is **attach-only** in `start`: the nervous observer is not driven...

Both stale notes refer to the same past limitation that has since been fixed.

**Recommendation:** Update both stale §9 notes to reflect that:
- Built-in detectors are live under `nervous_system.enabled`
- Reactive-map bridge is live under `autonomous.reactive.enabled`
- Remaining gap (if any): user-registered detectors / custom detection plugins — verify separately

---

## 4 · Autonomous Subcommand Verification

All subcommands verified in `src/cli/commands/autonomous.ts`:

| Subcommand | Flags | Verified |
|-----------|-------|---------|
| `autonomous start` | `--interval-ms`, `--max-iterations`, `--root`, `--lang` | ✓ |
| `autonomous status` | `--root`, `--lang` | ✓ |
| `autonomous stop` | `--root`, `--lang` | ✓ |
| `autonomous pending` | `--root`, `--lang` | ✓ |
| `autonomous approve <id>` | `--reason`, `--root`, `--lang` | ✓ |
| `autonomous reject <id>` | `--reason`, `--root`, `--lang` | ✓ |
| `autonomous backlog add` | All flags in flag table | ✓ |
| `autonomous backlog list` | `--root`, `--lang` | ✓ |
| `autonomous backlog remove <id>` | Positional OR `--id`, `--root`, `--lang` | ✓ |

MCP parity (`deckent_autonomous` tool in `src/mcp/tools/autonomous.ts`): actions
`status/start/stop/backlog_add/backlog_list/backlog_remove/pending/approve/reject` — all verified.

---

## 5 · Dormant Features

### 5.1 ExecutionPool concurrent pool (DORMANT, correctly documented)

`autonomous-engine.md §Current limitations`: "Concurrency is serial in pass 1 (ExecutionPool
size 1); the interface is built so a bounded concurrent pool swaps in without loop changes."

**Evidence:** `src/orchestra/autonomous/execution-pool.ts` — `ExecutionPool` accepts `size`
parameter and the interface is future-ready, but the live run-one-at-a-time semantics are
confirmed: `pool_size: 1` default in config, and `runAutonomousLoop` calls
`runAutonomousCycle` sequentially (no parallel task execution).

**Verdict:** Correctly flagged as dormant. No doc action needed.

### 5.2 `deckent solo/develop/enterprise` packaging (DORMANT, correctly documented)

`autonomous-engine.md §Current limitations`: "deckent solo/develop/enterprise packaging is a
future modular-install direction."

**Evidence:** No packaging code found in `src/` for these tiers. The engine is designed
tier-agnostic (pluggable adapters) but the packaging itself is not built.

**Verdict:** Correctly flagged as dormant. No doc action needed.

### 5.3 SIEM syslog transport (DORMANT, correctly documented)

`autonomous-operations.md §12.2`:
> A **syslog transport module is ready** (`src/core/siem-transport-syslog.ts`, RFC 5424…)
> but its CLI wire (`--syslog`) is a follow-up.

**Evidence:** `src/core/siem-transport-syslog.ts` exists. No `--syslog` flag found in
`src/cli/commands/` audit subcommand. HTTP transport (`--url`) is live.

**Verdict:** Correctly flagged as dormant. No doc action needed.

---

## 6 · Evolution & Learning — Verification

### 6.1 Outcome Tracker

| Claim | Source | Verdict |
|-------|--------|---------|
| `recordOutcome()` in `src/orchestra/outcome-tracker.ts` | `outcome-tracker.ts:135` | ✓ VERIFIED |
| Updates cumulative agent/skill performance counters | `outcome-tracker.ts:135–220` | ✓ VERIFIED |
| Updates synergy matrix (agent+skill and skill+skill pairs) | `outcome-tracker.ts:261–280` | ✓ VERIFIED |
| Outcomes persisted in `.deckent/routing/learnings.json` | `outcome-tracker.ts:save()` | ✓ VERIFIED |
| Outcomes persisted in `.deckent/routing/outcomes/{sprintId}.json` | `outcome-tracker.ts:saveSprintOutcome()` | ✓ VERIFIED |
| `calculateBonuses(taskDNA)` applies score adjustments | `outcome-tracker.ts:433` | ✓ VERIFIED |
| Last 3 sprints: +3 success bonus, -2 failure penalty | `outcome-tracker.ts:calculateBonuses` logic | ✓ VERIFIED |
| OutcomeTracker called in RETRO phase | `sprint-finalizer.ts:1260–1298` | ✓ VERIFIED |

### 6.2 Promotion Pipeline

| Claim | Source | Verdict |
|-------|--------|---------|
| Promotion criteria: 8 tasks + 85% success rate | `promotion-pipeline.ts:PromotionCriteria` | ✓ VERIFIED |
| `evaluatePromotions(tracker)` returns PromotionResult[] | `promotion-pipeline.ts:91` | ✓ VERIFIED |
| `promote()` copies temp agent/skill to permanent path | `promotion-pipeline.ts:144–211` | ✓ VERIFIED |
| Built-in agents never promoted/demoted | `promotion-pipeline.ts:144` — source guard | ✓ VERIFIED |
| Demotion criteria: 5 tasks min, ≥50% fail rate or <65% over ≥20 tasks | `promotion-pipeline.ts:115–143` | ✓ VERIFIED |
| `demote()` sets `enabled: false` | `promotion-pipeline.ts:222–264` | ✓ VERIFIED |
| `runIdentityMutation()` uses `adaptAgentRuntime()` | `promotion-pipeline.ts:285–346` | ✓ VERIFIED |
| `requiresApproval: true` default — proposals only | `promotion-pipeline.ts:293` | ✓ VERIFIED |
| AgentGenealogy tracks lineage | `promotion-pipeline.ts:12, 175, 208` | ✓ VERIFIED |

### 6.3 Memory V2

| Claim | Source | Verdict |
|-------|--------|---------|
| `buildRetroLearnings()` in `sprint-retro-writer.ts` | `sprint-retro-writer.ts:475` | ✓ VERIFIED |
| `writeRetrospective()` in `sprint-retro-writer.ts` | `sprint-retro-writer.ts:656` | ✓ VERIFIED |
| `generateConfigSuggestions()` | `sprint-metrics.ts:529` | ✓ VERIFIED |
| `collectPromptEvolutionSuggestion()` | `sprint-reporter.ts:319` (not sprint-retro-writer.ts) | ✓ VERIFIED (minor module note below) |
| Memory query uses FTS5 with Turkish normalization | `memory-query.ts` — searchMemory with dual-layer normalization | ✓ VERIFIED |
| DECAY phase trims old entries | `memory-store.ts:decay()` | ✓ VERIFIED |

**Minor note:** `evolution-and-learning.md §Memory V2 §What Gets Written` table credits
`sprint-retro-writer.ts via buildRetroLearnings()` for `memory` entries. The
`collectPromptEvolutionSuggestion()` function lives in `sprint-reporter.ts`, not
`sprint-retro-writer.ts`. The doc's text doesn't explicitly claim the wrong file for this
function, but a reader familiar with the codebase may note the distinction. No correction
needed unless the table is restructured.

### 6.4 TOPP / Continuous Dispatch — Learning Connection

The `evolution-and-learning.md` correctly does NOT document TOPP B. TOPP B is the
within-sprint task dispatch planner in `result-collector.ts` — an internal execution
optimization orthogonal to the learning loop (outcome recording, bonus calculation,
promotion pipeline). The learning loop operates at sprint boundaries; TOPP operates
within a sprint's execution phase.

---

## 7 · Link Verification

| Link | Target | Status |
|------|--------|--------|
| `autonomous.md →` `../reference/mcp-tools.md` | `docs/reference/mcp-tools.md` | ✓ EXISTS |
| `autonomous-engine.md →` `docs/superpowers/specs/2026-06-07-autonomous-execution-engine-design.md` | Confirmed | ✓ EXISTS |
| `autonomous-engine.md →` `docs/superpowers/plans/2026-06-07-autonomous-execution-engine.md` | Confirmed | ✓ EXISTS |
| `autonomous-operations.md →` `./autonomous-engine.md` | Confirmed | ✓ EXISTS |
| `autonomous-operations.md →` `docs/superpowers/specs/2026-06-07-autonomous-execution-engine-design.md` | Confirmed | ✓ EXISTS |
| `autonomous-operations.md →` `docs/superpowers/plans/2026-06-07-autonomous-execution-engine.md` | Confirmed | ✓ EXISTS |

---

## 8 · Recommended Actions

| Priority | Doc | Section | Action |
|---------|-----|---------|--------|
| HIGH | `autonomous-operations.md` | §9 | Remove/update stale "attach-only" limitation note. N1 fix drives `NervousObserver` live inside `start` when `config.nervous_system.enabled`. N2 wires nervous→reactive-map→backlog, repo-watch, and webhook. |
| HIGH | `autonomous-engine.md` | §Current limitations (reactive) | Update matching stale "attach-only" note (same content, same origin). |
| MEDIUM | `autonomous-operations.md` | §3 | Add one-line cross-ref: "For the full flag reference and capability/cron examples, see `autonomous.md §autonomous backlog`." |
| MEDIUM | `autonomous.md` | §Security Model | Add `See also: autonomous-operations.md §10 Safety Model` forward-ref. |
| MEDIUM | `autonomous-operations.md` | §10 | Add `See also: autonomous.md §Security Model` back-ref. |
| LOW | `evolution-and-learning.md` | §Memory V2 §What Gets Written | Clarify that `collectPromptEvolutionSuggestion` lives in `sprint-reporter.ts` (not `sprint-retro-writer.ts`). |

---

## 9 · Findings Not in Scope

- **TOPP B documentation:** Not user-facing; correctly absent from all four guide docs.
- **Debt manager internals:** `src/orchestra/debt-manager.ts` implements fresh-eyes rotation
  and Memory V2 debt writes. `evolution-and-learning.md` covers debt at the conceptual level
  (debt entries written on GO_WITH_TECH_DEBT). No gap.
- **result-evaluator.ts:** Correctly not documented in these user-facing guides (internal
  evaluation logic); referenced in sprint lifecycle docs.

---

*A03 complete. Engine/TOPP/learning claims verified with code evidence; autonomous-trio overlap
explicitly assessed with recommendations; dormant features confirmed against source; all
cross-doc links valid.*
