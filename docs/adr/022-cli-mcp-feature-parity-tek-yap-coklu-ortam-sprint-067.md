# ADR-022: CLI/MCP Feature Parity — Tek Yapı, Çoklu Ortam (Sprint 067)

**Status:** superseded

**Date:** 2026-04-16

**Sprint:** _To be backfilled_

---

**Status:** superseded

**Superseded by:** ADR-022 v2 (Sprint 085)

**Context:** CLI'da 33+ komut, MCP'de 16 tool + 9 resource var. CLI'da olan bazı özellikler (spawn, attach, watch, agent, skill, plugin, onboard, upgrade, explain, finalize, dashboard, web, serve, archive-debt, quick-start, test-run, skill-marketplace) MCP tarafında yok. Kullanıcılar CLI'dan MCP'ye geçtiğinde özellik kaybı yaşıyor. Ayrıca MCP tool'ları ile CLI komutları farklı kod yolları kullanıyor — CLI doğrudan fonksiyon çağırırken, MCP HTTP/stdio üzerinden wrapper çalıştırıyor. Bu tutarsızlık hata kaynağı.

**Decision:** CLI ve MCP tam özellik eşliği (feature parity) sağlanmalı. Her yeni CLI komutu aynı zamanda MCP tool olarak da kaydedilmeli. Ortak iş mantığı `src/core/` veya `src/orchestra/` altında paylaşılan fonksiyonlarda olmalı — CLI ve MCP sadece thin wrapper (giriş/çıkış adaptörü). Yeni özellik eklerken:
1. İş mantığını core/orchestra'ya yaz
2. CLI komutu: `src/cli/commands/<name>.ts` — `register<Name>(program)` pattern
3. MCP tool: `src/mcp/tools/<name>.ts` — `registerTool()` pattern
4. Her ikisi de aynı core fonksiyonu çağırmalı

**Consequence:**
- Kullanıcı CLI'da yapabildiği her şeyi MCP üzerinden de yapabilir (Claude Code, VS Code, JetBrains)
- Test coverage iki kat artabilir — CLI testleri + MCP testleri aynı iş mantığını doğrular
- Yeni özellik ekleme maliyeti artar (2 wrapper) ama tutarlılık garantilenir
- MCP tool sayısı 16'dan 25+'a çıkacak (bazı CLI komutları birleştirilebilir)
- README, CONTRIBUTING ve docs güncellenirken her iki taraf da sayılmalı
