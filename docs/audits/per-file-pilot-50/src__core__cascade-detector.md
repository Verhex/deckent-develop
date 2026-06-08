# Audit — `src/core/cascade-detector.ts`

**Sprint:** 187 (per-file pilot, 50-task batch)
**Task:** 186-032
**File:** `src/core/cascade-detector.ts`
**LoC:** 171 (incl. blank lines + JSDoc; ~120 effective)
**Audited:** 2026-05-21
**Auditor:** doc-writer worker (w-186-032, opus)

> Bu modül Sprint 140 catastrophic cascade'inin ($42 deadweight, 197 worker × %100 NO_GO) doğrudan post-mortem ürünüdür. Sprint 186 timeout cascade kontrol denemesi sırasında Brain ve Sprint Controller'ın güvenlik halkası olarak değerlendirilmesi gereken, ama **production runtime'a tam olarak wire edilmemiş**, kritik bir denetleyici.

---

## 1. Inventory

### Exports
| Symbol | Tür | Açıklama |
|---|---|---|
| `CascadeActionType` | type alias | `'CONTINUE' \| 'PAUSE_SPRINT' \| 'HALT_SPRINT' \| 'THROTTLE'` |
| `CascadeAction` | interface | `{ action, reason, resumeAfterSeconds?, newMaxWorkers?, spawnDelayMs? }` |
| `CascadeConfig` | interface | Eşik konfigürasyonu — 5 alan |
| `DEFAULT_CASCADE_CONFIG` | const | Sprint 141 SAFE-06 varsayılan eşikleri |
| `TaskOutcome` | type alias | `'DONE' \| 'GO_WITH_TECH_DEBT' \| 'NO_GO'` |
| `CascadeDetector` | class | Singleton-friendly state machine (5 metot + 1 ctor) |

### Imports
| Modül | Açıklama |
|---|---|
| _(none)_ | **Sıfır bağımlılık** — saf, deterministik, side-effect-free modül |

ADR-008 (Brain Merkezi Import) ile uyumlu: bu dosya yalnızca tip ve `class` export eder; başka modüle bağlı değildir.

### Reverse dependencies (production)
```bash
$ grep -rn "CascadeDetector\|cascade-detector" src/ --include="*.ts"
src/core/cascade-detector.ts:47:export class CascadeDetector {  # self
```

**0 production import.** `CascadeDetector` class hiçbir orchestrator, brain, sprint-spawner, result-evaluator veya nervous system modülünde çağrılmıyor.

### Reverse dependencies (tests)
```bash
$ grep -rn "CascadeDetector" tests/
tests/core/cascade-detector.test.ts  # tek dosya
```

**1 test dosyası**, production sıfır.

> ⚠️ **Kritik bulgu:** `src/orchestra/result-evaluator.ts:1548` içinde `decideCascadeAction(taskId, ctx)` tamamen ayrı bir fonksiyon — **dependency-cascade** (Task A NO_GO → Task B'yi blokla) için, **runtime-cascade** (197 NO_GO → sprint'i durdur) için DEĞİL. İsim çakışması var, kavramlar farklı.

### Public surface ratio
- 6 export / ~120 effective LoC ≈ %5 surface — uygun (over-export yok)
- Class metotları: `onResult`, `onRateLimited`, `onRequestSuccess`, `reset`, `fullReset`, `getStats` (6 yöntem, eşit dağılım)

---

## 2. Bağlam — Architectural Context

### Mimari rol
Bu modül **circuit breaker** desenini deckent sprint pipeline'ına uyarlar. Üç ayrı tetikleyici izlenir:

| Tetik | Eşik | Aksiyon | Maliyet hedefi |
|---|---|---|---|
| Ardışık NO_GO | 5 (`maxConsecutiveNoGo`) | `PAUSE_SPRINT` + 10dk cooldown | Sprint 140 senaryosu — $42 disaster |
| Ardışık RATE_LIMITED | 3 (`maxConsecutiveRateLimited`) | `HALT_SPRINT` (resume yok) | Subscription tükenmesi |
| Birikimli NO_GO oranı | %30 (`maxNoGoRatePercent`) | `THROTTLE` (maxWorkers=1, 30s delay) | Yavaş cascade |

