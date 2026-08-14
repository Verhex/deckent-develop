# CLI reference

## Product-user perspektifi

### Doğrulanan surface

Built Commander tree 75 registered top-level command içerir: 74'ü visible, `gateway-runtime` ise hidden'dır. Tree recursive gezildiğinde 211 visible command path ve bu hidden internal path bulunur. [Kanıt: `dist/cli/index.js` içinden `buildProgram()` import edip `Command.commands` tree'sini recursive inceleyen command, 2026-08-01; registration order `src/cli/index.ts:99-225`]

`node dist/cli/entry.js --help` ile 211 visible path'in her birindeki `--help` gerçek binary üzerinde çalıştırıldı: 212 invocation, 212 exit-code-zero sonuç. Help verification; registration, parsing, usage, options ve help rendering'i kanıtlar, her state-changing action'ı kanıtlamaz. Bu yeniden-yazımın `docs/` dışında yazma izni olmadığı için run/sprint/autonomous, config mutation, cleanup, kill, provisioning ve diğer mutating action'lar çalıştırılmadı. [Kanıt: recursive binary-help audit çıktısı, 2026-08-01; user boundary]

İncelenen binary Deckent `0.100.0` ve Node `v24.15.0` bildirir. [Kanıt: `node dist/cli/entry.js --version-json`, 2026-08-14]

### Invocation

Installed binary `deckent …`, repository build ise `node dist/cli/entry.js …` olarak kullanılır. O build'e ait exact argument ve option'lar için her seviyede `--help` eklenir. [Kanıt: root ve recursive binary help çıktıları, 2026-08-01; `package.json` içindeki `bin`]

### Child command içermeyen top-level komutlar

| Command | Gerçek registered purpose |
|---|---|
| `init` | Deckent project initialize eder. |
| `start` | Run/sprint başlatır; zero-config description input kabul eder. |
| `plan` | Execution olmadan plan üretir. |
| `status` | Güncel run dashboard'ını gösterir. |
| `attach` | Tmux orchestra session'a attach olur. |
| `spawn` | Task worker'ı manuel başlatır; Docker exit'e kadar block eder, tmux/subprocess etmez. |
| `kill` | Running worker'ı sonlandırır. |
| `retro` | Son retrospective'i gösterir. |
| `cleanup` | Sprint artifact'larını temizler. |
| `doctor` | Dependency ve health kontrol eder. |
| `history` | Run history gösterir. |
| `upgrade` | Deckent'i self-update eder. |
| `onboard` | Onboarding'i çalıştırır. |
| `analyze` (`analyze-project`) | Stack, size ve methodology analizi yapar. |
| `archive-debt` | DB-first technical-debt durumunu raporlar. |
| `dashboard` | Auto-refresh terminal dashboard açar. |
| `serve` | SSE destekli HTTP API server başlatır. |
| `web` | Deprecated web/API launcher; help `serve` kullanımına yönlendirir. |
| `sync` | Adapter file'ları sync eder ve out-of-band değişiklikleri bulur. |
| `watch` | Worker'ı izler veya tmux dashboard split açar. |
| `run <description>` | Tek one-shot task çalıştırır; aşağıdaki alias child'lara da sahiptir. |
| `runs` | RunFlow'ları listeler; seçili flow'u approve, reject, retire veya start eder; `--limit` listeyi sayfalar. |
| `test` | Retro, memory update ve decay olmadan test sprint çalıştırır. |
| `review` | Task evaluation'larını inceler. |
| `finalize` | Managed sprint knowledge/config projection'larını update eder ve decay çalıştırır. |
| `explain` | Son sprint'i human-oriented dilde açıklar. |
| `set-directives` | Content, file veya stdin'den `DIRECTIVES.md` yazar. |
| `connect` | Read-only provider/MCP/IDE/shell diagnosis yapar. |
| `plan-nl` | Free-form intent'ten single-task `DIRECTIVES.md` scaffold preview üretir. |
| `do` | Golden flow'u default olarak preview eder; `--run` başlatır. |
| `heartbeat` | `.deckent/HEARTBEAT.md` içindeki task'ları çalıştırır. |
| `chat` | Installed AI CLI üzerinden conversational session başlatır. |
| `output` | Bir worker task'ın captured output'unu gösterir. |
| `recall` | Project memory sorgular. |
| `remember` | Project memory'ye note kaydeder. |
| `resume` | Son checkpoint'ten devam eder. |
| `features` (`feature-query`) | Feature manifest'i category ile sorgular. |
| `truth` | Code → wired → enabled → proof truth-chain çözer. |
| `audit` | Audit event'leri gate eder veya query/export/forward/retain eder. |
| `audit-verify` | Audit HMAC chain doğrular. |
| `recover` | Crashed veya stuck sprint için canonical recovery uygular. |
| `resources` | Live Docker worker resource'larını veya resource log analizini gösterir. |
| `usage` | Provider transcript'lerinden token/limit consumption gösterir. |
| `kpi` | Run/sprint KPI scorecard gösterir. |
| `limits` | Subscription-window usage ve start-gate threshold kontrol eder. |
| `openrouter-probe` | OpenRouter free model'leri live-probe eder ve cache refresh eder. |
| `xverify` | Claim'i farklı provider ile cross-verify eder; typed evidence'ı host adjudicate eder. |
| `cu-status` | Computer-use flag ve per-capability availability gösterir. |
| `help-info` (`info`) | Localized quick-reference help gösterir. |

[Her satır için kanıt: built `buildProgram()` tree'den description ve karşılık gelen gerçek binary `--help`; tümü exit code 0, 2026-08-01]

### Command group'ları ve tüm child path'ler

| Parent | Child path'ler | Behavior boundary |
|---|---|---|
| `config` | `set`, `get`, `export`, `import`, `list`, `keys`, `migrate`; `nervous`, `nervous set`, `nervous override`, `nervous list`, `nervous reset` | Project configuration okur/yazar/migrate eder ve Nervous authority policy yönetir. Bare `config` effective config okur; CLI `config read` yoktur. |
| `plugin` | `install`, `remove`, `update`, `list`, `info`, `test`, `create` | Plugin install, inspection, validation, update, removal ve scaffold işlemleri. |
| `run` | `start`, `status`, `retro`, `history` | Aynı adlı top-level lifecycle command'larına bridge alias; parent'ın kendisi required `<description>` ile one-shot execution'dır. |
| `process` | `submit`, `status`, `result` | `ExecutionRequest` submit eder, poll eder ve result getirir. |
| `agent` | `lint`, `list`, `create`, `stats`, `enable`, `disable`, `delete`, `edit`, `reclassify`, `info` | Agent pool ve outcome classification yönetimi/inspection. |
| `skill` | `list`, `create`, `install`, `update`, `enable`, `disable`, `delete`, `info`, `search`, `publish` | Local/installed skill ve marketplace validation/publication yönetimi. |
| `checkpoint` | `list`, `approve`, `reject` | Human checkpoint'leri inceler ve karara bağlar. |
| `docs` | `add`, `remove`, `list`, `update`, `run`; `track`, `track scan`, `track status`, `track sync` | Managed-doc rule ve freshness tracking yönetir. |
| `task` | `settle` | Immutable one-shot settlement'ı inceler; yalnız explicit attestation ile uygular. |
| `cost` | `show`, `update`, `budget` | Pricing okur/fetch eder ve budget limit yönetir. |
| `memory` | `rebuild`, `export`, `stats`, `backup`; `relations`, `relations list`, `relations review` | DB-first memory store, projection, backup ve relation review yönetir. |
| `trace` | `extract` | Claude Code transcript'lerinden aligned/general training example çıkarır. |
| `nervous` | `enable`, `accept`, `reject`, `edit`, `undo`, `history`, `recommendations` (`recs`), `log`, `accept-panic`, `baseline-refresh` | Proactive recommendation ve reversible action'ları inceler/yönetir. |
| `mode` | `show`, `sprint`, `run`, `task`, `process`, `auto`, `global` | `deckent_style` okur veya ayarlar; `run` güncel olarak `sprint` persist eder. |
| `models` | `list`, `refresh`, `tier`, `activate <model> --provider <name>`, `deactivate <model> --provider <name>`, `activation` | Registry model'lerini browse, refresh, classify eder ve model activation decision'larını yönetir. |
| `flow` | `list`, `add`, `run`, `approve` | Scheduled process-mode flow ve pending dispatch approval yönetir. |
| `rbac` | `check`, `roles`, `grant`, `revoke` | Permission inceler, user-role assignment değiştirir. |
| `evolve` | `report` | Cross-sprint agent/skill trend ve prompt suggestion gösterir. |
| `autonomous` | `enable`, `start`, `plan`, `status`, `stop`, `cleanup`, `pending`, `approve`, `reject`; `backlog`, `backlog add`, `backlog list`, `backlog remove` | Continuous loop, parked approval ve backlog yönetir. |
| `autonomous-mission` | `create-list`, `create-goal`, `list` | Durable v2 mission oluşturur veya listeler. |
| `bot` | `listen`, `start`, `stop`, `status` | Messaging approval bot işletir. |
| `gateway` | `listen`, `start`, `stop`, `status`; `pair`, `pair list`, `pair approve`, `pair reject` | Project gateway ve pairing decision işletir. Bazı child command'lar description render etmez. |
| `mcp` | `add`, `list`, `remove`, `get` | External MCP server registration ve scope precedence yönetir. |
| `image` | `build` | Packaged worker Docker image build eder. |
| `provider-authority` | `keyring`, `keyring status`, `keyring init`, `keyring rotate` | Key material göstermeden host authority key'lerini inceler, initialize veya rotate eder. |
| `execution-authority` | `mount-adopt` | Namespace-local Linux/WSL mount metadata inceler veya reconcile eder. |

[Her path için kanıt: built `buildProgram()` recursive inventory ve tüm visible path'lerde gerçek binary `--help`, 2026-08-01; source registrations `src/cli/index.ts:99-225`]

Hidden `gateway-runtime`, supervisor tarafından spawn edilen internal per-project child'dır; user command değildir. [Kanıt: built Commander tree; `src/cli/commands/gateway.ts:161`]

### Explicit dikkat gerektiren komutlar

| Surface | Neden consequential? |
|---|---|
| `start`, `run`, `do --run`, `spawn`, `test`, `resume`, `recover` | Execution başlatır, devam ettirir veya değiştirir; runtime/task state üretebilir. |
| `kill`, `cleanup`, `autonomous stop`, `autonomous cleanup` | Worker sonlandırır veya runtime artifact kaldırır; repository policy owner approval ve exact scope ister. |
| `config set\|import\|migrate`, `mode …`, `nervous enable`, `autonomous enable`, `models activate\|deactivate` | Policy/configuration değişikliği persist eder. |
| `agent …`, `skill …`, `plugin …`, `rbac grant\|revoke`, `mcp add\|remove` | Registry, package, identity veya external-server configuration değiştirir. |
| `memory rebuild\|export\|backup`, `remember`, `docs …`, `finalize`, `set-directives` | Project knowledge, generated projection veya directives yazar. |
| `models refresh`, `cost update`, `openrouter-probe`, `upgrade`, `image build` | Network, cache, installation veya image side effect oluşturur. |
| `provider-authority keyring init\|rotate`, `execution-authority mount-adopt` | Authority material veya authority-adjacent metadata değiştirir ve explicit operator intent gerektirir. |

[Kanıt: ilgili built command description/help; operation rules `AGENTS.md:69-108`; `src/cli/commands/` altındaki implementation'lar]

### Bilinen CLI truth gap'leri

- Root help English ve Türkçe description karıştırır (`status`, `history`, `recover`); birçok description/option `getMessage` yerine hard-code edilmiştir. [Kanıt: gerçek root help, 2026-08-01; `src/cli/index.ts:102-109`; `src/cli/commands/status.ts:1028-1039`; `src/cli/commands/history.ts:222-232`; `src/cli/commands/recover.ts:170-183`; i18n contract `AGENTS.md:42-48`]
- Public status output-mode enum yazım hatalı `explainatory` ve `standart` değerlerini gösterir. [Kanıt: gerçek `deckent status --help`; `src/cli/commands/status.ts:1039`]
- `run`, hem required-description one-shot parent hem lifecycle alias namespace olduğu için `deckent run [options] [command] <description>` gibi awkward usage üretir. [Kanıt: gerçek `deckent run --help`; `src/cli/commands/run.ts:455-476,920-939`]
- Public help aynı anda `run` ve `sprint` kullanır; `mode run`, `sprint` persist eder. [Kanıt: gerçek root ve `mode --help`; `src/cli/commands/mode.ts`]
- `web`, explicitly deprecated olmasına rağmen visible kalır. [Kanıt: gerçek root help; `src/cli/index.ts:145-148`]

Bu farklar ve action-level CLI↔MCP gap'leri `docs/analysis/CODE-DOC-DIFF-2026-08.md` içinde sınıflandırılmıştır.

## Dogfood / repository gerçeği

| CLI property | Durum | Current evidence |
|---|---|---|
| Registration/help surface | ✅ canlı | Root + 211 visible path real binary help'i exit 0 ile render etti. |
| Read-only operational probe | ✅ canlı | Güvenli olduğunda version, doctor, status, config, feature/truth, history/retro/review ve service-status path'leri çalıştırıldı. |
| State-changing behavior proof | ⚠️ HOLD | Bu audit sprint/run/autonomous action çalıştıramaz; help mutation completion certify etmez (OQ-20). |
| i18n | ⚠️ kısmi | Mixed-language ve hard-coded Commander metadata doğrulanmıştır. |
| Run/Sprint vocabulary | ⚠️ kısmi | Parent/child collision ve compatibility naming OQ-14 olarak kalır. |
| CLI↔MCP semantic parity | ⚠️ kısmi | Ratchet geçer fakat action/schema/default farkları sürer. [Kanıt: `docs/analysis/CODE-DOC-DIFF-2026-08.md`] |
