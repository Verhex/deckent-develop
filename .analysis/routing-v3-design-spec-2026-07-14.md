# ROUTING-ENGINE-V3 DESIGN SPEC — vector-selection (3-axis, hybrid deterministic+AI)
> Template: docs/templates/spec-template.md (all 8 sections; §8 mandatory). Language: EN (model-surface).
> Approvals (Alperen 2026-07-14): LLM-assignment+deterministic-verifier · capability-matrix=agent.json-v3 SSOT ·
> direct cut-over ("v2 başarılı değil") · Brain-escalation on tie/indecision · NO test work-type / no test-engineer
> ("no inference from the word 'test'") · 🔒 vectorial-3D directive (numerical·positional·content) ·
> Option-B vocabulary + detail doc APPROVED ("onaylıyorum").
> Evidence base: `.analysis/routing-v3-system-debug-2026-07-14.md` + 3 appendices + `routing-v3-secenek-b-detay-2026-07-14.md`.
> ADR ground: **ADR-G-006 explicitly commits to "learned Routing V3 … vector-selection" as its tomorrow-clause** —
> this spec EXECUTES the ADR; a today-clause amendment ships in Slice-0 (anticipated evolution, not violation).

## 1 · PURPOSE
Replace the keyword-race routing chain (intent-classifier → activation scoring → bonus jungle → catch-all)
with RoutingEngineV3: task = RequirementVector, agent+skill+persona = CapabilityVector, matching = 3-axis
hybrid pipeline (deterministic elimination → AI content-fit → deterministic verifier → numerical ranking →
decision+story, Brain escalation on tie/low-confidence). Kills the root causes K1-K5 (impoverished task
model · broken intent taxonomy · missing capability model · open learning loop · no single source).
Customizable at enterprise scale: 3-layer vocabulary registry, weight/threshold config, policy packs,
governance mode (AI stage can be disabled honestly). Also owns model/effort/provider preference per
ADR-G-006 tomorrow-clause (cost×latency×risk×provider-health×outcome axes live in the numerical dimension).

## 2 · FILE SCOPE
**Write (new core, Slice-0/1/2):**
- new: `src/core/routing3/vocabulary.ts` (registry load/merge/validate; 3-layer: builtin < org < project)
- new: `src/core/routing3/vocabulary-builtin.ts` (base work-types[8] + base domains + deliverable types)
- new: `src/core/routing3/requirement-vector.ts` (deterministic positional/numerical production + content slot)
- new: `src/core/routing3/capability-vector.ts` (agent.json-v3 `capabilities` schema, zod; skill profile reuse)
- new: `src/core/routing3/manifest-migrator.ts` (v2 activation.rules → v3 capabilities; wired into `deckent sync`)
- new: `src/core/routing3/match-pipeline.ts` (stages 1/3/4/5; stage-2 delegated to content-fit module)
- new: `src/core/routing3/content-fit.ts` (LLM batch content scoring + structural cross-check; provider via model-registry, zero-hardcode)
- new: `src/core/routing3/verifier.ts` (intersection tests · anti-temp · ownership invariant · policy packs · deliverable⊆capability)
- new: `src/core/routing3/learning-cells.ts` (cell = workType×domain×agent sidecar `.deckent/stats/routing-cells.json`; per-task DNA; ghost rejection)
- new: `src/core/routing3/decision-story.ts` (human-readable "why" + journal v3, WORKER-LIVE-LOG-ready)
- new: `src/core/routing3/policy-pack.ts` (org/project rule packs enforced in verifier)
- new: `.deckent/routing/vocabulary.json` (project layer, bootstrapped by analyze)
- Builtin manifest re-authoring: `src/core/builtins/agents/*/agent.json` (~21 agents → capabilities v3) + skill manifests (profiles)
- Integration touch: `src/orchestra/sprint-planner.ts` (batch content-fit at plan time; per-task DNA fix), `src/orchestra/task-router.ts` (V3 entry), `src/orchestra/debt-manager.ts` (fix-path: preserve fresh-eyes rotation semantics), `src/cli/commands/sync.ts` (migrator wire), `src/core/agent-pool.ts` (drop injection map; load capabilities), config-types (weights/thresholds/flags/governance), `deckent agent lint` (new CLI surface: reachability + overlap map), doctor checks.
**Delete (Slice-3 cut-over):** intent-classifier keyword race (INTENT_KEYWORDS/GENERIC-demotion/impl-boost) ·
routing-engine bonus jungle (domain/surface/test-ownership/ciGuardian/kind/affinity/lang bonuses) ·
AGENT_FALLBACK_CHAIN · BUILTIN_IMPLEMENTATION_INTENT_RULES · suppressRefactorerTestCatchAll ·
@deprecated selectAgent/selectSkills (born-699 executed here).
**Read-critical:** `routing-v3-secenek-b-detay-2026-07-14.md` (schemas) · ADR-G-006 full text (guards to preserve) ·
`src/core/model-registry.ts` (zero-hardcode model refs) · `src/core/config.ts` (3-layer merge pattern) ·
appendix-signal-inventory (call-site map).
**Separate-test decision:** together per module; acceptance corpus is its own task family.

