# Deckent Configuration Product Completion Plan

## 1. Hüküm ve plan sınırı

Deckent configuration sistemi bugünkü haliyle ürün-bitmiş sayılamaz. Sorun yalnız birkaç eksik
default değildir; authored document, effective runtime truth, secret custody, migration, concurrent
mutation, operator surfaces ve behavioral consumer'lar farklı authority'lerden beslenmektedir.

Bu plan pinned `ff48978fb78139ea34b8c5e98fc41532437af9c9` gerçeği üzerinde hazırlanmıştır. Audit
ürün kodu değiştirmez ve `docs/MASTER-PLAN.md` içine kendiliğinden yeni iş yazmaz. Aşağıdaki
paketler mevcut owner-admitted work item'lara closure dilimleri olarak bağlanır; yeni ledger
identity ancak Alperen ayrıca admit ederse açılır.

## 2. Tamamlanmış ürün contractı

Configuration yaşam döngüsü tek causal chain olmalıdır:

```text
authored source
  -> strict parse + version recognition
  -> alias/deprecation canonicalization
  -> global/project/tenant/environment policy layers
  -> pure resolution + provenance
  -> immutable effective snapshot + digest
  -> Run/Attempt admission binding
  -> behavioral consumers
  -> redacted operator projection + audit receipt
```

### 2.0 Kullanıcı işi ve Golden Workflow

| Kullanıcı | Asıl iş |
|---|---|
| İlk-run/solo | Güvenli önerilerle başlamak, hangi ayarın gerçekten etkin olduğunu anlamak ve bozuk configten veri kaybetmeden çıkmak |
| Expert operator | Authored/effective farkını, source precedence'i, reload/restart etkisini ve exact diff'i hızlıca yönetmek |
| Team administrator | Shared policy ile project override'larını yetki, audit ve concurrent mutation güvenliğiyle yönetmek |
| Regulated enterprise | Tenant inheritance, deny precedence, secrets, approvals, retention, legal hold ve config-attributed run evidence'ını kanıtlamak |

Golden Workflow bütün primary surface'lerde aynı semantic chain'dir:

```text
inspect authored + effective + provenance
  -> edit semantic patch
  -> validate + impact/risk diff
  -> bounded approval when policy requires
  -> revision-aware apply
  -> runtime acknowledgement/reload or restart-required state
  -> behavioral verification
  -> durable receipt
  -> rollback or reconcile when partial/failed
```

Approval request'i requestor, principal, tenant/project/environment, exact paths, redacted
before/after, sensitivity/risk, expiry, intended runtime impact, in-flight run consequence ve
rollback/reconciliation sınırını taşır. Denied/expired request kaybolmaz; revised patch veya
policy remediation recovery path'ine gider. MCP approval inbox/decision sınırı mevcut project
authority'sine uyar: config mutation MCP capability'si olsa bile genel approval decision MCP'ye
taşınmaz.

Terminal ve Desktop live değişiklikleri yalnız renkle bildirmez: `validation failed`, `approval
required`, `applied to revision`, `reload pending`, `restart required`, `superseded` ve `rollback
complete/partial` durumları stable textual carrier, focus-preserving update ve screen-reader
announcement contractı taşır.

Bu zincirin authoritative nesneleri:

| Nesne | Sorumluluk | Yasak |
|---|---|---|
| `ConfigDescriptorRegistry` | Path, type, conditional requirement, scope, default semantics, sensitivity, mutability, aliases, platform support, consumer ve lifecycle metadata'sı | UI veya docs içinde ikinci field/default listesi |
| `AuthoredConfigDocument` | Kullanıcının versioned, sparse ve strict document'ı | Runtime-derived state, plaintext secret, sessiz unknown key |
| `ConfigLayer` | Global/project/tenant/environment/request kaynak değeri ve authority/provenance | Kaynağı bilinmeyen overwrite |
| `ResolvedConfigSnapshot` | Pure resolver çıktısı; her değerin source, effective value ve reason'ı; immutable revision/digest | Consumer-local fallback ile gizli semantic değişim |
| `SecretReference` | Secret Broker tarafından çözülen opaque reference | Config/API/MCP/log/backup içinde raw secret |
| `ConfigMutationReceipt` | Actor, principal, tenant/project, base revision, patch, validation, impact, result ve before/after digest | Sonucu kanıtsız "success" saymak |
| `ConfigMigrationReceipt` | From/to schema, transforms, lossless fields, backup identity, rollback ve result | Read sırasında görünmez mutation |
| `RuntimeState` | Detection, health, cache, active model/provider, live limits ve transient facts | Bunları authored config alanı gibi persist etmek |

