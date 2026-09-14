# 758 sonrası devam planı — kontrol edilmiş, execution başlatılmadı

UTC 2026-09-13T18:13:14.655394+00:00. Tek outcome MASTER3178 RECOVERY-DO-DOGFOOD-001 / parent120 OPEN; epoch7 CODEX; DOGFOOD ON / MAIN. Owner kapsamı mevcut dogfood recovery. Yeni ürün outcome'u veya closure disposition yok. Bu belge uygulama/recovery receipt'i değildir.

## Kontrol sonucu ve kanıt sınırı

- Flow b7f53da8-ba6d-45b1-90bd-d70eae56f20c RUN_FAILED17:47:26.667Z, CLIexit1. Canlıstart/recover veya çalışan deckent-x container yok.
- .tasks altında758001/002/003 için3taskJSON+3skilldelivery; taskstatusEXECUTING. 004–008yok.
- Gerçek checkpoint `.deckent/sprint-758-checkpoint.json`: timestamp17:31:00.763Z,brainPhaseSPAWN. Önceki alternatif checkpoint dizininde bulunmaması checkpoint yokluğu değildi. Sprint archive `.deckent/archive/sprints/sprint-758` yok.
- 001 ve003 Docker `ps --all` ile Exited(0), fizikselcontainerkorunmuş. İkisinde dispatchRELEASED/providerexit0 ama effect/accepted/evaluation zinciri yok; lifecycle PROVIDER_START_AUTHORIZED. Container canlı değil ≠ silinmiş.
- 002 altızincir; acceptance0/7decided/CONFIRMATION_MISSING. Mevcut archive başarılı ürün kabulü değildir.
- 001 effectdiagnostic FINAL_CAPTURE/FIRST_CAPTURE/HELPER_RUN/ADAPTER_UNAVAILABLE;003logcapturetimeout. Eski757003NOT_DISPATCHEDreceipt korunuyor.
- Coverage: exact758flow,6taskprojection,1checkpoint,3attemptdispatch+lifecycle+chain,2stoppedcontainer; CLIrecover→recoveryoperation→backend retention adayının kaynak yolu ve resultcollector→IPC error yolu incelendi. Wholehistorystore/fullsuite/rawproviderstream/rawmemory/auth okunmadı. Paidproviderulaşılabilirliği buplanadımı için test edilmedi. MASTERrow1052OPEN okundu; ClosureOS head yeniden ölçülmedi/dispositionmutateedilmedi.

## Amaç

Dogfood: aynı eski attempt'leri her yeni start'ta yeniden patlatmadan güvenli negatif disposition'a bağla; gerçek worker çıktısını koru; sonraki boundedstart'ın sonuçlarını doğru topla.
Ürün: CLI/Terminal/MCP/Desktop/Dashboard aynı canonical run/task/worker/failure/retention durumunu yansıtsın. Exit0, retained, accepted, criteria-pending ve DONE birbirine karışmasın; model bittiğinde host'un hangi aşamada olduğu görülsün.

## Bağımlılık sırası

A → B → C → D → E. Her dilimde exactfile scope/baseline tek-yazar kaydı açılacak; R6bütçesi sıfırlanmayacak. Plan mevcutonaylıkapsamı detaylandırır; şimdi mutation/koşum yok.

### A — 758'i güvenli başarısız/korunmuş duruma uzlaştır

1. Exactidentity/daemonlabel/mount/resource/exit ile001ve003 için canonical `--retain-started-failed` uygunlukpreview. Görevdisposition'ı için tekkomutun exit0'ı yetmez: matchingreceipt+providerstopped+noaccepted/nohosttransaction kanıtı gerekir.
2. 002receipt/zincirveçıktı korunur; acceptancepending başarısız ya da başarılıymışgibi yeniden yazılmaz. Eski757001partial ayrı lineage olarak korunur.
3. Previewuygunsa aynıdispatchidentity ile canonical retention. Bu işlem sonuçları başarılı kabul etmez, containerlarısilmez, settlement tamamlandıdemez. Ardından genericrecoverpreview→artifactpolicyyeuygun arşiv/koruma. `--skip-audit` kullanılır; ertelenen genelGATE_FAILURE paketi koşulmaz.
4. Sprintnegativeclosure,taskprojection ve attemptretention ayrı doğrulanır. Runtime çalışmıyor, staleEXECUTING yok, preservedartifact inventory+hash var. Yeni start admission sağlık kapısı uygun değilse typedHOLD; sadecekapanışıbloklayan defect onarılır.

