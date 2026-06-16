# 2026-06-08 CLI/MCP Ürün Akışı Kök-Neden Analizi

Bu doküman Deckent CLI/MCP yüzeyinin ürün akışı açısından derinleştirilmiş analizidir. Amaç, `docs/MASTER-PLAN.md` ve `docs/vision/blueprint.md` içine eklenecek kararları doğrudan SSOT'a yazmadan önce kanıtlanmış, kodla doğrulanmış bir ara katman oluşturmaktır.

## Kapsam ve Yöntem

- Okunan SSOT dosyaları: `docs/MASTER-PLAN.md`, `docs/vision/blueprint.md`.
- Kodla doğrulanan ana yüzeyler: `src/cli/index.ts`, `src/mcp/tools/index.ts`, `src/mcp/server.ts`, `src/mcp/resources/index.ts`.
- Derin okunan kritik akışlar: `init`, `analyze`, `set-directives`, `plan`, `start`, `run`, `status`, `review`, `retro`, `chat`, `autonomous`, `flow`, MCP lifecycle tools, provider/spawn/config/task tipleri.
- Bu doküman kod değişikliği önerisi değil, mimari karar öncesi kök-neden ve ürün-akışı analizidir.

## Yönetici Özeti

Deckent'in mevcut kodu, sıradan bir CLI aracından çok daha fazlasını hedefleyen agentic OS / orchestration runtime yönünü doğruluyor. CLI tarafı çok geniş; init, sprint lifecycle, one-shot run, memory, nervous, autonomous, bot, MCP yönetimi, model registry, RBAC, dashboard, docs ve agent/skill yönetimi aynı ürün yüzeyinde birleşmiş durumda. MCP tarafı ise daha kontrollü bir control-plane olarak konumlanmış: temel lifecycle, read-only gözlem, bazı mutasyonlu işlemler ve nervous parçaları var.

Ana problem "özellik yokluğu" değil, "özellik niyetinin tek bir canonical execution contract altında yeterince birleşmemesi". Kodda birçok güçlü parça var: autonomous runtime, approval gate, policy gate, authority enforcer, task router, provider registry, subscription-aware chat, scheduled flow, RBAC, MCP tools/resources. Fakat bu parçaların bazıları farklı sprintlerde doğal olarak büyümüş; sonuç olarak CLI/MCP parity, provider routing, task sınıflandırması, profile/mode ayrımı ve first-run onboarding henüz tek ürün sözleşmesine bağlanmamış.

Open beta açısından en kritik riskler:

- `Task` modeli hâlâ ağırlıklı olarak code-centric; email, ERP, business process, personal assistant gibi işlerin ihtiyacı olan `TaskType`, `EnvironmentType`, `RequirementProfile`, connector/data policy ve lineage alanları yok.
- CLI ve MCP bazı kritik yerlerde aynı davranışı vermiyor: `run` provider seçimi, `start` autoApprove/doctor davranışı, `review` persistence davranışı.
- Provider bağımsızlık vizyonu güçlü ama bazı runtime path'lerinde Claude varsayımları hâlâ sert biçimde duruyor.
- `init/analyze` ürün vizyonundaki profil, sistem kapasitesi, subscription, first-run ve güvenli onboarding karar motoruna henüz tam dönüşmemiş.

## Ürün Akışı Mimari Haritası

### 1. Init / Analyze / Recommend

Kod doğrulaması:

- CLI `init`: `src/cli/commands/init.ts`
- MCP `init`: `src/mcp/tools/init.ts`
- CLI `analyze`: `src/cli/commands/analyze.ts`
- MCP `analyze`: `src/mcp/tools/analyze.ts`
- Sistem/stack tespiti: `src/core/system-profile.ts`, `src/core/stack-detector.ts`

Mevcut durum:

- `init`, project analysis, stack detection, provider detection, subscription-aware wizard, consent-based provisioning, multi-env config, directives, brain files ve rule generation gibi birçok kritik adımı içeriyor.
- `analyze`, proje dilini/frameworklerini/komutlarını tespit eden hafif bir gözlem aracı olarak çalışıyor.
- `system-profile`, RAM/CPU üzerinden worker önerisi yapabiliyor.

