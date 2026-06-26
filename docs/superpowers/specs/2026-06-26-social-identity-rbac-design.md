# Social-Identity ↔ RBAC Köprüsü (Connector-Surface Authorization) — deckent Tasarım Notu

- **Tarih:** 2026-06-26
- **Durum:** DESIGN / proposed (impl YOK — brainstorming çıktısı; sıradaki adım `writing-plans`).
- **Köken:** Alperen'in "deckent'i Telegram/WhatsApp/Slack/Discord gruplarına alıp, mesaj gönderen kişinin tenant/RBAC/proje durumuna göre yetkili işlemleri yaptırması" isteği. Grup-içi her gönderen kendi yetkisiyle muamele görmeli: yetkili → cevap; yetkisiz → "yetkisiz".
- **Yasalar:** Yasa #1 (çift-bakış: dogfood + product; solo→en-büyük-şirket, milyon user/proje), Yasa #2 (her-ortam/cross-platform/multi-tenant baştan), Yasa #3 (no-MVP, god-level omurga).
- **Kapsam-sınırı:** Bu **kimlik→principal→RBAC köprüsü**dür (connector mesaj-yüzeyi için). Yeni bir LLM/agent-loop, yeni bir provider (LLM) veya yeni bir mesajlaşma-connector'ı değildir. Var olan `connectors/`, `core/rbac.ts`, `core/tenant-context.ts`, `core/capability-broker.ts`, `connectors/gateway/` katmanlarını birleştirir + genişletir.

---

## 0. Ana tez

deckent bugün connector mesaj-yüzeyinde **kanal-bazlı** (per-channel) bir güven sınırı çalıştırıyor: `incoming-command-router.ts` yalnız `authorizedChatIds` (yani `channelId`) kümesine bakıyor; `fromUser` toplanıyor ama **yetki kararında kullanılmıyor**. Gateway yolu da (`gateway-router.ts:47`) `isAuthorized(chatKey, projectPath)` ile **kanal** seviyesinde karar verip yetkisizi **sessizce** düşürüyor.

İstenen ise **kişi-bazlı** (per-user) yetki: aynı grupta A kişisi `order:read` yetkisiyle cevap alır, X kişisi yetkisi yoksa "yetkisiz" yanıtı alır. Bunun için eksik olan tek şey **sosyal kimlik (platform handle) → iç principal (user+rol+tenant) eşlemesi** ve bu principal'ın **agent turn'üne + tool-gate'e** taşınması.

Çözüm = `src/connectors/identity/` altında **pluggable Identity/Directory Provider** katmanı + `rbac.ts`'in `resource:action` izinleriyle genişletilmesi + tool/capability seviyesinde **fail-closed** enforcement.

---

## 1. Üç çekirdek karar (brainstorming'de onaylandı)

