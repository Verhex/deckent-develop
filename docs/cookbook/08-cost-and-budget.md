# Cost and Budget

This cookbook explains how Deckent's pre-spawn cost gate helps you review sprint cost before agents start work.

The cost gate is a planning checkpoint. It estimates the cost of a sprint from the requested work, selected execution mode, and configured limits. It does not promise an exact final bill. Actual cost can vary because model usage, retries, context size, and provider billing rules can change the final total.

## When the Cost Gate Runs

Deckent checks cost before spawning sprint workers. At that point, you should see a sprint cost estimate and the budget policy that applies to the run.

Read the estimate before you approve the sprint. It is the last place to catch an unexpectedly large run before work begins.

## Sprint Cost Estimate

The sprint cost estimate is a forecast for the planned sprint. Use it to answer three questions:

- Is this sprint expected to cost money?
- Is the estimate within the configured sprint budget?
- Do you need to approve the run explicitly?

Treat the estimate as a guardrail, not an invoice. Do not compare it to exact model prices unless you also verify the active provider billing terms.

## `cost_limits.sprint_max_usd`

Use `cost_limits.sprint_max_usd` to cap the allowed estimated cost for one sprint.

If the estimate is greater than `cost_limits.sprint_max_usd`, Deckent should stop before spawning workers and ask for a decision instead of silently continuing.

Example policy:

```json
{
  "cost_limits": {
    "sprint_max_usd": 5
  }
}
```

This means the sprint estimate must stay at or below `5` USD unless you explicitly choose a different approval path.

## Subscription Mode Versus API Billing

Deckent can run in environments where usage is covered by a subscription or charged through API billing.

In subscription mode, the sprint estimate may be shown as `$0` because the local run is not billed through metered API usage. This does not mean compute is free in every environment. It means the current execution path is treated as subscription-covered for the purpose of the gate.

In API billing mode, the estimate represents expected metered provider usage. Review it against `cost_limits.sprint_max_usd` before approving the sprint.

## `acknowledgeCost`

`acknowledgeCost` records that you reviewed the estimate and intentionally approved the run.

Use it when Deckent requires explicit confirmation before worker spawn. This is common when:

- The sprint has a non-zero estimate.
- The estimate is close to the configured budget.
- The estimate exceeds the default comfort level for the workspace.

Do not use `acknowledgeCost` as a permanent bypass. If you approve the same expensive sprint repeatedly, update the task scope or the workspace budget policy instead.

## Before You Start a Sprint

Before starting a sprint:

1. Read the sprint cost estimate.
2. Check whether the run is subscription-covered (`$0`) or API-billed.
3. Compare the estimate with `cost_limits.sprint_max_usd`.
4. If prompted, use `acknowledgeCost` only after you decide the run is acceptable.
5. Reduce scope, split the sprint, or raise the limit if the estimate is too high.

This keeps cost review separate from task execution. Workers should start only after the budget decision is clear.
