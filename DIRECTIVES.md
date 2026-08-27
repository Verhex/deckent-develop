# FAILURE-DISPOSITION POLICY — 3301 truthful-terminal dilimi (owner "Öneri kabul", 2026-08-27)

## Goal

Admission-reddi sınıfı (host pre-dispatch settlement) FIX-döngüsüne girmeden gerçeğe-uygun
terminal'e ulaşır: typed, config-resolved failure-disposition policy (T1) bu sınıfı
NOT_DISPATCHED-terminal yapar ve FIX/re-dispatch'ten muaf tutar; bağımlıları mevcut
cascade-skip rayına düşer ve run karışık-sonuçla tamamlanır (T2); her policy-uygulaması
typed disposition-olayı olarak owner-kanalına yazılır — Nervous kapalıyken de çekirdek
doğru çalışır, açıkken olayı anlatır (T3); zincir hermetik regresyon-mühürüyle korunur (T4).
Ürün karşılığı: "skill yok / provider yok" sınıfı hatalar FIX-bütçesi yakmaz, run'ı
rehin almaz, dürüst NOT_DISPATCHED+SKIPPED olarak raporlanır (MASTER 3301 kabulü).

## Execution contract

- Kalite barı aynen: i18n-FIRST (user-facing CLI string'i yalnız getMessage en+tr),
  0-hardcode (reason-kodları/eşikler tek-kaynak sabit veya config'ten), hermetik test
  (tmpdir; VITEST_MAX_FORKS=2), mevcut-pattern (yeniden icat yok), assertion zayıflatma yasak.
- Test komutların TASK-SCOPED ve TEKİLDİR (global gate yok, `&&` zinciri yok).
- Doğrulamanın tükettiği her authority dosyası Reads listendedir; Reads dışına yazma.
- Nervous default-OFF gerçeği KORUNUR: çekirdek disposition-davranışı Nervous'tan bağımsızdır.
- Gerçek-binary bounded-replay sertifikası landing-adımıdır (sprint-DIŞI, ana-şerit koşar).

## Task 1: Typed failure-disposition policy — pre-dispatch sınıfı NOT_DISPATCHED-terminal + FIX-muaf
- Files: src/core/failure-disposition-policy.ts, src/orchestra/result-evaluator.ts, tests/core/failure-disposition-policy.test.ts
- Reads: src/core/pre-dispatch-settlement.ts, src/core/task-types.ts, src/orchestra/sprint-phases.ts, src/orchestra/sprint-spawner.ts, src/core/config-types.ts
- Priority: HIGH
- Agent: implementer
- Model: gpt-5.6-sol
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/core/failure-disposition-policy.test.ts
### Description
Yeni modül src/core/failure-disposition-policy.ts: HostPreDispatchReasonCode evreni
(Reads'teki src/core/pre-dispatch-settlement.ts enum'u authority) üzerinden typed karar-tablosu
— her reason-kodu için disposition {evaluation: NOT_DISPATCHED, fixEligible: false,
redispatchEligible: false, cascadeDependents: true} canonical DEFAULT'u; effective config
override-seam'i (config-types'a dar, opsiyonel blok — yeni zorunlu alan yok, mevcut
3-layer merge deseni). Kablolama: result-evaluator, `preDispatchSettlement` alanı taşıyan
bir TaskResult'ı (src/core/task-types.ts:1101) değerlendirirken policy'yi çözer ve
TaskEvaluation.NOT_DISPATCHED döndürür (bugünkü davranış: alan okunmuyor, sonuç NO_GO
sayılıyor — 2026-08-27 bounded-replay kanıtı, MASTER 3301). NOT_DISPATCHED için mevcut
FIX/cross-fix muafiyet emsalleri (task-types cascadeSkipped sözleşme-yorumu; 351-008
re-dispatch notu) korunur; policy `redispatchEligible:false` dediğinde EVALUATE'in
re-dispatch aday listesine de girmez. Sınır: sprint-phases'e yalnız policy-çözümü
enjekte edilir; FIX-seçim mekanizması yeniden yazılmaz. Test: reason-kodu başına
disposition çözümü; preDispatchSettlement'lı sonuç → NOT_DISPATCHED; sıradan worker
NO_GO'su → FIX-uygunluğu DEĞİŞMEZ; config-override yolu.

## Task 2: Bağımlılara cascade-skip + run'ın karışık-sonuçla tamamlanması
- Files: src/orchestra/result-collector.ts, tests/orchestra/result-collector-disposition.test.ts
- Reads: src/core/failure-disposition-policy.ts, src/core/task-types.ts, src/orchestra/scheduler-effects.ts, src/orchestra/scheduler-truth.ts
- Priority: HIGH
- Agent: implementer
- Model: gpt-5.6-sol
- Dependencies: Task 1
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/orchestra/result-collector-disposition.test.ts
### Description
Bugün admission-reddi FIX'e eskalasyon yüzünden bağımlılar blocked-PAUSE'da kalıyor
(2026-08-27 replay: 003-003←003-002). Mevcut `cascadeSkipDeadBlocked` kapanışı
(src/orchestra/result-collector.ts:~2085, born-610) dead-upstream'i sentetik-skip'liyor;
bu task, disposition-policy'nin NOT_DISPATCHED-terminal dediği upstream'i de AYNI rayın
girişine bağlar: bağımlı sonuçlar `cascadeSkipped:true` + mevcut sözleşme-alanlarıyla
üretilir, FIX/cross-fix muafiyeti (task-types sözleşme-yorumu) aynen işler, run zero-task
finalizer-hold'una çarpmadan karışık-sonuçla (DONE + NOT_DISPATCHED + cascadeSkipped)
terminal'e ulaşır. scheduler-effects'teki DEPENDENCY_BLOCKED ayna-mekanizması (Reads)
ile çelişki yaratma — tek-kaynak davranış korunur. Test: tmpdir-hermetik simüle sonuç-seti
(1 DONE + 1 preDispatch-NOT_DISPATCHED + 1 bağımlı) → bağımlı cascadeSkipped, FIX task'ı
DOĞMAZ, collector çıkışı terminal-uyumlu.

## Task 3: Disposition-olayı — owner-kanalı yayını (Nervous'tan bağımsız çekirdek, Nervous'a köprü)
- Files: src/orchestra/result-collector.ts, src/cli/helpers/messages.ts, tests/orchestra/disposition-event.test.ts
- Reads: src/core/failure-disposition-policy.ts, src/connectors/notification-delivery.ts, src/nervous/detector-registry.ts, .deckent/runtime/owner-notifications.jsonl
- Priority: NORMAL
- Agent: implementer
- Dependencies: Task 1, Task 2
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/orchestra/disposition-event.test.ts
### Description
Policy bir non-FIX disposition uyguladığında typed olay üretilir: durable
owner-notification outbox'a (mevcut append-deseni — Reads'teki
.deckent/runtime/owner-notifications.jsonl şekli ve notification-delivery kontratı)
stable-id'li kayıt: {reasonCode, taskId, disposition, remediation-hint}. Remediation-hint
metinleri getMessage kataloğundan (en+tr) — örn. forced-skill için "skill'i oluştur/aktive
et", provider için "auth/erişim". Nervous AÇIKSA aynı olay nervous-log/detector yüzeyine
de köprülenir (Reads'teki detector-registry deseni; yalnız yayın — öneri-üretimi AYRI
outcome, bu task'ta YAZILMAZ). Nervous KAPALIYKEN çekirdek yol tam çalışır — test bunu
pinler. Test: tmpdir-hermetik — disposition-olayı outbox'a stable-id ile yazılır (crash-
replay dedup), nervous-off'ta köprü sessiz ve hatasız, i18n anahtarları en+tr mevcut.

