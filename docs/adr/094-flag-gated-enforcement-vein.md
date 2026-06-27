# ADR-094: Flag-Gated Enforcement Vein

**Status:** accepted

**Date:** 2026-06-27

**Sprint:** 343

---

**Context:**

ADR-037 (Brain-Auditor-Worker Authority Matrix) explicitly documented that its enforcement model is
**V1.0 deliberately soft**. The header note in ADR-037 states verbatim: "Layer 2 (runtime) is
ADVISORY / SOFT — a violation is logged + emitted to the event stream but does **not** block the
action." Four concrete enforcement gates existed in the codebase in a computed-but-not-enforced or
reachable-but-untested state at the time of this decision:

**Gate B1 — RBAC worker hard-deny (`enforceRbac`):**
`config-types.ts:836` declares `enforce_rbac?: boolean`. The hard-deny path exists in
`nervous/authority-matrix.ts:351-353` (`opts.enforceRbac === true → deny`, else soft-warn). The
flag is threaded from `sprint-runtime.ts:30-31` to `checkWorkerAuthority`. However,
`agents/worker.ts:602-620` `checkWorkerAuthority` returns `true` on both branches — even with the
flag set, the worker side never denies. Additionally, deckent-dev's own config never set
`enforce_rbac: true`, so the hard path shipped untested in the live pipeline.

**Gate B6 — cumulative spend warn-gate (`cost_limits.enforce_spend_gate`):**
`cost-config-loader.ts:74-75` defines and validates `daily_max_usd` / `monthly_max_usd`. The
existing gate in `core/cost-gate.ts:119` enforces only `auto_confirm_below_usd` — a per-sprint
estimate check before spawn confirm, not a cumulative rolling spend gate. No code compared actual
rolling spend against the daily/monthly limits. The `readSpendWindow` function and the
`BRAIN→USER:COST_LIMIT_WARN` event path did not exist.

**Gate A9 — ADR-compliance hard-deny (`gate.enforce_adr_compliance`):**
The ADR-compliance checker (`enforceAdrCompliance`) ran and emitted findings but the result was
never wired to a hard-deny outcome. Findings were advisory, not gate-blocking.

**Gate A14 — tech-debt-ratio downgrade (`gate.max_tech_debt_ratio`):**
`result-evaluator.ts:1285` `applyTechDebtDowngrade` was implemented but had zero callers
(verified). The sprint tech-debt ratio was computed but never fed back into sprint outcome
decisions. The sibling B-REGGATE half (`runSelfAuditGate` in `sprint-finalizer.ts:250`) was
already fixed to fire `GATE_FAILURE` on net-new `delta.fail`; the tech-debt-ratio downgrade
remained a dead code path.

The risk of flipping these gates to default-on for all users was high: grading semantics change,
workers that had previously succeeded with scope warnings would begin failing, and cumulative spend
interruptions could stall production sprints for users who had never set `daily_max_usd`. A
post-GA-V2 hard-flip was the right trajectory, but the enforcement code paths needed to be proved
correct — in a live pipeline — before any global flip.

---

**Decision:**

Introduce a **flag-gated enforcement vein**: all four gates are implemented and correct behind
config flags that default to `false` (product behavior is byte-identical to pre-ADR state). Only
deckent-dev's gitignored `.deckent/config.json` enables hard-mode, dogfooding each gate against
real sprint traffic to validate correctness before a future global flip.

### Gate B1 — `enforce_rbac` (RBAC worker hard-deny)

`agents/worker.ts:checkWorkerAuthority` is updated to honor `opts.enforceRbac`: when
`enforceRbac === true` and a scope-violation is detected, the function returns `false` (deny)
instead of the unconditional `true`. All existing callers continue to pass `enforceRbac: false`
(or omit it), so the default path is byte-identical. The stale comment in `sprint-runtime.ts:9`
("not yet declared") is removed. Deckent-dev's gitignored config sets `enforce_rbac: true` to
exercise the hard-deny path on real workers.

