# Config Descriptor Registry — Canonical Design

## 1. Tasarım kararı

`ConfigDescriptorRegistry`, Deckent config contractının authored schema'dan operator projectionına
kadar tek canonical, content-addressed graph'ıdır. Registry'nin source formu domain-owned
`DescriptorModule` parçalarından oluşur; compiler bunları stable ordering ile tek registry
snapshotına bağlar. “Tek canonical” tek dev dosya demek değildir: aynı meta-schema ve compiler
tarafından unique field/type identity'leriyle birleştirilen composable module graph demektir.

Registry üç ayrı gerçeği birbirine karıştırmaz:

1. `AuthoredConfigDocument`: versioned, sparse, strict kullanıcı girdisi.
2. `ResolvedConfigSnapshot`: layer/provenance/default/policy/platform çözümü tamamlanmış immutable
   runtime snapshot.
3. `ConfigCatalogProjection`: lifecycle, impact ve sensitivity policy'sine göre filtrelenmiş,
   localized ve redacted operator/discovery görünümü.

Bu ayrım olmadan `optional authored` ile `required resolved`, `starter value` ile `effective
default`, `secret reference` ile `secret material`, `auto` sentinel'i ile platformda seçilen backend
aynı type/default alanına sıkışır.

## 2. Normatif invariants

1. Her config field'ın path rename'inden bağımsız immutable `fieldId`si vardır.
2. Her authored root ve semantic leaf-pattern registry compiler census'inde tam bir kez görünür.
3. `ACTIVE` veya `OPT_IN` field; authored type, runtime schema, resolved projection, lifecycle,
   default taxonomy, sensitivity, impact, en/tr message keys ve proof disposition taşımadan compile
   olmaz.
4. `ACTIVE` field için opaque/external-unresolved schema yasaktır. External type reference ancak
   aynı registry graph'ına schema node sağlayan module'a çözülür.
5. Unknown key global olarak reject edilir. Yalnız explicit dynamic namespace key grammar + value
   schema kapsamında additional key kabul edilir.
6. Default absence bir değerdir. `undefined`, `null`, `NO_DEFAULT`, inherited ve platform-resolved
   birbirinin alias'ı değildir.
7. Authored starter template effective default authority değildir; safety fallback normal pathte
   kullanılamaz.
8. Sensitivity projection server-side uygulanır. Hidden/secret field browser, CLI JSON, MCP/HTTP,
   log veya generated docs payloadına raw material olarak girmez.
9. `REMOVED` ve `DEPRECATED` fields census'ten silinmez; tombstone/migration graph'ında yaşamaya
   devam eder.
10. Generator output'u deterministic, sorted, normalized-newline ve content-addressed'dir. Aynı
    registry digest'i her platformda byte-identical semantic output üretir; line ending wrapper'ı
    platform adapter sınırındadır.
11. Generated type/schema eşitliği gerekli fakat behavioral wiring kanıtının yerine geçmez.
12. Registry compiler dependency/type resolution yapamazsa typed fault ile kapanır; partial catalog
    veya stale generated output kullanmaz.

## 3. Canonical source topolojisi

Önerilen production topolojisi ana-şeridin ürünleştirme kararına tabidir; bu lane source yazmaz:

```text
src/core/config-registry/
  meta-schema.ts                 # Handwritten, küçük ve versioned registry language
  compiler.ts                    # Module graph -> normalized IR + diagnostics
  registry.ts                    # Domain module aggregation only
  modules/
    core.descriptors.ts
    execution.descriptors.ts
    providers.descriptors.ts
    security.descriptors.ts
    observability.descriptors.ts
    surfaces.descriptors.ts
  messages/
    en.ts
    tr.ts
  generated/
    authored-config.generated.ts
    resolved-config.generated.ts
    runtime-schema.generated.ts
    defaults.generated.ts
    catalog.generated.ts
    migration.generated.ts
    config-schema.generated.json
    registry-census.generated.json
```

