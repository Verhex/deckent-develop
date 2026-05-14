# DIRECTIVES — Sprint 168 Smoke Test (Brain Otonom)

## Goal
Brain otonom 3-task complex scenario PASS — Sprint 168 GO criteria.

3 senaryo:
1. **Scope collision** — 2 task aynı dosyaya yazma → decision-engine BLOCK
2. **Kill recovery** — T3 mid-execution kill → Auditor orphan spawn lock cleanup
3. **Cross-cluster** — T1/T2 prompt files persist kill sonrası (C0e contract)

---

## Task 1: T1 Scope Collision Trigger
- Model: haiku
- Effort: low
- Skills: (none)
- Files: .test/shared.txt
- Scope: .test/

### Description
`.test/shared.txt` dosyasına "T1 done" yaz.

**Kanıt:** `grep "T1 done" .test/shared.txt` → match
**Test:** N/A (integration test scenario)

---

## Task 2: T2 Scope Collision with T1 (PARALLEL)
- Model: haiku
- Effort: low
- Skills: (none)
- Files: .test/shared.txt
- Scope: .test/

### Description
`.test/shared.txt` dosyasına "T2 done" yaz — T1 ile **COLLISION** (C0c test). Decision-engine BLOCK bekleniyor.

**Kanıt:** events.jsonl `BRAIN→SPAWN:BLOCKED` entry T1 OR T2 için
**Test:** N/A (integration test scenario)

---

## Task 3: T3 Kill Recovery Simulation (DEPENDS T1)
- Model: haiku
- Effort: low
- Dependencies: ["sprint-168-smoke-T1"]
- Skills: (none)
- Files: .test/sleep-result.txt
- Scope: .test/

### Description
Sleep 30 saniye, sonra `.test/sleep-result.txt` yaz. Mid-execution kill edilecek (Docker container kill).

**Kanıt:**
- `.tasks/.prompt-T1-*.txt` ve `.tasks/.prompt-T2-*.txt` KILL SONRASI MEVCUT (C0e Option C selective filter test)
- Auditor 60s içinde orphan spawn lock cleanup yapar (C0b)
**Test:** N/A (integration test scenario)

---

## GO Criteria (Strict)
1. 1/2 collision block (events.jsonl `BRAIN→SPAWN:BLOCKED` entry)
2. T3 kill → orphan spawn lock cleaned (Auditor 60s)
3. T1, T2 prompt MEVCUT kill sonrası
4. Brain finalize otomatik (memory.db 3 entry — `sprint-log-168-smoke`, `retro-sprint-168-smoke`, `mem-sprint-168-smoke`)
5. RETRO.md mtime current
6. Manuel survival incident = 0
