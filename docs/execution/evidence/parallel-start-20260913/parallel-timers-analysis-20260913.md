# 758-002 — Lifecycle süre muhasebesi analizi

**Tarih:** 2026-09-13 UTC  
**Kapsam:** MASTER3178 / parent120 için yalnızca okunmuş kaynak ve korunmuş başarılı 755 kanıtının bounded analizi. Bu belge üretim değişikliği veya product closure değildir.

## Kaynak envanteri ve bütünlük

| Kaynak | SHA-256 | İncelenen referanslar |
|---|---|---|
| `docs/execution/evidence/astra-recovery-20260912/chain-752-repair/755-resource-summary.json` | `8d2377d01cc10fff338788d670fe439a10fbb2aa2a29786a4defe992b05e2d58` | tüm küçük JSON belge |
| `docs/execution/evidence/astra-recovery-20260912/chain-752-repair/R3-RESULT.md` | `2c98d3832022151f816c8f17f5869f969cef8896a09f11f45f7a0349cf8a3415` | satır 1–35 (tüm belge) |
| `src/orchestra/resource-report.ts` | `e075db4c28c7daceae2667587521016a519adaed4e3b241ef2c69dc0d64e3b80` | satır 1–150 |
| `src/orchestra/sprint-controller.ts` | `7cf1f955d385a39aa564281b869787621eb438e213203a0da25c47fbf63e5925` | satır 2610–2760, 3200–3540, 3760–3925, 4990–5030 |
| `src/orchestra/sprint-phases.ts` | `172ef81ed6aea45111385699d2e28b2632e52555b5cf22d150e723726d6d79c9` | satır 1360–1775, 2050–2170, 5070–5120 |

Satır aralıkları bağımsız olarak `nl -ba` ile bu attempt içinde okundu. İzin dışı kaynak, raw memory DB, secret, canlı runtime, test sonucu veya provider receipt okunmadı.

## Gözlemler (kanıt)

### Üç mevcut metrik farklı intervaldir

1. `755-resource-summary.json` içindeki coordinator exit kaydı `elapsedSeconds: 2216.7537978499995` bildirir: bu **CLI/coordinator wall interval** yaklaşık **36 dk 57 sn**dir. Başlangıç ucu bu özet dosyada ayrı bir start timestamp olarak verilmez; `elapsedSeconds`in hangi coordinator başlangıç noktasından hesaplandığı, yalnızca bu kanıtta daha ileri ayrıştırılamaz.
2. Aynı JSON `providerStartAt: 2026-09-13T12:12:10.913Z`, `providerExitAt: 2026-09-13T12:14:05.915Z` ve `providerReceiptIntervalSeconds: 115.002` bildirir. Bu, açıkça **provider-start → observed provider-exit** intervalidir; JSON `limits` alanı bunun “pure model compute” olmadığını belirtir.
3. `R3-RESULT.md` “Jobmetrics26dk49sn tüm CLIwall süresi değildir” der. Korunmuş dosyanın bu metrik için timestamp, producer, giriş ham kaydı veya formül içermemesi nedeniyle **26 dk 49 snin uç noktaları unavailable**dır. Bu rapor onu CLI veya provider süresine dönüştürmez.

Dolayısıyla 36:57, 115.002 s ve 26:49 aynı payda/pay ölçümü değildir. 36:57’den 115.002 s çıkarmak yalnızca yaklaşık 2101.752 s kapsanmamış coordinator/yaşam-döngüsü zamanı verir; intake, planning, admission, queue, verification, evaluation ve cleanup’a kanıtsız dağıtılamaz.

### Kaynakta görünen zaman tanımları ve zincir

