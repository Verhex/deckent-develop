# KALİTE-KAPILARI DALGASI (Tren Node-2) — tsc-settlement-truth · mock-ratchet · deletion-aware honest-gate · ERRORS-forensic · motor-selfchange-WARN

## Goal

Gece-bulgu admission satırları 202/203/201/205 kapanır (owner-onaylı tren sırası): (1)
EVAL-TSC-FEEDBACK-001 — sprint tsc-kirliyken sessizce COMPLETE'e kapanamaz; settlement typed
residual taşır + Auditor'a event gider; tam-factory node:fs mock'larına yeni-eklenemez
ratchet'i gelir. (2) HONEST-GATE-DELETION-AWARE-001 — silme-only işler (679-002 canlı vakası:
24-silme/0-ekleme, goCriteria MET) yanlış-pozitif NO_GO'ya düşmez; gerçek stub hâlâ yakalanır.
(3) CONFIG-HEAL-IO-TRUTH-001 ek dilimi — kritik-sınıf hata girdileri ERRORS.md 600-satır
kırpmasında forensic-kaybolmaz. (4) DIRECTIVES-ENGINE-SELFCHANGE-LINT-001 — motor-sıcak-yolu
dosyalarına dokunan task + ona etki-bağımlı task aynı DAG'daysa typed WARN (674-dersi).

## Execution contract

- Otorite: main'deki kontratlar; assertion zayıflatılmaz. Yalnız kendi Files listendeki
  dosyalara yaz; Reads listendekileri OKU. Scope dışına çıkma.
- Testler hermetik (tmpdir; gerçek `.brain`/`.deckent` dosyalarına yazılmaz). VITEST_MAX_FORKS=2.
- Değiştirdiğin dosyalar için `npx tsc --noEmit` SIFIR hata; çıktıyı result notes'a yaz.
- Aktif run sırasında build/provider-auth/bot mutation YASAK.
- YENİ config anahtarı eklenirken CFG-003 dersi bağlayıcı: authored type + default +
  resolved projection + gerçek consumer zinciri AYNI task'ta tamamlanır (resolver'da
  düşen alan bırakılamaz); 0-hardcode (eşik/deşen constants veya config'ten).

## Task 1: Settlement tsc-truth gate — sprint tsc-kirli COMPLETE olamaz
- Files: src/orchestra/sprint-finalizer.ts, src/core/config-types.ts, src/core/config.ts, tests/orchestra/tsc-settlement-gate.test.ts
- Reads: src/orchestra/sprint-phases.ts, src/core/utils.ts, docs/MASTER-PLAN.md
- Priority: CRITICAL
- Model: gpt-5.6-sol
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/orchestra/tsc-settlement-gate.test.ts tests/orchestra/sprint-finalizer-row-upsert.test.ts
### Description
Yeni config anahtarı `evaluation.tsc_settlement_gate` (boolean, default TRUE; authored tip
config-types.ts + createDefaultConfig default'u + resolved projection — ÜÇÜ BİRDEN, CFG-003
dersi). Consumer: sprint-finalizer'ın normal-finalize yolunda, terminal COMPLETE yayınından
ÖNCE bounded bir `npx tsc --noEmit` koşulur (async spawn, spawnSync YASAK; timeout
config-resolved makul sabit constants'tan, örn. 240sn; TS-projesi değilse/ tsc yoksa typed
skip). FAIL ise: (a) settlement'a typed residual eklenir (`TSC_DIRTY_RESIDUAL` + ilk 20 hata
satırı bounded), sprint sonucu COMPLETE yerine mevcut tech-debt/residual taşıyan settlement
sınıfına düşer — hangi mevcut alan/mekanizma kullanılacaksa REICAT ETME, sprint-finalizer'ın
var olan residual/debt kanalını kullan (Reads'te gör); (b) Auditor'a `BRAIN→AUDITOR` event'i
yazılır (sprint-phases.ts:2119 STUB_WRITE_DETECTED emsalindeki writeEvent deseni). Gate
fault'u (tsc çalıştırılamadı) typed WARN + treat-as-pass DEĞİL — typed `TSC_GATE_FAULT`
residual'ı (dürüstlük: koşamadıysak temiz diyemeyiz, ama sprint'i de kilitlemeyiz). YENİ
hermetik test: sahte-proje tmpdir'de (a) gate-ON + kirli-ts → residual + event, (b) gate-ON +
temiz → COMPLETE bit-değişmez, (c) gate-OFF → tsc hiç çağrılmaz, (d) fault → TSC_GATE_FAULT.
tsc-koşusunu testte gerçek npx yerine enjekte-edilebilir runner seam'iyle sür (finalizer'a
opsiyonel runTscFn parametresi — mevcut DI desenleriyle uyumlu). tsc sıfır.

