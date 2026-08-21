# Deckent Core ve Verhex Enterprise Modüler Mimarisi

> **Karar durumu:** Kabul edildi; fiziksel ayırma ertelendi, mantıksal sınır bugünden bağlayıcıdır.
> **Kanıt tarihi:** 2026-08-21/22
> **Normatif karar:** [ADR-G-041](../adr/adr-g-041-core-enterprise-modular-architecture.md)
> **İş SSOT'u:** [MASTER-PLAN](../MASTER-PLAN.md) — `ENTERPRISE-MODULARITY-001` ve çocukları
> **Kapsam:** Deckent Core, community dağıtımı, Verhex/Deckent Enterprise add-on katmanı, package/repo ve lisans sınırı

## 1. Kapanış hükmü

Deckent iki ticari sunuma ayrılacaktır, fakat iki execution engine'e veya iki ürün fork'una ayrılmayacaktır:

1. **Deckent Core / Community** — MIT, ücretsiz, local-first, provider-neutral ve tek başına eksiksiz çalışan ürün.
2. **Verhex Deckent Enterprise** — ayrı lisanslı, Core üzerine yüklenen additive governance, operations ve assurance modülleri.

Bugünkü tek root package ve compact `src/` düzeni yaklaşık iki aylık ürün-yüzeyi kapanışına kadar fiziksel olarak korunur. Fiziksel package/repo ayırma bu dönemde yapılmaz. Buna karşılık her yeni iş bugünden hedef ownership haritasına göre sınıflandırılır; yeni ters bağımlılık veya enterprise concern'in kernel içine yayılması kabul edilmez.

Bu karar “iki ay sonra büyük refactor” değildir. Doğru sıra:

```text
bugün: ownership freeze + import ratchet + public contracts
   ↓
ürün/contract stabilizasyonu
   ↓
davranış-nötr package extraction
   ↓
public Core repo + private Enterprise add-on repo composition
```

## 2. Repository reality

2026-08-21 ölçümünün söylediği şey LoC büyüklüğü değil, responsibility/state/composition coupling'dir.

| Kanıt | Bugünkü gerçek | Mimari anlamı |
|---|---|---|
| Root `package.json` | Tek MIT npm package; workspace tanımı yok | Core/Enterprise bugün fiziksel package sınırı değildir |
| `src/index.ts` | `core`, `orchestra`, `monitor`, `agents` yüzeylerini aynı root export'tan açıyor | Public API ile internal module graph ayrışmış değildir |
| Cross-folder import ölçümü | `orchestra→core 986`, `cli→core 596`, `cli→orchestra 157`, `api→core 112`, `providers→core 112`, `api→orchestra 27`, `mcp→orchestra 27`, `orchestra→cli 15`, `core→cli 4` | Ports/adapters yönü bazı yerlerde tersine dönmüş; surface ve runtime sınırları geçirgen |
| Strongly connected components | 51-file core SCC; 46-file orchestra/CLI SCC | State, policy, composition ve presentation sorumlulukları birlikte çevrim oluşturuyor |
| Enterprise implementasyonu | Tenant/RBAC/OIDC/audit/rate/config/connector/admin parçaları `core`, `api`, `cli`, `connectors`, `dashboard`, `orchestra` içine dağılmış | `deckent-enterprise` bugün çıkarılabilir tek bir dizin değildir |
| `scripts/lint-layer-shims.mjs` | Registry'ye önceden yazılmış dar MCP→CLI shim'lerini denetliyor | Bütün source graph'taki yeni crossing'leri keşfeden bir layer gate değildir; `LAYER-BOUNDARY-GATE-001` hâlâ gereklidir |
| SDK export'ları | Bazı SDK tipleri doğrudan `core/orchestra` internal modüllerinden geliyor | Enterprise repo'nun güvenle bağlanacağı semver'li public contract henüz tam değildir |

