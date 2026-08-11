# Attempt Effect Attribution Authority — Complete Provenance, Classification ve Settlement Handoff (2026-08-06)

> **Karar durumu:** KABUL EDİLDİ — Alperen, 2026-08-06 OWASP Agentic Top 10 bağımsız
> inceleme oturumu, Bulgu 5.
>
> **Implementation durumu:** Bu oturumda production kodu değiştirilmedi. Bu doküman başka bir
> Deckent session'ında Goal/Mission/Flow/Run planına alınacak implementation authority girdisidir.
>
> **Canonical ledger:** primary owner `TRUST-HANDOFF-001` (order 4180); mevcut dar recovery
> foundation `RECOVERY-BORN-480-ATTRIBUTION-001` (3175). Hard dependencies:
> `TOOL-AUTHORITY-001` (4060), `KERNEL-SETTLEMENT-001` (3040),
> `RESULT-RECONCILIATION-001` (3261), `AUDIT-001` (4120), `ENV-ADAPTER-001` (8010) ve kabul
> edilmiş provider-neutral execution/landing authority tasarımı. Assurance parent:
> `SEC-OWASP-ASI-001` (4190).

## 1. Sonuç — tek cümle

Deckent, worker'ın `filesChanged` beyanını veya concurrent shared-worktree `git diff` görünümünü
authorship kanıtı saymayacak; her born attempt'ın isolated staging ortamındaki bütün persistent ve external
effect'lerini host-owned discovery ile çıkaracak, signed `AttemptEffectManifest` içinde authority scope'una
göre sınıflandıracak ve eksik, belirsiz ya da yasak effect evidence'ında landing ile terminal settlement'ı
typed `HOLD` ile durduracaktır.

## 2. Bugünkü code-truth baseline

### 2.1 Honest gate: worker beyanına bağlı sınır kontrolü

| Mekanizma | Bugünkü gerçek | Hüküm |
|---|---|---|
| Scope boşluğu | `scope.filesWrite` boşsa kontrol doğrudan `[]` döner (`src/orchestra/result-evaluator.ts:2380-2382`) | Read-only semantiği yok; **fail-open** |
| Evidence source | Yalnız `result.filesChanged` girdileri dolaşılır (`src/orchestra/result-evaluator.ts:2392-2405`) | Worker self-report |
| Markdown istisnası | Control dosyaları dışındaki bütün `*.md` yazımları sonradan exempt edilir (`src/orchestra/result-evaluator.ts:2409-2414`) | Policy bypass |
| Directory istisnası | Exact `filesWrite` olsa dahi `scope.directories` altındaki değişiklik kabul edilir (`src/orchestra/result-evaluator.ts:2415-2422`) | Read-context write grant'e dönüşür |
| Attribution state | Yalnız explicit `workAttribution.state === 'HOLD'` honest-gate veto'su üretir (`src/orchestra/result-evaluator.ts:2473-2479`) | Missing/UNAVAILABLE sessiz geçebilir |
| Boundary veto | Boundary sonucu yalnız success iddiasındaki result için downgrade edilir (`src/orchestra/result-evaluator.ts:2513-2525`) | Failed/crashed attempt effect'i kapsam dışı kalabilir |

Bu gate, beyan edilmiş dosya listesinin policy ile uyumunu kontrol eder; worker'ın gerçekten ne yazdığını
keşfetmez. Agent hiç raporlamadığı bir dosyayı, ignored artifact'ı, metadata mutation'ını veya external
effect'i bu kanaldan saklayabilir.

### 2.2 Auditor: alert-only, attribution tahmini ve untracked körlüğü

Auditor authority enforcement'ı açıkça “soft enforcement” olarak tanımlar; ihlal warning ve event üretir
(`src/monitor/auditor.ts:700-705`). Discovery ise `git diff --stat` çıktısına dayanır
(`src/monitor/auditor.ts:752-765`). Bunun üç temel sonucu vardır:

1. `git diff --stat` untracked ve ignored yeni dosyaları tam bir effect inventory olarak vermez.
2. Her dirty dosya her active worker scope'una karşı dolaştırılır; kod yorumu da bunun simplified bir
   attribution olduğunu kabul eder (`src/monitor/auditor.ts:771-787`).
3. İhlal attribution'ı doğrudan worker identity'sine yazılır; concurrent owner change veya predecessor
   mutation ayrıştırılmaz.

Dolayısıyla bu mekanizma bağımsız observability sinyali olarak değerlidir; deterministic writer attribution
ve landing veto authority'si değildir.

### 2.3 Docker path'teki değerli fakat dar recovery foundation

Mevcut Docker path önceki analizden sonra tamamen “worker self-report” değildir. Aşağıdaki host-owned
foundation production'da çalışır:

| Kontrol | Code-truth | Bugünkü güvenlik değeri |
|---|---|---|
| Path normalization | Absolute, drive-qualified, `..` ve empty segment reddedilir (`src/orchestra/spawn-backend-docker.ts:2003-2020`) | Exact scoped list bütünlüğü |
| Attempt/scope binding | Header attempt ID + scope digest taşır (`src/orchestra/spawn-backend-docker.ts:2022-2036`) | Baseline replay/mix-up azaltılır |
| Capture fail-closed | Existing exact scoped dosyalardan biri baselined değilse error (`src/orchestra/spawn-backend-docker.ts:2039-2055`) | Scoped input completeness |
| Host-only storage | Baseline exact-attempt settlement store'a first-writer ve verified bytes olarak yayımlanır (`src/core/task-result-settlement.ts:453-484`) | Worker baseline'ı değiştiremez |
| Reconciliation caller | Container exit sonrasında enrichment/settlement'tan önce çağrılır; exception artifact'ları koruyup döner (`src/orchestra/spawn-backend-docker.ts:6905-6925`) | Production-wired Docker recovery |
| Authority mismatch | Missing attempt/baseline veya header/scope mismatch typed HOLD üretir (`src/orchestra/spawn-backend-docker.ts:2191-2208`) | Fail-closed scoped reconciliation |
| Byte comparison | Exact `scopeFiles` tek tek before/after hash ile karşılaştırılır (`src/orchestra/spawn-backend-docker.ts:2218-2238`) | Predecessor work yanlış sayılmaz |

Bu mekanizmanın sınırı nettir: reconciliation yalnız `scopeFiles` listesini gezer. Out-of-scope detection,
gerçek filesystem discovery'den değil worker-authored `result.filesChanged` içinden türetilir
(`src/orchestra/spawn-backend-docker.ts:2133-2142`, `:2188-2191`). Worker dışarıdaki yazımı raporlamazsa
`claimedOutsideScope` boş kalır ve outcome `VERIFIED` olabilir (`src/orchestra/spawn-backend-docker.ts:2243-2250`).

Bu nedenle bugünkü `VERIFIED` adı complete attempt attribution anlamında fazla geniştir. Kanıtladığı şey:

> Exact declared scope içindeki belirli path'lerin claim-time baseline'a göre byte delta'sı ve worker'ın
> beyan ettiği listede açık bir out-of-scope claim bulunmaması.

Target vocabulary'de bunun dürüst adı `SCOPED_DELTA_VERIFIED` olmalıdır.

### 2.4 Host adapter ve terminal consumer boşlukları

Production `result.workAttribution = ...` yazımı yalnız Docker reconciliation path'inde bulunur
(`src/orchestra/spawn-backend-docker.ts:2144-2176`). Host Codex/Gemini adapter'ları için eşdeğer complete
attempt effect authority yoktur.

Downstream projection `result` yoksa veya attribution `VERIFIED` değilse dosya ve line metric'lerini sıfıra
indirir (`src/core/sprint-work-attribution.ts:44-63`). Bu fabrication'ı engeller, fakat mutating attempt'ın
terminal truth'unu zorunlu olarak HOLD yapmaz. Terminal evidence bir logical task'ı attribution dışlamaları
varken `COMPLETED` sayabilir ve yalnız `excludedAttributionCount` kaydeder
(`src/orchestra/sprint-terminal-evidence.ts:649-682`). Exclusion cleanup'ı bloklar
(`src/orchestra/sprint-terminal-evidence.ts:708-723`), fakat complete task settlement ile complete effect
provenance aynı invariant değildir.

### 2.5 Measurement side effect: canonical Git object store mutation

Baseline ve after-hash hesapları `git hash-object -w` kullanır
(`src/orchestra/spawn-backend-docker.ts:1980-2000`, `:2074-2086`). `-w`, ölçülen blob'ları canonical
repository'nin `.git/objects` alanına yazar. Bunun sonuçları:

- measurement kendi başına repository metadata effect'i üretir;
- başarısız/karantinaya alınmış attempt byte'ları canonical Git object database'e taşınır;
- uzun ömürlü ve multi-tenant kullanımda object-store bloat oluşabilir;
- attribution evidence lifecycle'ı repository retention/GC davranışına bağlanır.

