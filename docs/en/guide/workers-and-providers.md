# Workers and providers

## Product-user perspective

A worker is an admitted execution attempt with a task scope, provider/model decision, backend, budget/time limits, heartbeat, output capture, and settlement evidence. Worker count and provider choice are resolved policy, not prose-level constants. [Evidence: `src/agents/worker.ts`; `src/orchestra/sprint-spawner.ts`; `src/core/config.ts:1426-1473`; `AGENTS.md:74-92`]

## Provider and model resolution

Deckent recognizes Claude, Codex, Gemini, Ollama, and OpenRouter in configuration. Product identity is provider-neutral: effective config, runtime model registry, role policy, auth/account evidence, reachability, limits, and budget admission jointly decide what can run. [Evidence: `src/core/config.ts:1978-2021`; `src/core/model-registry.ts`; `.deckent/workspace/IDENTITY.md:10`; `AGENTS.md:74-88`]

The current default mode tables still contain provider-specific model IDs. Those are compatibility/fallback inputs, not proof that a model is reachable or entitled; OQ-16 tracks the provider-neutrality tension. [Evidence: built `DEFAULT_MODES`, 2026-08-01; `src/core/config.ts:469-540`; OQ-16]

Routing v3 builds a requirement vector, eliminates incompatible candidates, combines content fit and available learning/live signals, ranks candidates, and returns an agent plus model preference. The sprint adapter calls `routeTaskV3`; the feature manifest classifies it as lightly used rather than universally proven. [Evidence: `src/core/routing/route-task-v3.ts:112-320`; `src/orchestra/routing-plan-adapter.ts:112-153`; manifest `routing-engine-v3`]

## Backends

| Backend | Intended use | Current implementation truth |
|---|---|---|
| Docker | Isolated workers with memory/swap limits, container state, logs, and settlement monitoring | Default in `createDefaultConfig`; recommended outside Windows native |
| subprocess | Headless child process; Windows native fallback | Provider-specific stdin-fed CLI config; direct host process |
| tmux | Interactive legacy worker panes | Still implemented; explicit selection emits deprecation warning |
| sandbox | Path-jail/memory-cap mode exposed by `start --sandbox` | Backend type exists; not the normal `spawn_backend` config enum |
| auto | Platform choice | Windows native → subprocess; otherwise Docker |

[Evidence: `src/core/config.ts:1621-1624,2500-2528`; `src/orchestra/spawn-backend.ts:231-460,598-656`; `src/cli/commands/spawn.ts:159-216`]

The feature manifest still describes tmux as default, which conflicts with current config and backend resolution. The current source is authoritative; the manifest row is stale and belongs in the difference report. [Evidence: manifest `tmux-backend`; sources above]

## Concurrency and resources

Effective workers resolve from a top-level `max_workers` override, `auto` system profile, or active mode preset. Validation permits 1–100 and warns at 20 or more; admission can still leave slots unused when dependencies, scope collisions, host resources, provider capacity, or budget do not permit dispatch. [Evidence: `src/core/config.ts:627-633,1426-1456`; `AGENTS.md:82-88`]

`resources` reads live Docker usage or analyzes a resource log; `doctor --memory` computes host RAM recommendations. `limits` inspects subscription-window gates. These surfaces were help-verified; no resource mutation was run. [Evidence: `src/cli/commands/resources.ts:151-243`; `src/cli/commands/doctor.ts:2198-2200`; `src/cli/commands/limits.ts`; real help audit]

## Manual spawn

`spawn <taskId>` respects configured backend. Docker mode blocks until the container exits and can settle immediately; tmux/subprocess remain fire-and-forget. This is an operational difference, not just display behavior. [Evidence: `src/cli/commands/spawn.ts:673-815`]

Manual spawn is consequential and was not executed in this audit. [Evidence: owner boundary]

## Cross-verification

`xverify <claim>` must use a provider different from the producer. The verifier provider/model is resolved from effective config, registry, reachability, entitlement, and live evidence; absence yields typed unavailable/HOLD rather than same-provider fallback. [Evidence: `AGENTS.md:84-97`; `src/cli/commands/xverify.ts`]

## Local models

Ollama is a recognized provider and can back native chat or agentic worker routes where the adapter is selected. Local availability must be probed; “no API key” does not prove the model is installed, loaded, capable, or admitted. [Evidence: `src/cli/commands/chat.ts:277-305,445-471`; `src/providers/ollama.ts`; identity provider contract]

## Dogfood / repository reality

- `✅ live`: three main backends, config resolution, mixed-provider types, model registry, routing adapter, resource/limit/status surfaces.
- `⚠️ partial`: routing v3 is manifest-lightly-used; provider-observation DB is on disk v1 while source expects v2; exact run ownership remains HOLD until controlled migration.
- `⚠️ partial`: current status reports unresolved provider observation intervals and unknown admitted ceilings.
- `🔜 roadmap`: no claim that every provider/environment combination has current live certification.

See [Configuration](../configuration.md), [Configuration schema](../reference/configuration-schema.md), and [Current frictions](../operations/current-frictions.md).
