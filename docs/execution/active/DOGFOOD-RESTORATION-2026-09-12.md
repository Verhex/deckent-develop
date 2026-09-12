# Dogfood yürütmesini ve gözlemlenebilirliğini geri kazanma

Durum: **OWNER_ACCEPTED — R0 first pass implemented; negative closure/archive proved; latency/projection/XVerify HOLD; no751.**
Kaynak gözlemi: 2026-09-12T15:56:22.170220Z; main HEAD `ae87e898613928ca314b5179484982b6bdb6d69f`.
Owner yönü: önce eksiksiz, izlenebilir dogfood; sonra geliştirmeyi dogfood ile sürdürmek.
Önceki owner şartı korunur: yeni koddan önce etkiyi görüş; 748/749/750 kapanış sınırı geçilmeden 751 başlatma.
Bu belge yeni MASTER ledger'ı, admission receipt'i veya DONE beyanı değildir.

## Owner amendment — deterministic plan scaffold

Alperen bu planı ve ilk R0 kod paketini canlı talimatla kabul etti. Onay yeniden
istenmez. Normal execution kilitli olduğundan R0, ADR-D-007 bounded recovery
seam'inde yürür. R0 negatif scope: normal feature implementation, auth, MASTER
disposition, Cursor REPL, commit/push ve751. Exact source scope önceki
REPAIR-PLAN'daki lifecycle/custody/readiness/start/archive ve hedefli testlerdir.
Başlangıçtaki dirty dosyalar `/tmp/deckent-r0-astra-20260912` altında korundu.
Bir implementation + hedefli verification pass; değişmiş kanıtla en fazla iki
onarım, komut başına en fazla10dk, test fork≤2. Başarısızlığı aynı girdilerle
tekrar eden runtime loop yok. Runtime mutation yalnız kanıtlanmış canonical
recovery/closure operasyonundan; elle state veya receipt yazılmaz.

Yeni planlama geri bildirimi R2'nin bağlayıcı tasarım girdisidir:

- Ürün canonical versioned schema'dan boş plan/scaffold üretir. Brain'a görev
  anlamı, hedef, bağımlılık önerileri ve gerekçeli karar alanları verilir;
  kimlik, revision, digest, mekanik bağlar ve authority ürün tarafından üretilir.
- Do/autonomous/mission/start aynı compiler/service'i kullanır; yüzeye özel
  gerekli alanlar typed profile olur, birbirinden kopuk şema/script kopyaları olmaz.
- Scope ürünün proje bilgisi ve kullanıcı niyetiyle önerilir, kapalı write set'e
  dönüştürülür; yeni dosya niyeti plan önizlemesinde açık olur. Force-scope bayrağını
  hatırlamamak sonradan worker spawn'ını düşürmez. Onay bir scope genişletmesini
  kapsamadığında kendiliğinden yetki üretilmez; eksik karar başlamadan gösterilir.
- Task ID/dependency referansları mekanik çözülür; bilinmeyen referans/cycle/çakışma
  provider tekrarına taşınmadan teşhis edilir. Şema repair sınırlıdır; validation
  hatası için tüm plan gereksiz yere baştan üretilmez. Onaylanmış plan yeniden
  planlanmadan exact revision olarak çalıştırılır.
- 14dk planlama owner tarafından gözlenen başarısız deneyimdir; henüz kontrollü
  latency benchmark değildir. Yerel scaffold/bağlama işinin ms düzeyindeki süresi,
  disk/provider/authority admission süresinden ayrı ölçülür; bütün sürece kanıtsız
  milisaniye garantisi verilmez.
- Task granularity/model/provider/skill/agent başarı-yük optimizasyonu sonraki
  routing işidir; R0'a alınmaz. Şimdiki routing mevcut effective policy'den gelir.
- Her talep tam ve çalıştırılabilir plan ya da gerekçeli pre-execution refusal
  üretir; doğan her iş terminal veya açık resumable disposition taşır. Bu, bütün
  görevlerin zorla başarılı işaretlenmesi veya dış sistem arızalarının yok sayılması
  değildir. Kullanıcıya muğlak running/başladı/boş başarı bırakılmaz.

