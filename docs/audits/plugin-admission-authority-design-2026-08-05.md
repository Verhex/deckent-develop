# Plugin Admission Authority — Güvenlik Tasarımı ve Implementation Handoff (2026-08-05)

> **Karar durumu:** KABUL EDİLDİ — Alperen, 2026-08-05 OWASP Agentic Top 10 bağımsız
> inceleme oturumu, Bulgu 1.
>
> **Implementation durumu:** Bu oturumda kod değişikliği yapılmadı. Bu doküman başka bir
> Deckent session'ında Goal/Mission/Flow/Run planına alınacak implementation authority girdisidir.
>
> **Canonical ledger:** `PLUGIN-SANDBOX-WIRE-001` (order 7031), parent
> `PLUGIN-SANDBOX-001` (7030), `SUPPLY-CHAIN-001` (7020), `ECOSYSTEM-001` (7000).
> OWASP bağlamı: `SEC-OWASP-ASI-001` (4190), ASI04 Agentic Supply Chain.

## 1. Sonuç — tek cümle

Production'da hiçbir raw plugin path veya caller-provided optional security config doğrudan hook
activation'a ulaşamayacak; discovery → policy resolution → full-artifact verification → typed admission
decision → immutable verified artifact → activation zinciri tek canonical authority olacak ve security
denial hiçbir koşulda `stderr`-only continuation'a dönüşmeyecek.

## 2. Bugünkü code-truth baseline

| Alan | Bugünkü gerçek | Enforcement hükmü |
|---|---|---|
| Security pipeline | Allowed-path containment, `SkillSandbox` AST scan, SHA-256 integrity ve Ed25519 publisher authenticity mevcut (`src/core/plugin-loader.ts:354-464`) | Kod mevcut |
| Config resolver | `resolvePluginSecurityConfig()` mevcut, fakat yalnız explicit caller kullanır (`src/core/plugin-loader.ts:306-322`) | Caller-dependent |
| Hook registration | `registerPluginHooks(plugin, securityConfig?)`; config yoksa validation tamamen atlanır (`src/core/plugin-hooks.ts:166-189`) | **UNWIRED** |
| Sprint ingress | `runSprint()` doğrudan `loadPluginHooks(projectRoot)` çağırır (`src/orchestra/sprint-controller.ts:1650-1655`) | **UNWIRED** |
| Failure semantics | Plugin security/load error'ı yakalanır, `stderr`'e yazılır ve sonraki plugin'e geçilir (`src/core/plugin-hooks.ts:229-239`) | **ADVISORY** |
| Discovery errors | Invalid plugin directory/manifest `listPlugins()` tarafından sessizce atlanabilir (`src/core/plugin.ts:190-199`) | **ADVISORY / invisible** |
| Signature default | Top-level `plugin_require_signature` ve nested `plugins.require_signature` ayrı yüzeylerdir; default `false` (`src/core/config-types.ts:1261-1267`, `:1430-1441`) | **CONFIG-GATED**, default off |
| Config transport | Nested `plugins` block iki resolved-config yolunda passthrough edilir (`src/core/config.ts:2200-2202`, `:3035-3037`) | Wired transport, unwired consumer |
| Artifact coverage | Legacy SHA-256 yalnız manifest entrypoint'ini hash'ler (`src/core/plugin-loader.ts:35-57`) | Partial integrity |
| Publisher schema | `publisherSignature` typed manifest yerine raw JSON'dan ayrıca okunur; malformed block `null` olur (`src/core/plugin-loader.ts:104-145`) | Partial schema authority |
| Execution boundary | Hook module Brain process'inde doğrudan `import()` edilir (`src/core/plugin-hooks.ts:129-155`) | Runtime isolation yok; 7030 kapsamı |
| Public docs | Hook loading öncesinde security layer çalışıyormuş gibi anlatılıyor (`docs/en/reference/sdk-and-plugins.md:36`, `docs/tr/reference/sdk-and-plugins.md:36`, `docs/en/reference/platform-security.md:35`) | Documentation/code drift |

