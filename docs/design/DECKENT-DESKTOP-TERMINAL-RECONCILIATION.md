# Deckent Desktop & Terminal Repository Reconciliation

> **Status:** Repository-evidence reconciliation and execution hand-off
> **Evidence altitude:** `/home/alperen/deckent-dev`, 2026-08-12
> **Product authority update:** Alperen live decision, 2026-08-25 — execution mediation is one
> config-resolved layer of the single Deckent kernel; direct, staged, isolated, brokered and remote
> postures are not separate products. Current worker-mount evidence rechecked on the same date.
> **North-star input:** [Deckent Desktop & Terminal Product Design Strategy](./DECKENT-DESKTOP-TERMINAL-NORTH-STAR.md)
> **Work SSOT:** [`docs/MASTER-PLAN.md`](../MASTER-PLAN.md)
> **Method:** Evidence → architecture → product constraints → design → implementation. Varsayım, sentetik kanıt ve provider verdict'i kullanılmadı.

## 1. Kapanış hükmü

Taslak plan ürün yönü olarak korunmalıdır; fakat bugünkü implementasyonu anlatan bir belge gibi okunmamalıdır. Repository şu anda hedefin önemli foundation parçalarına sahiptir: Electron shell, `deckent serve` daemon adoption/spawn seam'i, sandboxed preload, HTTP/SSE/WS yüzeyleri, persisted run-flow/read-model katmanları, Terminal REPL, approval broker, provider adapterları, MCP server ve opt-in external MCP client.

Ana kapanmamış mimari gerçek şudur:

> Desktop kısmen daemon client'tır; Terminal ise hâlâ büyük ölçüde aynı process içinde runtime composition yapar. Bu nedenle “same runtime, many surfaces” bugün kanıtlanmış bir ürün contractı değildir.

Doğru yön, repo/paket big-bang refactor'ı veya Electron→Tauri migration değildir. Önce mevcut modüller üzerinde canonical application-service, versioned protocol ve shared client boundary kurulmalı; Desktop ve Terminal aynı persisted logical run/conversation authority'sine sırayla geçirilmelidir. Fiziksel package move ancak dependency ve import sınırları executable biçimde kapandıktan sonra yapılmalıdır.

## 2. Authority ve kanıt sınırı

Bu belgenin görevi:

- owner taslağındaki hiçbir hedefi kaybetmeden repo durumuyla ilişkilendirmek,
- kabul edilen yön ile bugünkü implementasyonu ayırmak,
- mevcut `MASTER-PLAN` sahipliğini göstermek,
- gerçekten sahipsiz ürün dilimlerini atomik successor işlere çevirmek,
- implementation sırasında “güzel UI var, fakat wire yok” kapanışını engellemektir.

Bu belge:

- ikinci bir work ledger değildir,
- genel ürün vizyonunun yerine geçmez,
- plan metninden provider/model seçmez,
- Fable veya başka provider doğrulaması yapılmış gibi davranmaz,
- henüz ölçülmemiş performans değerleri üretmez.

Fable karşılaştırması bu kapanış sırasında çağrılmadı. Fresh second-provider evidence yoktur; ilgili bağımsız review gelecekte yapılırsa ayrı receipt/evidence ile bağlanmalıdır.

## 3. Mevcut architecture map

