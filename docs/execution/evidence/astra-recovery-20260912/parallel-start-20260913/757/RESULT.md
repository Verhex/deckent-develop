# Start757 — iki gerçek worker, sonraki dispatch başarısız

MASTER3178 / parent120 OPEN. Owner start-first + Sol/Terra/Luna + paralel ölçüm kapsamında. 2026-09-13 UTC. Ürün closure veya XVerify değildir.

## Sonuç

Flow `21f8d03d-2a44-4b29-b8ee-c03be0f16493`, sprint757, CLI PID171674, exec79932. Komut `node --cpu-prof --cpu-prof-interval=10000 --cpu-prof-dir=/tmp/deckent-start757-20260913 dist/cli/entry.js start --auto-approve --timeout 1800000`. Ölçüm observer'ı kaynak envanteri dışında `/tmp` kullandı; canlı repo log mutasyonu yapılmadı. Sonuç CLI exit1, monotonic elapsed1726.145s (28dk46.145s). RUN_FAILED14:58:14.573Z; coordinator çıkışı14:58:18.247Z. Süre için monotonic observer esas; host UTC düzeltmeleri olabilir.

Plan8 bağımsız documentation/analysis task, effectiveConcurrency2; 15/30 koşulmadı. Sol/Terra gerçekten başladı; Luna henüz başlamadı. Bu, 8 paralel worker veya başarılı8-task fan-in kanıtı değildir.

- 757-001 Sol: provider-start14:38:57.642Z, provider-exit14:49:07.084Z, exit0. İki chain kaydı: effect-landing + accepted-result. History raporu main'de. Evaluation/finalizer/settlement/archive yok; **PARTIAL / settlement HOLD**.
- 757-002 Terra: provider-start14:39:57.355Z, provider-exit14:42:41.182Z, exit0. Altı chain aşaması var, archive occurredAt14:46:34.640Z. Timers raporu main'de. Engine evaluation DONE, fakat contractSummary decided0/total7 ve acceptanceDecision.enforced=false, CONFIRMATION_MISSING/acceptance pending. Engine DONE tam acceptance/product closure sayılmaz.
- 757-003: attemptc7030198-e27e-8a15-8cd5-427cc3278277 admitted, provider-start yok; compensation prepared, dispatch terminal yok; reconciliation MOUNT_RECONCILIATION_REQUIRED/NOT_ATTEMPTED. Typed recovery gerektirir.
- 757-004…008 için exact attempt doğmamış; beş report placeholder. 757-003 dahil altı rapor henüz üretilmedi.

## Gerçek failure sırası

1. errors-at-exit.md: `14:49:35.909Z docker-backend:exact-effect-preparation-hold LIFECYCLE:VOLUME_INSPECT_MISMATCH`.
2. `14:50:03.651Z executeSchedulerDecision:spawn TASK_ATTEMPT_CUSTODY_HOLD:DISPATCH_TRANSITION_INVALID`.
3. `14:50:03.760Z runSprint:EXECUTE:aborted Task757-003 exact IPC HOLD: PRIVATE_IPC_AUTHORITY_UNAVAILABLE`.
4. Sonraki geçmiş taraması hata sonrası reconciliation'dır; RUN_FAILED14:58:14.573Z. Yaklaşık8dk11s hata sonrası bookkeeping/uzlaştırma. Ara yorumlarda bu tarama normal dispatch ilerlemesi sanıldı; **bu nihai zaman çizelgesi onları düzeltir**.

Collector `0/8 collected` yazmasına rağmen iki report effect'i main'de; exact accepted/evaluation zincirlerini kaybetmeden collector/status authority ile uzlaştırmak gerekiyor. Son persisted canonical status ACTIVE/coordinator alive,total3,done0,active2,blocked1; publishedAt14:54:49.808Z. CLIprocess artık yok; bu eski projection canlılık kanıtı değildir. RUN_FAILED ile stale ACTIVE çelişkisi korunur. Sprint terminal archive/cleanup tamamlandı iddiası yok; state elle mutate edilmedi.

## Dar tekrar üretim — gerçek Docker, readonly

`volume-inspect-deadline-probe.json`, komut exit0. Aynı production `runExactDockerWorkspaceCommand` ve aynı mevcut-olmayan exact workspace volume için:
- idle:143ms, Dockerstatus1, errorfalse, `no such volume` (doğru negatif);
- kontrollü12s ana event-loop blokajı: statusnull,errortrue,stderr boş (sahte timeout).
Bu, deadline yarışını gerçek Docker ile kanıtlar; özgün757 daemon çağrısının bütün ara stdout/deadline olayları kaydedilmediği için tek başına exact historical cause closure değildir. Kaynakta volume inspect10s ana event-loop runner'da; R3 yalnız container gözlemini ayrıthread'e almıştı. Volume EXPECT_ABSENT null gözlemi VOLUME_INSPECT_MISMATCH'e döner. Generic command timer close beklemeden finish(null,null) yapar.

