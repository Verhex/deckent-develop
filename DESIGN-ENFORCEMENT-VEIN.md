# DESIGN — enforcement vein (B1 RBAC · B6 cost-gate · A9/A14 gate-enforced)

> **Status:** design-ready (overnight loop, 2026-06-25). Implementation is **attended-defer**
> (behaviour-changing enforcement; ADR-037 V1.0 = deliberate soft). This spec grounds each item in
> current code (file:line) so the deferred "enforcement-vein design-sprint" can start without
> re-investigation. **Pattern for all three: flag-gated, default-OFF (product byte-identical), with
> deckent-dev dogfood enabling hard-mode to prove the path.**

## B1 — RBAC `enforce_rbac` hard-deny: reachable but not exercised
**Current state (NOT what the triage assumed — the hard path EXISTS):**
- `config-types.ts:836` declares `enforce_rbac?: boolean` (the `sprint-runtime.ts:9` "not yet
  declared" comment is **stale** — fix it).
- `nervous/authority-matrix.ts:351-353` implements the HARD block: `opts.enforceRbac === true →
  deny`, else soft-warn (ADR-037). **The deny path is reachable.**
- `sprint-runtime.ts:30-31` threads `config.enforce_rbac → checkWorkerAuthority(req, {enforceRbac})`.
  `autonomous/runtime-loop.ts:46/221/259` is also flag-aware.
**Real gap:** (a) `agents/worker.ts:602-620` `checkWorkerAuthority` returns `true` on BOTH branches
(CLAUDE.md gotcha — Layer-2 intentionally soft) → even with the flag on, the worker-side never
denies; (b) deckent-dev's own config never sets `enforce_rbac`, so the hard path ships **untested in
the live pipeline**.
**Design:**
1. Make `checkWorkerAuthority` honor `opts.enforceRbac`: when true + scope-violation → return
   `false` (deny) instead of unconditional `true`. Default-off → unchanged.
2. Set `enforce_rbac: true` in `.deckent/config.json` (gitignored) for deckent-dev dogfood only —
   product default stays soft.
3. Stale-comment cleanup in `sprint-runtime.ts:9`.
**Faithful test:** flag-on + a worker writing outside `scope.filesWrite` → `checkWorkerAuthority`
returns false / authority `evaluateAuthority` returns `deny` (RED today: returns true/allow);
flag-off → allow (byte-identical).

## B6 — cost-gate: per-sprint estimate enforced, cumulative spend NOT
**Current state:**
- `cost-config-loader.ts:74-75` defines + validates `daily_max_usd` / `monthly_max_usd` (`:184`).
- `cli/commands/cost.ts:182/191` lets the operator SET them; they are displayed.
- `core/cost-gate.ts:119` enforces only `auto_confirm_below_usd` — a PER-SPRINT *estimate* gate
  (pre-spawn confirm), NOT a cumulative spend gate. **No code compares actual rolling spend to
  daily/monthly limits.**
**Design (warn-only first — cheap, visible; hard-gate post-beta):**
1. Add `readSpendWindow(projectRoot, 'day'|'month')` over the existing usage/resource ledger
   (`.deckent/settings/resource-log.jsonl` — the same source the limit-ledger work used).
2. In the pre-spawn cost gate (`cost-gate.ts`, alongside the estimate check), compute
   `projectedSpend = spentThisWindow + sprintEstimate`; if `> daily_max_usd` (or monthly) → emit a
   `BRAIN→USER:COST_LIMIT_WARN` event + notify (warn-only, never blocks). Gate behind
   `cost_limits.enforce_spend_gate?: boolean` (default false).
3. Hard-block variant (return COST_GATE_EXCEEDED unless acknowledged) = a later flip, post-beta.
**Faithful test:** ledger seeded past `daily_max_usd` + flag-on → warn event emitted, sprint still
proceeds; flag-off or under-limit → no event.

## A9 / A14 — gate computed-but-not-enforced (`applyTechDebtDowngrade`)
**Current state:**
- `result-evaluator.ts:1285` `applyTechDebtDowngrade` is implemented but has **ZERO callers**
  (verified) — A14 "computed-not-enforced" is still open for THIS function.
- Note: the sibling **B-REGGATE** half is already FIXED (`51105ae0`, Faz-1): `runSelfAuditGate`
  (`sprint-finalizer.ts:250`) now fires `GATE_FAILURE` on net-new `delta.fail` and
  `applyGateStatus` → `GO_WITH_GATE_FAILURE` is a real signal. So the VITEST gate is enforced; the
  TECH-DEBT-ratio downgrade (`applyTechDebtDowngrade`) is the remaining dead piece.
**Design:**
1. Wire `applyTechDebtDowngrade` into `finalizeSprint`/`runSelfAuditGate` AFTER per-task
   evaluation: if the sprint's tech-debt ratio exceeds a threshold (config
   `gate.max_tech_debt_ratio?`, default off), downgrade the sprint outcome (DONE → GO_WITH_TECH_DEBT
   / GATE_FAILURE) — flag-gated, default-off.
2. If the function's contract is stale (200-sprint-old), prefer DELETING it over a forced wire
   (record as KES candidate) — verify its logic still matches the current rubric before wiring.
**Faithful test:** a sprint with debt-ratio above the threshold + flag-on → downgraded outcome
(RED today: no caller); flag-off → unchanged.

## Rollout
All three ship **default-OFF** (product unchanged) and are **enabled only in deckent-dev's gitignored
config** to dogfood the hard paths. Order by value/risk: **A14 wire** (cheapest, self-contained) →
**B6 warn-only** (visibility) → **B1 worker hard-deny** (most behaviour-sensitive, dogfood-gated).
This is the "enforcement-vein design-sprint" the triage deferred to post-GA-V2.
