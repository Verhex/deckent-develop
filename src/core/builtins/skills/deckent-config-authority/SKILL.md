# Deckent Config Authority

Use this skill for any Deckent canonical `config.json` mutation. Config is shared
state: correctness requires one write authority, explicit precedence, durable
publication, and honest concurrency outcomes.

## Single Write Authority

All config publication goes through
`src/core/config-write-authority.ts`:

```ts
withConfigWriteLock(configPath, () => {
  const current = readAndValidateConfig(configPath);
  const next = deriveNextConfig(current);
  writeConfigJsonAtomic(configPath, next);
});
```

Perform the read, validation, merge, and write inside the same
`withConfigWriteLock` callback. `writeConfigJsonAtomic` serializes JSON to a
same-directory unique temporary file with mode `0600`, opens it as `r+`, fsyncs
the file, renames it over the target, and then fsyncs the directory. Let errors
propagate; never report success before publication completes.

Do not hand-roll read-modify-write, use `writeFile*`, `appendFile*`,
`truncate*`, or `createWriteStream` on the config family, publish directly to
the target, use a cross-directory temp file, or substitute copy/delete for the
atomic rename. A lock around a non-authority writer is still forbidden.

## Three-Layer Merge

Resolve configuration in this precedence order:

1. Deckent defaults (lowest authority);
2. global/user config;
3. project config (highest authored authority).

Use the canonical `deepMerge`/`mergeConfigs` behavior from `src/core/config.ts`.
Each later layer overrides the earlier layer while nested objects retain
unoverridden keys. Do not flatten nested objects with a shallow spread, mutate a
loaded layer in place, treat defaults as authored input, or reverse global and
project precedence. Validate/canonicalize each authored layer through the
existing config path rather than inventing a local merge dialect.

For a write that preserves unknown or user-authored fields, merge the patch over
the freshly read current config while holding the lock. Never write a partial
object as if it were the complete persisted config unless the owning API's
contract explicitly defines that payload as complete.

## Concurrent Revision HOLD

For repair, migration, or healing based on a pre-lock/preimage read, capture an
identity such as content SHA-256 plus file metadata. Re-read under the write lock
immediately before publication. If the identity changed:

- do not overwrite, truncate, back up over, or otherwise touch the newer file;
- return a typed HOLD result such as `{ kind: 'heldConcurrentRevision', ... }`;
- emit the exact `CONFIG_CONCURRENT_REVISION_HOLD` diagnostic;
- adopt the newer config only if it parses and validates; and
- never downgrade the race to success, retry over it blindly, or throw away the
  newer writer's revision.

Expected races are modeled as discriminated unions, not booleans or ambiguous
`null` values. Callers must exhaustively handle success, concurrent-revision
HOLD, and failure.

## Writer Governance

Run `scripts/lint-config-writers.mjs` when config-writing code changes. Its
baseline is an **only-shrink gate**:

- a new direct config writer fails closed;
- a baseline entry with no matching violation is stale and also fails;
- the authority module is the sole writer exception; and
- never add a baseline entry to admit a new writer or weaken the scanner to make
  a violation disappear.

Move an offending write behind the authority API, then remove any obsolete
baseline entry. Zero violations is the target state.

## Review Checklist

- Read/merge/write is protected by `withConfigWriteLock`.
- Publication uses `writeConfigJsonAtomic`; no manual RMW/truncate path exists.
- Merge order is defaults → global → project and nested keys are preserved.
- Preimage changes produce typed `CONFIG_CONCURRENT_REVISION_HOLD` without a
  file mutation.
- Failure is propagated and no success is claimed before fsync + rename.
- `lint-config-writers` remains green with a non-growing baseline.


## Anti-Patterns
- Hand-rolled read-modify-write on config JSON instead of the
  config-write-authority seam (atomic tmp + fsync + rename under lock).
- Treating an I/O read error as corruption — healing may only trigger on
  real parse evidence; transient errors are typed holds, never quarantine.
- Adding a new config writer without registering it against the
  only-shrink writer gate.
- Inline secrets in config files — only governed references are accepted.
- Silently adopting a concurrent revision instead of surfacing the typed
  CONCURRENT_REVISION_HOLD.

## Karpathy Notes
- **Surgical:** a config change goes through the existing authority seam —
  never add a parallel write path "just for this one field".
- **Simplicity first:** one typed hold with an exact reason beats a clever
  retry loop that hides the failure class.
- **Goal-driven:** DONE means the write survives the adversarial
  interleaving tests and the writer gate stays at or below its baseline —
  not that a single happy-path write succeeded.
