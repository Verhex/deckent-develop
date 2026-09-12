# Opus 1270 — bağımsız Astra incelemesi

UTC: 2026-09-11T18:10:08.334739+00:00. Kapsam salt-okunur kaynak/diff/kanıt incelemesi; Opus yürütmesine devir veya müdahale değil. Test/tsc/lint/build/runtime replay NOT_RUN. Opus'un ölçümleri ve test sonuçları ayrı-provider raporudur; bu incelemede yeniden ölçülmedi. ENTRY1270 digest ed8de5247ffb433b0b7f8e04006f1d183bdc365444fd0ff56654768fcbb1d0be doğrulandı. Cursor206/207 digestleri de doğrulandı. MASTER/disposition/auth/runtime state değiştirilmedi.

## 1. Planlama modu ve gecikme

**Kaynakla doğrulandı:** `src/cli/commands/do.ts:185` controller.proposeRun; `src/orchestra/run-proposal-compiler.ts:275` default planner doğrudan callZeroConfigPlannerWithReason kullanır. do registration `src/cli/commands/do.ts:360` structured seçeneği taşımaz. Buna karşılık `src/orchestra/sprint-planner.ts:559` options.mode veya resolveBrainPlanningMode(config) çözer. Do'nun config'e rağmen AI istemesi ingress davranış farkıdır.

`src/orchestra/planner.ts:2254` retry özgün prompt'u hata açıklamasıyla yeniden yollar; önceki çıktı üzerine dar patch/repair protokolü değildir. `:2130` her spawn'a aynı timeoutMs gider. Toplam deadline ve kalan-süre hesabı olmadan iki attempt + bootstrap/settlement toplamı tek-attempt vaadini aşar. Attempt kimliklerinin ayrı olması doğru; replay koruması korunmalı.

**Ölçüm yorumuna düzeltme:** ~760x, doğal dilden AI plan üretimi ile hazır structured plan parse işlemi arasındaki oran; eşdeğer iş yükünde motor hızlanması veya AI kaldırma gerekçesi değildir. ~13.7K karakter küçük görünse de tam serialized provider request/tool/reference yükü ölçülmeden prompt etkisi tamamen elenemez. %3 CPU, ağ/model kuyruğunu olası kılar; tek başına nedenini ispatlamaz (IPC/lock/I/O beklemeleri de mümkündür). `planner.ts:871` JSON çıktısı görünür artımlı yanıtı engeller; stream-json ilerleme/ilk çıktı gecikmesini iyileştirebilir, modelin toplam üretim süresini kendiliğinden azaltmaz.

Öneri: ortak planning-intent resolver; doğal dil ile hazır structured input ayrımı; do için açık structured input kaynağı, uygun input yoksa typed unsupported/required-input (NL metnini gizlice DIRECTIVES sayma). Source/config seçimini status'ta göster. Planning boyunca tek monotonic deadline; bootstrap, queue, prefill/first byte, decode, schema validation, repair ve settlement ayrı ölçülsün. Schema repair yalnız hatalı alanları özgün plan hash'ine bağlı düzeltmeli; değişmeyen authority/scope yeniden yetkilendirilmemeli. Bu bir implementation önerisidir, uygulanmadı.

## 2. Host-proof profilleri ve structured üretici

`production-wiring-host-proof.ts:844` producer, consumer, ingress, enablement ve target tuple'ını canonical JSON ile tam eşleştirir. `production-wiring-contract.ts:505` registration üzerinden host-completion yapar. Dolayısıyla yeni topolojinin registry dışı kalması doğrulandı; metrics kaydı yeni capability'nin tamamlandığı anlamına gelmez. Kırmızı observer ayrı implementation eksiği için doğru HOLD.

Exact tuple güven sınırını kaldırmak veya modelin uydurduğu topolojiyi otomatik allow etmek yanlış. Ölçeklenebilir çözüm: versiyonlu/profile-ID'li, language/platform adapter'larıyla doğrulanan proof capability registry; snapshot/digest ve yetki sınırı; unsupported profil için açık typed sonuç. Her product feature için elle yeni literal topoloji eklemeyi tek genişleme yöntemi yapma.

