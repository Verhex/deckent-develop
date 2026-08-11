# Rolling Spend Budget Authority — Güvenlik Tasarımı ve Implementation Handoff (2026-08-05)

> **Karar durumu:** KABUL EDİLDİ — Alperen, 2026-08-05 OWASP Agentic Top 10 bağımsız
> inceleme oturumu, Bulgu 2.
>
> **Implementation durumu:** Bu oturumda production kodu değiştirilmedi. Bu doküman başka bir
> Deckent session'ında Goal/Mission/Flow/Run planına alınacak implementation authority girdisidir.
>
> **Canonical ledger:** `LIMIT-SPEND-ENFORCE-001` (order 4091), parent `LIMIT-001` (4090),
> ilişkili `AUTHORITY-001` (4000), `RECEIPT-001` (4070), `APPROVAL-001` (4050),
> `COST-001` (10060). OWASP bağlamı: `SEC-OWASP-ASI-001` (4190), ağırlıklı ASI08/ASI09.

## 1. Sonuç — tek cümle

Daily/monthly spend kontrolü project-local JSONL toplamı ve warning olmaktan çıkarılacak; bütün provider
execution ingressleri host-owned, multi-scope, atomic reservation/settlement yapan canonical
`BudgetAuthority` tarafından verilen, identity-bound ve fenced `SpendLease` olmadan metered API work
dispatch edemeyecek.

## 2. Bugünkü code-truth baseline

| Alan | Bugünkü gerçek | Enforcement hükmü |
|---|---|---|
| Per-sprint estimate | `evaluateCostGate()` sprint/request USD ve token ceiling'ini karşılaştırıp typed block üretebiliyor (`src/core/cost-gate.ts:92-202`) | **ENFORCED**, fakat `--force` / `acknowledgeCost` override var |
| Unknown pricing | Remote pricing bilinmiyorsa numeric zero sayılmıyor ve ordinary acknowledgement ile geçilemiyor (`src/core/cost-gate.ts:140-162`) | **ENFORCED** |
| Runtime task/run budget | Provider/host-measured usage ile task ve run budget verdict'i hesaplanıyor (`src/core/execution-budget.ts:20-76`) | **ENFORCED** |
| Runtime dispatch stop | Run cost `within-budget` değilse `runBudgetHold` yeni dispatch'i durduruyor (`src/orchestra/result-collector.ts:1766-1811`, `:1855`) | **ENFORCED**, yalnız current run |
| Rolling day/month | `checkSpendGate()` yalnız `BRAIN→USER:COST_LIMIT_WARN` döndürüyor (`src/core/cost-gate.ts:236-293`) | **ADVISORY** |
| Config key | `cost_limits.enforce_spend_gate` açıklaması açıkça warn-only ve default `false` (`src/core/cost-config-loader.ts:72-82`) | **CONFIG-GATED**, adı davranışla çelişkili |
| CLI pre-spawn | Warning event/console üretip sprint'i başlatıyor (`src/cli/commands/start.ts:945-962`) | **ADVISORY** |
| MCP pre-spawn | Aynı warn helper'ı çağrılıyor (`src/mcp/tools/start.ts:533-545`) | **ADVISORY** |
| Finalize | Finalize spend hook “visibility only”, fail-safe ve non-blocking (`src/orchestra/sprint-finalizer.ts:1878-1950`) | **ADVISORY** |
| Rolling reader | `.deckent/settings/resource-log.jsonl` içindeki `costUsd` satırlarını ISO day/month prefix ile topluyor (`src/core/cost-config-loader.ts:414-470`) | Read-only projection |
| Resource-log writer | Production `ResourceMonitor` aynı dosyaya yalnız Docker CPU/memory/network samples yazıyor; schema'da `costUsd` yok (`src/orchestra/resource-monitor.ts:9-27`, `:169-188`) | Billed-spend producer yok |
| Final billed result | Finalizer job summary billed/reference USD alanlarını ayrı yazıyor (`src/orchestra/sprint-finalizer.ts:3260-3290`) | Run-local result, rolling authority değil |

### 2.1 Daha kuvvetli ikinci gap: rolling reader'ın canonical producer'ı yok

Repo-wide static call-graph'da `.deckent/settings/resource-log.jsonl` dosyasına authoritative `costUsd`
append eden production producer bulunmamıştır. Spend tests JSONL cost entries'ini fixture olarak kendileri
oluşturur (`tests/orchestra/cost-gate-advisory.test.ts:69-97`). Harici bir süreç bu dosyayı dolduruyor
olabilir; bu runtime çalıştırılmadığı için **UNVERIFIED**'dır. Repo-içi code-truth şudur:

```text
resource-log writer → Docker resource samples
spend reader        → costUsd bekliyor
canonical billed-spend producer → yok
```

Bu yüzden mevcut `readSpendWindow()` üzerine hard block koymak güvenilir enforcement üretmez; boş veya
worker-tamperable veri üzerinden yanlış allow/deny üretir.

## 3. Kabul edilen mimari kararlar

### D1 — Rolling enforcement bir read/check helper değil transaction authority'sidir

Doğru admission formülü:

```text
settled billed spend
+ outstanding reservations
+ requested conservative upper bound
<= applicable hard ceiling
```

Hesap ve reservation aynı atomic transaction içinde yapılır. Read-then-write race kabul edilmez.

### D2 — Dispatch yalnız valid `SpendLease` ile mümkündür

Metered API execution'ın bütün production ingressleri exact tenant/project/provider/account/run/task/attempt
identity'lerine bağlı, TTL ve fencing token taşıyan lease ister. Caller'ın `ok: true`, estimate veya worker
result beyanı authority değildir.

### D3 — Active provider call kill edilmez; yeni harcama admission'ı durur

Ceiling veya reservation aşıldığında:

- In-flight provider call zorla öldürülmez.
- Yeni task, model turn, retry, FIX, XFIX, fallback ve nested delegation dispatch edilmez.
- In-flight sonuç durable biçimde toplanır ve billed evidence settle edilir.
- Kalan iş typed `PAUSED/COST_BUDGET_HOLD` olur.
- Resume, yeni reservation/top-up veya yetkili override gerektirir.

“Graceful landing” aktif sprint'in sınırsız devam etmesi değildir; her yeni harcama boundary'sinde lease
kontrolü vardır.

### D4 — Billed USD, reference USD ve quota ayrı authority domainleridir

| Billing mode | Rolling USD bucket | Ayrı authority |
|---|---|---|
| `api` | Incremental billed USD | Token/rate limits de ayrıca |
| `subscription` | `0` incremental USD | Subscription quota/usage window |
| `free_tier` | `0` billed USD | Free-tier quota |
| `local` | `0` provider USD | Local compute/resource cost |
| `hybrid` | Exact charge authority çözülene dek `UNKNOWN/HOLD` | Hybrid quota + billed evidence |
| unknown | Numeric zero yasak; `UNKNOWN/HOLD` | Authority resolution gerekli |

`referenceUsd` forecast/observability için saklanır; API daily/monthly spend'i tüketmez.

### D5 — Para fixed-point integer'dır

Canonical ledger `number`/binary floating point kullanmaz:

```text
currency = USD
amountMicros = signed/unsigned safe integer veya canonical decimal-integer storage
$1.234567 = 1_234_567 microUSD
```

UI ve rapor katmanında decimal USD projection yapılır. Addition/comparison/reservation/settlement core'da
integer ile çalışır. Overflow, negative amount ve precision loss typed validation error'dır.

### D6 — Ledger project çalışma alanının dışında host-owned'dur

Project-local JSONL observability olabilir; financial enforcement authority olamaz.

- Solo/local adapter: platform-resolved, owner-hardened host state altında SQLite WAL.
- Enterprise/multi-host adapter: transactional service DB; row lock/serializable admission.
- Her iki adapter aynı `BudgetAuthority` contract'ını uygular.
- Worker/project write authority ledger dosyasına ulaşamaz.
- Unsupported/unreachable ledger, metered API için yeni admission'da fail-closed HOLD'dur.

### D7 — Çoklu scope all-or-nothing reserve edilir

Applicable budget buckets:

```text
provider billing account
organization
tenant
principal/team
project
mission/run
task/attempt
```

Admission tüm bucket'ları deterministic sırayla lock eder ve tek transaction'da reserve eder. Herhangi bir
bucket yetersizse hiçbir bucket'ta partial reservation kalmaz. Delegation yalnız parent lease'den daha dar
child reservation çıkarabilir; bütçe büyütemez veya iki kez harcayamaz.

### D8 — Estimate, measured usage ve invoice reconciliation farklı aşamalardır

- Admission: versioned pricing snapshot ile conservative upper-bound estimate.
- Runtime: provider/host-measured usage ve incremental reservation consumption.
- Settlement: terminal provider billing evidence veya trusted host repricing.
- Late invoice: immutable adjustment entry; geçmiş entry overwrite edilmez.

Unknown pricing/usage `0` değildir. Evidence state `known | unknown | disputed | pending-reconciliation`
olarak tiplenir.

### D9 — Ordinary `--force` rolling hard cap'i bypass edemez

