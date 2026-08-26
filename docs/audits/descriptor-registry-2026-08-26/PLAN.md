# Config Descriptor Registry — Productization Plan

## 1. Outcome ve DONE tanımı

Ana outcome MASTER **470 / CONFIG-TRUTH-001**'dir. Bu plan 470'i yalnız metadata üretimiyle değil,
canonical descriptor→generated authored/resolved types→strict runtime schema→defaults/resolver→
consumer/catalog/docs→required equality/proof gate zinciriyle kapatır.

Cross-links:

- **471 / CONFIG-AUTHORITY-001:** authored/effective/provenance, secret reference, revision,
  transactional mutation ve impact acknowledgement authority'si.
- **4210 / CONFIG-AUTHORITY-CONSOLIDATION-001:** security config fields için typed ingress,
  resolved projection, consumer wiring, i18n diagnostic ve serialized ownership.

Registry bu iki outcome'un yerine geçmez. 470 generated contractı sağlar; 471 mutation/resolution
authority'sini, 4210 security behavioral closure'ını tamamlar. Outer “config complete” ancak üç
zincirin dependency-bound exit gates'i kapandığında söylenebilir.

## 2. Dependency DAG

```text
P0  Frozen census + semantic decision envelope
 |
 v
P1  Registry meta-schema + deterministic compiler
 |
 v
P2  Full descriptor population + 1,146-row transition reconciliation
 |\
 | +--> P3A authored/resolved TS + strict runtime schema generators
 | +--> P3B defaults/profile/resolver strategy generators
 | +--> P3C catalog/surface/i18n/docs generators
 | +--> P3D alias/migration/census/proof generators
 |             |
 +-------------+
               v
P4  Shadow equality + behavioral wiring manifest
 |
 v
P5  Required local/CI fail-closed gate
 |
 v
P6  Atomic authority cutover + handwritten artifact retirement
 |
 v
P7  Every-environment / enterprise / migration certification
```

P3 lanes aynı normalized registry IR'den üretildiği ve generated output path'leri ayrık olduğu
sürece paralel yürüyebilir. `config-types.ts`, `config.ts`, package/gate wiring ve migration cutover
tek-yazar production package'larında serialize edilir. P6 öncesi P4/P5 kapanmadan competing manual
authority silinmez veya registry default-on yapılmaz.

Bu aşamalandırma MVP değildir. P0'da tam meta-schema ve full population boundary commit edilir;
P2 bütün config universe'ünü dispositiona bağlar; P3 artefakt family'lerini dependency yönetimi için
ayırır. Scope geleceğe bırakılmaz.

## 3. P0 — Frozen census ve semantic decision envelope

**Strengthens:** 470 primary; 471/4210 cross-link.

### Work

1. Current-main base, TypeScript/compiler version, config sources, message catalogs ve dondurulmuş
   audit corpus digest'lerini machine manifestte pinle.
2. Audit 1.146 normalized union row'unu current source delta ile yeniden üret; her row'u
   `canonical-field`, `variant`, `dynamic-contract`, `alias/tombstone`, `internal-runtime-state`,
   `parser-artifact` veya `rejected-unknown` dispositionına bağla.
3. Altı conflicting default için owner decision receipts al; alınmayan alanları
   `OWNER_DECISION_HOLD` olarak taşı.
4. Impact sınıflandırma authority'si, secret migration boundary ve MCP mutation risk tier'ı için
   owner decision envelope tanımla.
5. Descriptor module/file ownership matrisi çıkar; 4210 security fields aynı production source'a
   çarpıyorsa DAG serialize etsin.

### Acceptance

- Census regeneration aynı source digest'te byte-identical.
- Hiçbir audit union row'u disposition'sız değil.
- Parser artifact canonical field sayılmıyor; dynamic namespace concrete key uydurmuyor.
- Pinned audit sayıları (141/1.002/1.146/589) ile live sayılar ayrı alanlarda; biri diğerinin
  current truth'ü diye sunulmuyor.
- Semantic owner kararları receipt ID/digest taşır; missing receipt typed HOLD üretir.

## 4. P1 — Registry veri modeli ve compiler

**Strengthens:** 470 primary; 4210 file-ownership/type contractı; 471 provenance/impact/sensitivity.

### Work

