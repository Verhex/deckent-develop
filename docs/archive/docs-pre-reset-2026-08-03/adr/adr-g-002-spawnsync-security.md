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

### 3. Windows-conditional shell carve-outs (census — narrow, deliberate)

Code-grounded census (2026-06-30) — the carve-outs are **Windows-conditional** (`shell: isWindows` / `shell: process.platform === 'win32'`), not unconditional `shell:true`:

- `src/core/plugin-hooks.ts` — sandboxed plugin-hook execution (Windows-conditional).
- `src/core/provisioner.ts` · `src/core/subscription.ts` · `src/providers/subprocess.ts` — Windows wrapper / provisioning calls (Windows-conditional shell).
- `src/core/provider.ts` is **no longer a `shell:true` carve-out** — it moved to the **SPAWN-1 pattern** (`cmd.exe /c` + `shell:false`: cmd.exe resolves the `.cmd`/`.ps1` wrapper via `PATHEXT` while Node keeps `shell:false`, side-stepping the DEP0190 injection edge). This is the **target pattern the remaining carve-outs migrate toward**.

Every carve-out **must keep args as arrays and never interpolate untrusted input** into a command string. The enumerated set above is the only sanctioned shell-using surface; a new one requires an ADR-G-002 amendment (tracked: SPAWN-1 carve-out-census + hardening).

### 4. Enforcement (today — advisory)

Compliance is tracked by the `ADR-006` compliance check (code-key `checkAdr006`, retained verbatim in code for stability — old ADR-006 **is** this record, now ADR-G-002) in `src/orchestra/authority-enforcer.ts` — a compile-time scan.

**Scan limitation (honest):** `checkAdr006` matches **literal `shell: true`** only. It does **not** catch conditional `shell: <expr>` (`shell: isWindows`, `shell: process.platform === 'win32'`), `execSync(commandString)`, or template/concat command construction — so the §1 invariant is only **partially** machine-enforced (born-item SHELL-SCAN-EXTEND). Per ADR-G-020 V1.0 the check is **advisory/soft** (warns + emits, no hard-block) by default; the ADR-094 **A9 gate is flag-gated** — when enabled it can downgrade a violation to NO_GO (default-off / fail-open today).

---

## Intent / Roadmap (Tomorrow)

- **Enforcement advisory→runtime:** today the ADR-006 scan only warns (and only on literal `shell:true`); tomorrow a subprocess constructed with `shell:true` + interpolated untrusted input is **blocked, not merely logged** — via the ADR-094 flag-gated enforcement vein graduating to default-on under ADR-G-020's authority layer. The runtime gate **wires the existing `spawn-safety.ts` `assertSpawnSafe`** (binary-whitelist + arg-sanitization — today a 0-caller primitive) into the spawn/backend callsites, and **extends `checkAdr006` beyond literal `shell:true`** (conditional-shell + `execSync` + command-string — SHELL-SCAN-EXTEND).
- **Windows carve-out hardening (SPAWN-1):** Node `DEP0190` (`shell:true` + args array) Windows leak + injection fix — tighten the `provider.ts` `.cmd`/`.ps1` resolution so the carve-out can never become an injection surface, moving toward a platform-adapter that resolves wrapper binaries without `shell:true` where the runtime allows. (MASTER-PLAN: SPAWN-1.)
- **Backend convergence:** as worker spawn moves to heterogeneous backends (ADR-G-014 — docker/subprocess/tmux/firecracker/cloud), the array-args invariant is carried **uniformly** across every backend adapter, never re-derived per backend.

---

## Consequences

**(+)** The array-args paths are **injection-free by construction**; the invariant is backend- and sync/async-independent; the shell carve-outs are explicit, enumerated, and auditable. A single security law covers every subprocess path the product takes on any host. (Residual: a few `execSync('<static git command>')` calls run a *static* command through a shell — no untrusted interpolation, low-risk — and any variable-command `execSync` paths migrate to `execFileSync`/array-args; born-item EXECSYNC-MIGRATE.)

**(−)** Windows-conditional shell carve-outs still exist (plugin-hooks, provisioner, subscription, subprocess) and rely on the discipline that args stay arrays. Enforcement is **advisory AND partial**: `checkAdr006` catches only literal `shell: true` (not conditional-shell / `execSync` / command-strings — SHELL-SCAN-EXTEND), warns rather than hard-blocks (ADR-G-020 V1.0 soft; ADR-094 A9 flag-gated), and the strong `spawn-safety.ts` primitive (`assertSpawnSafe`) is a 0-caller, not yet wired. The Windows `DEP0190` carve-out is a known sharp-edge until SPAWN-1 lands.

---

## References / Absorbed

- **Absorbs:** ADR-006 (spawnSync Security Pattern — array-args security invariant + documented carve-outs).
- **Axis partner:** ADR-D-002 (Test Infrastructure & Hermeticity — async-`spawn` default, `spawnSync` sanctioned exception; absorbed old ADR-087 async-io-hermeticity).
- **Backend partner:** ADR-G-014 (Spawn Backend, Options & Observation — uniform invariant across backends; absorbed old ADR-007 SpawnOptions + ADR-089).
- **Enforcement partner:** ADR-G-020 (Authority, Roles, Flow & Enforcement — advisory→hard) + ADR-094 (flag-gated enforcement vein).
- **Born work-items:** SPAWN-1 (Windows `DEP0190` carve-out hardening + carve-out-census + `spawn-safety.ts` `assertSpawnSafe` wiring — MASTER-PLAN, P1) · SHELL-SCAN-EXTEND (`checkAdr006` → conditional-shell + `execSync` + command-string detection) · EXECSYNC-MIGRATE (variable-command `execSync` → `execFileSync`/array-args; cross-ref ADR-087-W).
- **Direction:** `.analysis/adr-review-crosswalk.md` (row 006 → ADR-G-002), `.analysis/adr-governance-redesign-plan.md`.