Kaynak: src/orchestra/exact-docker-workspace-command.ts:24,112; spawn-backend-docker.ts:4096; execution-effect-docker-lifecycle.ts:3059. Dispatch fallback/IPC: scheduler-effects.ts:1313,2294,2320; result-collector.ts:2911. Reaper global recovery: result-collector.ts:2107,2813; spawn-backend-docker.ts:20869.

## Kaynak tüketimi

RESOURCE-SUMMARY.json: coordinator observed HWM5355476KiB≈5.11GiB (profiler flush dahil), son CPUuser1268.25s/system188.74s; logical rchar12.81GB, physical read4.09MB. CPU profiling10ms açık olduğundan profiler overhead/HWM dahil.

130worker örneği: Sol max sampled1717.248MiB≈1.68GiB, CPU203.41%; Terra1643.52MiB≈1.61GiB,CPU204.16%. Her worker limit6GiB. Bunlar örneklenmiş peak; eşzamanlı toplampeak değil. Provider aralıkları overlap≈163.827s; saf modelcompute değil, observed runtime intervalidir.

CPU-SUMMARY.json: native captured()640.269s sampledresidence,GC64.662s; safCPU veya tasarruf miktarı değildir. Rawmainprofile219MB dışarıda tutuldu; repo yalnız summary+hashmanifest. İkinci koşuda da nested native custody verification baskın aday.

## Worker rapor inceleme sınırları

Timers raporundaki5 kaynaksha canlıdiskle MATCH. History raporunun15:02Z beyanı worker-exit14:49Z'den sonra; güvenilir observationUTC sayılmaz. Worker prose authority üretmez. Formal XVerify unavailable/HOLD; Sol/Terra aynıprovider. Kriter0/7undecidable + no-files-changed rubric metni reportlanded olgusuyla uyumsuz; acceptance repair ayrı exact kanıt ister.

## Sonraki bounded sıra

1. 757'nin mevcut iki landed/accepted sonucunu koru; üçüncü admitted-not-released generation'ı canonical typed recovery ile disposition'a bağla. Yeni start/build/cleanup öncesi runtime authority sağlıklı olmalı; state elle yazılmaz.
2. Volume/image read-only Docker gözlemleri için deadline/output/process-close custody'yi host event-loop gecikmesinden ayır; mevcut runner injection/absence parsers/bounds korunmalı. R3 container çözümünü kör genel komut/kimlik/kill yetkisine genişletme. Delayed-exit/real-timeout/no-volume/daemon-unavailable matrisi + gerçekbinaryprobe + start fan-in kanıtı.
3. Dispatch failure fingerprint'ini koru: PREPARED/ambiguous generation IPC polling'e released gibi girmemeli; DISPATCH_TRANSITION_INVALID altında özgün mount failure kaybolmamalı. Unknown authority başarı veya absence yapılmaz. Exact interrupted preparation compensation ve terminal disposition birlikte kapanmalı.
4. Currenttask reaper/collector reconciliation'ını exact admitted attempt kapsamına alacak contract; startup/death recovery'nin geniş inventory/gate kontrolünü kaldırma. Profile-guided operation/proof-scoped tekrar azaltımı; persistent READY cache yok.
5. Aynı8task workload'u başarı ve canonical collector/effect/settlement tutarlılığıyla yeniden ölç. Kalan6rapor korunmuş iş; direkt15/30'a çıkma. Sonra kapasite/resourcebudget/DAG uygun15→30task; taskcount slotcount değildir.
6. Main/status erkeninvocation+queue visibility ve failed lifecycle publication: 8admittedtask total→spawned/queued ayrımı, coordinator death ve RUN_FAILED aynıauthorityprojection; ayrıDB/stateotoritesi yok.

Bu tur ürün source değişikliği, build, test-suite, commit/push, auth mutation, kill veya elle .tasks cleanup yapılmadı. Önceki build:all0 yeni paralel outcome'u doğrulamaz. Kaynakdar probe exit0, reporthashcheck0, gitdiffcheck ayrımanifestte. Genel self-audit GATE_FAILURE owner'ın ertelenmiş işi; acceptance çelişkisi onunla maskelenmez.
