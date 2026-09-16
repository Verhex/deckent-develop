# Architecture decision records

## Product-user perspective

An architecture decision record (ADR) preserves why a consequential choice exists, its status, scope, authority, enforcement level, and relations to other decisions. Deckent's current authority is DB-first: ADR entries live in `.brain/memory.db`; Markdown under `.brain/exports/decisions.md` is a generated projection, not a second editable source of truth. [Evidence: owner Tur-2 contract; `src/core/constants.ts:67-75`; `src/core/memory-export.ts:478-506`]

### Four-layer taxonomy

ADR metadata supports four classes—`G`, `D`, `UG`, and `UP`—plus scope, immutability, source authority, and enforcement level. These fields are stored on memory entries and can be used by class-aware recall. [Evidence: `src/core/memory-types.ts:110-155,209-212`; `src/core/memory-store.ts:239-255,350-424,781-795`]

The class semantics are governed by ADR-G-019 and repository memory; this documentation does not invent expanded names where the current code only guarantees the class tokens. Use recall/export content for the authoritative meaning of a particular record. [Evidence: `.deckent/docs/core-memory/law_adr_inviolable.md:9-10`; `src/core/memory-types.ts:146-155`]

### Read and recall

```bash
deckent recall "ADR-G-020" --json
deckent memory list --type adr
```

The `recall` path was executed against the real binary in this audit with the query `Goal Mission Flow`; the ADR-specific example above was help/source verified but not executed. Memory query supports ADR-class and scope filters at the storage layer. [Evidence: real `recall ... --json`, 2026-08-01; `src/core/memory-query.ts:385-389`; `src/core/memory-store.ts:781-795`]

Before specifying work in an ADR-governed area, recall accepted decisions touching that area. A conflicting request does not silently supersede an accepted decision; it needs the appropriate amendment authority. [Evidence: `.deckent/docs/core-memory/law_adr_inviolable.md:9-10`; `AGENTS.md:124-128`]

### Authoring and enforcement

A durable ADR needs context and a decision, valid status, unique identity, taxonomy metadata where applicable, and explicit relations/enforcement. The validator recognizes legacy `ADR-NNN` plus `ADR-G`, `ADR-D`, `ADR-UG`, and `ADR-UP` headings in the generated decisions projection. [Evidence: `scripts/adr-validator.mjs:12-84,91-163`]

`enforcement_level` can express `advisory`, `runtime`, or `hard`; immutability and source authority are separate fields. A Markdown sentence alone is therefore not proof of enforcement—inspect the actual type/lint/test/runtime mechanism. [Evidence: `src/core/memory-types.ts:146-155`; `src/core/memory-store.ts:239-255`]

### Export safety

The exporter renders `summary.md`, `decisions.md`, `memory.md`, and `debt.md` from DB records. It refuses to overwrite an existing export with an empty rendering when the DB still contains entries, protecting against the recorded decisions-wipe failure. [Evidence: `src/core/memory-export.ts:478-530`]

Generated exports are evidence and browsing surfaces; they cannot create policy or override higher authority. [Evidence: `AGENTS.md:124-128`]

### Legacy dependency decisions, rechecked

The archived ADR-010 title says “single runtime dependency,” but its own later amendments had already replaced that rule with “minimal and ADR-justified.” The current package has **13 required runtime dependencies and 3 optional dependencies**, not the archived 13+1 inventory: `grammy` has replaced the listed `telegraf`, and `nodemailer` plus `openai` now join `discord.js` in the optional set. The archived package-by-package inventory is therefore provenance, not a current manifest. [Evidence: `package.json:100-131`; archived `architecture/adr/010-single-runtime-dependency.md`]

ADR-090's version decision remains accurate: the package declares `ink ^7.0.5`, `react ^19.2.7`, and `react-dom ^19.2.7`; the installed manifests observed in this audit resolve to 7.0.5/19.2.7/19.2.7. Its stronger isolation statement is stale, however: Ink is imported by onboarding as well as the REPL, while the bare CLI dynamically mounts the Ink REPL only for a TTY. Current status is `⚠️ partial match`: versions and the reconciled-TUI rationale hold; “only mounted by `runInkRepl`” does not. [Evidence: `package.json:109-111`; `src/cli/commands/onboard.ts:4-5`; `src/cli/entry.ts:698-713`; `src/cli/repl/run.tsx:677`]

## Dogfood / repository reality

| Area | State | Current repository finding |
|---|---|---|
| DB ADR schema | ✅ live | Memory entries carry taxonomy, authority, immutability, and enforcement metadata through additive migrations. |
| DB→Markdown guarded export | ✅ live | Four export targets use a non-empty DB/empty-render wipe guard. |
| ADR lint | ✅ live surface | `lint:adr` validates the generated decisions export by default. [Evidence: `package.json:42`; `scripts/adr-validator.mjs:170-187`] |
| Generated ADR reference index | ✅ current projection / ⚠️ input-authority question | The owner restored the pipeline-owned ADR/master-plan inputs and projections; `docs:ref` rebuilt the reference targets and `docs:ref:check` is 5/5 in sync. The generator still parses 51 Markdown ADR projections while accepted authority remains DB-first, so OQ-26 remains open. [Evidence: owner-verified pipeline run, 2026-08-02; `scripts/gen-reference-docs.mjs:88-133,234-249,359-409`] |
| Markdown as independent authority | not allowed | `.brain/exports/decisions.md` is a projection; hand-editing it cannot amend an ADR. |

The generator/input authority question is recorded in the code↔doc difference report. It must be resolved by the owning pipeline/runtime work, not by hand-editing generated documents.
