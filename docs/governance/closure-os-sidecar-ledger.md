# Closure OS Sidecar Decision-Ledger — Governance & Reference Spec

Bu doküman, Closure OS'un **append-only sidecar karar-defteri** (decision-ledger)
mekanizmasının kalıcı governance/reference spesifikasyonudur. Mekanizma; MASTER
planın iş kimliği/durumu (work identity/state) authority'sinden **ayrı** duran,
buildless (dist bağımlılığı olmayan) bir doğrulama katmanıdır: Level×Lane
sınıflandırması, admission ve priority-decision kararlarını hash-chained + owner
authority-bound event'ler olarak biriktirmeyi, bu event'leri repo-verifiable bir
gate ile katı biçimde doğrulamayı ve read-only projection'lar üretmeyi tarifler.
**Kritik disk-gerçeği (2026-08-17 itibarıyla):** Phase-5 **CANLIDIR**. Defter
(`docs/governance/closure-dispositions.jsonl`) ilk authenticated batch'i taşır
(unsignedManifestDigest `dba89c0355ac…`, 2 event, zero-anchor hash-chain), owner-signed
ed25519 receipt (`closure-dispositions.receipts/aprcdb-dba89c0355ac0654f52a24e68e669329.json`,
keyId `closure-owner-genesis-v1`) commit'lidir ve gate `chain + identity + lifecycle +
append-only verified` döner. Yazım araçları: `scripts/closure-ledger/phase5-dry-run.mjs`
(staging bundle), `phase5-writer.mjs` (claim + fail-closed verified append + projections),
`phase5-sign.mjs` (owner sign ceremony — private key daima repo DIŞI). Bu spec, Phase-4
foundation verifier'ı ile Phase-5 writer hattını adversarial cross-provider audit'e
dayanacak netlikte ayırır; §11.1 delivery kaydıdır. Bir typed `HOLD` asla bir
kapanış (closure) değildir; §12.2 gereği "HOLD ≠ closure" bu dokümanın her
bölümünde geçerlidir.

---

## 1. Amaç ve dual-lens ürün değeri

Sidecar karar-defteri, "bir governance kararı nasıl **kanıta bağlı**, geri
alınamaz (append-only) ve **owner-authenticated** biçimde kaydedilir?" sorusuna
verilen mekanik cevaptır. Değeri, deckent'in 🔒 DUAL-LENS yasası gereği iki
kitleye birden hizmet etmesidir:

- **(a) deckent'in kendi orchestration governance'ı (dogfood).** Closure OS'un
  Level×Lane sınıflandırması, born-finding admission'ı ve P0/P1/P2 re-triage'ı,
  chat aktör-string'i ya da sentetik agent verdict'iyle değil; canonical JSON
  digest zinciri + ed25519 owner attestation + reviewed-parent trust anchor +
  immutable batch snapshot ile bağlanır. Bir karar ancak **verified-binding**
  ile kapanır; doğrulanamayan her koşul typed `HOLD` olur, sessiz geçiş yoktur.
- **(b) uçtan-uca ürün deneyimi.** Aynı append-only + authority-proof + drift-HOLD
  motifi; solo bir kullanıcının küçük bir projesinden dünyanın en büyük
  enterprise multi-tenant kurulumuna kadar, "kim, neyi, hangi kanıtla, hangi
  anlık MASTER durumuna karşı onayladı" sorusunun **milyon-ölçekte** denetlenebilir
  cevabıdır. Receipt ve trust-anchor'a tenant/project kimliğinin bağlanması bunu
  çok-kiracılı kılar; buildless gate'in CI'da çalışması ise governance-by-construction
  garantisidir.

Kısacası: mekanizma, "governance kararı = doğrulanabilir kanıt" ilkesini hem
deckent'in kendi planına hem de ürünün genel closure-hesap-verebilirliğine tek
implementasyondan uygular.

---

## 2. Authority sınırları — MASTER vs sidecar vs projections

Üç katman kesin olarak ayrılır; hiçbiri diğerinin işini yapamaz.

| Katman | Authority | Ne DEĞİLDİR |
|---|---|---|
| **MASTER** (`docs/generated/master-plan-active.json` + `docs/MASTER-PLAN.md`) | İş **kimliği ve durumu** (workId, program, state, mevcut priority, `identityRegistry`, `sourceDigest`, `registryIntegrity`). | Level×Lane / admission / priority-**karar** authority'si değildir. |
| **Sidecar ledger** (`docs/governance/closure-dispositions.jsonl`) | **Level×Lane disposition + born-disposition/admission + priority-decision** authority'si. Kararları append-only, hash-chained, owner-authenticated event'ler olarak taşır. | İş kimliği/durumu üretmez. Priority **kararını** taşır ama MASTER satırına priority'yi **uygulamak** ayrı bir owner-receipt yetkisidir ve bugüne dek uygulanmamıştır (0 priority değişikliği; state settlement'ları `receipt=GR-…` MASTER grammar'ıyla yürür). |
| **Projections** (Active / Born / Closure-Health / Level×Lane) | **Hiçbiri** — read-only türetilmiş görünümlerdir. Her üretimde defteri `seq` sırasında yeniden uygular. | Asla bir source-of-truth değildir. Çakışma/drift/bilinmeyen satır → typed `HOLD` kolonu; sessiz skip/fallback yoktur. |

Öncelik: MASTER, bir satırın **var** ve **hangi durumda** olduğunu söyler; sidecar,
o satırın **nasıl sınıflandığını / admission'ını / priority kararını** söyler;
projection yalnızca ikisini birleştirip **gösterir**. Sidecar bir workId'yi
tanımıyorsa (`UNKNOWN_ROW`) ya da definition drift varsa (`DEFINITION_DRIFT`),
karar o satır için `HOLD`'a düşer — sidecar MASTER'ın kimlik authority'sini asla
ezmez.

---

## 3. Şemalar — exact field adları

Tüm enum değerleri **tek SSOT**'tan gelir: `src/core/closure-classification-schema.json`.
Canonical encoder + digest `scripts/closure-ledger/canonical.mjs`'de; typed TS
event union `src/core/closure-ledger-types.ts`'dedir (compile-time contract; runtime
validator değildir).

### 3.1 Event (top-level)

Gate'in kabul ettiği top-level alan kümesi (`ALLOWED_TOP`; bunun dışındaki her alan
`UNKNOWN_FIELD` error):

```
{ schemaVersion, seq, eventId, recordedAt, rowRef, decision,
  authorityProof, evidenceRefs?, supersedesSeq?, previousEventDigest, eventDigest }
