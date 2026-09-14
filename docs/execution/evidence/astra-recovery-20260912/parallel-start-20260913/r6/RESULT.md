# R6 — 758 start: aşamalar, tıkanmalar ve kaynak ölçümü

UTC 2026-09-13T17:50:36.839580+00:00. MASTER3178 / parent120 OPEN. Yeni flow `b7f53da8-ba6d-45b1-90bd-d70eae56f20c`; sprint numarası 758 yeniden kullanılmıştır, önceki başarısız flow ile aynı koşum değildir.

## Sonuç

Canonical `node dist/cli/entry.js start --auto-approve`: exit1. Monotonic süre **1974.327s / 32dk54s**. `RUN_STARTED` ardından `RUN_FAILED`. 3 provider exit0, scheduler **0/8 collected**; yalnız002 altı-stage zincir taşıyor fakat kabul kriterleri0/7decided, CONFIRMATION_MISSING, enforcedfalse. ÜrünDONE ve XVerify yok. Son gözlemde canlı coordinator/worker yok. Yeni retry yapılmadı.

## Zaman çizelgesi

Aşağıdaki aralıklar UTC receipt farkıdır; gerçek CPU süresi değildir. Kaynak ölçümü toplamı monotonic clock kullanır. UTC launch→exit1903.192s, monotonic1974.327s; **71.134s saat uyuşmazlığı** vardır. Nedeni ölçülmedi; NTP/host clock adımı varsayılmadı. Bu nedenle UTC aralıkları tam wall-performance benchmark diye sunulmaz.

| Aşama | UTC | Receipt farkı / durum |
|---|---|---|
| CLI launch |17:15:45.107| monotonic başlangıç |
| Proposal / preview |17:16:00.041→17:16:00.095|54ms; structured, AI planlama ölçümü değil|
| Approval→start request |17:16:00.154→17:16:00.265|111ms|
| Start request→run admission |17:16:00.265→17:27:23.034|682.769s /11dk23s|
| Run admission→ilk provider |17:27:23.034→17:29:17.826|114.792s /1dk55s|
| 758-001 Sol |17:29:17.826→17:33:47.257|269.431s /4dk29s; exit0|
| 758-002 Terra |17:30:17.233→17:32:57.740|160.507s /2dk41s; exit0|
| Terra exit→effect/accepted |17:32:57.740→17:34:51.320|113.580s /1dk54s|
| Terra accepted→evaluation |17:34:51.320→17:36:20.674|89.354s /1dk29s|
| Terra evaluation→finalizer |17:36:20.674→17:36:26.126|5.452s|
| Terra finalizer→settlement |17:36:26.126→17:36:32.900|6.774s|
| Terra settlement→archive |17:36:32.900→17:36:51.366|18.466s|
| Sol exit→capture HOLD |17:33:47.257→17:39:20.071|332.814s /5dk33s|
| 758-003 Sol |17:40:16.993→17:46:13.404|356.411s /5dk56s; exit0|
| Outer RUN_FAILED |17:47:26.667|EXACT_TERMINAL_AUTHORITY_HOLD:758-001:EFFECT_FINAL_CAPTURE_HOLD|
| CLI exit1 |17:47:28.300|monotonic32dk54s|

003 provider başladıktan sonra EXECUTE IPC abort görüldü; log satırının kendi UTC damgası yok, polling aralığı exact event time değildir. 004–008 materialize/provider start olmadı. Runtime sonrası001/002/003 task JSON hâlâEXECUTING; outerflowFAILED. Terra archive→son gözlem yaklaşık12dk projection gecikmesi, terminal semantik uyumsuzluğu.

## Onarımın gerçek kazanımı

757-003 ürün startup recovery'siyle 17:22:34.275Z `NOT_DISPATCHED / PRE_MOUNT_ABORTED` terminal authority kazandı. Receipt `sha256:4b5c6a47a16df065d868718204dfc20e40e56591bf01fd9e9625b6582c204078`. Provider/mount/daemon effectABSENT kanıtı bağlandı. Elle receipt/task yazımı yok. Dosya `757-003-terminal.json`. 757-001'in eksik accepted/evaluation zinciri kapanmış iddia edilmez.

## Blokerler ve kod yolu

