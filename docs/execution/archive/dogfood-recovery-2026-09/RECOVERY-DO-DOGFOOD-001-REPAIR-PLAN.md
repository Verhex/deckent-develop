# RECOVERY-DO-DOGFOOD-001 — closure and readiness repair proposal

Status: OWNER_ACCEPTED / FIRST_PASS_IMPLEMENTED / R0_HOLD; negative748 closure and748/749/750 task archiving proved, latency and projection parity still open.
ObservedAt: 2026-09-12T15:14:23.517949+00:00
Parent: docs/MASTER-PLAN.md row120 STATE-RETENTION-001, OPEN.
Authority: epoch7 committed handoff; new owner instruction authorizes closure of
748/749/750 but requires consultation before further product code changes.
This document is an execution contract, not a receipt or MASTER disposition.
Owner's subsequent enterprise dogfood/monitoring direction is analyzed in
`DOGFOOD-RESTORATION-2026-09-12.md`. This repair remains its first bounded R0 slice;
the broader sequence does not silently authorize unrelated work or751 before this boundary closes.
`durum-raporu.md` is a temporary narrative; runtime evidence and canonical policy
remain authoritative. No751 will be started under this proposal before acceptance.

## Fresh state

748: Flow FAILED11:56:19.192Z; real Terra worker executed, skill-delivery present;
task projection EXECUTING stale; coordinator414453 absent; Docker worker absent.
Exact custody exists; raw worker result schema-invalid, effect already landed, no
accepted task closure. Archive terminal null. Preserve checkpoint/result/effect bytes.
749: Flow CANCELLED12:51:21.636Z via canonical retire before dispatch; task PENDING
left behind, no worker/pid/skill delivery/exact admission. Archive terminal null.
750: Flow FAILED12:52:11.649Z at CLI orphan preflight, no worker/pid/skill delivery/
exact admission; task PENDING left behind. Archive terminal null.
The discriminator's 'legacy' means no exact admission was found; by itself it is
not proof that a legacy worker ran. Here pre-dispatch Flow/log evidence also exists.

No active worker among these runs; only local-llm service container is alive.
Readonly archive preview:748 task+skill two preserved files;749 one archive file;
750 one preserved file. This is a four-file archive scope, not successful task
settlement and not resolution of the748 custody HOLD.

## Problem being repaired

A terminal Flow does not propagate a verifiable terminal task/attempt disposition
to all consumers. CLI, planning readiness, controller registry, task projection and
archive currently answer different questions as if they were one status. The recent
registry-only rejection repair is supporting work; it has not closed this contract.
Source/test green was insufficient; no product DONE is claimed.

## Proposed implementation and effects

1. Durable negative attempt disposition. Use existing custody/lifecycle authority
   to bind schema-rejected result, exact identity/generation, provider exit and usage,
   already-landed effect and fresh worker absence to an explicit unsuccessful
   terminal outcome. Reuse existing typed terminal receipt semantics where valid;
   do not call a landed attempt 'never started', fabricate accepted worker bytes,
   turn invalid output into DONE, delete provenance, or maintain only an in-memory
   exception. Any required new schema variant must be reviewed as part of this
   contract before implementation; no guessed enum or parallel receipt engine.
   Principal paths: result-ingress.ts, spawn-backend*.ts, task-attempt-custody-store.ts
   and existing task-result-settlement.ts contracts, limited to exact failure closure.

2. One shared readiness decision. Planning, start, recovery, controller and archive
   consume the same verified disposition and distinguish ready/recoverable/active/
   unknown. 'Recoverable' must carry the exact operation and evidence prerequisites;
   it is never silently promoted to ready. Terminal Flow before worker dispatch must
   retire its unstarted task projection without inventing a worker receipt.
   Principal paths: spawn-backend.ts, spawn-backend-docker.ts, scheduler-effects.ts,
   sprint-controller.ts, sprint-recovery-operation.ts and existing Flow adapters.

3. Correct CLI outcome and scoped recovery. False exit0/'spawned' after FAILED must
   be removed; exact start marker and duplicate-start checks remain generation-bound.
   Orphan classification must consume the shared authority. archiveOrphan must never
   move another sprint's state; no force or autoapprove shortcut around proof.
   Principal paths: CLI start.ts and callers, sprint-pid-manager.ts, existing i18n.
   Cursor's existing dirty hunks must be preserved; paused terminal REPL is outside
   this package. Custody coordination precedes any overlapping write.

4. Bounded, observable recovery reads. One verified operation snapshot rather than
   repeatedly scanning/re-hashing all historical attempts per adapter. Prefer existing
   dispatch/task identity lookup; carry snapshot/fence/digest through consumers and
   revalidate changed authority. Do not cache mutable liveness as terminal truth.
   Proposed reference-host target: ordinary start/readiness decision <=5 seconds;
   any required exceptional forensic scan is explicit, bounded and reports phase/
   elapsed/progress. It never reports ready before required evidence completes.
   Measure real repository timings and read counts, scale fixtures and mutation
   races. Unknown platform authority remains typed unsupported/HOLD.

5. Owner-authorized closure, then proof. Apply canonical closure and archive only
   after the repaired exact authority establishes failure/cancellation for each run.
   Preserve four residue files,748 checkpoint/PID snapshot and immutable effect/
   result receipts under the approved artifact policy. Reread across a new process
   twice: no active task/worker, no ghost EXECUTING/PENDING in active projections,
   no repeat recovery, no accidental replay or lost archive. Flow FAILED/CANCELLED
   history remains unchanged. Final report must separate unsuccessful closure from
   product completion. No751 until this entire boundary is green.