**Baseline hükmü:** Güvenlik bileşenleri tek tek değerli olsa da production activation boundary'de
zorunlu olmadıkları için bugünkü toplam sınıf **UNWIRED**'dır.

## 3. Tehdit modeli

### 3.1 Korunan varlıklar

- Brain process authority'si ve process environment.
- Project, tenant ve workspace verisi.
- Provider credentials, runtime tokens ve secret-bearing config.
- Sprint planı, task DAG'ı, result/evaluation zinciri ve audit truth.
- Plugin publisher identity'si, artifact integrity'si ve capability declaration'ı.
- Aynı hostta çalışan diğer project/tenant'ların isolation sınırı.

### 3.2 Saldırgan yetenekleri

- Klonlanan repository'ye `.deckent/plugins/**` eklemek veya değiştirmek.
- Plugin manifest, hook module, dependency ve adjacent asset'leri kontrol etmek.
- Legacy SHA-256 değerini değiştirilmiş entrypoint ile birlikte yeniden üretmek.
- Güvenilir dizin içinden symlink/reparse-point ile allowed root dışına çıkmak.
- Validation ile `import()` arasında artifact'i değiştirmek (TOCTOU).
- Güvenilir publisher key ID'sini taklit etmek veya revoked key kullanmak.
- Bir tenant/workspace için verilen development trust'ını başka tenant/run'a taşımaya çalışmak.
- Birden çok worker/process aynı plugin'i doğrularken cache veya receipt yarışını tetiklemek.

### 3.3 Güvenilmeyen girdiler

Plugin manifest'i, plugin içeriği, repository-local trust beyanı, plugin'in kendi public key'i,
plugin callback çıktısı ve plugin tarafından önerilen capability listesi **untrusted data**'dır.
Root of trust yalnız effective config'in yetkili tenant/organization katmanı, signed Deckent
distribution metadata'sı ve canonical registry/revocation authority'sinden gelebilir.

## 4. Kabul edilen mimari kararlar

### D1 — Validation caller option'ı değil activation invariant'ıdır

`securityConfig?: ...` biçimi production API'den kalkar. Raw `Plugin` veya filesystem path kabul eden
fonksiyon hook callback kaydedemez. Activation yalnız canonical admission authority'nin ürettiği branded,
opaque `VerifiedPluginArtifact` ile yapılır.

### D2 — Fail-closed plugin activation, dependency-aware sprint settlement

Security denial her durumda plugin'i activate etmez. Sprint davranışı:

- Bugünkü manifest'te yalnız `enabled` bulunduğu için enabled plugin **required** kabul edilir; denial typed
  `PLUGIN_SECURITY_HOLD` üretir.
- İleride explicit `criticality: optional` veya capability dependency metadata'sı doğduğunda yalnız plan/DAG
  tarafından tüketilmeyen optional plugin quarantine edilip sprint devam edebilir.
- Optional continuation security bypass değildir: reddedilen plugin hiçbir zaman import edilmez.
- Planning veya task generation'ı etkileyen plugin reddedilmişse plan eksik authority ile üretilemeyeceğinden
  continuation yasaktır.

### D3 — Production/autonomous trust default'u strict'tir

Production ve autonomous run'da unsigned veya untrusted-publisher plugin activate edilemez. Global
“signature security kapalı” modu nihai state değildir. Workspace development istisnası ancak explicit,
süreli, tenant-bound ve audit-receipted grant ile mümkündür; bu grant production/autonomous profile'a
sessizce taşınamaz.

### D4 — SHA-256 identity değildir

Legacy `manifest.signature.algorithm=sha256` yalnız corruption/integrity sinyalidir. Publisher authority
sayılmaz. Strict admission şu ikisini ayrı ayrı ister:

1. Full artifact closure için deterministic content digest.
2. Operator/organization trust root'una zincirlenen Ed25519 publisher signature.

### D5 — Full artifact closure doğrulanır

Entrypoint-only hash yeterli değildir. Manifest, hook modules, transitive local modules, executable assets,
native binaries ve declared dependency lock bilgisi canonical artifact digest'e dahildir. Dynamic/network
dependency resolution admission sonrasında açılamaz; böyle bir capability varsa ayrıca manifestte
declare edilir ve runtime capability broker tarafından yönetilir.