Domain module ownership same-file collision'ı azaltır; compiler bütün modules üzerinde global
unique/cycle/collision/lifecycle gate'i koşar. Bir module başka module'ın field path'ini yeniden
tanımlayamaz; yalnız exported type node/enum set'e stable ID ile reference verebilir.

## 4. Registry meta-schema

Aşağıdaki shape normatiftir; isimler prototipte birebir sınanabilir, production path'i ana-şerit
belirler.

```ts
type Presence =
  | 'optional'
  | 'required'
  | 'required_when_parent_present';

type DefaultKind =
  | 'NO_DEFAULT'
  | 'EFFECTIVE_DEFAULT'
  | 'STARTER_VALUE'
  | 'SAFETY_FALLBACK'
  | 'POLICY_INHERITED'
  | 'PLATFORM_RESOLVED';

type Lifecycle =
  | 'ACTIVE'
  | 'OPT_IN'
  | 'DEPRECATED'
  | 'INTERNAL'
  | 'RESERVED'
  | 'PLATFORM_UNSUPPORTED'
  | 'REMOVED';

type RuntimeImpact = 'hot-reload' | 'next-run' | 'restart';

type SensitivityClass =
  | 'PUBLIC'
  | 'PERSONAL'
  | 'CONFIDENTIAL'
  | 'SECRET_REFERENCE'
  | 'SECRET_MATERIAL_FORBIDDEN';

type TypeNode =
  | { kind: 'primitive'; value: 'boolean' | 'integer' | 'number' | 'string' }
  | { kind: 'literal'; value: string | number | boolean | null }
  | { kind: 'enum'; enumId: string }
  | { kind: 'union'; variants: TypeNode[] }
  | { kind: 'object'; typeId: string; fields: ObjectFieldNode[]; closed: true }
  | { kind: 'array'; element: TypeNode; cardinality?: Cardinality }
  | { kind: 'tuple'; elements: TypeNode[] }
  | { kind: 'record'; key: KeyGrammar; value: TypeNode }
  | { kind: 'mapped'; keySetId: string; value: TypeNode; partial: boolean }
  | { kind: 'discriminatedUnion'; discriminator: string; variants: VariantNode[] }
  | { kind: 'ref'; typeId: string };

interface FieldDescriptor {
  fieldId: string;
  path: PathTemplate;
  ownerModule: string;
  authored: {
    type: TypeNode;
    presence: Presence;
    scopes: AuthoredScope[];
  };
  resolved: {
    type: TypeNode;
    presence: Presence;
    strategyId: string;
    provenanceRequired: true;
  };
  defaults: DefaultRule[];
  lifecycle: LifecycleRule;
  impact: RuntimeImpactRule;
  sensitivity: SensitivityRule;
  messages: {
    titleKey: ConfigMessageKey;
    descriptionKey: ConfigMessageKey;
    deprecationKey?: ConfigMessageKey;
    unsupportedKey?: ConfigMessageKey;
  };
  aliases: AliasRule[];
  surfaces: SurfaceProjectionRule[];
  evidence: EvidenceContract;
  generatedArtifacts: GeneratedArtifactId[];
}
```

### 4.1 Stable identity ve path

- `fieldId` semantik identity'dir (`config.spawn.backend` gibi); path rename'de değişmez.
- `path` JSON-address identity'sidir. Object segment, array `[]`, finite mapped key ve wildcard `*`
  ayrı tokenlardır; noktalı string yalnız presentationdır.
- Wildcard segment raw `*` değildir; `namespaceId`, key grammar, normalization/case policy,
  maximum key length ve owner module taşır.
- `fieldId` reuse, duplicate path, overlapping wildcard, ambiguous alias veya case-fold collision
  compile error'dur.

### 4.2 Authored ve resolved type