Target authority content digest/CAS kullanabilir, fakat evidence CAS canonical `.git/objects` dışında,
host-owned ve tenant-scoped olmalıdır.

### 2.6 Önceki Bulgu 5 hükmü

Önceki bulgu **PARTIAL**'dır.

- Honest-gate'in worker'ın kendi `filesChanged` beyanına güvenmesi: **CONFIRMED**.
- Auditor'ın alert-only, yanlış-atıf üreten ve untracked-kör olması: **CONFIRMED**.
- Bütün production path'lerde hiçbir host-side byte attribution bulunmadığı iması: **REFUTED**; Docker
  path'te exact scoped baseline/reconciliation production-wired'dır.
- Bu Docker foundation'ın complete attribution sağlamadığı: **CONFIRMED**; out-of-scope discovery yine
  self-report'tur ve yalnız exact scoped paths ölçülür.

## 3. Korunan varlıklar ve threat model

### 3.1 Korunan varlıklar

- Canonical project tree, tracked/untracked/ignored files ve owner'ın pre-existing dirty work'ü.
- File metadata: mode, owner/ACL, xattr, symlink/junction/reparse target, hardlink topology ve timestamps.
- `.git`, `.deckent`, `.tasks`, `.locks`, `.brain`, provider config ve execution policy state.
- Attempt staging, immutable base snapshot, Tool Gateway receipts ve LandingReceipts.
- Host filesystem, global credentials, service state, process/network effects ve tenant boundaries.
- Result, evaluation, training trace, cost and audit records consuming “who changed what” evidence.
- Forensic artifacts needed after DONE, NO_GO, timeout, crash, kill or missing result.

### 3.2 Adversary sınıfları

| Sınıf | Yetenek | Beklenen savunma |
|---|---|---|
| A1 Prompt-injected worker | Scope dışında yazıp `filesChanged` içinden saklar | Host-owned complete discovery |
| A2 Rogue worker | Result yazmaz, NO_GO der veya crash ederek effect'i görünmez kılmaya çalışır | Every-born-attempt final scan |
| A3 Malicious repo code | Build/test/package hook üzerinden child process ve hidden files üretir | Isolated staging + full inventory |
| A4 Concurrent sibling | Shared canonical change'i başka attempt'a yazdırmaya çalışır | Per-attempt staging identity |
| A5 Compromised adapter | Manifest, attempt ID veya evidence refs'i karıştırır | Signed exact-attempt binding |
| A6 Path trick attacker | Symlink, junction, ADS, case/Unicode alias veya mount escape kullanır | Platform-native identity semantics |
| A7 Metadata-only attacker | Content hash değiştirmeden mode/ACL/xattr/link target değiştirir | Metadata Merkle + journal |
| A8 External-effect attacker | MCP/network/process/service effect'ini file manifest dışında bırakır | Tool Gateway receipt merge |
| A9 Local privileged operator | Host evidence store'u değiştirmeye çalışır | External key custody + assurance ceiling |

### 3.3 Güvenlik invariant'ları

1. Worker-authored result provenance authority değildir.
2. Her born attempt, terminal result state'inden bağımsız bir effect manifest alır.
3. Mutating capability verilmiş bir attempt'ta complete effect evidence yoksa settlement `HOLD` olur.
4. `filesWrite` exact persistent landing authority'sidir; boş liste read-only demektir.
5. `scope.directories`, exact `filesWrite` varken write grant değildir.
6. Test/doc extension'ı post-hoc security exemption üretmez.
7. Worker canonical root'a doğrudan yazamadığı için structural attribution default'tur.
8. Journal performans içindir; final immutable snapshot/Merkle completeness authority'sidir.
9. Filesystem dışı effects canonical Tool Gateway receipts ile manifest'e bağlanır.
10. Unexpected/prohibited effect varken hiçbir subset canonical landing'e otomatik taşınmaz.
11. Owner'ın canonical concurrent change'i attempt'a mal edilmez.
12. Landing, exact base snapshot + manifest + policy decision üzerine CAS uygular.
13. Auditor authorship tahmin etmez; manifest/receipt tüketir ve ayrı canonical drift üretir.
14. Legacy shared-root execution `STRUCTURALLY_ATTRIBUTED` claim edemez.
15. Attribution measurement canonical project/Git metadata'sını mutate etmez.
16. Platform semantics desteklenmiyorsa silent downgrade değil typed `HOLD` oluşur.

## 4. Kabul edilen mimari kararlar

### D1 — Primary authority isolated staging'dir

Normal worker canonical project tree'ye yazmaz. Her attempt benzersiz, immutable base snapshot'a bağlı bir
isolated staging projection içinde çalışır. Bir effect'in attempt'a ait olduğu, shared-tree timing tahmininden
değil o attempt'ın private writable layer'ında doğmasından anlaşılır.

Bu karar kabul edilmiş provider-neutral worker execution authority belgesinin D1/D3/D8 landing modeline
hard-depend eder: `docs/audits/provider-neutral-worker-execution-authority-design-2026-08-06.md`.

### D2 — Her born attempt complete manifest üretir

“Born”, execution authority tarafından principal/capability envelope ile process veya remote invocation
identity'si yaratılmış attempt demektir. Bundan sonra:

- provider başlamasa,
- result hiç yazılmasa,
- worker NO_GO dese,
- timeout/kill/crash yaşansa,
- repair attempt'a dönüşse

effect discovery zorunludur. Result state bu obligation'ı ortadan kaldırmaz.

### D3 — Üç effect class canonical'dır

Her effect tam olarak bir sınıfa yerleşir:

1. `DECLARED_LANDING`: exact capability içinde ve landing için aday persistent project effect.
2. `EPHEMERAL_ALLOWED`: attempt runtime için izinli, canonical project'e taşınmayacak effect.
3. `UNEXPECTED_OR_PROHIBITED`: capability dışında, protected surface üzerinde veya provenance'ı
   doğrulanamayan effect.

“Unclassified” dördüncü bir başarı sınıfı değildir; manifest `HOLD` olur.

### D4 — Assurance vocabulary kanıtın gücünü dürüstçe ayırır

| State | Anlam | Settlement etkisi |
|---|---|---|
| `STRUCTURALLY_ATTRIBUTED` | Complete private staging inventory + immutable base/post reconciliation; effect owner exact attempt | Landing değerlendirmesine uygun |
| `SCOPED_DELTA_VERIFIED` | Yalnız declared exact scope before/after bytes doğrulandı; complete effect discovery yok | Legacy/recovery evidence; full settlement için yetersiz |
| `OBSERVED_NOT_CAUSAL` | Ambient/shared observation var, unique writer causation yok | Authorship claim yok; mutating attempt HOLD |
| `AMBIGUOUS` | Birden fazla mümkün writer veya path identity belirsiz | HOLD |
| `UNAVAILABLE` | Gerekli sensor/snapshot/evidence yok | Mutating attempt HOLD |
| `HOLD` | Policy, completeness, integrity veya classification veto'su | Landing ve terminal settlement blok |

Bugünkü Docker `VERIFIED` değeri migration sırasında `SCOPED_DELTA_VERIFIED` olarak yorumlanmalıdır; schema
consumer'ları onu `STRUCTURALLY_ATTRIBUTED` ile eşitlememelidir.

### D5 — Git complete effect discovery authority'si değildir

Git tracked content diff için projection üretir; ancak ignored files, untracked directories, metadata,
hardlinks, ACL/xattr, filesystem aliases ve external effects için tam inventory değildir. Discovery engine:

- fast-path olarak CoW/overlay upper-layer change feed veya platform journal,
- authoritative close-out olarak immutable base/post Merkle reconciliation,
- external effects için Tool Gateway receipt merge

kullanır. Git diff yalnız developer-facing view veya declared landing patch formatı olabilir.

### D6 — `filesWrite` exact write authority'dir

- Non-empty `filesWrite`: yalnız listedeki exact normalized resources persistent landing'e adaydır.
- Empty `filesWrite`: task read-only'dir.
- `directories`: read/context discovery kapsamıdır; implicit write wildcard değildir.
- Directory-wide write ancak explicit typed capability ile verilir; örneğin generated tree gibi exact root,
  traversal semantics, quotas ve prohibited descendants belirtilir.

### D7 — Post-hoc extension exemption yoktur

`*.md`, test filename pattern'ı veya “low risk” etiketi authority yerine geçmez. Task'ın test/doc yazması
gerekiyorsa planner/admission bu resources'i process birth öncesi capability envelope'a deterministic olarak
ekler. Beklenmeyen Markdown yazımı beklenmeyen executable config yazımı kadar aynı sınıflandırma yolundan
geçer; risk policy sonucu farklı olabilir, discovery sonucu değil.

### D8 — Unexpected effect whole-attempt landing veto'sudur

`UNEXPECTED_OR_PROHIBITED` tek bir effect bile üretirse:

- bütün staging quarantined kalır;
- hiçbir declared subset otomatik cherry-pick/landing almaz;
- security/audit event yazılır;
- attempt typed `HOLD` olur;
- recovery explicit owner/policy authority ister.

Bu yaklaşım attacker'ın yasak effect içine yararlı değişiklik karıştırarak partial salvage yolundan canonical
state'e sızmasını engeller.

### D9 — Attribution result'tan önce ve result'tan bağımsızdır

Effect scan worker result'ı parse etmeden de yürüyebilmelidir. Result yalnız claimed intent ve human-readable
summary sağlayabilir. Manifest discovery, effect listesi ve classification host authority tarafından üretilir.

### D10 — Auditor manifest consumer ve drift detector olur

Auditor:

- attempt effect manifest'lerini,
- Tool Gateway operation receipts'i,
- LandingReceipts'i,
- canonical tree monitor observations'ını

birleştirir. Bilinen receipt olmadan canonical drift görürse worker tahmin etmez;
`UNATTRIBUTED_CANONICAL_DRIFT` üretir ve policy'ye göre authority suspension/HOLD uygular.

### D11 — Legacy shared-root yalnız attended break-glass'tır

Shared canonical root'a direct-write execution:

- default routing olamaz;
- compliance/training/promotion evidence üretemez;
- assurance state'i en fazla `OBSERVED_NOT_CAUSAL` veya dar kanıt varsa `SCOPED_DELTA_VERIFIED` olur;
- attended, time-bounded, reason-coded break-glass/diagnostic profile gerektirir.

### D12 — Attribution terminal invariant'tır

Mutating attempt için missing/incomplete effect manifest yalnız metric exclusion veya cleanup blocker değildir.
Logical task terminal `COMPLETED`, accepted outcome, learning/promotion ve finalizer success claim'i manifest
`STRUCTURALLY_ATTRIBUTED` + policy-approved olmadan oluşamaz.

### D13 — Evidence CAS `.git/objects` dışında yaşar

Content/Merkle nodes tenant + project + attempt bindings taşıyan host-owned CAS'e yazılır. CAS:

- canonical repository'yi mutate etmez;
- worker mount'unda görünmez;
- quota/retention/legal hold uygular;
- encryption, dedupe ve cryptographic erase policy'sini ayrı yönetir.

### D14 — Causation structural, external operation lineage receipt-based'dir

Filesystem staging effect owner'ı private writable layer nedeniyle structural'dır. MCP/network/service effect
owner'ı ise Tool Gateway'nin exact operation receipt'inden gelir. Zaman yakınlığı tek başına causation değildir.

### D15 — Whole-system attribution execution/landing authority ile tek motordur

Bulgu 5 için ikinci bir sandbox, workspace veya landing implementation'ı yapılmaz. Discovery ve manifest
components, Bulgu 4'ün `ExecutionEnvironmentAdapter`, capability envelope, Tool Gateway ve LandingAuthority
flow'una bağlanır. İki ayrı engine üretmek policy drift ve double-settlement yaratır.

### D16 — Rollout claim'i capability bazlıdır

Observe/shadow aşamasında measurement kapsaması genişletilebilir; fakat ürün “enforced attribution” claim'ini
yalnız o attempt'ın bütün effect facets'i supported ve policy-enforced ise yapar. Global flag'in açık olması,
unsupported adapter path'i güvenli yapmaz.

## 5. Target authority flow

```text
Goal / Mission / Flow admission
             |
             v
Signed CapabilityEnvelope + immutable BaseSnapshot
             |
             v
ExecutionEnvironmentAdapter creates unique AttemptStaging
             |
             +--> filesystem journal / upper-layer feed
             +--> Tool Gateway operation receipts
             +--> process/runtime observations
             |
             v
Attempt terminates (DONE | NO_GO | timeout | crash | kill | missing result)
             |
             v
EffectDiscoveryAuthority
  - freeze staging
  - drain journal
  - compute final Merkle
  - reconcile base/post
  - merge external receipts
             |
             v
AttemptEffectManifestV1 (host-signed, immutable)
             |
             v
EffectClassificationAuthority
  - DECLARED_LANDING
  - EPHEMERAL_ALLOWED
  - UNEXPECTED_OR_PROHIBITED
             |
       +-----+------------------+
       |                        |
       v                        v
 all complete/allowed       gap, ambiguity, prohibited
       |                        |
       v                        v
 LandingAuthority CAS       quarantine + security event + HOLD
       |
       v
 LandingReceipt + CanonicalPostSnapshot
       |
       v
 Result/Eval/Terminal Settlement + Audit + Training Trace
```

Authority order kritiktir: result evaluation effect discovery'yi tetikleyebilir fakat onun yerine geçemez;
landing result prose'una değil immutable manifest ve classification receipt'e dayanır.

## 6. Normative contracts

Bu bölüm implementation dilinden bağımsız schema semantiğini tanımlar. TypeScript interface'leri, SQLite
tabloları ve wire encoding implementation session'ında mevcut canonical contract patterns'ine göre seçilir.

### 6.1 `AttemptEffectManifestV1`

Zorunlu alanlar:

| Alan | Semantik |
|---|---|
| `schemaVersion` | Exact `attempt-effect-manifest/v1`; unknown major fail-closed |
| `manifestId` | Content-addressed immutable ID |
| `tenantId`, `projectId` | Multi-tenant isolation binding |
| `flowId`, `runId`, `sprintId` | Orchestration lineage; applicable olmayan alan typed null |
| `logicalTaskId`, `taskId`, `attemptId` | Exact attempt identity |
| `principalRef` | Provider/model/agent/runtime principal receipt reference |
| `capabilityEnvelopeRef` | Process birth'te kabul edilen signed authority |
| `executionEnvironmentRef` | Adapter/runtime instance and assurance profile |
| `baseSnapshotRef` | Immutable input tree + metadata root |
| `postSnapshotRef` | Frozen staging final tree + metadata root |
| `discoveryEvidenceRefs` | Journal, upper-layer, scan, external receipt batch references |
| `effects` | Canonically ordered `AttemptEffectEntryV1[]` |
| `summary` | Counts/bytes by class, kind, resource domain; derived, not authority |
| `assuranceState` | D4 vocabulary |
| `coverageFacets` | Content, metadata, links, external effects, platform features |
| `gaps` | Empty for structural success; typed reason codes otherwise |
| `policySnapshotRef` | Classification policy digest/version |
| `classificationReceiptRef` | Host decision; absent until classified |
| `startedAt`, `frozenAt`, `issuedAt` | Trusted clock domain + monotonic ordering evidence |
| `issuer`, `keyId`, `signature` | Host/service signature and rotation identity |

Manifest worker-writable `.result` içine authoritative inline object olarak gömülmez. Result yalnız immutable
manifest ID/ref taşıyabilir; consumer canonical evidence store'dan doğrular.

### 6.2 `AttemptEffectEntryV1`

Her entry aşağıdakileri taşır:

- `effectId`: manifest içinde stable, content-derived identity.
- `resourceDomain`: `project_fs`, `runtime_fs`, `process`, `network`, `mcp`, `service`, `secret_access`,
  `control_plane` veya registered extension domain.
- `resourceIdentity`: platform-independent logical identity + adapter-native identity evidence.
- `effectKind`: `create`, `modify`, `delete`, `rename`, `copy`, `truncate`, `type_change`, `mode_change`,
  `owner_acl_change`, `xattr_change`, `link_change`, `hardlink_topology_change`, `execute`, `spawn`, `connect`,
  `request`, `mutate_service` veya typed extension.
- `beforeRef` / `afterRef`: content + metadata digest; non-applicable taraf explicit null.
- `sizeBefore`, `sizeAfter`, `byteDelta`: quotas ve review projection için.
- `sourcePathIdentity` / `targetPathIdentity`: rename/copy/link semantics için.
- `operationReceiptRefs`: effect'i doğuran Tool Gateway operation'ları; bulunmadığında reason.
- `discoverySourceRefs`: journal event, upper-layer inode, Merkle diff veya external receipt.
- `declaredAuthorityMatch`: matched capability resource, action, constraints and digest.
- `effectClass`: D3 vocabulary.
- `classificationReasonCodes`: deterministic policy output.
- `provenanceQuality`: `STRUCTURAL`, `RECEIPT_CAUSAL`, `OBSERVED`, `AMBIGUOUS`.
- `sensitivity`: redaction/encryption/retention class; raw secret bytes manifest'e girmez.

Line-added/removed değerleri optional review projection'dır. Binary, generated veya metadata-only effect'i
ölçememek attribution failure değildir; effect identity ve before/after state zorunludur.

### 6.3 `EffectDiscoveryEvidenceV1`

Discovery evidence en az şunları bağlar:

- adapter identity/version/capabilities;
- staging instance and writable-layer identity;
- base snapshot root;
- journal cursor start/end ve gap detection sonucu;
- freeze barrier/acknowledgement;
- final scan root and scan policy;
- discovered alias/mount/link anomalies;
- external operation receipt cursor range;
- resource counts/bytes and scan duration;
- any unsupported facet or degraded assurance reason.

