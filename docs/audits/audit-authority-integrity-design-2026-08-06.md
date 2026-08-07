# Canonical Audit Authority — Integrity, Anchoring ve Key Lifecycle Handoff (2026-08-06)

> **Karar durumu:** KABUL EDİLDİ — Alperen, 2026-08-06 OWASP Agentic Top 10 bağımsız
> inceleme oturumu, Bulgu 3.
>
> **Implementation durumu:** Bu oturumda production kodu değiştirilmedi. Bu doküman başka bir
> Deckent session'ında Goal/Mission/Flow/Run planına alınacak implementation authority girdisidir.
>
> **Canonical ledger:** `AUDIT-001` (order 4120), parent `AUTHORITY-001` (4000); ilişkili
> `PRINCIPAL-001` (4010), `OPERATION-001` (4030), `RECEIPT-001` (4070),
> `TRUST-HANDOFF-001` (4180), `P02-654` enterprise KMS/HSM adapters (2240),
> `DATA-GOV-001` (10020), `ASSURANCE-PACK-001` (10080), `SEC-OWASP-ASI-001` (4190).

## 1. Sonuç — tek cümle

Deckent audit'i project-local event JSONL ve source-known symmetric secret olmaktan çıkarılacak; bütün
security-relevant operation'lar VerifiedPrincipal ve immutable authority receipts'e bağlı canonical
`AuditAuthority` üzerinden transactional append alacak, event ranges asymmetric signed checkpoint'lerle
mühürlenecek ve enterprise compliance claim'i durable external anchor receipt'i olmadan açılamayacak.

## 2. Bugünkü code-truth baseline

| Alan | Bugünkü gerçek | Enforcement hükmü |
|---|---|---|
| Ana audit secret | `AUDIT_HMAC_SECRET = 'deckent-audit'` source içinde sabit ve export edilir (`src/core/audit-writer.ts:23-35`) | **Forgeable** |
| Ana event chain | Per-stream module-local `Map` head + HMAC chain (`src/core/audit-writer.ts:52-95`, `:164-203`) | Process-local tamper signal |
| Legacy acceptance | HMAC'siz records skip edilir; v1 unkeyed SHA-256 hâlâ geçerli sayılır (`src/core/audit-writer.ts:215-245`) | Downgrade/legacy assurance |
| Event storage | `.deckent/<sprint>-events.jsonl` ve sequence file project root altındadır (`src/core/event-stream.ts:197-205`) | Worker/project trust boundary içinde |
| Sequence/write | Sequence read→write ve JSONL append ayrı işlemlerdir (`src/core/event-stream.ts:238-265`, `:349-372`) | Concurrent atomicity yok |
| Write failure | Event write error warning/null olur ve sprint'i durdurmaz (`src/core/event-stream.ts:314-382`) | **ADVISORY** |
| Read/missing behavior | Missing/unreadable stream empty list döndürebilir (`src/core/event-stream.ts:389-432`) | Deletion ile empty ayrımı yok |
| Rotation | Event file `.1` üzerine overwrite edilir (`src/core/event-stream.ts:207-229`) | Historical truncation mümkün |
| Export integrity | Export anında query sonucuna ayrı HMAC chain üretilir; default secret yine `deckent-audit` (`src/core/audit-export.ts:28-80`, `:108-120`) | Transfer-time reseal; write-time proof değil |
| Terminal key | Random 32-byte key `.deckent/audit-key` altında, POSIX `0600` denenir (`src/api/terminal/audit-integrity.ts:68-93`) | Sabit string'den iyi, fakat project-local |
| Terminal fallback | Integrity config/sink yoksa plain audit insert mümkündür (`src/api/terminal/audit.ts:95-131`) | Optional integrity |
| Terminal empty verify | Empty audit rows `ok:true` döner (`src/api/terminal/audit-integrity.ts:102-109`) | Whole-log deletion detection yok |
| Actor authority | `tenantId`, `actor`, `action` için yalnız non-empty string validation var (`src/core/audit-writer.ts:100-134`, `:250-254`) | Actor claim authenticate edilmiyor |
| Metadata | Durable event sink arbitrary `Record<string, unknown>` metadata kabul eder (`src/core/audit-writer.ts:100-110`) | Sink-level redaction schema yok |
| SIEM forwarding | HTTP/syslog failures retry sonrası drop edilip caller'a reject etmez (`src/cli/commands/audit.ts:90-113`, `:132-155`) | External trust anchor değil |
| Retention | Age-expired records gerçekten prune edilebilir; chain break dürüstçe dokümante (`src/cli/commands/audit.ts:45-62`) | Signed retention tombstone yok |
| Compliance verdict | Chain integrity tek boolean/ON-OFF projection'ına indirgenir (`src/core/compliance-report.ts:35-76`) | Assurance boyutları birleşmiş |

Repo-wide static call graph'da `writeAuditEvent()` 31 production/test-adjacent site tarafından tüketilir;
enterprise admin, RBAC/capability, autonomous, process ve mission surfaces aynı fail-safe writer'a bağlıdır.

**Baseline hükmü:** Bugünkü ana chain accidental corruption ve secret'i bilmeyen dar storage attacker için
sinyal sağlar; source/repository sahibi, aynı-process veya project-writer adversary'ye karşı authentic audit
kanıtı değildir. Toplam sınıf **ADVISORY tamper evidence**'dır.

## 3. Korunan varlıklar ve threat model

### 3.1 Korunan varlıklar

- Verified actor/principal, tenant/project ve operation identity.
- Capability, approval, budget, provider dispatch, effect ve settlement decisions.
- Audit record order, completeness, retention ve redaction truth.
- Runtime binary/policy/config identity.
- Key lifecycle, public trust bundle ve external anchor receipts.
- Compliance/customer-facing assurance claims.

