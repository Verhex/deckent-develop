# Config completion audit — schema, defaults, validation and resolution

**Lane:** declaration / public types / defaults / validation / merge-resolution / env / migration / metadata / truth-gate  
**Pinned evidence:** branch `audit/config-completion-20260825`, commit `ff48978fb78139ea34b8c5e98fc41532437af9c9`  
**Disposition:** **NO-GO for “config contract complete”**. Bu raporun audit kapsamı tamamlandı; ürün düzeltmesi bu lane'in dışında bırakıldı.

## 1. Sonuç

Deckent'te tek bir configuration authority yok. Aynı kullanıcı girdisi iki public resolver üzerinden farklı effective config üretmektedir; `loadConfig()` 111 explicit root projection yaparken `mergeConfigs()` yalnız 56 explicit root projection yapar ve 55 alanı düşürür. Dahası `loadConfig()` da public `ResolvedConfig` kontratındaki yedi alanı (`output_splash`, `enforce_rbac`, `enforce_least_privilege`, `risk_gate_enabled`, `rollback`, `doc_tracking`, `observability`) hiç project etmez. İlk dört kayıp aktif kullanıcı/güvenlik davranışını doğrudan değiştirir; son üçü testte bilerek whitelist edilmiştir.

Canonical type yüzeyi 141 `DeckentConfig` root property'sidir. Shared semantic inventory'de TypeScript TypeChecker ile recursive olarak genişletildiğinde finite mapped-type üyeleri ve wildcard/array contractları dahil **1,002** leaf-pattern elde edilir; declaration-only truth parser ise yalnız 449 leaf görür. Buna rağmen runtime'ın kabul ettiği en az sekiz path canonical public type'ın dışındadır; ayrıca dokümante edilmiş iki nervous timeout adı gerçekte config alanı değildir. Dolayısıyla mevcut `.deckent/config.json`, `createDefaultConfig()` veya `CONFIG_METADATA` evren kabul edilerek yapılan sayım eksik kalır.

Mevcut `scripts/lint-config-truth.mjs` bu committe **589 issue ile FAIL** eder (`DIVERGENT=12`, `MISSING_DEFAULT=400`, `MISSING_METADATA=112`, `MISSING_RUNTIME=65`). Gate CI'a bağlı değildir ve parser'ı imported alias/mapped type, resolver semantics, spread ve `mergeConfigs()` kapsamaz. Bu nedenle mevcut FAIL yararlı bir drift sinyalidir fakat ne false-positive-free ne de completeness proof'tur.

## 2. Yöntem ve evren

- `DeckentConfig` declaration'ı AST ve TypeChecker ile root + recursive leaf olarak çıkarıldı; snapshot/config örneği universe olarak kullanılmadı (`src/core/config-types.ts:1017-1702`).
- `createDefaultConfig`, named default constants, `CONFIG_METADATA`, `loadConfig`, `mergeConfigs`, `validateConfig`, Zod/manual validators, canonicalizer'lar ve migration girişleri ayrı authority'ler olarak karşılaştırıldı.
- `loadConfig` ve `mergeConfigs` return object'leri AST ile root-key bazında karşılaştırıldı; ardından actual TypeScript modülü üzerinden runtime smoke yapıldı.
- User-authored config path erişimleri `config.<path>`, cast/intersection ve raw-config erişimleri dahil tarandı.
- Scoped regression suite çalıştırıldı: `config-flag-roundtrip`, `config-migration`, `nervous-config-schema`, `config-truth-gate` — 4 file / 75 test PASS. Bu yeşil sonuç aşağıdaki projection açıklarını kapatmıyor; bazı açıklar testte explicit allowlist.

### 2.1 Canonical 141 root alanın tam listesi

Aşağıdaki liste `DeckentConfig` declaration sırasıdır; optional olması universe'den çıkarıldığı anlamına gelmez:

```text
mode, modes, brain_planning, language, projectName, last_sprint_id, version,
auto_docs, pre_sprint_tests, strict_tenant_isolation, enforce_principal_assurance,
enforce_least_privilege, risk_gate_enabled, spawn_backend, docker_image, docker_timeout,
worker_memory_limit_by_kind, worker_memory_limit, worker_home_tmpfs_size, worker_memory_swap,
skills, decision_engine, learning, collaboration, notifications, auto_clean_locks,
brain_provider, worker_provider, fallback_provider, provider_fallback, execution_budget,
provider_limits, persona_integrity, provider_overrides, model_strategy, providers, local_llm,
deck_broker, openrouter, cost_optimization, claude_backend, api_keys, output_splash,
output_mode, output_theme, output_render_mode, skill_routing, search_enabled, search_provider,
search_cache_ttl, notify_on_complete, notify_outbox_drain_interval_ms, notify_channel,
notify_url, notify_connectors, approval_channels, bot_capabilities, identity, ollama_host,
native_provider, native_model, native_context_tokens, openai_base_url, bot_agent,
telemetry_enabled, telemetry_anonymous, detected_env, multi_ide_mode, auth_mode,
api_auth_token, api_oidc, dashboard_oidc, memory_budget, decay_after_sprints,
patterns_enabled, project_identity_enabled, memory, scan_interval, heartbeat_timeout,
boundary_enforcement, lock_stale_threshold, human_checkpoints, dependency_pipeline_enabled,
debt_preflight_enabled, retry_transient_failures, fix_phase_enabled, max_fix_retries,
fix_circuit_breaker, lifecycle_recovery, ai_planner_timeout, coverage_threshold,
coverage_hard_floor, coverage_aspirational, max_reroutes, reroute_on_tech_debt,
sprint_timeout_minutes, rollback_policy, rollback, evaluation_rubric, acceptance_matrix,
acceptance_enforcement, rubric_max_retries, adaptive_thresholds, agent_min_score,
adaptive_config, routing_engine, routing, cleanup_delay_ms, routing_config,
sprint_checkpoint_interval, plugin_require_signature, timeout, observability,
sprint_file_retention, scheduler_shadow_retention, runtime_artifact_retention,
nervous_system, resource_monitor, cross_verify, worker_comms, training_trace, live_trace,
mcp_client_enabled, routing_v3, doc_tracking, cost_guard, scheduler, gate, approval, erp,
computer_use, worker_output_contract, autonomous, deckent_style, terminal, plugins,
tool_surface, repl_surface, tools, prompt, plan
```

### 2.2 Recursive path grammar — finite ve wildcard contractlar

