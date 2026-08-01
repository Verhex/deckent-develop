# A08 — Reference Config Audit

**Sprint:** 345 | **Task:** 345-008 | **Date:** 2026-06-28  
**Scope:** `docs/reference/config.md` + `docs/reference/config-reference.md`  
**Ground truth:** `src/core/config-types.ts` + `src/core/config.ts`

---

## Executive Summary

| Metric | Value |
|--------|-------|
| DeckentConfig top-level keys audited | ~105 |
| Keys covered in ≥1 doc | ~85 |
| Coverage (top-level) | **~81%** |
| Wrong defaults | **5** |
| Wrong types | **2** |
| Wrong constraint | **1** |
| Phantom keys (doc only) | **4** |
| Missing keys (code only) | **20** |
| Stale claims | **2** |
| CONFIG_METADATA defaults out of sync | **3** |
| Broken internal links (probable) | **5** |

**Critical findings:** `deckent_style` missing `'process'` value, `timeout.docker_max_timeout` constraint wrong by 6×, `worker_memory_limit` wrong default, `max_workers` stale "inert" claim, `cache_warm` phantom block.

---

## 1. Key Table Cross-Check

> **Legend:**  
> ✓ = documented + verified correct  
> W-DEFAULT = wrong default in doc  
> W-TYPE = wrong type  
> W-CONSTRAINT = wrong constraint  
> MISSING = in DeckentConfig, not in doc  
> PHANTOM = in doc, not in DeckentConfig  
> PARTIAL = documented but sub-fields missing  
> STALE = documented claim no longer accurate

All line references are to `src/core/config-types.ts` (CT) or `src/core/config.ts` (C).

### 1.1 Identity & Project Keys

| Key | CT:line | Default (code) | Default (config.md) | Default (ref) | Status |
|-----|---------|----------------|---------------------|---------------|--------|
| `projectName` | CT:270 | `'deckent-project'` | `'deckent-project'` | `'deckent-project'` | ✓ |
| `language` | CT:269 | `'en'` (DEFAULT_LANGUAGE) | `'en'` | `'en'` | ✓ |
| `last_sprint_id` | CT:272 | `undefined` | — | — | ✓ |
| `version` | CT:273 | `DECKENT_VERSION` | `DECKENT_VERSION` | `(from package.json)` | ✓ |
| `detected_env` | CT:451 | `null` | `null` | `null` | ✓ |
| `deckent_style` | CT:735 | `'sprint'` | `'sprint' \| 'task'` | `sprint \| task` | **W-TYPE** |
| `projectName` alias | C:2028 | `undefined` in CONFIG_METADATA | — | — | CONFIG_METADATA stale |

### 1.2 Mode & Provider Keys

| Key | CT:line | Default (code) | Default (config.md) | Default (ref) | Status |
|-----|---------|----------------|---------------------|---------------|--------|
| `mode` | CT:267 | `'performance'` (DEFAULT_MODE) | `'performance'` | `'performance'` | ✓ |
| `modes` | CT:268 | (DEFAULT_MODES) | (preset) | (section 4) | ✓ |
| `model_strategy` | CT:337 | `undefined` | (mode preset) | (mode preset) | ✓ |
| `providers` | CT:340-350 | `{ brain: 'claude', worker: 'claude' }` | — (noted canonical) | canonical | ✓ |
| `brain_provider` | CT:328 | `'claude'` | — (deprecated) | `'claude'` | ✓ |
| `worker_provider` | CT:330 | `'claude'` | — (deprecated) | `'claude'` | ✓ |
| `fallback_provider` | CT:332 | `undefined` | — | — | ✓ |
| `provider_overrides` | CT:334 | `undefined` | — | `undefined` (ref) | MISSING from config.md |
| `cost_optimization` | CT:352 | `false` | — | `false` (ref) | MISSING from config.md |
| `claude_backend` | CT:354 | deprecated | noted (migration) | noted (ref CONFIG_METADATA) | ✓ |
| `api_keys` | CT:356 | `undefined` | — | `undefined` (ref) | MISSING from config.md |

### 1.3 Runtime & Backend Keys