Kök-neden:

- Ürün vizyonundaki "Deckent'i hiç bilmeyen kullanıcıya yormadan bağlama" hedefi için gerekli parçalar var, fakat kararlar tek bir `OnboardingDecisionEngine` altında birleşmemiş.
- `analyze` yalnızca gözlem raporu veriyor; `recommend` davranışı veya "şimdi önerilen kuruluma geçelim mi?" flow'u henüz canonical değil.
- `mode` runtime davranışı gibi ele alınmış; kullanıcı profili (`assistant`, `developer`, `team`, `enterprise`) ayrı bir kurulum/kapasite profili olarak modellenmemiş.

Risk seviyesi: Yüksek.

Öneri:

- `init/analyze/recommend` aynı karar motorunu kullanmalı.
- Karar motoru şu eksenleri üretmeli: `InstallProfile`, `RuntimeMode`, `TaskCapabilitySet`, `SecurityPosture`, `ProviderPlan`, `FirstRunPlan`.
- `deckent analyze` çıktısı sadece tablo değil, uygulanabilir öneri ve `deckent init` için ön doldurulmuş karar planı verebilmeli.

### 2. Set Directives / Plan / Start

Kod doğrulaması:

- CLI `set-directives`: `src/cli/commands/set-directives.ts`
- MCP `set_directives`: `src/mcp/tools/directives.ts`
- CLI `plan`: `src/cli/commands/plan.ts`
- MCP `plan`: `src/mcp/tools/plan.ts`
- Planner: `src/orchestra/planner.ts`, `src/orchestra/sprint-planner.ts`
- CLI `start`: `src/cli/commands/start.ts`
- MCP `start`: `src/mcp/tools/start.ts`

Mevcut durum:

- `set-directives`, `DIRECTIVES.md` üretip task breakdown ve model tahmini döndürüyor.
- `plan`, directives ve priority context üzerinden sprint planı üretiyor.
- `start`, zero-config, provider bootstrap, sandbox, lock, doctor, cost estimate ve sprint execution gibi güçlü bir lifecycle taşıyor.
- MCP `start`, detached child process ile sprint başlatıyor ve cost acknowledgement gibi kontrollere sahip.

Kök-neden:

- Directives, task JSON, skill/agent markdown, ADR, memory, debt ve identity arasındaki öncelik sırası kodda sabit. Kullanıcının onayladığı dinamik layer modeli henüz planner sözleşmesine yansımamış.
- `planner.ts` priority context sırası sabit ve her iş tipine aynı anlamı yüklüyor. Oysa dokümantasyon, analiz, kod, ERP/process ve assistant işleri farklı layer ağırlıkları gerektiriyor.
- CLI `start` içinde `autoApprove` davranışı pratikte her zaman true olarak `runSprint`'e geçiyor; MCP tarafında ise parametre taşınıyor. Bu bir parity ve policy netliği riski.
- MCP `start` içinde doctor pre-flight bilinçli olarak ayrışmış görünüyor; bu kabul edilebilir, ama kullanıcıya yüzeyde açık anlatılmalı.

Risk seviyesi: Yüksek.

Öneri:

- `LayerProfile` kavramı eklenmeli: Policy, Mission, Governance, Execution, Capability, Learning dinamik ağırlıklarla task/process türüne göre uygulanmalı.
- `start` için CLI/MCP parity contract yazılmalı: preflight, cost, sandbox, autoApprove, detached mode, force davranışı açıkça ayrıştırılmalı.
- Directives canonical kalmalı, fakat `DECKENT.md`, ADR, task JSON, agent/skill, memory ve user notes katkıları layer engine üzerinden seçilmeli.

### 3. Run / Status / Review / Retro / Cleanup

Kod doğrulaması:

- CLI `run`: `src/cli/commands/run.ts`
- MCP `run`: `src/mcp/tools/run.ts`
- CLI `status`: `src/cli/commands/status.ts`
- MCP `status`: `src/mcp/tools/status.ts`
- CLI `review`: `src/cli/commands/review.ts`
- MCP `review`: `src/mcp/tools/review.ts`
- CLI `retro`: `src/cli/commands/retro.ts`
- MCP `retro`: `src/mcp/tools/retro.ts`
- CLI/MCP `cleanup`, `kill`: `src/cli/commands/cleanup.ts`, `src/mcp/tools/cleanup.ts`, `src/cli/commands/kill.ts`, `src/mcp/tools/kill.ts`

Mevcut durum:

- `run`, sprint dışı one-shot task için pratik bir yüzey.
- `status`, CLI tarafında watch/follow/json/raw/graph gibi zengin observability veriyor; MCP tarafı daha deterministik snapshot veriyor.
- `review`, CLI tarafında review state'i persist ediyor; MCP tarafında daha çok read-only/idempotent summary gibi davranıyor.
- `retro`, sprint geçmişini memory/performance boyutlarıyla zengin biçimde okuyabiliyor.

Kök-neden:

- `run` CLI ve MCP arasında provider davranışı farklı. CLI varsayılan model üzerinden task oluştururken MCP `provider: 'claude'` hardcode ediyor. Bu provider-free vizyonla çelişen açık bir risk.
- CLI `run` içinde `autoApprove` option'ı pratikte ignored; Deckent standard olarak true sabitlenmiş. Bu ürün güvenliği açısından yanlış olmak zorunda değil, ama sözleşmesi net değil.
- MCP `review` state'i persist etmiyor; CLI review ise `.tasks` ve `.brain/reviews` altında kalıcı iz bırakıyor. MCP tool'unun adı kullanıcıda aynı davranış beklentisi yaratabilir.
- `status` iyi ayrışmış: CLI canlı izleme için, MCP snapshot için uygun. Burada sorun parity değil, dokümantasyon netliği.

Risk seviyesi: Orta-Yüksek.

Öneri:

- `run` ve `start` için ortak `ExecutionRequest` contract oluşturulmalı.
- MCP `run` hardcoded Claude bağımlılığından çıkarılmalı; provider/model router kullanılmalı.
- Review iki moda ayrılmalı: `review inspect` ve `review decide/apply`. MCP tool adı ve izin modeli buna göre netleşmeli.

### 4. Chat / Assistant / Tool Bridge

Kod doğrulaması:

- CLI `chat`: `src/cli/commands/chat.ts`
- Tool bridge: `src/cli/commands/chat-tool-bridge.ts`
- Intent dispatch: `src/cli/commands/chat-agentic-dispatch.ts`
- Messaging connector: `src/connectors/chat-bridge.ts`

Mevcut durum:

- `chat`, Claude/Codex/Gemini gibi host CLI araçlarına bağlanabiliyor, native ve non-native yolları var.
- Non-native modda host AI CLI'ları `DECKENT_MCP_AUTO_ATTACH=1` ile Deckent MCP'ye bağlanabiliyor.
- Native path'te subscription chat adapter düşünülmüş, fakat bazı tool dispatch yolları stub kalmış.
- `chat-tool-bridge`, birçok Deckent MCP-benzeri tool adını CLI komutlarına çeviriyor.
- `chat-agentic-dispatch`, doğal dil niyetlerinden sınırlı ve güvenli tool intent üretiyor.
- `chat-bridge`, messaging connector için safe/risky intent ayrımı, action parking ve subscription Claude default'u sunuyor.

Kök-neden:

- Assistant vizyonunun temeli var, ancak üç ayrı katman tam birleşmemiş: native chat, host CLI bridge, messaging connector.
- Güvenli intent ayrımı iyi başlıyor; fakat assistant/developer/team/enterprise profilleri ile birleşmediği için "maillerimi kontrol et" ile "projeye özellik ekle" ayrımı henüz canonical task semantics üzerinden yapılamıyor.
- Local-first vizyon güçlü, fakat tool bridge komutlarının izin, tenant, data classification ve connector scope sözleşmesi ileride zorunlu olacak.