| Component | Bugünkü sorumluluk ve process | State ownership / public seam | Coupling ve risk | Evidence |
|---|---|---|---|---|
| Electron Desktop main | Window, connection profile, daemon adopt/spawn, IPC, security, tray/update shell | `.deckent/serve-daemon.json` handshake; typed preload IPC; daemon session renderer'a push edilir | Runtime değildir; fakat daemon lifecycle ve UI process ilişkisi profile policy'ye bağlıdır | `src/desktop/package.json`, `src/desktop/src/main/{index,daemon-lifecycle,ipc-handlers,window-manager}.ts` |
| Desktop renderer | Classic shell + NOVA shell, chat/radio, run-flow views, worker/log/terminal views | REST, SSE, terminal WS; renderer-local preferences ve bazı chat/UI state'leri | İki shell aynı product truth'u iki farklı IA olarak gösterir; radio transcript profile-keyed `localStorage`'dadır | `src/desktop/src/renderer/{app.ts,shell/,nova/}`, `shell/radio-fold.ts` |
| `deckent serve` | HTTP API, SSE, terminal gateway, read models, selected mutation surfaces | Bearer token; query-token fallbacks; run-flow/event/log endpoints; `/api/rpc` | Ürüne en yakın daemon seam'idir; henüz tek versioned client protocol değildir | `src/api/server.ts`, `src/api/serve-daemon-meta.ts`, `src/api/run-flow-event-stream.ts` |
| Terminal/TUI | Chat, native tools, MCP bridge, run-flow preview/inbox, approvals, resume picker, live result feed | In-process core/CLI composition; local RPC debug transport; memory-backed chat session | Same daemon client değildir; business composition UI processine gömülüdür | `src/cli/repl/{run,app,rpc-client,run-flow-controller,run-completion-watch}.tsx` |
| CLI | Lifecycle, configuration, provider, run, recover, status ve developer commands | Direct command/service composition | Bazı semantiklerin client protocol yerine command entrypoint'lerinde yaşama riski vardır | `src/cli/entry.ts`, `src/cli/commands/` |
| Runtime/core/orchestra | Orchestration, workers, routing, policy, approvals, memory, checkpoints, run/read-model truth | Files/SQLite/event/read-model contracts | Güçlü foundation; fakat tüm surface'ler aynı consumer boundary'yi kullanmıyor | `src/core/`, `src/orchestra/`, `src/agents/` |
| Worker execution backends | `auto`, Docker, subprocess, tmux ve sandbox adapter'ları; task scope, locks, landing/evidence parçaları | Backend factory + effective config; current Docker worker process'i container içindedir | Normal Docker implementation worker'ı project root'u `/workspace` altında read-write bind eder; process isolation host-workspace isolation anlamına gelmez ve write host tree'ye anında geçer. Exact V2 cross-verify bunun tersine ephemeral workspace kullanır | `src/orchestra/spawn-backend.ts:602-782`; `src/orchestra/spawn-backend-docker.ts:5832-5835,6852-6858,8171-8182` |
| Provider layer | Provider-neutral interfaces, registry, auth/reachability/usage evidence, adapters | Config/registry/evidence stores | `Provider → Connection → Model → Profile` kullanıcı aggregate'i tam ve ortak surface contractı değildir | `src/providers/`, `src/core/{model-registry,provider-*,credentials}.ts` |
| MCP server | Deckent tools/resources over stdio | Canonical MCP tool catalog ve handlers | First-class server foundation vardır | `src/mcp/server.ts`, `src/mcp/tools/`, `src/core/mcp-tool-catalog.ts` |
| MCP client | External MCP broker/registry/config ve Terminal bridge | Opt-in `mcp_client_enabled`, project `.mcp.json` | Foundation production-wired fakat default-off ve Desktop Hub/product lifecycle yok | `src/mcp-client/`, `src/cli/repl/mcp-bridge.ts`, `src/cli/commands/mcp.ts` |
| Plugin/capability | Plugin manifests, sandbox scan, capability runtime | Core loaders/contracts | UI-panel sandbox, signed distribution ve product-level capability aggregate tamamlanmış değil | `src/core/{plugin,plugin-loader,capability-runtime}.ts` |
| Dashboard | Observe-oriented web surface | API/event projections | Canonical management surface yapılmamalı; intentional negative-space korunmalı | `src/dashboard/`, `src/api/server.ts` |

## 4. Kritik soruların kanıtlı cevapları

| Soru | Cevap | Sınıf | Kanıt / gerekçe |
|---|---|---|---|
| Deckent daemon mevcut mu? | Evet; `deckent serve` project-scoped handshake ile adopt/spawn edilebilen daemon seam'idir. Hedefteki tüm application protocolünü henüz temsil etmez. | `PARTIAL` | `src/api/serve-daemon-meta.ts`, Desktop daemon lifecycle |
| Runtime state nerede? | Core/orchestra stores, `.brain`/`.deckent` artifacts, SQLite/read-model/event kaynaklarına dağılmıştır; renderer tek authority değildir. | `PARTIAL` | core stores + canonical run status/read model |
| Desktop kapanınca run devam eder mi? | Adopted daemon korunur. Desktop'ın spawn ettiği daemon yalnız profile `orphanShutdownOnQuit` ise quit sırasında SIGTERM alır. Bu yüzden davranış typed policy'ye bağlıdır; evrensel “evet” değildir. | `PARTIAL` | `src/desktop/src/main/index.ts`, connection profile schema |
| Terminal kapanınca run devam eder mi? | Bazı detached execution yolları sürebilir; Terminal composition ve session semantics bütünüyle daemon-backed değildir. Cross-process handoff kanıtı yoktur. | `CONFLICTING` | `src/cli/repl/run.tsx`; in-process RPC debug; detached run handler |
| Desktop ve Terminal aynı execution path'i mi kullanıyor? | Hayır, capability bazında parçalı ortaklık vardır; tam ortak application-service/client path yoktur. | `CONFLICTING` | REST/SSE/WS Desktop ile in-process Terminal composition farkı |
| Conversation ↔ run identity ortak mı? | Terminal chat memory persistence ve run-flow identity vardır; Desktop radio transcript `localStorage` kullanır. Tek durable aggregate yoktur. | `MISSING` | Terminal memory adapter; `Telsiz.tsx`/`radio-fold.ts` |
| `session.resume` cross-process çalışıyor mu? | TERM-RPC HTTP write setinde açıkça unsupported'dur. | `MISSING` | `src/api/rpc-write-handlers.ts` |
| Provider abstraction var mı? | Evet. Provider adapter/registry/evidence katmanları güçlüdür. | `ALREADY_SUPPORTED` | `src/providers/`, model/provider registry modules |
| Subscription/API/local connection aggregate var mı? | Parçalar vardır; kullanıcıya dönük tek `Provider → Connection → Model → Profile` contractı yoktur. | `PARTIAL` | provider configs, credentials, model registry; birleşik aggregate yok |
| MCP client ve server var mı? | İkisi de vardır. Client opt-in ve ağırlıkla Terminal/CLI yüzeyindedir; Desktop Hub ve governed expose UI eksiktir. | `PARTIAL` | `src/mcp/`, `src/mcp-client/`, Terminal bridge |
| Config-resolved Execution Posture var mı? | Backend, scope, capability, risk, budget ve landing parçaları vardır; fakat realm + workspace projection + effects + filesystem/network/secrets + landing eksenlerini tek durable contractta resolve eden ve tüm surface'lere açıklayan product aggregate henüz yoktur. Current Docker implementation path project root'u RW bind eder. | `MISSING / PARTIAL FOUNDATION` | `src/core/work-model.ts`; `src/core/capability-broker.ts`; `src/orchestra/spawn-backend.ts`; `src/orchestra/spawn-backend-docker.ts:5832-5835,6852-6889` |
| Secret Broker var mı? | Provider credential files ve authority keyring custody parçaları vardır; cross-platform native secure storage broker kanıtı yoktur. Windows bazı authority custody yollarında typed HOLD'dur. | `MISSING` | `src/core/credentials.ts`, `approval-authority-keyring.ts` |
| Electron güvenlik sınırı? | `contextIsolation:true`, `sandbox:true`, `nodeIntegration:false`; preload dar typed API sunar. | `ALREADY_SUPPORTED` foundation | `src/desktop/src/main/window-manager.ts`, preload |
| Token/message URL'ye düşüyor mu? | Evet. EventSource kısıtı nedeniyle SSE auth query token; chat message query string taşır. | `CONFLICTING` | `src/api/server.ts`, Desktop API transport tests |
| Plugin sandbox var mı? | Static/sandbox scan ve manifest permissions vardır; unrestricted native/UI extension runtime izolasyonu tam kanıtlı değildir. | `PARTIAL` | `src/core/plugin-loader.ts`, `plugin.ts` |
| Auto-update tamam mı? | Modül seam'i vardır; signed multi-platform production/update lifecycle kanıtı bu analizde yoktur. | `UNKNOWN/HOLD` | `src/desktop/src/main/auto-update.ts`; packaging/release proof gerekir |
| Electron/Tauri performans farkı ölçüldü mü? | Bu kapanışta karşılaştırmalı benchmark yoktur. | `UNKNOWN/HOLD` | Ölçüm uydurulmadı |