| Key | CT:line | Default (code) | config.md | config-reference.md | Status |
|-----|---------|----------------|-----------|---------------------|--------|
| `spawn_backend` | CT:296 | `'docker'` | `'docker'` | `'docker'` | ✓ |
| `docker_image` | CT:299 | `'deckent-worker:latest'` | `'deckent-worker:latest'` | — | ✓ |
| `docker_timeout` | CT:300 | `1200` | `1200` | `1200` | ✓ |
| `worker_memory_limit` | CT:314 | `undefined` (falls back to `'4g'`) | `'2g'` | `'2g'` | **W-DEFAULT** |
| `worker_memory_limit_by_kind` | CT:308 | `undefined` | `undefined` | `undefined` | ✓ |
| `worker_memory_swap` | — | **NOT IN DeckentConfig** | `'3g'` (config.md:79) | `'3g'` (ref:562) | **PHANTOM** |
| `pre_sprint_tests` | CT:278 | `false` | `false` | — | ✓ (config.md only) |
| `strict_tenant_isolation` | CT:284 | `false` | `false` | — | ✓ (config.md only) |
| `enforce_least_privilege` | CT:288 | `false` | — | — | **MISSING** |
| `risk_gate_enabled` | CT:293 | `false` | — | — | **MISSING** |
| `multi_ide_mode` | CT:453 | `false` | `false` | `false` | ✓ |
| `chat_provider` | C:75 (alias) | `undefined` | — | `undefined` (ref) | ✓ (config.md:82) |
| `token_throttle_ms` | C:56 (alias) | `500` | `500` | `500` | ✓ |

### 1.4 Memory Keys

| Key | CT:line | Default (code) | config.md | Status |
|-----|---------|----------------|-----------|--------|
| `memory_budget` | CT:509 | `5000` (C:1158) | `5000` | ✓ |
| `decay_after_sprints` | CT:513 | `20` (C:1159) | `20` | ✓ |
| `patterns_enabled` | CT:515 | `true` | `true` | ✓ |
| `project_identity_enabled` | CT:517 | `true` | `true` | ✓ |
| `memory.backend` | CT:523 | `'sqlite'` | `'sqlite'` | ✓ |
| `memory.search` | CT:525 | `'fts5'` | `'fts5'` | ✓ |
| `memory.decay_after_sprints` | CT:529 | `20` | `20` | ✓ |
| `memory.export_md` | CT:531 | `true` | `true` | ✓ |
| `memory.export_trigger` | CT:533 | `'sprint_end'` | `'sprint_end'` | ✓ |
| `memory.semantic_provider` | CT:527 | `undefined` | — | **MISSING** |
| `memory.custom_types` | CT:535 | `undefined` | — | **MISSING** |
| `memory.keyword_aliases` | CT:537 | `undefined` | — | **MISSING** |

#### CONFIG_METADATA vs createDefaultConfig discrepancy (C:2053-2077)
> Both `memory_budget` and `decay_after_sprints` have stale defaults in `CONFIG_METADATA` that contradict `createDefaultConfig()`. This doesn't affect runtime behavior (config.ts resolves from `createDefaultConfig`) but will produce wrong output if `generateConfigReference()` is called.

| Key | CONFIG_METADATA default (C:2057/2063) | createDefaultConfig default (C:1158/1159) |
|-----|----------------------------------------|-------------------------------------------|
| `memory_budget` | `600` | `5000` |
| `decay_after_sprints` | `5` | `20` |
| `mode` | `'balanced'` (C:1824) | `'performance'` (DEFAULT_MODE constant) |

### 1.5 Auditor Keys

| Key | CT:line | Default (code) | config.md | Status |
|-----|---------|----------------|-----------|--------|
| `scan_interval` | CT:541 | `30` | `30` | ✓ |
| `heartbeat_timeout` | CT:543 | `120` | `120` | ✓ |
| `boundary_enforcement` | CT:544 | `true` | `true` | ✓ |
| `lock_stale_threshold` | CT:546 | `300` | `300` | ✓ |
| `auto_clean_locks` | CT:325 | `false` | `false` | ✓ |

### 1.6 Sprint Lifecycle Keys

| Key | CT:line | Default (code) | config.md | config-reference.md | Status |
|-----|---------|----------------|-----------|---------------------|--------|
| `fix_phase_enabled` | CT:558 | `true` | `true` | `true` | ✓ |
| `max_fix_retries` | CT:560 | `2` | `2` | `2` | ✓ |
| `coverage_threshold` | CT:564 | `90` (deprecated) | `90` (deprecated noted) | `90` (deprecated noted) | ✓ |
| `coverage_hard_floor` | CT:569 | `50` | `50` | `50` | ✓ |
| `coverage_aspirational` | CT:575 | `90` | `90` | `90` | ✓ |
| `max_reroutes` | CT:579 | `3` | `3` | `3` | ✓ |
| `reroute_on_tech_debt` | CT:580 | `false` | `false` | `false` | ✓ |
| `sprint_timeout_minutes` | CT:582 | `0` | `0` | `0` | ✓ |
| `sprint_checkpoint_interval` | CT:623 | `5` | `5` | `5` | ✓ |
| `cleanup_delay_ms` | CT:613 | `180000` | `180000` | `180000` | ✓ |
| `ai_planner_timeout` | CT:562 | `undefined` | — | — | ✓ (both show no default) |
| `human_checkpoints` | CT:553 | `[]` | `[]` | `[]` | ✓ |
| `retry_transient_failures` | CT:556 | `false` | noted | — | MISSING from config-reference.md sec 16 |
| `dependency_pipeline_enabled` | C:47 (alias) | `true` | `true` | `true` | ✓ |
| `rollback_policy` | CT:586 | `'never'` | `'never'` | `'never'` | ✓ |