Sonuç: “dosyaları klasörlere taşıma” çözüm değildir. Önce dependency direction, state ownership, application-service ve composition root ayrılmalıdır. Uzun dosya tek başına kusur değildir; bir dosya veya SCC'nin birden fazla authority sahibi olması kusurdur.

## 3. Ürün ve ownership sınırı

### 3.1 Deckent Core

`Deckent Core`, yalnız `task`, `do` veya orchestration loop demek değildir. Aşağıdaki katmanların tamamıdır:

- versioned contracts, identity ve error/event schemas;
- deterministic kernel state machines ve invariants;
- run/task/worker/attempt execution runtime'ı;
- application services ve read models;
- provider, model, MCP, tool, connector, storage ve platform SPI'ları;
- temel security invariants: secret-safe config, approval, audit trail, identity context, scope, policy hooks;
- community composition root ve Terminal/CLI/API/MCP/Desktop gibi standart ürün yüzeyleri;
- SQLite/local storage ve standart provider/integration adapterları.

Community ürün “güvensiz sürüm” değildir. Determinism, provider neutrality, approval, basic identity/audit, secret safety, local-first çalışma ve recovery lisans duvarının arkasına konulamaz.

### 3.2 Verhex / Deckent Enterprise

Enterprise katmanı Core'un yapabildiği işi tekrar uygulamaz; kurum çapında yönetir, sınırlar, kanıtlar ve işletir:

- organization/tenant management plane;
- SSO/OIDC/SAML/SCIM ve non-human identity adapterları;
- custom RBAC/ABAC, delegated administration ve policy packs;
- immutable/externally anchored audit, SIEM/compliance export ve evidence packs;
- data residency, retention/legal-hold ve regional/provider policy;
- fleet, HA, distributed storage/queue ve enterprise deployment adapterları;
- enterprise connectors, ERP/document/data integration paketleri;
- admin console, support diagnostics, upgrade orchestration ve SLA operasyonları;
- commercial entitlement, subscription ve license validation.

Enterprise runtime, Core public contracts'ı tüketir. Core internal dosyalarına deep import yapamaz; Core state machine'lerini fork'layamaz; aynı kavram için ikinci scheduler, policy engine, audit chain veya provider registry kuramaz.

### 3.3 External service ve “do not build” sınırı

| Capability | Sahiplik | Gerekçe |
|---|---|---|
| Deterministic work/run/attempt kernel | **DECKENT CORE** | Ürünün ayırt edici execution authority'si |
| Provider/model/tool/MCP SPI | **DECKENT CORE** | Vendor neutrality ve extension contractı |
| Standard hosted/local provider adapters | **DECKENT OPTIONAL** | Core SPI üstünde değiştirilebilir adapter |
| Tenant/org/policy/compliance/fleet control plane | **VERHEX ENTERPRISE** | Kurumsal governance/operations/assurance derinliği |
| ERP/IFS/Oracle/SAP özel connector paketleri | **VERHEX ENTERPRISE** veya partner module | Domain-spesifik ve ticari teslimat/sorumluluk |
| IdP, PAM, KMS/HSM, SIEM | **EXTERNAL SERVICE** | Deckent identity/secrets/log platformu olmamalı; adapter olur |
| Vector DB, object store, queue, observability backend | **EXTERNAL SERVICE** + Deckent adapter | Infrastructure yeniden yazılmaz |
| Genel ERP, document suite veya data warehouse | **DO NOT BUILD** | Deckent'in execution boundary'si dışında |
| Her modele özgü ayrı orchestration runtime | **DO NOT BUILD** | Provider leakage ve fork üretir |
| Enterprise için ikinci kernel/scheduler | **DO NOT BUILD** | Tek authority ve evidence chain'i bozar |

## 4. Hedef package graph

Hedef ticari olarak iki sunum, teknik olarak açık dependency yönlü birden fazla package'tır:

```text
@deckent/contracts  (MIT; types/schemas/events/errors, side-effect yok)
        │
        ▼
@deckent/kernel     (MIT; pure deterministic state/policy invariants)
        │
        ▼
@deckent/runtime    (MIT; scheduler/workers/recovery/tool execution, ports)
        │
        ▼
@deckent/application (MIT; transport-independent use cases/read models)
        │
        ├──────────────► @deckent/provider-sdk / standard provider adapters
        ├──────────────► @deckent/integration-sdk / MCP-tool-connector adapters
        ├──────────────► @deckent/storage-* / @deckent/platform-*
        │
        ├──────────────► deckent community composition/distribution
        │                 └─ Terminal · CLI · API · MCP · Desktop · Dashboard
        │
        └──────────────► @verhex/deckent-enterprise-*  (commercial/private)
                          └─ control-plane · policy · audit/compliance
                             identity · fleet · enterprise connectors · admin
```

Bu diyagram compile-time dependency yönünü gösterir; runtime event/callback akışı ters yönde olabilir, fakat yalnız declared port üzerinden.

### 4.1 Package sorumlulukları

| Package/katman | Sahip olduğu | Sahip olamayacağı |
|---|---|---|
| `@deckent/contracts` | Versioned IDs, commands/events, schemas, typed errors, capability declarations | Node/fs/network, provider SDK, persistence, UI |
| `@deckent/kernel` | Pure transitions, invariants, admission/settlement karar modelleri | CLI/API, concrete DB, provider client, license check |
| `@deckent/runtime` | Run lifecycle, worker supervision, recovery, tool execution, port orchestration | UI strings, tenant admin console, provider-specific policy |
| `@deckent/application` | Propose/approve/start/cancel/inspect/settle use cases; read models | HTTP/stdio/Electron details, direct DB/file mutation |
| Provider/integration SDK | Stable plugin contracts, manifests, capability and health metadata | Kernel state ownership, app-specific secrets |
| Community distribution | Composition root, standard adapters, product surfaces | Enterprise entitlement branches inside use cases |
| Enterprise add-ons | Additive org governance/ops/assurance implementations | Core internals, duplicated kernel/runtime, community source copies |

### 4.2 Yasak dependency'ler

- `contracts` hiçbir Deckent package'ını import etmez.
- `kernel`, runtime/application/surface/provider/enterprise import etmez.
- `runtime`, CLI/API/MCP/Desktop/Dashboard import etmez.
- `application`, transport/UI entrypoint import etmez.
- provider ve integration adapterları `orchestra` veya surface internals'a deep import yapmaz.
- Core, private Enterprise package'a compile-time veya startup dependency taşımaz.
- Enterprise, yalnız published semver contracts/SPI/application API tüketir; repository-relative internal import yasaktır.
- License/entitlement condition'ları kernel reducer, scheduler ve provider adapterlarına serpiştirilmez.

## 5. Plane modeli

```text
                         Verhex Enterprise Control Plane
                 org · tenant · identity · policy · audit · cost
                 compliance · residency · fleet · entitlement
                                      │
                                      ▼
Surfaces ──► Deckent Application Plane ──► Deckent Runtime/Kernel Plane
Terminal       commands/queries/read          runs/tasks/workers
Desktop        models/protocol/client         tools/recovery/evidence
CLI/API/MCP                                 │
                                      ┌─────┴─────┐
                                      ▼           ▼
                                 Provider Plane  Integration Plane
                                 models/gateways MCP/tools/connectors
                                      │           │
                                      └─────┬─────┘
                                            ▼
                                External enterprise infrastructure
```

Plane bir deployment zorunluluğu değildir. Solo kurulumda hepsi tek process/package composition olabilir; enterprise deployment'ta control plane ve runtime plane ayrı ölçeklenebilir. Contract aynı kalır.

## 6. “Everything AI” riski

Risk yalnız feature sayısının artması değildir. Asıl risk, Deckent'in her AI ihtiyacının **otoritesi** olmaya başlamasıdır.

Drift mekanizması şöyledir:

1. Bir müşteri entegrasyonu için connector gerekir.
2. Connector'ın ihtiyacı Core config veya runtime'a özel-case olarak eklenir.
3. Özel-case yeni state, policy ve UI üretir.
4. Deckent connector çalıştıran platform olmaktan çıkar, bağlandığı business system'i yeniden uygular.
5. Her yeni model/RAG/ERP yüzeyi ayrı scheduler, registry veya governance path'i getirir.
6. Tek deterministik kernel ve evidence chain avantajı kaybolur; ürün yatay “AI suite”e dönüşür.

Her öneri aşağıdaki beş testten geçmelidir:

| Test | “Evet” ise |
|---|---|
| Capability, provider/agent/tool fark etmeksizin execution admission/authority/evidence için gerekli mi? | Core adayı |
| Aynı sonucu stable port/adapter ile dış sistem sağlayabilir mi? | Integrate; altyapıyı build etme |
| Yalnız organization-scale governance/operations/assurance mı ekliyor? | Enterprise module adayı |
| Yeni bir canonical state owner veya ikinci lifecycle mı yaratıyor? | Reddet veya mevcut application/kernel authority'ye absorbe et |
| Deckent olmadan da bağımsız bir ERP/RAG/IdP/observability ürünü olarak satılabilir mi? | Varsayılan olarak external/partner boundary |

Negatif ürün kuralı:

> Deckent model, agent, tool ve business system'lerin yaptığı işi sahiplenmez; onların hangi yetkiyle, hangi maliyetle, hangi kanıtla çalıştığını sahiplenir.

## 7. Deckent'e özgü composition ilkesi

Bu topoloji başka bir ürünün edition, repository veya licensing modelinden türetilmemiştir. Deckent'in kendi ihtiyaçlarından çıkar:

- Community deployment Core dışında bir runtime'a bağımlı olmadan eksiksiz çalışmalıdır.
- Enterprise capability'ler aynı kernel ve application contracts üzerine additive bağlanmalıdır.
- Core ile Enterprise farklı lisans ve release cadence taşıyabilmelidir.
- Private implementation, public Core source'unu kopyalamadan versioned contracts üzerinden gelişmelidir.
- Module dependency, capability, permission, compatibility ve state ownership machine-readable olmalıdır.
- Customer-specific delivery Core'a special-case olarak değil, kendi governed module'ü olarak bağlanmalıdır.

Bu nedenle public Core + private Enterprise add-ons + explicit manifest/dependency graph Deckent'e özgü bir composition kararıdır. Kesin Enterprise lisans koşulları ayrı hukuk/ticaret kararıdır. Architecture/ADR gerekçesi dış marka analojilerine dayanmaz.

## 8. Module manifest ve composition contractı

Her optional/enterprise module en az şu versioned metadata'yı ilan eder:

```yaml
schemaVersion: 1
id: verhex.enterprise.audit-export
version: 1.0.0
license: commercial-ref
deckentCompatibility: ">=1.0 <2.0"
dependsOn:
  - deckent.application.audit.v1
capabilitiesProvided:
  - enterprise.audit.export
permissionsRequired:
  - audit.read
stateMigrations:
  namespace: verhex_enterprise_audit
entrypoints:
  application: ./dist/register.js
```

Bu örnek yeni bir config SSOT tanımlamaz. Gelecekteki manifest, mevcut plugin/capability/config authority'leriyle reconcile edilerek tek canonical schema'ya dönüştürülmelidir.

Loader invariants:

- dependency ve compatibility fail-closed doğrulanır;
- unsigned/untrusted commercial module default-enable olmaz;
- license validation yalnız module admission/composition kararını etkiler;
- entitlement kaybı Core'u durdurmaz veya customer state'i silmez;
- Enterprise state ayrı namespace/migration ownership taşır;
- uninstall/expiry davranışı backup, read-only/grace ve rollback policy ile tanımlanır;
- secret/tenant/provider data lisans telemetry'sine sızmaz.

## 9. Fiziksel ayırma tetikleyicileri

“İki ay doldu” tek başına yeterli değildir. Fiziksel extraction ancak aşağıdaki kapılar birlikte sağlanınca başlar:

1. Goal→Mission→Flow→Run→WorkItem→Attempt→Operation ontology ve state ownership kararlı.
2. Canonical application services yüzeylerden ayrılmış ve aynı use case'leri taşıyor.
3. Surface protocol/SDK versioned; CLI/API/MCP/Terminal/Desktop business logic'in sahibi değil.
4. Provider, integration, storage ve platform portları concrete adapterlardan ayrılmış.
5. Import graph baseline ve new-crossing ratchet executable.
6. Açık P0 semantics değişiklikleri package public contractını hemen kırmayacak noktada.
7. Community binary/CLI/API behavior baseline'ı, migrations ve rollback fixture'ları kaydedilmiş.
8. Linux, macOS, Windows native, WSL ve declared container matrixi extraction proof planına bağlı.

Takvim hedefi yönetim sinyalidir; bu gates teknik admission authority'sidir.

## 10. Migration sırası

### Faz A — Şimdi: compact modular monolith

- Bu ownership haritası ve ADR bağlayıcıdır.
- Yeni kod hedef module owner'ı olmadan kabul edilmez.
- Yeni cross-layer import baseline'ı büyütemez.
- Yeni enterprise capability public port arkasında doğar.
- Fiziksel package taşıma ve repo split yapılmaz.

### Faz B — Ürün yüzeyi kapanınca: logical seams

1. `contracts` schemas/IDs/errors/events için tek public barrel olur.
2. Pure kernel transitions ve policy interfaces side-effect'lerden ayrılır.
3. Application services surface'lerin doğrudan runtime/store erişimini kapatır.
4. Provider/integration/storage/platform adapter ports settle edilir.
5. Büyük SCC'ler responsibility ve authority sınırında kırılır.

### Faz C — Davranış-nötr physical extraction

1. Internal workspace packages oluşturulur.
2. Mevcut `deckent` root package compatibility facade olarak eski exports'u yönlendirir.
3. Her taşımada consumer-by-consumer import migration ve contract test yapılır.
4. Community composition aynı binary davranışını üretmeden sonraki katmana geçilmez.
5. Deep import'lar deprecation window ve migration guide ile kaldırılır.

### Faz D — Commercial add-on split

1. Public Core packages/repo publish edilir.
2. Private Enterprise repo yalnız public semver dependencies kullanır.
3. Enterprise module manifests, entitlement loader ve isolated migrations kurulur.
4. Core-only ve Core+Enterprise deployment/recovery/upgrade matrixi birlikte kanıtlanır.
5. Danışmanlık deliverable'ları customer-specific add-on olarak kalır; Core fork'u olmaz.

## 11. Current-to-target taşıma haritası

Bu tablo dosya taşıma emri değil, sorumluluk inventory başlangıcıdır.

| Bugünkü alan | Hedef owner | Önce çözülmesi gereken |
|---|---|---|
| `src/core/types*`, events, public errors | `@deckent/contracts` | Internal-only ve public schema ayrımı |
| routing/policy/state transition parçaları | `@deckent/kernel` | Pure/IO ayrımı; competing state owners |
| `src/orchestra`, `src/agents`, recovery | `@deckent/runtime` | CLI/provider imports ve SCC'ler |
| use cases/read models dağınık yollar | `@deckent/application` | `APP-SERVICE-001`, `SURFACE-CONTRACT-001` |
| `src/providers` + model/provider registries | provider SDK/adapters | registry/credential/routing ownership closure |
| MCP client/server, connectors, tools | integration SDK/adapters | capability manifest ve permission contractı |
| CLI/API/MCP/Desktop/Dashboard | community surfaces/distribution | thin adapter ve shared client/protocol |
| enterprise config/RBAC/OIDC/audit/tenant/rate | Enterprise modules + Core hooks | Core safety invariant ile org-depth ayrımı |
| SQLite/files/platform branches | storage/platform adapters | `STORAGE-001`, `ENV-ADAPTER-001` |

## 12. Licensing, repo ve deployment sınırı