## 5. Target architecture ve state ownership

```text
Desktop ─┐
Terminal ├── Deckent Client Library ── Versioned Deckent Protocol ── deckentd
CLI ─────┤                                                        │
IDE/SDK ─┘                                                        ▼
                                                Canonical Application Services
                                                ├── Conversations / Context
                                                ├── Logical Runs / Attempts
                                                ├── Plans / Checkpoints
                                                ├── Approvals / Policies
                                                ├── Execution Postures / Effects / Landing
                                                ├── Providers / Connections
                                                ├── MCP / Capabilities
                                                ├── Evidence / Verification
                                                └── Cost / Tokens / Logs
```

| State | Tek canonical owner | Client davranışı | Yasak |
|---|---|---|---|
| Conversation | Persisted conversation service / store | Desktop ve Terminal aynı conversation ID'yi hydrate eder | Renderer `localStorage` product authority olamaz |
| Logical run | Runtime application service + persisted read model | Her surface aynı logical run ID ve revision'ı tüketir | UI kendi lifecycle state'ini infer edemez |
| Attempt/worker | Runtime/orchestrator | Inspector timeline ve terminal tree projection okur | Surface-specific denominators yok |
| Approval/policy | Runtime-wide ApprovalBroker/policy authority | Live prompt, once/session/always decision ve audit | UI-only allow cache authority olamaz |
| Execution posture | Runtime admission + policy authority; exact contract Attempt'a bind edilir | Basic consequence-first özet, Advanced exact realm/projection/effect/capability/secrets/landing + why | Profil etiketi authority olamaz; unavailable isolation direct host effect'e sessiz downgrade edemez |
| Provider connection | Connection service; secret yalnız broker reference | UI `connectionId`, model/profile ve health gösterir | Secret payload/log/config projection yok |
| MCP connection | MCP client host/broker | Lifecycle/health/tool catalog/policy projection | Surface'in bağımsız MCP config yorumu yok |
| Layout/preferences | Client preference store, versioned/migratable | Surface-local presentation state | Execution truth layout store'a yazılmaz |
| Logs/evidence/cost | Runtime evidence/telemetry stores | Cursor/revision ile subscribe ve backfill | Chat transcript veya canvas state evidence olamaz |

## 6. Paket ayrımı: mantıksal önce, fiziksel sonra

Hedef package topoğrafyası:

```text
packages/
├── application/   # canonical use-cases; UI ve transport bağımsız
├── protocol/      # versioned commands, queries, events, errors, capabilities
├── client/        # reconnect, auth, cursors, subscriptions, compatibility
├── runtime/       # orchestra/workers/policy/store composition
└── platform/      # filesystem/process/shell/paths/secrets/notifications adapters

apps/
├── terminal/      # TUI client
├── desktop/       # Electron client
└── dashboard/     # intentional observe-only client
```

Bu fiziksel dizinler bugünden tek seferde oluşturulmayacaktır. Uygulama sırası:

1. Mevcut `src/` içinde dependency rules ve public barrel boundaries tanımlanır.
2. Canonical service çağrıları mevcut producer/consumer zincirlerinde wire edilir.
3. Protocol schemas ve compatibility tests surface bağımsız hale gelir.
4. Desktop ve Terminal ayrı ayrı client boundary'ye geçirilir.
5. Import graph fiziksel taşımanın davranış değiştirmediğini kanıtladığında package move yapılır.
6. Eski import/entrypoint'ler versioned compatibility window ve migration guide ile kaldırılır.

Big-bang rewrite, iki runtime, surface'e özel business logic ve “önce Linux” platform tasarımı yasaktır.

## 7. Golden Workflow implementation contractı

| Aşama | Canonical service / state | Desktop | Terminal | Kapanış kanıtı |
|---|---|---|---|---|
| Connect Provider | Provider connection aggregate + secret reference + reachability | Connection screen | Command palette/TUI connection flow | Same connection ID/health on both surfaces |
| Start Conversation | Persisted conversation | Chat entrance | Chat/TUI entrance | Cross-surface transcript handoff |
| Attach Context | Versioned context references and scope | File/repo/context pane | `@` references / context pane | Same digest and access policy |
| Convert to Run | Conversation→logical run link | Plan preview | Plan preview card | Same plan digest/logical run ID |
| Start | Admission + policy + budget | Explicit action | Explicit action | One idempotency key; one receipt |
| Observe | Run read model/events/log cursors | Run Inspector | Run tree/live logs | Disconnect/reconnect replay parity |
| Approval | ApprovalBroker | Gate card | Keyboard-first approval card | Once/session/always + audit parity |
| Verify | Verifier evidence authority | Evidence panel | Verifier state/detail | Provider-separated typed status |
| Result | Result/evidence aggregate | Conversation result + inspector | Conversation result + inspect | Same evidence IDs and final outcome |
| Resume | Checkpoint/run continuation | Resume control | Resume command/control | Cross-process resume proof |

UI screenshot veya unit test tek başına bu workflow'u DONE yapamaz. Proof chain: canonical producer → application consumer → protocol ingress → Desktop ve Terminal clients → persisted outcome/readback.

## 8. Terminal ürün planı

Terminal canonical yönetim ve kullanım yüzeyi olarak korunur; Desktop'ın küçük kopyası değildir.

Gerekli kapanış:

- `src/cli/repl/run.tsx` içindeki in-process composition, davranış kaybı olmadan application client seam'ine ayrılır.
- REPL chat, run-flow preview/inbox, approvals, worker feed, cost/token/evidence ve resume aynı protocol client'ı tüketir.
- Raw PTY “expert tool” olarak kalır; orchestration UI'ın kendisi değildir.
- `session.resume`, pause/cancel ve detached run semantics typed ve aynı logical run üzerine bağlanır.
- Network/daemon restart sırasında cursor-based replay, re-auth ve honest degraded/HOLD state gösterilir.
- Keyboard navigation, focus ownership, screen-reader labels ve en/tr catalog injection first-class kalır.
- CLI komutları public automation/API yüzeyidir; kullanıcı Deckent işlerini bilmek zorunda olduğu komut ezberiyle yürütmez.

MASTER sahipliği: `TERMINAL-001`, `TERMINAL-TOOLS-001`, `TERMINAL-DEV-001`, `TERMINAL-LIVE-001`, `TERMINAL-REPL-001`, `TERMINAL-AUTH-001`, `NATIVE-DEV-001`, `TERMINAL-XPLAT-001`, `TERMINAL-CONTEXT-001`, `TERMINAL-COLLAB-001`, `SURFACE-CONTRACT-001`, `SURFACE-PARITY-001`.

## 9. Desktop ürün planı

Electron korunur; Electron Main runtime yapılmaz.

Gerekli kapanış:

- Classic ve NOVA iki ürün shell'i olarak sürdürülmez. Tek IA/route/component authority kurulur; NOVA yalnız açıkça seçilen operator visualization preset'i olabilir.
- `localStorage` radio transcript durable conversation authority'sine migrate edilir; mevcut gerçek transcript kaybolmaz, uydurma backfill üretilmez.
- Renderer yalnız versioned client API kullanır; chat message ve credential query string'den çıkarılır.
- Run Inspector graph/timeline/worker/tool/MCP/approval/policy/verifier/evidence/cost/log/checkpoint state'lerini canonical read modelden gösterir.
- Provider Connections ve MCP Hub dekoratif settings sayfaları değil, health/policy/audit/lifecycle sahibi gerçek product flows olur.
- Terminal pane raw shell/CLI spawning ile ürün orchestration'ını taklit etmez.
- Preferences, layout ve theme versioned, migratable ve execution state'ten ayrıdır.
- Update/install/signing/rollback ve native platform adapters signed release gates ile kanıtlanır.

MASTER sahipliği: `DESKTOP-001`, `DESKTOP-RUNTIME-001`, `DESKTOP-SECURITY-001`, `DESKTOP-ENTERPRISE-001`, `DESKTOP-REBORN-001`, `DESKTOP-CUSTOMIZE-001`, `DESIGN-PRECISION-INSTRUMENT-001`, `APP-SERVICE-001`, `SURFACE-CONTRACT-001`, `SURFACE-PARITY-001` ve aşağıdaki atomik successors.

## 10. Provider connection contractı

```text
Provider
  └── Connection (owner/tenant, auth kind, endpoint, health, policy, cost center)
        └── Model (registry identity + capabilities + availability)
              └── Profile (role, effort, limits, routing/admission policy)
```

