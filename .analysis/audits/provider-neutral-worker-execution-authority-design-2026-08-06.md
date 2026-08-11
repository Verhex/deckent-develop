# Provider-Neutral Worker Execution Authority — Tool, Sandbox, Staging ve Landing Handoff (2026-08-06)

> **Karar durumu:** KABUL EDİLDİ — Alperen, 2026-08-06 OWASP Agentic Top 10 bağımsız
> inceleme oturumu, Bulgu 4.
>
> **Implementation durumu:** Bu oturumda production kodu değiştirilmedi. Bu doküman başka bir
> Deckent session'ında Goal/Mission/Flow/Run planına alınacak implementation authority girdisidir.
>
> **Canonical ledger:** `TOOL-AUTHORITY-001` (order 4060), parent `AUTHORITY-001` (4000);
> ilişkili `OPERATION-001` (4030), `CAPABILITY-001` (4040), `APPROVAL-001` (4050),
> `RECEIPT-001` (4070), `TRUST-HANDOFF-001` (4180), `ENV-ADAPTER-001` (8010),
> `CODEX-C3` (1270), `P02-640` (2100), `KERNEL-SETTLEMENT-001` (3040),
> `TEST-CONTAINMENT-001` (75) ve `SEC-OWASP-ASI-001` (4190).

## 1. Sonuç — tek cümle

Deckent worker'ları provider CLI permission flag'lerine veya agent'ın dürüstlüğüne güvenerek canonical
project root'a doğrudan yazmayacak; her attempt host-signed bir capability envelope altında immutable input
snapshot + isolated Copy-on-Write staging workspace içinde çalışacak, dış etkiler canonical Tool Gateway'den
geçecek ve yalnız host-owned LandingAuthority doğrulanmış scope diff'ini transactional receipt ile canonical
worktree'ye taşıyabilecek.

## 2. Bugünkü code-truth baseline

### 2.1 Provider ve backend routing gerçeği

| Alan | Bugünkü gerçek | Enforcement hükmü |
|---|---|---|
| Global backend default | `createDefaultConfig()` `spawn_backend: 'docker'` üretir (`src/core/config.ts:1613-1624`) | Default Docker seçimi |
| Adapter provider listesi | Codex, Gemini, Ollama ve OpenRouter host-adapter provider kabul edilir (`src/orchestra/sprint-utils.ts:155-162`) | Routing contract |
| Default adapter bypass | Task üzerinde açık `Backend:` yoksa adapter provider configured Docker'ı bypass eder (`src/orchestra/sprint-spawner.ts:990-1037`) | **Host execution** |
| Forced backend | Task-level `Backend: docker|tmux|subprocess` adapter provider'ı seçili backend'e zorlayabilir (`src/orchestra/sprint-spawner.ts:1001-1024`) | Per-task override |
| Generic request default | Execution request builder `autoApprove` verilmezse `true` çözer (`src/orchestra/execution-request-builder.ts:160-178`) | Autonomous default |

`spawn_backend: docker` değeri bu nedenle “bütün provider worker'ları Docker içindedir” anlamına gelmez.
Provider routing ile execution-environment routing iki ayrı axis'tir; bugünkü path bunları bazı provider'lar
için yeniden birleştirip host adapter'ı önceliklendirir.

### 2.2 Provider-native tool ve approval gerçeği

| Provider/path | Bugünkü davranış | Task-scoped write authority |
|---|---|---|
| Claude command spec | `--allowedTools` ve `--tools` desteklenir; full autonomy `--dangerously-skip-permissions` (`src/core/provider-command-spec.ts:97-117`) | Yalnız native tool calls |
| Codex Docker/tmux spec | `allowedToolsFlag: null`; external sandbox varsayımıyla `--dangerously-bypass-approvals-and-sandbox` (`src/core/provider-command-spec.ts:119-136`) | Yok |
| Gemini Docker/tmux spec | `allowedToolsFlag: null`; full autonomy `yolo + skip-trust` (`src/core/provider-command-spec.ts:138-152`) | Yok |
| Codex host adapter | `codex exec --full-auto` ile project cwd'de spawn (`src/providers/codex.ts:192-238`, `:575-588`) | Provider-owned broad workspace sandbox; `filesWrite` yok |
| Gemini host adapter | `--approval-mode yolo --skip-trust` koşulsuz worker args (`src/providers/gemini.ts:325-360`, `:531-544`) | Deckent filesystem boundary yok |
| Claude subprocess/tmux | Caller `allowedTools` taşır; `autoApprove` true ise permission bypass eklenir (`src/providers/subprocess.ts:121-164`; `src/orchestra/tmux.ts:145-201`) | Claude tool API sınırı |
| Docker raw worker | Backend provider fark etmeksizin command'i `autoApprove: true` ile kurar (`src/orchestra/spawn-backend-docker.ts:5357-5387`) | External container'a güvenilir |

Provider-native approval prompt'u human interaction UX'idir; Deckent capability authority'si değildir.
Özellikle `autoApprove`, “owner bu exact effect'i yetkilendirdi” anlamına gelmez.

### 2.3 Docker filesystem ve isolation gerçeği

| Kontrol | Bugünkü davranış | Sınıf |
|---|---|---|
| Container user | Host UID/GID ile non-root çalıştırılır (`src/orchestra/spawn-backend-docker.ts:5647-5653`) | **ENFORCED** when Docker path |
| Resource caps | Memory ve swap Docker args'a eklenir (`src/orchestra/spawn-backend-docker.ts:5655-5658`) | **ENFORCED** when Docker path |
| Ephemeral HOME | Container HOME tmpfs'tir (`src/orchestra/spawn-backend-docker.ts:5659-5660`) | **ENFORCED** when Docker path |
| Canonical project | Normal worker'da bütün project root `/workspace` altına read-write bind mount edilir (`src/orchestra/spawn-backend-docker.ts:5661-5665`) | **Broad RW** |
| Git metadata | Worktree/common git metadata read-only overlay edilir (`src/orchestra/spawn-backend-docker.ts:5666-5670`) | Targeted **ENFORCED** |
| `dist/` | Mevcutsa nested read-only overlay (`src/orchestra/spawn-backend-docker.ts:5638-5645`, `:5671-5674`) | Targeted **ENFORCED** |
| `.deck` | Mevcut secret file empty read-only shadow ile gizlenir (`src/orchestra/spawn-backend-docker.ts:5625-5636`, `:5675-5677`) | Targeted **ENFORCED** |
| Git commands | Destructive subcommand denylist shim'i read-only mount edilir (`src/orchestra/spawn-backend-docker.ts:5388-5406`, `:5678-5679`) | Narrow denylist |
| `.tasks/` | Bütün shared `.tasks/` path'i read-write ayrıca mount edilir (`src/orchestra/spawn-backend-docker.ts:5682-5683`) | Worker-visible control state |
| `.locks/` | Normal worker'a shared `.locks/` read-write mount edilir (`src/orchestra/spawn-backend-docker.ts:5684-5687`) | Worker-visible coordination state |

Docker dış host filesystem'ini ve bazı secret/control surfaces'i daraltır; fakat task'ın canonical worktree
üzerindeki write scope'unu mekanik olarak uygulamaz. Project bind mount'unun tamamı writeable olduğu için
provider-native shell veya arbitrary child process, exact `filesWrite` listesinden bağımsız yazabilir.

### 2.4 Claude allowlist gerçeği

Docker backend task JSON'dan write grant'i yeniden türetir. `filesWrite` varsa directory read-context'i write
grant'e katılmaz; `.tasks/` her durumda eklenir (`src/orchestra/spawn-backend-docker.ts:3529-3575`). Bu,
caller'ın broad directory grant'ini daraltan değerli bir correction'dır.

