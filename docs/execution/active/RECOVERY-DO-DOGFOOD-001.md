# RECOVERY-DO-DOGFOOD-001 — isolated repair candidate

DOGFOOD_MODE: ON
DOGFOOD_HEALTH: DEGRADED
RECOVERY_SEAM: ADR-D-007
STATUS: DEGRADED/HOLD; real worker dispatched; canary FAILED; prompt schema repair LOCAL_VERIFIED; worker REVISE
PARENT_MASTER_ID: 120 / STATE-RETENTION-001
AUTHORITY: epoch 7, ah-2026-09-12-opus-astra-dogfood-v3/0003-committed.json
OWNER_DECISION_REF: 2026-09-12 live Option A and accepted work order
WORKTREE: /tmp/deckent-recovery-state-astra-20260912
BASE_SHA: ae87e898613928ca314b5179484982b6bdb6d69f

This is a plan and scope declaration, not a runtime or admission receipt. The worktree
contains a frozen copy of the unlanded shared main remainder. Its upstream changes retain
their original authors; only the incremental recovery patch belongs to Astra.

## Outcome and fresh evidence

Users must be able to start subsequent admitted work after an earlier run has durably failed,
without promoting an invalid immutable accepted result to success. Recovery must retain the
state prerequisites of a preserved checkpoint unless exact durable terminal authority proves
the run is already history. No sprint/task/model literal routing.

At 2026-09-12T10:54Z the live canonical readers report sprint-747 ABORTED/terminal,
a process-generation-bound RunFlow FAILED closure at 2026-09-12T00:58:23.358Z,
and no archive terminal seal. These are distinct evidence types. A missing archive seal is
not missing terminal authority. The existing negative historical retirement contract can
consume the RunFlow closure; a new fabricated state or terminal receipt is unnecessary.
The accepted result lacks productionWiringEvidence (core/task-result-settlement.ts:499);
host re-proof cannot amend immutable worker result bytes. Registry retirement is an in-memory
projection derived again on each cold start, not a successful settlement or deletion of evidence.

The real recovery operation currently preserves a checkpoint but clears its matching
sprint-state (sprint-recovery-operation.ts:826). The new hermetic regression reproduces this:
1 FAIL, 2 PASS, exit 1. Canonical state file is absent in live747; checkpoint digest remains
fb9825d1093e9212714c986a74531522316afc19fc5d68dd02ec93ebaab677d1.

## Dependency order and exact write scope

0. Preserve and separate existing main remainder; Cursor terminal and unassigned D changes
   require consolidated review before main landing. This isolated candidate is not a landing.
1. Preserve matching sprint-state with its canonical checkpoint unless a sealed terminal archive
   or process-generation-bound terminal Flow proves the run is history; bare FAILED text is insufficient.
   Write: src/orchestra/sprint-recovery-operation.ts;
   tests/orchestra/recovery-resume-state-retention.test.ts.
2. Extend the existing decided-hold classifier only for the exact immutable
   production-wiring-missing-worker-evidence case. Existing accepted custody, stopped run,
   historical ordinal, bound task identity and non-terminal-reread gates remain mandatory.
   Write: src/orchestra/sprint-controller.ts;
   tests/orchestra/exact-controller-terminal-fanin.test.ts.
3. Owner amendment 2026-09-12: Claude limits exhausted; Astra performs source review and local
   verification alone. Formal provider-separated XVerify stays unavailable/HOLD. Authorized main integration and binary
   verification. Worktree build only while no runtime exists in that worktree; no main build
   concurrent with a sprint. tsc and scoped vitest are authorized local verification.
4. Official Do/Run canary with effective Codex role config and live resource/provider admission.
   Verify it passes historical reconciliation, preserves failed747 evidence, executes a real
   worker and records host proof, independent-provider verification and durable settlement.
   Do not claim product DONE from tests or from an in-memory registry removal.

Additional write scope: this capsule; incremental patch/evidence and current status documentation.
Read scope: canonical recovery, checkpoint, lifecycle, accepted-result/store, host proof,
archive and run-job readers, config/registry and their tests; live runtime is read-only until
an explicitly recorded canary admission. A nonterminal run lacking state stays HOLD until a
separate evidence-bound restore path is justified; never synthesize running state from a filename.