Zorunlu invariants:

- `provider` model identity değildir; `model` credential/connection identity değildir.
- Aynı provider altında kişisel subscription, enterprise API ve local endpoint ayrı connection'lardır.
- Model selection yalnız connection'ın entitlement/reachability/policy kanıtı içinde yapılır.
- UI ve logs gerçek secret değil opaque `credentialRef`/`connectionId` gösterir.
- Cost, limits, audit ve tenant attribution connection üzerinden taşınır.
- Unsupported auth/platform sessiz fallback değil typed HOLD üretir.
- Legacy config model/provider alanları versioned migrator ile kayıpsız okunur; doğrulanamayan alan uydurularak doldurulmaz.

Atomik iş: `PROVIDER-CONNECTION-001`.

## 11. MCP, capability ve extension convergence

Bugünkü MCP server ve opt-in client korunur. Ürün modeli:

- MCP Hub, configured/connected/degraded/restricted/disabled state'lerini ve discovered tool catalogunu gösterir.
- STDIO ve Streamable HTTP connection'ları auth, tenant, permission ve lifecycle policy taşır.
- Deckent-as-MCP-server expose listesi yalnız canonical catalog/capability declaration'dan üretilir.
- Capability; MCP servers, tools, skills, agents, workflows, prompts, UI contribution ve permission declaration'ı versioned manifestte birleştirebilir.
- UI extensions doğrudan Electron/Node authority alamaz; declared contribution points + sandbox + CSP + permission broker kullanır.
- Marketplace/install/update/remove süreçleri signature/provenance/rollback/audit olmadan enable edilmez.

MASTER sahipliği: `CAPABILITY-001`, `MCP-TRUST-001`, plugin/package/sandbox satırları ve atomik `MCP-HUB-001`.

## 12. Execution mediation, security ve secrets kapanışı

Hedef `Execution Posture` contractı her Attempt için aşağıdaki exact axis'leri tek digest-bound authority olarak taşır:

| Axis | Örnekler | Fail-closed kural |
|---|---|---|
| Realm | host, container, microVM, remote | Requested/required realm kanıtlanamıyorsa `HOLD` veya yalnız policy-authorized eşdeğer/daha dar adapter |
| Workspace projection | shared-RW, read-only, snapshot/COW, artifact-only, none | Mount/projection gerçeği worker self-report'undan değil host/platform evidence'ından gelir |
| Effects | immediate, staged, approval-gated | Cancel/timeout sonrası partial effects saklanmaz; discard/land/reconcile sonucu typed kalır |
| Filesystem/network | compiled read/write selectors, destination/protocol allowlist, broker-only | Delegasyon authority'yi daraltır; unknown allowed değildir |
| Secrets | none, scoped reference, broker injection | Raw secret product projection, prompt, log veya worker-owned receipt'e dönüşmez |
| Landing | direct, verified apply, approval-gated apply, external reconcile | Worker proposal'ı host/canonical landing authority'si değildir |

Resolution installation topology + tenant/organization/workspace/project/environment policy + task requirements/derived risk + platform capability/live availability evidence kesişimidir. Preset adları UX kolaylığıdır; exact resolved axis'ler, policy sources, deny precedence, expiry, fallback disposition ve evidence refs durable kayıttır.

Canonical posture örnekleri:

- **Direct:** canonical workspace shared-RW ve immediate effects; düşük friction, fakat cancel sonrası partial host effect ve reconciliation gerçeği açık.
- **Staged:** snapshot/COW içinde worker proposal; verify/land veya discard ayrı authority kararı.
- **Isolated:** container veya microVM realm + scoped workspace/network/secrets; realm containment capability authority'sinin yerine geçmez.
- **Brokered:** worker host veya external-system credential authority'si almaz; exact operation capability broker tarafından yürütülür.
- **Remote:** tenant/environment-bound remote executor; aynı Run/Attempt identity ve evidence lineage korunur.

Firecracker yalnız `microVM` realm adapter adayıdır. Linux desteği global product contractı belirlemez; macOS, Windows native ve WSL için platform adapters aynı posture semantics'ini sağlamalı veya explicit unsupported/HOLD üretmelidir. Hiçbir platform veya availability yolu isolated posture'u direct host mutation'a sessizce çeviremez.

Hedef Secret Broker:

| Platform | Adapter | Failure behavior |
|---|---|---|
| macOS | Keychain-backed custody | Adapter/entitlement yoksa typed HOLD |
| Windows native | DPAPI/CNG + verified DACL custody | Doğrulanmış adapter yoksa typed HOLD |
| Linux | Secret Service/keyring; headless enterprise için declared external KMS/HSM adapter | Session/bus yoksa plaintext fallback yok |
| WSL | Windows/native boundary ile Linux session gerçeği açıkça ayrılır | Platform yanlış tanınırsa fail closed |

Ek kapanışlar:

- Query-token ve query-message transport kaldırılır; header/cookie değil, protocol threat modeline uygun kısa ömürlü session capability seçilir.
- Logs, traces, crashes, diagnostics ve training trace secret redaction gatesinden geçer.
- Approval “once/session/always” tenant, principal, resource ve expiry kapsamı taşır.
- High-risk MCP/tool mutation policy-denied olduğunda client override edemez.
- Desktop preload güvenlik foundation'ı korunur ve extension UI bu boundary'yi delemez.

