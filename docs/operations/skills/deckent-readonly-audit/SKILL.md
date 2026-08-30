---
name: deckent-readonly-audit
description: Audit Deckent repository, runtime, wiring, or incidents with complete read-only evidence coverage. Do not use it to edit code, create runs, or clean state.
---

# Deckent Read-only Audit

## Preconditions

Use a fresh `$deckent-authority-bootstrap` snapshot. State the audit question and boundaries. An
audit finding does not admit an outcome or authorize implementation.

## Evidence method

- Inventory every tracked file and assign each exactly one primary review domain. Classify
  untracked, runtime, generated, large, and binary artifacts separately.
- Trace claims through producer → durable state → consumer → entrypoint/ingress → effective
  policy/config. Distinguish production wiring from tests, mocks, fixtures, and documentation.
- Read source and tests as evidence, but do not run tests, builds, Deckent flows, cleanup, recovery,
  or commands with unproven side effects.
- Use effective config, registry, capability, auth/reachability metadata, and capacity evidence;
  never route by model-name prose or inspect credentials.
- Recheck important claims through an independent source, agent, or main-session disk inspection.
- Treat generated files and `.brain/exports` as projections. Do not read or mutate raw
  `.brain/memory.db`, and never manually delete `.tasks` content.

## Truth labels

Describe capabilities as `çalışıyor`, `kısmen çalışıyor`, `yalnız görünüşte var`, `çalışmıyor`, or
`kanıtlanamadı`. Label every finding exactly one of `BLOCKS_CURRENT_DONE`,
`RELATED_BUT_NONBLOCKING`, or `UNRELATED`; none of these labels creates work authority.

For conflicts, name each source, identify the higher-authority source, explain why it wins, and use
typed `HOLD` when the conflict cannot be resolved. Never convert absence of evidence into success
or failure.

## Required output

Lead with the conclusion, then provide concise file-and-line evidence, coverage counts by domain,
skipped artifacts with reasons, confidence per major section, contradictions, and explicit HOLDs.
Keep raw logs and large code dumps out of the report.