Fakat grant'in sonunda unscoped `Bash` bulunur:

`Read,Write(scoped),Edit(scoped),Bash,Glob,Grep`

Dolayısıyla:

- Claude native `Write`/`Edit` tool path filtering: **ENFORCED**.
- Bütün filesystem mutation boundary olarak aynı allowlist: **ADVISORY/PARTIAL**.
- Shell redirect, interpreter, package script veya helper binary aynı project RW mount üzerinde scope dışı
  değişiklik yapabilir.

Task JSON missing/malformed olduğunda scope resolution spawn'ı bloklamak yerine caller-supplied fallback'e
döner (`src/orchestra/spawn-backend-docker.ts:6384-6407`). Authority kaynağı olarak bu path **fail-open**'dır.

### 2.5 Alternatif “sandbox” backend gerçeği

`SandboxSpawnBackend`, working directory'nin configured `allowedDirs` içinde olduğunu spawn öncesi doğrular;
tek tek worker output path'lerini sınırlamaz (`src/providers/sandbox.ts:49-68`, `:89-106`). Network block,
proxy env vars'ını loopback port zero'ya yönlendiren best-effort mekanizmadır
(`src/providers/sandbox.ts:108-133`). Bu backend:

- project cwd containment kontrolü: **CONFIG-GATED**;
- exact write scope: **YOK**;
- network isolation: **ADVISORY/best-effort**;
- OS-level sandbox: **YOK**.

### 2.6 Baseline hükmü

Bugünkü yapı provider-specific defense-in-depth kontrolleri taşır; ancak persistent effect authority
canonical project root'a process birth anında devredilir. `filesWrite` planner/prompt/tool-filter contractıdır,
host-enforced effect boundary değildir.

Önceki Bulgu 4 hükmü **PARTIAL**'dır:

- Codex/Gemini için Deckent task-scoped write enforcement yokluğu: **CONFIRMED**.
- Claude `Bash` grant'inin `Write/Edit` path sınırını bütün filesystem boundary olarak geçersiz kılması:
  **CONFIRMED**.
- Üç provider'ın bütün sandbox/guardrail'lerinin aynı biçimde kapalı olduğu iddiası: **PARTIAL**; Claude
  Docker external containment alır, Codex host `full-auto` broad workspace sandbox taşır, fakat hiçbiri ortak
  `filesWrite` authority değildir.

## 3. Korunan varlıklar ve threat model

### 3.1 Korunan varlıklar

- Canonical project files ve owner'ın pre-existing dirty changes'i.
- `.git`, `.deckent`, `.tasks`, `.locks`, `.brain`, provider settings ve execution policy state.
- Host HOME, global credentials, SSH/GPG material, cloud/session tokens ve platform key stores.
- Başka tenant/project/attempt/workers'ın files, locks, mailboxes ve receipts'i.
- Docker/Podman/container runtime socket'i, daemon control API'leri ve host devices.
- Network destinations, package registries, MCP servers, databases, ERP/cloud resources ve messaging.
- Provider/model execution identity, prompt snapshot, tool profile ve resulting diff provenance.
- Approval, budget, audit, landing ve settlement authority chain'i.

### 3.2 Adversary sınıfları

| Sınıf | Yetenek | Beklenen savunma |
|---|---|---|
| A1 Prompt injection | Repo/doc/web/MCP content üzerinden tool/shell yönlendirme | Provider-neutral containment + capability gate |
| A2 Rogue model | Scope'u bilerek aşar, result/heartbeat'i manipüle eder | Canonical root inaccessible; OOB supervisor |
| A3 Malicious repository | Scripts, hooks, compiler/plugin/package lifecycle içinde code execution | Isolated staging; external effects gated |
| A4 Compromised provider CLI | Arbitrary child process ve filesystem/network access dener | OS/OCI boundary + egress proxy + no ambient secret |
| A5 Concurrent worker | Sibling edits/locks/results'i okur veya değiştirir | Per-attempt workspace/mailbox; landing CAS |
| A6 Local unprivileged user/process | Worker artifacts ve sockets'e erişmeye çalışır | Platform ACL/namespace/identity isolation |
| A7 Tenant admin | Kendi tenant authority'sini başka tenant'a taşır | Tenant-bound capability envelope and receipts |
| A8 Host/root admin | Local boundary'nin tamamını yönetir | Honest assurance ceiling; remote runner/external audit |

### 3.3 Güvenlik invariant'ları

1. Worker process canonical project root'a write handle/mount alamaz.
2. Worker canonical control-plane state'e write authority alamaz.
3. Capability envelope doğrulanmadan process birth gerçekleşemez.
4. Provider-native permissions canonical authorization kararı olamaz.
5. Persistent project mutation yalnız LandingAuthority üzerinden olur.
6. Landing, exact attempt + input snapshot + policy digest + approval refs'e bağlıdır.
7. Scope dışı staging diff canonical root'a hiçbir koşulda geçmez.
8. Missing enforcement facet silent host fallback üretmez.
9. External network/tool effect'i ambient process capability'si olamaz.
10. Worker-authored result, heartbeat, filesChanged veya exit code tek başına settlement authority değildir.
11. Break-glass grant süreli, single-attempt, explicit ve compliance-ineligible'dır.
12. Platform unsupported state typed `HOLD` olur; “çalışmış gibi” davranılmaz.

## 4. Kabul edilen mimari kararlar

### D1 — Canonical root worker'a hiçbir zaman RW verilmez

Normal implementation worker'ı canonical checkout/worktree path'ini writable görmez. Bu kural Claude,
Codex, Gemini, local model, remote agent runtime ve gelecekteki provider'ların tamamı için aynıdır.

Provider veya backend'e özel istisna yoktur. Docker kullanmak tek başına bu invariant'ı sağlamaz; Docker
mount planı da aynı canonical policy'den türetilir.

### D2 — Provider flag'leri authority değil defense-in-depth'tir

`--allowedTools`, `--tools`, Codex sandbox modes, Gemini approval modes ve future provider permission flags:

- visible tool surface'i küçültebilir,
- accidental misuse'u azaltabilir,
- provider UX prompt'larını yönetebilir,
- conformance evidence üretebilir.

Fakat Deckent `ENFORCED` claim'i bunların hiçbirine tek başına dayanmaz.

### D3 — Shell korunur, contained workspace'e kapatılır

Coding worker için shell zorunlu bir capability'dir. Test, formatter, compiler, repository tool ve local
service lifecycle shell/process çalıştırmayı gerektirir.

Doğru sınır shell command adı veya denylist değildir. Doğru sınır:

- isolated attempt workspace,
- constrained process tree,
- bounded resources,
- default-deny external egress,
- no ambient host secret,
- canonical root'a write path yokluğu,
- host-owned landing transaction'ıdır.

### D4 — Her attempt process-birth öncesi Capability Envelope alır

Envelope immutable, attempt-bound, expiring, single-use ve policy-digest-bound olur. Host authority envelope
olmadan execution environment hazırlamaz ve provider CLI doğurmaz.

Envelope, prompt içindeki scope metninden veya task JSON'un worker tarafından okunmasından türetilmez;
canonical plan/operation/capability authority tarafından host-side çözülür.

### D5 — Input immutable snapshot, work Copy-on-Write staging'dir

Worker, dispatch anındaki exact repository/input snapshot'ini görür. Değişiklikleri per-attempt CoW overlay,
clone veya isolated workspace'e yazar. Canonical checkout hiçbir mount/handle üzerinden writable değildir.

Performance implementation'ı platforma göre reflink, overlay, virtual disk, block clone veya remote CAS
kullanabilir; semantic contract değişmez.

### D6 — Persistent mutation'ın tek yolu LandingAuthority'dir

Worker çıktısı “apply edilecek proposal”dır. Host:

1. process ve staging finality'sini doğrular,
2. exact diff'i independent olarak üretir,
3. paths/effect classes/policy/approval/budget'i doğrular,
4. canonical root generation ve dirty-state CAS yapar,
5. allowed patch'i transactional uygular,
6. post-apply digest doğrular,
7. immutable landing receipt üretir,
8. ancak sonra task settlement'a izin verir.

### D7 — External effects ToolAuthority Gateway üzerinden geçer

Network, MCP, git remote, package mutation, secret access, messaging, database, cloud/ERP, browser/computer-use
ve child-agent spawn ambient worker yetkisi değildir. Provider tool request'i canonical operation'a çevrilir;
Capability/Approval/Budget/Audit authorities karar verir ve effect host-owned adapter tarafından uygulanır.

### D8 — Provider/backend conformance tier'ları explicit'tir

Her provider × version × backend × platform kombinasyonu runtime evidence ile tier alır:

- `BROKERED_TOOLS`
- `CONTAINED_NATIVE_TOOLS`
- `READ_ONLY_CONTAINED`
- `UNCONTAINED`
- `UNAVAILABLE`

Catalog support ile runtime conformance karıştırılmaz. CLI binary'nin varlığı, secure execution support kanıtı
değildir.

### D9 — `autoApprove` authorization değildir

`autoApprove`, yalnız provider CLI interaction modelini non-interactive yapar. Yalnız verified external
containment + capability envelope altında kullanılabilir. ApprovalBroker receipt'i olmadan yüksek-riskli
effect yetkisi açmaz.

### D10 — Provider auth worker tool surface'ine ambient secret olarak verilmez

Mümkün olan provider'larda inference credential/control host broker veya isolated sidecar'da tutulur. CLI'nin
zorunlu olarak credential material görmesi gereken provider path'i:

- task-scoped/short-lived credential,
- provider endpoint-only egress,
- no shell-readable foreign credential,
- explicit lower assurance tier,
- enterprise policy'de brokered alternative gereksinimi

ile tiplenir. Subscription session home'unu bütün olarak mount etmek yasaktır.

### D11 — Network default-deny ve destination-aware'dır

Worker network namespace/process policy:

- provider inference endpoint'ine yalnız controlled proxy üzerinden,
- task local loopback'e policy ile,
- approved external operations'a Tool Gateway üzerinden,
- diğer bütün destinations'a default deny

uygular. Proxy environment trick'i network enforcement sayılmaz.

### D12 — Heartbeat/result/control channel worker'dan bağımsızdır

Worker bütün `.tasks/` veya `.locks/` ağacını RW görmez. Her attempt için minimum mailbox/output endpoint'i
verilir; host supervisor heartbeat, process state, deadline ve resource truth'ünü out-of-band üretir.

Worker proposal/result payload'u untrusted input olarak parse edilir. Sibling task artifacts görünmez.

### D13 — Runtime identity immutable evidence'a bağlanır

Execution receipt en az image/binary digest, CLI version, provider command profile, tool schema digest,
environment adapter identity ve enforcement facets'i taşır. Mutable image tag veya PATH resolution tek başına
runtime identity değildir.

### D14 — Enforcement eksikliğinde fail-closed

Scope parse failure, unsupported mount projection, missing OS facet, unverifiable runtime, broken egress
gateway, unavailable landing CAS veya supervisor loss:

- process doğmadan `HOLD`, ya da
- process doğduysa immediate containment + `HOLD`

üretir. Caller-supplied broad grant'e veya host subprocess'e sessiz fallback yapılmaz.

### D15 — Every-environment aynı contract'ı uygular

Platform adapter implementation'ları farklı olabilir; policy outcome ve receipt vocabulary aynıdır.
Unsupported platform dürüstçe fail eder. Windows/macOS/WSL daha sonra eklenecek ikincil hedef değildir;
contract, adapter matrix ve acceptance baştan birlikte tasarlanır.

### D16 — Concurrency input snapshot ve landing CAS ile çözülür

Her attempt exact base generation/digest'e bağlıdır. Sibling worker canonical root'u canlı paylaşmaz. Landing
sırasında:

- base unchanged ise apply,
- non-overlapping owner/sibling change varsa policy-bound rebase/recompute,
- overlapping change varsa conflict/HOLD,
- stale attempt hiçbir zaman last-writer-wins yapmaz.

### D17 — Break-glass normal execution mode değildir

Uncontained host execution yalnız owner'ın exact attempt için verdiği, expiring ve single-use attended
approval ile mümkün olabilir. Receipt açıkça `uncontained_break_glass` yazar; autonomous mode, enterprise
compliance, training promotion ve safe-execution metrics'e dahil edilmez.

### D18 — Rollout gözlemden enforcement'a ratchet'tir; final target enforce'tur

`observe` ve `shadow`, production claim değil rollout evidence mode'larıdır. Tam architecture bütün
platform contracts ve negative proof'larla doğduktan sonra default `enforce` olur. Shadow'da çalışan
uncontained mutation “secure” veya `ENFORCED` sayılamaz.

## 5. Hedef architecture

### 5.1 Authority flow

```text
Canonical Plan / Operation
          │
          ▼
Principal + Tenant + Capability + Approval + Budget
          │
          ▼
WorkerCapabilityEnvelopeAuthority ── immutable pre-birth receipt
          │
          ▼
ExecutionEnvironmentAuthority ───── platform adapter / runtime identity
          │
          ├── immutable input snapshot
          ├── per-attempt CoW staging workspace
          ├── bounded process tree
          ├── egress proxy / Tool Gateway
          └── OOB supervisor
          │
          ▼
Provider CLI / Agent Runtime ─────── untrusted proposal producer
          │
          ▼
Staging finality + host-computed diff
          │
          ▼
LandingAuthority ────────────────── scope/policy/CAS/approval validation
          │
          ├── DENY/HOLD + discard/quarantine
          └── transactional apply + LandingReceipt
                              │
                              ▼
                     Task Settlement Authority
```

### 5.2 Canonical components

| Component | Tek sorumluluk | Trust konumu |
|---|---|---|
| `WorkerCapabilityEnvelopeAuthority` | Exact attempt için executable grants'i çözmek ve mühürlemek | Host control plane |
| `RuntimeConformanceAuthority` | Provider/backend/platform tuple'ın gerçek tier/facets'ini kanıtlamak | Host + signed runtime evidence |
| `ExecutionEnvironmentAuthority` | Snapshot, staging, process, network, secret ve supervisor planını kurmak | Platform adapter boundary |
| `WorkspaceProjectionAuthority` | Immutable input + CoW writable view + output classes | Host/remote executor |
| `ToolAuthorityGateway` | External tool intent → operation decision → effect receipt | Host service |
| `ProcessSupervisor` | Birth, descendants, resource, deadline, termination ve finality truth | Worker dışı |
| `LandingAuthority` | Staging proposal'ını canonical mutation'a dönüştüren tek writer | Host control plane |
| `ExecutionAuditBridge` | Envelope/decision/effect/landing/settlement audit zinciri | Canonical AuditAuthority |

Mevcut `src/core/capability-*`, `src/core/execution-landing-*` ve
`src/orchestra/execution-landing-coordinator.ts` bu architecture'ın foundation girdileridir; paralel ikinci
capability veya landing engine yazılmaz.

## 6. Normative contracts

### 6.1 WorkerCapabilityEnvelope V1