## 1. Sonuç ve yetki

Sorun yalnız `.local` altında yürütmek değil: yeni custody/çıktı otoritesi ile eski
task/heartbeat okuyucuları aynı yürütmeyi farklı biçimde görüyor. Somut Desktop
protokol ayrışması da var. Ürünü düzeltmek için özel runtime dosyalarını main'e
kopyalayıp ikinci bir durum kaynağı yaratmak yerine mevcut application-service,
kimlik, custody, event ve settlement sözleşmelerinin tüketicileri tamamlanmalı.

Main; repo kaynağı ve operatörün proje girişidir. Worker'ın özel çalışma alanı,
çıktısı ve kanıtı başka yerde kalabilir. Main'den açılan Terminal, Dashboard,
Desktop ve CLI/MCP aynı project/run/task/attempt kimliğini çözerek yetkili görünümü
alabilmelidir. Görünürlük eksikliği asla başarılı/boş/IDLE diye örtülmemelidir.

Yürütme yetkisi epoch7 COMMITTED handoff'tadır:
`docs/execution/handoffs/ah-2026-09-12-opus-astra-dogfood-v3/0003-committed.json`.
DOGFOOD ON; bir ACTIVE outcome. Mevcut kabul edilmiş sınır MASTER120
STATE-RETENTION-001 önündeki RECOVERY-DO-DOGFOOD-001'dir. Aşağıdaki geniş program
bu sınırla ilişkilendirilmiş öneridir; tüm enterprise backlog'u tek recovery
paketine sokmaz. MASTER4030 Operation,4040 Capability,4050 Authority birbirinin
yerine geçirilmez. Terminal Cursor lane'i toparlama/park konumunda korunur.

## 2. Bugünkü runtime gerçeği

| Sprint | Gerçek yürütme geçmişi | Diskte kalan görünüm | Açık sınır |
|---|---|---|---|
| 748 | Gerçek worker başladı; Flow FAILED. Worker sonucu şema açısından kabul edilmedi; kaynak etkisi mevcut. | `task-748-001.json` EXECUTING; skill-delivery var. | Negatif attempt disposition / settlement ve ortak readiness. Başarı sayılamaz. |
| 749 | Worker başlamadan Flow CANCELLED. | Task PENDING; skill-delivery yok. | Başlamamış task'ın kanıta bağlı emekliliği; worker receipt'i üretilmez. |
| 750 | Worker başlamadan Flow FAILED; eski748 preflight engeli. | Task PENDING; skill-delivery yok. | Aynı emeklilik + yanlış CLI exit0/başlama izlenimi. |

Kaynak: `../evidence/astra-recovery-20260912/owner-close-preflight.json` (15:12:26Z),
`planning-recovery-health.json` (15:03:42Z), `post-opus-analysis.md`.
Bu turdaki Docker listelemesinde yalnız sağlıklı local-llm konteyneri vardı;
748/749/750 task görünümleri tekrar yukarıdaki değerleri verdi. Bu Docker
gözlemi tüm olası backend'ler için evrensel liveness kanıtı değildir.
Flow terminal olması, task settlement'ı veya archive terminal mührü değildir.
Dosya silerek bunlar kapatılmayacak. Kullanıcının kapatma yetkisi mevcut;
kalıcı kapanışın ürün mekanizması henüz tamamlanmış değil.

## 3. Kanıtlanmış bulgular ve sınırları

Tüm satırların source hash'leri ve UTC'si evidence inventory'sindedir. Satır
numarası sonraki eşzamanlı değişiklikte kayabilir; hash gözlem anını sabitler.

