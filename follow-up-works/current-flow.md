# GEÇİCİ AKIŞ — DOGFOOD CONTINUATION

> SSOT `docs/MASTER-PLAN.md` olarak kalır. Bu dosya yalnız owner-admitted continuation
> sırasını ve oturum ground truth'unu taşır; yeni work identity veya closure authority'si
> üretmez.

## Aktif karar

- `DOGFOOD_MODE=ON` — canonical control-block kararı:
  `owner-live-2026-08-23-repo-hygiene-complete-dogfood-on`.
- `WORKSPACE_MODE=MAIN`, `DELIVERY_MODE=DIRECT_MAIN`; execution ve analysis authority Codex'te.
- Aktif product run yok. Son outcome normal dogfood finalizer acceptance canary idi;
  `sprint-627` honest terminal `ABORTED` olarak settle edildi ve eksik debt kanıtı typed
  recovery seam'inde elle tamamlandı.
- Runtime hygiene formal different-provider XVerify, owner kararıyla
  `2026-08-24 20:00 Europe/Istanbul` sonrasına ertelendi; bu sınırdan önce formal
  runtime-hygiene DONE/Closure iddiası yok.

## Fresh başlangıç ground truth'u

- [x] `HEAD == origin/main == 6cc1835e93bd2a579c735e9cc30b4a2c3d99ea54`;
  worktree başlangıçta clean; landing `feat(runtime): land canonical archive and hygiene authority`.
- [x] Sprint-625 terminal authority: `ABORTED`, coordinator absent, active=false,
  resumable=false, terminal receipt consistent.
- [x] Broker-native pending approval yok; bot daemon PID 2946124 ile çalışıyor.
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
- [x] Canonical archive acceptance: 68/68 artifact verified; manifest digest valid; missing,
  mismatched, untracked ve conflict yok; live `.tasks` sprint-627 residue'su 0; legacy
  `.brain/archive/sprints/sprint-*-tasks` ve `.tasks/archive` baseline'ları değişmedi.
- [x] Brain compact `archive-sprint-627` row'u ve guarded exports yenilendi; ikinci applied
  reconcile `published=0`, DB digest unchanged verdi.
- [x] Eksik provider-observation compiled-consumer ölçümü gerçek binary ile green:
  schema v2 current, 1017 row. İki injected debt canonical olarak `resolvedInSprintId=sprint-627`
  ile kapandı; archived task/run truth'u geriye dönük değiştirilmedi.
- [x] FIX non-dispatch RCA `RUNFLOW-001` evidence'ına owner-admitted finding olarak eklendi:
  `do --run` ve `runs --start` aynı exact-start service'ine converge ediyor; gap, injected
  directory read-scope → exact repair-authority HOLD → PAUSED fix → empty recovery queue zincirinde.

## Owner-admitted continuation sırası

1. Manual spawn ile sprint executor arasındaki final-only usage containment parity gap.
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

## Sıradaki multi-task dogfood package — manual spawn parity

Run ID canonical allocator/config authority'den plan anında çözülür; bu dosyada ID yazılmaz.
Package owner outcome'u final-only usage containment'ın manual `deckent spawn --force` ile normal
sprint executor arasında tek authority olmasıdır. Measured code truth: `spawnWorkerMultiProvider()`
ve Docker backend typed `finalOnlyUsageContainment` alabiliyor; sprint spawner task'ın immutable
`budgetPolicy.finalOnlyUsage` grant'ını geçiriyor, manual CLI registration ise aynı task projectionını
okuduğu halde grant'ı call options'a taşımıyor ve provider work öncesi fail-closed HOLD oluyor.

Önerilen dependency waves:

1. Wave A — paralel, read/evidence:
   - ingress inventory: manual spawn, sprint scheduler, retry/FIX/continuation ve xverify producer →
     consumer zincirlerini exact source references ile ölç;
   - policy/provenance inventory: task snapshot digest, role, tenant/run/attempt/deadline binding ve
     replay/expiry negative-space'ini ölç;
   - conformance inventory: mevcut Docker final-only, manual-spawn, settlement ve real-process test
     matrisini çıkar; eksik normal/hang/child/missing-final/replay/crash vakalarını say.
2. Wave B — Wave A çıktısına dependency-bound implementation:
   - tek shared resolver ile provider live-usage capability ∧ immutable task policy ∧ owner grant
     kesişimini üret; manual ve sprint adapters yalnız thin wrapper olsun;
   - manual `spawn --force` consumer'ını aynı resolver, dispatch-boundary receipt, wall-clock minimum
     timeout ve exactly-once terminal settlement'a bağla;
   - retry/FIX/continuation yollarının mevcut shared authority'yi kullandığını parity ratchet ile
     kanıtla; ikinci grant veya surface-local fallback üretme.
3. Wave C — closure proof:
   - hermetic parity/adversarial battery ve every-environment process-tree adapter contractı;
   - owner-authorized bounded real-binary manual-spawn canary, canlı PID/log/receipt/usage izlemesi,
     sıfır orphan ve replay fail-closed kanıtı;
   - docs/MASTER (`FO-03`→`FO-11`, özellikle `FO-05`) truth-sync. Formal verifier gerekiyorsa output
     producer'dan farklı provider; unavailable ise typed HOLD.

Package aynı task üzerinde iki worker veya tek-task Deckent run'ı üretmez. File-collision ve gerçek
dependency nedeniyle boş kalan worker slotları zorlanmaz.

## Korunan authority

- `.brain/memory.db` silinmez veya taşınmaz.
- `.tasks` içeriği `rm` ile temizlenmez.
- Credentials, auth, token, key ve live DB/WAL/SHM authority'si mutate edilmez.
- Aktif run sırasında build veya provider auth mutation yapılmaz.
- XVerify her zaman output producer'dan farklı provider ile yürütülür.