## 13. Design disposition

Kabul edilen default yön `Precision Instrument`tır:

- calm, formal, precise, high-density when needed;
- hierarchy execution semantics'ten türetilir;
- color/motion yalnız meaning taşır;
- generic AI gradient, excessive glow, sci-fi HUD ve template-dashboard karakteri default değildir;
- NOVA foundation tamamen silinmez; açık operator visualization preset'i olarak değerlendirilebilir;
- Golden Workflow → repeated patterns → components → tokens sırası izlenir;
- Desktop ve Terminal aynı semantic states'i paylaşır, aynı piksel düzenini değil.

`ui-ux-pro-max` bu tasarım authority'si değildir; önceki spatial/glass/glow çıktısı negative reference olarak kalır.

## 14. Decision Ledger disposition

| Decision | Reconciliation | Hüküm | MASTER sahipliği |
|---|---|---|---|
| 01 Desktop ayrı runtime olmayacak | Repo yönüyle uyumlu; `serve` foundation var, closure eksik | `ACCEPTED / PARTIAL` | APP-SERVICE, DESKTOP-RUNTIME |
| 02 Terminal ve Desktop aynı run state | Bugün doğru değil; protocol/client cutover gerekir | `ACCEPTED / GAP` | SURFACE-CONTRACT, SURFACE-PARITY, TERMINAL |
| 03 Chat giriş, ürünün tamamı değil | Ürün kimliğiyle uyumlu | `ACCEPTED` | TERMINAL, DESKTOP-REBORN |
| 04 Execution inspect edilebilir | Read models/logs foundation var; unified inspector yok | `ACCEPTED / PARTIAL` | TERMINAL-LIVE, RUN-INSPECTOR-001 |
| 05 Progressive disclosure | User modes/presets olarak uygulanmalı, fork değil | `ACCEPTED` | DESIGN-PRECISION-INSTRUMENT |
| 06 User-owned provider/API/local | Adapterlar var; product connection lifecycle eksik | `ACCEPTED / PARTIAL` | PROVIDER-CONNECTION-001 |
| 07 Provider→Connection→Model | `Profile` eklenerek kesinleştirildi | `AMENDED + ACCEPTED` | PROVIDER-CONNECTION-001 |
| 08 MCP client + server first-class | İki foundation var; Hub/governance eksik | `ACCEPTED / PARTIAL` | MCP-TRUST, MCP-HUB-001 |
| 09 Capability üst ürün kavramı | Mevcut capability/plugin üzerine additive convergence | `ACCEPTED / PARTIAL` | CAPABILITY-001 |
| 10 Workspace customization | Appearance'dan ayrı versioned layout authority gerekir | `ACCEPTED / GAP` | DESKTOP-WORKSPACE-LAYOUT-001 |
| 11 Extension UI panels | Sandbox/permission/compatibility sonrasında | `DEFERRED, NOT REJECTED` | CAPABILITY + plugin sandbox |
| 12 Native Secret Broker | Bugünkü 0600 files yeterli değildir | `ACCEPTED / GAP` | SECRET/authority custody + PROVIDER-CONNECTION |
| 13 Explicit permission/policy | Approval/policy foundation var; capability-wide UX closure gerekir | `ACCEPTED / PARTIAL` | APPROVAL, MCP-TRUST, CAPABILITY |
| 14 Electron korunacak | Migration kanıtı yok; mevcut investment ve boundary uyumlu | `ACCEPTED` | DESKTOP-RUNTIME |
| 15 Tauri evidence olmadan yok | Benchmark sonrası opsiyon | `ACCEPTED` | DESKTOP-RUNTIME; M11 HOLD |
| 16 Design Constitution | Bu north-star + Precision Instrument successor başlangıç authority'sidir; ayrı component specs workflow'dan çıkar | `ACCEPTED / PARTIAL` | DESIGN-PRECISION-INSTRUMENT |
| 17 Deckent-specific design skills | Skill yazmak implementationın ön koşulu değil; tekrar eden domain workflow kanıtından türetilir | `AMENDED` | DESIGN-PRECISION-INSTRUMENT |
| 18 Independent design critic | Provider bağımsızlığı ve evidence şartıyla | `ACCEPTED / HOLD WHEN UNAVAILABLE` | DESIGN-PRECISION-INSTRUMENT |
| 19 İlk hedef Golden Workflow | Dashboard/marketplace öncesi | `ACCEPTED` | CONVERSATION-RUN + RUN-INSPECTOR |
| 20 Execution mediation tek-kernel resolved posture katmanıdır | Owner kararıyla accepted; backend/scope/capability/landing foundation parçalı, tek durable aggregate ve cross-platform realm matrix eksik | `ACCEPTED / PARTIAL FOUNDATION` | P02-639/640, AUTHORITY/OPERATION, ENV-ADAPTER, TOOL-AUTHORITY, DESKTOP-ENTERPRISE |

## 15. Execution sequence → MASTER crosswalk