1. **BLOCKS_CURRENT_DONE / final capture çalışmıyor:** 758-001 effect-diagnostic17:39:20.071Z: FINAL_CAPTURE→FIRST_CAPTURE/HELPER_RUN→ADAPTER_UNAVAILABLE. Model exit0 sonucunu host güvenle alamamış. `spawn-backend-docker.ts:3774` helper komutu;`:3783` başarısız non-populate sonuçta generic HELPER_RUN. Timeout60s (`:2699`), ancak durum/timeout/overflow/exit ayrımı bu diagnosticte yok. Gerçek timeout olduğu kanıtlanmadı; aynısını tekrar ederek çözülmüş sayılmaz.
2. **BLOCKS_CURRENT_DONE / hata aktarımı:** `spawn-backend-docker.ts:19149` capture-hold halinde canlı completion kaydını temizliyor; `:14180` IPC resolver completion yoksa PRIVATE_IPC_AUTHORITY_UNAVAILABLE döndürüyor. `scheduler-effects.ts:1312` aynı genel hata yolunu taşıyor; `result-collector.ts:2968` ilk IPC HOLD'da tüm collection'ı kesiyor. Disk captureHOLD IPC'den önce; mekanizma uyumlu, hangi process-local map branch'inin alındığı ayrıca instrumentation olmadan kesinleştirilmedi. R4 dispatch-failure onarımı bu completion/capture yolunu kapsamamış.
3. **BLOCKS_CURRENT_DONE / sonuç-projection parity:** Terra'da altızincir varken0/8collected veEXECUTING. `evaluationSnapshot` DONE kararı acceptance0/7ilekarıştırılmamalı; CONFIRMATION_MISSING. Scheduler fan-in/visible status terminal custody'yi tutarlı yansıtmıyor.
4. **BLOCKS_CURRENT_DONE / sonlandırma:** EXECUTEabort sonrası üçüncüworkerçalıştı, outerterminal daha sonra geldi. Abort zamanı logdaUTCyok; kesin abort→terminal süresi bilinmiyor. Container çıkışı tekbaşına successful cleanup değildir.
5. **BLOCKS_CURRENT_DONE / log kaybı:** üçüncücontainer `docker logs`30000mstimeout,captureIncomplete=true,0bytepartial. NihaiCLIhatasından sonra loglandı; debugcopy'nin loss bildirimi var amaworkerlogproofeksik.
6. **RELATED_BUT_NONBLOCKING / performance:** admission11dk23s, host sonuç işlemleri provider süresini aşıyor. Önceki history amplification callgraph ve bu koşumCPU birlikte ele alınmalı; bu run'da function-level CPUprofili yok. Güvenlik doğrulamasını kaldırma veya `.tasks`'a taşıma çözüm diye kanıtlanmadı.

## Kaynaklar

Coordinator sampled peak4211448KiB=4.02GiB; sonCPU1656.97s (~27dk37s), process totalmonotonic32dk54s. Sol001 peak1.614GiB/%196.73CPU, Terra0021.753GiB/%159.01, Sol0031.615GiB/%180.95. DockerCPU%100 yaklaşıkbirlogicalCPU; peaks aynıan değil, toplanmaz. 5sörnekleme gerçek kısa peak'leri kaçırabilir. Modelin uzakinferenceCPU/GPU/RAM'i unavailable. KaynakID→attempt eşleşmesi timeline.json'da. Plan8task; fiilen ençokikiworker container gözlendi.

## Sıradaki bağımlı onarım

Önce helper failure'ın bounded typed exit/timeout/overflow/verdict kanıtını koru; rawsecretstderr basma. CaptureHOLD'u task result authority'de asılnedenle taşı, bitmişworker için IPCquestion yoklaması sonucu gizlemesin. Partialaccepted/archived sonuçlar collector ve görünürduruma canonical olarak yansısın. Abort→containment→terminal zinciri tamamlansın. Aynıpakette aynıkanıtla körretry yok; yeni exactscope ve proofcontract gerekir. Sonra history verification maliyetini kanıtlı invalidation/tamper/restart sınırları korunarak iyileştir. 15/30taskölçeği henüzuygun değil. MAINcodebuildbu koşumda değiştirilmedi; commit/pushyok.

Kanıt: timeline.json, resources.jsonl, SUMMARY.json, start.log, effect-diagnostic ve evaluation kayıtları; file SHA256 MANIFEST.json. Salt-okunur kanıt kopyaları product receipt üretimi değildir. R6 tekdeneme bütçesi tüketildi.
