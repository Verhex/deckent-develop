# Historical verification amplification

- **Rapor UTC:** 2026-09-13T15:02:00Z
- **Kapsam:** MASTER3178 / parent120 / task 757-001 için bounded, salt-okunur çağrı-zinciri analizi
- **Durum:** Analiz tamamlandı; production runtime değişikliği ve product closure **claim edilmez**.
- **Yöntem sınırı:** Yalnız izin verilen kaynaklar ve korunmuş 755 kanıtı okundu. Full-history loop, canlı lifecycle, raw memory DB, secret, provider veya XVerify kullanılmadı.

## 1. Bağımsız incelenen girdiler

SHA-256 değerleri bu worker'ın doğrudan dosya-byte gözlemidir; satırlar aynı preimage içindir.

| Girdi | SHA-256 | İlgili satırlar |
|---|---|---|
| docs/execution/evidence/astra-recovery-20260912/chain-752-repair/755-resource-summary.json | 8d2377d01cc10fff338788d670fe439a10fbb2aa2a29786a4defe992b05e2d58 | 2–10, 12–19, 26–33, 36–46 |
| docs/execution/evidence/astra-recovery-20260912/chain-752-repair/R3-RESULT.md | 2c98d3832022151f816c8f17f5869f969cef8896a09f11f45f7a0349cf8a3415 | 7–9, 13–21, 25, 29, 31 |
| src/core/custody-read-snapshot.ts | 7f9dd99d90407802747c3c8e4f194fb2401ae13a828405b49fa10f9472706942 | 18–20, 46–72, 74–109, 111–162 |
| src/orchestra/exact-docker-container-observation.ts | 2e10d30a4b618661b1a331a0714f539042cb7b33a3a97611669b1d9c780b56e7 | 9–20, 21–46 |
| src/orchestra/spawn-backend-docker.ts | bfeabbc4f7fd35559dc49c1ff6a4736465909a3ab1ecc9ee141cfec5b842ee48 | 5433–5527, 11465–11534, 11537–11870, 14976–15180, 15427–15533, 15632–15760, 17194–17229, 17679–17728, 18485–18545, 19563–19816, 20863–20885 |

İzinli parallel-start dizinindeki diğer raporlar yalnız PENDING_WORKER placeholder içerdiğinden ölçüm veya closure kanıtı sayılmadı.

## 2. Ölçülmüş kanıt — yalnız preserved 755

1. 755-resource-summary.json:5–10: CLI exitCode=0, toplam elapsedSeconds=2216.7537978499995.
2. Aynı dosya :12–33: host-observed HWM 9079120 KiB; son örnekte user CPU 1631.27 s, system CPU 238.97 s, rchar=22358490442, read_bytes=888909824.
3. Aynı dosya :36–46: provider receipt aralığı 115.002 s; Docker örneklemesinin exact worker peak olmadığı ve toplam sürede host clock delay bulunduğu açıkça sınırlandırılmıştır.
4. R3-RESULT.md:13–15: altı gerçek archive read'in event loop'u önce yaklaşık 14 s bloke ettiği; onarılan binary'de altı archive read'in 16.4 s sürdüğü ve Docker absence yanıtının korunduğu yazılıdır.
5. R3-RESULT.md:17–21: CLI toplamı 2216.754 s, provider-start→exit 115.002 s, host HWM 8.66 GiB; ayrıca cleanup_delay_ms=180000 kaynaklı ayrı üç dakikalık bekleme bildirilir.
6. R3-RESULT.md:25,29: full host performansı veya genel self-audit green değildir; formal cross-provider XVerify unavailable/HOLD'dur. Bu rapor XVerify receipt değildir.

**Ölçümden çıkarılamayanlar:** Her readChain, JSON parse, SHA-256 veya semantic validation çağrısının tekil süresi; tarihsel admission sayısı; 16.4 saniyenin altı stage'e mi yoksa altı üst-seviye archive read'e mi dağıldığı; byte/entry maliyeti; cache hit oranı. Kanıt **unavailable**. Bu rapor yeni süre ölçümü üretmez.

## 3. Gözlenen çağrı grafiği ve input identity'leri

### 3.1 Planning/start admission yolu

inspectExactDockerPlanningRecoveryHealth(projectRoot, options)
→ canonical project/root çözümü
→ TaskAttemptCustodyStore.open(create:false)
→ createExactDockerCustodyPolicy()
→ store.listDispatchAdmissionsForRecovery(...)
→ her admitted entry için store.releaseVerifiedReadSnapshotPayloads()
→ inspectAdmissionResolvedForPlanning(store, policy, entry)
→ terminal RELEASED ise reconstructExactDockerRecoveryScope(...)
→ retained-negative kontrolleri
→ readExactArchivedAttemptDisposition(scope)
→ altı canonical TASK_ATTEMPT_CUSTODY_CHAIN_STAGES için ayrı store.readChain(identity, policy, stage)
→ stage identity ve predecessor digest semantic kontrolleri.

