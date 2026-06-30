# ADR-G-024: Mode Architecture (Universal Naming · sprint | task | process)

**Class:** ADR-G (Global / Constitution) · **Scope:** global+project · **Immutable:** yes · **Source:** publisher · **Enforcement:** `deckent_style` config + mode-aware routing
**Status:** accepted · **Date:** 2026-06-30 · **Absorbs:** ADR-042 (Hybrid Mode Architecture) + ADR-067 (Process Mode + Tenant Isolation)
**Crosswalk:** 042 (+067) → ADR-G-024

> **Naming directive (Alperen, 2026-06-30, repeated):** "Sprint" is developer jargon — we will RENAME it to a universal concept that works for user AND enterprise AND dev AND teams. Proceed carefully on all mode/process work because of this rename.

---

## Context

deckent runs work in distinct execution paradigms. ADR-042 shipped a dual mode (`deckent_style: sprint | task`): sprint = developer orchestration (Brain active, multi-worker, lifecycle); task = single-shot life-assistant. ADR-067 added the foundation for a **third** style, `process` (long-lived + agentic + multi-tenant — `TenantContext`). The 2026-06-30 review consolidates them, commits to the third mode, and binds the universal-naming rename.

---

## Decision (Today)

```xml
<mode-architecture>
  <style key="deckent_style" values="sprint | task | process" config="3-layer (ADR-G-001)">
    <sprint>developer orchestration — Brain active, multi-worker, full lifecycle.</sprint>
    <task>single-shot — Brain bypass, instant result. (Now also the autonomous engine's
      execution primitive: durable backlog kind=task → runTaskMode.)</task>
    <process>long-lived + AGENTIC + multi-tenant (TenantContext); the autonomous engine
      (src/orchestra/autonomous/) is its agentic runtime.</process>
  </style>
  <style-vs-surface>style = execution paradigm (sprint|task|process). Surfaces
    (CLI/REPL/dashboard/MCP/bot) are access ON TOP of a style — a surface is NOT a style.</style-vs-surface>
  <tenant>TenantContext + resolveTenant (env DECKENT_TENANT_ID → config → 'local').
    'local' = single-tenant/dev, backward-compatible.</tenant>
</mode-architecture>
```

> **Clarification — "autonomous" has distinct referents (ties to AUTO-NAMING):** (1) the **autonomous *engine*** (`src/orchestra/autonomous/`) is the agentic *runtime of `process` mode* — NOT a separate `deckent_style` today (`process` is the style; the autonomous engine is *how* a process runs). (2) **autonomous as a roadmap *mode*** is the named member of the future comprehensive mode-set (flow / mission / autonomous). (3) **`deckent mode auto`** is a third, unrelated thing — the sprint|task auto-*detect* selector. These three "auto/autonomous" usages are disambiguated under the MODE-RENAME (born **AUTO-NAMING**), so a user is never left guessing which "auto" they invoked.

> **Note — two open accept-day decisions (carried from ADR-067):** (1) **tenant-threading** — `resolveTenant` is 0-caller (dormant); tenant landed differently (config-flag `strict_tenant` + memory `tenant_id` column + audit-scope). Either wire `TenantContext`-threading OR amend the decision to the realized shape — not both. (2) **AUTO-NAMING** — `deckent mode auto` (sprint|task auto-DETECT) vs "autonomous engine" (the always-running process runtime) are two different "auto"s → user-confusion risk; clarify under the rename.

---

## Intent / Roadmap (Tomorrow)

- **🔴 MODE-RENAME:** retire "sprint" jargon → a universal/inclusive concept (run/job/mission/deckent-log…) for user/enterprise/dev/teams. Touches the whole mode/process vocabulary — proceed carefully.
- **Comprehensive mode-model:** sprint(renamed)/task/process + flow/mission/autonomous as a coherent set; **DIR-2** (DIRECTIVES 0-fragility across ALL modes + first-project safety) + **MODE-2** (mode-independent lifecycle kernel: retro/decay/cleanup).
- Resolve the two open decisions (tenant-threading, AUTO-NAMING).
- Enterprise multi-tenancy (ADR-G-031) builds on `process` mode.

---

## Consequences

**(+)** One mode law spanning dual→triple styles; the autonomous engine is recognized as the `process` runtime; style≠surface clears a recurring confusion. Backward-compatible (`local` tenant, sprint default).

**(−)** "sprint" rename is pervasive and not yet done (born MODE-RENAME). Two open decisions (tenant-threading dormant, AUTO-NAMING collision). DIR-2 0-fragility across all modes is roadmap.

---

## References / Absorbed

- **Absorbs:** ADR-042 + ADR-067.
- **Cross-ref:** ADR-G-001 (3-layer config) · ADR-G-031 (enterprise multi-tenancy on `process`) · ADR-G-020 (per-mode authority) · ADR-G-025 (process resilience) · ADR-G-015 (deckent-log multi-mode).
- **Born / MASTER-PLAN:** MODE-RENAME · AUTO-NAMING · ADR-067-TENANT (threading decision) · DIR-2 · MODE-2 · MODE-1 (process executor).
- **Memory:** `project_automation_usability_state` · `project_autonomous_engine_direction`.
