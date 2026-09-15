# Dogfooding — birleşik yürütme / yüzey / enterprise audit

## Hüküm

**Dogfooding şu an uçtan uca çalışmıyor.** Mevcut normal `start`752'de worker doğmadan PLAN/EXACT_DOCKER_TASK_PROJECTION_ADMISSION_REQUIRED ile exit1 verdi. Bunun yanında çalışan önemli parçalar var: exact recovery ile751 negatif custody kaydı, doğru image readiness, canonical status/read-model tüketicileri, exact-plan executor ve persisted RunFlow event zinciri. Dolayısıyla “her şey eksik” veya “yalnız arayüz sorunu” teşhisi yanlış olur.

Ana sorun parçalar arasında aynı execution contractının her girişte taşınmaması; senkron geçmiş doğrulaması ve erken invocation görünürlüğü boşluğu bu hatayı dakikalarca görünmez kılıyor. Enterprise-ready veya MASTER120 DONE hükmü verilemez.

Bu rapor yeni çözüm uygulanmadan yapılan kaynak ve korunmuş canlı kanıt incelemesidir. Formal farklı-provider XVerify değildir. Yalnız local static review + önceki gerçek752/751 ölçümleri vardır.

## Durum tablosu

| Halka | Durum | Dayanak / sınır |
|---|---|---|
| Normal CLI start → worker | çalışmıyor |752 canlı PLAN failure, worker/task yok |
| Exact-plan executor | kısmen çalışıyor | Exact authority/materialization callbacks var; normal start dalında aynı bağlantı yok |
| AI/structured plan ve do | kısmen çalışıyor | Önceki751 worker doğmuş; başarılı effect/settlement kapanışı yok; yeni do çalıştırılmadı |
| Worker image | kısmen çalışıyor | Codex/native/dependency readiness gerçek candidate'da geçti; tüm provider/platform parity değil |
| Recovery/negative retention | kısmen çalışıyor |751 retained receipt var; negatif sonuç, task success değil |
| Admission performansı | çalışmıyor | Aday10s deadline; ordinary752 hazırlığı6dakikayı aştı |
| CLI/API/MCP status bağlantısı | kısmen çalışıyor | Canonical okuyucu kodda var;752 hazırlığını göstermedi |
| Terminal/Desktop/Dashboard tam canlı parity | kanıtlanamadı | Ortak projection/stream parçaları var;752 end-to-end çok-yüzey proof yok |
| Auditor/Nervous end-to-end | kanıtlanamadı | Bootstrap/scan kodu var;752 worker öncesinde kaldı; etkin scan/decision receipt'i bu run'da yok |
| Enterprise multi-tenant/restart/scale | kanıtlanamadı | Policy/tenant/scope primitives var; birleşik hostile/live matrix tamamlanmadı |

## Birleşik bulgular

### U01 — Normal start exact admission sözleşmesini taşımıyor

Sınıf BLOCKS_CURRENT_DONE; güven yüksek, kaynak+live.

`src/cli/commands/start.ts:1417` normal runSprint çağrısı exactPlanAuthority/onExactPlanMaterialize/onExecutionAdmitted taşımıyor. Aynı dosyanın`:755` exact-flow dalı bunları taşıyor. Ortak `src/cli/helpers/exact-sprint-runtime.ts:31` executor da bu sözleşmeyi taşıyor.752 hatası doğrudan bu sınıfla tutarlı.

Etki: kullanıcı geçerli işi verir, maliyet ekranı çıkar, dakikalar sonra hiç worker doğmadan durur. Çözüm: normal start aynı approved snapshot/materializer/executor service'ine bağlanmalı; flag ekleyip admission zorlanmamalı. Kabul: structured ve AI start,exact-flow,do aynı task-admission/skill/evidence kimliğini üretmeli; invalid scope hiçbir worker doğurmamalı.

### U02 — Bütün geçmiş senkron olarak kritik girişte doğrulanıyor

Sınıf BLOCKS_CURRENT_DONE; güven yüksek.