Authored type user input sentinel'larını içerebilir; resolved type bunları davranışa hazır state'e
çevirir. Örneğin authored `spawn_backend` enum'u `auto` içerirken resolved snapshot:

```ts
{
  requested: 'auto' | 'docker' | 'tmux' | 'subprocess';
  selected: 'docker' | 'tmux' | 'subprocess';
  source: ConfigSource;
  capabilityEvidence: PlatformCapabilityReceipt;
}
```

şeklinde typed provenance taşıyabilir. `auto`, consumer-local fallback ile tekrar çözülmez.

`resolved.strategyId` arbitrary function pointer değildir. Compiler-known resolver strategy
registry'sine bağlanır; input/output schemas, dependency field IDs, purity, failure codes ve
platform adapter capability requirements manifestte görünür. Strategy'nin descriptor graph
dışında okuduğu config path gate failure'dır.

### 4.3 Presence

- `required`: authored documentın ilgili scope/versionında alan her zaman bulunur.
- `optional`: absence valid semantiktir; default zorunluluğu doğurmaz.
- `required_when_parent_present`: optional parent object/array/record entry author edildiğinde child
  zorunludur. Parent absent iken missing-default finding'i üretmez.

Compiler ancestor chain'den inferred presence hesaplar ve descriptor beyanıyla karşılaştırır.
Mismatch fail olur; böylece audit'in `selfOptional`/`optionalByAncestor` ayrımı kalıcı contracta
dönüşür.

### 4.4 Default taxonomy

Her `DefaultRule` şu alanları taşır: `kind`, typed value/expression, applies-to scope/profile,
dependency field IDs, provenance source, decision receipt, version window ve failure reason code.

| Kind | Kullanım | Generator davranışı |
|---|---|---|
| `NO_DEFAULT` | Absence semantik ve geçerli | Authored/effective docs “unset” değil, exact absence meaning gösterir |
| `EFFECTIVE_DEFAULT` | Sparse authored value absent iken pure resolver değeri | Resolved type/schema/default strategy üretir; starter documenta otomatik yazılmaz |
| `STARTER_VALUE` | Init/onboarding profile önerisi | Yalnız profile planner/template; effective resolver tüketemez |
| `SAFETY_FALLBACK` | Typed failure/recovery | Reason code + receipt gerekir; normal happy-path metadata default'u olamaz |
| `POLICY_INHERITED` | Tenant/org/environment policy kaynağı | Source/provenance zorunlu; local default diye gösterilmez |
| `PLATFORM_RESOLVED` | Capability evidence ile seçilen değer | Adapter proof zorunlu; unsupported typed HOLD |

Bir field farklı scope/profile için birden fazla rule taşıyabilir; aynı applicability aralığında iki
effective rule collision'dır. Secret material default değeri compile-time reddedilir.

### 4.5 Lifecycle

| Lifecycle | Authored input | Resolved output | Catalog/docs |
|---|---|---|---|
| `ACTIVE` | Kabul | Zorunlu strategy/consumer proof | Normal görünür |
| `OPT_IN` | Parent/enable contractıyla kabul | Absent valid; enabled state strict | Opt-in olarak görünür |
| `DEPRECATED` | Bounded version window | Alias/migration + diagnostic | Replacement/sunset görünür |
| `INTERNAL` | Reddedilir | Runtime-state namespace'inde olabilir | Default user catalogundan gizli |
| `RESERVED` | Reddedilir | Davranış yok | Roadmap/normal keys yüzeyinde gösterilmez |
| `PLATFORM_UNSUPPORTED` | Platforma göre typed reject/HOLD | Silent fallback yok | Exact platform/reason görünür |
| `REMOVED` | Migration diagnostic | Output yok | Tombstone/reference yalnız |

Lifecycle transition monotonic version graph'tır. `DEPRECATED→ACTIVE` veya `REMOVED→ACTIVE` aynı
field ID ile yapılamaz; yeni semantic identity gerekir. Sunset version yoksa deprecation compile
olmaz.

