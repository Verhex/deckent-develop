# R1-A released-unaccepted recovery — LOCAL_VERIFIED, runtime pending

Yeni negatif disposition, tam release kanıtını korur; accepted result veya başarılı settlement üretmez. Store yeniden başlatma/idempotency, artifact digest, exact sprint ve release zamanı denetimleriyle kapalı kalır. Docker sınır testi gerçek daemon kanıtı değildir; dış gözlemler test doubles ile sağlandı.

Producer: src/orchestra/execution-effect-store-adapter.ts:754
Store: src/core/task-attempt-custody-store.ts:8318
Docker entry: src/orchestra/spawn-backend-docker.ts:5478
CLI: src/cli/commands/recover.ts (--retain-released-unaccepted).

Doğrulama: 5 dosya, 43/43 test PASS, exit 0; tsc --noEmit exit 0; git diff --check exit 0. CLI özel sonucu genel recovery başarı mesajına düşürmüyordu; return ve regresyon testi eklendi. Canonical FAILED flow yokluğunda dry-run dahi mutation boundary'ye ulaşamaz.

751 native custody henüz mutate edilmedi. Önceden canonical ABORTED olan dış sprint aynen korunuyor. Yeni binary build ve exact 751 dry-run/apply henüz yapılmadı; ürün DONE veya dogfood GO iddiası yok. Ortak build Cursor teslimiyle koordine edilecek. Cursor start.ts/REPL değişiklikleri bu kanıta sahiplenilmedi. Commit/push yapılmadı.

## Runtime ön kontrol / exact Flow testi

Source CLI (`tsx src/cli/entry.ts recover sprint-751 --retain-released-unaccepted <exact-dispatch> --dry-run --json`) exit 1: TASK_ATTEMPT_CUSTODY_HOLD:NATIVE_CAPABILITY_UNAVAILABLE. Ayrı capability ölçümü: Node v24.15.0, dist available=true; source loader-module-unavailable. Bu deneme gerçek binary kanıtı değildir ve recovery apply yapılmadı. Bypass kullanılmadı.

Exact FAILED Flow bağına sahip operation testi eklendi: ilgili dosya 23/23 PASS, exit 0. Generic recovery çağrılmıyor; yeni terminal receipt üretilmiyor. Recovery truth authority lint exit 0. Cursor'a ENTRY 226 ile ortak build sınırı bildirildi; son teslim bekleniyor.

Son ortak tsc --noEmit: exit 2. Eşzamanlı değişen src/cli/repl/run.tsx:1162,1174,1175,1176,1181 TS2769 (string | undefined). Önceki exit0 tarihsel ölçümdür; mevcut main yeşil değildir. Cursor custody dosyası değiştirilmedi.

## Gerçek binary recovery uygulandı

Build: npm run build:all exit0. Binary authority: allow/matching-build-identity. Fresh binary exact dry-run exit0 eligible; exact --force --json apply exit0 retained. Task751-001 attempt9d2ee9c9-500c-82a2-8f44-8b668521df43 generation1. Receipt sha256:8ca5024ec3565519d206237e59b1ec72541922bd7a487ecd61143ec56e98064b; evidence sha256:396bdffaa194974dc3556069c44ee8ca2a64ef1493d6f3e7b69e899f86958c56. Kalıcı dispatch/effect-released-unaccepted.json file sha256:3953b6584eb0150b8e1357dcffbfd359bf7d461e8c8632ae8c9e7b98df9ad534.

Kaynaklar zaten kaldırılmıştı; bu işlem yeni accepted result, task success veya outer settlement üretmedi. .tasks dosya sayısı0. Yeni sprint/provider çağrısı başlatılmadı.

Bağımsız fan-in:4 dosya41/41 PASS exit0. İlk test koşusu build ile çakıştırıldı ve hermetik dist guard exit1 verdi; o koşu başarı kanıtı değildir. Build tamamlandıktan sonra ayrı tekrar yeşil.

ENTRY227 gerçek body sha2566f0b483f… header d30bc413… uyuşmazlığı nedeniyle tüketilmedi. ENTRY228 düzeltme ve freeze talebi; Cursor teslimi henüz authenticated channel ACK sayılmıyor.

Planning health yeni durable evidence üzerinden sınırlı75s probe ile ölçülüyor. Dogfood GO henüz verilmedi.

Planning health sonucu: timeout75s exit124, stdout boş. Yalnız read-only probe sonlandırıldı; sprint/worker kill yok. Yeni negatif receipt sonrası global admission readiness hâlâ UNKNOWN; DOGFOOD_HEALTH=DEGRADED korunuyor. Aynı probe değişiklik olmadan tekrarlanmayacak. Sıradaki admitted R1-E: operation-local bounded read amplification onarımı. Build başarılı ≠ dogfood GO.