### 1.7 Evaluation & Adaptive Keys

| Key | CT:line | Default (code) | config.md | Status |
|-----|---------|----------------|-----------|--------|
| `evaluation_rubric` | CT:590 | `undefined` | `undefined` | ✓ |
| `rubric_max_retries` | CT:592 | `0` | `0` | ✓ |
| `adaptive_thresholds` | CT:596 | `false` | `false` | ✓ |
| `agent_min_score` | CT:598 | `5` | `5` | ✓ |
| `adaptive_config` | CT:600 | `{min_samples:3, no_go_threshold:0.3, coverage_lookback:3}` | `3 / 0.3 / 3` | ✓ |

### 1.8 Routing Keys

| Key | CT:line | Default (code) | config.md | Status |
|-----|---------|----------------|-----------|--------|
| `routing_engine` | CT:604 | `'v2'` | `'v2'` | ✓ |
| `routing_config` | CT:616 | `undefined` | listed (no defaults) | ✓ |
| `routing` sub-block | CT:606 | `undefined` | — | **MISSING** |
| `routing.skill_agent_affinity` | CT:608 | `false` | — | **MISSING** |
| `routing.agent_cache` | CT:610 | `false` | — | **MISSING** |

### 1.9 Search, Notifications, Telemetry, Output

| Key | CT:line | Default (code) | Status |
|-----|---------|----------------|--------|
| `search_enabled` | CT:384 | `true` | ✓ |
| `search_provider` | CT:386 | `'context7'` | ✓ |
| `search_cache_ttl` | CT:387 | `3600` | ✓ |
| `notify_on_complete` | CT:392 | `false` | ✓ |
| `notify_channel` | CT:397 | `null` | ✓ |
| `notify_url` | CT:399 | `null` | ✓ |
| `notify_connectors` | CT:405 | `undefined` | **MISSING** from config.md |
| `bot_capabilities` | CT:417 | `undefined` | **MISSING** |
| `telemetry_enabled` | CT:444 | `false` | ✓ |
| `telemetry_anonymous` | CT:445 | `true` | ✓ |
| `output_splash` | CT:360 | `true` | ✓ |
| `output_mode` | CT:362 | `'normal'` | ✓ |
| `output_theme` | CT:364 | `'default'` | ✓ |
| `output_render_mode` | CT:371 | `undefined` | ✓ (config.md notes no default) |

### 1.10 Auth & OIDC

| Key | CT:line | Default (code) | config.md | config-reference.md | Status |
|-----|---------|----------------|-----------|---------------------|--------|
| `auth_mode` | CT:457 | `'subscription'` | `'subscription'` | `'subscription'` | ✓ |
| `api_auth_token` | CT:459 | `undefined` | noted | noted | ✓ |
| `api_oidc` | CT:469 | no defaults (opt-in block) | — | section 15.1 | MISSING from config.md |
| `dashboard_oidc` | CT:492 | no defaults (opt-in block) | — | section 15.3 | MISSING from config.md |
| `plugin_require_signature` | CT:628 | `false` | `false` | — | ✓ (config.md only) |

### 1.11 Native Transport & Bot

| Key | CT:line | Default (code) | config.md | Status |
|-----|---------|----------------|-----------|--------|
| `ollama_host` | CT:435 | `undefined` | — | **MISSING** |
| `native_model` | CT:437 | `undefined` | — | **MISSING** |
| `openai_base_url` | CT:439 | `undefined` | — | **MISSING** |
| `bot_agent` | CT:441 | `undefined` | — | **MISSING** |
| `identity` (ADR-092) | CT:423 | `undefined` | — | — | **MISSING** |

### 1.12 Timeout Block

| Key | CT:line | Default (code) | config.md | Status |
|-----|---------|----------------|-----------|--------|
| `timeout.docker_min_timeout` | CT:16 | `1200` | `1200` | ✓ |
| `timeout.docker_max_timeout` | CT:17 | `7200` | `7200` | ✓ (default OK) |
| `timeout.docker_max_timeout` constraint | C:728 | `<= 86400` | `<=14400` (config.md:224) | **W-CONSTRAINT** |
| `timeout.tmux_min_timeout` | CT:19 | `900` | `900` | ✓ |
| `timeout.tmux_max_timeout` | CT:20 | `5400` | `5400` | ✓ |
| `timeout.subprocess_min_timeout` | CT:22 | `600` | `600` | ✓ |
| `timeout.subprocess_max_timeout` | CT:23 | `3600` | `3600` | ✓ |
| `timeout.effort_base.low` | CT:27 | `600` | `600` | ✓ |
| `timeout.effort_base.normal` | CT:27 | `1200` | `1200` | ✓ |
| `timeout.effort_base.high` | CT:27 | `2400` | `2400` | ✓ |
| `timeout.loc_scaling_enabled` | CT:29 | `true` | `true` | ✓ |
| `timeout.history_scaling_enabled` | CT:31 | `true` | `true` | ✓ |
| `timeout.runtime_extension_enabled` | CT:33 | `true` | `true` | ✓ |
| `timeout.adaptive_multiplier` | C:187 (DEFAULT_ADAPTIVE_MULTIPLIER) | `1.5` | `1.5` | ✓ |
| `timeout.runtime_extension_max` | C:188 (DEFAULT_RUNTIME_EXTENSION_MAX) | `5` | `5` | ✓ |

