# SETTLEMENT-ATOMİĞİ DALGASI (Tren Node-5) — landing-proposal yazarı · host-checkpoint · lineage-settlement authority · descendant-cancellation

## Goal

RECOVERY-BORN settlement-atomiği dörtlüsü kapanır (owner-onaylı tren sırası; 3302
replay-basamağının önkoşulu): (1) 3276 — worker landing-proposal'ları serbest-shell
serileştirmesiyle değil TEK yapılandırılmış cross-platform atomic yazarla yazılır; malformed
proposal sessizce geçemez, typed HOLD/diagnostic üretir. (2) 3285 — host-owned structured
landing checkpoint her materyal attempt-mutasyonundan sonra ve terminal result'tan önce
ilerler; stale/malformed/missing → resumable-attribution'lı typed HOLD; helper'ın gerçek
production caller'ı olur. (3) 3282 — logical-task lineage'ının TEK causal settlement
authority'si: repair yalnız güncel unresolved lineage-head'inden yetkilenir, başarılı leaf
stale/redundant XFIX ile değiştirilemez, DONE yeniden açılamaz, progress çift sayılamaz.
(4) 3295 — başarılı settlement, henüz başlamamış redundant FIX/XFIX torunlarını dispatch
ÖNCESİ atomik superseded işaretler; aktif torunlara typed cancellation kararı gider.

## Execution contract

- Otorite: main'deki kontratlar; assertion zayıflatılmaz. Yalnız kendi Files listendeki
  dosyalara yaz; Reads listendekileri OKU. Scope dışına çıkma.
- Bu satırlar 2026-08-01 kod-truth'una dayanır; HER task önce GÜNCEL durumu teşhis eder
  (modüller o günden beri evrildi) ve kapanmış alt-parçayı yeniden yazmaz — kalan exact
  residual'ı kapatır; teşhisini result notes'a yazar.
- Testler hermetik (tmpdir; spawnSync YASAK). VITEST_MAX_FORKS=2.
- Değiştirdiğin dosyalar için `npx tsc --noEmit` SIFIR hata; çıktıyı result notes'a yaz.
- Aktif run sırasında build/provider-auth/bot mutation YASAK.
- Dosya-sahipliği ayrıktır: Task-3 YALNIZ task-lineage.ts'e, Task-4 YALNIZ
  controller/scheduler tarafına yazar; birinin öbürünün dosyasında değişiklik ihtiyacı
  doğarsa result notes'a FINDING yazılır, edit YAPILMAZ.

## Task 1: 3276 — worker landing-proposal'ı için yapılandırılmış atomic yazar girişi
- Files: src/core/execution-landing-proposal.ts, src/agents/landing-proposal-entry.ts, tests/core/execution-landing-proposal.test.ts
- Reads: src/orchestra/sprint-spawner.ts, src/orchestra/spawn-backend-docker.ts, src/agents/worker.ts
- Priority: HIGH
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/core/execution-landing-proposal.test.ts
### Description
Teşhis-önce: bugün worker'lar proposal'ı hangi yolla yazıyor (prompt-segment shell-echo mu,
başka mekanizma mı) — buildExecutionLandingProposalPromptSegment tüketimini Reads'te izle.
Kapanış: (a) YENİ standalone node girişi `src/agents/landing-proposal-entry.ts`
(sprint-runner-entry emsali; CLI-kataloğuna GİRMEZ, 510-vocabulary'ye dokunulmaz) — stdin
veya argv'den JSON alır, mevcut exact attempt-şemasıyla parse/validate eder
(parseExecutionLandingProposal aynı otorite; İKİNCİ şema yazılmaz) ve
writeExecutionLandingProposal'ın same-directory atomic rename yoluyla diske koyar; invalid
girdi → stderr'e typed diagnostic (`LANDING_PROPOSAL_MALFORMED` sınıfı) + nonzero exit,
diske HİÇBİR ŞEY yazılmaz; (b) prompt-segment'i worker'a bu girişi kullandıracak şekilde
güncellenir (serbest shell-JSON serileştirme talimatı emekli; entry yolu dist-relatif ve
provider-nötr — docker/subprocess/codex hepsinde node mevcut varsayımını Reads'ten doğrula,
değilse dürüst FINDING); (c) host parse fail-closed davranışı korunur fakat malformed
artık sessiz-yok-sayma değil typed diagnostic taşır (mevcut hold/diagnostic kanalına).
Test eklentileri: entry'nin valid/invalid/oversize yolları (execFile ile GERÇEK node girişi
— async, spawnSync yok), atomicity (yarım dosya asla görünmez), mevcut suite bit-yeşil.
tsc sıfır.

