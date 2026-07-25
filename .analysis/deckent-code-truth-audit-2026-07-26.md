# Deckent Code-Truth Audit — 2026-07-26

> Durum: read-only analiz snapshot'ı
> Snapshot HEAD: `79acad6ab14d53014c078bdcd90db3daf5e523ad`
> Çalışma ağacı: başka oturumlar nedeniyle hareketli/dirty
> Analiz dili: Türkçe; teknik terimler English
> Amaç: Deckent'i kod gerçeğinden anlamak, `code → wired → enabled → proof`
> zincirini çıkarmak ve iş planına geçiş için mimari karar omurgası üretmek

## 1. Belge kontratı

Bu belge:

- güncel kaynak kodu documentation iddialarından üstün tutar;
- code presence ile production readiness'i birbirine karıştırmaz;
- her subsystem'i mümkün olduğunca `code`, `wired`, `enabled`, `proof` olarak
  ayrı değerlendirir;
- mevcut güçlü mimariyi korur; yeniden yazma önerisini default çözüm yapmaz;
- solo/local kullanım ile multi-tenant enterprise kullanımını aynı tasarım
  kararında birlikte ele alır;
- Linux, macOS, Windows native, WSL, container ve ileride remote/distributed
  runtime'ları aynı platform contract'ının parçaları kabul eder;
- “MVP” veya geçici güvenlik mimarisi önermez.

Bu turda:

- hiçbir source, test, config, plan veya runtime state dosyası değiştirilmedi;
- build/test/sprint/provider/network çağrısı çalıştırılmadı;
- kanıt seviyesi static code/import/call graph, mevcut test artifact'leri ve
  repository configuration inspection ile sınırlı tutuldu;
- başka oturumların değiştirdiği dosyalar olduğu için bulgular snapshot
  semantiğindedir.

Bu nedenle “repository'nin her production davranışı canlı olarak %100
kanıtlandı” iddiası yapılmaz. Tam ürün gerçeği ancak bu belgede önerilen
continuous Truth Ledger ile sürdürülebilir.

## 2. Sayısal snapshot

Snapshot anında:

- production-benzeri TypeScript/TSX: **1.139 dosya / 321.467 satır**
- root test tree: **2.402 dosya / 569.644 satır**
- production-benzeri dosya dağılımı:
  - `core/`: 321
  - `orchestra/`: 203
  - `cli/`: 185
  - `dashboard/`: 106
  - `connectors/`: 62
  - `mcp/`: 56
  - `api/`: 43
  - `desktop/`: 41
  - `nervous/`: 33
  - `agents/`: 28
  - `agent/`: 22
  - `providers/`: 19
  - `monitor/`: 6
  - `extensions/`: 4
  - `mcp-client/`: 4
  - `training/`: 3
  - `sdk/`: 2
  - root entry: 1

MASTER-PLAN snapshot'ı:

- 313 unique work item
- 167 P0
- 100 P1
- 38 P2
- 8 priority alanı parse edilemeyen satır
- 194 `✅`
- 62 `🟡`
- 54 `⬜`
- 1 `🔬`
- 1 `⏸️`

167 ayrı P0, gerçek execution ordering üretmez. Planın priority modelinin
dependency gate + stop-the-line programlar üzerinden yeniden kurulması gerekir.

## 3. Executive verdict

Deckent bugün basit bir coding-agent wrapper değildir. Kod tabanında gerçek bir
Agent OS için gereken organların büyük bölümü bulunur:

- deterministik sprint lifecycle;
- planner/router/scheduler/evaluator;
- multi-provider execution;
- native conversational terminal;
- CLI, MCP, HTTP/SSE, Dashboard, Desktop ve connector yüzeyleri;
- approval, capability, policy ve audit primitives;
- local-first SQLite/FTS memory;
- Mission V2 autonomous substrate;
- outcome-driven routing learning;
- trace/training primitives;
- packaging, CI ve release gates.

Ana sorun “özellik yokluğu” değildir. Ana sorun, bu organların ortak bir
**authority, identity, persistence ve evidence spine** üzerinden çalışmamasıdır.

Bugünkü mimari en doğru şekilde şöyle tanımlanabilir:

> Güçlü bir local-first orchestration kernel + farklı olgunlukta birden fazla
> Agent OS subsystem'i; fakat henüz tek bir runtime authority altında birleşmiş
> multi-tenant Agent OS değil.

## 4. Korunması gereken mimari

Aşağıdaki parçalar yeniden yazılmamalı; ortak substrate'e yükseltilmeli:

1. Deterministik 8-faz orchestration lifecycle.
2. Dependency scheduling ve execution-topology yaklaşımı.
3. RunFlow typed contract/reducer, plan digest ve exact snapshot yaklaşımı.
4. Mission V2 SQLite, lease, CAS claim/settlement ve ambiguous execution park
   davranışı.
5. Native agent loop ve direct/nested tool approval parity.
6. Provider credential scrub, invocation receipt ve fail-closed budget
   yaklaşımı.
7. Routing-cell outcome capture ve evolved routing rule auto-apply döngüsü.
8. Local-first memory ve human-readable projection ilkesi.
9. npm packed-install matrisi ve OIDC provenance'lı release workflow.
10. Electron `contextIsolation`, sandbox, navigation/permission deny temeli.

Bu audit'in yönü “Deckent'i yeniden yaz” değildir. Yön:

> Mevcut güçlü çekirdekleri tek authority/evidence/execution substrate altında
> compose et; yarım veya paralel truth kaynaklarını emekliye ayır.

## 5. Systemic root causes

### 5.1 Composition gap

Birçok güvenlik veya lifecycle primitive'i gerçektir fakat production
composition-root'a enjekte edilmemiştir.

Örnekler:

- plugin signature/containment primitive'leri var, production hook loader
  security options almıyor;
- memory search tenant filtreleyebiliyor, server `req` geçmiyor;
- DeckBroker mint ediliyor, execution spawn context'ine taşınmıyor;
- tool availability/scope/shadow primitives var, live dispatch ortak zincirine
  bağlanmıyor;
- telemetry config ve UI var, production collector caller'ı yok;
- computer-use executor var, production caller'ı yok.

### 5.2 Multiple authorities

Aynı kavram farklı yüzeylerde farklı adlarla ve farklı policy ile tanımlanıyor:

- principal ve tenant;
- capability ve grant adları;
- risk/pure/mutation sınıfları;
- approval ve idempotency;
- provider/model/account/backend identity;
- budget ve termination;
- run/task/process lifecycle;
- audit ve evidence.

Bu nedenle güvenlik kontrolünü bir yerde sertleştirmek başka bir yüzeyi bypass
edebilir veya deny-all hâline getirebilir.

### 5.3 Solo persistence used as multi-process persistence

Atomic rename tek başına distributed correctness sağlamaz. RunFlow, autonomous
backlog/approval, gateway access/session ve bazı dashboard/monitor stores
whole-file read-modify-write yapar; lock, revision, fencing token veya
transaction yoktur.

### 5.4 Proof presence confused with proof of function

Bazı testler:

- yalnız source string arar;
- unsupported runtime'da `return` ederek PASS olur;
- smoke command'i çalıştırmadan “declared” kabul eder;
- non-empty artifact'i successful proof sayar;
- stale coverage artifact'ini taze coverage gibi tüketir.

### 5.5 Feature-flag retirement limbo

Yeni canonical yollar code-complete'e yaklaşırken eski yollar public/default
kalmıştır. En görünür örnek RunFlow ile `plan-nl`/golden-flow ikiliğidir.

## 6. Code → wired → enabled → proof özeti

| Subsystem | Code | Production wire | Enablement | Proof hükmü |
|---|---|---|---|---|
| Sprint orchestration | Güçlü | Güçlü | Default path | Geniş hermetic proof; moving tree nedeniyle bu tur rerun yok |
| Mission V2 | Güçlü | Kısmi | Default-off/fail-closed | SQLite/CAS test zemini güçlü; yalnız `task` runner production-complete |
| RunFlow V2 | Güçlü | CLI/REPL/API'ye bağlı | Default-off | Unit/integration güçlü; multi-writer/crash ve product cutover açık |
| Native terminal agent | Güçlü | Default terminal path | Default-on, rollback var | Direct/nested approval parity güçlü |
| Process/capability mode | Güçlü | Canlı | Provider-free capability çalışır | Authority/sandbox P0 açıkları var |
| Autonomous V1/V2 | Güçlü | Canlı composition | Flag-gated | JSON persistence ve approval binding P0 |
| Nervous | Geniş | Çoğunlukla bağlı | Flag-gated | Ownership/dispatch settlement ve dormant parçalar var |
| Providers | 19-file geniş matris | Claude/Codex/Gemini/Ollama/OpenRouter canlı | Config/readiness gated | Planner/worker parity ve authority composition açık |
| Plugin/skill ecosystem | Geniş | Plugin hooks ve skill prompt injection canlı | Enabled catalog/install | Supply-chain/containment P0 |
| MCP client | Gerçek | REPL/chat paths | Config-driven | Executable/URL trust ve tool semantics açık |
| Terminal REST/WS/RPC | Gerçek | Canlı | Terminal enabled | Local PTY proof güçlü; tenant authorization negatif |
| Dashboard | Gerçek | API'ye bağlı | Serve ile | OIDC kontratı kırık; real-browser/a11y proof açık |
| Desktop | Gerçek Electron app | Dev/local lifecycle | Manual/dev | Linux-dir dışı dağıtım ve updater yok |
| Connectors/gateway | Gerçek | CLI bot/gateway paths | Explicit config/command | Conversation/project/approver isolation P0 |
| Computer use | 4 action/4 platform | Production caller yok | Etkisiz | Mock/subprocess proof; real OS proof yok |
| Trace/training | Capture/schema parçaları gerçek | Native trace canlı, sprint trace gated | Native opt-out; sprint default-off | Segment writer/corpus/evolution loop tamamlanmamış |
| Feature truth | Gerçek engine | CLI/MCP bağlı | Diagnostic | Yalnız 5 curated block; release authority değil |

## 7. P0 findings

### 7.1 Verified principal ve tenant boundary

#### Terminal IDOR

`src/api/terminal/session-manager.ts` session'ları global ID map'inde tutar.
`get/list/replay/write/attach/resize/kill` operasyonları principal veya tenant
istemez.

`src/api/server.ts:2664-2684`:

- `GET /api/terminal/sessions` tüm session'ları döndürür;
- `DELETE /api/terminal/sessions/:id` arbitrary ID'yi öldürür.

