# Normal-Finalizer Archive Invariant

**Evidence date:** 2026-08-22
**Predecessor:** `sprint-1780659451557`
**Active sprint:** `sprint-1780659451558`
**Current gate:** **PENDING — not a PASS**

## Verified predecessor baseline

The checked-in canonical manifest at
`.deckent/archive/sprints/sprint-1780659451557/manifest.json` records the predecessor as
`ABORTED`. This is a valid terminal outcome; it must not be rewritten as `DONE` to make the
archive appear successful.

The manifest currently records:

- kind `deckent.sprint-archive-manifest`, schema version `1`;
- sprint ID `sprint-1780659451557` and terminal outcome `ABORTED`;
- 148 artifacts totaling 6,091,644 bytes;
- family counts `run=9`, `tasks=95`, `evaluations=11`, `metrics=1`, `scheduler=1`,
  `heartbeat=29`, `docs=1`, `audits=1`, and `unknown=0`;
- no conflicts;
- content digest
  `48c71d43ac0d9bc9a884cf8991ca6db94994c673446179b0937412560ad372ef`; and
- terminal evidence including `sprint-1780659451557-terminal-receipt.json`.

This baseline is evidence about the predecessor only. A source/manifest disagreement, a missing
or changed artifact, an untracked archive file, or an invalid manifest digest is a failure to
investigate, not permission to refresh the manifest and hide the discrepancy.

## Required normal-finalizer proof for the active sprint

The active sprint cannot prove its own terminal archive while this run is still active. After the
normal finalizer finishes, an independent post-finalizer check must establish all of the following
before this gate can become **PASS**:

1. `.deckent/archive/sprints/sprint-1780659451558/manifest.json` exists, parses as manifest kind
   `deckent.sprint-archive-manifest` schema version `1`, and names exactly
   `sprint-1780659451558`.
2. `terminalOutcome` equals the outcome in the sprint's terminal receipt. It must be a real
   terminal value, not `null`, inferred from task results, copied from the predecessor, or edited
   to the desired outcome.
3. Recomputing the manifest payload digest with the implementation's deterministic
   `manifestPayloadDigest` rule yields the recorded `contentDigest`.
4. For every manifest artifact, the canonical archive file exists and its byte count and SHA-256
   equal the manifest entry. The checked count equals `artifactCount`, summed bytes equal
   `totalBytes`, and recomputed family totals equal `familyCounts`.
5. A recursive inventory below the sprint archive, excluding `manifest.json`, contains no file
   absent from `artifacts`. Therefore `verifySprintArchive(...).missing`, `.mismatched`, and
   `.untracked` are all empty, `.manifestDigestValid` is `true`, and `.ok` is `true`.
6. Reconciliation/finalization reports no publication, retirement, task-artifact, or residue-sweep
   failures. Conflicting bytes remain hash-addressed variants and remain visible through the
   manifest's `conflicts`; they are never overwritten or silently discarded.
7. Retirement is non-destructive: a legacy source is removed only after the destination is
   independently verified to have the same byte count and SHA-256. Live/hot
   `.deckent/recently-works/` sources are not retired by archive reconciliation. Non-terminal task
   artifacts are moved to `tasks/preserved/` with a `preservation-marker.json`, not deleted.
8. Counter cleanup, if invoked after terminal emission, is limited to the completed sprint's
   `-seq` and `-checkpoint-seq` files. It does not affect another sprint. Retention publications
   preserve canonical sprint-prefixed names and reconcile and verify every historical archive
   they touch.
9. A second reconciliation is idempotent: it introduces no new conflict, source retirement, or
   content change, and verification remains successful.
10. The focused regression command passes:

    ```sh
    npx vitest run tests/core/sprint-file-retention.test.ts tests/core/sprint-archive.test.ts
    ```

## Status

- **Predecessor integrity:** verified baseline recorded above (`ABORTED`, not normalized away).
- **Current normal-finalizer archive proof:** **PENDING** until the finalizer has completed and the
  post-finalizer checks above are run against `sprint-1780659451558`.
- **Prohibited conclusion during this active run:** no terminal archive **PASS** is claimed here.
