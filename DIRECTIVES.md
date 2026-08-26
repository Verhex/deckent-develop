# 7141 THROW-CONVERSION DEVAM-DALGASI (generated-Reads + el-gövde) — 8 dosya / 2 küme (687-001 cluster-1 landed)

## Goal

ERROR-REGISTRY-THROW-CONVERSION-001 (MASTER 7141) devam dilimi: baseline'daki en yoğun 12
dosyada ham `throw new Error` siteleri typed DeckentError/registry kontratına taşınır;
baseline yalnız-azalır (budama landing'de), davranış bit-korunur, ilgili suite'ler yeşil.

## Execution contract

- Otorite: main'deki kontratlar; assertion zayıflatılmaz. Yalnız kendi Files listendeki
  dosyalara yaz; Reads listendekileri OKU. Scope dışına çıkma.
- scripts/error-handling-baseline.json ve registry-DIŞI dosyalara YAZMA (errors.ts'e typed
  kod ekleme gerekirse yaz — Files'ına dahil).
- Testler hermetik; VITEST_MAX_FORKS=2. Değişen dosyalara `npx tsc --noEmit` SIFIR.
- Aktif run sırasında build/provider-auth/bot mutation YASAK; exit-kodlar PIPE'SIZ.

## Task 1: provider/budget kümesi (live-execution-budget · provider-limit-truth · provider-truth · scheduled-flow) — ham-throw'lar typed'a
- Files: src/core/live-execution-budget.ts, src/core/provider-limit-truth.ts, src/core/provider-truth.ts, src/core/scheduled-flow.ts, src/core/errors.ts
 src/core/attended-execution-approval.ts, src/core/config-types.ts, src/core/errors.ts, src/core/execution-admission.ts, src/core/execution-budget-policy.ts, src/core/invocation-receipt.ts, src/core/log-event.ts, src/core/model-registry.ts, src/core/provider-evidence-probe-contract.ts, src/core/provider-truth.ts, src/core/role-invocation-resolver.ts, src/core/work-model.ts
- Priority: HIGH
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/core/live-execution-budget.test.ts tests/core/provider-limit-truth.test.ts tests/core/provider-truth.test.ts tests/core/scheduled-flow.test.ts
### Description
7141 devam-dalgası (ERROR-REGISTRY-THROW-CONVERSION-001; 672-emsali). Files listendeki src
dosyalarındaki HAM `throw new Error(...)` sitelerini mevcut DeckentError/error-registry
kontratına taşı: (a) her site için registry'de UYGUN typed kod seç — yoksa mevcut
adlandırma-desenine uygun YENİ kod + message + remediation kaydıyla registry'ye ekle (Reads:
src/core/errors.ts deseni); (b) hata-mesajı davranışı korunur (mesaj-metni pinleyen test
varsa dürüstçe yeni typed şekle güncelle — assertion ZAYIFLATMADAN); (c) kontrol-akışı ve
yan-etkiler bit-korunur — bu bir SEMANTİK değişiklik değil, hata-taşıyıcı değişikliğidir;
(d) scripts/error-handling-baseline.json'a DOKUNMA — bayat-kayıt budaması landing-host
işidir; (e) YENİ registry kodu gerekiyorsa Task-1 ekler (errors.ts kilidi ondadır); Task-2 mevcut koddan seçer, uygun yoksa exact FINDING; (f) dönüşüm sonrası kendi Files'ındaki ham-throw sayısını grep'le ölç ve
result notes'a önce/sonra olarak yaz. Test komutu TAM YEŞİL bitmeli. tsc sıfır.

## Task 2: settlement/mission kümesi (task-result-settlement · mission-migrate · mission-worker-invocation-coordinator · sqlite-mission-store) — ham-throw'lar typed'a
- Files: src/core/task-result-settlement.ts, src/orchestra/autonomous/mission-store/mission-migrate.ts, src/orchestra/autonomous/mission-store/mission-worker-invocation-coordinator.ts, src/orchestra/autonomous/mission-store/sqlite-mission-store.ts
- Reads: src/core/approval-contract.ts, src/core/config-types.ts, src/core/constants.ts, src/core/cross-verify-execution-contract.ts, src/core/errors.ts, src/core/execution-admission.ts, src/core/execution-budget-policy.ts, src/core/execution-landing-checkpoint.ts, src/core/host-role-invocation-admission-runtime.ts, src/core/invocation-receipt.ts, src/core/live-execution-budget.ts, src/core/provider-billing-evidence.ts, src/core/provider-limit-admission.ts, src/core/provider-limit-store.ts, src/core/provider-limit-truth.ts, src/core/provider-truth.ts, src/core/role-invocation-resolver.ts, src/core/state-paths.ts, src/core/task-types.ts, src/core/work-model.ts, src/orchestra/autonomous/backlog-types.ts, src/orchestra/autonomous/mission-store/mission-acceptance.ts, src/orchestra/autonomous/mission-store/mission-dispatch.ts, src/orchestra/autonomous/mission-store/mission-kind-admission.ts, src/orchestra/autonomous/mission-store/mission-types.ts
- Dependencies: Task 1
- Priority: HIGH
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/orchestra/autonomous/mission-store/mission-engine-wire.test.ts tests/orchestra/autonomous/mission-store/goal-mission.test.ts
### Description
7141 devam-dalgası (ERROR-REGISTRY-THROW-CONVERSION-001; 672-emsali). Files listendeki src
dosyalarındaki HAM `throw new Error(...)` sitelerini mevcut DeckentError/error-registry
kontratına taşı: (a) her site için registry'de UYGUN typed kod seç — yoksa mevcut
adlandırma-desenine uygun YENİ kod + message + remediation kaydıyla registry'ye ekle (Reads:
src/core/errors.ts deseni); (b) hata-mesajı davranışı korunur (mesaj-metni pinleyen test
varsa dürüstçe yeni typed şekle güncelle — assertion ZAYIFLATMADAN); (c) kontrol-akışı ve
yan-etkiler bit-korunur — bu bir SEMANTİK değişiklik değil, hata-taşıyıcı değişikliğidir;
(d) scripts/error-handling-baseline.json'a DOKUNMA — bayat-kayıt budaması landing-host
işidir; (e) YENİ registry kodu yalnız Task-1 ekleyebilir (errors.ts kilidi ondadır) — Task-2/3'te mevcut koddan uygun yoksa exact FINDING yaz ve o siteyi dönüştürmeden bırak (dürüst kısmi-DONE); (f) dönüşüm sonrası kendi Files'ındaki ham-throw sayısını grep'le ölç ve
result notes'a önce/sonra olarak yaz. Test komutu TAM YEŞİL bitmeli. tsc sıfır.