| # | Karar | Seçim | Gerekçe |
|---|---|---|---|
| 1 | Kimlik→principal bağlama | **Hibrit (edition'a göre)**: solo=owner · team=admin/dizin map · enterprise=OIDC/SCIM + verify-bind + audit. `verify-bind` ve `directory` ikisi de bu modelin bileşeni. | Yasa #1 (solo→enterprise) + Yasa #3 (no-MVP). |
| 2 | İzin granülaritesi | **Rol + `resource:action` izni**: `admin/operator/viewer` rolleri üstüne `order:read`, `order:write`, `invoice:read`, `sprint:start`… Rol = izin seti. | Kullanıcının "sipariş var / fatura yok" örneği kaynak-bazlı ayrım gerektiriyor; `rbac.ts` genişletilir. |
| 3 | Grup↔tenant | **Grup tenant'a bağlı, üye içinde çözülür**: admin grubu `(tenant, proje)`'ye pair'ler; gönderen O tenant bağlamında principal'a çözülür. | "Şirket grubu = şirket-tenant" doğal eşleşme; bilinmeyen/başka-tenant → verify/pairing veya policy-deny. |

**Ek yön (Alperen, 2026-06-26):**
- Rol-yetki ingest'i **import/export'a elverişli, pluggable** olmalı — Microsoft Entra ID / Teams üyelikleri, Okta/Google SCIM gibi dış dünyalardan roller içeri alınabilmeli. → **Identity/Directory Provider portu** (§3).
- **Ayrı core modülü değil**, `connectors/` (social) alanının içinde; tek kod-yolu solo↔enterprise'i birlikte taşır.
- **Hız kritik**: güvenli ama son derece hızlı. → hot-path saf-local lookup, IdP sync out-of-band (§3.2).
- Şu anki hedef: işlevsel/hızlı/basit, güvenlik ihlal etmeden. → mimari tam matris tasarlanır (Yasa #3), implementasyon **fazlı** (§7); ağır adapter'lar dürüst seam (sessiz borç değil).

---

## 2. BUGÜN — mevcut mekanizmalar (file:line, doc-inference değil)

| Alan | Konum | Durum |
|---|---|---|
| RBAC çekirdeği | `src/core/rbac.ts` — roller `admin/operator/viewer` (`:11`), izin enum'u (`:13-24`), merkezi `can(role, action, tenantId, auditCtx?)` (`:90`), `enforceRbac()` (`:120`, default **advisory**, `rbacConfig.enabled=false`→NO_OP) | Var; izinler coarse |
| Authority matrix | `src/nervous/authority-matrix.ts` (ADR-037; `ENFORCE_RBAC_CONFIG_KEY` `:197`, default false) | Advisory |
| Capability broker | `src/core/capability-broker.ts` — `ROLE_CAPABILITY_MAP` (`:33-45`): viewer/developer/operator/admin → `[fs-read, erp-read, erp-write, shell, …]`; `enforceLeastPrivilege?` (default-off), `emitDenied?` hook | Var; rol→capability zemini hazır |
| Tenant context | `src/core/tenant-context.ts` — `resolveTenant` (`:37-55`, env→config→`'local'`), `withTenant` (`:68-75`), `AsyncLocalStorage` (`:61`) | Var |
| API principal | `src/api/auth-me-endpoint.ts` — `RequestPrincipal{id,role?,tenantId?,claimsVerified?}` (`:64-83`), `roleFromClaims` (`:44-59`), tenant claim (`:128`) | Var (yalnız API yolu) |
| Connector kimlik yüzeyi | `src/connectors/types.ts` — `IncomingMessage{connector, fromUser, channelId, …}` (`:15-30`); Telegram `fromUser=String(ctx.from.id)` (`telegram.ts:144`), Discord `msg.author.id` (`discord.ts:39`), WhatsApp scaffold | Yalnız `(connector, fromUser, channelId)`; e-posta/username yok |
| Kanal-gate (BOT-002) | `src/connectors/incoming-command-router.ts` — `authorized = new Set(authorizedChatIds)` (`:99`), `if (!authorized.has(m.channelId)) return;` (`:115`, sessiz drop), `onChat(m.channelId, m.text)` (`:122`) | **Per-channel**, per-user değil; `fromUser` kullanılmıyor |
| Gateway gate | `gateway/gateway-router.ts` — `isAuthorized(chatKey, projectPath)` (`:13`), `:47` sessiz drop; `chatKeyOf=`${connector}:${channelId}`` (`:20-21`) | Per-chatKey |
| Gateway access | `gateway/gateway-access.ts` — allowlist `Record<projectPath, chatKey[]>` (`:43`), pairing `requestPairing/approvePairing` (`:60-76`) | Per-project, per-chatKey ACL |
| Capability policy | `connectors/capabilities/policy.ts` — `perChat[chatKey][capId]` → global → default (`:14-15`) | Per-chat/global; **rol-bazlı değil** |
| Agentic chat | `connector-bootstrap.ts` — `onChat(channelId, text)` (`incoming-command-router.ts:60`), kimlik **geçmiyor** | Gap |
| Connector config | `core/config-types.ts` — `notify_connectors{telegram,discord:{enabled,token,chat_id}}` (`:335-341`); `chat_id` tekil string | Tek-chat, liste değil |

### Boşluk özeti (kapatılacak)
1. `(connector, fromUser)` → `(userId, rol, tenant)` **kimlik eşlemesi yok**.
2. Yetki **kanal-bazlı**, kişi-bazlı değil.
3. Agent turn'üne **kimlik geçmiyor** (`onChat(channelId, text)`).
4. Capability policy kanal/global, **rol-bazlı değil**.
5. Mesajlaşmada **tenant scoping yok**.

---

## 3. Çekirdek abstraction — Pluggable Identity/Directory Provider

**Yer:** `src/connectors/identity/` (ayrı core modülü değil; social alanın içinde). Deckent'in mevcut port/adapter desenini izler (`providers/` LLM, `connectors/` mesajlaşma).

### 3.1 Port

```ts
// src/connectors/identity/provider.ts
type ExternalRef = {
  connector: ConnectorId;
  externalId: string;
  kind: 'telegram-id' | 'discord-id' | 'phone' | 'email' | 'slack-id';
};

interface ResolvedPrincipal {
  userId: string;
  role: Role;                 // 'admin' | 'operator' | 'viewer' | guest-rol
  permissions: string[];      // 'resource:action' token'ları (role-map'ten türetilir)
  tenantId: string;
  verified: boolean;
  source: string;             // hangi provider çözdü (audit)
}

interface IdentityDirectoryProvider {
  id: string;                 // 'local' | 'csv' | 'scim' | 'oidc-claims'
  edition: Edition;           // 'solo' | 'team' | 'enterprise'
  resolve(ref: ExternalRef): ResolvedPrincipal | null;  // 🔥 HOT PATH — saf local, network YOK
  sync?(): Promise<SyncReport>;        // out-of-band: IdP'den user+group çek → local store
  exportBundle?(): IdentityBundle;     // portability/audit
  importBundle?(b: IdentityBundle): void;
}
```

### 3.2 Hız modeli (Alperen'in "son derece hızlı" şartı — belkemiği)
- Inbound mesaj hot-path'i **asla** IdP'ye network çağrısı yapmaz. `resolve()` = in-memory cache + local SQLite O(1) lookup.
- Tüm IdP senkronizasyonu **out-of-band**: background `sync()` local store'u doldurur (scheduled veya webhook). Mesaj geldiğinde yalnız local'e bakılır.
- Güvenlik ihlali yok: nihai karar yine tool/capability execution anında `can()` (§5 L2).

### 3.3 Microsoft/Teams/Okta sorusunun cevabı (rol ingest'i)
- `scim` / `oidc-claims` adapter'ı arka planda Entra ID / Teams grup üyeliklerini, Okta/Google SCIM 2.0 kullanıcılarını çeker.
- **RoleMap** (config) dış-grubu deckent rol+iznine normalize eder: `Entra group "Sales-Operators" → operator`, `Teams "Finance" → {role: viewer, permissions:[invoice:read]}`.
- İçeri-alma = normalize-edip-local-store'a-yazma. Dışarı-verme = `exportBundle()` (taşınabilirlik + audit + temiz-repo migration ile uyumlu).
- Yeni IdP (Workday, JumpCloud…) → yeni adapter, çekirdek değişmez.

### 3.4 Solo-developer + müşteri senaryosu (aynı kod-yolu)
- Solo dev = `local` provider, owner principal = full; IdP gerekmez.
- Müşterisini Slack/Telegram grubuna alır → grup `{tenant: solo-dev, project: X}`'e bind. Müşteri o kanala scoped **guest principal** alır (`order:read` evet; `shell`/`erp:write` hayır). Microsoft hesabı gerekmez; local guest-rol yeter.
- Aynı `resolve()` portu: solo'da `local`, enterprise'da `scim`/`oidc-claims` döner. Edition yalnız takılı adapter'ı değiştirir; akış değişmez.

### 3.5 externalId çoklu-anahtar
Telefon (E.164) · doğrulanmış e-posta · platform-id üçü de desteklenir. Hangisinin "anahtar" olduğu connector'a göre: WhatsApp=telefon, Slack=e-posta, Telegram/Discord=platform-id. Bir principal **çok ExternalRef** bağlayabilir (many-ref → one-principal).

---

## 4. Modül planı + veri akışı

### 4.1 Yeni: `src/connectors/identity/`
| Dosya | Sorumluluk | Faz |
|---|---|---|
| `provider.ts` | Port + tipler (`IdentityDirectoryProvider`, `ExternalRef`, `ResolvedPrincipal`, `IdentityBundle`, `SyncReport`) | 1 |
| `identity-store.ts` | SQLite-backed local store + in-memory cache; tablo `social_identity(connector, external_id, principal_id, tenant_id, verified, method, ts)` | 1 |
| `principal-resolver.ts` | `IncomingMessage` + channel-binding → `ResolvedPrincipal \| unknown`; `withTenant` scoping | 1 |
| `role-map.ts` | Dış grup/claim → deckent rol+izin normalizasyonu (config-driven) | 1 |
| `verify-bind.ts` | Bir-defalık doğrulama (e-posta OTP / OIDC magic-link) → social-id ↔ principal | 1 |
| `providers/local.ts` | Solo owner + guest principal'lar (zero-network) | 1 |
| `providers/csv.ts` | Team import/export (CSV/JSON bundle) | 2 |
| `providers/scim.ts` | Enterprise SCIM 2.0 (Okta/Entra/Google) — **tasarlı seam** | 3 |
| `providers/oidc-claims.ts` | Entra/Teams grup claim'leri → rol — **tasarlı seam** | 3 |
| `index.ts` | Provider registry + factory (edition/config → adapter) | 1 |

### 4.2 Genişletilen (mevcut dosyalar, cerrahi)
- `connectors/gateway/gateway-access.ts` → channel-binding'e `{tenantId, projectPath, mode}` eklenir.
- `connectors/types.ts` → yeni `TurnContext{channelId, fromUser, principal, tenant}` (IncomingMessage **değişmez**).
- `connectors/incoming-command-router.ts` → gate kanal-bazlıdan kişi-bazlına: resolve principal, sonra karar.
- `connectors/connector-bootstrap.ts` → resolver wire; `onChat(channelId,text)` → `onChat(turnContext)`.
- `core/rbac.ts` → mevcut rol katmanının üstüne `resource:action` izin seti + `can(role, 'resource:action', tenant)`.
- `core/config-types.ts` → identity config şeması (§6).

### 4.3 Yeniden kullanılan (yeniden icat yok)
`tenant-context.ts` (`withTenant`) · `rbac.ts` (`can()`, `AuditContext`/`writeAuditEvent`) · `capability-broker.ts` (`ROLE_CAPABILITY_MAP` + per-tool gate) · `memory-store` SQLite helper deseni.

### 4.4 Uçtan-uca veri akışı — "sipariş #123 durumu?" (firmaX grubu)
```
1. Telegram grup -100123, gönderen telegram:55, text="sipariş #123 durumu?"
2. Connector → IncomingMessage{telegram, fromUser:'55', channelId:'-100123', text}
3. router: acceptFrom guard → channel-binding lookup('telegram:-100123')
        → {tenant:firmaX, project:erp, mode:tenant-locked}   (yoksa → pairing/silent)
4. withTenant(firmaX): provider.resolve({telegram, '55', 'telegram-id'})
        → ResolvedPrincipal{ali, operator, perms:[order:read,order:write,invoice:read], verified}
        (null → unknown → DM '/verify', rate-limited, anti-oracle)
5. turnContext{channelId, fromUser:55, principal:ali, tenant:firmaX} → onChat(turnContext)
6. Agent turn (withTenant firmaX) → erp.getOrder(123) tool çağırır
7. tool-gate: getOrder needs order:read → can(ali, order:read, firmaX)=OK → çalışır → cevap ✅
```
**Karşı-örnekler (deterministik):**
- `telegram:99` = veli, viewer, perms=[order:read]. "siparişi iptal et" → `erp.cancelOrder` needs `order:write` → `can(veli, order:write, firmaX)`=**DENY** → bot: getMessage('rbac.unauthorized', …, {perm:'order:write'}) + audit.
- `telegram:77` firmaX dizininde yok → resolve=null → bot **DM'e** "/verify" (gruba değil; anti-oracle, rate-limited) ya da kanal policy'sine göre sessiz.

---

## 5. Güvenlik & edge-case'ler

### 5.1 İki ayrı güven sınırı (anti-oracle)
| Durum | Davranış | Neden |
|---|---|---|
| Kanal **bound** + gönderen **resolve** ama izni yok | **Açık "yetkisiz (X gerekiyor)"** + audit | Zaten güven sınırı içinde; net feedback hakkı |
| Kanal **bound** ama gönderen **resolve değil** | **DM'e** "/verify" (gruba değil), **rate-limited** | Grubu kirletme + enumeration engeli |
| Kanal **unbound** (rastgele grup) | **Sessiz** (mevcut `incoming-command-router.ts:115` davranışı korunur) | Oracle yok — yabancı projenin varlığını öğrenemez |

"Yetkisiz de" yalnız **tanınan üye** için; yabancıya bilgi sızdırmaz.

### 5.2 Spoofing / trust modeli
- Anahtar **daima değişmez platform-id** (Telegram numeric id, WhatsApp telefon, doğrulanmış e-posta); **asla display-name**.
- Asıl risk = platform-handle'ı yanlış principal'a bağlamak → **verify-bind** kapatır (kullanıcı principal kontrolünü kanıtlar). Enterprise'da SCIM/OIDC authoritative (`email_verified`).
- Bot'u kötü gruba ekleme → kanal unbound → tenant yok → capability yok. Binding admin pairing gerektirir.
- Telefon recycle → directory-change → re-verify.

### 5.3 verify-bind akışı
```
User (grup/DM) → /verify
Bot → DM tek-kullanımlık:
  (a) e-posta OTP: e-posta iste → kod gönder → doğrula → bind{verified, method:otp, ts}
  (b) OIDC magic-link: link → IdP giriş → callback → bind{role,tenant claim'lerden, verified}
Saklama: (connector,id) ↔ principal, verified + method + ts
Re-verify: TTL dolunca / directory-change
Anti-abuse: (connector,externalId) başına rate-limit; OTP kısa TTL
```

### 5.4 Fail-closed (kritik default)
Resolver/store erişilemez, binding belirsiz, tenant çözülemiyor → **DENY**. Asla fail-open.

### 5.5 Audit
Mesaj-yüzeyindeki her allow/deny → audit event (`rbac.ts` `AuditContext`/`writeAuditEvent` yeniden kullanılır): kim, hangi izin, tenant, karar, sebep. Enterprise compliance.

### 5.6 Hard-block — yeni ADR-092
ADR-037 worker-RBAC runtime'ı advisory (bloke etmez). Bu yüzey farklı: dış kullanıcı gerçek iş tetikliyor → **fail-closed / hard-block**. Yeni **ADR-092: "Connector-Surface Social-Identity↔RBAC Authorization (fail-closed)"** — worker-içi advisory korunur, mesajlaşma-yüzeyi hard enforce.

---

## 6. Config şeması (`core/config-types.ts` eklemeleri)
```ts
identity?: {
  edition?: 'solo' | 'team' | 'enterprise';            // default 'solo'
  providers?: Array<ProviderConfig>;                   // sıralı resolve zinciri
  roleMap?: Record<string, { role: Role; permissions?: string[] }>;  // dış-grup → deckent
  channels?: Record<ChatKey, {
    tenantId: string; projectPath: string;
    mode: 'tenant-locked' | 'per-user'; guestRole?: Role;
  }>;
  verify?: { method: 'otp' | 'oidc'; otpTtlSec: number; rateLimit: number };
  enforcement?: 'hard' | 'advisory';                   // connector-surface default 'hard'
};
```
- `rbac.ts`: izinler `'resource:action'` token'ı (`order:read`); rol → izin seti; `can(role, 'order:read', tenant)`.
- Her capability/tool `requiredPermission?` deklare eder (`erp.getOrder → 'order:read'`); `capability-broker` kontrol eder.
- Tüm secret/token `$DECK:` referansı (mevcut deck-interpolation deseni).

---

## 7. Enforcement (defense-in-depth) + faz sırası

### 7.1 Katmanlar
| Katman | Nerede | Karar | Otoritatif? |
|---|---|---|---|
| L0 — Channel gate | `incoming-command-router` (genişletilmiş) | chatKey→binding; unbound=sessiz | Sınır |
| L1 — Resolve + fast pre-filter | `principal-resolver` | sender→principal/unknown; ucuz niyet→izin ön-kontrol (anında "yetkisiz", turn başlatmadan) | Hayır (UX/hız) |
| **L2 — Tool/capability gate** 🔒 | `capability-broker` (execution anı) | her tool `can(principal, requiredPerm, tenant)` | **EVET (fail-closed)** |
| L3 — Audit | `rbac.ts` writeAuditEvent | her allow/deny loglanır | — |

Hız L1'den, güvenlik L2'den. L1 güvenilmez (NL yanlış-sınıflandırabilir); **L2 nihai karardır** (tool seviyesinde, deterministik).

### 7.2 Faz sırası (no-MVP: mimari tam, implementasyon dilimli)
- **Faz 1 — yük-taşıyan çekirdek:** identity-store + `local` provider + resolver + channel-binding(tenant) + TurnContext wire + rbac `resource:action` + **L2 tool-gate fail-closed** + verify-bind(OTP) + audit + **ADR-092**. → Solo + team-manual + solo-dev+müşteri senaryosu çalışır. **Telegram önce**, port cross-connector.
- **Faz 2:** `csv` import/export, guest-rol UX, Discord/Slack/WhatsApp parite, rate-limit cilası.
- **Faz 3:** `scim` + `oidc-claims` (Entra/Teams/Okta/Google) + background `sync()` + SCIM webhook + enterprise audit export.

---

## 8. Test · i18n · cross-platform (Yasa #2)
- **i18n-first:** tüm kullanıcı-görünür string (`rbac.unauthorized`, `identity.verify_prompt`, `identity.bound_ok`, `identity.verify_rate_limited`…) `getMessage(key, lang)` (en/tr) üzerinden; mekanizma modülleri string-free, label caller'dan, İngilizce default. Hardcode yok.
- **Test (hermetik):** tmpdir SQLite store; provider'lar mock IdP fixture'larıyla; `resolve()` hot-path unit + `can()` izin-matrisi + fail-closed (store-down→deny) + verify-bind OTP/TTL/rate-limit + audit-emit assert. Async spawn, `spawnSync` yok, CI yeşil (`test:ci-sim`).
- **Proof-of-function (Tier-1):** connector-surface user-facing → gerçek-binary smoke (`Smoke:` direktifi): Telegram'da bound grupta yetkili "OK", yetkisiz "yetkisiz", unknown→DM-verify — run-proven.
- **Cross-platform:** store yolu `.deckent/` altında mevcut path-adapter ile (macOS·Linux·Win-native·WSL); OS-özel kod yok. Connector adapter'ları zaten cross-platform.

---

## 9. Açık riskler / dikkat
- **WhatsApp connector scaffold** (`whatsapp.ts`, Sprint 150) — telefon-anahtarı için aktif edilmesi Faz 2 bağımlılığı.
- **ADR-037 advisory vs ADR-092 hard** ayrımı net dokümante edilmeli; iki RBAC kararı karıştırılmamalı (worker-içi ≠ connector-yüzeyi).
- **Rate-limit + OTP store** persistly multi-process güvenli olmalı (gateway daemon + bot daemon ayrı process olabilir) — paylaşımlı SQLite/lock deseni.
- **Mevcut silent-oracle prensibi** (`incoming-command-router.ts:112-115`) bozulmamalı: unbound kanal sessiz kalır.

---

## 10. Sıradaki adım
`writing-plans` ile implementasyon planı (Faz 1 dilimi: mikro-task + `- Dependencies:` grafiği + per-task goCriteria + Smoke direktifleri). Spec Alperen onayından sonra.

---

## 11. Plan-B'ye taşınan ZORUNLU gereksinimler (Plan A final whole-branch review çıktısı — 2026-06-26)

Plan A (engine) merge-ready onaylandı (33/33 test, sıfır Critical, fail-open yok). Aşağıdaki maddeler **headless engine'de merge-blocker değil** ama **Plan B (connector wiring) içinde açıkça karşılanmalı** — aksi halde wiring katmanı bunları sessizce devralır:

**Important (Plan-B'de mutlaka):**
1. **throw-vs-`null` caller kontratı** — `resolvePrincipal` `| null` döner AMA `withTenant`→`resolveTenant` geçersiz `binding.tenantId`'de (`tenant-context.ts:46`) ve `store.getIdentity` DB-hatasında **throw** eder (ikisi de fail-closed). Plan-B caller bu çağrıyı `try/catch` ile sarmalı ve exception'ı **deny** saymalı; malformed channel-binding / kilitli-DB turn'ü crash etmesin.
2. **Cache coherence + bounding (multi-process)** — `IdentityStore` cache'i (`identity-store.ts`) yalnız aynı-instance write'larında invalidate olur. Gateway+bot ayrı process (spec §9): (a) revocation/downgrade sonrası **stale-allow** riski; (b) negatif (unknown-sender) cache **sınırsız büyüme** (DoS). Plan-B: paylaşımlı invalidation kanalı veya kısa TTL + LRU/size-cap.
3. **`confirmVerify` tenant assertion** — ✅ **Plan A'da eklendi** (`pending.tenantId !== binding.tenantId` → `tenant-mismatch`, pending silinir). (Final-review #3 kapatıldı.)

**Minor / hardening (Plan-B'de değerlendir):**
- **OTP hash** — `pending_verify.code` cleartext saklanıp karşılaştırılıyor (transient+TTL+lockout ile savunulabilir ama enterprise-grade için hash'lenmeli).
- **crypto genCode** — Plan-B `genCode` injection'ı crypto-secure olmalı (yeterli uzunluk; `Math.random` DEĞİL).
- **guest least-privilege** — guest default `*:read` (tüm kaynak okuma); spec §3.4 örneği `order:read` istiyordu. Plan-B UX'i scoping `roleMap` ayarlamaya yönlendirmeli veya default'u daraltmalı.
- **owner perms** — ✅ Plan A'da `['*']` koşulsuz yapıldı (role-map admin'i daraltsa bile owner=full).
- **`source` taksonomisi** — `ResolvedPrincipal.source` `'local'`/`'guest'`/`'otp'` karışık taşıyor; audit netliği için tek taksonomi.
- **start-rate-limit (M1)** — `startVerify` re-send'de lockout sıfırlar (`putPendingVerify` ON CONFLICT attempts=0); gateway `(connector,externalId)` başına `startVerify`'ı rate-limit etmeli (§5.3 ile uyumlu, brute-force amplification engeli).
- **prepared-statement pre-compile** — `IdentityStore` hot-path için statement'ları constructor'da derleyebilir (memory-store.ts deseni).
