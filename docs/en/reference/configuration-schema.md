# Configuration schema: all default fields

## Product-user perspective

Deckent's authored JSON configuration has three layers: built-in defaults, platform-resolved global config, and project `.deckent/config.json`. Environment overrides then supersede selected merged fields before aliases, mode strategy, and validation produce `ResolvedConfig`. [Evidence: `src/core/config.ts:1865-2021`]

Use `deckent config` to print the effective merged view, `deckent config --raw` for project JSON, `deckent config get <path>` for one dot path, and `deckent config set <path> <value>` to persist a project override. There is no `config show` subcommand: both `config show` and `config show --json` were executed and exited 1. [Evidence: real-binary outputs, 2026-08-01; `src/cli/commands/config.ts:72-108`]

The current local effective snapshot is recorded in [Configuration](../configuration.md); the table below is the complete **default schema**, not the local effective result. It contains 164 recursive leaves read from the built `createDefaultConfig()` after the owner ran `npm run build:all`. `unset` means the optional field has no default value; it does not mean every effective configuration omits it. [Evidence: built-artifact introspection, 2026-08-01; `src/core/config.ts:1613-1784`]

## Group semantics

| Prefix | Meaning | Source owner |
|---|---|---|
| `mode`, `modes.*` | Capacity, Brain/worker model seeds, planning, and API-mode requirement. | `src/core/config.ts:1613-1630` |
| `providers.*`, `provider_overrides`, `auth_mode`, `spawn_backend` | Provider role, per-provider override, credential mode, and worker backend inputs. | `src/core/config.ts:1631-1642` |
| lifecycle/coverage/routing/memory/auditor roots | Retry, recovery, acceptance gates, routing, retention, and observation policy. | `src/core/config.ts:1643-1703` |
| `timeout.*` | Backend floors/ceilings plus effort/history/runtime scaling. | `src/core/config.ts:195-218,1700` |
| `observability.*`, retention roots | Rotation and archive retention. | `src/core/config.ts:1701-1722` |
| `terminal.*`, `prompt.*` | Terminal server/session and worker-prompt rendering policy. | `src/core/config.ts:1723-1726` |
| `autonomous.*` | Backlog loop, pool, reactive source, generator, and RBAC policy; parent default is off. | `src/core/config.ts:1727-1736` |
| `nervous_system.*` | Observer mode, immutable safety floor, notification delivery, detector toggles, and retention; parent default is off. | `src/core/config.ts:1737-1782` |

## Complete default leaf table

