# RECOVERY-TRUTH-001 — authority-ratchet result evidence

**Cut-off:** 2026-08-22 UTC. **Disposition:** LOCAL_VERIFIED implementation and landing evidence; MASTER state is `VERIFY`, not `DONE`.

## Ratchet and nine seeded cases

`scripts/lint-recovery-truth-authority.mjs` parses current `src/` TypeScript/TSX with the TypeScript AST and fails closed on parse diagnostics in recovery-family files. It has no baseline, suppressions, comment allowlist, or substring-only decision path. The targeted Vitest suite seeds and deterministically rejects these nine cases:

1. direct task-result file writer;
2. exit-code-zero promoted to `DONE`;
3. checkpoint collection/glob clear;
4. checkpoint move-to-archive used as settlement;
5. cached/stale gate or projection reused by finalization;
6. loaded proposal without an explicit consumption receipt;
7. receipt re-evaluation/adjudication instead of immutable verification/replay;
8. recursive recovery glob (`**`);
9. recursive recovery directory enumeration.

The suite separately proves comments and strings do not trigger findings, malformed recovery syntax fails closed, ordering/path/line output is stable, and the real Node binary returns `0` for a clean fixture and `1` with the exact rule code for a seeded violation.

## Scale, binary, and snapshot

- **Scale:** the gate walks every non-declaration TypeScript/TSX source file below `src/` in sorted order; recursive *runtime recovery enumeration* is prohibited while lint enumeration remains complete and deterministic.
- **Binary authority:** `node scripts/lint-recovery-truth-authority.mjs` is the current-tree acceptance command. Process exit status, not printed prose, is the lint result.
- **Snapshot:** this document records the scoped files at this cut-off: the ratchet, its targeted test, the prior nine-case inventory, and the continuation inventory. No Sprint receipt digest is manufactured or relabeled.

## Recovery lineage and honest residual disposition

The dependency settlement for task 622-007 is host-aggregated `DONE`; its declared output adds production-import integration coverage for nine recovery outcomes, including immutable receipt replay/no-delete, live duplicate authority, corrupt bytes, foreign generation, Windows-native evidence, checkpoint preservation, stale projection, terminal conflict, and a measured 10k projection replay within ten seconds. This document does not invent exact test output or receipt identity beyond that host-provided settlement.

The bounded continuation inventory remains authoritative for the earlier Sprint-621 evidence gap: `621-015`, `621-016`, `621-019`, and `621-020` remain **OPEN / evidence-unavailable** there. The requested `ABORTED → continuation` lineage is therefore recorded honestly as:

`unverified Sprint-621 ABORTED input` → `missing redacted lineage manifest` → `OPEN continuation node` → `RT-CONT-<task> publication owner`.

The ratchet prevents the named shortcut classes from being reintroduced; it does not turn absent historical bytes into a closed lineage and does not claim that an exit code alone proves product recovery success. Root landing records this evidence in MASTER/current-flow without promoting the outcome beyond `VERIFY`.

## Root landing verification and bounded recovery seam

The independent root review did not accept Sprint 622's terminal `8/8` projection as landing proof. It found and closed three `BLOCKS_CURRENT_DONE` gaps after the sprint reached `COMPLETE`:

1. `sprint-recovery-operation` produced digest-bound archive manifests but the mutation still called the filename-driven orphan cleaner. The apply path now consumes the authorized manifests, publishes archive bytes first-writer-wins, verifies source and destination digests, and retires sources only after every destination is durable. A source-byte drift after authorization is a typed HOLD and leaves the source intact.
2. `sprint-status-authority` existed only as a unit-tested module. `readCanonicalRunStatus` now includes its side-effect-free recovery reconciliation, so CLI/MCP/API consumers of the canonical authority see `checkpoint-missing`, `projection-stale`, or `successor-available` rather than an unwired model.
3. The strict TaskResultV1 writer had been applied to the deliberately retained legacy `TaskResult` API, breaking top-level result consumers and auth-preflight output. The versioned path remains exact-attempt bound and canonical; the legacy path keeps its raw shape and established fsync/rename publication contract.

Fresh local evidence after those changes:

- `npx tsc --noEmit` — exit 0.
- Recovery scoped battery — 27 files, 200 passed, 2 skipped; includes the compiled CLI and the measured 10k case (1.731 seconds, below the 10-second ceiling).
- Adjacent worker/status/recovery regression battery — 10 files, 253 passed.
- `node scripts/lint-recovery-truth-authority.mjs` — `recovery truth authority: OK`.
- `npm run lint:gates` — exit 0; MASTER/closure/i18n/manifest/operating-policy projections in sync, hermetic ratchet has no new confirmed violation.
- `npm run build:all` — exit 0; TypeScript, assets and production dashboard rebuilt after the terminal sprint.
- Fresh `dist` status — Sprint 622 is `COMPLETE`; terminal receipt `b53e4fce31569edb19e95314965a197104a1176f3c17e1a9938654a5b1fc37e6` reconciles to `consistent` with no checkpoint.
- Bot restart — PID `1547500` passed `kill -0` and the Telegram approval listener is active. The optional local voice backend is unreachable, so voice degrades explicitly to text; this does not affect the approval listener.
- `git diff --check` — exit 0 before documentation projection.

Formal XVerify remains typed `unavailable/HOLD`: the available different-provider Opus 5 verifier is below the GPT-5.6 Sol author capability floor and Fable capacity is unavailable. Same-provider verification was not substituted. The missing Sprint-621 historical task bytes therefore remain an explicit evidence limitation rather than being reconstructed from chat or Sprint-622 output.
