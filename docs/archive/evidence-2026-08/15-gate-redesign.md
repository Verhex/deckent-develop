# T15 — Evaluation and settlement gate redesign residual

Date: 2026-08-22

## Disposition

The 9040 enforce canary establishes a **LOCAL_VERIFIED implementation slice**. It does not
close the gate-redesign parent, any of the four governing MASTER outcomes, or formal
independent verification.

This is a read-only mapping note. It changes no MASTER state and creates no new root. The
transition brief assigns the redesign to the existing `EVALUATION-001`,
`GOAL-ACCEPTANCE-001`, `KERNEL-SETTLEMENT-001`, and `SPRINT-HONESTY-001` outcomes after the
current closure targets are complete.

## Post-canary wiring map

| Governing outcome | Current post-9040 evidence | Remaining authority dependency | Current disposition |
|---|---|---|---|
| `EVALUATION-001` (MASTER 9040) | The normative verdict vocabulary, task-kind acceptance matrix, observe/enforce layer, confirmation store, LLM and human confirmation paths, full-lineage confirmation identity, private first-writer-wins LLM binding, fresh validation of genuine typed host XVerify receipts, restart reconciler, PREPARED/APPLIED debt ordering, and serve/API lifecycle ownership are wired. Canary enforcement is proven while the global default remains `observe`. The detailed proof records 33 files/226 acceptance tests, 17 files/305 neighboring tests, a 10,000-row bounded replay, build and real-binary smoke. | A fresh formal seal from a provider different from the author is absent. Fable was capacity-unavailable; the permitted Opus 5 advisor was below the author capability floor. The result is typed `unavailable/HOLD`, not a seal. An owner decision is also still required before any global default-ON promotion. | `OPEN`; implementation slice `LOCAL_VERIFIED` only. |
| `GOAL-ACCEPTANCE-001` | 9040 proves the shared criterion/acceptance vocabulary and confirmation machinery used by the evaluation surface. It also proves enforced `REJECT`/`ROUTE` behavior in the scoped canary. | Its own MASTER acceptance remains exact `--accept` propagation through prompts, result evidence, and a durable evaluator receipt. The canary evidence does not claim that Goal-level end-to-end acceptance outcome complete. | `OPEN`; not promoted by the 9040 slice. |
| `KERNEL-SETTLEMENT-001` | Confirmation identity binds tenant, project, sprint, task, attempt, generation, evaluation/result/policy/source digests. Authority binding validates settlement references and typed host receipts, and reducer ordering is explicit. Sprint 619 retained a terminal `ABORTED` receipt and logical-settlement digest instead of converting stale evidence to success. | The MASTER still requires general exactly-one terminal result/usage settlement, automatic rejected-admission projection, and correct sprint COMPLETE/finalizer ordering. Sprint 619 exposed a live residual: RETRO consumed a stale pre-fix gate/projection instead of fresh task results. That recovery-truth defect blocks dogfood settlement closure even though it does not invalidate the locally verified product wiring. | `OPEN`; no canonical parent settlement closure. |
| `SPRINT-HONESTY-001` | Sprint 619 truth is explicit: four logical tasks, five attempts, 4/4 logical worker results `DONE`, zero active/unsettled attempts, but the sprint terminal outcome is `ABORTED`. Root task artifacts were archived rather than erased. No unresolved lineage was promoted to `COMPLETE`. | Logical terminal-receipt/denominator closure remains open in MASTER, as do cross-platform and scale proof. The stale finalizer/gate projection must be resolved by the appropriate recovery authority before a future dogfood run can supply truthful parent-completion evidence. | `OPEN`; `ABORTED` is evidence, not completion. |

## Authority boundary

The evidence supports these statements, and no stronger ones:

1. **Implementation:** the scoped production wiring is `LOCAL_VERIFIED` under the canary
   configuration. The global `acceptance_enforcement` default remains `observe`.
2. **Independent verification:** formal XVerify is `unavailable/HOLD`. Unavailable capacity is
   not confirmation, and a same-provider fallback would not satisfy strict provider separation.
3. **Sprint settlement:** Sprint 619 has an honest `ABORTED` terminal receipt. Its successful
   task results and product proof do not rewrite the sprint as `COMPLETE`.
4. **Outcome settlement:** all four governing MASTER rows remain `OPEN`. This note cannot mutate
   their state or publish their settlement receipts.
5. **Parent completion:** the redesign parent remains pending until the four existing outcomes
   satisfy their own acceptance/settlement authorities, a capability-floor-compliant
   different-provider seal exists, and the owner makes any required promotion/default decision.

## Exact residual

- Obtain a fresh different-provider verification from a verifier meeting the author capability
  floor and persist its genuine host-authoritative receipt. Until then, retain typed
  `unavailable/HOLD`; do not substitute author-provider verification.
- Settle the Sprint 619 stale gate/projection recovery case so finalization consumes fresh
  authoritative lineage evidence and cannot publish false `COMPLETE`.
- Complete the remaining Goal acceptance propagation and durable receipt proof.
- Complete kernel exactly-once result/usage settlement and sprint finalizer ordering.
- Complete sprint logical denominator, terminal-receipt, cross-platform, and scale proof.
- Keep global default-ON promotion behind an explicit owner decision; the canary is not that
  decision.

## Sources

- `docs/evidence/EVALUATION-001-9040-enforce-canary-evidence-2026-08-22.md`
- `docs/MASTER-PLAN.md` rows 9040, `GOAL-ACCEPTANCE-001`, `KERNEL-SETTLEMENT-001`, and
  `SPRINT-HONESTY-001`
- `CLOSURE-OS-PRODUCT-TRANSITION-BRIEF.md` §§3.5 and 9
