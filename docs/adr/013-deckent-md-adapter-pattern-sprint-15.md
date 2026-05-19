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
