# ADR-G-002: spawnSync Security Pattern

**Class:** ADR-G (Global / Constitution) · **Scope:** global+project · **Immutable:** yes · **Source:** publisher · **Enforcement:** today=array-args security invariant + ADR-006 compile-time scan in `authority-enforcer.ts` (advisory/soft per ADR-G-020) + documented `shell:true` carve-outs → tomorrow=runtime-enforced (advisory→hard via ADR-094 flag-gated vein within ADR-G-020) + Windows carve-out hardened (SPAWN-1)
**Status:** accepted · **Date:** 2026-06-30 · **Absorbs:** ADR-006 (spawnSync Security Pattern) · **Supersedes:** —
**Crosswalk:** ADR-006 → ADR-G-002

---

## Context

Command-injection risk must be driven to zero. Every subprocess invocation in deckent carries potentially untrusted input — prompts, user config, file paths, project content. The original ADR-006 (2026-04-16) established **array-args + no `shell: true`** as a security invariant; the 2026-06-11 amendment reconciled its wording with the async-io axis, clarifying that the **security pattern is independent of the sync-vs-async choice** (the security rule applies to `spawn` and `spawnSync` alike; the sync/async decision is a separate axis).

The 2026-06-30 review confirmed this as **ADR-G** (Global / Constitution): it is a runtime law that ships to every user and constrains every subsystem — LLM-generated subprocess code **cannot** violate it. It is not a contributor convention; it is how the product *behaves* on every host.

---

## Decision (Today)

### 1. Security invariant — array-args, no shell

```xml
<spawn-security-invariant>
  <rule>All subprocess calls run as spawn(binary, [...args]) / spawnSync(binary, [...args]).</rule>
  <rule>shell: true is forbidden by default — no shell interpretation.</rule>
  <rule>Untrusted input (prompts, user input, paths) passes ONLY as argument-array
        elements; it is NEVER interpolated into a command string.</rule>
  <rule>Template-literal / string-concat command construction is forbidden.</rule>
  <scope>Applies to BOTH spawn and spawnSync — orthogonal to the sync/async axis.</scope>
</spawn-security-invariant>
```

This is a **security invariant** (command-injection = zero), not a stylistic preference.

### 2. Sync-vs-async is a separate axis (ADR-D-002)

Async `spawn` is the **default rule** (ADR-D-002, Test Infrastructure & Hermeticity — `spawnSync` blocks the event loop and causes CI timeouts; absorbed old ADR-087 async-io-hermeticity). `spawnSync` is the **sanctioned exception**, permitted only for **short, trusted, non-hot-path one-shots**. When `spawnSync` *is* used (within that sanctioned exception), it MUST follow the §1 security pattern — array-args, no `shell: true`.

### 3. Documented `shell:true` carve-outs (narrow, deliberate)

- `src/core/plugin-hooks.ts` — sandboxed plugin-hook execution.
- `src/core/provider.ts` — Windows-only, to resolve `.cmd`/`.ps1` wrapper binaries on `PATH`.

These carve-outs **never interpolate untrusted input** into a command string (args remain arrays / fixed). They are the only sanctioned `shell:true` sites.

### 4. Enforcement (today — advisory)

Compliance is tracked by the ADR-006 check in `src/orchestra/authority-enforcer.ts` — a compile-time scan. Per ADR-G-020 (RBAC V1.0) this is **advisory/soft**: it warns + emits an audit signal, it does **not** hard-block.

---

## Intent / Roadmap (Tomorrow)

- **Enforcement advisory→runtime:** today the ADR-006 scan only warns; tomorrow a subprocess constructed with `shell:true` + interpolated untrusted input is **blocked, not merely logged** — via the ADR-094 flag-gated enforcement vein graduating to default-on under ADR-G-020's authority layer (the same inviolability vein that carries every ADR-G law).
- **Windows carve-out hardening (SPAWN-1):** Node `DEP0190` (`shell:true` + args array) Windows leak + injection fix — tighten the `provider.ts` `.cmd`/`.ps1` resolution so the carve-out can never become an injection surface, moving toward a platform-adapter that resolves wrapper binaries without `shell:true` where the runtime allows. (MASTER-PLAN: SPAWN-1.)
- **Backend convergence:** as worker spawn moves to heterogeneous backends (ADR-G-014 — docker/subprocess/tmux/firecracker/cloud), the array-args invariant is carried **uniformly** across every backend adapter, never re-derived per backend.

---

## Consequences

**(+)** Command-injection surface is **zero by construction**; the invariant is backend- and sync/async-independent; the `shell:true` carve-outs are explicit, enumerated, and auditable. A single security law covers every subprocess path the product takes on any host.

**(−)** `shell:true` carve-outs still exist (plugin-hooks, Windows wrapper resolution) and rely on the discipline that args stay arrays. Today's enforcement is **advisory** (the `authority-enforcer` scan warns; ADR-G-020 V1.0 is soft), so a violation is caught at scan/audit time, not hard-blocked at runtime — that is the ADR-094 + SPAWN-1 roadmap. The Windows `DEP0190` carve-out is a known sharp-edge until SPAWN-1 lands.

---

## References / Absorbed

- **Absorbs:** ADR-006 (spawnSync Security Pattern — array-args security invariant + documented carve-outs).
- **Axis partner:** ADR-D-002 (Test Infrastructure & Hermeticity — async-`spawn` default, `spawnSync` sanctioned exception; absorbed old ADR-087 async-io-hermeticity).
- **Backend partner:** ADR-G-014 (Spawn Backend, Options & Observation — uniform invariant across backends; absorbed old ADR-007 SpawnOptions + ADR-089).
- **Enforcement partner:** ADR-G-020 (Authority, Roles, Flow & Enforcement — advisory→hard) + ADR-094 (flag-gated enforcement vein).
- **Born work-items:** SPAWN-1 (Windows `DEP0190` carve-out hardening — MASTER-PLAN, P1).
- **Direction:** `.analysis/adr-review-crosswalk.md` (row 006 → ADR-G-002), `.analysis/adr-governance-redesign-plan.md`.
