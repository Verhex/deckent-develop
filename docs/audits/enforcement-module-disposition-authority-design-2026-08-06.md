# Enforcement Module Disposition Authority — Absorb, Cut Over ve Retire Handoff (2026-08-06)

> **Karar durumu:** KABUL EDİLDİ — Alperen, 2026-08-06 OWASP Agentic Top 10 bağımsız
> inceleme oturumu, Bulgu 6.
>
> **Implementation durumu:** Bu oturumda production kodu değiştirilmedi. Bu doküman başka bir
> Deckent session'ında Goal/Mission/Flow/Run planına alınacak implementation authority girdisidir.
>
> **Canonical ledger:** umbrella owner `SEC-ENFORCE-WIRE-001` (order 4200). Domain owners:
> `TOOL-AUTHORITY-001` (4060), `ENTERPRISE-AUTH-001` (4140), `TRUST-HANDOFF-001` (4180),
> `SUPPLY-CHAIN-001` (7020), `PLUGIN-SANDBOX-001` (7030) ve `AGENT-SKILL-001` (7010).
> Assurance parent: `SEC-OWASP-ASI-001` (4190).
>
> **Hard architecture dependencies:**
> `docs/audits/provider-neutral-worker-execution-authority-design-2026-08-06.md`,
> `docs/audits/attempt-effect-attribution-authority-design-2026-08-06.md` ve skill/plugin
> admission'ın ortak trust-plane kısmı için
> `docs/audits/plugin-admission-authority-design-2026-08-05.md`.

## 1. Sonuç — tek cümle

Deckent, production caller'ı bulunmayan dört “enforcement” API'sini kör biçimde wire etmeyecek; bunların
geçerli primitives ve policy niyetlerini provider-neutral Capability/Authorization, Protected Mutation,
Artifact Admission, Attempt Effect ve Landing authority'lerine taşıyacak, production consumers bu canonical
kararlara cut over olduktan sonra yanıltıcı standalone modülleri ve duplicate karar yollarını retire edecektir.

## 2. Kapsam ve nihai hüküm

Bulgu 6'nın exact API kapsamı:

1. `src/core/tool-scope-gate.ts:createScopeGate`
2. `src/agents/worker.ts:checkWorkerAuthority`
3. `src/orchestra/self-modifying-detector.ts:enforceSelfModifyingTask`
4. `src/core/marketplace/skill-sandbox.ts:SkillSandbox.requireSafe`

### 2.1 Verdict matrisi

| Exact mekanizma | Exact production reachability | Broader capability gerçeği | Nihai disposition |
|---|---|---|---|
| `createScopeGate` | **UNWIRED** | `scope-check.ts` primitive'i başka advisory paths'te kullanılıyor | Primitive'i absorb et; standalone gate'i retire et |
| `agents/worker.checkWorkerAuthority` | **UNWIRED** | Ayrı `nervous/authority-matrix` RBAC implementation'ı mainline'da **CONFIG-GATED** | Duplicate API'yi retire et; canonical AuthorizationAuthority'ye cut over |
| `enforceSelfModifyingTask` | **UNWIRED** | Native terminal path'te per-call confirmation defense-in-depth var | Pattern gate'i retire et; Protected Mutation + Runtime Impact olarak ayır |
| `SkillSandbox.requireSafe` | **UNWIRED** | Publish dar static scan sonucunu manuel blokluyor; install/update enforcement'sız | Scanner'ı non-authoritative signal olarak absorb et; method/class claim'ini retire et |

Önceki bulgu exact-function düzeyinde **CONFIRMED**'dır. “Bu capability'lerin hiçbir production karşılığı yok”
genellemesi **PARTIAL**'dır: RBAC'ın başka implementation'ı production'a bağlanmıştır ve publish path'i dar
scanner report'unu bloklar. Ancak dört exact API de canonical security authority değildir.

## 3. Bugünkü code-truth baseline

### 3.1 `tool-scope-gate.ts`

Modül kendisini pure, realpath-based advisory/enforce wrapper olarak tanımlar. Default `advisory`'dir;
violation görünür olsa da `allowed` true kalır (`src/core/tool-scope-gate.ts:14-19`, `:31-48`, `:74-100`).
`createScopeGate()` için production import/caller yoktur; test suite ve governance inventory dışında
reachability bulunmamaktadır.

Gate'in write semantiği:

- `scope.filesWrite` exact match kabul eder;
- `scope.directories` containment match'ini de write grant sayar
  (`src/core/tool-scope-gate.ts:103-130`);
- read için `directories`, `filesRead` ve `filesWrite` kabul edilir
  (`src/core/tool-scope-gate.ts:132-137`).

Bu write semantiği kabul edilmiş Attempt Effect Authority kararına aykırıdır: `filesWrite` exact persistent
write authority, `directories` ise explicit typed tree capability yoksa read/context olmalıdır.

Değerli underlying primitive `src/core/scope-check.ts` içindedir:

- new path için nearest-existing-ancestor realpath resolution (`src/core/scope-check.ts:49-87`);
- exact file ve directory containment ayrımı (`src/core/scope-check.ts:89-138`);
- symlink escape'e karşı real target/project root check'i (`src/core/scope-check.ts:107-125`).

Bu primitive karar motoru değildir. Pre-check ile operation arasında TOCTOU oluşabilir; provider shell ve
child processes bu pure function'ı çağırmak zorunda değildir. Bu nedenle `scope-check.ts` reusable evidence
primitive olarak kalabilir, `tool-scope-gate.ts` security boundary claim edemez.

### 3.2 `src/agents/worker.ts:checkWorkerAuthority`

Bu exact function `checkAuthority()` çağırır; violation'da warn/event üretir ve yalnız caller
`opts.enforceRbac === true` verirse false döner (`src/agents/worker.ts:795-838`). Production caller yoktur;
tests doğrudan function'ı import eder.

Underlying `authority-enforcer.ts` hâlâ soft-era contract'ıdır:

- header hard enforcement'ı “planned” olarak tanımlar (`src/orchestra/authority-enforcer.ts:1-7`);
- result mode bütün path/channel kararlarında `soft` kalır;
- scope violation `allowed:false`, `level:'warn'`, `mode:'soft'` üretir
  (`src/orchestra/authority-enforcer.ts:354-385`);
- event emission observability'dir ve fail-safe/non-blocking tasarlanmıştır
  (`src/orchestra/authority-enforcer.ts:407-430`).

Path-level function'ın `enforceRbac` adı ayrıca semantik olarak yanlıştır: yaptığı şey human role RBAC değil,
worker filesystem scope check'idir. Aynı isimli iki farklı authority domain'i code review ve wiring sırasında
yanlış güvenlik claim'i yaratır.

### 3.3 Production'a bağlanmış alternatif RBAC

`src/nervous/authority-matrix.ts` ayrı bir `checkWorkerAuthority()` taşır. Bu function
`ExecutionRequest.actor.role` ile required capability'leri karşılaştırır:

- known roles `admin`, `engineer`, `operator`, `viewer` olarak normalize edilir
  (`src/nervous/authority-matrix.ts:284-301`);
- missing veya unknown role allow-all döner (`src/nervous/authority-matrix.ts:303-333`);
- denied capability yalnız `enforceRbac:true` iken hard deny olur
  (`src/nervous/authority-matrix.ts:336-378`).

Bu implementation bugün production-wired'dır:

- normal sprint SPAWN mainline tüm pending candidates için çağırır; denied tasks `blockedTaskIds` içine alınır
  (`src/orchestra/sprint-spawner.ts:752-765`);
- autonomous backlog policy gate `enforceEntryRbac()` çağırır ve denied verdict'i durdurur
  (`src/orchestra/autonomous/runtime-loop.ts:420-459`);
- scope-to-capability inference `collectRbacBlockedTaskIds()` üzerinden yürür
  (`src/orchestra/sprint-runtime.ts:55-69`).

Config key `ResolvedConfig` üzerinde optional'dır (`src/core/config-types.ts:1690`). Caller yalnız exact true
değerini enforcement sayar (`src/orchestra/sprint-runtime.ts:27-33`); omitted/false default davranış soft-warn
ve allow'dur.

Identity boşluğu kritiktir. Birçok trusted ingress yalnız actor ID sağlar, role sağlamaz; örneğin MCP start
`mcp-operator` actor'ı yazar (`src/mcp/tools/start.ts:316`) ve CLI plan `cli-operator` actor'ı kullanır
(`src/cli/commands/plan.ts:548`). Missing-role request `enforce_rbac=true` altında dahi permissive path'e düşer.
Dolayısıyla classification **CONFIG-GATED/PARTIAL**'dır; flag on tek başına fail-closed RBAC kanıtı değildir.

Normal sprint denial'ın `blockedTaskIds` ile collision loser gibi defer edilmesi de terminal semantiği
tamamlamaz. Policy değişmeyecekse task PENDING/queued kalabilir; durable typed authorization denial receipt'i
ve terminal HOLD zorunlu değildir.

### 3.4 `enforceSelfModifyingTask`

