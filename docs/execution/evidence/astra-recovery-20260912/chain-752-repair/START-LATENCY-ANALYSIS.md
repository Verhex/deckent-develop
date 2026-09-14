# Start gecikmesi ve sonuç tutarlılığı — canlı bulgu

MASTER3178 / parent120; canonical audit U02/U03/U04/U07. Bu bir ölçüm/onarım planı; yeni blanket cache veya runtime bypass uygulanmadı.

## Hangi yüzey ve önceki sonuç

752,753,754 denemeleri normal `node dist/cli/entry.js start --auto-approve --timeout 300000`. Do henüz çalıştırılmadı.
753 worker provider-start→exit160.707s, iki kaynak/test dosyası değişikliği +27/-41. Worker71/71 exit0; hostta bağımsız71/71 exit0. Effect→accepted→evaluation→finalizer→settlement→archive zinciri ve task verdict DONE. Outer start FAILED/ABORTED: scheduler terminal-result-authority-mismatch. Başarısız komut ile başarılı task farklı düzeylerdir; burada outer hata gerçek karşılaştırma kusurundan çıktı, yalnız UX ifadesi değildi. Recovery753 force exit0, artifakt digestleriyle arşivlendi; checkpoint korunur, geçmişFAILED tekrarCOMPLETE diye yazılmadı.

Gerçek753 backend reread: sealed accepted record null-prototype, terminal JSON ordinary object; deepStrictEqual false/canonicalJson true. Eklediğim strict karşılaştırma bu temsil farkını kaçırdı; production-like regression RED→GREEN,61/61. Scheduler artık backend'in aynı canonical içerik eşitliğini kullanır. Finalbuild0 sonrası754 bu düzeltmenin tek canlı confirmation koşumudur.

## Başlangıç neden dakikalar sürüyor

Kesin kod yolu:
1. `src/orchestra/sprint-controller.ts:2789`: yeni worker/PID authority oluşmadan `reconcileSpawnBackendBeforeRestore` çağrılır; helper:888→894 backend.reconcilePendingAttempts bekler.
2. `src/orchestra/spawn-backend-docker.ts:21000`: reconcilePendingAttempts exact custody admission recovery çağırır.
3. `:19699`: Store listDispatchAdmissionsForRecovery ile geçmiş keşfedilir. `:19718` civarı discovered.entries döngüsü her girişimi doğrular. `:19874` archive kontrolü de bu döngüdedir.
4. `:18628`: readExactArchivedAttemptDisposition bütün TASK_ATTEMPT_CUSTODY_CHAIN_STAGES için readChain yapar; predecessor/identity kontrollerini yeniden yürütür. Böylece kapanmış tarihçe de başlangıç kritik yolunda maliyet üretir.
5. `:19703` deadline yalnız discovery input'udur. Sonraki async fonksiyon içindeki senkron Store okumalarının bütününe deadline yayılmaz. CLI timeout ayrıca EXECUTE kapsamındadır; tüm admission/planning süresi değildir (auditU03).
6. AI proposal yolunda da `run-proposal-compiler.ts:230`→`spawn-backend.ts:1384` planning recovery health bulunur. `spawn-backend-docker.ts:5586` ve devamı kendi geçmiş taramasını yapar. Aynı semantic kontrollerin plan/execute/recovery/terminal read yüzeylerinde tekrarlanması ayrıca incelenecek.

Ölçümle uyum: 754 ilk165s içinde160.6 CPU-s, worker henüz yok;250s'deRSS~3.3GiB;355s'de~4GiB. İlk worker örneği ~7dk civarında. 753 coordinator16:11elapsed içinde12:48CPU,8.83GB logical reads; fizikselread1.63MB, yani ağırlık disk beklemesi değil cache/CPU okuma-doğrulama işidir. Sonraki gözlem en az5.78GiB RSS/HWM. Worker~2:41 çalışırken totalstart~20dk üzeri. Bu oranlar kaynak ve terminal örneklerine bağlıdır; syscall/JS function bazında CPU dağılımı henüz profiler ile ölçülmedi. Memory leak iddiası yok.