### 3.2 Adversary seviyeleri

| Seviye | Adversary yeteneği | Gerekli savunma |
|---|---|---|
| A1 Project writer | Repo/plugin/worker/project files üzerinde RW | Host-owned ledger + project dışı key authority |
| A2 Deckent process compromise | Audit API çağırabilir, local state okuyup değiştirebilir | Ayrı audit service, immutable receipts, external checkpoints |
| A3 Host admin/root | Local process, log ve local key kontrolü | Remote WORM/transparency anchor |
| A4 Organization/KMS admin | Signing policy/key authority etkisi | Separation of duties, multi-party/independent anchor |

Her verification sonucu hangi adversary seviyesine karşı kanıt sunduğunu açıkça belirtir. Local-only audit,
host admin'e karşı “tamper-proof” claim edemez.

### 3.3 Hash-chain'in doğal sınırı

Local chain, secret güvenliyken middle mutation/deletion/insert'i algılayabilir. Şunları tek başına
algılayamaz:

- Valid suffix truncation.
- Whole-stream deletion/replacement.
- Writer'ın zorunlu event'i hiç üretmemesi.
- Caller'ın sahte `actor`/tenant/action claim'i.
- Key ve log'un birlikte ele geçirilmesi.
- Same-key verifier'ın geçmişi baştan üretmesi.

Bu yüzden integrity, anchoring, completeness ve actor authenticity ayrı authority alanlarıdır.

## 4. Kabul edilen mimari kararlar

### D1 — Tek canonical `AuditAuthority`

Ana audit writer, terminal audit, export-time HMAC ve surface-specific audit bridges ayrı cryptographic
authority olarak yaşamaz. Tek canonical authority append, key epoch, checkpoint, anchor, verification,
retention ve receipt contracts'ını yönetir.

Invocation/provider/task receipts ortadan kaldırılmaz; AuditAuthority onları causal index olarak mühürler.
Audit yeni truth icat etmez, host-owned receipt truth'una bağlanır.

### D2 — Project event stream audit SSOT değildir

`.deckent/*-events.jsonl` terminal/dashboard/live-feed için observability projection olarak kalabilir.
Canonical audit records ve chain heads worker/project write scope dışında host-owned storage'da yaşar.
Projection kaybı canonical record'u etkilemez; projection'dan canonical audit yeniden kurulmaz.

### D3 — Event MAC + asymmetric checkpoint birlikte kullanılır

- High-volume records per-stream/per-epoch derived key ile chained MAC/hash alır.
- Belirli range/event-count/time threshold'larında Merkle/checkpoint root üretilir.
- Checkpoint asymmetric key ile imzalanır.
- Independent verifier yalnız public trust bundle ister; private/HMAC key almaz.

Symmetric verifier'a secret vermek independent verification değildir; verifier aynı zamanda forger olur.

### D4 — Enterprise claim external durable anchor ister

Checkpoint aynı local disk üzerinde kalırsa host compromise'a karşı güvence yoktur. Enterprise compliance
profile, external anchor'ın durable acknowledgement receipt'i olmadan `externally_anchored` veya
“tamper-proof” claim edemez.

Ordinary fire-and-forget SIEM forwarding anchor sayılmaz.

### D5 — Solo/local ve enterprise assurance dürüstçe ayrılır

| Mode | Gerekli authority | İzin verilen claim |
|---|---|---|
| `unsealed` | Key/checkpoint yok | Telemetry only |
| `host_sealed` | Host-owned ledger + protected key + signed local checkpoints | Local tamper-evident |
| `externally_anchored` | Host-sealed + durable remote anchor receipt | Independent anchored audit |

Solo/local default `host_sealed` olabilir. Enterprise/compliance-required profile external anchor yoksa
fail-closed HOLD veya açık non-compliant state üretir; silent downgrade yoktur.

### D6 — Key source/config/env/project root değildir

Private master/signing key:

- Source code'da bulunmaz.
- Project config'e yazılmaz.
- `.deckent`/`.brain` altında tutulmaz.
- Plain environment value olarak taşınmaz.
- Worker veya plugin process'e mount edilmez.
- Verifier/export consumer'a verilmez.

Environment yalnız key-provider URI/alias gibi secret olmayan bootstrap pointer taşıyabilir.

### D7 — Platform key providers capability-resolved'dur

- Linux: kernel keyring/libsecret/TPM/hardened host service adapter.
- macOS: Keychain/Secure Enclave capability adapter.
- Windows native: DPAPI/CNG/TPM adapter.
- WSL: Linux guest ↔ Windows host boundary açıkça çözülür.
- Enterprise: KMS/HSM/Vault signing adapter.
- Air-gapped: TPM/HSM veya offline-root trust bundle.

Unsupported/key-authority-unavailable critical path typed HOLD'dur; static/env/file fallback yoktur.

### D8 — Stream head ve sequence transactional'dır

Module-local `Map`, read-then-write seq file veya separate append authority değildir. Append transaction:

1. Stream head/next sequence row'unu lock eder.
2. Record'u validate/redact eder.
3. Previous digest ve next sequence'i bağlar.
4. Record + new head'i atomik commit eder.
5. Idempotency key ile duplicate retry'ı same result'e reconcile eder.

Concurrent writers fork/duplicate sequence üretemez.

### D9 — Audit actor string değil verified authority reference'tır

Canonical record en az VerifiedPrincipal ref/assurance, tenant/project identity, operation ID, policy digest,
capability/approval/budget/invocation/effect/settlement receipt refs taşır.

Worker veya caller claim'i saklanabilir fakat `sourceTrust=worker_claim|caller_claim` olarak etiketlenir;
verified host effect gibi gösterilemez.

