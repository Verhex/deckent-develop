# R31 — release deadline mechanism reproduced and isolated

MASTER3178/parent120; owner-authorized ADR-D-007, DOGFOOD_HEALTH remainsDEGRADED pending full release/retry fan-in closure. No new sprint.

Real Docker controlled proof2026-09-14T20:31:57Z: unique disposable volume,1scommanddeadline,3.5sparent synchronous stall. Legacy directcommand returned statusnull/errortrue/timeout while observedexitCode0 andvolumeabsent (elapsed3502ms). Newproductionwrapper executiontransport returned status0/errorfalse/exit (childelapsed130ms),sameparentstall,volumeabsent. Genuine8ssleep with1sdeadline stayedtimeout/signaled,childelapsed1018ms. Ownfixturecontainer/volumes removed;onlylocal-llm remains. Exit0. This proves failure CLASS, not a retroactive claim of exact historical766timer ordering.

Production resolveExactDockerObservationRunner sends admitted docker rm,volume rm,run to separate executionthread; readonlyobservation staysseparate,customrunner identity preserved. Existing shellfalse validation,bounds,childclose-before-return preserved;threadexit precedes delivery,no coordinator timer,no fallback rerun. Worker executes commandonly,no Store or authority. Malformed/duplicate/error/nonzero-threadexit failclosed.

Release guardnulls now publish immutable firstfailure EFFECT_DIAGNOSTIC with RELEASE phase, namedguardcode, progress/commandstage, safecommanddiagnostic (exit,duration,bytecounts; nooutputsecrets). Completionhold carries reread diagnosticreference. Olddiagnostic shapes remainvalid. Full production durablediagnostic fault roundtrip notyetlive-proven; pending in next verification slice.

122tests exit0; initial tsc2 reason literal widenedstring fixed; build:all exit0/27.25s includesfinaltsc. Tests addedafterbuild only; productsource unchanged sincebuild. Existing dirtypatch includes earlierwork, do notattributewhole390linebackenddiff toR31.

Remaining accepted work: durablediagnostic injected-failure proof; bounded in-run release replay with exact currentattempt and typedunresolvedhold; NOT_DISPATCHED freshadmission retry; recover766remainingattempts; independentFable review; onlythen20taskrerun. No fakeNO_GO, no freshsprint, noauth/commit/push. Startuphistorycache andworkspaceparallelization later.
