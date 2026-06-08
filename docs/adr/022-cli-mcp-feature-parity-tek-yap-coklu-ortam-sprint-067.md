# ADR-022: CLI/MCP Feature Parity — Parametre Eşitleme + Eksik Komutlar

**Status:** accepted

**Date:** 2026-04-16

**Supersedes:** ADR-022 v1 (Sprint 067) — see **History** below

---

**Context:** Sprint 085'te MCP tool parametreleştirilmesi tamamlandı. `deckent_init`, `deckent_start`, `deckent_status`, `deckent_doctor`, `deckent_retro`, `deckent_history` araçlarına CLI karşılıkları olanlarla eşit parametreler eklendi. Ayrıca `deckent_agent_list` ve `deckent_skill_list` araçları CLI-only olan `deckent agent list` ve `deckent skill list` komutlarını MCP'ye getirdi.

**Decision:** CLI-only komutlar altyapı/terminal işlemleridir ve MCP'de yer almaz:
- **Altyapı:** `attach`, `spawn`, `watch` — tmux oturum yönetimi
- **Sunucu/UI:** `dashboard`, `web`, `serve` — arabirim başlatma
- **Kurulum:** `upgrade`, `onboard` — setup sihirbazları
- **Eklenti:** `plugin install`, `plugin list`, `plugin create` — eklenti yönetimi

MCP-only komut yoktur — her MCP aracının bir CLI karşılığı vardır. Ortak iş mantığı `src/core/` veya `src/orchestra/` altında paylaşılır; CLI (`register<Name>(program)`) ve MCP (`server.registerTool()`) yalnızca thin wrapper'dır ve aynı core fonksiyonu çağırır.

**Consequence:**
- Kullanıcı CLI'da yapabildiği her şeyi MCP (Claude Code, VS Code, JetBrains) üzerinden de yapabilir
- Parametre parity: tüm MCP araçları CLI komutlarıyla aynı giriş/çıkış şemasını kullanır
- Altyapı komutları (attach, web, serve, plugin) bilinçli olarak yalnız CLI'da tutulur
- README, CONTRIBUTING ve docs güncellenirken her iki taraf da sayılmalı

> **Note (point-in-time figures):** The Sprint 085 decision text quoted parity counts ("19 MCP = 19 CLI", "MCP 16→19", "CLI 32→33"). Those are **Sprint 085 snapshot values and are now outdated** — the principle (every MCP tool has a CLI counterpart; infra/UI commands are CLI-only) is what stands. Current canonical counts are auto-generated — see `docs/reference/cli.md` and `docs/reference/mcp-tools.md` (`npm run docs:ref`). Behavior unchanged; documentation alignment only.

---

## History — ADR-022 v1 (Sprint 067, superseded)

> Original decision, preserved for historical context. Superseded by the
> accepted decision above (Sprint 085).

**Status:** superseded

**Context (v1):** CLI'da 33+ komut, MCP'de 16 tool + 9 resource vardı. CLI'da olan bazı özellikler (spawn, attach, watch, agent, skill, plugin, onboard, upgrade, explain, finalize, dashboard, web, serve, archive-debt, quick-start, test-run, skill-marketplace) MCP tarafında yoktu. Kullanıcılar CLI'dan MCP'ye geçtiğinde özellik kaybı yaşıyordu. Ayrıca MCP tool'ları ile CLI komutları farklı kod yolları kullanıyordu — CLI doğrudan fonksiyon çağırırken MCP HTTP/stdio üzerinden wrapper çalıştırıyordu.

**Decision (v1):** CLI ve MCP tam özellik eşliği sağlanmalı; her yeni CLI komutu aynı zamanda MCP tool olarak da kaydedilmeli; ortak iş mantığı `src/core/`/`src/orchestra/` altında paylaşılan fonksiyonlarda, CLI ve MCP yalnız thin wrapper.

**Consequence (v1):** Kullanıcı CLI'daki her şeyi MCP üzerinden de yapabilir; test coverage iki kat artabilir; yeni özellik maliyeti artar (2 wrapper) ama tutarlılık garantilenir. (v2'de bu, "altyapı komutları intentional CLI-only" ile rafine edildi.)