Mevcut `--force` yalnız per-sprint estimate acknowledgement için kalabilir. Rolling/project/tenant/account
hard ceiling override'ı runtime-wide ApprovalBroker üzerinden exact amount/scope/period/TTL/nonce/reason
ve authorized principal receipt'i ister.

- Provider-account, organization compliance ve owner “never exceed” caps non-overridable olabilir.
- Project operational budget yalnız policy izin verirse süreli, miktar-sınırlı override alabilir.
- Approval integrity Bulgu 11 / `APPROVAL-001` kapanmadan rolling override capability açılmaz; o zamana
  kadar hard caps non-overridable'dır.

### D10 — Period explicit timezone ve authority clock ile doğar

Day/month window ISO prefix string'i değildir. Policy timezone taşır; ledger `periodId`, UTC start ve UTC
end instant'larını kaydeder. DST, month length ve clock drift typed biçimde ele alınır. Caller timestamp'i
authority değildir.

Boundary'yi aşacak lease ya iki period'a split edilir ya boundary'de renew edilir. Yeni period reservation
başarısızsa run graceful landing'e geçer.

### D11 — Settlement eksikse çalışma sonucu kaybolmaz fakat authority COMPLETE olmaz

Provider work bitmiş ancak financial settlement doğrulanamamışsa:

- Task output durable kalır.
- Billed state `COST_SETTLEMENT_PENDING/HOLD` olur.
- Etkilenen budget bucket yeni lease vermez veya conservative reservation'ı tutar.
- Reconciliation exact attempt/lease identity'siyle tamamlanır.
- Outer run tam `COMPLETE` claim edemez; kod sonucu ile financial settlement ayrı truth alanlarıdır.

### D12 — Config adı davranışla birebir örtüşür

`enforce_spend_gate=true` adı altında warning-only davranış kalmaz. Typed mode ve versioned migration
zorunludur; silent behavior flip veya silent precedence yoktur.

## 4. Hedef authority mimarisi

```text
Effective config + tenant/org/account policy + provider/account identity
                             │
                             ▼
                  Resolve applicable budget buckets
                             │
                             ▼
             Price/usage evidence + upper-bound estimate
                             │
                             ▼
          ┌──────── Atomic admission transaction ────────┐
          │ lock bucket rows in canonical order          │
          │ settled + reserved + requested <= ceiling    │
          │ insert reservation + lease + receipt         │
          └───────────────────────────────────────────────┘
                  │                         │
                  ▼                         ▼
          SpendLease/ALLOW             Typed HOLD
                  │
                  ▼
    ProviderExecutionIngressAuthority exact binding
                  │
                  ▼
         task/turn/retry/fallback dispatch
                  │
                  ▼
      measured usage → consume/top-up/landing
                  │
                  ▼
  terminal billing evidence → settle/release/reconcile
```

Canonical production wiring closure:

```text
policy producers
  → BudgetAuthority resolver
  → atomic reservation store
  → provider execution ingress
  → runtime usage/landing monitor
  → terminal billing settlement
  → run/status/audit/user projections
```

CLI-only veya `deckent start`-only wiring COMPLETE değildir. Resume, autonomous, Goal/Mission/Flow,
Run/Do, task mode, MCP, connector, retry/FIX/fallback, nested delegation ve XVerify dahil her provider
call aynı ingress authority'den geçmelidir.

## 5. Normative data contracts

İsimler implementation sırasında mevcut repository naming pattern'ine uydurulabilir; semantic alanlar ve
authority ayrımı değiştirilemez.

### 5.1 Money

```ts
interface MoneyMicros {
  readonly currency: 'USD';
  readonly micros: bigint;
}
```

Persistence adapter `bigint` değerini lossless integer/text representation ile saklar. JSON/API projection
canonical decimal string veya safe schema kullanır; `Number()` ile sessiz daralma yapılmaz.

### 5.2 Budget scope ve policy

```ts
type BudgetScope =
  | { kind: 'provider_account'; provider: string; accountFingerprint: string }
  | { kind: 'organization'; organizationId: string }
  | { kind: 'tenant'; tenantId: string }
  | { kind: 'principal'; tenantId: string; principalId: string }
  | { kind: 'project'; tenantId: string; projectIdentity: string }
  | { kind: 'run'; runId: string }
  | { kind: 'attempt'; taskId: string; attemptId: string };

interface RollingBudgetPolicy {
  readonly policyId: string;
  readonly policyVersion: string;
  readonly scope: BudgetScope;
  readonly periodKind: 'day' | 'month';
  readonly timezone: string;
  readonly ceiling: MoneyMicros;
  readonly overridePolicy: 'never' | 'scoped_approval';
  readonly enabled: true;
}
```