`run-proposal-compiler.ts:230` → `spawn-backend.ts:1363/:1384` → `spawn-backend-docker.ts:5537`. R1-E adayında10s deadline;752'de2:09elapsed/1:53CPU ve6:14elapsed/5:38CPU örnekleri var. İlk sorundaki “10sn” tamamlanmış readiness değildi.

Manifest paylaşımı, attempt sınırında cache payload bırakma ve startup/archive reader parity yapıldı, fakat canlı hedef geçmedi; defaultOFF. Çözüm: tekrarlı doğrulamayı exact proof/policy sınırında azaltmak, gerekirse mevcut authority'den türeyen bounded index ve invalidation tasarlamak. Persistent READY veya eski liveness cache'i yok. Event-loop izolasyonu latencyyi tek başına azaltmaz; iki kabul ölçümü ayrı olmalı.

### U03 — CLI timeout tüm başlangıç süresi değil

Sınıf BLOCKS_CURRENT_DONE; güven yüksek.

`sprint-controller.ts:1270` açıkça EXECUTE-phase wait timeout tanımlıyor;`start.ts:1413/:1432` bu değeri runSprint'e iletiyor.752 `--timeout300000` ile5dakikayı aştı. Bu yüzden yalnız “timer bozuk” demek eksik; ürün komutunun beklentisi ile kapsamı farklı.

Çözüm: admission/planning/provider/execute/settlement sürelerini ayır, operation cancellation ve total-deadline semantiğini mevcut budget authority'ye bağla. Kullanıcıya yalnız EXECUTE timeout'unu global timeout diye sunma. Uzun gerçek görevler checkpoint/resume/background üzerinden devam edebilir; model veya provider bağımsız başarı garantisi uydurulmaz.

### U04 — Worker öncesi invocation kullanıcıya kalıcı görünmüyor

Sınıf BLOCKS_CURRENT_DONE; güven yüksek canlı gözlem, kök neden orta.

752 kimliği Brain mesajında görünürken canonical status751'i gösterdi; final current status IDLE/sprintnull idi. Bu,752 kalıcı failure receipt'inin yokluğunu tek başına kanıtlamaz; yalnız current projection'ın invocation sonucunu taşımadığını kanıtlar.

`run-status-read-model.ts` canonical projection;CLI status,API reconcile ve MCP matching-model tüketir. Çözüm: intake/admission başlangıcından itibaren exact invocation phase ve failure evidence yayınla; run başlamadan sahte ACTIVE task yaratma. Son failure inspect edilebilir olmalı; current IDLE geçmiş başarısızlığı silmemeli. Kabul: kullanıcı aynı request'i CLI/Terminal/Desktop/API üzerinden bulabilir.

### U05 — Worker image hazır oluşu doğru ama bütün sözleşme değil

Sınıf BLOCKS_CURRENT_DONE; güven yüksek mevcut canary için.

Eski latest bağımlılık uyuşmazlığı vardı. Candidate`deckent-worker:r1-20260912` Codex/native/dependency canonical readiness geçti ve resmi config ile seçildi; latest etiketi değiştirilmedi.751 görev etkisi yeni baseline'da korunuyor. Tüm provider capability/version,lock/source,platform image uyumu henüz kapalı değil.

Çözüm: effective config/image digest/dependency authority dispatch'te aynı olmalı; yanlış image provider çağrısından önce reddedilmeli. Test çalıştırılabilirliği≠retention testi başarılı. Yeni image verification sırasında aktif worker'ın environment'ı değiştirilmemeli.

### U06 — Negatif closure ile ürün başarısı ayrılmalı

Sınıf BLOCKS_CURRENT_DONE; güven yüksek.

751 ABORTED ve RELEASED_EFFECT_UNACCEPTED receipt üretildi; accepted result değildir.752 PLAN failure; worker doğmadı. Bunlar dogfood fonksiyonunun tamamlandığına kanıt olamaz. Kaynaklar:`r1-released-unaccepted/RESULT.md`, `dogfood-canary-752/RESULT.md`.

Çözüm: terminal task/result/effect/verification/settlement/archive ve partial-effects sunumu aynı kimlikle bağlanmalı. Retry yeni generation olmalı; eski immutable journal düzeltilemez. Parent goal sadece çocuk stdout'una bakarak COMPLETE olamaz.

