# DIRECTIVES — Sprint 265: Enterprise Read-Side Depth (ERP wake + SIEM transports + OIDC/JWKS)

## Goal: ENT-5 ve ERP-1'in kalan boşluklarını KOD ile kapat: (1) ERP connector'ı F8 capability yoluna uyandır (`erp.read` handler + runtime wiring + in-memory referans driver), (2) SIEM forwarder'a GERÇEK network transport'lar (HTTP POST + RFC5424 syslog) + `audit forward --url` canlı wire, (3) OIDC derinliği: JWKS fetch/key-resolver + embedded-terminal `OidcAuthProvider` (spec §1d rezerve slot). Tümü test-first, default-off/opt-in, ADR-010 (yeni dep YOK — node built-ins).

## Ortak kurallar
- **TDD:** önce test (RED), sonra implementasyon. Her task kendi `tests/` dosyasını da yazar (scope'ta var).
- **Hermetik test:** tmpdir, injectable fetch/socket/driver — GERÇEK ağ/disk-dışı I/O test'te YASAK. spawnSync YASAK.
- **Self-verify TARGETED:** yalnız kendi test dosyanı koş (`npx vitest run <kendi-testin>`) + tsc'de YALNIZ kendi dosyalarının hatasına bak — paylaşılan working-tree'de BAŞKA task'ın yarım dosyasından gelen tsc hatası NO_GO sebebi DEĞİL (notes'a yaz, geç). Full-suite KOŞMA (Sprint 257 dersi).
- **ADR-008:** core/ → orchestra/ import YASAK. **ADR-010:** yeni runtime dependency YASAK (node:crypto, node:dgram, node:net, fetch built-in).
- **i18n:** user-facing string yalnız Task 2'de var → `getMessage` (en/tr). core modüller string-free (error mesajları İngilizce teknik metin serbest, mevcut pattern).
- Mevcut pattern'leri izle: `CapabilityHandler` sözleşmesi (`capability-broker.ts`), transport sözleşmesi (`siem-forwarder.ts` → `(batch: SiemRecord[]) => Promise<void>`, hata→throw→forwarder retry'lar), `AuthProvider` interface (`api/terminal/auth-provider.ts`).
- **`.tasks/task-XXX.result` YAZ.** Kanıt komutlarını gerçekten koş.

---

## Task 1: ERP capability wake — erp.read handler + runtime wiring + referans driver
- Provider: claude
- Model: fable
- Backend: docker
- Effort: high
- Agent: api-builder
- Skills: typescript-expert, testing-expert
- Files: src/core/capability-handlers-erp.ts, src/core/capability-runtime.ts, tests/core/capability-handlers-erp.test.ts, tests/core/capability-runtime.test.ts
- Scope: src/core/, tests/core/

### Description
E12'yi uyandır (kaynaklar: `src/core/erp-connector.ts` — `ErpConnector`/`createErpConnector`/`ErpQuerySpec`/`ErpDriver`, `src/core/capability-broker.ts` — `CapabilityHandler`):
1. **YENİ `src/core/capability-handlers-erp.ts`:**
   - `createErpReadHandler(opts: { connector: ErpConnector })` → `CapabilityHandler` (requiredCapability `'erp.read'`): `args`'tan `ErpQuerySpec`'i doğrula (entity string zorunlu; filters/fields/limit opsiyonel — şekil bozuksa açıklayıcı throw → broker `CAPABILITY_FAILED`'a çevirir) ve `connector.query(spec)` sonucunu döndür. Connector'ın kendi read-only/allow-list/mutasyon-reddi koruması zaten var — YENİDEN yazma (SSOT).
   - `createInMemoryErpDriver(tables: Record<string, ErpRow[]>)` → `ErpDriver`: CompiledQuery'yi in-memory satırlara uygular (eq/ne/gt/gte/lt/lte/in/like predicate'leri + field seçimi + limit). Referans/test driver'ı — gerçek SAP/Odoo driver'ları sonraki iş.
   - `installErpHandler(registry, opts)` — `'erp.read'` adıyla register.
