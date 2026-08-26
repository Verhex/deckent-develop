# Agent 02 — Runtime Config Wiring Audit

## Hüküm

**NO_GO — runtime configuration contract ürün-bitmiş değildir.** Pinned base
`ff48978fb78139ea34b8c5e98fc41532437af9c9` üzerinde config için tek bir etkin otorite yoktur:

1. ana yol `createDefaultConfig → global → project → env → validate → ResolvedConfig` zincirini kullanır;
2. çok sayıda sync CLI/API/MCP/worker yolu yalnız project `.deckent/config.json` dosyasını doğrudan okur;
3. bazı davranışlar config field'ı yerine hard-coded fallback kullanır;
4. bazı consumer'lar type/default/resolver'da bulunmayan intersection-only alanlar okur;
5. project/global config'i değiştiren writer'ların çoğu ortak bir atomic/CAS/lock servisini kullanmaz.

Sonuç olarak bir JSON anahtarı dosyada mevcut, type-valid ve hatta `ResolvedConfig` üzerinde ilan edilmiş olsa bile davranışı değiştirmeyebilir. Tersine, typed contract'ta bulunmayan bazı anahtarlar deep-merge/pass-through veya raw reader sayesinde çalışabilir. Bu rapordaki `UNREACHABLE`, üretim ingress'inden ilgili branch'e değer ulaştırılamadığı kanıtlanan durumu; `UNCONSUMED`, resolve edilen değerin üretim davranışına bağlanmadığı durumu; `HOLD`, dinamik map/plugin/reflection nedeniyle statik kanıtın tamamlanamadığı durumu ifade eder.

## Kapsam ve yöntem