| Alan | Zorunluluk |
|---|---|
| `schemaVersion` | Exact supported version; unknown future version reject |
| `envelopeId` | Globally unique immutable ID |
| `tenantId/projectId` | Canonical scoped identity; raw path değil |
| `flowId/runId/workItemId/taskId/attemptId` | Full execution lineage |
| `principalRef` | VerifiedPrincipal reference + assurance level |
| `operationSet` | Canonical operation IDs ve effect classes |
| `provider/model/backend/platform` | Requested ve resolved exact identities |
| `runtimeProfileRef` | Binary/image/tool-profile digest evidence |
| `inputSnapshotRef` | Immutable base digest/generation |
| `readSet` | Readable repository/resources |
| `landingWriteSet` | Canonical root'a land edilebilecek exact resources |
| `ephemeralWriteSet` | Staging içinde yazılabilir fakat discard edilen outputs |
| `prohibitedSet` | Control-plane, secret, foreign tenant ve dangerous resources |
| `toolGrants` | Brokered/native tool IDs, operations ve quotas |
| `networkPolicyRef` | Egress destinations, methods, bytes, DNS/TLS policy |
| `secretGrantRefs` | Opaque handles; raw secret değil |
| `processPolicy` | Executable classes, descendants, PID/resource/deadline ceilings |
| `budgetRef` | Token/cost/time/tool budgets |
| `approvalRefs` | Applicable durable approvals/break-glass receipts |
| `policyDigest` | Effective authority/config snapshot digest |
| `issuedAt/expiresAt/nonce` | Short lifetime + replay resistance |
| `issuerRef/signature` | Host authority binding |

Envelope worker tarafından genişletilemez. Worker'ın prompt/result içinde sunduğu scope, tools veya approval
claim'leri envelope'ı değiştirmez.

### 6.2 RuntimeConformanceEvidence

| Facet | Beklenen evidence |
|---|---|
| Runtime identity | Immutable image digest veya verified binary digest/version |
| Canonical-root isolation | Worker namespace'te RW handle/mount olmadığının adapter proof'u |
| Input immutability | Snapshot digest + RO/base projection evidence |
| Staging isolation | Per-attempt unique workspace/mount/ACL identity |
| Process containment | Root process + descendant ownership/fencing |
| Network containment | Namespace/proxy/policy identity ve deny proof |
| Secret isolation | Ambient env/HOME/foreign secret absence evidence |
| Control-plane isolation | `.tasks`, locks, audit, Docker socket, daemon surfaces absence |
| Tool profile | Provider-visible/native/brokered tool schema digest |
| Supervisor | OOB liveness/termination authority reference |
| Landing support | Exact diff extraction + host CAS/apply capability |

Tier resolver missing veya stale facet'te daha güçlü tier claim edemez.

### 6.3 WorkspaceProjection

| Alan | Anlam |
|---|---|
| `projectionId` | Per-attempt isolated workspace identity |
| `baseSnapshotRef` | Immutable repository/content snapshot |
| `baseGeneration` | Canonical root concurrency generation |
| `stagingRootRef` | Worker-visible non-canonical path/volume |
| `mountPlanDigest` | RO/RW/tmpfs/device/socket planı |
| `pathSemantics` | Platform case/Unicode/separator/link rules |
| `ephemeralOutputs` | Cache/build/test/temp classes |
| `retentionPolicy` | Success/failure/quarantine retention |
| `destroyCapabilityRef` | Exact workspace cleanup authority |

### 6.4 ToolGrant

Her grant şu boyutları birlikte taşır:

- canonical operation ID,
- tool ID/version/provider translation,
- resource selector,
- read/write/effect class,
- allowed arguments veya schema constraints,
- destination/tenant/project scope,
- quota/budget/deadline,
- approval requirement,
- idempotency/replay rule,
- audit/redaction class,
- native veya brokered execution mode.

String `Read,Write,Bash` listesi tek başına ToolGrant değildir.

### 6.5 LandingProposal ve LandingReceipt

Worker `LandingReceipt` üretemez. Worker yalnız untrusted proposal/output bırakır. Host receipt şu truth'ü
bağlar:

- envelope/attempt/runtime/projection refs,
- base snapshot ve canonical pre-landing generation,
- host-computed file/content diff digest,
- allowed, ephemeral, prohibited ve unexpected change sets,
- policy/approval/budget decisions,
- conflict/rebase outcome,
- applied patch/content digest,
- canonical post-landing generation,
- audit record/checkpoint refs,
- terminal outcome.

## 7. Filesystem authority modeli

### 7.1 Üç ayrı write class

| Class | Örnek | Davranış |
|---|---|---|
| `landing` | Task'ın exact source/doc output'ları | Host validation sonrası canonical root'a taşınabilir |
| `ephemeral` | build, coverage, cache, temp, package-manager scratch | Staging içinde serbest; canonical root'a taşınmaz |
| `prohibited` | policy, credentials, control state, foreign scope | Access/write attempt signal + terminate/HOLD policy |

Directory read scope, otomatik write scope değildir. `filesWrite` varsa canonical landing authority exact
resource setidir. Directory wildcard ancak operation policy açıkça directory-output yetkisi verirse oluşur.

### 7.2 Path safety

Host path resolver şu sınıfları canonicalize ve validate eder:

- `.`/`..`, repeated separator, absolute ve drive-relative paths,
- POSIX symlink/hardlink/mount crossing,
- Windows junction/reparse point, UNC, device path ve alternate data stream,
- Unicode normalization ve case-fold collisions,
- macOS case-insensitive/case-sensitive volume farkı,
- WSL `/mnt/*` host-boundary crossing,
- repository submodule/worktree boundaries,
- path replacement/TOCTOU ve parent generation drift,
- deleted/new file parent identity,
- sparse checkout ve virtual filesystem identities.

String prefix comparison containment authority değildir. Path/handle/generation binding platform adapter
kanıtıyla yapılır.

### 7.3 Canonical dirty worktree korunması

Owner'ın veya başka session'ın pre-existing changes'i worker input snapshot'ine explicit olarak dahil veya
hariç edilir; sessizce overwrite edilmez. Landing:

- exact base content digest'i doğrular,
- owner-change ile worker-change'i ayrı provenance olarak tutar,
- conflict varsa typed `LANDING_CONFLICT/HOLD` üretir,
- unrelated changes'i reset/stash/checkout etmez,
- rollback yalnız kendi transaction'ının exact effects'ini kapsar.

### 7.4 Control-plane mounts

Worker bütün `.tasks/`, `.locks/`, `.deckent/`, `.brain/` veya audit directories'i görmez. Gerekli output:

- per-attempt isolated mailbox,
- append-only/bounded stream,
- schema-validated host ingest,
- sibling-invisible ACL/namespace,
- worker'ın terminal truth üretmediği proposal semantics

ile taşınır. Heartbeat host supervisor tarafından doğrudan üretilir.

## 8. ToolAuthority Gateway

### 8.1 Tool sınıfları

| Sınıf | Default execution | Gerekçe |
|---|---|---|
| Repository read/search | Staging-local native veya brokered | Immutable input üzerinde düşük risk |
| Repository edit/write | Staging-local native | Canonical effect yok; landing ayrı |
| Shell/process | Staging-local contained | Coding için gerekli; OS boundary zorunlu |
| Test/build/formatter | Staging-local contained | Outputs ephemeral by policy |
| Git inspect/diff | Staging-local read-only metadata veya host broker | Canonical git metadata korunur |
| Git mutation/remote | Brokered | Branch/ref/remote persistent effect |
| Network/web | Brokered veya destination proxy | Exfiltration ve SSRF boundary |
| Package install | Brokered fetch + staging-local install | Supply chain, network ve script riskleri |
| MCP | Brokered canonical MCP client | Server identity/capability/tenant enforcement |
| Secret access | Opaque broker handle | Raw secret exposure azaltılır |
| Cloud/DB/ERP | Brokered | Transaction/approval/compensation gerekir |
| Messaging | Brokered | Human/organization external effect |
| Child agent | Brokered | Budget/identity/cascade authority |
| Browser/computer use | Dedicated isolated broker | High-impact external state |

