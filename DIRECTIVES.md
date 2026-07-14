# DIRECTIVES — ROUTING-V3 SLICE-1: DETERMINISTIC ENGINE (match-pipeline + verifier + cells + story/journal + lint)

## Goal
Second of 4 slices (spec: `.analysis/routing-v3-design-spec-2026-07-14.md` + detail:
`.analysis/routing-v3-secenek-b-detay-2026-07-14.md` — read BOTH first; binding). Slice-1 delivers the
COMPLETE deterministic engine: `routeTaskV3` runs end-to-end in governance mode (elimination →
[pluggable AI slot, filled in Slice-2] → verifier → weighted ranking → decision+story+journal), with
policy-packs, learning-cells, replayable journal, Brain-escalation surface, `deckent agent lint`, the
agent.json three-way sync (Slice-0 left 12 shadows provisional), and the 3 manifest-less builtins
materialized. V2 keeps routing production UNCHANGED (`routing_v3.enabled` stays false; no production
call site switches — that is Slice-3). Slice-0 foundations are in `src/core/routing3/` — REUSE them;
re-inventing a schema or table that exists there is a defect.

## 🔒 BINDING (every task)
- Write ONLY to your own Files list · real `.deckent/`, `.brain/`, `.tasks/` READ-ONLY (tests use tmpdir)
  · no git stash/reset · `npm run build` FORBIDDEN · notes ONE STRING · self-assessment HONEST.
- No string-throw (typed DeckentError family). No report/summary markdown outside `.analysis/`.
- Tests hermetic (tmpdir, async spawn, no spawnSync). `tsc` alone is NOT proof.
- Zero-hardcode (ADR-G-036): no model names/flow literals in code paths; vocabulary/config/registry SSOT.
- i18n-FIRST for user-facing CLI strings (getMessage en+tr). Model-surface strings EN.
- Word-inference bans are LAW ('test' token, agent display-names in prose) — pin where relevant.
- V2 routing behavior MUST NOT change: routing-engine.ts / intent-classifier.ts OUT of scope.
- Deterministic stages are PURE functions of (vectors, config, cells-snapshot): same inputs → same
  outputs, replayable. No Date.now()/randomness inside decision math.

## Task 1: decision types and journal schema
- Files: src/core/routing3/decision-types.ts, tests/core/routing3/decision-types.test.ts
- Scope: src/core/routing3/, tests/core/routing3/
- Dependencies: none
### Description
Typed core for the pipeline: `RoutingDecisionV3` {agentId, skillIds, personaSlices, modelPreference,
effortClass, axisScores {content, positional, numerical}, finalScore, confidence (calibrated 0-1),
provenance ('deterministic'|'ai'), story: DecisionStory, escalation?: BrainEscalation} — frozen/readonly.
`DecisionStory` {summary, steps: [{stage, outcome, detail}], eliminated: [{agentId, reason}]}.
`BrainEscalation` {reason: 'tie'|'low-confidence'|'catalog-gap'|'conflict', candidates: [{agentId,
finalScore, axisScores}], evidence}. `JournalEntryV3` (zod, schemaVersion:1) capturing task-id, both
vectors, per-candidate stage outcomes, final decision, config-snapshot hash — sufficient for replay
WITHOUT re-running any AI call. All zod-validated; no mutable leaks (pin Object.isFrozen).
### goNogo
- goCriteria: schemas round-trip; frozen-decision pin; journal entry captures enough for replay (assert field presence table-driven); vitest green; tsc clean.
- nogo: any Date.now()/randomness in types/factories NO_GO.

