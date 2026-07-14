# sinav1-eventsourcing
NL: run-flow-coordinator icindeki event-fold rehydrate yolunda sequence-boşluğu tespiti ekle: ardışık-olmayan sequence görülürse typed integrity-hatası fırlat ve mevcut fold davranışını koru
planner: fable (158s) — 4 task

## Typed sequence-integrity hata sınıfı — run-flow-contract
- intent: implementation (conf=0.56)
- model:sonnet effort:low
- filesWrite: src/core/run-flow-contract.ts
- filesRead: src/core/run-flow-contract.ts
- goCriteria: RunFlowSequenceIntegrityError export edilir; instanceof Error doğrulanır; flowId/expectedSequence/actualSequence readonly alanları constructor'dan taş

## Store-side sequence-gap tarama helper'ı — run-flow-store
- intent: implementation (conf=0.56)
- model:sonnet effort:normal
- filesWrite: src/core/run-flow-store.ts
- filesRead: src/core/run-flow-store.ts, src/core/run-flow-contract.ts
- goCriteria: Helper pure'dur (I/O yok, side-effect yok); kesintisiz dizide ok:true, ilk boşlukta doğru index/expected/actual döner; appendFlowEvent ve mevcut read 

## Event-fold rehydrate yoluna gap-detection entegrasyonu — run-flow-coordinator
- intent: implementation (conf=0.56)
- model:opus effort:high
- filesWrite: src/orchestra/run-flow-coordinator.ts
- filesRead: src/orchestra/run-flow-coordinator.ts, src/orchestra/run-flow-reducer.ts, src/core/run-flow-store.ts, src/core/run-flow-contract.ts
- goCriteria: Boşluklu log'da rehydrate RunFlowSequenceIntegrityError fırlatır (doğru flowId/expected/actual); kesintisiz log'da fold sonucu değişiklik öncesiyle öz

## Entegrasyon testleri — gap-detection ve fold-regresyon doğrulaması
- intent: implementation (conf=0.81)
- model:sonnet effort:normal
- filesWrite: tests/orchestra/run-flow-coordinator.test.ts, tests/core/run-flow-store.test.ts
- filesRead: tests/orchestra/run-flow-coordinator-harness.ts, src/orchestra/run-flow-coordinator.ts, src/core/run-flow-store.ts, src/core/run-flow-contract.ts
- goCriteria: Boşluk-enjeksiyon testi typed hatayı ve alan doğruluğunu assert eder; temiz-log regresyon testi fold-özdeşliğini kanıtlar; helper sınır-durum testleri