### 8.2 Provider translation

Provider adapter yalnız canonical grants'i provider tool schema'sına projekte eder. Projection daraltabilir;
genişletemez. Provider equivalent sunmuyorsa:

- native tool kapatılır ve canonical MCP/bridge tool'u kullanılır,
- contained-native tier'a düşülür,
- requested operation için `READ_ONLY` veya `HOLD` sonucu verilir.

Translation sonucunun digest'i execution receipt'e bağlanır.

### 8.3 Shell child processes

Process supervisor root CLI'nin bütün descendants'ını sahiplenir. Child process:

- aynı workspace/network/secret policy'sini miras alır,
- yeni namespace veya daemon ile policy'den kaçamaz,
- detached/orphan olup yaşamaya devam edemez,
- deadline/budget/termination'da birlikte kapatılır,
- host PID/IPC/device/runtime socket'ine erişemez.

Command-name denylist defense-in-depth olabilir; containment yerine geçmez.

## 9. Network ve egress authority

### 9.1 Network planes

Network üç plane'e ayrılır:

1. **Inference plane:** Provider API/auth endpoints; controlled proxy, provider-bound identity.
2. **Tool egress plane:** Web/MCP/package/cloud operations; Tool Gateway decisions ve receipts.
3. **Task-local plane:** Test server/database/loopback; attempt namespace içinde, dış host'a publish edilmez.

Default route bulunmaz. DNS resolution, redirects, proxy CONNECT, IPv4/IPv6, Unix/named sockets, localhost,
link-local ve cloud metadata endpoints policy'nin parçasıdır.

### 9.2 Provider endpoint policy

Provider CLI'nin ihtiyaç duyduğu endpoints versioned profile'da tanımlanır. Domain string allowlist tek başına
yeterli değildir; DNS rebinding, redirect ve SNI/TLS identity kontrol edilir. Unknown endpoint request'i
network'i genişletmez; runtime conformance `HOLD` olur.

### 9.3 Egress receipts

Brokered external call receipt'i en az destination identity, operation, request digest, redaction class,
response/effect digest, bytes/cost/time, approval ve idempotency refs'i taşır. Agent-provided URL veya MCP
metadata authority değildir.

## 10. Secret ve provider-auth authority

### 10.1 Ambient secret yasağı

Worker environment/HOME/workspace içinde şunlar bulunmaz:

- foreign provider keys,
- long-lived organization secrets,
- raw `.deck`, `.env`, keychain exports,
- SSH/GPG signing keys,
- Docker/Kubernetes/cloud admin credentials,
- sibling/tenant session homes.

### 10.2 Provider credential patterns

Tercih sırası:

1. Host-side inference/API adapter; worker provider credential görmez.
2. Broker/sidecar/proxy; task-bound transport identity kullanılır.
3. Short-lived least-scope credential; contained CLI yalnız provider endpoint'e çıkabilir.
4. Legacy subscription session material; lower assurance, explicit policy ve no enterprise claim.

CLI, arbitrary shell tool'u aynı security principal altında çalıştırıyor ve long-lived session material'a
erişebiliyorsa bu path `BROKERED_TOOLS` tier alamaz.

### 10.3 Credential denial

Broker denied/expired/unavailable durumda ambient env veya host session'a fallback yasaktır. Pre-birth HOLD
ve typed reason receipt üretilir.

## 11. Provider/backend conformance

### 11.1 Tier tanımları

| Tier | Koşul | Persistent mutation |
|---|---|---|
| `BROKERED_TOOLS` | Provider yalnız canonical tool bridge görür; external effects brokered; staging+landing | Allowed by policy |
| `CONTAINED_NATIVE_TOOLS` | Native shell/tools isolated staging içinde; external egress gated; host landing | Allowed by policy |
| `READ_ONLY_CONTAINED` | Input readable, persistent landing capability yok | Analysis only |
| `UNCONTAINED` | Canonical root/host effects structurally açık | Autonomous deny; break-glass only |
| `UNAVAILABLE` | Runtime/auth/adapter/evidence yok | HOLD |

### 11.2 Bugünkü ve hedef posture

| Provider/path | Bugünkü posture | Hedef |
|---|---|---|
| Claude + Docker | Project-level container, broad canonical RW, native allowlist+Bash | `CONTAINED_NATIVE_TOOLS` then `BROKERED_TOOLS` where supported |
| Codex + host adapter | Broad provider-owned workspace sandbox, no Deckent `filesWrite` | Host route retired for autonomous write; platform staging adapter |
| Gemini + host adapter | Yolo/skip-trust, no Deckent filesystem boundary | Host route retired for autonomous write; platform staging adapter |
| Codex/Gemini + Docker | Provider guardrails bypassed, broad canonical RW | Immutable runtime + staging + landing; provider flags defense-only |
| Claude subprocess/tmux | Host project cwd + provider permissions | Read-only/break-glass until native platform adapter proves containment |
| Ollama/OpenRouter HTTP workers | Agentic-worker tool gates may exist, host process path provider-specific | Same canonical envelope/gateway/landing conformance required |
| Exact XVerify V2 | Ephemeral tmpfs workspace/read-only evidence mounts | Preserve read-only isolated specialization; share contracts/evidence |

Provider/version update tier'ı otomatik taşımamalı. Command/tool/sandbox behavior re-probe edilmeden prior
conformance stale olur.

## 12. Every-environment execution adapters

### 12.1 Tek adapter contract'ı

Her adapter şu lifecycle'ı sunar:

1. `inspectCapabilities`
2. `prepareProjection`
3. `prepareNetworkAndSecrets`
4. `publishPreBirthEvidence`
5. `launchOwnedProcessTree`
6. `observeAndMeter`
7. `terminateAndFence`
8. `collectStagingFinality`
9. `releaseOrQuarantine`

Her adım exact attempt refs ve immutable evidence üretir. Partial prepare crash'i recovery tarafından
rehydrate edilebilir.

### 12.2 Platform matrix

| Environment | Expected enforcement family | Honest unsupported examples |
|---|---|---|
| Linux native | User/mount/network namespaces, syscall/process/resource controls, CoW projection | Kernel/facet unavailable |
| Rootless OCI | Immutable image, RO source, CoW volume, dropped privileges/capabilities, policy network | Privileged/rootful-only runtime |
| macOS native | Signed native sandbox/ACL/process controls veya managed virtualization | Generic terminal cannot prove required facets |
| Windows native | Restricted token/AppContainer-class boundary, Job ownership, ACL/reparse-safe staging | CLI lacks required isolation capability |
| WSL2 | Linux containment inside distro + Windows mount/interop exclusion | `/mnt/*` or Windows process escape open |
| Kubernetes | Pod security, immutable image, ephemeral volume, NetworkPolicy/egress gateway | Cluster policy cannot attest isolation |
| Remote executor | Tenant-isolated worker, CAS snapshot, signed attestation, host landing gateway | Executor identity/attestation stale |
| Air-gapped | Local provider/runtime, no external route, offline artifact/approval transfer | Provider requires unavailable endpoint |

Adapter adı değil observed facets authority'dir. “Docker”, “AppContainer” veya “VM” etiketi tek başına
enforcement claim'i vermez.

### 12.3 OCI hardening baseline

Rootless OCI adapter en az şu planı kanıtlar:

- canonical checkout mount edilmez veya strictly read-only snapshot olarak görünür,
- writable staging ayrı per-attempt volume'dür,
- read-only root filesystem + bounded tmpfs,
- non-root user ve no privilege escalation,
- unnecessary capabilities/devices/sockets yok,
- PID/IPC/network isolation,
- descendant/process/resource ceilings,
- provider endpoint proxy dışında default-deny egress,
- immutable image digest,
- task-specific mailbox only,
- host supervisor termination/finality evidence.

