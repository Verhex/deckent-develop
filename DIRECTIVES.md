# MASTER 3284 — DURABLE REPAIR QUEUE + QUIESCENCE GATE (RECOVERY-BORN-488-REPAIR-DISPATCH-001)

## Goal

Acceptance'ın iki yarısı bugün kod-karşılığı olmadan duruyor: **(a)** "Every admitted repair
enters one durable runnable queue and is dispatched before quiescence" — oysa repair
dalgalarının overflow kuyruğu `waitForResults`'a `undefined` geçiliyor ve yalnız log'lanıyor;
**(b)** "PAUSE is legal only after the queue, active attempts and authorized repair decisions
reach a fenced quiescent snapshot" — oysa PAUSE kararı (cascade circuit-breaker + unresolved
lineage hold) diskte bekleyen, hiç dispatch edilmemiş admitted repair'lere bakmıyor. Bu run
her iki yarımı da kapatır: overflow kuyruğu gerçek dispatch mekanizmasına bağlanır, kuyruk
PAUSE/resume sınırında hayatta kalan tek durable kimliğe kavuşur ve PAUSE ancak fenced
quiescent snapshot'tan sonra legal olur.

Ürün karşılığı: bugün bir kullanıcının run'ında slot dolduğu için kuyrukta kalan bir onarım
task'ı sessizce düşebiliyor ve run "PAUSE" diyerek duruyor — kullanıcı ekranda hiçbir sebep
görmüyor. Bu iş, "kabul edilmiş her onarım ya koşar ya da typed sebeple raporlanır"
garantisini ürüne getirir.

## Execution contract

- Kalite barı aynen: i18n-FIRST (user-facing metin `getMessage` en+tr) · 0-hardcode
  (eşik/bound literal'i yok, effective config'ten) · hermetik test (tmpdir, spawnSync yok) ·
  mevcut-pattern (yeniden icat yok) · assertion zayıflatma YASAK.
- Test komutları TASK-SCOPED ve TEKİL. Authority/emsal dosyaları Reads'tedir.
- Davranış-değişimi FIX/re-dispatch dalgalarıyla sınırlıdır; EXECUTE fazının mevcut kuyruk
  davranışı emsaldir ve DEĞİŞTİRİLMEZ.
- `postFix` dalgası bilinçli kapsam dışıdır: o dalga `respawnEligibleTasks` ile çalışır ve
  overflow kuyruğu üretmez — orada "discarded queue" sınıfı yoktur.