- Snapshot authority: `docs/audits/config-completion-2026-08-25/AUDIT-CHARTER.md:1`.
- Makine alan evreni: 1.146 union path; 449 doğrudan `DeckentConfig` leaf'i; imported/nested semantic expansion ile 1.002 config leaf'i; 178 normalized default path'i (180 parser leaf'inden 2 synthetic spread artifact'ı karantinada); 185 `truth.runtime` parser leaf'i (6 runtime parser artifact'ı karantinada); 55 metadata default'u; 197 input-snapshot leaf'i. Karantina artifact'ları union sayısına dahil edilmemiştir. Kaynak: `docs/audits/config-completion-2026-08-25/field-universe.json`.
- Makine consumer keşfi: 384 matched path, 2.372 reference, 801 raw-config-file candidate, 2.048 environment reference, 1.757 environment candidate, 2.114 literal-path reference ve 3.634 heuristic candidate. Kaynak: `docs/audits/config-completion-2026-08-25/consumer-index.json`. **Bu sayılar wiring kanıtı değildir:** literal scanner `DECKENT_E004` gibi error code'ları/env sanabilir; `tsconfig.json`, `cost-config.json`, docs string'leri ve IPC config'i project config I/O sanabilir.
- Buna ek TypeScript type-checker taraması, test/spec/d.ts hariç 1.314 production TS/TSX dosyasında 1.438 config-benzeri property access, 102 loader/default call, 133 raw config literal-I/O adayı, 208 config import'u ve 15 config spread/pass-through sınırı buldu. `src/core/config.ts` ve type dosyası çıkarıldığında `DeckentConfig | ResolvedConfig` kökünden 36 dosyada 270 typed access / 107 statik path kaldı.
- Makine indeksleri discovery aid'dir. Her hüküm aşağıda gerçek production code ile yeniden doğrulandı. Test import'u production wiring sayılmadı.
- Dynamic map/array'ler (`providers.*`, `modes.*`, policy rule arrays, connector maps) finite leaf gibi uydurulmadı; wildcard contract olarak `CONFIG-FIELD-MATRIX.md` authority'sine bırakıldı.

### Bağımsız scanner doğrulaması ve consumer taxonomy

Literal-index false-positive'lerini ayırmak için ikinci bir AST pass yalnız gerçek member/call expression'ları üzerinde çalıştırıldı:

- `process.env.KEY` / `process.env['KEY']` / `import.meta.env.KEY` biçiminde 149 exact access, 81 unique key bulundu; bu source setinde exact `import.meta.env` access yoktur. Canonical config compiler bunların yalnız yedisini okur: `DECKENT_CONFIG_RELOAD`, `DECKENT_BRAIN_PROVIDER`, `DECKENT_WORKER_PROVIDER`, `DECKENT_MODE`, `DECKENT_LANGUAGE`, `DECKENT_LANG`, `DECKENT_STYLE` (`src/core/config.ts:2154`, `src/core/config.ts:2301`). Provider credentials, worker handoff env'i, debug/test/surface toggles config precedence kanıtı sayılmadı.
- `readFile*` / `writeFile*` / `rename*` / `copyFile*` call-expression'larında config-benzeri destination argümanı olan 84 aday bulundu. Her call manuel destination classification'dan geçirildi; `cost-config.json`, pricing datasets, agent-local config, IPC runner config, `tsconfig.json` ve generic variable-name false positive'leri project `.deckent/config.json` envanterine alınmadı. `multiConfigPath` ve `providerConfigPath` adlarının ise `src/cli/commands/init-steps.ts:370` ve `src/cli/commands/init-steps.ts:548` ile gerçek project config'e çözüldüğü doğrulanıp writer envanterine dahil edildi.

Her reference şu üç sınıftan biri olarak değerlendirildi:

1. **Authoring/loader sınıfı:** type declaration, default, validator, migrator, metadata, canonicalizer, resolver ve self-read. Bunlar tek başına behavioral consumer değildir.
2. **Behavioral policy/runtime sınıfı:** field bir admission, route, spawn, approval, prompt, retention, delivery veya execution branch'ini değiştirir.
3. **Surface sınıfı:** CLI/MCP/API/Desktop/Dashboard değeri gösterir veya editler. Gösterim tek başına runtime davranış kanıtı değildir.

Bu ayrım olmadan matrix'te `src/core/config.ts` self-reference'ı bulunan `output_splash`, `prompt.adr_render`, `notify_on_complete` ve `memory.*` gibi alanlar yanlış `STATIC_CHAIN_PRESENT` görünür. Örnek karşı kanıtlar: `output_splash` defaultu final projection'a taşınmaz; `prompt.adr_render` validator/resolver'dan geçer ama task context'e aktarılmaz; `notify_on_complete` resolved self-read dışında behavior consumer'ı yoktur; `memory.*` yalnız declaration/authoring contract'ında kalır. Dolayısıyla bu raporda green yalnız ikinci sınıf consumer + gerçek ingress bulunduğunda verilmiştir.

## Canonical producer → resolver zinciri

| Aşama | Gerçek davranış | Kanıt | Hüküm |
|---|---|---|---|
| Default producer | `createDefaultConfig()` mutable olmayan fresh default ağacı üretir. | `src/core/config.ts:1897` | Çalışıyor; fakat default ağacındaki her field resolved literal'e taşınmıyor. |
| Cache | Cache root + global/project `mtimeMs:size:ino` stamp ile tutulur; `DECKENT_CONFIG_RELOAD=1` veya `force` bypass eder. | `src/core/config.ts:1877`, `src/core/config.ts:2150` | Canonical çağrılar için çalışıyor; raw reader'lar cache'i ve aynı snapshot authority'sini bypass eder. |
| Global layer | Platform-resolved global dosya okunur; provider/model aliases canonicalize edilir; default üzerine deep-merge edilir. | `src/core/config.ts:2166` | Çalışıyor. |
| Project layer | Project dosyası okunur; transient parse için retry, gerçek parse corruption için staged replacement + backup yapılır; aliases canonicalize ve global üzerine deep-merge edilir. | `src/core/config.ts:2182`, `src/core/config.ts:2232` | Loader recovery atomic swap kullanır; diğer writer'lar aynı güvenceyi paylaşmadığı için incident sınıfı kapanmış değildir. |
| Provider projection | Grouped `providers` flat compatibility alanlarına projekte edilir. | `src/core/config.ts:2293` | Çalışıyor; conflicting aliases daha önce canonicalize edilir. |
| Environment | Canonical loader yalnız brain provider, worker provider, mode, language/lang ve deckent style env override'larını uygular. | `src/core/config.ts:2299` | Diğer env-twin'ler consumer-lokal ve ortak precedence contract'ı dışında. |
| Specialized resolution | Mode/model strategy, coverage gates, approval lifecycle/rules, routing-v3, timeout, terminal, prompt, runtime retention ve provider-limit authority kendi resolver'larına sahiptir. | `src/core/config.ts:2322`, `src/core/config.ts:2484`, `src/core/config.ts:2493`, `src/core/config.ts:2501`, `src/core/config.ts:2507`, `src/core/config.ts:2544`, `src/core/config.ts:2586` | Statik “createDefaultConfig'te yok” her zaman gerçek missing default değildir. |
| Final projection | Elle yazılmış `resolved` object literal sadece seçilmiş alanları geçirir; `$DECK` interpolation sonrası cache'e alınır. | `src/core/config.ts:2363`, `src/core/config.ts:2598` | Ana structural drift kaynağı. Deep-merge'de yaşayan alan final literal'de sessizce düşebilir. |

### Gerçek missing default ile resolver-level default ayrımı

`scripts/lint-config-truth.mjs` pinned base'te 449 type / 180 default / 185 runtime / 55 metadata sayıp 589 issue üretir. Bu 589 sayı doğrudan “589 runtime bug” değildir:

- `approval.rules/lifecycle` `resolveApprovalConfig()` ve lifecycle resolver'ında defaultlanır (`src/core/config.ts:1777`).
- `routing_v3.*` ayrı `resolveRoutingV3Config()` ile defaultlanır (`src/core/config.ts:2501`).
- `runtime_artifact_retention.*` ayrı resolver ile çözülür (`src/core/config.ts:2493`).
- `timeout`, `terminal`, `prompt` block'ları nested default ile çözülür (`src/core/config.ts:2484`, `src/core/config.ts:2586`, `src/core/config.ts:2593`).
- `provider_limits` sayısal izin uydurmaz; global/project authored layers'tan immutable authority snapshot üretir (`src/core/config.ts:2537`, `src/core/config.ts:2544`). Bu bilinçli “no fabricated default” contract'ıdır.

Buna karşılık `output_splash`, `observability.rotation`, `notify_channel`, `notify_url` gibi değerler gerçekten `createDefaultConfig()` tarafından üretilir (`src/core/config.ts:1985`, `src/core/config.ts:1997`, `src/core/config.ts:2030`) fakat final resolved literal'e taşınmaz. Bunlar parser limitation değil, doğrulanmış resolution bug'ıdır.

## `loadConfig` / `mergeConfigs` divergence

AST ile final object literal anahtarları karşılaştırıldığında `loadConfig` 111, `mergeConfigs` 56 syntactic property üretmektedir. Spread isminin farklı görünmesi dışında `mergeConfigs`'te olup live loader'da olmayan bir field yoktur; live loader'da olup `mergeConfigs`'te olmayan 55 field vardır:

```text
acceptance_enforcement, acceptance_matrix, ai_planner_timeout, approval_channels,
auth_mode, autonomous, bot_agent, bot_capabilities, boundary_enforcement,
cleanup_delay_ms, debt_preflight_enabled, decay_after_sprints, docker_image,
docker_timeout, enforce_principal_assurance, evaluation_rubric,
fix_circuit_breaker, fix_phase_enabled, heartbeat_timeout, human_checkpoints,
identity, lifecycle_recovery, local_llm, lock_stale_threshold, max_fix_retries,
memory_budget, model_strategy, native_context_tokens, native_model,
native_provider, nervous_system, notify_connectors, notify_on_complete,
notify_outbox_drain_interval_ms, ollama_host, openai_base_url, patterns_enabled,
pre_sprint_tests, project_identity_enabled, prompt, retry_transient_failures,
rollback_policy, routing, routing_config, routing_engine, rubric_max_retries,
scan_interval, spawn_backend, sprint_checkpoint_interval,
strict_tenant_isolation, timeout, worker_home_tmpfs_size, worker_memory_limit,
worker_memory_limit_by_kind, worker_memory_swap
```

`mergeConfigs` production `src/**` içinde çağrılmaz; yalnız export tanımı vardır (`src/core/config.ts:3270`). Aynı adlı `src/core/pricing-updater.ts:229` farklı lokal fonksiyondur. Buna karşılık testler config fixture authority'si olarak yoğun biçimde `mergeConfigs` kullanır; örneğin `tests/core/config-global.test.ts:81` ve `tests/core/config-worker-comms.test.ts:117`. Bu nedenle:

- mevcut test-green, live `loadConfig` wiring'ini kanıtlamaz;
- test fixture bazı live alanları hiç taşımaz;
- elle senkronize “twin literal” yorumları gerçek değildir; örneğin kaynak kendi içinde ikiz tutulmasını şart koşar (`src/core/config.ts:2557`, `src/core/config.ts:3453`) ama 55-key divergence mevcuttur.

**Disposition: P0 structural drift.** Tek public resolver/projection üreticisine indirgenmedikçe yeni her field için aynı born-but-unwired riski devam eder.

## Doğrulanmış kritik runtime drift register

### RW-001 — `prompt.adr_render`, `prompt.adr_min_relevance`, `prompt.task_profiles` authored değerleri worker prompt'a ulaşmıyor

- Producer/type/default/validation var: `src/core/config-types.ts:1718`, `src/core/config-types.ts:1727`, `src/core/config-types.ts:1837`; resolved prompt deep-merge'i var (`src/core/config.ts:2593`).
- Gerçek worker prompt context'i yalnız `personaRenderMode` ve core-externalization kararını config'ten geçirir; `adrMinRelevance`, `adrRender`, `taskProfiles` set edilmez (`src/orchestra/task-builder.ts:2908`, `src/orchestra/task-builder.ts:2927`).
- Compiler `adrMinRelevance` yoksa duplicate constant `0.3` kullanır (`src/orchestra/prompt-god-template.ts:564`, `src/orchestra/prompt-god-template.ts:714`).
- ADR render davranışı config yerine hard-coded: explicit refs daima `full`; background ADR daima `operative` + scope gate (`src/orchestra/prompt-god-template.ts:1024`, `src/orchestra/prompt-god-template.ts:1028`).
- `task_profiles` compiler seam'i mevcut ama task builder bunu beslemez (`src/orchestra/prompt-god-template.ts:797`, `src/orchestra/task-builder.ts:2908`).

Hüküm: üç alan **UNCONSUMED at production ingress**. `prompt.persona_render` çalışır (`src/orchestra/task-builder.ts:2927`); `exclude_dynamic_system_prompt_sections` ve `worker_core_system_prompt` scheduler/spawner'a bağlıdır (`src/orchestra/scheduler-effects.ts:642`, `src/orchestra/sprint-spawner.ts:1256`). Bütün `prompt` block'unu dead saymak yanlış olur.

### RW-002 — Execution/approval authority hard-flip'lerinde unreachable branches

| Field | Producer / resolver | Consumer | Hüküm |
|---|---|---|---|
| `enforce_rbac` | Yalnız `ResolvedConfig` üzerinde ilan (`src/core/config-types.ts:2064`); `DeckentConfig`, default ve final projection yok. | Sprint/backlog authority gate (`src/orchestra/sprint-runtime.ts:32`, `src/orchestra/backlog-trigger.ts:31`). | **UNREACHABLE**, gerçek config'ten daima falsy. |
| `enforce_least_privilege` | Raw type var (`src/core/config-types.ts:1056`) ve resolved type var (`src/core/config-types.ts:2079`), fakat iki resolver literal'inde yok. | Capability registry gerçekten config parametresi alır (`src/core/capability-runtime.ts:142`, `src/core/capability-runtime.ts:176`). Production composition config'i üçüncü argüman olarak geçirmez (`src/orchestra/autonomous/runtime-loop.ts:331`, `src/cli/helpers/process-runtime.ts:67`). | **Çift UNREACHABLE**: resolver ve composition eksik. |
| `risk_gate_enabled` | Raw/resolved type var (`src/core/config-types.ts:1061`, `src/core/config-types.ts:2085`), final projections yok. | Autonomous dispatcher permit + high-risk branch'i (`src/orchestra/autonomous/execute-dispatcher.ts:492`). | **UNREACHABLE**. |
| `enforce_principal_assurance` | Raw type + explicit default-off carry (`src/core/config-types.ts:1051`, `src/core/config.ts:2475`). | RunFlow admission (`src/orchestra/run-flow-plan-service.ts:538`). | **WIRED**; yukarıdaki üç alanla birlikte dead sayılmamalı. |

Approval authority'nin canonical CLI/MCP ayrımı doğrudur: CLI `approvals decide` loaded authority + terminal auth window kullanır (`src/cli/commands/approvals.ts:259`, `src/cli/commands/approvals.ts:275`); MCP yalnız pending inbox'tır ve decide yüzeyi yoktur (`src/mcp/tools/approvals.ts:13`, `src/mcp/tools/approvals.ts:23`). Buna rağmen HTTP karar flag'i `approval.api_decide` raw project config'ten okunur (`src/api/server.ts:569`); global layer ve canonical cache yok sayılır. `api.control_mutations` da undeclared raw project/env twin'dir (`src/api/server.ts:589`). Bunlar authority semantics bakımından ayrı bir config SSOT ihlalidir.

### RW-003 — Consumer var, canonical schema/resolver yok

| Alan | Consumer evidence | Canonical eksik | Runtime sonucu |
|---|---|---|---|
| `provider_overflow` | `src/orchestra/sprint-spawner.ts:100`, `src/orchestra/sprint-spawner.ts:109` | `DeckentConfig`, default, validation, final projection yok. | **UNREACHABLE**. |
| `partial_promotion_enabled` | Intersection cast + branch `src/orchestra/sprint-phases.ts:2156` | Tüm canonical producer/resolver zinciri yok. | **UNREACHABLE**. |
| `scope_auto_expand_enabled` | Intersection cast + branch `src/orchestra/sprint-phases.ts:2281` | Tüm canonical producer/resolver zinciri yok. | **UNREACHABLE**. |
| `native_cost_ceiling_usd` | REPL loaded config üzerinde cast `src/cli/repl/run.tsx:1167` | Final projection bu unknown top-level key'i düşürür. | **UNREACHABLE**. |
| `terminal.rpc_debug` | REPL branch `src/cli/repl/run.tsx:789` | `TerminalConfig` type/validation/default'ta yok; nested object pass-through olduğundan project-authored key korunur. | **Çalışabilir ama undeclared/unvalidated**. |
| `tool_surface.progressive` | Native registry resolver `src/cli/repl/native-tool-registry.ts:154` | `ToolSurfaceConfig` yalnız `enabled`/`riskThreshold` ilan eder (`src/core/config-types.ts:414`). Nested pass-through alanı korur. | **Çalışabilir ama public contract dışı**. |
| `api.control_mutations` | `src/api/server.ts:595` | Type/default/validation/resolver yok. | Project raw veya `DECKENT_CONTROL_MUTATIONS=1` ile çalışır; precedence lokal. |
| `limit_gate.*` | Global + project raw merge `src/cli/commands/limits.ts:48`, `src/cli/commands/limits.ts:67` | Root type/default/validation/resolved yok. | CLI-local extension olarak çalışır. |
| `usage.weekly_budget_equiv` | `src/cli/commands/usage.ts:92`, `src/cli/commands/usage.ts:103` | Root type/default/validation/resolved yok. | Project-only extension olarak çalışır. |
| `worker_image` | Init/upgrade raw consumer'ları `src/cli/commands/init.ts:194`, `src/cli/commands/init-steps.ts:670`, `src/cli/commands/upgrade.ts:441`. | Root type/default/validation/resolved yok. | Project-only image override olarak çalışır; canonical config surface dışı. |
| `ci_guardian.*`, `tenants`, `subscription`, `sprint_started_at` | Raw readers/writers: `src/core/plugin-hooks.ts:541`, `src/api/enterprise-endpoint.ts:93`, `src/core/subscription.ts:151`, `src/cli/commands/status.ts:551`. | Ortak root schema/resolver yok veya local ad-hoc shape. | Surface-local config dialect'leri oluşmuş durumda. |

`token_throttle_ms`, `chat_provider` ve top-level `max_workers` da canonical `DeckentConfig`/`ResolvedConfig` yerine config.ts içindeki intersection aliases ile taşınır (`src/core/config.ts:81`). Bunlar bugün çalışır, fakat public schema ve generated surface'ler bunları eksik görebilir.

### RW-004 — Declared/defaulted/consumed ama final projection'da düşen alanlar

| Alan | Producer | Consumer / ingress | Hüküm |
|---|---|---|---|
| `output_splash` | Default true `src/core/config.ts:1997`, resolved type `src/core/config-types.ts:2048`. | Sprint init branch `src/orchestra/sprint-phases.ts:1500`; helper falsy ise splash'i kapatır (`src/cli/helpers/splash.ts:63`). | `loadConfig` ve `mergeConfigs` final literal'lerinde yok; **daima off**. Kullanıcının “true ama basmıyor” gözlemi doğrulandı. |
| `skill_routing` | Raw type/default var (`src/core/config-types.ts:1169`, `src/core/config.ts:1979`). | `routeTask` config override okur (`src/orchestra/task-router.ts:262`), spawner `ResolvedConfig` geçirir (`src/orchestra/sprint-spawner.ts:2027`). | Resolved type/literal yok; **authored override no-op**. |
| `notify_channel` + `notify_url` | Default/type var (`src/core/config.ts:1988`, `src/core/config-types.ts:1201`). | Webhook resolver çalışır (`src/core/notify-bootstrap.ts:78`); CLI start, autonomous ve detached runner çağırır (`src/cli/commands/start.ts:604`, `src/cli/commands/autonomous.ts:1375`, `src/orchestra/sprint-runner-entry.ts:591`). | Final literal'ler drop eder; **webhook config no-op**. `notify_connectors` ayrı, wired yoldur. |
| `notify_on_complete` | Default + loadConfig carry (`src/core/config.ts:1985`, `src/core/config.ts:2575`). | Config/types/dashboard dışı production behavior reader bulunmadı. | **UNCONSUMED**. |
| `doc_tracking.sync_on_finalize` | Raw/resolved type var (`src/core/config-types.ts:1579`, `src/core/config-types.ts:2277`). | Finalizer gate gerçek (`src/orchestra/sprint-finalizer.ts:1399`). | İki final literal de drop eder; **daima off**. |
| `observability.rotation.*` | Default + raw/resolved type var (`src/core/config.ts:2030`, `src/core/config-types.ts:1515`, `src/core/config-types.ts:2304`). | Finalizer rotation'a geçirir (`src/orchestra/sprint-finalizer.ts:4486`). | Final projection drop eder; authored/default values **unreachable**, rotator kendi fallback'ine kalır. |
| `persona_integrity.min_bytes` | Final projection defaultlar (`src/core/config.ts:2541`). | Shared choke point options kabul eder (`src/orchestra/result-collector.ts:1063`). | Production wrapper options geçirmez (`src/orchestra/result-collector.ts:1034`), constant kullanılır (`src/orchestra/result-collector.ts:1082`). Authored threshold **no-op**. Dokümanda anılan `persona_integrity.enforce` typed değildir ve production ingress yoktur (`src/orchestra/result-collector.ts:1053`). |

### RW-005 — Declared product blocks with no live behavior closure

- `memory` V2 block (`backend`, `search`, `semantic_provider`, `decay_after_sprints`, `export_*`, `custom_types`, `keyword_aliases`) ilan edilir (`src/core/config-types.ts:1353`), fakat `loadConfig`/`mergeConfigs` whole-block carry yapmaz ve production property consumer bulunmadı. Ürünün SQLite memory kodunun mevcut olması bu config block'unu wired yapmaz. **UNCONSUMED/UNRESOLVED**.
- `computer_use` resolver'da artık pass-through'dur (`src/core/config.ts:2566`) ve status yüzeyi bunu görebilir; fakat production executor dosyası kendi eksik wiring'ini açıkça belirtir (`src/core/computer-use-exec.ts:713`). Bu bir feature-completion değil, **surface-observable foundation / HOLD**.
- Aşağıdaki root alanlar için production davranış consumer'ı bulunmadı; çoğu yalnız declaration/default/metadata/dashboard label veya comment'te görünür: `decision_engine`, `learning`, `collaboration`, `notifications`, `auto_clean_locks`, `cost_optimization`, `api_keys`, `output_theme`, `output_render_mode`, `search_enabled`, `search_provider`, `search_cache_ttl`, `telemetry_enabled`, `telemetry_anonymous`, `detected_env`, `multi_ide_mode`, `patterns_enabled`, `project_identity_enabled`, `scan_interval`, `boundary_enforcement`, `lock_stale_threshold`, `rollback_policy`, `evaluation_rubric`, `rubric_max_retries`, `routing_config`. `decision_engine`, `collaboration`, `api_keys`, `evaluation_rubric`, `rubric_max_retries`, `routing_config` için config/type alanı dışında doğrudan production property read de yoktur. **UNCONSUMED**; dynamic plugin access için `HOLD` notu korunmalıdır.
- `routing_v3.enabled` ise bilinçli vestigial compatibility alanıdır; doğrudan execution gate sayılmaması type contract'ında açıklanır (`src/core/config-types.ts:566`). Bunu accidental dead flag diye sınıflandırmak yanlış olur.
- Eski yorumlar gerçeği ters gösterir: `computer_use`, `worker_output_contract`, `routing_v3` yorumları resolver'ın bunları geçirmediğini söyler (`src/core/config-types.ts:2244`), ancak code bunları geçirir (`src/core/config.ts:2566`, `src/core/config.ts:2501`). Benzer şekilde `ReplSurfaceConfig.bg_turns` ve `TerminalConfig.run_flow_v2` için “reader yok” yorumları güncel consumer'larla çelişir; run-flow çeşitli CLI/MCP/API ingress'lerinde okunur (`src/cli/commands/start.ts:442`, `src/mcp/tools/start.ts:229`, `src/api/run-flow-routes.ts:556`).

## Raw `.deckent/config.json` bypass envanteri

Raw sync reader kullanmak tek başına bug değildir; bug, canonical global→project→env→validation→interpolation semantics'i bilinçli bir snapshot API ile yeniden üretmeden farklı otorite yaratmasıdır.

| Raw domain | Reader/writer evidence | Görülen katmanlar | Etki |
|---|---|---|---|
| API approval/control | `src/api/server.ts:569`, `src/api/server.ts:595` | Project; control için env twin | Global ignored; undeclared API dialect. |
| API static token/OIDC/bind/approval sweep | `src/api/server.ts:2277`, `src/api/server.ts:2292`, `src/api/server.ts:2363`, `src/api/server.ts:2420` | Explicit/env/project'e göre field-local precedence | `loadConfig.api_oidc` kullanılmaz; global layer ignored; aynı server içinde mixed authority. |
| Dashboard OIDC | `src/api/oidc-callback-endpoint.ts:81` | Project only | API OIDC ile dahi farklı block/precedence. |
| Enterprise tenants | `src/api/enterprise-endpoint.ts:93`, `src/api/enterprise-endpoint.ts:475` | Project only | Undeclared management-plane dialect ve ayrı writer. |
| Tenant isolation | `src/api/tenant-scope.ts:31`, `src/api/tenant-scope.ts:47` | Global→project bilinçli sync mirror | Semantics canonical loader'a yakın; yine de ikinci implementation drift riski. |
| Limits | `src/cli/commands/limits.ts:48`, `src/cli/commands/limits.ts:67` | Global→project | Canonical schema yok; CLI-only. |
| Usage | `src/cli/commands/usage.ts:92` | Canonical language + project-only usage extension | Tek command içinde iki config authority. |
| Resources | `src/cli/commands/resources.ts:36`, `src/cli/commands/resources.ts:154` | Project only + literals | Global/env/default resolver ignored. |
| Language/i18n | `src/cli/helpers/i18n.ts:23`, `src/cli/helpers/i18n.ts:33` | Project only | Canonical `DECKENT_LANGUAGE`/global semantics ile yüzey dili ayrışabilir. |
| Cleanup tmux session | `src/cli/commands/cleanup.ts:203`, `src/cli/commands/cleanup.ts:208` | Project only, undeclared `tmux_session` | Cleanup target selection canonical schema dışıdır. |
| Status renderer | `src/cli/helpers/status-renderer.ts:33`, `src/cli/helpers/status-renderer.ts:437` | Project only; config ile runtime timestamps aynı dosyada | `spawn_backend`, `max_workers` canonical snapshot'tan; `sprint_started_at`/`sprint_hard_timeout` runtime state'ten ayrışabilir. |
| Worker prompt injections | `src/orchestra/task-builder.ts:2264`, `src/orchestra/task-builder.ts:2276`, `src/orchestra/task-builder.ts:2297` | Project only | `worker_comms`/`tools` global overrides prompt'a ulaşmaz; spawner'ın resolved view'ından ayrışır. |
| Worker live trace | `src/agents/worker.ts:452`, `src/agents/agentic-worker-entry.ts:407` | Worker env + project only | Parent resolved config'ten bağımsız per-process policy. |
| Autonomous enable | `src/cli/commands/autonomous-mission.ts:31`, `src/mcp/tools/autonomous.ts:81` | Project raw; diğer işlemler `loadConfig` | Aynı command/tool içinde gate ve runtime farklı snapshot görebilir. |
| Nervous config | `src/cli/commands/config-nervous.ts:90`, `src/mcp/tools/nervous.ts:35` | Project raw | Alias şekilleri ve writer'lar ayrık. |
| Retention | `src/orchestra/sprint-finalizer.ts:4664`, `src/orchestra/sprint-finalizer.ts:4704`, `src/core/sprint-archive.ts:231` | Project raw | Global retention ignored; `ResolvedConfig` üzerinde bu alanlar yok. |
| Last sprint id | `src/core/utils.ts:183`, `src/core/utils.ts:237` | Project raw | Deliberate persisted state/config mixing; atomic writer var ama config generation concurrency'sine katılır. |
| Config/doctor/help/managed-doc projections | `src/cli/commands/config.ts:90`, `src/cli/commands/doctor.ts:190`, `src/mcp/resources/config.ts:24`, `src/mcp/tools/help.ts:110`, `src/orchestra/managed-docs/managed-doc-runner.ts:185` | Çoğunlukla project raw; bazı command'lar sonra `loadConfig` | Bunlar surface/diagnostic consumer'dır; behavior wiring ispatlamaz ve language/routing gibi değerleri farklı precedence ile gösterebilir. |

Canonical cache yalnız `loadConfig` çağrılarını bir snapshot'a bağlar (`src/core/config.ts:2153`); raw reader'lar dosyayı her seferinde yeniden okuyabilir. Bu yüzden aynı process bir config mutation sonrasında hem eski cached resolved snapshot'ı hem yeni raw project snapshot'ı aynı anda kullanabilir. Bu bir **temporal split-brain**'dir.

## Config clone / pass-through sınırları

Typed scan şu üretim spread sınırlarını buldu: autonomous context/config (`src/cli/commands/autonomous.ts:140`, `src/cli/commands/autonomous.ts:1208`), xverify (`src/cli/commands/xverify.ts:682`), process runtime (`src/cli/helpers/process-runtime.ts:59`, `src/cli/helpers/process-runtime.ts:82`), model selector (`src/orchestra/model-selector.ts:339`) ve exact-plan input (`src/orchestra/exact-plan-start-service.ts:1264`).

Bu spread'ler `ResolvedConfig` üzerinde gerçekten var olan alanı korur; resolver'ın düşürdüğü alanı geri getirmez. Ayrıca downstream helper dar bir structural type kullanıyorsa typed path inventory leaf'i göremez. Bu nedenle machine `consumer-index.json` 384-path geniş katalog, 107-path typed-root taraması ise güvenilir lower bound'dur; ikisi birbirinin yerine geçmez.

## Çalıştığı doğrulanan ana runtime aileleri

Bu tablo “her config dead” gibi yanlış bir genellemeyi engeller ve producer→resolver→consumer→entrypoint zincirinin olumlu örneklerini kaydeder.

| Aile | Resolution | Consumer | Entrypoint / proof durumu |
|---|---|---|---|
| Provider registry + flat aliases | Canonicalize/projection `src/core/config.ts:2293`, resolved carry `src/core/config.ts:2397`. | Registry bootstrap `src/core/provider.ts:1463`, definitions `src/core/provider.ts:1736`. | CLI start/plan/do, MCP start/plan, resume/spawn gerçek call'ları; ör. `src/cli/commands/start.ts:603`, `src/mcp/tools/start.ts:421`. **WIRED**. |
| Provider-limit authority | Parent/project layers'tan separate snapshot `src/core/config.ts:2544`. | Runtime bootstrap `src/providers/provider-authority-runtime-bootstrap.ts:32`; xverify authority `src/orchestra/cross-verify-production-ingress-authority.ts:658`. | CLI/provider bootstrap girişleri. **WIRED**, merged inspection value authority değildir. |
| Effective workers | Top-level override carry `src/core/config.ts:2371`; helper `src/core/config.ts:1704`. | Spawner/result collector/preview `src/orchestra/sprint-spawner.ts:658`, `src/orchestra/result-collector.ts:2020`, `src/orchestra/plan-preview-service.ts:105`. | Core execution **WIRED**. Ancak bazı surface preview'leri doğrudan `activeModeConfig.max_workers` okur (`src/cli/commands/plan.ts:239`, `src/mcp/tools/start.ts:429`), bu nedenle display/plan parity **DRIFT**. |
| Brain planning | Top-level carry + helper `src/core/config.ts:2375`, `src/core/config.ts:1738`. | Planner helper kullanır `src/orchestra/sprint-planner.ts:308`. | Sprint planner **WIRED**; MCP plan doğrudan active mode okur (`src/mcp/tools/plan.ts:61`), override parity **DRIFT**. |
| Approval lifecycle/gate | `resolveApprovalConfig` `src/core/config.ts:2507`. | Spawner env gate `src/orchestra/sprint-spawner.ts:1359`; CLI authority `src/cli/commands/approvals.ts:266`; MCP read-only store `src/mcp/tools/approvals.ts:34`. | CLI/MCP/worker boundary **WIRED**; raw HTTP flags ayrıca driftli. |
| Cross verify | Pass-through `src/core/config.ts:2554`. | Production ingress checks `src/orchestra/cross-verify-production-ingress-authority.ts:582`; runner `src/orchestra/cross-verify-runner.ts:1760`. | CLI xverify / sprint paths. **WIRED**. |
| Resource monitor | Pass-through `src/core/config.ts:2492`. | Controller start gate `src/orchestra/sprint-controller.ts:1012`. | Sprint controller. **WIRED**. |
| Runtime artifact retention | Specialized resolver `src/core/config.ts:2493`. | Runtime hygiene consumers (machine index rows). | Cleanup/finalization families. **WIRED**; legacy sprint/scheduler retention ayrı raw dialect. |
| Terminal RunFlow v2 | Terminal defaults+merge `src/core/config.ts:2586`. | CLI/MCP/API gates `src/cli/commands/start.ts:442`, `src/mcp/tools/start.ts:229`, `src/api/run-flow-routes.ts:556`. | Multi-surface **WIRED**. |
| Autonomous | Pass-through `src/core/config.ts:2490`. | Runtime loop/mission engine `src/orchestra/autonomous/runtime-loop.ts:325`, `src/orchestra/autonomous/mission-store/mission-engine-wire.ts:478`. | CLI/process/API paths; raw enable pre-gates ayrıca split authority. |
| Notify connectors | Pass-through `src/core/config.ts:2573`. | Bot daemon `src/connectors/bot-daemon.ts:776`; sprint runner bootstrap `src/orchestra/sprint-runner-entry.ts:588`. | Connector delivery **WIRED**. Legacy webhook keys wired helper'a ulaşmadığı için ayrı no-op. |
| Plan interrogation | Pass-through `src/core/config.ts:2512`. | CLI plan `src/cli/commands/plan.ts:191`. | CLI plan **WIRED**. |

## Writer/atomicity audit

### Atomic swap kullananlar

- CLI `config set` ve `config import`, temp-in-same-directory + rename kullanır (`src/cli/commands/config.ts:4`, `src/cli/commands/config.ts:77`, `src/cli/commands/config.ts:147`).
- Onboarding apply/revert ayrı bir temp + random UUID + rename helper'ı kullanır ve write sonrası field read-back doğrulaması yapar (`src/cli/helpers/onboarding-apply.ts:88`, `src/cli/helpers/onboarding-apply.ts:184`). Yine lock/CAS/fsync/secret mode ortak contract'ı değildir.
- `last_sprint_id` update temp + rename kullanır (`src/core/utils.ts:199`, `src/core/utils.ts:237`).
- Corruption healer replacement'i önce stage eder, sonra eskiyi backup'a ve temp'i canonical path'e rename eder (`src/core/config.ts:2232`).
- Provider-limit global authoring mevcut en güçlü örnektir: exclusive sidecar lock (`src/core/provider-limit-authoring.ts:372`), expected authority ref compare (`src/core/provider-limit-authoring.ts:402`), `0o600` exclusive temp, file sync, rename, chmod ve directory sync uygular (`src/core/provider-limit-authoring.ts:558`). Tam config writer için yeniden kullanılacak referans seam budur; diğer writer'ları otomatik güvenli yapmaz.

Bu, reader'ın yarım JSON görmesini azaltır; ancak inter-process lock, generation compare veya CAS yoktur. İki read-modify-write writer aynı eski preimage'i okuyup farklı atomic rename yaparsa son writer diğerinin değişikliğini sessizce kaybeder. Cross-platform replace/durability (`fsync` file+directory, Windows rename semantics) için production proof bulunmadığından bu kısım **HOLD**'dur.

### RW-006 — Corruption healer'da critical TOCTOU veri kaybı

Loader retry sonrası canonical dosyanın byte'larını okuyup parse eder (`src/core/config.ts:2202`, `src/core/config.ts:2206`). Parse failure görülürse karar verdiği byte preimage'ının inode/stat/digest identity'sini saklamaz. Fresh defaults'u stage ettikten sonra **o anda path'te bulunan** dosyayı koşulsuz backup'a rename eder (`src/core/config.ts:2222`, `src/core/config.ts:2232`, `src/core/config.ts:2233`). Aradaki sürede başka writer canonical path'i sağlıklı yeni generation ile değiştirmişse healer, parse-fail gördüğü eski dosya yerine yeni sağlıklı dosyayı “corrupted” backup'a taşır ve defaults koyar.

Bu yalnız teorik değildir:

- Pinned evidence `docs/audits/config-completion-2026-08-25/evidence/project-config.corrupted-backup.input.json` SHA-256 `34b6a7c25bca9a02ff2901682868e86ad4fc3bead05b2c4e5061cb249a686edb` ile `JSON.parse` olur ve 63 root key içerir.
- Audit dışı current-main operational observation olarak beş `config.json.corrupted.*.bak` dosyasının beşi de parse-valid'dir; exact adlar delta appendix/receipt verification'da path-only gözlemdir, içerik değerleri okunmamış/raporlanmamıştır.

Hüküm: staged replacement “canonical path hiçbir an yok olmasın” invariant'ını iyileştirir ama **doğru generation'ı karantinaya alma** invariant'ını sağlamaz. Çözüm file identity + content digest precondition, inter-process lock ve rename-before CAS olmalıdır; preimage değiştiyse healer typed `CONCURRENT_CONFIG_CHANGE_HOLD` ile hiçbir dosyayı taşımamalıdır.

### Doğrudan truncate/write yapan project/global config writer'ları

| Writer | Evidence | Risk |
|---|---|---|
| CLI init / init steps / mode | `src/cli/commands/init.ts:233`, `src/cli/commands/init-steps.ts:258`, `src/cli/commands/init-steps.ts:374`, `src/cli/commands/init-steps.ts:559`, `src/cli/commands/mode.ts:37` | Core config, multi-IDE ve provider setup aynı dosyaya ayrı truncate/RMW yollarıyla yazar; concurrent reader yarım JSON görebilir ve stale overwrite oluşabilir. |
| CLI autonomous / nervous | `src/cli/commands/autonomous.ts:994`, `src/cli/commands/config-nervous.ts:123` | Aynı project config'e bağımsız RMW. |
| MCP config / init / nervous | `src/mcp/tools/config.ts:73`, `src/mcp/tools/init.ts:97`, `src/mcp/tools/nervous.ts:63` | Long-lived MCP process + CLI/API ile eşzamanlı write riski. |
| API config | `src/api/server.ts:1832` | Network mutation ingress'i canonical writer'ı bypass eder. |
| Enterprise tenant mutations | `src/api/enterprise-endpoint.ts:472` | Project config'in `tenants` alanını ayrı writer ile değiştirir. |
| Finalizer adaptive update | `src/orchestra/sprint-finalizer.ts:1344` | Aktif run sırasında operator config change'ini overwrite edebilir. |
| Managed docs seed | `src/orchestra/managed-docs/docs-config.ts:53` | Init/sync sırasında aynı dosyaya ayrı RMW. |
| Subscription | `src/core/subscription.ts:158` | Async truncate/write; ayrı schema dialect. |
| Global save | `src/core/config.ts:2710`, `src/core/global-config.ts:45` | İki ayrı non-atomic global writer API'si; ilki CLI mode tarafından çağrılır (`src/cli/commands/mode.ts:171`), ikincinin production caller'ı yoktur ama exported public seam'dir. |
| Regenerate/migration | `src/core/config.ts:2782`, `src/core/config.ts:2798`, `src/core/config-migration.ts:331` | Backup olması partial-write ve lost-update'i önlemez. |

**Hüküm: P0 durability/authority gap.** 2026-08-25 loader yorumları concurrent non-atomic writer'ın valid config'i half-written gösterdiği incident'i doğrudan kaydeder (`src/core/config.ts:2186`). Loader healer'ın düzeltilmesi producer tarafındaki writer çoğulluğunu kapatmamıştır.

### RW-007 — Secret-bearing config ve backup custody

Config contract düz string secret taşımaya izin verir: `notify_connectors.*.token` (`src/core/config-types.ts:1209`), approval channel token'ları (`src/core/config-types.ts:1219`), `api_auth_token` (`src/core/config-types.ts:1291`) ve imported semantic contract'taki SMTP password (`src/connectors/capabilities/types.ts:44`). `$DECK:` kullanımı tavsiye edilir ama type/validator plaintext'i reddetmez; loader daha sonra interpolation yapar (`src/core/config.ts:2598`).

Path-only/mode-only operational check'te current canonical `.deckent/config.json` ve beş `config.json.corrupted.*.bak` dosyasının tamamı mode `0644` idi. Hiçbir secret value okunmadı veya loglanmadı. Mode bitleri group/other read izni verir; gerçek erişim parent-directory ACL/traversal'a bağlı olsa da native custody contract bu varsayıma bırakılamaz. Healer `renameSync` ile mevcut mode'u backup'a taşır ve staged fresh file da process umask'ına dayanır; explicit `0600`, ACL adapter, secret redaction veya secret-broker-only validation yoktur (`src/core/config.ts:2232`).

Hüküm: **critical confidentiality gap**. Canonical/backup/temp config files platform adapter ile owner-only permission/ACL almalı; backup retention ve secure deletion policy'si tanımlanmalı; secret-bearing leaves plaintext yerine secret reference/broker handle zorlamalı; diagnostics/export/config-get yüzeyleri path-classified redaction yapmalıdır.

#### Secret exfiltration / authority surface zincirleri

- CLI `config --raw` dosyayı aynen basar; normal `config` ise interpolation sonrası tüm resolved object'i basar (`src/cli/commands/config.ts:90`, `src/cli/commands/config.ts:110`). `exportConfig` full raw bytes'ı stdout veya kullanıcı-chosen file'a kopyalar (`src/cli/commands/config.ts:35`, `src/cli/commands/config.ts:43`). `config set` verilen değeri tekrar terminale echo eder (`src/cli/commands/config.ts:148`). Sensitive-path classifier veya redaction yoktur.
- MCP `deckent_config read` full resolved config'i, `get` herhangi bir nested value'yu döndürür (`src/mcp/tools/config.ts:28`, `src/mcp/tools/config.ts:44`). `set` aynı tool içinde raw RMW + direct write yapar ve yazılan value'yu response'a geri koyar (`src/mcp/tools/config.ts:66`, `src/mcp/tools/config.ts:73`, `src/mcp/tools/config.ts:75`). Buna rağmen tool annotation `destructiveHint:false`'tır (`src/mcp/tools/config.ts:17`). Approval/secret scope ayrımı yoktur.
- HTTP `GET /api/config` raw project object'i döndürür (`src/api/server.ts:944`); `POST /api/config` merged object'i direct write eder ve response'ta geri döndürür (`src/api/server.ts:1812`, `src/api/server.ts:1832`, `src/api/server.ts:1835`). Validation dışı exception açıkça ignore edilip write sürdürülür (`src/api/server.ts:1823`, `src/api/server.ts:1830`). Endpoint üst auth/gating katmanları riski azaltabilir ama field-level secret read/write authorization ve response redaction sağlamaz.

Bu zincirler config'i yalnız settings değil secret-bearing authority document yapar. Tam kapanış; `SecretRef` zorunluluğu, resolved snapshot'ta secret handle/taint, CLI/MCP/API field-level read/write policy, default-redacted projection, explicit secure reveal flow ve audit event gerektirir. Full-object spread/enrichment hiçbir zaman secret-taint'i silememelidir.

## Field-lifecycle sınıflandırma özeti

| Sınıf | Örnekler | Kapanış şartı |
|---|---|---|
| Fully wired | provider registry, provider-limit authority, approval lifecycle/gate, cross_verify, resource_monitor, terminal.run_flow_v2, plan.interrogate, notify_connectors | Per-field production behavior mutation proof'u ve surface parity korunmalı. |
| Resolver default; createDefault absence bug değildir | approval rules/lifecycle, routing_v3, runtime_artifact_retention, timeout/terminal/prompt nested leaves | Truth linter specialized resolver provenance'ını modellemeli. |
| Genuine resolver drop | output_splash, skill_routing, notify_channel/url, doc_tracking, observability, memory V2 | Tek generated projection'e eklenmeli; global/project/env precedence ve live binary proof. |
| Consumer ingress drop | prompt ADR fields/task_profiles, persona_integrity.min_bytes, notify_on_complete | Consumer choke point'e explicit effective value ve behavior proof. |
| Consumer without declared/defaulted field | provider_overflow, partial_promotion_enabled, scope_auto_expand_enabled, native_cost_ceiling_usd, api.control_mutations, limit_gate, usage weekly budget | Önce authority/product kararı; sonra schema/default/validation/resolution/surface/migration zinciri. Sessiz kabul yasak. |
| Intentional raw persisted state | last_sprint_id | Config ile runtime state ayrımı veya typed state namespace + ortak writer. |
| Intentional vestigial | routing_v3.enabled compatibility | Metadata/doc bunu açıkça “non-gating” göstermeli. |
| Dynamic | providers.*, modes.*, policy rules, connector maps, plugin-owned extension keys | Wildcard schema + plugin ownership/provenance; statik finite leaf uydurulmaz, belirsizlik `HOLD`. |

## Kapanış planı için zorunlu runtime acceptance gates

1. **Single declarative field registry:** input schema, default strategy (`literal | resolver | intentionally absent`), validation, merge semantics, secrecy, environment mapping, surface visibility ve lifecycle metadata aynı authority'den üretilmeli.
2. **Single effective-config compiler:** `loadConfig` ve test construction aynı pure compiler'ı çağırmalı; iki elle yazılmış resolved literal kalmamalı. `mergeConfigs` ya kaldırılmalı ya aynı compiler'ın thin adapter'ı olmalı.
3. **Provenance-bearing immutable snapshot:** her effective field `default/global/project/env/runtime-policy` provenance ve generation digest'i taşımalı. Raw sync consumer'lar snapshot service veya önceden yüklenmiş bootstrap snapshot almalı.
4. **Raw-I/O lint allowlist:** production içinde `.deckent/config.json` doğrudan read/write default-deny; yalnız canonical loader/writer ve açıkça persisted-state/migration adapter'ları allowlisted olmalı.
5. **Transactional writer:** bütün CLI/MCP/API/init/finalizer writers aynı same-directory temp + file/directory fsync + platform adapter + inter-process lock + generation/CAS + backup/recovery service'ini kullanmalı. Lost-update conflict typed refusal olmalı.
6. **Unknown-key contract:** core unknown key typo ise fail/diagnostic; extension key ise owner namespace/schema ile kayıtlı olmalı. Intersection cast, davranış açan gizli API olmamalı.
7. **Behavior proof per field:** `value A → production entrypoint behavior A`, `value B → behavior B`; yalnız object equality/unit fixture kabul edilmemeli. CLI/MCP/API/Desktop/Terminal aynı effective generation'ı göstermeli.
8. **Authority/security proof:** `enforce_rbac`, `enforce_least_privilege`, `risk_gate_enabled`, approval decision flags ve tenant policies için default-off/default-on semantics, authenticated ingress, deny/park audit receipt'i ve bypass-negative tests zorunlu.
9. **Prompt proof:** config değişikliği gerçek spawned worker prompt artifact/digest'ini değiştirmeli; `adr_render`, threshold ve profiles için hard-coded fallback config authority'sini geçersiz kılamamalı.
10. **Migration/deprecation:** dead/legacy fields ya production closure almalı ya versioned migration warning + removal window ile reddedilmeli; Dashboard/config docs “planned” ve “live” durumunu makine contract'ından üretmeli.

## Main drift delta appendix — audit hükmüne dahil değildir

Pinned base `ff48978f` ile owner'ın bildirdiği current main `0d565b361ea599966cf7e485bef0d4eaade303c8` arasında bu lane'i etkileyen dört production dosyasında üç değişiklik ailesi görüldü:

1. `src/cli/commands/init-steps.ts`: fresh/absent config için `execution_budget.roles.worker.default.maxTurns=40`, `maxTokens=4_000_000`, `landing.reserve_ratio=0.25` üretimi; subprocess seçilince `execution_budget.unmetered_backend.action=hold` eklenmiş. Bu, main'de yeni bir init-time producer/default semantiği oluşturur. Ancak writer hâlâ doğrudan `writeFileSync(configPath, ...)` kullanır; bu rapordaki atomicity/lost-update bulgusu kapanmaz.
2. `src/orchestra/sprint-spawner.ts`: exact-plan comparison'dan `estimatedTokens` ve `promptCompilePlanId` çıkarılmış. Config producer/resolver/consumer zincirini değiştirmez.
3. `src/cli/commands/xverify.ts` ve `src/orchestra/cross-verify-production-ingress-authority.ts`: `--diff` evidence scope gerçek admissible changed-file listesine bağlanmış; producer fencing normalize edilmiş ve yalnız typed downstream Brain fields için sınırlı geçiş tanınmış; typed HOLD sonucu durable detail taşır. Bu, yukarıdaki **çalıştığı doğrulanan `cross_verify` ailesinin olumlu production proof'unu güçlendirir**. Config field declaration/default/resolution veya config writer/secret/recovery semantics'ini değiştirmez.

Main delta'da `src/core/config.ts`, `src/core/config-types.ts` ya da config resolver/writer/secret/recovery source'u değişmemiştir. Delta; `output_splash`, prompt fields, authority flags, raw readers, `loadConfig`/`mergeConfigs` divergence veya canonical writer çoğulluğundan hiçbirini düzeltmez. Branch rebase/merge edilmedi; tüm ana hükümler pinned base içindir.

## Son disposition

- Audit outcome açısından bütün bulgular **RELATED_BUT_NONBLOCKING**: bu slice yalnız analiz/dokümantasyon yetkisine sahiptir, source correction yapmamıştır.
- Product completion açısından RW-001..RW-004 ve writer split-authority **P0/P1 blocking**'dir.
- Dynamic plugin/map consumers, platform rename durability ve runtime-loaded extension schemas için kanıt yetersizliği **typed HOLD** olarak bırakılmıştır; sessiz PASS verilmemiştir.
- LOCAL_VERIFIED: source test çalıştırılmadı; bu documentation-only audit için exact SHA, line evidence, machine inventory, scoped diff ve receipt digest doğrulaması yapılacaktır.
- REMOTE_ADVISORY: çalıştırılmadı / bu audit slice'ı için gerekli değil.