| Milestone | Önce kapanacak authority | MASTER work items | Exit condition |
|---|---|---|---|
| M0 Repository Reality Map | Bu reconciliation ve linked evidence | DOCS-PRODUCT-001 | 55/55 coverage + link/lint pass |
| M1 Runtime/Desktop Boundary | Application services | APP-SERVICE-001, DESKTOP-RUNTIME-001 | UI-free service proof |
| M2 Protocol & Shared State | Versioned protocol/client | SURFACE-CONTRACT-001, API-CONTRACT-001, SURFACE-PARITY-001 | Desktop/Terminal same run readback |
| M2E Execution Posture Contract | Admission, effect ve platform authority | P02-639/640, AUTHORITY/OPERATION, ENV-ADAPTER, TOOL-AUTHORITY | Exact posture digest; direct/staged/isolated/brokered/remote matrix; no silent downgrade |
| M3 Golden Workflow | Conversation→run aggregate | CONVERSATION-RUN-001, TERMINAL-001, DESKTOP-REBORN-001 | Full cross-surface golden-flow proof |
| M4 Provider Connections | Provider connection aggregate + secret refs | PROVIDER-CONNECTION-001, DESKTOP-SECURITY-001 | API/subscription/local truthful matrix |
| M5 MCP Hub | MCP lifecycle/governance UI | MCP-HUB-001, MCP-TRUST-001 | Client+server lifecycle parity |
| M6 Run Inspector | Evidence/read-model projection | RUN-INSPECTOR-001, TERMINAL-LIVE-001 | Same graph/timeline/evidence data |
| M7 Design System | Semantic states/components/tokens | DESIGN-PRECISION-INSTRUMENT-001, DESIGN-SYSTEM-001 | Golden workflow critic/a11y proof |
| M8 Workspace Customization | Versioned layout preferences | DESKTOP-WORKSPACE-LAYOUT-001, DESKTOP-CUSTOMIZE-001 | Layout migration/multi-display proof |
| M9 Capability/Extension | Governed contributions | CAPABILITY-001, plugin runtime/sandbox rows | Signed/sandboxed capability proof |
| M10 Team/Enterprise | Identity/policy/audit/cost/posture governance | DESKTOP-ENTERPRISE-001 + tenant/principal/policy rows | Multi-tenant isolation + inherited posture/effect policy proof |
| M11 Optional Tauri Benchmark | Same workload benchmark | DESKTOP-RUNTIME-001 | Evidence-based ADR; otherwise no migration |

M0–M2E foundation olmadan M3+ UI work'ü “production complete” sayılmaz. Bu, sonraki milestone'ları silmez; dependency sırasını dürüst kılar.

## 16. North-star 1–55 lossless coverage crosswalk

