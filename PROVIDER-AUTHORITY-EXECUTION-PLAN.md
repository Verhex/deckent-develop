# Provider Authority & Execution Control Plane — Tam Kapsamlı İş Planı

**Kısa ad:** PAEP

**Durum:** Uygulama öncesi kabul ve yürütme spesifikasyonu

**Tarih:** 2026-07-25

**SSOT ilişkisi:** Açık işler `docs/MASTER-PLAN.md` içindeki
`PROVIDER-AUTHORITY-PLANE` epic'i ve alt satırlarıdır. Bu dosya işlerin nasıl
uygulanacağını, hangi güvenlik ve ürün sözleşmelerini koruyacağını tanımlar;
MASTER-PLAN yerine yeni bir tracker değildir.

---

## 1. İş özeti

Deckent provider credential'larını container veya worker process'ine daha kısa
ömürlü biçimde dağıtan bir secret dispenser olmayacaktır. Kalıcı hedef:

1. Provider'ın resmî CLI/app-server/API session'ı host authority sınırında
   çalışır.
2. OAuth token, refresh token, API key, `auth.json`, Keychain kaydı ve eşdeğer
   provider credential materyali worker'a verilmez.
3. Worker yalnız dosya, komut, test ve izin verilen workspace operasyonlarını
   yapan credential'sız execution realm'dir.
4. Host provider session'ı worker'a task-scoped, secret içermeyen ve provider
   endpoint'inde kullanılamayan bir `ProviderSessionLease` üzerinden bağlanır.
5. Provider'ın teknik yüzeyi, auth yöntemi, policy/ToS kararı, billing ve data
   boundary bilgileri ayrı versioned contract'lardır.
6. Provider veya ToS değiştiğinde Deckent core değiştirilmeden ilgili surface
   güncellenebilir, deprecate edilebilir veya quarantine edilebilir.

Bu modelin adı **Provider Authority & Execution Control Plane**'dir.
`deckent-authd`, uygulanırsa bu düzlemin yalnız custody/session runtime
bileşenidir; bütün mimarinin adı veya tek otoritesi değildir.

---

## 2. Neden bu çalışma gerekli?

### 2.1 Bugünkü güvenlik gerçeği

Bugünkü `DeckBroker`, `.deck` dosya yolunu worker'dan saklar; fakat
`resolveForTask()` gerçek `{ ENV_VAR: secret }` map'ini döndürür. TTL,
single-use ve audit secret'ın worker'a ulaştığı gerçeğini değiştirmez.

Mevcut subprocess tüketiminde broker sonucu yoksa legacy `opts.env` yoluna
düşülebilir. Broker deny kararının credential sağlayan eski yol üzerinden
atlatılabilmesi fail-open davranıştır.

Subscription mode'da broker mint edilmez. Docker backend ise provider
credential dosyalarını host'tan mount edip container HOME'una kopyalar.
Dolayısıyla mevcut yapı:

- credential file relocation yapar;
- secret'ın container process/memory sınırına girmesini engellemez;
- macOS Claude Keychain modelini doğru temsil etmez;
- aynı subscription credential'ının birden fazla worker tarafından
  kullanılmasına ve rotation yarışlarına açıktır;
- “worker credential görmez” garantisini sağlamaz.

Ground-truth kaynakları:

- `src/core/deck-broker.ts` — `DeckBroker.resolveForTask`
- `src/providers/subprocess.ts` — broker sonucu ve legacy env fallback
- `src/core/provider.ts` — subscription broker bypass
- `src/orchestra/spawn-backend-docker.ts` —
  `PROVIDER_AUTH_FILES` ve `buildProviderAuthIsolation`
- `docs/reference/api-surface.md` — mevcut DeckBroker contract'ı
- `docs/adr/adr-g-005-secret-file-system.md`
- `docs/adr/adr-g-008-provider-abstraction-fleet-usage.md`
- `docs/adr/adr-g-014-spawn-backend-options-observation.md`

### 2.2 Lisans ve provider policy gerçeği

Deckent'in MIT lisanslı veya gelir üretmiyor olması provider ToS/policy
yükümlülüklerini ortadan kaldırmaz. MIT ayrıca downstream ticari kullanıma izin
verdiğinden personal, team/business ve enterprise auth sınıfları baştan
ayrılmalıdır.

BYO-login:

- ortak credential pool'u ve Deckent adına hesap paylaşımını engeller;
- her kullanıcının kendi provider hesabını kullanmasını sağlar;
- fakat provider'ın üçüncü taraf automation/orchestration yasağını tek başına
  çözmez.

Teknik olarak mümkün olan bir auth yöntemi policy açısından izinli kabul
edilemez. Bu nedenle teknik capability ve policy kararı ayrı otoritelerdir.

### 2.3 Provider drift gerçeği

Provider değişiklikleri aynı sınıfta değildir:

| Değişim sınıfı | Örnek | Deckent etkisi |
|---|---|---|
| Teknik contract | CLI flag, stream event veya protocol değişikliği | Adapter/conformance güncellemesi |
| Authentication | OAuth, device flow veya credential store değişikliği | Auth strategy/custody güncellemesi |
| Entitlement | Subscription automation kapsamı değişikliği | Policy ve routing kararı |
| ToS/policy | Third-party kullanımın yasaklanması | Quarantine/block |
| Commercial | Billing, rate limit veya plan değişikliği | Commercial boundary ve approval |
| Security | Token sızıntısı veya credential format riski | Kill switch/revocation |
| Availability | Region/account/model kapsamı değişikliği | Runtime capability truth |

Amaç provider değişikliğini yok etmek değil; etkisini ilgili versioned
adapter/profile sınırına hapsetmek ve sessiz davranış değişikliğini önlemektir.

---

## 3. Bağlayıcı tasarım ilkeleri