Journal gap varsa final Merkle onu kapatabilir; final scan facet desteklenmiyorsa journal “muhtemelen yeterli”
diye complete claim üretmez.

### 6.4 `EffectClassificationDecisionV1`

Decision aşağıdakileri taşır:

- manifest/capability/policy exact refs;
- each effect ID → class + matched rule;
- protected-resource catalog version;
- quota and aggregate constraints result;
- unexpected/prohibited list;
- explicit `landingEligible` boolean;
- `decisionState`: `ALLOW`, `DENY`, `HOLD`;
- signer/key/time and supersession semantics.

Policy change eski manifest'i sessizce yeniden sınıflandırmaz. Re-evaluation yeni immutable decision üretir ve
önceki decision refs'ini taşır.

### 6.5 `EffectAttributionReceiptV1`

Attempt close-out receipt:

- exact attempt identity;
- manifest and classification decision refs;
- assurance state;
- quarantine state/location ref;
- landing request eligibility;
- terminal veto reason codes;
- audit chain and retention class;
- idempotency key and signature.

Bu receipt result ingestion, evaluator, finalizer, cost accounting, training trace ve dashboard için tek
canonical attribution projection kaynağıdır.

### 6.6 `CanonicalDriftObservationV1`

Canonical monitor worker ID tahmin etmez. Observation:

- project/canonical snapshot before-after refs;
- changed resource identities;
- matched LandingReceipt refs;
- unmatched effect IDs;
- owner/operator-known change refs;
- state: `RECEIPT_MATCHED`, `OWNER_CHANGE`, `UNATTRIBUTED_CANONICAL_DRIFT`, `AMBIGUOUS`;
- authority suspension/action receipt;
- sensor coverage and timestamp.

### 6.7 `LandingReceiptV1` ile bağ

Kabul edilmiş Bulgu 4 contract'ı genişletilmeden exact refs ile bağlanır:

- source `AttemptEffectManifestV1`;
- source classification decision;
- landed `DECLARED_LANDING` effect IDs;
- canonical compare-and-swap base root;
- post-landing root;
- conflict/rollback state;
- no omitted or extra effects proof.

LandingReceipt effect manifest'i yeniden keşfetmez; frozen staging manifest'inin approved subset'ini exact
identity ile uygular ve sonucu doğrular.

## 7. Complete effect discovery engine

### 7.1 Phase A — base snapshot

Process birth öncesinde execution authority:

1. canonical input snapshot identity'sini resolve eder;
2. project tree content + metadata Merkle root'unu kaydeder;
3. staging projection'ın bu root'tan yaratıldığını adapter receipt ile kanıtlar;
4. writable layer/journal cursor başlangıcını host-only store'a yazar;
5. capability envelope ile aynı attempt ID altında bind eder.

Base snapshot owner'ın dirty state'ini içerebilir; önemli olan immutable ve exact olmasıdır. “HEAD” tek başına
yeterli değildir.

### 7.2 Phase B — fast change feed

Execution sırasında adapter mümkün olan en güçlü native feed'i üretir:

- Linux: overlay/CoW upperdir inventory, fanotify/inotify auxiliary feed veya isolated volume scan.
- macOS: APFS clone/snapshot semantics ve FSEvents yalnız acceleration/observation olarak.
- Windows native: block/file clone veya isolated volume/workspace; USN Journal auxiliary feed.
- WSL: distro filesystem semantics + Windows boundary crossing açıkça adapter facet'i.
- Remote runner: server-side immutable input/output snapshot protocol.

Native journal overflow, coalescing veya lost-event ihtimali reason-coded evidence'dır. Journal tek başına
complete final truth değildir.

### 7.3 Phase C — freeze barrier

Attempt termination gözlendiğinde supervisor:

1. yeni Tool Gateway operations'i kapatır;
2. process tree'yi quiesce/terminate eder;
3. writable layer'a yeni handle kalmadığını doğrular;
4. journal cursor'u drain eder;
5. staging'i immutable/read-only freeze eder;
6. freeze receipt'i yazar.

“Main process exited” tek başına freeze değildir; orphan child process veya background service staging'i
sonradan değiştirebiliyorsa manifest race'e açıktır.

### 7.4 Phase D — authoritative base/post reconciliation

Final scanner canonical path-string diff'inden daha güçlü identity kullanır:

- directory entries and type;
- regular-file content digest;
- executable/mode/owner/ACL facets;
- symlink/junction/reparse target and resolution class;
- hardlink group identity/link count;
- xattr/ADS presence and digest according to platform policy;
- mount boundary and device/volume identity;
- sparse file/resource fork/platform extensions;
- case and Unicode canonicalization evidence.

Base/post Merkle farkı journal ile birleştirilir. Journal'ın gösterdiği fakat post state'te görünmeyen transient
effect de policy'ye göre kayıtlı kalır; örneğin protected file create-then-delete girişimi.

### 7.5 Phase E — external effect merge

Tool Gateway receipts filesystem manifest'ine sonradan prose olarak eklenmez; exact attempt/capability/operation
binding ile merge edilir. Örnekler:

- network request and response class;
- MCP tool invocation;
- database/cloud mutation;
- message/email/notification send;
- package fetch and artifact execution;
- secret read/use without secret material disclosure;
- process/service mutation mediated by gateway.

Receipt sequence gap, bypass observation veya unknown external channel manifest assurance'ını HOLD'a indirir.

### 7.6 Phase F — canonical ordering and signing

Effect entries normalized resource domain + stable logical identity + effect kind ile deterministic sıralanır.
Manifest canonical encoding üzerinden content-addressed ID ve signature alır. Aynı evidence replay'i aynı
manifest ID üretmeli; platform-native nondeterministic fields ayrı observation metadata'sında tutulmalıdır.

## 8. Every-environment path ve filesystem semantiği

### 8.1 Logical path ile native resource identity ayrılır

Manifest iki identity taşır:

- **Logical resource:** project-relative, separator-independent, normalized display/policy path.
- **Native resource:** volume/device/file ID, inode/file index, reparse/link identity ve adapter evidence.

Yalnız string prefix kontrolü containment kanıtı değildir.

### 8.2 Symlink ve traversal

- Path normalization link resolution'dan önce ve sonra yapılır.
- Parent component symlink ise resolved target staging/project root dışında olamaz.
- Symlink create/change kendi başına effect'tir; target content'i otomatik owned sayılmaz.
- TOCTOU, openat/handle-relative veya platform equivalent safe traversal ile kapatılır.
- Dangling link, link loop ve link-to-protected-surface typed classification alır.

### 8.3 Hardlink

Hardlink üzerinden content mutation birden fazla logical path'i etkileyebilir. Manifest:

- link group identity,
- before/after link count,
- bütün visible aliases,
- root dışındaki alias riskini

kaydeder. Staging root dışına hardlink creation prohibited olmalıdır; platform sağlayamıyorsa facet HOLD olur.

### 8.4 Windows junction, reparse, UNC ve ADS

- Junction/reparse point type ve target ayrı metadata effect'idir.
- Drive letters gerçek volume identity'ye resolve edilir; `C:` string'i authority değildir.
- UNC/device namespaces ve reserved names canonical policy'de açıkça sınıflanır.
- Alternate Data Streams discovery facet'i desteklenmeden Windows native complete claim yapılamaz.
- ACL inheritance mutation ve deny/allow ordering digest'e girer.

### 8.5 Case ve Unicode

Case-insensitive/case-preserving filesystem'de `A.ts` ve `a.ts` alias olabilir. Unicode NFC/NFD farklı byte
path'leri aynı user-visible resource'a resolve olabilir. Adapter:

- filesystem comparison semantics,
- original spelling,
- normalized policy key,
- collision set

üretir. Collision ambiguity landing'i bloklar.

### 8.6 Mount crossing ve WSL

Staging içinde nested mount, bind mount, Docker socket, host volume veya WSL `/mnt/c` crossing yalnız explicit
capability ile mümkündür. Discovery adapter'ı volume boundary'yi görmezse complete assurance veremez.

### 8.7 Unsupported platform davranışı

Platform adapter capability matrix en az şu facet'leri bildirir:

`content`, `untracked`, `ignored`, `mode`, `acl`, `xattr_or_ads`, `symlink`, `hardlink`, `junction_reparse`,
`mount_boundary`, `freeze`, `journal_gap_detection`, `external_receipt_merge`.

Required facet `unsupported` ise mutating attempt admission öncesi typed `HOLD` olur; doğrudan shared-root
fallback yapılmaz.

## 9. Scope ve effect classification policy

### 9.1 Exact `filesWrite` matching

Bir project filesystem effect'i `DECLARED_LANDING` olmak için:

1. exact normalized logical resource capability'de bulunmalı;
2. native identity containment doğrulanmalı;
3. action (`create`, `modify`, `delete`, `rename`, metadata change) grant içinde olmalı;
4. size/count/type/sensitivity constraints geçmeli;
5. protected-resource catalog deny üretmemeli;
6. operation/tool constraints varsa receipt ile eşleşmeli.

Path listesinde bulunmak bütün mutation türlerine otomatik izin vermez. Örneğin content modify grant'i file'ı
symlink'e çevirmeyi kapsamaz.

### 9.2 Directory-wide capability

Explicit tree capability şu bilgileri taşır:

- exact root;
- allowed effect kinds;
- file type allowlist;
- maximum files/bytes/depth;
- symlink/hardlink/mount policy;
- excluded protected descendants;
- generated/temporary/landing semantics;
- case/Unicode collision behavior.

Plain `scope.directories` bu capability değildir.

### 9.3 Ephemeral allowlist

Ephemeral outputs runtime-scoped typed locationsa yazılır:

- temp/cache/compiler intermediate;
- provider scratch state;
- package cache projection;
- logs/checkpoints/results için dedicated mailbox;
- test runtime artifacts.

`EPHEMERAL_ALLOWED` canonical landing'e girmez. Retention ve forensic policy ayrı uygulanır. Project tree
altında “sonra silinir” varsayımı ephemeral authority değildir.

### 9.4 Protected resource catalog

Catalog en az şunları kapsar:

- `.git/**`, git/common-dir/worktree metadata;
- `.deckent/**`, `.tasks/**`, `.locks/**`, `.brain/**` canonical control state;
- `DIRECTIVES.md`, `AGENTS.md`, `CLAUDE.md`, `GEMINI.md` ve workspace trust/config surfaces;
- provider credentials/settings ve host-global config;
- runtime sockets, devices, IPC endpoints;
- package manager executable lifecycle config;
- CI/release/signing/secrets surfaces;
- tenant/project boundary roots.

Protected resource yazımı ordinary file grant ile verilmez; ayrı high-risk operation/capability/approval class
gerektirir veya tamamen deny edilir.

### 9.5 Rename, copy ve delete

- Rename source ve target birlikte authorized olmalıdır.
- Scope dışından scope içine rename, source read/ownership semantics doğrulanmadan declared sayılamaz.
- Scope içinden dışarı rename out-of-scope effect'tir.
- Copy target persistent effect; source access ayrıca receipt/policy evidence taşır.
- Delete explicit action grant ister; empty content write ile eşit değildir.

### 9.6 Create-then-delete ve transient prohibited effect

Final tree farkı sıfır olsa dahi journal/protected sensor bir prohibited resource create/use/delete girişimi
gösterirse security event kalır. Final Merkle completeness, transient malicious behavior'ı silmez; iki evidence
channel farklı soruyu yanıtlar.

## 10. Attribution, causation ve concurrency

### 10.1 Private staging normal path

Her attempt'ın writable layer'ı benzersiz olduğunda o layer'daki filesystem effects structurally attempt'a
aittir. Worker/provider prose'una veya clock-window korelasyonuna ihtiyaç yoktur.

### 10.2 Concurrent siblings

- Sibling attempt'lar aynı immutable base'i veya farklı versioned base'leri kullanabilir.
- Writable layer paylaşmazlar.
- Bir sibling'in manifest'i diğerinin effects'ini göremez.
- Landing order CAS ve conflict detection ile belirlenir.
- İkinci landing stale base'e dayanıyorsa automatic authorship merge değil conflict/HOLD üretir.

### 10.3 Owner/operator concurrent changes

Owner canonical tree'yi worker çalışırken değiştirebilir. Bu change:

- attempt staging manifest'ine girmez;
- canonical drift monitor'da owner receipt/change identity ile ayrılır;
- landing base CAS'ini bozarsa attempt landing conflict üretir;
- worker'a yanlış atfedilmez.

### 10.4 External operations

External effect causation operation receipt'e bağlıdır:

`attemptId + principal + capabilityRef + operationId + requestDigest + outcome/effectRef`.

Bir network/service değişikliği yalnız aynı zaman aralığında gerçekleşti diye worker effect'i sayılamaz.

### 10.5 Legacy shared-root

Shared root üzerinde multiple writers varken complete writer causation çoğu durumda sonradan yeniden kurulamaz.
Bu history için dürüst state `OBSERVED_NOT_CAUSAL` veya `AMBIGUOUS`'tır. Ledger/finalizer eski kanıtı yeniden
yazarak synthetic `STRUCTURALLY_ATTRIBUTED` üretemez.

## 11. Lifecycle, failure ve settlement davranışı

| Olay | Discovery davranışı | Landing | Terminal sonuç |
|---|---|---|---|
| Provider birth öncesi admission reject | Staging yaratılmadıysa typed no-effect receipt | Yok | Rejected-admission settlement |
| Staging var, provider başlayamadı | Freeze + scan; empty/non-empty manifest | Yalnız policy uygunsa | Exact evidence ile terminal |
| Worker `DONE` | Result'tan bağımsız full scan | Classification + CAS sonrası | Manifest/landing/eval birlikte |
| Worker `NO_GO` | Full scan zorunlu | Default landing yok; explicit recovery authority gerekir | Effects quarantined, result NO_GO |
| Missing result | Full scan zorunlu | Yok | `RESULT_UNAVAILABLE` + attribution receipt |
| Timeout | Gateway close + process-tree freeze + full scan | Yok | Typed timeout/HOLD |
| Crash | Crash artifact + full scan | Yok | Typed crash/HOLD |
| Kill/cancel | Owner/system cancellation ref + full scan | Policy gereği yok | Cancelled, effect evidence preserved |
| Journal overflow | Final Merkle facet kapatabiliyorsa continue | Completeness'e bağlı | Gap kapanmazsa HOLD |
| Freeze başarısız | Mutable staging quarantined | Yasak | HOLD |
| Merkle scan başarısız | Evidence preserved | Yasak | HOLD |
| External receipt gap | Filesystem manifest tek başına yeterli değil | Yasak | HOLD |
| Unexpected/prohibited effect | Whole staging quarantine | Yasak | Security HOLD |
| Landing CAS conflict | Manifest valid kalır | Uygulanmaz | Rebase/replan/owner decision |
| Landing partial failure | Transaction rollback/repair receipt | Success claim yok | HOLD |
| Post-landing mismatch | Canonical drift/security event | Rollback/suspend | HOLD |

Cost/usage accounting attribution HOLD olsa da independently korunur. “İşi saymamak” provider maliyetini
silmek anlamına gelmez.

## 12. Auditor ve monitoring dönüşümü

### 12.1 Kaldırılacak authority iddiaları

`src/monitor/auditor.ts:752-791` benzeri final shared `git diff --stat` üzerinden active worker assignment,
security authority olmaktan çıkarılmalıdır. Developer-facing warning projection olarak bile kullanılırsa
“writer unknown” semantiğini korumalıdır.

### 12.2 Yeni canonical inputs

Auditor aşağıdaki signed refs'i tüketir:

- active attempt registry and capability envelopes;
- AttemptEffectManifest/AttributionReceipt;
- Tool Gateway operation receipts;
- LandingReceipt and rollback receipt;
- canonical drift observations;
- freeze/monitor coverage heartbeat;
- audit integrity and key status.

### 12.3 Monitoring-loss semantiği

Agent'ın kapatabildiği sensor güvenlik kontrolü değildir. Host/out-of-band scanner heartbeat'i kaybolursa:

- yeni mutating admission durur;
- active attempt authority policy'ye göre suspend edilir;
- staging korunur;
- “no change observed” success değildir;
- typed `ATTRIBUTION_MONITORING_UNAVAILABLE` HOLD yazılır.

Bu davranış `TRUST-HANDOFF-001` monitoring-loss=authority-suspension hedefiyle aynıdır.

### 12.4 Canonical drift response

1. Drift matched LandingReceipt ise normal projection.
2. Explicit owner operation receipt ile eşleşiyorsa owner change.
3. Birden çok possible receipt varsa `AMBIGUOUS`.
4. Hiçbiriyle eşleşmiyorsa `UNATTRIBUTED_CANONICAL_DRIFT`.
5. Protected surface drift'i severity yükseltir ve new landing/admission authority'sini suspend eder.

Auditor hiçbir adımda “aktif worker X vardı, öyleyse X yazdı” çıkarımı yapmaz.

## 13. Bugünden target'a migration

### 13.1 Docker scoped baseline

Mevcut `captureScopeAttributionManifest` ve `reconcileDockerResultWorkAttribution` dar recovery foundation
olarak korunabilir. İlk migration adımı schema vocabulary'sini dürüstleştirmektir:

- current `VERIFIED` → `SCOPED_DELTA_VERIFIED` projection;
- missing baseline → mevcut HOLD;
- complete manifest gelene kadar terminal `STRUCTURALLY_ATTRIBUTED` claim yok;
- existing settlement store lineage yeni manifest refs'iyle uyumlu hale gelir.