Risk seviyesi: Orta.

Öneri:

- Assistant istekleri de `TaskType + EnvironmentType + RequirementProfile` içine parse edilmeli.
- Native chat, MCP bridge ve messaging connector tek `ConversationControlPlane` sözleşmesine bağlanmalı.
- Tool bridge allowlist'i profile/policy/tenant bazlı hale gelmeli.

### 5. Autonomous / Flow / Bot / Nervous

Kod doğrulaması:

- CLI `autonomous`: `src/cli/commands/autonomous.ts`
- Runtime: `src/orchestra/autonomous-runtime.ts`
- Backlog types: `src/orchestra/autonomous/backlog-types.ts`
- Policy/approval/dispatch: `src/orchestra/autonomous/policy-gate.ts`, `src/orchestra/autonomous/approval-adapter.ts`, `src/orchestra/autonomous/execute-dispatcher.ts`
- CLI `flow`: `src/cli/commands/flow.ts`
- Flow registry: `src/core/flow-registry.ts`, `src/core/scheduled-flow.ts`
- CLI/MCP nervous: `src/cli/commands/nervous.ts`, `src/mcp/tools/nervous.ts`
- Bot: `src/cli/commands/bot.ts`, `src/connectors/chat-bridge.ts`

Mevcut durum:

- Autonomous engine gerçek bir pipeline'a sahip: trigger, authority, approval, policy, execute, audit.
- Default policy onay gerektiriyor; worker self-dispatch tarzı riskli özellikler varsayılan açık değil.
- Backlog entry `kind = task | sprint`; policy `auto | approval-required | risk-tagged`.
- Flow tarafı tenant-aware scheduled action registry sunuyor, fakat action hâlâ string düzeyinde.
- Nervous sistemi CLI/MCP tarafında belirgin bir denetim katmanı olarak var.

Kök-neden:

- Autonomous ve flow altyapısı, ürün hedefindeki "işleri arka planda düzenleyen orkestratör" için doğru temel. Fakat iş semantiği hâlâ çok dar: task/sprint ve string action.
- Kullanıcının tarif ettiği yapı, aynı sprintte kod, email, ERP sipariş analizi, doküman ve kişisel assistant işlerinin paralel yürüyebilmesini istiyor. Bu mevcut task modelinden daha geniş bir domain contract gerektiriyor.
- Brain/Nervous/Auditor denetim vizyonu kodda parça parça var; enterprise process tarafında hard-enforced policy ve human approval modeli henüz tam ürünleşmemiş.

Risk seviyesi: Yüksek.

Öneri:

- `kind` kavramı tek başına büyütülmemeli; yerine üçlü model kullanılmalı:
  - `TaskType`: iş ne?
  - `EnvironmentType`: iş nerede / hangi bağlamda?
  - `RequirementProfile`: işin gereklilikleri, izinleri, riskleri ve kalite hedefi ne?
- Autonomous backlog ve scheduled flow bu contract'a taşınmalı.
- Worker self-dispatch default false kalmalı; MCP tool, event stream, backlog append ve autonomous flow gibi kanallar policy gate arkasında açılmalı.

### 6. MCP Server / Tools / Resources

Kod doğrulaması:

- MCP server: `src/mcp/server.ts`
- Tool registry: `src/mcp/tools/index.ts`
- Resource registry: `src/mcp/resources/index.ts`
- Resources: dashboard, directives, memory, debt, config, retro, tasks, agents.

Mevcut durum:

- MCP tool registry lifecycle ve gözlem için güçlü bir yüzey sunuyor: init, directives, plan, start, status, doctor, retro, history, analyze, sync, config, review, run, kill, cleanup, help, agent/skill list, checkpoint, docs, explain, memory query, nervous, feature query, audit, recover, models.
- MCP resource registry 8 kaynak sunuyor.
- `src/mcp/server.ts` instructions metni "Tools (32)" ve belirli workflow anlatıyor.

