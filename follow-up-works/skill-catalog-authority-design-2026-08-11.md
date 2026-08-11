# Skill catalog authority — design and owner decision points (2026-08-11)

**Work ID:** `SKILL-CATALOG-AUTHORITY-001` (MASTER row 7012, `OPEN`, truth `1/~/0/?/0/?/?`, parent `AGENT-SKILL-001`, gates `G2,G1`).
**Decision owner:** Alperen.
**Status:** proposal only. This document changes no production code, no config, no manifest, no ADR and no MASTER row. It does not decide the V3 reconciliation (row 7121) — see §9.
**Companion:** the agent-side design for row 7011 (`follow-up-works/agent-catalog-authority-design-2026-08-11.md`, task 518-001). This document mirrors that structure and deliberately reuses its vocabulary (layer, precedence, effective record, determinism contract) so a single catalog-authority family emerges rather than two dialects.

## 0. Decision boundary

`HOLD` below means: no implementation may treat the item as settled until the owner records a decision. It is never a product verdict.

Three things this document is **not** allowed to do, and does not do:

1. **It does not decide the V3 profile reconciliation.** Row 7120 (`SKILLMD-INGEST-001`) is `BLOCKED` on the `SKILL_V3_PROFILE_RECONCILIATION_REQUIRED` conflict, whose successor is row 7121 (`SKILLMD-V3-RECONCILIATION-001`, `OPEN`, `P0`, and itself declared `DependsOn SKILL-CATALOG-AUTHORITY-001`). This design therefore specifies **how V3-profile state is carried as data** by the catalog, and stops there. Which profile a legacy V2-activation skill receives, and whether an activation block may ever stand in for a profile, stays with the owner and with row 7121.
2. **It does not edit production or config.** Every observation below is a read.
3. **It makes no coverage claim without file-level evidence.** Every claim in §2 carries a `path:line` anchor observed on 2026-08-11 in this working tree. Where a number comes from the MASTER row's own 2026-08-10 code-truth column rather than from this document's own observation, it is labelled as such.

## 1. Problem — one sentence

A skill has more lifecycle than an agent — it can be shipped, overridden, **generated at runtime and persisted**, quarantined, retired, profile-less and therefore unroutable, invalid, or credited with stats that live outside its manifest — yet there is no single authority that answers "*which* skills exist for *this* project right now, in what state, from which layer, and with which file as the body", so CLI, MCP, the worker prompt resolver, the routing adapter, the docs generators and the marketplace each answer it differently and disagree.

## 2. Call-site inventory — file-level evidence (2026-08-11)

### 2.1 The three resolvers that exist today

There is not one skill reader; there are three, with different layer coverage.

| # | Resolver | Entry point | Layers it sees | Evidence |
|---|---|---|---|---|
| R1 | **Pool loader** (richest) | `SkillPoolManager.loadSkills()` | project manifests **+ builtin package fallback + sidecar stats overlay** | `src/core/skill-pool.ts:315` (`loadSkills`), `:354` (`_loadBuiltinFallback`), `:323` + `:363` (sidecar overlay) |
| R2 | **Raw directory scanners** | `loadAllSkills()` / MCP handler | project manifests **only** — no builtin fallback, no sidecar | `src/cli/commands/skill.ts:76-95` (`readdirSync` + `JSON.parse`), `src/mcp/tools/skill-list.ts:27-44` (`readdirSync` + `JSON.parse`), `src/cli/commands/skill-marketplace.ts:69` |
| R3 | **Prompt body reader** | `resolveSkillPrompts()` | one hardcoded path per id — ignores the manifest's declared `entrypoint`, ignores the builtin layer | `src/orchestra/result-collector.ts:1012` (`join(projectRoot, '.deckent', 'skills', skillId, 'SKILL.md')`) |

R1 and R2 disagree by construction: `_loadBuiltinFallback` synthesises an in-memory `SkillDefinition` for a builtin id that was never materialised into the project tree (`src/core/skill-pool.ts:382-447`, `source: 'builtin'` at `:122`), and R2 has no equivalent branch. R3 disagrees with both: it never consults a pool at all.

**Observed today (directory-name listing, not a runtime pool execution):** `.deckent/skills/` holds 31 manifest directories; `src/core/builtins/skills/` holds 31; the sets differ by exactly two ids — `observability` exists only in the builtin package, `project-conventions` exists only in the project tree. Every one of the 31 project manifests declares `"entrypoint": "SKILL.md"`; 30 of 31 carry a `source` field; exactly **one** (`project-conventions`, `manifest.json:37`) carries a `profile` block. Row 7012's own 2026-08-10 code-truth column measured the same *shape* with different membership — "project raw catalog 30 while `SkillPoolManager` loads 31 via the package-only observability fallback, valid V3 profile count 0, CLI/MCP show 30". The membership moved between 2026-08-10 and 2026-08-11 because the first persisted generated skill (`project-conventions`) landed and was grandfathered into the builtins drift baseline. **The divergence class did not move.** That is the point: the drift is structural, not an incident.

### 2.2 Full consumer inventory

