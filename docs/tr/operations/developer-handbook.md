# Developer handbook

## Product-user perspektifi

Bu handbook Deckent'in kendisini extend eden veya project-scoped agent/plugin ekleyen contributor'lar içindir. Product kullanımı runtime'ı değiştirmeyi gerektirmez: documented CLI, MCP, API, configuration, agent, skill ve plugin extension point'lerini tercih edin. Direct runtime work, repository'nin producer→consumer→ingress→policy closure ve real-binary proof kuralını korumalıdır. [Kanıt: `AGENTS.md:42-55`; `src/cli/index.ts`; `src/mcp/tools/index.ts`; `src/sdk/deckent-client.ts`]

### Repository sınırları

| Alan | Sorumluluk | Load-bearing owner'lar |
|---|---|---|
| `src/core` | Contract, config, memory, policy, routing, receipt ve security primitive'leri. | `src/core/config.ts`, `src/core/work-model.ts`, `src/core/memory-store.ts` |
| `src/orchestra` | Planning, admission, scheduling, execution supervision, evaluation, repair, settlement. | `src/orchestra/sprint-controller.ts`, `src/orchestra/sprint-phases.ts`, `src/orchestra/sprint-finalizer.ts` |
| `src/agents` | Worker process, lifecycle, permission, heartbeat ve result behavior. | `src/agents/worker.ts`, `src/agents/worker-lifecycle.ts`, `src/agents/permission-guard.ts` |
| `src/cli`, `src/mcp`, `src/api` | Application/runtime service'ler üstündeki user ve integration adapter'ları. | `src/cli/index.ts`, `src/mcp/server.ts`, `src/api/server.ts` |
| `src/dashboard`, `src/desktop`, `src/extensions/vscode` | Observability ve operator client'ları; independent execution authority olmazlar. | `.deckent/workspace/IDENTITY.md:8-9`; her dizinin entry module'leri |
| `scripts` | Build, check, generated projection, smoke harness ve release validation. | `package.json:22-77` |

ESM import'ları emitted `.js` suffix'ini içerir. User-visible CLI string'leri mechanism module'leri yerine EN/TR message catalog'a girer. Direct code change surgical ve testleri hermetic olmalı, ayrıca production ingress'e explicit wire edilmelidir. [Kanıt: `AGENTS.md:42-55,135-138`; `src/cli/helpers/messages.ts`]

### Agent geliştirme

Bir agent, canonical prompt ile `AgentPool` tarafından validate edilip yüklenen definition'dan oluşur. Project entry'leri identity bazında bundled fallback'leri override eder. Definition; description, capability, domain, priority, model/tier preference, activation rule, role, source ve retirement state taşıyabilir; invalid activation data load sırasında reject edilir. [Kanıt: `src/core/agent-pool.ts:18-104,227-320`; `src/core/agent-types.ts`]

Effective pool'u inspect/create/enable/disable/edit/reclassify/delete etmek ve statistics görmek için `agent` command family kullanılır. Route eligibility'yi agent adından çıkarmayın: role/domain map'leri yalnız subset'i kapsar; activation, manifest metadata, task DNA ve routing policy selection'ı sınırlar. [Kanıt: `src/cli/commands/agent.ts:221-523`; `src/core/activation-engine.ts`; `src/core/agent-role-contract.ts:8-31`]

### Plugin geliştirme

Güncel plugin manifest validator; `name`, semantic `version`, non-empty `description`, `skills`, `hooks` ve `permissions` ister; ad lowercase kebab-case olmalı, hook değerleri recognized hook point olmalıdır. Loading plugin dizinindeki manifest'i resolve eder, path'lerin dizin içinde kalmasını doğrular ve skill safety'yi validate eder. [Kanıt: `src/core/plugin.ts:21-81,149-190`; `src/core/plugin-loader.ts:45-101`]

Installed plugin'ler hook'ları yalnız security validation sonrası register edebilir. Hook failure isolate edilip sayılır; registration, manifest/security policy dışındaki filesystem veya command authority'yi sessizce vermez. Install; local directory, Git URL ve npm package source'larını temporary staging ve validation ile destekler. [Kanıt: `src/core/plugin-hooks.ts:65-104,166-243`; `src/core/plugin.ts:246-335`]