### 3.1 Zero-worker-exposure

`credentialIsolation: true` yalnız aşağıdaki koşulların tamamında kullanılabilir:

- worker environment'ında provider secret yoktur;
- worker filesystem'inde provider auth dosyası yoktur;
- worker process tree'sinde provider credential yoktur;
- worker provider endpoint'ine doğrudan credential'lı istek atamaz;
- worker'a verilen capability provider tarafından kullanılamaz;
- capability başka task, attempt, provider veya worker instance'ında replay
  edilemez;
- provider refresh sahibi yalnız host custody/session katmanıdır.

Env veya tmpfs kullanımı bu sınıfa girmez.

### 3.2 Resmî provider surface

Subscription/managed-login için model döngüsü provider'ın resmî CLI veya
resmî embedding/app-server yüzeyinde çalışır. Deckent:

- provider OAuth flow'unu yeniden implemente etmez;
- token extract/convert etmez;
- TLS MITM veya header injection proxy kurmaz;
- provider credential formatını parse ederek kendi refresh client'ını yazmaz;
- subscription credential'ını API key'e çevirdiğini iddia etmez.

### 3.3 Fail-closed ve fail-loud

- Broker/lease/policy deny kararı legacy credential yoluna düşmez.
- Bilinmeyen provider version'ı sessizce “uyumlu” sayılmaz.
- Policy evidence eksikliği teknik fallback ile aşılmaz.
- Unknown model başka provider binary'sine çevrilmez.
- Subscription yolu çalışmazsa API billing yoluna sessiz geçilmez.
- Unsupported environment dürüst bir typed outcome üretir.

### 3.4 Birinci-sınıf Every Environment

Linux, macOS, Windows native, Windows/WSL, Docker Desktop, CI, Kubernetes ve
air-gapped enterprise ortamları baştan platform adapter matrisiyle tasarlanır.
Desteklenmeyen kombinasyon “sonra bakılır” diye sessiz degrade edilmez.

### 3.5 Tek authority, çok consumer

CLI, Terminal, Desktop, MCP, API, Goal-v2, process, sprint, autonomous ve
enterprise yüzeyleri aynı provider authority runtime'ını tüketir. Surface-local
credential veya policy resolver oluşturulmaz.

### 3.6 No silent fallback

Fallback yalnız teknik başarı olasılığı değildir. Şu sınırların tamamı
değerlendirilir:

- provider;
- account/organisation authority;
- billing class;
- model/capability equivalence;
- data processor;
- region/data residency;
- retention policy;
- credential exposure;
- approval semantics;
- tool surface;
- budget ve limit authority.

Sınırlardan biri değişirse açık kullanıcı veya organisation-admin onayı gerekir.

---

## 4. Terminoloji

| Terim | Tanım |
|---|---|
| Provider surface | CLI, app-server, direct API veya enterprise gateway gibi teknik execution yüzeyi |
| Auth strategy | Native user session, API key, access token, WIF, workload identity gibi kimlik doğrulama yolu |
| Custody | Credential'ın saklandığı, yenilendiği ve revoke edildiği güven sınırı |
| Provider session | Credential'ı içeride kullanan host-side resmî execution oturumu |
| ProviderSessionLease | Secret içermeyen, yalnız Deckent transport'unda geçerli task/attempt capability |
| Worker realm | Workspace tool'larının çalıştığı credential'sız container/subprocess/remote executor |
| Exposure class | Credential'ın hangi realm'lere ulaştığını ifade eden güvenlik sınıfı |
| Policy decision | Belirli account/use-mode/region/surface kombinasyonu için allowed/blocked kararı |
| Compatibility evidence | Adapter ile provider surface'in doğrulanmış teknik uyum kanıtı |
| Quarantine | Teknik veya policy belirsizliğinde yeni session açılmasını durduran durum |
| Commercial boundary | Billing/account/plan değişiminin kullanıcı onayı gerektiren sınırı |

---

## 5. Güven sınırları ve hedef topoloji

```text
┌───────────────────────────────────────────────────────────────────────┐
│ Host Authority Realm                                                  │
│                                                                       │
│  ┌────────────────────┐   ┌─────────────────────┐                    │
│  │ Capability Registry│   │ Provider Policy     │                    │
│  │ + Adapter Runtime  │   │ Registry + Evidence│                    │
│  └──────────┬─────────┘   └──────────┬──────────┘                    │
│             └──────────────┬──────────┘                               │
│                            ▼                                          │
│  ┌───────────────────────────────────────────────────────────────┐    │
│  │ Provider Authority Runtime                                   │    │
│  │ admission · policy · custody · session · budget · audit      │    │
│  └───────────────┬───────────────────────────────┬───────────────┘    │
│                  │                               │                    │
│       ┌──────────▼──────────┐          ┌─────────▼─────────┐          │
│       │ Official CLI /      │          │ API / Enterprise │          │
│       │ App-Server Session  │          │ Provider Driver  │          │
│       └──────────┬──────────┘          └─────────┬─────────┘          │
│                  └──────────────┬────────────────┘                    │
│                                 │ tool request/event                  │
└─────────────────────────────────┼─────────────────────────────────────┘
                                  │ signed task-scoped transport
┌─────────────────────────────────┼─────────────────────────────────────┐
│ Worker Execution Realm          ▼                                    │
│  ┌───────────────────────────────────────────────────────────────┐    │
│  │ Credential-less Worker Protocol / MCP Compatibility Adapter  │    │
│  ├───────────────────────────────────────────────────────────────┤    │
│  │ read · write · apply_patch · exec · git · test · progress     │    │
│  └───────────────────────────────────────────────────────────────┘    │
│                                                                       │
│  Provider OAuth/API key/auth file: NONE                              │
└───────────────────────────────────────────────────────────────────────┘
```

