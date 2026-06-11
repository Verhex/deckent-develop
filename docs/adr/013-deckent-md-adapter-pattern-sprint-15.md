# ADR-013: DECKENT.md Adapter Pattern (Sprint 15)

**Status:** accepted

**Date:** 2026-04-16

---

**Context:** CLAUDE.md'yi init sırasında overwrite etmek kullanıcı değişikliklerini kaybettiriyordu.

**Decision:** DECKENT.md = tek gerçek kaynak. CLAUDE.md ve AGENTS.md adaptör dosyalar — sadece `@DECKENT.md` referansı enjekte edilir (ensureDeckentImport). Asla üzerine yazılmaz.

**Consequences:**
- Init idempotent ve güvenli
- Kullanıcının CLAUDE.md özelleştirmeleri korunur
- Gelecek provider'lar (Codex, Gemini) için adapter pattern genişletilebilir
- `deckent sync` komutu adapter'ları yeniden senkronize eder

**Note (realized):** The "extensible to future providers" consequence is now realized. Thin `@DECKENT.md` adapters exist for Gemini (`GEMINI.md`) and Codex (root `AGENTS.md`, optional `.codex/AGENTS.md`) alongside `CLAUDE.md` (Claude Code) and `.cursor/rules` (Cursor), all maintained via `ensureDeckentImport` (`src/core/utils.ts`) and `deckent sync` (`src/cli/commands/sync.ts`). `DECKENT.md` remains the single source of truth; adapters are never overwritten. Consistent with `DECKENT.md` and `CONTRIBUTING.md`. Behavior unchanged; documentation alignment only.

---

**🔴 Amendment — Sprint 281 (2026-06-11, Alperen ADR-review): ADR-013 ↔ ADR-029 çelişkisi + locale-leak kök-çözümü (seçenek A).**

Çelişki: ADR-013 "CLAUDE.md/AGENTS.md asla üzerine yazılmaz" derken `.deckent/docs.json` bunları **managed-docs** olarak listeliyordu (`claude-md`→CLAUDE.md, `agents-md`→AGENTS.md) → ADR-029 render'ı her sprint (RETRO) bu EN-adapter'lara TR-başlık (`Metric→Metrik`) basıyordu = tekrarlayan **locale-leak** (her sprint manuel revert).

**Karar (seçenek A):** CLAUDE.md/AGENTS.md (ve GEMINI.md/.cursor) **SAF adapter**'dır — managed-docs DEĞİL. Sadece `@DECKENT.md` referansı (`ensureDeckentImport`) + kullanıcı içeriği; bu ADR'nin "asla overwrite edilmez" garantisi mutlaktır. → docs.json'dan `claude-md`/`agents-md` çıkarılacak (deckent-dev + product init default'u) → render yok → locale-leak kökten biter. İş-maddesi: MASTER-PLAN "ADR-Analizi Türetilen İşler → ADR-013-W". Çift-bakış: dogfood (yerel leak biter) + product (user projelerinde CLAUDE.md bozulmaz).