### 5.3 Admission request

```ts
interface SpendAdmissionRequest {
  readonly admissionId: string;
  readonly idempotencyKey: string;
  readonly principalId: string;
  readonly tenantId: string;
  readonly projectIdentity: string;
  readonly runId: string;
  readonly taskId?: string;
  readonly attemptId?: string;
  readonly provider: string;
  readonly providerAccountFingerprint: string;
  readonly billingMode: string;
  readonly modelId: string;
  readonly priceSnapshotId: string;
  readonly requestedUpperBound: MoneyMicros;
  readonly requestedAtAuthorityTime: string;
  readonly parentLeaseId?: string;
}
```

### 5.4 Spend lease

```ts
interface SpendLease {
  readonly leaseId: string;
  readonly admissionId: string;
  readonly reservationId: string;
  readonly fencingToken: string;
  readonly boundIdentityDigest: string;
  readonly applicablePolicyIds: readonly string[];
  readonly periodIds: readonly string[];
  readonly reserved: MoneyMicros;
  readonly consumed: MoneyMicros;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly state: 'reserved' | 'active' | 'landing' | 'settlement_pending';
  readonly receiptRef: string;
}
```

Lease bearer token gibi geniş authority değildir. Exact provider/account/model/run/task/attempt binding
eşleşmezse dispatch reddedilir. Lease replay, duplicate attempt veya expired fencing token HOLD'dur.

### 5.5 Ledger entry

Append-only semantic entry kinds:

```text
policy_bound
reservation_created
reservation_activated
usage_observed
reservation_topped_up
landing_started
settlement_recorded
reservation_released
reservation_expired_pending_reconciliation
invoice_adjustment
override_granted
override_consumed
override_revoked
```

Entry; previous hash/sequence, idempotency key, actor/principal, scope, period, lease/attempt identity,
amount, evidence refs, policy version ve authority timestamp taşır. Materialized counters append-only ledger
projection'ıdır; tek başına history authority değildir.

## 6. Atomic admission algoritması

### 6.1 Bucket resolution

Provider/account, organization, tenant, principal, project, run ve attempt policy'leri effective config,
verified principal, provider account authority ve tenant context'ten çözülür. Instruction text veya model
adı policy kaynağı değildir.

### 6.2 Transaction

1. Idempotency key ile mevcut admission/lease aranır; aynı identity ise aynı sonuç döner, conflict ise HOLD.
2. Applicable policy rows canonical scope order'ında lock edilir.
3. Her bucket için current period resolve edilir.
4. `settled + activeReservations + requestedUpperBound` hesaplanır.
5. Herhangi bir hard ceiling aşılırsa typed denial receipt yazılır; reservation yok.
6. Hepsi uygunsa bütün bucket allocations ve tek lease aynı transaction'da yazılır.
7. Transaction commit olmadan dispatch claim üretilemez.

SQLite adapter `BEGIN IMMEDIATE`/equivalent transaction ve unique idempotency constraints; enterprise
adapter serializable transaction veya deterministic row locks kullanır. Retry, transaction sonucu belirsizse
idempotency key üzerinden reconcile eder; kör ikinci reservation üretmez.

### 6.3 Concurrency invariants

- Aynı `$100` bucket'ta `$90` settled iken iki `$8` request'ten en fazla biri allow olabilir.
- Multi-bucket reservation partial commit yapamaz.
- Deadlock önlemek için bucket lock sırası bütün adapter'larda aynıdır.
- Reservation amount mutable update ile sessiz büyümez; top-up ayrı transaction/entry'dir.
- Parent/child reservations toplamı parent reserved amount'ı aşamaz.
- Lease expire olması provider call'ın kesin bittiğini kanıtlamaz; amount doğrudan release edilmez, önce
  attempt liveness/settlement reconciliation gerekir.

## 7. Runtime consumption ve graceful landing

### 7.1 Provider call boundary

Her call/turn başlamadan önce:

- Lease active ve unexpired mı?
- Exact dispatch identity/fencing token eşleşiyor mu?
- Remaining reservation call'ın conservative upper bound'ını karşılıyor mu?
- Applicable policy/revocation/version hâlâ geçerli mi?
- Provider/account/billing mode değişmiş mi?

Yetersiz remaining amount varsa atomic top-up istenir. Top-up denial provider call doğmadan HOLD üretir.

### 7.2 In-flight observation

Host runtime usage monitor token/cost evidence'i lease'e bağlar. Worker-authored `costUsd` canonical debit
değildir. Provider adapter/session store/envelope/host runtime evidence kaynakları exact attempt identity ile
join edilir; bugünkü measured source prensibi korunur (`src/core/execution-budget.ts:14-31`).