`gen-production-wiring-block.mjs` mevcut host fonksiyonunu kullanması bakımından yararlı recovery/export aracıdır; kalıcı ikinci contract producer olmamalı. Kalıcı çözüm structured proposal → ortak host-completion → canonical input serializer. Host-computed alanları script içinde isim listesiyle silmek drift üretir; tek canonical projection fonksiyonu ve roundtrip (proposal→completed→input→parser→completed) kontratı gerekir. Yalnız producerId ile seçim çoklu consumer/profile olduğunda belirsizleşir; exact profile/identity seçimi gerekli. Scriptte hardcoded TR stderr satırları kullanıcıya sunulacak kalıcı CLI için i18n sözleşmesini karşılamaz.

## 3. Girdi/çıktı şeması tanısı

Ayrım gerçek ve belgesiz kullanım kusurudur: `production-wiring-contract.ts:169,181` completed/input tipleri farklı; parser exactKeys uygular (:368), `task-builder.ts:665` null sonucu genel hata olarak gösterir. Completed şekli girdi sanmak neden reddedildiğini açıklayamıyor.

Önerilen typed tanılar (henüz mevcut API değil): PRODUCTION_WIRING_SCHEMA_KIND_MISMATCH, HOST_COMPUTED_FIELD_AUTHORED, HOST_PROOF_PROFILE_UNREGISTERED; schemaVersion, JSON pointer, beklenen input-kind, offending field adları ve doğru producer komutu. Secret/raw contract dökülmemeli. Mevcut exception class/code compatibility korunup machine-readable detail ile zenginleştirilebilir.

## 4. Cost gate, registry ve activation

**Kesin ingress sırası:** exact-child `src/cli/commands/start.ts:618` evaluateCostGate, `:642` bootstrapProviders. `cost-calculator.ts:620-622` fiyat kaydı ve modelRegistry girdisi yoksa null verir. Bootstrap local model için `provider.ts:1675-1695` health/identity kontrolüyle registry'yi besler. Bu kolda bootstrap'a ulaşamadan model cost gate'te elenebilir.

Ancak “bootstrap yalnız dispatch'te var” genellemesi doğru değil: start başka kollarında :796/:798, sprint-runner-entry.ts:576 daha erken bootstrap kullanıyor. Kusur ingress parity ve process-local registry snapshot sırasıdır.

**ActivationStore'u model kataloğu/fiyat/capability/health authority'sine dönüştürmeyin.** Activation yalnız execution-policy kararıdır; modelin gerçek API kimliği, endpoint health/freshness ve billing sınıfı ayrı kanıtlardır. Bir modelin etkin görünmesi yeterli değildir; bilinmeyen kimliğe bilinmeyen-price sonucu ile aktiflik arasında görünür ayrım gerekir.

Doğru sınır: cost gate öncesi ortak, bounded provider/model evidence preparation; config registry + fresh health/identity → immutable runtime model/cost snapshot → activation policy + billing/quota gates → dispatch. Cost calculator saf kalsın; kendisi network/bootstrap başlatmasın. Yerel/local=0 USD ancak doğrulanmış executionCostClass ile; uzak API endpoint'i adından local sayılmasın. Child aynı snapshot/TTL'yi doğrulamalı veya yeniden hazırlamalı. Health elde edilemiyorsa pricing unknown yerine typed MODEL_IDENTITY/HEALTH_HOLD ayrımı. ModelActivationStore'u paralel allowlist ile değiştirmeden metadata ayrımı korunur.

## 5. Detached start yaması — REVISE

Erken ölümü görünür kılmak olumlu; 1.5s yaşayan PID execution-start kanıtı DEĞİL. `start.ts:929-945` sonrası admission'da ölen child hâlâ yanlış başarı gösterebilir; 1.5 saniyeden kısa gerçek başarılı child ise hata sayılabilir. `pid-liveness.ts:25` Linux'ta /proc varlığına bakar; zombie/reused PID veya başka process start-token ayrımını taşımaz.

Kalıcı kontrat: exact attempt/session bağlı ready/admitted/started veya terminal receipt handshake; parent bounded bekler ve accepted/pending ile executing'i ayırır. Hızlı terminal success/failure receipt'i PID testinden önce değerlendirilmeli. Sonraki crash/exit/heartbeat sonucu durable lifecycle'a ve operator status'a yansıtılmalı; başka supervisor icat etmek yerine mevcut RunFlow/IPC custody kullanılmalı.

