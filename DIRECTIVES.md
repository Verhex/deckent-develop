# DIRECTIVES — Sprint: SOCIAL-IDENTITY FAZ 3 — ENTERPRISE IdP ADAPTERS (SCIM + OIDC-claims)

## Goal
Faz 1a (engine, PR #25) + Faz 1b (connector wiring, PR #26) merged. Now implement **Faz 3**: the
enterprise directory adapters that let `deckent`'s per-user RBAC ingest roles from real IdPs
(Microsoft Entra ID / Teams, Okta, Google Workspace) via **SCIM 2.0** + **OIDC group/role claims** —
turning the engine's honest `E_UNKNOWN_IDENTITY_PROVIDER` seams into real adapters.
**Spec of record (READ FIRST):** `docs/superpowers/specs/2026-06-26-social-identity-rbac-design.md`
§3 (pluggable provider port), §3.3 (Microsoft/Teams/Okta ingest answer), §11 (carry-overs).
Engine surface: `src/connectors/identity/` (`provider.ts` port, `index.ts` factory, `identity-store.ts`,
`role-map.ts` `resolvePermissions(role, roleMap, groupKey)`).

## 🔒 BAĞLAYICI — her task (3 Yasa anchor)
- **HOT-PATH SAF-LOCAL (belkemiği):** `resolve()` ASLA network yapmaz — yalnız in-memory cache + local
  SQLite. Tüm IdP I/O **yalnız `sync()`** içinde (out-of-band). Bir task `resolve()`'a network koyarsa YANLIŞ.
- **ADR-010 tek-runtime-dep:** yeni paket YOK. HTTP = Node global `fetch` (built-in). SCIM/OIDC parse = native.
- **Fail-closed + honest-seam:** factory hâlâ-implemente-edilmemiş kind'da `DeckentError` throw eder (sessiz stub YOK).
  Sync hatası → mevcut local store korunur (stale-but-safe), resolve fail-closed.
- **Cerrahi + distinct-file** (iki task aynı dosyaya yazmaz). ESM `.js`. `process.cwd()` YASAK → `join(root,…)`.
- **Hermetik test:** SCIM/OIDC **mock-fetch / fixture** (GERÇEK network YOK), tmpdir IdentityStore, async, no spawnSync,
  no HOME-leak. `tsc --noEmit` 0-yeni-hata (src/connectors,src/core), affected-suite yeşil per task. ci-sim yeşil.
- **i18n-first** kullanıcı-görünür string varsa `getMessage` (en/tr). **No haiku** (kod). Additive + graceful.
- **Edition:** scim/oidc = `edition:'enterprise'`; role-map `groupKey` yolu (dış-grup→deckent rol+izin) wire edilmeli.

---

## Task 1: identity config — scim/oidc provider kind + provider-specific config (foundation)
- Model: sonnet
- Effort: normal
- Agent: api-builder
- Skills: typescript-expert
- Files: src/core/config-types.ts, tests/core/identity-config-faz3.test.ts
- Scope: src/core/config-types.ts, tests/core/
- Dependencies: 0
### Description
`identity.provider` plain-data şemasını genişlet: `kind: 'local' | 'scim' | 'oidc-claims'`. SCIM için
`scim?: { baseUrl: string; token: string; userFilter?: string }` ($DECK:-interpolated token). OIDC-claims için
`oidc?: { issuer: string; audience?: string; groupsClaim?: string; roleClaim?: string }`. Additive — mevcut
`kind:'local'` kırılmaz; eksik-alan→undefined. Plain-data (core→connectors import YOK).
### goNogo
- goCriteria: union 3-kind; scim+oidc config blokları tipli; `kind:'local'` geriye-uyumlu; tsc 0-yeni-hata.
- nogo: core'a connectors import; mevcut config consumer kırılırsa.

## Task 2: SCIM 2.0 directory provider — sync() pulls Users+Groups → IdentityStore
- Model: opus
- Effort: high
- Agent: api-builder
- Skills: typescript-expert
- Files: src/connectors/identity/providers/scim.ts, tests/connectors/identity/scim-provider.test.ts
- Scope: src/connectors/identity/providers/, tests/connectors/identity/
- Dependencies: 1
### Description
`ScimIdentityProvider implements IdentityDirectoryProvider` (`id='scim'`, `edition:'enterprise'`).
`sync()`: global `fetch` ile SCIM 2.0 `/Users` (+ `/Groups` membership) çek (Bearer token), her kullanıcı için
`(connector, externalId=email)` → IdentityRecord; dış-grup → deckent rol/izin (`role-map` `groupKey` yolu);
`store.upsertIdentity(...)`; SyncReport{upserted, removed} döndür. `resolve(ref, tenantId)` = **yalnız**
`store.getIdentity(...)` (network YOK). Pagination (SCIM `startIndex`/`itemsPerPage`) + hata → mevcut store korunur.
`fetch` **inject edilebilir** (test mock-fetch için ctor param, default global fetch).
### goNogo
- goCriteria: sync() mock-SCIM fixture'ından N kullanıcı upsert eder + group→role map; resolve() saf-local
  (mock-fetch sync-DIŞI çağrılmaz — test assert); pagination 2-sayfa; sync-hatası store'u bozmaz; fail-closed resolve.
- nogo: resolve()'da network; gerçek-network test; yeni runtime-dep.

## Task 3: OIDC-claims provider — role+tenant from ID-token claims (verify-bind OIDC yolu)
- Model: sonnet
- Effort: high
- Agent: api-builder
- Skills: typescript-expert
- Files: src/connectors/identity/providers/oidc-claims.ts, tests/connectors/identity/oidc-claims-provider.test.ts
- Scope: src/connectors/identity/providers/, tests/connectors/identity/
- Dependencies: 1
### Description
`OidcClaimsIdentityProvider` — bir doğrulanmış OIDC ID-token claim-set'inden principal türetir:
`groupsClaim`/`roleClaim` → `role-map` `groupKey` → rol+izin; `tenant` claim → tenantId; `email` → userId.
Saf-fonksiyon `principalFromClaims(claims, cfg, roleMap, tenantFallback): ResolvedPrincipal | null` (testable,
network YOK — token doğrulama verify-bind'in işi; bu modül claim→principal eşler). `resolve()` store-lookup;
asıl giriş `principalFromClaims` (verify-bind OIDC callback'i çağırır).
### goNogo
- goCriteria: principalFromClaims sample Entra/Okta claim-set'lerini doğru rol+tenant'a eşler; groupsClaim
  yoksa/eşleşmeyince fail-closed (null); pure (no I/O); tsc 0-yeni.
- nogo: token-imza-doğrulama burada (verify-bind'e ait); network.

## Task 4: factory wiring — createIdentityProvider supports scim + oidc-claims
- Model: sonnet
- Effort: normal
- Agent: api-builder
- Skills: typescript-expert
- Files: src/connectors/identity/index.ts, tests/connectors/identity/factory-faz3.test.ts
- Scope: src/connectors/identity/, tests/connectors/identity/
- Dependencies: 2, 3
### Description
`createIdentityProvider` factory'sini `kind:'scim'` ve `kind:'oidc-claims'` için genişlet (honest-throw'u bu
ikisi için kaldır; provider-specific config'ten inşa et). `kind:'csv'` (Faz 2) hâlâ honest-throw kalır.
`CreateProviderOptions` union'ını yeni kind+config'lerle güncelle. Mevcut `local` yolu kırılmaz.
### goNogo
- goCriteria: factory scim/oidc-claims provider üretir; bilinmeyen-kind (`csv`) hâlâ E_UNKNOWN throw; local geriye-uyumlu; tsc 0-yeni.
- nogo: sessiz stub; local regresyon.

## Task 5: bootstrap sync wiring — background sync() opt-in + role-map groupKey live (Tier-1)
- Model: opus
- Effort: high
- Agent: api-builder
- Skills: typescript-expert
- Files: src/connectors/connector-bootstrap.ts, tests/connectors/identity-faz3-e2e.test.ts
- Scope: src/connectors/connector-bootstrap.ts, tests/connectors/
- Dependencies: 4
### Description
`identity.provider.kind` scim/oidc olduğunda bootstrap'ta provider'ı kur + **out-of-band** ilk `sync()`'i
tetikle (fire-and-forget, hata-log+devam; resolve hot-path'i bloke etmez). Mevcut opt-in/disabled yolu
**byte-for-byte** korunur (kind yoksa local). Tier-1 e2e: scim-sync (mock-fetch) → IdentityStore dolu →
inbound mesaj gerçek yoldan principal'a çözülür → L2 gate per-user allow/deny (önceki e2e deseni).
### goNogo
- goCriteria: scim kind → sync tetiklenir (mock), store dolar, e2e per-user allow/deny gerçek-yoldan; disabled-path
  değişmez (mevcut connector suite yeşil); sync-failure connector'ı crash etmez (fail-safe).
- nogo: resolve hot-path'inde sync-bekleme; disabled-path regresyonu; gerçek-network.
Smoke: npx vitest run tests/connectors/identity-faz3-e2e.test.ts → scim-sync→inbound→per-user allow/deny GREEN

## Task 6: docs — spec §3.3/§11 güncelle + ADR-092 amend (scim/oidc live)
- Model: sonnet
- Effort: low
- Agent: doc-writer
- Skills: documentation-writer
- Files: docs/superpowers/specs/2026-06-26-social-identity-rbac-design.md, docs/adr/092-connector-surface-social-identity-rbac-authorization.md
- Scope: docs/
- Dependencies: 5
### Description
Spec §3.3 (Microsoft/Teams/Okta ingest) + §11'i "Faz 3 ✅ scim+oidc-claims implemente; resolve saf-local,
sync out-of-band" olarak güncelle. ADR-092'ye enterprise-IdP adapter notu ekle. Kalan follow-up (SCIM webhook
push-sync, token-refresh, multi-IdP) açıkça işaretli kalsın. No-silent-debt.
### goNogo
- goCriteria: spec+ADR scim/oidc'i live yansıtır; kalan follow-up işaretli; lint:adr yeşil.
- nogo: over-claim (webhook/refresh yokken "tam" demek).
