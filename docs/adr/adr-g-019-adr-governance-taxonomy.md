# ADR-G-019: ADR Governance & 4-Layer Taxonomy

**Class:** ADR-G (Global / Constitution) · **Scope:** global+project · **Immutable:** yes · **Source:** publisher · **Enforcement:** today=MADR-v3 + `lint:adr` validator (status/required-sections/dup-id; NOT yet class-metadata hard-validate) + DB-first taxonomy columns (write-only — read-path mapping pending) + prompt-injection via legacy-id `adr-selector` (structural/advisory) → tomorrow=ADR-G enforcement-engine (immutable runtime-validation via ADR-G-020 + its flag-gated vein, old ADR-094) + ADR-VALIDATOR-HARDEN + TAXONOMY-READPATH + ADR-SELECTOR-MIGRATE
**Status:** accepted (provisional — taxonomy decided + write-path live; lint:adr class-validation + DB read-path mapping + adr-selector class-awareness are partial) · **Date:** 2026-06-30 · **Absorbs:** ADR-036 (ADR Governance Integration) · **Supersedes:** —
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

Static "this is how it is now" is insufficient; an ADR must also state "this is where we are going, and why," so LLM-agents, contributors, and users all work aligned with the evolution direction. Large/complex ADRs (e.g. ADR-G-020, ADR-G-031, ADR-G-035) additionally use **XML-schema / explicit-heading section separation** for unambiguous structure. Format is MADR-v3 hybrid. **Validation scope (today):** `lint:adr` validates the `**Status:**` field, the required sections (Context / Decision / Consequence), and duplicate ids — it does **NOT** yet hard-validate the class-metadata header (Class / Scope / Immutable / Source / Enforcement) or the today/tomorrow authoring-standard (ADR-VALIDATOR-HARDEN). The class-metadata header is mandatory by convention, enforced at review, not by the validator.

**Marka-bağımsız ADR yazımı (owner amendment, 2026-08-22):** Normatif ADR metni rakip veya dış ürün adını mimari imza, benzetme, ödünç-model ya da karar otoritesi olarak taşımaz. Karar; Deckent'in kendi problem tanımı, invariants, repository evidence ve trade-off'larından türetilir. Bir üçüncü taraf adı yalnız gerçekten entegre edilen protocol/provider/service'in teknik subject'i olarak zorunluysa kullanılabilir; o durumda da ürün karşılaştırması veya mimari gerekçe değildir. Bu kural ADR-G, ADR-D, ADR-UG ve ADR-UP'nin tamamı için authoring/review gate'idir.

### 5. Storage, Recall & Injection (DB-first — see ADR-G-035)

ADRs live **DB-first** in `memory.db` (SSOT); `docs/adr/*.md` + `.brain/exports/decisions.md` are generated views. The `entries` schema carries class-aware columns — `adr_class` (G/D/UG/UP), `scope` (global/project), `immutable`, `source`, `enforcement_level` (ADR-G-035). **State-of-code (honest):** these columns are currently **WRITE-ONLY** — `insert` populates them, but `rowToEntry` does not map them back and `upsert` does not diff them, so structured **class/scope-aware recall is not yet wired** (TAXONOMY-READPATH). Today the **id-prefix** (`adr-g-NNN` / `adr-d-NNN`) carries the class, and recall is FTS5 + Task-DNA relevance over id/content. Injection into brain/worker/auditor prompts runs through `adr-selector.ts`, which still uses **legacy-flat id presets** (`adr-001`, `adr-087`, …) + numeric-only explicit-extraction (`ADR-012`, not `ADR-G-019`) — stale post-migration (ADR-SELECTOR-MIGRATE). The **class/scope-aware recall described next is the TARGET**, not today's behavior: a worker in a user project gets ADR-G (always) + relevant ADR-UG/UP and never ADR-D; a deckent-dev worker also gets ADR-D. Editing an ADR means updating **both** the `.md` and the DB so doc == DB (ADR-G-035 sync invariant).

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

**(−)** The taxonomy is decided and the write-path is live, but the **tooling is partial**: `lint:adr` does not hard-validate the class-metadata header (ADR-VALIDATOR-HARDEN); the DB class-columns are write-only so class-aware recall is not yet wired (TAXONOMY-READPATH); `adr-selector.ts` still uses legacy-flat ids (ADR-SELECTOR-MIGRATE). Two intentional numbering gaps (G-003→absorbed in G-020, D-003→folded to G-014) — documented, not back-filled. The enforcement-engine (ADR-G inviolability) is roadmap — today's protection is injection + advisory `lint:adr` + the ADR-094 dogfood vein (now within ADR-G-020). ADR-U management is a forward surface, so today only G/D are populated.