Bu foundation complete engine yerine büyütülmez; yalnız backward-compatible bridge olur.

### 13.2 `.git/objects` bağımlılığı

`git hash-object -w` tabanlı baseline, external attribution CAS/Merkle digest'e taşınır. Migration:

1. non-writing digest path'i shadow olarak hesaplar;
2. byte equality ve performance parity kanıtlar;
3. existing baseline reader version-aware olur;
4. new attempts canonical Git object store'a evidence yazmaz;
5. geçmiş Git objects destructive cleanup görmez; normal repo retention/GC authority'sine bırakılır.

### 13.3 Honest result gate

`findBoundaryViolations` worker claim checker olarak kalacaksa adı/claim'i daraltılır; security boundary yerine
result consistency sinyali olur. Canonical veto `EffectAttributionReceipt` üzerinden gelir.

- empty `filesWrite` read-only;
- Markdown exemption kaldırılır;
- `directories` implicit write kabulü kaldırılır;
- failed result dahil bütün attempts manifest consumer olur;
- missing/UNAVAILABLE attribution mutating task'ta HOLD.

### 13.4 Auditor

Auditor shared-diff worker attribution'ını retire eder; manifest/landing/drift consumers'a geçer. Untracked ve
ignored discovery filesystem adapter katmanından gelir, `git status` parser ekleyerek yamalanmaz.

### 13.5 Host adapters ve all backends

Codex, Gemini, Claude, local/remote provider seçimi attribution semantiğini değiştirmez. Docker, host adapter,
tmux/subprocess ve remote runtime ya ortak isolated staging + discovery contract'ını sağlar ya mutating task
admission'ında typed unsupported/HOLD olur.

### 13.6 Terminal/finalizer/learning consumers

`src/core/sprint-work-attribution.ts:44-63` zero-metric exclusion güvenli bir compatibility behavior olarak
kalabilir; fakat terminal closure ayrıca mutating attempt manifest obligation'ını kontrol eder.

`src/orchestra/sprint-terminal-evidence.ts:649-682` logical completion hesabı, excluded attribution ile
`COMPLETED` üretmeyecek biçimde canonical receipt consumer'a taşınır. Cleanup blocker
(`src/orchestra/sprint-terminal-evidence.ts:708-723`) son savunma değil, aynı terminal invariant'ın projection'ı
olur.

## 14. Storage, CAS, retention ve scale

### 14.1 Storage katmanları

| Katman | İçerik | Özellik |
|---|---|---|
| Metadata DB | Attempt, manifest, effect/classification indexleri | Transactional, tenant-scoped |
| Evidence CAS | File/Merkle nodes, journal batches, frozen snapshots | Encrypted, content-addressed |
| Quarantine store | Prohibited/failed staging references | No-execute, access-controlled |
| Audit log | Decision/effect/settlement hashes and refs | Tamper-evident, external anchor |
| Projection store | Human diff/metrics/dashboard summaries | Rebuildable, non-authoritative |

### 14.2 Tenant ve project isolation

Cross-tenant dedupe physical storage optimization olabilir, fakat logical namespace, encryption key,
authorization ve deletion semantics tenant-bound kalır. Content hash possession authorization değildir.

### 14.3 Retention classes

- Successful landing manifest/receipt: audit and reproducibility retention.
- NO_GO/crash/timeout: bounded diagnostic retention.
- Security quarantine: policy/legal hold.
- Secret-bearing evidence: redacted metadata + encrypted restricted payload; raw secret default olarak capture
  edilmez.
- Ephemeral cache: terminal close-out sonrası bounded deletion receipt.
- Training trace: consent/redaction/retention policy ayrı; attribution presence otomatik training consent değildir.

### 14.4 Scale requirements

- Merkle nodes incrementally reused; full byte rehash yalnız changed/uncertain resources.
- Journal/upper-layer narrows scan set, final root proves closure.
- Large generated trees streaming inventory ve bounded memory kullanır.
- Manifest pagination/chunking deterministic root hash altında olur.
- CAS quotas admission öncesi çözülür; quota exhaustion attempt ortasında silent evidence drop yaratmaz.
- Million-project indexing tenant/project/time partitions ve bounded cardinality kullanır.
- Backpressure new mutating admission'ı durdurabilir; evidence'i düşüremez.

### 14.5 Privacy ve redaction

Manifest file contents'i veya secret values'i default inline taşımaz. Path kendisi sensitive olabilir; display
projection redacted/hashed olabilir, authority store encrypted exact identity'yi korur. Audit sink yalnız refs,
digests, classifications ve bounded metadata alır.

## 15. Config ve rollout contract'ı

Config key adları implementation session'ında mevcut config hierarchy ve i18n surfaces incelenerek kesinleşir;
bu belgede davranış contract'ı normative'dir.

### 15.1 Mode'lar

| Mode | Davranış | Security claim |
|---|---|---|
| `observe` | Legacy path gözlenir; manifest/drift üretimi denenir, landing behavior değişmez | `OBSERVED_NOT_CAUSAL` |
| `shadow` | Isolated discovery + classification production decision ile karşılaştırılır; canonical authority eski path olabilir | Enforced claim yok |
| `enforce` | Mutating admission, discovery, classification, landing ve settlement tek authority chain'inden geçer | Supported facets için `STRUCTURALLY_ATTRIBUTED` |

Final production default `enforce` hedefidir. Ancak rollout sırasında owner-approved ratchet ve explicit
capability coverage kullanılır; flag adı açık olsa bile unsupported path silent legacy fallback yapmaz.

### 15.2 Per-facet capability resolution

Effective config aşağıdakilerin kesişimidir:

- tenant/org policy;
- project policy;
- task capability envelope;
- execution environment adapter features;
- host resource/quota state;
- audit/key/CAS availability;
- tool gateway coverage.

Bir facet sağlanmıyorsa attempt daha geniş yetkiyle değil daha dar admission/HOLD ile sonuçlanır.

### 15.3 Break-glass

Break-glass:

- explicit attended owner approval;
- exact project/task/attempt;
- short TTL;
- reason code and ticket/reference;
- no compliance/training/promotion eligibility;
- visible terminal/dashboard banner;
- full audit and post-run canonical drift scan

gerektirir. “Local developer mode” sınırsız bypass değildir.

## 16. Implementation work packages

Bu paketler başka session'daki Goal/Mission/Flow planına atomik work graph olarak aktarılır. Yeni filename'ler
önerilen responsibility boundaries'dir; implementation session mevcut pattern'lerle collision/placement
incelemesi yapmadan onları canonical kabul etmez.

### W1 — Vocabulary, contracts ve schema migration

**Amaç:** Complete attribution ile dar scoped verification'ı type-system düzeyinde ayırmak.

**Mevcut touchpoints:**

- `src/core/types.ts`
- `src/core/sprint-work-attribution.ts`
- `src/core/task-result-settlement.ts`
- `src/orchestra/sprint-terminal-evidence.ts`
- `src/orchestra/result-evaluator.ts`

**Önerilen focused contracts:**

- `src/core/attempt-effect-manifest.ts`
- `src/core/effect-attribution-receipt.ts`

**Deliverables:**

- D4 assurance state'leri ve versioned decoders.
- `AttemptEffectManifestV1`, entry, discovery evidence, classification ve receipt schemas.
- Legacy Docker `VERIFIED` için explicit `SCOPED_DELTA_VERIFIED` migration projection.
- Unknown major/version ve invalid refs için fail-closed parsing.
- Result inline claim yerine immutable reference contract.

**Closure evidence:** schema round-trip, canonical encoding, signature/tamper, unknown-version, legacy fixture ve
consumer exhaustiveness tests.

### W2 — External evidence CAS ve snapshot authority

**Amaç:** `.git/objects` mutation'ı olmadan immutable base/post content + metadata evidence.

**Mevcut touchpoints:**

- `src/orchestra/spawn-backend-docker.ts:1980-2000`
- `src/orchestra/spawn-backend-docker.ts:2074-2086`
- `src/core/task-result-settlement.ts:453-484`

**Önerilen focused boundary:**

- `src/orchestra/effect-discovery-authority.ts`
- existing storage/CAS service pattern'i altında tenant-scoped evidence repository.

**Deliverables:**

- Non-writing content digest and metadata Merkle.
- First-writer immutable manifest/evidence publication.
- Encryption, quota, retention and redaction hooks.
- Crash-safe temp→fsync→atomic publish and recovery scan.
- Git-object write path'in shadow parity sonrası retirement'ı.

### W3 — Every-environment discovery adapters

**Amaç:** Linux, macOS, Windows native, WSL, OCI ve remote runner için aynı semantic contract.

**Hard dependency:** `ENV-ADAPTER-001` ve Bulgu 4 `ExecutionEnvironmentAdapter`.

**Deliverables:**

