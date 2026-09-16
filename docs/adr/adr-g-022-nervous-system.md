# ADR-G-022: Nervous System — Proactive Meta-Orchestrator

**Class:** ADR-G (Global / Constitution) · **Scope:** global+project · **Immutable:** yes · **Source:** publisher · **Enforcement:** today=locked safety-floor (5 actions never auto) + config-gated opt-in (default-off) → tomorrow=non-blocking controlled activation + ApprovalBroker-unified approval (runtime-wide; today a shared durable pending-approval READER hub, not yet one broker)
**Status:** accepted · **Date:** 2026-06-30 · **Absorbs:** ADR-040 (Nervous System Architecture)
**Crosswalk:** ADR-040 → ADR-G-022

> **Strength note (Alperen, 2026-06-30):** Nervous is one of deckent's tremendous powers — a key enterprise-layer strength (proactive governance/control). Its ADR, tool, and code must all be very correct; it must be opened to BOTH dogfood and user channels critically, correctly, and in a CONTROLLED way (it can be obstructive when naively enabled).

---

## Context

Brain/Auditor/Worker are **reactive** — errors surface in retro, after the fact. ADR-040 added a **proactive** meta-layer (`src/nervous/`): Observer → DetectorRegistry → DecisionEngine → Proposer → Dispatcher → Executor, with 4 autonomy presets, 5 locked safety-floors, a 30-action registry, and 12 runtime detectors (config-surface = 16 slots: 5 active + 11 reserve; whole system default-off). The 2026-06-30 review keeps the architecture and adds four requirements: **generalize the action vocabulary** (language/project-agnostic), make it **non-blocking + controlled**, treat it as an **enterprise-layer strength**, and **unify its approval with the runtime ApprovalBroker**.

---

## Decision (Today)

```xml
<nervous-system>
  <pipeline>Observer (EventBus + fs-watch + cron-tick + lifecycle) → DetectorRegistry
    (12 runtime detectors; 16 config slots = 5 active + 11 reserve) → DecisionEngine
    (AuthorityMatrix preset lookup) → Proposer (throttle)
    → Dispatcher (MCP/CLI/File adapters) → Executor (autonomous|suggest-timeout|approve).</pipeline>
  <autonomy presets="strict|balanced|autopilot|full-auto"/>
  <safety-floor locked="5">KILL_LIVE_SPRINT · MANUAL_FILE_DELETE · COST_OVER_THRESHOLD ·
    DESTRUCTIVE_GIT · ADR_DEPRECATE_ACCEPTED — never auto, unconditional human wait.</safety-floor>
  <actions count="30" risk="low|medium|high"/>
  <activation default="config-gated opt-in"/>
</nervous-system>
```

Executor approve-mode: non-safety-floor actions auto-proceed on a **presence-aware** timeout (config-keyed — `approve_timeout_attended_ms` ~30s when a human is attending, `approve_timeout_unattended_ms` ~5s when not — NOT a fixed 10s; the CLI enable-message still says 10s and must be single-sourced — NERVOUS-TIMEOUT-SSOT); safety-floor unconditional. Cross-process approval round-trip + `edit` live (modifiedPayload).

> **Note:** In deckent-dev the config flip is currently OFF (`nervous_system.enabled: false`); re-enable is a separate decision. The Sprint-281 NERV-W1 fix replaced a stub action-handler (which silently dropped every approved action) with the real `createActionHandler` — the action-hand now actually executes.

---

## Intent / Roadmap (Tomorrow)

- **NERVOUS-ACTION-GENERALIZE:** the action registry is TS/deckent-specific — real actions include `SRC_MODIFICATION`, `COMMIT_PUSH`, `DIRECTIVES_WRITE`, `SPRINT_START` (note: `NPM_PUBLISH` is an *illustrative* target, not a current registry action). Generalize to **language/project-agnostic** concepts (a publish action → `PUBLISH`, etc.) so it works for Python/C++/Go/any project (the ADR-G-009 language-agnostic pattern, applied to actions).
- **NERVOUS-NONBLOCK:** "enabled → obstructive" must be solved — non-blocking + controlled activation (fixes the observer fs.watch/CPU loop + approval-block). Opened to dogfood AND user channels critically + controlled rollout.
- **APR unification:** today a shared durable pending-approval **reader hub** (`core/pending-approvals.ts`) serves nervous + autonomous approvals across surfaces — but it is a reader, not one runtime-wide ApprovalBroker. The nervous Executor approval (autonomous/suggest/approve + safety-floor + cross-process + edit) **merges with the runtime-wide ApprovalBroker** (APR-1/APR-2) — nervous becomes one approval-source on a multi-channel live-relay bus.
- **NERVOUS-ENTERPRISE:** position nervous as the enterprise-layer's proactive governance/control power (ADR-G-016 "enterprise = governance depth"); controlled rollout dogfood→user.

---

## Consequences

**(+)** Errors are caught before retro; 4 presets + per-action override + 5 safety-floors give granular, audit-trailed control. A major moat + enterprise strength. APR-unification (tomorrow) makes it the proactive arm of one approval bus.

**(−)** The action vocabulary is not yet language-agnostic (dogfood-only utility today; `NPM_PUBLISH` is illustrative, not a real action); the detector surface is 16 config slots but 12 runtime / 5 default-active; the approve-timeout is presence-aware but the CLI message is stale (NERVOUS-TIMEOUT-SSOT); approval today is a shared reader-hub, not one ApprovalBroker (APR); "enabled→obstructive" is unsolved (NERVOUS-NONBLOCK); config currently OFF in deckent-dev; enterprise-controlled-rollout is roadmap.