2. **`src/core/capability-runtime.ts` EDİT (surgical):** `CapabilityRuntimeOptions`'a `erp?: { connector: ErpConnector }` ekle; verildiğinde `installErpHandler` çağır (audit-bridge sarması mevcut emit döngüsünden otomatik gelir). Verilmediğinde davranış AYNEN bugünkü (backward-safe).
3. Testler: handler arg-validation (bozuk entity → failed), query round-trip (in-memory driver + registerEntity'li connector), runtime'da erp opsiyonu verilince `reg.has('erp.read')` true + audit emit'in erp invocation'da çalıştığı; verilmeyince `has('erp.read')` false.

**Kanıt:** `grep -n "installErpHandler" src/core/capability-runtime.ts` (tüketim kanıtı — tanım dosyası DEĞİL) && `npx vitest run tests/core/capability-handlers-erp.test.ts tests/core/capability-runtime.test.ts` yeşil. **Test:** 8+ (validation, round-trip, predicate'ler, wiring on/off, audit-emit).

---

## Task 2: SIEM HTTP transport + `audit forward --url` canlı wire
- Provider: claude
- Model: fable
- Backend: docker
- Effort: high
- Agent: api-builder
- Skills: typescript-expert, testing-expert
- Files: src/core/siem-transport-http.ts, src/cli/commands/audit.ts, src/cli/helpers/messages.ts, tests/core/siem-transport-http.test.ts, tests/cli/audit-readside.test.ts
- Scope: src/core/, src/cli/, tests/core/, tests/cli/

### Description
Kaynaklar: `src/core/siem-forwarder.ts` (transport sözleşmesi + retry semantiği), `src/cli/commands/audit.ts` (`runSiemExport`, `forward` subcommand).
1. **YENİ `src/core/siem-transport-http.ts`:** `createHttpSiemTransport(opts: { url: string; headers?: Record<string,string>; fetchImpl?: ... })` → `(batch: SiemRecord[]) => Promise<void>`. POST, `content-type: application/json`, gövde = batch JSON array. Non-2xx → `throw` (forwarder'ın retry/drop mekanizması üstlenir — transport içinde retry YOK, çifte-retry olmasın). `fetchImpl` injectable (hermetik test); default `globalThis.fetch` (yoksa açıklayıcı throw). URL http/https doğrula.
2. **`src/cli/commands/audit.ts` EDİT (surgical):** `forward` subcommand'a `--url <url>` opsiyonu: verilirse `runSiemExport` yerine HTTP yolu — `readAuditEvents` → forwarder(`transport: createHttpSiemTransport({url})`, flushEvery:0) → forward+flush+dispose; başarı çıktısı yeni i18n anahtarıyla (`audit.forward.sent` örn. "Forwarded {count} record(s) → {url}"). `--out` ile `--url` birlikte verilirse `--url` öncelikli olduğunu help'te belirt (veya ikisini de yap — basit olanı seç ve belgele). Mevcut `--out` yolu AYNEN kalır.
3. i18n: yeni anahtar(lar) en/tr (`src/cli/helpers/messages.ts`).
4. Testler: transport (2xx ok / 5xx throw / bozuk url throw / header geçişi — mock fetch) + CLI helper seviyesinde http yolu (injectable fetch ile runSiemExport benzeri yeni helper'ı test et — helper'ı `runSiemHttpForward(root, sprintId, url, fetchImpl?)` olarak export et ki hermetik test edilebilsin).

**Kanıt:** `grep -n "createHttpSiemTransport" src/cli/commands/audit.ts` (tüketim) && `npx vitest run tests/core/siem-transport-http.test.ts tests/cli/audit-readside.test.ts` yeşil. **Test:** 6+.

---

## Task 3: SIEM syslog transport (RFC5424, injectable socket)
- Provider: claude
- Model: fable
- Backend: docker
- Effort: normal
- Agent: api-builder
- Skills: typescript-expert, testing-expert
- Files: src/core/siem-transport-syslog.ts, tests/core/siem-transport-syslog.test.ts
- Scope: src/core/, tests/core/

### Description
**YENİ `src/core/siem-transport-syslog.ts`:** `createSyslogSiemTransport(opts)` → `(batch: SiemRecord[]) => Promise<void>`.
- RFC5424 mesaj formatı: `<PRI>1 TIMESTAMP HOSTNAME APP-NAME PROCID MSGID SD MSG` — PRI = facility(default 13/log audit uygun bir değer seç + belgele)*8 + severity(info=6); APP-NAME default `deckent`; MSG = SiemRecord JSON'u. Her record bir mesaj.
- `opts`: `host`, `port` (default 514), `protocol: 'udp' | 'tcp'` (default udp), `facility?`, `appName?`, ve **`sendImpl?`** (injectable: `(messages: string[]) => Promise<void>`; default impl `node:dgram` (udp) / `node:net` (tcp, newline-framed) — gerçek soket YALNIZ default impl'de, testte daima `sendImpl`).
- Gönderim hatası → throw (forwarder retry'lar). UDP fire-and-forget'ta send callback'inin error'unu promise'e bağla.
- Testler hermetik: `sendImpl` ile mesaj formatını assert et (PRI doğru, RFC5424 alan sırası, JSON payload), udp/tcp default'ların seçimi (sendImpl verildiğinde soket AÇILMAZ), hata propagasyonu.

**Kanıt:** `npx vitest run tests/core/siem-transport-syslog.test.ts` yeşil; `grep -c "sendImpl" tests/core/siem-transport-syslog.test.ts` ≥ 3 (hermetiklik kanıtı). **Test:** 6+. NOT: CLI wire'ı bu sprintte YOK (Task 2'nin --url'ü http; syslog CLI wire follow-up) — bunu .result notes'a dürüstçe yaz.

---

## Task 4: JWKS fetch + RS256 key resolver
- Provider: claude
- Model: fable
- Backend: docker
- Effort: high
- Agent: security-auditor
- Skills: security-specialist, typescript-expert
- Files: src/core/auth-jwks.ts, tests/core/auth-jwks.test.ts
- Scope: src/core/, tests/core/

### Description
ENT-5 "JWKS fetch follow-up"ını kapat (kaynak: `src/core/auth-oidc.ts` — `verifyJwt`/`VerifyOptions`/`JwtAlgorithm`; dosyanın başındaki "JWKS fetch is a documented follow-up" notu). **YENİ `src/core/auth-jwks.ts`** (auth-oidc.ts'i EDİT ETME — read-only kaynak):
1. `fetchJwks(url, fetchImpl?)` → `{ keys: Jwk[] }`: HTTPS-only doğrula (http reddet — token key'leri düz metin taşınmaz), non-2xx/bozuk-JSON/keys-array-yok → açıklayıcı throw. `fetchImpl` injectable.
2. `createJwksKeyResolver(opts: { jwksUrl: string; fetchImpl?; cacheTtlMs?: number (default 300_000); clock?: () => number })` → `{ resolve(kid: string): Promise<string> }`: JWKS'i TTL-cache'le; `kid` eşleşen **RS256/RSA** JWK'yı `node:crypto createPublicKey({ key: jwk, format: 'jwk' })` ile PEM (spki) string'e çevir (verifyJwt'nin beklediği key biçimini auth-oidc'den DOĞRULA ve ona uy). kid bulunamazsa: cache bayatsa BİR kez yeniden fetch (key-rotation), yine yoksa throw. `alg`'ı 'RS256' olmayan / `kty` RSA olmayan key'leri ELEME (algorithm-confusion koruması — auth-oidc'deki mevcut korumayla tutarlı).
3. `verifyJwtWithJwks(token, opts: OidcConfig benzeri + resolver)` convenience: token header'dan `kid` parse et (base64url decode, alg=RS256 zorunlu — `none`/HS256 reddet), resolver'dan key al, `verifyJwt(token, { ...opts, algorithm: 'RS256', key })` çağır (auth-oidc'yi TÜKET, yeniden-implementasyon YOK — SSOT).
4. Testler hermetik (mock fetch + `node:crypto generateKeyPairSync` ile gerçek RSA çifti üret, JWK export et, gerçek RS256 token imzala): geçerli token doğrulanır; yanlış kid → throw→refetch→rotation senaryosu; HS256/alg:none token reddi; http URL reddi; TTL cache (clock injektle — ikinci resolve fetch ÇAĞIRMAZ).

**Kanıt:** `grep -n "verifyJwt" src/core/auth-jwks.ts` (auth-oidc tüketimi) && `npx vitest run tests/core/auth-jwks.test.ts` yeşil. **Test:** 8+.

---

## Task 5: Embedded-terminal OidcAuthProvider (spec §1d rezerve slot)
- Provider: claude
- Model: fable
- Backend: docker
- Effort: normal
- Agent: security-auditor
- Skills: security-specialist, typescript-expert
- Files: src/api/terminal/auth-provider.ts, tests/api/terminal/auth-provider-oidc.test.ts
- Scope: src/api/, tests/api/

### Description
`src/api/terminal/auth-provider.ts`'teki interface yorumu OIDC impl'ini açıkça rezerve ediyor ("Future enterprise impls (OIDC, SSO, mTLS) plug in behind the same interface"). Ekle (kaynak: `src/core/auth-oidc.ts` `verifyJwt`/`VerifyOptions`):
1. `OidcAuthProvider implements AuthProvider`: ctor `opts: { issuer: string; audience?: string; algorithm: 'HS256'|'RS256'; key: string; clock?: () => number }` → `verify(presented)` = presented JWT'yi `verifyJwt` ile doğrula (`valid === true` → true). undefined/boş → false. **`DECKENT_API_AUTH_DISABLED`'ı LocalTokenAuthProvider gibi BİLEREK yok say** — terminal asla bypass edilmez (mevcut güvenlik invariantı, dosyadaki yorumu koru/uygula).
2. `verify` SENKRON (interface öyle) — bu yüzden ctor STATİK key alır; JWKS-resolver'lı async akış follow-up (notes'a yaz; Task 4'ün resolver'ı burada KULLANILMAZ — interface senkron).
3. Mevcut `LocalTokenAuthProvider`'a DOKUNMA (surgical ekleme).
4. Testler: gerçek HS256 token (node:crypto hmac) ile valid→true; yanlış issuer/audience/imza→false; undefined/boş→false; süresi geçmiş token (exp, clock inject)→false.

**Kanıt:** `grep -n "class OidcAuthProvider" src/api/terminal/auth-provider.ts` && `npx vitest run tests/api/terminal/auth-provider-oidc.test.ts` yeşil. **Test:** 6+.

---

## Task 6: features.md sahte auto-gen başlığı düzelt (Sprint 264 worker bulgusu)
- Provider: claude
- Model: fable
- Backend: docker
- Effort: low
- Agent: doc-writer
- Skills: documentation-writer
- Files: docs/reference/features.md
- Scope: docs/reference/

### Description
Sprint 264 doğrulanmış bulgu: `docs/reference/features.md` başlığı "Auto-generated from .deckent/features-manifest.json. Run node scripts/sync-manifest.mjs to regenerate" iddia ediyor ama BU DOSYAYI yazan script YOK (scripts/ ve src/ tarandı; .deckent/docs.json da yönetmiyor) — dosya el-bakımlı. Başlığı gerçeğe çevir: el-bakımlı olduğunu, manifest'in `.deckent/features-manifest.json` olduğunu ve İLGİLİ script'in ne yaptığını (varsa sync-manifest.mjs'in GERÇEK davranışını oku-doğrula) doğru anlat. İçeriğin geri kalanına DOKUNMA.

**Kanıt:** `grep -ciE "hand-maintained|manually" docs/reference/features.md` ≥ 1 && sahte "Auto-generated from" iddiası kalktı. **Test:** yok (doc-only) — .result YAZ.

---

**Beklenen:** 6 task (5 kod + 1 doc-fix), hepsi claude-fable-5/docker, tek-wave dosya-çakışması YOK (her dosyanın tek yazarı var; Task 1-5 birbirinin dosyasına dokunmaz). CC sprint sonu: tsc + 5 yeni test dosyası + mevcut autonomous/audit regresyonu + `git diff` güvenlik incelemesi (Task 4-5 security-sensitive) + dokümantasyon follow-up'ı (enterprise-integrations.md) CC/sonraki-sprint.