1. `DescriptorModule`, `TypeNode`, `FieldDescriptor`, `DefaultRule`, `LifecycleRule`,
   `RuntimeImpactRule`, `SensitivityRule`, `AliasRule` ve proof contractının versioned meta-schema'sını
   uygula.
2. Stable field/type/module identity resolution, canonical path tokenization, graph cycle, duplicate,
   wildcard overlap, alias ambiguity ve case-fold collision gatesini yaz.
3. Imported refs, finite mapped types, records, arrays/tuples, discriminated unions ve dynamic
   namespaces için compiler expansionını uygula.
4. Presence inference ile explicit descriptor presence'i compare et.
5. Canonical JSON IR + schema digest + orthogonal census manifest üret.
6. en/tr key/placeholder parity, sensitivity monotonicity, default applicability collision ve
   lifecycle transition gatesini ekle.

### Acceptance

- Meta-schema version migration contractı ve downgrade behavior belgeli/testli.
- Audit representative corpus: imported alias, mapped, record, array, union ve dynamic örnekleri
  TypeChecker oracle ile lossless eşleşir.
- `ACTIVE/OPT_IN` opaque type, open `Record<string, unknown>`, missing i18n key, secret material
  default, ambiguous alias veya unknown impact compile edilemez.
- Compiler Linux/macOS/Windows path/newline farkıyla semantic digest değiştirmez; filesystem
  adapter explicit olur.
- 100k+ descriptors synthetic scale corpusunda bounded memory, deterministic ordering ve useful
  duplicate diagnostics kanıtlanır; million-project values compiler graph'ına yüklenmez.

## 5. P2 — Full descriptor population ve reconciliation

**Strengthens:** 470 primary; 4210 security namespaces; 471 scope/provenance/sensitivity.

### Work

1. Domain modules halinde bütün current authored roots ve semantic leaf-pattern'ları registry'ye
   taşı.
2. Named defaults/resolvers (`DEFAULT_TIMEOUT_CONFIG`, `DEFAULT_PROMPT_CONFIG`, `DEFAULT_MODES`,
   routing/approval lifecycle vb.) provenance-bound strategies olarak kaydet.
3. Current type-dışı runtime dialectlerini canonical field, dynamic extension, internal state,
   legacy alias veya reject dispositionına bağla; raw casts implicit API olarak kalmasın.
4. Pinned 1.146 union row'u ile live regenerated union arasında reconciliation table üret.
5. Her `ACTIVE` field için declaration/default/validation/resolution/consumer/surface/docs/tests/
   migration proof dispositionı kaydet; static candidate `behavior-proven` sayılmasın.

### Acceptance

- Authored root ve semantic path census'i registry/compiler ile TypeChecker oracle arasında exact.
- Finite mapped expansion, variant-qualified identity ve dynamic contract counts ayrı ve exact.
- Lifecycle dağılımında `ACTIVE` no-consumer/no-resolver/no-test boşluğu yok; field ya wired proof
  taşır ya `DEPRECATED/RESERVED/REMOVED/HOLD` olur.
- 4210 kapsamındaki security fields authored→resolved→consumer chain manifestinde görünür; eksik
  consumer varsa 4210 DONE verilmez.
- 471 sensitivity/scope/provenance gerektiren fields explicit owner/module taşır.

## 6. P3 — Generator families

### P3A — Authored/resolved TypeScript + runtime schema

**Strengthens:** 470 primary; 4210 typed security ingress; 471 strict document boundary.

Work:

- `DeckentConfig` authored types, `ResolvedConfigSnapshot` types ve type-node exports üret.
- JSON Schema/runtime validator üret; unknown, dynamic, legacy alias, deprecated, removed ve
  internal field diagnosticsini ayır.
- TypeScript TypeChecker equality adapterı transition boyunca legacy declarationsla compare et.

Acceptance:

- Registry census = generated type census = runtime schema census.
- Positive/negative corpus; sparse, parent-present, union discriminator, array cardinality,
  dynamic key, unknown typo, alias conflict ve removed input scenarios pass.
- Runtime dependency unavailable veya schema compile fault exit 2; stale validator fallback yok.

### P3B — Defaults, starter profiles ve resolver strategies

**Strengthens:** 470 default truth; 471 pure resolution/provenance.

Work:

- `EFFECTIVE_DEFAULT`, `STARTER_VALUE`, `SAFETY_FALLBACK`, `POLICY_INHERITED` ve
  `PLATFORM_RESOLVED` outputs'u ayrı generated APIs yap.
