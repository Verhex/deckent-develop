# Unresolved provider interval inventory — 2026-08-22

**Inventory result:** **19 unresolved open intervals across 6 provider principals**
**Observed provider-principal population:** **20 opaque principal digests**
**Database mutation:** **NONE**

This read-only inventory reports aggregate counts exposed through the canonical
provider-observation store and canonical run-status read model. It does not reproduce principal
digests, credentials, tokens, raw observation payloads, or other provider secrets.

## Current measurement

At **.deckent/provider-execution-observations.db**, a read-only
**ProviderExecutionObservationStore** enumeration returned:

| Measure | Current value |
|---|---:|
| Opaque provider principals observed | 20 |
| Retained intervals | 933 |
| Unresolved, non-retired open intervals | 19 |
| Principals owning at least one unresolved interval | 6 |
| Run-owned unresolved intervals | 15 |
| Legacy-unowned unresolved intervals | 4 |
| Retired intervals without an end observation | 0 |

The enumeration used **listProviderPrincipalDigests(limit)** with the explicit limit **1,000**.
Because it returned **20**, the limit did not truncate this inventory. For each opaque digest,
**listIntervals(digest)** supplied retained state. An interval counted as unresolved only when its
end was null and it was not retired.

The existing canonical run-status read model independently reported **20** provider projections
and **19** unresolved open intervals. Its publication timestamp was
**2026-08-22T16:05:55.252Z**, lifecycle was **ACTIVE**, and every projection used the
**exact-task-set** observation scope. Both canonical surfaces therefore agree on the current
principal and unresolved-interval totals.

## Ownership limits

These counts are inventory, not settlement authority.

- **15** unresolved intervals are **run-owned**. Ownership is limited to their recorded run, task
  attempt, opaque principal digest, and fence. A settling generation may retire only open
  intervals for its own run and explicitly listed task/attempt identities; an optional principal
  fence narrows that authority further.
- **4** unresolved intervals are **legacy-unowned**. Their missing run ownership is preserved as
  historical evidence. They cannot be selected or retired through an exact run-owned scope.
- Foreign-run and historical intervals remain visible in the unresolved aggregate but are
  forensic and non-blocking for another run. The run-status model raises an unresolved-provider
  hold only for an anomalous interval within the exact current run/task/attempt authority.
- Silence, age, cost, worker state, and this note cannot fabricate an end observation or authorize
  retirement. No interval was settled, retired, edited, or deleted for this inventory.

## Read-only procedure

1. Open the canonical store with **readOnly: true**, which uses SQLite read-only,
   file-must-exist behavior and performs no schema creation or migration.
2. Enumerate only opaque digests through **listProviderPrincipalDigests(1,000)**.
3. Read interval state through **listIntervals(digest)** and aggregate counts in memory.
4. Read the persisted status model through **readCanonicalRunStatusReadModel(".")** and compare
   its aggregate provider projections. Do not publish or rewrite the read model.

## Evidence basis

- .deckent/provider-execution-observations.db (read-only access only)
- src/core/provider-execution-observation-store.ts
- src/core/run-status-read-model.ts
- tests/core/provider-execution-observation-store.test.ts
- tests/core/run-status-read-model.test.ts