Model reasoning/provider loop host'tadır. Workspace etkileri Worker realm'de
kalır. Provider session worker'a shell veya filesystem authority vermez; yalnız
versioned Worker Protocol üzerinden declared capability kullanır.

---

## 6. Ana bileşenler

### 6.1 Provider Capability Registry

Provider teknik bilgisini hardcode branching yerine versioned manifest olarak
tutar:

```yaml
provider: anthropic
profileVersion: 7

surfaces:
  - surfaceId: anthropic/claude-cli
    kind: native-cli
    supportEvidence: officially-documented
    compatibilityConfidence: high
    executable: claude
    testedVersionRange: ">=2.4 <2.8"
    protocols:
      - cli-stream-json
      - provider-mcp-client

capabilities:
  streaming: true
  resumableSessions: true
  mcpTools: true
  usageEvents: true
  remoteWorkerBridge: true
```

Registry code çalıştırmaz. Manifest unknown alan, duplicate ID, schema drift ve
unsupported version'da fail-loud olmalıdır.

### 6.2 Auth Strategy Registry

Teknik auth yolları provider surface'ten ayrı kayıttır:

```yaml
strategyId: anthropic/native-user-session
provider: anthropic
surfaceId: anthropic/claude-cli
custody: host
credentialExposure: host-only
billingClass: subscription
accountClass:
  - personal
  - team
refreshOwner: provider-cli
```

Başka örnekler:

- `openai/chatgpt-managed-session`
- `openai/api-key`
- `openai/business-access-token`
- `google/ai-studio-api-key`
- `google/vertex-adc`
- `google/vertex-wif`

`CLAUDE_CODE_OAUTH_TOKEN` veya tmpfs `auth.json` gibi ara yollar
`credentialExposure: ephemeral-worker-secret` olarak sınıflandırılır; host-only
olarak gösterilmez.

### 6.3 Provider Policy Registry

Teknik capability'den bağımsız olarak belirli kullanım kapsamındaki policy
kararını taşır:

```yaml
decisionId: google/personal-oauth/third-party-automation
provider: google
policyVersion: 4
decision: blocked

scope:
  surfaceId: google/gemini-cli
  authStrategyId: google/personal-oauth
  accountClass: personal
  useMode: third-party-orchestration
  region: "*"

evidence:
  reviewedAt: 2026-07-25
  reviewBy: 2026-08-25
  sources:
    - url: https://github.com/google-gemini/gemini-cli/blob/main/docs/resources/faq.md
      digest: "sha256:<normalized-source-digest>"
```

Karar değerleri:

- `allowed`
- `allowed_with_conditions`
- `review_required`
- `enterprise_only`
- `quarantined`
- `blocked`

`gray` runtime tarafından route edilebilir bir karar değildir.

### 6.4 Provider Adapter SPI

Core interface raw credential döndürmez:

```ts
interface ProviderAdapter {
  discover(): Promise<ProviderRuntimeCapabilities>;
  healthCheck(): Promise<ProviderHealth>;
  openSession(request: SessionRequest): Promise<ProviderSessionHandle>;
  execute(
    session: ProviderSessionHandle,
    request: ProviderExecutionRequest,
  ): AsyncIterable<CanonicalProviderEvent>;
  inspectUsage(session: ProviderSessionHandle): Promise<UsageEvidence>;
  revoke(session: ProviderSessionHandle): Promise<void>;
}
```

Contract:

- `ProviderSessionHandle` opaque'dır;
- provider token veya auth-file path'i içermez;
- adapter canonical Deckent event üretir;
- unknown provider event sessizce düşmez;
- adapter policy kararı vermez, policy engine sonucunu tüketir;
- session owner host runtime'dır;
- cancellation ve settlement tek owner üzerinden yürür.

### 6.5 Credential/Session Custody

Custody adapter matrisi:

| Ortam | Personal/native session | API/enterprise |
|---|---|---|
| Linux | Provider CLI file/keyring | process secret store, vault, workload identity |
| macOS | Keychain/provider CLI | Keychain/vault |
| Windows | Credential Manager/provider CLI | Credential Manager/vault |
| WSL | WSL-local session veya explicit host bridge | WSL secret store/WIF |
| CI | Personal OAuth varsayılan değil | scoped API/access token/workload identity |
| Kubernetes | Personal session desteklenmez | secret store CSI, WIF, SPIFFE |

Custody:

- refresh'in tek sahibidir;
- generation/revocation bilgisini tutar;
- secret'ı audit log'a yazmaz;
- raw subject/account ID'yi durable store'a yazmadan pseudonymize eder;
- crash/restart sonrası stale session'ı fail-closed ele alır;
- host ile worker identity boundary'sini karıştırmaz.

### 6.6 ProviderSessionLease

Lease provider credential değildir:

```ts
interface ProviderSessionLease {
  version: 1;
  leaseId: string;
  tenantId: string;
  projectId: string;
  runId: string;
  taskId: string;
  attemptId: string;
  workerInstanceId: string;
  provider: string;
  surfaceId: string;
  modelApiId: string;
  executionProfileDigest: string;
  toolSurfaceDigest: string;
  budgetDigest: string;
  policyDecisionDigest: string;
  issuedAt: string;
  expiresAt: string;
  nonce: string;
  audience: "deckent-worker-bridge";
  signature: string;
}
```

Bağlayıcı kurallar:

- provider endpoint'inde kullanılamaz;
- raw secret, refresh token veya provider access token taşımaz;
- task/attempt/worker instance dışına replay edilemez;
- exact execution/tool/budget/policy digestlerine bağlıdır;
- first-writer dispatch claim ile tüketilir;
- expiry/revocation her tool çağrısında veya bounded cache penceresinde
  yeniden doğrulanır;
- loglarda yalnız opaque reference/digest görünür.

### 6.7 Worker Execution Protocol