`plugin` CLI; install, list, enable, disable, update, info, test ve remove action'larını sunar. Marketplace publication ayrı bir skill-package concern'dür ve SDK/plugin reference'ta belgelenir. [Kanıt: `src/cli/commands/plugin.ts:9-108`; `docs/tr/reference/sdk-and-plugins.md`]

### Worker contract

Worker tek task/attempt claim eder, heartbeat yazar, atanmış file/tool authority içinde execute eder, output'u verify eder ve structured result üretir. Host-side settlement result identity, scope, disk evidence ve receipt fencing'i bağımsız doğrular; worker self-assessment kendi work'ünü terminal olarak kabul edemez. [Kanıt: `src/agents/worker.ts:793-835`; `src/core/worker-heartbeat-authority.ts`; `src/core/task-result-schema.ts:205-300`; `src/core/task-result-settlement.ts`]

Worker launch interface seviyesinde backend-neutral'dır. Güncel backend'ler tmux, subprocess, Docker ve sandbox adapter'larını içerir; selection effective configuration ve environment availability altında yapılır. Yeni restart olmuş coordinator, boş process-local registry'den tek başına “worker absent” çıkaramaz; backend inventory `unknown` döndürebilir. [Kanıt: `src/orchestra/spawn-backend.ts:28-92`; `src/orchestra/spawn-backend-docker.ts`; `src/providers/subprocess.ts`; `src/providers/sandbox.ts`]

### Brain ve lifecycle work

Brain control plane'dir; general-purpose writer değildir. Planning directive/task builder ve planner'ı, execution controller ve scheduler'ı, evaluation bağımsız result-evaluation yollarını kullanır; finalization retrospective, learning, gate ve terminal publication sahibidir. Lifecycle feature eklerken bu authority boundary'leri korunur. [Kanıt: `src/orchestra/brain.ts`; `src/orchestra/task-builder.ts`; `src/orchestra/sprint-controller.ts`; `src/orchestra/result-evaluator.ts`; `src/orchestra/sprint-finalizer.ts`]

Lifecycle change yalnız type veya unit test ekliyorsa incomplete'dir. Canonical producer, consumer, actual CLI/API/MCP ingress, effective config/policy enablement, recovery behavior ve evidence projection gösterilmelidir. [Kanıt: `AGENTS.md:42-55`; `src/orchestra/exact-plan-start-service.ts`; `src/orchestra/execution-recovery-service.ts`]

### Dashboard ve Desktop geliştirme

Dashboard bir React/Vite/Tailwind observability client'ıdır. `build:dashboard`, `test:dashboard`, `tsc:dashboard`, design-token generation ve desktop/API sync ayrı gate'lerdir; `build:all` dashboard'u içerir, desktop build'i içermez. [Kanıt: `package.json:37-39,45-60,73-77`; `scripts/build-dashboard.mjs`; `scripts/build-design-tokens.mjs`]

Server compiled dashboard asset'lerini serve edebilir veya development origin'e proxy olabilir; API auth, control-mutation gate'leri ve terminal authentication server-side authority olarak kalır. Client state tek başına run, approval veya terminal session promote edemez. [Kanıt: `src/cli/commands/serve.ts:72-80`; `src/api/server.ts:745-856,2567-2708`; `src/api/terminal/auth-provider.ts`]

### Verification ve clean-clone proof

| Katman | Komut veya harness | Contract |
|---|---|---|
| Type ve policy | `npm run lint` | Core/dashboard TypeScript ve focused gate chain. [Kanıt: `package.json:39,42-60`] |
| Core test | `npm test` | Vitest repository suite. [Kanıt: `package.json:25`] |
| UI client | `npm run test:dashboard`, `npm run test:desktop` | Ayrı dashboard ve desktop configuration'ları. [Kanıt: `package.json:30,76`] |
| Binary/API surface | `npm run test:binary-contracts`, `npm run test:e2e-surfaces` | Compiled-binary ve cross-surface harness'leri. [Kanıt: `package.json:29-30`] |
| Clean package install | `node scripts/clean-clone-smoke.mjs` | Isolated temporary state'e pack/install eder ve structured stage raporu üretir. [Kanıt: `scripts/clean-clone-smoke.mjs:1-30`] |
| User-surface smoke | `scripts/*smoke*.mjs` altındaki focused script'ler | Changed behavior'a göre seçilen surface-specific, non-substitute proof. [Kanıt: filesystem inventory; `scripts/test-e2e-surfaces.mjs`] |

