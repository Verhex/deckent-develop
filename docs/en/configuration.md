# Configuration

## Product-user perspective

### Resolution order

Deckent starts with built-in defaults, deep-merges global configuration, then deep-merges project configuration. Environment overrides are applied afterward; mode aliases and the selected mode's model strategy are then resolved and the result is validated. [Evidence: `src/core/config.ts:1864-1877,1892-1942,1969-2021`]

| Order | Layer | Location / input | Semantics |
|---:|---|---|---|
| 1 | Defaults | `createDefaultConfig()` | Complete baseline. `src/core/config.ts:1613-1784,1892` |
| 2 | Global | platform-resolved global `config.json` | Deep-merged over defaults. The reader prefers the platform path and falls back to the legacy path. `src/core/config.ts:1829-1862,1894-1907` |
| 3 | Project | `<project>/.deckent/config.json` | Deep-merged over the first two layers. `src/core/config.ts:1909-1942` |
| 4 | Environment overrides | `DECKENT_BRAIN_PROVIDER`, `DECKENT_WORKER_PROVIDER`, `DECKENT_MODE`, `DECKENT_LANGUAGE`, `DECKENT_STYLE` | Overrides the merged projection. `src/core/config.ts:1978-2005` |
| 5 | Resolution | aliases, mode preset, explicit `model_strategy`, validation | Produces `ResolvedConfig`. `src/core/config.ts:1969-1976,2007-2021,2048-2280` |

This is often described as a three-layer configuration because defaults/global/project are the authored JSON layers. Environment variables are a higher-precedence runtime override, not a fourth JSON file. [Evidence: `src/core/config.ts:1864-1867,1984-2005`]

The global reader is platform-aware for macOS, Linux, Windows native, and WSL-related path inputs, but `saveGlobalConfig` still targets the legacy global path. That asymmetry is explicit in the source and remains a migration concern. [Evidence: `src/core/config.ts:1829-1862`]

### Modes

The actual default mode registry exported by the built binary contains four modes. Values below came from `DEFAULT_MODES`; an explicit project `model_strategy` can override the strategy selected by a preset. [Evidence: command `node --input-type=module -e '<print DEFAULT_MODES from dist/core/config.js>'`, 2026-08-01; `src/core/config.ts:2007-2021`]

| Mode | Maximum workers | Brain model default | Worker model default | Planning | Additional rule |
|---|---:|---|---|---|---|
| `performance` | 8 | `claude-opus-5` | `claude-opus-5` | `auto` | `haiku_allowed: true` |
| `balanced` | 5 | `claude-sonnet-5` | `claude-opus-5` | `auto` | `haiku_allowed: true` |
| `economic` | 3 | `claude-sonnet-5` | `claude-sonnet-5` | `auto` | `haiku_allowed: false` |
| `api` | 10 | `claude-opus-5` | `claude-sonnet-5` | `auto` | `$5` default sprint budget and `ANTHROPIC_API_KEY` requirement |

Compatibility aliases are `max_plan → performance`, `max5x_plan → balanced`, `pro_plan → economic`, and `unlimited → api`. [Evidence: exported `MODE_ALIASES` from `dist/core/config.js`, 2026-08-01; `src/core/config.ts:1969-1975`]

The separate `deckent_style` surface accepts `sprint`, `task`, or `process`; `deckent mode run` is currently a bridge alias that persists `sprint`. It is not the same setting as the capacity/model mode above. [Evidence: actual outputs of `node dist/cli/entry.js mode --help` and `... mode run --help`, 2026-08-01; `src/cli/commands/mode.ts`]

### Providers and routing

The configuration validator recognizes `claude`, `codex`, `gemini`, `ollama`, and `openrouter`. Grouped `providers.brain` and `providers.worker` JSON is projected to compatibility fields before environment overrides. [Evidence: exported `VALID_PROVIDERS` from `dist/core/config.js`, 2026-08-01; `src/core/config.ts:1978-1993`]

Routing engine `v3` is the current default; old `v1` and `v2` values are upgraded in memory before validation. Provider/model resolution must use config plus registry and live evidence; a mode's literal default is a fallback input, not permanent provider authority. [Evidence: built `createDefaultConfig()` output, 2026-08-01; `src/core/config.ts:1969-1982`; `.deckent/workspace/IDENTITY.md:10`]

