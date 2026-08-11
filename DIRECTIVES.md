# DIRECTIVES — Sprint-B12: factory wave three, the catalog implementation begins

## Goal

Eight tasks: the tenant-authority rerun with corrected scope (4021), the first three
catalog implementation slices executing the owner's recorded decisions (agent census,
agent schema S1, agent resolver S2, skill resolver S1, skill V3-state S2 — rows 7011
and 7012), the crash retention slice (121), and the read-satisfiability plan gate born
from this week's two honest BOUNDARY_BLOCKED refusals. Tasks 3 and 5 declare
dependencies. The catalog tasks MUST read their governing design documents and the
OWNER DECISIONS addenda in follow-up-works — the decisions there are binding.

Read visibility note for every task: reading repository sources and the design
documents for evidence is expected and permitted — the write authority is what the
Files line constrains.

Provider, model, effort and effective concurrency are resolved from effective config,
registry, role policy, auth/reachability evidence, usage/limit authority and host admission.

## Execution Contract

- Behaviour outside each task's stated defect stays byte-identical; every test passing
  today still passes, unchanged.
- Do not weaken or delete an existing assertion to make new behaviour pass; report the
  conflict in result notes instead.
- Read the existing mechanism before designing; every code task EXTENDS something
  present. A second parallel mechanism is a NO-GO.
- Fail closed on ambiguity; nothing may make a destructive action easier to trigger.
- Workers must not run `npm run build`, full `npm test`, provider login/auth mutation,
  sprint lifecycle commands, git commit, npm publish, or cleanup. Scoped vitest runs only.
- Tests are hermetic: tmpdir-based, no network, no live `.tasks`/`.deckent` writes,
  async spawn only (ADR-D-002).
- New user-facing text goes through the i18n message authority (`getMessage`, en+tr);
  CLI descriptions are plain strings matching the surrounding file.
- Zero hardcode (ADR-G-036): no model name or flow value literal on a code path.

---

## Task 1: Fail-closed tenant authority for autonomous approval ingress (row 4021, rerun)

- Files: src/orchestra/autonomous/approval-adapter.ts, tests/orchestra/autonomous-tenant-authority.test.ts
- Scope: src/orchestra/autonomous/approval-adapter.ts, src/orchestra/autonomous/, src/core/principal.ts, src/core/, tests/orchestra/autonomous-tenant-authority.test.ts
- Model: gpt-5.6-sol
- Dependencies: none

Measured (row 4021; the first attempt refused honestly because the principal
machinery was outside its read scope — src/core/principal.ts is IN scope now): the
approval ingress accepts callers without a single fail-closed tenant resolution.

Required: root-cause first — inventory in the result notes which autonomous ingress
surfaces resolve tenant scope today. Then the FIRST slice: approve/reject/pending
resolve exactly one tenant/project scope from the verified principal via the existing
principal machinery in src/core/principal.ts (PRINCIPAL-001 is DONE — consume, never
reimplement), fail closed typed for foreign or tenant-less strict callers WITHOUT
leaking existence, and keep solo-mode default-tenant behaviour byte-identical.
Hermetic tests pin solo-unchanged, foreign-refused-no-metadata, tenantless-strict-
refused.

**Test:** `npx vitest run tests/orchestra/autonomous-tenant-authority.test.ts`

**NO-GO:** changing solo-mode behaviour, a second resolver, or existence-leaking
refusals.

---

## Task 2: Agent catalog S1 — schema and state model, types only (row 7011)

- Files: src/core/agent-types.ts, tests/core/agent-catalog-schema.test.ts
- Scope: src/core/agent-types.ts, src/core/, .deckent/agents/, .claude/agents/, tests/core/agent-catalog-schema.test.ts, follow-up-works/
- Model: claude-opus-5
- Dependencies: none

Measured: the design at
follow-up-works/agent-catalog-authority-design-2026-08-11.md (READ IT and its OWNER
DECISIONS addendum — binding) defines S1 as schema and state model, types only,
consuming decision D2 (schemaVersion required-on-write, defaulted-on-read,
unknown-future = typed invalid) and D4 (capabilities missing = definitively
non-routable; unresolvable preferredModel never blocks).