## Task 1: Overflow kuyruğunun gerçek dispatch mekanizmasına bağlanması
- Files: src/orchestra/sprint-phases.ts, tests/orchestra/repair-overflow-dispatch.test.ts
- Reads: src/orchestra/result-collector.ts, src/orchestra/sprint-controller.ts, src/orchestra/scheduler-effects.ts, src/orchestra/sprint-spawner.ts
- Priority: HIGH
- Agent: implementer
- Model: gpt-5.6-sol
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/orchestra/repair-overflow-dispatch.test.ts
### Description
`runFixPhase` içinde iki dalga `spawnWorkers`'ın overflow dönüşünü alıp ATIYOR: FIX dalgası
(`fixWaveQueue`, dosyadaki "this phase has always DISCARDED the wave's overflow queue"
yorumunun bulunduğu blok) ve NOT_DISPATCHED re-dispatch dalgası (`reDispatchQueue`, "Same
discarded-queue hole as the FIX wave above" yorumu). Her ikisinde de hemen ardından gelen
`waitForResults(...)` çağrısının 4. argümanı (`queue`) `undefined` geçiliyor. Bu argüman
üretimde ZATEN çalışan bir mekanizmadır: EXECUTE fazı kendi kuyruğunu
`sprint-controller.ts` içindeki `waitForResults` çağrısına `taskQueue` olarak geçirir ve
`result-collector.ts` bunu `remainingQueue` FIFO'suna alıp `planDispatch` ile slot- ve
dependency-farkında dispatch eder. Yapılacak: her iki repair dalgasında `undefined` yerine
kendi overflow kuyruğu geçirilir. Mevcut `publishSchedulerSpawnSkips` gözlem-yayını KALIR
(artık "hiç koşmayabilir" değil "kuyrukta, dispatch sırası bekliyor" anlamını taşıdığı için
skip-açıklama metinleri buna göre güncellenir — i18n'e tabi user-facing metin varsa
`getMessage`). Yanıltıcı hale gelen iki yorum bloğu gerçeğe göre yeniden yazılır.
Test (hermetik, tmpdir, gerçek process YOK — spawn/collector seam'leri inject edilir):
(1) slot'tan taşan bir FIX task'ı kuyruğa girer ve slot boşalınca dispatch edilir;
(2) aynısı NOT_DISPATCHED re-dispatch dalgası için; (3) dependency'si tamamlanmamış kuyruk
üyesi sırasını kaybetmez (`planDispatch` sözleşmesi korunur); (4) regresyon-pini: `queue`
argümanı `undefined` geçilirse test kırmızıya döner (bu boşluğun geri gelmesi build-hatası
olur).

## Task 2: Admitted-repair kuyruğunun durable kimliği
- Files: src/orchestra/repair-queue-authority.ts, src/orchestra/sprint-phases.ts, tests/orchestra/repair-queue-authority.test.ts
- Reads: src/orchestra/scheduler-effects.ts, src/core/task-lineage.ts, src/core/constants.ts, src/orchestra/sprint-phases.ts
- Priority: HIGH
- Agent: implementer
- Model: gpt-5.6-sol
- Dependencies: Task 1
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/orchestra/repair-queue-authority.test.ts
### Description
Bugün "kuyruk" her turda `.tasks/` dizininin yeniden taranmasından türetiliyor ve
dispatch-niyeti yalnız in-memory yaşıyor; PAUSE/resume sınırında "kabul edildi ama hiç
dispatch edilmedi" bilgisi hiçbir artefaktta durmuyor. Yeni modül tek bir durable authority
yazar: her admitted repair (FIX, FIX-FIX, cross-dependency ve NOT_DISPATCHED re-dispatch
doğumları) için schema-versioned kuyruk kaydı — queueId, exact task id, doğum-sınıfı, admission
zamanı, dispatch durumu (`queued` | `dispatched` | `settled`) ve attempt bağı. Yazım atomik ve
same-directory temp+rename (repo'daki mevcut authority-writer desenini kullan, yeniden icat
etme); okuma tarafı bozuk/kısmi kaydı typed hata ile reddeder, sessiz fallback yapmaz.
`scheduler-effects` içindeki mevcut shadow-journal GÖZLEM katmanıdır ve olduğu gibi kalır —
bu kayıt onun yerine geçmez, yanına authority olarak gelir. Sprint-phases entegrasyonu:
admission anında `queued`, dispatch anında `dispatched`, terminal sonuçta `settled`.
Test: schema round-trip, atomiklik (yarım dosya okunmaz), aynı queueId'nin iki kez
admission'ının idempotent olması, resume senaryosunda `queued` kayıtların hayatta kalması,
bozuk kayıtta typed hata.

## Task 3: Quiescence kapısı — PAUSE ancak fenced snapshot'tan sonra
- Files: src/orchestra/sprint-controller.ts, src/cli/helpers/message-catalog/cli-runtime-help.ts, tests/orchestra/repair-quiescence-gate.test.ts
- Reads: src/orchestra/repair-queue-authority.ts, src/orchestra/result-evaluator.ts, src/core/task-lineage.ts, src/cli/helpers/messages.ts
- Priority: HIGH
- Agent: implementer
- Model: gpt-5.6-sol
- Dependencies: Task 2
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/orchestra/repair-quiescence-gate.test.ts
### Description
PAUSE kararı bugün iki gate'in mantıksal VEYA'sıdır: `applyCascadeCircuitBreaker` ve
`applyUnresolvedLineageOperatorHold`. İkisi de yalnız `evaluations` haritasına ve task
`.result` dosyalarına bakar; "kabul edilmiş ama hiç dispatch edilmemiş repair var mı"
sorusunu HİÇ sormaz — Sprint-488 defektinin çekirdeği tam olarak budur. Yapılacak: Task 2'nin
durable kuyruğundan typed bir quiescence snapshot'ı türetilir (`pendingAdmittedRepairs`,
`activeAttempts`, `authorizedRepairDecisions`) ve PAUSE kararı bu snapshot'ın fenced-boş
olmasına bağlanır. Snapshot boş DEĞİLSE PAUSE legal değildir: run kuyruğu drenaj eder;
drenaj mümkün değilse (ör. slot/admission gerçekten kapalı) sonuç sessiz PAUSE değil, sebebi
ve bekleyen kuyruk sayısı görünen typed bir outcome olur. Eşik/bound literal'i YOK — mevcut
`fix_circuit_breaker` effective config sözleşmesi kullanılır. Kullanıcıya görünen her yeni
metin `getMessage` en+tr. Mevcut circuit-breaker eşik davranışı (count/ratio) ve truth
normalizasyonu (policy-terminal NOT_DISPATCHED) AYNEN korunur — bu iş onların ÖNÜNE bir kapı
koyar, onları değiştirmez.
Test: (1) bekleyen admitted repair varken PAUSE tetiklenmez; (2) kuyruk boşaldıktan sonra
mevcut circuit-breaker eşikleri eskisi gibi PAUSE verir; (3) drenaj imkânsızken typed outcome
sebebi ve sayıyı taşır; (4) policy-terminal NOT_DISPATCHED satırları quiescence'ı bloke etmez
(zaten terminal); (5) i18n anahtarları en+tr kataloglarında mevcut.

## Task 4: Zincir-mühürü — uçtan uca hermetik regresyon
- Files: tests/orchestra/repair-dispatch-chain-seal.test.ts
- Reads: src/orchestra/sprint-phases.ts, src/orchestra/sprint-controller.ts, src/orchestra/repair-queue-authority.ts, src/orchestra/result-collector.ts, tests/orchestra/cascade-circuit-breaker.test.ts, tests/orchestra/fix-dispatch-continuation.test.ts
- Priority: HIGH
- Agent: test-guardian
- Model: gpt-5.6-sol
- Dependencies: Task 3
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/orchestra/repair-dispatch-chain-seal.test.ts
### Description
Sprint-488 defekt sınıfının kendisini pinleyen tek uçtan uca hermetik senaryo: birden çok
admitted repair üretilir, slot kapasitesi kasıtlı olarak yetersiz tutulur; beklenen sonuç —
taşan repair'ler durable kuyruğa girer, dispatch edilir, hiçbiri sessizce düşmez ve run
kuyruk boşalmadan PAUSE'a girmez. Ayrıca ters yön: gerçekten çözülemeyen bir lineage varken
run'ın PAUSE hakkı korunur (dürüstlük gate'i zayıflamaz). Bu test mevcut süitleri
(`cascade-circuit-breaker`, `fix-dispatch-continuation`, `moat3-*`, `failure-disposition-*`)
DEĞİŞTİRMEZ; onların yeşil kalması bu task'ın kabul koşuludur. Bulgular `.result` notes'a
yazılır; kapsam dışı düzeltme inline YAPILMAZ.