- Adapter feature matrix and typed unsupported states.
- Staging create/freeze/destroy/quarantine receipts.
- Upper-layer/journal fast-path.
- Final Merkle scanner.
- Symlink/hardlink/junction/reparse/ADS/xattr/ACL/case/Unicode/mount tests.
- Native real-binary evidence artifacts; single Linux unit test closure sayılmaz.

### W4 — Capability-to-effect classification authority

**Amaç:** Exact scope, protected resources, ephemeral outputs ve aggregate constraints'i deterministic policy
kararına dönüştürmek.

**Hard dependencies:** `TOOL-AUTHORITY-001`, capability/approval authority ve Bulgu 4 capability envelope.

**Önerilen boundary:** `src/orchestra/attempt-effect-authority.ts`.

**Deliverables:**

- Exact `filesWrite`; empty=read-only.
- Explicit directory-wide typed capabilities.
- Effect kind/action matching.
- Protected-resource catalog.
- No Markdown/test exemption.
- Whole-attempt deny/quarantine policy.
- Signed `EffectClassificationDecisionV1`.

### W5 — Provider/backend production wiring

**Amaç:** Her execution path'te born-attempt → scan → receipt closure.

**Mevcut touchpoints:**

- `src/orchestra/spawn-backend-docker.ts`
- accepted Bulgu 4 execution environment/landing coordinator components
- host provider adapter invocation paths
- tmux/subprocess/remote execution routing
- result collector and attempt registry

**Deliverables:**

- Process birth öncesi base snapshot/journal binding.
- DONE/NO_GO/timeout/crash/kill/missing-result close-out.
- Host adapter mutating task'larında isolated environment veya honest unsupported HOLD.
- Attempt effect receipt exact settlement lineage.
- No provider-specific security semantics.

### W6 — Landing ve terminal settlement integration

**Amaç:** Manifest/classification olmadan persistent effect ve logical COMPLETE oluşmaması.

**Mevcut touchpoints:**

- Bulgu 4 LandingAuthority/LandingReceipt planı
- `src/core/task-result-settlement.ts`
- `src/orchestra/result-evaluator.ts`
- `src/orchestra/sprint-terminal-evidence.ts`
- `src/orchestra/sprint-finalizer.ts`
- `src/orchestra/sprint-phases.ts`
- `src/orchestra/mid-sprint-adapter.ts`

**Deliverables:**

- Manifest/decision/landing CAS exact refs.
- Mutating attribution missing/incomplete terminal veto.
- Exclusion count yerine typed logical-task HOLD.
- Whole-attempt landing atomicity and rollback receipt.
- Cost preserved independent of work attribution.
- Accepted outcome/training eligibility gating.

### W7 — Auditor ve canonical drift authority

**Amaç:** Worker guess'i kaldırıp receipt-backed drift detection kurmak.

**Mevcut touchpoints:** `src/monitor/auditor.ts:700-791`.

**Önerilen boundary:** `src/orchestra/canonical-drift-authority.ts` veya monitor altında yalnız read-oriented
consumer + authority service separation.

**Deliverables:**

- Manifest/Tool Gateway/LandingReceipt consumers.
- Owner change receipt matching.
- `UNATTRIBUTED_CANONICAL_DRIFT` and `AMBIGUOUS` states.
- Monitoring-loss authority suspension.
- Protected drift escalation.
- No active-worker assignment heuristic.

### W8 — Legacy migration ve compatibility

**Amaç:** Existing evidence'i fabricate etmeden migration.

**Deliverables:**

- Current Docker attribution fixtures versioned as `SCOPED_DELTA_VERIFIED`.
- Historical unavailable evidence unchanged/typed.
- Observe→shadow→enforce ratchet telemetry.
- Break-glass profile and UI disclosure.
- Old consumer migrations with no silent success fallback.
- `.git/objects` new-write removal proof.

### W9 — Assurance pack, adversarial proof ve XVerify

**Amaç:** Architecture claim'ini production wiring ve every-environment evidence ile kapatmak.

**Deliverables:**

- Canonical producer → consumer → ingress → policy enablement wiring map.
- Adversarial fixtures and real-binary runs.
- Platform matrix artifacts.
- Load/scale/backpressure and crash recovery drills.
- Audit/key/CAS outage drills.
- Output provider'dan farklı fresh provider ile XVerify; unavailable ise typed HOLD.
- `ASSURANCE-PACK-001` compatible evidence index.

## 17. Dependency DAG ve rollout sırası

```text
Provider-Neutral Worker Execution Authority (accepted Bulgu 4)
          |
          +---------------------+
          |                     |
          v                     v
 W1 Contracts/Vocabulary   W2 Evidence CAS/Snapshots
          |                     |
          +----------+----------+
                     v
          W3 Environment Discovery Adapters
                     |
          +----------+-----------+
          |                      |
          v                      v
 W4 Classification        W5 Backend/Provider Wiring
          |                      |
          +----------+-----------+
                     v
             W6 Landing/Settlement
                     |
                     v
             W7 Auditor/Drift
                     |
                     v
             W8 Migration/Ratchet
                     |
                     v
             W9 Assurance/XVerify
```

Rollout sırası:

1. Contract ve legacy vocabulary ayrımı.
2. External CAS + snapshot foundation.
3. One adapter'da end-to-end shadow proof, fakat global COMPLETE claim yok.
4. Full every-environment adapter matrix ve typed unsupported behavior.
5. Classification + Tool Gateway merge.
6. Landing/terminal veto wiring.
7. Auditor drift cutover.
8. Owner-approved enforce ratchet by capability/backend.
9. Legacy shared-root default routing retirement.
10. Fresh cross-provider assurance and ledger settlement.

Bir adapter proof'u diğer environment'ların tasarımını ertelemez; contract matrix W3 başında tanımlanır.

## 18. Acceptance gates

### 18.1 Discovery completeness

- [ ] Worker `filesChanged` boş bırakırken scope dışı regular file yaratır; manifest yakalar ve HOLD üretir.
- [ ] Worker result yazmadan file yaratıp crash olur; effect exact attempt'a bağlanır.
- [ ] Worker NO_GO deyip declared ve prohibited effects bırakır; ikisi de manifest'te görünür.
- [ ] Untracked file ve untracked nested directory discover edilir.
- [ ] Git-ignored file/directory discover edilir.
- [ ] File create-then-delete transient protected effect journal evidence'ında korunur.
- [ ] Content değişmeden mode/executable bit mutation discover edilir.
- [ ] ACL/owner mutation supported platformda discover edilir.
- [ ] xattr/macOS resource fork veya Windows ADS facet'i platform policy'ye göre discover/HOLD olur.
- [ ] File→symlink, symlink target ve dangling link mutation doğru sınıflanır.
- [ ] Hardlink alias/topology ve alias üzerinden content mutation discover edilir.
- [ ] Junction/reparse/UNC/device namespace escape Windows native proof'unda reddedilir.
- [ ] Case-only rename ve Unicode normalization collision ambiguity üretir.
- [ ] Nested mount/bind/WSL boundary crossing capability olmadan reddedilir.
- [ ] Journal overflow final Merkle ile kapanır; kapanmıyorsa success değil HOLD olur.
- [ ] Orphan child process varken freeze success claim edilmez.

### 18.2 Scope/classification

- [ ] Empty `filesWrite` ile herhangi bir persistent staging effect read-only violation olur.
- [ ] `directories` içinde fakat `filesWrite` dışında yazım denied olur.
- [ ] Ordinary `*.md` file post-hoc exempt edilmez.
- [ ] Test file yalnız pre-spawn capability ile declared olur.
- [ ] Content modify grant'i type/mode/link mutation'a otomatik genişlemez.
- [ ] Explicit tree capability quotas/depth/type/excluded descendants'i uygular.
- [ ] Rename source ve target ayrı ayrı authorize edilir.
- [ ] Bir prohibited effect bütün landing'i bloklar; declared subset canonical'a geçmez.
- [ ] Ephemeral output canonical landing'e girmez ve retention receipt'i alır.
- [ ] Protected control-plane write ordinary project grant ile reddedilir.

### 18.3 Attribution ve concurrency

- [ ] İki concurrent sibling aynı base'ten farklı staging effects üretir; manifest'ler karışmaz.
- [ ] Owner canonical file'ı attempt sırasında değiştirir; worker manifest'ine yanlış yazılmaz.
- [ ] Birinci landing sonrası stale ikinci base CAS conflict/HOLD üretir.
- [ ] Shared-root legacy run `STRUCTURALLY_ATTRIBUTED` claim edemez.
- [ ] Worker manifest/ref'i değiştirirse signature/reference validation fail-closed olur.
- [ ] Cross-attempt manifest replay/mix-up attempt binding ile reddedilir.

### 18.4 External effects

