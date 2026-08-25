# 06 — Source/dist compiled-binary parity

## Verdict

**GO** — the default compiled path is `.deckent/provider-execution-observations.db`, the
scoped source and committed `dist/` consumers agree, and this review found no
build/source mismatch or hidden rebuild requirement.

This note is read-only evidence. No source, database, generated artifact, or compiled
output was changed, and no rebuild was performed.

## Method

The review traced the canonical-path import and use sites in the three scoped source
consumers, compared those sites with their existing compiled JavaScript counterparts,
inspected the durable database read-only, and ran the two task-declared targeted tests.
A `.sqlite` filename appears only in tests as an explicit override or migration
preimage; it is not a default.

## Canonical authority and consumer trace

| Consumer | Source behavior | Existing compiled behavior | Finding |
| --- | --- | --- | --- |
| Provider-observations CLI | `src/cli/commands/provider-observations.ts:27,86-90` imports the store constant and uses `database ?? PROVIDER_EXECUTION_OBSERVATION_DATABASE_PATH`. Help text at lines 301-308 uses the same constant. | `dist/cli/commands/provider-observations.js:11,39-40,251-258` imports and uses the same constant. | No same-value local authority; omitted `--database` follows the canonical constant. |
| Status read model | `src/core/run-status-read-model.ts:27-30,270-275` joins the project root to the canonical constant and opens `ProviderExecutionObservationStore` with `readOnly: true`. | `dist/core/run-status-read-model.js:8,170-176` preserves the same import, path construction, and read-only store option. | Status reads the canonical database without creating an alternate default. |
| Sprint finalizer | `src/orchestra/sprint-finalizer.ts:275-282,1748-1757` defaults reconciliation to the canonical constant; lines 4314 and 4420 publish the canonical status read model. | `dist/orchestra/sprint-finalizer.js:151-153,1208-1216,3293,3387` preserves those same connections. | Finalization and status publication converge on the canonical store/read model. |
| Store constant used by compiled consumers | The scoped consumers import the store-owned constant rather than redeclaring its value. | `dist/core/provider-execution-observation-store.js:8` exports `join('.deckent', 'provider-execution-observations.db')`; a direct module import resolved to `.deckent/provider-execution-observations.db`. | Compiled default is exactly `.deckent/provider-execution-observations.db`. |

## Durable artifact observation

The canonical artifact exists at `.deckent/provider-execution-observations.db`.
It was opened with `better-sqlite3` using `readonly: true` and
`fileMustExist: true`; the observation was: `bytes=1949696; quick_check=ok; user_version=2`.
No migration, write, or rebuild was requested or performed.

## Test evidence

Command:

```text
npx vitest run tests/cli/provider-observations.test.ts tests/cli/status-read-model-wire.test.ts
```

Result: **PASS**.

The provider-observations suite asserts that the CLI has no local
`DEFAULT_DATABASE_PATH`, uses the imported canonical constant, creates only
`provider-execution-observations.db` by default, and leaves inspection/dry-run input
unchanged. The status-wire suite confirms persisted canonical status is consumed without
falling back to ambient recounting.

## Mismatch assessment

No build/source mismatch is reported for this scope. The checked source and existing
compiled JavaScript have the same canonical imports, defaulting expressions, read-only
status access, finalizer reconciliation default, and status-publication calls. Because
committed compiled output already matches the scoped source behavior, no rebuild is
required or implied by this evidence cut.
