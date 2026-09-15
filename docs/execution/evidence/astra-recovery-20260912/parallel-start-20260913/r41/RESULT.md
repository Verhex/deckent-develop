# R41 — held task physical containment

Status: LOCAL_VERIFIED / production closure HOLD. MASTER 3178 / parent 120; existing owner-authorized ADR-D-007 recovery, DOGFOOD_HEALTH=DEGRADED.

## Defect and repair
Controller containment precedes the EFFECT_HOLD barrier. A retained release HOLD could leave bookkeeping in containers while daemon absence never reached workerInventoryState, producing EXACT_CONTAINMENT_INCOMPLETE before the barrier.

Contain reconciliation now observes the Store-bound RELEASED backendExecutionId before retained-disposition early returns or their catch. Physical observations are indexed by task and container. workerInventoryState uses the current container identity when present; otherwise it conservatively aggregates observed identities. Only proven absence satisfies containment; present and unknown remain blocking. An older attempt's absence cannot establish absence of a new container. Observations reset at reconciliation entry. No result, acceptance, effect settlement, or receipt is fabricated and retained container bookkeeping is preserved.

## Verification and limits
- Final targeted run: 99/99 across held containment (6) and Docker backend mounts (93); tests.log.
- Earlier focused run: 46/46, overlapping coverage; do not add totals.
- tsc --noEmit completed successfully, empty tsc.log.
- Wider run initially had 98 pass / 1 failure: a pre-existing mounts assertion expected held-completion lookup deletion, contrary to R35/R36 retention. Updated the three assertions to require retained lookup. Failure log preserved.
- New fixture executes production reconciliation, actual backend workerInventoryState, registry/lifecycle containment and outer barrier functions. It covers retained and catch paths for absent/present/unknown, retained HOLD without a result, settled B, pending C and replacement container identity.
- Store and daemon observations are injected. This is NOT a full controller run, real Store/Docker proof, restart/resume proof, formal XVerify, or capability DONE. The BLOCKED barrier is verified as a composed production path; actual PAUSED publication remains a live integration requirement.

## Remaining boundary
Inspect global timeout/live-worker behavior and mutable IPC artifact semantics. Then build with no live sprint, documented MCP reconnect, and real Docker A→C / independent B proof including restart and operator recovery. Unknown/present containment remains strict. No new sprint, build, runtime mutation, auth mutation, commit or push in R41.