Kaynak: spawn-backend-docker.ts:5433–5527,17679–17728,18497–18538.

Verified snapshot yalnız options.verifiedReadSnapshot === true iken store.withVerifiedReadSnapshot({maxEntries:100000,maxBytes:64MiB,maxDurationMs:10000}, readHealth) ile açılır (:5523–5527). Varsayılan yol proven reader'dır (:5442–5445); snapshot'ın production-default olduğuna dair kanıt yoktur.

Input identity: store/root için canonicalProjectRoot + absoluteRoot + projectId; policy için policyDigest; admission için dispatchRequestId + admissionReceiptDigest + refDigest; attempt için projectId + taskId + attemptId + generation; chain member için attempt identity + stage; linkage için receiptDigest + predecessorDigest + artifact receipt.

### 3.2 Gerçek startup/restart reconciliation yolu

reconcilePendingAttempts(options)
→ reconcileExactDockerCustodyAdmissions(report, options)
→ openExactDockerRecoveryStore()
→ listDispatchAdmissionsForRecovery(...)
→ her admitted entry için reconstructExactDockerRecoveryScope(...)
→ retained-negative / rejected / started-failed / dispatch authority okumaları
→ readExactArchivedAttemptDisposition(scope)
→ yine altı stage için readChain(...)
→ contain modunda exact backendExecutionId ile observeExactDockerDaemonContainerState(...).

Kaynak: spawn-backend-docker.ts:19563–19676,19759–19816,20863–20885.

Docker gözlemi ayrı worker thread'de, yalnız exact docker inspect --format '{{.State.Running}}|{{.State.ExitCode}}' validated-name şekline izin verir; malformed input unavailable() olur. Worker exit etmeden sonuç resolve edilmez (exact-docker-container-observation.ts:9–20,21–46). Bu izolasyon daemon deadline doğruluğunu korur fakat retained-history Store okumalarını hızlandırdığına dair kanıt değildir.

### 3.3 Admission prepare/replay yolu

prepareExactDockerCustody(input) içindeki tekrarlar:

- boundary parse/shape validation ve approved/dispatch/lineage material digest hesapları (spawn-backend-docker.ts:11537–11571);
- bütün record için inputDigest (:11611) ve process-local dispatchRequestId replay map kontrolü (:11612–11618);
- durable replay'de readDispatchAdmission, dispatchRequestMaterial digest karşılaştırması, readTaskSnapshot, parseExactDockerDispatchSnapshot, prompt digest ve çoklu canonicalJson semantic equality (:11778–11818);
- ardından openAttemptAccess ve readDispatchAuthority (:11819–11835).

Input identity dispatchRequestId + exactCustodyJsonDigest(record); durable identity admission ref + snapshot proof SHA-256 + policy'dir. Process-local map restart sonrası authority değildir; durable Store tekrar okunur. Bu doğru restart/tamper davranışıdır.

### 3.4 Accepted-result finalization yolu

worker ingress artifact + provider/effect/usage/billing durable authority
→ assembleCanonicalIngressResultV2
→ canonical accepted bytes
→ verified effect landing + effect-landing chain read
→ publishHostArtifact(canonical-accepted-result)
→ appendChain(accepted-result, predecessorDigest=effectLandingChain.receiptDigest)
→ readExactDockerAcceptedResult(reader) ile hemen yeniden okuma
→ settleExactDockerAcceptedResult(...) girişinde aynı reader'ın yeniden readExactDockerAcceptedResult çağrısı
→ production-wiring host settlement
→ settleExactAcceptedTaskEvaluation(...)
→ gerekirse external confirmation sonrası aynı settler'ın Store'u yeniden okuması.

Kaynak: spawn-backend-docker.ts:14976–15106,15109–15180,15427–15495.

Cold/restart consumer ayrıca admission, task snapshot, dispatch admission/authority, provider observations, accepted artifact receipt+artifact+chain, effect authority ve provider stream'i tekrar okur; accepted JSON'ı JSON.parse ve validateProductionTaskResultV2 üzerinden geçirir (:15498–15533,15632–15760). Input identity scope.identity + policy + artifactClass/artifactKey/receiptDigest + acceptedResultChainDigest + provider observation receipt/digest + projectionFence bileşimidir.

## 4. Tekrar amplifikasyonu: gözlem ve hipotez

### 4.1 Doğrudan kaynak gözlemleri