### 4.6 Impact

`hot-reload`, `next-run`, `restart` yalnız label değildir:

- `hot-reload`: runtime acknowledgement protocol, active revision ve failure reconciliation
  contractı gerekir.
- `next-run`: mevcut Run/Attempt pinned config digest'ini korur; yeni admission revisionı alır.
- `restart`: apply receipt `restart-required` state'i üretir; disk applied ile runtime applied ayrı
  raporlanır.

Impact rule platform, surface veya current runtime capability'ye göre conditional olabilir; her
branch stable reason code taşır. Unknown impact `hot-reload`a düşmez, typed HOLD olur.

### 4.7 Sensitivity ve redaction

Sensitivity boolean değildir. Rule; classification, persistence permission, redaction token,
field-level read capability, export policy, logging policy ve reveal prohibition taşır.

- `SECRET_REFERENCE` yalnız opaque broker reference kabul eder; health/fingerprint projectionı
  olabilir, material reveal olmaz.
- `SECRET_MATERIAL_FORBIDDEN` legacy plaintext path'in migration tombstone'udur; new authored input
  reject edilir.
- Descendant class parenttan daha zayıf olamaz. Record/dynamic entry keys dahi sensitive identifier
  olabilir.
- Dashboard/HTTP/MCP/CLI catalog generatorı sensitivity filtresini server-side uygular.

### 4.8 i18n keys

Registry user-facing English/Turkish literal saklamaz. Stable keys saklar; compiler:

1. en ve tr catalogunda key varlığını,
2. placeholder set parity'sini,
3. generated CLI `getMessage(key, lang)` ve Dashboard `TranslationKey` binding'ini,
4. deprecated/unsupported/validation diagnostics için iki dilde stable machine code + localized
   message ayrımını

fail-closed doğrular. English defaulttur; locale bulunamadığında key veya boş metin dönmez.

## 5. Complex Type Grammar — 449→1.002 kayıpsız açılım

### 5.1 Imported alias

Bugünkü `DecisionEngineConfig`, `NotificationConfig`, `ExecutionBudget`, `TaskKind`,
`BotCapabilitiesConfig` gibi imported aliases shallow parser'dan kaçar. Registry'de config-facing
alias `ref(typeId)` olur. Referenced `typeId` başka bir `DescriptorModule` tarafından tam TypeNode
graphıyla export edilmelidir.

Transition sırasında equality gate TypeChecker ile legacy imported TS alias shape'ini registry
node'una karşı karşılaştırır. Cutover sonrası generated config type bu node'dan türer. `ACTIVE`
field için `externalOpaque('SomeType')` kaçışı yoktur; schema adapterı olmayan external type yalnız
`INTERNAL`/`RESERVED` lifecycle'da kalabilir.

### 5.2 Mapped type

`Partial<Record<ModelTier, number>>` ve execution budget role/task-kind matrisleri iki sınıftır:

- Finite mapped set: enum/key-set ID ile tüm canonical üyeler deterministic genişletilir. Census
  hem compact pattern hem expanded `(path,key)` identity sayısını verir.
- Dynamic mapped set: finite gibi enumerate edilmez; explicit `record` grammarına dönüşür.

Compiler JavaScript prototype property'lerine inmez; audit'te çıkarılan 98 false leaf bu invariantla
mekanik olarak engellenir.

### 5.3 Record

`Record` key domain'i zorunludur:

- `finite`: registered enum/key set; exact expansion ve unknown-key reject.
- `pattern`: regex/length/normalization/reserved-prefix contractı; wildcard census.
- `registry-backed`: provider/plugin gibi runtime-loaded namespace; schema version resolver,
  pagination/search ve unavailable behavior gerekir.

`Record<string, unknown>` active config schema'da yasaktır. Dynamic value type closed object veya
versioned discriminated union olmalıdır.

### 5.4 Array ve tuple

