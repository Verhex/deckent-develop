# Configuration Descriptor Registry — Prototype Şeması

> Bu çıktı yalnız `lab/descriptor-registry` prototipidir; production config authority değildir ve varsayılan kararlarını değiştirmez.

Registry digest: `sha256:7dd90f5c250e0b30d0fe969fcdc865c0c325dd8ffb26265f51edbf532c167e83` · Descriptor sayısı: **20**

| Path | Başlık | Authored type / presence | Resolved type / presence | Default taxonomy | Lifecycle | Impact | Sensitivity |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `api_keys.*` | API key namespace | `string` / optional | `string` / optional | `NO_DEFAULT` | DEPRECATED | restart | SECRET_MATERIAL_FORBIDDEN |
| `bot_agent.providers` | Bot-agent providerları | `Array<"ollama" \| "claude" \| "openai">` / optional | `Array<"ollama" \| "claude" \| "openai">` / optional | `STARTER_VALUE:["ollama","claude","openai"]` | ACTIVE | next-run | PUBLIC |
| `decay_after_sprints` | Legacy decay aralığı | `number` / optional | `number` / required | `EFFECTIVE_DEFAULT:20` | DEPRECATED | next-run | PUBLIC |
| `dependency_pipeline_enabled` | Dependency pipeline | `boolean` / optional | `boolean` / required | `EFFECTIVE_DEFAULT:true` | ACTIVE | next-run | PUBLIC |
| `docker_timeout` | Docker timeout | `number` / optional | `number` / required | `EFFECTIVE_DEFAULT:1200` | ACTIVE | next-run | PUBLIC |
| `execution_budget.roles.*` | Execution budget rolleri | `ExecutionBudgetRolePolicyPrototype` / optional | `ExecutionBudgetRolePolicyPrototype` / optional | `POLICY_INHERITED:resolveExecutionBudgetRolePolicy` | ACTIVE | next-run | CONFIDENTIAL |
| `identity.provider` | Identity provider | `IdentityProviderPrototype` / optional | `IdentityProviderPrototype` / optional | `NO_DEFAULT` | ACTIVE | restart | CONFIDENTIAL |
| `language` | Proje dili | `string` / optional | `string` / required | `EFFECTIVE_DEFAULT:"en"` | ACTIVE | next-run | PUBLIC |
| `memory_budget` | Legacy bellek bütçesi | `number` / optional | `number` / required | `EFFECTIVE_DEFAULT:5000` | DEPRECATED | next-run | PUBLIC |
| `mode` | Plan mode | `"performance" \| "balanced" \| "economic" \| "api" \| "max_plan" \| "max5x_plan" \| "pro_plan"` / required | `"performance" \| "balanced" \| "economic" \| "api" \| "max_plan" \| "max5x_plan" \| "pro_plan"` / required | `EFFECTIVE_DEFAULT:"performance"` | ACTIVE | next-run | PUBLIC |
| `modes.*.brain_model` | Mode Brain modeli | `ModelType` / required_when_parent_present | `ModelType` / required_when_parent_present | `NO_DEFAULT` | ACTIVE | next-run | PUBLIC |
| `modes.*.max_workers` | Mode worker tavanı | `number \| "auto"` / required_when_parent_present | `number \| "auto"` / required_when_parent_present | `NO_DEFAULT` | ACTIVE | next-run | PUBLIC |
| `notifications` | Bildirimler | `NotificationConfig` / optional | `NotificationConfig` / optional | `NO_DEFAULT` | OPT_IN | hot-reload | PUBLIC |
| `output_splash` | Çıktı splash | `boolean` / optional | `boolean` / required | `EFFECTIVE_DEFAULT:true` | ACTIVE | hot-reload | PUBLIC |
| `prompt.adr_min_relevance` | ADR minimum relevance | `number` / optional | `number` / required | `EFFECTIVE_DEFAULT:0.3` | ACTIVE | next-run | PUBLIC |
| `prompt.adr_render` | ADR render mode | `"full" \| "operative"` / optional | `"full" \| "operative"` / required | `EFFECTIVE_DEFAULT:"full"` | ACTIVE | next-run | PUBLIC |
| `provider_overrides.*` | Provider override’ları | `"claude" \| "codex" \| "gemini" \| "cursor" \| "ollama" \| "openrouter" \| "local-llm"` / optional | `"claude" \| "codex" \| "gemini" \| "cursor" \| "ollama" \| "openrouter" \| "local-llm"` / optional | `NO_DEFAULT` | ACTIVE | next-run | PUBLIC |
| `routing_v3.weights.content` | Routing content weight | `number` / required_when_parent_present | `number` / required_when_parent_present | `EFFECTIVE_DEFAULT:0.5` | ACTIVE | next-run | PUBLIC |
| `spawn_backend` | Spawn backend | `"docker" \| "tmux" \| "subprocess" \| "auto"` / optional | `"docker" \| "tmux" \| "subprocess"` / required | `PLATFORM_RESOLVED:resolveSpawnBackendWithCapabilityEvidence` | ACTIVE | next-run | PUBLIC |
| `timeout.model_multiplier.*` | Model-tier timeout multiplier | `number` / optional | `number` / optional | `NO_DEFAULT` | ACTIVE | next-run | PUBLIC |

## Açıklamalar

### `api_keys.*` — API key namespace

Legacy dynamic API-key namespace; yeni plaintext material yasaktır.

### `bot_agent.providers` — Bot-agent providerları

Outbound-message bot agent için sıralı provider adayları.

### `decay_after_sprints` — Legacy decay aralığı

Migration uyumluluğu için korunan legacy flat bellek-decay aralığı.

### `dependency_pipeline_enabled` — Dependency pipeline

Tasklar için dependency-aware wave executionı etkinleştirir.

### `docker_timeout` — Docker timeout

Saniye cinsinden effective Docker worker timeout değeri.

### `execution_budget.roles.*` — Execution budget rolleri

Finite role-keyed execution-budget policy map.

### `identity.provider` — Identity provider

Discriminated local, SCIM veya OIDC-claims identity-provider configi.

### `language` — Proje dili

Project-aware planning için kullanılan dil kimliği.

### `memory_budget` — Legacy bellek bütçesi

Migration uyumluluğu için korunan legacy flat bellek bütçesi.

### `mode` — Plan mode

Etkin planning ve capacity mode.

### `modes.*.brain_model` — Mode Brain modeli

Dynamic isimli plan mode için Brain model seed değeri.

### `modes.*.max_workers` — Mode worker tavanı

Dynamic isimli plan mode için worker tavanı.

### `notifications` — Bildirimler

Imported notification-domain configuration contractı.

### `output_splash` — Çıktı splash

Başlangıç splash görünümünün render edilmesini kontrol eder.

### `prompt.adr_min_relevance` — ADR minimum relevance

Worker prompt composition için kabul edilen minimum ADR relevance.

### `prompt.adr_render` — ADR render mode

Worker prompt composition sırasında kullanılan ADR rendering strategy.

### `provider_overrides.*` — Provider override’ları

Dynamic task-kind → provider override namespace.

### `routing_v3.weights.content` — Routing content weight

Routing-v3 tarafından kullanılan content signal weight.

### `spawn_backend` — Spawn backend

İstenen worker backend; auto, platform capability evidence ile çözülür.

### `timeout.model_multiplier.*` — Model-tier timeout multiplier

Finite model-tier timeout multiplier map.