Kök-neden:

- Registry ile server instructions arasında drift riski var. Tool sayısı ve nervous alt-tool genişlemesi güncel metinle birebir eşleşmeyebilir.
- MCP bir control-plane olarak doğru tasarlanmış; fakat bazı tool davranışları CLI ile aynı isim beklentisine rağmen aynı sonuçları üretmiyor.
- MCP resources read-only bağlam için iyi; enterprise uygulama/dashboard geldiğinde bu resource modeli process/resource/data-plane ayrımına evrilmeli.

Risk seviyesi: Orta.

Öneri:

- MCP help/instructions runtime registry'den üretilebilmeli veya test ile drift yakalanmalı.
- MCP tool'lar "read-only", "mutating", "long-running", "destructive", "approval-required" şeklinde metadata taşımalı.
- MCP tool parity testi, CLI command parity testinden bağımsız bir sözleşme olarak tutulmalı.

## CLI/MCP Parity Matrisi

| Alan | CLI | MCP | Durum | Risk |
|---|---|---|---|---|
| `init` | Var | Var | Temel parity var, ama profil/first-run eksik | Yüksek |
| `analyze` | Var | Var | Gözlem var, recommend flow yok | Orta |
| `set-directives` | Var | Var | Canonical directives var | Orta |
| `plan` | Var | Var | Plan üretimi var, layer dinamik değil | Orta |
| `start` | Var | Var | Davranış ayrışıyor: doctor/autoApprove/detached | Yüksek |
| `run` | Var | Var | MCP Claude hardcode, CLI option drift | Yüksek |
| `status` | Var | Var | CLI canlı, MCP snapshot; kabul edilebilir ayrım | Düşük-Orta |
| `review` | Var | Var | CLI persist, MCP read-only summary | Orta |
| `retro` | Var | Var | Temel parity var | Düşük-Orta |
| `history` | Var | Var | Temel parity var | Düşük |
| `cleanup` | Var | Var | Temel parity var | Orta |
| `kill` | Var | Var | Riskli işlem; explicit intent/panic guard kritik | Orta-Yüksek |
| `doctor` | Var | Var | Preflight sözleşmesi netleşmeli | Orta |
| `config` | Var | Var | CLI daha geniş; MCP sınırlı | Orta |
| `sync` | Var | Var | Adapter/rule sync için önemli | Orta |
| `checkpoint` | Var | Var | Lifecycle governance için temel | Orta |
| `docs` | Var | Var | Managed docs yüzeyi var | Düşük |
| `explain` | Var | Var | Gözlem/öğrenme yüzeyi | Düşük |
| `memory/recall/remember` | Geniş | `memory_query` | MCP read-only ağırlıklı | Orta |
| `nervous` | Geniş | Kısmi/genişleyen | Kritik denetim katmanı | Orta-Yüksek |
| `models` | Var | Var | Provider-free vizyon için kritik | Orta |
| `flow` | Var | Yok | Process mode MCP/API parity eksik | Yüksek |
| `autonomous` | Var | Yok | Autonomous control-plane MCP eksik | Yüksek |
| `bot` | Var | Yok | Assistant/messaging ops MCP eksik | Orta |
| `mcp` yönetimi | Var | Yok | Doğal olarak CLI admin yüzeyi olabilir | Düşük-Orta |
| `rbac` | Var | Yok | Enterprise control-plane için MCP/API gerekebilir | Orta-Yüksek |
| `audit/audit-verify` | Var | `audit` var | Verification parity genişletilmeli | Orta |
| `features/evolve` | Var | `feature_query` var | Evolution pipeline MCP sınırlı | Orta |

## Provider / Auth / Sandbox / Tenant Çapraz Bulguları

### Provider

Kodda provider bağımsızlık hedefi çok güçlü: model registry, `models.dev`, provider registry, subscription auth, OpenAI-compatible varyasyonlar ve Bedrock gibi hedefler SSOT'ta açık. Buna rağmen bazı execution path'lerinde Claude varsayımları duruyor.