Failed gate'i manual claim ile değiştirmeyin. Riskle orantılı test seçin; ardından değişen user surface'in actual binary'sini execute edin. [Kanıt: `AGENTS.md:42-55`]

### Documentation ve repository synchronization

Manual docs, generated reference ve planning ledger farklı owner'lara sahiptir. Generated reference/stats kendi script'lerinden gelmeli; `docs/MASTER-PLAN.md` planning SSOT olarak kalır. `scripts/sync-to-product.mjs` filtered develop→product staging tool'udur: dry-run keep/drop decision'larını raporlar, apply staging tree hazırlar ve bilinçli olarak commit/push yapmaz. [Kanıt: `package.json:66-71`; `scripts/gen-reference-docs.mjs:1-18`; `scripts/sync-to-product.mjs:1-16,139-183`; `AGENTS.md:94-96`]

### Safe troubleshooting sırası

1. Mutation öncesi `status --json`, `doctor --json`, exact task/heartbeat/result file'ları ve ilgili log'ları okuyun. [Kanıt: `src/cli/commands/status.ts`; `src/cli/commands/doctor.ts`; `src/agents/worker-lifecycle.ts`]
2. Problemi config, provider authority, lifecycle projection, worker liveness, settlement, generated-doc drift veya build output olarak classify edin. [Kanıt: `src/core/config.ts`; `src/core/provider-authority-composition.ts`; `src/core/run-status-authority.ts`; `src/core/task-result-settlement.ts`]
3. Dry-run/read surface'i tercih edin; kill veya active-run cleanup öncesi owner approval alın. [Kanıt: `AGENTS.md:81-94`; `src/cli/commands/recover.ts:170-181`; `src/cli/commands/cleanup.ts:118-197`]
4. Narrow reproducer'ı, sonra owning gate'i ve real binary'yi yeniden çalıştırın. [Kanıt: `AGENTS.md:42-55`; `package.json:25-77`]

## Dogfood / repository gerçeği

| Alan | Durum | Güncel kısıt |
|---|---|---|
| Agent pool ve CLI | ✅ canlı | 21 project prompt persona load edilir; yalnız 15'i hardcoded role/domain mapping taşır, exact “+2 custom” identity semantiği OQ-21'de kalır. |
| Plugin loader/hooks/CLI | ✅ canlı source | Install ve hook path'leri implemented'dır; bu documentation run untrusted plugin install/execute etmedi. |
| Worker/Brain authority split | ⚠️ kısmi | Contract ve enforcement seam'leri vardır; repository-local policy unbypassable enterprise boundary değildir. [Kanıt: `AGENTS.md:124-128`] |
| Dashboard build | ✅ owner-verified | Owner `npm run build:all` sonucunu green bildirdi; bu pass yeniden çalıştırmadı. |
| Clean-clone/platform matrix | ⚠️ HOLD | Harness'ler vardır; bu documentation pass network/install/platform matrix'i çalıştırmadı. |
| Generated docs | ✅ owner-verified güncel | Pipeline-owned target'lar restore edildi; generated-reference check 5/5 ve master-plan lint green'dir. Input-authority OQ-26 ayrı kalır. |
| Develop→product sync | ⚠️ operator-controlled | Script inspect edilebilir staging tree üretir; commit, push ve public-repository change'leri manual/authorized kalır. |

[Development ve release](development-and-release.md), [Recovery runbook](recovery-runbook.md), [Agents](../reference/agents.md) ve [Plugins](../reference/sdk-and-plugins.md) belgelerine bakın.