### 2.1 Default taxonomy

Her path tam olarak aşağıdaki default sınıflarından birini taşır:

- `NO_DEFAULT`: absent olmanın kendi anlamı vardır.
- `EFFECTIVE_DEFAULT`: resolver absent authored value için tek semantic değer üretir.
- `STARTER_VALUE`: init/onboarding'in kullanıcıya yazdığı öneridir; effective default değildir.
- `SAFETY_FALLBACK`: yalnız typed failure/recovery dalında kullanılır ve reason taşır.
- `POLICY_INHERITED`: üst scope'tan gelir; local default gibi gösterilmez.
- `PLATFORM_RESOLVED`: platform capability evidence ile çözülür; unsupported ise typed `HOLD`.

`mode`, `memory_budget`, `decay_after_sprints`, `spawn_backend`, `docker_timeout` ve
`dependency_pipeline_enabled` için mevcut conflicting değerler owner-approved tek semantic
karara bağlanmadan generated projection yenilenmez.

### 2.2 Field lifecycle

Her field descriptor şu lifecycle'dan birini taşır:

| Durum | Ürün davranışı |
|---|---|
| `ACTIVE` | Authorable, resolvable, behavioral consumer ve proof zinciri tam |
| `OPT_IN` | Absent geçerli; parent present olduğunda required child'lar strict validate edilir |
| `DEPRECATED` | Canonical replacement, diagnostic, sunset version ve lossless migration vardır |
| `INTERNAL` | Authored documentta reddedilir; runtime state namespace'inde yaşar |
| `RESERVED` | Henüz davranış yoktur; normal configte authorable veya enabled gösterilmez |
| `PLATFORM_UNSUPPORTED` | Platform ve gerekçe typed; başka davranışa sessiz fallback yoktur |
| `REMOVED` | Eski input explicit diagnostic/migration alır; silent no-op değildir |

`prompt.adr_render` özelinde mevcut code truth binding ADR'ı `full`, background ADR'ı
`operative` seçen iki-state enforcement contractıdır. Eski kullanıcı knob'ı bu contractı artık
kontrol etmiyorsa doğru kapanış onu yeniden körlemesine wire etmek değil; descriptor'ı
`DEPRECATED/REMOVED` yapmak, eski değerleri versioned migration ile açıklamak ve yeni invariantı
tek authority olarak belgelemektir. Eğer owner kullanıcı override'ını korumayı seçerse binding
ADR'ın tam gövde/fail-closed garantisi hiçbir değerle zayıflatılamaz.

## 3. Dependency DAG

```text
G0  Incident containment + semantic decisions
 |\
 | +--> G1A CONFIG-AUTHORITY-001: document/revision/secret/concurrency authority
 | +--> G1B CONFIG-TRUTH-001: descriptor/schema/default/metadata generator
 |             |
 +-------------+
               v
G2  Pure resolver + layer provenance + versioned migration
               |
               v
G3  Behavioral consumer closure by domain
               |
               v
G4  One application service + Terminal/Desktop/CLI/MCP/API projections
               |
               v
G5  Compatibility cutover + every-environment/scale/fault certification
```

G0–G5'in tamamı closure scope'udur. Sıralama yalnız dependency yönetir; sonraki gate'ler
"gelecekte bakılacak" ürün kapsamı değildir.

## 4. Execution packages

### G0 — Data-loss ve secret-exposure containment

**Ledger ownership:** `CONFIG-AUTHORITY-001` (471), `API-SECURITY-001` (4130),
`TRUST-HANDOFF-001` (4180), `CONFIG-AUTHORITY-CONSOLIDATION-001` (4210).

Required outcomes:

1. Bütün project/global config writer'ları inventory edilir; direct writer kalmayacak şekilde tek
   transactional mutation service'e alınır.
2. Same-directory unique temp, restrictive creation mode, file `fsync`, directory `fsync`,
   revision/CAS, inter-process lock ve platform adapter'ı birlikte uygulanır.
3. Recovery parse edilen inode/file identity + digest'i yeniden doğrulamadan rename edemez.
   Concurrent replacement görülürse `CONCURRENT_REVISION_HOLD`; healthy file karantinaya alınmaz.
4. Backup/quarantine raw secret taşımaz; encryption/custody, retention, access mode ve restore
   receipt'i vardır. Legacy backup'lar silinmeden inventory + owner disposition bekler.
5. CLI/MCP/API/Dashboard/Desktop projection'ları descriptor sensitivity üzerinden redact edilir.
   `set` confirmation ve error/log değer echo'su aynı policy'ye tabidir.
6. Raw secret field'ları `SecretReference` migrationına girer; macOS Keychain, Windows DPAPI/CNG,
   Linux Secret Service/external KMS ve WSL boundary'si ayrı adapter kanıtı taşır.

Exit gate:

- Concurrent writer + healer adversarial testinde valid revision hiçbir interleaving'de kaybolmaz.
- File/backup permissions ve ACL platform policy'yi karşılar; symlink/hardlink/path traversal,
  disk-full, permission-denied ve crash-after-each-step fault injection pass olur.
- Secret sentinel CLI, JSON output, MCP response, HTTP response, browser state, log, trace,
  backup ve crash artifact'ında görünmez.

### G1A — Tek versioned config authority

**Ledger ownership:** `CONFIG-AUTHORITY-001` (471),
`CONFIG-AUTHORITY-CONSOLIDATION-001` (4210), `KERNEL-STATE-001` dependency'si.

Required outcomes:

- `AuthoredConfigDocument` ile `ResolvedConfigSnapshot` ayrı type/schema olur.
- Config scope vocabulary: installation/global, tenant, organization, workspace, project,
  environment, run-request. Inheritance, deny precedence ve non-overridable policy typed olur.
- Principal taxonomy human operator, service account, workload identity, agent, external IdP group
  ve emergency break-glass principalini ayırır. Delegation ve impersonation actor/subject olarak
  ayrı kaydedilir; separation-of-duties (request/approve/apply/audit) policy'si aynı principalin
  kendini yetkilendirmesini engeller. Break-glass time-bound, reason-bound, independently reviewed
  ve otomatik revocation/incident receipt'li olur.
- `explainEffectiveAccess(principal, scope, path, action)` ve side-effect-free simulation; allow,
  deny, inherited deny, conditional policy, delegation chain ve exact authority evidence'ini
  birlikte döndürür. UI/CLI genel “admin” label'ından permission sonucu uydurmaz.
- Her mutation optimistic concurrency (`expectedRevision`/ETag), idempotency key, actor/principal,
  authorization, dry-run diff, apply receipt ve rollback/reconcile sonucu taşır.
- Hot-reloadable, next-run-only ve restart-required impact sınıfları descriptor authority'sinden
  gelir. In-flight Run/Attempt immutable config digest'ini korur.
- Environment variables merkezi binding registry'den çözülür; consumer-local env fallback'ler
  inventory/migration olmadan yaşamaz.
- Secret reference lifecycle `provisioned`, `healthy`, `rotation-due`, `rotating`, `rotated`,
  `revoked`, `expired`, `inaccessible`, `broker-unavailable` durumlarını taşır. Credential material
  hiçbir durumda reveal edilmez; reference health/fingerprint ve last-verified evidence gösterilir.

Exit gate: İki public resolver veya writer aynı layers/revision için farklı semantic sonuç
üretemez; concurrent mutation serializable ve audit-complete'tir. Delegation/impersonation/SoD ve
cross-tenant deny-negative testleri privilege expansion veya subject confusion üretmez.

### G1B — Schema/default/metadata truth generation

**Ledger ownership:** `CONFIG-TRUTH-001` (470), `SSOT-003` dependency'si.

Required outcomes:

- Descriptor registry'den TypeScript authored/resolved types, strict runtime schema, defaults,
  CLI discovery, Desktop form contractı, redacted read model ve en/tr docs generate edilir.
- Imported alias, mapped type, records, arrays, discriminated unions ve dynamic namespace'ler
  TypeChecker/schema-aware biçimde kapsanır.
- `optional`, `required` ve `required_when_parent_present` ayrı grammar'dır.
- Unknown key, known legacy alias ve extension namespace birbirine karıştırılmaz.
- `CONFIG_METADATA`, Dashboard `CONFIG_FIELDS`, init templates ve manifest defaults competing
  hand-written lists olmaktan çıkar.
- Truth gate candidate scanner ile verified source/consumer evidence'ı ayırır; parser artifact,
  error code veya unrelated `tsconfig.json` hit'i field/env wiring sayılmaz.

Exit gate: canonical descriptor sayımı ile generated artifact sayımı lossless eşleşir; her active
field declaration, default semantics, validation, resolution, behavioral consumer, surface,
docs, tests ve migration disposition taşır.

### G2 — Pure resolver ve migration graph

**Ledger ownership:** `CONFIG-AUTHORITY-001` (471), `CONFIG-TRUTH-001` (470), `CLI-VOCAB-001`
(510), provider alanları için `CM-01` (1010).

Required outcomes:

1. `loadConfig()` ve `mergeConfigs()` aynı pure `resolveConfig(layers, environment, policy)`
   çekirdeğini çağırır; filesystem/cache yalnız adapter'dır.
2. Her effective leaf value, source layer, source revision, alias/migration reason ve default
   class provenance'ı taşır.
3. Strict validation canonicalization'dan sonra, effect/resolution'dan önce çalışır. Security
   flags (`enforce_rbac`, `enforce_least_privilege`, `risk_gate_enabled`) authored→resolved
   round-trip olmadan enable edilemez ve default permissiveness sessiz kalmaz.
4. File, in-memory ve “full” migration aynı ordered/idempotent transform registry'sini kullanır.
5. Read operation mutasyon yapmaz. Migration `preview -> explicit apply -> verify -> receipt`
   akışıdır; auto-upgrade gerekiyorsa install/start boundary'sinde görünür transaction olur.
6. Global read/write aynı platform-scoped path authority'sini kullanır; legacy path dual-read,
   explicit migrate ve retirement receipt'i taşır.

Exit gate: bütün descriptor leaf'leri için layer/property tests; sparse, legacy, conflicting,
unknown ve dynamic namespace corpusu; resolver parity ve round-trip proof'u pass olur.

### G3 — Behavioral consumer closure

Her field yalnız type/default/resolver var diye DONE değildir. Her `ACTIVE` field için exact
producer → resolver → application consumer → ingress → observable effect → test/receipt zinciri
kanıtlanır. Closure domainleri:

| Domain | Öncelikli drift | Ledger ownership |
|---|---|---|
| Security/authority | Dropped/unreachable RBAC, least-privilege, risk gate; raw control flags | 4210, 4056, 4130, 4180 |
| Prompt/ADR | `adr_render`, `adr_min_relevance`, `task_profiles` stale/unthreaded; prompt trace | `PROMPT-001`, 7094, 9011, 9024 |
| Nervous/approvals | Split schema, timeout names, lifecycle/global precedence | 475, 4056 |
| Provider/model/budget | Provider→Connection→Model→Profile, config cutover, unmetered budget | 1010, 6041, `LIMIT-001` |
| Routing/execution | Cast-only overflow/promotion/scope knobs; V3 provenance | `ROUTING-001`, 9036 |
| Retention/observability | Dropped retention/output/telemetry/search fields; no-op/reserved cleanup | `STATE-RETENTION-001`, `SLO-001` |
| Plugin/tool/MCP | Typed permission/security config, capability lifecycle | 7034, `MCP-TRUST-001`, `CAPABILITY-001` |
| Cost | Bundled/project/learned authority split | 10061 |

No-consumer outcome yalnız iki şekilde kapanır: field gerçekten bağlanır veya versioned
`DEPRECATED/REMOVED/RESERVED` lifecycle'ına alınır. Silent no-op field korunmaz.

