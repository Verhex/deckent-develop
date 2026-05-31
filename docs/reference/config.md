# Deckent Configuration Reference

> Bu dokuman Deckent config sisteminin tek kanon referansidir. AI orchestrator'lari
> (Claude Code, Codex, Gemini) ve insan gelistiricilerin birlikte okuyup anlamasi
> icin yazilmistir. Alias yoktur — her key tek kanonik isimle gecer.

**Config dosyasi:** `.deckent/config.json`
**3-layer merge sirasi:** defaults -> global (`~/.deckent/config.json`) -> project (`.deckent/config.json`)
**ADR:** ADR-004 (3-Layer Config Merge)

---

## Identity

| Key | Type | Default | Env Var | Description |
|-----|------|---------|---------|-------------|
| `projectName` | `string` | `'deckent-project'` | — | Proje adi. `deckent init` sirasinda ayarlanir. |
| `language` | `string` | `'en'` | `DECKENT_LANGUAGE` | Proje dili: `'en'` veya `'tr'`. Sprint ciktilari bu dilde uretilir. |
| `last_sprint_id` | `string` | — | — | Son tamamlanan sprint ID'si (orn. `'sprint-150'`). Brain tarafindan otomatik guncellenir. |
| `detected_env` | `string \| null` | `null` | — | Otomatik tespit edilen ortam: `'vscode'`, `'codex'`, `'gemini'`, `'cursor'`, `'tmux'`, `'shell'`, veya `null`. |
| `version` | `string` | DECKENT_VERSION | — | Config dosyasinin olusturuldugu Deckent surumu. |
| `deckent_style` | `'sprint' \| 'task'` | `'sprint'` | `DECKENT_STYLE` | Calisma modu: `'sprint'` (developer orchestration) veya `'task'` (tek seferlik). |

---

## Modes & Models

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `mode` | `PlanMode` | `'balanced'` | Aktif plan modu. Gecerli: `'performance'`, `'balanced'`, `'economic'`, `'api'`. |
| `modes` | `Record<PlanMode, PlanModeConfig>` | (preset) | Her mod icin konfigürasyon: `max_workers`, `brain_model`, `default_model`, `haiku_allowed`, `brain_planning`. |
| `model_strategy` | `Partial<ModelStrategy>` | (mode preset) | Tier-tabanli model secim stratejisi. Mode preset ile merge edilir, user override oncelikli. |
| `providers` | `{ brain?, worker?, fallback?, overrides? }` | — | Gruplanmis provider konfig. **Flat `brain_provider`/`worker_provider` kaldirildI** (Sprint 150 Karar 3+4). |

### PlanModeConfig

| Field | Type | Description |
|-------|------|-------------|
| `max_workers` | `number \| 'auto'` | Maksimum esanli worker sayisi. `'auto'` runtime'da sistem kapasitesine gore belirlenir. |
| `brain_model` | `ModelType` | Brain orchestrator'un kullandigi model (v1 backward compat). |
| `default_model` | `ModelType` | Worker'larin varsayilan modeli (v1 backward compat). |
| `haiku_allowed` | `boolean` | Dusuk-tier modellere izin ver. **Deprecated:** `min_tier` kullanin. |
| `min_tier` | `ModelTier` | Minimum model tier'i. `haiku_allowed: false` -> `min_tier: 'standard'`. |
| `brain_planning` | `BrainPlanningMode` | Planlama modu: `'ai'`, `'structured'`, `'auto'`. |
| `budget_per_sprint` | `number` | Sprint basi USD butce (sadece `api` modunda). |

### ModelStrategy (Tier-based)

| Field | Type | Default (performance) | Description |
|-------|------|-----------------------|-------------|
| `brain_tier` | `ModelTier` | `'premium'` | Brain icin tier: `'economy'`, `'standard'`, `'premium'`, `'premium_plus'`. |
| `worker_tier` | `ModelTier` | `'premium'` | Worker icin tier. |
| `min_tier` | `ModelTier` | `'economy'` | Minimum izin verilen tier. |
| `max_tier` | `ModelTier` | `'premium_plus'` | Maksimum izin verilen tier. |
| `auto_upgrade` | `boolean` | `true` | Karmasik task'larda tier otomatik yukseltilsin mi. |
| `auto_downgrade` | `boolean` | `false` | Basit task'larda (doc/test) tier otomatik dusurulsun mu. |

