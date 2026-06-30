# ADR-G-030: Consent-Based Provisioning & Install

**Class:** ADR-G (Global / Constitution) · **Scope:** global+project · **Immutable:** yes · **Source:** publisher · **Enforcement:** today=single provisioner module, consent-gated + OS-aware + `npm`-whitelist + **no-silent-sudo** (a reusable trust-DNA consent anchor) → tomorrow=natural-language setup (ONB-CHAT) + onboarding wizard (ONB-1) + consent-gated provider auth-probe (PSL-6) + global-install
**Status:** accepted · **Date:** 2026-06-30 · **Absorbs:** ADR-063 (Consent-Based Prerequisite Provisioning) · **Supersedes:** —
**Crosswalk:** ADR-063 → ADR-G-030

---

## Context

`deckent init` / `deckent doctor` originally only **detected** missing prerequisites and printed a hint string — there was no install path anywhere in the codebase (`spawnSync('npm', ['install', …])` was simply absent), even though the blueprint claimed "tmux auto-installed on first run." For the public beta the critical-path goal is a frictionless install ("anyone can install & use it"): a non-developer running `deckent init` should be guided to a working setup, not handed a list of manual `npm i -g` commands.

But silently installing global packages or running an OS package manager is a security- and **trust**-sensitive act. It must never happen without explicit user consent. This tension — frictionless setup vs. no-surprise-installs — is resolved by making consent a hard gate, and the resulting pattern is reusable across every "install a missing prerequisite" surface deckent will ever grow.

---

## Decision (Today)

A single provisioning module (`src/core/provisioner.ts`) is the source of truth for *how a prerequisite is installed* — consent-gated and OS-aware:

```xml
<provisioner module="src/core/provisioner.ts">
  <step name="planInstall(tool, opts)" kind="pure">
    Deterministic ToolId → InstallPlan mapping:
      claude / codex / gemini → method='npm-global' (npm install -g <pkg>)
      tmux                    → method='os-package' (OS-aware: apt/dnf/pacman/brew)
      node / docker           → method='manual' (NEVER auto-installed: runtime / privileged)
  </step>
  <step name="installTool" kind="guarded-exec">
    Only 'npm-global' plans auto-execute, and ONLY when consent === true.
    Array args, shell:false (shell:true ONLY on win32 for the npm .cmd wrapper).
    Executable checked against PROVISIONER_BIN_WHITELIST (frozen ['npm'];
    sh/bash intentionally ABSENT). Non-zero exit → { status:'failed' } (never throws).
    'os-package' / 'manual' are surfaced as an instruction string the user runs —
    NO SILENT SUDO.
  </step>
  <step name="provisionMissing" kind="orchestration">
    mode ∈ prompt | yes | no-install
      prompt (default) — per-tool consent prompt (node:readline promptConfirm helper)
      yes (CLI --yes, MCP installMissing:true) — install all without prompting (CI)
      no-install (CLI --no-install) — legacy hint-only behavior preserved (backward compat)
  </step>
  <invariant name="single source of truth">
    getProviderInstallHint (both doctor.ts and doctor-format.ts copies) delegates the
    package mapping to planInstall — one mapping, three call-sites, legacy hint format kept.
  </invariant>
  <invariant name="MCP parity">
    deckent_init gains an installMissing opt-in. MCP has no interactive consent channel,
    so it is explicit opt-in (=== CLI --yes); default reports only.
  </invariant>
</provisioner>
```

### The trust-DNA anchor (reusable)

The consent pattern is **not** scoped to first-run provisioning — it is the canonical anchor for *every* "install/prepare a missing prerequisite" surface. It already generalized: Sprint-270 F1-IMG applied the same gate to docker-image preparation — `deckent doctor --fix-image` **never** builds without an explicit flag + interactive consent, and the code cites this ADR directly. **Every** future such surface — including the PSL-6 provider auth-probe family — is bound by this ADR's three invariants: **consent-gated**, **whitelist-restricted spawn**, **no silent sudo**.

### Rejected alternatives (and why)

Silent auto-install (no consent) — violates user trust and the security DNA. Keep hint-only — fails the frictionless-install goal. Bundle provider CLIs as deps — bloats the package and conflicts with the dependency-minimalism/provider-agnostic posture (**ADR-D-005**, **ADR-G-008**).

