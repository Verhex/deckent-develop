# FULL-SUITE TRUTH REPAIR (generated -- deterministic)

## Goal

Listedeki kirmizi test dosyalarini BUGUNKU landed src kontratina hizala. Kirmizilar
bayat pin / eski kontrat sinifidir; urun regresyonu kanitlanirsa dosyaya dokunmadan
NO_GO + exact kanit yazilir.

## Execution contract

- Otorite: main'deki src davranisi. Assertion ZAYIFLATILMAZ, test silinmez/skip'lenmez.
- Yalnizca kendi Files listendeki test dosyalarina yaz; Reads listendeki src
  dosyalarini kontrati ogrenmek icin OKU (yazma).
- Testler hermetik kalir; VITEST_MAX_FORKS=2 disina cikma.
- Her dosya icin kosum kaniti .result notes'ta; urun-bug kanitinda NO_GO + src dosya:satir.


## Task 1: Align failing orchestra suites (cluster 1) to landed contracts
- Files: tests/orchestra/cross-verify-docker-strict-launcher.test.ts, tests/orchestra/docker-provider-auth.test.ts, tests/orchestra/docker-provider-cli.test.ts
- Reads: src/core/active-workers.ts, src/core/audit-writer.ts, src/core/cross-verify-evidence-broker.ts, src/core/cross-verify-execution-contract.ts, src/core/file-lock.ts, src/core/provider-command-spec.ts, src/core/task-result-settlement.ts, src/core/types.ts, src/core/utils.ts, src/core/worker-heartbeat-authority-store.ts, src/orchestra/execution-landing-coordinator.ts, src/orchestra/spawn-backend-docker.ts, src/orchestra/spawn-backend.ts
- Priority: HIGH
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/orchestra/cross-verify-docker-strict-launcher.test.ts tests/orchestra/docker-provider-auth.test.ts tests/orchestra/docker-provider-cli.test.ts
### Description
Once Test komutunu kos ve kirmizi dosyalarin exact hatalarini topla. Sonra her
kirmizi testi Reads listesindeki src kontratlarini OKUYARAK guncel davranisa
hizala: bayat pin -> guncel deger, tasinan kontrat -> yeni sekil, eksik zorunlu
fixture -> testte kur. Assertion zayiflatmak YASAK. Urun-bug kanitinda dosyaya
dokunmadan NO_GO + exact src dosya:satir kaniti. Bitiste Test komutu bu kumede
TAM YESIL olmali; kosum ciktisi .result notes'a.


## Task 2: Align failing orchestra suites (cluster 2) to landed contracts
- Files: tests/orchestra/f1014-auth-isolation.test.ts, tests/orchestra/spawn-backend-docker.test.ts, tests/orchestra/wm5-auth-guard.test.ts
- Reads: src/core/active-workers.ts, src/core/file-lock.ts, src/core/provider-command-spec.ts, src/core/task-result-settlement.ts, src/core/types.ts, src/core/utils.ts, src/core/worker-heartbeat-authority-store.ts, src/orchestra/execution-landing-coordinator.ts, src/orchestra/spawn-backend-docker.ts, src/orchestra/spawn-backend.ts
- Priority: HIGH
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/orchestra/f1014-auth-isolation.test.ts tests/orchestra/spawn-backend-docker.test.ts tests/orchestra/wm5-auth-guard.test.ts
### Description
Once Test komutunu kos ve kirmizi dosyalarin exact hatalarini topla. Sonra her
kirmizi testi Reads listesindeki src kontratlarini OKUYARAK guncel davranisa
hizala: bayat pin -> guncel deger, tasinan kontrat -> yeni sekil, eksik zorunlu
fixture -> testte kur. Assertion zayiflatmak YASAK. Urun-bug kanitinda dosyaya
dokunmadan NO_GO + exact src dosya:satir kaniti. Bitiste Test komutu bu kumede
TAM YESIL olmali; kosum ciktisi .result notes'a.


## Task 3: Align failing orchestra/unit suites (cluster 3) to landed contracts
- Files: tests/orchestra/worker-auth-isolation.test.ts, tests/unit/spawn-backend-docker.test.ts
- Reads: src/core/active-workers.ts, src/core/file-lock.ts, src/core/task-result-settlement.ts, src/core/types.ts, src/core/utils.ts, src/core/worker-heartbeat-authority-store.ts, src/orchestra/execution-landing-coordinator.ts, src/orchestra/spawn-backend-docker.ts, src/orchestra/spawn-backend.ts
- Priority: HIGH
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/orchestra/worker-auth-isolation.test.ts tests/unit/spawn-backend-docker.test.ts
### Description
Once Test komutunu kos ve kirmizi dosyalarin exact hatalarini topla. Sonra her
kirmizi testi Reads listesindeki src kontratlarini OKUYARAK guncel davranisa
hizala: bayat pin -> guncel deger, tasinan kontrat -> yeni sekil, eksik zorunlu
fixture -> testte kur. Assertion zayiflatmak YASAK. Urun-bug kanitinda dosyaya
dokunmadan NO_GO + exact src dosya:satir kaniti. Bitiste Test komutu bu kumede
TAM YESIL olmali; kosum ciktisi .result notes'a.


## EK SÖZLEŞME-NOTU (bu onarımın kök-gerçeği — HER task için bağlayıcı)
Landed kontrat: DockerSpawnBackend.spawn SYNC fire-and-forget'a geri döndü (guard'lar
senkron THROW eder — eski beklentiler geçerli); capture+container-launch ise İÇ async
kuyrukta akar ve `backend.lastSpawnCompletion` promise'inde gözlemlenir. Test-hizalama
desenleri: (a) spawn-sonrası docker-invocation/marker/mount assert'lerinden ÖNCE
`await backend.lastSpawnCompletion;` ekle; (b) kuyruk-içi hata bekleyen eski
`expect(()=>spawn()).toThrow` desenleri `spawn(); await expect(backend.lastSpawnCompletion).rejects.toThrow(...)`
olur (guard-sınıfı hatalar SENKRON throw kalır — onlara dokunma); (c) kuyruk-hatası ayrıca
canonical EXIT_WITHOUT_RESULT-sınıfı marker yazar (yoksa) — buna çarpan assert'ler varsa
marker-varlığını dürüstçe hesaba kat. Assertion ZAYIFLATMA; davranış-pinleri korunur.