## 3 · EDGE POLICIES
- **Ownership invariant:** verifier finds NO candidate → typed `CatalogGapError` surfaced to Brain (never a
  silent fallback chain). Brain decides (decision-5). `deckent agent lint` catches unreachable/gap classes at author time.
- **LLM disagreement:** content-fit contradicts structural evidence (says `document`, deliverables 100% code-src)
  → typed conflict → Brain escalation. LLM output NEVER bypasses verifier.
- **Governance mode (AI off):** pipeline runs elimination+positional+numerical only; decision confidence
  marked `deterministic-only`; escalation threshold lowered. No silent degradation (honest-mode law).
- **Legacy manifests:** v2 activation.rules encountered at load → migrator maps to provisional capabilities
  + `provisional:true` flag + doctor warning; provisional agents rank below explicitly-authored ones on ties.
- **Vocabulary conflicts:** duplicate domain id across layers → higher layer wins, doctor reports shadowing;
  dead pathPatterns (match nothing) → doctor warning.
- **Concurrency/ordering:** vocabulary+cells read once per plan (snapshot); cell writes only by finalizer
  (single-writer, tmp+rename); journal append-only.
- **Word-inference bans:** the token "test" NEVER contributes to classification (Alperen decision);
  agent names appearing in prose NEVER contribute (kills the 443 natural-experiment class — content axis
  reads work semantics, positional axis reads scope only).
- **Error path:** all failures typed (DeckentError family); per-candidate evaluation failure excludes that
  candidate with a story entry, never aborts the sprint plan.

## 4 · RETURN/MUTATION SEMANTICS
- `routeTaskV3(task, catalog, options) → RoutingDecisionV3` { agentId, skillIds, personaSlices,
  modelPreference, effortClass, axes: {content, positional, numerical} scores, confidence (calibrated),
  story: DecisionStory, escalated?: BrainEscalation } — frozen/readonly; no internal references leak.
- Deterministic stages are pure functions of (vectors, config); same inputs → same outputs (replayable
  from journal). AI stage output is recorded verbatim in the journal so decisions replay WITHOUT re-calling the LLM.
- force-* overrides preserved (ADR-G-006): forceAgent bypasses ranking but NOT the verifier's authority
  checks; a verifier-failing force → warning + Brain confirmation.
- FIX-path: selectFixAgent fresh-eyes rotation semantics preserved, re-expressed as a verifier-approved
  re-rank with `excludePrior` (identity/model preserved per ADR).

## 5 · PROOF (behavior runs MANDATORY; tsc alone is not proof)
- **Acceptance regression corpus:** the 25-case misroute corpus + a6-sinav corpus + the 443
  natural-experiment (20 identical tasks) + the 12-probe battery, encoded as a fixture suite:
  V3 must route every documented misroute CORRECTLY and must NOT regress the control cases
  (doc/bugfix/frontend/perf ✅ set). Run: `npx vitest run tests/core/routing3/acceptance-corpus.test.ts`.
- Non-monotonicity pin: adding the word "Refactor" to case-B text must NOT change its work-type (refactor stays).
- Diversity guards re-aimed (ADR-G-006 intent preserved): single-agent ≤60% on the mixed 16-task set,
  ≥4 distinct agents; distribution script reads V3 journal.
