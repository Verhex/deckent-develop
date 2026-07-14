# ADR-G-006: Routing & Selection (Learned Model/Effort + Agent/Skill)

**Class:** ADR-G (Global / Constitution) · **Scope:** global+project · **Immutable:** yes · **Source:** publisher · **Enforcement:** today=RoutingEngineV3 (3-axis vector-selection: RequirementVector×CapabilityVector, 5-stage hybrid pipeline [eliminate → content-fit → verify → rank → decide], vocabulary registry, agent.json-v3 capabilities SSOT, policy packs, learning cells, replayable decisions-v3 journal; V2 engine REMOVED at the S3 cut, 2026-07-15) → tomorrow=learned weight-tuning + provider-health/latency axis activation + embedding-prefilter default-on at catalog scale

**Status:** accepted (V3 LIVE — today-clause amended at the S3 cut; V2 fully removed) · **Date:** 2026-06-30 (rev 2026-07-15) · **Absorbs:** ADR-015 (TaskRouter 6-level) + ADR-028 (Decision-Engine V1→V2→V3) + ADR-072 (Routing Balance multi-signal) + ADR-073 (Routing Live Validation + FIX-prompt) + ADR-075 Part-B (skill→agent affinity)
**Crosswalk:** 015 (+028+072+073+075B) → ADR-G-006

> **Authoring note (Alperen):** an ADR's documentation must explain both **today AND tomorrow** through its target-intent, transparently — "this matters and is critical to us." This ADR is the first-class application of the ADR-AUTHORING-STD (ADR-G-019: document today + tomorrow, transparently).

---

## Context

Routing decides, per task: which agent, which skills, which provider, which model, which effort. The old stack was a 6-level router (ADR-015) plus a V1 decision-engine (ADR-028) that was superseded by V2 (`routeTaskV2`) but **never removed**; plus a chronic distribution-skew problem (one agent winning ~12/16 tasks) that ADR-072/073/075B mitigated with domain-enrichment, domain-match-bonus, skill→agent affinity, a live-diversity test, and a routing-distribution guard. The 2026-06-30 review consolidates routing into one ADR, **mandates the complete removal of V1** (decided — "izi bile kalmayacak"), and commits to a **learned, evolving** selection model (V3).

---

## Decision (Today) — RoutingEngineV3

**RoutingEngineV3 is the routing engine**, replacing `routeTaskV2`'s keyword-race +
additive-bonus arithmetic with a structural vector-match:

- **Two typed vectors.** Every task is compiled into a `RequirementVector`; every
  agent/skill/persona-slice is described by a `CapabilityVector` (agent.json-v3
  `capabilities`, SSOT per brainstorm-decision-2). Both share **3 axes**:
  - **content** — work-type (closed 8-value set: build·fix·refactor·document·review·configure·
    migrate·analyze, plus a free-text `SUBTYPE` extension) + LLM-produced semantic summary/tags;
    matched against agent proficiency (`primary`/`secondary`/`able`/`never`).
  - **positional** — domains (open, 3-layer registry: builtin-base < project-derived <
    user/org-defined, zero-hardcode), deliverable types (code-src/code-test/doc/config/
    workflow/manifest/script/migration/asset — deterministically derived from `filesWrite`),
    surfaces, write-authority, language.
  - **numerical** — size/file-count/module-count/effort-class/risk-class on the task side;
    preferred-model/cost-tier/cell-based outcome-stats on the capability side.
- **A 5-stage hybrid pipeline** (deterministic-first, AI in the middle, deterministic-last):
  1. **Elimination** (deterministic) — write-denied, role-conflict, domain-exclusive-policy,
     `workType=never` candidates drop out. Generalizes today's write-denied hard-exclude; the
     additive bonus/penalty jungle is retired, not reformed.
  2. **AI content-fit** — one LLM batch call per sprint-plan (cost amortized, not per-task)
     scores remaining candidates' content-vector fit + emits a one-sentence rationale; an
     optional embedding prefilter (flag-gated, default keyed to catalog size) narrows the
     candidate set before the LLM call at enterprise scale.
  3. **Verifier** (deterministic; LLM output cannot bypass it) — content/positional
     cross-checks, anti-temp invariant, ownership invariant (no candidate survives →
     typed `CatalogGapError` to Brain, never a silent fallback chain), policy-pack rules,
     `deliverable ⊆ agent.deliverables`.
  4. **Numerical ranking** — verified candidates ranked by outcome-cell stats + numerical fit;
     default axis weights content 0.5 / positional 0.3 / numerical 0.2, org/project-overridable.
  5. **Decision + story** — a clear leader is assigned; a tie or below-threshold confidence
     escalates to Brain (brainstorm-decision-5) instead of guessing. Every decision produces a
     human-readable "why" plus a V3 journal entry (append-only, replayable without re-calling
     the LLM).