### D10 — Completeness operation contract'ından gelir

Her security-relevant operation için zorunlu lifecycle:

```text
intent → authority_decision → effect/dispatch → settlement
```

`OPERATION-001` operation catalog hangi record/receipt'lerin zorunlu olduğunu tanımlar. Reconciler receipt
store ile audit ledger'ı karşılaştırır. Valid chain içinde eksik event varsa `integrity=intact` fakat
`completeness=missing_events` olur.

### D11 — Critical audit failure fail-closed'dur

Security-critical mutation için durable intent/decision append effect'ten önce doğmazsa operation doğmaz.
Effect doğmuş, settlement audit'i yazılamamışsa gerçek effect korunur fakat operation/run
`AUDIT_SETTLEMENT_PENDING/HOLD` olur; false COMPLETE yayımlanmaz.

Operational telemetry best-effort olabilir; drop metric ve typed diagnostic üretir.

### D12 — Sink-level schema/redaction zorunludur

Arbitrary metadata durable sink'e doğrudan ulaşamaz. Operation-specific schemas, field allowlist, size limits,
classification/redaction policy, secret detector ve evidence-reference tercih edilir. Raw prompt/output,
secret, credential veya large payload yerine content digest/ref taşınır.

### D13 — Retention signed tombstone/checkpoint ile yapılır

Payload prune ancak range checkpoint external/local policy'ye göre anchorlandıktan, legal hold ve archive
durumu doğrulandıktan sonra yapılabilir. First/last seq, count, root, deletion authority ve retention policy
signed manifest olarak kalır. Silent gap yoktur.

### D14 — Legacy history retroaktif güven kazanmaz

HMAC'siz/v1, known static-key v2 ve project-keyed terminal records assurance class'ıyla işaretlenir.
Migration manifest yalnız “bu bytes migration anında buydu” der; original-time authenticity iddia etmez.

### D15 — Verification çok boyutludur

Tek `intact:true` veya `ON` yerine ayrı verdict'ler:

```text
integrity
anchoring
completeness
actorAuthenticity
retention
keyStatus
schemaRedaction
runtimeIdentity
```

Unknown/degraded boyutlar success'e katlanmaz.

## 5. Hedef architecture

```text
VerifiedPrincipal + Operation + Authority/Effect/Settlement Receipts
                              │
                              ▼
                     AuditIntent validation
                              │
                    schema + redaction + trust
                              │
                              ▼
          ┌──── transactional AuditAuthority append ────┐
          │ atomic sequence + previous digest           │
          │ event MAC/key epoch                         │
          │ durable record + stream head                │
          └─────────────────────────────────────────────┘
                              │
             ┌────────────────┴────────────────┐
             ▼                                 ▼
    event-stream projection            range/Merkle checkpoint
                                                │
                                                ▼
                                     asymmetric KeyProvider sign
                                                │
                           ┌────────────────────┴───────────────────┐
                           ▼                                        ▼
                   local checkpoint                     external AnchorSink
                                                                    │
                                                                    ▼
                                                          AnchorReceipt
```

Verification:

```text
records + signed checkpoints + trust bundle + anchor receipts
      + operation receipt completeness + retention manifests
                              │
                              ▼
                 multi-dimensional AuditVerdict
```

## 6. Cryptographic design

### 6.1 Canonical event digest

Event bytes versioned deterministic encoding ile canonicalize edilir. JSON kullanılacaksa RFC-style
canonical form ve numeric/string normalization schema tarafından pinlenir; implementation-specific
`JSON.stringify` order authority değildir.

```text
eventDigest = HASH(
  domainSeparator
  || streamId
  || sequence
  || previousEventDigest
  || schemaVersion
  || keyEpoch
  || canonicalRecordBody
)
```

Domain separation örneği semantic olarak `deckent-audit-record-v3` taşır. Hash/signature algorithms key
metadata ve schema tarafından pinlenir; caller algorithm seçemez.

### 6.2 Per-epoch event MAC

High-volume event MAC key'i master key'den context-bound derive edilir veya KeyProvider tarafından sealed
epoch key olarak sağlanır:

```text
context = tenantId || streamId || epoch || schemaVersion
```

Tenant/stream/epoch arasında key reuse yoktur. Raw master key process'e dönmez. Epoch key memory'de bounded
lifetime taşır, zeroization/capability sınırı adapter tarafından yönetilir.

### 6.3 Merkle/range checkpoint

Checkpoint en az:

- `checkpointId`, schema version.
- Tenant, stream, partition/region.
- First/last sequence ve event count.
- First/last event digest ve current chain head.
- Merkle root.
- Previous checkpoint digest.
- Runtime build, operation catalog, redaction policy ve config-policy digests.
- Key ID/epoch/algorithm.
- Authority start/end timestamps.
- Retention/legal-hold class.

Checkpoint private key ile imzalanır. Critical settlement policy isterse immediate checkpoint; normal
throughput event-count/time thresholds ile batch checkpoint kullanır.

### 6.4 Genesis ve stream continuity

Global known constant genesis kullanılmaz. Her stream için signed genesis manifest:

- Tenant/project/stream identity.
- Creation authority ve timestamp.
- Initial schema/policy/build digests.
- Initial signing key/trust-store version.
- Parent/migration checkpoint ref.

Stream deletion durumunda external anchor/genesis manifest beklenen stream'i kanıtlar; empty list success
değildir.

## 7. Key authority ve lifecycle

### 7.1 `AuditKeyProvider` contract

```ts
interface AuditKeyProvider {
  describeActiveKey(context: AuditKeyContext): Promise<AuditPublicKeyDescriptor>;
  deriveOrOpenEpochMacKey(context: AuditEpochContext): Promise<SealedMacCapability>;
  signCheckpoint(input: AuditCheckpointSigningInput): Promise<AuditSignature>;
  getTrustBundle(version?: string): Promise<AuditTrustBundle>;
  getKeyStatus(keyId: string, at: string): Promise<AuditKeyStatus>;
}
```