| Bulgu | Kaynak | Değerlendirme / güven | Sınıf |
|---|---|---|---|
| Custody konumu platform/global scope resolver + proje digest'iyle çözülüyor. | `src/orchestra/spawn-backend-docker.ts:5376` | Kod yolu mevcut; `.local` tek platforma sabit ürün sözleşmesi değil. Yüksek. | BLOCKS_CURRENT_DONE — tüm tüketicilerde aynı kimlik çözümü doğrulanmalı |
| API iki çıktı route'unda exact read service kullanıyor; Dashboard yeni SSE'yi dinliyor. | `src/api/server.ts:1099,1175`; `src/api/task-output-stream.ts:174`; `src/dashboard/src/lib/useExactTaskOutput.ts:79,92` | Kısmen çalışıyor: source wiring var, bu tur live UI replay yok. Yüksek kaynak güveni. | BLOCKS_CURRENT_DONE — bütün yüzeyler için kanıt gerekiyor |
| Desktop aynı worker route'unda eski `log_line/log_unavailable` olaylarını bekliyor. API `output-state/output-lines/...` gönderiyor. | `src/desktop/src/renderer/shell/api-client.ts:491,500`; `src/api/task-output-stream.ts:221` | Protokol uyuşmazlığı kesin; bu akışta yeni çıktı olaylarını tüketmiyor. Live Desktop sonucu ayrıca ölçülecek. Yüksek. | BLOCKS_CURRENT_DONE |
| Auditor `.tasks/*.hb` üzerinden worker listesini kuruyor; yeni authority snapshot'larını yalnız bu listedekilerle eşliyor. | `src/monitor/auditor.ts:587,601,611` | Yeni authority desteği var; heartbeat projection'ı yoksa keşif eksik. `.local` kopukluğu hipotezini destekler. Yüksek. | BLOCKS_CURRENT_DONE |
| Nervous state provider da `.tasks/*.hb` keşfine ve sprint-state'e bağlı; state yoksa IDLE. | `src/orchestra/sprint-state-tracker.ts:60,86`; `src/nervous/detectors/stale-worker.ts:62` | Detector exact host-dead ister; bu doğru. Fakat worker keşfi eksikse detector'a aday gelmez. Yüksek. | BLOCKS_CURRENT_DONE |
| MCP backend sayacı task JSON'daki EXECUTING/CLAIMED'i doğrudan sayıyor. | `src/mcp/tools/status.ts:158,555` | Yetkili liveness yerine eski projection'dan sayı;748 gibi kalıntı yanıltabilir. Tüm MCP status alanlarının bozuk olduğu iddia edilmiyor. Yüksek. | BLOCKS_CURRENT_DONE |
| Auditor ilk tarama ve periyodik loop ancak başarılı spawn sonrasında başlatılıyor; hatalar debugLog'a düşüyor. | `src/orchestra/sprint-phases.ts:1696,1721,1727`; `src/monitor/auditor.ts:1500` | Auditor kodu yok değil. PLAN/preflight başarısızlığının bu worker loop'unda görünmesi beklenemez. Canlı sağlık ayrıca ispatlanmalı. Yüksek. | BLOCKS_CURRENT_DONE |
| Nervous enabled olsa bile bootstrap hata/missing durumunda null olabiliyor. | `src/orchestra/sprint-controller.ts:719` | Proje ayarında enabled=true; etkin merged runtime handle/heartbeat kanıtı yok. “Açık = çalışıyor” denemez. Yüksek. | BLOCKS_CURRENT_DONE |
| Planning health tüm bulunan admission'ları geziyor; discovery deadline'ı sonraki tüm pahalı denetimlerin ortak son tarihi değil. | `src/orchestra/spawn-backend-docker.ts:5508,5541,5553`; `src/orchestra/run-proposal-compiler.ts:216,276` | Model çağrısından önce pahalı yol var. Önceki gerçek health çağrısı yavaştı; bu tur kontrollü p50/p95 ölçülmedi. Orta gecikme-atıf güveni. | BLOCKS_CURRENT_DONE |
| Büyük modüller mevcut: Docker backend24.285, sprint-phases5.258, controller4.486, config4.069 satır. | inventory | Bakım/çakışma riski; bu sayı atıl kod veya her yavaşlığın sebebi kanıtı değildir. Geniş rewrite önerilmiyor. | RELATED_BUT_NONBLOCKING |