## 13. LandingAuthority transaction

### 13.1 Pre-landing gates

Landing başlamadan:

- provider process tree terminal/fenced,
- staging filesystem quiescent/final,
- envelope valid ve unexpired at effect decision,
- input snapshot and attempt match,
- runtime conformance applicable,
- host-computed diff available,
- prohibited/control-plane changes absent veya quarantined,
- required approval/budget receipts valid,
- canonical root generation resolvable,
- audit append authority available

olmalıdır.

### 13.2 Diff classification

Host, worker'ın `filesChanged` beyanını kullanmaz. Staging/base snapshot karşılaştırmasıyla:

- added,
- modified,
- deleted,
- renamed/copied,
- type/mode/link change,
- submodule/gitlink change,
- generated/ephemeral change,
- out-of-scope/prohibited change

sınıflarını kendisi çıkarır.

### 13.3 Policy outcomes

| Durum | Outcome |
|---|---|
| Yalnız allowed landing diff | Apply candidate |
| Ephemeral outputs + allowed diff | Ephemeral discard, allowed apply candidate |
| Scope dışı source diff | Whole landing `HOLD`; partial cherry-pick default değil |
| Prohibited/control-plane access/change | Terminate/quarantine + security event + `HOLD` |
| Canonical base unchanged | Transactional apply |
| Non-overlapping canonical drift | Policy permitsse recompute/rebase + new approval digest |
| Overlapping drift | `LANDING_CONFLICT/HOLD` |
| Post-apply digest mismatch | Rollback own transaction + `HOLD` |
| Audit/receipt append unavailable | Pre-effect block; false COMPLETE yok |

Whole-landing HOLD default'u, malicious task'ın allowed file yanında persistence file'ı değiştirip yalnız iyi
parçayı land ettirerek security signal'ı düşürmesini engeller. Explicit salvage ayrı owner-approved operation
olur.

### 13.4 Atomicity ve rollback

Landing canonical lock/fence + base generation CAS altında yapılır. Apply transaction:

- exact touched resources'i snapshot'lar,
- temp outputları canonical parent'ta safe atomic replace ile yayınlar,
- multi-file manifest digest'i doğrular,
- failure'da yalnız kendi partial effects'ini geri alır,
- user/sibling changes'e dokunmaz,
- crash recovery için durable prepare/apply/commit journal üretir.

### 13.5 Settlement

Task `DONE/COMPLETE` olabilmek için successful LandingReceipt veya explicitly no-effect/read-only settlement
taşır. Worker result, testsPassed, exit zero veya provider final message receipt yerine geçmez.

## 14. Failure ve settlement semantics

| Failure | Process birth | Canonical effect | Terminal outcome |
|---|---|---|---|
| Capability envelope missing/invalid | Block | None | `AUTHORITY_HOLD` |
| Runtime conformance unavailable | Block | None | `RUNTIME_HOLD` |
| Platform facet unsupported | Block | None | `UNSUPPORTED/HOLD` |
| Snapshot/projection prepare failure | Block | None | `PROJECTION_HOLD` |
| Credential grant denied | Block | None | `AUTH_HOLD` |
| Egress gateway unavailable | Block for required network; offline task policy-specific | None | `EGRESS_HOLD` |
| Supervisor lost before birth | Block | None | `SUPERVISION_HOLD` |
| Supervisor lost after birth | Terminate/fence | None until finality | `SUPERVISION_HOLD` |
| Prohibited path attempt | Terminate or continue-forensics by policy | None | `POLICY_HOLD` |
| Out-of-scope staging diff | Already terminalized | None | `LANDING_SCOPE_HOLD` |
| Worker forges result/heartbeat | Ignore/quarantine | None | Evidence violation/HOLD |
| Canonical generation conflict | No new worker required initially | None | `LANDING_CONFLICT/HOLD` |
| Landing apply crash | Recovery owns prepared transaction | No false success | `RECOVERY_REQUIRED/HOLD` |
| Audit/receipt unavailable pre-effect | Block landing | None | `AUDIT_HOLD` |
| Audit unavailable post-effect | Contain and reconcile | Already-applied effect remains non-settled | `SETTLEMENT_HOLD` |
| Cleanup failure | Quarantine exact staging | Canonical receipt unchanged | `CLEANUP_HOLD` or degraded cleanup state |
| Break-glass expired/replayed | Block | None | `APPROVAL_HOLD` |

No failure host subprocess, broad RW mount veya provider-native approval prompt'una silent downgrade yapar.

## 15. Config ve policy model

### 15.1 Canonical config family

Implementation mevcut config resolution sistemine aşağıdaki semantic family'yi ekler; exact naming
implementation session'ında config-schema conventions ile doğrulanır:

| Semantic key | Values | Final target/default |
|---|---|---|
| Worker enforcement mode | `observe`, `shadow`, `enforce` | `enforce` after ratchet |
| Uncontained policy | `deny`, `attended-break-glass` | `deny` |
| Required conformance tier | Tier enum | Mutation için en az `CONTAINED_NATIVE_TOOLS` |
| External tool mode | `brokered`, scoped exceptions | `brokered` |
| Network profile | `deny`, `provider-only`, named policy | Operation-derived |
| Landing mode | `transactional`, read-only/no-effect | Mutation için `transactional` |
| Scope violation policy | `terminate`, `quarantine` | Risk-class derived |
| Staging retention | success/failure/security retention classes | Data-governance derived |

Unknown config value fail-closed olur. CLI/API/Terminal/MCP ayrı default üretmez; effective config ve
capability receipt'i aynı service'den gelir.

### 15.2 Rollout stages

#### R0 — Inventory

Provider/backend/platform paths, direct canonical writers, network/secret mounts ve control-state sharing
source-derived inventory'ye alınır. Unknown path secure sayılmaz.

#### R1 — Observe

Capability envelope/diff/conformance kararları hesaplanır fakat legacy path henüz davranış değiştirmez.
Output açıkça `UNENFORCED_OBSERVATION` olur; assurance ve autonomous promotion'a girmez.

#### R2 — Shadow

Staging/landing sonucu legacy direct-write result ile karşılaştırılır. Canonical mutation authority hâlâ
legacy ise run secure sayılmaz. Drift metrics provider/platform/version bazında tutulur.

#### R3 — Enforce opt-in canary

Contained staging + host landing selected pools/projects'te aktif olur. Provider-native flags defense-in-depth
kalır. Break-glass ayrı operation'dır.

#### R4 — New-install/default cutover

Yeni installations ve autonomous mutation default `enforce`; incompatible environment typed HOLD olur.
Existing explicit shadow policy expiry/owner migration planı taşır.

#### R5 — Legacy retirement

Host direct-write and broad canonical RW worker paths autonomous mutation için unreachable olur. Observe/shadow
yalnız diagnostic/no-effect surface olarak kalır.

Rollout'un amacı incomplete architecture'ı production'a çıkarmak değil; fully built enforcement'ın gerçek
provider/platform behavior'ını güvenli ratchet ile default'a taşımaktır.

## 16. Current-to-target migration

### 16.1 Docker backend

Current broad `-v project:/workspace` RW mount kaldırılır. Yerine:

- immutable input projection,
- separate writable staging volume,
- task-specific mailbox,
- host-side diff extraction,
- LandingAuthority transaction

gelir. `.deck` shadow, `dist` overlay ve git denylist gibi targeted controls staging planında defense-in-depth
olarak korunabilir; canonical root isolation bunlara bağımlı olmaz.

### 16.2 Codex/Gemini host adapters

Provider selection host adapter seçimini execution-environment bypass'ına çeviremez. Adapter inference/tool
translation sağlar; process launch canonical ExecutionEnvironmentAuthority üzerinden olur.

