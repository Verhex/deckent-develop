# ADR-G-041: Deckent Core ve Verhex Enterprise Modüler Ürün Mimarisi

**Class:** ADR-G (Global / Constitution) · **Scope:** global+project · **Immutable:** no · **Source:** publisher · **Enforcement:** today=logical ownership boundary + no-new-crossing ratchet direction; compact modular monolith remains physically intact → tomorrow=public MIT Core packages/repo + private commercial Enterprise add-ons, one kernel lineage and no fork
**Status:** accepted · **Date:** 2026-08-21 · **Amends:** ADR-G-016 §§2–3 · ADR-G-031 community/enterprise ownership language · ADR-D-008 enterprise repo strategy · **Refines:** ADR-D-006 MOD-SPLIT/GODOBJ
**Decision authority:** Alperen live direction, 2026-08-21/22

> Bu ADR önceki kararların geçmişini silmez. `ALL features`, `SAME functionality`, `byte-identical`, `single codebase` ve “enterprise repo strategy open” ifadelerinin normatif yorumunu bu ADR'nin exact amendment scope'u içinde değiştirir. Local-first, free MIT Core, no required cloud, no fork, provider neutrality ve Core'da güvenlik/yönetişim invariants ilkeleri aynen korunur.

---

## Context

Deckent bugün tek root npm package, tek MIT lisansı ve compact `src/` graph'ı olarak gelişiyor. Core runtime, orchestra, workers, providers, surfaces ve enterprise foundation fiziksel package sınırlarıyla ayrılmamış durumda. 2026-08-21 ölçümünde `orchestra→core` 986, `cli→core` 596 ve `cli→orchestra` 157 import görüldü; 51-file core ve 46-file orchestra/CLI strongly connected component bulundu. Bu sayılar kalıcı eşik değil, responsibility/state/composition coupling snapshot'ıdır.

ADR-G-016 community'nin “ALL features” ve Enterprise'ın “SAME functionality” taşıdığını; ADR-G-031 community deployment'ın byte-identical olduğunu; ADR-D-008 ise olası `deckent` + `deck-ent` repo modelini açık karar olarak bırakıyordu. Bu dil, ayrı lisanslı ve gerçek değer üreten additive Enterprise modules hedefiyle gereğinden katıdır. Aynı zamanda enterprise ayrımının Core'u bilinçli olarak eksik veya güvensiz bırakmasına izin vermemek gerekir.

Owner yönü iki ticari katmandır: ücretsiz/MIT Deckent Core ve Verhex Enterprise Layer giydirilmiş ücretli Deckent Enterprise. Fiziksel modüler ayırma, yaklaşık iki aylık product-surface kapanışından sonra yapılacaktır. Karar verilmeden beklemek ise coupling'i büyütüp gelecekteki ayırmayı big-bang rewrite'a dönüştürür.

## Decision (Today)

### 1. İki offering, tek kernel lineage

```text
Deckent Core / Community (MIT, free, complete standalone product)
                         +
Verhex Deckent Enterprise (commercial additive modules)
                         =
Enterprise deployment using the same Core kernel/runtime/contracts
```

“Tek ürün” artık byte-identical installation veya tek package/repo demek değildir. Tek ürün lineage'ı; aynı deterministic kernel, work ontology, provider/tool contracts, application services, evidence chain ve compatibility policy demektir. Community ile Enterprise arasında runtime fork'u, kopyalanmış Core source'u veya ikinci scheduler/policy/evidence authority yasaktır.

### 2. Core boundary

Core şunların tamamını kapsar:

- versioned contracts/schemas/events/errors;
- deterministic kernel, state machines ve safety invariants;
- orchestration/runtime, workers, tools, recovery ve evidence;
- transport-independent application services/read models;
- provider/model/MCP/tool/connector/storage/platform SPI'ları;
- local-first persistence ve standart adapterlar;
- Terminal/CLI/API/MCP/Desktop/Dashboard community composition yüzeyleri;
- basic identity context, scope, approval, audit, secret safety ve provider-neutral policy hooks.

Core tek başına kurulabilir, güvenli ve işlevsel kalır. Enterprise, temel güvenlik veya doğru execution için zorunlu değildir.

### 3. Enterprise boundary

Enterprise yalnız additive organization-scale governance, operations ve assurance uygular: tenant/org management, SSO/SAML/OIDC/SCIM adapters, custom RBAC/ABAC/policy packs, compliance/audit export, residency/retention, fleet/HA/distributed adapters, enterprise connectors/admin console, commercial entitlement ve support operations.

Enterprise yalnız published Core contracts/SPI/application APIs tüketir. Core internals'a deep import, Core state machine override'ı ve parallel authority yasaktır. License checks kernel/runtime business logic'ine dağılmaz; module admission/composition boundary'sinde kalır.