Aday exactkomutlar (ŞUAN ÇALIŞTIRILMADI):
```sh
node dist/cli/entry.js recover sprint-758 --retain-started-failed dreq-f7a7b516c757d5338597a9be9217c4a48162c0f566cab4f1aa2a4cfdae6345a8 --dry-run --skip-audit --json
node dist/cli/entry.js recover sprint-758 --retain-started-failed dreq-bc12e15bc87bb90410f197d6899a05a3728e9d4cb5015a9284780e0c5509f91c --dry-run --skip-audit --json
node dist/cli/entry.js recover sprint-758 --dry-run --skip-audit --json
```
Mutationyalnızpreviewuygunluğundan sonra aynıparametrelerin documentedforce yoluyla; no broadkill/rm. `retain-released-unaccepted` buikiattempt için doğruvarsayılan değil: READY_FOR_LANDING+RELEASEDworkspaceprogress gerektiriyor, şimdikikanıtproviderstage.
Kaynak: recover.ts:181–190; sprint-recovery-operation.ts:616–678,695–713,738; spawn-backend-docker.ts:17876–17986. Genericrecover yalnızpreadmissionreservationlarıfiltreliyor; admittedpartiallarıkendiliğindençözmüşsayma.

### B — Capture failure'ın gerçek nedenini ölç ve onar

DarADR-D-007recoveryseam, izoleworktree. Adayhotfiles: spawn-backend-docker.ts,exact-docker-workspace-command.ts,exact-docker-container-observation.ts ve canonicaleffectdiagnostic schema'nın gerçekproducer/consumer dosyaları (inventoryilekesinleştirilecek).
- HELPER_RUN sonucundan typedexitCode/signal/timedOut/overflow/adapterstage/commandelapsed/deadline/childclose bilgisi boundedvepath/secretsiz taşınır. Rawstderrproseyeveauthorityreceipt'inegelişigüzelbasılmaz.
- Doğru ayrım: gerçekhelperfailure / daemonunavailable / commandtimeout / eventloopdispatchdelay / outputoverflow / malformedreceipt. Mevcutkanıt bunları ayıramıyor.
- Tamhelpercapture yolu resourceidentity/copy/digest doğrulamalarınıkoruyarak reproduction. Saltread-onlyinspectthread onarımı `docker run`helper'ını kapsamıyor; kör60→600stimeoutraise veya genelDockercommandthread'eatma yok.
- Hipotez doğrulanınca yalnızo mekanizma düzeltilir. Kanıtı olmayanfailedattempt tekrarprovider'akoşturulmaz.

### C — İlk hata, partial sonuç, IPC ve negatif kapanışı tek zincirde taşı

Adaydosyalar: scheduler-effects.ts, result-collector.ts, spawn-backend-docker.ts, ipc-registry.ts, sprint-controller.ts, canonicalrunstatusproducer/readmodel. Aynıhotfile üzerindeeşzamanlıworker yok.
- CaptureHOLD typedtaskresultauthority'de kalır. Worker bitinceIPCconversation yoklaması asılhatayıPRIVATE_IPC_AUTHORITY_UNAVAILABLE'aindirmez; openquestion varsa yetkisizsessizgeçişyok.
- Bir taskHOLD olduğunda siblingaccepted/archive sonuçları toplanıp korunur. 0/8collected sayacı altında completedcustody gizlenmez.
- Abortsonrasıyeniadmissiondursun; başlamışsiblinglerin existingpolicyyeuygunsettlement/containment kararıdurableolsun. Ownerkill kapısı aşılmasın. OuterFAILED iletaskEXECUTING çelişkisi projection reconciliation'da görünür/typedçözülsün.
- Genelapplicationauthority shared; CLI/Terminal/MCP/API adapterları ayrıstatusengine üretmesin. Dashboardyalnızprojection, Desktop/Terminalkontrolyüzeyi.
- i18n en/tr; user-facing metinler messages.ts. Geçmişimmutable receipt'e dokunma.

