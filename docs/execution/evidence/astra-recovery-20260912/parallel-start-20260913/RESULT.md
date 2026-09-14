# Start756 — paralel dogfood ölçümü ve geçerlilik sınırı

MASTER3178 / parent120 OPEN. Owner 2026-09-13 start-first, Sol/Terra/Luna ve 8→15→30 görevli ölçümü kabul etti. Bu rapor 2026-09-13 UTC disk/daemon/profile gözlemidir; XVerify veya ürün closure değildir.

## Sonuç

İlk proposal7efd5f6f-5321-491a-b6ba-2f1f3695bddd:14.408s,exit1,TOPOLOGY_HOLD; worker yok. Sekiz ayrı REPORT.md hedefi scope suggestion-adoption ile eski tracked canary REPORT.md'ye dönüştü. Topology collision gate doğru blokladı. Kaynak src/core/scope-gate.ts:568, src/orchestra/run-flow-plan-service.ts:844. Kanıt756-scope-failure.json. Özgün rapor adlarıyla yeni scope gate PASS/no resolutions; motor scope düzeltmesi yapılmadı.

Revised flow599d23f1-7ac8-439a-9e70-e5094330e937, sprint756:33dk54.343s, CLIexit0;0/8DONE,8NO_GO,provider-start receipt0. Canonical archive verifier32/32ok; terminal seal doğrulandı. Lifecycle COMPLETE yalnız koşunun kapandığını gösterir, görev başarısı değildir. Actual logicalProgress done0/blocked8. İlk dispatchler NOT_DISPATCHED/PRE_MOUNT_ABORTED, FIX bir kez yeniden denedi; sonraki kayıtlarda EXACT_DOCKER_RESTART_RECONCILIATION_REQUIRED görüldü. Worker throughput ve gerçek 2/8/15/30 concurrency kanıtlanmadı. Topology configuredMaxWorkers2/effectiveConcurrency2/four waves sadece plan kapasitesidir.

## Deney hatası — ölçümün kaynak kopyasına müdahalesi

Astra gözlemci dosyalarını repo içindeki evidence dizinine canlı yazdı. Gerçek workspace inventory bu dosyaları da içeriyor. Worker helper sourcePre→copy→sourcePost immutability kontrolü yaparken bunların değişmesi deneyin geçerliliğini bozabilir. Yakalanan gerçek helper stderr: exact-docker-population-failure:6:811, yani SOURCE_MUTATED_MID_COPY (spawn-backend-docker.ts:2758,3100,3148). Daemon helper exit78. Bu ordinal gerçek bir kopyalama reddidir; hata kaydındaki811 indeksini exact ham stdin inventory ile bağlamadan tek dosyanın kesin kök neden olduğunu ileri sürmüyoruz (workspacePlan inventory ayrıca sensitivity filtering taşıyor). Native image/loader/effect provider-free probe available; image topyekûn eksik iddiası yok.

14:15 civarında açık log inode'ları /tmp/deckent-parallel-start-20260913-live altına taşındı, repo yollarında sabit snapshot bırakıldı; ürün process'i kesilmedi. Kesin UTC observer-relocation.json. Sonuçtan sonra tam loglar kanıt dizinine kopyalandı. Başarılı755 karşılaştırması da aynı gözlemci kullanıldığı için workload/inventory farkı dikkate alınmalı; bu756 run, paralel altyapı genel olarak bozuk hükmüne yetmez. Sıradaki koşuda bütün canlı log/profiler/observer çıktıları kaynak envanteri dışında kalacak; raporlar terminalden sonra içeri alınacak. Yeni report/diagnostic dosyası aktif kaynak ağacına yazılmayacak.

## Gerçek performans bulguları

RESOURCE-SUMMARY.json:2034.343s CLIwall; hostHWM4658904KiB (~4.44GiB); son CPUuser1281.33s+system221.89s; logical reads18.26GB,physical read~736MB. Worker samples0. Provider zamanı bu koşuda yok, görev modeli yavaşlığı sonucu çıkarılamaz. Cleanup config180000ms ayrıca3dk.