- Planning health ile startup reconciliation ayrı top-level çağrılardır ve ikisi de durable admission listesini tarar.
- İkisi de archived terminal attempt'i readExactArchivedAttemptDisposition ile değerlendirir.
- Helper her çağrıda altı canonical stage'i ayrı readChain ile okur, identity alanlarını ve predecessor zincirini yeniden doğrular.
- Accepted-result üretimi sonrasında aynı opaque reader hemen okunur; settlement girişinde yeniden okunur.
- Cold finalization/restart yolu aynı accepted JSON ve ilişkili authority/artifact/chain girdilerini tekrar parse/hash/semantic validation'a sokar.
- CustodyReadSnapshot persistent authority cache değildir; tek synchronous read operation içindir. Cache hit olsa bile verify() çıkışta her physical observation'ı gerçek adapter'dan yeniden okur, discovery scan: fence'lerini en son doğrular (custody-read-snapshot.ts:18–20,83–109,146–162). releaseCachedValues semantic memo'yu temizler ama observation fence'lerini tutar (:58–72).

### 4.2 Statik hipotezler — ölçülmemiş

1. **H1:** Planning health ve hemen ardından startup reconciliation aynı Store preimage'i görüyorsa archive chain işi entry başına iki kez yapılır. Kaynak grafiği bunu mümkün kılar; 755'te iki çağrının exact aralığı unavailable'dır.
2. **H2:** Her readChain bytes okuma + parse + hash yapıyorsa maliyet O(admission × 6 × top-level pass) olur. TaskAttemptCustodyStore.readChain implementasyonu izinli kaynaklarda değildir; iç işlem seti ve katsayı doğrulanamamıştır.
3. **H3:** readExactDockerAcceptedResult'ın publish sonrası ve settle öncesi iki çağrısı aynı immutable input üzerinde artifact/chain/semantic tekrarına yol açar. Çağrı tekrarı gözlemdir; süre/memory etkisi ölçülmemiştir.
4. **H4:** 755 rchar, CPU ve HWM'nin history payı attribution olmadan belirlenemez. Tamamını history'ye bağlamak yanlıştır; ayrı 180 saniyelik cleanup delay ölçülmüştür.
5. **H5:** Snapshot peakRetainedBytes process RSS değildir (custody-read-snapshot.ts:58–60); 755 HWM'yi açıklamaz.

## 5. Exact bounded sonraki onarım

### 5.1 Önerilen dosya kapsamı

Production değişikliği ayrı admitted task olmalı ve yalnız şunları kapsamalıdır:

1. src/core/custody-read-snapshot.ts
2. src/orchestra/spawn-backend-docker.ts
3. İlgili mevcut test dosyaları — exact test path'leri bu görevin read scope'unda olmadığı için **unavailable**; sonraki task admission'ında owner tarafından exact allow-list'e konmalıdır.

Bu rapor bu dosyaları değiştirmez. Canonical authority TaskAttemptCustodyStore ve immutable receipt/digest zincirinde kalır; process-local veya persisted verified=true kararı authority yapılmaz.

### 5.2 Repair sözleşmesi

**R1 — Tek bounded verification context.** Planning admission ile gerçek start/reconciliation arasında yalnız aynı coordinator operation içinde taşınabilen opaque CustodyReadSnapshot/frontier capability kullan. Key:

projectId | canonical absoluteRoot | policyDigest | admissionRefDigest | attempt identity | observation kind | stage/artifact key | expected receipt digest.

Task ID, directory mtime veya wall-clock freshness tek başına key olmasın.

**R2 — Physical observation ve semantic result ayrımı.** Raw immutable bytes/proof mevcut observe(...) ile fingerprint fence altında paylaşılabilsin. Deeply immutable parsed JSON/chain disposition yalnız memoForOwner(owner,key,read) ile aynı consumer owner ve observation identity altında kullanılsın. Mutable buffer, adapter veya path handle capability dışına kaçmasın.

**R3 — Bounded payload.** Hard maxEntries/maxBytes/maxDurationMs korunur; her admission sonrasında releaseCachedValues() ile payload/semantic memo bırakılır, observation fence'leri tutulur. Budget/deadline aşımı typed HOLD üretir; uncached-success veya gate gevşetme fallback'i yoktur.

**R4 — Çıkış doğrulaması.** Consumer karar yayımlamadan Store snapshot view'dan detach edilir ve verify() çağrılır. Non-scan observations, sonra discovery scan: girdileri gerçek adapter'dan yeniden okunur. Mismatch changed; mutation mutation; limit budget; süre deadline olarak fail-closed/HOLD kalır.

**R5 — Planning→start sınırı.** Snapshot tek operation/deadline ile sınırlıdır. Arada başka event-loop turn, approval, Store write, policy change veya deadline varsa context taşınmaz; startup yeni scan yapar. Persistent cache önerilmez.

