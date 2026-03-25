# DIRECTIVES — Dashboard Expansion (Tek Task)

## Goal: Dashboard'u genişletilmiş config sistemiyle uyumlu hale getir. Eksik kategorileri, usage metriklerini ve testleri ekle.

---

## Task 1: Dashboard Full Expansion
- Model: opus
- Effort: high
- Files: src/dashboard/src/pages/ConfigPage.tsx, src/dashboard/src/pages/DashboardPage.tsx, src/dashboard/src/types/index.ts, tests/dashboard/dashboard-page.test.ts, tests/api/config-editor.test.ts
- Scope: src/dashboard/, tests/dashboard/, tests/api/

### Description
Dashboard'u genişletilmiş config sistemiyle tam uyumlu hale getir. 3 ana iş:

**A) ConfigPage.tsx — Eksik Kategoriler & Alanlar:**
CONFIG_FIELDS dizisine şu alanları ekle:
- Sprint kategorisine: fix_phase_enabled (boolean, default: true), max_fix_retries (number, default: 2)
- Memory kategorisi (yeni): memory_budget (number, default: 600), decay_after_sprints (number, default: 5), patterns_enabled (boolean, default: true), project_identity_enabled (boolean, default: true)
- Auditor kategorisi (yeni): scan_interval (number, default: 30), heartbeat_timeout (number, default: 120), boundary_enforcement (boolean, default: true)
- Rollback kategorisi (yeni): rollback_policy (select: never/on_failure/always, default: 'never')
- Project kategorisi (yeni): language (text), projectName (text), version (text)
- Advanced kategorisi (yeni): auto_clean_locks (boolean, default: false)

CATEGORIES dizisini güncelle: Provider, Sprint, Memory, Auditor, Output, Search, Notifications, Telemetry, Environment, Skill Routing, Rollback, Project, Advanced

**B) DashboardPage.tsx — Usage Metrikleri:**
Sprint Status kartının altına Usage kartı ekle:
- 5hr Usage: state.usage.fiveHourPercent (% bar)
- Weekly Usage: state.usage.weeklyPercent (% bar)
Data zaten state.usage'da mevcut, sadece render yok. Basit Progress bar veya inline bar kullan.

**C) Dashboard Types (types/index.ts):**
DeckentConfig interface'ini genişlet — en azından: brain_provider, worker_provider, fallback_provider, cost_optimization, claude_backend, auth_mode, spawn_backend, memory_budget, decay_after_sprints, patterns_enabled, project_identity_enabled, scan_interval, heartbeat_timeout, boundary_enforcement, fix_phase_enabled, max_fix_retries, rollback_policy, output_splash, output_mode, output_theme, search_enabled, search_provider, search_cache_ttl, notify_on_complete, notify_channel, notify_url, telemetry_enabled, telemetry_anonymous, detected_env, multi_ide_mode, skill_routing, auto_clean_locks

**D) Testler:**
tests/dashboard/dashboard-page.test.ts'e ConfigPage ve DashboardPage testleri ekle (mevcut file-content-based pattern):
- ConfigPage: tüm yeni kategorilerin (Memory, Auditor, Rollback, Project, Advanced) CONFIG_FIELDS'te olduğu, CATEGORIES'in 13 kategori içerdiği
- DashboardPage: usage render edildiği (fiveHourPercent, weeklyPercent)

tests/api/config-editor.test.ts'e: GET /api/config/defaults'ın yeni alanları (memory_budget, scan_interval, rollback_policy, fix_phase_enabled) içerdiğini test et.

10+ yeni test.

---

## Quality Rules
- tsc --noEmit MUST pass
- All new tests MUST pass
- Existing tests: 0 regression
- ConfigPage 13 kategori, 39+ alan göstermeli
- DashboardPage usage metrikleri görünmeli