Kanıt:

- MCP `run` hardcoded `provider: 'claude'`.
- Docker backend bazı provider seçimlerinde Claude-style CLI argümanlarına bağımlı.
- Codex adapter ayrı var, fakat spawn backend ve subscription auth yolları her yerde aynı olgunlukta değil.

Kök-neden:

- Provider layer ve spawn backend evolution farklı sprintlerde ilerlemiş. Registry vizyonu ile worker execution adapter sözleşmesi tam birleşmemiş.

Öneri:

- `ProviderRuntimeAdapter` ve `WorkerLaunchPlan` ayrımı netleşmeli.
- Bedrock gibi "provider içinde model/API family barındıran provider" durumları ilk sınıf model olmalı.
- Provider seçimi task semantics, subscription availability, cost, latency, quality, local resource ve enterprise policy üzerinden yapılmalı.

### Auth ve Secrets

Mevcut config ve docs, subscription/API/local ayrımını destekliyor. Init provider detection ve consent-based provisioning tarafında ilerlemiş. Enterprise taraf için tenant hard enforcement planlı ama her runtime yolunda aynı seviyede değil.

Öneri:

- Auth precedence tek dosyada değil, runtime launch contract içinde kanıtlanmalı.
- Her provider call için `AuthResolutionTrace` üretilebilir.
- Tenant ve role bilgisi task/flow/autonomous action üzerinde taşınmalı.

### Sandbox

Sandbox mode config ve start/runtime path'lerinde var. Docker backend ve future Firecracker planı enterprise için doğru yön. Fakat sandbox sadece execution izolasyonu değil, tool/data/connector izolasyonu olarak da tasarlanmalı.

Öneri:

- Sandbox policy `TaskRequirementProfile` içine taşınmalı.
- Connector sandbox: email/ERP/API/webhook gibi harici işlemler için read-only, draft, approve-to-send, execute gibi capability seviyeleri olmalı.

## Ürün Profilleri

Kullanıcı kararları:

- `assistant`
- `developer`
- `team`
- `enterprise`

Mevcut durum:

- Config içinde `mode` var, fakat bu daha çok runtime/task/sprint davranışı.
- Product profile henüz birinci sınıf kavram değil.

Öneri:

- `InstallProfile` ayrı olmalı.
- Aynı kişi aynı anda assistant ve code işlerini kullanabilir. Bu nedenle profil global kapatma/açma gibi değil, default capability paketi gibi davranmalı.
- Upgrade komutları örnekleri:
  - `deckent upgrade --developer`
  - `deckent upgrade --team`
  - `deckent upgrade --enterprise`

## First-Run ve Proof-of-Understanding

Kullanıcı kararı:

- Kurulum sonrası `.deckent/first-run/` altında güvenli doğrulama akışı olmalı.
- Default read-only olmalı.
- Projeyi anladığını göstermek için gerekirse 1-2 test dosyası üretmeli; bu üretim kontrollü/sandbox/proof alanında olmalı.

Mevcut durum:

- `analyze` stack ve komutları anlayabiliyor.
- `doctor`, `test`, `run`, `start` gibi gerekli parçalar var.
- Canonical first-run plan yok.

Öneri:

- `FirstRunPlan` şu adımları içermeli:
  - Read-only repo/env scan.
  - Stack/language detection.
  - Provider/subscription detection.
  - Safe capability matrix.
  - Optional proof test generation in isolated path.
  - User-visible confidence report.

## Dinamik Layer Modeli

Kullanıcı tarafından kabul edilen layer isimleri:

- Policy
- Mission
- Governance
- Execution
- Capability
- Learning

Ek karar:

- Layerlar sabit olmamalı; işin türüne ve akışına göre dinamik olmalı.
- Dokümantasyon veya analiz işlerinde debt her zaman öncelikli olmayabilir.

Mevcut durum:

- Planner priority context sabit.
- Governance ve authority parçaları var ama task türüne göre layer ağırlığı yok.

