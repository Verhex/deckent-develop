# ADR-043: Brain Crash Recovery Protocol

**Status:** accepted

**Deciders:** Alperen Sartaçoğlu (product owner), Brain (orchestrator)

**Date:** 2026-05-13

**Sprint:** Sprint 163 (backfill — implementation sprints: 160, 161, 162)

---

## Status

accepted (Sprint 163 — Sprint 160 T-001 + Sprint 161 T-002 + Sprint 162 T-004 birleşik implementasyonunun geriye dönük belgelenmesi)

---

## Context

Sprint 159–161 forensic analizinde Brain crash recovery'nin üç kritik eksikliği tespit edildi:

**1. Negatif `durationMs` bug (`durationMs: -106`)**
Sprint state dosyası (`sprint-state.json`) crash öncesi `startTime` doğru yazılmıştı; ancak crash sonrası Brain yeniden başladığında `durationMs` hesaplaması yanlış referans zamanı kullanıyordu. Sonuç: negatif süre değerleri dashboard'da görünür hale geldi, sprint metrikleri güvenilmez oldu.

**2. Stale EXECUTING task'lar `handleEvaluation`'a girmedi**
Brain crash anında bazı task'lar `EXECUTING` statüsünde kalmış olabiliyordu. Yeniden başlamada bu task'ların `.result` dosyaları disk'te varken Brain bunları `handleEvaluation` pipeline'ına sokmuyordu. Görünürde tamamlanmış iş kayboluyordu; sprint döngüsü yanlış `NO_GO` veya eksik evaluate ile kapanıyordu.

**3. Sensitive data exception log'unda leak riski**
Unhandled exception yakalanmadığı durumlarda `process.on('uncaughtException')` handler yoktu. Stack trace'ler içinde `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` gibi environment variable değerleri doğrudan log'a yazılabiliyordu. Bu durum ADR-034 (Multi-Project Isolation) güvenlik sınırlarını ihlal edebilirdi.

Bu üç sorun birbirinden bağımsız commit'lerde düzeltildi (Sprint 160 T-001, Sprint 161 T-002, Sprint 162 T-004) ancak bir recovery protokolü olarak ADR'ye alınmamıştı. ADR-043 bu protokolü resmî hale getirir.

---

## Decision

Brain için **3-katman crash recovery protokolü** zorunlu kılınır:

### Katman 1 — Entry-Point Exception Handler (Sprint 160 T-001)

**Commit:** `9c184a3`

Process boot'ta `installCrashHandlers()` çağrısı yapılır. Bu fonksiyon:

- `process.on('uncaughtException', handler)` kaydeder
- `process.on('unhandledRejection', handler)` kaydeder
- Her handler `redactSensitive(error.message + stack)` çağrısıyla API key/token pattern'lerini log'a yazmadan önce `***REDACTED***` ile değiştirir

`redactSensitive()` regex coverage:
- `sk-ant-...` (Anthropic API key pattern)
- `Bearer <token>`
- `OPENAI_API_KEY=<value>`
- `GOOGLE_API_KEY=<value>`
- Genel `apiKey: "..."` JSON pattern

**Zorunluluk:** `sprint-controller.ts` veya entry-point binary'de `installCrashHandlers()` process boot'un ilk satırlarında çağrılmalıdır. Handler kurulmadan sprint başlatılamaz.

### Katman 2 — Atomic Checkpoint Write (Sprint 161 T-002)

**Commit:** `8cefed0`

Sprint execution boyunca periyodik checkpoint yazımı yapılır (`sprint_checkpoint_interval` config anahtarı, `config.ts:602` default `5`; Sprint 139 yüksek-riskli sprint'lerde `3`'e override edilir). Checkpoint atomicity kuralı:

1. `computeEventStreamOffset()` ile o ana kadar yazılan event sayısı hesaplanır
2. `completedTasks` listesi checkpoint'e eklenir (boş array YASAK — en az 1 completed task varsa populate edilmeli)
3. `checkpointNumber` her yazımda artırılır
4. Dosya **doğrudan hedef path'e yazılmaz** — önce `.tmp` suffix'li geçici dosyaya yazılır, ardından `renameSync()` ile atomik rename yapılır

