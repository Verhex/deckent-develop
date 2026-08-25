# Provider-observation adoption: current aggregate measurement

**Observed:** 2026-08-22T17:52:37Z
**Mode:** read-only aggregate inspection
**Scope:** retained v1 preimage, live v2 database, and compiled CLI identity

## Fresh compiled-consumer completion

**Observed:** 2026-08-23T16:27:33Z

The compiled production entrypoint was rerun from the current checkout with the exact declared
command:

```text
node dist/cli/entry.js provider-observations inspect --json
```

It exited `0` and returned this aggregate inspection:

```json
{"inspection":{"databaseBytes":2138112,"rowCount":1017,"rowLineageDigest":"9847e5dbc46e4ebf14ae407ff9ce1bd832463e38fd1d472a6e7476615c8bc4dc","schemaDigest":"9a63aa956cb566ab9ba3340092258ee7ee8744ba956d94ea75598743b494a273","sourceSchemaVersion":2,"state":"current","targetSchemaVersion":2},"mode":"inspect","operation":"migration"}
```

The compiled entry identity remains
`sha256:190d0a7a1a08afd75e12b93e808026c9ae4b75db94d8b4968b51d3061639a1cc`.
At the observation instant, the live database main-file identity was
`sha256:a21819c002608168e87cff51fc8c63ee766d5200b7592e9b11885e41d626f21f`.
This fresh result closes only the stale compiled-consumer residual recorded below. It does not
settle provider-concurrency open intervals, prove migration equivalence, or authorize Closure.

## Measurement

| Artifact | SQLite user version | Schema objects (tables / indexes) | Aggregate rows (intervals / contradictions / total) | Pages × bytes | Integrity |
|---|---:|---:|---:|---:|---|
| Retained exact v1 preimage | 1 | 2 / 1 | 43 / 0 / 43 | 22 × 4,096 | `ok` |
| Live database | 2 | 2 / 2 | 976 / 0 / 976 | 500 × 4,096 | `ok` |

These counts are an observation at the timestamp above, not a settlement statement. The live
database can continue to receive observations after that instant. No row contents or provider,
execution, run, task, attempt, tenant, project, user, or receipt identities were read into this
document.

The **53** value in `docs/MASTER-PLAN.md` is stale prose describing a bounded 2026-08-03
snapshot. It is not current authority and is not used in this measurement. The **43** value is
the aggregate row count of the retained exact schema-v1 preimage measured above. That retention
fact does not by itself prove migration, adoption, equivalence, replay authority, or settlement.

## WAL and non-mutation evidence

Both databases reported SQLite journal mode `wal`.

| Artifact | Main file bytes | WAL state at observation | SHM state at observation |
|---|---:|---:|---:|
| Retained exact v1 preimage | 90,112 | present, 0 bytes | present, 32,768 bytes |
| Live database | 2,048,000 | present, 0 bytes | present, 32,768 bytes |

Before and after the aggregate queries and declared CLI check, each main-file SHA-256 digest was
unchanged. Each zero-byte WAL digest remained the SHA-256 digest of empty content, and each SHM
content digest was unchanged. SQLite read access refreshed SHM metadata timestamps but did not
change SHM content. The queries used a read-only connection with `query_only` enabled; no insert,
update, delete, schema change, checkpoint, or receipt publication was requested.

## Provenance and source/dist identity

The measurement is bound to these project-relative artifacts and exact content identities:

- retained v1 preimage main file:
  `sha256:def7a1af4d266c92e410d5d596295788eb8187ac3e98df8fcf76b8a50bfa2191`;
- live v2 main file:
  `sha256:1bbf62e1e357c316711c48f7706aead8ffde44eff7f600248d72d669d2e4fe49`;
- compiled entry `dist/cli/entry.js`:
  `sha256:190d0a7a1a08afd75e12b93e808026c9ae4b75db94d8b4968b51d3061639a1cc`.

The required command was executed exactly:

```text
node dist/cli/entry.js provider-observations inspect --json
```

It exited `1` with `DECKENT_BINARY_IDENTITY_HOLD` and reason `build-root-mismatch`, before emitting
the requested JSON aggregate. This fail-closed source/dist identity result is recorded rather than
overridden. It neither invalidates the separately timestamped read-only SQLite aggregates nor
authorizes any settlement inference.
