# ADR-D-009: Worker-Result Boundary Normalization Policy

**Class:** ADR-D (Dogfooding / Dev) · **Scope:** dev · **Immutable:** no · **Source:** publisher+contributor · **Enforcement:** today=disk-read-boundary normalize (`task-result-schema.ts` `coerceNotesToString`+`normalizeTaskResultShape`, applied at every `readJsonSafe<TaskResult>` call site) + honest-fallback rubric-fault handling (`sprint-phases.ts`, main eval site armored; 4 remaining sites in-flight, sprint-369 Task 1 / RUBRIC-ARMOR-COMPLETE) + mandatory loud-abort on the outer EVALUATE catch (`BRAIN→AUDITOR:EVALUATE_ABORTED`) + honest metrics denominator → tomorrow=assembly-time strict-reject gate (`TaskResultV1`/`validateTaskResult`, `result-assembler.ts`) rolling out flag-gated report-only (`worker_output_contract.strict_report`, sprint-369 Task 8 / V1-STRICT-REPORT) toward default-on enforcement
**Status:** proposed (acceptance: Alperen) · **Date:** 2026-07-05 · **Absorbs:** — (new; born directly from the born-484 live incident, no legacy predecessor)
**Crosswalk:** — (new decision, no legacy ADR-NNN mapping)