Deckent Worker Protocol, provider MCP implementasyonundan ayrı internal
contract'tır. Provider-specific MCP adapter bu contract'ı provider tool schema'sına
çevirir.

İlk contract yüzeyi tam tasarlanır:

- exact file read;
- scoped file write;
- `apply_patch`;
- bounded process execution;
- git read operations;
- approval-gated git mutation;
- test execution;
- progress/event stream;
- cancellation;
- stdout/stderr chunking ve backpressure;
- artefact transfer;
- tool result provenance;
- scope ve tool-surface digest doğrulaması.

Protocol her çağrıda:

- lease;
- monotonik sequence;
- request ID;
- task/attempt binding;
- capability;
- exact path/command authority;
- deadline;
- output budget

taşır.

### 6.8 Provider MCP Compatibility Adapter

MCP açık standardına rağmen provider CLI istemcileri aynı semantiği garanti
etmez. Bu nedenle:

```text
WorkerExecutionProtocol
  → ClaudeMcpCompatibilityAdapter
  → CodexMcpCompatibilityAdapter
  → FutureProviderCompatibilityAdapter
```

Adapter şunları normalize eder:

- tool schema;
- content blocks;
- error model;
- cancellation;
- timeout;
- streaming;
- approval;
- path semantics;
- maximum payload;
- provider-specific tool naming.

### 6.9 Transport Adapter

| Ortam | Tercih edilen transport | Identity |
|---|---|---|
| Linux native/container | Unix domain socket | file mode + peer credential + lease |
| macOS Docker Desktop | loopback/host bridge mTLS | ephemeral cert + lease |
| Windows native | Named Pipe | ACL + process identity + lease |
| Windows Docker Desktop | host bridge mTLS | ephemeral cert + lease |
| WSL2 | UDS veya explicit host bridge | realm-bound identity + lease |
| Kubernetes | sidecar/local network | workload identity/mTLS/SPIFFE |
| Remote worker | mutually authenticated transport | tenant/project/worker certificate + lease |

TCP kullanılacaksa yalnız per-worker bearer yeterli değildir; ephemeral mTLS ve
lease birlikte gerekir. UDS/Named Pipe peer identity de task lease'in yerini
almaz.

### 6.10 Compatibility Observatory

İki farklı test hattı vardır.

#### Hermetic conformance suite

Her commit/CI:

- recorded provider fixtures;
- adapter protocol schema;
- event normalization;
- unknown version/event;
- fail-closed;
- lease replay/expiry/revocation;
- secret non-exposure;
- cancellation;
- budget/backpressure;
- cross-platform path/transport;
- fallback boundary.

#### Live provider canary

Scheduled veya provider release event'iyle:

- gerçek binary ve gerçek izinli test identity;
- binary version/capability discovery;
- behavioral probe;
- MCP tool round-trip;
- usage/settlement;
- cancellation;
- platform matrisi;
- current policy evidence binding.

Live canary başarısızlığı rastgele bütün CI'ı kırmak yerine ilgili surface'i
quarantine eder ve release/default-flip gate'ine typed evidence verir.

`--help` parsing yalnız yardımcı sinyaldir. Flag'in varlığı semantiğinin aynı
olduğunu kanıtlamaz.

### 6.11 Emergency Control Plane

Gerekli operasyonlar:

- provider-wide kill switch;
- auth-strategy-level block;
- provider surface/version quarantine;
- tenant/region/account-class block;
- running session drain;
- yeni session mint'i durdurma;
- credential/session revocation;
- last-known-good offline policy snapshot;
- staged rollout/rollback;
- visible user/admin reason;
- immutable audit event.

Remote update iki kanala ayrılır:

1. **Policy pack:** signed, declarative, code çalıştırmayan hızlı karar paketi.
2. **Adapter package:** signed, versioned, SBOM/digest taşıyan ve normal
   conformance/release sürecinden geçen kod paketi.

Remote policy pack executable hook, script veya arbitrary command içeremez.

---

## 7. Exposure sınıfları

| Sınıf | Açıklama | `credentialIsolation` |
|---|---|---:|
| `host-only-session` | Credential yalnız host resmî session/driver'da | `true` |
| `host-only-api` | API key/workload identity yalnız host provider driver'da | `true` |
| `ephemeral-worker-secret` | Env/tmpfs ile worker'a secret girer, kalıcı disk hedeflenmez | `false` |
| `persistent-worker-secret` | Auth file veya secret worker diskine/mount'una girer | `false` |
| `unknown` | Exposure kanıtlanamadı | `false`, route HOLD |

Security yönünde fallback yalnız eşit veya daha güçlü exposure class'a
yapılabilir. Daha zayıf sınıfa geçiş explicit approval gerektirir ve
unattended execution'da varsayılan olarak yasaktır.

---

## 8. Provider uygulama matrisi

### 8.1 Claude

#### Subscription/personal/team

Hedef:

- provider loop host'ta resmî `claude -p`;
- built-in tool yüzeyi kapalı veya exact allowlist;
- `--mcp-config` ve strict MCP configuration ile yalnız Deckent Worker Bridge;
- OAuth/Keychain/provider credential store host'ta;
- worker secret görmez.

Compatibility gereksinimleri:

- `--print`;
- streaming output contract;
- MCP config/strict mode;
- built-in tool disable/allowlist semantiği;
- usage ve terminal outcome normalization;
- cancellation;
- session persistence policy.

`CLAUDE_CODE_OAUTH_TOKEN`:

- resmî headless/CI mekanizması olabilir;
- container env'ine verilirse `ephemeral-worker-secret` sınıfındadır;
- uzun ömürlü bearer token olduğu için zero-exposure sayılmaz;
- yalnız time-bounded compatibility flag altında kullanılabilir.

`apiKeyHelper`:

- API key sağlayan hook olarak ele alınır;
- subscription OAuth helper olarak modellenmez;
- helper host provider process tarafından çağrılıyorsa host custody ile
  uyumludur;
- helper container'da çalışıp key döndürüyorsa worker exposure oluşur.

#### API mode

İlk host driver resmî Claude CLI/API-capable host process üzerinden çalışabilir.
Raw HTTP gateway ayrı provider yüzeyi olarak contract'ta baştan tanımlanır;
yalnız CLI'sız provider veya enterprise LLM gateway ihtiyacı olduğunda
implement edilir. API key worker'a verilmez.

### 8.2 Codex/OpenAI

#### ChatGPT-managed session

Tercih:

- Codex App Server adapter'ı;
- auth, conversation, approval ve streamed event sahipliği host'ta;
- worker yalnız Execution Bridge;
- App Server experimental maturity ile flag-gated;
- supported version envelope ve live canary olmadan default değildir.

Alternatif native driver:

- host-side `codex exec`;
- mevcut login'i host'ta kullanır;
- feature-equivalence ayrı doğrulanır;
- App Server'dan `exec` yoluna sessiz fallback yapılmaz.

`codex login --device-auth`, `CODEX_HOME` veya `auth.json`:

- resmî auth/onboarding/automation yüzeyleri olabilir;
- `auth.json` worker tmpfs'ine verilirse credential kopyasıdır;
- tmpfs persistence'ı azaltır, exposure'ı kaldırmaz;
- public/shared runner için güvenli default sayılmaz.

#### Business/Enterprise/API

- `CODEX_ACCESS_TOKEN`, `CODEX_API_KEY` veya eşdeğer organisation authority
  host custody'de kalır;
- exact account/tenant/plan ve expiration evidence'i kaydedilir;
- secret job-wide worker environment'a verilmez;
- API billing'e geçiş commercial-boundary approval ister.

### 8.3 Gemini/Google

#### Personal OAuth

Gemini CLI personal OAuth'u üçüncü taraf orchestration için açıkça destekleyen
provider policy evidence'i yoksa route edilmez. Teknik olarak credential
dosyasını tmpfs'e taşımak policy kararını değiştirmez ve exposure'ı kaldırmaz.

#### AI Studio API key

- solo kullanıcı kendi API key'ini kullanabilir;
- bunun subscription entitlement değil API auth/billing olduğu görünürdür;
- key host-side provider driver'da kalır;
- silent subscription→API fallback yasaktır.

#### Vertex AI

- ADC/WIF/workload identity enterprise yüzeyidir;
- executable-source veya WIF kullanımı ayrı experimental/stable capability
  evidence'iyle flag-gated olur;
- region/project/service-account authority'si tenant scope'a bağlanır;
- Kubernetes/enterprise platform adapter'ına entegre edilir.

### 8.4 Raw API ve enterprise gateway provider'ları

CLI'sız provider'lar için host-side HTTP Provider Driver:

- OpenAI-compatible veya provider-native protocol adapter;
- API key/vault/WIF host custody;
- request/usage/settlement canonical event;
- egress allowlist;
- tenant/account/billing binding;
- no raw secret in worker.

Bu adapter bridge modelinin istisnası değildir; provider reasoning loop host
driver'da, tool execution Worker realm'dedir.

---

## 9. Policy ve ToS governance

### 9.1 Evidence modeli

Her policy kararında:

- provider;
- integration surface;
- auth strategy;
- account class;
- use mode;
- region/jurisdiction;
- source URL;
- normalized source digest;
- observed/effective/review dates;
- reviewer/authority;
- decision;
- conditions;
- replacement path;
- expiry/re-review date

bulunur.

Teknik ve policy evidence timestamp'leri ayrıdır:

```yaml
technicalEvidence:
  verifiedAt: 2026-07-25
  binaryVersion: "x.y.z"
  contractDigest: "sha256:..."

policyEvidence:
  reviewedAt: 2026-07-25
  effectiveFrom: 2026-07-01
  reviewBy: 2026-08-25
  sourceDigest: "sha256:..."
```

### 9.2 Review sıklığı

Sabit 90 günlük tek süre yoktur:

- experimental surface: 7–14 gün;
- personal subscription third-party use: 14–30 gün;
- belgeli stable CLI: 30–90 gün;
- enterprise API/WIF: 90–180 gün;
- provider duyurusu veya policy diff: derhal.

### 9.3 Change pipeline

```text
Official source watcher
  → normalized snapshot/digest
  → semantic diff
  → human legal/product/security review
  → signed policy decision
  → canary/quarantine/staged rollout
  → user/admin explanation + audit
```

Watcher production policy'yi kendi başına değiştirmez. Otomatik sistem değişikliği
tespit eder ve evidence packet hazırlar; policy kararını yetkili insan verir.

Bu doküman hukuki görüş değildir. Deckent teknik olarak policy evidence'i
yönetir; geçerli hukuki yorum ilgili organisation ve yetkili danışman
sorumluluğundadır.

---

## 10. Fallback ve routing sözleşmesi

Seçim sırası:

1. Exact provider/account/model reachability evidence'i mevcut mu?
2. Integration surface teknik olarak verified mı?
3. Auth strategy current environment'ta kullanılabilir mi?
4. Policy decision `allowed` veya koşulları sağlanmış mı?
5. Exposure class execution policy'yi karşılıyor mu?
6. Budget/limit reservation mevcut mu?
7. Tool/execution capability eşdeğer mi?
8. Commercial/data boundary değişiyor mu?
9. Gerekli approval receipt mevcut mu?
10. Exact immutable attempt claim alınabiliyor mu?

Runtime durumları:

- `SUPPORTED`
- `DEGRADED`
- `UNSUPPORTED`
- `POLICY_REVIEW_REQUIRED`
- `POLICY_BLOCKED`
- `QUARANTINED`
- `AUTHORITY_HOLD`

