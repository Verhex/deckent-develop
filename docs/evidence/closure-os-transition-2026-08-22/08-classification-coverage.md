# Closure classification coverage

Date: 2026-08-22
Mode: read-only projection evidence

## Projection source

This note resolves `docs/governance/closure-projections/current.json`; it does not select a bundle by recency or by directory name. The pointer resolves to bundle:

`907188fdf98fc5ea8acdbf7d0b0eb213fbf48d40e98c8a031301177069b2b2cc`

The bundle manifest has the same bundle ID. For all four views, the digest in `current.json`, the digest in `bundle-manifest.json`, and the SHA-256 digest of the view file agree. This establishes that the observations below come from the current, intact bundle rather than a stale or partial bundle.

## Current projection coverage

The projection exposes two different coverage facts that must not be conflated:

| Measure | Classified | Total | Coverage |
| --- | ---: | ---: | ---: |
| Ledger aggregate in `closure-health.json` | 3 | 456 active rows | 1% (the projection's rounded value) |
| Current active backlog in `active.json` | 0 | 456 active rows | 0% |

`level-lane.json` corroborates the active-backlog result: its only non-zero matrix cell is `unclassified` × `unclassified`, with 456 rows. It reports no holds. Every active row has `classified: false`, `level: null`, and `lane: null`.

The 456-row active backlog is:

- State: 361 `OPEN`, 69 `BLOCKED`, and 26 `VERIFY`.
- Projected priority: 307 `P0`, 113 `P1`, and 36 `P2`.
- Priority provenance: all 456 rows have `priorityFromLedger: false`.
- Born lifecycle coverage: `born.json` is empty.

The 1% aggregate is therefore **not** evidence that any current active row is classified. The projector computes `ledgerClassified` from effective ledger classifications and divides it by the active-row count; the active view separately joins classifications to current active work IDs. Here that join finds none.

## Classifications found only on settled rows

All three effective ledger classifications counted by `ledgerClassified` correspond only to rows that are already outside the active projection. Evidence: the ledger aggregate reports three classifications, while all 456 active rows remain unclassified and every classified Level × Lane cell for the active matrix is zero.

The current bundle does **not** expose the settled work IDs or their Level × Lane values: `active.json` contains active rows only, the classified matrix cells are all zero, and `born.json` is empty. Consequently, this read-only note can identify the settled-only classification set as all three effective classifications, but cannot truthfully name or manually reconstruct those classifications from the scoped projection views.

## Owner disposition remains planned work

Projection-derived current state ends at the facts above. Assigning Level × Lane classifications, deciding priority retriage, or choosing admission dispositions for the 456 active rows is planned owner disposition, not current coverage. This note makes no classification and mutates no priority or governance authority.

## Conclusion

- Projection-reported aggregate coverage: **3 classifications / 456 active rows, rounded to 1%**.
- Actual active-backlog classification coverage: **0 / 456, or 0%**.
- Settled-only classifications: **all 3 effective classifications**; their identities and Level × Lane pairs are not present in the current scoped bundle views.
- Planned owner disposition: **456 active rows remain to be classified**; no owner decision is inferred here.
