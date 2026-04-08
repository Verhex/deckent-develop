# DIRECTIVES — Sprint 107: CLI Smoke Test

## Goal: CLI subprocess backend smoke test — basit dosya olusturma + test calistirma.

---

## Task 1: CLI Smoke Dosyalari
- Model: sonnet
- Effort: low
- Skills: typescript-expert
- Files: docs/cli-smoke/a.md, docs/cli-smoke/b.md, docs/cli-smoke/c.md
- Scope: docs/cli-smoke/

### Description
docs/cli-smoke/ dizini altinda 3 markdown dosyasi olustur:

a.md: "# CLI Smoke A\nSprint 107 — CLI subprocess backend test."
b.md: "# CLI Smoke B\nSprint 107 — CLI subprocess backend test."
c.md: "# CLI Smoke C\nSprint 107 — CLI subprocess backend test."

**Kanit:** `ls docs/cli-smoke/` → a.md b.md c.md

**Test:** Dosyalar var

---

## Task 2: Vitest Kontrolu
- Model: sonnet
- Effort: low
- Skills: testing-expert
- Files: tests/smoke/cli-smoke.test.ts
- Scope: tests/smoke/

### Description
tests/smoke/cli-smoke.test.ts dosyasi olustur. 3 basit test yaz:

1. docs/cli-smoke/a.md var mi kontrol et
2. docs/cli-smoke/b.md var mi kontrol et
3. docs/cli-smoke/c.md var mi kontrol et

Her test `existsSync` ile dosyanin varligini dogrular.

**Kanit:** `npx vitest run tests/smoke/cli-smoke.test.ts` → 3 pass

**Test:** 3 test geciyor

---

## Quality Rules
- tsc --noEmit MUST pass
- npx vitest run → 0 fail
- docs/cli-smoke/ altinda 3 dosya olmali