Array iki contract üretir: container path ve `[]` item path. Item object ise semantic leaf paths
`rules[].action` biçiminde açılır. Cardinality, uniqueness key, ordering semantics ve bounded size
schema'nın parçasıdır. Tuple indices array gibi çoğaltılmaz; positional node identity'leri korunur.
Audit'teki `slaMs[]` array'lerini tuple indices gibi sayan false expansion bu ayrımla kapanır.

### 5.5 Discriminated union

Her variant stable `variantId`, discriminator literal ve closed object schema taşır. Aynı external
JSON path farklı variantlarda farklı type olabiliyorsa census identity `(fieldId, variantId)`dir;
normalized display path bunları yanlışlıkla tek field saymaz. Generator TypeScript union, JSON
Schema `oneOf` + discriminator ve runtime exhaustive switch üretir. Missing/unknown discriminator
typed reject'tir.

### 5.6 Dynamic namespace

`api_keys.*`, `modes.*`, `provider_overrides.*`, `runtime_artifact_retention.families.*` gibi
namespace'ler explicit descriptor node'dur. Her biri:

- namespace/owner ID,
- key grammar ve normalization,
- value schema veya registry-backed schema resolver,
- lifecycle ve version compatibility,
- sensitivity inheritance,
- cardinality/pagination/search contractı,
- unavailable/unknown/removed-key diagnostic'i

taşır. Concrete runtime key'ler build-time finite field gibi uydurulmaz. Registry-backed schema
provider/plugin unavailable ise silent `unknown allowed` yerine typed unavailable/HOLD verir.

## 6. Compiler pipeline

```text
descriptor modules
  -> module/type/field identity resolution
  -> schema graph cycle + collision checks
  -> authored/resolved presence expansion
  -> finite mapped/array/union semantic census
  -> default/lifecycle/impact/sensitivity/i18n validation
  -> normalized Registry IR
  -> canonical JSON serialization + schemaDigest
  -> artifact-specific filtered views
  -> generators
  -> equality/proof manifest
```

Canonical JSON; sorted object keys, stable array ordering rules, explicit numeric normalization ve
LF newline kullanır. `generatedAt` semantic digest'e girmez. Compiler version, meta-schema version,
module digests, message catalog digests ve generated artifact digests receipt'te taşınır.

### 6.1 Census manifest

Tek “field count” yerine aşağıdaki orthogonal sayımlar yayınlanır:

- authored root count,
- semantic leaf-pattern count,
- variant-qualified leaf identity count,
- finite expanded path count,
- dynamic namespace contract count,
- lifecycle distribution,
- authored/resolved/catalog/docs/form eligible counts,
- alias/tombstone count,
- sensitivity ve impact distributions,
- generated artifact row/node counts.

Audit'in 1.146 normalized union'ı transition reconciliation input'udur; target registry count'u
diye kör biçimde pinlenmez. Her union row ya canonical field/variant, alias/tombstone, internal
runtime state, parser artifact veya typed rejected unknown disposition'ına bağlanmadan cutover
olmaz.

## 7. Üretilecek artefaktlar

| Artifact | Canonical content | Equality ölçütü |
|---|---|---|
| Authored TS types | Sparse/versioned user document types | Registry authored census + TypeChecker shape equality |
| Resolved TS types | Required/policy/platform-resolved snapshot + provenance | Her active field strategy output equality |
| Runtime schema | Strict parse, unknown/dynamic/alias/lifecycle diagnostics | Positive+negative schema corpus |
| Defaults module | Default rules, starter profiles, fallback/policy/platform strategies ayrı | No competing applicability; value provenance equality |
| `CONFIG_METADATA` compatibility projection | Localized-keyed catalog, no raw strings/secrets | Eligible descriptor set equality |
| CLI catalog | Keys/list/search/schema JSON + localized human view | Same schema digest, lifecycle/sensitivity filters |
| Desktop form contract | Writable control shape, validation/impact/approval hints | Authority policy + accessibility metadata |
| Dashboard catalog | Observe-only redacted server projection | Browser receives no hidden/secret payload |
| EN/TR schema docs | Same field IDs/paths, localized prose, schema digest | Path/key/placeholder parity |
| Init/onboarding profiles | Only `STARTER_VALUE` rules | Resolved golden outcome; no effective-default duplication |
| Manifest defaults | Consumer-specific projection from field ID | Registry value/provenance equality |
| Alias/migration graph | Deprecated/removed transforms and diagnostics | Ordered/idempotent/lossless corpus |
| Census/proof manifest | Counts, source/generator/artifact digests, open HOLDs | Required gate verifies exact closure |

