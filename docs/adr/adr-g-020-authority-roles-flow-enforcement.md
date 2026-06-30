# ADR-G-020: Authority, Roles, Flow & Enforcement (Multi-Mode RBAC)

**Class:** ADR-G (Global / Constitution) · **Scope:** global+project · **Immutable:** yes · **Source:** publisher · **Enforcement:** today=3-layer (compile-time lint + runtime advisory/soft + post-hoc audit-trail) → tomorrow=Layer-2 HARD-flip (ADR-094 flag-gated vein graduating default-on, post-GA-V2) + ROLE-GUARD (pid/role tool-enforce) + centralized policy-engine
**Status:** accepted · **Date:** 2026-06-30 · **Absorbs:** ADR-037 (RBAC V1.0) + ADR-G-003 (Brain Role Separation, born 2026-06-30) + ADR-094 (Flag-Gated Enforcement Vein)
**Crosswalk:** ADR-037 (+born G-003 + 094) → ADR-G-020

> **Foundational note (Alperen, 2026-06-30):** "Bu ADR bizim kod işleyişimiz — çok dikkatli ve doğru tasarlanmalı; hem deckent-dogfood hem user tarafı için kusursuz olmalı. Bu ADR bir sürü iyi ve kötü tecrübenin nihai ürünüdür." This document is the distillation of 200+ sprints of orchestration experience; it is global (ADR-G) but its file-path matrix spans BOTH global and project scope, and its authority model is **user-customizable** within the inviolable G-baseline.

---

## Context

ADR-037 (Sprint 139) introduced the Brain↔Auditor↔Worker authority matrix with four principles (least-privilege, separation-of-duties, auditability, fail-closed) — but documented its enforcement as **V1.0 deliberately soft**: Layer-2 runtime is advisory (`checkWorkerAuthority` returns `true` even on violation; violations are logged + emitted, not blocked). Three further gaps surfaced in the 2026-06-30 review:

1. The matrix was written for **sprint mode only**, and its file-path rules assumed a single project scope.
2. "Brain never writes code" (the orchestrator-boundary, Rule-4) deserved first-class statement — it was briefly born as a separate ADR-G-003 before being recognized as this matrix's core.
3. Enforcement was advisory-only with no proven upgrade path; ADR-094 (Sprint 343) later built a flag-gated enforcement vein dogfooded in deckent-dev — that vein belongs *inside* this authority law.

ADR-G-020 consolidates all three: the role/authority matrix, the Brain orchestration boundary, and the enforcement engine — generalized across **all execution modes**, across **global+project scope**, and made **user-customizable** without ever weakening the core.

---

## Decision (Today)

### 1. Roles & Separation of Duties

```xml
<roles separation-of-duties="enforced">
  <role id="Architect" actor="human" power="strategic">
    Vision, DIRECTIVES/charter authoring, approval of critical-irreversible actions.
    No tactical mid-run intervention.
  </role>
  <role id="Brain" actor="orchestrator" cardinality="singleton" power="orchestrate">
    Plan · route · evaluate · finalize. **NEVER writes code** (src/** DENY) — code is
    authored by workers / the AI tool the user runs in the terminal. (Absorbs ADR-G-003:
    "Brain Role Separation — Orchestrator, Never Code-Author"; enforced by tool + pid/role
    guard = ROLE-GUARD.)
  </role>
  <role id="Worker" actor="generator" cardinality="N-parallel" power="execute">
    Code/action + tests, STRICT to scope.filesWrite. Writes its own self-assessment.
  </role>
  <role id="Auditor" actor="adversary" process="separate" power="verify">
    Adversarial verification, ADR-compliance, RBAC scan, fresh-context critique.
    NEVER writes code — reads + scores only. Independent of Brain's assessment.
  </role>
  <role id="Nervous" actor="meta-orchestrator" power="proactive-heal">
    Proactive health monitoring; may restart Brain / propose recovery; never writes code.
    (ADR-G-022.)
  </role>
</roles>
```

**Assessment rule:** both the worker's **self-assessment** AND the Brain's **brain-assessment** are written for every task (separation of assessment from verification; the two perspectives are recorded distinctly, not collapsed).

### 2. Authority Matrix (file / channel / lifecycle)

```xml
<authority-matrix scope="global+project">
  <file-access>
    Per-component scope.filesWrite / filesRead, resolved over BOTH global paths
    (~/.deckent, global ADRs) AND project paths (.deckent, .brain, .tasks, src/**).
    Brain: DENY src/** + tests/**. Worker: ALLOW only declared scope.filesWrite.
    Auditor: read-all, write NONE (except its own .dashboard/audit sinks).
  </file-access>
  <event-stream-rights>
    Channel-level send/receive rights over the ADR-G-018 event-stream
    (28+ channels). No worker→worker direct messaging — all mediated through the
    Brain bus (transport-invariant; typed vocabulary = COMM-2). Event-stream
    per-mode channel gaps are reconciled with ADR-G-018.
  </event-stream-rights>
  <lifecycle-actions>
    Per-role permission for plan/spawn/evaluate/fix/finalize/kill/cleanup actions,
    per mode (see §3).
  </lifecycle-actions>
</authority-matrix>
```

### 3. Multi-Mode — role · flow · continuation