| Surface | Call site | Which resolver | Consequence of today's shape |
|---|---|---|---|
| CLI `skill list/info/…` | `src/cli/commands/skill.ts:76` | R2 | Builtin-only ids are invisible; sidecar stats are invisible — the table renders the git-tracked manifest's `stats`, not the effective ones |
| CLI `help` counter | `src/cli/commands/help.ts:170` (`listSkills().length`) | R1 | Reports a different count than `skill list` on the same tree |
| CLI marketplace | `src/cli/commands/skill-marketplace.ts:69`, sandbox at `:206` | R2 + sandbox | Publish/install path validates with `SkillSandbox`, not with the pool's validator |
| CLI REPL native tool | `src/cli/repl/native-tool-registry.ts:246` (`getSkill`) + `SkillLoadingCache` | R1 + cache | Cache reads `.deckent/skills/<id>/SKILL.md` directly (`src/core/skill-cache.ts:40`), so it repeats R3's entrypoint bypass |
| MCP `skill_list` | `src/mcp/tools/skill-list.ts:27` | R2 | Advertises `.deckent/skills/` as the source (`:62`); returns neither sandbox state nor manifest validity |
| MCP `catalog_parity` | `src/mcp/tools/catalog-parity.ts:129`, `:176` | R1 | Compares local pool to registry — a *fourth* notion of "the catalog" |
| Planning | `src/orchestra/sprint-planner.ts:747-748` (`loadSkills`) | R1 | Plan-time catalog is the rich one |
| Routing (V3 candidacy) | `src/orchestra/routing-plan-adapter.ts:88-92` (`validateSkillProfile`) | R1 | Only a **valid `profile`** makes a skill a V3 candidate; a profile-less skill loads and is never routed |
| Spawn / forced skills | `src/orchestra/sprint-spawner.ts:1011-1017` (`getSkill`, `enabled === false` → typed HOLD) | R1 | `enabled` is enforced **only** on the forced-skill path, via a second pool construction |
| Worker prompt assembly | `src/orchestra/result-collector.ts:1005-1044` → `buildWorkerPrompt` (`src/orchestra/sprint-spawner.ts:1031`) | R3 | The prompt the worker actually receives is resolved by the layer-blind reader |
| Task mode | `src/orchestra/task-mode-runner.ts:328` | R3 | Same |
| Generation + persistence | `src/orchestra/sprint-phases.ts:1122` → `saveGeneratedSkill` (`src/core/skill-pool.ts:531`) | writes | Manifest + rendered `SKILL.md` written together; `_generatedContent` deliberately stripped from the manifest (`:532-537`) |
| Stats finalisation | `src/orchestra/sprint-finalizer.ts:3295-3310` (`getSkill` → `saveSkillStats`) | R1 + sidecar | Effective stats land in `.deckent/stats/catalog-stats.json` (`src/core/skill-pool.ts:235`), **not** in the manifest CLI renders |
| Docs generators | `src/orchestra/managed-docs/content-generators.ts:676-677`, `template-renderer.ts:41-42` | R1 | Generated doc counts follow R1 and therefore contradict CLI/MCP output |
| Quarantine | `src/core/marketplace/skill-sandbox.ts:350-366` | writes | `renameSync` into `.quarantine/<id>` — a quarantined skill simply *vanishes* from every resolver; there is no quarantined **state**, only absence |
| CI manifest gate | `scripts/lint-manifests.mjs:88-96`, `:165` | mirrors R1's validator | Scans both trees; explicitly excludes `.tasks/agents/` (`:16`) |
| Builtin drift gate | `scripts/builtins-drift-check.mjs:47-49`, `:289` | both trees | Grandfathers known drift keys; the file itself states this is "grandfathered, NOT a canonicality decision" |

### 2.3 The five authority gaps this inventory proves

- **G1 — entrypoint is declared but never honoured.** `SkillDefinition.entrypoint` exists (`src/core/skill-types.ts:44`, default `'SKILL.md'` at `:106`), every project manifest sets it, and **no reader reads it**: R3 hardcodes the filename (`result-collector.ts:1012`), the cache hardcodes it (`skill-cache.ts:21,40`), the builtin fallback hardcodes it (`skill-pool.ts:113`). A skill whose body is `GUIDE.md` would load and then inject nothing.
- **G2 — no referenced-file authority.** A skill body may point at helper files (`scripts/`, `data/`); nothing resolves, validates, bounds or ships them. Row 7120's note records that owner approval on 2026-08-04 included referenced-files support in scope; there is no code that owns it.
- **G3 — validation is forked three ways.** `SkillPoolManager.validateSkillDefinition` (`src/core/skill-pool.ts:703-719`), the CLI's stricter-in-some-fields/looser-in-others Zod schema (`src/cli/commands/skill.ts:110-116`), and `SkillSandbox.validateSkillManifest` (`src/core/marketplace/skill-sandbox.ts:~320-340`) can reach three different verdicts on one file. `lint-manifests.mjs:29` explicitly aims to mirror only the first.
- **G4 — states exist as side effects, not as data.** `enabled` is a manifest boolean enforced on one path; *invalid* is an in-memory list on the last `loadSkills()` call (`src/core/skill-pool.ts:299-307`); *quarantined* is a directory move; *retired* does not exist at all — the only occurrences of skill retirement in the tree are a retro-writer **suggestion** (`src/orchestra/sprint-retro-writer.ts:146`, `:206`) and a comment about a retired prompt optimisation (`src/orchestra/prompt-token-optimizer.ts:161`). Nothing can express "this id existed, was withdrawn, and must not be re-used".
- **G5 — provenance is optional and untyped.** `source` is not in the `SkillDefinition` interface (`src/core/skill-types.ts:36-58`) yet is written by the builtin fallback (`skill-pool.ts:122`) and by generation (`temp-skill-generator.ts:517`, `source: 'learned'`), and appears in 30 of 31 project manifests. Row 7120 lists "typed `source` provenance" as still-to-do.