| Yaşam-döngüsü parçası | Producer / kayıt noktası | Consumer / ingress | Kanıt ve sınır |
|---|---|---|---|
| Intake | Bu bounded kaynaklarda ayrı timer producer bulunamadı. | unavailable | `runSprint` girişinden önceki CLI/intake sınırı bu kapsamda tanımlı değil; ölçüm **unavailable**. |
| Planning | `runPlanPhase` planı üretir ve `sprint.startedAt = now()` atar; phase `PLAN/PLANNING` persist edilir. | controller plan checkpoint ve sonra SPAWN geçişi. | `src/orchestra/sprint-phases.ts:1604-1619`; başlangıç alanının dış tüketicisi bu okuma kapsamıyla doğrulanmadı. |
| Admission | Exact-plan materialization/CAS başarısızlığı pre-execution kabul edilir; başarıda coordinator snapshot etkinleştirilir. | `runSprint` devamı; başarısızlık lock/state/PID temizliğiyle throw olur. | `src/orchestra/sprint-controller.ts:3213-3233`. Bu bir admission failure boundary’dir, ayrı süre metriği değildir. |
| Provider routing / queue | `routeSprintTasksImpl` provider rotası yapar; spawn `spawnWorkers` çağrısından bir task queue döndürür. | `runSpawnPhase` dispatch evidence ve SPAWN→ACTIVE phase projection. | `src/orchestra/sprint-controller.ts:3235-3247`; `src/orchestra/sprint-phases.ts:1705-1719`. Queue waiting için burada timer alanı görülmedi. |
| Provider execution | Korunmuş özet `providerStartAt` ile `providerExitAt` arasını producer olarak taşır. | `providerReceiptIntervalSeconds`; R3 sonuç metni. | `755-resource-summary.json`; 115.002 s sadece bu iki uç arasındadır. Worker samples 24 adet ve ilk/son sample ayrıca 12:12:09.209408Z / 12:14:04.197142Zdir; sample aralığı receipt intervalinin yerine geçmez. |
| Host verification | Bounded controller parçası collected result için evaluate/settle fonksiyonunu çağırır; exact terminal authority varsa yeniden public evaluation kullanılmaz. | `evaluations` map ve settlement yolu. | `src/orchestra/sprint-controller.ts:3422-3495`; `src/orchestra/sprint-phases.ts:2089-2103`. Ayrı host-verification süre producerı/ölçümü okunmuş kaynaklarda yoktur. |
| Evaluation | `runEvaluatePhase` PID-bound evaluate lock alır, authority readiness kontrol eder ve evaluation map’ini günceller. | değerlendirme/audit ve sonraki lifecycle. | `src/orchestra/sprint-phases.ts:2063-2112`, `2135-2153`. Lock, idempotency sınırıdır; elapsed ölçer değildir. |
| Cleanup | `runCleanupPhase` scan interval’i kapatır, `cleanup_delay_ms` pozitif sayıysa `setTimeout`la bekler, sonra `cleanup` ve `cleanupToolInventory` çağırır. | terminal sonrası bakım; controller açıklamasına göre emitted phase değildir. | `src/orchestra/sprint-phases.ts:5077-5113`; `src/orchestra/sprint-controller.ts:2610-2615`. |

`resource-report.ts` ayrı bir analitik producer/consumer sınırı sunar: `parseResourceLog` log içeriğini `ResourceSample[]`e çevirir (`:39-55`), `summarizeByTask` ilk/son sample timestampinden `durationMs` hesaplar (`:63-113`). Bu **sample-window duration**dır; CLI veya provider receipt duration değildir. Boş/bozuk satırların atılması (`:35-53`) ve `Date.parse` geçersizse 0 dönmesi (`:94-97`) ayrıca failure boundary’dir.

### Cleanup gecikmesinin kanıtlı etkisi

R3 korunmuş sonucu `config.cleanup_delay_ms=180000` nedeniyle cleanup öncesi doğrudan 3 dakika beklendiğini bildirir. Kaynak politikası bu değeri yalnız pozitif number olduğunda kullanır; aksi halde 0 ile hemen cleanup yoluna girer (`src/orchestra/sprint-phases.ts:5095-5110`). Gecikme sırasında `.tasks/` dosyalarının okunabilir kalması açıkça log mesajında ifade edilmiştir (`:5099`). R3 ayrıca canlı run config’inin değiştirilmediğini söyler.

## Hipotezler ve önerilen sonraki onarım (kanıt değildir)

### Tercih edilen alternatif: ölç, sonra policy’yi koru veya değiştir

**Önerilen tam dosya kapsamı (gelecek ayrı admitted repair):**

- `src/orchestra/sprint-controller.ts` — CLI/coordinator, plan-admission, queue-dispatch, collected-result/verification-evaluation ve cleanup giriş/çıkışında monotonic, ayrı named interval kayıtları üretmek; canonical result veya terminal verdict üretmemek.
- `src/orchestra/sprint-phases.ts` — `runPlanPhase`, `runSpawnPhase`, `runEvaluatePhase`, `runCleanupPhase` uç noktalarını aynı attempt/sprint correlation ile kaydetmek; cleanup delay’in configured/applied/skipped değerini belirtmek.
- `src/orchestra/resource-report.ts` — sample-window alanını açıkça `sampleWindowDurationMs` adıyla additive projekte etmek veya mevcut `durationMs` anlamını değiştirmeden yeni alan eklemek.
- İlgili dar hedef testleri (tam path’ler bu scoped okumada unavailable) — injected clock ile interval sınırları, `cleanup_delay_ms` 0/pozitif/geçersiz ve terminal authority’nin değişmediği davranış.