### D — Başlangıç ve finalization hızını kanıtla düzelt

B+C doğrulukkapılarından sonra; 11dk23sadmission vehostCPU1656.97sölçümü baseline. Aday: custody-read-snapshot.ts,task-attempt-custody-store.ts,spawn-backend-docker.ts,exactruntimeingress.
- Planninghealth/startup/finalizer tekrarparse/hash/semanticverification yollarını tekexactattempt ölçümüyle ayır. Function-level attribution olmadan hıziddiasıyok.
- Reuse yalnızexactroot/tenant/policy/identity/contentdigest/operationfence içinde; tamper,deletion,replacement,restart,concurrentwrite invalidation korunur. Kalıcıtrustcache veya doğrulamayıskip etmekyok.
- Tekmonotonic saatle phaseenter/exit süreleri; UTCyalnızzamanankrajı. Queue/provider/hostverify/cleanup/userwait ayrı. 71.134sUTC-monotonicfarkınıkarıştırma.
- LiveCLI/TerminalveAPIconsumer güncelphase+elapsed gösterir; backendcounter authorityolmaz. GlobalmetricGateFailureyenidentasarımı kapsam dışı.

### E — Gerçek dogfood yeniden doğrulama

A–D'nin gerekli onarımları scopedverified+buildidentitymatch olduktan sonra yeni **tek** canonicalstart proofcontract. Önce8task, config+rolepolicy+providerquota+resource+collisionadmission resolve; staticworkeradetdayatmayok. Geçmişnegativereceiptlerindriftolmaması,providerstart/exit,artifactlanding,criteriaevidence,collectorcount,settlement/archive veCLI/APIprojectionparity kaydedilir.

Başarı: silentuncollectedresult yok; workerexit0 ürünDONEdiyeatlanmaz; her task ya kanıtlıkabul ya exactterminalnegative/retaineddurumda; outerdurum tutarlı; kullanıcıya gizliuzunhostwait açıklanır. 8tasktamkanıtlanmadan15/30yok. FormalXVerifyfreshdifferentprovider+usage+receipt yoksaHOLD; sameproviderselfreviewkapanışsayılmaz.

## Bütçe, doğrulama, güvenlik

Herrepair1implementationpass+1scopedverificationpass; yeni diskfailure olmadanextraaudit yok. Targetedtest/tsc/localbuild;fullsuiteyok,16GiBtestcap. B veC için ayrı birer kontrollünonproductreproduction; enson1livecanary. Aynıfailurefingerprintteotomatikretryyok. Runtimeexecutiontime/cost effectiveconfig'ten; öncekimodel/providerwait ilehostişlemi ayrımı raporlanır. Baselinecap'i uzatarakstallyok.
Cross-platformsözleşmeLinux/WSL/macOS/Windowsadaptercapability+tenant/projectisolation; buhostunDockerkanıtıdiğerplatformkanıtıdeğildir. UnsupportedtypedHOLD. Source/build canlıkoşumdadeğişmez. Auth/mode/memoryellemutateedilmez. Commit/push, broadcleanup, closureledgerowner gateayrı; yeni onay sorusu buplan için gerekmiyor. Rapor,planvecurrent-flowharici dosyamodificationyok.

## Teslim kanıtı

Her dilim: path:line+SHA256+UTC, komutexit, exactidentity/failurefingerprint, preservedresource ve rollback/reconcile yönü. Tests yalnızdestek. Finalkanıt gerçekcanonicalrun+terminalnegative/successsemantics+projectionparity. R6/RESULT.md ve SUMMARY.json baseline. 758kapanmadan yeni759başlatma; yalnızkapanışaengelolanboundedrecoverykodu istisna.
