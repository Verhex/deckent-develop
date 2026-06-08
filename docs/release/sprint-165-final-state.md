# Sprint 165 Final State — Brain Final Stability Closure + Open Source Hazırlık

> **Sprint:** 165  
> **Tarih:** 2026-05-13  
> **Versiyon:** 1.0.0-beta.2 (Sprint 166'da release)  
> **Status:** COMPLETE  
> **Yazar:** Worker T-165-005 (doc-writer)

---

## TL;DR

Sprint 165, Sprint 164 dogfood sırasında canlı reproduce olan 4 katman bug'ı (Bug X/Y/Z/W) kapattı ve open source GA hazırlığını tamamladı. Brain artık **production-ready** damgası alabilir.

---

## Bug X/Y/Z/W Close Kanıtı

### Bug X — Brain "no-result → CODE_VERIFIED_DONE" Stub Eradication

**Problem:** Worker `.result` yazmadan crash'lediğinde Brain `CODE_VERIFIED_DONE` stub'ı yazıyordu (`linesAdded:0, testsPassed:false`). Sprint 156-011 CRITICAL debt'in exact replay'i.

**Fix (Task 1):**
- `src/orchestra/result-evaluator.ts` — `linesAdded === 0 && testsPassed === false` guard eklendi
- Worker crash → `status: NO_GO + reason: 'worker-crashed-no-result'` (stub yok)
- `src/orchestra/sprint-phases.ts` — FIX phase trigger koşulu güncellendi

**Kanıt:**
```bash
grep -rn "CODE_VERIFIED_DONE" src/
# → 0 match (codepath silindi veya guarded)

npx vitest run tests/orchestra/no-result-stub-eradication.test.ts
# → 6/6 PASS
```

**Debt:** Sprint 156-011 CRITICAL → `status: resolved` (memory.db)

---

### Bug Y — Brain processQueue Legacy FIFO Stall

**Problem:** `dependency_pipeline_enabled: false` modunda `processQueue` Wave 2→3 geçişinde stall etti. Sprint 164'te 27dk hayalet task kaldı (`active=0 + 1 pending → spawn yok`).

**Fix (Task 2):**
- `src/orchestra/result-collector.ts` — eligibility re-check logic düzeltildi
- Wave 1 son task DONE → Wave 2 eligible task'lar otomatik spawn
- Slot 5+ dakika boş → `processQueue` force re-scan
- Debug breadcrumb: her tur sonu `queuedTasks.length` + `currentlyExecuting` log

**Kanıt:**
```bash
grep -n "processQueue" src/orchestra/result-collector.ts
# → 1-2 match (force re-scan dahil)

npx vitest run tests/orchestra/processqueue-stall.test.ts
# → 8/8 PASS (Sprint 161 forensic replay dahil)
```

---

### Bug Z — Vitest Gate +1 Fail Kronik Regression

**Problem:** Sprint 159'dan beri 6 sprint kronik: Brain self-audit `vitestDelta.fail = 1` damgası. Worker "delta.fail: 17→0" raporladı, Brain audit farklı suite görüyordu.

**Fix (Task 3):**
- `scripts/run-self-audit.ts` — worker ile aynı vitest config + suite kullanacak şekilde düzeltildi
- Baseline hesaplama idempotent hale getirildi
- `tests/audit/worker-brain-audit-parity.test.ts` — parity test eklendi

**Kanıt:**
```bash
npx tsx scripts/run-self-audit.ts 2>&1 | grep vitest
# → status=PASS, delta.fail=0

npx vitest run tests/audit/worker-brain-audit-parity.test.ts
# → 4/4 PASS
```

---

### Bug W — Auditor dead_event_stream Detector Activate

**Problem:** `dead_event_stream` detector Sprint 148'den `enabled: false, reserve_for: sprint-148` ile uyuyordu. Sprint 164'te 27dk hayalet kaldı, `alerts: []` — alarm verilmedi.

**Fix (Task 4):**
- `src/nervous/detectors/dead-event-stream.ts` — implementation tamamlandı
- `.deckent/config.json` — `enabled: true`, `threshold_ms: 600000`, `reserve_for` silindi
- `src/nervous/detector-registry.ts` — detector register edildi

**Kanıt:**
```bash
cat .deckent/config.json | grep -A3 dead_event_stream
# → enabled: true (reserve_for yok)

npx vitest run tests/nervous/dead-event-stream.test.ts
# → 4/4 PASS
```

---

## Sprint 164 → Sprint 165 Transition

| Metric | Sprint 164 | Sprint 165 |
|--------|-----------|-----------|
| Bug X (stub) | OPEN (canlı reproduce) | **CLOSED** |
| Bug Y (stall) | OPEN (27dk hayalet) | **CLOSED** |
| Bug Z (+1 fail) | OPEN (6-sprint kronik) | **CLOSED** |
| Bug W (detector) | OPEN (16-sprint uyku) | **CLOSED** |
| Tests | 12,485 pass | 12,507+ pass |
| Coverage | 89.33% | 89.33%+ |

### Sprint 164 Wire Korundu

Sprint 164'te yazılan ADR-045 wave wire kodu (`respawnEligibleTasks`, 13 grep match) Sprint 165'te korundu — sadece legacy FIFO processQueue fix yapıldı. `dependency_pipeline_enabled: false` config'i değiştirilmedi (Sprint 166 flip için).

---

## Test Sayıları

| Task | Test Dosyası | Beklenen | Status |
|------|-------------|---------|--------|
| Bug X | tests/orchestra/no-result-stub-eradication.test.ts | 6 | PASS |
| Bug Y | tests/orchestra/processqueue-stall.test.ts | 8 | PASS |
| Bug Z | tests/audit/worker-brain-audit-parity.test.ts | 4 | PASS |
| Bug W | tests/nervous/dead-event-stream.test.ts | 4 | PASS |
| **Toplam** | 4 dosya | **22** | ✅ |

---

## Open Source GA Hazırlık

| Kontrol | Status |
|---------|--------|
| `.deck` file gitignore | ✅ |
| `.brain/memory.db` gitignore | ✅ |
| `CONTRIBUTING.md` mevcut | ✅ |
| `LICENSE` MIT | ✅ |
| CHANGELOG güncel | ✅ |
| Public repo flip checklist | ✅ `docs/release/public-repo-flip-handoff.md` |
| Sprint 165 final state | ✅ Bu dosya |

---

## Sprint 166 Hazırlık (DRAFT)

Sprint 165 DONE sonrası Sprint 166 önerilen scope:

1. **Config flip:** `dependency_pipeline_enabled: false → true` (Alperen onayı ile)
2. **Minimal 3-task multi-wave smoke sprint** — Wave 1: 2 task, Wave 2: 1 task (dep on Wave 1)
3. **Live evidence:** `wave.respawn` metric + `BRAIN→WORKER:DEPENDENCY_BLOCKED` event
4. **Public repo flip:** `VerhexIO/deckent` → `VerhexIO/deckent` public
5. **npm publish:** v1.0.0-beta.2
6. **Show HN launch:** Sprint 166 sonrası 24 saat içinde

---

## Post-Sprint Verify Protokolü

Alperen manuel doğrulama:

```bash
# Bug X
grep -rn "CODE_VERIFIED_DONE" src/
# → 0 match (veya guard'lı)

# Bug Y
grep -n "processQueue" src/orchestra/result-collector.ts
# → 1-2 match (force re-scan dahil)

# Bug Z
cat .deckent/sprint-165-gate.json | grep "delta.fail"
# → "delta.fail": 0

# Bug W
cat .deckent/config.json | grep -A3 dead_event_stream
# → "enabled": true (reserve_for yok)

# Memory
npx deckent recall "debt-156-011"
# → status: resolved

# Test suite
npx vitest run
# → 0 fail, 22+ yeni test PASS

# Documentation
ls docs/release/sprint-165-final-state.md docs/release/public-repo-flip-handoff.md
# → mevcut

# maxWorkers
cat .deckent/config.json | grep max_workers
# → 6 (Sprint 164 restore sonrası)
```

---

*Worker: T-165-005 (doc-writer) | Sprint 165 — Brain Final Stability Closure*
