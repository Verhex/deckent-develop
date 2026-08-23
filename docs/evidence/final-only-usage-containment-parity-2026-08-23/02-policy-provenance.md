# FO02 policy and provenance inventory

## Proven authority chain

| Binding | Production authority | Acceptance truth |
| --- | --- | --- |
| Owner policy | `execution_budget.final_only_usage` is validated by `assertFinalOnlyUsagePolicyConfig()` and resolved by `resolveExecutionBudgetPolicy()` in `src/core/execution-budget-policy.ts`. | Only `allow-wall-clock-containment`, an allowed role, and a positive integer wall clock can produce `FinalOnlyUsageAuthorization`. |
| Provider capability | Planner and dispatch read `ProviderCommandSpec.liveUsage` from `src/core/provider-command-spec.ts`. | `incremental` needs no final-only containment; `final-only` with a live ceiling needs the exact grant; missing/`none` capability is HOLD. |
| Live ceiling | Shared resolution imports canonical `hasLiveUsageCeiling()` from `src/core/live-execution-budget.ts`. | Token/turn/cache/context ceilings participate. `maxUsd` is intentionally excluded and remains on the separate incremental-pricing fail-closed gate. |
| Task policy snapshot | `applyWorkerExecutionBudgetPolicy()` stamps `Task.budgetPolicy`, including role, resolved provider, profile/digest, and exact `finalOnlyUsage` (`src/core/execution-plan-digest.ts`, `src/core/task-types.ts`). | Manual, initial sprint, and continuation consume this canonical nested object. No unknown top-level task field is accepted. |
| Executor | Caller resolves configured/task `auto` first; shared resolver accepts only literal Docker wall-clock containment. | Host adapter, tmux, subprocess, unresolved, and Windows `auto→subprocess` paths HOLD before provider work for a final-only live ceiling. |
| Policy join | `resolveFinalOnlyUsageContainment()` checks snapshot `state=allow`, exact role/provider, canonical profile ref, positive wall clock, and equality of snapshot/grant policy digest. | Resolver returns the exact existing `budgetPolicy.finalOnlyUsage` object; it never creates, copies, widens, or expires a grant. |
| Final Docker gate | `spawn-backend-docker.ts` independently validates the forwarded grant and narrows configured timeout to the owner wall-clock ceiling. | Defense in depth remains; ingress parity no longer relies on the backend as the first place a missing grant fails. |

## Honest negative space

`TaskExecutionBudgetPolicySnapshot` is plan-time provenance, not a complete
durable execution permit. The reviewed chain still does **not** bind one grant
to tenant, run, task, attempt, deadline/expiry, one-time consumption, actual
provider receipt, and terminal finalization. Runtime `Object.freeze()` is not
authentication and was deliberately not used as evidence. No invented
`expiresAt`, duplicate budget object, executor-stamped authorization, or
wave-global grant was added.

Replay and exactly-once behavior proven by task settlement receipts is recorded
separately; it does not retroactively turn the policy snapshot into a durable
single-use permit. Those broader lifecycle bindings remain OPEN under the
FO-03/FO-04/FO-08/FO-10 authority rows.

## Disposition

**GO for the bounded manual-vs-sprint containment parity slice:** all three
target ingresses consume the same canonical task-local grant and fail closed at
the shared pre-dispatch decision. **HOLD for full final-only authorization
lifecycle closure:** tenant/run/task/attempt/expiry/replay/provider-receipt
bindings were neither present nor fabricated by this slice.