Bu bölüm 1,002 TypeChecker leaf-pattern'ın lossless compact gösterimidir. Notasyon: `{a,b}` finite alternatif, `*` user-defined key, `[]` array element. Aşağıda adı geçmeyen root'lar §2.1'deki scalar/opaque leaf'tir. İlk independent walk 1,106 saymıştı; exact reconciliation, `modes.*.{brain_model,default_model}` string scalar'larına yanlışlıkla inen 98 JavaScript prototype methodunu ve dört `slaMs` array'ini 12 tuple-index leaf olarak saymasını kaldırıp doğru iki scalar + dört `[]` leaf ekledi: `1106 - 110 + 6 = 1002`. Shared `field-universe.json` ile kullanılan sayı bu nedenle 1,002'dir.

Finite setler:

```text
TASK_KIND = {audit,code-development,config,data,design,devops,documentation,generic,refactor,security,test}
ROLE = {brain,worker,auditor}
VERDICT = {CONFIRMED,FAILED,QUALIFIED,UNDECIDABLE}
BUDGET_LEAF = {maxCacheCreationTokens,maxCacheReadTokens,maxContextTokens,maxInputTokens,
               maxOutputTokens,maxTokens,maxTurns,maxUsd}
DETECTOR = {agent_routing,agent_routing_anomaly,build_failure_recurrence,cost_threshold,
            dead_event_stream,debt_trend,directives_protection,notification_delivery_health,
            prompt_quality,scope_collision,scope_collision_rate,self_modifying_warner,
            stale_worker,task_mode_idle,token_spike,worker_output_variance}
DETECTOR_LEAF = {anomaly_threshold,auto_restore,enabled,pending_age_threshold_ms,
                 reserve_for,threshold_ms,threshold_rate}
LIFECYCLE_PROFILE = {autonomous-trigger,broker-native,confirmation,gateway-pairing}
LIFECYCLE_LEAF = {blocking,riskTier,slaMs[],timeoutDisposition,ttlMs}
```

Finite mapped expansions:

```text
acceptance_matrix.TASK_KIND.VERDICT.{action,adapter}
execution_budget.roles.ROLE.default.BUDGET_LEAF
execution_budget.roles.ROLE.by_task_kind.TASK_KIND.BUDGET_LEAF
nervous_system.detectors.DETECTOR.DETECTOR_LEAF
approval.lifecycle.profiles.LIFECYCLE_PROFILE.LIFECYCLE_LEAF
```

Diğer nested finite path'ler:

```text
adaptive_config.{coverage_lookback,min_samples,no_go_threshold}
api_oidc.{algorithm,audience,enabled,issuer,key}
approval.{api_decide,authority.decision_window_seconds,authority.enabled,
  authority.oidc.{authority_ref,max_auth_age_seconds,max_session_seconds,required_acr[],required_amr[],role_claim,tenant_claim},
  authority.tenant_id,authority.terminal.max_auth_age_seconds,gate_enabled,lifecycle.enabled,
  question_bridge,relay_enabled,rules[].{action,match.requester,match.risk,match.scope,match.tenantId,timeoutMs}}
approval_channels.{slack,teams}.{channel_id,enabled,lang,token}
approval_channels.telegram.{chat_id,enabled}
auto_docs.{tier1,tier2,tier3}
autonomous.{backlog_path,enabled,interval_ms,pool_size,rbac_policy.enabled,rbac_policy.role,
  reactive.enabled,reactive.map_path,reactive.repo_watch.enabled,reactive.webhook.enabled,
  work_generator.enabled,work_generator.interval_ms}
bot_agent.{enabled,lang,model,persona,providers[],timeout_ms}
bot_capabilities.{enabled,mail.allowedRecipients[],mail.from,mail.smtp.host,mail.smtp.pass,
  mail.smtp.port,mail.smtp.secure,mail.smtp.user,voice.enabled,voice.language,
  voice.local.health_url,voice.local.stt_language,voice.local.stt_url,voice.local.tts_url,
  voice.local.tts_voice,voice.provider,voice.stt,voice.tts}
collaboration.{conflictStrategy,parallelPipelines,sharedMemoryEnabled}
computer_use.{allowed_capabilities[],enabled}
cost_guard.{enabled,max_limit_cost_usd}
cross_verify.{allow_non_reservable_subscription_adjudication,enabled,enforce_refuted,
  high_stakes_only,max_verifications_per_sprint,reachability_ttl_ms,verifier_model.*,
  verifier_priority[],verifier_tier_authority.schema_version,
  verifier_tier_authority.decisions[].{author_model,decision,decision_ref,verifier_model}}
dashboard_oidc.{client_id,client_secret,enabled,issuer,redirect_uri,scope}
decision_engine.{adaptiveAgentEnabled,agentSelectionThreshold,decisionLogging,enabled,
  learningEnabled,learningMaxSprints,maxSkillsPerTask}
deck_broker.enabled
doc_tracking.sync_on_finalize
evaluation_rubric.{criteria[].evaluator,criteria[].name,criteria[].threshold,
  criteria[].weight,maxRetries,passingScore}
execution_budget.{final_only_usage.action,final_only_usage.max_wall_clock_seconds,
  final_only_usage.roles[],landing.attended_unsupported,landing.reserve_ratio,
  native_agent.checkpointEveryRounds,native_agent.checkpointEveryToolCalls,
  native_agent.contextSafetyReserveTokens,native_agent.maxCumulativeTokens,
  native_agent.maxModelRounds,native_agent.maxNoProgressRounds,native_agent.maxToolCalls,
  native_agent.maxWallTimeMs,native_agent.outputReserveTokens,
  unmetered_backend.action,unmetered_backend.ordered_backends[]}
fix_circuit_breaker.{enabled,max_unresolved_tasks,min_unresolved_ratio_percent}
gate.{enforce_adr_compliance,max_tech_debt_ratio,verify_delta_downgrade}
identity.{enabled,enforcement,owner.connector,owner.externalId,owner.tenantId,
  provider.kind,provider.oidc.audience,provider.oidc.groupsClaim,provider.oidc.issuer,
  provider.oidc.roleClaim,provider.scim.baseUrl,provider.scim.token,provider.scim.userFilter,
  verify.maxAttempts,verify.ttlSeconds}
learning.{decayInterval,enabled,maxSprintsToKeep,minConfidenceForRecommendation,
  minSamplesForBonus,patternMigrationDone,recentSprintWindow,
  sprintRecencyFailurePenalty,sprintRecencySuccessBonus}
lifecycle_recovery.{coordinator_termination_grace_ms,forced_termination_verify_ms,
  termination_poll_interval_ms}
live_trace.enabled
local_llm.{acceleration.backend,acceleration.backendLibrary,acceleration.device,
  acceleration.flashAttention,acceleration.gpuLayers,acceleration.runtimeLibraryDirectories[],
  contextSize,endpoint,host,modelAlias,modelArtifact,port,serverBinary}
memory.{backend,custom_types[],decay_after_sprints,export_md,export_trigger,search,semantic_provider}
model_strategy.{auto_downgrade,auto_upgrade,brain_tier,max_tier,min_tier,worker_tier}
nervous_system.{accept_cooldown_ms,approve_timeout_ms,enabled,history_retention_days,mode,
  notifications.channels.{cli,desktop,file,mcp},notifications.cross_channel_dedup,
  notifications.group_info_window_ms,notifications.quiet_hours.end,
  notifications.quiet_hours.start,notifications.quiet_hours.timezone,
  notifications.severity_min,notifications.throttle_ms,reject_suppress_ms,
  safety_floor.bypass_allowed,safety_floor.cost_threshold_usd,safety_floor.locked_actions[],worker_respawn}
notifications.{discord,events[],slack,terminal,webhook}
notify_connectors.{discord,telegram}.{chat_id,enabled,token}
observability.rotation.{archiveFormat,keepLastN,maxSizeMB}
openrouter.{enabled,reasoning.effort,reasoning.enabled,reasoning.exclude,reasoning.max_tokens}
persona_integrity.min_bytes
plan.interrogate
plugins.{require_signature,security_enforcement,
  trusted_publisher_keys[].keyId,trusted_publisher_keys[].publicKey}
prompt.{adr_min_relevance,adr_render,canary_cost_authority,
  canary_thresholds.maximumCacheHitRatioRegression,
  canary_thresholds.maximumCostPerLineageIncreaseRatio,
  canary_thresholds.maximumQualityPassRateRegression,
  canary_thresholds.minimumCacheHitRatio,canary_thresholds.minimumQualityPassRate,
  catalog_mount_mask,codex_core_channel,codex_suppress_project_doc,
  exclude_dynamic_system_prompt_sections,persona_render,task_profiles.code_directories[],
  task_profiles.doc_kinds[],worker_core_system_prompt}
provider_fallback.{auditor[],auditor_provider,brain[],global[],unattended,worker[]}
provider_limits.{authorityRef,schemaVersion,policies[].selector.accountRefHash,
  policies[].selector.authMode,policies[].selector.backend.endpointRefHash,
  policies[].selector.backend.executionBackend,policies[].selector.backend.transport,
  policies[].selector.provider,policies[].selector.quotaScopeRefHash,
  policies[].selector.requiredWindowIds[],policies[].selector.sourceScopes[].authority,
  policies[].selector.sourceScopes[].endpointRefHash,
  policies[].selector.sourceScopes[].executionBackend,
  policies[].selector.sourceScopes[].sourceKind,
  policies[].selector.sourceScopes[].transport,policies[].selector.tenantId,
  policies[].values.blockAtRatio,policies[].values.minimumRemaining.credits,
  policies[].values.minimumRemaining.percent,policies[].values.minimumRemaining.requests,
  policies[].values.minimumRemaining.tokens,policies[].values.minimumRemaining.usd,
  policies[].values.ratioEnforcement,policies[].values.warnAtRatio}
providers.{brain,fallback,registry[].adapter,registry[].apiKeyEnv,registry[].authMode,
  registry[].baseUrl,registry[].executionCostClass,registry[].models[],registry[].name,
  registry[].type,worker}
repl_surface.{approvals,bg_turns,enabled}
resource_monitor.{enabled,interval_ms,log_path}
rollback.enabled
routing.effort_tiering
routing_config.{agentMinScore,confidenceThreshold,maxSkillsDefault,skillMinScore}
routing_v3.{confidenceFloor,enabled,explorationBonus,governanceMode,signalGatedNumerical,
  structuralConfidence,topK,weights.content,weights.numerical,weights.positional}
scheduler.{engine,shadow_reducer}
scheduler_shadow_retention.{archive_path,retention_days}
skills.{autoDetectStack,enabled,maxPerTask,preferredSkills[]}
sprint_file_retention.{archive_path,keep_last_n,size_cap_mb}
terminal.{allowShellKind,bind,enabled,idleTimeoutMs,maxSessions,native_agent,
  outboundDailyQuotaBytes,run_flow_v2,scrollbackBytes}
timeout.{docker_max_timeout,docker_min_timeout,effort_base.high,effort_base.low,
  effort_base.normal,history_scaling_enabled,loc_scaling_enabled,
  model_multiplier.economy,model_multiplier.premium,model_multiplier.premium_plus,
  model_multiplier.standard,runtime_extension_enabled,subprocess_max_timeout,
  subprocess_min_timeout,tmux_max_timeout,tmux_min_timeout}
tool_surface.{enabled,riskThreshold}
tools.allowlist_enabled
training_trace.enabled
worker_comms.{enabled,inject_handoffs,inject_shared,shared_memory_ttl_ms}
worker_output_contract.{enabled,strict_report}
```

Wildcard/dynamic-key contractlarının tam listesi:

```text
api_keys.*
bot_capabilities.perChat.*.*
bot_capabilities.policies.*
erp.entities.*.{fields[],maxLimit,source}
erp.entityModelMap.*
erp.memoryTables.*[].*
identity.channels.*.{guestRole,mode,projectPath,tenantId}
identity.roleMap.*.{permissions[],role}
memory.keyword_aliases.*[]
modes.*.{brain_model,brain_planning,budget_per_sprint,default_model,haiku_allowed,max_workers,min_tier,requires}
nervous_system.actionOverrides.*
provider_overrides.*
providers.overrides.*
runtime_artifact_retention.families.*.{max_age_days,max_count,max_size_mb}
worker_memory_limit_by_kind.*
```

Bu grammar public type universe'ünü kapsar; runtime'daki type dışı contractlar ayrıca §3.3'tedir.

### 2.3 Generated inventory boundary ve presence modeli

Audit generator'ı üç farklı evreni artık birbirine karıştırmadan yayınlar (`docs/audits/config-completion-2026-08-25/config-audit-inventory.mjs:124-155,556-690`):

```text
authored DeckentConfig roots                     141
truth-gate declaration leaves                    449
semantic DeckentConfig leaves                  1,002
normalized union paths                         1,146
createDefaultConfig textual leaves               180
normalized default paths                         178
quarantined synthetic default-parser rows           2
public ResolvedConfig roots                       117
loadConfig truth-runtime textual parser leaves    185
quarantined non-authored runtime parser rows         6
input snapshot leaves                             197
```