### İlgili sprint geçmişi
- **Sprint 140:** 197 worker, 14 dakikada %100 NO_GO cascade, $42 deadweight maliyet — modülün varlık sebebi
- **Sprint 141 SAFE-06:** Bu modül yazıldı, eşikler kararlaştırıldı, **ancak runtime wire'ı eksik kaldı**
- **Sprint 186:** Per-file pilot kontrol denemesi — cascade tekrar gözlemlendi; CascadeDetector tetiklenmedi çünkü dispatch loop'a bağlı değil
- **Sprint 187:** Bu audit + 50-task pilot — Brain auto-recovery cascade pattern analizi

### İlgili ADR'ler
| ADR | Status | İlişki |
|---|---|---|
| **ADR-040** Nervous System Architecture | accepted | Proactive meta-orchestrator — CascadeDetector mantığı nervous/observer + detector-registry için ideal aday |
| **ADR-043** Brain Crash Recovery Protocol | accepted | PAUSE_SPRINT durumu crash recovery ile etkileşmeli |
| **ADR-046** Brain Self-Update Hook | accepted | Cascade tetiklenince Brain'in self-update yapması beklenir, hook yok |
| **ADR-064** TOPP — Continuous Dispatch | accepted | Wave-barrier kaldırıldı; CascadeDetector continuous dispatch kontrol noktası olmalı, değil |

### Side-effect profili
**Tamamen safe:** Hiç I/O yok, hiç Date.now() yok (timestamp ihtiyaç duymuyor), hiç random yok. Saf in-memory state machine — test'lerde 100% deterministik.

---

## 3. Debt Risk

| Risk | Önem | Kanıt (satır) | Açıklama |
|---|---|---|---|
| **Production 0-caller** | **CRITICAL** | n/a (grep -L) | Class hiçbir production code'da kullanılmıyor; Sprint 140 felaket koruyucusu **dormant** |
| State persistence yok | HIGH | `consecutiveNoGo = 0` (48) | Brain crash'ten sonra `consecutiveNoGo` sayacı sıfırlanır → cascade yeniden başlar |
| `reset()` vs `fullReset()` semantik karmaşası | MEDIUM | 131-149 | İkisi de aynı sayaçları sıfırlar, tek fark `totalTasks`/`totalNoGo` — yorum yetersiz |
| Magic numbers config'de gömülü | LOW | 38-43 | `pauseResumeSeconds: 600` — neden 10dk? rationale yorum yok |
| `paused` flag hiç okunmuyor | MEDIUM | 52, 72, 134 | `paused` set ediliyor ama `onResult`/`onRateLimited` içinde `if (this.paused) return` guard yok → tekrar tetikleme mümkün |
| `THROTTLE` kümülatif tekrar | LOW | 86-92 | Her result çağrısında yeniden döndürülür — caller tarafında debounce yoksa spam |
| Telemetri emit yok | MEDIUM | tüm dosya | `metric()` / event emit yok; observability sıfır |
| `newMaxWorkers: 1` hard-coded | LOW | 90 | Konfigüre edilemez, sprint büyüklüğüne adapte değil |
| TaskOutcome `GO_WITH_TECH_DEBT` sessiz ignore | LOW | 79 (else branch) | TECH_DEBT NO_GO sayılmıyor ama "başarılı" da değil; intent net değil |

### Şiddet özeti
- 1 × CRITICAL (wire eksikliği — Sprint 140 felaketinin tekrarına açık)
- 2 × HIGH
- 4 × MEDIUM
- 3 × LOW

---

## 4. Dead Code Candidates

### Production usage scan
```bash
$ grep -rn "import.*CascadeDetector\|from.*cascade-detector" src/
# (boş çıktı — sıfır production import)

$ grep -rn "new CascadeDetector\|cascadeDetector\." src/
# (boş çıktı — sıfır instance, sıfır method call)
```

### Test usage scan
```bash
$ grep -rn "CascadeDetector" tests/
tests/core/cascade-detector.test.ts  # tek dosya, sadece unit test
```

