# R4 — 757 sonrası readonly Docker deadline ve dispatch onarımı

MASTER 3178 / parent 120 OPEN. Owner 2026-09-13 devam onayı; recovery PACKAGE.json. İzole worktree `/tmp/deckent-r4-757-repair`; altı dosya baseline SHA eşleşmesiyle main'e alındı. Commit/push yok.

## Davranış

Volume/image inspect sorgularının production adapter yolu artık aynı bounded runner'ı ayrı observation thread içinde çalıştırıyor. Mutating komutlar ve custom runner injection aynı yolu koruyor. Timeout kill isteğinden sonra child close gelmeden sonuç dönmüyor. Scheduler admitted generation hatasını transient retry saymıyor; owning backend ve asıl failure korunarak EXACT_DISPATCH_HOLD yükseltiliyor, hatalı private IPC polling'e devam edilmiyor. Gate veya Store receipt kuralları gevşetilmedi.

Kaynak: src/orchestra/exact-docker-container-observation.ts:16; exact-docker-workspace-command.ts:114; spawn-backend-docker.ts:3616; scheduler-effects.ts:3039. Hash'ler LANDING.json ve MANIFEST.json.

## Kanıt

- İlk test paketi:119 PASS +1 FAIL, exit1. Aynı retry testi değişiklik öncesi source ile de FAIL/exit1: baseline-retry.log. Pre-existing test onarılmadı.
- Bu mevcut kırmızı hariç119 test PASS, exit0; ek scheduler/dispatch54 test PASS, exit0. Toplam173 ayrı test PASS; excluded1 açıkça korunur.
- tsc exit0; isolated build exit0; main build exit0. Genel repo-green iddiası yok.
- Gerçek Docker volume absence: önceki binary controlled12s host blockage altında statusnull/errortrue; repaired binary aynı şartta Dockerstatus1/errorfalse/no-such-volume. real-volume-probe.json.
- Gerçek Docker client + yanıt vermeyen yerel test socket'i:250ms deadline, gözlenen287ms; statusnull/errortrue, thread/child kapanışı beklendi. real-timeout-probe.json. Gerçek timeout bastırılmıyor.

## 757 recovery

Canonical recover preview exit0, ardından `recover sprint-757 --force --json` exit0. Beş task residue ve checkpoint korunmuş; status ABORTED/activefalse/coordinatorabsent/conflicts[]. Task-level yarım accepted/compensation zincirlerinin başarı settlement'ı iddia edilmez; yeni canonical giriş bunları yeniden değerlendirir. Recovery default self-audit'i de çalıştırdı: genel GATE_FAILURE (ertelenmiş ayrı iş). Bu çağrıda --skip-audit kullanılmaması gereksiz genel test maliyeti yarattı; sonraki recovery bu owner-ertelemesini kullanacak. Genel self-audit onarım doğrulaması değildir.

## Gerçek dogfood dönüşü — 758 başarısız

UTC 2026-09-13T15:40:26.621882+00:00. Flow `99f90f6a-5a30-4215-bda1-334b995a5886`: START_REQUESTED 15:25:17.595Z → RUN_FAILED 15:31:34.013Z, RUN_STARTED yok. CLI exit1, toplam398.445s. Hata `EXACT_RUNTIME_FAILED_BEFORE_ADMISSION:DECKENT_E091:spawn-backend-recovery-hold`. Yeni worker başlamadı. Tek canary bütçesi tüketildi; aynı koşu tekrar edilmedi. 758-SUMMARY.json ve 758-start.log.

Koordinatör sampled HWM 4722708KiB; CPU profiler kapalı. Worker kaynak ölçümü yok, eski profiler-açık koşuyla performans kazancı kıyası yapılmaz. Genel error, exact held-attempt listesini taşımıyor: 757003'ün tek758bloker olduğu iddia edilmez.

## Recovery seam eksik wiring düzeltmesi

758 sonrası kod incelemesi: `ensureExactDockerPreProviderContainerAbsent` ve compensation volume inspect yolu lifecycle adapter dışında kalmıştı. Gerçek757003 container adı idle146ms'de status1/errorfalse/absenceTRUE; kontrollü12s mainloopblokajı sonrası aynı Dockerstdout+stderr statusnull/errortrue/absenceFALSE. recovery-inspect-probe.json.

Aynı R4 kaynak kapsamında observation runner constructor ve lifecycle adapter ortak çözümüne bağlandı; tam container inspect de read-only allow-list'e eklendi. Container/volume silme ana sahipli command yolunda; receipt, mount ve exact-identity kapıları aynen korunur. Custom runner identity korunur. Kaynak: src/orchestra/exact-docker-container-observation.ts `resolveExactDockerObservationRunner`; spawn-backend-docker.ts constructor, lifecycle adapter ve pre-provider container gate.

110 hedefli test PASS/exit0 (önceki173'e eklenip unique toplam diye sunulmaz), tsc0, isolatedbuild0. Repaired gerçek757003 absence probe12s blokaj altında status1/errorfalse/absenceTRUE, exit0. Üç scoped dosya baseline SHA match ile main'e alındı: RECOVERY-SEAM-LANDING.json. Main build sonucu ayrıca CHECKPOINT.json'a kaydedilir.

Bu ek düzeltme sonrası yeni full start/recovery çalıştırılmadı. Formal XVerify unavailable/HOLD. MASTER3178/parent120 OPEN; parallel8 fan-in, 757001 partial settlement ve 757003 compensation canonical doğrulaması hâlâ gerekli. 15/30 ölçeğe geçilmedi. Startup/full recovery history taraması ile terminal-only reaper ayrıdır: `reconcileExactDockerCustodyAdmissions` terminal-only modda doğrudan return eder; bu yol global scan nedeni olarak gösterilmez.