Function production'da çağrılmamaktadır. İddia ettiği `self_mod_enforce` key'i config schema/type'ta yoktur.
Mevcut `self_modifying_warner`, Nervous detector reservation'ıdır; aynı authority değildir
(`src/core/config.ts:1771`, `src/core/config-types.ts:1625`).

Function'ın policy modeli:

- Deckent checkout algısı `.deckent/` + `package.json.name === 'deckent'` üzerinden yapılır
  (`src/orchestra/self-modifying-detector.ts:62-95`);
- static Deckent source prefix listesi kullanılır (`src/orchestra/self-modifying-detector.ts:24-43`);
- Deckent dogfood'da flag ignore edilip her zaman advisory döner
  (`src/orchestra/self-modifying-detector.ts:201-212`);
- user project'te aynı Deckent-specific pattern listesi doğrudan scope'a uygulanır
  (`src/orchestra/self-modifying-detector.ts:215-248`).

Bu model cross-language/cross-product değildir. User repository'deki CI workflows, package lifecycle scripts,
IDE workspace-trust config, agent instructions, MCP/provider config veya başka bir orchestrator'ın runtime
source'u korunmaz. Deckent checkout'ta ise en hassas self-update sınıfı “dogfood expected” gerekçesiyle
enforcement dışında bırakılır.

Native terminal agent farklı ve production-wired bir defense-in-depth taşır:

- Deckent source target algılanırsa tool tier `always` confirmation floor'una yükseltilir
  (`src/agent/guards/self-modifying.ts:29-37`, `src/agent/loop.ts:189-214`);
- nested `deckent_call_tool` parity path'i aynı elevation'ı yeniden uygular
  (`src/cli/repl/native-agent-bridge.ts:202-219`).

Bu interactive confirmation değerlidir; fakat worker/shell/runtime containment veya landing authority değildir.

### 3.5 `SkillSandbox.requireSafe`

`SkillSandbox` gerçek process/filesystem sandbox'ı değil static artifact scanner'dır. Regex patterns ve
TypeScript AST checks kullanır (`src/core/marketplace/skill-sandbox.ts:29-62`, `:64-169`).

Exact `requireSafe()` production'da çağrılmaz. Ayrıca canonical gate olmaya uygun olmayan davranışları vardır:

- built-in/extra trusted skill ID'si scan'i tamamen bypass eder
  (`src/core/marketplace/skill-sandbox.ts:231-242`, `:290-310`);
- unreadable files catch ile sessizce atlanır (`src/core/marketplace/skill-sandbox.ts:257-280`);
- hidden directories ve `node_modules` scan dışıdır (`src/core/marketplace/skill-sandbox.ts:391-409`);
- unreadable directories empty inventory gibi geçebilir (`src/core/marketplace/skill-sandbox.ts:391-414`);
- safety vocabulary signature, provenance, revocation, permissions ve runtime isolation içermez.

Publish CLI `requireSafe()` kullanmaz; `validateSkillSafety()` report'unu çağırır ve `safe:false` sonucunda
exit code ile bloklar (`src/cli/commands/skill-marketplace.ts:205-216`). Bu narrow scanner sonucu için
production enforcement'tır, fakat supply-chain admission değildir. Publish ayrıca `--no-sign` ile signing'i
atlayabilir (`src/cli/commands/skill-marketplace.ts:218-234`).

Install/update daha kritik boşluktur:

- Git install manifest validate ettikten sonra clone'u doğrudan active `.deckent/skills/<id>` içine kopyalar
  (`src/cli/commands/skill.ts:336-416`);
- local install kaynak dizini doğrudan active store'a kopyalar (`src/cli/commands/skill.ts:428-488`);
- update active skill'i önce siler, sonra yeni Git/local bytes'ı scan/signature olmadan koyar
  (`src/cli/commands/skill.ts:496-562`);
- checksum üretimi install sonrası ve non-fatal'dır (`src/cli/commands/skill.ts:395-406`, `:465-477`);
- loader yalnız manifest shape doğrular ve skill'i pool'a alır (`src/core/skill-pool.ts:308-357`);
- assigned skill'in `SKILL.md` içeriği doğrudan worker prompt'una eklenir
  (`src/orchestra/result-collector.ts:1001-1017`).

Bu, third-party prompt/instruction artifact'ının provenance/admission olmadan execution context'e girmesidir.
Skill script veya referenced executable taşıyorsa static scanner runtime capability boundary sağlamaz.

### 3.6 Risk sırası

1. **Skill install/update active-store bypass:** doğrudan supply-chain → prompt/runtime trust transfer.
2. **RBAC missing/unknown role allow:** enforcement flag açıkken bile anonymous/unresolved principal permit.
3. **Scope authority duplication/unwired gate:** provider/shell bypass ve yanlış `directories` write grant'i.
4. **Self-modification misleading semantics:** protected mutation ve runtime restart riskini path label'a indirgeme.

## 4. Korunan varlıklar ve threat model

### 4.1 Korunan varlıklar

- Canonical project files, control-plane state ve execution-capable configuration.
- Authenticated principal, tenant membership, roles, grants ve approval lineage.
- Worker capability envelope, Tool Gateway operations, effect manifests ve landing receipts.
- Installed skill/plugin/agent artifacts, manifests, prompt content, scripts ve dependencies.
- Marketplace publisher identity, trust roots, revocation state ve update channel.
- Running Deckent binary/source/build identity, long-lived daemon/MCP/terminal sessions ve cache state.
- Owner's local-solo usability ile team/enterprise fail-closed governance arasında aynı core semantics.
- Audit/training evidence'in “enforced” label doğruluğu.

### 4.2 Adversary sınıfları

| Sınıf | Yetenek | Beklenen savunma |
|---|---|---|
| A1 Rogue worker | Provider tool/shell üzerinden scope gate'i bypass eder | Isolated staging + effect/landing authority |
| A2 Forged task data | `actor.role`, scope veya capability'yi planner/task artifact'ta yükseltir | Host-resolved principal + signed envelope |
| A3 Anonymous ingress | Role taşımadan enforcement profile'ında operation ister | Missing identity fail-closed |
| A4 Malicious skill publisher | Zararlı SKILL.md/script/dependency yayınlar | Signed provenance + admission + runtime capability |
| A5 ID spoofing | Builtin/trusted skill ID'sini taklit eder | Digest/key-bound identity; ID trust değildir |
| A6 Scanner evasion | Hidden/unreadable/symlink/obfuscated artifact kullanır | Exhaustive inventory; scanner yalnız signal |
| A7 Compromised update source | Önceden güvenilen skill'in yeni version'ını değiştirir | Version-specific re-admission + atomic activation |
| A8 Self-update race | Çalışan runtime source/config değişirken stale process devam eder | Runtime impact fence + coordinated restart |
| A9 Concurrent operator | Owner canonical state'i worker landing sırasında değiştirir | CAS/conflict; no false attribution |
| A10 Tenant admin | Kendi grant'ini başka tenant/project'e taşır | Tenant-bound principal/capability/receipt |

### 4.3 Güvenlik invariant'ları

1. Security-named bir API production caller ve effect boundary olmadan `ENFORCED` sayılmaz.
2. Aynı domain için iki independent policy engine terminal authority üretemez.
3. Human RBAC ile attempt capability authorization aynı kavram değildir.
4. Principal identity task/model prose'undan çözülemez.
5. Enforced profile'da missing/unknown identity permit değildir.
6. Local-solo convenience anonymous allow-all ile sağlanmaz; explicit local-owner principal ile sağlanır.
7. Authorization denial durable typed receipt üretir; indefinite queue/retry değildir.
8. `filesWrite` exact write authority'dir; `directories` implicit write grant değildir.
9. Provider-native tool permission canonical authorization değildir.
10. Protected mutation catalog language/framework/provider-neutral'dır.
11. Runtime-impact kararı security authorization'dan ayrı fakat ona bağlıdır.
12. Static scanner hiçbir artifact'ı tek başına “safe” ilan edemez.
13. Publisher/skill ID content authenticity kanıtı değildir.
14. Install/update active store'a admission öncesi yazamaz.
15. Loader trust-on-first-install yapmaz; her use'ta receipt + digest doğrular.
16. SKILL.md instructions üst authority katmanlarını override edemez.
17. Executable skill/plugin helper'ı ambient host capability ile çalışamaz.
18. Retire işlemi consumer cutover ve negative reachability proof'undan sonra olur.
19. Unsupported platform/security facet silent fallback değil typed HOLD üretir.
20. Observe/shadow mode ürün yüzeyinde enforced claim üretmez.

## 5. Kabul edilen mimari kararlar

### D1 — Strateji `absorb → cut over → retire`

Her legacy module için sıralama:

1. Geçerli primitive/policy intent inventory edilir.
2. Canonical authority contract'ına taşınır.
3. Production ingress/consumer canonical karara cut over olur.
4. Parity ve negative bypass evidence alınır.
5. Legacy exports/callers/tests kaldırılır.
6. Governance inventory no-orphan/no-duplicate proof üretir.

Doğrudan delete bilgi kaybı; doğrudan wire duplicate ve bypassable authority üretir.

