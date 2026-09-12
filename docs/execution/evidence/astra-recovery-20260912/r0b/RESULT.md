# R0B — status repair verified; acceleration candidate HOLD

Astra epoch7, MASTER120 / RECOVERY-DO-DOGFOOD-001. DOGFOOD remains DEGRADED.
No751, worker/provider launch, authority/auth change, task cleanup, commit or push.
This is a reviewable recovery checkpoint, not product DONE or R0 closure.

## Delivered behavior

`src/core/run-status-authority.ts:450` preserves foreign Dashboard/lock projections
as historical only after identity-bound terminal Flow proof and absent/dead coordinator.
Live/unknown coordinator, missing/mismatched snapshot, current-run conflicts and
other authority surfaces remain conflicts. No runtime history is deleted.

Fresh compiled process at 2026-09-12T18:14Z: global748 ABORTED/FAILED;748/749/750
active=false;749/750 IDLE with three retained historical observations each and zero
current conflicts. Four archived artifacts match their earlier digests. Checkpoints,
PID snapshots and the real748 negative closure remain protected. Archive terminal
seals are still null; no successful outer settlement is invented. This proves the
canonical reader, not every already-running UI/MCP process or its old module cache.

The acceleration implementation is **explicitly opt-in, default OFF**:
`src/orchestra/spawn-backend-docker.ts:5534` and `:5611`. Ordinary production callers
retain the previous direct reader. No auto-fallback, budget expansion or synthetic
READY is used. Its activation and latency/memory proof remain BLOCKS_CURRENT_DONE.

## Candidate design and failed live proof

- Store operation view: `src/core/task-attempt-custody-store.ts:5920` and `:5953`;
  bounded immutable facts, exact context keys, native recheck at return, mutation
  fence through final verification, newly issued read capabilities revoked on exit.
- Physical positive/negative observations: `:13116`; only canonical admission
  discovery may classify an expected old-epoch rejection through separately verified
  no-effect quarantine. Missing/tampered quarantine still invalidates the decision.
- Effect lifecycle/cleanup reader: `src/orchestra/execution-effect-store-adapter.ts:81`
  and `:2503`; private namespace, complete identity/policy/admission/platform context,
  shared across same-authority reader instances only within a Store operation.
- `src/core/custody-read-snapshot.ts` keeps the original typed failure reason; a
  deadline no longer becomes a misleading ARTIFACT_CHANGED on subsequent checks.

Initial native candidate rejected historical quarantine; scoped repair and regression
proof closed that mismatch. Subsequent candidate hit its 10s ceiling. Lifecycle memo
repair then exposed the 64MiB retained-data ceiling. Sharing reader identity reduced
repetition but did not close the gate. Last candidate, final compiled source:
2026-09-12T18:13:35.702Z, **9459ms / exit1 / DISPATCH_DISCOVERY_BOUNDS_EXCEEDED**.
This read had diagnostic size logging; it is neither an uninstrumented benchmark
nor proof of a complete native reread. No p95 or speedup is claimed.

Retained-byte counter before failure:63,897,398; this is NOT process heap/RSS.
Captured category payload totals (excluding some key/fingerprint overhead):

| Category | Entries | Payload bytes |
|---|---:|---:|
| Verified file observations | 224 | 32,352,921 |
| Lifecycle/cleanup semantic facts | 27 | 19,613,854 |
| Verified effect results | 3 | 8,003,705 |
| First-writer observations | 609 | 664,557 |

The next insertion would exceed the bound. This establishes where retained data
accumulates; it does not yet prove how many bytes are physically shared or which
proof-equivalent reads can safely be unified. Limits were not raised.

## Verification and build

- Seven targeted files:325/325, exit0 (`tests-lifecycle.log`).
- Final shared-reader identity + native-fence regression:1/1, exit0
  (`test-shared-reader-verified.log`); an incorrect fixture identity/platform failed
  before its correction and was not treated as a product pass.
- Final TypeScript `--noEmit`:exit0 (`tsc-gated.log`); scoped diff check:exit0.
- Transactional full core+Dashboard build:exit0; run
  `53d1c9cf-d55c-44e5-a2c9-1543aa901c19`. Artifact digest:
  `946a46d54e632d1368e0d0333f3cd798516e3f23b428ec42ae60aeaba178fdf4`.
- Fresh source/build identity MATCH,1466 source files, source-tree digest:
  `ee3264bb8e891d6892fcadfab313b145e1ce718e5199f5624d03d7fd8e6a7820`.

One intermediate build failed E_BUILD_COPY_IDENTITY_MISMATCH. Concurrent Vitest wrote
its node_modules cache during that copy; timing supports this cause, but the first
CLI error omitted the exact path. Sequencing tests before build passed. No gate was
weakened; failed build preserved dist. Subsequent build wrapper used the same exported
transactional producer and verified toolchain with added error-path reporting.

Formal XVerify remains HOLD. No new paid review was launched on a known-failing
performance candidate; prior Opus/R0 evidence is preserved and is not a PASS here.
LOCAL_VERIFIED is scoped above; remote CI and full cross-platform/live-surface proof
were not run. Mixed main changes remain uncommitted and are not wholly attributed.

## Next admitted repair boundary

Remain within existing R0 item4; no new outcome admission or751:

1. Separate authority checks from storage ownership. Measure proof-equivalent file
   observations and parsed manifests; share immutable backing content only after
   exact proof/identity and each requested limit are checked independently. Do not
   reuse a permissive-policy read for a stricter policy or hide a stale proof.
2. Reuse verified parsed manifest nodes across lifecycle/effect results without
   serializing/retaining complete graphs repeatedly. Account shared ownership and
   escaped defensive copies honestly; no persistent success/liveness cache.
3. Preserve hostile replacement, absence, quarantine, tenant/policy, mutation-fence,
   capability-revocation and restart proof. Native retained-memory and ordinary
   fresh-process/warm latency must pass before opt-in becomes production default.
4. Only then request the authorized different-provider review and close the exact
   R0 gate before one official dogfood continuation. Schema/AI planning changes
   cannot substitute for this host-side prerequisite.

Finite recovery attempts reached their checkpoint. No further algorithm repair is
opened in this package. Default production compatibility read completed at2026-09-12T18:17:19.940Z:
**READY, unresolved=[], exit0;205,377ms inside the reader,210,906ms command elapsed**.
It used final compiled source and ordinary defaults; no provider was invoked. This
is preservation of the old safe path, not a latency improvement or p95 proof. The
old multi-minute latency remains a failure of the product goal. Diagnostic and
compatibility JSON/logs, code/test hashes and command exits are retained here.