### Gate B6 — `cost_limits.enforce_spend_gate` (cumulative spend warn-gate)

`readSpendWindow(projectRoot, 'day' | 'month')` is added over the existing
`.deckent/settings/resource-log.jsonl` ledger (the same source as the limit-ledger work). In the
pre-spawn cost gate (`cost-gate.ts`, alongside the existing estimate check), `projectedSpend =
spentThisWindow + sprintEstimate` is computed; if `projectedSpend > daily_max_usd` (or monthly)
**and** `cost_limits.enforce_spend_gate === true`, a `BRAIN→USER:COST_LIMIT_WARN` event is emitted
and a notification is sent — warn-only, the sprint still proceeds. With `enforce_spend_gate ===
false` (the default) or when spend is under the limit, no event is emitted. A future hard-block
variant (returning `COST_GATE_EXCEEDED`) is a post-beta flip, not part of this ADR.

### Gate A9 — `gate.enforce_adr_compliance` (ADR-compliance gate, fail-open preserved)

The ADR-compliance checker (`enforceAdrCompliance`) is wired into the sprint evaluation path. When
`gate.enforce_adr_compliance === true`, a compliance violation produces a hard-deny outcome
(task result downgraded to `NO_GO` or sprint gate to `FAIL`). When the flag is `false` (default),
compliance violations remain advisory — findings are emitted to the event stream and dashboard but
do not block the outcome. **Fail-open is the explicit and permanent default for this gate** because
ADR-compliance findings can surface on tasks that pre-date a newly accepted ADR; a hard-deny by
default would retroactively fail tasks that were correct at the time of writing.

### Gate A14 — `gate.max_tech_debt_ratio` (tech-debt-ratio downgrade)

`applyTechDebtDowngrade` in `result-evaluator.ts` is wired into `finalizeSprint` /
`runSelfAuditGate` after per-task evaluation: if the sprint's tech-debt ratio exceeds
`gate.max_tech_debt_ratio` **and** the field is set (it is absent / `undefined` by default), the
sprint outcome is downgraded (`DONE → GO_WITH_TECH_DEBT` or `GATE_FAILURE`). When the field is
absent or set to `0` / `null`, the function is not called — current behavior is preserved
byte-identically. Before wiring, the function's logic is verified against the current result rubric
(the function is 200+ sprints old); if it no longer matches, it is deleted and a KES candidate is
logged rather than force-wired with a stale contract.

### Config shape (deckent-dev gitignored `.deckent/config.json`)

```json
{
  "enforce_rbac": true,
  "cost_limits": {
    "enforce_spend_gate": true
  },
  "gate": {
    "enforce_adr_compliance": true,
    "max_tech_debt_ratio": 0.3
  }
}
```

All four keys are absent from the committed config defaults — their absence is the default-off
guarantee. The gitignored file is the only activation vector; a clean checkout or a user who has
never touched these keys sees no behavior change.

### Test requirements

Faithful tests assert both branches for each gate:

- **B1:** flag-on + a worker writing outside `scope.filesWrite` → `checkWorkerAuthority` returns
  `false` / `evaluateAuthority` returns `deny`. Flag-off → returns `true` (byte-identical).
- **B6:** resource-log ledger seeded past `daily_max_usd` + flag-on → `COST_LIMIT_WARN` event
  emitted, sprint proceeds. Flag-off or under-limit → no event.
- **A9:** a task with a known ADR violation + flag-on → outcome downgraded to `NO_GO` / gate
  `FAIL`. Flag-off → advisory finding only, outcome unchanged.
- **A14:** sprint debt-ratio above `max_tech_debt_ratio` + flag set → outcome downgraded. Flag
  absent → `applyTechDebtDowngrade` not called, outcome unchanged.

All tests use tmpdir fixtures and injected config; no test reads gitignored local state (ADR-087
hermeticity requirement).

---

**Consequences (+):**