`UNSUPPORTED` ve `POLICY_BLOCKED` aynı kullanıcı mesajı değildir. Tüm
user-facing mesajlar mevcut `getMessage(key, lang)` i18n contract'ından gelir.

---

## 11. Geçiş stratejisi

### 11.1 Legacy

Mevcut auth-file mount/copy:

- `persistent-worker-secret`;
- yeni kurulumlarda hedef değildir;
- migration telemetry/audit ile görünür;
- provider/platform bazlı removal gate'i vardır.

### 11.2 Ara sertleştirme

Env/tmpfs:

- `ephemeral-worker-secret`;
- macOS uyumluluk veya persistence azaltımı için explicit compatibility mode;
- default güvenlik hedefi değildir;
- unattended modda organisation policy ile kapatılabilir;
- warning ve deprecation/review tarihi taşır;
- “credential isolated” veya “zero exposure” olarak raporlanmaz.

### 11.3 Kalıcı hedef

Host session + credential-less bridge:

- `host-only-session` veya `host-only-api`;
- yeni default'a aday tek sınıf;
- platform ve real-binary acceptance matrisi tamamlanmadan default flip yoktur.

### 11.4 Migration davranışı

- Kullanıcının mevcut login'ine dokunulmaz.
- Otomatik logout/re-login yapılmaz.
- Credential dosyaları otomatik silinmez.
- Eski mode aktifse açık exposure mesajı gösterilir.
- Host bridge hazırsa kullanıcı kontrollü migration önerilir.
- Billing/account/provider boundary değişirse ayrıca onay alınır.
- Rollback yalnız güvenliği daha zayıf sınıfa sessiz düşürmez.

---

## 12. Fazlar ve MASTER-PLAN workstream'leri

### Faz 0 — fail-closed truth

Amaç: endgame'i beklemeden mevcut deny bypass'ını kapatmak.

- `AUTH-FAIL-CLOSED`
- broker-enabled deny durumunda `opts.env` fallback yok;
- explicit no-broker legacy davranışı ayrı kalır;
- typed denial reason;
- regression ve real-binary provider-free proof;
- subscription broker bypass'ı current-truth olarak raporlanır.

Bu faz provider credential mimarisini tamamlamaz.

### Faz A — compatibility hardening

Amaç: persistent credential copy'yi azaltmak ve macOS/Every Environment
problemini dürüst exposure sınıflarıyla yönetmek.

- `AUTH-EXPOSURE-CLASS`
- `PAEP-MIGRATION`
- env/tmpfs strategy kayıtları;
- explicit flag;
- audit ve user-visible warning;
- time-bound review/deprecation;
- mevcut credential'ı silmeden migration.

Faz A “zero exposure tamamlandı” sayılmaz.

### Faz B — core authority ve bridge

Amaç: kalıcı güvenlik topolojisini kurmak.

- `PAEP-ADR`
- `PROVIDER-SURFACE-REGISTRY`
- `AUTH-STRATEGY-REGISTRY`
- `PROVIDER-POLICY-REGISTRY`
- `PROVIDER-ADAPTER-SPI`
- `PROVIDER-SESSION-LEASE`
- `WORKER-EXEC-PROTOCOL`
- `WORKER-MCP-BRIDGE`
- `CLAUDE-HOST-DRIVER`
- `PAEP-CONTRACT-CONFORMANCE`

Claude host driver ilk gerçek-binary acceptance taşıyıcısıdır; architecture
Claude-specific değildir.

### Faz C — provider ve platform genişlemesi

- `CODEX-HOST-DRIVER`
- `GEMINI-POLICY-DRIVER`
- `AUTH-CUSTODY-PLATFORM`
- `PAEP-TRANSPORT-MATRIX`
- `PAEP-FALLBACK-BOUNDARY`
- `PAEP-LIVE-CANARY`
- `PAEP-PERF-FIDELITY`
- `PAEP-POLICY-EVIDENCE`
- `PAEP-SIGNED-POLICY-PACK`
- `PAEP-QUARANTINE`
- `PAEP-AUDIT-REDACTION`

### Faz D — enterprise authority

- `PAEP-ENTERPRISE-IDENTITY`
- Vault/KMS;
- workload identity/WIF;
- SPIFFE/SPIRE;
- tenant/region/data residency;
- organisation policy;
- version/policy freeze;
- SIEM/audit export;
- remote worker identity.

### Faz E — rollout ve default flip

- `PAEP-ROLLOUT`
- cross-platform real-binary acceptance;
- live provider canary;
- security negative tests;
- performance/fidelity threshold;
- migration rehearsal;
- staged default flip;
- legacy deprecation decision;
- release/publish evidence.

Her sprint Deckent'in 20–40 mikro-task kuralına göre bounded dilimlenir; bu
dokümandaki workstream'ler tek dev sprint olarak çalıştırılmaz.

---

## 13. Detaylı acceptance kriterleri

### 13.1 Security

- Container env dump'ında provider secret yok.
- Worker HOME ve mounted filesystem'de auth file yok.
- Linux `/proc/<pid>/environ` worker tree'sinde provider secret yok.
- Worker child process'leri provider secret miras almıyor.
- Worker provider endpoint'ine credential'lı doğrudan istek atamıyor.
- Lease wrong task/attempt/worker/provider/model için reddediliyor.
- Expired/revoked/replayed lease backend/tool çalıştırmadan reddediliyor.
- Broker deny legacy env fallback'e düşmüyor.
- Audit çıktısında raw token, secret, auth path, account subject veya prompt
  bulunmuyor.
- Crash/restart duplicate provider session veya duplicate tool effect üretmiyor.

### 13.2 Functional fidelity