Private material export eden method yoktur. `SealedMacCapability` yalnız MAC operation'ı sunar veya tightly
scoped ephemeral key handle'dır.

### 7.2 Key descriptor

```text
keyId
providerKind
algorithm
epoch
tenant/region scope
validFrom/validTo
status: active | retired | revoked | compromised | unknown
trustStoreVersion
attestation/evidence refs
```

### 7.3 Rotation

1. Eski epoch final checkpoint üretir.
2. Yeni key descriptor authority tarafından doğar.
3. Mümkünse old→new ve new→old continuity signatures yazılır.
4. Yeni genesis/epoch önceki checkpoint digest'ine bağlanır.
5. Public trust bundle historical keys'i doğrulama için tutar.
6. Revoked key yeni signing yapamaz; historical validity signing-time policy ile değerlendirilir.

Eski key kayıpsa history re-sign edilmez; yeni stream/epoch `continuity_unproven` başlar ve verifier bunu
success'e katlamaz.

### 7.4 Key provider failure

- Critical append/checkpoint requirement: typed HOLD.
- Existing in-flight effect: settlement pending ve local durable recovery intent.
- Telemetry: degraded/drop metric.
- Static secret, project key veya env value fallback: yasak.
- `host_sealed` → `unsealed` silent downgrade: yasak.

## 8. Normative record contracts

İsimler repository naming pattern'ine uyarlanabilir; authority alanları korunmalıdır.

### 8.1 `AuditIntent`

```ts
interface AuditIntent {
  readonly eventId: string;
  readonly idempotencyKey: string;
  readonly criticality: 'security_critical' | 'settlement_critical' | 'telemetry';
  readonly tenantId: string;
  readonly projectIdentity: string;
  readonly principalRef: string;
  readonly principalAssurance: string;
  readonly operationId: string;
  readonly operationPhase: 'intent' | 'authority_decision' | 'effect' | 'settlement';
  readonly outcome: 'allow' | 'deny' | 'hold' | 'succeeded' | 'failed' | 'unknown';
  readonly targetRef?: string;
  readonly correlationId: string;
  readonly causationId?: string;
  readonly receiptRefs: readonly string[];
  readonly policyDigest: string;
  readonly runtimeBuildDigest: string;
  readonly data: unknown;
}
```

Caller timestamp, actor string, sequence, previous digest, key info ve redaction result veremez; bunlar
AuditAuthority alanıdır.

### 8.2 `AuditRecordV3`

```ts
interface AuditRecordV3 {
  readonly schemaVersion: 'deckent.audit.record.v3';
  readonly streamId: string;
  readonly sequence: bigint;
  readonly eventId: string;
  readonly authorityTimestamp: string;
  readonly previousEventDigest: string;
  readonly eventDigest: string;
  readonly mac: string;
  readonly keyId: string;
  readonly keyEpoch: string;
  readonly tenantId: string;
  readonly projectIdentity: string;
  readonly principalRef: string;
  readonly principalAssurance: string;
  readonly operationId: string;
  readonly operationPhase: string;
  readonly outcome: string;
  readonly correlationId: string;
  readonly causationId?: string;
  readonly receiptRefs: readonly string[];
  readonly sourceTrust: 'host_verified' | 'provider_verified' | 'worker_claim' | 'caller_claim';
  readonly redactionPolicyVersion: string;
  readonly payloadDigest: string;
  readonly redactedPayload: unknown;
  readonly policyDigest: string;
  readonly runtimeBuildDigest: string;
}
```

### 8.3 `AuditCheckpoint`

```ts
interface AuditCheckpoint {
  readonly schemaVersion: 'deckent.audit.checkpoint.v1';
  readonly checkpointId: string;
  readonly streamId: string;
  readonly firstSequence: bigint;
  readonly lastSequence: bigint;
  readonly eventCount: bigint;
  readonly firstEventDigest: string;
  readonly lastEventDigest: string;
  readonly merkleRoot: string;
  readonly previousCheckpointDigest?: string;
  readonly keyId: string;
  readonly algorithm: string;
  readonly signature: string;
  readonly policyDigests: readonly string[];
  readonly createdAt: string;
}
```

### 8.4 `AuditAnchorReceipt`

```ts
interface AuditAnchorReceipt {
  readonly anchorId: string;
  readonly anchorProvider: string;
  readonly checkpointId: string;
  readonly checkpointDigest: string;
  readonly remoteObjectVersionOrSequence: string;
  readonly acceptedAt: string;
  readonly retentionPolicyRef: string;
  readonly anchorSignatureOrProof: string;
  readonly status: 'durable' | 'pending' | 'rejected' | 'unknown';
}
```

Network send success veya HTTP 2xx tek başına durable anchor değildir; adapter provider-specific retention/
append-only evidence üretir.

### 8.5 Verification verdict

```ts
interface AuditVerificationVerdict {
  readonly integrity: 'intact' | 'broken' | 'unknown';
  readonly anchoring: 'externally_anchored' | 'host_sealed' | 'none' | 'unknown';
  readonly completeness: 'complete' | 'missing_events' | 'unknown';
  readonly actorAuthenticity: 'verified' | 'claimed' | 'unknown';
  readonly retention: 'valid' | 'gap' | 'legal_hold' | 'unknown';
  readonly keyStatus: 'valid' | 'revoked' | 'compromised' | 'unknown';
  readonly schemaRedaction: 'valid' | 'rejected' | 'unknown';
  readonly runtimeIdentity: 'verified' | 'mismatch' | 'unknown';
  readonly reasons: readonly string[];
  readonly evidenceRefs: readonly string[];
}
```

