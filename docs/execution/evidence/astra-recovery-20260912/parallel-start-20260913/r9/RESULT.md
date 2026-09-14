# R9 — C canonical progress repair

UTC: 2026-09-13T21:43:21.454050+00:00. Outcome MASTER3178 RECOVERY-DO-DOGFOOD-001 / parent120 OPEN. Owner-approved A→E sequence, typed recovery, DOGFOOD ON / DEGRADED. Scoped CAS landing to main, uncommitted. No live start, provider call, auth mutation, cleanup or terminal receipt generated.

## Root causes and production wiring

- `src/core/run-status-read-model.ts:504`: coordinator snapshot carries complete task DAG and exact sprint/lease identity. Previously publisher read only materialized `.tasks` files; R6 live revision3165 had total3/active3/done0 despite eight planned tasks and 758-002 settlement. Snapshots reject foreign sprint/task/lease/duplicate IDs; publication checks lease again under its lock.
- `src/orchestra/sprint-controller.ts:2950`: current coordinator tasks and explicit held task IDs feed the canonical writer. Heartbeat, committed-result callback (3540), per-task authority HOLD (3542), fatal HOLD (3578) publish the same projection.
- `src/orchestra/result-collector.ts:1642`: status mutation follows final authority revalidation; optimistic DONE no longer crosses an await. `recordTaskAuthorityHold` at1404 signals exact task identity once; projection callbacks cannot grant settlement or erase failures.
- `src/core/run-status-read-model.ts:199`: queued/PAUSED/current held FIX tasks do not claim FIX retry admission. Only current NO_GO produces retry-pending. Historical terminal receipt semantics were not rewritten.
- `src/core/run-status-read-model.ts:420`: IO readers compare canonical authority AND live generation. CLI, MCP, API, Terminal loader use the fence; pure terminal rendering remains IO-free.
- `src/cli/commands/status.ts:983`: process liveness no longer overwrites canonical logical active-task count. Missing dashboard/task files do not hide accepted progress (873); stale generation exposes no canonical count (1135).
- `src/mcp/tools/status.ts:473`: missing dashboard still returns canonical progress; regular path (564) no longer depends on task-file count. Existing message catalog supplies active/no-run wording.
- `src/orchestra/sprint-lifecycle.ts:361`: error dashboard uses canonical progress when supplied, otherwise shared task projection, instead of zeroing every count.

## Verification

- Final sequential targeted verification: **90/90 PASS, exit 0**, 11 files, `tests-final-sequential.log`.
- Final `tsc --noEmit`: **exit 0**, `tsc-final.log`.
- Isolated final `npm run build`: **exit 0**, `build-isolated-verified.log`.
- Main `npm run build:all`: **exit 0**, `build-main.log`; `git diff --check`: exit0.
- Compiled isolated ingress probe **exit0**; repeated against built main **exit0** (`compiled-probe-main.log`). Real CLI process `status --json` exit0 in all three fixture cases; compiled MCP registered handler, API reconciler and terminal IO loader exercised. CLI/MCP/API report 1 done / 1 active / 6 blocked / 8 total both with no task/dashboard files and with three stale task files. A successor lease with identical lifecycle invalidates old model/counts on every ingress. Terminal proof covers model freshness, not a new full PTY rendering claim.
- These are explicitly isolated fixtures, **not eight executed product tasks or paid-provider proof**. Blocked6 includes five queued tasks and one exact HOLD.
- Main canonical 758 status remains ABORTED, active=false, resumable=false, coordinator absent, conflicts=[] (`758-status-after.json`).

## Corrections retained as evidence

Initial 85 tests passed. Compiled probe then exposed missing early progress and logical/process activity conflation. Expanded tests exposed an old live PID fixture without lease (now supplied), and an existing IDLE response omission contract (preserved). One build failed on MCP nullable formatter typing and was corrected. A parallel test/build invocation triggered hermetic dist drift; final tests/build were sequential and passed. Initial failing logs remain; they are not counted as successful verification.

## Remaining boundary

R9 is LOCAL_VERIFIED production wiring; outer outcome remains OPEN/HOLD pending D and E. No formal XVerify receipt or complete cross-platform/live settlement claim.

D next: `r1e-read-amplification/RESULT.md` already proves bounded snapshot candidate fails10s (10.343s after prior parity change, RSS487944192). Candidate is still defaultOFF (`spawn-backend-docker.ts:5470,5551`). Do not repeat unchanged candidate or raise bounds. Profile repeated immutable manifest/path validation separately from per-request policy/identity. Preserve final native rereads, discovery membership and custody bounds; repair exact repeated verification, then measure monotonic time and CPU/RSS before enablement. Current metrics.jsonl is only1.9KiB, so its heartbeat read cannot by itself substantiate the historical eleven-minute admission gap.

E only after D: one bounded real eight-task start with effective provider/concurrency, stage timing/resource capture and exact settlement. No15/30 expansion and no product DONE based on tests.