`src/api/terminal/ws-gateway.ts:85-268`:

- auth sonucu boolean'dır;
- verified principal bridge'e taşınmaz;
- client arbitrary session ID ile attach/replay/write/resize yapabilir.

`tests/api/ws-tenant-propagation.test.ts:131-162` açığı istemeden pinler:
LocalToken ile `tenant-beta` session'a attach başarılı sayılır.

#### Raw config secret disclosure

`src/api/server.ts:907-912`, raw `.deckent/config.json` içeriğini herhangi bir
authenticated caller'a döndürür. Redaction veya admin gate yoktur.

Bu config aşağıdakileri taşıyabilir:

- connector bot token'ları;
- SMTP username/password;
- API auth token;
- OIDC HMAC/client secret;
- SCIM token;
- provider veya operational policy secret'ları.

#### Memory tenant half-wire

`src/api/memory-search-endpoint.ts` request/principal verilirse tenant
filtreleyebilir. `src/api/server.ts:1193-1194` endpoint'i `req` olmadan çağırır.
MASTER-PLAN'daki `MEM-TENANT ✅` bu nedenle güncel composition tarafından
refute edilir.

#### Principal verification contract kullanılmıyor

`deriveRequestPrincipal` unsigned JWT payload decode eder ve role/tenant
claim'lerini güvenilir saymak için `{ authGateVerified: true }` bekler.
Production call'ların çoğu bu seçeneği geçmez. Upstream auth normal yolda token
doğrulasa bile authorization katmanı verified principal nesnesini tüketmek
yerine token'ı yeniden decode eder.

Gerekli sınır:

```text
transport authentication
  → VerifiedPrincipal
  → immutable TenantProjectContext
  → authorization/capability/approval
```

### 7.2 Dashboard OIDC

Production flow üç ayrı kontrat kırığı taşır:

1. `LoginPage.tsx:64-79`, bearer olmadan `/api/config` çağırır; endpoint generic
   auth arkasındadır.
2. Server `oidc-callback-endpoint.ts:328-330` success olarak `{token, claims}`
   döndürür; `CallbackPage.tsx:89-95` `{ok, token}` bekler.
3. Nonce generate/storage/authorize URL'de vardır fakat callback exchange ve
   server verification contract'ına taşınmaz.

Browser ayrıca IdP discovery'yi doğrudan cross-origin yapar. Server aynı
discovery'yi tekrar yapar. Gerçek browser/IdP round-trip proof'u yoktur.

### 7.3 Canonical operation/capability authority yok

#### Process endpoint

`/api/process/submit` authentication arkasındadır fakat
`isGatedControlMutation` listesinde değildir. Her authenticated role process
submission yapabilir.

Policy:

- `http.get`
- `fs.read`
- `env.read`
- `db.query`
- `mail.search`
- `erp.read`

operasyonlarını pure/auto sınıfına alabilir.

Live registry construction least-privilege config/grant taşımadığı için
`CapabilityBroker` default permissive çalışır.

#### Sandbox breakout classes

- `http.get`: private/loopback/cloud metadata deny, redirect policy, timeout ve
  response cap yok;
- `fs.read`: lexical containment sonrası symlink takip edilir;
- `shell.exec`: allowlist yoksa tüm command'lar ve arbitrary `cwd` açıktır.

Grant adları da handler adlarıyla uyuşmaz:

- `network` ↔ `net.read`
- `shell` ↔ `shell.exec`
- `db-query` ↔ `db-read`
- `erp-read` ↔ `erp.read`

Bugünkü enforcement kapalıyken bypass; doğrudan hard-flip yapılırsa deny-all
riski vardır.

#### Autonomous/MCP/reactive bypass

- MCP process caller-supplied `actor/tenant` kabul eder;
- process status/result tenant filtresizdir;
- autonomous approval herhangi bir pending record doğrulamadan arbitrary
  `triggerId` için önceden yazılabilir;
- reactive webhook caller-supplied risk/severity/policy ile auto dispatch
  üretebilir;
- API ve MCP control semantics aynı değildir.

Gerekli çözüm tek generated `OperationDescriptor` kataloğudur:

```text
operation ID
  + effect class
  + resource schema
  + required role/capability
  + tenant/project scope
  + approval tier
  + idempotency contract
  + budget/termination contract
  + audit redaction schema
```

CLI/MCP/API/terminal/Desktop/connectors/autonomous aynı descriptor'ı
tüketmelidir.

### 7.4 Planner execution authority

`src/orchestra/planner.ts:517-545,801-840` generic planner:

- inherited cwd/env ile child açar;
- prompt'u argv'de taşır;
- explicit no-tools/read-only contract taşımaz;
- response byte cap'i ve outer AbortSignal yoktur;
- process-tree settlement ortak değildir.

Provider gerçeği:

- Claude: explicit no-tools yok;
- Codex: `codex exec --full-auto`;
- Gemini: `--approval-mode yolo --skip-trust`;
- Ollama: non-agentic HTTP, daha dar;
- OpenRouter: en olgun native HTTP planner;
- OpenAI-compatible generic fallback executable `#`, işlevsiz;
- Bedrock planner command boş, işlevsiz.

Planner'a Worker yetkisi verilmemelidir. Zorunlu
`PlannerExecutionAuthority`:

- verified tenant/project/principal/run/call identity;
- requested/resolved provider-model-account identity;
- prompt/output schema digest;
- timeout/input/output/response/cost ceiling;
- `tools:none`;
- `filesystem:none`;
- `network:provider-only`;
- `sessionPersistence:false`;
- cancellation/settlement/evidence receipt.

Provider-specific typed `plan(authority, signal)` olmayan fallback fail-closed
olmalıdır.

### 7.5 Worker execution ownership ve settlement

`SubprocessBackend`, task timeout override olduğunda fresh ve cache'e alınmayan
backend yaratır. Spawn bu instance'a gider; kill/list yalnız cached backend
map'ini tarar.

Sonuç:

- adaptive-timeout worker coordinator kill/list/cleanup yüzeyinde görünmez;
- native Windows `auto → subprocess` olduğundan platform etkisi yüksektir.

Ayrıca bazı provider spawn path'lerinde `exit` listener bulunurken child
`error` settlement yoktur. Availability check ile real spawn arasındaki
ENOENT/permission race coordinator process'ini düşürebilir.

Gerekli model:

```text
WorkerExecutionRegistry
  identity: tenant/project/run/task/attempt
  backend: subprocess/tmux/docker/sandbox/remote
  host handle: PID/PGID/Windows Job/container/session
  leases: budget/credential/capability
  state: starting → running → terminal
  terminal: succeeded|failed|spawn_error|timed_out|cancelled|held
  settlement: idempotent, durable, receipt-backed
```

### 7.6 Provider authority composition

Mevcut Provider Authority 630–656 programı doğru yöndedir ve korunmalıdır.
Ancak snapshot gerçeğinde configured authority ingress için çalışan ALLOW path
yoktur; candidate + route-lock + reservation binding eksiktir.

DeckBroker da iki yarım olarak bulunur:

- bootstrap broker mint eder;
- subprocess tüketebilir;
- fakat bootstrap → runSprint → spawn composition broker'ı taşımıyor.

Shared `process.env` mutation kalıcı credential boundary olmamalıdır.

### 7.7 Plugin/skill/agent supply chain

#### Plugin

Production zinciri:

```text
install
  → sınırlı manifest shape kontrolü
  → project plugin dizinine kopya
  → auto-enable
  → enabled hook scan
  → security options olmadan dynamic import
  → host Node process'inde callback
```

Sorunlar:

- manifest/name/path containment eksik;
- hook path containment eksik;
- production `loadPluginHooks(projectRoot)` security config geçirmiyor;
- signature yalnız entrypoint+manifest'i kapsıyor, hooks/dependencies/package
  tree'yi kapsamıyor;
- hooks host process'inde full Node authority ile çalışıyor;
- invalid plugin'ler sessiz atlanabiliyor.

MASTER-PLAN `PLUGIN-AUTH ✅` satırı production composition tarafından refute
edilir.

#### Skill ve agent

- skill manifest ID safe-name contract'ı yok;
- unchecked ID destination/delete/update path'ine giriyor;
- update live directory'yi staging/rollback olmadan silebiliyor;
- checksum trusted publisher proof'u değil;
- worker `SKILL.md` içeriğini trust/size validation olmadan prompt'a katıyor;
- agent ID/path resolution aynı traversal sınıfını taşıyor;
- MCP catalog management caller-supplied root/ID'leri bu API'lere geçiriyor.

Gerekli `ArtifactSupplyChainAuthority`:

- canonical safe ID;
- realpath + lexical containment;
- immutable package digest;
- publisher identity/signature/key rotation;
- complete package tree coverage;
- dependency lock/provenance/SBOM;
- requested capabilities;
- tenant/project scope;
- quarantine → verify → approve → activate;
- transactional staging/swap/rollback;
- sandboxed runtime.

### 7.8 Outgoing MCP trust

MCP config:

- arbitrary stdio command/args/env/cwd;
- arbitrary HTTP URL/headers;
- schema validation ve provenance yetersiz;
- HTTPS/private-network/redirect/timeout/response-cap policy yok;
- read-only sınıfı tool-name prefix'inden türetilebiliyor;
- raw args audit'e gidebiliyor.

Native agent'ın dış approval gate'i güçlüdür ve korunmalıdır. Açık,
untrusted config → executable/network connect ve server-declared tool
semantics zincirindedir.

### 7.9 Durable persistence ve crash consistency

#### RunFlow

`run-flow-store.ts` sequence'i son eventten okuyup whole-file RMW yapar.
Coordinator lock olmadığını açıkça söyler. API, CLI, detached child ve
death-sweep aynı loga yazabilir.

Crash pencereleri:

- multi-event command ilk eventten sonra crash olursa retry partial transition
  bırakabilir;
- start `START_REQUESTED` yazar, sonra spawn, sonra `RUN_STARTED` yazar;
- spawn öncesi crash kalıcı `STARTING` bırakabilir;
- SSE raw flow logunu tenant guard olmadan stream edebilir.

#### Autonomous

Backlog atomic rename kullanır fakat lock/CAS yoktur. API/MCP/CLI/engine/process
ve reactive writers lost update üretebilir.

Restart tüm `running` kayıtlarını owner/lease/receipt olmadan pending'e döndürür;
external side effect duplicate olabilir. Approval store whole-file, lock'sız
RMW yapar.

#### Audit