- Product behavior is byte-identical for all users on a clean checkout — zero regression risk
  from this ADR's merge.
- Deckent-dev exercises all four hard paths on real sprint traffic, giving high confidence before
  any future global flip.
- Each gate has a single, explicit config key — operators who want to opt in before GA-V2 can do
  so by setting the relevant key; the behavior is documented and predictable.
- The `enforce_adr_compliance` fail-open default is an explicit design choice recorded in this
  ADR, not a gap — it prevents retroactive failures on pre-ADR tasks.
- ADR-037 V1.0 advisory enforcement remains intact for all users; this ADR adds a tested, proven
  upgrade path without changing the current layer-2 contract.

**Consequences (-):**

- Deckent-dev's gitignored config is not committed, so the dogfood state is invisible to code
  review. Sprint retro notes and auditor alerts are the only observable proof that hard paths ran.
- Four separate config keys for four gates increases config surface; future consolidation into a
  single `enforcement_mode: 'strict' | 'advisory'` toggle is a valid simplification (post-GA-V2).
- `gate.max_tech_debt_ratio` will not be wired if `applyTechDebtDowngrade`'s contract is found
  stale during implementation review — in that case the gate ships as a documented stub with a KES
  candidate logged, not as a forced wire.
- The fail-open default for `enforce_adr_compliance` means ADR violations can accumulate
  undetected until an operator explicitly enables the gate; the dashboard advisory display is the
  only passive signal.

**Alternatives Considered:**

- **Default-on for all users immediately:** rejected — grading semantics change for all existing
  users without notice; workers that previously succeeded with scope warnings would begin failing;
  cumulative spend interruptions could stall production sprints for users who never set
  `daily_max_usd`. The value of proving correctness in dogfood before a global flip outweighs
  the cost of a deferred hard-flip.
- **Single `enforcement_mode: 'strict'` flag covering all four gates:** simpler config surface,
  but coupling the gates means a user cannot opt into spend-warn without also enabling RBAC
  hard-deny. Per-gate flags give finer-grained rollout control and are the correct choice pre-GA.
- **Hard-flip B1 only, leave the others advisory:** partially addresses ADR-037's intent but
  leaves the cost and tech-debt gates untested. The consistent flag-gated pattern across all four
  gates reduces cognitive load and makes the GA-V2 flip a single policy decision.
- **Remove `applyTechDebtDowngrade` without wiring:** the function is dead code and a KES
  candidate. Deletion is preferred over a forced wire if the logic is found stale; this ADR
  records that decision point explicitly rather than silently wiring a mismatched function.

**References:**

- `agents/worker.ts:602-620` — `checkWorkerAuthority` (B1 hard-deny seam)
- `nervous/authority-matrix.ts:351-353` — existing hard-deny branch (B1, reachable but untested)
- `sprint-runtime.ts:30-31` — `enforce_rbac` flag threading
- `core/cost-gate.ts:119` — existing estimate gate (B6 extension point)
- `cost-config-loader.ts:74-75` — `daily_max_usd` / `monthly_max_usd` definitions
- `.deckent/settings/resource-log.jsonl` — rolling spend ledger (B6 data source)
- `result-evaluator.ts:1285` — `applyTechDebtDowngrade` (A14 dead caller)
- `sprint-finalizer.ts:250` — `runSelfAuditGate` (A9/A14 wire point)
- `config-types.ts:836` — `enforce_rbac` field declaration
- `DESIGN-ENFORCEMENT-VEIN.md` — root-cause analysis and design spec that motivated this ADR
- ADR-037: Brain-Auditor-Worker Authority Matrix — RBAC Protocol V1.0 — the advisory layer this
  ADR builds a proven upgrade path on top of
- ADR-087: Async I/O and Test Hermeticity Standard — test hermeticity requirements for all gate
  tests in this ADR
- ADR-093: Real Token/Cost Capture via Provider-Native Usage Stores — companion sprint-343 ADR
  establishing provider-agnostic seam patterns this ADR follows for flag injection