```

- `schemaVersion` = 1 (aksi `SCHEMA_VERSION`).
- `seq` integer, genesis'te 1, sonra prev+1 (aksi `SEQ_TYPE` / `SEQ_START` / `SEQ_GAP`).
- `eventId`, `recordedAt`, `previousEventDigest`, `eventDigest` = non-empty string (aksi `MISSING_FIELD`).
- `recordedAt` = strict ISO-UTC `…Z` (aksi `RECORDEDAT_FORMAT`).
- `eventDigest` = lowercase sha256; `previousEventDigest` = zero-anchor (`0`×64) **ya da** lowercase sha256 (aksi `DIGEST_FORMAT`).
- `decision` = **kind'a göre typed union** (generic from/to çifti DEĞİL).
- `authorityProof.ownerReceipt` = non-empty string; yoksa `AUTHORITY_UNRESOLVED` **HOLD** (uydurma receipt yasak).

**Decision payload'ları (per-kind allowed alanlar; `DECISION_FIELDS`):**

| kind | Alanlar (allowed) | decisionClass |
|---|---|---|
| `level-lane-disposition` | `kind, level, lane, ruleId, confidence` | classification |
| `priority-retriage` | `kind, fromPriority?, toPriority` | priority |
| `admission` | `kind, disposition, parentOutcomeId?` | admission |
| `born-promotion` | `kind, promotedTo, outcomeId?` | promotion |
| `supersede` | `kind, targetSeq, reason` | correction |
| `revoke` | `kind, targetSeq, reason` | correction |

Enum'lar: `level ∈ {outcome, package, task, check-proof, finding}`, `lane ∈
{contract, runtime, desktop, terminal, proof}` (+ typed-HOLD lane `hold-unassigned`),
`confidence ∈ {high, medium, low}`, `priority ∈ {P0, P1, P2}`, `disposition ∈
{child-proof-under-committed-outcome, separate-committed-outcome, discovery,
future-deferred, duplicate-superseded-disposed, hold}`, `promotedTo =
'committed-outcome'`. Invariant: `level=check-proof ⇒ lane=proof` (aksi
`CHECKPROOF_INVARIANT`).

### 3.2 rowRef — 4-part (gate'in enforce ettiği contract)

Gate (`validateShape`, `ALLOWED_ROWREF`) rowRef'in **dört** parçasını da non-empty
zorunlu tutar; eksik = `ROWREF_INCOMPLETE`, fazlası `UNKNOWN_FIELD`:

```
rowRef = { workId, rowDefinitionDigest, masterSourceDigest, batchManifestDigest }
```

- `workId` — MASTER `identityRegistry`'de bulunmalı (aksi `UNKNOWN_ROW` HOLD).
- `rowDefinitionDigest` — satırın definition digest'i; effective-latest kayıt için current MASTER'a karşı drift kontrolü (aksi `DEFINITION_DRIFT` per-row HOLD).
- `masterSourceDigest` — **kendi batch snapshot'ına** karşı doğrulanır (current global'e değil; aksi `BATCH_SNAPSHOT_MISMATCH`).
- `batchManifestDigest` — event'i immutable batch'ine bağlar; çözülemezse `BATCH_UNRESOLVED` HOLD.

> **Tek SSOT ile hizalı kontrat.** rowRef'in dört alanı tek makine-okunur SSOT'tan
> gelir: `schema.rowRef.requiredFields`. Gate `ALLOWED_ROWREF`/`ROWREF_REQUIRED`'i bu
> diziden **çözer** (hardcode literal değil). TS tarafında `RowRef`, `ROWREF_FIELDS`'tan
> bir **mapped type** ile **türetilir** (`{ [K in (typeof ROWREF_FIELDS)[number]]: string }`,
> `src/core/closure-ledger-types.ts`); dolayısıyla RowRef shape'i bu diziden **asla
> sapamaz**. Üçü şu ikili ile kilitlenir: (a) `tests/governance/closure-ledger.test.ts`
> içindeki **TS↔schema exact-equality** drift-guard'ı (`ROWREF_FIELDS ===
> schema.rowRef.requiredFields`, `batchManifestDigest` dahil, uzunluk 4) — RowRef
> türetildiği için bu, tüm TS RowRef shape'ini transitif olarak schema'ya pinler; ve
> (b) gate `--self-check`'teki `ALLOWED_ROWREF == schema.rowRef.requiredFields`
> assertion'ı + `batchManifestDigest` eksik (`ROWREF_INCOMPLETE`) / fazla
> (`UNKNOWN_FIELD`) negatif hermetik testleri. Enum parity tek başına yetersizdir.

### 3.3 Batch (unsigned decision manifest)

`computeBatchManifestDigest(events)` — bir batch'in **imzasız (unsigned)** decision
manifest'inin closure-canonical-v1 sha256 digest'i. Non-circular: her event'ten
`authorityProof` (receipt sonradan gelir), chain alanları (`eventDigest`,
`previousEventDigest`) ve `rowRef.batchManifestDigest` (ki digest'in kendisi budur)
**hariç** tutulur. Approval request önce bu digest'i bağlar; Phase-5 writer sonra
her event'in `rowRef.batchManifestDigest`'ini buna set eder.

### 3.4 Receipt (subject + attestation) — `<requestId>.json`

Konum: `docs/governance/closure-dispositions.receipts/<requestId>.json`
(basename = `requestId` olmalı; aksi `RECEIPT_FILENAME_MISMATCH`).

- **Allowed** (`RECEIPT_ALLOWED`): `schemaVersion, requestId, claimRef, decision, closureReason, subject, authenticatedAt, decidedAt, authExpiresAt, attestation`.
- **Required** (`RECEIPT_REQUIRED`): yukarıdakiler eksi `closureReason` (aksi `RECEIPT_INCOMPLETE_FIELD`).
- **Rejected** (`RECEIPT_REJECTED`): `authenticationEvidence`, `grantedAt` — self-authored "kanıt string'i" fail-closed reddedilir (`RECEIPT_REJECTED_FIELD`).
- `schemaVersion` = 1 (`RECEIPT_SCHEMA`); `decision` = `allow` (aksi `AUTHORITY_NOT_ALLOWED`); `closureReason` set ise TTL/system-closure → `AUTHORITY_SYSTEM_CLOSED`.
- `requestId` canonical ApprovalBroker id olmalı (`AUTHORITY_REQUESTID_FORMAT`); `claimRef` = tam olarak `approval:<requestId>` (`AUTHORITY_CLAIMREF_FORMAT`).

**subject** (`SUBJECT_ALLOWED`; `kind` = `closure-disposition-batch`, aksi `SUBJECT_KIND`):

| Alan | Tip | Anlam |
|---|---|---|
| `kind` | `'closure-disposition-batch'` | sabit |
| `tenantId`, `projectId` | string | çok-kiracılı kimlik (trust-anchor'a karşı çapraz-kontrol) |
| `masterSnapshotDigest` | sha256 | archived `master-snapshot.json` içindeki `sourceDigest.value` |
| `registryIntegrityDigest` | sha256 | archived `master-snapshot.json` içindeki `registryIntegrity.value` |
| `proposalDigest` | sha256 | archived `proposal.md` bytes digest'i |
| `unsignedManifestDigest` | sha256 (closure canonical v1) | `computeBatchManifestDigest` çıktısı |
| `eventCount`, `seqIntervalStart`, `seqIntervalEnd` | integer | batch aralığı |

String alanların herhangi biri boş/eksik veya int alanlar non-integer ise
`SUBJECT_INCOMPLETE_FIELD`; bilinmeyen alan `SUBJECT_UNKNOWN_FIELD`.

**attestation** (`ATTESTATION_ALLOWED` = `{ keyId, signature }`; aksi `ATTESTATION_SHAPE`
/ `ATTESTATION_UNKNOWN_FIELD`): ed25519 imza, base64. İmza şu **signed binding**'in
closure-canonical-v1'i üzerindedir:

```
{ requestId, claimRef, decision, tenantId, projectId, masterSnapshotDigest,
  registryIntegrityDigest, proposalDigest, unsignedManifestDigest, eventCount,
  seqIntervalStart, seqIntervalEnd, authenticatedAt, decidedAt, authExpiresAt }
