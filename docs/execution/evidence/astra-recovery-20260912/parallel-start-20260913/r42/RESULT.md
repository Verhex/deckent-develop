# R42 — observation deadline verified; live-budget boundary remains open

Status: source audit + REAL_DOCKER_READ_ONLY_PROBE verified; full recovery closure HOLD.

## Observation timer
Production constructor wraps canonical workspace runner. The exact formatted containment inspect is accepted by isExactDockerReadOnlyObservation and executes in exact-docker-container-observation-worker. Parent has no deadline timer. The raw runner still marks timedOut before a delayed close; isolation, not close precedence, protects this production call from coordinator stalls. Injected custom runners retain their own behavior.

Real Docker proof (inspect-proof.json): missing exact probe name verified first, then same formatted inspect while parent busy for 12 s. Command timeout 10 s, observed child elapsed 135.109075 ms, status1/errorfalse/reasonexit. Docker absence response retained. No container or volume created/deleted, no Store or run used. This does not prove immunity to all system starvation or genuine daemon timeouts.

## Build/runtime
Before build: disk sprint-766 ABORTED, no task JSON, process scan no CLI sprint, Docker only local-llm. build:all exit0, advisory Vite large-chunk warning. Official resolveWorktreeBinaryAuthority returned allow/matching-build-identity. Existing long-lived MCP processes were observed; reconnect NOT performed or claimed. Fresh dist imports prove current binary only, not old-process cache refresh.

## Finite collector budget finding
waitForResults exits elapsed budget without liveness check. Final sweep produces no result for exact pending-settlement. Controller later requires terminal authority for this state and EVALUATE can throw E077. This is a code-path finding, NOT a reproduced real-run failure. Disk config is 300 min, explicit opts timeout wins. No timeout config changed. A solution must preserve independent finite execution/provider budget authority, live custody and observer continuity; never extend paid budget implicitly or manufacture a TaskResult. Bounded second-opinion prompt: FABLE-TIMEOUT-ANALYSIS.md, per owner's request to ask for analysis when needed and wait.

IPC growing-file risk remains open: resolver targets per-sequence sealed question files and durable cursor, not an obvious raw output tail, but underlying inventory/snapshot concurrency has not been proved safe.

No new source edits, tests, sprint, runtime recovery, MCP termination, auth mutation, commit/push or DONE/settlement claim. Existing test results are R41 evidence, not rerun in R42. Next: resolve finite-budget/live-custody seam via bounded review, then reconnect and real Docker A→C/B restart/recovery proof. Weekly limit read at 12:37:48Z:47% remaining, 10080-minute bucket, zero model calls.