Önceki schema-rejection onarımının hedefli185 testinin yeşil olması tarihi
kanıttır. Yeni süreçte exact authority keşfi iki kez başarılıydı; bu, tam cold
recovery değil. Gerçek Opus5 XVerify verdict'i **UNCLEAR/HOLD**; durable receipt
var, PASS yok. Bu audit'te test/tsc/lint/build çalıştırılmadı, sahte exit sonucu yok.

## 4. Mevcut hafıza ve tasarımın kullanımı

DB ham okunmadı. Ürünün read-only `memory recall` + detail yüzeyiyle ADR-D-007,
G-020, G-022, G-031 alındı (dört detail komutu exit0). Exact sonuçlar evidence'da.
G-020 rol ayrımı ve authority; G-022 gözlem/karar/öneri/yürütme; G-031 tenant,
RBAC ve audit temelini tanımlar. ADR'deki eski “bugün çalışıyor/kapalı” cümleleri
güncel runtime kanıtı yerine kullanılmadı. Mevcut core-memory ve live owner üstündür.

Ürün kimliği ve mevcut Desktop/Terminal North Star ile reconciliation korunur:
tek kernel, farklı execution posture'ları; Terminal ve Desktop control/operator,
Dashboard observability. Yeni tasarım yönü veya ikinci orchestration motoru yok.
Product-design, agentic-UX ve enterprise-UX sözleşmeleri uygulanır: tenant/actor,
izin ve etkiler gerçek servisten gelir; görsel hiyerarşi yetki üretmez.

## 5. Kullanıcının görmesi gereken yürütme sözleşmesi

Bir sohbet veya komut, `Goal → Mission → Flow → Run → WorkItem → Attempt → Operation`
zincirinde izlenir. Her surface aynı revision/cursor ve yetki filtreli read model'i
kullanır. Operation türü sadece dosya yazma değildir: DB mutation, onaylı iş işlemi,
connector çağrısı ve otomasyon da aynı kimlik/etki/settlement bağına oturur.

Operatör aynı anda şunları görebilmeli:

- İstenen sonuç, plan revision'ı, bağımlılıklar ve halen yapılacak iş.
- Brain'ın seçilmiş provider/model'i, son gözlemi, şu anki aşaması ve neden beklediği.
- Her worker'ın exact attempt'i, rol/skill teslimi, host liveness'ı, son faaliyeti,
  yetkili canlı çıktısı, yazdığı/değiştirdiği kaynak veya dış sistem etkisi.
- Auditor'ın aktifliği, son taraması, tarama kapsamı ve kaçırdığı/okuyamadığı alanlar.
- Nervous'un etkinliği, detector sonucu, karar gerekçesi, önerilen müdahale,
  gerekiyorsa aynı approval broker'daki istek ve müdahalenin gerçek sonucu.
- Yetkili kullanıcı/principal, tenant/proje/ortam; inherited/explicit izin ve deny
  nedeni. Maskelenmiş argümanlar, onayın kapsamı/süresi ve downstream etkisi.
- Gerçek provider usage, tahmin ve budget ayrı; belirsiz değer sıfır sayılamaz.
- Sonucun kabul/red durumu, bekleyen settlement ve doğrulanabilir kanıt bağlantısı.

Çalışma, gözlem bağlantısı ve settlement ayrı eksenlerdir. UI bağlantısı koparsa
“bağlantı koptu; son gözlem...” görünür; worker öldü veya iş bitti denmez.
Yeniden bağlanma cursor/revision ile eksik olayları tamamlar; tekrar gelen olay
ikinci effect/dispatch yaratmaz. Terminal kapanması yalnızca gözlemciyi kapatıyorsa
arka plan işine dokunmaz. Kalıcı owner cancel ise ayrı, yetkili operasyon olur.

## 6. Uygulama sırası ve etki alanı — koddan önce görüşülecek plan

