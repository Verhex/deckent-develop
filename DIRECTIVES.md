# DIRECTIVES — ROUTING-V3 SLICE-0: FOUNDATION (vocabulary + vector schemas + capabilities v3 + migrator)

## Goal
First of 4 slices building RoutingEngineV3 (spec: `.analysis/routing-v3-design-spec-2026-07-14.md`,
detail: `.analysis/routing-v3-secenek-b-detay-2026-07-14.md` — read BOTH first; they are binding).
Slice-0 delivers the FOUNDATION: the structured vocabulary (closed work-type core [8] + open 3-layer
domain registry + deliverable types), the RequirementVector/CapabilityVector zod schemas, deterministic
vector producers (positional + numerical + structural-content), the agent.json-v3 `capabilities` field,
a v2→v3 manifest migrator, capabilities authored for all 21 builtin agents and builtin skills, the
routing3 config schema, vocabulary doctor checks, and the ADR-G-006 today-clause amendment draft.
V2 routing keeps running UNCHANGED this sprint: manifests DUAL-CARRY (activation.rules stays alongside
new capabilities until Slice-3 cut-over). Nothing in this slice may alter a live routing decision.

## 🔒 BINDING (every task)
- Write ONLY to your own Files list · real `.deckent/`, `.brain/`, `.tasks/` are READ-ONLY (tests use tmpdir)
  · no git stash/reset · `npm run build` FORBIDDEN · notes ONE STRING · self-assessment HONEST.
- No string-throw (typed-error family). No report/summary markdown outside `.analysis/`.
- Tests hermetic (tmpdir, async spawn, no spawnSync). `tsc` alone is NOT proof — behavior tests required.
- Zero-hardcode (ADR-G-036): no model names or flow literals in code paths; vocabulary/config are the SSOT.
- i18n-FIRST: any user-facing CLI string goes through getMessage (en+tr), never hardcoded.
- Word-inference bans are LAW: the token "test" and agent display-names in prose must NEVER influence
  any classification output — pin with negative tests where relevant.
- V2 routing behavior MUST NOT change this sprint: routing-engine.ts / intent-classifier.ts are OUT of scope.

## Task 1: routing3 core types and vocabulary builtin work-type core
- Files: src/core/routing3/types.ts, src/core/routing3/vocabulary-builtin.ts, tests/core/routing3/vocabulary-builtin.test.ts
- Scope: src/core/routing3/, tests/core/routing3/
- Dependencies: none
### Description
Create `src/core/routing3/` with `types.ts`: WorkType union ('build'|'fix'|'refactor'|'document'|'review'|
'configure'|'migrate'|'analyze'), WorkTypeDef {type, contract (one-sentence), dodSignature, examples[]},
Proficiency ('primary'|'secondary'|'able'|'never'), DeliverableType union ('code-src'|'code-test'|'doc'|
'config'|'workflow'|'manifest'|'script'|'migration'|'asset'), DomainDef {id, aliases[], pathPatterns[],
stackMarkers[], description, surfaces[], exclusiveRoles[]}, plus typed errors (extend the existing
DeckentError family — read src/core/errors.ts for the pattern). `vocabulary-builtin.ts`: the 8 WorkTypeDef
entries exactly per spec §1a (build/fix/refactor/document/review/configure/migrate/analyze with their
contracts and DoD signatures) and the 9 deliverable types. Subtype grammar: `parent:subtype` string form
with a parseSubtype() helper (rollup = parent). NO domain entries in this task (Task 2).
### goNogo
- goCriteria: all 8 work-types carry contract+dodSignature+examples; parseSubtype handles 'review:compliance' → parent 'review'; npx vitest run tests/core/routing3/vocabulary-builtin.test.ts green; npx tsc --noEmit clean.
- nogo: a 'test' work-type appearing anywhere NO_GO; open-ended work-type union NO_GO.

