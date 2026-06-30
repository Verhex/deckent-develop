# ADR-G-019: ADR Governance & 4-Layer Taxonomy

**Class:** ADR-G (Global / Constitution) · **Scope:** global+project · **Immutable:** yes · **Source:** publisher · **Enforcement:** today=MADR-v3 + `lint:adr` validator + DB-first prompt-injection (structural/advisory) → tomorrow=ADR-G enforcement-engine (immutable runtime-validation via ADR-G-020 + its flag-gated vein, old ADR-094)
**Status:** accepted · **Date:** 2026-06-30 · **Absorbs:** ADR-036 (ADR Governance Integration) · **Supersedes:** —
**Crosswalk:** ADR-036 → ADR-G-019

> **Meta-note:** This is the governance-of-the-governance ADR. It defines the four ADR classes, their precedence, authoring standard, storage, and enforcement model. Every other ADR (ADR-G-*, ADR-D-*, and runtime-born ADR-UG-*/ADR-UP-*) is created, classified, stored, injected, and enforced according to this document.

---

## Context

Deckent's earlier governance (old ADR-036, Sprint 138) established: MADR-v3 hybrid format, a mandatory-read wiring, worker-prompt ADR injection (`adr-selector.ts`), a `lint:adr` validator (`scripts/adr-validator.mjs`), DB-first storage (ADRs in `memory.db` `type='adr'`, synced from `docs/adr/*.md`, exported to `.brain/exports/decisions.md`). That system worked — `lint:adr` is live-proven, ADR injection reaches workers — but it had **one flat class**: every ADR was an undifferentiated "deckent-internal" decision.

The 2026-06-30 full ADR review (89 ADRs, one-by-one) surfaced the gap: ADRs serve **four different audiences with different authority and lifecycle**, and conflating them is wrong —
- some are **inviolable runtime laws** the product carries to every user (how deckent *behaves*),
- some are **contributor conventions** that ship only with the dev install (how deckent is *built*),
- and the *user* needs their own ADR layer (global + per-project) that deckent **observes and adheres to** without ever weakening the product's own laws.

A flat model cannot express "the user may tighten but never violate deckent's core law," nor "this rule is contributor-only and must not reach an end user's prompt," nor "this law is immutable and fed only from the publisher's main repo." ADR-G-019 introduces the layered taxonomy that does.

---

## Decision (Today)

### 1. Four ADR Classes

```xml
<adr-taxonomy>
  <class id="ADR-G" name="Global / Constitution">
    deckent's core function laws (worker/brain/auditor/nervous + every subsystem):
    runtime behavior, orchestration, security/RBAC, evaluation integrity, memory,
    isolation, capability, approval, proof-of-function. LLMs CANNOT violate.
    immutable=yes · source=publisher (main repo only) · scope=global+project ·
    ships in BOTH global install AND every project install · applies to
    dogfood AND user (solo → largest enterprise, million-scale).
  </class>
  <class id="ADR-D" name="Dogfooding / Dev">
    how deckent is BUILT — contributor conventions (language/build/test/code-structure/
    dependency policy). source=publisher+contributor · revised under approval ·
    ships ONLY with the dev install (deckent@dev / upgrade @dev) · audience=contributors.
  </class>
  <class id="ADR-UG" name="User Global">
    the USER's own global ADRs (across all their projects / a Windows host).
    source=user · user-managed · ships in the user's global install ·
    deckent OBSERVES + adheres (worker/brain/auditor honor it). Starts empty; born at runtime.
  </class>
  <class id="ADR-UP" name="User Project">
    the USER's project-specific ADRs. source=user · user-managed · per-project ·
    deckent OBSERVES + adheres. Starts empty; born at runtime.
  </class>
</adr-taxonomy>
```

### 2. Precedence — **G > U > D**

