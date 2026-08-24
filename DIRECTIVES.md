# SPRINT-664 — HEARTBEAT/NOTIFICATION AUTHORITY CLOSURE + 661 RESIDUAL LANDING

## Goal

Sprint-661'in ABORTED bıraktığı üç residual'ı (host-primary heartbeat consumer'ları,
worker-core immutable delivery/provenance, read-only adversarial fan-in) ve canlı-gözlenen iki
notification-kopukluğunu (Nervous accept store-uyumsuzluğu; sprint/FIX/approval olaylarının
Telegram'a hiç ulaşmaması) tek production authority zincirinde kapat. Her yüzey aynı
host-primary liveness truth'unu ve aynı durable delivery yolunu tüketmeli.

## Execution contract

- DOGFOOD_MODE=ON; tek active outcome bu closure package'tır. Yeni MASTER root/outcome açılmaz;
  bulgular mevcut RUNFLOW-001 / EVALUATION-001 / notification kapsamlarında taşınır.
- Files listeleri exact path taşır; glob/directory-prefix write grant yoktur.
- Wave 1: Task 1, 2 ve 3 file-disjoint parallel. Wave 2: Task 4 (Task 3'e bağlı). Wave 3:
  read-only Task 5 fan-in bütün tasklara bağlıdır.
- Direct manual source edit yoktur. Worker yalnız listed Files alanına yazar.
  `.deckent/runtime/*` state dosyaları, `follow-up-works/*`, `docs/MASTER-PLAN.md` ve handoff
  receipt'leri kapsam dışıdır.
- Aktif run sırasında build, full suite, provider auth/config/bot mutation, kill/cleanup yoktur.
  Testler hermetik tmpdir + async spawn kullanır; local forks en çok 2. Görev-Test satırları
  yalnız scoped vitest dosyalarıdır — repo-global tsc/full-suite dalga-sonunda Brain koşar.
- Worker result claim authority değildir; host measurement bağımsızdır. Canonical TaskResultV1
  additive alanları (promptCompilePlanId, testVerification, techDebtCriterionIds,
  hostTerminalProjection) düşürülmeden taşınır.
- i18n: user-facing her string `getMessage(key, lang)` (en+tr). Model adı/akış-değeri literal'i
  koda yazılmaz; policy config'ten çözülür.

## Task 1: Host-primary heartbeat consumers for Auditor and Dashboard
- Files: src/monitor/auditor.ts, src/monitor/dashboard-manager.ts, src/nervous/observer.ts, tests/monitor/auditor-host-liveness.test.ts, tests/nervous/observer-host-liveness.test.ts
- Reads: src/orchestra/sprint-state-tracker.ts, src/core/worker-heartbeat-authority-store.ts, src/core/worker-heartbeat-authority.ts, src/core/monitoring-types.ts
- Dependencies: none
- Priority: CRITICAL
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/monitor/auditor-host-liveness.test.ts tests/nervous/observer-host-liveness.test.ts
### Description
Auditor scan-loop, dashboard-manager agent projection'ı ve NervousObserver worker-görünümü,
legacy `.hb` mtime/alan okuması yerine host-primary liveness truth'unu
(`TrackedActiveWorker.liveness` / WorkerHeartbeatAuthorityStore) tüketir. `.dashboard`
progress sayaçları ile run-status read-model'in done/active/blocked eksenleri aynı semantiği
raporlar (sprint-661 canlı-gözlem: dashboard done=3 iken read-model done=0 ayrışması; ayrıca
koordinatör-süreci ölüyken `coord: alive` bayat-lease projeksiyonu). 141-false-`hb.stale`
sınıfı respawn önerisi üretemez.

## Task 2: Worker-core immutable delivery and archive provenance
- Files: src/orchestra/spawn-backend-docker.ts, src/core/sprint-archive.ts, tests/orchestra/worker-core-system-prompt.test.ts, tests/core/sprint-archive.test.ts
- Reads: src/core/task-result-schema.ts, src/core/prompt-delivery-receipt.ts, src/orchestra/result-ingress.ts
- Dependencies: none
- Priority: HIGH
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/orchestra/worker-core-system-prompt.test.ts tests/core/sprint-archive.test.ts
### Description
`.worker-core-<digest>.md` teslimatı full SHA-256 immutable byte-check + exact
task/attempt/provider/channel/argv receipt binding taşır; canonical sprint-archive bu
provenance'ı replay-doğrulanabilir arşivler (sprint-661 Task 008'in kapsamı; worker o run'da
sıfır-iş çöktüğü için hiç landelenmedi). Eski worker-core artifactları silinmez.

## Task 3: Nervous accept resolves the recommendation store
- Files: src/cli/commands/nervous.ts, src/nervous/executor.ts, tests/cli/nervous-accept-recommendation.test.ts
- Reads: src/core/nervous-types.ts, src/nervous/decision-engine.ts, src/core/pending-approvals.ts
- Dependencies: none
- Priority: HIGH
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/cli/nervous-accept-recommendation.test.ts
### Description
Canlı-defekt (sprint-661): Nervous `SPRINT_START operation=resume-paused-run` recommendation'ı
üretti fakat `deckent nervous accept <id>` farklı pending-notification store'unu okuyup
`not found` döndü; recommendation yalnız dismiss edilebiliyordu. Accept/reject, recommendation
kimliğini ürettiği store'dan çözer; karar durable disposition olarak yazılır; typed
unknown-id reddi korunur. MCP read-only yüzeyi değişmez.

## Task 4: Durable owner notification delivery for run and approval events
- Files: src/connectors/notification-delivery.ts, src/orchestra/sprint-lifecycle.ts, src/connectors/bot-commands.ts, tests/connectors/notification-delivery.test.ts
- Reads: src/cli/helpers/messages.ts, src/connectors/bot-daemon.ts, src/core/approval-broker.ts
- Dependencies: Task 3
- Priority: CRITICAL
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/connectors/notification-delivery.test.ts
### Description
Canlı-defekt (sprint-661): Telegram botu sprint start/NO_GO/FIX/pause/terminal ve
approval-request olaylarının hiçbirini bildirmedi. Yeni `notification-delivery.ts` durable
append-only outbound kuyruğu sahiplenir (yazan: sprint-lifecycle olay-noktaları; tüketen:
bot poll döngüsü `bot-commands.ts`); teslim en-az-bir-kez, tekrar-teslim idempotent,
bot kapalıyken olaylar kuyruğda kalır. Mesaj metinleri getMessage(en+tr) ile gelir;
chat_id/token DEĞERLERİ asla loglanmaz. Kuyruk dosyası `.deckent/runtime/` altındadır ve
runtime-hygiene lifecycle'ına uyar; approval decide yüzeyine DOKUNULMAZ (yalnız bildirim).

## Task 5: Read-only adversarial fan-in and sprint-661 replay
- Reads: src/monitor/auditor.ts, src/monitor/dashboard-manager.ts, src/nervous/observer.ts, src/orchestra/spawn-backend-docker.ts, src/core/sprint-archive.ts, src/cli/commands/nervous.ts, src/nervous/executor.ts, src/connectors/notification-delivery.ts, src/orchestra/sprint-lifecycle.ts, src/connectors/bot-commands.ts
- Dependencies: Task 1, Task 2, Task 3, Task 4
- Priority: CRITICAL
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/monitor/auditor-host-liveness.test.ts tests/connectors/notification-delivery.test.ts tests/cli/nervous-accept-recommendation.test.ts
### Description
Mutation yapmadan Task 1-4 çıktılarının producer→consumer→entrypoint zincirini bağımsız
yeniden türet: sprint-661 arşivini (.deckent/archive/sprints/sprint-661) replay ederek
heartbeat-consumer semantiğinin 141-false-stale sınıfını üretmediğini, worker-core
provenance'ın arşivden doğrulanabildiğini, nervous-accept ve notification-delivery
zincirlerinin declared testlerle kanıtlandığını raporla. Project source/test/docs
değişikliği NO-GO'dur; yalnız worker lifecycle `.hb`/`.result` yazılır.
