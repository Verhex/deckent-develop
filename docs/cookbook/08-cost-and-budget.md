# Recipe 08: Cost and Budget

Deckent tracks provider costs through two mechanisms: a pre-sprint cost gate that guards against runaway spending, and a usage command that reads Claude Code transcript ledgers for accurate post-sprint accounting. This recipe covers both.

## Pre-Sprint Cost Gate

Before spawning workers, Deckent checks the estimated sprint cost against configured limits. The gate runs automatically — you do not call it directly.

The estimate is a forecast, not an invoice. Actual cost varies with model usage, retry count, context size, and provider billing rules.

### Budget configuration

Cost limits live in `.deckent/cost-config.json`. Set them via CLI or by editing the file directly:

```bash
# View current budgets
deckent cost budget

# Set per-sprint max
deckent cost budget --set 5

# Set daily max
deckent cost budget --daily 20

# Set monthly max
deckent cost budget --monthly 100
```

Example output of `deckent cost budget`:

```
💰 Cost Budgets
  Sprint:  $5.00
  Daily:   $20.00
  Monthly: $100.00
```

The config file path is `.deckent/cost-config.json`. You can edit it directly for multi-key changes:

```json
{
  "cost_limits": {
    "sprint_max_usd": 5,
    "daily_max_usd": 20,
    "monthly_max_usd": 100,
    "auto_confirm_below_usd": 1.00
  }
}
```

`auto_confirm_below_usd` lets estimates below that threshold proceed without a confirmation prompt.

### Subscription vs. API billing

Deckent runs in two auth modes:

- **Subscription mode** (`auth_mode: "subscription"`, the default): usage is covered by a Claude subscription. The sprint estimate may show `$0` because the local session is not metered. This does not mean compute is free everywhere — it means the current execution path is subscription-covered for the gate.
- **API mode** (`auth_mode: "api"`, requires `ANTHROPIC_API_KEY`): usage is metered. The estimate represents expected provider charges. Compare it with `sprint_max_usd` before approving.

### What happens when the gate triggers

When the estimate exceeds `sprint_max_usd`, Deckent stops before spawning workers and prompts for explicit approval. Approve the run only after deciding the cost is acceptable. Do not use permanent bypass — if you repeatedly approve the same expensive sprint, reduce task scope or raise the limit instead.

## View Model Pricing

```bash
# Show all enabled models with input/output/cache pricing
deckent cost show

# Filter to one provider
deckent cost show --provider anthropic

# Single model detail
deckent cost show --model claude-sonnet-4-6
```

Example output:

```
── anthropic (billing: subscription/api) ──
  claude-sonnet-4-6              in=$3.00/MTok  out=$15.00/MTok  cache=$0.30/MTok  ctx=200K
  claude-opus-4-8                in=$15.00/MTok out=$75.00/MTok  cache=$1.50/MTok  ctx=200K
```

## Update Pricing

Pricing data is bundled with Deckent and can be refreshed from LiteLLM + OpenRouter:

```bash
deckent cost update

# Preview without writing
deckent cost update --dry-run

# Update one provider only
deckent cost update --provider anthropic
```

## View Actual Consumption (Post-Sprint)

`deckent usage` reads Claude Code transcript files and reports real token usage — more accurate than worker self-estimates, which typically under-report by 3–5×.

```bash
# Last 7 days, grouped by model
deckent usage

# Per-task breakdown for sprint 285
deckent usage --sprint 285

# Custom window
deckent usage --since 2026-06-01 --until 2026-06-14

# Machine-readable JSON
deckent usage --json
```

Example output:

```
Usage — last 7 days

Model                           Calls  Input    Output   CW       Cost    Hit%
claude-sonnet-4-6               47     12.4M    1.2M     8.3M     $14.20  40%
claude-opus-4-8                 12     3.1M     0.4M     2.1M     $18.50  41%
TOTAL                           59     15.5M    1.6M     10.4M    $32.70  40%
```

The `--sprint N` flag shows per-task cost and cache-write breakdown, which helps identify which tasks consumed the most tokens.

## Workflow: Before Starting a Sprint

1. Check current budgets: `deckent cost budget`
2. View estimated cost in the plan output (shown by `deckent plan`)
3. If the estimate exceeds your sprint budget, either reduce scope or raise the limit with `deckent cost budget --set N`
4. After the sprint, review actual consumption: `deckent usage --sprint <N>`

## See Also

- `deckent cost show` — model pricing table
- `deckent cost budget` — view/set budgets
- `deckent cost update` — refresh pricing data
- `deckent usage` — real token consumption from transcripts
- `.deckent/cost-config.json` — cost limits and provider billing config
