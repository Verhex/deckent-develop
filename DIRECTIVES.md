# MEKANİK SÜPÜRME DALGASI-1 (Tren Node-6a) — deathSweep hijyeni · worker host-bound kimlik · spawnSync-async

## Goal

Üç dar mekanik satır kapanır: (1) 204 — status deathSweep çıktısı ham-liste yerine
sınıf-özetli olur (canlı vaka: `status --json` 100 adet 'no flow found' satırı döküyordu) ve
handle'sız legacy flow-artıkları için owner-onaylı TİPLİ temizlik akışı tanımlanır; (2) 207 —
worker'a host-bound attemptId+backend kimliği kanıtlı taşınır, hb-yazımı kimlik-belirsizliğinde
HEARTBEAT_IDENTITY_HOLD reddi yerine doğru kimlikle yazar (674-vakası); (3) 3315 —
spawn-backend-docker dispatch sıcak-yolundaki kalan senkron git çağrıları async'e taşınır ve
spawnsync-ratchet'inden düşürülür (kısmen taşınmış: runGitCommandAsync :2583/:2600 mevcut —
teşhis-önce, kalanı kapat).

## Execution contract

- Otorite: main'deki kontratlar; assertion zayıflatılmaz. Yalnız kendi Files listendeki
  dosyalara yaz; Reads listendekileri OKU. Scope dışına çıkma; komşu dosya ihtiyacı = FINDING.
- Her task ÖNCE güncel durumu teşhis eder; kapanmış parçayı yeniden yazmaz.
- Testler hermetik (tmpdir; spawnSync YASAK — 3315'in kendisi de üretimden spawnSync
  DÜŞÜRÜR, test tarafına eklemek çelişki olur). VITEST_MAX_FORKS=2.
- Değiştirdiğin dosyalar için `npx tsc --noEmit` SIFIR hata; sonucu result notes'a yaz.
- Aktif run sırasında build/provider-auth/bot mutation YASAK.
- Doğrulama exit-kodları PIPE'SIZ yakalanır.

## Task 1: 204 — deathSweep sınıf-özetli çıktı + tipli legacy-temizlik akışı
- Files: src/orchestra/run-flow-death-sweep.ts, src/cli/commands/status.ts, tests/orchestra/run-flow-death-sweep.test.ts
- Reads: src/core/run-status-read-model.ts, src/core/run-flow-store.ts, src/core/pid-ownership.ts, src/core/run-flow-contract.ts
- Priority: HIGH
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/orchestra/run-flow-death-sweep.test.ts
### Description
Teşhis-önce: deathSweep.skipped bugün ham-liste dökülüyor (canlı vaka 100 satır). Kapanış:
(a) `deathSweep.skipped` JSON çıktısı sınıf-bazlı sayım + sınıf-başına ≤3 örnek taşır
(sözleşme ADDITIVE — mevcut alan adları korunur, yeni özet alanı eklenir; tüketici kırılmaz);
(b) handle'sız/log'suz legacy flow-artığı sınıfı için TİPLİ temizlik akışı: dry-run
envanter-raporu üreten + yalnız explicit onay bayrağıyla (owner-onaylı akış) arşive-taşıyan
bir sweep fonksiyonu — SİLME YOK, taşıma+manifest (mevcut archive desenleri; yeni CLI komutu
İCAT ETME, mevcut status/runs yüzeyindeki en yakın seam'i kullan ve seçimini result notes'a
yaz); (c) status çıktısı bit-nötr küçülme pini (özet-modda toplam bilgi kaybolmaz). Hermetik
test: 100-artık fixture'ında özet-çıktı + dry-run envanteri + onay-bayraklı taşıma + ilgisiz
handle'lara dokunulmazlık. tsc sıfır.

## Task 2: 207 — host-bound attemptId+backend kimliği worker'a kanıtlı taşınır
- Files: src/orchestra/prompt-god-template.ts, src/orchestra/sprint-spawner.ts, tests/orchestra/worker-identity-hostbound.test.ts
- Reads: src/agents/worker.ts, src/core/worker-heartbeat-authority.ts, src/core/heartbeat-types.ts
- Priority: HIGH
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/orchestra/worker-identity-hostbound.test.ts
### Description
Canlı vaka (sprint-674): worker'lar hb yazmayı `HEARTBEAT_IDENTITY_HOLD` ('identity not
host-bound') ile reddetti. Teşhis-önce: bu red hangi zincirde doğuyor —
prompt-god-template'in hb-talimatı mı, spawner'ın attemptId/backend aktarım eksiği mi?
Kapanış: (a) spawn/prompt zinciri worker'a host-bound attemptId + backend kimliğini KANITLI
taşır (env veya prompt-alanı; mevcut attempt-identity mekanizmasından türet — 683-001'in
heartbeat-authority fence'i Reads'te, İKİNCİ kimlik-şeması İCAT ETME); (b) worker hb-yazım
yolu kimlik mevcutken doğru kimlikle yazar; kimlik GERÇEKTEN belirsizse typed-HOLD kalır
(dürüstlük korunur) ama host-bound kimlik taşınan normal akışta HOLD üretilmez; (c) 674-sınıfı
red hermetik regresyon-fixture'ı: kimlikli spawn → hb yazılır; kimliksiz → typed-HOLD.
YENİ test dosyası. tsc sıfır.

## Task 3: 3315 — dispatch sıcak-yolunda kalan senkron git çağrıları async olur
- Files: src/orchestra/spawn-backend-docker.ts, scripts/spawnsync-baseline.json, tests/orchestra/docker-git-async.test.ts
- Reads: src/core/provider-execution-observations.ts, tests/orchestra/spawn-backend-mock.test.ts
- Priority: HIGH
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/orchestra/docker-git-async.test.ts
### Description
Teşhis-önce: satırın 4 çağrısından ikisi zaten async'e taşınmış görünüyor
(runGitCommandAsync :2583 hash-object, :2600 cat-file); kalan envanteri çıkar —
spawn-backend-docker.ts:2348 `spawnSync('git', ['hash-object','-w',…])` KESİN kalan, `diff
--numstat` ve diğer senkron git çağrılarını grep'le doğrula. Kapanış: kalan senkron git
çağrıları dispatch'i bloklamayan async eşdeğere taşınır (mevcut runGitCommandAsync deseni —
ikinci mekanizma yazma); davranış birebir (provider-observation v2 dosya-diff kanıtı
değişmez — Reads'teki observation modülü + mock-suite yeşil kalır);
scripts/spawnsync-baseline.json'dan taşınan çağrıların kayıtları DÜŞÜRÜLÜR (yalnız-azalma;
başka kayda dokunma). YENİ hermetik test: taşınan yolun async çağrı-zinciri (enjekte
runner-seam veya tmpdir gerçek-git — spawnSync KULLANMADAN) + baseline-düşüşünün
lint-ratchet'le tutarlılığı. tsc sıfır.