### D6 — Validation/activation TOCTOU'suzdur

Validation sonrası mutable source path yeniden import edilmez. Doğrulanan bytes content-addressed immutable
artifact store'a snapshot edilir veya identity-stable handle ile pinlenir. Activation receipt'teki digest ile
çalıştırılan artifact digest'i aynı olmak zorundadır.

### D7 — Trust tenant/project sınırını geçmez

Admission cache anahtarı en az `{tenantId, projectIdentity, artifactDigest, policyVersion,
trustStoreVersion}` taşır. Aynı digest için doğrulama sonucu başka tenant'ın publisher trust kararını miras
alamaz. Concurrent admission aynı key üzerinde single-flight olabilir; tenant/policy sınırı düşürülemez.

### D8 — Security error user-visible, typed ve i18n-clean'dir

Security denial `stderr` string'i değildir. Canonical error catalog, audit event, terminal/API projection ve
settlement aynı typed reason'u taşır. User-facing metinlerin tümü `getMessage(key, lang)` üzerinden gelir;
`plugin-loader`, `plugin-hooks` ve orchestration mekanizmaları caller-injected structured reason dışında
TR/EN string taşımaz.

### D9 — Verification receipt olmadan activation yoktur

Her plugin admission denemesi allow/deny/quarantine receipt üretir. Receipt yazılamaz veya audit authority
ulaşılamazsa strict profile'da activation `HOLD` olur. Model, plugin veya plugin caller receipt'i kendi
beyanıyla üretemez.

### D10 — Runtime process isolation ayrı fakat zorunlu parent closure'dır

Bu dokümanın 7031 wiring paketi unvalidated load'u kapatır; doğrudan Brain-process `import()` riskini tek
başına çözmez. Gerçek process/capability isolation `PLUGIN-SANDBOX-001` (7030, OWASP Bulgu 16) kapsamında
ayrı tasarlanacaktır. 7031 DONE olabilir; fakat 7030 kapanmadan “plugin runtime secure” veya P07 security
capability COMPLETE denemez.

## 5. Hedef trust ve admission modeli

### 5.1 Trust class

Her admitted artifact aşağıdaki class'lardan tam birini taşır:

| Trust class | Kaynak | Production/autonomous activation |
|---|---|---|
| `builtin` | Signed Deckent distribution manifest'i içinde pinli artifact | Allow; distribution digest doğrulanır |
| `registry_verified` | Canonical registry metadata + trusted publisher + revoke kontrolü | Allow |
| `organization_signed` | Tenant/organization trust store'daki publisher key | Allow |
| `workspace_dev` | Explicit, süreli, digest-bound development grant | Production'da deny; authorized dev context'te allow |
| `untrusted` | Yukarıdaki zincirlerden hiçbirine girmeyen artifact | Deny/quarantine; import yok |

Trust class plugin'in kendi manifest beyanından değil, admission authority tarafından hesaplanır.

### 5.2 Canonical effective policy

Final effective policy tek nested config authority'sinden çözülür. Önerilen semantic shape:

```text
plugins.admission.enforcement       = enforce | quarantine_optional
plugins.admission.require_integrity = true
plugins.admission.require_publisher = true
plugins.allowed_paths               = resolved canonical roots
plugins.trusted_publisher_keys      = tenant/org trust roots
plugins.development_grants          = digest + scope + expiresAt records
plugins.revoked_publishers          = effective revocation projection
plugins.max_artifact_files/bytes    = resource admission limits
```

Kurallar:

- `enforcement` hiçbir modda rejected plugin'i load etmeyi ifade etmez. Fark yalnız required denial'ın
  sprint'i HOLD etmesi ile provably-unused optional plugin'in quarantine edilmesi arasındadır.
- Production/autonomous default `enforce + require_integrity + require_publisher` olur.
- `allowed_paths` yokluğu “her yer allowed” değildir; canonical project plugin root + trusted installed
  plugin store platform adapter üzerinden çözülür.
