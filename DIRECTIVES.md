# DIRECTIVES — Sprint 106: Smoke Test + Test Regression Fix

## Goal: Subprocess backend smoke test — basit dosya olusturma + 2 kirik testi duzeltme.

---

## Task 1: Dosya Olusturma Smoke Test
- Model: sonnet
- Effort: low
- Skills: typescript-expert
- Files: docs/smoke/1.md, docs/smoke/2.md, docs/smoke/3.md, docs/smoke/4.md, docs/smoke/5.md
- Scope: docs/smoke/

### Description
docs/smoke/ dizini altinda 5 basit markdown dosyasi olustur:

1.md: "# Smoke Test 1\nDeckent sprint 106 smoke test dosyasi."
2.md: "# Smoke Test 2\nDeckent sprint 106 smoke test dosyasi."
3.md: "# Smoke Test 3\nDeckent sprint 106 smoke test dosyasi."
4.md: "# Smoke Test 4\nDeckent sprint 106 smoke test dosyasi."
5.md: "# Smoke Test 5\nDeckent sprint 106 smoke test dosyasi."

Her dosya basit markdown icermeli, baska bir sey yapma.

**Kanit:** `ls docs/smoke/` → 1.md 2.md 3.md 4.md 5.md

**Test:** Dosyalar var ve icerik dogru

---

## Task 2: Auditor Edge Test Fix
- Model: sonnet
- Effort: normal
- Skills: typescript-expert, testing-expert
- Files: tests/monitor/auditor-edge.test.ts
- Scope: tests/

### Description
tests/monitor/auditor-edge.test.ts dosyasindaki "multiple stale agents produce separate violations and alerts each" testini duzelt.

Sorun: Test 2 stale agent bekliyor ama 1 donuyor. Muhtemel neden: mock filesystem veya heartbeat timestamp hesaplamasi degismis. Testi analiz et, kok nedeni bul ve duzelt.

**Kanit:** `npx vitest run tests/monitor/auditor-edge.test.ts` → 0 fail

**Test:** Tum auditor-edge testleri geciyor

---

## Task 3: Pattern Reader Test Fix
- Model: sonnet
- Effort: normal
- Skills: typescript-expert, testing-expert
- Files: tests/orchestra/pattern-reader.test.ts
- Scope: tests/

### Description
tests/orchestra/pattern-reader.test.ts dosyasindaki "skips malformed files gracefully" testini duzelt.

Sorun: Test 1 pattern bekliyor ama 0 donuyor. Muhtemel neden: queryPatterns fonksiyonunun dosya okuma davranisi degismis. Testi analiz et, kok nedeni bul ve duzelt.

**Kanit:** `npx vitest run tests/orchestra/pattern-reader.test.ts` → 0 fail

**Test:** Tum pattern-reader testleri geciyor

---

## Quality Rules
- tsc --noEmit MUST pass
- npx vitest run → 0 fail hedefli
- docs/smoke/ altinda 5 dosya olmali
