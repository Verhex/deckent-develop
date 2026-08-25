# FO03 conformance matrix

**Inventory date:** 2026-08-23
**Counting rule:** `covered` requires a named executable test. Hermetic/mock
coverage is never promoted to real-process proof.

| Axis | Final-only named evidence | Manual-spawn named evidence | Proof boundary |
| --- | --- | --- | --- |
| Normal valid route | `spawnWorkers — … routes an owner-authorized final-only Codex budget through Docker containment`; `executeSpawnTask — … preserves final-only Codex containment…` | `registerSpawn — … uses the task-stamped exact grant…` | Covered, hermetic consumer/backend spy. |
| Hang / wall-clock | `Docker final-only live-usage containment — narrows the container wall clock…` and `never widens the configured timeout…` | None | Final-only cap logic covered; live hung process unverified. |
| Child process | None | None | Missing real-process evidence. |
| Missing final usage/result | None | `finalizeTaskStatusFromResult — missing result file → null, task JSON untouched` | Manual status negative covered; final-only provider/process case unverified. |
| Missing grant | `Docker … refuses a final-only provider…`; initial and continuation `blocks … when the task-stamped grant is missing` | `registerSpawn — … fails closed … no grant` | Covered; real provider side effect is represented by a zero-call backend spy. |
| Replay | `FO07 … makes replay settlement first-writer-only…` | Same settlement test | Receipt behavior covered hermetically; real duplicate process race unverified. |
| Crash | None | None | Missing real-process evidence. |
| Stale result | None | `registerSpawn integration — ignores a STALE pre-spawn result on --force respawn` | Manual covered hermetically. |
| Exactly-once settlement | `spawnWorkerMultiProvider Docker settlement attempt — serializes dispatch and settlement…`; FO07 conflicting settlement rejection | Same shared consumer/receipt tests | Durable file authority covered hermetically; live concurrent provider race unverified. |

## Measured result

- Named hermetic coverage: final-only **5/9**, manual-spawn **6/9**, combined **11/18**.
- Real-process coverage for this matrix: **1/18**. The built CLI missing-grant
  manual-spawn canary exited 1 with `owner-authorization-missing`, did not print
  `Worker spawned`, and created no Docker/provider dispatch.
- Scoped acceptance battery after host correction: **74/74** across
  `final-only-usage-containment`, manual lifecycle/parity, initial spawner, and
  continuation executor suites.
- Broader affected regression battery: Docker final-only and CLI spawn families
  passed; XVerify final-only grant/no-grant/incremental cases passed. The
  independent `cross-verify-wire` suite exposed 11 exact-coordinator failures
  in unmodified, out-of-scope production sources; no parity claim is based on
  that red class.

Valid paid completion, hang, child-process, crash, missing-final provider output, and real concurrent
dispatch remain real-binary negative space. They must be exercised by the
post-terminal Docker canary or the broader FO-11 real-process matrix before a
full lifecycle COMPLETE claim.
