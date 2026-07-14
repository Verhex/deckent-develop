# sinav3-testyazarligi
NL: approval-expiry sweep mekanizması için ek regression testleri yaz: aynı-anda iki process sweep koşarsa çifte-kapanış-kaydı oluşmamalı
planner: fable (145s) — 5 task

## Aynı-process eşzamanlı sweep yarış testleri (iki ApprovalStore instance)
- intent: implementation (conf=0.67)
- model:sonnet effort:normal
- filesWrite: tests/core/approval-store-sweep-race.test.ts
- filesRead: src/core/approval-store.ts, src/core/approval-contract.ts, tests/core/approval-expiry-driver.test.ts
- goCriteria: En az 3 yarış senaryosu (eşzamanlı çift-sweep, idempotent re-sweep, rename/ENOENT toleransı) yeşil; her senaryoda disk üzerinde id başına closure-deci

## Gerçek çift-process sweep yarış harness'i (async spawn ile)
- intent: implementation (conf=0.81)
- model:opus effort:high
- filesWrite: tests/core/approval-sweep-multiprocess.test.ts, tests/fixtures/sweep-runner.mjs
- filesRead: src/core/approval-store.ts, src/core/approval-expiry-driver.ts, src/core/file-lock.ts, vitest.config.ts
- goCriteria: İki gerçek child-process aynı store'a eşzamanlı sweep koşuyor; nihai disk durumunda id başına tam 1 closure kaydı assert ediliyor; spawn tamamen async

## ApprovalExpiryDriver çift-driver tick yarış testleri
- intent: implementation (conf=0.67)
- model:sonnet effort:normal
- filesWrite: tests/core/approval-expiry-driver-race.test.ts
- filesRead: src/core/approval-expiry-driver.ts, src/core/approval-broker.ts, src/core/approval-store.ts, tests/core/approval-expiry-driver.test.ts
- goCriteria: 4 senaryo (çift-tick yarışı, broker-önce-disk-sonra re-close koruması, fail-soft tick + duplicate-yok, idempotent lifecycle) yeşil; her senaryoda id b

## Sweep hata-enjeksiyonu ve kayıt-bütünlüğü invariant testleri
- intent: implementation (conf=0.67)
- model:sonnet effort:high
- filesWrite: tests/core/approval-sweep-fault-injection.test.ts
- filesRead: src/core/approval-store.ts, src/core/approval-contract.ts, src/core/file-lock.ts
- goCriteria: 3 hata-yolu senaryosu deterministik mock-enjeksiyonla üretilmiş ve yeşil; 'kararı overwrite etme' ve 'diskte yarım/bozuk kayıt yok' invariant'ları açı

## Entegrasyon - yarış-suite stabilite koşusu ve CI doğrulaması
- intent: documentation (conf=0.65)
- model:sonnet effort:normal
- filesWrite: tests/core/README-approval-race.md
- filesRead: tests/core/approval-store-sweep-race.test.ts, tests/core/approval-sweep-multiprocess.test.ts, tests/core/approval-expiry-driver-race.test.ts, tests/core/approval-sweep-fault-injection.test.ts, vitest.config.ts, package.json
- goCriteria: 4 yeni test dosyası + mevcut approval suite'leri VITEST_MAX_FORKS=2 ile birlikte yeşil; 5 ardışık koşuda sıfır flaky fail; lint temiz; senaryo-matris 
