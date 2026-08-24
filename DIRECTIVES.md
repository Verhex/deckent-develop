# SPRINT-665 — HEARTBEAT CONSUMER CLOSURE + NOTIFICATION DELIVERY + FAN-IN

## Goal

Sprint-664 dalga-1'in landed kazanımları (worker-core provenance, nervous same-store accept)
üzerine kalan üç işi bitir: Auditor/Dashboard/Nervous host-primary liveness tüketicileri
(664-001'in temiz yeniden-yapımı + 661'in stale-worker yeniden-yazımının geçersiz kıldığı 6
legacy nervous suite'inin yeni sözleşmeye mutabakatı), sprint/FIX/approval olaylarının Telegram'a
durable teslimi, ve read-only adversarial fan-in.

## Execution contract

- DOGFOOD_MODE=ON; tek active outcome bu closure package'tır. Yeni MASTER root/outcome açılmaz.
- Files listeleri exact path taşır; glob/directory-prefix write grant yoktur.
- Wave 1: Task 1 ve Task 2 file-disjoint parallel. Wave 2: read-only Task 3 fan-in ikisine bağlı.
- Direct manual source edit yoktur. `.deckent/runtime/*` state, `follow-up-works/*`,
  `docs/MASTER-PLAN.md`, handoff receipt'leri kapsam dışıdır.
- Aktif run sırasında build, full suite, provider auth/config/bot mutation, kill/cleanup yoktur.
  Testler hermetik tmpdir + async spawn; local forks en çok 2; repo-global tsc dalga-sonu Brain'de.
- YENİ test-dosyası enflasyonu yok: davranış-pinleri MEVCUT suite'lerin yeni sözleşmeye
  güncellenmesiyle yapılır; ancak gerçekten yeni yüzey (notification-delivery) kendi tek test
  dosyasını alır. Legacy suite SİLİNMEZ — yeni host-primary sözleşmeye yeniden-hedeflenir.
- Worker result claim authority değildir; TaskResultV1 additive alanları düşürülmez.
- i18n: user-facing her string getMessage(en+tr); model/akış-değeri literal'i koda yazılmaz.

## Task 1: Host-primary liveness consumers and legacy nervous suite reconciliation
- Files: src/monitor/auditor.ts, src/monitor/dashboard-manager.ts, src/nervous/observer.ts, tests/nervous/stale-worker-activity-truth.test.ts, tests/nervous/nerv-w1b.test.ts, tests/nervous/live-w1b-adaptive.test.ts, tests/nervous/integration/observer-to-detector.test.ts, tests/nervous/integration-runtime.test.ts, tests/nervous/detectors/stale-worker.test.ts, tests/monitor/auditor-heartbeat-authority.test.ts, tests/monitor/auditor.test.ts
- Reads: src/nervous/detectors/stale-worker.ts, src/orchestra/sprint-state-tracker.ts, src/core/worker-heartbeat-authority-store.ts, src/core/worker-heartbeat-authority.ts, src/core/monitoring-types.ts
- Dependencies: none
- Priority: CRITICAL
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/nervous/ tests/monitor/
### Description
Auditor scan-loop, dashboard-manager agent projection'ı ve NervousObserver worker-görünümü
host-primary liveness truth'unu (TrackedActiveWorker.liveness / WorkerHeartbeatAuthorityStore)
tüketir; `.dashboard` sayaçları run-status read-model'le aynı done/active/blocked semantiğini
raporlar; koordinatör-süreci ölüyken `coord: alive` bayat-lease projeksiyonu düzelir. 661'in
stale-worker yeniden-yazımının retired-ettiği activity-truth sözleşmesini pinleyen 6 legacy
nervous suite + 2 auditor suite'i yeni host-primary sözleşmeye yeniden-hedeflenir — davranış
kaybı değil, sözleşme-mutabakatı. Görev sonunda declared Test komutu 0 fail vermelidir.
Not: 664-001 aynı işi denedi, NO_GO'ydu ve diff'i revert edildi; temiz zeminden başla.

## Task 2: Durable owner notification delivery for run and approval events
- Files: src/connectors/notification-delivery.ts, src/orchestra/sprint-lifecycle.ts, src/connectors/bot-commands.ts, tests/connectors/notification-delivery.test.ts
- Reads: src/cli/helpers/messages.ts, src/connectors/bot-daemon.ts, src/core/approval-broker.ts, src/core/pending-approvals.ts
- Dependencies: none
- Priority: CRITICAL
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/connectors/notification-delivery.test.ts
### Description
Canlı-defekt: Telegram botu sprint start/NO_GO/FIX/pause/terminal ve approval-request
olaylarının hiçbirini bildirmiyor. Yeni notification-delivery.ts durable append-only outbound
kuyruğu sahiplenir (yazan: sprint-lifecycle olay-noktaları; tüketen: bot poll döngüsü
bot-commands.ts); teslim en-az-bir-kez, tekrar-teslim idempotent, bot kapalıyken olaylar
kuyruğda bekler. Mesajlar getMessage(en+tr); chat_id/token DEĞERLERİ asla loglanmaz. Kuyruk
dosyası `.deckent/runtime/` altında ve runtime-hygiene lifecycle'ına uyumlu; approval decide
yüzeyine DOKUNULMAZ (yalnız bildirim).

## Task 3: Read-only adversarial fan-in
- Reads: src/monitor/auditor.ts, src/monitor/dashboard-manager.ts, src/nervous/observer.ts, src/connectors/notification-delivery.ts, src/orchestra/sprint-lifecycle.ts, src/connectors/bot-commands.ts, src/orchestra/spawn-backend-docker.ts, src/core/sprint-archive.ts, src/cli/commands/nervous.ts
- Dependencies: Task 1, Task 2
- Priority: CRITICAL
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/nervous/ tests/monitor/ tests/connectors/notification-delivery.test.ts
### Description
Mutation yapmadan Task 1-2 zincirlerini bağımsız yeniden türet: heartbeat-consumer semantiği
141-false-stale sınıfını üretmiyor mu; notification-delivery producer→queue→bot-consumer zinciri
gerçekten bağlı mı; declared testler 0 fail mi. Sprint-664 arşivindeki (664-002/003) landed
kazanımların tüketici-zincirlerinin kopmadığını da doğrula. Project source/test/docs değişikliği
NO-GO'dur; yalnız worker lifecycle `.hb`/`.result` yazılır.