```

Window: `authenticatedAt ≤ decidedAt ≤ authExpiresAt`, hepsi strict ISO-UTC
(`AUTHORITY_WINDOW` / `AUTHORITY_WINDOW_FORMAT`). Geçerlilik **karar anında**
sabittir; gate'in saati alakasızdır (clock-independent).

### 3.5 Trust-anchor — `docs/governance/closure-trust-anchors.json`

```
{ schemaVersion: 1,
  anchors:   [{ keyId, publicKeyPem, tenantId, projectId }],
  rotations?:[{ newKeyId, newPublicKeyPem, tenantId, projectId, signedByKeyId, signature }] }
```

- top-level allowed: `schemaVersion, anchors, rotations` (aksi `TRUST_ANCHOR_UNKNOWN_FIELD`); `schemaVersion` ≠ 1 → `TRUST_ANCHOR_SCHEMA`.
- anchor allowed: `keyId, publicKeyPem, tenantId, projectId` — dördü de non-empty (aksi `TRUST_ANCHOR_MALFORMED`); tekrar `keyId` → `TRUST_ANCHOR_DUPLICATE_KEYID`. **`publicKeyPem` invariant (Codex round-2):** tam olarak **bir SPKI `PUBLIC KEY`** bloğu (`createPublicKey` başarı yetmez — Node private PEM'den public türetir); **PRIVATE KEY envelope YASAK** → `TRUST_ANCHOR_PRIVATE_KEY_FORBIDDEN`; `asymmetricKeyType==='ed25519'` şart → değilse (P-256/RSA) `TRUST_ANCHOR_BAD_KEY_TYPE`; geçersiz/çoklu-blok → `TRUST_ANCHOR_BAD_PEM`.
- rotation allowed: `newKeyId, newPublicKeyPem, tenantId, projectId, signedByKeyId, signature`. **rotation binding** = closure-canonical-v1 of `{ newKeyId, newPublicKeyPem, tenantId, projectId, signedByKeyId }`, bir reviewed-parent anahtarıyla ed25519-imzalı (aksi `TRUST_ANCHOR_UNAUTHORIZED_ROTATION`). `newPublicKeyPem` de yukarıdaki **aynı ed25519 SPKI public-key invariant**'ına tabidir — geçerli parent-imzası bile non-ed25519/private key'i trusted-set'e sokamaz (key-type önce, imza sonra).

Bu dosya repoda yalnız **public** anahtar taşır; private key hiçbir zaman commit
edilmez (Phase-5, owner key custody).

---

## 4. Lifecycle — admission → born-promotion ve correction

Sidecar iki ayrı ve **sıralı** (mutually-exclusive değil) sınıf taşır: `admission`
ve `promotion`. Owner Phase-3 disposition'ıyla eski "tek mutually-exclusive
disposition" modeli reddedilmiştir; gate **ordering** enforce eder, mutual exclusion
değil.

**Durumlar** (`schema.decisionClasses.lifecycle.states`): `unadmitted`,
`admitted-committed`, `admitted-parked`, `admitted-hold`, `admitted-disposed`,
`promoted-committed-outcome`.

| admission `disposition` | Lifecycle durumu | Promotable? |
|---|---|---|
| `discovery` | `admitted-parked` | **Evet** |
| `future-deferred` | `admitted-parked` | **Evet** |
| `child-proof-under-committed-outcome` | `admitted-committed` | Hayır |
| `separate-committed-outcome` | `admitted-committed` | Hayır |
| `hold` | `admitted-hold` | Hayır |
| `duplicate-superseded-disposed` | `admitted-disposed` | **Asla** (terminal) |

`PROMOTABLE_ADMISSIONS = {discovery, future-deferred}`. Bir `born-promotion` yalnız
o workId için önceden **parked** (discovery/future-deferred) bir non-revoked admission
varsa geçerlidir:

- Önce admission **yok** ise → `PROMOTION_NO_ADMISSION` (**HOLD** — doğrulanamıyor).
- Admission var ama parked **değil** (committed/hold/disposed) ise → `PROMOTION_BAD_STATE`
  (**error** — doğrulandı ve yanlış). Bu ikili, §8'deki HOLD (cannot-verify) vs error
  (verified-and-wrong) taksonomisinin kanonik örneğidir.

**Neden `duplicate-superseded-disposed` terminaldir:** bir satır "bu kopya, X
tarafından supersede edildi ve düşürüldü" diye disposed edildiyse, sonradan
committed-outcome'a **terfi** ettirilmesi mantıksal bir çelişkidir — düşürülmüş bir
kopya bir çıktı doğuramaz. `admitted-committed` ve `admitted-hold` de non-promotable'dır.

**Correction (supersede/revoke):** geçmiş event asla silinmez/değiştirilmez;
düzeltme yeni bir correction event'iyle yapılır. Bir correction'ın hedefi
(`targetSeq`): var olmalı (`CORRECTION_TARGET_MISSING`), daha erken olmalı
(`CORRECTION_TARGET_ORDER` — self/future yasak), aynı workId olmalı
(`CORRECTION_FOREIGN_ROW`), bir correction event'i olmamalı
(`CORRECTION_TARGET_IS_CORRECTION`) ve en fazla bir kez düzeltilmelidir
(`CORRECTION_DOUBLE`). Effective-events, supersede/revoke edilenleri çıkarır;
`born-promotion` hiçbir şeyi supersede etmez — ileri yönlü bir geçiştir.

---

## 5. Reviewed-parent genesis + rotation modeli (root of trust)

Trust-anchor'ların **kaynağı** kritik güvenlik sınırıdır. `resolveTrustAnchors()`,
`lint-master-plan` TRUST-ANCHOR-001 desenini yansıtır ama daha katıdır:

- **Reviewed baseline = merge-base HEAD origin/main.** Güvenilen anahtar SETİ, bu
  reviewed parent'ta commit edilmiş settir — **çalışma ağacı (working tree) değil**.
  Böylece **aynı PR'da eklenen bir anahtar kendi kendine kefil olamaz** ("a key
  added in the same PR cannot vouch for itself").
- **Rotation.** Parent'ta bulunmayan bir working-tree anahtarı ancak bir **reviewed-parent
  anahtarıyla ed25519-imzalı** bir rotation receipt'i ile güvenilir olur. İmzasız /
  parent-olmayan anahtarla imzalı / şekli bozuk rotation → `TRUST_ANCHOR_UNAUTHORIZED_ROTATION`
  (error). Reviewed-parent anahtarları (aynı PEM) her zaman güvenilir kalır.
- **Genesis.** Reviewed parent'ta anchors dosyası **yoksa**, ilk anahtar in-repo
  self-bootstrap yapamaz → `TRUST_ANCHOR_BOOTSTRAP_UNRESOLVED` (**HOLD**). Gerçek bir
  genesis anchor'ı, harici owner fingerprint / signed Git authority gerektirir — bu
  **REPORTED provisioning procedure** artık `scripts/closure-ledger/genesis-anchor.mjs`
  + [`closure-genesis-provisioning.md`](./closure-genesis-provisioning.md) olarak **ayrı
  genesis PR**'ında sevk edildi. İki mod: **`--adopt-public-key` (CANONICAL)** —
  hardware/KMS/keychain'de tutulan key'in yalnız public'ini alır, private'e hiç
  dokunmaz; **`--generate`** — software-key bootstrap (plaintext PKCS8, repo-DIŞI,
  POSIX 0600 enforce+verify; Windows'ta typed HOLD). Fail-closed: tüm hedefler
  (private/anchors/fingerprint) önce absent preflight edilir, private key **O_EXCL**
  ile yazılır (mevcut dosyayı/symlink'i overwrite/follow etmez), partial failure yalnız
  bu koşumun dosyalarını rollback eder; private key hiçbir stream'e basılmaz. Araç
  repo'ya **private key YAZMAZ** (in-repo/symlink-into-repo path'i reddeder), yalnız
  public anchor + fingerprint (`sha256`(SPKI DER)) commit edilir; authority hâlâ
  owner'ın fingerprint'i doğrulayıp merge etmesinden (reviewed-parent) gelir — foundation
  hattında anchor üretilmez/commit edilmez, gerçek anchor owner ceremony'siyle provision
  edilir. ed25519 **SIGNER**/writer Phase-5'te sevk edildi (`phase5-sign.mjs` + `phase5-writer.mjs`; ilk gerçek owner imzası 2026-08-17).
- **NO WARN fallback.** TRUST-ANCHOR-001'den ayrışır: no-git / no-history / shallow
  clone / unfetchable-origin-main / okunamayan-parent-blob (OQ-XVE-05: provably-exists
  ama unreadable = `error`, asla `absent`) hepsi → `TRUST_ANCHOR_BOOTSTRAP_UNRESOLVED`
  HOLD. HEAD fallback yok, working-tree fallback yok, WARN-degradation yok — authority
  doğrulaması *deliverable'ın kendisidir*, dolayısıyla çözülemez kök = HOLD, asla pass.

**Scoped sınırlar (kasıtlı daraltmalar, disktruth'ta beyanlı):**
- **Reviewed-key removal** parent anahtarlarını sonsuza dek güvenilir tutar (güvenli
  yön: kaldırılmış bir anahtar imza atamaz). Gerçek **revocation** (anahtar iptali)
  Phase-5 writer kapsamına ALINMADI — açık sonraki-faz işi.
- **Rotation depth-1:** yalnız reviewed-parent anahtarları bir rotation'ı imzalayabilir;
  bir rotation-ile-eklenen anahtar aynı değişiklikte başka bir rotation'ı yetkilendiremez.

---

## 6. Immutable historical snapshot bundle

Her batch, **karar anındaki** MASTER + proposal durumuna içerik-adresli
(content-addressed), değiştirilemez bir snapshot ile bağlanır; böylece tarihsel
doğrulama **asla** o anki (evrilen) MASTER/proposal'a bağlı olmaz.

- **Konum:** `docs/governance/closure-batches/<batchManifestDigest>/` — dizin adı
  batch'in manifest digest'idir.
- **Dosyalar:** `master-snapshot.json` (batch anındaki tam `master-plan-active.json`
  bytes; içindeki `sourceDigest.value` → `masterSnapshotDigest`, `registryIntegrity.value`
  → `registryIntegrityDigest`) ve `proposal.md` (owner-proposal doc'un tam bytes'ı;
  sha256 → `proposalDigest`).
- **Recompute-from-archived-bytes:** gate, receipt'in imzaladığı `masterSnapshotDigest`
  / `registryIntegrityDigest` / `proposalDigest` değerlerini **arşivlenmiş bytes'tan**
  yeniden hesaplar, **asla current MASTER'dan değil**. Bu, dairesel
  `manifest.masterSnapshotDigest` self-vouch'ını ve `== null ||` silent-skip'i öldürür
  (Codex Phase-4.3: `validateAuthority` içinde 0 adet `== null ||`).
- **Canonical-PAYLOAD integrity:** `registryIntegrity`, `scripts/master-plan-integrity.mjs`
  içindeki **MASTER'ın kendi algoritmasıyla** (`sha256(canonical-json-utf8)`) yeniden
  hesaplanır — **closure canonical v1 ile DEĞİL** (iki ayrı canonical, iki ayrı sahip).
  Arşivlenmiş `workItems`/`identityRegistry` **değeri** kurcalanıp gömülü `ri.value`
  bayat bırakılırsa `integrityVerified=false` olur → `AUTHORITY_SNAPSHOT_INTEGRITY_MISMATCH`
  (error). Bu, `master-plan-integrity.mjs`'in `registryIntegrityDigest`'inin tek
  producer'ı olduğu yerdir.
- **Delete-on-consume ayrımı:** canlı proposal doc'unun delete-on-consume'u standart
  proje davranışıdır; writer, delete'ten **önce** proposal bytes'ını bundle'a arşivleyip
  digest'i doğrulamalıdır. Bundle tümüyle yoksa `BATCH_SNAPSHOT_MISSING`; master snapshot
  yok/malformed ise `BATCH_SNAPSHOT_MASTER_ABSENT`; **proposal bytes arşivlenmemişse**
  ayrı ve *beklenen steady-state* `BATCH_SNAPSHOT_PROPOSAL_ABSENT` — üçü de HOLD
  (cannot-verify), tamper ise error.

---

## 7. Transactional four-view projection bundle

Projection producer (`scripts/closure-ledger/project.mjs`) **yalnız gate-PASSING**
bir defterden dört read-only view üretir: **Active** (her aktif satır + effective
disposition ya da unclassified), **Born** (admission/promotion lifecycle kaydı olan
satırlar; fiziksel satırlar yerinde kalır), **Closure-Health** (agregat ölçüm) ve
**Level×Lane** (ledger sınıflandırmalarından matris; sınıflanmamış satırlar
`unclassified` HOLD kolonu).

**Transactional yazım (Codex B2):** dört ayrı rename değil; **immutable versioned
bundle + tek atomik pointer swap**:

1. Dört view + bir `bundle-manifest.json`, `bundles/<bundleId>/` altına yazılır ve
   her biri fsync edilir. `bundleId` = manifest'in digest'i.
2. Tek küçük `current.json` pointer'ı, temp dosyadan atomik `rename` ile takas edilir —
   **tek atomik commit budur**.
3. `readCurrentBundle` / `--check`, pointer üzerinden dört view'ın **content
   digest**'lerini bundle-manifest'e karşı doğrular.

Failure-injection (self-check, tmpdir): `views` / `manifest` / `pre-swap` / `swap`
aşamalarının her birinde enjekte edilen hata → eski `current.json` **byte-identical**
kalır ve eski bundle hâlâ doğrulanır (partial-current yok). Cross-platform ve
symlink-free (taşınabilir olmayan dir-fsync bırakıldı; tek-dosya rename atomik
sınırdır). **Bugüne dek hiçbir projection bundle yazılmamıştır** (`closure-projections/`
mevcut değil).

---

## 8. Typed HOLD / error kataloğu + remedy

**Ayrım:** `hold(...)` = **cannot-verify** (kanıt/authority çözülemedi → typed HOLD,
asla kapanış). `err(...)` = **verified-and-wrong** (doğrulandı ve contract ihlal
edildi → FAIL). Aşağıdaki liste, task'ta verilen 75 kodun tamamıdır: **15 HOLD +
60 error**. (Ek olarak gate'in emit ettiği ama task listesinde olmayan ~12 kod §8.3'te.)

### 8.1 HOLD kodları (15) — cannot-verify

| Kod | Anlam | Remedy |
|---|---|---|
| `LEDGER_PARSE` | Bir ledger satırı geçerli JSON değil | Geçerli JSONL append et; asla bozuk satır |
| `SEQ_GAP` | `seq` bitişik değil (prev+1 değil) | Bitişik seq ile append |
| `REGISTRY_UNAVAILABLE` | `identityRegistry` yok (MASTER okunamıyor) | `master-plan-active.json`'ı erişilebilir/geçerli tut |
| `UNKNOWN_ROW` | `rowRef.workId` current registry'de yok | Bilinen workId kullan / MASTER'ı güncelle |
| `DEFINITION_DRIFT` | Effective-latest `rowDefinitionDigest` ≠ current MASTER (per-row) | O satır için current def ile superseding disposition yaz |
| `ACTIVE_CONFLICT` | Bir sınıfta aynı satır için >1 aktif karar | Birini supersede/revoke et |
| `PROMOTION_NO_ADMISSION` | `born-promotion` var, önceden admission yok | Önce promotable (discovery/future-deferred) admission yaz |
| `AUTHORITY_UNRESOLVED` | `authorityProof.ownerReceipt` eksik | Authenticated owner receipt ref bağla (uydurma yasak) |
| `AUTHORITY_UNVERIFIABLE` | Batch için committed repo-verifiable receipt / attestation keyId'ine uyan reviewed-parent anchor yok | Receipt + anchor commit et (Phase-5 provisioning) |
| `TRUST_ANCHOR_BOOTSTRAP_UNRESOLVED` | Reviewed-parent anchors dosyası yok VEYA git baseline çözülemez (no-git/no-history/shallow/unfetchable/read-error) | Genesis provisioning (harici owner fingerprint, Phase-5); full history fetch (fetch-depth:0) |
| `BATCH_UNRESOLVED` | Event'in `batchManifestDigest`'i committed receipt'e çözülemiyor | Batch receipt'i commit et |
| `BATCH_SNAPSHOT_MISSING` | `closure-batches/<digest>/` immutable bundle'ı yok | Writer bundle'ı arşivlesin |
| `BATCH_SNAPSHOT_MASTER_ABSENT` | Bundle'daki `master-snapshot.json` yok/malformed | Geçerli master-snapshot.json arşivle |
| `BATCH_SNAPSHOT_PROPOSAL_ABSENT` | `proposal.md` bytes delete-on-consume'dan önce arşivlenmemiş | Delete'ten önce proposal bytes'ını bundle'a arşivle |
| `MERGE_BASE_UNRESOLVED` | origin/main unfetchable veya merge-base başarısız (append-only baseline) | origin/main'i fetchable yap (fetch-depth:0) |

### 8.2 error kodları (60) — verified-and-wrong

| Kod | Anlam | Remedy |
|---|---|---|
| `SCHEMA_VERSION` | Event `schemaVersion` ≠ 1 | schemaVersion=1 |
| `SEQ_TYPE` | `seq` integer değil | integer seq |
| `SEQ_START` | İlk event `seq` ≠ 1 | genesis seq=1 |
| `MISSING_FIELD` | Zorunlu top-level string alanı eksik (eventId/recordedAt/previousEventDigest/eventDigest) | Alanı doldur |
| `UNKNOWN_FIELD` | Bilinmeyen top-level / rowRef / decision alanı | Strict şemaya uy |
| `ROWREF_INCOMPLETE` | 4 rowRef alanından biri eksik | Dördünü de doldur |
| `RECORDEDAT_FORMAT` | `recordedAt` strict ISO-UTC değil | `…Z` formatı |
| `DIGEST_FORMAT` | `eventDigest`/`previousEventDigest` lowercase sha256 (ya da zero-anchor) değil | Lowercase sha256 |
| `DIGEST_MISMATCH` | `eventDigest` ≠ canonical recomputation | Digest'i doğru hesapla |
| `GENESIS_ANCHOR` | Genesis `previousEventDigest` ≠ zero-anchor (0×64) | Genesis'te zero-anchor |
| `CHAIN_BROKEN` | `previousEventDigest` ≠ önceki `eventDigest` | Zinciri doğru bağla |
| `DUPLICATE_EVENT_ID` | Tekrar eden `eventId` | Benzersiz eventId |
| `DECISION_KIND` | Bilinmeyen `decision.kind` | Geçerli kind |
| `BAD_LEVEL` | `level` enum dışı | levels değeri |
| `BAD_LANE` | `lane` enum dışı | lanes (+hold-unassigned) değeri |
| `BAD_RULEID` | `level-lane-disposition` `ruleId` eksik | ruleId ver |
| `BAD_CONFIDENCE` | `confidence` ∉ {high,medium,low} | Geçerli confidence |
| `CHECKPROOF_INVARIANT` | `level=check-proof` ama `lane≠proof` | check-proof ⇒ proof |
| `BAD_PRIORITY` | `toPriority`/`fromPriority` ∉ {P0,P1,P2} | Geçerli priority |
| `BAD_ADMISSION` | `disposition` enum dışı | Geçerli disposition |
| `MISSING_PARENT` | `requiresParentOutcome` disposition'da `parentOutcomeId` yok | parentOutcomeId ver |
| `BAD_PROMOTION` | `promotedTo` ≠ `committed-outcome` | Doğru promotedTo |
| `BAD_TARGET` | supersede/revoke `targetSeq` integer değil | integer targetSeq |
| `BAD_REASON` | supersede/revoke `reason` eksik | reason ver |
| `PROMOTION_BAD_STATE` | Prior admission parked değil (committed/hold/disposed) | Yalnız parked admission'dan terfi |
| `CORRECTION_TARGET_MISSING` | Correction var olmayan seq'i hedefliyor | Var olan seq'i hedefle |
| `CORRECTION_TARGET_ORDER` | Correction self/future seq'i hedefliyor | Daha erken seq |
| `CORRECTION_FOREIGN_ROW` | Correction farklı workId'yi hedefliyor | Aynı workId |
| `CORRECTION_TARGET_IS_CORRECTION` | Correction bir correction event'ini hedefliyor | Non-correction hedef |
| `CORRECTION_DOUBLE` | Aynı seq birden çok kez düzeltiliyor | Bir seq'i tek kez düzelt |
| `APPEND_ONLY` | Baseline satırları current'ın exact prefix'i değil (silme/değişiklik) | Yalnız append; geçmişi asla değiştirme |
| `DUPLICATE_MANIFEST_RECEIPT` | İki receipt aynı manifest digest'i bağlıyor | Batch başına tek receipt |
| `RECEIPT_MALFORMED` | Receipt dosyası geçerli JSON değil | Geçerli JSON |
| `RECEIPT_FILENAME_MISMATCH` | `receipt.requestId` ≠ dosya basename | basename = requestId |
| `RECEIPT_INCOMPLETE` | Load'da subject `unsignedManifestDigest`/`masterSnapshotDigest` eksik | Alanları doldur |
| `RECEIPT_SCHEMA` | `receipt.schemaVersion` ≠ 1 | schemaVersion=1 |
| `RECEIPT_INCOMPLETE_FIELD` | Zorunlu bir receipt alanı eksik/null | Required alanları doldur |
| `RECEIPT_FORMAT` | `requestId`/`claimRef` non-empty string değil | Geçerli string |
| `AUTHORITY_REQUESTID_FORMAT` | `requestId` canonical ApprovalBroker id değil | lowercase-ASCII, 1..128, path-safe, Windows-reserved değil |
| `AUTHORITY_CLAIMREF_FORMAT` | `claimRef` ≠ `approval:<requestId>` | Tam `approval:<requestId>` |
| `SUBJECT_INCOMPLETE_FIELD` | subject yok/invalid veya zorunlu string/int alan bozuk | Tam subject |
| `SUBJECT_KIND` | `subject.kind` ≠ `closure-disposition-batch` | Doğru kind |
| `SUBJECT_UNKNOWN_FIELD` | subject'te bilinmeyen alan | Strict subject |
| `ATTESTATION_SHAPE` | attestation `{keyId,signature}` non-empty değil | Geçerli attestation |
| `ATTESTATION_UNKNOWN_FIELD` | attestation'da fazladan alan | Yalnız keyId+signature |
| `AUTHORITY_NOT_ALLOWED` | `receipt.decision` ≠ allow | Yalnız owner allow kapatır |
| `AUTHORITY_SYSTEM_CLOSED` | receipt `closureReason` taşıyor (TTL/system) | Gerçek owner allow |
| `AUTHORITY_SIGNATURE_INVALID` | ed25519 attestation anchor'a karşı doğrulanmıyor | Owner key ile exact binding'i imzala |
| `AUTHORITY_SNAPSHOT_INTEGRITY_MISMATCH` | Recomputed `registryIntegrity` ≠ archived master'daki stored değer (payload tamper) | Arşivlenmiş bytes'ı asla kurcalama |
| `BATCH_SNAPSHOT_MISMATCH` | Event `masterSourceDigest` ≠ batch snapshot `masterSnapshotDigest` | Batch snapshot'ıyla tutarlı digest |
| `AUTHORITY_WINDOW` | `decidedAt` ∉ [authenticatedAt, authExpiresAt] | Window içinde karar |
| `AUTHORITY_WINDOW_FORMAT` | Window timestamp'leri strict ISO-UTC değil | `…Z` |
| `AUTHORITY_CLAIM_MISMATCH` | Event `ownerReceipt` ≠ receipt `claimRef` | Her event'i batch claimRef'ine bağla |
| `AUTHORITY_CLAIM_REPLAY` | `claimRef` batch'ler arası tekrar kullanılmış | Batch başına single-use claim |
| `TRUST_ANCHOR_SCHEMA` | anchors doc `schemaVersion` ≠ 1 | schemaVersion=1 |
| `TRUST_ANCHOR_UNKNOWN_FIELD` | anchors/anchor/rotation'da bilinmeyen alan | Strict şema |
| `TRUST_ANCHOR_MALFORMED` | anchors doc bozuk JSON/shape/eksik required | Geçerli anchor doc |
| `TRUST_ANCHOR_DUPLICATE_KEYID` | anchors doc'ta tekrar `keyId` | Benzersiz keyId |
| `TRUST_ANCHOR_BAD_PEM` | anchor `publicKeyPem` geçerli public key değil | Geçerli PEM |
| `TRUST_ANCHOR_UNAUTHORIZED_ROTATION` | Working-tree anahtarı parent-signed rotation olmadan eklendi/değiştirildi | Reviewed-parent anahtarıyla imzalı rotation |

### 8.3 Ek gate kodları (independent-verification çapraz-kontrolleri) — hepsi error

Tamlık notu: `validateAuthority`, receipt'in imzaladığı her alanı immutable
bundle/anchor'a karşı bağımsız doğrularken (§3.4 independent-verification) şu ek
kodları da emit eder (hepsi `err`): `RECEIPT_REJECTED_FIELD`, `RECEIPT_UNKNOWN_FIELD`,
`AUTHORITY_MANIFEST_BINDING`, `AUTHORITY_MANIFEST_MISMATCH`, `AUTHORITY_COUNT_MISMATCH`,
`AUTHORITY_SEQ_MISMATCH`, `AUTHORITY_SNAPSHOT_MISMATCH`, `AUTHORITY_REGISTRY_MISMATCH`,
`AUTHORITY_PROPOSAL_MISMATCH`, `AUTHORITY_TENANT_MISMATCH`, `AUTHORITY_PROJECT_MISMATCH`,
`AUTHORITY_REQUESTID_MISMATCH`. Bunlar, receipt'in imzaladığı her alanın immutable
bundle/anchor'a karşı **bağımsız** çapraz-kontrolünün (independent-verification)
mismatch'leridir; bir imza tek başına geçerli olsa bile forger reconstructed
binding'i kontrol ettiğinden bu bağımsız kontroller gereklidir.

---

## 9. CLI / gate komutları

```bash
# SOLE validator/gate — pozisyonel ledger yolu ya da --self-check
node scripts/lint-closure-dispositions.mjs [--self-check | <ledger-path>]
#   argümansız: default docs/governance/closure-dispositions.jsonl'i doğrular.
#   Ledger boş/absent → "[closure-gate] ledger empty/absent — nothing to validate (OK)" (exit 0).
#   --self-check: 127/127 in-process assertion (canonical edge-case + authority + root-of-trust + rowRef SSOT + fixtures).