Overall display bu boyutları saklamaz; “PASS” yalnız profile-specific required dimensions sağlanıyorsa
türetilir.

## 9. Operation completeness ve critical failure semantics

### 9.1 Operation lifecycle

Canonical security operation:

```text
operation intent
  → principal/tenant/capability/approval/budget decisions
  → dispatch/effect receipt
  → terminal settlement receipt
```

Audit records exact receipt digests'e bağlanır. Operation catalog required phase set'ini ve criticality'yi
tanımlar. Reconciler:

- Receipt var, audit record yok.
- Audit effect var, invocation receipt yok.
- Intent/decision var, settlement yok.
- Duplicate/forked operation IDs.
- Tenant/principal/policy digest mismatch.

durumlarını typed incomplete verdict'e çevirir.

### 9.2 Pre-effect append

Security-critical operation intent/decision record'u canonical ledger'a commit olmadan effect capability
mint edilmez. Audit append receipt, capability/provider/approval execution handle'ına bound prerequisite'tir.

### 9.3 Post-effect settlement failure

Effect gerçekleşmişse rollback varsayılmaz. Output/effect evidence korunur, settlement retry/reconciliation
queue'ya girer, operation `AUDIT_SETTLEMENT_PENDING/HOLD` olur. Outer run/surface false COMPLETE üretmez.

### 9.4 Telemetry

Telemetry event failure user flow'u bloklamayabilir; drop counter, health state ve diagnostic receipt
üretir. Telemetry kaybı security-critical completeness sonucu gibi gösterilmez.

## 10. Storage, partitioning ve concurrency

### 10.1 Local adapter

- Project root dışı platform-resolved host state path.
- Owner-hardened permissions/ACL.
- SQLite WAL veya eşdeğer transaction engine.
- Audit records append-only schema; update/delete API yok.
- Stream head/sequence ve record aynı transaction.
- Integrity check/recovery on open.
- Worker/container/project bind mount dışında.

### 10.2 Enterprise adapter

- Tenant/region/time partitioning.
- Serializable transaction veya deterministic row locks.
- Per-stream strict order; global total order zorunlu değil.
- Idempotency unique constraints.
- Replication/backup/retention policies evidence-bearing.
- Region/residency ve tenant encryption policy.

### 10.3 Scale

- KMS/HSM sign per event yok; checkpoint batching.
- Merkle tree incremental/provable range verification.
- Partition-local sequence avoids global bottleneck.
- Checkpoint/anchor backlog bounded ve backpressure-aware.
- Critical anchor SLO breach compliance profile admission'ını durdurur; backlog sessiz büyümez.

### 10.4 Concurrency invariants

- Aynı stream'de duplicate sequence yok.
- Two writers aynı previous head'den fork edemez.
- Idempotent retry aynı event/record ref'i döndürür.
- Conflict idempotency key typed HOLD'dur.
- Projection write failure canonical transaction'ı geri almaz; projection repairable.
- Canonical record commit olmadan “audited” outcome yayımlanmaz.

## 11. External anchoring

### 11.1 `AuditAnchorSink` contract

Anchor sink checkpoint bytes/digest'i alır ve durable provider-specific proof döndürür. Supported classes:

- WORM/Object Lock object version + retention proof.
- Append-only audit service sequence/receipt.
- Transparency log inclusion proof.
- Offline signed manifest written to approved immutable media.

Ordinary file copy, UDP syslog veya retry-after-drop forwarder anchor değildir.

### 11.2 Anchor lifecycle

```text
checkpoint_created
  → anchor_pending
  → durable | rejected | unknown
  → periodic re-verification
```

Enterprise required profile `anchor_pending/rejected/unknown` durumunda bounded grace policy sonrası new
security-critical operations'ı HOLD eder. Existing effects settle/reconcile edilir; audit state silinmez.

### 11.3 Separation of duties

Checkpoint signer ve anchor retention administrator mümkün olduğunca ayrı principal/policy domainlerinde
olur. KMS administrator'ın geçmiş anchor object'lerini silememesi, storage administrator'ın yeni valid
checkpoint imzalayamaması hedeflenir.

## 12. Export ve independent verification

### 12.1 Evidence bundle

Canonical export şunları taşır:

- Requested records/redacted subset ve original digest references.
- Signed checkpoint range.
- Anchor receipts/inclusion proofs.
- Public trust bundle ve key rotation history.
- Retention/legal-hold manifests.
- Operation completeness reconciliation.
- Runtime build/config/policy/schema digests.
- Verification verdict ve evidence refs.

Export private/HMAC key istemez. Filtered export, original range proof/Merkle inclusion path'leri olmadan
source integrity claim etmez.

### 12.2 Existing export migration

`audit-export.ts` HMAC chain ikiye ayrılır:

- Gerekliyse transfer checksum olarak açık adla korunabilir.
- Original audit authenticity/compliance proof'u olarak kullanılamaz.
- Default source-known secret kaldırılır.
- `verifyHmacChain()` yerine public-key/checkpoint/anchor verifier canonical olur.

### 12.3 CLI/API surface

`deckent audit verify` en az şunları gösterir:

```text
integrity        INTACT/BROKEN/UNKNOWN
anchoring        EXTERNAL/HOST_ONLY/NONE/UNKNOWN
completeness     COMPLETE/MISSING/UNKNOWN
actor authority  VERIFIED/CLAIMED/UNKNOWN
retention        VALID/GAP/LEGAL_HOLD/UNKNOWN
key status       VALID/REVOKED/COMPROMISED/UNKNOWN
```

Empty stream, missing expected stream/anchor veya skipped legacy records “intact success” değildir.

## 13. Schema-level redaction ve data governance