## Proof and stop contract

- Positive: immutable missing-worker-evidence from a durably terminal foreign run retires only
  from the execution registry. A second cold start derives the same decision from unchanged
  accepted custody + terminal run evidence. Old task success is never emitted.
- Negative: current/sibling/future, nonterminal/unknown run, invalid identity, terminal-reread,
  missing host evidence, timeout, cancellation and unavailable authority retain HOLD.
- Recovery: preserved resumable checkpoint implies byte-preserved matching state; retirement
  requires exact terminal evidence. Dry-run and foreign state are unchanged. Existing exact containment/death fencing and snapshot contracts stay intact.
- Tests are hermetic temporary projects. Fixture receipts are not provider/production receipts.
- Platform-neutral classification and preservation; real platform adapter proof remains required
  for the full environment matrix. One Linux run is not macOS/Windows/WSL closure.
- Finite budget: one implementation pass + one independent review; at most two repairs with a
  changed failure fingerprint, each command bounded to ten minutes and two test forks.
  No same-fingerprint runtime retry, provider spending, kill/cleanup, auth mutation, signing,
  closure-ledger disposition, push or change to Cursor files follows from this capsule.
- Preserve .brain/memory.db, .tasks, auth, accepted result/effect/receipt bytes and immutable handoff.
  Main remainder and production proof must close before outer recovery can be COMPLETE.

Owner live amendment: solo execution replaces waiting for Claude attribution/review.
Original queued requests1284/1285 withdrawn and archived; channel1286 records cancellation.
Incremental recovery source integrated without overwriting unrelated Cursor/source remainder.
This integration is not a Git commit or a claim that the whole shared tree is clean.

## Canary-derived blocking repair

2026-09-12T12:00:12Z: actual canary FAILED; no second run or fabricated result.
BLOCKS_CURRENT_DONE scope adds src/orchestra/prompt-god-template.ts and
tests/orchestra/production-wiring-prompt.test.ts: generated negative result examples
now satisfy the existing canonical ingress schema for both contract versions.
Red2/15 exit1 → green17 exit0; isolated tsc0; main digest-CAS integration.
This does not weaken acceptance or grant worker completion authority.
Worker-source review and verification scratch-space contract remain unresolved;
main observability28/29, test exit1. Current dist is stale; no product closure.

## Rejected schema result history — 2026-09-12 follow-through

BLOCKS_CURRENT_DONE write extension: result-ingress.ts, spawn-backend.ts,
spawn-backend-docker.ts, scheduler-effects.ts, sprint-controller.ts and exact
rejected-result/history tests. A host-schema-validated rejected result has an opaque
backend-issued reader; durable custody, provider exit, source digest, absence of an
accepted result and actual daemon absence must be reread before historical registry
retirement. Current/future/unknown run, changed identity, nonterminal owner, forged
reader, read error or daemon uncertainty remains HOLD. No task success or durable
receipt is manufactured; cold restart derives rejection from original custody.

Main 185/185 targeted tests exit0. Negative wiring examples now preserve the existing
pretty-JSON prompt contract (27/27 included); TypeScript noEmit exit0 in isolation.
The read-only worker image runs Vitest with its existing configLoader runner and
no-cache options; it reaches 28PASS/1FAIL (the real observability regression), with
no dependency-write authority. Next canonical task verification must declare these
flags. No Dockerfile or sandbox policy change is needed for this measured cause.

Legacy npm build stops E_CLEAN_TASK_ACTIVE on stale748 EXECUTING. Existing transactional
build is the canonical maintenance alternative (prior724 precedent), with source
snapshot, maintenance lease and fenced publication. First attempt rejected an
untracked node_modules/node_modules self-symlink absent from npm-shrinkwrap. That
single symlink was moved intact to the external recovery evidence archive; no
dependency, task, checkpoint, result, auth or memory bytes were removed. Second
transactional core build is being observed; native rebuild is not claimed.

Evidence: external recovery-preparation/rejected-result/verification.json and
candidate.patch sha256:209fa590a8603cbeddfc8e7743b72e5c0a6d7493d846adea7b6f0b5c6f215d1a.
Formal XVerify unavailable/HOLD; 748 remains FAILED and worker source REVISE.