- `createDefaultConfig()` compatibility semanticsini owner-approved mapping ile generated source'a
  bağla; starter profile veya recovery fallback karıştırma.
- Pure resolver dependency graph, source provenance ve platform capability receipt'i üret.

Acceptance:

- Aynı applicability scope'unda competing effective default yok.
- Altı CFG-011 conflict'i owner receipt'ine göre exact taxonomy alır.
- Authored sparse input→resolved snapshot property tests layer precedence ve provenance ile pass.
- Consumer-local fallback lint/proof manifestte kalmaz; safety fallback reason/receipt zorunlu.

### P3C — Catalog, surface, i18n ve docs

**Strengthens:** 470 metadata/docs; 471 redacted projection; 4210 i18n security diagnostics.

Work:

- `CONFIG_METADATA` compatibility view, CLI discovery, Desktop form contract, Dashboard read model,
  API/MCP schema projectionı ve en/tr schema docs üret.
- Generated outputs raw strings değil message keys kullanır; platform/surface runtime renderer
  `getMessage`/Dashboard i18n binding'ini tüketir.
- Sensitivity/lifecycle/impact/scope policy'si artifact eligibility'yi belirler.

Acceptance:

- en/tr field ID/path seti ve placeholder seti exact parity.
- CLI/Desktop/Dashboard/API/MCP aynı schema digest/revision üzerinde aynı lifecycle/type/default
  semanticsini gösterir.
- Dashboard browser payloadında secret-hidden field/value yok; observe-only policy korunur.
- `INTERNAL/RESERVED/REMOVED` normal keys/list/form yüzeyinde yanlış aktif field gibi görünmez.
- Generated docs clean regeneration ve stale digest negative testi pass.

### P3D — Alias/migration, census ve proof manifests

**Strengthens:** 470 lifecycle truth; 471 migration authority.

Work:

- Alias/tombstone graph, ordered transforms, compatibility windows ve diagnostics üret.
- Registry census, artifact row counts, source/generator/message/output digests ve proof disposition
  manifestlerini üret.
- Migration preview/apply service'i 471 transaction authority'sine bağlanacak interface üret.

Acceptance:

- Migration ordered/idempotent; alias conflict silent precedence üretmez.
- Removed/deprecated inputs exact code, replacement ve sunset bilgisi taşır.
- Generated manifest her output'u registry digest'ine bağlar; missing artifact fail-closed.

## 7. P4 — Shadow equality ve production wiring closure

**Strengthens:** 470 primary; 4210/471 closure evidence.

### Work

1. Generated artifacts production importsını değiştirmeden shadow üret.
2. Legacy vs generated authored/resolved type, runtime accept/reject, defaults, metadata, CLI,
   Dashboard ve docs equality/delta raporu üret.
3. Her delta'yı `intended-owner-decision`, `legacy-bug`, `lifecycle-migration`, `platform-conditional`
   veya `unexplained` dispositionına bağla.
4. Canonical producer→resolver→consumer→entrypoint→surface→test/proof manifestini çalıştır.

### Acceptance

- `unexplained` delta sıfır.
- Every `ACTIVE` field için exact chain ve value-A/value-B behavioral proof veya domain package
  dependency'si vardır.
- 4210 security chain eksikleri typed block; generated type green ile kapanmış sayılmaz.
- 471 writer/secret/provenance mutation zinciri eksikse config product completion HOLD kalır.
- Shadow generation production behaviorını değiştirmez; flag olmadan new schema default-on olmaz.

## 8. P5 — Required equality gate

**Strengthens:** 470 acceptance amendment.

### Work

1. Registry self-consistency, generated-clean, census equality, i18n parity, sensitivity, alias ve
   production wiring checksini tek fail-closed gate family'de birleştir.
2. Gate'i script registry, local `lint:gates`, publish/release ve CI required check setine atomik
   bağla.
3. Dependency/typechecker/generator unavailable durumunu ayrı fault exit code'uyla test et.

### Acceptance

- `PASS` yalnız exact registry/generated/proof equality'de.
- Generated file edit, missing output, stale docs, missing locale, source type drift, wildcard
  overlap ve gate dependency absence negative corpusla fail.
- Local gate hermetic; current workspace config/secret/run state okumaz veya yazmaz.
- CI required wiring gerçek workflow proof'u taşır; script-registry “deferred” kaydı aynı package'ta
  emekli edilir.