### Repo topolojisi

```text
deckent                  public; MIT Core packages + community distribution
verhex-deckent-enterprise private; commercial add-ons only
customer modules         ayrı private repos; public contracts'a bağımlı
```

Private repo Core source kopyası taşımaz. Enterprise release, desteklediği Core semver range ve contract digest'ini pinler. Cross-repo CI; current, previous supported ve upgrade-path combinations'ını test eder.

### Ticari model

- Community: MIT, ücretsiz, self-managed.
- Enterprise: subscription/perpetual/support seçenekleri kesinleştirilecek ayrı commercial license.
- Danışmanlık: implementation/integration hizmeti; lisans contractından ayrı SOW.
- Hosted service: optional deployment; Core'un çalışması için gerekli değildir.

Kesin lisans metni bu teknik kararın parçası değildir ve hukuk incelemesi olmadan türetilmez. Teknik karar yalnız Deckent'e özgü additive repo/module composition ve no-fork invariants'ını tanımlar.

## 13. Migration invariants ve DoD

Fiziksel split ancak şu kanıtlarla DONE olur:

- Core-only fresh install, upgrade, rollback ve uninstall gerçek binary proof'u;
- Core+Enterprise aynı kernel/run/task/evidence identity'sini kullanıyor;
- Enterprise yokken Core compile/start/runtime bağımlılığı taşımıyor;
- Enterprise package yalnız declared public exports import ediyor;
- package graph cycle'sız ve source graph gate fail-closed;
- compatibility facade eski supported public imports/commands için migration window sunuyor;
- community ve enterprise state migrations ayrı ownership/namespace/backup/rollback taşıyor;
- entitlement failure data kaybı, Core outage veya silent downgrade üretmiyor;
- provider/model/tool behavior iki dağıtımda aynı capability contractına bağlı;
- Linux/macOS/Windows-native/WSL/container matrixi ve supply-chain/signing kanıtı mevcut;
- lisans sınırı README sloganıyla değil package/repo/build/deploy artifact'larıyla doğrulanıyor.

## 14. Riskler ve karşılıklar

| Risk | Seviye | Karşılık |
|---|---|---|
| İki ay boyunca coupling'in büyümesi | HIGH | Bugünden ownership freeze + new-crossing ratchet |
| Big-bang package split | CRITICAL | Strangler extraction, compatibility facade, consumer-by-consumer cutover |
| Enterprise için ikinci kernel | CRITICAL | Public Core contracts, no-deep-import/no-duplicate-authority gates |
| “Güvenlik enterprise'ta” paywall algısı | HIGH | Core safety invariants açık ownership ve Core-only security proof |
| Lisans check'lerinin business logic'e yayılması | HIGH | Tek composition/entitlement boundary |
| Private repo'nun Core internals'a bağlanması | HIGH | Published semver API + cross-repo contract CI |
| Optional module state'inin Core DB'yi bozması | HIGH | Namespaced migrations, backup/rollback/uninstall policy |
| Her customer işinin Core'a girmesi | HIGH | Product-boundary testleri ve customer/partner add-on repos |

## 15. Bu kararın özellikle yapmadıkları

- Bugün source dosyalarını taşımıyor veya workspace package oluşturmuyor.
- Enterprise license metnini seçmiyor.
- Verhex AI Layer'ı Deckent kernel'in içine gömmüyor.
- RAG, IdP, vector DB, SIEM, ERP veya observability backend yeniden yazımı önermiyor.
- Mevcut application-service, provider, plugin veya config sistemlerinin yanında paralel framework kurmuyor.
- LoC hedefi veya klasör estetiğini architecture gate saymıyor.
- Takvimi teknik hazır-olma kanıtının yerine koymuyor.

Bu dokümanın yönü tek cümlede şöyledir:

> **Önce tek otoritenin sınırlarını görünür ve enforce edilebilir yap; sonra aynı davranışı paketlere çıkar; en son Enterprise'ı Core'un üstüne ayrı lisanslı add-on olarak compose et.**