**R6 — Finalization sınırı.** Accepted artifact publication, chain append, evaluation/finalizer/settlement/archive append mutation boundary'dir. Her append eski snapshot'ı denyMutation() ile invalid etmelidir. Publication sonrası reread ve settlement aynı yeni bounded context'i kullanabilir; external confirmation await, restart veya Store mutation sonrası gerçek reread gerekir.

**R7 — Ölçülebilirlik.** CustodyReadSnapshotStatistics yalnız bounded pass telemetry'sidir. Baseline/repaired run'da aynı identity setiyle pass count, hits ve duration ölçülsün. Authority/receipt değildir; 755 için geriye dönük değer uydurulmaz.

### 5.3 Producer / consumer / ingress / policy

- **Producer:** Host-private TaskAttemptCustodyStore adapter physical bytes ve immutable receipt/proof üretir; chain publishers canonical zinciri üretmeye devam eder.
- **Ingress:** listDispatchAdmissionsForRecovery, readDispatchAdmission, readTaskSnapshot, readDispatchAuthority, readChain ve verified artifact/effect readers. Snapshot disk schema değil, bounded observation layer'dır.
- **Consumer:** planning health, startup reconciliation, archived disposition reader, accepted-result reread ve evaluation settler.
- **Policy:** createExactDockerCustodyPolicy().policyDigest, artifact/json bounds ve snapshot hard bounds. Policy digest değişirse reuse yoktur.
- **Canonical authority:** Store bytes + admission/artifact/chain receipts + SHA-256/projection/predecessor fences. Snapshot statistics/cache/process memory terminal authority değildir.

## 6. İptal, tamper ve restart failure boundaries

| Olay | Zorunlu davranış |
|---|---|
| Aynı key fingerprint'i değişir | Snapshot changed; publication yok; typed HOLD |
| Discovery membership değişir | scan: en son verify edilir; stale set kabul edilmez |
| Store append/mutation olur | denyMutation(); eski context success veremez |
| Entry/byte/deadline sınırı aşılır | budget/deadline HOLD; limitsiz retry/full-history fallback yok |
| Parse/schema/semantic validation başarısız | Mevcut exact reason/HOLD; cached success maskesi yok |
| Coordinator restart/process ölümü | In-memory snapshot atılır; Store'dan yeni bounded scan |
| Policy/project/root/tenant identity değişir | Key mismatch; reuse yok; cross-tenant alias fail-closed |
| External confirmation/async sınırında Store drift'i | Yeni context veya gerçek reread |
| Docker state unknown | absent varsayılmaz; archived-attempt contain HOLD korunur |
| Archive chain eksik/çelişkili | Archived sayılmaz; ordinary reconciliation/HOLD sürer |

## 7. Platform ve tenant etkileri

- **Linux:** POSIX adapter ve case-sensitive path identity korunur; cache canonical absolute root + projectId ile scope edilir.
- **WSL:** process.env.WSL_DISTRO_NAME ile wsl2-linux ayrımı korunmalıdır (spawn-backend-docker.ts:15691–15697). Windows-host ve Linux mount path aynı key'e normalize edilmez; distro/root değişimi invalidation'dır.
- **macOS:** Docker Desktop daemon gözlemi isolated worker'da kalır. Filesystem normalization/case farkı nedeniyle canonical root byte identity ve policy digest olmadan reuse yapılmaz.
- **Windows:** İncelenen production Store composition POSIX adapter kullanır; native Windows custody semantics kanıtı **unavailable**. Repair native-path desteği iddia etmemeli; exact platform tests olmadan GO verilmemelidir.
- **Tenant:** projectId, canonical root ve admission identity key'in zorunlu parçalarıdır. Process-global/shared tenant cache yoktur. Aynı taskId/dispatchRequestId başka project için hit oluşturamaz; strictTenantIsolation gevşetilmez.

## 8. Sonuç

Kaynak grafiği repeated retained-history verification'ı planning/start archive-chain pass'lerinde ve accepted-result finalization/cold-recovery reread'lerinde gösterir. Preserved 755 toplam maliyeti ve altı archive read'in 16.4 s sürdüğünü gösterir; tekil parse/hash/semantic attribution göstermez. Öneri tek bounded operation içinde fingerprint-fenced reuse sağlar, mutation/restart/policy/root/tenant değişiminde invalid olur ve çıkışta real adapter reread'iyle canonical Store authority'yi korur.

Bu bir **documentation/analysis artifact**tır. Runtime onarımı uygulanmış, test edilmiş, XVerify edilmiş veya product outcome kapanmış değildir. Sonraki production task yukarıdaki exact source scope'u ve owner-supplied exact test path'lerini admission'a bağlamalı; 755'i baseline tutup yeni ölçümü ayrı kanıt olarak üretmelidir.