---

## References / Absorbed

- **Absorbs:** ADR-036 (ADR Governance Integration — MADR-v3, lint:adr, DB-first injection).
- **Enforcement partner:** ADR-G-020 (Authority, Roles, Flow & Enforcement) + ADR-094 vein (now within G-020).
- **Storage substrate:** ADR-G-035 (Memory Architecture — class-aware schema columns, FTS5, sync invariant).
- **Governs:** every ADR-G-*, ADR-D-*, and runtime ADR-UG-*/ADR-UP-*.
- **Born work-items:** ADR-AUTHORING-STD (this doc §4), ADR-LAYER (install-wiring), POLICY-ENGINE-EVAL, **ADR-VALIDATOR-HARDEN** (lint:adr → hard-validate class-metadata + today/tomorrow standard), **TAXONOMY-READPATH** (map `adr_class`/`scope`/`immutable`/… in `rowToEntry` + `upsert` → real class-aware recall), **ADR-SELECTOR-MIGRATE** (`adr-selector.ts` legacy-flat ids → class-aware `adr-g/d-NNN` scheme).
- **Direction:** `.analysis/adr-governance-redesign-plan.md`, memory `feedback_adr_documents_today_and_tomorrow` · `feedback_governance_aligns_with_direction_pivot`.

---

## Amendment — 2026-07-14: Machine-Readable Constraints & Enforcement Ladder (PCOMP-6 D4.5)

**Trigger:** Sprint-440 live case (task 440-001): a Brain-authored spec demanded a change that
violated accepted ADR-G-023; the contradiction was caught at the MOST EXPENSIVE point in the
chain — a mid-sprint worker NO_GO — because (a) the planner never sees ADRs (zero-config
planner prompt carries no decisions block), (b) no spawn-time check compares a task's demands
against accepted constraints, and (c) the spec-author's ADR recall was ad-hoc. Alperen's
methodology decision (karar, 2026-07-14): shift contradiction detection LEFT — defence in
depth (type/lint → planner → gate → worker), with the worker NO_GO demoted to a measured,
rarely-triggered last-resort fuse.

### Decision (Today)

1. **Enforcement ladder.** Every ADR's header `Enforcement:` field names its strongest level:
   `type` (encoded in the type system — violation cannot compile) > `lint` (a ratchet/linter
   fails the build) > `test` (a pinned test fails) > `advisory` (prose only). New ADRs SHOULD
   be born at `lint` or stronger where feasible; the count of advisory-only ADRs is a
   measurable debt (ratchet direction: down).
2. **Machine-readable constraints.** High-value ADRs additionally carry machine-readable
   constraint records. Canonical home today: `src/core/adr-constraints.ts` — one record per
   constraint `{adrId, plannerSummary, forbiddenPattern, message}`, kept in sync with the ADR
   prose (a governance test pins that every record's adrId exists and is accepted).
3. **Three consumers, one source.** The constraint table feeds:
   (a) **planner prompts** — both `buildPlanPrompt` and the zero-config
       `buildZeroConfigPlanPrompt` render a compact "Bağlayıcı ADR-kısıtları" block from
       `plannerSummary` lines, so contradicting tasks die before they are born;
   (b) **prompt-lint W7** (`adr-constraint-violation`) — spawn-time scan of each task's
       title/description/goCriteria against `forbiddenPattern` (warn-only until the linter's
       evidence-gated fail-closed flip);
   (c) the existing **worker ADR injection** — unchanged, now explicitly the LAST line of
       defence rather than the first.
4. **Principle.** A worker NO_GO caused by an ADR contradiction is a measured incident
   (prompt-lint ledger), not a success story.

### Intent / Roadmap (Tomorrow)

- Move constraint records into the DB ADR schema (structured column on `type='adr'` rows);
  generate `adr-constraints.ts` from it (single source becomes the DB, per DB-first law).
- Planner-side relevance selection via `adr-selector` (today: all constraint summaries — the
  table is deliberately small; revisit when it grows past ~10 records).
- W7 joins the linter's fail-closed flip when the warn-mode false-positive measurement clears.