## Task 2: Mock-factory ratchet — tam-factory node:fs mock'u yeni eklenemez
- Files: scripts/lint-mock-factories.mjs, scripts/script-registry.json, package.json, tests/scripts/lint-mock-factories.test.ts
- Reads: scripts/lint-config-writers.mjs, scripts/lint-test-hermeticity.mjs
- Priority: HIGH
- Agent: ci-guardian
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/scripts/lint-mock-factories.test.ts
### Description
YENİ gate `scripts/lint-mock-factories.mjs` (yapı emsali Reads'teki lint-config-writers —
export'lu check fonksiyonu + main + yalnız-azalma baseline): tests/** içinde
`vi.mock('node:fs'` (ve `'node:fs/promises'`) çağrısı olup factory gövdesinde
`importOriginal` ÇAĞRILMAYAN her dosya "tam-factory" sayılır (2026-08-26 mock-gap dersi:
authority-zinciri fs-yüzeyi ekleyince tam-factory'ler sessizce kırılıyor). Mevcut
tam-factory'ler script-içi CONFIG... benzeri baseline Set'ine dosya-yolu anahtarıyla ledger-yorumla
alınır (kuruluş ölçümünü koş ve GERÇEK listeyi yaz; sayıyı result notes'a raporla); YENİ
dosya fail-closed, baseline yalnız azalır (stale-baseline kırmızı). Gate script-registry'ye
kayıt + package.json lint:gates zincirinin sonuna eklenir (mevcut sözdizimini birebir
kopyala; lint-config-writers'tan SONRA). Hermetik test: tmpdir mini-ağaçta tam-factory /
importOriginal'li / mock'suz üç fixture + gerçek-repo yeşil koşusu pini. tsc etkilenmez.

## Task 3: Deletion-aware honest-gate — silme-only iş yanlış-pozitiflenmez
- Files: src/orchestra/result-evaluator.ts, tests/orchestra/honest-gate-deletion-aware.test.ts
- Reads: src/orchestra/sprint-phases.ts, tests/orchestra/dishonest-detector.test.ts
- Priority: HIGH
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/orchestra/honest-gate-deletion-aware.test.ts tests/orchestra/dishonest-detector.test.ts
### Description
`enforceHonestResultGate` (result-evaluator.ts ~:3033) karar sırası 679-002 canlı vakasına
göre düzeltilir: selfAssessment başarı iddiasında linesAdded=0 İKEN linesRemoved>0 VE
goCriteria-kanıtı mevcutsa (result.notes/testsPassed zinciri) hiçbir stub/empty-write
override'ı DONE'u düşürmez — 679-002'nin gerçekte hangi dala takıldığını ÖNCE teşhis et
(isStubResult literal'i mi, diskVerify yolu mu, SCOPE_VIOLATION_OR_EMPTY_WRITE mi) ve fix'i
o dala uygula; komşu davranış bit-korunur. YENİ test dosyası: (a) 679-002 şekli regresyon
fixture'ı (24-silme/0-ekleme, goCriteria MET, testsPassed=true → DONE KALIR), (b) gerçek
stub (0/0 + kanıtsız) HÂLÂ NO_GO, (c) silme-only ama kanıtsız (linesRemoved>0, testsPassed
false/iddiasız) mevcut davranışını korur — zayıflatma yok. Mevcut dishonest-detector suite
yeşil kalır. tsc sıfır.

## Task 4: ERRORS.md forensic-kanalı — kritik-sınıf girdiler kırpmada kaybolmaz
- Files: src/core/utils.ts, src/core/constants.ts, tests/core/errors.test.ts
- Reads: docs/MASTER-PLAN.md
- Priority: NORMAL
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/core/errors.test.ts
### Description
`.brain/ERRORS.md` 600-satır kırpması (utils.ts append + ERRORS_MAX_LINES) forensic'i
öldürüyor (201 satırının ek dilimi). Ekleme: kritik-sınıf girdiler (error-code'u
`CONFIG_` öneki taşıyan VEYA `_HOLD` soneki taşıyan sınıf — desen constants.ts'te tek-kaynak
export, örn. ERRORS_CRITICAL_CLASS_RE) normal ERRORS.md akışına EK olarak
`.brain/ERRORS-critical.md`'ye de append edilir; bu dosya kendi bağımsız tavanıyla kırpılır
(constants.ts yeni `ERRORS_CRITICAL_MAX_LINES`, 2000 — gerekçe-yorumlu; retention-domain 120
satırına dokunulmaz, dosya .brain altında aynı yazım-deseniyle). Yazım non-fatal (mevcut
logError sözleşmesi korunur). Test: errors.test.ts'e (a) kritik-sınıf girdinin çift-kanala
düştüğü, (b) kritik-olmayanın yalnız ERRORS.md'ye gittiği, (c) critical-kırpmanın kendi
tavanını uyguladığı, (d) mevcut 600-trim pinlerinin bit-korunduğu eklenir (tmpdir). tsc sıfır.

## Task 5: lint-directives motor-selfchange typed WARN (674-dersi)
- Files: scripts/lint-directives.mjs, tests/scripts/lint-directives.test.ts
- Reads: src/orchestra/task-builder.ts
- Priority: NORMAL
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/scripts/lint-directives.test.ts
### Description
lint-directives'e yeni WARN sınıfı `D_ENGINE_SELF_CHANGE`: motor-sıcak-yolu listesi
(export edilen tek-kaynak sabit ENGINE_HOT_PATHS — src/orchestra/task-builder.ts,
src/orchestra/prompt-compile* ailesi, src/core/result-collector* / src/orchestra/result-*,
src/orchestra/scheduler*, src/orchestra/sprint-spawner.ts; GERÇEK dosya adlarını Reads +
repo-grep ile doğrula, hayalet yol yazma) ile bir task'ın filesWrite kümesi kesişiyor VE
aynı DIRECTIVES'te ona Dependencies ile bağlı (doğrudan veya geçişli) başka task varsa:
`task-N motoru değiştiriyor ve task-M ona bağımlı — etki next-run-only, mini-run önerisi
(sprint-674 dersi)` metinli WARN (BLOCK değil). Liste export'u test-edilebilir; mevcut
checkDirectives saf-çekirdek desenine ek parametre olarak girer (parser enjeksiyonu
bozulmaz). Test: lint-directives.test.ts'e sahte-parser'lı iki senaryo — kesişim+bağımlılık
→ WARN üretilir; kesişim ama bağımlısız → WARN üretilmez; mevcut testler bit-korunur. tsc
etkilenmez (mjs), test tsc'ye girmez.