## 9. P6 — Atomic authority cutover ve handwritten retirement

**Strengthens:** 470 primary; 4210/471 production wiring.

Cutover family bazlı yapılabilir, fakat her family aynı package'ta generator output + production
consumer + gate + migration + tests zincirini kapatır. Yarı wired module `DONE` değildir.

| Legacy authority | Retirement action | Cutover gate |
|---|---|---|
| `config-types.ts` handwritten config interfaces | Generated re-export; non-config types ayrıştırılır | TypeChecker + public API compatibility |
| `config.ts` manual defaults/resolved projection | Generated rules + pure resolver | Property/behavior/provenance proof |
| `config.ts` `CONFIG_METADATA` | Generated compatibility catalog | CLI/catalog equality + i18n |
| CLI keys/list/help formatting | Catalog application service | Human/JSON contract + real binary en/tr |
| Dashboard `CONFIG_FIELDS` | Server-side generated redacted view | Browser payload + rendered accessibility |
| EN/TR schema docs | Generated docs | Digest/path/key parity |
| init/MCP init/onboarding/regenerate templates | Shared starter profile planner | Fresh/brownfield golden outcome |
| current truth parser | Registry/compiler equality gate | Required local/CI failure proof |

### Acceptance

- Production source'ta competing handwritten field/type/default/catalog listesi kalmaz.
- Compatibility exports exact deprecation window/owner taşır; permanent dual-write yok.
- Real binary: CLI validate/get/list/keys/diff/set/unset/migrate ve relevant Desktop/Terminal flow
  same schema digest/provenance/impact semanticsini kanıtlar.
- Default-on yalnız shadow equality + risk/visual validation + owner cutover receipt'inden sonra.

## 10. P7 — Every-environment, migration ve scale certification

**Strengthens:** 470 closure proof; 471 every-environment authority; 4210 enterprise security.

### Required matrix

- Linux, macOS, Windows native, WSL; local/headless/SSH/CI.
- Fresh, sparse, brownfield, corrupted, legacy alias, upgrade/downgrade/rollback.
- English/Turkish, TTY/pipe/JSON, `NO_COLOR`, ASCII/Unicode, screen reader, zoom/forced colors.
- Solo project, team scope, tenant/org/project/environment inheritance, deny precedence.
- Million-project catalog/search and revision-bound bulk simulation/apply with partial failure.
- Secret reference provision/rotation/revocation/unavailable; no plaintext fallback.
- Concurrent mutation, hot reload failure, next-run pinning ve restart-required reconciliation.

### Acceptance

- Unsupported platform/capability typed `PLATFORM_UNSUPPORTED/HOLD`; silent semantic downgrade yok.
- Same registry digest different platform adaptersla aynı schema/lifecycle/sensitivity semanticsini
  korur.
- Cross-tenant negative corpus, privilege/identity confusion ve catalog/export side channels leak
  üretmez.
- Run/Attempt/settlement evidence config schema+snapshot digest attributionı taşır.

## 11. Verification manifest

Her production package aşağıdaki kanıt sınıflarını ayrı raporlar:

1. compiler/meta-schema unit + property tests;
2. TypeChecker/schema census equality;
3. generator clean/deterministic tests;
4. strict runtime positive/negative corpus;
5. pure resolver/default/provenance properties;
6. behavioral consumer value mutation + negative competing-source proof;
7. cross-surface schema digest/redaction/i18n contracts;
8. real-binary user-surface proof;
9. platform/tenant/scale/fault certification;
10. required local/CI gate wiring receipt.

`SCOPED_GREEN`, remote advisory ve platform certification ayrı satırlardır. Unit green hiçbir zaman
production wiring closure veya repo/platform green diye raporlanmaz.

## 12. Stop/HOLD koşulları

- Owner default/impact/security semantic kararı yoksa ilgili fields typed HOLD; compiler foundation
  devam edebilir, cutover edemez.
- Registry census current TypeChecker census'i lossless açıklamıyorsa generator geliştirme durur.
- Dynamic namespace schema resolver unavailable ise unknown key allow'a düşülmez.
- Generated artifact production consumer'a bağlanmamışsa family `UNWIRED/HOLD`.
- Gate dependency unavailable veya output stale ise landing yok.
- Rebase/file-ownership collision paralel-lane protokolüne göre çözülmez; ana-şeride finding olarak
  döner.
