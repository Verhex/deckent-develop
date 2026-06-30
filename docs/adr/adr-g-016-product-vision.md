# ADR-G-016: Product Vision — Product, Not Service

**Class:** ADR-G (Global / Constitution) · **Scope:** global+project · **Immutable:** yes · **Source:** publisher · **Enforcement:** identity-constitution (every feature/decision validated against the 4 principles)
**Status:** accepted · **Date:** 2026-06-30 · **Absorbs:** ADR-033 (Product Vision — Product Not Service, + MOD-SPLIT amendment)
**Crosswalk:** ADR-033 → ADR-G-016

> **Identity note (Alperen, 2026-06-30):** "Bunu geliştikçe netleştireceğiz ama temel tüm özellikleri içeren katmanımız deckent-core'dur — onu her zaman koruyup geliştireceğiz. Enterprise katman aslında daha katı kontrollü ve disiplinli bir üründür; **işlev farkı yoktur**, denetim ve yönetim mekanizması farkı vardır." This is the product-identity constitution; it evolves and sharpens as the product matures, but its core principles are inviolable.

---

## Context

Deckent is a **product, not a service** (old ADR-033, Sprint 134): a local-first AI orchestration tool anyone can install and run, open-source and free for the community, for everyone everywhere — privacy-preserving, never phoning home. As the direction matured (modularization, an optional hosted core, a desktop/mobile app, an enterprise layer, opt-in telemetry), the strict 2026-04 forbidden-list (no SaaS / no cloud / no enterprise-edition / no subscription) needed reconciliation: how do these optional layers coexist with "product, not service" without compromising the identity? This ADR records that reconciliation (decision (a) of the 2026-06-30 review).

---

## Decision (Today)

### 1. Four inviolable principles

```xml
<product-identity immutable="true">
  <principle id="1">Product, not service — the core is NEVER mahkum (bound) to any cloud.</principle>
  <principle id="2">Easy to install & run — "kur-çalıştır", anyone can.</principle>
  <principle id="3">Open-source, community-free — the community core is free (MIT).</principle>
  <principle id="4">Everyone, everywhere — solo user → largest enterprise; every OS/environment.</principle>
  <invariant>Local-first · privacy-preserving · never-phone-home (telemetry opt-in + consent only).</invariant>
</product-identity>
```

### 2. Community-core = ALL features; optional layers must not compromise it

The **community core (`deckent-core`)** contains **every base feature**, is always protected and developed, and stays **local-first + free + no-required-cloud + privacy** forever. **Optional layers are permitted** *only as long as they do not compromise the core's local-first / free / privacy guarantees*:

```xml
<optional-layers permitted-if="core-guarantees-intact">
  <layer name="enterprise-module" license="separate">modular, same codebase, NOT a fork</layer>
  <layer name="hosted-deckent-core" mode="opt-in" default="BYO">hosted is never required; the core never depends on it</layer>
  <layer name="desktop-mobile-app" kind="local-first-client">not a cloud; ADR-G-033/DESK</layer>
  <layer name="enterprise-console">on the modular enterprise layer</layer>
  <layer name="telemetry" mode="opt-in-consent">never-phone-home by default</layer>
</optional-layers>
```

"Servis değil" means *the core is never bound to a cloud*; hosted/app/console are **additional options**, not a mandate.

### 3. Community ↔ Enterprise = governance depth, NOT feature-gating

```xml
<mod-split>
  <community-core>ALL features. Always protected + developed. Full functionality.</community-core>
  <enterprise-layer>
    SAME functionality — NO feature-gating. The difference is depth of CONTROL,
    DISCIPLINE, AUDIT/GOVERNANCE and MANAGEMENT (RBAC hard-enforcement, audit
    immutability, tenant management, policy governance, compliance, delegated
    approval). Enterprise = "the same product, more strictly governed."
  </enterprise-layer>
  <structure>Single codebase + modular enterprise-layer (separately licensed). NOT a fork, NOT a separate repo of features.</structure>
</mod-split>
```

This is the **MOD-SPLIT** refinement: the community↔enterprise boundary is governance/audit/management depth, not a paywalled feature set. (Repo strategy — the private-develop ↔ public-product axis, and a possible `deckent` + `deck-ent` split — is a *separate* axis handled in ADR-D-008; not to be conflated with this license/governance axis.)

---

## Intent / Roadmap (Tomorrow)

- This vision **sharpens as the product matures** (Alperen) — the optional layers (hosted-core, app, enterprise-console) are designed but their exact shape clarifies with delivery.
- **MODULARIZE** (deckent-solo / deckent-enterprise, two licenses, single codebase) lands *after* the ADR revision (MASTER-PLAN: MODULARIZE; ties ADR-G-031 enterprise foundation + the CODE-LAYERS 5-layer architecture, discussed separately).
- The enterprise layer's depth = the god-level gaps mapped in ADR-G-031 (management-plane, custom-RBAC, hard-enforcement-V2, runtime-tenant-isolation, SCIM, audit-export/compliance).

---

## Consequences

**(+)** The identity is reconcilable with growth: optional cloud/app/enterprise layers are explicitly permitted *without* turning the core into a service, because the core never depends on them. The community user gets the full product free; enterprise pays for governance depth, not features — a clear, honest boundary.

**(−)** "Optional layers must not compromise core guarantees" is a design constraint that must be re-checked per feature (e.g., a hosted-core offering must keep BYO the default). The exact enterprise-layer shape is still maturing (forward work). The repo-strategy axis (ADR-D-008) is easy to conflate with the license axis — kept explicitly separate.

---

## References / Absorbed

- **Absorbs:** ADR-033 (Product Vision — Product Not Service + MOD-SPLIT amendment).
- **Cross-ref:** ADR-G-031 (Enterprise Foundation — the governance-depth layer) · ADR-D-008 (Repo Strategy — separate axis) · ADR-G-033 (Dashboard/DESK — local-first app) · ADR-G-008 (hosted-core = optional provider).
- **Born work-items:** MOD-SPLIT-CLARIFY (community=all-features / enterprise=governance-depth) · MODULARIZE · CODE-LAYERS (5-layer, separate discussion).
- **Memory:** `project_deckent_positioning` · `project_community_pro_split_strategy` · `feedback_dual_perspective_dogfood_product`.