Bu pattern, yarı yazılmış checkpoint'in okunan geçersiz state'e yol açmasını önler. `renameSync()` POSIX sistemlerde atomik garantilidir.

**Checkpoint schema zorunlu alanları:**
```json
{
  "checkpointNumber": "<integer >= 1>",
  "eventStreamOffset": "<integer > 0>",
  "completedTasks": ["<taskId>", "..."],
  "sprintId": "<sprint-NNN>",
  "timestamp": "<ISO 8601>"
}
```

### Katman 3 — State Recovery on Restart (Sprint 162 T-004)

`restoreSprintFromCheckpoint()` fonksiyonu Brain restart'ında checkpoint'i okur ve 3 action'dan birini seçer:

| Koşul | Action | Açıklama |
|---|---|---|
| Checkpoint yok | `fresh` | Yeni sprint başlat, geçmiş state yok |
| Tüm task'lar DONE veya NO_GO | `complete` | Sprint zaten tamamlanmış, cleanup'a geç |
| Stale EXECUTING task'lar var + `.result` mevcutsa | `resume-evaluate` | `.result` dosyasını `handleEvaluation`'a sok |

**`resume-evaluate` ayırt etme kuralı:**
Stale EXECUTING task için `.tasks/task-NNN.result` dosyası disk'te mevcutsa → worker iş bitirmiş, Brain crash etmişti → result `handleEvaluation`'a girer.
`.result` yoksa → worker da crash etmiş veya henüz tamamlamamış → task EXECUTING kalır, timeout beklenir.

**`durationMs` fix:**
`restoreSprintFromCheckpoint()` içinde sprint `startTime` checkpoint'ten restore edilir. `durationMs` hesabı `Date.now() - restoredStartTime.getTime()` olarak yapılır. Bu negatif durationMs bug'ını ortadan kaldırır.

---

## Consequences

### Olumlu

- **Brain restart sonrası state korunur.** `resume-evaluate` action ile tamamlanmış worker sonuçları kaybolmaz.
- **Negatif `durationMs` giderildi.** Sprint metrikleri crash sonrasında da anlamlı değerler gösterir.
- **Sensitive data exception log'una sızmaz.** `redactSensitive()` API key/token değerlerini process crash loglarından temizler.
- **External observer crash öncesi state'i restore edebilir.** Atomic checkpoint, makul bir tutarlılık noktası sağlar.
- **Checkpoint integrity.** `.tmp` + `renameSync()` pattern sayesinde yarı yazılmış checkpoint asla okunmaz.

### Olumsuz

- **Checkpoint overhead.** Her `sprint_checkpoint_interval` (default 5) I/O yapılır. Yoğun sprint'lerde disk I/O artar; ancak `renameSync()` maliyeti genellikle ihmal edilebilir.
- **`resume-evaluate` sadece `.result` varlığına bakar.** Worker `.result` yazmış ama dosya bozuksa (JSON parse hatası) evaluate fail olabilir. Bu durum için `handleEvaluation` içinde JSON parse guard eklenmesi önerilir (sonraki sprint).
- **`installCrashHandlers()` zorunluluğu entegrasyon testi gerektirir.** Handler'ın gerçekten kurulduğunu doğrulamak için boot-sequence test eklenmeli.

---

## Alternatives Considered

### (a) No-recovery (fresh restart)

Brain crash sonrası her zaman temiz başlatma yapılır, partial state yok sayılır.

**Reddedildi:** Partial work kaybı kabul edilemez. Özellikle uzun sprint'lerde (60+ dakika) tamamlanmış worker sonuçları sıfırlanır. Sprint duration ve task count metrikleri hatalı olur.

### (b) Full memory checkpoint

Her task completion'da tüm sprint state (task tree, event stream, memory context) tam olarak serialize edilir.

