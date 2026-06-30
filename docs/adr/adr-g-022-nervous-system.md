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

## References / Absorbed

- **Absorbs:** ADR-040.
- **Cross-ref:** ADR-G-020 (authority — nervous may restart Brain, never codes) · ADR-G-009 (language-agnostic pattern, applied to actions) · ADR-G-016 (enterprise = governance depth) · ADR-G-032 (mutation-approval checkpoint) · APR (ApprovalBroker).
- **Born / MASTER-PLAN:** NERVOUS-ACTION-GENERALIZE · NERVOUS-NONBLOCK · NERVOUS-ENTERPRISE · NERVOUS-TIMEOUT-SSOT (single-source the approve-timeout across ADR / executor / CLI-message) · APR-1/APR-2.
- **Memory:** `project_nervous_observer_feedback_loop_rootcause` · `project_nervous_activation_plan`.