Audit HMAC default secret source code'da bilinir. Chain head process-local'dır;
append sequence cross-process transaction/fencing olmadan üretilir. Concurrent
writer duplicate sequence veya forked chain üretebilir.

Enterprise audit için:

- KMS/HSM-backed versioned signing key;
- tenant/project stream identity;
- append transaction;
- fencing/sequence authority;
- redaction schema;
- signed receipt;
- verification/revocation;
- WORM/SIEM export;
- bounded retention

gereklidir.

#### Global store

`global-store.ts` açıkça unwired'dır. JSON atomic rename, CAS/lock sağlamaz.
Managed docs read/transform/write akışı da shared worktree'de last-writer-wins
riski taşır.

Mission V2'nin SQLite lease/CAS modeli bu alanlar için mevcut en güçlü
substrate'tir.

### 7.10 Gateway, connector identity ve approval

Gateway router canonical `chatKey` üretir ve IPC request'e koyar. Child runtime
`chatKey`i responder'a taşımaz; her kullanıcı için sabit:

```text
gateway:<projectPath>
```

session ID'si kullanır.

`makeChatResponder` ayrıca tüm session'lar için tek warm persistent Claude child
yaratır. Aynı project'e bağlı farklı kullanıcı/tenant konuşmaları aynı model
context'ine karışabilir.

Bound project execution root'u da taşınmaz:

- runtime child spawn exact project `cwd`si vermez;
- tool dispatcher project root almaz;
- CLI tool child cwd belirtmez.

`/use project-B` konuşması gateway'in açıldığı project-A üzerinde işlem
yapabilir.

Identity:

- strict identity provider/store startup failure'ında fail-open kalabilir;
- configured channel authorization'a eklenirken per-user principal undefined
  olarak chat'e devam edebilir;
- approval command/callback identity resolution'dan önce channel allowlist ile
  işlenir;
- parked action requester/channel/tenant ile approver bağlanmaz;
- action execution'dan önce store'dan silinebilir.

Gerekli `ConnectorIngressAuthority`:

```text
provider-verified event
  → tenantId
  → subjectId
  → connectorId
  → conversationId
  → projectId
  → roles/permissions
  → authEvidence
```

Conversation key:

```text
tenant + project + connector + conversation + subject
```

olmalıdır. Connector kararları runtime-wide ApprovalBroker üzerinden
requester/approver/scope'a bağlanmalıdır.

### 7.11 Docker, Desktop ve every-environment

#### Docker worker boundary

Docker worker backend default'tur. İyi parçalar:

- non-root user;
- memory/swap sınırları;
- tmpfs;
- git metadata read-only;
- `.deck` shadow;
- credential-only mounts.

Eksikler:

- full project root read-write mount;
- default `--network=none` yok;
- read-only rootfs yok;
- cap-drop/no-new-privileges/PID/CPU sınırı yok;
- inspect error/malformed sonucu healthy sayılabilir;
- Windows yolunda POSIX `sleep` kullanılır.

Bu yüzden bugünkü Docker backend enterprise untrusted-code sandbox'ı değildir.

#### Root deployment image

- root `Dockerfile` Node 22 kullanır;
- `package.json` Node `>=24` ister;
- entrypoint `dist/cli/index.js`, gerçek bin `dist/cli/entry.js`;
- Compose server command tanımlamaz;
- healthcheck `curl` ister, image curl kurmaz;
- testler runtime build/run yerine string presence ölçer.

#### Desktop/platform matrix

- Desktop package target yalnız Linux unpacked `dir`;
- macOS/Windows installers, signing/notarization yok;
- updater explicit no-op;
- main build pipeline Desktop'i kapsamaz;
- real Desktop/PTY browser smoke'ları CI'da değildir;
- Windows runtime CI informational/allow-failure;
- WSL ayrı first-class CI leg değildir;
- Kubernetes/Helm/operator/service manifests yoktur;
- systemd/launchd/Windows Service lifecycle yoktur.

Packed npm install Ubuntu/macOS/Windows hattı ve release provenance güçlüdür;
korunmalıdır.

### 7.12 Canonical product path

RunFlow V2'nin core yapısı güçlüdür fakat default-off'tur.

Flag-off public behavior:

- `plan-nl` single-task TODO scaffold üretir;
- `do` golden-flow üzerinden DIRECTIVES swap + sync child yolu kullanır;
- public user canonical RunFlow authority'sine ulaşmaz.

`native_agent` default-on cutover doğru örnektir. RunFlow için de:

- compatibility window;
- persisted flow migration;
- real-binary matrix;
- explicit rollback;
- old path deprecation telemetry;
- owner-approved default flip

ile canonical cutover gerekir.

### 7.13 Learning ve evolution

Nuanced truth:

- routing outcome capture canlıdır;
- routing cells finalizer'da yazılır;
- evolved intent rules yeterli confidence ile auto-applied olabilir;
- promotion/demotion pipeline production finalizer'a bağlıdır.

Ancak:

- native terminal trace default-on/opt-out'tur; privacy consent/retention
  contract'ı eksiktir;
- sprint training trace default-off'tur;
- legacy trace JSONL writer canlıdır;
- segmented append/manifest/retention writer'ın production caller'ı yoktur;
- corpus linter production'a bağlı değildir;
- training pipeline end-to-end caller'ı yoktur;
- prompt evolution live retro'da suggestion üretir fakat uygulanmaz;
- prompt A/B/evolution agent modules'inin önemli kısmı dormant/test-only'dir.