Native platform enforcement yoksa:

- read-only analysis,
- contained remote/OCI reroute,
- explicit attended break-glass,
- typed HOLD

seçeneklerinden policy-resolved olan uygulanır. Silent host cwd mutation yasaktır.

### 16.3 Claude subprocess/tmux

Tmux/subprocess inventory/liveness UX olabilir; security boundary değildir. Autonomous write path ancak
native platform adapter'ın staging/root/network/process facets'ini kanıtlamasıyla devam eder.

### 16.4 Agentic HTTP workers

`agentic-worker-runner` ve `http-agentic-worker` içindeki tool-level scope checks korunur; bunlar canonical
Capability Envelope ve Tool Gateway decisions'i tüketir. Local write APIs staging root'a bağlanır; worker
process canonical root cwd almaz.

### 16.5 Exact XVerify

Exact XVerify'nin ephemeral workspace ve read-only evidence mounts yaklaşımı doğru specialization'dır.
Runtime identity, conformance, supervisor ve audit contracts paylaşılır; implementation write landing yetkisi
XVerify profile'ına eklenmez.

### 16.6 Result/heartbeat

Raw provider'ın `.tasks/task-*.result` ve heartbeat dosyalarını canonical shared directory'ye yazması emekli
edilir. Attempt mailbox host ingest edilir; heartbeat host supervisor truth'üdür; result semantic proposal'dır.

## 17. File-by-file implementation planı

Bu bölüm exact implementation sırasında repo topology ve collision inventory ile doğrulanır. Yeni isimler
canonical responsibility sınırını anlatır; existing module uygun responsibility'yi zaten taşıyorsa genişletilir,
parallel duplicate yaratılmaz.

### W1 — Contracts ve conformance vocabulary

**Mevcut tüketilecek foundation:**

- `src/core/capability-spec.ts`
- `src/core/capability-broker.ts`
- `src/core/capability-runtime.ts`
- `src/core/provider-command-spec.ts`
- `src/core/provider-concurrency-capability.ts`

**Planlanan responsibility:**

- WorkerCapabilityEnvelope schema/validator/canonical digest.
- Runtime conformance tier ve facet vocabulary.
- ToolGrant, WorkspaceProjection, LandingProposal/Receipt refs.
- Unknown version/value fail-closed behavior.
- Provider command flags'in authority/decorative classification'ı.

### W2 — Pre-birth WorkerCapabilityEnvelopeAuthority

**Likely modules:**

- new focused authority under `src/core/` veya `src/orchestra/`;
- `src/orchestra/sprint-spawner.ts` canonical producer/consumer wiring;
- exact plan, principal, operation, approval, budget ve receipt services.

**Closure:** Plan/task scope → canonical resource resolution → capability decision → immutable envelope →
spawn admission. Prompt veya worker-readable task JSON authority producer olmaz.

### W3 — WorkspaceProjectionAuthority

**Likely modules:**

- new `src/orchestra/execution-environments/` adapter boundary;
- snapshot/CAS/path identity helpers;
- current Docker mount planner extraction from `spawn-backend-docker.ts`.

**Closure:** Exact input snapshot → per-attempt staging root → RO/RW/ephemeral/prohibited projection →
pre-birth evidence → cleanup/quarantine capability.

### W4 — Every-environment adapters

Adapter family birlikte doğar:

- Linux native,
- rootless OCI,
- macOS supported isolation/virtualized,
- Windows native restricted execution,
- WSL boundary,
- Kubernetes/remote executor plan.

Her adapter aynı contract ve typed unsupported state'i uygular. Platform branch business/orchestration
modules'e dağılmaz.

### W5 — ToolAuthority Gateway ve Worker Bridge

**Ledger alignment:** `P02-640`, `TOOL-AUTHORITY-001`, `APPROVAL-001`.

**Likely integration:**

- current capability broker/runtime,
- MCP client/tool schemas,
- provider tool translation layer,
- `src/agent/provider-tooluse/`,
- `src/agents/agentic-worker-runner.ts`,
- `src/agents/http-agentic-worker.ts`.

External effects canonical operation ID, approval, budget, idempotency, audit ve receipts'e bağlanır.

### W6 — Provider/backend process launch cutover

**Touched families:**

- `src/providers/claude.ts`
- `src/providers/codex.ts`
- `src/providers/gemini.ts`
- `src/providers/subprocess.ts`
- `src/providers/openai-compatible.ts`
- `src/providers/openrouter.ts`
- `src/orchestra/spawn-backend.ts`
- `src/orchestra/spawn-backend-docker.ts`
- `src/orchestra/tmux.ts`
- `src/orchestra/sprint-spawner.ts`

Provider adapter inference/translation sorumluluğunda kalır; security environment bypass edemez. All spawn
paths envelope + conformance + environment handle ister.

### W7 — LandingAuthority closure

**Existing foundation:**

- `src/core/execution-landing-context.ts`
- `src/core/execution-landing-proposal.ts`
- `src/core/execution-landing-checkpoint.ts`
- `src/orchestra/execution-landing-coordinator.ts`
- `src/core/task-settlement-authority.ts`

**Planlanan closure:** Host diff → scope/effect classification → canonical generation CAS → transactional
apply → post-apply verify → immutable LandingReceipt → task settlement. Worker semantic proposal yalnız input.

### W8 — OOB supervisor ve control-plane isolation

Current worker-authored `.hb`, result, `.tasks` ve `.locks` sharing'i per-attempt mailbox + host supervisor'a
taşınır. Process group/container/pod/Job authority descendants ve crash recovery ile birleşir. Monitoring loss
authority suspension üretir.

### W9 — Network, secrets ve external effect adapters

- Provider inference proxy profiles.
- Tool egress gateway.
- Metadata/loopback/socket denial.
- Credential broker/sidecar/task-scoped secret handles.
- Package fetch/cache provenance.
- MCP/cloud/DB/ERP/messaging effect receipts.

### W10 — Config, surfaces, migration ve assurance

- Config schema/resolution/default/ratchet.
- CLI/Terminal/API/MCP/Desktop capability/status parity.
- Doctor conformance evidence.
- Legacy break-glass approval UX and i18n.
- Security/compliance projections.
- Real-binary provider/platform canaries.
- Different-provider XVerify evidence.

## 18. Dependency DAG ve rollout order

```text
OPERATION-001 + PRINCIPAL-001 + TENANT-001
                    │
                    ▼
          CAPABILITY-001 + APPROVAL-001
                    │
                    ▼
 W1 Contracts ──► W2 Capability Envelope
                    │
          ┌─────────┴─────────┐
          ▼                   ▼
 W3 Workspace Projection   W5 Tool Gateway
          │                   │
          ▼                   ▼
 W4 Environment Adapters   W9 Egress/Secrets
          └─────────┬─────────┘
                    ▼
          W6 Provider/Backend Cutover
                    │
                    ▼
          W8 OOB Supervisor/Finality
                    │
                    ▼
          W7 LandingAuthority Closure
                    │
                    ▼
       RECEIPT-001 + AUDIT-001 + KERNEL-SETTLEMENT-001
                    │
                    ▼
          W10 Surfaces/Ratchet/Assurance
```

W6 provider cutover, W2/W3/W4 foundation olmadan complete sayılamaz. W7 landing closure olmadan canonical
project RW mount kaldırılamaz. W10 default enforcement, bütün required platform/provider tuples real-evidence
ile kanıtlanmadan açılamaz.

## 19. Acceptance ve release gates

### 19.1 Contract gates

1. Unknown envelope schema/version/operation/tool/tier fail-closed.
2. Envelope tenant/project/run/task/attempt identity'si tam ve immutable.
3. Expired/replayed/wrong-attempt envelope process birth'i bloklar.
4. Provider flags grant'i canonical envelope'dan genişletemez.
5. Runtime/tool/mount/network policy digests receipt'e bağlanır.