Generated files have `DO NOT EDIT`, meta-schema/compiler version ve schema digest header'ı. Manual
edit gate failure'dır; generator `--check` write yapmaz.

## 8. Equality gate

Gate dört ayrı assertion sınıfı taşır:

1. **Registry self-consistency:** IDs, graph, presence, defaults, lifecycle, impact, sensitivity,
   i18n, aliases ve dynamic grammar.
2. **Generated equality:** clean regeneration byte equality + census row equality.
3. **Transition equality:** legacy TS/default/metadata/docs/surface shapes TypeChecker/AST/runtime
   corpus ile registry'ye reconcile; allowlist yalnız typed migration disposition ve owner receipt.
4. **Production wiring proof:** active field descriptor→generated schema/default/resolver→consumer→
   surface→tests/proof manifest zinciri. Static reference behavioral proof değildir.

Exit codes: `0 PASS`, `1 semantic drift`, `2 gate fault/unavailable`. Gate fault hiçbir CI/local
wrapper'da pass'e çevrilmez. Required wiring ancak current 592 expected-red issue semantic
dispositionlara ayrıldıktan ve generated artifacts clean olduktan sonra açılır.

## 9. Cross-platform, multi-tenant ve million-scale contract

- Platform-dependent values doğrudan registry compiler'ın host ortamından türetilmez;
  `PLATFORM_RESOLVED` adapter capability evidence'iyle runtime resolve edilir.
- Windows native, WSL, macOS ve Linux aynı descriptor semantics'i taşır; unsupported adapter typed
  `PLATFORM_UNSUPPORTED/HOLD` verir.
- Catalog pagination/search server-side ve schema-digest-bound olur. Bir milyon project/tenant için
  field descriptor seti shared immutable snapshot; scope-specific values/provenance ayrı revisionlı
  data'dır.
- Tenant/org/project/environment policy inheritance `POLICY_INHERITED` provenance graphıdır;
  stronger deny policy local override ile sessiz zayıflamaz.
- Bulk config operations descriptor registry'yi selection criteria authority'si olarak kullanır;
  exact/estimated population, revision, backpressure ve per-target partial result taşır.
- Registry module load ve generated catalog cache key'i schema digest'tir; tenant verisi global
  catalog cache'e girmez.

## 10. Dual-lens product closure

Dogfood lens: Deckent kendi run/config üretimini aynı descriptor schema digest'iyle admission ve
settlement'a bağlar; static config drift'i worker davranışından sonra keşfedilmez.

End-user lens: solo kullanıcı hangi değerin etkin ve nereden geldiğini görür; expert operator
impact/restart state'ini yönetir; enterprise principal scope/deny/secret/audit/provenance ve
million-target operasyonlarında aynı semantic contractı kullanır. Dashboard observe-only,
Terminal/Desktop primary control ve CLI/MCP/API adapter rolleri değişmez.

## 11. Açık semantic decisions

Registry structure ve compiler foundationı owner default kararlarını beklemeden tasarlanabilir;
ancak altı conflicting default, impact-class population, secret migration ve MCP mutation risk
tier'ı owner receipt'i olmadan generated production cutover'a giremez. Exact seçenek/girdi
`HANDOFF.md` içindedir.