- Empty/invalid trust store ile `require_publisher=true` config-time typed HOLD üretir.
- Duplicate key ID, malformed key, conflicting trust roots veya expired development grant fail-closed'dur.
- Public keys secret değildir; fakat trust-store mutation owner/admin authority ve audit gerektirir.

### 5.3 Legacy config migration

Bugünkü iki ayrı alan sessiz precedence ile yaşamaz:

| Girdi | Resolve davranışı |
|---|---|
| Yalnız nested `plugins.require_signature` | Canonical migration adapter üzerinden integrity policy'ye çevrilir; deprecation receipt üretir |
| Yalnız top-level `plugin_require_signature` | Aynı adapter; deprecation receipt üretir |
| İkisi aynı değer | Tek effective value; duplicate-config warning |
| İkisi çelişkili | Typed config HOLD; sessiz “biri kazanır” yok |
| İkisi de yok, production/autonomous | Strict final default |
| İkisi de yok, authorized dev | Unsigned yine default allow değildir; explicit digest-bound dev grant gerekir |

Rollout sırasında shadow/audit ölçümü yapılabilir; ancak audit stage rejected plugin'i yükleyemez ve task
DONE sayılamaz. Final default flip aynı approved dependency DAG'ın kapanış koşuludur.

## 6. Canonical production call chain

```text
load/merge effective config
        │
        ▼
resolvePluginAdmissionPolicy(projectRoot, tenant, runMode, config)
        │  config invalid → CONFIG_HOLD
        ▼
discoverPluginCandidates(projectRoot, installedStore)
        │  malformed/inaccessible candidate → typed discovery denial
        ▼
admitPluginCandidate(candidate, policy, trustStore, revocations)
        │
        ├─ canonical path / symlink / reparse-point containment
        ├─ manifest schema + capability declaration
        ├─ resource limits
        ├─ AST safety signals
        ├─ full artifact digest
        ├─ trusted Ed25519 signature + revocation
        └─ immutable snapshot / identity pin
        │
        ▼
PluginAdmissionDecision + durable PluginAdmissionReceipt
        │
        ├─ DENY/HOLD       → no import, typed terminal settlement
        ├─ QUARANTINE      → no import, only provably-unused optional plugin
        └─ ALLOW           → VerifiedPluginArtifact
                                  │
                                  ▼
                         activateVerifiedPluginHooks()
                                  │
                                  ▼
                         before/after hook lifecycle
```

Canonical production wiring closure:

```text
effective config producer
  → plugin policy resolver
  → admission authority
  → verified-artifact-only activation API
  → sprint controller ingress
  → hook lifecycle consumers
  → typed settlement + audit receipt + user surface
```

Test-only import veya yalnız `validatePluginSecurity()` unit green sonucu production wiring kanıtı değildir.

## 7. Normative contracts

İsimler implementation sırasında mevcut naming pattern'e uydurulabilir; semantic alanlar ve authority
ayrımı korunmalıdır.

### 7.1 `ResolvedPluginAdmissionPolicy`

```ts
interface ResolvedPluginAdmissionPolicy {
  policyVersion: string;
  enforcement: 'enforce' | 'quarantine_optional';
  requireIntegrity: true;
  requireTrustedPublisher: boolean;
  allowedCanonicalRoots: readonly string[];
  trustedPublishers: readonly TrustedPublisherKey[];
  revokedPublisherKeyIds: ReadonlySet<string>;
  developmentGrants: readonly DevelopmentPluginGrant[];
  resourceLimits: {
    maxFiles: number;
    maxBytes: number;
    maxManifestBytes: number;
  };
}
```

### 7.2 `VerifiedPluginArtifact`

Bu type forge edilemeyen internal brand taşır; public constructor/export yoktur.

```ts
interface VerifiedPluginArtifact {
  readonly artifactDigest: string;
  readonly manifestDigest: string;
  readonly canonicalArtifactLocation: string;
  readonly pluginName: string;
  readonly pluginVersion: string;
  readonly trustClass:
    | 'builtin'
    | 'registry_verified'
    | 'organization_signed'
    | 'workspace_dev';
  readonly publisherKeyId?: string;
  readonly declaredCapabilities: readonly string[];
  readonly tenantId: string;
  readonly projectIdentity: string;
  readonly policyVersion: string;
  readonly trustStoreVersion: string;
  readonly admissionReceiptId: string;
}
```