Öneri:

- `LayerProfile` planner ve execution request'in parçası olmalı.
- `TaskType/EnvironmentType/RequirementProfile` layer ağırlığını belirlemeli.
- Brain/Nervous/Auditor denetimleri layer outcome'a göre devreye girmeli.

## Kritik Riskler

1. Task modeli ürün vizyonunu taşımıyor.

`Task` modeli code-centric ve file-scope ağırlıklı. Kod dışı assistant, ERP, email, webhook, business process ve enterprise governance işlerini güvenli taşımak için semantik alanlar eksik.

2. Provider-free vizyon runtime path'lerinde tam hard-enforced değil.

Registry/plan güçlü, fakat `run`, Docker backend ve bazı default'larda Claude varsayımları sürüyor.

3. CLI/MCP aynı isimli işlemler her zaman aynı sözleşmeyi taşımıyor.

Bu özellikle enterprise ve MCP client kullanan worker ekosisteminde güven kaybı yaratabilir.

4. Init/analyze onboarding karar motoru eksik.

Kod parçaları var, ama kullanıcı profili, sistem kapasitesi, subscription, first-run ve güvenlik postürü tek planda birleşmiyor.

5. Enterprise/process mode henüz domain contract'a taşınmamış.

Flow var ama process/action hâlâ string seviyesinde. Role, approval, connector, data classification ve audit lineage zorunlu olacak.

## Orta Riskler

- MCP server instructions ile actual registry arasında drift riski.
- Native chat ve tool dispatcher entegrasyonu kısmi.
- `review` CLI/MCP persistence farkı.
- `start` preflight/autoApprove davranış netliği.
- Worker self-dispatch kanalları net policy contract'a bağlanmadan açılırsa kontrol riski.
- Existing docs çok geniş; kullanıcı için profil bazlı minimal docs paketleme eksik.

## Düşük Riskler

- `status` CLI/MCP ayrımı teknik olarak mantıklı; sadece dokümante edilmeli.
- `history`, `retro`, `docs`, `explain`, `agent_list`, `skill_list` gibi read-heavy yüzeyler ürün için iyi temel.
- MCP resources mevcut control-plane için yeterli başlangıç sağlıyor.

## Eksik Production-Grade Kabiliyetler

- Canonical `ExecutionRequest`.
- Canonical `TaskType / EnvironmentType / RequirementProfile`.
- Install profile engine: assistant/developer/team/enterprise.
- First-run proof-of-understanding pipeline.
- Provider launch contract: provider/model/auth/subscription/sandbox/cost trace.
- MCP tool metadata: read-only/mutating/destructive/long-running/approval-required.
- Process mode canonical schema.
- Enterprise role/approval import and customization model.
- Runtime parity tests for CLI/MCP.
- MCP instruction registry drift test.

## Önerilen Refactor Alanları

P0 düzeyi:

- `src/core/task-types.ts`: code-centric task modelini genişletmek.
- `src/cli/commands/run.ts` ve `src/mcp/tools/run.ts`: ortak execution contract.
- `src/cli/commands/start.ts` ve `src/mcp/tools/start.ts`: start parity contract.
- Provider launch path: Docker/Codex/Gemini/Claude ayrımını adapter contract'a taşımak.

P1 düzeyi:

- `init/analyze` karar motorunu ayırmak.
- Planner priority context'i dynamic layer engine'e taşımak.
- Autonomous backlog ve flow action modelini yeni task semantics'e bağlamak.
- Chat/assistant bridge'i conversation control-plane'e toplamak.

P2 düzeyi:

- MCP help/instructions auto-generation.
- Docs profil bazlı modüler paketleme.
- Dashboard/app/API ile aynı canonical schema'yı paylaşan enterprise UI planı.

## Test Planı

P0 testleri:

- CLI/MCP parity tests:
  - `run` provider/model/auth davranışı.
  - `start` dry-run/cost/sandbox/autoApprove/force davranışı.
  - `review` inspect vs apply davranışı.