### D2 — Security claim function adına değil authority chain'e aittir

Bir mechanism yalnız aşağıdaki closure varsa `ENFORCED` olabilir:

`authenticated ingress → policy snapshot → signed decision → operation/effect chokepoint → settlement/audit`.

Pure boolean helper, warning, prompt veya unit test bu chain'in yerine geçmez.

### D3 — Tool scope canonical capability modeline absorb edilir

`tool-scope-gate.ts` ayrı motor olmaz. Path/resource checks:

- admission'da capability envelope üretirken;
- Tool Gateway operation request'inde;
- Attempt Effect classification'da;
- LandingAuthority'de

aynı canonical resource/action semantics'i kullanır.

### D4 — Pre-check defense-in-depth, effect enforcement structural'dır

Tool Gateway scope dışı operation'ı spawn/execute öncesi deny eder. Buna rağmen arbitrary shell veya
compromised provider bypass edebilir; persistent safety isolated staging + complete effect manifest + landing
veto ile sağlanır. Pre-check ve post-effect layers birbirinin alternatifi değildir.

### D5 — `filesWrite` exact; directory write explicit typed capability'dir

Legacy `directories` write acceptance kaldırılır. Tree-wide write gerekiyorsa root, action kinds, quotas,
file types, link/mount policy ve exclusions taşıyan explicit capability verilir.

### D6 — Human RBAC ve agent capability ayrı contracts'tır

- **Human/Service Authorization:** principal hangi Goal/Mission/Flow/Run/operation'ı isteyebilir?
- **Attempt Capability:** admitted worker/tool hangi exact resources/actions/effects'i kullanabilir?

RBAC `fs-write` gibi coarse capability'yi talep etmeye izin verebilir; exact file grant'i ayrıca capability
policy üretir. Role “engineer” olması project-wide write handle vermez.

### D7 — Principal host tarafından resolve edilir

Canonical principal:

- authenticated API/session/CLI/desktop/service identity;
- tenant/org/project membership;
- issuer, auth strength, session and device context;
- immutable principal receipt reference

taşır. Planner/model/task JSON role atayamaz veya değiştiremez. Task yalnız principal receipt ref'i taşıyabilir.

### D8 — Missing/unknown identity enforcement'ta fail-closed'dur

Migration `observe` profile'ı warning üretip legacy davranışı ölçebilir. `enforce` profile'da:

- no principal;
- unknown issuer;
- missing tenant binding;
- unmapped/unknown role;
- expired/revoked session

`AUTHENTICATION_REQUIRED`, `PRINCIPAL_UNRESOLVED` veya `AUTHORIZATION_DENIED` typed decision üretir.

### D9 — Solo profile explicit owner principal kullanır

Community/solo ergonomisi anonymous allow-all değildir. Local trusted session bootstrap'ı explicit
`local-owner` principal yaratır; project binding, host/user identity, TTL ve audit ref taşır. Aynı core
AuthorizationAuthority çalışır. Enterprise yalnız identity source/policy depth ekler; core fork oluşmaz.

### D10 — Denial requeue değil terminal authority event'idir

Authorization denial transient capacity/collision değildir. Policy açıkça retryable değilse:

- task/attempt spawn edilmez;
- signed decision receipt yazılır;
- logical task typed HOLD/REJECTED olur;
- operator'a exact required/missing permission gösterilir;
- policy revision/new approval yeni attempt/admission lineage'ı yaratır.

### D11 — Self-modification generic Protected Mutation olur

Deckent package adı veya `src/core/` prefix'i security taxonomy değildir. Canonical protected resources:

- agent/system instructions;
- workspace trust, IDE, hooks, provider/MCP config;
- package lifecycle/build/release scripts;
- CI/CD, signing, credentials and policy;
- orchestrator/runtime source and plugins;
- control-plane state;
- executable binaries, services, sockets and autostart entries

olarak cross-language catalog'da sınıflanır.

### D12 — Runtime Impact ayrı karar ve receipt'tir

Authorized protected mutation dahi çalışan runtime'ı etkiliyorsa:

- current build/runtime identity;
- mutated resources;
- required cache invalidation;
- process/session/daemon/MCP reconnect planı;
- version handshake;
- owner coordination;
- rollback and health proof

taşıyan `RuntimeImpactDecision` gerekir. Landing success, restart/reconnect success ile conflated edilmez.

### D13 — Native self-mod confirmation yalnız defense-in-depth'tir

`src/agent/guards/self-modifying.ts` per-call ask floor'u canonical protected-resource classifier'a taşınabilir.
Human confirmation ApprovalAuthority receipt'i üretirse değerli olur; fakat shell/worker/landing boundary claim
etmez. Legacy static pattern listesi eventual olarak retire edilir.

### D14 — Skill/plugin/agent artifacts ortak Artifact Admission trust-plane kullanır

Artifact kind'e göre parsers/analyzers farklı olabilir; canonical flow aynıdır:

`quarantine ingest → exhaustive inventory → provenance/signature → schema/dependencies/permissions → static
analysis → policy/consent → signed admission → atomic activation → trust-on-every-use → revoke/quarantine`.

Plugin admission belgesindeki trust roots ve key lifecycle yeniden icat edilmez.

### D15 — Static analysis signal'dır, verdict değildir

`SkillSandbox` scanner logic'i dürüstçe `StaticArtifactAnalyzer` olarak yaşar. Analyzer:

- findings ve coverage üretir;
- scanner unavailable/read gap'i açıkça raporlar;
- false-positive/false-negative sınırlı bir signal'dır;
- admission policy'nin tek girdisi değildir;
- runtime sandbox/capability yerine geçmez.

`safe:boolean` yerine coverage + findings + analyzer version/digest taşınmalıdır.

### D16 — Builtin trust release provenance'a bağlıdır

Builtin artifact ID allowlist'i authenticity değildir. Builtins:

- signed Deckent release manifest;
- package/release digest;
- exact artifact digest;
- provenance/SBOM;
- revoked release/key status

üzerinden trust alır. Local override aynı ID'yi kullansa dahi builtin trust'i miras alamaz.

### D17 — Install/update side-by-side ve atomic activation'dır

Active skill önce silinmez. Yeni candidate unique quarantine/staging'e alınır, tamamen admitted olur, sonra
versioned active store pointer/CAS atomik değiştirilir. Failure eski active version'ı korur. Activation ve
rollback receipts ayrı yazılır.

### D18 — Trust on every use zorunludur

SkillPool/loader yalnız manifest shape'e güvenmez. Prompt injection veya helper execution öncesi:

- admission receipt signature;
- exact artifact digest;
- enabled/version/policy state;
- revocation and expiry;
- tenant/project binding;
- requested capabilities

yeniden doğrulanır. On-disk drift admission'ı invalidate eder ve artifact quarantined/HOLD olur.

### D19 — SKILL.md untrusted instruction boundary'dir

Installed skill içeriği system/owner/task authority'si değildir. Prompt composer provenance label ve trust
tier taşır; skill instructions:

- higher-precedence policy'yi override edemez;
- capability genişletemez;
- secrets/hidden context isteğini authorize edemez;
- başka skill/agent/tool'u kendiliğinden aktive edemez;
- content-origin ve digest ile training/audit trace'e bağlanır.

### D20 — Executable artifact ambient host'ta çalışmaz

Referenced scripts, hooks, binaries veya dependencies kabul edilmiş provider-neutral execution authority
altında sandbox + Tool Gateway capability ile çalışır. Static scan temizliği process/network/filesystem
authority vermez.

### D21 — Retire kanıtı first-class artifact'tır

Her retired API için:

- zero production/test import;
- zero generated-doc reference except historical evidence;
- replacement authority mapping;
- behavior parity/negative bypass tests;
- schema/config migration;
- owner-visible release note/deprecation path

kanıtlanır. Dead security code bırakılmaz.

## 6. Target authority topology

```text
Authenticated ingress
        |
        v
PrincipalAuthority ---> tenant/org/project role policy
        |                         |
        +------------+------------+
                     v
            AuthorizationAuthority
            (signed ALLOW/DENY/HOLD)
                     |
                     v
          CapabilityEnvelope Authority
                     |
      +--------------+----------------+
      |                               |
      v                               v
Tool Gateway pre-check         Isolated Attempt Staging
      |                               |
      +--------------+----------------+
                     v
             AttemptEffectManifest
                     |
                     v
        ProtectedMutationClassification
                     |
              +------+------+
              |             |
              v             v
       ordinary landing   protected/runtime-impact
              |             |
              |             v
              |      Approval + RuntimeImpactDecision
              |             |
              +------+------+
                     v
               LandingAuthority
                     |
                     v
     LandingReceipt + terminal settlement + audit
```

Artifact plane aynı authority core'una yan taraftan bağlanır:

```text
Git/local/registry/builtin artifact source
                     |
                     v
              Quarantine Ingest
                     |
        +------------+-------------+
        |            |             |
        v            v             v
  inventory     provenance     static analyzers
        |            |             |
        +------------+-------------+
                     v
          ArtifactAdmissionAuthority
       schema + dependencies + permissions
          + policy + consent + revocation
                     |
              +------+------+
              |             |
              v             v
        signed ADMIT     REJECT/HOLD
              |             |
              v             v
       Atomic Activation  Quarantine
              |
              v
     Loader trust-on-every-use
              |
              v
  Prompt provenance / sandboxed helper execution
```

## 7. Normative contracts

### 7.1 `ResolvedPrincipalV1`

| Alan | Semantik |
|---|---|
| `principalId` | Stable subject ID; display name değildir |
| `principalType` | `human`, `service`, `local_owner`, `system_component` |
| `issuer` | Authenticated identity issuer/provider |
| `tenantId`, `organizationId`, `projectBindings` | Exact authority domains |
| `roles` | Host/policy-resolved roles; request-authored değildir |
| `authStrength` | Session/auth assurance class |
| `sessionId`, `deviceId` | Applicable context refs |
| `issuedAt`, `expiresAt` | Bounded validity |
| `revocationEpochRef` | Revocation snapshot |
| `sourceEvidenceRef` | API token/session/OS owner/service identity evidence |
| `issuerKeyId`, `signature` | Tamper-evident resolution |

Role string tek başına principal değildir. Consumer exact signed principal ref'i canonical store'dan doğrular.

### 7.2 `AuthorizationRequestV1`

- operation/goal/flow/run/task/attempt identity;
- principal receipt ref;
- tenant/org/project/resource domain;
- requested action and coarse capabilities;
- exact target/resource selectors;
- origin/ingress/session/correlation/causation refs;
- approval/budget/policy context;
- risk class and protected-mutation candidate flags;
- idempotency key and request digest.

### 7.3 `AuthorizationDecisionV1`

- exact request/principal/policy refs;
- state: `ALLOW`, `DENY`, `HOLD`;
- reason codes and human-display message key/args;
- granted capabilities after narrowing;
- denied/missing capabilities;
- constraints, expiry and single-use/replay semantics;
- required approval/escalation;
- retryability and next-authority action;
- audit event ref;
- issuer/key/signature.

`ALLOW` coarse RBAC kararı exact effect authority değildir; resulting CapabilityEnvelope ref'i ayrıca oluşur.

### 7.4 `ProtectedResourceClassificationV1`

- resource logical/native identity;
- catalog version and matched rules;
- classes: `ordinary_project`, `agent_instruction`, `workspace_trust`, `execution_config`,
  `package_lifecycle`, `ci_release`, `credential_policy`, `control_plane`, `runtime_source`, `binary_service`,
  `external_system`;
- required actions/capabilities/approval tier;
- mutable/immutable/owner-only semantics;
- runtime-impact candidate boolean;
- sensitivity and audit/retention class.

Catalog platform/language adapters ile genişler; unknown execution-capable file default ordinary sayılamaz.

### 7.5 `RuntimeImpactDecisionV1`

- source effect manifest/classification refs;
- current runtime/build identity;
- impacted processes/sessions/daemons/MCP/providers/caches;
- required action set: `none`, `invalidate`, `restart`, `reconnect`, `upgrade`, `rollback`, `owner_hold`;
- safe sequencing and version handshakes;
- active run/sprint constraints;
- owner coordination/approval refs;
- pre/post health evidence requirements;
- state: `CLEAR`, `ACTION_REQUIRED`, `HOLD`;
- decision signature and receipt refs.

### 7.6 `ArtifactCandidateV1`

- candidate ID, kind (`skill`, `plugin`, `agent`, `connector`, `extension`);
- source kind/ref (`local`, `git`, `registry`, `builtin_release`);
- requested version/ref and resolved immutable commit/digest;
- quarantine location identity;
- tenant/project/requesting principal refs;
- acquisition receipt and network/source provenance;
- raw artifact root digest;
- claimed publisher/manifest identity;
- update/replaces relationship.

### 7.7 `ArtifactInventoryV1`

Inventory bütün resource entries için:

- relative logical path + native identity;
- type, size, content/metadata digest;
- symlink/hardlink/reparse/mount status;
- hidden/unreadable/unsupported facet state;
- executable/script/config/instruction classification;
- dependencies/referenced files;
- archive extraction provenance;
- total file/byte/depth counts and quota decisions;
- exhaustive coverage proof or typed gaps.

Unreadable/hidden entry “not scanned” olarak kaybolmaz; inventory gap admission HOLD'dur.

### 7.8 `StaticAnalysisReportV1`

- candidate/inventory exact refs;
- analyzer IDs, versions, rule-set digests;
- analyzed entries and coverage facets;
- findings with severity/confidence/location;
- scanner unavailable/parse/read gaps;
- duration/resource use;
- no `safe` authority boolean;
- report signer/integrity ref.

### 7.9 `ArtifactAdmissionDecisionV1`

- candidate, inventory, manifest, provenance/signature and analyzer refs;
- publisher trust/revocation state;
- schema/dependency/SBOM/licence/policy results;
- requested/granted permissions and owner/admin consent refs;
- prompt-content trust tier;
- runtime sandbox/tool profile refs;
- state: `ADMIT`, `REJECT`, `HOLD`;
- reason codes;
- tenant/project/version binding;
- expiry/recheck conditions;
- signature/key/audit refs.

### 7.10 `ArtifactActivationReceiptV1`

- admitted candidate/decision refs;
- previous/new active version refs;
- atomic activation mechanism;
- active store pointer/digest before and after;
- rollback target;
- loader-visible receipt ref;
- cache/routing invalidation evidence;
- activation principal/time/signature;
- state: `ACTIVE`, `ROLLED_BACK`, `HOLD`.

### 7.11 `ArtifactUseReceiptV1`

- task/attempt and artifact exact IDs;
- admission/activation refs;
- observed current digest;
- prompt slices/files actually delivered;
- granted runtime capabilities;
- revocation snapshot;
- use decision: `ALLOW`, `DENY`, `HOLD`;
- training consent/retention separation;
- audit signature.

## 8. Canonical track A — Tool ve scope authority

### 8.1 Admission

Task scope önce normalized resource request'e çevrilir. Empty `filesWrite` read-only'dir. Planner-derived scope
owner approval veya higher authority olmadan genişleyemez. Closed allowlist ve exact-plan digest varsa
CapabilityEnvelope aynı digest lineage'ına bağlanır.

### 8.2 Tool Gateway pre-check

Her mediated operation:

- exact attempt/principal/capability;
- tool and action;
- normalized logical/native target;
- arguments/payload digest;
- quota/rate/expiry;
- approval requirement

ile authorize edilir. Denial operation receipt üretir. Provider-native `allowedTools` yalnız derived
defense-in-depth projection'dır.

### 8.3 Unmediated shell/process

Arbitrary shell bütün file operations'i Tool Gateway'den geçirmeyebilir. Bu yüzden:

- worker canonical root'a RW erişmez;
- attempt staging isolated'dır;
- external effects gateway dışında yapılamaz veya observed bypass HOLD üretir;
- final manifest exact effect classification yapar;
- LandingAuthority yalnız approved effects'i taşır.

### 8.4 Containment primitive

`scope-check.ts` adapter-aware resource resolver içine absorb edilir. Required enhancements implementation
scope'unda değerlendirilir:

- handle-relative/openat-equivalent TOCTOU-safe operation;
- Windows junction/reparse/ADS/case semantics;
- macOS Unicode/case/resource-fork semantics;
- WSL/mount boundary;
- exact file action kinds;
- symlink/hardlink topology;
- no implicit directory write.

String path sonucu tek başına operation authorization receipt'i değildir.

## 9. Canonical track B — Principal ve RBAC authority

### 9.1 Ingress resolution

Her ingress kendi authenticated evidence'ını PrincipalAuthority'ye verir:

- API/desktop: session/token/SSO/service identity;
- CLI/TUI: OS user + project trust + local session/owner bootstrap;
- MCP: paired host/session principal, generic `mcp-operator` label değil;
- messaging/gateway: paired user/device/tenant;
- scheduler/service: registered service principal;
- internal component: component workload identity.

Task JSON'daki actor object resolved principal'i yeniden tanımlayamaz.

### 9.2 Role/policy resolution

Roles tenant/org/project policy snapshot'ından çözülür. Policy:

- deny overrides;
- role inheritance;
- project/resource bindings;
- separation of duties;
- time/device/network conditions;
- emergency/break-glass;
- org freeze and revocation;
- approval tiers

taşıyabilir. “Admin” global tenant-crossing grant değildir.

### 9.3 Capability narrowing

RBAC coarse allow verdikten sonra capability policy exact resources/actions'i daraltır. Requested authority
granted authority'den genişse request ya narrowed proposal olarak owner'a döner ya deny/HOLD olur; silent
widening yapılmaz.

### 9.4 Denial settlement

Normal sprint `blockedTaskIds` compatibility bridge'i nihai authority değildir. Target:

1. AuthorizationDecision persisted.
2. No attempt/process birth.
3. Task lineage `AUTHORIZATION_DENIED` veya `AUTHORIZATION_HOLD` alır.
4. Retryable only if decision says so.
5. Policy/approval değişikliği new decision + attempt/admission revision üretir.

