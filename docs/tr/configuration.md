# Configuration

## Product-user perspektifi

### Resolution order

Deckent built-in defaults ile başlar, global configuration'ı deep-merge eder, ardından project configuration'ı deep-merge eder. Environment override'ları daha sonra uygulanır; mode alias'ları ile seçilen mode'un model strategy'si resolve edilip sonuç validate edilir. [Kanıt: `src/core/config.ts:1864-1877,1892-1942,1969-2021`]

| Sıra | Layer | Konum / input | Semantics |
|---:|---|---|---|
| 1 | Defaults | `createDefaultConfig()` | Tam baseline. `src/core/config.ts:1613-1784,1892` |
| 2 | Global | platform-resolved global `config.json` | Defaults üzerine deep-merge edilir. Reader platform path'i tercih eder, legacy path'e fallback yapar. `src/core/config.ts:1829-1862,1894-1907` |
| 3 | Project | `<project>/.deckent/config.json` | İlk iki layer üzerine deep-merge edilir. `src/core/config.ts:1909-1942` |
| 4 | Environment overrides | `DECKENT_BRAIN_PROVIDER`, `DECKENT_WORKER_PROVIDER`, `DECKENT_MODE`, `DECKENT_LANGUAGE`, `DECKENT_STYLE` | Merged projection'ı override eder. `src/core/config.ts:1978-2005` |
| 5 | Resolution | aliases, mode preset, explicit `model_strategy`, validation | `ResolvedConfig` üretir. `src/core/config.ts:1969-1976,2007-2021,2048-2280` |

Defaults/global/project authored JSON layer'lar olduğu için yapı çoğunlukla three-layer configuration diye anılır. Environment variables dördüncü JSON file değil, daha yüksek precedence'lı runtime override'dır. [Kanıt: `src/core/config.ts:1864-1867,1984-2005`]

Global reader; macOS, Linux, Windows native ve WSL ile ilişkili path input'ları için platform-aware'dir, fakat `saveGlobalConfig` hâlâ legacy global path'e yazar. Bu asimetri kaynakta açıkça belirtilmiş bir migration konusudur. [Kanıt: `src/core/config.ts:1829-1862`]

### Modes

Built binary'nin export ettiği gerçek default mode registry dört mode içerir. Aşağıdaki değerler `DEFAULT_MODES` çıktısıdır; explicit project `model_strategy`, preset'in seçtiği strategy'yi override edebilir. [Kanıt: command `node --input-type=module -e '<print DEFAULT_MODES from dist/core/config.js>'`, 2026-08-01; `src/core/config.ts:2007-2021`]

| Mode | Maximum workers | Brain model default | Worker model default | Planning | Ek kural |
|---|---:|---|---|---|---|
| `performance` | 8 | `claude-opus-5` | `claude-opus-5` | `auto` | `haiku_allowed: true` |
| `balanced` | 5 | `claude-sonnet-5` | `claude-opus-5` | `auto` | `haiku_allowed: true` |
| `economic` | 3 | `claude-sonnet-5` | `claude-sonnet-5` | `auto` | `haiku_allowed: false` |
| `api` | 10 | `claude-opus-5` | `claude-sonnet-5` | `auto` | `$5` default sprint budget ve `ANTHROPIC_API_KEY` requirement |

Compatibility alias'ları `max_plan → performance`, `max5x_plan → balanced`, `pro_plan → economic` ve `unlimited → api` şeklindedir. [Kanıt: `dist/core/config.js` içinden export edilen `MODE_ALIASES`, 2026-08-01; `src/core/config.ts:1969-1975`]

Ayrı `deckent_style` surface'i `sprint`, `task` veya `process` kabul eder; `deckent mode run` şu anda `sprint` persist eden bir bridge alias'tır. Bu setting, yukarıdaki capacity/model mode ile aynı değildir. [Kanıt: gerçek `node dist/cli/entry.js mode --help` ve `... mode run --help` çıktıları, 2026-08-01; `src/cli/commands/mode.ts`]

### Providers ve routing

Configuration validator; `claude`, `codex`, `gemini`, `ollama` ve `openrouter` tanır. Grouped `providers.brain` ve `providers.worker` JSON, environment override'larından önce compatibility field'lara project edilir. [Kanıt: `dist/core/config.js` içinden export edilen `VALID_PROVIDERS`, 2026-08-01; `src/core/config.ts:1978-1993`]