- Ownership-invariant lint: catalog with a gap → CatalogGapError test; `deckent agent lint` real-binary run.
- Live smoke (Tier-1): `node dist/cli/entry.js plan` on a real DIRECTIVES → journal contains V3 stories;
  `deckent agent lint` exit 0 on shipped catalog.
- Migration proof: v2 manifest fixture → migrator → identical routing outcomes on the control corpus.
- Determinism proof: same plan replayed from journal → identical assignments without LLM calls.

## 6 · PROHIBITIONS (fixed block)
- No report/summary markdown outside `.analysis/`. goNogo names only genuinely written paths.
- No commas in task titles. No string-throw — typed-error family only.
- Existing export signatures unchanged unless the task explicitly demands it.
- ADR constraints binding; ADR-G-006 today-clause amendment is Slice-0 work, BEFORE mechanism removal.
- Zero-hardcode: no model names, no domain tables in code paths — registry/config only (ADR-G-036).
- i18n-FIRST for all user-facing CLI output (lint/doctor/story rendering via getMessage).
- Real `.deckent/`, `.brain/`, `.tasks/` untouched by workers; tests hermetic (tmpdir, async spawn).

## 7 · SIZE — 4 slices × 1 sprint each (law-8: 20-40 micro-tasks/sprint)
- **Slice-0 FOUNDATION (sprint-445):** vocabulary registry+builtin base+bootstrap · zod schemas
  (Requirement/Capability) · agent.json-v3 + migrator · 21 builtin manifest re-authoring · skill profiles ·
  ADR-G-006 amendment (today→V3) · doctor vocabulary checks. ~24-30 tasks.
- **Slice-1 DETERMINISTIC ENGINE (sprint-446):** requirement-vector production · stages 1/3/4 ·
  learning-cells · decision-story+journal · policy-pack core · agent lint. ~22-28 tasks.
- **Slice-2 AI STAGE + INTEGRATION (sprint-447):** content-fit LLM batch · cross-check · Brain-escalation
  wire · planner/fix-path/run integration · governance mode · embedding prefilter (flagged). ~20-26 tasks.
- **Slice-3 CUT-OVER (sprint-448):** call-site replacement · dead-code deletion (list in §2) · test-suite
  re-aim (~30 files) · acceptance corpus green · distribution guards on V3 journal · docs + DECKENT.md.
  ~24-32 tasks.
Each slice ends with Alperen report+approval before the next (law-3).

## 8 · BLAST RADIUS
- **Consumers (grep-proven):** routeTaskV2 callers — sprint-planner (SP:604/728), mid-sprint-adapter
  (MSA:231/237), task-mode-runner:224, mcp/tools/run:105, cli/commands/run:323, debt-manager fix-path;
  ~30 test files pin V2 behavior (routing-*, agent-impl-*, word-match-*, catalog suites); dashboards/
  status readers of decision journal; DECKENT.md + docs referencing routeTaskV2; born-622 journal consumers.
  Each gets a slice-3 task; none may be silently dropped.
- **What the old behavior silently protected:** (a) anti-temp guarantee (builtin beats temp) — becomes a
  verifier invariant with its own test; (b) refactorer-test suppress patches masked ownerless-testing —
  V3 removes the hole itself (universal test capability), pinned by corpus cases 438-441; (c) fallback
  chain guaranteed SOME assignment — replaced by CatalogGapError+Brain (explicitly better: honest gap
  vs silent wrong agent); (d) shadow-manifest precedence + load-time injection (F3 lesson) — V3 resolves
  capabilities through ONE provenance-tracked path, doctor-visible; (e) W5 role-mismatch penalty semantics
  fold into elimination-stage role checks.
- **Mode/flag matrix:** governance-mode ON/OFF × provisional-manifests present/absent × vocabulary layers
  (builtin-only / +org / +project) × forceAgent × fix-path × single-task run (learning present/absent) —
  each combination carries at least one pinned test; cut-over ships with defaults = AI-on, weights 0.5/0.3/0.2.
