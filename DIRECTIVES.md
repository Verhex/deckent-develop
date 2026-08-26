# RECOVERY-BORN MİKRO-PAKETİ (Tren Node-4) — heartbeat-fence · hold-sınıflandırma · attribution · evaluate-orphan · fix-önceliği · force-finalize-orphan

## Goal

Sprint-480/481/482 kökenli altı dar RECOVERY-BORN satırı kapanır (3171, 3173, 3175, 3174,
3176, 3177). Bu satırların bir kısmı A3 event-truth altyapısıyla KISMEN kapandı — her task
önce güncel durumu teşhis eder, kapanmış parçayı yeniden yazmaz, kalan exact residual'ı
kapatır ve regresyon-pinler; hiçbir şey kalmadıysa bunu kanıt-pinleriyle raporlar (dürüst
"zaten-kapalı" da geçerli sonuçtur — uydurma iş üretme).

## Execution contract

- Otorite: main'deki kontratlar; assertion zayıflatılmaz. Yalnız kendi Files listendeki
  dosyalara yaz; Reads listendekileri OKU. Scope dışına çıkma; komşu task'ın dosyasına
  ihtiyaç doğarsa FINDING yaz, edit yapma (altı task'ın Files kümeleri ayrıktır).
- Testler hermetik (tmpdir; spawnSync YASAK). VITEST_MAX_FORKS=2.
- Değiştirdiğin dosyalar için `npx tsc --noEmit` SIFIR hata; sonucu result notes'a yaz.
- Aktif run sırasında build/provider-auth/bot mutation YASAK.
- Doğrulama çıktılarının exit-kodu PIPE'SIZ yakalanır (`cmd > log 2>&1; echo $?`).

## Task 1: 3171 — heartbeat monotonic fence (worker sequence/walltime sahteciliği imkânsızlaşır)
- Files: src/core/worker-heartbeat-authority.ts, src/core/worker-heartbeat-authority-store.ts, tests/core/worker-heartbeat-authority.test.ts, tests/core/worker-heartbeat-authority-store.test.ts
- Reads: src/core/worker-activity-heartbeat.ts, src/core/heartbeat-types.ts, src/agents/worker.ts
- Priority: CRITICAL
- Model: gpt-5.6-sol
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/core/worker-heartbeat-authority.test.ts tests/core/worker-heartbeat-authority-store.test.ts
### Description
Kanıt-vakası (sprint-480/482): worker, wrapper'ın heartbeat sequence 80+ değerini sequence=1
ve sahte sabit wall-time ile ÜSTÜNE YAZDI (split-writer). Teşhis-önce: bugünkü
heartbeat-authority zincirinde wrapper-yazımı ile worker-yazımı hangi dosya/anahtar
üzerinde birleşiyor, monotonik koruma var mı? Kapanış: heartbeat yayını TEK fenced-writer
veya monotonic-CAS sözleşmesine bağlanır — (a) sequence ASLA geriye gidemez (düşük
sequence'lı yazım reddedilir ve typed çelişki-kanıtı olarak kaydedilir, canlı süreci
GİZLEMEZ); (b) wall-time host-saatinden makul sapma dışına forge edilemez (sapma typed
çelişki-kanıtı); (c) wrapper-authority'sinin worker tarafından üzerine yazılması
imkânsızlaşır (yazar-kimliği fence'i). 480-vakası regresyon-fixture olur (seq-80+ üstüne
seq-1 + sahte-tarih yazımı → red + typed evidence + canlı-süreç görünürlüğü korunur).
Mevcut suite'ler bit-yeşil. tsc sıfır.

## Task 2: 3173 — hold-sınıflandırma: scope/kod hatası provider usage-limit'i tetikleyemez
- Files: src/core/provider-failure-classifier.ts, src/core/provider-execution-hold.ts, tests/core/provider-failure-classifier.test.ts
- Reads: src/orchestra/sprint-phases.ts, src/core/heartbeat-types.ts
- Priority: HIGH
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/core/provider-failure-classifier.test.ts
### Description
Kanıt-vakası (sprint-480 seq-18): 242k input + 5.2k output token ve yazılmış diff'e RAĞMEN
Codex'e sahte usage-limit hold basıldı. Satır kanıtı kısmi-kapanış bildiriyor ("gerçek
token/dosya/satır üretimi executed-work sayılır"). Teşhis-önce: bugünkü classifier'da hangi
dallar hâlâ provider-quarantine'e düşebiliyor? Kapanış-residual'ı: (a) sınıflandırma hold
YAYININDAN ÖNCE evidence-typed olur — planner/scope/kod hataları task/dependency repair
sonucu kalır, erişilebilir provider'ı ASLA karantinaya almaz; (b) `usage-limit` YALNIZ
authoritative provider usage-kanıtıyla (provider-reported limit sinyali) basılabilir;
kanıtsız usage-limit yazımı typed reddedilir; (c) 480-vakası regresyon-fixture (yüksek
token + diff varken usage-limit basılamaz). Mevcut suite bit-yeşil. tsc sıfır.

## Task 3: 3175 — attribution: predecessor diff'i sonraki attempt'e mal edilemez
- Files: src/core/sprint-work-attribution.ts, tests/core/sprint-work-attribution-baseline.test.ts
- Reads: src/orchestra/spawn-backend-docker.ts, src/core/task-result-settlement.ts
- Priority: HIGH
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/core/sprint-work-attribution-baseline.test.ts
### Description
Satır kanıtı büyük kapanış bildiriyor (Docker settlement claim-time scoped blob-manifest +
immutable baseline + exact reconciliation). Teşhis-önce: acceptance'ın ÜÇ hükmünden hangisi
bugün eksik — (a) attempt settlement dosya/byte'ları claim-time baseline'ına ve exact
yazar-kanıtına bağlar; (b) DEĞİŞMEMİŞ predecessor işi `filesChanged`'ten dışlanır; (c)
belirsiz sahiplik typed HOLD üretir (uydurma yazar-iddiası ASLA). Eksik hüküm varsa
sprint-work-attribution içinde kapat; TAMSA yeni test dosyasıyla üç hükmü ayrı ayrı PINLE
(480/482 vakası: miras-alınan predecessor dosyaları + ambient satırlar sonraki attempt'in
filesChanged'ine giremez; belirsizlik → HOLD). Sonucu dürüst raporla (kapalıysa
"zaten-kapalı + pin" de geçerli DONE'dur). tsc sıfır.

## Task 4: 3174 — evaluate-lock orphan: NO_GO'lu task FIX'siz/karar'sız mahsur kalamaz
- Files: src/orchestra/execution-recovery-service.ts, src/orchestra/execution-recovery-adapter.ts, tests/orchestra/execution-recovery-service.test.ts
- Reads: src/orchestra/sprint-phases.ts, src/orchestra/sprint-controller.ts, src/core/execution-recovery.ts, tests/orchestra/execution-recovery-assurance.test.ts
- Priority: CRITICAL
- Model: gpt-5.6-sol
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/orchestra/execution-recovery-service.test.ts tests/orchestra/execution-recovery-assurance.test.ts
### Description
Kanıt-vakası (sprint-480 kök-neden): dependency-bloklu 480-007, appended 480-006-fix'in
önünde shared-write serileştirmesini kazandı ve HİÇBİR fix spawn edilemedi. Teşhis-önce:
recovery-service bugün coordinator/süreç kimliği + evaluate-lock ilerlemesiyle
HEALTHY/STALLED/ORPHANED ayrımını yapıyor mu? Kapanış-residual'ı: (a) exact
coordinator/process identity + evaluate-lock progress üçlü sınıflandırmayı üretir; (b)
durable NO_GO TAM BİR repair-kararı veya resumable-HOLD üretir (kararsız mahsur-kalma
sınıfı yok); (c) status, bayat PID/state'ten "coordinator alive" veya "aktif
non-resumable execution" RAPORLAYAMAZ (canlılık kanıtı: kill-0 + lock-progress). Not:
öncelik-terslenmesinin scheduler-tarafı Task-5'in işidir (3176) — buraya YAZMA, gerekirse
FINDING. Regresyon-pinler + mevcut suite bit-yeşil. tsc sıfır.

## Task 5: 3176 — priority-FIX collision/slot admission'da bloklu bağımlıları geçer
- Files: src/orchestra/scheduler-effects.ts, tests/orchestra/dependency-scheduler.test.ts
- Reads: src/orchestra/sprint-controller.ts, src/core/task-lineage.ts, src/core/types.ts, src/core/utils.ts
- Priority: HIGH
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/orchestra/dependency-scheduler.test.ts
### Description
Satır kanıtı kısmi-kapanış bildiriyor ("Scheduler now stable-partitions priority fixes,
filters blocked work before worker-ceiling slicing..."). Teşhis-önce: üç acceptance hükmü
bugün nerede — (a) appended priority-FIX, shared-write serileştirmesini bloklu
bağımlılarından ÖNCE kazanır; (b) bloklu task'lar kuyrukta KALIR ve boş slotlar
dispatch-edilebilir işten dolar; (c) dashboard/status spawn edilmemiş worker'ı EXECUTING
gösteremez. Eksik hükmü scheduler-effects içinde kapat; kapalıysa 480-vakası
(006-fix vs bloklu-007 çakışması) regresyon-fixture'ıyla PINLE. Node-5'in
descendant-cancellation değişimiyle çakışma: sprint-controller'a YAZMA (Reads'te gör),
scheduler-effects tarafında kal. tsc sıfır.

## Task 6: 3177 — force-finalize eşleşen recovery-coordinator'ı emekli etmeden terminal dönemez
- Files: src/orchestra/sprint-finalizer.ts, src/cli/commands/finalize.ts, tests/orchestra/finalize-coordinator-retirement.test.ts
- Reads: src/orchestra/execution-recovery-service.ts, tests/orchestra/finalize-error-surface.test.ts
- Priority: CRITICAL
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/orchestra/finalize-coordinator-retirement.test.ts tests/orchestra/finalize-error-surface.test.ts
### Description
Kanıt-vakası (sprint-480/481): force-finalize canonical COMPLETE/ABORTED döndürdü ama aynı
sprint'in `deckent resume` coordinator'ı CANLI kaldı (supervising-session elle SIGINT'e
mecbur kaldı). Teşhis-önce: bugünkü forceAbortSprint yolu eşleşen resume/recovery
coordinator süreçlerini tespit ediyor mu? Kapanış: (a) exact-sprint force-finalize,
EŞLEŞEN resume/recovery coordinator'ı canlıyken terminal DÖNEMEZ — önce ölüm-tespiti
(kill-0 + coordinator-registry/handle kanıtı), ölmediyse typed ownership-HOLD veya explicit
external-authority beyanı AYNI receipt'in parçası olur; (b) zorla-kill YASAK sınırı korunur
(mevcut kill/cleanup kuralları) — emeklilik tespit+HOLD+beyan yoluyla, sinyal
gönderilecekse yalnız mevcut sözleşmeli mekanizmayla; (c) 480/481 çift-polarite
regresyon-fixture'ı (canlı-coordinator → terminal-red + typed HOLD; ölü-coordinator →
temiz terminal + receipt'te ölüm-kanıtı). tsc sıfır.
