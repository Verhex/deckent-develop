# Configuration Descriptor Registry — Prototype Schema

> This output is a `lab/descriptor-registry` prototype only; it is not production config authority and does not change default decisions.

Registry digest: `sha256:7dd90f5c250e0b30d0fe969fcdc865c0c325dd8ffb26265f51edbf532c167e83` · Descriptor count: **20**

| Path | Title | Authored type / presence | Resolved type / presence | Default taxonomy | Lifecycle | Impact | Sensitivity |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `api_keys.*` | API key namespace | `string` / optional | `string` / optional | `NO_DEFAULT` | DEPRECATED | restart | SECRET_MATERIAL_FORBIDDEN |
| `bot_agent.providers` | Bot-agent providers | `Array<"ollama" \| "claude" \| "openai">` / optional | `Array<"ollama" \| "claude" \| "openai">` / optional | `STARTER_VALUE:["ollama","claude","openai"]` | ACTIVE | next-run | PUBLIC |
| `decay_after_sprints` | Legacy decay interval | `number` / optional | `number` / required | `EFFECTIVE_DEFAULT:20` | DEPRECATED | next-run | PUBLIC |
| `dependency_pipeline_enabled` | Dependency pipeline | `boolean` / optional | `boolean` / required | `EFFECTIVE_DEFAULT:true` | ACTIVE | next-run | PUBLIC |
| `docker_timeout` | Docker timeout | `number` / optional | `number` / required | `EFFECTIVE_DEFAULT:1200` | ACTIVE | next-run | PUBLIC |
| `execution_budget.roles.*` | Execution budget roles | `ExecutionBudgetRolePolicyPrototype` / optional | `ExecutionBudgetRolePolicyPrototype` / optional | `POLICY_INHERITED:resolveExecutionBudgetRolePolicy` | ACTIVE | next-run | CONFIDENTIAL |
| `identity.provider` | Identity provider | `IdentityProviderPrototype` / optional | `IdentityProviderPrototype` / optional | `NO_DEFAULT` | ACTIVE | restart | CONFIDENTIAL |
| `language` | Project language | `string` / optional | `string` / required | `EFFECTIVE_DEFAULT:"en"` | ACTIVE | next-run | PUBLIC |
| `memory_budget` | Legacy memory budget | `number` / optional | `number` / required | `EFFECTIVE_DEFAULT:5000` | DEPRECATED | next-run | PUBLIC |
| `mode` | Plan mode | `"performance" \| "balanced" \| "economic" \| "api" \| "max_plan" \| "max5x_plan" \| "pro_plan"` / required | `"performance" \| "balanced" \| "economic" \| "api" \| "max_plan" \| "max5x_plan" \| "pro_plan"` / required | `EFFECTIVE_DEFAULT:"performance"` | ACTIVE | next-run | PUBLIC |
| `modes.*.brain_model` | Mode Brain model | `ModelType` / required_when_parent_present | `ModelType` / required_when_parent_present | `NO_DEFAULT` | ACTIVE | next-run | PUBLIC |
| `modes.*.max_workers` | Mode worker ceiling | `number \| "auto"` / required_when_parent_present | `number \| "auto"` / required_when_parent_present | `NO_DEFAULT` | ACTIVE | next-run | PUBLIC |
| `notifications` | Notifications | `NotificationConfig` / optional | `NotificationConfig` / optional | `NO_DEFAULT` | OPT_IN | hot-reload | PUBLIC |
| `output_splash` | Output splash | `boolean` / optional | `boolean` / required | `EFFECTIVE_DEFAULT:true` | ACTIVE | hot-reload | PUBLIC |
| `prompt.adr_min_relevance` | ADR minimum relevance | `number` / optional | `number` / required | `EFFECTIVE_DEFAULT:0.3` | ACTIVE | next-run | PUBLIC |
| `prompt.adr_render` | ADR render mode | `"full" \| "operative"` / optional | `"full" \| "operative"` / required | `EFFECTIVE_DEFAULT:"full"` | ACTIVE | next-run | PUBLIC |
| `provider_overrides.*` | Provider overrides | `"claude" \| "codex" \| "gemini" \| "cursor" \| "ollama" \| "openrouter" \| "local-llm"` / optional | `"claude" \| "codex" \| "gemini" \| "cursor" \| "ollama" \| "openrouter" \| "local-llm"` / optional | `NO_DEFAULT` | ACTIVE | next-run | PUBLIC |
| `routing_v3.weights.content` | Routing content weight | `number` / required_when_parent_present | `number` / required_when_parent_present | `EFFECTIVE_DEFAULT:0.5` | ACTIVE | next-run | PUBLIC |
| `spawn_backend` | Spawn backend | `"docker" \| "tmux" \| "subprocess" \| "auto"` / optional | `"docker" \| "tmux" \| "subprocess"` / required | `PLATFORM_RESOLVED:resolveSpawnBackendWithCapabilityEvidence` | ACTIVE | next-run | PUBLIC |
| `timeout.model_multiplier.*` | Model-tier timeout multiplier | `number` / optional | `number` / optional | `NO_DEFAULT` | ACTIVE | next-run | PUBLIC |

## Descriptions

### `api_keys.*` — API key namespace

Legacy dynamic API-key namespace; new plaintext material is forbidden.

### `bot_agent.providers` — Bot-agent providers

Ordered provider candidates used by the outbound-message bot agent.

### `decay_after_sprints` — Legacy decay interval

Legacy flat memory-decay interval retained for migration compatibility.

### `dependency_pipeline_enabled` — Dependency pipeline

Enables dependency-aware wave execution for tasks.

### `docker_timeout` — Docker timeout

Effective Docker worker timeout in seconds.

### `execution_budget.roles.*` — Execution budget roles

Finite role-keyed execution-budget policy map.

### `identity.provider` — Identity provider

Discriminated local, SCIM, or OIDC-claims identity-provider configuration.

### `language` — Project language

Language identifier used for project-aware planning.

### `memory_budget` — Legacy memory budget

Legacy flat memory budget retained for migration compatibility.

### `mode` — Plan mode

Active planning and capacity mode.

### `modes.*.brain_model` — Mode Brain model

Brain model seed for a dynamically named plan mode.

### `modes.*.max_workers` — Mode worker ceiling

Worker ceiling for a dynamically named plan mode.

### `notifications` — Notifications

Imported notification-domain configuration contract.

### `output_splash` — Output splash

Controls whether the startup splash is rendered.

### `prompt.adr_min_relevance` — ADR minimum relevance

Minimum ADR relevance accepted for worker prompt composition.

### `prompt.adr_render` — ADR render mode

ADR rendering strategy used during worker prompt composition.

### `provider_overrides.*` — Provider overrides

Dynamic task-kind to provider override namespace.

### `routing_v3.weights.content` — Routing content weight

Content signal weight used by routing-v3.

### `spawn_backend` — Spawn backend

Requested worker backend; auto is resolved with platform capability evidence.

### `timeout.model_multiplier.*` — Model-tier timeout multiplier

Finite model-tier timeout multiplier map.