### 13.1 Sink chokepoint

Her operation event schema:

- Exact allowed fields ve types.
- Maximum payload/field sizes.
- Secret/token/credential classification.
- Raw prompt/output/file content yerine digest/ref.
- Tenant data classification ve residency.
- Redaction policy version.
- Rejected field reason.

taşır. Caller'ın arbitrary metadata'sı canonical sink'e doğrudan yazılmaz.

### 13.2 Data minimization

Audit “her şeyi sakla” deposu değildir. Kararı/effect'i kanıtlamak için gereken minimum fields, immutable
receipt digests ve redacted summaries tutulur. Sensitive payload gerekirse ayrı governed evidence store ref'i
taşır.

### 13.3 Retention/legal hold

Prune flow:

1. Range checkpoint verified.
2. Required external anchor durable.
3. Archive/backup integrity verified.
4. Legal hold checked.
5. Signed retention/deletion authorization recorded.
6. Payload pruned.
7. Signed tombstone/range root retained.

Retention manifest olmadan sequence gap compliance-valid sayılamaz.

## 14. Legacy migration

### 14.1 Assurance classes

| Legacy source | Migration label |
|---|---|
| HMAC'siz records / v1 SHA | `legacy_unkeyed` |
| Static `deckent-audit` v2 HMAC | `legacy_known_key` |
| Terminal project-local random key | `legacy_project_keyed` |
| New host ledger, external anchorsız | `host_sealed` |
| Signed checkpoint + durable external receipt | `externally_anchored` |

### 14.2 Migration manifest

- Source paths/store IDs ve byte/range digests.
- Observed record count ve sequence ranges.
- Detected chain version/key class.
- Integrity gaps/malformed/skipped records.
- Migration authority timestamp/runtime build.
- Snapshot Merkle root.
- New key signature ve external anchor receipt (varsa).
- Açık statement: original-time authenticity not proven.

Legacy records yeni HMAC/signature ile re-sign edilip historical trust seviyesi yükseltilmez.

### 14.3 Continuation

Yeni v3 genesis migration manifest digest'ine bağlanır. Old stream read-only/archive olur. Mixed legacy/v3
tek boolean chain gibi doğrulanmaz; verdict range/class bazında ayrılır.

## 15. Failure/settlement matrisi

| Durum | Security-critical operation | Audit/assurance state |
|---|---|---|
| Host ledger/key available | Devam | Host-sealed append |
| Pre-effect append failure | Effect doğmaz | Typed AUDIT_HOLD |
| Effect oldu, settlement append failed | Effect korunur; new continuation HOLD | Settlement pending |
| Key provider unavailable | New critical op HOLD | Key authority unknown |
| Checkpoint signing failed | Bounded retry; critical profile HOLD | Checkpoint pending |
| External anchor pending | Solo host-sealed devam edebilir; enterprise grace sonrası HOLD | Not externally anchored |
| Anchor rejected/unknown | Enterprise critical op HOLD | Anchor failure |
| Telemetry append failed | Flow devam edebilir | Drop metric/diagnostic |
| Sequence/idempotency conflict | Operation HOLD/reconcile | Integrity conflict |
| Stream missing ama external checkpoint var | Verification broken/missing | Deletion detected |
| Stream ve local checkpoint birlikte silinmiş | External anchor üzerinden detected | Recovery required |
| Legacy v1/static key | Read/export allowed | Legacy assurance only |
| Key rotated normally | New epoch | Continuity verified |
| Old key lost | New stream/epoch allowed by recovery authority | Continuity unproven |
| Retention without tombstone | Verification gap | Compliance failure |
| Actor yalnız caller string | Record claim olarak kalabilir | Actor authenticity claimed |
| Receipt completeness missing | Operation false COMPLETE olmaz | Missing events/HOLD |

## 16. File-by-file implementation planı

### W1 — Audit contracts, operation binding ve error taxonomy

**Files:**

- `src/core/audit-writer.ts` veya yeni canonical `audit-authority` modülleri.
- `src/core/audit-query.ts`
- `src/core/compliance-report.ts`
- `src/core/errors.ts`
- `src/core/config-types.ts`, `src/core/config.ts`
- `src/cli/helpers/messages.ts`

**İş:**

- `AuditIntent`, `AuditRecordV3`, checkpoint, anchor receipt ve multi-verdict types.
- `actor:string` yerine principal/operation/receipt authority refs.
- Criticality ve operation phase contracts.
- i18n-clean typed errors; mechanism modules hardcoded user strings taşımaz.
- Config profile/mode/key-provider/anchor requirements ve honest defaults.

**Kapanış kanıtı:** schema validation, unknown fields, mismatched tenant/principal/receipt, config roundtrip,
en/tr key parity.

### W2 — Platform key-provider authority

**Dependencies:** `P02-654`, platform capability adapters, secret governance.

**Files:**

- Canonical `AuditKeyProvider` interface.
- Linux/macOS/Windows/WSL adapters.
- KMS/HSM/Vault/air-gapped adapters.
- Provider capability registry/config resolver.

**İş:**

- Private-key-nonexporting sign/MAC capability.
- Public trust bundle/key status/attestation.
- Epoch derivation, rotation, revoke/compromise states.
- Project/env/static fallback removal.
- Platform unsupported fail-closed behavior.

**Kapanış kanıtı:** real OS key-store capability tests; key not present in project/env/log; cross-tenant
context separation; rotation/revocation/loss; KMS adapter contract.

### W3 — Host-owned audit ledger ve atomic append

**Files:**

- Local transactional storage adapter.
- Enterprise audit storage interface/adapter.
- Stream/partition/head/idempotency stores.
- Host state-path/permission adapters.

**İş:**

