# ADR-G-016: Product Vision — Product, Not Service

**Class:** ADR-G (Global / Constitution) · **Scope:** global+project · **Immutable:** yes · **Source:** publisher · **Enforcement:** today=identity-constitution — every feature/decision validated against the 4 inviolable principles (community-core = ALL features MIT; local-first/free/privacy; core never phones home) — discipline, not yet a CI gate (PRODUCT-IDENTITY-GUARD) → tomorrow=MOD-SPLIT-CLARIFY + license-taxonomy (features-MIT vs governance-assurance-licensed) + MODULARIZE (deckent-solo/enterprise, single codebase, governance-depth NOT feature-gating) + NEVER-PHONE-HOME-POLICY (marketplace/model-catalog network carve-out) + CODE-LAYERS
**Status:** accepted · **Date:** 2026-06-30 · **Absorbs:** ADR-033 (Product Vision — Product Not Service, + MOD-SPLIT amendment)
**Crosswalk:** ADR-033 → ADR-G-016

> **Identity note (Alperen, 2026-06-30):** "Bunu geliştikçe netleştireceğiz ama temel tüm özellikleri içeren katmanımız deckent-core'dur — onu her zaman koruyup geliştireceğiz. Enterprise katman aslında daha katı kontrollü ve disiplinli bir üründür; **işlev farkı yoktur**, denetim ve yönetim mekanizması farkı vardır." This is the product-identity constitution; it evolves and sharpens as the product matures, but its core principles are inviolable.

---

## Context

Deckent is a **product, not a service** (old ADR-033, Sprint 134): a local-first AI orchestration tool anyone can install and run, open-source and free for the community, for everyone everywhere — privacy-preserving, never phoning home. As the direction matured (modularization, an optional hosted core, a desktop/mobile app, an enterprise layer, opt-in telemetry), the strict 2026-04 forbidden-list (no SaaS / no cloud / no enterprise-edition / no **Deckent** subscription — provider subscriptions are first-class) needed reconciliation: how do these optional layers coexist with "product, not service" without compromising the identity? This ADR records that reconciliation (decision (a) of the 2026-06-30 review).

---

## Decision (Today)

### 1. Four inviolable principles

```xml
<product-identity immutable="true">
  <principle id="1">Product, not service — the core is NEVER bound (captive) to any cloud.</principle>
  <principle id="2">Easy to install & run — "kur-çalıştır", anyone can.</principle>
  <principle id="3">Open-source, community-free — the community core is free (MIT).</principle>
  <principle id="4">Everyone, everywhere — solo user → largest enterprise; every OS/environment (the AIM, Law #2; today Linux/macOS/Windows-WSL2, native-Windows pending).</principle>
  <invariant>Local-first · privacy-preserving · never-phone-home: core orchestration makes ZERO network calls; telemetry/observability are always-off + local (.deckent/metrics.jsonl). Network exceptions are NON-core + bounded: marketplace (registry.deckent.dev) only on explicit command; model-catalog (models.dev) a default-fetch with 24h-cache + bundled offline fallback (must honor --offline/opt-out) — NEVER-PHONE-HOME-POLICY.</invariant>
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
  <structure>Single codebase + modular enterprise-layer (separately licensed). NOT a fork, NOT a separate Edition, NOT a separate repo of features.</structure>
  <taxonomy clarifies="MIT ↔ separately-licensed — resolves the README tension">
    (a) base capability / FEATURES = MIT, all, free — README's "no gated features / nothing behind a paywall" holds.
    (b) governance / compliance ASSURANCE depth = the enterprise layer, separately licensed — hard-RBAC, audit-immutability, tenant isolation, compliance/cert, management-plane. This is NOT a feature set; it is an assurance + control layer over the SAME single codebase (so "no separate Enterprise EDITION" = no fork, while the governance MODULE carries its own license).
    (c) hosted-access = opt-in, BYO-default, never required.
    (d) marketplace / model-catalog = network enrichment (explicit / opt-out / offline-fallback).
  </taxonomy>
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

**(−)** "Optional layers must not compromise core guarantees" is re-checked per feature (a hosted-core must keep BYO default) — but it is **discipline, not a CI gate** (PRODUCT-IDENTITY-GUARD). The never-phone-home invariant has bounded non-core network exceptions (marketplace explicit-command; model-catalog default-fetch + offline-fallback — NEVER-PHONE-HOME-POLICY). "Every OS" is an aim (today WSL2, not native Windows). The MIT↔separately-licensed boundary needs the taxonomy above to avoid reading as contradictory, and README wording ("no Deckent subscription", not "no subscription") must align (README-VISION-ALIGN). The exact enterprise-layer shape is still maturing; the repo-strategy axis (ADR-D-008) is kept explicitly separate.

---

## References / Absorbed

- **Absorbs:** ADR-033 (Product Vision — Product Not Service + MOD-SPLIT amendment).
- **Cross-ref:** ADR-G-031 (Enterprise Foundation — the governance-depth layer) · ADR-D-008 (Repo Strategy — separate axis) · ADR-G-033 (Dashboard/DESK — local-first app) · ADR-G-008 (hosted-core = optional provider).
- **Born work-items:** MOD-SPLIT-CLARIFY (community=all-features / enterprise=governance-depth + the (a)-(d) taxonomy) · MODULARIZE · CODE-LAYERS (5-layer, separate discussion) · PRODUCT-IDENTITY-GUARD (CI/docs-lint: required-cloud / default-network / paywall / native-only claim) · NEVER-PHONE-HOME-POLICY (marketplace/model-catalog network carve-out + --offline + test) · README-VISION-ALIGN ("no Deckent subscription", WSL2-not-native, license-taxonomy).
- **Memory:** `project_community_pro_split_strategy` · `project_community_pro_split_strategy` · `feedback_dual_perspective_dogfood_product`.
