# DIRECTIVES — Sprint 108: Tmux Backend Smoke Test

## Goal: Tmux backend dogrulama — dosya olusturma + test yazma. MCP ile baslatilacak.

---

## Task 1: Tmux Smoke Dosyalari
- Model: sonnet
- Effort: low
- Skills: typescript-expert
- Files: docs/tmux-smoke/x.md, docs/tmux-smoke/y.md, docs/tmux-smoke/z.md
- Scope: docs/tmux-smoke/

### Description
docs/tmux-smoke/ dizini altinda 3 markdown dosyasi olustur:

x.md: "# Tmux Smoke X\nSprint 108 — tmux backend test."
y.md: "# Tmux Smoke Y\nSprint 108 — tmux backend test."
z.md: "# Tmux Smoke Z\nSprint 108 — tmux backend test."

**Kanit:** `ls docs/tmux-smoke/` → x.md y.md z.md

**Test:** Dosyalar var

---

## Task 2: Tmux Smoke Test Dosyasi
- Model: sonnet
- Effort: low
- Skills: testing-expert
- Files: tests/smoke/tmux-smoke.test.ts
- Scope: tests/smoke/

### Description
tests/smoke/tmux-smoke.test.ts dosyasi olustur. 3 basit test yaz:

1. docs/tmux-smoke/x.md var mi kontrol et
2. docs/tmux-smoke/y.md var mi kontrol et
3. docs/tmux-smoke/z.md var mi kontrol et

Her test `existsSync` ile dosyanin varligini dogrular.

**Kanit:** `npx vitest run tests/smoke/tmux-smoke.test.ts` → 3 pass

**Test:** 3 test geciyor

---

## Quality Rules
- tsc --noEmit MUST pass
- docs/tmux-smoke/ altinda 3 dosya olmali
