# Workers ve providers

## Product-user perspektifi

Worker; task scope, provider/model decision, backend, budget/time limit, heartbeat, output capture ve settlement evidence taşıyan admitted execution attempt'tır. Worker count ve provider choice prose-level constant değil resolved policy'dir. [Kanıt: `src/agents/worker.ts`; `src/orchestra/sprint-spawner.ts`; `src/core/config.ts:1426-1473`; `AGENTS.md:74-92`]

## Provider ve model resolution

Deckent configuration'da Claude, Codex, Gemini, Ollama ve OpenRouter tanır. Product identity provider-neutral'dir: effective config, runtime model registry, role policy, auth/account evidence, reachability, limits ve budget admission birlikte neyin çalışabileceğine karar verir. [Kanıt: `src/core/config.ts:1978-2021`; `src/core/model-registry.ts`; `.deckent/workspace/IDENTITY.md:10`; `AGENTS.md:74-88`]

Current default mode table'ları hâlâ provider-specific model ID içerir. Bunlar compatibility/fallback input'tur; model reachability veya entitlement proof'u değildir. OQ-16 provider-neutrality gerilimini takip eder. [Kanıt: built `DEFAULT_MODES`, 2026-08-01; `src/core/config.ts:469-540`; OQ-16]

Routing v3 requirement vector kurar, incompatible candidate'ları eler, content fit ile available learning/live signal'ları birleştirir, candidate'ları rank eder ve agent + model preference döndürür. Sprint adapter `routeTaskV3` çağırır; feature manifest bunu universally proven yerine lightly used sınıflandırır. [Kanıt: `src/core/routing/route-task-v3.ts:112-320`; `src/orchestra/routing-plan-adapter.ts:112-153`; manifest `routing-engine-v3`]

## Backends

| Backend | Intended use | Current implementation truth |
|---|---|---|
| Docker | Memory/swap limit, container state, log ve settlement monitoring ile isolated worker | `createDefaultConfig` default'u; Windows native dışında recommended |
| subprocess | Headless child process; Windows native fallback | Provider-specific stdin-fed CLI config; direct host process |
| tmux | Interactive legacy worker pane'leri | Hâlâ implemented; explicit selection deprecation warning verir |
| sandbox | `start --sandbox` ile path-jail/memory-cap mode | Backend type var; normal `spawn_backend` config enum'u değil |
| auto | Platform choice | Windows native → subprocess; diğerleri Docker |

[Kanıt: `src/core/config.ts:1621-1624,2500-2528`; `src/orchestra/spawn-backend.ts:231-460,598-656`; `src/cli/commands/spawn.ts:159-216`]

Feature manifest hâlâ tmux'u default olarak tarif eder; bu current config/backend resolution ile çelişir. Current source authority'dir; manifest row stale'dir ve fark raporuna aittir. [Kanıt: manifest `tmux-backend`; yukarıdaki source'lar]

## Concurrency ve resources

Effective workers; top-level `max_workers` override, `auto` system profile veya active mode preset'ten çözülür. Validation 1–100 aralığına izin verir ve 20+ için uyarır; dependency, scope collision, host resource, provider capacity veya budget dispatch'e izin vermiyorsa admission slot'u yine boş bırakabilir. [Kanıt: `src/core/config.ts:627-633,1426-1456`; `AGENTS.md:82-88`]

`resources` live Docker usage okur veya resource log analiz eder; `doctor --memory` host RAM recommendation hesaplar. `limits` subscription-window gate'lerini inceler. Bu surface'ler help ile doğrulandı; resource mutation çalıştırılmadı. [Kanıt: `src/cli/commands/resources.ts:151-243`; `src/cli/commands/doctor.ts:2198-2200`; `src/cli/commands/limits.ts`; real help audit]

## Manual spawn

`spawn <taskId>` configured backend'e uyar. Docker mode container exit'e kadar bloklanır ve hemen settle edebilir; tmux/subprocess fire-and-forget kalır. Bu yalnız display farkı değil operational difference'tır. [Kanıt: `src/cli/commands/spawn.ts:673-815`]

Manual spawn consequential'dır ve audit'te çalıştırılmadı. [Kanıt: owner boundary]

## Cross-verification

`xverify <claim>`, producer'dan farklı provider kullanmalıdır. Verifier provider/model; effective config, registry, reachability, entitlement ve live evidence'dan çözülür; absence same-provider fallback yerine typed unavailable/HOLD üretir. [Kanıt: `AGENTS.md:84-97`; `src/cli/commands/xverify.ts`]

## Local models

Ollama recognized provider'dır ve adapter seçildiğinde native chat veya agentic worker route'unu destekleyebilir. Local availability probe edilmelidir; “API key yok” modelin installed, loaded, capable veya admitted olduğunu kanıtlamaz. [Kanıt: `src/cli/commands/chat.ts:277-305,445-471`; `src/providers/ollama.ts`; identity provider contract]

## Dogfood / repository gerçeği

- `✅ canlı`: üç main backend, config resolution, mixed-provider type'lar, model registry, routing adapter, resource/limit/status surface'leri.
- `⚠️ kısmi`: routing v3 manifestte lightly-used; provider-observation DB disk'te v1, source v2 bekliyor; exact run ownership controlled migration'a kadar HOLD.
- `⚠️ kısmi`: current status unresolved provider observation interval ve unknown admitted ceiling bildiriyor.
- `🔜 roadmap`: her provider/environment combination için current live certification iddia edilmez.

[Configuration](../configuration.md), [Configuration schema](../reference/configuration-schema.md) ve [Güncel sürtünmeler](../operations/current-frictions.md) ile devam edin.