Transactional core build completed exit0, run44dd58bc-2b1c-48e8-93dd-4e7e6c042446;
9 protected files reread with zero drift. Retention follow-up official plan in progress;
implementation scope four observability source/test files, no extra engine recovery
repair is implied. Source main185PASS; production recovery remains pending real fan-in.


### Gerçek devam sınırı — 2026-09-12T12:54:47.797236+00:00

- Plan749 (`a3ccea01-018e-4552-9bf2-6ece912585aa`) Astra'nın taşıdığı eski
  iki-dosya açıklaması ile yeni dört-dosya kapsamı çeliştiği için dispatch öncesi
  canonical `runs --retire` ile CANCELLED edildi (exit0). Önceki `--reject`
  APPROVED state'te geçersizdi; `--retire --reason` de desteklenmiyor (ikisi exit1).
  Bu başarısız komutlar ve asıl retirement kanıtları korunuyor.
- Düzeltilmiş plan750, Flow `0a28059e-9119-4b8c-a2e6-d2af0620d375`, plan SHA
  `ac718d7aa19c6e4546830326a2ca5652d3e47f2fbc15424ad08c401f270e38c2`, resmi
  structured plan exit0, scope/topology PASS; model router tarafından Terra.
- `runs --start --yes` dış CLI **exit0**, fakat gerçek Flow
  **FAILED at2026-09-12T12:52:11.649Z**. **Worker başlamadı.**
  Detached log: `Orphan sprint detected: sprint-748 (PID 414453 is dead)`.
  Child exitCode ayrıca okunmadı; Flow ve log kanıtı esas.
- `src/cli/commands/start.ts:358` preflight yeni controller uzlaştırmasından önce
  kesiyor. Yeni schema-rejection recovery'nin gerçek runtime fan-in kanıtı henüz
  yok. CLI terminal/liveness ayrımı ve yanlış dış exit0, Cursor'ın mevcut start
  görevine ENTRY216 ile eklendi; SHA
  `6ebc41baf6fdc68f21ed03ae17372a389f9fbe3cf690a67465a021686a1e3cb4`.
  Dosya sahipliği çakıştırılmadı. Auto-archive/force/kill/cleanup uygulanmadı.

**Devam noktası:** Cursor215/216 consolidated preflight/exit düzeltmesi ve exact
kanıtı → Astra incelemesi → güvenli build sınırı → yeni official execution denemesi.
Aynı hata ile yeni run yaratılmayacak. Zorunlu runtime cleanup ortaya çıkarsa exact
manifest ile owner gate olarak ayrılacak; eski failed kayıtlar success yapılmayacak.
Recovery hâlâ DEGRADED/HOLD. Main mixed dirty; core build yeşil, native/dashboard
rebuild yok, commit/push yok. Formal cross-provider XVerify unavailable/HOLD.


### Opus5 gerçek XVerify sonucu — 2026-09-12T14:53:39.615776+00:00

Canonical `deckent xverify`, codex/gpt-6-astra → claude/claude-opus-5, tek çağrı
tamamlandı; CLI exit0, **verdict UNCLEAR / host HOLD**. Exit0 burada PASS değildir.
Invocation attempt3ad906b7-31f0-801e-9bf4-066859f894ea; provider-reported kullanım:
6 turn, input12 + output12044 + cache-read102214 + cache-write37894 =152164 token.
Canonical readCrossVerifyVerdictReceipt + readClosedTaskResultSettlement yeniden
okundu (exit0): digest MATCH, terminal settlement CLOSED. Receipt:
`cross-verify-verdict:sha256:19f699255d37a61dad6d4690f50f113a21ede27cc88c7db63e3f0cbf19a54654`.
Bu doğrulama operasyonunun kapandığını kanıtlar; reviewed ürünün tamamlandığını
kanıtlamaz. XVerify artık unavailable değil, **çalıştı ve HOLD verdi**.