CPU-SUMMARY.json ve CPU-NATIVE-STACKS.json:10ms CPU profiling. Native capturedFunction sarmalayıcısında714.542s örneklenen süre; bu doğrudan safCPU/wall eşitliği veya optimizasyon kazancı değildir. Stacks tekrar identity inspection ve fresh root/directory opening zincirlerini gösteriyor: native/exec-authority/index.mjs:3311→inspectNativeCustodyHandle/requireNativeCustodyPreIdentity; src/core/task-attempt-custody-posix-adapter.ts openFreshBoundRoot/openDirectoryComponents/readFirstWriter. Main+worker-thread profilleri ayrıntıda kaydedildi. Gate gevşetme veya kalıcı READY cache önerilmiyor; aynı operation/proof sınırındaki tekrarlı handle doğrulaması ölçülerek azaltılmalı.

## Onarım sırası

1. Ölçüm müdahalesi kaldırılmış aynı8 görevli start; kaynak envanteri/static baseline ve runbook net. Normal run başlamadan yanlış scope rewrite yok; provider/model seçimleri mevcutpolicy. 15/30 ancak gerçek task/provider/effect/settlement fan-in sonrası.
2. SOURCE_MUTATED_MID_COPY ordinal, adapterStage ve bounded attempts ayrıntısını üst failure/evidence yüzeyine kayıpsız bağla. Şimdiki ExactDockerPopulationCaptureAdapterErrorV1 alanlarını projectAdapterFailureDetail dışlıyor (spawn-backend-docker.ts:2906, execution-effect-docker-lifecycle.ts:1826). Yeni enum/failure dili ikinci authority yaratmamalı.
3. Native custody handle/identity ve tekrarlı tarihçe maliyetini ölçülmüş stackler üzerinden tek mevcut Store otoritesinde düzelt. U02; readonly function-level replay + gerçek start karşılaştırması.
4. U04: START_REQUESTED sırasında main status hâlâ755COMPLETE/revision3145 idi; status-during-admission.json. Erken invocation projection'ı eksik. COMPLETE/blocked8 ve retry-pending gösteriminin semantiği ayrı kabul matrisi.
5. Aynı no-dispatch failure değişmeden FIX redispatch yapılması ve no-effect recovery-entry HOLD davranışı; finite retry sınırı1 bu run'da korunmuş olsa da gereksiz maliyet var. Gerçek fail fingerprint ve stage uygunluğu üzerinden existing retry policy.
6. Kaynak izleyicilerinin exact worker identity'sine bağlanması, Auditor/Nervous, cross-process olay ve worker image parametrik inceleme:8 raporun mevcut görev kapsamları korunur; rapor üretilmedi, tamamlandı diye işaretlenmez.

## Sınırlar

Kaynak ürün kodu bu tur değiştirilmedi. Build/test çalıştırılmadı; önceki buildexit0. Pure parser/scope preflight exit0, image probe exit0, archive/terminal verifyexit0. No commit/push, auth mutation, elle .tasks temizliği, sahte receipt veya MASTER DONE yok. Canonical lifecycle cleanup tamamlandı, aktif756 process yok. Formal XVerify unavailable/HOLD. Global self-audit GATE_FAILURE ayrı owner işi.

## Güncel devam — Start757

Ölçüm izolasyonu düzeltilmiş8task koşusunda iki gerçekworker/report, üçüncü dispatchfailure, CLIexit1. Nihai zaman çizelgesi, kaynakmetrikleri, readonlydeadlineprobe ve recovery sırası: [757/RESULT.md](757/RESULT.md). 15/30 çalıştırılmadı;757 settlement tamamlanmadı.

## R4 devam kanıtı

Readonly deadline/dispatch ve recovery seam onarımı, 758 negatif canary ve açık sınırlar: [R4 RESULT](r4/RESULT.md). MASTER3178 OPEN; ürün kapanışı yok.