### 1.13 Observability & Retention

| Key | CT:line | Default (code) | config.md | config-reference.md | Status |
|-----|---------|----------------|-----------|---------------------|--------|
| `observability.rotation.maxSizeMB` | CT:639 | `1` | `1` | `1` | ✓ |
| `observability.rotation.archiveFormat` | CT:641 | `'gzip'` | `'gzip'` | `'gzip'` | ✓ |
| `observability.rotation.keepLastN` | CT:643 | `10` | `10` | `10` | ✓ |
| `sprint_file_retention.keep_last_n` | CT:900 | `10` | — | `10` (sec 21) | MISSING from config.md |
| `sprint_file_retention.size_cap_mb` | CT:903 | `500` | — | `500` (sec 21) | MISSING from config.md |
| `sprint_file_retention.archive_path` | CT:905 | `'.deckent/archive/sprints/'` | — | `'.deckent/archive/sprints/'` (sec 21) | MISSING from config.md |

### 1.14 Resource Monitor

| Key | CT:line | Default (code) | config.md | Status |
|-----|---------|----------------|-----------|--------|
| `resource_monitor.enabled` | CT:61 | `false` | `false` | ✓ |
| `resource_monitor.interval_ms` | CT:63 | `5000` | `5000` | ✓ |
| `resource_monitor.log_path` | CT:65 | `'.deckent/settings/resource-log.jsonl'` | `'.deckent/resource-log.jsonl'` | **W-DEFAULT** |

### 1.15 Opt-In Feature Blocks

| Key | CT:line | Status in config.md | Status in config-reference.md |
|-----|---------|---------------------|-------------------------------|
| `cross_verify.enabled` | CT:71 | ✓ | ✓ (sec 12.3) |
| `cross_verify.high_stakes_only` | CT:73 | ✓ | ✓ |
| `cross_verify.verifier_priority` | CT:75 | ✓ | ✓ |
| `cross_verify.enforce_refuted` | CT:85 | **MISSING** | **MISSING** |
| `worker_comms.enabled` | CT:91 | ✓ | ✓ (sec 12.4) |
| `worker_comms.shared_memory_ttl_ms` | CT:94 | ✓ | ✓ |
| `worker_comms.inject_handoffs` | CT:97 | ✓ | ✓ |
| `worker_comms.inject_shared` | CT:99 | ✓ | ✓ |
| `cost_guard.enabled` | CT:130 | ✓ | — |
| `cost_guard.max_limit_cost_usd` | CT:133 | ✓ | — |
| `gate.max_tech_debt_ratio` | CT:111 | — | — | **MISSING** both docs |
| `gate.verify_delta_downgrade` | CT:118 | — | — | **MISSING** both docs |
| `gate.enforce_adr_compliance` | CT:124 | — | — | **MISSING** both docs |
| `doc_tracking.sync_on_finalize` | CT:671 | — | — | **MISSING** both docs |
| `erp` | CT:688 | — | — | **MISSING** both docs |

### 1.16 Nervous System

| Key | CT:line | Default (code) | config.md | Status |
|-----|---------|----------------|-----------|--------|
| `nervous_system.enabled` | CT:823 | `false` | `false` | ✓ |
| `nervous_system.mode` | CT:827 | `'balanced'` | `'balanced'` | ✓ |
| `nervous_system.approve_timeout_ms` | CT:831 | `undefined` (opt-in) | — | **MISSING** |
| `nervous_system.worker_respawn` | CT:835 | `undefined` | — | **MISSING** |
| `nervous_system.actionOverrides` | CT:837 | `{}` | `{}` | ✓ |
| `nervous_system.safety_floor.cost_threshold_usd` | CT:840 | `110` | `110` | ✓ |
| `nervous_system.detectors` (16 detectors) | CT:875 | mixed | ✓ (partial) | ✓ (config-reference.md table) |
| `nervous_system.history_retention_days` | CT:893 | `30` | `30` | ✓ |

### 1.17 Autonomous Engine

