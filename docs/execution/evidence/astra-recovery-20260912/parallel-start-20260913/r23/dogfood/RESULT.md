# R23 real start observation — 763 failed before worker birth

Observed 2026-09-14T15:19Z. MASTER3178 remains OPEN. No new implementation, build, retry, cleanup or commit during observation.

Official `start --auto-approve --force-scope` exited1 after **500.984394585 monotonic seconds (8m21s)**. Maximum child-process RSS4667576KiB (~4.45GiB); child CPU user432.777s +system61.091s. These are wrapper child accounting, not whole-host/worker measurements.

Error: `EXACT_RUNTIME_FAILED_AFTER_ADMISSION:Coordinator status snapshot authority mismatch`.

The first attempt omitted intentional-new-path acknowledgement and stopped after15.02s with SCOPE_GATE_HOLD. Pure production scope evaluation confirmed exactly the four intended new document paths. The acknowledged attempt above is distinct and failed at a different boundary.

## Actual progress

- Four tasks planned; cost projection chose openai/gpt-5.6-luna. Subscription quota UNKNOWN explicitly shown; neither actual provider invocation nor usage is claimed.
- Coordinator763 snapshot startedAt15:18:19.294Z, lastHeartbeat15:18:36.194Z, wave0, all four tasks PENDING. This is a persisted coordinator snapshot, not proof of task materialization or worker birth.
- Process ended. `.tasks` had no763 task JSON; Docker listing showed only local-llm. No worker birth observed.
- Post-exit canonical read with763 hint returned762 ABORTED/inactive/coordinator absent and consistent terminal receipt. Therefore763 is not claimed independently terminally settled. Its exact flow disposition remains to be inspected through the product authority.
- 15:17:01Z process I/O counters: rchar3621867853B, physical read_bytes175345664B. Logical reads may include cache and IPC; not all attributed to any one store. No profiler was attached.

## Located failure boundary / next repair evidence

`src/orchestra/sprint-controller.ts:2958` publishes the fresh coordinator snapshot. `src/core/run-status-read-model.ts:550` resolves canonical authority using sprintIdHint. `src/core/run-status-read-model.ts:516` rejects inactive/dead/mismatched sprint or generation, duplicate/invalid tasks, and invalid held IDs via a single message at525. The message alone cannot identify which predicate failed.

Observed post-exit old762 selection suggests a fresh-coordinator versus retained-terminal projection precedence problem; this is a hypothesis, not a measured in-failure field comparison. Before changing code, reproduce the exact snapshot/authority selection and bind live lease identity; do not weaken mismatch guards or publish caller-supplied authority blindly. Startup scan latency remains a separate measured defect; no default cache or history bypass was enabled.