- Host model loop container workspace üzerinde exact read/write/patch yapabiliyor.
- `CLAUDE.md`/AGENTS/skill/context injection davranışının değişimi açık ve testli.
- Built-in tools gerçekten kapalı/allowlisted.
- Tool output truncation/backpressure büyük build/test çıktılarında doğru.
- Cancellation host provider session'ı ve worker process group'unu kapatıyor.
- Usage/settlement exact attempt'e bağlanıyor.
- Approval gereken git/shell/network eylemi ApprovalBroker'ı bypass etmiyor.
- Session resume aynı immutable project/task authority'sini yeniden doğruluyor.

### 13.3 Performance

Ölçülecek metrikler:

- tool round-trip p50/p95/p99;
- first-token latency;
- bridge throughput;
- stdout/stderr throughput;
- büyük artefact transfer süresi;
- provider turn sayısı;
- cache read/create etkisi;
- token/context overhead;
- host/worker CPU ve memory;
- concurrent worker scaling;
- cancellation convergence süresi.

Threshold'lar baseline ölçümünden sonra owner-approved olarak kaydedilir.
Ölçülmemiş bridge “native ile eşdeğer” diye işaretlenmez.

### 13.4 Every Environment

- Linux native + Docker;
- macOS Keychain + Docker Desktop;
- Windows native Credential Manager + Named Pipe;
- Windows Docker Desktop;
- WSL2;
- locked-down CI;
- air-gapped/offline policy snapshot;
- Kubernetes/workload identity;
- path, permission, socket/pipe cleanup ve stale-process testleri.

### 13.5 Provider drift

- supported-version envelope dışı binary quarantine olur;
- unknown protocol event görünür evidence üretir;
- recorded fixture ve live behavioral probe ayrıdır;
- last-known-good adapter/policy rollback mümkündür;
- quarantined surface yeni session açmaz;
- running session drain/revoke semantiği testlidir.

### 13.6 Policy

- Teknik capability policy izni sayılmaz.
- Stale policy evidence risk profile'a göre block/review üretir.
- Provider/account/billing/data boundary değişiminde approval gerekir.
- Official source digest ve reviewer authority audit edilebilir.
- Policy pack imzasızsa uygulanmaz.
- Remote policy pack executable code çalıştıramaz.

---

## 14. Threat model

| Tehdit | Kontrol |
|---|---|
| Compromised worker env okur | Provider secret worker env'e hiç girmez |
| Worker auth file kopyalar | Auth file mount/copy hedef mimaride yok |
| Lease çalınır | Task/attempt/worker/audience/TTL/MAC binding |
| Lease replay | Nonce + first-writer claim + durable consumption |
| Worker provider'a doğrudan çıkar | Network/egress policy + provider credential yok |
| Host session tool escalation ister | Exact tool surface + ApprovalBroker |
| Provider CLI drift eder | Version envelope + conformance + quarantine |
| ToS değişir | Evidence diff + human review + signed policy pack |
| Silent API billing fallback | Commercial-boundary approval |
| Cross-tenant session karışır | Tenant/project/account binding + separate custody |
| Adapter supply-chain saldırısı | Signed package + digest + SBOM + canary |
| Remote policy code yürütür | Declarative schema, executable alan yok |
| Audit secret sızdırır | Canonical redaction + raw-secret schema rejection |
| Host crash duplicate effect üretir | Immutable attempt, idempotency, settlement/reconcile |

Host provider process'in compromise edilmesi ayrı ve daha yüksek trust
boundary'dir. PAEP worker exposure'ını kapatır; compromised host OS'yi güvenli
hale getirdiğini iddia etmez.

---

## 15. Audit ve observability

Her provider attempt için secret içermeyen kayıt:

- tenant/project/run/task/attempt;
- requested/resolved provider ve exact API model;
- surface/auth strategy ID;
- exposure class;
- capability/policy/adapter version digestleri;
- lease opaque ref;
- admission/fallback/approval kararları;
- account pseudonym;
- provider call started/terminal;
- usage/budget/settlement;
- cancellation/revocation;
- transport/platform;
- quarantine/degradation reason.

Loglar:

- `.brain/memory.db` içine credential yazmaz;
- raw OAuth/API key/auth file path yazmaz;
- prompt/response veya personal identity'yi policy evidence'e karıştırmaz;
- bounded ve retention-policy-aware olur;
- enterprise SIEM export'unda tenant boundary'yi korur.

---

## 16. ADR ve dokümantasyon etkisi

### Yeni ADR

Yeni karar kaydı önerisi:

> **Provider Authority & Execution Control Plane**

ADR şu sözleşmeleri birlikte karara bağlar:

1. custody ve provider session ownership;
2. zero-worker-exposure;
3. Provider Adapter SPI;
4. Worker Execution Protocol/Bridge;
5. capability/auth/policy registry ayrımı;
6. fallback boundaries;
7. compatibility evidence ve quarantine;
8. cross-platform transport;
9. migration/exposure sınıfları;
10. enterprise extension points.

### Cross-amendment

- ADR-G-005: “zero-worker-exposure” artık env dispenser değil host session
  anlamına gelir; DeckBroker mevcut durum/legacy olarak düzeltilir.
- ADR-G-008: provider abstraction capability/policy/session contract'ına
  genişler; “subscription CLI her backend” iddiası exposure class ile
  dürüstleştirilir.
- ADR-G-014: spawn backend, host provider driver + Worker Execution Bridge
  topolojisini ve observation/settlement sahipliğini içerir.
- ADR-G-017: per-project/tenant custody ve account isolation sınırı.
- ADR-G-020: tool/path/command authority bridge çağrılarında uygulanır.
- ADR-G-027: prompt/context injection host-loop topolojisine uyarlanır.
- ADR-G-030: daemon/session auto-start ve credential migration consent'i.
- ADR-G-031: Vault/WIF/SPIFFE/tenant policy enterprise derinliği.
- ADR-D-011: per-project coordination daemon ile provider session runtime
  lifecycle'ı çakışmadan tek koordinasyon topolojisinde çözülür.