## Task 2: stage-1 elimination
- Files: src/core/routing3/stage-eliminate.ts, tests/core/routing3/stage-eliminate.test.ts
- Scope: src/core/routing3/, tests/core/routing3/
- Dependencies: Task 1
### Description
`eliminate(requirement, candidates) → {survivors, eliminated: [{agentId, reason(typed enum)}]}`. Hard
filters, in documented order: needsWrite ∧ ¬writeAuthority → OUT · requirement workType marked
proficiency 'never' on the candidate → OUT · role contradiction (review-workType ↔ writeAuthority-only
implementer role and vice versa; derive from capabilities.positional.role) → OUT · deliverable ⊄
candidate deliverables (when candidate declares a non-empty deliverables list) → OUT. Pure; every
elimination carries the typed reason (feeds DecisionStory). This is the generalization of V2's
write-denied HARD-exclude — pin that specific case (construction requirement + deniedTools Write agent).
### goNogo
- goCriteria: each filter table-driven both directions; elimination reasons asserted; the V2 write-denied parity pin green; vitest green; tsc clean.
- nogo: any bonus/score math in this stage NO_GO (elimination is binary).

## Task 3: content-axis deterministic scorer
- Files: src/core/routing3/axis-content.ts, tests/core/routing3/axis-content.test.ts
- Scope: src/core/routing3/, tests/core/routing3/
- Dependencies: Task 1
### Description
`scoreContentDeterministic(requirement, capability) → {score 0-1, evidence}` for governance mode and as
the AI-stage cross-check baseline (Slice-2). Mapping: requirement.workType vs capability proficiency —
primary→1.0, secondary→0.7, able→0.4 (constants from ONE exported table, not scattered literals);
subtype rolls up to parent. When requirement.content provenance is 'structural' with null semantic
fields, expertise/personaSlices contribute NOTHING (no prose matching in deterministic mode — the
word-inference bans hold by construction; pin with paired inputs). Skills scored through the same
matchSpace normalizer (Slice-0 Task-8 export).
### goNogo
- goCriteria: proficiency table pinned; structural-null contributes zero prose signal (paired pin); agent and skill scored via one code path; vitest green; tsc clean.
- nogo: keyword matching against title/description text NO_GO.

## Task 4: positional-axis scorer
- Files: src/core/routing3/axis-positional.ts, tests/core/routing3/axis-positional.test.ts
- Scope: src/core/routing3/, tests/core/routing3/
- Dependencies: Task 1
### Description
`scorePositional(requirement, capability) → {score 0-1, evidence}`: weighted domain overlap
(requirement domain weights × capability domain proficiency; '*' wildcard counts as 'able'-level,
never outranking an explicit domain owner — pin), surface overlap, deliverable coverage ratio.
Deterministic, vocabulary-driven (domain ids resolved against the loaded vocabulary; unknown-domain
in a capability → typed issue surfaced, not silently zero).
### goNogo
- goCriteria: explicit-domain-owner beats wildcard pin; unknown-domain surfaces typed issue; overlap math table-driven; vitest green; tsc clean.
- nogo: silent-zero on unknown domain NO_GO.

## Task 5: numerical-axis scorer
- Files: src/core/routing3/axis-numerical.ts, tests/core/routing3/axis-numerical.test.ts
- Scope: src/core/routing3/, tests/core/routing3/
- Dependencies: Task 1
### Description
`scoreNumerical(requirement, capability, cellStats) → {score 0-1, evidence}`: outcome-cell success
contribution (cell = workType×domain×agent from learning-cells snapshot; missing cell = neutral 0.5,
NEVER a penalty for new agents — the Slice-0 §8 anti-cold-start note), size↔capacity fit, costTier
alignment with requirement effort/risk class, modelPreference validity checked against model-registry
ids at score time (zero-hardcode: no model literals here). Per ADR-G-006 tomorrow-clause the axis
carries cost/latency/risk hooks: latency/provider-health inputs are typed OPTIONAL fields consumed
when present (S2+ wires live values) — absent inputs = neutral, never fabricated.
### goNogo
- goCriteria: cold-start-neutral pin; cell contribution table-driven; optional latency/health inputs neutral-when-absent pinned; no model-name literals (grep-pin in test); vitest green; tsc clean.
- nogo: hardcoded model/provider names NO_GO.