### 7.3 Landing

Budget exhaustion veya evidence unknown olduğunda:

- `SpendLease.state=landing`.
- New dispatch lanes kapanır.
- Active call terminal evidence'e kadar izlenir.
- Result truth korunur; incomplete work paused olur.
- FIX/fallback lane ayrı “ücretsiz” yol sayılmaz; yeni reservation ister.
- Healthy subscription/local provider lane, yalnız USD bucket exhaustion nedeniyle global durmaz; provider
  ve billing-mode locality korunur.

## 8. Settlement ve reconciliation

### 8.1 Normal settlement

1. Exact attempt terminal billing/usage evidence toplanır.
2. Actual billed amount fixed-point'e dönüştürülür.
3. Reservation actual kadar settle edilir.
4. Kullanılmayan amount bütün bucket'lardan atomik release edilir.
5. Lease terminal `settled` view'ına geçer.
6. Run/task receipt settlement ref'i taşır.

### 8.2 Spawn/dispatch olmadı

Provider actual-call receipt yoksa ve dispatch'in doğmadığı host authority ile kanıtlanıyorsa reservation
release edilir. Worker'ın “çağrı yapmadım” beyanı tek başına yeterli değildir.

### 8.3 Crash/unknown transport

Dispatch başladı fakat terminal billing bilinmiyorsa reservation korunur ve
`settlement_pending/reconciliation_required` olur. TTL yalnız recovery trigger'ıdır; para otomatik serbest
bırakılmaz. Provider receipts, process/container state ve invocation settlement authority ile reconcile edilir.

### 8.4 Late invoice adjustment

Provider invoice farkı immutable `invoice_adjustment` olarak yazılır. Negative adjustment mümkünse policy
ve evidence ile tiplenir; history overwrite edilmez. Adjustment budget'ı sonradan aşırsa yeni admissions
durur, geçmişte tamamlanmış work sahte başarısız yapılmaz.

## 9. Config ve migration modeli

### 9.1 Canonical config

Önerilen semantic shape:

```text
cost_limits.spend_gate.mode              = advisory | enforce
cost_limits.spend_gate.daily_max_usd     = decimal input → microUSD resolve
cost_limits.spend_gate.monthly_max_usd   = decimal input → microUSD resolve
cost_limits.spend_gate.timezone          = IANA timezone
cost_limits.spend_gate.override_policy   = never | scoped_approval
cost_limits.spend_gate.reservation_ttl   = bounded duration
cost_limits.spend_gate.landing_policy    = finish_inflight_pause_new
```

`off` için ayrı numeric zero uydurulmaz: policy absent olabilir; üst organization/provider-account policy'si
yine uygulanır. Explicit limit varsa mode açık ve schema-valid olmalıdır.

### 9.2 Legacy migration

| Legacy input | Migration davranışı |
|---|---|
| `enforce_spend_gate=false` | `mode=advisory`; deprecation receipt |
| `enforce_spend_gate=true` | Mevcut warning-only davranış sessizce hard-block'a flip edilmez; migration explicit owner confirmation ister ve final target `mode=enforce` olur |
| Legacy + yeni config uyumlu | Yeni config canonical; duplicate warning |
| Legacy + yeni config çelişkili | Typed config HOLD |
| Limits configured, mode absent | Versioned migration gerektirir; yeni schema'da config invalid |
| Numeric limit parse/precision overflow | Typed config HOLD; rounding yok |

Shadow/advisory ölçüm rollout'u yapılabilir; ancak authoritative ledger ve reservation wiring kapanmadan
`enforce`/DONE claim edilemez. Flag rollout rejected work'ü load/dispatch etmek için bypass değildir.

## 10. Override authority

### 10.1 Hard non-overridable scopes

- Provider billing account cap.
- Organization compliance cap.
- Owner tarafından `overridePolicy=never` işaretlenmiş policy.
- Billing/pricing/ledger evidence `unknown` durumu.

### 10.2 Scoped project override

Yalnız policy izin verirse ApprovalBroker receipt'i şunları bağlar:

- Principal/role ve tenant.
- Exact project ve budget policy ID/version.
- Exact period ID.
- Ek microUSD amount.
- Exact run/admission ID veya açıkça single-use grant.
- TTL, nonce, justification ve approver authority.
- Consume/revoke state.

Ordinary CLI `--force`, MCP boolean veya prompt text override authority değildir. Bulgu 11'deki approval
decision integrity gap kapanmadan bu capability enable edilemez; dependency typed HOLD'dur.

## 11. Failure/settlement matrisi