The authority matrix applies across **every execution mode** — `task` / `process` / `autonomous` / `flow` / `mission` / `sprint` (universal naming per ADR-G-024; "sprint" jargon is being retired). For each mode the ADR documents the **role assignment + flow + continuation mechanism** — including the **autonomous** continuation (how Brain's role persists across an autonomous loop, how a long-running process resumes). The matrix is mode-agnostic at its core; modes differ only in which lifecycle actions are active and which approval tiers apply.

### 4. User-Customizable Authority (within the G-baseline)

The matrix is **ADR-G (inviolable baseline)** but **user-customizable**: a user defines their own authority rules for their files / work-environment / agentic processes via the ADR-UG/ADR-UP layer. Precedence is **G > U > D** — the user may **tighten** (add stricter authority) but **never violate** the G-baseline. deckent *observes* the user's matrix and evolves per-environment customize-tools to honor it.

### 5. Enforcement — 3 layers + flag-gated vein (absorbs ADR-094)

```xml
<enforcement>
  <layer n="1" kind="compile-time">lint / authority-static-check (active)</layer>
  <layer n="2" kind="runtime" v1="advisory/soft">
    V1.0 reality: violation logged + emitted, NOT blocked (checkWorkerAuthority
    returns true). The flag-gated vein (below) is the proven upgrade path.
  </layer>
  <layer n="3" kind="post-hoc">audit-trail + git diff --stat boundary scan (active)</layer>
  <flag-gated-vein source="ADR-094" default="off-for-users">
    4 gates implemented behind config flags, default-off (product byte-identical):
    B1 enforce_rbac (worker hard-deny) · B6 cost_limits.enforce_spend_gate (cumulative
    spend warn) · A9 gate.enforce_adr_compliance (fail-OPEN permanent default — pre-ADR
    tasks must not retroactively fail) · A14 gate.max_tech_debt_ratio (downgrade).
    deckent-dev's gitignored config enables hard-mode → dogfoods each gate on real
    traffic before any global flip.
  </flag-gated-vein>
</enforcement>
```

### 6. Structure of this ADR

Given size/criticality, this ADR uses **XML-schema section separation** (above) for the matrix, roles, and enforcement so the contract is machine-parseable and unambiguous — required for correct prompt-injection and for the future enforcement engine.

---

## Intent / Roadmap (Tomorrow)

- **Layer-2 HARD-flip (post-GA-V2):** the ADR-094 vein graduates to default-on; an ADR-G violation is **blocked**, not logged. Backed by **ROLE-GUARD** (pid/role tool-enforce: the Brain/orchestrator process *cannot* write code; enforcement at the tool/process layer, not prompt-trust).
- **Centralized policy-engine RE-EVAL (POLICY-ENGINE-EVAL):** OPA/Rego or an embedded engine for the authority/RBAC decisions — the ADR-D-005 dependency reframe removed the minimal-dep blocker.
- **Generalized enforcement (ENFORCE-GENERALIZE):** the enforcement engine ships to **user projects**, not dogfood-only — `lint:adr` / authority-enforcer flawless on the user side too.
- **COMM-2 typed mediated-bus:** the no-worker-to-worker rule becomes a typed message vocabulary (DEPENDENCY_REQUEST, …) over the Brain bus.
- **Per-mode event-stream completion:** close the ADR-G-018 channel gaps for process/autonomous/flow/mission.
- **User-authority management surface:** users author/edit their ADR-UG/UP authority rules conversationally (ADR-G-019 ADR-U management).

---

## Consequences

**(+)** One inviolable, machine-parseable authority law spanning all modes + global/project scope, with a *proven* (dogfooded) enforcement upgrade path instead of advisory-forever. Brain-never-codes is first-class + tool-enforceable. User-customizable without weakening the core (G>U>D). Connector-surface RBAC (ADR-G-031) and self-modify guard (ADR-G-021) compose on top.

**(−)** Layer-2 hard-enforcement is roadmap (today advisory/soft) — real protection today is compile-time lint + Auditor `git diff --stat` + the dogfood vein, not a runtime block for users. ROLE-GUARD pid/process enforcement is a born work-item. The 4 enforcement gates add config surface (future consolidation into one `enforcement_mode: strict|advisory` toggle is a candidate, post-GA-V2). `A9` ADR-compliance is permanently fail-open by design (prevents retroactive failures).

---

## References / Absorbed

- **Absorbs:** ADR-037 (Authority Matrix RBAC V1.0) · ADR-G-003 (Brain Role Separation — born, now Rule in §1) · ADR-094 (Flag-Gated Enforcement Vein — now §5 vein).
- **Cross-ref:** ADR-G-018 (Verification Protocol & Event-Stream — channels this matrix governs) · ADR-G-019 (ADR Governance — the enforcement-engine partner) · ADR-G-021 (Self-Modifying Detection) · ADR-G-024 (Mode Architecture — the modes in §3) · ADR-G-031 (Enterprise — connector-surface RBAC builds on this) · ADR-G-014 (Spawn/worktree — scope enforcement).
- **Born work-items:** ROLE-GUARD (pid/role tool-enforce) · POLICY-ENGINE-EVAL · ENFORCE-GENERALIZE · AUTH-MULTIMODE · AUTH-USER-CUSTOM · COMM-2.
- **Memory:** `feedback_trust_brain_eval_not_worker` · `project_deckent_self_git_mutation_bug` · `project_social_identity_rbac_engine`.