### 7.3 `PluginAdmissionDecision`

```ts
type PluginAdmissionReason =
  | 'path_escape'
  | 'symlink_or_reparse_escape'
  | 'manifest_invalid'
  | 'resource_limit_exceeded'
  | 'unsafe_code_detected'
  | 'artifact_integrity_missing'
  | 'artifact_integrity_mismatch'
  | 'publisher_signature_missing'
  | 'publisher_untrusted'
  | 'publisher_signature_invalid'
  | 'publisher_revoked'
  | 'development_grant_missing'
  | 'development_grant_expired'
  | 'artifact_changed_after_verification'
  | 'audit_receipt_unavailable'
  | 'platform_capability_unsupported';

type PluginAdmissionDecision =
  | { decision: 'allow'; artifact: VerifiedPluginArtifact }
  | { decision: 'quarantine'; reason: PluginAdmissionReason }
  | { decision: 'hold'; reason: PluginAdmissionReason };
```

### 7.4 `PluginAdmissionReceipt`

Receipt en az şunları taşır:

- `receiptId`, schema version, timestamp.
- Project identity, tenant ID, activation/run correlation ID.
- Plugin name/version ve artifact/manifest digest.
- Trust class, publisher key ID, trust-store/policy version.
- Her validation step'inin sonucu; raw secret veya full public key yok.
- Final allow/quarantine/hold decision ve typed reason.
- Snapshot/identity proof bilgisi.
- Receipt integrity/chain alanları; canonical audit authority ile uyum.

Sprint ID plugin admission anında henüz doğmamışsa receipt activation correlation ID ile yazılır; PLAN
sonrası sprint ID'ye ayrı binding receipt üretilir. Sahte timestamp-shaped sprint ID üretilmez.

## 8. Full-artifact digest ve signature envelope

### 8.1 Canonical artifact tree

- Root realpath/identity önce pinlenir.
- Relative path'ler `/` separator ile UTF-8 canonical form'a çevrilir.
- Liste byte-order ile deterministik sıralanır.
- Her entry için type, normalized executable bit/mode, byte length ve SHA-256 content digest kaydedilir.
- Symlink/reparse point default olarak reddedilir; izin verilecekse target aynı pinned root altında yeniden
  resolve edilir ve digest'e target identity dahil edilir.
- Socket, device, FIFO ve desteklenmeyen special file fail-closed'dur.
- `.git`, transient cache, log ve runtime output artifact closure'a alınmaz; plugin root içinde bulunmaları
  ayrıca manifest/policy violation'dır.
- Resource limit aşımı scan'i yarıda keser ve typed denial üretir; memory exhaustion'a açık sınırsız walk yoktur.

### 8.2 Signed envelope

Ed25519 şu domain-separated canonical envelope'u imzalar:

```text
deckent-plugin-artifact-v1\0
pluginName\0pluginVersion\0
manifestDigest\0artifactTreeDigest\0
publisherKeyId\0declaredCapabilitiesDigest
```

Bu bağlama name/version ve capabilities eklenmesi, imzanın başka plugin/version/capability setine replay
edilmesini önler. Signature block digest hesaplanırken detached alan olarak dışarıda tutulur; canonical
encoding version'ı receipt ve manifest'te sabitlenir.

### 8.3 Cache ve concurrency

- Cache yalnız content digest + tenant/project + policy/trust-store version üzerinden hit olur.
- `mtime`, directory name veya manifest version tek başına cache key değildir.
- Aynı key için single-flight verification yapılabilir.
- Trust-store update/revocation, ilgili cache namespace'ini anında geçersiz kılar.
- Verification sonrası source path değişse bile activation immutable snapshot'tan yapılır.
- Cache corruption veya ownership/permission uncertainty typed HOLD'dur.

## 9. Failure/settlement matrisi

