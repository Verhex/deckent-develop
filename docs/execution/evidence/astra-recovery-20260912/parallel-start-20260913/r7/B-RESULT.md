# B diagnostic + C first-failure propagation — LOCAL_VERIFIED

UTC 2026-09-13T19:22:16.681454+00:00. MASTER3178 / parent120 OPEN. Main landed, build:all exit0. Not a full capture-root-cause repair or product DONE.

## Changed production chain

exact-docker-workspace-command.ts:21 adds optional bounded diagnostic to owned-child result; exit reason, exitCode, signal observed, monotonic elapsed, timeout and output byte counts. Existing status/error semantics and wait-for-close preserved. No timeout increase, thread/authority expansion or rawstderr projection.

spawn-backend-docker.ts:3788 non-population helperfailure carries trusted diagnostic into ExecutionEffectDockerCaptureAdapterErrorV1 (execution-effect-docker-lifecycle.ts:1782); final capture catch:3771 preserves it. Backend parser:868 accepts both old and new exact capture shapes, validates diagnostic; immutable dispatch effect observation carries it through existing producer/consumer/ingress. Existing oldreceiptbytes unchanged.

result-collector.ts:2972 rereads canonical task result authority after IPC polling returnsHOLD; if a capture/resultHOLD exists, original reason is emitted. No authority bypass: absent/invalidIPC stillfailsclosed. This repairs the masked-reason symptom only; siblingfan-in, schedulingafterfailure and projectionterminalparity remain openCscope.

## Verification

Initial155tests:154pass,1testfailed because safe fieldname stderrBytes matched overbroad stderr leakage regex; secret/path marker assertions retained and corrected. Final4files168/168PASSexit0; finalrunner18/18PASSexit0 (subset,notadditionalunique). tsc0,isolatedbuild0,mainbuild:all0,diffcheck0.

Actual compiled Docker read-only missing-volume response exit1 classified exit; nonresponding localDockerendpoint250msdeadline returned reason timeout at259ms, signaledtrue, childclosed; harness exit0. No productrun or actualworkspacecapturehelperreplay. No fabricated liveclosure. Durable diagnostic shape covered by backend monitor test; IPCrace covered by resultcollectorintegrationtest. FormalXVerify unavailable/HOLD.

## Remaining

758 source of HELPER_RUN failure could be timeout, daemon/processerror or another helperfailure; olddiagnostic lacksdetails, cannot reconstruct certainty. Next controlled exacthelpercapture reproduction must use newdiagnostic; no blind new8taskrun. Capture rootrepair notcomplete. C siblingcollector/projection/abortchain and D historyperformance pending. 758staysABORTED/retained; no newtask/runtimewrites inB, no auth/mode/commit/push. ExistingA/Cursor/worker changes preserved bybaselineSHAcompare beforelanding.