### 4. Bugünkü fiziksel durum

Yaklaşık iki aylık product-surface hedefi tamamlanana ve contract-stability gates geçilene kadar repository fiziksel olarak bölünmez. Compact modular monolith korunur. Buna rağmen bugünden:

- her yeni capability için target owner yazılır;
- yeni cross-layer import baseline'ı büyütemez;
- enterprise concern public port arkasında doğar;
- surfaces business/state authority sahibi olamaz;
- yeni parallel config, registry, runtime veya framework kurulamaz.

### 5. Hedef package/repo topolojisi

Dependency yönü:

```text
@deckent/contracts
        ↓
@deckent/kernel
        ↓
@deckent/runtime
        ↓
@deckent/application
        ├─ provider/integration/storage/platform SDK + adapters
        ├─ deckent community distribution
        └─ @verhex/deckent-enterprise-* add-ons
```

Hedef repo topolojisi:

- public `deckent`: MIT Core packages ve community distribution;
- private enterprise repo: yalnız commercial add-ons, Core source kopyası yok;
- customer/partner repos: public versioned contracts'a bağlı özel modules.

Mevcut root `deckent` package, physical extraction sırasında versioned compatibility facade olarak korunur.

### 6. Kararın marka-bağımsızlığı

Bu architecture Deckent'in kendi product, kernel, contract, licensing ve no-fork gereksinimlerinden türetilmiştir; dış ürün/marka analojisi normatif gerekçe değildir ve ADR içinde taşınmaz. Kesin commercial license koşulları ayrı hukuk/ticaret kararıdır.

Normatif ayrıntı, gates ve migration sırası: [Deckent Core ve Verhex Enterprise Modüler Mimarisi](../design/DECKENT-CORE-ENTERPRISE-MODULAR-ARCHITECTURE.md).

## Intent / Roadmap (Tomorrow)

1. `MODULAR-BOUNDARY-FREEZE-001`: logical ownership map, module manifests ve source-graph ratchet.
2. Product/contract stability: kernel ontology, application services, surface protocol ve adapter ports kapanışı.
3. `CORE-PACKAGE-EXTRACTION-001`: contracts → kernel → runtime → application/SPI sırasıyla davranış-nötr extraction.
4. `ENTERPRISE-ADDON-EXTRACTION-001`: private add-on repo, entitlement loader ve isolated state migrations.
5. `MODULAR-CUTOVER-ASSURANCE-001`: compatibility, upgrade/rollback, every-environment ve supply-chain proof.

Takvim başlangıç sinyalidir; physical split admission'ı contract stability ve behavior proof belirler. Big-bang taşıma yapılmaz; consumer-by-consumer strangler extraction uygulanır.

## Consequences

**(+)** Ticari sınır açıklaşır: Community complete ve güvenli kalırken Enterprise gerçek additive değer satabilir. Tek kernel/evidence lineage korunur. Private repo Core fork'una dönüşmez. Fiziksel ayırma product delivery'yi bugün kesmez, fakat gelecek coupling bugünden sınırlanır.

**(+)** Verhex AI Layer'ın ownership'i netleşir: enterprise control/governance plane Deckent Core runtime'ın üstünde compose olur; ERP, IdP, SIEM, KMS, vector DB ve provider infrastructure dış servis/adapter olarak kalır.

**(−)** “ALL features / SAME functionality / byte-identical” sloganı artık normatif değildir; Community ve Enterprise additive capability setleri farklı olabilir. Korunan invariant feature eşitliği değil, complete standalone Core + no degraded security + no fork'tur.

**(−)** İki repo ve iki license; compatibility matrix, release coordination, entitlement lifecycle, cross-repo CI ve legal review yükü getirir. Bu yükü azaltmak için Enterprise yalnız semver'li public contracts'a bağlanır.

**Risk:** Mantıksal ratchet physical split'e kadar uygulanmazsa iki ay sonra package extraction yerine rewrite gerekir. `LAYER-BOUNDARY-GATE-001` bu nedenle commercial packaging'den önce gelir.

## References

- [ADR-G-016](./adr-g-016-product-vision.md) — local-first/free/no-required-cloud identity korunur; §§2–3 exact scope'ta amended.
- [ADR-G-031](./adr-g-031-enterprise-foundation.md) — mevcut enterprise foundation inventory korunur; ownership/final-form language amended.
- [ADR-D-008](./adr-d-008-repo-strategy.md) — enterprise repo strategy bu ADR ile çözüldü.
- [ADR-D-006](./adr-d-006-code-architecture-conventions.md) — cohesion-not-LoC ve behavior-preserving split.
- `ENTERPRISE-MODULARITY-001`, `LAYER-BOUNDARY-GATE-001`, `APP-SERVICE-001`, `SURFACE-CONTRACT-001`, `STORAGE-001`.
