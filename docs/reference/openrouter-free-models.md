# OpenRouter Free-Model Inventory

Deckent can track OpenRouter's zero-cost `:free`-suffixed model catalog as an
additional, opt-in low-cost worker pool. This document describes the probe
that builds that inventory, the on-disk cache it produces, and — critically —
**which job classes are allowed to route to a free model** once one is
available.

This is an inventory/cache mechanism, not a routing integration: `routeTaskV2`
(`src/core/routing-engine.ts`, [ADR-G-006](../adr/adr-g-006-routing-selection.md))
does not currently consume this cache. Wiring free-model entries into routing
is a tracked follow-up, not part of this task.

---

## Table of Contents

1. [What This Is](#1-what-this-is)
2. [Free-Model Table](#2-free-model-table)
3. [Populating The Cache](#3-populating-the-cache)
4. [Which Jobs May Route Here](#4-which-jobs-may-route-here)
5. [Token / Usage Tracking Fields](#5-token--usage-tracking-fields)

---

## 1. What This Is

`src/core/openrouter-models.ts` exposes two functions:

- **`fetchOpenRouterModels(fetchImpl?)`** — fetches
  `https://openrouter.ai/api/v1/models`, keeps only entries where the model id
  ends in `:free` **and** `pricing.prompt` parses to exactly `0` (both
  conditions are required — a `:free`-suffixed id with a non-zero parsed price
  is excluded, never trusted on the suffix alone), and maps each surviving
  entry to `{ id, context, modality }`.
- **`writeFreeModelCache(root, list)`** — atomically writes that list to
  `<root>/.deckent/settings/openrouter-models.json` with a fresh
  `generatedAt` ISO-8601 timestamp on every call (tmp-file + rename, the same
  atomic-write pattern used by `approval-allowscope.ts`).

Both functions are **fail-honest**: a network error, a non-OK HTTP status, a
non-JSON body, or a response whose shape isn't `{ data: [...] }` throws
`OpenRouterProbeError` rather than silently caching an empty or partial list.
This is a deliberate contrast with the fail-*soft* `OpenRouterSource` in
`src/core/catalog/openrouter-source.ts` (a model-catalog enrichment source
that returns `[]` on error so a flaky endpoint never aborts a catalog sync) —
this probe's caller needs to know when the probe did not complete, so a
partial/fabricated "free model" inventory is never persisted.

## 2. Free-Model Table

**Honest placeholder.** The table below is a skeleton, not a live list — no
worker or automated sprint task is authorized to invent free-model entries
by guessing at OpenRouter's catalog. The real contents are populated by a
human or CC (Claude Code) running the host-side live probe in
[§3](#3-populating-the-cache) and pasting its output here.

| Model ID | Context | Modality |
|----------|---------|----------|
| _(run the probe in §3 to populate this table)_ | — | — |

## 3. Populating The Cache

The probe performs a real network call — it must be run **host-side**, never
inside a sprint/worker (workers do not have, and must not use, unrestricted
network access; see the dependency-mutation and NPM-ADVISORY escalation
pattern for the analogous constraint on package installs).

After `npm run build` has produced `dist/`, run:

```bash
node --input-type=module -e "
import { fetchOpenRouterModels, writeFreeModelCache } from './dist/core/openrouter-models.js';
const models = await fetchOpenRouterModels();
writeFreeModelCache(process.cwd(), models);
console.log(JSON.stringify(models, null, 2));
"
```

This writes `.deckent/settings/openrouter-models.json` (gitignored, per-project
runtime state — never committed) and prints the same list to stdout so it can
be copy-pasted into the table in [§2](#2-free-model-table) when refreshing
this document by hand.

## 4. Which Jobs May Route Here

**Doc-only class — this is the existing haiku-doc-routing rule, extended.**
Deckent already restricts `haiku` to genuinely-simple documentation work
(see [Performance Tuning Guide § 2. Model Selection Strategy](./performance.md#2-model-selection-strategy):
"haiku: docs, configs, i18n strings, simple utilities"). A zero-cost
OpenRouter `:free` model is weaker and less predictable than `haiku` on
average, so the same restriction applies with no additional latitude:

- **Allowed:** documentation-only tasks — markdown edits, changelog entries,
  comment/docstring updates, i18n string files. The same task shapes already
  eligible for `haiku`.
- **Never allowed:** any task that writes to `src/**` or `tests/**` (code,
  types, or test logic), any Tier-1 user-surface task (`src/cli/commands/`,
  `src/dashboard/`, `src/api/` — see the Proof-of-Function rule in
  `.claude/rules/worker-default.md`), and anything requiring tool-use/agentic
  behavior a given free model has not been confirmed to support.

This restriction is a project convention to record and honor when routing
logic is extended to consume this cache — it is **not** enforced by
`fetchOpenRouterModels`/`writeFreeModelCache` themselves, which only build the
inventory.

## 5. Token / Usage Tracking Fields

A worker's `.result` file always includes a `tokenUsage` block:

```json
{
  "inputTokens": 0,
  "outputTokens": 0,
  "cacheReadTokens": 0,
  "provider": "claude",
  "model": "sonnet"
}
```

Zero cost does **not** mean zero tracking. Even when `provider`/`model`
resolve to a free OpenRouter entry, the orchestrator still fills in the real
`inputTokens`/`outputTokens`/`cacheReadTokens` counts server-side after the
task finishes (workers must leave these at `0` and never estimate them — see
`.claude/rules/worker-default.md`). Those counts continue to feed:

- **Routing-diversity tracking** — agent/skill/model usage stats
  (`totalUses`, `successRate` in the agent pool) are updated regardless of
  cost, so a free-tier model's real performance is measured the same way a
  paid model's is.
- **Rate-limit / quota accounting** — OpenRouter's free tier enforces its own
  request-rate limits independent of dollar cost; usage is still recorded so
  those limits can be respected.
- **Sprint cost reports** — a `$0` line item is still a line item; silently
  omitting free-model usage from reports would make sprint cost summaries
  inaccurate about which models actually did the work.

---

## Related Documentation

- [Provider-Free Architecture](./provider-free.md) — provider abstraction this
  probe is an adjunct to, not a replacement for
- [Performance Tuning Guide](./performance.md) — model tier selection and the
  `haiku`-doc-only convention this document extends
- [`src/core/openrouter-models.ts`](../../src/core/openrouter-models.ts) —
  implementation
- [`src/core/catalog/openrouter-source.ts`](../../src/core/catalog/openrouter-source.ts) —
  the fail-soft OpenRouter catalog-enrichment source (different purpose,
  contrasted in [§1](#1-what-this-is))