---

## Intent / Roadmap (Tomorrow)

- **ONB-CHAT — natural-language setup.** Setup happens conversationally in the native terminal ("set me up for a TypeScript project with Claude") — deckent plans, asks consent, and provisions, instead of the user running discrete commands. The consent gate is unchanged; the *surface* becomes NL.
- **ONB-1 — onboarding wizard.** A guided first-run wizard that walks a non-developer from zero to a working setup, each install step consent-gated by this module.
- **PSL-6 — consent-gated provider auth-probe.** Probing/establishing provider auth (the "is `claude` logged in?" / "install + authenticate" family) runs under this same consent + whitelist + no-silent-sudo contract — provider CLI package names (`@anthropic-ai/claude-code`, `@openai/codex`, `@google/gemini-cli`) stay centralized in `planInstall` (**ADR-G-008**).
- **Global-install.** A global `deckent` install seeds the consent-anchored provisioning flow so the same guarantees hold across all of a user's projects (paired with project-scope, **ADR-G-001** / **ADR-G-017**).

---

## Consequences

**(+)** `deckent init` becomes a real provisioner and closes the blueprint reality gap, while staying security-preserving: consent-gated, whitelist + shell-free spawn (companion to the **ADR-G-002** spawnSync pattern + `spawn-safety.ts`), no silent sudo. The single source of truth removes a duplicated install-hint mapping across three sites (DRY). It is backward compatible — `--no-install` preserves the prior hint-only behavior exactly. The pattern proved reusable (F1-IMG docker-image), so consent is now a load-bearing trust primitive, not a one-off.

**(−)** Global `npm i -g` may need elevated permissions on some setups — failures are *reported with the manual command* (graceful, non-fatal) rather than auto-escalating. OS-package installs (tmux on Linux) still require a manual user `sudo` step — by design. Provider CLI package names are centralized, so a vendor rename is a one-place update — but it *is* a place that must be maintained. The richer surfaces (ONB-CHAT, ONB-1, PSL-6, global-install) are roadmap; today the consent gate exists at the `provisionMissing` / `--fix-image` layer, not yet in a conversational wizard.

---

## References / Absorbed

- **Absorbs:** ADR-063 (Consent-Based Prerequisite Provisioning — `planInstall`/`installTool`/`provisionMissing`, `PROVISIONER_BIN_WHITELIST` frozen `['npm']`, 23 tests; Sprint 281 amendment: consent-pattern reused by F1-IMG docker-image anchor).
- **Spawn security:** **ADR-G-002** (spawnSync Security Pattern) — array-args / shell-free invariant; `PROVISIONER_BIN_WHITELIST` is a companion to `spawn-safety.ts`.
- **Dependency policy:** **ADR-D-005** (Dependency Policy & Inventory) — installs *external* CLIs on consent rather than bundling them; also the `node:readline`/`promptConfirm` consent-prompt helper.
- **Provider abstraction:** **ADR-G-008** (Provider Abstraction, Fleet & Native-Usage) — centralized provider CLI package names; PSL-6 auth-probe is provider-side.
- **Product promise:** **ADR-G-016** (Product Vision — Product Not Service) — the "anyone can install & use" / install-and-run promise; air-gapped / never-phone-home pillar.
- **Scope / install:** **ADR-G-001** (Layered Config & Scope Precedence) + **ADR-G-017** (Multi-Project Isolation) — global-install + project-scope; FB-1 opt-in telemetry inherits this consent gate.
- **Governance:** **ADR-G-019** (ADR Governance) — runtime contract record for the provisioning capability.
- **Born work-items:** ONB-CHAT (NL setup), ONB-1 (onboarding wizard), PSL-6 (consent-gated provider auth-probe), GLOBAL-INSTALL (seed consent-anchored provisioning across projects).
- **Direction:** memory `project_air_gapped_offline_pillar`, `project_deckent_everyone_everywhere`, `feedback_proactive_blocker_disclosure`; `.analysis/hermes-vs-deckent-direction-decisions.md` (ONB = P0, global-install + project-scope = P0).