Sonuç:

> Routing learning kısmen closed-loop; training ve prompt/identity evolution
> end-to-end closed-loop değildir.

## 8. P1/P2 findings

### P1

- provider readiness/detection/auth truth farklı provider'larda farklı
  semantics kullanır;
- Ollama/OpenAI-compatible/Bedrock HTTP cancellation/timeout/retry parity
  eksiktir;
- provider authority evidence yalnız Claude subscription host-subprocess
  kombinasyonunda olgundur;
- outgoing MCP broker connection lifecycle/circuit breaker zayıftır;
- Enterprise GET endpoints tenant/role kapsamını yeterince daraltmaz;
- Mission V2 yalnız `task` kind production runner taşır;
- mission delivery transactional outbox değildir;
- SQLite busy timeout/durability policy explicit değildir;
- Nervous owner election atomic lease/epoch kullanmaz;
- Nervous `Promise.allSettled` sonucu ve channel delivery outcome'u yeterince
  settle edilmez;
- monitor boundary attribution false-positive üretebilir;
- coverage TSX/Dashboard/Desktop'i yeterince kapsamaz;
- real-browser accessibility gate yoktur;
- container/Desktop supply-chain signing/SBOM/scan yoktur;
- state-path migration tamamlanmamıştır;
- PID ownership guard tüm platformlarda eşit değildir.

### P2

- stale comments ve “MVP/follow-up/unwired” etiketleri code truth ile drift
  etmiştir;
- invalid plugin ve provider detection bazı yollarda sessiz düşer;
- skill git source floating ref/reproducibility açığı taşır;
- temporary clone path'leri concurrent install'da çakışabilir;
- WhatsApp supported catalog'da görünür fakat implementation intentional
  unavailable scaffold'dur;
- approval relay adapter'ları code-present fakat production-unwired'dır;
- tmux deprecation uyarısı güncel stratejiyle driftlidir;
- feature/catalog labels canonical model registry ile drift edebilir.

## 9. Truth ve plan integrity audit

### 9.1 Feature truth kapsamı

Feature manifest yaklaşık 35 catalog entry taşırken yalnız 5 curated truth
definition içerir. Definitions generator içine manuel gömülüdür.

Wiring:

- AST/call graph yerine line regex kullanır;
- comment/string/import alias false-positive üretebilir;
- entry module taramadan çıkarıldığı için same-file invocation false-negative
  olabilir.

Gerçek örnek:

- `prompt-gate-block` export ve live call aynı `sprint-controller.ts`
  içindedir;
- truth engine entry module'ü dışladığı için `wired:none` diyebilir.

Proof:

- non-empty artifact = ok;
- recent journal yalnız timestamp kontrol eder;
- future timestamp negatif age ile geçebilir;
- smoke command çalıştırılmadan declared olur;
- enabled JS truthiness ile ölçülür.

Truth ratchet CI/publish gate'e bağlı değildir.

### 9.2 Feature activity manifest

Activity categories manuel definitions ve `forceCategory` kullanır.
`importCount: high` gerçek count değildir. “last-10-sprints” metadata'sı sprint
history analizi yapmadan current source grep'ine dayanır.

### 9.3 Orphan scanner

82-entry allowlist:

- real dead code;
- test-only;
- public/dynamic entrypoint;
- intentional shim;
- dormant candidate

sınıflarını aynı listede tutar.

Dashboard/Desktop tümden dışlanır. Dynamic import sınırlaması açıktır.
`src/cli/entry.ts`, `src/mcp/server.ts`, `src/index.ts` gibi legitimate
entrypoint'ler pinned orphan olabilir.

Gerekli hükümler:

- `public-entrypoint`
- `dynamic-entry`
- `plugin-entry`
- `test-only`
- `intentional-shim`
- `dark-code`
- `real-orphan`
- `retire-approved`

### 9.4 Command registry

Registry command-level'dır; option/subcommand effects kaybolur:

- `truth` read-only sınıfında, `--check --write` yazar;
- `plan-nl` read-only sınıfında, `--write` DIRECTIVES değiştirir;
- `runs` read-only sınıfında, `--close-stale --yes` durable mutation yapar;
- `xverify` read-only sınıfında, provider çağrısı ve maliyet üretir.

Current moving tree'deki yeni `provider-authority` command registry'ye henüz
girmemiştir. Bu in-flight work bulgusudur; stable debt sayılmadan diğer oturum
ile reconcile edilmelidir.

### 9.5 MASTER-PLAN regressions

Plan kendisini SSOT ilan eder ve her item'ın ADR traceability taşıdığını,
`## ADR Traceability` altında %100 coverage olduğunu söyler. Dosyada bu heading
yoktur.

En az aşağıdaki completed rows yeniden değerlendirilmelidir:

| Row | Current status | Code-truth verdict |
|---|---|---|
| 11 `AUDIT-WIRE` | ✅ | Production sink var; key custody/multi-writer chain nedeniyle enterprise-complete değil |
| 59 `AUDIT-TENANT` | ✅ | Tenant audit label var; terminal authorization IDOR açık |
| 531 `MEM-TENANT` | ✅ | Endpoint capability var; server req/principal thread etmiyor |
| 532 `PLUGIN-AUTH` | ✅ | Primitive var; production hook composition security options atlıyor |
| 544 `TERM-RUNFLOW` | 🟡 | Doğru: code/wire güçlü, default cutover ve persistence açık |
| 552 `TRACE-V2` | ✅ | Schema güçlü; end-to-end training product completion anlamına gelmez |
| 557 `TRACE-SEGMENT` | ✅ | Writer code-present; production caller yok |