## Task 2: 3285 — host-owned checkpoint zinciri production'a bağlanır
- Files: src/orchestra/execution-landing-coordinator.ts, src/agents/worker.ts, tests/orchestra/execution-landing-coordinator.test.ts, tests/core/execution-landing-checkpoint.test.ts
- Reads: src/core/execution-landing-proposal.ts, src/orchestra/sprint-phases.ts, src/core/execution-landing-checkpoint.ts, src/core/execution-landing-context.ts, src/core/task-result-settlement.ts, src/core/task-types.ts
- Priority: CRITICAL
- Model: gpt-5.6-sol
- Dependencies: Task 1
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/orchestra/execution-landing-coordinator.test.ts tests/core/execution-landing-checkpoint.test.ts
### Description
Teşhis-önce: satırın 2026-08-01 kanıtı "yeni host helper'ın production caller'ı yok" ve
"checkpoint freshness model-bağımlı" diyordu — coordinator'ın bugünkü gerçek çağrı-zincirini
çıkar (kim üretiyor, kim tüketiyor, hangi fazda). Kapanış: (a) worker-lifecycle'ın sahip
olduğu schema-validated same-directory atomic checkpoint yazarı her MATERYAL disk-mutasyonu
sonrası ve terminal result yazımı ÖNCESİ sequence+content ilerletir (materyal-mutasyon
tanımını mevcut attempt-şemasından türet; yeni kavram icat etme); (b) stale (sequence geri),
malformed veya missing checkpoint → typed execution HOLD + resumable attribution (hangi
attempt/sequence'ta kalındığı kaydedilir; recovery bu bilgiyle devam edebilir) — provider
düzyazısı veya shell-quoting checkpoint otoritesi DEĞİLDİR; (c) zincirin production
caller'ı kanıtlanır: EVALUATE/terminal yolunda checkpoint-freshness kontrolünün gerçekten
çalıştığı testle pinlenir. Mevcut iki suite bit-yeşil kalır; yeni pinler eklenir. tsc sıfır.

## Task 3: 3282 — lineage causal-settlement authority (foldTaskLineages)
- Files: src/core/task-lineage.ts, tests/core/task-lineage.test.ts, tests/core/lineage-causal-authority.test.ts
- Reads: src/orchestra/sprint-controller.ts, tests/core/ent3-lineage.test.ts
- Priority: CRITICAL
- Model: gpt-5.6-sol
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/core/task-lineage.test.ts tests/core/lineage-causal-authority.test.ts
### Description
Teşhis-önce: foldTaskLineages (task-lineage.ts:232) bugün leaf'i neye göre seçiyor —
2026-08-01 kanıtı "later attempt depth/time, causal authorization'sız" idi; güncel durumu
çıkar. Kapanış (task-lineage.ts İÇİNDE — controller'a YAZMA, gerekirse FINDING): (a) repair
yalnız GÜNCEL unresolved lineage-head'inden yetkilidir — head-dışı/paralel-doğmuş XFIX
lineage'ı settle EDEMEZ; (b) başarılı repair logical task'ı TAM BİR KEZ settle eder: stale
veya redundant XFIX başarılı leaf'i DEĞİŞTİREMEZ, DONE'u yeniden AÇAMAZ, progress'i çift
SAYAMAZ, dependant'ları zehirleyemez (settled-DONE bir root'un torunları için sonraki
NO_GO'lu stale-leaf aggregate verdict'i düşürmez); (c) sprint-488 vakası regresyon-fixture
olur: 001/010/013 başarılıyken doğan gereksiz XFIX'lerin fold sonucu settled-DONE'u
koruması pinlenir; (d) forcedByBlockedDependents akışının bu authority'yi BYPASS edemediği
task-lineage tarafındaki karar-yüzeyinde pinlenir (controller-tarafı tüketim değişikliği
gerekiyorsa exact FINDING). YENİ test dosyası causal-authority senaryolarını taşır; mevcut
lineage suite'leri bit-yeşil. tsc sıfır.

## Task 4: 3295 — settlement'ta redundant-descendant cancellation (transactional)
- Files: src/orchestra/sprint-controller.ts, tests/orchestra/lineage-descendant-cancellation.test.ts
- Reads: src/core/task-lineage.ts, src/orchestra/sprint-phases.ts, src/orchestra/scheduler-effects.ts
- Priority: CRITICAL
- Dependencies: Task 3
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/orchestra/lineage-descendant-cancellation.test.ts
### Description
Teşhis-önce: FIX/XFIX doğum→kuyruk→dispatch zincirinin bugünkü exact yolunu çıkar
(sprint-controller + scheduler-effects; sprint-490 vakası: 013 ikinci-FIX'te başarılıyken
önceden-kuyruklu üçüncü repair yine spawn edildi). Kapanış (controller/scheduler tarafında;
task-lineage.ts'e YAZMA — Task-3'ün authority API'sini TÜKET): (a) kabul edilen repair
logical-root'u settle ettiği anda henüz BAŞLAMAMIŞ kuyruklu FIX/XFIX torunları dispatch
ÖNCESİ atomik olarak superseded işaretlenir (işaret + dispatch-atlaması aynı karar
noktasında — yarış penceresi kalmaz); (b) o anda AKTİF (spawn edilmiş) redundant torun
varsa typed cancellation kararı alır (öldürme semantiği mevcut kill/cleanup yasaklarına
uygun: zorla-kill değil, sonucu superseded-sınıfıyla düşürme — mevcut mekanizmadan türet);
(c) progress muhasebesi TEK logical DONE kalır; sonraki stale leaf yeniden açamaz (Task-3
authority'siyle uçtan-uca test); (d) NEGATİF kapsam pinli: global retry-cap konmaz,
ilgisiz lineage'lara dokunulmaz. YENİ hermetik test: 490-vakası regresyon senaryosu +
aktif-torun typed-cancellation + ilgisiz-lineage dokunulmazlığı. tsc sıfır.