### MODE_PRESETS (Canonical Source)

| Mode | max_workers | brain_tier | worker_tier | min_tier | max_tier |
|------|-------------|------------|-------------|----------|----------|
| `performance` | 8 | premium | premium | economy | premium_plus |
| `balanced` | 5 | standard | premium | economy | premium |
| `economic` | 3 | standard | standard | economy | standard |
| `api` | 10 | premium | standard | economy | premium_plus |

> **Not:** `mode-presets.ts` tek kaynak (single source of truth). `DEFAULT_MODES` bu presetlerden turetilir.

---

## Backend & Runtime

| Key | Type | Default | Env Var | Description |
|-----|------|---------|---------|-------------|
| `spawn_backend` | `'docker' \| 'tmux' \| 'subprocess' \| 'auto'` | (auto-detect) | — | Worker calistirma backend'i. `deckent init` sirasinda sistem kapasitesine gore otomatik belirlenir. |
| `docker_image` | `string` | `'deckent-worker:latest'` | — | Docker worker container imaji. |
| `docker_timeout` | `number` | `1200` | — | Docker container timeout (saniye). |
| `worker_memory_limit` | `string` | `'2g'` | — | Docker worker container bellek limiti (orn. `'2g'`, `'512m'`). |
| `worker_memory_swap` | `string` | `'3g'` | — | Docker worker container swap limiti. `worker_memory_limit`'ten buyuk olmali. |
| `multi_ide_mode` | `boolean` | `false` | — | Birden fazla IDE ortamini destekle. |
| `max_workers` | `number` | (auto-detect) | — | User-level override. Tum modlardan bagimsiz, top-level limit. Preset degerleri override eder. |

> **Sprint 150 Degisiklik:** `claude_backend` kaldirildi — `spawn_backend` kullanin.
> **System Capacity MVP:** `deckent init` sirasinda RAM ve CPU'ya gore `max_workers` ve `spawn_backend` otomatik onerilir.

---

## Memory

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `memory_budget` | `number` | `5000` | `.brain/` dizini bellek butcesi (satir). |
| `decay_after_sprints` | `number` | `20` | N sprint sonra eski kayitlari soft-delete. |
| `patterns_enabled` | `boolean` | `true` | Desen algilama aktif. |
| `project_identity_enabled` | `boolean` | `true` | PROJECT-IDENTITY.md guncellemesi aktif. |
| `memory.backend` | `'sqlite' \| 'json'` | `'sqlite'` | Hafiza backend'i. Memory V2 = SQLite. |
| `memory.search` | `'fts5' \| 'semantic' \| 'hybrid'` | `'fts5'` | Arama motoru. FTS5 = dual-layer Turkish normalize. |
| `memory.decay_after_sprints` | `number` | `20` | V2 decay suresi. |
| `memory.export_md` | `boolean` | `true` | DB'den .md snapshot'lari cikart. |
| `memory.export_trigger` | `'sprint_end' \| 'every_write' \| 'manual'` | `'sprint_end'` | Export tetikleme zamani. |

---

