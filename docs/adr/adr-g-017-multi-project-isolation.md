# ADR-G-017: Multi-Project Isolation

**Class:** ADR-G (Global / Constitution) · **Scope:** global+project · **Immutable:** yes · **Source:** publisher · **Enforcement:** today=4-layer isolation model — per-project directory (real) + AES-256-GCM credential encryption (shipped but a **single GLOBAL vault**, per-project keying NOT built) + symlink-aware `realpath` scope (helper+tests only, **NOT wired into runtime authority**) + global/project config boundary (real); runtime scope enforcement **advisory/soft** (ADR-G-020 V1) → tomorrow=hard-enforce scope (ADR-G-020 Layer-2 V2 + TOOL-SCOPE) + enterprise multi-tenancy as a modular layer (ADR-G-031)
**Status:** accepted (provisional — Layer-2 per-project credential-keying + Layer-3 symlink-authority-wire are NOT shipped; global vault + helper-only today) · **Date:** 2026-06-30 · **Absorbs:** ADR-034 (Multi-Project Isolation — Per-Project Security Boundaries) · **Supersedes:** —
**Crosswalk:** ADR-034 → ADR-G-017

> **Note (code-grounded, 2 corrections):** (1) The symlink-aware `isWithinScope()` helper **is** implemented (`fs.realpathSync()` → boolean) **and test-covered, but is NOT wired into the live authority path** — runtime `checkWorkerAuthority()` → `checkAuthority()` uses **path-normalization only** (`normalizePath` + prefix-match, no `realpathSync`), i.e. exactly the "path-normalization-only" approach this ADR's rejected-alternatives calls insufficient. So the symlink-bypass threat is closed at the helper/test level, not in enforcement (SYMLINK-AUTHORITY-WIRE). (2) Even when wired, ADR-G-020 V1 runtime scope enforcement is **advisory/soft** (warn + event, not hard-block); the hard-flip is post-GA V2. "Vulnerability closed / blocks" = design intent, not today's runtime guarantee.

---

## Context

A single user routinely orchestrates several projects side-by-side on one machine. Each project owns its own `.deckent/`, `.brain/`, `.tasks/`, and `.locks/` directories; the isolation existed in practice but had never been formally defined, threat-modeled, or made testable.

**Critical distinction — multi-project ≠ multi-tenant.** This ADR governs isolation between *one user's* projects on *one machine*. The SaaS scenario of 10,000 tenants sharing a server is a **different** problem, deliberately out of scope here and constrained by the product-vision ADR (**ADR-G-016**); enterprise multi-tenancy arrives later as a *modular* layer (**ADR-G-031**), never by weakening this per-project model.

A Sprint-132 security audit surfaced the concrete threats this ADR closes:

1. **Sibling-project scope bypass** — a worker in Project A creates a symlink to `../project-b/src/secret.ts` and slips past a path-only scope check.
2. **Credential leakage** — project-specific API material in global config is read by a sibling project.
3. **Global-state pollution** — one project's `.deckent/config.json` edit silently changes another project's behavior.
4. **Symlink-cycle DoS** — recursive symlinks spin the scope resolver forever.

Sprint-133 shipped AES-256-GCM credential encryption — **but as a single GLOBAL vault** (`~/.deckent/credentials/` + `~/.deckent/.keyring`), **not** the per-project, projectRoot-keyed model this ADR's Layer-2 originally described (that per-project keying was planned in Sprint 134 and **never built** — design-doc §4.2). What also remained un-formalized was the scope-bypass defense and the global/project config-sharing rules.

---

## Decision (Today)

Multi-project isolation is **four layers**:

```xml
<isolation-layers>
  <layer n="1" name="Per-Project Directory Isolation" status="formalized">
    Each project owns independent directory roots — .deckent/ (config, agent/skill
    pool, metrics), .brain/ (decisions, memory, retro, patterns), .tasks/ (task
    files, heartbeat, result, lock), .locks/ (file locks). No cross-reference:
    a project's .brain holds only that project's history.
  </layer>
  <layer n="2" name="Credential Encryption" status="PARTIAL — global vault shipped; per-project NOT built">
    AES-256-GCM credential encryption IS shipped (src/core/credential-encryption.ts:
    ALGORITHM='aes-256-gcm', createCipheriv) — but as a SINGLE GLOBAL VAULT:
    ~/.deckent/credentials/<provider>.json, encrypted with one master key in
    ~/.deckent/.keyring (or DECKENT_MASTER_KEY), shared across ALL projects. The
    per-project .deckent/credentials.enc + projectRoot/HKDF key-derivation +
    sibling-cross-read-fail was PLANNED (Sprint 134) but NEVER IMPLEMENTED (design-doc
    §4.2 explicitly: "NOT YET IMPLEMENTED ... cross-project credential decryption
    protection does not currently apply"). So sibling-project credential isolation does
    NOT currently hold — it is a global vault (CRED-PER-PROJECT). Distinct from the
    .deck/Ed25519 secret system of ADR-G-005 (complementary).
  </layer>
  <layer n="3" name="Symlink-Aware Scope Enforcement" status="HELPER ONLY — not wired into runtime authority">
    isWithinScope() (src/agents/worker.ts) resolves the target with fs.realpathSync()
    before matching (symlink outside scope → real path → fails; recursive ELOOP → fails),
    and is test-covered. BUT it is NOT called by the live authority path: runtime
    checkWorkerAuthority() → checkAuthority() (authority-enforcer.ts) does
    path-normalization-ONLY (normalizePath + prefix-match, no realpathSync) — the very
    approach §rejected-alternatives calls insufficient against symlink bypass. So the
    symlink defense exists as a helper+tests, NOT in enforcement (SYMLINK-AUTHORITY-WIRE).
    Even once wired, the violation is advisory (warn + event, ADR-G-020 V1) — throw/block
    is design intent (V2).
  </layer>
  <layer n="4" name="Global vs Project Config Boundary" status="documented">
    ~/.deckent/config.json (global) vs .deckent/config.json (project), explicit
    sharing rules below.
  </layer>
</isolation-layers>
```

### Layer 4 — config boundary (sharing rules)

| Field | Scope | Sharing rule |
|------|-------|--------------|
| `brain_provider`, `worker_provider` | Global OR Project | project override wins |
| `max_workers` | Global OR Project | project override wins |
| `brain_planning` | Global OR Project | project override wins |
| `min_tier`, `mode_preset` | Global OR Project | project override wins |
| `OPENAI_API_KEY`, `GOOGLE_API_KEY` | Environment | OS env var only — never stored in config |
| `telemetry_enabled` | Global OR Project (default **false**) | **opt-in, default-OFF** settable boolean; no sender wired (see below) |
| `verify_loop` | Project | project-specific, global default `true` |
| `auto_archive_directives` | Project | project-specific |
| Agent/skill pool | Project | per-project `.deckent/agents/`, `.deckent/skills/` |
| Sprint history | Project | per-project `.brain/sprints/` |

API keys are **never** stored in config files — config references the variable *name*, never the value (`config.ts:425/1798`); they are passed via environment. This removes global config as a credential-leakage vector. Layered config merge mechanics are governed by **ADR-G-001**.

**Telemetry accuracy (correcting a prior overstatement):** `telemetry_enabled` is a **settable, default-OFF opt-in** boolean (`config.ts:1862`), *not* a "hard-coded false." No telemetry **sender** is wired — a `grep` finds zero phone-home calls gated on the flag — so the no-phone-home guarantee currently holds via **absence of a sender**, not via a hard-coded flag. The real opt-in telemetry is forward work (**FB-1**) and, when built, must honor default-off + explicit consent (**ADR-G-030**) and the air-gapped / never-phone-home pillar.

### Rejected alternatives (and why)

Sandboxed worker process (chroot/namespace) — over-complex, cross-platform-incompatible (macOS chroot limited), disproportionate to the product. Path-normalization-only — hardlink/symlink bypass still possible. Worker-level FS virtualization — Node `fs` incompatible, high cost. Docs-only — leaves the audit finding open. Docker-per-project — install friction, conflicts with the "install and run" principle (**ADR-G-016**).

---

## Intent / Roadmap (Tomorrow)