| Durum | Yeni admission | Aktif work | Budget state |
|---|---|---|---|
| Under limit, evidence known | Lease/ALLOW | Devam | Reserved |
| Daily veya monthly bucket yetersiz | Typed HOLD | Etkilenmez | Denial receipt |
| Concurrent race | Transaction kazanan allow, diğeri HOLD | — | Overspend yok |
| Pricing unknown | HOLD | New call yok | Evidence required |
| Billing mode unknown/hybrid unresolved | HOLD | New call yok | Authority unresolved |
| Ledger unavailable/corrupt | Metered API HOLD | In-flight call land eder | Reconciliation hold |
| Reservation remaining yetersiz | Top-up; deny ise HOLD | In-flight call kill edilmez | Landing |
| Spawn hiç doğmadı, host proof var | — | Yok | Reservation release |
| Transport outcome unknown | New admission bucket'ta durur | Reconcile | Reservation retained |
| Actual < reserved | — | Complete | Difference release |
| Actual > reserved | New admission stop/top-up | Completed work korunur | Overspend adjustment |
| Subscription/local task | USD bucket tüketmez | Quota/resource policy altında devam | Reference only |
| Approval service unavailable | Hard cap override yok | Existing lease değişmez | Fail-closed |
| Period boundary | Renew/split reservation | Call boundary'de kontrol | New period transaction |

## 12. File-by-file implementation planı

### W1 — Money, billing ve policy contracts

**Files:**

- `src/core/cost-config-loader.ts`
- `src/core/cost-calculator.ts`
- `src/core/provider-billing-evidence.ts`
- `src/core/config-types.ts`
- `src/core/config.ts`
- `src/core/errors.ts`

**İş:**

- Fixed-point `MoneyMicros` conversion/validation.
- Billed/reference/quota semantic types ve unknown states.
- Typed rolling policy, scope, period ve override policy.
- Legacy config migration/conflict semantics.
- Pricing snapshot identity ve conservative upper-bound contract.

**Kapanış kanıtı:** precision/overflow/negative/roundtrip; billing-mode matrix; unknown pricing; three-layer
config parity ve timezone validation.

### W2 — Budget ledger ve storage adapters

**Files:**

- Yeni canonical `src/core/budget-authority.ts` / mevcut pattern'e uygun modüller.
- Local SQLite adapter ve enterprise transactional adapter interface'i.
- Platform state-path/permission adapter'ları.
- Receipt/audit integration modülleri.

**İş:**

- Append-only entries, materialized bucket counters, period rows.
- Atomic multi-bucket reservation, top-up, release ve settlement.
- Idempotency, deterministic lock order, fencing ve recovery state.
- Host-owned permission/identity hardening; project worker write scope dışında storage.
- Corruption/version migration fail-closed davranışı.

**Kapanış kanıtı:** two-concurrent-request overspend test; partial-commit impossibility; crash/reopen;
idempotent retry; multi-tenant/account isolation; SQLite WAL contention; enterprise adapter contract suite.

### W3 — Admission resolver ve `SpendLease`

**Files:**

- `src/core/cost-gate.ts`
- `src/core/execution-budget.ts`
- `src/core/provider-execution-ingress-authority.ts`
- `src/core/execution-admission.ts` / `task-execution-admission.ts`
- Provider account/limit authority modülleri.

**İş:**

- Existing estimate gate'i policy input/upper-bound producer olarak kullan; rolling authority sayma.
- Applicable scopes ve exact provider account fingerprint çöz.
- Atomic reservation ve lease mint.
- Lease/dispatch identity binding, TTL, fence ve parent-child narrowing.
- `--force`/acknowledgeCost'u rolling hard cap'ten ayır.

**Kapanış kanıtı:** mismatched provider/account/run/task/attempt; lease replay/expiry; child double-spend;
unknown ledger/pricing fail-closed.

### W4 — Bütün production ingresslere wiring

**Files/surfaces:**

- `src/cli/commands/start.ts`
- `src/mcp/tools/start.ts`
- `src/cli/commands/resume.ts`
- Goal/Mission/Flow/Run/Do ve task-mode ingressleri.
- `src/orchestra/sprint-controller.ts`, `sprint-spawner.ts`, scheduler/continuous dispatch.
- Retry/FIX/XFIX/fallback ve autonomous dispatcher.
- XVerify execution ingress; verifier ayrı provider olsa da ayrı budget lease ister.

**İş:**

- Plan estimate → BudgetAuthority reservation → exact dispatch claim zinciri.
- Fire-and-forget/detached child'a serialized lease reference; child kendi reserve claim'i üretemez.
- Resume, fallback veya retry eski lease'i farklı attempt identity ile replay edemez.
- Subscription/local lanes USD exhaustion nedeniyle global durmaz.