- [ ] MCP/service/network mutation exact Tool Gateway receipt ile manifest'e bağlanır.
- [ ] Receipt sequence gap success settlement'ı bloklar.
- [ ] Gateway bypass observation `UNEXPECTED_OR_PROHIBITED` veya HOLD üretir.
- [ ] Secret access evidence secret bytes'i audit/manifest'e sızdırmaz.

### 18.5 Settlement ve audit

- [ ] Mutating attempt `UNAVAILABLE`, `AMBIGUOUS`, `OBSERVED_NOT_CAUSAL` veya HOLD attribution ile logical
  `COMPLETED` olamaz.
- [ ] `SCOPED_DELTA_VERIFIED` legacy evidence full settlement/training eligibility vermez.
- [ ] Attribution HOLD files/lines'ı fabricate etmez; provider cost/usage korunur.
- [ ] DONE, NO_GO, timeout, crash, kill ve missing-result her biri AttributionReceipt üretir.
- [ ] LandingReceipt manifest effect IDs ile birebir eşleşir; extra/omitted effect reddedilir.
- [ ] Post-landing canonical root mismatch drift/security HOLD üretir.
- [ ] Auditor bilinmeyen drift'te worker adı uydurmaz.
- [ ] Monitoring loss new mutating admission/landing authority'sini suspend eder.
- [ ] Audit key/CAS outage silent local fallback yaratmaz.

### 18.6 Storage, scale ve every-environment

- [ ] Attribution measurement `.git/objects` altına yeni object yazmaz.
- [ ] CAS tenant isolation, quotas, retention ve cryptographic deletion tests geçer.
- [ ] Large generated tree bounded-memory streaming manifest üretir.
- [ ] High concurrency'de manifest ordering/idempotency deterministik kalır.
- [ ] Crash during manifest publish temp artifact'tan exactly-once recovery olur.
- [ ] Linux, macOS, Windows native, WSL, OCI ve declared remote adapter için real-binary artifact vardır.
- [ ] Unsupported filesystem facet admission'da honest typed HOLD üretir.
- [ ] Observe/shadow/enforce projection'ları security claim'i yanlış yükseltmez.
- [ ] Fresh second-provider XVerify output provider'dan farklıdır; verifier yoksa closure HOLD'dur.

## 19. Observability ve operator UX

Terminal ana yüzeyde operator'a yalnız “files changed” sayısı gösterilmez. Progressive disclosure:

- attempt assurance state;
- declared/ephemeral/unexpected counts;
- exact manifest/classification/landing receipt refs;
- quarantine/HOLD reason;
- unsupported platform facets;
- canonical drift state;
- owner action gereken recovery choice

gösterir. Human-readable strings mevcut i18n system üzerinden gelir; mechanism modules user-facing string
hardcode etmez.

Dashboard read-oriented projection'dır; authority kararı vermez. Metrics:

- structurally attributed attempt ratio;
- scoped/observed/ambiguous/unavailable counts;
- unexpected/prohibited effect rate;
- manifest/freeze/landing latency;
- journal gaps and scan fallback rate;
- canonical drift and monitoring-loss events;
- CAS quota/backpressure state;
- break-glass usage and compliance-ineligible attempts.

Raw paths/secrets role-aware redaction alır; security operator drill-down exact receipt access policy'sine bağlıdır.

## 20. Non-goals ve yanlış `COMPLETE` iddiaları

### 20.1 Non-goals

- Modelin neden belirli değişikliği seçtiğini psikolojik olarak ispatlamak.
- Root/host admin'e karşı local sandbox'ın mutlak güvenlik sağlaması.
- Git history'yi geçmiş shared-root attempts için synthetic authorship ile yeniden yazmak.
- Worker result prose'unu kaldırmak; yalnız authority rolünü daraltmak.
- Every external side effect'i kernel-level intercept etmek; supported channel'ları Tool Gateway capability
  modelinde honest biçimde kapatmak.
- Auditor'ı ikinci execution/landing engine yapmak.

### 20.2 Aşağıdakiler `COMPLETE` değildir

- `git diff --stat` içine `--untracked-files` benzeri bir ek yapıp writer attribution solved demek.
- Worker `filesChanged` listesini daha sıkı prompt'lamak.
- Yalnız Docker unit tests'i yeşil yapmak.
- Current scoped baseline'a daha fazla glob eklemek.
- `.md` exemption'ı başka extension allowlist'iyle değiştirmek.
- Manifest schema yazıp production caller bağlamamak.
- Journal event'lerini final reconciliation olmadan complete saymak.
- Final scan yapıp transient/external effects'i yok saymak.
- Landing'i bağlamadan yalnız alert üretmek.
- Missing attribution'ı yalnız metric zero veya cleanup block olarak bırakmak.
- Legacy path'e flag açık diye `STRUCTURALLY_ATTRIBUTED` etiketi vermek.
- `.git/objects` evidence side effect'ini sürdürmek.
- Tek platform proof'undan Every Environment claim çıkarmak.
- Same-provider self-verify ile assurance closure yapmak.

## 21. MASTER-PLAN eşleme ve implementation session girdisi

### 21.1 Ledger disposition

| Ledger | Rol | Bu kararın etkisi |
|---|---|---|
| `TRUST-HANDOFF-001` (4180) | **Primary owner** | Agent-generated file provenance, out-of-band monitoring ve host-effect trust chain burada kapanır |
| `RECOVERY-BORN-480-ATTRIBUTION-001` (3175) | Existing narrow foundation | Shared-worktree predecessor contamination recovery; target complete authority değildir |
| `TOOL-AUTHORITY-001` (4060) | Capability dependency | Exact resource/action grants ve Tool Gateway operations |
| `KERNEL-SETTLEMENT-001` (3040) | Terminal dependency | Manifest/landing olmadan exact terminal result yok |
| `RESULT-RECONCILIATION-001` (3261) | Ingestion dependency | Result state effect scan obligation'ını kapatmaz |
| `AUDIT-001` (4120) | Evidence dependency | Decision/effect/settlement causal chain ve tamper evidence |
| `ENV-ADAPTER-001` (8010) | Platform dependency | Filesystem identity, snapshot, journal, freeze ve unsupported truth |
| `SEC-OWASP-ASI-001` (4190) | Assurance parent | ASI02/05/08/10 gap evidence and closure mapping |

Bu belge `docs/MASTER-PLAN.md` üzerinde mutation yapmaz. Implementation session önce ledger drift'ini ve
dependencies'i yeniden okuyup owner-approved task slicing'i canonical satırlara bağlamalıdır.

### 21.2 Başka session'a doğrudan plan girdisi

1. Bu belgeyi ve hard dependency olan
   `docs/audits/provider-neutral-worker-execution-authority-design-2026-08-06.md` dosyasını tamamen oku.
2. `TRUST-HANDOFF-001`, `RECOVERY-BORN-480-ATTRIBUTION-001` ve dependency ledger satırlarının güncel
   state/evidence'ını doğrula.
3. Production path'lerde current `workAttribution`, settlement, terminal evidence, auditor ve provider/backend
   callers için fresh reachability map çıkar.
4. W1–W9'u dependency-bound Goal/Mission/Flow graph'ına dönüştür; foundation slice'larını closure consumer'ına
   bağlamadan terminal DONE sayma.
5. Effective config/provider/model/concurrency/admission'ı repo policy'den çöz; instruction metninden hardcode
   etme.
6. Implementation'ı Deckent'in kendi dogfood yüzeyinden yürüt; typed bootstrap/recovery seam dışında manuel
   substitute kullanma.
7. Her production slice için producer → consumer → entrypoint/ingress → policy/config enablement zincirini
   real-binary evidence ile kanıtla.
8. Riskli enforcement ratchet'ini owner-approved observe→shadow→enforce telemetry ile ilerlet; unsupported
   adapter'da silent fallback verme.
9. Platform proof'u Linux, macOS, Windows native, WSL, OCI ve declared remote matrix'te artifact-bound yap.
10. Final assurance'ı output provider'dan farklı fresh provider ile XVerify et; unavailable ise typed HOLD bırak.

### 21.3 Definition of Done

Bu çalışma ancak aşağıdakilerin tamamıyla DONE'dır:

- her born mutating attempt host-signed complete effect manifest üretir;
- filesystem content + metadata + link/alias + external operation facets coverage kanıtlıdır;
- exact scope classification ve whole-attempt quarantine production-wired'dır;
- canonical worker execution isolated staging'dedir;
- LandingAuthority dışında canonical mutation yoktur;
- missing/ambiguous/unavailable attribution terminal settlement'ı fail-closed bloklar;
- Auditor receipt-backed drift consumer'dır, writer tahmin etmez;
- evidence CAS canonical `.git/objects` dışında ve tenant-scoped'dır;
- legacy shared-root security claim'i dürüstçe sınırlandırılmıştır;
- every-environment real-binary, crash, concurrency, scale ve outage proof'ları vardır;
- acceptance gates evidence index'ine bağlanmıştır;
- independent cross-provider assurance verdict'i vardır veya typed HOLD açık kalır.