`truth.runtime=185`, public `ResolvedConfig=117 roots` anlamına gelmez. Parser literal expression'ları leaf gibi toplar. `activeModeConfig`, `projectRoot`, `provider_limit_authority` gerçek resolved-only output'lardır; `chat_provider`, `max_workers`, `token_throttle_ms` local intersection extension output'larıdır. Altısı `runtimeParserArtifacts` altında saklanır fakat yalnız parser nedeniyle authored config union'una girmez (`config-audit-inventory.mjs:139-154`; generated quarantine `CONFIG-FIELD-MATRIX.md:1190-1203`). `activeModeConfig` artık field row değildir. Başka independent provenance'i olan `chat_provider`/`max_workers`/`token_throttle_ms` kendi gerçek ingress kanıtlarıyla union'da kalabilir.

Presence artık boolean “optional” değildir. Generator `selfOptional` ile `optionalByAncestor` state'ini ayrı taşır ve `required | optional | required_when_parent_present` üretir (`config-audit-inventory.mjs:166-255,449-455`). Sonuç:

```text
OPTIONAL_NO_EXPLICIT_DEFAULT       755
CONDITIONAL_NO_EXPLICIT_DEFAULT    205
REQUIRED_NO_DEFAULT                  1
```

Tek unconditional `REQUIRED_NO_DEFAULT` satırı `modes`dur; bu da `DEFAULT_MODES` named authority'si nedeniyle gerçek missing-default değil, textual truth parser sınırıdır. `required_when_parent_present`, optional parent block author edildiğinde child'ın zorunlu olduğu grammar'dır; unconditional default zorunluluğu değildir.

Ancestor semantics iki ayrı alanla taşınır: `contractAncestor` yalnız provenance/effective-resolution context'idir; `dynamicAncestor` ise ancak TypeChecker'ın gerçekten bildirdiği `*` veya `[]` pattern concrete path'i eşliyorsa atanır (`config-audit-inventory.mjs:402-421,556-597`). Bu ayrım ordinary typed container'ları dynamic sanan önceki false classification'ı kapattı: `approval.authority`, `approval.lifecycle`, `cross_verify.verifier_tier_authority`, `identity.owner`, `local_llm.acceleration`, `openrouter.reasoning`, `prompt.canary_thresholds` artık typed declaration + ordinary default semantics taşır; type dışı `timeout.adaptive_multiplier` ve `timeout.runtime_extension_max` ise typed-container arkasına saklanmadan `INPUT_ONLY_UNDECLARED` kalır. Genuine `DYNAMIC_DESCENDANT` sayısı 39'dan **28**'e indi; kalanların tamamı `modes.*.*` veya `runtime_artifact_retention.families.*.*` eşleşmesidir.

Consumer index de candidate/evidence ayrımı yapar. `config.json` geçen 801 literal yalnız `rawConfigFileCandidates`tır; gerçek project-config read/write destination ispatı sayılmaz. Prefix regex'e uyan 1,757 string literal `environmentCandidates` olarak korunur; buna karşılık 2,048 gerçek `process.env` access row'u (135 static name + 241 dynamic access row) `environmentReferences`tır (`config-audit-inventory.mjs:340-374,691-712`). Örneğin `DECKENT_E*` error-code literal'ları candidate listesinde kalır, environment evidence listesinde sıfırdır. Böylece exhaustive candidate kaybı olmadan false environment/config-file claim yapılmaz.

Textual default parser'ın ürettiği `fix_circuit_breaker__spread__86799` ve `lifecycle_recovery__spread__86866` gerçek authored path değildir. İki row `SYNTHETIC_DEFAULT_SPREAD_PARSER_ARTIFACT` olarak korunur, 180 raw default-parser leaf sayısından düşülerek 178 normalized default path elde edilir ve authored union'a alınmaz (`config-audit-inventory.mjs:60-68`; `CONFIG-FIELD-MATRIX.md:1181-1188`). Raw truth issue sayısı reproducibility için 589 kalır; normalized field universe bu iki sentetik issue'yu field kabul etmez.

Pinned input evidence dosyası charter gereği byte-for-byte korunur; fakat generated machine projection artık **value-free schema v2**'dir. Flatten lane'i yalnız path ile allowlisted kind/shape (`array`, `boolean`, `null`, `number`, `object`, `string`) çıkarır (`config-audit-inventory.mjs:35-59`). Her field row yalnız `inputPresent` ve `inputValueKind` taşır; legacy `inputValue` field'i yoktur (`config-audit-inventory.mjs:556-575`). Serialization öncesi generator bütün row'larda `inputValue` absence, presence parity ve kind allowlist'i assert eder; serialized JSON üzerinde exact `"inputValue":` sentinel'ını da reddeder (`config-audit-inventory.mjs:643-690`). Regeneration sonucu 197 input path için kind dağılımı `string=55`, `number=77`, `boolean=60`, `null=3`, `array=1`, `object=1`; raw/legacy `inputValue` key sayısı sıfırdır. Matrix de değer göstermeden yalnız presence + kind yayınlar (`config-audit-inventory.mjs:724-773`).

### 2.4 Charter dimension closure

1,146 field row'un her biri şu dokuz dimension'ı typed object olarak taşır: `declaration`, `default`, `validation`, `effectiveResolution`, `behavioralConsumer`, `operatorSurface`, `documentation`, `tests`, `lifecycleMigration`. Her object non-empty `disposition`, `reason`, `evidence[]` taşır (`config-audit-inventory.mjs:456-597`). Allowed dispositions:

- `STATIC_EVIDENCE`: yalnız declaration/default gibi doğrudan static boyutu kanıtlar; runtime behavior anlamına gelmez.
- `HOLD_STATIC_CANDIDATE_NOT_BEHAVIOR_PROOF`: source/test/docs/operator/resolver reference vardır fakat executed behavior veya reachability kanıtlanmamıştır.
- `NONE_FOUND_STATIC`: static taramada kanıt bulunmadı; sessiz “yoktur” iddiası değildir.
- `NOT_APPLICABLE`: concrete dynamic descendant veya wildcard/repeated pattern ilgili boyutta gerçek `*`/`[]` contract evidence'i tarafından yönetilir; ordinary ancestor bunu üretemez.

Disposition sayımları:

| Dimension | STATIC | HOLD | NONE | N/A |
|---|---:|---:|---:|---:|
| declaration | 1,114 | 0 | 4 | 28 |
| default | 178 | 0 | 848 | 120 |
| validation | 0 | 183 | 963 | 0 |
| effective resolution | 0 | 491 | 655 | 0 |
| behavioral consumer | 0 | 228 | 918 | 0 |
| operator surface | 0 | 128 | 1,018 | 0 |
| documentation | 0 | 387 | 759 | 0 |
| tests | 0 | 163 | 983 | 0 |
| lifecycle/migration | 0 | 16 | 1,130 | 0 |

