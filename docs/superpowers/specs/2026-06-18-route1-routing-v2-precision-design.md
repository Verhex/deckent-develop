# ROUTE-1 — routing-v2 precision (SSOT-consume + kind/intent-gated scoring)

- **Date:** 2026-06-18
- **Arc:** ARC-E (Orchestration Intelligence) — master-plan §18 CORE-UNIFORMITY follow-up, §1266 ROUTE-1/"C"
- **Status:** design approved → writing-plans next
- **Scope class:** Tier-0 (internal core logic — `src/core/` routing) → unit-test-sufficient + one ground-truth regression replay
- **Predecessor:** MODEL-GUARD (`src/core/model-tier-guard.ts`, commit `448607fb`) closed the model *tier* axis; ROUTE-1 closes the agent/skill *selection* axis.

## 1. Problem (live dogfood evidence)

An autonomous dogfood task — a **stale-comment cleanup** sweep — was routed to
`assignedAgent: api-builder` (wrong; should be `code-reviewer` / `refactorer` /
`code-simplifier`) with `assignedSkills: []` (empty). Root cause traced in code:

`routeTaskV2` (`src/core/routing-engine.ts:267`) takes only `{ title, description, scope }`
and **re-derives** intent via `classifyIntent(task)` (`:280`) — it **ignores the canonical
`task.type` (TaskKind)** that `task-builder.ts:470` already populated (`WM-2b`,
`canonicalKind = rubricTypeToKind(detectTaskType({scope}))`, `:452`). So two parallel intent
derivations exist and diverge:

- `task.type` (TaskKind, scope-shape SSOT) — used for **provider** routing (`task-router.ts:282`)
  and model-tier-guard.
- `taskDNA.intent.primary` (keyword+scope, `classifyIntent`) — used for **agent/skill** selection.

The agent/skill path uses the weaker signal, and two **intent-blind, path-derived bonuses**
then corrupt it:

| Bonus | Constant | Source | Misfire |
|-------|----------|--------|---------|
| Domain-match | `DOMAIN_MATCH_BONUS` (+3) | `TASK_DOMAIN_TO_AGENT_ID['api']='api-builder'` (`:126`) | any task touching `src/api/` → +3 to api-builder |
| User-surface | `USER_SURFACE_BONUS` (+8) | `SURFACE_DOMAIN_TO_AGENT_ID['api']='api-builder'` (`:193`) | same path → +8 to api-builder |

Plus a **second override locus**: `task-router.ts:257`
`const surfaceAgent = applyUserSurfaceBonus(task); const agent = surfaceAgent ?? task.assignedAgent`
— a hard surface-owner override at the provider layer that can replace a correct `assignedAgent`.

### Why `api-builder` wins (comment-sweep touching `src/api/x.ts`)

| Agent | Activation | Domain bonus | Surface bonus | Total |
|-------|-----------|--------------|---------------|-------|
| **api-builder** | `domains.$contains('api')` → 8 | +3 | (+8 possible) | **11–19** ✅ |
| refactorer | `intent.primary='refactor'` → 10 | 0 (`INTENT_TO_AGENT_DOMAIN` has no `refactor`, `:112-118`) | 0 | 10 ❌ |
| code-reviewer | `intent.primary='refactor'` → 8 | 0 | 0 | 8 ❌ |

### Why `assignedSkills` is empty

`selectBestSkills` requires `finalScore >= skillMinScore (3)`. `getIntentPriorityBonus`
(`:879`) draws from `INTENT_TO_SKILL_ID` (`:839`), which has **no `refactor` / `implementation`
/ `bugfix` / `config` / `audit` entry** → `intentBonus = 0` → candidates fall below 3 → `[]`.

### The deeper miss

`task.type` for a comment sweep on a `.ts` file is `code-development` (scope-only;
`detectTaskType` never reads the description). That is the **medium** (it is code) but not the
**operation** (it is a refactor/comment-sweep, not a feature build). Routing precision needs
*both* axes:

- **Operation axis** — from the description verbs (refactor / cleanup / audit / document).
- **Medium axis** — from `task.type` (code vs doc vs test).