`.tasks` temizliği bunu çözmez: uzun ömürlü otorite .local custody geçmişindedir ve korunması gerekir. Geçmişi silmek veya deadline artırmak çözüm değildir.

## Tutarsız görünümün ayrı nedenleri

- Task verdict DONE ile outerFAILED: scheduler temsil eşitliği kusuru (yukarıdaki onarım).
- Worker varken boş resource log/worker list: resource_monitor enabled5s, fakat default deckent-w- prefix; yeni exact container deckent-x-attemptId. resource-monitor.ts:57/:161, monitor-adapter.ts:52. İsim sonundan taskId türetmek de exact attemptId'yi yanlış etiketler (:102). Gerçek ölçüm sampleri task/run/attempt registry doğrulamasıyla birleştirilmelidir; yalnızprefix rename yetmez. Lifecycle decoder exactprefix bekler (execution-effect-docker-lifecycle.ts:49), recovery adları yeniden hesaplar (spawn-backend-docker.ts:19488).
- Uzun hazırlıkta sessizlik: pahalı reconciliation yeni Sprint/PID authority öncesindedir (controller:2771→2789). CLI/Terminal/Desktop ortak PREPARING aşaması ve ölçümü görünür olmalı; hazır/boş yüzey geçmişrun ile karışmamalı. Senkron CPU işi timer/heartbeat/status yayımını geciktirebilir; tam süreli event-loop-lag ölçümü henüz yok.

## Onarım sırası / kabul kanıtı

1. Mevcut754 canonical sonuç tutarlılığını kapat; başarılı task ve outer disposition ayrı raporlansın. Aynı başarısız fingerprint ile tekrarworker açma.
2. Ayrı salt-okunur profiler replay'inde startup recovery / list discovery / archive-chain / terminal reread maliyetlerini fazlara ayır. Gerçek yeni worker gerektirmeyen kayıtlı753 üzerinden ölç; aynı authority/güvenlik kontrolleri kullanılsın.
3. Mevcut Store proof sınırında tekrarlı okumayı tek işlem içinde paylaş; kapanmış geçmiş ve unresolved frontier maliyetini ayır. Kalıcı READY cache, mtime-only trust, eksik predecessor kontrolü veya gate kaldırma yok. R1-E snapshot adayı defaultOFF, native deadline/latency proof'u kapanmadan açılmaz.
4. Pahalı salt-okunur işi bounded execution adapter'ına ayırarak main event-loop responsiveness sağla. Bu tek başına toplam CPU maliyetini çözmez; UI canlılığı ve toplamlatency ayrı kabul ölçümleridir. Mutation/leadership authority root service'te kalır.
5. Start ve do aynı preflight/proof contractını tüketmeli. Plan/doğrulama/worker/settlement süreleri ayrı; totaldeadline ve cancellable/background akış mevcut budget authority'ye bağlanmalı, kullanıcı /renew ile altyapı arızası taşımamalı.
6. Resource/worker/status consumers canonical registry+verifiedlabels bağlamını kullanmalı; legacy+exact history birlikte okunmalı. Owner şu an kaynak verisi istedi, bu telemetry/adlandırma kodu canlı koşumda değiştirilmedi.

Kabul matrisi: boş/history-heavy store; terminal/unresolved/missing/tampered/sibling attempt; cold/warm restart; source/policy drift; worker absent/present; cancellation; observer lag; peakRSS+CPU+logical/physicalIO; Linux/WSL ve diğer adapterların honest unsupported davranışı. Başarı eskiauthority güvenliğini azaltmadan measured latency/visibility kazanımı olmalı. FormalXVerify yoksa unavailable/HOLD dürüst korunur.

UTC: 2026-09-13T11:01:03.039696+00:00
