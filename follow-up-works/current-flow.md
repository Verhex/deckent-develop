# GEÇİCİ AKIŞ — DOGFOOD CONTINUATION

> SSOT `docs/MASTER-PLAN.md` olarak kalır. Bu dosya yalnız owner-admitted continuation
> sırasını ve oturum ground truth'unu taşır; yeni work identity veya closure authority'si
> üretmez.

## Aktif karar

- `DOGFOOD_MODE=ON` — canonical control-block kararı:
  `owner-live-2026-08-23-repo-hygiene-complete-dogfood-on`.
- `WORKSPACE_MODE=MAIN`, `DELIVERY_MODE=DIRECT_MAIN`; execution ve analysis authority Codex'te.
- Aktif product run yok. Son run `sprint-628`, normal multi-task dogfood parity package'i
  olarak 7/7 logical DONE ve terminal `COMPLETE` settle edildi. Root acceptance sırasında
  test-only grant producer'ı reddedildi; canonical task-policy wiring typed recovery seam'inde
  post-terminal düzeltildi.
- Runtime hygiene formal different-provider XVerify, owner kararıyla
  `2026-08-24 20:00 Europe/Istanbul` sonrasına ertelendi; bu sınırdan önce formal
  runtime-hygiene DONE/Closure iddiası yok.

## Fresh başlangıç ground truth'u

- [x] Session preflight: `origin/main=6cc1835e93bd2a579c735e9cc30b4a2c3d99ea54`,
  local `HEAD=a29c9a8404264f54758dc21b627d1c5447c5b345` ile main bir commit ahead ve
  worktree başlangıçta clean; unpushed landing `fix(runtime): preserve retired plan identity after canary`.
- [x] Sprint-625 terminal authority: `ABORTED`, coordinator absent, active=false,
  resumable=false, terminal receipt consistent.
- [x] Broker-native pending approval yok; post-build restart sonrası bot daemon PID 3114591 ile çalışıyor.
- [x] İki pending Nervous scope-collision kaydı fresh disk truth'ta stale bulundu:
  payload yalnız terminal/retired 623/624/625 task lineage'larını hedefliyordu; kör accept
  edilmeden canonical reject disposition uygulandı ve pending inbox boşaldı.
- [x] MASTER generated active projection: 521 total, 456 active, 69 BLOCKED, 26 VERIFY,
  explicit READY=0. Declared dependency graph'ta 80 OPEN row dependency-satisfied veya
  dependency-free (26 P0 / 38 P1 / 16 P2); bu sayı gate/owner/time readiness iddiası değildir.
- [x] Retired approved-but-unstarted `sprint-626` identity'si canonical allocator state'inde
  tüketildi; normal plan authority sıradaki ID'yi `sprint-627` olarak ayırdı. Yeni ID elle
  yazılmadı.
- [x] `sprint-627`: beş bağımsız task tek dalgada/çoklu worker ile koştu; 4 original task
  tamamlandı, bir debt task `NO_GO`, onun fix'i repair-authority HOLD nedeniyle hiç dispatch
  edilmedi. Owner-authorized force-finalize unresolved lineage'ı koruyarak `ABORTED` yayınladı.
- [x] Sprint-627 archive manifesti kendi 68-artifact snapshot'ı için valid; live `.tasks`
  residue'su ve legacy raw write yok. Fresh inspect sonradan yazılmış 3 terminal event nedeniyle
  archived/live journal drift'i gösterdi; complete-archive acceptance artık HOLD.
- [x] Brain compact `archive-sprint-627` row'u ve guarded exports yenilendi; ikinci applied
  reconcile `published=0`, DB digest unchanged verdi.
- [x] Eksik provider-observation compiled-consumer ölçümü gerçek binary ile green:
  schema v2 current, 1017 row. İki injected debt canonical olarak `resolvedInSprintId=sprint-627`
  ile kapandı; archived task/run truth'u geriye dönük değiştirilmedi.
- [x] FIX non-dispatch RCA `RUNFLOW-001` evidence'ına owner-admitted finding olarak eklendi:
  `do --run` ve `runs --start` aynı exact-start service'ine converge ediyor; gap, injected
  directory read-scope → exact repair-authority HOLD → PAUSED fix → empty recovery queue zincirinde.
- [x] `sprint-628`: canonical allocator ile ayrılan 7-task DAG, ilk inventory wave'inin compiled
  prompt `filesRead` kaybı ve FIX-of-FIX/checkpoint/post-FIX aggregate recovery'lerinden sonra
  7/7 logical DONE, 19 attempt, 0 unresolved terminal receipt üretti.