`detectTaskType`/`rubricTypeToKind` already give `audit | document-write | code-development`
(the `RubricTaskType` triple = exactly DEVAM's "audit/doc/code-dev"). The operation axis is the
piece the classifier must sharpen.

## 2. Signal model (reliability-weighted)

The fix re-orders signals by trustworthiness so a coarse path proxy can never override a
semantic operation signal:

| # | Signal | Source | Authority |
|---|--------|--------|-----------|
| 1 | Explicit override | `forceAgent` / `forceSkills` (DIRECTIVES / planner) | Absolute (existing; unchanged) |
| 2 | **Semantic intent** (operation) | description verbs → `intent.primary` | Authority for **build-vs-touch-up** |
| 3 | **Canonical TaskKind** (medium) | `task.type` (scope-shape SSOT) | code/doc/test split + intent tie-break |
| 4 | Path-domain proxy | `src/api/`→`api`, etc. | **Weakest** — contributes only when 2 & 3 confirm a build |

**Invariant:** a path-domain/surface proxy MUST NOT outweigh a semantic operation intent.

## 3. Design — four mechanisms

### B1 — Classifier precision (operation axis) · `src/core/intent-classifier.ts`

- Disambiguate the `comment`(→documentation) vs `cleanup`(→refactor) flat-`+2` tie:
  a phrase signalling a code-structure touch-up — `clean|stale|dead|remove|delete|rename|simplify|tidy|sweep`
  co-occurring with `comment(s)` / `code` / `import(s)` — resolves to **`refactor`** intent,
  beating both the documentation tie and the `+3` `src/`-write implementation boost.
- Pure documentation work (writing/updating prose docs, JSDoc *content*, README, CHANGELOG)
  stays `documentation`. The discriminator is *touch-up of existing code* (refactor) vs
  *authoring docs* (documentation).
- Align the classifier's vocabulary with the `RubricTaskType` triple
  (`audit | document-write | code-development`) so the operation axis and the medium axis
  share one taxonomy (ADR-053).
- No behaviour change for already-correct classifications — additive keyword/tie-break logic,
  existing intent tests stay green.

### B2 — Kind/intent-gated path bonuses (root fix) · `routing-engine.ts` + `task-router.ts`

Introduce a single predicate, used at every path-derived boost:

```
isSurfaceBuildTask(intent, taskKind):
  // path-domain / surface bonus is a "you are BUILDING this surface" signal.
  SUPPRESS when the task is a touch-up / non-build:
    intent.primary ∈ { 'refactor', 'documentation' }   // operation axis
    OR taskKind   ∈ { 'audit', 'document-write' }       // medium axis
  → return false (suppress bonus)
  otherwise → return true (bonus applies, as today)
```

Apply it at:
- `getDomainMatchBonus` (`:156`) — return 0 when suppressed.
- `USER_SURFACE_BONUS` application in `selectBestAgent` (~`:495`) — skip when suppressed.
- `applyUserSurfaceBonus` (`task-router.ts:257`) — return no surface agent when suppressed.

Result for the symptom: api-builder loses both bonuses → stays at 8; refactorer's `10` wins.
Genuine "build the `/api/users` endpoint" (intent `implementation`/`feature`, kind
`code-development`) is **not** suppressed → still routes to api-builder (ADR-079 surface-routing
preserved).

> **Predicate is intentionally conservative:** only `refactor` + `documentation` intents and
> `audit` + `document-write` kinds suppress. `implementation` / `feature` / `bugfix` keep the
> bonus, minimising lossless risk. The set is a named constant, easy to tune.

### B3 — SSOT-consume · `routing-engine.ts` (+ `work-model.ts` if adapter gap)

- Widen `routeTaskV2`'s param type to `{ title; description; scope; type?: TaskKind }`.
- Thread `task.type` to: (a) the B2 gate (medium axis), (b) an intent tie-break — when
  `classifyIntent` confidence is low/tied, `taskKindToIntent(task.type)` (`work-model.ts:443`)
  corroborates the primary intent, (c) taxonomy alignment.
- **Precedence (resolves the code-development/refactor case):** the operation axis (B1) outranks
  the medium tie-break (B3) — per signal model #2 > #3. B3 only fills *genuine* ambiguity (B1
  low-confidence / true tie); a confident B1 classification is never overridden by `task.type`.
  This matters for the symptom: `task.type='code-development'` → `taskKindToIntent` =
  `implementation`, but B1 confidently yields `refactor`, so `refactor` stands. The B2 gate is an
  **OR** (`intent ∈ {refactor,documentation}` OR `kind ∈ {audit,document-write}`) precisely so the
  **intent arm** suppresses the path bonus here even though the `code-development` medium would not.
- **Caller churn ≈ zero.** All six call sites already pass the full `Task` object (which carries
  `.type`): `mid-sprint-adapter.ts:154`, `task-mode-runner.ts:140`, `sprint-planner.ts:597`,
  `mcp/tools/run.ts:102`, `cli/commands/run.ts:313`. Widening the param type is structurally
  compatible — no call-site edits. `task.type` may be absent (legacy/synthetic tasks) → the gate
  falls back to scope-shape `detectTaskType`, preserving today's behaviour.