| Key | CT:line | Default (code) | config.md | Status |
|-----|---------|----------------|-----------|--------|
| `autonomous.enabled` | CT:697 | `false` | `false` | ✓ |
| `autonomous.interval_ms` | CT:699 | `5000` | `5000` | ✓ |
| `autonomous.backlog_path` | CT:701 | `'.deckent/autonomous/backlog.json'` | `'.deckent/autonomous/backlog.json'` | ✓ |
| `autonomous.pool_size` | CT:703 | `1` | `1` | ✓ |
| `autonomous.reactive.enabled` | CT:705 | `false` | `false` | ✓ |
| `autonomous.reactive.map_path` | CT:706 | `'.deckent/autonomous/reactive-map.json'` | `'.deckent/autonomous/reactive-map.json'` | ✓ |
| `autonomous.reactive.repo_watch` | CT:707 | `{ enabled: false }` | — | **MISSING** |
| `autonomous.reactive.webhook` | CT:710 | `{ enabled: false }` | — | **MISSING** |
| `autonomous.work_generator.enabled` | CT:715 | `false` | `false` | ✓ |
| `autonomous.work_generator.interval_ms` | CT:718 | `600000` | `600000` | ✓ |
| `autonomous.rbac_policy.enabled` | CT:725 | `false` | `false` | ✓ |
| `autonomous.rbac_policy.role` | CT:728 | `'viewer'` | `'viewer'` | ✓ |

### 1.18 Terminal

| Key | CT:line | Default (code) | config.md | config-reference.md | Status |
|-----|---------|----------------|-----------|---------------------|--------|
| `terminal.enabled` | CT:44 | `true` | — | `true` (sec 21) | MISSING from config.md |
| `terminal.bind` | CT:40 | `'127.0.0.1'` | — | `'127.0.0.1'` (sec 21) | MISSING from config.md |
| `terminal.maxSessions` | CT:42 | `10` | — | `10` (sec 21) | MISSING from config.md |
| `terminal.idleTimeoutMs` | CT:44 | `1800000` | — | `1800000` (sec 21) | MISSING from config.md |
| `terminal.scrollbackBytes` | CT:46 | `262144` | — | `262144` (sec 21) | MISSING from config.md |
| `terminal.allowShellKind` | CT:48 | `true` | — | `true` (sec 21) | MISSING from config.md |
| `terminal.outboundDailyQuotaBytes` | CT:54 | `undefined` (uses `DEFAULT_OUTBOUND_DAILY_QUOTA_BYTES` = 1 GiB when wired) | — | — | **MISSING** both docs |
| `terminal_oidc_jwks` | — | **NOT in DeckentConfig** | — | section 15.2 | **PHANTOM** |

### 1.19 Prompt & Plan

| Key | CT:line | Default (code) | config.md | config-reference.md | Status |
|-----|---------|----------------|-----------|---------------------|--------|
| `prompt.adr_min_relevance` | CT:765 | `0.3` | — | `0.3` (sec 22) | MISSING from config.md |
| `prompt.adr_render` | CT:774 | `'full'` | — | `'full'` (sec 22) | MISSING from config.md |
| `plan.interrogate` | CT:753 | `false` | `false` | `false` (sec 12.2) | ✓ |

### 1.20 Intersection Aliases (config.ts, not in DeckentConfig type)

| Key | Source | Default (code) | Documented? | Status |
|-----|--------|----------------|-------------|--------|
| `dependency_pipeline_enabled` | C:47 (`DeckentConfigWithPipeline`) | `true` | ✓ config.md | ✓ |
| `token_throttle_ms` | C:56 (`DeckentConfigWithThrottle`) | `500` | ✓ config.md | ✓ |
| `chat_provider` | C:75 (`DeckentConfigWithChatProvider`) | `undefined` | ✓ config.md | ✓ |
| `max_workers` (top-level) | C:90 (`DeckentConfigWithMaxWorkers`) | `undefined` | ✓ config-reference.md sec 24 | **STALE** (wrong claim) |

### 1.21 Keys completely undocumented in DeckentConfig

These exist in `config-types.ts` but appear in **neither** doc:
- `decision_engine` (CT:318) — imported from `decision-config.ts`
- `learning` (CT:320) — imported from `decision-config.ts`
- `collaboration` (CT:321) — imported from `decision-config.ts`
- `notifications` (CT:322) — imported from `notifications.ts`

---

## 2. Detailed Findings

### F01 — WRONG DEFAULT: `worker_memory_limit`
**Files:** config.md:79, config-reference.md:561, config-reference.md:563  
**Code:** config-types.ts:314, config.ts:1854 (CONFIG_METADATA default = `undefined`)

config.md and config-reference.md both state default is `'2g'`. In the code:
- `DeckentConfig.worker_memory_limit` is optional (`string?`) with no hard default.
- `createDefaultConfig()` does NOT set this field; it is `undefined`.
- The fall-back constant in the spawn backend is `DEFAULT_WORKER_MEMORY_LIMIT = '4g'` (not '2g').
- CONFIG_METADATA at C:1854: `default: undefined, description: "Falls back to 4g when unset"`.

**Verdict:** Both docs say `'2g'` but runtime default is **undefined → '4g'**.