Ek sorun: `start.ts:57` readLogTail önce logun TAMAMINI readFileSync ile okur, sonra slice(-600) yapar; bounded bytes değil UTF-16 karakter ve unbounded read. Exact attempt log path spawn sonucundan gelmeli; flowId substring + lexicographic newest başka denemenin logunu seçebilir. Bounded seek/read, redaction ve control-character temizliği gerekli. Mevcut yama “erken ölüm teşhisi” düzeyinde kabul edilebilir; execution honesty closure için REVISE.

## 6. Routing

Disk kaydı doğrulandı: `.deckent/routing/decisions/sprint-732.jsonl` 9 satır, 1,173,550 bayt. İlk732-001 requirement structural/document, positional domains docs ve weight1. `requirement-vector.ts:165-187` scope.filesWrite üzerinden domain/deliverable çıkarıyor, `:358` yapısal workType'ı belirliyor. Bu kayıt scope'un routing'e docs olarak ulaştığını gösterir; title keyword yanlışlığına kanıt değildir.

`sprint-planner.ts:901-903` explicit Files birleşimini zaten yapıyor. İlk bozuk seam'i bulmak için aynı planDigest/revision/taskId üzerinde authored Files→parsedDirectives→sourceScope→createTask→route requirement görüntülerini karşılaştır. Arşivlenmiş exact732 task/pre-routing scope'u bu incelemede elde edilmedi; scope kaybının exact satırı KANITLANAMADI. Yeniden prose keyword heuristic ekleme. Logda catalog/skillCatalog her kayıtta taşınıyor; boyut için digest-addressed shared snapshot + per-decision refs/delta, replay retention garantisiyle değerlendirilebilir.

## 7. MASTER önerisi

Yeni satır açmadan önce 3333 (host-completed wiring; MASTER:1145) structured ingress/serializer eksiği için ana aday; 3241 (MASTER:1080) canonical proof-authority/ölçeklenebilir profile sınırı için parent bağ. Mode/latency/deadline için3220 PLANNER-001 (MASTER:1077) altında açık acceptance dilimi öner. 845 exact row bu kaynak okumasında eşlenemedi; başlık/outcome doğrulanmadan oraya bağlama. Owner'a mevcut ID + somut yeniden üretim + exact eksik acceptance + dependency + proof matrix sun; gerçekten bağımsız outcome çıkarsa ancak owner admission ile yeni ID. MASTER veya closure sınıflandırması bu tur değiştirilmedi.

## 8. Cursor206/207 — ayrı inceleme

206 paralel lane/custody bildirimi alındı; devir varsayılmadı. 207 paket ACCEPT değil, REVISE:
- app.tsx:3428 `!liveOperatorStrip` footer activity'yi kapatır; strip completed A'yı tutarken B başladıysa B'nin gerçek aktif hedef/süre bilgisi saklanır. Tek strip aktif executing state'i göstermeli; completed state aktif çağrıyı maskelememeli.
- app.tsx:2364 clearScreen toolsThisTurnRef'i sıfırlamıyor; finalize toolCount>0 dalı clear sonrası eski count'u tekrar Static'e yazabilir. Epoch/turn reset ve mounted lifecycle testi gerekir.
- Önceki failure/withheld A, başarılı B ile overwrite edilirse finalize yalnız son B'yi görür. Kalıcı önemli faz/hata sinyali kaybolmamalı; routine başarı geçmişiyle aynı politika uygulanmamalı.
- 86pass/2fail raporu LOCAL_VERIFIED exit0 değildir. “Pre-existing” için aynı komutun base ae87e8986 ve dirty tree sonuçları + exit/failed IDs gerekir; ayrı UI ve permission verifikasyonu açıkça etiketlenmeli.
- Shell modify early-return redirect demotion'u kapatıyor; legacy scanner'ın unknown=modify dediği meşru read-only komutlar için compatibility matrisi gerekli. Destructive fail'lerin kaynağı yalnız bu diff'ten kesinleşmez.

Yeni implementation/run/test/kill/cleanup/build/commit/push yapılmadı. Yalnız kanal ve bu evidence dokümanı yazıldı.
