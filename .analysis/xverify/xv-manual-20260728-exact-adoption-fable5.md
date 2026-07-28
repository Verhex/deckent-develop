# Exact Plan Adoption V4 — Claude Fable 5 cross-verification

- Date: 2026-07-28
- Producer: Codex / GPT-5.6 Sol
- Verifier: Claude / `claude-fable-5`
- Mode: owner-approved, finite, read-only recovery verification
- Strict production XVerify status: not claimed; this report does not fabricate provider-limit
  authority or a production `G7` receipt.

## Pass 1 — adversarial finding

The first bounded P1–P5 adjudication returned `REFUTED`.

- P1 confirmed execution-plan digest V4 binds structured criterion identity, polarity, statement
  and evidence requirements while the version dispatcher preserves V2/V3.
- P2 confirmed adoption planning binds the fresh V4 plan digest, legacy and canonical projection
  digests, owner actor, timestamp and justification; approval is actor-bound and does not mutate
  task files.
- P3 confirmed migration is exact-start-only, leadership-held, pre-admission, drift-rejecting and
  retry-oriented.
- P5 confirmed the CLI adoption surface is EN/TR i18n-backed, dry-run is read-only and apply does
  not implicitly start the sprint.
- P4 was refuted: the then-current implementation performed a final read followed by
  `renameSync(stagePath, target)`. A writer replacing the target in that interval could be silently
  overwritten.

This was accepted as a real implementation defect; no success receipt was written from the first
verdict.

## Repair

`src/orchestra/task-artifact-projection.ts` now:

1. moves the observed legacy target into a distinct durable `.previous` predecessor;
2. re-validates that moved inode against the exact legacy payload;
3. publishes canonical content with `linkSync(stagePath, target)`, which fails rather than
   overwriting a recreated target;
4. preserves both the concurrent target and predecessor evidence on collision;
5. retains the predecessor for audit/recovery and resumes when a crash leaves exactly one verified
   predecessor with no target.

The targeted repair proof passed TypeScript and 12/12 projection/exact-start tests before the
second verifier call.

## Pass 2 — fresh P4 adjudication

The second bounded read-only Fable 5 pass returned `CONFIRMED`.

The verifier independently mapped:

- stable no-follow reads and inode checks;
- legacy/canonical content CAS;
- target-to-predecessor capture followed by re-validation;
- no-clobber canonical link publication;
- typed HOLD propagation through exact start;
- retained predecessor evidence;
- crash-resume and recreated-target preservation tests.

It reported no concrete data-loss or silent-clobber trace. Project leadership was treated as an
additional serialization boundary, not as the sole proof.

## Verdict

The original P1–P5 claim set is `CONFIRMED` only after the P4 repair. Runtime sprint execution,
provider-limit authority, native-platform proof and production XVerify admission remain outside
this receipt and are not claimed.

