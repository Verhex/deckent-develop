# R0 recovery — implementation and live proof

Status: IMPLEMENTED / LIVE_NEGATIVE_CLOSURE_PROVEN / outer R0 HOLD; no product DONE. Source observed 2026-09-12T16:50:18Z.
Owner accepted first R0 package and closure of 748/749/750. Epoch7 authority;
DOGFOOD ON, typed recovery only. No751, commit/push, auth mutation, or Cursor
REPL edits in this package. Existing dirty main changes remain independently owned.

## Implemented production chain

- Store producer: `src/core/task-attempt-custody-store.ts:7738` through
  `:7865`: first-writer REJECTED_RESULT_CLOSED with exact admission, provider
  lifecycle, rejected source digest, landed effect, preserved inventory and
  canonical fenced recovery authority. Reader reconstructs and validates the
  record; conflicting, corrupted, changed and backdated evidence stays HOLD.
- Backend assembler: `src/orchestra/spawn-backend-docker.ts:17807`: schema
  rejection is proved through canonical ingress and actual provider completion;
  validation-only mode never publishes acceptance for a valid result.
- Consumers: planning `spawn-backend-docker.ts:17761`; startup `:19637`.
  Verified negative history is resolved without worker adoption/effect replay.
- Ingress: `src/cli/commands/recover.ts:187` → canonical
  `src/orchestra/sprint-recovery-operation.ts:510`. FAILED Flow, exact fence,
  owner approval and stopped coordinator remain prerequisites. No blanket
  force-success and no hand-written task or receipt JSON.
- CLI detached-start failure now reports nonzero rather than spawned success.
  Dead-PID orphan archiving leaves global state to fenced recovery and preserves
  the coordinator snapshot needed to interpret an existing checkpoint.

## Verification

| Command/surface | Result | Evidence |
|---|---|---|
| Targeted eight-file Vitest batch | 128/128, exit0 | r0-final-tests.log |
| Additional planning/startup consumer regression file | 92/92, exit0 | mount-consumer-final-tests.log |
| `npx tsc --noEmit --pretty false` | exit0 | r0-final-tsc.log |
| Transactional core build | exit0, BUILD_COMMITTED | build-final.log |
| Build identity v3, fresh source digest comparison | MATCH, 1465 source files | build-identity-final.json |
| Real CLI rejected-result preview | eligible, exit0 | final-preview-748.json |
| Real CLI rejected-result close | closed, exit0, 59,998ms | close-748-command.json; close-748.json |
| Formal Opus5 XVerify attempt | exit124, no output/verdict/usage receipt proved | xverify-command.json |

Total targeted tests:220. An initial additional-test assertion expected an optional
empty report array instead of absence; corrected test expectation, no production
fallback. Original failed log retained. The successful 128 and92 runs cover separate
files. No full suite or remote CI was run. Generic negative archive recovery uses
`--skip-audit` explicitly: that legacy audit otherwise starts the entire Vitest suite;
this is not a successful product quality gate or MASTER disposition.

XVerify: HOLD, no PASS. Earlier review input `incremental.patch` is historical and
was revised afterward; final exact source hashes are in `final-source-manifest.json`
and the baseline-relative delta in `final-baseline-relative.patch`. They are not
independent review receipts. Solo continuation was already owner-authorized.

## Durable negative attempt

748 actual CLI close at2026-09-12T16:48:09.121031Z:
`sha256:a5bef46468d4f0d67852a22d30773f1772c7c49e53d95fdd0249cfc25be4d834`.
Task748-001, attempt7ed4e935-d31f-845f-8a37-965e3f7ff04f, generation1.
Source result and landed effect remain evidence, not an accepted worker success.
Checkpoint digest remains
`sha256:0c91ef6512a9ce475e48fda96799b9b8f3f1d3bd60aad551a7f54cefa6d35408`.

## Pending acceptance

748 and750 canonical task archiving succeeded. Two fresh-process backend/Store rereads verified the same748 negative receipt, without publication.749 canonical recovery also succeeded (exit0 at2026-09-12T17:05:30Z); its first concurrent CLI preview failed with SQLite journal-mode inspection error. A subsequent standalone canonical artifact preview passed, with unchanged task digest and absent coordinator. This is not a clean bill of health for parallel read commands.
Ordinary readiness latency has NOT passed the <=5s target. Real archive preview
needed208,038ms with no AI call. A CPU profile of the shared health reader is
being captured before any further performance change. This latency is an R0
acceptance blocker, not deferred as a success. Cross-surface monitoring and the
host-generated plan scaffold remain the owner-accepted later R1/R2 packages.


The source-grounded plan for deterministic scaffolding is recorded in the restoration
plan's R2 follow-through. It preserves host authority, semantic model slots, exact
scope and capability-specific side effects; empty plans never become executable.

An additional actual residue was observed: the timed-out Opus5 verifier projection
remains PENDING in `.tasks`; its author-DONE wrapper is supplied review input, not a
successful verifier execution. No actual verifier call, usage or verdict is established.
These xverify artifacts are outside the explicitly authorized748/749/750 archive
scope and were preserved. `.tasks` globally empty is NOT claimed.


## Final runtime checkpoint — 2026-09-12T17:05:54Z

All three official archive commands exited0. The four target files left active
`.tasks` and are present with original SHA256 under canonical sprint archives.
748 preserved task+skill,749 archived unstarted cancelled task,750 preserved failed
pre-dispatch task. No manual runtime edit or task deletion was used.
Two fresh processes agree (573ms and582ms full status/archive read). All three have
`active:false`;748 is ABORTED/FAILED history,749/750 current execution views areIDLE.
Original Flow events remain RUN_FAILED/FLOW_ABORTED/RUN_FAILED. No worker-success
receipt was synthesized. All three archive terminal seals remain null: this package
has NOT sealed a successful or complete outer sprint archive. Negative custody
closure and preserved task archiving are the exact accomplishments.

Residuals: hint-scoped749/750 readers still report old748 Dashboard ACTIVE and sprint
lock identity conflicts. The global authority correctly reports748 ABORTED/FAILED;
full projection parity therefore remains HOLD. `.tasks` contains14 other files:
eight XVerify wrapper/plan/result files and six historical hidden CAS predecessors;
none are the four target task files. They are preserved. Docker enumeration showed
only local-llm, no live Docker worker. This is not a proof about every possible host
process, backend or platform.

Final R0 verdict: **HOLD**. No751, no product DONE, no MASTER disposition, no commit
or push. Required next repair is the already-admitted bounded shared read snapshot
and status-projection parity, then exact latency/live closure proof. The first
implementation/verification pass is recorded here; do not repeat broad audits or
use another canary as a substitute for the measured201s host-side blocker.
