# ADR-D-008: Develop / Product Repo Strategy

**Class:** ADR-D (Dogfooding / Dev) · **Scope:** dev · **Immutable:** no · **Source:** publisher+contributor · **Enforcement:** today=single-repo compact-monolith development (no develop→product sync script) + audit-immutable via managed-docs registry-absence (`docs/audits/**` unregistered in `.deckent/docs.json`) → tomorrow=GA-2 one-time public Core migration + ADR-G-041 private Enterprise add-on repo, no Core fork/copy
**Status:** accepted · **Date:** 2026-06-30 · **Absorbs / Rewrites:** ADR-065 (Develop/Product Two-Repo Split)
**Crosswalk:** ADR-065 → ADR-D-008 (REWRITE)

> **Decision change (Alperen, 2026-06-30):** ADR-065's continuous-sync two-repo model will NOT be applied. We continue from a SINGLE repo; when the product reaches its final state we MOVE the code to the `deckent` repo — a one-time migration, not an ongoing sync script.

> **Amendment — 2026-08-21 (ADR-G-041):** `ENTERPRISE-REPO-STRATEGY` is no longer open. Physical separation remains deferred until product/contract stability gates pass; the target is a public MIT `deckent` Core/community repo plus a private commercial Enterprise add-on repo containing no Core source copy. The repositories compose through published semver contracts/module manifests, not continuous source sync or a product fork. [Normative decision](./adr-g-041-core-enterprise-modular-architecture.md).

---

## Context

Old ADR-065 proposed two continuously-synced repos: a private `deckent-develop` (full history) and a public `deckent` (orphan-commit snapshots) kept in sync by `scripts/sync-to-product.mjs`. After 200+ sprints the develop repo is heavy with internal artifacts (`.brain/`, `.deckent/archive/`, `docs/audits/`) that are noise for public users, and historical audit reports were once corrupted by an automated counter (the audit-immutable concern). The 2026-06-30 review **rewrites** the strategy: drop the continuous-sync model in favor of a single repo + a one-time migration, and leave the enterprise-layer repo question open.

---

## Decision (Today)

```xml
<repo-strategy>
  <single-repo>Development continues in ONE repo (currently `deckent-develop`).
    No ongoing develop→product sync script.</single-repo>
  <one-time-migration>When the product reaches its final state, the code is MOVED
    (one-time) to the `deckent` repo. (Irreversible — archive the training-data mine /
    sensitive history BEFORE migrating; cf. project_clean_repo_migration_and_training_data.)</one-time-migration>
  <audit-immutable>Historical audit reports (docs/audits/sprint-NNN/) remain immutable
    after a sprint closes. Enforced primarily by registry-absence: docs/audits/** is
    NEVER registered in .deckent/docs.json (managed-docs never touches unregistered docs).
    A literal path-guard would be defense-in-depth.</audit-immutable>
</repo-strategy>
```

> **Axis clarity:** This (develop↔product) is the **vitrine axis** (private internals → public product). It is SEPARATE from the **license/governance axis** (community ↔ enterprise, ADR-G-016 MOD-SPLIT = single codebase + modular enterprise-layer, NOT a fork). Do not conflate.

---

## Intent / Roadmap (Tomorrow)

- **ENTERPRISE-REPO-STRATEGY (resolved by ADR-G-041):** public `deckent` Core/community repo + private Enterprise add-on repo; no Core source copy, no fork, published semver contracts/module manifests only. Physical extraction waits for the declared product/contract stability gates.
- **GA-2:** the one-time public migration (`deckent-develop` → `deckent`) at product-final + sensitive-scrub + monorepo/split decision.
- Possible literal `docs/audits/**` path-guard (defense-in-depth over registry-absence).

---

## Consequences

**(+)** No ongoing sync-script maintenance / EXCLUDE-list drift; a single source of truth during development, with a clean one-time public migration when ready. Audit immutability preserved. The vitrine axis is explicitly separated from the license axis.

**(−)** The one-time migration is irreversible (requires pre-migration archival of training-data/sensitive history). The enterprise-layer repo question is open (deckent + deck-ent?), pending the modularization + code-layers discussion.

---

## References / Absorbed

- **Absorbs / Rewrites:** ADR-065 (continuous-sync two-repo → single-repo + one-time migration).
- **Cross-ref:** ADR-G-016 (Product Vision — MOD-SPLIT license axis, SEPARATE) · ADR-D-006 (code architecture) · ADR-G-019 (ADR-D convention under the taxonomy) · GA-2 (MASTER-PLAN).
- **Born / MASTER-PLAN:** ENTERPRISE-REPO-STRATEGY · MODULARIZE · CODE-LAYERS (5-layer, separate discussion) · GA-2.
- **Memory:** `project_clean_repo_migration_and_training_data` · `project_clean_repo_migration_and_training_data`.