Required: exactly the design's S1 — the versioned manifest schema and the
validity/provenance/routability state model as TYPES plus a pure classification
function, no resolver change yet. The design's S1 proof obligation is the acceptance:
every current live manifest (21 builtin, 21 shadow, 2 learned, 3 archived — read them
from the real directories) classifies to an explicit validity and provenance with
zero silent skips, and the known id/directory-mismatch case classifies as a warning
rather than loading clean. Tests pin the classification table against real-manifest
fixtures copied into tmpdir.

**Test:** `npx vitest run tests/core/agent-catalog-schema.test.ts`

**NO-GO:** touching the resolver or any consumer surface (that is S2), silent skips,
or deviating from the recorded D2/D4 decisions.

---

## Task 3: Agent catalog S2 — the resolver behind the existing API (row 7011)

- Files: src/core/agent-pool.ts, tests/core/agent-layer-precedence.test.ts
- Scope: src/core/agent-pool.ts, src/core/, tests/core/agent-layer-precedence.test.ts, follow-up-works/
- Model: claude-sonnet-5
- Dependencies: schema and state model

Measured: the design's S2 (READ the design and addendum) puts the layered resolver
behind the existing AgentPoolManager API, consuming S1's types and decision D1 — the
owner-approved precedence inversion: L1 project-override above L2 learned/runtime
above L0 builtin, with field-level L2 override restricted to runtime-derived fields
(today L2 whole-record-wins at agent-pool.ts:585-586; that behaviour change is
APPROVED).

Required: exactly the design's S2 with its proof obligations — the existing
tests/core/agent-pool.test.ts stays green UNMODIFIED (its exact-call-count and
ordered-mock assertions are documented constraints), a layer-precedence table test
covers every L0/L1/L2 collision combination under the new order, and syscall count
does not regress.

**Test:** `npx vitest run tests/core/agent-layer-precedence.test.ts tests/core/agent-pool.test.ts`

**NO-GO:** modifying the existing agent-pool test file, a precedence other than the
recorded D1, or consumer-surface changes (S3+ territory).

---

## Task 4: Skill catalog S1 — one effective read model behind the existing API (row 7012)

- Files: src/core/skill-pool.ts, tests/core/skill-catalog-readmodel.test.ts
- Scope: src/core/skill-pool.ts, src/core/skill-registry.ts, src/core/, tests/core/skill-catalog-readmodel.test.ts, follow-up-works/
- Model: claude-opus-5
- Dependencies: none

Measured: the design at
follow-up-works/skill-catalog-authority-design-2026-08-11.md (READ IT and its OWNER
DECISIONS addendum — binding) defines the first implementation slice as the single
effective read model: shipped, project-override, generated/learned, quarantined and
retired layers resolving through one resolver behind the existing skill-pool API,
with generated BELOW hand-authored (decision D1) and flat ids (decision D9).

Required: the design's first slice with its stated proof obligations — every current
consumer keeps its observable behaviour for today's non-conflicting catalogs, layer
collisions resolve per D1 with a precedence table test, and the resolver is the ONLY
directory-scan path inside skill-pool/skill-registry (private rescans retired; the
D10 lint ratchet is a LATER slice — here the structure just makes it possible).

**Test:** `npx vitest run tests/core/skill-catalog-readmodel.test.ts`

**NO-GO:** generated-above-human precedence, publisher-qualified ids, or a surviving
second scan path inside the two scoped modules.

---

## Task 5: Skill catalog S2 — V3 profile state carried as data (row 7012)

- Files: src/core/skill-types.ts, tests/core/skill-profile-state.test.ts
- Scope: src/core/skill-types.ts, src/core/, tests/core/skill-profile-state.test.ts, follow-up-works/
- Model: claude-opus-5
- Dependencies: one effective read model

Measured: the design (and owner decision D6) requires the catalog to CARRY V3
profile state as data — present-valid, present-invalid, absent — while the
reconciliation DECISION stays with row 7121. Today 30 of 31 project skills carry no
profile and are silently never V3-routed while every surface shows them available
(decision D5: visible installed-but-unroutable).

Required: typed profileState on the effective record (consuming task 4's read model —
the declared dependency guarantees ordering), derived per skill from the real
manifest/profile files, with the D5 visibility contract expressed in the read model
(a surface CAN now render installed-but-unroutable; surface wiring itself is a later
slice). Tests pin the three states against fixtures and the real-tree count truth
recorded in the result notes.