| Durum | Plugin | Sprint/run | Audit |
|---|---|---|---|
| Plugin directory yok | Aktivasyon yok | Normal devam | Inventory receipt optional |
| Enabled valid trusted plugin | Activate | Devam | Allow receipt zorunlu |
| Disabled plugin | Import yok | Devam | Disabled inventory kaydı |
| Malformed candidate directory | Import yok | Enabled/required varsayımıyla HOLD | Discovery-denial receipt |
| Path/symlink/reparse escape | Import yok | HOLD | Security-denial receipt |
| Unsafe AST finding | Import yok | HOLD | Finding category; source secretleri yok |
| Digest mismatch / post-verify mutation | Import yok | HOLD | Tamper receipt |
| Missing/untrusted/invalid/revoked publisher | Import yok | HOLD | Publisher reason |
| Explicit optional ve DAG tarafından kullanılmıyor | Quarantine | Devam edebilir | Quarantine + dependency proof |
| Hook module import/shape failure | Import/register başarısız | Enabled plugin required ise HOLD | Operational failure receipt |
| Hook callback runtime exception | 7030 runtime policy'sine göre isolate/disable | Security denial olarak yeniden etiketlenmez | Runtime hook failure receipt |
| Receipt authority unavailable | Import yok | HOLD | Yerel uydurma receipt yok |
| Platform containment capability unsupported | Import yok | Typed unsupported/HOLD | Platform evidence |

Security-denial ile ordinary plugin bug aynı exception catch'inde eritilmez.

## 10. File-by-file implementation planı

### W1 — Config authority ve migration

**Files:**

- `src/core/config-types.ts`
- `src/core/config.ts`
- `src/core/plugin-loader.ts` veya yeni mevcut-pattern resolver modülü
- `tests/core/config-flag-roundtrip.test.ts`
- İlgili config merge/default testleri

**İş:**

- Nested `plugins` block'u tek canonical input yap.
- `allowed_paths`, admission/trust/resource alanlarını hem authored hem resolved config'e eksiksiz taşı.
- Legacy top-level `plugin_require_signature` için explicit migration/conflict semantics ekle.
- Production/autonomous strict default'u effective config'te çöz; caller metni/provider adı policy olmasın.
- Invalid/empty trust configuration'ı plugin scan öncesi typed config HOLD'a çevir.

**Kapanış kanıtı:** three-layer config roundtrip; conflicting legacy/nested negative test; default matrix;
tenant/project override isolation.

### W2 — Canonical discovery ve admission contracts

**Files:**

- `src/core/plugin.ts`
- `src/core/plugin-loader.ts`
- Gerekirse tek amaçlı `src/core/plugin-admission.ts`
- `src/core/errors.ts`
- `src/cli/helpers/messages.ts`

**İş:**

- Silent invalid-directory skip'i typed discovery result'e dönüştür.
- Manifest schema'ya publisher signature/capability metadata'yı dahil et; raw side-read authority olmasın.
- `ResolvedPluginAdmissionPolicy`, decision, reason ve receipt kontratlarını doğur.
- Full artifact traversal/digest, path identity ve resource limits uygula.
- `VerifiedPluginArtifact` opaque/internal brand üretimini yalnız admission authority'ye ver.
- User-visible error keys için en/tr parity ekle; mekanizma modüllerinde hardcoded string bırakma.

**Kapanış kanıtı:** malformed manifest, unsupported file, symlink/reparse escape, digest drift, resource
limit ve cross-platform path corpus testleri.

### W3 — Signature, trust store, revoke ve development grants

**Files:**

- `src/core/plugin-loader.ts` / `src/core/plugin-admission.ts`
- `src/core/plugin.ts`
- Canonical trust-store/revocation authority modülü
- `tests/core/plugin-authenticity.test.ts`
- `tests/core/plugin-security.test.ts`

**İş:**

- Entrypoint-only SHA-256'yı legacy integrity olarak koru; full-artifact digest'i canonical yap.
- Domain-separated Ed25519 signed envelope'u doğrula.
- Publisher key'i yalnız effective trust root'tan çöz.
- Key ID collision, invalid key, revoke ve signature replay'i reddet.
- Development grant'i digest, tenant/project, expiry ve run-mode'a bağla.