| § | Konu | Disposition / executable ownership |
|---:|---|---|
| 1 | Executive Summary | Ürün yönü kabul; APP-SERVICE + SURFACE-CONTRACT |
| 2 | Product Positioning | IDENTITY ve canonical vision ile uyumlu; ikinci vision yapılmadı |
| 3 | Primary Product Model | Progressive Agency/Disclosure kabul; Golden Workflow üzerinden |
| 4 | Golden Workflow | Kabul; CONVERSATION-RUN + RUN-INSPECTOR |
| 5 | System Architecture | Amend: `deckent serve` foundation → versioned `deckentd` + exact Execution Posture contract; APP-SERVICE/SURFACE-CONTRACT/P02/P04/P08 |
| 6 | Electron vs Tauri | KEEP_ELECTRON_AND_DECOUPLE_RUNTIME; M11 evidence olmadan yok |
| 7 | Cross-Platform | Platform adapters; ENV-ADAPTER/PACKAGING/native matrix |
| 8 | Desktop Product Structure | Progressive IA; DESKTOP-REBORN |
| 9 | Chat Entry | Kabul; persistent conversation authority şartı |
| 10 | Conversation to Run | CONVERSATION-RUN-001 |
| 11 | Run Inspector | RUN-INSPECTOR-001 |
| 12 | Provider & Connection | PROVIDER-CONNECTION-001 |
| 13 | Provider Data Model | Amend: Provider→Connection→Model→Profile |
| 14 | MCP Strategy | MCP server+client foundation; MCP-TRUST |
| 15 | MCP Hub UI | MCP-HUB-001 |
| 16 | Deckent as MCP Server | Canonical expose catalog + policy; MCP-HUB/MCP-TRUST |
| 17 | Capability Model | CAPABILITY-001 additive convergence |
| 18 | Extension Architecture | Plugin sandbox/signature/permission rows; UI runtime deferred |
| 19 | Appearance | DESKTOP-CUSTOMIZE + shared token authority |
| 20 | Workspace Layout | DESKTOP-WORKSPACE-LAYOUT-001 |
| 21 | Extension UI | Deferred until governed capability contribution boundary |
| 22 | Terminal/TUI Product | TERMINAL-001/TOOLS/DEV |
| 23 | TUI Direction | TERMINAL-REPL/LIVE/XPLAT; keyboard/a11y required |
| 24 | Security & Secrets | Secret Broker + realm/workspace/effect/landing aggregate gap; DESKTOP-SECURITY/PROVIDER-CONNECTION/P02/P04/P08 |
| 25 | Permission UX | ApprovalBroker/policy + MCP trust; partial |
| 26 | User Modes | Presentation presets, authorization roles değil; DESIGN-PRECISION |
| 27 | Solo→Enterprise | Same product/kernel/posture contract; policy progressively narrows authority |
| 28 | Enterprise UX | DESKTOP-ENTERPRISE + tenant/principal/policy/cost/posture governance ledgers |
| 29 | Design Philosophy | Precision Instrument default |
| 30 | Design References | Inspiration only; no copied design authority |
| 31 | Design Constitution | North-star principles + one-kernel/many-postures + DESIGN-PRECISION acceptance |
| 32 | Agentic UX States | Protocol enum/reason/accessibility closure; SURFACE-CONTRACT/DESIGN |
| 33 | Agentic Components | Golden Workflow patterns sonrası shared specs |
| 34 | Design Skill Stack | Amended: domain skills evidence'dan türetilir; generic UI authority değil |
| 35 | Design Repository | `docs/design/` bounded north-star+reconciliation; speculative empty tree kurulmadı |
| 36 | AI-assisted Design Workflow | Iterative, screenshot+interaction+critic; provider verdict authority değil |
| 37 | Codex+Fable Analysis | Codex repo evidence bu belgede; Fable çağrılmadı, uydurulmadı |
| 38 | Repository Discovery | Architecture inventory bu belgede ve MASTER evidence'ında |
| 39 | Architecture Map | §3 ve §5 |
| 40 | Gap Analysis | §4 ve target tables |
| 41 | Electron/Tauri ADR | KEEP_ELECTRON_AND_DECOUPLE_RUNTIME; benchmark HOLD |
| 42 | Product Surface Inventory | §3, §8, §9 |
| 43 | Golden Workflow Prototype | M3; foundation deps M1/M2 |
| 44 | Design System v0 | M7; workflow→patterns→components→tokens |
| 45 | Visual Directions | Instrument default; Spatial/Minimal only real workflow comparisons |
| 46 | Design Critic | Independent, evidence-backed; unavailable → HOLD |
| 47 | Implementation Validation | Real binary + screenshot/interaction + cross-surface proof |
| 48 | Open Questions | §4 answers; unknowns explicit HOLD |
| 49 | Non-Goals | Korundu; no rewrite/Tauri/plugin removal/enterprise big-bang |
| 50 | Decision Ledger | §14 all 20 decisions reconciled |
| 51 | Immediate Tasks | Eight ayrı geçici docs yerine iki durable docs + MASTER evidence; content kaybı yok |
| 52 | Sequence | §15 M0–M11 + M2E mapping |
| 53 | Success Criteria | Golden Workflow + resolved posture/effect/landing cross-surface acceptance |
| 54 | North Star | Canonical identityyle uyumlu controlled agentic environment; direct veya mediated aynı kernel |
| 55 | Final Principle | Repository reality üstün; bu belge implementation SSOT değil |

## 17. Atomik successor işlerin sınırı

Mevcut ledger umbrella'larını çoğaltmamak için yalnız aşağıdaki sahipsiz product outcomes açılır:

| Work ID | Exact outcome | Parent/dependency boundary |
|---|---|---|
| `CONVERSATION-RUN-001` | Durable conversation/context'ten logical run'a lossless geçiş ve cross-surface continuation | APP-SERVICE/SURFACE-CONTRACT |
| `PROVIDER-CONNECTION-001` | Provider→Connection→Model→Profile aggregate, credential refs ve truthful health/policy | provider/security authorities |
| `MCP-HUB-001` | MCP client+server lifecycle, discovery, permissions ve expose UI projection | MCP-TRUST/CAPABILITY |
| `RUN-INSPECTOR-001` | Same-run graph/timeline/log/evidence/approval/verifier projection | run read model/Terminal live |
| `DESKTOP-WORKSPACE-LAYOUT-001` | Versioned dock/split/tab/preset layout persistence and migration | DESKTOP-CUSTOMIZE/DESKTOP-REBORN |

Execution Posture yönü yeni bir umbrella veya edition açmaz; P02 execution plane, P04 authority/security ve P08 environment-adapter ownership'lerini tek product contractta birleştirir. Capability UI, Tauri prototype, enterprise admin ve ayrı design-skill paketleri bugün yeni umbrella olarak açılmaz; ilgili parent acceptance ve dependency gates içinde deferred kalır.

## 18. Validation ve DONE ölçütü

Bu dokümantasyon kapanışının ölçütleri:

- north-star ana başlıkları `1..55` tam ve tektir,
- 20 kararın tamamı disposition taşır,
- her milestone mevcut veya atomik successor MASTER work item'a bağlanır,
- docs navigation iki belgeyi görünür kılar,
- MASTER generated projections canonical script ile yenilenir,
- master-plan lint, link lint ve `git diff --check` geçer,
- provider/runtime/sprint/build çağrısı yapılmaz,
- başka session değişiklikleri stage/commit edilmez.

Ürün implementasyonu için DONE daha ağırdır: Desktop ve Terminal aynı logical run/conversation authority'sini ve exact Execution Posture contractını gerçek process boundaries üzerinden kullanmalı; direct/staged/isolated/brokered/remote yollarında disconnect/reconnect, resume, approval, cancel/partial effect, verify, land/discard/reconcile, cost/log/evidence, tenant isolation ve every-environment failure behavior executable olarak kanıtlanmalıdır.
