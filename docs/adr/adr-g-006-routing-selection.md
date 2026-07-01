# ADR-G-006: Routing & Selection (Learned Model/Effort + Agent/Skill)

**Class:** ADR-G (Global / Constitution) · **Scope:** global+project · **Immutable:** yes · **Source:** publisher · **Enforcement:** today=`routeTaskV2` multi-signal selection (intent domain-enrichment + domain-match-bonus + surface-aware bonus; skill→agent affinity config-enableable, default-off) + live routing-diversity test + routing-distribution script — **✅ V1 PURGED (ROUTE-V1-PURGE, 2026-07-01): the V1 engine is deleted — `decision-engine.ts` DecisionOrchestrator + `decision-replay.ts` + `decision-steps/` gone; config drops `'v1'` (value + type + validation); every runtime default (planner + fix-path + finalizer) is `'v2'`; the live scope-collision guard moved to `scope-collision.ts`** → tomorrow=learned Routing V3 (per-task-type outcome matrix auto-updating from real results, new-model auto-adopt on merit, vector-selection over task-kind×cost×latency×risk×provider-health×outcome; project+provider-scoped, user-manageable) — ROUTE-1+ · PROV-MATRIX · F1-AD
**Status:** accepted (ROUTE-V1-PURGE ✅ done 2026-07-01 — V1 engine + config + runtime removed; remaining: dead V1 stats-branch collapse in the finalizer (ROUTE-V1-DEADBRANCH-COLLAPSE) + V2 integration-coverage gap (ROUTE-V2-INTEGRATION-COVERAGE) + routing-version-label cleanup + affinity-default decision) · **Date:** 2026-06-30 (rev 2026-07-01) · **Absorbs:** ADR-015 (TaskRouter 6-level) + ADR-028 (Decision-Engine V1→V2→V3) + ADR-072 (Routing Balance multi-signal) + ADR-073 (Routing Live Validation + FIX-prompt) + ADR-075 Part-B (skill→agent affinity)
**Crosswalk:** 015 (+028+072+073+075B) → ADR-G-006

> **Authoring note (Alperen):** an ADR's documentation must explain both **today AND tomorrow** through its target-intent, transparently — "this matters and is critical to us." This ADR is the first-class application of the ADR-AUTHORING-STD (ADR-G-019: document today + tomorrow, transparently).

---

## Context

Routing decides, per task: which agent, which skills, which provider, which model, which effort. The old stack was a 6-level router (ADR-015) plus a V1 decision-engine (ADR-028) that was superseded by V2 (`routeTaskV2`) but **never removed**; plus a chronic distribution-skew problem (one agent winning ~12/16 tasks) that ADR-072/073/075B mitigated with domain-enrichment, domain-match-bonus, skill→agent affinity, a live-diversity test, and a routing-distribution guard. The 2026-06-30 review consolidates routing into one ADR, **mandates the complete removal of V1** (decided — "izi bile kalmayacak"), and commits to a **learned, evolving** selection model (V3).

---

## Decision (Today)

- **`routeTaskV2` is the routing engine.** Selection combines: intent domain-enrichment (scope-path → api/security/design/data/devops/docs intent), **domain-match bonus (+3)**, surface-aware bonus (ADR-G-009 Tier-1 → api-builder/frontend-designer/ci-guardian), and `force-*` overrides (preserved). **Skill→agent affinity** (`SKILL_AGENT_MAP` + affinity-bonus) is a **config-enableable** signal, **default-off** today (`skillAgentAffinity ?? false`) — a real selection lever once enabled, not an always-on default (AFFINITY-DEFAULT-DECISION: make default-on, or keep config-gated by design).
- **Guards:** live routing-diversity test (single-agent ≤60%, ≥4 distinct agents on a mixed set) + a **routing-distribution script** (`routing-distribution.mjs --ci`, >80% → fail) wired in CI — note it is **advisory in practice**: with no `.deckent/routing/learnings.json` data it passes vacuously, so it is "script + tests + optional guard", not a hard standalone gate. **FIX-prompt enrichment** (original-task + NO_GO-reason injected). `selectFixAgent` is **not** bug-fixer-by-default: it **preserves the model (identity)** and applies a **fresh-eyes agent rotation** (a complementary agent — e.g. architect→code-reviewer), while **preserving the original agent for specific failure modes** (test / doc / bug / exit-no-result) and rotating only for the generic case.
- **✅ V1 removal — DONE (ROUTE-V1-PURGE, 2026-07-01).** "izi bile kalmayacak" — executed. Deleted: `src/orchestra/decision-engine.ts`'s `DecisionOrchestrator` (its live scope-collision guard was `git mv`'d to `scope-collision.ts`, preserving blame), `decision-replay.ts`, `decision-steps/agent-step.ts` + `scope-step.ts`, the V1-exclusive integration tests (`full-sprint-e2e`, `error-recovery`, both `decision-engine.test.ts`, `decision-replay.test.ts`, the two `decision-steps` tests), the `decision-orchestrator-v1` manifest entry (+ its `sync-manifest.mjs` source + `dead-code-audit.mjs` suspects). Config drops `'v1'`: `config.ts` validation → `['v2']`, the type is `'v2'`, `config-migration.ts` updated. **Every runtime default fixed to `'v2'`** — `sprint-planner.ts` (`?? 'v1'`→`?? 'v2'`, and the V1 else-branch removed), `sprint-controller.ts` fix-path, and `sprint-finalizer.ts` (which had read `undefined !== 'v2'` → **ran the legacy V1 stats path by DEFAULT** — the latent bug; now defaults `'v2'`, the learnings.json SSOT path). Types narrowed (`task-types.ts`, `outcome-tracker.ts`). **Two vestiges remain as born follow-ups:** the finalizer's now-dead V1 stats branch is a behavior-sensitive collapse (ROUTE-V1-DEADBRANCH-COLLAPSE) and the deleted V1-only integration tests need V2 equivalents (ROUTE-V2-INTEGRATION-COVERAGE).

---

## Intent / Roadmap (Tomorrow) — Learned Routing V3

V2 is sufficient *today* but **not the target**. V3 = a **learned model/effort selection matrix**:

```xml
<routing-v3 intent="learned + auditable">
  <learn>per-task-type outcome metrics (success / quality / cost / latency) → the
    model/effort matrix auto-updates from real results.</learn>
  <auto-adopt>new models auto-adopted on merit (e.g. opus-4.9 &gt; 4.8; live capability,
    zero-hardcode — F1-AD).</auto-adopt>
  <vector-select>natural selection over (task-kind × cost × latency × risk ×
    provider-health × outcome).</vector-select>
  <scope>project + provider scoped; USER-manageable; force-* preserved.</scope>
  <transparency>the ADR documents today AND tomorrow with target-intent — this is
    important and critical to us.</transparency>
</routing-v3>
```

(= ROUTE-1+ / ROUTE-V1-PURGE / PROV-MATRIX, fusing outcome-tracker + F5 + F1-AD — the Codex ModelPolicyEngine convergence.) Distribution balance remains a **continuously-monitored** target (the +3 bonus is the first link; ADR-G-023 affinity + WM-7 language-mismatch-penalty deepen it). **Routing-version labelling** is also cleaned up here: `routeTaskV2` currently returns `routingVersion: 'v3'` while the planner stamps `'v2'` on the task — today's engine is V2, so the label is reconciled (ROUTING-VERSION-LABEL) rather than left to imply V3 already ships.

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