## Task 6: weighted ranking with calibrated confidence and tie detection
- Files: src/core/routing3/stage-rank.ts, tests/core/routing3/stage-rank.test.ts
- Scope: src/core/routing3/, tests/core/routing3/
- Dependencies: Task 3, Task 4, Task 5
### Description
`rank(scored, config) → {ordered, top, confidence, indecision?: 'tie'|'low-confidence'}` — finalScore =
weighted sum with config weights (routing_v3.weights, already validated sum=1.0); confidence CALIBRATED:
function of top-vs-runner-up gap AND absolute top score (document the formula; it must be monotonic in
both — property-test with fast-check-style manual cases, no new deps). Tie = gap under configured
epsilon; low-confidence = top under routing_v3.confidenceFloor. Both produce indecision (→ Brain
escalation downstream, decision-5). Deterministic total order: equal finalScore breaks by explicit
documented key (higher content-axis, then agentId lexicographic LAST-resort — never silent).
### goNogo
- goCriteria: weight-config respected (override changes order, pinned); monotonicity cases green; tie and floor both yield indecision; deterministic order pin (same input twice → identical array); vitest green; tsc clean.
- nogo: undocumented tie-break NO_GO.

## Task 7: verifier cross-checks
- Files: src/core/routing3/verifier.ts, tests/core/routing3/verifier.test.ts
- Scope: src/core/routing3/, tests/core/routing3/
- Dependencies: Task 1, Task 2
### Description
`verify(requirement, candidate, context) → VerifierVerdict {pass | typed violations[]}`. Checks:
content-claim vs structural evidence conflict (e.g. proposed workType 'document' while deliverables
are 100% code-src → CONTENT_STRUCTURAL_CONFLICT — the LLM-cannot-bypass gate for Slice-2, but built
and tested NOW on deterministic inputs) · deliverable⊆capability re-assert · writeAuthority re-assert
(defense-in-depth: verifier NEVER trusts that elimination ran) · forceAgent path: force bypasses
RANKING but every verifier authority check still applies, force+violation → warning verdict requiring
confirmation (ADR-G-006 force-* semantics preserved).
### goNogo
- goCriteria: each check both directions; force-bypass-ranking-not-verifier pin; defense-in-depth pin (unfiltered candidate still caught); vitest green; tsc clean.
- nogo: verifier trusting upstream stages NO_GO.

## Task 8: ownership invariant and catalog-gap surfacing
- Files: src/core/routing3/verifier.ts, tests/core/routing3/ownership-invariant.test.ts
- Scope: src/core/routing3/, tests/core/routing3/
- Dependencies: Task 7
### Description
Extend verifier module: `assertOwnership(requirement, catalog) `— zero surviving candidates after
elimination+verify → typed `CatalogGapError` carrying {workType, domains, eliminatedSummary} (NEVER a
silent fallback — replaces V2's AGENT_FALLBACK_CHAIN class). Anti-temp invariant: a `source:'learned'`
temp agent may win ONLY when no builtin candidate survives with finalScore within the configured
epsilon — Sprint-205 guarantee re-expressed vectorially, pinned with a builtin-vs-temp fixture pair.
### goNogo
- goCriteria: CatalogGapError carries actionable payload (asserted); anti-temp vector pin green (temp loses to comparable builtin, wins when genuinely alone); vitest green; tsc clean.
- nogo: any fallback-chain reimplementation NO_GO.

## Task 9: policy-pack schema and 3-layer loader
- Files: src/core/routing3/policy-pack.ts, tests/core/routing3/policy-pack.test.ts
- Scope: src/core/routing3/, tests/core/routing3/
- Dependencies: Task 1
### Description
PolicyPack zod schema: rules of shape {id, description, when {workTypes?, domains?, riskClass?},
require {roles? , agentAllowlist?, denyAgents?, minConfidence?, escalate?: boolean}} — declarative,
no code execution. 3-layer load (builtin-none < org < project `.deckent/routing/policy-pack.json`)
reusing the vocabulary loader's merge/shadowing-report pattern (read vocabulary.ts first; share
helpers if cleanly extractable, do NOT copy-paste the merge). Typed validation issues; absent files
= empty pack (zero-config clean).
### goNogo
- goCriteria: schema round-trip + rejection cases; 3-layer merge + shadowing report; absent-file clean; vitest green; tsc clean.
- nogo: executable/eval-style policy conditions NO_GO.

