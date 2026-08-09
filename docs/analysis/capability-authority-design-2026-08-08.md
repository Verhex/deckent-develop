# Capability Authority & Progressive Disclosure — tasarım kontratı (CAPABILITY-001, G2)

- **Work item:** CAPABILITY-001 (MASTER-PLAN 4040) — "Capability authority and progressive disclosure contract"
- **Acceptance:** "Principal, tenant, operation, resource and environment resolve one scoped capability decision"
- **Bağımlılıklar:** OPERATION-001 (operation catalog, VERIFY), PRINCIPAL-001 (VerifiedPrincipal, kısmi)
- **Tarih:** 2026-08-08 · **Durum:** G2 tasarım artifact'ı (bu doküman) + eşlik eden bounded G1 advisory dilimi
- **Sınıf:** governance-by-construction; ADR-G-020 advisory→enforce precedent'i
- **Model:** `docs/analysis/operation-catalog-authority-design-2026-08-06.md` (OPERATION-001'in aynı türden artifact'ı)

---

## §0 — Karar özeti (düz Türkçe, kod açmadan okunabilir — KANUN #12)

Bu doküman **karar verir, anket yapmaz**. Beş kesin karar:

1. **Sorun wiring değil, unification.** Deckent'te capability kararı verecek yapı taşları ZATEN var (çalışan bir broker + role→capability gate, tip-uyumlu operation catalog, VerifiedPrincipal, tenant resolver'lar) ama **~10 ayrı karar noktası** birbirinden bağımsız çalışıyor, **4 farklı rol seti** ve **3 permission sözlüğü** var, ve tek gerçek gate **production'da default-kapalı**. CAPABILITY-001 yeşil-saha değil; parçaları **tek karara indirmek** + gate'i gerçek-grant'e çevirmek.

2. **Kanonik rol seti = `{viewer, developer, operator, admin}`** (broker'ın `ROLE_CAPABILITY_MAP`'i). Sebep: Capability union'a (hedef sözlük) map edilmiş TEK set bu; net 4-kademeli privilege merdiveni.

3. **`engineer` = `developer` (alias).** Worker-authority-matrix'in `engineer`'ı ile broker'ın `developer`'ı **aynı kademedir** (iş yürütür/kod yazar, ama yönetmez). İki isim = öldürülecek fragmentation'ın ta kendisi. Worker-matrix `engineer→developer` migrate eder. RBAC'ın {admin,operator,viewer}'ına `developer` kademesi eklenir (viewer üstü, operator altı). Connector token'ları (`*:read`/`*:write`) role-map üzerinden kanonik role bağlanır.

4. **İlk çökecek decider = rol sözlüğü.** ~10 decider'ın hepsi role üstünden karar verdiği için, önce tek kanonik rol tipi kurulur (developer↔engineer çelişkisi kapatılır), SONRA operation/tenant/resource/environment girdileri tek karara threading edilir.

5. **Enforcement advisory-first, sonra fail-closed.** Bu G1 dilimi yalnız "gate kapalı" gerçeğini typed surface eder (kimse bloklanmaz). Gerçek fail-closed grant, `enforce_least_privilege` flag'i arkasında **default-off → doğrula → default-on** merdiveniyle sonraki dilimlerde gelir (riskli kod kör-default-on edilmez kuralı).

Kalan iş (bu dokümandan sonra): rol-unification implementasyonu → operation→capability köprüsü → tenant/resource/environment threading → fail-closed flip. Her biri ayrı owner-onaylı dilim.

---

## §1 — Sorun: fragmentation ve dead-by-default gate

### 1.1 Tek gerçek authority gate production'da kapalı
`createAuditedCapabilityRegistry(emit?, options?, config?)` (`src/core/capability-runtime.ts`) least-privilege gate'ini (`registry.leastPrivilegeEnabled`) **yalnız** `config.enforce_least_privilege` geçilince armed eder; denial audit'i **yalnız** `options.denialAudit` geçilince wire eder. İki production callsite:
- `src/orchestra/autonomous/runtime-loop.ts` — `createAuditedCapabilityRegistry(emit, {erp})` (üçüncü arg yok).
- `src/cli/helpers/process-runtime.ts` — aynı, `(emit, {erp})`.