Approval/checkpoint closure bu domain pass'inin zorunlu parçasıdır:

- Direct CLI/MCP checkpoint `approve/reject` file mutation'ları public decision authority olmaktan
  çıkar; authenticated Approval Broker/federation üzerinden principal, tenant, scope, risk, TTL,
  origin ve idempotency-bound settlement tüketir.
- MCP approval inbox read-only kalır. Başka isimli bir MCP tool aynı kararı auth'suz veremez.
- Approval ve config GET/read yolları expiry/policy state mutate etmez; scheduled lifecycle driver
  durable transition üretir, read yalnız freshness/projection gösterir.
- Plan adoption, provider `autoApprove`, human checkpoint, broker approval ve one-shot gate
  acknowledgement ayrı typed concepts olur. CLI/MCP defaults risk posture'u sessizce değiştirmez.
- Legacy checkpoint `timeout` state'i bütün public unions/projections'da unknown/rejected'e
  katlanmadan temsil edilir.

Exit gate: config behavioral mutation testinde yalnız field value değişir; expected causal effect
ve evidence değişir. Negative test, aynı effect'in hardcoded fallback/competing source üzerinden
oluşmadığını kanıtlar.

### G4 — Surface convergence

**Ledger ownership:** `APP-SERVICE-001`, `SURFACE-CONTRACT-001`, `SURFACE-PARITY-001`,
`CLI-VOCAB-001` (510), `DESKTOP-REBORN-001`, `TERMINAL-001`.

| Surface | Yetki ve ürün görevi |
|---|---|
| Desktop | Full management: authored/effective/provenance/diff/impact, policy explanation, safe mutation, migration ve recovery |
| Terminal/TUI | Aynı authority'nin keyboard-first operator yüzeyi; stable human ve machine-readable output |
| CLI | Scriptable application-service adapter; `get --source`, `diff`, `validate`, `migrate --dry-run/apply`, revision-aware `set/unset`; deterministic JSON |
| MCP | Capability/policy-scoped adapter. Read redacted; mutation annotations ve approval/authority gerçeği doğru. Approval decision MCP'de read-only kalır |
| API | Versioned internal/public protocol; strict schema, authz, tenant/revision, redaction ve idempotency. Direct file write yok |
| Dashboard | Observability-only redacted projection. Raw document browser'a taşınmaz; mutation endpoint'i Dashboard authority'si olmaz |

Surface state contractı:

| Axis | Ayrı gösterilecek durumlar |
|---|---|
| Document | absent, valid, legacy, invalid, unknown-field, migration-required |
| Effective | resolved, inherited, overridden, denied, conflict, unavailable |
| Freshness | live, reload-pending, restart-required, stale, disconnected |
| Mutation | previewed, approval-required, applying, applied, partial, superseded, failed |
| Evidence | pending, verified, contradicted, unavailable |

Bulk/multi-scope config operation contractı:

- Selection query, explicit inclusions/exclusions ve targeted scope snapshot digest'i birlikte
  persist edilir. “All” sözcüğü mutable population yerine revision-bound selection demektir.
- UI/CLI exact count ile estimate'i ayırır; estimate source, sampled-at/freshness ve uncertainty
  taşır. Exact count alınamıyorsa destructive apply başlamaz veya policy-defined typed `HOLD` olur.
- Dry-run her target için effective diff/deny/impact üretir; authorization apply anında yeniden
  değerlendirilir. Idempotency key operation+selection revision'a bağlıdır.
- Per-target outcome `applied`, `unchanged`, `denied`, `conflict`, `failed`, `superseded` olur;
  partial failure success diye katlanmaz. Retry yalnız failed subset ve aynı semantic intent için
  yeni base revisions ile yapılır; rollback/reconcile receipts target bazlıdır.

Accessibility ve Terminal contractı:

- Desktop/Dashboard/Terminal primary jobları keyboard-only tamamlanır; focus order, focus return,
  modal/inert boundary, live-update announcement ve destructive confirmation explicit test edilir.
- 200%/400% zoom, text reflow, forced colors/high contrast, reduced motion, screen reader name/role/
  state/value ve non-color status carrier WCAG 2.2 evidence'i taşır.