**Reddedildi:** Performance overhead çok yüksek. Event stream büyük sprint'lerde MB-seviyesine çıkabilir; her task sonrası tam serialize → write maliyetli. Mevcut periyodik checkpoint (5 dk interval, sadece completed list + offset) yeterli recovery granülaritesi sağlıyor.

### (c) Crash-only exception handler (no checkpoint)

Sadece `uncaughtException` handler ekle, checkpoint yazma yok.

**Reddedildi:** Sensitive data leak'i önler ama state recovery sağlamaz. Sprint 160 T-001 tek başına yetersiz; Katman 2 ve 3 olmadan stale task sorunu devam eder.

---

## References

- **Sprint 160 T-001** — `installCrashHandlers()` + `redactSensitive()` implementation, commit `9c184a3`
- **Sprint 161 T-002** — Atomic checkpoint write (`.tmp` + `renameSync`), commit `8cefed0`
- **Sprint 162 T-004** — `restoreSprintFromCheckpoint()` 3-action state recovery discrimination
- **ADR-034** — Multi-Project Isolation (sensitive data boundary)
- **ADR-035** — Brain ↔ Worker ↔ Auditor Verification Protocol (state integrity)
- **ADR-036** — ADR Governance Integration (mandatory read for all agents)

---

## Memory DB Insert

Sprint 163 sonunda aşağıdaki pattern ile `memory.db`'ye eklendi:

```typescript
store.insert({
  type: 'adr',
  id: 'adr-043',
  title: 'Brain Crash Recovery Protocol',
  status: 'accepted',
  sprint_id: 'sprint-163',
  tags: ['recovery', 'crash', 'brain', 'observability'],
  body: '3-katman crash recovery: exception handler + atomic checkpoint + state recovery on restart',
});
```

---

## Notes

Bu ADR, Sprint 160–162 boyunca üç ayrı commit'te gerçekleştirilen implementasyonun geriye dönük belgelenmesidir. ADR-043 olmadan Sprint 163 governance borcu kapanmış sayılmıyordu. ADR-036 (ADR Governance Integration) gereği tüm kabul edilen mimari kararlar kayıt altına alınmak zorundadır.

> **Note (verified vs code, Sprint 172):** Confirmed accurate against the codebase — referenced commits `9c184a3` (Sprint 160 T-001) and `8cefed0` (Sprint 161 T-002) **exist in this repo's git history** (real provenance, not migration-dead refs). The protocol's three layers are wired: `installCrashHandlers()` (`src/orchestra/sprint-runner-entry.ts`), `redactSensitive()` (`src/core/redact-sensitive.ts` + `src/orchestra/sensitive-redactor.ts`), and `restoreSprintFromCheckpoint()` + `computeEventStreamOffset()` (`src/orchestra/sprint-checkpoint.ts`). One naming correction applied above: the checkpoint interval is the `sprint_checkpoint_interval` config key (`config.ts:602`, default `5`), not a `CHECKPOINT_INTERVAL` constant. Behavior unchanged; documentation alignment only.

---

**Amendment — 2026-06-11 (ADR-review, re-verification + battle-tested kaydı).** **Classification: BOTH** (crash-recovery kullanıcı projelerinde de aynı şekilde çalışır — ürün dayanıklılığı). Re-verified: `installCrashHandlers({ipcDir, jobId})` boot'ta çağrılı (sprint-runner-entry.ts:194) ✓ · atomic `.tmp`+`renameSync` (sprint-checkpoint.ts:220) ✓ · `restoreSprintFromCheckpoint` (:618, canlı caller sprint-controller) ✓ · `sprint_checkpoint_interval` default 5 (config.ts:1148) ✓. **Battle-tested:** protokol gerçek crash'lerde kanıtlandı — Sprint 267 makine-uykusu crash (6/6 task kurtarıldı) + Sprint 270 WSL-VM crash (sıralı tek-container kurtarma); Sprint 272 GHOST-FINALIZE fix'i checkpoint-artığı temizliğini ekledi (start'ın checkpoint-kalıntısında dürüst davranması). md+db senkron (Alperen ADR-review).