## Task 2: vocabulary builtin base domain registry and deliverable evidence map
- Files: src/core/routing3/vocabulary-builtin.ts, tests/core/routing3/vocabulary-domains.test.ts
- Scope: src/core/routing3/, tests/core/routing3/
- Dependencies: Task 1
### Description
Extend vocabulary-builtin.ts with the builtin base DOMAIN registry (~14 DomainDef entries per spec §1b:
api, frontend, cli-terminal, core-runtime, orchestration, data, security, i18n, a11y, devops-ci, docs,
build-release, agents-catalog, connectors-messaging). Each domain: real pathPatterns grounded in THIS
repo's layout (grep src/ to verify each pattern matches something) plus generic patterns for foreign
projects; aliases include Turkish forms where natural; description written for LLM consumption (content
axis). Also: DELIVERABLE_EVIDENCE map — file-path → DeliverableType classifier (extension + path rules:
tests/ or *.test.* → code-test, docs/ or *.md → doc, .github/workflows → workflow, agent.json/skill
manifests → manifest, migrations → migration, scripts/ → script, config files → config, src/* → code-src).
Pure functions, no fs access.
### goNogo
- goCriteria: every domain has ≥1 pathPattern verified to match a real path in this repo (assert in test against a fixture list); classifyDeliverable covers all 9 types with table-driven tests; vitest green; tsc clean.
- nogo: domain table living anywhere except vocabulary-builtin NO_GO; fs access in pure classifiers NO_GO.

## Task 3: vocabulary 3-layer registry loader
- Files: src/core/routing3/vocabulary.ts, tests/core/routing3/vocabulary-loader.test.ts
- Scope: src/core/routing3/, tests/core/routing3/
- Dependencies: Task 1, Task 2
### Description
`loadVocabulary(projectRoot, opts?)`: merge builtin-base < org-overlay (path from opts, absent-tolerant)
< project (`.deckent/routing/vocabulary.json`). Zod-validate each layer (schema in this module); higher
layer wins on duplicate domain id; produce a MergeReport {layerCounts, shadowed[], invalid[]} — shadowing
is reported, never silent. Unknown fields rejected loudly (zod strict). Missing project file = builtin-only
(zero-config path works). Result object frozen (no mutable leak). Typed errors for malformed layers;
one bad layer does NOT abort the merge (skip + report, fail-soft with visibility).
### goNogo
- goCriteria: hermetic tmpdir tests for all three layers + shadowing + malformed-layer fail-soft + frozen result; vitest green; tsc clean.
- nogo: silent shadowing NO_GO; mutable registry leak NO_GO.

## Task 4: requirement-vector schema and positional producer
- Files: src/core/routing3/requirement-vector.ts, tests/core/routing3/requirement-positional.test.ts
- Scope: src/core/routing3/, tests/core/routing3/
- Dependencies: Task 3
### Description
RequirementVector type + zod per spec §2a (content/positional/numerical). Implement
`producePositional(task, vocabulary)`: domains from scope.directories+filesWrite matched against
vocabulary pathPatterns (weight = share of matching writes; evidence field names the matched pattern);
deliverables via classifyDeliverable ratios; needsWrite from filesWrite non-empty; surfaces from domain
defs; language detection reuse — read src/core/routing-engine.ts detectHeuristicLanguage for the existing
heuristic and REUSE it via import if exported or lift a copy into routing3 with a provenance comment
(do NOT modify routing-engine.ts). Deterministic, pure, fs-free.
### goNogo
- goCriteria: table-driven tests incl. a task writing tests/ only (deliverables 100% code-test), a mixed src+tests task, a docs task, a .github/workflows task; agent display-names present in title/description provably do NOT affect positional output (negative pin); vitest green; tsc clean.
- nogo: touching routing-engine.ts NO_GO; prose text influencing positional axis NO_GO.

## Task 5: requirement-vector numerical producer
- Files: src/core/routing3/requirement-vector.ts, tests/core/routing3/requirement-numerical.test.ts
- Scope: src/core/routing3/, tests/core/routing3/
- Dependencies: Task 4
### Description
`produceNumerical(task)`: fileCount/moduleCount from scope (module = top-level src subdir),
estimatedSize tiering (trivial/small/medium/large/epic — mirror the thresholds used by the V2
intent-classifier complexity block; read it, copy thresholds with a source comment, do not import it),
effortClass passthrough from task if present else 'normal', riskClass heuristic: 'high' when filesWrite
touches config/migration/security-domain paths (vocabulary-driven, not hardcoded path literals),
else 'low'|'medium' by size. Pure, deterministic.
### goNogo
- goCriteria: threshold table-driven tests; riskClass derives from vocabulary domain match not string literals (pin: renaming a security pathPattern in a fixture vocabulary changes riskClass); vitest green; tsc clean.
- nogo: hardcoded path literals for risk NO_GO.

## Task 6: structural content producer (governance-mode backbone)
- Files: src/core/routing3/requirement-vector.ts, tests/core/routing3/requirement-content-structural.test.ts
- Scope: src/core/routing3/, tests/core/routing3/
- Dependencies: Task 4, Task 5
### Description
`produceContentStructural(task, positional)`: workType from STRUCTURAL evidence only — deliverable
dominance (doc→document, config→configure, migration→migrate, workflow→configure), review/analyze
detectable only via zero-filesWrite + read-heavy scope (analyze) — otherwise workType='build' with
provenance:'structural' and calibratedConfidence LOW (constant from config, not magic number).
semanticTags/summary left null at this provenance (LLM fills them in Slice-2; null is a VALID modeled
state here, not a stub — governance mode ships on exactly this producer). HARD negative guarantees
(the two word-inference bans): the token 'test' anywhere in title/description MUST NOT alter output;
an agent display-name in prose MUST NOT alter output — both pinned with paired-input tests
(same task ± the token → identical vectors).
### goNogo
- goCriteria: paired-input negative pins for 'test' token and agent-name token both green; deliverable-dominance table tests; provenance+confidence fields asserted; vitest green; tsc clean.
- nogo: any keyword table over prose in this producer NO_GO.

## Task 7: capability-vector schema for agents
- Files: src/core/routing3/capability-vector.ts, tests/core/routing3/capability-schema.test.ts
- Scope: src/core/routing3/, tests/core/routing3/
- Dependencies: Task 1
### Description
agent.json-v3 `capabilities` zod schema per spec §2b: capabilitiesVersion:3; content {workTypes:
[{type, proficiency}], expertise: string[], personaSlices: string[]}; positional {domains:
[{id|'*', proficiency}], surfaces[], writeAuthority: boolean, role, deliverables: DeliverableType[]};
numerical {preferredModel?: string (validated against model-registry ids at LOAD time, never literal-
checked here — zero-hardcode), costTier, maxParallel}. Explicit rule: outcome-stats NEVER in manifest
(schema rejects a stats key inside capabilities). Universal test-capability rule as a helper:
`hasTestCapability(cap) = cap.positional.writeAuthority === true` (Alperen decision — no test workType,
no test field). validateCapabilities() returns typed issues list (for lint/doctor reuse).
### goNogo
- goCriteria: schema round-trips a full valid example; rejects stats-in-manifest, unknown workType, proficiency typos; hasTestCapability pinned both ways; vitest green; tsc clean.
- nogo: a 'test' entry in workTypes accepted by schema NO_GO.

## Task 8: capability profile schema for skills
- Files: src/core/routing3/capability-vector.ts, tests/core/routing3/skill-profile-schema.test.ts
- Scope: src/core/routing3/, tests/core/routing3/
- Dependencies: Task 7
### Description
SkillProfile variant of the capability schema (skills share the matching space per the vectorial
directive): {profileVersion:3, workTypes[], domains[], expertise[], deliverables[]} — no writeAuthority/
role (skills are knowledge, not actors); tokenCost passthrough field. validateSkillProfile() with typed
issues. Export a shared `matchSpace(agentCap | skillProfile)` normalizer returning the common axes shape
the future pipeline consumes (one matching space, per directive).
### goNogo
- goCriteria: schema tests + matchSpace returns identical shape for agent and skill inputs (structural pin); vitest green; tsc clean.
- nogo: divergent axis shapes between agent and skill NO_GO.

## Task 9: v2 to v3 manifest migrator
- Files: src/core/routing3/manifest-migrator.ts, tests/core/routing3/manifest-migrator.test.ts
- Scope: src/core/routing3/, tests/core/routing3/
- Dependencies: Task 7, Task 8
### Description
`migrateManifestV2toV3(manifest, vocabulary)`: map activation.rules intent.primary scores → workTypes
proficiency (10→primary, 7-9→secondary, 5-6→able; V2 intents map: implementation→build, bugfix→fix,
refactor→refactor, documentation→document, security→domain 'security' NOT a workType (+review secondary
for auditor roles), devops→domain 'devops-ci' + configure, migration→migrate, design/architecture→
analyze+build-secondary, performance→analyze + domain, config→configure); domains from V2 domain fields +
BUILTIN_AGENT_DOMAINS knowledge (read agent-pool.ts, copy the mapping data with provenance comment,
do not import agent-pool); writeAuthority from deniedTools; result marked `provisional: true`.
Exclusions map to 'never' proficiencies. Deterministic; collects per-manifest typed issues, never throws
on a single bad manifest.
### goNogo
- goCriteria: fixture migrations for refactorer (refactor-only → refactor:primary, no build), implementer (build:primary), security-auditor (review:primary + security domain), doc-writer excludes → never entries; provisional flag always set; vitest green; tsc clean.
- nogo: importing agent-pool.ts NO_GO; a migrator that throws on one bad manifest NO_GO.

## Task 10: routing3 config schema and 3-layer merge
- Files: src/core/config-types.ts, src/core/routing3/config.ts, tests/core/routing3/config.test.ts
- Scope: src/core/, tests/core/routing3/
- Dependencies: Task 1
### Description
`routing_v3` config block: {enabled:false (cut-over flips in Slice-3), weights {content:0.5, positional:0.3,
numerical:0.2}, confidenceFloor, governanceMode:'ai'|'deterministic', topK, structuralConfidence} — extend
config-types with zod schema following the existing V1-Pick/nervous_system pattern (read config-types.ts
first); defaults in ONE place; routing3/config.ts resolves via the existing 3-layer config merge
(src/core/config.ts). Weights must sum to 1.0 (validated, typed error otherwise).
### goNogo
- goCriteria: schema+merge tests (project overrides org overrides default); weights-sum validation pinned; enabled defaults FALSE; vitest green; tsc clean.
- nogo: defaults duplicated in two places NO_GO.

## Task 11: sync wire for capabilities migration (dual-carry)
- Files: src/cli/commands/sync.ts, tests/cli/sync-capabilities-migrate.test.ts
- Scope: src/cli/, src/core/routing3/, tests/cli/
- Dependencies: Task 9
### Description
Extend `deckent sync` (adapter phase, alongside the 444 agent-prompt-sync): for each builtin agent
manifest LACKING `capabilities`, run the migrator and write the v3 block ALONGSIDE activation.rules
(dual-carry; nothing removed), marked provisional. Manifests already carrying capabilities are untouched
(byte-stable). Report extends the existing sync report (migrated / already-v3 / issues). Hermetic tmpdir
tests only — the real repo tree is re-synced HOST-SIDE by Brain post-sprint.
Smoke: node dist/cli/entry.js sync --adapters-only → exit 0 and report lists migrated counts.
### goNogo
- goCriteria: dual-carry proven (activation.rules byte-identical after write); already-v3 byte-stability pinned; report structure asserted; hermetic; vitest green; tsc clean.
- nogo: removing or reordering activation.rules NO_GO; writing real .deckent NO_GO.

## Task 12: agent-pool additive load of capabilities
- Files: src/core/agent-pool.ts, tests/core/routing3/agent-pool-capabilities.test.ts
- Scope: src/core/, tests/core/routing3/
- Dependencies: Task 7
### Description
AgentDefinition gains optional `capabilities` (typed via capability-vector schema); loadAgents parses+
validates it when present (invalid capabilities → recorded via the existing _recordInvalidManifest
channel as a WARNING, agent still loads on its V2 fields — additive, born-590 visibility pattern).
ZERO change to any V2 scoring path: routeTaskV2 output must be bit-identical with and without
capabilities present (pin this with a routing test on a fixture pool). Surgical diff.
### goNogo
- goCriteria: V2-decision-identical pin (same task, pool ± capabilities → same RoutingDecision) green; invalid-capabilities visible-skip warning pinned; existing agent-pool suite untouched and green; tsc clean.
- nogo: any V2 scoring behavior change NO_GO.

## Task 13: builtin capabilities authoring — construction family
- Files: src/core/builtins/agents/implementer/agent.json, src/core/builtins/agents/refactorer/agent.json, src/core/builtins/agents/bug-fixer/agent.json
- Scope: src/core/builtins/agents/
- Dependencies: Task 7, Task 11
### Description
Author REAL (non-provisional) `capabilities` v3 blocks for implementer (build:primary, fix:secondary,
domains '*':able, writeAuthority true, deliverables code-src+code-test), refactorer (refactor:primary,
review:able, NO build entry beyond 'never'? — express the F3 spec: build MUST be 'never' so the old
catch-all can never return), bug-fixer (fix:primary, build:secondary). Keep activation.rules untouched
(dual-carry). Ground every entry in the agent's PROMPT.md persona (read it) — capabilities must not
promise what the persona does not deliver. Validate with the Task-7 validator (import in a spec test is
NOT in your files — run `npx vitest run tests/core/routing3/` which includes schema tests, plus
tests/core/builtins/ catalog conventions).
### goNogo
- goCriteria: all 3 manifests valid per validateCapabilities; refactorer carries build:never (pin via catalog test run); npx vitest run tests/core/builtins/ green; tsc clean.
- nogo: provisional:true on these hand-authored blocks NO_GO; activation.rules diff NO_GO.

## Task 14: builtin capabilities authoring — architecture and review family
- Files: src/core/builtins/agents/architect/agent.json, src/core/builtins/agents/architecture-planner/agent.json, src/core/builtins/agents/code-reviewer/agent.json
- Scope: src/core/builtins/agents/
- Dependencies: Task 7, Task 11
### Description
Same contract as Task 13 for: architect (analyze:primary, review:secondary, build:never — Write-forbidden
advisor per its deniedTools; writeAuthority false), architecture-planner (analyze:primary, document:
secondary), code-reviewer (review:primary, refactor:able, writeAuthority per its manifest reality).
Persona-grounded; dual-carry; validator green.
### goNogo
- goCriteria: 3 valid manifests; architect writeAuthority=false pinned; vitest tests/core/builtins/ green; tsc clean.
- nogo: capabilities contradicting deniedTools NO_GO.

## Task 15: builtin capabilities authoring — surface builders family
- Files: src/core/builtins/agents/api-builder/agent.json, src/core/builtins/agents/api-designer/agent.json, src/core/builtins/agents/frontend-designer/agent.json
- Scope: src/core/builtins/agents/
- Dependencies: Task 7, Task 11
### Description
Same contract: api-builder (build:primary, domains api:primary, surfaces api), api-designer
(analyze:primary + document:secondary, domains api — designer not builder), frontend-designer
(build:primary, domains frontend:primary, deliverables incl. asset). Persona-grounded; dual-carry.
### goNogo
- goCriteria: 3 valid manifests; api-builder vs api-designer builder/advisor distinction expressed in workTypes; vitest tests/core/builtins/ green; tsc clean.
- nogo: identical capability blocks for builder vs designer NO_GO.

## Task 16: builtin capabilities authoring — audit family
- Files: src/core/builtins/agents/security-auditor/agent.json, src/core/builtins/agents/accessibility-auditor/agent.json, src/core/builtins/agents/performance-analyzer/agent.json
- Scope: src/core/builtins/agents/
- Dependencies: Task 7, Task 11
### Description
Same contract: security-auditor (review:primary, analyze:secondary, domains security:primary, role
reviewer), accessibility-auditor (review:primary, domains a11y:primary — today unreachable via keywords;
capabilities make it reachable via domain evidence), performance-analyzer (analyze:primary, domains
core-runtime + performance-relevant surfaces, fix:able). Persona-grounded; dual-carry.
### goNogo
- goCriteria: 3 valid manifests; auditors carry review-role semantics (build:never); vitest tests/core/builtins/ green; tsc clean.
- nogo: an auditor with build:primary NO_GO.

## Task 17: builtin capabilities authoring — pipeline and integration family
- Files: src/core/builtins/agents/devops-engineer/agent.json, src/core/builtins/agents/ci-guardian/agent.json, src/core/builtins/agents/integration-engineer/agent.json
- Scope: src/core/builtins/agents/
- Dependencies: Task 7, Task 11
### Description
Same contract: devops-engineer (configure:primary, build:secondary, domains devops-ci:primary) vs
ci-guardian (configure:primary scoped to CI + review:secondary, domains devops-ci — differentiate the
10↔10 twins: ci-guardian = pipeline guard + verification, devops-engineer = infra construction; the
capability blocks MUST differ meaningfully), integration-engineer (build:primary, domains
connectors-messaging:primary + api:secondary). Persona-grounded; dual-carry.
### goNogo
- goCriteria: 3 valid manifests; devops-engineer and ci-guardian blocks differ in ≥2 axes (pin); vitest tests/core/builtins/ green; tsc clean.
- nogo: twin manifests remaining twins NO_GO.

## Task 18: builtin capabilities authoring — content and platform family
- Files: src/core/builtins/agents/doc-writer/agent.json, src/core/builtins/agents/i18n-specialist/agent.json, src/core/builtins/agents/terminal-ux-engineer/agent.json
- Scope: src/core/builtins/agents/
- Dependencies: Task 7, Task 11
### Description
Same contract: doc-writer (document:primary, domains docs:primary, deliverables doc), i18n-specialist
(build:secondary + review:secondary, domains i18n:primary — the probe-misroute class dies via domain
evidence), terminal-ux-engineer (build:primary, domains cli-terminal:primary). Persona-grounded; dual-carry.
### goNogo
- goCriteria: 3 valid manifests; i18n-specialist domain i18n:primary present; vitest tests/core/builtins/ green; tsc clean.
- nogo: i18n expressed as keywords instead of domain NO_GO.

## Task 19: builtin capabilities authoring — data and remaining family
- Files: src/core/builtins/agents/data-engineer/agent.json, src/core/builtins/agents/migration-specialist/agent.json, src/core/builtins/agents/observability-engineer/agent.json
- Scope: src/core/builtins/agents/
- Dependencies: Task 7, Task 11
### Description
Same contract: data-engineer (build:primary, domains data:primary), migration-specialist
(migrate:primary, domains data:secondary), observability-engineer (build:secondary + analyze:primary,
domains devops-ci + core-runtime). Persona-grounded; dual-carry. If any remaining builtin agent
directory exists that Tasks 13-19 did not cover, list it in your result notes — do NOT author it.
### goNogo
- goCriteria: 3 valid manifests; coverage gap list honest in notes; vitest tests/core/builtins/ green; tsc clean.
- nogo: authoring an uncovered agent outside Files NO_GO.

## Task 20: builtin skill profiles authoring
- Files: src/core/builtins/skills/, tests/core/routing3/skill-profiles-builtin.test.ts
- Scope: src/core/builtins/skills/, tests/core/routing3/
- Dependencies: Task 8
### Description
Author SkillProfile v3 blocks for every builtin skill manifest (read src/core/builtins/skills/ to
enumerate; add `profile` field alongside existing fields — dual-carry, nothing removed). Ground each in
the skill's SKILL.md content; a skill whose content file is missing/empty gets NO profile and is listed
in a GHOST_SKILLS export consumed later by learning-cell rejection (the api-design ghost class from the
corpus — profiles must not fabricate competence). Test sweeps all skill manifests: every profile valid
per validateSkillProfile, ghosts listed not profiled.
### goNogo
- goCriteria: sweep test green over the real builtin skills tree (read-only); ghost list non-fabrication pinned (a contentless fixture skill → ghost, not profile); tsc clean.
- nogo: profiling a contentless skill NO_GO.

## Task 21: vocabulary doctor checks
- Files: src/cli/commands/doctor.ts, src/core/routing3/vocabulary-doctor.ts, tests/core/routing3/vocabulary-doctor.test.ts
- Scope: src/cli/, src/core/routing3/, tests/core/routing3/
- Dependencies: Task 3
### Description
`vocabulary-doctor.ts`: checks — layer shadowing report, dead pathPatterns (match nothing under
projectRoot), duplicate aliases across domains, domains with no description (LLM axis needs it).
Wire into `deckent doctor` output section (i18n messages en+tr via getMessage). Read-only on the real
tree; hermetic tests on tmpdir fixtures.
Smoke: node dist/cli/entry.js doctor → exit 0 and a Vocabulary section renders.
### goNogo
- goCriteria: each check behavior-tested (fixture with shadowed domain, dead pattern, dup alias); doctor section i18n-clean (no hardcoded user-facing strings — pin by asserting getMessage keys exist in en+tr); vitest green; tsc clean.
- nogo: hardcoded user-facing strings NO_GO.

## Task 22: vocabulary bootstrap generator from project analysis
- Files: src/core/routing3/vocabulary-bootstrap.ts, tests/core/routing3/vocabulary-bootstrap.test.ts
- Scope: src/core/routing3/, tests/core/routing3/
- Dependencies: Task 3
### Description
`bootstrapProjectVocabulary(projectRoot, stack)`: derive project-layer DomainDef candidates from the
detected stack (read src/core/ for the existing detectProjectStack surface and consume its OUTPUT type —
do not reimplement detection) + top-level src/ directory map (each substantial src subdir absent from
builtin domains → candidate domain with derived pathPatterns). Returns candidates + rationale; WRITING
`.deckent/routing/vocabulary.json` happens only through an explicit writeVocabulary(projectRoot, defs)
that refuses to overwrite an existing file with user edits (byte-compare against last-generated marker —
follow the agent-prompt-sync three-way precedent). Real bootstrap run is HOST-SIDE by Brain post-sprint.
### goNogo
- goCriteria: tmpdir project fixture → sensible candidates (src/nervous → 'nervous' candidate domain); overwrite-protection all three branches behavior-tested; vitest green; tsc clean.
- nogo: silent overwrite of user-edited vocabulary NO_GO; writing real .deckent NO_GO.

## Task 23: ADR-G-006 today-clause amendment draft
- Files: docs/adr/adr-g-006-amendment-v3-2026-07-14.md
- Scope: docs/adr/
- Dependencies: none
### Description
Draft the amendment document updating ADR-G-006's TODAY clause from routeTaskV2 multi-signal scoring to
RoutingEngineV3 vector-selection (per the design spec): what today becomes (3-axis vectors, 5-stage
hybrid pipeline, vocabulary registry, capabilities SSOT), what is PRESERVED verbatim (diversity guards
≤60%/≥4-distinct as V3-journal checks · FIX fresh-eyes rotation semantics · force-* override semantics ·
anti-temp invariant · honest-empty), what the tomorrow clause becomes (learned weight-tuning, provider-
health axis activation, embedding prefilter default-on at catalog scale). Cite the evidence corpus paths
and Alperen approval dates. Follow ADR-G-019 authoring standard (today+tomorrow, transparent intent).
DB insertion is done HOST-SIDE by Brain post-sprint (workers never touch .brain).
### goNogo
- goCriteria: document complete per ADR-G-019 structure; preserved-guards section names all five; lint:link clean for cited paths.
- nogo: touching .brain/memory.db NO_GO; altering the original ADR text file if any NO_GO.

## Task 24: schema round-trip integration test
- Files: tests/core/routing3/foundation-roundtrip.test.ts
- Scope: tests/core/routing3/
- Dependencies: Task 3, Task 6, Task 9, Task 10
### Description
End-to-end foundation proof on a tmpdir fixture project: build vocabulary (3 layers) → produce
RequirementVector (positional+numerical+structural content) for 6 representative task shapes (mirror the
probe battery: impl-generic, refactor-worded [pin: structural producer immune to the word], docs, CI
workflow, i18n, tests-only) → migrate a v2 fixture manifest → validate all against zod schemas →
assert the two word-inference bans hold through the FULL pipeline (not just unit level).
### goNogo
- goCriteria: all 6 shapes produce schema-valid vectors with expected positional domains; full-pipeline negative pins green; npx vitest run tests/core/routing3/ fully green; npx tsc --noEmit clean.
- nogo: any routing3 suite red NO_GO.

## Task 25: foundation catalog conventions guard
- Files: tests/core/builtins/agent-catalog-capabilities.test.ts
- Scope: tests/core/builtins/
- Dependencies: Task 13, Task 14, Task 15, Task 16, Task 17, Task 18, Task 19
### Description
New catalog convention suite: EVERY builtin agent manifest carries a valid capabilities block (real,
not provisional); refactorer build:never; architect writeAuthority:false; auditors build:never;
ci-guardian↔devops-engineer differ in ≥2 axes; every declared domain id exists in builtin vocabulary
(referential integrity); activation.rules still present everywhere (dual-carry guard — Slice-3 removes
them, not before). This suite is the drift-gate for capability authoring quality.
### goNogo
- goCriteria: suite green against the real builtins tree (read-only); referential-integrity check demonstrably fails on a fixture with an unknown domain id; tsc clean.
- nogo: weakening any Task-13..19 pin to pass NO_GO.

## Task 26: slice-0 integration smoke and regression sweep
- Files: tests/core/routing3/slice0-smoke.test.ts
- Scope: tests/core/routing3/, tests/core/
- Dependencies: Task 11, Task 12, Task 21, Task 22, Task 24, Task 25
### Description
Final gate: (1) V2-unchanged proof — run the existing routing pins (tests/core/routing-implementer-era.test.ts
tests/core/routing-impl-builtin.test.ts tests/core/agent-impl-balance.test.ts) and assert green via your
own run (do not modify them); (2) hermetic tmpdir end-to-end: fixture project + sync-migrate → agent-pool
loads capabilities → vectors produce → doctor vocabulary section clean; (3) npx tsc --noEmit clean;
(4) full tests/core/routing3/ green. Report exact counts in notes.
### goNogo
- goCriteria: all four gates green with counts in notes; zero modifications to V2 test files.
- nogo: any V2 routing pin red NO_GO; modifying V2 pins to pass NO_GO.