### Diğer dokümanlar

Uygulama sırasında güncellenecekler:

- `docs/reference/api-surface.md`
- `docs/reference/config.md`
- `docs/guide/configuration.md`
- `docs/guide/installation.md`
- `DECKENT.md`
- provider feature dokümanları
- security/threat-model dokümanları
- architecture/cross-platform matrisi
- release/migration notes

---

## 17. Uygulama sıralaması ve bağımlılık kuralları

1. Fail-closed truth düzeltilmeden yeni broker/lease consumer eklenmez.
2. ADR ve exposure sınıfları kabul edilmeden compatibility mode default
   değiştirilmez.
3. Registry schema'ları olmadan provider-specific hardcode driver eklenmez.
4. Lease contract olmadan transport/MCP bridge production'a bağlanmaz.
5. Worker Protocol olmadan Claude/Codex özel tool API'si core contract yapılmaz.
6. Hermetic conformance olmadan live canary success release kanıtı sayılmaz.
7. Live canary olmadan provider surface default-on olmaz.
8. Policy evidence olmadan personal subscription third-party route edilmez.
9. Performance baseline olmadan fidelity/equivalence iddiası yapılmaz.
10. Platform matrisi olmadan Every Environment completion iddiası yapılmaz.
11. Billing/data boundary approval olmadan cross-provider fallback açılmaz.
12. Enterprise custody gelmeden shared multi-tenant session pooling yapılmaz.

---

## 18. Definition of Done

Epic ancak aşağıdakilerin tamamı sağlandığında tamamdır:

- Yeni ADR accepted ve cross-amendment'lar güncel.
- Mevcut `DeckBroker` fail-open yolu kapalı.
- Host-only ve legacy exposure sınıfları runtime-visible.
- Provider capability/auth/policy registry production-wired.
- Provider Adapter SPI raw secret döndürmüyor.
- `ProviderSessionLease` replay/expiry/revocation testleri geçiyor.
- Worker Execution Protocol ve MCP compatibility adapters production-wired.
- Claude ve Codex için en az birer host-side native session real-binary proof'u
  var.
- Gemini personal OAuth policy davranışı explicit ve fail-closed.
- API/enterprise provider yolu host custody ile çalışıyor.
- Linux/macOS/Windows/WSL/Docker/Kubernetes matrisi dürüstçe sonuçlanmış.
- Secret non-exposure negative tests gerçek process/container sınırında geçiyor.
- Live provider canary ve quarantine pipeline çalışıyor.
- Signed declarative policy pack ve offline last-known-good doğrulanmış.
- Fallback commercial/data boundary approval-gated.
- Performance/fidelity threshold'ları sağlanmış veya açık capability
  limitation olarak sınıflandırılmış.
- Migration rehearsal mevcut kullanıcı credential'ını bozmadığını kanıtlıyor.
- Default flip owner-approved ve staged.
- Legacy auth-file copy yolu kaldırılmış veya açık, süreli ve default-off
  compatibility mode olarak kalmış.
- Publish/release dokümanları ve user-facing i18n mesajları tamamlanmış.

---

## 19. Bilinçli negative space

Bu epic kapsamında yapılmayacaklar:

- provider OAuth flow reimplementation;
- credential/token conversion;
- TLS MITM veya header injection;
- raw credential'ın lease içine konması;
- token'ların `.brain/memory.db` içine yazılması;
- provider personal credential pool'u;
- organisation üyeleri arasında session paylaşımı;
- silent subscription→API veya provider→provider fallback;
- remote policy pack üzerinden code execution;
- bilinmeyen CLI version'ında optimistic continue;
- yalnız Linux/Docker için tasarlayıp diğer platformları erteleme;
- env/tmpfs yolunu zero-exposure diye pazarlama;
- app-server experimental yüzeyini kör default-on yapma;
- policy kararını otomatik web scraper'a devretme.

---

## 20. Resmî provider referansları

Bu referanslar implementation sırasında source digest ve review metadata'sıyla
policy evidence kayıtlarına dönüştürülmelidir:

- Claude authentication:
  https://code.claude.com/docs/en/authentication
- Claude CLI:
  https://code.claude.com/docs/en/cli-usage
- Claude legal/compliance:
  https://code.claude.com/docs/en/legal-and-compliance
- Codex authentication:
  https://learn.chatgpt.com/docs/auth
- Codex App Server:
  https://learn.chatgpt.com/docs/app-server
- Codex non-interactive authentication:
  https://learn.chatgpt.com/docs/non-interactive-mode#authenticate-in-automation
- Gemini CLI authentication:
  https://geminicli.com/docs/get-started/authentication/
- Gemini CLI OAuth/third-party FAQ:
  https://github.com/google-gemini/gemini-cli/blob/main/docs/resources/faq.md

Doküman URL'sinin mevcut olması tek başına izin veya uyumluluk kanıtı değildir;
exact kullanım kapsamı, tarih, digest ve insan review kararı gerekir.

---

## 21. Yürütme notu

Bu dosya kapsamı eksiltmeden sprintlere bölmek için kullanılır. Her sprint:

1. MASTER-PLAN'daki exact satırlara bağlanır.
2. 20–40 bounded mikro-task üretir.
3. Provider/live/credential gerektiren adımları açık gate olarak yazar.
4. Provider-free hermetic kanıtı live-provider kanıtı gibi sunmaz.
5. Gerçek-binary ve Every Environment acceptance kanıtını ayrı tutar.
6. Yeni bulguyu aynı gün MASTER-PLAN'a born work-item olarak ekler.
7. Default flip, login, credential migration, paid canary, commit/push ve
   publish adımlarını ayrı owner approval sınırında tutar.