| Dilim | Yapılacak iş / etki | Kapanış kanıtı |
|---|---|---|
| R0 — mevcut koşuların kapanışı | Önceki REPAIR-PLAN kapsamı: exact negatif attempt disposition, ortak readiness, doğru exit/başlama sinyali, başka sprint state'ine dokunmayan archive.748/749/750 başarısız/iptal geçmişi korunur. | İki yeni süreçten aynı terminal disposition; ghost-active yok; yeni admission748'i yeniden canlandırmaz. Canlı etki ve harcama tarihi kaybolmaz. |
| R1 — ortak yürütme görünümü | Mevcut custody/task-output/heartbeat/Flow servislerinden yetki filtreli kimlik ve read model. CLI/MCP/Auditor/Nervous okuyucularını bağla; Desktop SSE consumer sözleşmesini düzelt. Yeni paralel state deposu yok. | Aynı run/attempt/freshness bütün yüzeylerde aynı; eski projection yanıltmaz; yetkisiz tenant output'u alamaz. |
| R2 — hızlı ve açıklanabilir admission/plan | Config/authority, recovery discovery, memory selection, prompt, provider first-token/total, parse/retry ve exact-plan aşamalarını ayrı ölç. İlgili kimliğe odaklı bounded reads; doğrulanmış değişmez verinin tekrar hash'ini azalt. Structured ve AI aynı exact execution contract'ına iner. | Soğuk/sıcak gerçek ölçüm; model süresi ile host süresi ayrılır; gereksiz ikinci plan yok; retry sınırlı ve nedenli; hiçbir limit kaldırılarak başarı taklidi yapılmaz. |
| R3 — yaşayan kapalı döngü | Brain→bağımsız worker'lar→Auditor→Nervous→yetkili recovery→yeniden değerlendirme→settlement. Observer, run kabulünden itibaren admission/PLAN sorunlarını da gösterir; worker taraması rolüne uygun başlar. | En az iki çakışmasız gerçek worker, gerçek overlap zamanları; birinin failure'ı diğeriyle karışmaz; yeniden başlatılan supervisor mevcut işi keşfeder, kopya işçi üretmez. |
| R4 — üç yüzey ve olumsuz durumlar | Var olan Desktop/Terminal tasarımında aynı inceleme, izin, pause/resume/cancel ve sonuç dili. Dashboard aynı bilginin read-only görünümü. | Gerçek binary Terminal + Dashboard + Desktop üzerinden aynı run; disconnect/reconnect, auth expiry, stale snapshot, read denial, duplicate event ve restart kanıtları. |
| R5 — sürdürülebilir dogfood ve enterprise uygunluğu | Tamamlanan döngüyle admitted MASTER işini planla/yürüt/değerlendir. İş etkisini dosya/branch'e bağımlı varsaymayan business-workflow doğrulaması. | Gerçek dogfood işi kalıcı settlement ile biter; temsilî yetkili DB/approval otomasyonu aynı kernel'den geçer; ikinci koşu öncekinin artıklarına takılmaz. |

R0 ilk aktif dilimdir. R1'in tam sözleşmesi R0'dan önce tasarımda sabitlenir;
ilk yeni worker'ı görünmez başlatıp monitoring'i sona bırakmayız. R1 consumer
bağlamaları ve R2 ölçüm işleri ancak DAG/custody bağımsızsa paralelleşir.
R3'te worker sayısı config, model entitlement, dosya çakışması ve host kapasitesinin
kesişiminden gelir; promptta sabitlenen sayı ile zorlanmaz. İki gerçek worker
kanıtı alınamıyorsa paralel dogfood kabulü HOLD kalır, tek worker “paralel” sayılmaz.

Bu geniş programı tek mega-commit veya tek dev prompt ile yürütmeyiz. Her dilim
exact input/output/evidence sözleşmesiyle öncekine bağlanır. Ana outcome bitmeden
bağımsız backlog işine sapılmaz. R0'daki typed recovery istisnası diğer dilimler
için sürekli elle kodlama izni değildir; ilk güvenli sınırda ürün dogfood'una dönülür.

## 7. Performans ve ölçek kabulü

