# ADR-044: Sprint State Observability Contract

**Status:** accepted

**Deciders:** Alperen Sartaçoğlu (product owner), Brain (orchestrator)

**Date:** 2026-05-13

**Sprint:** Sprint 163 (governance record — implementation: Sprint 162 T-003)

---

## Status

accepted (Sprint 163 — Sprint 162 T-003 tarafından implement edilmiş contract'ın geriye dönük ADR kaydı)

---

## Context

Sprint 159–161 forensic analizi, `sprint-state.json` dosyasının sprint'in gerçek
lifecycle ilerlemesini yansıtmadığını ortaya koydu:

- Dosya `phase: "SPAWN", status: "PLANNING"` durumunda donuk kalıyor, EXECUTE →
  EVALUATE → RETRO → CLEANUP geçişleri diske yansımıyordu.
- External observer'lar (CLI `deckent status`, recovery modülü, dashboard) sprint'in
  gerçek fazını göremiyor, `sprint-state.json`'ı okuyarak yanlış kararlar alıyordu.
- Crash sonrası restart'ta hangi fazdan devam edileceği belirsizdi; `restoreSprintFromCheckpoint`
  stale EXECUTING task'ları tanıyamıyordu.
- Per-task değerlendirme kararları (`DONE / NO_GO / GO_WITH_TECH_DEBT`) yalnızca
  in-memory'de yaşıyor, post-sprint forensic için yeniden inşa edilemiyordu.

Bu körlük Sprint 159–161 boyunca "Brain'in ne yaptığı belirsiz" şikayetinin teknik
köküdür. Sprint 162 T-003, `sprint-phases.ts:persistPhaseTransition` wire'ını ve
`evaluation-audit-trail.ts:writeEvaluationAudit` çağrısını ekleyerek bu boşluğu kapattı.

---

## Decision

### 1. Phase Transition Persistence (Zorunlu)

Her `sprint.phase` mutation'ından sonra `persistPhaseTransition(projectRoot, sprint, phase, status)`
çağrısı **ZORUNLUDUR**. Aşağıdaki call-site'lar tanımlanmıştır:

| Faz Fonksiyonu    | Phase Argümanı | Status Argümanı   |
|-------------------|----------------|-------------------|
| `runPlanPhase`    | `PLAN`         | `PLANNING`        |
| `runSpawnPhase`   | `SPAWN`        | `RUNNING` → sonra `ACTIVE` |
| `runEvaluatePhase`| `EVALUATE`     | `EVALUATING`      |
| `runFixPhase`     | `FIX`          | `FIXING`          |

**Uygulama kuralları:**

- Atomic write pattern zorunlu: geçici `.tmp` dosyasına yaz, `renameSync` ile hedef
  yola taşı. Partial write ortamı bozmamalı.
- Fail-soft `try/catch` wrap zorunlu: `persistPhaseTransition` fırlatmamalı, hata
  `debugLog` ile yutulmalıdır. Brain lifecycle'ı state-file yazma hatasıyla ölmemelidir.
- Fonksiyon imzası:

```typescript
export function persistPhaseTransition(
  projectRoot: string,
  sprint: Sprint,
  phase: SprintPhase,
  status: SprintStatus,
): void
```

### 2. Per-Task Evaluation Audit (Zorunlu)

Her task evaluation sonrası `writeEvaluationAudit(projectRoot, sprintId, taskId, attemptNum, input)`
çağrısı **ZORUNLUDUR**. Audit kaydı şu schema'yı izler:

```typescript
interface EvaluationAuditRecord {
  taskId: string;
  sprintId: string;
  attemptNum: number;
  decision: 'DONE' | 'GO_WITH_TECH_DEBT' | 'NO_GO';
  ruleSet: AuditRuleSet;           // hangi rubrik çalıştı
  criterionScores: Record<string, number | null>;
  schemaValidation: SchemaValidationResult;
  rationale: string;               // human-readable karar gerekçesi
  timestamp: string;               // ISO 8601 UTC
}
```

Dosya yolu: `.tasks/audit/<sprintId>/<taskId>-attempt-<N>.json`

FIX-phase retry'ları `attemptNum` ile ayırt edilir; orijinal EVAL kaydının üzerine yazılmaz.

### 3. Memory DB Insert Pattern

ADR kabul edildiğinde aşağıdaki pattern ile memory.db'ye insert yapılır:

```typescript
store.insert({
  type: 'adr',
  id: 'adr-044',
  title: 'Sprint State Observability Contract',
  status: 'accepted',
  sprint_id: 'sprint-163',
  tags: ['observability', 'sprint-state', 'audit-trail', 'phase-transition'],
});
```

---

## Consequences

### Olumlu

- **Dashboard real-time tracking.** `deckent status` artık gerçek sprint fazını
  gösterir; PLAN → SPAWN → EVALUATE → RETRO geçişleri disk'te görünür olur.
- **Crash recovery determinizmi.** `restoreSprintFromCheckpoint` her fazda tutarlı
  state görür; negatif `durationMs` (-106ms bug) ortadan kalkar.
- **Post-sprint forensic.** `audit/<sprintId>/` dizinindeki audit kayıtları ile
  her task'ın değerlendirme kararı, kullanılan rubrik ve skor dağılımı yeniden
  inşa edilebilir; Brain'in neden DONE/NO_GO dediği açıklanabilir.
- **Spurious NO_GO tespiti.** Audit trail `rationale` field'ı `reconcileSpuriousNoGo`
  çağrısı yapıldığında override gerekçesini kaydeder; ADR-044 bu field'ı zorunlu kılar.

### Olumsuz

- **Ek disk I/O.** Her faz geçişinde ve her task evaluation'da dosya yazılır. Atomic
  rename pattern bu riski düşürür; ancak yüksek task sayılı sprintlerde (50+) I/O
  baskısı ölçülmelidir.
- **Fail-soft gizler sorunları.** `persistPhaseTransition` hataları `debugLog`'a
  düşer, kullanıcıya alert olarak yansımaz. State file yazma başarısız olursa
  gözlemlenebilirlik zinciri sessizce kırılır. Uzun vadede metrics/alert entegrasyonu
  gerekir.

---

## Alternatives Considered

### (a) Event-Stream-Only Observability

Sprint events stream (`events.jsonl`) tüm faz geçişlerini kayıt altına alabilir;
ayrıca snapshot dosyası gerekmez.

**Neden reddedildi:** Event stream'den anlık faz durumunu okumak tüm satırları
yeniden işlemeyi gerektirir. `sprint-state.json` snapshot'ı O(1) okuma sağlar.
Recovery modülü ve CLI status komutu snapshot'a ihtiyaç duyar.

### (b) Synchronous DB Write

Her faz geçişinde doğrudan `memory.db`'ye INSERT yapmak yerine sadece dosya
yazmak yerine DB çağrısı yapmak.

**Neden reddedildi:** `better-sqlite3` senkron API kilit çakışması riski taşır;
Brain main loop'u bloke edebilir. Dosya-tabanlı atomic rename pattern daha düşük
latency ve kilit riski sunar. DB export ayrıca `deckent memory export` ile manuel
veya sprint sonu otomatik tetiklenebilir.

---

## References

- Sprint 162 T-003 — `sprint-phases.ts:persistPhaseTransition` wire implementation
- `evaluation-audit-trail.ts` — Sprint 157 T-001 survivor (`6c337b0`), per-task audit write path
- Sprint 162 result forensic — `sprint-state.json` phase transition disk visibility kanıtı
- ADR-043 — Brain Crash Recovery Protocol (bağlı: recovery modülü bu observability contract'ına dayanır)
- ADR-035 — Brain ↔ Worker ↔ Auditor Verification Protocol (audit trail bu protokolü destekler)
- Sprint 159–161 stalled forensic — `.tasks/archive/sprint-160-stalled/`, `.tasks/archive/sprint-161-stalled/`

---

## Notes

Bu ADR, Sprint 162 T-003 tarafından implement edilen `persistPhaseTransition` wire'ının
ve `evaluation-audit-trail.ts` entegrasyonunun geriye dönük governance kaydıdır.
ADR-053'te olduğu gibi: uygulama önce yazıldı, ADR tasarım kararlarını geç ama eksiksiz
kayıt altına almaktadır. Sprint 163 ile kabul edilmiştir.