### 9.5 Profiles

| Profile | Identity | Enforcement |
|---|---|---|
| `local-solo` | Explicit OS/project-bound local owner | Same core; owner policy allows normal local operations |
| `team` | Authenticated users/services + project roles | Missing/unknown deny; audit/approval enforced |
| `enterprise` | SSO/workload identity, org/tenant policy, freeze/SoD | Fail-closed, centrally governed |
| `legacy-observe` | Best-effort identity projection | No enforced claim; time-bounded migration only |

Community-safe ile enterprise fail-closed farklı core implementation'lar değildir.

## 10. Canonical track C — Protected Mutation ve runtime impact

### 10.1 Protected catalog sources

Catalog tek static array değildir. Birleşik sources:

- core cross-project protected patterns;
- language/package-manager adapters;
- provider/IDE/MCP/agent platform adapters;
- project-declared control files;
- runtime build identity/source map;
- enterprise policy overlays;
- discovered executable/config relationships.

Unknown sensitive mutation typed review/HOLD alabilir; catalog öğrenimi automatic allow üretmez.

### 10.2 Admission ve approval

Protected effect requested ise task process birth öncesi:

- exact resources/effect kinds;
- reason and acceptance criteria;
- owner/org approval tier;
- runtime impact plan;
- isolated staging/landing mode;
- rollback evidence

taşımalıdır. Worker'ın sonradan scope dışı protected effect üretmesi whole-attempt quarantine'dır.

### 10.3 Deckent dogfood

Deckent'in kendisini değiştirmesi normal product work olabilir, fakat security exception değildir. Dogfood:

- aynı protected mutation authorization;
- active sprint build/auth prohibitions;
- current runtime/build identity fence;
- no active process cache corruption;
- owner-coordinated restart/reconnect;
- post-restart version/health proof

uygular. “Expected” yalnız business intent'tir, enforcement bypass değildir.

### 10.4 User projects

User project'te ordinary application source modification normal olabilir. Ancak CI, agent instructions,
workspace trust, package scripts ve deployment/signing config protected olabilir. Deckent-specific directory
names user security policy'si olamaz.

### 10.5 Interactive confirmation

Native terminal ask-floor canonical classifier ve ApprovalBroker'a bağlanır:

- localized consequence summary;
- exact resources/effects;
- once/session/persistent grant constraints;
- high-risk operations için persistent grant prohibition;
- signed approval receipt;
- same policy nested/direct paths;
- no approval if identity/policy unavailable.

## 11. Canonical track D — Artifact Admission Authority

### 11.1 Acquisition ve quarantine

Git/local/registry/builtin source unique host-owned quarantine path'e alınır. Path active `.deckent/skills`
altında değildir; loader/routing göremez. Acquisition:

- immutable Git commit/ref resolution;
- registry package digest;
- redirect/source identity;
- transport/TLS evidence where applicable;
- size/count quotas;
- archive traversal/device/link checks;
- tenant/project/request principal binding

receipt'i üretir.

Shared `.tmp-clone` adı kullanılmaz; concurrent project/install collisions ve symlink replacement önlenir.

### 11.2 Exhaustive inventory

Inventory hidden/unreadable files dahil bütün entries'i sayar. Policy dışı large/binary/device/socket/symlink
entry typed finding'dir. `node_modules` veya dependency tree “scan dışında” bırakılacaksa provenance/SBOM ve
runtime package resolution policy'siyle ayrı trust evidence taşır; sessiz skip edilmez.

### 11.3 Manifest ve identity

- directory name, manifest ID ve publisher identity ayrı alanlardır;
- ID path traversal/case/Unicode collision checks geçer;
- version strict semver + immutable artifact digest'e bağlanır;
- entrypoint/referenced files inventory içinde olmalıdır;
- manifest-declared permissions default-deny allowlist'tir;
- unknown fields/version fail-closed veya explicit compatible decoder gerektirir;
- CLI Zod schema ile SkillPool validation tek canonical schema'dan türetilir.

### 11.4 Provenance/signature

- publisher signature exact canonical manifest + inventory root + version'a bağlanır;
- trusted key tenant/org/global trust policy'sinden gelir;
- key expiry/revocation/rotation ve compromised publisher quarantine desteklenir;
- unsigned local artifact yalnız explicit local-dev policy/consent altında kullanılabilir;
- production marketplace upload/install unsigned artifact kabul etmez;
- builtin release signature + package provenance exact digest'e bağlanır.

### 11.5 Static/dynamic analyzers

Static analyzer families:

- source AST and dangerous API usage;
- shell/script commands;
- manifest/permission mismatch;
- secrets/credential harvesting patterns;
- prompt-instruction policy conflicts;
- dependency/SBOM/advisory/licence;
- obfuscation/binary/entropy/anomaly;
- cross-file referenced-resource validation.

Dynamic behavior gerekiyorsa disposable sandbox'ta no-secret/default-deny network/filesystem/process
capability ile çalışır. Analyzer execution artifact'a trust vermez; observation report üretir.

### 11.6 Policy ve consent

Admission policy source trust, findings, permissions, tenant/org rules ve requested use context'ini birleştirir.
Owner/operator UI:

- publisher/source/version/digest;
- requested permissions;
- executable/referenced components;
- analyzer findings/gaps;
- prompt trust implications;
- update diff;
- revoke/rollback behavior

gösterir. Human approval controlled fields'e bağlı signed receipt'tir; generic “install anyway” bütün future
versions'a grant değildir.

### 11.7 Activation/update/rollback

Admitted artifact immutable versioned store'a yayımlanır. Active pointer atomik değişir. Update:

1. Existing version active kalır.
2. Candidate separately acquired/admitted.
3. Permission/source/publisher/version diff owner policy'den geçer.
4. Activation receipt yazılır.
5. SkillPool/routing cache exact new receipt'e invalidate edilir.
6. Health/use proof başarısızsa previous version pointer rollback edilir.

### 11.8 Load/use enforcement

`SkillPoolManager.loadSkills()` canonical ArtifactUseAuthority consumer olur. Invalid/unadmitted/drifted/revoked
artifact routing candidate değildir. Assigned skill use-time'da unavailable ise silent omission veya phantom
credit değil typed `ARTIFACT_USE_HOLD` üretir.

`resolveSkillPrompts()` raw path okumak yerine verified artifact view/receipt üzerinden prompt slice alır.
Delivered content exact digest ve provenance label taşır.

### 11.9 Prompt content boundary

Skill prompt wrapper semantics:

- content third-party/builtin-origin label;
- authority precedence statement;
- capability and data boundaries;
- injection-resistant delimiting/structured envelope;
- maximum token/size quotas;
- embedded external references fetch policy;
- no hidden instruction activation;
- content digest and delivery receipt.

Bu katman content provenance defense'inin parçasıdır; static malicious phrase denylist'i değildir.

### 11.10 Runtime helpers

Skill referenced scripts/data/tools support ediliyorsa:

- declared manifest entry;
- inventory/provenance coverage;
- explicit permissions;
- provider-neutral sandbox;
- Tool Gateway network/process/secret/filesystem mediation;
- AttemptEffectManifest and receipts;
- no execution from active artifact directory with ambient host credentials.

## 12. Lifecycle ve failure semantics

| Olay | Canonical davranış | Yasak fallback |
|---|---|---|
| Principal missing | Pre-admission `PRINCIPAL_UNRESOLVED` HOLD | Role-less permit |
| Role unknown | Deny/HOLD + policy action | Unknown=admin/operator |
| RBAC deny | Durable decision, no process birth | Collision gibi endless requeue |
| Capability scope outside | Request deny/narrow; signed receipt | Prompt warn-only |
| Tool Gateway unavailable | Mutating/external operation HOLD | Provider tool direct fallback |
| Unmediated staging effect | Manifest unexpected/prohibited; quarantine | Result claim'e güven |
| Protected mutation undeclared | Whole attempt HOLD | “Dogfood” exemption |
| Runtime impact unresolved | Landing HOLD | Stale process ile devam |
| Artifact source fetch failure | Candidate HOLD, active old version intact | Partial active directory |
| Inventory unreadable/gap | Admission HOLD | Skip and safe=true |
| Analyzer unavailable | Coverage gap; policy HOLD/explicit unsupported | Clean report |
| Signature missing/invalid | Policy reject/HOLD | ID allowlist trust |
| Trust key revoked | New use denied; active artifact quarantine policy | Cached trust devamı |
| Install activation failure | Roll back pointer; receipt | Active dir delete/partial copy |
| On-disk artifact drift | Use HOLD + quarantine | Manifest shape ile yükle |
| SKILL.md missing | Typed use HOLD | Silent prompt omission + credit |
| Helper requests undeclared capability | Tool deny + audit | Ambient host access |
| Runtime restart failure | RuntimeImpact HOLD + rollback/recovery | Landing fully settled claim |

## 13. Config ve rollout contract'ı

Exact config key names implementation session'ında existing schema/migration patterns'i incelenerek
kesinleştirilir. Bu belgede davranış normative'dir.