### U07 — Auditor/Nervous varlığı ile çalışması birbirine karıştırılıyor

Sınıf BLOCKS_CURRENT_DONE; güven orta, canlı supervision proof eksik.

`sprint-controller.ts:3315` runSpawnPhase sonucundan scanInterval alıyor;`:2985` snapshot timer'ı kuruyor. `nervous/bootstrap.ts:170/:185` config-disabled durumda null döndürüyor;`:198` başka canlı poller varsa ikinci host açmıyor. Bu tasarım gereği olabilir; “auditor ölü” hükmü yalnız kod varlığından veya752'de heartbeat olmamasından çıkarılamaz.

Çözüm: effective enablement + owner heartbeat + scan timestamp + observed exact worker + decision/adoption + durable outcome zincirini ölç. Disabled/delegated/stale/unavailable ayrı gösterilmeli. UI'a heartbeat eklemek supervision onarımı değildir. Recovery önerisi task duplicate veya yetkisiz kill doğurmamalı.

### U08 — Process sınırında canlı event teslimi ayrıca kanıtlanmalı

Sınıf BLOCKS_CURRENT_DONE; güven orta, kaynakla belirlenen risk.

`api/run-flow-routes.ts:140` coordinator onEvent'i publishRunFlowEvent'e bağlıyor;`run-flow-coordinator.ts:635` persisted olayları callback'e verir. Eski “producer unwired” yorumu güncel sonuç değildir. `api/run-flow-event-stream.ts:72` process-local subscriber map;`:194` durable replay vardır. Child/CLI başka process'ten yazdığında açık SSE bağlantısının nasıl güncellendiği bu audit'te canlı kanıtlanmadı.

Çözüm: mevcut durable event stream + watcher/backfill yolu izlenip generation/sequence bağında tamamlanmalı; ikinci event ledger kurulmaz. Kabul:Terminal'den run başlat, API process'ini açık tut,Desktop/Dashboard yeniden bağlanmadan olay görsün; sonra restart/drop/duplicate/out-of-order testleri. Polling varsa maliyeti ve tazelik sözleşmesi açık olsun.

### U09 — Tenant policy okunamazsa permissive fallback riski

Sınıf RELATED_BUT_NONBLOCKING (mevcut single-project canary açısından); enterprise kapanışı için blocker. Güven yüksek kod davranışı, exploitation/live sonucu kanıtlanmadı.

`api/tenant-scope.ts:34` bozuk dosyayı undefined sayar;`:54` project/global üzerinden çözülmezse false döner. “Malformed config weaken etmez” yorumu bu fallback'i güvenlik kanıtı yapmaz. `api/autonomous-endpoint.ts:179/:223` resolver kullanır. Authenticated principal ve route kontrolleri de incelenmeden cross-tenant leak var denemez.

Çözüm: absent ve invalid config ayrılmalı; enterprise policy-unavailable davranışı typed ve config-resolved olmalı. Fleet/project precedence, deny policy, cache invalidation ve authenticated tenant claims aynı kontrata bağlanmalı. Geçerli permissive ürün modunu sessizce değiştirme; malformed enforced policy'nin yetkiyi gevşetmesini engelle. Negatif tenant/IDOR testleri ve runtime matrix gerekir.

### U10 — Kullanım, maliyet ve subscription kapasitesi ayrı gerçekler

Sınıf BLOCKS_CURRENT_DONE (kanıtlı admission ve monitoring); güven yüksek projection gözlemi.

752 ekranı config Codex iken openai/model adını ve$0 subscription tahminini gösterdi; quota UNKNOWN'u açık yazdı. Bu unknown'u allowance kabul ettiğine dair tek başına kanıt değildir; worker doğmadı. Provider kimliği, model catalog owner'ı ve billing lane'i ayrıştırılmalı.

Çözüm: estimate/actual/provider-reported usage/quota evidence/freshness ayrı alanlar; local/API/subscription aynı budget truth contractını kullanmalı. Finansal sıfır kota sınırsız demek değildir. Unknown admission politikası effective config'ten açıkça çözülür.

