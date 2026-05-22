# DIRECTIVES — Smoke Sprint: api-surface.md Memory V2 Doc Sync

## Goal: B6-B14 Memory V2 saf DB-first geçişi sonrası `docs/reference/api-surface.md`'deki bayat RETRO.md/MEMORY.md atıflarını gerçeğe güncelle. Bu tek-task smoke sprint, B6-B14 sonrası deckent sprint lifecycle'ının (PLAN→SPAWN→EXECUTE→EVALUATE→RETRO→post-finalize) — özellikle DB-first retrospektif yazımı ve identity-sync hook'u — sağlam koştuğunu doğrular.

---

## Task 1: api-surface.md Memory V2 atıf güncellemesi
- Model: sonnet
- Effort: low
- Skills: documentation-writer
- Files: docs/reference/api-surface.md
- Scope: docs/reference/

### Description
`docs/reference/api-surface.md`'de Memory V2 geçişiyle (B6-B14) bayatlamış atıfları düzelt.

1. **Sprint Phases bölümü** — "RETRO — Retrospective written to RETRO.md" satırı artık yanlış. B8 ile `writeRetrospective` `.brain/RETRO.md` dosyası YAZMIYOR; retrospektif yalnızca memory.db `retro` entry'sine yazılıyor. Satırı gerçeğe çevir (ör. "Retrospective written to the memory.db `retro` entry").

2. **`.brain/ File Formats` bölümü** — `MEMORY.md`, `RETRO.md`, `PATTERNS.md`, `DEBT.md`, `PROJECT-IDENTITY.md` kök dosyalarına canlı writer/store gibi atıfta bulunan ifade varsa düzelt. B6-B14 sonrası gerçek: memory.db tek kaynak; `.brain/exports/{summary,decisions,memory,debt}.md` tek üretilen görünüm; `.brain/ERRORS.md` hâlâ dosya-tabanlı (korundu); bu 5 legacy kök `.md` dosyası tamamen kaldırıldı.

Yalnızca `docs/reference/api-surface.md` değişir. Kaynak kod ve test dosyaları değişmez.

**Kanıt:** `grep -nE "RETRO\.md|written to RETRO" docs/reference/api-surface.md` → "written to RETRO.md" ifadesi kalmadı, retrospektifin memory.db'ye yazıldığı belirtildi.

**Test:** Doc-only task — yeni test gerekmez; `tsc --noEmit` ve build etkilenmez (regresyon yok = yeterli).
