# ADR-018: Multi-Environment Config Generation (Sprint 046)

**Status:** accepted

**Date:** 2026-04-16

---

**Context:** Her IDE/ortam farklı config dosyası bekliyor. Codex, Gemini, Cursor, VS Code farklı format ve yol tercihlerine sahip.

**Decision:** Ortam başına config generator: Codex → `config.toml`, Gemini → `settings.json`, Cursor → `mcp.json`. `deckent init --all-envs` tüm ortamları tek seferde hazırlar.

**Consequence:** Kullanıcı tek komutla tüm IDE entegrasyonlarını kurar. Her generator bağımsız modül, yeni ortam eklemek kolaylaşır. Mevcut config'ler üzerine yazılmaz, `writeIfNotExists` prensibi korunur.

**Note (evolved targets):** The per-environment generation decision still stands, but the concrete file targets converged on the **ADR-013 thin `@DECKENT.md` adapter** pattern (not the IDE-specific files originally proposed):
- Codex → `AGENTS.md` (not `config.toml`)
- Gemini → `GEMINI.md` (not `settings.json`)
- Cursor → `.cursor/rules/deckent.mdc` (not `mcp.json`)
- Claude → `CLAUDE.md`

Generators live in `src/cli/helpers/agent-templates.ts` (`generateAgentsMd`, `generateGeminiMd`, …); the never-overwrite guarantee is provided by `ensureDeckentImport` / `deckent sync` (ADR-013), superseding the original `writeIfNotExists` phrasing. Behavior unchanged; documentation alignment only.