- Terminal/TUI TTY ve non-TTY'yi ayırır; stdout machine/data, stderr diagnostic/progress contractını
  korur. `--json`, pipe/redirect, narrow terminal, resize, interruption ve resume tested olur.
- ANSI 16/256/truecolor ve `NO_COLOR` tiers; Unicode width/grapheme ve ASCII fallback aynı semantic
  state'i kayıpsız taşır. Renk, icon veya animation tek evidence carrier olmaz.

Exit gate: aynı revision üzerinden Desktop ve Terminal aynı effective value/provenance/impact
gösterir; CLI/MCP/API semantic parity contract testleri, Dashboard negative-space testleri,
keyboard/screen-reader/zoom/forced-color ve TTY/pipe/color-tier capture'ları pass olur. Bulk operation
partial failure veya stale selection'ı toplu success olarak göstermez.

### G5 — Migration, compatibility ve certification

Required outcomes:

- Mevcut sparse/legacy/global/project documents ve bütün retained backup'lar immutable inventory
  olur; migration lossless diff, secret handling ve rollback proof'u üretmeden source silinmez.
- Old aliases boyunca dual-read yalnız bounded compatibility window'dur; dual-write yapılmaz.
- Config schema semver, minimum/maximum reader compatibility ve downgrade behavior taşır.
- Million-project/tenant modelinde pagination/search için descriptor catalog server-side olur;
  mutation/event history bounded retention + legal hold + tenant-safe export taşır.
- Million-scope bulk simulation/apply; stable pagination cursor, revision-bound selection,
  include/exclude set, exact/estimated count ve bounded per-target receipts ile backpressure uygular.
- Cross-tenant negative corpus; guessed tenant/project IDs, delegated actor confusion, stale group
  membership, revoked credential, export/search side channels ve concurrent policy changesinde veri
  veya authority sızıntısı olmadığını kanıtlar.
- Config digest Run/Attempt/evidence/settlement boyunca attribution sağlar; config değişikliği
  geçmiş sonucu yeniden yorumlamaz.

Exit gate: fresh install, upgrade, downgrade, rollback, crash recovery, concurrent processes,
offline/remote, tenant inheritance ve platform matrix'in tamamı certified olur.

## 5. Failure ve recovery matrix

| Failure | Zorunlu davranış | Safe recovery |
|---|---|---|
| Invalid JSON | Canonical file overwrite edilmez; exact bytes/digest ve parse diagnostic korunur | Explicit repair/migration; verified restore |
| Concurrent revision | Son writer kazanmaz; base revision mismatch typed conflict | Re-read, three-way semantic diff, retry with new idempotency key |
| Crash mid-write | Önceki veya yeni full revision görünür; partial canonical görünmez | Journal/receipt reconciliation |
| Disk full/fsync failure | Success dönmez; temp disposition görünür | Alan aç, same transaction resume/rollback |
| Windows sharing/rename restriction | POSIX varsayımı yapılmaz | Platform adapter typed retry/HOLD |
| Permission/ACL drift | Secrets okunmaya devam edilmez | Custody repair preview + owner-approved apply |
| Unknown key/typo | Persist edilmez | Candidate suggestions; explicit corrected patch |
| Legacy alias conflict | Precedence uydurulmaz | Conflict diff + user/policy decision |
| Migration failure | Source ve prior revision korunur | Idempotent resume veya verified rollback |
| Hot reload failure | Disk applied ile runtime applied ayrılır | Retry reload veya restart-required state |
| Provider/platform unavailable | Effective value allowed gibi gösterilmez | Typed unavailable/HOLD; authorized alternative only |
| Secret reference unavailable | Plaintext fallback yok | Re-auth/provision broker reference |
| Secret rotated/revoked/expired | Cached material veya eski reference kullanılmaz; affected runtime typed | Rebind approved reference, verify, reconcile dependent runs |
| In-flight run config change | Run semantics sessiz değişmez | Pinned snapshot; explicit superseding attempt |
| Bulk partial failure | Aggregate success dönmez; target outcomes ve selection revision korunur | Failed subset için new-revision retry veya target-bound rollback/reconcile |
| Delegation/impersonation expiry | Subject yetkisi devam ediyor varsayılmaz | Fresh effective-access simulation + re-auth; expired chain deny |