## Sprint Lifecycle

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `fix_phase_enabled` | `boolean` | `true` | Basarisiz task'lari fix phase'de tekrar dene. |
| `max_fix_retries` | `number` | `2` | Fix phase'de max deneme sayisi (0-10). |
| `coverage_threshold` | `number` | `90` | Tech debt olmadan gecmek icin min. coverage %. |
| `max_reroutes` | `number` | `3` | Mid-sprint adapter'da task basi max reroute. |
| `reroute_on_tech_debt` | `boolean` | `false` | GO_WITH_TECH_DEBT task'lari da reroute et. |
| `sprint_timeout_minutes` | `number` | `0` | Sprint timeout (dakika). 0 = limitsiz. |
| `sprint_checkpoint_interval` | `number` | `5` | Her N terminal task'ta checkpoint yaz. |
| `cleanup_delay_ms` | `number` | `180000` | Cleanup'tan once bekleme (ms). 0 = hemen. |
| `ai_planner_timeout` | `number` | `60000` | AI planner subprocess timeout (ms). |
| `human_checkpoints` | `string[]` | `[]` | Insan onayi gereken fazlar: `'plan'`, `'evaluate'`, `'fix'`. Bos = tam otonom. |
| `dependency_pipeline_enabled` | `boolean` | `true` | ADR-045 wave-based execution. `true` = Kahn algoritmasiyla topological wave spawning, cascade-on-NO_GO, unblock-on-DONE. `false` = Brain manuel wave yonetimi. **deckent-dev projesi kasitli `false`** (ADR-047). |

---

## Auditor

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `scan_interval` | `number` | `30` | Auditor tarama araligi (saniye, 5-600). |
| `heartbeat_timeout` | `number` | `120` | Heartbeat stale esigi (saniye, 30-600). |
| `boundary_enforcement` | `boolean` | `true` | Worker scope sinir kontrolu. |
| `lock_stale_threshold` | `number` | `300` | Kilit stale esigi (saniye, 30-3600). |
| `auto_clean_locks` | `boolean` | `false` | Stale kilitleri otomatik temizle. |

---

## Rollback & Safety

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `rollback_policy` | `'never' \| 'on_failure' \| 'always'` | `'never'` | Sprint oncesi safety point + rollback politikasi. **`never` kalacak** (Alperen karari). |
| `auth_mode` | `'subscription' \| 'api' \| 'hybrid'` | `'subscription'` | Kimlik dogrulama modu. |
| `api_auth_token` | `string` | — | HTTP API bearer token. `DECKENT_API_TOKEN` env var ile de ayarlanabilir. |
| `plugin_require_signature` | `boolean` | `false` | Plugin hook modulleri icin SHA-256 imza zorunlulugu. |

---

## Evaluation

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `evaluation_rubric` | `Partial<EvaluationRubric>` | — | Ozel degerlendirme rubric override'lari. |
| `rubric_max_retries` | `number` | `0` | Rubric degerlendirme basarisiz olursa tekrar deneme (0-3). |
| `adaptive_thresholds` | `boolean` | `false` | Sprint NO_GO oranina gore parametreleri otomatik ayarla. |
| `agent_min_score` | `number` | `5` | Routing secimi icin min. agent skoru (2-8). |
| `adaptive_config.min_samples` | `number` | `3` | Ayarlama oncesi gereken min. gecmis sprint sayisi. |
| `adaptive_config.no_go_threshold` | `number` | `0.3` | Agent skor dusurme NO_GO oran esigi (0-1). |
| `adaptive_config.coverage_lookback` | `number` | `3` | Coverage ortalamasi icin bakilan sprint sayisi. |

---

## Routing

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `routing_engine` | `'v1' \| 'v2'` | `'v2'` | Routing motoru surumu. v1 = keyword, v2 = intent-based. |
| `routing_config.agentMinScore` | `number` | — | v2 routing: agent min. skor. |
| `routing_config.skillMinScore` | `number` | — | v2 routing: skill min. skor. |
| `routing_config.confidenceThreshold` | `number` | — | v2 routing: guven esigi. |
| `routing_config.maxSkillsDefault` | `number` | — | v2 routing: task basi max. skill. |

---

## Search & Documentation

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `search_enabled` | `boolean` | `true` | Cevrimici dokumantasyon aramasi. |
| `search_provider` | `'context7' \| 'web' \| 'none'` | `'context7'` | Arama saglayicisi. |
| `search_cache_ttl` | `number` | `3600` | Arama sonuclari cache suresi (saniye). 0 = cache yok. |
| `auto_docs` | `AutoDocsConfig` | `{ tier1: true, tier2: false, tier3: false }` | Otomatik dokuman uretimi tier ayarlari. |

---