- **Hard-enforce scope (V2).** The advisory scope check becomes a **hard block**: a write outside `scope.filesWrite` is denied, not merely warned. This rides the **ADR-G-020** Layer-2 enforcement upgrade (the ADR-G-020 flag-gated vein graduating to default-on, post-GA V2) plus a **TOOL-SCOPE** tool that makes scope analysis/approval/edit first-class and terminal-trackable.
- **Enterprise multi-tenancy as a modular layer.** Genuine SaaS multi-tenant isolation (per-tenant boundaries, k8s pod isolation, tenant-scoped audit) is built **on top** of this per-project model as the enterprise layer (**ADR-G-031**), never by relaxing it. multi-project remains the solo/local truth; multi-tenant is additive.
- **FB-1 opt-in telemetry.** A consent-gated, default-OFF self-operation feedback loop (operation-metrics only, never project content) under **ADR-G-030** consent + the air-gapped pillar — wiring the sender that today deliberately does not exist.

---

## Consequences

**(+)** The Sprint-132 symlink scope-bypass finding is addressed by design (`realpathSync` resolution + ELOOP handling); per-project isolation rules are now formal and testable; the global/project config boundary is documented, so a new field's scope is explicit; credential isolation (AES-256-GCM, per-project-keyed) is formalized; and "multi-project ≠ multi-tenant" is settled, preventing wrong-direction PRs.

**(−)** **Two of the four layers are not yet enforced as described:** Layer-2 credential encryption is a single GLOBAL vault, not per-project-keyed — sibling credential isolation does NOT hold (CRED-PER-PROJECT); Layer-3's symlink-safe `isWithinScope()` is a helper+tests but the live `checkAuthority()` is path-normalization-only — symlink-bypass is not closed in enforcement (SYMLINK-AUTHORITY-WIRE). When wired, `isWithinScope()` adds a `realpathSync()` disk I/O per check and must handle deleted symlink targets + cross-platform ELOOP; and the runtime guarantee stays **advisory** until V2 (ADR-G-020). Project-root resolution is `process.cwd()`-based (ROOT-DISCIPLINE: needs explicit `ctx.projectRoot`/`--root` for shared MCP/daemon hosts). The config-boundary table must be updated whenever a new field is added.

---

## References / Absorbed

- **Absorbs:** ADR-034 (Multi-Project Isolation — Per-Project Security Boundaries; 4-layer model, Sprint-132 audit, Sprint-133 AES credential encryption, telemetry-accuracy amendment).
- **Product boundary:** **ADR-G-016** (Product Vision — Product Not Service) — multi-tenant out-of-scope at the core; "install and run" principle.
- **Config merge:** **ADR-G-001** (Layered Config & Scope Precedence) — global vs project mechanics.
- **Secret system:** **ADR-G-005** (Secret File System & Zero-Worker-Exposure) — `.deck`/Ed25519; complementary to and distinct from Layer-2 AES-256-GCM credential encryption.
- **Enforcement authority:** **ADR-G-020** (Authority, Roles, Flow & Enforcement) — advisory→hard scope flip (V1→V2, ADR-G-020 vein).
- **Enterprise layer:** **ADR-G-031** (Enterprise Foundation) — multi-tenancy as a modular layer atop this model.
- **Consent / telemetry:** **ADR-G-030** (Consent-Based Provisioning & Install) — FB-1 opt-in telemetry consent gate.
- **Born work-items:** **CRED-PER-PROJECT** (per-project `.deckent/credentials.enc` + projectRoot/HKDF key-derivation + sibling-cross-read-fail — the planned-not-built Layer-2; P1) · **SYMLINK-AUTHORITY-WIRE** (wire `isWithinScope` realpathSync into `checkWorkerAuthority`/`checkAuthority` — close symlink-bypass in enforcement; P1) · **ROOT-DISCIPLINE** (explicit `ctx.projectRoot`/`--root` for MCP/REPL/daemon; cwd-fallback non-canonical) · TOOL-SCOPE (scope analyze/approve/edit tool + hard-enforce) · ENTERPRISE-MULTI-TENANCY (ADR-G-031 ENT-* modular layer) · FB-1 (consent-gated opt-in telemetry sender).
- **Direction:** `docs/design/multi-project-isolation.md`, memory `project_air_gapped_offline_pillar`, `feedback_zero_hardcode_live_data`; owner-approved global-install + project-scope priority.