**Kapanış kanıtı:** real Ed25519 roundtrip; forged key; unknown/revoked key; tamper-after-sign;
name/version/capability replay; expired/cross-tenant dev grant negative testleri.

### W4 — Production activation wiring ve typed settlement

**Files:**

- `src/core/plugin-hooks.ts`
- `src/orchestra/sprint-controller.ts`
- `src/orchestra/pre-start-guards.ts`
- Hook kullanan `sprint-phases.ts` / `sprint-finalizer.ts` ingressleri
- İlgili observability/audit projection modülleri

**İş:**

- `registerPluginHooks(plugin, securityConfig?)` ve `loadPluginHooks(projectRoot, options?)` optional
  bypass API'larını production'dan kaldır.
- Activation API yalnız `VerifiedPluginArtifact[]` kabul etsin.
- `runSprint` effective policy resolver → admission → receipt → activation zincirini doğrudan çalıştırsın.
- `PluginSecurityError` veya typed admission denial'ı generic debug catch'e düşürme.
- PLAN öncesi denial terminal settlement/HOLD üretsin; lock/heartbeat lifecycle'ı orphan bırakmasın.
- Hook callback operational failure semantics ile admission security failure semantics'i ayır.

**Kapanış kanıtı:** production call-graph test; security config'siz activation compile/runtime olarak
imkânsız; rejected module import sentinel'i hiç tetiklenmez.

### W5 — Receipt, observability ve public documentation truth

**Files:**

- Canonical audit/event writer consumer'ları
- `src/cli/helpers/messages.ts`
- `docs/en/reference/sdk-and-plugins.md`
- `docs/tr/reference/sdk-and-plugins.md`
- `docs/en/reference/platform-security.md`
- Varsa TR platform-security projection'ı

**İş:**

- Allow/deny/quarantine receipt ve run/sprint binding üret.
- Terminal/API surfaces'ta aynı typed reason'u i18n projection ile göster.
- Public docs'u gerçek default, strict/dev trust, limitation ve 7030 isolation durumu ile eşitle.
- “Validation hook loading öncesi çalışır” iddiasını ancak production wiring kanıtından sonra publish et.

**Kapanış kanıtı:** en/tr key parity; receipt schema/version testleri; raw key/secret loglanmadığına dair test;
docs evidence line'ları güncel code truth ile eşleşir.

### W6 — Real-binary ve platform proof

**Files:** hermetic integration/e2e testleri ve mevcut test runner konfigürasyonu.

**İş:**

- Async spawn ile tmpdir project oluştur; `spawnSync` kullanma.
- Gerçek built CLI sprint ingress'inde unsigned/untrusted/path-escape plugin'in provider spawn'dan önce
  typed non-zero/HOLD verdiğini kanıtla.
- Signed trusted fixture'ın admission+activation zincirini gerçek binary/fake-provider hermetic harness ile
  çalıştır.
- Linux, macOS, Windows native ve WSL path semantics'ini platform CI adapter'larında doğrula.
- Concurrent same-artifact admission, tenant-separated cache ve trust-store revoke invalidation testleri.
- Active sprint sırasında `npm run build` çalıştırma; build sonrası long-lived adapter restart/reconnect
  süreci owner koordinasyonuyla uygulanır.

**Kapanış kanıtı:** unit + integration + real-binary; `git diff --stat`/tracked+untracked disk truth;
fresh different-provider XVerify veya typed `unavailable/HOLD`.

## 11. Dependency DAG ve parallelization sınırları

```text
W1 config authority ───────────────┐
                                  ├─→ W4 production wiring ─→ W5 surfaces/docs ─→ W6 proof
W2 admission contracts ─→ W3 trust/signature ┘

7030 runtime process isolation (Bulgu 16)
    depends on W2 VerifiedPluginArtifact contract,
    but 7031 production admission wiring can settle before 7030.
```