`model_strategy` selects `brain_tier`, `worker_tier`, minimum/maximum tier, and auto-upgrade/downgrade policy. Model IDs are resolved elsewhere through registry policy. [Evidence: `src/core/config.ts:2007-2021`; `src/core/model-registry.ts`; `src/core/routing/route-task-v3.ts`]

### Verified effective configuration

A read-only call to the built `loadConfig(process.cwd())` after `npm run build:all` returned this non-secret projection on 2026-08-01:

```json
{
  "mode": "performance",
  "language": "tr",
  "routing_engine": "v3",
  "workersEffective": 6,
  "brain_provider": "claude",
  "worker_provider": "codex",
  "brainModelResolved": "claude-fable-5",
  "model_strategy": {
    "brain_tier": "premium",
    "worker_tier": "premium",
    "min_tier": "economy",
    "max_tier": "premium_plus",
    "auto_upgrade": true,
    "auto_downgrade": false
  },
  "terminal": { "enabled": true, "maxSessions": 10, "run_flow_v2": true },
  "autonomous": { "enabled": true, "pool_size": 6 }
}
```

[Evidence: command importing `loadConfig`, `resolveEffectiveWorkers`, and `resolveBrainModel` from `dist/core/config.js`, 2026-08-01]

This is a local verification snapshot, not a portable recommended configuration. Secrets and account/entitlement state were deliberately excluded. The loader can persist compatibility migrations when it encounters legacy aliases; the inspected config required no tracked-file change. [Evidence: `src/core/config.ts:1943-1955`; `git status --short` comparison around the command, 2026-08-01]

### CLI configuration surface

| Command | Behavior |
|---|---|
| `deckent config [--raw]` | Print effective merged config, or raw project JSON with `--raw`. |
| `deckent config get <key>` | Read one dot-notation key. |
| `deckent config set <key> <value>` | Persist one project value. |
| `deckent config export [file]` | Export to stdout or a file. |
| `deckent config import <file>` | Import JSON. |
| `deckent config list` / `keys` | Show grouped parameters or all keys. |
| `deckent config migrate [--dry-run]` | Project the file to the latest full format; use `--dry-run` for inspection. |
| `deckent config nervous set\|override\|list\|reset` | Manage Nervous authority mode and per-action policy. |
| `deckent mode show\|sprint\|run\|task\|process\|auto\|global` | Read or mutate `deckent_style`. |
| `deckent models list\|refresh\|tier` | Inspect or refresh the model catalog and tier lookup. |

[Evidence for every row: actual binary help outputs for all 25 listed command paths, exit code 0, 2026-08-01]

There is no CLI path named `deckent config read`; reading effective configuration is the bare `deckent config` action. MCP uses `action: "read"`, which is a surface naming mismatch. [Evidence: actual `deckent config --help`; `src/cli/commands/config.ts:72-108`; `src/mcp/tools/config.ts:12-18`]

### Safe operating notes

- `deckent config` may auto-migrate a legacy project file before loading it; it is not guaranteed to be a pure read. [Evidence: `src/cli/commands/config.ts:89-101`]
- `loadConfig` also self-heals corrupt project JSON by renaming it and writing defaults, and may persist compatibility aliases. [Evidence: `src/core/config.ts:1913-1955`]
- `models refresh` invalidates the model cache and may perform provider catalog I/O. [Evidence: actual `deckent models refresh --help`; `src/cli/commands/models.ts`]
- Provider authorization, reachability, quotas, and budget admission remain runtime evidence; config alone cannot prove availability. [Evidence: `.deckent/workspace/IDENTITY.md:10`; `AGENTS.md:74-88`]

## Dogfood / repository reality

| Config property | State | Current finding |
|---|---|---|
| Three authored layers + env resolution | ✅ live | Loader order and a non-secret effective snapshot were verified from the built code. |
| Field-level reference | ✅ verified | 164 default leaves are listed in the schema reference. |
| Bare CLI read | ✅ live | Real binary accepts `deckent config`; `config show`/`--json` do not exist. |
| Global path symmetry | ⚠️ HOLD | Read prefers platform path while write targets legacy path (OQ-15). |
| Provider-neutral preset seeds | ⚠️ HOLD | Built-in modes still contain provider-specific model/key defaults (OQ-16). |
| Metadata registry | ⚠️ partial | Metadata covers a subset of defaults and disagrees on several values; recorded as CFG-03. |