# Projection producer — yalnız gate-PASSING defterden dört view
node scripts/closure-ledger/project.mjs [--self-check | --dry-run | --check | --write]
#   --dry-run: deterministik unsigned batch manifest digest + seq interval (yazmaz).
#   --check:   current bundle generator'a uyuyor + dört content digest doğrulanıyor mu?
#   --write:   immutable bundle + tek atomik current.json pointer swap (gate-PASS-gated).
#   --self-check: 22/22 assertion (reduce/projection + B2 failure-injection matrisi).

# Level×Lane sınıflandırma tarayıcısı (owner-proposal üreteci)
node scripts/closure-classification-scan.mjs [--check | --write]
```

Gate, `npm run lint:gates` içine kanonik olarak **wire edilmiştir** (`package.json`):
`… && node scripts/lint-master-plan.mjs --check && node scripts/lint-closure-dispositions.mjs
&& node scripts/update-readme-stats.mjs --check && …`. CI'ın `fetch-depth: 0` job'unda
çalışır (merge-base/trust-anchor history-sensitive).

**`lint:gates` green'in gerçekte kanıtladığı:** `main()`, boş ledger'da `loadBatchManifests`,
`loadBatchSnapshots`, `resolveTrustAnchors`, `resolveBaseline`'dan **ÖNCE** 0 döner.
Bugünkü green **yalnız boş-path'in exit 0 verdiğini** kanıtlar — uçtan uca değil.
Her git-bağımlı yol yalnız (a) injected-`gitRunner` fixture'ları ve (b) `TRUST_ANCHOR_BOOTSTRAP_UNRESOLVED`
(anchors=0) döndüren tek real-git probe ile egzersiz edilmiştir.

---

## 10. Cross-platform + multi-tenant sınırlar

- **Atomik + symlink-free bundle.** Projection bundle'ı taşınabilir olmayan dir-fsync
  kullanmaz; tek `current.json` rename'i atomik sınırdır → macOS · Linux · Windows
  (native + WSL) tutarlıdır.
- **Tenant/project binding.** `subject.tenantId`/`projectId` receipt'te taşınır ve
  **trust-anchor'ın kendi tenant/project'ine** karşı çapraz-kontrol edilir
  (`AUTHORITY_TENANT_MISMATCH` / `AUTHORITY_PROJECT_MISMATCH`) — kimlik receipt'ten değil,
  reviewed-parent anchor'dan alınır. Bu, çok-kiracılı governance'ı yanlış-tenant
  imzasına karşı korur.
- **POSIX/macOS/Windows filename tehlikeleri.** `requestId` (dolayısıyla receipt
  dosya adı), ApprovalBroker id kurallarıyla (`scripts/approval-identity.mjs`,
  `src/core/approval-contract.ts::approvalIdSchema`'nın buildless mirror'ı) sınırlanır:
  `/^[a-z0-9](?:[a-z0-9._-]{0,126}[a-z0-9_-])?$/`, 1..128, ve Windows reserved device
  (`con|prn|aux|nul|com[1-9]|lpt[1-9]`) reddi. Böylece dosya adı uppercase / path-separator
  / leading-separator / **trailing `.` veya space** içeremez.

  > **Not:** regex **trailing hyphen/underscore'a İZİN VERİR** (yalnız trailing `.`/space
  > yasak; ör. `x-` kabul). `approval-identity.mjs` header yorumu bu foundation commit'inde
  > gerçekle hizalandı (önceki yorum yanlış olarak trailing hyphen'ı da yasak sayıyordu);
  > davranış her zaman regex'tir.

---

## 11. Phase-4 DELIVERED vs Phase-5 (tarihsel sınır kaydı)

Bu bölüm Phase-4 foundation sınırının TARİHSEL kaydıdır: Phase-4 **yalnız buildless
VERIFIER tarafını** sevk etmişti; sağ kolon o günkü "yazılmadı" durumunu belgeler.
Güncel delivery durumu §11.1'dedir.

### 11.1 Phase-5 DELIVERY kaydı (2026-08-17)

- **Genesis:** owner ceremony tamamlandı — public trust anchor main'de (PR #127,
  commit `88637d5d6`; private key owner custody, repo dışı).
- **Writer + signer:** `phase5-dry-run.mjs` (dogfood sprint-538) ve
  `phase5-writer.mjs` + `phase5-sign.mjs` (dogfood sprint-539) sevk edildi;
  hermetic suite'ler tmpdir-only, canlı `docs/governance/**` test-untouched.
- **İlk authenticated batch:** requestId `aprcdb-dba89c0355ac0654f52a24e68e669329`;
  claim canonical ApprovalBroker'a dosyalandı, karar `deckent approvals decide`
  interactive live-auth ile OWNER tarafından verildi, ed25519 attestation
  (`closure-owner-genesis-v1`) owner sign ceremony'sinde üretildi; append fail-closed
  doğrulama zincirinden geçti. Ledger: seq1 (8101, package/contract, zero-anchor →
  `355d347e…`) + seq2 (7140, package/runtime, → `44302b7f…`). Batch bundle
  `closure-batches/dba89c03…/` arşivli; dört-view projection üretildi; gate:
  `chain + identity + lifecycle + append-only verified`.
- **MASTER settlement:** 8101 + 7140 satırları bu batch'e bağlı consumed
  `GR-2026-08-17-CLOSURE-BATCH-01/-02` receipt'leriyle DONE'a taşındı.
- **Yapılmayan (açık):** priority-mutation uygulaması (0 değişiklik), key revocation,
  rotation depth>1.

| HISTORICAL DELIVERED (Phase-4, buildless — o tarihte sevk edildi) | HISTORICAL NOT-YET-WIRED (Phase-5 — o tarihte yazılmamıştı) |
|---|---|
| Gate/validator `scripts/lint-closure-dispositions.mjs` (SOLE validator) | Genesis provisioning **TOOL + procedure sevk edildi** (`scripts/closure-ledger/genesis-anchor.mjs`, `closure-genesis-provisioning.md`, ayrı genesis PR — SOLE validator'ı reuse eder, private key üretmez/commit etmez); **kalan:** owner'ın ceremony'yi koşup public anchor+fingerprint'i commit+verify+merge etmesi |
| Canonical encoder + digest `scripts/closure-ledger/canonical.mjs` (v1 freeze) | ed25519 **SIGNER** + owner **private key custody** (karar anında imza üreten; hiçbir şey bu dalda gerçek imza üretmez) |
| Reviewed-parent trust-anchor **VERIFIER** (`resolveTrustAnchors`, rotation-verify) | Gerçek **ApprovalBroker writer** (subject/claim submit + `verifyAndClaim` method pair; provider-evidence-probe claim path mirror'ı) — SPECIFIED + FROZEN, built değil |
| Immutable snapshot binding + integrity recompute (`loadBatchSnapshots`, `master-plan-integrity.mjs`) | Gerçek **receipt** dosyaları (`closure-dispositions.receipts/<id>.json`) |
| Transactional projections (`project.mjs`, bundle + pointer swap) | Gerçek **ledger event'leri** (`closure-dispositions.jsonl` — bugün mevcut değil) |
| Identity pin (`approval-identity.mjs` mirror + parity test) | MASTER **state/priority mutation** (OPEN satırlara priority uygulama; **0 değişiklik**) |
| Tüm self-check/testler: gate **127/127**, projector **22/22**, governance **9/9** (normal + PATH-stripped), approval-parity **3/3** (12/12 combined); tsc 0; `lint:gates` exit 0 | Gerçek batch snapshot bundle'ları (`closure-batches/`) ve projection bundle'ları (`closure-projections/`) |

**Disk-gerçeği (2026-08-17 güncellemesi — tarihsel Phase-4 durumu üstteki paragraflardadır).**
`docs/governance/` bugün canlı yüzeyleri taşır: `closure-trust-anchors.json` (genesis anchor),
`closure-dispositions.jsonl` (2 event), `closure-dispositions.receipts/` (owner-signed receipt),
`closure-batches/` (immutable bundle) ve `closure-projections/` (dört view).

**Mekanizmanın kanıt durumu.** `validateAuthority`'nin verified-binding yolu artık GERÇEK
owner approval + ed25519 receipt ile canlıda egzersiz edilmiştir (§11.1); hermetic
fixture'lar bunun yanında regression teminatı olarak durur.

---

## 12. Recovery / replay / tamper senaryoları

Motto: **doğrulanamayan her koşul typed HOLD; doğrulanıp ihlal edilen her koşul error;
hiçbiri sessiz pass değildir. HOLD ≠ closure.**

| Senaryo | Sonuç | Sınıf |
|---|---|---|
| **Payload tamper** — archived `master-snapshot.json`'daki `workItems`/`identityRegistry` değeri kurcalanıp gömülü `registryIntegrity.value` bayat bırakılır | `AUTHORITY_SNAPSHOT_INTEGRITY_MISMATCH` (recomputed ≠ stored) | error |
| **Signed-field tamper** — receipt'te imzalı bir alan imzadan sonra değiştirilir | `AUTHORITY_SIGNATURE_INVALID`; ayrıca bağımsız kontrol `AUTHORITY_*_MISMATCH` | error |
| **Claim replay** — aynı `claimRef` iki batch'te kullanılır | `AUTHORITY_CLAIM_REPLAY` | error |
| **Append-only violation** — geçmiş bir satır silinir/değiştirilir (baseline prefix bozulur) | `APPEND_ONLY` | error |
| **Broken chain** — `previousEventDigest` ≠ önceki `eventDigest` | `CHAIN_BROKEN` (ve digest bozuksa `DIGEST_MISMATCH`) | error |
| **Definition drift** — effective-latest sınıflandırmanın `rowDefinitionDigest`'i current MASTER'dan sapar | `DEFINITION_DRIFT` (yalnız o satır; superseding disposition yazılır) | HOLD |
| **Unresolvable git baseline** — origin/main unfetchable / shallow / merge-base yok | `MERGE_BASE_UNRESOLVED` (append-only) ve/veya `TRUST_ANCHOR_BOOTSTRAP_UNRESOLVED` (root-of-trust); silent pass **yok** | HOLD |
| **Genesis (anchor yok)** — reviewed parent'ta trust-anchors dosyası yok | `TRUST_ANCHOR_BOOTSTRAP_UNRESOLVED` (harici Phase-5 provisioning gerekir) | HOLD |
| **Missing receipt/bundle** — batch için committed receipt veya immutable snapshot yok | `AUTHORITY_UNVERIFIABLE` / `BATCH_SNAPSHOT_MISSING` / `BATCH_SNAPSHOT_MASTER_ABSENT` / `BATCH_SNAPSHOT_PROPOSAL_ABSENT` | HOLD |
| **Same-PR key self-vouch** — anahtar yalnız working tree'de eklenir, parent-signed rotation yok | `TRUST_ANCHOR_UNAUTHORIZED_ROTATION` | error |

**Replay/recovery ilkesi:** projection her zaman gate-PASSING defteri `seq` sırasında
(supersede/revoke onurlandırarak) yeniden uygular; bir HOLD veya error varsa **hiçbir
projection yazılmaz** (`--write` gate-gated). Kurcalanmış bir tree'de bile doğrulama
env-independent'tir çünkü authority reviewed-parent'tan ve archived bytes'tan türetilir,
current working tree'den değil. Bir typed HOLD, tekrar hesapla-doğrula döngüsünün
honest çıktısıdır — asla bir başarı/kapanış değildir.

---

*Güncel not (2026-08-17): Bu doküman bir governance/reference spec'idir. Phase-5
canlıdır: ledger boş değildir (2 authenticated event); owner-signed receipt, immutable
batch snapshot ve dört-view projection commit'lidir. Phase-4 tablosu yalnız historical
delivery sınırını korur ve güncel durumu geçersiz kılmaz. Açık kalan işler MASTER
priority mutation (0 değişiklik), key revocation ve rotation depth>1'dir; bunların
hiçbiri mevcut receipt/batch/ledger/projection kanıtını ya da “HOLD ≠ closure”
kuralını genişletmez.*