### B4 — Map completion + empty-skill floor · `routing-engine.ts`

- Complete `INTENT_TO_AGENT_DOMAIN` (`:112`) and `INTENT_TO_SKILL_ID` (`:839`) for the intents
  that currently yield zero bonus: `refactor`, `implementation`, `bugfix`, `config`, `audit`.
  Examples: `refactor → code-simplifier`, `implementation → typescript-expert` (stack-aware),
  `config → devops-engineer`. Agent-domain entries added only where a clean built-in domain
  exists (no forced/arbitrary mappings — ADR-070 zero-hard-code spirit).
- **Empty-skill floor (two-tier)** in `selectBestSkills`: if no candidate clears
  `skillMinScore`, (1) relax to the best-scoring candidate with `score > 0`; (2) if still none,
  use a kind/intent default — `refactor → code-simplifier`, `code-development → typescript-expert`
  (or the stack-detected language expert), `document-write → documentation-writer`. Guarantees
  `assignedSkills.length >= 1` for any classified task. The floor is *additive* — it never
  removes a skill that already qualified.

## 4. Touched files (surgical)

| File | Mechanism |
|------|-----------|
| `src/core/intent-classifier.ts` | B1 — comment-sweep→refactor tie-break, taxonomy align |
| `src/core/routing-engine.ts` | B2 gate, B3 `task.type` consume, B4 maps + skill floor |
| `src/orchestra/task-router.ts` | B2 — gate `applyUserSurfaceBonus` |
| `src/core/work-model.ts` | only if a taskKind→intent adapter gap surfaces (likely none) |

Callers unchanged (B3 structural type-widening).

## 5. Constraints honoured

- **Lossless:** existing routing tests stay green; genuine surface-build tasks still route to
  `api-builder`/`frontend-designer` (ADR-079); `task.type`-absent path = today's behaviour.
- **i18n:** routing is internal logic — no user-facing strings; `reasoning[]` log lines remain
  English-default (mechanism string-free).
- **ADR:** ADR-079 (Proof-of-Function surface routing) preserved; ADR-053 (TaskType taxonomy)
  aligned; ADR-070 (zero-hard-code) — suppress-set and floor are named, documented constants;
  ADR-008 (one-way import) — no new cross-imports (work-model is already a core leaf).

## 6. Test & proof (TDD red→green)

1. **Ground-truth regression** (the symptom, reproduced first → red): task
   `{ title:'clean stale comments', description:'remove stale/dead comments', scope:{ filesWrite:['src/api/x.ts'] }, type:'code-development' }`
   → assert `agentId ∈ {code-reviewer, refactorer, code-simplifier}` **and** `skillIds.length > 0`.
2. **Unit per mechanism:** B1 (comment-sweep→`refactor`, doc-authoring stays `documentation`);
   B2 (`isSurfaceBuildTask` false for refactor/audit/document-write, true for implementation);
   B3 (`task.type` tie-breaks a tied `classifyIntent`); B4 (maps non-empty, floor guarantees ≥1).
3. **Lossless guard:** "build the `/api/users` endpoint" (`implementation` + `code-development`)
   → still `api-builder` with non-empty skills (surface routing intact).
4. **Dual-perspective:**
   - *dogfood* — deckent's own comment-sweep task routes to refactorer/code-reviewer.
   - *product* — a user project's doc/comment sweep under their `src/api/` routes correctly
     (the path-proxy no longer hijacks user surfaces either).
5. Tier-0 (core) → unit-sufficient; the regression replay is the ground-truth (per
   `feedback_trust_brain_eval_not_worker` — disk/behaviour, not self-report).

## 7. Non-goals (deferred)

- **Learning loop** — ROUTE-1 "C" / outcome-tracker-driven per-project weight evolution
  (master-plan §1068, §879 lists it post-GA / no current foundation). This slice is the
  deterministic precision fix; the learned layer consumes it later.
- **Model/effort tier** — closed by MODEL-GUARD.
- **Provider routing** — separate layer (`task-router.ts` provider block), unchanged.

## 8. Open judgement calls (flagged for review)

- **B2 suppress-set membership.** Current: `{refactor, documentation}` intents +
  `{audit, document-write}` kinds. Excludes `bugfix` (kept as build-ish so an api bug-fix may
  still draw api-builder, though bug-fixer usually wins on its own rule). Tunable.
- **B4 floor defaults.** `refactor→code-simplifier`, `code-development→typescript-expert`
  (stack-aware), `document-write→documentation-writer`. The relax-threshold tier (best `score>0`
  candidate) runs first, so hardcoded defaults are a last resort only.