## Task 4: Zincir-mühürü — uçtan-uca hermetik disposition regresyon-testi
- Files: tests/orchestra/failure-disposition-chain.test.ts
- Reads: src/core/failure-disposition-policy.ts, src/orchestra/result-collector.ts, src/orchestra/result-evaluator.ts, tests/orchestra/result-collector-disposition.test.ts
- Priority: HIGH
- Agent: test-guardian
- Dependencies: Task 2, Task 3
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/orchestra/failure-disposition-chain.test.ts
### Description
Tek hermetik dosyada zincirin bütünü mühürlenir (mock-değil, gerçek modül-kompozisyonu;
tmpdir): (1) preDispatchSettlement'lı sonuç → NOT_DISPATCHED evaluation + FIX-task
doğmadığının kanıtı; (2) bağımlı → cascadeSkipped + muafiyet; (3) disposition-olayı
outbox'ta tam-şekilli; (4) sıradan worker-NO_GO kontrol-grubu → FIX-yolu DEĞİŞMEDEN
çalışıyor (davranış-koruma pini); (5) policy config-override'ı zinciri değiştirir
(örn. bir reason-kodu FIX'e açılırsa FIX doğar). Assertion'lar Reads'teki iki task-test
dosyasının pinleriyle çakışmaz — bu dosya kompozisyon-katmanını mühürler.