## 3. Proposed authority model

### 3.1 Layers and precedence

Five layers, ordered. Higher wins the **field-level** merge described in §3.6.

| # | Layer | Physical source (today) | Wins over |
|---|---|---|---|
| L1 | **Shipped built-in** | `src/core/builtins/skills/<id>/` (packaged; `bundle-builtins.mjs`) | — |
| L2 | **Project override** | `.deckent/skills/<id>/manifest.json` | L1 |
| L3 | **Generated / learned** | same directory, written by `saveGeneratedSkill` (`src/core/skill-pool.ts:531`), `provenance.kind = "generated"` | L1; **never silently over L2** — see D1 |
| L4 | **Quarantined** | `.quarantine/<id>/` (`skill-sandbox.ts:354`) | **suppresses** L1–L3 for that id, as a *state*, not a disappearance |
| L5 | **Retired** | catalog tombstone (new) | **suppresses and locks** the id permanently |

L4 and L5 are **not content layers**; they are *dispositions* that mask content. Modelling them as layers rather than as file-system absence is the single most important change in this proposal, because absence is indistinguishable from "never installed", and that ambiguity is exactly what makes clean-checkout vs long-lived-project non-deterministic (§5).

**Fail-closed rule.** An id present in L4 or L5 is never resolvable by any surface, including a `forceSkills` request. The correct response is the typed HOLD shape the spawner already implements for administratively disabled skills (`src/orchestra/sprint-spawner.ts:1011-1029`) — extended from `enabled:false` to `quarantined` and `retired`, with distinct reason codes so the operator learns *why*.

### 3.2 Path-safe stable IDs

The identifier problem is already recorded as a live semantic collision: row 7120 notes that `fm.name` in the SKILL.md open standard is an *identifier*, while deckent's `name` is a *display title*, and that the `fm.name → id` mapping must be typed and path-safe.

Proposed `SkillId` contract:

- Grammar: lowercase ASCII letters and digits with interior hyphens — first and last character must match `[a-z0-9]`, interior characters `[a-z0-9-]`, total length 1–64. No leading or trailing hyphen.
- **Path-safety is normative, not incidental.** The id is used as a directory name today by every writer (`skill-pool.ts:527`, `skill.ts:98`, `skill-sandbox.ts:351`). The contract therefore forbids `.`/`..`, any separator, any control or non-ASCII character, and any name reserved by a Windows filesystem (`CON`, `PRN`, `AUX`, `NUL`, `COM1..9`, `LPT1..9`, with or without extension) — per Immutable Law 2, the id must be safe on the whole matrix, not on Linux only.
- **Case-collision safety.** Because macOS and Windows are case-insensitive while Linux is not, two ids differing only in case are a **collision**, rejected at ingress, never a second catalog entry.
- **Namespacing.** A third-party/marketplace skill carries `publisher/id`; the on-disk directory uses a reversible encoding of the qualified id rather than a nested path, so directory depth never encodes authority.
- **Ids are never re-used.** Retirement (L5) makes the id permanently unavailable, mirroring the operation-catalog precedent (`docs/analysis/operation-catalog-authority-design-2026-08-06.md` §3.3), so audit rows, outcome records and sidecar stats keyed by id remain unambiguous forever.

### 3.3 Versioned catalog schema (`catalogSchemaVersion: 1`)

The proposal is **not** a new parallel file format. It is: `SkillDefinition` gains a small typed authority block, and the block — not directory position, not filename — becomes what readers consult.

```jsonc
{
  "catalogSchemaVersion": 1,          // schema of THIS envelope; readers reject unknown major
  "id": "secure-coding",              // §3.2 grammar; never re-used
  "version": "1.4.0",                 // semver of the skill's own content
  "name": { "en": "...", "tr": "..." },        // i18n-FIRST — display title, NOT the identifier
  "description": { "en": "...", "tr": "..." },

  "provenance": {                     // G5: typed, mandatory, never inferred from location
    "kind": "builtin",                // builtin | project | generated | imported | marketplace
    "publisher": null,                // required for marketplace/imported
    "producedBy": "sprint-517/task-517-004",   // for kind=generated: the run that authored it
    "importedFrom": null,             // for kind=imported: source format + origin (e.g. skill-md)
    "reviewedBy": null                // owner/reviewer identity when a human admitted it
  },

  "disposition": {                    // G4: state as DATA
    "state": "active",                // active | disabled | quarantined | retired
    "reasonCode": null,               // typed enum; required when state != active
    "since": "2026-08-11T00:00:00Z",
    "quarantine": null,               // { findingIds[], sandboxReportRef } when state=quarantined
    "supersededBy": null              // skill id, when state=retired and a successor exists
  },

  "entrypoint": {                     // G1: declared body, honoured by ALL readers
    "path": "SKILL.md",               // relative, normalised, must stay inside the skill root
    "format": "markdown",
    "contentDigest": "sha256:…"       // §5 determinism + §6 cache key
  },

  "referencedFiles": [                // G2: complete-package authority
    { "path": "scripts/check.sh", "role": "script", "digest": "sha256:…", "sizeBytes": 1234 }
  ],

  "routing": {
    "profileState": "absent",         // absent | present-invalid | present-valid | unresolved
    "profile": null,                  // capability-vector.ts SkillProfile shape when present
    "legacyActivation": { "…": "…" }, // migration INPUT/projection only — never a routability proof
    "routable": false                 // DERIVED, never hand-written — see §3.5
  },

  "promptInjection": { "position": "append", "maxTokens": 1500 },
  "priority": 0,
  "category": "domain",
  "composableWith": []
}
```

