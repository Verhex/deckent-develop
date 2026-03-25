# DIRECTIVES — Sprint 052: Documentation Site + Full Config Expansion

## Goal: docs.deckent.agency VitePress site kurulumu + config.json'u TÜM parametrelerle genişlet. Kullanıcı config'i açtığında Deckent'in tüm yeteneklerini görsün. Dashboard'dan config düzenlenebilsin.

---

## Task 1: Full Config Expansion
- Model: opus
- Effort: high
- Files: src/core/config.ts, .deckent/config.json, src/core/config-types.ts
- Scope: src/core/, .deckent/

### Description
config.json'u TÜM parametrelerle genişlet. Mevcut 7 parametre → 41+ parametre. `createDefaultConfig()` fonksiyonundan tüm default değerleri config.json'a yaz. `deckent init` sırasında da tam config oluşturulsun. Kategorilere ayrılmış yapı:

**Provider**: brain_provider, worker_provider, fallback_provider, provider_overrides, cost_optimization, claude_backend, auth_mode
**Sprint**: max_workers, brain_planning, fix_phase_enabled (yeni), max_fix_retries (yeni)
**Memory**: memory_budget (yeni, default 600), decay_after_sprints (yeni, default 5), patterns_enabled (yeni), project_identity_enabled (yeni)
**Auditor**: scan_interval (yeni, default 30), heartbeat_timeout (yeni, default 120), boundary_enforcement (yeni, default true)
**Skill Routing**: skill_routing (design, testing, docs, default)
**Search**: search_enabled, search_provider, search_cache_ttl
**Notifications**: notify_on_complete, notify_channel, notify_url
**Telemetry**: telemetry_enabled, telemetry_anonymous
**Environment**: detected_env, multi_ide_mode
**Output**: output_splash, output_mode, output_theme
**Rollback**: rollback_policy (yeni config field, default 'never')
**Auto Docs**: auto_docs (tier1, tier2, tier3)

Yeni alanlar config-types.ts'e de eklensin. `deckent config --show-all` komutu tüm parametreleri kategorileriyle göstersin. Null/undefined değerler JSON'da `null` olarak yazılsın — kullanıcı görsün.
10+ test.

---

## Task 2: Config Documentation (Inline Comments)
- Model: sonnet
- Effort: normal
- Files: src/core/config.ts, docs/CONFIG-REFERENCE.md
- Scope: src/core/, docs/

### Description
Her config parametresi için inline açıklama sistemi. `CONFIG_METADATA` objesi: her key için { description, type, default, options, category }. `deckent config --help <key>` → parametrenin açıklamasını göster. `deckent config --list` → tüm parametreleri kategorileriyle listele. docs/CONFIG-REFERENCE.md'yi otomatik oluştur (CONFIG_METADATA'dan).
8+ test.

---

## Task 3: Dashboard Config Editor
- Model: opus
- Effort: high
- Files: src/api/server.ts, src/dashboard/src/pages/ConfigPage.tsx (modify)
- Scope: src/api/, src/dashboard/

### Description
Dashboard'daki Config sayfasını genişlet. Kategorilere ayrılmış form: Provider, Sprint, Memory, Auditor, Skill, Search, Notifications, Telemetry, Output. Her parametre için: label, input (select/number/boolean/text), açıklama tooltip, mevcut değer, default değer göstergesi. POST /api/config ile kaydet. Validation feedback (hata mesajları). "Reset to Default" butonu per-field.
8+ test.

---

## Task 4: VitePress Setup
- Model: sonnet
- Effort: normal
- Files: docs/.vitepress/config.ts (new), docs/.vitepress/theme/ (new), docs/package.json (new)
- Scope: docs/

### Description
VitePress site scaffolding. `docs/` klasöründe `npm run docs:dev` ile çalışır. Sidebar: Getting Started, Architecture, CLI Reference, API, MCP Guide, Config Reference, Plugin Development. Nav: Home, Docs, Blog, GitHub. Dark/light theme. Logo placeholder.
5+ test.

---

## Task 5: Getting Started Guide
- Model: opus
- Effort: high
- Files: docs/guide/getting-started.md (new), docs/guide/first-sprint.md (new), docs/guide/concepts.md (new)
- Scope: docs/guide/

### Description
"5 dakikada ilk sprint" rehberi. Adımlar: 1) Install (`npx deckent init`), 2) İlk goal yaz, 3) `deckent start`, 4) Sonuçları gör. Concepts: Sprint, Task, Agent, Skill, Brain, Auditor açıklaması. İngilizce. Code örnekleri, terminal output örnekleri. Config bölümü: "Customize your setup" → config.json referansı.
8+ test.

---

## Task 6: CLI Reference (Auto-Generated)
- Model: sonnet
- Effort: normal
- Files: docs/reference/cli.md (new), scripts/generate-cli-docs.ts (new)
- Scope: docs/reference/, scripts/

### Description
33 CLI komutunun otomatik dokümantasyonu. Commander.js'den help text parse et veya commands/ dizininden oku. Her komut: usage, options, examples. `npm run docs:generate-cli` script'i.
5+ test.

---

## Task 7: Config Migration Helper
- Model: sonnet
- Effort: normal
- Files: src/cli/commands/config.ts, src/core/config-migration.ts (new)
- Scope: src/cli/, src/core/

### Description
Eski (minimal) config.json'ları yeni (tam) formata migrate et. `deckent config --migrate` komutu: mevcut config'i oku, eksik alanları default değerlerle doldur, yaz. Mevcut değerleri korur, sadece yeni alanları ekler. Backup oluştur: config.json.bak. `deckent init` sırasında otomatik migration.
5+ test.

---

## Task 8: Deploy Configuration
- Model: haiku
- Effort: low
- Files: .github/workflows/docs.yml (new), docs/.vitepress/config.ts
- Scope: .github/, docs/

### Description
GitHub Pages deploy. Push to main → auto-build → deploy. Custom domain: docs.deckent.agency (DNS config talimatları). `base` path doğru.
3+ test.

---

## Quality Rules
- tsc --noEmit MUST pass
- All new tests MUST pass
- Existing tests: 0 regression
- config.json tüm parametreleri içermeli
- Dashboard config editor çalışmalı
- VitePress build succeeds