### U11 — `.local` ayrımı tek başına arıza değildir; gözlenebilir binding şart

Sınıf BLOCKS_CURRENT_DONE; güven yüksek resolver kodu, tüm ingress parity orta.

`spawn-backend-docker.ts:5377` canonical project-root digest ve platform global-scope stateDir ile custody root kuruyor. Fiziksel ayrım deliberate. Sorun main'de izinin kaybolması: her surface aynı binding'i çözüyor mu; duplicate checkout/tenant/task adı ayırt ediliyor mu? Hepsi henüz doğrulanmadı.

Çözüm: rootları tekrar main içine taşımak değil; project/run/attempt inspect'te canonical binding ve evidence ref göstermek. Raw secret/host path sızıntısını redaction ile önle. Windows-native,WSL,macOS,symlink/case ve remote namespace matrisi gerekir.

### U12 — Enterprise dış-sistem etkileri için kapanış kapsamı geniş

Sınıf RELATED_BUT_NONBLOCKING; güven gereksinim düzeyinde, mevcut eksikliklerin tamamı audit edilmedi.

Dosya efektinin doğru olması satınalma/finans/DB workflow'unun hazır olduğunu kanıtlamaz. Connector/business adapterlarında principal delegation, transaction/idempotency, compensation, partial bulk result, audit export, legal hold, secret rotation, fairness ve disaster recovery ayrıca kanıtlanmalı. Bunlar var/yok diye bu tur sınıflandırılmadı; ayrı contract matrix hücreleri.

## Yüzey coverage ve gerekli kapanış

| Yüzey | İncelenen bağlantı | Açık proof |
|---|---|---|
| CLI start/do/resume/recover | exact/non-exact start ayrımı, timeout,752/751 live | düzeltilmiş start'ta gerçek worker/settlement |
| Terminal | ortak feed/exact runtime ve korunmuş Cursor lane'i | PTY phase/input/cancel/reconnect; terminal kabulü engineGO değil |
| Desktop | RunsView:76→subscribeSprintLive; lifecycle overlay ve streamDegraded | native app üzerinde exact request, restart, action authority |
| Dashboard | API status ve SSE consumers | read-only semantic parity,tazelik, büyük history,pagination |
| API | RunFlow coordinator/exact start,tenant scope,status,event stream | authenticated multi-tenant negative matrix,cross-processlive |
| MCP | startApprovedRun/separate child adapter,canonical status,read-only approvals | real stdio lifecycle/error/cancel parity; MCP dogfood start bu audit'te yapılmadı |
| Mission/Goal | mission-engine-wire exact executor + authority bridge | producer/dispatch/acceptance/parent settlement canlı zinciri |
| Autonomous | execute-dispatcher exact service ve backlog tenant filtreleri | duplicate trigger, resume, policy denials, quota/recovery |
| Process | process-runtime task result authority/settlementRef | multi-step dependency/partial failure/compensation live |
| Connectors/extensions | envanter ve ortak adapter gerekliliği | bu tur içerik düzeyinde tam audit yok; delivery dedupe/auth scope öncelikli |
| Brain/Worker/Auditor/Nervous | init/scan/config/decision bağları | gerçek worker üstünde scan/decision/effect kanıtı |

Tüm yüzeyler tek matrise bağlı; hiçbirinin eksik canlı hücresi “çalışıyor” olarak kapatılmadı.

## Enterprise kabul matrisi

1. Identity/isolation: principal→tenant→project→environment→attempt; wrong tenant, stale generation, forged scope, duplicate checkout.
2. Governance: policy version, deny precedence, approval expiry, revocation, delegated admin, safe bulk action. MCP approvals read-only contractı korunur (`mcp/tools/approvals.ts:16`).
3. Durability: crash-before/after-effect, lost response, replay, duplicate request, partial success; yalnız desteklenen semantics için exactly-once effect iddiası.
4. Observability: correlation/sequence/freshness, authoritative counters, clear disabled/delegated/unknown state; output/secret redaction.
5. Resource control: tenant fairness, queue/backpressure, local RAM/CPU/disk, API rate/sub quota, provider usage, cancellation ve budget restitution.
6. Retention/audit: append-only evidence, tamper detection, legal hold, bounded prune, redacted export; memory.db silinmez.
7. Availability: service restart, event replay, worker orphan, network partition, degraded mode; no silent second coordinator.
8. Platform:Linux/WSL/macOS/Windows-native/remote realm. Desteklenmeyen hücre typed unsupported/HOLD; tek host sonucu genellenmez.
9. Domain effects: DB/API/ERP adapterlarında transaction ve compensation sınırı; file git diff business settlement yerine geçmez.
10. UX/accessibility:i18n,keyboard,non-color states,screenreader,focus,ASCII fallback; Terminal/Desktop control,Dashboard observe.

