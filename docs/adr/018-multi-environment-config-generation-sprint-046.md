# ADR-018: Multi-Environment Config Generation (Sprint 046)

**Status:** accepted

**Date:** 2026-04-16

---

**Context:** Her IDE/ortam farklı config dosyası bekliyor. Codex, Gemini, Cursor, VS Code farklı format ve yol tercihlerine sahip.

**Decision:** Ortam başına **`@DECKENT.md` adapter generator** (ADR-013 deseni): Codex → `AGENTS.md`, Gemini → `GEMINI.md`, Cursor → `.cursor/rules/deckent.mdc`, Claude → `CLAUDE.md`. Generator'lar `src/cli/helpers/agent-templates.ts` (`generateAgentsMd`/`generateGeminiMd`/`generateCursorRules`). `deckent init --all-envs` tüm ortamları tek seferde hazırlar. *(Orijinal Sprint-046 önerisi IDE-özel dosyalardı — config.toml/settings.json/mcp.json — ama @DECKENT.md adapter desenine yakınsadı; aşağıdaki Note + ADR-013.)*

**Consequence:** Kullanıcı tek komutla tüm IDE entegrasyonlarını kurar. Her generator bağımsız modül, yeni ortam eklemek kolaylaşır. Adapter'lar üzerine yazılmaz — `ensureDeckentImport` / `deckent sync` ile sadece `@DECKENT.md` referansı korunur (ADR-013; orijinal `writeIfNotExists` ifadesinin yerini alır).

**Note (evolved targets):** The per-environment generation decision still stands, but the concrete file targets converged on the **ADR-013 thin `@DECKENT.md` adapter** pattern (not the IDE-specific files originally proposed):
- Codex → `AGENTS.md` (not `config.toml`)
- Gemini → `GEMINI.md` (not `settings.json`)
- Cursor → `.cursor/rules/deckent.mdc` (not `mcp.json`)
- Claude → `CLAUDE.md`

Generators live in `src/cli/helpers/agent-templates.ts` (`generateAgentsMd`, `generateGeminiMd`, …); the never-overwrite guarantee is provided by `ensureDeckentImport` / `deckent sync` (ADR-013), superseding the original `writeIfNotExists` phrasing. Behavior unchanged; documentation alignment only.

---

**Amendment log:** 2026-06-11 — Decision-body gerçek hedeflere güncellendi (config.toml/settings.json/mcp.json → AGENTS.md/GEMINI.md/.cursor/rules @DECKENT.md adapter, ADR-013); Consequence `writeIfNotExists` → `ensureDeckentImport`. Decision artık tek başına yanıltmıyor (Alperen ADR-review). md+db senkron.