- Project dışı storage ve permissions.
- Atomic sequence + record + head transaction.
- Per-stream strict ordering/idempotency/fencing.
- Crash/reopen/corruption recovery.
- Tenant/region/time partitioning.
- Append-only write API; update/delete authority yok.

**Kapanış kanıtı:** concurrent fork/duplicate prevention; multi-process contention; crash points;
tenant/project isolation; storage corruption HOLD; platform matrix.

### W4 — Chain, checkpoint, signature ve external anchor

**Files:**

- Cryptographic canonicalization/event digest/Merkle builder.
- Checkpoint coordinator.
- `AuditAnchorSink` adapters.
- Trust bundle/verifier modules.

**İş:**

- Domain-separated v3 record chain.
- Per-epoch MAC and asymmetric checkpoint signing.
- Signed genesis/rotation continuity.
- WORM/transparency/enterprise append anchor receipts.
- Anchor backlog/backpressure/SLO state.

**Kapanış kanıtı:** middle mutation, insertion, truncation, whole-stream deletion, checkpoint replay,
wrong key/algorithm, anchor receipt forgery, rotation continuity negative tests.

### W5 — Production operation/receipt wiring ve fail-closed semantics

**Files/surfaces:**

- Existing 31 `writeAuditEvent()` call sites.
- Enterprise admin/RBAC/capability/approval/budget/provider dispatch surfaces.
- Autonomous/process/mission/run/task/terminal paths.
- Invocation/task/provider settlement stores.
- `OPERATION-001` catalog consumers.

**İş:**

- Critical sites generic fail-safe writer'dan canonical AuditAuthority'ye taşınır.
- Pre-effect audit append receipt effect/capability handle'a prerequisite olur.
- Post-effect settlement pending/HOLD wiring.
- Completeness reconciler receipt stores ile join edilir.
- Telemetry sites açıkça best-effort sınıfında tutulur.
- Event stream projection canonical append sonrası üretilir.

**Kapanış kanıtı:** producer→authority→effect→settlement call graph; injected append failure effect'i
engeller; post-effect failure false COMPLETE üretmez; missing lifecycle phase detected.

### W6 — Terminal audit ve export unification

**Files:**

- `src/api/terminal/audit-integrity.ts`
- `src/api/terminal/audit.ts`
- `src/api/server.ts`
- `src/core/audit-export.ts`
- `src/cli/commands/audit-verify.ts`
- `src/cli/commands/audit.ts`
- MCP/API audit surfaces.

**İş:**

- `.deckent/audit-key`, optional plain terminal path ve separate terminal chain authority'den çıkarılır.
- Terminal structured lifecycle events canonical AuditIntent'e dönüşür.
- Export-time shared-secret chain transfer checksum olarak dürüstçe ayrılır veya retire edilir.
- Public-key/checkpoint/anchor evidence bundle ve multi-verdict CLI/API doğar.
- Empty/missing/legacy records success'e katlanmaz.

**Kapanış kanıtı:** terminal/API/CLI parity; project key absence; filtered export inclusion proof;
independent verifier private secret olmadan çalışır.

### W7 — Redaction, retention, legal hold ve compliance claims

**Dependencies:** `DATA-GOV-001`, `ASSURANCE-PACK-001`.

**Files:**

- Operation-specific audit schemas/redaction registry.
- `src/core/audit-retention.ts`
- `src/core/compliance-report.ts`
- Audit docs/EN-TR operations/security references.

**İş:**

- Sink-level allowlist/redaction/data classification.
- Signed retention manifest/tombstone ve archive verification.
- Legal hold/key rotation/export/delete integration.
- Compliance claim gates: host-sealed ≠ externally anchored.
- Runtime build/policy identity verification.

**Kapanış kanıtı:** secret payload rejection; oversized/unknown fields; anchored prune; unauthorized delete;
legal hold; compliance claim negative tests.

### W8 — Legacy migration, rollout ve real-binary/XVerify proof

**Files:**

- Versioned migration command/service.
- Doctor/status/verify surfaces.
- Hermetic integration/e2e and platform CI.
- Public migration/runbook documentation.

**İş:**

- Legacy unkeyed/known-key/project-keyed inventory ve migration manifests.
- Existing bytes snapshot root; no retroactive authenticity.
- Host-sealed default rollout.
- Enterprise external-anchor admission profile.
- Real-binary critical operation failure/anchor/truncation/recovery proof.
- Fresh different-provider XVerify.

**Kapanış kanıtı:** source-known secret ile forge edilen old chain legacy görünür; new chain forgery fails;
whole-log deletion external anchor ile detected; key/anchor outage typed HOLD; platform matrix.

## 17. Dependency DAG ve rollout

```text
W1 contracts/operation binding ──────┐
                                     ├─→ W3 host ledger ─→ W4 crypto/checkpoint/anchor
W2 key-provider authority ───────────┘                         │
                                                               ▼
                                                W5 production operation wiring
                                                               │
                                                  ┌────────────┴────────────┐
                                                  ▼                         ▼
                                       W6 terminal/export         W7 redaction/retention
                                                  └────────────┬────────────┘
                                                               ▼
                                                    W8 migration/proof
```

- W1 ve W2 file ownership ayrılırsa paralel olabilir.
- W3, W1 record contractı olmadan doğmaz; W4, W2 sign capability ve W3 atomic head ister.
- W5, operation catalog/receipt binding ile tek canonical closure task'ıdır; birkaç call-site migration
  production completeness sayılmaz.
- W6/W7, W5 canonical authority sonrası paralel yürüyebilir.
- W8 bütün producer→consumer→effect→settlement zinciri kapanmadan settlement yapmaz.

### Rollout ratchet