- [x] Sprint-628 archive verify kendi 230 artifact snapshot'ı için green ve Brain compact row okunuyor.
  Ancak fresh inspect archived 123 event'e karşı `.deckent/recently-works` hot journalında 127 event
  ölçtü; archive sonrası yazılan seq 124-127 terminal eventleri yeni raw write ve 2 conflict üretti.
  Canonical complete-archive ve legacy-no-new-raw-write acceptance'ları HOLD.
- [x] Manual/initial-sprint/continuation final-only parity root audit'i, producer'ı olmayan test-only
  authorization wrapper'ını reddetti. Shared resolver canonical `task.budgetPolicy.finalOnlyUsage`
  tüketimine çevrildi; 74/74 scoped battery, lint/typecheck ve fresh-dist real-binary missing-grant
  canary green. Tenant/run/task/attempt/expiry
  single-use authority ile real-process FO-11 matrisi bu bounded slice'ın dışında OPEN.

## Owner-admitted continuation sırası

1. Finalizer'ın archive-sonrası terminal eventlerini canonical manifest/journal'a atomik dahil etmesi;
   sprint-627/628 conflict-free fresh inspect + verify canary.
2. Provider observation tarafındaki 19 unresolved interval'in authority-temelli reconciliation'ı.
3. `2026-08-24 20:00 Europe/Istanbul` sonrasında runtime hygiene different-provider XVerify.
4. D4 Approval Lifecycle formal XVerify/closure; ardından D5 retirement.
5. 7091 Cursor production image ve gerçek verifier smoke.
6. 7094 prefix/F2c measuredHitRatio ve provider-reported USD.
7. Closure OS: truth-sync → source/dist/provider adoption → owner disposition batches →
   7 günlük health/ETA → cleanup/migration → release.
8. Product surface ve MODULAR-BOUNDARY-FREEZE-001; fiziksel Core/Enterprise extraction yalnız
   dependency kapıları açıldıktan sonra.

## Her outcome için execution contract

`inventory → measured DAG → dogfood run → canlı PID/log izlemesi → scoped tests + lint/typecheck
→ real-binary proof → docs/MASTER projection → zamanı geldiyse different-provider XVerify → landing`

- Finding başka outcome'a aitse otomatik implement edilmez; owner admission için raporlanır.
- Production wiring producer → consumer → entrypoint → policy/config zinciri kapanmadan COMPLETE
  denmez.
- Commit/push owner tarafından bu continuation için yetkilidir; öncesinde `git branch -vv`,
  local/remote HEAD SHA ve scoped diff yeniden doğrulanır.

## Son multi-task package — manual spawn parity

Canonical allocator `sprint-628` kimliğini ayırdı; 3 paralel inventory → shared resolver → manual
ve sprint consumers → fan-in proof DAG'ı yürüdü. Worker sonucu ilk bakışta 7/7 terminal olsa da root
consumer audit'i, yalnız testlerin ürettiği schema-dışı authorization wrapper'ını yakaladı. Host
correction mevcut owner policy producer'ını tek authority yaptı:

- producer: `resolveExecutionBudgetPolicy` → `applyWorkerExecutionBudgetPolicy` →
  `task.budgetPolicy.finalOnlyUsage`;
- consumers: manual `registerSpawn`, initial `spawnWorkers`, continuation `executeSpawnTask`;
- backend: yalnız resolved Docker, exact nested grant; missing/mismatch/non-Docker typed HOLD;
- `maxUsd`: wall-clock grant yoluna girmez, separate incremental-pricing gate'te fail-closed;
- XVerify'ın mevcut auditor runtime-grant seam'i korunur.
- Fresh built CLI negative canary, grant'sız canonical manual taskı exit 1 ve
  `owner-authorization-missing` ile Docker/provider work öncesi durdurur.

Bounded parity slice LOCAL_VERIFIED'dir; full FO-05 tüm autonomous/process/xverify surface
convergence'ı, FO-04 durable single-use bindings ve FO-11 real-process matrix tamamlanmadan OPEN kalır.
Sıradaki dogfood package tek-task değildir: finalizer terminal-event ordering/reconciliation RCA,
normal+recovery terminal producers, atomic archive refresh ve iki archived sprint regression
kanıtını paralel dependency waves halinde işler.

## Korunan authority

- `.brain/memory.db` silinmez veya taşınmaz.
- `.tasks` içeriği `rm` ile temizlenmez.
- Credentials, auth, token, key ve live DB/WAL/SHM authority'si mutate edilmez.
- Aktif run sırasında build veya provider auth mutation yapılmaz.
- XVerify her zaman output producer'dan farklı provider ile yürütülür.