### 13.1 Authority mode

| Mode | Davranış | Claim |
|---|---|---|
| `observe` | Legacy decisions + canonical shadow evidence; no behavioral veto | Advisory/measurement only |
| `shadow` | Canonical decision hesaplanır ve divergence persisted; legacy effect path devam edebilir | Enforced claim yok |
| `enforce` | Canonical decision chokepoint'tir; missing facet HOLD | Supported capability için enforced |

Mode global boolean değil capability/ingress/adapter coverage ile resolve edilir. Bir path enforce, diğeri
legacy ise ürün global “RBAC enforced” veya “skill sandboxed” diyemez.

### 13.2 `enforce_rbac` migration

Legacy key:

- current semantics için versioned migration projection taşır;
- unknown/missing role allow behavior telemetry ile ölçülür;
- canonical principal/profile config hazır olduğunda deprecated olur;
- enterprise/team enforce profile'da missing identity deny olur;
- final core authorization key'den bağımsız always-on decision chain'dir.

Key'in yalnız default true yapılması kabul edilen çözüm değildir; identity source çözülmeden widespread false
deny veya yine no-op üretir.

### 13.3 Artifact policy profiles

- allowed sources/registries/Git hosts;
- required publisher signatures/trust roots;
- unsigned local policy;
- analyzer requirements/severity thresholds;
- permission allow/deny/approval tiers;
- dynamic analysis requirement;
- revocation freshness/SLA;
- activation/update/rollback policy;
- retention/quarantine quotas;
- tenant/project overrides and org freeze.

### 13.4 Protected mutation policy

- catalog sources/version;
- owner/org approval tiers;
- runtime impact requirements;
- active sprint/run prohibitions;
- break-glass profile;
- restart/reconnect adapters;
- unsupported environment behavior.

### 13.5 Break-glass

Break-glass:

- authenticated principal;
- exact operation/artifact/resource/attempt;
- short TTL/single use;
- reason/ticket;
- explicit unsupported risk disclosure;
- no compliance/training/promotion eligibility;
- immutable audit and post-effect scan;
- owner/admin policy approval

gerektirir. Generic `--force`, `--no-sign` veya unknown role break-glass değildir.

## 14. Observability ve operator UX

### 14.1 Terminal

Terminal progressive disclosure en az şunları gösterir:

- resolved principal/tenant/project role;
- authorization ALLOW/DENY/HOLD and reason;
- requested vs granted capabilities;
- protected mutation/runtime impact;
- artifact source/publisher/version/digest;
- requested permissions/analyzer findings/coverage;
- admission/activation/use receipt refs;
- quarantine/revocation/update/rollback state;
- legacy/observe/shadow/enforce mode.

Human-readable strings existing i18n mechanism'inden gelir; mechanism modules user-facing strings hardcode
etmez.

### 14.2 Metrics

- identity resolution success/missing/unknown by ingress;
- RBAC deny/warn/allow by role/capability without sensitive cardinality leak;
- authorization queue/HOLD resolution latency;
- legacy vs canonical decision divergence;
- protected mutation and runtime-impact counts;
- artifact admission/reject/HOLD by source/reason;
- signature/revocation/analyzer coverage state;
- use-time digest drift/quarantine;
- activation/rollback/restart success;
- legacy API production reachability count (target zero).

### 14.3 Audit

Every principal resolution, authorization, capability issue, artifact acquisition/admission/activation/use,
protected mutation, runtime impact, approval, landing and retirement decision causal refs ile tamper-evident
audit chain'e girer. Raw tokens/secrets/artifact contents audit payload'ına girmez.

## 15. Storage, tenancy ve scale

### 15.1 Stores

| Store | İçerik | Authority özelliği |
|---|---|---|
| Principal/Policy store | identities, memberships, roles, revocation | Tenant-bound, signed/versioned |
| Decision store | authorization/capability decisions | Immutable/idempotent |
| Artifact quarantine | untrusted candidates | No-execute, isolated |
| Artifact CAS | admitted immutable bytes/inventory | Digest-bound, encrypted |
| Activation index | active version pointers/rollback | Transactional/CAS |
| Audit store | causal decision refs | Tamper-evident/external anchor |
| Projection cache | UI/search/routing summaries | Rebuildable, non-authoritative |

### 15.2 Multi-tenant isolation

- principal receipt tenant-bound;
- role/project membership cross-tenant reusable değildir;
- artifact admission global publisher trust'ten yararlansa bile tenant policy decision'ı ayrıdır;
- content digest possession access grant değildir;
- quarantine and activation namespaces tenant/project isolated'dır;
- encryption keys, retention and revocation policy tenant-aware'dır.

### 15.3 Scale

- policy decisions cacheable fakat policy/revocation epoch-bound;
- artifact CAS dedupe logical authorization'ı bypass etmez;
- inventory/analyzer reports chunked deterministic roots taşır;
- install/update jobs async durable state machine olabilir;
- backpressure source bytes/evidence drop etmez;
- revocation fan-out indexed active-use graph üzerinden yürür;
- millions of projects için bounded metrics labels ve paginated audit/search;
- offline local mode pinned trust snapshot freshness'ini dürüstçe gösterir.

## 16. Implementation work packages

Yeni file names responsibility önerisidir; implementation session mevcut architecture ve naming collisions'i
incelemeden canonical kabul etmez.

### W1 — Reachability inventory ve disposition registry

**Amaç:** Dört legacy API ile bütün alternative/duplicate authority paths'in canonical machine-readable
inventory'sini çıkarmak.

**Touchpoints:**

- `src/core/tool-scope-gate.ts`
- `src/core/scope-check.ts`
- `src/agents/worker.ts`
- `src/orchestra/authority-enforcer.ts`
- `src/nervous/authority-matrix.ts`
- `src/orchestra/self-modifying-detector.ts`
- `src/agent/guards/self-modifying.ts`
- `src/core/marketplace/skill-sandbox.ts`
- governance orphan/production-wiring tests

**Deliverables:**

- `LegacyEnforcementDispositionV1` registry/evidence.
- Exact production/test/generated-doc callers.
- `absorb`, `replace`, `retire`, `historical-only` typed states.
- Canonical owner/dependency refs.
- No premature code deletion.

### W2 — Canonical principal ve AuthorizationAuthority

**Hard owner:** `ENTERPRISE-AUTH-001`.

**Touchpoints:**

- API/session/auth ingress
- CLI/TUI local owner bootstrap
- MCP/gateway pairing
- `src/core/work-model.ts`
- `src/core/task-types.ts`
- `src/orchestra/execution-request-builder.ts`
- `src/nervous/authority-matrix.ts`
- `src/orchestra/sprint-runtime.ts`
- `src/orchestra/autonomous/runtime-loop.ts`

**Proposed boundaries:**

- `src/core/principal-authority.ts`
- `src/core/authorization-contract.ts`
- `src/orchestra/authorization-authority.ts`

**Deliverables:** host-resolved principal, signed decisions, profile semantics, missing identity fail-closed,
tenant/project roles, revocation, typed denial settlement and audit.

### W3 — Capability/resource semantics ve Tool Gateway integration

**Hard owner:** `TOOL-AUTHORITY-001`; hard dependency accepted Bulgu 4/5.

**Deliverables:**

- exact resource/action capability model;
- empty `filesWrite` read-only;
- explicit typed tree write;
- adapter-aware containment;
- Tool Gateway decision/operation receipts;
- provider flag derivation;
- AttemptEffect/Landing consumers;
- legacy `tool-scope-gate` behavior divergence proof.

### W4 — RBAC production cutover ve terminal settlement

**Touchpoints:**

- `src/orchestra/sprint-spawner.ts`
- `src/orchestra/sprint-runtime.ts`
- `src/orchestra/backlog-trigger.ts`
- `src/orchestra/autonomous/runtime-loop.ts`
- task/attempt settlement and terminal evidence

**Deliverables:**

- no task-authored trusted role;
- all ingress principal refs;
- deny/HOLD receipts;
- no indefinite collision-style defer;
- policy revision/new attempt lineage;
- local/team/enterprise parity;
- legacy `enforce_rbac` migration telemetry.

### W5 — Protected Resource ve Runtime Impact Authority

**Hard owner:** `TRUST-HANDOFF-001`.

**Proposed boundaries:**

- `src/core/protected-resource-catalog.ts`
- `src/orchestra/protected-mutation-authority.ts`
- `src/orchestra/runtime-impact-authority.ts`

**Deliverables:** cross-language catalog, planner/admission classification, effect-manifest classification,
ApprovalBroker integration, build/runtime identity, restart/reconnect/version/health/rollback receipts and
dogfood/user-project parity.

### W6 — Artifact candidate, inventory ve provenance foundation

**Hard owners:** `SUPPLY-CHAIN-001`, `AGENT-SKILL-001`.

**Touchpoints:**

- `src/cli/commands/skill.ts`
- `src/cli/commands/skill-marketplace.ts`
- marketplace registry/signature modules
- accepted plugin admission authority components
- platform filesystem adapters