| Dot path | Default | Runtime value type |
|---|---|---|
| `mode` | `"performance"` | `string` |
| `modes.performance.max_workers` | `8` | `number` |
| `modes.performance.brain_model` | `"claude-opus-5"` | `string` |
| `modes.performance.default_model` | `"claude-opus-5"` | `string` |
| `modes.performance.haiku_allowed` | `true` | `boolean` |
| `modes.performance.brain_planning` | `"auto"` | `string` |
| `modes.balanced.max_workers` | `5` | `number` |
| `modes.balanced.brain_model` | `"claude-sonnet-5"` | `string` |
| `modes.balanced.default_model` | `"claude-opus-5"` | `string` |
| `modes.balanced.haiku_allowed` | `true` | `boolean` |
| `modes.balanced.brain_planning` | `"auto"` | `string` |
| `modes.economic.max_workers` | `3` | `number` |
| `modes.economic.brain_model` | `"claude-sonnet-5"` | `string` |
| `modes.economic.default_model` | `"claude-sonnet-5"` | `string` |
| `modes.economic.haiku_allowed` | `false` | `boolean` |
| `modes.economic.brain_planning` | `"auto"` | `string` |
| `modes.api.max_workers` | `10` | `number` |
| `modes.api.brain_model` | `"claude-opus-5"` | `string` |
| `modes.api.default_model` | `"claude-sonnet-5"` | `string` |
| `modes.api.haiku_allowed` | `true` | `boolean` |
| `modes.api.budget_per_sprint` | `5` | `number` |
| `modes.api.requires` | `"ANTHROPIC_API_KEY"` | `string` |
| `modes.api.brain_planning` | `"auto"` | `string` |
| `providers.brain` | `"claude"` | `string` |
| `providers.worker` | `"claude"` | `string` |
| `provider_overrides` | `unset` | `undefined` |
| `cost_optimization` | `false` | `boolean` |
| `spawn_backend` | `"docker"` | `string` |
| `auth_mode` | `"subscription"` | `string` |
| `human_checkpoints` | `[]` | `array` |
| `fix_phase_enabled` | `true` | `boolean` |
| `max_fix_retries` | `2` | `number` |
| `fix_circuit_breaker.enabled` | `true` | `boolean` |
| `fix_circuit_breaker.max_unresolved_tasks` | `5` | `number` |
| `fix_circuit_breaker.min_unresolved_ratio_percent` | `50` | `number` |
| `lifecycle_recovery.coordinator_termination_grace_ms` | `5000` | `number` |
| `lifecycle_recovery.termination_poll_interval_ms` | `100` | `number` |
| `lifecycle_recovery.forced_termination_verify_ms` | `5000` | `number` |
| `coverage_threshold` | `90` | `number` |
| `coverage_hard_floor` | `50` | `number` |
| `coverage_aspirational` | `90` | `number` |
| `max_reroutes` | `3` | `number` |
| `reroute_on_tech_debt` | `false` | `boolean` |
| `sprint_timeout_minutes` | `0` | `number` |
| `memory_budget` | `5000` | `number` |
| `decay_after_sprints` | `20` | `number` |
| `patterns_enabled` | `true` | `boolean` |
| `project_identity_enabled` | `true` | `boolean` |
| `scan_interval` | `30` | `number` |
| `heartbeat_timeout` | `120` | `number` |
| `boundary_enforcement` | `true` | `boolean` |
| `lock_stale_threshold` | `300` | `number` |
| `skill_routing` | `unset` | `undefined` |
| `search_enabled` | `true` | `boolean` |
| `search_provider` | `"context7"` | `string` |
| `search_cache_ttl` | `3600` | `number` |
| `notify_on_complete` | `false` | `boolean` |
| `notify_channel` | `null` | `null` |
| `notify_url` | `null` | `null` |
| `telemetry_enabled` | `false` | `boolean` |
| `telemetry_anonymous` | `true` | `boolean` |
| `detected_env` | `null` | `null` |
| `multi_ide_mode` | `false` | `boolean` |
| `output_splash` | `true` | `boolean` |
| `output_mode` | `"normal"` | `string` |
| `output_theme` | `"default"` | `string` |
| `rollback_policy` | `"never"` | `string` |
| `evaluation_rubric` | `unset` | `undefined` |
| `rubric_max_retries` | `0` | `number` |
| `adaptive_thresholds` | `false` | `boolean` |
| `agent_min_score` | `5` | `number` |
| `adaptive_config.min_samples` | `3` | `number` |
| `adaptive_config.no_go_threshold` | `0.3` | `number` |
| `adaptive_config.coverage_lookback` | `3` | `number` |
| `routing_engine` | `"v3"` | `string` |
| `cleanup_delay_ms` | `180000` | `number` |
| `dependency_pipeline_enabled` | `true` | `boolean` |
| `debt_preflight_enabled` | `true` | `boolean` |
| `sprint_checkpoint_interval` | `5` | `number` |
| `token_throttle_ms` | `500` | `number` |
| `timeout.docker_min_timeout` | `1200` | `number` |
| `timeout.docker_max_timeout` | `7200` | `number` |
| `timeout.tmux_min_timeout` | `900` | `number` |
| `timeout.tmux_max_timeout` | `5400` | `number` |
| `timeout.subprocess_min_timeout` | `600` | `number` |
| `timeout.subprocess_max_timeout` | `3600` | `number` |
| `timeout.effort_base.low` | `600` | `number` |
| `timeout.effort_base.normal` | `1200` | `number` |
| `timeout.effort_base.high` | `2400` | `number` |
| `timeout.loc_scaling_enabled` | `true` | `boolean` |
| `timeout.history_scaling_enabled` | `true` | `boolean` |
| `timeout.runtime_extension_enabled` | `true` | `boolean` |
| `timeout.adaptive_multiplier` | `1.5` | `number` |
| `timeout.runtime_extension_max` | `5` | `number` |
| `observability.rotation.maxSizeMB` | `1` | `number` |
| `observability.rotation.archiveFormat` | `"gzip"` | `string` |
| `observability.rotation.keepLastN` | `10` | `number` |
| `sprint_file_retention.keep_last_n` | `10` | `number` |
| `sprint_file_retention.size_cap_mb` | `500` | `number` |
| `sprint_file_retention.archive_path` | `".deckent/archive/sprints/"` | `string` |
| `scheduler_shadow_retention.retention_days` | `14` | `number` |
| `scheduler_shadow_retention.archive_path` | `".deckent/archive/scheduler-shadow/"` | `string` |
| `deckent_style` | `"sprint"` | `string` |
| `terminal.enabled` | `true` | `boolean` |
| `terminal.bind` | `"127.0.0.1"` | `string` |
| `terminal.maxSessions` | `10` | `number` |
| `terminal.idleTimeoutMs` | `1800000` | `number` |
| `terminal.scrollbackBytes` | `262144` | `number` |
| `terminal.allowShellKind` | `true` | `boolean` |
| `prompt.adr_min_relevance` | `0.3` | `number` |
| `prompt.adr_render` | `"full"` | `string` |
| `prompt.persona_render` | `"full"` | `string` |
| `prompt.exclude_dynamic_system_prompt_sections` | `true` | `boolean` |
| `autonomous.enabled` | `false` | `boolean` |
| `autonomous.interval_ms` | `5000` | `number` |
| `autonomous.backlog_path` | `".deckent/autonomous/backlog.json"` | `string` |
| `autonomous.pool_size` | `1` | `number` |
| `autonomous.reactive.enabled` | `false` | `boolean` |
| `autonomous.reactive.map_path` | `".deckent/autonomous/reactive-map.json"` | `string` |
| `autonomous.work_generator.enabled` | `false` | `boolean` |
| `autonomous.work_generator.interval_ms` | `600000` | `number` |
| `autonomous.rbac_policy.enabled` | `false` | `boolean` |
| `autonomous.rbac_policy.role` | `"viewer"` | `string` |
| `nervous_system.enabled` | `false` | `boolean` |
| `nervous_system.mode` | `"balanced"` | `string` |
| `nervous_system.safety_floor.locked_actions` | `["KILL_LIVE_SPRINT","MANUAL_FILE_DELETE","COST_OVER_THRESHOLD","DESTRUCTIVE_GIT","ADR_DEPRECATE_ACCEPTED"]` | `array` |
| `nervous_system.safety_floor.cost_threshold_usd` | `110` | `number` |
| `nervous_system.safety_floor.bypass_allowed` | `false` | `boolean` |
| `nervous_system.notifications.channels.mcp` | `true` | `boolean` |
| `nervous_system.notifications.channels.cli` | `true` | `boolean` |
| `nervous_system.notifications.channels.file` | `true` | `boolean` |
| `nervous_system.notifications.channels.desktop` | `false` | `boolean` |
| `nervous_system.notifications.throttle_ms` | `300000` | `number` |
| `nervous_system.notifications.group_info_window_ms` | `600000` | `number` |
| `nervous_system.notifications.severity_min` | `"info"` | `string` |
| `nervous_system.notifications.quiet_hours.start` | `"22:00"` | `string` |
| `nervous_system.notifications.quiet_hours.end` | `"08:00"` | `string` |
| `nervous_system.notifications.quiet_hours.timezone` | `"TRT"` | `string` |
| `nervous_system.notifications.cross_channel_dedup` | `true` | `boolean` |
| `nervous_system.detectors.stale_worker.enabled` | `true` | `boolean` |
| `nervous_system.detectors.stale_worker.threshold_ms` | `120000` | `number` |
| `nervous_system.detectors.scope_collision.enabled` | `true` | `boolean` |
| `nervous_system.detectors.debt_trend.enabled` | `true` | `boolean` |
| `nervous_system.detectors.debt_trend.threshold_rate` | `0.15` | `number` |
| `nervous_system.detectors.agent_routing.enabled` | `true` | `boolean` |
| `nervous_system.detectors.agent_routing.anomaly_threshold` | `0.4` | `number` |
| `nervous_system.detectors.directives_protection.enabled` | `true` | `boolean` |
| `nervous_system.detectors.directives_protection.auto_restore` | `true` | `boolean` |
| `nervous_system.detectors.dead_event_stream.enabled` | `false` | `boolean` |
| `nervous_system.detectors.cost_threshold.enabled` | `false` | `boolean` |
| `nervous_system.detectors.cost_threshold.reserve_for` | `"sprint-148"` | `string` |
| `nervous_system.detectors.prompt_quality.enabled` | `false` | `boolean` |
| `nervous_system.detectors.prompt_quality.reserve_for` | `"sprint-148"` | `string` |
| `nervous_system.detectors.worker_output_variance.enabled` | `false` | `boolean` |
| `nervous_system.detectors.worker_output_variance.reserve_for` | `"sprint-148"` | `string` |
| `nervous_system.detectors.self_modifying_warner.enabled` | `false` | `boolean` |
| `nervous_system.detectors.self_modifying_warner.reserve_for` | `"sprint-148"` | `string` |
| `nervous_system.detectors.task_mode_idle.enabled` | `false` | `boolean` |
| `nervous_system.detectors.build_failure_recurrence.enabled` | `false` | `boolean` |
| `nervous_system.detectors.token_spike.enabled` | `false` | `boolean` |
| `nervous_system.detectors.agent_routing_anomaly.enabled` | `false` | `boolean` |
| `nervous_system.detectors.scope_collision_rate.enabled` | `false` | `boolean` |
| `nervous_system.detectors.notification_delivery_health.enabled` | `false` | `boolean` |
| `nervous_system.history_retention_days` | `30` | `number` |