Routing engine `v3` güncel default'tur; eski `v1` ve `v2` değerleri validation öncesinde memory içinde upgrade edilir. Provider/model resolution config, registry ve live evidence kullanmalıdır; mode içindeki literal default kalıcı provider authority değil, fallback input'tur. [Kanıt: built `createDefaultConfig()` çıktısı, 2026-08-01; `src/core/config.ts:1969-1982`; `.deckent/workspace/IDENTITY.md:10`]

`model_strategy`; `brain_tier`, `worker_tier`, minimum/maximum tier ile auto-upgrade/downgrade policy seçer. Model ID'leri registry policy üzerinden başka katmanda resolve edilir. [Kanıt: `src/core/config.ts:2007-2021`; `src/core/model-registry.ts`; `src/core/routing/route-task-v3.ts`]

### Doğrulanan effective configuration

`npm run build:all` sonrasında built `loadConfig(process.cwd())` için read-only çağrı, 2026-08-01 tarihinde aşağıdaki secret içermeyen projection'ı döndürdü:

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

[Kanıt: `dist/core/config.js` içinden `loadConfig`, `resolveEffectiveWorkers` ve `resolveBrainModel` import eden command, 2026-08-01]

Bu local verification snapshot'tır; portable recommended configuration değildir. Secrets ile account/entitlement state bilerek çıkarılmıştır. Loader legacy alias gördüğünde compatibility migration persist edebilir; incelenen config tracked-file değişikliği gerektirmedi. [Kanıt: `src/core/config.ts:1943-1955`; command çevresindeki `git status --short` karşılaştırması, 2026-08-01]

### CLI configuration surface

| Command | Behavior |
|---|---|
| `deckent config [--raw]` | Effective merged config'i veya `--raw` ile raw project JSON'ı gösterir. |
| `deckent config get <key>` | Tek dot-notation key okur. |
| `deckent config set <key> <value>` | Tek project value persist eder. |
| `deckent config export [file]` | Stdout'a veya file'a export eder. |
| `deckent config import <file>` | JSON import eder. |
| `deckent config list` / `keys` | Grouped parameter'ları veya tüm key'leri gösterir. |
| `deckent config migrate [--dry-run]` | File'ı en güncel full format'a project eder; inspection için `--dry-run` kullanılır. |
| `deckent config nervous set\|override\|list\|reset` | Nervous authority mode ve per-action policy yönetir. |
| `deckent mode show\|sprint\|run\|task\|process\|auto\|global` | `deckent_style` okur veya değiştirir. |
| `deckent models list\|refresh\|tier` | Model catalog ve tier lookup inceler veya refresh eder. |

[Her satır için kanıt: listelenen 25 command path'in gerçek binary help çıktısı, exit code 0, 2026-08-01]

CLI'da `deckent config read` adlı path yoktur; effective configuration bare `deckent config` action ile okunur. MCP ise `action: "read"` kullanır; bu bir surface naming mismatch'tir. [Kanıt: gerçek `deckent config --help`; `src/cli/commands/config.ts:72-108`; `src/mcp/tools/config.ts:12-18`]

### Safe operating notları

- `deckent config`, legacy project file'ı yüklemeden önce auto-migrate edebilir; pure read garantisi yoktur. [Kanıt: `src/cli/commands/config.ts:89-101`]
- `loadConfig`, bozuk project JSON'ı rename edip defaults yazarak self-heal edebilir ve compatibility alias'larını persist edebilir. [Kanıt: `src/core/config.ts:1913-1955`]
- `models refresh`, model cache'i invalidate eder ve provider catalog I/O yapabilir. [Kanıt: gerçek `deckent models refresh --help`; `src/cli/commands/models.ts`]
- Provider authorization, reachability, quotas ve budget admission runtime evidence olarak kalır; config tek başına availability kanıtlamaz. [Kanıt: `.deckent/workspace/IDENTITY.md:10`; `AGENTS.md:74-88`]

## Dogfood / repository gerçeği

| Config property | Durum | Current finding |
|---|---|---|
| Üç authored layer + env resolution | ✅ canlı | Loader order ve non-secret effective snapshot built code'dan doğrulandı. |
| Field-level reference | ✅ doğrulandı | 164 default leaf schema reference'ta listelenir. |
| Bare CLI read | ✅ canlı | Real binary `deckent config` kabul eder; `config show`/`--json` yoktur. |
| Global path symmetry | ⚠️ HOLD | Read platform path'i prefer ederken write legacy path'i target eder (OQ-15). |
| Provider-neutral preset seed | ⚠️ HOLD | Built-in mode'lar hâlâ provider-specific model/key default içerir (OQ-16). |
| Metadata registry | ⚠️ kısmi | Metadata default'ların alt kümesini kapsar ve bazı value'larda çelişir; CFG-03 olarak kayıtlıdır. |