Opus sunulan kaynakta opaque reader, exact identity/digest reread, kabul edilmiş
sonuç yokluğu, daemon absent ve registry/lifecycle tekrar kontrolünü destekliyor.
Ancak daha geniş cold-restart ve CLI caller kanıtı sunulmadığı için sonuç
undecidable; yazdığı missingRequirementIds mevcut sunulan kanıt haritasıyla
uyuşmadığından host da HOLD tuttu. Bu bir kaynak PASS/REVISE sonucu sayılmaz.

İzlenecek açıklar:
1. Gerçek yeni-process cold recovery ve gerçek controller fan-in kanıtı. Mevcut
   test adı cold olsa da fixture replay gerçek restart kanıtı değildir.
2. detectOrphan/archiveOrphan/listPidFiles ve CLI caller/exit zinciri, canonical
   güvenli preflight sırası. Cursor215/216 hâlâ bekleyen; terminal owner pause.
3. Daemon absent gözlemi sonrası container reappearance yarışının existing
   generation/termination contract ile kapanıp kapanmadığının exact kanıtı.
4. candidateUnprovable asimetrisi için Opus eksik tanım istedi. Astra salt-okuma
   kontrolü: sprint-controller.ts:1748-1752'de candidateUnprovable, candidateOrdinal
   null ise true; rejected branch1859+ non-null ordinal gerektiriyor. Dolayısıyla
   yalnız bu koşulun yokluğu bypass kanıtı değil. Bu Astra analizi, Opus PASS değil.

Aynı istek tekrar edilmedi; Opus limiti korunuyor. Kaynak snapshot drift:0.
Dosyalar: docs/execution/evidence/astra-recovery-20260912/xverify-result.json,
xverify-adjudication.json, xverify-durable-reread.json ve source snapshotları.
communication.md kullanılmadı; Cursor219 tüketildi, toparlama/pause ENTRY220 ile
korundu. Yeni kod, run, build, cleanup, commit/push yapılmadı.


### Ana iş yeniden-kurma kanıtı — 2026-09-12T15:05:14.604790+00:00

Cursor219 tekrar iletimi duplicate; tekrar tüketilmedi, terminal pause/toparlama
korunuyor. Ana işte iki ayrı gerçek Node süreci748'i exact authority olarak buldu
(exit0/0). Bu yalnız discovery; cold rejection retirement/settlement kanıtı değil.
Kalıcı completion→canonical acceptance→typed rejection→recovery inventory kaynak
zinciri bulundu; Opus'a sunulan kesit dışında kalmıştı. Daemon absent, stopped
anlamına gelmiyor: mevcut stopped container da present/HOLD.

Gerçek readonly planning health **exit0 / HOLD**, yalnız748-001
STARTED_ATTEMPT_RECONCILIATION_REQUIRED (15:03:42.373Z). Bu nedenle önceki
“CLI teslimi → hemen run” sırası tek başına yeterli değil. Önce Astra engine
readiness/historical-rejection authority sözleşmesini uzlaştıracak; sonra CLI aynı
canonical kararı tüketip gerçek cold fan-in ve worker continuation kanıtı alınacak.
Kayıtlar success yapılmayacak, sağlık kapısı atlanmayacak.

Source-only ek bulgu: sprint-pid-manager.ts:550 global sprint-state'i orphan
sprintId ile eşleştirmeden arşivlemeye çalışıyor. Kullanmadığımız autoarchive
yolunda RELATED_BUT_NONBLOCKING; böyle bir remedy önerilirse blocker.
Kanıt/sonraki dilim: docs/execution/evidence/astra-recovery-20260912/post-opus-analysis.md
ve planning-recovery-health.json, cold-discovery-summary.json. Source/runtime/auth
mutation veya yeni provider çağrısı yok. Recovery ve formal XVerify HOLD sürüyor.


Owner instruction 2026-09-12T15:14:23.517949+00:00: close748/749/750, no751, consult before new code.
Fresh evidence and proposed bounded closure/readiness repair now live in
RECOVERY-DO-DOGFOOD-001-REPAIR-PLAN.md. This is PROPOSED; no implementation or
archive operation was executed in this inspection. Temporary status report is
not execution authority. Existing plan paragraphs are historical until reconciled
with this fresh proposal and the next owner decision.