On conflict, **ADR-G wins** (the user cannot violate deckent's core law). The user layer (UG/UP) overrides dev conventions (D) for the user's own environment. A user **may tighten** their own layer (add stricter UG/UP rules) but **may never loosen** an ADR-G. ADR-D governs only the deckent-development environment and never overrides a runtime law a user relies on.

```
ADR-G  (immutable, publisher)      ── highest, inviolable
  ▲
ADR-UG / ADR-UP (user-managed)     ── user tightens / customizes within G
  ▲
ADR-D  (dev/contributor)           ── lowest, dev-environment only
```

### 3. Numbering — class-internal + crosswalk

IDs are **class-internal sequential**: `ADR-G-001..NNN`, `ADR-D-001..NNN`. The U classes start empty and are created at runtime (`ADR-UG-001..`, `ADR-UP-001..` per user/project). The old flat `ADR-NNN` → new mapping is preserved in `.analysis/adr-review-crosswalk.md` (and, post-migration, in the DB `metadata.legacy_id`). Deprecated ADRs are **archived** (no active number; historical record kept), not renumbered. Intentional gaps (a number absorbed into another ADR) are documented, not back-filled.

### 4. Authoring Standard (ADR-AUTHORING-STD)

Every ADR — **especially ADR-G** — documents **both today and tomorrow, transparently**:

```
Context  →  Decision (Today: current-state)  →  Intent/Roadmap (Tomorrow: target-intent + why)  →  Consequences
```

Static "this is how it is now" is insufficient; an ADR must also state "this is where we are going, and why," so LLM-agents, contributors, and users all work aligned with the evolution direction. Large/complex ADRs (e.g. ADR-G-020, ADR-G-031, ADR-G-035) additionally use **XML-schema / explicit-heading section separation** for unambiguous structure. Format is MADR-v3 hybrid; the `**Status:**` field and the class-metadata header are mandatory and validated by `lint:adr`.

### 5. Storage, Recall & Injection (DB-first — see ADR-G-035)

ADRs live **DB-first** in `memory.db` (SSOT); `docs/adr/*.md` + `.brain/exports/decisions.md` are generated views. The `entries` schema carries class-aware columns — `adr_class` (G/D/UG/UP), `scope` (global/project), `immutable`, `source`, `enforcement_level` (ADR-G-035). Recall is **class/scope-aware**: a worker in a user project is injected ADR-G (always) + the relevant ADR-UG/UP, and never ADR-D; a deckent-dev worker also gets ADR-D. Injection into brain/worker/auditor prompts is automatic (`adr-selector.ts` + Task-DNA relevance). Editing an ADR means updating **both** the `.md` and the DB so doc == DB (ADR-G-035 sync invariant).

### 6. Roles

deckent **observes** user ADRs (UG/UP) and **adheres** to them at every layer (worker/brain/auditor); it **evolves customize-tools** per environment to satisfy them. The publisher alone feeds ADR-G (immutable). Contributors propose ADR-D under approval. Users author UG/UP via natural-language/chat/desktop (no hand-editing required).

---

## Intent / Roadmap (Tomorrow)

- **ADR-G enforcement-engine:** today ADR-G is carried by injection + advisory validation; tomorrow it is **runtime-inviolable** — LLM output that would breach an ADR-G is blocked, not merely logged. The mechanism is the flag-gated enforcement vein (old ADR-094, now within ADR-G-020) graduating to default-on (post-GA-V2) under ADR-G-020's authority layer, plus a centralized policy engine candidate (POLICY-ENGINE-EVAL — OPA/Rego or embedded; ADR-D-005 reframe removed the minimal-dep blocker).
- **ADR-U management surface:** users create/edit/retire ADR-UG/ADR-UP conversationally (native terminal + desktop app + CLI/MCP); deckent generates per-environment **customize-tools** to honor them and can contribute generalizable patterns back to the main repo.
- **Install-wiring:** global install seeds ADR-G; `@dev` install adds ADR-D; user install opens the ADR-UG/UP skeleton. (MASTER-PLAN: ADR-LAYER.)
- **Class/scope-aware vector recall:** ADR-G-035's opt-in local-embedding vector layer (never-calls-home) extends class/scope-aware retrieval to semantic matching.

---

## Consequences

**(+)** Authority is now expressible: "user tightens but cannot violate G" is enforceable; contributor-only rules never leak to end users; immutable laws have a single trusted source. The review's 89→~42 consolidation is itself an application of this taxonomy (G vs D split). Today+tomorrow authoring keeps agents aligned with direction, not just current state.

**(−)** Two intentional numbering gaps (G-003→absorbed in G-020, D-003→folded to G-014) — documented, not back-filled. The enforcement-engine (ADR-G inviolability) is roadmap, not today — today's protection is injection + advisory `lint:adr` + the ADR-094 dogfood vein (now within ADR-G-020). ADR-U management is a forward surface (MASTER-PLAN), so today only G/D are populated.

---

## References / Absorbed

- **Absorbs:** ADR-036 (ADR Governance Integration — MADR-v3, lint:adr, DB-first injection).
- **Enforcement partner:** ADR-G-020 (Authority, Roles, Flow & Enforcement) + ADR-094 vein (now within G-020).
- **Storage substrate:** ADR-G-035 (Memory Architecture — class-aware schema columns, FTS5, sync invariant).
- **Governs:** every ADR-G-*, ADR-D-*, and runtime ADR-UG-*/ADR-UP-*.
- **Born work-items:** ADR-AUTHORING-STD (this doc §4), ADR-LAYER (install-wiring), POLICY-ENGINE-EVAL.
- **Direction:** `.analysis/adr-governance-redesign-plan.md`, `.analysis/hermes-vs-deckent-direction-decisions.md`, memory `feedback_adr_documents_today_and_tomorrow` · `feedback_governance_aligns_with_direction_pivot`.