### Sınıflandırma (ADR-038 Dead Code Disposition kapsamında)
| Sembol | Durum | Karar adayı |
|---|---|---|
| `CascadeDetector` class | **Dormant / 0-caller** | **KEEP** (Sprint 188'de wire et) — kritik güvenlik mekanizması, silinmemeli |
| `DEFAULT_CASCADE_CONFIG` | Dormant | KEEP (class ile birlikte) |
| `CascadeActionType` | Dormant | KEEP |
| `CascadeAction` | Dormant | KEEP |
| `CascadeConfig` | Dormant | KEEP |
| `TaskOutcome` (export) | Duplicate adayı | İncele — `core/task-types.ts` veya `result-evaluator.ts` içinde benzer tip olabilir |

> **Karar gerekçesi:** Bu modül Sprint 140 $42 felaketinin doğrudan ürünüdür. Silinmemeli; aksine **Sprint 188'de wire edilmeli** (`sprint-spawner.ts` → her `onResult` çağrısı + her RATE_LIMITED event). ADR-038 "0-caller = sil" kuralı bu dosya için **istisna**: koruyucu kod, kullanılmaması güvenli olduğu anlamına gelmez, henüz başarısızlık tetiklenmediği anlamına gelir.

---

## 5. Documentation Gaps

| Konu | Durum | Gerekli |
|---|---|---|
| Dosya başı JSDoc | ✅ Var (1-15) | Sprint 140 referansı, sebep, Sprint 141 SAFE-06 link mevcut |
| `CascadeAction` interface JSDoc | Kısmi (22, 24) | `resumeAfterSeconds`, `newMaxWorkers` documented; `action`, `reason` documented değil |
| `CascadeConfig` interface JSDoc | ❌ Eksik | 5 alanın hiçbirinde JSDoc yok — neden bu eşikler? |
| `DEFAULT_CASCADE_CONFIG` rationale | Kısmi (38-42) | Inline yorum var ama "neden 5?" "neden %30?" gerekçe yok |
| `onResult` JSDoc | Kısmi (57-59) | İade tipi açıklaması yok |
| `onRateLimited` JSDoc | ✅ Yeterli (99-102) | |
| `onRequestSuccess` JSDoc | Kısmi (122-123) | Ne zaman çağrılmalı? Provider adapter'lar bilgilendirilmiş mi? |
| `reset()` vs `fullReset()` | Eksik | İkisi arasındaki fark satır 135'te tek yorum — caller hangisini ne zaman kullanmalı? |
| `getStats()` JSDoc | ❌ Yok | Public diagnostic API olmasına rağmen JSDoc'suz |
| Integration guide | ❌ Yok | Bu sınıf nereye wire edilmeli? `sprint-spawner.ts`? `sprint-controller.ts`? `nervous/`? Doc yok |

### Önerilen başlık JSDoc eklemeleri
```typescript
/** Reduces all counters; preserves cumulative totalTasks/totalNoGo for rate check. Use after PAUSE → resume. */
reset(): void;

/** Full state reset including cumulative counters. Use only at new sprint start. */
fullReset(): void;

/** Diagnostic snapshot; safe to call from auditor scan loop. */
getStats(): ...
```

---

## 6. ADR Compliance Check

| ADR | İlgili mi? | Compliance | Notlar |
|---|---|---|---|
| **ADR-001** TypeScript + ESM | Evet | ✅ PASS | Saf TS, ESM-compatible (zaten side-effect-free) |
| **ADR-002** Node16 Module Resolution | Evet | ✅ PASS | Hiç import olmadığı için `.js` uzantı zorunluluğu N/A |
| **ADR-006** spawnSync Security Pattern | Hayır | N/A | Hiç process spawn yok |
| **ADR-008** Brain Merkezi Import | Evet | ✅ PASS | Bu modül ne brain'e ne worker'a import ediyor; pure core util |
| **ADR-010** Tek Runtime Dependency | Evet | ✅ PASS | Sıfır external import |
| **ADR-035** Verification Protocol Standard | Evet | ⚠️ PARTIAL | RATE_LIMITED kanal kodu izleniyor ama WORKER→BRAIN:RATE_LIMITED event'ine bağlı değil — wire eksik |
| **ADR-037** Authority Matrix RBAC V1.0 | Evet | ⚠️ PARTIAL | CascadeDetector pause/halt kararını kim verir? Brain mi, Auditor mı? Ownership net değil |
| **ADR-038** Dead Code Disposition | Evet | ⚠️ EXCEPTION | 0-caller ama silinmemeli (koruyucu kod — bkz. §4 karar gerekçesi) |
| **ADR-040** Nervous System Architecture | Evet | ❌ FAIL | CascadeDetector mantığı `nervous/detector-registry` için doğal ev; ayrı modülde yaşıyor, entegrasyon yok |
| **ADR-043** Brain Crash Recovery Protocol | Evet | ❌ FAIL | `paused`/`halted` state persistent değil; crash sonrası kayıp |
| **ADR-044** Sprint State Observability | Evet | ❌ FAIL | `getStats()` var ama sprint dashboard'a expose edilmemiş, structured event emit yok |
| **ADR-045** Wave-Based Execution Semantics | Evet | ⚠️ PARTIAL | Wave-bazlı cascade kararı verilmiyor; PAUSE_SPRINT tüm wave'i durdurur, alt-wave throttle yok |
| **ADR-046** Brain Self-Update Hook | Evet | ⚠️ PARTIAL | Cascade tetiklenince Brain kendini güncellemeli (örn. config rollback) — hook yok |
| **ADR-064** TOPP Continuous Dispatch | Evet | ❌ FAIL | Wave-barrier kaldırıldı; CascadeDetector continuous dispatch için zorunlu kontrol noktası ama wire'lı değil |

### Özet
- 5 PASS / 5 PARTIAL / 4 FAIL / 1 EXCEPTION
- En önemli ihlaller: ADR-040, 043, 044, 064 — hepsi **wire eksikliği** kaynaklı

---

## 7. Refactor Recommendations

### R1 — Production runtime wire (P0)
**Sprint 188 zorunlu.** `src/orchestra/sprint-spawner.ts` veya `sprint-controller.ts` içinde:

```typescript
// Sprint pipeline'da tek instance
const cascadeDetector = new CascadeDetector(loadConfig().cascade ?? DEFAULT_CASCADE_CONFIG);

// Her task result'tan sonra
const action = cascadeDetector.onResult(result.selfAssessment);
if (action.action === 'PAUSE_SPRINT') {
  await pauseSprintAndPersist(sprintId, action);
  return; // Brain manual resume bekler
}
if (action.action === 'THROTTLE') {
  reduceMaxWorkers(action.newMaxWorkers!);
}

// Her provider RATE_LIMITED event'inde
on('WORKER→BRAIN:RATE_LIMITED', () => cascadeDetector.onRateLimited());
on('WORKER→BRAIN:REQUEST_SUCCESS', () => cascadeDetector.onRequestSuccess());
```

### R2 — State persistence (P1)
`.deckent/cascade-state.json` veya `memory.db` `entries` tablosunda `type='cascade-state'` entry — Brain crash recovery (ADR-043) ile entegre.

### R3 — Nervous System entegrasyonu (P1)
`src/nervous/detector-registry.ts` içine `CascadeDetector`'ı kayıt et; `nervous/observer` her sprint event'inden sonra `onResult`/`onRateLimited` tetikler. ADR-040 ile uyum.

### R4 — Structured event emit (P2)
Her PAUSE/HALT/THROTTLE kararında `event-stream.ts` üzerinden `BRAIN→*:CASCADE_TRIGGERED` event emit et. Dashboard ve ADR-044 compliance.

### R5 — Config'i `.deckent/config.json`'a taşı (P2)
Şu an hardcoded `DEFAULT_CASCADE_CONFIG`. `config.ts` 3-layer merge ile kullanıcı override edebilmeli (`cascade.maxConsecutiveNoGo`, vb.).

### R6 — `paused` guard (P3)
```typescript
onResult(outcome: TaskOutcome): CascadeAction {
  if (this.halted) return { action: 'HALT_SPRINT', reason: 'Sprint already halted' };
  if (this.paused) return { action: 'PAUSE_SPRINT', reason: 'Sprint already paused' };
  // ...
}
```

### R7 — JSDoc tamamlama (P3)
§5'te listelenen doc gap'leri kapat.

### R8 — Telemetri (P3)
`metric('cascade.consecutive_no_go', this.consecutiveNoGo)` her `onResult` sonunda — observability artışı.

---

## 8. Sprint 188 Follow-up Items

### Önerilen Sprint 188 task'ları
1. **[P0] CASCADE-WIRE-01:** `CascadeDetector`'ı `sprint-spawner.ts` içine wire et — `onResult` her task result'tan sonra çağrılır, `PAUSE_SPRINT` tetiklendiğinde `pauseSprint()` invoke edilir. Test: 5 ardışık NO_GO mock → sprint pause edildiğini doğrula.

2. **[P0] CASCADE-WIRE-02:** RATE_LIMITED kanal kodunu (ADR-035) `CascadeDetector.onRateLimited()`'a bağla. Provider adapter (claude/codex/gemini) `WORKER→BRAIN:RATE_LIMITED` emit ettiğinde dispatcher subscribe olur.

3. **[P1] CASCADE-PERSIST-03:** State `.deckent/cascade-state.json`'a persist (atomic write); Brain start'ta load. ADR-043 entegrasyonu.

4. **[P1] CASCADE-NERVOUS-04:** `src/nervous/detector-registry.ts`'e `CascadeDetector` kayıt — ADR-040 compliance.

5. **[P2] CASCADE-CONFIG-05:** `config.ts` içine `CascadeConfig` 3-layer merge — kullanıcı override.

6. **[P2] CASCADE-EVENT-06:** `event-stream.ts` üzerinden `BRAIN→*:CASCADE_TRIGGERED` emit (PAUSE/HALT/THROTTLE) — dashboard görünür hale gelsin.

7. **[P3] CASCADE-DOC-07:** Bu audit'te listelenen JSDoc gap'lerini kapat + `docs/architecture/cascade-detection.md` yaz (integration guide).

8. **[P3] CASCADE-TEST-08:** Integration test `tests/integration/cascade-pipeline.test.ts` — sprint full lifecycle ile mock 5 NO_GO → PAUSE → resume → reset.

### Dependency graph (önerilen)
```
WIRE-01 ──┬─→ PERSIST-03 ──→ NERVOUS-04 ──→ CONFIG-05
WIRE-02 ──┘                                   │
                                              v
                                          EVENT-06 ──→ DOC-07 + TEST-08
```

---

## 9. Summary

**Verdict:** **DORMANT-CRITICAL** — modül kod kalitesi açısından temiz (0 import, 0 side-effect, deterministik), ancak **production'a wire edilmemiş**. Sprint 140 $42 felaketinin doğrudan koruyucusu, ama henüz koruma sağlamıyor.

### Kalite metrikleri
- **Code quality:** ✅ HIGH (saf, test'lenmiş, dokümante edilmiş header)
- **Architecture fit:** ❌ LOW (ADR-040/043/044/064 ile uyumsuz, wire eksik)
- **Production readiness:** ❌ DORMANT (0 production caller)
- **Refactor priority:** **P0** (Sprint 188 zorunlu wire)
- **Removal candidate:** ❌ HAYIR (koruyucu kod, ADR-038 istisnası)

### Risk profili
| Boyut | Skor (1-5) | Açıklama |
|---|---|---|
| Compile risk | 1 | Hiç dependency yok |
| Test risk | 1 | Unit test mevcut, deterministik |
| Runtime risk | **5** | Wire eksik → Sprint 140 senaryosu tekrar olabilir |
| Maintenance risk | 2 | Küçük yüzey, açık intent |
| Security risk | 1 | Saf state machine, attack surface yok |

### Stratejik öneri
Sprint 188 ilk task batch'inde `CASCADE-WIRE-01` ve `CASCADE-WIRE-02` P0 olarak yer almalı. Sprint 186 cascade kontrol denemesi bu modülün gerçek dünya senaryolarında tetiklenmediğini gösterdi — wire eksikliği **bilinçsiz değil, izleniyor**, ama daha fazla beklemek riskli. ADR-064 (TOPP continuous dispatch) ile birlikte wave-barrier kalktığından, cascade koruması artık opsiyonel değil **zorunlu**.

### Bir cümlelik özet
> `CascadeDetector` Sprint 140 $42 felaketinin yazılı dersi — temiz kod, sıfır kullanım; Sprint 188'de wire edilmezse Sprint 140 tekrar olabilir.

---

_Audit by w-186-032 (doc-writer, opus) — Sprint 187 per-file pilot batch._