Hiçbiri `enforce_least_privilege` veya `denialAudit` geçmiyor; üstelik gerçek invoke (`src/orchestra/autonomous/execute-dispatcher.ts`) `grantedCapabilities` de geçmiyor. Sonuç: gate çift-permissive — verb→handler çözüp çağırıyor, **hiçbir şeyi gate'lemiyor**. `config.enforce_least_privilege` alanı `config-types.ts`'te var ama `createAuditedCapabilityRegistry`'ye threading eden sıfır production wiring var.

### 1.2 Beş girdinin durumu (acceptance'ın istediği tek-karar)
| Girdi | Resolver var mı | Capability kararına threading |
|---|---|---|
| **Principal** | Var — `src/core/principal.ts` (`VerifiedPrincipal`, `principalToActor`) | Kısmi — yalnız `actor.id`+`actor.role` broker'a ulaşır, o da yalnız gate armed iken (prod'da hiç). Assurance/provenance tüketilmez. |
| **Tenant** | Var — `resolveCallerTenant`, `tenant-scope.ts`, `tenant-context.ts` | Kısmi — `actor.tenantId` yalnız AUDIT için taşınır; kararı scope'lamaz (tenant gating ayrıca `rbac.can()`'de). |
| **Operation** | Var — `operation-catalog/index.ts` (`resolveOperation`) | **Yok** — broker verb-string ile çözer, operation-id ile değil; `resolveOperation`'ın sıfır production tüketicisi var. |
| **Resource** | Kısmi — `scope-check.ts`/`tool-scope-gate.ts` (0 prod caller), `ctx.projectRoot` (fs-read containment) | **Yok** — resource kimliği capability-karar girdisi olarak tipli değil. |
| **Environment** | Kısmi — `AuthorityMode` matrisleri (`authority-matrix.ts`), config flag'leri | **Yok** — hiçbir environment değeri karara girmiyor. |

Beşinden yalnız principal(role) ve tenant kısmen var, ikisi de atıl. **Uçtan uca hiçbiri karşılanmıyor** — bu yüzden 4040 bu dilimde OPEN kalır.

### 1.3 On parçalı decider (unification hedefi)
Her biri capability-benzeri kararı kendi sözlüğüyle bağımsız veriyor:

| # | Decider | Dosya | Rol seti / sözlük | Karar |
|---|---|---|---|---|
| 1 | Capability broker gate | `capability-broker.ts:33` `ROLE_CAPABILITY_MAP` | **viewer/developer/operator/admin** | role→Capability union grant (prod'da off) |
| 2 | RBAC `can()` | `rbac.ts:90` `PERMISSION_MATRIX` | **admin/operator/viewer** | role×Permission×tenant (rbac.enabled yoksa no-op) |
| 3 | Connector `principalCan()` | `rbac.ts:138` + `identity/role-map.ts` | `resource:action` token'ları | wildcard token match |
| 4 | Worker authority matrix | `authority-matrix.ts:213` `WORKER_ROLE_CAPABILITY_MAP` | **admin/engineer/operator/viewer** | role→capability (absent/unknown → allow-all) |
| 5 | Tool allowlist | `tool-allowlist.ts:179` `computeToolAllowlist` | task-type×scope | prompt-text only (gerçek grant değil) |
| 6 | Gerçek tool surface | `provider-command-spec.ts` `--allowedTools` | write-scope | claude flag, codex/gemini `null` |
| 7 | Scope/tool-scope gate | `scope-gate.ts` / `tool-scope-gate.ts` (0 prod) | path scope | advisory/enforce |
| 8 | ApprovalBroker | `approval-broker.ts:320` `decide` | human-in-the-loop | CAS/expiry/relay |
| 9 | ADR-G-020 authority enforcer | `authority-enforcer.ts:261` | Brain/Auditor/Worker × read/write/spawn | hardcoded `mode:'soft'` |
| 10 | Operation gate ladder | `operation-catalog` `EFFECT_MIN_GATE` | effect→G0-G7 | runtime'da bağlı değil |

**En az 4 rol seti, 3 permission sözlüğü, ~10 karar noktası.** Somut çelişki: #1 `developer`, #4 `engineer`.

---

## §2 — Birleşik beş-girdi capability karar kontratı

### 2.1 Hedef imza
```
resolveCapability(request: CapabilityDecisionRequest): CapabilityDecision

CapabilityDecisionRequest = {
  principal:   VerifiedPrincipal      // KİM (role + assurance + provenance)
  tenant:      TenantId               // HANGİ kiracı
  operation:   OperationId            // NE (operation-catalog id → risk, effect, required capabilities)
  resource:    ResourceRef            // NEYE (path/entity/connector kimliği + owner tenant)
  environment: EnvironmentContext     // NEREDE (AuthorityMode, strict/balanced/autopilot, host/platform)
}

CapabilityDecision = {
  outcome: 'allow' | 'deny' | 'needs_approval'
  reasonCode: <typed>
  requiredCapabilities: Capability[]  // operation'dan türetilen
  grantedCapabilities: Capability[]   // principal.role → kanonik map
  gate: Gate                          // effect → EFFECT_MIN_GATE
  audited: boolean
}
```

### 2.2 Girdi→karar akışı (tek nokta)
1. **operation → requiredCapabilities + effect + gate.** `resolveOperation(operationId)` → `OperationDefinition.capabilities` (Capability union — bugün tip-uyumlu) + `EFFECT_MIN_GATE`. (Bugün eksik köprü: #10 → #1.)
2. **principal.role → grantedCapabilities.** Kanonik `ROLE_CAPABILITY_MAP` (§3). Assurance düşükse progressive disclosure: yüksek-risk operation `needs_approval`.
3. **tenant + resource.ownerTenant → cross-tenant kontrolü.** `resource.ownerTenant !== tenant` ise deny (mevcut tenant-scope fail-closed deseni; TENANT-001 T4b ile aynı sınıf).
4. **environment.authorityMode → sıkılık.** `strict` → düşük-assurance/yüksek-risk deny; `autopilot` → policy gate'e; `full-auto` → trusted-internal (ADR-037 default-deny korunur).
5. **Karar:** requiredCapabilities ⊆ grantedCapabilities AND tenant-ok AND environment-ok → allow; aksi → deny/needs_approval; `audited` = denialAudit wired mi.

Bu, §1.3'teki 10 decider'ı **tek fonksiyona** collapse eder: broker gate (#1), RBAC (#2), connector (#3), worker-matrix (#4) → tek `resolveCapability`; operation ladder (#10) girdi olur; approval (#8) `needs_approval` outcome'u; ADR-G-020 (#9) environment.authorityMode; tool allowlist/surface (#5,#6,#7) grantedCapabilities'in tool-projeksiyonu.

---

## §3 — Rol-seti reconciliation (KARAR)

### 3.1 Dört set yan yana
| Kanonik (öneri) | Broker #1 | RBAC #2 | Worker-matrix #4 | Connector #3 |
|---|---|---|---|---|
| **admin** | admin | admin | admin | (token: `*:*`) |
| **operator** | operator | operator | operator | `*:read`,`*:write` |
| **developer** | developer | *(yok)* | **engineer** | `*:write` (kısmi) |
| **viewer** | viewer | viewer | viewer | `*:read` |

### 3.2 Kararlar
- **Kanonik set = `{viewer, developer, operator, admin}`** (broker). Sebep: Capability union'a map edilmiş tek set; net privilege ladder.
- **`engineer` → `developer` (alias).** Worker-matrix `engineer`'ı developer'a migrate eder. İkisi de "iş yürütür/yazar, yönetmez" kademesi. **Karar: iki isim tek role, kanonik ad `developer`.**
- **RBAC'a `developer` eklenir.** RBAC'ın rol seti `{admin, operator, viewer}`; `developer` **tanınmıyor**. `can()` (`rbac.ts`) `isValidRole` başarısızsa **false** döner — yani bir developer principal'i RBAC yolunda over-permitted değil, **tamamen DENIED** olur (fail-closed, ama yanlış kademede: developer'ın meşru read+execute işleri de bloklanır). Bu, kanonik sette developer varken RBAC'ta yokluğunun somut sonucudur. `developer` = viewer üstü + operator altı bir `PERMISSION_MATRIX` satırı olarak eklenir (read + execute; sprint:* ve write-admin yok).
- **Connector token'ları role-map'ten türer.** `identity/role-map.ts` zaten operator=read+write, viewer=read veriyor; developer=read+execute eklenir, admin=`*`.
- **Absent/unknown role → deny (fail-closed).** Worker-matrix'in bugünkü "unknown → allow-all" (`authority-matrix.ts:322-334`) permissive default'u kanonik gate'te **deny**'a çevrilir (fail-closed migration, flag arkasında).

### 3.3 Tek kaynak
Kanonik rol tipi + `ROLE_CAPABILITY_MAP` core'da tek yerde (`capability-broker.ts` genişletilir); #2/#3/#4 ona adapter map ile bağlanır. Legacy setler silinmez, kanonik sete **projection** olur (geri-uyum).

---

## §4 — Migration merdiveni (KARAR): dead-default → real-grant

| Faz | Ne | Decider | Enforcement | Flag |
|---|---|---|---|---|
| **0** (bu dilim) | Advisory truth: gate kapalı gerçeğini typed surface | — | advisory (debugLog) | yok |
| **1** | Kanonik rol tipi + `engineer→developer` + RBAC'a developer + unknown→deny | #1,#2,#3,#4 rol setleri | advisory typed evidence | yok |
| **2** | operation→capability köprüsü: `resolveOperation` → registry `requiredCapabilities` | #10→#1 | advisory | yok |
| **3** | tenant + resource + environment girdilerini `resolveCapability`'ye threading | #2 tenant, resource, #9 environment | advisory typed evidence | yok |
| **4** | Fail-closed flip: `enforce_least_privilege` **default-off → doğrula → default-on** | tümü | fail-closed | `enforce_least_privilege` |

**İlk çökecek decider = rol sözlüğü (Faz 1)** — çünkü hepsi role üstünden karar veriyor ve `developer↔engineer` somut bug. Her faz ayrı owner-onaylı dilim; hiçbir riskli/davranış-değiştiren adım kör-default-on edilmez.

---

## §5 — İlk-consumer planı ve bu dilimin residual'ı

**Bu G1 dilimi (Faz 0):** `resolveCapabilityEnforcement(options, config)` predicate'i (`capability-runtime.ts`) — `(principal/…)` değil, registry'nin ENFORCEMENT POSTürünü (`enforce_least_privilege` armed mı, denialAudit wired mı) tipler; `ENFORCED_LEAST_PRIVILEGE` / `ADVISORY_GATE_DISABLED`. `createAuditedCapabilityRegistry` gate kapalıysa advisory `debugLog` basar (iki production callsite zaten çağırır → wired-by-construction). Kimse bloklanmaz.

**Açık typed-residual (4040 OPEN kalır — bunlar acceptance'ın kendisi):**
- Beş girdinin (principal/tenant/operation/resource/environment) uçtan uca tek `resolveCapability` kararına çözülmesi (Faz 2-3).
- Rol-unification implementasyonu (Faz 1).
- Gerçek fail-closed grant + default-on (Faz 4).
- `grantedCapabilities`'in dispatch'e threading'i (`execute-dispatcher`).

**İlk-consumer (sonraki dilim, Faz 1-2):** `resolveOperation(op).capabilities` → registry `requiredCapabilities` köprüsü + kanonik rol tipi; enforcement hâlâ advisory. Bu, `resolveCapabilityEnforcement`'ın armed-tarafını gerçek yapmaya başlar.

---

## §6 — Referanslar
- Kod-truth haritası: bu dilimin admission öncesi Explore taraması (2026-08-08).
- ADR-G-020 (authority roles/flow, advisory→enforce precedent), ADR-037 (RBAC default-deny), ADR-069 (approval direction).
- Sibling artifact: `docs/analysis/operation-catalog-authority-design-2026-08-06.md` (§4: capability = *kim* (1), operation = *ne* (N), 1:N).
- İlgili VERIFY authority'ler: OPERATION-001 (4030), TOOL-AUTHORITY-001 (4060), APPROVAL-001 (4050, OPEN).