Aşağıdakiler **önerilen test hedefleri**, bugün ölçülmüş ürün garantileri değildir:

- Komut kabulü ve gerçek aşama bilgisi normal referans host'ta ≤1s görünür.
- Olağan readiness kararında hedef p95≤5s; UI'daki yeni durable event'in görünmesi
  sağlıklı bağlantıda p95≤2s. Ölçüm fixture'ı, donanım, concurrency ve örnek sayısı
  sonuçla birlikte kaydedilir. Global tarih taraması normal hot path olmaz.
- AI çağrısında provider süreleri ayrıca raporlanır. Yalnız “planlanıyor” sayacı
  yeterli değildir; hangi aşamanın ilerlediği ve hangi kanıtın beklendiği görünür.
  Sürenin tamamını kullanıcının beklemesine bağlamayız; uzun iş detached ilerler,
  aynı run'a dönülür ve kullanıcı yeni mesajla yönlendirebilir.
- Tenant/project/attempt indeksleri, sayfalama, bounded stream kuyruğu, backpressure,
  retention ve yetki filtreli export sözleşmede baştan yer alır. p95/p99, RSS,
  event-loop gecikmesi ve disk read/hash sayısı farklı geçmiş büyüklüklerinde ölçülür.
- Kayıt bulunamadı / eski kayıt / yetkisiz / bağlantısız / gerçekten boş ayrı durumlar.
  Cache source revision/fence değişimini takip eder; liveness başarısı cache'den üretilmez.
- Linux, WSL, macOS ve native Windows sözleşmesi aynı; runtime adapter'ı desteklenmeyen
  durum açık unsupported/HOLD verir. Bir host testini cross-platform PASS yazmayız.

## 8. Enterprise kapsamı ve bitiş sınırı

Solo ve enterprise aynı engine'i kullanır. Solo görünüm daha sade; governance,
kimlik, attributable effect ve failure-recovery anlamı daha gevşek değildir.
Enterprise test senaryosu yeni muhasebe ürünü geliştirmek değildir: örneğin
tedarik kaydını okuma → tutarlılık denetimi → onay → yetkili DB değişikliği →
audit/evidence → settlement, aynı production service zinciriyle yürütülür.
Gerçek mali işlem veya ödeme bu audit/planla yetkilendirilmiş değildir.

Business workflow matrisi: izinli/izinsiz/expired, tenant karışması, duplicate
delivery, retry sonrası double-write, DB timeout, partial effect, rollback veya
compensation sınırı, policy değişimi, provider erişimsizliği ve operatörün geri
dönmesi. Tam olarak bir kez yapılan dış etki, uzak sistem garantisi yoksa vaat
edilmez; idempotency key ve reconciliation kullanılır, belirsizlik açık tutulur.

Auditor'ın policy/diff denetimi ile farklı-provider XVerify ayrı sorumluluktur.
Nervous observer'ı ikinci Brain veya ikinci karar otoritesi yapmayız. Approval
surface'ları aynı yetkili karar servisine bağlanır; Dashboard control plane olmaz.
Mevcut enterprise ADR'lerinde kayıtlı RBAC/rate/audit eksiklerinin hepsi bu
recovery'nin otomatik scope'u değildir. Seçilen yürütme sözleşmesini engelleyenler
exact dependency olarak alınır; diğerleri mevcut ledger bağlarıyla korunur.

Dogfood “ayağa kalktı” kabulü için R0–R5'in uygun admitted kapsamı gerçek kanıtla
geçilmelidir: kullanıcıdan elle JSON düzeltmesi/retrigger istemeyen takip edilebilir
koşu, gerçek paralellik, kalıcı olumsuz/olumlu sonuç, soğuk restart, canlı surface
paritesi ve sonraki admitted işe devam. Unit-green tek başına bu kabulü sağlamaz.
Provider engeli veya meşru izin kararı olduğunda ürün sessizce durmaz; sebebi ve
devam koşulunu taşır. “Her dış koşulda mutlaka başarı” garantisi verilmez.

## 9. Kapsama ve doğrulama dürüstlüğü