Historical evidence silinmemelidir. Status:

- `regressed`
- `superseded`
- `code-present`
- `wired`
- `enabled`
- `proof-expired`

gibi machine-readable ayrı boyutlardan türetilmelidir.

## 10. Target architecture

### 10.1 RuntimeAuthorityGateway

Tüm ingress yüzeyleri:

```text
CLI
MCP
HTTP
WebSocket
Terminal
Desktop
Connector
Reactive
Nervous
Autonomous
```

tek pipeline'dan geçmelidir:

```text
trusted transport principal
  → canonical tenant/project context
  → canonical operation descriptor
  → recursive effect plan
  → role/capability grant
  → policy + budget
  → approval binding
  → idempotency/lease/receipt
  → adapter dispatch
  → transactional audit/outbox settlement
```

Transport payload'ındaki `actorId`, `tenantId`, risk veya policy değeri
authority kaynağı olamaz.

### 10.2 Durable Execution Kernel

Canonical hierarchy:

```text
Goal
  → Mission
    → Flow
      → Run
        → Task
          → Attempt
            → Operation
```

Her seviyede:

- stable ID;
- tenant/project scope;
- revision;
- idempotency key;
- lease/fencing token;
- causal parent;
- budget/capability/credential leases;
- durable event;
- settlement receipt;
- human-readable projection

bulunmalıdır.

Mission V2'nin transactional modeli common substrate'e dönüştürülmelidir.

### 10.3 Truth Ledger

Append-only, content-addressed ledger:

#### FeatureDefinition

- stable feature ID;
- owner/program;
- surfaces;
- operations;
- flags;
- supported platform/runtime/tenant matrix;
- acceptance contracts.

#### TruthClaim

```text
code_present
  → production_wired
  → configured
  → admitted
  → reachable
  → executed
  → proven
  → supported
```

#### EvidenceReceipt

- source SHA/build identity;
- config digest;
- OS/arch/runtime;
- tenant/project scope;
- surface;
- provider/model/account/backend;
- producer/invocation;
- start/end;
- outcome/exit;
- artifact hash;
- signature/key version;
- TTL;
- supersedes/revokes.

Proof sınıfları:

1. static
2. unit
3. integration
4. compiled-binary
5. real-binary
6. live-canary
7. production-observation

Bir feature status'u zincirin en zayıf halkasından daha yüksek olamaz.

## 11. Recommended work programs

### Program 0 — Truth & Plan Reconciliation

Outcome:

- machine-readable Feature/Operation/Platform ledger;
- MASTER-PLAN human projection;
- completed-row regression/supersession;
- exact dependency DAG;
- evidence receipt schema;
- CI/publish truth gate.

Exit:

- hiçbir `✅` code-only veya stale artifact ile üretilemez;
- every public operation registry'de exact effect semantics taşır;
- orphan/activity/coverage claims exact scope belirtir.

### Program 1 — Unified Runtime Authority

Outcome:

- VerifiedPrincipal;
- TenantProjectContext;
- OperationDescriptor catalog;
- canonical capability namespace;
- runtime-wide ApprovalBroker;
- redacted audit schema;
- API/MCP/CLI/terminal/Desktop/connector parity.

Immediate containment:

- raw config redaction/admin projection;
- terminal tenant isolation;
- memory principal threading;
- process/reactive/autonomous role and tenant gates;
- connector per-user approval;
- OIDC contract/nonce closure.

Exit:

- hiçbir ingress caller-authored tenant/actor/risk'i authority kabul etmez;
- negative cross-tenant suite tüm surfaces'ta geçer;
- default-deny capability policy canlıdır.

### Program 2 — Durable Execution Kernel

Outcome:

- common Goal→Operation identity;
- WorkerExecutionRegistry;
- planner authority;
- process-group/Windows Job/container ownership;
- transactional event journal;
- lease/fencing/idempotent settlement;
- durable outbox;
- crash/restart/replay correctness;
- provider authority ALLOW composition.

Existing Provider Authority 630–656 bu programın provider/custody bacağıdır;
silinmez veya paralel ikinci sistem kurulmaz.

Exit:

- spawn öncesi ve sonrası her crash point deterministik recover/settle olur;
- duplicate external side effect proof ile engellenir;
- kill/list/status bütün backend'lerde aynı registry'yi tüketir;
- budget/termination/credential receipts exact attempt'a bağlıdır.

### Program 3 — Ecosystem Trust Plane

Outcome:

- plugin/skill/agent/MCP supply-chain authority;
- canonical safe IDs;
- signed immutable package;
- provenance/SBOM;
- quarantine/approval/activation;
- sandboxed execution;
- transactional install/update/rollback;
- marketplace trust lifecycle.

Exit:

- untrusted package host process authority alamaz;
- traversal/symlink/platform-collision suite geçer;
- signature package tree'nin tamamını kapsar;
- capability request ve revocation audit edilebilir.

### Program 4 — Canonical Product Surface

Outcome:

- terminal primary control/use surface;
- RunFlow default canonical;
- CLI/MCP thin adapters;
- Dashboard read-only projection;
- Desktop full-control attended client;
- connectors mediated remote heads;
- role-based progressive disclosure;
- shared application services.

Exit:

- same operation tüm surfaces'ta aynı authority ve result contract'ını kullanır;
- `plan-nl` scaffold/DIRECTIVES swap runtime path değildir;
- Desktop ve terminal approval semantics birebirdir;
- user-facing text i18n-clean'dir;
- real-browser a11y proof vardır.

### Program 5 — Every-Environment Distribution

Outcome:

- Linux/macOS/Windows/WSL/container/Kubernetes contract;
- managed local runtime;
- platform service adapters;
- signed Desktop installers;
- updater/rollback;
- container hardening;
- SBOM/signing/scanning;
- real cross-platform CI.

Exit:

- unsupported platform fail-honest olur;
- no allow-failure support claim;
- every supported matrix cell real-binary proof taşır;
- install/update/rollback/recovery rehearsed olur.

### Program 6 — Learning & Evolution Plane

Outcome:

- consent/retention/tenant-aware trace;
- segmented append/manifest/compaction live wiring;
- corpus lineage/quarantine;
- eval-backed routing/prompt/skill evolution;
- promotion/demotion rollback;
- training export;
- learning explanation and operator controls.

Exit:

- her learned change evidence, confidence, scope, version ve rollback taşır;
- train/eval leakage engellenir;
- silent self-modification yoktur;
- learning benefit measurable ve reversible'dır.

### Program 7 — Million-Scale Assurance

Outcome:

- load/soak/chaos/restart/replay;
- SLO/error budgets;
- tenant isolation assurance;
- regional/data-residency adapters;
- signed/WORM audit export;
- enterprise policy freeze;
- staged rollout and rollback;
- production observability.

Exit:

- GA/support claim'i platform+surface+tenant proof matrix'inden türetilir;
- proof expiry release gate'i kapatır;
- real production observation hermetic testten ayrı sınıflandırılır.

## 12. Dependency order

```text
Program 0 Truth
  └─ Program 1 Runtime Authority
       ├─ Program 2 Durable Execution
       │    ├─ Program 4 Canonical Product
       │    └─ Program 6 Learning
       └─ Program 3 Ecosystem Trust
            └─ Program 4 Canonical Product

Program 5 Every-Environment
  begins with Program 1 contracts,
  validates Programs 2–4 continuously,
  and may not be deferred to a post-design phase.

Programs 0–6
  └─ Program 7 Million-Scale Assurance
```

Bu sıra “önce Linux, sonra diğerleri” anlamına gelmez. Platform matrix ve
adapter contract Program 1'de tanımlanır; Program 5 her programın acceptance
matrisini sürekli doğrular.

## 13. Immediate stop-the-line order

1. Moving worktree ve active provider-authority work ile reconcile.
2. Truth Ledger schema + plan regression projection.
3. Raw config secret exposure.
4. VerifiedPrincipal + terminal/memory/enterprise tenant isolation.
5. Canonical operation/capability catalog.
6. Process/reactive/autonomous/connector approval containment.
7. Planner no-tool authority.
8. Plugin/skill/agent path and auto-enable containment.
9. Worker execution registry + spawn settlement.
10. RunFlow/autonomous transactional persistence.
11. Provider Authority ALLOW composition.
12. OIDC and attended approval cross-surface contract.
13. Docker/deployment truth.
14. RunFlow product cutover.

Bu sıralama yeni feature üretimini yasaklamaz; fakat security/correctness
boundary'lerini atlayan yeni public ingress veya execution path'i kabul etmez.

## 14. MASTER-PLAN reconciliation instructions

`docs/MASTER-PLAN.md` başka oturum tarafından değiştirildiği için bu audit
sırasında düzenlenmedi.

Reconciliation başladığında:

1. current HEAD ve worktree yeniden fingerprint edilir;
2. provider authority 630–656 korunur;
3. active/in-flight satırlar üzerine yazılmaz;
4. rows 11, 59, 531, 532, 552, 557 code-truth ile yeniden değerlendirilir;
5. row 544 partial kalır ve canonical cutover acceptance eklenir;
6. yeni iş semptom başına yüzlerce P0 olarak değil yukarıdaki programlara bağlı
   capability/outcome satırları olarak eklenir;
7. historical notes ayrı evidence journal'a taşınır;
8. table hücreleri bounded ve machine-parseable tutulur;
9. status, evidence receipts'ten generated projection olur;
10. ADR traceability iddiası ya gerçek bölüm ve gate ile kurulur ya kaldırılır.

## 15. Final conclusion

Statik mimari analiz iş planına geçmek için yeterli olgunluğa ulaşmıştır.
Analizi ayrı ve sonsuz bir ön-faz olarak sürdürmek doğru değildir.

Doğru devam modeli:

```text
analyze once broadly
  → establish authorities/contracts
  → implement vertical enterprise-grade slices
  → prove on every surface/environment
  → feed evidence back into Truth Ledger
  → continuously re-plan
```

Deckent'in milyar kullanıcı/ortam hedefi, feature sayısını artırarak değil şu
dört omurgayı tekleştirerek gerçekçi hâle gelir:

1. authority,
2. durable execution,
3. product surface contract,
4. evidence-backed learning.
