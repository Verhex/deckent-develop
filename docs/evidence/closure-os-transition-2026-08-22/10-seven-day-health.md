# Seven-day Closure Health readiness

**Evidence date:** 2026-08-22
**Mode:** Read-only assessment
**Verdict:** **INSUFFICIENT_EVIDENCE**

The named sources expose one current, undated Closure Health projection, not seven daily observations. Therefore none of the requested seven-day health metrics or ETA bands is currently computable. This note does not synthesize missing days, treat the current aggregate as a daily series, combine owner and worker capacity, or publish an ETA.

## Available snapshot evidence

| Observation slot | Evidence | Status |
| --- | --- | --- |
| Current projection | current.json points to bundle 907188fdf98fc5ea8acdbf7d0b0eb213fbf48d40e98c8a031301177069b2b2cc; its referenced closure-health.json reports totalActive 456, state and priority counts, ledgerClassified 3, classificationCoverage 1, and ledgerEvents 3. | Available as one current projection instance |
| Daily snapshot dates | Neither the pointer nor closure-health.json contains an observation date, daily interval, or prior-day references. | **INSUFFICIENT_EVIDENCE** |
| Remaining days needed for a seven-day series | No dated daily series is present in the named inputs, so the single projection cannot be assigned to one of seven daily slots without inventing provenance. | **INSUFFICIENT_EVIDENCE**; do not infer or backfill six dates |

The bundle is internally a current four-view projection. The projector calculates point-in-time active counts and classification coverage, then checks those generated views against the current bundle. It does not persist or derive a daily history.

## Computability matrix

| Measure | Current status | Missing evidence |
| --- | --- | --- |
| Mature Burn | **INSUFFICIENT_EVIDENCE** | A dated period boundary; the committed-outcome cohort present at the start of each interval; and receipt-backed closures of that mature cohort during the interval. Current state totals do not identify the cohort or closures. |
| Born Rate | **INSUFFICIENT_EVIDENCE** | Dated findings and owner-admitted new outcomes by interval, kept as separate counts. ledgerEvents 3 is an event total, not a born rate, and the current projection contains no daily denominator. |
| Verified Closure Throughput | **INSUFFICIENT_EVIDENCE** | Dated production-wired, receipt-backed closures and elapsed observation time. OPEN, VERIFY, and BLOCKED point counts are not verified closures. |
| Owner-capacity separation | **INSUFFICIENT_EVIDENCE** for calculation; separation rule is defined | Daily owner admission, decision, approval, review, and settlement time must be recorded separately from agent or worker execution capacity. The brief defines separate formulas and an owner availability contract, but the named projection contains neither capacity series nor actual owner-service time. The two pools must not be summed. |
| P50/P80 ETA | **INSUFFICIENT_EVIDENCE** | Seven days of real queue and service observations, a frozen remaining committed-outcome scope, verified closure distribution, born and admission behavior, and owner-approved availability mapped to the separate capacity pools. |

## ETA boundary

No single-point completion date is supportable. The transition brief permits publication only of P50/P80 bands after seven days of real Closure Health data and an owner-approved availability calendar. A current active-row count cannot substitute for outcome sizing, verified service history, or capacity separation.

The readiness result remains **INSUFFICIENT_EVIDENCE** until seven independently dated, provenance-bearing daily observations exist and the inputs above are captured. At that point, P50 and P80 may be calculated as bands; this evidence note does not preselect a date or statistical distribution.

## Source boundary

- [Transition brief: metric definitions and capacity/ETA rule](../../../CLOSURE-OS-PRODUCT-TRANSITION-BRIEF.md#42-kullanılacak-hız-metrikleri)
- [Current projection pointer](../../governance/closure-projections/current.json)
- [Current Closure Health view](../../governance/closure-projections/bundles/907188fdf98fc5ea8acdbf7d0b0eb213fbf48d40e98c8a031301177069b2b2cc/closure-health.json)
- [Projection generator](../../../scripts/closure-ledger/project.mjs)
