# ADR-045: Wave-Based Execution Semantics — respawnEligibleTasks Runtime Wire

**Status:** accepted

**Deciders:** Alperen Sartaçoğlu (product owner), Brain (orchestrator)

**Date:** 2026-05-13

**Sprint:** Sprint 164 (implementation contract — Task 4 wire implementation bu ADR'a uyumlu yazılır)

---

## Status

accepted (Sprint 164 — implementation'dan ÖNCE yazılan contract ADR; ADR-036 Sprint 138 ADR Governance disiplinine uygun)

---

## Context

Sprint 134 T-007'de `respawnEligibleTasks` fonksiyonu `sprint-spawner` modülünde tanımlandı
(Kahn's algorithm topological sort + `enforceWaveDependency` çağrısı + slot kontrolü).
Ancak fonksiyon runtime'da **hiçbir yerden çağrılmıyordu** — call-site eksikti.

Bu eksiklik 5 sprint boyunca görünmez kaldı:

- **Sprint 156-002:** Default `dependency_pipeline_enabled: false → true` flip yapıldı
  (`GO_WITH_TECH_DEBT` kararı). Wire eksikliği bu flipte tespit edilmedi.
- **Sprint 161 stalled forensic:** Wave 1 (3 task) spawn oldu; Wave 2 (T4 bağımlı T2'ye) ve
  Wave 3 (T5 bağımlı T1+T2+T4'e) hayalet kaldı. Sprint hang — `waitForResults` sonsuza
  kadar bekledi çünkü eligible task'lar hiç spawn edilmedi.
- **Sprint 164 forensic analizi:** 6 ayrı kanıtla (KESİN güven) bug doğrulandı:
  1. `respawnEligibleTasks` definition Sprint 134'ten beri var, call-site yok
  2. `spawnWorkers` Wave 2+ task'larını `activeTasks` ve `queuedTasks` listelerinden çıkarıyor
  3. `waitForResults` dep-blind FIFO loop — yalnızca ilk `queuedTasks`'tan shift ediyor
  4. `task.status` EXECUTING'de kalıp DONE'a inline mutate edilmiyor; `respawnEligibleTasks`
     `t.status === TaskStatus.DONE` filter'ı çalıştırınca eligible task bulamıyor
  5. `processQueue` FIFO sonrası dep-aware respawn çağrısı yok
  6. `collectResults` result topladıktan sonra in-memory status sync yapmıyor

**Sonuç:** `dependency_pipeline_enabled: true` flag set edilmesine rağmen multi-wave execution
semantiği hiçbir zaman çalışmamış; tüm sprint'ler legacy FIFO modunda devam etmiştir.

---

## Decision

Yol B (wire) — 3 değişiklik yapılır. Bu 3 madde Task 4 implementasyonu için **binding contract**:

### 1. `collectResults` İçinde Inline Status Mutation

Bir `.result` dosyası toplandığında `taskMap.get(taskId)` referansı üzerinden in-memory
task status mutation yapılır. Worker `selfAssessment` alanına göre:

| selfAssessment değeri       | Yeni status           |
|-----------------------------|-----------------------|
| `DONE`                      | `TaskStatus.DONE`     |
| `NO_GO`                     | `TaskStatus.NO_GO`    |
| `GO_WITH_TECH_DEBT`         | `TaskStatus.DONE`     |

`GO_WITH_TECH_DEBT` → `DONE` map'i bilinçli bir karardır: dependency filter
`t.status === TaskStatus.DONE` kontrolü yapar; debt ile kapanan task'ların bağımlısını
bloke etmemesi gerekir (ADR-045 Consequences bölümüne bkz.).

`taskMap` zaten `Map<string, Task>` kullanıyor; `taskMap.get(taskId)` referansı
`sprint.tasks` array'indeki aynı objeye işaret eder (referans paylaşımı). In-memory
mutation yeterli — EVALUATE phase sonrası disk'e yazılır (mevcut pipeline korunur).

**Rationale:** `respawnEligibleTasks` eligible task hesabı için `sprint.tasks` üzerinden
`t.status === TaskStatus.DONE` filter'ı çalıştırır. EVALUATE phase öncesi inline
mutation olmadan bu filter her zaman boş döner — Wave 2/3 task'ları asla eligible olmaz.

### 2. `waitForResults` Ana Döngüsünde Dep-Aware Respawn

`waitForResults` içinde, her `processQueue(newlyCollected)` çağrısının ardından
`dependency_pipeline_enabled` kontrolü ile dallanma yapılır:

```typescript
if (config.dependency_pipeline_enabled) {
  await respawnEligibleTasks(projectRoot, sprint, config, spawnOpts);
}
// else: legacy FIFO — processQueue yeterli, queuedTasks shift ile devam
```

`config: ResolvedConfig` parametresi `waitForResults` signature'a eklenir. Caller'lar
(`sprint-controller.ts::runFullSprint` ve `sprint-phases.ts::runEvaluatePhase` giriş noktaları)
parameter pass-through ile güncellenir — davranış değişikliği yok, sadece forwarding.

İlk `collectResults + processQueue` bloğunun sonrasında da aynı respawn çağrısı yapılır:
race-safe initial pass — Wave 1 ilk turda done olduysa Wave 2 hemen eligible olur.

**Legacy compatibility:** `dependency_pipeline_enabled: false` (Sprint 164 default) durumunda
`if` branch'i çalışmaz; `waitForResults` mevcut FIFO davranışını korur. Geriye uyumlu.

### 3. `respawnEligibleTasks` Slot Kontrolü Korunur

`sprint-spawner` modülündeki mevcut `slotsAvailable = maxWorkers - currentlyExecuting` kontrolü
**değiştirilmez**. Bu kontrol çift spawn'ı engeller. `enforceWaveDependency` çağrısı korunur.
`wave.respawn` metric emit'i ve `BRAIN→WORKER:DEPENDENCY_BLOCKED` event emit'leri zaten
implement — artık gerçekten tetiklenecek.

**Config freeze:** `dependency_pipeline_enabled` değeri Sprint 164'te `false` olarak kalır.
Config flip Sprint 165'te Alperen onayı ile yapılır (canlı retry + smoke test).

---

## Alternatives Considered

### (a) Yol A — Feature Burial (Flag Deprecate)

`dependency_pipeline_enabled` flag'i deprecated işaretlenir, `respawnEligibleTasks` kodu
silinir, tüm sprint'ler legacy FIFO ile devam eder.

**Neden reddedildi:** Alperen açık wire kararı verdi. Sprint 134 T-005 priority+dependencies
altyapısı ve Sprint 134 T-007 chain scheduler, multi-wave execution için tasarlandı. Bu altyapı
5 sprint boyunca sessizce var; bury seçeneği Sprint 134 T-007 design intent'ini kalıcı olarak
iptal eder. Product roadmap açısından dependency-aware execution kritik özellik — burial değil
completion gerekli.

### (b) Disk-Based Status Read

`respawnEligibleTasks`, in-memory task status yerine `.result` dosyasının mevcudiyetine bakarak
eligible task'ları belirler (`existsSync('.tasks/task-NNN.result')`).

**Neden reddedildi:** Disk I/O overhead her respawn döngüsünde N task × `existsSync` çağrısı
anlamına gelir. In-memory `task.status` zaten otoriter kaynak — `collectResults` result'ı okur,
in-memory map'i günceller. Disk-based check tutarsız state yaratabilir (result yazıldı ama
in-memory henüz güncellenmedi durumu). Memory-first mimari tercih edilir (ADR-005 deprecated
olmasına rağmen in-memory state consistency prensibi geçerli).

### (c) Status Mutation Sadece EVALUATE Phase'de

`task.status` mutasyonu yalnızca `runEvaluatePhase` içinde yapılır; EXECUTE devam ederken
in-memory status değişmez.

**Neden reddedildi:** `respawnEligibleTasks` EVALUATE phase'e girmeden önce `waitForResults`
ana döngüsü içinden çağrılır. EVALUATE-only mutation, respawn çağrısı anında `t.status` hâlâ
`EXECUTING` olduğu için eligible task bulamaz — wire çalışmaz. Inline mutation (Decision 1)
timing sorununu çözer: `collectResults` result toplar → status mutate → `processQueue` →
`respawnEligibleTasks` → eligible Wave 2 task'lar bulunur → spawn edilir.

---

## Consequences

### Olumlu

- **Wave 2/3 task'lar spawn olur.** Dependency-aware execution semantiği ilk kez runtime'da
  gerçek anlamda çalışır. Multi-wave sprint planları (priority + dependencies ile) uygulanabilir.
- **Sprint 161 stalled senaryosu fix'lenir.** 3 spawn + 2 hayalet → 5/5 spawn. `waitForResults`
  artık tüm task'ların tamamlanmasını bekleyebilir.
- **Sprint 134 T-007 design intent tamamlanır.** Chain scheduler runtime kanıtı kazanır;
  5 sprintlik call-site borcu kapanır.
- **`BRAIN→WORKER:DEPENDENCY_BLOCKED` event'leri gerçekten yayınlanır.** `wave.respawn` metriği
  meaningful veri içerir; observability zinciri tamamlanır.

### Olumsuz

- **`task.status` mutation timing değişir.** EVALUATE phase öncesi DONE/NO_GO status set edilir.
  EVALUATE phase içindeki status okumaları bu mutasyonun farkında olmalı; mevcut EVALUATE
  logic'i tekrar status set ederse duplicate mutation olur (idempotent — problem yok).
- **`evaluate-phase idempotency` regression riski.** Sprint 159 survivor test
  (`evaluate-phase-idempotency`) status mutation timing değişikliğini test eder. Task 4
  bu testi bozmamak zorunda; bozulursa Auditor + Alperen onayıyla test güncellenebilir.
- **Auditor `git diff --stat` boundary'yi etkilemez.** In-memory status mutation disk yazısı
  yapmaz — Auditor scope violation detection sistemi bu değişiklikten etkilenmez (ADR-037 safe).

### Risk Mitigation

- **Sprint 159 survivor test:** `evaluate-phase-idempotency` 6-case regression suite mevcut;
  Task 4 bu testi PASS etmek zorunda.
- **Sprint 165 smoke:** `dependency_pipeline_enabled: true` flip + 3-task multi-wave smoke
  sprint ile canlı doğrulama yapılır. Wire production'da kanıtlanmadan Sprint 165 geçmez.
- **Sprint 166 rollback opsiyonu:** Flag `false`'a geri çevrilebilir. Wire kodu `disabled mod`'da
  mevcut `if (config.dependency_pipeline_enabled)` branch atlayarak legacy davranışa döner.
  Wire kodu silinmek zorunda değil; rollback non-destructive.

---

## References

1. **Sprint 134 T-007 spec** — `respawnEligibleTasks` + Kahn's algorithm chain dependency
   scheduler tasarımı (+620 LoC, Sprint 139 Wave 1 Early Wire Bootstrap)
2. **Sprint 156-002 flip commit** — `dependency_pipeline_enabled: false → true` default değişimi
   (`GO_WITH_TECH_DEBT` — wire eksikliği bu sprintte tespit edilmedi)
3. **Sprint 161 stalled task archive** — `.tasks/archive/sprint-161-stalled/` Wave 2/3 hayalet
   forensic kanıtı (3 spawn + 2 hayalet → sprint hang)
4. **Sprint 162 spurious NO_GO bug ve Sprint 163 T1 fix** — Status mutation timing dersleri;
   in-memory `task.status` sync önemi (ADR-045 Decision 1'in doğrudan öncülü)
5. **ADR-036: ADR Governance Integration** — Bu ADR'ı mandatory read yapan kural; Sprint 138
   ADR Governance disiplini gereği implementation'dan önce yazılır
6. **ADR-037: Brain-Auditor-Worker Authority Matrix** — Wire implementasyonu RBAC sınırlarını
   ihlal etmemeli; in-memory mutation Auditor'ın `git diff --stat` boundary sistemini bypass
   etmez (disk write yok)
7. **ADR-039: Self-Modifying Task Detection** — Deckent dogfood discrimination — wire kendi
   sprint planlamasını etkilemiyor; `respawnEligibleTasks` sadece mevcut sprint task'larını
   re-evaluates eder, yeni task yaratmaz

---

## Memory DB Insert Pattern

Worker bu ADR'ı tamamladıktan sonra aşağıdaki pattern ile `memory.db`'ye insert yapılır:

```typescript
store.insert({
  type: 'adr',
  id: 'adr-045',
  title: 'Wave-Based Execution Semantics — respawnEligibleTasks Runtime Wire',
  status: 'accepted',
  sprint_id: 'sprint-164',
  tags: ['dep-pipeline', 'wave-execution', 'task-status', 'wire', 'sprint-134-completion'],
  body: 'Yol B wire: collectResults inline status mutation + waitForResults dep-aware respawn + respawnEligibleTasks slot kontrolü korunur. Sprint 161 stalled fix. dependency_pipeline_enabled: false (Sprint 165 flip için bekletilir).',
});
```

Markdown dosyası `deckent memory export` ile auto-regenerate edilir. ADR-036 Memory V2
DB-first kuralı gereği bu manuel DECISIONS.md güncellemesi DEĞİL, DB insert + export
pipeline'ı ile yönetilir.

---

## Notes

Bu ADR, `dependency_pipeline_enabled: true` Yol B wire implementasyonunun (Task 4) **contract
belgesidir** — implementation'dan önce yazılır. Task 4 worker bu ADR'ı okumak ve Decision
bölümündeki 3 maddeye uymak zorundadır. Sapma → NO_GO + ADR amendment proposal (ADR-036 mandatory).

Sprint 165 ile `dependency_pipeline_enabled: false → true` config flip + canlı multi-wave smoke
test yapıldıktan sonra bu ADR production-validated olarak işaretlenir.

> **Note (deep-verified vs code, Sprint 172):** Bu contract ADR'nin **3 Decision maddesi de kodda birebir indi** (gövde gelecek-zamanlı kalmıştır; aşağıdaki güncel gerçektir):
> - **§1** → `src/orchestra/result-collector.ts:123-131` `applyStatusMutation` — 3-satır tablo (`DONE→DONE`, `GO_WITH_TECH_DEBT→DONE`, `NO_GO→NO_GO`) ve debt-DONE rationale yorumu ADR ile birebir.
> - **§2** → `result-collector.ts:379-387` `maybeRespawn` — `if (!config?.dependency_pipeline_enabled) return` legacy-FIFO no-op + fail-soft try/catch + `respawnEligibleTasks(projectRoot, sprint, config, spawnOpts)`. Tek nüans: respawn statik değil **lazy dynamic-import** (`loadRespawn()`) ile yüklenir — sözleşme sapması değil, ADR-008 tek-yönlü bağımlılık dostu.
> - **§3** → `src/orchestra/sprint-spawner.ts` — slot kontrolü korundu (`:507` `slotsAvailable = max(0, maxWorkers - currentlyExecuting)`), `enforceWaveDependency` korundu (`:486`), `BRAIN→WORKER:DEPENDENCY_BLOCKED` (`:493`) ve `wave.respawn` metric (`:576`) gerçekten tetikleniyor; eligible filtresi `t.status === TaskStatus.DONE` (`:477`).
>
> **deckent-dev gerçeği:** Bu projede `.deckent/config.json` `dependency_pipeline_enabled: false` — Wave geçişleri bilinçle Brain-manuel (ADR-047, Sprint 164-171 kanıtlı). ADR'deki "Sprint 165 flip → production-validated" **kullanıcı-projesi default yolunu** tanımlar (`config.ts` kod default `true`, ADR-045 Sprint 169 H5'te `docs/reference/api-surface.md`'de teyitli); dogfood'da flag `false` kalır, rollback non-destructive (`if` branch atlanır). Behavior unchanged; documentation alignment only.