1. **Inventory:** call sites, event classes, secrets, legacy chains ve expected operations haritalanır.
2. **Shadow append:** canonical ledger parallel record üretir; mismatch metrics görünür, security claim yok.
3. **Host-sealed enforced:** selected operations canonical pre-effect append olmadan doğamaz.
4. **All critical operations:** operation catalog coverage ve completeness reconciler enforce edilir.
5. **External anchor profile:** enterprise tenants durable anchor receipt ister.
6. **Legacy retirement:** static secret/project key/export HMAC authority'den çıkarılır.

Shadow state nihai DONE değildir. Eski writer yeni authority failure'ında fallback olarak kullanılamaz.

## 18. Acceptance ve release gates

`AUDIT-001` aşağıdakilerin tamamı kanıtlanmadan DONE olamaz:

1. Source, config, project veya plain env içinde production audit private/master key yok.
2. Project worker canonical audit ledger, stream head veya key'e erişemiyor.
3. Stream sequence/head/record atomic ve concurrent-safe.
4. Static-secret forged legacy chain yalnız legacy assurance alıyor; new v3 verification'dan geçmiyor.
5. Event records exact principal/tenant/operation/receipt authority refs taşıyor.
6. Security-critical pre-effect audit append failure operation'ı blokluyor.
7. Post-effect audit failure gerçek effect'i koruyup typed settlement HOLD üretiyor.
8. Operation completeness receipt stores ile reconcile ediliyor.
9. Middle mutation, insert, fork, replay ve wrong-key/algorithm detected.
10. Suffix truncation ve whole-stream deletion signed/external checkpoint ile detected.
11. Solo/local result `host_sealed`; external receipt olmadan enterprise claim açılamıyor.
12. Independent verifier private/HMAC secret almadan checkpoint/anchor doğruluyor.
13. Key rotation/revoke/compromise/loss historical truth'u dürüstçe koruyor.
14. Terminal audit ortak authority kullanıyor; `.deckent/audit-key` ve optional plain production path yok.
15. Export bundle original checkpoint/range/inclusion/anchor evidence taşıyor.
16. Sink arbitrary metadata/secret/oversized payload kabul etmiyor; redaction policy versioned.
17. Retention prune signed tombstone, archive, legal-hold ve required anchor evidence'i olmadan yapılamıyor.
18. Multi-verdict integrity/anchoring/completeness/actor/retention/key/runtime dimensions'i saklamıyor.
19. Linux/macOS/Windows native/WSL/enterprise/air-gapped adapters verified veya typed unsupported/HOLD.
20. Real-binary outage/tamper/truncation/rotation/recovery proof'u geçiyor.
21. Different-provider XVerify evidence chain'i değerlendiriyor; same-provider self-verify yok.

## 19. Explicit non-goals ve yanlış COMPLETE iddiaları

Bu paket tek başına şunları kanıtlamaz:

- Audit event içeriğinin gerçek dünyada doğru olduğu; yalnız verified authority receipts'e binding sağlar.
- Compromised KMS admin'e karşı mutlak güven; independent anchor/separation-of-duties sınırı ayrıca raporlanır.
- Her provider/connector'ın external effect truth'u; ilgili adapter receipt authority'si gerekir.
- Data governance/legal compliance'in tümü; `DATA-GOV-001` parent dependency'dir.
- Generic event stream'in bütün inter-agent security'si; Bulgu 12/ASI07 ayrı kapsamdadır.
- Approval decision authenticity; Bulgu 11 / `APPROVAL-001` ayrı authority'dir.

4120 DONE olduğunda doğru claim:

> “Security-relevant Deckent operations, verified authority receipts'e bağlı transactional host audit
> records ve signed checkpoints üretir; enterprise profile durable external anchor receipt'i olmadan
> compliance-complete sayılmaz.”

Şu claim'ler yasaktır:

- “HMAC chain varsa audit tamper-proof’tur.”
- “Host-sealed local audit host admin'e karşı değiştirilemez.”
- “SIEM'e gönderim çağrısı external anchor kanıtıdır.”
- “Legacy records yeni key ile re-sign edilince geçmişte authentic olur.”
- “Chain intact ise bütün zorunlu events mevcuttur.”

## 20. Diğer session için doğrudan plan girdisi

**Goal:** `AUDIT-001` — canonical host-owned AuditAuthority, platform key lifecycle, signed checkpoints,
external anchoring ve operation completeness enforcement zincirini kur.

**Mission outcome:** Security-critical operation'lar VerifiedPrincipal + canonical operation + immutable
authority/effect/settlement receipts'e bağlanmadan ve pre-effect audit append almadan doğamasın; records
transactional chain'e girsin; checkpoints asymmetric imzalansın; enterprise claim durable external anchor
receipt'i istesin; terminal/export/legacy surfaces aynı trust modeline taşınsın.

**Work packages:** W1 Contracts/operation binding → W2 Key providers → W3 Host ledger → W4 Chain/
checkpoint/anchor → W5 Production operation wiring → W6 Terminal/export → W7 Redaction/retention → W8
Migration/real-binary/XVerify proof.

**Required dependency context:** 4120 doğrudan; 4010 principal; 4030 operation catalog; 4070 immutable
receipts; 4180 trust handoff; 2240 KMS/HSM adapters; 10020 data governance; 10080 assurance claims; 4190
OWASP evidence. Bulgu 11 approval integrity ve provider/effect receipt authorities kendi operation
completeness alanlarında hard dependencies'tir.

**Settlement rule:** Static secret'i random/env secret ile değiştirmek, unit HMAC testleri veya local chain
green yeterli değildir. Principal/operation/receipt producer → transactional append → effect gate → terminal
settlement → checkpoint signature → external anchor receipt → independent verification → retention/
compliance projection zinciri real-binary, platform ve different-provider evidence ile kapanmalıdır.