- **Vocabulary is a 3-layer registry** (builtin-base < project-derived via `deckent analyze`
  < user/org `.deckent/routing/vocabulary.json`), zod-validated, `deckent doctor`-checked for
  shadowing/dead patterns — the ~25 hardcoded routing tables collapse into this one registry
  plus the closed work-type kernel and the closed deliverable-type list.
- **`agent.json-v3` capabilities are the SSOT** for both agents and skills (skill profiles share
  the same schema) — agent+skill+persona-slice selection is a single match, ending the
  "skills-before-agent" ordering quirk. `deckent sync` migrates v2 `activation.rules` manifests
  to provisional v3 capabilities (flagged, ranked below explicitly-authored ones on ties).
- **Direct cut-over** (brainstorm-decision-4, "v2 başarılı değil" — no shadow-mode A/B): Slice-3
  (sprint-448) deletes the V2 mechanism outright once the acceptance-regression corpus is green
  (25-case misroute corpus + a6-sinav corpus + the 443 natural-experiment set + the 12-probe
  battery — every documented misroute must route correctly, every control case must not
  regress). Full call-site/consumer/test blast-radius enumerated in design-spec §8 — each
  consumer gets an explicit Slice-3 task, none silently dropped.
- **Ancestry note (was: V1→V2).** The 2026-07-01 ROUTE-V1-PURGE history (V1 `DecisionOrchestrator`
  deletion, config/runtime-default fix to `'v2'`) remains true and is preserved as historical
  record in the base ADR text; it is superseded as the *current* engine description by the
  V3 clause above, not erased from the record.

---

### Ancestry — the retired V2 decision (historical, removed 2026-07-15)

> 
> - **`routeTaskV2` is the routing engine.** Selection combines: intent domain-enrichment (scope-path → api/security/design/data/devops/docs intent), **domain-match bonus (+3)**, surface-aware bonus (ADR-G-009 Tier-1 → api-builder/frontend-designer/ci-guardian), and `force-*` overrides (preserved). **Skill→agent affinity** (`SKILL_AGENT_MAP` + affinity-bonus) is a **config-enableable** signal, **default-off** today (`skillAgentAffinity ?? false`) — a real selection lever once enabled, not an always-on default (AFFINITY-DEFAULT-DECISION: make default-on, or keep config-gated by design).
> - **Guards:** live routing-diversity test (single-agent ≤60%, ≥4 distinct agents on a mixed set) + a **routing-distribution script** (`routing-distribution.mjs --ci`, >80% → fail) wired in CI — note it is **advisory in practice**: with no `.deckent/routing/learnings.json` data it passes vacuously, so it is "script + tests + optional guard", not a hard standalone gate. **FIX-prompt enrichment** (original-task + NO_GO-reason injected). `selectFixAgent` is **not** bug-fixer-by-default: it **preserves the model (identity)** and applies a **fresh-eyes agent rotation** (a complementary agent — e.g. architect→code-reviewer), while **preserving the original agent for specific failure modes** (test / doc / bug / exit-no-result) and rotating only for the generic case.
> - **✅ V1 removal — DONE (ROUTE-V1-PURGE, 2026-07-01).** "izi bile kalmayacak" — executed. Deleted: `src/orchestra/decision-engine.ts`'s `DecisionOrchestrator` (its live scope-collision guard was `git mv`'d to `scope-collision.ts`, preserving blame), `decision-replay.ts`, `decision-steps/agent-step.ts` + `scope-step.ts`, the V1-exclusive integration tests (`full-sprint-e2e`, `error-recovery`, both `decision-engine.test.ts`, `decision-replay.test.ts`, the two `decision-steps` tests), the `decision-orchestrator-v1` manifest entry (+ its `sync-manifest.mjs` source + `dead-code-audit.mjs` suspects). Config drops `'v1'`: `config.ts` validation → `['v2']`, the type is `'v2'`, `config-migration.ts` updated. **Every runtime default fixed to `'v2'`** — `sprint-planner.ts` (`?? 'v1'`→`?? 'v2'`, and the V1 else-branch removed), `sprint-controller.ts` fix-path, and `sprint-finalizer.ts` (which had read `undefined !== 'v2'` → **ran the legacy V1 stats path by DEFAULT** — the latent bug; now defaults `'v2'`, the learnings.json SSOT path). Types narrowed (`task-types.ts`, `outcome-tracker.ts`). **Two vestiges remain as born follow-ups:** the finalizer's now-dead V1 stats branch is a behavior-sensitive collapse (ROUTE-V1-DEADBRANCH-COLLAPSE) and the deleted V1-only integration tests need V2 equivalents (ROUTE-V2-INTEGRATION-COVERAGE).
> 
> ---

## Intent / Roadmap (Tomorrow) — beyond V3 cut-over

Slice-3 (sprint-448) closes the V3 migration described above, but is itself not the final
target. The next increment:

- **Learned weight-tuning.** The default axis weights (content 0.5 / positional 0.3 /
  numerical 0.2) become an *auto-tuned* starting point: the per-cell outcome stats
  (`workType × domain × agentId` → uses/successRate/qualityAvg) feed a weight-adjustment loop,
  closing the K4 learning-loop gap for good rather than merely fixing its bugs (dead
  `tasks[0]`-DNA, zeroed stats, phantom-skill signal) — see
  [`adr-g-032-self-learning-evolution-loop.md`](adr-g-032-self-learning-evolution-loop.md).
- **Provider-health axis activation.** The numerical axis schema already reserves
  cost-tier/model-preference slots (design-spec §1: "also owns model/effort/provider preference
  per ADR-G-006 tomorrow-clause — cost×latency×risk×provider-health×outcome axes live in the
  numerical dimension"); tomorrow activates the provider-health component so routing responds
  to live provider degradation, not just static preference — extending
  [`adr-g-008-provider-abstraction-fleet-usage.md`](adr-g-008-provider-abstraction-fleet-usage.md).
- **Embedding prefilter default-on at catalog scale.** Today the prefilter is flag-gated,
  default keyed to catalog size (design-spec §2, Slice-2). Tomorrow it graduates to default-on
  once an enterprise-scale catalog (hundreds of custom agents) is the common case, keeping the
  per-task LLM cost sublinear in catalog size.
- **Policy-pack and governance-mode maturation.** Org-level policy packs (e.g.
  "security-domain → reviewer+security role only", "PII-domain → approved-agent allowlist
  only") and the AI-stage-off governance mode are live from Slice-2/3 in a minimal form;
  tomorrow extends the policy-pack vocabulary and multi-tenant scoping as real enterprise
  deployments exercise it (dual-lens law: dogfood today, millions-of-users tomorrow).
- **Distribution balance remains continuously monitored** (base ADR's existing commitment),
  now measured against the V3 journal rather than the V2 event stream.

---

## Consequences

**(+)** One routing law; selection is multi-signal and diversity-guarded today, and learned/auditable tomorrow. New models adopt on merit without hardcoded IDs. User + project scoping.

**(−)** V1 is gone at the engine + config + runtime-default level, but two vestiges remain: (1) the finalizer's now-**dead** `if (routingVersion !== 'v2')` stats branch (61 lines) is left in place because collapsing it is a behavior-sensitive dedent on the critical finalize/double-count-guard path — ROUTE-V1-DEADBRANCH-COLLAPSE; (2) the deleted V1-only integration tests (`full-sprint-e2e`, `error-recovery`, project-type routing blocks) were exercising dead code, but if any was the *only* coverage of a "route N tasks for a monorepo" scenario, a V2 equivalent is owed — ROUTE-V2-INTEGRATION-COVERAGE. Fixing the finalizer default from V1→V2 is a real behavior change (stats now record to learnings.json, the V2/V3 SSOT, instead of agent.json). Distribution skew is mitigated, not solved (recurred at Sprint 211 as refactorer-heavy) — and the skill→agent affinity lever is **default-off** (AFFINITY-DEFAULT-DECISION). The `routingVersion` label is still inconsistent (`'v3'` returned vs `'v2'` stamped — ROUTING-VERSION-LABEL), and a vestigial single-value `if (routingVersion === 'v2')` guard remains in the planner for that reconcile. V3 (learned matrix) is roadmap; today is V2 + guards.

---

## References / Absorbed

- **Absorbs:** ADR-015 + ADR-028 (V1 lineage — purge mandated, pending) + ADR-072 + ADR-073 + ADR-075 Part-B.
- **Cross-ref:** ADR-G-008 (provider/model registry, cost) · ADR-G-009 (surface-aware routing, eval) · ADR-G-023 (agent/skill taxonomy, affinity) · ADR-G-032 (evolution — outcome signal) · ADR-G-028 (work taxonomy).
- **Born / MASTER-PLAN:** **ROUTE-V1-PURGE** (P0 — ✅ **done 2026-07-01**: V1 engine/config/runtime-default/manifest/tests deleted, scope-collision guard relocated) · **ROUTE-V1-DEADBRANCH-COLLAPSE** (born — collapse the finalizer's now-dead V1 stats branch + the vestigial planner/finalizer version-guards; behavior-sensitive) · **ROUTE-V2-INTEGRATION-COVERAGE** (born — V2 equivalents for the deleted V1-only full-sprint / error-recovery / project-type integration tests) · ROUTE-1+ (Routing V3) · PROV-MATRIX · F1-AD · **ROUTING-VERSION-LABEL** (P2 — reconcile `'v3'`-return vs `'v2'`-stamp) · **AFFINITY-DEFAULT-DECISION** (P1 — skill→agent affinity default-on vs config-gated-by-design).
- **Memory:** `feedback_agent_routing_imbalance`.