- W1 ve W2 ayrı file ownership sağlanırsa paralel yürüyebilir.
- W3, W2 contract freeze olmadan başlamaz.
- W4, W1 effective config ve W2/W3 allow/deny semantics kapanmadan başlamaz.
- W5 user-facing surface değişikliği W4 typed errors doğmadan yazılmaz.
- W6 yalnız tüm producer→consumer→entrypoint zinciri tamamlandıktan sonra settlement yapar.
- Aynı dosyada collision ihtimali olan `plugin-loader.ts`, `plugin-hooks.ts`, `config-types.ts` task'ları
  aynı anda farklı worker'lara verilmez.

## 12. Acceptance ve release gates

7031 aşağıdakilerin tamamı kanıtlanmadan DONE olamaz:

1. Repo-wide production call graph'da security config/admission olmadan plugin hook activation yok.
2. `runSprint` effective config'ten canonical plugin policy çözüp admission authority'yi çağırıyor.
3. Invalid, unsigned, untrusted, forged, revoked, path-escape ve tampered plugin hiçbir koşulda import olmuyor.
4. Security denial yalnız `stderr`/debug log değil, typed HOLD/quarantine + receipt üretiyor.
5. Legacy ve nested config conflict'i sessiz precedence uygulamıyor.
6. Production/autonomous final default strict; development exception explicit/digest-bound/expiring.
7. Full artifact digest entrypoint dışındaki hook/dependency değişimini yakalıyor.
8. Validation sonrası source mutation activation'a ulaşmıyor.
9. Cache tenant/project/policy/trust-store isolation'ını koruyor.
10. User-facing tüm yeni stringler en/tr `getMessage` yolundan geliyor.
11. Unit/integration yanında gerçek-binary sprint ingress negative proof var.
12. Linux/macOS/Windows native/WSL platform matrisi ya verified ya typed unsupported/HOLD; silent fallback yok.
13. `docs/en|tr/reference/sdk-and-plugins.md` ve platform security dokümanı gerçek enforcement sınıfını söylüyor.
14. Different-provider XVerify üretim diff'i ve evidence chain'i değerlendiriyor; same-provider self-verify yok.

## 13. Explicit non-goals ve yanlış COMPLETE iddiaları

Bu paket şunları tek başına çözmez:

- Plugin hook callback'inin Brain process'i içinde çalışması — `PLUGIN-SANDBOX-001` / Bulgu 16.
- Runtime filesystem/network/process/secret capability broker.
- MCP server supply-chain trust — `MCP-TRUST-001`.
- Marketplace moderation, SBOM publication ve registry-wide revoke distribution — `SUPPLY-CHAIN-001`.
- Agent/skill paketlerinin aynı admission authority'ye migrasyonu — `ECOSYSTEM-001` parent closure.

Bu nedenle 7031 DONE olduğunda doğru claim yalnız şudur:

> “Sprint plugin-hook activation, canonical security admission olmadan çalışamaz.”

Şu claim'ler 7030/7020 kapanmadan yasaktır:

- “Plugins are sandboxed.”
- “Plugin supply chain is fully secured.”
- “Third-party plugin code cannot affect Brain process authority.”

## 14. Diğer session için doğrudan plan girdisi

**Goal:** `PLUGIN-SANDBOX-WIRE-001` — canonical plugin admission authority'yi production sprint
activation zincirine fail-closed bağla.

**Mission outcome:** Raw plugin discovery'den hook execution'a kadar hiçbir bypass ingress kalmasın;
strict publisher/integrity policy, immutable verified artifact, typed settlement ve audit receipt gerçek
binary ile kanıtlansın.

**Work packages:** W1 Config authority → W2 Admission contracts → W3 Artifact/signature trust → W4
Production wiring → W5 Receipt/i18n/docs → W6 Real-binary/platform/XVerify proof.

**Required ledger context:** 7031 doğrudan; 7020 full supply-chain authority; 7030 runtime isolation;
4190 OWASP evidence mapping. Implementation session bu dependency ilişkilerini değiştirmeden kendi
Goal/Mission/Flow/Run DAG'ına çevirmelidir.

**Settlement rule:** Agent verdict veya unit-green tek başına yeterli değildir. Effective config producer →
admission consumer → sprint ingress → hook lifecycle → typed user surface → audit receipt zinciri disk ve
real-binary evidence ile kapanmalıdır.