Non-negotiables in this schema:

- **i18n-FIRST.** `name`/`description` are locale maps. Today they are bare strings (`src/core/skill-types.ts:41,43`) and every surface renders them raw. Migration keeps a string readable as `{ en }` so no manifest breaks; new writes emit the map (project quality bar: user-facing strings never hardcoded to one language).
- **`stats` is not in the manifest's authority.** It already is not, in effect: the finalizer writes the sidecar (`src/orchestra/sprint-finalizer.ts:3310` → `src/core/skill-pool.ts:377`) and the loader overlays it (`:363-368`). §3.7 makes that explicit rather than accidental.
- **One validator.** `validateSkillDefinition` becomes the single implementation; the CLI Zod schema (`src/cli/commands/skill.ts:110`), `SkillSandbox.validateSkillManifest` and `scripts/lint-manifests.mjs` all consume it (the lint script's own header already states that mirroring the loader is its goal — `:29`), closing G3.

### 3.4 Entrypoint and referenced-file authority

- The **declared** `entrypoint.path` is the only body a reader may load. `resolveSkillPrompts` (`result-collector.ts:1012`), `SkillLoadingCache` (`skill-cache.ts:40`) and the builtin synthesiser (`skill-pool.ts:113`) stop hardcoding `SKILL.md` and ask the catalog.
- Path containment is enforced on **write and read**: the resolved absolute path must remain under the skill root after normalisation and symlink resolution. Without this, an ingested manifest is an arbitrary-file-read primitive into the worker prompt.
- **Referenced files are part of the package or they do not exist.** They are enumerated in the manifest with digest and size; sync, install, drift-check and quarantine treat `{entrypoint} ∪ referencedFiles` as one atomic unit. A referenced file missing on disk is a typed `invalid` disposition, not a warning.
- A **package budget** (count, per-file bytes, total bytes) is part of the contract, because these files reach a worker prompt and therefore a provider bill. The existing 500 KB cache budget (`src/core/skill-cache.ts:19`) is the precedent, not the ceiling.

### 3.5 V3-profile state carried as data — and only as data

`routing.profileState` is a **fact the catalog reports**, never a decision it makes:

| `profileState` | Meaning | Who sets it |
|---|---|---|
| `absent` | no `profile` key | loader, from the manifest |
| `present-invalid` | `profile` present, `validateSkillProfile` rejects it (`src/core/routing/capability-vector.ts:179`) | loader, from the validator's own verdict |
| `present-valid` | validator accepts | loader |
| `unresolved` | a legacy V2-activation skill for which **no owner-approved mapping exists yet** | loader, when `activation` is present and `profile` is absent |

`routing.routable` is derived, never authored: `routable = (disposition.state === "active") && (profileState === "present-valid")`. This is exactly what production already does — `routing-plan-adapter.ts:88-92` admits a skill as a V3 candidate only when `validateSkillProfile(skill.profile)` succeeds — expressed as reported state instead of as a silent drop.

`unresolved` is the honest word for row 7120's block, and it is the **only** thing this document says about it. Whether an `unresolved` skill may be routed, how a canonical profile is derived from SKILL.md metadata, and whether legacy activation may ever be treated as a routability proof are row 7121's questions and the owner's (see D6 and §9). The catalog's obligation is narrower and unconditional: **an unroutable skill must be visibly unroutable at every surface**, instead of loading, listing, appearing installed, and never being selected.

### 3.6 Merge semantics

Resolution for one id: collect the L1 and L2/L3 records → if a disposition tombstone (L4/L5) exists for the id, emit the masked record and stop → otherwise merge **field-level**, higher layer winning per field, with two exceptions:

- `provenance` never merges; the winning content layer's provenance is carried whole, plus an `overrides: ["builtin@1.2.0"]` trail.
- `entrypoint` and `referencedFiles` merge **as a unit** — a project override that supplies a body supplies the whole package. Half-overridden packages are the three-way-sync hazard row 7013 owns.

Field-level (not whole-record) merge is what lets a project override only `priority` or only `enabled` without forking the builtin body — the fork-on-touch behaviour that produces drift today.

### 3.7 Effective stats

The sidecar is the authority for counters; the manifest is the authority for identity, content and disposition. That split is already implemented — `.deckent/stats/catalog-stats.json` (`src/core/skill-pool.ts:235`), read-merge-write per skill (`:260`), overlaid at load (`:363`), shared with the agent pool against the same physical file (`src/core/agent-pool.ts:433`). Two changes: (a) the effective record exposes `stats` **plus** `statsSource` (`sidecar` | `manifest` | `defaults`) so a surface can say where a number came from — today the CLI shows manifest numbers while the finalizer writes sidecar numbers, which is row 7012's fourth measured symptom; (b) `stats` becomes advisory-by-contract for routing decisions, since the sidecar is gitignored, machine-local and therefore **not** part of the determinism contract (§5).

## 4. The single read model

One module — `SkillCatalog` — with one resolution path and one record shape. Every surface in §2.2 consumes it; nobody calls `readdirSync` on `.deckent/skills` again.

```ts
interface EffectiveSkill {
  id: SkillId;
  version: string;
  name: LocaleMap; description: LocaleMap;
  layer: 'builtin' | 'project' | 'generated';   // which content layer won
  provenance: SkillProvenance;
  disposition: SkillDisposition;                 // active | disabled | quarantined | retired
  entrypoint: ResolvedEntrypoint;                // absolute path + digest + format
  referencedFiles: ResolvedReferencedFile[];
  routing: { profileState: ProfileState; profile: SkillProfile | null; routable: boolean };
  stats: SkillStats; statsSource: 'sidecar' | 'manifest' | 'defaults';
  validity: { valid: boolean; errors: ValidationError[] };   // never a silent skip
  overrides: string[];                           // layer trail
}

interface SkillCatalog {
  list(filter?: SkillFilter): EffectiveSkill[];      // default: every state, incl. masked
  get(id: SkillId): EffectiveSkill | undefined;      // undefined ONLY if the id is unknown
  resolveBody(id: SkillId): SkillBody | CatalogHold; // honours entrypoint; typed HOLD on failure
  routable(): EffectiveSkill[];                      // the V3 candidate set
  snapshot(): CatalogSnapshot;                       // { digest, entries, generatedAt }
  invalid(): InvalidEntry[];                         // promotes skill-pool.ts:299-307 to first-class
}
```

Four contract points that make this an authority rather than a helper:

1. **`get()` returns a record for a quarantined or retired id** with its disposition, instead of `undefined`. "Unknown id" and "withdrawn id" must be distinguishable — the operator-facing difference between a typo and a security action.
2. **`resolveBody()` is the only body reader.** `resolveSkillPrompts` becomes a thin caller: catalog → `resolveBody` → prompt. Its two hard-won behaviours are preserved exactly, not re-derived — the `project-conventions` on-the-fly generation fallback (`result-collector.ts:1018-1030`) and the credit-integrity choke point that removes an unloadable or DNA-filtered id from `task.assignedSkills` so the finalizer cannot credit a prompt that was never injected (`:1041`, `:1063-1080`). Those are the correct behaviours; the wrong part is only *which path they read*.
3. **Invalid is reported, never skipped.** `loadSkills` already records and logs invalid manifests (`skill-pool.ts:292-307`); the catalog exposes them through `invalid()` so CLI/MCP can render "3 skills failed validation" instead of silently showing a shorter list.
4. **`snapshot().digest`** is the determinism handle (§5) and the cache key (§6).

**Consumer migration map** (each row is one wiring closure, per the project's production-wiring rule — producer → consumer → ingress → enablement):

| Consumer | Today | After |
|---|---|---|
| `src/cli/commands/skill.ts:76` | `readdirSync` | `catalog.list()` |
| `src/cli/commands/help.ts:170` | `listSkills().length` | `catalog.list({state:'active'}).length` — same number as `skill list` |
| `src/mcp/tools/skill-list.ts:27` | `readdirSync` | `catalog.list()` + disposition/validity/profileState in the payload (row 8052's gap) |
| `src/orchestra/result-collector.ts:1012` | hardcoded `SKILL.md` | `catalog.resolveBody(id)` |
| `src/core/skill-cache.ts:40` | hardcoded path | cache keyed by `entrypoint.contentDigest` |
| `src/orchestra/routing-plan-adapter.ts:88` | pool + `validateSkillProfile` | `catalog.routable()` |
| `src/orchestra/sprint-spawner.ts:1011` | second pool construction | injected catalog; HOLD extends to quarantined/retired |
| `src/orchestra/sprint-finalizer.ts:3295` | `getSkill` + `saveSkillStats` | catalog write path; stats stay sidecar |
| `managed-docs/*`, dashboard, API, terminal | R1 / ad-hoc | `catalog.snapshot()` — docs quote a snapshot digest, never a hardcoded count |
| `scripts/lint-manifests.mjs`, `builtins-drift-check.mjs` | mirror-by-hand | import the same validator |

**Layering (ADR-D-004).** `SkillCatalog` lives in `core/` and imports nothing from `orchestra/`, `cli/`, `api/` or `mcp/` (C1). `orchestra/` and the three surfaces consume it downward (C2, C3); no surface keeps a private scanner, which is precisely the reusable-business-logic-in-a-surface violation that `src/cli/commands/skill.ts:76` and `src/mcp/tools/skill-list.ts:27` are today.

## 5. Determinism contract

> **Contract:** given the same **tracked** inputs, `snapshot().digest` is identical on a clean checkout and on a long-lived machine-local project, on macOS, Linux, Windows-native and WSL.

Tracked inputs (inside the digest): the builtin package version and its per-skill content digests; every project manifest under `.deckent/skills/`; every entrypoint and referenced-file digest; the disposition ledger (§3.1 L4/L5).
Untracked inputs (**outside** the digest, by design): sidecar stats (`.deckent/stats/catalog-stats.json` — gitignored, machine-local); cache residency; `.quarantine/` *contents*, whose authority is the ledger entry, not the moved directory.

Rules that make this hold:

1. **Deterministic ordering.** Entries sort by id under a fixed collation (byte-wise on the normalised lowercase id), never by `readdirSync` order — which is filesystem-dependent and is what today's three scanners each inherit.
2. **Path/case normalisation before digesting**, so a case-insensitive filesystem cannot produce a different digest from the same content (Immutable Law 2).
3. **Package-only skills are visible, not silently synthesised.** The builtin fallback (`skill-pool.ts:382-447`) becomes a declared L1 layer with `layer: 'builtin'` on the record, so `observability` is *the same entry* in both a clean checkout and a long-lived tree instead of appearing in one resolver and not another.
4. **Generated skills are content-addressed.** A generated skill's digest covers its rendered body (already persisted alongside the manifest — `skill-pool.ts:531-541`), so "regenerated identically" and "changed" are distinguishable. Today the only reason `project-conventions` is stable across a clean checkout is that it was committed and grandfathered into the drift baseline (`scripts/builtins-drift-check.mjs:289`), which that file itself declares is not a canonicality decision.
5. **Drift is a first-class output.** `snapshot()` reports `unmaterializedBuiltins` and `projectOnly` sets — the exact two-id asymmetry observed in §2.1 — so the difference is reported rather than discovered as a count mismatch between two surfaces.
6. **Sync/update canonicality is row 7013's, not this row's.** This contract defines what "the same catalog" *means*; row 7013 defines how a project is brought to it without overwriting user content.

## 6. Scale note — 1000 skills, multi-tenant

Row 7012 requires the 1000-skill multi-tenant lookup and cache-invalidation obligation to be measured. Today's cost model does not survive that:

- `getSkill(id)` calls `loadSkills()` — a **full directory scan plus JSON.parse of every manifest, per single-id lookup** (`src/core/skill-pool.ts:455-457`); `listSkills()`, `listEnabled()` and `listByCategory()` each do the same (`:462-472`). `enableSkill`/`disableSkill` each trigger a further full load (`:487`, `:498`). At 1000 skills a single spawn's forced-skill check (`sprint-spawner.ts:1011-1017`) is O(n) manifest parses **per forced id**.
- The body cache is a flat 500 KB map with oldest-first eviction and no per-tenant partition (`src/core/skill-cache.ts:19`, `:177-195`); `preloadAll()` walks every directory (`:104-123`).
- `isStale()` is an `mtime` stat per skill (`:128-139`) — a per-lookup syscall that neither survives 1000 skills per request nor is reliable across filesystems with coarse mtime granularity (a real cross-platform hazard, not a theoretical one).

Obligations for the catalog:

1. **Index, don't rescan.** One catalog build produces an in-memory index; `get()` is O(1). Build cost is bounded and measured, not incurred per lookup.
2. **Content-digest invalidation, not mtime.** Cache keys are `entrypoint.contentDigest`; staleness is a digest comparison, with mtime/size used only as a cheap *hint* to decide whether to re-hash.
3. **Explicit invalidation events.** Exactly four mutate the catalog: manifest write (`saveSkill`/`saveGeneratedSkill`), disposition change (disable/quarantine/retire), builtin package upgrade, sidecar stats write (which invalidates **only** the stats overlay, never the body cache). Each publishes a typed event; no consumer polls.
4. **Tenant/project-scoped instances.** The catalog is keyed by project root; entries, digests and caches never cross a tenant boundary, and the memory budget is per tenant with a global ceiling — a 10 000-project host must not hold 10 000 unbounded catalogs. Bodies are lazily loaded and evictable; the index is not.
5. **Bounded build.** Catalog build is streaming and parallel-safe, with a stated worst-case bound at n=1000 and a regression benchmark as the proof artifact (S6 below). "Fast enough on 31 skills" is not evidence.
6. **Snapshot reuse across surfaces.** CLI, MCP, API, dashboard and docs generators in one process share one catalog instance and one digest, instead of the four independent readers §2.2 documents.

## 7. Implementation slices and proof obligations

Each slice is admission-sized, independently reviewable, and carries proof that is not "unit test green". No slice may claim `DONE` without its wiring closure (producer → consumer → ingress → enablement).

| Slice | Content | Proof obligation |
|---|---|---|
| **S1** | Schema v1 + single validator; `provenance`, `disposition`, `entrypoint`, `referencedFiles`, `routing.profileState` typed; back-compat readers for today's manifests | Fail-closed validator tests (each invalid shape rejected with a typed error); `lint-manifests.mjs` and the CLI Zod path both consume the one validator; **all 31 existing project manifests + 31 builtin manifests load unchanged** |
| **S2** | `SkillCatalog` in `core/` — index, merge, `snapshot()`, `invalid()`; no consumer migrated yet | Golden-snapshot test: clean-checkout fixture and long-lived fixture with a machine-local sidecar produce the **same digest**; the §2.1 two-id asymmetry appears in `unmaterializedBuiltins`/`projectOnly` |
| **S3** | Entrypoint + referenced-file authority; `resolveBody()`; containment + budget enforcement | Negative tests: `../` escape, symlink escape, missing referenced file, over-budget package → typed HOLD, never a partial prompt. A skill whose entrypoint is not `SKILL.md` injects correctly |
| **S4** | Migrate the **prompt path** first: `resolveSkillPrompts`, `SkillLoadingCache`, `native-tool-registry` | Real-run evidence that an identical worker prompt is produced for an unchanged catalog (byte-comparison against the current path); the `project-conventions` fallback and the assigned-skill credit-removal behaviour are preserved with their existing tests |
| **S5** | Migrate read surfaces: CLI `skill`/`help`, MCP `skill_list`/`catalog_parity`, docs generators, dashboard/API | Real-binary parity: CLI count, MCP payload count and generated-doc count are equal on one tree and equal to `snapshot()`; MCP payload now carries disposition/validity/profileState |
| **S6** | Scale + cache: O(1) `get()`, digest invalidation, tenant-scoped instances, event-driven invalidation | Benchmark at n=1000 across ≥2 platform adapters with a stated bound; invalidation test proving a sidecar write does **not** evict bodies while a manifest write does |
| **S7** | Disposition ledger: quarantine as state (wrapping `skill-sandbox.ts:350`), retire + id-lock, typed HOLD extension in the spawner | Quarantined and retired ids are unresolvable **including via `forceSkills`**, each with a distinct reason code; a retired id cannot be re-registered; `get()` still returns the tombstone |
| **S8** | Determinism gate in CI: snapshot digest of a fixture tree, plus the drift-report output | Gate fails on undeclared drift; the grandfathered-drift baseline gains a canonical-side disposition instead of a bare allowlist |

Sequencing note: S1→S2 are prerequisites for everything. S4 precedes S5 deliberately — the worker prompt is the surface where a wrong answer costs a provider call and poisons outcome learning, so it is migrated while the change is small enough to byte-compare. S7 depends on S2's disposition model. S6 may run in parallel with S5.

## 8. Owner decision points

**D1 — Generated/learned precedence.** Does L3 (generated) sit above or below L2 (hand-authored project override)? Proposed: **below** — a generated skill never silently overwrites a human's file; a regeneration that would collide becomes an explicit conflict. Consequence if inverted: the learning loop can overwrite operator intent without review.

**D2 — Promotion policy for generated skills.** What promotes a generated skill to a durable catalog member — an explicit owner action, a stats threshold from the sidecar, or a review receipt? Note the precedent that already exists: the first persisted generated skill was **grandfathered** into the builtins baseline (commit `a720addc8`), which `scripts/builtins-drift-check.mjs:289` explicitly labels "grandfathered, NOT a canonicality decision". D2 is the decision that file declines to make.

**D3 — Retirement semantics.** Confirm: retired ids are permanently locked and never re-usable; a retired skill keeps a readable tombstone (`get()` returns it) so historic runs stay explicable. Alternative: hard delete with an audit row only.

**D4 — Quarantine authority.** Who may quarantine (sandbox automation, auditor, owner only), who may release, and does quarantine propagate across projects on a multi-tenant host or stay project-local? Today `SkillSandbox.quarantine` is an unattributed directory move.

**D5 — Unroutable-skill visibility.** Should an installed but unroutable skill (`profileState != present-valid`) be listed as installed-but-unroutable (proposed), hidden from `list`, or refused at install? This is a UX decision with a real user cost: today 30 of 31 project skills carry no profile and are therefore never V3-routed, while every surface presents them as available.

**D6 — Where the V3 mapping decision lands.** Confirm that this catalog only *carries* `profileState` and that deriving a canonical profile (and any legacy-activation bridge) belongs to row 7121 — which already declares `SKILL-CATALOG-AUTHORITY-001` as a dependency. This document assumes yes; it needs to be recorded, not assumed.

**D7 — i18n migration for `name`/`description`.** Confirm the locale-map migration (§3.3) and whether bare-string manifests are accepted indefinitely as `{ en }` or deprecated on a stated schedule.

**D8 — Referenced-file budget.** Confirm the package budget dimensions and initial values (file count, per-file bytes, total bytes), given these files reach a provider prompt. The 500 KB cache budget (`skill-cache.ts:19`) is a precedent, not a decision.

**D9 — Namespacing for third-party skills.** Confirm `publisher/id` qualification and its reversible on-disk encoding, or choose a flat-id + registry-mapping alternative.

**D10 — Enforcement ratchet.** After S5, does a surviving private `readdirSync` over `.deckent/skills` become a **lint failure** (proposed, mirroring the operation-catalog precedent of structural coverage) or stay a warning? Without a ratchet, the fourth resolver reappears.

## 9. What this document does not decide

- **The V3 reconciliation.** Row 7120 stays `BLOCKED`; row 7121 stays the successor. Nothing here maps a legacy V2 activation block to a V3 profile, and nothing here authorises treating activation as routability evidence. The catalog reports `unresolved`; the owner decides.
- **Sync/update canonicality** (row 7013), **supply-chain ingress admission** (`SKILL-SUPPLY-CHAIN-INGRESS-001`), **routing eligibility scoring** (`SKILL-ROUTING-ELIGIBILITY-001`), **evolution/lifecycle policy** (`SKILL-EVOLUTION-LIFECYCLE-001`) and **documentation generation** (row 8052) each consume this authority and are decided in their own rows.
- **Any ADR amendment.** If S7's fail-closed disposition or S3's containment rule turns out to conflict with an accepted ADR, the implementing task must stop with a typed NO_GO and propose an amendment under `ADR-G-019`, not proceed.

## 10. Evidence basis

All anchors observed 2026-08-11 in the working tree; line numbers are for that state.

- Pool + fallback + sidecar: `src/core/skill-pool.ts:14,113,122,235,260,281-307,315-357,363-368,377,382-447,455-472,531-541,703-719`
- Types: `src/core/skill-types.ts:36-58,86-117` · Registry: `src/core/skill-registry.ts:9,22-134` · Cache: `src/core/skill-cache.ts:19-21,40,104-139,177-195`
- Prompt path: `src/orchestra/result-collector.ts:1005-1081` · Spawn: `src/orchestra/sprint-spawner.ts:995-1040` · Task mode: `src/orchestra/task-mode-runner.ts:328`
- Generation: `src/orchestra/temp-skill-generator.ts:50,70,159-189,274-277,517` · Persist: `src/orchestra/sprint-phases.ts:1122`
- Routing: `src/orchestra/routing-plan-adapter.ts:88-92`, `src/core/routing/capability-vector.ts:144-211`
- Stats finalisation: `src/orchestra/sprint-finalizer.ts:3232-3310`, `src/core/agent-pool.ts:433`
- Surfaces: `src/cli/commands/skill.ts:19,64-116`, `src/cli/commands/skill-marketplace.ts:69,206`, `src/cli/commands/help.ts:170`, `src/cli/repl/native-tool-registry.ts:236-246`, `src/mcp/tools/skill-list.ts:27-62`, `src/mcp/tools/catalog-parity.ts:129,176`, `src/orchestra/managed-docs/content-generators.ts:676-677`, `src/orchestra/managed-docs/template-renderer.ts:41-42`
- Quarantine: `src/core/marketplace/skill-sandbox.ts:348-366` · Retirement references only: `src/orchestra/sprint-retro-writer.ts:146,206`, `src/orchestra/prompt-token-optimizer.ts:161`
- Gates: `scripts/lint-manifests.mjs:13-16,29,88-96,165`, `scripts/builtins-drift-check.mjs:47-49,289,389-396`
- MASTER rows: `docs/MASTER-PLAN.md:1114` (7012), `:1115` (7013), `:1132` (7120), `:1133` (7121), `:1147` (8052), `:468` (`SKILL_V3_PROFILE_RECONCILIATION_REQUIRED`)
- Directory observation: `.deckent/skills/` = 31 manifest dirs, all `entrypoint: "SKILL.md"`, 30 with `source`, 1 with `profile` (`project-conventions`); `src/core/builtins/skills/` = 31; set difference = `observability` (builtin-only), `project-conventions` (project-only)
- Structural precedent: `docs/analysis/operation-catalog-authority-design-2026-08-06.md` §3.1–§3.3 (stable ids, version++/retire, file-based catalog with runtime cache)

---

## OWNER DECISIONS — 2026-08-11 (Alperen)

- **D1 KABUL:** generated katman insan-yazımı override'ın ALTINDA.
- **D2 → Brain'e delege edildi; Brain kararı:** terfi YALNIZ owner-onaylı review-receipt ile (agent-D7'deki "onayımızdan geçmeden promote yok, otonomluk yok" ilkesiyle tutarlı); stats sidecar yalnız ÖNERİ üretebilir, asla oto-terfi edemez.
- **D3 KABUL + kısıt:** retired id kalıcı kilitli + okunabilir tombstone; ANCAK id'ler jenerik kelime olamaz — namespace zorunlu (örn. `deckent-dev-ops`, gerekirse `-2` süreks); id seçim/çağrım (resolution) yapısı ayrıca iyi tasarlanacak. Jenerik bir kelimeyi (`dev-ops`) emekli edip yakmak kabul edilemez.
- **D4:** sandbox-otomasyonu karantina ÖNERİR; karantina KARARI insan-owner'da kalır (güvenlik-ihlali aciliyeti dahil — otomatik alım yok).
- **D5 KABUL:** installed-but-unroutable görünür etiket.
- **D6 EVET:** V3 eşleme kararı 7121'de.
- **D7 EN-KABUL:** locale-map; bare-string `{en}` olarak.
- **D8:** başlangıç bütçeleri YÜKSEK ve blocker-olmayan; sonradan kullanıcı/admin'e öneri yüzeyi.
- **D9 ALTERNATİF KABUL:** flat-id + registry-mapping (publisher/id nitelemesi değil).
- **D10 KABUL:** kaçak resolver = lint FAILURE (warning yok).