---

## Amendment (2026-07-06) — Nervous approval-bridge: real status + which path is flag/default

Alperen-kararı 2026-07-06 (ground-truth-snapshot P0,
`docs/analysis/ground-truth-snapshot-2026-07-06.md` §Approval, and the same-day orphan sweep
`docs/analysis/orphan-deliverables-2026-07.md` §4.6, Sprint 374 Task 374-004): the §Intent
Roadmap's "APR unification" bullet above describes the nervous↔ApprovalBroker bridge purely
as future work ("nervous becomes one approval-source on the runtime-wide ApprovalBroker").
Two code modules implementing this now exist; this amendment records their exact wiring
status so "unification" is not read as either fully shipped or fully unstarted.

**Two layers, two different real statuses:**

1. **`src/nervous/approval-bridge.ts`** (Sprint 355, Task 355-012) — a pure, read-only
   bridge: `applyNervousDecision()` maps a resolved nervous accept/reject onto
   `ApprovalBroker.decide()`; `toNervousNotification()` projects a broker-pending
   `ApprovalRequest` back into nervous's own notification shape (guarded to
   `requester.role === 'nervous'` only). The module's own header states it **deliberately
   does not** subscribe to a live broker's `'pending'` event and does **not** touch
   `src/nervous/executor.ts`, `src/mcp/tools/nervous.ts`, or `src/nervous/bootstrap.ts` —
   wiring into the real Executor/IPC-queue/MCP-tool flow is explicitly named as follow-up
   work in its own comments. Test coverage: `tests/nervous/approval-bridge.test.ts`
   (fake-broker + real-`ApprovalBroker` idempotency cases).

2. **`src/nervous/approval-actions.ts`** — a routing function,
   `resolveNervousApprovalAction()`, gated on flag **`nervous_system.approval_bridge`**
   (default `false`; its own header notes this flag is "not yet part of the V2 config
   schema" — `core/config-types.ts` was outside that task's write scope). When the flag is
   off (default), `legacyResolve` runs byte-identical to pre-existing behavior; when on, the
   call is forwarded to `approval-bridge.ts`'s `applyNervousDecision`. Test coverage:
   `tests/nervous/nervous-apr-wire.test.ts` (both flag-off and flag-on paths, plus
   `isNervousApprovalBridgeEnabled` default/override cases).

**Which path is flag/default, precisely:** `nervous_system.approval_bridge` is the flag that
would route nervous accept/reject through the runtime-wide ApprovalBroker — but as of
2026-07-06, **nothing in `src/mcp/tools/nervous.ts` (the real `deckent_nervous_accept`/
`deckent_nervous_reject` handlers), `src/nervous/executor.ts`, or any other production module
calls `resolveNervousApprovalAction` or `isNervousApprovalBridgeEnabled`.** Confirmed by
direct grep (`grep -rn "resolveNervousApprovalAction\|isNervousApprovalBridgeEnabled" src/`
returns only the definition site) and by the 374-004 orphan sweep, which lists both
`approval-actions.ts` and (transitively, since its only caller is itself unwired)
`approval-bridge.ts`'s consumption path under "follow-up-öneri" (delivered + tested, never
called from the real dispatch chain). Flipping the flag today would have **no runtime
effect** — there is no call site for it to change the behavior of yet. The follow-up task is
wiring `resolveNervousApprovalAction` directly into `handleNervousAccept`/
`handleNervousReject` (`src/mcp/tools/nervous.ts`) and/or `Executor.resolveApproval`.

**`nervous_system.enabled` itself:** the shipped code default remains `false`
(`src/core/config.ts:1303-1305`, comment: "disabled by default — Sprint 148 will
activate"). This is unchanged by the above — the approval_bridge flag is a sub-flag nested
inside an already-default-off subsystem. (Note: this dogfood workspace's own gitignored
`.deckent/config.json` currently has `nervous_system.enabled: true` locally — that is this
instance's runtime state, not a change to the shipped/documented default, and is mentioned
here only for completeness, not as a status claim about the ADR's default.)

**Status impact:** "APR unification" in §Intent/Roadmap is now more precisely: the
decision-mapping and routing code exist and are tested, but the wiring into the actual
accept/reject handlers is the remaining, still-open work — the ADR's `Status:` line and
§Consequences "(−)" framing ("approval today is a shared reader-hub, not one
ApprovalBroker") stay accurate and unchanged by this amendment.

---

## References / Absorbed

- **Absorbs:** ADR-040.
- **Cross-ref:** ADR-G-020 (authority — nervous may restart Brain, never codes) · ADR-G-009 (language-agnostic pattern, applied to actions) · ADR-G-016 (enterprise = governance depth) · ADR-G-032 (mutation-approval checkpoint) · APR (ApprovalBroker).
- **Born / MASTER-PLAN:** NERVOUS-ACTION-GENERALIZE · NERVOUS-NONBLOCK · NERVOUS-ENTERPRISE · NERVOUS-TIMEOUT-SSOT (single-source the approve-timeout across ADR / executor / CLI-message) · APR-1/APR-2.
- **Memory:** `project_nervous_observer_feedback_loop_rootcause` · `project_nervous_activation_plan`.