**Kapanış kanıtı:** repo-wide production call graph; her actual provider-call receipt'in matching spend
lease/reservation ref'i; ingress parity matrix.

### W5 — Runtime consumption, landing ve settlement

**Files:**

- `src/orchestra/result-collector.ts`
- `src/orchestra/runtime-budget-monitor.ts`
- `src/orchestra/execution-landing-coordinator.ts`
- `src/orchestra/sprint-finalizer.ts`
- `src/core/task-result-settlement.ts`
- Invocation/provider billing receipt stores.

**İş:**

- Host-measured usage'u exact lease'e debit et.
- Remaining reservation ve top-up kontrolünü provider-call boundary'ye koy.
- `runBudgetHold` semantiğini scoped budget landing state ile birleştir.
- Active call finish/new dispatch stop/pause contract'ı.
- Terminal billed evidence ile settle/release; unknown transport reconciliation.
- Financial settlement eksikken outer COMPLETE'i engelleyen typed state.

**Kapanış kanıtı:** actual lower/higher; in-flight landing; FIX/fallback under hold; transport unknown;
crash recovery; subscription locality.

### W6 — Approval override, i18n ve user surfaces

**Dependency:** Bulgu 11 approval decision integrity kapanmadan override enable edilmez.

**Files:**

- Runtime-wide ApprovalBroker/authorization contractları.
- `src/cli/helpers/messages.ts`
- CLI/MCP/API/terminal/status/dashboard cost projections.
- `src/cli/commands/limits.ts` ve cost/resources surfaces.

**İş:**

- Scoped one-time override request/decision/consume/revoke receipt.
- Binding bucket, period, requested/reserved/available/settled amounts gösterimi.
- Unknown/pending/disputed evidence'i `$0` gibi göstermeme.
- Tüm user-facing stringleri `getMessage(key, lang)` üzerinden üretme.

**Kapanış kanıtı:** unauthorized/expired/replayed/wrong-period override negative tests; en/tr parity; secret-
free audit projection.

### W7 — Migration, docs ve real-binary/platform proof

**Files:**

- Cost config migrations ve doctor/status commands.
- EN/TR cost/security/operations dokümanları.
- Hermetic integration/e2e suites.

**İş:**

- Legacy key inventory + explicit migration preview/confirmation.
- Existing JSONL spend projection'ını observability-only olarak etiketle; financial authority iddiasını kaldır.
- Async-spawn real binary ile concurrent two-run admission proof.
- Solo SQLite, multi-process, macOS/Linux/Windows native/WSL path/lock behavior.
- Enterprise adapter contract ve simulated multi-host transaction proof.
- Fresh different-provider XVerify; unavailable ise typed HOLD.

**Kapanış kanıtı:** gerçek binary'de iki concurrent run ceiling'i aşamaz; active run kill olmadan new dispatch
durur; restart sonrası reservation kaybolmaz; final user surface doğru reason/amount gösterir.

## 13. Dependency DAG ve rollout

```text
W1 money/policy ───────────────┐
                               ├─→ W3 admission/lease ─→ W4 all-ingress wiring
W2 ledger/adapters ────────────┘                         │
                                                        ▼
                                          W5 landing/settlement
                                                        │
                      Bulgu 11 / APPROVAL integrity ─→ W6 override/surfaces
                                                        │
                                                        ▼
                                           W7 migration/proof
```

- W1 ve W2 file ownership ayrılırsa paralel olabilir.
- W3, W1 fixed-point/billing semantics ve W2 transaction contractı kapanmadan başlamaz.
- W4, canonical ingress inventory ile tek closure task'ıdır; yalnız CLI/MCP wiring settlement değildir.
- W5 olmadan active work graceful landing/settlement kanıtlanamaz.
- W6 override yolu Bulgu 11'e hard dependency'dir; dependency yoksa hard caps non-overridable kalır.
- W7 real-binary kanıtı olmadan default flip ve DONE yoktur.

### Rollout ratchet

1. **Observe:** Existing spend sources inventory edilir; authoritative olmayan kayıtlar etiketlenir.
2. **Shadow reservation:** Atomic ledger decision üretir fakat yalnız explicitly advisory policy'de block
   user flow'u değiştirmez; rejected execution yine “enforced” diye sunulmaz.
3. **Enforce opt-in:** Owner-approved projects/tenants gerçek lease ister; false positive/landing ölçülür.
4. **Strict policy:** Explicit hard ceiling taşıyan new schema configs `enforce` semantics'e geçer.
5. **Legacy retirement:** Yanıltıcı boolean ve JSONL financial-authority claim'i kaldırılır.