## Task 10: policy enforcement in verifier
- Files: src/core/routing3/verifier.ts, tests/core/routing3/policy-enforcement.test.ts
- Scope: src/core/routing3/, tests/core/routing3/
- Dependencies: Task 7, Task 9
### Description
Wire policy-packs into verify(): matching rules (when-clause vs requirement) apply their require-clause
— role restriction, allow/deny lists, minConfidence override, escalate:true forces Brain escalation
regardless of score. Violations are typed with the policy id (auditable story). Enterprise example
fixtures: "security-domain → only role reviewer" and "config deliverable on high-risk → escalate".
### goNogo
- goCriteria: both example fixtures behavior-tested; policy violation carries policy id into verdict; non-matching rules inert (pin); vitest green; tsc clean.
- nogo: policy silently reordering instead of verdict/escalation NO_GO.

## Task 11: learning-cells sidecar module
- Files: src/core/routing3/learning-cells.ts, tests/core/routing3/learning-cells.test.ts
- Scope: src/core/routing3/, tests/core/routing3/
- Dependencies: none
### Description
Cell store `.deckent/stats/routing-cells.json` (schema: {schemaVersion, cells: {"<workType>|<domain>|
<agentId>": {uses, successes, qualitySum, lastSprint}}}): `readCellsSnapshot(projectRoot)` (frozen),
`recordOutcome(projectRoot, {workType, domain, agentId, verdict, quality, sprintId})` single-writer
tmp+rename atomic, idempotent per (taskId, sprintId) via a bounded recent-keys ring (follow
sprint-finalizer's recentSprints idempotency precedent — read it). Per-task DNA by CONTRACT: the
API takes the task's OWN vector fields; nothing here reads tasks[0] (kills the K4 bug class in the
new path). Tests tmpdir-hermetic.
### goNogo
- goCriteria: atomicity (tmp+rename asserted), idempotency pin, frozen snapshot pin; vitest green; tsc clean.
- nogo: writing real .deckent NO_GO; any cross-task DNA sharing in the API NO_GO.

## Task 12: ghost rejection and cell-quality gate
- Files: src/core/routing3/learning-cells.ts, tests/core/routing3/ghost-rejection.test.ts
- Scope: src/core/routing3/, tests/core/routing3/
- Dependencies: Task 11
### Description
recordOutcome consults the Slice-0 GHOST_SKILLS export (skill-profiles task) and a content-existence
probe (agent PROMPT.md non-empty) — outcomes attributed to ghost entities are REJECTED with a typed,
counted reason (visible in a `rejectedOutcomes` ledger section, never silent — the api-design
phantom-100% class dies at the source). Quality values clamped to [0,100]; malformed outcome →
typed reject, store untouched.
### goNogo
- goCriteria: ghost outcome rejected+counted (fixture ghost); clamp + malformed-reject pins; store byte-stable on rejected writes; vitest green; tsc clean.
- nogo: silent drop of a rejected outcome NO_GO.

## Task 13: decision-story builder
- Files: src/core/routing3/decision-story.ts, tests/core/routing3/decision-story.test.ts
- Scope: src/core/routing3/, tests/core/routing3/
- Dependencies: Task 1, Task 2, Task 6
### Description
`buildStory(pipelineTrace) → DecisionStory`: human-readable WHY — one summary sentence (winner + the
decisive axis), ordered stage steps, eliminated list with reasons, indecision/escalation explanation.
Structured fields (message-KEY + params, not baked prose) so CLI/desktop render via i18n (en+tr keys
added to messages.ts for the CLI-facing renderer `renderStoryLines(story, lang)`); model-surface
serialization stays EN. WORKER-LIVE-LOG contract honored: ≤80-char short-form line per step +
detail payload (MASTER-PLAN #582 consumer-ready).
### goNogo
- goCriteria: story from a full fixture trace asserted (summary + steps + eliminated); short-form ≤80-char pin; en+tr keys exist (pin); vitest green; tsc clean.
- nogo: hardcoded user-facing prose in renderer NO_GO.

## Task 14: journal v3 writer reader and replay
- Files: src/core/routing3/journal.ts, tests/core/routing3/journal-replay.test.ts
- Scope: src/core/routing3/, tests/core/routing3/
- Dependencies: Task 1
### Description
Append-only JSONL `.deckent/routing/decisions-v3/<sprint>.jsonl`: `appendDecision(projectRoot, entry)`,
`readSprintJournal`, and `replayDecision(entry, catalogSnapshot) → RoutingDecisionV3` — re-derives the
decision from the journal's recorded vectors + config-hash WITHOUT any AI call and asserts equality
with the recorded outcome (the spec §5 determinism proof lives here). Corrupted line → typed skip
with position report (fail-soft visible), never aborts the read.
### goNogo
- goCriteria: replay-equality pin on fixture entries; corrupted-line visible-skip; append-only (no rewrite) asserted; vitest green; tsc clean.
- nogo: replay needing an LLM call NO_GO.

## Task 15: routeTaskV3 orchestrator (deterministic end-to-end)
- Files: src/core/routing3/route-task-v3.ts, tests/core/routing3/route-task-v3.test.ts
- Scope: src/core/routing3/, tests/core/routing3/
- Dependencies: Task 2, Task 6, Task 8, Task 10, Task 13, Task 14
### Description
`routeTaskV3(task, catalog, options) → RoutingDecisionV3`: produce vectors (Slice-0 producers; content
via structural producer in deterministic mode) → eliminate → [contentFit slot: `options.contentFit?`
async injectable, ABSENT in this slice = deterministic scorer] → verify (+policy) → rank → decision
(story+journal append via options.journal). Indecision/catalog-gap/policy-escalate → decision carries
`escalation` (typed; the Brain-consumption wire is Slice-2). governanceMode 'deterministic' path is
COMPLETE and honest (provenance:'deterministic', confidence never inflated). Skill+persona-slice
selection inside the SAME pipeline run (matchSpace) — one decision object carries all three
(vectorial-directive: agent-skill-persona together).
### goNogo
- goCriteria: tmpdir e2e — real Slice-0 builtin catalog fixture: build-requirement→implementer; refactor→refactorer; docs→doc-writer; i18n-domain→i18n-specialist candidacy visible in ordered list; gap-fixture→CatalogGapError; escalation fixture carries typed payload; journal written+replayable; vitest green; tsc clean.
- nogo: production call sites switched NO_GO (enabled stays false); silent fallback anywhere NO_GO.

## Task 16: agent lint reachability sweep
- Files: src/core/routing3/agent-lint.ts, tests/core/routing3/agent-lint-reachability.test.ts
- Scope: src/core/routing3/, tests/core/routing3/
- Dependencies: Task 15
### Description
`lintCatalog(catalog, vocabulary) → LintReport`: synthetic requirement sweep (every workType × every
vocabulary domain × writeAuthority variants) through the REAL deterministic pipeline (eliminate+rank,
no AI) → per-agent reachability (never-selected agents flagged with the nearest-miss reason),
per-cell coverage gaps (workType×domain with zero capable agents — the ownership-invariant author-time
lens). Pure over inputs; no fs.
### goNogo
- goCriteria: fixture catalog with a deliberately unreachable agent flagged with nearest-miss; gap cells enumerated; sweep deterministic (twice → identical); vitest green; tsc clean.
- nogo: sweep bypassing the real pipeline (reimplemented scoring) NO_GO.

## Task 17: agent lint overlap map and CLI wire
- Files: src/core/routing3/agent-lint.ts, src/cli/commands/agent.ts, tests/cli/agent-lint-cli.test.ts
- Scope: src/core/routing3/, src/cli/, tests/cli/
- Dependencies: Task 16
### Description
Overlap analysis: pairwise capability-vector similarity (shared workType-proficiency × domain overlap)
→ pairs above threshold reported ("you overlap X 87% — differentiate or merge"; the ci-guardian↔
devops-engineer twin-lens, custom-agent author guidance per 66/100 criticism). Wire `deckent agent lint`
subcommand (i18n en+tr, JSON mode passthrough): loads real catalog+vocabulary, prints reachability +
gaps + overlaps, exit 1 on gap-cells (CI-usable ratchet), exit 0 otherwise.
Smoke: node dist/cli/entry.js agent lint → exit 0 on the shipped catalog and a rendered report.
### goNogo
- goCriteria: overlap fixture pair reported with percentage; CLI hermetic test (tmpdir project) asserting sections + exit codes both ways; i18n keys pinned; vitest green; tsc clean.
- nogo: hardcoded user-facing strings NO_GO.

## Task 18: manifest three-way sync module
- Files: src/core/agent-manifest-sync.ts, tests/core/agent-manifest-sync.test.ts
- Scope: src/core/, tests/core/
- Dependencies: none
### Description
agent.json counterpart of 444's agent-prompt-sync (READ src/core/agent-prompt-sync.ts FIRST and mirror
its contract exactly): builtin agent.json → `.deckent/agents/<id>/agent.json` shadow with three-way
protection (byte-equal-to-baseline → update; locally-edited → keep + typed conflict; missing → create),
state in `.deckent/agents/.manifest-sync-state.json` (same schema shape as .prompt-sync-state.json,
sha1 of last-synced builtin content). Structured report {updated, keptLocal, created, conflicts}.
Slice-0 left 12 provisional shadows — this module is their mechanism-path resolution (real run is
HOST-SIDE by Brain post-sprint).
### goNogo
- goCriteria: all three branches hermetically behavior-tested; never-silent-overwrite pin; state-file round-trip; report asserted; vitest green; tsc clean.
- nogo: inventing a divergent state-file schema when prompt-sync's fits NO_GO; writing real .deckent NO_GO.

## Task 19: manifest sync CLI wire
- Files: src/cli/commands/sync.ts, tests/cli/sync-manifest-threeway.test.ts
- Scope: src/cli/, tests/cli/
- Dependencies: Task 18
### Description
Wire agent-manifest-sync into `deckent sync` adapter phase AFTER prompt-sync, REPLACING the Slice-0
provisional-migrator call for shadows whose builtin already carries real capabilities (order: three-way
manifest sync first; migrator now only fills capabilities for manifests STILL lacking them post-sync —
adjust the 445-011 wire accordingly, dry-run purity preserved). Report lines i18n. Hermetic tests
incl. the ordering contract and dry-run byte-stability.
Smoke: node dist/cli/entry.js sync --adapters-only → exit 0, three-way report before migrator report.
### goNogo
- goCriteria: ordering contract pinned (three-way before migrator; migrator skips real-capabilities manifests); dry-run writes nothing (pin); hermetic; vitest green; tsc clean.
- nogo: double-processing a shadow by both paths NO_GO.

## Task 20: materialize the three manifest-less builtins
- Files: src/core/builtins/agents/observability-engineer/agent.json, src/core/builtins/agents/api-designer/agent.json, src/core/builtins/agents/i18n-specialist/agent.json
- Scope: src/core/builtins/agents/
- Dependencies: none
### Description
Author full agent.json (manifestVersion 2 + REAL capabilities v3, non-provisional) for the last three
manifest-less builtins, persona-grounded from their PROMPT.md: observability-engineer (analyze:primary,
build:secondary, domains devops-ci+core-runtime), api-designer (analyze:primary, document:secondary,
domains api — designer not builder), i18n-specialist (build:secondary, review:secondary, domains
i18n:primary). Activation block: valid-but-inert V2 rules (empty rules array, minScore 5) so V2
behavior is UNCHANGED (they were never V2-selectable via keywords; pin stays true). NOTE: catalog-
materialize re-aim is Task 21's job — expect ITS suite red until Task 21 lands; your gate is the
builtins+routing3 suites.
### goNogo
- goCriteria: 3 valid manifests (validateCapabilities); V2-inert activation (empty rules); the capabilities catalog-convention suite green (run: npx vitest run tests/core/builtins/ — read-only run, no test edits); tsc clean.
- nogo: V2-scoreable activation rules NO_GO.

## Task 21: catalog-materialize re-aim with injectable builtin dir
- Files: src/core/agent-pool.ts, src/core/skill-pool.ts, tests/core/builtins/catalog-materialize.test.ts
- Scope: src/core/, tests/core/builtins/
- Dependencies: Task 20
### Description
The 445-019 conflict's structural fix: give AgentPoolManager (and SkillPoolManager if it shares the
pattern) an optional `builtinDirOverride` (constructor opts or module-level test hook — pick the
smallest surgical surface; production default UNCHANGED) so the builtin-fallback path is testable with
a tmpdir fixture builtin tree. Re-aim catalog-materialize: fallback assertions run against a synthetic
manifest-less fixture agent in the injected dir (the mechanism keeps a real test); the 3 newly
materialized agents' assertions flip to manifest-loaded expectations (pool-visible, source builtin,
prompt via shadow/builtin file precedence as-is). getAgentPrompt's builtin fallback covered via the
same injection if applicable.
### goNogo
- goCriteria: catalog-materialize green WITH Task-20 manifests present; fallback mechanism still genuinely tested (synthetic fixture, injected dir); production default-path untouched (pin: no override → same dir as before); full tests/core/builtins/ green; tsc clean.
- nogo: deleting the fallback test instead of re-aiming NO_GO.

## Task 22: corpus fixture data and harness
- Files: tests/core/routing3/fixtures/corpus-cases.json, tests/core/routing3/corpus-harness.test.ts
- Scope: tests/core/routing3/
- Dependencies: Task 15
### Description
Encode the evidence corpus as data: from `.analysis/routing-v3-appendix-misroute-corpus-2026-07-14.md`
(25 cases) + the 443 natural-experiment shape + the 12-probe battery + 445-016/445-024 — each case
{id, title, description, scope, expected {workTypeOneOf?, domainIncludes?, agentOneOf? | pending:
'ai-stage'}, source}. Harness runs deterministic routeTaskV3 on every non-pending case against the
REAL builtin catalog (read-only) + builtin vocabulary; pending cases asserted as EXPLICITLY pending
(count pinned so Slice-2 must burn them down consciously). The natural-experiment class MUST pass
deterministically NOW (agent-name-in-title has no channel into vectors).
### goNogo
- goCriteria: ≥25 encoded cases; natural-experiment paired-cases green deterministically; pending-count pinned with reasons; harness green; tsc clean.
- nogo: weakening a case's expectation to pass NO_GO — mark pending with reason instead.

## Task 23: slice-1 deterministic e2e and replay gate
- Files: tests/core/routing3/slice1-e2e.test.ts
- Scope: tests/core/routing3/
- Dependencies: Task 15, Task 17, Task 19, Task 22
### Description
Final integration gate, tmpdir-hermetic: fixture project (catalog copy + vocabulary + policy-pack with
one escalating rule) → routeTaskV3 across 8 requirement shapes → decisions + stories + journal; then
(1) replay every journal entry → equality; (2) lintCatalog over the same fixture → no gaps; (3) policy
escalation fixture surfaces BrainEscalation; (4) V2-unchanged guard: run routing-implementer-era +
routing-impl-builtin + agent-impl-balance suites yourself and report counts (no modifications);
(5) npx tsc --noEmit clean; (6) full tests/core/routing3/ green. Counts in notes.
### goNogo
- goCriteria: all six gates green with counts; zero V2-pin modifications.
- nogo: any V2 routing pin red NO_GO.