## Notifications

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `notify_on_complete` | `boolean` | `false` | Sprint bitiminde bildirim gonder. |
| `notify_channel` | `string \| null` | `null` | Bildirim kanali: `'slack'`, `'discord'`, `'email'`, `'webhook'`. |
| `notify_url` | `string \| null` | `null` | Webhook URL. |

---

## Telemetry

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `telemetry_enabled` | `boolean` | `false` | Telemetri veri toplama. |
| `telemetry_anonymous` | `boolean` | `true` | Anonim telemetri. |

---

## Output & Display

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `output_splash` | `boolean` | `true` | Kraken ASCII splash goster. |
| `output_mode` | `'quiet' \| 'normal' \| 'verbose'` | `'normal'` | Cikti detay seviyesi. |
| `output_theme` | `'default' \| 'minimal' \| 'rich'` | `'default'` | Cikti temasi. |
| `output_render_mode` | `string` | — | Status render modu: `'explainatory'`, `'standart'`, `'verbose'`, `'json'`. |

---

## Timeout

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `timeout.docker_min_timeout` | `number` | `1200` | Docker min. timeout (saniye, >=300). |
| `timeout.docker_max_timeout` | `number` | `7200` | Docker max. timeout (saniye, <=14400). |
| `timeout.tmux_min_timeout` | `number` | `900` | Tmux min. timeout. |
| `timeout.tmux_max_timeout` | `number` | `5400` | Tmux max. timeout. |
| `timeout.subprocess_min_timeout` | `number` | `600` | Subprocess min. timeout. |
| `timeout.subprocess_max_timeout` | `number` | `3600` | Subprocess max. timeout. |
| `timeout.effort_base.low` | `number` | `600` | Dusuk efor baz suresi (saniye). |
| `timeout.effort_base.normal` | `number` | `1200` | Normal efor baz suresi. |
| `timeout.effort_base.high` | `number` | `2400` | Yuksek efor baz suresi. |
| `timeout.loc_scaling_enabled` | `boolean` | `true` | Kod satiri tahminine gore timeout olcekleme. |
| `timeout.history_scaling_enabled` | `boolean` | `true` | Gecmis sprint verisine gore timeout olcekleme. |
| `timeout.runtime_extension_enabled` | `boolean` | `false` | Calisma sirasinda timeout uzatma. |

---

## Nervous System (Sprint 147+)

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `nervous_system.enabled` | `boolean` | `false` | Proaktif meta-orchestrator. |
| `nervous_system.mode` | `NervousAuthorityMode` | `'balanced'` | Otorite modu: `'strict'`, `'balanced'`, `'autopilot'`, `'full-auto'`. |
| `nervous_system.actionOverrides` | `Record<string, NervousApprovalPolicy>` | `{}` | Aksiyon-basi onay politikasi override. |
| `nervous_system.safety_floor.locked_actions` | `string[]` | (5 aksiyon) | Asla otomatik calistirilmayan aksiyonlar. |
| `nervous_system.safety_floor.cost_threshold_usd` | `number` | `110` | Maliyet uyarisi esigi (USD). |
| `nervous_system.safety_floor.bypass_allowed` | `boolean` | `false` | Guvenlik zemini atlama izni. |
| `nervous_system.notifications.channels` | `object` | `{ mcp: true, cli: true, file: true }` | Bildirim kanallari. |
| `nervous_system.notifications.throttle_ms` | `number` | `300000` | Bildirim throttle suresi (ms). |
| `nervous_system.notifications.severity_min` | `string` | `'info'` | Minimum bildirim onemi: `'info'`, `'warning'`, `'critical'`, `'emergency'`. |
| `nervous_system.notifications.quiet_hours` | `object` | `{ start: '22:00', end: '08:00', timezone: 'TRT' }` | Sessiz saatler (UTC+3). |
| `nervous_system.detectors.*` | `object` | (10 detector) | Her detector icin `enabled` + detector-ozel ayarlar. |
| `nervous_system.history_retention_days` | `number` | `30` | Olay gecmisi saklama suresi (gun). |

---

