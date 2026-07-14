# ADR-G-006 Amendment (Draft) — 2026-07-14: Today-Clause → RoutingEngineV3 Vector-Selection

> **Status:** DRAFT — proposed amendment, not yet applied. This document does not modify
> [`adr-g-006-routing-selection.md`](adr-g-006-routing-selection.md) directly; it is the
> Slice-0 deliverable (`ROUTING-V3` / [MASTER-PLAN #581](../MASTER-PLAN.md)) that Brain
> reviews and — on acceptance — merges into the ADR file **and** `.brain/memory.db`
> (`type='adr'`, id `adr-g-006`) host-side. Workers never write to `.brain/memory.db`
> (worker-rules boundary); this file is the merge-ready proposal only.
> **Authoring standard:** [`adr-g-019-adr-governance-taxonomy.md`](adr-g-019-adr-governance-taxonomy.md)
> §4 (ADR-AUTHORING-STD) — every ADR-G documents **today AND tomorrow, transparently**.
> This amendment follows that shape: Context → Decision (Today) → Preserved Invariants →
> Intent/Roadmap (Tomorrow) → Consequences → Evidence Corpus → Merge Instructions.

---

## Context — why this amendment, why now

[ADR-G-006](adr-g-006-routing-selection.md)'s existing **tomorrow-clause already commits**
to "learned Routing V3 … vector-selection over task-kind × cost × latency × risk ×
provider-health × outcome" (ROUTE-1+). The 2026-07-14 system-debug + brainstorm round
(Alperen: *"sürekli yama yapıp duruyoruz, V3'e geçme zamanı"*) converted that roadmap intent
into an approved design, so **this amendment executes the ADR's own stated direction — it is
anticipated evolution, not a violation of an immutable law.**

The trigger is quantified, not anecdotal — see [`routing-v3-system-debug-2026-07-14.md`](../../.analysis/routing-v3-system-debug-2026-07-14.md)
§6-§7:

- **~22 discrete patch campaigns / ~30 commits over 3.5 months** (2026-03-27 → 2026-07-14)
  layered onto `routeTaskV2` without resolving the underlying model.
- **7 of 8 identified error classes recurred** (catch-all skew alone patched 6 times:
  ADR-072 → ADR-073 → ADR-075B → PCOMP-6-W5C → sprint-440 → sprint-444).
- **Catch-all dominance migrates agent-to-agent, sprint-to-sprint**, not fixed by any single
  patch: test-writer (95%, archived sprint-148) → doc-writer (95-100%) → bug-fixer (427: 24/24,
  100%) → refactorer (438-441: 16/16, 100%; 443: 21/26, 81%) → devops (442: 75%, misroute-driven).
- **The 443 natural experiment** (20 structurally-identical tasks, differing only by which
  agent name appeared in the title) split into 4 different routes purely by keyword-substring
  luck — proof the classifier reads prose-coincidence, not task structure.
- **Non-monotonicity**: adding the literal word "Refactor" to a task's description measurably
  *reduced* the probability of a `refactor` classification (word-count arithmetic in the
  bucket race outweighing the intent word itself) — see system-debug §2.
- **Confidence is not calibrated**: misroutes cluster at 0.85-0.95 confidence; no floor rejects
  a low-confidence route (a 0.36-confidence route still fires).
- Full evidence trail: [`routing-v3-appendix-signal-inventory-2026-07-14.md`](../../.analysis/routing-v3-appendix-signal-inventory-2026-07-14.md)
  (call-site + table inventory) · [`routing-v3-appendix-misroute-corpus-2026-07-14.md`](../../.analysis/routing-v3-appendix-misroute-corpus-2026-07-14.md)
  (25-case corpus) · [`routing-v3-appendix-patch-history-2026-07-14.md`](../../.analysis/routing-v3-appendix-patch-history-2026-07-14.md)
  (22-campaign archaeology) · [`routing-v3-intent-taxonomy-inceleme-2026-07-14.md`](../../.analysis/routing-v3-intent-taxonomy-inceleme-2026-07-14.md)
  (12-bucket ownership map, Option-B selection rationale).

Root-cause taxonomy (K1-K5, system-debug §7): **K1** task-model is a prose bag-of-words ·
**K2** intent taxonomy is a broken mega-bucket with orphaned intents (`testing` has no owning
agent since test-writer's sprint-148 archival) · **K3** agent identity is a keyword list, not a
capability model · **K4** the outcome→routing learning loop is open-circuit (dead `tasks[0]`-DNA
bug, zeroed stats, phantom-skill 100%-success signal) · **K5** routing behavior has no single
source of truth (~25 hardcoded tables, 4 activation sources, 10+ additive bonuses).

The design response — RoutingEngineV3 — is documented in full in
[`routing-v3-design-spec-2026-07-14.md`](../../.analysis/routing-v3-design-spec-2026-07-14.md)
(8-section spec template, §8 blast-radius mandatory) and
[`routing-v3-secenek-b-detay-2026-07-14.md`](../../.analysis/routing-v3-secenek-b-detay-2026-07-14.md)
(vocabulary + vector schemas, Option-B detail, approved). This amendment is the **Slice-0**
deliverable of the 4-slice plan (sprint-445..448) that ships RoutingEngineV3; it lands
**before** any mechanism deletion (design-spec §6 prohibition: "ADR-G-006 today-clause
amendment is Slice-0 work, BEFORE mechanism removal").

**Approval trail (Alperen, 2026-07-14):** system-debug report accepted · brainstorm decisions
(1) LLM-assignment + deterministic-verifier ACCEPTED · (2) capability-matrix = agent.json-v3
SSOT ACCEPTED · (4) direct cut-over, no shadow-mode ("v2 başarılı değil") · (5) Brain-escalation
on tie/low-confidence · test-taxonomy decision: test-writer does NOT return, no inference from
the word "test" (work-type list closed at 8: build·fix·refactor·document·review·configure·
migrate·analyze) · 🔒 binding vectorial-3D directive (numerical·positional·content, hybrid
deterministic+AI) · Option-B vocabulary + detail doc APPROVED ("onaylıyorum") · design-spec
APPROVED (8-section + §8 blast-radius) · 4-slice plan APPROVED (445-448, gated on Alperen
report+approval per slice, law-3).

---

## Amendment Summary

This amendment replaces four fields of [`adr-g-006-routing-selection.md`](adr-g-006-routing-selection.md):

| Field | Current (V2) | Amended (V3, this document) |
|---|---|---|
| `**Enforcement:**` header line | `today=routeTaskV2 multi-signal selection … → tomorrow=learned Routing V3 …` | `today=RoutingEngineV3 (3-axis vector-selection, 5-stage hybrid pipeline, vocabulary registry, agent.json-v3 capabilities SSOT) → tomorrow=learned weight-tuning + provider-health axis activation + embedding-prefilter default-on at scale` |
| `## Decision (Today)` | `routeTaskV2` multi-signal scoring (domain-enrichment, bonuses, V1-purge note) | §"New Decision (Today)" below — supersedes the V2 description; the ✅ V1-purge history stays as an ancestry note (V1→V2 is now itself historical, folded under "Ancestry") |
| `## Intent / Roadmap (Tomorrow)` | Learned outcome-matrix, auto-adopt, vector-select roadmap | §"New Intent/Roadmap (Tomorrow)" below — the *next* increment beyond V3-Slice-3 |
| `**Status:**` / `**Date:**` | `accepted … Date: 2026-06-30 (rev 2026-07-01)` | `accepted (V3-Slice-0: today-clause amended; Slice-1..3 in flight) · Date: 2026-06-30 (rev 2026-07-14)` |

The `**Crosswalk:**` and `**Absorbs:**` lines are unaffected. This amendment does **not**
touch ADR-G-006's Immutable/Class/Scope/Source metadata (unchanged: ADR-G, global+project,
immutable=yes, source=publisher).

---

## New Decision (Today) — RoutingEngineV3

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

## Preserved Invariants (carried into V3 verbatim, per design-spec §6 and system-debug §7 "Korunacaklar")

Five guarantees the base ADR already establishes are **not renegotiated** by this amendment —
they are re-expressed inside the new pipeline, not weakened:

1. **Diversity guards (≤60% single-agent / ≥4-distinct-agent on a mixed set)** — preserved
   as **V3-journal-based checks**: the routing-distribution script and the live diversity test
   re-target the V3 decision journal (stage-5 output) instead of the V2 event stream; the
   numeric thresholds are unchanged.
2. **FIX-path fresh-eyes agent rotation semantics** — `selectFixAgent`'s existing contract
   (preserve model/identity, rotate to a complementary agent for the generic failure case,
   preserve the original agent for test/doc/bug/exit-no-result failure modes) is re-expressed
   as a verifier-approved re-rank with `excludePrior`, not replaced.
3. **`force-*` override semantics** — `forceAgent`/`force-*` continue to bypass ranking but
   **not** the verifier's authority checks; a verifier-failing force produces a warning +
   Brain confirmation, exactly as today.
4. **Anti-temp invariant** — the guarantee that a builtin agent beats a temp/generic one is
   promoted from an ad-hoc guard (patched three times: sprint-069, sprint-204/205, re-added
   sprint-444) to a **first-class verifier rule**, pinned by its own acceptance-corpus test.
5. **Honest-empty / no-silent-fallback contract** — where V2's `AGENT_FALLBACK_CHAIN` masked
   a no-match with *some* assignment, V3's ownership invariant makes a no-match an explicit,
   typed `CatalogGapError` surfaced to Brain — an honest gap, never a silently-wrong agent.
   This strengthens the existing honest-empty law (ADR-G-006 base text; also see
   [`adr-g-036-zero-hardcode-model-flow.md`](adr-g-036-zero-hardcode-model-flow.md)'s
   no-silent-default posture), it does not introduce it.

---

## New Intent / Roadmap (Tomorrow) — beyond V3 cut-over

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

## Consequences (updated)

**(+)** The amendment converts an already-committed roadmap clause (V2's own tomorrow-section)
into an approved, evidence-grounded design, closing the gap between "ADR promises a learned
vector-selection model" and "the engine is still a keyword-race with 22 patches on top." All
five load-bearing invariants (diversity, fresh-eyes rotation, force-*, anti-temp, honest-empty)
carry forward with explicit re-verification points rather than being silently dropped in the
rewrite. The direct-cut-over decision avoids running two routing engines in parallel
indefinitely (a K5 symptom in itself).

**(−)** This is a **draft** amendment: it does not yet exist in `adr-g-006-routing-selection.md`
or `.brain/memory.db` — until Brain applies it, the base ADR's Enforcement/Decision/Intent
fields still describe V2 as "today." The 4-slice plan (445-448) is multi-sprint; between
Slice-0 and Slice-3 the codebase runs V2 in production while V3 is built out — this amendment
records the target-state contract, it does not itself flip any runtime behavior. The
`ROUTE-V1-DEADBRANCH-COLLAPSE` and `ROUTE-V2-INTEGRATION-COVERAGE` follow-ups born under the
V1-purge amendment remain open and are unaffected by this V3 amendment; they should be
re-evaluated for relevance once V2 itself is deleted in Slice-3 (they may become moot rather
than done).

---

## Evidence Corpus (citations)

- [`routing-v3-system-debug-2026-07-14.md`](../../.analysis/routing-v3-system-debug-2026-07-14.md) — A1-protocol system-debug report (probe battery, misroute corpus digest, patch history digest, K1-K5 taxonomy, brainstorm agenda).
- [`routing-v3-appendix-signal-inventory-2026-07-14.md`](../../.analysis/routing-v3-appendix-signal-inventory-2026-07-14.md) — full call-site/table inventory (evidence agent).
- [`routing-v3-appendix-misroute-corpus-2026-07-14.md`](../../.analysis/routing-v3-appendix-misroute-corpus-2026-07-14.md) — 25-case misroute corpus (evidence agent).
- [`routing-v3-appendix-patch-history-2026-07-14.md`](../../.analysis/routing-v3-appendix-patch-history-2026-07-14.md) — 22-campaign git archaeology (evidence agent).
- [`routing-v3-intent-taxonomy-inceleme-2026-07-14.md`](../../.analysis/routing-v3-intent-taxonomy-inceleme-2026-07-14.md) — intent-taxonomy review, Option-A/B/C comparison, Option-B selection rationale.
- [`routing-v3-secenek-b-detay-2026-07-14.md`](../../.analysis/routing-v3-secenek-b-detay-2026-07-14.md) — Option-B vocabulary + vector-schema detail (approved, "onaylıyorum").
- [`routing-v3-design-spec-2026-07-14.md`](../../.analysis/routing-v3-design-spec-2026-07-14.md) — RoutingEngineV3 8-section design spec + §8 blast-radius (approved).
- [MASTER-PLAN.md](../MASTER-PLAN.md) — row `#581 ROUTING-V3`, full approval/decision trail and 4-slice tracker.
- Approval dates: system-debug report, brainstorm decisions 1/2/4/5, test-taxonomy decision,
  vectorial-3D directive, Option-B detail, design-spec, and 4-slice plan — all **Alperen,
  2026-07-14** (see commit `ee83feea`, `docs(routing-v3): system-debug raporu + brainstorm-
  kararları + vektörel-3D tasarım-spec'i (4-slice plan)`).
- Cross-referenced ADRs (unchanged by this amendment, context only):
  [`adr-g-019-adr-governance-taxonomy.md`](adr-g-019-adr-governance-taxonomy.md) (authoring
  standard) · [`adr-g-009-evaluation-integrity.md`](adr-g-009-evaluation-integrity.md)
  (surface-aware routing, eval) · [`adr-g-023-agent-skill-taxonomy.md`](adr-g-023-agent-skill-taxonomy.md)
  (agent/skill taxonomy, affinity — folds into capability-vector positional axis) ·
  [`adr-g-032-self-learning-evolution-loop.md`](adr-g-032-self-learning-evolution-loop.md)
  (outcome signal, weight-tuning tomorrow-clause) · [`adr-g-036-zero-hardcode-model-flow.md`](adr-g-036-zero-hardcode-model-flow.md)
  (zero-hardcode — governs the vocabulary registry and model-registry integration) ·
  [`adr-g-008-provider-abstraction-fleet-usage.md`](adr-g-008-provider-abstraction-fleet-usage.md)
  (provider/model registry, cost — provider-health axis tomorrow-clause).

---

## Merge Instructions (for Brain, host-side)

This document is a **worker-authored draft** (task 445-023, sprint-445 Slice-0). It does not
write to `.brain/memory.db` and does not edit `adr-g-006-routing-selection.md` — both are
outside this task's write scope by design. On review/acceptance, Brain (or Alperen) should:

1. Apply the four field changes in the "Amendment Summary" table above to
   `docs/adr/adr-g-006-routing-selection.md` (Enforcement line, Decision-Today section,
   Intent/Roadmap-Tomorrow section, Status/Date).
2. Insert/upsert the amended ADR text into `.brain/memory.db` (`type='adr'`, id `adr-g-006`),
   per [`adr-g-035-memory-architecture.md`](adr-g-035-memory-architecture.md)'s doc↔DB sync
   invariant (edit both, keep them equal).
3. Regenerate `.brain/exports/decisions.md` (managed-docs export) so the change propagates to
   worker/auditor ADR injection.
4. Archive or fold this draft file once merged (do not leave a stale duplicate copy of the
   amended clause sitting in `docs/adr/` alongside the updated base ADR).