Bu öneri **canonical authority’yi korur**: worker self-claim, resource sample veya CLI logu canonical verdict/receipt yerine geçmez. Controller’daki exact terminal authority tüketimi (`src/orchestra/sprint-phases.ts:2098-2103`) ve terminal sonrası cleanup’ın non-phase olması (`src/orchestra/sprint-controller.ts:2610-2615`) korunmalıdır. Yeni telemetry yalnız gözlem ingress’i olmalı; finalizer/evaluator authority’sini mutasyona uğratmamalıdır.

### Cleanup policy seçenekleri

1. **Mevcut 180000 ms’i muhafaza et:** Forensic/readability penceresi için gerekçesi kanıtlıdır. Toplam CLI latency’ye üç dakika eklediği açıkça raporlanmalı, provider latency diye sunulmamalıdır.
2. **Sadece configured schedule:** `cleanup_delay_ms` için explicit policy kaydı ile “scheduled” durumu yayınla; cleanup sonunda actual completion kaydı ekle. Bu, gecikmeyi kaldırmaz ama status tüketicisinin task DONE ile outer cleanup/terminal zamanını ayırmasını sağlar.
3. **Koşullu azaltma/kaldırma:** Ancak gerçek custody/forensic retention’ın başka dayanıklı producer tarafından korunduğu ve testlerle kanıtlandığı ayrı admitted değişiklikte düşünülebilir. Bu kanıt yokken delay’i kaldırmak, R3’ün belirttiği okunabilirlik penceresini yok edebilir; önerilmez.

### Failure boundaries

- Admission materialization/CAS başarısızlığı pre-executiondır ve temizlenir (`sprint-controller.ts:3213-3223`); bunu provider execution olarak saymak yanlış olur.
- Routing failure provider-routing-hold yayınlar (`sprint-controller.ts:3248-3283`); provider start olmadan CLI elapsed’a katkı yapabilir.
- Queue/dependency wait ve host verification için bu slice’ta ayrı duration producerı yoktur; telemetry eklenmeden dağıtım yapılamaz.
- `skipCleanup` true olduğunda bu fonksiyon delay/cleanup yürütmez (`sprint-phases.ts:5095`); “scheduled cleanup tamamlandı” iddiası yapılamaz.
- Delay sonrası `cleanup` ve inventory cleanup hataları catch/log yolundadır (`:5101-5109`); delay geçmiş olması successful deletion kanıtı değildir.

### Platform ve tenant sonuçları

- **Linux:** Korunmuş 755 kanıtının Docker örnekleri ve `/proc` benzeri host metrikleri Linux bağlamındadır; 5 saniyelik örneklerin exact peak olmadığını JSON zaten sınırlar. Bu rapor Linux dışına bu ölçümü genellemez.
- **WSL:** Windows host ve Linux guest saat/IO/memory görünürlüğü farklı olabilir; coordinator wall, Docker receipt ve sample window yine ayrı correlation alanlarıyla tutulmalıdır. Bu slice’ta WSL ölçümü unavailabledır.
- **macOS:** Docker Desktop VM sınırı nedeniyle host HWM ile container sample aynı bellek alanını temsil etmeyebilir. 755 Linux HWM’si macOS kapasite iddiası değildir.
- **Windows:** Native/desktop host process, Docker/WSL backend ve saat çözünürlüğü farklı olabilir; monotonic elapsed ile UTC event timestampini birlikte kaydetmek gerekir. Windows ölçümü unavailabledır.
- **Tenant:** Tenant/organization scope ve erişim politikası izinli kaynakta görünmedi. Gelecek telemetry, tenantlar arası correlation veya raw task/provider içerik sızdırmamalı; tenant-scoped, redacted aggregation ve mevcut canonical authority’ye bağlı erişim gerekir. Mevcut tenant davranışı hakkında hüküm unavailabledır.

## Sonuç

Kanıt 36:57 CLI/coordinator elapsed, 115.002 s provider receipt interval ve 26:49 job metric’in ayrı olduğunu destekler; yalnız cleanup için 180000 ms uygulanmış doğrudan bekleme kanıtı vardır. Kalan yaşam-döngüsü bileşenlerine süre atfetmek için veri yetersizdir. Önerilen sonraki repair, süreleri additive observability olarak üretmeli; canonical evaluation, settlement ve cleanup authority’yi değiştirmemelidir.