## Observability

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `observability.rotation.maxSizeMB` | `number` | `1` | Metrics dosyasi max boyut (MB), asildinda rotate edilir. |
| `observability.rotation.archiveFormat` | `'gzip'` | `'gzip'` | Arsiv formati. |
| `observability.rotation.keepLastN` | `number` | `10` | Saklanan arsiv dosya sayisi. |

---

## Skills

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `skills.enabled` | `boolean` | — | Skill sistemi aktif. |
| `skills.maxPerTask` | `number` | `3` | Task basi max. skill sayisi (1-10). |
| `skills.autoDetectStack` | `boolean` | `true` | Proje stack'ini otomatik tespit et. |
| `skills.preferredSkills` | `string[]` | `[]` | Tercih edilen skill ID'leri. |
| `skill_routing` | `object` | — | Skill-bazi provider yonlendirmesi. |

---

## Environment Variables

Asagidaki env var'lar config degerlerini override eder:

| Env Var | Config Key | Description |
|---------|-----------|-------------|
| `DECKENT_BRAIN_PROVIDER` | `brain_provider` | Brain provider override. |
| `DECKENT_WORKER_PROVIDER` | `worker_provider` | Worker provider override. |
| `DECKENT_MODE` | `mode` | Plan modu override. |
| `DECKENT_LANGUAGE` | `language` | Dil override. |
| `DECKENT_STYLE` | `deckent_style` | Calisma modu override. |
| `DECKENT_CONFIG_RELOAD` | — | `'1'` olarak ayarlandiginda config cache bypass edilir. |
| `DECKENT_API_TOKEN` | `api_auth_token` | HTTP API bearer token. |
| `ANTHROPIC_API_KEY` | — | Claude API key (api mode icin zorunlu). |
| `OPENAI_API_KEY` | — | Codex provider icin. |
| `GOOGLE_API_KEY` | — | Gemini provider icin. |

---

## Setup Scenarios

### Temel Init

```bash
deckent init
# Otomatik: spawn_backend + max_workers sistem kapasitesine gore belirlenir
```

### Docker'li Gelismis

```json
{
  "mode": "performance",
  "spawn_backend": "docker",
  "max_workers": 6,
  "docker_image": "deckent-worker:latest"
}
```

### Claude Max + API Mode

```json
{
  "mode": "api",
  "auth_mode": "api",
  "model_strategy": {
    "brain_tier": "premium",
    "worker_tier": "premium",
    "auto_upgrade": true
  }
}
```

### Multi-IDE Ortam

```bash
deckent init --all-envs
# .cursor/, .vscode/, codex.md, GEMINI.md olusturulur
```

---

## Migration Changelog

### Sprint 150: v2 Duplicate Key Removal

| Kaldirilan Key | Yerine Gecen | Sebep |
|----------------|-------------|-------|
| `claude_backend` | `spawn_backend` | Cift kabuk celiskisi + dead read path |
| `brain_provider` (flat) | `providers.brain` | Gruplanmis format kanon |
| `worker_provider` (flat) | `providers.worker` | Gruplanmis format kanon |

**Korunanlar:**
- Top-level `max_workers` — user custom override
- Mode preset `max_workers` (8/5/3/10) — Deckent standart modelleri

### System Capacity Auto-Detection (MVP)

`deckent init` sirasinda otomatik tespit:
- RAM < 4GB -> 1 worker
- RAM 4-8GB -> 2 worker
- RAM 8-16GB -> 3-4 worker (CPU'ya bagli)
- RAM > 16GB -> min(cpuCores-2, 8) worker

Backend: win32 -> subprocess, Docker varsa -> docker, yoksa -> subprocess.

### Self-Healing Corrupted Config

Bozuk JSON config dosyasi tespit edildiginde:
1. Bozuk dosya `.corrupted.<timestamp>.bak` olarak yedeklenir
2. Fresh default config yazilir
3. stderr'de uyari mesaji gosterilir

---

_Son guncelleme: Sprint 150 (2026-04-21)_
_Toplam key sayisi: ~65_
_ADR referanslari: ADR-004 (3-layer merge), ADR-023 (tier generalization)_