**Proposed boundaries:**

- `src/core/artifact-admission-contract.ts`
- `src/core/artifact-inventory.ts`
- `src/core/artifact-provenance.ts`
- shared quarantine/CAS service

**Deliverables:** unique quarantine ingest, exhaustive inventory, source/digest/signature/trust/revocation,
schema/SBOM/dependencies/permissions, every-environment link/path semantics.

### W7 — Static analyzer refactor

**Amaç:** `SkillSandbox` misleading security claim'ini honest analyzer'a dönüştürmek.

**Deliverables:**

- versioned `StaticAnalysisReportV1`;
- no `safe:boolean` authority;
- unreadable/hidden/scanner-unavailable coverage gaps;
- analyzer plugin registry under governed execution;
- current regex/AST rules migrated with parity tests;
- false-positive policy separate from analyzer;
- `requireSafe` deprecation.

### W8 — Artifact Admission, activation ve trust-on-every-use

**Hard owner:** `PLUGIN-SANDBOX-001` for runtime capability; `SUPPLY-CHAIN-001` for provenance.

**Touchpoints:**

- skill install/update/create/publish/enable/disable commands
- `src/core/skill-pool.ts`
- `src/orchestra/sprint-planner.ts`
- `src/orchestra/result-collector.ts`
- `src/orchestra/routing-plan-adapter.ts`
- cache/routing/activation modules

**Deliverables:** decision/consent, versioned active store, atomic activation/rollback, use receipt/digest verify,
revocation/quarantine, prompt provenance, typed assigned-skill HOLD, helper sandbox/capabilities.

### W9 — Legacy cutover ve retirement

**Retire candidates after closure:**

- `src/core/tool-scope-gate.ts` standalone policy wrapper;
- `src/agents/worker.ts:checkWorkerAuthority` duplicate API;
- `src/orchestra/self-modifying-detector.ts:enforceSelfModifyingTask` and eventual static pattern authority;
- `SkillSandbox.requireSafe` and misleading class name/`safe` claim;
- obsolete config/comments/tests/docs implying enforcement.

**Deliverables:** zero imports, migration release notes, config decoder compatibility, negative production
reachability test and no duplicated decision engine.

### W10 — Assurance, every-environment ve XVerify

**Deliverables:**

- canonical producer→consumer→ingress→policy enablement maps;
- real-binary CLI/TUI/API/MCP/autonomous/sprint flows;
- Linux/macOS/Windows native/WSL/OCI/remote adapter proofs;
- concurrency/crash/revocation/outage/scale drills;
- malicious skill/prompt/script corpus;
- identity/tenant escalation corpus;
- audit/receipt integrity;
- fresh second-provider XVerify; unavailable ise typed HOLD;
- `ASSURANCE-PACK-001` compatible evidence index.

## 17. Dependency DAG ve rollout

```text
Accepted Bulgu 4 Execution Authority ----+
Accepted Bulgu 5 Effect Authority -------+------> W3 Tool/Scope Capability
                                         |               |
W1 Reachability/Disposition -------------+               |
        |                                                v
        +----> W2 Principal/Authorization -------> W4 RBAC Cutover
        |                                                |
        +----> W5 Protected/Runtime Impact <-------------+
        |
        +----> W6 Artifact Inventory/Provenance
                         |
                  +------+------+
                  |             |
                  v             v
            W7 Analyzers   Plugin Admission dependency
                  |             |
                  +------+------+
                         v
             W8 Admission/Activation/Use
                         |
             +-----------+-----------+
             |                       |
             v                       v
       W9 Legacy Retirement     W10 Assurance/XVerify
```

Rollout sırası:

1. Reachability/disposition baseline and schema contracts.
2. Principal resolution + shadow AuthorizationDecision.
3. Capability/Tool/Effect/Landing integration.
4. RBAC deny settlement and owner-approved enforce ratchet.
5. Protected mutation/runtime impact shadow→enforce.
6. Artifact quarantine/inventory/provenance foundation.
7. Static analyzer refactor and admission shadow.
8. Skill install/update/publish cutover to admission.
9. Loader trust-on-every-use and prompt/runtime enforcement.
10. Legacy APIs/config claims deprecate/retire.
11. Every-environment real-binary proof and fresh XVerify.

W9, W2–W8 production closure olmadan başlayamaz. Dead code removal tamamlanmış authority yerine geçmez.

## 18. Acceptance gates

### 18.1 Reachability ve disposition

- [ ] Dört exact legacy API'nin bütün production/test/generated-doc imports inventory'si artifact olarak vardır.
- [ ] Her legacy behavior canonical replacement contract'a map edilmiştir.
- [ ] Canonical consumer cutover olmadan legacy API silinmez.
- [ ] Cutover sonrası production bundle/reachability scan legacy API'leri bulmaz.
- [ ] Security docs/config/UI retired mechanisms'i `ENFORCED` göstermemektedir.
- [ ] Duplicate authority decision aynı operation için iki terminal verdict üretmez.

### 18.2 Principal/RBAC

- [ ] CLI/TUI local-solo run explicit signed local-owner principal taşır.
- [ ] API authenticated principal role/tenant/project bindings host tarafından resolve edilir.
- [ ] MCP generic actor label tek başına authority değildir; pairing/session principal gerekir.
- [ ] Missing principal enforce profile'da deny/HOLD olur.
- [ ] Missing role enforce profile'da allow-all olmaz.
- [ ] Unknown role enforce profile'da allow-all olmaz.
- [ ] Expired/revoked session new operation admission'ını bloklar.
- [ ] Task/model actor role yazıp authority yükseltemez.
- [ ] Cross-tenant principal/project binding reddedilir.
- [ ] Viewer write/shell/network capability request'i deny receipt üretir.
- [ ] Authorized engineer coarse fs-write exact project scope'u aşamaz.
- [ ] Admin role tenant/project/resource constraints'i bypass etmez.
- [ ] Authorization denial process/attempt birth üretmez.
- [ ] Denied normal sprint task collision loser gibi sonsuza kadar requeue edilmez.
- [ ] Policy change/re-approval new immutable decision lineage üretir.
- [ ] `legacy-observe` enforced claim üretmez.

### 18.3 Tool/scope

- [ ] Empty `filesWrite` persistent effect read-only violation olur.
- [ ] `directories` exact filesWrite varken implicit write grant değildir.
- [ ] Explicit tree capability root/action/type/quota/link/mount restrictions'i uygular.
- [ ] Symlink escape pre-check ve final effect classification'da reddedilir.
- [ ] Path pre-check ile operation arasındaki TOCTOU handle-relative/platform-equivalent çözülür veya HOLD olur.
- [ ] Provider `Bash`/child process gate'i bypass etse staging effect landing'de yakalanır.
- [ ] Tool Gateway unavailable mutating operation direct-provider fallback yapmaz.
- [ ] Provider-native allowlist canonical receipt olmadan authorization claim üretmez.
- [ ] Windows junction/reparse/ADS/case, macOS Unicode/case/xattr, WSL/mount matrix kanıtlıdır.

### 18.4 Protected mutation/runtime impact

- [ ] Deckent source/config mutation “dogfood” gerekçesiyle otomatik advisory olmaz.
- [ ] User project CI/workspace/agent/MCP/package script mutation protected sınıflanır.
- [ ] Unknown execution-capable config ordinary file diye silent allow edilmez.
- [ ] Undeclared protected effect whole attempt quarantine/HOLD üretir.
- [ ] Declared protected mutation required approval receipt olmadan landing alamaz.
- [ ] Running binary/source identity mismatch runtime-impact HOLD üretir.
- [ ] Active sprint build/auth prohibition runtime impact planında uygulanır.
- [ ] Required restart/reconnect/version handshake tamamlanmadan final success claim edilmez.
- [ ] Restart failure rollback/recovery receipt üretir.
- [ ] Native direct/nested tool paths same protected classifier/approval semantics taşır.

### 18.5 Artifact acquisition/inventory/provenance

- [ ] Git/local/registry candidate active `.deckent/skills` dışında unique quarantine'a alınır.
- [ ] Concurrent installs shared `.tmp-clone` collision yaşamaz.
- [ ] Git ref immutable commit/digest'e resolve edilir.
- [ ] Path traversal, archive traversal, symlink/junction/reparse/mount escape reddedilir.
- [ ] Hidden file inventory'de görünür ve policy/analyzer coverage alır.
- [ ] Unreadable file/directory admission `safe` değil HOLD üretir.
- [ ] File count/size/depth quota exhaustion partial activation yaratmaz.
- [ ] Builtin ID spoof local artifact'a builtin trust vermez.
- [ ] Signature exact manifest + inventory root + version'a bağlıdır.
- [ ] Invalid/missing/revoked signature policy'ye göre reject/HOLD olur.
- [ ] Registry production upload/install unsigned artifact'ı kabul etmez.
- [ ] SBOM/dependency/referenced files inventory ile tutarlıdır.
- [ ] CLI install schema ile SkillPool load schema tek canonical definition'dan türetilir.

### 18.6 Analyzer/admission