6.268 tracked yol birer primary domain'e ayrıldı: host-policy455, docs522,
other267, build190, execution/monitoring322, API/MCP/connectors170, CLI267,
core/provider619, Dashboard139, Desktop85, tests3232. Bu **dosya envanteridir**;
6.268 dosyanın anlamsal olarak incelendiği iddia edilmez. Bu tur 26 kaynak/belge
için seçilmiş bölümler hash'lendi. Bazı ek rol/skill ve önceki recovery kanıtları da
okundu; kapsam listesi bunları tam dosya audit'i diye saymaz.

Untracked yollar inventory'de ayrı listelenir; runtime, generated dist,
node_modules ve harici arşivler ayrı sınıftır. Credentials/private keys/auth
içeriği ve ham memory.db okunmadı. Binary sınıflandırması uzantı tabanlıdır;
binary audit yapılmadı. Bütün legacy/backend/connector yüzeylerinin göçü henüz
eksiksiz taranmış değildir; R1 implementation öncesi consumer matrisi tamamlanır.

Ana kanıtlar: `../evidence/astra-recovery-20260912/dogfood-restoration-inventory.json`,
`dogfood-memory-adr-*.json`, `planning-recovery-health.json`, `post-opus-analysis.md`.
Güncel snapshot manifest'i audit belgeleri, hash ve command sonuçlarını bağlar.
Bu tur yalnız analiz/evidence belgeleri yazıldı; kaynak kodu, auth, runtime state,
MASTER disposition, build, commit/push ve751 değişmedi.


## R2 source-grounded follow-through — 2026-09-12

Owner's empty-schema idea must extend the existing host contract, not add a parallel
planner. Current seams: `src/orchestra/planner-plan-contract.ts:54` (host contract),
`src/orchestra/planner.ts:105` (parsed semantic fields), and
`src/orchestra/run-proposal-compiler.ts:204` (AI/default compiler entry).
The CLI generator should call this same service; no adapter owns a copied schema.

Concrete ownership split for the eventual implementation:

| Field family | Producer and validation |
|---|---|
| Schema version, request/project/tenant binding, revision, stable task IDs, hashes | Host; AI cannot author authority or overwrite identifiers. |
| Objective, task descriptions, dependency proposals, evidence goals, relevant resources | Brain fills typed semantic slots grounded in actual capabilities/resources. |
| Dependency edges, duplicate IDs, DAG/cycle/collision checks | Host resolves slot references deterministically, before dispatch. |
| Existing-file edit, new-file creation, read-only, database/API side effect intent | Surface/capability profile; user intent is compiled to exact granted scope. Missing authority is an explicit pre-execution decision. |
| Provider/model/skill assignment and concurrency | Existing effective routing/admission; advanced success/load optimization remains a later lane. |
| Production wiring and effect/receipt identities | Registered host producers and real runtime effects; never provider-authored evidence strings. |
| Final plan | Complete validated immutable revision; a blank scaffold is never executable. |

Two source limitations to resolve in the admitted R2 contract:

- `planner-plan-contract.ts:59` currently defaults task cardinality to1..5 and
  single-exact-write to1. This is a current host restriction, not intelligent
  granularity/load routing. Do not present it as that capability or hardcode a new
  provider-specific count in the scaffold script.
- `run-proposal-compiler.ts:375` currently requires a writable file for every task.
  An enterprise read-only/query/approval/database task must not invent a repository
  write merely to pass this guard. Preserve the existing code-change profile while
  using typed resource/effect contracts for other capabilities. No fake output file.

Latency instruments need separate timestamps: accepted user intent → local schema
build → resource/authority resolution → provider request/first response → semantic
validation/repair → durable plan → admitted dispatch → actual worker start. Report
provider-reported usage separately from wall time. Local scaffold/ID/link work should
be measured in milliseconds; network/provider or verified custody traversal cannot
be hidden inside that number. The R0 profile already proved201s in host-side health
without a provider call, so optimizing JSON text generation alone will not close the
owner's14-minute planning failure.