**Test:** `npx vitest run tests/core/skill-profile-state.test.ts`

**NO-GO:** deciding any profile reconciliation (7121's authority), hiding unroutable
skills, or a second derivation path.

---

## Task 6: Crash artifacts gain retention and a bounded reader (row 121 second slice)

- Files: src/cli/helpers/error-handler.ts, tests/cli/crash-retention-reader.test.ts
- Scope: src/cli/helpers/error-handler.ts, src/cli/helpers/, tests/cli/crash-retention-reader.test.ts
- Model: claude-sonnet-5
- Dependencies: none

Measured (row 121; the schema slice landed in sprint-517 as CrashArtifactV1): the
crashes directory still has no retention policy and no bounded production reader —
six legacy logs sit unreadable-by-contract, and nothing prunes by age/count/size.

Required: age+count+size retention for crash artifacts applied ONLY at write time by
the crash writer itself (never a background job), with config-resolved limits
following the existing retention-family config patterns (no new literals); a bounded
reader that lists/reads artifacts newest-first with a hard cap and typed handling of
legacy pre-schema files (classified legacy, never parsed as V1, NEVER deleted —
legacy prune stays receipt-gated per the row). The never-mask property is preserved:
retention failures cannot obscure the original fatal. Hermetic tests pin retention
boundaries, legacy classification and never-mask.

**Test:** `npx vitest run tests/cli/crash-retention-reader.test.ts`

**NO-GO:** deleting legacy artifacts, a background pruner, retention literals in
code, or masking the original fatal.

---

## Task 7: Agent catalog S0 — the discovery census gate (row 7011)

- Files: tests/governance/agent-discovery-census.test.ts
- Scope: tests/governance/agent-discovery-census.test.ts, tests/governance/, follow-up-works/
- Model: gpt-5.6-terra
- Dependencies: none

Measured: the design's census slice (READ the design §1) inventories every current
agent-discovery call site — including the eleven AGENTS_DIR definition sites — and
demands a generated census that reproduces every inventoried row, where a
deliberately added twelfth raw scan makes the check fail.

Required: a governance test (the file named in Files — NEW, following the
orphan-deliverables sweep pattern in the same directory) that walks src/ for
agent-directory scan sites (AGENTS_DIR usages and raw directory reads over the agent
layers), pins the current census as the known-set, and fails loudly when a new
unregistered scan site appears OR a known one disappears — the same
drift-visible-both-ways contract the orphan sweep uses. Read-only over src; the
census constant lives in the test.

**Test:** `npx vitest run tests/governance/agent-discovery-census.test.ts`

**NO-GO:** editing any production file, a census that samples instead of walking, or
a pin that only fails in one direction.

---

## Task 8: The plan gate learns read-satisfiability (born from two honest refusals)

- Files: src/orchestra/scope-satisfiability.ts, tests/orchestra/read-satisfiability-gate.test.ts
- Scope: src/orchestra/scope-satisfiability.ts, src/orchestra/, tests/orchestra/read-satisfiability-gate.test.ts
- Model: claude-sonnet-5
- Dependencies: none

Measured (sprints 519 and 520, two honest BOUNDARY_BLOCKED refusals): a task whose
description demands consuming machinery outside its read scope reaches a worker and
fails only at execution time — the 2030 taxonomy task could not read the providers it
had to classify, and the 4021 tenant task could not read the principal resolver it
was ordered to consume. The plan-time gate already warns on write-side
MENTIONED_NOT_WRITABLE; the read side is blind.

Required: extend the existing scope-satisfiability analysis with a read-side check —
when a task description names concrete source paths or modules to READ/consume and
none of the scope entries makes them visible, the gate emits a typed
MENTIONED_NOT_READABLE finding (warning-class like its write sibling, with the same
remedy text pattern). No new gate mechanism — extend the existing one; the finding
must have fired for both measured cases, pinned by fixtures reproducing each. Today's
passing plans stay finding-free (no false positives on prose that names no path).

**Test:** `npx vitest run tests/orchestra/read-satisfiability-gate.test.ts`

**NO-GO:** blocking-class findings (warning only — the owner decides escalation), a
second gate, or false positives on path-free prose.