- Provider launch tests:
  - Claude CLI, Codex CLI, Gemini CLI, OpenAI-compatible, Bedrock-like provider mapping.
  - Subscription vs API key precedence.
- Task semantics tests:
  - code task, doc task, assistant task, email read-only task, ERP read-only process task.
- MCP metadata tests:
  - every tool has safety class, long-running marker, approval requirement.

P1 testleri:

- Init/analyze recommendation golden snapshots for Node, Python, .NET, monorepo, no-code docs repo.
- First-run safe proof generation tests.
- Autonomous approval gate and denied-by-default self-dispatch tests.
- Flow tenant/RBAC isolation tests.

P2 testleri:

- Docs profile generation tests.
- Dashboard/API schema parity tests.
- Performance tests for large repos and high worker counts.

## Open Beta Hazırlık Skoru

Mevcut kod ve ürün hedefi birlikte değerlendirildiğinde skor: **72 / 100**.

Gerekçe:

- Artı puan: Çok geniş CLI yüzeyi, gerçek autonomous runtime, MCP control-plane, provider registry vizyonu, nervous/auditor/brain temelleri, docs/ADR olgunluğu.
- Eksi puan: Provider-free runtime gap, task semantics gap, CLI/MCP parity drift, onboarding/first-run karar motoru eksikliği, enterprise process schema eksikliği.

Bu skor "ürün potansiyeli" için yüksek, "kurumsal open beta güvenliği" için henüz sınırda kabul edilmelidir. P0 tamamlanmadan enterprise-facing beta önerilmez; developer/dogfood beta kontrollü başlatılabilir.

## Öncelikli Aksiyon Planı

### P0

1. `ExecutionRequest` contract tasarla ve `run/start` CLI/MCP yollarını buna bağla.
2. MCP `run` içindeki Claude hardcode'u kaldır; provider router kullan.
3. `TaskType / EnvironmentType / RequirementProfile` tasarımını SSOT'a ekle.
4. `start` autoApprove, doctor, cost, sandbox ve detached davranış parity sözleşmesini yaz.
5. MCP tool safety metadata ve drift testi ekle.
6. Provider launch adapter sözleşmesini Docker/Codex/Gemini/Claude için doğrula.

### P1

1. `init/analyze/recommend` için `OnboardingDecisionEngine` tasarla.
2. `assistant/developer/team/enterprise` install profile modelini ekle.
3. `.deckent/first-run/` güvenli doğrulama akışını tasarla.
4. Dynamic layer engine'i planner'a bağla.
5. Autonomous backlog ve flow action modelini yeni task semantics ile genişlet.
6. Chat/assistant/messaging bridge'i conversation control-plane altında birleştir.

### P2

1. Docs profil bazlı modüler yükleme/okuma planı.
2. Enterprise UI/dashboard/API schema parity.
3. RBAC role import/customization modeli.
4. Process mode read-only observation sprintleri.
5. Performance/cost/resource optimization planner.

## SSOT'a Eklenecek Özet Taslak

Bu bölüm henüz `MASTER-PLAN.md` veya `blueprint.md` içine yazılmadı. Onay sonrası iki SSOT'a şu kararlar işlenmeli:

- Deckent ürün profilleri: `assistant`, `developer`, `team`, `enterprise`.
- Deckent runtime mode ile install profile ayrıdır.
- Canonical task semantics: `TaskType`, `EnvironmentType`, `RequirementProfile`.
- Dynamic layer model: Policy, Mission, Governance, Execution, Capability, Learning.
- `init/analyze/recommend` ortak onboarding karar motoruna bağlanacak.
- First-run default read-only, optional proof-of-understanding ile çalışacak.
- Worker self-dispatch default false; policy/approval/audit gate arkasında açılacak.
- Enterprise/process mode ilk fazda read-only observation ve recommendation olarak başlayacak.
- CLI/MCP parity artık isim eşitliği değil, davranış sözleşmesi ve safety metadata eşitliği olarak tanımlanacak.