## Çözüm sırası — audit sonrası uygulanacak paketler

**P1: Exact start admission + erken invocation truth.** U01/U04; mevcut service/executor/materializer kullanılır. Canonical failure outcome inspect edilebilir olmalı. Cursor hotfile ile tek yazar belirlenmeden start.ts değiştirilmez.

**P2: Başlangıçta canlılık, süre ve bounded doğrulama.** U02/U03; pahalı iş UI/event-loop'tan ayrılır, operation-level cancellation ve mevcut policy bağlanır; steady-state history maliyeti kontrol edilir. Limit yükseltmek/guard kaldırmak yok. Kullanıcının10s toleransı safety readiness bypass değildir.

**P3: Tek gerçek worker + supervisor fan-in.** U05/U06/U07/U10; image doğru,skill/persona,heartbeat,host verification,negative/positive settlement. Önce start; ilk failure kapanmadan do tekrarı yok.

**P4: Aynı run tüm control/observe yüzeylerinde.** U08/U11; API/MCP/Desktop/Terminal/Dashboard cross-process proof. Layout redesign değil semantic closure. Process/Mission/Autonomous adapterları ortak zincirde replay edilir.

**P5: Enterprise hardening ve platform proof.** U09/U12 ve matrix; mevcut R1 dışı yeni iş explicit admission ister. Bu durum P1 onarımını durdurmaz; enterprise-ready iddiasını sınırlar.

Her pakette exact scope, negatif scope, producer→consumer→ingress→policy→real proof; bir implementation+verification; ek onarım yeni kanıta bağlıdır. Değişmeyen başarısızlık sebepsiz tekrar edilmez. Canlı worker sırasında build/auth mutation yok. Ledger/Master DONE, owner policy ve authenticated closure dışında yazılmaz.

## Korunan kanıt ve karar sınırı

751 recovery, image, R1-E failed benchmarks, manifest-sharing ve752 canary raporları korunur; hashleri MANIFEST'tedir. 752 current IDLE gözlemi “752 temizlendi/settled” diye yorumlanmaz. ENTRY227 digest uyuşmazlığı hâlâ ayrı kanal HOLD; silinmedi.

Bu audit repo-cleanup, task silme, provider çalıştırma, policy/mode değiştirme, commit/push veya çözüm uygulaması yapmadı. Sonuç: **tek bir birleşik onarım kuyruğu hazır; ilk gerçek blocker U01.**

## Ölçülen inceleme kapsamı

6568 tracked dosya domain envanterine alındı; 25 kritik üretim dosyasındaki bağlantılar kaynak düzeyinde izlenip digest ile sabitlendi. Bu sayı dosyaların bütün satırlarının incelendiği anlamına gelmez. Tam domain sayıları MANIFEST.json, dosya başına coverage INVENTORY.jsonl içindedir; untracked yollar ayrı UNTRACKED.json'dadır. Connector/extension içerikleri, enterprise dış-sistem etkileri ve canlı platform matrisi inceleme açığı olarak korunur.

Bu tur test/tsc/lint/build çalıştırılmadı; yeni PASS iddiası yok. Önceki test ve canlı komutların exit kodları bağlantılı RESULT/MANIFEST kanıtlarında korunur. Envanter/digest üretme komutu exit0. ENTRY227 gövdesi yeniden aynı 6f0b483fea73… digest'ini verdi; header uyuşmazlığı ve mevcut228 yanıtı korunuyor.