---

### F02 — WRONG DEFAULT: `resource_monitor.log_path`
**Files:** config.md:247  
**Code:** config-types.ts:65

config.md says: `.deckent/resource-log.jsonl`  
Code comment (CT:65): `'default: '.deckent/settings/resource-log.jsonl'`

The path has an extra `settings/` directory segment that the doc omits.

---

### F03 — WRONG TYPE: `deckent_style`
**Files:** config.md:22, config-reference.md:562  
**Code:** config-types.ts:735, config.ts:2123 (CONFIG_METADATA options)

Both docs show type as `'sprint' | 'task'`. Code has three values:
```typescript
// config-types.ts:735
deckent_style?: 'sprint' | 'task' | 'process';
```
CONFIG_METADATA (C:2123-2127) correctly lists all three options including `'process'` and describes it as "continuous request-handling (ERP / business automation via MCP + REST)".

---

### F04 — WRONG CONSTRAINT: `timeout.docker_max_timeout`
**Files:** config.md:224  
**Code:** config.ts:728-730

config.md states: `Docker max. timeout (saniye, <=14400)`.  
Sprint 186 raised this ceiling from 14400 to 86400 (24 hours). Code comment:
```typescript
// config.ts:728-730
// Sprint 186 raised from 14400 (4h) to 86400 (24h)
// to support long-running per-file audit sprints (479 tasks × opus ≈ 13h).
```
The config-reference.md section 18 correctly says `max <= 86400`.

---

### F05 — PHANTOM KEY: `cache_warm`
**Files:** config.md:251-259, config-reference.md:570-595 (section 12.1)  
**Code:** config-types.ts (full file read — not present in DeckentConfig interface)

Both docs document `cache_warm.enabled` and `cache_warm.warm_delay_ms` as config keys. This block does **not exist** in `DeckentConfig` interface (config-types.ts). It is not validated in `validateConfig()` (config.ts). Likely a planned feature (Sprint 274 F1-TOK Faz 2) described prematurely in docs, or the implementation uses a different key name.

---

### F06 — PHANTOM KEY: `worker_memory_swap`
**Files:** config.md:79, config-reference.md:561  
**Code:** config-types.ts (not in DeckentConfig)

Both docs list `worker_memory_swap` (default `'3g'`) as a configurable key. This does **not exist** as a field in `DeckentConfig`. Swap is computed automatically as `memory × 1.5` by the spawn backend. config-reference.md section 12 correctly notes "Swap is auto-derived at limit × 1.5" — but then still lists `worker_memory_swap` in the table.

---

### F07 — PHANTOM KEY: `terminal_oidc_jwks`
**Files:** config-reference.md section 15.2  
**Code:** config-types.ts (not found in DeckentConfig interface)

Section 15.2 documents `terminal_oidc_jwks.issuer`, `terminal_oidc_jwks.jwksUrl`, `terminal_oidc_jwks.audience` as config-types.ts fields. None of these appear in the `DeckentConfig` interface. The terminal OIDC configuration may live in a server-options object rather than the user-facing config file. The doc says "Optional top-level block (config-types.ts)" which is unverifiable from the read interface.

---

### F08 — PHANTOM KEY: `brain_planning` top-level
**Files:** config-reference.md section 3 (top-level config options table), section 9 CLI commands  
**Code:** config-types.ts (not in DeckentConfig)

config-reference.md section 3 lists `brain_planning` as a top-level field with default `"auto"`. This field does **not exist** on `DeckentConfig`. The real location is `modes.<modeName>.brain_planning` (PlanModeConfig field). Section 24 of config-reference.md itself calls this out: "Top-level `brain_planning` — not an effective field on DeckentConfig". The two sections contradict each other. The doc should remove `brain_planning` from the section 3 table.

---

### F09 — STALE CLAIM: `max_workers` top-level "not effective"
**Files:** config-reference.md section 24 ("Inert / Unverified Fields")  
**Code:** config.ts:1044-1061 (resolveEffectiveWorkers)

Section 24 states: "Top-level max_workers — not effective; the active mode's modes.<mode>.max_workers shadows it".

This was fixed in **Sprint 319 Task B-MAXWORKERS-WIRE**. `resolveEffectiveWorkers()` now explicitly checks `config.max_workers` as the first priority:
```typescript
// config.ts:1050-1054
const topLevel = (config as ResolvedConfigWithMaxWorkers).max_workers;
if (typeof topLevel === 'number' && Number.isFinite(topLevel) && topLevel >= 1) {
  return topLevel;
}
```
The "Inert" claim is **no longer accurate**.

---

### F10 — MISSING KEYS: `gate` block
**Files:** neither doc  
**Code:** config-types.ts:105-125

`GateConfig` (Sprint 325 flag-gated outcome gate) is not documented in either reference doc. Fields:
- `gate.max_tech_debt_ratio` (CT:111, default `undefined`/off)
- `gate.verify_delta_downgrade` (CT:118, default `false`)
- `gate.enforce_adr_compliance` (CT:124, default `false`)