Özellikle behavioral/operator/test/docs ve effective-resolution dimension'larında hiçbir static candidate runtime proof'a yükseltilmedi. Docs scan audit output dizinini dışlar; 387 path / 2,656 token reference yalnız HOLD candidate'dır (`config-audit-inventory.mjs:423-448`). Matrix aynı dokuz dimension'ı ayrı columnlarda disposition + reason ile gösterir; full evidence array'leri `field-universe.json`dadır.

Generator blocking invariants'ı kendi içinde assert eder (`config-audit-inventory.mjs:616-642`): ordinary ancestor örneklerinin `dynamicAncestor=null` olması; `approval.authority` declaration ve `worker_output_contract.enabled` default disposition'larının N/A olmaması; `modes.api.max_workers`ın exact `modes.*.max_workers` contract'ına bağlanması; herhangi bir dimension'ı N/A olan her row'un `*`/`[]` içeren `dynamicContractEvidence` taşıması. Son regeneration'da 142 N/A-taşıyan row için bad-evidence sayısı sıfırdır.

## 3. Bulgular

### CFG-SD-001 — İki resolver aynı girdiden farklı effective config üretiyor

**Severity:** critical · **Classification:** RELATED_BUT_NONBLOCKING (audit sonucu için; ürün completion'ı bloklar)

`loadConfig()` explicit resolved literal'i `src/core/config.ts:2363-2596`, `mergeConfigs()` ise `src/core/config.ts:3342-3465` aralığındadır. AST karşılaştırması sırasıyla 111 ve 56 explicit key buldu; coverage spread'i iki tarafta ayrıca üç alan taşır. `mergeConfigs()`te bulunmayan 55 `loadConfig()` alanı:

```text
model_strategy, spawn_backend, auth_mode, docker_image, docker_timeout,
worker_memory_limit_by_kind, worker_memory_limit, worker_home_tmpfs_size, worker_memory_swap,
local_llm, ollama_host, native_provider, native_model, native_context_tokens, openai_base_url,
bot_agent, memory_budget, decay_after_sprints, patterns_enabled, project_identity_enabled,
scan_interval, heartbeat_timeout, boundary_enforcement, lock_stale_threshold, human_checkpoints,
retry_transient_failures, fix_phase_enabled, max_fix_retries, fix_circuit_breaker,
lifecycle_recovery, rollback_policy, evaluation_rubric, rubric_max_retries,
acceptance_matrix, acceptance_enforcement, routing_engine, routing_config, routing,
cleanup_delay_ms, debt_preflight_enabled, pre_sprint_tests, strict_tenant_isolation,
enforce_principal_assurance, ai_planner_timeout, sprint_checkpoint_interval, timeout,
nervous_system, autonomous, notify_connectors, approval_channels, notify_on_complete,
notify_outbox_drain_interval_ms, bot_capabilities, identity, prompt
```

Runtime proof'ta `mergeConfigs(null, projectConfig)` yalnız 58 own key döndürdü ve istenen `memory_budget` ile `spawn_backend` dahil örnek alanlar `undefined` kaldı. Bu bir documentation farkı değil, public resolver semantic split'idir.

### CFG-SD-002 — `loadConfig()` da public `ResolvedConfig` alanlarını düşürüyor

**Severity:** critical · **Classification:** RELATED_BUT_NONBLOCKING

`ResolvedConfig` 117 root alan bildirir (`src/core/config-types.ts:2033-2328`). Coverage spread'i hariç `loadConfig` projection'ında olmayan alanlar:

```text
output_splash, enforce_rbac, enforce_least_privilege, risk_gate_enabled,
rollback, doc_tracking, observability
```

- `enforce_rbac` resolved type'ta vardır (`src/core/config-types.ts:2064`) fakat `DeckentConfig` authored type'ta yoktur; canonical loader üzerinden ayarlanamaz. Aktif consumers: `src/orchestra/sprint-runtime.ts:11-32`, `src/orchestra/backlog-trigger.ts:10-31`, `src/agents/worker.ts:895`.
- `enforce_least_privilege` ve `risk_gate_enabled` authored type'ta vardır (`src/core/config-types.ts:1051-1061`) ancak resolved projection'da düşer. Enforcement consumers sırasıyla `src/core/capability-runtime.ts:117-177` ve `src/orchestra/autonomous/execute-dispatcher.ts:492-501`.
- `output_splash` default/metadata'da `true` olmasına rağmen projection'da düşer. Renderer yalnız truthy resolved value'da çalışır (`src/cli/helpers/splash.ts:56-63`); sonuçta default-on davranış fiilen off olur.
- `rollback`, `doc_tracking`, `observability` boşlukları `tests/core/config-flag-roundtrip.test.ts:279-306` içinde explicit known-gap whitelist'tedir. Aynı test scalar enforcement/splash alanlarını ve `mergeConfigs()`i hiç denetlemez.

### CFG-SD-003 — Canonical type dışı gerçek config path'leri ve phantom path'ler var

**Severity:** high · **Classification:** RELATED_BUT_NONBLOCKING

Runtime'ın kabul/okuduğu fakat `DeckentConfig`te olmayan sekiz path:

```text
chat_provider
chat.{provider,mode,status_line,local_fallback,slash_extra}
max_workers
token_throttle_ms
```

Kanıt: local intersections/cast'ler `src/core/config.ts:93-113,127-128`; strict chat schema `src/core/config.ts:444-452`; chat block raw cast üzerinden okunur. Bu alanlar public type/metadata/default/truth-gate evreninden kaçar. CLI init'in yazdığı `_auto_detected` de typed config alanı değildir (`src/cli/commands/init-steps.ts:191-243`).

Ters yönde, comment/constant isimleri `nervous_system.approve_timeout_attended_ms` ve `nervous_system.approve_timeout_unattended_ms` adlarını config path gibi sunar (`src/core/config.ts:353-356`, `src/nervous/executor.ts:162-165`). Public type yalnız `approve_timeout_ms` bildirir (`src/core/config-types.ts:1905-1909`) ve executor bu iki değeri constants'tan alır. Kullanıcı iki “documented” adı yazsa effect oluşmaz.

### CFG-SD-004 — Default authority'leri birbiriyle çelişiyor

**Severity:** high · **Classification:** RELATED_BUT_NONBLOCKING

| Path | `createDefaultConfig` | Metadata / generated / consumer fallback | Evidence |
|---|---:|---:|---|
| `mode` | `performance` | metadata `balanced` | `src/core/constants.ts:140-142`; `src/core/config.ts:1897-1900,2854-2860` |
| `memory_budget` | `5000` | metadata `600`; init docs `900`; finalizer fallback `900` | `src/core/config.ts:1968-1970,3105-3110`; `src/cli/commands/init-templates.ts:491-492`; `src/orchestra/sprint-finalizer.ts:4087` |
| `decay_after_sprints` | `20` | metadata/init docs `5` | `src/core/config.ts:1968-1970,3111-3115`; `src/cli/commands/init-templates.ts:542-543` |
| `spawn_backend` | `auto` | metadata `undefined`; regen `docker` | `src/core/config.ts:1917-1924,2868-2873,2723-2728` |
| `docker_timeout` | omitted/effective `undefined` | type + metadata + spawn fallback `1200` | `src/core/config-types.ts:1065-1067`; `src/core/config.ts:2383-2384,2875-2879`; `src/cli/commands/spawn.ts:819` |
| `dependency_pipeline_enabled` | `true` | regen `false` | `src/core/config.ts:2015-2017,2723-2728` |

Constants ayrıca memory için canonical/deprecated `5000/20` bildirir (`src/core/constants.ts:173-181`); dolayısıyla memory default'u iki değil üç ayrı semantic değere sahiptir.

### CFG-SD-005 — `CONFIG_METADATA` inventory veya default authority değil

**Severity:** high · **Classification:** RELATED_BUT_NONBLOCKING

Metadata comment'i “every top-level `DeckentConfig` key” iddiasındadır (`src/core/config.ts:2817-2821`). Gerçekte toplam 55 entry vardır: 50 top-level + 5 nested. Bunların yalnız 49'u canonical 141 typed root ile eşleşir; `chat_provider` metadata'da olup type'ta yoktur. Sonuç: **92 typed root metadata dışıdır**.

`claude_backend` metadata'da default `tmux` olarak yaşamaya devam eder (`src/core/config.ts:2940-2945`), create-default ise onu `spawn_backend` lehine özellikle kaldırdığını söyler (`src/core/config.ts:1916-1918`). Bu, deprecation lifecycle'ının tek authority ile yönetilmediğini gösterir.

### CFG-SD-006 — Truth gate kırmızı, eksik ve enforcement dışı

**Severity:** high · **Classification:** RELATED_BUT_NONBLOCKING

`node scripts/lint-config-truth.mjs` sonucu:

```text
declaration finite leaves: 449
createDefaultConfig leaves: 180
loadConfig runtime leaves: 185
CONFIG_METADATA entries: 55
issues: 589 = DIVERGENT 12 + MISSING_DEFAULT 400 + MISSING_METADATA 112 + MISSING_RUNTIME 65
```

Script'in shallow parser'ı yalnız aynı dosyadaki belli interface şekillerini okur; imported alias/mapped types, named constants/resolvers, deep merge, spread ve `mergeConfigs()` semanticlerini çözmez. Optional her leaf'i default zorunlu sayması 400 `MISSING_DEFAULT` sonucunu false-positive-heavy yapar. Buna rağmen `mode`, `memory_budget`, `decay_after_sprints`, `spawn_backend` divergence'ları gerçek semantic drift'tir.

**Optional-no-default ayrımı:** 400 `MISSING_DEFAULT` sonucu “400 defect” değildir. Optional/opt-in alanın absent kalması geçerli bir semantic olabilir; örneğin credentials, connector enablement, tenant-specific policy veya explicitly enabled feature blokları create-default'ta bulunmak zorunda değildir. Bir default eksikliği ancak (a) public contract effective default vaat ediyorsa, (b) consumer absent değeri farklı yorumluyorsa veya (c) iki authoring/resolution yüzeyi farklı effective değer üretiyorsa defect olarak sınıflandırıldı. Bu rapordaki gerçek default bulguları bu üç koşuldan en az birini kanıtlar; salt optional eksiklikler finding sayılmadı.

Truth parser'ın görmediği secondary default/resolver authority'leri ayrıca şunlardır:

```text
DEFAULT_TIMEOUT_CONFIG                         src/core/config.ts:229-248
DEFAULT_AUTO_DOCS                              src/core/config.ts:251-255
DEFAULT_TERMINAL_CONFIG                        src/core/config.ts:280-287
DEFAULT_PROMPT_CONFIG                          src/core/config.ts:293-336
DEFAULT_MODES                                  src/core/config.ts:530-561
DEFAULT_RUNTIME_ARTIFACT_RETENTION_CONFIG      src/core/config.ts:668-703
DEFAULT_FIX_CIRCUIT_BREAKER_CONFIG             src/core/config-types.ts:985-992
DEFAULT_LIFECYCLE_RECOVERY_CONFIG              src/core/config-types.ts:1008-1011
DEFAULT_ROUTING_V3_CONFIG / resolve...          src/core/routing/config.ts:60-78,151-164
DEFAULT_APPROVAL_LIFECYCLE_POLICY / resolve... src/core/approval-lifecycle-policy.ts:43-92,193-220
```

Bu kaynakların varlığı tek başına drift değildir; problem truth gate'in bunları semantic olarak evaluate etmeden `createDefaultConfig` textual literal'ini tek default authority saymasıdır. Özellikle routing-v3 kendi dosyasında tek-authority invariant'ını açıkça kurmuştur; yeni gate bu tür named resolver'ları “missing default” değil provenance olarak tanımalıdır.

Audit generator'ında bu ayrım uygulanmış ve regeneration ile doğrulanmıştır: 755 optional-no-explicit-default, 205 parent-present conditional ve yalnız 1 unconditional-required textual gap. Bu sayılar product defect sayısı değildir; semantic/default provenance review queue'sudur. Aynı regeneration, 185 runtime-parser leaf'i 117 public resolved root'tan ayrı saymış ve altı non-authored projection row'unu quarantine etmiştir.

Gate CI authority değildir: `scripts/script-registry.json:542-548` CI wiring'in bilerek deferred olduğunu kaydeder. Bu nedenle “truth gate PASS” üretim için mevcut bir invariant değildir; mevcut script kapsamı genişletilmeden PASS de completeness ispatlamaz.

### CFG-SD-007 — Validation open-world ve parçalı

**Severity:** high · **Classification:** RELATED_BUT_NONBLOCKING

`validateConfig()` body’sinde yalnız 47/141 canonical root doğrudan referanslanır; 94 root merkezi validator'da yoktur. Bazılarının ayrı resolver/Zod validator'ı vardır (`routing_v3`, approval, acceptance gibi), fakat unknown-key closure ve bütün contractı kapsayan tek schema yoktur. `deepMerge` bilinmeyen top-level key'leri raw merged object'te korur; çoğu resolved projection'da sessizce kaybolur. Sonuç: typo çoğunlukla typed error değil no-op'tur.

`NERVOUS_SYSTEM_SCHEMA` strict Zod schema'sı `src/core/config.ts:364-436` aralığında export edilir fakat production'da kullanılmaz; repo içindeki diğer referansları testlerdir. Production manual validation yalnız bir subset denetler (`src/core/config.ts:1180-1207`). Üstelik strict schema, public `NervousSystemConfig`teki `approve_timeout_ms`, `reject_suppress_ms`, `accept_cooldown_ms`, `worker_respawn` alanlarını (`src/core/config-types.ts:1905-1922`) içermez. Böylece type-valid config schema testinde reddedilirken production validation'da farklı davranır.

Pozitif karşı örnek: routing-v3 ayrı strict schema + default resolver'ı birlikte taşır (`src/core/routing/config.ts:24-78,124-164`). Ancak `enabled` alanının vestigial no-op olduğu aynı dosyada belirtilir (`src/core/routing/config.ts:10-13,37-58`), yani lifecycle temizliği yine eksiktir.

### CFG-SD-008 — Migration girişleri birbirine eşdeğer değil

**Severity:** high · **Classification:** RELATED_BUT_NONBLOCKING

- `getMissingFields()` yalnız top-level'i ve özel olarak `modes` altını tamamlar; diğer nested default bloklarına recursive migration yapmaz (`src/core/config-migration.ts:107-155`).
- File migration provider/model aliases, legacy mode isimleri, mode keys, routing labels, removed `usage_thresholds` ve duplicate cleanup uygular (`src/core/config-migration.ts:227-331`).
- `migrateConfigInMemory()` yalnız model aliases canonicalize eder; provider aliases, legacy mode rename, duplicate removal ve V1→V2 yoktur (`src/core/config-migration.ts:413-436`).
- `migrateConfigFull()` V1→V2 çağırır ama file migration'daki legacy mode rename, `usage_thresholds` removal ve spawn duplicate cleanup parity'sine sahip değildir (`src/core/config-migration.ts:445-472`). “Full” adı davranış parity'si sağlamaz.
- `loadConfig()` migration ihtiyacı görürse config okuma sırasında project dosyasını persist eder (`src/core/config.ts:2258-2269`). Sparse/opt-in config böylece 66-root create-default projection'ına genişletilebilir; read operation write-capable'dır.

Global config canonicalize edilip merge edilir (`src/core/config.ts:2166-2180`) fakat project ile aynı auto-migration/persist lifecycle'ından geçmez.

### CFG-SD-009 — Regenerate, CLI init ve MCP init ayrı authoring authority'ler

**Severity:** high · **Classification:** RELATED_BUT_NONBLOCKING

`REGEN_TEMPLATE_DEFAULTS` yalnız dört alan yazar: `spawn_backend: docker`, `dependency_pipeline_enabled: false`, top-level typed olmayan `haiku_allowed`, structured `brain_planning` (`src/core/config.ts:2723-2728`). `regenerateConfigSafe()` missing config'i canonical `createDefaultConfig()` ile değil bu ikinci authority ile üretir ve parent `.deckent` dizinini yaratmaz (`src/core/config.ts:2751-2800`).

CLI init `{mode, language, projectName, model_strategy, spawn_backend, max_workers, _auto_detected}` sparse shape'ini yazar (`src/cli/commands/init-steps.ts:191-243`); MCP init yalnız `{mode, language, projectName}` yazar (`src/mcp/tools/init.ts:90-103`). Aynı ürünün iki init adapter'ı aynı effective authoring/default contractını temsil etmez.

### CFG-SD-010 — Global path read/write contractı asimetrik

**Severity:** medium · **Classification:** RELATED_BUT_NONBLOCKING

Global loader platform-scoped ve legacy yolları precedence ile okuyabilir (`src/core/global-scope-resolver.ts:302-334`); `saveGlobalConfig()` ise legacy `GLOBAL_CONFIG_PATH`e yazar (`src/core/config.ts:2701-2710`). Aynı resolver dosyasının üst comment'i integration'ı “intentionally unwired” diye tanımlar (`src/core/global-scope-resolver.ts:18-22`) fakat `config.ts` bunu import edip kullanır. Read/write authority ve documentation aynı gerçeği anlatmıyor.

### CFG-SD-011 — Alias/deprecation lifecycle type ile aynı evrende değil

**Severity:** medium · **Classification:** RELATED_BUT_NONBLOCKING

- Provider aliases `brain_provider`, `worker_provider`, `fallback_provider`, `provider_overrides` grouped `providers.*` alanlarına canonicalize edilir; çelişkili dual definition fail eder (`src/core/provider-config-canonicalizer.ts:38-47,68-120`).
- Model aliases `brain_model`, `default_model`, `native_model`, `bot_agent.model`, `modes.*` içinde canonicalize edilir (`src/core/model-config-canonicalizer.ts:37-62`).
- Legacy mode aliases `max_plan→performance`, `max5x_plan→balanced`, `pro_plan→economic`, `unlimited→api` kabul edilir (`src/core/config.ts:478-491`). Ancak public `PlanMode` type ilk üçünü içerir, `unlimited` içermez (`src/core/config-types.ts:693`): runtime-accepted alias type universe dışında kalır.
- `routing_engine` v1/v2 etiketleri validation öncesi v3'e çevrilir (`src/core/config.ts:2287-2291`, merge twin `3323-3326`), buna karşın eski alan public type ve metadata yüzeylerinde yaşamayı sürdürür.

### CFG-SD-012 — Environment precedence sınırlı ve resolver-local

**Severity:** medium · **Classification:** RELATED_BUT_NONBLOCKING

Observed load precedence: defaults → canonicalized global → canonicalized/migrated project → grouped provider projection → env override. Loader'ın doğrudan env override seti yalnız şunlardır (`src/core/config.ts:2301-2320`):

```text
DECKENT_BRAIN_PROVIDER
DECKENT_WORKER_PROVIDER
DECKENT_MODE
DECKENT_LANGUAGE (fallback DECKENT_LANG)
DECKENT_STYLE
```

`DECKENT_CONFIG_RELOAD=1` cache'i bypass eder (`src/core/config.ts:2150-2155`); `DECKENT_LIVE_TRACE=1` ayrı resolver'da davranışı etkiler (`src/core/config.ts:1816-1836`). API token gibi başka env fallback'ler consumer-localdir. Public config metadata/schema env binding veya tek precedence registry taşımadığı için tüm override'ların merkezi olarak audit edilmesi mümkün değildir.

## 4. Main drift delta appendix

Bu audit bilinçli olarak pinned `ff48978fb78139ea34b8c5e98fc41532437af9c9` üzerinde kalır. Read-only karşılaştırılan current main `0d565b361ea599966cf7e485bef0d4eaade303c8`dir; branch rebase/merge edilmedi.

`git diff --name-status ff48978..5f9e851 --` içinde bu lane'i etkileyen tek production dosyası `src/cli/commands/init-steps.ts`tir. `config.ts`, `config-types.ts`, migration/canonicalizer, routing/approval defaults, metadata ve truth-gate dosyalarında bu aralıkta değişiklik yoktur.

Main, yeni bir init-only default authority eklemiştir:

- `DEFAULT_INIT_EXECUTION_BUDGET` worker için `maxTurns=40`, `maxTokens=4_000_000`, landing için `reserve_ratio=0.25` tanımlar (main `src/cli/commands/init-steps.ts:98-108`).
- Existing config `execution_budget` taşımıyorsa fresh/brownfield init bunu `newConfig`e ekler (main `src/cli/commands/init-steps.ts:225-235`).
- Chosen backend `subprocess` ise authored policy üzerine `unmetered_backend.action='hold'` merge eder (main `src/cli/commands/init-steps.ts:273-280`).

Bu delta pinned bulguları geçersiz kılmaz; CFG-SD-009'u güçlendirir: CLI init artık execution-budget için de `createDefaultConfig`/metadata/truth-gate dışında ayrı default policy authority'sidir. Main üzerinde completion uygulanmadan önce inventory yeniden üretilmeli ve init-only değerlerin canonical effective-default mu, generated starter policy mi olduğu açıkça sınıflandırılmalıdır. Main delta bu worktree'ye cherry-pick edilmedi.

Son read-only delta `5f9e851b572888e4239a6e2d0e3fa97b40b6db0b..0d565b361ea599966cf7e485bef0d4eaade303c8` tek `fix(xverify)` closure commit'idir. Production değişimleri `src/cli/commands/xverify.ts` ile `src/orchestra/cross-verify-production-ingress-authority.ts`; eşlik eden xverify testleri, hermeticity lint'i ve governance/projection dokümanlarıdır. `config.ts`, `config-types.ts`, migration/canonicalizer, routing/approval defaults, `CONFIG_METADATA`, truth-gate ve init default authority bu aralıkta değişmemiştir. Sonuç: 5f→0d delta'sı bu lane için yeni schema/default/resolution authority drift'i üretmez; pinned audit sayımları bilinçli olarak yeniden bazlanmadı.

## 5. Completion plan için zorunlu closure paketleri

1. **Tek versioned schema authority:** authored config, resolved config ve runtime-only state ayrı tipler olmalı. Public type, strict parser, defaults, metadata/docs ve deprecation map aynı descriptor'dan üretilmeli; extension/dynamic namespaces açıkça tanımlanmalı.
2. **Tek resolver:** `loadConfig()` ve `mergeConfigs()` aynı pure `resolveConfig(layers, environment)` çekirdeğini çağırmalı. Filesystem/cache yalnız adapter olmalı. Her 117 resolved root için authored/default/env provenance ve round-trip invariant testi gereklidir.
3. **Default taxonomy:** “field absent”, “effective default”, “generated starter value”, “consumer safety fallback” ayrılmalı. `mode`, memory, spawn, docker timeout ve dependency pipeline için owner-approved tek semantic değer seçilip tüm projection'lar regenerate edilmelidir.
4. **Strict unknown-key policy:** known legacy alias typed deprecation diagnostic üretmeli; bilinmeyen key fail etmeli. `chat`, `max_workers`, `token_throttle_ms`, `_auto_detected`, `enforce_rbac` ya canonical schema'ya alınmalı ya internal/state namespace'e taşınmalıdır.
5. **Pure, versioned migration registry:** file/in-memory/full aynı transform graph'ını kullanmalı; persist explicit command veya açık policy olmalı. Read-time mutation atomic backup/receipt ile görünür hale gelmelidir.
6. **Generated truth gate:** TypeChecker/real schema üzerinden finite + wildcard inventory çıkarılmalı; `createDefaultConfig`, resolver ve metadata'yı semantic olarak çalıştırmalı; `mergeConfigs`, CLI init, MCP init ve regenerate adapter parity'sini test etmeli. Gate required CI registry'ye bağlanmadan “config complete” denmemelidir.
7. **Regression closure:** bilinen `rollback/doc_tracking/observability` whitelist'i kaldırılmalı; scalar flags ve security gates aynı battery'ye eklenmeli. Tests must assert both presence and behavioral consumer wiring.

## 6. Verification record

| Check | Result |
|---|---|
| pinned SHA / branch | `ff48978fb78139ea34b8c5e98fc41532437af9c9` / `audit/config-completion-20260825` |
| TypeScript AST root inventory | 141 `DeckentConfig` roots |
| recursive TypeChecker inventory | 1,002 semantic leaf-pattern; finite mapped sets + wildcard contracts above; independent 1,106 walk exact olarak reconcile edildi |
| generated union / presence | 1,146 paths; optional 755, conditional 205, unconditional required gap 1; genuine dynamic descendants 28; input-only undeclared 3 |
| value-free input projection | PASS: `field-universe` schema v2; 197/197 input rows only `inputPresent` + allowlisted `inputValueKind`; raw/legacy `inputValue` keys=0; serialized sentinel assertion PASS |
| default-parser quarantine | raw 180; normalized 178; 2 synthetic `__spread__` artifacts excluded from union |
| charter dimensions | 1,146/1,146 rows × 9 dimensions have typed disposition + reason + evidence array; missing=0; runtime-proof promotion=0 |
| resolved-vs-parser separation | 117 public roots vs 185 textual runtime-parser leaves; 6 rows quarantined |
| candidate/evidence separation | raw config candidates 801; env candidates 1,757; real `process.env` evidence 2,048 rows / 135 static names / 241 dynamic rows; `DECKENT_E*` evidence 0 |
| resolver AST comparison | `loadConfig=111`, `mergeConfigs=56`, load-only=55 explicit roots |
| runtime resolver smoke | `mergeConfigs(null, project)` returned 58 own keys; sampled missing fields `undefined` |
| config truth diagnostic | expected-red: 589 issues (`12/400/112/65`) |
| scoped Vitest | PASS: 4 files, 75 tests |
| generator regeneration | PASS: `fields=1146`, `consumers=384`, `truthIssues=589`; syntax check PASS |
| dynamic-contract boundary | PASS: all ordinary-container fixtures have `dynamicAncestor=null`; 142 N/A-bearing rows, bad wildcard/repeated evidence=0; exact `modes.api.max_workers → modes.*.max_workers` |
| main drift | read-only `ff48978..0d565b3`; base→5f adds init-only execution-budget authority; 5f→0d is xverify-only and adds no schema/default authority |

Bu çalışma product/source/test dosyasını değiştirmez; yalnız audit generator'ı, generated audit matrix/JSON'ları, bu rapor ve handoff receipt güncellenmiştir. Finding'ler yalnız evidence-backed completion input'udur.