### 19.2 Filesystem adversarial gates

6. Malicious prompt `Bash`, Node, Python, shell redirect ve package script ile scope dışı yazmayı dener;
   canonical root byte-identical kalır.
7. Symlink/hardlink/junction/reparse/UNC/ADS/path traversal/case/Unicode collision matrix'i fail-closed.
8. Worker `.git`, `.deck`, `.deckent`, `.tasks`, `.locks`, `.brain`, Docker socket veya host HOME'a effect
   üretemez.
9. Worker sibling/foreign tenant workspace, mailbox, lock ve results'i göremez/değiştiremez.
10. Existing dirty worktree ve concurrent owner changes overwrite edilmez.
11. Scope dışı staging diff whole landing'i HOLD yapar; partial good-file salvage automatic değildir.
12. Ephemeral build/test/cache outputs canonical root'a land edilmez.

### 19.3 Process/network/secret gates

13. Detached/grandchild/daemon süreçleri root attempt ownership ve termination'dan kaçamaz.
14. Provider endpoint dışı raw egress, IPv4/IPv6/DNS redirect/metadata/localhost/socket yollarında deny edilir.
15. Task-local test server dış host/tenant network'üne publish edilmez.
16. Foreign/ambient provider secrets child env/HOME/filesystem'de yoktur.
17. Credential denial host env/session fallback'i açmaz.
18. Provider CLI arbitrary shell ile long-lived secret okuyabiliyorsa tier dürüstçe düşürülür.

### 19.4 Landing/settlement gates

19. Worker-authored `filesChanged`, heartbeat, result, testsPassed ve exit zero authority olarak kullanılmaz.
20. Host diff added/modified/deleted/rename/mode/link/submodule changes'i yakalar.
21. Base generation drift overlap'te `LANDING_CONFLICT/HOLD`; last-writer-wins yok.
22. Multi-file apply crash'i durable recovery ile false COMPLETE üretmez.
23. Post-apply digest mismatch yalnız own transaction rollback'u yapar.
24. LandingReceipt olmadan mutating task `DONE/COMPLETE` olamaz.
25. Audit/receipt failure pre-effect'te block, post-effect'te settlement HOLD üretir.

### 19.5 Provider/backend gates

26. Claude, Codex, Gemini ve adapter-based HTTP workers aynı canonical envelope/landing semantics'i tüketir.
27. `spawn_backend: docker` ve host-adapter routing secure environment'ı bypass edemez.
28. CLI version/image digest/tool-profile değişimi conformance re-evaluation ister.
29. Unsupported provider/backend/platform silent fallback yerine typed HOLD üretir.
30. `autoApprove` high-risk operation approval receipt'i yerine geçmez.

### 19.6 Every-environment gates

31. Linux native, rootless OCI, macOS, Windows native ve WSL gerçek-binary negative canary'leri vardır.
32. Platform-specific path/link/process/network escape matrix'i gerçek target'ta koşar.
33. Kubernetes/remote execution tenant isolation ve signed runtime evidence kanıtlar.
34. Unsupported generic environment honest capability output verir.

### 19.7 Scale ve reliability gates

35. Concurrent attempt staging roots ve mailboxes collision-free/tenant-scoped.
36. Landing lock/CAS milyon-scale project/task cardinality'sinde bounded ve observable.
37. Crash/restart prepared projection, process ownership, landing ve cleanup'ı rehydrate eder.
38. Artifact retention/quarantine bounded, encrypted/redacted ve data-governance bağlıdır.
39. Network/tool budgets retry/idempotency altında double effect üretmez.

### 19.8 Assurance gates

40. Observe/shadow runs `ENFORCED` veya compliant sayılmaz.
41. Break-glass runs autonomous success/training promotion/compliance metrics'ten çıkarılır.
42. Security report provider/backend/platform/tier/facet evidence refs'i gösterir.
43. Different-provider XVerify threat model, contracts, failure semantics ve proof setini doğrular.
44. Real provider canary canonical root'un malicious tool sequence sonrası unchanged olduğunu disk truth ile
   kanıtlar.

## 20. Explicit non-goals ve yanlış COMPLETE iddiaları

Şunlar bu işi kapatmaz:

- Codex/Gemini'e provider-specific yeni allowlist flag'i eklemek.
- Claude `Bash`ı listeden kaldırmak.
- Docker kullanıldığı için sandbox'ın tamam olduğunu varsaymak.
- Project root RW mount'u koruyup post-run git diff ile violation aramak.
- Worker'ın `filesChanged` veya BOUNDARY_VIOLATION beyanına güvenmek.
- Shell command denylist'ini OS boundary saymak.
- Network'i yalnız proxy env vars ile “kapalı” ilan etmek.
- API key'leri env'de scrub edip subscription HOME'u bütün mount etmek.
- `autoApprove: false` ile provider UI prompt'unu security authority saymak.
- Sadece Claude'u güvenli yapıp Codex/Gemini/Windows/macOS'u sonraya bırakmak.
- Unit mock'larında mount/args görmek; real binary/real platform proof olmadan enforcement claim etmek.
- Staging kurup host landing'i worker script'ine bırakmak.
- Landing receipt olmadan result/exit/test green üzerinden COMPLETE yayınlamak.
- Legacy host path'i silent fallback olarak tutmak.

Bu iş provider UX permission ayarı değil; canonical project mutation authority'sini untrusted agent process'ten
host control plane'e geri alma işidir.

## 21. Diğer session için doğrudan plan girdisi

**Goal:** `TOOL-AUTHORITY-001` — provider-neutral WorkerCapabilityEnvelope, isolated staging execution,
ToolAuthority Gateway ve host-owned transactional LandingAuthority zincirini kur.

**Mission outcome:** Hiçbir autonomous worker provider/model/backend/platform fark etmeksizin canonical
project root'a doğrudan RW authority alamaz; process yalnız verified capability envelope + supported runtime
conformance ile immutable snapshot/CoW staging içinde doğar; external effects brokered olur; host-computed
allowed diff canonical worktree'ye yalnız LandingReceipt ile taşınır; missing facet typed HOLD üretir.

**Work packages:** W1 Contracts/conformance → W2 Capability Envelope → W3 Workspace Projection → W4
Every-environment adapters → W5 Tool Gateway/Worker Bridge → W6 Provider/backend cutover → W8 OOB supervisor
→ W7 Landing closure → W9 Network/secrets → W10 surfaces/ratchet/assurance.

**Required dependency context:** 4060 doğrudan; 4030 canonical operations; 4040 capabilities; 4050 approvals;
4070 receipts; 4180 trust handoff; 8010 environment adapters; 1270 Codex finite tool proof; 2100 Worker MCP
Bridge; 3040 terminal settlement; 75 containment foundation; 4190 OWASP evidence. `AUDIT-001` Bulgu 3
architecture'ı envelope/effect/landing/settlement audit completeness için hard dependency'dir.

**Mandatory owner decisions already settled:** canonical root no-RW; staging+host landing; shell contained;
provider flags defense-only; external effects brokered; unsupported→HOLD; legacy only attended expiring
compliance-ineligible break-glass.

**Settlement rule:** Provider flag/unit test/Docker args/scope prompt/diff alert tek başına yeterli değildir.
Canonical plan/principal/operation → capability envelope → pre-birth runtime conformance → isolated snapshot/
staging → OOB supervision → brokered external effects → host-computed diff → canonical generation CAS →
transactional landing → immutable receipt/audit → terminal settlement zinciri Claude/Codex/Gemini ve
Linux/OCI/macOS/Windows/WSL gerçek-binary negative proof'larıyla kapanmadan capability `COMPLETE` olamaz.