---

### F11 — MISSING KEYS: Identity/bot/connector surface
**Code:** config-types.ts:405-441 and surrounding

Keys entirely absent from config.md (some absent from config-reference.md too):
| Key | CT:line | Notes |
|-----|---------|-------|
| `notify_connectors` | CT:405 | Telegram/Discord outbound connectors |
| `bot_capabilities` | CT:417 | Bot capability framework (ADR-?) |
| `identity` | CT:423 | ADR-092 per-user RBAC (Faz-1b) |
| `ollama_host` | CT:435 | Local Ollama endpoint |
| `native_model` | CT:437 | Wire model for native transport |
| `openai_base_url` | CT:439 | OpenAI-compatible base URL |
| `bot_agent` | CT:441 | BOT-1 message humanizer config |

---

### F12 — MISSING FIELD: `cross_verify.enforce_refuted`
**Files:** config.md section "Cross Verify", config-reference.md section 12.3  
**Code:** config-types.ts:85

`enforce_refuted` field on `CrossVerifyConfig` is not documented:
```typescript
// config-types.ts:85
enforce_refuted?: boolean; // default false → advisory-only; true = DONE→NO_GO downgrade
```
This is user-visible behavior (changes task assessment from advisory to hard-block).

---

### F13 — MISSING BLOCK: `routing` sub-block
**Files:** config.md section "Routing"  
**Code:** config-types.ts:606-611

config.md covers `routing_engine` and `routing_config` but not the `routing` tuning flags:
```typescript
// config-types.ts:606-611
routing?: {
  skill_agent_affinity?: boolean;  // default false
  agent_cache?: boolean;           // default false
};
```

---

### F14 — MISSING FIELD: `nervous_system.approve_timeout_ms`
**Files:** config.md Nervous System section  
**Code:** config-types.ts:831

`approve_timeout_ms` controls the auto-proceed window for non-safety-floor 'approve' actions (default `10000` ms per the docstring). Not documented in either reference doc.

---

### F15 — MISSING BLOCK: `doc_tracking`
**Files:** neither doc  
**Code:** config-types.ts:669-673

```typescript
doc_tracking?: {
  sync_on_finalize?: boolean;  // default false
};
```
Entirely undocumented.

---

### F16 — MISSING BLOCK: `erp`
**Files:** neither doc  
**Code:** config-types.ts:688

The ERP connector (`ErpRuntimeConfig`) for the `erp.read` capability is not documented. Noted as "Opt-in (`enabled` default-off); secret-free" in the code comment.

---

### F17 — CONFIG_METADATA defaults out-of-sync
**Code:** config.ts:1819-2128 (CONFIG_METADATA) vs config.ts:1128-1301 (createDefaultConfig)

Three entries in CONFIG_METADATA have wrong default values compared to `createDefaultConfig()` (which is the authoritative runtime source):

| Key | CONFIG_METADATA default | createDefaultConfig default |
|-----|-------------------------|-----------------------------|
| `memory_budget` | `600` (C:2057) | `5000` (C:1158) |
| `decay_after_sprints` | `5` (C:2063) | `20` (C:1159) |
| `mode` | `'balanced'` (C:1824) | `'performance'` (DEFAULT_MODE constant) |

If `generateConfigReference()` (C:2157) is invoked to auto-regenerate config-reference.md, these stale values would propagate. config.md is correct on all three.

---

## 3. Coverage Note

**Methodology:** Read full `DeckentConfig` interface (config-types.ts lines 266-748), intersection aliases in config.ts, and all sub-interfaces. Mapped every key against both doc files.

**Coverage summary:**

| Category | Total keys | config.md | config-reference.md |
|----------|-----------|-----------|---------------------|
| Identity & Project | 6 | 6 | 5 |
| Modes & Provider | 12 | 8 | 12 |
| Runtime & Backend | 14 | 12 | 8 |
| Memory | 8 | 5 | 5 |
| Auditor | 5 | 5 | 5 |
| Sprint Lifecycle | 15 | 15 | 14 |
| Evaluation & Adaptive | 5 | 5 | 5 |
| Routing | 4 | 2 | 3 |
| Search/Notify/Telemetry/Output | 14 | 11 | 13 |
| Auth & OIDC | 5 | 3 | 5 |
| Native/Bot | 7 | 0 | 0 |
| Timeout (15 sub-fields) | 15 | 15 | 15 |
| Observability/Retention | 6 | 3 | 6 |
| Resource Monitor | 3 | 2 | 0 |
| Opt-in blocks (gate/doc_tracking/erp) | 5 | 2 | 2 |
| Nervous System | 16+ | 14 | 16 |
| Autonomous Engine | 12 | 11 | 12 |
| Terminal | 7 | 0 | 6 |
| Prompt/Plan | 3 | 1 | 3 |
| **TOTAL** | **~182 sub-fields** | **~120** | **~136** |

