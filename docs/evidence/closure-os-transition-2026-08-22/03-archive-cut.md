# T03 — Canonical archive authority current cut

Date: 2026-08-22
Mode: read-only audit

## Verdict

**GO.** The recorded current all-history cut has **664 manifests**, **28,458
artifacts**, **720,054,696 payload bytes**, **15 manifest conflict records**,
**17 physical hash-addressed conflict artifacts**, and **zero integrity
failures**. Repository-wide verification covers **664/664 manifests** and
**28,458/28,458 artifacts**, with zero missing, mismatched, untracked, or
invalid-manifest-digest findings.

This note reports the established cut; it does not perform reconciliation,
retire a legacy source, or create archive authority.

## Exact all-history totals

| Measure | Current cut |
| --- | ---: |
| Manifests | 664 |
| Artifacts | 28,458 |
| Payload bytes | 720,054,696 |
| `run` | 3,873 |
| `tasks` | 19,047 |
| `evaluations` | 2,447 |
| `metrics` | 17 |
| `scheduler` | 195 |
| `heartbeat` | 2,095 |
| `docs` | 720 |
| `audits` | 64 |
| `unknown` | 0 |
| Manifest conflict records | 15 |
| Physical conflict artifacts | 17 |

The family counts sum to 28,458. The final apply observed 24,405 candidates:
0 newly published, 24,392 deduplicated, 18,364 digest-equal legacy sources
retired under the separately authorized retirement pass, 13 observed conflict
variants, and 0 failures. Its idempotent reapply published 0, retired 0, and
failed 0 times. These measurements come from the final all-history cut in
`docs/evidence/STATE-ARCHIVE-RESTORE-001-canonical-sprint-archive-2026-08-22.md`
(lines 86–115).

## Authority and migration boundary

- **Canonical path:** raw sprint evidence belongs only under
  `.deckent/archive/sprints/<sprint-id>/`.
- **Dual-read/new-write:** `resolveTaskArtifactReadDirs()` searches the
  canonical task directory first and retains existing legacy locations as
  migration-aware read roots. Publication resolves its destination beneath
  the canonical sprint directory. Legacy locations are inputs, not new write
  authorities.
- **No automatic legacy deletion:** inspect/dry-run creates no directory and
  leaves sources intact. Reconciliation retires a source only when explicitly
  requested, only for a candidate classified as legacy, and only after the
  destination's size and SHA-256 equal the source. The initial copy-only cut
  retired nothing.
- **Lossless conflicts:** when a logical destination already contains
  different bytes, `publishVerifiedCopy()` writes the incoming bytes to
  `conflicts/<name>.<sha256-prefix>`. The manifest groups the canonical path
  and its variants. It neither overwrites the existing bytes nor declares a
  winner. All 17 recorded physical variants remain preserved.
- **Integrity:** publication hashes the source, verifies the temporary copy,
  fsyncs the file and containing directory, and refuses a digest mismatch.
  `verifySprintArchive()` separately reports missing, mismatched, untracked,
  and invalid manifest-digest state.

These rules are implemented in `src/core/sprint-archive.ts` (notably
`resolveTaskArtifactReadDirs()`, `publishVerifiedCopy()`,
`publishSprintArchiveArtifact()`, `reconcileSprintArchive()`, and
`verifySprintArchive()`) and exercised by
`tests/core/sprint-archive.test.ts`.

## Brain index boundary

`.brain/memory.db` is the semantic-learning and search-index authority, **not
the raw archive store**. Reconciliation may write one compact
`archive-<sprint-id>` manifest reference. It does not copy raw task, log, or
other evidence payloads into Brain. The cut records 664 compact
`sprint-archive` rows and a read-only `PRAGMA integrity_check` result of `ok`;
an identical reapply preserved the database byte digest.

## Normal-sprint proof

The first ordinary post-migration dogfood sprint,
`sprint-1780659451539`, completed **20/20 logical tasks across 24 attempts**.
Its real finalizer automatically removed sprint-owned live task files and
created a canonical archive. After eight later root artifacts were incorporated
by the all-history reconciliation, its **current 367-artifact manifest**
verified with zero missing, mismatched, or untracked data. This is normal
finalizer evidence, not a hand-built fixture
(`STATE-ARCHIVE-RESTORE-001`, lines 138–142).

The unit contract independently covers canonical-first inclusion, read-only
dry-run, exact-sprint ownership, Brain indexing and idempotence, byte-tamper
detection, direct-writer publication, and both existing and intra-batch
conflict preservation.