## 6. Every-environment ve population matrix

Certification aşağıdaki kesişimleri kapsar; bir Linux tmpdir testi diğerlerinin yerine geçmez:

- macOS, Linux desktop/headless, Windows native, WSL2, SSH/remote ve CI/pipe.
- POSIX atomic rename/fsync ile Windows ReplaceFile/share-mode/ACL semantiği.
- Solo local project, çok-project expert operator, team-shared workspace, regulated multi-tenant
  enterprise, offline ve reconnecting remote runtime.
- English default, Turkish parity, expansion-safe error/help/field descriptions.
- Interactive TTY, non-interactive, `--json`, pipe/redirect, `NO_COLOR` ve narrow terminal.
- ANSI 16/256/truecolor, ASCII-only locale, Unicode/grapheme width, screen reader, keyboard-only,
  200%/400% zoom, forced colors/high contrast ve reduced motion.
- Human/service/workload/agent principals; direct, delegated, impersonated ve break-glass sessions;
  request/approve/apply/audit SoD combinations.
- Single target, explicit multi-select, query-wide selection with exclusions, estimated population,
  exact revision-bound population ve partial-failure recovery.

Unsupported combination explicit `PLATFORM_UNSUPPORTED` veya `HOLD` verir; stronger security veya
isolation isteği direct/local behavior'a sessiz downgrade olmaz.

## 7. Required proof manifest

Product completion için birlikte gereken kanıtlar:

1. TypeChecker/schema inventory: her descriptor ve dynamic grammar lossless.
2. Pure resolver property tests: layer order, provenance, conditional requirement, aliases.
3. Hermetic writer fault tests: concurrency, crash points, disk/permission/platform faults.
4. Secret sentinel/redaction tests: disk, backup, stdout, JSON, MCP, HTTP, browser, logs/traces.
5. Behavioral consumer tests: security/prompt/routing/approval/provider/retention domains.
6. Cross-surface contract tests: Desktop/Terminal/CLI/MCP/API aynı revision ve semantic result.
7. Real-binary sessions: validate/get/diff/set/unset/migrate/recovery, en/tr ve machine output.
8. Platform adapter evidence: macOS, Linux, Windows native, WSL; unverified platform typed kalır.
9. Scale/tenant proof: policy inheritance, deny precedence, concurrent mutations, history/export.
10. Migration corpus: mevcut documents/backups, legacy aliases, downgrade ve rollback.
11. Enterprise authority proof: principal taxonomy, delegation/impersonation, SoD, break-glass,
    effective-access explain/simulation ve cross-tenant negative corpus.
12. Bulk-operation proof: selection/exclusion revision, exact-vs-estimated count/freshness,
    idempotency, backpressure, per-target partial failure, retry ve rollback/reconcile.
13. Credential lifecycle proof: provision/rotation/revocation/expiry/inaccessible/broker-unavailable;
    old reference/cache reuse ve plaintext fallback negative tests.
14. Accessibility/Terminal proof: keyboard/focus, screen reader, zoom/reflow, forced colors, reduced
    motion; stdout/stderr, TTY/pipe, ASCII/Unicode ve ANSI 16/256/truecolor/`NO_COLOR` captures.

`CONFIG-TRUTH-001` required local/CI gate'e bağlanmadan, bütün current false positives ayrılmadan
ve yukarıdaki producer→consumer→surface proof chain kapanmadan “config complete” denmez.

## 8. Owner decision points

Yalnız semantic authority'yi gerçekten değiştiren kararlar owner'a çıkar:

1. Altı conflicting default'un canonical ürün anlamı.
2. `prompt.adr_render` için kaldırma/migration mı, bounded override mı.
3. Legacy raw-secret fields için migration deadline ve external broker requirements.
4. Hangi config değişikliklerinin live reload, next-run veya daemon restart gerektirdiği.
5. MCP config mutation capability'sinin default policy/risk tier'ı.

Bu kararlar verilene kadar ilgili leaf'ler typed `HOLD` taşır; geri kalan inventory, authority,
resolver, redaction ve test foundation çalışması durmaz.