- [ ] TypeScript scanner unavailable temiz scan sayılmaz.
- [ ] Analyzer parse/read gap report coverage'ında görünür.
- [ ] Static report tek başına ADMIT kararı üretemez.
- [ ] Obfuscated dangerous code, shell helper ve permission mismatch corpus'u findings üretir.
- [ ] False positive owner bypass bütün future versions'a persistent trust vermez.
- [ ] Requested permissions admission UI/receipt'te görünür.
- [ ] Consent exact artifact digest/version/permissions'e bağlıdır.
- [ ] Analyzer process'i candidate'ın ambient host/network/secrets access'ine sahip değildir.

### 18.7 Activation/update/use

- [ ] Failed update existing active version'ı silmez/değiştirmez.
- [ ] Activation pointer atomik CAS + receipt ile değişir.
- [ ] Post-activation failure previous version'a rollback edebilir.
- [ ] Enable command unadmitted artifact'ı aktive edemez.
- [ ] Loader admission/activation receipt + current digest doğrular.
- [ ] On-disk drift use HOLD + quarantine üretir.
- [ ] Revoked artifact new routing/prompt use alamaz.
- [ ] Assigned skill unavailable olduğunda typed artifact HOLD oluşur; silent omission/phantom credit olmaz.
- [ ] Delivered SKILL.md exact digest/provenance/use receipt taşır.
- [ ] Skill instruction system/owner/task policy veya capability'yi override edemez.
- [ ] Referenced executable helper provider-neutral sandbox + Tool Gateway dışında çalışamaz.
- [ ] Training trace artifact use receipt ve consent'i ayrı taşır.

### 18.8 Assurance ve scale

- [ ] Authorization/audit/key/policy/CAS outage silent permissive fallback üretmez.
- [ ] Revocation fan-out active uses'i bounded süre içinde bloklar.
- [ ] Large artifact inventory/analyzer bounded memory/backpressure ile çalışır.
- [ ] High concurrency install/activation idempotent ve tenant-isolated'dır.
- [ ] Crash during quarantine/admission/activation exactly-once recovery üretir.
- [ ] Linux, macOS, Windows native, WSL, OCI ve declared remote paths real-binary artifact taşır.
- [ ] UI/metrics observe-shadow-enforce state'ini dürüstçe gösterir.
- [ ] Fresh verifier output provider'dan farklıdır; unavailable ise closure HOLD'dur.

## 19. Non-goals ve yanlış `COMPLETE` iddiaları

### 19.1 Non-goals

- Her local file edit için enterprise SSO zorunlu kılmak.
- Local-solo kullanıcıyı anonymous authority ile temsil etmek.
- Modelin iç reasoning'ini authorization evidence saymak.
- Static analysis ile malware absence ispatlamak.
- Skill/plugin artifacts'i yalnız manifest shape'e indirgemek.
- Auditor veya SkillPool içine ikinci policy engine koymak.
- Geçmiş unadmitted artifact uses için synthetic trust receipt üretmek.

### 19.2 Aşağıdakiler `COMPLETE` değildir

- Dört unused function'a rastgele production caller eklemek.
- `tool-scope-gate` mode default'unu yalnız `enforce` yapmak.
- Provider `allowedTools` içine path filter koyup shell bypass'ı yok saymak.
- `enforce_rbac` default'unu true yapıp missing role allow davranışını bırakmak.
- Task JSON içine `role:'admin'` veya `role:'engineer'` yazmak.
- Denied task'ı yalnız blocked queue'da bırakmak.
- `self_mod_enforce` key'i ekleyip static Deckent pattern'lerini korumak.
- Deckent dogfood'u blanket advisory bırakmak.
- `requireSafe()` çağrısını install'a ekleyip ID trust/unreadable skip'i bırakmak.
- `SkillSandbox` static scan'ini runtime sandbox diye sunmak.
- Publish scan/signature'ını consumer-side install trust'i saymak.
- Checksum'u install sonrası non-fatal metadata olarak üretmek.
- Active skill'i önce silip sonra validation yapmak.
- Builtin skill'i yalnız ID ile trusted saymak.
- Loader'da manifest doğrulayıp admission receipt/digest doğrulamamak.
- SKILL.md'yi provenance'sız privileged instructions olarak prompt'a eklemek.
- Schema/contracts yazıp production ingress/consumer/settlement bağlamamak.
- Yalnız unit tests ile every-environment/real-binary claim yapmak.
- Same-provider self-verify ile assurance closure yapmak.

## 20. MASTER-PLAN eşleme

| Ledger | Rol | Bu kararın etkisi |
|---|---|---|
| `SEC-ENFORCE-WIRE-001` (4200) | **Umbrella disposition owner** | Unwired/inert security code wire-or-retire closure |
| `TOOL-AUTHORITY-001` (4060) | Tool/scope owner | Scope primitive, Tool Gateway ve exact capability enforcement |
| `ENTERPRISE-AUTH-001` (4140) | Principal/RBAC owner | Solo/team/enterprise fail-closed profiles ve identity resolution |
| `TRUST-HANDOFF-001` (4180) | Protected/runtime-effect owner | Protected mutation, runtime impact and landing trust transfer |
| `SUPPLY-CHAIN-001` (7020) | Artifact provenance owner | Publisher identity, digest, SBOM, update/revoke chain |
| `PLUGIN-SANDBOX-001` (7030) | Runtime capability owner | Skill/plugin executable isolation and permissions |
| `AGENT-SKILL-001` (7010) | Catalog/manifest owner | Versioned skill identity, manifest and use semantics |
| `SEC-OWASP-ASI-001` (4190) | Assurance parent | ASI02/03/04/05/10 gap mapping and closure evidence |

Bu belge `docs/MASTER-PLAN.md` üzerinde mutation yapmaz. Implementation session ledger'ın güncel
state/dependencies/evidence'ını yeniden okuyup owner-approved work slicing'i canonical satırlara bağlamalıdır.

## 21. Başka session'a doğrudan iş-planı girdisi

1. Bu belgeyi ve header'daki üç hard architecture dependency belgesini tamamen oku.
2. `SEC-ENFORCE-WIRE-001` ile domain owner ledger satırlarının güncel state/evidence/dependencies'ini doğrula.
3. W1 reachability inventory'sini fresh production graph üzerinden çıkar; bu belgedeki absence iddiasını stale
   kabul edip kör kullanma.
4. W1–W10'u dependency-bound Goal/Mission/Flow graph'ına dönüştür; foundation slice'ını exact cutover/retire
   closure task'ına bağla.
5. Effective config, provider/model, identity source, platform adapter, concurrency, budget ve admission'ı repo
   policy'den çöz; instruction metninden hardcode etme.
6. Implementation'ı Deckent'in Goal/Mission/Flow/Run/Autonomous/Do dogfood yüzeylerinden yürüt; manual seam
   kullanılırsa typed bootstrap/recovery evidence üret ve ilk güvenli sınırda dogfood'a dön.
7. Her slice için producer → consumer → entrypoint/ingress → policy/config enablement → effect/settlement zinciri
   kanıtlanmadan DONE verme.
8. Observe→shadow→enforce ratchet'i owner-approved telemetry ile ilerlet; unsupported identity/platform/artifact
   facet'te silent fallback verme.
9. Legacy APIs yalnız replacement production closure + negative reachability proof sonrası retire edilsin.
10. Real-binary proof'u CLI/TUI/API/MCP/autonomous/sprint ve every-environment matrix'e bağla.
11. Final output farklı fresh provider ile XVerify edilsin; unavailable ise typed HOLD bırakılsın.

## 22. Definition of Done

Bu çalışma ancak aşağıdakilerin tamamıyla DONE'dır:

- bütün production ingress'ler host-resolved signed principal taşır;
- enforce profile'da missing/unknown identity fail-closed'dur;
- human RBAC ile attempt capability ayrı fakat causal olarak bağlı contracts'tır;
- authorization denial durable receipt + terminal state üretir, endless defer değildir;
- exact tool/resource scope Capability/Tool/Effect/Landing authority chain'inde enforced'dır;
- `directories` implicit write grant değildir;
- protected mutation ve runtime impact cross-language authority olarak production-wired'dır;
- Deckent dogfood self-update security exception değildir;
- skill/plugin/agent install/update quarantine→inventory→provenance→policy→activation zincirinden geçer;
- static analyzer coverage signal'dır, sandbox/safety authority değildir;
- builtin trust exact signed release/artifact digest'e bağlıdır;
- loader her use'ta admission/activation/digest/revocation doğrular;
- SKILL.md provenance-bound untrusted instruction content olarak compose edilir;
- executable artifact helpers provider-neutral sandbox + Tool Gateway dışına çıkamaz;
- dört legacy exact API ve duplicate policy paths replacement closure sonrası retired'dır;
- no-orphan/no-duplicate production reachability evidence vardır;
- every-environment, concurrency, crash, revocation, outage ve scale proof'ları artifact-bound'dır;
- acceptance gates assurance evidence index'ine bağlanmıştır;
- independent cross-provider verdict vardır veya typed HOLD açık kalır.