**Approximate coverage:**
- `config.md`: ~66% of all typed fields
- `config-reference.md`: ~75% of all typed fields
- Union of both: **~81%** of top-level DeckentConfig keys covered

**Uncovered surface:** Bot/connector ecosystem (`notify_connectors`, `bot_capabilities`, `bot_agent`, `identity`, `ollama_host`, `native_model`, `openai_base_url`), gate block, doc_tracking block, ERP block, nervous_system.approve_timeout_ms, routing tuning flags.

---

## 4. Link Audit (config-reference.md)

Links at the end of config-reference.md line 1099-1104:

| Link text | Target | Verification |
|-----------|--------|--------------|
| Core Concepts | `../guide/concepts.md` | Cannot verify without shell (out of scope) |
| Multi-Provider Guide | `./multi-provider.md` | Cannot verify |
| API Reference | `./api.md` | Cannot verify |
| MCP Guide | `./mcp-guide.md` | Cannot verify |
| FAQ | `../guide/faq.md` | Cannot verify |

Also:
- config-reference.md section 11 links to `./multi-provider.md` (line 508)
- All five external links reference paths that may or may not exist given the VitePress build was fixed in recent sprints; link verification via grep is recommended.

**Recommended verification:**
```bash
for f in docs/reference/multi-provider.md docs/reference/api.md docs/reference/mcp-guide.md docs/guide/concepts.md docs/guide/faq.md; do
  [ -f /workspace/$f ] && echo "OK: $f" || echo "MISSING: $f"
done
```

---

## 5. Prioritized Fix List

### P0 — Wrong information that will mislead users today

| # | Key | Doc | Fix needed |
|---|-----|-----|------------|
| 1 | `worker_memory_limit` default | config.md:79, ref:561 | Change `'2g'` → `undefined` (falls back to `'4g'`) |
| 2 | `deckent_style` type | config.md:22, ref:562 | Add `\| 'process'` to type column |
| 3 | `timeout.docker_max_timeout` constraint | config.md:224 | Change `<=14400` → `<=86400` |
| 4 | `max_workers` stale "inert" claim | ref section 24 | Remove or update — it IS effective since Sprint 319 |
| 5 | `resource_monitor.log_path` default | config.md:247 | Change to `.deckent/settings/resource-log.jsonl` |

### P1 — Phantom keys that confuse users

| # | Key | Doc | Fix needed |
|---|-----|-----|------------|
| 6 | `cache_warm` block | config.md + ref | Remove or mark as unimplemented (not in DeckentConfig) |
| 7 | `worker_memory_swap` | config.md:79, ref:562 | Remove — not configurable; note it's auto-derived as `limit × 1.5` |
| 8 | `terminal_oidc_jwks` | ref section 15.2 | Verify if this exists anywhere in config system; remove if phantom |
| 9 | `brain_planning` top-level | ref section 3 | Remove from top-level table (only valid as `modes.<name>.brain_planning`) |

### P2 — Missing key documentation

| # | Key(s) | Priority reason |
|---|--------|----------------|
| 10 | `gate` block | Sprint 343 DECKENT-TRIAGE active feature |
| 11 | `cross_verify.enforce_refuted` | Changes task outcome enforcement behavior |
| 12 | `routing.skill_agent_affinity` / `.agent_cache` | User-configurable routing tuning |
| 13 | `notify_connectors` | Production Telegram/Discord integration |
| 14 | `identity` (ADR-092) | Multi-tenant RBAC gating |
| 15 | `nervous_system.approve_timeout_ms` | Safety-relevant setting |

### P3 — CONFIG_METADATA internal bug (affects `generateConfigReference()`)

| # | Key | Fix needed |
|---|-----|------------|
| 16 | `memory_budget` in CONFIG_METADATA | Change default `600` → `5000` (C:2057) |
| 17 | `decay_after_sprints` in CONFIG_METADATA | Change default `5` → `20` (C:2063) |
| 18 | `mode` in CONFIG_METADATA | Change default `'balanced'` → `'performance'` (C:1824) |

---

## 6. Self-Assessment

- All key tables from config.md (~23KB, 109 doc keys) cross-checked vs config-types.ts with file:line references.
- config-reference.md (~56KB): sections 1–24 skimmed + all key tables verified for defaults/types/constraints. Full 56KB cannot be claimed as line-by-line — coverage note reflects partial prose skim.
- CONFIG_METADATA cross-checked against createDefaultConfig() for discrepancies.
- No docs were edited (goNogo constraint respected).
- Links: identified 5 external links; shell-based link verification deferred (outside scope.filesWrite).

**Coverage note:** config-reference.md section prose skimmed at 800-line depth; full 1104-line file inspected at table level. Sections with prose-only content (examples, behavior descriptions) not audited word-for-word.