[Evidence for every row: read-only command importing `createDefaultConfig` from `dist/core/config.js`, 2026-08-01; source definition `src/core/config.ts:1613-1784`]

## Modes, providers, and routing

The four built-in mode presets and the verified local effective projection are documented in [Configuration](../configuration.md). Literal model IDs in presets are seed inputs; effective provider/model authority also depends on the registry, task routing, auth/account, reachability, provider limits, and budget admission. [Evidence: `src/core/config.ts:1969-2021`; `src/core/model-registry.ts:568-800`; `.deckent/workspace/IDENTITY.md:10`]

`routing_engine` defaults to v3. Legacy v1/v2 values are upgraded in memory. Grouped `providers.brain` and `providers.worker` are canonical; compatibility fields are projected before environment overrides. [Evidence: `src/core/config.ts:562-610,1969-1993`]

## Dogfood / repository reality

- ✅ The complete default object has 164 leaves and the built artifact matches the source build used for this audit.
- ⚠️ `CONFIG_METADATA` is not a complete schema authority: only a subset of roots is represented, and at least the mode, memory budget, and decay defaults have drifted from `createDefaultConfig()`. Generated config reference must not replace runtime introspection until this is reconciled. [Evidence: `src/core/config.ts:2485-2819`; built default introspection, 2026-08-01]
- ⚠️ The global reader is platform-aware but `saveGlobalConfig` still targets the legacy location; OQ-15 tracks whether this is transitional policy. [Evidence: `src/core/config.ts:1829-1862,2350-2378`; OQ-15]
- ⚠️ `loadConfig` and bare `deckent config` can persist compatibility repair/migration, so they are not unconditionally pure reads. [Evidence: `src/core/config.ts:1913-1955`; `src/cli/commands/config.ts:89-101`]