> **Origin note:** This ADR codifies the policy already shipped in commit `14f0a244` (2026-07-05) — the root-cause fix for **born-484** (sprints 365/366 lived a real Codex-CLI worker writing `notes` as a string array; the un-guarded `(result.notes ?? '').toLowerCase()` inside `isVerificationTask` threw a `TypeError`, `evaluateWithRubric` had no per-task `try`, and the phase's outer `catch` swallowed the fault to the dashboard only — the EVALUATE loop silently died and the sprint closed reporting "0/0" even though the underlying work was real and the collector had already gathered every result). This document exists so the *policy* — not just the one-off patch — survives every future provider-CLI integration.

---

## Context

deckent's EVALUATE phase reads every worker `.result` file back off disk as a `TaskResult` (the legacy, hand-maintained interface in `task-types.ts`) before scoring it. Different provider CLIs (Claude, Codex, Gemini — ADR-G-008) do not share a wire format; each serializes the same logical fields slightly differently. The live, reproduced case: the first real Codex-CLI worker output wrote `notes` as `string[]` instead of the contracted `notes: string`. Every downstream string-op on `notes` assumed a scalar, threw, and — because nothing guarded the per-task evaluation call and the phase's outer catch only forwarded to the dashboard — the entire EVALUATE loop for the sprint died silently. The tasks themselves had finished (the collector had already gathered 8/8 and 9/9 results); only the *evaluation* pass was lost, and the sprint closed as if nothing had run at all.

This is not a one-off Codex quirk. Every provider-CLI integration deckent adds is a fresh source of shape drift at the disk-read boundary — field ordering, unexpected nesting, array-vs-scalar coercion. deckent will keep adding providers; each is a new chance to reproduce born-484 in a different shape unless the *boundary itself* carries a stated policy, not just a patch for the array-notes case. Two failure responses were on the table — **reject** the malformed result outright, or **normalize** it and keep evaluating. ADR-D-009 states which applies at which layer, because deckent has **two different result boundaries** doing two different jobs (the legacy disk-read path vs. `result-assembler.ts`'s assembly-time gate), and conflating their policies is exactly what let born-484 through unnoticed.

---

## Decision (Today)

```xml
<result-boundary-policy>
  <disk-read-boundary layer="legacy TaskResult, task-result-schema.ts">
    NORMALIZE, never reject. `coerceNotesToString` collapses any worker-produced
    `notes` value (array joins with newlines — the live Codex shape; object
    JSON-stringifies; null/undefined collapse to '') to the contractual string
    shape; `normalizeTaskResultShape` applies it at every
    `readJsonSafe<TaskResult>` call site (14 sites, born-484 fix). Rationale:
    the work behind the result is real — only the field SHAPE drifted because a
    provider CLI serializes differently. Rejecting a completed task's result over
    a shape quirk destroys signal the sprint already earned.
  </disk-read-boundary>
  <honest-fallback principle="never fabricate DONE">
    When a rubric/evaluation call itself faults (not shape drift — an actual
    exception mid-evaluation), the response is a degraded-honest result, never a
    crash and never a silent pass: the faulting worker's own result stays
    NO_GO, every OTHER task in the same evaluation batch is capped at
    GO_WITH_TECH_DEBT (never auto-promoted to DONE), and a
    `BRAIN→AUDITOR:EVALUATION_FAULT` event is emitted (`sprint-phases.ts:1434`)
    so the fault is visible, not swallowed. Today this pattern lives at the main
    eval site only; sprint-369 Task 1 (RUBRIC-ARMOR-COMPLETE) extends it to the
    4 remaining un-armored call sites (extension-hit late-result, grace-result,
    FIX-phase re-eval, generic re-eval) through one shared helper — single
    source, not four hand-copies.
  </honest-fallback>
  <loud-abort principle="an outer catch may never return silently">
    The EVALUATE phase's outer `catch` — the one born-484 found swallowing to
    the dashboard only — now writes to stderr, notifies, emits
    `BRAIN→AUDITOR:EVALUATE_ABORTED` (`sprint-phases.ts:2169`), and stamps
    `sprint.evaluateAborted` (`sprint-phases.ts:2179`) before returning. A phase
    that aborts must SAY so, in a channel a human or the Auditor will see —
    silence is what let born-484 report a false "0/0".
  </loud-abort>
  <honest-denominator>
    `calculateMetrics.totalTasks = max(sprint.tasks.length, evaluations.size)`
    (`sprint-metrics.ts:111`) — a sprint that evaluated 0 of 8 real tasks now
    reports "0/8", never the misleading "0/0" that reads as "no tasks existed."
  </honest-denominator>
  <assembly-boundary layer="TaskResultV1, result-assembler.ts — a DIFFERENT boundary">
    Strict, schema-validated REJECTION (`validateTaskResult` failing →
    `AssemblerError`, thrown, never persisted) belongs at the ASSEMBLY boundary,
    where the orchestrator itself BUILDS the canonical `TaskResultV1` from
    authoritative git/timing/token inputs plus the worker's subjective block —
    the one place a malformed shape can still be traced back to the worker that
    produced it and corrected at source. This is not this ADR's enforcement
    surface; it is the Roadmap item below.
  </assembly-boundary>
</result-boundary-policy>
```

**In one sentence:** normalize at the disk-read boundary — the work is real, only the shape drifted, never punish a completed task for a provider-CLI serialization quirk — reject at the assembly boundary, the one place a bad shape can still be attributed and fixed; and whichever boundary catches a fault, it must do so loudly, never DONE-by-default.

---

## Intent / Roadmap (Tomorrow)

- **Step-3 strict-gate rollout (sprint-369 Task 8 / V1-STRICT-REPORT):** `TaskResultV1`'s `validateTaskResult` gate — already enforced inside `assembleResult` (throws `AssemblerError` on failure) — is being wired as a **flag-gated, report-only** pass over `result-collector.ts`'s collected results (`worker_output_contract.strict_report`, default-off). Report-only means: validate, and on drift emit `BRAIN→AUDITOR:RESULT_CONTRACT_DRIFT` + `debugLog` — the result stream itself is untouched, no decision changes. This is the bridge between today's "normalize and keep going" policy and a future default-on assembly-time reject: it lets deckent observe real-world shape drift across every provider — not just the array-notes case already fixed — before any gate is flipped to blocking.
- **Beyond Step-3 (post report-only observation window):** once `RESULT_CONTRACT_DRIFT` telemetry shows the provider-CLI shape space is understood and stable, `strict_report` graduates toward a blocking gate at the assembly boundary — new provider-CLI integrations get validated and corrected AT SOURCE (the worker/adapter is asked to fix its output) rather than silently patched forever at the disk-read boundary. `normalizeTaskResultShape` does not disappear even then — legacy `TaskResult` consumers and any pre-`TaskResultV1` code path keep the safety net; the strict gate is additive, not a replacement for it.
- **RUBRIC-ARMOR-COMPLETE (sprint-369 Task 1, in-flight sibling):** extracts the honest-fallback pattern above into one shared helper (`safeRubricReconcile`) and applies it to all 5 rubric call sites (the 1 already armored + 4 new) — closing the defense-in-depth gap this ADR's honest-fallback clause names as partial-today.
- **Provider-CLI onboarding checklist (not yet tracked):** as each new provider CLI is integrated (ADR-G-008), its result-shape drift should be characterized and, where it repeats a known drift class (array-vs-scalar, nested-vs-flat), folded into `coerceNotesToString`/`normalizeTaskResultShape` rather than special-cased per provider — a candidate MASTER-PLAN follow-up, not yet filed.

---

## Consequences

**(+)** The EVALUATE loop cannot die silently to a provider-CLI shape quirk again — the born-484 failure mode (real work, lost signal, false "0/0") is closed at its root layer. The two-boundary split (normalize-at-read vs. reject-at-assembly) gives deckent a policy that scales to N future provider CLIs instead of a one-off patch for the Codex array-notes case. The loud-abort + honest-denominator + honest-fallback triad means a future fault is visible (event + stderr + honest metrics) instead of indistinguishable from "sprint had no tasks."

**(−)** Today's honest-fallback armor covers only the main rubric-eval site; the other 4 sites are covered by a sibling in-flight task (RUBRIC-ARMOR-COMPLETE, sprint-369 Task 1) rather than by this ADR itself — until that lands, defense-in-depth is partial, by the same commit's own admission. The assembly-time strict gate is real, shipped code (`result-assembler.ts`) but is not yet the path every collected result flows through — `strict_report` is still flag-gated report-only (sprint-369 Task 8), so a new provider-CLI shape drift that reaches the collector outside the `readJsonSafe<TaskResult>` normalize path is not yet caught anywhere until that rollout completes. This document itself is a **draft** (`Status: proposed`) — the decision already shipped in `14f0a244`; this ADR only records it under governance and awaits Alperen's acceptance.

---

## References / Absorbed

- **Absorbs:** — (new; no legacy ADR-NNN predecessor — born directly from the born-484 live incident, not from the 2026-06-30 ADR review).
- **Evidence:** commit `14f0a244` (fix(evaluate): born-484 kök-neden) · `src/core/task-result-schema.ts` (`coerceNotesToString`, `normalizeTaskResultShape`) · `src/orchestra/sprint-phases.ts:1434` (`BRAIN→AUDITOR:EVALUATION_FAULT`) · `src/orchestra/sprint-phases.ts:2169` (`BRAIN→AUDITOR:EVALUATE_ABORTED`) · `src/orchestra/sprint-phases.ts:2179` (`sprint.evaluateAborted`) · `src/orchestra/sprint-metrics.ts:111` (honest `totalTasks` denominator) · `tests/core/task-result-notes-normalize.test.ts` · `tests/orchestra/evaluate-loop-armor.test.ts`.
- **Cross-ref:** ADR-G-019 (ADR Governance & 4-Layer Taxonomy — the authoring standard this document follows) · ADR-G-009 (Evaluation Integrity) · ADR-G-035 (Memory Architecture — DB-first ADR storage this document syncs into once accepted).
- **Sibling in-flight (sprint-369):** Task 1 / RUBRIC-ARMOR-COMPLETE (extends honest-fallback to all 5 rubric sites) · Task 8 / V1-STRICT-REPORT (flag-gated report-only wiring of the Step-3 strict-gate described in Roadmap).
- **Born work-items:** provider-CLI onboarding checklist for result-shape drift (Roadmap, not yet tracked in MASTER-PLAN).