Her aşama aynı canonical ledger/decision code path'ini kullanır; shadow ve enforce için ayrı math
implementasyonu yoktur. Audit stage nihai DONE state değildir.

## 14. Acceptance ve release gates

`LIMIT-SPEND-ENFORCE-001` aşağıdakilerin tamamı kanıtlanmadan DONE olamaz:

1. `enforce` mode rolling breach'te typed hard HOLD üretir; warning-only continuation yok.
2. Authoritative settled spend producer, reservation store ve terminal settlement consumer production'da bağlıdır.
3. Spend = settled + outstanding reservations + requested upper bound atomik hesaplanır.
4. Concurrent admissions configured ceiling'i aşamaz.
5. Provider/account/org/tenant/project/run/task applicable buckets all-or-nothing reserve edilir.
6. Metered API provider call matching unexpired/fenced `SpendLease` olmadan doğamaz.
7. Retry/FIX/fallback/resume/nested/XVerify eski lease'i replay ederek bütçeyi atlayamaz.
8. Active call zorla kill edilmez; new dispatch durur ve run typed pause/hold'a land eder.
9. Subscription/free-tier/local reference cost billed USD bucket'ına yazılmaz.
10. Unknown/hybrid billing veya unknown pricing `$0` sayılmaz; typed HOLD üretir.
11. Canonical money arithmetic lossless fixed-point'tir.
12. Ledger project worker authority'si dışındadır ve restart/crash sonrası durable'dır.
13. Period timezone/DST/boundary semantics deterministic'tir.
14. Settlement unknown ise reservation otomatik release edilmez; reconciliation gerekir.
15. Ordinary `--force` rolling hard cap'i geçemez.
16. Approval override exact amount/scope/period/TTL/nonce ile bağlıdır; Bulgu 11 kapanmadan disabled'dır.
17. CLI, MCP, terminal, API/status ve dashboard aynı typed budget truth'u gösterir; i18n parity vardır.
18. Real-binary concurrent-run ve graceful-landing proof'u geçer.
19. Different-provider XVerify evidence chain'i değerlendirir; same-provider self-verify yoktur.

## 15. Explicit non-goals ve yanlış COMPLETE iddiaları

Bu paket tek başına şunları çözmez:

- Provider'ın kendi invoice API'si veya quota endpoint'i yoksa authoritative external invoice doğurmak.
- Subscription provider quota authority — ayrı provider-limit domainidir.
- Approval decision-file integrity — Bulgu 11 / `APPROVAL-001`.
- Storage/compute/operator cost'unu provider billed USD ile birleştirmek — `COST-001` parent kapsamı.
- Harici finance/ERP settlement — connector authority gerekir.

4091 DONE olduğunda doğru claim:

> “Configured rolling billed-USD ceilings, bütün metered provider execution ingresslerinde atomic
> reservation/settlement ve graceful landing ile enforce edilir.”

Şu claim'ler parent authority'ler kapanmadan yasaktır:

- “All provider quotas are enforced.”
- “Dashboard estimate equals provider invoice.”
- “All operational costs are covered by the USD budget.”
- “Any `--force` or approval can bypass organization/account hard caps.”

## 16. Diğer session için doğrudan plan girdisi

**Goal:** `LIMIT-SPEND-ENFORCE-001` — rolling daily/monthly billed-USD ceilings için host-owned atomic
BudgetAuthority ve spend-lease enforcement zincirini kur.

**Mission outcome:** Metered API provider work, applicable account/org/tenant/project/run ceilingsinden
all-or-nothing reservation almadan doğamasın; runtime usage lease'e debit edilsin; breach active call'ı
öldürmeden yeni dispatch'i durdurup typed PAUSED/HOLD'a land etsin; terminal billing settle/release/reconcile
edilsin.

**Work packages:** W1 Money/policy → W2 Ledger/adapters → W3 Admission/lease → W4 All-ingress wiring →
W5 Landing/settlement → W6 Approval/i18n/surfaces → W7 Migration/real-binary/XVerify proof.

**Required dependency context:** 4091 doğrudan; 4090 unified limit parent; 4000 authority composition;
4070 receipt integrity; 4050/Bulgu 11 approval integrity; 10060 broader cost authority; 4190 OWASP evidence.

**Settlement rule:** Unit math green veya CLI warning değişikliği yeterli değildir. Policy producer → atomic
ledger/reservation → exact provider ingress → runtime consumption/landing → terminal billing settlement →
status/audit/user projection zinciri, concurrent real-binary evidence ve different-provider XVerify ile
kapanmalıdır.
