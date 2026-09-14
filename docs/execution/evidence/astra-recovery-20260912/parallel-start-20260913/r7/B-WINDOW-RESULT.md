# Capture IO window repair — LOCAL_VERIFIED, outer outcome OPEN

UTC 2026-09-13T20:37:02.616854+00:00. MASTER3178 / parent120; owner-approved A→B→C→D→E recovery. Main landed with baseline SHA comparison; build:all exit 0. No commit/push, provider run, receipt rewrite or retained-resource deletion.

## Actual evidence

- B-CAPTURE-PROBE-RESULT.json: retained 758-001, exact production helper/image/limits, readonly workspace mount; exit 0 in 2803.976ms, 7256 entries / 99078788 bytes, 2218938 output bytes.
- B-CAPTURE-BLOCKED-RESULT.json: same helper under a deliberate 65001ms parent event-loop stall; command classified timeout at 65523ms although full stdout SHA matched the successful control. This proves the failure mechanism, not the missing historical metadata of 758.
- Child-only transport initially succeeded under the same stall, but source review found the separate parent CLOCK gate. That candidate was NOT landed. Its patch/probe are historical evidence only.
- B-CAPTURE-WINDOW-RESULT.json: final bounded helper+post-inspection window, same retained data/limits and readonly mount, host stall 65000.724ms. Helper exit 0 at 1599.347ms; post-generation exit 0 and exact volume name MATCH. Window completed 2026-09-13T20:33:35.971Z, deadline 20:34:34.209Z, host delivery 20:34:36.528Z. No deadline extension or fabricated completion time. Harness exit 0.
- Final raw capture stdout SHA differs from earlier namespace captures; no byte-identical native object identity claim is made. Same measured entry/byte counts. Each raw-output digest is in its result. Production native/volume validation remains active.

Final window result SHA256: 2265f9790e46178c74ba4e9a58a9fce19da36f74de7044c36c09bcd2b5f6b526.

## Production wiring

src/orchestra/spawn-backend-docker.ts:3793 opts only canonical non-population capture into the bounded window. Custom runners and population retain their existing paths. The earlier read-only observation transport is unchanged.

src/orchestra/exact-docker-command-transport.ts:22 starts a local IO worker, bounds received results and waits for thread retirement. It grants no execution authority and writes no custody state.

src/orchestra/exact-docker-capture-window-worker.ts:9 invokes the original bounded subprocess runner; :11 performs the post-volume inspection within remaining deadline; :16 records actual completion before sending the result. No provider, coordinator or receipt producer runs in that worker.

spawn-backend-docker.ts:3663 and :3831 still verify the exact volume labels, identity and generation using that observation; :3841 uses the measured window completion with the existing lower/upper CLOCK checks. Existing native manifest parsing and lifecycle receipt validation follow. No synthetic receipt is persisted by these probes.

## Verification

Final targeted tests: 116/116 PASS exit 0 (24 observation/window + 92 backend). Unchanged lifecycle suite: 45/45 PASS in initial pass. That initial 155-test run had one stale source-anchor assertion, fixed to follow the new command construction; final affected suites rerun. A superseded child-only candidate had 117 tests; do not add those to final counts.

TypeScript --noEmit exit 0; isolated build exit 0; actual window probe exit 0; main build:all exit 0 (dashboard chunk-size advisory only); scoped diff check exit 0. Logs, candidate/final patches, scopes and landing hashes retained. Formal cross-provider XVerify unavailable/HOLD.

## Remaining and next boundary

758 stays canonical ABORTED/retained. The historical HELPER_RUN cause cannot be conclusively reconstructed because old diagnostics omitted exit/timeout details. This repair closes the reproduced host-stall failure mechanism; it does not claim the entire dogfood path DONE.

Next approved C: preserve and collect settled sibling results; stop further admission after authoritative fatal failure; drain started workers through canonical terminal handling; make CLI/MCP/Dashboard/task projections agree. Then D: remove repeated historical verification amplification and measure actual monotonic stage/resource costs. Only after these blockers and fresh build does E spend its bounded real eight-task start. No 15/30 task expansion yet. Host delivery latency remains a D concern even though it no longer changes capture completion truth.