## Acceptance, measured before another canary

- Existing actual748/749/750 evidence fixture through production consumers, not
  only mocked registry objects. Live evidence remains immutable.
- Positive accepted, negative schema-rejected with landed effect, pre-dispatch
  cancelled/failed, post-dispatch failed; terminal outcome visible identically on
  official CLI/Flow/task/recovery readers.
- Missing/tampered receipts, wrong project/tenant/run/task/attempt/generation,
  active/unknown process, replay, duplicate dispatch, concurrent change, restart
  and partial archive crash stay fail-closed or idempotently complete as specified.
- Failed tool/result schema cannot lose actual provider usage or landed effects.
- Fresh-process integration tests (actual filesystem/Store), targeted tests and tsc,
  safe compiled binary proof; one source-accurate independent Opus pass if budget
  remains. No repeated identical provider call or blanket full-suite retry.
- Performance evidence accompanies correctness. The current minutes-long health
  read is not accepted as ordinary start latency.

## Excluded

No REPL/paste/model feature, Dockerfile redesign, auth/mode mutation, new MASTER
outcome, success fabrication, manual runtime JSON rewrite, unconditional deletion,
commit/push or new worker751. Existing owner closure authorization is retained;
the owner has accepted implementation of this first package; no repeat approval is required.

Evidence: docs/execution/evidence/astra-recovery-20260912/owner-close-preflight.json,
planning-recovery-health.json, cold-discovery-summary.json, xverify-durable-reread.json.


## R0 measured checkpoint — 2026-09-12T16:52:07Z

Negative rejection closure code is implemented. Actual748 CLI close succeeded;
receipt `sha256:a5bef46468d4f0d67852a22d30773f1772c7c49e53d95fdd0249cfc25be4d834`.
Fresh planning-health returned ready with no unresolved entries, but took201,403ms
inside the reader (207,415ms process elapsed with CPU profiling). The separately
measured real archive preview took208,038ms. Thus correctness of this negative
boundary improved; the ordinary readiness performance gate remains FAILED.

The CPU profile attributes142,287ms inclusive to `readColdExactDockerAcceptedResult`,
98,822ms inclusive to `readAdmission`, and73,487ms inclusive to
`readVerifiedEffectLanding`. Inclusive times overlap and MUST NOT be added. Native
boundary self time83,299ms is not evidence that one native syscall alone is slow;
it includes multiple calls through the same captured wrapper. No provider call
was made by this health probe. Code and measured profile support repeated historical
accepted/effect graph validation as a substantial local cost, independently of AI.

The already-admitted item4 is still required before751: one operation-scoped verified
read snapshot, shared immutable admission/artifact/chain facts, revalidation at the
mutation fence, no caching of mutable liveness as success. Optimize repeated parsing,
manifest validation and read amplification rather than deleting checks or blindly
accepting old receipts. Any persistent acceleration must be a verifiable projection
of canonical custody with complete sequence/identity coverage, not a second authority.
A wall-clock deadline alone is insufficient: asynchronous phase boundaries must keep
the operator responsive, while incomplete authority remains typed HOLD.

Proof requirements: count native reads and repeated graph nodes; cold/warm timings
separately; tamper/source replacement/first-writer race/restart and tenant isolation;
ordinary p95<=5s and explicit bounded exceptional investigation. No new schema
scaffold or model timeout increase can substitute for this host-side repair.

Evidence: `../evidence/astra-recovery-20260912/r0/RESULT.md` and profile summaries.
The raw65MB CPU profile stays outside the repo under the recorded /tmp evidence path;
its digest will be retained in the evidence manifest. Do not add large profiler output
to product docs or feed it wholesale to the Brain.

## R0B checkpoint — 2026-09-12T18:16:20.712484+00:00

Canonical status düzeltmesi gerçek binary'de doğrulandı:748 ABORTED/FAILED;
748/749/750 active=false;749/750 eski Dashboard/lock izlerini geçmiş olarak taşır,
güncel conflict yok. Dört archive artifact hash'i korundu. Native hızlandırma adayı
10s/64MiB kapısını geçemedi ve `verifiedReadSnapshot` varsayılan OFF bırakıldı;
üretim doğrudan okuyucuyu kullanıyor. Son candidate9459ms, exit1,
DISPATCH_DISCOVERY_BOUNDS_EXCEEDED (ölçüm enstrümantasyonu var; p95/iyileşme iddiası yok).
325 hedefli test + final dar1 test + TypeScript/full build exit0; source/build MATCH.
Formal XVerify ve outer R0 HOLD;751 yok, commit/push yok. Sonraki admitted R0 item4:
proof/limit kontrolünü koruyarak doğrulanmış içerik/manifestlerin ortak saklanması
ve native bellek/süre kanıtı. Detay ve kaynak manifesti:
`docs/execution/evidence/astra-recovery-20260912/r0b/RESULT.md`.

R0B son üretim-default binary kontrolü:2026-09-12T18:17:19.940Z, READY / unresolved=[] / exit0; okuyucu205377ms. Eski doğruluk yolu korunmuş, hız hedefi kapanmamıştır.
